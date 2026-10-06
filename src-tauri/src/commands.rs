use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub edition: &'static str,
    pub preview_mode: bool,
    pub audio_capture_connected: bool,
    pub persistence_connected: bool,
}

#[tauri::command]
pub fn runtime_status() -> RuntimeStatus {
    RuntimeStatus {
        edition: "vinyl",
        preview_mode: true,
        audio_capture_connected: false,
        persistence_connected: false,
    }
}
