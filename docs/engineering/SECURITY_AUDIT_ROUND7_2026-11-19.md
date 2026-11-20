# Defensive privacy review — round 7

Date: 19 November 2026 (America/Los_Angeles).

## Result

**Confirmed and corrected the job-sheet printable ignoring the existing PDF
serial-redaction option.** The correction is confined to the structured
`asset.serialNumber` field and does not edit saved records or change customer,
cost, direct HTML, certificate-signing or other report behavior.

This follows the source-only observation in
[round 6](SECURITY_AUDIT_ROUND6_2026-11-19.md). Starting source:

- Commit: `5c8d4ff4c96dc0d0418e6a3c7f0a27f504772f42`.
- Tree: `fd2a8c9c2254d1e5ad88df9ef3f97f05d7b6ae09`.
- Worker branch: `fix/deckchek-security-round7-20261119`.

## Contract and correction

[FS-03 sections 3, 5 and 7](../specs/03-pdf-reports.md) describe the PDF serial
redaction option. `readPdfSettings()` and `composePrintable()` already normalize
that option and supply it to registered printable builders as
`ctx.options.redactSerials`. The built-in device report already substitutes
`[redacted]` for a nonempty structured serial using a copied asset.

Before this correction, the `jobSheet` builder passed the original detail directly
to `renderJobSheetHtml()`, regardless of that option. Two normal composition
checks failed: the selected redaction setting left the serial in the printable,
and the expected marker was absent when customer/cost inclusion was enabled.
Default behavior and absent/empty-serial controls passed.

The job-sheet builder now copies the detail and asset only when serial redaction
is requested, substitutes the same marker for a nonempty structured serial, and
passes that display copy to the existing renderer. No renderer, state, database,
PDF backend or shared option normalization changed. Empty serials and absent
assets do not gain a marker or serial row. A deeply frozen source fixture remains
unchanged through composition.

Customer and cost choices retain their own independent options. The existing
strict Boolean normalization remains: the string `"true"` does not enable the
setting. Direct Service HTML export calls the composer without PDF settings, so
its existing default remains; the direct renderer also keeps its original data.

## Review axes

| Axis | Assessment |
| --- | --- |
| Specification | Applies the existing FS-03 option to the registered FS-22 job-sheet structured serial field. |
| Correctness | The display copy changes only the nonempty structured serial when the normalized option is enabled. |
| Privacy | Selected structured-field redaction is honored; customer and cost opt-ins remain independent. |
| State and compatibility | Source records are immutable in the new test; defaults, empty fields and direct HTML retain existing behavior. |
| Change size | One production builder changed; no shared helper, native command, feature flag, threshold or security gate changed. |
| Qualification | Normal printable composition and related JavaScript tests only; no browser/native PDF rendering claim. |

## Verification

Node 22.23.4 executable:
`/workspace/scratch/0a7bc3583588/toolchain/node_modules/node/bin/node`.

Before the production edit, the four new ordinary composition cases produced
**2 passed / 2 failed / 0 skipped**. Log:
`/tmp/deckchek-jobsheet-redaction-red.log`.

After the correction, the following serial scope passed **60 tests, zero
failures, zero skips**, in **755.917061 ms**:

- `tests/jobsheet-pdf-redaction.test.mjs` — four new cases.
- `tests/service.test.mjs`.
- `tests/report-pdf.test.mjs`.
- `tests/service-pii-leak.test.mjs`.

Log: `/tmp/deckchek-jobsheet-redaction-green.log`.
Whitespace validation passed. Root must qualify the combined source through its
applicable gates. This worker performed no full-repository suite, browser launch,
native build, physical PDF check, network probe or remote publication.

## Explicit limit and successor handoff

This is **structured serial-field redaction**, not complete anonymization.
Nicknames, notes, captions, titles and filenames are not scanned for a duplicated
serial. In particular, `newUnitNickname()` can generate a nickname containing the
serial, and the job-sheet printable uses a nickname in its header and suggested
filename. The pre-existing device printable also uses nicknames. This is a
separate cross-kind display/privacy contract follow-up; the coordinator expressly
kept it outside this small repair. A successor should decide and qualify that
contract before changing user-authored free text or filename policy.

Signed certificate payloads and signatures are unchanged. No cryptographic issue
is claimed. Other workers own Data-import lifecycle and delayed global feedback;
this round did not modify their files.
