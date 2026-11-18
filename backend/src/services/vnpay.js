const crypto = require('crypto');

// Helper VNPay sandbox tự viết bằng crypto built-in (không SDK bên thứ 3) — xem
// docs/TECH_STACK.md mục 2.2b. Chi tiết thuật toán HMAC-SHA512: build chuỗi ký từ các
// param đã sort alphabet, encode kiểu application/x-www-form-urlencoded (space -> '+').

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
};

const sortParams = (params) =>
  Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});

const buildSignData = (sortedParams) =>
  Object.entries(sortedParams)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value)).replace(/%20/g, '+')}`)
    .join('&');

const sign = (sortedParams, hashSecret) =>
  crypto.createHmac('sha512', hashSecret).update(buildSignData(sortedParams), 'utf-8').digest('hex');

const pad2 = (n) => String(n).padStart(2, '0');

// Định dạng vnp_CreateDate/vnp_ExpireDate VNPay yêu cầu: yyyyMMddHHmmss theo giờ Việt Nam (GMT+7).
// Tính tường minh từ UTC, không phụ thuộc múi giờ của máy chạy server.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const toVnpDate = (date = new Date()) => {
  const d = new Date(date.getTime() + VN_OFFSET_MS);
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`
  );
};

// Tạo URL redirect sang VNPay sandbox — amount tính bằng VNĐ (contracts.md), VNPay yêu cầu *100.
// expireDate: quá thời điểm này VNPay không cho thanh toán nữa (chặn trả cọc sau khi slot đã nhả).
const buildPaymentUrl = ({ txnRef, amount, orderInfo, ipAddr, createDate = toVnpDate(), expireDate }) => {
  const tmnCode = requireEnv('VNPAY_TMN_CODE');
  const hashSecret = requireEnv('VNPAY_HASH_SECRET');
  const vnpUrl = requireEnv('VNPAY_URL');
  const returnUrl = requireEnv('VNPAY_RETURN_URL');

  const params = sortParams({
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Amount: Math.round(amount * 100),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr || '127.0.0.1',
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate,
  });

  const secureHash = sign(params, hashSecret);
  return `${vnpUrl}?${buildSignData(params)}&vnp_SecureHash=${secureHash}`;
};

// Verify chữ ký ở /payments/vnpay-return và /payments/vnpay-ipn trước khi tin dữ liệu VNPay gửi về.
// So sánh bằng timingSafeEqual để tránh lộ thông tin qua thời gian so sánh chuỗi.
const verifySignature = (queryParams) => {
  const hashSecret = requireEnv('VNPAY_HASH_SECRET');
  const { vnp_SecureHash: receivedHash, vnp_SecureHashType: _ignored, ...rest } = queryParams;
  if (!receivedHash) return false;

  const expected = sign(sortParams(rest), hashSecret);
  const expectedBuf = Buffer.from(expected, 'utf-8');
  const receivedBuf = Buffer.from(String(receivedHash), 'utf-8');
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
};

module.exports = { buildPaymentUrl, verifySignature, toVnpDate };
