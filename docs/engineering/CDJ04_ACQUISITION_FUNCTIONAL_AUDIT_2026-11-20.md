# CDJ-04 acquisition author verification — 20 November 2026

Worker: `/root/cdj_acquisition_bug_hunt`. Dates use America/Los_Angeles;
execution timestamps retain UTC. This is author verification, not fresh
independent acceptance or physical acquisition qualification.

## Implemented slice

The new [acquisition controller](../../app/player/acquisition.js) owns a
`startLiveSession`-compatible start/wait/stop/cancel sequence through an explicit
dependency. It supports one input pair and requested durations of 1..30 seconds,
with five seconds of live capacity headroom. Native live limits and memory
budgets are unchanged. This implements the acquisition prerequisite identified
by the [prior continuation](CDJ04_EVIDENCE_CONTINUATION_2026-11-20.md).

| Requirement | Resulting behavior |
| --- | --- |
| Owned identity | Distinct run/capture UUIDs and host request/ready/completion times come from the runner. Operator-supplied identity/time cannot replace them. |
| Actual observations | Present/valid native fields, corroborated with returned sample counts and pair descriptors, supply device, nominal rate, channels and pairs. Requests, session labels and compatibility defaults cannot fill gaps. |
| Time distinctions | Requested duration, host elapsed time and primary sample-count/nominal-rate duration remain separate. Hardware first-sample time, measured clock rate and calibration remain unknown. |
| Pair scope | One pair may be requested. Native pair indices must match channel range and the final-odd-channel mono rule. Unexpected multiple pairs remain visible with explicit primary-only sample provenance and unavailable continuity. |
| Descriptor unknowns | Backend, OS ID, native format/bit depth, source type, gain/staging, routing, phono/line, external RIAA, dropped-buffer and discontinuity counts are explicit nulls. Pair mode is derived only from one validated matching pair. |
| Evidence boundary | Frozen `acquisition` and `record` metadata are returned beside separately mutable, ephemeral `audio`. Both raw-reference lists are empty. Record qualification stays unverified, ineligible for reports and without a measurement. |

The existing evidence v1 schema is unchanged. Asset, source, processing and pitch
remain normalized operator assertions; operator capture, analysis and quality
claims do not become observations. The separate
`deckchek.cdj04.acquisition.v1` object carries fields absent from the old record.
Both metadata objects have JSON transport coverage; serializing the old record
alone is not claimed to preserve the acquisition object. No SQLite, UI or
report registration is added.

The code reviewer identified the canonical mono-pair rule during drafting; it
was corrected before the first frozen run. Root/code review then requested the
remaining SPEC-00 descriptor unknowns and derived channel mode. Those seven
source/test additions form the separate final implementation commit below.
The first passing execution remains source-specific historical evidence.

## Lifecycle and diagnostics

Pre-abort and invalid requests open nothing. Cancellation, preemption and
unexpected input loss discard the run and clean only its own session. Late
starts are cancelled when they resolve; a pending stop cannot later yield a
completed record after cancellation. Normal stop status is distinguished from
unexpected loss. Busy input preserves the other owner. Wait/callback/clock
failures and insufficient native capacity also release the owned session.
The default timer is cleared and external abort listeners are detached.

Metadata is copied before returning and deeply frozen. Mutating requests,
native diagnostics or returned sample buffers cannot alter it. Serializable
snapshots contain no waveform arrays. Error text is bounded to twenty entries
of one thousand characters, with received, omitted and shortened counts.
The native error counter separately exposes messages not supplied in its
bounded list. These are capture observations, not a physical identity proof.

`continuity.state = observed` means the specified native observations exist,
not proven gap-free hardware capture. Overrun counts retain native sample units;
they are not frames or dropped buffers. Callback-gap intervals are retained
without inventing a player-dropout diagnosis or scientific threshold. The
acquisition retains the observed device text; the unchanged evidence normalizer
trims its display text. Neither is a stable physical device identifier.

## Exact sources and verification

| Role | Commit / tree |
| --- | --- |
| Parent's accepted QR/CDJ base | `7ae15e17d0c8247efde1ba26c59df4e13f4e321c` / `2f2a99a1370f1863649aa2bd0552ddc92f6ad1e4` |
| Initial implementation | `ef443d49ac1c9042a712ac5a4996faaddb8110bb` / `d164994f83f428bc96315babd877a0ce88c8ce55` |
| Final implementation | `3e7ae2d239686061a5056efb672be4ae135215e1` / `2ef190b0a9a4d94db0ab352ff784dd414c69f322` |

Both focused runs used Node **22.23.4**, with its explicit executable directory
first on PATH:

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/cdj-acquisition.test.mjs tests/cdj-evidence-record.test.mjs tests/cdj-pitch-display.test.mjs tests/capture-ownership.test.mjs tests/capture-pairs.test.mjs
```

| Frozen execution | Result | TAP / enclosing duration |
| --- | --- | --- |
| Initial implementation | 56 passed, zero failed/skipped/cancelled/TODO | 477.252702 ms / 0.5461839900090126 s |
| Final descriptor correction | 56 passed, zero failed/skipped/cancelled/TODO | 460.847907 ms / 0.5349802099954104 s |

Each scope contains seventeen new acquisition tests, twenty-one existing CDJ
tests, three ownership tests and fifteen pair-selection tests. The executions
and subsets overlap and must not be added. Both runs preserved all **1,618
tracked SHA-256 values**, clean before/after. Each implementation revision's two
new files passed syntax and staged formatting checks. No broad suite was
repeated; the second focused execution qualified the concrete descriptor change.

The [artifact index](evidence/cdj04-acquisition-functional-2026-11-20/artifact-index.json)
pins exact raw logs, execution metadata, complete before/after manifests and
syntax outputs. The [final execution record](evidence/cdj04-acquisition-functional-2026-11-20/focused.json)
retains the complete executable/arguments, source/tree, UTC times and exit.
Proxy warnings remain verbatim in the raw evidence.

| Final artifact | SHA-256 |
| --- | --- |
| Controller | `49e67475808248d9f920c9a69ea090786669c1faf54b6f4cf0ccea36a5961fe8` |
| New tests | `9f221f9fd5c94658cb27cac3568f95ca7d36c50d51c34cd01a7c437e89b8ebd2` |
| Final TAP | `ef7d7e822cc78f66a878075e138d022b81066e2ccb4b9a0e2f7caf61933bc643` |
| Initial TAP | `5e94f5edde82e58ab9510e2dc0532676d859a018a41c0a44f762802a59c4c0af` |

## Fresh-worker handoff and limits

Fixtures use the real `payloadToAudio` normalizer with injected sessions/waits.
No physical audio was acquired or played. No dependencies, native build,
browser/device session, scanner or offensive workflow was used. The shared
capture bridge, evidence schema, numerical helper, native source and mobile
files are unchanged. This worker made no remote writes.

Fresh independent workers still need to accept the integrated successor.
Production UI wiring, durable reference/raw-byte retention and hashing,
scientific metadata/uncertainty, independent estimator/reference validation,
SQLite/history/HTML round trips and physical player qualification remain open.
No performance/security gate, permission or feature default was changed.
