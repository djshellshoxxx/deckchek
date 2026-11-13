-- FS-23 fleet placement and maintenance reminders. Existing records retain
-- their values and start unplaced, with no inferred maintenance history.
CREATE TABLE IF NOT EXISTS maintenance_reminder (
  id TEXT PRIMARY KEY,
  asset_id TEXT REFERENCES asset(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES product(id),
  title TEXT NOT NULL,
  basis TEXT NOT NULL CHECK (basis IN ('days','hours')),
  interval_value REAL NOT NULL CHECK (interval_value > 0),
  warn_before REAL NOT NULL DEFAULT 14 CHECK (warn_before >= 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  snoozed_until TEXT,
  created_at TEXT NOT NULL
);
ALTER TABLE asset ADD COLUMN deck_position_id TEXT REFERENCES deck_position(id);
ALTER TABLE maintenance_event ADD COLUMN reminder_id TEXT REFERENCES maintenance_reminder(id);
ALTER TABLE maintenance_event ADD COLUMN hours_at_event REAL;
CREATE INDEX IF NOT EXISTS idx_reminder_asset ON maintenance_reminder(asset_id, enabled);
CREATE INDEX IF NOT EXISTS idx_asset_position ON asset(deck_position_id);
CREATE INDEX IF NOT EXISTS idx_maint_asset_time ON maintenance_event(asset_id, event_at);
