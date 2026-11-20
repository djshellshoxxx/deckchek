# Devices refresh successor — 20 November 2026

## Scope and confirmed defect

This fresh bug-hunt successor starts at PR #45 source
`7e362e64ee00af6110f04511382af0c77296eb7e`, tree
`328b31fa3770355a6acb4ab754d0d9f36da72fbc`. The predecessor's independent ZIP
review found no production blocker. This work follows the separate open boundary
recorded in [the Devices consolidation handoff](CONSOLIDATION_ZIP_DEVICES_2026-11-19.md#boundaries-and-next-useful-action).

`refreshUnits` already staged an asset/result pair and accepted a view guard, but
default callers had no shared ordering protection. An earlier asset or result
read could finish after a newer complete refresh and replace the shared cache
with older data or an empty fallback after an error. The Devices `catalog`
listener also rendered whichever visit happened to be visible after its read
finished. A delayed event could therefore discard a newly opened assignment
form after navigation or an interaction on the same visit.

The real event-handler tests reproduced these ordinary workflows. An additional
real-catalog case shows a notification retiring a form while its assignment
write is pending: the write can still persist, but the retired callback cannot
select the successfully assigned unit. No malformed input or external probing
was involved.

## Correction and preserved contract

- Each shared refresh receives a sequence number. A complete, current refresh
  publishes its staged asset/result pair and advances the published sequence.
  An earlier completion cannot replace a pair already published by a newer
  request. The same rule applies to the existing empty-array failure fallbacks.
- Starting a newer request alone does not invalidate an independently current
  default consumer. A view-owned request that retires before publishing leaves
  that default consumer eligible to publish. This preserves Certificate, Service,
  Setup wizard and session-library consumers rather than tying all reads to one
  Devices visit.
- `refreshUnits` returns whether it published. Existing consumers that ignore the
  return value retain their successful-read and current-failure behavior. Devices
  `onShow` can continue using an already published newer snapshot and consume its
  handoff while its own view remains current.
- The catalog listener ignores a removed section. A connected hidden section can
  still refresh the shared cache, but its completion cannot render a later visit.
  Redraw requires the original visit, unchanged rendered view, latest catalog
  event, and no open profile-assignment form. The catalog-event sequence also
  prevents an earlier event's repaint from displacing a still-pending newer event.
- An assignment form remains connected during a catalog notification, including
  while its write is pending. The original write finishes once and its current
  callback selects the acknowledged unit. The existing expected-binding checks,
  request fields, store implementation and native transaction are unchanged.

Only `app/ui/devices/library-state.js` and `app/ui/screens/devices.js` change in
production. Existing runner behavior, profile synchronization, persisted data,
thresholds, feature flags and dependencies are unchanged. Fleet remains off.

## Verification

Runtime: **Node v24.22.3**. The final regression pair contains **25 cases**, with
12 new cases added across the existing lifecycle and actual-assignment files.

| Execution | Result |
| --- | --- |
| Initial 20-case lifecycle scope against unchanged production | **12 passed / 8 failed**, 399.764429 ms |
| Final 25-case regression pair copied into a separate checkout of untouched `7e362e64` | **16 passed / 9 failed**, 1,815.576206 ms |
| Corrected nine-file compatibility scope, including that same final pair | **94 passed / 0 failed / 0 skipped / 0 cancelled**, 4,686.438426 ms |
| Changed JavaScript syntax and whitespace | All four files passed; `git diff --check` passed |

The corrected command was:

```sh
node --test --test-reporter=tap --test-concurrency=1 \
  tests/devices-screen-lifecycle.test.mjs \
  tests/device-profile-assignment-screen.test.mjs \
  tests/device-profile-assignment.test.mjs \
  tests/device-profile-assignment-ui.test.mjs \
  tests/devices-map-profile-identity.test.mjs \
  tests/device-library.test.mjs \
  tests/service-intake-lifecycle.test.mjs \
  tests/setup-wizard-model.test.mjs \
  tests/certificate-screen-lifecycle.test.mjs
```

The new cases cover late successful and rejected asset/result reads, a retired
newer view alongside a current default caller, catalog completions across
hide/return, opening an assignment on the same detail DOM, two current catalog
events completing in order, removed sections, and a real submitted assignment.
Existing handoff, failed-assignment retry, immutable history, learned-map identity,
hidden completion and default-failure behavior remain covered. Counts overlap
and must not be added as distinct test totals.

Final executed source SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `app/ui/devices/library-state.js` | `8b929e937c441e5aa37cee8471fc52258b4e8b753b7579fadbee6e0cf23f0366` |
| `app/ui/screens/devices.js` | `b8627c11a6413170c6fd881875b4e93f2c2ceb6eb5dfcc8d59e76860a3274af4` |
| `tests/devices-screen-lifecycle.test.mjs` | `042e41460bc3ed983e24c6dec99fba6430997a7427015909172ed3eebbf07f66` |
| `tests/device-profile-assignment-screen.test.mjs` | `8c2c8f9b0701c006989e681ffb440128553612c1fafd85ea9ee845727457f639` |

The final red-log SHA-256 is
`393b3230a21d135e8b9eb5aafce2ca173ac116ecfdf4f2fb2b41f5d83912ee3c`;
the compatibility-log SHA-256 is
`4111fcae81f9cba7db8aae236926bcf2e7c38622ae996e6ed4c76a40d09ed2ad`.
Adding this report does not alter the executed production or test bytes.

## Boundaries and fresh-worker handoff

This correction orders refresh reads against other refresh reads. Direct cache
updates after `saveResult`, `addUnit` and successful assignment retain their
existing behavior; they do not participate in the new published-read sequence.
No write is cancelled or rolled back. This is not a transactional snapshot across
the two store queries, cross-tab coordination, or a revision system for every
cache mutation. Forced profile-library reload ownership is also unchanged.

The actual catalog and DOM handlers are exercised with the existing test fixture;
this run does not establish browser layout, native dispatch, physical device,
driver or hardware qualification. No full suite, scanner, native build, remote
write, release, deployment or tag was performed by this worker. Root retains
integration and publication ownership, and earlier PR #45 CI does not qualify
these new production bytes.

The concurrent fresh defensive reviewer suggested strengthening the same-detail
form case, which was done before the final red/green runs. A fresh code reviewer
should bind acceptance to the resulting commit, inspect the completed-publication
ordering rather than assume latest-started cancellation, and preserve the
distinction from direct mutation ordering. Any later expansion into cache writes
or forced profile loading should begin with a concrete ordinary reproduction.
