# CDJ-04 evidence functional audit and correction — 20 November 2026

## Scope and review status

This worker independently reviewed the cumulative provisional evidence envelope introduced by draft PRs #60–61, starting from published PR #61 head `20e0fd3202ca74f11404ca3e53735b5b5bc2364f`, tree `c869db493a53227309201f0807385622a9b3f12d`. The preceding calculation candidate is PR #59 head `3118321ee23393bfe37c3cc8e11aeb84490cbd40`. The original eight evidence tests and eleven unchanged pitch tests were independently executed before any edit.

The worker then authored the three bounded corrections below on the separate branch `review/deckchek-evidence-functional-20261120`. The corrected implementation and tests are frozen at commit **`9e282b1fa8f031f2f53a7d346e00a4a12a11e884`**, tree **`ea5a70d72ba204d9f399eb8c54b7dca3bc9d3d6f`**. Consequently, the corrected result is **author verification, awaiting fresh independent acceptance**. Published PR #58–61 branches were not changed. This report and its evidence are a subsequent documentation-only commit.

Source inspection covered `app/player/evidence-record.js`, all eight original evidence cases, the unchanged pitch helper and its tests, the two envelope author reports, SPEC-10's implementation contract, SPEC-19's measurement contract and relevant SPEC-07 / existing incident-evidence metadata conventions. The module has no production consumer; this work does not add audio acquisition, UI, storage or report integration. The date in this filename is the active session's local date; evidence was saved on 21 November 2026 UTC.

## Findings and bounded changes

### F1 — Incomplete reference lists were accepted but could not complete their JSON round trip

The original `refs()` used `value.map()`. A partially filled ordinary array therefore skipped a missing slot during creation. JSON represents such a slot as null, which the reference validator rejects on import. Creation and transport consequently disagreed about an accepted record.

The correction explicitly visits each index, requires an own data descriptor and normalizes its string value into a new ordinary array. Missing slots are rejected at creation. This also removes dispatch through a supplied array's `map` property and avoids reading reference values through accessors; those provenance properties were assessed statically, without new accessor or custom-dispatch runtime probes.

One ordinary regression covers all five reference-list fields: capture input pairs, raw capture evidence, processing evidence, uncertainty evidence and quality evidence. It checks a normal dense-list round trip and isolation from later input edits, then checks early rejection of a missing slot. Against the original module it failed with `Missing expected exception (TypeError).` Against the correction it passes.

### F2 — A named uncertainty method hid an unknown uncertainty magnitude from the reasons list

The original record correctly retained a missing expanded uncertainty as null, but only added `uncertainty_method_unknown` when the method was absent. If a method was named and its magnitude was unknown, qualification reasons contained no corresponding uncertainty-unknown entry. This fell short of [SPEC-19 section 2](../SPEC-19-scientific-measurement-and-validation.md), which requires unknown uncertainty to be null with a reason.

The correction adds `uncertainty_unknown` whenever `analysis.uncertainty.expandedPercentagePoints` is null. The method reason remains separate. Both omitted and explicitly null magnitudes are checked with an ordinary named-method fixture; the null, reason and unverified qualification survive JSON transport. A supplied positive magnitude does not acquire the new missing-value reason. The new regression failed against the original module and passes against the correction.

This reason identifies absent input; it does not validate a supplied uncertainty number, establish a calibrated coverage factor or replace the later SPEC-19 uncertainty model.

### F3 — Serializer schema inspection preceded its own-field validation

Independent defensive source review identified that `serializeCdjEvidenceRecord()` read `record.schemaVersion` before calling the own-data snapshot validator. The correction now obtains that snapshot first, checks its schema and normalizes that same snapshot. An input schema property is therefore not read directly before the declared plain-object / own-data boundary.

This is a static source correction. No new accessor, proxy, inherited-schema or custom-dispatch runtime reproduction was performed. Existing ordinary transport cases exercise successful serialization after the change. Fresh defensive source review must assess this ordering independently.

## Exact-source verification

Runtime: `/workspace/scratch/6f2247f2f463/toolchain/node_modules/node-linux-x64/bin/node`, **v22.23.4**.

Focused command, run from this worker's repository checkout:

```sh
/workspace/scratch/6f2247f2f463/toolchain/node_modules/node-linux-x64/bin/node --test tests/cdj-evidence-record.test.mjs tests/cdj-pitch-display.test.mjs
```

| Source and test state | Total | Passed | Failed | Skipped | Exit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Unchanged published #61 source and original tests | 19 | 19 | 0 | 0 | 0 |
| Unchanged #61 implementation with the two new functional regressions | 21 | 19 | 2 | 0 | 1 |
| Corrected commit `9e282b1` and the same new tests | 21 | 21 | 0 | 0 | 0 |

These are overlapping focused runs, not additive independent test counts. The corrected scope is ten evidence cases plus eleven unchanged calculation cases. Both original and corrected runs had zero cancelled and todo cases. Node syntax checks for the corrected evidence module and its test file both exited zero. The environment's `UNDICI-EHPA` experimental warning is retained in original logs; it did not change any test result.

Before and after both the original clean run and the corrected clean run, all **1,578 tracked file hashes** were compared and remained unchanged. The red run intentionally changed only the test file; its record pins the unchanged original implementation hash and the new test hash. `git diff --check` passed for the source/test correction before the source commit. The original failing TAP contains two whitespace-only assertion-output lines (83 and 85); their exact bytes and log hash were preserved. The documentation/evidence formatting check excludes only raw TAP logs.

| File | Original #61 SHA-256 | Corrected SHA-256 |
| --- | --- | --- |
| `app/player/evidence-record.js` | `579f81aa48b33ab0d9635bb77cee4d1a652ce3467ccecfcda4340798f7b8d719` | `52e7e28403610375ba3db26f2b7e94db3a334fb0b916205489442b754e9a4207` |
| `tests/cdj-evidence-record.test.mjs` | `7b2a4c3855b2ab0955d817e0c56ffb018432272ff79db0aaa2f8b822e8475942` | `34021a157c944f98abe8a706d1afdbf47fad0c2541e4b654b7133d29279638ab` |
| `app/player/pitch-display.js` | `040a0703f8d68cecedae43616b977378f11baf5f6ac8e18be487e1bd85262988` | unchanged |
| `tests/cdj-pitch-display.test.mjs` | `acdea851530a2471f3e9823a9aebd587b3f24225a93674778409cf05a2a2141f` | unchanged |

Durable evidence is in [evidence/cdj04-evidence-functional-2026-11-20](evidence/cdj04-evidence-functional-2026-11-20/). It contains the original, red and corrected TAP logs and JSON execution records, both complete tracked-file hash manifests, and an artifact-size / SHA-256 index. Original log bytes are preserved.

| Evidence | SHA-256 |
| --- | --- |
| Original focused TAP | `05b2f2905b1a5dd021c28a09d3b665fcdc989c10664d108c99ef69d900c421a7` |
| Original-source regression TAP | `df9b7b583f399762cb82fa6b5011a6c4525a8825d76f2413e1fbc87b23977a52` |
| Corrected focused TAP | `ab587b0f15f258b0541882b61318cfaac3d465fb5592d9504b833665a377729b` |
| Original 1,578-file manifest | `656d62748ec2e3ff2eea9890cf5da762fba161997fd7f39618e075a9478ecf69` |
| Corrected 1,578-file manifest | `405eaec7c14252dbbb2bdf43263b369cf4703a1ea0a3c8ee7a3e2544f94a885c` |

## Preserved contract and remaining limits

Every created or imported record still has qualification `status: 'unverified'`, `eligibleForReport: false`, `measurement: null` and the independently-unvalidated capture/reference/method reason. All six quality claims remain caller supplied, and hashes, timestamps, identity strings and evidence references remain supplied metadata. A valid timestamp shape does not authenticate a clock; an accepted run ID does not establish global uniqueness. The changes do not create measurements or infer comparison compatibility.

Unknown metadata continues to appear as null, `unknown` or empty reference arrays, and the firmware literal `unknown` stays visible. Reasons are not yet a complete acquisition/measurement validator for every required SPEC-10 field. In particular, this correction does not claim to validate sample-rate provenance, duration adequacy, capture interruptions, wrong references, tone stability or processing truth. The numerical helper remains unchanged and separate.

Source review also noted JavaScript signed zero: permitted zero-valued numeric metadata retains `-0` in memory, while JSON canonicalizes it to `0`. No physical meaning for that sign or bit-level identity requirement is declared by this provisional schema. It is recorded as a lower-priority normalization-policy question, not included in these three bounded corrections.

No broad repository suite, native/desktop build, browser workflow, database/HTML round trip, remote probe or hardware qualification was run by this worker. The focused checks do not substitute for those integration gates. No physical two-player, characterized-reference, independent-estimator or calibration claim follows from this work. Existing published branches, Fleet default-off, archive/permission/security gates and the 200 ms ASan cap remain outside the changed scope.

## Handoff

Integrate the code/test commit and this evidence report onto the root's continuation branch without moving published #58–61. Fresh code, functional and defensive reviewers should inspect the exact corrected source hashes above and distinguish these author's green results from their own acceptance. Focus functional acceptance on ordinary record creation/round trips and the new missing-uncertainty reason; review own-data descriptor and schema ordering boundaries statically. Preserve the original two failures and all physical/integration limits in the successor record.
