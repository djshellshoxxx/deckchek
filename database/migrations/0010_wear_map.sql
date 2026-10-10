-- FS-13 §5: control-vinyl wear map. One wear_scan per scanned side, one wear_bin per bin (2 s default).
-- wear_bin.flags: bit0 interrupted (excluded from the verdict), bit1 speed shift, bit2 clip.
CREATE TABLE IF NOT EXISTS wear_scan (
  id TEXT PRIMARY KEY,
  full_side_scan_id TEXT REFERENCES full_side_scan(id) ON DELETE CASCADE,
  record_side_id TEXT NOT NULL REFERENCES record_side(id),
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  stylus_asset_id TEXT REFERENCES asset(id),
  format TEXT NOT NULL,
  bin_sec REAL NOT NULL,
  coverage REAL NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('keep','watch','other_side','replace','incomplete')),
  score REAL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  geometry_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wear_scan_side ON wear_scan(record_side_id, created_at);
CREATE TABLE IF NOT EXISTS wear_bin (
  scan_id TEXT NOT NULL REFERENCES wear_scan(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  t_sec REAL NOT NULL,
  snr_db REAL,
  phase_err_deg REAL,
  balance_db REAL,
  level_dbfs REAL,
  dropouts INTEGER NOT NULL DEFAULT 0,
  flags INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scan_id, idx)
);
