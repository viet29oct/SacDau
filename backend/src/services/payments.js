const crypto = require('crypto');
const pool = require('../db');
const vnpay = require('./vnpay');
const { logAudit } = require('./audit');

// Object Payment chuẩn theo docs/contracts.md mục 3
const toPayment = (row) => ({
  id: row.id,
  purpose: row.purpose,
  bookingId: row.booking_id,
  chargingSessionId: row.charging_session_id,
  amount: Number(row.amount),
  status: row.status,
  refundStatus: row.refund_status,
  vnpayTxnRef: row.vnpay_txn_ref,
  vnpayTransactionNo: row.vnpay_transaction_no,
  paidAt: row.paid_at,
  createdAt: row.created_at,
});

const newTxnRef = () => `SACDAU${Date.now()}${crypto.randomInt(100, 999)}`;
const newCheckInCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// Tạo giao dịch VNPay (cọc hoặc phiên) trong transaction của người gọi. Lưu sẵn link đã ký để
// lấy lại đúng link cũ khi tài xế lỡ đóng tab, và lưu vnp_CreateDate (querydr bắt buộc trường này).
const createVnpayPayment = async (
  client,
  { purpose, bookingId = null, chargingSessionId = null, userId, amount, expiresAt, ipAddr, orderInfo },
) => {
  const txnRef = newTxnRef();
  const createDate = vnpay.toVnpDate(new Date());
  const expireDate = vnpay.toVnpDate(expiresAt);
  const paymentUrl = vnpay.buildPaymentUrl({ txnRef, amount, orderInfo, ipAddr, createDate, expireDate });
  const { rows } = await client.query(
    `INSERT INTO payments (purpose, booking_id, charging_session_id, user_id, amount, status, vnpay_txn_ref,
                           vnp_create_date, vnp_expire_date, expires_at, checkout_url)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10)
     RETURNING *`,
    [purpose, bookingId, chargingSessionId, userId, amount, txnRef, createDate, expireDate, expiresAt, paymentUrl],
  );
  return { payment: rows[0], paymentUrl };
};

// Ghi nhận giao dịch VNPay đã trả thành công (dùng chung cho IPN và đối soát querydr).
// Khoá dòng cha (booking / phiên) trước khi kiểm tra để 2 giao dịch song song không cùng lọt.
// Trả { refund } = true khi tiền đã bị trừ nhưng không dùng được (booking đã huỷ, trả trùng...)
// -> vẫn ghi success + refund_status='due' để admin hoàn, KHÔNG bỏ qua im lặng.
const applySuccessfulPayment = async (client, payment, transactionNo) => {
  let refund = false;
  if (payment.purpose === 'booking_deposit') {
    const { rows } = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [payment.booking_id]);
    const booking = rows[0];
    const { rows: dup } = await client.query(
      `SELECT 1 FROM payments WHERE booking_id = $1 AND purpose = 'booking_deposit'
         AND status = 'success' AND refund_status IS NULL AND id <> $2`,
      [payment.booking_id, payment.id],
    );
    if (booking?.status === 'pending' && !dup[0]) {
      await client.query(
        "UPDATE bookings SET status = 'confirmed', check_in_code = $1, hold_expires_at = NULL WHERE id = $2",
        [newCheckInCode(), booking.id],
      );
    } else {
      refund = true; // booking đã huỷ (hết hạn giữ chỗ/tài xế huỷ) hoặc cọc đã trả trước đó
    }
  } else {
    await client.query('SELECT id FROM charging_sessions WHERE id = $1 FOR UPDATE', [payment.charging_session_id]);
    const { rows: dup } = await client.query(
      `SELECT 1 FROM payments WHERE charging_session_id = $1 AND purpose = 'session'
         AND status = 'success' AND refund_status IS NULL AND id <> $2`,
      [payment.charging_session_id, payment.id],
    );
    refund = Boolean(dup[0]);
  }

  await client.query(
    `UPDATE payments SET status = 'success', paid_at = now(), vnpay_transaction_no = $1, refund_status = $2
     WHERE id = $3`,
    [transactionNo ?? null, refund ? 'due' : null, payment.id],
  );
  return { refund };
};

// Xử lý IPN VNPay (chữ ký đã được route kiểm tra). Trả đúng format VNPay: { RspCode, Message }.
const processIpn = async (params) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM payments WHERE vnpay_txn_ref = $1 FOR UPDATE', [
      String(params.vnp_TxnRef ?? ''),
    ]);
    const payment = rows[0];
    if (!payment) {
      await client.query('ROLLBACK');
      return { RspCode: '01', Message: 'Order not found' };
    }
    // Chống sửa số tiền: VNPay gửi số tiền * 100
    if (Number(params.vnp_Amount) !== Math.round(Number(payment.amount) * 100)) {
      await client.query('ROLLBACK');
      await logAudit(null, 'payment.invalid_amount', { txnRef: payment.vnpay_txn_ref, vnpAmount: params.vnp_Amount });
      return { RspCode: '04', Message: 'Invalid amount' };
    }
    if (payment.status === 'success') {
      await client.query('ROLLBACK');
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    const paid = params.vnp_ResponseCode === '00' && (params.vnp_TransactionStatus ?? '00') === '00';
    if (!paid) {
      if (payment.status === 'failed') {
        await client.query('ROLLBACK');
        return { RspCode: '02', Message: 'Order already confirmed' };
      }
      await client.query("UPDATE payments SET status = 'failed' WHERE id = $1", [payment.id]);
      await client.query('COMMIT');
      await logAudit(null, 'payment.failed', { txnRef: payment.vnpay_txn_ref, responseCode: params.vnp_ResponseCode });
      return { RspCode: '00', Message: 'Confirm Success' };
    }

    // Kể cả payment đã bị job đánh 'failed' (hết hạn giữ chỗ) mà VNPay vẫn báo đã trả -> ghi nhận
    const { refund } = await applySuccessfulPayment(client, payment, params.vnp_TransactionNo);
    await client.query('COMMIT');
    await logAudit(null, refund ? 'payment.success_refund_due' : 'payment.success', {
      txnRef: payment.vnpay_txn_ref,
      purpose: payment.purpose,
      transactionNo: params.vnp_TransactionNo ?? null,
    });
    return { RspCode: '00', Message: 'Confirm Success' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { toPayment, createVnpayPayment, applySuccessfulPayment, processIpn, newCheckInCode };
