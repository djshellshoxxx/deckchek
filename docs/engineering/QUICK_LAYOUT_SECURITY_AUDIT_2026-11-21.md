# Quick Check layout — fresh defensive source audit

Reviewer: `/root/quick_layout_security_round8`. Date: 21 November 2026, UTC.
All three round-seven final handoffs preceded this fresh trio. This report is
the sole file owned by this lane.

## Review status

The scoped source and retained-evidence review identifies no new defensive
blocker in the Quick Check layout or assertion-message change. The complete
first gate is nevertheless **HELD**: **2,395 cases, 2,393 passed, one failed and
one optional case skipped**. The remaining failure is case 53's final relative-gain
assertion. Its new message retains **-101 dB at -30 dBFS** from the synthetic
session after both playback-level assertions completed. Case 37 passed this
current-source invocation; its earlier failure remains preserved, with no cause
or repair established.

The separate first smoke syntax check passed. All original output bindings,
four complete source maps and all 2,395 ordered outcomes in the final retained
package have been independently verified. Neither that syntax pass nor the
defensive review qualifies actual browser rendering, native hardware or issue
#72. No additional execution, release, deployment or merge is approved here.

This lane reads source, immutable Git objects and retained data only. It executes
no project module, test, syntax check, browser, native component, scanner, probe,
extracted implementation or vulnerability reproduction. It makes no product,
test or remote change. Root owns implementation, integration, CI, publication
and merge decisions; the functional lane is the sole project executor.

## Exact source and scope

| Source | Commit | Complete tree |
| --- | --- | --- |
| Fixed PR #79 comparison | `f76908766d53992e20382b9cbe73a668a28a6d1a` | `32ca272be2daeee6c4c1f47ccd5bd0ed0ac9909e` |
| Held predecessor complete gate | `09c9afc7cfb2857f354feccb65e46a54ca8cfe62` | `b650eeac53af1395d6d0792f3639f02cf317490f` |
| Completed round-seven Mobile export freeze | `d3aa9ca25bd8fec352cbb628ddfcca90beabcdd4` | `c20d7b3f6bc36e8adf906d0eb2707902b66e3fc5` |
| Reviewed round-eight preparation | `6b854265b92e70e8e95729b8e6da39c3f7619115` | `0bd65b9f836d80ca0251e69d075fb1ebfdc42cfc` |
| Final round-eight source freeze | `e5614ff1b8f7691e8193283a9b6ba01d5a7072ed` | `b650f03ed07bbce442b3616357e0d04086f7f1d4` |

The isolated worktree is `deckchek-quick-layout-security`, branch
`review/deckchek-quick-layout-security-20261121`. It fast-forwarded cleanly to
the exact final freeze supplied by root, with 2,280 tracked files. Review covers
the [implementation note](QUICK_LAYOUT_IMPLEMENTATION_2026-11-21.md),
the complete `13aa1cd18459e3f4c4fb9d70851196ba4f9c1ea8` delta, the actual
workflow and CSS around it, the two-file pre-execution `e5614ff1` correction,
and the completed
[Mobile export continuation](MOBILE_EXPORT_CONTINUATION_2026-11-21.md) and all
three preceding reports.

Relative to the round-seven freeze, the only changed application/test/tool paths
are `app/styles.css`, `tests/audio-session.test.mjs` and
`tools/smoke/shell-layout.mjs`. The other carried changes are documentation and
retained evidence. This is a Quick Check main-pane follow-up to issue #81;
root's separate Mapper issue #82 is outside this review.

The final freeze's parent is exactly the reviewed preparation. Its correction
changes only the smoke and implementation note; production and test bytes remain
unchanged from `6b854265`. The original preparation was not executed in round
eight. The final three reviewed code/tool fingerprints are:

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `app/styles.css` | 64,321 | `bbc5781bed9bfc89ad459bca0ee2be6369279b4182f4fa11f353a850172e39d6` |
| `tests/audio-session.test.mjs` | 20,678 | `c2aa6917fb9a48bc4802fbc4658b9a0341a2bdcfa16bd808678e4c0589a27b9f` |
| `tools/smoke/shell-layout.mjs` | 9,532 | `6bb9986f0c3339401d06fb03803288224f71399b02861108dd00ecfd03706374` |

## Control visibility, sizing and interaction authority

The [stylesheet](../../app/styles.css) gives `#screen-quick` one explicit
`minmax(0, 1fr)` track and lets its title's inner div shrink. At widths of 600
pixels or less, selectors confined to that screen reduce horizontal padding,
replace the setup, side, source, field and inline-field grids with one shrinkable
column, and allow source descriptions, hints, checklist text, step labels and
buttons to wrap. The footer's primary action uses the available width and loses
its former minimum width. The disabled live-source card receives space above
its contents for the existing desktop-app badge.

The sole new `display: none` declaration removes decorative step-connector
pseudo-elements. It does not target the steps, their numbers or labels, source
choices, fields, notices or action buttons. The change introduces no clipping,
zero opacity, off-screen positioning, hidden attribute, pointer-event override,
focus-outline override or overlay that suppresses an actionable control. Main
retains its existing `overflow: auto` behavior; the layout does not hide an
overflowing pane to make the geometry check pass.

The unchanged [workflow](../../app/ui/workflows/flow.js) still owns state and
interaction. Its source group retains native buttons with radio roles,
`aria-checked`, `aria-disabled` and a roving tab stop. Arrow keys switch the
source, rebuild the setup panel and focus the newly selected button. The browser
path rejects a switch to unavailable live capture, and clicking that unavailable
choice only presents the existing explanatory message. Live availability still
comes from the native capture bridge. CSS supplies no way to grant it.

The file input remains associated with its visible drop label and existing
focus treatment. Analyze file remains disabled until a file is selected; the
new geometry checks describe its placement, not permission to bypass that
condition. The native path retains Continue to capture. Step navigation,
capture cancellation, existing capture-length choices, analysis, file decoding
and export behavior are unchanged.

These are source-derived conclusions. They do not establish actual rendered
dimensions, focus visibility, arbitrary filename/device-label reflow, zoom,
all workflow states or assistive-technology behavior. The authored smoke's
specific states and widths are described separately below.

## Synthetic assertion data and unchanged audio boundary

The [audio-session test](../../tests/audio-session.test.mjs) now stores the
existing `aq_gain_db` measurement in a local constant and includes that value
and `quiet.calls.play[0].opts.levelDbfs` in the assertion's message. The comparison
remains `Math.abs(gain) < 0.1`. The prior -12 dBFS cap assertion and requested
-30 dBFS playback-level assertion remain in the same order before it.

I independently compared the complete test bytes with the round-seven source,
fixed PR #79 and held predecessor. Replacing exactly the old assertion line with
the new two-line spelling reproduces the current file exactly. The fixture,
stimulus construction, calls, thresholds and all other assertions are unchanged.
Six other specified audio implementation/test files are byte-identical across
all four sources: `app/audio-quality.js`, `app/calibration.js`,
`app/devices/audio-session.js`, `app/audio-out.js`,
`tests/audio-quality.test.mjs` and `tests/audio-runner-lifecycle.test.mjs`.

The two newly retained values originate in the existing synthetic test session,
whose fake playback/capture uses generated arrays and fixed test-device labels.
The message introduces no user identifier, raw recording, credential, external
destination or added telemetry. It is assertion output from a synthetic run,
not a measurement from physical equipment. No additional diagnostic collector,
engine flag, numerical algorithm, production log or analysis patch is added.

The unchanged production session continues to compute its selected level with
the existing cap and passes that level and cap to audio output. Source identity
and improved failure text do not diagnose an audio failure or establish a fix
for issue #72. New numeric output, if observed, belongs only to the actual case
and invocation that emits it; it must not be retroactively attributed to an
older failure that retained only a boolean comparison.

## Unchanged permissions, limits and capabilities

I independently compared 21 boundary paths with the round-seven freeze and
their immutable preparation blobs: the feature registry, workflow, audio I/O,
four audio/analysis modules, phone format, Mobile export/QR/store helpers,
native command registry, native capability and Tauri configuration, Cargo
manifest and lockfile, package manifest, and all four workflows. Every byte
matches. The Git delta across application, Mobile, native, test, tool, package
and workflow paths contains only the three reviewed changes above.

There is no new network request, origin, export route, permission, native
command, capability, dependency or file/capture limit. Feature defaults remain
unchanged, including Fleet's default-off state. The native webview's existing
capability still lists core APIs and save/open dialogs; this layout change
does not add opener permission or extend that authority. No claim of general
native or malformed-input qualification follows from these scoped comparisons.

## Authored browser checks and evidence limits

The [shell-layout smoke](../../tools/smoke/shell-layout.mjs) retains its existing
toolbar checks and adds Quick Check checks at 320, 420, 800 and 1440 pixels in
browser and modeled-native states. The modeled-native input name is a fixed
long descriptive fixture. These are authored assertions, pending actual hosted
execution.

The initial preparation counted source, step and action nodes even if they were
hidden. Before the first project execution, root corrected that coverage gap in
`e5614ff1`. The helper now requires positive dimensions, client rectangles,
computed visibility other than hidden/collapse, and positive opacity for the controls it
counts. It also requires exactly one visible selected source matching the
expected browser File or modeled-native Live state. File setup must retain an
enabled file input and its visible associated label; Live setup must retain a
visible enabled duration selector with options. This is a test-coverage
correction, not a product behavior change.

The geometry helper uses the main element's content width and actual element
rectangles. It checks both main/screen scroll widths and internal scroll widths
of the listed visible setup containers, source cards, text, grids and buttons.
It also requires the expected two sources, three steps and one primary action.
This expands coverage beyond document width, which alone can miss overflow
within the main pane.

The smoke then scrolls the primary action into view and checks its size, its
rectangle within the pane and a center-point hit test. At 320 and 420 pixels it
authors separate top-of-pane and action screenshots for each environment. At
420 pixels in the native model, an ArrowRight source switch must select the
file choice, leave focus on the new File-choice button and keep the resulting
file setup within the checked geometry, with the File controls present. It does
not activate recording or file analysis.

The visibility helper and primary hit test provide specific checks rather than
a general accessibility guarantee. These assertions remain bounded to their
selected setup states and widths. A syntax-only result cannot establish their
truth, actual screenshots, disabled-control usability, native hardware behavior,
browser permission UI, touch timing, optical/physical measurements or every
Quick Check capture/results state.

## First complete gate and the retained failure

The functional worker's [first complete result](evidence/quick-layout-functional-2026-11-21/full/result.json)
records one serial Node gate on the final freeze. Root reviewed and authorized
its external recorder and exact-source configuration before execution. The
selection contains every actual and tracked top-level `tests/*.test.mjs` file:
199 sorted, unique paths, without a shell wildcard or added numerical collector.

| Execution item | First recorded outcome |
| --- | --- |
| Source / complete tree | `e5614ff1b8f7691e8193283a9b6ba01d5a7072ed` / `b650f03ed07bbce442b3616357e0d04086f7f1d4` |
| Runtime / platform | Absolute Node `v24.22.3`, Linux x64 |
| Runner arguments | `--test --test-concurrency=1 --test-reporter=tap`, followed by the exact 199-file selection |
| Started, UTC | `2026-11-21T10:10:02.779261+00:00` |
| Completed record, UTC | `2026-11-21T10:16:12.380903+00:00` |
| Child execution elapsed | `369.43505567600005` seconds |
| Budget | 600 seconds; TERM at 595 and KILL by 600 if needed |
| Exit / timeout | `1` / `false` |
| Tests / pass / fail / skip | `2,395` / `2,393` / `1` / `1` |
| Suites / cancellations / TODOs | `0` / `0` / `0` |
| Complete TAP | 549,295 bytes; SHA-256 `f90ff51c2829b6eb9c172d0d1cda81e4e845f3d95706063764d2c56dbdbeec9a` |
| Stderr | Empty |
| Source after execution | All 2,280 hashes and inventory unchanged; same HEAD/tree; clean |

I independently parsed every top-level subtest header and ordered outcome in
the [complete TAP](evidence/quick-layout-functional-2026-11-21/full/run.tap),
the single `1..2395` plan and each footer count. Every case agrees with the
[ordered summary](evidence/quick-layout-functional-2026-11-21/observed-summary.json).
Case 950 is the optional local Mixxx-corpus check, skipped because its corpus
environment variable is unset. There is exactly one `not ok` outcome, case 53.

That failure points to the actual frozen test declaration at line 89 and its
final assertion at line 95. The retained message is:

> gain is relative to the played level: measured -101 dB at -30 dBFS

The test reached that assertion after the requested -3 dBFS playback had been
asserted to be capped at -12 dBFS and the requested -30 dBFS playback had been
asserted to remain -30 dBFS. The failure therefore concerns the computed relative
gain, not those preceding playback-level conditions. Its measured value belongs
to this current synthetic invocation. The message does not establish an audio
algorithm cause, physical-device behavior or a regression introduced by CSS.

Case 22, the cubic-nonlinearity test, and case 37, capture failure followed by
Try again, both passed in this current first run. I also matched each of the
45 preceding focused Mobile case names to exactly one passing current outcome.
The four actual Results-screen cases are now cases 1226–1229 and all passed.
Those outcomes use their existing DOM/action doubles; they do not supply browser
layout, actual share-sheet or physical-device qualification.

## Recorder identity and separate syntax outcome

I read both complete recorders as text. Each checks the frozen source and clean
status, refuses to reuse its first-outcome directory, writes complete first
streams directly to new files, and records full source maps before and after
its authorized command. The full recorder's exact selection is checked against
both tracked and actual top-level test files. The syntax recorder additionally
requires its before map to equal the full gate's after map.

| Recorder or configuration | SHA-256 |
| --- | --- |
| Full-gate recorder | `281e043de5ebc64a612bbe1e8883805c810ea3592536702258da1cb4f1547b3c` |
| Executed frozen-source configuration | `63edeb575e417f56587d0fbf428044ab04f3ea67f9a7367dcd4dc283bfaeb9ff` |
| Preserved, unexecuted preparation configuration | `6a3b8dc57f3122e0bb3473600f00ee5afe2a7b374837e3bdef521c03d6732766` |
| Syntax recorder | `4e1b15c9cb0555e8623a38d34680668baef7176cc02449bc71312925a5d867f2` |

Only the source commit and complete tree differ between the two configurations;
the selection, file counts and budget are identical. The preparation configuration
remains available separately and is not represented as an executed result.
Recorded `NODE_OPTIONS`, `DECKCHEK_AUDIO_CONTEXT_PATH` and every
`DECKCHEK_AUDIO_FIT_*` variable were absent. The full recorder prepended the
absolute Node directory to PATH and obtained runtime metadata separately. Those
recorded parent details do not diagnose unobserved child argument expansion.

The [one separate syntax result](evidence/quick-layout-functional-2026-11-21/syntax/result.json)
records the same absolute Node executable with
`--check tools/smoke/shell-layout.mjs`. It started at
`2026-11-21T10:17:34.914166+00:00` and completed its record at
`2026-11-21T10:17:35.109149+00:00`. It exited 0 in
`0.11426679999931366` seconds without timeout, within its 30-second budget.
Both stdout and stderr are empty. It parsed the smoke without evaluating the
module or launching a browser.

The retained 9,532-byte checked smoke equals its immutable frozen Git blob and
both recorded source digests. Both additional 2,280-entry maps, clean status and
HEAD/tree remained unchanged. The syntax result binds the exact complete-gate
result, SHA-256
`39fbb3a9fce6ae010ef5ebaad249d7a30ec3d7fc814b57f68668375bc9b0859e`.
The syntax result's own SHA-256 is
`4baeda1e9e4977587dd8ae2f4a28e7aaefb7baa755f476eea573a279ebed1b86`.

## Independent final-package verification

The final [manifest](evidence/quick-layout-functional-2026-11-21/manifest.json)
has SHA-256
`9445d5bf0336f3818bbfc69d1c7cb9d03d3a984b8e2eaeda0df0c18614d9aa29`.
I independently verified exact package membership and every size/hash for all
22 entries, excluding the manifest itself. All 21 original-path bindings for
18 unique retained copies exist and match byte for byte. The nine-file original
full directory and eight-file original syntax directory each match their retained
directory exactly. The external recorder/configuration bindings and preserved
unexecuted configuration also match.

Each of the four complete source maps was compared with all 2,280 immutable
Git blob digests at `e5614ff1`, not merely with another recorded map. I read Git
objects directly, checked their blob object identities and computed their
SHA-256 values independently. Every ordered TAP outcome, summary value,
selection, running/result identity, failure-value binding, empty stream and
syntax-source binding agrees. This lane used an independent standard-library
data reader and Git reads; it did not run the packaged verifier or any project
implementation.

The [source comparison](evidence/quick-layout-functional-2026-11-21/source-comparison.json)
also matches the exact two-path pre-freeze correction, the three changed code/tool
paths after round seven, six unchanged audio paths across all four cited sources,
and the exact assertion-line replacement. All 34 Mobile files are byte-identical
to round seven. The seven shared/vendor pairs and vendor VERSION agree; an
independent calculation from the frozen file hashes yields the unchanged stamp
`8f12f05a2c38` and the same 33 ordered precache entries.

There was no separate official Mobile build invocation in round eight. The
existing full-suite Mobile build tests invoke the build helper in check mode
and exercise writes inside a temporary-copy fixture. The final derived summary
and source comparison explicitly retain this distinction. That wording
clarification changed no raw output, source map, recorder, configuration or
outcome. It does not imply that build-helper code never ran inside the authorized
complete suite.

## Preserved predecessor evidence and remaining qualification

The predecessor [complete-gate result](evidence/inventory-mobile-functional-2026-11-21/result.json)
belongs to `09c9afc`: 2,391 cases, 2,388 passed, two failed and one optional case
skipped, exit 1. Its original TAP remains SHA-256
`bf5b091c0a20826a64cac1842d0d5b057a5dc91a46c5a68ebcca1b9e60f50eaa`.
The source comparison's predecessor result digest, source/tree, counts, exit and
TAP digest match the retained frozen records. I separately read its two failure
blocks and passing cubic result.

| Case | Held predecessor | Current first complete gate |
| --- | --- | --- |
| 22, cubic nonlinearity | Passed | Passed |
| 37, capture failure then Try again | Failed the final analysis verdict; balance, response and polarity failures were retained. | Passed in this invocation. No cause or numerical repair is established. |
| 53, level-cap/lower-level session | Failed the final relative-gain assertion after both playback-level assertions completed. No numeric gain was retained for this case. | Failed the same comparison; its message now retains -101 dB at -30 dBFS. Both preceding playback-level assertions completed. |

The current case 53 value cannot be assigned to its older failure. The earlier
case 37's numeric retry payload also cannot be used as a substitute for the
older case 53's missing value. Passing case 37 now does not erase its first
predecessor failure or establish the reason it differed.

The completed round-seven [Mobile export report](MOBILE_EXPORT_FUNCTIONAL_AUDIT_2026-11-21.md)
retains its own 45/45 focused gate, official build and syntax outcome. Those
outcomes are separate from the current complete run, whose matching Mobile
cases independently passed. The durable held checkpoint at
`8664c590709dce34445bf23008e61053b592d608` and the earlier records retain their
original meaning.

Fixed PR #79 at `f7690876` has its separate
[hosted evidence](FEATURE_SUCCESSOR_HOSTED_EVIDENCE_2026-11-21.md), including
2,359 JavaScript cases with 2,358 passes, no failures and one optional skip,
plus 1,411 passing UI checks. Those results belong to that earlier source and
do not qualify the new Quick Check CSS or smoke. Actual hosted rendering,
remaining applicable platform gates, physical qualification and root's guarded
publication/merge decisions remain separate.

The general checkpoint and continuation handoff at the frozen source still
contain round-seven in-progress wording. The completed
[Mobile export continuation](MOBILE_EXPORT_CONTINUATION_2026-11-21.md), retained
first outputs and this round-eight report provide the source-specific completed
state; root should refresh the general resume wording during consolidation.
This documentation drift does not change any recorded execution outcome.

**This defensive audit is complete. Complete-source qualification remains HELD
on the current first gate, and issue #72 remains unresolved.** This lane made
only its owned report change. It performed no project execution, numerical
diagnosis, browser/native launch, scanner/probe, remote mutation, publication,
deployment or merge qualification.
