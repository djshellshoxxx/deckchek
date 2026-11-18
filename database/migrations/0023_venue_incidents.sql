-- SPEC-05 §20: immutable operator reports. Venue/setup IDs describe the selected
-- historical context; they deliberately do not cascade with mutable catalog rows.
-- New submissions validate the current venue/setup association transactionally.
CREATE TABLE IF NOT EXISTS venue_incident (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  venue_id TEXT NOT NULL,
  setup_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('skip','feedback','hum','needle_jump','dropout','booth_shock','other')),
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  note TEXT,
  origin TEXT NOT NULL DEFAULT 'operator' CHECK (origin = 'operator'),
  context_json TEXT NOT NULL CHECK (json_valid(context_json))
);
CREATE INDEX IF NOT EXISTS idx_venue_incident_context ON venue_incident(venue_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_venue_incident_time ON venue_incident(occurred_at DESC, id DESC);
