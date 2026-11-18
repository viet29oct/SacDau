const { logger } = require('../logger');
const rules = require('../config/rules');
const { runBookingJobs } = require('./bookingJobs');
const { runWatchdog } = require('./watchdog');

// Chạy định kỳ các job nghiệp vụ (hết hạn cọc, no-show, booking check-in không có phiên) và
// watchdog cổng mất kết nối. Khởi động trong server.js — không chạy khi test (test gọi job trực tiếp).
let timers = [];

const safeRun = (name, fn) => () => {
  fn().catch((err) => logger.error({ err }, `scheduler: ${name} lỗi`));
};

const start = ({ getMqttState }) => {
  const startedAt = Date.now();
  const interval = rules.WATCHDOG_INTERVAL_SECONDS * 1000;
  timers = [
    setInterval(safeRun('booking jobs', runBookingJobs), interval),
    setInterval(
      safeRun('watchdog', () =>
        runWatchdog({ now: new Date(), startedAt, brokerConnectedSince: getMqttState().connectedSince }),
      ),
      interval,
    ),
  ];
};

const stop = () => {
  timers.forEach(clearInterval);
  timers = [];
};

module.exports = { start, stop };
