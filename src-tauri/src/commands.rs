use serde::Serialize;
use tauri::AppHandle;

use crate::db::{database_path, get_run as db_get_run, list_capture_sessions as db_list_capture_sessions, list_runs as db_list_runs, CaptureSession, open_database, persist_run, save_scan_alignment as db_save_alignment, PersistRun, RunSummary, ScanAlignmentInput, ScanAlignmentSaved};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub edition: &'static str,
    pub preview_mode: bool,
    pub audio_capture_connected: bool,
    pub persistence_connected: bool,
}

#[tauri::command]
pub fn runtime_status(app: AppHandle) -> RuntimeStatus {
    let persistence_connected = database_path(&app)
        .and_then(|path| open_database(&path).map(|_| path))
        .is_ok();

    RuntimeStatus {
        edition: "vinyl",
        preview_mode: false,
        audio_capture_connected: false,
        persistence_connected,
    }
}

#[tauri::command]
pub fn initialize_database(app: AppHandle) -> Result<String, String> {
    let path = database_path(&app)?;
    open_database(&path)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_diagnostic_run(app: AppHandle, run: PersistRun) -> Result<(), String> {
    let path = database_path(&app)?;
    let mut conn = open_database(&path)?;
    persist_run(&mut conn, &run)
}

#[tauri::command]
pub fn list_runs(app: AppHandle, limit: Option<u32>) -> Result<Vec<RunSummary>, String> {
    let conn = open_database(&database_path(&app)?)?;
    db_list_runs(&conn, limit)
}

#[tauri::command]
pub fn get_run(app: AppHandle, id: String) -> Result<Option<serde_json::Value>, String> {
    let conn = open_database(&database_path(&app)?)?;
    db_get_run(&conn, &id)
}

#[tauri::command]
pub fn save_scan_alignment(app: AppHandle, alignment: ScanAlignmentInput) -> Result<ScanAlignmentSaved, String> {
    let mut conn = open_database(&database_path(&app)?)?;
    db_save_alignment(&mut conn, &alignment)
}

/// Runs with a real capture span (FS-12 AC-2 hours proposals). `since` is a UTC
/// ISO timestamp; `asset_id` matches the run's asset or its setup's components.
#[tauri::command]
pub fn list_capture_sessions(app: AppHandle, since: Option<String>, asset_id: Option<String>, limit: Option<u32>) -> Result<Vec<CaptureSession>, String> {
    let conn = open_database(&database_path(&app)?)?;
    db_list_capture_sessions(&conn, since.as_deref(), asset_id.as_deref(), limit)
}
