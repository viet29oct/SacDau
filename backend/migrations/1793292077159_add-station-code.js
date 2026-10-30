/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  // Mã trạm dạng IoT gửi lên MQTT (ví dụ "ST01", xem docs/contracts.md mục 1) —
  // khác với `name` (tên hiển thị, ví dụ "Trạm Cầu Giấy"). Backend tra stations.id
  // theo cột này khi nhận bản tin MQTT. Nullable để không phá trạm cũ đã có trước khi
  // cột này tồn tại; trạm mới tạo qua POST /stations bắt buộc truyền code.
  pgm.sql('ALTER TABLE stations ADD COLUMN code TEXT UNIQUE;');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql('ALTER TABLE stations DROP COLUMN code;');
};
