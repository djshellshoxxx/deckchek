# DeckChek continuation and review — 2026-10-28

## Source and ownership

This continuation uses PR14 source `9f4928a00a44b62529429d1f14ad104b65db28c6`,
not the older MIDI checkpoint `7d44aae2f56db8316c61c0f6cf1adaf75dcad988`.
The new branch is `continuation-deckchek-core-20261028`; its separate worktree
preserves the saved checkpoint, all original branches, and distinct PR work.
There were no AGENTS.md instructions in the inspected workspaces. Relevant
specifications, NOTES, SPEC_STATUS, AUDIT, workflows and live PR14 comments were
read before edits. No prior missing checkpoint was assumed recovered.

At reconciliation, PR14 was 217 commits ahead / 5 behind the MIDI checkpoint and
224 ahead / 1 behind PR9. PR14 includes PR12/13's M7/M8 work, despite its stale PR
body. PR9 (`a4d844b22df478a141c06a6561c941d6461a8aea`) FS-34/35/36 and PR10 docs
remain separate. Main remained `9f74fc2ee7952378bf17698bb6d648a8a2fbbb86`.
The external Claude worker explicitly owns the stylus-hours UI race; no stylus
source or smoke file was changed here. Each implementation module had one writer.

Selective local integration was recorded before execution: source MIDI fix
`9f97546c203329a1b53550fce295529fd845a4f9` onto target PR14 `9f4928a`. Its two
files were unchanged from that fix's parent, so it was cherry-picked as `2f1c497`.
Old checkpoint documentation was not merged into the newer implementation ledger.
No main/PR14/PR9 merge was attempted. Reviewed source is proposed through a draft
PR stacked on PR14; missing native evidence and open security findings prohibit
a readiness or release claim.

## Completed work

- **FS-21 / R1-14:** real Results/History measurement rows expose Compare and C
  for an actual attributed unit and a registered, available numeric metric.
  Native history retains explicit identity; the Devices link follows the selected
  unit. Missing/unsupported evidence cannot silently select another unit.
  Existing inspector click/Enter remains intact. Initial flag-off hides these
  links; live disabling blocks navigation, but an already-rendered button remains
  visible until rerender. This is a known presentation limitation.
- **FS-23 qualification:** fleet defaults off and remains wired for manual opt-in.
  Explicit true/false settings are preserved. The implementation ledger, feature
  matrix, plan and hardware walkthrough now agree. The intended eventual default
  in the spec was not treated as proof that H-23/real-database checks passed.
- **MIDI packet and evidence boundaries:** recovered strict packet validation;
  empty/neutral jog input and unexercised buttons cannot become healthy PASS
  results. Incomplete button coverage is reported as unknown, while existing
  measured failure criteria still apply. Pending open/dispose/port replacement
  cannot resurrect an old runner or close its successor's same-name port.
  Independent review additionally reproduced a stale LED answer saving PASS
  against a replacement port. LED continuations now retain their connection and
  output, recheck after awaits, and cannot submit results or advance after disposal.
- **MIDI scale boundary:** full fader/timing arrays no longer become function
  arguments, avoiding reproduced argument-limit crashes. No samples or thresholds
  were discarded. Long-running arrays still consume memory; no new arbitrary
  retention cap was introduced.
- **Mobile microphone lifecycle:** Stop, navigation, errors, replacement and late
  permission/worklet responses release the owning session's resources. Cleanup
  cannot stop a newer session. Tests use injected streams/contexts, not hardware.
- **Stationary vibration:** zero RMS is retained without inventing a dominant
  frequency or throwing on null. The absent peak is omitted from exported numeric
  measurements and explicitly absent in the display. Mobile precache regenerated.

## Actual validation

Tested source commit: `210cb48d858992e93facf54b46e9a069799d89c8`. Subsequent
handoff changes are documentation only. Independent follow-up reran the LED
reproducer: no stale completion, replacement UI mutation or late LED-on; B
completes only after its own answer, and old A cleanup stays on A. Its 18/18
lifecycle tests passed; no new concrete concern was found in that limited review.

Commands run from the continuation worktree:

- Final `npm test` after all fixes, including the independently found LED race:
  **1,199 passed, 1 optional Mixxx-corpus skip, 0 failed** (1,200 tests, exit 0).
  Focused final MIDI regressions: **32/32 passed**.
- `npm test` after initial Compare implementation: 1,159 passed, 1 skipped,
  0 failed. The skip is the optional external Mixxx corpus (`MIXXX_CONTROLLERS_DIR`
  unset), not an acceptance waiver. Later audit fixes require the final run below.
- `node --test tests/features.test.mjs tests/fleet*.test.mjs tests/midi-tests.test.mjs`:
  46 passed before later audit fixes.
- `NODE_PATH=/opt/codex/cua_node/lib/node_modules PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tools/ui-smoke.mjs compare`:
  73/73 passed, including real History/Devices attribution and keyboard routing.
- Same browser command with `fleet`: 93/93 passed, including real UI opt-in,
  explicit false, existing fleet workflows and one-page booth-sheet PDF.
- Same command with `core`: 186/186 passed after correcting its expected default
  navigation count from 13 to 12. The first run was 185/186 solely because it
  expected Fleet on by default; no assertion was removed to hide a failure.
- Same command with `core mobile-pwa`: **232/232 passed**, including offline
  mobile navigation and phone-sized layouts, before the final LED continuation
  guard. The final core rerun after that MIDI change passed **186/186**, exit 0,
  with no console errors.
- New microphone lifecycle tests: 20 passed; focused lifecycle/DSP/export group
  41/41 at that point. Stationary vibration and large MIDI-array regressions each
  reproduced the old crash before the fix. New MIDI runner regressions reproduced
  zero-input PASS and post-dispose opens before the fix.
- `node tools/check-migrations.mjs --contiguous`: 22 migrations OK.
- Device-index, timecode-facts and mobile vendor/precache checks passed.
- Independent correctness tests: 108 frontend tests passed. Independent security
  boundary/privacy tests: 148 passed. These do not establish absence of defects.
- Python SQLite 3.53.1 applied the actual 22 migrations/seed and upgraded four
  committed database fixtures: integrity OK, no foreign-key violations. This is
  supplemental SQL evidence, not bundled SQLite/Rust execution.
- `cargo --version`: command not found. Third-party-notices verification also
  cannot run because its `cargo metadata` spawn returns ENOENT. No installation,
  alternate environment, approval bypass or native test execution occurred.

Logs are local ephemeral `/tmp/deckchek-*-20261028.log`,
`/tmp/deckchek-compare-worker.log`, `/tmp/deckchek-compare-node.log`,
`/tmp/deckchek-midi-runner-node.log`, and `/tmp/deckchek-security-tests.log`.
No raw private research packs, hardware recordings or runtime databases are
included in the proposed source change.

## Correctness audit

Independent read-only reviewers inventoried frontend/mobile and native/tooling
subsystems, then traced high-risk measurement, lifecycle and persistence paths.
Frontend inventory covered 155 non-vendor files (about 37,010 lines), with deeper
inspection in capture/MIDI/results/history/Compare and shallower interface review
in some feature engines. Native review covered DB gates/migrations, catalog,
backup/photo, capture/latency/MIDI, monitor, service, wear-map/usage storage,
packs/ledger, startup and workflows. This is a targeted whole-codebase audit, not
an exhaustive line-by-line or professional independent certification.

The five reproduced frontend audit findings and the additional independent LED
review finding are addressed above. Four native findings were initially **source-confirmed and runtime-unverified**.
The table below preserves the original evidence; the remediation addendum records
the subsequent source fixes and unexecuted native tests:

| Finding | Severity | Evidence and required next test |
| --- | --- | --- |
| Same-length corrupt photo survives restore | Medium | `src-tauri/src/backup.rs:1123` trusts existing byte length; `photo.rs:441` rejects its hash. Restore a good archive over same-length damaged bytes and require repair/warning. |
| Latency tuner lease released before its streams close | Medium | `latency.rs:767` uses External lease; `capture.rs:1562` releases it on preemption, while tuner closes at `latency.rs:1149`. Exercise delayed driver opening and preemption before stimulus at `latency.rs:1081`. |
| Capture can start during restore's safety backup | Medium | `backup.rs:1070` checks idle before safety backup/swap; `capture.rs:1307` acquires a separate mutex. Verify mutual exclusion with a controlled concurrent-start test. |
| Snapshot may retain photo rows while concurrent unlink removes bytes | Medium | Snapshot photo reading at `backup.rs:881`, unlink at `photo.rs:417`, skip at `backup.rs:591`, empty restore list at `backup.rs:1109`. Existing skip-and-succeed test at `backup.rs:2782` is intentional; the additional issue is snapshot consistency and undisclosed partial restore. Preserve its assertions while deciding an explicit warning/consistency contract. |

## Separate security review

The Security and Hardening skill's trust-boundary method was applied read-only:
hostile imported files/OS metadata and a compromised WebView are the relevant
inputs; user files, diagnostic integrity, privacy and signing identity are assets.
No credentials were read, no external exploit traffic was sent, and no security
controls/configuration were changed. Three findings were initially held under the broad no-security-changes restriction.
The owner subsequently authorized ordinary source remediation, excluding actual
authorization and signing-provenance policy changes. The table records the
original findings; see the remediation addendum for current disposition:

| Finding | Severity | Evidence and limits |
| --- | --- | --- |
| Workspace-to-results stored markup injection | Medium | `app/export.js` retains unrestricted run IDs and uncertainty objects; `app/ui/results.js` interpolates `run.id` and `uncertainty.k` into HTML. Actual import/render in local Chromium produced injected inert buttons. Harmless marker handlers executed without CSP; the exact desktop CSP blocked both handlers, though markup remained. Browser XSS is demonstrated only for deployment without CSP; no desktop CSP bypass/native RCE is demonstrated. Fix boundary: identifier/uncertainty validation and contextual escaping, retaining CSP. |
| Certificate extraction can read unrelated JSON under compromised-WebView threat model | Medium | `src-tauri/src/certificate.rs:922/723` returns raw readable JSON from a page-supplied path, without certificate-shape or picker authorization. Caller-supplied confirmation at `links.rs:233/161` also provides a potential external-URL channel. Source analysis only; no real credential reads, native IPC reproduction or exfiltration performed. |
| Restored public-key registry can spoof local signing affiliation | Low | `signing.rs:415` defines locality by restorable `signing_key` rows; `certificate.rs:916` uses it. Safe fixture/in-memory checks support the source trace. This spoofs “issued by this install,” not Ed25519 validity or a victim's signature. Native restore/IPC reproduction remains outstanding. |

Known residuals remain distinct: AUD-10 application-command window scoping;
AUD-04 schema fingerprint omits CHECK bodies (a harmless tiny CHECK reproduced
equal fingerprints); monitor negative-SNR cueing behavior; ledger Verify/display
facts mismatch. AUD-08's old PDF-popup note is stale: current `pdf.rs:358` applies
`guard_new_windows`. No current vulnerability-advisory lookup was performed, so
this review makes no CVE assertion about dependency versions.

Other inspected security surfaces include pack allowlists/limits, mapper XML and
script-as-text boundaries, strict certificate parsing, ledger privacy/HTML/CSP,
CSV formula neutralization, diagnostics redaction, archive limits/checksums,
photo hash paths/metadata, userfile extension/path policies, parameterized SQL,
key storage, capability/CSP and workflow permissions. Absence of additional
verified findings is not an assurance of no vulnerabilities. Native IPC/path semantics,
Windows DPAPI/ACLs, decoder internals, dependency advisories and third-party QR
internals remain unvalidated.

## Publication and recovery

Inspected workflow triggers: this new branch push does not select main/tag builds;
the draft PR selects ordinary test checks only. Pages is manual and separately
gated. No deployment, release, tag, CI dispatch, approval review, force push,
branch deletion/reset, purchase, paid-Claude call or credential change is used.
Diff review and heuristic scan of all 31 outgoing files completed with zero
unresolved findings. One inherited non-routable hardware-script URL example was
reviewed as placeholder text, not a usable credential. Remote branch SHA must
be checked after push.

Publication outcome: the source checkpoint at
`96c38babd0e536c9e247364a8524e8720e779772` was pushed successfully and its remote
SHA verified; main and PR14 were unchanged. The subsequent connector attempt to
create a draft PR from `continuation-deckchek-core-20261028` into
`claude/confident-goldberg-o06vg2` was **denied by automatic approval review**.
The stated reason was the earlier prohibition on public PR creation; the later
instruction to open drafts was not accepted as overriding it. No PR was created,
and no retry, gh fallback, or indirect creation was attempted. Explicit approval
resolving this specific publication conflict is required before retrying. This
status-only note does not change the tested source; the final publishing response
records the updated documentation SHA.

Recover by fetching `origin/continuation-deckchek-core-20261028` and creating a
new worktree/branch from its verified SHA. Do not reset existing branches or
reuse an occupied worktree path. Recheck PR14 and external ownership before
further integration. Next work: resolve the scoped authorization/provenance decisions below,
provide an approved native test toolchain, execute the new native regressions, then review
PR9's distinct FS-34/35/36 work without losing current assertions. Hardware and
driver/loopback/platform/32-bit acceptance remain owner gates; fleet stays off.


## Authorized remediation addendum

Source commit: `72ff3d4daded10b204fbacfa76d8c0889a43e532` (software-tested; native-unqualified).
Baseline before this batch: `e2abb7c71a2f88cc6325a7ba2dd2230cc6f13d00`.

The owner clarified that escaping, defensive content validation and deterministic
native correctness fixes are authorized. This supersedes the earlier blanket
hold on those source fixes. Changes remain isolated from Claude's stylus-hours
UI, PR9 hardware tests and PR10 documentation, with one writer for shared
backup/photo/capture ownership and independent lock-order review.

- `app/export.js`, `app/ui/results.js`: escape imported IDs at HTML attributes and
  normalize uncertainty at import and rendering. Retain finite nonnegative
  magnitudes and finite positive coverage factors; do not invent missing values.
  Real import/render browser regressions cover older stored records and hostile
  markup without relying on CSP. Baseline failed 4/5 unit checks and 8/11 browser
  checks; corrected source passes. The desktop CSP is unchanged.
- `src-tauri/src/certificate.rs`: both JSON and HTML extraction require a bounded,
  strictly parsed v1 envelope. Unrelated JSON is rejected without echoing fields.
  Original certificate text and normal unsigned/tampered/expired verification
  diagnostics are retained. Four Rust regression tests are added, not executed.
- `src-tauri/src/backup.rs`, `photo.rs`, `service.rs`: protect photo bytes from
  before the DB snapshot through archive copy. Attach and post-commit unlink
  share a file gate; order is DB gate, then photo gate, then SQLite operations.
  Restore checks actual existing photo hashes, repairing equal-length damage.
  Missing/damaged photos still allow successful backup, now with warnings;
  restore warns even when no photo files were archived. Manual backup UI displays
  warning text safely. Pre-restore safety-backup warning propagation is not added.
- `src-tauri/src/capture.rs`, `latency.rs`: reserve restore activity atomically
  against all capture lease kinds without holding the activity mutex while
  waiting for DB access. Managed tuner cancellation keeps its lease until owner
  cleanup; IPC cannot release that managed lease. Late cancelled output callbacks
  emit silence; cancelled input opening cannot start the stimulus/load. Added
  10 deterministic reservation, driver-open/close and snapshot/unlink regressions
  remain unexecuted. Existing general stream-pump join/late-open-timeout behavior
  is outside this fix; do not claim all capture lifecycle issues are resolved.

Independent source reviews found no blocker in the rendering/certificate lane
or native lock-order design. Native compilation, rustfmt and execution have NOT
been verified: `cargo test --manifest-path src-tauri/Cargo.toml certificate::tests`
failed with exit 127, `cargo: command not found`. No download retry, installation
or alternate environment was used. These changes must stay unmerged until the
relevant native validation and integration gates pass.

Available validation on this remediation source:

- `npm test`: 1,205 total; 1,204 passed, one optional corpus skip, zero failed.
- `node --test tests/workspace-render-boundary.test.mjs`: 5/5 passed.
- Browser `backup`: 21/21, including warning visibility and literal markup text.
- Browser `workspace-boundary compare`: 82/82 in the rendering worker's run.
- Final integrated browser `core workspace-boundary compare`: 266/266, zero
  console errors (`/tmp/deckchek-remediation-browser.log`).
- `git diff --check` passed; all 17 changed/new files passed a heuristic
  credential/private-artifact scan with zero flagged paths. This is not an
  exhaustive secret-detection assurance.
- Browser runs use `NODE_PATH=/opt/codex/cua_node/lib/node_modules` and
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` with
  `node tools/ui-smoke.mjs <suite names>`; all are simulated/software evidence.
- Logs: `/tmp/deckchek-remediation-node.log`,
  `/tmp/deckchek-remediation-backup-browser.log`, and
  `/tmp/deckchek-workspace-{red-unit,red-browser,green-unit-final,green-browser}.log`.

Remaining scoped security decisions:

1. Certificate shape validation is not path authorization. A compromised WebView
   can still supply a readable certificate-shaped file path. A narrow future
   design could require a native picker-issued, single-use file grant. That
   changes native authorization and needs explicit scoped approval. Caller-owned
   external-URL confirmation remains unchanged; native confirmation is a separate
   policy decision. No credential file was read or exfiltration attempted.
2. Restored `signing_key` rows can still cause misleading local-install affiliation.
   No signature forgery is implied. Separating machine-local provenance from the
   restored registry, or explicitly labeling restored registration without claiming
   locality, requires an owner decision. Do not discard real current/retired keys
   or silently change historical trust semantics.

Draft PR creation remains specifically denied and was not retried. Only an
ordinary fast-forward source checkpoint push is intended; no main/PR14 merge,
workflow dispatch, release or deployment. Recover from the exact remote SHA in
the publishing response, recheck external ownership, then run Cargo tests for
`backup::tests`, `capture::tests`, `latency::tests`, `photo::tests`, `service::tests`
and `certificate::tests` plus normal build/native gates in an approved environment.
No physical-device, driver, hardware loopback or platform acceptance is claimed.


## Native validation follow-up

Validation targeted checkpoint `ddb1444f1505c3592ae5f70cbf2224f05cbdd674`
(source `72ff3d4daded10b204fbacfa76d8c0889a43e532`). No source changes.
This supersedes the earlier current-state claim that Cargo is unavailable;
earlier command-not-found results remain historical evidence.

- No prior Rust installation denial was found. Official `https://sh.rustup.rs`
  setup succeeded with the minimal stable toolchain in
  `/workspace/deckchek-toolchain/{cargo,rustup}`, without shell-profile edits.
  Actual versions: rustc 1.99.1, Cargo 1.99.1. Log:
  `/tmp/deckchek-rustup-setup.log`.
- Ran `cargo test --locked --manifest-path src-tauri/Cargo.toml -j 4` with
  `CARGO_HOME=/workspace/deckchek-toolchain/cargo`,
  `RUSTUP_HOME=/workspace/deckchek-toolchain/rustup`, and its cargo/bin prepended
  to PATH. Dependencies downloaded and compilation began. Exit 101 at
  `glib-sys v0.18.1`: pkg-config could not find `glib-2.0 >= 2.70` / `glib-2.0.pc`.
  DeckChek compilation and native tests did not execute. Log:
  `/tmp/deckchek-native-test.log`.
- WebKitGTK 4.1 and ALSA development pkg-config entries are also absent. Attempted
  `apt-get update` through the available escalation mechanism, using configured
  package sources. Exit 100: permission denied reading an apt configuration file
  and acquiring `/var/lib/apt/lists/partial`. This was an OS/filesystem failure,
  not an automatic approval-review rejection. No alternate package route,
  privilege workaround, source rewrite or environment replacement was attempted.
- Existing `.github/workflows/test.yml` has workflow_dispatch and a nonpublishing
  Ubuntu Rust job with the native prerequisites and full locked tests. `gh api`
  repository inspection and `gh run list` for this branch returned `Forbidden`.
  No workflow was dispatched, no API route was retried, and no workflow or PR was
  created/changed to bypass access. Existing CI results for this exact SHA remain
  unknown. Draft PR denial is unchanged and distinct from this API access failure.
- With Cargo available, `node tools/third-party-notices.mjs --check` now passed
  (exit 0); `/tmp/deckchek-native-notices.log`. Lockfile and notice source unchanged.

Next prerequisite is a permitted installation of the repository's standard Linux
native development packages in this same executor, or restored authorized access
to its existing nonpublishing CI. This is an actual package-write/API-access
limitation, not a request for extra owner permission merely to install Rust.
Do not retry these denied operations without materially relevant new authority
or environment/access evidence. Native and hardware qualification remain pending.
