-- FS-11 §5: DVS latency and buffer tuner. One latency_run per round trip or stress step;
-- detail_json keeps the per-direction buffer report (requested vs actual period, buffer mode,
-- host-chosen / unavailable flags) and the sweep outcome. Raw loopback audio is not stored.
CREATE TABLE IF NOT EXISTS latency_run (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  setup_id TEXT REFERENCES setup(id) ON DELETE SET NULL,
  device_name TEXT NOT NULL,
  host_api TEXT,
  sample_rate_hz INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('roundtrip','stress')),
  buffer_frames INTEGER,
  cpu_load_pct INTEGER,
  measured_ms REAL,
  std_ms REAL,
  expanded_u_ms REAL,
  reported_ms REAL,
  xruns INTEGER,
  max_gap_ms REAL,
  verdict TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_latency_run_dev ON latency_run(device_name, created_at);

CREATE TABLE IF NOT EXISTS buffer_recommendation (
  id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  software TEXT NOT NULL,
  frames INTEGER NOT NULL,
  ms REAL NOT NULL,
  based_on_run_id TEXT REFERENCES latency_run(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_buffer_recommendation_dev ON buffer_recommendation(device_name, software, created_at);
