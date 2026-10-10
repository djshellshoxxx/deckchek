# SPEC-31 Timecode Doctor: Live Monitor

Status: draft. Packaging: **inside DeckChek** (new "Live monitor" mode + Windows system tray, Rust side in `src-tauri/`). No separate app.

## 1. Summary, Goals / Non-goals
An always-on, low-CPU monitor that analyses the DVS timecode signal coming off the decks while Serato/Traktor is running, and warns (toast + tray colour) on SNR drop, phase/lock drift, hum rise and dropouts, keeping a session log for later diagnosis. It reuses `analyzeTimecode` (`app/timecode.js`), `dropoutMetrics`/`frequencyTrace` (`app/advanced.js`) and `humMetrics` (`app/core.js`) on a sliding window.

Goals: detect degradation early in a live set; never disturb the DJ software's audio. Non-goals: measuring through the DJ software's own ASIO session when the driver forbids it, controlling the DJ software, recording audio to disk by default, any network use.

## 2. Users & stories
Working DJ on Traktor Audio 8 DJ / DJM-A9 with Scratch vinyl. Acceptance criteria:
- AC-1 Given Live monitor started on a chosen input pair and timecode format, When timecode is healthy, Then tray is green and window shows per-deck SNR, level, and drift.
- AC-2 Given SNR falls >6 dB below its 60 s baseline for 5 s, Then tray turns amber and a toast "Deck A: timecode SNR dropped 8 dB" appears once (with 60 s cooldown).
- AC-3 Given SNR <12 dB or dropouts >=3 in 10 s, Then tray turns red and toast severity is "critical".
- AC-4 Given 50/60 Hz hum rises >10 dB above baseline in the carrier-adjacent band, Then a hum warning with the likely cause "ground loop/cable" is shown.
- AC-5 Given the DJ software holds the device exclusively, When I start monitoring, Then I see a plain explanation and the three workarounds (section 3) instead of a generic error.
- AC-6 Given the monitor runs for 2 h, Then average CPU stays under 2% of one core on the owner's laptop (tunable budget) and memory is flat.
- AC-7 Given the session ends, Then a log with all events and per-minute summaries is saved and viewable in History.
- AC-8 Given I close the main window, Then monitoring continues in the tray until I choose Quit.

## 3. UX
Entry: new nav item "Live monitor"; tray menu (Open, Start/Stop, Mute toasts 30 min, Quit). Layout per `docs/GUI-DESIGN-RESEARCH.md`: two deck cards (A/B, up to 4 later) with status chip (OK/Watch/Fault), SNR sparkline (last 5 min), level meter, lock/drift gauge, hum meter; event list below.
States: empty ("Pick an input pair per deck and a timecode format"), loading (opening stream), running, partial (one deck silent: "No signal on Deck B: vinyl stopped or lifted?" shown as info not alarm after 10 s of silence-by-design), error (device busy: see below), offline (n/a), unsupported (non-Windows: tray falls back to window badge; macOS/Linux tray is best-effort).
Device-busy copy: "Another program is using this audio device exclusively. DeckChek can monitor without interrupting it if: (1) your interface driver is multi-client or has a shared/WDM mode, (2) you use the DJ software's thru/aux output into a spare input, or (3) you split the deck's cable to a spare input pair." Shortcuts: `Ctrl+Shift+M` toggle monitoring, `Ctrl+Shift+T` open tray window. Accessibility: status never colour-only (chip text + icon shape); toasts use `role=alert` for critical, `role=status` otherwise; sound optional (off by default).

**Concurrency research summary.** WASAPI shared mode lets several processes use the same endpoint (the engine mixes playback; capture endpoints can be opened by more than one process) (Microsoft/WATCHOUT docs, snippet only). WASAPI exclusive and loopback conflict: loopback needs shared mode (MS docs). ASIO is typically single-client per driver instance (WATCHOUT docs, secondhand), but some drivers (NI, RME, per forum snippets) expose multi-client behaviour, and Windows driver models (WDM/WASAPI) may coexist with ASIO only if the vendor driver supports it. Whether Traktor Audio 8 DJ's ASIO driver is multi-client: UNKNOWN - needs verification (test on the owner's hardware). DJ software normally opens the ASIO device for both input and output, so DeckChek cannot open the same input channels through ASIO. Workarounds, in order of preference: 1) enable the interface's shared/WDM endpoint if the driver offers it and open it via WASAPI shared (cpal default host); 2) tap the deck signal before the interface: Y-split RCA (passive splitter, high-Z buffered recommended to avoid loading the cartridge) into a spare stereo input on a second interface/phono-stage line input (e.g. Xone:23C or laptop line-in); 3) use the DJ software's own output of the decoded signal (Traktor "Monitor"/thru is NOT timecode - UNKNOWN whether any software exposes raw timecode on an output), so this is limited to level/hum of audible content and is flagged as degraded mode; 4) multi-client third-party drivers (KoordASIO shared mode exists; compatibility with Traktor Audio 8 DJ UNKNOWN).

## 4. Architecture
Rust (`src-tauri/`): new `monitor.rs` (reuses `capture.rs` stream/ring-buffer code: cpal input + `rtrb` ring); `tray.rs`. `Cargo.toml`: `tauri = { version="2", features=["tray-icon","image-png"] }` (MIT/Apache-2.0; feature names per Tauri 2 tray docs, snippet only). Tray: `TrayIconBuilder::with_id("main")` and later `tray_by_id("main").set_icon(Some(image))` for green/amber/red icons (`set_icon` in JS API confirmed; Rust equivalent UNKNOWN - verify on docs.rs). Capabilities file must allow tray + `core:event`.
Commands:
- `monitor_start(cfg: {deviceName, channels:[{deck:"A",l:0,r:1}], sampleRate?, format, hopMs:250}) -> {ok, actualSampleRate, hostApi, shared:boolean, warnings:[string]}`; errors are `{code:"DEVICE_BUSY"|"NO_DEVICE"|"FORMAT_UNSUPPORTED", message}`.
- `monitor_stop() -> {summary}`, `monitor_status() -> {running, startedAt, decks:[{deck,state}], droppedCallbacks}`.
- `monitor_set_tray_state(state:"ok"|"watch"|"fault"|"off")`.
Events: `monitor://frame` (every hopMs, per deck `{deck, t, levelDb, snrDb, driftDeg, humDb, dropouts, locked}`), `monitor://alert` `{id, deck, kind, severity, message, t}`.
Design choice: DSP stays in JS (reuse tested engines). MVP: Rust forwards 250 ms stereo f32 blocks to the webview over a Tauri 2 `ipc::Channel`; the webview stays alive while hidden (window hide, not destroy), and drives the tray via `monitor_set_tray_state`. Phase 2, only if the CPU budget fails: a Rust port (`monitor_core.rs`: Goertzel at carrier, quadrature phase, window RMS) with parity tests against JS fixtures.
JS: `app/monitor.js` (pure): `createMonitor({format, hopMs, windowSec:0.5, baselineSec:60}) -> {push(left,right,sr)->frame, alerts(frame)->Alert[], reset()}`; `app/ui/screens/monitor.js`; `app/ui/live-monitor-log.js`. Tray menu strings in `tray.rs`.

## 5. Data model
Placeholder migration `NNNN_monitor_log.sql`:
```sql
CREATE TABLE IF NOT EXISTS monitor_session (
  id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT,
  device_name TEXT, host_api TEXT, sample_rate INTEGER, format TEXT,
  config_json TEXT NOT NULL, summary_json TEXT, asset_id TEXT REFERENCES asset(id));
CREATE TABLE IF NOT EXISTS monitor_event (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES monitor_session(id),
  t_ms INTEGER NOT NULL, deck TEXT, kind TEXT NOT NULL, severity TEXT NOT NULL,
  value REAL, baseline REAL, message TEXT);
CREATE TABLE IF NOT EXISTS monitor_minute (
  session_id TEXT NOT NULL REFERENCES monitor_session(id), minute INTEGER NOT NULL, deck TEXT NOT NULL,
  snr_db_min REAL, snr_db_mean REAL, hum_db_max REAL, drift_deg_max REAL, dropouts INTEGER,
  PRIMARY KEY(session_id, minute, deck));
CREATE INDEX IF NOT EXISTS idx_monitor_event_session ON monitor_event(session_id, t_ms);
```
Settings JSON `monitor.settings` (version 1): thresholds, cooldownSec, toastsEnabled, sound, retentionDays (default 90). Rows older than retention are pruned at startup. Log export: JSON `{version:1, session, events, minutes}`.

## 6. Algorithms
Per hop, analyse a 0.5 s window with `analyzeTimecode` (carrier amplitude, quadrature phase, balance) plus:
- SNR = carrier-band power / residual power (excluding carrier +-5%); report dB.
- Baseline = median of last `baselineSec` healthy frames (SNR >=15 dB); alert when current < baseline - 6 dB for 5 s (all tunable defaults, not sourced).
- Fault floor: SNR <12 dB sustained 2 s (tunable; compare the project's existing DVS integrity thresholds in `diagnostics.js` `dvsIntegrityScore` and align rather than redefine).
- Phase drift: unwrap quadrature phase error vs. expected rotation at carrier; alert when |drift| rate >5 deg/s or jitter std >15 deg (tunable). Distinguish deliberate speed change by tracking carrier frequency (pitch faders); only flag phase irregularity when frequency is steady.
- Dropouts: `dropoutMetrics(windowMs 20, dropDb 24)`; alert at >=3 in 10 s.
- Hum: `humMetrics` 50/60 Hz and harmonics rise >10 dB over 60 s baseline.
- Stopped/lifted vinyl: level < -55 dBFS (matches `presenceThresholdDb` in diagnostics) is state "idle", not fault.
Hysteresis: raise after N frames, clear after 2N; cooldown per (deck,kind) 60 s. Uncertainty: SNR +-1.5 dB at 0.5 s windows (estimate from `frequencyEstimatorStdHz`; verify).
CPU budget: Goertzel only at ~10 bins per 0.5 s window = under 0.5 ms per hop at 48 kHz; no FFT of full spectrum.

## 7. Errors, privacy, security
Input-only stream, shared mode preferred; never open exclusive. If the stream errors (device unplugged) emit alert "Audio device lost", retry every 5 s. Audio is never stored unless user enables "capture 10 s around critical events" (off by default, saved under the app data dir, path built from generated IDs only to avoid traversal). Nothing leaves the machine. Toasts: in-app plus OS notification only if the user grants it (Tauri notification plugin `tauri-plugin-notification` 2.x, MIT/Apache; optional, else in-window toast + tray). Tray tooltips contain no serials.

## 8. Test plan
Unit (`tests/monitor.test.mjs`): synthetic Serato 1 kHz and Traktor MK2 2.5 kHz quadrature streams: healthy gives no alert; injected noise gives SNR alert after 5 s; 3 dropouts gives critical; added 60 Hz hum gives hum alert; pitch fader sweep gives no drift alert; silence gives idle; cooldown/hysteresis. Rust: `monitor_core` parity test vs JSON fixtures from the JS engine; tray state mapping; config validation. UI smoke: Playwright feeds a mock `monitor://frame` stream and asserts chip text, toast role, event list. Windows CI: build with `tray-icon` feature and launch smoke (`--headless-check` flag that creates and drops the tray). Manual: with Traktor running on Audio 8 DJ playing Scratch MK2 vinyl on SL-1200MK4: (a) try WASAPI shared endpoint open; (b) Y-split to Xone:23C/laptop line-in; (c) lift needle, add a dust speck, unplug a cable, switch ground wire off PLX-CRSS12 to provoke hum; repeat with Serato CV02.5 and DJM-A9 digital USB path (note DJM-A9 USB audio class driver behaviour: UNKNOWN). Log 2-hour CPU trace.

## 9. Definition of done
All AC pass; CPU/memory budget measured; tray works on Windows 10/11 and degrades elsewhere; retention pruning; docs: README, SPEC-02 cross-reference, FEATURE-MATRIX. Feature flag `features.liveMonitor` (default off in first release).

## 10. Dependencies, risks, questions, effort
Depends on SPEC-02 (timecode), capture.rs. Risks: exclusive ASIO makes the headline use case impossible on some rigs (mitigated by split cable); tray icon APIs; false alarms from cuing/backspins; split cable loading the cartridge. Questions: does Audio 8 DJ expose a shared WDM endpoint concurrently with its ASIO session? Can any DJ software output raw timecode? Effort: MVP (JS analysis, window+tray, shared mode) L (~40 agent-hours); Rust port M (~16).

## 11. Research notes
- https://v2.tauri.app/learn/system-tray/ (and de/fr/ko variants): tray setup, `tray_by_id("main")`, JS `setIcon` (snippet only).
- https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording : loopback only in shared mode, not exclusive.
- https://www.kvraudio.com/forum/viewtopic.php?p=8170423 and https://apps.microsoft.com/store/detail/koordasio-universal-driver/XP9CSS6NZBDV21 : KoordASIO shared-mode ASIO lets ASIO and Windows apps share a device (snippet only); ASIO2WASAPI opens exclusive.
- https://docs.dataton.com/guide/watchout/devices/wasapi.html : ASIO generally single-client, WASAPI shared multi-process (snippet only).
- https://forum.djtechtools.com/t/open-soundcard-drivers-in-more-than-1-application/2128 : forum reports of NI/RME multi-client ASIO (snippet only, anecdotal).
