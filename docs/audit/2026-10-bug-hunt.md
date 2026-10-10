# DeckChek deep bug hunt — October 2026

Branch `job/audit-bugs`, base `e2f51a3`. Scope: the Rust backend (`src-tauri/src/*.rs`), the JS engines (`app/*.js`) and the UI (`app/ui/**`).
No product code was changed. Each confirmed defect has a failing reproduction where one was practical (see [Reproduction tests](#reproduction-tests)).

## Method

- I traced each finding end to end, from the IPC command or UI trigger to the storage or device effect. I dropped anything I could not substantiate from the code.
- Rust: `cargo test --lib` passes (377 passed, 8 ignored: 4 existing device tests and the 4 audit repros). The audit repros fail as described when run with `--ignored`.
- JS: `npm test` passes (704). The audit repros live in `tests/audit-repro/`, which is outside the `npm test` glob. They are also skipped unless `AUDIT_REPRO=1` is set.
- I checked one SQLite behaviour directly with Python `sqlite3` 3.45: REPLACE fires `ON DELETE CASCADE` and `SET NULL` foreign-key actions when `foreign_keys=ON`.
- Areas reviewed with no finding:
  - the audio_out renderer and limiter (`render_safe`, `hard_cap`, ramps, NaN handling);
  - the backup zip safety checks (`entry_name_safe`, size, ratio and declared-size limits);
  - the restore swap and rollback, and startup recovery;
  - the `links.rs` URL policy and the ms-settings allowlist;
  - `userfiles` path validation;
  - timecode direction and phase conventions (`fitTone` phase sign, `directionSign`, wear-map skip phase);
  - the dB, ppm and speed maths in `timecode.js` and `calibration.js`;
  - the 185 `innerHTML` sites, checked by pattern search; every device, log and user string reaching them is escaped or set with `text`.

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 4 |
| Low | 9 |

| ID | Sev | Where | One line |
|---|---|---|---|
| BUG-01 | high | `db.rs:311-315` | Re-saving a run (Ctrl+S / baseline) deletes its repeat-scan rows and cuts every other feature's link to it |
| BUG-02 | high | `capture.rs:1494`, `capture.rs:1583`, `pre-gig.js:655-664` | Stop commands carry no lease id, and pre-gig preempts natively. One feature can stop another's capture and receive its audio |
| BUG-03 | medium | `lib.rs:123-135`, `diagnostics.rs:636-651` | Panic-hook order: the global audio kill switch runs after backtrace capture and log I/O |
| BUG-04 | medium | `latency.rs:805`, `audio_out.rs:1228-1232` | The tuner's private audio_out engine ignores window-close/exit silencing and can play on top of the global engine (up to −6 dBFS) |
| BUG-05 | medium | `capture.rs:1145-1167`, `1226`, `1303` | The "10 s" input-open timeout joins the hung thread anyway, while holding the session/stream mutex |
| BUG-06 | medium | `processes.rs:222-226`, `latency.rs:1724` | English performance-counter paths fail on localized Windows, so top-CPU and the DPC proxy come back silently empty |
| BUG-07 | low | `diagnostics.rs:1024-1030` | The diagnostics bundle opens the live DB outside the connection gate, which can race a restore |
| BUG-08 | low | `midi.rs:133-175` | Stale MIDI connections after unplug: open reports OK, and send fails until `midi_close_all` |
| BUG-09 | low | `capture.rs:1410-1421` | Preempting a bounded capture releases its lease after 5 s even if it is still running |
| BUG-10 | low | `latency.rs:2074`, `2097` | The tuner commands silence the user's tone before learning whether the input is busy |
| BUG-11 | low | `usage.rs:51-71`, `153-166` | Mixed timestamp shapes compared as text: the `since` filter drops later entries |
| BUG-12 | low | `dj_sessions.rs:137-146`, `system_check.rs:1034-1050` | UTF-16 logs over 2 MiB lose their BOM in the tail read and yield nothing |
| BUG-13 | low | `app/ui/audio-io.js:471-485` | `playStereo` has no −12 dBFS clamp, although `audio-out.js` documents one |
| BUG-14 | low | `audio.rs:446-484` | Bounded capture: device loss is reported as a timeout, and the collected stream errors are discarded |
| BUG-15 | low | `capture.rs:327-333`, `1189-1191` | The live accumulator allocates its whole `maxSeconds` buffer for every pair up front, so an allocation failure aborts the process |

---

## High

### BUG-01: Re-saving a run cascades away other features' data

**Where:** `src-tauri/src/db.rs:311-315` (`persist_run`), with `open_database` setting `PRAGMA foreign_keys=ON` (`db.rs:179`).

**Reproduction:**
1. Run a vinyl scan twice. `flow.js:514-516` saves run B, then `saveRepeatScanAlignment` writes `full_side_scan` A and B (each with `session_id` set to the run id) and a `scan_alignment` row.
2. Press Ctrl+S, which calls `saveRunAsBaseline`, or Save in History (`history.js:280`). Both call `persistRun` with the same run, and that calls `save_diagnostic_run`.
3. `INSERT OR REPLACE INTO session` deletes the old session row first. With foreign keys on, SQLite runs every FK action:
   - CASCADE deletes `full_side_scan` B. That in turn deletes `scan_alignment`, `vinyl_event` and `wear_scan` (`0010_wear_map.sql:5`).
   - SET NULL cuts `asset_usage.session_id` (stylus hours), `latency_run`, `pregig_run`, `stylus_*`, `wear_scan.session_id`, `scratch_run`, `hum_*` and `device_test_result`.

**Root cause:** The comment "INSERT OR REPLACE cascades away any earlier children of the same run id" was meant for the run's own measurement, evidence and hypothesis rows. REPLACE deletes every FK child, not only the ones `persist_run` rewrites.

**Repro test:** `audit_repro::bug01_resaving_a_run_keeps_its_repeat_scan_alignment` (2 scans become 1, 1 alignment becomes 0) and `audit_repro::bug01_resaving_a_run_keeps_usage_links` (the session link becomes NULL).

**Minimal fix:**
- Upsert the session row with `INSERT … ON CONFLICT(id) DO UPDATE SET …`.
- Inside the same transaction, explicitly `DELETE FROM measurement/evidence/hypothesis WHERE session_id = ?1` before re-inserting them. The link tables cascade from those rows.

### BUG-02: One feature can stop another feature's capture and take its audio

**Where:**
- `capture.rs:1494` `stop_live_capture` and `capture.rs:1583` `stop_stream_capture` take no lease or stream id. `stop_blocking` and `stop_stream_blocking` stop whatever is in the slot.
- `app/pre-gig.js:655-664` starts a live capture with `invoke('start_live_capture')`, which is not registered in `activeCaptures`. It then calls `stop_live_capture` unconditionally, and it preempts with `invoke('capture_preempt')` directly.
- No JS code listens for the `capture-preempted` event that `capture_preempt` emits (`capture.rs:1550-1552`).

**Reproduction:**
1. Quick Check (`flow.js`) is recording through `startLiveSession`. Leaving the screen does not stop it (`flow.js:49` `onHide: () => {}`).
2. The user runs Pre-gig. The deck check gets CAPTURE_BUSY, and the user picks "Stop … and continue". `deps.preempt()` calls `capture_preempt` natively: Rust stops Quick Check's session and discards its audio, while Quick Check's JS controller still believes it is recording.
3. Pre-gig starts its own capture. `live_capture_status` reports `running: true` (pre-gig's session), so Quick Check's device-lost check (`flow.js:348`) never fires.
4. Quick Check's timer reaches its target and calls `session.stop()`, which calls `stop_live_capture`. Quick Check then:
   - stops pre-gig's capture;
   - analyses and saves pre-gig's deck audio as its own run.
5. Pre-gig's own `stop_live_capture` fails with "No live capture is running.", and the deck check errors.

The stream path has the same gap. A stream that ended by itself reaps with `stop_stream_capture` (`audio-io.js:310-315`). If another stream started in between, the reap stops the new stream.

**Repro test:** `tests/audit-repro/capture-ownership.test.mjs`. Quick Check receives `audio of pre-gig`.

**Minimal fix:**
- Give `stop_live_capture` and `stop_stream_capture` an optional `leaseId`/`streamId`, and return a "not yours" error when it does not match the slot.
- Pass the id from `startLiveSession`, `startStreamSession` and `pre-gig.js`.
- Have pre-gig preempt through `preemptCapture()` so local controllers are told.
- Make `startLiveSession` listen for `capture-preempted` (matching `leaseId`) and mark itself stopped.

## Medium

### BUG-03: The audio kill switch runs last in the panic-hook chain

**Where:** `lib.rs:123` `audio_out::install_panic_guard()`, then `lib.rs:126` `diagnostics::setup` (which calls `install_panic_hook`, `diagnostics.rs:636-651`), then `lib.rs:135` `latency::install_panic_guard()`.

**Failure scenario:**
- Each hook runs its own body, then calls the previous hook. The order on a panic is therefore:
  1. the tuner kill;
  2. the diagnostics hook, which does `Backtrace::force_capture().to_string()` (symbol resolution through dbghelp/PDB on Windows, often hundreds of ms or more), sanitises it and writes the log file;
  3. only then `ENGINE.kill_all()`.
- A test tone or feedback step tone keeps playing at up to −12 dBFS for that whole time.
- This contradicts `audio_out.rs:21-23`: "any panic … output becomes 0 within CONTROL_POLL_FRAMES frames".

**Root cause:** Install order. The audio guard was installed first, so it is the innermost hook.

**Minimal fix:** Install `audio_out::install_panic_guard()` (and the latency guard) after `diagnostics::setup`, so they are outermost and run first. Alternatively, call `audio_out::global` `kill_all` at the top of the diagnostics hook.

### BUG-04: The tuner engine is outside the one-voice and stop-on-close guarantees

**Where:**
- `latency.rs:805`: `Tuner::new` builds its own `audio_out::Engine`.
- `audio_out.rs:1228-1232`: `on_run_event` silences only the global `ENGINE`. `latency.rs` has no run-event hook and no watchdog thread; `tick()` runs only inside the run loop.
- `audio_out.rs:12-15`: "Only one voice plays at a time … two DeckChek streams can never sum above the cap."

**Failure scenarios:**
1. **Closing the window during a round trip.** A round-trip stimulus lasts up to 30 s (`MAX_STIMULUS_SECONDS`) at up to −12 dBFS. Closing the main window mid-round-trip does not stop it. With the on-exit backup holding `ExitRequested` for up to 5 s (`backup.rs:1421-1435`), output continues after the window is gone.
2. **Two engines playing at once.** The latency screen keeps a run going when hidden (`ui/screens/latency.js:617`). If the user starts the Feedback step test tone on the global engine meanwhile, `Engine::play` on the global engine has no knowledge of the tuner voice. Two −12 dBFS signals reach the same device, peaking at −6 dBFS.

**Minimal fix:**
- Route the tuner through the global engine's slot, or add a process-wide "voice active" latch that both engines check in `play()`, so the second play replaces the first.
- Call `latency::global().abort()` (or `engine.stop_all_for_exit`) from `audio_out::on_run_event`.

### BUG-05: The input-open timeout does not bound anything and holds the capture mutex

**Where:** `capture.rs:1145-1167` `open_source`. On `recv_timeout` it sets `stop`, then calls `thread.join()` (`:1162`) on the thread that is still stuck inside the driver's open. Callers hold `lock(&state.session)` (`:1226`) or `lock(&state.stream)` (`:1303`) for the whole call.

**Failure scenario:** A WASAPI or driver open hangs. This is common with a misbehaving USB interface or an exclusive-mode holder. Then:
- `start_live_capture` never returns, despite the "Timed out opening the audio input" path.
- Every call that locks the slot blocks: `live_capture_status` (polled every 1 s by `startLiveSession`), `capture::is_running` (used by `backup_restore`'s capture check), `stop_live_capture`, and `capture_preempt` for a live lease.
- Restore and preempt then hang as well.

**Root cause:** Joining the opener thread unconditionally on the timeout path. `audio_out.rs:1172-1175` (`CpalBackend::open`) correctly detaches instead.

**Minimal fix:**
- On timeout, set `stop` and return the error without joining. The thread exits by itself, because `ready.send` fails and the `while !stop` loop ends.
- Do the open before taking the session lock, then re-check the slot.

### BUG-06: Performance-counter paths are English-only

**Where:**
- `processes.rs:222-226`: `Get-Counter '\Process(*)\% Processor Time'`.
- `latency.rs:1724`: `'\Processor Information(_Total)\% DPC Time'` and `'% Interrupt Time'`.

**Failure scenario:**
- On German, French, Spanish and other localized Windows, the counter object and counter names are localized (for example `\Prozess(*)\Prozessorzeit (%)`), and English paths are rejected. With `$ErrorActionPreference='SilentlyContinue'` the script prints nothing.
- `top_cpu` then returns `[]`, or `Err("process failed: ")` with an empty reason.
- `windows_tuning_scan.backgroundApps` and the DPC proxy come back empty, so the FS-11 "background CPU" and "DPC" checks pass vacuously.
- The `powercfg` parsing next to them was made locale-proof (`latency.rs:1555`); these counters were not.

**Minimal fix:**
- Resolve counter names from their English index: either read the `Perflib\009` counter IDs and map them through `CurrentLanguage`, or use `Get-CimInstance Win32_PerfFormattedData_PerfProc_Process` and `Win32_PerfFormattedData_Counters_ProcessorInformation`, whose class and property names are not localized.
- Report "unavailable", not an empty list, when the query yields nothing.

## Low

### BUG-07: The diagnostics bundle bypasses the DB gate

**Where:** `diagnostics.rs:1024-1030` `open_db_readonly` calls `Connection::open_with_flags` directly. Every other open goes through `db::open_database`, which holds the gate read guard that restore waits on (`backup.rs:931`).

**Failure scenario:** The user exports a support bundle while a restore runs. Two outcomes are possible:
- On Windows, the open handle makes `swap_in`'s rename fail ("Could not move the current database aside"), and the restore rolls back.
- The bundle reads serials or run counts from a file that is being swapped.

**Fix:** Take `db::gate().read()` for the lifetime of that connection, or build the bundle through `open_database`.

### BUG-08: Stale MIDI connections survive unplug

**Where:** `midi.rs:133-136` (`midi_open_input` returns `Ok` when the name is already in the map) and `midi.rs:165-175` (`midi_send` reuses the cached output).

**Failure scenario:**
- A controller is unplugged and replugged. Opening its input returns OK, but the dead midir connection never delivers messages, so the MIDI test shows no input.
- Every `midi_send` keeps failing until `midi_close_all`.

**Fix:**
- On a send error, remove the output from the map and retry once.
- On `midi_open_input`, check whether the port still exists in `mi.ports()`, and reconnect if the cached connection's port is gone.

### BUG-09: Bounded-capture preempt can leave two captures on the device

**Where:** `capture.rs:1410-1421`. After `BOUNDED_STOP_WAIT` (5 s), `preempt_blocking` releases the bounded lease even if the capture has not noticed the cancel.

**Failure scenario:** `capture_blocking` is still inside `choose_input`, `pick_config_for_pairs` or `build_input_stream`, none of which poll `cancel`. The preempting feature then opens the same device while the bounded stream starts.

**Fix:** Keep the lease until the bounded guard drops. Return a "still stopping" error to the preempter instead, or poll `cancel` between the setup steps.

### BUG-10: The tuner silences the user's tone before learning whether it may run

**Where:** `latency.rs:2074` and `latency.rs:2097` call `audio_out::global().stop_all(EndReason::Replaced)` before `begin()` (LATENCY_BUSY) and `LeaseGuard::acquire` (CAPTURE_BUSY).

**Failure scenario:** While the Feedback step test runs (its stream holds the lease), pressing "Measure" on the latency screen returns CAPTURE_BUSY. The feedback tone has already been faded out, so the user's test loses its stimulus even though the tuner never ran.

**Fix:** Stop the global voice only after the lease and the run slot are acquired.

### BUG-11: Usage timestamps are compared as text across two shapes

**Where:** `usage.rs:51-71` accepts both `YYYY-MM-DDTHH:MM:SSZ` and `…SS.fffZ`. `usage.rs:153-166` filters with `started_at >= ?2` and orders by `started_at` as text.

**Failure scenario:** `.` (0x2E) sorts before `Z` (0x5A). An entry at `20:00:00.500Z` is excluded by `since = 20:00:00Z` and sorts before an entry at `20:00:00Z`.

**Repro test:** `audit_repro::bug11_since_filter_keeps_later_entries_with_milliseconds`.

**Fix:** Normalise to one shape (always `.fffZ`) in `validate`/`add` and in `list(since)`, or compare with `julianday()`.

### BUG-12: UTF-16 logs over 2 MiB yield nothing

**Where:** `dj_sessions.rs:137-146` `read_tail` and `system_check.rs:1034-1050` `read_tail_text`. Both seek to `len - 2 MiB`, so the BOM is skipped (and the seek can land on an odd byte). `decode_text` then falls back to lossy UTF-8 on NUL-interleaved text.

**Failure scenario:** A UTF-16LE DJ log or WER text over 2 MiB produces no session spans and no matched lines, silently.

**Repro test:** `audit_repro::bug12_large_utf16_log_still_yields_spans`.

**Fix:**
- Sniff the BOM from the first bytes of the file before seeking.
- For UTF-16, round the seek to an even offset and decode as UTF-16.

### BUG-13: `playStereo` has no output cap

**Where:** `app/ui/audio-io.js:471-485`.

**Failure scenario:** `audio-out.js:12` documents "FS-01 keeps WebAudio `playStereo` with a local −12 dBFS clamp", but `playStereo` copies samples to the output unchanged. Its only caller today (calibration) builds stimuli at or below −12 dBFS from a fixed `<select>`. Any future caller, or a stimulus bug, plays at full scale, outside every Rust safety rail.

**Repro test:** `tests/audit-repro/output-cap.test.mjs`. A 0 dBFS buffer reaches the output at 0 dBFS.

**Fix:** Scale or clip to `ABS_MAX_AMP` in `playStereo`, for example with a `GainNode` plus a hard clip of the copied data.

### BUG-14: Bounded capture misreports device loss

**Where:** `audio.rs:446-484`. Device errors are pushed to `errors`, but `done_tx` never fires. `wait_for_capture` then returns "Timed out before the requested audio capture completed." after `duration + 2` s, and `waited?` returns before the collected `errors` are read.

**Failure scenario:** Unplugging the interface mid-check shows a timeout instead of "device disconnected". `classifyCaptureError` maps that to the generic stream failure.

**Fix:**
- Have the error callback signal a second channel (or a flag that `wait_for_capture` polls).
- Include `errors` in the `Err` message.

### BUG-15: Live capture reserves its whole maximum up front

**Where:** `capture.rs:327-333` (`Vec::with_capacity(max_frames)` for left and right of every pair) and `capture.rs:1189-1191` (`max_frames = rate × max_seconds`, with `max_seconds` up to 1800).

**Failure scenario:**
- One pair at 48 kHz for 1800 s reserves 691 MB before the first sample arrives.
- 32 pairs at 192 kHz would reserve about 88 GB.
- An allocation failure calls `handle_alloc_error` and aborts the process. No panic hook runs, and the capture lease and backups are left as they were.
- UI callers pass small values today, but the IPC accepts the maximum.

**Fix:** Grow the vectors on demand (`reserve` in chunks) and cap `max_frames × pairs` against a byte budget.

---

## Suspected but unconfirmed

- **S1:** `Engine::play` (`audio_out.rs:849-861`) holds the `active` mutex across `backend.open` (up to `OPEN_TIMEOUT` = 10 s). `audio_stop_all` (Esc) blocks for that long while a device open hangs. Nothing is audible then, because the old voice was already torn down, so I could not tie it to a safety failure.
- **S2:** On timeout, `system_check::run_with_timeout` (`:176-213`) kills PowerShell but does not join the reader threads. If PowerShell leaves a grandchild holding the pipes, those threads leak. I did not find a concrete grandchild.
- **S3:** `tasklist` writes in the OEM code page, but `decode_text` assumes UTF-8. Non-ASCII image names are mangled (U+FFFD). The known DJ exe names are ASCII, so detection is unaffected.
- **S4:** `ui/screens/calibration.js:244-247` `dispose()` nulls `state.session` while `runLoopback` awaits playback. `await state.session.stop()` then throws a TypeError, which is shown as a generic "Capture failed". The host dialog is closing at that point, so the user-visible impact is unclear.
- **S5:** `catalog::delete` (`catalog.rs:400-406`) hard-deletes a setup that sessions still reference (no `ON DELETE` action). The user sees the raw "FOREIGN KEY constraint failed" text.
- **S6:** `audio_out::build_output` grows its scratch buffer inside the audio callback when the device enlarges its period (`audio_out.rs:1086-1088`). This is a rare allocation on the real-time thread, already documented as such.

## Reproduction tests

| Bug | Test | How to run |
|---|---|---|
| BUG-01 | `src-tauri/src/audit_repro.rs` `bug01_resaving_a_run_keeps_its_repeat_scan_alignment`, `bug01_resaving_a_run_keeps_usage_links` | `cd src-tauri && cargo test --lib audit_repro -- --ignored` |
| BUG-11 | `audit_repro::bug11_since_filter_keeps_later_entries_with_milliseconds` | same |
| BUG-12 | `audit_repro::bug12_large_utf16_log_still_yields_spans` | same |
| BUG-02 | `tests/audit-repro/capture-ownership.test.mjs` | `AUDIT_REPRO=1 node --test tests/audit-repro/*.test.mjs` |
| BUG-13 | `tests/audit-repro/output-cap.test.mjs` | same |

- The Rust repros are `#[ignore = "BUG-nn: …"]` in a module registered only under `#[cfg(test)]` (`lib.rs`, after `mod humrun;`).
- The JS repros pass `{ skip: 'BUG-nn: …' }` unless `AUDIT_REPRO` is set. They also sit outside the `npm test` glob (`tests/*.test.mjs`).

**To un-skip a test once its fix lands:**
- Rust: delete its `#[ignore …]` line.
- JS: replace `{ skip: skip('…') }` with no options, and move the file to `tests/` so `npm test` picks it up.

Bugs without a test are BUG-03 to BUG-10, BUG-14 and BUG-15. They depend on global panic hooks, real devices, Windows locales, process-wide engines or the IPC runtime, and I could not exercise them deterministically in a unit test without changing product code.
