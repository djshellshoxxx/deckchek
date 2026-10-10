-- DeckChek v0.0.4 database fixture (FS-00 §4.2, AC-3). DO NOT EDIT: fixtures are
-- append-only per release (docs/DEVELOPMENT-PLAN.md §1.5).
--
-- Schema: database/migrations/0001_initial.sql + 0002_device_library.sql exactly
-- as shipped in v0.0.4 (commit 78f9752), applied in order. Rows: representative
-- data shaped like the rows the v0.0.4 app writes (catalog upserts, device-library
-- sync with an auto-created "My <model>" asset, device test results, a learned
-- MIDI map, two persisted runs with captures/measurements/evidence/hypotheses,
-- a repeat-scan alignment, DVS media, the starter-catalog seed marker 1000).
-- Every table holds at least one row. Produced with Python's sqlite3
-- Connection.iterdump() after checking integrity_check = ok and an empty
-- foreign_key_check with foreign_keys=ON. Loaded by src-tauri/src/db.rs tests.
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE analysis_method (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  version INTEGER NOT NULL,
  description TEXT NOT NULL,
  parameters_json TEXT NOT NULL DEFAULT '{}',
  standard_reference TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(key, version)
);
INSERT INTO "analysis_method" VALUES('method:channel_balance_db:1','channel_balance_db',1,'Channel balance','{}',NULL,'2026-09-29 21:10:01');
INSERT INTO "analysis_method" VALUES('method:hum_level_db:1','hum_level_db',1,'Mains hum level','{}',NULL,'2026-09-29 21:10:01');
CREATE TABLE asset (
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
INSERT INTO "asset" VALUES('a1000000-0000-4000-8000-00000000000a','2f7c9e10-4b3a-4d6e-9a12-c3e5f7a9b1d2','Left deck','GE1AA001234','2025-11-02','2025-11-05',NULL,'1.02','good','Pitch fader re-greased Sept 2026',0,'2026-09-21T10:01:00.000Z','2026-09-28T19:40:00.000Z');
INSERT INTO "asset" VALUES('a2000000-0000-4000-8000-00000000000b','10000000-0000-4000-8000-000000000001','Right deck',NULL,'2024-03-15',NULL,NULL,NULL,'fair',NULL,0,'2026-09-21T10:02:00.000Z','2026-09-21T10:02:00.000Z');
INSERT INTO "asset" VALUES('d7e6f5a4-b3c2-4d1e-8f0a-9b8c7d6e5f4a','8a4d2c61-7e5f-4b9a-a3c2-1d0e9f8b7a65','My TWELVE MK2',NULL,NULL,NULL,NULL,NULL,NULL,'Created from the DeckChek device library. Rename it and add the serial number in Equipment.',0,'2026-10-01T09:15:43.120Z','2026-10-01T09:15:43.120Z');
CREATE TABLE asset_midi_map (
  asset_id TEXT PRIMARY KEY REFERENCES asset(id),
  profile_id TEXT REFERENCES device_profile(id),
  map_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO "asset_midi_map" VALUES('d7e6f5a4-b3c2-4d1e-8f0a-9b8c7d6e5f4a','rane-twelve-mk2','{"controls":[{"channel":1,"id":"platter","label":"Platter","number":33,"type":"cc"},{"channel":1,"id":"start_stop","label":"Start/Stop","number":11,"type":"note"}],"mapSource":"learned"}','2026-10-01T09:30:00.000Z');
CREATE TABLE asset_settings_snapshot (
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
INSERT INTO "asset_settings_snapshot" VALUES('5a000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-00000000000a','2026-09-28T19:30:00.000Z',3.0,0.0,2.5,8.0,'medium','high','Baerwald',NULL,'1.02','{"cartridge":"Ortofon Concorde MkII Club"}');
CREATE TABLE booth (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venue(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  indoor_outdoor TEXT,
  floor_type TEXT,
  stage_type TEXT,
  notes TEXT
);
INSERT INTO "booth" VALUES('b0000000-0000-4000-8000-000000000001','7e000000-0000-4000-8000-000000000001','Main booth','indoor','suspended','riser',NULL);
CREATE TABLE capture (
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
INSERT INTO "capture" VALUES('ca000000-0000-4000-8000-000000000001','run-20260929-1','Traktor Audio 8 DJ','{0.0.1.00000000}.{4f2b}','wasapi',48000,'f32',32,2,'{"left":0,"right":1}','2026-09-29T21:09:50.000Z',480000,0,0,0,0,NULL,NULL,0,'[]');
INSERT INTO "capture" VALUES('ca000000-0000-4000-8000-000000000002','run-20261002-1','Line In (Realtek)',NULL,'wasapi',44100,'i16',16,2,'{"left":0,"right":1}','2026-10-02T17:45:00.000Z',529200,1,0,12,3,NULL,NULL,0,'["clipping"]');
CREATE TABLE deck_position (
  id TEXT PRIMARY KEY,
  booth_id TEXT NOT NULL REFERENCES booth(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  orientation TEXT,
  distance_to_monitor_m REAL,
  distance_to_sub_m REAL,
  height_m REAL,
  notes TEXT
);
INSERT INTO "deck_position" VALUES('dp000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Left of mixer','facing crowd',1.2,4.5,0.95,NULL);
CREATE TABLE device_profile (
  id TEXT PRIMARY KEY,                       -- profile id, e.g. "pioneer-plx-crss12"
  product_id TEXT REFERENCES product(id) ON DELETE SET NULL,
  json TEXT NOT NULL,                        -- full profile JSON as last synced
  version INTEGER NOT NULL DEFAULT 1,        -- bumped whenever the synced JSON changes
  loaded_at TEXT NOT NULL
);
INSERT INTO "device_profile" VALUES('rane-twelve-mk2','8a4d2c61-7e5f-4b9a-a3c2-1d0e9f8b7a65','{"category":"controller","id":"rane-twelve-mk2","manufacturer":"Rane","midi":{"complete":false,"controls":[],"mapSource":"learn"},"model":"TWELVE MK2","schemaVersion":1,"specs":[{"confidence":"unverified","key":"pitch_ranges","label":"Pitch ranges","notes":"Confirm in user guide.","source":"Retailer spec listing","unit":"%","value":"±8 / ±16 / ±50"}],"summary":"12-inch motorised turntable-style controller for Serato DJ Pro","tests":[{"id":"twelve-driver"},{"id":"twelve-usb-enum"},{"id":"twelve-midi-coverage"}]}',2,'2026-10-01T09:15:43.120Z');
CREATE TABLE device_test_result (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  profile_id TEXT NOT NULL REFERENCES device_profile(id),
  test_id TEXT NOT NULL,
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'unknown', 'skipped')),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
INSERT INTO "device_test_result" VALUES('dr000000-0000-4000-8000-000000000001','d7e6f5a4-b3c2-4d1e-8f0a-9b8c7d6e5f4a','rane-twelve-mk2','twelve-driver',NULL,'pass','{"driver":"Rane TWELVE MK2 ASIO","version":"1.4.0"}','2026-10-01T09:20:00.000Z');
INSERT INTO "device_test_result" VALUES('dr000000-0000-4000-8000-000000000002','d7e6f5a4-b3c2-4d1e-8f0a-9b8c7d6e5f4a','rane-twelve-mk2','twelve-usb-enum',NULL,'fail','{"reason":"device not enumerated on USB hub port 3"}','2026-10-01T09:21:00.000Z');
INSERT INTO "device_test_result" VALUES('dr000000-0000-4000-8000-000000000003','d7e6f5a4-b3c2-4d1e-8f0a-9b8c7d6e5f4a','rane-twelve-mk2','twelve-midi-coverage','run-20261002-1','skipped','{}','2026-10-02T17:46:00.000Z');
CREATE TABLE dvs_media_profile (
  product_id TEXT PRIMARY KEY REFERENCES product(id) ON DELETE CASCADE,
  family TEXT NOT NULL,
  version TEXT,
  medium_type TEXT NOT NULL,
  analyzer_key TEXT,
  documentation_url TEXT,
  notes TEXT
);
INSERT INTO "dvs_media_profile" VALUES('c5e8a1b3-2d4f-4e6a-8b9c-0a1b2c3d4e5f','Serato NoiseMap','2.5','vinyl_12in','serato_cv25',NULL,NULL);
CREATE TABLE dvs_media_side (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES dvs_media_profile(product_id) ON DELETE CASCADE,
  side_label TEXT NOT NULL,
  nominal_rpm REAL,
  duration_sec REAL,
  public_code TEXT,
  absolute_position_supported INTEGER,
  relative_supported INTEGER
);
INSERT INTO "dvs_media_side" VALUES('ms000000-0000-4000-8000-000000000001','c5e8a1b3-2d4f-4e6a-8b9c-0a1b2c3d4e5f','A',33.333,900.0,NULL,1,1);
CREATE TABLE evidence (
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
INSERT INTO "evidence" VALUES('run-20260929-1:finding:0:IMBALANCE','run-20260929-1','diagnostic_finding','review',NULL,NULL,0.7,'Channel imbalance: Left louder by 0.8 dB','{"code":"IMBALANCE","isolationTests":["Swap cartridge leads"],"possibleCauses":["cartridge","cable"]}','2026-09-29T21:10:00.000Z');
INSERT INTO "evidence" VALUES('run-20260929-1:contra:0:hum_level_db','run-20260929-1','contradicting_measurement','info',NULL,NULL,0.7,'Measurement hum_level_db contradicts IMBALANCE','{"hypothesis":"IMBALANCE","metricId":"hum_level_db"}','2026-09-29T21:10:00.000Z');
INSERT INTO "evidence" VALUES('run-20261002-1:finding:0:HUM','run-20261002-1','diagnostic_finding','warning',NULL,NULL,0.85,'Mains hum: 50 Hz hum at -48 dB','{"code":"HUM","isolationTests":["Lift ground at mixer"],"possibleCauses":["ground loop"]}','2026-10-02T17:45:12.000Z');
CREATE TABLE evidence_measurement (
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  measurement_id TEXT NOT NULL REFERENCES measurement(id) ON DELETE CASCADE,
  PRIMARY KEY(evidence_id, measurement_id)
);
INSERT INTO "evidence_measurement" VALUES('run-20260929-1:finding:0:IMBALANCE','run-20260929-1:channel_balance_db');
INSERT INTO "evidence_measurement" VALUES('run-20260929-1:contra:0:hum_level_db','run-20260929-1:hum_level_db');
INSERT INTO "evidence_measurement" VALUES('run-20261002-1:finding:0:HUM','run-20261002-1:hum_level_db');
CREATE TABLE full_side_scan (
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
INSERT INTO "full_side_scan" VALUES('fs000000-0000-4000-8000-000000000001','run-20260929-1','rs000000-0000-4000-8000-000000000001',0,480000,1,0.91,'ready',0);
INSERT INTO "full_side_scan" VALUES('fs000000-0000-4000-8000-000000000002','run-20261002-1','rs000000-0000-4000-8000-000000000001',5,480005,1,0.88,'ready',0);
CREATE TABLE hypothesis (
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
INSERT INTO "hypothesis" VALUES('run-20260929-1:hyp:0:IMBALANCE','run-20260929-1','IMBALANCE','contested',0.7,'review','Channel imbalance: Left louder by 0.8 dB',1,'["cartridge","cable"]','["Swap cartridge leads"]','2026-09-29T21:10:00.000Z','2026-09-29T21:10:00.000Z');
INSERT INTO "hypothesis" VALUES('run-20261002-1:hyp:0:HUM','run-20261002-1','HUM','supported',0.85,'warning','Mains hum: 50 Hz hum at -48 dB',1,'["ground loop"]','["Lift ground at mixer"]','2026-10-02T17:45:12.000Z','2026-10-02T17:45:12.000Z');
CREATE TABLE hypothesis_contradiction (
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  hypothesis_id TEXT NOT NULL REFERENCES hypothesis(id) ON DELETE CASCADE,
  weight REAL NOT NULL,
  PRIMARY KEY(evidence_id, hypothesis_id)
);
INSERT INTO "hypothesis_contradiction" VALUES('run-20260929-1:contra:0:hum_level_db','run-20260929-1:hyp:0:IMBALANCE',1.0);
CREATE TABLE hypothesis_support (
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  hypothesis_id TEXT NOT NULL REFERENCES hypothesis(id) ON DELETE CASCADE,
  weight REAL NOT NULL,
  PRIMARY KEY(evidence_id, hypothesis_id)
);
INSERT INTO "hypothesis_support" VALUES('run-20260929-1:finding:0:IMBALANCE','run-20260929-1:hyp:0:IMBALANCE',0.7);
INSERT INTO "hypothesis_support" VALUES('run-20261002-1:finding:0:HUM','run-20261002-1:hyp:0:HUM',0.85);
CREATE TABLE maintenance_event (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  event_type TEXT NOT NULL,
  event_at TEXT NOT NULL,
  description TEXT,
  service_provider TEXT,
  hours_estimate REAL,
  created_at TEXT NOT NULL
);
INSERT INTO "maintenance_event" VALUES('3e000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-00000000000a','cleaning','2026-09-28','Pitch fader cleaned and re-greased','self',0.5,'2026-09-28T19:40:00.000Z');
CREATE TABLE manufacturer (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  website TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO "manufacturer" VALUES('00000000-0000-4000-8000-000000000001','Technics','https://www.technics.com',NULL,'2026-09-20 18:02:11','2026-09-20 18:02:11');
INSERT INTO "manufacturer" VALUES('6b1f3c2a-9d4e-4a7b-8c21-5e0f7a9b3d41','Rane','https://www.rane.com','Added from the DeckChek device library','2026-10-01T09:15:43.120Z','2026-10-01T09:15:43.120Z');
CREATE TABLE measurement (
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
INSERT INTO "measurement" VALUES('run-20260929-1:channel_balance_db','run-20260929-1','ca000000-0000-4000-8000-000000000001','method:channel_balance_db:1','channel_balance_db','measured',0.8,NULL,'dB',NULL,NULL,NULL,0.9,0.1,NULL,NULL,'[]','2026-09-29T21:10:00.000Z');
INSERT INTO "measurement" VALUES('run-20260929-1:hum_level_db','run-20260929-1','ca000000-0000-4000-8000-000000000001','method:hum_level_db:1','hum_level_db','measured',-71.5,NULL,'dB',NULL,NULL,NULL,0.8,NULL,NULL,NULL,'[]','2026-09-29T21:10:00.000Z');
INSERT INTO "measurement" VALUES('run-20261002-1:channel_balance_db','run-20261002-1','ca000000-0000-4000-8000-000000000002','method:channel_balance_db:1','channel_balance_db','measured',0.2,NULL,'dB',NULL,NULL,NULL,0.9,NULL,NULL,NULL,'[]','2026-10-02T17:45:12.000Z');
INSERT INTO "measurement" VALUES('run-20261002-1:hum_level_db','run-20261002-1','ca000000-0000-4000-8000-000000000002','method:hum_level_db:1','hum_level_db','estimated',-48.2,NULL,'dB',NULL,NULL,NULL,0.6,NULL,NULL,NULL,'["clipping"]','2026-10-02T17:45:12.000Z');
CREATE TABLE product (
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
INSERT INTO "product" VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','TURNTABLE','SL-1200GR2',NULL,NULL,NULL,NULL,NULL,'Direct-drive turntable','https://us.technics.com/products/direct-drive-turntable-system-ii-sl-1200gr2','2026-09-20 18:02:11','2026-09-20 18:02:11');
INSERT INTO "product" VALUES('2f7c9e10-4b3a-4d6e-9a12-c3e5f7a9b1d2','00000000-0000-4000-8000-000000000001','turntable','SL-1200MK4','Black',NULL,2025,NULL,'EU','Direct-drive DJ turntable',NULL,'2026-09-21T10:00:00.000Z','2026-09-21T10:00:00.000Z');
INSERT INTO "product" VALUES('8a4d2c61-7e5f-4b9a-a3c2-1d0e9f8b7a65','6b1f3c2a-9d4e-4a7b-8c21-5e0f7a9b3d41','controller','TWELVE MK2',NULL,NULL,NULL,NULL,NULL,'12-inch motorised turntable-style controller for Serato DJ Pro','https://www.rane.com/twelve-mk2','2026-10-01T09:15:43.120Z','2026-10-01T09:15:43.120Z');
INSERT INTO "product" VALUES('c5e8a1b3-2d4f-4e6a-8b9c-0a1b2c3d4e5f','6b1f3c2a-9d4e-4a7b-8c21-5e0f7a9b3d41','DVS_MEDIA','Serato Control Vinyl','12-inch','2.5',NULL,NULL,NULL,'NoiseMap control vinyl',NULL,'2026-09-22T12:00:00.000Z','2026-09-22T12:00:00.000Z');
CREATE TABLE product_spec (
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
INSERT INTO "product_spec" VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','turntable.wow_flutter',0.025,NULL,NULL,'percent',NULL,'WRMS','MANUFACTURER_PUBLISHED','Technics SL-1200GR2 official specifications','https://us.technics.com/products/direct-drive-turntable-system-ii-sl-1200gr2','2026-10-05',NULL,NULL,NULL);
INSERT INTO "product_spec" VALUES('rane-twelve-mk2:spec:0:pitch_ranges','8a4d2c61-7e5f-4b9a-a3c2-1d0e9f8b7a65','pitch_ranges',NULL,'±8 / ±16 / ±50',NULL,'%',NULL,'device-profile','research-unverified','Retailer spec listing',NULL,'2026-10-01T09:15:43.120Z',NULL,NULL,'Pitch ranges · Confirm in user guide.');
INSERT INTO "product_spec" VALUES('rane-twelve-mk2:spec:1:usb_midi_class_compliant','8a4d2c61-7e5f-4b9a-a3c2-1d0e9f8b7a65','usb_midi_class_compliant',NULL,NULL,1,NULL,NULL,'device-profile','manufacturer-doc',NULL,'https://www.rane.com/twelve-mk2','2026-10-01T09:15:43.120Z',NULL,NULL,'USB MIDI class compliant');
CREATE TABLE record_copy (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES record_release(id),
  nickname TEXT,
  acquired_date TEXT,
  user_grade TEXT,
  cleaning_state TEXT,
  notes TEXT,
  retired INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "record_copy" VALUES('rc000000-0000-4000-8000-000000000001','re000000-0000-4000-8000-000000000001',NULL,NULL,NULL,NULL,NULL,0);
CREATE TABLE record_release (
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
INSERT INTO "record_release" VALUES('re000000-0000-4000-8000-000000000001',NULL,'Test LP',NULL,NULL,NULL,NULL,NULL,NULL,NULL);
CREATE TABLE record_side (
  id TEXT PRIMARY KEY,
  record_copy_id TEXT NOT NULL REFERENCES record_copy(id) ON DELETE CASCADE,
  side_label TEXT NOT NULL,
  nominal_rpm REAL,
  expected_duration_sec REAL,
  notes TEXT
);
INSERT INTO "record_side" VALUES('rs000000-0000-4000-8000-000000000001','rc000000-0000-4000-8000-000000000001','A',NULL,NULL,NULL);
CREATE TABLE scan_alignment (
  id TEXT PRIMARY KEY,
  scan_a_id TEXT NOT NULL REFERENCES full_side_scan(id) ON DELETE CASCADE,
  scan_b_id TEXT NOT NULL REFERENCES full_side_scan(id) ON DELETE CASCADE,
  alignment_method TEXT NOT NULL,
  offset_samples INTEGER NOT NULL DEFAULT 0,
  drift_model_json TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL
);
INSERT INTO "scan_alignment" VALUES('al000000-0000-4000-8000-000000000001','fs000000-0000-4000-8000-000000000001','fs000000-0000-4000-8000-000000000002','cross_correlation',5,'{"counts":{"missing":2,"new":1,"persistent":4},"drift":{"ppm":12.5}}',0.93);
CREATE TABLE schema_migration (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL,
  app_version TEXT
);
INSERT INTO "schema_migration" VALUES(1,'2026-09-20 18:02:11','spec');
INSERT INTO "schema_migration" VALUES(2,'2026-10-01 09:15:42','0.0.4');
INSERT INTO "schema_migration" VALUES(1000,'2026-09-20 18:02:11','seed');
CREATE TABLE session (
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
INSERT INTO "session" VALUES('run-20260929-1','diagnostic','5e000000-0000-4000-8000-000000000001','2026-09-29T21:10:00.000Z','2026-09-29T21:10:00.000Z','0.0.3',1,'completed','Stereo balance',NULL,0.82,'{"channels":2,"deviceId":"a1000000-0000-4000-8000-00000000000a","sampleRate":48000,"score":82.0,"sourceFile":null,"test":"Stereo balance"}');
INSERT INTO "session" VALUES('run-20261002-1','quick',NULL,'2026-10-02T17:45:12.000Z','2026-10-02T17:45:12.000Z','0.0.4',1,'completed','Hum and noise','Mixer ground lifted',0.64,'{"channels":2,"deviceId":null,"sampleRate":44100,"score":64.0,"sourceFile":"hum-check.wav","test":"Hum and noise"}');
CREATE TABLE setup (
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
INSERT INTO "setup" VALUES('5e000000-0000-4000-8000-000000000001','Basement Club residency','club','7e000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','dp000000-0000-4000-8000-000000000001','sc000000-0000-4000-8000-000000000001',NULL,'2026-09-22T20:05:00.000Z');
CREATE TABLE setup_component (
  id TEXT PRIMARY KEY,
  setup_id TEXT NOT NULL REFERENCES setup(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  position TEXT,
  settings_snapshot_id TEXT REFERENCES asset_settings_snapshot(id)
);
INSERT INTO "setup_component" VALUES('5c000000-0000-4000-8000-000000000001','5e000000-0000-4000-8000-000000000001','turntable','a1000000-0000-4000-8000-00000000000a','left','5a000000-0000-4000-8000-000000000001');
INSERT INTO "setup_component" VALUES('5c000000-0000-4000-8000-000000000002','5e000000-0000-4000-8000-000000000001','turntable','a2000000-0000-4000-8000-00000000000b','right',NULL);
CREATE TABLE support_configuration (
  id TEXT PRIMARY KEY,
  deck_position_id TEXT REFERENCES deck_position(id),
  name TEXT NOT NULL,
  description TEXT,
  structure_json TEXT NOT NULL DEFAULT '[]',
  approximate_mass_kg REAL,
  coupled_state TEXT,
  notes TEXT
);
INSERT INTO "support_configuration" VALUES('sc000000-0000-4000-8000-000000000001','dp000000-0000-4000-8000-000000000001','Isolation platform','Butcher block on sorbothane feet','[{"layer":"butcher block","mass_kg":6},{"layer":"sorbothane","count":4}]',6.0,'decoupled',NULL);
CREATE TABLE venue (
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
INSERT INTO "venue" VALUES('7e000000-0000-4000-8000-000000000001','Basement Club','club','Leeds','West Yorkshire','GB','Booth floor is suspended timber','2026-09-22T20:00:00.000Z','2026-09-22T20:00:00.000Z');
CREATE TABLE vinyl_event (
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
INSERT INTO "vinyl_event" VALUES('ve000000-0000-4000-8000-000000000001','fs000000-0000-4000-8000-000000000001','click',123456,123520,0.26,1,'minor',0.8,'persistent','left',1.8,4,'{"peakDb":-12.5}',NULL,NULL);
CREATE INDEX idx_product_manufacturer_model
ON product(manufacturer_id, model);
CREATE INDEX idx_product_spec_key
ON product_spec(product_id, key);
CREATE INDEX idx_asset_product ON asset(product_id);
CREATE INDEX idx_venue_name ON venue(name);
CREATE INDEX idx_session_started ON session(started_at);
CREATE INDEX idx_measurement_metric
ON measurement(metric_key, method_id);
CREATE INDEX idx_measurement_session
ON measurement(session_id);
CREATE INDEX idx_evidence_session_type
ON evidence(session_id, evidence_type);
CREATE INDEX idx_vinyl_event_scan_position
ON vinyl_event(scan_id, normalized_position);
CREATE INDEX idx_device_profile_product ON device_profile(product_id);
CREATE INDEX idx_device_test_result_asset ON device_test_result(asset_id, profile_id, test_id, created_at);
COMMIT;
