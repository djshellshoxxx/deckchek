# Browser Equipment catalog archive

The **Data & backup → Browser Equipment catalog file** card transfers the six
editable Equipment catalog collections, their setup components and retained
catalog metadata between browser installations. It adds missing records by
their original IDs. A different saved record with the same ID blocks the entire
import; this version has no overwrite, name-based deduplication or ID-remapping
mode.

This is a separate file from [workspace JSON](specs/08-backup-restore.md) and the
[venue-history archive](venue-history-archive.md). The native complete-database
backup keeps its existing behavior. No native command, migration, measurement
method or feature-flag default is changed.

## Operator flow

1. In the source browser, open Data & backup and choose **Export Equipment
   catalog**. Export includes all retained records, including assets hidden by
   retirement/deletion flags.
2. In the destination browser, choose that file. The preview validates the whole
   incoming graph and current catalog without writing. It reports record counts,
   exact matches, new records, opaque catalog metadata, conflicts and unresolved
   reference IDs.
3. Review saved booth/position/settings references and any legacy support-position
   mismatch. Their original IDs remain intact; the browser has no authoritative
   records with which to validate or restore their contents.
4. Choose **Import this catalog**. Import recalculates the complete preview and
   writes the combined catalog once if it can add anything. Conflicting or
   invalid data prevents that write.
5. Open Equipment to view the imported records. If confirmation was interrupted,
   retry the unchanged file. After a full reload, select that file again. An
   unchanged destination reports exact matches without a write.

The current catalog is editable. An operator or device-library synchronization
can change a previously imported row. Reimporting the older file then reports a
conflict rather than replacing the new value.

## Format and bounds

The four envelope fields are required; additional envelope fields are rejected:

```json
{
  "format": "deckchek-catalog",
  "formatVersion": 1,
  "exportedAt": "2026-11-18T14:00:00.000Z",
  "catalog": {
    "manufacturer": [],
    "product": [],
    "asset": [],
    "setup": [],
    "venue": [],
    "supportConfiguration": []
  }
}
```

All six named arrays are mandatory in a file. An older stored browser catalog
may omit a collection that did not exist when it was written; the export treats
that missing collection as empty. A malformed existing collection is an error.

Additional keys inside `catalog` are retained as **opaque catalog metadata**.
They are not registered as entities or used to resolve relationships, even if
named `booth` or `settingsSnapshots`. Import adds an absent metadata key, keeps an
exact existing value, and blocks on a different existing value.

The file, complete raw browser catalog value and proposed merged storage value
are each bounded to **32 MiB of UTF-8**. The six collections plus their embedded
setup components are bounded to **10,000 records**. Opaque metadata is subject to
the byte and depth bounds. JSON nesting is bounded to depth 24. These are
engineering limits for this format, not a promise of browser storage capacity;
the browser can reject a smaller write because of its quota or storage policy.
Exceeding a bound rejects the whole operation without trimming data.

`exportedAt` must be a valid canonical UTC timestamp with milliseconds. Existing
record timestamps retain their original text. The archive does not assign new
record IDs, timestamps, deletion states or support fields.

## Saved values and graph validation

The implementation validates known field types and required identities while
preserving every valid unknown record/component field. Optional absence and
explicit `null` remain different. Literal `structureJson`, component order,
retirement metadata, Unicode, zero values and saved legacy fields survive.
`structureJson` is carried as text; it is not parsed or used to infer links.

Inputs must consist of finite, acyclic plain JSON values. Values that would be
lost or changed by JSON serialization are rejected, including negative zero,
non-finite numbers, sparse arrays, extra array properties, non-enumerable or
symbol properties and accessor properties. Programmatic object validation never
evaluates a supplied accessor. Object-key ordering does not affect exact-match
comparison, while array order remains significant.

Known relationships must be complete within the incoming file itself:

| Saved relationship | Required parent collection |
| --- | --- |
| `product.manufacturerId`, when non-null | `manufacturer` |
| `asset.productId`, when non-null | `product` |
| `setup.venueId`, when non-null | `venue` |
| `setup.supportConfigurationId`, when non-null | `supportConfiguration` |
| Every `setup.components[].assetId` | `asset` |

Import cannot fill a missing incoming parent from a coincidentally matching
destination record, a historical snapshot or a display name. The complete target
and proposed merged graph are also validated. Missing parents produce an error
identifying the referring record. The source is left unchanged so its catalog
can be repaired through the appropriate existing workflow.

IDs must be non-empty strings; valid legacy IDs need not be UUIDs. Each of the six
entities has its own identity namespace. Component IDs have a shared namespace
across all setups and cannot be moved to another setup by import. Duplicate IDs
inside a collection, duplicate component identities and conflicting component
ownership reject the operation.

## References the browser cannot resolve

The following retained fields refer to records whose authority is currently
native-only:

| Saved field | Unavailable browser authority |
| --- | --- |
| `setup.boothId` | Booth record and venue ownership |
| `setup.deckPositionId` | Deck-position record and booth placement |
| `supportConfiguration.deckPositionId` | Deck-position binding |
| Retained `asset.deckPositionId` | Fleet placement record |
| `setup.components[].settingsSnapshotId` | Asset-settings snapshot contents and ownership |

Preview counts distinct IDs within each authority type and lists reference
occurrences separately. It does not treat an opaque catalog bucket, audio
calibration profile or workspace equipment item as one of these authorities.
Diagnostic locations use indexed catalog paths. Component-owner conflicts and
shared support-position mismatches point to the owning record or field instead
of repeating a long saved value for every referring setup/component. Full IDs
remain unchanged in saved records and reference details; this prevents derived
preview text from multiplying one large source field.

An existing support-position mismatch is retained and listed as a legacy
binding requiring review. Import does not erase it or treat restoration as a new
support assignment. Existing setup editing still prevents a bound setup from
changing venue and prevents replacement of a component's asset while retaining
the former asset's settings-snapshot association. Subsequent capture validation
and comparability rules retain their existing behavior.

## One storage write and failure handling

The six collections and other browser working data share `deckchek.catalog.v1`.
The archive uses strict, lazy snapshot/commit access rather than ordinary catalog
`upsert()` or filtered `list()` calls. A missing key is an empty catalog; blocked
storage, failed reads, malformed JSON or invalid saved records are explicit
errors. They cannot become a successful empty export or overwrite corrupt data.

The merge preserves every destination sibling outside `state.catalog`, including
`runs`, `alignments`, `deviceProfiles`, `productSpecs`, `deviceResults`, `midiMaps`
and valid unknown siblings. Other storage keys remain untouched. Their stored
values are not included in this catalog file.

After all validation, conflict checks and merged-size checks, import rereads the
entire original raw value immediately before a single `setItem()`. A changed value
aborts with no archive write. Exact records and exact opaque metadata alone cause
no write. No per-record save, rollback deletion or partial-record import is used.

The [HTML Storage algorithm](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface)
checks whether a new value can be stored before replacing the key's value.
Thus a quota rejection retains the previous value, while a completed write holds
the complete staged merge. This does not provide cross-tab compare-and-swap: the
standard explicitly leaves locking between browser agent clusters undefined.
The reread guard applies within one synchronous JavaScript operation. A lost
acknowledgment is resolved by reading and checking the unchanged file again.

## Device-library startup boundary

This file does not transfer device-profile bindings, product specification caches,
saved device-test results or learned MIDI maps. Those destination siblings retain
their existing values during archive import.

Startup's existing `ensureLibrary()` → `syncDeviceProfiles()` path chooses one
product binding for each shipped device profile and can update matching product
descriptions and timestamps. That writer is unchanged by this feature.

For example, a source asset can refer to `source-product`, while the destination
already binds the same displayed model to `destination-product`. Import preserves
both IDs and retains the source asset's original `productId`. Equipment can show
the imported unit, while Devices can continue to use the destination's existing
binding. Equal model names are not authority to rewrite IDs or historical links.

A custom imported graph survives store recreation and an unrelated device-library
sync unchanged. A matching imported product can later be updated by startup sync;
reimport then correctly reports a same-ID conflict. The archive promises exact
transfer, not that the editable catalog remains unchanged after other workflows.

## Relationship to venue history

The venue-history archive carries immutable captured context; the catalog file
carries current editable context. Importing a current venue with the same ID
allows existing venue reports to find that venue while continuing to display
the original incident/support snapshots. No historical record is rewritten or
reinterpreted. Structural validation of either file does not authenticate the
recorder or establish physical measurement quality.

## Implementation and qualification

- [Archive engine](../app/catalog-archive.js) validates saved values, graphs,
  bounds and conflicts and stages the additive merge.
- [Catalog storage seam](../app/catalog-store.js) owns strict lazy reads and the
  final conditional one-key write; ordinary CRUD is unchanged.
- [Catalog panel](../app/ui/workflows/catalog-archive.js) and
  [Data screen](../app/ui/screens/data.js) own file selection, preview, explicit
  import, retry and asynchronous result ownership.
- [Model tests](../tests/catalog-archive.test.mjs),
  [actual-handler tests](../tests/catalog-archive-ui.test.mjs) and the
  [saved graph fixture](../tests/contracts/catalog-archive.json) exercise the
  boundaries above, actual startup synchronization and existing venue reports.

Selected-file generations retire stale reads/previews after selection changes,
hide/show or disposal. A dispatched import keeps its copied original file across
hide/show and lost acknowledgments. Old retry buttons cannot act on a new file;
disposed controllers do not render late results. File names, conflicts and
reference details render as text.

Automated memory-storage and DOM-handler checks are software proof. Actual
Chromium file downloads, layout and persistent-browser execution remain separate
hosted qualification. This feature adds no full-native, platform or hardware
qualification claim.
