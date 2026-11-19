const { query } = require('../db');
const { logger } = require('../logger');
const rules = require('../config/rules');
const notify = require('./notify');

// Watchdog phát hiện cổng mất kết nối (thiết bị im lặng > 60s, tính theo giờ server).
// Không tự đóng phiên đang mở (chưa biết chỉ số cuối) — chỉ gắn needsReview để quản lý xử lý.
//
// Ân hạn để không đánh offline oan hàng loạt:
// - 90s đầu sau khi backend khởi động / kết nối lại broker (chưa kịp nhận bản tin mới);
// - backend đang mất kết nối broker -> không làm gì (lỗi ở phía mình, không phải thiết bị);
// - cổng chưa từng gửi bản tin (last_seen_at NULL) -> bỏ qua.
const runWatchdog = async ({ now = new Date(), startedAt, brokerConnectedSince }) => {
  if (!brokerConnectedSince) return [];
  const graceUntil = Math.max(startedAt ?? 0, brokerConnectedSince) + rules.WATCHDOG_GRACE_SECONDS * 1000;
  if (now.getTime() < graceUntil) return [];

  const cutoff = new Date(now.getTime() - rules.OFFLINE_AFTER_SECONDS * 1000);
  const { rows: ports } = await query(
    `SELECT p.id, p.port_number, p.status, s.code AS station_code
     FROM ports p JOIN stations s ON s.id = p.station_id
     WHERE s.is_active AND p.last_seen_at IS NOT NULL AND p.last_seen_at < $1
       AND NOT EXISTS (
         SELECT 1 FROM incidents i
         WHERE i.port_id = p.id AND i.type = 'offline' AND i.resolved_at IS NULL AND i.recovered_at IS NULL
       )`,
    [cutoff],
  );

  for (const port of ports) {
    // Sự cố offline cũ chưa đóng (đã phục hồi) mà lại mất kết nối -> mở lại chính sự cố đó
    await query(
      `INSERT INTO incidents (port_id, type, opened_at) VALUES ($1, 'offline', $2)
       ON CONFLICT (port_id, type) WHERE resolved_at IS NULL DO UPDATE SET recovered_at = NULL`,
      [port.id, now],
    );
    await query('UPDATE charging_sessions SET needs_review = true WHERE port_id = $1 AND ended_at IS NULL', [port.id]);
    notify.portUpdated({ stationCode: port.station_code, portId: port.id, status: port.status, online: false, recordedAt: now });
    notify.alert({
      type: 'port_offline',
      stationCode: port.station_code,
      portId: port.id,
      message: `Cổng ${port.port_number} mất kết nối quá ${rules.OFFLINE_AFTER_SECONDS} giây`,
    });
  }
  if (ports.length) logger.warn({ portIds: ports.map((p) => p.id) }, 'watchdog: cổng mất kết nối');
  return ports.map((p) => p.id);
};

module.exports = { runWatchdog };
