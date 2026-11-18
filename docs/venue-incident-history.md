# Manual venue incident history

The Venue incidents panel records operator observations and the venue/setup
context selected at the press. History browsing does not acquire audio, infer a
diagnosis, or change a saved incident. Each row continues to use the names and
support-configuration ID saved with that report, even after catalog edits or
deletion. The table displays the recorded venue and setup names.

## Browsing

The production panel displays at most **100 records per page**. **Older** follows
the last displayed event, **Newer** returns through the visited page boundaries,
and **Newest** refreshes the first page. The label gives the navigation page
number, rows on that page, and total matching records; it does not claim stable
absolute row positions or a fixed number of pages while records are appended.

The venue selection filters history. The setup selection remains optional
recording context. Changing either selection starts history at the newest page;
after a successful save, the panel also requests the newest page. Navigation
preserves the selected venue/setup, notes for the next incident, and any pending
save's original ID, timestamp, note and context.

A failed navigation leaves the last loaded page visible with an error and a
retry for the failed boundary. The cursor stack is committed only when its
request succeeds. Selection changes, newer requests, hiding the panel and
disposal invalidate older responses. A detached retry cannot replace a newer
request. Returning to a hidden panel reloads its last committed page, unless a
save completed while hidden and reset it to newest. Injected stores exposing
only the existing `list` method keep their bounded history view without page
navigation controls.

## Store and native API

`createVenueIncidentStore().page(filter)` uses browser incident storage or the
native `venue_incident_page` command. The native command accepts `{ filter }`.
The page filter accepts only:

| Field | Meaning |
| --- | --- |
| `venueId` | Optional exact venue ID; omitted or `null` selects all venues. |
| `setupId` | Optional exact setup ID; omitted or `null` selects all setups. Both filters apply together. |
| `limit` | Integer from 1 to 500; omitted or `null` defaults to 100, matching the existing list API. |
| `before` | Omitted/`null` for newest, or `{ occurredAt, id }` identifying an exclusive older-page boundary. |

Cursor timestamps must be real canonical UTC times with milliseconds, such as
`2026-11-18T10:00:00.123Z`. Cursor IDs use the existing bounded ID rules and valid
Unicode scalars. Unknown fields, invalid dates, invalid IDs and invalid limits
fail before querying. The store copies the cursor before awaiting the bridge;
callers cannot alter an in-flight request by editing their input object.

The response is:

```json
{
  "items": [],
  "total": 0,
  "limit": 100,
  "hasMore": false,
  "nextCursor": null
}
```

`total` counts all records matching venue/setup, regardless of `before`.
`nextCursor` is the key of the last returned row only when older rows exist;
otherwise it is `null`. An exhausted cursor can therefore return no items with
a nonzero total. The bridge validates response counts, ordering, context,
provenance and cursor consistency and reports malformed data as a storage
error. Storage failures and invalid saved records are not replaced with an empty
history. Queries do not repair or rewrite retained data.

Both stores order by descending `occurredAt`, then descending incident ID.
Canonical UTC timestamps sort chronologically. The browser compares Unicode
scalars, matching SQLite's UTF-8 `BINARY` ordering, including non-BMP IDs and ID
prefixes. The exclusive key boundary means a newer append does not shift an
older-page request. Each request reads current data, not a session-wide snapshot;
the total may increase, and newly added records older than a boundary can appear
on later pages. Native count and row queries share one read transaction. The
browser retains its existing localStorage behavior and does not gain a
transaction across browser tabs.

The existing `save` and `list` contracts are unchanged. `list` still returns only
`items`, `total`, `limit` and `hasMore`, with its existing default and maximum
limits. Venue reports continue to request up to **300** incidents. Pagination
adds no table or migration and changes neither append-only save/retry semantics
nor browser workspace JSON export, which still excludes incidents.

## Bounded verification

The focused regressions use the production store to save and traverse more than
301 records, including equal timestamps and non-BMP IDs, and append a newer event
between page requests. They cover empty/exhausted and context-filtered histories,
strict request/bridge/storage validation, unchanged record bytes, the legacy list
shape, actual panel navigation, stale responses, retry ownership, hidden/disposed
panels and pending original saves. The existing venue-report tests check the
unchanged report integration.

Native tests live beside the production core. The standalone verification
harness copies that exact core and its test module, the database migration and
clock/ID helpers, and all **23** existing migrations. The harness removes the
Tauri import, narrows the database import to the clock helper and makes
`include_str!` paths absolute. This proof excludes Tauri's
command macros/adapters, `AppHandle`, `off_main`, database-path opening, the full
desktop build and real Chromium interaction. It does not establish hardware
qualification or cross-tab atomic persistence.
