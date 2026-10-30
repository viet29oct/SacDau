const mqtt = require('mqtt');
const { query } = require('../db');
const { logger } = require('../logger');
const { broadcast } = require('./websocket');
const { toChargingSession } = require('./chargingSessions');

// Subscriber MQTT + state machine charging_sessions — đặc tả đầy đủ ở docs/contracts.md mục 1.
// Nguyên tắc: IoT -> Server 1 chiều, server không gửi lệnh điều khiển ngược xuống ESP32.

const TOPIC_PATTERN = 'stations/+/status';
const UNIT_PRICE_PER_KWH = Number(process.env.UNIT_PRICE_PER_KWH ?? 3500);

let client;

// stationId trong payload MQTT (vd "ST01") là stations.code, không phải stations.id số trong DB
const resolvePort = async (stationCode, portNumber) => {
  const { rows } = await query(
    `SELECT p.id AS port_id, p.station_id
     FROM ports p
     JOIN stations s ON s.id = p.station_id
     WHERE s.code = $1 AND p.port_number = $2`,
    [stationCode, portNumber],
  );
  return rows[0];
};

const findOpenSession = async (portId) => {
  const { rows } = await query(
    'SELECT * FROM charging_sessions WHERE port_id = $1 AND ended_at IS NULL ORDER BY id DESC LIMIT 1',
    [portId],
  );
  return rows[0];
};

// Tìm booking 'confirmed' khớp khung giờ hiện tại trên port này để gán booking_id —
// không tìm thấy vẫn mở phiên bình thường với booking_id = NULL (khách vãng lai)
const findMatchingBookingId = async (portId, now) => {
  const { rows } = await query(
    `SELECT id FROM bookings
     WHERE port_id = $1 AND status = 'confirmed' AND start_time <= $2 AND end_time >= $2
     ORDER BY start_time
     LIMIT 1`,
    [portId, now],
  );
  return rows[0]?.id ?? null;
};

const handleMessage = async (payload) => {
  const { stationId: stationCode, portId: portNumber, status, powerKw, energyKwh, temperature, timestamp } =
    payload;

  const port = await resolvePort(stationCode, portNumber);
  if (!port) {
    logger.warn({ stationCode, portNumber }, 'MQTT: không tìm thấy port khớp stationId/portId');
    return;
  }
  const recordedAt = timestamp ? new Date(timestamp) : new Date();

  // Bước 1: luôn ghi telemetry + cập nhật trạng thái port
  await query(
    `INSERT INTO telemetry (station_id, port_id, status, power_kw, energy_kwh, temperature, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [port.station_id, port.port_id, status, powerKw ?? null, energyKwh ?? null, temperature ?? null, recordedAt],
  );
  await query('UPDATE ports SET status = $1 WHERE id = $2', [status, port.port_id]);

  broadcast('port:update', {
    stationId: stationCode,
    portId: port.port_id,
    status,
    powerKw: powerKw ?? null,
    energyKwh: energyKwh ?? null,
    temperature: temperature ?? null,
    recordedAt,
  });

  const openSession = await findOpenSession(port.port_id);

  // Bước 2-3: status = charging -> mở phiên mới hoặc cập nhật phiên đang mở
  if (status === 'charging') {
    if (!openSession) {
      const bookingId = await findMatchingBookingId(port.port_id, recordedAt);
      const { rows } = await query(
        `INSERT INTO charging_sessions (booking_id, port_id, started_at, energy_kwh)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [bookingId, port.port_id, recordedAt, energyKwh ?? 0],
      );
      broadcast('session:update', toChargingSession(rows[0]));
    } else {
      const { rows } = await query('UPDATE charging_sessions SET energy_kwh = $1 WHERE id = $2 RETURNING *', [
        energyKwh ?? openSession.energy_kwh,
        openSession.id,
      ]);
      broadcast('session:update', toChargingSession(rows[0]));
    }
    return;
  }

  // Bước 4: status = idle/fault và có phiên đang mở -> đóng phiên, tính cost
  if ((status === 'idle' || status === 'fault') && openSession) {
    const finalEnergy = energyKwh ?? Number(openSession.energy_kwh ?? 0);
    const cost = Math.round(finalEnergy * UNIT_PRICE_PER_KWH * 100) / 100;
    const { rows } = await query(
      'UPDATE charging_sessions SET ended_at = $1, energy_kwh = $2, cost = $3 WHERE id = $4 RETURNING *',
      [recordedAt, finalEnergy, cost, openSession.id],
    );
    broadcast('session:update', toChargingSession(rows[0]));
  }
};

const start = () => {
  const brokerUrl = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
  client = mqtt.connect(brokerUrl);

  client.on('connect', () => {
    logger.info({ brokerUrl }, 'MQTT connected');
    client.subscribe(TOPIC_PATTERN);
  });

  client.on('message', (_topic, raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch (err) {
      logger.warn({ err }, 'MQTT: payload không phải JSON hợp lệ');
      return;
    }
    handleMessage(payload).catch((err) => logger.error({ err }, 'MQTT: lỗi xử lý bản tin'));
  });

  client.on('error', (err) => logger.error({ err }, 'MQTT lỗi kết nối'));

  return client;
};

const stop = () => {
  client?.end();
};

module.exports = { start, stop, handleMessage };
