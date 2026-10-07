mod commands;
mod audio;
mod capture;
mod db;
pub mod domain;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(capture::LiveCaptureState::default())
        .invoke_handler(tauri::generate_handler![commands::runtime_status, commands::initialize_database, commands::save_diagnostic_run, audio::list_native_audio_inputs, audio::capture_native_audio, capture::start_live_capture, capture::stop_live_capture, capture::live_capture_status])
        .run(tauri::generate_context!())
        .expect("error while running DeckChek");
}
