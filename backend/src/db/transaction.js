const pool = require('./index');

// Chạy fn(client) trong 1 transaction: COMMIT nếu fn chạy xong, ROLLBACK nếu fn ném lỗi.
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { withTransaction };
