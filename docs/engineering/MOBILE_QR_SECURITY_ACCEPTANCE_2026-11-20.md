# Mobile QR — independent defensive acceptance, 20 November 2026

## Disposition and identity

**Accepted within this source-review scope.** All four findings in the
[original defensive audit](MOBILE_QR_SECURITY_AUDIT_2026-11-20.md) are closed by
the corrected source. No additional actionable defensive regression was found
in the QR correction or its existing import/export integration. This fresh
review is independent of the author and original reviewer. It is not a
full-product security certification or runtime qualification.

| Identity | Exact value |
| --- | --- |
| Reviewer | `/root/mobile_qr_security_acceptance` |
| Reviewed combined commit | `7ae15e17d0c8247efde1ba26c59df4e13f4e321c` |
| Reviewed combined tree | `2f2a99a1370f1863649aa2bd0552ddc92f6ad1e4` |
| Corrected implementation | `61a4c0d7190e79239287d3ef1710ee83267d1897` |
| Original PR #63 | `9f3da9edbdeab30c3078aaac25c0cbc254ac22bb` |
| Integrated PR #62 | `4b053e714f8200d331e53896dd54f99c0bec4bc0` |
| Branch | `review/deckchek-mobile-qr-security-acceptance-20261120` |

The date uses America/Los_Angeles. Work stayed in
`/workspace/scratch/6f2247f2f463/deckchek-qr-acceptance-security`, initially clean
at the source/tree above. Only this report changes. The functional successor
owns the full JavaScript suite; root owns hosted qualification, publication and
any guarded merge. This report does not claim those gates have completed.

## Review method

The Engineering Suite Security and Hardening skill supplied the input-boundary
method. Unrelated authentication, deployment, dependency-installation and
release procedures were not applied. No repository or ancestor `AGENTS.md` was
found in the inspected hierarchy.

Evidence is source inspection, Git identities/diffs, file-byte comparison and
static SHA-256 calculation. **No application, tests, syntax check, generator,
renderer, browser, native build, scanner, fuzzing, vulnerability reproduction
or adversarial probe was executed.** No dependencies or remote writes occurred.

The boundaries are compact mobile JSON, framing, pasted text/arrays of frame
strings, and desktop parsing. The reviewed properties are payload fidelity,
bounded processing, ordinary-data errors, checksum meaning and phone-origin
measurement handling. This is not a sandbox guarantee for arbitrary in-process
JavaScript proxies, accessors or modified built-in prototypes.

## Finding closure

| Finding | Corrected source evidence | Disposition |
| --- | --- | --- |
| MQR-F1: outer parser trimmed significant chunk spaces | `parsePhoneRun` preserves framed text after BOM removal. Its emptiness check does not replace that text. Whole-text trimming occurs only for plain JSON. | Closed. |
| MQR-S1: construction lacked representability/budget checks | `toQrFrames` validates options and input before its early return, checks whole-codepoint fit and actual count, budgets full framing, and only then hashes/emits. | Closed. |
| MQR-S2: direct joining lacked a bounded type/error boundary | `joinQrFrames` validates primitive strings or arrays of primitive strings, budgets raw data before bulk processing and parses a snapshot of checked entries. | Closed. |
| MQR-F2: generated mobile state was stale | All seven shared copies, the full VERSION manifest, build digest and precache ordering match independent static calculations. | Closed. |

Source: [shared module](../../app/phone-run.js),
[mobile export](../../mobile/lib/export.js),
[Results](../../mobile/screens/results.js),
[desktop import](../../app/ui/workflows/import-phone.js),
[generator](../../tools/build-mobile.mjs), and
[FS-30](../specs/30-mobile-companion.md).

### Construction

The existing limits remain **1,000,000 bytes** per transfer, **2,000 bytes** per
QR policy and **1,100 bytes** for default chunks. `frameBytes` must be a safe
integer from **1 through 1,977**, checked before even a small plain-JSON return.
The upper bound reserves the largest **23-byte** v1 header within that existing
QR policy; renderer capacity is not used to widen it.

The code-unit length guard precedes UTF-8 encoding; the byte guard precedes
packing/checksum work. Multi-frame raw CR/LF is refused for the line-based
transport. The production wrapper already serializes compact JSON. A raw byte
quotient is a precheck only: the packing loop separately checks whole-codepoint
fit and the actual **999-frame** ceiling. A chunk cannot be empty, and a large
input cannot produce a one-frame numbered envelope because the maximum chunk
is below the single-QR threshold.

After packing, exact headers plus two bytes per frame budget CRLF separators
and one terminal CRLF. The complete wire budget is checked before hashing and
output-string construction. These are source-derived finite bounds, not a
runtime resource measurement. No boundary-size inputs were executed here.

### Joining and consumption

Raw string length and UTF-8 bytes are checked before splitting. For an array,
the helper captures length once, reserves separator bytes before iterating,
reads each entry once, validates its primitive-string type and remaining byte
budget, then stores it in a new ordinary array. Subsequent mapping consumes
that snapshot. It does not call a caller-supplied iterator/map or reread caller
entries after validation. Separator reservation bounds entry count, and raw
padding/repeats consume budget before filtering or deduplication.

Normalization removes prefix padding and a terminal carriage return while
retaining chunk-ending spaces. The bounded header grammar and existing index,
mixed-export, conflicting-repeat, identical-repeat and missing-frame behavior
remain intact. Reconstructed JSON is bounded again before its checksum. Missing
index iteration/reconstruction remain bounded by three-digit totals.

The actual parser retains its primitive-string and 1 MB guards before BOM
handling, detection and parsing. The file chooser retains its size check and
bounded reader. No new unguarded production joiner caller was added. Encoder
failures use exceptions as before; direct joiner failures for unsupported
ordinary data use `{ok:false,error}` as documented.

### Valid default mobile exports

The [author's conservative bound](MOBILE_QR_FUNCTIONAL_AUDIT_2026-11-20.md) agrees
with inspected field limits: 552 string code units per measurement, at most 200
measurements and 2,564 other variable string code units. Six JSON bytes per code
unit plus conservative fixed/numeric overhead gives at most **778,784 raw
bytes**. Nonfinal default chunks hold at least 1,097 bytes, requiring at most
710 frames. Maximum headers/CRLF keep this below 800,000 bytes.

Thus the new limits do not require a Show QR recovery change for valid exports
in this bounded production domain. This reasoning does not certify malformed
stored objects, arbitrary API inputs, camera recognition or device performance.
The file-export route remains. The corrected [test source](../../tests/phone-run.test.mjs)
covers the actual parser regression, option/count/codepoint/wire boundaries,
ordinary type failures and a fully populated valid export. This is coverage
inspection, not this worker's execution result.

## Generated state and unchanged meaning

Static calculations, without running the generator, confirmed:

- All seven shared files are byte-identical to their mobile copies.
- The complete VERSION text matches the current shared-source hashes.
- **31 static mobile files**, including VERSION and `index.html` and excluding
  `sw.js`/Markdown, produce build digest **`6d877785e1ef`**.
- **32 precache URLs** equal `./` plus those 31 file URLs with `./index.html`
  last. VERSION is included in both file sets; the extra URL explains the count
  difference. The fresh code reviewer independently confirmed these counts.

The shared header still distinguishes integrity from authenticity. The frame
identifier and full export hash remain recomputable damage checks; missing or
mismatching export hashes remain warnings, not authorization/identity proofs.
History still uses `origin: 'phone'` and adds `phone-mic`/`uncalibrated` flags.
The repair does not apply desktop calibration or establish physical/scientific
qualification. Existing imported-text rendering is unchanged. No HTML, network,
filesystem, permission or dependency operation is introduced.

Against PR #62, the runtime/test/generated diff contains exactly five files:
the phone-run module, its mobile copy, VERSION, the service-worker marker and
phone-run tests. CDJ, Ledger, native, workflow and generator implementations
remain unchanged and were not re-audited.

## Exact bytes and verification record

| File | SHA-256 |
| --- | --- |
| Desktop phone-run and identical mobile copy | `a96373d0a0c2139d13400e88e6ba34604a7751876b7072e11f71b187eb8c6d39` |
| `tests/phone-run.test.mjs` | `1c97c0e73ed9740d4c4fe72a84cd9bc761616e48f113268c9b1a42f7f75f4008` |
| `mobile/vendor/VERSION` | `351756a9d1e1945ffe2830cabcaae6bc5c59abff1ed535f3891b1a38d690c139` |
| `mobile/sw.js` | `94b56ad0cb90da47df4ca4eab97cfbf9bf66a8b4e4340fe35cac022dca971370` |
| `tools/build-mobile.mjs` | `ce63748ce3bf0027969e5d99756eb412f5205640aac8185abf5e18c4eb0b6c4b` |

Desktop/mobile modules share Git blob `a3551b3d83c0c10a3c0891d7e7007d2e6cd8e596`;
the test blob is `6c26b4703d7329eb8a4711a7cd1064c279c9c503`.

Commands used `git status`, `git rev-parse`, targeted `git diff`, `rg`, source
reads and Python standard-library file/hash calculations. Assertions confirmed
source/tree, initial clean state, copy equality, full manifest, build digest and
precache ordering. Report links, staged formatting and report-only scope were
checked before committing. The final report hash, commit and clean status are
provided in the worker handoff to avoid a self-referential hash here.

Retain this acceptance for these exact source bytes. Changes to a reviewed
boundary need a review of that change. Root should combine fresh code and
functional dispositions, retain prior failures and published source heads, and
qualify the final published source through the applicable hosted gates.
