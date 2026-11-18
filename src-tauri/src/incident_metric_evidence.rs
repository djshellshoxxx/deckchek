//! SPEC-05 §20: an immutable incident and one operator-selected existing frame.
//! The original normalized parent submission is stored with the evidence, so
//! reads and retries detect a changed/restored parent. No monitor/catalog FK.

use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Deserializer, Serialize};
use tauri::AppHandle;

use crate::db::{database_path, open_database};
use crate::venue_incidents::{self, Incident, IncidentInput};

const METHOD: &str = "live-monitor-latest-frame-v1";
const MAX_SUBMISSION_BYTES: usize = 32 * 1024;
const MAX_SUMMARIES: usize = 300;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const NUMERIC_METRIC_KEYS: [&str; 11] = [
    "levelDb",
    "snrDb",
    "carrierHz",
    "speedPct",
    "phaseDeg",
    "jitterDeg",
    "balanceDb",
    "driftDeg",
    "humDb",
    "humFloorDb",
    "mainsHz",
];
const FORMATS: [&str; 11] = [
    "Serato CV02.5",
    "Serato CD",
    "Traktor Scratch MK1",
    "Traktor Scratch MK2",
    "Traktor Scratch MK2 CD",
    "rekordbox RB-VS1",
    "MixVibes DVS V2",
    "MixVibes 7\"",
    "Algoriddim djay",
    "Serato CV02 (xwax serato_2a)",
    "Final Scratch",
];

// Nullable evidence fields must be explicitly present, unlike an omitted field.
fn required_option<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::deserialize(deserializer)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MetricSource {
    pub generation: String,
    pub deck: String,
    #[serde(deserialize_with = "required_option")]
    pub device_name: Option<String>,
    pub first_channel: u32,
    pub second_channel: u32,
    pub format: String,
    #[serde(deserialize_with = "required_option")]
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObservationTiming {
    pub basis: String,
    pub observed_at: String,
    #[serde(deserialize_with = "required_option")]
    pub sample_time_seconds: Option<f64>,
    #[serde(deserialize_with = "required_option")]
    pub age_ms: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonitorThresholds {
    pub snr_drop_db: f64,
    pub snr_drop_sec: f64,
    pub snr_floor_db: f64,
    pub snr_floor_sec: f64,
    pub healthy_snr_db: f64,
    pub dropout_db: f64,
    pub dropout_count: f64,
    pub dropout_span_sec: f64,
    pub max_dropout_sec: f64,
    pub hum_rise_db: f64,
    pub hum_sec: f64,
    pub hum_min_dbfs: f64,
    pub hum_above_floor_db: f64,
    pub phase_rate_deg_per_sec: f64,
    pub phase_jitter_deg: f64,
    pub phase_sec: f64,
    pub presence_db: f64,
    pub idle_info_sec: f64,
    pub min_baseline_sec: f64,
}

impl MonitorThresholds {
    // Existing monitor v1 setting bounds, not new detector criteria.
    fn validate(&self) -> Result<(), String> {
        for (value, low, high) in [
            (self.snr_drop_db, 1.0, 40.0),
            (self.snr_drop_sec, 0.5, 60.0),
            (self.snr_floor_db, 0.0, 40.0),
            (self.snr_floor_sec, 0.25, 60.0),
            (self.healthy_snr_db, 0.0, 60.0),
            (self.dropout_db, 6.0, 60.0),
            (self.dropout_count, 1.0, 50.0),
            (self.dropout_span_sec, 1.0, 120.0),
            (self.max_dropout_sec, 0.04, 5.0),
            (self.hum_rise_db, 1.0, 40.0),
            (self.hum_sec, 0.5, 60.0),
            (self.hum_min_dbfs, -140.0, 0.0),
            (self.hum_above_floor_db, 0.0, 40.0),
            (self.phase_rate_deg_per_sec, 0.5, 90.0),
            (self.phase_jitter_deg, 1.0, 90.0),
            (self.phase_sec, 0.5, 60.0),
            (self.presence_db, -90.0, -20.0),
            (self.idle_info_sec, 1.0, 600.0),
            (self.min_baseline_sec, 1.0, 60.0),
        ] {
            bounded(value, low, high, "Monitor threshold")?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonitorConfiguration {
    pub settings_version: u8,
    pub sample_rate_hz: u32,
    pub hop_ms: f64,
    pub analysis_window_seconds: f64,
    pub baseline_seconds: f64,
    pub nominal_rpm: f64,
    pub thresholds: MonitorThresholds,
    pub cooldown_sec: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MetricValues {
    #[serde(deserialize_with = "required_option")]
    pub level_db: Option<f64>,
    #[serde(deserialize_with = "required_option")]
    pub snr_db: Option<f64>,
    #[serde(deserialize_with = "required_option")]
    pub carrier_hz: Option<f64>,
    #[serde(deserialize_with = "required_option")]
    pub speed_pct: Option<f64>,
    #[serde(deserialize_with = "required_option")]
    pub phase_deg: Option<f64>,
    #[serde(deserialize_with = "required_option")]
    pub jitter_deg: Option<f64>,
    #[serde(deserialize_with = "required_option")]
    pub balance_db: Option<f64>,
    #[serde(deserialize_with = "required_option")]
    pub drift_deg: Option<f64>,
    #[serde(deserialize_with = "required_option")]
    pub hum_db: Option<f64>,
    #[serde(deserialize_with = "required_option")]
    pub hum_floor_db: Option<f64>,
    #[serde(deserialize_with = "required_option")]
    pub mains_hz: Option<f64>,
    pub dropouts: u64,
    pub locked: bool,
    pub motion: String,
    pub direction: String,
    pub state: String,
}

impl MetricValues {
    fn numeric_values(&self) -> [Option<f64>; 11] {
        [
            self.level_db,
            self.snr_db,
            self.carrier_hz,
            self.speed_pct,
            self.phase_deg,
            self.jitter_deg,
            self.balance_db,
            self.drift_deg,
            self.hum_db,
            self.hum_floor_db,
            self.mains_hz,
        ]
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LossCounters {
    #[serde(deserialize_with = "required_option")]
    pub reported_dropped_blocks: Option<u64>,
    #[serde(deserialize_with = "required_option")]
    pub monitor_dropped_blocks: Option<u64>,
    #[serde(deserialize_with = "required_option")]
    pub log_events_dropped: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MetricEvidenceInput {
    pub schema_version: u8,
    pub method: String,
    pub incident_id: String,
    pub press_at: String,
    pub association: String,
    pub source: MetricSource,
    pub timing: ObservationTiming,
    pub configuration: MonitorConfiguration,
    pub metrics: MetricValues,
    pub unavailable: Vec<String>,
    pub loss: LossCounters,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedMetricEvidence {
    #[serde(flatten)]
    pub input: MetricEvidenceInput,
    pub origin: String,
    pub recorded_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPair {
    pub incident: Incident,
    pub evidence: SavedMetricEvidence,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadPair {
    pub incident: Incident,
    pub evidence: Option<SavedMetricEvidence>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricSummary {
    pub schema_version: u8,
    pub method: String,
    pub incident_id: String,
    pub press_at: String,
    pub association: String,
    pub source: MetricSource,
    pub timing: ObservationTiming,
    pub metrics: MetricValues,
    pub unavailable: Vec<String>,
    pub loss: LossCounters,
    pub origin: String,
    pub recorded_at: String,
}

impl From<SavedMetricEvidence> for MetricSummary {
    fn from(saved: SavedMetricEvidence) -> Self {
        let e = saved.input;
        Self {
            schema_version: e.schema_version,
            method: e.method,
            incident_id: e.incident_id,
            press_at: e.press_at,
            association: e.association,
            source: e.source,
            timing: e.timing,
            metrics: e.metrics,
            unavailable: e.unavailable,
            loss: e.loss,
            origin: saved.origin,
            recorded_at: saved.recorded_at,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryPair {
    pub incident: Incident,
    pub evidence: Option<MetricSummary>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Submission {
    input: IncidentInput,
    evidence: MetricEvidenceInput,
}

fn invalid(message: impl std::fmt::Display) -> String {
    format!("METRIC_EVIDENCE_INVALID: {message}")
}
fn storage(message: impl std::fmt::Display) -> String {
    format!("METRIC_EVIDENCE_STORAGE: {message}")
}
fn conflict() -> String {
    "METRIC_EVIDENCE_CONFLICT: This incident ID does not belong to the exact original incident and snapshot pair".into()
}
fn text(value: &str, max: usize, name: &str) -> Result<(), String> {
    if value.trim().is_empty()
        || value.chars().count() > max
        || value.chars().any(|c| c.is_ascii_control())
    {
        return Err(invalid(format!(
            "{name} must contain 1–{max} valid characters"
        )));
    }
    Ok(())
}
fn identifier(value: &str, name: &str) -> Result<(), String> {
    text(value, 128, name)?;
    if value.trim() != value {
        return Err(invalid(format!(
            "{name} must not have surrounding whitespace"
        )));
    }
    Ok(())
}
fn bounded(value: f64, low: f64, high: f64, name: &str) -> Result<(), String> {
    if !value.is_finite() || value < low || value > high {
        return Err(invalid(format!("{name} is not a valid finite value")));
    }
    Ok(())
}

fn validate(input: &IncidentInput, e: &MetricEvidenceInput) -> Result<(), String> {
    if e.schema_version != 1 || e.method != METHOD || e.association != "operator-selected" {
        return Err(invalid(
            "Unsupported evidence schema, method or association",
        ));
    }
    identifier(&e.incident_id, "Incident ID")?;
    if e.incident_id != input.id
        || e.press_at != input.occurred_at
        || !venue_incidents::valid_time(&e.press_at)
    {
        return Err(invalid(
            "The metric evidence does not match the incident press",
        ));
    }
    let s = &e.source;
    identifier(&s.generation, "Stream generation")?;
    if !["A", "B", "C", "D"].contains(&s.deck.as_str()) || !FORMATS.contains(&s.format.as_str()) {
        return Err(invalid("Unsupported deck or timecode format"));
    }
    if s.first_channel == 0
        || s.first_channel > 65535
        || s.first_channel % 2 != 1
        || s.second_channel != s.first_channel + 1
    {
        return Err(invalid("Invalid selected input pair"));
    }
    if let Some(label) = &s.device_name {
        text(label, 200, "Device label")?;
    }
    if let Some(id) = &s.session_id {
        identifier(id, "Monitor session ID")?;
    }
    if e.timing.basis != "host-callback-observation"
        || !venue_incidents::valid_time(&e.timing.observed_at)
    {
        return Err(invalid("Invalid observation timing basis or timestamp"));
    }
    for value in [e.timing.sample_time_seconds, e.timing.age_ms]
        .into_iter()
        .flatten()
    {
        bounded(value, 0.0, f64::MAX, "Observation timing")?;
    }
    let c = &e.configuration;
    if c.settings_version != 1
        || !(4000..=384000).contains(&c.sample_rate_hz)
        || c.analysis_window_seconds != 0.5
        || c.baseline_seconds != 60.0
        || c.nominal_rpm != 33.333333
    {
        return Err(invalid("Unsupported monitor method configuration"));
    }
    bounded(c.hop_ms, 50.0, 1000.0, "Monitor hop")?;
    bounded(c.cooldown_sec, 0.0, 3600.0, "Alert cooldown")?;
    c.thresholds.validate()?;
    let m = &e.metrics;
    for value in m.numeric_values().into_iter().flatten() {
        if !value.is_finite() {
            return Err(invalid("Metric values must be finite or explicit null"));
        }
    }
    if m.mains_hz.is_some_and(|hz| hz != 50.0 && hz != 60.0)
        || m.dropouts > MAX_SAFE_INTEGER
        || !["play", "cue", "idle"].contains(&m.motion.as_str())
        || !["forward", "reverse", "unknown"].contains(&m.direction.as_str())
        || !["ok", "watch", "fault", "idle", "nosignal"].contains(&m.state.as_str())
    {
        return Err(invalid("Invalid metric enum, mains bin or dropout count"));
    }
    let expected: Vec<&str> = NUMERIC_METRIC_KEYS
        .into_iter()
        .zip(m.numeric_values())
        .filter_map(|(key, value)| {
            (value.is_none() || (m.mains_hz.is_none() && ["humDb", "humFloorDb"].contains(&key)))
                .then_some(key)
        })
        .collect();
    if e.unavailable.len() != expected.len()
        || e.unavailable.iter().map(String::as_str).ne(expected)
    {
        return Err(invalid(
            "Unavailable fields must exactly describe null values and unobserved hum placeholders",
        ));
    }
    if [
        e.loss.reported_dropped_blocks,
        e.loss.monitor_dropped_blocks,
        e.loss.log_events_dropped,
    ]
    .into_iter()
    .flatten()
    .any(|n| n > MAX_SAFE_INTEGER)
    {
        return Err(invalid(
            "Loss counters must fit the exact JavaScript integer range",
        ));
    }
    let bytes = serde_json::to_vec(&Submission {
        input: input.clone(),
        evidence: e.clone(),
    })
    .map_err(invalid)?;
    if bytes.len() > MAX_SUBMISSION_BYTES {
        return Err(invalid(
            "The complete incident and metric submission exceeds 32 KiB",
        ));
    }
    Ok(())
}

struct Stored {
    submission: Submission,
    recorded_at: String,
}
fn existing(conn: &Connection, id: &str) -> Result<Option<Stored>, String> {
    let row: Option<(u8, String, Option<String>, String, String)> = conn.query_row(
        "SELECT schema_version, method, CASE WHEN typeof(submission_json)='text' AND length(CAST(submission_json AS BLOB)) <= 32768 THEN submission_json ELSE NULL END, origin, recorded_at FROM venue_incident_metric_evidence WHERE incident_id=?1",
        [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    ).optional().map_err(storage)?;
    row.map(|(version, method, encoded, origin, recorded_at)| {
        if version != 1
            || method != METHOD
            || origin != "operator-attached"
            || !venue_incidents::valid_time(&recorded_at)
        {
            return Err(storage("Invalid saved evidence metadata"));
        }
        let encoded = encoded
            .ok_or_else(|| storage("Saved evidence exceeds its encoded bound or is not text"))?;
        let submission: Submission = serde_json::from_str(&encoded).map_err(storage)?;
        let normalized = venue_incidents::normalize(&submission.input).map_err(storage)?;
        if normalized != submission.input || submission.input.id != id {
            return Err(storage("Invalid original parent submission"));
        }
        validate(&submission.input, &submission.evidence).map_err(storage)?;
        Ok(Stored {
            submission,
            recorded_at,
        })
    })
    .transpose()
}
fn bind_saved(incident: &Incident, stored: Stored) -> Result<SavedMetricEvidence, String> {
    if stored.submission.input != incident.input || stored.recorded_at != incident.recorded_at {
        return Err(storage(
            "The saved snapshot does not match its immutable original parent",
        ));
    }
    Ok(SavedMetricEvidence {
        input: stored.submission.evidence,
        origin: "operator-attached".into(),
        recorded_at: stored.recorded_at,
    })
}

pub fn save(
    conn: &Connection,
    input: &IncidentInput,
    evidence: &MetricEvidenceInput,
) -> Result<SavedPair, String> {
    let input = venue_incidents::normalize(input)?;
    validate(&input, evidence)?;
    let tx = Transaction::new_unchecked(conn, TransactionBehavior::Immediate).map_err(storage)?;
    let parent = venue_incidents::existing(&tx, &input.id)?;
    let companion = existing(&tx, &input.id)?;
    let saved = match (parent, companion) {
        (Some(incident), Some(stored)) => {
            let original = bind_saved(&incident, stored)?;
            if incident.input != input || original.input != *evidence {
                return Err(conflict());
            }
            SavedPair {
                incident,
                evidence: original,
            }
        }
        (None, None) => {
            let incident = venue_incidents::save_in_transaction(&tx, input.clone())?;
            let encoded = serde_json::to_string(&Submission {
                input,
                evidence: evidence.clone(),
            })
            .map_err(storage)?;
            tx.execute("INSERT INTO venue_incident_metric_evidence (incident_id,schema_version,method,submission_json,origin,recorded_at) VALUES (?1,1,?2,?3,'operator-attached',?4)",
                params![&incident.input.id, METHOD, encoded, &incident.recorded_at]).map_err(storage)?;
            let saved_evidence = SavedMetricEvidence {
                input: evidence.clone(),
                origin: "operator-attached".into(),
                recorded_at: incident.recorded_at.clone(),
            };
            SavedPair {
                incident,
                evidence: saved_evidence,
            }
        }
        _ => return Err(conflict()),
    };
    tx.commit().map_err(storage)?;
    Ok(saved)
}

fn read_pair(conn: &Connection, id: &str) -> Result<ReadPair, String> {
    let parent = venue_incidents::existing(conn, id)?;
    let companion = existing(conn, id)?;
    match (parent, companion) {
        (Some(incident), stored) => {
            let evidence = stored.map(|row| bind_saved(&incident, row)).transpose()?;
            Ok(ReadPair { incident, evidence })
        }
        (None, Some(_)) => Err(storage("Saved snapshot is missing its parent incident")),
        (None, None) => {
            Err("METRIC_EVIDENCE_NOT_FOUND: The selected incident is unavailable".into())
        }
    }
}
pub fn get(conn: &Connection, incident_id: &str) -> Result<ReadPair, String> {
    identifier(incident_id, "Incident ID")?;
    let tx = Transaction::new_unchecked(conn, TransactionBehavior::Deferred).map_err(storage)?;
    let pair = read_pair(&tx, incident_id)?;
    tx.commit().map_err(storage)?;
    Ok(pair)
}
pub fn summaries(conn: &Connection, incident_ids: &[String]) -> Result<Vec<SummaryPair>, String> {
    if incident_ids.len() > MAX_SUMMARIES {
        return Err(invalid(
            "Snapshot summaries are limited to 300 selected incidents",
        ));
    }
    let mut seen = HashSet::new();
    for id in incident_ids {
        identifier(id, "Incident ID")?;
        if !seen.insert(id) {
            return Err(invalid("Snapshot summary incident IDs must be unique"));
        }
    }
    let tx = Transaction::new_unchecked(conn, TransactionBehavior::Deferred).map_err(storage)?;
    let mut result = Vec::with_capacity(incident_ids.len());
    for id in incident_ids {
        let pair = read_pair(&tx, id)?;
        result.push(SummaryPair {
            incident: pair.incident,
            evidence: pair.evidence.map(MetricSummary::from),
        });
    }
    tx.commit().map_err(storage)?;
    Ok(result)
}

#[tauri::command]
pub async fn venue_incident_save_with_metric_evidence(
    app: AppHandle,
    input: IncidentInput,
    evidence: MetricEvidenceInput,
) -> Result<SavedPair, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        save(&conn, &input, &evidence)
    })
    .await?
}

#[tauri::command]
pub async fn venue_incident_metric_evidence_get(
    app: AppHandle,
    incident_id: String,
) -> Result<ReadPair, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        get(&conn, &incident_id)
    })
    .await?
}

#[tauri::command]
pub async fn venue_incident_metric_evidence_summaries(
    app: AppHandle,
    incident_ids: Vec<String>,
) -> Result<Vec<SummaryPair>, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        summaries(&conn, &incident_ids)
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{apply_migrations, new_id};
    use crate::venue_incidents::{self, IncidentInput};
    use rusqlite::Connection;
    use serde_json::{json, Value};

    fn input() -> IncidentInput {
        let fixture: Value =
            serde_json::from_str(include_str!("../../tests/contracts/venue-incidents.json"))
                .unwrap();
        serde_json::from_value(fixture["draft"].clone()).unwrap()
    }
    fn evidence() -> MetricEvidenceInput {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../tests/contracts/incident-metric-evidence.json"
        ))
        .unwrap();
        serde_json::from_value(fixture["evidence"].clone()).unwrap()
    }
    fn initialize(conn: &Connection) {
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(conn).unwrap();
        conn.execute_batch("INSERT INTO venue (id,name,created_at,updated_at) VALUES ('venue-1','Club One','2026-01-01','2026-01-01'),('venue-2','Other','2026-01-01','2026-01-01'); INSERT INTO setup (id,name,venue_id,created_at) VALUES ('setup-1','Left deck','venue-1','2026-01-01');").unwrap();
    }
    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        initialize(&conn);
        conn
    }
    fn counts(conn: &Connection) -> (i64, i64) {
        (
            conn.query_row("SELECT COUNT(*) FROM venue_incident", [], |r| r.get(0))
                .unwrap(),
            conn.query_row(
                "SELECT COUNT(*) FROM venue_incident_metric_evidence",
                [],
                |r| r.get(0),
            )
            .unwrap(),
        )
    }
    fn rejected(value: Value) -> bool {
        match serde_json::from_value::<MetricEvidenceInput>(value) {
            Err(_) => true,
            Ok(e) => validate(&input(), &e).is_err(),
        }
    }

    #[test]
    fn atomic_pair_round_trip_preserves_exact_values_and_original_submission() {
        let conn = mem();
        let saved = save(&conn, &input(), &evidence()).unwrap();
        assert_eq!(saved.incident.input, input());
        assert_eq!(saved.evidence.input, evidence());
        assert_eq!(saved.incident.recorded_at, saved.evidence.recorded_at);
        assert_eq!(saved.evidence.origin, "operator-attached");
        assert_eq!(saved.evidence.input.metrics.snr_db, Some(-3.125));
        assert_eq!(saved.evidence.input.metrics.level_db, Some(-24.123456789));
        assert_eq!(
            saved.evidence.input.unavailable,
            ["humDb", "humFloorDb", "mainsHz"]
        );
        let read = get(&conn, &input().id).unwrap();
        assert_eq!(read.incident, saved.incident);
        assert_eq!(read.evidence.unwrap(), saved.evidence);
        assert_eq!(counts(&conn), (1, 1));
        let stored: String = conn
            .query_row(
                "SELECT submission_json FROM venue_incident_metric_evidence",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let original: Value = serde_json::from_str(&stored).unwrap();
        assert_eq!(original["input"], serde_json::to_value(input()).unwrap());
        assert_eq!(
            original["evidence"],
            serde_json::to_value(evidence()).unwrap()
        );
    }

    #[test]
    fn lost_acknowledgement_retry_is_exact_no_write_and_survives_catalog_and_log_pruning() {
        let conn = mem();
        let saved = save(&conn, &input(), &evidence()).unwrap();
        conn.execute_batch("UPDATE venue SET name='Renamed' WHERE id='venue-1'; UPDATE setup SET venue_id='venue-2' WHERE id='setup-1'; DELETE FROM setup WHERE id='setup-1'; DELETE FROM venue WHERE id='venue-1'; DELETE FROM monitor_session;").unwrap();
        conn.execute_batch("CREATE TEMP TRIGGER no_new_parent BEFORE INSERT ON venue_incident BEGIN SELECT RAISE(ABORT,'retry wrote a parent'); END; CREATE TEMP TRIGGER no_new_evidence BEFORE INSERT ON venue_incident_metric_evidence BEGIN SELECT RAISE(ABORT,'retry wrote evidence'); END;").unwrap();
        assert_eq!(save(&conn, &input(), &evidence()).unwrap(), saved);
        assert_eq!(
            get(&conn, &input().id).unwrap().evidence.unwrap(),
            saved.evidence
        );
        assert_eq!(counts(&conn), (1, 1));
    }

    #[test]
    fn changed_pair_and_existing_manual_incident_cannot_acquire_new_evidence() {
        let conn = mem();
        save(&conn, &input(), &evidence()).unwrap();
        let mut changed = evidence();
        changed.metrics.snr_db = Some(-3.124);
        assert!(save(&conn, &input(), &changed)
            .unwrap_err()
            .starts_with("METRIC_EVIDENCE_CONFLICT:"));
        let mut changed_parent = input();
        changed_parent.note = Some("A different report".into());
        assert!(save(&conn, &changed_parent, &evidence())
            .unwrap_err()
            .starts_with("METRIC_EVIDENCE_CONFLICT:"));
        let manual = IncidentInput {
            id: "manual".into(),
            ..input()
        };
        venue_incidents::save(&conn, &manual).unwrap();
        let mut late = evidence();
        late.incident_id = manual.id.clone();
        assert!(save(&conn, &manual, &late)
            .unwrap_err()
            .starts_with("METRIC_EVIDENCE_CONFLICT:"));
        assert!(get(&conn, &manual.id).unwrap().evidence.is_none());
        assert_eq!(counts(&conn), (2, 1));
    }

    #[test]
    fn invalid_context_second_insert_and_commit_failure_each_roll_back_the_entire_pair() {
        let conn = mem();
        conn.execute("UPDATE setup SET venue_id='venue-2' WHERE id='setup-1'", [])
            .unwrap();
        assert!(save(&conn, &input(), &evidence())
            .unwrap_err()
            .starts_with("INCIDENT_CONTEXT:"));
        assert_eq!(counts(&conn), (0, 0));
        conn.execute("UPDATE setup SET venue_id='venue-1' WHERE id='setup-1'", [])
            .unwrap();
        conn.execute_batch("CREATE TEMP TRIGGER fail_evidence BEFORE INSERT ON venue_incident_metric_evidence BEGIN SELECT RAISE(ABORT,'second insert failure'); END;").unwrap();
        assert!(save(&conn, &input(), &evidence())
            .unwrap_err()
            .contains("second insert failure"));
        assert_eq!(counts(&conn), (0, 0));
        conn.execute_batch("DROP TRIGGER fail_evidence; CREATE TABLE deferred_parent(id INTEGER PRIMARY KEY); CREATE TABLE deferred_child(parent_id INTEGER REFERENCES deferred_parent(id) DEFERRABLE INITIALLY DEFERRED); CREATE TEMP TRIGGER fail_commit AFTER INSERT ON venue_incident_metric_evidence BEGIN INSERT INTO deferred_child(parent_id) VALUES (7); END;").unwrap();
        assert!(save(&conn, &input(), &evidence())
            .unwrap_err()
            .contains("FOREIGN KEY"));
        assert!(conn.is_autocommit());
        assert_eq!(counts(&conn), (0, 0));
        let deferred: i64 = conn
            .query_row("SELECT COUNT(*) FROM deferred_child", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            deferred, 0,
            "commit failure rolls back trigger side effects too"
        );
    }

    #[test]
    fn strict_wire_validation_rejects_extra_missing_nonfinite_unbounded_and_inconsistent_values() {
        let base = serde_json::to_value(evidence()).unwrap();
        let cases = [
            ("/schemaVersion", json!(2)),
            ("/incidentId", json!("other")),
            ("/pressAt", json!("2026-11-18T10:00:01.000Z")),
            ("/source/generation", json!("x".repeat(129))),
            ("/source/deviceName", json!("🙂".repeat(32769))),
            ("/source/deck", json!("E")),
            ("/source/secondChannel", json!(4)),
            ("/source/format", json!("unknown")),
            ("/timing/ageMs", json!(-1)),
            ("/timing/observedAt", json!("2026-02-30T10:00:00.000Z")),
            ("/configuration/sampleRateHz", json!(3999)),
            ("/configuration/hopMs", json!(1001)),
            ("/configuration/analysisWindowSeconds", json!(10)),
            ("/configuration/thresholds/snrFloorDb", json!(41)),
            ("/metrics/dropouts", json!(1.5)),
            ("/metrics/snrDb", json!("-3.125")),
            ("/metrics/mainsHz", json!(55)),
            ("/metrics/locked", json!(1)),
            (
                "/loss/monitorDroppedBlocks",
                json!(9_007_199_254_740_992u64),
            ),
            ("/unavailable", json!([])),
            (
                "/unavailable",
                json!(["humDb", "humFloorDb", "mainsHz", "snrDb"]),
            ),
        ];
        for (pointer, replacement) in cases {
            let mut value = base.clone();
            *value.pointer_mut(pointer).unwrap() = replacement;
            assert!(rejected(value), "{pointer}");
        }
        for pointer in [
            "",
            "/source",
            "/timing",
            "/configuration",
            "/configuration/thresholds",
            "/metrics",
            "/loss",
        ] {
            let mut value = base.clone();
            value
                .pointer_mut(pointer)
                .unwrap()
                .as_object_mut()
                .unwrap()
                .insert("extra".into(), json!(1));
            assert!(rejected(value), "extra field at {pointer}");
        }
        for (pointer, field) in [
            ("/source", "deviceName"),
            ("/source", "sessionId"),
            ("/timing", "ageMs"),
            ("/metrics", "mainsHz"),
            ("/loss", "reportedDroppedBlocks"),
        ] {
            let mut value = base.clone();
            value
                .pointer_mut(pointer)
                .unwrap()
                .as_object_mut()
                .unwrap()
                .remove(field);
            assert!(rejected(value), "missing nullable field {field}");
        }
        for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            let mut e = evidence();
            e.metrics.snr_db = Some(bad);
            assert!(validate(&input(), &e).is_err());
        }
        let duplicate = serde_json::to_string(&base).unwrap().replacen(
            "\"schemaVersion\":1",
            "\"schemaVersion\":1,\"schemaVersion\":1",
            1,
        );
        assert!(serde_json::from_str::<MetricEvidenceInput>(&duplicate).is_err());
    }

    #[test]
    fn unavailable_fields_and_negative_finite_numbers_round_trip_without_sanitizing_saved_inputs() {
        let conn = mem();
        let mut value = serde_json::to_value(evidence()).unwrap();
        for key in NUMERIC_METRIC_KEYS {
            value["metrics"][key] = Value::Null;
        }
        value["unavailable"] = json!(NUMERIC_METRIC_KEYS);
        value["timing"]["ageMs"] = Value::Null;
        value["timing"]["sampleTimeSeconds"] = Value::Null;
        let e: MetricEvidenceInput = serde_json::from_value(value).unwrap();
        let saved = save(&conn, &input(), &e).unwrap();
        assert_eq!(saved.evidence.input, e);
        assert_eq!(
            saved.evidence.input.unavailable.len(),
            NUMERIC_METRIC_KEYS.len()
        );
        assert!(saved.evidence.input.timing.age_ms.is_none());
    }

    #[test]
    fn corrupted_or_restored_parent_and_one_sided_pairs_are_explicit_errors_without_writes() {
        let conn = mem();
        save(&conn, &input(), &evidence()).unwrap();
        conn.execute(
            "UPDATE venue_incident SET note='restored different parent' WHERE id='incident-1'",
            [],
        )
        .unwrap();
        assert!(get(&conn, "incident-1").is_err());
        let changed = IncidentInput {
            note: Some("restored different parent".into()),
            ..input()
        };
        assert!(
            save(&conn, &changed, &evidence()).is_err(),
            "companion keeps the original immutable parent binding"
        );
        assert!(save(&conn, &input(), &evidence()).is_err());
        conn.execute_batch("PRAGMA foreign_keys=OFF; DELETE FROM venue_incident;")
            .unwrap();
        assert!(save(&conn, &input(), &evidence()).is_err());
        assert!(get(&conn, "incident-1").is_err());
        assert_eq!(counts(&conn), (0, 1));
    }

    #[test]
    fn corrupted_companion_json_is_not_read_as_absence_and_remains_untouched() {
        let conn = mem();
        save(&conn, &input(), &evidence()).unwrap();
        let corrupt = "{not json}";
        conn.execute(
            "UPDATE venue_incident_metric_evidence SET submission_json=?1",
            [corrupt],
        )
        .unwrap();
        assert!(get(&conn, "incident-1")
            .unwrap_err()
            .starts_with("METRIC_EVIDENCE_STORAGE:"));
        assert!(summaries(&conn, &["incident-1".into()]).is_err());
        assert!(save(&conn, &input(), &evidence()).is_err());
        let retained: String = conn
            .query_row(
                "SELECT submission_json FROM venue_incident_metric_evidence",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(retained, corrupt);
    }

    #[test]
    fn bounded_summary_reads_include_exact_parent_and_explicit_absence_without_full_configuration()
    {
        let conn = mem();
        let pair = save(&conn, &input(), &evidence()).unwrap();
        let manual = IncidentInput {
            id: "manual".into(),
            ..input()
        };
        let ordinary = venue_incidents::save(&conn, &manual).unwrap();
        let rows = summaries(&conn, &["manual".into(), "incident-1".into()]).unwrap();
        assert_eq!(rows[0].incident, ordinary);
        assert!(rows[0].evidence.is_none());
        assert_eq!(rows[1].incident, pair.incident);
        let compact = serde_json::to_value(&rows[1]).unwrap();
        assert!(compact["evidence"].get("configuration").is_none());
        assert_eq!(compact["evidence"]["metrics"]["snrDb"], -3.125);
        assert!(summaries(&conn, &vec!["incident-1".into(); 301]).is_err());
        assert!(summaries(&conn, &["incident-1".into(), "incident-1".into()]).is_err());
        assert!(summaries(&conn, &["missing".into()]).is_err());
        assert!(summaries(&conn, &[]).unwrap().is_empty());
    }

    #[test]
    fn migration_25_is_additive_idempotent_and_keeps_v1_incidents_and_catalog_schema_compatible() {
        let conn = mem();
        conn.execute_batch("DROP TABLE venue_incident_metric_evidence; DELETE FROM schema_migration WHERE version=25;").unwrap();
        let ordinary = venue_incidents::save(&conn, &input()).unwrap();
        assert_eq!(
            crate::db::applied_migrations(&conn).unwrap(),
            (1..=24).collect::<Vec<_>>()
        );
        apply_migrations(&conn).unwrap();
        apply_migrations(&conn).unwrap();
        conn.execute_batch(include_str!(
            "../../database/migrations/0025_incident_metric_evidence.sql"
        ))
        .unwrap();
        assert_eq!(
            crate::db::applied_migrations(&conn).unwrap(),
            (1..=25).collect::<Vec<_>>()
        );
        assert_eq!(get(&conn, "incident-1").unwrap().incident, ordinary);
        assert_eq!(counts(&conn), (1, 0));
        crate::backup::validate_catalog_schema(&conn).unwrap();
    }

    struct Disk {
        root: std::path::PathBuf,
        live: std::path::PathBuf,
    }
    impl Disk {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("deckchek-metric-evidence-{}", new_id()));
            std::fs::create_dir_all(&root).unwrap();
            let live = root.join("deckchek.sqlite3");
            let conn = Connection::open(&live).unwrap();
            initialize(&conn);
            Self { root, live }
        }
    }
    impl Drop for Disk {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn concurrent_exact_writers_commit_one_pair_and_conflicting_evidence_cannot_replace_it() {
        let disk = Disk::new();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let threads: Vec<_> = (0..2)
            .map(|_| {
                let path = disk.live.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let conn = Connection::open(path).unwrap();
                    conn.busy_timeout(std::time::Duration::from_secs(5))
                        .unwrap();
                    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
                    barrier.wait();
                    save(&conn, &input(), &evidence()).unwrap()
                })
            })
            .collect();
        let results: Vec<_> = threads.into_iter().map(|t| t.join().unwrap()).collect();
        assert_eq!(results[0], results[1]);
        let conn = Connection::open(&disk.live).unwrap();
        assert_eq!(counts(&conn), (1, 1));
        let mut changed = evidence();
        changed.source.generation = "different-generation".into();
        assert!(save(&conn, &input(), &changed).is_err());
        assert_eq!(
            get(&conn, "incident-1").unwrap().evidence.unwrap(),
            results[0].evidence
        );
    }

    #[test]
    fn actual_database_backup_restore_preserves_pair_and_old_incident_with_schema_25() {
        use crate::backup::{self, Ctx, Kind, SettingsBlob};
        let disk = Disk::new();
        let (pair, manual) = {
            let conn = Connection::open(&disk.live).unwrap();
            let pair = save(&conn, &input(), &evidence()).unwrap();
            let manual = venue_incidents::save(
                &conn,
                &IncidentInput {
                    id: "manual".into(),
                    ..input()
                },
            )
            .unwrap();
            (pair, manual)
        };
        let archive = disk.root.join("evidence.deckchek-backup");
        let created = backup::create_backup(
            &disk.live,
            &archive,
            Kind::Manual,
            &SettingsBlob::default(),
            &mut |_, _| {},
        )
        .unwrap();
        assert_eq!(created.schema_version, 25);
        {
            let conn = Connection::open(&disk.live).unwrap();
            venue_incidents::save(
                &conn,
                &IncidentInput {
                    id: "after-backup".into(),
                    ..input()
                },
            )
            .unwrap();
        }
        let ctx = Ctx {
            live_db: disk.live.clone(),
            backups_dir: disk.root.join("backups"),
            gate: Box::leak(Box::new(std::sync::RwLock::new(()))),
            capture_running: backup::no_capture(),
            activity: crate::capture::CaptureLease::default(),
        };
        let result =
            backup::restore_backup(&ctx, &archive, true, &SettingsBlob::default(), None).unwrap();
        assert_eq!(result.schema_version, 25);
        let conn = Connection::open(&disk.live).unwrap();
        assert_eq!(counts(&conn), (2, 1));
        assert_eq!(
            get(&conn, "incident-1").unwrap().evidence.unwrap(),
            pair.evidence
        );
        assert_eq!(get(&conn, "manual").unwrap().incident, manual);
        assert_eq!(save(&conn, &input(), &evidence()).unwrap(), pair);
        crate::backup::validate_catalog_schema(&conn).unwrap();
    }

    #[test]
    fn actual_restore_rollback_and_capture_reservation_preserve_the_live_pair() {
        use crate::backup::{self, Ctx, FailPoint, Kind, SettingsBlob};
        let disk = Disk::new();
        let archive = disk.root.join("before.deckchek-backup");
        backup::create_backup(
            &disk.live,
            &archive,
            Kind::Manual,
            &SettingsBlob::default(),
            &mut |_, _| {},
        )
        .unwrap();
        let saved = {
            let conn = Connection::open(&disk.live).unwrap();
            save(&conn, &input(), &evidence()).unwrap()
        };
        let activity = crate::capture::CaptureLease::default();
        let ctx = Ctx {
            live_db: disk.live.clone(),
            backups_dir: disk.root.join("backups"),
            gate: Box::leak(Box::new(std::sync::RwLock::new(()))),
            capture_running: backup::no_capture(),
            activity: activity.clone(),
        };
        let lease = activity
            .acquire("metric-test", None, crate::capture::LeaseKind::Stream)
            .unwrap();
        assert_eq!(
            backup::restore_backup(&ctx, &archive, true, &SettingsBlob::default(), None)
                .unwrap_err()
                .code,
            "capture_running"
        );
        activity.release(lease.lease_id);
        for fail in [
            FailPoint::Migration,
            FailPoint::AfterSafetyBackup,
            FailPoint::MidSwap,
            FailPoint::AfterSwap,
        ] {
            assert!(backup::restore_backup(
                &ctx,
                &archive,
                true,
                &SettingsBlob::default(),
                Some(fail)
            )
            .is_err());
            let conn = Connection::open(&disk.live).unwrap();
            assert_eq!(save(&conn, &input(), &evidence()).unwrap(), saved);
            assert_eq!(counts(&conn), (1, 1));
        }
    }
}
