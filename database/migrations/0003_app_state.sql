-- FS-00 §4.5 / §5.1: small key/value store for state Rust must read or that
-- must survive a WebView reset (keys `^[a-z][a-z0-9_.]{0,63}$`, values JSON
-- <= 256 KiB, enforced by src-tauri/src/app_state.rs).
-- The runner wraps this file in a transaction and records the version.

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
