PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migration (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL,
  app_version TEXT
);

CREATE TABLE IF NOT EXISTS manufacturer (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  website TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT REFERENCES manufacturer(id),
  category TEXT NOT NULL,
  model TEXT NOT NULL,
  variant TEXT,
  revision TEXT,
  release_year INTEGER,
  discontinued_year INTEGER,
  region TEXT,
  description TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_manufacturer_model
ON product(manufacturer_id, model);

CREATE TABLE IF NOT EXISTS product_spec (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  numeric_value REAL,
  text_value TEXT,
  boolean_value INTEGER,
  unit TEXT,
  frequency_hz REAL,
  method TEXT,
  provenance_type TEXT NOT NULL,
  source_title TEXT,
  source_url TEXT,
  retrieved_at TEXT,
  valid_from TEXT,
  valid_to TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_spec_key
ON product_spec(product_id, key);

CREATE TABLE IF NOT EXISTS asset (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES product(id),
  nickname TEXT NOT NULL,
  serial_number TEXT,
  purchase_date TEXT,
  installed_date TEXT,
  retired_date TEXT,
  firmware TEXT,
  condition TEXT,
  notes TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_product ON asset(product_id);

CREATE TABLE IF NOT EXISTS asset_settings_snapshot (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  captured_at TEXT NOT NULL,
  tracking_force_g REAL,
  anti_skate REAL,
  arm_height REAL,
  pitch_range REAL,
  brake_setting TEXT,
  torque_setting TEXT,
  cartridge_alignment TEXT,
  input_gain REAL,
  firmware TEXT,
  custom_json TEXT
);

CREATE TABLE IF NOT EXISTS maintenance_event (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  event_type TEXT NOT NULL,
  event_at TEXT NOT NULL,
  description TEXT,
  service_provider TEXT,
  hours_estimate REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS venue (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  venue_type TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_venue_name ON venue(name);

CREATE TABLE IF NOT EXISTS booth (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venue(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  indoor_outdoor TEXT,
  floor_type TEXT,
  stage_type TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS deck_position (
  id TEXT PRIMARY KEY,
  booth_id TEXT NOT NULL REFERENCES booth(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  orientation TEXT,
  distance_to_monitor_m REAL,
  distance_to_sub_m REAL,
  height_m REAL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS support_configuration (
  id TEXT PRIMARY KEY,
  deck_position_id TEXT REFERENCES deck_position(id),
  name TEXT NOT NULL,
  description TEXT,
  structure_json TEXT NOT NULL DEFAULT '[]',
  approximate_mass_kg REAL,
  coupled_state TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS setup (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  profile TEXT,
  venue_id TEXT REFERENCES venue(id),
  booth_id TEXT REFERENCES booth(id),
  deck_position_id TEXT REFERENCES deck_position(id),
  support_configuration_id TEXT REFERENCES support_configuration(id),
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS setup_component (
  id TEXT PRIMARY KEY,
  setup_id TEXT NOT NULL REFERENCES setup(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  position TEXT,
  settings_snapshot_id TEXT REFERENCES asset_settings_snapshot(id)
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  session_type TEXT NOT NULL,
  setup_id TEXT REFERENCES setup(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  app_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  context_profile TEXT,
  operator_notes TEXT,
  session_quality REAL,
  config_snapshot_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_session_started ON session(started_at);

CREATE TABLE IF NOT EXISTS capture (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  device_identifier TEXT,
  backend TEXT,
  sample_rate_hz INTEGER NOT NULL,
  sample_format TEXT NOT NULL,
  bit_depth INTEGER,
  channel_count INTEGER NOT NULL,
  channel_map_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  duration_samples INTEGER,
  dropped_buffers INTEGER NOT NULL DEFAULT 0,
  discontinuities INTEGER NOT NULL DEFAULT 0,
  clipped_samples_left INTEGER NOT NULL DEFAULT 0,
  clipped_samples_right INTEGER NOT NULL DEFAULT 0,
  raw_audio_path TEXT,
  raw_audio_sha256 TEXT,
  raw_audio_retained INTEGER NOT NULL DEFAULT 0,
  quality_flags_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS analysis_method (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  version INTEGER NOT NULL,
  description TEXT NOT NULL,
  parameters_json TEXT NOT NULL DEFAULT '{}',
  standard_reference TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(key, version)
);

CREATE TABLE IF NOT EXISTS measurement (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  capture_id TEXT REFERENCES capture(id),
  method_id TEXT NOT NULL REFERENCES analysis_method(id),
  metric_key TEXT NOT NULL,
  state TEXT NOT NULL,
  numeric_value REAL,
  text_value TEXT,
  unit TEXT,
  channel_scope TEXT,
  start_sample INTEGER,
  end_sample INTEGER,
  confidence REAL,
  uncertainty REAL,
  reference_low REAL,
  reference_high REAL,
  quality_flags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_measurement_metric
ON measurement(metric_key, method_id);
CREATE INDEX IF NOT EXISTS idx_measurement_session
ON measurement(session_id);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  start_sample INTEGER,
  end_sample INTEGER,
  confidence REAL NOT NULL,
  summary TEXT NOT NULL,
  features_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_session_type
ON evidence(session_id, evidence_type);

CREATE TABLE IF NOT EXISTS evidence_measurement (
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  measurement_id TEXT NOT NULL REFERENCES measurement(id) ON DELETE CASCADE,
  PRIMARY KEY(evidence_id, measurement_id)
);

CREATE TABLE IF NOT EXISTS hypothesis (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  hypothesis_key TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence REAL NOT NULL,
  severity TEXT NOT NULL,
  summary TEXT NOT NULL,
  reasoning_version INTEGER NOT NULL,
  alternatives_json TEXT NOT NULL DEFAULT '[]',
  isolation_tests_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hypothesis_support (
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  hypothesis_id TEXT NOT NULL REFERENCES hypothesis(id) ON DELETE CASCADE,
  weight REAL NOT NULL,
  PRIMARY KEY(evidence_id, hypothesis_id)
);

CREATE TABLE IF NOT EXISTS hypothesis_contradiction (
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  hypothesis_id TEXT NOT NULL REFERENCES hypothesis(id) ON DELETE CASCADE,
  weight REAL NOT NULL,
  PRIMARY KEY(evidence_id, hypothesis_id)
);

CREATE TABLE IF NOT EXISTS record_release (
  id TEXT PRIMARY KEY,
  artist TEXT,
  title TEXT NOT NULL,
  label TEXT,
  catalog_number TEXT,
  release_year INTEGER,
  pressing_notes TEXT,
  external_reference_type TEXT,
  external_reference_id TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS record_copy (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES record_release(id),
  nickname TEXT,
  acquired_date TEXT,
  user_grade TEXT,
  cleaning_state TEXT,
  notes TEXT,
  retired INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS record_side (
  id TEXT PRIMARY KEY,
  record_copy_id TEXT NOT NULL REFERENCES record_copy(id) ON DELETE CASCADE,
  side_label TEXT NOT NULL,
  nominal_rpm REAL,
  expected_duration_sec REAL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS full_side_scan (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  record_side_id TEXT NOT NULL REFERENCES record_side(id),
  start_sample INTEGER NOT NULL,
  end_sample INTEGER NOT NULL,
  scan_version INTEGER NOT NULL,
  condition_score REAL,
  live_readiness TEXT,
  raw_audio_retained INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vinyl_event (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES full_side_scan(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  start_sample INTEGER NOT NULL,
  end_sample INTEGER,
  normalized_position REAL,
  estimated_track INTEGER,
  severity TEXT NOT NULL,
  confidence REAL NOT NULL,
  persistence_status TEXT NOT NULL,
  channel_scope TEXT,
  recurrence_period_sec REAL,
  recurrence_count INTEGER,
  features_json TEXT NOT NULL DEFAULT '{}',
  user_label TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_vinyl_event_scan_position
ON vinyl_event(scan_id, normalized_position);

CREATE TABLE IF NOT EXISTS scan_alignment (
  id TEXT PRIMARY KEY,
  scan_a_id TEXT NOT NULL REFERENCES full_side_scan(id) ON DELETE CASCADE,
  scan_b_id TEXT NOT NULL REFERENCES full_side_scan(id) ON DELETE CASCADE,
  alignment_method TEXT NOT NULL,
  offset_samples INTEGER NOT NULL DEFAULT 0,
  drift_model_json TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS dvs_media_profile (
  product_id TEXT PRIMARY KEY REFERENCES product(id) ON DELETE CASCADE,
  family TEXT NOT NULL,
  version TEXT,
  medium_type TEXT NOT NULL,
  analyzer_key TEXT,
  documentation_url TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS dvs_media_side (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES dvs_media_profile(product_id) ON DELETE CASCADE,
  side_label TEXT NOT NULL,
  nominal_rpm REAL,
  duration_sec REAL,
  public_code TEXT,
  absolute_position_supported INTEGER,
  relative_supported INTEGER
);

INSERT OR IGNORE INTO schema_migration(version, applied_at, app_version)
VALUES (1, CURRENT_TIMESTAMP, 'spec');
