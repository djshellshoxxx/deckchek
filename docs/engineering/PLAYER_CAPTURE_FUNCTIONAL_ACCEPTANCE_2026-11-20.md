# Player capture and usage — fresh functional acceptance, 20 November 2026

Reviewer/executor: `/root/player_functional_fresh`. This independent lane began
after the three initial player code, functional and defensive workers completed.
It was the sole local project runtime executor during this fresh review. Report
dates use America/Los_Angeles; execution timestamps below use UTC.

## Disposition

**The exact combined freeze passed its first complete serial JavaScript run: 2,332 total / 2,331 pass / zero failures / one optional Mixxx skip, exit 0.** No timeout, cancellation or TODO occurred. No new functional blocker was identified in this bounded acceptance.

This accepts the bounded JavaScript functionality exercised at the exact combined
freeze. It does not establish rendered browser, native/platform, physical-audio,
scientific or release qualification. The earlier Node 24 cubic-THD failure is
still unexplained; this first full result is additional evidence, not a cause
or an audio repair. No application, test, threshold, assertion, skip, workflow,
permission or native source was changed by this lane.

## Source binding

| Role | Exact identity |
| --- | --- |
| Executed combined commit | `f081881d4979e4385f255163660258784e27a264` |
| Executed complete tree | `39d4351da05fc1fc65f555874824555d96df5cd3` |
| Isolated execution branch | `review/deckchek-player-functional-fresh-20261120` |
| Production comparison | `app`, `src-tauri`, `database` and `.github` have no differences from reviewed production `aabcd886667ed4116fecb725c532eabcc7d485d6`. |
| Maintained tests/tools comparison | `tests` and `tools` have no differences from final initial source `2cb1aec7b1bdd4169b08aed57689eb7e937173c3`. |
| Usage candidate comparison | Both `app/usage-hours.js` and `tests/usage-hours.test.mjs` equal original candidate `b8dfc126c2480f303df105abd3759fedae49a192`. |
| Audio comparison | `app/audio-quality.js` and its original fixture equal the earlier failed source `6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6`. |

I read the [initial handoff](PLAYER_CAPTURE_INITIAL_HANDOFF_2026-11-20.md),
[initial code audit](PLAYER_CAPTURE_CODE_AUDIT_2026-11-20.md),
[initial functional audit](PLAYER_CAPTURE_FUNCTIONAL_AUDIT_2026-11-20.md) and
[initial defensive audit](PLAYER_CAPTURE_SECURITY_AUDIT_2026-11-20.md), then
independently inspected the actual combined source and retained evidence. The
three original report hashes match the fixed handoff. The
[static verification record](evidence/player-capture-acceptance-2026-11-20/evidence-verification.json)
records the comparisons and independently rechecked evidence.

## First and only complete fresh execution

| Recorded property | Actual result |
| --- | --- |
| Runtime | Node `v24.22.3`, Linux x64; exact executable `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` |
| Selection | All **191** discovered top-level test files, serial |
| Counts | **2,332 total; 2,331 pass; 0 fail; 1 skip; 0 cancelled; 0 TODO** |
| Exit / timeout | **0 / false** |
| Started UTC | `2026-11-21T06:36:00.862387+00:00` |
| Completed UTC | `2026-11-21T06:42:22.067000+00:00` |
| Recorder elapsed / TAP duration | `381.20458830499956` seconds / `381102.691813` ms |
| Source integrity | **1,892** tracked file hashes equal before/after; exact HEAD/tree and clean status preserved |
| Complete raw TAP | **534,094 bytes**, SHA-256 `253caf6728565590e5f7ffab76287776a6cedcecbba3ffe8ecb88fcb9c423bc1` |

The sole skip is the pre-existing optional local Mixxx controller corpus check:
`MIXXX_CONTROLLERS_DIR not set`. No new skip was added. The original cubic
nonlinearity case passed in this run. That observation does not establish the
cause of its earlier failure.

The [executed recorder](evidence/player-capture-acceptance-2026-11-20/execution-driver.py)
discovers the regular top-level `tests/*.test.mjs` files, verifies that every
selected path is tracked, sorts them lexically, and runs them once using
`--test --test-concurrency=1 --test-reporter=tap`. The
[complete metadata](evidence/player-capture-acceptance-2026-11-20/full-suite.json)
retains the exact argument list, safe runtime details, dates, exit status,
timeout limit, complete result counts and source boundaries. The
[complete raw TAP](evidence/player-capture-acceptance-2026-11-20/full-suite.tap)
is preserved without editing or trimming. There was no repeated or narrowed
project run by this fresh worker.

All execution output and the exact driver remained outside the checkout until
the full process ended and both source snapshots were taken. HEAD/tree and
tracked bytes stayed unchanged; the checkout was clean before and immediately
after execution. Only this report and its owned evidence were then added.

## Independent functional inspection

I read the complete [production screen](../../app/ui/screens/player-capture.js),
[maintained screen tests](../../tests/player-capture-screen.test.mjs), final
[browser smoke](../../tools/smoke/player-capture.mjs), usage implementation/tests,
app/feature/CSS registration and relevant existing shell, pair-picker, download,
capture adapter and acquisition contracts. The new screen has production
defaults for `runCdjAcquisition`, `startLiveSession`, `isNative`, local download
and the shared pair picker. The test seams do not replace these defaults in the
app route.

| Functional boundary | Independent finding and actual coverage |
| --- | --- |
| Public route and opt-in | The real app registers `player-capture`; the shell enforces `playerCapture`, default off and marked Proposed. Existing feature metadata/default assertions remain strict. Actual public browser opt-in and rendered rail behavior still need the authored hosted smoke. |
| Input validation and request | The start handler refuses unavailable native capture, hidden/disposed state, an existing request and duration outside 1–30 finite seconds. It snapshots operator/device fields and copies the selected pair before awaiting. Maintained cases inspect real-controller arguments and later selection changes. |
| Capture ownership | Existing acquisition owns one session. Maintained cases drive real acquisition through cancel, delayed start, preemption, input loss and busy-input errors. Screen handlers do not automatically preempt another owner. |
| Lifecycle | Actual shell navigation and feature disablement reach `onHide`. Active-request identity, abort, visibility and disposal guards suppress obsolete phases and late results. Clear/dispose cases verify unavailable export and no restarted disposed view. |
| Observations | Requested input/pair/duration and entered settings stay distinct from observed native fields. Existing adapter provenance prevents compatibility defaults from appearing as observations; missing rate/device/counters remain unknown. Sample-derived duration remains frames divided by nominal rate. |
| Result and export | The screen retains only acquisition/record metadata and explicitly serializes those fields. Cases inspect actual serialized output passed to the modeled save callback, empty raw references, no audio member, null measured frequency and unverified/report-ineligible qualification. This is not an actual browser download. |
| Default dependencies | A maintained case uses production native detection and the real shared pair picker with a seeded device cache, while native capture and local save remain modeled. It verifies the selected pair reaches real acquisition. |

The 16 maintained screen cases are part of this complete run, alongside the
existing acquisition, evidence, feature, usage and other JavaScript files. The
screen cases use modeled DOM/native boundaries, controlled time/wait/UUID
providers and synthetic audio. They establish these tested lifecycle and data
contracts, not browser layout, accessibility, physical captures or native driver
behavior. Static source inspection separately confirms text-node rendering and
the scoped hidden-section style; it does not convert those into rendered tests.

The incorporated [usage helper](../../app/usage-hours.js) marks a session ID seen
only after adding a valid proposal, keeps numeric-zero IDs in its pure-helper
deduplication, and excludes inherited source names at its three own-property
checks. Its 22 existing/new cases are included in this full run. The actual
native boundary still requires string IDs/sources. This is batch/supplied-snapshot
deduplication, not database-wide uniqueness or complete malformed-object schema
validation. No stored-user data incident is established here.

## Evidence integrity and retained previous outcomes

Every fresh before/after entry was matched to the immutable executed Git tree,
not only compared with the other map. The independently verified initial five
run maps account for **1,786 distinct Git blobs**;
all five plus this fresh full run account for **1,817 distinct blobs**.
All **26** initial evidence-ledger entries match their digests. These are
static integrity checks, not six newly executed project runs by this worker.

The [independent verifier](evidence/player-capture-acceptance-2026-11-20/verify-evidence.py)
reads Git trees/blobs and JSON/TAP/log files only; it imports or executes no
application or test. It verifies exact source inventories, immutable blob hashes,
before/after equality, log lengths/hashes, parsed result counts, report hashes,
source comparisons and the fresh test selection. The complete
[before map](evidence/player-capture-acceptance-2026-11-20/tracked-before.json) and
[after map](evidence/player-capture-acceptance-2026-11-20/tracked-after.json),
[initial running metadata](evidence/player-capture-acceptance-2026-11-20/full-suite-running.json)
and [digest ledger](evidence/player-capture-acceptance-2026-11-20/SHA256SUMS) are
retained with the raw result.

The original redaction full run remains **2,314 total / 2,312 pass / one failure /
one optional skip**, exit 1, with the cubic-THD assertion
`16972224339301138 vs 4.347826086956522`. I independently verified its complete
[failed TAP](evidence/redaction-acceptance-2026-11-20/full-suite.tap) SHA-256
`39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197` and its separate
[authorized narrow rerun](evidence/redaction-acceptance-2026-11-20/audio-quality-rerun/audio-quality-rerun.tap)
SHA-256 `c8ee666590df3f24c0bb0eff784e71e0305b1247b4d1dac90d233c213847b06e`.
Both remain unchanged in this combined freeze. The new full run does not explain
why the earlier result failed; issue #72 remains open as an unresolved cause.

The initial 77/77 focused player selection, 22/22 exact usage-candidate run,
15/15 instrumented audio selection and 33/33 audio-prefix selection remain
separate overlapping observations. Their counts are not additive, and none is
relabelled as this fresh full run. No audio production patch, altered assertion,
threshold relaxation or new skip was made. The prior hosted Node 22 result on
draft #71 concerns its earlier source and runtime, not this later UI freeze.

## Browser/native limits and handoff

The initial browser smoke attempted at `09f6e5db` failed during Chromium launch
with `socket() failed: Operation not permitted (1)`, before any page or smoke
module body ran. The complete existing raw log, exit 1, empty check-summary and
empty screenshot inventories were independently checked. This fresh worker
performed **no Chromium retry, installation, restriction workaround, browser
page execution or screenshot capture**.

The final maintained smoke at `2cb1aec` puts the shared Tauri mock and dependent
player adapter in one ordered initialization script. Its earlier Node syntax
check establishes parsing only. I inspected that final source and the unchanged
auto-discovery mechanism; the authored public opt-in, layout, accessibility,
actual Blob-download, cancellation and mobile checks remain unexecuted locally.
Even their future modeled-native success will not qualify real hardware.

Applicable exact-source hosted rendered-UI, Rust/native and platform packaging
gates remain separate and pending for this successor. No native toolchain or
desktop SDK was installed or invoked by this worker. Raw/reference retention,
pitch-measurement integration, persistence/report wiring and scientific/physical
characterization remain unfinished under [SPEC-10](../SPEC-10-CDJ-media-player-diagnostics.md).
The screen clears captured result metadata when hidden; operator form values may
remain. Metadata can include entered text, device names and driver messages;
metadata-only does not establish redaction or secure memory erasure.

Issue #69 and Spec 02 AC-6 remain unchanged, as do the earlier Fleet timing
failures/fixed diagnostic evidence and Fleet's default-off setting. This lane
made no remote mutation, security probe, scanner run, release or deployment.
Root retains integration and exact-source hosted qualification ownership. No
project runtime process remains active after the recorded full run, and this
lane adds only the assigned report/evidence paths. Rebind runtime acceptance if
application/test/tool bytes change after the executed freeze.
