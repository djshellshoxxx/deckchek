# DeckChek development plan (M5–M9)

Status: approved for execution by the orchestrator, 2026-10-10. Baseline: `main` at v0.0.4 (Tauri 2 Windows app; Rust in `src-tauri/`, migrations 0001–0002, vanilla ES-module frontend in `app/`). Inputs: feature specs `docs/specs/01–33`, shared foundations [`docs/specs/00-shared-foundations.md`](specs/00-shared-foundations.md) (FS-00) and the [spec index](specs/00-INDEX.md).

Notation: `FS-NN` = `docs/specs/NN-*.md`; `SPEC-NN` = `docs/SPEC-NN-*.md`. Model tiers: **cheap** (docs, data, simple UI wiring), **mid** (standard feature work), **top** (cross-cutting, DSP, safety-critical, concurrency, complex UI integration, final reviews).

---

## 1. Principles and quality bar

DeckChek measures real hardware and its users trust the numbers, so the bar is "bug-free and merge-ready" on every merge, not at the end. Small jobs, one owner per file per wave, tests first for anything numeric, and nothing merges on a red or skipped gate.

### 1.1 Definition of done (every job)
- [ ] Every acceptance criterion the job claims (listed in its job card) has an automated test, or a manual script step in `docs/testing/HARDWARE-TEST-SCRIPTS.md` when it needs real gear.
- [ ] `npm test`, `node --check` on every `app/**/*.js`, `cargo test` (Linux), `cargo check`, `node tools/ui-smoke.mjs` (all flows) and Windows CI (`windows-rust-tests` + `windows-build`) are green on the job branch.
- [ ] No new compiler warnings (`cargo build` warning count not higher than `main`; clippy `-D warnings` from M9), no new console errors in the smoke run, no `TODO` without a linked follow-up in the job's PR notes.
- [ ] Migrations follow §1.5; a new table has a Rust round-trip test; upgrade from the v0.04 fixture still passes.
- [ ] Browser-mode fallback (or an explicit `unsupported` state) works for the feature.
- [ ] Every user string is escaped (`esc()`/`textContent`), every SQL statement parameterised, every file path validated through `userfiles`.
- [ ] Accessibility: keyboard path for the main flow, `aria-live` for results, colour never the only signal, focus returns after dialogs.
- [ ] Feature is behind its `features.*` flag (FS-00 §4.14) unless the spec says always-on.
- [ ] Docs updated in the same branch: the spec's §9 doc list, `docs/IMPLEMENTATION-STATUS.md`, `docs/FEATURE-MATRIX.md` row, `app/README.md` when UI changes.
- [ ] An **independent code-review pass** on the full diff (a different agent session from the implementer, tier per §3; checklist §5.3) with all findings fixed or explicitly waived by the orchestrator.

### 1.2 Merge gates (enforced by the orchestrator)
1. CI green: `javascript-tests`, `rust-tests` (Linux), `windows-rust-tests`, new `ui-smoke` job (added by `M5-ci`), and a manual `windows-build` run for jobs touching Rust, `tauri.conf.json`, capabilities or bundling.
2. Review pass done (§1.1 last item) and recorded in the merge commit body ("Reviewed-by-agent: <session>").
3. Diff stays inside the job's owned files plus its own anchor blocks in hotspot files (FS-00 §4.1). Out-of-scope edits are moved to a follow-up job, not merged.
4. Branch rebased on current `main` and re-tested after the rebase if `main` moved.
5. Docs updated (§1.1).

### 1.3 Branching and worktrees
- One short-lived branch per job: `job/<milestone>-<slug>` (e.g. `job/m5-backup-core`), each in its own `git worktree` under the orchestrator's workspace. Never two jobs on one branch.
- The orchestrator merges with `git merge --no-ff job/<slug>` into `main`, then immediately deletes the branch (`git branch -d`, and `git push origin --delete` if pushed) and removes the worktree (`git worktree remove`). No orphaned branches or worktrees: the orchestrator runs `git worktree list` and `git branch --list 'job/*'` at the end of every wave and must see only in-flight jobs.
- Merge order inside a wave: foundation jobs first, then in ascending migration number, then the rest. If a later job conflicts outside its anchors, it is rebased by its own agent, not hand-fixed by the orchestrator.
- Abandoned jobs: branch deleted, card returned to the backlog with notes.

### 1.4 Commit conventions
- Conventional style: `feat(<area>): …`, `fix(<area>): …`, `test(…)`, `docs(…)`, `chore(ci): …`, `refactor(…)`; area = spec or module (`pregig`, `db`, `fs-00`). Imperative mood, <= 72-char subject, body explains why.
- One logical change per commit; migrations in their own commit (`feat(db): add 0008_pregig migration`).
- Every agent commit ends with the session attribution lines required by the environment (e.g. `Co-Authored-By: …` and `Claude-Session: …`).
- Merge commits: `Merge job/<slug>: <one-line summary>` plus the review record.

### 1.5 Migration rules
- Forward-only. Never edit or renumber a merged migration; fix with a new one.
- Numbers are reserved in FS-00 §5.2; a job uses only its reserved number. New needs get the next free number from the orchestrator.
- Idempotent at two levels: (a) the runner records the version inside the same transaction (FS-00 §4.2, job `M5-F0-db`), so a migration never runs twice; (b) `CREATE … IF NOT EXISTS` everywhere; `ALTER TABLE ADD COLUMN` only with a nullable column or a constant default; no `BEGIN`/`COMMIT` in files.
- Additive only for existing tables: no `DROP`, no column type changes, no data rewrites without a separate data-migration review (top tier).
- Every migration is tested by: the v0.04 fixture upgrade test (`tests/fixtures/db/v0.04.sql` → all migrations, row counts preserved, `integrity_check` ok, `foreign_key_check` empty), a fresh-DB test, and a re-run no-op test.
- The fixture is extended (never rewritten) when a milestone ships: at each release, `M*-release` appends a `v0.0.N.sql` fixture produced by that release's schema with representative rows for the new tables, and the upgrade test runs from every fixture.

### 1.6 Feature flags
- Single registry `app/features.js` (FS-00 §4.14); flags hide UI only, commands always exist. Options > Advanced > Experimental features toggles them.
- New features default **off** for the pre-release they first ship in, unless the spec says otherwise (FS-01 wizard, FS-03 PDF, FS-07 links, FS-08 backup UI, FS-23 fleet default on); flipped to on in the next milestone after the owner's manual hardware run passes.
- Flags are removed (code path made unconditional) in M9 for everything that is on by default and stable.

### 1.7 Versioning and release cadence
- One pre-release per milestone: M5 → `v0.0.5`, M6 → `v0.0.6`, M7 → `v0.0.7`, M8 → `v0.0.8`, M9 → `v0.1.0-rc.1` then `v0.1.0`.
- Release job (`M*-release`, cheap tier, orchestrator-run): bump `version` in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` (and `Cargo.lock`), add the DB fixture for the new schema (§1.5), update `docs/IMPLEMENTATION-STATUS.md`, then run `windows-build.yml` via manual dispatch with `release_tag=v0.0.N` (publishes a GitHub pre-release with the NSIS/MSI artifacts). Hot-fixes during a milestone use `v0.0.N-fix.K`.
- A milestone is releasable only when every job card is merged or explicitly deferred, the owner's hardware script for the milestone has been run (results recorded in `docs/testing/results/v0.0.N.md`), and no open P1 bug exists.

---

## 2. Test strategy

| Layer | What | Where | Gate |
|---|---|---|---|
| Unit — JS pure modules | Every pure function in specs' §4 (`*.js` without DOM), boundary values from each spec's thresholds | `tests/<module>.test.mjs` (`node --test`) | CI |
| Property tests — DSP | Randomised-but-seeded inputs via `tests/fixtures/signals.mjs` (FS-00 §8): e.g. `analyzeTimecode` carrier error < 0.1 % across carriers 1000–3000 Hz and SNR >= 20 dB; `humMeasure` within 0.3 dB for random harmonic mixes; scratch velocity error < 3 % at SNR 30 dB; latency detection within 1 sample for random delays; limiter never exceeds cap for random buffers | `tests/*.property.test.mjs`, fixed seed list, 200 cases each | CI |
| Rust DB | Migration upgrade from every `tests/fixtures/db/v*.sql`, fresh DB, re-run no-op, CRUD round-trips, FK/cascade, constraints, concurrency where relevant (backup during writes) | `#[cfg(test)]` in each `src-tauri/src/*.rs` | CI Linux + Windows |
| Contract tests Rust ↔ JS | For each command: `tests/contracts/<command>.json` holding request + response examples; Rust test deserialises/serialises them through the real types; JS test runs the bridge with a fake `invoke` and asserts exact argument names and response handling | `tests/contracts/`, `tests/contracts.test.mjs`, Rust `contracts_test.rs` | CI |
| UI smoke | One Playwright flow file per feature (`tools/smoke/<feature>.mjs`, auto-discovered by `tools/ui-smoke.mjs`) in browser mode with mocked `invoke`; covers entry point, main flow, error state, Esc/cancel, flag off = hidden | `tools/smoke/` | CI (`ui-smoke` job) |
| Synthetic-signal fixtures | Generated at test time from seeds (no binary blobs): quadrature timecode per format (incl. `phaseSign` -1 formats), dropouts, skips, hum, chirp loopback, howl growth | `tests/fixtures/signals.mjs` | CI |
| DB upgrade | v0.04 fixture → current; later fixtures added per release | `src-tauri/src/db.rs` tests | CI |
| Windows real-scan tests | Existing System Health scans on the Windows runner plus new: `windows_tuning_scan` returns supported, `pregig_processes` parses live `tasklist`, backup/restore round trip with Windows paths, PDF render (`#[ignore]` test run explicitly with `--ignored` in `windows-build.yml`), DPAPI round trip, tray build | `windows-rust-tests`, `windows-build` | CI Windows |
| Manual hardware scripts | Step-by-step scripts with expected results, using the owner's gear: Technics SL-1200MK4, Pioneer PLX-CRSS12, Rane Twelve MK2, Pioneer DJM-A9, Allen & Heath Xone:23C, Traktor Audio 8 DJ, Pioneer DDJ (model TBC), Serato CV02.5 and Traktor Scratch MK2 control vinyl | `docs/testing/HARDWARE-TEST-SCRIPTS.md` (scripts `H-NN` per spec), results in `docs/testing/results/` | Release gate |
| Performance | Node micro-benchmarks for hot loops (live monitor per-hop time, wear-map per-bin time), Rust `stress_run` overhead; budgets in §5.5 | `tests/perf/*.test.mjs` (lenient thresholds in CI, strict on owner PC) | CI (lenient) + M9 |

**Regression suite growth rules**
1. Every bug fix lands with a test that failed before the fix (unit, contract or smoke), named `regression: <issue/slug>`.
2. Every threshold or constant a spec marks "tunable" gets a boundary test at the value, just below and just above.
3. Every manual-script failure that can be reproduced synthetically becomes a signals fixture case.
4. Tests are never deleted to make CI green; quarantining a flaky test requires an orchestrator-approved follow-up job within the same milestone.
5. Coverage is tracked per module (node `--experimental-test-coverage`, `cargo llvm-cov` in M9) and must not drop on a merge.

---

## 3. Milestones, waves and jobs

Each job is sized for one agent session (<= about one day of human work). **Owned files** are exclusive within the wave; "anchor:" means the job only edits its own named block inside a hotspot file created by `M5-F0-scaffold`. Acceptance = the listed spec ACs plus §1.1.

### M5 — Foundations + Essentials (`v0.0.5`)

**Wave 0** (`M5-F0-scaffold` merges first; the other four run in parallel after it)

| Job | Spec | Owned files | Deps | Tier | Acceptance |
|---|---|---|---|---|---|
| M5-F0-scaffold | FS-00 §4.1, §4.14 | anchor blocks in `src-tauri/src/lib.rs`, `app/app.js`, `app/index.html`, `app/ui/shell.js` (menu/init anchors), `app/ui/workflows/definitions.js`; new `app/styles/` dir; `app/features.js`; `app/ui/screens/experimental.js`; `tests/features.test.mjs` | — | mid | FS-00 AC-4; anchors for every FS-01…33 present; no behaviour change (smoke unchanged) |
| M5-F0-db | FS-00 §4.2, §4.5 | `src-tauri/build.rs`, `src-tauri/src/db.rs`, `src-tauri/src/app_state.rs`, `database/migrations/0003_app_state.sql`, `app/app-state.js`, `tests/fixtures/db/v0.04.sql`, `tests/app-state.test.mjs`, anchor FS-00 in `lib.rs` | scaffold | top | FS-00 AC-1, AC-2, AC-3; existing db tests green |
| M5-F0-platform | FS-00 §4.3–4.4 | `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/capabilities/default.json`, `src-tauri/src/userfiles.rs`, `app/userfiles.js`, `tests/userfiles.test.mjs`, plugin init in FS-00 `lib.rs` anchor | scaffold | mid | FS-00 AC-9; Windows build passes with plugins; capability file validates |
| M5-ci | plan §2 | `.github/workflows/test.yml`, `tools/ui-smoke.mjs` (auto-discover `tools/smoke/*.mjs`), `tools/smoke/core.mjs` (existing flows moved), `tools/check-migrations.mjs` | scaffold | mid | `ui-smoke` job in CI; device-index `--check` in CI; tag builds fail on migration gaps |
| M5-tc-facts | FS-06 §6, FS-00 §4.15 | `app/timecode.js`, `app/devices/profiles/{traktor-scratch-timecode,serato-control-vinyl-cv025,pioneer-djm-a9,pioneer-ddj-s8}.json`, `app/devices/index.json`, `tests/timecode.test.mjs`, `tools/check-timecode-facts.mjs` | — | mid | see correction list below; `analyzeTimecode` direction correct for `phaseSign:-1` formats (signals test) |
| M5-hw-scripts | plan §2 | `docs/testing/HARDWARE-TEST-SCRIPTS.md` (H-01…H-08 + baseline), `docs/testing/results/README.md` | — | cheap | scripts reviewed by owner |

**`M5-tc-facts` correction list** (values that disagree with Mixxx `lib/xwax/timecoder.c`):
- `TIMECODE_FORMATS` "Traktor Scratch MK2": 2500 Hz is right, confidence `unverified` → `confirmed` (xwax `traktor_mk2_a/b`); notes/source updated.
- "rekordbox RB-VS1": 1000 Hz is right but notes claim it is undocumented in xwax/Mixxx → `confirmed` from `pioneer_a/b` (flag `SWITCH_POLARITY`).
- "Final Scratch" 1200 Hz: absent from `timecoder.c` → keep `unverified`, notes say "not in xwax timecoder.c".
- Missing formats to add: Traktor Scratch MK2 CD (3000 Hz), Serato CD (1000 Hz), MixVibes 7" (1300 Hz), Algoriddim djay A/B (1000 Hz).
- New fields on every format: `phaseSign` (-1 for xwax `SWITCH_PHASE`: Traktor MK1 `traktor_a/b`, MixVibes), `primary` (`left` for `SWITCH_PRIMARY`), `xwaxId`, `sides[{label,lengthCycles,durationSec}]`. `analyzeTimecode`'s `direction` must apply `phaseSign`; its phase-error metric is unaffected (|phase| vs 90).
- Device profiles: `traktor-scratch-timecode.json` MK2 carrier spec and format → `confirmed`; MK2 side lengths 12/17 min → 12.3/17.3 min with xwax source; "Traktor Scratch control CD" carrier null → MK2 CD 3000 Hz (`confirmed`), MK1 CD stays unknown. `serato-control-vinyl-cv025.json`, `pioneer-djm-a9.json`, `pioneer-ddj-s8.json` format entries for Serato CV02.5 → `confirmed` (carrier only). `carrier_45` 1350 Hz derivation now cites `timecoder_get_resolution` (resolution x speed).
- `tools/check-timecode-facts.mjs` (CI): every `timecode.formats[]` entry in a profile whose name matches a `TIMECODE_FORMATS` entry must not contradict its `carrierHz`.

**Wave 1** (parallel)

| Job | Spec | Owned files | Deps | Tier | Acceptance |
|---|---|---|---|---|---|
| M5-links | FS-07 | `src-tauri/src/links.rs`, `src-tauri/resources/link-allowlist.json`, `app/external-links.js`, `app/ui/dom.js` (`externalLink` only), FS-07 anchors, `tests/external-links.test.mjs`, `tools/smoke/links.mjs` | F0-platform | mid | FS-07 AC-1…8; grep test forbids raw `window.open`/`target=_blank` in `app/` |
| M5-pdf-spike | FS-03 | `src-tauri/src/pdf.rs` (render fixed HTML), `app/print-host.html`, `app/print-host.js` | F0-platform | top | `%PDF-` file > 5 KB from a fixed HTML on Windows CI (`--ignored` test); go/no-go recorded in FS-03 §11 |
| M5-media-core | FS-06 | `database/migrations/0004_test_media.sql`, `src-tauri/src/media.rs`, `app/media-library.js`, `app/media/profiles/*.json`, `app/media/index.json`, `tools/build-media-index.mjs`, `docs/MEDIA-PROFILE-SCHEMA.md`, tests | F0-db, tc-facts | mid | FS-06 AC-2, 3, 5, 7; `dvs_media_side` durations populated from `sides` |
| M5-wizard-model | FS-01 | `app/setup-wizard-model.js`, `src-tauri/src/wizard.rs`, `src-tauri/src/devices.rs` (`create_assets` option only), tests | F0-db | mid | FS-01 AC-6, AC-10 (model side), reducer tests |
| M5-backup-core | FS-08 | `src-tauri/src/backup.rs`, `database/migrations/0005_backup_log.sql`, `app/backup.js`, tests | F0-db, F0-platform | top | FS-08 AC-1, 2, 4–7, 9 (Rust); Windows round trip; failure injection leaves live DB byte-identical |
| M5-diag-core | FS-02 | `src-tauri/src/diagnostics.rs`, `app/diagnostics-bundle.js`, FS-02 anchors, tests | F0-platform | mid | FS-02 AC-1, 2, 4, 6, 8; redaction fuzz |

**Wave 2** (parallel)

| Job | Spec | Owned files | Deps | Tier | Acceptance |
|---|---|---|---|---|---|
| M5-pdf | FS-03 | `src-tauri/src/pdf.rs`, `app/report-pdf.js` (+ `registerPrintableKind`), `app/report-print.css`, `app/print-host.*`, tests, `tools/smoke/pdf.mjs` | pdf-spike, links | top | FS-03 AC-1…7 incl. lopdf "Page 2 of" check |
| M5-media-ui | FS-06 | `app/ui/screens/media.js`, `app/ui/media-picker.js`, `app/styles/media.css`, definitions.js FS-06 anchor, `tools/smoke/media.mjs` | media-core | mid | FS-06 AC-1, 4, 6 |
| M5-wizard-ui | FS-01 | `app/ui/workflows/setup-wizard.js`, `app/ui/screens/calibration.js` (embedded mode), `app/styles/wizard.css`, shell.js FS-01 anchor, `tools/smoke/wizard.mjs` | wizard-model | mid | FS-01 AC-1…5, 7…9; tone always stops |
| M5-backup-ui | FS-08 | `app/ui/screens/data.js`, `app/ui/state.js` (`exportSettingsBlob`/`importSettingsBlob`), `app/styles/data.css`, `tools/smoke/backup.mjs` | backup-core | mid | FS-08 AC-3, 8; browser mode JSON only |
| M5-diag-ui | FS-02 | `app/ui/screens/support-dialog.js`, `app/app.js` FS-02 anchor (error hooks), `tools/smoke/diagnostics.mjs` | diag-core, links | mid | FS-02 AC-3, 5, 7 |

**Wave 3**: `M5-pdf-integration` (mid; Export PDF buttons in `app/ui/persistence.js`, `app/ui/screens/history.js`, `app/ui/screens/system.js`, `app/ui/screens/devices.js`; smoke), `M5-docs` (cheap; README, FEATURE-MATRIX, IMPLEMENTATION-STATUS, SPEC-17 notes), `M5-release` (cheap, orchestrator).

### M6 — DJ features (`v0.0.6`)

**Wave 0** (parallel; this wave alone may edit `Cargo.toml` — no new crates expected)

| Job | Spec | Owned files | Deps | Tier | Acceptance |
|---|---|---|---|---|---|
| M6-F1-dsp | FS-00 §4.6, §8 | `app/hum.js`, `tests/fixtures/signals.mjs`, `tests/hum.test.mjs`, `tests/signals.test.mjs` | M5 | top | hum within 0.3 dB; `core.js humMetrics` output unchanged |
| M6-F1-capture | FS-00 §4.7 | `src-tauri/src/capture.rs`, `app/ui/audio-io.js` (stream bridge + lease errors), `app/ui/capture-busy.js`, tests | M5 | top | FS-00 AC-5; Channel throughput spike: 48 kHz stereo 20 min with 0 dropped blocks on Windows runner |
| M6-F1-audio-out | FS-00 §4.9 | `src-tauri/src/audio_out.rs`, `app/audio-out.js`, tests | M5 | top | FS-00 AC-6 |
| M6-F1-usage | FS-00 §4.8, §4.10 | `database/migrations/0006_asset_usage.sql`, `src-tauri/src/usage.rs`, `src-tauri/src/processes.rs`, `app/usage-hours.js`, tests | M5 | mid | merge/priority tests; tasklist parser fixtures |
| M6-latency-spike | FS-11 §7 | `docs/testing/results/spike-wasapi-buffers.md`, throwaway test binary under `src-tauri/examples/` | M5 | top + owner | requested vs actual period logged on Audio 8 DJ and DJM-A9; decision recorded in FS-11 |

**Wave 1** (parallel; core = pure JS + Rust + migration + tests)

| Job | Spec | Owned files | Deps | Tier |
|---|---|---|---|---|
| M6-latency-core | FS-11 | `app/latency.js`, `src-tauri/src/latency.rs`, `0007_latency_tuner.sql`, tests | audio-out, capture, usage (processes), latency-spike | top |
| M6-pregig-core | FS-10 | `app/pre-gig.js`, `app/pregig-presets.json`, `src-tauri/src/pregig.rs`, `0008_pregig.sql`, tests | dsp, capture, usage | mid |
| M6-stylus-core | FS-12 | `app/stylus-wear.js`, `app/devices/stylus-life.json`, `src-tauri/src/stylus.rs`, `src-tauri/src/dj_sessions.rs`, `0009_stylus_wear.sql`, tests | usage | mid |
| M6-wearmap-core | FS-13 | `app/wear-map.js`, `src-tauri/src/wearmap.rs`, `0010_wear_map.sql`, tests | dsp, capture (stream) | top |
| M6-scratch-core | FS-14 | `app/scratch.js`, `src-tauri/src/scratch.rs`, `0011_scratch_stress.sql`, tests | dsp, M5-tc-facts | top |
| M6-hum-core | FS-15 | `app/hum-tree.js`, `app/feedback.js`, `src-tauri/src/humrun.rs`, `0012_hum_feedback.sql`, tests | dsp, audio-out | top |

**Wave 2** (parallel; UI + smoke + spec-anchor wiring)

| Job | Spec | Owned files | Tier |
|---|---|---|---|
| M6-pregig-ui | FS-10 | `app/ui/workflows/pregig.js`, `app/ui/screens/pregig.js`, `app/styles/pregig.css`, `tools/smoke/pregig.mjs`, FS-10 anchors | mid |
| M6-latency-ui | FS-11 | `app/ui/screens/latency.js`, `app/styles/latency.css`, `tools/smoke/latency.mjs`, FS-11 anchors | mid |
| M6-stylus-ui | FS-12 | `app/ui/screens/stylus.js`, `app/styles/stylus.css`, `tools/smoke/stylus.mjs`, FS-12 anchors | mid |
| M6-wearmap-ui | FS-13 | `app/ui/workflows/wearmap.js`, `app/ui/screens/vinylscan.js`, `app/ui/plots-groove.js`, `app/styles/wearmap.css`, `tools/smoke/wearmap.mjs`, FS-13 anchors | top |
| M6-scratch-ui | FS-14 | `app/ui/workflows/scratch.js`, `app/ui/screens/scratch.js`, `app/styles/scratch.css`, `tools/smoke/scratch.mjs`, FS-14 anchors | mid |
| M6-hum-ui | FS-15 | `app/ui/workflows/hum.js`, `app/ui/workflows/feedback.js`, `app/styles/hum.css`, `tools/smoke/hum.mjs`, FS-15 anchors | mid |

**Wave 3**: `M6-crosslinks` (mid; deep links between pre-gig, latency, hum, stylus, wear map — only `navigate()` calls inside each feature's own screen files, so it runs after wave 2 merges and owns those files for the wave), `M6-hw-scripts` (cheap; H-10…H-15), `M6-docs` (cheap), owner hardware session, `M6-release`.

### M7 — Pro / technician (`v0.0.7`)

**Wave 0**

| Job | Spec | Owned files | Tier |
|---|---|---|---|
| M7-F2-canonical | FS-00 §4.12–4.13 | `src-tauri/src/canonical.rs`, `app/canonical-json.js`, `app/sha256.js`, `app/vendor/qr.js` (+ licence header), `app/metric-compat.js`, `tests/fixtures/canonical-vectors.json`, tests; `Cargo.toml`/`Cargo.lock` (add `ed25519-dalek`, `base64`, `getrandom`, `windows-sys` DPAPI features for M7) | top |
| M7-F2-photo | FS-00 §4.11 | `database/migrations/0013_photo_store.sql`, `src-tauri/src/photo.rs`, `app/photo-store.js`, `src-tauri/src/backup.rs` (photos prefix only), tests, `tools/smoke/photo.mjs` | mid |

**Wave 1** (cores, parallel)

| Job | Spec | Owned files | Tier |
|---|---|---|---|
| M7-cert-core | FS-20 | `src-tauri/src/signing.rs`, `src-tauri/src/certificate.rs`, `0014_certificate.sql`, `app/certificate.js`, tests (incl. DPAPI on Windows) | top |
| M7-population | FS-21 | `app/population.js`, `app/pack.js`, `src-tauri/src/pack.rs`, `0015_unit_population.sql`, tests | mid |
| M7-service-core | FS-22 | `app/service.js`, `src-tauri/src/service.rs`, `0016_service_worksheets.sql`, tests | mid |
| M7-fleet-core | FS-23 | `app/fleet.js`, `src-tauri/src/fleet.rs`, `0017_fleet_dashboard.sql`, tests | mid |

**Wave 2** (UIs, parallel)

| Job | Spec | Owned files | Tier |
|---|---|---|---|
| M7-cert-ui | FS-20 | `app/ui/screens/certificate.js`, `app/ui/screens/verify.js`, `app/report-kinds/certificate.js`, `app/styles/certificate.css`, smoke | mid |
| M7-compare-ui | FS-21 | `app/ui/screens/compare.js`, `app/styles/compare.css`, smoke | mid |
| M7-service-ui | FS-22 | `app/ui/screens/service.js`, `app/ui/workflows/service-job.js`, `app/ui/screens/devices.js` (job mode), `app/report-kinds/jobsheet.js`, smoke | top (embeds the device test runner) |
| M7-fleet-ui | FS-23 | `app/ui/screens/fleet.js`, `app/ui/screens/fleet-venues.js`, `app/ui/booth-sheet.js`, `app/report-kinds/boothsheet.js`, smoke | mid |

**Wave 3**: `M7-docs`, `M7-hw-scripts` (H-20…H-23), owner run (certificates on the full gear list, mock repair job), `M7-release`.

### M8 — Companion apps (`v0.0.8`)

**Wave 0**: `M8-deps` (mid; `tauri` `tray-icon`/`image-png` features, optional `tauri-plugin-notification`, capabilities), `M8-monitor-spike` (top + owner; WASAPI shared capture next to Traktor/Serato on Audio 8 DJ and DJM-A9, Y-split path; result decides FS-31 MVP scope), `M8-hosting-decision` (owner; FS-30 blocker).

**Wave 1**

| Job | Spec | Owned files | Tier |
|---|---|---|---|
| M8-phone-import | FS-30 (desktop) | `0018_session_origin.sql`, `app/phone-run.js`, `app/ui/workflows/import-phone.js`, tests, smoke | mid |
| M8-mobile-pwa | FS-30 (PWA) | `mobile/**`, `tools/build-mobile.mjs` (`--check`), `.github/workflows/pages-mobile.yml` (dispatch-only until hosting decided), `tests/mobile-*.test.mjs` | mid |
| M8-monitor-core | FS-31 | `app/monitor.js`, `src-tauri/src/monitor.rs`, `0019_monitor_log.sql`, tests, `tests/perf/monitor.test.mjs` | top |
| M8-mapper-core | FS-32 | `app/mapper/{model,vocabulary,validate,from-learned,mixxx}.js`, `0020_mapper_models.sql`, `tests/mapper-*.test.mjs`, `tests/fixtures/mapper/` (self-authored only) | top |
| M8-ledger-core | FS-33 | `app/ledger/{build,template,hash,privacy}.js`, `0021_gear_ledger.sql`, tests (incl. leak-grep) | mid |

**Wave 2**: `M8-monitor-ui` (top; `src-tauri/src/tray.rs`, `app/ui/screens/monitor.js`, `app/ui/live-monitor-log.js`, smoke), `M8-mapper-vdj` (mid; `app/mapper/vdj.js`, `serato.js` (report), `traktor-report.js`, tests), `M8-mapper-ui` (mid; `app/ui/screens/mapper.js`, smoke), `M8-ledger-ui` (mid; `app/ui/screens/ledger.js`, smoke, axe check). **Wave 3**: docs, H-30…H-33, owner run, `M8-release`.

### M9 — Audit & hardening (`v0.1.0-rc.1` → `v0.1.0`)

Parallel audit jobs (each produces fixes on its own branch, files claimed per finding by the orchestrator to avoid overlap): `M9-security` (top), `M9-licence` (mid), `M9-review-sweep-{rust,dsp,ui,db}` (top, four sessions), `M9-a11y` (mid), `M9-perf` (top), `M9-db-integrity` (mid), `M9-errors` (mid), `M9-docs` (cheap), `M9-flags-cleanup` (mid), `M9-release` (cheap). Checklists in §5.

### Job count and critical path
M5: 20 jobs, M6: 21, M7: 13, M8: 16 (incl. two owner decisions), M9: 13. Critical path: `M5-F0-scaffold → M5-F0-db → M5-backup-core → M5-backup-ui`, and `M5-F0-platform → M5-pdf-spike → M5-pdf → M5-pdf-integration`; in M6 `F1-capture → wearmap-core → wearmap-ui`; in M8 the owner decisions (hosting, monitor spike).

---

## 4. Risk register and open questions

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | ASIO unavailable (Steinberg SDK licence not redistributable) → latency tuner and live monitor measure WASAPI, not the DJ software's ASIO path | High | Medium | Scope stated in FS-11/31; results labelled "WASAPI"; spikes on owner gear before cores; split-cable workaround documented | orchestrator |
| R2 | DJ software holds the interface exclusively, blocking live monitor and pre-gig captures | High | High (FS-31 headline) | M8 spike first; capture-busy UX; Y-split / spare-input path; degrade to "partial check" | owner + top agent |
| R3 | WebView2 `PrintToPdf` via `with_webview` COM interop harder than expected | Medium | Medium | M5-pdf-spike gates FS-03; fallback iframe print + HTML export always available | top agent |
| R4 | Concurrent capture conflicts between features | Medium | Medium | FS-00 capture lease; single cpal input stream per process | F1-capture |
| R5 | Unsafe output level damages speakers/hearing (hum/feedback, latency chirp) | Low | Very high | Rust hard cap -12 dBFS, limiter tests on adversarial buffers, inactivity mute, STOP first tab stop, manual verification with loop recording | top agent + review |
| R6 | Wrong reference values (test records, stylus life, thresholds) mislead users | Medium | Medium | Confidence flags, provenance, "tunable default" labels; owner verifies sleeves; timecode facts now from xwax source | owner |
| R7 | JS/Rust canonical JSON drift breaks certificate verification | Medium | High | Integer-only canonical form, shared vectors, contract tests | F2-canonical |
| R8 | PII leakage (serials, customer data, EXIF GPS, usernames in logs/bundles/ledgers/packs) | Medium | High | Whitelist serialisers, redaction tests with seeded values, photo re-encode + APP1 check, leak-grep tests, M9 security audit | review + M9 |
| R9 | GPL contamination (xwax/Mixxx code or mapping files) in a proprietary product | Low | High | Facts only; no GPL files committed; optional local corpus test; `M9-licence` scan for copied code and licence headers | M9-licence |
| R10 | Parallel jobs conflict (lib.rs, app.js, Cargo.lock, migrations) | High without mitigation | Medium | Anchors, build.rs migration discovery, deps only in wave 0, merge order rule | orchestrator |
| R11 | Migration failure corrupts a user DB | Low | Very high | Transactional runner with in-transaction version row, fixture upgrade tests per release, FS-08 safety backup before restore, M9 DB audit | F0-db |
| R12 | Mobile PWA publishes proprietary DSP code | High if Pages used | Medium | Owner decision before enabling deploy | owner |
| R13 | Live monitor CPU too high in JS | Medium | Medium | Perf test; phase-2 Rust port pre-specified (FS-31) | M8 |
| R14 | Hardware-dependent ACs can't be automated → regressions slip | Medium | Medium | Synthetic-signal fixtures, manual scripts as release gate, results archived | all |
| R15 | Scratch/skip tests damage control vinyl | Medium | Low | Spare-vinyl warning, 3-skip auto-stop, owner chooses sacrificial record | owner |

**Open questions for the owner (short)**
1. GitHub repo owner/name for "Report on GitHub" issue links (FS-02) — or hide the button?
2. External-link allowlist domains to ship (FS-07).
3. Mobile PWA hosting given the proprietary licence: public Pages, private host, or desktop-served (FS-30)?
4. Exact Pioneer DDJ model you own (repo has a DDJ-S8 profile; Mixxx has no S8 mapping) (FS-32).
5. Confirm WASAPI-only scope (no ASIO SDK) for latency tuner and live monitor (FS-11/31).
6. Can you dedicate a spare control vinyl for skip/scratch calibration (FS-14) and a split cable for monitor tests (FS-31)?
7. Will service worksheets be used commercially (customer-data obligations, FS-22)?

---

## 5. Final audit plan (M9)

Each audit produces `docs/audits/<area>-v0.1.0.md` with findings (severity P1–P4, file, fix job) and is closed only when P1/P2 are fixed and re-verified.

### 5.1 Security review (`M9-security`, top)
- [ ] Capabilities minimal: no plugin wildcard scopes; `opener:allow-open-url` absent or allowlist-only; dialog limited to open/save.
- [ ] CSP unchanged from `tauri.conf.json` baseline except reviewed additions; no remote origins; ledger page CSP verified.
- [ ] Every `#[tauri::command]` validates inputs (sizes, enums, ids) and never takes raw SQL or arbitrary paths; path inputs pass `userfiles`.
- [ ] Zip handling: fixed entry names, size/ratio caps, zip-slip fixture (FS-02/08).
- [ ] XML parsing rejects DOCTYPE/entities (FS-32); JSON import depth/size caps (FS-06/20/21/30/33).
- [ ] Signing key: DPAPI storage, `verify_strict`, no key export, key-loss path (FS-20).
- [ ] Redaction and leak tests pass with seeded username/serial/email/GPS (FS-02/21/33).
- [ ] Process/PowerShell invocations use fixed scripts, `-NoProfile -NonInteractive`, no string concatenation of user input (FS-10/11).
- [ ] Navigation lock: `on_navigation`/`on_new_window` deny external URLs in all windows (main, print host, tray).
- [ ] `cargo audit` and `npm audit` (dev deps) clean or waived with reason.

### 5.2 Dependency and licence audit (`M9-licence`, mid)
- [ ] `cargo deny check licenses bans sources` with an allowlist (MIT, Apache-2.0, BSD-2/3, ISC, Zlib, Unicode-3.0, MPL-2.0 for dev-only); no GPL/LGPL/AGPL in the shipped binary.
- [ ] Third-party notices file generated (`cargo about`) and bundled; vendored JS (`app/vendor/qr.js`) has its licence header.
- [ ] Grep for copied GPL material: no xwax LUT/LFSR tables, no Mixxx mapping files or script fragments, no `Copyright (C) … Mixxx` strings in the repo.
- [ ] Test-record data contains facts only (no sleeve scans/audio); sources cited.
- [ ] Pinned versions: `Cargo.lock` committed; no `*` versions; versions older than 2 weeks at pin time.

### 5.3 Code-review sweep (`M9-review-sweep-*`, top) — also the per-merge review checklist
- [ ] Correctness vs spec ACs; units and dB/linear conversions; off-by-one in windows/bins.
- [ ] Error paths: every `Result` handled; no `unwrap()`/`expect()` outside tests and startup invariants; JS promises awaited or `.catch`ed.
- [ ] Resource lifetimes: streams stopped on all exits (Esc, window close, error), threads joined, lease released.
- [ ] Concurrency: managed-state locks never held across await/long work; no lock-order inversions.
- [ ] Duplication against FS-00 shared modules (no second hum meter, canonicaliser, photo pipeline).
- [ ] Naming consistency camelCase (JS/JSON) ↔ snake_case (Rust/SQL) only via serde `rename_all`.
- [ ] Dead code, unused exports, stale flags removed.

### 5.4 Accessibility audit (`M9-a11y`, mid)
- [ ] axe-core (Playwright) on every screen in light and dark themes: zero serious/critical violations.
- [ ] Keyboard-only run of each main flow; visible focus; focus returns after dialogs; Esc semantics consistent.
- [ ] Live regions announce results once; no focus stealing (`role=status` vs `alert` per spec).
- [ ] Charts/maps have text/table equivalents (FS-12/13/21); colour never the only signal; contrast >= 4.5:1 (3:1 for large text/UI).
- [ ] 200 % zoom and 900 px min width usable; reduced-motion respected (strobe/metronome/flash).
- [ ] Generated artefacts: PDF titles, ledger page semantics, certificate alt text.

### 5.5 Performance / CPU budget (`M9-perf`, top)
| Area | Budget | How measured |
|---|---|---|
| App cold start to interactive | < 3 s on owner PC | manual stopwatch + `performance.now()` marks |
| Live monitor (FS-31) | < 2 % of one core avg over 2 h; heap flat | H-31 + perf test |
| Wear-map scan (FS-13) | per-bin analysis < 50 % of bin duration in real time; memory < 200 MB for 25 min side | perf test + manual |
| Pre-gig (FS-10) | <= 120 s total, orchestration < 5 s | H-10 + smoke |
| Stress test threads (FS-11) | stop within 1 s on Esc | Rust test |
| DB | `reminders_due` 1k assets < 200 ms; pack import 100k rows < 2 s; history list 10k runs < 300 ms | Rust tests |
| UI | no long task > 200 ms during capture (Performance panel) | manual |
- [ ] Budgets met or deviations accepted by owner; regressions vs v0.0.8 investigated.

### 5.6 DB integrity (`M9-db-integrity`, mid)
- [ ] Upgrade from every fixture (v0.04 … v0.0.8) passes; `integrity_check`, `foreign_key_check` clean.
- [ ] All FKs declared with intended `ON DELETE`; polymorphic links (`photo_link`) cleaned by owners; soft-delete respected everywhere (`asset.is_deleted`).
- [ ] Indexes exist for every list/filter query in specs (EXPLAIN QUERY PLAN review).
- [ ] WAL mode and `foreign_keys=ON` on every connection; connection gate honoured.
- [ ] Backup → restore → backup produces identical row sets; restore from each older schema.
- [ ] Retention/pruning jobs (monitor logs, auto-backups) bounded and tested.

### 5.7 Error-handling review (`M9-errors`, mid)
- [ ] Every spec "States" row (empty, loading, partial, error, offline, unsupported) reachable and covered by a smoke or unit test.
- [ ] Error messages follow "cause, consequence, next step"; no raw Rust/JS error strings shown without a friendly line.
- [ ] Device unplug mid-capture, disk full, permission denied, locked file, corrupted import file: each has a test or manual step.
- [ ] Panics and JS errors land in the FS-02 log; crash marker flow verified.

### 5.8 Docs accuracy (`M9-docs`, cheap, reviewed by mid)
- [ ] README, `app/README.md`, FEATURE-MATRIX, IMPLEMENTATION-STATUS, SPEC-07 data model, SYSTEM-CHECK-CONTRACT match the code (command names, tables, flags).
- [ ] Each FS spec's §9 checklist ticked or deviations noted in the spec.
- [ ] Hardware scripts match current UI labels; privacy statements match actual data flows.
- [ ] Release notes for v0.1.0 list known limitations (WASAPI-only, PWA hosting, unverified catalog values).
