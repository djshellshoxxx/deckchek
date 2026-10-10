# SPEC-12: Stylus Wear Tracker

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: `0009_stylus_wear.sql` (+ shared `0006_asset_usage.sql`, FS-00). Milestone: M6. Size: M. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

## 1. Summary, Goals, Non-goals

Tracks each cartridge/stylus as an `asset` (SPEC-01/07): accumulated play hours from manual entry, DVS session time and DeckChek captures; runs a periodic benchmark (THD on a 1 kHz track, channel separation, timecode SNR and phase) and fits trend lines; compares hours and trend against the manufacturer-rated life and raises replacement alerts.

Goals: one wear page per stylus; hour ledger with provenance; benchmark trend with regression and a projected replace date; alerts at configurable thresholds.
Non-goals: no microscopic stylus inspection (optional photo note only); no claim that hours alone determine wear; no automatic purchasing; DJ-software session detection is best-effort.

## 2. Users & user stories

- US-1: As a DJ I want to know how many hours my Concorde has done.
- US-2: As a DJ I want a warning before the stylus damages my control vinyl.
- US-3: As a technician I want measured degradation, not just hours.

- AC-1: Given a stylus asset, when I add 2.5 hours manually, then the ledger shows an entry (source `manual`) and total hours rises by 2.5.
- AC-2: Given a DVS capture session of 40 min with that stylus selected in the setup, then 0.67 h is proposed as `deckchek` and I confirm or edit before it counts.
- AC-3: Given DJ logs exist with detectable session start/end, then proposed `djlog` entries are offered per session (best-effort; user confirms); overlapping entries from different sources on the same interval are not double counted (priority manual > djlog > deckchek).
- AC-4: Given 3 or more benchmark results, then a regression line per metric with slope per 100 h and R-squared is drawn; fewer than 3 shows "Need 3 benchmarks for a trend".
- AC-5: Given total hours >= 80 % of the rated life, then an amber alert; >= 100 % red alert "Replace or inspect".
- AC-6: Given a benchmark metric crosses its degradation threshold (section 6), alert regardless of hours.
- AC-7: Installing a new stylus (maintenance_event `stylus_replaced`) resets the ledger baseline but keeps history.
- AC-8: Alerts can be snoozed 30 days; snooze recorded.

## 3. UX

Entry: Equipment > cartridge asset > "Wear" tab; Quick Check card "Stylus health"; alert badge on the rail.
Screens: (1) Wear overview: ring gauge (hours of rated life) with number and unit, status chip, projected replace date, last benchmark. (2) Hours ledger: table (date, hours, source, note), Add hours (Enter), Import proposed (from sessions/logs). (3) Benchmark: guided capture of the SPEC-01 test tracks (1 kHz tone track for THD and separation) and a control-vinyl segment for timecode SNR/phase; shows progress. (4) Trends: small multiples with data points, regression line, threshold band; click a point to open its run. (5) Settings: rated life, alert thresholds.
States: empty ("Add your cartridge to start tracking"), loading, success, partial (no rated life: "Rated life unknown - using generic 500 h DJ estimate"), error (benchmark capture failed), offline n/a, unsupported (no timecode benchmark without DVS interface - metric hidden).
Copy: "Concorde Pro S: about 410 of 600 h (68 %). Replace around 2027-03 at current use." Amber: "Separation has dropped 4 dB since install. Inspect the stylus." Shortcuts: A add hours, B start benchmark, I inspector, Esc cancel. A11y: gauge also as text and table; trend charts have data table toggle; colour never alone.

## 4. Architecture

JS: `app/stylus-wear.js` (pure; `totalHours`, `mergeIntervals`, `proposeFromSessions` are imported from FS-00 `app/usage-hours.js`): `proposeFromLogs(djLogScan, assetId)`, `regress(points) -> {slope, intercept, r2, n, p?}` (wraps `trendMetrics` in diagnostics.js), `lifeStatus(hours, ratedHours, thresholds)`, `benchmarkVerdict(history)`, `projectReplaceDate(ledger, rated)`. `app/ui/screens/stylus.js`. Rated-life catalogue `app/devices/stylus-life.json`.
Benchmark reuses: `thdPercent`, `channelSeparationDb`, `analyzeTimecode`, `repeatabilityMetrics` and applies `applyCalibration` (calibration.js).
Rust: hours use the shared FS-00 `asset_usage` ledger and its commands `usage_add(entry) -> {id}`, `usage_list(assetId, {since?}) -> Entry[]`, `usage_delete(id)` (the former `stylus_ledger_*` names are dropped); `proposeFromSessions`/`mergeIntervals`/`totalHours` live in the shared `app/usage-hours.js` (FS-00 §4.8) because FS-23 uses the same hours. Stylus-specific commands: `stylus_benchmark_save(result) -> {id}`, `stylus_benchmark_list(assetId)`, `stylus_alert_snooze(assetId, kind, until)`. Optional `dj_session_spans() -> [{app, start, end, source:"log"|"process"}]` in a new `src-tauri/src/dj_sessions.rs` (not `system_check.rs`, to avoid file conflicts) reusing the DJ log locations from `system_check.rs` read-only. Deps: none.

## 5. Data model

Hours ledger: `asset_usage` from `0006_asset_usage.sql` (FS-00 §5.3; same columns the former `stylus_hours` draft had, plus `kind`). `0009_stylus_wear.sql`:
```sql
CREATE TABLE IF NOT EXISTS stylus_benchmark (
  id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES asset(id),
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  hours_at REAL NOT NULL, thd_percent REAL, separation_db REAL,
  tc_snr_db REAL, tc_phase_error_deg REAL, tc_dropouts INTEGER,
  setup_id TEXT REFERENCES setup(id), valid INTEGER NOT NULL DEFAULT 1,
  detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stylus_alert (
  id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES asset(id),
  kind TEXT NOT NULL, severity TEXT NOT NULL, snoozed_until TEXT, created_at TEXT NOT NULL);
ALTER TABLE asset ADD COLUMN rated_life_hours REAL;
```
(`stylus_installed_hours` dropped: the baseline is the latest `maintenance_event` with `event_type='stylus_replaced'`; hours count ledger rows with `started_at` after it.)
`stylus-life.json` v1: `[{"model":"Ortofon Concorde","ratedHours":600,"range":[500,1000],"source":"url","confidence":"vendor-general|forum|unknown"}]`. Version field + migrate function.

## 6. Algorithms

Hours: sum of confirmed entries since last `stylus_replaced`; merge overlapping intervals per priority (AC-3). DVS session time = session `ended_at - started_at` for sessions whose setup references the asset; capped 12 h; idle gaps are unknown, so provenance is displayed and users can edit.
Benchmark conditions: same record, side, tracking force, VTA, temperature-ish, same interface and calibration profile (`isProfileApplicable`); mismatch marks `valid=0` and excludes it from regression. Metrics: THD% of 1 kHz via `thdPercent` (5 harmonics) with uncertainty `thdUncertaintyPercent`; separation via `channelSeparationDb` using SPEC-01 L-only/R-only tracks; timecode SNR and phase error via `analyzeTimecode` (tc_snr_db, tc_phase_error_deg).
Regression: ordinary least squares of metric on `hours_at`; report slope per 100 h, R-squared, n and 95 % slope CI (t distribution). Degradation alerts (tunable defaults, no authoritative source): THD rises > 1 percentage point over baseline (median of first 2 benchmarks) or > 2x; separation falls > 3 dB; SNR falls > 6 dB; phase error rises > 8 deg; dropouts > 0 on a previously clean side. Require 2 consecutive benchmarks or slope p < 0.1 to avoid single-noise alerts. Projection: hours at which fitted line meets threshold, divided by trailing 30-day usage rate.
Rated life: `ratedHours = asset.rated_life_hours ?? catalogue ?? 500`. Research ranges: Ortofon general up to ~1000 h with proper care, no degradation before about 1000 h (Ortofon newsletter via forum, snippet only), ~500 h realistic for DJ/back-cueing use (forum, snippet only); Jico replacement for Shure M44-7 (N44-7 compatible) quoted ~200 h (retailer, vendor claim not Shure spec); Nagaoka cites 150-200 h for elliptical styli (retailer snippet); Stanton ~500 h inspect, up to 1000 h (forum, unverified). Shure official M44-7 rating: UNKNOWN - needs verification. Default alerts: amber at 80 %, red at 100 %.

## 7. Error handling, edge cases, privacy

Negative/absurd hours rejected (0-24 per entry). Clock changes: entries sorted by `started_at` but totals do not depend on order. Swapping a stylus without logging: alert "Benchmark jumped upward - did you replace the stylus?" offering to mark replacement. Deleting an asset keeps ledger (soft delete). Log scanning reads only timestamps, never content, exports only aggregated hours. All local; JSON import validated against schema and size.

## 8. Test plan

Unit: overlap merge; priority; reset at replacement; regression on synthetic known slope (exact slope recovered, noise CI); n<3; invalid benchmark excluded; lifeStatus thresholds 79.9/80/100 %; projection with zero usage; catalogue fallback to 500; benchmark verdict needs two consecutive.
Rust: ledger CRUD, constraints (hours bounds), migration applies idempotently.
UI smoke: add hours, gauge updates, alert snooze.
Windows CI: migration.
Manual: SL-1200MK4 with owner's cartridge: log hours, run three benchmarks 1 week apart, confirm repeatability std < 0.5 dB separation; deliberately raise tracking force offset to confirm benchmarks flag nothing absurd; use Serato CV02.5 and Traktor MK2 segments for SNR.

## 9. Definition of done

- [ ] AC-1..AC-8; [ ] ledger and benchmark persisted; [ ] alerts shown on rail; [ ] catalogue entries labelled with source confidence.
Rollout: flag `features.stylusWear`. Docs: SPEC-01 cross-reference, FEATURE-MATRIX.

## 10. Dependencies, risks, open questions, effort

Depends on SPEC-01 (test tracks, cartridge assets), SPEC-07 data model, calibration profiles, FS-14/FS-13 (optional extra signals), FS-00 (`asset_usage` ledger). Risks: benchmark variance (cleaning, temperature, VTA) larger than real wear; log-based hours unreliable. Open: do DJ programs write parseable session logs? UNKNOWN. Real rated hours per model. Effort: M (about 28 agent-hours).

## 11. Research notes

- Ortofon 600-1000 h claim: https://www.whatsbestforum.com/goto/post?id=86230 and https://www.whatsbestforum.com/goto/post?id=95156 (snippet only).
- Ortofon DJ ~500 h realistic: https://www.stereonet.com/forums/topic/91694-cartridge-lifespan/ (snippet only).
- Jico M44-7 stylus ~200 h: https://plugseven.com/product/jico-j44a-7-dj-replacement-stylus-synthetic-diamond-sd-tip-shure-n-447-single/ (vendor claim, snippet only).
- Stylus life skepticism and wear studies: https://www.stereonet.com/forums/topic/559264-stylus-wear-studies/ ; https://production.diyaudio.com/community/threads/stylus-life-200-playing-hours-really.411970/ (snippet only).

### 11.1 Implementation notes (job M6-datafixes)

- **Real session spans.** `save_diagnostic_run` (`db.rs` `persist_run`) now takes optional `startedAt`, `endedAt`, `durationSec`, `captureKind` (`live` | `file`), `assetId` and `setupId`. With none of them the row is written exactly as before (`started_at = ended_at = createdAt`, unchanged config snapshot), so older payloads and rows are unaffected. With timing: `endedAt` defaults to `createdAt`, `startedAt` to `endedAt - durationSec`; timestamps must be UTC ISO, start <= end, span <= 24 h, an unknown `setupId` is rejected. `durationSec`, `captureKind` and `assetId` go into `config_snapshot_json`. No migration.
- **`list_capture_sessions(since?, assetId?, limit?)`** (`commands.rs`, registered in the FS-12 handler anchor) returns `[{id, sessionType, test, startedAt, endedAt, durationSec, kind, assetId, setupId}]`, oldest first, only sessions with `ended_at > started_at` (legacy zero-length rows never appear). `assetId` matches the run's asset (`assetId`, else `deviceId`) or any `setup_component` of its setup. Contract: `tests/contracts/capture-sessions.json`. Browser twin: `catalog-store.js` `captureSessionsLocal` / `store.listCaptureSessions`.
- **AC-2 wiring.** `stylus-wear.js` `proposeFromCaptureSessions(rows, assetId, {existing})` keeps `live` captures only (a `file` run is an analysed recording, not play time now) and feeds the shared `proposeFromSessions`; `createStylusApi().captureProposals(assetId, {since, existing})` calls the command and returns unconfirmed `deckchek` proposals. A 40-minute live DVS capture proposes 0.6667 h (tested in Rust and JS).
- **Where spans come from.** `ui/analysis.js` `buildRun` now stamps `run.capture = captureTiming(...)` (`{kind, startedAt, endedAt, durationSec, approximate}`) and `persistCaptureFields(run)` returns the payload fields. Without an explicit `capture` argument a run with capture-quality counters or a "Live capture" source is `live`, ending at `createdAt` and lasting the audio length (`approximate: true`).
- **Timecode benchmark auto-fill.** DVS signal runs now carry the `analyzeTimecode` metrics as ordinary measurements (`tc_carrier_hz`, `tc_speed_error_percent`, `tc_phase_deg`, `tc_phase_error_deg`, `tc_balance_db`, `tc_snr_db`, `tc_dropouts`, plus `tc_direction_code`) and `TC_*` findings. The format comes from `params.timecodeFormat` / `params.formatName`, otherwise it is inferred from the carrier (`detectTimecodeFormat`, confidence 0.7, `evidence.timecode.inferred`). `stylus-wear.js` `timecodeBenchmarkFromRuns(runs)` returns `{tcSnrDb, tcPhaseErrorDeg, tcDropouts, tcRun}` from the newest run that has them.
- **Follow-ups outside this job's files:** `ui/persistence.js` `toPersistRun` must spread `...persistCaptureFields(run)` into its payload (until then saved runs keep the legacy zero-length span and propose nothing); `ui/workflows/flow.js` should pass `capture: {kind, startedAt, endedAt}` stamped at capture start/stop (the Analyze click can come minutes later); `ui/screens/stylus.js` should call `api.captureProposals` next to `proposeFromLogs` in "Find sessions" and merge `timecodeBenchmarkFromRuns` into its run fill.

