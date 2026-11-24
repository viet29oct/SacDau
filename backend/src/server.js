require('dotenv/config');
const http = require('http');
const app = require('./app');
const pool = require('./db');
const { logger } = require('./logger');
const { attachWebSocketServer } = require('./services/websocket');
const mqttService = require('./services/mqtt');
const scheduler = require('./services/scheduler');

const PORT = process.env.PORT ?? 3000;

// Một promise quên catch ở đâu đó thì ghi log, không để Node mặc định tắt cả server
process.on('unhandledRejection', (err) => logger.error({ err }, 'Promise bị reject mà không có catch'));

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
  server.close(() => pool.end().finally(() => process.exit(0)));
  // Kết nối WebSocket còn mở sẽ giữ server.close() chờ mãi -> ép thoát sau 2 giây
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
