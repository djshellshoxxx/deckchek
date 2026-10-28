# Engineering notes (2026-10 completion, audit and release run)

Decisions and pitfalls from the completion/audit/fuzz/release run. Short, dated, newest last.

## Decisions

- **Spec source.** The run brief was written for a "plugin dependency scanner"; this repo is DeckChek. Work list derived from `docs/specs/FS-*` (acceptance criteria) and `docs/DEVELOPMENT-PLAN.md`, tracked in `SPEC_STATUS.md`.
- **Reuse open PRs.** Owner PRs #12 (M7 schemas 0014-0017, population/pack engines) and #13 (fleet) were open, CI-green and overlapped M7. Merged into this branch (`e3c0e5a`) instead of re-implementing; feature jobs build on them. Migration numbers for extensions: 0022 certificate, 0023 population, 0024 service, 0025 fleet (forward-only, never edit 0014-0017).
- **Out of scope here:** PR #9 (FS-34/35/36, its own new specs) and PR #10 (docs/wiki) are not merged; they are not in the spec index on main.
- **Fuzzing.** Rust: cargo-fuzz/libFuzzer (nightly, ASan) in `src-tauri/fuzz/`, entry points in `src-tauri/src/fuzz_api.rs` behind feature `fuzzing` (never in release builds). The same entry points run as a stable `cargo test` smoke on every push. JS: Node has no built-in fuzzer; `tests/fuzz/harness.mjs` is a dependency-free seeded, structure-aware mutator (no new npm deps).
- **Artifact smoke.** `deckchek --self-test=<report.json>` launches the packaged app, analyses a known tone in the real WebView with the shipping code, adds native checks (DB opens/migrates) and exits 0/1 (3 = timeout). CI runs it on the downloaded artifacts. Linux needs `xvfb-run`.
- **CI.** First-party actions only. Replaced `dtolnay/rust-toolchain` (rustup is preinstalled), `Swatinem/rust-cache` (actions/cache of `~/.cargo/registry` + `git/db` keyed on `Cargo.lock`; build trees are not cached), `taiki-e/install-action` (Tauri CLI from npm `@tauri-apps/cli@2.12.1`, matching crate `tauri 2.12.1`), `softprops/action-gh-release` (`gh release create`). `windows-build.yml` retired (duplicate of the release matrix's windows-x64 build).
- **Versioning.** Repo tags so far are `v0.0N-beta`; app version is semver `0.0.8`. MSI needs a numeric version, so the release tag carries the prerelease label (`v0.1.0-beta.1`) and the app version is `0.1.0`; `tools/check-release-version.mjs` enforces the match.

## Pitfalls

- Shared `CARGO_TARGET_DIR` across worktrees serialises cargo (lock); expected, not a hang.
- Agents share the scratchpad: use a private subfolder (`scratchpad/integrator/`) for helper scripts, or names collide.
- JS fuzz harness: never insert shared constant objects into mutated trees (they get mutated in place across iterations and blow up memory); clone them. Bound replication by serialized size.
- `cargo fuzz build` has no `--jobs`; use `CARGO_BUILD_JOBS`.
- The ASan fuzz build of the full Tauri dependency graph takes ~15 min on 2 cores; CI caches fetched crates only.
- A restore test used a trigger to inject a migration failure; the new trigger guard refuses that earlier, so the test now injects a duplicate-column conflict (same intent, stronger guard).
- Baseline UI smoke on this machine (pre-merge, under heavy parallel load): 825/827, two scratch timing checks (`Esc ramps the metronome ... within 100 ms`, `abort calls finish immediately`). Re-check on an idle machine before calling them regressions.

## CI timing (measured from the Actions API)

| Job (per PR push) | Before: run 39809717636 / 39809717358 | After: run 40627154735 |
|---|---|---|
| javascript-tests | 0m53 | 1m06 (adds JUnit report, fuzz smoke, wider syntax check) |
| rust-tests | 5m29 (cargo test + separate cargo check) | 4m06 (cargo test -j4 + warning gate) |
| ui-smoke | 13m41 (Playwright install 6m30) | 8m16 (first run, browser cache cold) |
| windows-rust-tests | 4m06 on every PR | moved to nightly / main / release tags |
| cross-platform matrix (6 builds) | ~44 min on every PR touching app/src | main, tags and dispatch only |
| PR wall clock | ~44 min | ~8.3 min |
