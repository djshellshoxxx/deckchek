//! FS-03 PDF rendering (M5 spike). The webview hands us finished report HTML and a
//! save-dialog path; we load `app/print-host.html` in a hidden window, inject the HTML,
//! wait until the host reports `ready`, and call WebView2 `ICoreWebView2_7::PrintToPdf`.
//!
//! Only Windows has a PDF backend. Every other platform returns `PdfError::Unsupported`
//! (serialised with `unsupported: true`) so the UI falls back to the iframe print path
//! (FS-03 AC-6). Inputs are validated on every platform before that check.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::userfiles::{self, UserFileError};

/// FS-03 AC-7: the whole render (window, load, layout, print) must finish within this.
pub const RENDER_TIMEOUT: Duration = Duration::from_secs(20);
/// Reports are generated locally and row-capped; anything bigger is a bug upstream.
pub const MAX_HTML_BYTES: usize = 32 * 1024 * 1024;
/// Page margins from FS-03 §6 (top, right, bottom, left), in millimetres.
#[cfg_attr(not(windows), allow(dead_code))]
pub const MARGINS_MM: [f64; 4] = [18.0, 15.0, 20.0, 15.0];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, Default)]
pub enum Paper {
    #[default]
    A4,
    Letter,
}

impl Paper {
    /// Portrait (width, height) in inches, the unit WebView2 print settings use.
    #[cfg_attr(not(windows), allow(dead_code))]
    pub fn size_inches(self) -> (f64, f64) {
        match self {
            Paper::A4 => (210.0 / 25.4, 297.0 / 25.4),
            Paper::Letter => (8.5, 11.0),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct PdfOptions {
    pub paper: Paper,
    pub landscape: bool,
    pub scale: f64,
}

impl Default for PdfOptions {
    fn default() -> Self {
        Self { paper: Paper::A4, landscape: false, scale: 1.0 }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PdfResult {
    pub path: String,
    pub bytes: u64,
    /// Best-effort count of page objects; `None` when the PDF structure hides them.
    pub pages: Option<u32>,
}

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(not(windows), allow(dead_code))] // Timeout/Host/… only arise in the Windows backend
pub enum PdfError {
    /// No PDF backend on this platform (non-Windows, or WebView2 too old for PrintToPdf).
    Unsupported,
    Path(UserFileError),
    InvalidOptions(&'static str),
    InvalidHtml(&'static str),
    Timeout,
    /// The print host page reported an error (message comes from our own JS, no user data).
    Host(String),
    Webview(String),
    InvalidOutput(&'static str),
    Io(String),
}

impl PdfError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Unsupported => "unsupported",
            Self::Path(e) => e.code(),
            Self::InvalidOptions(_) => "invalid_options",
            Self::InvalidHtml(_) => "invalid_html",
            Self::Timeout => "timeout",
            Self::Host(_) => "print_host",
            Self::Webview(_) => "webview",
            Self::InvalidOutput(_) => "invalid_output",
            Self::Io(_) => "io",
        }
    }
}

impl std::fmt::Display for PdfError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unsupported => write!(f, "PDF export is not supported on this platform; use the print dialog instead"),
            Self::Path(e) => write!(f, "{e}"),
            Self::InvalidOptions(why) => write!(f, "invalid PDF options: {why}"),
            Self::InvalidHtml(why) => write!(f, "invalid report: {why}"),
            Self::Timeout => write!(f, "creating the PDF took longer than {} s", RENDER_TIMEOUT.as_secs()),
            Self::Host(m) => write!(f, "print host failed: {m}"),
            Self::Webview(m) => write!(f, "webview error: {m}"),
            Self::InvalidOutput(why) => write!(f, "PDF output invalid: {why}"),
            Self::Io(m) => write!(f, "write failed: {m}"),
        }
    }
}

impl Serialize for PdfError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("PdfError", 3)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.serialize_field("unsupported", &matches!(self, Self::Unsupported))?;
        st.end()
    }
}

impl From<UserFileError> for PdfError {
    fn from(e: UserFileError) -> Self {
        Self::Path(e)
    }
}

impl From<std::io::Error> for PdfError {
    fn from(e: std::io::Error) -> Self {
        // Kind only: OS messages can embed user paths (FS-02 log rule).
        Self::Io(format!("{:?}", e.kind()))
    }
}

pub fn validate_options(o: &PdfOptions) -> Result<(), PdfError> {
    if !o.scale.is_finite() || !(0.1..=2.0).contains(&o.scale) {
        return Err(PdfError::InvalidOptions("scale must be between 0.1 and 2.0"));
    }
    Ok(())
}

pub fn validate_html(html: &str) -> Result<(), PdfError> {
    if html.trim().is_empty() {
        return Err(PdfError::InvalidHtml("empty"));
    }
    if html.len() > MAX_HTML_BYTES {
        return Err(PdfError::InvalidHtml("too large"));
    }
    Ok(())
}

/// All checks that do not need a webview; shared by every platform so they are testable on Linux.
pub fn validate_request(html: &str, dest_path: &str, opts: &PdfOptions) -> Result<PathBuf, PdfError> {
    validate_options(opts)?;
    validate_html(html)?;
    Ok(userfiles::validate_save_path(dest_path, &["pdf"])?)
}

/// The hidden window may only show our own bundled pages (FS-03 §7).
#[cfg_attr(not(windows), allow(dead_code))]
pub fn is_app_url(url: &tauri::Url) -> bool {
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "http" | "https" => url.host_str() == Some("tauri.localhost"),
        _ => false,
    }
}

/// Counts `/Type /Page` objects (not `/Pages`). Chromium/Skia writes page dictionaries
/// uncompressed, so this is reliable for WebView2 output; returns `None` when zero.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn count_pdf_pages(bytes: &[u8]) -> Option<u32> {
    let mut n = 0u32;
    let mut i = 0;
    while i + 5 <= bytes.len() {
        if &bytes[i..i + 5] == b"/Type" {
            let mut j = i + 5;
            while j < bytes.len() && matches!(bytes[j], b' ' | b'\r' | b'\n' | b'\t') {
                j += 1;
            }
            if bytes[j..].starts_with(b"/Page") {
                let after = bytes.get(j + 5).copied();
                if !matches!(after, Some(c) if c.is_ascii_alphanumeric()) {
                    n += 1;
                }
            }
            i = j;
        } else {
            i += 1;
        }
    }
    (n > 0).then_some(n)
}

/// Checks the written file looks like a PDF and returns its size.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn check_pdf_bytes(bytes: &[u8]) -> Result<(), PdfError> {
    if !bytes.starts_with(b"%PDF-") {
        return Err(PdfError::InvalidOutput("missing %PDF- header"));
    }
    if !bytes.windows(5).rev().take(1024).any(|w| w == b"%%EOF") {
        return Err(PdfError::InvalidOutput("missing %%EOF trailer"));
    }
    Ok(())
}

/// Temporary sibling the webview prints into; renamed over `dest` only after it validates.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn temp_path_for(dest: &Path) -> PathBuf {
    let name = dest.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    dest.with_file_name(format!(".{name}.{}.deckchek-tmp.pdf", std::process::id()))
}

/// Renders `html` to `dest_path`. Blocking: call from a worker thread, never the UI thread.
pub fn render_to_file<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    html: &str,
    dest_path: &str,
    opts: &PdfOptions,
) -> Result<PdfResult, PdfError> {
    #[cfg(windows)]
    {
        let dest = validate_request(html, dest_path, opts)?;
        host::render(app, html, &dest, opts, host::HostMode::Hidden)
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        render_unsupported(html, dest_path, opts)
    }
}

/// Non-Windows backend: validates like Windows does, then reports `Unsupported` (AC-6 fallback).
#[cfg(not(windows))]
fn render_unsupported(html: &str, dest_path: &str, opts: &PdfOptions) -> Result<PdfResult, PdfError> {
    validate_request(html, dest_path, opts)?;
    Err(PdfError::Unsupported)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn pdf_render(
    app: tauri::AppHandle,
    html: String,
    destPath: String,
    opts: Option<PdfOptions>,
) -> Result<PdfResult, PdfError> {
    let opts = opts.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || render_to_file(&app, &html, &destPath, &opts))
        .await
        .map_err(|_| PdfError::Webview("render task failed".into()))?
}

/// Hidden-window orchestration. Windows only: it is the sole caller of the print backend.
#[cfg(windows)]
mod host {
    use super::*;
    use std::sync::{mpsc, Mutex, OnceLock};
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::time::Instant;
    use tauri::webview::PageLoadEvent;
    use tauri::{WebviewUrl, WebviewWindow, WebviewWindowBuilder};

    const POLL_JS: &str = "(function(){var h=window.__dcPrintHost;\
        return h?(h.state+(h.error?':'+h.error:'')):'missing';})()";

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    #[allow(dead_code)] // Offscreen is exercised by the Windows spike test as a fallback probe.
    pub enum HostMode {
        /// `visible(false)`: preferred, nothing flashes on screen.
        Hidden,
        /// Visible but parked far off-screen: fallback if WebView2 will not print while hidden.
        Offscreen,
    }

    fn print_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn remaining(deadline: Instant) -> Result<Duration, PdfError> {
        deadline.checked_duration_since(Instant::now()).filter(|d| !d.is_zero()).ok_or(PdfError::Timeout)
    }

    pub fn render<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        html: &str,
        dest: &Path,
        opts: &PdfOptions,
        mode: HostMode,
    ) -> Result<PdfResult, PdfError> {
        // PrintToPdf allows one job per webview; one at a time overall keeps it simple (FS-03 §7).
        let _guard = print_lock().lock().unwrap_or_else(|e| e.into_inner());
        let deadline = Instant::now() + RENDER_TIMEOUT;
        static SEQ: AtomicU32 = AtomicU32::new(0);
        let label = format!("deckchek-print-{}", SEQ.fetch_add(1, Ordering::Relaxed));

        let (load_tx, load_rx) = mpsc::channel::<()>();
        let load_tx = Mutex::new(load_tx);
        let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("print-host.html".into()))
            .title("DeckChek PDF")
            .inner_size(900.0, 1200.0)
            .focused(false)
            .skip_taskbar(true)
            .visible(mode == HostMode::Offscreen)
            .on_navigation(is_app_url)
            .on_page_load(move |_w, p| {
                if p.event() == PageLoadEvent::Finished && p.url().path().ends_with("print-host.html") {
                    if let Ok(tx) = load_tx.lock() {
                        let _ = tx.send(());
                    }
                }
            });
        if mode == HostMode::Offscreen {
            builder = builder.position(-32000.0, -32000.0);
        }
        let win = builder.build().map_err(|e| PdfError::Webview(format!("create window: {e}")))?;

        let tmp = temp_path_for(dest);
        let result = run_in_window(&win, &load_rx, html, &tmp, opts, deadline).and_then(|()| finish(&tmp, dest));
        let _ = win.destroy();
        if result.is_err() {
            let _ = std::fs::remove_file(&tmp);
        }
        result
    }

    fn run_in_window<R: tauri::Runtime>(
        win: &WebviewWindow<R>,
        load_rx: &mpsc::Receiver<()>,
        html: &str,
        tmp: &Path,
        opts: &PdfOptions,
        deadline: Instant,
    ) -> Result<(), PdfError> {
        load_rx.recv_timeout(remaining(deadline)?).map_err(|_| PdfError::Timeout)?;
        let literal = serde_json::to_string(html).map_err(|_| PdfError::InvalidHtml("not encodable"))?;
        // render() returns the new state synchronously, so a missing host fails fast instead of timing out.
        let js = format!("(function(){{var h=window.__dcPrintHost;return h?h.render({literal}):'missing';}})()");
        match eval_string(win, js, deadline)?.as_str() {
            "loading" | "ready" => {}
            "missing" => return Err(PdfError::Host("print host script did not load".into())),
            _ => {} // "error": wait_ready reports the host's message
        }
        wait_ready(win, deadline)?;
        super::win::print_to_pdf(win, tmp, opts, remaining(deadline)?)
    }

    /// Runs `js` and returns its result when it is a string ("" otherwise).
    fn eval_string<R: tauri::Runtime>(win: &WebviewWindow<R>, js: String, deadline: Instant) -> Result<String, PdfError> {
        let (tx, rx) = mpsc::channel::<String>();
        win.eval_with_callback(js, move |json| {
            let _ = tx.send(json);
        })
        .map_err(|e| PdfError::Webview(format!("eval: {e}")))?;
        let json = rx.recv_timeout(remaining(deadline)?).map_err(|_| PdfError::Timeout)?;
        Ok(serde_json::from_str::<String>(&json).unwrap_or_default())
    }

    fn wait_ready<R: tauri::Runtime>(win: &WebviewWindow<R>, deadline: Instant) -> Result<(), PdfError> {
        loop {
            let state = eval_string(win, POLL_JS.to_string(), deadline)?;
            match state.as_str() {
                "ready" => return Ok(()),
                "loading" => {}
                "idle" | "missing" | "" => return Err(PdfError::Host(format!("unexpected state '{state}'"))),
                s => {
                    let msg = s.strip_prefix("error:").unwrap_or(s);
                    return Err(PdfError::Host(msg.chars().take(200).collect()));
                }
            }
            std::thread::sleep(Duration::from_millis(50).min(remaining(deadline)?));
        }
    }

    fn finish(tmp: &Path, dest: &Path) -> Result<PdfResult, PdfError> {
        let bytes = std::fs::read(tmp)?;
        check_pdf_bytes(&bytes)?;
        std::fs::rename(tmp, dest)?;
        userfiles::record_written(dest);
        Ok(PdfResult {
            path: dest.to_string_lossy().into_owned(),
            bytes: bytes.len() as u64,
            pages: count_pdf_pages(&bytes),
        })
    }
}

/// The only COM code: `ICoreWebView2_7::PrintToPdf` with explicit print settings.
#[cfg(windows)]
mod win {
    use super::*;
    use std::sync::mpsc;
    use tauri::WebviewWindow;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2PrintSettings, ICoreWebView2_7,
        COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    const MM_PER_INCH: f64 = 25.4;

    fn apply_settings(s: &ICoreWebView2PrintSettings, o: &PdfOptions) -> windows::core::Result<()> {
        let (w, h) = o.paper.size_inches();
        let [top, right, bottom, left] = MARGINS_MM;
        unsafe {
            s.SetOrientation(if o.landscape {
                COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE
            } else {
                COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT
            })?;
            s.SetPageWidth(w)?;
            s.SetPageHeight(h)?;
            s.SetScaleFactor(o.scale)?;
            s.SetMarginTop(top / MM_PER_INCH)?;
            s.SetMarginRight(right / MM_PER_INCH)?;
            s.SetMarginBottom(bottom / MM_PER_INCH)?;
            s.SetMarginLeft(left / MM_PER_INCH)?;
            // Severity chips keep their fill (FS-03 §6); pagination comes from our CSS, not the browser.
            s.SetShouldPrintBackgrounds(true)?;
            s.SetShouldPrintHeaderAndFooter(false)?;
        }
        Ok(())
    }

    pub fn print_to_pdf<R: tauri::Runtime>(
        win: &WebviewWindow<R>,
        path: &Path,
        opts: &PdfOptions,
        timeout: Duration,
    ) -> Result<(), PdfError> {
        let (tx, rx) = mpsc::channel::<Result<(), PdfError>>();
        let start_tx = tx.clone();
        let path = path.to_path_buf();
        let opts = opts.clone();
        win.with_webview(move |pw| {
            // Runs on the UI thread. Must not block: completion arrives via the handler.
            let start = || -> Result<(), PdfError> {
                let core = unsafe { pw.controller().CoreWebView2() }
                    .map_err(|e| PdfError::Webview(format!("CoreWebView2: {e}")))?;
                // ICoreWebView2_7 / Environment6 exist from runtime 1.0.1020.30; older runtimes = unsupported.
                let core7: ICoreWebView2_7 = core.cast().map_err(|_| PdfError::Unsupported)?;
                let env6: ICoreWebView2Environment6 = pw.environment().cast().map_err(|_| PdfError::Unsupported)?;
                let settings = unsafe { env6.CreatePrintSettings() }
                    .map_err(|e| PdfError::Webview(format!("CreatePrintSettings: {e}")))?;
                apply_settings(&settings, &opts)
                    .map_err(|e| PdfError::Webview(format!("print settings: {e}")))?;
                let done = tx.clone();
                let handler = PrintToPdfCompletedHandler::create(Box::new(move |hr, ok| {
                    let _ = done.send(match hr {
                        Ok(()) if ok => Ok(()),
                        Ok(()) => Err(PdfError::Webview("PrintToPdf reported failure".into())),
                        Err(e) => Err(PdfError::Webview(format!("PrintToPdf: {e}"))),
                    });
                    Ok(())
                }));
                let wide = HSTRING::from(path.as_os_str());
                unsafe { core7.PrintToPdf(&wide, &settings, &handler) }
                    .map_err(|e| PdfError::Webview(format!("PrintToPdf: {e}")))
            };
            if let Err(e) = start() {
                let _ = start_tx.send(Err(e));
            }
        })
        .map_err(|e| PdfError::Webview(format!("with_webview: {e}")))?;
        rx.recv_timeout(timeout).map_err(|_| PdfError::Timeout)?
    }
}

/// A fixed multi-page report used by the spike tests (and handy for manual checks).
#[cfg(test)]
pub fn spike_fixture_html() -> String {
    let mut rows = String::new();
    for i in 1..=160 {
        rows.push_str(&format!(
            "<tr><td>{i}</td><td>Technics SL-1200MK4 speed check #{i}</td><td>{:.2}%</td><td>{}</td></tr>",
            (i as f64 * 0.013).sin() * 0.4,
            if i % 7 == 0 { "warn" } else { "pass" }
        ));
    }
    format!(
        r##"<!doctype html><html lang="en"><head><meta charset="utf-8"><title>DeckChek PDF spike</title>
<style>
@page {{ size: A4; margin: 18mm 15mm 20mm; @bottom-right {{ content: "Page " counter(page) " of " counter(pages); }} }}
body {{ font-family: "Segoe UI", system-ui, sans-serif; font-size: 10pt; color: #111; background: #fff; }}
h1 {{ font-size: 16pt; }} table {{ width: 100%; border-collapse: collapse; }}
thead {{ display: table-header-group; }} tr {{ break-inside: avoid; }}
td, th {{ border: 0.75pt solid #999; padding: 2pt 4pt; }} .chip {{ background: #fde68a; padding: 1pt 4pt; }}
</style></head><body>
<h1>DeckChek PDF spike report</h1>
<p>Fixed content for the FS-03 PrintToPdf spike. <span class="chip">warn</span> chips keep their fill.</p>
<svg viewBox="0 0 400 120" width="100%" role="img" aria-label="Speed deviation chart">
<polyline fill="none" stroke="#1d4ed8" stroke-width="1.5" points="0,60 50,40 100,70 150,30 200,65 250,45 300,80 350,50 400,60"/>
<text x="4" y="14" font-size="10">Speed deviation (%)</text></svg>
<table><thead><tr><th>#</th><th>Check</th><th>Deviation</th><th>Result</th></tr></thead><tbody>{rows}</tbody></table>
</body></html>"##
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("deckchek-pdf-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn options_default_and_parse() {
        let o: PdfOptions = serde_json::from_str("{}").unwrap();
        assert_eq!(o, PdfOptions::default());
        let o: PdfOptions = serde_json::from_str(r#"{"paper":"Letter","landscape":true,"scale":0.5}"#).unwrap();
        assert_eq!(o.paper, Paper::Letter);
        assert!(o.landscape);
        assert!(serde_json::from_str::<PdfOptions>(r#"{"paper":"A3"}"#).is_err());
        assert!(serde_json::from_str::<PdfOptions>(r#"{"bogus":1}"#).is_err());
    }

    #[test]
    fn scale_range_enforced() {
        for bad in [0.0, 0.09, 2.01, f64::NAN, f64::INFINITY, -1.0] {
            let o = PdfOptions { scale: bad, ..Default::default() };
            assert_eq!(validate_options(&o).unwrap_err().code(), "invalid_options", "{bad}");
        }
        for ok in [0.1, 1.0, 2.0] {
            assert!(validate_options(&PdfOptions { scale: ok, ..Default::default() }).is_ok());
        }
    }

    #[test]
    fn paper_sizes_in_inches() {
        let (w, h) = Paper::A4.size_inches();
        assert!((w - 8.2677).abs() < 1e-3 && (h - 11.6929).abs() < 1e-3);
        assert_eq!(Paper::Letter.size_inches(), (8.5, 11.0));
    }

    #[test]
    fn html_validation() {
        assert_eq!(validate_html("  \n").unwrap_err(), PdfError::InvalidHtml("empty"));
        assert!(validate_html("<p>x</p>").is_ok());
        let big = "x".repeat(MAX_HTML_BYTES + 1);
        assert_eq!(validate_html(&big).unwrap_err(), PdfError::InvalidHtml("too large"));
    }

    #[test]
    fn request_refuses_bad_paths() {
        let o = PdfOptions::default();
        let d = tmp("paths");
        assert_eq!(validate_request("<p>x</p>", "report.pdf", &o).unwrap_err().code(), "relative_path");
        let txt = d.join("report.txt");
        assert_eq!(validate_request("<p>x</p>", txt.to_str().unwrap(), &o).unwrap_err().code(), "bad_extension");
        let missing = d.join("nope").join("r.pdf");
        assert_eq!(validate_request("<p>x</p>", missing.to_str().unwrap(), &o).unwrap_err().code(), "not_found");
        let con = d.join("CON.pdf");
        assert_eq!(validate_request("<p>x</p>", con.to_str().unwrap(), &o).unwrap_err().code(), "reserved_name");
        let good = d.join("DeckChek_Run_sl-1200_20261010-1200.pdf");
        assert_eq!(validate_request("<p>x</p>", good.to_str().unwrap(), &o).unwrap(), good);
    }

    #[test]
    fn error_serialises_with_code_and_unsupported_flag() {
        let v = serde_json::to_value(PdfError::Unsupported).unwrap();
        assert_eq!(v["code"], "unsupported");
        assert_eq!(v["unsupported"], true);
        assert!(v["message"].as_str().unwrap().contains("not supported"));
        let v = serde_json::to_value(PdfError::Timeout).unwrap();
        assert_eq!(v["unsupported"], false);
        assert!(v["message"].as_str().unwrap().contains("20 s"));
        let v = serde_json::to_value(PdfError::from(UserFileError::Relative)).unwrap();
        assert_eq!(v["code"], "relative_path");
    }

    #[test]
    fn navigation_is_locked_to_app_origin() {
        let ok = ["tauri://localhost/print-host.html", "http://tauri.localhost/print-host.html", "https://tauri.localhost/x"];
        for u in ok {
            assert!(is_app_url(&tauri::Url::parse(u).unwrap()), "{u}");
        }
        let bad = [
            "https://example.com/",
            "http://tauri.localhost.evil.com/",
            "file:///C:/Windows/win.ini",
            "data:text/html,<p>x</p>",
            "javascript:alert(1)",
            "tauri://evil/x",
            "about:blank",
        ];
        for u in bad {
            assert!(!is_app_url(&tauri::Url::parse(u).unwrap()), "{u}");
        }
    }

    #[test]
    fn page_counter_ignores_pages_tree() {
        let pdf = b"%PDF-1.4\n1 0 obj<</Type /Pages /Kids[2 0 R 3 0 R]/Count 2>>endobj\n\
            2 0 obj<</Type /Page/Parent 1 0 R>>endobj\n3 0 obj<</Type/Page /Parent 1 0 R>>endobj\n%%EOF\n";
        assert_eq!(count_pdf_pages(pdf), Some(2));
        assert_eq!(count_pdf_pages(b"%PDF-1.7 compressed only %%EOF"), None);
        assert_eq!(count_pdf_pages(b"/Type"), None);
    }

    #[test]
    fn pdf_bytes_check() {
        assert!(check_pdf_bytes(b"%PDF-1.4\n...\n%%EOF\n").is_ok());
        assert_eq!(check_pdf_bytes(b"<html>").unwrap_err().code(), "invalid_output");
        assert_eq!(check_pdf_bytes(b"%PDF-1.4 truncated").unwrap_err().code(), "invalid_output");
    }

    #[test]
    fn temp_path_is_hidden_sibling_with_pdf_ext() {
        let dest = std::env::temp_dir().join("Report.pdf");
        let t = temp_path_for(&dest);
        assert_eq!(t.parent(), dest.parent());
        let name = t.file_name().unwrap().to_str().unwrap();
        assert!(name.starts_with(".Report.pdf.") && name.ends_with(".deckchek-tmp.pdf"), "{name}");
    }

    #[test]
    fn fixture_is_static_paged_report() {
        let html = spike_fixture_html();
        assert!(html.contains("@page") && html.contains("<svg") && !html.contains("<script"));
        assert!(html.len() > 5 * 1024);
        assert!(validate_html(&html).is_ok());
    }

    #[cfg(not(windows))]
    #[test]
    fn non_windows_reports_unsupported_after_validation() {
        // Bad input is still reported precisely; valid input gets the clear Unsupported error.
        let d = tmp("stub");
        let good = d.join("r.pdf");
        let o = PdfOptions::default();
        assert_eq!(render_unsupported("<p>x</p>", good.to_str().unwrap(), &o).unwrap_err(), PdfError::Unsupported);
        assert_eq!(render_unsupported("<p>x</p>", "r.pdf", &o).unwrap_err().code(), "relative_path");
        assert_eq!(render_unsupported("", good.to_str().unwrap(), &o).unwrap_err().code(), "invalid_html");
        assert!(!good.exists(), "stub never writes a file");
    }
}

/// Windows spike: renders the fixed report through a real hidden WebView2 window.
/// Run on a Windows machine or CI runner (WebView2 runtime present):
///   cargo test --manifest-path src-tauri/Cargo.toml --lib pdf::windows_spike -- --ignored --nocapture --test-threads=1
/// Writes `spike-hidden.pdf` and `spike-offscreen.pdf` into `$DECKCHEK_PDF_SPIKE_DIR`
/// (default `%TEMP%\deckchek-pdf-spike`) so CI can upload them as artifacts.
/// Prints one `PDF-SPIKE mode=… took=… result=…` line per window mode for the go/no-go record.
#[cfg(all(test, windows))]
mod windows_spike {
    use super::*;
    use std::sync::mpsc;
    use tauri::RunEvent;

    #[test]
    #[ignore = "needs a Windows desktop session with the WebView2 runtime; run with --ignored"]
    fn print_to_pdf_writes_real_pdf() {
        let out_dir = std::env::var_os("DECKCHEK_PDF_SPIKE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::temp_dir().join("deckchek-pdf-spike"));
        std::fs::create_dir_all(&out_dir).unwrap();
        let mut ctx = tauri::generate_context!();
        ctx.config_mut().app.windows.clear(); // no main app window in the test
        let app = tauri::Builder::default()
            .any_thread()
            .build(ctx)
            .expect("build tauri app");
        let handle = app.handle().clone();
        let (ready_tx, ready_rx) = mpsc::channel::<()>();
        let (done_tx, done_rx) = mpsc::channel();
        let dir = out_dir.clone();
        std::thread::spawn(move || {
            let _ = ready_rx.recv_timeout(Duration::from_secs(30));
            let html = spike_fixture_html();
            let mut results = Vec::new();
            for (mode, name) in [(host::HostMode::Hidden, "spike-hidden.pdf"), (host::HostMode::Offscreen, "spike-offscreen.pdf")] {
                let dest = dir.join(name);
                let _ = std::fs::remove_file(&dest);
                let started = std::time::Instant::now();
                let r = validate_request(&html, dest.to_str().unwrap(), &PdfOptions::default())
                    .and_then(|p| host::render(&handle, &html, &p, &PdfOptions::default(), mode));
                results.push((mode, r, started.elapsed()));
            }
            let _ = done_tx.send(results);
            handle.exit(0);
        });
        let mut ready_tx = Some(ready_tx);
        app.run_return(move |_h, ev| match ev {
            RunEvent::Ready => {
                if let Some(tx) = ready_tx.take() {
                    let _ = tx.send(());
                }
            }
            // Closing the print window leaves zero windows; only exit when the test asks.
            RunEvent::ExitRequested { code: None, api, .. } => api.prevent_exit(),
            _ => {}
        });
        let results = done_rx.recv_timeout(Duration::from_secs(5)).expect("spike thread finished");
        for (mode, r, took) in &results {
            println!("PDF-SPIKE mode={mode:?} took={}ms result={r:?}", took.as_millis());
        }
        let (_, hidden, _) = &results[0];
        let res = hidden.as_ref().expect("hidden-window PrintToPdf succeeded (see PDF-SPIKE lines)");
        let bytes = std::fs::read(&res.path).unwrap();
        assert!(bytes.starts_with(b"%PDF-"), "file starts with %PDF-");
        assert!(bytes.len() > 5 * 1024, "PDF larger than 5 KB, got {}", bytes.len());
        assert_eq!(res.bytes as usize, bytes.len());
        println!("PDF-SPIKE pages={:?} (fixture is ~4 A4 pages)", res.pages);
    }
}
