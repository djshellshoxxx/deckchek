# Mapper browser data preservation

[Issue #82](https://github.com/djshellshoxxx/deckchek/issues/82) was found by static
review. The browser Mapper store caught read/parse errors as an empty list and
filtered invalid rows. A subsequent save or delete could replace the unreadable
or partially discarded collection. No actual user-loss incident or executed
baseline reproduction is claimed.

The successor treats only an absent key as a new empty store. Reads of malformed,
non-array, partially invalid or duplicate-identity collections raise a distinct
`MapperStorageError` (`MAPPER_STORAGE_READ`). Save and delete must complete that
read before writing, and do not filter or repair stored rows. Untouched rows keep
their unknown fields and future model versions; the existing newer-version
overwrite refusal and 50-model cap remain in place. Missing or blocked writes
cannot report success. Browser storage is resolved lazily so a throwing getter
does not prevent native operations.

The saved-mapping selector now distinguishes an unavailable list from an empty
one. A separate notice and Retry action remain visible while the current editor
can still be used. Open/delete are unavailable during loading or a read error;
failed saves keep the draft. A generation guard prevents an older native list
result from replacing a more recent refresh. Native command shapes, mapping
export formats, feature flags and permissions are unchanged.

Authored API regressions cover absent storage, malformed values, invalid/duplicate
rows, blocked reads/writes, throwing default getters, native bypass, future rows
and rereading before mutations. Actual-screen callback tests cover the persistent
error, retained draft, failed/successful Retry, genuine first save and stale native
read. Existing Mapper tests cover the cap, command contract and version mapping.
The first round-nine focused gate has now passed: 95 tests passed and one
optional Mixxx corpus case was skipped. All three workers completed their
independent reviews; see [the completed handoff](MAPPER_STORAGE_CONTINUATION_2026-11-21.md).
The earlier complete-source audio hold remains unchanged.

This change preserves bytes on refused mutations; it does not provide automatic
repair, restore corrupt data, or claim cross-tab transaction isolation. Recovery
is user-directed. Browser rendering and physical/native-app behavior require
their own hosted/platform evidence.
