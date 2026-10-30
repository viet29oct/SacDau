const { WebSocketServer } = require('ws');
const { logger } = require('../logger');

// Kênh public, không yêu cầu token (giống GET /stations) — xem docs/contracts.md mục 1b
let wss;

const attachWebSocketServer = (httpServer) => {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', (socket) => {
    logger.info('WebSocket client connected');
    socket.on('close', () => logger.info('WebSocket client disconnected'));
  });
  return wss;
};

// Phát 1 sự kiện tới toàn bộ client đang kết nối — event/payload cố định ở contracts.md mục 1b
const broadcast = (event, payload) => {
  if (!wss) return;
  const message = JSON.stringify({ event, payload });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }
};

module.exports = { attachWebSocketServer, broadcast };
