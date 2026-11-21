# CDJ-04 acquisition independent functional acceptance — 20 November 2026

Worker: `/root/cdj_acquisition_functional_acceptance`. The report date uses
America/Los_Angeles; exact execution timestamps retain UTC.

## Disposition and source boundary

**Accepted within the executed JavaScript integration scope.** One independent
focused run passed **56/56**, with no failures, skips, cancellations or TODO
results. All **1,643 tracked SHA-256 values remained unchanged**, and the
checkout was clean before and after execution. No additional functional blocker
was identified in the inspected single-pair acquisition slice.

| Role | Exact commit / tree |
| --- | --- |
| Frozen combined source independently executed | `55f7ea2c8759c985bbbd463f374ca2c78d99a669` / `54a86922bfd8cca87c076b755edd0b3432034aee` |
| Author's final implementation, retained unchanged | `3e7ae2d239686061a5056efb672be4ae135215e1` / `2ef190b0a9a4d94db0ab352ff784dd414c69f322` |
| Published QR predecessor retained in the combined history | `562609b4acc8bc24704cc864ef27c0b11c56bc00` |

The independent checkout is
`/workspace/scratch/6f2247f2f463/deckchek-cdj-acquisition-acceptance-functional`,
branch `review/deckchek-cdj04-acquisition-functional-acceptance-20261120`.
Source and tree identities were checked before and after the run. No additional
AGENTS.md was found in this checkout or its ancestors.

This worker read the [author report](CDJ04_ACQUISITION_FUNCTIONAL_AUDIT_2026-11-20.md),
[initial code audit](CDJ04_ACQUISITION_CODE_AUDIT_2026-11-20.md),
[initial defensive audit](CDJ04_ACQUISITION_SECURITY_AUDIT_2026-11-20.md),
[controller](../../app/player/acquisition.js),
[new regression file](../../tests/cdj-acquisition.test.mjs), and the relevant
[`payloadToAudio` adapter](../../app/ui/audio-io.js) source. Runtime verification
used the real adapter with ordinary synthetic capture fixtures and controlled
session/wait promises. No physical device was opened.

## Independent execution

Runtime: **Node v22.23.4**, using the exact executable
`/workspace/scratch/6f2247f2f463/toolchain/node_modules/node-linux-x64/bin/node`.
Its directory was placed first on PATH so any subprocess would use the same
runtime. The [execution record](evidence/cdj04-acquisition-acceptance-2026-11-20/focused.json)
retains the complete executable, argument array, working directory, timestamps,
source/tree identities, exit code, timing and integrity checks.

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/cdj-acquisition.test.mjs tests/cdj-evidence-record.test.mjs tests/cdj-pitch-display.test.mjs tests/capture-ownership.test.mjs tests/capture-pairs.test.mjs
```

| Observation | Independent result |
| --- | ---: |
| Test files | 5 |
| Total / passed | 56 / 56 |
| Failed / skipped / cancelled / TODO | 0 / 0 / 0 / 0 |
| Exit code | 0 |
| TAP duration | 464.570067 ms |
| Enclosing duration | 0.5166669330064906 s |
| Tracked files checked | 1,643; all hashes unchanged |
| Checkout state before / after | Clean / clean |

The run started at `2026-11-21T03:55:54.780881+00:00` and ended at
`2026-11-21T03:55:55.297569+00:00`. Both new JavaScript files also passed
`node --check`; the [syntax record](evidence/cdj04-acquisition-acceptance-2026-11-20/syntax.json)
preserves their exact commands, exits and output.

The scope contains seventeen acquisition cases, twenty-one existing CDJ
evidence/calculation cases, three existing capture-ownership cases and fifteen
pair-selection cases. This is one 56-case execution. Its subsets and the
author's earlier 56-case runs overlap and must not be added together. The
predecessor's earlier full-suite result retains its own source identity; no
unchanged broad suite or mobile generator was repeated for this isolated new
controller. No extra regression was needed to resolve a concrete remaining
functional gap in this acceptance scope.

## Behavior exercised

The independent run verified the requested-versus-observed boundary with a
normal capture result, explicit operator assertions and the real compatibility
adapter. It retained the native nominal rate, device, channel map and sample
counts while preserving requested settings separately. Missing native fields,
duplicated compatibility channels and default rates did not become observed
provenance. Sample-derived duration, host elapsed time and unknown measured
clock/first-sample timing retained different meanings.

Lifecycle regressions passed for pre-abort, delayed startup, cancellation,
preemption, unexpected loss, busy/failed starts, wait/phase/clock/capacity errors,
and cancellation during a pending stop. Normal stop status was distinguished
from premature loss. The owned-session fixtures and existing capture tests
checked that another owner remains untouched. The default duration timer and
external abort listener were removed on cancellation.

The corrected channel-map cases passed for out-of-range pairs, interior mono,
valid final-channel mono, unequal channel lengths, descriptor mismatch and
unexpected multiple pairs. The primary-only scope and nullable mode remained
explicit. The additional SPEC-00 source-type, gain-staging, phono/line and RIAA
unknowns survived as null values.

The run also checked metadata detachment and deep freezing, bounded diagnostic
messages with omitted/shortened counts, unavailable or inconsistent counters,
and backward host-clock handling. Mutable ephemeral sample buffers did not
change returned metadata. Acquisition and evidence JSON round trips passed as
separate objects; this does not establish persistence of the acquisition
descriptor through the older evidence-only serializer.

Every completed record remained unverified, report-ineligible and without a
measurement. Operator analysis/quality assertions were not promoted. Both raw
reference lists remained empty; no durable storage or hardware continuity was
claimed from a successful synthetic capture.

## Exact evidence

The [artifact index](evidence/cdj04-acquisition-acceptance-2026-11-20/artifact-index.json)
records the byte count and SHA-256 of each preserved execution artifact. Copies
were verified byte-for-byte against the original outputs. Raw proxy warnings
remain unmodified in the TAP log.

| Artifact | SHA-256 |
| --- | --- |
| Acquisition controller | `49e67475808248d9f920c9a69ea090786669c1faf54b6f4cf0ccea36a5961fe8` |
| Acquisition tests | `9f221f9fd5c94658cb27cac3568f95ca7d36c50d51c34cd01a7c437e89b8ebd2` |
| [Complete focused TAP](evidence/cdj04-acquisition-acceptance-2026-11-20/focused.tap) | `f4551b41a24ccf9aef4b91396415c5ded04eb4a0a3b718b09020fc5f865ee588` |

Complete [before](evidence/cdj04-acquisition-acceptance-2026-11-20/tracked-before.json)
and [after](evidence/cdj04-acquisition-acceptance-2026-11-20/tracked-after.json)
manifests cover all 1,643 tracked files, not just the new paths. They are
byte-identical. The execution metadata also pins the unchanged evidence/pitch
modules and shared capture/audio-I/O bridges.

## Handoff and limits

Only this report and its six evidence files are added after the accepted source.
The application and test source remains unchanged. No further application
tests are needed from this worker unless a separate concrete correction changes
the accepted source.

No dependencies, native build, physical capture/playback, browser session,
scanner, adversarial probe, exploit or remote write was performed. Static code
and defensive acceptance belong to the two other fresh reviewers. Applicable
hosted/native/package qualification remains a separate integration gate.

Production UI wiring, retained reference/raw evidence and hashing, scientific
estimator/uncertainty characterization, SQLite/history/HTML round trips and
physical-player qualification remain unfinished. The passing focused run does
not promote the provisional acquisition into a validated CDJ measurement.
