# DeckChek Mobile

An installable, offline PWA that turns a phone into a pocket measuring aid at the turntable (FS-30, spec `docs/specs/30-mobile-companion.md`). Static files, no build step beyond a copy, no account, no telemetry: nothing leaves the phone except what you export yourself.

| Screen | What it does |
|---|---|
| Speed | Records a 1 / 3 / 3.15 kHz test-tone record for 4 s and shows measured Hz, pitch % and RPM with a k=2 uncertainty (desktop engines `speedFromReferenceTone`, `frequencyTrace`, `speedStabilityMetrics`, `rpmUncertainty`). A tone under 15 dB SNR is flagged "weak". |
| Strobe | The four-row dot table for the chosen mains and speed (216 / 180 / 160 / 133.3 dots) and an on-screen strobe that pulses at the nearest rate the display can make, showing the systematic error. A photosensitivity confirmation comes first. |
| Vibration | 20 s of accelerometer on the plinth: detrended RMS, dominant 0.5-30 Hz peak, spectrum. Relative (before/after isolation feet). Sensors are capped near 60 Hz, so audible rumble is out of reach. |
| SPL | Indicative A/C-weighted level, always labelled uncalibrated (+/- 10 dB) until a single-point calibration. |
| Results | Saved results on this phone; Export as `.deckchek-mobile.json`, share sheet, copy, QR (several QR codes when large). |

## Use

Serve this folder over HTTPS (or `http://localhost`: microphone and motion need a secure context) and open it, any static server pointed at `mobile/` works (for example `python3 -m http.server 8080 --directory mobile`). Add it to the home screen to install.

Import on the desktop: DeckChek > Options > Support > Experimental features > Phone import, then the Phone screen: paste the export text (or the QR text, one frame per line) or open the file.

## Layout

- `index.html`, `app.js` (hash router, service-worker registration, update prompt), `styles.css`, `manifest.webmanifest`, `sw.js`, `icons/`.
- `screens/{speed,strobe,vibration,spl,results}.js`, `lib/` (`audio.js`, `motion.js`, `export.js`, `qr.js`, plus the pure `speed.js`, `strobe.js`, `vibration.js`, `spl.js`, `store.js`, `ui.js`, `capture-worklet.js`).
- `vendor/` is generated. It holds byte-for-byte copies of `app/core.js`, `advanced.js`, `calibration.js`, `canonical-json.js`, `sha256.js`, `phone-run.js` and `vendor/qr.js`, plus `VERSION` (their hashes). Never edit it.

## Build step

```
node tools/build-mobile.mjs           # copy the shared engines, write vendor/VERSION, stamp sw.js
node tools/build-mobile.mjs --check   # fails (exit 1) when a copy or the stamp is stale; runs in CI
```

The stamp in `sw.js` (between the BUILD markers) lists every file for the precache and names the cache after a hash of all of them, so any change to any file gives a new cache. A new service worker waits; the page shows "A new version is ready" and only the person's tap activates it. Run the build after changing anything in `mobile/` or any shared file.

## Export format v1

`{"format":"deckchek-mobile","version":1,"createdAt","app","device":{userAgent,sampleRate,micFlags},"assetHint":{nickname,serial},"measurements":[...normalizeMeasurement shape],"notes","sha256"}`. The hash is SHA-256 over the canonical JSON of the export without `sha256`, with fractional numbers written as decimal strings (FS-00 canonical JSON only allows integers). It detects damage and casual edits; it is not a signature. A newer version is refused ("Export is from a newer DeckChek Mobile"); a mismatching hash only warns on import. Max 1 MB.

## Security and privacy

CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:`, no inline script or style, no `innerHTML`, no network calls (the service worker ignores other origins). Results and settings live in `localStorage` on the phone. The user-agent string can be left out of exports (Results > Export details).

## Hosting is undecided

DeckChek is proprietary and GitHub Pages would publish this folder's JavaScript, including the DSP engines, publicly. `.github/workflows/pages-mobile.yml` therefore runs only by hand (`workflow_dispatch`) and its deploy job also needs the `deploy` input ticked. Nothing is published. The owner chooses: public Pages, a private host, or serving from the desktop app (DEVELOPMENT-PLAN R12).

## Known limits and things still to verify

- Not tried on real phones: iOS motion permission and `getUserMedia` constraint behaviour, Android sensor rate, phone ADC clock error (the budget keeps the desktop 100 ppm default), microphone AGC.
- Strobe: LED lighting and 120 Hz screens alias; the on-screen mode shows its systematic error but has not been checked against a printed Technics disc. 45 rpm at 50 Hz is 133.3 dots, only approximate.
- Vibration verdict words (low / moderate / high) use unverified thresholds; compare runs, not limits. SPL assumes 100 dB at full scale until calibrated.
- Camera strobe analysis is post-MVP (spec section 6).
