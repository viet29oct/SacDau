// Chạy trước mỗi file test, trước khi import app/db.
// Test luôn dùng DB riêng sacdau_test (vì mỗi test xoá sạch bảng users), không đụng DB dev.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://sacdau_user:sacdau_dev_pw@localhost:5433/sacdau_test';
process.env.JWT_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';

if (!/_test$/.test(new URL(process.env.DATABASE_URL).pathname)) {
  throw new Error('DATABASE_URL của test phải trỏ tới DB có tên kết thúc bằng _test');
}
