const { z } = require('zod');
const { withTransaction } = require('../db/transaction');
const { logger } = require('../logger');
const rules = require('../config/rules');
const { toChargingSession } = require('./chargingSessions');
const notify = require('./notify');

// Engine suy ra phiên sạc từ bản tin thiết bị — đặc tả: docs/LUONG_NGHIEP_VU.md mục 7-8,
// docs/contracts.md mục 1. Tách khỏi kết nối MQTT để test gọi thẳng, không cần broker.
//
// Nguyên tắc:
// - Mọi trạng thái tính theo giờ server (tham số `now`); giờ thiết bị chỉ lưu telemetry.recorded_at.
// - Khoá dòng ports (FOR UPDATE) mỗi bản tin -> các bản tin cùng cổng xử lý tuần tự ở tầng DB;
//   thao tác HTTP lên phiên (check-in gắn phiên, đóng tay) dùng UPDATE có điều kiện nên không giẫm nhau.
// - Không đủ bằng chứng thì không gán tiền: phiên chỉ gắn booking check-in trong 15' trước đó.

const { MINUTE_MS } = rules;

const payloadSchema = z.object({
  stationId: z.string().trim().min(1).max(50),
  portId: z.number().int().positive(),
  status: z.enum(['idle', 'charging', 'fault']),
  powerKw: z.number().min(0).max(rules.MAX_PORT_POWER_KW + 0.5).nullable().optional(),
  energyKwh: z.number().min(0).max(100000).nullable().optional(),
  temperature: z.number().min(-50).max(200).nullable().optional(),
  timestamp: z.string().nullable().optional(),
});

const round2 = (value) => Math.round(value * 100) / 100;

// Giờ thiết bị chỉ được tin khi lệch <= 5' so với server (NTP lỗi -> 1970, đồng hồ trôi...)
const resolveRecordedAt = (timestamp, now) => {
  if (!timestamp) return now;
  const device = new Date(timestamp);
  if (Number.isNaN(device.getTime())) return now;
  return Math.abs(device.getTime() - now.getTime()) <= rules.DEVICE_CLOCK_SKEW_MINUTES * MINUTE_MS ? device : now;
};

// Số phút bị tính phí chiếm chỗ của 1 đoạn công suất thấp liên tục: trừ 5' phát hiện + 15' ân hạn
const billableIdleMinutes = (idleSince, until) => {
  if (!idleSince) return 0;
  const minutes = Math.floor((until.getTime() - new Date(idleSince).getTime()) / MINUTE_MS);
  return Math.max(0, minutes - rules.IDLE_DETECT_MINUTES - rules.IDLE_GRACE_MINUTES);
};

const idleFeeFor = (minutes) => Math.min(minutes * rules.IDLE_FEE_PER_MIN, rules.IDLE_FEE_CAP);

// Điện năng tăng có hợp lý không (không vượt công suất tối đa × thời gian kể từ bản tin trước)
const isPlausibleIncrease = (delta, sinceTime, now) => {
  const hours = Math.max(now.getTime() - new Date(sinceTime).getTime(), 0) / (60 * MINUTE_MS);
  return delta <= rules.MAX_PORT_POWER_KW * hours + rules.ENERGY_TOLERANCE_KWH;
};

// Cọc còn lại của booking để trừ vào phiên này (cọc trừ dần qua các phiên của cùng booking)
const remainingDeposit = async (client, bookingId, sessionId) => {
  if (!bookingId) return 0;
  const { rows } = await client.query(
    `SELECT
       COALESCE((SELECT sum(p.amount) FROM payments p
                 WHERE p.booking_id = $1 AND p.purpose = 'booking_deposit'
                   AND p.status = 'success' AND p.refund_status IS NULL), 0) AS paid,
       COALESCE((SELECT sum(cs.deposit_applied) FROM charging_sessions cs
                 WHERE cs.booking_id = $1 AND cs.id <> $2), 0) AS used`,
    [bookingId, sessionId],
  );
  return Math.max(Number(rows[0].paid) - Number(rows[0].used), 0);
};

// Chốt phiên: tiền điện + phí chiếm chỗ, trừ cọc, đóng booking. Dùng chung cho thiết bị báo
// idle/fault và quản lý đóng tay. Cập nhật có điều kiện "ended_at IS NULL" -> null nếu phiên đã đóng.
const finalizeSession = async (client, session, { endedAt, finalEnergy, endReason, needsReview = false }) => {
  let idleMinutes = session.idle_minutes + billableIdleMinutes(session.idle_since, endedAt);
  let idleFee = idleFeeFor(idleMinutes);
  if (endReason === 'device_fault') {
    // Lỗi phía trạm -> không tính phí chiếm chỗ
    idleMinutes = 0;
    idleFee = 0;
  }
  const billed = Math.max(round2(finalEnergy - Number(session.energy_start_kwh)), 0);
  const energyCost = Math.round(billed * Number(session.unit_price));
  const cost = energyCost + idleFee;
  const depositApplied = Math.min(await remainingDeposit(client, session.booking_id, session.id), cost);

  const { rows } = await client.query(
    `UPDATE charging_sessions
     SET ended_at = $2, energy_kwh = $3, energy_cost = $4, idle_minutes = $5, idle_fee = $6, cost = $7,
         deposit_applied = $8, end_reason = $9, idle_since = NULL, needs_review = needs_review OR $10
     WHERE id = $1 AND ended_at IS NULL
     RETURNING *`,
    [session.id, endedAt, finalEnergy, energyCost, idleMinutes, idleFee, cost, depositApplied, endReason, needsReview],
  );
  if (!rows[0]) return null;
  if (session.booking_id) {
    await client.query("UPDATE bookings SET status = 'completed' WHERE id = $1 AND status = 'checked_in'", [
      session.booking_id,
    ]);
  }
  return rows[0];
};

// Booking được gắn tự động: đã check-in trên đúng cổng này trong 15' trước, chưa có phiên nào
const findAutoAttachBooking = async (client, portId, now) => {
  const { rows } = await client.query(
    `SELECT b.* FROM bookings b
     WHERE b.port_id = $1 AND b.status = 'checked_in' AND b.checked_in_at >= $2
       AND NOT EXISTS (SELECT 1 FROM charging_sessions cs WHERE cs.booking_id = b.id)
     ORDER BY b.checked_in_at
     LIMIT 1
     FOR UPDATE`,
    [portId, new Date(now.getTime() - rules.AUTO_ATTACH_WINDOW_MINUTES * MINUTE_MS)],
  );
  return rows[0];
};

const openSession = async (client, port, payload, now, events) => {
  const booking = await findAutoAttachBooking(client, port.id, now);
  const energy = payload.energyKwh ?? 0;
  // Bộ đếm của thiết bị không về 0 (vd online lại sau khi phiên đã bị đóng tay) -> lấy làm mốc
  const baseline = energy > rules.ENERGY_BASELINE_THRESHOLD_KWH ? energy : 0;
  const lowPower = payload.powerKw !== null && payload.powerKw !== undefined && payload.powerKw <= rules.IDLE_POWER_KW;
  const { rows } = await client.query(
    `INSERT INTO charging_sessions
       (booking_id, user_id, port_id, started_at, energy_kwh, energy_start_kwh, unit_price, needs_review, idle_since)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      booking?.id ?? null,
      booking?.user_id ?? null,
      port.id,
      now,
      energy,
      baseline,
      rules.UNIT_PRICE_PER_KWH,
      baseline > 0,
      lowPower ? now : null,
    ],
  );
  const session = rows[0];
  events.sessions.push(session);
  if (!booking) {
    events.alerts.push({
      type: 'unauthorized_session',
      portId: port.id,
      sessionId: session.id,
      message: `Cổng ${port.port_number} có người cắm sạc nhưng chưa check-in`,
    });
  }
};

const updateOpenSession = async (client, port, open, payload, now, events) => {
  let energy = Number(open.energy_kwh);
  let needsReview = open.needs_review;
  const reported = payload.energyKwh;
  if (reported !== null && reported !== undefined && reported > energy) {
    if (isPlausibleIncrease(reported - energy, port.last_seen_at ?? open.started_at, now)) {
      energy = reported;
    } else {
      needsReview = true; // tăng vô lý -> không nhận, chờ quản lý kiểm tra
      logger.warn({ sessionId: open.id, stored: energy, reported }, 'MQTT: điện năng tăng vô lý');
    }
  }

  let idleSince = open.idle_since;
  let idleMinutes = open.idle_minutes;
  const power = payload.powerKw;
  if (power !== null && power !== undefined && power <= rules.IDLE_POWER_KW) {
    if (!idleSince) {
      idleSince = now;
    } else {
      const sinceMs = new Date(idleSince).getTime();
      const prev = port.last_seen_at ? new Date(port.last_seen_at).getTime() - sinceMs : 0;
      const cur = now.getTime() - sinceMs;
      const fullAt = rules.IDLE_DETECT_MINUTES * MINUTE_MS;
      const feeAt = (rules.IDLE_DETECT_MINUTES + rules.IDLE_GRACE_MINUTES) * MINUTE_MS;
      if (prev < fullAt && cur >= fullAt) {
        events.alerts.push({
          type: 'vehicle_full',
          portId: port.id,
          sessionId: open.id,
          driverId: open.user_id,
          message: `Xe ở cổng ${port.port_number} đã sạc xong, vui lòng rút súng (sau ${rules.IDLE_GRACE_MINUTES} phút sẽ tính phí chiếm chỗ)`,
        });
      }
      if (prev < feeAt && cur >= feeAt) {
        events.alerts.push({
          type: 'idle_fee_started',
          portId: port.id,
          sessionId: open.id,
          driverId: open.user_id,
          message: `Bắt đầu tính phí chiếm chỗ ${rules.IDLE_FEE_PER_MIN}đ/phút ở cổng ${port.port_number}`,
        });
      }
    }
  } else if (power !== null && power !== undefined && idleSince) {
    // Xe sạc tiếp -> chốt đoạn chiếm chỗ vừa rồi, dừng đếm
    idleMinutes += billableIdleMinutes(idleSince, now);
    idleSince = null;
  }

  const { rows } = await client.query(
    `UPDATE charging_sessions SET energy_kwh = $2, needs_review = $3, idle_since = $4, idle_minutes = $5
     WHERE id = $1 AND ended_at IS NULL RETURNING *`,
    [open.id, energy, needsReview, idleSince, idleMinutes],
  );
  if (rows[0]) events.sessions.push(rows[0]);
};

const closeOpenSession = async (client, port, open, payload, now, events) => {
  let finalEnergy = Number(open.energy_kwh);
  let needsReview = false;
  const reported = payload.energyKwh;
  // Thiết bị khởi động lại gửi energyKwh = 0 -> giữ số lớn nhất đã ghi nhận, không làm mất tiền điện
  if (reported !== null && reported !== undefined && reported > finalEnergy) {
    if (isPlausibleIncrease(reported - finalEnergy, port.last_seen_at ?? open.started_at, now)) finalEnergy = reported;
    else needsReview = true;
  }
  const closed = await finalizeSession(client, open, {
    endedAt: now,
    finalEnergy,
    endReason: payload.status === 'fault' ? 'device_fault' : 'device_idle',
    needsReview,
  });
  if (closed) events.sessions.push(closed);
};

const recordIncidents = async (client, port, status, now, events) => {
  // Thiết bị gửi được bản tin -> sự cố offline (nếu có) đã phục hồi
  const { rows: recovered } = await client.query(
    `UPDATE incidents SET recovered_at = $2
     WHERE port_id = $1 AND type = 'offline' AND resolved_at IS NULL AND recovered_at IS NULL RETURNING id`,
    [port.id, now],
  );
  if (recovered[0]) events.portOnlineAgain = true;

  if (status === 'fault') {
    const { rows } = await client.query(
      `INSERT INTO incidents (port_id, type, opened_at) VALUES ($1, 'fault', $2)
       ON CONFLICT (port_id, type) WHERE resolved_at IS NULL DO UPDATE SET recovered_at = NULL
       RETURNING (xmax = 0) AS inserted, recovered_at`,
      [port.id, now],
    );
    if (rows[0]?.inserted || port.status !== 'fault') {
      events.alerts.push({ type: 'port_fault', portId: port.id, message: `Cổng ${port.port_number} báo lỗi` });
    }
  } else if (port.status === 'fault') {
    await client.query(
      `UPDATE incidents SET recovered_at = $2
       WHERE port_id = $1 AND type = 'fault' AND resolved_at IS NULL AND recovered_at IS NULL`,
      [port.id, now],
    );
  }
};

// Xử lý 1 bản tin MQTT. Trả { ignored } nếu bỏ qua, hoặc { sessionIds } để test kiểm tra.
const handleMessage = async (topic, rawPayload, { now = new Date() } = {}) => {
  const parsed = payloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    logger.warn({ topic, issue: parsed.error.issues[0]?.message }, 'MQTT: payload sai định dạng, bỏ qua');
    return { ignored: 'invalid_payload' };
  }
  const payload = parsed.data;
  const topicCode = String(topic ?? '').split('/')[1];
  if (topicCode !== payload.stationId) {
    logger.warn({ topic, stationId: payload.stationId }, 'MQTT: stationId không khớp topic, bỏ qua');
    return { ignored: 'topic_mismatch' };
  }

  const events = { sessions: [], alerts: [], portOnlineAgain: false };
  const result = await withTransaction(async (client) => {
    const { rows: portRows } = await client.query(
      `SELECT p.*, s.code AS station_code FROM ports p JOIN stations s ON s.id = p.station_id
       WHERE s.code = $1 AND p.port_number = $2
       FOR UPDATE OF p`,
      [payload.stationId, payload.portId],
    );
    const port = portRows[0];
    if (!port) return null;

    await client.query(
      `INSERT INTO telemetry (station_id, port_id, status, power_kw, energy_kwh, temperature, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        port.station_id,
        port.id,
        payload.status,
        payload.powerKw ?? null,
        payload.energyKwh ?? null,
        payload.temperature ?? null,
        resolveRecordedAt(payload.timestamp, now),
      ],
    );
    await client.query('UPDATE ports SET status = $1, last_seen_at = $2 WHERE id = $3', [payload.status, now, port.id]);
    await recordIncidents(client, port, payload.status, now, events);

    const { rows: openRows } = await client.query(
      'SELECT * FROM charging_sessions WHERE port_id = $1 AND ended_at IS NULL FOR UPDATE',
      [port.id],
    );
    const open = openRows[0];
    if (payload.status === 'charging') {
      if (open) await updateOpenSession(client, port, open, payload, now, events);
      else await openSession(client, port, payload, now, events);
    } else if (open) {
      await closeOpenSession(client, port, open, payload, now, events);
    }
    return port;
  });

  if (!result) {
    logger.warn({ stationId: payload.stationId, portNumber: payload.portId }, 'MQTT: không tìm thấy cổng, bỏ qua');
    return { ignored: 'unknown_port' };
  }

  notify.portUpdated({
    stationCode: result.station_code,
    portId: result.id,
    status: payload.status,
    powerKw: payload.powerKw,
    online: true,
    recordedAt: now,
  });
  for (const session of events.sessions) notify.sessionUpdated(toChargingSession(session));
  for (const alert of events.alerts) notify.alert({ ...alert, stationCode: result.station_code });

  return { portId: result.id, sessionIds: events.sessions.map((s) => s.id) };
};

module.exports = { handleMessage, finalizeSession, billableIdleMinutes, idleFeeFor, isPlausibleIncrease };
