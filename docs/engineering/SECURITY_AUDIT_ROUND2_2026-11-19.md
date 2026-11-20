# Security review, round 2: preset and media file boundaries

Date: 19 November 2026 (America/Los_Angeles).

Baseline: `4d3a53a08a43ab704a297be57ac63f5ce5f3b61a`.
This is a scoped independent review and regression repair, not an exhaustive
security audit or a release qualification.

## Independent acceptance reviews

The round 1 workspace patch was reviewed independently for its pre-read size
limit, strict UTF-8 decoding, and single parsed snapshot at the Data screen's
browser and native boundaries. No material defect was found in that scope.
The existing workspace code and tests were not changed or rerun by this worker;
the previous worker's execution evidence remains in
`SECURITY_AUDIT_2026-11-19.md`.

A separate read-only review covered the coordinator's new device/profile
assignment implementation, its browser storage boundary and UI, native command
registration, and SQLite transaction. No blocker was found within the specified
contract: explicit target/model confirmation; snapshotted source and target
identities; hidden/missing-unit rejection; stale-source/target rejection;
same-target retries without writes; and updates limited to the asset's product
association and timestamp. Historical run/map identifiers remain unchanged.
The browser storage comparison is not an atomic cross-tab transaction. Existing
maps with unknown/null identities still rely on the established mapping policy;
that limitation does not establish physical compatibility. This worker did not
execute native or browser tests for that feature, or edit its files.

## Reproduced import issues and repair

**Pre-gig availability and error handling:** the real preset-import handler read
the entire file through `File.text()` before the existing parser enforced its
256 KiB limit. A file-read rejection also escaped the handler's save-only error
catch. The reproduced failures occurred before any production edit.

**Media text integrity:** malformed UTF-8 inside an otherwise valid media JSON
name was decoded with a replacement character and passed to the store. This is
silent data substitution during a user-selected local import, not demonstrated
remote execution, disclosure, or a signature bypass.

Both handlers now use `app/text-file.js` to:

- Reject invalid or oversized declared sizes before reading, using each format's
  existing 256 KiB limit.
- Read one byte snapshot, require an actual `ArrayBuffer`, and verify its length
  against the declared size and cap before decoding.
- Decode UTF-8 with fatal error handling while preserving valid Unicode,
  literal replacement characters, and the existing UTF-8 BOM behavior.
- Leave schema validation with the existing format parser and avoid store calls
  when reading or decoding fails.

Pre-gig reports read failures in its existing notice. Media continues to use its
existing import-error panel. Neither format, its size limit, workspace handling,
native code, measurement policy, nor feature defaults changed.

## Verification

The initial real-handler reproduction produced **seven failures, zero passes**
against the unchanged baseline. It covered the missing preset pre-read limit,
uncaught read rejection, length mismatches, replacement decoding, invalid size
metadata, and the expected one-read byte path for valid input. Some assertions
exercise defensive file-like inputs; they do not imply browser `File` metadata
is attacker-mutable.

The final focused run passed **106 tests, zero failures, zero skips**, including
**11** new boundary tests. A real `Blob` regression checks UTF-8 BOM behavior and
the exact byte boundary. Existing pre-gig parser, workflow, and media-library
tests also passed.

```sh
node --test --test-concurrency=1 \
  tests/text-file-boundary.test.mjs \
  tests/pre-gig.test.mjs \
  tests/pregig-ui.test.mjs \
  tests/media-library.test.mjs
git diff --check
```

This worker did not run the full JavaScript suite, native build/tests, hosted
browser tests, or dependency advisory scanning. Those integration checks belong
to the coordinator and must use the combined source.

## Fresh-worker handoff

1. Independently review this patch on the integrated source. Keep archive and
   workspace BOM/parser semantics intact if reusing the helper elsewhere.
2. Investigate `app/ui/workflows/import-phone.js`: it already checks a 1 MiB
   declared-size cap but uses replacement-decoding `File.text()` outside a read
   error catch. Reproduce user-visible impact before extending this repair.
3. Investigate `app/ui/screens/verify.js`: file classification enforces existing
   JSON/HTML caps and native extraction has a separate boundary. Browser file
   reading still uses replacement decoding. Determine the effect on canonical
   payload verification before describing any integrity issue; none was
   demonstrated in this round.
4. Calibration JSON import still uses `File.text()` and no established import
   budget was found in the inspected boundary. Check the intended profile schema,
   native limits, and valid-file compatibility before proposing a cap. No new
   policy-derived limit was invented here.
5. Complete broader native/catalog and hosted browser qualification with the
   coordinator. Do not infer exhaustive security coverage from these scoped
   fixes or change hardware, measurement, or release gates to make tests pass.
