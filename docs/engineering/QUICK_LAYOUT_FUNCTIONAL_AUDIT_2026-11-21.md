# Quick Check main pane — fresh functional audit

Reviewer: `/root/quick_layout_functional_round8`. Date: 21 November 2026, UTC.
All three round-seven workers sent FINAL before this fresh trio began. Root
integrated their completed records before this lane's preparation. This lane
was the sole local project executor for round eight.

## Disposition

**Complete-source qualification remains HELD.** The first complete top-level
Node gate on the corrected freeze finished with **2,395 tests: 2,393 passed,
one failed and one optional test was skipped**. It selected all 199 actual,
tracked, sorted top-level `tests/*.test.mjs` files, exited 1 without a timeout,
and preserved all 2,280 tracked hashes, the inventory, HEAD, complete tree and
clean source status. The full first output is retained. There was no repeat run.

The sole failure is the final relative-gain assertion in case 53. Its improved
failure text now retains **measured gain -101 dB at a selected playback level
of -30 dBFS**. Both preceding level assertions completed: the requested hot
level was capped at -12 dBFS and the requested -30 dBFS level was honored.
This is a failed gain assertion in the existing synthetic fixture, with its
values retained; it does not establish broken playback-level selection or a
numerical cause. Issue #72 remains unresolved.

Case 37's retry verdict and case 22's cubic-distortion check passed in this
source's first complete run. The predecessor's first case 37 failure remains
preserved. These different observations do not establish a repair. All 45 case
names from the completed round-seven Mobile focused gate also passed in this
complete run, including its four actual Results-screen cases.

The separately authorized shell-layout smoke **syntax check passed once**.
Its authored geometry, focus and reachability assertions have not been run in
a browser by this lane. The [first result](evidence/quick-layout-functional-2026-11-21/full/result.json),
[complete TAP](evidence/quick-layout-functional-2026-11-21/full/run.tap) and
[ordered summary](evidence/quick-layout-functional-2026-11-21/observed-summary.json)
retain the current outcome and its limits.

## Exact source and ownership

| Item | Identity |
| --- | --- |
| Original four-file implementation | `13aa1cd18459e3f4c4fb9d70851196ba4f9c1ea8` |
| Original clean preparation, not executed | `6b854265b92e70e8e95729b8e6da39c3f7619115` |
| Original preparation complete tree | `0bd65b9f836d80ca0251e69d075fb1ebfdc42cfc` |
| Corrected and tested freeze | `e5614ff1b8f7691e8193283a9b6ba01d5a7072ed` |
| Tested complete tree | `b650f03ed07bbce442b3616357e0d04086f7f1d4` |
| Round-seven Mobile focused source | `d3aa9ca25bd8fec352cbb628ddfcca90beabcdd4` |
| Predecessor complete-gate source | `09c9afc7cfb2857f354feccb65e46a54ca8cfe62` |
| Fixed PR #79 comparison head | `f76908766d53992e20382b9cbe73a668a28a6d1a` |
| Branch | `review/deckchek-quick-layout-functional-20261121` |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-quick-layout-functional` |

Root owned the product, assertion-message and smoke changes. This lane changed
only this report and `evidence/quick-layout-functional-2026-11-21/`, after both
commands' final hash maps and clean source records were saved. Relative to the
completed round-seven integration, the only changed code paths are
`app/styles.css`, `tests/audio-session.test.mjs` and
`tools/smoke/shell-layout.mjs`. The implementation document is the fourth path
in the original implementation delta.

The [source comparison](evidence/quick-layout-functional-2026-11-21/source-comparison.json)
binds those paths, the original preparation, correction, predecessor records
and unchanged audio/Mobile boundaries. The corrected freeze has the original
preparation as its sole parent. Its two-file correction changes only the smoke
and its implementation note.

## Functional source review and correction before execution

Issue #81's follow-up makes Quick Check's main grid track shrinkable. At widths
covered by the 600-pixel media rule, it uses a single column for the inner grids,
reduces pane/card padding, wraps source/help text and buttons, stacks step
numbers and labels, and gives the primary action the available width. The
browser's disabled Live source reserves vertical room for its badge. These
selectors are scoped to `#screen-quick`; capture and analysis code are unchanged.

The authored smoke examines actual main/screen scroll widths and selected child
rectangles at 320, 420, 800 and 1440 pixels in browser and modeled-native states.
It keeps the prior toolbar checks, scrolls the primary action into view, checks
its size, pane containment and center hit target, and retains top/action images
at the two narrow widths. The native-model keyboard change checks the new File
radio's selected state and actual active-element identity.

Fresh source review found a coverage gap before any round-eight project process:
source, step and action counts included hidden nodes, and the File transition
did not require its expected controls to exist. Root corrected this before the
freeze. Counts now require measurable visible controls, the selected source must
match the expected File or Live state, and the state must contain its expected
controls. Live requires a visible enabled duration selector with options. File
requires an enabled file input and its visible associated label; the production
file input is intentionally transparent. The keyboard transition explicitly
requires File controls. No product behavior changed in this correction.

The original recorder and original source-bound selection were preserved. The
v2 selection changes only `source_commit` and `source_tree`. Root read the full
recorder and both configurations, confirmed the exact inventory and clean freeze,
and authorized the first gate only after both source peers confirmed the bounded
correction. No original-preparation test, baseline reproduction or hidden rerun
preceded the recorded outcome.

## First complete Node gate

The recorder used the absolute Node executable with
`--test --test-concurrency=1 --test-reporter=tap`, followed by the exact ordered
199-file array in the
[authorized selection](evidence/quick-layout-functional-2026-11-21/full/authorized-selection.json).
The [result](evidence/quick-layout-functional-2026-11-21/full/result.json)
retains the complete argv. No shell wildcard selected the tests. The recorder
required equality between the explicit selection, every actual top-level test
file and every tracked top-level test file, including both dotted property-test
filenames and the new `mobile-results-details.test.mjs` file.

| Execution item | Recorded first outcome |
| --- | --- |
| Runtime | Node v24.22.3, Linux x64; Python recorder v3.12.14 |
| Absolute Node path | `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` |
| Started, UTC | `2026-11-21T10:10:02.779261+00:00` |
| Completed record, UTC | `2026-11-21T10:16:12.380903+00:00` |
| Child execution elapsed | `369.43505567600005` seconds |
| Budget | 600 seconds; TERM at 595 and KILL by 600 if required |
| Exit / timeout | 1 / false |
| Cases | 2,395 tests; 2,393 pass; 1 fail; 1 skip; 0 cancelled or TODO |
| Stderr | Empty |
| Source integrity | All 2,280 tracked hashes and the inventory unchanged; same HEAD/tree; clean |

`NODE_OPTIONS`, `DECKCHEK_AUDIO_CONTEXT_PATH` and every
`DECKCHEK_AUDIO_FIT_*` variable were absent. PATH was prefixed with the same
absolute Node directory for existing test subprocesses. The recorder's version
and component queries were metadata-only. No additional engine flag or numerical
collector was enabled. The retained parent argv does not characterize unobserved
child argument expansion.

### Case 53: retained gain failure, with completed level assertions

The test is declared at `tests/audio-session.test.mjs:89`; its final assertion
fails at line 95. The full retained error is:

> gain is relative to the played level: measured -101 dB at -30 dBFS

The preceding assertions require the -3 dBFS request to play at -12 dBFS and
the -30 dBFS request to play at -30 dBFS. Both completed before the failing
`Math.abs(gain) < 0.1` assertion. The assertion's threshold and condition are
unchanged. The source change stores the same returned measurement in a local
constant and adds that value and the selected playback level to its message.
The fixture and production audio paths are unchanged.

The predecessor's case 53 TAP retained only true/false for this assertion and
has no numeric gain for that session. Its separate retry-case numerical payload
must not be attributed to case 53. The current -101 dB value comes directly from
this first gate's case 53 message. It is not a new collector result, a physical
measurement or an explanation of the failure.

### Other retained outcomes and predecessor distinction

| Case | Current first-gate outcome | Meaning retained |
| --- | --- | --- |
| 22 | Pass | The existing cubic-nonlinearity/chain-floor case completed. |
| 37 | Pass | The capture-failure/try-again case reached its expected passing retry verdict in this run. The predecessor's first failed verdict remains part of the evidence. |
| 53 | Fail | The final relative-gain assertion failed after the cap and lower-level assertions completed. |
| 950 | Skip | Optional local Mixxx corpus; `MIXXX_CONTROLLERS_DIR` was not set. |
| 1226–1229 | Pass | All four actual Mobile Results-screen detail/export cases completed. |

All 45 exact case names from the prior six-file Mobile gate independently match
passing outcomes here. They cover Mobile cache/vendor contracts, export/format,
current editor values and blanks, action payload/checksum equality, focus and
editor identity, old QR retirement, redaction, denied preference writes, routing,
phone framing and QR encoding/decoding. The four screen cases use the actual
screen with DOM/action doubles; this does not establish real browser event
ordering, share sheets, native storage or physical measurement performance.

Six specified audio implementation/test files remain byte-identical across fixed
PR #79, the predecessor complete gate, the round-seven Mobile freeze and this
freeze. The seventh file, `tests/audio-session.test.mjs`, differs only by the
exact assertion-message replacement described above. Source identity and a
passing retry case do not establish the cause of differing runtime observations
or resolution of #72. The predecessor's 2,391-case first result remains intact:
2,388 passed, two failed and one was skipped.

## Mobile identity and separate build boundary

All 34 tracked Mobile files are byte-identical to the completed round-seven
freeze. The service-worker stamp remains `8f12f05a2c38`, and its SHA-256 remains
`07b2a1c77959bcc55f825f4d6db6ada92762ea494959a0938d749569978d77cd`.
Independent file/Git hashing confirms all seven shared/vendor pairs, VERSION,
the derived stamp and all 33 ordered precache entries. No separate official
Mobile build invocation was needed or performed in this round.

The existing `mobile-build.test.mjs` was included in the authorized complete
gate. It calls the build helper in check mode and tests writes within its own
temporary copied fixture. That normal test coverage is distinct from a separate
build command or a generated checkout change. The recorded source maps prove
that the checkout's Mobile files stayed unchanged.

## Separately authorized shell-layout syntax check

After the full gate, root read the entire new syntax recorder and separately
authorized exactly one project command:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --check tools/smoke/shell-layout.mjs
```

It started at `2026-11-21T10:17:34.914166+00:00`, exited 0 in
`0.11426679999931366` seconds and did not time out. Its budget was 30 seconds,
with TERM at 25 and KILL by 30 if required. Stdout and stderr were empty.
The 9,532-byte checked module retained SHA-256
`6bb9986f0c3339401d06fb03803288224f71399b02861108dd00ecfd03706374`.
All 2,280 tracked hashes, the inventory, HEAD/tree and clean status remained
unchanged; its before-map also equals the full gate's after-map.

The [syntax result](evidence/quick-layout-functional-2026-11-21/syntax/result.json)
binds the full gate's result digest, and the
[checked source](evidence/quick-layout-functional-2026-11-21/syntax/checked-shell-layout.mjs)
is retained byte for byte. This parsed the module without evaluating its browser
scenarios. The earlier local Chromium socket `EPERM` limitation was not retried
or worked around. Actual hosted rendering and native/platform or hardware
qualification remain separate from this syntax result and Node evidence.

## Evidence integrity and independent review

Both execution recorders and raw-output directories were outside the checkout.
Each recorder refuses to reuse its first-outcome directory. Identities, complete
before-maps and running records preceded the project command, and full streams
went directly to new files. Results and complete after-maps were saved before
this report or retained package was added. First outputs were not replaced by
summaries or later passes.

| Recorder or configuration | SHA-256 |
| --- | --- |
| Complete-gate recorder | `281e043de5ebc64a612bbe1e8883805c810ea3592536702258da1cb4f1547b3c` |
| Preserved unexecuted preparation config | `6a3b8dc57f3122e0bb3473600f00ee5afe2a7b374837e3bdef521c03d6732766` |
| Executed corrected-source config | `63edeb575e417f56587d0fbf428044ab04f3ea67f9a7367dcd4dc283bfaeb9ff` |
| Separate syntax recorder | `4e1b15c9cb0555e8623a38d34680668baef7176cc02449bc71312925a5d867f2` |

The complete first TAP is **549,295 bytes**, SHA-256
`f90ff51c2829b6eb9c172d0d1cda81e4e845f3d95706063764d2c56dbdbeec9a`.
The [final manifest](evidence/quick-layout-functional-2026-11-21/manifest.json)
binds **22 evidence files**, excluding itself, and has SHA-256
`9445d5bf0336f3818bbfc69d1c7cb9d03d3a984b8e2eaeda0df0c18614d9aa29`.
The [retention proof](evidence/quick-layout-functional-2026-11-21/retention-proof.json)
binds **21 original paths to 18 unique retained copies**, including both complete
raw directories, the external recorders and both source-bound configurations.

The [data-only verifier](evidence/quick-layout-functional-2026-11-21/verify-evidence.py)
passed with `--require-originals`. It checks exact manifest membership, sizes and
digests; every original binding; all four complete maps against 2,280 immutable
frozen Git blobs; source/runtime/config/selection identities; the complete TAP,
plan, footer and every ordered outcome; the 45 matched Mobile cases; syntax
source and streams; and the source, Mobile and predecessor comparisons. It reads
data and Git objects and executes no project modules. The final derived scope
wording explicitly distinguishes a separate official build from the existing
build-helper tests; no raw record changed during that clarification.

Both static peers independently verified the final 22-entry manifest, all
21 original bindings and 18 unique copies, all four 2,280-entry immutable source
maps, every ordered TAP outcome and all 45 Mobile matches, recorder/config/runtime
identities, syntax source and streams, source comparisons and unchanged Mobile
contracts. Both confirmed the exact case 53 value and completed level assertions,
reported no retained-evidence blocker, and preserved the complete-source hold.
They read the packaged verifier as source without executing it. Their separate
code/security dispositions and owned-path commits remain tracked by root.

## Remaining qualification and lane completion

This lane's project invocations were limited to the authorized first complete
Node gate and the separately authorized syntax check. No repeat gate, numerical
repair, new collector, extra engine flag, separate official build, browser/native
launch, installer, scanner, probe or remote mutation occurred. The fixed PR #79
hosted evidence belongs to its separate source; it does not qualify this later
Quick Check successor. Root owns consolidation, hosted qualification, publication
and merge decisions, and receives all three fresh FINAL handoffs before another
rotation.

**The functional lane is complete; complete-source qualification remains held
on the retained case 53 failure.** The Quick Check smoke is authored and syntactically
valid, with actual rendered fit/focus/reachability qualification still outstanding.
