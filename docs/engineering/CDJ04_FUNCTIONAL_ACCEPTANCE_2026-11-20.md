# CDJ-04 independent functional acceptance — 20 November 2026

Reviewer: `/root/cdj04_functional_acceptance_fresh`. Dates use America/Vancouver.

## Disposition and exact source

**Accepted within the corrected calculation helper's functional scope.** One
independent focused execution passed **11/11** cases. Source inspection and the
executed regressions found no remaining blocker in the assigned ratio-underflow,
final-difference-overflow or rejected-type arithmetic corrections. No production
change or additional test was necessary. This is not capture, complete report,
physical-player, native-application or release qualification.

| Role | Exact commit / tree |
| --- | --- |
| Reviewed and executed combined source | `abafd5565e00a2154b6b833e20ccd3a42a713ae7` / `1126a31bfc95aabc71ca5532bc8bed57b49ef7fc` |
| Author's corrected implementation | `61e5a750928d391d0c3ba41f4a8274053a1b55be` / `c992ed617d7161d94ca695543fc0eef1140806a7` |
| Original prototype head | `d2ccfdaa4bd1a8f6da9a7cc632e4967cb8463092` |
| Retained Ledger candidate | `eba46183fecd9d698515411865e710021dcba632` |

The helper and focused test file are byte-identical to author commit `61e5a75`,
independently confirmed with `git diff --exit-code`. The combined source retains
the Ledger candidate and adds the CDJ helper/test plus reports and evidence.
The application/test/native/database/workflow/mobile comparison with the Ledger
candidate shows only the two new CDJ JavaScript files; no existing file in those
paths changed. Searches found the helper's only consumer in its focused tests.

## Independent functional assessment

The review read the complete helper and eleven cases, the initial
[code](CDJ04_CODE_AUDIT_2026-11-20.md),
[functional](CDJ04_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive](CDJ04_SECURITY_AUDIT_2026-11-20.md) reports, and the retained red/green
metadata. The contract is the isolated scope documented in the
[prototype report](CDJ04_DISPLAY_PROTOTYPE_2026-11-20.md), using
[SPEC-10](../SPEC-10-CDJ-media-player-diagnostics.md)'s measured-minus-displayed
formula and percentage-point units.

| Assigned risk | Executed evidence and source conclusion |
| --- | --- |
| Positive frequency operands divide to zero | The underflow regression returns an exclusion and null measurement. The derived ratio must remain positive and finite before an eligible result can be returned. Accepted. |
| Finite speed/display operands produce a non-finite difference | The subtraction regression returns `invalid_display_error`, null measurement and a stable JSON-round-trip exclusion result. The final difference is qualified before eligibility. Accepted. |
| Rejected numeric types still reach arithmetic | The direct-caller numeric-type cases return exclusions without throwing. Accumulated input/quality exclusions precede division and subtraction. Accepted. |
| Valid signed and zero results change | Existing positive, negative and zero cases retain measured-speed and measured-minus-displayed values, method identity, percentage-point fields and absence of RPM/score output. Accepted. |
| Range, quality or uncertainty rules become favorable defaults | Existing cases continue to reject unknown/failed quality, invalid frequencies/display, missing or invalid supplied range, out-of-range display, and missing/non-positive uncertainty or method. No range guessing, coercion or measured-speed clamp was added. Accepted within supplied-input scope. |
| Calls mutate the supplied record or depend on earlier calls | Existing statelessness and input-immutability assertions pass. The returned range is a separate object. Accepted for the ordinary record contract. |

The original **8-pass / 3-failure** baseline and corrected author's **11/11** are
retained author evidence. This reviewer did not repeat that baseline or count it
as an independent execution. The existing regressions directly cover the assigned
risks, so no extra test or unrelated suite repetition was justified.

## Executed verification

Runtime: **Node v22.23.4**. Exact command, from the clean acceptance worktree:

```sh
/workspace/scratch/6f2247f2f463/toolchain/node_modules/node-linux-x64/bin/node \
  --test --test-concurrency=1 tests/cdj-pitch-display.test.mjs
```

Exit **0**: **11 passed / 0 failed / 0 skipped / 0 cancelled / 0 TODO**.
TAP duration: **108.801208 ms**; enclosing subprocess: **0.259776915 seconds**.
All **1,568 tracked file hashes** matched before and after execution. The fixed
source tree and clean checkout also remained unchanged. The focused code/test
whitespace check passed. Only this report was added afterward.

These eleven cases overlap the author's eleven and must not be added to them.
The complete Ledger/application suite was not rerun; its prior result remains
qualified at its own source, and root owns applicable combined/hosted gates.

| Evidence | SHA-256 |
| --- | --- |
| Executed helper | `040a0703f8d68cecedae43616b977378f11baf5f6ac8e18be487e1bd85262988` |
| Executed eleven-case test | `acdea851530a2471f3e9823a9aebd587b3f24225a93674778409cf05a2a2141f` |
| Independent TAP log | `eecb0cc5ea3b5d0c06aaf1d81ed94d6cb5c996815867d543e552085839c14c72` |
| Complete pre-run hash manifest | `977505d1da260b82e6afd98a917ff7ad84ebdd81b4096498a39a31b41e8ff22f` |

Local evidence uses the prefix
`/workspace/scratch/6f2247f2f463/cdj04-functional-acceptance`: `.tap`, `.json`
(exact source/runtime/argv/counts/integrity) and `.hashes.json` (all tracked hashes).
This committed report retains their source identities, results and digests.

## Limits and next handoff

The six quality flags, supported range and uncertainty are supplied assertions.
The helper does not establish reference identity, capture-clock accuracy,
clipping, stability, processing state or a justified uncertainty budget.
`eligibleForReport` therefore represents these calculation gates only, not full
SPEC-10 session/report approval or [SPEC-19](../SPEC-19-scientific-measurement-and-validation.md)
scientific validation. The tested JSON exclusion round trip does not qualify a
complete database or HTML export with asset/reference/capture provenance.

No native application, browser, audio capture, estimator, physical player,
hardware, security probe or remote write was exercised. No application/test,
dependency, migration, workflow, threshold or feature-default change was authored.
Preserve the unwired-prototype description and the original failed baseline.
Root should combine this functional acceptance with the separate fresh code and
defensive dispositions, then apply the actual candidate's integration/hosted
gates. Further production integration needs a caller that establishes and retains
the required provenance and uncertainty before a qualified player report is shown.
