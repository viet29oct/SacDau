const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Giữ tham chiếu tới pool.query gốc trước khi gán đè lên pool.query bên dưới,
// nếu không query() sẽ gọi lại chính pool.query (đã bị đè) -> đệ quy vô hạn.
const rawQuery = pool.query.bind(pool);
const query = (text, params) => rawQuery(text, params);

module.exports = pool;
module.exports.query = query;
