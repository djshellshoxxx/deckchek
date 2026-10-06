use rusqlite::{params, Connection};
use serde::Deserialize;
use std::{fs, path::{Path, PathBuf}};
use tauri::{AppHandle, Manager};

const MIGRATION_0001: &str = include_str!("../../database/migrations/0001_initial.sql");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistMeasurement {
    pub metric_id: String,
    pub label: Option<String>,
    pub value: f64,
    pub unit: String,
    pub origin: Option<String>,
    pub confidence: Option<f64>,
    pub uncertainty: Option<f64>,
    pub quality_flags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistFinding {
    pub code: String,
    pub title: String,
    pub detail: String,
    pub severity: String,
    pub confidence: Option<f64>,
    pub possible_causes: Option<Vec<String>>,
    pub isolation_tests: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistRun {
    pub id: String,
    pub device_id: Option<String>,
    pub test: String,
    pub created_at: String,
    pub source_file: Option<String>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub measurements: Vec<PersistMeasurement>,
    pub findings: Vec<PersistFinding>,
    pub score: Option<f64>,
}

pub fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("deckchek.sqlite3"))
}

pub fn open_database(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys=ON;").map_err(|e| e.to_string())?;
    apply_migrations(&conn)?;
    Ok(conn)
}

pub fn apply_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(MIGRATION_0001).map_err(|e| e.to_string())
}

pub fn persist_run(conn: &mut Connection, run: &PersistRun) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let config = serde_json::json!({
        "test": run.test,
        "sourceFile": run.source_file,
        "sampleRate": run.sample_rate,
        "channels": run.channels,
        "score": run.score,
        "deviceId": run.device_id,
    }).to_string();

    tx.execute(
        "INSERT OR REPLACE INTO session (id, setup_id, started_at, ended_at, app_version, schema_version, status, context_profile, operator_notes, session_quality, config_snapshot_json) VALUES (?1, NULL, ?2, ?2, ?3, 1, 'completed', ?4, NULL, ?5, ?6)",
        params![run.id, run.created_at, env!("CARGO_PKG_VERSION"), run.test, run.score.map(|v| v / 100.0), config],
    ).map_err(|e| e.to_string())?;

    for m in &run.measurements {
        let method_id = format!("method:{}:1", m.metric_id);
        let description = m.label.as_deref().unwrap_or(&m.metric_id);
        tx.execute(
            "INSERT OR IGNORE INTO analysis_method (id, key, version, description, parameters_json, created_at) VALUES (?1, ?2, 1, ?3, '{}', CURRENT_TIMESTAMP)",
            params![method_id, m.metric_id, description],
        ).map_err(|e| e.to_string())?;

        let measurement_id = format!("{}:{}", run.id, m.metric_id);
        let flags = serde_json::to_string(m.quality_flags.as_deref().unwrap_or(&[])).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO measurement (id, session_id, capture_id, method_id, metric_key, state, numeric_value, text_value, unit, channel_scope, confidence, uncertainty, quality_flags_json, created_at) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, NULL, ?7, NULL, ?8, ?9, ?10, ?11)",
            params![measurement_id, run.id, method_id, m.metric_id, m.origin.as_deref().unwrap_or("measured"), m.value, m.unit, m.confidence, m.uncertainty, flags, run.created_at],
        ).map_err(|e| e.to_string())?;
    }

    for (index, f) in run.findings.iter().enumerate() {
        let evidence_id = format!("{}:finding:{}:{}", run.id, index, f.code);
        let features = serde_json::json!({
            "code": f.code,
            "possibleCauses": f.possible_causes,
            "isolationTests": f.isolation_tests,
        }).to_string();
        tx.execute(
            "INSERT OR REPLACE INTO evidence (id, session_id, evidence_type, severity, confidence, summary, features_json, created_at) VALUES (?1, ?2, 'diagnostic_finding', ?3, ?4, ?5, ?6, ?7)",
            params![evidence_id, run.id, f.severity, f.confidence.unwrap_or(0.5), format!("{}: {}", f.title, f.detail), features, run.created_at],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_applies_to_memory_database() {
        let conn = Connection::open_in_memory().unwrap();
        apply_migrations(&conn).unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM schema_migration WHERE version=1",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn diagnostic_run_persists_measurement_and_finding() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&conn).unwrap();
        let run = PersistRun {
            id: "run-test".into(),
            device_id: None,
            test: "Stereo balance".into(),
            created_at: "2026-10-06T08:00:00Z".into(),
            source_file: Some("fixture.wav".into()),
            sample_rate: Some(48000),
            channels: Some(2),
            score: Some(92.0),
            measurements: vec![PersistMeasurement {
                metric_id: "channel_balance_db".into(),
                label: Some("Channel balance".into()),
                value: 0.2,
                unit: "dB".into(),
                origin: Some("measured".into()),
                confidence: Some(.9),
                uncertainty: None,
                quality_flags: Some(vec![]),
            }],
            findings: vec![PersistFinding {
                code: "CHECK".into(),
                title: "Review".into(),
                detail: "Example".into(),
                severity: "review".into(),
                confidence: Some(.7),
                possible_causes: Some(vec!["cause".into()]),
                isolation_tests: Some(vec!["repeat".into()]),
            }],
        };
        persist_run(&mut conn, &run).unwrap();
        let mc: i64 = conn.query_row(
            "SELECT COUNT(*) FROM measurement WHERE session_id='run-test'",
            [],
            |r| r.get(0),
        ).unwrap();
        let ec: i64 = conn.query_row(
            "SELECT COUNT(*) FROM evidence WHERE session_id='run-test'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(mc, 1);
        assert_eq!(ec, 1);
    }
}
