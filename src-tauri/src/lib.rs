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
mod app_state;
mod usage;
mod processes;
mod audio_out;
// [FS-01] mods
mod wizard;
// [FS-02] mods
mod diagnostics;
// [FS-03] mods
mod pdf;
// [FS-06] mods
mod media;
// [FS-07] mods
mod links;
// [FS-08] mods
mod backup;
// [FS-10] mods
mod pregig;
// [FS-11] mods
mod latency;
// [FS-12] mods
mod stylus;
mod dj_sessions;
// [FS-13] mods
mod wearmap;
// [FS-14] mods
mod scratch;
// [FS-15] mods
mod humrun;
#[cfg(test)]
mod audit_repro; // docs/audit/2026-10-bug-hunt.md failing repros (all #[ignore])
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
    let app = tauri::Builder::default()
        .manage(capture::LiveCaptureState::default())
        .manage(midi::MidiState::default())
        .invoke_handler(tauri::generate_handler![
            commands::initialize_database, commands::save_diagnostic_run,
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
            capture::capture_lease_acquire, capture::capture_lease_release, capture::capture_lease_status, capture::capture_preempt,
            capture::start_stream_capture, capture::stream_capture_ack, capture::stop_stream_capture,
            userfiles::userfiles_write_text, userfiles::userfiles_write_folder,
            app_state::app_state_get, app_state::app_state_set, app_state::app_state_delete,
            usage::usage_add, usage::usage_list, usage::usage_delete, usage::usage_confirm,
            processes::dj_processes, processes::top_cpu,
            audio_out::list_native_audio_outputs, audio_out::audio_play_buffer, audio_out::audio_play_tone,
            audio_out::audio_set_level, audio_out::audio_stop, audio_out::audio_stop_all, audio_out::audio_out_status,
            // [FS-01] handlers
            wizard::wizard_state_get, wizard::wizard_state_save, wizard::wizard_create_assets,
            wizard::wizard_apply_gear, wizard::wizard_has_user_data,
            // [FS-02] handlers
            diagnostics::log_client_error, diagnostics::diagnostics_status, diagnostics::diagnostics_ack_crash,
            diagnostics::diagnostics_preview, diagnostics::diagnostics_create_bundle,
            // [FS-03] handlers
            pdf::pdf_render,
            // [FS-06] handlers
            media::media_profiles_sync, media::media_list, media::media_custom_save, media::media_custom_delete, media::media_owned_set,
            // [FS-07] handlers
            links::open_external_url, links::open_path, links::reveal_path,
            // [FS-08] handlers
            backup::backup_create, backup::backup_inspect, backup::backup_restore, backup::backup_list,
            backup::backup_settings_get, backup::backup_settings_set, backup::backup_import_workspace,
            // [FS-10] handlers
            pregig::pregig_processes, pregig::pregig_save_run, pregig::pregig_list_runs, pregig::pregig_get_run,
            pregig::pregig_preset_upsert, pregig::pregig_preset_list, pregig::pregig_preset_delete,
            // [FS-11] handlers
            latency::audio_device_buffer_info, latency::latency_play_and_capture, latency::stress_run, latency::latency_abort,
            latency::windows_tuning_scan, latency::latency_run_save, latency::latency_run_list, latency::latency_run_delete,
            latency::buffer_recommendation_save, latency::buffer_recommendation_latest,
            // [FS-12] handlers
            stylus::stylus_benchmark_save, stylus::stylus_benchmark_list, stylus::stylus_alert_snooze, stylus::stylus_alert_list,
            stylus::stylus_baseline, stylus::stylus_replace, stylus::stylus_rated_life_set, stylus::stylus_rated_life_get,
            dj_sessions::dj_session_spans, commands::list_capture_sessions,
            // [FS-13] handlers
            wearmap::wearmap_save, wearmap::wearmap_list, wearmap::wearmap_get, wearmap::wearmap_delete,
            wearmap::wearmap_records_list, wearmap::wearmap_record_save,
            // [FS-14] handlers
            scratch::scratch_save, scratch::scratch_list, scratch::scratch_get, scratch::scratch_delete,
            // [FS-15] handlers
            humrun::hum_run_save, humrun::hum_run_list, humrun::hum_run_get, humrun::hum_run_delete,
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
            _app.handle().plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())?;
            // [FS-01] setup
            // [FS-02] setup
            diagnostics::setup(_app);
            // Panic hooks run last-installed first: the audio kill switches are
            // installed after the diagnostics hook so a panic silences output
            // before the backtrace is symbolised and logged (BUG-03).
            audio_out::install_panic_guard();
            // [FS-03] setup
            // [FS-06] setup
            // [FS-07] setup
            _app.handle().plugin(links::navigation_guard())?;
            // [FS-08] setup
            backup::setup(_app.handle());
            // [FS-10] setup
            // [FS-11] setup
            latency::install_panic_guard();
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
            // [FS-02] `--debug-crash` (debug builds, or DECKCHEK_ALLOW_DEBUG_CRASH=1): last, so the panic goes through every hook above
            diagnostics::debug_crash_if_requested(_app);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building DeckChek");
    app.run(|app, event| {
        // [FS-00] run events: audio_out silences output on main-window close and exit
        audio_out::on_run_event(&event);
        // [FS-02] run events: crash marker removed on RunEvent::Exit
        diagnostics::on_run_event(app, &event);
        // [FS-08] run events: on-exit backup on ExitRequested / Exit
        backup::on_run_event(app, &event);
    });
}
