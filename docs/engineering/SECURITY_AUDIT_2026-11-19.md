# Security review: workspace file boundary

Date: 19 November 2026 (America/Los_Angeles).

Baseline: `8c43cf17e3d5f5067ece5667f1aec1540f4b4091` on `main`.
This is a scoped code review and regression repair, not a complete security certification.

## Confirmed issue and repair

**Medium: a selected workspace file was read before its resource limit was checked.**
Both the Data screen and the direct `importWorkspace(file)` entry point called
`File.text()` before the parser enforced its nominal 64 MB limit. Selecting a
large, untrusted file could allocate its entire contents before refusal. The
parser also measured UTF-16 code units, so multibyte text could exceed the stated
byte limit. Browser Data import read and parsed the same file a second time.
This is a local file import availability issue requiring file selection, not a
demonstrated remote execution or data disclosure vulnerability.

The same read used replacement decoding: malformed UTF-8 within otherwise valid
JSON could become a replacement character and be saved as different equipment
text without an error. This was reproduced separately from oversized input.

The repaired boundary:

- Checks the selected file's declared size before reading. The cap is
  `64 * 1024 * 1024` bytes; `MAX_WORKSPACE_CHARS` remains an alias for compatibility.
- Requires an `ArrayBuffer` whose actual size matches the declared size and stays
  within the cap.
- Decodes with fatal UTF-8 validation, then checks the UTF-8 byte size for direct
  text-parser callers as well.
- Parses once and supplies that validated snapshot to browser persistence or the
  native import confirmation. Browser mode no longer rereads the file.
- Rejects invalid size, truncated reads, invalid UTF-8, and invalid JSON before
  changing the working or saved workspace. Valid Unicode, including a literal
  replacement character and a UTF-8 byte-order mark, remains supported.

No workspace format version, native archive format, database migration,
measurement threshold, default feature flag, or native permission changed.

## Evidence

The initial nine-test reproduction against the baseline produced **eight
failures and one pass**. Failures covered pre-read size rejection, invalid size
metadata, changed byte length, malformed UTF-8, the multibyte byte cap, and the
browser's duplicate reads. The existing read-error/invalid-JSON preservation
case already passed.

The final focused scope passed **115 tests, zero failures, zero skips** using
Node **22.23.4**. It includes all **11** new boundary tests and the existing native
Data busy-state, cancellation, stale-read, and confirmation regressions. Existing
text-only file stubs were changed to byte-reading file stubs; their assertions
were retained.

```sh
node --test --test-concurrency=1 \
  tests/workspace-file-boundary.test.mjs \
  tests/backup.test.mjs \
  tests/backup-ui.test.mjs \
  tests/native-catalog-archive-ui.test.mjs \
  tests/regressions.test.mjs \
  tests/core.test.mjs
git diff --check
```

This worker did not execute the full JavaScript suite, browser automation, native
Rust tests, dependency advisory scanning, or hosted CI. Integration qualification
belongs to the coordinator and must use the combined source.

## Other reviewed boundaries

The review traced backup archive entry-name checks, streamed size/checksum
verification, restored photo validation, native catalog import validation and
parameterized writes, Tauri capabilities, external-link policy, selected report
escaping, and certificate/ledger JSON embedding. No additional reproducible
defect was established within those inspected paths. Those reads do not establish
complete coverage of every command, renderer, archive format, or filesystem race.

## Fresh-worker handoff

1. Review this change independently on the integrated source, especially the
   browser/native Data entry points and the separation between parsing and applying
   a snapshot. Preserve the existing cancellation and busy-state guarantees.
2. Audit other file readers (`calibration`, `media`, presets, and certificate
   verification) for limits enforced only after `File.text()` and for replacement
   decoding. Treat these as investigation targets until their complete boundary
   and impact are reproduced; this patch deliberately owns the workspace path.
3. Continue native backup/catalog and user-file testing on a runner with the Rust
   and Tauri prerequisites. This worker made no Rust changes and did not substitute
   JavaScript tests for native execution.
4. Keep Fleet off by default and preserve the existing hardware and measurement
   qualification gates. No release, deployment, branch deletion, or policy change
   was performed by this worker.
