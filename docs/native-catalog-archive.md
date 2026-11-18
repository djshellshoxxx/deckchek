# Native selected setup catalog files

The desktop **Data & backup** screen can export selected saved setups and their
complete referenced catalog records to a `deckchek-native-setup-catalog.json`
file. A destination installation previews that file before the operator chooses
**Add missing catalog records**. One SQLite transaction adds missing records;
conflicting saved values block the complete import. Existing rows are never
overwritten, deleted, rebound to another ID or repaired by the archive operation.

This format is separate from browser Equipment catalog files, browser
venue-history files, workspace JSON and the complete `.deckchek-backup` archive.
The full backup remains the database replacement path. Selected setup transfer
does not require Fleet to be enabled and does not change its default.

## Included graph

Every selected setup includes **all** its components. The archive follows every
declared parent reference, including a settings snapshot's actual owner asset,
an asset's saved Fleet position, and the location chain through position, booth
and venue. Shared parents are included once per table/ID. Hidden assets retain
their stored deletion flag, placement, public notes and rated life.

All columns in each of these ten tables are represented. Nullable SQL values
are explicit `null`; absent fields are invalid.

| Table | Preserved columns |
| --- | --- |
| `manufacturer` | `id`, `name`, `website`, `notes`, `created_at`, `updated_at` |
| `product` | `id`, `manufacturer_id`, `category`, `model`, `variant`, `revision`, `release_year`, `discontinued_year`, `region`, `description`, `source_url`, `created_at`, `updated_at` |
| `asset` | `id`, `product_id`, `nickname`, `serial_number`, `purchase_date`, `installed_date`, `retired_date`, `firmware`, `condition`, `notes`, `is_deleted`, `created_at`, `updated_at`, `rated_life_hours`, `deck_position_id`, `public_notes` |
| `venue` | `id`, `name`, `venue_type`, `city`, `region`, `country`, `notes`, `created_at`, `updated_at` |
| `booth` | `id`, `venue_id`, `name`, `indoor_outdoor`, `floor_type`, `stage_type`, `notes` |
| `deck_position` | `id`, `booth_id`, `name`, `orientation`, `distance_to_monitor_m`, `distance_to_sub_m`, `height_m`, `notes` |
| `support_configuration` | `id`, `deck_position_id`, `name`, `description`, `structure_json`, `approximate_mass_kg`, `coupled_state`, `notes` |
| `asset_settings_snapshot` | `id`, `asset_id`, `captured_at`, `tracking_force_g`, `anti_skate`, `arm_height`, `pitch_range`, `brake_setting`, `torque_setting`, `cartridge_alignment`, `input_gain`, `firmware`, `custom_json` |
| `setup` | `id`, `name`, `profile`, `venue_id`, `booth_id`, `deck_position_id`, `support_configuration_id`, `notes`, `created_at` |
| `setup_component` | `id`, `setup_id`, `role`, `asset_id`, `position`, `settings_snapshot_id` |

The incoming file must independently contain every required parent. A parent
already present at the destination does not excuse a missing incoming row.
Unknown tables, duplicate IDs, missing selected roots and unreachable injected
rows are rejected. Component arrays have no invented ordering authority: the
database stores their complete values and the export sorts by ID.

Unreferenced locations/assets, product specifications, device-profile bindings,
learned MIDI maps, measurements, incident/support history, maintenance and usage,
reminders, photos, calibration, app state and signing material are excluded.
They remain untouched by archive inserts. Imported assets can exist in Equipment
before they are associated with a Devices profile. Ordinary device-library
startup can subsequently update product metadata; the archive does not invoke
that synchronization to remove a conflict.

## Format and exact values

The envelope has exactly `format`, `formatVersion`, `exportedAt`, `setupIds` and
`tables`. The format is `deckchek-native-setup-catalog`, version is `1`, and
`exportedAt` uses canonical UTC with milliseconds. `setupIds` is nonempty and
contains distinct saved IDs. `tables` contains all ten arrays listed above.

Rust parses and serializes the fixed contract. Duplicate JSON keys are rejected
before any generic object could discard them. Unknown and missing envelope,
table and row fields, incompatible values and non-finite numbers are refused.
The file limit is **32 MiB of UTF-8**, total included row limit is **10,000**, and
JSON depth limit is **24**. Collection, parsing and output enforce bounds;
exceeding a limit never produces a shortened successful file. Diagnostics show
at most 100 entries per category and use bounded excerpts for long values.

The JavaScript bridge carries the file as raw text and validates only the small
native response summaries. It does not parse and stringify archive records.
SQLite signed 64-bit integers above JavaScript's exact-number range therefore
remain exact. Literal `structure_json`, `custom_json`, legacy record timestamp
spellings, nulls, empty strings and zero values remain unchanged.

The UI reads bytes, checks both the declared and actual file size, and uses fatal
UTF-8 decoding. Invalid byte sequences are refused. A legitimate U+FFFD character
is valid text. A byte-order mark is retained as a character rather than silently
stripped; the strict native JSON parser rejects a leading mark. SQLite BLOBs in
declared text columns, invalid UTF-8 and unsupported storage types are errors,
not lossy conversions to replacement text or null.

## Destination comparison

| Outcome | Action |
| --- | --- |
| Missing ID | Insert every recorded value. |
| Existing ID with identical values | Count as exact; perform no write. |
| Existing manufacturer/product ID with identical non-timestamp values | If only `created_at` and/or `updated_at` differ, count as a matching dependency and retain the entire destination row. The preview separately displays source and retained local timestamps. |
| Any other difference | Report a conflict and refuse every archive insert. |

The timestamp rule applies only to `manufacturer` and `product` at the same ID.
Name spelling, nullness, URLs, notes, category, revision and every other field
must match. It is not a seed-ID exemption. Independently initialized installs
can therefore transfer setups using matching seeded dependencies while keeping
their own dependency timestamps. Assets, venues, setups and snapshots receive
no timestamp exception. Source records and the selected file are not modified.

SQLite's actual `NOCASE` uniqueness rule governs manufacturer names. The archive
does not lowercase Unicode names, match different IDs by name, remap IDs, or use
`INSERT OR REPLACE`. Existing setups must also have the same **entire owned
component set**. An additional destination component, a missing member, changed
owner or changed component field blocks import even if the setup row is exact.

New component/snapshot and setup/support associations obey the existing native
catalog ownership guards. A snapshot must belong to its actual component asset;
a position-bound support must match the setup's selected position. An exact
unchanged destination legacy aggregate can remain as a no-write match. A new
incompatible association cannot be created on another installation. Export can
preserve such legacy rows, and destination preview explains the conflict.

Nullable venue/booth/position fields remain as saved. Contradictory location
chains are disclosed as context warnings without inventing a new placement
policy or filling absent context. Existing records cannot be relocated by import.

## Transactions, initialization and retry

The native commands use the database off-main lane and retain the `DbConn`
restore guard for the complete operation. Ordinary database initialization and
seed work precede the archive operation; validation baselines are taken after
that initialization. Export and preview then use consistent read transactions
and perform no archive writes. Import takes an immediate transaction, reparses
the copied text and repeats all file, schema, graph and destination checks before
inserting anything. A prior UI preview is never an authorization to overwrite a
changed destination.

The archive reuses the existing backup schema fingerprint, including columns,
indexes, foreign keys, collations and SQL constraints, with trusted-schema
protections. Unexpected columns, indexes or triggers are refused. Pre-existing
destination foreign-key damage is refused before an incoming parent could
silently repair it. Inserts follow dependency order and commit once. A later
constraint, busy, I/O or commit failure rolls back the transaction's inserts.
No migration, CRUD upsert, Fleet move, undelete or timestamp refresh is used.

If confirmation is lost after a commit, the panel retains the same copied raw
text and offers an explicit retry. The native operation revalidates it: identical
saved rows cause zero inserts, and retained timestamp-only dependencies remain
separately counted. After a full reload, choose the unchanged file again. The
panel never substitutes a later selection for a dispatched import.

File reads, previews, setup lists and downloads have lifecycle owners. Repeated
`onShow` is a no-op; a real hide/show retires stale reads and previews. A hidden
import continues and can display its acknowledged result when shown. Disposal
prevents late panel rendering. Native archive writes and existing backup,
restore and workspace operations share the Data screen's busy ownership; stale
button handlers cannot start a concurrent write. Names and filenames render as
text.

## Implementation and acceptance evidence

The [native module](../src-tauri/src/catalog_archive.rs) owns storage values,
closure, parsing, schema use and transactions. The [raw-text bridge](../app/native-catalog-archive.js),
[panel](../app/ui/workflows/native-catalog-archive.js) and
[Data screen](../app/ui/screens/data.js) own IPC summaries and interactions.
The [fixed source fixture](../tests/contracts/native-setup-catalog.json) records
all ten tables before production implementation.

Native inline tests compare every actual SQL column, exercise independently
seeded databases, every recorded non-time parent/leaf conflict, graph edges,
complete component sets, legacy associations, stale preview, late rollback,
strict JSON, invalid SQLite types, schema drift, bounds and zero-write retry.
[Bridge tests](../tests/native-catalog-archive.test.mjs) and
[actual Data handler tests](../tests/native-catalog-archive-ui.test.mjs) exercise
raw integers/text, UTF-8 file decoding, ownership and existing Data controls.
The [native-stub browser smoke](../tools/smoke/native-catalog-archive.mjs)
exercises actual file selection/downloads, reload/retry, escaping and phone width.

Execution evidence remains source-specific in the continuation reports. A bounded
native-core harness with real migrations and the actual schema guard does not
qualify Tauri dispatch, the full application/platform dependency graph, the real
restore gate, file dialogs, packaging or physical hardware. Hosted/browser and
platform results must be reported separately from authored or simulated coverage.
