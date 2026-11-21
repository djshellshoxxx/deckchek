# History and Gear Ledger — fresh functional audit

Reviewer: `/root/inventory_functional_round5`. Date: 21 November 2026,
America/Los_Angeles. All three round-four workers completed before this fresh
trio began. This lane was the sole local project executor for round five.

## Disposition

The **first authorized focused gate passed: 130 tests / 130 pass / 0 fail /
0 skipped**, across the exact 16 files listed below. No test, product code,
assertion, threshold or skip was changed by this lane. The complete first TAP
and empty stderr are retained, and no rerun occurred. All **2,147 tracked
hashes**, the frozen HEAD/tree and clean source status were unchanged before
and after execution.

The separately authorized syntax check of the new hosted smoke module also
passed once. It parsed the module only; it did not launch a browser or execute
the smoke scenarios. These results establish a passing focused functional
selection for the exact candidate below. They do not replace its complete
source, hosted UI or platform gates, and do not establish a cause or repair for
the earlier numerical failures in issue #72.

## Frozen source and invocation

| Item | Recorded identity |
| --- | --- |
| Tested commit | `bdaf685b1ebc3889bf73474e5dc8c8e7f2d35df0` |
| Tested complete tree | `c897840779dcf999ccfde6815cf8cf82062fed59` |
| Implementation commit | `d05b63a` — History/Ledger incomplete-read changes |
| Comparison baseline | `19247c08633ce93d62d3f1e78acf3a4848754c51` — completed preceding successor |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-inventory-functional` |
| Branch | `review/deckchek-inventory-functional-20261121` |
| Runtime | Node v24.22.3, Linux x64; Python recorder v3.12.14 |
| Absolute Node executable | `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` |
| Started, UTC | `2026-11-21T08:59:14.133159+00:00` |
| Completed record, UTC | `2026-11-21T08:59:27.334422+00:00` |
| Child execution elapsed | `13.1300348019995` seconds |
| Execution budget | 120 seconds; TERM at 115, KILL by 120 if needed |
| Exit / timeout | 0 / false |

The invocation was the absolute Node executable followed by `--test`,
`--test-concurrency=1`, `--test-reporter=tap`, and the explicit sorted 16-file
selection. No shell wildcard selected additional files. The root-authored
[authorized selection](evidence/inventory-history-functional-2026-11-21/authorized-selection.json)
and the complete argv/runtime metadata in
[result.json](evidence/inventory-history-functional-2026-11-21/result.json)
are preserved.

`NODE_OPTIONS`, `DECKCHEK_AUDIO_CONTEXT_PATH` and every
`DECKCHEK_AUDIO_FIT_*` variable were required to be absent. The focused recorder
prefixed PATH with the same absolute Node directory for any existing test
subprocesses. It enabled no numerical collector or additional engine switch.
The recorded parent invocation does not claim to describe unobserved child
argument expansion. Version/component queries were metadata-only.

The recorder and raw directory were outside the checkout. The complete before
hash map, explicit test list, authorization bytes and running record were saved
before execution. Full stdout/stderr went directly to new files. After hashes,
HEAD/tree and clean status were captured before any report/evidence files were
added. Both recorders refuse to reuse their first-outcome files.

## Focused coverage

| Files | Behavior exercised |
| --- | --- |
| `tests/history-feed-boundary.test.mjs`, `tests/history-load-screen.test.mjs` | Confirmed empty lists versus malformed responses; valid rows survive invalid siblings; attributed omission counts; persistent incomplete notice and retry; loaded counts and filters; disabled-feature commands are not requested; flags are rechecked before publication; an older failed load cannot replace the newer successful view; diagnostic-list failure is not presented as confirmed empty. |
| `tests/ledger-enumeration-boundary.test.mjs`, `tests/ledger-load-screen.test.mjs` | Confirmed empty inventory; unavailable/non-array public-note, service-job, maintenance and certificate lists; catalog/photo containers; capped global service counts; unknown photo inventory blocks building; known item failures retain attributed partial problems; missing certificate contents are reported; initial error/retry; pending or failed reload blocks the export entry point; cache invalidation; both late-success and late-failure load ordering; vanished selections are pruned; a photo-list failure after preview produces no file write or export record. |
| `tests/crosslinks.test.mjs`, `tests/features.test.mjs` | Existing row mapping, source isolation, merged ordering/type counts, related links and feature-flag contracts. The crosslink expectation now includes the previously silent invalid latency row and non-array pre-gig response. |
| `tests/ledger-api-durability.test.mjs`, `tests/ledger-note-persistence-screen.test.mjs`, `tests/ledger-note-write-queue.test.mjs` | Existing persistence refusal, retained drafts, per-unit write ordering, restoration and export-history durability. |
| `tests/ledger-preset-boundary.test.mjs`, `tests/ledger-review-bridge.test.mjs`, `tests/ledger-review.test.mjs`, `tests/ledger-ui.test.mjs`, `tests/ledger-verified-facts.test.mjs`, `tests/ledger.test.mjs`, `tests/ledger-leak.test.mjs` | Existing privacy presets and redaction, known partial problems, per-unit service history, older-command compatibility, export/revision handling, certificate facts, artifact construction and private-field omission contracts. |

All 130 top-level TAP outcomes are sequential `ok` entries, with a matching
`1..130` plan and footer. The ordered case names are retained in
[observed-summary.json](evidence/inventory-history-functional-2026-11-21/observed-summary.json).
There were no failures, cancellations, skipped tests or TODO outcomes.

The real screen modules and their synchronous event handlers are exercised by
DOM fixtures with modeled readers. The `onExport` tests cover the entry point
used by the shell keyboard shortcut; they are not evidence of browser keyboard
layout, accessibility rendering, a native database or physical hardware.

## Separate smoke syntax check

The only additional project command was:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --check tools/smoke/inventory-history.mjs
```

It started at `2026-11-21T09:00:08.361098+00:00`, finished its child execution in
`0.06388362700090511` seconds and exited 0, with no timeout and empty stdout and
stderr. Its budget was 30 seconds, with TERM at 25 and KILL by 30 if required.
The 6,017-byte module's before/after SHA-256 was:

`f67f48ba8716d99a36534770ad5203bbd4f32435365f6662abfdbe89bb6fc41e`

All 2,147 tracked hashes remained unchanged through this second capture; HEAD,
tree and clean source status also matched. See
[smoke-syntax-result.json](evidence/inventory-history-functional-2026-11-21/smoke-syntax-result.json).
The authored smoke is intended for source-specific hosted execution and
screenshots. This lane made no local browser attempt, workaround, native launch
or hosted workflow mutation.

## Evidence integrity

The complete first TAP is **30,894 bytes**, SHA-256:

`fbbe75bc702bd34678a6590051982b79c1a8a72ca8b4625b1f7d2bbfe104d0fd`

The [manifest](evidence/inventory-history-functional-2026-11-21/manifest.json)
binds **19 evidence files**, with SHA-256:

`47f03c0cd7f2bc908e7dc3c38405766ce78c36febd8754734da89c6d6bc0866f`

Thirteen original raw artifacts and both recorder scripts were copied
byte-for-byte. The
[retention proof](evidence/inventory-history-functional-2026-11-21/retention-proof.json)
records all 15 original/copy identities, sizes and SHA-256 values. The retained
focused recorder's SHA-256 is
`4c87d974296a5e46dd2851e7b32b263b6cc6bcc21ab311297a149121d0207800`;
the syntax recorder's is
`2e498ebb217bed7955656018b21a58616f3ad005275410fb6d4f835e6aa8f01f`.

Read-only evidence verification checked every manifest entry, every original
copy, all 2,147 immutable Git blob digests against all three recorded maps,
source/tree identity, exact authorization/argv/test selection, full TAP plan and
counts, ordered case names, driver identities and syntax metadata. The
[changed-source comparison](evidence/inventory-history-functional-2026-11-21/changed-source-comparison.json)
also binds all 11 candidate-diff paths to the frozen source and preceding
baseline. The retained verifier reads data and Git objects only; it never
executes project modules or replays a test.

Both fresh static peers received the stable first-output paths and the final
manifest before handoff. Their independent observations belong to their own
reports; this lane does not substitute for either audit.

## Remaining boundaries and handoff

The result covers list-container checks and attribution of existing mapper
rejection. It does not establish comprehensive native row-schema validation.
Browser Ledger `readLocal` retains its existing read fallback, and the exact
older-backend unknown-command compatibility remains unchanged. Existing
export-history/revision display fallbacks are still present; the actual build
and export require their revision reads. Individual already-known read
failures continue to use the existing visible partial-result contract.

No product/test repair, numerical diagnostic, engine experiment, threshold
change, second focused run or full-suite run occurred in this lane. The
preceding **2,359-test** passing full gate belongs to `fb81960`; it is not
credited to this later candidate. Its source-specific full gate and applicable
hosted UI, performance, native/platform and physical qualifications remain
separate. Earlier failed numerical observations are preserved and issue #72
remains unresolved.

Only this report and its assigned evidence directory are added by this lane.
Root owns integration, source publication, any later gate authorization and the
rotation after all three current workers have completed.
