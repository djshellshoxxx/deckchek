-- FS-22 service records. History rows are additive; a correction is linked by
-- amends_id rather than rewriting the original part/labour entry.
CREATE TABLE IF NOT EXISTS customer (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS service_job (
  id TEXT PRIMARY KEY,
  job_number TEXT NOT NULL UNIQUE,
  customer_id TEXT REFERENCES customer(id),
  asset_id TEXT REFERENCES asset(id),
  status TEXT NOT NULL CHECK (status IN ('intake','diagnosing','awaiting_parts','repairing','testing','ready','collected','cancelled')),
  reported_fault TEXT NOT NULL,
  accessories_json TEXT NOT NULL DEFAULT '[]',
  arrival_condition TEXT,
  resolution TEXT,
  opened_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_status ON service_job(status, updated_at);
CREATE TABLE IF NOT EXISTS service_job_status_log (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES service_job(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS service_job_log (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES service_job(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('part','labour','note')),
  description TEXT NOT NULL,
  quantity REAL,
  minutes INTEGER,
  unit_cost REAL,
  amends_id TEXT REFERENCES service_job_log(id),
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS service_job_result (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES service_job(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('before','after')),
  session_id TEXT REFERENCES session(id),
  device_test_result_id TEXT REFERENCES device_test_result(id),
  CHECK ((session_id IS NULL) <> (device_test_result_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_job_result_session ON service_job_result(job_id, phase, session_id) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_job_result_dtr ON service_job_result(job_id, phase, device_test_result_id) WHERE device_test_result_id IS NOT NULL;
