use tauri::AppHandle;

use crate::db::{database_path, get_run as db_get_run, list_capture_sessions as db_list_capture_sessions, list_runs as db_list_runs, CaptureSession, open_database, persist_run, save_scan_alignment as db_save_alignment, PersistRun, RunSummary, ScanAlignmentInput, ScanAlignmentSaved};

#[tauri::command]
pub async fn initialize_database(app: AppHandle) -> Result<String, String> {
    crate::db::off_main(move || {
        let path = database_path(&app)?;
        open_database(&path)?;
        Ok(path.to_string_lossy().to_string())
    })
    .await?
}

#[tauri::command]
pub async fn save_diagnostic_run(app: AppHandle, run: PersistRun) -> Result<(), String> {
    crate::db::off_main(move || {
        let path = database_path(&app)?;
        let mut conn = open_database(&path)?;
        persist_run(&mut conn, &run)
    })
    .await?
}

#[tauri::command]
pub async fn list_runs(app: AppHandle, limit: Option<u32>) -> Result<Vec<RunSummary>, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        db_list_runs(&conn, limit)
    })
    .await?
}

#[tauri::command]
pub async fn get_run(app: AppHandle, id: String) -> Result<Option<serde_json::Value>, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        db_get_run(&conn, &id)
    })
    .await?
}

#[tauri::command]
pub async fn save_scan_alignment(app: AppHandle, alignment: ScanAlignmentInput) -> Result<ScanAlignmentSaved, String> {
    crate::db::off_main(move || {
        let mut conn = open_database(&database_path(&app)?)?;
        db_save_alignment(&mut conn, &alignment)
    })
    .await?
}

/// Runs with a real capture span (FS-12 AC-2 hours proposals). `since` is a UTC
/// ISO timestamp; `asset_id` matches the run's asset or its setup's components.
#[tauri::command]
pub async fn list_capture_sessions(app: AppHandle, since: Option<String>, asset_id: Option<String>, limit: Option<u32>) -> Result<Vec<CaptureSession>, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        db_list_capture_sessions(&conn, since.as_deref(), asset_id.as_deref(), limit)
    })
    .await?
}
