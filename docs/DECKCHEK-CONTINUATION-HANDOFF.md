# DeckChek continuation handoff

Session date: 2026-11-17, America/Los_Angeles. GitHub timestamps and the requested branch suffix use 2026-11-18 UTC.

## Start here

The continuation is [PR #27](https://github.com/djshellshoxxx/deckchek/pull/27), from `integration/deckchek-consolidation-20261118` to `main`. It preserves the PR #26 stack and adds reviewed diagnostic-integrity, privacy, security and verification corrections. **The work is not fully merged or release-qualified.** Check the latest PR head and checks before continuing; do not treat historical green checks as evidence for new source.

Canonical `main` was last verified as `ee5aa511fb49fc56e299d5b5c262e815ab420d0d`. The preserved PR #26 baseline is `4466cc0bb9951a98528f576726e01dd9cecc388e`. No branch was deleted, no historical PR was closed, and no release, tag or deployment was performed. Fleet remains opt-in and OFF by default.

## Reviewable corrective commits

| Commit | Change | Review/evidence |
|---|---|---|
| `f9075bd4b00f0d39680094afda235ff360b7febd` | MIDI capture integrity and per-connection output selection | core_security_review implementation; ci_audit independent review; 75 focused tests passed |
| `79f2e0afca482f8bf54f9c6fa7a9e95a6ce35e88` | Fleet chooses newest evidence by instant | ci_audit implementation; root review; four new cases failed before, 25 focused tests passed after |
| `1541130515dd74c0b0bd52749b60921ce42007da` | Certificate timestamp validation and conservative evidence selection | root implementation; ci_audit review; 37 certificate tests passed |
| `6daf5e8974e09a5865ca9ba14a96cb86c5ec8d4c` | Secure population identifiers without timestamp/Math.random fallback | root implementation; ci_audit review; 13 focused pack tests passed |
| `ed512a17b24c3d678a405e728660ad64e75aa225` | Mechanical Rust formatting and explicit fmt/check/Clippy gates; preserve compiler pipeline failure | Local and CI format pass; shell regression proves exit 23 remains exit 23 |
| `f62e8abb82a7d77c538ea6253bdf8e3a06969ade` | Window-guard source check tolerates formatting | Preserves guarded call assertion; removal mutation rejected |
| `742c67ab93ab52baafa278cc48c6ca7c6d0a8df7` | FS-35 channel response, capture/calibration provenance and keyboard/progress/focus | audio_quality_completion implementation; ci_audit/root review; 51 focused tests passed on Node 22.23.5 |
| `d8dfa334f67a869b03633163861b50eef8da3d06` | Link-command registration source check tolerates Rustfmt line breaks | 20 focused external-link tests passed; full Node 22 suite 1,325 passed, one optional skip |

Dependency correction `1ad6a34fccbd08fd1916802830e399da0ca6b04f` upgrades the vulnerable SQLite/ZIP versions, compatible patch dependencies and both lockfiles, with reviewed ZIP API adaptations and regenerated notices. Independent review reran seven compatibility tests and the old-reader/new-archive check. The remaining GLib warning is not cleared. Restore-schema and Clippy corrections are independently reviewed and recorded in the final source/evidence section below. Commit objects are created through the authenticated GitHub connector because native Git has read access but no push credential. Each branch update is a fast-forward guarded by its expected previous SHA; there is no force push.

## Exact verification and limits

| Scope | Result | Applies to |
|---|---|---|
| Baseline CI [44228369554](https://github.com/djshellshoxxx/deckchek/actions/runs/44228369554) | 654 Linux Rust passed/eight ignored; 1,299 JavaScript passed/one optional skip; 1,276 browser checks passed | `4466cc0` only |
| Initial continuation CI [44250832064](https://github.com/djshellshoxxx/deckchek/actions/runs/44250832064) | Formatting passed; native app compiled; 653 Rust passed, one source-whitespace assertion failed, eight ignored | `ed512a1`; the assertion is corrected in `f62e8ab` |
| Continuation native CI [44251830325](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624238498) | **654 Rust tests passed, eight ignored**; compiler-warning check and type checking passed; strict Clippy exposed 57 existing diagnostics | `742c67a`; dependency/schema/style corrections require new native CI |
| Continuation browser CI [44251830325](https://github.com/djshellshoxxx/deckchek/actions/runs/44251830325/job/134624237913) | **1,283/1,283 checks passed**, no console errors; all seven new FS-35 browser checks passed | `742c67a`; generated waveforms and injected I/O, not physical hardware |
| First full Node 22 continuation run | 1,324 passed, one source-whitespace assertion failed, one optional skip | Source through `742c67a`; corrected in `d8dfa33` |
| Full Node 22 run after both guard corrections | **1,325 passed, zero failures, one optional skip** (1,326 total) | JavaScript/app source and tests represented by `d8dfa33`; later Rust dependency/schema changes require native validation |
| FS-35 focused + independent review | 51/51 each; no threshold relaxation | `742c67a` |
| Local native compilation | Blocked before application tests by missing `glib-2.0.pc` and the supported Tauri native development packages | Not a native test pass |
| Local Chromium smoke launch | Blocked by socket permission failure before browser launch | CI executed the suite successfully at `742c67a`; local launch itself did not pass |
| Physical MIDI/audio/reference qualification | Not executed | Remains open |
| Complete CI at report commit `730d71d`, [run 44256004004](https://github.com/djshellshoxxx/deckchek/actions/runs/44256004004) | JavaScript **1,325 passed/one optional skip**, performance passed; browser **1,283/1,283 passed**, no console errors; native compile failed with `E0428` before application tests | Native cleanup introduced a `DriverScan` alias beside the existing IPC struct; corrected separately in `8acaa7a` |

Focused suite counts overlap with the full suite and must not be summed. The optional JavaScript skip and ignored Rust tests are not passes. The final source/evidence section identifies later CI; pending or cancelled jobs do not qualify the candidate.

### Final source and evidence

| Commit | Correction | Independent evidence |
|---|---|---|
| `1ad6a34fccbd08fd1916802830e399da0ca6b04f` | SQLite/ZIP and compatible patch dependency updates; both locks and notices | Seven migration/backup/archive harness checks and old ZIP reader/new archive compatibility passed; both RustSec audits have zero vulnerability records, one GLib unsoundness warning and five maintenance notices |
| `c387ae9738e4070db33c602a2689c33a28d469f6` | Trusted schema semantics and foreign keys checked before restore; 64 KiB SQL-byte allocation bound | native_security_review implementation; ci_audit independent review; seven exact-validator harness checks passed, including all four release fixtures and SQLite 3.46 v4/v22 databases |
| `2243bbb34e21c198390ef32806f813329a5e3dc1` | Corrections for all 57 observed strict Clippy diagnostics without allowances | clippy_cleanup implementation; clippy_review independent review; ci_audit reviewed the two backup style hunks; differential boundary/decoder/sort checks and formatting passed |

Source through `2243bbb` was retested on Node 22.23.5: **1,325 passed, zero failures, one optional skip**. Report commit `730d71d` then received the CI results above, including the native compilation failure. Do not carry the earlier 654-test native result forward as a pass for upgraded dependencies or new restore checks.

### Reviewed follow-up candidate

| Commit | Change | Independent evidence |
|---|---|---|
| `9192aa0863280300fef3799b09a981ef8c90496b` | Service shortcut failure handling and new-form request ownership | service_lifecycle implementation; ci_audit review; 48 focused checks and five additional lifecycle cases passed; six of eight new regressions failed before the correction |
| `8acaa7a028bd25b49f1e95679e20bf4db8a0e00f` | Rename only the parser tuple alias to `ParsedDriverOutput`; retain the `DriverScan` IPC struct | Root implementation; ci_audit review; formatting passed; compiler verification remains a fresh CI gate |
| `b34f3c905ce60d64bfd15587a9c8906c3fd7a650` | Refuse ambiguous native MIDI names without losing captured input callbacks/output cleanup | midi_native_ambiguity implementation; ci_audit review; 19 actual-production-body harness checks plus six independent cases passed; four boundary cases failed before correction |
| `00f1f3cc8d96527f436ee28958ed23201b60a01b` | Associate pending mapper saves with their original logical mapping | mapper_async_review implementation; service_lifecycle review; 47 focused checks plus four notification/concurrency/error probes passed; three of five regressions failed before correction |

The combined code candidate is **`00f1f3cc8d96527f436ee28958ed23201b60a01b`**. On its complete working source, Node 22.23.5 passed **1,338 tests, zero failures, one optional skip** (1,339 total), and full Rust formatting passed. Fresh native and browser CI remain required for this candidate. These reviewed code scopes are frozen; assign file ownership explicitly before follow-up corrections.

### Reproduce the software checks

Use Node 22 and the supported Rust/Tauri build prerequisites documented in `BUILDING.md`.

```sh
npm test
node --expose-gc --test tests/perf/*.test.mjs
node tools/build-device-index.mjs --check
node tools/check-device-coverage.mjs --check
node tools/check-timecode-facts.mjs
node tools/check-migrations.mjs
node tools/build-mobile.mjs --check
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo test --locked --manifest-path src-tauri/Cargo.toml -j 4
cargo check --locked --manifest-path src-tauri/Cargo.toml -j 4
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -j 4 -- -D warnings
node tools/third-party-notices.mjs --check
cargo audit --file src-tauri/Cargo.lock
cargo audit --file src-tauri/fuzz/Cargo.lock
NODE_PATH="$(npm root -g)" node tools/ui-smoke.mjs
```

Browser CI installs Playwright 1.56.1 and its Chromium on Ubuntu 22.04. The new `tools/smoke/audio-quality.mjs` is automatically discovered. It uses injected I/O and generated waveforms to exercise production browser controls, focus, ownership, evidence and channel plots; it is not a physical-device test.

The current scratch environment also has a tested task-local Node 22.23.5 installation:

```sh
npm exec --offline --yes \
  --cache /workspace/scratch/a884a1d6c4d8/fs35-node22-npm-cache \
  --package=node@22.23.5 -- node --test tests/*.test.mjs
```

The task-local Rust environment is:

```sh
export CARGO_HOME=/workspace/scratch/a884a1d6c4d8/toolchain/cargo
export RUSTUP_HOME=/workspace/scratch/a884a1d6c4d8/toolchain/rustup
export PATH="$CARGO_HOME/bin:$PATH"
```

Do not retry a full local native build against the same missing system-package blocker. CI supplies the supported prerequisites. Do not modify sandbox, sudo, package-source or credential policy to work around it.

## Unresolved gates and next actions

1. Inspect PR #27's current source SHA and complete native, JavaScript and browser CI. Resolve actual failures without weakening numerical thresholds, ownership guarantees, negative tests or warning gates.
2. Obtain a current broad Sonar result. The historical PR #14 and #16 failures were retrieved and triaged; PR #26's ordinary checks do not clear them. The public Sonar issue export returned HTTP 403. No finding was silently accepted or suppressed. Intentional SHA-256 modular arithmetic and canonical UTF-16 key ordering must not be changed mechanically.
   The remaining GLib warning has no compatible lockfile-only resolution in the checked Tauri/WebKit stack. GTK3 0.19 now exists, but the current stack still requires GTK/GLib 0.18. See the security audit's primary-source follow-up; no external caller was observed in the 367-package Linux source scan, which is not binary reachability proof or clearance.
3. Run the existing cross-platform workflow on the integration branch and retain exact artifact/self-test evidence for Windows x64/x86, macOS ARM64/x64 and Linux x64/x86. The configured Linux x86 runtime-smoke limitation remains explicit. This session could not dispatch it: the connector exposes no dispatch method, native `gh` has no login, and the UI fallback showed a signed-out GitHub session. A workflow run may build artifacts without publishing; release publication is restricted to tags, which remain unauthorized here.
4. Run applicable nightly Windows/PDF, sanitizer, long fuzz and stress checks on the same source. Diagnose the historical Windows process-enumeration timeout without simply widening the timeout or removing coverage.
5. Merge only after applicable checks and security dispositions are satisfied. Preserve history with the reviewed merge method. Only after successful replacement merge, close the superseded PRs with contribution/commit evidence; do not delete branches.
6. Continue core features in the ledger's dependency order with a dedicated implementation worker and independent review. Guided FS-12 stylus benchmark capture remains unimplemented. Native connection boundaries now reject observed duplicate names, but stable physical MIDI identities, unreadable-name ambiguity and same-name replacement continuity remain incomplete. Conditional hardware-profile research and the broader architecture backlog remain real work, not hidden behind implementation labels.

### Open numerical-runtime investigation

The untouched `4466cc0` baseline intermittently produces an erroneous cubic-distortion result on Node 24.22.1. Immediate reanalysis of identical buffers yields the expected result. There is no confirmed root cause and no basis to label it a proven V8/JIT defect. Focused Node 22.23.5 tests pass without changed tolerances. Preserve the reproduction and compare supported runtime versions before broad runtime qualification.

### Evidence and compatibility rules

- FS-35 stimulus version remains 1; corrected analysis results use revision 2. Threshold values and the -12 dBFS absolute output cap remain unchanged. Signed mean and per-channel response values stay available.
- Live capture faults/unobservable counters require REVIEW while preserving measured values. Imported audio has explicitly unobserved continuity. Neither condition is fabricated as zero loss.
- MIDI shared drop counters are scoped to all inputs, not attributed to a specific device. Start/end name observations cannot prove uninterrupted physical continuity or eliminate name-reuse races.
- Certificate chronology does not rewrite old signed certificates. An undated historical result requires explicit evidence reconciliation; a newer retest cannot automatically order or discard it.
- Existing valid contributor IDs and supplied/imported pack IDs remain accepted. Secure-randomness failure preserves the old ID.
- No fleet default, license, migration numbering or historical result is changed to simplify integration.

## Reports

- [Branch and PR audit](DECKCHEK-BRANCH-AUDIT.md): frozen branch graph, patch equivalence and contribution dispositions.
- [Consolidation report](DECKCHEK-CONSOLIDATION-REPORT.md): integration decision and corrective scope.
- [Completion ledger](DECKCHEK-COMPLETION-LEDGER.md): 24 FS entries and additional architecture work, with software/hardware/platform/release distinctions.
- [Security audit](DECKCHEK-SECURITY-AUDIT.md): reproduced defects, dependency reachability and residual requirements.
- [Release readiness](DECKCHEK-RELEASE-READINESS.md): exact evidence, failed/blocked checks and platform/hardware limits.

The session used the available OpenAI agents with Caveman guidance. Claude Opus 5.5 was not available in this environment and was not represented as having performed the work.
