-- DeckChek v0.1.0 database fixture (docs/DEVELOPMENT-PLAN.md §1.5). DO NOT EDIT:
-- fixtures are append-only per release.
--
-- Schema: database/migrations/0001..0022 (through unit_population_ext), i.e. the v0.0.7
-- fixture migrated forward through 0014-0022 (schema_migration rows 14-22 stamped 0.1.0).
-- Rows: the v0.0.7 representative data plus signing_key/certificate (0014), reference_pack/
-- reference_sample/reference_sample_claim (0015, 0022; one observation claimed by two packs),
-- customer/service_job/status log/work log (with an amends link)/service_job_result (0016),
-- maintenance_reminder (asset and product templates) with a linked maintenance_event and
-- asset.deck_position_id placement (0017), a phone-origin session (0018), monitor_session/
-- monitor_event/monitor_minute (0019), mapper_model (0020), ledger_export and
-- asset.public_notes (0021). Every table holds at least one row. All names, serials and keys
-- are obviously fake. Produced with Python's sqlite3 Connection.iterdump() after
-- integrity_check = ok and an empty foreign_key_check with foreign_keys=ON. Loaded by the
-- fixture-upgrade tests in src-tauri/src.
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
CREATE TABLE app_state (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO "app_state" VALUES('setup.wizard','{"completed":true,"step":6}','2026-10-10T08:05:00.000Z');
INSERT INTO "app_state" VALUES('backup.schedule','{"mode":"weekly","retention":5}','2026-10-10T08:06:00.000Z');
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
, rated_life_hours REAL, deck_position_id TEXT REFERENCES deck_position(id), public_notes TEXT);
INSERT INTO "asset" VALUES('a1000000-0000-4000-8000-00000000000a','2f7c9e10-4b3a-4d6e-9a12-c3e5f7a9b1d2','Left deck','GE1AA001234','2025-11-02','2025-11-05',NULL,'1.02','good','Pitch fader re-greased Sept 2026',0,'2026-09-21T10:01:00.000Z','2026-09-28T19:40:00.000Z',1000.0,'dp000000-0000-4000-8000-000000000001','Serviced Oct 2026 (fixture note)');
INSERT INTO "asset" VALUES('a2000000-0000-4000-8000-00000000000b','10000000-0000-4000-8000-000000000001','Right deck',NULL,'2024-03-15',NULL,NULL,NULL,'fair',NULL,0,'2026-09-21T10:02:00.000Z','2026-09-21T10:02:00.000Z',NULL,NULL,NULL);
INSERT INTO "asset" VALUES('d7e6f5a4-b3c2-4d1e-8f0a-9b8c7d6e5f4a','8a4d2c61-7e5f-4b9a-a3c2-1d0e9f8b7a65','My TWELVE MK2',NULL,NULL,NULL,NULL,NULL,NULL,'Created from the DeckChek device library. Rename it and add the serial number in Equipment.',0,'2026-10-01T09:15:43.120Z','2026-10-01T09:15:43.120Z',NULL,NULL,NULL);
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
CREATE TABLE asset_usage (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  kind TEXT NOT NULL DEFAULT 'play' CHECK (kind IN ('play','bench')),
  started_at TEXT NOT NULL,
  hours REAL NOT NULL CHECK (hours >= 0 AND hours <= 24),
  source TEXT NOT NULL CHECK (source IN ('manual','djlog','deckchek','import')),
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  note TEXT,
  confirmed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
INSERT INTO "asset_usage" VALUES('u0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-00000000000a','play','2026-10-10T20:00:00.000Z',3.5,'manual',NULL,'Friday club night',1,'2026-10-12T20:00:00.000Z');
INSERT INTO "asset_usage" VALUES('u0000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-00000000000a','bench','2026-09-29T21:10:00.000Z',0.25,'deckchek','run-20260929-1',NULL,0,'2026-10-12T20:00:00.000Z');
CREATE TABLE backup_log (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "backup_log" VALUES('bk-1','manual','C:/Backups/deckchek-20261010.deckchek-backup',245760,5,'2026-10-10T09:30:00.000Z',1);
INSERT INTO "backup_log" VALUES('bk-2','safety','C:/Backups/safety-20261010.deckchek-backup',245760,5,'2026-10-10T09:40:00.000Z',0);
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
CREATE TABLE buffer_recommendation (
  id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  software TEXT NOT NULL,
  frames INTEGER NOT NULL,
  ms REAL NOT NULL,
  based_on_run_id TEXT REFERENCES latency_run(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
INSERT INTO "buffer_recommendation" VALUES('b1000000-0000-4000-8000-000000000001','Traktor Audio 8 DJ','Serato DJ Pro',256,5.3,'l0000000-0000-4000-8000-000000000001','2026-10-12T20:00:00.000Z');
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
CREATE TABLE certificate (
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
INSERT INTO "certificate" VALUES('ce000000-0000-4000-8000-000000000001','d7e6f5a4-b3c2-4d1e-8f0a-9b8c7d6e5f4a','rane-twelve-mk2','sk000000-0000-4000-8000-000000000001','FIXTURE-CERT-0001','Fixture Tester','pass','7e3e5b641bb95284ab02e6b9f694727d27337f1bc7d89a3d9a7f9788b51667f3','2026-10-21T10:00:00.000Z','2027-10-21T10:00:00.000Z','certificates/FIXTURE-CERT-0001.pdf','certificates/FIXTURE-CERT-0001.json','{"assetId":"d7e6f5a4-b3c2-4d1e-8f0a-9b8c7d6e5f4a","profileId":"rane-twelve-mk2","verdict":"pass"}');
INSERT INTO "certificate" VALUES('ce000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-00000000000a','rane-twelve-mk2','sk000000-0000-4000-8000-000000000002','FIXTURE-CERT-0002','Fixture Tester','draft','2b5987515f55a2d05b10288d1e53a0c53a97ce4447011d0a9a098153e82077f1','2026-10-05T10:00:00.000Z','2027-10-05T10:00:00.000Z',NULL,NULL,'{}');
CREATE TABLE customer (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO "customer" VALUES('cu000000-0000-4000-8000-000000000001','Example Customer','+44 0000 000000','customer@example.invalid','Fixture customer, not a real person','2026-10-15T09:00:00.000Z');
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
, media_id TEXT REFERENCES test_media(id), media_track_key TEXT);
INSERT INTO "device_test_result" VALUES('dr000000-0000-4000-8000-000000000001','d7e6f5a4-b3c2-4d1e-8f0a-9b8c7d6e5f4a','rane-twelve-mk2','twelve-driver',NULL,'pass','{"driver":"Rane TWELVE MK2 ASIO","version":"1.4.0"}','2026-10-01T09:20:00.000Z',NULL,NULL);
INSERT INTO "device_test_result" VALUES('dr000000-0000-4000-8000-000000000002','d7e6f5a4-b3c2-4d1e-8f0a-9b8c7d6e5f4a','rane-twelve-mk2','twelve-usb-enum',NULL,'fail','{"reason":"device not enumerated on USB hub port 3"}','2026-10-01T09:21:00.000Z',NULL,NULL);
INSERT INTO "device_test_result" VALUES('dr000000-0000-4000-8000-000000000003','d7e6f5a4-b3c2-4d1e-8f0a-9b8c7d6e5f4a','rane-twelve-mk2','twelve-midi-coverage','run-20261002-1','skipped','{}','2026-10-02T17:46:00.000Z','builtin:serato-cv02.5','side-a-timecode');
INSERT INTO "device_test_result" VALUES('dr000000-0000-4000-8000-000000000004','d7e6f5a4-b3c2-4d1e-8f0a-9b8c7d6e5f4a','rane-twelve-mk2','twelve-timecode',NULL,'pass','{}','2026-10-10T09:00:00.000Z','custom:my-test-record','side-a-1khz');
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
CREATE TABLE hum_run (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  venue_id TEXT REFERENCES venue(id) ON DELETE SET NULL,
  setup_id TEXT REFERENCES setup(id),
  kind TEXT NOT NULL CHECK (kind IN ('hum','feedback')),
  mains_hz INTEGER,
  verdict TEXT,
  causes_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
INSERT INTO "hum_run" VALUES('40000000-0000-4000-8000-000000000001','run-20261002-1','7e000000-0000-4000-8000-000000000001','5e000000-0000-4000-8000-000000000001','hum',50,'ground_loop','["ground_loop"]','2026-10-12T20:00:00.000Z');
CREATE TABLE hum_step (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES hum_run(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  step_id TEXT NOT NULL,
  label TEXT NOT NULL,
  fundamental_dbfs REAL,
  harmonics_json TEXT NOT NULL DEFAULT '[]',
  total_dbfs REAL,
  floor_dbfs REAL,
  delta_db REAL,
  level_dbfs REAL,
  peak_hz REAL,
  growth_db_per_s REAL,
  onset INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
INSERT INTO "hum_step" VALUES('40100000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',0,'baseline','Baseline',-48.2,'[{"n":2,"hz":100,"dbfs":-60.1}]',-46.0,-72.0,NULL,-20.0,NULL,NULL,0,0,NULL);
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
CREATE TABLE latency_run (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  setup_id TEXT REFERENCES setup(id) ON DELETE SET NULL,
  device_name TEXT NOT NULL,
  host_api TEXT,
  sample_rate_hz INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('roundtrip','stress')),
  buffer_frames INTEGER,
  cpu_load_pct INTEGER,
  measured_ms REAL,
  std_ms REAL,
  expanded_u_ms REAL,
  reported_ms REAL,
  xruns INTEGER,
  max_gap_ms REAL,
  verdict TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
INSERT INTO "latency_run" VALUES('l0000000-0000-4000-8000-000000000001','run-20260929-1','5e000000-0000-4000-8000-000000000001','Traktor Audio 8 DJ','WASAPI',48000,'roundtrip',256,12,10.9,0.12,0.4,10.7,0,0.0,'ok','{"requestedFrames":256,"actualFrames":256}','2026-10-12T20:00:00.000Z');
CREATE TABLE ledger_export (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  selection_json TEXT NOT NULL CHECK (json_valid(selection_json)),
  privacy_json TEXT NOT NULL CHECK (json_valid(privacy_json)),
  ledger_sha256 TEXT NOT NULL CHECK (length(ledger_sha256) = 64)
);
INSERT INTO "ledger_export" VALUES('le000000-0000-4000-8000-000000000001',1,'2026-10-27T09:00:00.000Z','{"assetIds":["a1000000-0000-4000-8000-00000000000a","a2000000-0000-4000-8000-00000000000b"],"includeCertificates":true}','{"includePrivateNotes":false,"includeSerials":false}','5c2091933a8abfde854a13a8833cb3e82a9cef4c3a43c8a215560f35a4f76d21');
INSERT INTO "ledger_export" VALUES('le000000-0000-4000-8000-000000000002',2,'2026-10-28T09:00:00.000Z','{"assetIds":["a1000000-0000-4000-8000-00000000000a"],"includeCertificates":false}','{"includePrivateNotes":false,"includeSerials":true}','3ec49d882b239b0c3a2994efea4affea23e9261f282acbf6067dbd5be14805b2');
CREATE TABLE maintenance_event (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  event_type TEXT NOT NULL,
  event_at TEXT NOT NULL,
  description TEXT,
  service_provider TEXT,
  hours_estimate REAL,
  created_at TEXT NOT NULL
, reminder_id TEXT REFERENCES maintenance_reminder(id), hours_at_event REAL);
INSERT INTO "maintenance_event" VALUES('3e000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-00000000000a','cleaning','2026-09-28','Pitch fader cleaned and re-greased','self',0.5,'2026-09-28T19:40:00.000Z',NULL,NULL);
INSERT INTO "maintenance_event" VALUES('3e000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-00000000000a','cleaning','2026-10-17','Scheduled pitch fader service','self',0.75,'2026-10-17T14:10:00.000Z','mr000000-0000-4000-8000-000000000001',412.5);
CREATE TABLE maintenance_reminder (
  id TEXT PRIMARY KEY,
  asset_id TEXT REFERENCES asset(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES product(id),
  title TEXT NOT NULL,
  basis TEXT NOT NULL CHECK (basis IN ('days','hours')),
  interval_value REAL NOT NULL CHECK (interval_value > 0),
  warn_before REAL NOT NULL DEFAULT 14 CHECK (warn_before >= 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  snoozed_until TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO "maintenance_reminder" VALUES('mr000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-00000000000a',NULL,'Clean and re-grease pitch fader','days',90.0,14.0,1,NULL,'2026-10-01T10:00:00.000Z');
INSERT INTO "maintenance_reminder" VALUES('mr000000-0000-4000-8000-000000000002',NULL,'2f7c9e10-4b3a-4d6e-9a12-c3e5f7a9b1d2','Replace stylus (product template)','hours',800.0,50.0,1,'2026-11-15','2026-10-01T10:05:00.000Z');
INSERT INTO "maintenance_reminder" VALUES('mr000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-00000000000b',NULL,'Check platter bearing','days',180.0,0.0,0,NULL,'2026-10-01T10:10:00.000Z');
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
CREATE TABLE mapper_model (
  id TEXT PRIMARY KEY,
  asset_id TEXT REFERENCES asset(id) ON DELETE SET NULL,
  profile_id TEXT REFERENCES device_profile(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  model_json TEXT NOT NULL CHECK (json_valid(model_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO "mapper_model" VALUES('mm000000-0000-4000-8000-000000000001','d7e6f5a4-b3c2-4d1e-8f0a-9b8c7d6e5f4a','rane-twelve-mk2','TWELVE MK2 fixture mapping','{"controls":[{"channel":1,"id":"platter","number":33,"type":"cc"}],"version":1}','2026-10-26T10:00:00.000Z','2026-10-26T10:30:00.000Z');
INSERT INTO "mapper_model" VALUES('mm000000-0000-4000-8000-000000000002',NULL,NULL,'Unlinked scratch mapping','{"controls":[],"version":1}','2026-10-26T11:00:00.000Z','2026-10-26T11:00:00.000Z');
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
CREATE TABLE monitor_event (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES monitor_session(id) ON DELETE CASCADE,
  t_ms INTEGER NOT NULL,
  deck TEXT,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  value REAL,
  baseline REAL,
  message TEXT
);
INSERT INTO "monitor_event" VALUES('me000000-0000-4000-8000-000000000001','mo000000-0000-4000-8000-000000000001',65000,'A','hum','warning',-48.5,-60.0,'Hum above baseline on deck A');
INSERT INTO "monitor_event" VALUES('me000000-0000-4000-8000-000000000002','mo000000-0000-4000-8000-000000000001',120000,NULL,'started','info',NULL,NULL,NULL);
INSERT INTO "monitor_event" VALUES('me000000-0000-4000-8000-000000000003','mo000000-0000-4000-8000-000000000001',150500,'B','dropout','critical',3.0,0.0,'Timecode dropouts on deck B');
CREATE TABLE monitor_minute (
  session_id TEXT NOT NULL REFERENCES monitor_session(id) ON DELETE CASCADE,
  minute INTEGER NOT NULL,
  deck TEXT NOT NULL,
  snr_db_min REAL,
  snr_db_mean REAL,
  hum_db_max REAL,
  drift_deg_max REAL,
  dropouts INTEGER,
  PRIMARY KEY (session_id, minute, deck)
);
INSERT INTO "monitor_minute" VALUES('mo000000-0000-4000-8000-000000000001',0,'A',32.1,35.4,-61.0,0.4,0);
INSERT INTO "monitor_minute" VALUES('mo000000-0000-4000-8000-000000000001',0,'B',31.8,35.0,-60.5,0.5,0);
INSERT INTO "monitor_minute" VALUES('mo000000-0000-4000-8000-000000000001',1,'A',30.2,34.9,-48.5,0.6,1);
INSERT INTO "monitor_minute" VALUES('mo000000-0000-4000-8000-000000000001',2,'B',28.0,33.1,-59.9,1.2,3);
CREATE TABLE monitor_session (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  device_name TEXT,
  host_api TEXT,
  sample_rate INTEGER,
  format TEXT,
  config_json TEXT NOT NULL,
  summary_json TEXT,
  asset_id TEXT REFERENCES asset(id) ON DELETE SET NULL
);
INSERT INTO "monitor_session" VALUES('mo000000-0000-4000-8000-000000000001','2026-10-24T21:00:00.000Z','2026-10-24T21:03:00.000Z','Example USB Audio','WASAPI',48000,'f32','{"decks":["A","B"],"hum_hz":50}','{"events":2,"minutes":3}','a1000000-0000-4000-8000-00000000000a');
INSERT INTO "monitor_session" VALUES('mo000000-0000-4000-8000-000000000002','2026-10-25T21:00:00.000Z',NULL,NULL,NULL,NULL,NULL,'{}',NULL,NULL);
CREATE TABLE photo (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL CHECK (mime = 'image/jpeg'),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO "photo" VALUES('f0000000-0000-4000-8000-000000000001','9d9f1fd2a343913f91a119481327ef37fd5967b31e1a10447f0833fa772f6243','image/jpeg',1200,800,53,'2026-10-12T20:00:00.000Z');
CREATE TABLE photo_link (
  id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES photo(id) ON DELETE CASCADE,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('asset','service_job','certificate')),
  owner_id TEXT NOT NULL,
  caption TEXT,
  alt_text TEXT,
  stage TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(photo_id, owner_kind, owner_id)
);
INSERT INTO "photo_link" VALUES('f1000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','asset','a1000000-0000-4000-8000-00000000000a','Front panel','Turntable front panel','before',1,0,'2026-10-12T20:00:00.000Z');
INSERT INTO "photo_link" VALUES('f1000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000001','asset','a2000000-0000-4000-8000-00000000000b',NULL,NULL,NULL,0,0,'2026-10-12T20:00:00.000Z');
CREATE TABLE pregig_preset (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0,
  setup_id TEXT REFERENCES setup(id) ON DELETE SET NULL,
  json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO "pregig_preset" VALUES('p0000000-0000-4000-8000-000000000001','Club night',0,'5e000000-0000-4000-8000-000000000001','{"steps":["inputs","hum"]}','2026-10-12T20:00:00.000Z','2026-10-12T20:00:00.000Z');
CREATE TABLE pregig_run (
  id TEXT PRIMARY KEY,
  preset_id TEXT REFERENCES pregig_preset(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  verdict TEXT NOT NULL CHECK (verdict IN ('green', 'amber', 'red', 'incomplete', 'cancelled')),
  duration_ms INTEGER,
  app_version TEXT NOT NULL,
  venue_id TEXT REFERENCES venue(id) ON DELETE SET NULL,
  notes TEXT
);
INSERT INTO "pregig_run" VALUES('p1000000-0000-4000-8000-000000000001','p0000000-0000-4000-8000-000000000001','run-20261002-1','2026-10-12T20:00:00.000Z','2026-10-12T20:00:00.000Z','amber',42000,'0.0.7','7e000000-0000-4000-8000-000000000001','Hum at deck B');
CREATE TABLE pregig_step_result (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES pregig_run(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  deck TEXT,
  state TEXT NOT NULL CHECK (state IN ('pass', 'warn', 'fail', 'skipped', 'unsupported', 'error')),
  summary TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  fix_json TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO "pregig_step_result" VALUES('p2000000-0000-4000-8000-000000000001','p1000000-0000-4000-8000-000000000001','hum','B','warn','Hum 6 dB above floor','{"humToFloorDb":6.1}','[{"text":"Try another outlet"}]');
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
CREATE TABLE reference_pack (
  id TEXT PRIMARY KEY,
  source_label TEXT,
  imported_at TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  sha256 TEXT NOT NULL
);
INSERT INTO "reference_pack" VALUES('rp000000-0000-4000-8000-000000000001','Fixture reference pack A','2026-10-22T08:00:00.000Z',2,'6b257e16389924362f71c099f41f7daf4b88c79c3ed905f43edc3b205437844a');
INSERT INTO "reference_pack" VALUES('rp000000-0000-4000-8000-000000000002','Fixture reference pack B','2026-10-23T08:00:00.000Z',1,'f48f480d7d76f72ade8670fc4ff78cfc64d83301df503aa7b77eca9c5c94488a');
CREATE TABLE reference_sample (
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
INSERT INTO "reference_sample" VALUES('rs000000-0000-4000-8000-000000000001','rp000000-0000-4000-8000-000000000001','contrib-0001','example:turntable-x','wow_flutter_rms_percent','wow_flutter_rms',1,0.12,'%','61aaa7d941b6d2eadb9e8f1969abeddcd53db200709fe47932122d393b879676');
INSERT INTO "reference_sample" VALUES('rs000000-0000-4000-8000-000000000002','rp000000-0000-4000-8000-000000000001','contrib-0002','example:turntable-x','wow_flutter_rms_percent','wow_flutter_rms',1,0.18,'%','c240cde02df4e9678f18680348a5285f1db9f5c904e962357c55edde96b579ea');
CREATE TABLE reference_sample_claim (
  pack_id TEXT NOT NULL REFERENCES reference_pack(id) ON DELETE CASCADE,
  row_hash TEXT NOT NULL,
  PRIMARY KEY (pack_id, row_hash)
);
INSERT INTO "reference_sample_claim" VALUES('rp000000-0000-4000-8000-000000000001','61aaa7d941b6d2eadb9e8f1969abeddcd53db200709fe47932122d393b879676');
INSERT INTO "reference_sample_claim" VALUES('rp000000-0000-4000-8000-000000000001','c240cde02df4e9678f18680348a5285f1db9f5c904e962357c55edde96b579ea');
INSERT INTO "reference_sample_claim" VALUES('rp000000-0000-4000-8000-000000000002','61aaa7d941b6d2eadb9e8f1969abeddcd53db200709fe47932122d393b879676');
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
INSERT INTO "schema_migration" VALUES(3,'2026-10-10 08:00:03','0.0.5');
INSERT INTO "schema_migration" VALUES(4,'2026-10-10 08:00:03','0.0.5');
INSERT INTO "schema_migration" VALUES(5,'2026-10-10 08:00:03','0.0.5');
INSERT INTO "schema_migration" VALUES(6,'2026-10-14 09:00:01','0.0.7');
INSERT INTO "schema_migration" VALUES(7,'2026-10-14 09:00:02','0.0.7');
INSERT INTO "schema_migration" VALUES(8,'2026-10-14 09:00:03','0.0.7');
INSERT INTO "schema_migration" VALUES(9,'2026-10-14 09:00:04','0.0.7');
INSERT INTO "schema_migration" VALUES(10,'2026-10-14 09:00:05','0.0.7');
INSERT INTO "schema_migration" VALUES(11,'2026-10-14 09:00:06','0.0.7');
INSERT INTO "schema_migration" VALUES(12,'2026-10-14 09:00:07','0.0.7');
INSERT INTO "schema_migration" VALUES(13,'2026-10-14 09:00:08','0.0.7');
INSERT INTO "schema_migration" VALUES(14,'2026-10-28 09:00:01','0.1.0');
INSERT INTO "schema_migration" VALUES(15,'2026-10-28 09:00:02','0.1.0');
INSERT INTO "schema_migration" VALUES(16,'2026-10-28 09:00:03','0.1.0');
INSERT INTO "schema_migration" VALUES(17,'2026-10-28 09:00:04','0.1.0');
INSERT INTO "schema_migration" VALUES(18,'2026-10-28 09:00:05','0.1.0');
INSERT INTO "schema_migration" VALUES(19,'2026-10-28 09:00:06','0.1.0');
INSERT INTO "schema_migration" VALUES(20,'2026-10-28 09:00:07','0.1.0');
INSERT INTO "schema_migration" VALUES(21,'2026-10-28 09:00:08','0.1.0');
INSERT INTO "schema_migration" VALUES(22,'2026-10-28 09:00:09','0.1.0');
INSERT INTO "schema_migration" VALUES(1000,'2026-09-20 18:02:11','seed');
CREATE TABLE scratch_event (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES scratch_run(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('reversal','lock_loss','direction_error','skip','recovery')),
  t_ms REAL NOT NULL,
  duration_ms REAL,
  value REAL,
  detail_json TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO "scratch_event" VALUES('5c100000-0000-4000-8000-000000000001','5c000000-0000-4000-8000-000000000001','baby','lock_loss',1200.0,180.0,NULL,'{}');
CREATE TABLE scratch_run (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  setup_id TEXT REFERENCES setup(id),
  cartridge_asset_id TEXT REFERENCES asset(id),
  record_side_id TEXT REFERENCES record_side(id),
  format TEXT NOT NULL,
  bpm REAL NOT NULL,
  protocol_version INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 1,
  score REAL,
  components_json TEXT NOT NULL DEFAULT '{}',
  lock_losses INTEGER,
  longest_loss_ms REAL,
  median_recovery_ms REAL,
  direction_errors INTEGER,
  skips INTEGER,
  reversals INTEGER,
  peak_velocity REAL,
  tracking_force_g REAL,
  tonearm_note TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO "scratch_run" VALUES('5c000000-0000-4000-8000-000000000001','run-20260929-1','5e000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-00000000000a','rs000000-0000-4000-8000-000000000001','serato_cv02',90.0,1,1,78.0,'{"tracking":0.8}',2,180.0,95.0,1,0,14,1.9,2.0,'Counterweight set to 2.0 g','2026-10-12T20:00:00.000Z');
CREATE TABLE service_job (
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
INSERT INTO "service_job" VALUES('sj000000-0000-4000-8000-000000000001','J-0001','cu000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-00000000000a','collected','Pitch fader jumps at 0%','["dust cover","power lead"]','Scuffed plinth','Fader cleaned, re-greased and retested','2026-10-15T09:05:00.000Z','2026-10-19T16:00:00.000Z','2026-10-19T16:00:00.000Z');
INSERT INTO "service_job" VALUES('sj000000-0000-4000-8000-000000000002','J-0002',NULL,'a2000000-0000-4000-8000-00000000000b','diagnosing','Intermittent hum on left channel','[]',NULL,NULL,'2026-10-25T11:00:00.000Z','2026-10-25T11:30:00.000Z',NULL);
CREATE TABLE service_job_log (
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
INSERT INTO "service_job_log" VALUES('wl000000-0000-4000-8000-000000000001','sj000000-0000-4000-8000-000000000001','part','Contact cleaner (fixture)',1.0,NULL,4.5,NULL,'2026-10-16T09:30:00.000Z');
INSERT INTO "service_job_log" VALUES('wl000000-0000-4000-8000-000000000002','sj000000-0000-4000-8000-000000000001','labour','Strip, clean and re-grease pitch fader',NULL,45,NULL,NULL,'2026-10-16T10:30:00.000Z');
INSERT INTO "service_job_log" VALUES('wl000000-0000-4000-8000-000000000003','sj000000-0000-4000-8000-000000000001','note','Wiper track slightly worn',NULL,NULL,NULL,NULL,'2026-10-16T10:40:00.000Z');
INSERT INTO "service_job_log" VALUES('wl000000-0000-4000-8000-000000000004','sj000000-0000-4000-8000-000000000001','labour','Strip, clean and re-grease pitch fader (corrected to 60 min)',NULL,60,NULL,'wl000000-0000-4000-8000-000000000002','2026-10-17T14:05:00.000Z');
CREATE TABLE service_job_result (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES service_job(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('before','after')),
  session_id TEXT REFERENCES session(id),
  device_test_result_id TEXT REFERENCES device_test_result(id),
  CHECK ((session_id IS NULL) <> (device_test_result_id IS NULL))
);
INSERT INTO "service_job_result" VALUES('sr000000-0000-4000-8000-000000000001','sj000000-0000-4000-8000-000000000001','before','run-20261002-1',NULL);
INSERT INTO "service_job_result" VALUES('sr000000-0000-4000-8000-000000000002','sj000000-0000-4000-8000-000000000001','after',NULL,'dr000000-0000-4000-8000-000000000004');
CREATE TABLE service_job_status_log (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES service_job(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  at TEXT NOT NULL
);
INSERT INTO "service_job_status_log" VALUES('sl000000-0000-4000-8000-000000000001','sj000000-0000-4000-8000-000000000001',NULL,'intake','Booked in','2026-10-15T09:05:00.000Z');
INSERT INTO "service_job_status_log" VALUES('sl000000-0000-4000-8000-000000000002','sj000000-0000-4000-8000-000000000001','intake','diagnosing',NULL,'2026-10-15T10:00:00.000Z');
INSERT INTO "service_job_status_log" VALUES('sl000000-0000-4000-8000-000000000003','sj000000-0000-4000-8000-000000000001','diagnosing','repairing','Fader needs cleaning','2026-10-16T09:00:00.000Z');
INSERT INTO "service_job_status_log" VALUES('sl000000-0000-4000-8000-000000000004','sj000000-0000-4000-8000-000000000001','repairing','testing',NULL,'2026-10-17T14:00:00.000Z');
INSERT INTO "service_job_status_log" VALUES('sl000000-0000-4000-8000-000000000005','sj000000-0000-4000-8000-000000000001','testing','ready','Retest passed','2026-10-18T12:00:00.000Z');
INSERT INTO "service_job_status_log" VALUES('sl000000-0000-4000-8000-000000000006','sj000000-0000-4000-8000-000000000001','ready','collected','Picked up','2026-10-19T16:00:00.000Z');
INSERT INTO "service_job_status_log" VALUES('sl000000-0000-4000-8000-000000000101','sj000000-0000-4000-8000-000000000002',NULL,'intake','Booked in','2026-10-25T11:00:00.000Z');
INSERT INTO "service_job_status_log" VALUES('sl000000-0000-4000-8000-000000000102','sj000000-0000-4000-8000-000000000002','intake','diagnosing',NULL,'2026-10-25T11:30:00.000Z');
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
, origin TEXT NOT NULL DEFAULT 'desktop', source_device TEXT);
INSERT INTO "session" VALUES('run-20260929-1','diagnostic','5e000000-0000-4000-8000-000000000001','2026-09-29T21:10:00.000Z','2026-09-29T21:10:00.000Z','0.0.3',1,'completed','Stereo balance',NULL,0.82,'{"channels":2,"deviceId":"a1000000-0000-4000-8000-00000000000a","sampleRate":48000,"score":82.0,"sourceFile":null,"test":"Stereo balance"}','desktop',NULL);
INSERT INTO "session" VALUES('run-20261002-1','quick',NULL,'2026-10-02T17:45:12.000Z','2026-10-02T17:45:12.000Z','0.0.4',1,'completed','Hum and noise','Mixer ground lifted',0.64,'{"channels":2,"deviceId":null,"sampleRate":44100,"score":64.0,"sourceFile":"hum-check.wav","test":"Hum and noise"}','desktop',NULL);
INSERT INTO "session" VALUES('run-20261020-1','quick',NULL,'2026-10-20T19:30:00.000Z','2026-10-20T19:30:40.000Z','0.1.0',1,'completed','Hum and noise','Imported from DeckChek Mobile',0.71,'{"channels":2,"deviceId":null,"sampleRate":48000,"score":71.0,"sourceFile":null,"test":"Hum and noise"}','phone','Example Phone (fixture)');
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
CREATE TABLE signing_key (
  id TEXT PRIMARY KEY,
  public_key_b64 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  retired_at TEXT
);
INSERT INTO "signing_key" VALUES('sk000000-0000-4000-8000-000000000001','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=','2026-10-20T10:00:00.000Z',NULL);
INSERT INTO "signing_key" VALUES('sk000000-0000-4000-8000-000000000002','BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=','2026-09-01T10:00:00.000Z','2026-10-20T09:59:00.000Z');
CREATE TABLE stylus_alert (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  snoozed_until TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO "stylus_alert" VALUES('57000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-00000000000a','life','warning',NULL,'2026-10-12T20:00:00.000Z');
CREATE TABLE stylus_benchmark (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  hours_at REAL NOT NULL CHECK (hours_at >= 0),
  thd_percent REAL,
  separation_db REAL,
  tc_snr_db REAL,
  tc_phase_error_deg REAL,
  tc_dropouts INTEGER CHECK (tc_dropouts IS NULL OR tc_dropouts >= 0),
  setup_id TEXT REFERENCES setup(id),
  valid INTEGER NOT NULL DEFAULT 1 CHECK (valid IN (0, 1)),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
INSERT INTO "stylus_benchmark" VALUES('57000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-00000000000a','run-20260929-1',120.5,0.31,28.4,24.1,3.2,2,'5e000000-0000-4000-8000-000000000001',1,'{}','2026-10-12T20:00:00.000Z');
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
CREATE TABLE test_media (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('builtin','custom')),
  kind TEXT NOT NULL CHECK (kind IN ('test_record','timecode','tone_file')),
  manufacturer TEXT,
  product_id TEXT REFERENCES product(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  profile_json TEXT NOT NULL,
  owned INTEGER NOT NULL DEFAULT 0,
  retired INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO "test_media" VALUES('builtin:serato-cv02.5','builtin','timecode','Serato',NULL,'Serato Control Vinyl 2.5',1,'{"id":"builtin:serato-cv02.5","kind":"timecode","carrierHz":1000}',1,0,'2026-10-10T08:00:03.000Z','2026-10-10T08:00:03.000Z');
INSERT INTO "test_media" VALUES('builtin:traktor-mk2','builtin','timecode','Native Instruments',NULL,'Traktor Scratch Control Vinyl MK2',1,'{"id":"builtin:traktor-mk2","kind":"timecode","carrierHz":2500}',0,0,'2026-10-10T08:00:03.000Z','2026-10-10T08:00:03.000Z');
INSERT INTO "test_media" VALUES('custom:my-test-record','custom','test_record','Generic',NULL,'My 1 kHz test record',1,'{"id":"custom:my-test-record","kind":"test_record"}',1,0,'2026-10-10T08:30:00.000Z','2026-10-10T08:30:00.000Z');
INSERT INTO "test_media" VALUES('builtin:retired-example','builtin','tone_file','Generic',NULL,'Retired tone file',1,'{}',0,1,'2026-10-10T08:00:03.000Z','2026-10-10T08:00:03.000Z');
CREATE TABLE test_media_track (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES test_media(id) ON DELETE CASCADE,
  track_key TEXT NOT NULL,
  side TEXT,
  track_no INTEGER,
  purpose TEXT NOT NULL,
  frequency_hz REAL,
  level_value REAL,
  level_unit TEXT,
  duration_s REAL,
  notes TEXT,
  UNIQUE(media_id, track_key)
);
INSERT INTO "test_media_track" VALUES('trk-1','builtin:serato-cv02.5','side-a-timecode','A',1,'timecode',1000.0,NULL,NULL,60.0,'Timecode band');
INSERT INTO "test_media_track" VALUES('trk-2','custom:my-test-record','side-a-1khz','A',1,'reference tone',1000.0,5.0,'cm/s',30.0,NULL);
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
CREATE TABLE wear_bin (
  scan_id TEXT NOT NULL REFERENCES wear_scan(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  t_sec REAL NOT NULL,
  snr_db REAL,
  phase_err_deg REAL,
  balance_db REAL,
  level_dbfs REAL,
  dropouts INTEGER NOT NULL DEFAULT 0,
  flags INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scan_id, idx)
);
INSERT INTO "wear_bin" VALUES('a3000000-0000-4000-8000-000000000001',0,1.0,24.5,1.2,0.3,-12.0,0,0);
INSERT INTO "wear_bin" VALUES('a3000000-0000-4000-8000-000000000001',1,3.0,23.9,1.4,0.2,-12.5,1,2);
CREATE TABLE wear_scan (
  id TEXT PRIMARY KEY,
  full_side_scan_id TEXT REFERENCES full_side_scan(id) ON DELETE CASCADE,
  record_side_id TEXT NOT NULL REFERENCES record_side(id),
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  stylus_asset_id TEXT REFERENCES asset(id),
  format TEXT NOT NULL,
  bin_sec REAL NOT NULL,
  coverage REAL NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('keep','watch','other_side','replace','incomplete')),
  score REAL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  geometry_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
INSERT INTO "wear_scan" VALUES('a3000000-0000-4000-8000-000000000001','fs000000-0000-4000-8000-000000000001','rs000000-0000-4000-8000-000000000001','run-20260929-1','a1000000-0000-4000-8000-00000000000a','serato_cv02',2.0,0.97,'keep',91.0,'{"binsKept":150}','{}','2026-10-12T20:00:00.000Z');
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
CREATE INDEX idx_test_media_kind ON test_media(kind, name);
CREATE INDEX idx_backup_log_created ON backup_log(created_at);
CREATE INDEX idx_asset_usage_asset ON asset_usage(asset_id, started_at);
CREATE INDEX idx_latency_run_dev ON latency_run(device_name, created_at);
CREATE INDEX idx_buffer_recommendation_dev ON buffer_recommendation(device_name, software, created_at);
CREATE INDEX idx_pregig_run_preset ON pregig_run(preset_id, started_at);
CREATE INDEX idx_pregig_step_run ON pregig_step_result(run_id);
CREATE INDEX idx_stylus_benchmark_asset ON stylus_benchmark(asset_id, hours_at);
CREATE INDEX idx_stylus_alert_asset ON stylus_alert(asset_id, kind);
CREATE INDEX idx_wear_scan_side ON wear_scan(record_side_id, created_at);
CREATE INDEX idx_scratch_run_entities ON scratch_run(cartridge_asset_id, record_side_id, setup_id, created_at);
CREATE INDEX idx_scratch_event_run ON scratch_event(run_id, t_ms);
CREATE INDEX idx_hum_run_venue ON hum_run(venue_id, created_at);
CREATE INDEX idx_hum_run_session ON hum_run(session_id, created_at);
CREATE INDEX idx_hum_step_run ON hum_step(run_id, idx);
CREATE INDEX idx_photo_link_owner ON photo_link(owner_kind, owner_id, sort);
CREATE INDEX idx_certificate_asset ON certificate(asset_id, issued_at);
CREATE INDEX idx_ref_sample_lookup ON reference_sample(product_key, metric_key, method_key, method_version);
CREATE INDEX idx_job_status ON service_job(status, updated_at);
CREATE UNIQUE INDEX ux_job_result_session ON service_job_result(job_id, phase, session_id) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX ux_job_result_dtr ON service_job_result(job_id, phase, device_test_result_id) WHERE device_test_result_id IS NOT NULL;
CREATE INDEX idx_reminder_asset ON maintenance_reminder(asset_id, enabled);
CREATE INDEX idx_asset_position ON asset(deck_position_id);
CREATE INDEX idx_maint_asset_time ON maintenance_event(asset_id, event_at);
CREATE INDEX idx_monitor_event_session ON monitor_event(session_id, t_ms);
CREATE INDEX idx_monitor_session_started ON monitor_session(started_at);
CREATE INDEX idx_mapper_model_asset ON mapper_model(asset_id);
CREATE UNIQUE INDEX idx_ledger_export_revision ON ledger_export(revision);
CREATE INDEX idx_ref_claim_hash ON reference_sample_claim(row_hash);
COMMIT;
