use serde::{Deserialize, Serialize};

/// Supported device families. A hybrid device may have more than one capability
/// record; category is not inferred from a manufacturer or model name.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceCategory {
    Turntable,
    MediaPlayer,
    Controller,
    AudioInterface,
    Mixer,
    Other,
}

/// Source of a value shown in the interface. Demo values must never be treated
/// as measured evidence.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceOrigin {
    Measured,
    Inferred,
    UserEntered,
    Demo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceRecord {
    pub id: String,
    pub category: DeviceCategory,
    pub manufacturer: String,
    pub model: String,
    pub label: String,
    pub serial_number: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Measurement {
    pub metric_id: String,
    pub label: String,
    pub value: f64,
    pub unit: String,
    pub origin: EvidenceOrigin,
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub code: String,
    pub title: String,
    pub detail: String,
    pub severity: FindingSeverity,
    pub possible_causes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FindingSeverity {
    Informational,
    Review,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticRun {
    pub id: String,
    pub device_id: Option<String>,
    pub test_id: String,
    pub started_at_utc: String,
    pub completed_at_utc: Option<String>,
    pub status: RunStatus,
    pub is_demo: bool,
    pub measurements: Vec<Measurement>,
    pub findings: Vec<Finding>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Draft,
    Ready,
    Running,
    Completed,
    Cancelled,
    Failed,
}
