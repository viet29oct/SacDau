// Lỗi nghiệp vụ có code nằm trong danh sách error.code của docs/contracts.md mục 2
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const ok = (res, data, status = 200) => {
  res.status(status).json({ success: true, data, error: null });
};

const fail = (res, status, code, message) => {
  res.status(status).json({ success: false, data: null, error: { code, message } });
};

// Express 4 không tự bắt lỗi của handler async -> chuyển sang errorHandler
const asyncHandler = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};

module.exports = { AppError, ok, fail, asyncHandler };
