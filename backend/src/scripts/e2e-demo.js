// Chạy thử toàn luồng nghiệp vụ trên server dev THẬT: API + Mosquitto (có mật khẩu) + WebSocket.
// Đặc tả luồng: docs/LUONG_NGHIEP_VU.md.
//
// Điều kiện: docker compose up -d (Postgres + Mosquitto đã có mosquitto/passwd), backend đang chạy
// (npm run dev) ở http://localhost:3000, file mosquitto/stations.local có dòng ST01=<mật khẩu MQTT trạm>,
// DB dev chưa có trạm mã ST01, và đang trong giờ phục vụ (6h-22h giờ VN) vì có bước "đặt ngay".
//
// Dùng: npm run e2e:demo            (chạy xong tự dọn dữ liệu đã tạo)
//       npm run e2e:demo -- --keep  (giữ lại dữ liệu để xem trong DB/giao diện)
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const pool = require('../db');
const { query } = require('../db');

const ROOT = path.join(__dirname, '..', '..', '..');
const API = `http://localhost:${process.env.PORT ?? 3000}`;
const KEEP = process.argv.includes('--keep');
const EMAIL_DOMAIN = '@sacdau.test';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (label, value) => console.log(`${label}:`, typeof value === 'string' ? value : JSON.stringify(value));

const stationPassword = () => {
  const file = path.join(ROOT, 'mosquitto', 'stations.local');
  const match = fs.existsSync(file) && fs.readFileSync(file, 'utf8').match(/^ST01=(\S+)/m);
  if (!match) throw new Error('Thiếu mật khẩu MQTT của trạm ST01 trong mosquitto/stations.local (xem mosquitto/README.md)');
  return match[1];
};

const call = async (method, urlPath, body, token) => {
  const res = await fetch(API + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// Ký giống services/vnpay.js để giả lập IPN (không cần trả tiền thật trên sandbox)
const signVnpay = (params) => {
  const keys = Object.keys(params).filter((k) => params[k] !== '' && params[k] != null).sort();
  const data = keys.map((k) => `${k}=${encodeURIComponent(String(params[k])).replace(/%20/g, '+')}`).join('&');
  return crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET).update(data, 'utf-8').digest('hex');
};

const cleanup = async (stationId) => {
  const { rows: payRows } = await query(
    `SELECT pay.vnpay_txn_ref FROM payments pay
     LEFT JOIN charging_sessions cs ON cs.id = pay.charging_session_id
     LEFT JOIN bookings b ON b.id = pay.booking_id
     JOIN ports p ON p.id = COALESCE(cs.port_id, b.port_id)
     WHERE p.station_id = $1`,
    [stationId],
  );
  const txnRefs = payRows.map((r) => r.vnpay_txn_ref);
  const users = `(SELECT id FROM users WHERE email LIKE '%${EMAIL_DOMAIN}')`;
  const ports = '(SELECT id FROM ports WHERE station_id = $1)';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM payments WHERE vnpay_txn_ref = ANY($1)`, [txnRefs]);
    await client.query(`DELETE FROM incidents WHERE port_id IN ${ports}`, [stationId]);
    await client.query('DELETE FROM telemetry WHERE station_id = $1', [stationId]);
    await client.query(`DELETE FROM charging_sessions WHERE port_id IN ${ports}`, [stationId]);
    await client.query(`DELETE FROM bookings WHERE port_id IN ${ports} OR user_id IN ${users}`, [stationId]);
    await client.query('DELETE FROM ports WHERE station_id = $1', [stationId]);
    await client.query('DELETE FROM stations WHERE id = $1', [stationId]);
    await client.query(
      `DELETE FROM audit_logs
       WHERE user_id IN ${users} OR detail->>'txnRef' = ANY($1) OR detail->>'email' LIKE '%${EMAIL_DOMAIN}'`,
      [txnRefs],
    );
    await client.query(`DELETE FROM users WHERE email LIKE '%${EMAIL_DOMAIN}'`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const main = async () => {
  const pw = stationPassword();
  const publish = (payload) =>
    execFileSync('docker', [
      'exec', 'sacdau_mosquitto', 'mosquitto_pub', '-u', 'ST01', '-P', pw, '-t', 'stations/ST01/status',
      '-m', JSON.stringify({ stationId: 'ST01', temperature: 30, timestamp: new Date().toISOString(), ...payload }),
    ]);

  if (!(await fetch(`${API}/health`).then((r) => r.ok).catch(() => false))) {
    throw new Error(`Backend chưa chạy ở ${API} — mở terminal khác chạy: npm run dev`);
  }
  const { rows: existing } = await query("SELECT id FROM stations WHERE code = 'ST01'");
  if (existing[0]) throw new Error('DB dev đã có trạm mã ST01 — xoá/đổi mã trạm đó trước khi chạy demo');

  execFileSync('node', [path.join(__dirname, 'create-admin.js'), 'E2E Admin', `e2e-admin${EMAIL_DOMAIN}`, 'matkhau123']);
  const admin = (await call('POST', '/auth/login', { email: `e2e-admin${EMAIL_DOMAIN}`, password: 'matkhau123' })).body.data;

  log('1. Tự đăng ký role owner (phải 400)', (await call('POST', '/auth/register', { name: 'X', email: `e2e-x${EMAIL_DOMAIN}`, password: 'matkhau123', role: 'owner' })).status);
  log('2. Admin tạo owner (phải 201)', (await call('POST', '/users', { name: 'Quản lý E2E', email: `e2e-owner${EMAIL_DOMAIN}`, password: 'matkhau123', role: 'owner' }, admin.accessToken)).status);
  const owner = (await call('POST', '/auth/login', { email: `e2e-owner${EMAIL_DOMAIN}`, password: 'matkhau123' })).body.data;

  const created = await call('POST', '/stations', { name: 'Trạm E2E', code: 'ST01', lat: 21.0368, lng: 105.7829, portsCount: 2 }, admin.accessToken);
  if (created.status !== 201) throw new Error(`Tạo trạm thất bại: ${JSON.stringify(created.body)}`);
  const station = created.body.data;
  try {
    await call('PATCH', `/stations/${station.id}/assign-owner`, { ownerId: owner.user.id }, admin.accessToken);
    publish({ portId: 1, status: 'idle', powerKw: 0, energyKwh: 0 });
    publish({ portId: 2, status: 'idle', powerKw: 0, energyKwh: 0 });
    await sleep(1000);
    log('3. Cổng online sau heartbeat MQTT', (await call('GET', `/stations/${station.id}`)).body.data.ports.map((p) => p.online));

    const driver = (await call('POST', '/auth/register', { name: 'Tài xế E2E', email: `e2e-driver${EMAIL_DOMAIN}`, password: 'matkhau123' })).body.data;
    const start = new Date(Date.now() + 60 * 1000);
    const booked = await call('POST', '/bookings', { portId: station.ports[0].id, startTime: start.toISOString(), endTime: new Date(start.getTime() + 30 * 60 * 1000).toISOString() }, driver.accessToken);
    if (booked.status !== 201) throw new Error(`Đặt chỗ thất bại: ${JSON.stringify(booked.body)}`);
    log('4. Đặt ngay tại trạm', { status: booked.body.data.status, paymentUrl: `${booked.body.data.paymentUrl.slice(0, 60)}...` });

    const deposit = (await call('GET', `/payments/${booked.body.data.depositPaymentId}`, null, driver.accessToken)).body.data;
    const ipnParams = { vnp_TxnRef: deposit.vnpayTxnRef, vnp_Amount: String(deposit.amount * 100), vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_TransactionNo: 'E2E0001' };
    log('5. IPN cọc (giả lập, ký bằng VNPAY_HASH_SECRET)', await fetch(`${API}/payments/vnpay-ipn?${new URLSearchParams({ ...ipnParams, vnp_SecureHash: signVnpay(ipnParams) })}`).then((r) => r.json()));
    const myBooking = (await call('GET', '/bookings/me', null, driver.accessToken)).body.data[0];
    log('   Booking sau IPN', { status: myBooking.status, checkInCode: myBooking.checkInCode });

    const wrongCode = myBooking.checkInCode === '000000' ? '111111' : '000000';
    const wrong = await call('POST', `/bookings/${myBooking.id}/check-in`, { code: wrongCode }, owner.accessToken);
    const right = await call('POST', `/bookings/${myBooking.id}/check-in`, { code: myBooking.checkInCode }, owner.accessToken);
    log('6. Check-in sai mã / đúng mã', [wrong.body.error?.code, right.body.data?.booking.status]);

    const ws = { anon: [], owner: [] };
    const anonWs = new WebSocket(`${API.replace('http', 'ws')}/ws`);
    anonWs.onmessage = (e) => ws.anon.push(JSON.parse(e.data));
    const ownerWs = new WebSocket(`${API.replace('http', 'ws')}/ws`);
    ownerWs.onmessage = (e) => ws.owner.push(JSON.parse(e.data));
    await sleep(500);
    ownerWs.send(JSON.stringify({ type: 'auth', token: owner.accessToken }));
    await sleep(500);

    publish({ portId: 1, status: 'charging', powerKw: 7, energyKwh: 0 });
    await sleep(1500);
    const open = (await call('GET', '/sessions/me', null, driver.accessToken)).body.data[0];
    log('7. Cắm súng sau check-in -> phiên gắn tài xế', { bookingId: open?.bookingId, endedAt: open?.endedAt });

    await sleep(12000);
    publish({ portId: 1, status: 'charging', powerKw: 7, energyKwh: 0.05 });
    await sleep(500);
    publish({ portId: 1, status: 'idle', powerKw: 0, energyKwh: 0 }); // giả ESP32 khởi động lại: energy về 0
    await sleep(1500);
    const closed = (await call('GET', '/sessions/me', null, driver.accessToken)).body.data[0];
    log('8. Rút súng (giả reboot gửi energy=0, điện năng vẫn giữ)', { energyKwh: closed.energyKwh, cost: closed.cost, depositApplied: closed.depositApplied, amountDue: closed.amountDue, paymentStatus: closed.paymentStatus });

    publish({ portId: 2, status: 'charging', powerKw: 7, energyKwh: 0 }); // không check-in
    await sleep(1500);
    publish({ portId: 2, status: 'idle', powerKw: 0, energyKwh: 0.01 });
    await sleep(1000);
    const sessions = (await call('GET', `/stations/${station.id}/sessions`, null, owner.accessToken)).body.data;
    log('9. Cắm cổng 2 không check-in -> phiên trái phép', sessions.filter((s) => s.portId === station.ports[1].id).map((s) => ({ unauthorized: s.unauthorized, userId: s.userId })));
    log('   WebSocket quản lý trạm nhận', [...new Set(ws.owner.map((m) => m.event + (m.payload?.type ? `:${m.payload.type}` : '')))]);
    log('   WebSocket người lạ nhận', [...new Set(ws.anon.map((m) => m.event))]);
    anonWs.close();
    ownerWs.close();

    log('10. Báo cáo của quản lý trạm', (await call('GET', '/reports/revenue', null, owner.accessToken)).body.data);
    log('    Tài xế gọi báo cáo (phải 403)', (await call('GET', '/reports/revenue', null, driver.accessToken)).status);
  } finally {
    if (KEEP) {
      console.log(`\nGiữ lại dữ liệu (--keep): trạm id=${station.id}, tài khoản *${EMAIL_DOMAIN} mật khẩu matkhau123`);
    } else {
      await cleanup(station.id);
      console.log('\nĐã dọn dữ liệu demo khỏi DB dev.');
    }
  }
};

main()
  .catch((err) => {
    console.error('E2E LỖI:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
