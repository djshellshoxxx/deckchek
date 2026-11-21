# Devices acknowledged-cache-write ownership — 20 November 2026

Author: `/root/devices_fresh_acceptance`. Dates use America/Vancouver.

## Separate source and review roles

This implementation follows independent predecessor acceptance
`147f1da3b394b9ef63358acc713b43569fff5246`, recorded in
[DEVICES_REFRESH_ACCEPTANCE_2026-11-20.md](DEVICES_REFRESH_ACCEPTANCE_2026-11-20.md).
That checkpoint retains production `6612dba` and adds only its report and hidden
catalog regression. Its acceptance does not review this newly authored
correction. Root authorized the successor after an ordinary reproduction and
will obtain fresh independent review before publication.

## Defect and implemented contract

An older pending refresh can finish after a result save, unit creation or
profile assignment succeeds. It then replaces newer cached state: the saved
result or new unit disappears, or an acknowledged assignment returns to its
previous product in memory. Persisted data remains intact. The result-save
sequence also reproduces on untouched baseline `7e362e64`.

Reads and acknowledged cache writes now use one publication sequence. Successful
result saves and unit creation update the cache, advance ownership, then emit
their existing event. The current Devices assignment callback delegates its
unchanged asset-field update to `cacheAssignedUnit`, which also advances cache
ownership. The predecessor's checks at both asynchronous boundaries prevent an
already pending read from publishing its older staged data.

Failed writes publish no cache change and retire no current read. A new read
started after a successful write remains eligible to publish a complete current
snapshot. Submitted writes still finish; nothing cancels or rolls back them.
Validation, store requests, IPC fields, native transactions, retries and existing
assignment acknowledgement/current-form guards remain unchanged.

Production changes only `app/ui/devices/library-state.js` and
`app/ui/screens/devices.js`. Dependencies, thresholds, default flags, migrations
and native code are unchanged.

## Verification

Runtime: **Node v24.22.3**. Seven new cases cover delayed result reads after a
save, delayed asset/result reads after unit creation, failed result/unit writes,
a fresh authoritative read after writes, and the actual assignment UI with an
older pending read.

| Execution | Result |
| --- | --- |
| Two-file reproduction before correction | **7 passed / 4 failed / 0 skipped**, 11 total; 761.621766 ms |
| Corrected ten-file compatibility scope | **102 passed / 0 failed / 0 skipped / 0 cancelled**; 5056.857967 ms |
| Changed JavaScript syntax | Four files passed |
| Whitespace validation | Passed |

The green run is the predecessor's nine-file Devices/assignment/map/library/
Service/Setup/Certificate scope plus `tests/device-library-cache-writes.test.mjs`.
It includes the independent hidden-catalog case; counts overlap earlier runs.
The red production source is unchanged `147f1da`.

Red log SHA-256:
`8eb3874fdb41e51b0a958dcee92d92724d7fe380b445ebf74d6acbae6c807846`.
Green log SHA-256:
`bd7c37f872c95d9c5c777f8a78a970895d318eeedd6411c7111c8b9080a4d9ca`.

Final executed file SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `app/ui/devices/library-state.js` | `bc8eaf9f11d5def19963ada60f067fa4f1cafa7874c89df3fb46d41a294698a2` |
| `app/ui/screens/devices.js` | `ee21c0a8f23c99c0b01f4c11dc4ff8a8f4acd7500b2f0b05e6c4cd9e2f597a04` |
| `tests/device-library-cache-writes.test.mjs` | `0dedd3852c27397e394c6965b30061999ef3f49b8185e79f47857fe8ca277495` |
| `tests/device-profile-assignment-screen.test.mjs` | `49477edfbe36d6cd012122424e9f560cb6cfd757b86cb6370912dc21ad2255f2` |
| `tests/devices-screen-lifecycle.test.mjs` | `5d0c97587016057d012df34256b4c74084c86e340c29b01718a0a3e35fe1f73f` |

Adding this report does not change the executed application/test bytes.

## Limits and fresh handoff

This is in-process UI-cache ordering, not a transactional database snapshot,
cross-tab coordination or backend revision protocol. Forced library loading is
unchanged. Assignment still updates an existing cached asset rather than
inventing or independently reloading one.

Tests use actual helpers/handlers with ordinary deferred store responses. The
assignment case uses the real persistent browser catalog. No full suite, browser
launch, native build, scanner, hardware test or remote mutation was performed.
Root owns combined qualification and publication.

Fresh review should check the success-only publication point, event ordering,
failed-write compatibility, assignment acknowledgement and later-read acceptance.
Neither predecessor review nor PR #45 CI qualifies the new bytes.
