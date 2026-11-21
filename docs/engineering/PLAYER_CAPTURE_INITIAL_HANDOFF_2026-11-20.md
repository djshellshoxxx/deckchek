# Player capture and usage correction — initial handoff, 20 November 2026

## Implementation completed in this successor

The app now registers a **Player capture** preview behind the default-off
`playerCapture` flag. It consumes the existing owned capture API for one input
pair and 1–30 seconds. Setup records operator assertions; results distinguish
the requested input from actual native observations and retain unknown values.
The screen cancels on navigation, feature disablement and disposal, suppresses
late results, and exports only provisional metadata through the existing local
download helper. It retains no waveform reference in screen state and makes no
pitch-measurement, History/report, redaction or secure-erasure claim.

The separately prepared usage-ledger #70 candidate is also incorporated. It
deduplicates valid session proposals within the supplied batch, preserves zero
IDs in the pure helper, and rejects inherited source names at the JS boundaries.
Native string-ID/source validation is unchanged. This is neither database-wide
idempotency nor a complete malformed-object schema. No actual stored-user data
incident is established. The original candidate branch and ancestry remain.

All three initial workers completed before the fresh set is assigned. Their
source, limits and evidence are recorded in the [code audit](PLAYER_CAPTURE_CODE_AUDIT_2026-11-20.md),
[functional audit](PLAYER_CAPTURE_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive audit](PLAYER_CAPTURE_SECURITY_AUDIT_2026-11-20.md). Runtime execution
belonged only to the functional lane. Root wrote the UI and performed static
integration/evidence checks.

## Source identities

| Role | Commit | Tree |
| --- | --- | --- |
| Reviewed production UI and usage source | `aabcd886667ed4116fecb725c532eabcc7d485d6` | `ed86cf0d14508d4c9e42c84bf0c79e7f01e523fe` |
| Executed focused Node test source | `d785e706a354512e4cd9c8855c868f600de07a78` | `4ebca0206138fefa528a8da1db89edbc02076afd` |
| Single blocked browser attempt | `09f6e5db3b24f190642f07a2649fcf64036f0518` | `9402f8f8dd921e23fda08c218fa86d830fc43ac2` |
| Final maintained test/smoke source | `2cb1aec7b1bdd4169b08aed57689eb7e937173c3` | `816bf89effa0b238d1620beec7aaf8c6ec51d27a` |
| Original usage candidate | `b8dfc126c2480f303df105abd3759fedae49a192` | `a0660644f2e7d996817f0c76a004be95b37d3317` |

The production diff from the prior consolidation is eight paths: app/flag/HTML
wiring, new screen/style, usage helper, and feature/usage tests. Two maintained
test paths follow: 16 real-screen Node cases and an auto-discovered browser
smoke. Production remains byte-identical to the reviewed freeze. The final
smoke differs from the blocked-attempt source only by placing dependent native
mock initializers into one explicitly ordered script. That final smoke passed
syntax checking but has not executed in a browser.

## Actual initial execution

All local executions used Node v24.22.3. These selections overlap and are not
additive. Complete logs, commands, runtime metadata and source maps are retained
in the [functional evidence](evidence/player-capture-functional-2026-11-20/README.md).

| Execution | Actual result | Source integrity |
| --- | --- | --- |
| Player/feature/acquisition/evidence/usage selection, five files | 77/77 pass; exit 0 | 1,856 tracked hashes unchanged. |
| Exact original usage candidate | 22/22 pass; exit 0 | 1,655 tracked hashes unchanged. Separate from the scheduled author's adapted-V8 checks. |
| Instrumented copy of original audio-quality file | 15/15 pass; exit 0 | 1,853 tracked hashes unchanged; diagnostic only. |
| Two original prefix files plus instrumented audio-quality copy | 33/33 pass; exit 0 | 1,853 tracked hashes unchanged; diagnostic only. |
| Isolated player browser smoke | Chromium launch failed; exit 1 | 1,857 tracked hashes unchanged; no page/module body ran and no screenshot exists. |

Chromium and Playwright were already installed. The single launch failed with
`process_singleton_posix.cc:297: socket() failed: Operation not permitted (1)`.
No retry, browser workaround or host-policy change followed. The maintained
smoke remains for exact-source hosted execution, including real public opt-in,
rendering, local download, cancellation and desktop/mobile layout checks with
a modeled native boundary. It is not physical hardware qualification.

Root verified all 26 evidence ledger digests, the three reports' local links,
unchanged production against `aabcd886`, and unchanged tests/tools against final
`2cb1aec`. The functional lane additionally verified its five before/after maps
against 1,786 distinct immutable Git blobs. These are evidence checks, not extra
project executions by root or the static reviewers.

## Unresolved audio result and earlier consolidation

Issue #72 tracks the earlier full Node v24.22.3 result: 2,314 total, 2,312 pass,
one cubic THD assertion failure and one optional Mixxx skip. Its successful
15-case narrow rerun and this lane's two bounded diagnostic runs did not
establish a cause. No audio production patch or threshold/skip weakening was
made. The original failure remains retained in the [redaction handoff](REDACTION_CONTINUATION_2026-11-20.md).

Draft #71 stays fixed at `0a5d485eb29b43f249a8764992931cbc15d84e9b`. It supersedes
closed/unmerged #68 while retaining its branch and ancestry. Its hosted
JavaScript job passed 2,314 total / 2,313 pass / zero failures / one optional
skip on Node **v22.23.5**, tested merge `cef7ef6961816ef796ced5450d781c5d37b923ba`.
Root fetched that merge and verified its complete tree and ordered parents.
The [observation record](evidence/player-capture-integration-2026-11-20/pr71-javascript-observation.json)
and [compressed complete log](evidence/player-capture-integration-2026-11-20/pr71-javascript-complete.log.gz)
retain that separate result. It neither identifies the Node24 failure's cause
nor qualifies this later player UI. Read live remaining gates before any merge.

## Fresh handoff and remaining scope

Fresh code, functional and defensive workers must inspect the combined source.
The fresh functional lane alone owns a complete serial JavaScript run with
clean source maps. Do not retry local Chromium's known host restriction; obtain
actual rendered evidence from the applicable hosted workflow on the final
successor. Exact-source native/platform packaging gates remain separate.

The [Spec 10 note](../SPEC-10-CDJ-media-player-diagnostics.md) now describes this
capture-only preview. Reference/raw retention, pitch-measurement integration,
persistence/report wiring and scientific/physical characterization remain
unfinished. The proposed workflow and original acceptance requirements are
unchanged. Issue #69 stays open; Spec 02 AC-6 is unchanged. Original Fleet timing
failures and the fixed single diagnostic remain, with Fleet default off. No
release, deployment, permission expansion, native command or migration is added.
