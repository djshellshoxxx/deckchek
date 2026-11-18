-- SPEC-05 section 16: immutable digital observations and derived A/B comparisons.
-- Catalog IDs and complete original JSON are historical evidence. Deliberately
-- no live venue/setup/support foreign keys: later catalog edits cannot erase it.
CREATE TABLE IF NOT EXISTS support_isolation_observation (
  id TEXT PRIMARY KEY NOT NULL,
  pair_id TEXT NOT NULL,
  venue_id TEXT NOT NULL,
  setup_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_isolation_observation_venue
  ON support_isolation_observation(venue_id, captured_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS support_isolation_comparison (
  id TEXT PRIMARY KEY NOT NULL,
  pair_id TEXT NOT NULL,
  venue_id TEXT NOT NULL,
  setup_id TEXT NOT NULL,
  observation_a_id TEXT NOT NULL REFERENCES support_isolation_observation(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  observation_b_id TEXT NOT NULL REFERENCES support_isolation_observation(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  CHECK (observation_a_id <> observation_b_id)
);

CREATE INDEX IF NOT EXISTS idx_support_isolation_comparison_venue
  ON support_isolation_comparison(venue_id, created_at DESC, id DESC);
