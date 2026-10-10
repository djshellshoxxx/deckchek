# Spec 06 — Test-media library (test records and timecode media)

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: `0004_test_media.sql`. Milestone: M5. Size: L. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

## 1. Summary, goals, non-goals
A catalog of test records (reference-tone LPs, tracking/anti-skate/wow-flutter tracks) and DVS timecode media (Serato, Traktor, rekordbox, Mixxx/xwax formats), stored as versioned JSON profiles like device profiles. The user can add custom media. Selecting a medium in the Speed, Cartridge, DVS or timecode tests pre-fills expected values (reference frequency, level, carrier, track number) and records which medium produced a result.

**Goals:** accurate expected values with provenance and confidence; no hard-coded frequencies in test UIs; extendable by users. **Non-goals:** shipping audio from commercial test records (copyright), generating records, auto-identifying a medium from audio (maybe later).

## 2. Users & user stories
- AC-1 Given the Speed & Pitch test, when the user picks "Ortofon Test Record, track 5", then reference frequency 1000 Hz is prefilled and the label is stored with the result.
- AC-2 Given a medium without a verified value (confidence `unverified`), then the field is prefilled but flagged "Unverified — confirm on your disc".
- AC-3 Given Serato CV02.5 is selected in the DVS test, then format `Serato CV02.5` (carrier 1000 Hz at 33 1/3 rpm) is chosen in `analyzeTimecode`.
- AC-4 Given "Add custom medium", then the user saves a profile (name, kind, tracks with frequency/level/duration/purpose) and it appears in all pickers; it can be edited, exported as JSON and deleted; built-ins are read-only (can be "duplicated and edited").
- AC-5 Given an imported JSON with an invalid schema, then import fails with a list of field errors and nothing is stored.
- AC-6 Given a test result is saved, then it stores `media_id` + `track_id` and the history view shows them.
- AC-7 Given app update ships a newer built-in profile version, then built-ins are updated and custom media and results untouched.

## 3. UX
Entry points: new "Test media" tab in Equipment screen (`app/ui/screens/equipment.js`); medium picker (combobox "Test medium: Auto / <list> / Custom…") in Speed, Cartridge, DVS and Timecode workflow forms (`app/ui/workflows/definitions.js`); My Gear > asset > "Media I own" (checkbox on library entry, owned items float to top). Library screen: filter chips (Test records / Timecode / Custom), search, detail drawer with track table (track, side, frequency, level, purpose, source link), confidence badge, "Use in test" button. Editor: form for fields + tracks table (add/remove rows), live validation. States: empty ("No custom media yet. Add the discs you own."), loading, partial (some tracks lack levels: show "—"), error (schema errors per row), unsupported (none; JSON-only so works in browser). Copy for prefill chip: "From Ortofon Test Record · track 5 · 1000 Hz · 5 cm/s". Keyboard: `/` focuses search, Enter opens detail, Esc closes drawer. A11y: tables with proper headers, confidence conveyed by text not colour, editor errors linked via `aria-describedby`.

## 4. Architecture
New: `app/media/index.json` (generated list, same as `app/devices/index.json`), `app/media/profiles/*.json`, `app/media-library.js` (pure): `validateMediaProfile(p) -> {ok, errors[]}`, `loadBuiltInMedia(fetchJson)`, `listMedia(state,{kind,owned,query})`, `expectedValuesFor(media, trackId, testId) -> {referenceHz?, levelCmPerS?, carrierHz?, nominalRpm?, formatName?, confidence, label}`, `toTimecodeFormat(media) -> format object compatible with TIMECODE_FORMATS`, `mergeCustom(builtin, custom)`. Reuse `mergeFormats()` from `app/timecode.js` so timecode media with `kind:"timecode"` feed `analyzeTimecode`. `tools/build-media-index.mjs` mirrors `tools/build-device-index.mjs`. UI: `app/ui/screens/media.js`, `app/ui/media-picker.js` (`createMediaPicker({testId, onChange}) -> HTMLElement`). Rust new `src-tauri/src/media.rs`:
- `media_profiles_sync(profiles: Value[]) -> { inserted, updated, unchanged }`
- `media_list() -> [{id, source:"builtin"|"custom", kind, name, version, profile}]`
- `media_custom_save(profile: Value) -> {id}` / `media_custom_delete(id) -> ()`
- `media_owned_set(mediaId, owned: bool)`.
Browser fallback via `catalog-store.js` style local storage key `deckchek.media.v1`. Register in `lib.rs`. No plugins/crates.

## 5. Data model
Migration `0004_test_media.sql`:
```sql
CREATE TABLE IF NOT EXISTS test_media (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('builtin','custom')),
  kind TEXT NOT NULL CHECK (kind IN ('test_record','timecode','tone_file')),
  manufacturer TEXT,
  product_id TEXT REFERENCES product(id) ON DELETE SET NULL, -- set for timecode media that also exist as device profiles
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  profile_json TEXT NOT NULL,
  owned INTEGER NOT NULL DEFAULT 0,
  retired INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_test_media_kind ON test_media(kind, name);
CREATE TABLE IF NOT EXISTS test_media_track (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES test_media(id) ON DELETE CASCADE,
  track_key TEXT NOT NULL,
  side TEXT, track_no INTEGER,
  purpose TEXT NOT NULL,
  frequency_hz REAL, level_value REAL, level_unit TEXT,
  duration_s REAL, notes TEXT,
  UNIQUE(media_id, track_key)
);
ALTER TABLE device_test_result ADD COLUMN media_id TEXT REFERENCES test_media(id);
ALTER TABLE device_test_result ADD COLUMN media_track_key TEXT;
```
Profile JSON (`schemaVersion:1`):
```json
{ "schemaVersion":1, "id":"ortofon-test-record", "version":1, "kind":"test_record",
  "manufacturer":"Ortofon", "name":"Ortofon Stereo Test Record", "playbackRpm":33.333,
  "rias":"requires RIAA phono input", "confidence":"unverified",
  "tracks":[{"key":"t5","side":"A","trackNo":5,"purpose":"reference_tone","frequencyHz":1000,
             "level":{"value":5,"unit":"cm/s_rms"},"channel":"L","confidence":"unverified",
             "source":"https://…"}],
  "timecode":null, "sources":[{"title":"…","url":"…","verified":false}] }
```
Timecode profile: `"timecode":{"formatName":"Serato CV02.5","hasNoiseMap":true}` — carrier, phase convention and side lengths are NOT duplicated here: they resolve through `findFormat(mergeFormats(...))` in `app/timecode.js` (single source of truth for format facts, see §6 table). Timecode media that exist as device profiles (`category:"timecode-media"`, e.g. `serato-control-vinyl-cv025`, `traktor-scratch-timecode`) are linked by `product_id`, and `media_profiles_sync` also upserts `dvs_media_side` rows (0001) with `duration_sec` from the format's `sides` table so FS-13 has side durations. Versioning: `schemaVersion` bump with migration functions in `media-library.js`; sync compares `version`, built-ins retired (flag) when removed from the index; custom rows never touched; `device_test_result.media_id` set NULL semantics preserved on retire (no delete).

## 6. Catalog content (initial built-ins) and confidence
Test records (all values must be re-verified against the physical sleeve; "unverified" until the owner confirms):
- Ortofon Stereo Test Record (15 tracks/side per retailer summary): tracks 1–4 log sweeps 800 Hz–50 kHz (28 s each, L/R cut separately); 5–8 1000 Hz at 5 cm/s RMS reference; 9–14 315 Hz lateral at 50/60/70/80/90/100 um peak (tracking); 15 square wave. Confidence: snippet only.
- Analogue Productions Ultimate Analogue Test LP: 1 kHz reference tone (mono), 10 kHz tone, sweeps, VTA track, wow & flutter test at 3150 Hz, anti-skate test 315 Hz stepping 0 to +12 dB, pink noise, silent groove (snippet only; exact levels/track numbers UNKNOWN).
- Hi-Fi News & Record Review Test LP (Producer's Cut): track list UNKNOWN — needs verification (a forum list mentioning 1 kHz and 3150 Hz is not attributable).
- Clearaudio test record: one side 3150 Hz speed tone, plus balance/tracking tracks (snippet only). Clearaudio Stroboscope test record: strobe disc (not an audio tone).
- Technics/Pioneer test records: UNKNOWN — needs verification; ship none, provide a template.
- Generic "3.15 kHz speed reference" and "1 kHz / 0 dB reference" entries (user-defined variants) with note: 3000 Hz vs 3150 Hz records exist, using the wrong nominal gives ~5% error; built-in default nominal list `[1000, 3000, 3150]` Hz.
Timecode media — authoritative values from xwax `timecoder.c` as vendored in Mixxx (`lib/xwax/timecoder.c`, `timecode_defs[]`; `resolution` = "wave cycles per second" at 33 1/3 rpm, `length` = code length "in cycles", per `lib/xwax/timecoder.h`; carrier at 45 rpm = resolution x 1.35 per `timecoder_get_resolution`). Side playing time = length / resolution at 33 1/3:

| xwax id | Medium | Carrier Hz @33 1/3 | Side length (cycles -> min) | Flags | Confidence |
|---|---|---|---|---|---|
| serato_2a / serato_2b | Serato 2nd Ed. (CV02/CV02.5 family) A/B | 1000 | 712 000 -> 11.9 / 922 000 -> 15.4 | — | confirmed |
| serato_cd | Serato CD | 1000 | 950 000 -> 15.8 | — | confirmed |
| traktor_a / traktor_b | Traktor Scratch (MK1) A/B | 2000 | 1 500 000 -> 12.5 / 2 110 000 -> 17.6 | PRIMARY, POLARITY, PHASE (270 deg) | confirmed |
| traktor_mk2_a / _b | Traktor Scratch MK2 A/B | 2500 | 1 845 000 -> 12.3 / 2 590 000 -> 17.3 | MK2 (110-bit code) | confirmed |
| traktor_mk2_cd | Traktor Scratch MK2 CD | 3000 | 4 500 000 -> 25.0 | MK2 | confirmed |
| mixvibes_v2 / mixvibes_7inch | MixVibes V2 12" / 7" | 1300 | 950 000 -> 12.2 / 312 000 -> 4.0 | PHASE (270 deg) | confirmed |
| pioneer_a / pioneer_b | rekordbox DVS Control Vinyl (RB-VS1) A/B | 1000 | 635 000 -> 10.6 / 918 500 -> 15.3 | POLARITY | confirmed |
| algoriddim_a / _b | Algoriddim djay 12" A/B | 1000 | 600 000 -> 10.0 / 900 000 -> 15.0 | — | confirmed |
| (none) | Final Scratch | 1200 | — | — | unverified (absent from timecoder.c) |

`SWITCH_PHASE` means the channel phase difference is 270 deg instead of 90 deg, i.e. the forward/reverse sign of `tc_phase_deg` is inverted for that format; `SWITCH_PRIMARY` = left channel is primary. Whether Serato CV02.5 "NoiseMap" uses exactly the serato_2a/2b code is not stated in timecoder.c (carrier is); keep NoiseMap as an attribute. These values supersede the confidence flags currently in `app/timecode.js` and the timecode device profiles — see correction job `M5-tc-facts` in `docs/DEVELOPMENT-PLAN.md`. Licence: xwax/Mixxx are GPL-2.0-or-later; DeckChek is proprietary, so only the facts (numbers) are used — no code, LUTs or LFSR tables may be copied.

## 6b. Algorithms
Prefill precedence: user override > medium track > device profile `referenceHz` > global default (1000 Hz). Speed test uncertainty unchanged (`speedPitchUncertainty` with `referenceHz` from the medium). Medium reference frequency tolerance: if measured f is within 1% of a different built-in nominal (e.g., 3000 vs 3150) show suggestion "Looks like a 3150 Hz record — switch?" (tunable 1%). Level conversions: cm/s RMS to dB re 5 cm/s = 20*log10(v/5).

## 7. Errors, edge cases, privacy, security
JSON import size cap 256 KB, max 100 tracks, strings capped 500 chars, URLs must be https and are shown but opened only via Spec 07. IDs for custom media are generated UUIDs (never user-supplied path fragments). Built-in profile ids cannot be overwritten by import (rejected `id-collision`). All SQL parameterized. No audio is stored, nothing leaves the machine.

## 8. Test plan
Unit: `validateMediaProfile` (missing fields, bad enum, negative frequency, >100 tracks, non-https source), `expectedValuesFor` per test, `toTimecodeFormat` equals the matching `TIMECODE_FORMATS` entry for Serato CV02.5 and MK1, precedence, 1% suggestion, schema migration stub. Rust: sync insert/update/retire, custom save/delete, FK migration on `device_test_result`, upgrade from schema v2 DB. UI smoke: open Test media tab, add custom medium, select it in Speed test and see chip. Windows CI: `cargo test`. Manual with owner gear: SL-1200MK4 + PLX-CRSS12 play a 1/3.15 kHz test record, confirm prefilled values match the sleeve; Serato CV02.5 and Traktor Scratch MK2 vinyl through Traktor Audio 8 DJ; record observed carriers to promote "unverified" entries.

## 9. Definition of done
- [ ] Schema, built-ins with provenance, custom CRUD, pickers in 4 tests, results store media id
- [ ] Docs: DEVICE-PROFILE-SCHEMA.md sibling `MEDIA-PROFILE-SCHEMA.md`, SPEC-01/02 cross reference
Rollout: no flag; pickers default "Auto" so existing behaviour is unchanged.

## 10. Dependencies, risks, open questions, effort
Depends on: device library sync pattern (`devices.rs`), `timecode.js` (after `M5-tc-facts`), FS-00 (feature registry). Backups (FS-08) include `test_media` automatically because it lives in the database. Risks: wrong catalog values misleading users (mitigated by confidence flags); sleeve data copyright (facts only, no audio). Open: verify Technics/Pioneer/HFN tracks. Resolved: rekordbox carrier = 1000 Hz (xwax `pioneer_a/b`); NoiseMap does not change the carrier (serato defs all 1000 Hz). Effort: L (~26 agent-hours incl. research verification).

## 11. Research notes
- Ortofon test record track summary: https://www.stoneaudio.co.uk/products/ortofon-test-record and user guide https://www.audioadvisor.com/content/pdf/Ortofon_Test_Record_User_Guide.pdf (snippet only; guide not opened).
- Analogue Productions Ultimate Analogue Test LP: https://www.musicdirect.com/music/vinyl/ultimate-analog-test-lp-analogue-productions-test-vinyl-lp/ (snippet only).
- Hi-Fi News test LP: https://www.diyaudio.com/community/threads/test-lp-group-buy.313335/post-5227209 (forum, attribution unclear).
- Clearaudio test record 3150 Hz side: https://www.clearaudio.de/_assets/_pdf/manuals/accessories/CA_Stroboscope Testrecord_E+D.pdf (snippet only); 3000 vs 3150 Hz discussion https://forum.audiogon.com/posts/404303 (snippet only).
- Timecode data: xwax https://github.com/xwax/xwax, Mixxx PR https://github.com/mixxxdj/mixxx/pull/14569 (as cited in `app/timecode.js`).
- VERIFIED 2026-10-10 from source: Mixxx repo (sparse clone, commit b02e84aa4cbae2569b5bb850f2b12bd81062c791, 2026-10-08) `lib/xwax/timecoder.c` (`timecode_defs[]`, flags `SWITCH_PHASE`/`SWITCH_PRIMARY`/`SWITCH_POLARITY`/`TRAKTOR_MK2`) and `lib/xwax/timecoder.h` (`struct timecode_def` field comments, `timecoder_get_resolution`). Read locally; not redistributed.
