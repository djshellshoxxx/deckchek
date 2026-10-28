//! `--self-test=<report.json>`: release-artifact smoke test (DeckChek original work).
//!
//! The packaged app starts normally (real WebView, real bundled UI assets), the front end
//! analyses a known synthetic tone with the shipping measurement code and reports back through
//! `self_test_report`; Rust adds its own checks (database opens, migrations applied), writes
//! the JSON report and exits: 0 = pass, 1 = a check failed, 3 = no report within the timeout.
//! Nothing is uploaded; the report holds versions, check names and numbers only (no paths).

use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

pub const SELF_TEST_ARG: &str = "--self-test=";
const TIMEOUT: Duration = Duration::from_secs(120);
const MAX_REPORT_BYTES: usize = 64 * 1024;

static OUT: OnceLock<PathBuf> = OnceLock::new();

/// Parses `--self-test=<path>`; the report must be a `.json` file. Pure for tests.
pub fn parse_args(args: &[String]) -> Result<Option<PathBuf>, String> {
    let Some(raw) = args.iter().find_map(|a| a.strip_prefix(SELF_TEST_ARG)) else { return Ok(None) };
    let p = PathBuf::from(raw);
    if raw.is_empty() || p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("json")) != Some(true) {
        return Err("--self-test needs a report path ending in .json".into());
    }
    Ok(Some(p))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Report<'a> {
    ok: bool,
    app_version: &'a str,
    os: &'a str,
    arch: &'a str,
    native: Vec<Value>,
    ui: Value,
}

fn write_and_exit(app: Option<&AppHandle>, ok: bool, native: Vec<Value>, ui: Value) {
    let report = Report { ok, app_version: env!("CARGO_PKG_VERSION"), os: std::env::consts::OS, arch: std::env::consts::ARCH, native, ui };
    let code = if ok { 0 } else { 1 };
    if let Some(path) = OUT.get() {
        let text = serde_json::to_string_pretty(&report).unwrap_or_else(|_| "{\"ok\":false}".into());
        if std::fs::write(path, text).is_err() {
            std::process::exit(4);
        }
    }
    match app {
        Some(a) => a.exit(code),
        None => std::process::exit(code),
    }
}

/// Called from `setup`: arms the watchdog when the flag is present. Returns whether self-test is active.
pub fn setup() -> bool {
    let args: Vec<String> = std::env::args().collect();
    match parse_args(&args) {
        Ok(None) => false,
        Ok(Some(path)) => {
            let _ = OUT.set(path);
            std::thread::spawn(|| {
                std::thread::sleep(TIMEOUT);
                write_and_exit(None, false, vec![serde_json::json!({"name": "ui report received", "ok": false, "detail": "timeout"})], Value::Null);
                std::process::exit(3);
            });
            true
        }
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(2);
        }
    }
}

/// The front end asks whether to run its self-test.
#[tauri::command]
pub fn self_test_mode() -> bool {
    OUT.get().is_some()
}

fn native_checks(app: &AppHandle) -> Vec<Value> {
    let mut out = Vec::new();
    let db = crate::db::database_path(app).and_then(|p| crate::db::open_database(&p).map(|_| ()));
    out.push(serde_json::json!({"name": "database opens and migrates", "ok": db.is_ok(), "detail": db.err().unwrap_or_default()}));
    out.push(serde_json::json!({"name": "migrations bundled", "ok": !crate::db::MIGRATIONS.is_empty(), "detail": crate::db::MIGRATIONS.len()}));
    out.push(serde_json::json!({"name": "main window exists", "ok": app.get_webview_window("main").is_some(), "detail": ""}));
    out
}

/// The front end's result; Rust adds native checks, writes the report and exits.
#[tauri::command]
pub fn self_test_report(app: AppHandle, report: Value) -> Result<(), String> {
    if OUT.get().is_none() {
        return Err("self-test is not active".into());
    }
    if serde_json::to_vec(&report).map(|v| v.len()).unwrap_or(usize::MAX) > MAX_REPORT_BYTES {
        return Err("report too large".into());
    }
    let native = native_checks(&app);
    let ui_ok = report.get("ok").and_then(Value::as_bool) == Some(true);
    let ok = ui_ok && native.iter().all(|c| c.get("ok").and_then(Value::as_bool) == Some(true));
    write_and_exit(Some(&app), ok, native, report);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn a(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parses_only_a_json_report_path() {
        assert_eq!(parse_args(&a(&["deckchek"])).unwrap(), None);
        assert_eq!(parse_args(&a(&["deckchek", "--self-test=out/r.json"])).unwrap(), Some(PathBuf::from("out/r.json")));
        assert!(parse_args(&a(&["deckchek", "--self-test="])).is_err());
        assert!(parse_args(&a(&["deckchek", "--self-test=r.exe"])).is_err());
        assert_eq!(parse_args(&a(&["deckchek", "--self-test"])).unwrap(), None, "bare flag without a path is ignored, not guessed");
    }
}
