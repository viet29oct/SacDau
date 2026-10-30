require('dotenv/config');
const http = require('http');
const app = require('./app');
const { attachWebSocketServer } = require('./services/websocket');
const mqttService = require('./services/mqtt');

const PORT = process.env.PORT ?? 3000;

// Dùng http.Server riêng (không app.listen trực tiếp) để WebSocketServer gắn chung port.
const server = http.createServer(app);
attachWebSocketServer(server);
mqttService.start();

server.listen(PORT, () => {
  console.log(`Backend đang chạy ở http://localhost:${PORT}`);
});

process.on('SIGTERM', () => mqttService.stop());
process.on('SIGINT', () => mqttService.stop());
