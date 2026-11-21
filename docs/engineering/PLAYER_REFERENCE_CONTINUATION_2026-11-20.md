# Reference identity and PDF axes — completed reviews, qualification held

Review date: 20 November 2026, America/Los_Angeles.

All three initial workers and three fresh successors completed. The bounded
reference-file/PDF contracts have no remaining blocker from those source
reviews, but **the complete functional gate failed and combined qualification
is held for a separate audio investigation**.

## Implemented and reviewed

The default-off Player capture preview can explicitly read one optional local
file up to 32 MiB, calculate SHA-256 over its exact bytes and export the immutable
metadata descriptor with the capture. It retains no file/waveform bytes, does
not upload or decode the file, and keeps playback identity unverified. Busy,
cancel, hide and disposal ownership suppress late results. Selected-file identity
does not grant report eligibility or a measurement.

PDF #73 now refuses nonrepresentable rounded axis spans and uses the existing
escaped, visible Chart unavailable fallback. Code review found the original
candidate's missing rounded-span check; defensive review found a late picker
selection could remain in the DOM after refusal. Both were corrected before
focused acceptance. Existing high-offset tick coalescence is not claimed fixed.

| Lane | Initial | Fresh | Fresh report commit |
| --- | --- | --- | --- |
| Code | [Audit](PLAYER_REFERENCE_CODE_AUDIT_2026-11-20.md) | [Acceptance](PLAYER_REFERENCE_CODE_ACCEPTANCE_2026-11-20.md) | `ee67471589a76d165a08746158ac91c717467dcd` |
| Functional | [Audit](PLAYER_REFERENCE_FUNCTIONAL_AUDIT_2026-11-20.md) | [Held acceptance](PLAYER_REFERENCE_FUNCTIONAL_ACCEPTANCE_2026-11-20.md) | `3af5007f329f5f3d1459ff3dd46f2c28b5799aba` |
| Defensive | [Audit](PLAYER_REFERENCE_SECURITY_AUDIT_2026-11-20.md) | [Acceptance](PLAYER_REFERENCE_SECURITY_ACCEPTANCE_2026-11-20.md) | `aab8419ac03cb9aeaf65bcbb5ab79069d1dc7bdc` |

The exact fresh source is `ded34d2dccfcf0ae51c78fa1492a57c161d32a1d`, tree
`9030b4d9eeb307f27c0d794dccf4a37895c2a602`. Durable equivalent
`b8bf6ea10791b05a2188d176ae8b996528a10f08` is preserved on
`checkpoint/deckchek-reference-source-20261120`. Its [publication proof](evidence/player-reference-integration-2026-11-20/source-publication.json)
records verified whole tree, ordered parents #74 plus original #73 candidate,
input ancestry and branch readback. Runtime remains corrected `4470195`;
maintained tests/tools remain `dd11f41`. Later additions are evidence/docs only.

## First complete outcome, unchanged source

The sole fresh complete serial Node **24.22.3** run recorded **2,357 total /
2,354 pass / 2 fail / 1 optional Mixxx skip**, exit 1, no timeout/cancellation/TODO.
All **192** top-level test files ran; all **1,943 tracked hashes**, exact HEAD/tree
and clean checkout state stayed unchanged. It took 375.588414659 seconds.

1. The existing cubic THD assertion repeated issue #72's exact value:
   `16972224339301138 vs 4.347826086956522`.
2. The existing audio-runner retry reached one playback and one save, then
   returned a failed measurement verdict: balance, response and polarity.
   This does not establish an ownership defect or common cause.

The [complete TAP](evidence/player-reference-acceptance-2026-11-20/full-suite.tap)
is 541,141 bytes, SHA-256
`29ef19e0e0916e94e4c1ce0b27be3805f173375686cd522cf9aa8db11a77dec4`.
[Commands, maps and failure context](evidence/player-reference-acceptance-2026-11-20/README.md)
are retained. Both audio source/test pairs are unchanged from the earlier failed
and passing freezes. That establishes no environmental or runtime cause.
Two spaces-only lines in raw assertion output are preserved without normalization.

All **132** initial focused case names passed in this full run. The separate
original PDF **28/28**, corrected **132/132**, and two smoke syntax checks remain
separate observations, not a substitute for the failed full gate. No rerun,
assertion weakening, extra skip or audio patch followed this acceptance run.
Root's [integration proof](evidence/player-reference-integration-2026-11-20/local-integration-proof.json)
verifies the 24 initial/nine fresh digest entries, complete TAP and equal maps.
The [Git bundle](evidence/player-reference-integration-2026-11-20/local-review-history.bundle)
and [metadata](evidence/player-reference-integration-2026-11-20/local-review-history.json)
retain original local source and all six worker histories.

## Continuing work and separate gates

A new code/functional/defensive trio owns bounded audio diagnosis, starting from
the complete failure evidence. It must preserve first outcomes and distinguish
source, numerical and runtime hypotheses. No cause or repair is claimed here.
Issue #72 remains open. Do not merge this successor on focused passes alone.

Fixed draft #74 remains `78403038c530a981b732d5ac0210539edf37fc77`, without these
reference/PDF changes. Its [hosted JavaScript observation](evidence/player-reference-integration-2026-11-20/pr74-javascript-observation.json)
passed 2,332 total / 2,331 pass / zero fail / one skip on Node22.23.5, with fetched
tested merge/tree/parents verified. That different-source/runtime outcome does
not explain either new failure. Its own UI/native/platform gates remain separate.
#71 is closed unmerged as superseded, with its branch/head retained. Main was
last verified at `099c99c055322ef668be23e6ae50a2968614cc6d`.

The authored browser/print smokes have syntax evidence only. Chromium's earlier
socket denial still means no local page, screenshot or print PDF; no retry or
workaround occurred. #69/AC-6, original Spec 10 requirements, fixed Fleet failure
evidence/default-off state, thresholds and permissions remain unchanged. Stored
raw/reference evidence, pitch analysis, reporting and scientific/physical gates
remain unfinished. No release or deployment is included.
