# SPEC-30 DeckChek Mobile (PWA companion)

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: `0018_session_origin.sql`. Milestone: M8. Size: M. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

Status: draft. Packaging: **separate app in this repo** (`mobile/`), static PWA, deployed via GitHub Pages. Not bundled in the desktop installer, but desktop gains an "Import phone results" action.

## 1. Summary, Goals / Non-goals
DeckChek Mobile is an installable, offline-capable PWA that turns a phone into a pocket measuring aid at the turntable: platter speed from a reference tone, a strobe helper, a plinth rumble/vibration reading, a rough SPL meter, and a hashed (integrity-checked, not signed) JSON/QR result that the desktop app imports. It reuses the pure DSP in `app/core.js` and `app/advanced.js` unchanged.

Goals: MVP = speed-by-mic + mains strobe helper + JSON/QR export + desktop import. v1.1 = vibration, SPL. Non-goals: replacing desktop analysis, DVS timecode, native app-store builds, cloud sync, any account or telemetry.

**Packaging decision (PWA vs Tauri 2 mobile).** Tauri 2 supports iOS/Android targets but needs Xcode + a Mac and Apple developer account for iOS, Android SDK/NDK, signing, and store review; it adds WebView limits (`DeviceMotionEvent.requestPermission` is exposed in MobileSafari but reportedly not WKWebView, snippet only) for no DSP gain, since all engines are JS. A PWA ships from the existing static `app/` code style, updates instantly, and works on both OSes. Revisit Tauri mobile only if we need background audio, BLE or native sensors at >60 Hz. Decision: PWA.

## 2. Users & stories
Owner/DJ with a phone near a deck. Acceptance criteria:
- AC-1 Given a 1 kHz test-tone record playing and mic permission granted, When I start Speed, Then within 5 s I see measured Hz, pitch % and RPM with an uncertainty (reusing `speedFromReferenceTone`).
- AC-2 Given no network after first load, When I open the installed app, Then every screen works offline (service worker cache).
- AC-3 Given mains 50 or 60 Hz selected, When I open Strobe, Then the screen shows the four-row strobe pattern flashing at the correct rate and states which dot rows are 33 1/3 / 45.
- AC-4 Given the phone rests on the plinth, When I run Vibration for 20 s, Then I get RMS and dominant frequency, or a clear "sensor too slow/unsupported" message.
- AC-5 Given any finished measurement, When I tap Export, Then I get a `.deckchek-mobile.json` file, a share-sheet entry and a QR (or multi-QR) of the same payload.
- AC-6 Given the desktop app, When I use Import phone results (file or paste), Then a validated run is added to the chosen asset's history, with `origin:"phone"`.
- AC-7 Given iOS denies motion permission, Then the screen explains how to re-enable it and does not crash.

## 3. UX
Entry: install from `https://<owner>.github.io/deckchek-mobile/` (Add to Home Screen). Bottom tab bar: Speed, Strobe, Vibration, SPL, Results. Styling follows `docs/GUI-DESIGN-RESEARCH.md` tokens (copy the CSS variables into `mobile/styles.css`; no remote assets).
- Speed: pick format/reference (default 1 kHz, 33 1/3), big start button, live Hz readout, level bar, result card. States: empty ("Play a 1 kHz test tone and tap Start"), loading (permission prompt), success, partial (tone found but SNR <15 dB: "Weak tone, move the phone closer"), error (mic denied: "Microphone blocked. Enable it in browser settings, then reload"), unsupported ("This browser cannot record audio").
- Strobe: 33/45 toggle, 50/60 Hz toggle, brightness lock note. Warns that LED mains lighting and 120 Hz phone displays can alias.
- Vibration: "Place phone flat on plinth, away from the tone arm", 20 s countdown, spectrum plot, verdict band vs desktop `lowBandEnergyDb` convention (relative only).
- SPL: A/C label, "Uncalibrated, +/- 10 dB" banner persistent; optional single-point calibration against a known reference.
- Results: list of runs, Export JSON, Show QR, Delete.
Accessibility: 48 px targets, `aria-live` for readouts, results announced, reduced-motion note (strobe is flashing: show photosensitivity warning with a confirm before first run; strobe region capped under 3 flashes/s is impossible at mains rate, so confirmation is mandatory). Shortcuts: none (touch).

## 4. Architecture
New folder `mobile/`: `index.html`, `manifest.webmanifest`, `sw.js`, `app.js`, `styles.css`, `icons/` (192/512 png), `screens/{speed,strobe,vibration,spl,results}.js`, `lib/{audio.js,motion.js,export.js,qr.js}`. Engines imported from the repo: a build step `tools/build-mobile.mjs` copies `app/core.js`, `app/advanced.js`, `app/calibration.js` and the FS-00 shared `app/canonical-json.js`, `app/sha256.js`, `app/vendor/qr.js` into `mobile/vendor/` (no bundler; version stamp in `vendor/VERSION`; `--check` mode fails CI when copies drift). Deploy: `.github/workflows/pages-mobile.yml` uploads `mobile/` with `actions/upload-pages-artifact` + `deploy-pages` on tag `mobile-v*` or manual dispatch.

JS APIs:
- `startMic({sampleRate}) -> {stream, ctx, stop()}` using `getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}})`; checks `track.getSettings()` and reports which flags the browser ignored.
- `captureSeconds(sec) -> Promise<Float32Array>` via AudioWorklet (fallback ScriptProcessor).
- `measureSpeed(samples, sr, {referenceHz, nominalRpm}) -> measurement[]` wraps `speedFromReferenceTone` + `frequencyTrace` + `speedStabilityMetrics`.
- `recordMotion(sec) -> {samples:[{t,x,y,z}], rateHz}`; `vibrationMetrics(samples)`.
- `exportRun(run) -> string`, `toQrFrames(json) -> string[]`.
Desktop: add `app/ui/workflows/import-phone.js` (`parsePhoneRun(text) -> {ok,run,errors}`), reuse `catalog-store.js` `buildAlignmentRecord`/run storage. QR encoding: the single shared generator `app/vendor/qr.js` from FS-00 (MIT, pinned there); desktop imports by file/paste only in MVP (no camera scan).
CSP for the PWA: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:`. Rust: none.

## 5. Data model
No SQL beyond desktop import; `0018_session_origin.sql`:
```sql
ALTER TABLE session ADD COLUMN origin TEXT NOT NULL DEFAULT 'desktop';
ALTER TABLE session ADD COLUMN source_device TEXT;
```
(Checked 2026-10-10: `session` in 0001 has neither column, so no conflict.)
Export JSON v1:
```json
{"format":"deckchek-mobile","version":1,"createdAt":"ISO","app":"mobile/0.1.0",
 "device":{"userAgent":"...","sampleRate":48000,"micFlags":{"echoCancellation":false,"noiseSuppression":false,"autoGainControl":false}},
 "assetHint":{"nickname":"SL-1200MK4 #1","serial":null},
 "measurements":[{"metricId":"speed.pitchPercent","label":"Pitch","value":0.12,"unit":"%","origin":"measured","confidence":0.8,"uncertainty":0.3}],
 "notes":"","sha256":"hex over canonical JSON without this field"}
```
Measurements use the `normalizeMeasurement` shape from `core.js`. Unknown versions are rejected with "Export is from a newer DeckChek Mobile". Phone-origin measurements are tagged `origin:"phone"` and are never combined with a desktop calibration profile.

## 6. Algorithms / method
- Speed: Goertzel scan ±15% around reference (existing); refinement 0.1 Hz. Phone mic ADC clock error is typically tens of ppm (UNKNOWN - needs verification) so uncertainty floor = `rpmUncertainty` with `clockPpm` default 100 (existing default), plus phone-mic AGC risk. Reject if SNR <15 dB (tunable).
- Strobe (mains): a lamp on mains flickers at 2x mains frequency (100 Hz at 50 Hz, 120 Hz at 60 Hz). A strobe disc looks stationary when dots passing per second equal the flicker rate, so `dots = flickerHz*60/rpm`: 216 dots at 33 1/3 and 160 at 45 (60 Hz); 180 and 133.3 (50 Hz, 45 rpm is only approximate). Derivation; verify against a printed Technics disc. The phone screen cannot sync to room lighting, so the on-screen mode uses its own clock: it toggles a pattern at `flickerHz` and the user reads drift; display refresh (60/120 Hz) limits achievable rates, so the app picks the nearest integer-frame divisor and shows the resulting systematic error.
- Camera strobe analysis (feasibility): camera frame rates (30/60 fps, sometimes 120/240) are far below the 100/120 Hz flicker, so only aliasing of a printed strobe disc is observable: the disc pattern appears to rotate at beat frequency, measurable by tracking the pattern angle via Hough/phase correlation per frame. Rolling shutter and exposure-time-locked mains flicker complicate this. Verdict: experimental, post-MVP; MVP uses eyes + on-screen strobe. `requestVideoFrameCallback` timestamp accuracy on mobile is UNKNOWN - needs verification.
- Vibration: Chromium caps accelerometer sampling at 60 Hz (snippet only), so Nyquist is 30 Hz: it cannot see audible rumble (20-100 Hz range of concern) but can see sub-30 Hz platter/bearing and footfall energy. iOS `devicemotion` rate is typically ~60 Hz (UNKNOWN - needs verification). Compute detrended RMS (m/s^2) and dominant peak 0.5-30 Hz via the same Goertzel sweep; present as relative A/B (before/after isolation feet), not absolute rumble dB. Rumble in the ARLL/DIN sense needs the cartridge path on desktop.
- SPL: RMS of the mic stream with AGC off, dBFS + user offset. Phone mics and OS gain are uncalibrated, A-weighting from mic response unknown: label "indicative". Single-point calibration stores offset in localStorage.

## 7. Errors, privacy, security
No data leaves the device; export is user-initiated. Service worker caches only `mobile/` files; versioned cache name, `skipWaiting` after user confirms update. Imported JSON is validated (type checks, max 1 MB, finite numbers, string length limits, sha256 check; mismatch gives a warning not a block). No `innerHTML` with imported strings. UA string is optional and redacted on request. Mic/motion require HTTPS (Pages satisfies). iOS: motion needs `DeviceMotionEvent.requestPermission()` from a user gesture and HTTPS (snippet only); permission may not persist across sessions. Android Chrome: sensors need secure context and visible page (snippet only); screen must stay on (use Screen Wake Lock where supported, fallback message).

## 8. Test plan
Unit (node, `tests/mobile-*.test.mjs`): speed on synthetic 1000/1010 Hz sine; export round-trip + hash tamper; strobe dots table; vibration RMS on synthetic 10 Hz at 60 Hz sampling; import validator rejects bad version/NaN/oversize. UI smoke: extend `tools/ui-smoke.mjs` (or a copy) with Playwright fake media (`--use-fake-device-for-media-stream`) to load `mobile/`, run Speed, export, check manifest + service worker registration + offline reload. Windows CI: desktop import test only. Manual: Traktor Scratch MK2 / Serato CV02.5 reference-tone side on SL-1200MK4 and PLX-CRSS12, compare phone pitch % against desktop result via Traktor Audio 8 (target within the combined uncertainty); strobe at both mains rates with a Rane Twelve MK2 pitch at 0; iPhone + Android install test; vibration with phone on plinth, with/without isolation feet.

## 9. Definition of done
Checklist: PWA installable (Lighthouse PWA pass), offline test pass, vendor copy script + CI check that vendor files match `app/`, Pages workflow, desktop import with AC-6, photosensitivity warning, README `mobile/README.md`. Feature flag: desktop import behind `features.phoneImport`. Docs: README, FEATURE-MATRIX, SPEC-09 roadmap.

## 10. Dependencies, risks, questions, effort
Depends on SPEC-01 (speed metrics), a stable `measurement` shape (SPEC-07), FS-00 (canonical JSON, SHA-256, QR). Hosting blocker: DeckChek is proprietary (see `LICENSE`) and GitHub Pages publishes the PWA's JavaScript (including the DSP engines) publicly; Pages on a private repo needs a paid plan and is still public. The owner must choose: public Pages site (accepting exposure of `core.js`/`advanced.js`), a separate private host, or local-network serving from the desktop app. Until decided, the Pages workflow is built but not enabled. Risks: mic DSP in browsers (AGC ignored), phone clock drift, strobe aliasing with modern lighting, 60 Hz sensor cap. Questions: public Pages URL ownership; show QR for large payloads (multi-frame) or file only for MVP? Effort: MVP M (~25 agent-hours), vibration+SPL S (~10), camera strobe L (research).

## 11. Research notes
- https://chromium.org/developers/design-documents/generic-sensor : accelerometer capped at 60 Hz, secure context (snippet only).
- https://developer.chrome.com/articles/generic-sensor/ : sensors only for visible documents (snippet only).
- https://yal.cc/js-device-motion/ and https://bugs.webkit.org/show_bug.cgi?id=203287 : iOS 13+ motion permission via user gesture/HTTPS; requestPermission only in MobileSafari not WKWebView (snippet only).
- getUserMedia audio-constraint behaviour on iOS: UNKNOWN - needs verification.
