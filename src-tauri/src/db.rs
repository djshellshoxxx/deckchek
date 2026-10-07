use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
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

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistFinding {
    pub code: String,
    pub title: String,
    pub detail: String,
    pub severity: String,
    pub confidence: Option<f64>,
    pub possible_causes: Option<Vec<String>>,
    pub isolation_tests: Option<Vec<String>>,
    /// Alternative explanations (stored in hypothesis.alternatives_json).
    #[serde(default)]
    pub alternatives: Option<Vec<String>>,
    /// Metric ids of measurements that support this finding.
    #[serde(default)]
    pub supported_by: Option<Vec<String>>,
    /// Metric ids of measurements that contradict this finding.
    #[serde(default)]
    pub contradicted_by: Option<Vec<String>>,
    /// Optional explicit hypothesis status; derived when absent.
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
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
    /// Workflow/mode; stored as session.session_type (default "diagnostic").
    #[serde(default)]
    pub session_type: Option<String>,
    #[serde(default)]
    pub workflow: Option<String>,
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
    crate::catalog::seed_if_empty(&conn)?;
    Ok(conn)
}

pub fn apply_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(MIGRATION_0001).map_err(|e| e.to_string())
}

static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

/// UUID-v4-shaped unique id (std-only; not cryptographic).
pub fn new_id() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let n = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut h1 = RandomState::new().build_hasher();
    h1.write_u128(nanos);
    h1.write_u64(n);
    let mut h2 = RandomState::new().build_hasher();
    h2.write_u64(h1.finish());
    h2.write_u64(n);
    let (a, b) = (h1.finish(), h2.finish());
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (a >> 32) as u32,
        (a >> 16) as u16,
        (a & 0xfff) as u16,
        ((b >> 48) as u16 & 0x3fff) | 0x8000,
        b & 0xffff_ffff_ffff
    )
}

pub fn now_iso(conn: &Connection) -> Result<String, String> {
    conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| r.get(0)).map_err(|e| e.to_string())
}

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

pub fn persist_run(conn: &mut Connection, run: &PersistRun) -> Result<(), String> {
    let tx = conn.transaction().map_err(e2s)?;
    let config = json!({
        "test": run.test,
        "sourceFile": run.source_file,
        "sampleRate": run.sample_rate,
        "channels": run.channels,
        "score": run.score,
        "deviceId": run.device_id,
    }).to_string();
    let session_type = run.session_type.as_deref().or(run.workflow.as_deref()).filter(|s| !s.trim().is_empty()).unwrap_or("diagnostic");

    // INSERT OR REPLACE cascades away any earlier children of the same run id.
    tx.execute(
        "INSERT OR REPLACE INTO session (id, session_type, setup_id, started_at, ended_at, app_version, schema_version, status, context_profile, operator_notes, session_quality, config_snapshot_json) VALUES (?1, ?2, NULL, ?3, ?3, ?4, 1, 'completed', ?5, NULL, ?6, ?7)",
        params![run.id, session_type, run.created_at, env!("CARGO_PKG_VERSION"), run.test, run.score.map(|v| v / 100.0), config],
    ).map_err(e2s)?;

    let mut measurement_ids: std::collections::HashMap<&str, String> = std::collections::HashMap::new();
    for m in &run.measurements {
        let method_id = format!("method:{}:1", m.metric_id);
        let description = m.label.as_deref().unwrap_or(&m.metric_id);
        tx.execute(
            "INSERT OR IGNORE INTO analysis_method (id, key, version, description, parameters_json, created_at) VALUES (?1, ?2, 1, ?3, '{}', CURRENT_TIMESTAMP)",
            params![method_id, m.metric_id, description],
        ).map_err(e2s)?;

        let measurement_id = format!("{}:{}", run.id, m.metric_id);
        let flags = serde_json::to_string(m.quality_flags.as_deref().unwrap_or(&[])).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO measurement (id, session_id, capture_id, method_id, metric_key, state, numeric_value, text_value, unit, channel_scope, confidence, uncertainty, quality_flags_json, created_at) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, NULL, ?7, NULL, ?8, ?9, ?10, ?11)",
            params![measurement_id, run.id, method_id, m.metric_id, m.origin.as_deref().unwrap_or("measured"), m.value, m.unit, m.confidence, m.uncertainty, flags, run.created_at],
        ).map_err(e2s)?;
        measurement_ids.insert(m.metric_id.as_str(), measurement_id);
    }

    for (index, f) in run.findings.iter().enumerate() {
        let confidence = f.confidence.unwrap_or(0.5).clamp(0.0, 1.0);
        let evidence_id = format!("{}:finding:{}:{}", run.id, index, f.code);
        let features = json!({
            "code": f.code,
            "possibleCauses": f.possible_causes,
            "isolationTests": f.isolation_tests,
        }).to_string();
        let summary = format!("{}: {}", f.title, f.detail);
        tx.execute(
            "INSERT OR REPLACE INTO evidence (id, session_id, evidence_type, severity, confidence, summary, features_json, created_at) VALUES (?1, ?2, 'diagnostic_finding', ?3, ?4, ?5, ?6, ?7)",
            params![evidence_id, run.id, f.severity, confidence, summary, features, run.created_at],
        ).map_err(e2s)?;

        for metric in f.supported_by.iter().flatten() {
            if let Some(mid) = measurement_ids.get(metric.as_str()) {
                tx.execute("INSERT OR IGNORE INTO evidence_measurement (evidence_id, measurement_id) VALUES (?1, ?2)", params![evidence_id, mid]).map_err(e2s)?;
            }
        }

        let contra: Vec<&String> = f.contradicted_by.iter().flatten().filter(|m| measurement_ids.contains_key(m.as_str())).collect();
        let status = f.status.clone().unwrap_or_else(|| if contra.is_empty() { "supported".into() } else { "contested".into() });
        let hypothesis_id = format!("{}:hyp:{}:{}", run.id, index, f.code);
        let alternatives = serde_json::to_string(f.alternatives.as_deref().or(f.possible_causes.as_deref()).unwrap_or(&[])).map_err(|e| e.to_string())?;
        let isolation = serde_json::to_string(f.isolation_tests.as_deref().unwrap_or(&[])).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO hypothesis (id, session_id, hypothesis_key, status, confidence, severity, summary, reasoning_version, alternatives_json, isolation_tests_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9, ?10, ?10)",
            params![hypothesis_id, run.id, f.code, status, confidence, f.severity, summary, alternatives, isolation, run.created_at],
        ).map_err(e2s)?;
        tx.execute(
            "INSERT OR REPLACE INTO hypothesis_support (evidence_id, hypothesis_id, weight) VALUES (?1, ?2, ?3)",
            params![evidence_id, hypothesis_id, confidence],
        ).map_err(e2s)?;

        for metric in contra {
            let mid = &measurement_ids[metric.as_str()];
            let cev = format!("{}:contra:{}:{}", run.id, index, metric);
            tx.execute(
                "INSERT OR REPLACE INTO evidence (id, session_id, evidence_type, severity, confidence, summary, features_json, created_at) VALUES (?1, ?2, 'contradicting_measurement', 'info', ?3, ?4, ?5, ?6)",
                params![cev, run.id, confidence, format!("Measurement {metric} contradicts {}", f.code), json!({"metricId": metric, "hypothesis": f.code}).to_string(), run.created_at],
            ).map_err(e2s)?;
            tx.execute("INSERT OR IGNORE INTO evidence_measurement (evidence_id, measurement_id) VALUES (?1, ?2)", params![cev, mid]).map_err(e2s)?;
            tx.execute("INSERT OR REPLACE INTO hypothesis_contradiction (evidence_id, hypothesis_id, weight) VALUES (?1, ?2, 1.0)", params![cev, hypothesis_id]).map_err(e2s)?;
        }
    }

    tx.commit().map_err(e2s)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSummary {
    pub id: String,
    pub session_type: String,
    pub test: Option<String>,
    pub started_at: String,
    pub status: String,
    pub score: Option<f64>,
    pub measurement_count: i64,
    pub hypothesis_count: i64,
}

pub fn list_runs(conn: &Connection, limit: Option<u32>) -> Result<Vec<RunSummary>, String> {
    let limit = limit.unwrap_or(50).clamp(1, 500) as i64;
    let mut stmt = conn.prepare(
        "SELECT s.id, s.session_type, s.context_profile, s.started_at, s.status, s.session_quality,
                (SELECT COUNT(*) FROM measurement m WHERE m.session_id = s.id),
                (SELECT COUNT(*) FROM hypothesis h WHERE h.session_id = s.id)
         FROM session s ORDER BY s.started_at DESC, s.id LIMIT ?1",
    ).map_err(e2s)?;
    let rows = stmt.query_map([limit], |r| {
        Ok(RunSummary {
            id: r.get(0)?,
            session_type: r.get(1)?,
            test: r.get(2)?,
            started_at: r.get(3)?,
            status: r.get(4)?,
            score: r.get::<_, Option<f64>>(5)?.map(|v| v * 100.0),
            measurement_count: r.get(6)?,
            hypothesis_count: r.get(7)?,
        })
    }).map_err(e2s)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)
}

/// Full run: session, measurements, and hypotheses with support/contradiction
/// evidence (each entry has evidenceId, weight, summary, measurementIds).
pub fn get_run(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    let session = conn.query_row(
        "SELECT id, session_type, setup_id, started_at, ended_at, status, context_profile, session_quality, config_snapshot_json FROM session WHERE id = ?1",
        [id],
        |r| {
            let config: String = r.get(8)?;
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "sessionType": r.get::<_, String>(1)?,
                "setupId": r.get::<_, Option<String>>(2)?,
                "startedAt": r.get::<_, String>(3)?,
                "endedAt": r.get::<_, Option<String>>(4)?,
                "status": r.get::<_, String>(5)?,
                "test": r.get::<_, Option<String>>(6)?,
                "score": r.get::<_, Option<f64>>(7)?.map(|v| v * 100.0),
                "config": serde_json::from_str::<Value>(&config).unwrap_or(Value::Null),
            }))
        },
    );
    let mut session = match session {
        Ok(v) => v,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(e2s(e)),
    };

    let mut stmt = conn.prepare(
        "SELECT id, metric_key, state, numeric_value, text_value, unit, confidence, uncertainty, quality_flags_json FROM measurement WHERE session_id = ?1 ORDER BY metric_key, id",
    ).map_err(e2s)?;
    let measurements = stmt.query_map([id], |r| {
        let flags: String = r.get(8)?;
        Ok(json!({
            "id": r.get::<_, String>(0)?,
            "metricId": r.get::<_, String>(1)?,
            "origin": r.get::<_, String>(2)?,
            "value": r.get::<_, Option<f64>>(3)?,
            "text": r.get::<_, Option<String>>(4)?,
            "unit": r.get::<_, Option<String>>(5)?,
            "confidence": r.get::<_, Option<f64>>(6)?,
            "uncertainty": r.get::<_, Option<f64>>(7)?,
            "qualityFlags": serde_json::from_str::<Value>(&flags).unwrap_or(json!([])),
        }))
    }).map_err(e2s)?.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)?;

    let mut hstmt = conn.prepare(
        "SELECT id, hypothesis_key, status, confidence, severity, summary, alternatives_json, isolation_tests_json FROM hypothesis WHERE session_id = ?1 ORDER BY id",
    ).map_err(e2s)?;
    let hyps: Vec<(String, Value)> = hstmt.query_map([id], |r| {
        let alt: String = r.get(6)?;
        let iso: String = r.get(7)?;
        let hid: String = r.get(0)?;
        Ok((hid.clone(), json!({
            "id": hid,
            "key": r.get::<_, String>(1)?,
            "status": r.get::<_, String>(2)?,
            "confidence": r.get::<_, f64>(3)?,
            "severity": r.get::<_, String>(4)?,
            "summary": r.get::<_, String>(5)?,
            "alternatives": serde_json::from_str::<Value>(&alt).unwrap_or(json!([])),
            "isolationTests": serde_json::from_str::<Value>(&iso).unwrap_or(json!([])),
        })))
    }).map_err(e2s)?.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)?;

    let mut hypotheses = Vec::new();
    for (hid, mut h) in hyps {
        h["support"] = Value::Array(link_rows(conn, "hypothesis_support", &hid)?);
        h["contradictions"] = Value::Array(link_rows(conn, "hypothesis_contradiction", &hid)?);
        hypotheses.push(h);
    }
    session["measurements"] = Value::Array(measurements);
    session["hypotheses"] = Value::Array(hypotheses);
    Ok(Some(session))
}

fn link_rows(conn: &Connection, table: &str, hypothesis_id: &str) -> Result<Vec<Value>, String> {
    // `table` is one of two fixed literals chosen by get_run.
    let table = match table {
        "hypothesis_support" => "hypothesis_support",
        "hypothesis_contradiction" => "hypothesis_contradiction",
        _ => return Err("invalid link table".into()),
    };
    let sql = format!(
        "SELECT l.evidence_id, l.weight, e.summary, e.evidence_type FROM {table} l JOIN evidence e ON e.id = l.evidence_id WHERE l.hypothesis_id = ?1 ORDER BY l.evidence_id"
    );
    let mut stmt = conn.prepare(&sql).map_err(e2s)?;
    let rows = stmt.query_map([hypothesis_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?))).map_err(e2s)?
        .collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)?;
    let mut out = Vec::new();
    for (eid, weight, summary, etype) in rows {
        let mut ms = conn.prepare("SELECT measurement_id FROM evidence_measurement WHERE evidence_id = ?1 ORDER BY measurement_id").map_err(e2s)?;
        let ids = ms.query_map([&eid], |r| r.get::<_, String>(0)).map_err(e2s)?.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)?;
        out.push(json!({"evidenceId": eid, "weight": weight, "summary": summary, "evidenceType": etype, "measurementIds": ids}));
    }
    Ok(out)
}

// ---- Repeat-scan alignment ----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanInput {
    pub id: Option<String>,
    pub session_id: String,
    /// Existing record_side id; if absent a minimal release/copy/side is created.
    pub record_side_id: Option<String>,
    pub record_title: Option<String>,
    pub side_label: Option<String>,
    pub start_sample: i64,
    pub end_sample: i64,
    pub scan_version: Option<i64>,
    pub condition_score: Option<f64>,
    pub live_readiness: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EventCounts {
    #[serde(default)]
    pub persistent: i64,
    #[serde(default)]
    pub new: i64,
    #[serde(default)]
    pub missing: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanAlignmentInput {
    pub id: Option<String>,
    pub scan_a: ScanInput,
    pub scan_b: ScanInput,
    pub method: Option<String>,
    pub offset_samples: i64,
    pub confidence: f64,
    #[serde(default)]
    pub counts: Option<EventCounts>,
    /// Free-form drift model (e.g. {"ppm": 12.5}); stored with the counts.
    #[serde(default)]
    pub drift: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanAlignmentSaved {
    pub id: String,
    pub scan_a_id: String,
    pub scan_b_id: String,
}

fn ensure_side(tx: &rusqlite::Transaction, s: &ScanInput) -> Result<String, String> {
    if let Some(id) = &s.record_side_id {
        return Ok(id.clone());
    }
    let rel = new_id();
    let copy = new_id();
    let side = new_id();
    tx.execute("INSERT INTO record_release (id, title) VALUES (?1, ?2)", params![rel, s.record_title.as_deref().unwrap_or("Untitled record")]).map_err(e2s)?;
    tx.execute("INSERT INTO record_copy (id, record_id) VALUES (?1, ?2)", params![copy, rel]).map_err(e2s)?;
    tx.execute("INSERT INTO record_side (id, record_copy_id, side_label) VALUES (?1, ?2, ?3)", params![side, copy, s.side_label.as_deref().unwrap_or("A")]).map_err(e2s)?;
    Ok(side)
}

fn save_scan(tx: &rusqlite::Transaction, s: &ScanInput, side_id: &str) -> Result<String, String> {
    let id = s.id.clone().unwrap_or_else(new_id);
    tx.execute(
        "INSERT INTO full_side_scan (id, session_id, record_side_id, start_sample, end_sample, scan_version, condition_score, live_readiness, raw_audio_retained) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)
         ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id, record_side_id=excluded.record_side_id, start_sample=excluded.start_sample, end_sample=excluded.end_sample, scan_version=excluded.scan_version, condition_score=excluded.condition_score, live_readiness=excluded.live_readiness",
        params![id, s.session_id, side_id, s.start_sample, s.end_sample, s.scan_version.unwrap_or(1), s.condition_score, s.live_readiness],
    ).map_err(e2s)?;
    Ok(id)
}

/// Persist two scans and their alignment. Event counts and drift are stored in
/// scan_alignment.drift_model_json as {"counts": {...}, "drift": ...}.
pub fn save_scan_alignment(conn: &mut Connection, input: &ScanAlignmentInput) -> Result<ScanAlignmentSaved, String> {
    if !(0.0..=1.0).contains(&input.confidence) {
        return Err("confidence must be between 0 and 1".into());
    }
    let tx = conn.transaction().map_err(e2s)?;
    let side_a = ensure_side(&tx, &input.scan_a)?;
    // Repeat scans of the same side share a record side unless told otherwise.
    let side_b = match (&input.scan_b.record_side_id, &input.scan_b.record_title) {
        (None, None) => side_a.clone(),
        _ => ensure_side(&tx, &input.scan_b)?,
    };
    let a = save_scan(&tx, &input.scan_a, &side_a)?;
    let b = save_scan(&tx, &input.scan_b, &side_b)?;
    let id = input.id.clone().unwrap_or_else(new_id);
    let counts = input.counts.as_ref().map(|c| json!({"persistent": c.persistent, "new": c.new, "missing": c.missing}));
    let model = json!({"counts": counts, "drift": input.drift}).to_string();
    tx.execute(
        "INSERT INTO scan_alignment (id, scan_a_id, scan_b_id, alignment_method, offset_samples, drift_model_json, confidence) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET scan_a_id=excluded.scan_a_id, scan_b_id=excluded.scan_b_id, alignment_method=excluded.alignment_method, offset_samples=excluded.offset_samples, drift_model_json=excluded.drift_model_json, confidence=excluded.confidence",
        params![id, a, b, input.method.as_deref().unwrap_or("cross_correlation"), input.offset_samples, model, input.confidence],
    ).map_err(e2s)?;
    tx.commit().map_err(e2s)?;
    Ok(ScanAlignmentSaved { id, scan_a_id: a, scan_b_id: b })
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
                confidence: Some(0.9),
                uncertainty: None,
                quality_flags: Some(vec![]),
            }],
            findings: vec![PersistFinding {
                code: "CHECK".into(),
                title: "Review".into(),
                detail: "Example".into(),
                severity: "review".into(),
                confidence: Some(0.7),
                possible_causes: Some(vec!["cause".into()]),
                isolation_tests: Some(vec!["repeat".into()]),
                ..Default::default()
            }],
            ..Default::default()
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

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        c
    }

    fn meas(id: &str, v: f64) -> PersistMeasurement {
        PersistMeasurement { metric_id: id.into(), label: None, value: v, unit: "dB".into(), origin: None, confidence: Some(0.8), uncertainty: None, quality_flags: None }
    }

    fn graph_run(id: &str, created: &str) -> PersistRun {
        PersistRun {
            id: id.into(),
            test: "Stereo balance".into(),
            created_at: created.into(),
            score: Some(80.0),
            measurements: vec![meas("a", 1.0), meas("b", 2.0), meas("c", 3.0)],
            findings: vec![PersistFinding {
                code: "IMBALANCE".into(),
                title: "t".into(),
                detail: "d".into(),
                severity: "review".into(),
                confidence: Some(0.7),
                alternatives: Some(vec!["cable".into()]),
                supported_by: Some(vec!["a".into(), "b".into(), "missing".into()]),
                contradicted_by: Some(vec!["c".into(), "nope".into()]),
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    #[test]
    fn hypothesis_support_and_contradiction_persist() {
        let mut c = mem();
        persist_run(&mut c, &graph_run("r1", "2026-10-06T08:00:00Z")).unwrap();
        let (status, conf): (String, f64) = c.query_row("SELECT status, confidence FROM hypothesis WHERE session_id='r1'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(status, "contested");
        assert_eq!(conf, 0.7);
        fn n(c: &Connection, sql: &str) -> i64 { c.query_row(sql, [], |r| r.get(0)).unwrap() }
        assert_eq!(n(&c, "SELECT COUNT(*) FROM hypothesis_support"), 1);
        assert_eq!(n(&c, "SELECT COUNT(*) FROM hypothesis_contradiction"), 1);
        assert_eq!(n(&c, "SELECT COUNT(*) FROM evidence_measurement"), 3);
        let stype: String = c.query_row("SELECT session_type FROM session WHERE id='r1'", [], |r| r.get(0)).unwrap();
        assert_eq!(stype, "diagnostic");
        // re-saving the same run is idempotent
        persist_run(&mut c, &graph_run("r1", "2026-10-06T08:00:00Z")).unwrap();
        assert_eq!(n(&c, "SELECT COUNT(*) FROM hypothesis"), 1);
        assert_eq!(n(&c, "SELECT COUNT(*) FROM evidence"), 2);
    }

    #[test]
    fn legacy_payload_without_new_fields_deserializes() {
        let run: PersistRun = serde_json::from_str(r#"{"id":"x","test":"t","createdAt":"2026-01-01","measurements":[],"findings":[{"code":"C","title":"t","detail":"d","severity":"info"}]}"#).unwrap();
        let mut c = mem();
        persist_run(&mut c, &run).unwrap();
        let s: String = c.query_row("SELECT status FROM hypothesis", [], |r| r.get(0)).unwrap();
        assert_eq!(s, "supported");
    }

    #[test]
    fn list_and_get_run() {
        let mut c = mem();
        persist_run(&mut c, &graph_run("r1", "2026-10-06T08:00:00Z")).unwrap();
        persist_run(&mut c, &graph_run("r2", "2026-10-07T08:00:00Z")).unwrap();
        let runs = list_runs(&c, Some(1)).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].id, "r2");
        assert_eq!(runs[0].measurement_count, 3);
        assert_eq!(runs[0].hypothesis_count, 1);
        assert_eq!(runs[0].score, Some(80.0));
        assert_eq!(list_runs(&c, None).unwrap().len(), 2);
        let run = get_run(&c, "r1").unwrap().unwrap();
        assert_eq!(run["measurements"].as_array().unwrap().len(), 3);
        let h = &run["hypotheses"][0];
        assert_eq!(h["status"], "contested");
        assert_eq!(h["support"][0]["measurementIds"].as_array().unwrap().len(), 2);
        assert_eq!(h["contradictions"][0]["measurementIds"][0], "r1:c");
        assert!(get_run(&c, "none").unwrap().is_none());
    }

    #[test]
    fn scan_alignment_persists() {
        let mut c = mem();
        persist_run(&mut c, &graph_run("s1", "2026-10-06T08:00:00Z")).unwrap();
        persist_run(&mut c, &graph_run("s2", "2026-10-07T08:00:00Z")).unwrap();
        let input: ScanAlignmentInput = serde_json::from_value(json!({
            "scanA": {"sessionId": "s1", "startSample": 0, "endSample": 1000, "recordTitle": "Test LP"},
            "scanB": {"sessionId": "s2", "startSample": 5, "endSample": 1005},
            "offsetSamples": 5, "confidence": 0.93,
            "counts": {"persistent": 4, "new": 1, "missing": 2},
            "drift": {"ppm": 12.5}
        })).unwrap();
        let saved = save_scan_alignment(&mut c, &input).unwrap();
        let (off, model): (i64, String) = c.query_row("SELECT offset_samples, drift_model_json FROM scan_alignment WHERE id=?1", [&saved.id], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(off, 5);
        let m: Value = serde_json::from_str(&model).unwrap();
        assert_eq!(m["counts"]["missing"], 2);
        assert_eq!(m["drift"]["ppm"], 12.5);
        let sides: i64 = c.query_row("SELECT COUNT(DISTINCT record_side_id) FROM full_side_scan", [], |r| r.get(0)).unwrap();
        assert_eq!(sides, 1);
        let mut bad = input;
        bad.confidence = 2.0;
        assert!(save_scan_alignment(&mut c, &bad).is_err());
    }

    #[test]
    fn new_ids_are_unique_and_uuid_shaped() {
        let a = new_id();
        assert_eq!(a.len(), 36);
        assert_ne!(a, new_id());
    }
}
