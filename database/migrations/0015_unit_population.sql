-- FS-21 offline, anonymous reference population. No asset/session identity.
CREATE TABLE IF NOT EXISTS reference_pack (
  id TEXT PRIMARY KEY,
  source_label TEXT,
  imported_at TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  sha256 TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reference_sample (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES reference_pack(id) ON DELETE CASCADE,
  contributor TEXT NOT NULL,
  product_key TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  method_key TEXT NOT NULL,
  method_version INTEGER NOT NULL CHECK (method_version > 0),
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  row_hash TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_ref_sample_lookup ON reference_sample(product_key, metric_key, method_key, method_version);
