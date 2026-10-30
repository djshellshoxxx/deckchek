# MIDItest Integration Implementation Plan

> **Proposal status:** Not approved for implementation of licensing, hosting, private-key issuance, security-policy changes or Electron retirement. Corrected against DeckChek continuation `722c7fdaadedfb2fd4906a6bd12ecaf9438d66b6` on 2026-10-30; recheck the integration baseline and active ownership before implementation. This document does not authorize releases or deployments. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Baseline scope:** Workflow, migration and bridge details below describe continuation `722c7fdaadedfb2fd4906a6bd12ecaf9438d66b6`, which is not yet merged into main. Main `f3fbf1cc0ba2047e6e1929f3c6622f55a76865f1` still has `windows-build.yml`, uses `npm test` in its test workflow, and has no `nightly.yml`. Reconcile the chosen implementation baseline before executing these tasks. Merging this proposal does not merge or approve the continuation stack.

**Goal:** Propose moving MIDItest into the DeckChek repo as a self-contained subprogram with a DeckChek workspace, a separate desktop app and a web build from shared source. Licensing and distribution remain conditional on D1–D4 below; the existing free MIDI Tester scope is unchanged until an explicit decision is recorded.

**Architecture:** MIDItest source lives in `app/miditest/` (imported with `git subtree`, history kept). It talks to MIDI through a Web-MIDI-compatible shim over DeckChek's existing `app/midi.js` bridge (Tauri `midir` backend on desktop, Web MIDI in browsers), so the MIDItest UI code barely changes. If D1 approves licensed access, a separately reviewed offline entitlement design would control access to the add-on and standalone app. A second Tauri config builds the standalone `MIDItest.exe` from the same Rust crate.

**Tech Stack:** Rust + Tauri 2, `midir` 0.10, `ed25519-dalek` 2 (already in `Cargo.toml`), plain ES modules, `node --test`, Playwright smoke (`tools/smoke/*.mjs`).

**Spec:** Owner request 2026-10-30 ("integrate miditest, keep it as a subprogram that might be bought as an add-on or as a totally separate program"); `docs/SPEC-11-product-editions-and-categories.md` §4 and §5 (MIDI Tester scope, JSON report interop); MIDItest specs in `app/miditest/docs/specs/` after Task 1.

## Owner decisions and task dependencies

No silence-based defaults apply. The current free MIDI Tester specification remains authoritative until explicitly revised.

| # | Question | Status and dependent work |
|---|---|---|
| D1 | SPEC-11 says MIDI Tester is **free**. Is it paid, free, or "free web + paid desktop"? | Unresolved. Tasks 3, 4 and 6 must not install a license requirement or select a shipping access policy before this decision. Task 7 records the actual decision. |
| D2 | Where does the web version live, and which repository owns publication? | Unresolved. Keep the existing service unchanged. Task 7's hosting/workflow and any change to the Miditest repository require this decision; no deployment is authorized here. |
| D3 | How are licenses sold, issued and revoked; who controls signing-key issuance? | Unresolved and out of this implementation scope. No store/provider integration, private-key generation or issuance tooling is authorized. Task 3 cannot ship against a placeholder issuer. |
| D4 | Retire MIDItest's Electron build? | Unresolved. Tasks 1 and 6 preserve Electron source, dependencies and packaging until explicitly approved retirement and verified replacement behavior. |

A source import, bridge or report attachment must still be separately accepted and checked against live source. The snippets below are proposed interfaces, not evidence that an import, build, license design or hardware qualification has passed.

## Global Constraints

- Build order (owner rule): the Windows x64 standalone build is made first in every cycle for owner beta testing; other platform builds only on owner instruction.
- Local-first: no network call for licensing, no upload of MIDI data or reports (README: "No account or remote diagnostic service").
- If D1 approves licensing, verification uses the existing audited ed25519 library offline; no custom cryptography. Only an approved **public** key may be in shipping code. Test-only ephemeral keys remain fixtures, never production issuance.
- Feature flags hide UI only (`app/features.js`). Any license gate depends on D1 and a reviewed entitlement boundary; do not present a UI-only check as native authorization.
- DeckChek's own controller MIDI tests (`app/midi-tests.js`, Devices screen) stay free; preserve their validation, evidence thresholds and connection/disposal ownership. Any MIDItest entitlement is conditional on D1.
- MIDItest report format stays `REPORT_VERSION = 3` (`midi-core.js`); imported reports keep source app and version (SPEC-11 §5).
- Preserve the complete existing CSP, including `script-src 'self'` and `frame-ancestors 'none'`. A same-origin iframe is blocked by the current desktop/smoke policy; choose a compatible mount design without weakening it. Native file-selection authorization and URL-confirmation policy remain separate scoped decisions.
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
- Inspect after import: `app/miditest/skills/`, `app/miditest/shared/` and its dependency manifests. Remove only proven duplicates after preserving distinct content and resolving import paths; retain the lockfile unless a reviewed dependency-layout change requires otherwise.
- Modify: `package.json` `scripts.test` → `node --test tests/*.test.mjs && npm --prefix app/miditest test`
- Preserve: `app/miditest/package.json` Electron dependencies, `main`, `build`, `start`, `dist:win` and `desktop/` until D4 and replacement validation.
- Modify: `.github/workflows/test.yml` to execute the imported MIDItest tests explicitly; changing the root npm script alone does not affect its direct Node test invocation.

- [ ] **Step 1:** Pin the source repository and exact import SHA before running the non-squashed subtree import. Verify that source SHA is an ancestor of the resulting import commit and that the imported subtree matches the source tree before cleanup. A path-filtered log count does not prove full-history preservation because the historical source paths were unprefixed.
- [ ] **Step 2:** Review imported folders and dependency resolution. Preserve distinct content and Electron packaging; remove only verified duplicates.
- [ ] **Step 3:** Run `npm test`. Expected: DeckChek's suite and all MIDItest test files present at the pinned import pass; enumerate them instead of assuming a historical count.
- [ ] **Step 4:** Add the imported MIDItest tests to `.github/workflows/test.yml` while retaining DeckChek's direct Node invocation, JUnit output and all existing checks. The syntax loop already walks `app/` recursively; verify it discovers the imported modules without adding duplicate traversal. Demonstrate that a failing imported test fails CI.
- [ ] **Step 5:** Commit `chore: import MIDItest into app/miditest with history`.

### Task 2: Web-MIDI-compatible shim over the DeckChek bridge

**Files:**
- Create: `app/miditest/lib/midi-access.js`
- Modify: `app/miditest/app-v2.js:55-56,217` (replace `navigator.requestMIDIAccess` with `requestMidiAccess`)
- Modify: `app/midi.js` (add `onPortsChanged(cb)` polling `listPorts()` every 2000 ms while any listener is set; reuse existing `status()` for `{dropped, emitted}` rather than adding a duplicate `stats()` API)
- Modify: `src-tauri/src/midi.rs` (map the WinMM "already in use" open error to the string `"port-busy"`)
- Test: `app/miditest/tests/midi-access.test.mjs`, `src-tauri/src/midi.rs` unit test

**Interfaces:**
- Produces: `requestMidiAccess({ sysex: boolean }, bridge = defaultBridge) -> Promise<MIDIAccessLike>` where `MIDIAccessLike = { inputs: Map<id, PortLike>, outputs: Map<id, PortLike>, onstatechange, sysexEnabled }`, `PortLike = { id, name, state: 'connected'|'disconnected', onmidimessage, send(bytes) }`. Events: `{ data: Uint8Array, timeStamp: timestampUs / 1000 }`.
- Produces: `availability() -> 'tauri' | 'webmidi' | 'none'` (re-export of `backend()` from `app/midi.js`).
- In a browser with Web MIDI and no Tauri, `requestMidiAccess` returns the native `navigator.requestMIDIAccess` result unchanged.

- [ ] **Step 1: Write failing tests** with a fake bridge (`listPorts`, `open`, `send`, `onMessage`, `onPortsChanged`, `status`):
  - `maps bridge ports to inputs/outputs Maps keyed by name`
  - `delivers messages with timeStamp = timestampUs/1000 and Uint8Array data`
  - `port removed from listPorts → state 'disconnected' and onstatechange fires; earlier events kept` (Review Focus 1)
  - `open rejects with port-busy → error message "Port is in use by another program"` (Review Focus 2)
  - `status().dropped > 0 is exposed as access.droppedCount` and `linkHealth` in `midi-tests.js` reports it as a finding (Review Focus 3)
  - `65536-byte SysEx F0…F7 arrives as one message` (Review Focus 5)
- [ ] **Step 2:** `node --test app/miditest/tests/midi-access.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the shim and minimal bridge additions. Preserve current strict packet checks, timestamp units, connection ownership and cleanup; a disposed or replaced consumer must not send, save a result or close its successor's port. Add deterministic regressions for replacement during open/send and disposal during pending work. Add `"port-busy"` mapping plus a unit test in `midi.rs`.
- [ ] **Step 4:** Run the test file plus `cargo test --locked --manifest-path src-tauri/Cargo.toml midi`. Expected: PASS.
- [ ] **Step 5:** Replace every `navigator.requestMIDIAccess` use in `app-v2.js` (lines 55, 56, 217); run `npm test`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(miditest): run on the DeckChek MIDI bridge`.

### Task 3: Offline license entitlements (conditional; D1 and issuer design required)

**Files:**
- Create: `src-tauri/src/license.rs`, `app/entitlements.js`, `app/products.json`, `tests/entitlements.test.mjs`
- Modify: `src-tauri/src/lib.rs` (register `license_status`, `license_install`)

**Interfaces:**
- License file `<app data dir>/licenses/<product>.deckchek-license`, JSON: `{ "v": 1, "product": "miditest", "licensee": string, "issued": "YYYY-MM-DD", "expires": "YYYY-MM-DD" | null, "sig": base64 }`. The signature is ed25519 over the FS-00 canonical JSON of the object without `sig` (reuse `canonical.rs`).
- Rust: `license_status() -> Vec<Entitlement>`, `Entitlement { product: String, state: "valid" | "missing" | "invalid" | "expired", licensee: Option<String>, expires: Option<String> }`; license installation must use a separately approved file-selection authorization design before implementation. A proposed path-taking command is not an authorized native file boundary; signature/shape checks alone do not authorize a readable path.
- `app/products.json`: access policy is selected only after D1. The proposed enum is `"free" | "license"`; do not seed `"license"` as a default.
- JS: `isEntitled(product) -> Promise<boolean>` (true when `access` is `"free"` or the state is `"valid"`); `entitlement(product) -> Promise<Entitlement>`. Browser mode: `"free"` products are entitled, `"license"` products are not.

- [ ] **Step 1: Write failing Rust tests** in `license.rs` (key pair generated in the test):
  - `valid_license_verifies`, `tampered_licensee_is_invalid`, `wrong_product_is_invalid`, `expired_is_expired`, `missing_file_is_missing`, `garbage_json_is_invalid_not_panic` (Review Focus 4)
- [ ] **Step 2: Write failing JS tests:** `free product entitled without license`, `license product locked when state missing`, `license product unlocked when valid`.
- [ ] **Step 3:** Run `cargo test --locked --manifest-path src-tauri/Cargo.toml license` and `node --test tests/entitlements.test.mjs`. Expected: FAIL.
- [ ] **Step 4:** Only after D1 and the issuer/file-selection design are approved, implement verification using the existing library and approved public-key configuration. Keep placeholder/test keys confined to tests and prevent a shipping build from accepting them. Document the remaining issuer prerequisite without creating private-key or issuance tooling.
- [ ] **Step 5:** Run both test commands. Expected: PASS.
- [ ] **Step 6:** Commit `feat: offline signed license entitlements`.

### Task 4: MIDItest as a DeckChek workspace (D1-dependent access policy)

**Files:**
- Create: `app/ui/screens/miditest.js`, `app/styles/miditest-host.css`, `tools/smoke/miditest.mjs`
- Modify: `app/features.js` (flag `miditest`, default off until integration and ownership qualification), `app/ui/shell.js` (rail entry "MIDItest", icon from `app/ui/icons.js`), `app/miditest/app-v2.js` (when `?host=deckchek`: hide the Circuit Drift brand bar and the external "Labs" links)

**Interfaces:**
- Consumes: `isEntitled('miditest')`, `entitlement('miditest')` (Task 3); `requestMidiAccess` (Task 2).
- Use a lifecycle-aware mount/unmount interface in the existing document, with scoped styles and an explicitly supplied bridge. Do not mount the proposed iframe: current `frame-ancestors 'none'` blocks it in the desktop configuration and smoke server. Review a concrete mount design before implementation; a CSP change would require a separate scoped decision. Unmount must cancel owned timers/listeners and release only owned MIDI resources.
- If D1 approves licensed access, proposed locked state: title "MIDItest add-on", text "Unlock MIDItest with a license file.", buttons **Install license file…** (`license_install` through the dialog plugin) and **Learn more** (allowlisted link through `app/external-links.js`).

- [ ] **Step 1: Write failing smoke checks** in `tools/smoke/miditest.mjs` (automatically discovered by `tools/ui-smoke.mjs`): `workspace mounts and Monitor renders under the unchanged CSP`, `unmount releases only owned resources`, `no horizontal scroll at phone width` (use `setViewport()` from `tools/smoke/core.mjs`). Add free/licensed-state checks only for the policy actually approved in D1.
- [ ] **Step 2:** Run `node tools/ui-smoke.mjs`. Expected: the new checks FAIL.
- [ ] **Step 3:** Implement the screen, rail entry, flag and host-mode tweaks.
- [ ] **Step 4:** Run `node tools/ui-smoke.mjs` and `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit a description of the approved workspace and access policy.

### Task 5: Attach MIDItest reports to DeckChek controller results

**Files:**
- Create: `database/migrations/0023_external_report.sql`, `tests/external-report.test.mjs`
- Modify: `src-tauri/src/lib.rs` (register both IPC commands), `src-tauri/src/db.rs` (commands `external_report_attach`, `external_report_list`), `app/ui/screens/devices.js` (button "Attach MIDItest report…" on controller results), `app/miditest/app-v2.js` (in host mode, Report tab button "Send to DeckChek")

**Numbering prerequisite:** `0023` is provisional, not reserved. The continuation already contains 0019 monitor, 0020 mapper, 0021 ledger and 0022 population extension. Recheck the live integration tree and allocate the next free number immediately before implementation; never renumber existing migrations. `src-tauri/build.rs` discovers migrations automatically.

**Interfaces:**
- Table `external_report(id INTEGER PRIMARY KEY, session_id TEXT NOT NULL REFERENCES session(id), source_app TEXT NOT NULL, source_version TEXT NOT NULL, report_version INTEGER NOT NULL, payload_json TEXT NOT NULL, imported_at TEXT NOT NULL)`.
- `external_report_attach(session_id: String, payload: String) -> i64`. Keep session IDs as strings throughout JS and IPC. The JS side runs `validateReport` from `app/miditest/midi-core.js`; the native command independently validates report version, shape, size and the referenced session before persistence. Reject invalid input without echoing its contents.
- Shown in Devices and History labeled "External evidence: MIDItest <version>, browser/desktop", never merged into DeckChek's own measurements (SPEC-11 §5).

- [ ] **Step 1: Write failing tests:** JS `rejects report with wrong version`, `keeps source app and version`; Rust `attach_and_list_roundtrip` with a nonnumeric session ID, `missing_session_is_rejected`, invalid/oversized native payload rejection, `migration_0023_upgrades_v0.0.7_fixture` (existing fixture `tests/fixtures/db/v0.0.7.sql`).
- [ ] **Step 2:** Run `npm test` and `cargo test --locked --manifest-path src-tauri/Cargo.toml`. Expected: FAIL.
- [ ] **Step 3:** Implement the migration, commands and UI; run `node tools/check-migrations.mjs`.
- [ ] **Step 4:** Run all tests and `node tools/ui-smoke.mjs`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: attach MIDItest reports as external evidence`.

### Task 6: Standalone MIDItest desktop app (Windows beta first; D1/D4 dependencies)

**Files:**
- Create: `src-tauri/tauri.miditest.conf.json`, `tools/build-miditest.mjs`, `src-tauri/src/winscan.rs`, `tests/build-miditest.test.mjs`
- Modify: `src-tauri/src/lib.rs` (register `midi_windows_scan`), a separately reviewed Windows x64 artifact-only CI job (see workflow scope below), `.gitignore` (`dist/`)
- Preserve: `app/miditest/desktop/` and Electron dependencies/packaging until D4 explicitly approves retirement and replacement behavior is verified.

**Workflow scope:** `windows-build.yml` is retired. `test.yml` owns Linux JS/Rust/browser checks, `nightly.yml` owns Windows Rust/sanitizer/fuzz/stress checks, and `cross-platform-release-validation.yml` owns platform packaging with tag-only publication. Scope a new Windows x64 artifact-only job separately, retaining all existing gates and publication conditions. Do not invoke the full-platform release matrix, revive the retired workflow, create tags or publish/deploy to satisfy this proposal.

**Interfaces:**
- `tools/build-miditest.mjs [--desktop|--web] [--check]` uses explicit, separately reviewed desktop and web asset manifests to produce `dist/miditest-desktop/` or `dist/miditest-web/`, rewriting only documented imports. Do not copy `app/miditest/**` indiscriminately: preserved Electron sources/dependencies, tests, development artifacts and unrelated resources must not enter distribution output. Desktop may include the reviewed DeckChek bridge and approved entitlement modules. Web uses a browser-only MIDI adapter; it must not copy `app/midi.js` wholesale because that module contains `__TAURI__` references. `--check` fails when the output is stale (same pattern as `tools/build-mobile.mjs --check`).
- `tauri.miditest.conf.json` is merged with `cargo tauri build --config`. It sets `productName: "MIDItest"`, `identifier: "com.circuitdriftlabs.miditest"`, `build.frontendDist: "../dist/miditest-desktop"`, window title "MIDItest", and MIDItest icons from `app/miditest/build/`. Bundles `app/miditest/winscan.ps1` as a resource.
- `midi_windows_scan(days: u32) -> Result<serde_json::Value, String>`: clamps days to 1..=30, runs the bundled script with `-NoProfile -NonInteractive -ExecutionPolicy Bypass`, 120 s timeout, `MIDITEST_DAYS` env. On non-Windows it returns `Err("Windows event-log scan is only available on Windows.")`. Same behavior as `desktop/winscan.cjs`.
- Startup follows the access policy actually approved by D1; only an approved licensed variant uses the locked screen from Task 4.

- [ ] **Step 1: Write failing tests:** `build-miditest --check fails when app/miditest changes`, `web build contains no __TAURI__ references`; Rust `days_clamped_to_1_30`, `non_windows_returns_error`.
- [ ] **Step 2:** Run `npm test` and `cargo test --locked --manifest-path src-tauri/Cargo.toml winscan`. Expected: FAIL.
- [ ] **Step 3:** After accepting the scoped build design, implement the build tool, config, `winscan.rs` and artifact-only CI job. Retain Electron until D4 and replacement validation; do not bundle retirement into this implementation by default.
- [ ] **Step 4:** Run the tests. Then on Windows CI run `node tools/build-miditest.mjs --desktop && cargo tauri build --config src-tauri/tauri.miditest.conf.json`. Expected: `MIDItest_*_x64-setup.exe` and portable exe uploaded as artifacts. Other platforms are not built until the owner instructs.
- [ ] **Step 5:** Commit `feat: standalone MIDItest desktop build from the DeckChek repo`.

### Task 7: Web build and docs (D1/D2-dependent; no deployment authorized)

**Files:**
- Proposed only after D2: `.github/workflows/pages-miditest.yml`; keep build validation separate from any publication. A manual trigger does not itself authorize deployment.
- Modify: `docs/SPEC-11-product-editions-and-categories.md` §1 and §4 (record decision D1 and the three distribution modes), `docs/IMPLEMENTATION-STATUS.md`, `README.md`, `app/miditest/README.md`

- [ ] **Step 1:** After D2 and separate workflow review, prepare web build validation for `node tools/build-miditest.mjs --web`. Hosting, Pages artifact publication and changes to the existing Miditest repository remain pending explicit authorization; do not deploy in this task.
- [ ] **Step 2:** Run `node tools/build-miditest.mjs --web`, serve `dist/miditest-web`, and run `npm --prefix app/miditest run test:browser` against it. Expected: PASS.
- [ ] **Step 3:** Update the docs. They must say that hardware validation of MIDItest-on-Tauri is pending owner beta testing.
- [ ] **Step 4:** Commit `docs: MIDItest distribution modes and web build`.

## Not in this plan (follow-ups)

- Merging DeckChek's `app/midi-tests.js` analysis with MIDItest's `midi-core.js`/`midi-tests.js` (overlapping fader, encoder and timing stats). Do it after owner beta testing, as its own plan.
- License sales, payment and key-issuing tool (decision D3).
- macOS/Linux standalone MIDItest builds (owner instruction needed). On those systems the Tauri webview has no Web MIDI, so the `midir` bridge from Task 2 is required.
- Archiving the Miditest repo (after D2).
