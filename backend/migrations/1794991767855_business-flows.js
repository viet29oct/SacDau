/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

// Luồng nghiệp vụ thực tế (2026-11-18) — đặc tả ở docs/LUONG_NGHIEP_VU.md:
// cọc VNPay khi đặt chỗ, check-in bằng mã, phiên trái phép, phí chiếm chỗ, sự cố,
// chống đặt trùng giờ bằng exclusion constraint.
//
// Thứ tự: thêm cột -> dọn + backfill dữ liệu cũ -> tạo ràng buộc (nếu dữ liệu cũ đã vi phạm
// thì tạo ràng buộc trước sẽ fail).

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  const unitPrice = Number(process.env.UNIT_PRICE_PER_KWH ?? 3500) || 3500;

  pgm.sql('CREATE EXTENSION IF NOT EXISTS btree_gist;');

  // --- Tài khoản & trạm ---
  pgm.sql('ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;');
  pgm.sql('ALTER TABLE stations ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;');
  pgm.sql(`
    ALTER TABLE ports
      ADD COLUMN service_status TEXT NOT NULL DEFAULT 'in_service'
        CHECK (service_status IN ('in_service', 'maintenance')),
      ADD COLUMN last_seen_at TIMESTAMPTZ;
  `);

  // --- Booking ---
  pgm.sql('ALTER TABLE bookings DROP CONSTRAINT bookings_status_check;');
  pgm.sql(`
    ALTER TABLE bookings
      ADD COLUMN hold_expires_at TIMESTAMPTZ,
      ADD COLUMN deposit_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN check_in_code TEXT,
      ADD COLUMN checkin_failed_attempts INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN checkin_locked_until TIMESTAMPTZ,
      ADD COLUMN checked_in_at TIMESTAMPTZ,
      ADD COLUMN checked_in_by INTEGER REFERENCES users(id),
      ADD COLUMN cancel_reason TEXT,
      ADD COLUMN cancelled_by INTEGER REFERENCES users(id),
      ADD COLUMN cancelled_at TIMESTAMPTZ;
  `);

  // --- Phiên sạc ---
  pgm.sql(`
    ALTER TABLE charging_sessions
      ADD COLUMN user_id INTEGER REFERENCES users(id),
      ADD COLUMN unit_price NUMERIC(10,2),
      ADD COLUMN energy_start_kwh NUMERIC(8,2) NOT NULL DEFAULT 0,
      ADD COLUMN energy_cost NUMERIC(10,2),
      ADD COLUMN end_reason TEXT CHECK (end_reason IN ('device_idle', 'device_fault', 'manual_close')),
      ADD COLUMN needs_review BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN idle_since TIMESTAMPTZ,
      ADD COLUMN idle_minutes INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN idle_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN deposit_applied NUMERIC(10,2) NOT NULL DEFAULT 0;
  `);

  // --- Thanh toán ---
  pgm.sql(`
    ALTER TABLE payments
      ALTER COLUMN charging_session_id DROP NOT NULL,
      ADD COLUMN purpose TEXT NOT NULL DEFAULT 'session' CHECK (purpose IN ('booking_deposit', 'session')),
      ADD COLUMN booking_id INTEGER REFERENCES bookings(id),
      ADD COLUMN user_id INTEGER REFERENCES users(id),
      ADD COLUMN vnp_create_date TEXT,
      ADD COLUMN vnp_expire_date TEXT,
      ADD COLUMN expires_at TIMESTAMPTZ,
      ADD COLUMN refund_status TEXT CHECK (refund_status IN ('due', 'refunded')),
      ADD COLUMN refunded_at TIMESTAMPTZ,
      ADD COLUMN refunded_by INTEGER REFERENCES users(id),
      ADD COLUMN refund_note TEXT;
  `);

  // --- Dọn + backfill dữ liệu cũ (mô hình trước 2026-11-18) ---
  // Booking: 'pending' cũ không có cọc -> huỷ; 'confirmed' đã qua -> completed;
  // 'confirmed' sắp tới -> sinh mã check-in để vẫn check-in được.
  pgm.sql(`
    UPDATE bookings SET status = 'cancelled', cancel_reason = 'migration_legacy_pending', cancelled_at = now()
    WHERE status = 'pending';
  `);
  pgm.sql(`UPDATE bookings SET status = 'completed' WHERE status = 'confirmed' AND end_time <= now();`);
  pgm.sql(`
    UPDATE bookings SET check_in_code = lpad(floor(random() * 1000000)::int::text, 6, '0')
    WHERE status = 'confirmed';
  `);
  // Booking chồng giờ (cùng cổng hoặc cùng tài xế) -> giữ booking tạo trước, huỷ booking tạo sau
  pgm.sql(`
    UPDATE bookings b SET status = 'cancelled', cancel_reason = 'migration_overlap', cancelled_at = now()
    WHERE b.status = 'confirmed' AND EXISTS (
      SELECT 1 FROM bookings o
      WHERE o.id < b.id AND o.status = 'confirmed'
        AND (o.port_id = b.port_id OR o.user_id = b.user_id)
        AND tstzrange(o.start_time, o.end_time) && tstzrange(b.start_time, b.end_time)
    );
  `);

  // Phiên: nhiều phiên cùng mở trên 1 cổng -> giữ phiên mới nhất, đóng các phiên còn lại để kiểm tra lại
  pgm.sql(`
    UPDATE charging_sessions cs SET ended_at = now(), needs_review = true
    WHERE cs.ended_at IS NULL AND EXISTS (
      SELECT 1 FROM charging_sessions o WHERE o.port_id = cs.port_id AND o.ended_at IS NULL AND o.id > cs.id
    );
  `);
  pgm.sql(`
    UPDATE charging_sessions cs SET user_id = b.user_id FROM bookings b WHERE b.id = cs.booking_id;
  `);
  pgm.sql(`UPDATE charging_sessions SET unit_price = ${unitPrice};`);
  pgm.sql('UPDATE charging_sessions SET energy_cost = cost WHERE cost IS NOT NULL;');

  // Payments cũ đều là thanh toán phiên (purpose mặc định 'session')
  pgm.sql(`
    UPDATE payments p SET user_id = cs.user_id
    FROM charging_sessions cs WHERE cs.id = p.charging_session_id;
  `);
  pgm.sql(`UPDATE payments SET expires_at = created_at + interval '15 minutes';`);

  // --- Ràng buộc (sau khi dữ liệu đã sạch) ---
  pgm.sql(`
    ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
      CHECK (status IN ('pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'));
  `);
  // Chống đặt trùng giờ ở tầng DB: 2 request gửi cùng lúc cũng chỉ 1 cái thành công
  pgm.sql(`
    ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap_port
      EXCLUDE USING gist (port_id WITH =, tstzrange(start_time, end_time) WITH &&)
      WHERE (status IN ('pending', 'confirmed', 'checked_in'));
  `);
  pgm.sql(`
    ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap_user
      EXCLUDE USING gist (user_id WITH =, tstzrange(start_time, end_time) WITH &&)
      WHERE (status IN ('pending', 'confirmed', 'checked_in'));
  `);
  pgm.sql('CREATE INDEX bookings_status_idx ON bookings (status);');

  // Mỗi cổng tối đa 1 phiên đang mở
  pgm.sql('CREATE UNIQUE INDEX charging_sessions_one_open_per_port ON charging_sessions (port_id) WHERE ended_at IS NULL;');
  pgm.sql('CREATE INDEX charging_sessions_user_idx ON charging_sessions (user_id);');

  pgm.sql(`
    ALTER TABLE payments ADD CONSTRAINT payments_target_check CHECK (
      (purpose = 'booking_deposit' AND booking_id IS NOT NULL)
      OR (purpose = 'session' AND charging_session_id IS NOT NULL)
    );
  `);
  // Chốt chặn cuối chống thu 2 lần. Phải có "refund_status IS NULL": khoản VNPay đã trừ trùng
  // vẫn phải ghi được (đánh dấu cần hoàn), nếu không IPN lỗi 500 và VNPay gọi lại mãi.
  pgm.sql(`
    CREATE UNIQUE INDEX payments_one_success_per_session ON payments (charging_session_id)
    WHERE purpose = 'session' AND status = 'success' AND refund_status IS NULL;
  `);
  pgm.sql(`
    CREATE UNIQUE INDEX payments_one_success_per_deposit ON payments (booking_id)
    WHERE purpose = 'booking_deposit' AND status = 'success' AND refund_status IS NULL;
  `);
  pgm.sql('CREATE INDEX payments_booking_idx ON payments (booking_id);');

  // --- Sự cố ---
  pgm.sql(`
    CREATE TABLE incidents (
      id SERIAL PRIMARY KEY,
      port_id INTEGER NOT NULL REFERENCES ports(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('fault', 'offline')),
      opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      recovered_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      resolved_by INTEGER REFERENCES users(id),
      note TEXT
    );
  `);
  // Mỗi cổng tối đa 1 sự cố chưa đóng cho mỗi loại
  pgm.sql('CREATE UNIQUE INDEX incidents_one_open ON incidents (port_id, type) WHERE resolved_at IS NULL;');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS incidents;');

  pgm.sql('DROP INDEX IF EXISTS payments_booking_idx, payments_one_success_per_deposit, payments_one_success_per_session;');
  pgm.sql('ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_target_check;');
  pgm.sql("DELETE FROM payments WHERE purpose = 'booking_deposit';");
  pgm.sql(`
    ALTER TABLE payments
      DROP COLUMN purpose, DROP COLUMN booking_id, DROP COLUMN user_id, DROP COLUMN vnp_create_date,
      DROP COLUMN vnp_expire_date, DROP COLUMN expires_at, DROP COLUMN refund_status,
      DROP COLUMN refunded_at, DROP COLUMN refunded_by, DROP COLUMN refund_note,
      ALTER COLUMN charging_session_id SET NOT NULL;
  `);

  pgm.sql('DROP INDEX IF EXISTS charging_sessions_user_idx, charging_sessions_one_open_per_port;');
  pgm.sql(`
    ALTER TABLE charging_sessions
      DROP COLUMN user_id, DROP COLUMN unit_price, DROP COLUMN energy_start_kwh, DROP COLUMN energy_cost,
      DROP COLUMN end_reason, DROP COLUMN needs_review, DROP COLUMN idle_since, DROP COLUMN idle_minutes,
      DROP COLUMN idle_fee, DROP COLUMN deposit_applied;
  `);

  pgm.sql('DROP INDEX IF EXISTS bookings_status_idx;');
  pgm.sql('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap_user;');
  pgm.sql('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap_port;');
  pgm.sql('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;');
  pgm.sql(`UPDATE bookings SET status = 'confirmed' WHERE status IN ('checked_in', 'completed', 'no_show');`);
  pgm.sql(`
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending', 'confirmed', 'cancelled')),
      DROP COLUMN hold_expires_at, DROP COLUMN deposit_amount, DROP COLUMN check_in_code,
      DROP COLUMN checkin_failed_attempts, DROP COLUMN checkin_locked_until, DROP COLUMN checked_in_at,
      DROP COLUMN checked_in_by, DROP COLUMN cancel_reason, DROP COLUMN cancelled_by, DROP COLUMN cancelled_at;
  `);

  pgm.sql('ALTER TABLE ports DROP COLUMN service_status, DROP COLUMN last_seen_at;');
  pgm.sql('ALTER TABLE stations DROP COLUMN is_active;');
  pgm.sql('ALTER TABLE users DROP COLUMN is_active;');
};
