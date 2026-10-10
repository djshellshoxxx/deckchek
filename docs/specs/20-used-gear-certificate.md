# Spec 20: Used-Gear Test Certificate

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: `0014_certificate.sql` (+ shared `0013_photo_store.sql`, FS-00). Milestone: M7. Size: L. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

## 1. Summary and Goals / Non-goals

DeckChek runs a device's full ("certificate") test plan from `app/devices/profiles/*.json` and produces a dated, tamper-evident certificate (PDF via spec 03 plus a sidecar `.deckchek-cert.json`; HTML fallback with the JSON embedded) that a seller can hand to a buyer. Integrity is protected by a SHA-256 content hash and an Ed25519 signature made with a per-install key; a QR code carries the hash and a "Verify certificate" screen checks a PDF or JSON file. This extends SPEC-06 §22.3 (used-equipment report).

Goals: one-click certificate from a completed plan; unit identity with attached photos; per-metric value vs spec with uncertainty and calibration status; reproducible verification offline; honest disclaimer.
Non-goals: proving the seller is honest or the tester is independent; third-party/PKI trust, revocation servers, or a trusted-timestamp authority; certifying safety or electrical compliance; certifying hardware not measured (profile tests marked `skipped`/`unknown` appear as such, never as pass).

## 2. Users & user stories

- Seller (DJ selling a deck/mixer), Buyer (verifies a PDF/JSON received), Shop tech (certifies many units).

AC-1 Given a device with a certificate-capable plan, when all required tests have a result, then "Create certificate" is enabled; otherwise it lists the missing tests.
AC-2 Given the dialog is completed (tester name, optional photos, validity), when the user confirms, then a PDF, a `.deckchek-cert.json`, and a stored record are produced within 5 s.
AC-3 Given a `.deckchek-cert.json` or DeckChek certificate `.html` file, when opened in "Verify certificate", then status is VALID (hash and signature match), MODIFIED (hash mismatch), or UNVERIFIABLE (unknown format/version), and the signer key fingerprint is shown. Given a `.pdf`, the screen explains that PDFs carry only the printed hash/QR and asks for the sidecar JSON (WebView2 `PrintToPdf` cannot embed attachments — FS-03 §10); optional phase 2: embed via `lopdf` (MIT).
AC-4 Given any value was edited in the JSON by one byte, then verification reports MODIFIED and names "content hash mismatch".
AC-5 Given today is past `validUntil`, then verification shows VALID but "EXPIRED" in a distinct badge.
AC-6 Given a measurement whose instrument calibration is missing or older than its interval, then the certificate prints "Uncalibrated" or "Calibration expired" beside it and the overall verdict cannot be "Certified pass", only "Pass (uncalibrated)".
AC-7 Given a PDF produced by DeckChek, when its QR code is scanned, then it yields `deckchek:cert:v1:<sha256-hex>` and nothing personal.
AC-8 Given PDF generation fails, then an HTML file with identical content hash is offered.

## 3. UX

Entry points: Devices screen > device detail > "Certificate" tab; Equipment row menu; History > session > "Make certificate"; top-level Tools > "Verify certificate".

Flow: (1) Readiness card: plan name, X of Y required tests done, stale results (older than 24 h, tunable) flagged "Re-run". (2) Identity form: model (from profile, read-only), serial (required, free text), firmware, tester name (default from settings), notes, up to 6 photos (png/jpg, max 5 MB each, downscaled to 1600 px, EXIF stripped), validity (30/90/180 days, default 90). (3) Preview of HTML certificate. (4) "Sign and export": choose folder, outputs `<model>-<serial>-<date>.pdf` and `.deckchek-cert.json`. (5) Success toast with "Reveal file".
Verify screen: drop zone or file picker (.pdf, .json, .html); result card with large badge, fingerprint, signer name, dates, per-section diff when MODIFIED.
States: empty ("No certificates yet"), loading (progress for photo processing), partial (incomplete tests: export blocked, "Export draft" watermarked DRAFT and unsigned), error ("Could not read file"), offline (everything is offline), unsupported (PDF lacking embedded JSON: "This PDF has no DeckChek data attached").
Key copy: "This certificate proves the report was not changed after signing. It does not prove the tester measured honestly or that the unit has not changed since."
Shortcuts: Ctrl+Shift+C create, Ctrl+Shift+V verify. Accessibility: badge uses icon + text (never colour alone), drop zone is a keyboard-operable button, PDF is tagged with document title and alt text for photos.

## 4. Architecture

New: `src-tauri/src/certificate.rs`, `src-tauri/src/signing.rs`, `app/certificate.js` (pure builder/canonicaliser), `app/ui/screens/certificate.js`, `app/ui/screens/verify.js`.
Rust commands:
- `signing_get_identity() -> {fingerprint, createdAt, publicKeyB64}` creates key on first use.
- `certificate_sign({payload: object}) -> {contentHash, signatureB64, publicKeyB64, fingerprint}` canonicalises (JCS-style: sorted keys, UTF-8, no whitespace, numbers via ryu shortest), hashes with SHA-256, signs the hash bytes.
- `certificate_verify({json: string}) -> {status: "valid"|"modified"|"unverifiable", reasons: string[], fingerprint, expired: bool}`.
- `certificate_extract_json({path}) -> {json}` reads `.json` directly or `<script type="application/json" id="deckchek-cert">` from a DeckChek HTML certificate; for `.pdf` returns `{error:"pdf_has_no_attachment"}` in v1.
- `certificate_store({record})`, `certificate_list({assetId?})`.
Shared pieces (FS-00): canonical JSON + SHA-256 (`app/canonical-json.js`, `src-tauri/src/canonical.rs`, vectors `tests/fixtures/canonical-vectors.json` — the canonical form forbids non-integer numbers, so measurement values are emitted as decimal strings with the metric's precision, which removes JS/Rust float-formatting drift), photos (FS-00 photo store, `owner_kind='certificate'`), QR (`app/vendor/qr.js`), printable kind registration (FS-03 `registerPrintableKind('Certificate', ...)`). JS: `buildCertificatePayload({asset, profile, results, measurements, calibration, tester, photos, validDays, now}) -> payload`; (`canonicalJson` imported from FS-00); `certificateVerdict(results, calibration) -> "pass"|"pass_uncalibrated"|"review"|"fail"`; `renderCertificateHtml(payload, signature) -> string` (reuse `buildHtmlReport` styles in `app/core.js`); `qrSvg(text) -> string` (wrapper over FS-00 `app/vendor/qr.js`).
Dependencies: `ed25519-dalek` 2.2.x (BSD-3-Clause, features `rand_core`), `rand_core`/`getrandom` (MIT/Apache-2.0), `base64` 0.22 (MIT/Apache-2.0); `sha2` comes from FS-00. No `qrcode` or `image` crates: QR is the shared JS generator and photos are downscaled/re-encoded in the webview by the FS-00 photo store. Key storage: private key file `signing-key.bin` in the app data dir, protected via Windows DPAPI using `windows-sys` `CryptProtectData` (MIT/Apache-2.0); fallback to file with user-only ACL if DPAPI fails (flagged in UI). The PDF prints the full content hash, fingerprint and QR; the signed JSON travels as the sidecar file.
Verification uses `VerifyingKey::verify_strict` to reject small-order keys and malleable signatures.

## 5. Data model

```sql
-- 0014_certificate.sql
CREATE TABLE IF NOT EXISTS signing_key (
  id TEXT PRIMARY KEY,            -- fingerprint (first 16 hex of SHA-256(pubkey))
  public_key_b64 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  retired_at TEXT
);
CREATE TABLE IF NOT EXISTS certificate (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  profile_id TEXT NOT NULL REFERENCES device_profile(id),
  signing_key_id TEXT NOT NULL REFERENCES signing_key(id),
  serial_number TEXT NOT NULL,
  tester_name TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('pass','pass_uncalibrated','review','fail','draft')),
  content_hash TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  pdf_path TEXT, json_path TEXT,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_certificate_asset ON certificate(asset_id, issued_at);
```
JSON file `.deckchek-cert.json` v1: `{format:"deckchek-certificate", version:1, payload:{unit:{model,productId,serial,firmware,photos:[{name,sha256,mime,dataB64}]}, plan:{profileId,profileVersion,testIds}, results:[{testId,status,detail}], measurements:[{metricId,value,unit,uncertainty,referenceLow,referenceHigh,methodKey,methodVersion,calibration:{state,refId,date}}], tester, deckchekVersion, schemaVersion, issuedAt, validUntil, verdict, disclaimer}, integrity:{alg:"ed25519",hashAlg:"sha256",contentHash,signature,publicKey,fingerprint}}`. Hash covers `payload` only. Unknown future `version` -> UNVERIFIABLE, never silently accepted.

## 6. Algorithms / method

Verdict: fail if any required test `fail`; review if any `unknown` or a measurement is within its uncertainty of the limit (|value - limit| <= uncertainty); pass otherwise; downgrade to `pass_uncalibrated` per AC-6. Pass/fail against spec uses the guard-band rule: value +/- expanded uncertainty (k=2 where the engine supplies a standard uncertainty, else the stored `uncertainty`) must lie inside the limit (ILAC-G8-style decision rule, tunable). Calibration state comes from `app/calibration.js`; interval default 12 months (tunable).
Signing: hash = SHA-256(canonical(payload)); signature = Ed25519(hash). QR text `deckchek:cert:v1:<hash-hex>` (71 chars, fits QR version 4-L with margin). Verification recomputes hash, verifies signature against embedded key, and optionally checks whether the fingerprint matches a key in the local `signing_key` table ("issued by this install").
Limits (printed and shown): the key is generated and held by the signer, so a signature proves only that the content is unchanged since a holder of that key signed it. A dishonest tester can fabricate measurements, re-sign, or generate a new key; the public key embedded in the file is self-asserted, so there is no identity binding. Recipients may compare fingerprints out-of-band (shown in large type). Clock is local, so dates are tester-asserted.

## 7. Error handling, edge cases, privacy and security

Missing or corrupt key: offer "Create new identity" with warning that older certificates still verify (public key is embedded). Key export is not offered in v1. Serial reuse: allowed, history listed. Photos: strip EXIF/GPS, reject non-image magic bytes, cap total payload at 16 MB. File paths from the UI are validated as absolute, canonicalised, and extension-checked; never concatenate serial into paths without sanitising `[^A-Za-z0-9._-]` to `_`. All text is HTML-escaped (use existing `esc`). Tester name and serial are PII-light and only appear in the certificate the user chooses to share; no network. JSON parsing limited to 20 MB and depth 32.

## 8. Test plan

Unit (JS): canonicalJson key-order and number vectors, verdict matrix, guard-band edge cases, HTML escaping, photo list limits. Rust: sign/verify roundtrip, one-bit tamper, wrong key, small-order key rejected, canonical vectors shared with JS via `tests/fixtures/canonical-vectors.json` (FS-00), HTML/JSON extraction, PDF returns `pdf_has_no_attachment`. UI smoke: create certificate with fake plan, verify result VALID, then mutate and see MODIFIED. Windows CI: DPAPI roundtrip, path handling with spaces. Manual script: run full plans on PLX-CRSS12, SL-1200MK4, Rane Twelve MK2, DJM-A9, Xone:23C; produce certificates; verify on a second PC; print and scan the QR with a phone; edit one value in the JSON.

## 9. Definition of done

All ACs pass; vectors identical in JS and Rust; disclaimer present in PDF, HTML, JSON; feature flag `features.certificates` (default on after manual test); update README, SPEC-06 §22.3 cross-reference, IMPLEMENTATION-STATUS.

## 10. Dependencies, risks, open questions, effort

Depends on: FS-00 (canonical JSON, photo store, QR, sha2), spec 03 (PDF engine), device test plans (`device_test_result`), calibration module, spec 19 uncertainty. Risks: DPAPI portability; cross-language canonicalisation drift; false sense of security. Open: should photos be embedded in JSON (size) or referenced by hash only; should a user-supplied logo be allowed; optional public-key pinning registry for shops (UNKNOWN demand). Effort: L (~30 agent-hours).

## 11. Research notes

- https://docs.rs/crate/ed25519-dalek/latest : current release 2.2.0; 2.x renamed Keypair/PublicKey to SigningKey/VerifyingKey (snippet only).
- https://docs.rs/ed25519-dalek/latest/ed25519_dalek/struct.VerifyingKey.html : `verify_strict` rejects scalar and small-torsion malleability and weak keys, hence chosen over `verify` (snippet only).
- https://crates.io/crates/ed25519-dalek : `legacy_compatibility` feature disables checks; do not enable (snippet only).
- RFC 8032 (Ed25519) and RFC 8785 (JSON Canonicalization Scheme): not opened; cited from knowledge, verify before implementing. ILAC-G8 decision rule: UNKNOWN — needs verification.
