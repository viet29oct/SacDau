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

module.exports = { BOOKING_SELECT, toBooking };
