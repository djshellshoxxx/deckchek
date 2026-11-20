# Independent Devices cache-write acceptance — 20 November 2026

Reviewer: `/root/cache_write_fresh_acceptance`. Dates use America/Vancouver.
This reviewer did not author the correction or its existing regression cases.

## Fixed source and disposition

| Scope | Git identity |
| --- | --- |
| Predecessor | `147f1da3b394b9ef63358acc713b43569fff5246` |
| Reviewed implementation | `f598418da60bf727b58509fd584cf10fd8a967d9` |
| Reviewed tree | `ead8ee8c3224a8c067ffe6cab806679dd54d87a1` |

**ACCEPT_FOR_INTEGRATION within the documented cache-publication scope.** No
production correction or additional persistent regression was required by this
independent review. Only this report is added by the reviewer.

The comparison is `git diff 147f1da3b394b9ef63358acc713b43569fff5246..f598418da60bf727b58509fd584cf10fd8a967d9`.
Its production changes are confined to `app/ui/devices/library-state.js` and
`app/ui/screens/devices.js`; the remaining changes are two test files and the
[author report](DEVICES_CACHE_WRITE_SUCCESSOR_2026-11-20.md).
The author's earlier predecessor acceptance is a separate review and does not
substitute for this assessment of the newly authored implementation.

## Standards

Read development-plan sections 1.4 and 5.3, the existing library-state module,
all production cache mutation sites, the assignment workflow and the changed
tests. No applicable AGENTS.md, CONTRIBUTING or separate CODING_STANDARDS file
was found in the checkout.

No hard source-standard violation or actionable naming, duplication,
responsibility, indirection or speculative-generalization finding was identified.
The existing monotonic read sequence is extended to acknowledged cache writes
in its owning module. `cacheAssignedUnit` has one actual caller and replaces the
previous inline three-field update; it is not an unused or generalized API.
Store promises remain awaited and the existing error paths are preserved.

The known extra blank line at the end of the author's report is documentation
formatting only. Root owns that trim in its integration overlay; this reviewer
did not change the author's file or claim that the complete historical diff
passed whitespace validation. The four changed production/test paths passed
their scoped whitespace check.

## Spec and functional assessment

The accepted contract is the success-only ownership correction in the
[author report](DEVICES_CACHE_WRITE_SUCCESSOR_2026-11-20.md), read together with
the [existing assignment concurrency contract](../device-profile-assignment.md).
No missing, contradictory or unrequested production behavior was identified.

- `refreshUnits` retains a request sequence and checks eligibility after both
  asynchronous reads. An acknowledged cache write advances the published
  sequence, so an already pending read cannot replace that newer state.
- `saveResult` and `addUnit` await their store operations, update the local cache,
  advance ownership, then emit their existing notifications. There is no await
  between the local update and ownership change. A synchronous listener therefore
  observes the updated state and any refresh it starts has a newer sequence.
- Failed store promises reach neither cache publication nor its ownership
  barrier. A still-current read remains eligible, as do fresh reads started after
  a successful write. No submitted persistence operation is cancelled or rolled
  back by the new sequence.
- The assignment callback still runs only for the acknowledged, current form.
  Its helper updates the same existing asset ID with the same product ID and
  update time as before, then protects that cache state from older reads.
  Request fields, expected-product checks, store/native transactions and retries
  are outside the diff and remain unchanged.
- The complete production search for direct assignments to `lib.assets` and
  `lib.results` found the complete refresh publication, result save, unit creation
  and acknowledged-assignment helper. Those are the mutation paths covered by
  this correction. Existing Service, Setup wizard and Certificate consumers still
  use `refreshUnits`; the predecessor's hidden/default-caller policy remains.

## Independent execution

Executed the following existing files serially using task **Node 22.23.4**:

- `tests/device-library-cache-writes.test.mjs`
- `tests/device-profile-assignment-screen.test.mjs`
- `tests/device-profile-assignment-ui.test.mjs`
- `tests/devices-screen-lifecycle.test.mjs`

Result: **38 passed, 0 failed, 0 skipped, 0 cancelled**, **1,744.883902 ms**.
The tracked checkout remained clean after execution. These tests exercise the
actual helpers/handlers with normal deferred store responses and the persistent
browser assignment fixture; they do not constitute browser or native execution.
The counts overlap the author's 102-case compatibility run and are not additive.

The two production hashes match the author's recorded executed bytes:

| File | SHA-256 |
| --- | --- |
| `app/ui/devices/library-state.js` | `bc8eaf9f11d5def19963ada60f067fa4f1cafa7874c89df3fb46d41a294698a2` |
| `app/ui/screens/devices.js` | `ee21c0a8f23c99c0b01f4c11dc4ff8a8f4acd7500b2f0b05e6c4cd9e2f597a04` |

Independent TAP log SHA-256:
`500c91a23e41d798154e5c9fba54b156cbcd9307014d8bb8bf44b7e928c1fa55`.
The author's red **7-pass/4-fail** and green **102/102** results remain author
evidence; this reviewer did not rerun or relabel those executions.

## Limits and successor handoff

This is in-process cache ordering. It adds no transactional database snapshot,
cross-tab synchronization or backend version protocol. Forced library-load
ownership remains outside scope. The assignment helper preserves the existing
behavior of updating an already cached asset rather than inventing one.

No full suite, browser launch, native build, scanner, hardware test or remote
mutation was performed by this reviewer. Root owns the combined source, final
qualification and publication. Retain the distinction between this exact-source
acceptance and any later changed bytes or hosted result. A fresh successor should
start from a concrete observed workflow failure rather than repeat unchanged
cache checks or broaden the accepted scope without evidence.

**Standards:** zero source findings. **Spec:** zero findings in the reviewed
contract. **Merge-blocking source findings:** zero.

Reviewed-by-agent: /root/cache_write_fresh_acceptance
