const { broadcast, sendToUsers } = require('./websocket');
const { query } = require('../db');
const { logger } = require('../logger');

// Đầu mối phát sự kiện real-time (docs/contracts.md mục 1b). Route/engine chỉ gọi các hàm ở đây,
// không tự quyết ai được nhận — tránh lộ dữ liệu phiên/tài xế qua kênh công khai.

// port:update — kênh công khai, chỉ trạng thái thiết bị, không có thông tin người dùng
const portUpdated = ({ stationCode, portId, status, powerKw, online, recordedAt }) => {
  broadcast('port:update', {
    stationId: stationCode,
    portId,
    status,
    powerKw: powerKw ?? null,
    online,
    recordedAt,
  });
};

// Người nhận sự kiện của 1 cổng: quản lý trạm đó + mọi admin (+ tài xế nếu truyền vào)
const recipientsForPort = async (portId, extraUserIds = []) => {
  const { rows } = await query(
    `SELECT s.owner_id FROM ports p JOIN stations s ON s.id = p.station_id WHERE p.id = $1`,
    [portId],
  );
  const ids = new Set(extraUserIds.filter(Boolean));
  if (rows[0]?.owner_id) ids.add(rows[0].owner_id);
  return [...ids];
};

const safe = (fn) => (...args) =>
  Promise.resolve()
    .then(() => fn(...args))
    .catch((err) => logger.error({ err }, 'notify: gửi sự kiện thất bại'));

// session:update — chỉ tài xế của phiên, quản lý trạm, admin
const sessionUpdated = safe(async (session) => {
  const userIds = await recipientsForPort(session.portId, [session.userId]);
  sendToUsers(userIds, 'session:update', session, { includeAdmins: true });
});

// alert — quản lý trạm + admin; forDriver: gửi thêm cho tài xế của phiên (xe đầy, phí chiếm chỗ)
const alert = safe(async ({ type, stationCode, portId, sessionId = null, message, driverId = null }) => {
  const userIds = await recipientsForPort(portId, driverId ? [driverId] : []);
  sendToUsers(userIds, 'alert', { type, stationId: stationCode, portId, sessionId, message }, { includeAdmins: true });
});

module.exports = { portUpdated, sessionUpdated, alert };
