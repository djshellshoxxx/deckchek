-- FS-08 §5: one row per backup file DeckChek wrote (manual, scheduled or the
-- automatic safety backup taken before a restore). Read by the Data panel for
-- "last backup" and to list manual backups saved outside the backups folder.
-- The runner wraps this file in a transaction and records the version.

CREATE TABLE IF NOT EXISTS backup_log (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_backup_log_created ON backup_log(created_at);
