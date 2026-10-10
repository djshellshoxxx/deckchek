# Spike: does cpal 0.16 WASAPI honour `BufferSize::Fixed`?

Status: **pending owner run** (no hardware in the build sandbox). Feeds FS-11 section 7 and the M6-latency-core job.

Throwaway tool: `src-tauri/examples/spike_wasapi_buffers.rs`. It is not part of the app and not in CI. It plays silence, so it is safe on any monitoring chain, and it needs no loopback cable.

## What it measures

For each requested buffer size it opens a cpal input stream and an output stream (default host = WASAPI shared mode on Windows) with `BufferSize::Fixed(n)` and runs for a few seconds. cpal 0.16 does not report the negotiated period, so the tool infers it from the frame count of each callback (median = actual period) and times the gap between callbacks. It reports requested vs actual frames, actual period in ms, callback gap median/p99/max, gap-based xruns (gap greater than 1.5 x actual period), and stream errors from cpal's error callback. `honoured` is true when the median callback size equals the request.

## Owner instructions (Windows)

Prerequisites: Rust toolchain (rustup, MSVC build tools), this repo checked out on the `job/m6-latency-spike` branch or after it is merged. Close Serato, Traktor, rekordbox, and any app holding the device. Set the device sample rate to 48 kHz in Windows Sound settings (or pass `--rate`).

1. Build (from the repo root):
   ```
   cargo build --release --manifest-path src-tauri/Cargo.toml --example spike_wasapi_buffers
   ```
   The binary is `src-tauri\target\release\examples\spike_wasapi_buffers.exe`.
2. List devices and note the exact names and reported buffer ranges:
   ```
   .\src-tauri\target\release\examples\spike_wasapi_buffers.exe --list > devices.txt
   ```
3. Audio 8 DJ run (use the name substring shown in the list; typically "Audio 8"):
   ```
   .\src-tauri\target\release\examples\spike_wasapi_buffers.exe --input "Audio 8" --output "Audio 8" --seconds 8 --json audio8.json > audio8.txt
   ```
4. DJM-A9 run (USB audio; substring typically "DJM-A9"):
   ```
   .\src-tauri\target\release\examples\spike_wasapi_buffers.exe --input "DJM-A9" --output "DJM-A9" --seconds 8 --json djma9.json > djma9.txt
   ```
5. Optional, if each device exposes an ASIO or vendor driver mode switch, repeat once with the vendor driver panel set to its smallest buffer and note that in your paste. Optional: repeat step 3 with `--rate 44100`.
6. If a run errors on a size (device refuses it), that is a result, not a failure; keep going. If a size hangs, press Ctrl+C and rerun with `--sizes` excluding it.

Default sizes are 1024, 512, 256, 192, 128, 96, 64, 48, 32 frames. Override with `--sizes 512,256,128`.

## What to paste back

Paste into the PR/issue or the next session (the whole text is fine, it contains no machine name or user data):

- `devices.txt` (full)
- `audio8.txt` and `audio8.json`
- `djma9.txt` and `djma9.json`
- Windows version, Audio 8 DJ driver version, DJM-A9 driver version, and which driver mode/panel buffer setting was active in the vendor control panel (if any)
- Anything odd you noticed (audible glitches in your monitors are not expected since output is silence; crackle from other audio is worth noting)

Then fill in the results table below (or just paste and say "table not filled"):

| Device | Requested | Actual in (frames) | Actual out (frames) | Honoured | p99 gap ms | xruns | Stream errors / status |
|---|---|---|---|---|---|---|---|
| Audio 8 DJ | | | | | | | |
| DJM-A9 | | | | | | | |

**Owner run: pending.** Date, owner initials and outcome (A, B, C or D below) to be recorded here after the run.

## Decision tree for FS-11

Judge each device separately, then take the more restrictive outcome for the generic code path, keeping per-device capability data in `audio_device_buffer_info`.

- **A. Honoured** (honoured = true for input and output on most sizes at or above the device minimum; actual period equals request; no stream errors; gaps close to the period).
  Keep the FS-11 design as written: `stress_run` and `latency_play_and_capture` request `BufferSize::Fixed`, the stress table shows requested vs actual, the recommendation uses the smallest passing size plus one step. Sizes outside the device's reported range are skipped (spec section 7). Keep the "WASAPI round trip" label; ASIO is still not measured.
- **B. Honoured only partly** (some sizes exact, others rounded to a driver granularity or clamped to a minimum, for example anything under 480 frames returns 480).
  Treat the achieved size as the truth: record `actual` per row, de-duplicate rows that resolve to the same actual period, mark clamped rows "host-chosen period" and exclude them from the recommendation (AC-3). Add the granularity or floor to the per-device data shown in the UI. The recommendation then covers only the sizes the device really ran.
- **C. Ignored** (actual period is the same for every request, typically the shared-mode engine period around 10 ms, or `BuildStreamError` for every Fixed request).
  `BufferSize::Fixed` is not usable on this path. FS-11 changes to: stress test and round trip run with `BufferSize::Default`; the buffer-size sweep is replaced by a single "host-chosen period" row plus the measured round trip; the recommendation engine does not claim a smallest safe buffer and instead (1) reports measured vs driver-reported latency, (2) gives the Windows checklist and the load test at the host period, and (3) asks the user to type the ASIO panel buffer they run in their DJ software, so `recommendBuffer` works from the typed value and the software hints table. Update AC-3 and the section 7 scope note, and mark the sweep a non-goal for v1. Consider a WASAPI exclusive-mode backend only as a later, separate spike (cpal 0.16 shared mode only).
- **D. Streams fail or device unusable** (devices not listed, duplex open fails, or only one of input/output opens, for example the DJM-A9 exposes capture only on a different endpoint or the Audio 8 requires its ASIO driver exclusively).
  Mark that device "duplex via WASAPI unavailable": show the section 7 instruction to use the vendor ASIO panel manually and enter its buffer for "reported". Round-trip measurement for that device is limited to what loopback through WASAPI allows; if input and output can only be opened on separate endpoints, test whether two separate single-direction streams work and document it. Do not block FS-11 on this device.

Cross-cutting observations to apply regardless of outcome:

- If gap p99 is much larger than the period even at 1024 frames with no load, the callback-gap xrun criterion (1.5 x buffer, spec section 6) needs a floor in ms; record the observed idle p99 and use idle p99 plus margin.
- If input and output actual sizes differ, `reportedBufferFrames {in, out}` must stay separate and `reported = (Bin + Bout)/fs` as in AC-2.
- Record the outcome in FS-11 section 7 (replace the "pending owner run" note) and open follow-ups for any change to AC-3 or the section 6 stress procedure.
