//! FS-31 system tray for the live monitor (tauri `tray-icon` feature, MIT/Apache-2.0).
//!
//! The tray exists only while the live monitor runs: the webview drives it with `monitor_set_tray_state`
//! ("ok" | "watch" | "fault" | "off"). Each state has its own icon shape AND colour (filled circle, triangle,
//! octagon; a ring for off) and a tooltip naming the state, so colour is never the only signal. Tooltips carry
//! no device names or serials. Menu: Open DeckChek, Stop monitoring, Mute toasts for 30 min, Quit; menu
//! actions reach the webview as the `monitor://tray` event `{action}`.
//!
//! While monitoring runs and the tray exists, closing the main window hides it instead (FS-31 AC-8: monitoring
//! continues in the tray until Quit); the webview stays alive. When the monitor stops ("off") the tray is
//! removed and a hidden window is shown again, so the app can never be left invisible.
//!
//! Platforms: the tray is created on Windows and macOS only. On Linux the tray backend loads
//! libayatana-appindicator at run time and panics when it is missing (headless CI), so there the command
//! reports `supported: false` and the UI falls back to the in-window badge (FS-31 §3 "unsupported").

// Linux and other platforms build the pure parts only (state, shapes, tests).
#![cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))]

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

pub const TRAY_ID: &str = "deckchek-monitor";
pub const TRAY_EVENT: &str = "monitor://tray";
pub const ICON_SIZE: u32 = 32;
/// True while the live monitor runs (any state but "off"); read by the close-to-tray handler.
static ACTIVE: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayState {
    Ok,
    Watch,
    Fault,
    Off,
}

pub fn parse_state(s: &str) -> Result<TrayState, String> {
    match s {
        "ok" => Ok(TrayState::Ok),
        "watch" => Ok(TrayState::Watch),
        "fault" => Ok(TrayState::Fault),
        "off" => Ok(TrayState::Off),
        _ => Err("tray state must be ok, watch, fault or off".into()),
    }
}

impl TrayState {
    pub fn as_str(self) -> &'static str {
        match self {
            TrayState::Ok => "ok",
            TrayState::Watch => "watch",
            TrayState::Fault => "fault",
            TrayState::Off => "off",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            TrayState::Ok => "OK",
            TrayState::Watch => "Watch",
            TrayState::Fault => "Fault",
            TrayState::Off => "Off",
        }
    }
    fn rgb(self) -> [u8; 3] {
        match self {
            TrayState::Ok => [0x2e, 0x9e, 0x5b],
            TrayState::Watch => [0xe0, 0xa2, 0x1b],
            TrayState::Fault => [0xd6, 0x45, 0x45],
            TrayState::Off => [0x8a, 0x8f, 0x98],
        }
    }
}

pub fn tooltip(state: TrayState) -> String {
    format!("DeckChek live monitor: {}", state.label())
}

/// Whether a close request on the main window should hide it to the tray instead.
pub fn should_hide_on_close(monitor_active: bool, tray_present: bool) -> bool {
    monitor_active && tray_present
}

fn inside(state: TrayState, x: f32, y: f32) -> bool {
    let (cx, cy) = (16.0f32, 16.0f32);
    let (dx, dy) = (x - cx, y - cy);
    match state {
        TrayState::Ok => dx * dx + dy * dy <= 13.0 * 13.0,
        TrayState::Off => {
            let r2 = dx * dx + dy * dy;
            r2 <= 13.0 * 13.0 && r2 >= 8.5 * 8.5
        }
        // triangle with apex at (16, 3) and base on y = 28 from x = 2 to 30
        TrayState::Watch => (3.0..=28.0).contains(&y) && dx.abs() <= (y - 3.0) * 14.0 / 25.0,
        // octagon (square of half-width 13, corners cut at |dx| + |dy| <= 18.5) with a see-through X, like the UI "fail" icon
        TrayState::Fault => {
            let octagon = dx.abs() <= 13.0 && dy.abs() <= 13.0 && dx.abs() + dy.abs() <= 18.5;
            let cross = dx.abs() <= 7.0 && dy.abs() <= 7.0 && ((dx - dy).abs() <= 2.2 || (dx + dy).abs() <= 2.2);
            octagon && !cross
        }
    }
}

/// 32 x 32 RGBA icon for a state: its shape with 4 x 4 supersampled anti-aliasing, transparent outside.
pub fn icon_rgba(state: TrayState) -> Vec<u8> {
    let n = ICON_SIZE as usize;
    let [r, g, b] = state.rgb();
    let mut out = vec![0u8; n * n * 4];
    for py in 0..n {
        for px in 0..n {
            let mut hits = 0u32;
            for sy in 0..4 {
                for sx in 0..4 {
                    if inside(state, px as f32 + (sx as f32 + 0.5) / 4.0, py as f32 + (sy as f32 + 0.5) / 4.0) {
                        hits += 1;
                    }
                }
            }
            let i = (py * n + px) * 4;
            out[i..i + 4].copy_from_slice(&[r, g, b, (hits * 255 / 16) as u8]);
        }
    }
    out
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayStatus {
    pub supported: bool,
    pub state: String,
    pub tooltip: String,
}

#[derive(Debug, Clone, Serialize)]
struct TrayAction {
    action: &'static str,
}

#[cfg(any(windows, target_os = "macos"))]
mod native {
    use super::*;
    use tauri::{
        image::Image,
        menu::{Menu, MenuItem, PredefinedMenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
        Emitter, Manager,
    };

    pub fn show_main(app: &AppHandle) {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }

    fn emit(app: &AppHandle, action: &'static str) {
        let _ = app.emit(TRAY_EVENT, TrayAction { action });
    }

    fn build(app: &AppHandle, state: TrayState) -> tauri::Result<()> {
        let open = MenuItem::with_id(app, "monitor-open", "Open DeckChek", true, None::<&str>)?;
        let stop = MenuItem::with_id(app, "monitor-toggle", "Stop monitoring", true, None::<&str>)?;
        let mute = MenuItem::with_id(app, "monitor-mute", "Mute toasts for 30 min", true, None::<&str>)?;
        let sep = PredefinedMenuItem::separator(app)?;
        let quit = MenuItem::with_id(app, "monitor-quit", "Quit DeckChek", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&open, &stop, &mute, &sep, &quit])?;
        TrayIconBuilder::with_id(TRAY_ID)
            .icon(Image::new_owned(icon_rgba(state), ICON_SIZE, ICON_SIZE))
            .tooltip(tooltip(state))
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| match event.id().0.as_str() {
                "monitor-open" => show_main(app),
                "monitor-toggle" => emit(app, "toggle"),
                "monitor-mute" => emit(app, "mute"),
                "monitor-quit" => {
                    // let the webview stop the stream and close the session log, then exit (at most 1.5 s)
                    emit(app, "quit");
                    let app = app.clone();
                    std::thread::spawn(move || {
                        for _ in 0..30 {
                            if !ACTIVE.load(Ordering::SeqCst) {
                                break;
                            }
                            std::thread::sleep(std::time::Duration::from_millis(50));
                        }
                        app.exit(0);
                    });
                }
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                    show_main(tray.app_handle());
                }
            })
            .build(app)?;
        Ok(())
    }

    pub fn apply(app: &AppHandle, state: TrayState) -> Result<(), String> {
        if state == TrayState::Off {
            let _ = app.remove_tray_by_id(TRAY_ID);
            if let Some(w) = app.get_webview_window("main") {
                if !w.is_visible().unwrap_or(true) {
                    show_main(app);
                }
            }
            return Ok(());
        }
        match app.tray_by_id(TRAY_ID) {
            Some(tray) => {
                tray.set_icon(Some(Image::new_owned(icon_rgba(state), ICON_SIZE, ICON_SIZE))).map_err(|e| e.to_string())?;
                tray.set_tooltip(Some(tooltip(state))).map_err(|e| e.to_string())
            }
            None => build(app, state).map_err(|e| e.to_string()),
        }
    }

    pub fn tray_present(app: &AppHandle) -> bool {
        app.tray_by_id(TRAY_ID).is_some()
    }
}

/// Close-to-tray handler for the main window ([FS-31] setup). Inert unless the monitor runs with a tray.
pub fn setup(app: &tauri::App) {
    #[cfg(any(windows, target_os = "macos"))]
    {
        use tauri::{Emitter, Manager, WindowEvent};
        if let Some(w) = app.get_webview_window("main") {
            let win = w.clone();
            w.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let handle = win.app_handle();
                    if should_hide_on_close(ACTIVE.load(Ordering::SeqCst), native::tray_present(handle)) {
                        api.prevent_close();
                        let _ = win.hide();
                        let _ = handle.emit(TRAY_EVENT, TrayAction { action: "hidden" });
                    }
                }
            });
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    let _ = app;
}

#[tauri::command]
pub fn monitor_set_tray_state(app: AppHandle, state: String) -> Result<TrayStatus, String> {
    let st = parse_state(&state)?;
    ACTIVE.store(st != TrayState::Off, Ordering::SeqCst);
    #[cfg(any(windows, target_os = "macos"))]
    {
        // A tray that cannot be created (no shell, policy) degrades to the in-window badge, never an error.
        let supported = native::apply(&app, st).is_ok();
        Ok(TrayStatus { supported, state: st.as_str().into(), tooltip: tooltip(st) })
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = app;
        Ok(TrayStatus { supported: false, state: st.as_str().into(), tooltip: tooltip(st) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_parsing_is_strict() {
        for s in ["ok", "watch", "fault", "off"] {
            assert_eq!(parse_state(s).unwrap().as_str(), s);
        }
        for bad in ["", "OK", "red", "ok ", "fault\0"] {
            assert!(parse_state(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn tooltips_name_the_state_and_carry_no_device_details() {
        assert_eq!(tooltip(TrayState::Watch), "DeckChek live monitor: Watch");
        for st in [TrayState::Ok, TrayState::Watch, TrayState::Fault, TrayState::Off] {
            let t = tooltip(st);
            assert!(t.ends_with(st.label()) && t.len() < 64 && !t.chars().any(|c| c.is_ascii_digit()));
        }
    }

    #[test]
    fn icons_differ_in_shape_not_only_colour() {
        let mask = |st| icon_rgba(st).chunks(4).map(|p| p[3] > 127).collect::<Vec<bool>>();
        let shapes = [TrayState::Ok, TrayState::Watch, TrayState::Fault, TrayState::Off].map(mask);
        for i in 0..shapes.len() {
            assert_eq!(shapes[i].len(), (ICON_SIZE * ICON_SIZE) as usize);
            let filled = shapes[i].iter().filter(|b| **b).count();
            assert!(filled > 100 && filled < 900, "state {i}: {filled} px");
            for j in 0..i {
                let differ = shapes[i].iter().zip(&shapes[j]).filter(|(a, b)| a != b).count();
                assert!(differ > 40, "states {i} and {j} differ by only {differ} px");
            }
        }
        // the ring (off) is hollow, the disc (ok) is not
        let centre = (16 * ICON_SIZE as usize + 16) as usize;
        assert!(shapes[0][centre] && !shapes[3][centre]);
        // RGBA with transparent corners
        let ok = icon_rgba(TrayState::Ok);
        assert_eq!(ok.len(), (ICON_SIZE * ICON_SIZE * 4) as usize);
        assert_eq!(ok[3], 0);
    }

    #[test]
    fn close_hides_to_tray_only_while_monitoring_with_a_tray() {
        assert!(should_hide_on_close(true, true));
        assert!(!should_hide_on_close(true, false), "no tray: the window closes normally");
        assert!(!should_hide_on_close(false, true));
        assert!(!should_hide_on_close(false, false));
    }
}
