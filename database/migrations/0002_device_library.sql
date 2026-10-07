-- Device library: researched device profiles (app/devices/profiles/*.json),
-- per-asset device test results and learned MIDI maps.
-- Applied once by the ordered migration runner (src-tauri/src/db.rs).

CREATE TABLE IF NOT EXISTS device_profile (
  id TEXT PRIMARY KEY,                       -- profile id, e.g. "pioneer-plx-crss12"
  product_id TEXT REFERENCES product(id) ON DELETE SET NULL,
  json TEXT NOT NULL,                        -- full profile JSON as last synced
  version INTEGER NOT NULL DEFAULT 1,        -- bumped whenever the synced JSON changes
  loaded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_profile_product ON device_profile(product_id);

CREATE TABLE IF NOT EXISTS device_test_result (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  profile_id TEXT NOT NULL REFERENCES device_profile(id),
  test_id TEXT NOT NULL,
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'unknown', 'skipped')),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_test_result_asset ON device_test_result(asset_id, profile_id, test_id, created_at);

-- MIDI map learned on the user's own unit (profiles whose mapSource is "learn").
CREATE TABLE IF NOT EXISTS asset_midi_map (
  asset_id TEXT PRIMARY KEY REFERENCES asset(id),
  profile_id TEXT REFERENCES device_profile(id),
  map_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
