-- FS-21 extension (forward-only, additive): every pack that carries an observation keeps a claim on it.
-- reference_sample.row_hash is globally unique, so an observation that two packs share is stored once
-- under the first pack; the claim lets pack_remove hand it to a remaining pack instead of deleting it.
CREATE TABLE IF NOT EXISTS reference_sample_claim (
  pack_id TEXT NOT NULL REFERENCES reference_pack(id) ON DELETE CASCADE,
  row_hash TEXT NOT NULL,
  PRIMARY KEY (pack_id, row_hash)
);
CREATE INDEX IF NOT EXISTS idx_ref_claim_hash ON reference_sample_claim(row_hash);
