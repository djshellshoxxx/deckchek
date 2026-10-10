-- FS-15 §5: booth hum hunter and feedback step runs (one row per run, one row per isolation/feedback step).
CREATE TABLE IF NOT EXISTS hum_run (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  venue_id TEXT REFERENCES venue(id) ON DELETE SET NULL,
  setup_id TEXT REFERENCES setup(id),
  kind TEXT NOT NULL CHECK (kind IN ('hum','feedback')),
  mains_hz INTEGER,
  verdict TEXT,
  causes_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hum_run_venue ON hum_run(venue_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hum_run_session ON hum_run(session_id, created_at);

CREATE TABLE IF NOT EXISTS hum_step (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES hum_run(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  step_id TEXT NOT NULL,
  label TEXT NOT NULL,
  fundamental_dbfs REAL,
  harmonics_json TEXT NOT NULL DEFAULT '[]',
  total_dbfs REAL,
  floor_dbfs REAL,
  delta_db REAL,
  level_dbfs REAL,
  peak_hz REAL,
  growth_db_per_s REAL,
  onset INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_hum_step_run ON hum_step(run_id, idx);
