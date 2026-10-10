-- FS-14 §5: scratch stress test runs and their events (reversals, lock losses, direction errors,
-- needle skips, recoveries). Scores are comparable only within one protocol_version.
CREATE TABLE IF NOT EXISTS scratch_run (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  setup_id TEXT REFERENCES setup(id),
  cartridge_asset_id TEXT REFERENCES asset(id),
  record_side_id TEXT REFERENCES record_side(id),
  format TEXT NOT NULL,
  bpm REAL NOT NULL,
  protocol_version INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 1,
  score REAL,
  components_json TEXT NOT NULL DEFAULT '{}',
  lock_losses INTEGER,
  longest_loss_ms REAL,
  median_recovery_ms REAL,
  direction_errors INTEGER,
  skips INTEGER,
  reversals INTEGER,
  peak_velocity REAL,
  tracking_force_g REAL,
  tonearm_note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scratch_event (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES scratch_run(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('reversal','lock_loss','direction_error','skip','recovery')),
  t_ms REAL NOT NULL,
  duration_ms REAL,
  value REAL,
  detail_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_scratch_run_entities ON scratch_run(cartridge_asset_id, record_side_id, setup_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scratch_event_run ON scratch_event(run_id, t_ms);
