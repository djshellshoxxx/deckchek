# MIDItest Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move MIDItest into the DeckChek repo as a self-contained subprogram that ships three ways from one source: (1) a DeckChek add-on unlocked by license, (2) a separate MIDItest desktop app, (3) the existing free web page.

**Architecture:** MIDItest source lives in `app/miditest/` (imported with `git subtree`, history kept). It talks to MIDI through a Web-MIDI-compatible shim over DeckChek's existing `app/midi.js` bridge (Tauri `midir` backend on desktop, Web MIDI in browsers), so the MIDItest UI code barely changes. An offline, signed license file decides whether the add-on and the standalone app unlock. A second Tauri config builds the standalone `MIDItest.exe` from the same Rust crate.

**Tech Stack:** Rust + Tauri 2, `midir` 0.10, `ed25519-dalek` 2 (already in `Cargo.toml`), plain ES modules, `node --test`, Playwright smoke (`tools/smoke/*.mjs`).

**Spec:** Owner request 2026-10-30 ("integrate miditest, keep it as a subprogram that might be bought as an add-on or as a totally separate program"); `docs/SPEC-11-product-editions-and-categories.md` §4 and §5 (MIDI Tester scope, JSON report interop); MIDItest specs in `app/miditest/docs/specs/` after Task 1.

## Decisions needed from the owner before Task 3

| # | Question | Default used by this plan if no answer |
|---|---|---|
| D1 | SPEC-11 says MIDI Tester is **free**. Is it now paid, free, or "free web + paid desktop"? | Price is data (`app/products.json`), so any answer works without code changes. Ship with `miditest: "license"`. |
| D2 | Where does the free web version live? Today: `djshellshoxxx.github.io/Miditest/` served by the Miditest repo. | Keep that URL. The Miditest repo becomes a thin publish target; its README points to DeckChek. Deploy workflow is manual-dispatch only. |
| D3 | How are licenses sold and issued (store, payment provider)? | Out of scope. This plan only verifies license files offline; a separate signing tool issues them. |
| D4 | Retire MIDItest's Electron build? | Yes, replaced by the Tauri standalone app (Task 6). |

## Global Constraints

- Build order (owner rule): the Windows x64 standalone build is made first in every cycle for owner beta testing; other platform builds only on owner instruction.
- Local-first: no network call for licensing, no upload of MIDI data or reports (README: "No account or remote diagnostic service").
- License verification is offline. Only the **public** ed25519 key is in the repo; the private key never is. Tests use a key generated inside the test.
- Feature flags hide UI only (`app/features.js`); the license gate is a separate check and must also apply in the standalone app.
- DeckChek's own controller MIDI tests (`app/midi-tests.js`, Devices screen) stay free and unchanged; only the MIDItest workspace is gated.
- MIDItest report format stays `REPORT_VERSION = 3` (`midi-core.js`); imported reports keep source app and version (SPEC-11 §5).
- CSP stays `script-src 'self'`; MIDItest already loads only module scripts (`app-v2.js`, `ui-assistance.js`).
- No Python, PowerShell, or JUCE in the build. `winscan.ps1` is a runtime resource only (Windows scan feature).

## Review Focus

1. **Device unplugged mid-capture (desktop):** the shim must report the port as `disconnected` through `onstatechange` and keep captured events; test in Task 2.
2. **Same port opened by DeckChek and standalone MIDItest at once:** `midir` on Windows (WinMM) refuses a second open; the user sees "Port is in use by another program", not a crash; test in Task 2.
3. **Message bursts over the 4096-message queue (`QUEUE_CAPACITY` in `midi.rs`):** dropped count reaches MIDItest's Link health test as a finding, never silently lost; test in Task 2.
4. **Missing, corrupt, tampered or expired license file:** app starts, MIDItest shows the locked screen, DeckChek works normally; test in Task 3.
5. **Large SysEx dumps:** `midir` already uses `Ignore::None`; a 64 KB SysEx arrives as one message with intact `F0…F7`; test in Task 2.

---

### Task 1: Import MIDItest into `app/miditest/`

**Files:**
- Create: `app/miditest/**` (via `git subtree add --prefix=app/miditest https://github.com/djshellshoxxx/miditest main`, full history, no squash)
- Delete after import: `app/miditest/skills/`, `app/miditest/shared/` (duplicates of DeckChek's), `app/miditest/package-lock.json`
- Modify: `package.json` `scripts.test` → `node --test tests/*.test.mjs && npm --prefix app/miditest test`
- Modify: `app/miditest/package.json` → drop `electron`, `electron-builder`, `main`, `build` block, `start`, `dist:win` (Electron removed in Task 6; keep `desktop/` until then)

- [ ] **Step 1:** Run the subtree add; confirm `git log --oneline -- app/miditest | wc -l` > 1 (history kept).
- [ ] **Step 2:** Delete the duplicate folders and Electron fields listed above.
- [ ] **Step 3:** Run `npm test`. Expected: DeckChek's suite and all 7 MIDItest test files pass.
- [ ] **Step 4:** Add `app/miditest` to the CI syntax-check loop in `.github/workflows/test.yml` (it already walks `app/`; confirm it picks the new files).
- [ ] **Step 5:** Commit `chore: import MIDItest into app/miditest with history`.

### Task 2: Web-MIDI-compatible shim over the DeckChek bridge

**Files:**
- Create: `app/miditest/lib/midi-access.js`
- Modify: `app/miditest/app-v2.js:55-56,217` (replace `navigator.requestMIDIAccess` with `requestMidiAccess`)
- Modify: `app/midi.js` (add `onPortsChanged(cb)` polling `listPorts()` every 2000 ms while any listener is set; add `stats()` returning `{dropped, emitted}` from `midi_status`)
- Modify: `src-tauri/src/midi.rs` (map the WinMM "already in use" open error to the string `"port-busy"`)
- Test: `app/miditest/tests/midi-access.test.mjs`, `src-tauri/src/midi.rs` unit test

**Interfaces:**
- Produces: `requestMidiAccess({ sysex: boolean }, bridge = defaultBridge) -> Promise<MIDIAccessLike>` where `MIDIAccessLike = { inputs: Map<id, PortLike>, outputs: Map<id, PortLike>, onstatechange, sysexEnabled }`, `PortLike = { id, name, state: 'connected'|'disconnected', onmidimessage, send(bytes) }`. Events: `{ data: Uint8Array, timeStamp: timestampUs / 1000 }`.
- Produces: `availability() -> 'tauri' | 'webmidi' | 'none'` (re-export of `backend()` from `app/midi.js`).
- In a browser with Web MIDI and no Tauri, `requestMidiAccess` returns the native `navigator.requestMIDIAccess` result unchanged.

- [ ] **Step 1: Write failing tests** with a fake bridge (`listPorts`, `open`, `send`, `onMessage`, `onPortsChanged`, `stats`):
  - `maps bridge ports to inputs/outputs Maps keyed by name`
  - `delivers messages with timeStamp = timestampUs/1000 and Uint8Array data`
  - `port removed from listPorts → state 'disconnected' and onstatechange fires; earlier events kept` (Review Focus 1)
  - `open rejects with port-busy → error message "Port is in use by another program"` (Review Focus 2)
  - `stats().dropped > 0 is exposed as access.droppedCount` and `linkHealth` in `midi-tests.js` reports it as a finding (Review Focus 3)
  - `65536-byte SysEx F0…F7 arrives as one message` (Review Focus 5)
- [ ] **Step 2:** `node --test app/miditest/tests/midi-access.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the shim and the `app/midi.js` additions. Add `"port-busy"` mapping plus a unit test in `midi.rs`.
- [ ] **Step 4:** Run the test file plus `cargo test --manifest-path src-tauri/Cargo.toml midi`. Expected: PASS.
- [ ] **Step 5:** Replace every `navigator.requestMIDIAccess` use in `app-v2.js` (lines 55, 56, 217); run `npm test`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(miditest): run on the DeckChek MIDI bridge`.

### Task 3: Offline license entitlements

**Files:**
- Create: `src-tauri/src/license.rs`, `app/entitlements.js`, `app/products.json`, `tests/entitlements.test.mjs`
- Modify: `src-tauri/src/lib.rs` (register `license_status`, `license_install`)

**Interfaces:**
- License file `<app data dir>/licenses/<product>.deckchek-license`, JSON: `{ "v": 1, "product": "miditest", "licensee": string, "issued": "YYYY-MM-DD", "expires": "YYYY-MM-DD" | null, "sig": base64 }`. The signature is ed25519 over the FS-00 canonical JSON of the object without `sig` (reuse `canonical.rs`).
- Rust: `license_status() -> Vec<Entitlement>`, `Entitlement { product: String, state: "valid" | "missing" | "invalid" | "expired", licensee: Option<String>, expires: Option<String> }`; `license_install(path: String) -> Entitlement` (copies the file into place only if it verifies).
- `app/products.json`: `{ "miditest": { "access": "license" } }`; `access` is `"free"` or `"license"` (owner decision D1).
- JS: `isEntitled(product) -> Promise<boolean>` (true when `access` is `"free"` or the state is `"valid"`); `entitlement(product) -> Promise<Entitlement>`. Browser mode: `"free"` products are entitled, `"license"` products are not.

- [ ] **Step 1: Write failing Rust tests** in `license.rs` (key pair generated in the test):
  - `valid_license_verifies`, `tampered_licensee_is_invalid`, `wrong_product_is_invalid`, `expired_is_expired`, `missing_file_is_missing`, `garbage_json_is_invalid_not_panic` (Review Focus 4)
- [ ] **Step 2: Write failing JS tests:** `free product entitled without license`, `license product locked when state missing`, `license product unlocked when valid`.
- [ ] **Step 3:** Run `cargo test license` and `node --test tests/entitlements.test.mjs`. Expected: FAIL.
- [ ] **Step 4:** Implement. Embed the public key as `const LICENSE_PUBKEY: [u8; 32]` with a placeholder; the owner replaces it with the real public key before release. Add a `README` note in `docs/` on how keys are generated and kept offline.
- [ ] **Step 5:** Run both test commands. Expected: PASS.
- [ ] **Step 6:** Commit `feat: offline signed license entitlements`.

### Task 4: MIDItest as a DeckChek add-on screen

**Files:**
- Create: `app/ui/screens/miditest.js`, `app/styles/miditest-host.css`, `tools/smoke/miditest.mjs`
- Modify: `app/features.js` (flag `miditest`, default on), `app/ui/shell.js` (rail entry "MIDItest", icon from `app/ui/icons.js`), `app/miditest/app-v2.js` (when `?host=deckchek`: hide the Circuit Drift brand bar and the external "Labs" links)

**Interfaces:**
- Consumes: `isEntitled('miditest')`, `entitlement('miditest')` (Task 3); `requestMidiAccess` (Task 2).
- The screen mounts `<iframe src="miditest/index.html?host=deckchek">` (same origin, so the bridge and `window.__TAURI__` are reachable through `window.parent`; isolates MIDItest's global CSS from DeckChek's).
- Locked state: title "MIDItest add-on", text "Unlock MIDItest with a license file.", buttons **Install license file…** (`license_install` through the dialog plugin) and **Learn more** (allowlisted link through `app/external-links.js`).

- [ ] **Step 1: Write failing smoke checks** in `tools/smoke/miditest.mjs`, registered in `tools/ui-smoke.mjs`: `locked screen shows when not entitled`, `iframe loads and the Monitor tab renders when entitled` (mock `license_status`), `no horizontal scroll at phone width` (use `setViewport()` from `tools/smoke/core.mjs`).
- [ ] **Step 2:** Run `node tools/ui-smoke.mjs`. Expected: the new checks FAIL.
- [ ] **Step 3:** Implement the screen, rail entry, flag and host-mode tweaks.
- [ ] **Step 4:** Run `node tools/ui-smoke.mjs` and `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: MIDItest add-on screen with license gate`.

### Task 5: Attach MIDItest reports to DeckChek controller results

**Files:**
- Create: `database/migrations/0019_external_report.sql`, `tests/external-report.test.mjs`
- Modify: `src-tauri/src/db.rs` (commands `external_report_attach`, `external_report_list`), `app/ui/screens/devices.js` (button "Attach MIDItest report…" on controller results), `app/miditest/app-v2.js` (in host mode, Report tab button "Send to DeckChek")

**Interfaces:**
- Table `external_report(id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES session(id), source_app TEXT NOT NULL, source_version TEXT NOT NULL, report_version INTEGER NOT NULL, payload_json TEXT NOT NULL, imported_at TEXT NOT NULL)`.
- `external_report_attach(sessionId: i64, payload: String) -> i64`. The JS side first runs `validateReport` from `app/miditest/midi-core.js` and rejects anything non-empty.
- Shown in Devices and History labeled "External evidence: MIDItest <version>, browser/desktop", never merged into DeckChek's own measurements (SPEC-11 §5).

- [ ] **Step 1: Write failing tests:** JS `rejects report with wrong version`, `keeps source app and version`; Rust `attach_and_list_roundtrip`, `migration_0019_upgrades_v0.0.7_fixture` (existing fixture `tests/fixtures/db/v0.0.7.sql`).
- [ ] **Step 2:** Run `npm test` and `cargo test`. Expected: FAIL.
- [ ] **Step 3:** Implement the migration, commands and UI; run `node tools/check-migrations.mjs`.
- [ ] **Step 4:** Run all tests and `node tools/ui-smoke.mjs`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: attach MIDItest reports as external evidence`.

### Task 6: Standalone MIDItest desktop app (Windows beta build first)

**Files:**
- Create: `src-tauri/tauri.miditest.conf.json`, `tools/build-miditest.mjs`, `src-tauri/src/winscan.rs`, `tests/build-miditest.test.mjs`
- Modify: `src-tauri/src/lib.rs` (register `midi_windows_scan`), `.github/workflows/windows-build.yml` (second job builds MIDItest), `.gitignore` (`dist/`)
- Delete: `app/miditest/desktop/` (Electron)

**Interfaces:**
- `tools/build-miditest.mjs [--desktop|--web] [--check]` copies `app/miditest/**`, `app/midi.js`, `app/entitlements.js`, `app/products.json` into `dist/miditest-desktop/` or `dist/miditest-web/`, rewriting import paths. `--check` fails when the output is stale (same pattern as `tools/build-mobile.mjs --check`).
- `tauri.miditest.conf.json` is merged with `cargo tauri build --config`. It sets `productName: "MIDItest"`, `identifier: "com.circuitdriftlabs.miditest"`, `build.frontendDist: "../dist/miditest-desktop"`, window title "MIDItest", and MIDItest icons from `app/miditest/build/`. Bundles `app/miditest/winscan.ps1` as a resource.
- `midi_windows_scan(days: u32) -> Result<serde_json::Value, String>`: clamps days to 1..=30, runs the bundled script with `-NoProfile -NonInteractive -ExecutionPolicy Bypass`, 120 s timeout, `MIDITEST_DAYS` env. On non-Windows it returns `Err("Windows event-log scan is only available on Windows.")`. Same behavior as `desktop/winscan.cjs`.
- At startup the standalone app checks `isEntitled('miditest')` and shows the same locked screen as Task 4 when false.

- [ ] **Step 1: Write failing tests:** `build-miditest --check fails when app/miditest changes`, `web build contains no __TAURI__ references`; Rust `days_clamped_to_1_30`, `non_windows_returns_error`.
- [ ] **Step 2:** Run `npm test` and `cargo test winscan`. Expected: FAIL.
- [ ] **Step 3:** Implement the build tool, config, `winscan.rs` and the CI job; delete `desktop/`.
- [ ] **Step 4:** Run the tests. Then on Windows CI run `node tools/build-miditest.mjs --desktop && cargo tauri build --config src-tauri/tauri.miditest.conf.json`. Expected: `MIDItest_*_x64-setup.exe` and portable exe uploaded as artifacts. Other platforms are not built until the owner instructs.
- [ ] **Step 5:** Commit `feat: standalone MIDItest desktop build from the DeckChek repo`.

### Task 7: Free web build and docs

**Files:**
- Create: `.github/workflows/pages-miditest.yml` (`workflow_dispatch` only, `deploy` input required, same as `pages-mobile.yml`)
- Modify: `docs/SPEC-11-product-editions-and-categories.md` §1 and §4 (record decision D1 and the three distribution modes), `docs/IMPLEMENTATION-STATUS.md`, `README.md`, `app/miditest/README.md`

- [ ] **Step 1:** Add the workflow: it runs `node tools/build-miditest.mjs --web` and uploads `dist/miditest-web` as the Pages artifact. Where it deploys follows decision D2.
- [ ] **Step 2:** Run `node tools/build-miditest.mjs --web`, serve `dist/miditest-web`, and run `npm --prefix app/miditest run test:browser` against it. Expected: PASS.
- [ ] **Step 3:** Update the docs. They must say that hardware validation of MIDItest-on-Tauri is pending owner beta testing.
- [ ] **Step 4:** Commit `docs: MIDItest distribution modes and web build`.

## Not in this plan (follow-ups)

- Merging DeckChek's `app/midi-tests.js` analysis with MIDItest's `midi-core.js`/`midi-tests.js` (overlapping fader, encoder and timing stats). Do it after owner beta testing, as its own plan.
- License sales, payment and key-issuing tool (decision D3).
- macOS/Linux standalone MIDItest builds (owner instruction needed). On those systems the Tauri webview has no Web MIDI, so the `midir` bridge from Task 2 is required.
- Archiving the Miditest repo (after D2).
