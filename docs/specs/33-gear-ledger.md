# SPEC-33 Gear Ledger

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: `0021_gear_ledger.sql`. Milestone: M8. Size: L. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

Status: draft. Packaging: **inside DeckChek** (new "Gear ledger" export under Equipment/History). Output is a standalone static site/page; no separate app.

## 1. Summary, Goals / Non-goals
A shareable, static record of the owner's gear: per-item serial, photos, specs, service history, test certificates with verification hashes. Export produces a self-contained `index.html` (+ optional multi-page folder) and a JSON dataset, with privacy controls deciding what is included. Optional publishing is manual via GitHub Pages instructions.

Goals: provenance document useful for resale, insurance, venue riders. Non-goals: in-app publishing, accounts, credentials, hosted service, tamper-proof guarantees (hashes show integrity vs the exported JSON, not authenticity without a signature).

## 2. Users & stories
- AC-1 Given owned assets in the catalog, When I choose Export Ledger, Then I can pick items and fields, preview, and save `ledger/` (HTML + `ledger.json` + `assets/`).
- AC-2 Given privacy defaults, Then serial numbers are hidden/partially masked, purchase prices, notes, location and venue data are excluded unless ticked.
- AC-3 Given the exported page opened offline from disk (`file://`), Then it renders fully (no external requests, inline CSS/JS).
- AC-4 Given a certificate entry, When I paste its JSON or open "Verify", Then the page recomputes SHA-256 and shows match/mismatch.
- AC-5 Given photos, Then they are copied, downscaled (max 1600 px, EXIF stripped) and referenced with alt text.
- AC-6 Given Publish help, Then I see a numbered GitHub Pages guide with the exact folder to upload; the app never asks for credentials.
- AC-7 Given a later re-export, Then the previous `ledger.json` version is diffable and the revision counter increments.

## 3. UX
Entry: Equipment screen > "Gear ledger..." and History > run > "Add to ledger as certificate". Wizard: 1 Select gear (checkbox list with status), 2 Privacy (toggle matrix per field and per item, presets: "Public", "Insurance", "Private"), 3 Preview (iframe of generated HTML, light/dark), 4 Export (folder pick) + "How to publish" panel. States: empty ("Add equipment first"), loading (rendering/photo processing progress), success ("Saved to <path>. Open index.html"), partial (items skipped: no photos), error (disk write; photo unreadable), offline (n/a), unsupported (n/a). Keyboard: `Ctrl+E` open export, `Tab` order follows wizard, `Esc` cancel. Accessibility: generated page is semantic HTML, headings per item, `prefers-color-scheme` aware, print stylesheet, alt text required warnings, contrast per GUI-DESIGN-RESEARCH.md tokens.
Publish copy: "Create a repository, upload the exported folder (or push it), then Settings > Pages > Deploy from branch. DeckChek never uploads for you. Check the privacy summary below before making it public."

## 4. Architecture
Files: `app/ledger/build.js` (`buildLedger(state, selection, privacy) -> {json, files:[{path, text|bytes}]}`), `app/ledger/template.js` (single HTML template string with inline CSS/JS, no remote fonts), `app/ledger/hash.js` (thin re-export of FS-00 `app/canonical-json.js` and `app/sha256.js`; the pure-JS SHA-256 is inlined into the template for `file://` pages), `app/ledger/privacy.js` (`applyPrivacy(item, rules)`), `app/ui/screens/ledger.js`. Rust: FS-00 dialog plugin + `userfiles_write_folder(dir, files:[{relPath, base64?|text?}]) -> {written, path}` (rejects `..`, absolute, drive-letter, UNC, reserved names, symlinks; writes under the chosen dir only). Photos come from the FS-00 photo store (already downscaled to 1600 px and EXIF-free); the ledger copies the stored bytes. Reuses `catalog-store.js` records (`asset`, `product`), `export.js` conventions, `buildHtmlReport` styling from `core.js`, calibration `serializeProfile` and runs for certificates. No new dependencies; hashing is Web Crypto.

## 5. Data model
Migration `0021_gear_ledger.sql` (photos use FS-00 `photo`/`photo_link` with `owner_kind='asset'`; certificates are FS-20 `certificate` rows — the draft `asset_photo` and `ledger_certificate` tables are dropped):
```sql
CREATE TABLE IF NOT EXISTS ledger_export (
  id TEXT PRIMARY KEY, revision INTEGER NOT NULL, created_at TEXT NOT NULL,
  selection_json TEXT NOT NULL, privacy_json TEXT NOT NULL, ledger_sha256 TEXT NOT NULL);
ALTER TABLE asset ADD COLUMN public_notes TEXT;
```
Photos live in the FS-00 content-addressed store `<app_data_dir>/photos/<sha256>.jpg`. Existing `maintenance_event` supplies service history; `asset_settings_snapshot` supplies settings.
`ledger.json` v1:
```json
{"format":"deckchek-ledger","version":1,"revision":3,"generatedAt":"ISO","owner":{"displayName":"optional"},
 "items":[{"id":"a1","nickname":"SL-1200MK4","manufacturer":"Technics","model":"SL-1200MK4",
  "serial":"XXXX-1234","serialMode":"masked","purchaseDate":"2023-05","condition":"good",
  "photos":[{"path":"assets/a1/p1.jpg","alt":"Front","sha256":"..."}],
  "service":[{"at":"2025-02-01","type":"stylus replaced","description":""}],
  "certificates":[{"id":"c1","kind":"speed-test","issuedAt":"...","payload":{},"sha256":"hex","toolVersion":"0.x"}]}],
 "privacy":{"preset":"public","excluded":["price","notes","location"]},
 "ledgerSha256":"hex over canonical items"}
```
Certificate entries embed the FS-20 signed JSON; the page re-hashes `canonicalJson(payload)` (FS-00 rules) and compares with `integrity.contentHash`. Ed25519 signature checking in the page is attempted only where `crypto.subtle` supports Ed25519 (otherwise "hash checked, signature not checked by this browser"). Migration: `version` field; page JS refuses unknown major versions, shows "generated by a newer DeckChek".

## 6. Algorithms
- Canonical JSON: FS-00 §6.1 rules (recursive key sort; integers only, other numbers as decimal strings; NaN rejected).
- Serial masking: keep last 4 characters (`****1234`) in "masked", full in "full", omitted in "hidden". Default "hidden" for Public, "masked" for Insurance.
- Verification: page recomputes SHA-256 via `crypto.subtle` (needs secure context; `file://` and https both treat as secure in modern browsers - UNKNOWN for all browsers, so fallback: bundled 3 KB pure-JS SHA-256 in the template).
- Integrity note: hashes detect accidental or later edits only; for authenticity, an optional detached signature (Ed25519 via WebCrypto) is deferred (open question).
- Photo rules: max 1600 px long edge, quality 0.82, strip metadata by re-encode; reject >8 MB source.

## 7. Errors, privacy, security
Privacy is the central risk: ledgers can reveal serials, home address (via EXIF GPS, venue records), purchase price. Controls: per-field toggles, per-item inclusion, presets, a pre-export "What will be public" summary listing every field and photo count, EXIF always stripped, free-text notes excluded by default, venue/booth data never included. Output HTML escapes every user string (build by DOM-safe templating `textContent`/escape function; no `innerHTML` with data); inline script uses a nonce-free strict `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">` (inline needed for single-file mode). Folder writes validated against traversal; file names generated from ids. No network, no credentials, no analytics in output. Delete-ledger does not retract published copies: state this in UI.

## 8. Test plan
Unit: canonical JSON determinism; SHA-256 vectors (empty string, "abc"); privacy presets remove fields (snapshot test per preset); serial masking; HTML escaping with `<script>`/quotes in nickname; schema validation; page verifies good and tampered certificate (run template JS in jsdom or Playwright). Rust: `write_ledger_folder` rejects `../x`, absolute, drive-letter, backslash tricks, existing symlink. UI smoke: create asset with photo, run wizard, assert preview excludes price, assert exported file list. Windows CI: path-length and reserved-name cases (`CON`, trailing dot). Manual with owner's gear: record the SL-1200MK4, PLX-CRSS12, Rane Twelve MK2, DJM-A9, Xone:23C, Traktor Audio 8 DJ, DDJ (model TBC) with serials and photos; attach speed-test certificates; open page offline, in phone browser, print to PDF; publish test repo via Pages and confirm no private fields leak (grep for serial/price strings).

## 9. Definition of done
All AC pass; leak-grep test in CI; accessibility check (axe via Playwright) on generated page; docs: README, publishing guide in `docs/`, FEATURE-MATRIX. Feature flag `features.gearLedger`.

## 10. Dependencies, risks, questions, effort
Depends on FS-00 (photo store, canonical JSON/SHA-256, `userfiles`), FS-20 (certificates), SPEC-04 (asset model), SPEC-06 (reports). Risks: accidental PII leak (mitigated by defaults and summary), hash misread as authenticity proof, large photo sets bloating single-file (use folder mode; single-file embeds base64 only under 5 MB total). Questions: add Ed25519 signing? Include QR to the live page? Multi-owner ledgers? Effort: M-L (~32 agent-hours).

## 11. Research notes
No external research required beyond platform knowledge; GitHub Pages deployment steps to be verified against current GitHub docs at implementation (UNKNOWN - needs verification: exact Settings > Pages wording). Web Crypto availability on `file://`: UNKNOWN - needs verification (hence the pure-JS fallback). See also `app/export.js` and `app/core.js` `buildHtmlReport` for existing export patterns.
