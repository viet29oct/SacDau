const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');

afterAll(() => pool.end());

describe('GET /health', () => {
  it('DB chạy -> 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ok', db: 'connected' });
  });

  it('DB lỗi -> 500 DB_UNAVAILABLE, không lộ thông báo lỗi gốc của Postgres', async () => {
    const spy = jest
      .spyOn(pool, 'query')
      .mockRejectedValueOnce(new Error('password authentication failed for user "sacdau_user"'));
    try {
      const res = await request(app).get('/health');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('DB_UNAVAILABLE');
      expect(JSON.stringify(res.body)).not.toMatch(/sacdau_user|password/);
    } finally {
      spy.mockRestore();
    }
  });
});
