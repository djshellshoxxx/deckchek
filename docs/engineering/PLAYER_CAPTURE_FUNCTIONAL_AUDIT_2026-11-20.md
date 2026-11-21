# Player capture and usage continuation functional audit — 20 November 2026

Worker: `/root/player_functional`. This initial bug-hunt/functional lane started
after all six redaction workers finished. Dates use America/Los_Angeles;
retained execution timestamps use UTC. This lane was the sole project runtime
executor while root owned production UI changes and the other reviewers read
source statically.

## Disposition

**Focused Node acceptance passed: 77/77 checks, including 16 new real-screen
lifecycle cases. The exact usage-ledger #70 candidate separately passed its
actual Node file, 22/22.** No new production blocker was found in these bounded
functional selections, and this worker changed no production file.

Two qualification limits remain material. The prior full-suite cubic THD failure
is still unexplained; bounded diagnostic successes do not clear it. The authored
rendered player smoke could not start Chromium because a host socket operation
was denied. No browser page or flow executed, no screenshot was produced, and
no browser-layout, native-binary, hardware or scientific acceptance is claimed.

## Exact source identities

| Role | Commit | Tree |
| --- | --- | --- |
| Assigned consolidation; audio diagnosis source | `3d0667bbefae56701edf1e543b2a06876e8ac054` | `3ccdec9c3c7dce2827009ae5206603248122b63e` |
| Usage candidate, actual Node execution | `b8dfc126c2480f303df105abd3759fedae49a192` | `a0660644f2e7d996817f0c76a004be95b37d3317` |
| Root's combined player production freeze | `aabcd886667ed4116fecb725c532eabcc7d485d6` | `ed86cf0d14508d4c9e42c84bf0c79e7f01e523fe` |
| Production plus new maintained Node tests, executed | `d785e706a354512e4cd9c8855c868f600de07a78` | `4ebca0206138fefa528a8da1db89edbc02076afd` |
| Added browser-smoke source, launch attempted | `09f6e5db3b24f190642f07a2649fcf64036f0518` | `9402f8f8dd921e23fda08c218fa86d830fc43ac2` |
| Final maintained test/smoke source | `2cb1aec7b1bdd4169b08aed57689eb7e937173c3` | `816bf89effa0b238d1620beec7aaf8c6ec51d27a` |

The assigned source has exactly the same non-documentation Git entries as the
failed redaction full-suite source `6f414a4` / `7dfe29d`. Later root source adds
the independently prepared #70 change and player UI. Every production path in
the final test freeze matches root's `aabcd886`; every maintained Node-test path
matches executed `d785e706`. Only the new smoke file differs after that Node run.
Full comparisons are retained in [source-binding.json](evidence/player-capture-functional-2026-11-20/source-binding.json).

## Bounded audio failure investigation

I read the prior [functional acceptance](REDACTION_FUNCTIONAL_ACCEPTANCE_2026-11-20.md)
and complete failed and narrow passing records. The original serial full run
recorded 2,314 total / 2,312 pass / one failure / one optional skip. Its cubic
THD assertion reported `16972224339301138 vs 4.347826086956522`. Its authorized
unchanged-source narrow rerun passed 15/15. Those historical records are retained
unchanged and remain attributed to the earlier executor.

The inspected cubic fixture is deterministic, with the noise branch disabled.
The sine fitting, clock estimation and marker alignment paths have no wall-clock
input for that calculation. Inspection alone establishes no failure cause.
I applied the diagnostic workflow by adding one numerical-context log before
the original assertion in an external copy of the original test. Its import
was changed only to the absolute URL of the same frozen production module;
all original test bodies and assertions otherwise stayed intact.

| Diagnostic execution | Actual result | Recorded evidence |
| --- | --- | --- |
| Complete audio-quality file, diagnostic copy | 15/15 pass; exit 0; no skips/cancellations/TODOs; 1,853 equal tracked hashes. | [Result](evidence/player-capture-functional-2026-11-20/audio-context/result.json), [complete TAP](evidence/player-capture-functional-2026-11-20/audio-context/run.tap) |
| Original full-suite prefix: app-state, audio-out, same diagnostic copy | 33/33 pass; exit 0; no skips/cancellations/TODOs; same 1,853 equal hashes. | [Result](evidence/player-capture-functional-2026-11-20/audio-prefix-context/result.json), [complete TAP](evidence/player-capture-functional-2026-11-20/audio-prefix-context/run.tap) |

Both runs recorded the same successful cubic result: THD `4.3478%`, expected
`4.347826086956522%`, fitted amplitude `0.11499999804310879`, lag
`137.0000579604457` samples and clock estimate about `1.02e-10` ppm. Both channels
agreed. The complete context also records phase, DC, residual RMS and THD+N.
These are synthetic fixture observations, not hardware measurements.

The prior intermittent failure did not recur. There is no established root cause
or justified production repair. No scheduler, JIT, hardware or Fleet explanation
is inferred. I stopped after these two bounded executions: no further audio
retry, full-suite repetition, threshold relaxation, added skip or speculative
production change occurred. Their overlapping counts must not be added, and
neither turns the prior failed full run into a pass.

## Usage-ledger candidate #70

The isolated detached checkout at `b8dfc126` changes exactly
[`app/usage-hours.js`](../../app/usage-hours.js) and
[`tests/usage-hours.test.mjs`](../../tests/usage-hours.test.mjs) against main
`099c99c`. I inspected the actual helper, assertions and stylus caller paths.
The candidate records valid session IDs as proposals are added, preserves a
numeric-zero existing ID, and restricts the source lookup to the defined own
properties. It preserves interval priorities, time caps and unconfirmed policy.

The exact existing/new test file executed through the actual Node v24.22.3
runner: **22/22 pass**, exit 0, no timeout/skip/cancellation/TODO, with all
**1,655 tracked hashes unchanged** and clean boundaries. This is independent of
the scheduled author's earlier adapted V8 harness. It is not native bridge or
full combined-source acceptance. See the [actual result](evidence/player-capture-functional-2026-11-20/usage-node/result.json)
and [complete 4,072-byte TAP](evidence/player-capture-functional-2026-11-20/usage-node/run.tap),
SHA-256 `4fd37b909cdc66486c06c8a9b64b6c173a08b4f544887246c3887a2451615a1c`.

## Player screen functional evidence

The new [maintained test file](../../tests/player-capture-screen.test.mjs) invokes
the actual production screen's event handlers and lifecycle API. Normal result
and ownership cases use the actual `runCdjAcquisition`, with only time/UUID/wait
providers controlled and the native capture boundary modeled. The existing
`payloadToAudio` adapter produces the observation descriptors. A separate case
uses real native detection and the real shared pair picker with a seeded device
cache; unrelated device-list IPC is refused. Route-hide and feature-disable
cases use the actual shell and feature registry.

The 16 new cases cover:

- Desktop-only capture refusal even when the disabled handler is invoked.
- Invalid duration before capture, bounded capacity and selected-pair forwarding.
- Operator assertions and requested values kept separate from actual native
  observations, nominal rate, sample-derived duration and unknown fields.
- Metadata-only serialization delivered to the modeled save callback, empty raw
  references, no audio member and unverified/report-ineligible qualification.
- Explicit capture fault counters without a qualified measurement.
- Frozen device/pair/operator request values despite later control changes.
- Cancel, late start, route hide, actual feature disable, preemption, input loss,
  busy-input failure and disposal releasing or refusing owned work correctly.
- Obsolete phase/result delivery after hide/show cannot publish/export stale data;
  clear removes completed metadata and a disposed screen cannot restart.

The DOM is modeled for element identity, handlers and ownership; those checks
do not qualify browser layout, browser event defaults or actual desktop drivers.
The save callback inspects the actual serialized data, but it is not a real
download. The authored browser smoke below covers that boundary when runnable.

The one focused invocation selected `player-capture-screen`, `features`,
`cdj-acquisition`, `cdj-evidence-record` and `usage-hours`, serially on Node
v24.22.3. It passed **77/77**, exit 0, no timeout/skip/cancellation/TODO, with
all **1,856 tracked hashes unchanged** and clean boundaries. The
[result metadata](evidence/player-capture-functional-2026-11-20/player-focused-initial/result.json)
retains exact arguments and timestamps. The [complete TAP](evidence/player-capture-functional-2026-11-20/player-focused-initial/run.tap)
is 16,678 bytes, SHA-256
`ceaf02eaa29cbbbc3048d2c8994e2a018ee85efd17212c3d1f73087a0f4e9588`.
This selection overlaps the 22 usage cases above and existing acquisition tests.

## Rendered smoke authored; local launch blocked

The new [player smoke](../../tools/smoke/player-capture.mjs) is auto-discovered by
the unchanged UI runner. It uses existing helpers and the public Options →
Experimental features controls, default-off route, persisted opt-in and native
unavailable state. Its native-mode portion uses the production screen/controller/
live adapter over a lease-bound synthetic Tauri fixture, and checks real Blob
download content, Escape, navigation, disable and mobile overflow. It requests
desktop/mobile setup and result screenshots. These are authored checks, not
reported browser successes.

Installed Playwright **1.62.1** and system Chromium **156.0.8078.79** were found;
no browser installation/download was attempted. The single actual invocation was
`node tools/ui-smoke.mjs player-capture` with the installed module path and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. It discovered the module,
then Chromium aborted before any page or module body executed:

```text
process_singleton_posix.cc:297: socket() failed: Operation not permitted (1)
```

The runner exited 1 without timeout; all **1,857 tracked hashes remained equal**.
There was no UI check summary and **zero screenshots**. The complete
[7,515-byte log](evidence/player-capture-functional-2026-11-20/player-smoke/ui-smoke.log)
has SHA-256 `0a7d0bc6851356cf08fa1d44fea918b671749022cb7de09ce50ca327d3b0887f`;
[metadata](evidence/player-capture-functional-2026-11-20/player-smoke/result.json)
records the exact source, environment and empty screenshot inventory. No
permission workaround, launch retry or causal inference about application code
followed. The environment error establishes neither application failure nor
credit exhaustion.

After static review, dependent mock initializers were put into one init script
at final `2cb1aec`. Node `--check` passed for that smoke file; this establishes
syntax parsing only. It does not qualify the unexecuted flow. Production and
the already executed maintained Node-test bytes are unchanged.

## Integrity and handoff

The [static verifier](evidence/player-capture-functional-2026-11-20/verify-source-maps.py)
checked every before/after map for all five executions, exact Git path inventories,
source/tree identities, complete log lengths/hashes and each recorded input hash
against immutable Git blobs. All five maps match their respective source trees;
**1,786 distinct Git blobs** were hashed. The [verification record](evidence/player-capture-functional-2026-11-20/source-map-verification.json)
and [digest ledger](evidence/player-capture-functional-2026-11-20/SHA256SUMS) are retained
with the exact executed recorder scripts. No application code runs in the verifier.

This lane owns only the two new test/smoke paths, this report and its evidence.
No production file, prior threshold/assertion/skip, native command, permission,
feature default, workflow or qualification branch was changed. No native build,
hardware capture, scanner, exploit, adversarial probe or vulnerability
reproduction was performed. No project runtime process remains active.

Root can consolidate this source/evidence with completed code/security handoffs
and give the resulting fixed source to fresh workers. The fresh full suite and
applicable exact-source hosted rendered/native gates remain necessary. Preserve
the original audio failure, local launch failure, prior Fleet failures and fixed
heads. Keep issue #69 open, Fleet off, and CDJ scientific/physical, raw/reference
retention, History and report qualification separate from this provisional UI.
