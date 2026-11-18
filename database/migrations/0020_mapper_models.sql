-- FS-32 §5: saved MIDI mapper studio models (neutral DeckChek mapping JSON, version inside model_json).
-- Optional links to the unit (asset) and the official device profile; both become NULL when the linked row is
-- removed (profile retirement in devices.rs, deletion of an unused auto-created asset), so a saved mapping survives.
-- The runner wraps this file in a transaction and records the version.

CREATE TABLE IF NOT EXISTS mapper_model (
  id TEXT PRIMARY KEY,
  asset_id TEXT REFERENCES asset(id) ON DELETE SET NULL,
  profile_id TEXT REFERENCES device_profile(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  model_json TEXT NOT NULL CHECK (json_valid(model_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mapper_model_asset ON mapper_model(asset_id);
