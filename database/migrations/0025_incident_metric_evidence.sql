-- SPEC-05 §20: one immutable selected existing frame, saved in the parent's
-- transaction. No FK to mutable catalog rows or prunable live-monitor logs.
-- submission_json retains both original normalized submissions for strict
-- parent binding and retry; the complete encoded pair is bounded to 32 KiB.
CREATE TABLE IF NOT EXISTS venue_incident_metric_evidence (
  incident_id TEXT PRIMARY KEY NOT NULL REFERENCES venue_incident(id) ON DELETE RESTRICT,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  method TEXT NOT NULL CHECK (method = 'live-monitor-latest-frame-v1'),
  submission_json TEXT NOT NULL CHECK (typeof(submission_json) = 'text' AND length(CAST(submission_json AS BLOB)) <= 32768),
  origin TEXT NOT NULL CHECK (origin = 'operator-attached'),
  recorded_at TEXT NOT NULL
);
