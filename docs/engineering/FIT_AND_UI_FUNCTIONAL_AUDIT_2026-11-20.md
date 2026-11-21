# Fresh fit trace and UI functional audit

Audit round label: **2026-11-20**. Actual checks in this worker ran on **2026-11-21, 08:04–08:16 UTC**; the immutable execution records contain precise timestamps. Worker: `/root/fit_functional_round3`, the sole project runtime executor for this round. Code and security workers reviewed source and retained output independently.

## Disposition

The focused patched-source selection passed **82/82**, and the two new/modified browser smoke modules passed syntax checks. The reviewed disposable-copy audio observation then passed the actual original two-file **33/33** selection. Its 527 events show no observed fundamental-fit field/identity transition, tone-slice change, or entry-to-return full-input change in this execution.

**The earlier audio failures remain unresolved.** This diagnostic did not capture a failing raw fit. It changes observation context and cannot qualify the untouched source, identify a solver/aliasing/mutation/runtime cause, or justify a numerical repair. The original failing full suite and two-file outputs remain intact. No browser retry, native run, broad suite, extra audio invocation, optimization experiment, production numerical change, assertion/threshold change, or feature-default change occurred in this lane.

The deliverable is three maintained opt-in diagnostic tools plus the complete evidence below. Toolbar/guide and ledger changes were already authored by root and are only reviewed/tested here. No production or original test file changed in this worker's source checkout.

## Source and execution identity

| Stage | Commit | Tree | Tracked files |
| --- | --- | --- | ---: |
| Focused patched-source check and smoke syntax checks | `eafaa53ade2b626a1817792dbab36a2b95dedd58` | `a7ba52d1208efa0818841b46a2c8dc5351e8e967` | 2,036 |
| Frozen tools and disposable-copy preparation/trace | `f3a8a5d551d35941d3258feb34f6b2dd1bba1e3f` | `78c92aad0b1e26755d1e11e4ff1c2c0bd25bf9e8` | 2,039 |

The descendant adds only `tools/diagnostics/audio-fit-prepare.py`, `audio-fit-recorder.mjs`, and `audio-fit-run.py`. Production, original tests, and smoke modules are byte-identical to the eafaa53 freeze. The copy was materialized from the exact f3a8a5d committed tree and checked against every committed Git blob before transformation. The only disposable-copy delta is thirteen additive lines in `app/audio-quality.js`; reversing them restores the original bytes exactly.

The source checkout is `/workspace/scratch/6f2247f2f463/deckchek-fit-functional`. The instrumented copy is `/workspace/scratch/6f2247f2f463/deckchek-audio-fit-disposable-20261120`. Output was written outside both directories and copied into the owned evidence directory only after all runtime work finished.

All shell commands used Bash with `login:false`. All Node invocations used exactly `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`, reported **v24.22.3**, and required `NODE_OPTIONS` to be absent. Complete Node component versions, absolute executable paths, Python version, argv, timestamps, diagnostic environment, statuses, and full before/after hash maps are retained. Source and disposable inventories remained unchanged during execution.

The driver added no engine/optimization switches. The two children reported **expanded runtime settings in `execArgv`**, preserved verbatim in their trace headers. Those fields are distinct from the exact parent argv and `NODE_OPTIONS:null`; this report does not claim empty or flag-free child arguments and does not infer a runtime cause from them.

## Focused functional verification

The early code review found no material source blocker in root's toolbar/guide correction `0d87fd3ae41f184d76b340048f2cd52fc8c0dc1d` or preset correction `1df0d9f29f60eaf7d860b37cd227566b858f38b7`. The security review independently checked the preset restoration/export callers and static guide DOM construction. Their implementation scope is documented in [NARROW_TOOLBAR_IMPLEMENTATION_2026-11-20.md](NARROW_TOOLBAR_IMPLEMENTATION_2026-11-20.md) and [LEDGER_PRESET_IMPLEMENTATION_2026-11-20.md](LEDGER_PRESET_IMPLEMENTATION_2026-11-20.md).

One actual six-file selection ran at the patched eafaa53 source:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/player-capture-screen.test.mjs tests/player-reference-file.test.mjs tests/ledger-preset-boundary.test.mjs tests/ledger.test.mjs tests/ledger-ui.test.mjs tests/features.test.mjs
```

It exited zero: **82 tests, 82 pass, zero fail/cancel/skip/todo**, 1.58910892 seconds including driver bookkeeping. All 2,036 tracked-file hashes matched before/after. No dedicated shell/shortcut test file existed; the selected real player-screen tests exercise lifecycle and shell integration, while `features.test.mjs` checks default-off contracts. No nonexistent test name or broader selection was substituted.

The checks cover player lifecycle/cancellation and stale-result suppression, selected-reference metadata/digest boundaries, actual preset-name guards and restored-rule editing, existing ledger privacy/export behavior, ledger UI/bridge contracts, and feature defaults. The new preset boundary tests ran against the corrected implementation only. There was no vulnerable-baseline probe.

The new primitive-string/own-key preset guard preserves declared Public/Insurance/Private behavior, complete Public defaults for invalid names, explicit valid overrides, and the Custom label semantics. Existing export/privacy cases and the two patched boundary cases passed. This observation is a functional check of the correction, not a claim of a previously demonstrated disclosure incident.

**Reporter provenance:** Node used its **spec** reporter for this command. The inherited generic recorder named stdout `run.tap` and only parsed TAP summary markers, so its original `tap_counts` is `{}`. The 8,257 first-output bytes remain unchanged. [focused/spec-summary.json](evidence/fit-and-ui-functional-2026-11-20/focused/spec-summary.json) separately parses the actual `ℹ tests/pass/fail` lines as 82/82. No rerun or replacement output was used to fill that metadata gap.

### Separate parsing checks

| Target | Source | Result | Meaning |
| --- | --- | --- | --- |
| `tools/smoke/shell-layout.mjs` | eafaa53 | `node --check`, exit 0; empty stdout/stderr | New smoke module parses |
| `tools/smoke/player-capture.mjs` | eafaa53 | `node --check`, exit 0; empty stdout/stderr | Modified smoke module parses |
| `tools/diagnostics/audio-fit-recorder.mjs` | f3a8a5d | `node --check`, exit 0; empty stdout/stderr | Recorder parses without import/execution |
| Disposable `app/audio-quality.js` | f3a8a5d copy plus reviewed additions | `node --check`, exit 0; empty stdout/stderr | Exact transformed source parses without import/execution |

Each parsing check has separate full source hash maps and execution metadata. The original smoke checks preserve 2,036-file maps; preparation checks preserve 2,039-file maps. Python tools and exact anchor counts were also read/parsed statically.

**Rendering remains unverified for the correction.** These checks do not execute the browser smoke assertions, establish mobile geometry, or demonstrate actual guide text in a browser. The existing Chromium socket-denial limitation was not retried or bypassed. The authored smoke's 320/420/800/1440-width control geometry and route-guide assertions still need an approved browser-capable environment on the corrected source. Earlier hosted baseline screenshots and PR #74 gates are not qualification evidence for this later correction.

## Reviewed disposable-copy audio observation

The retained [trace plan](evidence/fit-and-ui-functional-2026-11-20/trace-plan.md) describes the exact source, probes, bounds and first-run preservation policy. Both fresh peers and root approved these same source/tool hashes **before** execution. Their actual approval messages are retained in [trace-reviews.json](evidence/fit-and-ui-functional-2026-11-20/trace-reviews.json), also copied into the run output.

| Reviewed item | SHA-256 |
| --- | --- |
| Preparation tool | `85609f6778b1a38344ee20b0e6220f2bbd61bdfb70973f2c44f54a97749cac68` |
| Recorder | `2414c9d8692de394ef60e7390d14a79d1e6ee204e4ae80486c6c0028ca278adc` |
| Execution driver | `4daee499847e5b8c73971f5502076f1f5289ecc8e0741570bc1114fcc2c1c044` |
| Original analyzer | `4f4ed3df91d6b923f4fe7edaede0fbe2b4b3c300c0fc97d07dbfe7d510225db6` |
| Instrumented analyzer | `39e991b51ea11f3c63b3d7b4a4630f4900568703d8ca3b9cdb9069d404c51af8` |
| Exact additive patch | `efa78b2a673b33a3c194a035461f7af43cd5738e6de4c7a1adbeb1730853d7e8` |

The original numerical expressions, original reads, solver, `fitAt`, harmonic loop, calls, cases, ordering, assertions, tolerances and thresholds remain in place. No numerical value is normalized/clamped/replaced by the recorder, and no additional analyzer or fit is called. The maintained recorder is imported only from the transformed disposable source; production never imports it.

After the original shape/rate/finite guards, the recorder observes the actual full L/R inputs. It then observes each actual fundamental tone slice before fitting and the fit immediately after return, after cached tone RMS/initial THD+N, after harmonics, after low/high fits, and after channel metrics/phase. Later readouts observe the same fits after both channels, response-reference capture, response/crosstalk, hum calculation and successful return. The last event also hashes full inputs again.

Numbers are copied into decimal strings and IEEE-754 binary64 big-endian hexadecimal strings, including signed zero and nonfinite values. Each event is serialized immediately before the helper returns; later writes cannot rewrite earlier records. Object and backing-buffer IDs live in WeakMaps and are scoped to one child process. No properties are added to originals, and no inputs or fits are frozen. Actual typed-array `byteOffset`, `byteLength`, length, type and SHA-256 are retained. No waveform samples are output or strongly retained by the event list.

Each child writes a sanitized test-file/PID filename with exclusive `wx` and mode 0600 to the selected external directory. The bound is 8,192 events / 8 MiB of serialized records per child, with truncation/errors explicit. The existing runner finish aggregate is a **separate** comparator; it still retains fixture references until its after hook and still lacks imported-file input identity.

The approved parent invocation was exactly:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-concurrency=1 --test-reporter=tap tests/audio-quality.test.mjs tests/audio-runner-lifecycle.test.mjs
```

It ran once in the disposable copy. The runtime budget was 180 seconds, with TERM at 175 and KILL by 180 if required. It completed in **9.777194444 seconds**, exit 0, without timeout or stderr. All **33 original cases passed**, with no skip/cancel/todo. The entire before/after source and copy maps matched across all 2,039 files, and the disposable file inventory gained nothing. No subsequent project invocation occurred.

## Recorded scalar and identity evidence

| Observation | Quality child, PID 26 | Runner child, PID 34 | Total |
| --- | ---: | ---: | ---: |
| Retained events | 346 | 181 | 527 |
| Validated entries | 23 | 11 | 34 |
| Analyses reaching successful return | 19 | 10 | 29 |
| Fundamental channel fits | 38 | 20 | 58 |
| Fundamental fit snapshots | 380 | 200 | 580 |
| Actual tone-slice snapshots | 228 | 120 | 348 |
| Dropped/truncated/error records | 0 | 0 | 0 |

For every one of the 58 fundamental fits, all ten observed snapshots preserve the same object ID and all four field representations: amplitude, phase, DC and residual RMS. Fundamental IDs are unique across these channel fits within each process. Every channel's six actual slice snapshots preserve object ID, backing-buffer ID, byte range and digest; each backing-buffer ID matches its entry capture. All 29 completed analyses have equal full input records at entry and return.

The quality child has entry-only analyses 15, 16, 17 and 20; the runner has entry-only analysis 5. They return through original guards before the later probes. Their absence of return records is explicit and is not counted as a recorder error or proof of input state after that early return.

Read-only Python processing of the retained JSON checked **13,323 numeric decimal/binary representations**, with no inconsistency. Nineteen NaN snapshots occur in the intentional dead-channel quality case and remain represented as nonfinite values; they were not converted into passing numerical results. [observed-summary.json](evidence/fit-and-ui-functional-2026-11-20/trace/observed-summary.json) records every per-analysis check, and the retained processor imports no project code or audio calculation.

### Retry case

Runner analysis 3 is the third completed analysis and finish record, corresponding to the original retry-after-startCapture-failure case. It uses 48 kHz captures of 675,091 samples per channel. Full L/R digests match at entry and return and match the current delayed finish aggregate:

- L: `851d0bd53a969a6af4b6334256138ebf732496b67192b20919b09a6d7b26bd32`
- R: `488bc6ae51a99511d62a7913aa0f98c49c122fb988e4facae75429614c714f05`

The distinct full-channel digests are expected for this fixture's crosstalk sections. Both actual tone slices have 91,200 samples, byte offset 386,764, byte length 364,800, and SHA-256 `fb55a6e818eae817a75fc6f186b2edefe7528947b7c1ffab8bb4c7a5d74497c1`. The L/R fundamental fit object IDs are 36/40 in this child; their field values stay unchanged through all observed stages.

| Recorded quantity | Value in this trace |
| --- | --- |
| Fundamental amplitude, L and R | `0.09999999824731663` (`3fb9999992128117`) |
| Fundamental residual RMS | `1.964967478271577e-9` |
| Cached tone RMS | `0.07071067687932045` |
| Initial THD+N | `0.0000027788837060987574` % |
| Harmonic squared-amplitude sum | `2.9099994988394117e-18` |
| Unrounded THD | `0.0000017058720939289583` % |
| Unrounded channel gain | `-1.5223614369119787e-7` dB |
| Unrounded channel SNR | `216.98969989112405` dB |
| Fundamental frequency passed to fit | `1000` Hz |
| Unrounded clock estimate | `1.0085882547153369e-10` ppm |
| Unrounded lag | `210.99999999855936` samples |

The final rounded balance, response-flatness and polarity values are all zero, and the finish status is pass with the original two-start/one-play/one-save counters. The very high SNR is an observation of this synthetic zero-noise fixture, not a physical-device result. [retry-snapshots.json](evidence/fit-and-ui-functional-2026-11-20/trace/retry-snapshots.json) retains all stages, binary representations and the finish record.

### Cubic case

Quality analysis 3 follows the first two clean/calibrated analyses in the unchanged original test order. The fundamental amplitude stays `0.11499999804310879`; residual RMS is `0.0035355335765397977`; cached tone RMS is `0.08131727845272191`. Harmonic sum is `0.00002499999534166654`, and the observed unrounded THD is **4.347825755868567%**, rounded to **4.3478%**. The original expected value/tolerance remains unchanged, and the original case passes. [cubic-snapshots.json](evidence/fit-and-ui-functional-2026-11-20/trace/cubic-snapshots.json) retains its complete observations.

### Separate finish comparator and earlier failure

The finish aggregate has ten records: eight live and two file inputs; eight statuses are pass, one intentionally faulted live status is unknown, and one intentionally altered imported-file status is fail. All ten returned measurement ID/value sets match their finish records in observed order. Those deliberate analysis statuses are compatible with all 33 test cases passing.

For all eight live rows, current entry/return hashes match the current delayed aggregate. The two imported analyses now have actual analyzer-entry/return buffer observations in the fit trace, while their separate finish-aggregate input fields correctly remain null. These are decoded synthetic test-buffer identities, not claims about original user file bytes or physical playback.

The earlier f26c247a run remains **33 total / 31 pass / 2 fail**. Its retry finish result had balance −220 dB, gain −110 dB, response flatness 220 dB, polarity 1 and THD 6,935,867,070.3903%. The new rounded values for those fields are zero. Earlier and current retry playback/counters and delayed input hashes match. **The old hashes were taken after the old suite; matching new entry hashes cannot establish old analyzer-entry identity retroactively.** The old run did not expose its fundamental fit fields, so these outputs do not demonstrate a transition of that old object. [prior-context-comparison.json](evidence/fit-and-ui-functional-2026-11-20/trace/prior-context-comparison.json) retains the exact comparison and limitations.

The earlier cubic failure, `16972224339301138 vs 4.347826086956522`, also remains preserved in [the prior full two-file TAP](evidence/audio-context-functional-2026-11-20/two-file-aggregate/run.tap). This passing instrumented cubic observation neither replaces it nor supplies the missing failing raw fit.

## Observation limits and remaining work

SHA-256 identifies bytes at the observed moments, not continuous immutability. Fit/scalar reads precede slice hashing, so records are sequential observations rather than atomic snapshots. Low/high fit objects are captured after their calls, but their input slice identities are not captured. No absent lag/clock/fit field from an earlier finish result is reconstructed.

The added import, WeakMap bookkeeping, field reads, synchronous hashing, scalar/JSON allocation, object escape and retained immutable strings change execution context. The separate finish collector additionally extends fixture/object lifetimes. Timing, allocation and optimization context can differ. Observed stable fields in this passing run do not disprove an intermittent defect elsewhere or establish that instrumentation fixed anything.

Root and both fresh reviewers independently checked the exact transformed bytes and the retained outputs. There is no evidence-based numerical production patch from this round. Any next audio diagnostic is a new root decision, not an implicit retry. This worker performed no further project execution.

Outstanding qualification remains concrete:

- Execute the authored toolbar/guide browser checks on the corrected source in an approved browser-capable environment; syntax checks do not establish layout or visible text.
- Preserve the reference/PDF full-suite hold from the earlier 2,357-case run with two failures and one skip. The 82 focused checks and 33 instrumented cases do not clear it.
- Keep the audio issue open until a failing raw fit or another independently justified correction explains the retained numerical failures.
- Route the already corrected ledger boundary and its passing focused evidence through root's normal review/integration decision. This lane does not close external issues or claim deployment.

Fixed PR #74/Fleet histories, feature defaults and original failure records were untouched by this worker. Root's separate PR #74 merge does not alter these source freezes or transfer its gates to later changes.

## Retained artifact index

All artifacts are under [evidence/fit-and-ui-functional-2026-11-20](evidence/fit-and-ui-functional-2026-11-20). `manifest.json` binds every retained evidence file, and `verify-evidence.py` checks the manifest and recorded map relationships without executing project code.

| Primary artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Focused first spec stdout, `focused/run.tap` | 8,257 | `e3c49de363d42265d611ecb3f87007524f942829f397ceb8b58817979ad22f5b` |
| Audio first TAP, `trace/run.tap` | 7,833 | `a2350ad1206ed2e12ae676d74db0257714db5bea563d8f2896e0005c99ce355a` |
| Quality child trace | 711,610 | `42f9abfad5942a9e3a61bf2437fd4f0fbb4db9a7c5a423eef918cde8120b84ac` |
| Runner child trace | 375,730 | `4d85b6c29dc9a62e6a9d3c0804bf2ac116054d2b4b4cb2dcde24037e36ace47f` |
| Separate finish aggregate | 142,590 | `a4367b57c241becb4e582be0b8d8f09562170010c41c655d3bbebf9c73d798da` |

The evidence includes exact driver/tool copies, whole original/instrumented analyzer sources and patch, preparation proof and full maps, pre-execution reviews, every raw stdout/stderr stream, runtime/environment metadata, full post-run maps, actual test order, fit/identity summary, selected complete case snapshots and the prior-result comparison. The original non-TAP focused output and all earlier failed audio artifacts are preserved without replacement.

Packaging note: `git diff --check` reports the literal space-prefixed blank context lines in the retained unified `.patch` as trailing whitespace when that patch is itself added as a new file. Those approved evidence bytes were preserved. The authored files pass the same check with only that raw patch artifact excluded.
