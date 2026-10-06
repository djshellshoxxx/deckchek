# SPEC-07: Data Model, SQLite Schema, and Local API

## 1. Purpose

This specification defines the canonical DeckChek data model and a local application-service API. SQLite is the source of truth.

The schema is designed so a future cloud/community service can be added without changing core local concepts.

## 2. Design rules

1. Products are not physical assets.
2. Measurements are immutable facts.
3. Diagnoses are derived and can be recomputed.
4. Every external specification can carry provenance.
5. Method versions are preserved.
6. Missing data is NULL/explicit state, never zero.
7. Sessions reference configuration snapshots so later edits do not rewrite history.
8. All public IDs are UUID strings.
9. Human names are not keys.
10. Deletions of user assets should not orphan historic sessions; use soft-delete where needed.

## 3. Entity map

```text
manufacturer
   │
   └── product
         │
         ├── product_spec
         └── asset
               │
               ├── maintenance_event
               └── setup_component
                         │
setup ───────────────────┘
  │
  └── session
       ├── capture
       ├── measurement
       ├── evidence
       ├── hypothesis
       ├── vinyl_event
       └── report

venue
 └── booth
      └── deck_position
           └── support_configuration
```

## 4. Enumerations

Store as TEXT with application validation initially.

### ProductCategory
- TURNTABLE
- CARTRIDGE
- STYLUS
- HEADSHELL
- MIXER
- PHONO_PREAMP
- AUDIO_INTERFACE
- DVS_INTERFACE
- MOTOR_CONTROLLER
- ISOLATION_PLATFORM
- SUPPORT_SURFACE
- TEST_RECORD
- DVS_MEDIA
- OTHER

### ProvenanceType
- MANUFACTURER_PUBLISHED
- OFFICIAL_MANUAL
- DECKCHEK_MEASURED
- USER_ENTERED
- COMMUNITY_AGGREGATE
- IMPORTED_THIRD_PARTY

### MeasurementState
- MEASURED
- NOT_TESTED
- NOT_SUPPORTED
- INVALID
- INCONCLUSIVE

### SessionType
- QUICK_CHECK
- STANDARD_DIAGNOSTIC
- FULL_SIDE_SCAN
- DVS_SCAN
- SCRATCH_STRESS
- PITCH_MAP
- A_B_COMPARE
- VENUE_TEST
- MAINTENANCE_BASELINE
- CUSTOM

## 5. Manufacturer

Fields:
- id;
- name;
- website;
- notes;
- created_at;
- updated_at.

Unique case-insensitive normalized name.

## 6. Product

Fields:
- id;
- manufacturer_id;
- category;
- model;
- variant;
- revision;
- release_year;
- discontinued_year;
- region;
- description;
- source_url;
- created_at;
- updated_at.

Unique key is not simply manufacturer+model because revisions can differ.

## 7. Product specification

Generic typed specification table.

Fields:
- id;
- product_id;
- key;
- numeric_value;
- text_value;
- boolean_value;
- unit;
- frequency_hz;
- method;
- provenance_type;
- source_title;
- source_url;
- retrieved_at;
- valid_from;
- valid_to;
- notes.

Exactly one value column should normally be populated.

Examples:
- turntable.wow_flutter = 0.025 percent WRMS
- cartridge.channel_separation = 22 dB @ 1kHz
- interface.max_sample_rate = 192000 Hz

## 8. Asset

Fields:
- id;
- product_id;
- nickname;
- serial_number optional;
- purchase_date;
- installed_date;
- retired_date;
- firmware;
- condition;
- notes;
- is_deleted;
- created_at;
- updated_at.

Serial number remains local by default.

## 9. Asset settings snapshot

A settings record is immutable.

Fields:
- id;
- asset_id;
- captured_at;
- tracking_force_g;
- anti_skate;
- arm_height;
- pitch_range;
- brake_setting;
- torque_setting;
- cartridge_alignment;
- input_gain;
- firmware;
- custom_json.

Sessions link to settings snapshot.

## 10. Maintenance event

Fields:
- id;
- asset_id;
- event_type;
- event_at;
- description;
- service_provider optional;
- hours_estimate;
- created_at.

Types include:
- INSTALLED
- CLEANED
- ALIGNED
- TRACKING_FORCE_CHANGED
- ANTI_SKATE_CHANGED
- STYLUS_REPLACED
- RCA_REPLACED
- PITCH_SERVICED
- MOTOR_SERVICED
- BEARING_SERVICED
- FIRMWARE_CHANGED
- IMPACT_INCIDENT
- RETIRED
- OTHER

## 11. Venue

Fields:
- id;
- name;
- venue_type;
- city;
- region;
- country;
- notes;
- created_at;
- updated_at.

Coordinates intentionally absent from core schema.

## 12. Booth

Fields:
- id;
- venue_id;
- name;
- indoor_outdoor;
- floor_type;
- stage_type;
- notes.

## 13. Deck position

Fields:
- id;
- booth_id;
- name;
- orientation;
- distance_to_monitor_m;
- distance_to_sub_m;
- height_m;
- notes.

## 14. Support configuration

Fields:
- id;
- deck_position_id optional;
- name;
- description;
- structure_json;
- approximate_mass_kg;
- coupled_state;
- notes.

structure_json example:

```json
[
  {"layer":"turntable_feet","material":"rubber"},
  {"layer":"isolation_pad","product_id":"..."},
  {"layer":"slab","material":"concrete","mass_kg":18},
  {"layer":"booth","material":"wood"}
]
```

## 15. Setup

A named reusable chain.

Fields:
- id;
- name;
- profile;
- venue_id optional;
- booth_id optional;
- deck_position_id optional;
- support_configuration_id optional;
- notes;
- created_at.

## 16. Setup component

Fields:
- id;
- setup_id;
- role;
- asset_id;
- position;
- settings_snapshot_id optional.

Roles:
- TURNTABLE_A
- TURNTABLE_B
- CARTRIDGE_A
- CARTRIDGE_B
- STYLUS_A
- STYLUS_B
- MIXER
- PHONO_PREAMP
- AUDIO_INTERFACE
- DVS_MEDIA_A
- DVS_MEDIA_B
- SUPPORT
- OTHER

## 17. Session

Fields:
- id;
- session_type;
- setup_id optional;
- started_at;
- ended_at;
- app_version;
- schema_version;
- status;
- context_profile;
- operator_notes;
- session_quality;
- config_snapshot_json.

Session config snapshot is always stored even if setup_id exists.

## 18. Capture

Fields:
- id;
- session_id;
- device_name;
- device_identifier;
- backend;
- sample_rate_hz;
- sample_format;
- bit_depth;
- channel_count;
- channel_map_json;
- started_at;
- duration_samples;
- dropped_buffers;
- discontinuities;
- clipped_samples_left;
- clipped_samples_right;
- raw_audio_path optional;
- raw_audio_sha256 optional;
- raw_audio_retained;
- quality_flags_json.

## 19. Analysis method

Fields:
- id;
- key;
- version;
- description;
- parameters_json;
- standard_reference;
- created_at.

Unique:
(key, version)

Examples:
- speed.phase_estimator, 1
- wow_flutter.iec60386_weighted_peak, 1
- click.ar_residual, 1
- dvs.scope_ellipse, 1

## 20. Measurement

Fields:
- id;
- session_id;
- capture_id optional;
- method_id;
- metric_key;
- state;
- numeric_value;
- text_value;
- unit;
- channel_scope;
- start_sample optional;
- end_sample optional;
- confidence;
- uncertainty;
- reference_low;
- reference_high;
- quality_flags_json;
- created_at.

Indexes:
- session_id;
- metric_key;
- method_id;
- (metric_key, method_id, numeric_value).

## 21. Evidence

Fields:
- id;
- session_id;
- evidence_type;
- severity;
- start_sample;
- end_sample;
- confidence;
- summary;
- features_json;
- created_at.

Evidence-to-measurement join:
- evidence_measurement(evidence_id, measurement_id)

## 22. Hypothesis

Fields:
- id;
- session_id;
- hypothesis_key;
- status;
- confidence;
- severity;
- summary;
- reasoning_version;
- alternatives_json;
- isolation_tests_json;
- created_at;
- updated_at.

Join tables:
- hypothesis_support(evidence_id, hypothesis_id, weight)
- hypothesis_contradiction(evidence_id, hypothesis_id, weight)

## 23. Record/release

For ordinary vinyl:

Fields:
- id;
- artist;
- title;
- label;
- catalog_number;
- release_year;
- pressing_notes;
- external_reference_type;
- external_reference_id;
- notes.

## 24. Record copy

A physical copy:
- id;
- record_id;
- nickname;
- acquired_date;
- user_grade;
- cleaning_state;
- notes;
- retired;

## 25. Record side

Fields:
- id;
- record_copy_id;
- side_label;
- nominal_rpm;
- expected_duration_sec optional;
- notes.

## 26. Full-side scan

Fields:
- id;
- session_id;
- record_side_id;
- start_sample;
- end_sample;
- normalized_start;
- normalized_end;
- scan_version;
- condition_score;
- live_readiness;
- raw_audio_retained.

## 27. Vinyl event

Fields:
- id;
- scan_id;
- event_type;
- start_sample;
- end_sample;
- normalized_position;
- estimated_track;
- severity;
- confidence;
- persistence_status;
- channel_scope;
- recurrence_period_sec;
- recurrence_count;
- features_json;
- user_label;
- notes.

Event types:
- CLICK
- POP
- CRACKLE_CLUSTER
- REPEATING_SCRATCH
- PROBABLE_SURFACE_DEFECT
- SKIP_FORWARD
- SKIP_BACK
- LOCKED_GROOVE
- WARP
- OFF_CENTER_INDICATOR
- MISTRACK
- SIBILANCE
- NON_FILL_LIKE
- STATIC_LIKE
- HUM_EVENT
- SHOCK_EVENT
- FEEDBACK_EVENT
- OTHER

## 28. Scan alignment

For repeat scans:
- id;
- scan_a_id;
- scan_b_id;
- alignment_method;
- offset_samples;
- drift_model_json;
- confidence.

## 29. DVS media instance

Can be represented as Product + Asset, but DVS-specific fields live in:
- dvs_media_profile
- dvs_media_side

DvsMediaProfile:
- product_id;
- family;
- version;
- medium_type;
- analyzer_key;
- documentation_url;
- notes.

DvsMediaSide:
- id;
- profile_id;
- side_label;
- nominal_rpm;
- duration_sec;
- public_code;
- absolute_position_supported;
- relative_supported.

## 30. Venue measurement

Generic measurements remain in Measurement.

Venue-specific contextual values:
- venue_level_step;
- entered_spl_dba;
- entered_spl_dbc;
- spl_meter_product_id;
- monitor_state;
- sub_state;
- crowd_state;
- notes.

## 31. Comparison query contract

Internal service method:

```ts
compareMeasurements({
  metricKey,
  methodKey,
  methodVersion?,
  productIds?,
  assetIds?,
  venueIds?,
  contextProfile?,
  requireComparable: true
})
```

Response:
- cohorts;
- count;
- mean;
- median;
- stddev;
- min/max;
- p10/p90;
- provenance summary;
- invalid/excluded count.

## 32. Local service API

The Tauri frontend should not issue arbitrary SQL.

Stable service interfaces:

```text
CatalogService
  listProducts
  getProduct
  compareProducts
  createUserProduct

AssetService
  createAsset
  updateAsset
  addMaintenanceEvent
  getAssetHistory

SetupService
  createSetup
  cloneSetup
  resolveSetupSnapshot

SessionService
  startSession
  finalizeSession
  getSession
  listSessions

MeasurementService
  appendMeasurements
  queryMeasurements
  compareMeasurements

VinylService
  createRecordCopy
  createSideScan
  appendEvents
  alignScans

VenueService
  createVenue
  createBooth
  createSupportConfig
  compareVenueTests

ReportService
  buildReport
  exportReport
```

## 33. Error contract

All frontend-callable commands return structured errors:

```json
{
  "code": "INVALID_SESSION_STATE",
  "message": "Session is already finalized",
  "details": {}
}
```

Stable codes; messages may evolve.

## 34. Transaction boundaries

Atomic operations:
- finalize session;
- import catalog;
- add scan + events;
- replace diagnostic rule set;
- migration.

Streaming measurements may be inserted in batches.

## 35. Indexing

Required indexes:
- product(manufacturer_id, model);
- asset(product_id);
- session(started_at);
- measurement(metric_key, method_id);
- measurement(session_id);
- evidence(session_id, evidence_type);
- vinyl_event(scan_id, normalized_position);
- venue(name);
- setup(name).

## 36. Schema migration

Use sequential migrations:

```text
0001_initial.sql
0002_add_...
```

Table:
schema_migration(version, applied_at, app_version)

Never edit an already released migration.

## 37. Import validation

Catalog import:
- schema version;
- UUID validation;
- enums;
- unit strings;
- provenance;
- duplicate natural keys;
- URL format.

Third-party data is untrusted and validated before storage.

## 38. Acceptance criteria

- schema creates successfully in empty SQLite;
- seed imports without FK errors;
- product and asset histories remain distinct;
- measurement can point to exact method version;
- full-side event survives raw-audio deletion;
- comparisons can reject mismatched methods;
- venue hierarchy joins correctly;
- a session snapshot remains unchanged if product catalog later changes.
