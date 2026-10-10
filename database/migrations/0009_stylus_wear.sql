-- FS-12 §5: stylus benchmarks and alert snoozes. Hours live in asset_usage (0006).
-- The replacement baseline is the latest maintenance_event with event_type = 'stylus_replaced'.
-- The runner wraps this file in a transaction and records the version.

CREATE TABLE IF NOT EXISTS stylus_benchmark (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  hours_at REAL NOT NULL CHECK (hours_at >= 0),
  thd_percent REAL,
  separation_db REAL,
  tc_snr_db REAL,
  tc_phase_error_deg REAL,
  tc_dropouts INTEGER CHECK (tc_dropouts IS NULL OR tc_dropouts >= 0),
  setup_id TEXT REFERENCES setup(id),
  valid INTEGER NOT NULL DEFAULT 1 CHECK (valid IN (0, 1)),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stylus_benchmark_asset ON stylus_benchmark(asset_id, hours_at);

CREATE TABLE IF NOT EXISTS stylus_alert (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  snoozed_until TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stylus_alert_asset ON stylus_alert(asset_id, kind);

ALTER TABLE asset ADD COLUMN rated_life_hours REAL;
