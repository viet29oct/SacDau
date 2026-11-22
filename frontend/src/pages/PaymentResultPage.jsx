import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import SiteBar from '../components/SiteBar';

// Backend chuyển về đây sau /payments/vnpay-return (docs/contracts.md mục 4).
// Query string do người dùng sửa được, nên trạng thái thật luôn hỏi lại backend.
// Tiền cọc được xác nhận khi VNPay gọi IPN; IPN có thể tới sau vài giây nên trang hỏi lại vài lần.
const POLL_MS = 4000;
const POLL_MAX = 15;
const LOOKUP_LIMIT = 5;

const formatVnd = (n) => `${Number(n).toLocaleString('vi-VN')}đ`;

const paymentLabel = (p) => {
  if (p.refundStatus === 'due') return 'Cần hoàn tiền';
  if (p.refundStatus === 'refunded') return 'Đã hoàn tiền';
  if (p.status === 'success') return 'Đã xác nhận';
  if (p.status === 'failed') return 'Không thành công';
  return 'Đang chờ VNPay xác nhận';
};

const bookingLabel = {
  pending: 'Chờ cọc',
  confirmed: 'Đã cọc',
  checked_in: 'Đã check-in',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã huỷ',
  no_show: 'Không đến',
};

const headings = {
  success: {
    title: 'VNPay báo đã thanh toán.',
    lead: 'Hệ thống xác nhận khi VNPay gửi thông báo tới máy chủ, thường chỉ vài giây.',
  },
  failed: {
    title: 'Thanh toán không thành công.',
    lead: 'VNPay báo giao dịch này không thành công.',
  },
  confirmed: {
    title: 'Đã nhận tiền cọc.',
    lead: 'Hệ thống đã xác nhận khoản cọc này với VNPay.',
  },
  rejected: {
    title: 'Thanh toán không thành công.',
    lead: 'Hệ thống ghi nhận khoản cọc này không thành công.',
  },
  timeout: {
    title: 'Hết thời gian giữ chỗ.',
    lead: 'Hệ thống chưa nhận được xác nhận của VNPay trong 5 phút giữ chỗ. Nếu tiền đã bị trừ, khoản cọc sẽ được hoàn lại.',
  },
  refundDue: {
    title: 'Tiền cọc sẽ được hoàn lại.',
    lead: 'Khoản cọc này đang trong danh sách cần hoàn của hệ thống.',
  },
  refunded: {
    title: 'Đã hoàn tiền cọc.',
    lead: 'Khoản cọc này đã được hoàn lại cho bạn.',
  },
  invalid: {
    title: 'Không xác minh được kết quả.',
    lead: 'Dữ liệu VNPay gửi về không khớp chữ ký, hệ thống không ghi nhận giao dịch này.',
  },
  none: {
    title: 'Chưa có kết quả thanh toán.',
    lead: 'Trang này hiện kết quả sau khi bạn thanh toán qua VNPay.',
  },
};

async function findDeposit(txnRef) {
  const bookings = await api.get('/bookings/me');
  const candidates = bookings
    .filter((b) => b.depositPaymentId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, LOOKUP_LIMIT);
  for (const booking of candidates) {
    const payment = await api.get(`/payments/${booking.depositPaymentId}`);
    if (payment.vnpayTxnRef === txnRef) return { booking, payment };
  }
  return null;
}

export default function PaymentResultPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const txnRef = params.get('txnRef') ?? '';
  const status = params.get('status');
  const kind =
    params.get('reason') === 'invalid_signature'
      ? 'invalid'
      : status === 'success'
        ? 'success'
        : status === 'failed'
          ? 'failed'
          : 'none';

  const [check, setCheck] = useState({ phase: 'idle' });

  useEffect(() => {
    if (!user || !txnRef || kind === 'invalid' || kind === 'none') return undefined;
    let stopped = false;
    let timer = null;
    let attempts = 0;

    async function run() {
      attempts += 1;
      try {
        const found = await findDeposit(txnRef);
        if (stopped) return;
        if (!found) {
          setCheck({ phase: 'notfound' });
          return;
        }
        const waiting = found.payment.status === 'pending' && found.booking.status === 'pending';
        setCheck({ phase: 'found', ...found, waiting, gaveUp: waiting && attempts >= POLL_MAX });
        if (waiting && attempts < POLL_MAX) timer = setTimeout(run, POLL_MS);
      } catch (err) {
        if (!stopped) setCheck({ phase: 'error', message: err.message ?? 'Không tải được trạng thái thanh toán.' });
      }
    }

    setCheck({ phase: 'loading' });
    run();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [user, txnRef, kind]);

  // Khi backend đã có kết quả thì theo backend, không theo query string.
  const verified = check.phase === 'found' ? check.payment : null;
  const head = !verified
    ? headings[kind]
    : verified.refundStatus === 'refunded'
      ? headings.refunded
      : verified.refundStatus === 'due'
        ? headings.refundDue
        : verified.status === 'success'
        ? headings.confirmed
        : check.booking.cancelReason === 'payment_timeout'
          ? headings.timeout
          : verified.status === 'failed'
            ? headings.rejected
            : headings[kind];

  return (
    <>
      <SiteBar />
      <main id="main" className="notice">
        <div className="container notice__inner">
          {check.phase === 'found' && <p className="notice__plate">{formatVnd(check.payment.amount)}</p>}
          <div className="notice__head" aria-live="polite">
            <h1>{head.title}</h1>
            <p className="lead">{head.lead}</p>
          </div>

          {(authLoading || check.phase === 'loading') && (
            <p className="loading" role="status">
              Đang tải…
            </p>
          )}

          {check.phase === 'found' && (
            <dl className="rules">
              <div>
                <dt>Khoản</dt>
                <dd>Tiền cọc đặt chỗ #{check.booking.id}</dd>
              </div>
              <div>
                <dt>Mã giao dịch</dt>
                <dd>{txnRef}</dd>
              </div>
              <div>
                <dt>Tiền cọc</dt>
                <dd>{paymentLabel(check.payment)}</dd>
              </div>
              <div>
                <dt>Lượt đặt chỗ</dt>
                <dd>{bookingLabel[check.booking.status] ?? check.booking.status}</dd>
              </div>
              {check.booking.checkInCode && (
                <div>
                  <dt>Mã check-in</dt>
                  <dd>{check.booking.checkInCode}</dd>
                </div>
              )}
            </dl>
          )}

          {check.phase === 'found' && check.gaveUp && (
            <p className="form-note">
              VNPay chưa gửi xác nhận. Lượt đặt chỗ chờ cọc tự huỷ khi hết 5 phút giữ chỗ; tiền tới muộn được ghi nhận
              để hoàn lại.
            </p>
          )}

          {check.phase === 'notfound' && (
            <p className="form-note">Không tìm thấy khoản cọc khớp mã giao dịch này trong tài khoản đang đăng nhập.</p>
          )}

          {check.phase === 'error' && (
            <p className="form-error" role="alert">
              {check.message}
            </p>
          )}

          {!authLoading && !user && (kind === 'success' || kind === 'failed') && (
            <p className="form-note">Đăng nhập để xem trạng thái tiền cọc của giao dịch này.</p>
          )}

          <div className="notice__actions">
            {user ? (
              <Link to="/bookings" className="btn btn--primary">
                Xem lịch đặt chỗ
              </Link>
            ) : (
              <Link to="/login" state={{ from: location }} className="btn btn--primary">
                Đăng nhập
              </Link>
            )}
            <Link to="/" className="btn">
              Về trang chủ
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
