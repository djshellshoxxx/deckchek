# System Health scan coverage — implementation for fresh review

Date: 2026-11-21. Issue: [#89](https://github.com/djshellshoxxx/deckchek/issues/89).
Status: **Authored, not executed or independently accepted.** Root owns the
implementation. The forthcoming fresh code, functional/bug and defensive security
cohort must review a frozen candidate before any proposed bounded FIRST.

## Problem and intended behavior

The previous interpreter added informational collection errors while retaining
clean-area findings. Its summary treated only `ok` and `info` as pass. The view
also represented rejected commands as null input, so successful other areas
could produce HEALTHY while a required scan was absent. Mixed unsupported areas
were omitted. HTML/PDF and diagnostics could lose the same missing coverage.

The correction makes collection coverage explicit and independent of hardware or
software fault severity. All three required areas must complete before an overall
all-clear. Real errors/warnings remain real errors/warnings. Failed, incomplete,
unsupported, pending and never-scanned areas retain distinct states. An entirely
unsupported environment remains informational and does not pretend it scanned.

## Source changes

- `app/system-check.js` adds the shared coverage model, attaches source coverage
  metadata to interpreted findings, suppresses `ok` findings for partial areas,
  preserves mixed unsupported results and computes the overall verdict from both
  coverage and findings. The bridge rejects unusable present-command responses
  instead of changing them to unsupported. HTML includes every required area's
  coverage and recomputes its verdict instead of trusting an obsolete headline.
- `app/ui/screens/system.js` keeps command failures in coverage, shows incomplete
  counts, coalesces each pending area and blocks exports/event-period replacement
  while scanning. Failed attempts remain exportable. Revision/disposal ownership
  retires obsolete preparation and presentation. PDF busy state survives status
  refreshes; completion restores controls according to current scan state.
- `app/ui/persistence.js` adds an optional busy-state callback, retained through
  its actual Retry action. The System Health owner uses it for both direct
  exports and toast retries so a later scan keeps its controls disabled. Existing
  consumers retain the default behavior; original Pre-gig and Service screen
  regressions are included for that shared boundary.
- `app/report-pdf.js` uses the same canonical summary and adds the coverage count
  to the printable header. Its body uses the actual shared HTML builder.
- `app/ui/screens/support-dialog.js` preserves each settled command's attempt
  state in diagnostics context and includes coverage plus area/scan-state metadata.
- `app/ui/workflows/setup-wizard.js` explicitly declares its driver-only scope,
  clears the preceding health answer on each new attempt and retains completion.
  `app/setup-wizard-model.js` preserves that optional boolean through sanitization,
  persistence and summary text. Legacy count-only answers keep their old shape.

The [updated contract](../SYSTEM-CHECK-CONTRACT.md) describes the data model and
its limits. Native `DriverScan`, `EventScan` and `DjLogScan` have literal supported
fields, collection arrays and top-level errors arrays. Native command wrappers
and collectors remain unchanged. Diagnostics' native context is a JSON value and
is serialized to `system-health.json`; no native schema change is required.

## Authored regression coverage

Two new original files contain 15 model/report cases and 19 actual-screen/
diagnostics cases. One new setup-model case checks completion persistence,
incomplete summary text, clearing before a new attempt and boolean validation.
The two existing System Health assertions now reject severity-only all-clear and
require incomplete scans to suppress clean findings. Existing fault thresholds
and core assertions remain intact.

Coverage includes each failed area and actual Retry; each partial collection;
mixed and entirely unsupported results; pending/missing coverage; real faults
alongside incomplete collection; invalid present-command responses; explicit
driver-only scope; serialized findings; stale summary replacement; matching
HTML/PDF area counts; direct/toast-Retry export ownership; disposed scans; and actual
diagnostics opt-in collecting all settled command states.

Tests import actual production modules. The screen file uses one shared document
and feedback hosts, with per-case screens and cleanup. Native command replies,
save dialog and PDF acknowledgement are explicit seams; actual printable HTML
and CSS are retained. No native renderer, Windows scan, archive creation, physical
audio, real browser layout or OS dialog is qualified by these fixtures.

## Review and execution boundary

The proposed nine original test files total **208 authored cases, 35 added**:
Pre-gig core and screen, report PDF, Service panel lifecycle, setup model, support
dialog, System Health interpreter, coverage and actual screen. This is a static
count, not a passing result. Review
all selected assertions and fixtures and all actual changed consumers. The
functional reviewer must independently derive order/counts and historical timing
before proposing exact controls. In particular, `UPDATE_FIXTURES` must be absent
because an existing PDF fixture test honors it as a write instruction.

No project code, Node identity command, test, syntax check, build, browser/native
launch or extracted implementation has run for this candidate. Root/code/security
stay static. Only the current functional worker may later run one separately
reviewed bounded FIRST after all three source and full-control dispositions and
root's explicit byte-bound authorization.

## Preserved limits and follow-up

No measurement policy, native collector, scan bound, permission, default flag or
dependency changes. The Pre-gig assessment still applies its existing gear and
measurement grading; this change does not redefine that policy. Top-level
coverage validation does not deeply validate arbitrary nested/hostile objects.
Native collection may itself omit data without reporting errors; this JS
correction cannot establish native completeness. PDF ownership checks cover
preparation before adapter handoff and feedback/retries, not cancellation after
submission. Real setup interaction/platform behavior still needs its appropriate
later qualification.

Completed Pre-gig round seventeen retains its original 132/132 FIRST and all
three FINALs. Its pre-existing native associated-preset deletion correction is
queued separately. Native backup #85, Population Compare #88, the original
complete-source audio failure and Fleet timing hold remain. No release,
deployment, rerun, qualification merge or credit-exhaustion claim follows.
