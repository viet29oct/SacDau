const { AppError } = require('../utils/http');
const rules = require('../config/rules');

// Object Booking chuẩn theo docs/contracts.md mục 3.
// checkInCode chỉ trả cho chính tài xế của booking (includeCheckInCode = true ở GET /bookings/me...).

const CODE_VISIBLE_STATUSES = new Set(['confirmed', 'checked_in', 'completed']);

// Kèm id giao dịch cọc mới nhất để tài xế lấy lại link VNPay (GET /payments/:id/checkout)
const BOOKING_SELECT = `
  SELECT b.*,
    (SELECT p.id FROM payments p
     WHERE p.booking_id = b.id AND p.purpose = 'booking_deposit'
     ORDER BY p.id DESC LIMIT 1) AS deposit_payment_id
  FROM bookings b`;

const toBooking = (row, { includeCheckInCode = false } = {}) => {
  const booking = {
    id: row.id,
    userId: row.user_id,
    portId: row.port_id,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    holdExpiresAt: row.hold_expires_at,
    depositAmount: Number(row.deposit_amount ?? 0),
    depositPaymentId: row.deposit_payment_id ?? null,
    checkInCode: includeCheckInCode && CODE_VISIBLE_STATUSES.has(row.status) ? row.check_in_code : null,
    checkedInAt: row.checked_in_at,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
  };
  if (row.driver_name !== undefined) booking.driverName = row.driver_name;
  return booking;
};

const VN_OFFSET_MS = rules.SERVICE_TZ_OFFSET_MINUTES * rules.MINUTE_MS;

// Giờ Việt Nam dạng { dateKey, minutes } — tính từ UTC, không phụ thuộc múi giờ máy chủ
const toVnClock = (date) => {
  const d = new Date(date.getTime() + VN_OFFSET_MS);
  return {
    dateKey: `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`,
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60,
  };
};

// [đầu ngày, đầu ngày hôm sau) theo giờ VN cho chuỗi YYYY-MM-DD (mặc định: hôm nay)
const vnDayRange = (dateStr, now = new Date()) => {
  let parts;
  if (dateStr) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr));
    if (!match) throw new AppError(400, 'VALIDATION_ERROR', 'date phải có dạng YYYY-MM-DD');
    parts = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    const vn = new Date(now.getTime() + VN_OFFSET_MS);
    parts = [vn.getUTCFullYear(), vn.getUTCMonth() + 1, vn.getUTCDate()];
  }
  const [y, m, d] = parts;
  const from = new Date(Date.UTC(y, m - 1, d) - VN_OFFSET_MS);
  return { from, to: new Date(from.getTime() + 24 * 60 * rules.MINUTE_MS) };
};

// Luật thời gian của booking (docs/LUONG_NGHIEP_VU.md mục 4, điểm 3)
const assertBookingWindow = (start, end, now = new Date()) => {
  const fail = (message) => {
    throw new AppError(400, 'VALIDATION_ERROR', message);
  };
  if (start.getTime() < now.getTime() - rules.BOOKING_START_TOLERANCE_SECONDS * 1000) {
    fail('startTime phải lớn hơn hoặc bằng hiện tại');
  }
  if (start.getTime() > now.getTime() + rules.BOOKING_MAX_ADVANCE_DAYS * 24 * 60 * rules.MINUTE_MS) {
    fail(`Chỉ đặt trước tối đa ${rules.BOOKING_MAX_ADVANCE_DAYS} ngày`);
  }
  const minutes = (end.getTime() - start.getTime()) / rules.MINUTE_MS;
  if (minutes < rules.BOOKING_MIN_MINUTES || minutes > rules.BOOKING_MAX_MINUTES) {
    fail(`Thời lượng đặt chỗ phải từ ${rules.BOOKING_MIN_MINUTES} phút đến ${rules.BOOKING_MAX_MINUTES / 60} giờ`);
  }
  const s = toVnClock(start);
  const e = toVnClock(end);
  if (
    s.dateKey !== e.dateKey ||
    s.minutes < rules.SERVICE_OPEN_HOUR * 60 ||
    e.minutes > rules.SERVICE_CLOSE_HOUR * 60
  ) {
    fail(`Booking phải nằm trong giờ phục vụ ${rules.SERVICE_OPEN_HOUR}h-${rules.SERVICE_CLOSE_HOUR}h (giờ Việt Nam)`);
  }
};

module.exports = { BOOKING_SELECT, toBooking, toVnClock, vnDayRange, assertBookingWindow };
