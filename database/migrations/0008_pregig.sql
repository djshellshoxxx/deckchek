-- FS-10 §5: pre-gig check presets, runs and per-step results.
-- The runner wraps this file in a transaction and records the version.

CREATE TABLE IF NOT EXISTS pregig_preset (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0,
  setup_id TEXT REFERENCES setup(id) ON DELETE SET NULL,
  json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pregig_run (
  id TEXT PRIMARY KEY,
  preset_id TEXT REFERENCES pregig_preset(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  verdict TEXT NOT NULL CHECK (verdict IN ('green', 'amber', 'red', 'incomplete', 'cancelled')),
  duration_ms INTEGER,
  app_version TEXT NOT NULL,
  venue_id TEXT REFERENCES venue(id) ON DELETE SET NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS pregig_step_result (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES pregig_run(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  deck TEXT,
  state TEXT NOT NULL CHECK (state IN ('pass', 'warn', 'fail', 'skipped', 'unsupported', 'error')),
  summary TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  fix_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_pregig_run_preset ON pregig_run(preset_id, started_at);
CREATE INDEX IF NOT EXISTS idx_pregig_step_run ON pregig_step_result(run_id);
