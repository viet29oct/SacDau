const { WebSocketServer } = require('ws');
const { query } = require('../db');
const { logger } = require('../logger');
const { verifyAccessToken } = require('./token');

// Kênh công khai: chỉ port:update (trạng thái thiết bị, không có dữ liệu người dùng).
// Kênh có xác thực: client gửi {type:'auth', token} -> nhận session:update/alert của riêng mình
// (tài xế của phiên, quản lý trạm, admin). Xem docs/contracts.md mục 1b.
let wss;

const send = (socket, event, payload) => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ event, payload }));
};

const authenticate = async (socket, token) => {
  try {
    const payload = verifyAccessToken(token);
    const { rows } = await query('SELECT id, role, is_active FROM users WHERE id = $1', [Number(payload.sub)]);
    const user = rows[0];
    if (!user || !user.is_active) throw new Error('inactive');
    socket.user = { id: user.id, role: user.role };
    send(socket, 'auth:ok', { userId: user.id, role: user.role });
  } catch {
    socket.close(4401, 'unauthorized');
  }
};

const attachWebSocketServer = (httpServer) => {
  wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 4096 });
  wss.on('connection', (socket) => {
    socket.user = null;
    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message?.type === 'auth' && typeof message.token === 'string') {
        authenticate(socket, message.token);
      }
    });
    socket.on('error', (err) => logger.warn({ err }, 'WebSocket lỗi'));
  });
  return wss;
};

// Phát tới mọi client (chỉ dùng cho dữ liệu công khai)
const broadcast = (event, payload) => {
  if (!wss) return;
  for (const client of wss.clients) send(client, event, payload);
};

// Gửi tới các socket đã xác thực của đúng những user này (+ mọi admin nếu includeAdmins)
const sendToUsers = (userIds, event, payload, { includeAdmins = false } = {}) => {
  if (!wss) return;
  const ids = new Set(userIds);
  for (const client of wss.clients) {
    const user = client.user;
    if (user && (ids.has(user.id) || (includeAdmins && user.role === 'admin'))) send(client, event, payload);
  }
};

module.exports = { attachWebSocketServer, broadcast, sendToUsers };
