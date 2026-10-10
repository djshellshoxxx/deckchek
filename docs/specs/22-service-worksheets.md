# Spec 22: Service Worksheets

## 1. Summary and Goals / Non-goals

A technician job workflow inside DeckChek: intake (customer, unit, fault, photos), pre-repair measurements from a test-plan subset, a work log (parts, labour, notes), post-repair measurements with an automatic before/after comparison, and an invoice-free job sheet PDF (via spec 03). Jobs move through defined statuses and are stored locally.

Goals: repeatable repair evidence; every job ties to an `asset` and to `session`/`measurement` rows; before/after deltas are automatic. Non-goals: invoicing, tax, payments, stock control, customer portal, cloud sync, multi-user concurrency.

## 2. Users & user stories

Bench technician; shop owner; DJ doing own repairs.

AC-1 Given a new job form with a customer name and either an existing asset or new unit details, when saved, then a job in status `intake` exists with a human job number (`J-2026-0001`).
AC-2 Given a job in `intake`, when "Run pre-repair tests" is chosen and a plan subset selected, then results are stored as phase `before` linked to the job.
AC-3 Given a job, when labour (minutes) or a part (name, qty, optional cost) is added, then totals are shown as informational numbers, never as an invoice.
AC-4 Given before and after results for the same metrics, then the comparison table shows delta, direction (improved/worse/unchanged within uncertainty) and flags metrics measured with different method versions as not comparable.
AC-5 Given the job reaches `completed`, then the PDF job sheet is generated containing fault, before/after table, work log and a signature line, with no prices unless "Include costs" is ticked.
AC-6 Given a status change, then it is validated against the allowed transition table and logged with a timestamp.
AC-7 Given a job is cancelled, then data is kept and the job is read-only; deleting requires typing the job number.
AC-8 Given attached photos, then they are stored by content hash, EXIF GPS stripped, with captions.

## 3. UX

Entry points: sidebar "Service" (new screen); Equipment row > "New job"; Devices > "Repair this unit".
Screens: (1) Job list: filter chips by status, search (job no, customer, serial), sort by updated. (2) Job detail with stepper Intake > Before > Work > After > Sheet; each step shows done/blocked state. Intake form: customer name (required), phone/email (optional), unit picker/new unit, serial, reported fault (multiline), accessories received (checklist), condition on arrival, up to 10 photos. Before/After steps embed the existing device test runner (`app/ui/screens/devices.js`) in "job mode": results are written with `job_id` and `phase`. Work step: tables for parts and labour, free notes with timestamped entries (append-only; edits create a new entry marked "amended"). Sheet step: preview and export.
States: empty ("No jobs yet. Create your first job"), loading, success, partial (after-tests missing: "Compare is incomplete, 3 of 8 metrics have no after value"), error (retry, file path shown), offline (n/a), unsupported (device has no profile: free-form measurements via quick diagnostic only, banner explains).
Copy: status badges "Intake / Diagnosing / Awaiting parts / Repairing / Testing / Ready / Collected / Cancelled". Disclaimer on sheet: "Measurements are indicative bench results, not a warranty."
Shortcuts: Ctrl+J new job; Alt+Right/Left next/previous step; Ctrl+Enter save note. Accessibility: stepper is an ordered list with `aria-current="step"`; status never colour only; tables have headers and captions.

## 4. Architecture

New: `app/service.js` (pure: job state machine, comparison, totals), `app/ui/screens/service.js`, `app/ui/workflows/service-job.js`, `src-tauri/src/service.rs`.
Rust commands: `job_create(input) -> Job`; `job_get(id) -> JobDetail`; `job_list({status?, q?, limit, offset}) -> {jobs, total}`; `job_update_fields(id, patch) -> Job`; `job_set_status(id, to, note?) -> Job` (validates transition); `job_add_log(id, kind: "part"|"labour"|"note", payload) -> LogEntry`; `job_attach_photo(id, path, caption) -> Photo`; `job_link_results(id, phase, sessionIds|testResultIds)`; `job_comparison(id) -> Comparison`; `job_export_sheet(id, {includeCosts}) -> {path}`. Event: `job-status-changed {id, from, to}`.
JS: `canTransition(from, to) -> boolean`; `compareBeforeAfter(before, after, {higherIsBetter}) -> rows[]` (builds on `compareRuns` in `app/core.js`, adding uncertainty and method checks); `jobTotals(log) -> {labourMinutes, partsCost}`; `renderJobSheetHtml(job, comparison, opts)`.
Dependencies: none new beyond spec 03 for PDF. Photos reuse the image pipeline from spec 20 if present; otherwise this spec adds the shared `photo.rs` helper (flag the overlap).

## 5. Data model

```sql
-- NNNN_service_worksheets.sql
CREATE TABLE IF NOT EXISTS customer (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, notes TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS service_job (
  id TEXT PRIMARY KEY,
  job_number TEXT NOT NULL UNIQUE,
  customer_id TEXT REFERENCES customer(id),
  asset_id TEXT REFERENCES asset(id),
  status TEXT NOT NULL CHECK (status IN ('intake','diagnosing','awaiting_parts','repairing','testing','ready','collected','cancelled')),
  reported_fault TEXT NOT NULL,
  accessories_json TEXT NOT NULL DEFAULT '[]',
  arrival_condition TEXT,
  resolution TEXT,
  opened_at TEXT NOT NULL, updated_at TEXT NOT NULL, closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_status ON service_job(status, updated_at);
CREATE TABLE IF NOT EXISTS service_job_status_log (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES service_job(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL, note TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS service_job_log (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES service_job(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('part','labour','note')),
  description TEXT NOT NULL, quantity REAL, minutes INTEGER, unit_cost REAL,
  amends_id TEXT REFERENCES service_job_log(id), at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS service_job_result (
  job_id TEXT NOT NULL REFERENCES service_job(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('before','after')),
  session_id TEXT REFERENCES session(id),
  device_test_result_id TEXT REFERENCES device_test_result(id),
  PRIMARY KEY (job_id, phase, session_id, device_test_result_id)
);
CREATE TABLE IF NOT EXISTS service_job_photo (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES service_job(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL, path TEXT NOT NULL, caption TEXT, stage TEXT, at TEXT NOT NULL
);
```
Job numbers: `J-<year>-<4 digit seq>` generated in a transaction (`SELECT MAX`). Currency stored as plain numbers with a settings-level currency symbol. Workspace JSON export (`app/export.js`) bumps to version 2 adding jobs; v1 importers keep working.

## 6. Algorithms

Allowed transitions: intake -> diagnosing | cancelled; diagnosing -> awaiting_parts | repairing | ready (no fault found) | cancelled; awaiting_parts -> repairing | cancelled; repairing -> testing | awaiting_parts; testing -> ready | repairing; ready -> collected; collected and cancelled are terminal (reopen allowed only via explicit "Reopen" to `diagnosing`, logged).
Before/after: for each metric in both phases, pair latest valid value per phase. Delta = after - before. Combined uncertainty u = sqrt(u_b^2 + u_a^2) (root-sum-square, assuming independence; flagged tunable). Direction: if |delta| <= 2u (k=2) then "unchanged within uncertainty"; else improved/worse using the metric's `higherIsBetter` or distance to the spec band. If no uncertainty is known, use a default 5% of spec span and mark "assumed". Pass-status changes (fail -> pass) are listed first as the headline. Different `method_version` or unit -> "not comparable". Totals: labour hours = sum minutes / 60; parts = sum(qty x unit_cost); informational only.

## 7. Error handling, edge cases, privacy, security

Customer PII (name, phone, email) stays local, is excluded from every other export by default (workspace export asks explicitly; spec 21 packs never include it). Job sheet includes customer name only if "Include customer details" is ticked. Deleting a customer with jobs is blocked. Photo path handling: copy into app data dir `jobs/<job_id>/<sha256>.<ext>`; never trust incoming file names; reject extensions other than png/jpg/webp and sniff magic bytes. Free text is HTML-escaped in sheets. Concurrent edits: single user, but status transitions use `UPDATE ... WHERE status = :expected` to prevent double clicks. Power loss: SQLite WAL with transactions per action. Asset deleted mid-job: asset soft-delete (`is_deleted`) only, so jobs remain readable.

## 8. Test plan

Unit: transition table exhaustive (valid and invalid), comparison with equal/greater/lesser/missing/incomparable metrics, RSS uncertainty, totals, job-number sequencing at year rollover, HTML escaping, amended notes. Rust: transactions, FK behaviour, unique job number under rapid creation, photo hashing/dedupe, path traversal attempts (`..\`, UNC, reserved names such as `CON`). UI smoke: create job, set statuses, add part, run fake before/after, export sheet to HTML. Windows CI: PDF generation, long paths. Manual with the owner's gear: take the SL-1200MK4 and Rane Twelve MK2 through a mock job (e.g. adjust pitch trimmer, record before/after speed error), DJM-A9 channel balance before/after cleaning faders, print the sheet.

## 9. Definition of done

All ACs pass; migration idempotent; sheet reviewed on paper; feature flag `service` default off until reviewed; docs: README feature list, SPEC-06 §22.6 maintenance report cross-reference.

## 10. Dependencies, risks, open questions, effort

Depends on: spec 03 (PDF), device test runner and plans, `asset`/`session`/`measurement` schema, spec 20 photo helper (shared). Risks: scope creep into invoicing; customer data handling obligations (GDPR-style duties may apply to a business user: UNKNOWN — needs verification); comparisons mixing test conditions (note field "bench conditions" mitigates). Open: required fields per jurisdiction; whether to add QR job label printing; per-job tester signature capture. Effort: L (~28 agent-hours).

## 11. Research notes

No external sources were opened for this spec. Design derives from existing schema (`maintenance_event`, `device_test_result`, `session`, `measurement`) in `database/migrations/0001_initial.sql` and `0002_device_library.sql`, and SPEC-06 §22.6. Combined-uncertainty RSS follows the GUM approach (JCGM 100): not opened, from knowledge, verify.
