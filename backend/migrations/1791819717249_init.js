/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS postgis;');

  pgm.sql(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('driver', 'owner', 'admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE stations (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id),
      name TEXT NOT NULL,
      geom GEOMETRY(Point, 4326) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql('CREATE INDEX stations_geom_idx ON stations USING GIST (geom);');

  pgm.sql(`
    CREATE TABLE ports (
      id SERIAL PRIMARY KEY,
      station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      port_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'charging', 'fault')),
      UNIQUE (station_id, port_number)
    );
  `);

  pgm.sql(`
    CREATE TABLE bookings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      port_id INTEGER NOT NULL REFERENCES ports(id),
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE charging_sessions (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER REFERENCES bookings(id),
      port_id INTEGER NOT NULL REFERENCES ports(id),
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ,
      energy_kwh NUMERIC(8,2),
      cost NUMERIC(10,2)
    );
  `);

  pgm.sql(`
    CREATE TABLE telemetry (
      id BIGSERIAL PRIMARY KEY,
      station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      port_id INTEGER REFERENCES ports(id),
      status TEXT,
      power_kw NUMERIC(6,2),
      energy_kwh NUMERIC(8,2),
      temperature NUMERIC(5,2),
      recorded_at TIMESTAMPTZ NOT NULL
    );
  `);

  pgm.sql('CREATE INDEX telemetry_station_time_idx ON telemetry (station_id, recorded_at);');

  pgm.sql(`
    CREATE TABLE audit_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.sql(
    'DROP TABLE IF EXISTS audit_logs, telemetry, charging_sessions, bookings, ports, stations, users CASCADE;'
  );
};
