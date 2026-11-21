# Mobile QR framing — defensive source audit, 20 November 2026

## Disposition and scope

**Corrections required, followed by fresh independent acceptance.** This review is pinned to published PR #63, not to the functional worker's forthcoming fixes. It identifies two input/size-contract gaps and two companion import/integration defects. These are scoped correction requirements; no exploit, data disclosure, authentication bypass or production resource-exhaustion result is claimed.

| Item | Exact identity |
| --- | --- |
| Reviewed commit, PR #63 | `9f3da9edbdeab30c3078aaac25c0cbc254ac22bb` |
| Reviewed tree | `b0303506f44ff937554b621f94ba3ab4944bac9e` |
| Comparison base | `cfb1137d3d01ddd4a9fd0677113314dc7deb76ee` |
| Review branch | `review/deckchek-mobile-qr-security-20261120` |
| Original changed scope | `app/phone-run.js` and `tests/phone-run.test.mjs`; 17 insertions, one deletion |

The parent assigned the framing requirements recorded in issue #64: bounded finite safe integer options, representable frame counts, complete transport budgets, and a consistent direct-helper error boundary. The review used the Engineering Suite Security and Hardening skill to trace relevant data boundaries. It did not apply unrelated authentication, network, dependency-installation or release procedures.

No application or test was executed. No input payload, exploit, vulnerability reproduction, adversarial probe, fuzzing, scanner, browser run, renderer execution or remote write was performed. Only this report is authored by this worker. Source searches, line inspection, Git identities, file hashes and report-format checks are the evidence.

## Source identities

The following hashes identify the inspected file bytes, not exported measurement authenticity.

| File | Git blob | SHA-256 |
| --- | --- | --- |
| `app/phone-run.js` | `cec79ea95efdf426a9944f02c536f548724cc5db` | `5b5781b80377b0f90a99c01bdc132b69ff5437c2628a458a74fb2b6e1bad02ee` |
| `mobile/vendor/phone-run.js` | `3efef2922c1eac1dddf0c52e237c4d62c4659c14` | `296618eed947be0e902e84493213b5a68257057a250c62330e29fd5ceb24fd5a` |
| `tests/phone-run.test.mjs` | `4ed1c2106c4e748638d3c7c3f8c2ef58cb0c288f` | `fa3955ed4dcb3ab5dc97cf8c5d9b5893f1369b61df6031844b741837b41119c4` |
| `tools/build-mobile.mjs` | `0ce9eca5948a16be88c1fef5de9fa38cb8907521` | `ce63748ce3bf0027969e5d99756eb412f5205640aac8185abf5e18c4eb0b6c4b` |
| `app/vendor/qr.js` | `a3d97c666c29ec0c78a8fdd7b56b92f7c97c618d` | `218c682500bfadfb7d8881d5011cb20d627ff8954a142ba57f0062ddea321376` |
| `app/ui/workflows/import-phone.js` | `c042373065fc84287496773b45529d2c8f1b1a80` | `69acdea4fe3c1de50147883ce5f07c95bfa38cb7b459f3f8b267b47667f6aa8a` |
| `docs/specs/30-mobile-companion.md` | `888dce48b9d8be016ed35e2fa8e5a6a1fe16e384` | `36134730c946c849fa5efb88f54db7e06104c4b5f6c5229dcdd94f2ab4999389` |

The app and mobile copies were compared as file bytes and differ. The mobile manifest still records the old phone-run hash above (`mobile/vendor/VERSION:7`), and `mobile/sw.js:6` retains build marker `4fa869ba0c14`. This reviewer did not run the generator or claim an observed CI failure.

## Relevant boundaries

[FS-30](../specs/30-mobile-companion.md) AC-5 requires QR/file exports of the same payload; AC-6 requires desktop import into history. Its security section retains local, user-initiated export, a 1 MB import limit and integrity checking without a signature.

The mobile export path imports `mobile/vendor/phone-run.js` through `mobile/lib/export.js:4,18–26`. The Results screen calls framing and rendering at `mobile/screens/results.js:30–43`. `mobile/lib/qr.js:8–13` renders each frame with the shared QR generator at level L.

The desktop paste/file path reaches `parsePhoneRun(text.value)` at `app/ui/workflows/import-phone.js:68–75`. File selection independently checks the file size and invokes the bounded text reader at lines 79–88. `parsePhoneRun` checks string type and both character/UTF-8 length before calling `joinQrFrames` (`app/phone-run.js:228–237`). Source search found no other direct production caller of the exported join helper. Its array entry point is nonetheless public and promises a return-style error result.

## Findings on the original source

### MQR-F1 — The actual import caller still trims significant framed content

**Priority P2; functional data-preservation defect, not an exploitation claim.**

PR #63 changes line-level joining to preserve chunk-end spaces (`app/phone-run.js:123–125`). The outer parser still uses `.trim()` on the complete pasted text at line 232, before handing it to the joiner at line 235. When pasted frames are reversed, the final pasted frame can be an earlier chunk whose trailing spaces belong inside the serialized JSON string. Those bytes are removed before the new helper logic receives them.

The new regression at `tests/phone-run.test.mjs:122–134` calls the joiner directly. Its object is a generic memo fixture, not a complete phone export passed through the desktop parser. It therefore does not cover this caller ordering. The result follows from the source; this reviewer did not construct or execute the fixture.

**Required correction:** preserve complete framed text when selecting the framed path, and reserve whole-document trimming for plain JSON/empty-input handling. Keep BOM/prefix-padding and CRLF behavior explicit. The functional owner should retain a normal valid phone-export regression through the actual parser, including frame reordering. Do not change the frame checksum to conceal altered bytes.

### MQR-S1 — Frame construction does not enforce a representable, renderable, consumable result

**Priority P2; option, output-shape and bounded-processing contract.**

`toQrFrames` at `app/phone-run.js:98–110` checks the JSON argument's type but does not validate `frameBytes`, cap its input, enforce an actual chunk count, or account for total framed transport size. The single-QR return occurs before any option validation. These omissions allow the encoder's admitted domain to disagree with its own decoder and renderer.

The applicable source constraints are concrete:

- `FRAME` permits only one-to-three-digit indices and totals at line 113. The decoder requires at least two frames and an index within the declared total at line 133. The emitter must not produce a one-frame framed envelope or a count beyond that grammar.
- Iteration is by code point, but the split at lines 104–107 does not ensure an individual encoded code point fits the configured chunk capacity before appending it. Chunk-size validation must avoid empty emitted chunks and must preserve the advertised UTF-8 bound.
- The local QR wrapper declares byte capacities L 2,953 and M 2,331 at `app/vendor/qr.js:2312–2323`; `mobile/lib/qr.js:10` selects L. The existing single-QR target is 2,000 bytes. These are source-declared capacities, not a new renderer test or external standards-conformance claim.
- With the present grammar, the largest v1 framing header occupies **23 ASCII bytes**: prefix, four separators, two three-digit numbers and the eight-hex identifier. A bound on chunk bytes alone must reserve room for that header. Retaining the existing conservative 2,000-byte payload target is one way to remain below both declared renderer capacities; the implementation owner must document the selected supported option range.
- `parsePhoneRun` limits the **entire pasted transport** to `MAX_BYTES = 1,000,000` at lines 230–231. A JSON body below that limit is not by itself proof that its framed representation fits: headers and line separators add bytes. Array reassembly and pasted-text consumption must agree about this budget.

**Required correction:** validate supported finite, safe positive integer options before frame construction, retain bounded input and code-point-safe chunks, enforce the **actual** emitted count, and reject transport that cannot be consumed under the existing cap. A raw-size quotient can be a precheck but cannot replace checking actual chunks when variable-width code points leave unused capacity. Budget headers and supported separators as well as body bytes. Keep the existing 1 MB import limit; do not solve the mismatch by enlarging it.

This reviewer did not execute unsafe option cases or measure resource use. The claim is a source-contract gap, not a demonstrated remote resource-exhaustion vulnerability. Remediation and benign post-correction boundary verification belong to the functional owner and fresh acceptance set.

### MQR-S2 — The exported join helper lacks its own bounded type/error boundary

**Priority P2; direct helper input contract. Production caller scope is limited as described above.**

At `app/phone-run.js:124–125`, non-array inputs are coerced to strings and split, while array entries immediately receive string methods. There is no direct helper byte or entry-budget check before that work. An array entry that is not text does not satisfy those method calls, although the documented result is `{ok, json?, error?, missing?}` rather than an arbitrary type exception.

The existing `parsePhoneRun` type/size guard protects its string route. It must remain intact. No other unguarded production call was found, and this audit does not convert the exported programmatic helper into a claimed network surface.

**Required correction:** explicitly accept the supported text/array forms, validate consumed entry types, and return a normal failure for unsupported ordinary input. Establish a bounded transport/entry budget before bulk splitting, mapping, joining or checksum work; count padding, repeated entries and separators consistently rather than checking only the final deduplicated JSON. Preserve the documented missing/mixed/damaged-frame results and identical-repeat behavior inside the admitted budget.

This is ordinary input validation, not a promise to sandbox arbitrary in-process JavaScript objects or proxies. No coercion, accessor or other boundary payload was executed for this finding.

### MQR-F2 — The published change omits the generated mobile copy and cache metadata

**Priority P2; shared-source and qualification defect.**

The desktop module contains PR #63's new line normalization; `mobile/vendor/phone-run.js:123` still uses the earlier whole-line `.trim()`. Their Git blobs and SHA-256 values differ as listed above.

The repository's stated architecture requires byte-for-byte shared copies (`app/README.md:12`, `mobile/README.md:23,32`). `tools/build-mobile.mjs:15,35–37,50–70` includes phone-run.js, its hash manifest and the service-worker cache stamp. Its check mode reports a mismatch at lines 74–79, and `.github/workflows/test.yml:52` invokes that check. The mismatch is established by source bytes; this reviewer did not execute a build, check mode or hosted workflow.

**Required correction:** use the existing deterministic generator after the final shared-source edit and retain the resulting mobile copy, VERSION and service-worker stamp. Do not hand-edit the generated file or weaken the equality check. Fresh acceptance must compare the generated copy and manifest/cache state at the corrected source.

## Source properties that remain intact

- The actual parser and file chooser already have a 1 MB limit. The identified direct-helper gap does not negate those guards.
- Frame syntax restricts indices/totals to three decimal digits, validates index range, rejects mixed totals/identifiers and conflicting duplicate content, and lists missing frames before reassembly (`app/phone-run.js:113,130–143`). Missing-index iteration is bounded by the validated grammar.
- Framing preserves code-point boundaries in normal construction and uses an eight-hex prefix of the content hash for damage detection. The full export hash is also recomputable; neither is an identity proof.
- The file header, mobile Results copy and [FS-30](../specs/30-mobile-companion.md) distinguish integrity from authenticity. `validatePhoneRun` retains missing/mismatching-hash warnings (`app/phone-run.js:207–220`). This review does not propose turning those checks into authentication.
- The history conversion remains explicitly phone-origin, adds phone-mic/uncalibrated flags and does not apply desktop calibration (`app/phone-run.js:255–279`). QR repair must not promote imported measurements into physical qualification.
- The shared framing module performs no network or filesystem operation. Export and import remain user-initiated paths. No new permission, endpoint or data category is introduced by the reviewed two-file patch.

## Qualification limits and successor handoff

The reviewed PR #63 source requires the corrections above. The functional worker owns the implementation, ordinary corruption regressions, post-fix boundary checks and generated outputs. Findings were sent to that worker and the root owner during source review. This report does not accept that later source.

After the correction is frozen, **different fresh code, functional and defensive workers** should record the exact commit/tree and module/test/generated hashes. Functional acceptance should verify normal export/parser round trips, significant whitespace and frame ordering, the selected bounded option/wire-size contract, return-style errors and generated parity. Defensive acceptance should inspect the correction statically without constructing or running exploit/probe cases. Root owns combined qualification, publication and any guarded merge.

If a new encoder rejection can occur for an otherwise normal default mobile export, check its user-visible recovery path: the current Show QR callback calls the encoder and renderer directly (`mobile/screens/results.js:30–43`), while Save file/Copy remain separate controls. This is a successor integration consideration, not a demonstrated additional failure or permission to broaden the current report.

No local full suite, syntax execution, browser smoke, native build, hosted CI conclusion, hardware scan reliability or scientific acceptance is asserted here. Original #63, the separate #62 CDJ candidate, earlier failures and existing thresholds stay preserved. No CDJ/Ledger implementation was re-audited or changed. Only the report is committed, with source identities and scope intact.
