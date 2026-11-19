const { query } = require('../db');
const { logger } = require('../logger');
const rules = require('../config/rules');

// Các job định kỳ của booking (docs/LUONG_NGHIEP_VU.md mục 4, 5). Mỗi job là 1 câu UPDATE có
// điều kiện -> chạy lại nhiều lần / chạy song song cũng không đổi kết quả (idempotent).
// scheduler.js gọi định kỳ; test gọi trực tiếp.

// Giữ chỗ quá hạn mà chưa có tiền cọc -> huỷ (payment_timeout), nhả slot, đánh payment cọc 'failed'.
// Có đệm HOLD_EXPIRY_GRACE_SECONDS cho IPN đến trễ. IPN thành công đến sau đó -> cọc "cần hoàn".
const expireUnpaidHolds = async () => {
  const { rows } = await query(
    `WITH expired AS (
       UPDATE bookings
       SET status = 'cancelled', cancel_reason = 'payment_timeout', cancelled_at = now()
       WHERE status = 'pending' AND hold_expires_at + make_interval(secs => $1) < now()
       RETURNING id
     )
     UPDATE payments SET status = 'failed'
     WHERE booking_id IN (SELECT id FROM expired) AND purpose = 'booking_deposit' AND status = 'pending'
     RETURNING booking_id`,
    [rules.HOLD_EXPIRY_GRACE_SECONDS],
  );
  return rows.length;
};

// Đã cọc nhưng quá giờ bắt đầu + 15' chưa check-in -> no_show (mất cọc), nhả cổng cho người khác
const markNoShows = async () => {
  const { rows } = await query(
    `UPDATE bookings SET status = 'no_show'
     WHERE status = 'confirmed' AND start_time + make_interval(mins => $1) < now()
     RETURNING id`,
    [rules.CHECKIN_LATE_MINUTES],
  );
  return rows.length;
};

// Đã check-in nhưng hết giờ booking mà không có phiên nào đang mở -> completed (cọc là phí tối thiểu
// nếu chưa từng sạc). Booking còn phiên đang mở (sạc quá giờ) giữ checked_in tới khi phiên đóng.
const completeStaleCheckIns = async () => {
  const { rows } = await query(
    `UPDATE bookings b SET status = 'completed'
     WHERE b.status = 'checked_in' AND b.end_time < now()
       AND NOT EXISTS (SELECT 1 FROM charging_sessions cs WHERE cs.booking_id = b.id AND cs.ended_at IS NULL)
     RETURNING b.id`,
  );
  return rows.length;
};

const runBookingJobs = async () => {
  const result = {
    expired: await expireUnpaidHolds(),
    noShows: await markNoShows(),
    completed: await completeStaleCheckIns(),
  };
  if (result.expired || result.noShows || result.completed) logger.info(result, 'booking jobs');
  return result;
};

module.exports = { expireUnpaidHolds, markNoShows, completeStaleCheckIns, runBookingJobs };
