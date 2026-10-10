//! Stylus wear tracker persistence (FS-12, tables from `0009_stylus_wear.sql`).
//! Hours are NOT stored here: they live in the shared `asset_usage` ledger (`usage.rs`).
//! This module owns benchmarks, alert snoozes, the per-asset rated-life override and the
//! `stylus_replaced` maintenance event that resets the hours baseline. All SQL is parameterised.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::db::{database_path, new_id, now_iso, open_database};
use crate::usage::valid_timestamp;

pub const REPLACED_EVENT: &str = "stylus_replaced";
pub const MAX_RATED_HOURS: f64 = 100_000.0;
pub const MAX_DETAIL_BYTES: usize = 64 * 1024;
pub const MAX_NOTE_CHARS: usize = 500;
pub const SEVERITIES: &[&str] = &["info", "amber", "red"];

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkInput {
    pub asset_id: String,
    pub session_id: Option<String>,
    pub setup_id: Option<String>,
    pub hours_at: f64,
    pub thd_percent: Option<f64>,
    pub separation_db: Option<f64>,
    pub tc_snr_db: Option<f64>,
    pub tc_phase_error_deg: Option<f64>,
    pub tc_dropouts: Option<i64>,
    /// Defaults to valid; conditions that do not match the baseline run are saved with `false`.
    pub valid: Option<bool>,
    pub detail: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Benchmark {
    pub id: String,
    pub asset_id: String,
    pub session_id: Option<String>,
    pub setup_id: Option<String>,
    pub hours_at: f64,
    pub thd_percent: Option<f64>,
    pub separation_db: Option<f64>,
    pub tc_snr_db: Option<f64>,
    pub tc_phase_error_deg: Option<f64>,
    pub tc_dropouts: Option<i64>,
    pub valid: bool,
    pub detail: Value,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StylusAlert {
    pub id: String,
    pub asset_id: String,
    pub kind: String,
    pub severity: String,
    pub snoozed_until: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct IdResult {
    pub id: String,
}

fn check_range(name: &str, v: Option<f64>, lo: f64, hi: f64) -> Result<(), String> {
    match v {
        Some(x) if !x.is_finite() || x < lo || x > hi => Err(format!("{name} must be between {lo} and {hi}")),
        _ => Ok(()),
    }
}

pub fn validate_benchmark(i: &BenchmarkInput) -> Result<(), String> {
    if i.asset_id.trim().is_empty() {
        return Err("benchmark needs an assetId".into());
    }
    check_range("hoursAt", Some(i.hours_at), 0.0, 1_000_000.0)?;
    check_range("thdPercent", i.thd_percent, 0.0, 1000.0)?;
    check_range("separationDb", i.separation_db, -60.0, 140.0)?;
    check_range("tcSnrDb", i.tc_snr_db, -60.0, 140.0)?;
    check_range("tcPhaseErrorDeg", i.tc_phase_error_deg, 0.0, 360.0)?;
    if i.tc_dropouts.map_or(false, |d| !(0..=1_000_000).contains(&d)) {
        return Err("tcDropouts must be between 0 and 1000000".into());
    }
    if i.thd_percent.is_none() && i.separation_db.is_none() && i.tc_snr_db.is_none() && i.tc_phase_error_deg.is_none() && i.tc_dropouts.is_none() {
        return Err("benchmark has no metrics".into());
    }
    Ok(())
}

fn asset_exists(conn: &Connection, id: &str) -> Result<(), String> {
    let n: Option<i64> = conn.query_row("SELECT 1 FROM asset WHERE id = ?1", [id], |r| r.get(0)).optional().map_err(e2s)?;
    n.map(|_| ()).ok_or_else(|| format!("unknown asset '{id}'"))
}

fn bench_row(r: &rusqlite::Row) -> rusqlite::Result<Benchmark> {
    let detail: String = r.get(11)?;
    Ok(Benchmark {
        id: r.get(0)?,
        asset_id: r.get(1)?,
        session_id: r.get(2)?,
        setup_id: r.get(3)?,
        hours_at: r.get(4)?,
        thd_percent: r.get(5)?,
        separation_db: r.get(6)?,
        tc_snr_db: r.get(7)?,
        tc_phase_error_deg: r.get(8)?,
        tc_dropouts: r.get(9)?,
        valid: r.get::<_, i64>(10)? != 0,
        detail: serde_json::from_str(&detail).unwrap_or(Value::Null),
        created_at: r.get(12)?,
    })
}

const BENCH_COLS: &str = "id, asset_id, session_id, setup_id, hours_at, thd_percent, separation_db, tc_snr_db, tc_phase_error_deg, tc_dropouts, valid, detail_json, created_at";

pub fn benchmark_save(conn: &Connection, i: &BenchmarkInput) -> Result<IdResult, String> {
    validate_benchmark(i)?;
    asset_exists(conn, &i.asset_id)?;
    for (table, id, what) in [("session", &i.session_id, "session"), ("setup", &i.setup_id, "setup")] {
        if let Some(id) = id {
            let n: Option<i64> = conn.query_row(&format!("SELECT 1 FROM {table} WHERE id = ?1"), [id], |r| r.get(0)).optional().map_err(e2s)?;
            if n.is_none() {
                return Err(format!("unknown {what} '{id}'"));
            }
        }
    }
    let detail = match &i.detail {
        Some(v) => serde_json::to_string(v).map_err(|e| e.to_string())?,
        None => "{}".to_string(),
    };
    if detail.len() > MAX_DETAIL_BYTES {
        return Err(format!("detail is limited to {MAX_DETAIL_BYTES} bytes"));
    }
    let id = new_id();
    let now = now_iso(conn)?;
    conn.execute(
        "INSERT INTO stylus_benchmark (id, asset_id, session_id, hours_at, thd_percent, separation_db, tc_snr_db, tc_phase_error_deg, tc_dropouts, setup_id, valid, detail_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![id, i.asset_id, i.session_id, i.hours_at, i.thd_percent, i.separation_db, i.tc_snr_db, i.tc_phase_error_deg, i.tc_dropouts, i.setup_id, i.valid.unwrap_or(true) as i64, detail, now],
    )
    .map_err(e2s)?;
    Ok(IdResult { id })
}

/// Oldest first by `hours_at`, then creation time.
pub fn benchmark_list(conn: &Connection, asset_id: &str) -> Result<Vec<Benchmark>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT {BENCH_COLS} FROM stylus_benchmark WHERE asset_id = ?1 ORDER BY hours_at, created_at, id"))
        .map_err(e2s)?;
    let rows = stmt.query_map([asset_id], bench_row).map_err(e2s)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)
}

pub fn valid_kind(kind: &str) -> bool {
    !kind.is_empty() && kind.len() <= 48 && kind.starts_with(|c: char| c.is_ascii_lowercase()) && kind.chars().all(|c| c.is_ascii_alphanumeric() || c == ':' || c == '_')
}

/// Record a snooze. Each call adds a row (the history is the record); readers use the latest per kind.
pub fn alert_snooze(conn: &Connection, asset_id: &str, kind: &str, until: &str, severity: Option<&str>) -> Result<IdResult, String> {
    if !valid_kind(kind) {
        return Err("alert kind must be lowercase letters, digits, ':' or '_' (max 48)".into());
    }
    if !valid_timestamp(until) {
        return Err(format!("until must be a UTC ISO timestamp, got '{until}'"));
    }
    let severity = severity.unwrap_or("amber");
    if !SEVERITIES.contains(&severity) {
        return Err(format!("severity must be one of {}", SEVERITIES.join(", ")));
    }
    asset_exists(conn, asset_id)?;
    let id = new_id();
    let now = now_iso(conn)?;
    conn.execute(
        "INSERT INTO stylus_alert (id, asset_id, kind, severity, snoozed_until, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, asset_id, kind, severity, until, now],
    )
    .map_err(e2s)?;
    Ok(IdResult { id })
}

pub fn alert_list(conn: &Connection, asset_id: &str) -> Result<Vec<StylusAlert>, String> {
    let mut stmt = conn
        .prepare("SELECT id, asset_id, kind, severity, snoozed_until, created_at FROM stylus_alert WHERE asset_id = ?1 ORDER BY created_at, id")
        .map_err(e2s)?;
    let rows = stmt
        .query_map([asset_id], |r| {
            Ok(StylusAlert { id: r.get(0)?, asset_id: r.get(1)?, kind: r.get(2)?, severity: r.get(3)?, snoozed_until: r.get(4)?, created_at: r.get(5)? })
        })
        .map_err(e2s)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)
}

/// Time of the latest `stylus_replaced` event, or None. Hours before it do not count toward life.
pub fn baseline(conn: &Connection, asset_id: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT event_at FROM maintenance_event WHERE asset_id = ?1 AND event_type = ?2 ORDER BY event_at DESC, created_at DESC LIMIT 1",
        params![asset_id, REPLACED_EVENT],
        |r| r.get(0),
    )
    .optional()
    .map_err(e2s)
}

/// Mark a stylus replacement (resets the hours baseline; ledger, benchmarks and alerts are kept).
pub fn replace(conn: &Connection, asset_id: &str, at: &str, note: Option<&str>) -> Result<IdResult, String> {
    if !valid_timestamp(at) {
        return Err(format!("at must be a UTC ISO timestamp, got '{at}'"));
    }
    if note.map_or(false, |n| n.chars().count() > MAX_NOTE_CHARS) {
        return Err(format!("note is limited to {MAX_NOTE_CHARS} characters"));
    }
    asset_exists(conn, asset_id)?;
    let id = new_id();
    let now = now_iso(conn)?;
    let note = note.map(str::trim).filter(|n| !n.is_empty());
    conn.execute(
        "INSERT INTO maintenance_event (id, asset_id, event_type, event_at, description, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, asset_id, REPLACED_EVENT, at, note, now],
    )
    .map_err(e2s)?;
    Ok(IdResult { id })
}

/// `None` clears the override (the catalogue / 500 h fallback applies again).
pub fn rated_life_set(conn: &Connection, asset_id: &str, hours: Option<f64>) -> Result<(), String> {
    if let Some(h) = hours {
        if !h.is_finite() || h <= 0.0 || h > MAX_RATED_HOURS {
            return Err(format!("rated life must be above 0 and at most {MAX_RATED_HOURS} hours"));
        }
    }
    let n = conn.execute("UPDATE asset SET rated_life_hours = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1", params![asset_id, hours]).map_err(e2s)?;
    if n == 0 {
        return Err(format!("unknown asset '{asset_id}'"));
    }
    Ok(())
}

pub fn rated_life_get(conn: &Connection, asset_id: &str) -> Result<Option<f64>, String> {
    conn.query_row("SELECT rated_life_hours FROM asset WHERE id = ?1", [asset_id], |r| r.get::<_, Option<f64>>(0))
        .optional()
        .map_err(e2s)?
        .ok_or_else(|| format!("unknown asset '{asset_id}'"))
}

#[tauri::command]
pub fn stylus_benchmark_save(app: AppHandle, result: BenchmarkInput) -> Result<IdResult, String> {
    let conn = open_database(&database_path(&app)?)?;
    benchmark_save(&conn, &result)
}

#[tauri::command]
pub fn stylus_benchmark_list(app: AppHandle, asset_id: String) -> Result<Vec<Benchmark>, String> {
    let conn = open_database(&database_path(&app)?)?;
    benchmark_list(&conn, &asset_id)
}

#[tauri::command]
pub fn stylus_alert_snooze(app: AppHandle, asset_id: String, kind: String, until: String, severity: Option<String>) -> Result<IdResult, String> {
    let conn = open_database(&database_path(&app)?)?;
    alert_snooze(&conn, &asset_id, &kind, &until, severity.as_deref())
}

#[tauri::command]
pub fn stylus_alert_list(app: AppHandle, asset_id: String) -> Result<Vec<StylusAlert>, String> {
    let conn = open_database(&database_path(&app)?)?;
    alert_list(&conn, &asset_id)
}

#[tauri::command]
pub fn stylus_baseline(app: AppHandle, asset_id: String) -> Result<Option<String>, String> {
    let conn = open_database(&database_path(&app)?)?;
    baseline(&conn, &asset_id)
}

#[tauri::command]
pub fn stylus_replace(app: AppHandle, asset_id: String, at: String, note: Option<String>) -> Result<IdResult, String> {
    let conn = open_database(&database_path(&app)?)?;
    replace(&conn, &asset_id, &at, note.as_deref())
}

#[tauri::command]
pub fn stylus_rated_life_set(app: AppHandle, asset_id: String, hours: Option<f64>) -> Result<(), String> {
    let conn = open_database(&database_path(&app)?)?;
    rated_life_set(&conn, &asset_id, hours)
}

#[tauri::command]
pub fn stylus_rated_life_get(app: AppHandle, asset_id: String) -> Result<Option<f64>, String> {
    let conn = open_database(&database_path(&app)?)?;
    rated_life_get(&conn, &asset_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;
    use crate::usage::{self, UsageAddInput};

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        for id in ["a1", "a2"] {
            c.execute("INSERT INTO asset (id, nickname, created_at, updated_at) VALUES (?1,'Cart','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')", [id]).unwrap();
        }
        c
    }

    fn bench(asset: &str, hours: f64) -> BenchmarkInput {
        BenchmarkInput {
            asset_id: asset.into(),
            session_id: None,
            setup_id: None,
            hours_at: hours,
            thd_percent: Some(0.5),
            separation_db: Some(28.0),
            tc_snr_db: Some(30.0),
            tc_phase_error_deg: Some(4.0),
            tc_dropouts: Some(0),
            valid: None,
            detail: None,
        }
    }

    #[test]
    fn migration_creates_tables_and_asset_column_and_is_recorded_once() {
        let c = mem();
        let v = crate::db::MIGRATIONS.iter().find(|(v, _)| *v == 9).expect("0009 registered");
        assert!(v.1.contains("stylus_benchmark"));
        // runner is idempotent: a second pass applies nothing and does not re-run the ALTER
        apply_migrations(&c).unwrap();
        let n: i64 = c.query_row("SELECT COUNT(*) FROM schema_migration WHERE version = 9", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        for t in ["stylus_benchmark", "stylus_alert"] {
            let n: i64 = c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1", [t], |r| r.get(0)).unwrap();
            assert_eq!(n, 1, "{t}");
        }
        let cols: Vec<String> = c.prepare("SELECT name FROM pragma_table_info('asset')").unwrap().query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap();
        assert!(cols.contains(&"rated_life_hours".to_string()));
    }

    #[test]
    fn upgrade_from_pre_stylus_database_keeps_rows() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        let upto: Vec<_> = crate::db::MIGRATIONS.iter().filter(|(v, _)| *v < 9).cloned().collect();
        c.execute_batch("CREATE TABLE schema_migration (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, app_version TEXT);").unwrap();
        for (v, sql) in &upto {
            c.execute_batch(sql).unwrap();
            c.execute("INSERT OR IGNORE INTO schema_migration (version, applied_at) VALUES (?1,'t')", [v]).unwrap();
        }
        c.execute("INSERT INTO asset (id, nickname, created_at, updated_at) VALUES ('old','Old','t','t')", []).unwrap();
        apply_migrations(&c).unwrap();
        assert_eq!(rated_life_get(&c, "old").unwrap(), None);
        let n: i64 = c.query_row("SELECT COUNT(*) FROM asset", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        let fk: i64 = c.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).unwrap();
        assert_eq!(fk, 0);
    }

    #[test]
    fn benchmark_round_trip_ordered_by_hours() {
        let c = mem();
        let mut late = bench("a1", 120.0);
        late.detail = Some(serde_json::json!({"note": "side B", "tracking": 2.0}));
        late.valid = Some(false);
        let id_late = benchmark_save(&c, &late).unwrap().id;
        benchmark_save(&c, &bench("a1", 10.0)).unwrap();
        benchmark_save(&c, &bench("a2", 5.0)).unwrap();
        let list = benchmark_list(&c, "a1").unwrap();
        assert_eq!(list.iter().map(|b| b.hours_at).collect::<Vec<_>>(), [10.0, 120.0]);
        let l = list.iter().find(|b| b.id == id_late).unwrap();
        assert!(!l.valid);
        assert_eq!(l.detail["note"], "side B");
        assert!(list[0].valid && list[0].detail == serde_json::json!({}));
        assert_eq!(list[0].tc_dropouts, Some(0));
        assert_eq!(benchmark_list(&c, "a1' OR '1'='1").unwrap().len(), 0);
    }

    #[test]
    fn benchmark_validation_boundaries() {
        let c = mem();
        assert!(benchmark_save(&c, &bench("a1", 0.0)).is_ok());
        assert!(benchmark_save(&c, &bench("a1", -0.1)).is_err());
        assert!(benchmark_save(&c, &bench("a1", f64::NAN)).is_err());
        assert!(benchmark_save(&c, &bench("nope", 1.0)).unwrap_err().contains("unknown asset"));
        let mut b = bench("a1", 1.0);
        b.thd_percent = Some(-0.01);
        assert!(benchmark_save(&c, &b).is_err());
        b = bench("a1", 1.0);
        b.tc_dropouts = Some(-1);
        assert!(benchmark_save(&c, &b).is_err());
        b = bench("a1", 1.0);
        b.tc_phase_error_deg = Some(361.0);
        assert!(benchmark_save(&c, &b).is_err());
        b = bench("a1", 1.0);
        b.session_id = Some("ghost".into());
        assert!(benchmark_save(&c, &b).unwrap_err().contains("unknown session"));
        b = bench("a1", 1.0);
        b.setup_id = Some("ghost".into());
        assert!(benchmark_save(&c, &b).unwrap_err().contains("unknown setup"));
        b = bench("a1", 1.0);
        b.detail = Some(serde_json::json!({"x": "y".repeat(MAX_DETAIL_BYTES)}));
        assert!(benchmark_save(&c, &b).unwrap_err().contains("detail"));
        let empty = BenchmarkInput { thd_percent: None, separation_db: None, tc_snr_db: None, tc_phase_error_deg: None, tc_dropouts: None, ..bench("a1", 1.0) };
        assert!(benchmark_save(&c, &empty).unwrap_err().contains("no metrics"));
    }

    #[test]
    fn session_deleted_nulls_benchmark_link() {
        let c = mem();
        c.execute("INSERT INTO session (id, session_type, started_at, app_version, schema_version, status) VALUES ('s1','stylus','2026-10-10T20:00:00Z','0',1,'complete')", []).unwrap();
        let mut b = bench("a1", 1.0);
        b.session_id = Some("s1".into());
        benchmark_save(&c, &b).unwrap();
        c.execute("DELETE FROM session WHERE id = 's1'", []).unwrap();
        let l = benchmark_list(&c, "a1").unwrap();
        assert_eq!((l.len(), l[0].session_id.clone()), (1, None));
    }

    #[test]
    fn snooze_is_recorded_per_kind_and_validated() {
        let c = mem();
        alert_snooze(&c, "a1", "life", "2026-11-09T00:00:00.000Z", None).unwrap();
        alert_snooze(&c, "a1", "bench:separationDb", "2026-11-09T00:00:00.000Z", Some("amber")).unwrap();
        let l = alert_list(&c, "a1").unwrap();
        assert_eq!(l.len(), 2);
        assert!(l.iter().all(|a| a.snoozed_until.as_deref() == Some("2026-11-09T00:00:00.000Z") && a.severity == "amber"));
        assert!(alert_list(&c, "a2").unwrap().is_empty());
        assert!(alert_snooze(&c, "a1", "Life", "2026-11-09T00:00:00.000Z", None).is_err());
        assert!(alert_snooze(&c, "a1", "life", "next week", None).is_err());
        assert!(alert_snooze(&c, "a1", "life", "2026-11-09T00:00:00Z", Some("purple")).is_err());
        assert!(alert_snooze(&c, "zz", "life", "2026-11-09T00:00:00Z", None).unwrap_err().contains("unknown asset"));
        assert!(!valid_kind("") && !valid_kind("a b") && !valid_kind(&"a".repeat(49)) && valid_kind("bench:tcSnrDb"));
    }

    #[test]
    fn replacement_event_sets_baseline_and_keeps_history() {
        let c = mem();
        assert_eq!(baseline(&c, "a1").unwrap(), None);
        let u = |at: &str, h: f64| UsageAddInput { asset_id: "a1".into(), kind: None, started_at: at.into(), hours: h, source: "manual".into(), session_id: None, note: None, confirmed: None };
        usage::add(&c, &u("2026-01-01T10:00:00.000Z", 3.0)).unwrap();
        benchmark_save(&c, &bench("a1", 3.0)).unwrap();
        replace(&c, "a1", "2026-02-01T00:00:00.000Z", Some("  new Concorde ")).unwrap();
        replace(&c, "a1", "2026-01-15T00:00:00.000Z", None).unwrap(); // older entry never wins
        c.execute("INSERT INTO maintenance_event (id, asset_id, event_type, event_at, created_at) VALUES ('m','a1','cleaned','2026-03-01T00:00:00.000Z','t')", []).unwrap();
        assert_eq!(baseline(&c, "a1").unwrap().as_deref(), Some("2026-02-01T00:00:00.000Z"));
        assert_eq!(baseline(&c, "a2").unwrap(), None);
        let d: Option<String> = c.query_row("SELECT description FROM maintenance_event WHERE event_at = '2026-02-01T00:00:00.000Z'", [], |r| r.get(0)).unwrap();
        assert_eq!(d.as_deref(), Some("new Concorde"));
        assert_eq!(usage::list(&c, "a1", None).unwrap().len(), 1);
        assert_eq!(benchmark_list(&c, "a1").unwrap().len(), 1);
        assert!(replace(&c, "a1", "yesterday", None).is_err());
        assert!(replace(&c, "zz", "2026-02-01T00:00:00Z", None).is_err());
        assert!(replace(&c, "a1", "2026-02-01T00:00:00Z", Some(&"x".repeat(501))).is_err());
    }

    #[test]
    fn rated_life_override_bounds() {
        let c = mem();
        assert_eq!(rated_life_get(&c, "a1").unwrap(), None);
        rated_life_set(&c, "a1", Some(600.0)).unwrap();
        assert_eq!(rated_life_get(&c, "a1").unwrap(), Some(600.0));
        rated_life_set(&c, "a1", Some(MAX_RATED_HOURS)).unwrap();
        for bad in [0.0, -1.0, MAX_RATED_HOURS + 1.0, f64::NAN, f64::INFINITY] {
            assert!(rated_life_set(&c, "a1", Some(bad)).is_err(), "{bad}");
        }
        rated_life_set(&c, "a1", None).unwrap();
        assert_eq!(rated_life_get(&c, "a1").unwrap(), None);
        assert!(rated_life_set(&c, "zz", Some(5.0)).is_err());
        assert!(rated_life_get(&c, "zz").is_err());
    }

    #[test]
    fn contract_examples_round_trip() {
        let raw = std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/stylus.json")).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        let c = mem();
        c.execute("INSERT INTO asset (id, nickname, created_at, updated_at) VALUES ('asset-1','x','t','t')", []).unwrap();
        let input: BenchmarkInput = serde_json::from_value(v["stylus_benchmark_save"]["request"]["result"].clone()).unwrap();
        let id = benchmark_save(&c, &input).unwrap();
        assert!(serde_json::to_value(&id).unwrap()["id"].is_string());
        let mut got = serde_json::to_value(benchmark_list(&c, "asset-1").unwrap()).unwrap();
        let want = &v["stylus_benchmark_list"]["response"];
        for row in got.as_array_mut().unwrap() {
            for k in ["id", "createdAt"] {
                row[k] = want[0][k].clone();
            }
        }
        assert_eq!(&got, want);
        let sn = &v["stylus_alert_snooze"]["request"];
        let r = alert_snooze(&c, sn["assetId"].as_str().unwrap(), sn["kind"].as_str().unwrap(), sn["until"].as_str().unwrap(), None).unwrap();
        assert!(!r.id.is_empty());
    }
}
