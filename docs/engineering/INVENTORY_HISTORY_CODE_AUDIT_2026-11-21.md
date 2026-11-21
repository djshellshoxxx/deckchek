# History and Gear Ledger — fresh code audit

Reviewer: `/root/inventory_code_round5`. Review date: 21 November 2026,
America/Los_Angeles. This fresh lane began after all three round-four successor
workers finished and their reports and first-output evidence were integrated.

## Disposition

**No material code blocker was identified in the bounded changes for issues
[#76](https://github.com/djshellshoxxx/deckchek/issues/76) and
[#77](https://github.com/djshellshoxxx/deckchek/issues/77).** The candidate makes
incomplete History explicit and stops Gear Ledger inventory failures from
silently becoming empty export content. Reload ownership, preview invalidation
and export guards address the associated stale-state paths.

I independently inspected the functional worker's first focused gate:
**16 test files; 130 total / 130 passed / 0 failed / 0 skipped**, exit 0.
All 2,147 tracked file hashes, the frozen HEAD, complete tree and clean source
state remained unchanged. The separately authorized smoke-module syntax check
also passed once. These are focused Node results; actual browser rendering,
native/platform behavior and broader source-specific gates remain separate.

This lane used static source/Git inspection, ordinary text and JSON/TAP reading,
and byte/hash comparison. It ran no project code, test, syntax check, browser,
native component, scanner, probe or numerical reproduction. Only this report
was authored. The prior full-suite success belongs to its earlier source, and
the earlier numerical failures in issue #72 remain unresolved.

## Exact source and scope

| Item | Identity |
| --- | --- |
| Frozen reviewed and tested source | `bdaf685b1ebc3889bf73474e5dc8c8e7f2d35df0` |
| Complete source tree | `c897840779dcf999ccfde6815cf8cf82062fed59` |
| Comparison baseline, completed previous successor | `19247c08633ce93d62d3f1e78acf3a4848754c51` |
| Comparison complete tree | `31b8a89757952c94ff6b45dac7d5177c1602b199` |
| Root implementation commit | `d05b63ad129e4378362411c57bcc87485c9d0e1b` |
| Review branch | `review/deckchek-inventory-code-20261121` |
| Sole local execution lane | `/root/inventory_functional_round5` |

The comparison contains exactly eleven changed files: four production modules,
four new test files, one existing-test assertion update, one auto-discovered
smoke module and the implementation note. I inspected every changed file and
the relevant unchanged consumers, native list signatures, DOM helper, privacy
and build boundaries, prior tests and modeled-native smoke handlers. The
[implementation note](INVENTORY_HISTORY_IMPLEMENTATION_2026-11-21.md) accurately
distinguishes the intended behavior from pending qualification.

| Changed production path | Reviewed responsibility | SHA-256 |
| --- | --- | --- |
| [history-feed.js](../../app/history-feed.js) | Attribute invalid list containers and mapper-declined rows while retaining valid neighbors | `81e3dfe74a9d21d7ac8a703b811cead95ab01268e53db1d1c491a3182bb03229` |
| [history.js](../../app/ui/screens/history.js) | Persistent notice, loaded counts, enabled-source requests and latest-load publication | `082b7f9d42c886b0889ccecbd1a2e91970f5114438ebfe09c42d897c18ac6889` |
| [api.js](../../app/ledger/api.js) | Required inventory reads, list-container guards and attributed known-item failures | `7ebd689f4efd7902de6324b29de6d0741fd11d620c412fc54c3e40911f64cb47` |
| [ledger.js](../../app/ui/screens/ledger.js) | Reload ownership, cache invalidation, unavailable-state guards and selection reconciliation | `f6df5ef5dbea80b54911da89ec6c6ba28c5745838514edc57629e2e56b2137e3` |

There is no delta under `src-tauri`, `database` or `.github`. Feature defaults,
native command registrations, permissions, privacy presets, field limits and
export-building rules are unchanged. Gear Ledger and Fleet remain default-off.

## History review

`loadFeatureRuns` retains source-level rejection isolation and the existing
limit and command arguments. A resolved non-array now produces a source error
instead of an apparently successful empty list. Each array element is mapped
independently; an existing mapper's null result or exception increments that
source's omission count without discarding successful neighbors. Valid rows
retain newest-first ordering. A confirmed empty array produces no error.

The omission error includes the feature type and count, without copying the
declined row, its identifier, notes or arbitrary mapper exception. This is
attribution of existing mapper rejection, not a complete native-row validator.
Diagnostic summaries separately receive a list-container check; their
individual record schema remains outside this correction.

The screen requests only enabled feature sources, then checks each feature's
visibility again before publication. A pending result therefore cannot
reintroduce a feature disabled during the read. Browser mode continues using
diagnostic history without issuing native feature commands.

Each load owns a generation. Diagnostic results and errors remain local until
feature reads finish, and the generation must still be current before shared
rows, warnings, toasts or focus handoff are published. An older failed read
cannot replace a newer successful result. Filtering and type controls continue
operating on published valid rows.

An incomplete view retains a visible source notice and Retry control. Counts
and type options describe loaded runs. With no loaded rows and an unavailable
source, the screen cannot display the confirmed-empty message. An unmatched
filter in a partial view describes only loaded rows. Successful retry clears
the notice and restores the ordinary view. Dynamic notice content uses the
existing text-node helper; these changes introduce no data-bearing HTML.

## Gear Ledger review

### Inventory reads and omission handling

The API requires array containers for catalog assets, products and makers,
public notes, service-job unit IDs, maintenance history, certificates and
photos. Rejected reads propagate instead of becoming empty collections. The
existing recognized unknown-command compatibility for service-job IDs remains
in its original path. Confirmed empty arrays still produce valid zero counts.

The global maintenance cap and per-unit fallback are unchanged. When the
global result reaches the cap, an unavailable or malformed per-unit count
blocks selection instead of reporting zero entries. The Rust list signatures
retain their vector result types; this lane did not run the bridge or database.

`loadState` repeats photo enumeration for selected units. Failure or a non-array
at this point aborts the build before saving. This matters because a folder
export may prune files omitted from its new inventory. An unknown inventory
must not become an empty one. The actual export builds again before saving,
so an earlier successful preview cannot bypass this read.

Known individual photo, certificate or unit service failures retain their
attributed partial-result behavior. A missing, empty or non-string certificate
`fileJson` now produces a certificate problem instead of silently disappearing.
Nonempty strings still reach unchanged build/parser validation. These problems
enter the existing visible Partial list. Privacy defaults and manual publishing
behavior remain unchanged.

### Reload and export state

A reload invalidates the cached result, result key and prior success/error
display. Submitted note writes still settle before new inventory is read.
Generation checks after that wait and after the reads protect both success
and failure publication. An old load cannot clear the current loading state,
replace current gear or publish its retired error.

Step transitions, preview/build entry, export entry, keyboard export and Escape
respect loading and load-error state. The existing persistent error and Try
again control remain authoritative even when an old gear object or selection
is retained for recovery. Handoffs likewise wait for usable current inventory.

Successful reloads remove selected IDs absent from the new rows. Whether to
restore the last export is determined before pruning; losing a selected unit
does not unexpectedly restore old selection/privacy choices. Failed reloads
do not perform that pruning. Explicit privacy settings, recoverable note
drafts, write ordering and service-job unit selection rules retain their
existing behavior.

The baseline review identified overlapping reloads, stale preview caching and
vanished selected IDs as adjacent risks. Root incorporated their corrections
before the source freeze. Corresponding screen regressions are present in the
focused passing selection.

## Regression and smoke coverage

The four new files exercise real API or screen functions with bounded injected
readers:

- [history-feed-boundary.test.mjs](../../tests/history-feed-boundary.test.mjs):
  all six sources distinguish confirmed empties from invalid containers;
  valid neighbors survive; omission details remain bounded; rejection,
  command arguments and enabled-source selection are preserved.
- [history-load-screen.test.mjs](../../tests/history-load-screen.test.mjs):
  persistent notices and Retry, partial count/filter wording, disabled and
  newly disabled sources, late-load ownership and diagnostic-list failure.
- [ledger-enumeration-boundary.test.mjs](../../tests/ledger-enumeration-boundary.test.mjs):
  zero inventories, rejected/malformed required reads, the capped maintenance
  fallback, later photo enumeration failure and attributed known-item problems.
- [ledger-load-screen.test.mjs](../../tests/ledger-load-screen.test.mjs):
  initial error/retry, pending or failed reload blocking cached previews,
  successful reload forcing a rebuild, both late-success/failure orderings,
  vanished selections and final photo failure causing no write or revision.

The existing crosslink test retains its ordering, invocation, argument and
filter checks. Its error expectation adds the previously silent malformed
latency row and pre-gig list to the rejected scratch source. No threshold or
skip was weakened. Existing Ledger durability, privacy/leak prevention, note
queue, preset, bridge, verified-fact and export tests remain in the selection.

The [inventory-history smoke module](../../tools/smoke/inventory-history.mjs)
is found by existing sorted `tools/smoke/*.mjs` discovery. Its eight checks
exercise app navigation and controls with modeled native readers: incomplete
History, surviving valid rows, filtering, successful retry, Ledger error/retry,
cached-preview export blocking and final enumeration failure with zero writes.
It requests two screenshots for persistent error states. Its SHA-256 is
`f67f48ba8716d99a36534770ad5203bbd4f32435365f6662abfdbe89bb6fc41e`.
The syntax pass does not establish rendered outcomes. DOM fixture assertions
also do not constitute a browser-rendering or native database result.

## Independent first-output evidence verification

The functional worker used absolute Node v24.22.3 with `--test`,
`--test-concurrency=1`, `--test-reporter=tap` and sixteen explicit sorted paths.
`NODE_OPTIONS` and audio diagnostic variables were absent. The test process
started at `2026-11-21T08:59:14.133159Z`, completed in
`13.1300348019995` seconds and exited 0 without timeout or stderr. Runtime
components and full argv are retained in the
[result](evidence/inventory-history-functional-2026-11-21/result.json).

I independently recomputed all candidate SHA-256 values and Git blob identities
against the immutable frozen tree, matched all 2,147 paths to complete before,
after-test and after-syntax maps, checked selection against the retained
authorization, and checked all 130 sequential TAP successes and footer. The
[complete first TAP](evidence/inventory-history-functional-2026-11-21/run.tap)
is 30,894 bytes with SHA-256
`fbbe75bc702bd34678a6590051982b79c1a8a72ca8b4625b1f7d2bbfe104d0fd`.
There are no failing, skipped, cancelled or TODO cases in this observation.

The separate authorized `--check tools/smoke/inventory-history.mjs` exited 0
in `0.06388362700090511` seconds with empty stdout/stderr. Its source digest,
tracked map, HEAD/tree and clean status agree with the same candidate; see
[syntax result](evidence/inventory-history-functional-2026-11-21/smoke-syntax-result.json).
This lane only read that result.

I read and checked both recorder digests. The test recorder contains one
bounded test process and refuses an existing first-output directory. The
syntax recorder contains one separately bounded syntax process and refuses
existing result/output files. Neither has a project rerun loop or diagnostic
collector. Node version/component queries are metadata queries, not additional
test selections.

I independently verified all **19 packaged manifest entries**, all **15 original
artifact/recorder copies byte-for-byte**, and all 130 derived observed-case
entries against TAP. The [manifest](evidence/inventory-history-functional-2026-11-21/manifest.json)
SHA-256 is `47f03c0cd7f2bc908e7dc3c38405766ce78c36febd8754734da89c6d6bc0866f`.
The package belongs to the functional lane and must be integrated with this
report. No retained verification script was executed in this code-review lane.
Its completed [functional audit](INVENTORY_HISTORY_FUNCTIONAL_AUDIT_2026-11-21.md)
and evidence are committed at `53d399879b2509f58e2d73d35566f8cb86a05272`,
tree `be3443d5dfdc47eac53e60c1e4937e0da57e57f9`, with the same frozen parent.

## Remaining boundaries and handoff

This audit covers the exact delta and recorded focused gate. It transfers no
earlier full-suite result to this candidate and claims no rendered browser,
native database, platform, performance or physical qualification. Applicable
source-specific gates remain root's integration responsibility.

Browser Ledger `readLocal` retains its previous read fallback. Export-history
and next-revision display fallbacks remain; actual build/export still requires
the revision read. These are outside the enumeration correction. List-container
guards do not establish complete native-row schema validation.

Ledger privacy/build modules and the feature registry are byte-identical to
the completed preceding successor. The audio analyzer, calibration solver and
both relevant audio test files are unchanged. No numerical run, cause or repair
was established for issue #72. There was no Fleet, release, deployment or remote
mutation. Source-diff whitespace inspection passed.

Root may integrate this report with the functional and defensive handoffs.
Publication or merge still needs the applicable checks for the published
source. The next fresh-worker rotation must wait until all three round-five
workers have completed.
