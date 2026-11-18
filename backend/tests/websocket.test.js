const http = require('http');
const WebSocket = require('ws');
const app = require('../src/app');
const pool = require('../src/db');
const { attachWebSocketServer } = require('../src/services/websocket');
const engine = require('../src/services/sessionEngine');
const { createAdmin, createStationWithPort, insertBooking, registerUser, resetDb } = require('./helpers');

// Chạy server HTTP + WebSocket thật trên cổng ngẫu nhiên: kiểm tra session:update chỉ tới đúng người
// (tài xế của phiên, quản lý trạm, admin) và kênh công khai chỉ có port:update.
let server;
let url;
const sockets = [];

beforeAll(async () => {
  server = http.createServer(app);
  attachWebSocketServer(server);
  await new Promise((resolve) => server.listen(0, resolve));
  url = `ws://localhost:${server.address().port}/ws`;
});
beforeEach(resetDb);
afterEach(() => {
  while (sockets.length) sockets.pop().terminate();
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

// Mở socket, (tuỳ chọn) xác thực, gom mọi message nhận được
const connect = async (token) => {
  const socket = new WebSocket(url);
  sockets.push(socket);
  const messages = [];
  socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  if (token) {
    socket.send(JSON.stringify({ type: 'auth', token }));
    await waitFor(() => messages.some((m) => m.event === 'auth:ok'));
  }
  return { socket, messages };
};

const waitFor = async (predicate, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor: hết thời gian chờ');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const events = (client, name) => client.messages.filter((m) => m.event === name);

it('session:update chỉ tới tài xế của phiên, quản lý trạm, admin; khách vãng lai chỉ thấy port:update', async () => {
  const { portId, owner } = await createStationWithPort();
  const driver = await registerUser();
  const other = await registerUser({ email: 'b@example.com' });
  const admin = await createAdmin();
  const booking = await insertBooking({ userId: driver.user.id, portId, startOffsetMin: -5, status: 'checked_in' });
  await pool.query('UPDATE bookings SET checked_in_at = now() WHERE id = $1', [booking.id]);

  const anonymous = await connect();
  const driverWs = await connect(driver.accessToken);
  const otherWs = await connect(other.accessToken);
  const ownerWs = await connect(owner.accessToken);
  const adminWs = await connect(admin.accessToken);

  await engine.handleMessage('stations/ST01/status', {
    stationId: 'ST01',
    portId: 1,
    status: 'charging',
    powerKw: 7,
    energyKwh: 0,
  });

  await waitFor(() => events(driverWs, 'session:update').length && events(ownerWs, 'session:update').length);
  await waitFor(() => events(adminWs, 'session:update').length);
  expect(events(driverWs, 'session:update')[0].payload).toMatchObject({ userId: driver.user.id, bookingId: booking.id });

  await waitFor(() => events(anonymous, 'port:update').length);
  expect(events(anonymous, 'port:update')[0].payload).toEqual({
    stationId: 'ST01',
    portId,
    status: 'charging',
    powerKw: 7,
    online: true,
    recordedAt: expect.any(String),
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(events(anonymous, 'session:update')).toHaveLength(0);
  expect(events(otherWs, 'session:update')).toHaveLength(0);
});

it('phiên trái phép -> cảnh báo tới quản lý trạm, không tới tài xế khác', async () => {
  const { owner } = await createStationWithPort();
  const driver = await registerUser();
  const ownerWs = await connect(owner.accessToken);
  const driverWs = await connect(driver.accessToken);

  await engine.handleMessage('stations/ST01/status', {
    stationId: 'ST01',
    portId: 1,
    status: 'charging',
    powerKw: 7,
    energyKwh: 0,
  });
  await waitFor(() => events(ownerWs, 'alert').length);
  expect(events(ownerWs, 'alert')[0].payload).toMatchObject({ type: 'unauthorized_session', stationId: 'ST01' });
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(events(driverWs, 'alert')).toHaveLength(0);
});

it('token sai -> server đóng kết nối (4401)', async () => {
  const { socket } = await connect();
  const closed = new Promise((resolve) => socket.once('close', (code) => resolve(code)));
  socket.send(JSON.stringify({ type: 'auth', token: 'token-rac' }));
  expect(await closed).toBe(4401);
});
