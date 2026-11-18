const mqtt = require('mqtt');
const { logger } = require('../logger');
const engine = require('./sessionEngine');

// Kết nối broker MQTT (bắt buộc đăng nhập — mosquitto/README.md) và chuyển bản tin cho
// sessionEngine. IoT -> Server 1 chiều: server chỉ subscribe, không publish lệnh xuống thiết bị.

const TOPIC_PATTERN = 'stations/+/status';

let client;
// connectedSince: thời điểm kết nối broker gần nhất (null khi đang mất kết nối) — watchdog dùng
// để không đánh offline oan các cổng trong lúc chính backend mất kết nối / vừa kết nối lại.
const state = { connectedSince: null };

// Hàng đợi theo cổng: bản tin của cùng 1 cổng xử lý lần lượt theo thứ tự nhận
const queues = new Map();
const enqueue = (key, task) => {
  const next = (queues.get(key) ?? Promise.resolve()).then(task).catch((err) => {
    logger.error({ err, key }, 'MQTT: lỗi xử lý bản tin');
  });
  queues.set(key, next);
  next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return next;
};

const onMessage = (topic, raw) => {
  let payload;
  try {
    payload = JSON.parse(raw.toString());
  } catch {
    logger.warn({ topic }, 'MQTT: payload không phải JSON hợp lệ');
    return;
  }
  const key = `${topic}#${payload?.portId}`;
  enqueue(key, () => engine.handleMessage(topic, payload));
};

const start = () => {
  const brokerUrl = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
  client = mqtt.connect(brokerUrl, {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 5000,
  });

  client.on('connect', () => {
    state.connectedSince = Date.now();
    logger.info({ brokerUrl }, 'MQTT connected');
    client.subscribe(TOPIC_PATTERN, { qos: 0 });
  });
  client.on('close', () => {
    if (state.connectedSince) logger.warn('MQTT mất kết nối broker');
    state.connectedSince = null;
  });
  client.on('message', onMessage);
  client.on('error', (err) => logger.error({ err }, 'MQTT lỗi kết nối'));

  return client;
};

const stop = () => {
  client?.end();
  state.connectedSince = null;
};

const getConnectionState = () => ({ ...state });

module.exports = { start, stop, getConnectionState, enqueue };
