-- FS-20 certificate storage. Keys contain public material only; private keys
-- must remain in the platform credential adapter, never in this database.
CREATE TABLE IF NOT EXISTS signing_key (
  id TEXT PRIMARY KEY,
  public_key_b64 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  retired_at TEXT
);
CREATE TABLE IF NOT EXISTS certificate (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  profile_id TEXT NOT NULL REFERENCES device_profile(id),
  signing_key_id TEXT NOT NULL REFERENCES signing_key(id),
  serial_number TEXT NOT NULL,
  tester_name TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('pass','pass_uncalibrated','review','fail','draft')),
  content_hash TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  pdf_path TEXT,
  json_path TEXT,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_certificate_asset ON certificate(asset_id, issued_at);
