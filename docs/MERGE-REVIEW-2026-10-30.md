# Merge review and approved continuation

> Historical pre-merge snapshot. For completed merges, later validation, current blockers and the execution prompt, read [the post-consolidation review](POST-CONSOLIDATION-2026-10-30.md).

The owner approved the reviewed merge order. No branch was deleted or reset.

## PR15 completed

Reviewed source `551757fad1ce4fa8318e996531e644de22927b19` against main
`9f74fc2ee7952378bf17698bb6d648a8a2fbbb86`. Existing Linux Rust, Windows Rust,
JavaScript and browser jobs passed; Sonar passed. Draft was marked ready and
merged with the expected head SHA guard, ordinary merge preserving its branch.
GitHub and remote refs confirm main merge `f3fbf1cc0ba2047e6e1929f3c6622f55a76865f1`.
Existing main workflows may build/test; releases remain tag-gated and Pages manual.
No tag, deployment or manual workflow dispatch was requested.

The main documentation was then merged locally into continuation at
`33ca5f5db791c31c78de1f56be64b16a99ce2c7c`. README/TODO conflicts retain incoming
screenshots/guide and current M7/M8 details. README version matches 0.1.0; fleet
remains off pending qualification. Relative to repair source below, only Markdown
and the three synthetic-audio screenshots changed.

## PR16 CI repair

Previous CI at `569bd6f1bc293343cc8f0d7895d211ea9bfa4d1c` actually compiled and
executed native tests: 651 passed, two failed, eight ignored. This supersedes the
older handoff's lack of remote execution evidence; local development packages
remain unavailable. Both failures came from legacy pre-photo snapshots without
`photo`: `failed_restores_leave_the_live_database_byte_identical` and
`restore_upgrades_the_v004_fixture_and_takes_a_safety_backup`.
The full browser suite passed 1263/1264; one assertion still expected fleet on.

Repair source: `dd7ae20fd2c82479dd88b5a1c6390120ac57b17e`.

- Permit absent photo objects only before migration 0013. Existing malformed
  photo objects and missing objects in current schemas remain SQL errors.
- New regression includes SQLite's case-insensitive object resolution; independent
  review caught and corrected a case-sensitive discovery check.
- Crosslink smoke checks fleet absent by default, present after explicit opt-in,
  and absent again when disabled, retaining stylus/wear-map link assertions.
- Focused browser: `node tools/ui-smoke.mjs crosslinks`, 53/53 passed, with
  `NODE_PATH=/opt/codex/cua_node/lib/node_modules` and
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`.
- Diff/syntax checks passed; changed-diff credential scan found no matches.
- Actual CI: https://github.com/djshellshoxxx/deckchek/actions/runs/41032654999
  Native job 123985858248 passed: 654 tests passed, zero failed, eight ignored;
  the compiler-warning check also passed. Both formerly failing legacy restore
  tests and the new case-insensitive photo-schema regression passed. JavaScript
  job passed: 1204 tests passed, zero failed, one optional skip (1205 total),
  plus the performance-budget check. Full browser job 123985858632 passed
  1266/1266 checks. All three CI jobs finished successfully.

## Remaining integration gates

- PR14 `9f4928a00a44b62529429d1f14ad104b65db28c6`: ordinary Rust/JS/browser tests
  pass; Sonar check 123949755970 fails reliability and security ratings. Its
  GitHub summary reports 50 annotations. The connector can read the check summary,
  but rejected its annotations endpoint as unsupported (HTTP400 INVALID_ARGUMENT);
  the Sonar issue/API pages were inaccessible to the web tool. No rule was disabled
  or finding marked accepted. Detailed findings still need authorized retrieval
  and triage before main integration. Claude's stylus UI lane remains untouched.
- PR12 changes are already represented in the continuation: its two non-ancestor
  follow-ups are patch-equivalent. PR13 is an actual ancestor. Preserve branches;
  consolidate through the reviewed code stack rather than duplicate their work.
- PR9 remains distinct, with conflicts in `tests/device-library.test.mjs` and
  `tools/smoke/core.mjs`; retain FS34/35/36 and all existing assertions when
  reconciling after the code gates pass. Its hardware evidence remains simulated.
- PR10 wiki material remains distinct but reports stale test failures and retired
  workflow names; refresh after the selected baseline is stable.
- PR17 is a proposal, not implementation approval for licensing or deployment.
  It reserves 0019 although the current stack already has migrations 0019–0022,
  and uses integer session IDs although the schema uses TEXT. Its licensed/free
  distribution choices, private signing-key issuance and Electron retirement
  require the already-listed owner decisions; no default was silently accepted.
- Older catalog/audio branches contain distinct history and are preserved.

Native CI is software evidence on its runner only. It does not qualify hardware,
actual audio drivers, loopback accuracy, all platforms or 32-bit builds. Existing
path-authorization and signing-provenance exclusions remain unchanged.


## Additional handoff review

The owner explicitly approved PR16's previously denied description update; the
single retry succeeded and GitHub confirmed the new body. No merge of PR16 or
PR14 occurred. Checkpoint `6fb85e21a19fca06467969b9af4bc3ffd1120998` also passed all
three jobs in CI 41033986019. The new continuation prompt is the execution entry
point; CHECKPOINT now states current evidence without contradictory native-status
claims. Historical NOTES migration reservations are explicitly marked obsolete.

All 13 live branch refs were rechecked. PR11 is confirmed merged with squash
commit `9f74fc2ee7952378bf17698bb6d648a8a2fbbb86`; nonmatching commit/patch history
on the old audio branch must not be mistaken for 26 missing features. The old
catalog branch differs by an unsupported DDJ-S8 profile and older device/dispatch
behavior; inspect content before reusing anything, not just its 94 unique commits.
The old MIDI checkpoint has three equivalent code patches and two historical
handoff commits; retain its original 846/186 results as historical evidence.

GitHub reported PR10/12/17 nonmergeable on this refresh, while local merge-tree
against exact main `f3fbf1c` succeeded for each. Treat this discrepancy as unresolved
remote metadata, not permission to merge. PR14 locally conflicts in README/TODO;
PR9 conflicts in device-library tests/core smoke. Continuation already carries the
reviewed main-documentation resolution. Recheck current refs/checks before acting.
