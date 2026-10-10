-- FS-00 §5.3: shared hours ledger (stylus life, hours-based service reminders).
CREATE TABLE IF NOT EXISTS asset_usage (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  kind TEXT NOT NULL DEFAULT 'play' CHECK (kind IN ('play','bench')),
  started_at TEXT NOT NULL,
  hours REAL NOT NULL CHECK (hours >= 0 AND hours <= 24),
  source TEXT NOT NULL CHECK (source IN ('manual','djlog','deckchek','import')),
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  note TEXT,
  confirmed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asset_usage_asset ON asset_usage(asset_id, started_at);
