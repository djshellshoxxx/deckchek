mod catalog;
mod commands;
mod audio;
mod capture;
mod db;
mod devices;
mod midi;
mod system_check;
pub mod domain;
// [FS-00] mods
mod userfiles;
// [FS-01] mods
// [FS-02] mods
mod diagnostics;
// [FS-03] mods
// [FS-06] mods
// [FS-07] mods
// [FS-08] mods
// [FS-10] mods
// [FS-11] mods
// [FS-12] mods
// [FS-13] mods
// [FS-14] mods
// [FS-15] mods
// [FS-20] mods
// [FS-21] mods
// [FS-22] mods
// [FS-23] mods
// [FS-30] mods
// [FS-31] mods
// [FS-32] mods
// [FS-33] mods

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(capture::LiveCaptureState::default())
        .manage(midi::MidiState::default())
        .invoke_handler(tauri::generate_handler![
            commands::runtime_status, commands::initialize_database, commands::save_diagnostic_run,
            commands::list_runs, commands::get_run, commands::save_scan_alignment,
            audio::list_native_audio_inputs, audio::capture_native_audio,
            capture::start_live_capture, capture::stop_live_capture, capture::live_capture_status,
            catalog::catalog_list, catalog::catalog_upsert, catalog::catalog_delete,
            system_check::system_scan_drivers, system_check::system_scan_events, system_check::system_scan_dj_logs,
            midi::midi_list_ports, midi::midi_open_input, midi::midi_close_input, midi::midi_send,
            midi::midi_close_all, midi::midi_status,
            devices::device_profiles_sync, devices::device_test_result_save, devices::device_test_results,
            devices::device_midi_map_save, devices::device_midi_map_get,
            // [FS-00] handlers
            userfiles::userfiles_write_text, userfiles::userfiles_write_folder,
            // [FS-01] handlers
            // [FS-02] handlers
            diagnostics::log_client_error, diagnostics::diagnostics_status, diagnostics::diagnostics_ack_crash,
            diagnostics::diagnostics_preview, diagnostics::diagnostics_create_bundle,
            // [FS-03] handlers
            // [FS-06] handlers
            // [FS-07] handlers
            // [FS-08] handlers
            // [FS-10] handlers
            // [FS-11] handlers
            // [FS-12] handlers
            // [FS-13] handlers
            // [FS-14] handlers
            // [FS-15] handlers
            // [FS-20] handlers
            // [FS-21] handlers
            // [FS-22] handlers
            // [FS-23] handlers
            // [FS-30] handlers
            // [FS-31] handlers
            // [FS-32] handlers
            // [FS-33] handlers
        ])
        .setup(|_app| {
            // [FS-00] setup
            _app.handle().plugin(tauri_plugin_dialog::init())?;
            _app.handle().plugin(tauri_plugin_opener::init())?;
            // [FS-01] setup
            // [FS-02] setup
            diagnostics::setup(_app);
            // [FS-03] setup
            // [FS-06] setup
            // [FS-07] setup
            // [FS-08] setup
            // [FS-10] setup
            // [FS-11] setup
            // [FS-12] setup
            // [FS-13] setup
            // [FS-14] setup
            // [FS-15] setup
            // [FS-20] setup
            // [FS-21] setup
            // [FS-22] setup
            // [FS-23] setup
            // [FS-30] setup
            // [FS-31] setup
            // [FS-32] setup
            // [FS-33] setup
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DeckChek");
}
