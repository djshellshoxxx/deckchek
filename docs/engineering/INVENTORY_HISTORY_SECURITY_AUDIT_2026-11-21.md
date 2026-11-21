# Inventory and History — fresh defensive source audit

Reviewer: `/root/inventory_security_round5`. Review date: 21 November 2026,
America/Los_Angeles. All three combined-successor round-four workers completed
before this fresh trio began. This file is the sole artifact owned by this lane.

## Disposition

**No new defensive source blocker was identified in the frozen Inventory and
History candidate.** Unknown Ledger inventories fail closed, existing known-item
read failures remain attributed, and the screens preserve current-load ownership
and make incomplete state visible.

The functional worker's first focused gate passed **130 of 130 tests across
16 files**, without failures or skips. Its separate, single syntax check passed.
I independently verified both retained outcomes and all **2,147** unchanged
tracked hashes against the frozen Git blobs, all nineteen packaged manifest
entries and all fifteen original artifact/driver copies. These observations do
not qualify actual browser rendering, native databases or every project suite.
The older numerical failures in issue #72 remain unresolved.

## Immutable scope and method

| Source | Commit | Complete tree |
| --- | --- | --- |
| Completed predecessor | `19247c08633ce93d62d3f1e78acf3a4848754c51` | `31b8a89757952c94ff6b45dac7d5177c1602b199` |
| Inventory/History candidate | `bdaf685b1ebc3889bf73474e5dc8c8e7f2d35df0` | `c897840779dcf999ccfde6815cf8cf82062fed59` |

The isolated worktree is `deckchek-inventory-security`, branch
`review/deckchek-inventory-security-20261121`. It began clean at the completed
predecessor and fast-forwarded to the exact root freeze before implementation
review. I did not treat root's uncommitted work as reviewed source.

The delta contains eleven files: four product files, five test files, one
smoke module and one implementation note. The four product contents independently
match their immutable candidate Git blobs:

| File | SHA-256 |
| --- | --- |
| `app/history-feed.js` | `81e3dfe74a9d21d7ac8a703b811cead95ab01268e53db1d1c491a3182bb03229` |
| `app/ledger/api.js` | `7ebd689f4efd7902de6324b29de6d0741fd11d620c412fc54c3e40911f64cb47` |
| `app/ui/screens/history.js` | `082b7f9d42c886b0889ccecbd1a2e91970f5114438ebfe09c42d897c18ac6889` |
| `app/ui/screens/ledger.js` | `f6df5ef5dbea80b54911da89ec6c6ba28c5745838514edc57629e2e56b2137e3` |

This lane uses source/Git inspection, static data-flow analysis, retained
JSON/TAP reading and byte/hash comparisons. It executes no project code,
application, tests, browser, native component, scanner, probe, extracted
implementation or vulnerability reproduction. It makes no remote mutation.
Root owns implementation; the fresh functional worker is the sole local
project executor.

The security-and-hardening skill informs the boundary and privacy review.
Its generic package-audit and runtime suggestions do not override this lane's
explicit static-only assignment. No dependencies, credentials, external services,
permissions or releases are changed by this audit.

## Native inventory into Gear Ledger

The [Ledger bridge](../../app/ledger/api.js) gathers catalog assets, products,
manufacturers, public notes, customer-unit flags, maintenance, certificate
summaries and photo inventories. The relevant Rust commands return typed lists
inside Results and propagate database/file errors. The lower catalog/photo
bridges forward native results directly, so the new checks see original responses.

At the baseline, catches replaced several failed enumerations with empty
collections, including a second photo enumeration during `loadState`. The
candidate removes those silent fallbacks. Shared `requireList` checks equipment,
products, manufacturers, public notes, customer-unit flags, maintenance,
certificate summaries and photo inventories. Rejections propagate; resolved
non-arrays produce a fixed source label and reload instruction. Confirmed empty
arrays remain valid. When the global maintenance list reaches its existing
1,000-row cap, a failed per-unit count blocks selection instead of reporting zero.

Customer-unit flags are checked before Set construction. This addresses the
baseline's acceptance of null as an empty set or a string as characters, which
could lose flags that keep service-job units initially unticked. The existing
`unknown command` compatibility path remains; other lookup errors propagate.
This corrects frontend resilience without changing native authorization.

The final build also rejects unknown photo inventory before any write. This
matters because a successful folder write prunes stale exported files: an
unavailable inventory must not become an empty inventory used for that decision.
Known individual photo and per-unit service read failures still add their
existing fixed, attributed problem records. A listed certificate whose
subsequent read resolves without a nonempty string `fileJson` now adds an
unreadable-certificate problem. Native `certificate_get` returns an optional
record, so absence is an ordinary boundary state. Invalid JSON within a present
string remains the existing builder's responsibility.

Array validation is not complete record-schema validation. The candidate does
not validate every field, relationship or identity returned by these commands.
The corrected issue is data completeness and operator trust; this review does
not establish an intrusion or disclosure.

## Ledger reload and export ownership

The [Ledger screen](../../app/ui/screens/ledger.js) already had a persistent
load error and retry. A failed reload could leave old gear and cached results
available through the separate keyboard export entry. Overlapping reloads could
also publish out of order. I sent both ownership concerns to root during the
baseline review; the frozen candidate addresses them.

Reloading now invalidates result, result key, completed-export state and old
build/export errors. Step changes, queued builds, direct export, keyboard export
and Escape transitions refuse loading/error state. Every reload captures a
generation, checks it after pending note writes and inventory reads, and checks
it again before final state/status publication. An older failure cannot replace
a newer success; an older success cannot clear a newer error or its loading
state. Handoffs also refuse unavailable inventory.

Only a successful current load prunes vanished units from the selection. The
choice to restore the last export is captured before pruning, preserving
explicit current privacy settings when the previously selected units disappear.
Existing note queuing and failed-draft retention remain unchanged; reads still
follow settled note writes. These checks protect this screen's asynchronous
ownership, not database transaction isolation or a single snapshot across all
readers.

## Feature lists into History

The [History feed](../../app/history-feed.js) normalizes six native feature-list
commands into a display feed. Previously a resolved non-array became empty and
mapper-declined rows disappeared through `filter(Boolean)`. The candidate reports
an invalid list once for its source, maps each row independently, retains valid
neighbors and counts mapper-declined or throwing rows. New omission messages do
not copy row identifiers, payloads or mapper exceptions. A rejected source stays
independent of successful sources and retains its existing error shape.

The [screen](../../app/ui/screens/history.js) requests only enabled feature
sources and checks visibility again before publishing delayed rows/errors.
A generation guard owns diagnostic and feature results, warning publication and
toasts. A persistent text-node notice names unavailable types or invalid-row
counts, offers Retry and labels counts/filter options as loaded. A wholly
unavailable result cannot claim confirmed empty history. Filtering valid partial
rows keeps the incomplete notice; a successful empty retry restores the ordinary
empty state. A diagnostic non-array or rejected list receives the same
persistent incomplete state; the existing diagnostic-error toast remains.

The feature mappers still define their existing small display shape. Reporting
rejected rows does not create a universal native-row schema, repair storage or
recover data a source did not return. Disabled feature filtering is a UI/request
scope control, not a new native authorization boundary.

## Privacy and write boundaries preserved

Ledger builds use normalized privacy rules, field allowlists, serial modes,
opaque output identifiers and bounded output limits. Public defaults omit serial
values, private notes and certificates; explicit valid choices remain the user's
decision. Photos are validated and metadata is stripped before export.
Certificates stay signed data, subject to existing size, content-hash and photo
rules. The preview iframe remains sandboxed without scripts; exported certificate
verification remains local.

I independently compared twenty-one selected dependencies against the completed
predecessor and matched their working bytes to frozen candidate blobs: Ledger
privacy/build/template/write queue; catalog/photo stores; feature defaults;
DOM/live-region builders; the native registry, Ledger, certificate, photo and
maintenance modules; default capabilities; the three applicable CI workflows;
and the audio analyzer, calibration solver and audio-quality test. All are
byte-identical. The full delta contains no package manifest or lockfile change.

No file/network permissions, native commands, upload flows or export paths are
added. The default capability retains core and native open/save dialogs. New
warning content uses fixed labels/counts and text nodes. Existing local native
error messages remain text rather than HTML; this is not a general error-redaction
policy. No raw invalid-row details are newly logged or exported.

Known individual read failures already lead to an explicit partial-result
summary. This remains separate from unknown enumeration and does not guarantee
complete content for every export. The browser Ledger `readLocal` fallback and
older-command compatibility are unchanged. Export-history/revision display
fallbacks are also unchanged; the actual build/export still awaits its revision
call. These limits are explicit in the
[implementation note](INVENTORY_HISTORY_IMPLEMENTATION_2026-11-21.md).

## Authored coverage reviewed

I read all new API and real-screen DOM cases and the crosslink assertion update.
They cover confirmed empties, rejected/non-array inventories, source independence,
valid neighboring History rows, bounded omission contents, enabled flags,
latest-result ownership, retries, stale previews, vanished selection and no-write
behavior when final photo enumeration fails. The crosslink change adds the
previously omitted latency-row and pre-gig-list errors; existing row and command
assertions stay intact. Prior privacy, leak-prevention, note persistence and
export contracts remain in the focused selection.

The new [inventory/history smoke](../../tools/smoke/inventory-history.mjs) uses
the actual app with modeled native readers, registers with existing automatic
smoke discovery, intercepts writes during unavailable-inventory checks and
requests two screenshots. It adds no product import or permission. It is authored
rendering coverage until run; a syntax pass and the DOM fixture are not rendered
browser evidence or native database qualification.

## Independently verified functional evidence

The first focused gate and separate syntax check ran on `bdaf685` / `c897840`.
The absolute executable was Node v24.22.3 at
`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`.
The test argv uses explicit sorted paths with `--test --test-concurrency=1
--test-reporter=tap`. `NODE_OPTIONS` and audio diagnostic variables were absent.
The metadata-only runtime queries and both external recorders were inspected;
the recorders preserve first output and refuse existing output files/directories.

| Observation | Result |
| --- | --- |
| Focused selection | 16 files; 130 tests, 130 pass, 0 fail, 0 skip |
| First gate started, UTC | `2026-11-21T08:59:14.133159+00:00` |
| Focused elapsed / exit | 13.130034802 seconds / 0 |
| Focused timeout / stderr | false / 0 bytes |
| Original TAP | 30,894 bytes |
| TAP SHA-256 | `fbbe75bc702bd34678a6590051982b79c1a8a72ca8b4625b1f7d2bbfe104d0fd` |
| Smoke parser check | One `--check tools/smoke/inventory-history.mjs`; exit 0 |
| Syntax elapsed / timeout | 0.063883627 seconds / false |
| Syntax stdout / stderr | 0 / 0 bytes |
| Tracked file integrity | All 2,147 hashes equal before tests, after tests and after syntax |

Independent read-only verification established the exact 16-file authorized
selection, all 130 sequential top-level TAP outcomes and its plan/footer,
source/complete-tree identities, unchanged clean status, both driver digests,
configuration digest and unchanged smoke source hash. I also enumerated all
frozen Git blobs and recomputed their SHA-256 values: the complete 2,147-entry
maps match immutable source, not just each other. Both recorders contain one
project invocation and no retry loop. No project code was executed by this lane.

The functional worker's [evidence manifest](evidence/inventory-history-functional-2026-11-21/manifest.json)
binds nineteen files. I independently rechecked every length and SHA-256,
validated its own SHA-256
`47f03c0cd7f2bc908e7dc3c38405766ce78c36febd8754734da89c6d6bc0866f`,
and compared all fifteen original artifact/driver copies byte-for-byte with
their retained sources. The full first [TAP](evidence/inventory-history-functional-2026-11-21/run.tap),
[result](evidence/inventory-history-functional-2026-11-21/result.json),
[syntax record](evidence/inventory-history-functional-2026-11-21/smoke-syntax-result.json)
and [retention proof](evidence/inventory-history-functional-2026-11-21/retention-proof.json)
remain in that peer-owned package, committed clean at
`53d399879b2509f58e2d73d35566f8cb86a05272` with complete tree
`be3443d5dfdc47eac53e60c1e4937e0da57e57f9`. Integrate it alongside this report.

## Remaining qualification boundaries

This is a fresh static audit plus independent inspection of the authorized
focused outcome. The earlier 2,359-test gate belongs to predecessor `fb81960` and
cannot qualify these later changes. Actual new-source browser rendering, the
remaining applicable CI/platform/native gates, physical capture and separate
performance suites remain outside this lane. The earlier audio numerical failures
in issue #72 remain preserved and unresolved; this patch changes no numerical
solver and claims no audio repair or cause. Fleet remains untouched.
