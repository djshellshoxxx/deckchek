# Spec 23: Venue Fleet Dashboard

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: `0017_fleet_dashboard.sql`. Milestone: M7. Size: L. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

## 1. Summary and Goals / Non-goals

A dashboard for people who maintain many decks and mixers across venues. It builds on the existing `venue -> booth -> deck_position -> asset/setup` schema and shows a fleet grid with last-tested date, health status and failing items, time- or hours-based maintenance reminders surfaced at app start, a maintenance events log, CSV export and a printable booth sheet.

Goals: answer "what needs attention this week?" in one screen, offline. Non-goals: remote monitoring, live telemetry from venues, multi-user accounts, spare-parts inventory, replacing SPEC-05 environmental diagnostics (this links to them).

## 2. Users & user stories

Venue tech / AV manager, touring DJ with several kits, school or rental shop.

AC-1 Given venues, booths and positions exist, when the dashboard opens, then a grid lists every asset with venue, booth, position, last tested date, health, failing items count.
AC-2 Given an asset has no test results, then health is "Never tested" (neutral), not "Healthy".
AC-3 Given an asset's most recent device test run has any `fail`, then health is "Attention" and the failing test names are listed; if only `unknown` or stale, "Review".
AC-4 Given a reminder "every 90 days", when 90 days have passed since the last completing maintenance event, then it is shown Overdue; 14 days before it is "Due soon" (tunable).
AC-5 Given an hours-based reminder ("every 500 h"), then accumulated hours (sum of session durations on that asset plus manually entered hours) are compared with the threshold.
AC-6 Given reminders are due, when the app starts, then a non-blocking summary banner and badge appear; dismiss snoozes 1 day without deleting.
AC-7 Given the user logs a maintenance event marked "completes reminder X", then X's next due date resets.
AC-8 Given filters, when "Export CSV" is used, then the file contains exactly the filtered rows, RFC 4180 quoted, UTF-8 with BOM for Excel.
AC-9 Given a booth, "Print booth sheet" yields a one-page printable layout with its positions, assets, serials, last tested, next due, and a blank notes box.

## 3. UX

Entry points: sidebar "Fleet"; startup banner; Equipment row > "Place in venue".
Screens: (1) Fleet overview: summary tiles (Attention N, Overdue N, Due soon N, Never tested N), filter bar (venue, booth, category, status, text), grid with sortable columns: Asset (nickname + model), Location (Venue / Booth / Position), Last tested, Health, Failing items (chips, max 3 then "+n"), Next due. Row click opens a side panel: recent results, reminders, events, "Run tests", "Log maintenance". (2) Venues tree editor: add/rename/move booths and positions, drag asset to a position (also a "Move to..." menu for keyboard users). (3) Reminders manager: templates per product category (e.g. "Clean faders every 180 days", "Stylus check every 300 h") plus custom. (4) Events log: filterable timeline, add event form. (5) Booth sheet preview with Print / PDF (spec 03; browser print fallback via `@media print`).
States: empty ("Add your first venue" with 3-step guide), loading skeleton rows, success, partial (some assets unplaced: "Unplaced" group), error (retry), offline (n/a), unsupported (asset lacks a profile: tested date from sessions only, no failing items).
Copy: Startup banner "3 maintenance items need attention: 1 overdue, 2 due soon. Review". Colours paired with icons and words.
Shortcuts: / focus filter; E export CSV; N new event; arrow keys navigate grid (grid role with roving tabindex). Accessibility: `role="grid"`, sortable headers with `aria-sort`, banner `role="status"` (not alert, to avoid stealing focus), print stylesheet high contrast.

## 4. Architecture

New: `app/fleet.js` (pure: health, reminder due calculation, CSV), `app/ui/screens/fleet.js`, `app/ui/screens/fleet-venues.js`, `app/ui/booth-sheet.js`, `src-tauri/src/fleet.rs`.
Rust commands: `fleet_overview({venueId?, boothId?, filters}) -> {rows:[{assetId, nickname, productName, venue, booth, position, lastTestedAt, health, failing:[{testId,name}], nextDueAt, hoursTotal}], tiles}`; `fleet_place_asset({assetId, deckPositionId|null})`; `venue_upsert/booth_upsert/position_upsert` and `*_delete` (delete blocked if assets are placed unless `moveTo`); `reminder_upsert(input)`, `reminder_list`, `reminder_snooze({id, untilIso})`; `reminders_due({now}) -> {overdue:[], dueSoon:[]}`; `maintenance_log(input) -> MaintenanceEvent`; `maintenance_list({assetId?, from?, to?})`; `fleet_export_csv({filters, path})`. Event: `reminders-due {overdue, dueSoon}` emitted after startup migration completes.
JS: `computeHealth({lastResults, now, staleDays=90}) -> "healthy"|"review"|"attention"|"never"`; `reminderStatus(reminder, lastDoneAt, hoursSince, now) -> {state, dueAt, dueInHours}`; `fleetToCsv(rows) -> string` (reuse `csvCell` approach from `app/export.js`; neutralise formula injection); `renderBoothSheetHtml(booth, rows)` registered with FS-03 as printable kind `BoothSheet`.
Deps: none new.

## 5. Data model

Existing, reused unchanged: `venue`, `booth`, `deck_position` (0001), `setup`, `setup_component`, `maintenance_event`, `device_test_result` (0002). A position holds assets via the new link table below (setups remain for measurement context).
```sql
-- 0017_fleet_dashboard.sql
CREATE TABLE IF NOT EXISTS maintenance_reminder (
  id TEXT PRIMARY KEY,
  asset_id TEXT REFERENCES asset(id) ON DELETE CASCADE,   -- NULL when template
  product_id TEXT REFERENCES product(id),                 -- template by product
  title TEXT NOT NULL,
  basis TEXT NOT NULL CHECK (basis IN ('days','hours')),
  interval_value REAL NOT NULL CHECK (interval_value > 0),
  warn_before REAL NOT NULL DEFAULT 14,                   -- days or hours
  enabled INTEGER NOT NULL DEFAULT 1,
  snoozed_until TEXT,
  created_at TEXT NOT NULL
);
ALTER TABLE asset ADD COLUMN deck_position_id TEXT REFERENCES deck_position(id);
ALTER TABLE maintenance_event ADD COLUMN reminder_id TEXT REFERENCES maintenance_reminder(id);
ALTER TABLE maintenance_event ADD COLUMN hours_at_event REAL;
CREATE INDEX IF NOT EXISTS idx_reminder_asset ON maintenance_reminder(asset_id, enabled);
CREATE INDEX IF NOT EXISTS idx_asset_position ON asset(deck_position_id);
CREATE INDEX IF NOT EXISTS idx_maint_asset_time ON maintenance_event(asset_id, event_at);
```
The migration creates `maintenance_reminder` before the ALTER that references it. `maintenance_event.event_type` values documented: `clean`, `lubricate`, `calibrate`, `repair`, `replace_part`, `inspect`, `other`. Migration backfills nothing; assets start unplaced. Settings stored in existing settings mechanism: `fleet.staleDays`, `fleet.startupBanner`.

## 6. Algorithms

Health from the latest `device_test_result` per (asset, test_id): any `fail` -> attention; else any `unknown` or any result older than `staleDays` (default 90, tunable) -> review; else healthy; no results -> never. Failing items are those latest results with `fail`.
Hours accumulated: sum of confirmed rows in the shared FS-00 `asset_usage` ledger (`0006_asset_usage.sql`) for the asset — manual entries (`source='manual'`) plus session-derived proposals (`source='deckchek'`, from `proposeFromSessions` in `app/usage-hours.js`, sessions linked via `setup_component`, capped per session at 12 h, tunable). This is the same ledger FS-12 uses, so stylus and fleet hours never disagree. It measures time DeckChek observed or the user entered, not true runtime; the UI says "Tracked hours (estimate)".
Reminder due: days basis: dueAt = lastDone + interval (lastDone = latest linked event, else asset `installed_date`, else created_at). State = overdue if now > dueAt, dueSoon if now >= dueAt - warn_before. Hours basis: remaining = interval - (hoursNow - hours_at_last_event); overdue if <= 0, dueSoon if <= warn_before. Snoozed reminders are excluded from the banner but remain visible in the grid. All date maths in UTC date-only comparison to avoid DST drift.

## 7. Error handling, edge cases, privacy, security

Deleting a venue/booth cascades per schema, so UI demands typed confirmation and shows counts; assets are never deleted, only unplaced. Moving an asset records an automatic `event_type='other'` "Moved from A to B" event. Duplicate placement of the same asset is impossible (single column). Clock set backwards: due calculations use stored timestamps; negative intervals are clamped and flagged. CSV formula injection: cells beginning with `= + - @ \t \r` are prefixed with `'`. Print sheet escapes all text. Venue addresses are local only; booth sheets omit city unless ticked. Reminders run only in-app; no OS notifications or background services in v1.

## 8. Test plan

Unit: health matrix, stale boundary, reminder day and hour boundaries, snooze, leap day, DST dates, session cap, CSV quoting and injection, filter combinations, booth sheet escaping. Rust: migration on a DB with existing assets/events, FK and cascade behaviour, `reminders_due` with 1k assets in < 200 ms, placement uniqueness. UI smoke: seed fixture fleet, assert tiles, filter, export CSV content, startup banner appears with overdue seed and respects snooze. Windows CI: CSV with BOM opens (byte check), print stylesheet renders to PDF. Manual: model the owner's gear as two booths (home: PLX-CRSS12, SL-1200MK4, DJM-A9; second: Rane Twelve MK2, Xone:23C, DDJ), create a 7-day reminder, backdate event, restart app and confirm banner.

## 9. Definition of done

All ACs pass; migration idempotent and tested on a copy of a real DB; flag `features.fleet` default on; docs: README, SPEC-05 cross-reference (venue hierarchy now has UI), IMPLEMENTATION-STATUS.

## 10. Dependencies, risks, open questions, effort

Depends on: device test results and plans, spec 03 (PDF for booth sheet, optional), spec 22 (jobs may auto-log a maintenance event on completion; optional), existing venue schema. Risks: tracked hours misread as runtime; many reminders create banner fatigue (cap banner to 5 items with "and N more"); ALTER ordering in SQLite. Open: should reminder templates ship per product in device profiles (`maintenance` array in `app/devices/profiles`, needs DEVICE-PROFILE-SCHEMA change); is `setup` or direct `asset.deck_position_id` the source of truth (this spec picks the direct column, setups reference it for context). Effort: L (~26 agent-hours).

## 11. Research notes

No external sources were opened. Design derives from `database/migrations/0001_initial.sql` (venue, booth, deck_position, asset, maintenance_event, setup), `0002_device_library.sql` (device_test_result), SPEC-05 §3 (venue hierarchy), SPEC-06 §22.6 (maintenance report). CSV rules: RFC 4180 and OWASP CSV-injection guidance, from knowledge, verify before implementing.
