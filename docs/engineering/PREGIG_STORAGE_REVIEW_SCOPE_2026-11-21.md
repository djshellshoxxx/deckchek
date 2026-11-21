# Round 16 — Pre-gig storage and save recovery review scope

All three round-fifteen backup recovery workers are FINAL. Their original reports,
the functional report-only correction, 193/193 FIRST result and independent root
proofs are consolidated at `b71a81a849c0bad9f24b4ba7ea40366e86769501`, with completed
Service round fourteen already in its ancestry. This fresh successor trio reviews
Pre-gig #87 after that completed cohort. Read the implementation note beside this
scope and the completed backup/Service handoffs.

Root owns implementation, integration, CI and publication. Each lane owns only its
named report; functional additionally owns a new evidence directory if separately
authorized. No worker changes production source, tests, dependencies or other
lanes' files. Findings return to root. Preserve the frozen candidate and all
original evidence; any correction is a distinct later candidate.

## Changed source and relevant consumers

- `app/pre-gig.js`: browser persistence, strict collection reads, acknowledged
  writes, unchanged native adapter and existing domain/native contracts.
- `app/ui/workflows/pregig.js`: completed-result save state, retained result and
  coalesced save retry, previous History lookup and replacement guards.
- `app/ui/screens/pregig.js`: persistent unknown-state feedback, actual Save,
  Retry, preset draft/import retention, discard decisions, future-version view,
  read request ownership and disposal.
- Read all changed tests, `tests/contracts/pregig.json`, the actual DOM/text-file
  fixtures and relevant shell/DOM/live/state/library/report consumers. Inspect
  native `src-tauri/src/pregig.rs` as source for compatibility; do not execute it.

## Proposed functional selection — not execution authorization

Read each complete original file and independently derive every ordered case:

1. `tests/pre-gig.test.mjs`
2. `tests/pregig-storage-screen.test.mjs`
3. `tests/pregig-storage.test.mjs`
4. `tests/pregig-ui.test.mjs`
5. `tests/text-file-boundary.test.mjs`

The source-derived estimate is 128 cases, including 45 additions. Match the 83
older names against retained original TAP and derive the wall-time proposal from
that evidence. Do not extract implementations, invent a passing harness, replace
production modules or weaken assertions to obtain a pass.

All lanes begin with static source review and independent Git/byte/JSON data
inspection. Only the current functional lane may later execute a separately
root-reviewed exact bounded FIRST launcher, after all three preliminary source
dispositions and full control/configuration/runtime review. Preserve original
stdout, stderr, outcomes and complete before/after source identity. A failure or
timeout is an immutable result, not permission for a rerun. No project command
is authorized by this file. Code and security remain source/retained-data only;
root executes no project code.

## Handoff and preserved holds

Verify the assigned full freeze, tree, ordered parents, every immutable blob and
working byte/mode, complete inventories and clean worktree. Report concrete
findings with source evidence, severity and a bounded correction. Separate
authored coverage, synthetic/DOM seam evidence and real platform qualification.
After a separately authorized FIRST, independently inspect the complete original
result and retained manifest bindings before FINAL. Seal only owned additions
with the assigned freeze as sole parent and report exact commit/tree/parent and
file byte/hash/blob identities. All three FINALs precede another fresh trio.

Qualified main `e36ddc41806b0f6639474f207e3b339e063a6e25`, durable Player
`f262a715d5cc9618285f4fe2d89b8dde2fc0fe9b`, all earlier published heads, original
audio failures and default-off Fleet remain fixed. No new diagnostic collector,
audio rerun, browser/native launch, scanner, probe, exploit or vulnerability
reproduction, release, deployment, permission expansion, history rewrite or
separately billed model job is authorized. Native #85 and Population Compare
#88 remain outside this review. Credit balance is unobservable; ordinary errors
are not evidence of exhausted credits.
