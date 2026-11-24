const { Pool } = require('pg');
const { logger } = require('../logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Postgres khởi động lại / rớt mạng thì kết nối đang rảnh trong pool phát 'error'.
// Không ai nghe sự kiện này thì Node ném lỗi và cả tiến trình thoát (kéo theo MQTT, WebSocket, job).
// Pool tự bỏ kết nối hỏng và mở kết nối mới ở query sau, nên chỉ cần ghi log.
pool.on('error', (err) => logger.error({ err }, 'pg: kết nối rảnh trong pool bị lỗi'));

// Giữ tham chiếu tới pool.query gốc trước khi gán đè lên pool.query bên dưới,
// nếu không query() sẽ gọi lại chính pool.query (đã bị đè) -> đệ quy vô hạn.
const rawQuery = pool.query.bind(pool);
const query = (text, params) => rawQuery(text, params);

module.exports = pool;
module.exports.query = query;
