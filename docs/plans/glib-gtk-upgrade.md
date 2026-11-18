# GLib / GTK3 and zbus advisory plan

Status: PLAN ONLY. No code, lock, or config changes. Base: branch `nodata/zealous-mayer-g8x5b0` at `3e85ab5` (equals `origin/integration/deckchek-consolidation-20261118`).
Facts checked 2026-11-18. Sources: `src-tauri/Cargo.lock`, `src-tauri/Cargo.toml`, `cargo 1.97.0` offline tree on the Linux host target, crates.io JSON API (read-only), `docs/DECKCHEK-SECURITY-AUDIT.md` lines 113-130.
Tag: **[v]** = verified in this session. **belief: check independently** = not verified here.

## (a) Current state

Dependency graph:
- [v] Lock resolves `tauri 2.12.1` (Cargo.lock:3833). Direct deps that carry the advisories: `tauri = "2"`, `tauri-plugin-opener = "2"` (2.7.0), `tauri-plugin-dialog = "2"` (2.8.1). `deckchek` names no glib, gtk, zbus, chrono or proc-macro-error directly.
- [v] RUSTSEC-2024-0429 path: `glib 0.18.5 <- gtk 0.18.2 <- tauri-runtime-wry 2.12.1 <- tauri 2.12.1 <- deckchek`. Also `gtk 0.18.2 <- libappindicator 0.9.0 <- tray-icon 0.25.1 <- tauri`, and `webkit2gtk 2.0.2 <- wry 0.57.0 <- tauri-runtime-wry`. Remaining gtk-rs 0.18 crates (atk, gdk, gio, pango, cairo-rs, gdk-pixbuf) are the same stack.
- [v] RUSTSEC-2024-0370 path: `proc-macro-error 1.0.4 <- glib-macros 0.18.5 <- glib 0.18.5`. It follows glib.
- [v] RUSTSEC-2026-0371/0370/0372 path: `zbus 5.19.0 <- tauri-plugin-opener 2.7.0 <- deckchek` (direct). `zbus_names 4.3.4`, `zvariant 5.15.0` and `zvariant_derive 5.15.0` come in through `zbus_macros`/`zbus`.
- [v] RUSTSEC-2026-0543 path: `chrono 0.4.45` is a lock edge of `serde_with 3.24.0` (Cargo.lock:3463, optional feature). `serde_with <- tauri-utils 2.10.1 <- tauri`. The Linux host tree has no chrono edge at all. Windows and macOS trees could not be built offline (crate cache incomplete), so the feature path on those targets is **belief: check independently**.
- [v] Code that uses the opener and dialog plugins (cannot be removed without edits): `src-tauri/src/lib.rs:90, 358, 360`, `src-tauri/src/links.rs:11`.
- [v] CI: `.github/workflows/test.yml` job `rust-tests` runs `cargo test --locked` and `cargo clippy --locked --all-targets -- -D warnings`. `cross-platform-release-validation.yml` builds Windows x64/x86, macOS arm64/x64, Linux x64 (ubuntu-22.04), Linux x86 (Bookworm i386 container). No `deny.toml` or audit config found in the repo.
- [v] Audit doc says glib is "patched upstream at 0.20". crates.io shows glib 0.22.11 as latest. The actual RustSec patched version is **belief: check independently**.

Upstream release state (crates.io manifests, 2026-11-18):
- [v] tauri 2.12.6 (latest stable, 2026-11-16): `gtk ^0.18`, `tauri-runtime-wry ~2.12.4` (optional), `tauri-utils ~2.10.3`.
- [v] tauri 3.0.0-alpha.6 (2026-11-06, pre-release only): `gtk ^0.18` (optional), `tauri-runtime-wry ~3.0.0-alpha.5`.
- [v] tauri-runtime-wry 2.12.4 (latest) and 3.0.0-alpha.6: `gtk ^0.18`, `webkit2gtk =2.0`, `wry ^0.57.0`.
- [v] wry 0.57.2 (latest) and 0.57.0: `gtk ^0.18` (optional), `webkit2gtk =2.0.2` (optional).
- [v] webkit2gtk 2.0.2 (latest, 2025-12-16): `glib ^0.18`, `gtk ^0.18`, `gdk ^0.18`, `gio ^0.18`.
- [v] gtk 0.19.0 (2026-09-08): `glib ^0.22`, `gio ^0.22`, `gdk ^0.19`. glib 0.22.11 is latest (2026-11-14).
- [v] tauri-plugin-opener 2.7.3 (latest stable): `zbus ^5.9`. zbus 6.3.0 is published (2026-11-13), but the opener plugin has not moved to it.
- [v] tauri-utils 2.10.3 (latest): `serde_with ^3`. serde_with 3.24.0 (latest 3.x) keeps chrono as an optional dependency.
- [v] Conclusion: no published stable or alpha tauri, tauri-runtime-wry, wry or webkit2gtk release moves off `gtk 0.18` / `glib 0.18`. The "release that moves off glib 0.18" does not exist as of 2026-11-18.
- belief: check independently. The audit doc's claim that gtk 0.19 requires Rust 1.92 was not re-verified here.

## (b) Options, ranked

**Option 1: move the tauri family to a release off glib 0.18 and zbus 5.** Status: BLOCKED, no such release exists.
- Needs published wry / webkit2gtk-rs / tauri-runtime-wry on gtk 0.19 (glib 0.22), or a stable tauri 3. Only tauri 3 alpha exists.
- This is the correct end state. It is not executable now.

**Option 2: bump glib and zbus directly.** Status: NOT VIABLE under semver.
- `deckchek` has no direct glib or zbus dependency. `gtk 0.18` requires `glib ^0.18`, so cargo cannot select 0.22 while the gtk stack is present.
- `tauri-plugin-opener` requires `zbus ^5.9` at its latest release, so zbus 6 cannot unify.
- A `[patch]` or forced duplicate keeps the 0.18 graph in the lock and does not clear the advisory. Forking the whole gtk/webkit stack is rejected. The audit doc also says a backport needs separately maintained provenance and review.

**Option 3: accept and document now, with a re-check trigger.** Status: AVAILABLE. Recommended.
- Record the advisories as upstream-blocked, with the date and the crates.io evidence above.
- Optionally take the semver-compatible interim patch bump (tauri 2.12.6, tauri-plugin-opener 2.7.3, tauri-plugin-dialog 2.8.4). It clears no advisory.

## (c) Per option: files, risk, verification

**Option 1 (target state, blocked).**
- Files: `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/lib.rs` (plugin init), `src-tauri/src/links.rs` (`OpenerExt`). Capability or permission files and `tauri.conf.json` if plugin permissions change: belief: check independently.
- Risk: WebKitGTK behavior on Linux (webview, IPC, GTK file dialogs, tray via libappindicator). Tauri 3 is a major API change. Windows (`webview2-com 0.39`, `windows 0.62` pinned in `Cargo.toml`) and macOS (objc2 crates) builds change. Linux DEB/AppImage packages depend on the system webkit2gtk-4.1 on ubuntu-22.04: belief: check independently.
- Verify:
  - `cargo tree --manifest-path src-tauri/Cargo.toml -i glib@0.18.5` returns nothing.
  - `cargo tree -d` shows no gtk-3 duplicates.
  - `cargo test --locked` and `cargo clippy --locked --all-targets -- -D warnings` (job `rust-tests`).
  - Full `cross-platform-release-validation.yml` for all six targets.
  - Manual Linux smoke test: window, dialogs, opener links, tray icon.

**Option 2 (rejected).**
- Files that would change: `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`.
- Risk: cargo resolve failure, or a `[patch]` with incompatible gtk types.
- Verify: `cargo tree -i glib@0.18.5` still lists the gtk stack, which is the expected failure.

**Option 3 (recommended now).**
- Files: this plan only. Interim bump, if taken: `src-tauri/Cargo.lock` via `cargo update -p tauri --precise 2.12.6`, `-p tauri-plugin-opener --precise 2.7.3`, `-p tauri-plugin-dialog --precise 2.8.4`. `Cargo.toml` unchanged.
- Risk: documentation only, no runtime change. Interim bump changes tauri-runtime-wry 2.12.1 to 2.12.4 and runs on all six release targets, so it needs full release validation. It is expected to clear no glib or zbus advisory. Whether it clears the chrono edge is **belief: check independently**.
- Verify: `cargo tree -i glib@0.18.5 -e normal` (expected present), `cargo tree -d`, job `rust-tests`, and the cross-platform workflow if the bump is taken.

## (d) Recommendation

Take Option 3 now. The only clean fix (Option 1) needs upstream to publish a gtk 0.19 / glib 0.22 tauri-runtime-wry, wry and webkit2gtk-rs chain. The crates.io evidence shows that has not happened: every tauri and wry release, including the 3.0 alpha, still pins gtk 0.18. Option 2 cannot resolve under semver. Document the RUSTSEC-2024-0429, RUSTSEC-2024-0370 and RUSTSEC-2026-0370/0371/0372/0543 items as upstream-blocked, with a weekly crates.io check of tauri, tauri-runtime-wry, wry, webkit2gtk and gtk. When any of them declares `gtk ^0.19`, open Option 1. Ship any interim patch bump as a separate PR with full release validation, because it clears no advisory.

## (e) Open questions for the owner

1. Is it acceptable to ship Linux x64 and x86 release packages with RUSTSEC-2024-0429 documented as upstream-blocked, or must a fork of tauri-runtime-wry/wry on gtk 0.19 be funded now?
2. Should the interim patch bump (tauri 2.12.6 and plugins) ship now, given it touches all six release targets and clears no advisory?
3. Should CI gain a cargo-audit or cargo-deny gate with explicit exceptions for these IDs, or stay manual? The repo has no audit config today.
