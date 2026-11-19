const { Router } = require('express');
const { query } = require('../db');
const { withTransaction } = require('../db/transaction');
const { authMiddleware, rbacMiddleware, assertOwnerOrAdmin } = require('../middleware/auth');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { validateBody, parseBody } = require('../validation/validate');
const { createPaymentSchema, markRefundedSchema } = require('../validation/schemas');
const { logAudit } = require('../services/audit');
const rules = require('../config/rules');
const vnpay = require('../services/vnpay');
const { createVnpayPayment, processIpn, toPayment } = require('../services/payments');

const router = Router();

// Thanh toán chỉ qua VNPay (docs/LUONG_NGHIEP_VU.md mục 9). Cọc khi đặt chỗ tạo ở routes/bookings.js;
// route này cho phần còn lại sau phiên sạc + các route VNPay gọi về + xử lý hoàn tiền.

const parsePaymentId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy giao dịch');
  return id;
};

const findPayment = async (id) => {
  const { rows } = await query('SELECT * FROM payments WHERE id = $1', [id]);
  const payment = rows[0];
  if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy giao dịch');
  return payment;
};

// POST /payments { chargingSessionId } — trả phần còn lại (amountDue = tổng tiền phiên - cọc đã trừ).
// Chỉ chủ phiên; phiên trái phép không có chủ nên không ai trả được.
router.post(
  '/payments',
  authMiddleware,
  validateBody(createPaymentSchema),
  asyncHandler(async (req, res) => {
    const { chargingSessionId } = req.body;
    const now = new Date();

    const { payment, paymentUrl } = await withTransaction(async (client) => {
      // Khoá phiên: 2 request "Thanh toán" song song không tạo được 2 giao dịch
      const { rows } = await client.query('SELECT * FROM charging_sessions WHERE id = $1 FOR UPDATE', [
        chargingSessionId,
      ]);
      const session = rows[0];
      if (!session) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy phiên sạc');
      if (session.user_id === null || session.user_id !== req.user.id) {
        throw new AppError(403, 'FORBIDDEN', 'Phiên sạc này không thuộc về bạn');
      }
      if (!session.ended_at) throw new AppError(400, 'VALIDATION_ERROR', 'Phiên sạc chưa kết thúc');

      const amountDue = Number(session.cost) - Number(session.deposit_applied);
      const { rows: existing } = await client.query(
        `SELECT id, status, expires_at FROM payments
         WHERE charging_session_id = $1 AND purpose = 'session'
           AND (status = 'pending' OR (status = 'success' AND refund_status IS NULL))`,
        [chargingSessionId],
      );
      if (existing.some((p) => p.status === 'success')) {
        throw new AppError(409, 'PAYMENT_ALREADY_PROCESSED', 'Phiên sạc này đã thanh toán');
      }
      if (!(amountDue > 0)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Phiên sạc không còn khoản cần thanh toán (cọc đã phủ đủ)');
      }
      const inProgress = existing.find((p) => p.status === 'pending' && new Date(p.expires_at) > now);
      if (inProgress) {
        throw new AppError(
          409,
          'PAYMENT_IN_PROGRESS',
          'Đang có giao dịch chưa hoàn tất cho phiên này, hãy dùng lại link cũ',
          { paymentId: inProgress.id },
        );
      }

      return createVnpayPayment(client, {
        purpose: 'session',
        chargingSessionId,
        userId: req.user.id,
        amount: amountDue,
        expiresAt: new Date(now.getTime() + rules.PAYMENT_EXPIRE_MINUTES * rules.MINUTE_MS),
        ipAddr: req.ip,
        orderInfo: `Thanh toan phien sac ${chargingSessionId}`,
      });
    });

    await logAudit(req.user.id, 'payment.create', {
      chargingSessionId,
      txnRef: payment.vnpay_txn_ref,
      amount: Number(payment.amount),
    });
    ok(res, { paymentId: payment.id, paymentUrl }, 201);
  }),
);

// Lưu ý thứ tự route: các path cố định (/refunds, /vnpay-return, /vnpay-ipn) phải khai báo TRƯỚC
// "/payments/:id", nếu không Express khớp chúng vào :id.

// GET /payments/refunds?status=due|refunded — admin xem các khoản cần hoàn / đã hoàn
router.get(
  '/payments/refunds',
  authMiddleware,
  rbacMiddleware('admin'),
  asyncHandler(async (req, res) => {
    const status = req.query.status === 'refunded' ? 'refunded' : 'due';
    const { rows } = await query('SELECT * FROM payments WHERE refund_status = $1 ORDER BY paid_at, id', [status]);
    ok(res, rows.map(toPayment));
  }),
);

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

// GET /payments/vnpay-ipn — server-to-server, VNPay gọi bằng GET, PHẢI trả đúng format VNPay
// ({ RspCode, Message }), không theo envelope chuẩn. Xử lý chung cho cọc + phiên: so số tiền,
// booking cọc -> confirmed, trả trùng / cọc sau khi huỷ -> cần hoàn (services/payments.js).
router.get(
  '/payments/vnpay-ipn',
  asyncHandler(async (req, res) => {
    const params = req.query;
    if (!vnpay.verifySignature(params)) {
      await logAudit(null, 'payment.invalid_signature', { route: 'vnpay-ipn', params });
      res.json({ RspCode: '97', Message: 'Invalid signature' });
      return;
    }
    res.json(await processIpn(params));
  }),
);

// GET /payments/:id — người trả hoặc admin
router.get(
  '/payments/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const payment = await findPayment(parsePaymentId(req.params.id));
    assertOwnerOrAdmin(req.user, payment.user_id);
    ok(res, toPayment(payment));
  }),
);

// GET /payments/:id/checkout — lấy lại ĐÚNG link VNPay cũ (cùng vnp_TxnRef) khi lỡ đóng tab,
// thay vì tạo giao dịch thứ 2 (dễ trả 2 lần)
router.get(
  '/payments/:id/checkout',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const payment = await findPayment(parsePaymentId(req.params.id));
    if (payment.user_id !== req.user.id) throw new AppError(403, 'FORBIDDEN', 'Không có quyền trên giao dịch này');
    if (payment.status !== 'pending') {
      throw new AppError(409, 'PAYMENT_ALREADY_PROCESSED', 'Giao dịch đã xử lý xong');
    }
    if (!payment.checkout_url || new Date(payment.expires_at) <= new Date()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Giao dịch đã hết hạn, hãy tạo giao dịch mới');
    }
    ok(res, { paymentUrl: payment.checkout_url });
  }),
);

// POST /payments/:id/mark-refunded { note? } — admin xác nhận đã hoàn tiền (hoàn tay ngoài hệ thống)
router.post(
  '/payments/:id/mark-refunded',
  authMiddleware,
  rbacMiddleware('admin'),
  asyncHandler(async (req, res) => {
    const id = parsePaymentId(req.params.id);
    const { note } = parseBody(markRefundedSchema, req.body ?? {});
    await findPayment(id);
    const { rows } = await query(
      `UPDATE payments SET refund_status = 'refunded', refunded_at = now(), refunded_by = $2, refund_note = $3
       WHERE id = $1 AND refund_status = 'due' RETURNING *`,
      [id, req.user.id, note ?? null],
    );
    if (!rows[0]) throw new AppError(409, 'PAYMENT_ALREADY_PROCESSED', 'Giao dịch này không ở trạng thái cần hoàn');
    await logAudit(req.user.id, 'payment.refunded', { paymentId: id, amount: Number(rows[0].amount), note: note ?? null });
    ok(res, toPayment(rows[0]));
  }),
);

module.exports = router;
