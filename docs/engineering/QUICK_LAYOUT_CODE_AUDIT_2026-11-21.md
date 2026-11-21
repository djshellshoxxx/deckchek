# Quick Check main-pane layout — fresh code audit

Reviewer: `/root/quick_layout_code_round8`. Date: 21 November 2026, UTC.
All three round-seven final handoffs preceded this fresh review. This lane read
source, retained artifacts and immutable Git objects, and performed independent
data-only byte/hash comparisons. It executed no project module, test, syntax
check, browser, native component or extracted implementation. The retained
evidence verifier was read as source and was not executed. This report is the
only file owned and changed by this lane.

## Disposition

No remaining material source blocker was identified in the bounded Quick Check
CSS, authored browser checks or audio-assertion observability change. A smoke
coverage gap identified before execution was corrected before the source freeze.
Actual rendering of the new layout remains unqualified.

**Complete-source qualification remains HELD.** The first complete gate on the
final frozen source recorded **2,395 cases: 2,393 passed, one failed and one
optional case skipped**, exit 1 without a timeout. Its sole failure is case 53,
the final relative-gain assertion. The newly retained message is:

```text
gain is relative to the played level: measured -101 dB at -30 dBFS
```

The preceding assertions confirmed that the hot request was capped at -12 dBFS
and the requested -30 dBFS level was honored. The failure concerns the synthetic
session's analysis result. It does not establish a numerical cause or a playback
cap defect. Cases 22 and 37 passed in this first current-source run; older failed
observations remain intact, and no repair of issue #72 is established.

The separate smoke syntax check passed once. Both first outcomes and the final
retained package have been independently verified. Root owns further
qualification, publication and merge decisions.

## Exact source and review scope

| Source | Commit | Complete tree |
| --- | --- | --- |
| Fixed PR #79 comparison | `f76908766d53992e20382b9cbe73a668a28a6d1a` | `32ca272be2daeee6c4c1f47ccd5bd0ed0ac9909e` |
| Held round-six complete gate | `09c9afc7cfb2857f354feccb65e46a54ca8cfe62` | `b650eeac53af1395d6d0792f3639f02cf317490f` |
| Round-seven Mobile source | `d3aa9ca25bd8fec352cbb628ddfcca90beabcdd4` | `c20d7b3f6bc36e8adf906d0eb2707902b66e3fc5` |
| Completed round-seven integration | `a5d8b0d0245f4e59e9d48aa7e75f45ba6856037d` | `5aff6b97668528f5787d9f31e3e8273765202f40` |
| Initial round-eight preparation, unexecuted | `6b854265b92e70e8e95729b8e6da39c3f7619115` | `0bd65b9f836d80ca0251e69d075fb1ebfdc42cfc` |
| Corrected final freeze and first gate | `e5614ff1b8f7691e8193283a9b6ba01d5a7072ed` | `b650f03ed07bbce442b3616357e0d04086f7f1d4` |

The isolated worktree is `deckchek-quick-layout-code`, on branch
`review/deckchek-quick-layout-code-20261121`. It began clean and fast-forwarded
to root's corrected freeze. The final freeze has **2,280 tracked files** and
the initial preparation as its exact parent.

I read the [implementation note](QUICK_LAYOUT_IMPLEMENTATION_2026-11-21.md), the
actual `13aa1cd` implementation delta, the complete `e5614ff` follow-up, and the
completed [Mobile continuation](MOBILE_EXPORT_CONTINUATION_2026-11-21.md) and all
three Mobile audit reports. Relative to completed round seven, the code delta
is exactly [app/styles.css](../../app/styles.css),
[tests/audio-session.test.mjs](../../tests/audio-session.test.mjs), and
[tools/smoke/shell-layout.mjs](../../tools/smoke/shell-layout.mjs). The fourth
changed file is the implementation note. The follow-up changes only that note
and the smoke module; product CSS and test bytes remained unchanged.

## Original rendering evidence and source explanation

Issue #81 originates in the retained PR #79 screenshots. I inspected both
original 420-pixel images and independently matched their bytes to the hosted
artifact manifest:

| Original screenshot | Bytes | SHA-256 |
| --- | ---: | --- |
| [Browser, 420 pixels](evidence/feature-successor-hosted-2026-11-21/shell-toolbar-browser-420.png) | 73,749 | `480fb79c4c85bc49bd96e6d2df18ec8d890ef282749239a7018512b0bad90392` |
| [Modeled native, 420 pixels](evidence/feature-successor-hosted-2026-11-21/shell-toolbar-native-model-420.png) | 74,810 | `17dec381b00c9bf139056f57b9b26bec774fc4f28293ebeb4caabb4d17547589` |

The header controls fit in those images while description text, progress steps
and setup content extend beyond the main pane's right edge. The browser image
also shows the drop area extending beyond that edge. These are earlier fixed-
source observations, not new screenshots of the successor.

The shell reserves a navigation rail and places the screen inside an independently
scrolling `main`. Its viewport width therefore exceeds the available content
width. The original screen's implicit grid track and nested 220/260-pixel grid
minima can make the content wider than that pane. A document-level overflow
check alone cannot establish that the content fits inside this scroll container.

The changed rules address those source-derived constraints:

| Changed rule | Source effect and boundary |
| --- | --- |
| Quick Check's main track becomes `minmax(0, 1fr)`; its title text wrapper gets `min-width: 0` | Permits the grid track and flex text wrapper to shrink within the actual main pane. The main track change applies at every viewport width. |
| At widths at or below 600 pixels, the setup, side, source, field and inline-field grids use one `minmax(0, 1fr)` track | Removes the nested source/field and side-card minima and the horizontal duration-label/select arrangement. |
| Narrow-screen horizontal padding is 12 pixels and card padding is 14 pixels; source, hint and checklist text can wrap anywhere | Leaves more space for the existing content and permits long source descriptions to wrap without adding clipping rules. |
| The disabled source has 36 pixels of top padding | Leaves space below the existing absolutely positioned 20-pixel desktop badge at its 8-pixel top offset. The disabled state and explanatory text remain unchanged. |
| Step numbers and labels stack; connecting rules disappear; labels and buttons wrap | Removes the narrow screen's horizontal step-label pressure while preserving every step and label. |
| Direct footer buttons occupy the available width and have `min-width: 0` | Overrides the larger button minimum in that footer and allows vertical growth through the existing wrapping footer. |

Every added selector is scoped to `#screen-quick`; the generic styles used by
other screens are unchanged. The new rules add no overflow clipping, text
ellipsis or hidden form controls. They preserve the existing main-pane vertical
scrolling and do not modify capture or analysis handlers.

Some narrow rules affect Quick Check cards and buttons in its other steps as
well. The new smoke covers the initial setup states and one source switch. It
does not establish all capture/results layouts, arbitrary selected filenames,
other screens, localization or a general accessibility qualification.

## Actual DOM and authored browser checks

I traced the selectors through the actual
[workflow renderer](../../app/ui/workflows/flow.js),
[workflow definition](../../app/ui/workflows/definitions.js), shell and existing
smoke runner. Quick Check creates two source radio buttons, three progress-step
buttons and exactly one setup primary action. Browser mode selects File; the
modeled native boundary allows Live. File creates `#quick-file` and its associated
drop label; Live creates a populated `#quick-duration` select. The input is
intentionally transparent over its visible file label.

In the modeled-native state, the smoke selects the long device name and clicks
Live again at each viewport. That re-renders the setup description from the current selected device,
including its long name. Resizing uses the existing helper that waits for two
animation frames after changing the viewport. No capture is initiated by these
layout checks.

### Coverage finding corrected before execution

The initial helper excluded hidden elements from geometry inspection but counted
source, step and action nodes without filtering them. A hidden node could retain
the required count. The keyboard check also did not require the File controls
to appear after the source change. This lane raised those specific coverage
limitations before the first project gate.

Root's `e5614ff` correction requires positive measured width and height, client
rectangles, visible computed visibility and positive opacity for the counted
controls. It requires **two visible source choices, three visible steps and one
visible primary action**, plus exactly one selected source matching the expected
mode. File requires an enabled file input and a visible associated label. Live
requires a visible, enabled duration select with options. The keyboard switch
must satisfy the File branch as well as its focus and selection assertions.

The correction closes the identified hidden-count and missing-source-control
gaps. The original preparation was not executed. Its unused selection file is
preserved separately from the configuration that actually authorized `e5614ff`.

### Geometry, scrolling and keyboard coverage

At each of 320, 420, 800 and 1440 pixels, in both browser and modeled-native
states, the authored helper checks the main and screen scroll widths and checks
visible selected content rectangles against the main pane's client width. It
also compares each selected content element's scroll width with its client width.
The selected elements include the title, description, progress controls, setup
grids, source cards/text, file label, field grids, duration row, footer, buttons
and wiring nodes.
This measures content inside the main pane, including content below the fold.

The primary action is then scrolled into view. Its rectangle must be at least
24 by 24 pixels and lie fully inside the main pane, and its center must hit the
button or its descendant. This check establishes the authored geometric
reachability requirement; the initial Analyze File button remains disabled
until a file is chosen, as the existing workflow requires.

At 420 pixels in the modeled-native state, the smoke focuses Live, sends
ArrowRight and checks the new File radio's selected state and active-element
identity, then repeats the fitting and source-control requirements. The actual
keyboard handler changes the source, re-renders setup and focuses the newly
created selected radio, matching those assertions.

The module authors 17 additional checks: eight setup-fit checks, eight primary-
reachability checks and one keyboard source-change check. It retains the existing
toolbar assertions and screenshot paths, and adds top/action screenshots at both
narrow widths for each mode. The runner records failed checks and converts an
uncaught module exception into a failed gate; missing critical controls do not
silently pass through an unconditional true alternative.

These checks remain authored browser coverage. The syntax result below does not
execute any of them or establish actual focus, hit testing, scrolling or text
readability in a browser.

## Audio assertion: bounded observability change

The existing test still performs its hot-level run, asserts the -12 dBFS cap,
performs the -30 dBFS run and asserts that playback level. Its final condition
remains exactly the same numeric requirement: `Math.abs(gain) < 0.1`. The value
previously read directly inside that condition is now assigned once to a local
`gain`, then included with the existing playback-options value in the assertion
message.

I independently verified that replacing the single original assertion line with
those two lines reproduces the entire new test file byte for byte. The fixture,
stimulus construction, session calls and threshold are unchanged. Six recorded
audio implementation/test paths also remain byte-identical across fixed PR #79,
the failed round-six source, round seven and this freeze. The
[source comparison](evidence/quick-layout-functional-2026-11-21/source-comparison.json)
retains their exact digests.

There is no added numerical collector or production correction in this change.
The recorded parent invocation has no added engine flag, `NODE_OPTIONS` is
absent and the disallowed audio diagnostic variables are absent. Parent argv and
environment evidence are preserved as recorded. No numerical cause is inferred
from them.

The predecessor's case 53 retained only the failed boolean assertion. Its
numerical gain cannot be recovered from that output or borrowed from its
different retry case. The new -101 dB value belongs specifically to the first
current-source case 53 and the -30 dBFS playback assertion preceding it.

## First complete functional outcome

The sole functional worker executed the complete sorted set of **199 actual,
tracked top-level `tests/*.test.mjs` files**. I checked the list against both the
frozen Git inventory and the actual review checkout. The
[retained result](evidence/quick-layout-functional-2026-11-21/full/result.json)
and [complete TAP](evidence/quick-layout-functional-2026-11-21/full/run.tap)
record the first invocation.

| Measure | First complete outcome |
| --- | --- |
| Frozen source / tree | `e5614ff1b8f7691e8193283a9b6ba01d5a7072ed` / `b650f03ed07bbce442b3616357e0d04086f7f1d4` |
| Runtime | Node `v24.22.3`, Linux x64 |
| Node executable | `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` |
| Runner arguments | `--test --test-concurrency=1 --test-reporter=tap`, then the exact 199 files |
| Started / completed record, UTC | `2026-11-21T10:10:02.779261+00:00` / `2026-11-21T10:16:12.380903+00:00` |
| Execution time / budget | `369.43505567600005` seconds / 600 seconds |
| Exit / timeout | `1` / `false` |
| Tests / pass / fail / skip | `2395` / `2393` / `1` / `1` |
| Suites / cancellations / TODOs | `0` / `0` / `0` |
| TAP bytes / SHA-256 | `549295` / `f90ff51c2829b6eb9c172d0d1cda81e4e845f3d95706063764d2c56dbdbeec9a` |
| Stderr | Empty |
| Source integrity | All 2,280 tracked hashes and inventory unchanged; same HEAD/tree and clean status |

I checked every sequential top-level outcome, the single `1..2395` plan, every
footer count and the retained summary's equality to that complete ordered list.
Case 53 is the only `not ok` outcome. Its stack identifies the final assertion at
`tests/audio-session.test.mjs:95`; the literal message matches the summary's
-101 dB gain and -30 dBFS playback fields.

The cubic-distortion case 22 and retry-lifecycle case 37 passed in this first
run. That does not erase the predecessor's failed retry observation or establish
a numerical repair. Case 950 is the optional Mixxx controller-corpus check,
skipped because `MIXXX_CONTROLLERS_DIR` was not set.

All 45 case names from the prior focused Mobile gate occur exactly once and
pass in this complete run. The four actual Results-screen cases are **1226–1229**.
Their current-editor, clearing, action-payload and denied-write contracts still
use the documented DOM and action doubles. This complete run supplies new-source
Node evidence for those cases, while the overall gate remains failed.

No separate official build invocation occurred in this round. The existing
Mobile build tests inside the authorized full suite do call the build helper in
check mode and exercise writing inside their temporary-copy fixture. All 34
tracked Mobile files are unchanged from round seven; their seven shared engine
pairs, VERSION, stamp `8f12f05a2c38` and 33 ordered precache entries also match
independent data-only checks.

## Separate first syntax outcome

The separately authorized command was the same absolute Node executable with
`--check tools/smoke/shell-layout.mjs`. It started at
`2026-11-21T10:17:34.914166+00:00`, completed its record at
`2026-11-21T10:17:35.109149+00:00`, exited 0 in
**0.11426679999931366 seconds** within its 30-second budget, and did not time out.
Both streams are empty.

The retained **9,532-byte** checked source is byte-identical to the frozen Git
blob, with SHA-256
`6bb9986f0c3339401d06fb03803288224f71399b02861108dd00ecfd03706374`.
All 2,280 hashes, inventory, HEAD/tree and clean status remained unchanged. The
[syntax result](evidence/quick-layout-functional-2026-11-21/syntax/result.json)
also correctly binds the exact first full-gate result digest. Parsing did not
evaluate the module or launch a browser.

## Independent evidence integrity review

The final [manifest](evidence/quick-layout-functional-2026-11-21/manifest.json)
has SHA-256
`9445d5bf0336f3818bbfc69d1c7cb9d03d3a984b8e2eaeda0df0c18614d9aa29`.
I independently verified exact membership, sizes and digests for all **22**
listed files, excluding the manifest itself. All **21** original-source bindings
exist and match their **18** unique retained copies byte for byte. This includes
the complete nine-file full-gate directory, eight-file syntax directory,
original external recorders and configurations, and the unused preparation
selection.

All **four complete 2,280-file maps** match SHA-256 digests computed directly from
the final freeze's immutable Git blobs. The evidence agrees with that source,
beyond merely having matching before/after maps. The original and executed
selection configurations differ only in their source commit and tree; both
retain the same complete 199-file selection and execution budget.

| Bound record | SHA-256 |
| --- | --- |
| Full-gate recorder | `281e043de5ebc64a612bbe1e8883805c810ea3592536702258da1cb4f1547b3c` |
| Executed full-gate configuration | `63edeb575e417f56587d0fbf428044ab04f3ea67f9a7367dcd4dc283bfaeb9ff` |
| Original unexecuted configuration | `6a3b8dc57f3122e0bb3473600f00ee5afe2a7b374837e3bdef521c03d6732766` |
| First full-gate result | `39fbb3a9fce6ae010ef5ebaad249d7a30ec3d7fc814b57f68668375bc9b0859e` |
| Syntax recorder | `4e1b15c9cb0555e8623a38d34680668baef7176cc02449bc71312925a5d867f2` |
| First syntax result | `4baeda1e9e4977587dd8ae2f4a28e7aaefb7baa755f476eea573a279ebed1b86` |

I read both complete recorders, including their refusal to replace an existing
first-outcome directory, clean-source checks, fixed identities, complete snapshot
logic and TERM/KILL budget handling. The full recorder enforces equality among
the explicit selection, actual top-level test files and tracked top-level test
files. The syntax recorder requires its before-map to equal the completed full
gate's after-map. Their saved running metadata remains consistent with their
completed records.

The [ordered summary](evidence/quick-layout-functional-2026-11-21/observed-summary.json)
matches every outcome, the sole failure and skip, all 45 Mobile matches and both
result digests. The source comparison matches the exact preparation/freeze
parent and delta, the three changed code paths, the assertion-only replacement,
six unchanged audio paths across four sources, all 34 unchanged Mobile paths and
the shared/cache data. The final derived scope wording explicitly distinguishes
the absent separate official build invocation from the existing build-helper
tests; original records and outcomes were unchanged by that wording clarification.

I also rechecked all 35 entries in the predecessor's retained manifest and its
complete 2,391 ordered TAP outcomes: **2,388 pass, two fail, one skip**, with
unchanged TAP SHA-256
`bf5b091c0a20826a64cac1842d0d5b057a5dc91a46c5a68ebcca1b9e60f50eaa`.
The source comparison's prior full and round-seven focused result digests match
those retained immutable records. The [durable held continuation](INVENTORY_MOBILE_CONTINUATION_2026-11-21.md)
and [completed Mobile continuation](MOBILE_EXPORT_CONTINUATION_2026-11-21.md)
preserve their original meanings.

## Remaining qualification and lane completion

The new full-source hold is supported by its own first complete result, and the
older failed observations remain preserved. Issue #72 stays unresolved. The
earlier fixed PR #79 standard/hosted outcomes and round-seven focused pass do not
qualify the new Quick Check rendering behavior.

Actual browser rendering, native operation, physical audio/MIDI behavior and
broader capture/results responsiveness remain separate work. No browser startup
retry, numerical diagnostic, additional project run, remote change, deployment
or merge was performed by this lane. Root's separately authored Mapper issue
#82 is outside this review and was not changed or qualified here.

**This code audit is complete; complete-source qualification remains held.**
The [functional audit](QUICK_LAYOUT_FUNCTIONAL_AUDIT_2026-11-21.md) records the
sole executor's first observations. This report supplies independent source and
retained-data review without authorizing another run or a numerical repair.
