mod catalog;
mod commands;
mod audio;
mod db;
pub mod domain;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::runtime_status, commands::initialize_database, commands::save_diagnostic_run, audio::list_native_audio_inputs, audio::capture_native_audio,
            catalog::catalog_list, catalog::catalog_upsert, catalog::catalog_delete,
            commands::list_runs, commands::get_run, commands::save_scan_alignment])
        .run(tauri::generate_context!())
        .expect("error while running DeckChek");
}
