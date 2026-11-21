# Pre-gig storage and save recovery — implementation candidate

Issue [#87](https://github.com/djshellshoxxx/deckchek/issues/87) identifies a browser
persistence failure: unreadable storage was treated as an empty collection, and
failed writes could still return a run ID, preset row or deletion success.
The screen could then claim that an unsaved result was in History. This candidate
preserves the unknown state and makes successful persistence explicit.

This is authored source and regression coverage, **not passing evidence**.
No project test, import, syntax check or build has run on this candidate. Its
fresh code, functional/bug and defensive security reviews precede any separately
authorized FIRST gate.

## Browser collection contract

`app/pre-gig.js` resolves browser storage only when a browser operation needs it.
The unchanged native adapter returns before accessing browser storage and keeps
the six existing command names and argument shapes.

Only an observed `getItem` result of `null` establishes an absent collection.
Unavailable providers/methods, failed access, non-string reads, malformed JSON,
non-array collections, invalid rows and duplicate IDs reject with fixed typed
errors. A partly valid collection is not filtered into a writable replacement.
Reads and failed mutations preserve its original bytes. Known run/preset shapes
are checked before writes; serialization failures and non-finite numbers refuse
the mutation. This is a browser data-consistency contract, not a sandbox for
arbitrary JavaScript objects or protection against a compromised renderer.

Save, upsert and deletion report success only after `setItem` returns successfully.
Deleting an absent ID returns false without writing. The newest-100 run retention
rule, response shapes and preset creation timestamps remain unchanged. Existing
string-JSON presets and future-version preset JSON remain readable; future
versions use the existing read-only domain contract.

## Completed results and drafts

The controller exposes `retrySave()` for the retained completed result. An
in-flight save is shared by repeated Save/Retry calls and blocks controller
replacement/reset. A failed save retains the result, removes any previous
success marker and exposes the error. Retry performs persistence and previous-
history lookup without repeating measurements. An unreadable History is not
treated as a confirmed empty comparison baseline.

The actual screen distinguishes saving, saved and unsaved results. Its Retry
button and shell Save callback use the retained controller operation. Done,
preset changes, full reruns and individual reruns require an explicit discard
decision before replacing an unsaved result. A newly saved preset does not
relabel a check already performed against another rig.

Preset reads and History reads have persistent error state and explicit Retry.
A failed reload retains previously known rows with a stale-data message. It does
not show a confirmed-empty message or silently replace an unread selected rig
with a built-in. Request sequences retire older reads; disposal retires pending
presentation and removes screen listeners.

Failed preset Save leaves the same form and entered values visible, with its
error inside the dialog. Repeated Save clicks share the pending attempt, and
the dialog stays open while that write is pending. A successful preset write is
cached before refresh; a failed follow-up read retains the acknowledged row and
reports the read failure separately. A failed import retains its parsed draft
and retries saving without asking for the file again. Future-version presets
cannot be run, edited or duplicated in this older version.

## Authored verification and limits

The proposed five-file selection contains 128 expanded named cases: 59 existing
core cases, 17 controller/view-model cases, 26 new storage cases, 15 new actual-
screen cases and 11 strict text-file boundary cases. There are 45 added cases
(26 storage, four controller and 15 screen). Two obsolete core expectations now
require typed read failures. The existing UTF-8 import fixture now returns its
acknowledged ID after spreading the request, matching the real adapter contract,
and asserts the successful import message. Reviewers must derive these counts
and ordered names independently before proposing controls.

The screen cases use production screen/controller/storage modules with a small
DOM fixture, fixed browser storage seams, deferred adapter acknowledgements and
disabled presentation timers. Browser preview checks remain unsupported or
explicitly skipped for unavailable hardware; no real audio device is exercised.
The retained original core tests include their existing synthetic DSP cases.
Real browser layout, focus, native persistence, physical audio and platform file
dialogs remain outside this selection.

The original complete-source audio HOLD remains unchanged. Native backup #85,
Service #86 qualified integration, queued Population Compare #88, Fleet timing
and release/hosting decisions remain separate. No permission, schema, default,
threshold, dependency, release or deployment change is included.
