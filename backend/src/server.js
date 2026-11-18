require('dotenv/config');
const http = require('http');
const app = require('./app');
const { attachWebSocketServer } = require('./services/websocket');
const mqttService = require('./services/mqtt');
const scheduler = require('./services/scheduler');

const PORT = process.env.PORT ?? 3000;

// Dùng http.Server riêng (không app.listen trực tiếp) để WebSocketServer gắn chung port.
const server = http.createServer(app);
attachWebSocketServer(server);
mqttService.start();
scheduler.start({ getMqttState: mqttService.getConnectionState });

server.listen(PORT, () => {
  console.log(`Backend đang chạy ở http://localhost:${PORT}`);
});

const shutdown = () => {
  scheduler.stop();
  mqttService.stop();
  server.close(() => process.exit(0));
  // Kết nối WebSocket còn mở sẽ giữ server.close() chờ mãi -> ép thoát sau 2 giây
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
