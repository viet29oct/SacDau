import pino from 'pino';

// Im lặng khi chạy jest để không làm rối output test (Jest tự set NODE_ENV=test)
const level = process.env.NODE_ENV === 'test' ? 'silent' : process.env.LOG_LEVEL ?? 'info';

export const logger = pino({
  level,
  transport:
    process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});
