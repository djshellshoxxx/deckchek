# Associate an existing unit with a device profile

In **Devices**, open the researched model, choose **Use existing unit**, select
the saved equipment unit and confirm that its model and revision match. Choose
**Use this device profile** to save the association. This works for units entered
in Equipment and for units brought in through catalog transfer, in browser and
desktop modes. Nothing is selected or assigned automatically.

The action changes the selected asset's product association to the product
already synchronized for that device profile. It retains the asset ID, serial,
nickname, notes, setup components, original product record and all other asset
fields. It does not rename a product, merge catalog records or establish physical
hardware identity. The operator checks the model and revision.

Saved measurements, test results, service records, certificates and learned MIDI
maps are not rewritten. Their original IDs and profile provenance stay intact.
Existing learned-map identity guards continue to prevent automatic use of a map
recorded for a different profile. Assignment does not verify a mapping or turn
old results into results for the newly chosen profile.
Legacy maps with unknown profile identity retain the existing compatibility
policy; an unknown identity is not evidence of a physical match.

## Concurrency and failure behavior

The request copies the unit ID, profile ID, reviewed target product ID and
previous product ID. A missing previous product must be explicitly `null`.
Unavailable or deleted units, unknown profiles, changed profile/product bindings
and a different current source product are rejected. The caller must reopen the
device page and review the current unit before trying a changed association.

Native assignment uses one immediate SQLite transaction and the existing
off-main database/restore guard. It changes only `asset.product_id` and
`asset.updated_at`. A constraint or commit failure rolls back that operation.
Retrying an already completed assignment performs no write and retains its
existing update time. The bridge accepts bounded string identities and rejects
unknown request fields.

Browser assignment reads the saved catalog strictly, preserves unknown legacy
properties, rechecks the snapshot before writing and reports storage errors.
Corrupt or unavailable storage is not replaced with an empty catalog, and a quota
failure is not reported as a successful assignment.
The localStorage comparison and write are synchronous within one page, but are
not an atomic transaction across multiple browser tabs. Native SQLite assignment
provides the transactional concurrency guarantee.

The form snapshots its candidate records, clears confirmation when the selected
unit changes and allows only one in-flight request. Leaving the page retires its
callbacks. An already submitted database write may complete, but its late result
cannot replace a newer page; reopening Devices reloads the saved units. An
acknowledged failure retains the selection for an explicit retry.

## Scope

Catalog archive formats and their automatic-binding exclusions are unchanged.
The association is a separate operator action after import. No schema migration,
profile research fact, measurement threshold, feature default or hardware
qualification changes.

Implementation: `app/device-profile-assignment.js`, the catalog store's
`assignDeviceProfile`, `app/ui/workflows/device-profile-assignment.js`, Devices
screen wiring and `src-tauri/src/device_profile_assignment.rs`. Node tests cover
storage/IPC and actual form callbacks; native tests cover real SQLite operations;
`tools/smoke/device-profile-assignment.mjs` covers the browser UI and mocked native
command flow. Mocked native UI coverage does not replace a real Tauri or
physical-device run. Qualification results are recorded separately for each
tested source in the engineering handoff.
