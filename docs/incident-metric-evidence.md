# Selected live-monitor snapshots for venue incidents

The desktop Incidents panel can save one existing live-monitor frame with a new
operator incident. **Attach latest live-monitor reading** defaults off. The
operator explicitly selects the deck/input associated with the chosen
venue/setup. A displayed device label, input pair, logical generation or monitor
session ID does not establish physical identity or location.

This feature copies metadata already produced by the monitor. It acquires no
capture lease, opens no input, changes no detector or threshold, and retains no
PCM. It does not collect a pre/post interval or establish a physical cause.
The ordinary incident buttons remain usable with the attachment off.

## Selection and timing

An eligible source is a currently running stream generation with a nonempty
stereo callback received after startup. Starting, stopping, retrying,
disconnected, preempted and stopped sources cannot supply a snapshot. Every
stream open gets a new logical generation. Observed sample-rate replacement and
changes to relevant monitor settings retire the displayed choice until another
frame arrives. A same-name reopen requires explicit reselection. Late callbacks
from an older stream are ignored before they can change the current analysis.

The source chooser displays the device label, deck, channels, timecode format,
generation, observation UTC time, actual input sample rate and receipt age at
the last refresh. **Refresh available readings** updates that display. Pressing
an incident button reads the selected generation again and freezes its latest
existing frame synchronously, alongside the original incident ID, time, notes
and catalog context, before a storage await. A retired selection produces an
error. The operator can choose a current generation or explicitly turn the
attachment off; the application never silently saves only the incident after
an attachment was requested.

`observedAt` is the callback's host wall clock in canonical UTC milliseconds.
`pressAt` is the ordinary incident occurrence time. `sampleTimeSeconds` is the
monitor's existing sample/session clock. `ageMs` is the monotonic difference
between callback receipt and the press. It is **receipt age**, not ADC
acquisition age or synchronization with the physical incident. A wall-clock
adjustment does not change the stored observation time or generate a negative
age. Missing, nonfinite, backward or overflowing monotonic timing yields
explicit `null`; an unusable observation UTC clock makes that frame ineligible.
There is no scientific freshness threshold or promise of maximum acquisition
age. Empty callbacks cannot redate a prior reading.

The controller retains only one bounded metadata copy per deck. Public frame or
configuration views cannot mutate that copy. The saved configuration records
the settings actually applied to the session's analysis engines. A later
settings save affects subsequent engine construction; it does not rewrite an
existing pending snapshot's configuration.

## Versioned evidence contract

Schema version is `1`; method is `live-monitor-latest-frame-v1`; association is
`operator-selected`. The complete normalized `{ input, evidence }` submission
has a **32 KiB UTF-8 encoded bound**. Exactly one frame is accepted. Unknown or
missing evidence fields, malformed enums, nonfinite numbers, invalid
timestamps and inconsistent unavailable fields are rejected. Nullable evidence
fields must be explicitly present. IDs are bounded to 128 Unicode characters;
the captured device label is at most 200. Counts fit JavaScript's exact integer
range. Source channels are consecutive, start on an odd channel from 1 through
65535, and stay within 65536 channels. These are resource/representation bounds.

| Group | Saved fields |
| --- | --- |
| Parent | `incidentId`, `pressAt`, and the complete original normalized v1 incident submission retained inside the native companion row. |
| Source | Logical `generation`, deck A–D, nullable device label, first/second input channels, one existing supported timecode format, nullable persisted monitor session ID. |
| Timing | `basis: host-callback-observation`, callback `observedAt`, nullable frame sample clock in seconds, nullable monotonic `ageMs` at the press. |
| Configuration | Monitor settings version 1, actual observed sample rate, configured hop, existing 0.5 s phase/SNR analysis window, 60 s baseline parameter, nominal 33.333333 RPM, the existing threshold settings and alert cooldown. |
| Values | The fixed fields below, existing dropout count, lock, motion, direction and monitor state. No alert arrays, minute rows, arbitrary frame properties or raw audio. |
| Availability | An ordered list of unavailable numeric fields. Null fields and initial hum placeholders must be disclosed consistently. |
| Loss | Nullable callback-reported dropped blocks, controller dropped blocks and dropped log events at observation. These counters do not establish complete physical observation. |

### Values and units

Finite values, including negative SNR, retain their numeric precision. No new
rounding, thresholding or derived measurement is applied to stored values.
JSON number representation is used throughout. The monitor's different metrics
do not all share the recorded phase/SNR acquisition window.

| Field | Meaning and unit |
| --- | --- |
| `levelDb` | Existing digital level, dBFS. |
| `snrDb` | Existing carrier/residual SNR, dB; finite negative values remain negative. |
| `carrierHz` | Existing carrier estimate, Hz. |
| `speedPct` | Existing speed deviation, percent. |
| `phaseDeg` | Existing L/R phase, degrees. |
| `jitterDeg` | Existing phase jitter, degrees. |
| `balanceDb` | Existing L/R balance, dB. |
| `driftDeg` | Existing quadrature error, degrees. |
| `humDb` | Existing hum power after local-floor correction, dBFS. |
| `humFloorDb` | Existing local hum floor, dBFS. |
| `mainsHz` | Selected 50 or 60 Hz bin, or unavailable. |
| `dropouts` | Existing count over the saved `dropoutSpanSec` interval. |

Only the producer boundary turns nonfinite engine values into explicit `null`
and lists them as unavailable. Stored-input validation rejects nonfinite values
instead of sanitizing them. The engine initially has finite hum floors before
its hum buffer fills, with `mainsHz: null`. Those raw finite values may remain
in JSON, but `humDb`, `humFloorDb` and `mainsHz` must all be marked unavailable.
The panel and report display **unavailable**, never a measured absence of hum.
If all eleven numeric metric fields are unavailable, the display explicitly
says the snapshot contains no valid numeric metric observations. Lock, motion,
direction, state and dropout count retain their separate existing semantics.
These digital quantities are not calibrated SPL or acceleration.

## Native atomic persistence and retry

Migration `0025_incident_metric_evidence.sql` adds
`venue_incident_metric_evidence`, keyed by the original incident ID. Its only
foreign key references the parent incident with deletion restricted. It has no
foreign key to the catalog or monitor logs. Monitor retention and catalog
rename/removal therefore do not delete or reattribute the saved evidence.
All earlier migrations and the v1 incident table remain unchanged.

| Command | Arguments | Result |
| --- | --- | --- |
| `venue_incident_save_with_metric_evidence` | `{ input, evidence }` | `{ incident, evidence }`, both complete saved records. |
| `venue_incident_metric_evidence_get` | `{ incidentId }` | Exact saved parent plus its complete evidence, or explicit `evidence: null` for an ordinary incident. A missing parent or damaged pair is an error. |
| `venue_incident_metric_evidence_summaries` | `{ incidentIds }`, at most 300 distinct bounded IDs | One result per requested ID in that order; exact saved parent plus a compact evidence summary omitting the full configuration. Absence is explicit `null`; missing/damaged records are errors. |

All commands use the application's `db::off_main` execution lane and
restore-guarded `open_database`. The combined save validates both inputs, then
uses one immediate transaction. For a new pair it validates the current
venue/setup association, inserts the v1 parent through the shared transaction
helper, inserts its companion, and commits once. Either both rows commit or
neither does, including a failed companion insert or commit.

The companion stores the original normalized incident and evidence together,
plus the original shared save time. Exact retry compares both original
submissions and their saved binding before consulting any current catalog
context. Both already existing and matching returns the original pair without
writes. A different incident or snapshot, a one-sided pair, or an existing
ordinary incident without evidence produces a conflict/error. A later sample
cannot be attached to an older manual incident through retry.

The panel retains the frozen pair under the existing single pending owner.
Repeated presses cannot create another write while it is pending. Selection
changes, navigation, hidden panels, disposal, source loss and later monitor
frames cannot retarget it. A lost acknowledgement retries exactly that pair,
including its original time, settings, source and age. Native errors have no
browser-storage fallback. The old `venue_incident_save`, `list` and `page`
arguments and response shapes remain unchanged.

## Detail, download and reports

Each native history row has **View saved reading**. Detail is a separate read;
it displays the saved source/timing, finite values with units, unavailable
fields, configuration and loss counters. Labels and notes render as text.
**Download saved incident and snapshot (JSON)** exports the complete saved pair
already read, including the full settings and original unavailable placeholders.
Read errors are shown and retryable; they never become an absence message.
Hidden, retired and disposed detail requests cannot render newer state.

The JavaScript bridge validates that detail and summary responses contain the
exact saved parent originally requested, including immutable context and save
time. A restore between loading an incident and reading its companion must not
silently substitute a different parent. Native reads also compare the companion's
persisted original parent with the current parent under one read transaction.

Hum and Equipment venue reports retain the **300-incident limit** and fetch
only compact summaries for those selected IDs. They distinguish checked
absence, browser unsupported, legacy callers that did not load snapshots, and
read failure. A read failure aborts report preparation. Reports do not load
arbitrary monitor history or every complete snapshot configuration.

Complete native database backup/restore includes the new table and both exact
records. The native setup-catalog archive still transfers only its selected
catalog graph. Browser incident storage and browser venue-history archive v1
stay unchanged; browser live capture is unavailable.

## Verification boundaries

Dedicated contract, actual-controller, actual-panel and report tests cover
explicit selection, fixed values, unavailable hum, clock changes, source
retirement/reopen, stale callbacks, rate/settings changes, no capture side
effects, exact retries, parent binding, escaped display, full downloads and
bounded report errors. The controller performance regression uses the existing
10-minute synthetic 48 kHz proxy and the same time/heap budgets as FS-31.

Native tests exercise the actual core, all migrations through 25, second-insert
and deferred-constraint commit failure, corruption, concurrent writers,
additive/idempotent upgrade, and the real backup/restore implementation including
restore rollback and capture exclusion. The bounded local harness copies the
actual incident/catalog core tests, migration runner, backup schema/archive
core, capture restore reservation, photo guard and validator, with application
locked dependencies. Its Tauri adapters, full desktop build and physical
capture remain outside that harness's claim. The UI smoke at
`tools/smoke/incident-metric-evidence.mjs` uses generated PCM and mocked native
responses; it is separate from SQLite and real-device qualification.

The completed software scope is one optional selected native monitor snapshot.
Surrounding capture windows, other analysis producers, browser capture, physical
identity, calibrated measurements and causal/hardware repeatability remain
separate capabilities and qualification work.
