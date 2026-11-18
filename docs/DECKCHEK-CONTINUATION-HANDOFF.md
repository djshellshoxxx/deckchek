# DeckChek continuation handoff

## Current state

Reviewed executable source: **`25e91e97fa2311e2e786894344297ccdc19ca849`**. Its source tree is `b2c36fc3774831859a9d2073e657ec7f013d66d1`; the documentation commit carrying this handoff may have a later SHA with the same executable files. [PR #29](https://github.com/djshellshoxxx/deckchek/pull/29), branch `review/deckchek-lifecycle-20261118`, targets `integration/deckchek-consolidation-20261118` in [PR #27](https://github.com/djshellshoxxx/deckchek/pull/27). `main` remains **`ee5aa511fb49fc56e299d5b5c262e815ab420d0d`**. The preserved PR #26 baseline is `4466cc0bb9951a98528f576726e01dd9cecc388e`.

This checkpoint preserves both prior review head `fd39b14586d9abddf93557b6c5f2628304f2caec` and independently reviewed integration head `ef49ed6cfd08e94651a1536b4e4509efdccdbedb`. Other actors have advanced integration during the session. Refresh remote refs, preserve their work, and update only the owned branch with an expected-head lease. Do not replace PR #27's metadata with stale text.

The exact combined source passed **1,431 passed, zero failed and 1 optional skip (1,432 total; 123.913 seconds)** on Node 22.23.5. Native, browser, platform and extended CI still must qualify the new head. The local guided-stylus changes are **not included** in this checkpoint. They remain blocked on a coupled frequency/metric correction described below. Work is neither fully merged nor release-qualified.

Snapshot dates use UTC. No branches were deleted, historical PRs closed, releases published, tags created or deployments performed. Fleet remains opt-in and OFF by default. Merge verified PRs only after applicable gates; close superseded PRs only after their replacement reaches `main` with contribution evidence.

## Accepted source included here

| Area | Preserved implementation and evidence |
|---|---|
| Cached-screen ownership | Certificate history/signing identity, Verify listeners and monitor saved preferences reject stale asynchronous results. Dedicated behavioral suites and independent probes are retained. |
| ZIP and restore | Direct stream helper preserves bounded reads and zero-byte refusal of both settings/database entries, including ZIP 9 error behavior; database integrity and orphaned-FK checks remain intact. |
| WASAPI example | `ProbeDevice` bundles input/output configuration without changing execution semantics; resolves the single eight-argument Clippy finding. |
| Native MIDI | Pending-open generations and failed-output tombstones preserve ownership; independent production-body harness passed 22 cases and rejected a removed-guard mutant. No physical identity or hardware continuity claim follows. |
| GLib | Exact original 0.18.5 archive and 121-file provenance plus the official two-line fix; all three Cargo roots select the backport. Six optimized actual-crate tests and 670 app tests passed in `ef49ed6` CI before the old warning grep failed. |
| Compiler diagnostics | Exact package/manifest attribution, retained dependency warnings, complete build evidence and failure propagation. Seven unit cases, six actual-Cargo states and independent seven-case shell injection passed. |
| Stress/CI | Unchanged workloads separated into five test files for meaningful process-lifetime memory peaks; platform/nightly PR triggers cover `main` and `integration/**`, preserving permissions, jobs, budgets and tag-only release behavior. |
| Profiles | Inpulse 500 has documented 2-in/4-out USB audio at 44.1 kHz/24 bit; Launchpad Pro MK3 has no built-in audio interface. Primary-source notes preserve unknown USB IDs, maps, class compliance and firmware qualification. |

The catalog remains 45 profiles, 506 handwritten tests, 187 generated tests and 27 conditional audio cases. Four new profile tests plus eight existing planner cases pass. Generated coverage is current; its zero gaps describe plan selection, not physical qualification. R1-14 comparison entry points were already implemented in ancestor `306b067`; independent inspection and existing local/browser evidence confirm them, so no duplicate UI was added.

## Active guided-stylus correction

The remote guided architecture arrived in `3e85ab544bf04aba73ce0be84af915bfd02527a6`. Earlier local work was archived rather than overwritten. The adopted local correction covers stale asset loads/navigation, honest native field observations before compatibility defaults, calibration mismatch, missing quality counters, start/stop identity agreement, setup membership, History-save ownership, harmonic observability, exact excluded values and the unchanged 64 KiB UTF-8 storage bound. It adds actual-screen/native-IPC browser smoke and checks the real audio-output command names. Browser smoke is authored but has not executed locally.

Independent review found two successive DSP defects:

1. A correct short introduction followed by 1005 Hz could qualify because refinement read only a prefix. A frozen complete-window correction resolved all 12 earlier probes and retained all sample bounds and broad/refined observations.
2. Exact 10-second 999/1001/1002 Hz controls at 48 kHz still project to zero at nominal 1000 Hz. The windows correctly measure their in-tolerance frequencies, but presence reads −240 dBFS and ordinary fixed-reference analysis gives incorrect THD and 0 dB separation for known 40 dB source isolation. One nominal control passes and all three offset-eligibility assertions fail. Changing presence alone would admit incorrect measurements.

`stylus_guided_capture` is implementing an approved coupled correction: an explicit guided-only analysis path uses the retained per-window measured fundamental for existing tone/THD routines, pools powers by sample count, applies calibration once, and persists the same metrics used by the benchmark. Nominal 1000 Hz remains separate provenance. Unknown measurements remain unavailable/excluded. A guided analysis-version increment distinguishes old fixed-frequency baselines; old rows and explicit operator-confirmed legacy behavior remain unchanged. The existing ±0.3%, −70 dBFS, harmonic and adverse-measurement policies stay intact.

The worker owns `app/stylus-benchmark.js`, `app/ui/workflows/stylus-benchmark.js`, `app/ui/analysis.js` and focused evidence/contract tests. Other frozen guided files must be preserved. `stylus_independent_review` must review the next freeze before publication. Root owns reports, workflows and integration. `compare_entrypoints` may research another small exact-model batch read-only; do not assume it is implemented. `fuzz_stress_resources` completed warning/stress review and released execution.

Use **one local test owner at a time**, with `--test-concurrency=1`. Repeated overlapping runs showed substantial scheduling/resource disturbance. Do not launch another full local stress run; retain the failed runs and use CI. A stale `native_security_review` agent remains pending initialization and consumes a concurrency slot.

## Exact verification and limits

| Revision or source | Observed result |
|---|---|
| `25e91e97fa2311e2e786894344297ccdc19ca849` / tree `b2c36fc3774831859a9d2073e657ec7f013d66d1` | Complete serial Node 22 suite: 1,431 passed, zero failed and 1 optional skip (1,432 total; 123.913 seconds); before/after source hashes match. |
| `9475ac5` native CI | 670 passed, eight ignored; fmt, compiler-warning and check passed; Clippy failed one example argument-count lint subsequently corrected by `fd39b14`. |
| `ef49ed6` CI | Six optimized GLib regressions and 670 native tests passed, eight ignored; old warning grep failed on 34 dependency warnings. JavaScript 1,391 passed/one skipped; browser 1,293/1,293 passed. |
| Long JS fuzz on frozen tree `6f9ab5666056fe64c96c870db80fe32ca07fbdca` | All 13 targets completed unchanged 120-second budgets across attempts. Initial phone/backup slow calls, mapper slow call and killed processes remain failures; this is not one clean combined invocation. |
| Stress | Full run remains unqualified. Worker split quick run passed six cases, independent repeat passed three and failed three. The host OOM counter changed during both failed and successful runs, so exact cause/victim attribution remains unavailable. |
| Local native/browser | Full native build lacks required GLib/GTK/WebKit/ALSA development metadata; Chromium launch remains blocked by the observed socket/environment limit. Do not repeat unchanged probes or alter environment/access policy. |

CI evidence: [parent native](https://github.com/djshellshoxxx/deckchek/actions/runs/44264888010), [ef49 platform caller](https://github.com/djshellshoxxx/deckchek/actions/runs/44265442094), [ef49 standalone](https://github.com/djshellshoxxx/deckchek/actions/runs/44265441929). Fetch the new head's own runs; do not reuse ancestor green checks as current qualification.

Scratch evidence resides under `/workspace/scratch/a884a1d6c4d8/verification`: `accepted-foundation-source.json`, `accepted-foundation-js.log`, `warning-profile-focused.log`, `rust-warning-gate/`, `fuzz-stress-resources/`, `midi-ef49-independent/`, and `stylus-remote-independent/`. The old windowed freeze is `stylus-guided-windowed-freeze-20261118`; it is intermediate failure evidence, not the final accepted implementation. Reproduce from committed source if scratch is lost.

## Resume commands and publication discipline

Repository: `/workspace/scratch/a884a1d6c4d8/deckchek`. The isolated accepted-source checkout is `/workspace/scratch/a884a1d6c4d8/verification/accepted-foundation-checkout`.

```sh
git status --short
git log -5 --oneline
git fetch origin main integration/deckchek-consolidation-20261118 review/deckchek-lifecycle-20261118
```

After checking ownership and freezing source, use the task-local supported Node runtime:

```sh
/workspace/scratch/a884a1d6c4d8/fs35-node22-npm-cache/_npx/e5e7bdc4f892e393/node_modules/node/bin/node --test --test-concurrency=1 tests/*.test.mjs
```

Task-local Rust settings, for supported small fixtures and formatting:

```sh
export CARGO_HOME=/workspace/scratch/a884a1d6c4d8/toolchain/cargo
export RUSTUP_HOME=/workspace/scratch/a884a1d6c4d8/toolchain/rustup
export PATH="$CARGO_HOME/bin:$PATH"
```

Native Git push and `gh` lack authentication. The GitHub connector can create trees/commits and update the owned branch with an expected-head lease. Assemble and hash an explicit allowlist; preserve both integration histories; inspect a rejected lease before retrying. Do not bulk-stage unreviewed guided changes or concurrent work. The integration retains exact upstream vendor bytes; do not rewrite those bytes to satisfy cosmetic whitespace checks.

## Next actions

1. Monitor the new head's tests, package/self-test and extended workflows; fix concrete failures while retaining all evidence and budgets.
2. Complete and independently review the coupled guided measurement correction, including actual History serialization, optional timecode/calibration detail size, coherent offsets, drift, phase/amplitude changes, differing channels, high harmonics and adverse separation. Then publish a separately reviewed source update and qualify it on CI.
3. Continue small primary-source hardware research batches only where evidence resolves actual capability fields; retain unknown hardware/firmware/mapping facts.
4. Obtain current broad Sonar evidence through supported access. The previous public export returned 403, and ordinary tests do not clear historical findings. No acceptance or suppression was authorized. Preserve SHA-256 modular arithmetic and canonical UTF-16 ordering when reviewing analyzer findings.
5. Complete current-source Windows/PDF, sanitizer, long combined fuzz, full stress and platform artifacts/self-tests. No tag, release or deployment is authorized. Hardware acceptance, signing/notarization credentials and owner-level product decisions remain distinct blockers.
6. Merge only verified changes. Reconcile PR #28's stale pre-backport advisory narrative; close superseded PRs only after contribution-preserving replacement reaches main. Continue the completion ledger's unblocked work afterwards.

Compatibility rules: FS-35 stimulus version 1 and analysis revision 2 remain; the −12 dBFS output cap is unchanged. Missing capture counters remain unobserved/REVIEW, not zero loss. Shared MIDI drop counts do not identify one device. Same-name physical MIDI replacement and unreadable-name ambiguity remain unqualified. Historical certificates/results/migrations are not rewritten. Structured History plus local metadata does not imply a raw PCM archive. The intermittent untouched-baseline Node 24 numerical anomaly has no confirmed JIT/root cause; supported Node 22 evidence must not be generalized beyond tested source.

The available OpenAI implementation/review agents and Caveman guidance were used. Claude Opus 5.5 was not exposed in this environment and was not represented as having performed the work.

## Reports

- [Branch/PR audit](DECKCHEK-BRANCH-AUDIT.md): ancestry, patch equivalence and contribution dispositions.
- [Consolidation report](DECKCHEK-CONSOLIDATION-REPORT.md): preserved source and integration decisions.
- [Completion ledger](DECKCHEK-COMPLETION-LEDGER.md): implemented, under-review, unqualified and blocked features.
- [Security audit](DECKCHEK-SECURITY-AUDIT.md): reproduced failures, fixes and residual risks.
- [Release readiness](DECKCHEK-RELEASE-READINESS.md): exact passes, failures and unavailable gates.
