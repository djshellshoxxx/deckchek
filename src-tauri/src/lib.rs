mod catalog;
mod commands;
mod audio;
mod capture;
mod db;
#[cfg(test)]
mod migration_m7_tests;
mod devices;
mod midi;
mod system_check;
pub mod domain;
// [FS-00] mods
mod selftest; // --self-test=<report.json>: packaged-artifact smoke test (CI release jobs)
pub mod canonical;
pub mod photo; // content-addressed photo store (FS-00 §4.11) // canonical JSON + SHA-256 (FS-00 §4.12); consumed by FS-20/30/33 jobs
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
#[cfg(any(test, feature = "fuzzing"))]
pub mod fuzz_api; // untrusted-input fuzz entry points (cargo-fuzz in src-tauri/fuzz, smoke in cargo test)
#[cfg(test)]
mod stress_tests; // #[ignore] stress/perf: cargo test --release --lib stress_tests -- --ignored
#[cfg(test)]
mod audit_repro; // docs/audit/2026-10-bug-hunt.md failing repros (all #[ignore])
// [FS-20] mods
pub mod signing; // per-install Ed25519 identity (DPAPI on Windows)
pub mod certificate; // used-gear certificates: sign, verify, extract, store
// [FS-21] mods
mod pack;
// [FS-22] mods
mod service;
// [FS-23] mods
mod fleet;
// [FS-30] mods
// [FS-31] mods
mod monitor;
mod tray;
// [FS-32] mods
mod mapper;
// [FS-33] mods
mod ledger;

// [AUD-08] new-window guard: popups (`target=_blank`, a `window.open` that slips past the JS
// override, the WebView context menu's "Open link in new window") never become in-app windows.

/// Decides a new-window request. The caller always denies the in-app window; this hands the URL
/// to the FS-07 policy (`links::open_external_with`) unconfirmed, so only allowlisted https opens
/// in the system browser and everything else is dropped. Logs the host only (Spec 02 log rule).
fn route_new_window(url: &tauri::Url, opener: &dyn links::Opener) -> links::OpenResult {
    let r = links::open_external_with(url.as_str(), false, &links::Allowlist::bundled(), opener);
    eprintln!("[links] new-window request denied in-app host={} opened={} reason={:?}", r.host, r.opened, r.reason);
    r
}

/// The system browser via the opener plugin; a new-window request can only ever open a URL.
struct SystemBrowser<R: tauri::Runtime>(tauri::AppHandle<R>);

impl<R: tauri::Runtime> links::Opener for SystemBrowser<R> {
    fn open_url(&self, url: &str) -> Result<(), String> {
        use tauri_plugin_opener::OpenerExt;
        self.0.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
    }
    fn open_path(&self, _: &std::path::Path) -> Result<(), String> {
        Err("unsupported".into())
    }
    fn reveal(&self, _: &std::path::Path) -> Result<(), String> {
        Err("unsupported".into())
    }
}

/// Installs the new-window guard on a window builder. Every `WebviewWindowBuilder` the app uses
/// should pass through this.
pub(crate) fn guard_new_windows<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: tauri::WebviewWindowBuilder<'a, R, M>,
    app: &tauri::AppHandle<R>,
) -> tauri::WebviewWindowBuilder<'a, R, M> {
    let app = app.clone();
    builder.on_new_window(move |url, _features| {
        let browser = SystemBrowser(app.clone());
        // Off the WebView callback: launching the browser must not stall the event loop.
        std::thread::spawn(move || route_new_window(&url, &browser));
        tauri::webview::NewWindowResponse::Deny
    })
}

/// Takes the windows Tauri would create from `tauri.conf.json` and clears their `create` flag, so
/// `setup` builds them itself with the new-window guard (the config has no such option).
fn take_config_windows(windows: &mut [tauri::utils::config::WindowConfig]) -> Vec<tauri::utils::config::WindowConfig> {
    windows
        .iter_mut()
        .filter(|w| w.create)
        .map(|w| {
            w.create = false;
            w.clone()
        })
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    let config_windows = take_config_windows(&mut context.config_mut().app.windows);
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
            photo::photo_attach, photo::photo_list, photo::photo_unlink, photo::photo_read,
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
            selftest::self_test_mode, selftest::self_test_report,
            // [FS-20] handlers
            signing::signing_get_identity, signing::signing_create_identity,
            certificate::certificate_sign, certificate::certificate_verify, certificate::certificate_extract_json,
            certificate::certificate_store, certificate::certificate_list, certificate::certificate_get,
            // [FS-21] handlers
            pack::pack_preview, pack::pack_import, pack::pack_list, pack::pack_remove, pack::pack_export,
            pack::population_query, pack::population_unit_values,
            // [FS-22] handlers
            service::job_create, service::job_get, service::job_list, service::job_update_fields, service::job_set_status,
            service::job_add_log, service::job_attach_photo, service::job_link_results, service::job_comparison, service::job_delete,
            service::customer_list, service::customer_update, service::customer_delete,
            // [FS-23] handlers
            fleet::fleet_snapshot, fleet::fleet_place_asset, fleet::reminder_upsert, fleet::reminder_snooze,
            fleet::maintenance_log, fleet::maintenance_list, fleet::booth_upsert, fleet::position_upsert,
            fleet::fleet_location_delete,
            fleet::reminder_template_upsert, fleet::reminder_apply_template, fleet::reminder_delete,
            // [FS-30] handlers
            // [FS-31] handlers
            monitor::monitor_session_start, monitor::monitor_log_append, monitor::monitor_session_end, monitor::monitor_session_list,
            monitor::monitor_session_get, monitor::monitor_session_delete, monitor::monitor_prune, tray::monitor_set_tray_state,
            // [FS-32] handlers
            mapper::mapper_model_save, mapper::mapper_model_list, mapper::mapper_model_get, mapper::mapper_model_delete,
            // [FS-33] handlers
            ledger::ledger_public_notes, ledger::ledger_public_note_set, ledger::ledger_export_list, ledger::ledger_export_record,
            ledger::ledger_next_revision, ledger::ledger_customer_units, ledger::ledger_write_folder,
        ])
        .setup(move |_app| {
            // [AUD-08] config windows first (where Tauri would have built them), each with the guard
            for w in &config_windows {
                guard_new_windows(tauri::WebviewWindowBuilder::from_config(_app.handle(), w)?, _app.handle()).build()?;
            }
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
            // [FS-31] setup: close crashed monitor sessions + retention prune (background thread); close-to-tray while monitoring
            monitor::setup(_app.handle());
            tray::setup(_app);
            // [FS-32] setup
            // [FS-33] setup
            // [FS-02] `--debug-crash` (debug builds, or DECKCHEK_ALLOW_DEBUG_CRASH=1): last, so the panic goes through every hook above
            diagnostics::debug_crash_if_requested(_app);
            // `--self-test=<report.json>`: arms a watchdog; the UI runs its checks and reports back
            selftest::setup();
            Ok(())
        })
        .build(context)
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

#[cfg(test)]
mod aud_08_tests {
    use super::*;
    use std::cell::RefCell;
    use std::path::Path;

    #[derive(Default)]
    struct Recorder(RefCell<Vec<String>>);
    impl links::Opener for Recorder {
        fn open_url(&self, url: &str) -> Result<(), String> {
            self.0.borrow_mut().push(url.to_string());
            Ok(())
        }
        fn open_path(&self, _: &Path) -> Result<(), String> {
            panic!("a new-window request must never open a path")
        }
        fn reveal(&self, _: &Path) -> Result<(), String> {
            panic!("a new-window request must never reveal a path")
        }
    }

    /// AUD-08: a popup or "Open link in new window" never opens an in-app window. Its URL goes
    /// through the FS-07 policy unconfirmed: allowlisted https reaches the system browser,
    /// everything else (unlisted hosts, other schemes, the app's own pages) is dropped.
    #[test]
    fn regression_aud_08_new_window_requests_go_through_the_link_policy_or_are_dropped() {
        for (url, opens) in [
            ("https://github.com/deckchek", true),
            ("https://www.pioneerdj.com/en/", true),
            ("https://example.org/", false),          // needs confirmation, which a popup cannot give
            ("https://user:pw@github.com/", false),   // userinfo is never auto-allowlisted
            ("https://github.com:8443/", false),      // non-default port
            ("http://github.com/", false),
            ("file:///C:/Windows/System32/calc.exe", false),
            ("javascript:alert(1)", false),
            ("data:text/html,<b>x</b>", false),
            ("tauri://localhost/index.html", false),
            ("http://tauri.localhost/report.html", false),
        ] {
            let rec = Recorder::default();
            let r = route_new_window(&tauri::Url::parse(url).unwrap(), &rec);
            assert_eq!(r.opened, opens, "{url}");
            assert_eq!(rec.0.borrow().len(), usize::from(opens), "{url}");
        }
    }

    /// AUD-08: every window the app builds from its config gets the guard, and none is left for
    /// Tauri to create unguarded.
    #[test]
    fn regression_aud_08_config_windows_are_built_with_the_guard() {
        let mut ctx_windows = vec![tauri::utils::config::WindowConfig::default(); 2];
        ctx_windows[1].create = false;
        let taken = take_config_windows(&mut ctx_windows);
        assert_eq!(taken.len(), 1, "only windows Tauri would have created");
        assert!(ctx_windows.iter().all(|w| !w.create), "Tauri must not create any window itself");
        let src = include_str!("lib.rs");
        let prod = src.split("#[cfg(test)]\nmod aud_08_tests").next().unwrap();
        assert!(prod.contains("guard_new_windows(tauri::WebviewWindowBuilder::from_config("), "config windows built with the guard");
    }
}
