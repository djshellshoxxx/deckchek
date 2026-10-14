-- FS-00 §4.11 / §5.4: content-addressed photo store (job M7-F2-photo).
-- Files live at <app_data_dir>/photos/<sha256>.jpg; this table only indexes them.
-- Forward-only and additive: two new tables, no change to existing ones.
CREATE TABLE IF NOT EXISTS photo (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL CHECK (mime = 'image/jpeg'),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- owner_id is polymorphic (asset, service_job or certificate), so it has no foreign key:
-- owners delete their links in the same transaction (photo::unlink_owner).
CREATE TABLE IF NOT EXISTS photo_link (
  id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES photo(id) ON DELETE CASCADE,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('asset','service_job','certificate')),
  owner_id TEXT NOT NULL,
  caption TEXT,
  alt_text TEXT,
  stage TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(photo_id, owner_kind, owner_id)
);
CREATE INDEX IF NOT EXISTS idx_photo_link_owner ON photo_link(owner_kind, owner_id, sort);
