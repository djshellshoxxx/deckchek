# Player reference-file identity and PDF axes — initial code audit

Reviewer: `/root/reference_code_round1`. Date: 20 November 2026,
America/Los_Angeles. This distinct round began after all three fresh
player-capture workers completed. Only this report is authored by this lane.

## Disposition

**Accepted for the bounded static production scope at corrected source
`447019568d6a0cc0ce0fe16412e9ac99c204f604`. No remaining blocking finding was
identified in that scope.** I also inspected maintained test/smoke successor
`dd11f41dc41e102ddd8bf7f34e87153afa994f59`; its production bytes are unchanged.
The original PDF candidate was incomplete: this review found a missing final
rounded-span check, which root corrected. I independently inspected the separate
defensive worker's late-picker-retention correction as well.

This lane used source/Git inspection, arithmetic reasoning, JSON/TAP reading and
byte/hash comparisons. It ran no application, test, browser, native build,
generator, benchmark, scanner, probe or vulnerability reproduction. Functional
execution, fresh combined-source acceptance, hosted UI/native/platform gates,
physical/scientific qualification and release remain separate. No production
edit or remote action was performed by this lane.

## Source binding

| Role | Commit | Complete tree |
| --- | --- | --- |
| Assigned combination | `e280dac39b435d2ce8175b558c71a69d1a3e5182` | `c6262fad09442916170c432211a671db7ec54aa7` |
| Corrected production | `447019568d6a0cc0ce0fe16412e9ac99c204f604` | `81807e58e03c6dd51740ef469e2c2450b20d5784` |
| Inspected test/smoke successor | `dd11f41dc41e102ddd8bf7f34e87153afa994f59` | `d6272a78da9791fc40cb0cdeff238cb68d979c5f` |
| Prior player/usage runtime freeze | `f081881d4979e4385f255163660258784e27a264` | `39d4351da05fc1fc65f555874824555d96df5cd3` |

Prepared PDF head `5cc916eefbeb3e174edf9bdbcd6c731d6776e56d` changes exactly
`app/report-pdf.js` and `tests/report-pdf.test.mjs` against main
`099c99c055322ef668be23e6ae50a2968614cc6d`. It remains an ancestor. Root's
`795d437361d5123b2ff242ed97956511d7d2af15` adds the rounded-span guard; child
`4470195` resets the picker input earlier. The `dd11f41` successor changes five
test/smoke files only. My worktree fast-forwarded through those identities and
stayed clean until this report was added.

These revised working files match their immutable production blobs:

| Path | SHA-256 |
| --- | --- |
| `app/player/reference-file.js` | `d20d1f245e3c446d4e1641fee8503d1e50a3fa4620c238395ae4623e936e6889` |
| `app/ui/screens/player-capture.js` | `2bcec279d3099217570d66ee81006e30b414647e77b07651b21448e21ae7af3e` |
| `app/styles/player-capture.css` | `69c19c4e58fc5853d257c80a6ba2b6681b278ccdf339c305dba9fb8de496e2cc` |
| `app/report-pdf.js` | `84a269d9fc4e6dff067c25006fa4805ffb8ae30e434919d5d2010f1b21bc69a2` |

I read the [implementation contract](PLAYER_REFERENCE_IMPLEMENTATION_2026-11-20.md)
and completed prior [code](PLAYER_CAPTURE_CODE_ACCEPTANCE_2026-11-20.md),
[functional](PLAYER_CAPTURE_FUNCTIONAL_ACCEPTANCE_2026-11-20.md) and
[defensive](PLAYER_CAPTURE_SECURITY_ACCEPTANCE_2026-11-20.md) reports. Those
reports still match their original commits and SHA-256 values. Their runtime
claims concern the prior source, not the new reference/PDF implementation.

## Resolved finding: rounded PDF span overflow

The prepared candidate checks finite input endpoints, raw/chosen steps and
rounded endpoints. Finite endpoints do not imply a finite difference. In the
actual [chart source](../../app/report-pdf.js), an X range around
`[-8e307, 8e307]` with six steps can select `5e307` and round to `-1e308` and
`1e308`. Both bounds are finite, but their difference overflows. A projected
offset can also overflow and yield a nonfinite coordinate when divided by that
span. The four-step Y path has the same defect. This is a source-arithmetic
finding, not a runtime reproduction by this lane or a real device observation.

Root now computes `span = hi - lo` and rejects a nonfinite or nonpositive result
before ticks/rendering. The existing `unrepresentable axis range` exception
reaches `chartsHtml`, which emits its escaped visible `Chart unavailable`
placeholder and warning. The renderer already filters points to finite numeric
coordinates and uses fixed finite drawing dimensions; both projections now use
axes with checked positive finite denominators. Normal tick selection, chart
data, filtering, thresholds and stored measurements are unchanged.

The [maintained PDF assertions](../../tests/report-pdf.test.mjs) at `dd11f41`
add both rounded X/Y span cases, direct count-four/six checks and finite-output
checks for ordinary, representable tiny and representable large axes. They
retain the original raw-overflow/underflow and visible-warning assertions.

This does not establish general extreme-axis precision or readability. The
pre-existing `Number(v.toPrecision(12))` cleanup can coalesce ticks for a narrow
range near a large offset, for example approximately `1e12` through `1e12 + 1`.
That is separate from malformed SVG and was not changed speculatively. Root
accepted the qualification. At the actual precision of 12 significant digits,
the largest finite binary64 value rounds downward, so a separate claim that
this conversion itself overflows is not established. No numerical sweep or
native print result is attributed to this reasoning.

## Reference-file and consumer review

The [helper](../../app/player/reference-file.js) imports only the unchanged
[SHA-256 helper](../../app/sha256.js). It checks a positive safe integer size
up to 32 MiB, a nonblank name bounded to 240 UTF-16 code units without control
characters, and a byte reader. It checks that the returned ArrayBuffer matches
the captured size and hashes those exact bytes. Its frozen return contains only
primitive metadata fields; it retains no File or buffer in that descriptor.
The resource cap is a preview input limit, not an audio-format/duration claim.
There is no decode, playback, frequency inference, upload, storage or path
discovery. The picker filter is convenience, not content validation.

| Boundary in the real [screen](../../app/ui/screens/player-capture.js) | Source finding |
| --- | --- |
| Picker delivery | The revised handler snapshots the File and resets input value before lifecycle rejection. Thus clearing is requested even for a delivery after hide/dispose, capture start or an earlier read. This independently verifies the defensive worker's coordinated correction; actual browser FileList behavior remains a hosted-smoke gate. |
| Ownership | A distinct request/AbortController owns each read. Both handlers and controls refuse another read or capture while it is pending. Hidden/disposed/busy handlers cannot start inspection. |
| Cancellation | Clear, Escape, hide and disposal invalidate publication and clear selection. Busy ownership persists until the original promise settles. The helper checks cancellation before read and after each await; the consumer also requires task identity, unaborted signal, visibility and an undisposed owner. |
| Late results and failure | A stale result cannot become selected after hide/show; a failed read cannot restore the old file. Cleanup clears only its matching task and avoids updates after disposal. |
| Previous results | Selecting or clearing a file discards prior capture metadata. Capture blocks file changes. The previous hash cannot be exported as a newly chosen reference. |
| Capture snapshot | The completed immutable descriptor is snapshotted before acquisition. Its hash enters the existing record field; the operator label takes precedence over the filename fallback. |
| Export | State and JSON explicitly select acquisition, record and `selectedReference`, using null for no file. File bytes, waveform and the full acquisition result are not retained in that export. |
| Truthful display | Filename/hash/errors use text rendering. Played reference identity says Not verified, and the export disclosure includes filename/hash. A known byte identity does not confer playback or calibration evidence. |

Cancellation suppresses publication; it does not physically abort a File read
or running digest, erase memory or remove earlier downloads. The File/buffer
can remain within the pending async operation until settlement. The contract
states those limits. Existing operator forms, feature settings and shared-pair
settings retain their prior behavior.

The unchanged [acquisition](../../app/player/acquisition.js) and
[evidence constructor](../../app/player/evidence-record.js) snapshot/validate
source fields and freeze the record. A known hash can remove a missing-hash
reason; it cannot change `unverified`, `eligibleForReport: false`,
`measurement: null` or the independent-validation requirement. Reference
version/frequency, raw retention, analysis and uncertainty remain unknown.
No History write, report registration or scientific measurement is introduced.

The unchanged [feature registry](../../app/features.js) keeps Player capture
and Fleet off by default. The actual [shell](../../app/ui/shell.js) still calls
hide on navigation/disablement. Native capture guards, owned leases and the
1–30-second single-pair boundary remain intact. New CSS extends the existing
field grid and wraps hashes; source reading does not establish rendered layout.

## Maintained test and smoke inspection

I read all five changed paths at `dd11f41`, independently confirming that its
production tree matches `4470195`. The new ten-case
[helper file](../../tests/player-reference-file.test.mjs) uses real Node File
objects, known and independently computed digests, exact byte limits, failures,
cancel-before/during-read/during-digest, and pre-await filename/size snapshots.
The expanded [screen cases](../../tests/player-capture-screen.test.mjs) retain
the original capture assertions and add real helper/controller checks for null
and selected metadata, label fallback, busy guards, cancellation, late delivery,
hide/show, actual shell navigation/feature disablement and disposal. The DOM is
modeled; its value-reset assertion does not itself simulate browser FileList
clearing or prove layout. The original export-key assertion is updated to the
documented additive metadata field, with qualification/no-audio checks retained.

The [player smoke](../../tools/smoke/player-capture.mjs) authors actual browser
File selection, FileList clearing, exact digest, public opt-in, metadata download
and clearing checks with a modeled native capture boundary. Its `abc` fixture
is explicitly identity-only, not validated audio. The
[PDF smoke](../../tools/smoke/pdf.mjs) adds two visible print placeholders beside
an ordinary SVG chart, checks finite SVG/readable geometry, and retains a PNG
and Chromium PDF when executed. It uses the already-loaded print CSS. These
are inspected assertions, not browser/PDF results from this lane. The functional
worker's reported 132/132 focused result belongs in its own complete evidence
handoff; I do not substitute a message for independently inspected run logs.

## Preserved evidence and remaining gates

I matched the prior fresh full TAP with its
[metadata](evidence/player-capture-acceptance-2026-11-20/full-suite.json):
534,094 bytes, SHA-256
`253caf6728565590e5f7ffab76287776a6cedcecbba3ffe8ecb88fcb9c423bc1`,
2,332 total / 2,331 pass / zero failures / one optional skip on exact `f081881d`.
It does not test the new reference/PDF bytes. The original failed TAP still has
SHA-256 `39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197`.
Issue #72 stays unresolved. The earlier 33-test diagnostic does not establish
the original full-suite predecessor order; passing observations prove no cause
or audio repair.

Native/database/workflow/feature-registry bytes, original
[Spec 10](../SPEC-10-CDJ-media-player-diagnostics.md) requirements and
[Spec 02 AC-6](../specs/02-diagnostics-bundle.md) remain unchanged from `f081881d`.
Root should update only Spec 10's implementation note with the final reviewed
reference status. Issue #69 and the fixed Fleet diagnostic, retained failures,
thresholds and default-off state remain. No new permission or dependency is added.

The earlier local Chromium socket-EPERM failure still precedes page/module
execution and supplies no screenshot or rendered success. No retry/workaround
was attempted here. Actual hosted UI/download/print, native/platform and
physical/scientific qualification remain separate. The next fresh-worker set
must bind final tests and evidence to the combined source. Retained raw/reference
bytes, pitch analysis and History/report persistence are still unfinished.
