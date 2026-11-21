# Player reference identity and PDF axes — initial functional audit

Reviewer/executor: `/root/reference_functional_round1`. Date: 20 November 2026,
America/Los_Angeles. This distinct initial worker round began after all three
fresh player-capture workers completed. This lane was the sole local project
runtime executor for the reference/PDF round.

## Disposition

**The corrected source passed its first focused Node run: 132/132, zero failures,
zero skips, exit 0.** No remaining functional blocker was identified within the
covered reference-file and PDF-axis contracts. Independent fresh acceptance and
the combined full suite remain next; browser/native/platform/hardware and
scientific qualification are separate.

The exact prepared PDF candidate also passed its original 28-case file in a
separate execution. That result is retained with its narrower source and case
coverage. It did not establish that the original numerical correction covered
the rounded-span defect found during this round's static review.

I read the [implementation contract](PLAYER_REFERENCE_IMPLEMENTATION_2026-11-20.md)
and completed player-capture [functional](PLAYER_CAPTURE_FUNCTIONAL_ACCEPTANCE_2026-11-20.md),
[code](PLAYER_CAPTURE_CODE_ACCEPTANCE_2026-11-20.md) and
[defensive](PLAYER_CAPTURE_SECURITY_ACCEPTANCE_2026-11-20.md) handoffs. I then
read the actual file helper, screen/default dependencies, maintained screen
fixture, acquisition/evidence paths, PDF projection/warning path and both smoke
consumers. I authored only the assigned maintained tests/smokes and evidence;
root owned both production corrections described below.

## Exact source binding

| Role | Commit / tree |
| --- | --- |
| Initial combined source | `e280dac39b435d2ce8175b558c71a69d1a3e5182` / `c6262fad09442916170c432211a671db7ec54aa7` |
| Original prepared PDF candidate, executed separately | `5cc916eefbeb3e174edf9bdbcd6c731d6776e56d` / `f0c06c626acc477a2191f23653b7d42a37cbba8b` |
| Coordinated corrected production | `447019568d6a0cc0ce0fe16412e9ac99c204f604` / `81807e58e03c6dd51740ef469e2c2450b20d5784` |
| Maintained test/smoke source and actual focused execution | `dd11f41dc41e102ddd8bf7f34e87153afa994f59` / `d6272a78da9791fc40cb0cdeff238cb68d979c5f` |

The final executed source's `app`, `src-tauri`, `database` and `.github` bytes
match the corrected production exactly. The correction from initial `e280dac`
changes only `app/report-pdf.js` and `app/ui/screens/player-capture.js`. Original
candidate #73 changes exactly `app/report-pdf.js` and `tests/report-pdf.test.mjs`
against qualified main `099c99c`. Original candidate ancestry remains intact.

This lane's maintained code commit changes five paths: the new
[reference helper tests](../../tests/player-reference-file.test.mjs), expanded
[screen tests](../../tests/player-capture-screen.test.mjs),
[PDF tests](../../tests/report-pdf.test.mjs), and hosted
[player](../../tools/smoke/player-capture.mjs) and
[PDF](../../tools/smoke/pdf.mjs) smokes. Existing capture lifecycle expectations
are preserved. The export key assertion was intentionally extended to the new
`selectedReference` member, with explicit null for captures without a file.

## Two coordinated corrections

The code reviewer found that finite endpoints `-8e307` and `8e307` can round to
finite bounds `-1e308` and `1e308`, whose difference is infinite. The original
candidate checked endpoint/step finiteness but omitted this final span. Root's
correction checks finite positive rounded span before tick/projection output.
The expanded ordinary numerical regression checks both X and Y axes, the visible
`Chart unavailable` HTML warning, and continuing finite SVG output for normal,
representable tiny and large ranges. The original 28-case run is not rewritten.

The defensive reviewer found that the file-selection handler previously checked
inactive/busy ownership before clearing the input. A delivered late change could
therefore leave a File attached to a refused picker. Root's correction snapshots
the delivered File and clears the input before calling the guarded consumer.
The new ordinary lifecycle tests assert immediate value clearing even when
hidden, disposed, capture-busy or already reading, with no extra inspection or
capture. No security exploit, adversarial probe or native-picker reproduction
was performed. Browser `files.length` behavior is left to the authored smoke.

## Actual execution and evidence

All four invocations used Node **v24.22.3**, executable
`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`, Linux x64.
The complete logs and runtime details are in the
[evidence directory](evidence/player-reference-functional-2026-11-20/README.md).

| Invocation | Result | Source integrity |
| --- | --- | --- |
| Exact original candidate, `tests/report-pdf.test.mjs` | **28/28**, exit 0; 0.362641201 seconds | 1,655 tracked hashes unchanged; exact commit/tree and clean checkout preserved. |
| Corrected combined eight-file selection | **132/132**, exit 0; 1.613388634 seconds | 1,908 tracked hashes unchanged; exact commit/tree and clean checkout preserved. |
| Player smoke `node --check` | Exit 0; empty output | Same 1,908 hashes unchanged; parsing only. |
| PDF smoke `node --check` | Exit 0; empty output | Same 1,908 hashes unchanged; parsing only. |

No timeout, cancellation, skip or TODO occurred in either test invocation.
The two selections overlap and are not additive. The combined selection includes
`player-reference-file`, `player-capture-screen`, `report-pdf`, `cdj-acquisition`,
`cdj-evidence-record`, `features`, `jobsheet-pdf-redaction` and `m6-reports`.
It ran serially with `--test-concurrency=1`; no repeated or broad full suite was
run in this initial lane.

The combined run started `2026-11-21T06:54:20.229871+00:00` and finished
`2026-11-21T06:54:21.843260+00:00`. Its complete TAP is **29,628 bytes**, SHA-256
`95abf54baa565c395efb52d761339810e1f69f02eecd180a516190844d7325cc`.
The original PDF run's complete TAP is **5,758 bytes**, SHA-256
`3d3fd808003cc8c31e28adf0049538e176a013f89ae06f7eacc6f14213b3b3c5`.
Both syntax outputs have the SHA-256 of empty bytes; they contain no test counts.

The [recorder](evidence/player-reference-functional-2026-11-20/run-command.py)
and all raw results stayed outside the checkout through execution and before/
after snapshots. Afterward I copied them byte-for-byte into this owned evidence
directory. The [static verifier](evidence/player-reference-functional-2026-11-20/verify-evidence.py)
checked all four inventories against **1,834 distinct immutable Git blobs**,
not just against one another, and checked source comparisons, complete log
lengths/hashes/counts and original Spec 10 bytes. It imports no app or test.

## Tested reference behavior

The ten helper cases call the actual `inspectPlayerReferenceFile` and existing
SHA-256 implementation. They verify the known `abc` digest, equal bytes under
different names/MIME types, different bytes under the same name, exact 32 MiB
acceptance with an independently computed digest, rejected size/name metadata,
actual-read length/type, read failure, pre-read/during-read/during-digest
cancellation, immutable metadata-only output and pre-await name/size snapshots.
The digest-pending case models only the Web Crypto completion boundary; ordinary
digest cases execute the real helper. No file content is decoded or claimed to
be an audio reference merely because its filename/MIME resembles one.

The screen file now contains thirty cases: all sixteen previous cases plus
fourteen reference-consumer cases. They exercise real screen handlers and the
existing real acquisition controller with modeled DOM/native capture. The
default file inspector is exercised with actual Node File objects; delayed
dependency completions separately make lifecycle behavior deterministic.

Coverage includes browser-preview file preparation with capture still refused;
filename fallback versus an entered track label; the same selected digest in
the record and export descriptor; no waveform/byte-buffer export; unchanged
unverified/report-ineligible/measurement-null status; one read at a time;
capture/new-selection refusal while hashing; clear/Escape/hide-show/real-shell
navigation/feature disable/disposal and late descriptor rejection; refused
picker input cleanup; capture snapshots; failed new-selection removal of old
details; and completed-selection clearing when leaving. A logical cancellation
does not claim to abort a File read or securely erase its bytes.

## Hosted smoke and remaining boundaries

Both changed smokes passed syntax checks only. **No Chromium launch was retried.**
The earlier socket-EPERM failure occurred before any page/smoke body, and remains
environment evidence. No screenshot or print PDF exists from this lane.

The player smoke is authored to use the real browser File input and hash helper,
check the cleared FileList, keep browser capture disabled, render filename/hash
on desktop/mobile layouts, verify the real download's additive metadata and
unchanged qualification, and clear the selection on explicit clear/feature off.
The PDF smoke is authored to render an ordinary chart alongside rounded X/Y
unavailable placeholders, check visibility/font size and finite SVG coordinates,
and retain a PNG and Chromium PDF when it actually executes on a hosted runner.
Those future artifacts and checks are not reported as completed here.

The prior 2,332-case player full-suite result applies to its earlier `f081881`
source. It is not a full-suite result for this successor. The original Node24
cubic-THD failed TAP remains byte-identical; issue #72 remains unexplained.
The earlier 33-test audio selection does not establish original predecessor
order. Issue #69 and Spec 02 AC-6 remain open/unchanged. Fleet remains default-off
with its fixed diagnostic head, original timing failures and unchanged threshold.

Reference/raw retention, audio-format/reference validation, pitch analysis,
History/report persistence and scientific/physical qualification remain open.
No native command, permission, dependency, migration, workflow, release,
deployment or remote mutation was added by this lane. Root should consolidate
all three initial reports and hand the exact combined source to fresh code,
functional and defensive workers. Rebind execution if maintained source changes.
