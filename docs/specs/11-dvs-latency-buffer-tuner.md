# SPEC-11: DVS Latency and Buffer Tuner

## 1. Summary, Goals, Non-goals

Measures real round-trip latency through the DJ interface, compares it with what the driver reports, stress-tests decreasing buffer sizes under CPU load for dropouts, and recommends the lowest safe buffer per DJ program with that program's own setting names. Includes a Windows tuning checklist that reads power settings via `powercfg`/PowerShell and a feasible DPC-style proxy without kernel drivers.

Goals: round-trip ms with uncertainty; safe-buffer recommendation with evidence; actionable Windows checklist (read-only by default).
Non-goals: no kernel driver, no ETW capture (out of scope; LatencyMon remains the recommended external tool); DeckChek never changes system settings or the DJ software's settings; no ASIO control-panel automation.

## 2. Users & user stories

- US-1: As a scratch DJ I want the lowest buffer that never crackles on my laptop.
- US-2: As a DJ with dropouts I want to know whether Windows power settings or my driver is to blame.
- US-3: As a technician I want latency numbers for a report.

- AC-1: Given a loopback cable (interface output to input) and a selected device, when I run "Measure latency", then a marker chirp is played and detected, and the result shows round-trip ms (mean of 5 runs), standard deviation and expanded uncertainty (k=2).
- AC-2: Given the driver reports buffer B frames in and out, then the report shows reported = (Bin + Bout)/fs and measured; the difference is labelled "driver/USB overhead" and is flagged if > 1 ms plus tolerance.
- AC-3: Given the stress test, when I press Start, then buffers [1024, 512, 256, 128, 64] frames (those the device supports) are tested for 30 s each with CPU load; each step reports xruns, max callback gap, pass/fail.
- AC-4: Given a step has any xrun at idle load, it fails; the recommendation is the smallest passing buffer with one step of headroom (next larger), per software.
- AC-5: Given no loopback cable, the tuner offers stress-test-only mode (no round trip) and says so.
- AC-6: The Windows checklist lists each item as pass / review / unknown with the exact command to inspect and the manual path to change; no setting is changed by DeckChek.
- AC-7: Esc aborts any run, stops CPU load threads within 1 s and stops the output tone.

## 3. UX

Entry: Calibration screen tab "Latency & buffer" and Quick Check card; also linked from SPEC-10 when dropouts are found.
Flow: (1) Setup: pick interface, sample rate, loopback channel pair, software target (Serato DJ Pro / Traktor Pro / rekordbox), safety note "Turn the monitor volume down. A loop test plays a loud chirp." Output level default -20 dBFS (reuses `loopbackStimulus` levels). (2) Latency: 5 repetitions, live meter; result card with reported vs measured. (3) Stress: step table filling in live; CPU load slider (0 / 50 / 80 %), default 50 %, "simulates your DJ software" caveat. (4) Result: recommendation card per software, Windows checklist, export.
States: empty (no device: "No audio device found"), loading, success, partial (latency ok, stress skipped), error (device busy: "Another program holds the device in exclusive mode. Close <DJ software>."), offline n/a, unsupported (non-Windows: latency/stress run, Windows checklist hidden with note "Windows desktop app only"). Driver does not accept requested buffer: row "Not supported by driver (skipped)".
Copy: Recommendation: "Lowest safe setting: 128 samples (about 2.7 ms at 48 kHz). Set Serato USB Buffer Size to the ASIO panel value of 128 or 5 ms to start." Shortcuts: Enter start, Esc abort, Ctrl+E export. A11y: progress as `role=progressbar`, results table with headers, status icon + text.

## 4. Architecture

JS:
- `app/latency.js` (pure): `chirpStimulus(fs, {durationSec, f0, f1, levelDbfs}) -> {left,right,meta}`; `measureRoundTrip(captured, meta) -> {latencyMs, latencySamples, peakStrength, uncertaintyMs}` (wraps `detectMarkerLag` and `markerSignal` from calibration.js; adds matched-filter peak interpolation); `summarizeRuns(values) -> {meanMs, stdMs, expandedMs}` using `repeatabilityMetrics`; `evaluateStressStep(quality, loadPct) -> 'pass'|'fail'`; `recommendBuffer(steps, fs, software) -> {frames, ms, headroomFrames, settingText}`; `SOFTWARE_BUFFER_HINTS` table; `windowsChecklist(raw) -> Item[]`.
- `app/ui/screens/latency.js`.
Rust (`src-tauri/src/latency.rs`, new file):
- `audio_device_buffer_info(device_name?) -> {deviceName, hostApi, sampleRate, input:{minFrames,maxFrames,default}|null, output:{...}|null, supportsFixed:bool}` from cpal `SupportedBufferSize` (existing audio.rs dependency).
- `latency_play_and_capture(device_name?, out_device?, stimulus:{sampleRate,left:[f32],right:[f32]}, buffer_frames?:u32) -> {captured:{sampleRate,left,right}, quality: CaptureQuality, reportedBufferFrames:{in:number|null,out:number|null}}` (full-duplex, output stream + `capture.rs` input path, requested `BufferSize::Fixed`).
- `stress_run(device_name?, buffer_frames, seconds, cpu_load_pct) -> {requested, actual, callbacks, xruns, maxGapMs, p99GapMs, overruns, streamErrors:[string]}`; spawns N busy-loop threads (N = round(logical cores * pct/100)) at below-normal priority, joined in a drop guard; callback gap measured with `Instant` in `capture.rs::record_callback`.
- `windows_tuning_scan() -> {supported, activePlan:{name,guid}, usbSelectiveSuspend:{ac:number|null,dc:number|null}, minProcessorState:{ac,dc}, minCores:{ac,dc}, wifi:[{name,status}], bluetooth:[{name,status}], timerResolutionMs:number|null, dpcProxy:{dpcPct,interruptPct,samples}, onBattery:bool|null, errors:[string]}`.
Events: `latency://progress {phase, step, frames, elapsedSec}`.
Deps: none. cpal ASIO host needs the Steinberg SDK (licence-restricted, not redistributable) - do not enable; use WASAPI/cpal and report ASIO values only if the user types them (see section 7).

## 5. Data model

`NNNN_latency_tuner.sql`:
```sql
CREATE TABLE IF NOT EXISTS latency_run (
  id TEXT PRIMARY KEY, session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  setup_id TEXT REFERENCES setup(id) ON DELETE SET NULL,
  device_name TEXT NOT NULL, host_api TEXT, sample_rate_hz INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('roundtrip','stress')),
  buffer_frames INTEGER, cpu_load_pct INTEGER,
  measured_ms REAL, std_ms REAL, expanded_u_ms REAL, reported_ms REAL,
  xruns INTEGER, max_gap_ms REAL, verdict TEXT, detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_latency_run_dev ON latency_run(device_name, created_at);
CREATE TABLE IF NOT EXISTS buffer_recommendation (
  id TEXT PRIMARY KEY, device_name TEXT NOT NULL, software TEXT NOT NULL,
  frames INTEGER NOT NULL, ms REAL NOT NULL, based_on_run_id TEXT REFERENCES latency_run(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL);
```
`SOFTWARE_BUFFER_HINTS` is versioned in code (`hintsVersion`). Raw loopback audio not retained by default.

## 6. Algorithms

Round trip: `chirpStimulus` = existing `markerSignal` (2 -> up to 12 kHz-class chirp, repeat 5 times at 1 s spacing). Latency = lag of matched-filter peak with parabolic sub-sample interpolation; uncertainty = quantisation 1/(fs*sqrt(12)) (same as `uncertainty.latencyMs` in calibration.js) combined with run std via `combineStandardUncertainties`; k=2. Reject runs with strength < 0.3. Loopback shares the interface clock, so values are latency, not clock error (calibration.js note).
Reported vs measured: reported = (Bin+Bout)/fs. Typical measured exceeds reported by driver safety offset + converter delay; thresholds (tunable): flag when excess > 2 ms or negative (driver misreport). Round-trip target guidance: scratch DVS feels good under about 10 ms round trip - UNKNOWN as hard threshold, treat as advisory (Traktor Play manual snippet: 5-10 ms adequate, ~15 ms typical start).
Stress: for each buffer from large to small: run `stress_run` at idle then at selected load. Pass criteria (tunable): 0 xruns and max gap < 1.5 x buffer period in 30 s; fail otherwise. Stop descending after two consecutive fails. Recommendation = smallest passing buffer at the chosen load, plus one step headroom; if load 80 % passes it is labelled "very safe". The tuner cannot see the DJ app's own CPU use, so output says "Test load is a proxy; verify in your software for 10 minutes."
Software hints (names): Serato DJ Pro: Setup > Audio > "USB Buffer Size" slider; Serato suggests starting at 5 ms; on Windows "Launch Driver Panel" for ASIO buffer (snippet only). Traktor Pro: Preferences > Audio Setup > "Latency (ms)" slider/ASIO control panel; NI Traktor Play manual says keep buffers under 256/512 samples (snippet only; Traktor Pro 4 wording UNKNOWN - needs verification). rekordbox: Preferences > Audio > "Buffer Size" UNKNOWN - verify against rekordbox DVS setup guide (https://cdn.rekordbox.com/files/20260709200752/rekordbox7.2.16_dvs_setup_guide_EN.pdf, TOC only).
Windows checklist via commands (all read-only):
- Plan: `powercfg /getactivescheme`; recommend High/Ultimate Performance or vendor "DJ" plan.
- USB selective suspend: `powercfg /query SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226` (GUIDs from search snippets; value 0 = disabled is the desired value).
- Min processor state and core parking: `powercfg /query SCHEME_CURRENT SUB_PROCESSOR` for PROCTHROTTLEMIN and CPMINCORES (aliases; exact GUIDs UNKNOWN - parse by alias name). Core parking relevance on modern Windows is debated; mark "review", not "fail".
- Wi-Fi/Bluetooth: `Get-NetAdapter -Physical`, `Get-PnpDevice -Class Bluetooth` -> "Consider Airplane mode during the set" (advisory).
- DPC proxy without ETW: perf counters `\Processor Information(_Total)\% DPC Time` and `% Interrupt Time` sampled 1 Hz for 30 s with `Get-Counter`; plus a timer-jitter test (1 ms sleeps, record p99 wake error) in Rust. Warn at DPC time > 5 % mean or jitter p99 > 2 ms (tunable). This is a proxy; per-driver blame needs LatencyMon (external; Merging/Focusrite guidance advise 10-30 min runs).
- Also: battery vs AC, Windows timer resolution (`NtQueryTimerResolution` is native; skip, use jitter test), background apps list from `tasklist` top CPU.

## 7. Error handling, edge cases, privacy

Exclusive-mode ASIO device: duplex via WASAPI may be impossible; show instruction to use the ASIO panel manually and enter the panel's buffer for "reported". Device does not support Fixed buffer: skip step. Clipping in loopback aborts. CPU threads capped at logical cores - 1; hard timeout 40 s per step; thermal warning if laptop on battery. Output stimulus capped -6 dBFS max, default -20; ramped fades. PowerShell invoked with fixed scripts, `-NoProfile -NonInteractive`, no user-supplied strings concatenated. Data stays local; exports exclude machine name.

## 8. Test plan

Unit: chirp detection at known synthetic delays (0.5, 3.17, 12.4 ms) within 1 sample; uncertainty math; recommendBuffer cases (all pass, only 256 passes, none pass -> "increase buffer / see checklist"); checklist parsing from captured powercfg text fixtures (en-US and decimal-comma locales); evaluateStressStep boundaries.
Rust: `stress_run` guard joins threads; powercfg output parser; non-Windows returns supported:false.
UI smoke: mocked invoke full flow; Esc abort.
Windows CI: `windows_tuning_scan` returns supported with active plan.
Manual: Audio 8 DJ loopback (out A to in A) measure; compare to Traktor's displayed latency; repeat at 3 buffers; DJM-A9 USB loopback if routable; run stress at 50 % while Serato idle; change power plan and re-test; verify Esc stops load.

## 9. Definition of done

- [ ] AC-1..AC-7; [ ] measured repeatability std < 0.1 ms on owner's Audio 8; [ ] tests green; [ ] hints table reviewed against current software docs.
Rollout: flag `features.latencyTuner`. Docs: FEATURE-MATRIX, calibration section in app/README.md.

## 10. Dependencies, risks, open questions, effort

Depends on SPEC-02 calibration (marker/lag), capture.rs quality counters, SPEC-10 (consumer). Risks: ASIO inaccessible so duplex over WASAPI misrepresents ASIO latency (biggest); stress threads not equal to real DSP load. Open: ship ASIO via SDK (licence)? exact rekordbox/Traktor names. Effort: L (about 45 agent-hours).

## 11. Research notes

- Serato buffer advice, 5 ms start: https://support.serato.com/hc/en-us/articles/202536960-What-settings-should-I-use-for-buffer-size-in-both-applications (snippet only).
- Traktor Play manual buffer text: https://docs.native-instruments.com/online-guides/traktor-play-user-guide/en/preferences (snippet only).
- DPC latency workflow: https://help.neumann.com/hc/en-us/articles/37666236939922-DPC-Latency-helper-Windows ; https://support.alesis.com/en/support/solutions/articles/69000803869-troubleshooting-dpc-latency ; https://support.focusrite.com/hc/en-gb/articles/208360865 (snippet only).
- USB selective suspend powercfg GUIDs: https://www.elevenforum.com/t/enable-or-disable-usb-selective-suspend-in-windows-11.10251/latest (snippet only).
