# MIDItest Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Proposal status:** Not approved for implementation of licensing, hosting, private-key issuance, security-policy changes or Electron retirement. Corrected against DeckChek continuation `722c7fdaadedfb2fd4906a6bd12ecaf9438d66b6` on 2026-10-30; recheck the integration baseline and active ownership before implementation. This document does not authorize releases or deployments. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Bridge-contract review:** Task 2 was rechecked against DeckChek `2c4d898d594465c8bd8cf596107711f39d0241e2` and MIDItest consumer source `65554626e853c4a04ab46089e632225babd82128`. This records source inspection, not an approved import revision or an implemented adapter; Task 1 must still record and verify the chosen import SHA. All approval and preservation constraints below remain in force.

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
- Preserve the complete CSP of the accepted implementation baseline. Continuation `722c7fd` includes `script-src 'self'` and `frame-ancestors 'none'`; its smoke server applies the latter to the child document, preventing embedding even at the same origin. Main `f3fbf1c` lacks the latter directive. Inspect and test the actual parent/child desktop and smoke policies before choosing a host design; do not infer behavior from another branch or weaken safeguards. Native file-selection authorization and URL-confirmation policy remain separate scoped decisions.
- No Python, PowerShell, or JUCE in the build. `winscan.ps1` is a runtime resource only (Windows scan feature).

## Review Focus

1. **Device unplugged mid-capture (desktop):** the shim must report the port as `disconnected` through `onstatechange` and keep captured events; test in Task 2.
2. **Same port opened by DeckChek and standalone MIDItest at once:** when the Windows backend reports the port busy, the user sees "Port is in use by another program", not a crash. Verify the backend error mapping rather than assuming every driver rejects a second open; test in Task 2.
3. **Message bursts over the 4096-message queue (`QUEUE_CAPACITY` in `midi.rs`):** capture-window deltas from the shared transport drop counter reach MIDItest's Link health result as capture-integrity findings. Historical drops, resets and other consumers' traffic must not become a selected-device fault; test in Task 2.
4. **Missing, corrupt, tampered or expired license file:** app starts, MIDItest shows the locked screen, DeckChek works normally; test in Task 3.
5. **Large SysEx dumps:** `Ignore::None` enables reception but does not establish callback framing or a 64 KB single-callback guarantee. Qualify the selected backend and test complete delivery of a 65,536-byte `F0…F7` message; if it fragments callbacks, review bounded per-input reassembly before claiming support. A fake-bridge whole-message test alone is insufficient; test in Task 2.

---

### Task 1: Import MIDItest into `app/miditest/`

**Files:**
- Create: `app/miditest/**` (via `git subtree add --prefix=app/miditest https://github.com/djshellshoxxx/miditest <RECORDED_MIDITEST_IMPORT_SHA>`, full history, no squash; substitute Step 1's recorded exact SHA, never a floating branch)
- Inspect after import: `app/miditest/skills/`, `app/miditest/shared/` and its dependency manifests. Remove only proven duplicates after preserving distinct content and resolving import paths; retain the lockfile unless a reviewed dependency-layout change requires otherwise.
- Modify: `package.json` `scripts.test` → `node --test tests/*.test.mjs && npm --prefix app/miditest test`
- Preserve: `app/miditest/package.json` Electron dependencies, `main`, `build`, `start`, `dist:win` and `desktop/` until D4 and replacement validation.
- Modify: `.github/workflows/test.yml` on the selected baseline so imported MIDItest tests run in CI. On continuation, retain direct Node invocation and JUnit output and explicitly add nested tests; changing the root npm script alone does not affect that invocation. On main, extend the existing `npm test` path while preserving its checks and reporting.

- [ ] **Step 1:** Pin the source repository and exact import SHA before running the non-squashed subtree import. Verify that source SHA is an ancestor of the resulting import commit and that the imported subtree matches the source tree before cleanup. A path-filtered log count does not prove full-history preservation because the historical source paths were unprefixed.
- [ ] **Step 2:** Review imported folders and dependency resolution. Preserve distinct content and Electron packaging; remove only verified duplicates.
- [ ] **Step 3:** Run `npm test`. Expected: DeckChek's suite and all MIDItest test files present at the pinned import pass; enumerate them instead of assuming a historical count.
- [ ] **Step 4:** Wire imported MIDItest tests into the selected baseline's CI: on continuation, retain DeckChek's direct Node invocation, JUnit output and all existing checks while explicitly adding the nested tests; on main, extend the existing `npm test` path and preserve its checks and reporting. The syntax loop already walks `app/` recursively; verify it discovers the imported modules without adding duplicate traversal. Demonstrate that a failing imported test fails CI on that baseline.
- [ ] **Step 5:** Commit `chore: import MIDItest into app/miditest with history`.

### Task 2: Consumer-compatible MIDI shim over the DeckChek bridge

**Files:**
- Create: `app/miditest/lib/midi-access.js`
- Modify: `app/miditest/app-v2.js` (access/availability calls, port binding, capture/reset diagnostics and test-result wiring; reviewed consumer lines 41–61, 141, 154 and 217)
- Inspect and adapt where required by the accepted contract: `app/miditest/features.js` (SysEx send errors, scheduled clock output and secondary-input ownership)
- Modify: `app/miditest/midi-tests.js` and its tests (capture-integrity findings alongside Link health, preserving existing evidence thresholds and report version)
- Modify: `app/midi.js` (owned `onPortsChanged(cb)` polling `listPorts()` every 2000 ms while listeners exist; reuse existing `status()` for `{dropped, emitted}`, not a duplicate `stats()` API)
- Modify only as required by the reviewed contract: `src-tauri/src/midi.rs` (verified busy-error mapping, ambiguity rejection at native lookup, and backend framing support if qualification proves necessary; no implicit adoption of a new native identity or scheduling architecture)
- Test: `app/miditest/tests/midi-access.test.mjs`, affected MIDItest consumer/analysis tests and `src-tauri/src/midi.rs` unit tests

**Source limits and acceptance prerequisite:** The current bridge lists `{index, name}`, opens/sends by name and the native backend chooses the first matching name; a shim-generated ID alone cannot make duplicate names safely addressable. The backend forwards callback bytes without explicit frame assembly. Its drop/emitted counters belong to shared `MidiState`, and `closeAll()` does not reset them. Its send operation is immediate and asynchronous across IPC. Review the concrete adapter design and any necessary scoped bridge changes before implementation; these limits must not be represented as capabilities already delivered.

**Minimal consumer contract (not a claim of full Web MIDI parity):**
- `requestMidiAccess({ sysex: boolean }, bridge = defaultBridge) -> Promise<MIDIAccessLike>`. On desktop, `MIDIAccessLike` supplies `inputs: Map<id, InputLike>`, `outputs: Map<id, OutputLike>`, `onstatechange` and `sysexEnabled`. `availability() -> 'tauri' | 'webmidi' | 'none'` re-exports `backend()`. In a browser with Web MIDI and no Tauri, return the native `navigator.requestMIDIAccess` result unchanged; keep extra capture diagnostics separate from that native object.
- Each port supplies `id`, `name`, `type: 'input' | 'output'`, `state: 'connected' | 'disconnected'` and `connection: 'open' | 'closed' | 'pending'`. `manufacturer` is only an optional display fallback. Map keys equal the contained port's `id`; IDs distinguish directions and remain stable for an unchanged logical port when enumeration order changes. Preserve the corresponding object while it remains present so consumer selection and handler ownership survive polling. Enumeration indices are not durable identities, and name-derived IDs are not claims of physical-device identity.
- Until an independently reviewed backend identity mechanism exists, reject ambiguous same-direction names at the operation boundary, including native lookup. Do not silently collapse duplicates in a Map or open/send to the first match. Revalidate routing after hot-plug; an observed removal/reappearance invalidates the old ownership generation even if the logical name/ID returns. A stale handle must not regain access to a replacement port. Display ambiguity as an actionable unavailable-port error; do not silently change the user's target.
- `InputLike.onmidimessage` supports the consumer's existing assignment/clearing flow, opening and releasing only that consumer's owned input subscription. Dispatch `{ data: Uint8Array, timeStamp: timestampUs / 1000, currentTarget: inputPort }` to the correct input object. Preserve the documented native timestamp origin as well as the unit conversion; division alone does not establish the same clock origin as `performance.now()`. The reviewed consumer currently timestamps analysis on receipt, so do not silently replace that behavior or claim native event timestamps measure end-to-end latency.
- Dispatch `onstatechange({ port })` with the affected port, including its ID, type, state and connection. Update Maps and port fields before dispatch; removal retains the disconnected object in the event while removing it from the available Map. Reflect actual owned open/pending/closed transitions, propagate open failures to the consumer UI, preserve captured events, and cancel stale pending work on replacement/unmount. The consumer reads `e.port`, `p.type` and `p.connection`; an unshaped notification is insufficient.
- `sysexEnabled` describes the access object's effective requested capability. When false, suppress incoming SysEx for that access and synchronously reject outgoing SysEx before bridge dispatch, including a send containing both ordinary messages and SysEx. Preserve ordinary and realtime messages. Apply this per consumer without changing shared backend filtering or elevating an older access when a replacement requests SysEx. Validate message boundaries and existing packet rules; malformed fragments must not bypass the policy.
- `OutputLike.send(bytes, timestampMs?)` must account for the actual consumer: burst output in `app-v2.js` and clock output in `features.js` supply future timestamps in the `performance.now()` time domain. The current bridge/native send path has no such scheduling support. Require a separately reviewed, owned and cancellable scheduling/error-propagation design, with defined time origin and timing limits, before calling those tests compatible. Do not drop the timestamp or convert all stages into immediate bursts. Preserve immediate-send behavior when no future timestamp is supplied; validate synchronously where the consumer expects a throw, and surface later bridge failures instead of leaving rejected promises unobserved. No particular native scheduler is approved by this proposal.
- Qualify SysEx callback boundaries on the selected Windows backend. If callbacks can fragment a message, the accepted framing design must assemble complete `F0…F7` messages per input/ownership generation, preserve interleaved realtime messages, impose reviewed buffer limits and clear incomplete data on disconnect/disposal. Truncation, overflow or incomplete frames must be visible as capture-integrity limitations, never emitted as a falsely complete dump. Backend tests and hardware evidence must be distinguished from a shim test that injects an already complete message.
- Capture diagnostics use a fresh `status().dropped` baseline at capture/session start and user clear/reset, then freeze the final observation for the completed capture. A desktop `access.droppedCount` extension, if retained, means only the nonnegative delta for that capture, with an explicit known/unavailable/reset state; it must not expose the lifetime total as capture loss. A counter decrease, unavailable/invalid status or stale asynchronous response invalidates continuity: retain known observations, mark the gap unknown and establish a new baseline without declaring a clean capture. Do not reset shared native counters or close other consumers' ports. Because the counter covers all native inputs, label positive deltas as shared transport loss during the window, not proof of loss from the selected device. Do not use `emitted` as a renderer-delivery acknowledgement. Browser passthrough has no equivalent measured counter; report unavailable, not an invented zero.
- Wire those diagnostics through capture/reset and `buildTestResults` into the imported `midi-tests.js` Link health presentation/report. Existing `linkHealth(events)` does not currently accept drop data; adding a property to access alone is insufficient. Preserve existing device-evidence thresholds and report version, and distinguish shared capture-integrity findings from device diagnoses.

- [ ] **Step 1: Write failing tests** with a fake bridge (`listPorts`, `open`, `close`, `send`, `onMessage`, `onPortsChanged`, `status`) and focused native/consumer tests:
  - Map keys match stable port IDs across reorder; identical input/output names remain distinct; duplicate same-direction names fail closed before opening/sending, including the native lookup path.
  - Handler assignment/clearing opens/releases only the owned subscription; event `currentTarget`, `Uint8Array` data and timestamp unit conversion are correct for two inputs.
  - Unplug/reconnect and connection changes deliver `{port}` with correct `id/type/state/connection`, update Maps before the consumer's handler runs, retain captured events and prevent old generations from acting on replacement ports (Review Focus 1).
  - A verified backend busy error maps to `port-busy` and the user-facing message "Port is in use by another program"; unrelated errors remain distinguishable (Review Focus 2).
  - Historical drops at capture start produce zero new loss; later increases produce the capture delta and a shared-transport finding; clear/reset starts a new baseline. Counter rollback, unavailable status, out-of-order replies, another consumer's traffic and unsupported browser statistics cannot become a false selected-device fault or clean result (Review Focus 3).
  - SysEx-disabled access filters receives and rejects sends before dispatch, including mixed-message sends; normal/realtime traffic still passes, and enabling a replacement does not elevate the old access.
  - Whole and fragmented 65,536-byte SysEx preserve content and boundaries under the qualified backend contract; cover multiple inputs, interleaved realtime, truncation, limits and disconnect cleanup. Record Windows backend/hardware qualification separately; a fake complete callback does not prove it (Review Focus 5).
  - Fake-clock scheduled burst/clock sends preserve requested stage order/timing and immediate sends remain immediate; cancellation, port replacement and unmount prevent later sends, and asynchronous open/send failures reach the consumer without unhandled rejections.
  - Exercise the actual port-selection/state handler, SysEx controls, secondary input and capture-to-Link-health/report wiring; preserve native browser passthrough and existing analysis thresholds.
- [ ] **Step 2:** `node --test app/miditest/tests/midi-access.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3:** After reviewing the concrete compatibility design, implement only the accepted shim and minimal bridge/consumer changes. Preserve current strict packet checks, timestamp units, connection ownership and cleanup; a disposed or replaced consumer must not send, save a result or close its successor's port. Add deterministic regressions for replacement during open/send and disposal during pending work. Add verified busy-error mapping and native ambiguity/framing tests as applicable; unresolved backend support remains an explicit acceptance blocker, not a silent fallback.
- [ ] **Step 4:** Run the shim and affected consumer/analysis test files plus `cargo test --locked --manifest-path src-tauri/Cargo.toml midi`. Expected: PASS. Record which backend behaviors are covered by deterministic tests and which still require Windows hardware qualification.
- [ ] **Step 5:** Replace every direct `navigator.requestMIDIAccess`/availability use in `app-v2.js` (reviewed lines 55, 56, 217), wire the contract-dependent capture and feature consumers, and run `npm test`. Expected: PASS. Re-enumerate call sites at Task 1's chosen import SHA; reviewed line numbers are not a substitute for that inventory.
- [ ] **Step 6:** Commit `feat(miditest): run on the DeckChek MIDI bridge` only after the accepted implementation and its required checks pass.

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
- Proposed host: a lifecycle-aware mount/unmount interface in the existing document, with scoped styles and an explicitly supplied bridge, so resource ownership and cleanup are explicit. The iframe alternative needs verification against the chosen baseline's child-document policy: continuation's smoke responses forbid embedding via `frame-ancestors 'none'`, while reviewed main does not carry that directive. Do not assert an iframe is blocked on every branch. Review a concrete host design before implementation; a CSP change requires a separate scoped decision. Unmount must cancel owned timers/listeners and release only owned MIDI resources.
- If D1 approves licensed access, proposed locked state: title "MIDItest add-on", text "Unlock MIDItest with a license file.", buttons **Install license file…** (`license_install` through the dialog plugin) and **Learn more** (allowlisted link through `app/external-links.js`).

- [ ] **Step 1: Write failing smoke checks** in `tools/smoke/miditest.mjs` (automatically discovered by `tools/ui-smoke.mjs`): `workspace mounts and Monitor renders under the unchanged CSP`, `unmount releases only owned resources`, `no horizontal scroll at phone width` (use `setViewport()` from `tools/smoke/core.mjs`). Add free/licensed-state checks only for the policy actually approved in D1.
- [ ] **Step 2:** Run `node tools/ui-smoke.mjs`. Expected: the new checks FAIL.
- [ ] **Step 3:** Implement the screen, rail entry, flag and host-mode tweaks.
- [ ] **Step 4:** Run `node tools/ui-smoke.mjs` and `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit a description of the approved workspace and access policy.

### Task 5: Attach MIDItest reports to DeckChek controller results

**Files:**
- Create: `database/migrations/NNNN_external_report.sql`, `tests/external-report.test.mjs`
- Modify: `src-tauri/src/lib.rs` (register both IPC commands), `src-tauri/src/db.rs` (commands `external_report_attach`, `external_report_list`), `app/ui/screens/devices.js` (button "Attach MIDItest report…" on controller results), `app/miditest/app-v2.js` (in host mode, Report tab button "Send to DeckChek")

**Numbering prerequisite:** `NNNN` is a placeholder, not a literal migration name or reservation. Reconcile the selected implementation baseline and accepted pending branches immediately before implementation, then allocate the next free four-digit number consistently in the SQL filename, tests and documentation. The reviewed continuation occupies 0019 monitor, 0020 mapper, 0021 ledger and 0022 population extension; main's older highest number 0018 is not permission to collide with that pending work. At the reviewed continuation, 0023 was the next candidate only. Never renumber or overwrite existing migrations. `src-tauri/build.rs` discovers migrations automatically.

**Interfaces:**
- Table `external_report(id INTEGER PRIMARY KEY, session_id TEXT NOT NULL REFERENCES session(id), source_app TEXT NOT NULL, source_version TEXT NOT NULL, report_version INTEGER NOT NULL, payload_json TEXT NOT NULL, imported_at TEXT NOT NULL)`.
- `external_report_attach(session_id: String, payload: String) -> i64`. Keep session IDs as strings throughout JS and IPC. The JS side runs `validateReport` from `app/miditest/midi-core.js`; the native command independently validates report version, shape, size and the referenced session before persistence. Reject invalid input without echoing its contents.
- Shown in Devices and History labeled "External evidence: MIDItest <version>, browser/desktop", never merged into DeckChek's own measurements (SPEC-11 §5).

**Migration preservation and recovery gates:** Before implementing, identify session/report readers and writers, the current migration transaction/marker mechanism and the existing exclusive backup/restore path. Add the report table without rewriting existing session IDs, sessions or native measurements. Capture fixture snapshots and prove that upgrade preserves existing rows, foreign keys and measurements, that applying migrations twice is safe, and that injected failures leave no partial report table, report rows or applied-migration marker. Verify ordinary sessions with and without report attachments.

Enable report writes only after a successful schema check. Test missing-table behavior and compatibility with the actual supported app versions; do not assume an old binary can open a newer schema. Do not run old and new writers concurrently without a separately verified compatibility design. A failed migration must roll back its transaction. After a committed migration, use a reviewed forward repair or the existing exclusive restore flow with a verified pre-change backup; preserve any subsequent writes and report payloads before recovery. Do not introduce ad hoc `DROP TABLE` downgrades, edit migration history or discard later data. Exercise recovery and retry on fixtures and retain the existing failed-restore byte-identical and photo-consistency guarantees.

- [ ] **Step 1: Write failing tests:** JS `rejects report with wrong version`, `keeps source app and version`; Rust `attach_and_list_roundtrip` with a nonnumeric session ID, `missing_session_is_rejected`, invalid/oversized native payload rejection, `migration_NNNN_upgrades_v0.0.7_fixture`, existing-data preservation, migration retry/idempotence, injected partial-failure rollback, missing-table behavior and supported-version recovery (existing fixture `tests/fixtures/db/v0.0.7.sql`; resolve `NNNN` as above).
- [ ] **Step 2:** Run `npm test` and `cargo test --locked --manifest-path src-tauri/Cargo.toml`. Expected: FAIL.
- [ ] **Step 3:** Implement the migration, commands and UI; run `node tools/check-migrations.mjs`.
- [ ] **Step 4:** Run all tests and `node tools/ui-smoke.mjs`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: attach MIDItest reports as external evidence`.

### Task 6: Standalone MIDItest desktop app (Windows beta first; D1/D4 dependencies)

**Files:**
- Create: `src-tauri/tauri.miditest.conf.json`, `tools/build-miditest.mjs`, `src-tauri/src/winscan.rs`, `tests/build-miditest.test.mjs`
- Modify: `src-tauri/src/lib.rs` (register `midi_windows_scan`), a separately reviewed Windows x64 artifact-only CI job (see workflow scope below), `.gitignore` (`dist/`)
- Preserve: `app/miditest/desktop/` and Electron dependencies/packaging until D4 explicitly approves retirement and replacement behavior is verified.

**Workflow scope:** Determine actual workflow ownership from the selected live baseline before editing CI. On reviewed main `f3fbf1c`, retain the `windows-rust-tests` job in `test.yml` and the existing `windows-build.yml` DeckChek build/upload, including its main/manual triggers and `deckchek-windows-x64-latest` artifact. Do not replace these with a MIDItest-only build or claim checks moved to an absent `nightly.yml`. On reviewed continuation `722c7fd`, `windows-build.yml` is already retired: `test.yml` handles Linux JS/Rust/browser checks, the existing `nightly.yml` handles Windows Rust/sanitizer/fuzz/stress checks, and the cross-platform workflow provides Windows bundles with tag-only publication. Preserve whichever verified jobs, triggers, gates and artifact paths the chosen baseline actually owns; an accepted workflow migration must demonstrate equivalent coverage before removing anything. Scope the MIDItest Windows x64 artifact-only job alongside that behavior. Do not dispatch the full-platform matrix, create tags or publish/deploy to satisfy this proposal.

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
