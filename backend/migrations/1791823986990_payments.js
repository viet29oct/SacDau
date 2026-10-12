/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE payments (
      id SERIAL PRIMARY KEY,
      charging_session_id INTEGER NOT NULL REFERENCES charging_sessions(id),
      amount NUMERIC(10,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
      vnpay_txn_ref TEXT UNIQUE NOT NULL,
      vnpay_transaction_no TEXT,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql('CREATE INDEX payments_session_idx ON payments (charging_session_id);');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS payments CASCADE;');
};
