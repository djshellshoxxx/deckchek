# Browser venue-history archive

**Data → Browser venue history file** transfers complete retained manual incidents,
support observations and support comparisons between browser stores. Export reads
all retained records in those three collections. Incident pages, venue reports and
Support A/B history display limits do not cap this archive.

Choose a file to validate it and preview its counts, exact matches, new records
and conflicting IDs. Nothing is written during selection or preview. **Import
this archive** performs a fresh preflight and then appends missing records. A
completed import can be re-exported, and reimporting an unchanged file does not
rewrite records already present.

This archive is separate from workspace JSON version 1 and the desktop database
backup. It does not include current editable venues, setups, support descriptions,
assets, ordinary workspace runs, application settings or the calibration registry.
Complete calibration snapshots already attached to support observations do travel
with those observations. No native command, database migration or existing backup
format changes are introduced.

## Envelope and bounds

The version-1 envelope has exactly these six fields:

```json
{
  "format": "deckchek-venue-history",
  "formatVersion": 1,
  "exportedAt": "2026-11-18T14:00:00.000Z",
  "incidents": [],
  "supportObservations": [],
  "supportComparisons": []
}
```

Unknown envelope fields, unsupported versions, noncanonical UTC export times and
non-array collections are rejected. The file is limited to **32 MiB of UTF-8** and
**10,000 records total** across its three collections. File size is checked before
reading, text size before parsing, and serialized output size before download.
Finite, acyclic JSON and a maximum nesting depth of 24 are required; the existing
per-observation bounds and versioned analysis validation also apply. Sparse
programmatic arrays cannot silently become null records.

Strict browser readers also stop when either history store exceeds 10,000 records
or 32 MiB of raw stored record text, so source and target preflight cannot collect
unbounded record bodies. The incident and support stores are read separately;
the final envelope still has the combined 10,000-record/32-MiB limits. Exceeding
any bound aborts the operation. It does not truncate an export, prune retained
history, partially accept an input file or change a record to make it fit.

The archive is a collection of saved values. Collection array order is not a
timeline or a proof of acquisition order; original record times remain the
history ordering evidence. Object property order is irrelevant to equality.

## Saved evidence and graph validation

Validation reuses the incident and support models' saved-record validators. An
additional complete-saved-form check ensures that validation does not normalize
the supplied record into a different value. For example, an empty incident note
cannot silently become null, missing nullable fields cannot be invented, and
noncanonical negative zero cannot silently become positive zero. Such inputs fail
instead. Ordinary save/draft normalization keeps its existing behavior.

The archive preserves original IDs, occurrence/capture/persistence times,
operator origin, context snapshots, literal structure JSON text, allowed legacy
metadata, calibration snapshots and rejection reasons, PSD ordinates, segment and
linear powers, zero measurements, unavailable logarithms, uncertainty fields and
`contextIssues`. It does not call ordinary save, assign new times, read current
catalogs, resnapshot names, sanitize numbers or derive a replacement record.

Support comparisons are stored as their base saved records, without the embedded
observation copies used by history-list responses. Every comparison must have
both of its original observations in the same archive. The existing method,
algebra, ordered-pair, comparability-reason and derived-delta checks apply. A
missing original, malformed method, inconsistent algebra or forged result blocks
the whole archive before any write. Rejected or zero-power observations remain
valid original evidence when their saved shape is valid; they retain their
non-comparable conclusions.

Incident IDs form their own namespace. Support observations and comparisons share
one namespace. Duplicate IDs within a collection, duplicate support IDs across
its two kinds, and unencodable incident storage IDs are rejected. An incident ID
may equal a support ID because their stores are independent.

An exact target duplicate must equal the **complete saved value**, including
`recordedAt`, `contextIssues`, result fields and allowed metadata. A record with
the same submitted measurement but a different persistence time is a conflict.
An observation ID already used by a comparison is also a conflict. Import never
chooses one record over another and never overwrites a conflicting ID.

## Preflight, append order and interrupted imports

Preview and import each validate the complete incoming archive and both complete
target history stores. Invalid JSON, malformed or corrupt source/target records,
unavailable or changing key enumeration, read failures and conflicts abort before
any write. A corrupt target is not repaired by importing replacement evidence.
Stored bytes remain untouched on a preflight failure.

The import preflight is fresh even if a preview was shown earlier. Restore plans
retain copied original records. They read the target once, then recheck each ID
immediately before a synchronous append. Missing observations are restored before
comparisons; each comparison also rechecks its exact original observations. This
avoids rescanning all history for every appended record while retaining strict
validation and referential ordering.

The import is **resumable and append-only**, not a transaction across localStorage
keys. It stops on the first write/recheck failure and reports:

| Field | Meaning |
| --- | --- |
| `completed` | New writes confirmed during this attempt. |
| `alreadyPresent` | Exact matches found in preflight, adjusted by immediate ID rechecks. A failed recheck is no longer counted as an exact match. |
| `remaining` | Archive records not yet confirmed as added or already present. This includes the failed record when its outcome is uncertain. |
| `failure` | The stopped record's kind, ID and error message. |

Successful earlier records remain stored. Import never rollback-deletes them or
prunes older records. Reimporting the unchanged file after reload or a lost
response checks those exact values again, skips matches without a write and
continues with missing records. If the controller cannot confirm the returned
outcome, it says so instead of inventing progress counts.

There are no asynchronous gaps inside the production preflight/write batch.
Immediate ID checks protect competing requests in one JavaScript event loop.
localStorage does not provide a compare-and-set transaction across tabs that
deliberately share new IDs, and this feature makes no cross-tab atomicity or
session-wide snapshot claim.

## UI ownership and historical context

File reads and previews belong to their selected-file generation. New selection,
hide/show and disposal retire stale results and errors, including an earlier
preview of the same file. Retired retry controls cannot act on a new selection.
Exports that finish reading after the screen is hidden do not start a download.

Once **Import** dispatches, its copied original file remains owned through
hide/show. Selection and duplicate import presses are blocked while that attempt
is pending. A partial import or lost response offers **Retry this unchanged
archive**. Disposal prevents late UI rendering while already-dispatched writes
remain intact. File names and conflict IDs render as text. Conflict previews show
at most 20 IDs with a disclosed total; every conflict still blocks import.

The existing incident and support panels can show imported history with all
venues selected, even if current catalogs were deleted, renamed, moved or never
created in this browser. Reports require a current venue with the matching ID.
The archive does not manufacture current catalog entries or relabel old context.

Structural and comparison-consistency checks do not authenticate the recorder or
establish the accuracy of physical measurements. The saved method, unknown
uncertainty, operator provenance and `rawAudioRetained:false` remain unchanged.

## Production API and focused proof

`app/venue-history-archive.js` exposes:

- `parseVenueHistoryArchive(text)` and `serializeVenueHistoryArchive(value)` for
  strict, bounded format handling.
- `createVenueHistoryArchive({ storage, now })`, with synchronous `exportArchive`,
  `preview` and `importArchive` methods operating on browser history only.
- Preview counts, exact-match/new-record counts, conflicts and `canImport`.
- A complete or partial import result with the progress fields above. Preflight
  errors throw before entering the write loop.

The existing stores add `readArchive` and `prepareArchiveRestore` seams and expose
strict saved-record validators. They retain ordinary save, list/page, native
bridge and comparison behavior. The Data integration is browser-only; native
Data continues using its complete database backup.

Focused tests use the actual model, browser stores and Data controllers. They
include 302 incidents, 102 observations and 101 comparisons, an oldest observation
referenced beyond every view limit, exact Unicode/context/calibration/zero-value
preservation, zero-write reimport, persistence-metadata and cross-kind conflicts,
malformed complete-file rejection, corrupt source/target bytes, first/middle/last
quota failure and resume, stale file/preview/retry handling, hidden/disposed
imports, blocked storage and unchanged workspace-v1 parsing. Existing incident,
support and Data regressions cover the neighboring contracts. Hosted Chromium
smoke remains a separate gate; these checks do not qualify hardware behavior.
