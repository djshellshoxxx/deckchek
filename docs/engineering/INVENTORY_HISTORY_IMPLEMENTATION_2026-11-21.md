# History and Gear Ledger incomplete-read handling

Issues [#76](https://github.com/djshellshoxxx/deckchek/issues/76) and
[#77](https://github.com/djshellshoxxx/deckchek/issues/77) identify successful-looking
empty or incomplete views after unavailable native reads. Root authored this
candidate on qualified main `77c26f44710c6dfb1c986fb79266c233e2ae688c` and
consolidated the completed preceding successor before freezing it for fresh review.

## Behavior

History now attributes non-array feature-list responses and mapper-declined or
throwing rows to their source. Valid neighbours remain visible. The screen requests
only enabled feature sources, checks visibility again before publication, and
marks counts as loaded when any requested source is incomplete. A persistent
notice names the source, reports omission counts without row details and offers
Retry. A failed read does not display the confirmed-empty message. Diagnostic
list-container errors receive the same persistent incomplete state. Load-generation
ownership prevents an old request from replacing a newer response.

Gear Ledger now propagates failures from public notes, maintenance, certificate
and photo enumeration. Expected list containers, including catalog and service-job
unit lists, must be arrays; confirmed empty arrays remain valid. A failed per-unit
count after the global maintenance cap blocks selection. Unknown photo inventory
during the final build blocks writing, including a folder write that might otherwise
prune existing files. Known individual photo/service/certificate read failures keep
the existing visible partial-result contract. Missing or non-string certificate
contents are explicitly attributed as unreadable.

The Ledger screen already has a persistent error and Try again control. Its new
loading/error guards also block keyboard export, step changes and cached builds.
Reloading invalidates the preview cache. Only the newest load may publish state;
successful loads remove vanished units from the selection without resetting
explicit privacy choices merely because those units disappeared.

## Scope and verification boundaries

This is list-container validation and attribution of existing mapper rejection,
not comprehensive validation of every native record schema. Browser Ledger
`readLocal` retains its historical read fallback, and exact older-backend
unknown-command compatibility remains unchanged. Export history/revision display
fallbacks remain; actual build/export still requires the revision call. No command,
permission, native schema, field limit, privacy preset or deployment behavior changes.

New API and real-screen DOM regression tests cover confirmed empties, unavailable
lists, valid neighbours, enabled flags, retry, late results, cache invalidation,
vanished selection and no-write behavior. Existing privacy, leak-prevention,
note persistence and export tests remain intact. One crosslink assertion is updated
because the previously silent malformed latency row and pre-gig list now correctly
produce source errors.

The auto-discovered `tools/smoke/inventory-history.mjs` exercises the actual app
with modeled native readers and retains screenshots in the hosted smoke output.
It is authored coverage until run; DOM fixtures are not rendered-browser evidence,
and modeled readers are not physical/native database qualification.

At authoring, no project execution has occurred on this candidate. The fresh
round-five functional worker is the sole local executor; code and defensive
security reviewers are static. First outcomes are preserved in their own evidence
package. The preceding 2,359-test passing source gate belongs to `fb81960`, not
these later changes. The earlier numerical failures in issue #72 remain unresolved.
