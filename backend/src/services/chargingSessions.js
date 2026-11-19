// Object ChargingSession chuẩn theo docs/contracts.md mục 3.
// Phiên trái phép (không check-in) có userId = bookingId = null và không có paymentStatus.

// Kèm cờ "paid" = đã có giao dịch phiên thành công (không tính khoản cần hoàn)
const SESSION_SELECT = `
  SELECT cs.*,
    EXISTS (
      SELECT 1 FROM payments p
      WHERE p.charging_session_id = cs.id AND p.purpose = 'session'
        AND p.status = 'success' AND p.refund_status IS NULL
    ) AS paid
  FROM charging_sessions cs`;

// Điều kiện "phiên đã đóng mà tài xế còn nợ" — dùng chặn đặt chỗ mới (UNPAID_SESSION_EXISTS)
const UNPAID_SESSION_CONDITION = `
  cs.ended_at IS NOT NULL
  AND cs.user_id IS NOT NULL
  AND cs.cost - cs.deposit_applied > 0
  AND NOT EXISTS (
    SELECT 1 FROM payments p
    WHERE p.charging_session_id = cs.id AND p.purpose = 'session'
      AND p.status = 'success' AND p.refund_status IS NULL
  )`;

const num = (value) => (value === null || value === undefined ? null : Number(value));
const round2 = (value) => Math.round(value * 100) / 100;

// energyKwh tính tiền = số đo lớn nhất của thiết bị - mốc lúc mở phiên (energy_start_kwh)
const billedEnergy = (row) => Math.max(round2((num(row.energy_kwh) ?? 0) - (num(row.energy_start_kwh) ?? 0)), 0);

const toChargingSession = (row) => {
  const ended = row.ended_at !== null && row.ended_at !== undefined;
  const unauthorized = row.user_id === null || row.user_id === undefined;
  const cost = ended ? num(row.cost) : null;
  const depositApplied = num(row.deposit_applied) ?? 0;
  const amountDue = ended && !unauthorized && cost !== null ? Math.max(cost - depositApplied, 0) : null;

  let paymentStatus = null;
  if (amountDue !== null) {
    if (amountDue === 0) paymentStatus = depositApplied > 0 ? 'paid' : 'not_required';
    else paymentStatus = row.paid ? 'paid' : 'unpaid';
  }

  return {
    id: row.id,
    bookingId: row.booking_id,
    userId: row.user_id ?? null,
    portId: row.port_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    energyKwh: billedEnergy(row),
    energyCost: num(row.energy_cost),
    idleMinutes: row.idle_minutes ?? 0,
    idleFee: num(row.idle_fee) ?? 0,
    cost,
    depositApplied,
    amountDue,
    paymentStatus,
    unauthorized,
    needsReview: Boolean(row.needs_review),
    endReason: row.end_reason ?? null,
  };
};

module.exports = { SESSION_SELECT, UNPAID_SESSION_CONDITION, billedEnergy, toChargingSession };
