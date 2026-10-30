# DeckChek consolidation and development prompt

Copy the prompt below into the continuing coordinator. This is a dated recovery
snapshot: verify live refs, ownership and checks before acting.

---

Continue `djshellshoxxx/deckchek` in the existing saved environment. Consolidate
reviewed work without losing distinct changes, then continue core diagnostic
features and correctness fixes from actual specs. Do the work, not just planning.

## Start and source of truth

1. Read applicable `AGENTS.md` / `.agents` instructions and the cloud-environment
   runtime skill. Inspect runtime/network readiness without exposing credentials.
   Do not replace this environment to bypass a failure.
2. Inspect worktrees, dirty files, live branches, open PRs, checks, comments and
   external ownership. The integrator worktree was `/workspace/deckchek-current`;
   the earlier `/workspace/deckchek` worktree and its historical checkpoints remain
   preserved. Use a new named worktree if the intended one is occupied or dirty.
3. Read `CHECKPOINT.md`, `docs/MERGE-REVIEW-2026-10-30.md`, and
   `docs/CONTINUATION-2026-10-28.md`; then `SPEC_STATUS.md`, `NOTES.md`, `AUDIT.md`, relevant
   `docs/specs/NN-*.md` feature-spec acceptance criteria and actual source. Older dated notes are
   history, not current authority. Do not redo FS20/21/22/23/31/32/33 from PR14's
   stale body: those features are implemented, with named remaining gates.

Known good integration baseline: PR16 branch
`continuation-deckchek-core-20261028`, checkpoint
`6fb85e21a19fca06467969b9af4bc3ffd1120998`, plus subsequent documentation-only
handoff commits if present. It contains PR14 and the latest main docs merge.
Do not assume a newer timestamp means a branch contains every useful change.

## Verified evidence and changes

Source repair `dd7ae20fd2c82479dd88b5a1c6390120ac57b17e` passed CI run
41032654999: JavaScript 1204 passed / one optional skip / zero failed; Linux Rust
654 passed / eight ignored / zero failed, with compiler-warning gate passed;
full browser smoke 1266/1266. All three jobs also passed at checkpoint `6fb85e2`
in run 41033986019. Later changes between those heads were Markdown/screenshots
only. These are software tests, not physical hardware or all-platform acceptance.

Completed work includes real Compare entry points; strict MIDI packet validation
and lifecycle/evidence fixes; large-array handling; mobile microphone cleanup;
zero-vibration handling; imported-result HTML escaping and uncertainty validation;
certificate envelope-shape checks; restore/capture mutual exclusion; snapshot/photo
consistency, hash-based repair and omission warnings; managed latency cancellation.
The latest repair handles missing photo tables only in pre-0013 snapshots, retaining
SQL errors for damaged modern schemas, and tests fleet links before/after opt-in.
Preserve all assertions, measurement thresholds, migration guarantees and tests.

## Branch reconciliation ledger

- `main`: `f3fbf1cc0ba2047e6e1929f3c6622f55a76865f1`. PR15 merged with owner
  approval. Its source `claude/docs-screenshots` remains preserved. Continuation
  merge `33ca5f5db791c31c78de1f56be64b16a99ce2c7c` resolved README/TODO conflicts,
  kept screenshots and M7/M8 details, and corrected fleet default-off/version.
- PR14 `claude/confident-goldberg-o06vg2`:
  `9f4928a00a44b62529429d1f14ad104b65db28c6`. Ordinary tests pass; Sonar security
  and reliability gates fail. It has README/TODO conflicts against updated main;
  those are already resolved in the continuation. Do not merge PR14 alone and
  accidentally restore fleet default ON.
- PR16 remains draft, targets PR14's branch, and has its description updated with
  explicit owner approval. Do not confuse this with an approval review or a merge.
- PR12 `task/deckchek-spec-completion`:
  `2a8e528f0d6e669ba57ab892a9aae0b0eeee6f24`. Two commits absent by ancestry are
  patch-equivalent in continuation. PR13 `task/deckchek-fleet`:
  `f0feebeb657e76bc758f8e5328573abe36f11670` is an actual ancestor. Consolidate
  these through the selected stack, not duplicate merges or reimplementation.
- PR9 `claude/amazing-fermat-csql4g`:
  `a4d844b22df478a141c06a6561c941d6461a8aea`. Distinct FS34/35/36 hardware-profile,
  audio-quality and General MIDI work. Conflicts include `tests/device-library.test.mjs`
  and `tools/smoke/core.mjs`. Keep useful tests and assertions from both sides;
  simulated audio/GM checks are not actual hardware measurements.
- PR10 `docs/readme-and-wiki`: `4cfa38cf127881f07a7ab9e408f2fb701c4ff984`.
  Preserve wiki content; refresh stale test counts/failures and retired workflow
  names against the selected baseline before integration.
- PR17 `claude/tender-johnson-w8l6nn`:
  `6414eaa1c95123de8b6fd774d31696b803c5968f`. MIDItest plan only. Fix migration
  numbering (0019–0022 already exist), session-ID type (TEXT, not integer), and
  stale workflow assumptions. Pricing/licensing, hosting, issuance and Electron
  retirement are unresolved decisions; do not silently accept proposed defaults.
- MIDI checkpoint `7d44aae2f56db8316c61c0f6cf1adaf75dcad988`: code changes are
  represented by equivalent patches; two distinct historical handoff commits remain.
  Preserve exact old 846 JavaScript / 186 browser-core results as historical evidence.
- `work/deckchek-audio-diagnostics-release` at
  `34b809f771e2fb4ce903d5608788779e124a1ed7` was squash-merged through PR11 into
  `9f74fc2ee7952378bf17698bb6d648a8a2fbbb86`. Different hashes/patch counts do not
  establish unmerged functionality. Compare trees and squash history before reuse.
- `feat/hardware-profile-catalog-20261020` at
  `46b86ebbbd34738f2e5d0db66d39517e3dcbe688` needs content-level reconciliation:
  wholesale restoration would reintroduce removed `pioneer-ddj-s8.json` and undo
  newer profile/dispatch work. Preserve history; do not blindly restore it.

GitHub mergeability flags and local merge-tree results disagreed for PR10/12/17
on the last check. Re-fetch exact refs and checks before any write; do not treat
one cached boolean as readiness or as proof of a conflict.

## Execute in this order

1. Reconfirm the above baseline and ownership. External Claude explicitly owned
   the stylus-hours UI race; leave that lane alone until ownership is resolved.
   Keep one integrator and one writer per module. Use the cheapest capable worker
   for a bounded task; use stronger independent review for concurrency/security.
2. Retrieve and triage PR14 Sonar findings through an authorized supported route.
   Check 123949755970 reports 50 annotations. The GitHub connector reads its summary
   but rejected `/check-runs/.../annotations` as unsupported (HTTP400); Sonar pages
   were inaccessible to the web tool. Do not repeat unsupported calls or bypass
   access restrictions. Use newly available supported access or an owner-supplied
   finding export. Never disable rules or mark findings accepted just to turn green.
3. Fix confirmed ordinary source bugs in disjoint unowned scopes with meaningful
   regression tests. Preserve the original failure thresholds and evidence labels.
   At blocked access/hardware decisions, continue independent allowed work.
4. Once relevant gates and ownership checks pass, consolidate PR16 into the reviewed
   PR14 stack, then main, preserving the existing documentation conflict resolution.
   The owner approved this conditional merge sequence, not arbitrary merges. Record
   source/target SHAs before each merge, use an expected-head guard, inspect workflow
   side effects, and verify the actual remote result. No force push/reset/deletion.
   A green PR16 delta alone does not waive PR14's broader Sonar gate.
5. Reconcile PR9 in isolation; port distinct functionality without regressing current
   MIDI/device workflows. Refresh PR10 and correct PR17's proposal separately.
   Only implement accepted, unstarted/unowned features after source reconciliation.
6. Continue core device/MIDI/audio diagnostics, correct results, spec/test traceability,
   data-loss/boundary fixes and reproducible fixtures before optional fleet expansion.
   Review important changes independently and finish with correctness/security audits.

## Validation and limits

Use existing checks: `npm test`; relevant `node tools/ui-smoke.mjs <suites>` with
`NODE_PATH=/opt/codex/cua_node/lib/node_modules` and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`; native
`cargo test --locked --manifest-path src-tauri/Cargo.toml -j 4` where available.
Full existing PR CI is the proven native route. Reuse results only for identical
source or document the exact unchanged tested tree; do not call pending CI passed.

Rust was installed officially in this executor at `/workspace/deckchek-toolchain`:
set `CARGO_HOME` to its `cargo`, `RUSTUP_HOME` to its `rustup`, and prepend cargo/bin
to PATH. Local native build stopped at missing GLib development files; WebKitGTK
and ALSA dev entries are also absent. `apt-get update` failed with filesystem
permission denial, even through escalation. No package workaround, credentials
change or replacement environment. GitHub CLI API requests previously returned
Forbidden; authorized connector reads and pushes have succeeded. These are distinct
routes/actions, not proof that all access is unavailable. No denied operation retry
without materially relevant new evidence. Dependency-notices check passed.

Fleet stays default OFF pending hardware/real-database qualification. Do not claim
physical-device, driver, hardware loopback, Windows/macOS/Linux or 32-bit acceptance
without execution evidence for that gate. Preserve simulated/manual vs measured
provenance for profiles, MIDI, DVS, audio quality, bitrate and driver diagnostics.

Ordinary escaping, shape validation and correctness fixes are authorized. Native
picker/file-path authorization, URL-confirmation policy, historical signing-key
trust/restore provenance and licensing/private-key issuance remain scoped decisions.
Certificate shape checks do not establish file authorization; restored-key locality
can still mislabel affiliation without forging signatures. Existing stream-pump
release/late-driver-open limitations remain tracked. No custom cryptography,
weakened safeguards, credentials/security-setting changes, purchases/provider spend,
unsafe hardware writes, deployments, tags or releases.

Keep concise progress updates, clean tested commits and a current handoff. Before
publication inspect outgoing diff and secret/private-data patterns; do not upload
private research packs. Report exact SHA, completed/remaining requirements, actual
checks and ignored/unexecuted gates, merge outcomes and next slice. For any blocker,
name the action, target, reason and whether denied, pending or uncertain.
