# SPEC-13: Control Vinyl Wear Map

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: `0010_wear_map.sql`. Milestone: M6. Size: L. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

## 1. Summary, Goals, Non-goals

Scans a whole side of a control vinyl with the timecode engine and records per-position SNR, phase error and dropouts. The result is shown as a circular groove heat-map and a linear timeline, compared with earlier scans of the same physical copy, and ends with a "keep / use other side / flip / replace" recommendation.

Goals: locate worn or damaged zones (typically the start and the most-used cue regions); show change over time per copy; reuse the timecode engine and SPEC-03 side-scan plumbing (`full_side_scan`, `scan_alignment`).
Non-goals: not an audio-music vinyl scan (SPEC-03 owns that); does not decode absolute position or verify the vendor position code (SPEC-02 s9 owns that); no stylus diagnosis (FS-12) - the map controls for it by requiring a reference scan or benchmark.

## 2. Users & user stories

- US-1: As a DJ I want to know which stretch of my CV02.5 has gone bad before it fails mid-set.
- US-2: As a DJ I want to see whether this record is deteriorating faster than my others.
- US-3: As a DJ I want a plain verdict: keep, use side B, replace.

- AC-1: Given a control-vinyl record copy and side selected and the correct timecode format, when I play the side from start to end while DeckChek captures, then a scan is saved with one bin per 2 s of capture (default) containing median SNR, max phase error, dropout count and level.
- AC-2: Given the scan, the circular map draws bins as arcs along a spiral from outer edge to run-out; colour = chosen metric (SNR default), with the same data in a linear timeline.
- AC-3: Given a previous scan of the same `record_side`, then a delta view shows per-bin change (SNR drop, new dropouts), with alignment by elapsed time (offset estimated by cross-correlation of the level envelope when speed differs).
- AC-4: Given scan verdict rules (section 6), the recommendation is one of Keep, Watch, Use other side, Replace, with the top three worst bins listed with timestamps.
- AC-5: Given the user paused, lifted the needle or changed speed (detected by carrier shift), then affected bins are flagged `interrupted` and excluded from the verdict.
- AC-6: Scanning can be partial (stop early); the verdict says "Scanned 62 % of the side".
- AC-7: Every bin remains reachable via inspector (raw numbers) and click-to-jump shows a short waveform/scope snippet if raw audio retained.

## 3. UX

Entry: Vinyl Scan screen > "Control vinyl" tab; DVS screen button "Scan full side"; Equipment > Records > copy > "Wear map".
Flow: Setup (choose copy or create: brand/format, side A/B, nominal rpm; input; test the live meter; checklist "Clean the record and stylus first, use the same stylus for all comparisons"); Capture (progress by time and by position; the circular map fills in live; Space start/stop, Esc cancel; long capture autosaves every 30 s); Result (verdict banner, map + timeline, worst-bins table, compare toggle "vs previous scan (date)"); History.
Side duration reference: `dvs_media_side.duration_sec`, populated by FS-06 from the xwax `timecoder.c` code lengths (e.g. Serato 2nd Ed. A 11.9 min / B 15.4 min, Traktor MK2 A 12.3 / B 17.3 min, rekordbox A 10.6 / B 15.3 min — see FS-06 §6 table); user can override; Final Scratch unknown.
States: empty ("No control vinyl registered"), loading, success, partial (stopped early), error (format lock lost for > 20 % of side: "Check format selection and phono/line"), offline n/a, unsupported (no input: scan disabled, saved scans viewable).
Copy: "Use the other side. Side A has 14 dropouts between 18:40 and 21:10 and SNR below 20 dB over 9 % of the side." Shortcuts: Space, Esc, C compare toggle, M switch metric (SNR / phase / dropouts), I inspector. A11y: heat-map has a text/table alternative, sequential colour ramp validated for colour-blind use plus pattern hatching on bad bins, keyboard focus moves bin by bin with arrows announcing "Bin 412, 14:20, SNR 27 dB".

## 4. Architecture

JS:
- `app/wear-map.js` (pure): `scanSide(chunks, {format, binSec}) -> Bin[]` (streaming: `createScanner({format, sampleRate, binSec})` with `push(left,right)` and `finish()`), `positionToRadius(tSec, geom)`, `binsToArcs(bins, geom, metric) -> ArcPath[]`, `alignScans(a,b) -> {offsetSec, confidence}`, `diffScans(a,b) -> BinDelta[]`, `verdict(bins, history, thresholds)`, `QUALITY_COLOR_RAMP`.
- `app/ui/plots-groove.js` (new file, not `plots.js`, to avoid cross-job conflicts): `drawGrooveMap(canvas, arcs, opts)` and `drawTimeline`.
- `app/ui/workflows/wearmap.js`, `app/ui/screens/vinylscan.js` (new — verified 2026-10-10 that no Vinyl Scan screen exists yet; this spec creates it with the Control vinyl tab only).
Reuses `analyzeTimecode` per bin (windowSec 0.1, dropoutDb 12), `findFormat`, `normalizedLevelTrace`, `compareEventMaps` (diagnostics.js), `start_live_capture`/`stop_live_capture` (long capture needs a streaming chunk event).
Rust: uses the FS-00 streaming capture (`start_stream_capture` delivering 1 s stereo blocks over a Tauri `ipc::Channel`, job M6-F1-capture) and keeps only per-bin features in JS (whole-side audio would be 20 min x 48 kHz x 2 x 4 B = 460 MB). New commands: `wearmap_save(scan) -> {id}`, `wearmap_list(recordSideId?) -> ScanSummary[]`, `wearmap_get(id) -> Scan`, `wearmap_delete(id)`. Deps: none.

## 5. Data model

`0010_wear_map.sql`:
```sql
CREATE TABLE IF NOT EXISTS wear_scan (
  id TEXT PRIMARY KEY,
  full_side_scan_id TEXT REFERENCES full_side_scan(id) ON DELETE CASCADE,
  record_side_id TEXT NOT NULL REFERENCES record_side(id),
  session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  stylus_asset_id TEXT REFERENCES asset(id),
  format TEXT NOT NULL, bin_sec REAL NOT NULL, coverage REAL NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('keep','watch','other_side','replace','incomplete')),
  score REAL, summary_json TEXT NOT NULL DEFAULT '{}',
  geometry_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_wear_scan_side ON wear_scan(record_side_id, created_at);
CREATE TABLE IF NOT EXISTS wear_bin (
  scan_id TEXT NOT NULL REFERENCES wear_scan(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, t_sec REAL NOT NULL,
  snr_db REAL, phase_err_deg REAL, balance_db REAL, level_dbfs REAL,
  dropouts INTEGER NOT NULL DEFAULT 0, flags INTEGER NOT NULL DEFAULT 0,  -- bit0 interrupted, bit1 speed-shift, bit2 clip
  PRIMARY KEY (scan_id, idx));
```
A 20 min side at 2 s bins = 600 rows. `geometry_json`: `{"v":1,"outerMm":146,"innerMm":58,"grooveModel":"linear-radius"}`. Raw audio not stored unless user opts in (existing `raw_audio_retained`).

## 6. Algorithms

Per bin (2 s default, tunable 1-5 s): run `analyzeTimecode` on the bin (format resolved with its xwax phase flag so 270-deg formats such as Traktor MK1 / MixVibes are not mis-scored); take median `snrDb`, max |phase error| from 90 deg, dropouts count, level.
Position-radius map: for constant groove pitch, radius is approximately linear in time: r(t) = r_out - (r_out - r_in) * t / T. Geometry defaults for 12 in: outer groove about 146 mm, inner about 58 mm - flagged UNKNOWN for each control vinyl, needs measurement; used only for drawing, not for scoring. Quadrature timecode vinyl is a CAV-like constant-speed spiral at 33 1/3 rpm; the dependence of linear groove speed on radius (slower inside) makes inner bins inherently noisier, so per-radius baselines are used: SNR deficit = (median SNR of first 5 % bins on a fresh/reference side) shifted by a radius slope fitted on the reference scan; without a reference, absolute thresholds from `analyzeTimecode` apply (SNR >= 25 dB ok).
Bin class: good (SNR >= 25, phaseErr <= 10, 0 dropouts); degraded (SNR 15-25 or phaseErr 10-25 or 1 dropout); bad (SNR < 15, or phaseErr > 25, or >= 2 dropouts). Thresholds are tunable defaults, flagged for calibration against observed software lock loss.
Verdict: Keep: bad < 1 % and degraded < 5 %; Watch: bad < 3 % or degraded < 15 %; Use other side: this side's bad >= 3 % and other side scanned with bad < 1 %; Replace: both sides fail or bad >= 10 % or degradation trend: bad-bin share up > 3 points per scan over the last 3 scans. Include stylus control: if the most recent stylus benchmark (FS-12) is red, the verdict is annotated "Stylus may be the cause" and Replace is downgraded to Watch.
Alignment between scans: if both captured from needle drop, offset = 0; else cross-correlate the 1 Hz level envelopes and accept confidence >= 0.6; otherwise compare only by region summary. Same-copy comparison uses `diffScans` flagged "new bad bin" when a bin goes from good to bad.
Uncertainty: SNR per bin has std dependent on window (see `speedPitchUncertainty`/`frequencyEstimatorStdHz`); changes below 3 dB are labelled "within noise".

## 7. Error handling, edge cases, privacy

Needle skip or user scratching during the scan: speed shift or jumps flag `interrupted`; scan may be resumed from the last good bin (creates a segment). Wrong format: no lock -> prompt. Dirty record: offer "re-scan after cleaning" button; scans store `cleaning_state` of the copy. Disk: store features only. Memory: streaming scanner. Imported scans validated (bins <= 5000, numeric ranges). Data local; no raw audio leaves the machine.

## 8. Test plan

Unit: synthetic quadrature at 2.5 kHz with injected dropout windows detected in the correct bins; SNR sweep produces the expected class; radius mapping monotonic; alignment recovers a 7 s offset; diffScans; verdict matrix incl. stylus-red downgrade; partial coverage.
Rust: migration; save/get/list round-trip with 600 bins; delete cascade.
UI smoke: render map from fixture, switch metric, compare toggle, keyboard focus announces bin.
Windows CI: migration, long-capture chunk event doesn't leak memory (soak 5 min in nightly).
Manual: scan a new and a worn Serato CV02.5 side, and a Traktor MK2 side; repeat the scan on the same copy twice to measure repeatability (target: per-bin SNR std < 2 dB); deliberately lift the needle mid-side; compare verdict with playing the side in Serato.

## 9. Definition of done

- [ ] AC-1..AC-7; [ ] 20+ minute scans stable; [ ] fixtures for map rendering; [ ] repeatability measured on owner's records.
Rollout: flag `features.wearMap`. Docs: SPEC-03/SPEC-02 cross-reference, FEATURE-MATRIX.

## 10. Dependencies, risks, open questions, effort

Depends on SPEC-02 (timecode engine), SPEC-03 (full_side_scan, scan_alignment), FS-12 (stylus control), FS-10 (optional pre-gig use), FS-00 (streaming capture, timecode side lengths). Risks: stylus and tonearm variability confounds wear; thresholds unvalidated against real software loss of lock; groove geometry unknown per product. Resolved: side durations (FS-06 table). Open: should the map be built from FS-14 stress data too. Effort: L (about 40 agent-hours).

## 11. Research notes

- Timecode format table and carrier frequencies: repo `app/timecode.js` citing xwax https://github.com/xwax/xwax and Mixxx DVS internals https://mixxx.org/news/2021-12-22-dvs-internals-pt2/ (not re-opened in this research).
- Side lengths: Mixxx `lib/xwax/timecoder.c` `timecode_defs[].length` (cycles) / `.resolution` (cycles/s) — verified 2026-10-10 from local sparse clone (see FS-06 §11).
- Groove radius and geometry: no source opened this session; geometry values UNKNOWN - needs verification by measuring owner's records.
