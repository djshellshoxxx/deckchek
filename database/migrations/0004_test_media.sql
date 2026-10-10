-- FS-06 §5: test-media library (test records, timecode media, tone files).
-- Built-ins are synced from app/media/profiles/*.json by src-tauri/src/media.rs;
-- custom rows are never touched by a sync. Retired rows are flagged, not deleted,
-- so device_test_result.media_id stays valid.
-- The runner wraps this file in a transaction and records the version.

CREATE TABLE IF NOT EXISTS test_media (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('builtin','custom')),
  kind TEXT NOT NULL CHECK (kind IN ('test_record','timecode','tone_file')),
  manufacturer TEXT,
  product_id TEXT REFERENCES product(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  profile_json TEXT NOT NULL,
  owned INTEGER NOT NULL DEFAULT 0,
  retired INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_test_media_kind ON test_media(kind, name);

CREATE TABLE IF NOT EXISTS test_media_track (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES test_media(id) ON DELETE CASCADE,
  track_key TEXT NOT NULL,
  side TEXT,
  track_no INTEGER,
  purpose TEXT NOT NULL,
  frequency_hz REAL,
  level_value REAL,
  level_unit TEXT,
  duration_s REAL,
  notes TEXT,
  UNIQUE(media_id, track_key)
);

ALTER TABLE device_test_result ADD COLUMN media_id TEXT REFERENCES test_media(id);
ALTER TABLE device_test_result ADD COLUMN media_track_key TEXT;
