/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

// Lưu link VNPay đã ký lúc tạo giao dịch -> GET /payments/:id/checkout trả lại đúng link cũ
// (cùng vnp_TxnRef) khi tài xế lỡ đóng tab, không phải tạo giao dịch thứ 2 (dễ trả trùng).

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.sql('ALTER TABLE payments ADD COLUMN checkout_url TEXT;');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.sql('ALTER TABLE payments DROP COLUMN checkout_url;');
};
