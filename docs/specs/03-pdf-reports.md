# Spec 03 — PDF reports

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: none. Milestone: M5. Size: L. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

## 1. Summary, goals, non-goals
Export every report type (run report, device report, System Health report, later certificate) as a paginated, offline-generated PDF with header/footer, page numbers and SVG charts. Decision: render the existing HTML reports with a dedicated print stylesheet and convert using the Windows WebView2 `PrintToPdf` API in a hidden webview.

**Goals:** offline, no new heavy dependency, selectable text, consistent look with on-screen reports, deterministic file names. **Non-goals:** a custom PDF layout engine; PDF/A or digital signatures; macOS/Linux parity in v1 (fallback = browser print dialog / HTML export); editing PDFs.

## 2. Users & user stories
- AC-1 Given a completed run, when "Export PDF" is pressed, then a save dialog opens with `DeckChek_<report>_<device>_<YYYYMMDD-HHmm>.pdf` and a valid PDF is written.
- AC-2 Given a report longer than one page, then every page has the header (title, device) and footer ("Page X of Y", app version, generated time) and table rows are not split across pages. Verified automatically on Windows CI by extracting page text with the `lopdf` dev-dependency (MIT) and asserting page count >= 2 and the string "Page 2 of" on page 2.
- AC-3 Given the report has charts, then they are vector SVG and text in them is selectable.
- AC-4 Given dark theme active, then the PDF is still light (print stylesheet is theme-independent).
- AC-5 Given System Health findings, then the PDF lists each finding with severity icon + text and evidence.
- AC-6 Given the platform does not support WebView2 `PrintToPdf` (browser mode, non-Windows), then "Export PDF" falls back to loading the print-optimised HTML into a hidden same-origin `<iframe srcdoc>` and calling `iframe.contentWindow.print()` (no `window.open`, so the FS-07 grep rule holds).
- AC-7 Given generation takes longer than 20 s, then it is cancelled with an error and a Retry.

## 3. UX
Entry points: "Export PDF" button next to existing HTML/CSV/JSON exports (`app/ui/persistence.js` `exportRunHtml` family), Device report screen, System Health screen, History row menu, and Ctrl+P (maps to Export PDF on report screens). Flow: click -> options popover (Paper A4/Letter default by locale, Orientation, "Include raw measurements table", "Redact serial numbers") -> save dialog -> progress toast "Creating PDF…" -> success toast "PDF saved" with Open / Show in folder. States: loading (button disabled with spinner, `aria-busy`), success, partial (a chart failed to render -> placeholder box "Chart unavailable" and warning toast), error ("Couldn't create the PDF: <reason>. Your data is unchanged." + Retry + "Export HTML instead"), offline (n/a, fully local), unsupported (fallback AC-6 with note "Using your browser's print dialog"). A11y: tagged PDF is not provided by WebView2 PrintToPdf in all versions (UNKNOWN — needs verification), so also keep HTML export as accessible alternative; document titles set; sufficient contrast (>= 4.5:1) in print palette; do not rely on colour alone.

## 4. Architecture
**Approach comparison**
| Option | Pros | Cons |
|---|---|---|
| A. WebView2 `ICoreWebView2_7::PrintToPdf` (webview2-com via `WebviewWindow::with_webview`) | Reuses HTML/CSS/SVG reports; vector text; no new rendering engine; WebView2 already bundled (`embedBootstrapper`); offline | Windows-only; needs unsafe-ish COM call; one print job at a time; needs hidden window; header/footer templates via `ICoreWebView2PrintSettings` (`ShouldPrintHeaderAndFooter`, `HeaderTitle`, `FooterUri`) are limited to default header/footer text |
| B. Tauri `Webview::print()` | Cross-platform call | Opens system print dialog; user must pick "Save as PDF"; not scriptable (assumption — UNKNOWN, needs verification in Tauri 2 docs) |
| C. Rust crates `printpdf`/`genpdf` | Pure Rust, cross-platform, deterministic | Re-implement layout of every report; SVG charts need conversion; large effort; text wrapping/fonts work |
| D. `typst` as library | Excellent typography, page numbers, headers | Heavy dependency (tens of MB compile), fonts to ship, second template language |
| E. Headless Chromium/Edge CLI (`msedge --headless --print-to-pdf`) | Full Chromium header/footer | Needs Edge executable path discovery, process spawn, file URLs; fragile; CSP/AV concerns |
**Pick: A**, with B/window.print() as fallback and HTML export remaining. Page numbers/headers: since WebView2 template control is limited, do not depend on browser header/footer: set `ShouldPrintHeaderAndFooter=false` and generate pagination ourselves with CSS paged media — `@page { size: A4; margin: 18mm 15mm 20mm; @bottom-right { content: "Page " counter(page) " of " counter(pages) } }`. Chromium supports `@page` margin boxes only in recent versions (Chrome 131+: UNKNOWN for the user's WebView2 runtime — needs verification). Fallback implemented in spec: if margin boxes unsupported (feature-detect via `CSS.supports` is unreliable), use `position: fixed` header/footer elements repeated per page by Chromium print and a CSS counter-less "Page" via the WebView2 footer (`ShouldPrintHeaderAndFooter=true` with `HeaderTitle`=report title) — accept native footer "page/total" and mark as v1 behaviour.

New files: `src-tauri/src/pdf.rs` — `#[tauri::command] pdf_render(html: String, dest_path: String, opts: {paper:"A4"|"Letter", landscape:bool, scale:f64}) -> { path, bytes, pages: Option<u32> }` (creates hidden `WebviewWindowBuilder` with `WebviewUrl::App("print-host.html")`, injects HTML via `eval`/event, waits for `document.fonts.ready` + `load` signal, calls `PrintToPdf` through `with_webview`, closes window). `app/print-host.html` (+`app/print-host.js`: receives HTML by `postMessage`/event, replaces body, signals ready). `app/report-print.css` (print stylesheet). `app/report-pdf.js`: `buildPrintableReport(kind, data, opts) -> string` (wraps existing `buildHtmlReport` (core.js), `buildSystemReportHtml` (system-check.js), device report builder in `device-checks.js`), `exportPdf(kind, data, opts) -> Promise<{path}|{fallback:true}>`, `suggestPdfName(kind, device, date)`, and a registry `registerPrintableKind(kind, {title, build(data, opts) -> html})` so later features (FS-20 Certificate, FS-22 JobSheet, FS-23 BoothSheet, FS-33 Ledger print) add their builders in their own files without editing `report-pdf.js`. Dependencies: `webview2-com` (MIT) matching the version Tauri/wry uses (UNKNOWN exact — pin to the transitive version in `Cargo.lock`), `windows` crate (MIT/Apache-2.0); `tauri-plugin-dialog` comes from FS-00. `cfg(windows)` gated. CSP: inline `<style>` already allowed; reports must embed no remote assets; hidden window uses same CSP.

## 5. Data model
No DB change. Settings: `pdf.paper` (`a4|letter`), `pdf.includeRaw` (bool), `pdf.redactSerials` (bool) in `deckchek.ui.v1`. File naming: `DeckChek_<Kind>_<Device>_<YYYYMMDD-HHmm>.pdf`, Kind in {Run, Device, SystemHealth, Certificate}; Device slug = ASCII lowercase, non-alphanumerics -> `-`, max 40 chars; invalid Windows chars `<>:"/\|?*` removed; reserved names (CON, NUL…) get a `_` suffix. PDF metadata title = report title; author = "DeckChek <version>".

## 6. Algorithms / layout
Page: A4 210x297 mm, margins 18/15/20 mm; base font 10 pt system sans (`font-family: "Segoe UI", system-ui`; fonts must be local); headings 16/13/11 pt; tables `break-inside: avoid` per row, `thead` repeats (`display: table-header-group`); sections `break-after: avoid` on headings; charts: inline SVG width 100%, viewBox-based, max height 70 mm, strokes >= 0.75 pt, palette tested in greyscale; summary block first (score, verdict, uncertainty ±, device, setup, date). Page count: WebView2 does not return it; compute estimate not required. Scale factor default 1.0 (range 0.1–2.0 per ICoreWebView2PrintSettings). Print background graphics on (`ShouldPrintBackgrounds=true`) so severity chips keep fill; chips also carry text.

## 7. Errors, edge cases, privacy, security
Hidden window navigation locked to `app://` (deny `on_navigation` to anything else); HTML is generated by us with `esc()` escaping — user strings (notes, nicknames) are always escaped; no scripts in the print host except our own. Destination path validated: from save dialog, `.pdf` suffix enforced, parent exists, not overwriting a directory; write is by WebView2 itself so we pass an absolute path. Concurrent calls queued (one print job at a time). Very long reports (>200 pages) rejected by row caps. PDF may contain serial numbers — option to redact. No network.

## 8. Test plan
Unit: `suggestPdfName` (reserved names, unicode, long), `buildPrintableReport` snapshot contains `@page`, no `<script>`, escapes `<img onerror>` in notes, charts are `<svg>`. Rust: path validation, command refuses non-absolute path, cfg-gated stub returns `{unsupported:true}` on Linux. UI smoke (browser mode): clicking Export PDF triggers `window.print` stub (Playwright `page.evaluate` spy). Windows CI: integration test launching the app is heavy; instead a `#[ignore]`d test run in `windows-build.yml` that renders a fixed HTML and asserts file begins `%PDF-` and size > 5 KB; extract text with `pdftotext` if available. Manual: export run reports from the Technics SL-1200MK4 speed test, Serato CV02.5 DVS run and a System Health scan; open in Edge and Acrobat; check pagination, selectable text, headers, A4 vs Letter, 30+ finding report.

## 9. Definition of done
- [ ] All report types export; fallback works; no unescaped user content
- [ ] Windows CI artifact PDF check; docs (README export section, SPEC-06 reports)
Rollout: feature flag `features.pdfExport`, default on for Windows.

## 10. Dependencies, risks, open questions, effort
Depends on: FS-07 (`open_path`/`reveal_path` for "Open" / "Show in folder"), FS-00 (dialog plugin, `userfiles.rs` path validation, feature registry), existing report builders. Consumers: FS-10, FS-11, FS-20, FS-22, FS-23, FS-33. Limitation: `PrintToPdf` cannot embed file attachments, so FS-20 certificates ship a sidecar `.deckchek-cert.json` instead of an embedded one. Risks: COM interop complexity; `@page` margin box support in the installed WebView2 runtime; wry/webview2-com version coupling. Open: ship a Typst-based fallback later for macOS? Certificate layout (later) needs signed hash block. Effort: L (~22 agent-hours).

## 11. Research notes
- WebView2 print docs: https://learn.microsoft.com/microsoft-edge/webview2/how-to/print (snippet only): `PrintToPdf` on `ICoreWebView2_7` (since 1.0.1020.30), absolute path required, existing file overwritten, one print job at a time, settings object for margins/orientation/page size/scale 0.1–2.0.
- `ICoreWebView2PrintSettings`: https://learn.microsoft.com/microsoft-edge/webview2/reference/win32/icorewebview2printsettings (snippet only).
- `PrintToPdfStreamAsync` .NET variant exists (snippet only) — a Rust equivalent `PrintToPdfStream` is an alternative that avoids disk path handling.
- Tauri-specific print API: search returned nothing; Tauri 2 `Webview::print()` behaviour UNKNOWN — needs verification.
- Crates printpdf/genpdf/typst: not researched online this session (no results fetched); characterised from general knowledge, mark as unverified.

### 11.1 M5-pdf-spike (2026-10-10) — implementation notes and go/no-go
**Built.** `src-tauri/src/pdf.rs`: `pdf_render(html, destPath, opts?)` async command (`opts = {paper:"A4"|"Letter", landscape, scale}`, unknown keys rejected) → `{path, bytes, pages}` or `{code, message, unsupported}`. Flow (Windows): validate (scale 0.1–2.0, HTML non-empty and ≤ 32 MB, path via `userfiles::validate_save_path(.., ["pdf"])`) → global print lock → hidden `WebviewWindowBuilder` (`visible(false)`, `skip_taskbar`, `on_navigation` locked to `tauri://localhost` / `http(s)://tauri.localhost`) on `WebviewUrl::App("print-host.html")` → wait `PageLoadEvent::Finished` → `eval_with_callback("…__dcPrintHost.render(<json>)")` → poll `__dcPrintHost.state` every 50 ms until `ready` → `with_webview`: `ICoreWebView2Controller::CoreWebView2().cast::<ICoreWebView2_7>()`, `environment().cast::<ICoreWebView2Environment6>().CreatePrintSettings()` (paper in inches, orientation, scale, §6 margins, `ShouldPrintBackgrounds=true`, `ShouldPrintHeaderAndFooter=false`) → `PrintToPdf(tmp, settings, PrintToPdfCompletedHandler)` into a hidden sibling temp file → check `%PDF-` + `%%EOF` → rename over the destination → `userfiles::record_written` → destroy window. One 20 s deadline covers every step (AC-7). A runtime without `ICoreWebView2_7`/`Environment6` maps to `unsupported`. Only Tauri's `eval_with_callback` is used for JS↔Rust, so the print window needs no capability/IPC permission (it is in no capability file). `app/print-host.{html,js}`: module script, parses the report with `DOMParser`, strips script/iframe/object/embed/base/meta-refresh/form, `on*` attributes, remote/`javascript:` URLs, `@import` and remote `url()`; adopts `<style>`/same-origin `<link rel=stylesheet>` and body; waits `document.fonts.ready` + images (5 s cap) + one macrotask (no rAF: it stalls in hidden windows); states `idle → loading → ready | error`. Non-Windows: same validation, then `{code:"unsupported", unsupported:true}`; the UI uses the AC-6 iframe fallback.
**Verified here (Linux).** 12 unit tests in `pdf.rs` (options, scale range, paper inches, HTML caps, path refusals incl. relative/extension/missing folder/`CON`, error JSON, navigation allowlist, page counter, `%PDF-`/`%%EOF` check, temp path, non-Windows stub). Windows code type-checked and clippy-clean with `cargo check/clippy --target x86_64-pc-windows-msvc --tests` (APIs checked against webview2-com 0.39.1 / windows 0.62.2 / tauri 2.12.1 sources). The print host was exercised in Playwright Chromium under the app CSP: injected `<script>`, `onerror`, `javascript:` link, remote stylesheet and `@import` all removed; the 160-row fixture printed to an 18 KB `%PDF-` file.
**Windows CI step (to add to `windows-rust-tests` or `windows-build.yml`; owned by the CI job, not this spike):**
```yaml
- name: PDF spike (WebView2 PrintToPdf)
  run: cargo test --manifest-path src-tauri/Cargo.toml --lib pdf::windows_spike -- --ignored --nocapture --test-threads=1
  env:
    DECKCHEK_PDF_SPIKE_DIR: ${{ runner.temp }}\deckchek-pdf-spike
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: pdf-spike
    path: ${{ runner.temp }}\deckchek-pdf-spike
    if-no-files-found: ignore
```
The test builds a Tauri app with `any_thread()` and no main window, renders the fixed report (`spike_fixture_html()`, ~4 A4 pages with `@page`, a repeating `thead`, an SVG chart) once in a hidden window and once in an off-screen visible window, prints one `PDF-SPIKE mode=… took=…ms result=…` line per mode, and asserts the hidden-window file starts with `%PDF-` and is > 5 KB.
**Go/no-go for M5-pdf (decided from the CI log + artifact):**
- **GO** (Option A as specified) if the hidden-mode run passes, takes < 10 s on the runner, and the artifact opens in Edge with selectable text, the SVG as vectors, the chip fill printed, and `thead` repeated on page 2.
- **GO with off-screen window** if hidden fails (timeout in `PrintToPdf` or load) but off-screen passes: M5-pdf switches `HostMode::Hidden` → `Offscreen` (one-line change) and keeps everything else.
- **NO-GO** (fall back to AC-6 iframe print + HTML export for all platforms in v0.0.5, revisit Option E) if both modes fail, or either exceeds 20 s, or `cast::<ICoreWebView2_7>` returns `unsupported` on the runner's evergreen runtime.
- **Open for M5-pdf (does not block GO):** whether `@page` margin boxes (`counter(pages)`) render in the runner's WebView2 (inspect the artifact's page footer; if absent use the §4 fallback); whether CSS `@page` margins override the explicit `PrintSettings` margins (they are set to the same §6 values, so either way the layout is correct); the `pages` count heuristic (`/Type /Page` scan) vs `lopdf` for AC-2.
