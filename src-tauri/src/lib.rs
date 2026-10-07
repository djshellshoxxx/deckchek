mod catalog;
mod commands;
mod audio;
mod capture;
mod db;
mod system_check;
pub mod domain;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(capture::LiveCaptureState::default())
        .invoke_handler(tauri::generate_handler![
            commands::runtime_status, commands::initialize_database, commands::save_diagnostic_run,
            commands::list_runs, commands::get_run, commands::save_scan_alignment,
            audio::list_native_audio_inputs, audio::capture_native_audio,
            capture::start_live_capture, capture::stop_live_capture, capture::live_capture_status,
            catalog::catalog_list, catalog::catalog_upsert, catalog::catalog_delete,
            system_check::system_scan_drivers, system_check::system_scan_events, system_check::system_scan_dj_logs
        ])
        .run(tauri::generate_context!())
        .expect("error while running DeckChek");
}
