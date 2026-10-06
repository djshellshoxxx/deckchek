# SPEC-15: Inputs, Outputs, and Data Flow

## 1. Purpose

Define the supported classes of information entering DeckChek, the canonical path from raw observation to saved result, and user-visible outputs. This is about application/data I/O as well as captured signals; it does not redefine each diagnostic algorithm.

## 2. Input classes

### 2.1 Live audio

- Input: PCM samples from a selected OS audio-capture endpoint.
- Metadata: selected device and stable ID, backend, sample format/rate, channel count/map, timestamps, route snapshot, gain/input mode declarations, and calibration.
- Requirements: never assume 44.1 kHz; preserve actual format and resampling method; record gaps, clipping, and clock/sample-rate changes.
- Permission: request platform access when needed and explain why before capture.

### 2.2 User-supplied reference audio/media

- May include reference recordings, control media captures, test-record identity, test track/frequency/level metadata, and optional user-provided files.
- Preserve file hash, original filename, source/provenance, import date, and format metadata.
- The user retains ownership of imported files. The app must not upload them by default.
- An unknown reference may support exploratory analysis but cannot support a calibrated claim.

### 2.3 Hardware and setup metadata

- Product models, owned-asset identifiers, serial numbers, setup graph, cable/port labels, settings, firmware/software versions, and notes.
- Distinguish manufacturer-published, official-manual, measured, user-entered, community, and third-party imported values as defined in SPEC-07.
- Sensitive identifiers remain local and are excluded from public/community exports unless the user explicitly selects them.

### 2.4 Controller/MIDI events

- For the standalone free MIDI Tester and licensed Controller capability only: incoming MIDI and supported HID/vendor messages, timestamps, port/device identity, and user-requested outgoing test events where supported by SPEC-11.
- Audio and control-event streams have separate device selection, consent, timestamps, and quality state. One does not prove the other works.

### 2.5 Optional external sensors

- Accelerometer/vibration and SPL measurements are optional future inputs, not assumed in the first implementation.
- Store sensor model, calibration, sampling rate, units, mounting/location, timestamp alignment, and provenance.
- If sensor metadata is insufficient, store the observation as uncalibrated and do not use it for calibrated claims.

## 3. Ingestion and validation

1. User selects or imports a source.
2. DeckChek checks capability, permission, readable format, duration, channels, and basic metadata.
3. The app previews route/media metadata and reports missing or uncertain fields.
4. User confirms the setup and intended test.
5. A session and immutable configuration snapshot are created.
6. Samples/events stream to bounded buffers and, when retention is enabled, to a managed capture file.
7. Analysis consumes timestamped frames and records measurements/evidence independently of raw-file retention.
8. Session finalization writes summary, quality flags, method versions, and report-ready references transactionally.

Malformed or unsupported input must not be partially treated as valid without an explicit warning and a saved quality flag.

## 4. Output classes

### 4.1 Live UI output

- Current input level, clipping/overload state, test progress, detected events, prompts, and actionable warnings.
- Live metrics are provisional until their method's completion/quality gate is met.
- A plotted line or color must have a textual/numeric accessible equivalent.

### 4.2 Persisted local data

- Canonical database: SQLite, versioned migrations (SPEC-07).
- Session, route/capture descriptor, input metadata, calibration references, measurements, evidence, hypotheses, user notes, and method/app versions.
- Raw audio is optional and separately managed. Deleting a raw capture must preserve derived measurements and annotate the session that raw audio is no longer retained.
- Writes use transactions; incomplete sessions remain explicitly incomplete/recoverable.

### 4.3 Reports and exports

- Human report: findings, values/units, validity/quality, route/setup, method and version, evidence, interpretation limits, and recommended next steps.
- Machine exports: stable keys and units; preserve provenance and quality flags. JSON is the canonical machine-readable form; CSV is a flat tabular convenience and must include an accompanying metadata file or equivalent header so context is not lost.
- HTML is the first report target in existing roadmap; PDF remains a later/export target per SPEC-06/09.
- Export never silently omits failed, invalid, unsupported, skipped, or untested states.
- Exports are generated locally and require explicit user action. No telemetry or cloud upload is implied by export.

### 4.4 Optional audio output

- The first implementation does not generate or route audio as a default behavior.
- Any future tone/playback output is a separate capability, off by default, explicitly initiated, with an output device and level confirmation, a visible stop control, and its own output descriptor.
- Output playback is not required for passive capture tests and cannot be inferred from successful device enumeration.

## 5. File and storage lifecycle

- Show destination and estimated size before long capture when possible.
- Stream long captures to disk; do not require the entire side capture in memory.
- If storage becomes low/full, stop safely, close the file, preserve completed measurement data, mark capture truncated/incomplete, and tell the user where recovery data was written.
- Capture deletion and session deletion are separate choices; deleting session metadata must warn if it will orphan associated raw files or exports.
- Backup/restore is explicit, local-first, version-aware, and verified before replacing an existing database.
- Database migration failure must preserve the original database and provide a recovery/export path.

## 6. Data-state guarantees

- Raw input is not modified in place.
- Measurements are immutable for a completed session; recomputation creates a new method-versioned result set.
- User edits to asset/setup metadata do not rewrite historical snapshots.
- Missing, unavailable, unknown, not tested, zero, and failed are distinct values/states.
- Timestamps use UTC internally and display in the user's local timezone.
- Units are stored explicitly and converted only for presentation/export with the original value preserved.
- Imported records retain source and retrieval time; edits preserve original provenance.

## 7. Acceptance criteria

- Every saved measurement can be traced to its input source, route, method/version, calibration, and quality state.
- Removing optional raw audio does not remove or alter completed measurements.
- JSON/CSV/HTML exports preserve test states, provenance, units, and quality flags.
- Malformed, permission-denied, truncated, or interrupted inputs produce explicit states rather than plausible-looking partial success.
- No data leaves the device without a deliberate user action and clear destination disclosure.
- Long captures are bounded-memory and recoverable after ordinary cancellation or storage failure.
