-- FS-31 live monitor session log: one row per monitoring session, its alert/info events and per-minute
-- per-deck summaries. Rows older than the retention (app_state 'monitor'.retentionDays, default 90) are pruned
-- at startup by src-tauri/src/monitor.rs; events and minutes go with their session (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS monitor_session (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  device_name TEXT,
  host_api TEXT,
  sample_rate INTEGER,
  format TEXT,
  config_json TEXT NOT NULL,
  summary_json TEXT,
  asset_id TEXT REFERENCES asset(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS monitor_event (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES monitor_session(id) ON DELETE CASCADE,
  t_ms INTEGER NOT NULL,
  deck TEXT,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  value REAL,
  baseline REAL,
  message TEXT
);
CREATE TABLE IF NOT EXISTS monitor_minute (
  session_id TEXT NOT NULL REFERENCES monitor_session(id) ON DELETE CASCADE,
  minute INTEGER NOT NULL,
  deck TEXT NOT NULL,
  snr_db_min REAL,
  snr_db_mean REAL,
  hum_db_max REAL,
  drift_deg_max REAL,
  dropouts INTEGER,
  PRIMARY KEY (session_id, minute, deck)
);
CREATE INDEX IF NOT EXISTS idx_monitor_event_session ON monitor_event(session_id, t_ms);
CREATE INDEX IF NOT EXISTS idx_monitor_session_started ON monitor_session(started_at);
