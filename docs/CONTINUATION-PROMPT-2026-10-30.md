# DeckChek continuation prompt — after consolidation, 2026-10-30

Copy the block below into the continuing coordinator. It is a dated snapshot:
verify actual refs, checks and ownership before acting.

---

Continue `djshellshoxxx/deckchek`. Finish reviewed branch consolidation, then
implement the highest-priority accepted correctness/diagnostic work. Do the work,
not just another plan. Preserve all distinct history, current tests, thresholds,
migrations and manual/simulated/measured evidence labels.

## Start from the right state

1. Read applicable AGENTS.md/.agents instructions and the cloud runtime skill.
   Inspect existing environment readiness, worktrees, dirty files, live branches,
   PR checks/comments and ownership without exposing credentials. The original
   integrator was `/workspace/deckchek-current`, with `/workspace/deckchek` and
   `/workspace/deckchek-toolchain` preserved historically. They were unavailable
   in the last session, and no environment-status tool was exposed. Do not create
   a replacement environment or retry denied package/API operations to bypass that.
2. Read CHECKPOINT.md, `docs/POST-CONSOLIDATION-2026-10-30.md`, SPEC_STATUS.md,
   AUDIT.md and the actual feature specs/source. Older handoffs preserve evidence;
   stale TODOs and PR bodies are not proof that implemented features are missing.
3. Integration branch: `continuation-deckchek-core-20261028` (PR16 targeting PR14).
   Latest source baseline: `6bd93e2d1ceb2ff878521de58188cb39d5833c36`, followed by this documentation
   handoff. Main: `ee5aa511fb49fc56e299d5b5c262e815ab420d0d` at the review snapshot. Fetch actual refs.
   Keep one integrator and one writer per module; use bounded workers and stronger
   independent review for concurrency/security. The last explicit owner of the
   stylus-hours UI race was external Claude; current ownership remains unresolved,
   so do not touch that lane until coordinated.

## Already consolidated; do not redo

- PR19 ported/refreshed PR10's wiki into continuation at `d76e618`, retaining the
  current README, screenshots and fleet default OFF. Original PR10 is preserved;
  its wiki is not yet on main until the code stack lands.
- PR21 ported the pure FS36 engine/tests at `569ed0e`, repairing strict raw MIDI
  validation, large Active Sensing streams, audible GM timing, invalid answer
  handling and manual provenance. PR22 then fixed one-to-one controller pairing, single-message sensing gaps
  with valid timing, and all-channel sustain/panic cleanup at `6bd93e2`;
  the pure module now has 21 tests.
  FS36 remains PARTIAL: UI/profile/dispatch and hardware qualification are absent.
- PR18 corrected PR17's MIDItest proposal; PR17 is merged into main as
  `2c4d898d594465c8bd8cf596107711f39d0241e2`; PR23 clarified the actual port,
  SysEx, scheduling and capture-diagnostics contracts at `ee5aa511`.
  Both are documentation only, incorporated into continuation with this handoff. Licensing/issuer architecture,
  hosting, native file authorization and Electron retirement remain conditional.
  Use provisional NNNN migrations; do not reuse 0019–0022 from the code stack,
  assume integer session IDs or implement a destructive downgrade.
- PR12's two non-ancestor follow-ups are patch-equivalent in continuation;
  PR13 and `claude/epic-thompson-tvwx9n` (`3440a63`) are actual ancestors.
  Do not merge/reimplement these independently. PR11 was squash-merged; old MIDI
  checkpoint source is represented by equivalent patches. Preserve all history.
- FS20/21/22/23/31/32/33, Compare entry points, venue CRUD/photo consumers, DPAPI,
  scratch capture-busy handling and input-pair selectors already exist. Keep the
  completed MIDI lifecycle/evidence, imported-result, restore/photo and managed
  tuner cancellation repairs.

## Execute in order, continuing independent work around blockers

1. **Triage the broad Sonar failures.** PR14 `9f4928a` check 123949755970 reports
   D reliability/security and 50 annotations. PR16 check 124031174223 at `6bd93e2`
   still reports C reliability; the earlier check at `569ed0e` had four annotations. Refresh these on the live head.
   Detailed findings were unavailable through supported access. Obtain a newly
   supported connection or an authorized finding export; do not retry the known
   unsupported `/check-runs/.../annotations` endpoint, bypass access restrictions,
   disable rules, or accept findings just to turn green. Fix confirmed issues with
   regressions and independent review.
2. **Merge the reviewed code stack only after its gates/ownership pass:** PR16
   into PR14, then PR14 into main. The user explicitly authorized this conditional
   sequence and suitable reviewed repairs. A green child delta does not waive
   PR14's broader gate. Preserve continuation's README/TODO conflict resolution
   and fleet OFF. Reconcile the proposal/docs now on main without discarding them.
   Refresh source/target SHAs, inspect workflow side effects, use expected-head
   guards and ordinary merges, verify actual remote commits. No approval review
   submission, force push/reset, branch deletion, tag, release or deployment.
3. **Consolidate remaining PR9 selectively**, from original `a4d844b`, onto the
   current integration baseline. Reuse the corrected FS36 engine; do not copy its
   old version back. FS34: `app/devices/test-plan.js`, narrow library/dispatch/UI
   additions, coverage checker/tests and `docs/specs/34-device-test-completeness.md`.
   FS35: `app/audio-quality.js`, `app/devices/audio-session.js`, audio-runner and
   `docs/specs/35-audio-quality-test.md`. The old workflow has duplicate `run:`
   keys: add a separate coverage step to the current workflow, retaining all gates.
4. **Fix integration ownership before merging these panels.** Capture connection
   and output per MIDI operation, guard every await, pass connection to result
   completion, and never let old cleanup affect replacement ports. In audio,
   early capture rejection/disposal must prevent delayed playback/render/save;
   cancel only owned playback and clean up handles. Preserve all current port
   claim/release, generation, late LED, neutral/unexercised, device-library FK/
   native/FUZZ-06 and browser assertions; add regressions rather than replace tests.
   Resolve FS36 documented pairing threshold/identity severity/burst metric
   mismatches explicitly without silently changing existing thresholds.
5. **Next correctness slices**, after ownership checks: investigate FS31 negative
   SNR residual (AUDIT R2-02, monitor.js). Reproduce falling/negative SNR alongside
   idle/cue/scratch counterexamples; retain 12 dB floor, hysteresis and cooldowns.
   Review bundled SQLite AUD04 using current primary advisory/dependency sources;
   preserve hostile-schema rejection, trusted_schema OFF, defensive mode, upgrade
   fixtures, byte-identical failed restores and photo consistency. Reproduce the
   broader stream-pump/late-driver-open cancellation/join issues separately from
   completed managed-tuner cancellation.
6. **Then scoped UX/documentation:** dedicated saved-latency screen history is an
   enhancement (runs already save), not a missing FS11 acceptance requirement.
   Service part/labour correction UI should use existing amends_id semantics:
   FS22 requires append-only history, not destructive deletion. FS12 guided stylus
   benchmark remains absent but shares an externally owned lane. Refresh stale
   implementation/QA/checklist counts from source without reopening completed work.

## Validation, boundaries and finish criteria

The exact PR21 head `3ea13bdd1025247f546cffffe6c56914ad5f6c20` passed CI run
41041300727: 1,218 JS passed/one optional skip, 654 Rust passed/eight ignored,
1,266 browser checks, zero failures; Sonar child check 124014925013 passed.
Its merge `569ed0e` has identical tree `002cc9f420a72f3827f6e38524fcad6fafb29508`.
Exact source `84b687c8b0b5102420b2d3d82ced9aebcea05664` passed [CI 41044618304](https://github.com/djshellshoxxx/deckchek/actions/runs/41044618304): **1,225 JavaScript passed**, one optional skip; **654 Linux Rust passed**, eight ignored; **1,266/1,266 browser checks**, no console errors; zero failures. Performance and compiler-warning gates passed. Sonar child check 124026196929 passed. All 21 FS36 module tests passed. Merge `6bd93e2d1ceb2ff878521de58188cb39d5833c36` has the identical tested tree `f78f93eac7aef92103c1bb56af847f16c99e47e1`; these results do not clear the broad PR14/16 Sonar holds.
Do not use older 1,204/846 counts as current results or call pending CI passed.
These are software CI results, not physical-device or all-platform qualification.

Use existing `npm test`, focused/full `node tools/ui-smoke.mjs <suites>` and
`cargo test --locked --manifest-path src-tauri/Cargo.toml -j 4` where the existing
environment supports them. Historical browser variables were
`NODE_PATH=/opt/codex/cua_node/lib/node_modules` and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`; verify paths first.
The prior native environment lacked GLib/WebKitGTK/ALSA development files and
package writes were denied. Existing PR CI is the proven native route. Bounded
remote connector edits with temporary staging, independent review and exact-head
PR CI were used without creating a replacement environment. Shared-module local
ownership remains unresolved until the original environment/worker is checked.
Reuse test results only for proven identical source and name the exact tested
head/tree; record pending jobs as pending. Check late review findings before exit.

Main `f3fbf1c` had a macOS ARM packaging setup failure in taiki-e/install-action
(job 123985120862, missing cached cargo-binstall). It did not reach application
compilation. Continuation already replaces those actions; check its matrix before
duplicating a workflow repair. Successful builds do not establish installation,
actual-driver/audio, architecture or hardware acceptance.

PR17's later Windows job 124018903070 failed in `processes::tests::live_tasklist_parses`
in its final `top_cpu_blocking(5)` PowerShell call at the unchanged 20-second
scan timeout (424 passed, one failed, five ignored).
The source-identical main merge `2c4d898` passed Windows job 124022733311.
Keep this intermittent live-host test issue visible and investigate reproducibility;
do not lengthen the timeout, drop the assertion or label the failure fixed from
one passing rerun. A retry request while the original workflow was running was
rejected for that state; do not repeat it without evidence the state changed.

Fleet stays OFF pending real-database/H23 qualification. H00–H33 hardware,
FS11 WASAPI, FS31 shared-capture/endurance, FS32 real VirtualDJ,
real phones/MIDI/vendor maps and exact platform install/launch/uninstall remain
separate gates. Do not infer Linux x86 runtime acceptance from packaging success.
FS21 privacy export needs software/data/manual end-to-end qualification rather
than inherently physical hardware. Verify FS33's existing offline-guide AC6
separately from the published-help/manual Pages leak check, which needs separately
authorized deployment.

Native picker/file-path authorization, URL confirmation, restored signing-key
provenance, AUD10 command/window ACLs, notifications, signing/updater and MIDItest
commercial/hosting choices remain scoped decisions. R4-21 is a low-severity
disputed ledger-display consistency review item: a bounded correctness fix may
proceed if it preserves trust semantics. FS20 v1 PDF plus sidecar is supported;
embedded certificate JSON is optional phase 2, not a missing v1 gate. No custom cryptography,
credentials/security-setting changes, purchases, unsafe hardware writes or provider
spend. Later vendor DVS/ML/venue-isolation/CDJ backlog is not automatically the
next release scope.

Before publication inspect the outgoing diff for credentials/private material,
conflict markers and broken references. Keep concise progress updates. Finish with
clean reviewed commits, exact refs/merge outcomes, actual checks, named blocked or
unexecuted gates, a refreshed checkpoint and the next concrete implementation slice.
