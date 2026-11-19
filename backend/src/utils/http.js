// Lỗi nghiệp vụ có code nằm trong danh sách error.code của docs/contracts.md mục 2.
// details (tuỳ chọn): dữ liệu kèm theo để client xử lý tiếp (vd check-in trả phiên cần xác nhận).
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const ok = (res, data, status = 200) => {
  res.status(status).json({ success: true, data, error: null });
};

const fail = (res, status, code, message, details) => {
  const error = details === undefined ? { code, message } : { code, message, details };
  res.status(status).json({ success: false, data: null, error });
};

// Express 4 không tự bắt lỗi của handler async -> chuyển sang errorHandler
const asyncHandler = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};

module.exports = { AppError, ok, fail, asyncHandler };
