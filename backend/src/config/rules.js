// Toàn bộ hằng số nghiệp vụ ở 1 chỗ — đặc tả ở docs/LUONG_NGHIEP_VU.md.
// Giá trị tiền/giờ phục vụ đọc được từ env (có mặc định); các mốc thời gian còn lại cố định
// theo đặc tả, muốn đổi thì sửa ở đây + cập nhật tài liệu.

const fromEnv = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const MINUTE_MS = 60 * 1000;

module.exports = {
  MINUTE_MS,

  // Tiền (VNĐ)
  UNIT_PRICE_PER_KWH: fromEnv('UNIT_PRICE_PER_KWH', 3500),
  BOOKING_DEPOSIT_VND: fromEnv('BOOKING_DEPOSIT_VND', 20000),
  IDLE_FEE_PER_MIN: fromEnv('IDLE_FEE_PER_MIN', 1000),
  IDLE_FEE_CAP: fromEnv('IDLE_FEE_CAP', 100000),

  // Giờ phục vụ (giờ Việt Nam, UTC+7): booking phải nằm trọn trong [OPEN, CLOSE]
  SERVICE_OPEN_HOUR: fromEnv('SERVICE_OPEN_HOUR', 6),
  SERVICE_CLOSE_HOUR: fromEnv('SERVICE_CLOSE_HOUR', 22),
  SERVICE_TZ_OFFSET_MINUTES: 7 * 60,

  // Đặt chỗ
  BOOKING_HOLD_MINUTES: 5, // giữ chỗ chờ cọc
  HOLD_EXPIRY_GRACE_SECONDS: 60, // đệm cho IPN đến trễ trước khi job huỷ booking
  BOOKING_MIN_MINUTES: 15,
  BOOKING_MAX_MINUTES: 4 * 60,
  BOOKING_MAX_ADVANCE_DAYS: 7,
  BOOKING_START_TOLERANCE_SECONDS: 60, // cho phép startTime lệch 1 phút về quá khứ (độ trễ mạng)
  MAX_PENDING_BOOKINGS: 1,
  MAX_CONFIRMED_BOOKINGS: 2,
  MAX_EXPIRED_HOLDS_24H: 3,
  PORT_HEALTH_WINDOW_MINUTES: 60, // cổng fault/offline chỉ chặn booking bắt đầu trong khoảng này
  REFUND_CANCEL_BEFORE_HOURS: 2, // tài xế huỷ trước giờ bắt đầu ít nhất 2h thì được hoàn cọc

  // Check-in
  CHECKIN_EARLY_MINUTES: 15,
  CHECKIN_LATE_MINUTES: 15,
  AUTO_ATTACH_WINDOW_MINUTES: 15, // chỉ tự gán phiên mở trong 15' sau check-in
  CHECKIN_MAX_FAILED: 5,
  CHECKIN_LOCK_MINUTES: 10,

  // Phiên sạc / thiết bị
  MAX_PORT_POWER_KW: 22,
  ENERGY_TOLERANCE_KWH: 0.05, // sai số làm tròn khi kiểm tra điện năng tăng vô lý
  ENERGY_BASELINE_THRESHOLD_KWH: 0.5, // energyKwh đầu tiên lớn hơn mức này -> lấy làm mốc
  DEVICE_CLOCK_SKEW_MINUTES: 5,
  IDLE_POWER_KW: 0.1, // công suất <= mức này coi như xe đã đầy
  IDLE_DETECT_MINUTES: 5, // công suất thấp liên tục 5' -> báo xe đầy
  IDLE_GRACE_MINUTES: 15, // sau khi báo, ân hạn 15' rồi mới tính phí chiếm chỗ

  // Watchdog
  OFFLINE_AFTER_SECONDS: 60,
  WATCHDOG_GRACE_SECONDS: 90,
  WATCHDOG_INTERVAL_SECONDS: 30,

  // Thanh toán
  PAYMENT_EXPIRE_MINUTES: 15,
};
