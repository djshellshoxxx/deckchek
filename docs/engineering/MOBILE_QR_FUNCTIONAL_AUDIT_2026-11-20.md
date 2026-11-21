# Mobile QR functional audit and bounded framing correction — 20 November 2026

Worker: `/root/mobile_qr_bug_hunt`. Report date uses America/Los_Angeles;
execution timestamps in the preserved records use UTC (21 November).

## Outcome and handoff

The published PR #63 source still rejected an ordinary valid export when a
frame ending in significant spaces was pasted last. Its helper retained the
spaces, but the actual desktop parser trimmed them before calling the helper.
The published source also contained a stale mobile copy and cache stamp.

This worker authored a narrow correction to the real import boundary, bounded
the framing API to representable and consumable transfers, regenerated the
mobile copy, and added focused regression coverage. The corrected five-file
test scope passed **49/49** cases. This is author verification. A fresh worker
must independently review and qualify the combined integration source before
acceptance; the parallel original-source reviewers did not accept this patch.

| Role | Exact commit / tree |
| --- | --- |
| Original published PR #63 | `9f3da9edbdeab30c3078aaac25c0cbc254ac22bb` / `b0303506f44ff937554b621f94ba3ab4944bac9e` |
| Original main base | `cfb1137d3d01ddd4a9fd0677113314dc7deb76ee` |
| Corrected implementation, tests and generated mobile assets | `61a4c0d7190e79239287d3ef1710ee83267d1897` / `5f19f23b67b4a7e04a2470c664d1c5582648a314` |

Work stayed in `/workspace/scratch/6f2247f2f463/deckchek-qr-functional` on
`review/deckchek-mobile-qr-functional-20261120`. The published head was left
unchanged. This report and its evidence are added separately after the tested
implementation commit. No remote publication, CDJ change, or Ledger change was
performed by this worker.

## Reviewed contract and consumer path

[FS-30](../specs/30-mobile-companion.md) describes the Mobile result format,
file/QR export, desktop import, shared pure module, and offline cache
generation. Review followed the complete production path:

1. [Mobile export](../../mobile/lib/export.js) calls `buildExport`, compact
   `serializeExport`, and the default `toQrFrames` from the vendored shared module.
2. [Results](../../mobile/screens/results.js) renders those frames through
   [the mobile QR wrapper](../../mobile/lib/qr.js).
3. [The desktop parser](../../app/phone-run.js) enforces the existing raw-text
   budget, reconstructs frames, parses JSON, validates the format, and checks
   export integrity.
4. [The mobile generator](../../tools/build-mobile.mjs) copies the shared module
   and refreshes `mobile/vendor/VERSION` and the service-worker precache stamp.

The renderer's declared byte capacities are 2,953 at level L and 2,331 at level M
in [its checked-in source](../../app/vendor/qr.js). The correction deliberately
retains the existing **2,000-byte QR policy**; it does not increase that policy
to the renderer's maximum. The existing **1,000,000-byte import budget**,
**1,100-byte default chunks**, format version, payload validation, hash behavior,
and measurement/string limits remain in force.

## Confirmed findings and correction

| Finding | Original evidence | Correction |
| --- | --- | --- |
| F1 — Actual import lost significant trailing chunk spaces | A valid `buildExport` result, split with the default options and pasted in reverse order, reconstructed in `joinQrFrames` but failed in `parsePhoneRun`. The parser applied whole-text `trim()` first. | Framed input reaches the joiner without whole-text trimming. BOM removal and an emptiness check remain; ordinary plain JSON is still trimmed. |
| F2 — Mobile did not contain the published helper correction | Both original mobile build checks reported stale `vendor/phone-run.js`, `vendor/VERSION`, and `sw.js`. | The existing deterministic generator produced a byte-identical mobile module and current version/precache stamps. |
| F3 — Encoder lacked explicit representability and transport guards | Source inspection found unchecked chunk options, possible codepoint/chunk mismatch, no actual 999-frame ceiling, and no complete wire-budget accounting. No unsafe original-source option or budget cases were executed. | Validate options, raw bytes, compact framed transport, codepoint fit, actual packed frame count, and complete framed wire size before returning output. |
| F4 — Direct join accepted coercion and unbounded raw inputs | Source inspection found input coercion and array processing before supported-type/raw-budget validation. The production parser already had its own text gate. | Direct joining now validates primitive string inputs or arrays of primitive strings, checks the complete raw budget, and returns `{ok:false,error}` for unsupported ordinary types. |

The parallel code and defensive reviewers independently identified the outer
trim and mobile parity gaps and supplied source-only guidance on option,
codepoint, frame-count, and wire-budget checks. The parent approved the bounded
design before the correction was committed.

### Framing boundaries

`frameBytes` must be a finite safe integer from **1 through 1,977**, including
when the source would otherwise take the small plain-JSON early return.
The upper bound reserves the largest v1 header:
`DCKM1/999/999/ffffffff/` occupies **23 ASCII bytes**, so a 1,977-byte chunk
fits the unchanged 2,000-byte QR policy. The default remains 1,100.

The encoder checks raw input length and UTF-8 byte length against 1,000,000.
For multi-frame output, raw CR or LF is rejected with a compact-JSON/file-export
message: the line-based importer cannot reconstruct a chunk containing a raw
line break. Production serialization already uses compact `JSON.stringify`.
Small plain JSON, including pretty-printed text within the single-QR limit,
remains unchanged after option validation.

A byte-length lower-bound check precedes packing. Actual packing iterates whole
Unicode codepoints, refuses a character larger than the requested chunk, and
checks the actual chunk count against the v1 header maximum of **999**. This
avoids empty chunks and catches packing losses that a byte quotient alone would
miss. The encoder then budgets exact headers plus **two bytes per frame**:
CRLF separators and one final CRLF. The complete transfer must fit the existing
1,000,000-byte parser budget. An unrepresentable transfer explicitly directs
the caller to file export; the import cap is not relaxed.

Direct joining applies its raw string budget before splitting. For an array,
it budgets CRLF separators and validates each string before storing it in a new
ordinary array. The array length is captured once and each entry is read once;
the checked snapshot is the one subsequently parsed. This is ordinary-data
validation, not a JavaScript sandbox or a claim about arbitrary proxies/accessors.
Duplicate and reordered frames retain their existing behavior. Reassembled JSON
is also bounded before its checksum is calculated.

### Existing Show QR consumer

No new UI fallback was added. The production wrapper supplies no caller-selected
chunk size and obtains compact text from the capped export builder. A new
fully populated valid-export fixture uses 200 measurements, all eight quality
flags per measurement, and the maximum relevant field lengths with three-byte
characters. It passes both default framing and the actual desktop import with
a matching hash and preserved measurement values.

The source limits also leave room beyond that fixture. A conservative static
estimate allows six JSON bytes per UTF-16 code unit, covering escaped text:
each measurement has at most 552 string code units, plus fewer than 500 bytes
for fixed keys, punctuation, and finite numeric fields. For 200 measurements
this is at most 762,400 bytes. The other bounded strings contain at most 2,564
code units; their escaped contents and fewer than 1,000 bytes of remaining
structure bring the estimate below 778,784 bytes. With default whole-codepoint
packing, nonfinal chunks contain at least 1,097 bytes, requiring at most 710
frames; even 25 bytes per frame for the largest header plus CRLF keeps the
estimate below 800,000 bytes. This argument applies to valid production exports
under the current field limits, not arbitrary direct API input or malformed
stored data. It supports retaining the existing UI path within this correction's
scope.

## Executed verification

Runtime: **Node v22.23.4**, explicit executable:
`/workspace/scratch/6f2247f2f463/toolchain/node_modules/node-linux-x64/bin/node`.

The original and corrected focused runs used exactly:

```sh
node --test tests/phone-run.test.mjs tests/mobile-export.test.mjs tests/mobile-build.test.mjs tests/phone-import-file-lifecycle.test.mjs tests/phone-import-assets-lifecycle.test.mjs
```

The benign regression run used only `node --test tests/phone-run.test.mjs`, with
the original implementation unchanged and one newly added valid-data test.

| Execution | Result | TAP duration | Enclosing duration | Source integrity |
| --- | --- | ---: | ---: | --- |
| Unchanged published PR #63, original five-file scope | **40 passed / 2 failed** | 4,902.726968 ms | 5.09134615 s | All 1,574 tracked hashes unchanged; clean before/after. |
| Original implementation with the new benign consumer regression | **10 passed / 1 failed** | See raw TAP | 0.538887438 s | Only the test was intentionally changed; original module hash retained. |
| Frozen corrected implementation, same five-file scope plus seven added cases | **49 passed / 0 failed** | 5,068.461243 ms | 5.167042925 s | All 1,574 tracked hashes unchanged; clean before/after. |

All three runs had zero skipped, cancelled, or TODO tests. Their scopes overlap
and must not be summed. The first two were expected red evidence, not passing
qualification. The corrected run is author evidence, not independent acceptance
or a full-suite claim.

The two original failures were the mobile build tests named:

- `vendored engines are byte-identical copies of app/ and the sw stamp is current (build --check)`
- `--check notices a drifted vendor copy and a stale precache stamp; writing repairs them`

Both identified the same three stale generated files. The separate normal-data
failure was `desktop import preserves a significant-space-ended frame pasted last`.
Its helper assertion succeeded before the parser assertion failed, locating the
defect at the actual consumer boundary rather than in frame generation.

The seven added tests cover that import regression, option validation, renderer
policy, actual frame count/codepoint packing, exact raw/wire budgets, line-based
transport representability, direct-join result errors/duplicates, and a fully
populated valid production export. One wire test constructs **889 default-sized
frames** whose joined text plus final CRLF is exactly **1,000,000 UTF-8 bytes**;
one additional source character is rejected. The unsafe-option/budget rejection
checks were run only on the corrected source. There was no original-source
excessive-input experiment, vulnerability reproduction, scanner, or fuzz campaign.

Both changed JavaScript files passed `node --check`. `node tools/build-mobile.mjs`
updated exactly the shared vendor module, its version file, and `mobile/sw.js`.
The corrected focused run includes both mobile build checks. The implementation
diff passed `git diff --check`. The environment's existing `UNDICI-EHPA`
experimental-proxy warnings are retained in the raw evidence and did not alter
the exit results.

## Exact preserved evidence

The [artifact index](evidence/mobile-qr-functional-2026-11-20/artifact-index.json)
records byte sizes and SHA-256 hashes for every copied artifact. Raw logs were
copied byte-for-byte; failure diagnostic whitespace was not reformatted.
Documentation formatting checks exclude only raw `*.tap` artifacts for this
reason.

| Scope | Metadata and raw output | SHA-256 of raw output |
| --- | --- | --- |
| Published original | [Metadata](evidence/mobile-qr-functional-2026-11-20/published63-focused.json), [TAP](evidence/mobile-qr-functional-2026-11-20/published63-focused.tap), [tracked manifest](evidence/mobile-qr-functional-2026-11-20/published63-tracked-sha256.json) | `821d0ac08917ce7201444829e1479eb333679f6c9c674073512cb8875995692d` |
| Benign consumer regression | [Metadata](evidence/mobile-qr-functional-2026-11-20/consumer-regression-original.json), [TAP](evidence/mobile-qr-functional-2026-11-20/consumer-regression-original.tap), [exact test snapshot](evidence/mobile-qr-functional-2026-11-20/consumer-regression-original.test.mjs.txt) | `55e2ee317179c12f8d6e9a83a5bc7791dafe001ac88ddbfd0240c371befacc36` |
| Corrected author scope | [Metadata](evidence/mobile-qr-functional-2026-11-20/corrected-focused.json), [TAP](evidence/mobile-qr-functional-2026-11-20/corrected-focused.tap), [tracked manifest](evidence/mobile-qr-functional-2026-11-20/corrected-tracked-sha256.json) | `845b9067eed83c780149000b5df525611dd64106aa291620412b9d06f40c5ea9` |
| Syntax and deterministic generation | [Commands, exits, and exact output](evidence/mobile-qr-functional-2026-11-20/author-syntax-generation.json) | See artifact index. |

The unchanged original module SHA-256 during the benign red regression was
`5b5781b80377b0f90a99c01bdc132b69ff5437c2628a458a74fb2b6e1bad02ee`;
the intentional regression test SHA-256 was
`30bc5e0f43a091ae96b5d91bd280ea36ef1ce087f568f3a48d495c820a43f4a7`.
The latter snapshot was reconstructed from the final test by removing only the
six subsequently added cases and their extra constant imports; its bytes match
the hash recorded before the original regression run. It is retained with a
`.txt` suffix as evidence and was not executed again.

| Corrected file | SHA-256 |
| --- | --- |
| `app/phone-run.js` and byte-identical `mobile/vendor/phone-run.js` | `a96373d0a0c2139d13400e88e6ba34604a7751876b7072e11f71b187eb8c6d39` |
| `tests/phone-run.test.mjs` | `1c97c0e73ed9740d4c4fe72a84cd9bc761616e48f113268c9b1a42f7f75f4008` |
| `mobile/vendor/VERSION` | `351756a9d1e1945ffe2830cabcaae6bc5c59abff1ed535f3891b1a38d690c139` |
| `mobile/sw.js` | `94b56ad0cb90da47df4ca4eab97cfbf9bf66a8b4e4340fe35cac022dca971370` |

## Limits and successor work

Fresh successors should inspect these exact corrected bytes and the combined
integration tree, independently exercise the focused acceptance scope, and
record any additional required integration qualification. Root owns that handoff
and any later publication. This worker did not run the broad full suite, native
builds, a live browser/mobile device, or physical QR scanning; no claim about
camera recognition or device-level end-to-end behavior is made. No dependencies
were installed and no network scanning or offensive workflow was performed.

The checksum still detects accidental damage; it does not authenticate the
exporter. No hash policy, schema, raw-input cap, or payload-validation gate was
weakened. Implementation source remains frozen at the separately identified
commit while this report and exact evidence are added for review.
