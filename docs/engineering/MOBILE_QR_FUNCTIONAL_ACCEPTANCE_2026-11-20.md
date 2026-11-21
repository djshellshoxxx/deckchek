# Mobile QR combined candidate — independent functional acceptance, 20 November 2026

Worker: `/root/mobile_qr_functional_acceptance`. This is the fresh functional
successor to the initial correction-author round. Report date uses
America/Los_Angeles; execution timestamps use UTC on 21 November.

## Disposition

**Accepted within the executed JavaScript integration scope.** One complete
serial run of the repository's top-level test suite passed **2,251 tests**,
with **zero failures** and **1 optional skip**. No application or test source
was changed by this worker. Generated mobile assets passed their existing
build checks within that same run. All **1,616 tracked hashes** remained
unchanged, with a clean worktree before and after execution.

This accepts the exact combined source below for the exercised local scope.
It does not replace applicable hosted native/package checks, camera recognition
on a physical phone, device-level qualification or scientific qualification
of CDJ measurements.

| Identity | Exact value |
| --- | --- |
| Accepted source commit | `7ae15e17d0c8247efde1ba26c59df4e13f4e321c` |
| Accepted source tree | `2f2a99a1370f1863649aa2bd0552ddc92f6ad1e4` |
| Worker branch | `review/deckchek-mobile-qr-functional-acceptance-20261120` |
| QR implementation ancestor | `61a4c0d7190e79239287d3ef1710ee83267d1897` |
| Original published PR #63 | `9f3da9edbdeab30c3078aaac25c0cbc254ac22bb` |
| Preserved CDJ evidence PR #62 ancestor | `4b053e714f8200d331e53896dd54f99c0bec4bc0` |

The source contains the correction and all three initial QR reports. Their
original-source findings remain intact. Earlier red runs and the author's
focused 49/49 run are separate evidence, not executions by this worker. This
report does not add overlapping test totals.

## Execution and source integrity

The package script and standard JavaScript workflow both select
`tests/*.test.mjs`. The independent run selected all **186** matching files
in sorted order and used `--test-concurrency=1` to make test-file execution
serial. It used the explicit Node executable below and put that directory first
on `PATH`, including for subprocesses. No packages or toolchains were installed.
No applicable `AGENTS.md` file was found in the checkout, relevant source
directories or filesystem ancestors.

```sh
PATH="/workspace/scratch/6f2247f2f463/toolchain/node_modules/node-linux-x64/bin:$PATH" \
/workspace/scratch/6f2247f2f463/toolchain/node_modules/node-linux-x64/bin/node \
  --test --test-concurrency=1 --test-reporter=tap tests/*.test.mjs
```

This is the concise shell equivalent. The preserved
[execution metadata](evidence/mobile-qr-acceptance-2026-11-20/full-suite.json)
contains the exact expanded argument array, cwd and runtime identity. The
parent reserved application-test execution to this worker; no broader
host-isolation claim is made.

| Measurement | Observed result |
| --- | --- |
| Runtime | `v22.23.4` |
| Start, UTC | `2026-11-21T03:26:19.973692+00:00` |
| End, UTC | `2026-11-21T03:32:39.644138+00:00` |
| Total tests | 2,252 |
| Passed / failed / skipped | 2,251 / 0 / 1 |
| Cancelled / TODO | 0 / 0 |
| Exit code | 0 |
| TAP duration | 379593.158934 ms |
| Enclosing test-command duration | 379.670415946 s |
| Tracked files compared | 1,616; all SHA-256 values unchanged |
| Worktree status | Clean before and after; commit and tree unchanged |

The one skipped case is the optional local Mixxx-controller corpus check
(`tests/mapper-mixxx.test.mjs`), with the recorded reason
`MIXXX_CONTROLLERS_DIR not set`. That external corpus was not downloaded or
invented. No test was disabled or changed. Existing `UNDICI-EHPA` experimental
proxy warnings remain in raw output and did not alter the exit result.

The complete [before](evidence/mobile-qr-acceptance-2026-11-20/tracked-before.json)
and [after](evidence/mobile-qr-acceptance-2026-11-20/tracked-after.json) tracked-file
manifests are byte-identical. Their SHA-256 is
`9e3818348de0b07e1d632ab3c58d23f113f663e7c2281a81fcd8ac2428231ac1`. This report and evidence were added only after the clean
execution and integrity comparison; they were not part of the tested source.

## Finding closure exercised in this run

| Original requirement | Independent coverage on the corrected combined source |
| --- | --- |
| Actual parser must preserve significant spaces when an earlier chunk is pasted last | The ordinary valid-export regression passes through `parsePhoneRun` in reversed LF and CRLF form, retaining notes and a matching full export hash. The direct helper regression also passes. |
| Mobile copy, VERSION and precache stamp must match the shared source | Both `tests/mobile-build.test.mjs` build-check cases pass. The mobile export suite checks format-code parity and real measurement export/import behavior. |
| Options and emitted output must remain representable and within existing limits | Added option, header-capacity, whole-codepoint packing, actual 999-frame ceiling, compact-line transport and exact wire-budget cases pass. The 1,000,000-byte transfer cap, 2,000-byte QR policy and 1,100-byte default are retained. |
| Direct joining must have a bounded ordinary-input and return-style error contract | Ordinary type and complete raw-budget rejection checks pass on corrected code, alongside existing duplicate, reordered, missing, mixed and damaged frame behavior. |
| Default production export must remain usable | The populated-to-field-limits export passes default framing, the desktop parser, a matching hash and measurement-value comparison. Existing mobile QR rendering checks pass. |
| The combined CDJ candidate must retain its verified local behavior | The CDJ evidence-record and pitch-display suites pass in the same aggregate, including sparse-reference rejection, explicit unknown uncertainty, provisional qualification and numeric gates. Their source was unchanged by this worker. |

The full run includes the five-file QR author scope and both CDJ files. They
were not run again separately; their counts must not be added to this aggregate.
These descriptions identify existing tests, not exhaustive input coverage or
physical-device validation.

Four changed JavaScript files passed syntax checks before the suite:
`app/phone-run.js`, its identical mobile copy, `mobile/sw.js` and
`tests/phone-run.test.mjs`. Exact commands, timestamps, exits and output are in
[syntax metadata](evidence/mobile-qr-acceptance-2026-11-20/syntax.json).
The full suite invokes the mobile generator's check path and tests regeneration
in a temporary copy, so no duplicate standalone generator/check run was needed.
The tested checkout's generated files did not change.

## Exact file identities

| File | SHA-256 |
| --- | --- |
| `app/phone-run.js` | `a96373d0a0c2139d13400e88e6ba34604a7751876b7072e11f71b187eb8c6d39` |
| `mobile/vendor/phone-run.js` | `a96373d0a0c2139d13400e88e6ba34604a7751876b7072e11f71b187eb8c6d39` |
| `tests/phone-run.test.mjs` | `1c97c0e73ed9740d4c4fe72a84cd9bc761616e48f113268c9b1a42f7f75f4008` |
| `mobile/vendor/VERSION` | `351756a9d1e1945ffe2830cabcaae6bc5c59abff1ed535f3891b1a38d690c139` |
| `mobile/sw.js` | `94b56ad0cb90da47df4ca4eab97cfbf9bf66a8b4e4340fe35cac022dca971370` |
| `app/player/evidence-record.js` | `52e7e28403610375ba3db26f2b7e94db3a334fb0b916205489442b754e9a4207` |
| `tests/cdj-evidence-record.test.mjs` | `34021a157c944f98abe8a706d1afdbf47fad0c2541e4b654b7133d29279638ab` |

The [artifact index](evidence/mobile-qr-acceptance-2026-11-20/artifact-index.json)
records every copied artifact's size and SHA-256. The complete
[raw TAP](evidence/mobile-qr-acceptance-2026-11-20/full-suite.tap) is preserved
without formatting edits; its SHA-256 is
`234c1817b89ce8b0d8cb8bcc9218df275344d0ce9183d4ea737726b794654b17`. Test-runner duration and enclosing process time are recorded
separately; neither is a performance gate.

## Limits and handoff

No additional blocker was observed in the executed scope. Fresh code and
defensive workers provide their independent source assessments; this passing
suite does not pre-accept their findings or replace source review.

There was no new adversarial test construction, original-source option/budget
reproduction, external target interaction, scanner, standalone fuzz/stress
campaign or native compilation. The full top-level suite includes the
repository's existing property/regression/fuzz-smoke cases. No standalone
performance, sanitizer, packaging, browser or physical-hardware qualification
was attempted here.

Mobile hashes remain integrity checks and CDJ evidence remains provisional.
This report does not assert exporter identity, calibration, report eligibility,
shipping readiness or a release/deployment. Root owns acceptance integration,
publication and exact-source hosted qualification/guarded merge. Only this
report and its evidence are committed by this worker; application, mobile,
test and generator bytes remain frozen.
