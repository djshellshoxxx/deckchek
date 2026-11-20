# Defensive privacy review — round 8

Date: 19 November 2026 (America/Los_Angeles).

## Result and reviewed source

**Accepted the job-sheet PDF structured-serial correction within its documented
scope. No production regression or additional correction was identified by this
static review.**

- Reviewed commit: `a8611f66117169495365d846f5f6a31b22dfa87d`.
- Reviewed tree: `bb3e4c67483a3b549d8f15a29928f6896e5a37fc`.
- Original author commit: `3e0aa21febf3fdea2c1166d9a9fb149ec934fda6`.
- The original author commit and reviewed integration commit have the same tree.
- Review branch: `review/deckchek-security-round8-20261119`.

Only this report is changed by round 8. Production source and existing test files
were inspected as text. No application tests or rendering were executed.

## Contract trace

The existing shared PDF helper reads `pdf.redactSerials` through
[`readPdfSettings()`](../../app/report-pdf.js). `composePrintable()` normalizes
its options again before supplying the registered builder's context. Both paths
use strict Boolean normalization: only the Boolean `true` enables redaction.
The builder therefore consumes a normalized option in the supported registered
printable path.

[`jobSheetPrintable.build()`](../../app/report-kinds/jobsheet.js) now constructs a
new detail object and a new asset object when redaction is enabled and an asset
is present. Its only substituted field is a nonempty `asset.serialNumber`, using
the existing `[redacted]` marker. The original detail, asset and stored serial
remain unmodified. The existing renderer reads that display copy; comparison,
customer/cost choices and other detail fields keep their previous paths.

[`jobSheetModel()` and `renderJobSheetHtml()`](../../app/service.js) still omit
empty serial values and absent assets. The new builder follows that behavior;
it does not manufacture a marker or serial row for those cases. When redaction
is disabled, the original detail is passed through unchanged.

The Service HTML export in
[`service-job.js`](../../app/ui/workflows/service-job.js) still calls
`composePrintable()` with its CSS option and without the PDF settings. Its
existing unredacted default remains. The PDF action still reaches the shared
PDF helper and therefore supplies the selected PDF setting. The correction does
not modify either export's customer/cost option snapshot or lifecycle guards.

## Review axes

| Axis | Static assessment |
| --- | --- |
| Specification | The registered job-sheet builder implements the structured-field behavior now stated in [FS-03 section 7](../specs/03-pdf-reports.md#7-errors-edge-cases-privacy-security). |
| Correctness | Normalized redaction changes only the display copy's nonempty structured serial. |
| Source preservation | Nested detail/asset copies avoid assignment into saved input; the inspected new tests use deeply frozen source records. |
| Compatibility | Default and explicitly disabled output, direct HTML, absent/empty serials and independent customer/cost choices retain their previous behavior. |
| Privacy boundary | Structured-field redaction is honored; nickname, note, caption and filename scanning is explicitly excluded. |
| Certificate integrity | The correction changes only the job-sheet production builder. Certificate model, API, printable, signing and native certificate files have no changes in this commit. No signature claim is made. |
| Scope and evidence | One production file was changed by the author. This successor performed source and recorded-log inspection only. |

## Tests and report wording inspected

The four cases in
[`jobsheet-pdf-redaction.test.mjs`](../../tests/jobsheet-pdf-redaction.test.mjs)
exercise the registered composer, including settings normalization, frozen
source, independent customer/cost inclusion, default/direct HTML behavior and
absent/empty serials. They do not purport to validate native PDF output or remove
serial copies from free text.

The predecessor's [round-7 report](SECURITY_AUDIT_ROUND7_2026-11-19.md) and the
FS-03 clarification accurately describe the implemented scope. The retained TAP
summaries were read without executing their commands:

| Predecessor artifact | Recorded result |
| --- | --- |
| `/tmp/deckchek-jobsheet-redaction-red.log` | Four cases: 2 passed, 2 failed, zero skipped; 184.68746 ms. |
| `/tmp/deckchek-jobsheet-redaction-green.log` | Related scope: 60 passed, zero failed, zero skipped; 755.917061 ms. |

These remain the author's execution evidence. Reading the logs and confirming
source-tree equality is not an independent rerun. Root's combined-source tests
and hosted/browser/platform gates remain separate qualification.

## Durable successor handoff

The accepted correction is ready for inclusion in the coordinator's combined
qualification. A successor should start from the current published continuation
and its actual results, not repeat the unchanged four composition cases solely
because this report exists.

The previously documented nickname/filename duplication boundary remains a
separate cross-kind privacy-contract decision. `newUnitNickname()` may contain
a serial, and the composer uses the nickname in display metadata and filenames.
This is not a new round-8 finding and does not negate the narrower structured
field correction; no complete anonymization should be claimed. Any future
change to that broader contract should state which derived labels and
user-authored text it changes and preserve signed certificate semantics.

Concurrent Data-import and delayed-announcement work belongs to its respective
workers and was not reviewed here. This review performed no payload construction,
external probing, network access, browser/native execution or production edits.
