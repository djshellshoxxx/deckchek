-- FS-33 §5: gear ledger exports. One row per successful export; `revision` counts up from 1 (AC-7).
-- Photos come from the FS-00 photo store (photo / photo_link, owner_kind 'asset') and certificates from the FS-20
-- `certificate` table, so the draft asset_photo and ledger_certificate tables are not created.
-- `asset.public_notes` is a note the owner writes for the public ledger; the private `asset.notes` is never exported
-- unless ticked. The runner wraps this file in a transaction and records the version.

CREATE TABLE IF NOT EXISTS ledger_export (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  selection_json TEXT NOT NULL CHECK (json_valid(selection_json)),
  privacy_json TEXT NOT NULL CHECK (json_valid(privacy_json)),
  ledger_sha256 TEXT NOT NULL CHECK (length(ledger_sha256) = 64)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_export_revision ON ledger_export(revision);
ALTER TABLE asset ADD COLUMN public_notes TEXT;
