# Mobile QR transport — code audit, 20 November 2026

## Disposition and fixed source

**Changes required before integration.** PR #63 improves the direct frame-join helper but leaves a significant-whitespace defect in the actual desktop parser and does not update the generated mobile copy. The separately requested issue #64 option/count/input-boundary work is also absent from this original source. No later correction is accepted by this report.

| Item | Identity |
| --- | --- |
| Comparison base, merged main | `cfb1137d3d01ddd4a9fd0677113314dc7deb76ee` |
| Reviewed PR #63 head | `9f3da9edbdeab30c3078aaac25c0cbc254ac22bb` |
| Reviewed tree | `b0303506f44ff937554b621f94ba3ab4944bac9e` |
| Review branch | `review/deckchek-mobile-qr-code-20261120` |
| Fixed diff | `git diff cfb1137d3d01ddd4a9fd0677113314dc7deb76ee...9f3da9edbdeab30c3078aaac25c0cbc254ac22bb` |

The two commits are `96d00352e739c95ed941ef34c900dde62f6a30e7` (helper correction) and `9f3da9edbdeab30c3078aaac25c0cbc254ac22bb` (regression). The diff changes only `app/phone-run.js` (three additions, one deletion) and `tests/phone-run.test.mjs` (fourteen additions). Published #62/#63 were not changed by this reviewer.

Requirements come from [PR #63](https://github.com/djshellshoxxx/deckchek/pull/63), the parent-supplied complete [issue #64](https://github.com/djshellshoxxx/deckchek/issues/64) text, and [FS-30](../specs/30-mobile-companion.md), especially AC-5/AC-6 and sections 4, 7–9. The parent supplied both exact refs and the issue contents. No repository-local issue-tracker or dedicated contributing/coding-standards file was found; no external setup or additional task clarification was necessary.

This is a source-only review. The parallel functional worker owns execution and corrections; the defensive worker owns its independent source assessment. No application tests, syntax runs, build/generator execution, runtime input probe, exploit construction, vulnerability reproduction or remote write was performed here.

## Standards

The Engineering Suite code-review skill's separate Standards and Spec axes were used. Applicable repository rules are DEVELOPMENT-PLAN sections 5.3 (correctness, handled error paths, shared-module consistency) and 5.8 (documentation matching code), with section 5.7's meaningful error-state guidance. The prescribed smell baseline adds no distinct actionable finding to this small patch: the normalization name and placement are clear, and no speculative abstraction or duplicate parser was introduced.

**No additional nonredundant Standards finding.** The concrete correctness and packaging requirements are reported under Spec below. The already automated vendor-copy check is not counted again as a style violation. This source review does not claim that checker or any other gate passed.

A future correction introducing explicit QR-size rejection must consider the existing Show QR handler in `mobile/screens/results.js:30–46`: it currently calls framing and rendering without an error handler. The author was asked to establish normal-export reachability and preserve a usable file/copy fallback for newly reachable errors. This is a correction-design checkpoint, not an observed new runtime failure or an additional finding against this two-file diff.

**Standards total: zero additional scoped findings; no worst issue within this axis.**

## Spec

### P1 — Medium: the actual import parser still removes significant chunk spaces

PR #63 promises preservation of chunk bytes; FS-30 AC-5/AC-6 require the same exported payload to reach desktop import. Yet `parsePhoneRun` trims the entire input at `app/phone-run.js:232` before calling the corrected joiner at line 235. When the last pasted frame is an earlier, whitespace-ended chunk, that batch trim removes meaningful bytes before reconstruction. The added test at `tests/phone-run.test.mjs:122–134` calls only `joinQrFrames`. Preserve framed payload bytes through the outer parser and test an ordinary valid mobile export through `parsePhoneRun`, including reverse order.

### P2 — Medium: the mobile shared copy and generated stamps are stale

FS-30 sections 4 and 9 require shared engines to match the app and a current offline build stamp. The changed app module has blob `cec79ea95efdf426a9944f02c536f548724cc5db`; `mobile/vendor/phone-run.js` retains the older `3efef2922c1eac1dddf0c52e237c4d62c4659c14`. The build script explicitly includes this module. Regenerate the copy, VERSION and service-worker stamp through the existing script, then qualify parity. This mismatch is established by byte comparison; no build-check failure was executed by this reviewer.

### P3 — Medium: issue #64's bounded framing options and representable output are unimplemented

At `app/phone-run.js:98–110`, `frameBytes` lacks finite/safe-integer/positive or QR-cap checks. The producer does not limit chunk count, while the parser accepts only three-digit index/total fields and requires at least two framed chunks. Code-point packing also needs an explicit policy when one character cannot fit the requested chunk. These are pre-existing gaps, not regressions introduced by #63. Validate options before construction, enforce actual representable output and preserve existing transfer limits.

### P4 — Medium: issue #64's direct join boundary is unimplemented

The exported `joinQrFrames` has no aggregate input budget and calls string methods on unchecked array entries (`app/phone-run.js:124–125`). Ordinary non-string array elements can therefore violate its documented return-style error contract. The production parser separately applies a one-megabyte limit; do not misrepresent that guarded consumer as unbounded. Add a bounded supported-input contract to the direct helper while retaining explicit errors, missing-frame information and valid duplicate/order behavior.

**Spec total: four medium findings. P1 is the most direct failure of the requested end-to-end whitespace correction. P3/P4 remain separately identified pre-existing issue #64 work.**

## Boundary and integration guidance

These points describe the inspected source and the requirements passed to the correction owner; they are not acceptance of an implementation choice:

- `MAX_BYTES` is **1,000,000**, and `parsePhoneRun` checks both code-unit length and UTF-8 length before further parsing. The desktop file chooser also applies this cap before file reading. Preserve the complete pasted-transfer budget, including framing overhead, rather than silently increasing the importer limit.
- The framing policy currently uses **2,000 UTF-8 bytes** for a plain JSON QR and **1,100 bytes** for default chunks. The renderer separately declares capacities of **2,953 bytes at L** and **2,331 at M** in `app/vendor/qr.js:2312–2323`. Renderer capacity is not authorization to widen the existing framing policy. Any chosen upper option bound needs room for its header; the largest existing three-digit header is 23 ASCII bytes.
- Count actual emitted chunks and consider UTF-8 code-point packing. A lower-bound estimate from payload bytes alone does not prove that actual packing stays within the three-digit count limit. Preserve default behavior and fail explicitly before returning unrecoverable framed output.
- Source searches found the desktop import path calling `parsePhoneRun` with the textarea value. Mobile export imports the generated vendor module and calls the default framing wrapper. Direct joins also appear in tests. No standalone network endpoint or exposed remote parser was established by this audit.
- The existing format distinguishes integrity from authenticity. The truncated frame identifier and full export checksum are not signatures; the payload validator intentionally treats missing/mismatched full checksums as warnings. This review does not request new authentication claims or change that product contract.
- Generated copies are owned by `tools/build-mobile.mjs`. Its `SHARED` list includes `phone-run.js`; it writes byte-identical copies, hashes for `mobile/vendor/VERSION`, and a service-worker build stamp derived from mobile files. Keep those artifacts together rather than hand-editing only a copy.
- Ordinary valid-export whitespace regression is appropriate functional evidence. The option and resource-bound corrections can be reviewed from source and checked after remediation; reproducing problematic unbounded cases on the original implementation is unnecessary.

## Source identities and verification limits

| File | Git blob | SHA-256 |
| --- | --- | --- |
| `app/phone-run.js` | `cec79ea95efdf426a9944f02c536f548724cc5db` | `5b5781b80377b0f90a99c01bdc132b69ff5437c2628a458a74fb2b6e1bad02ee` |
| `mobile/vendor/phone-run.js` | `3efef2922c1eac1dddf0c52e237c4d62c4659c14` | `296618eed947be0e902e84493213b5a68257057a250c62330e29fd5ceb24fd5a` |
| `tests/phone-run.test.mjs` | `4ed1c2106c4e748638d3c7c3f8c2ef58cb0c288f` | `fa3955ed4dcb3ab5dc97cf8c5d9b5893f1369b61df6031844b741837b41119c4` |
| `tools/build-mobile.mjs` | `0ce9eca5948a16be88c1fef5de9fa38cb8907521` | `ce63748ce3bf0027969e5d99756eb412f5205640aac8185abf5e18c4eb0b6c4b` |
| `app/vendor/qr.js` | `a3d97c666c29ec0c78a8fdd7b56b92f7c97c618d` | `218c682500bfadfb7d8881d5011cb20d627ff8954a142ba57f0062ddea321376` |
| `docs/specs/30-mobile-companion.md` | `888dce48b9d8be016ed35e2fa8e5a6a1fe16e384` | `36134730c946c849fa5efb88f54db7e06104c4b5f6c5229dcdd94f2ab4999389` |

The reviewer inspected the fixed diff and relevant export/parser, mobile consumer, desktop import, renderer and build-check source. Read-only Git identities, file hashes and source searches were used. The worktree was clean before this report; only this report is authored. No existing test result, hosted conclusion, browser behavior, deployment, physical phone scan or hardware qualification is asserted.

## Handoff to fresh workers

The findings were communicated to root and the functional correction owner. The functional worker owns source/tests/generated-output changes on its separate branch; this reviewer does not amend those files or pre-accept that successor.

Freeze the corrected combined commit/tree and hand it to new code, functional and defensive reviewers. Acceptance must include the actual valid-export import path, bounded producer/join contracts, matching mobile copies/stamps, retained original baseline/failures and applicable exact-source hosted gates. The original #63 branch/head remains preserved while the successor qualifies. Keep #62's unrelated CDJ evidence candidate stable, and retain existing limits, checksum semantics, owner/hardware gates and the no-release/no-deployment boundary.
