const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
const engine = require('../src/services/sessionEngine');
const { runWatchdog } = require('../src/services/watchdog');
const { createStationWithPort, insertBooking, registerUser, resetDb } = require('./helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

const MIN = 60 * 1000;
const T0 = new Date(Date.now() - 10 * MIN);
const at = (minutes) => new Date(T0.getTime() + minutes * MIN);

const send = (overrides = {}, minutes = 0, topic) => {
  const payload = {
    stationId: 'ST01',
    portId: 1,
    status: 'charging',
    powerKw: 7.4,
    energyKwh: 0,
    temperature: 30,
    timestamp: at(minutes).toISOString(),
    ...overrides,
  };
  return engine.handleMessage(topic ?? `stations/${payload.stationId}/status`, payload, { now: at(minutes) });
};

const sessionsOf = async (portId) =>
  (await pool.query('SELECT * FROM charging_sessions WHERE port_id = $1 ORDER BY id', [portId])).rows;

// Trạm ST01 có quản lý + tài xế đã check-in booking trên cổng 1 tại thời điểm T0
const setupCheckedIn = async ({ checkedInAt = T0 } = {}) => {
  const station = await createStationWithPort();
  const driver = await registerUser();
  const booking = await insertBooking({
    userId: driver.user.id,
    portId: station.portId,
    startOffsetMin: -15,
    durationMin: 120,
    status: 'checked_in',
  });
  await pool.query('UPDATE bookings SET checked_in_at = $1 WHERE id = $2', [checkedInAt, booking.id]);
  return { ...station, driver, booking };
};

describe('Gán phiên cho tài xế', () => {
  it('phiên mở trong 15 phút sau check-in -> gắn booking; rút súng -> chốt tiền, trừ cọc, booking completed', async () => {
    const { portId, driver, booking } = await setupCheckedIn();
    await send({ energyKwh: 0 }, 1);
    await send({ energyKwh: 5 }, 30);
    await send({ status: 'idle', powerKw: 0, energyKwh: 10 }, 60);

    const [session] = await sessionsOf(portId);
    expect(session).toMatchObject({ booking_id: booking.id, user_id: driver.user.id, end_reason: 'device_idle' });
    expect(Number(session.cost)).toBe(35000); // 10 kWh x 3500
    expect(Number(session.deposit_applied)).toBe(20000);

    const res = await request(app).get('/sessions/me').set('Authorization', `Bearer ${driver.accessToken}`);
    expect(res.body.data[0]).toMatchObject({ amountDue: 15000, paymentStatus: 'unpaid', unauthorized: false });
    const { rows } = await pool.query('SELECT status FROM bookings WHERE id = $1', [booking.id]);
    expect(rows[0].status).toBe('completed');
  });

  it('không check-in, hoặc cắm quá 15 phút sau check-in -> phiên trái phép, không ai bị tính tiền', async () => {
    const { portId } = await setupCheckedIn({ checkedInAt: at(-20) });
    await send({ energyKwh: 0 }, 0);
    await send({ status: 'idle', energyKwh: 2 }, 10);
    const [session] = await sessionsOf(portId);
    expect(session.user_id).toBeNull();
    expect(session.booking_id).toBeNull();
    expect(Number(session.cost)).toBe(7000); // vẫn tính để báo cáo thất thoát
  });
});

describe('Bản tin xấu / thiết bị trục trặc', () => {
  it('ESP32 khởi động lại gửi idle với energyKwh = 0 -> không mất tiền điện đã sạc', async () => {
    const { portId } = await setupCheckedIn();
    await send({ energyKwh: 0 }, 1);
    await send({ energyKwh: 5 }, 30);
    await send({ status: 'idle', powerKw: 0, energyKwh: 0 }, 31);
    const [session] = await sessionsOf(portId);
    expect(Number(session.energy_kwh)).toBe(5);
    expect(Number(session.cost)).toBe(17500);
  });

  it('điện năng tăng vô lý (vượt 22 kW x thời gian) -> không nhận, gắn needsReview', async () => {
    const { portId } = await setupCheckedIn();
    await send({ energyKwh: 0 }, 1);
    await send({ energyKwh: 50 }, 2); // 50 kWh trong 1 phút
    const [session] = await sessionsOf(portId);
    expect(Number(session.energy_kwh)).toBe(0);
    expect(session.needs_review).toBe(true);
  });

  it('thiết bị online lại sau khi phiên đã đóng tay, gửi bộ đếm cũ 7 kWh -> phiên mới lấy 7 làm mốc, không tính lại', async () => {
    const { portId } = await setupCheckedIn({ checkedInAt: at(-60) });
    await send({ energyKwh: 7 }, 0);
    await send({ energyKwh: 8 }, 5);
    await send({ status: 'idle', powerKw: 0, energyKwh: 8 }, 6);
    const [session] = await sessionsOf(portId);
    expect(Number(session.energy_start_kwh)).toBe(7);
    expect(session.needs_review).toBe(true);
    expect(Number(session.cost)).toBe(3500); // chỉ 1 kWh chênh lệch
  });

  it('2 bản tin charging đến cùng lúc -> chỉ mở 1 phiên', async () => {
    const { portId } = await setupCheckedIn();
    await Promise.all([send({ energyKwh: 0 }, 1), send({ energyKwh: 0.01 }, 1)]);
    expect(await sessionsOf(portId)).toHaveLength(1);
  });

  it('topic khác stationId, payload sai, cổng lạ -> bỏ qua, không ghi gì', async () => {
    const { portId } = await setupCheckedIn();
    expect(await send({}, 1, 'stations/ST99/status')).toEqual({ ignored: 'topic_mismatch' });
    expect(await send({ status: 'exploded' }, 1)).toEqual({ ignored: 'invalid_payload' });
    expect(await send({ powerKw: 500 }, 1)).toEqual({ ignored: 'invalid_payload' });
    expect(await send({ portId: 9 }, 1)).toEqual({ ignored: 'unknown_port' });
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM telemetry WHERE port_id = $1', [portId]);
    expect(rows[0].n).toBe(0);
  });

  it('đồng hồ thiết bị sai (1970) -> recorded_at dùng giờ server', async () => {
    const { portId } = await setupCheckedIn();
    await send({ timestamp: '1970-01-01T00:00:00Z' }, 1);
    const { rows } = await pool.query('SELECT recorded_at FROM telemetry WHERE port_id = $1', [portId]);
    expect(new Date(rows[0].recorded_at).getTime()).toBe(at(1).getTime());
  });

  it('thiết bị báo fault giữa phiên -> đóng phiên (device_fault), không tính phí chiếm chỗ, mở sự cố', async () => {
    const { portId } = await setupCheckedIn();
    await send({ energyKwh: 0 }, 1);
    await send({ powerKw: 0, energyKwh: 0.3 }, 2);
    await send({ status: 'fault', powerKw: 0, energyKwh: 0.3 }, 60);
    const [session] = await sessionsOf(portId);
    expect(session.end_reason).toBe('device_fault');
    expect(Number(session.idle_fee)).toBe(0);
    const { rows } = await pool.query("SELECT * FROM incidents WHERE port_id = $1 AND type = 'fault'", [portId]);
    expect(rows).toHaveLength(1);
  });
});

describe('Phí chiếm chỗ (xe đầy pin mà chưa rút súng)', () => {
  it('công suất ≈ 0 liên tục: 5 phút phát hiện + 15 phút ân hạn, sau đó 1.000đ/phút', async () => {
    const { portId } = await setupCheckedIn();
    await send({ energyKwh: 0 }, 1);
    await send({ powerKw: 0, energyKwh: 10 }, 40); // bắt đầu công suất thấp
    await send({ powerKw: 0, energyKwh: 10 }, 46);
    await send({ status: 'idle', powerKw: 0, energyKwh: 10 }, 70); // 30 phút thấp -> 10 phút tính phí
    const [session] = await sessionsOf(portId);
    expect(session.idle_minutes).toBe(10);
    expect(Number(session.idle_fee)).toBe(10000);
    expect(Number(session.cost)).toBe(35000 + 10000);
  });

  it('có trần 100.000đ', async () => {
    const { portId } = await setupCheckedIn();
    await send({ energyKwh: 0 }, 1);
    await send({ powerKw: 0, energyKwh: 10 }, 40);
    await send({ status: 'idle', powerKw: 0, energyKwh: 10 }, 40 + 500);
    const [session] = await sessionsOf(portId);
    expect(Number(session.idle_fee)).toBe(100000);
  });

  it('xe sạc tiếp -> dừng đếm, phút đã tính vẫn giữ', async () => {
    const { portId } = await setupCheckedIn();
    await send({ energyKwh: 0 }, 1);
    await send({ powerKw: 0, energyKwh: 5 }, 30); // thấp từ phút 30
    await send({ powerKw: 7, energyKwh: 5 }, 55); // 25 phút thấp -> 5 phút tính phí, rồi sạc tiếp
    await send({ status: 'idle', powerKw: 0, energyKwh: 6 }, 70);
    const [session] = await sessionsOf(portId);
    expect(session.idle_minutes).toBe(5);
    expect(Number(session.idle_fee)).toBe(5000);
  });
});

describe('Cọc trừ dần qua nhiều phiên của cùng booking', () => {
  it('rút ra cắm lại: phiên 2 gắn bằng check-in lại (cần mã), chỉ trừ phần cọc còn lại', async () => {
    const realNow = Date.now();
    const { portId, owner, booking } = await setupCheckedIn({ checkedInAt: new Date(realNow - 14 * MIN) });
    const call = (overrides, minutesFromNow) =>
      engine.handleMessage(
        'stations/ST01/status',
        { stationId: 'ST01', portId: 1, status: 'charging', powerKw: 7, energyKwh: 0, ...overrides },
        { now: new Date(realNow + minutesFromNow * MIN) },
      );
    await call({ energyKwh: 0 }, -13);
    await call({ status: 'idle', powerKw: 0, energyKwh: 2 }, -7); // phiên 1: 7.000đ
    await call({ energyKwh: 0 }, -6); // cắm lại -> phiên trái phép (booking đã completed)

    const second = (await sessionsOf(portId))[1];
    expect(second.user_id).toBeNull();
    const res = await request(app)
      .post(`/bookings/${booking.id}/check-in`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ code: '123456', attachSessionId: second.id });
    expect(res.status).toBe(200);

    await call({ status: 'idle', powerKw: 0, energyKwh: 5 }, 10); // phiên 2: 17.500đ
    const [s1, s2] = await sessionsOf(portId);
    expect(Number(s1.deposit_applied)).toBe(7000);
    expect(Number(s2.deposit_applied)).toBe(13000); // phần cọc còn lại, không phải 17.500
  });
});

describe('POST /sessions/:id/force-close — quản lý đóng phiên khi thiết bị mất kết nối', () => {
  const forceClose = (token, id, body) =>
    request(app).post(`/sessions/${id}/force-close`).set('Authorization', `Bearer ${token}`).send(body);

  // Phiên có chủ, số đo cuối 2 kWh, thiết bị im lặng từ 30 phút trước
  const setupLost = async () => {
    const ctx = await setupCheckedIn({ checkedInAt: new Date(Date.now() - 40 * MIN) });
    const lastSeen = Date.now() - 30 * MIN;
    const call = (overrides, ms) =>
      engine.handleMessage(
        'stations/ST01/status',
        { stationId: 'ST01', portId: 1, status: 'charging', powerKw: 7, ...overrides },
        { now: new Date(ms) },
      );
    await call({ energyKwh: 0 }, lastSeen - 20 * MIN);
    await call({ energyKwh: 2 }, lastSeen);
    const [session] = await sessionsOf(ctx.portId);
    return { ...ctx, session };
  };

  it('cổng còn online và phiên không cần kiểm tra -> 409, không cho đóng tay', async () => {
    const { owner, portId } = await setupCheckedIn();
    await send({ energyKwh: 0 }, 1);
    await pool.query('UPDATE ports SET last_seen_at = now() WHERE id = $1', [portId]);
    const [session] = await sessionsOf(portId);
    const res = await forceClose(owner.accessToken, session.id, { energyKwh: 1, note: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SESSION_ACTION_NOT_ALLOWED');
  });

  it('nhập nhỏ hơn số đo cuối hoặc vượt 22 kW x thời gian mất tín hiệu -> 409 kèm khoảng hợp lệ', async () => {
    const { owner, session } = await setupLost();
    const tooLow = await forceClose(owner.accessToken, session.id, { energyKwh: 1, note: 'Đọc công tơ' });
    expect(tooLow.status).toBe(409);
    expect(tooLow.body.error.details.minEnergyKwh).toBe(2);
    const tooHigh = await forceClose(owner.accessToken, session.id, { energyKwh: 999, note: 'Đọc công tơ' });
    expect(tooHigh.status).toBe(409);
    expect(tooHigh.body.error.details.maxEnergyKwh).toBeLessThan(15); // 2 + 22 x 0.5h
  });

  it('số hợp lệ -> đóng manual_close, tính tiền, ghi audit; quản lý trạm khác -> 403', async () => {
    const { owner, session } = await setupLost();
    const otherStation = await createStationWithPort({ code: 'ST02' });
    const forbidden = await forceClose(otherStation.owner.accessToken, session.id, { energyKwh: 5, note: 'x' });
    expect(forbidden.status).toBe(403);

    const res = await forceClose(owner.accessToken, session.id, { energyKwh: 5, note: 'Đọc công tơ tại trạm' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ endReason: 'manual_close', energyKwh: 5, cost: 17500, amountDue: 0 });
    const { rows } = await pool.query("SELECT detail FROM audit_logs WHERE action = 'session.force_close'");
    expect(rows[0].detail).toMatchObject({ energyBefore: 2, energyKwh: 5 });
  });

  it('thiết bị đã tự đóng phiên trước -> đóng tay bị từ chối, không chốt tiền 2 lần', async () => {
    const { owner, session } = await setupLost();
    await engine.handleMessage(
      'stations/ST01/status',
      { stationId: 'ST01', portId: 1, status: 'idle', powerKw: 0, energyKwh: 3 },
      { now: new Date() },
    );
    const res = await forceClose(owner.accessToken, session.id, { energyKwh: 4, note: 'x' });
    expect(res.status).toBe(409);
  });
});

describe('Watchdog cổng mất kết nối', () => {
  const longAgo = Date.now() - 60 * MIN;

  it('cổng im > 60s -> offline, mở sự cố, phiên đang mở gắn needsReview; thiết bị gửi lại -> phục hồi', async () => {
    const { portId } = await setupCheckedIn();
    await send({ energyKwh: 0.2 }, 1);
    const now = new Date(at(1).getTime() + 2 * MIN);
    expect(await runWatchdog({ now, startedAt: longAgo, brokerConnectedSince: longAgo })).toEqual([portId]);

    const [session] = await sessionsOf(portId);
    expect(session.needs_review).toBe(true);
    expect(session.ended_at).toBeNull(); // không tự đóng
    // chạy lại không mở thêm sự cố
    expect(await runWatchdog({ now, startedAt: longAgo, brokerConnectedSince: longAgo })).toEqual([]);

    await send({ energyKwh: 0.4 }, 4);
    const { rows } = await pool.query("SELECT * FROM incidents WHERE port_id = $1 AND type = 'offline'", [portId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].recovered_at).not.toBeNull();
  });

  it('không đánh offline oan: 90s đầu sau khi khởi động, khi backend mất broker, cổng chưa từng gửi', async () => {
    const station = await createStationWithPort({ online: false });
    await pool.query("UPDATE ports SET last_seen_at = now() - interval '5 minutes' WHERE id = $1", [station.portId]);
    const neverSeen = await createStationWithPort({ code: 'ST02', online: false });
    const now = new Date();

    expect(await runWatchdog({ now, startedAt: now.getTime() - 30 * 1000, brokerConnectedSince: longAgo })).toEqual([]);
    expect(await runWatchdog({ now, startedAt: longAgo, brokerConnectedSince: null })).toEqual([]);
    expect(await runWatchdog({ now, startedAt: longAgo, brokerConnectedSince: now.getTime() - 10 * 1000 })).toEqual([]);
    const ids = await runWatchdog({ now, startedAt: longAgo, brokerConnectedSince: longAgo });
    expect(ids).toEqual([station.portId]);
    expect(ids).not.toContain(neverSeen.portId);
  });
});
