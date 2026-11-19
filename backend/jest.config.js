/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  // Test chạy trên Postgres thật trong Docker -> để dư thời gian cho hook dọn DB
  testTimeout: 15000,
};
