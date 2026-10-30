const { Router } = require('express');
const crypto = require('crypto');
const { query } = require('../db');
const { authMiddleware, assertOwnerOrAdmin } = require('../middleware/auth');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { validateBody } = require('../validation/validate');
const { createPaymentSchema } = require('../validation/schemas');
const { logAudit } = require('../services/audit');
const vnpay = require('../services/vnpay');

const router = Router();

// Object Payment chuẩn theo docs/contracts.md mục 3
const toPayment = (row) => ({
  id: row.id,
  chargingSessionId: row.charging_session_id,
  amount: Number(row.amount),
  status: row.status,
  vnpayTxnRef: row.vnpay_txn_ref,
  vnpayTransactionNo: row.vnpay_transaction_no,
  paidAt: row.paid_at,
});

const findSessionWithBookingUser = async (chargingSessionId) => {
  const { rows } = await query(
    `SELECT cs.*, b.user_id AS booking_user_id
     FROM charging_sessions cs
     LEFT JOIN bookings b ON b.id = cs.booking_id
     WHERE cs.id = $1`,
    [chargingSessionId],
  );
  return rows[0];
};

// POST /payments — điều kiện mở thanh toán theo docs/contracts.md mục 4:
// phiên đã kết thúc, cost > 0, chưa có payment "success", gắn với chính tài xế qua booking_id.
// Phiên vãng lai (booking_id = null) không thanh toán được qua hệ thống.
router.post(
  '/payments',
  authMiddleware,
  validateBody(createPaymentSchema),
  asyncHandler(async (req, res) => {
    const { chargingSessionId } = req.body;
    const session = await findSessionWithBookingUser(chargingSessionId);
    if (!session) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy phiên sạc');

    if (session.booking_user_id === null || req.user.id !== session.booking_user_id) {
      throw new AppError(403, 'FORBIDDEN', 'Phiên sạc này không thuộc về bạn hoặc là phiên vãng lai');
    }
    if (!session.ended_at) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Phiên sạc chưa kết thúc');
    }
    if (!(Number(session.cost) > 0)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Phiên sạc không có chi phí cần thanh toán');
    }

    const { rows: successRows } = await query(
      "SELECT 1 FROM payments WHERE charging_session_id = $1 AND status = 'success' LIMIT 1",
      [chargingSessionId],
    );
    if (successRows[0]) {
      throw new AppError(409, 'PAYMENT_ALREADY_PROCESSED', 'Phiên sạc này đã thanh toán thành công');
    }

    const amount = Number(session.cost);
    const txnRef = `SACDAU${Date.now()}${crypto.randomInt(100, 999)}`;

    await query(
      `INSERT INTO payments (charging_session_id, amount, status, vnpay_txn_ref)
       VALUES ($1, $2, 'pending', $3)`,
      [chargingSessionId, amount, txnRef],
    );

    const paymentUrl = vnpay.buildPaymentUrl({
      txnRef,
      amount,
      orderInfo: `Thanh toan phien sac ${chargingSessionId}`,
      ipAddr: req.ip,
    });

    await logAudit(req.user.id, 'payment.create', { chargingSessionId, txnRef, amount });
    ok(res, { paymentUrl }, 201);
  }),
);

// Lưu ý thứ tự route: "/payments/vnpay-return" phải khai báo TRƯỚC "/payments/:id",
// nếu không Express sẽ khớp "vnpay-return" vào :id (chuỗi hợp lệ) và route trên không bao giờ chạy tới.

// GET /payments/vnpay-return — KHÔNG theo envelope chuẩn, chỉ hiển thị kết quả cho người dùng,
// KHÔNG update DB ở route này (người dùng có thể tự sửa query string) — xem contracts.md mục 4.
router.get(
  '/payments/vnpay-return',
  asyncHandler(async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const valid = vnpay.verifySignature(req.query);
    if (!valid) {
      await logAudit(null, 'payment.invalid_signature', { route: 'vnpay-return', query: req.query });
      res.redirect(`${frontendUrl}/payment-result?status=failed&reason=invalid_signature`);
      return;
    }

    const success = req.query.vnp_ResponseCode === '00';
    const txnRef = String(req.query.vnp_TxnRef ?? '');
    res.redirect(
      `${frontendUrl}/payment-result?status=${success ? 'success' : 'failed'}&txnRef=${encodeURIComponent(txnRef)}`,
    );
  }),
);

// GET /payments/vnpay-ipn — server-to-server, VNPay gọi bằng GET (tài liệu chính thức
// sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html, mục IPN: "Phương thức: GET"),
// PHẢI trả đúng format VNPay yêu cầu ({ RspCode, Message }), không theo envelope chuẩn —
// xem contracts.md mục 4.
router.get(
  '/payments/vnpay-ipn',
  asyncHandler(async (req, res) => {
    const params = req.query;
    const valid = vnpay.verifySignature(params);
    if (!valid) {
      await logAudit(null, 'payment.invalid_signature', { route: 'vnpay-ipn', params });
      res.json({ RspCode: '97', Message: 'Invalid signature' });
      return;
    }

    const { rows } = await query('SELECT * FROM payments WHERE vnpay_txn_ref = $1', [params.vnp_TxnRef]);
    const payment = rows[0];
    if (!payment) {
      res.json({ RspCode: '01', Message: 'Order not found' });
      return;
    }
    if (payment.status !== 'pending') {
      res.json({ RspCode: '02', Message: 'Order already confirmed' });
      return;
    }

    if (params.vnp_ResponseCode === '00') {
      await query("UPDATE payments SET status = 'success', paid_at = now(), vnpay_transaction_no = $1 WHERE id = $2", [
        params.vnp_TransactionNo ?? null,
        payment.id,
      ]);
      await logAudit(null, 'payment.success', { txnRef: params.vnp_TxnRef, transactionNo: params.vnp_TransactionNo });
    } else {
      await query("UPDATE payments SET status = 'failed' WHERE id = $1", [payment.id]);
      await logAudit(null, 'payment.failed', { txnRef: params.vnp_TxnRef, responseCode: params.vnp_ResponseCode });
    }

    // VNPay chỉ cần biết server đã nhận & xử lý xong thông báo (RspCode 00), kể cả khi giao dịch failed
    res.json({ RspCode: '00', Message: 'Confirm Success' });
  }),
);

router.get(
  '/payments/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy giao dịch');
    }

    const { rows } = await query(
      `SELECT pay.*, b.user_id AS booking_user_id
       FROM payments pay
       JOIN charging_sessions cs ON cs.id = pay.charging_session_id
       LEFT JOIN bookings b ON b.id = cs.booking_id
       WHERE pay.id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy giao dịch');
    assertOwnerOrAdmin(req.user, row.booking_user_id);
    ok(res, toPayment(row));
  }),
);

module.exports = router;
