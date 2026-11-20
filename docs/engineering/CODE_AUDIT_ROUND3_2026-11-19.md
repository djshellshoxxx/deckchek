# DeckChek fresh code audit, round 3

## Scope and disposition

Reviewed source: `18aaeec598f9e2f1f59acb108e1ba8b72f0687ff`, using original main
`8c43cf17e3d5f5067ece5667f1aec1540f4b4091` as the comparison baseline. This worker
independently reviewed the explicit existing-unit/profile association and the
round-2 MIDI timing correction. The earlier branch-uniqueness inventory was not
repeated. Service lifecycle and preset/media imports belong to separate reviewers.

**Accepted within the documented contract. No additional production correction
was required in this review.** Three new integration cases exercise the actual
Devices screen callbacks against an isolated persistent browser catalog. These
address the gap between the existing form-level tests and screen/store wiring;
they do not substitute for an actual browser or Tauri application run.

## Assignment specification review

Reviewed `docs/device-profile-assignment.md`, `app/device-profile-assignment.js`,
the catalog store's `assignDeviceProfile`, the assignment workflow, Devices
integration, `src-tauri/src/device_profile_assignment.rs` and command registration.

The request copies all four reviewed identities, requires an explicit nullable
source product and rejects unknown fields. The browser path reads strictly and
checks the storage snapshot before committing. The native transaction validates
the active asset and current profile/product binding before its narrowly scoped
update. A same-target retry returns the existing update time without a second
write. Neither path rewrites the original product, saved results or learned maps.

The new screen tests independently establish that:

- No request occurs without choosing and confirming a unit. A submitted request
  names the reviewed source and target; duplicate submission produces one call.
- A successful assignment changes only the selected asset's product association
  and update time. Its identity, metadata, original product, old-profile result
  and learned-map record survive unchanged. The acknowledged update reaches the
  library cache and selects the imported unit even when another target unit was
  already first in the list. The displayed map uses the new profile's controls
  while retaining the old-profile learned map in storage.
- A rejected write changes neither storage nor the library cache. The selection
  remains in the active form; an explicit retry can complete successfully.
- A write already submitted before `onHide` may finish in storage, but its late
  result cannot change the retired screen, selection or toast area. Old form
  handlers cannot submit again. `onShow` reloads the saved association and keeps
  the current unit choice rather than applying a retired callback.

Equipment, Mapper and Fleet reload their catalog-derived data when shown; absence
of a catalog notification in the assignment success callback did not establish
a separate defect. The documented localStorage cross-tab atomicity limit remains.

## Assignment implementation review

The native command uses the existing off-main database wrapper. The wrapper
retains its database guard while the immediate transaction runs. Validation,
mutation and commit remain within that transaction, with parameterized SQL and
only `asset.product_id` and `asset.updated_at` in the update. Rust request decoding
requires the nullable field even when its value is null. The existing six native
test definitions cover actual migrated tables, idempotence, invalid/stale inputs
and rollback. This worker reviewed those definitions and their data flow; native
execution and hosted qualification remain root's evidence, not a new run here.

The UI owns copied candidate records and a one-request-at-a-time form. Rendering
or hiding Devices retires the form callback. The integration tests use production
screen and storage code, not source-text checks. No schema, dependencies,
measurement thresholds, defaults or policy gates changed in this worker's delta.

## Round-2 MIDI review

The revised finite, nonnegative, arrival-ordered timeline check excludes invalid
and reversed Clock/Active Sensing arithmetic. Positive advancing Clock spans may
still contain tied arrivals. Computing variation from interval/mean ratios is
equivalent to the prior coefficient-of-variation formula for representable valid
inputs while avoiding squares of large absolute durations.

An independent direct-variance oracle matched jitter and tempo for four interval
sequences: constant, alternating, tied with one advancing interval, and steadily
increasing intervals. Each probe also verified immutable input events, preserved
packet counts and null/omitted timing when `timingObserved` is false. The runner
passes that flag from the same timestamp-fault counter it saves in capture
integrity. Two focused tests of the actual injected runner confirmed that missing
or reversed transport times preserve packet evidence, require review and omit
timing numerics rather than treating the receipt clock as measured transport time.

This acceptance concerns the correction's arithmetic and evidence propagation.
It does not establish physical MIDI timing, hardware identity or audible behavior.

## Verification

Runtime: Node **22.23.4** at
`/workspace/scratch/0a7bc3583588/toolchain/node_modules/node/bin/node`.

```text
node --test tests/device-profile-assignment-screen.test.mjs tests/device-profile-assignment-ui.test.mjs tests/device-profile-assignment.test.mjs tests/devices-map-profile-identity.test.mjs
```

Result: **19 passed, 0 failed, 0 skipped**. Three are new actual-screen cases.

```text
node --test --test-name-pattern='conformance (retains packet evidence|omits timing numerics)' tests/midi-fs36-ui.test.mjs
```

Result: **2 passed, 0 failed, 0 skipped**. The independent four-sequence numeric
probe also passed. `git diff --check` passed. No full suite, Chromium, native
application or hardware run was launched by this worker.

## Fresh-worker handoff

Root should integrate the new integration test and this report, then qualify the
combined source with the other workers' changes. A successor can verify the
published source and hosted results without repeating branch archaeology or
unchanged test sweeps. Browser layout, native IPC end-to-end behavior and physical
hardware remain separate qualification boundaries. Keep late-write persistence
distinct from a callback's permission to update the current view, and preserve
null/omitted timing evidence in any future report renderer.

No remote branch, pull request, deployment or release was changed by this worker.
