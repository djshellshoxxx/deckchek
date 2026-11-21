# CDJ-04 acquisition continuation — 20 November 2026

Dates use America/Los_Angeles; execution records retain UTC. This slice adds a
capture-owning API above unchanged QR PR #65. A production player UI does not
yet consume it; scientific, persistence and physical qualification remain open.

## Implemented behavior

`runCdjAcquisition` owns one input pair for 1..30 seconds through an explicit
`startLiveSession`-compatible dependency. Its start/wait/stop/cleanup lifecycle
handles cancellation, preemption, input loss, late startup, pending-stop
cancellation and provider/callback errors using only its own session.

Distinct run/capture UUIDs identify the attempt. Requests are snapshotted before
capture. Device, nominal rate, channel map and sample counts use preserved
native-field presence/validity and consistency checks; compatibility defaults
and caller labels cannot establish observations. Primary-frame duration,
requested duration and host request/ready/completion times retain distinct
meanings. The first-sample timestamp and measured hardware timebase are unknown.

Metadata is detached and deeply frozen. Native counters keep their units;
messages have explicit omission/shortening counts. Mono routing is valid only
on the final odd channel. Unexpected multi-pair output remains unavailable;
sample scope is the primary pair. Missing backend, OS ID, format, gain/routing,
source/phono/RIAA, dropped-buffer and discontinuity facts remain explicit.
Native counter observations do not prove physical continuity.

Audio is returned separately as mutable, ephemeral data for later analysis.
Both raw-reference lists stay empty. Operator analysis/quality flags are not
promoted: the v1 evidence record remains **unverified**, **report-ineligible**
and **without a measurement**. The separate versioned acquisition metadata does
not change the existing evidence schema.

## Source and reviews

| Role | Commit / tree |
| --- | --- |
| Initial author source | `ef443d49ac1c9042a712ac5a4996faaddb8110bb` / `d164994f83f428bc96315babd877a0ce88c8ce55` |
| Final author source | `3e7ae2d239686061a5056efb672be4ae135215e1` / `2ef190b0a9a4d94db0ab352ff784dd414c69f322` |
| Frozen combined independent-review source | `55f7ea2c8759c985bbbd463f374ca2c78d99a669` / `54a86922bfd8cca87c076b755edd0b3432034aee` |
| Durable equivalent | `63fa54d1d2c01e4a862f25b6b4583196665d9e93` / `54a86922bfd8cca87c076b755edd0b3432034aee` |

The durable commit was independently fetched and matched the whole frozen tree.
It retains published QR #65 head `562609b4` as parent. Only the new controller
and test file differ in runtime source; shared capture/evidence/pitch, native,
mobile, database, workflow, permission, threshold and default code is unchanged.

All three initial workers finished before three different successors began.

| Stage | Code | Functional | Defensive source |
| --- | --- | --- | --- |
| Initial | [Audit](CDJ04_ACQUISITION_CODE_AUDIT_2026-11-20.md) | [Author and evidence](CDJ04_ACQUISITION_FUNCTIONAL_AUDIT_2026-11-20.md) | [Audit](CDJ04_ACQUISITION_SECURITY_AUDIT_2026-11-20.md) |
| Fresh | [Acceptance](CDJ04_ACQUISITION_CODE_ACCEPTANCE_2026-11-20.md) | [Acceptance](CDJ04_ACQUISITION_FUNCTIONAL_ACCEPTANCE_2026-11-20.md) | [Acceptance](CDJ04_ACQUISITION_SECURITY_ACCEPTANCE_2026-11-20.md) |

Initial source review corrected interior-mono validation before the first
freeze. A seven-line successor added explicit SPEC-00 unknown fields and a
validated primary-pair mode. No original-source runtime failure is claimed for
those source-review findings.

## Verification

Fresh Node **22.23.4** verification passed **56/56**, with zero failures,
skips, cancellations or TODOs. All **1,643 tracked hashes** stayed unchanged,
with a clean checkout before/after. Syntax checks passed **2/2**. TAP duration
was **464.570067 ms**; enclosing duration **0.5166669330064906 s**.

The serial five-file scope covers 17 acquisition cases, 21 existing CDJ cases,
three capture-ownership cases and 15 pair-selection cases. It exercises the
actual `payloadToAudio` adapter with ordinary synthetic samples and controlled
lifecycle promises. The author separately preserved initial and final 56/56
results; these overlapping executions are not added together. Exact commands,
raw TAP, metadata and complete manifests are linked from the functional reports.

| Artifact | SHA-256 |
| --- | --- |
| Controller | `49e67475808248d9f920c9a69ea090786669c1faf54b6f4cf0ccea36a5961fe8` |
| New tests | `9f221f9fd5c94658cb27cac3568f95ca7d36c50d51c34cd01a7c437e89b8ebd2` |
| Fresh TAP | `f4551b41a24ccf9aef4b91396415c5ded04eb4a0a3b718b09020fc5f865ee588` |

The unchanged QR full-suite result remains source-bound at 2,251 passed / zero
failed / one optional skip. It was not repeated for this unconsumed controller.
No physical capture, native build, browser, scanner or offensive test was run.

## Integration and next work

The [QR checkpoint](evidence/cdj04-acquisition-integration-2026-11-20/qr-publication.json)
preserves publication/tree/ancestry evidence, original branches, closed input
PRs #62/#63 and a dated workflow snapshot. Keep #65 stable while it qualifies.
This distinct successor uses `integration/deckchek-cdj04-acquisition-20261120`
and needs its own applicable hosted checks before a guarded merge. Read current
refs/jobs; snapshots are historical. Last verified main here is `cfb1137d`.

After the snapshot, #65's standard JavaScript, Rust and UI jobs passed, but its
[nightly ASan job](https://github.com/djshellshoxxx/deckchek/actions/runs/44862296853/job/136718158369)
failed the unchanged Fleet reminder performance gate: **201.565999 ms against
200 ms**, 766 passed / 1 failed / 8 ignored, exit 101. The cause is unestablished.
The [complete decoded log](evidence/cdj04-acquisition-integration-2026-11-20/pr65-asan-failure.log)
and [exact record](evidence/cdj04-acquisition-integration-2026-11-20/pr65-asan-failure.json)
retain the evidence; log SHA-256 is
`e3e01b87903722839f0308c353537d7b3619736f423425263154dc0f5237820d`.
The actual tested merge, `5702a450d9a7faa3efb80c5b67de69386ae07540`, was
fetched and independently verified: its whole tree equals published #65, with
main `cfb1137d` and head `562609b4` as parents. The failed job used rustc
`1.102.0-nightly (c7d5ba59d 2026-11-20)`; successful #58/#59 jobs used
`6905905bb` from the preceding day. This difference is a lead, not a cause.
The QR/acquisition slices leave native source unchanged. Older #47 failures and
#58/#59 passes do not establish this cause. A new fresh code/functional/defensive
set owns Fleet diagnosis, with the existing diagnostic branch and prior failed
attempts retained. No threshold weakening or blind rerun follows from this log.

Remaining CDJ work: player UI wiring, retained/hashed reference and raw bytes,
stable SQLite/history/HTML round trips, complete scientific method/uncertainty
metadata, independent characterization and physical runs on two player models.
This descriptor does not close those SPEC-00/SPEC-10/SPEC-19 gates.

The scheduled read-only review also opened [issue #66](https://github.com/djshellshoxxx/deckchek/issues/66):
empty device outcomes can fall through to PASS. Its source condition is known;
actual saved UI reachability is unverified. After the active Fleet blocker,
a separate worker set should define positive evidence, correct that boundary
and exercise an actual caller while preserving old stored records.

Retain original branches/evidence, Fleet default-off, owner/hardware gates and
all caps/thresholds. The recurring continuation keeps its existing recorded
credit-exhaustion stop condition. No release, deployment, tag, history rewrite
or branch deletion is part of this checkpoint.
