# Spec 21: Unit vs Population Comparison

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: `0015_unit_population.sql`. Milestone: M7. Size: M. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

## 1. Summary and Goals / Non-goals

"Your unit vs others of the same model" in three phases. Phase 1 (implement now, fully offline) compares a measurement against the published spec and against the user's own other units and history. Phase 2 (implement now, opt-in) adds anonymous `.deckchek-pack` JSON files that can be exported, shared by hand, and merged into a local reference population with percentile display. Phase 3 (spec only, not implemented) outlines an optional shared server.

Goals: context for every number ("-62 dBFS is better than 80% of known DJM-A9 units"), robust to small and dirty samples, no PII ever. Non-goals: ranking users, any network traffic in phases 1-2, judging pass/fail from percentile (spec limits stay authoritative), merging results from incompatible methods.

## 2. Users & user stories

Owner of multiple units; shop tech; community member sharing packs.

AC-1 Given a metric with a published spec in the device profile, when viewing it, then a bar shows value, spec limit, and margin, with no population needed.
AC-2 Given the user has >= 2 assets of the same product, when viewing a metric, then sibling units' latest values are listed and the unit's rank among them shown.
AC-3 Given history for the same asset, then a sparkline and "vs your median of N runs" delta appear.
AC-4 Given the user exports a pack, then the file contains only product id, metric id, value, unit, method key/version, and DeckChek pack version, verified by a schema whitelist test.
AC-5 Given an imported pack, then a preview shows counts per product/metric and rejects unknown fields before merging.
AC-6 Given fewer than N_min samples (default 20 distinct contributions), then no percentile is shown; text reads "Not enough data (7 of 20)".
AC-7 Given reference values from method version 1 and the user's from version 2, then they are not compared unless the method's `compat` set lists both.
AC-8 Given importing the same pack twice, then no duplicates (idempotent by pack id and per-row hash).
AC-9 Given the user removes a pack, then its rows are deleted and percentiles recompute.

## 3. UX

Entry points: result row "Compare" chip; device detail > "How does my unit rank?"; Settings > Data sharing (pack export/import).
Flow: Compare drawer with three tabs: "Spec", "My units", "Population". Population tab shows a horizontal strip plot with P10/P50/P90 band, the user's marker, sample size, number of distinct contributors, and method version used. Export: "Share results anonymously" > choose products/metrics (default: all, all unchecked for first-time) > preview JSON > save `.deckchek-pack`. Import: pick files, preview, confirm.
States: empty (no reference data: "Import a pack to see how your unit compares"), loading (merge progress), success, partial (some rows skipped: lists reasons), error ("This is not a DeckChek pack"/"Pack version 3 needs a newer DeckChek"), offline (default; nothing needs the network), unsupported (metric lacks `higherIsBetter` direction: percentile hidden, distribution still shown).
Copy: "Packs contain only model, metric values and method versions. No serial numbers, names, dates or locations." Phase 2 export is always manual and previewed.
Shortcuts: C opens Compare on a focused result row. Accessibility: strip plot has a text equivalent ("Your value 52.1 dB is at the 73rd percentile of 41 units"); marker shape plus label, not colour only.

## 4. Architecture

New: `app/population.js` (pure stats), `app/pack.js` (build/validate/merge), `app/ui/screens/compare.js`, `src-tauri/src/pack.rs`.
JS APIs:
- `robustSummary(values) -> {n, median, mad, p10, p25, p75, p90, iqr}`
- `percentileRank(values, x, {higherIsBetter}) -> {rank0to100, lo, hi}` (mid-rank for ties)
- `winsorize(values, k=3.5) -> number[]` (modified z-score based)
- `methodCompatible(a:{key,version}, b:{key,version}, methodRegistry) -> boolean` — implemented in the shared FS-00 `app/metric-compat.js` (also used by FS-22), re-exported here
- `buildPack({rows, appVersion, packId}) -> pack`, `validatePack(json) -> {ok, errors, normalizedRows}`
- `compareToSpec(measurement, profileSpec)`, `compareToSiblings(assetId, metricId)`.
Rust commands: `pack_export({selection, path}) -> {rows, bytes, sha256}` (writes after whitelist re-validation in Rust, source of truth); `pack_import({path}) -> {packId, accepted, rejected:[{row,reason}]}`; `population_query({productId, metricId, methodKey}) -> {rows:[{value,methodVersion}], contributors}`; `pack_remove({packId})`.
Deps: none new (serde_json already used). Limit pack to 5 MB, 100k rows.

## 5. Data model

```sql
-- 0015_unit_population.sql
CREATE TABLE IF NOT EXISTS reference_pack (
  id TEXT PRIMARY KEY,              -- pack uuid from file
  source_label TEXT,                -- user-entered, local only
  imported_at TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  sha256 TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reference_sample (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES reference_pack(id) ON DELETE CASCADE,
  contributor TEXT NOT NULL,        -- random per-export contributor token, not an identity
  product_key TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  method_key TEXT NOT NULL,
  method_version INTEGER NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  row_hash TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_ref_sample_lookup ON reference_sample(product_key, metric_key, method_key, method_version);
```
Pack file v1: `{format:"deckchek-pack", version:1, packId, createdMonth:"2026-10", appVersion, contributor, rows:[{product, metric, method:{key,version}, value, unit}]}`. `createdMonth` only (no day) to limit fingerprinting. Product keys are catalog ids (e.g. `pioneer-plx-crss12`). Method registry gains `compat: [versions]` (additive field in `analysis_method.parameters_json`). Version changes: readers accept same major, ignore unknown row fields only in preview mode, never import them.

## 6. Algorithms

Use own data per asset: latest passing-quality measurement per (asset, metric) to avoid one unit dominating; one value per contributor per (product, metric, method version) is used (the median of that contributor's units) so a shop uploading 200 units counts as one voice for percentile purposes while contributing to a secondary "units" count (tunable policy).
Minimum sample: n_min = 20 contributors for percentile, 8 for showing a median only, below 8 only raw dots (tunable defaults; rule-of-thumb, flagged). Percentiles: Hyndman-Fan type 7 (linear interpolation, the R/NumPy default) for P10/50/90; user's rank by mid-rank. Outliers: values beyond median +/- 3.5 scaled MAD (modified z, Iglewicz-Hoaglin) are excluded from the summary band but still plotted as hollow dots. Confidence for the rank: bootstrap 1000 resamples (seeded by pack hash for determinism) give a 90% interval; display "about 70th percentile (60-80)" when n < 100.
Compatibility: a sample is eligible iff metric key equal, unit equal, method key equal, and versions equal or mutually listed in `compat`. Otherwise excluded and counted as "N rows from other method versions". Unit mismatch never converts silently.
Selection bias caveat is displayed: contributors are self-selected and may be healthier or sicker than average.

## 7. Error handling, privacy, security

Pack builder uses a whitelist serialiser (not a blacklist); a test asserts no serial, asset id, session id, path, hostname, venue, nickname, or free text appears, and that `contributor` is regenerated on request ("Reset my contributor token"). Values are rounded to the metric's significant precision (3 sig. figs) to reduce fingerprinting. Import: reject files > 5 MB, depth > 8, NaN/Infinity, values outside plausible range for the metric (from profile `plausible` or reject-if-unknown), duplicate rows; strings limited to 64 chars and charset `[a-z0-9._:-]`. A malicious pack can poison percentiles; mitigation is per-pack removal, per-pack visibility, and contributor weighting. No code from packs is ever evaluated. All offline.

## 8. Test plan

Unit: percentile type 7 vectors against known NumPy outputs, ties, n=1, MAD=0 degenerate case (fall back to IQR), higherIsBetter inversion, compatibility matrix, whitelist builder, idempotent import, poison-pack rejection, rounding. Rust: import/export roundtrip, row_hash uniqueness, 100k-row performance < 2 s. UI smoke: import fixture pack, see percentile; with 5 samples see "Not enough data". Windows CI: file dialogs with unicode paths. Manual: export from the owner's units (DJM-A9, Xone:23C, Rane Twelve MK2), import on a second machine, check the JSON by eye for PII.

## 9. Definition of done

Phase 1 and 2 ACs pass; schema whitelist test; flags `features.population` default on for phase 1, `features.packs` default off until manual review; docs: README, SPEC-04 (comparison database) cross-reference noting that SPEC-04's reference database is superseded for community data by this pack format (flag for owner).

## 10. Dependencies, risks, open questions, effort

Depends on: stable metric ids and method registry (SPEC-07), device profiles with spec limits, spec 20 only for the display style. Risks: small populations mislead; re-identification of rare models; method drift. Open: who curates an official seed pack (UNKNOWN); licence for shared packs (suggest CC0); whether to include the DeckChek major version in the compat check.
Effort: M (~18 agent-hours) for phases 1-2.

### Phase 3 outline (spec only, do not implement)

Optional server `POST /v1/packs` (accepts a validated pack, returns receipt), `GET /v1/reference/{product}/{metric}?method=key@ver` (returns precomputed quantile sketch, never raw rows). Privacy: no accounts, no IP storage beyond rate-limit counters with 24 h TTL, client sends packs through a user-initiated action only, TLS only, CSP `connect-src` allowlist added only when the flag is on, documented in privacy notice. Abuse: proof-of-work or per-install signed token (spec 20 key reuse is not advised because it links uploads), rate limits, per-contributor weighting, outlier winsorising, anomaly review queue, ability to roll back a bad batch, k-anonymity floor (no stats for cells with fewer than 20 contributors). Governance and hosting cost: UNKNOWN.

## 11. Research notes

- Hyndman and Fan (1996) quantile definitions; type 7 default in R/NumPy: not opened, cited from knowledge, verify.
- Iglewicz and Hoaglin modified z-score 3.5 threshold: not opened, from knowledge, verify.
- Bootstrap CI approach: standard technique; no source opened.
