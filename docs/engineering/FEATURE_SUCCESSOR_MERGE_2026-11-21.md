# Feature successor: qualified ordinary merge

PR [#79](https://github.com/djshellshoxxx/deckchek/pull/79) merged at **2026-11-21 10:22:05 UTC** with the expected-head guard. Actual merge/current main: `e36ddc41806b0f6639474f207e3b339e063a6e25`.

Its complete tree `32ca272be2daeee6c4c1f47ccd5bd0ed0ac9909e` is identical to fixed qualified head `f76908766d53992e20382b9cbe73a668a28a6d1a` and tested merge `7c5bf0632cd7f32e63b6f9fd275fd5fc4e46febc`. Root fetched the actual commit, compared the complete tree and verified ordered parents `77c26f44710c6dfb1c986fb79266c233e2ae688c`, then the fixed head. The exact main readback confirmed the actual merge.

The merge adds optional reference-file filename/length/SHA-256 identity, the PDF unrepresentable-axis fallback, a responsive shared toolbar with accessible names, a current Player guide and declared-key Ledger preset handling. Reference identity remains metadata only and does not prove which file was played. Player records remain provisional, unverified, unmeasured and ineligible for measurement reports.

## Exact-source qualification

All applicable jobs succeeded on their first attempt, at that fixed head and the same current base. Release-only jobs were intentionally skipped.

| Workflow | Run | Completed qualification |
| --- | --- | --- |
| Standard | [44887748227](https://github.com/djshellshoxxx/deckchek/actions/runs/44887748227) | Rust, JavaScript and actual Chromium UI smoke |
| Nightly | [44887748226](https://github.com/djshellshoxxx/deckchek/actions/runs/44887748226) | JavaScript fuzz/stress, cargo-fuzz, Rust stress, AddressSanitizer and Windows Rust |
| Desktop | [44887748303](https://github.com/djshellshoxxx/deckchek/actions/runs/44887748303) | Three embedded test jobs, six platform builds and five platform smoke jobs |

The first local Node 24.22.3 gate retained 2,359 total cases: 2,358 passes and one optional Mixxx skip. The separate hosted Node 22.23.5 gate retained the same totals; actual UI smoke completed 1,411 checks. Full original logs, JUnit, selected screenshots/PDF and hashes are in the [hosted evidence record](https://github.com/djshellshoxxx/deckchek/blob/8664c590709dce34445bf23008e61053b592d608/docs/engineering/FEATURE_SUCCESSOR_HOSTED_EVIDENCE_2026-11-21.md). Original first failures and source-specific limits remain preserved.

The [premerge proof](evidence/feature-successor-merge-2026-11-21/premerge-proof.json) records fresh base, exact source, all job identities and outcomes. The [actual-merge proof](evidence/feature-successor-merge-2026-11-21/merge-proof.json) records the expected-head guard, complete tree and ordered-parent checks.

## Later work remains separate

History/Ledger enumeration, Mobile route/export and Quick Check body changes are outside this qualified PR. Round eight's first full 2,395-case successor gate is HELD after one final relative-gain assertion failed (−101 dB at −30 dBFS). Earlier output-level assertions passed. Issue #72 remains open; this PR establishes no numerical cause or repair. Mapper storage #82 is a further unexecuted successor at this checkpoint. Physical qualification, retained Player evidence/pitch/reports and Fleet timing remain unfinished. Fleet stays off. No release, deployment, tag, branch deletion or history rewrite occurred.
