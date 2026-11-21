# Mobile QR correction — independent code acceptance, 20 November 2026

## Disposition and frozen source

**Accepted for this scoped source review.** The corrected combined candidate closes
the four requirements recorded by the [original code audit](MOBILE_QR_CODE_AUDIT_2026-11-20.md).
No additional Standards finding or unresolved Spec finding was identified. This is
independent static acceptance of the identified source, not execution, hosted
qualification, a device-level QR result, or authorization to release or deploy.

| Item | Identity |
| --- | --- |
| Fresh reviewer | `/root/mobile_qr_code_acceptance` |
| Reviewed combined source | `7ae15e17d0c8247efde1ba26c59df4e13f4e321c` |
| Reviewed tree | `2f2a99a1370f1863649aa2bd0552ddc92f6ad1e4` |
| Original QR source / comparison point | `9f3da9edbdeab30c3078aaac25c0cbc254ac22bb` |
| QR correction source | `61a4c0d7190e79239287d3ef1710ee83267d1897` |
| Preserved CDJ evidence source | `4b053e714f8200d331e53896dd54f99c0bec4bc0` |
| Review branch | `review/deckchek-mobile-qr-code-acceptance-20261120` |

The fixed comparison is `git diff 9f3da9edbdeab30c3078aaac25c0cbc254ac22bb...7ae15e17d0c8247efde1ba26c59df4e13f4e321c`.
The combined history also introduces the independently reviewed CDJ evidence
candidate. Its runtime and test bytes were compared with the preserved CDJ head;
that accepted implementation was not re-reviewed as new QR work.

Requirements are the parent-supplied [issue #64](https://github.com/djshellshoxxx/deckchek/issues/64)
criteria retained in the original audit, [FS-30](../specs/30-mobile-companion.md)
AC-5/AC-6 and sections 4, 7–9, and the original whitespace correction. Repository
guidance comes from [DEVELOPMENT-PLAN](../DEVELOPMENT-PLAN.md) sections 5.3, 5.7
and 5.8 and [the mobile build rules](../../mobile/README.md). No applicable
`AGENTS.md`, dedicated contributing/coding-standards file, or local issue-tracker
configuration was found in this checkout or its ancestor directories.

## Standards

**Zero additional scoped findings.** The Engineering Suite code-review guidance
was applied on its separate Standards and Spec axes. The existing pure shared
module remains the single framing/parser implementation. Its named limits,
explicit error results and small local helpers fit the surrounding code. The
generated copy is maintained with the existing generator, so it is not an
independently authored duplicate. The smell baseline identifies no actionable
abstraction, naming or coupling issue in the changed code. Automated checks are
not counted again as style findings.

The new encoder throws explicit `TypeError`/`RangeError` failures, consistent with
an API that returns frame arrays on success. The joiner retains its documented
result-style failures for supported ordinary input forms. The desktop consumer
uses `parsePhoneRun` and displays its returned errors. The production mobile
wrapper uses the unchanged default chunk size and compact serializer; the
existing Show QR handler's source-derived reachability is addressed below.

The author report accurately distinguishes original failures, author verification
and fresh acceptance. It does not claim that the changed checksum or framing
logic authenticates a source, and it retains the lack of physical QR testing.

**Standards total: zero findings; no worst issue within this axis.**

## Spec

**Zero unresolved scoped findings.** Original requirements close as follows:

| Original requirement | Independent source assessment |
| --- | --- |
| P1 — Preserve payload bytes through the actual desktop parser | `parsePhoneRun` removes an initial BOM and checks emptiness without replacing framed input with a trimmed value. Whole-text trimming is confined to plain JSON. The added valid-export regression calls the real parser with reversed frames and LF/CRLF transport; it verifies notes and the full export hash, not only the join helper. |
| P2 — Keep mobile source and generated metadata in sync | The desktop and mobile framing modules are byte-identical. All seven shared copies, VERSION contents, the precache file list and the service-worker stamp agree with their checked-in inputs. The generator itself is unchanged. |
| P3 — Admit only representable bounded framed output | `frameBytes` is checked before the small-payload early return as a safe integer from 1 through 1,977. Raw UTF-8 input, individual codepoint fit, actual packed frame count and total transport size are checked. Multi-frame raw-newline input receives an explicit compact-JSON/file-export error. |
| P4 — Bound direct joins and preserve returned errors | Primitive strings and arrays of primitive strings are the supported input forms. Raw bytes are bounded before bulk parsing. The array path captures its count once, validates each value once and stores those same strings in an ordinary snapshot. Unsupported ordinary types return `{ok:false,error}`. Missing-frame, mixed-export, conflicting-repeat, checksum and valid duplicate/reordering behavior remains explicit. |

### Producer and transport bounds

The existing QR policy remains **2,000 UTF-8 bytes**, with **1,100-byte** default
chunks and a **1,000,000-byte** transfer cap. The largest existing v1 header,
`DCKM1/999/999/ffffffff/`, uses 23 ASCII bytes. Reserving it leaves a maximum
custom chunk of **1,977 bytes**, so the complete frame stays within policy.

The raw-byte quotient check is only an early lower bound on required frame
count. The subsequent whole-codepoint packing loop checks the actual count:
overflow after 999 completed chunks is rejected before adding another chunk;
exactly 999 final chunks remain representable. A character that cannot fit the
requested chunk fails before an empty chunk can be emitted. Inputs taking the
small plain-JSON path remain one unchanged string after option validation.

The wire calculation uses every actual index and total in the header and adds
two bytes per frame. Those two bytes cover CRLF separators and one terminal
CRLF. Hashing and frame construction happen only after these checks. Reordering
does not alter the sum of header lengths. Additional repeats or paste padding
still consume the existing importer budget; the correction does not promise
unlimited repeated or padded transport.

The string join path bounds text before splitting. The array path counts CRLF
separators before accepting frame values. Both paths then use the same parser,
which retains three-digit count/index fields, accepts consistent duplicates,
requires all indices and checks reconstructed bytes before hashing. This is an
ordinary-data API contract, not a sandbox for arbitrary JavaScript proxies or
modified built-in prototypes.

### Actual consumers and valid-export headroom

The checked [mobile export wrapper](../../mobile/lib/export.js) calls
`buildExport`, compact `serializeExport` and default `toQrFrames`. The
[Results screen](../../mobile/screens/results.js) renders those frames at
level L through [the existing wrapper](../../mobile/lib/qr.js). The shared QR
source declares a level-L byte capacity above the retained 2,000-byte policy;
no renderer policy or dependency changed. The
[desktop import screen](../../app/ui/workflows/import-phone.js) passes the
textarea value directly to the corrected parser and retains its file-size gate.

The new tests include a valid export populated to its current field limits.
Independently, the author's conservative size argument holds for a valid export
under those limits: at most 552 bounded string code units per measurement, six
JSON bytes per unit, fewer than 500 further bytes per measurement, at most 200
measurements, and 2,564 remaining bounded string units plus fewer than 1,000
structural bytes. This gives **778,784 raw bytes**. Default packing fills each
nonfinal chunk to at least 1,097 bytes, so at most **710 frames** are needed.
Even allocating 25 bytes to every header plus CRLF yields **796,534 bytes**.
Valid production exports therefore remain within the default framing limits;
the existing Show QR handler does not gain a newly reachable size-rejection
path for this scope. This reasoning does not cover malformed stored records or
arbitrary direct API input and is not a mobile memory/performance measurement.

The checksum semantics, payload validation, phone-origin tagging and separation
from desktop calibration remain unchanged. The added tests target the real
import defect and boundary requirements. No new UI, authentication feature,
schema version or transfer-policy expansion is introduced.

**Spec total: zero unresolved findings; no worst issue within this axis.**

## Read-only integrity evidence

Source inspection used bounded file reads and searches, the fixed Git diff and
commit list, exact Git identities, byte comparisons and SHA-256 calculations.
A read-only Python calculation independently followed the documented generator
hash recipe without importing or running the application or generator:

- All **seven** shared mobile files match their corresponding app files.
- VERSION is exactly the ordered source-hash record the unchanged generator
  specifies.
- The **31 hashed mobile files** (including VERSION and `index.html`, excluding
  `sw.js` and Markdown) derive build stamp **`6d877785e1ef`**. The matching
  precache list has **32 URL entries**: the additional `./` root alias, the
  30 non-index files and `./index.html` last. The separate defensive reviewer
  independently confirmed the same file/URL distinction and stamp.
- The diff from preserved CDJ head `4b053e714f8200d331e53896dd54f99c0bec4bc0`
  across `app`, `mobile`, `tests`, `tools` and `src-tauri` contains only
  `app/phone-run.js`, `mobile/vendor/phone-run.js`, `mobile/vendor/VERSION`,
  `mobile/sw.js` and `tests/phone-run.test.mjs`.
- `app/player`, the two CDJ test files and native sources have no difference
  from that preserved CDJ head. The accepted evidence module/test hashes below
  remain unchanged.

| File | SHA-256 |
| --- | --- |
| `app/phone-run.js` and `mobile/vendor/phone-run.js` | `a96373d0a0c2139d13400e88e6ba34604a7751876b7072e11f71b187eb8c6d39` |
| `tests/phone-run.test.mjs` | `1c97c0e73ed9740d4c4fe72a84cd9bc761616e48f113268c9b1a42f7f75f4008` |
| `mobile/vendor/VERSION` | `351756a9d1e1945ffe2830cabcaae6bc5c59abff1ed535f3891b1a38d690c139` |
| `mobile/sw.js` | `94b56ad0cb90da47df4ca4eab97cfbf9bf66a8b4e4340fe35cac022dca971370` |
| `tools/build-mobile.mjs` | `ce63748ce3bf0027969e5d99756eb412f5205640aac8185abf5e18c4eb0b6c4b` |
| `app/player/evidence-record.js` | `52e7e28403610375ba3db26f2b7e94db3a334fb0b916205489442b754e9a4207` |
| `tests/cdj-evidence-record.test.mjs` | `34021a157c944f98abe8a706d1afdbf47fad0c2541e4b654b7133d29279638ab` |

## Limits and handoff

Only this report is authored on the review branch. The initial worktree was
clean, and the report is committed separately from the frozen source. Its final
commit/tree and report SHA-256 are supplied in the worker handoff. The report's
links and formatting were checked without changing project inputs.

**No application tests, syntax execution, generator execution, build, native
compile, browser/mobile session, scanner, input probe or remote write was
performed by this worker.** The functional successor owns the independent full
serial JavaScript run and runtime qualification; the defensive successor owns
its separate source assessment. This review does not adopt the author's run as
independent evidence or assert an unseen hosted gate result.

Root may integrate this report after all fresh workers finish. Preserve the
published heads, original failing evidence and source identities while applying
the exact-source hosted merge gates. Physical scanning, mobile installation,
hardware measurement qualification and the remaining CDJ feature work retain
their existing status.
