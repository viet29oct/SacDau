// Chạy trước mỗi file test, trước khi import app/db.
// Test luôn dùng DB riêng sacdau_test (vì mỗi test xoá sạch bảng users), không đụng DB dev.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://sacdau_user:sacdau_dev_pw@localhost:5433/sacdau_test';
process.env.JWT_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
// Test đăng ký hàng chục tài xế từ cùng IP; giới hạn thật (10/giờ) test riêng ở auth.test.js
process.env.REGISTER_RATE_LIMIT = '1000';

// VNPay: không gọi mạng thật trong test, chỉ cần đủ biến để buildPaymentUrl/verifySignature không throw
process.env.VNPAY_TMN_CODE = 'TESTTMN';
process.env.VNPAY_HASH_SECRET = 'test_vnpay_hash_secret';
process.env.VNPAY_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
process.env.VNPAY_RETURN_URL = 'http://localhost:3000/payments/vnpay-return';
process.env.UNIT_PRICE_PER_KWH = '3500';
process.env.BOOKING_DEPOSIT_VND = '20000';
// Giờ phục vụ mở cả ngày trong test để kết quả không phụ thuộc giờ chạy test;
// luật 6h-22h được test riêng (bookings.test.js, nạp lại module với env khác).
process.env.SERVICE_OPEN_HOUR = '0';
process.env.SERVICE_CLOSE_HOUR = '24';

if (!/_test$/.test(new URL(process.env.DATABASE_URL).pathname)) {
  throw new Error('DATABASE_URL của test phải trỏ tới DB có tên kết thúc bằng _test');
}
