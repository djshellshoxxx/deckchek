//! Control-vinyl wear map scans (FS-13 §4-5, tables from `0010_wear_map.sql`).
//! The streaming scanner, bin classes and verdict live in `app/wear-map.js`; Rust stores a finished (or
//! partial) scan with its per-bin features, lists scans per record side for comparisons, and returns one
//! scan with its bins. Raw audio is never stored here. Every input is validated (imported scans included)
//! and all SQL is parameterised.

use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::db::{database_path, new_id, now_iso, open_database};

pub const VERDICTS: &[&str] = &["keep", "watch", "other_side", "replace", "incomplete"];
/// FS-13 §7: imported scans hold at most 5000 bins (a 20 min side at 2 s is 600).
pub const MAX_BINS: usize = 5000;
pub const MAX_SUMMARY_BYTES: usize = 64 * 1024;
pub const MAX_GEOMETRY_BYTES: usize = 4 * 1024;
pub const MAX_FORMAT_CHARS: usize = 80;
/// Bins are 1-5 s (FS-13 §6).
pub const MIN_BIN_SEC: f64 = 1.0;
pub const MAX_BIN_SEC: f64 = 5.0;
/// Longest capture a scan may describe (no control vinyl side is near this).
pub const MAX_T_SEC: f64 = 7200.0;
/// bit0 interrupted, bit1 speed shift, bit2 clip.
pub const MAX_FLAGS: i64 = 7;
pub const DEFAULT_LIST_LIMIT: u32 = 200;
pub const MAX_LIST_LIMIT: u32 = 1000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WearBin {
    pub idx: i64,
    pub t_sec: f64,
    pub snr_db: Option<f64>,
    pub phase_err_deg: Option<f64>,
    pub balance_db: Option<f64>,
    pub level_dbfs: Option<f64>,
    #[serde(default)]
    pub dropouts: i64,
    #[serde(default)]
    pub flags: i64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WearScanInput {
    pub full_side_scan_id: Option<String>,
    pub record_side_id: String,
    pub session_id: Option<String>,
    pub stylus_asset_id: Option<String>,
    pub format: String,
    pub bin_sec: f64,
    pub coverage: f64,
    pub verdict: String,
    pub score: Option<f64>,
    pub summary: Option<Value>,
    pub geometry: Option<Value>,
    #[serde(default)]
    pub bins: Vec<WearBin>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WearScan {
    pub id: String,
    pub full_side_scan_id: Option<String>,
    pub record_side_id: String,
    pub session_id: Option<String>,
    pub stylus_asset_id: Option<String>,
    pub format: String,
    pub bin_sec: f64,
    pub coverage: f64,
    pub verdict: String,
    pub score: Option<f64>,
    pub summary: Value,
    pub geometry: Value,
    pub created_at: String,
    pub bin_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WearScanDetail {
    #[serde(flatten)]
    pub scan: WearScan,
    pub bins: Vec<WearBin>,
}

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

fn check_opt(name: &str, v: Option<f64>, lo: f64, hi: f64) -> Result<(), String> {
    match v {
        Some(x) if !x.is_finite() || x < lo || x > hi => Err(format!("{name} must be between {lo} and {hi}")),
        _ => Ok(()),
    }
}

fn object_json(name: &str, v: Option<&Value>, max: usize) -> Result<String, String> {
    match v {
        None | Some(Value::Null) => Ok("{}".into()),
        Some(o @ Value::Object(_)) => {
            let s = serde_json::to_string(o).map_err(|e| e.to_string())?;
            if s.len() > max {
                return Err(format!("{name} is limited to {max} bytes"));
            }
            Ok(s)
        }
        Some(_) => Err(format!("{name} must be a JSON object")),
    }
}

pub fn validate(input: &WearScanInput) -> Result<(), String> {
    let f = input.format.trim();
    if f.is_empty() || f.chars().count() > MAX_FORMAT_CHARS {
        return Err(format!("format must be 1 to {MAX_FORMAT_CHARS} characters"));
    }
    if input.record_side_id.trim().is_empty() {
        return Err("recordSideId is required".into());
    }
    if !input.bin_sec.is_finite() || input.bin_sec < MIN_BIN_SEC || input.bin_sec > MAX_BIN_SEC {
        return Err(format!("binSec must be between {MIN_BIN_SEC} and {MAX_BIN_SEC}"));
    }
    if !input.coverage.is_finite() || !(0.0..=1.0).contains(&input.coverage) {
        return Err("coverage must be between 0 and 1".into());
    }
    if !VERDICTS.contains(&input.verdict.as_str()) {
        return Err(format!("verdict must be one of {}", VERDICTS.join(", ")));
    }
    check_opt("score", input.score, 0.0, 100.0)?;
    object_json("summary", input.summary.as_ref(), MAX_SUMMARY_BYTES)?;
    object_json("geometry", input.geometry.as_ref(), MAX_GEOMETRY_BYTES)?;
    if input.bins.len() > MAX_BINS {
        return Err(format!("a wear scan holds at most {MAX_BINS} bins"));
    }
    let mut seen = HashSet::with_capacity(input.bins.len());
    for b in &input.bins {
        let i = b.idx;
        if !(0..MAX_BINS as i64 * 10).contains(&i) {
            return Err(format!("bin idx {i} is out of range"));
        }
        if !seen.insert(i) {
            return Err(format!("bin idx {i} appears twice"));
        }
        if !b.t_sec.is_finite() || b.t_sec < 0.0 || b.t_sec > MAX_T_SEC {
            return Err(format!("bin {i}: tSec must be between 0 and {MAX_T_SEC}"));
        }
        check_opt(&format!("bin {i}: snrDb"), b.snr_db, -100.0, 200.0)?;
        check_opt(&format!("bin {i}: phaseErrDeg"), b.phase_err_deg, 0.0, 180.0)?;
        check_opt(&format!("bin {i}: balanceDb"), b.balance_db, -120.0, 120.0)?;
        check_opt(&format!("bin {i}: levelDbfs"), b.level_dbfs, -400.0, 40.0)?;
        if !(0..=1_000_000).contains(&b.dropouts) {
            return Err(format!("bin {i}: dropouts must be a count between 0 and 1000000"));
        }
        if !(0..=MAX_FLAGS).contains(&b.flags) {
            return Err(format!("bin {i}: flags must be between 0 and {MAX_FLAGS}"));
        }
    }
    Ok(())
}

fn exists(conn: &Connection, table: &str, id: &str) -> Result<bool, String> {
    // `table` is one of the fixed names below, never user input.
    conn.query_row(&format!("SELECT 1 FROM {table} WHERE id = ?1"), [id], |r| r.get::<_, i64>(0))
        .optional()
        .map(|o| o.is_some())
        .map_err(e2s)
}

const SCAN_COLS: &str = "s.id, s.full_side_scan_id, s.record_side_id, s.session_id, s.stylus_asset_id, s.format, s.bin_sec, s.coverage, \
    s.verdict, s.score, s.summary_json, s.geometry_json, s.created_at, (SELECT COUNT(*) FROM wear_bin b WHERE b.scan_id = s.id)";

fn json_object(s: String) -> Value {
    serde_json::from_str(&s).unwrap_or(Value::Object(Default::default()))
}

fn scan_row(r: &rusqlite::Row) -> rusqlite::Result<WearScan> {
    Ok(WearScan {
        id: r.get(0)?,
        full_side_scan_id: r.get(1)?,
        record_side_id: r.get(2)?,
        session_id: r.get(3)?,
        stylus_asset_id: r.get(4)?,
        format: r.get(5)?,
        bin_sec: r.get(6)?,
        coverage: r.get(7)?,
        verdict: r.get(8)?,
        score: r.get(9)?,
        summary: json_object(r.get(10)?),
        geometry: json_object(r.get(11)?),
        created_at: r.get(12)?,
        bin_count: r.get(13)?,
    })
}

fn get_scan(conn: &Connection, id: &str) -> Result<Option<WearScan>, String> {
    conn.query_row(&format!("SELECT {SCAN_COLS} FROM wear_scan s WHERE s.id = ?1"), [id], scan_row).optional().map_err(e2s)
}

/// Validate and store a scan with its bins in one transaction.
pub fn save(conn: &mut Connection, input: &WearScanInput) -> Result<WearScan, String> {
    validate(input)?;
    if !exists(conn, "record_side", &input.record_side_id)? {
        return Err(format!("unknown record side '{}'", input.record_side_id));
    }
    for (table, label, id) in [
        ("full_side_scan", "full side scan", &input.full_side_scan_id),
        ("session", "session", &input.session_id),
        ("asset", "stylus asset", &input.stylus_asset_id),
    ] {
        if let Some(id) = id {
            if !exists(conn, table, id)? {
                return Err(format!("unknown {label} '{id}'"));
            }
        }
    }
    let id = new_id();
    let now = now_iso(conn)?;
    let summary = object_json("summary", input.summary.as_ref(), MAX_SUMMARY_BYTES)?;
    let geometry = object_json("geometry", input.geometry.as_ref(), MAX_GEOMETRY_BYTES)?;
    let tx = conn.transaction().map_err(e2s)?;
    tx.execute(
        "INSERT INTO wear_scan (id, full_side_scan_id, record_side_id, session_id, stylus_asset_id, format, bin_sec, coverage, verdict, score,
           summary_json, geometry_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            id,
            input.full_side_scan_id,
            input.record_side_id,
            input.session_id,
            input.stylus_asset_id,
            input.format.trim(),
            input.bin_sec,
            input.coverage,
            input.verdict,
            input.score,
            summary,
            geometry,
            now
        ],
    )
    .map_err(e2s)?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO wear_bin (scan_id, idx, t_sec, snr_db, phase_err_deg, balance_db, level_dbfs, dropouts, flags)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )
            .map_err(e2s)?;
        for b in &input.bins {
            stmt.execute(params![id, b.idx, b.t_sec, b.snr_db, b.phase_err_deg, b.balance_db, b.level_dbfs, b.dropouts, b.flags])
                .map_err(e2s)?;
        }
    }
    tx.commit().map_err(e2s)?;
    get_scan(conn, &id)?.ok_or_else(|| "wear scan vanished after save".to_string())
}

/// Scans, newest first, without their bins; only those of `record_side_id` when given.
pub fn list(conn: &Connection, record_side_id: Option<&str>, limit: Option<u32>) -> Result<Vec<WearScan>, String> {
    let limit = limit.unwrap_or(DEFAULT_LIST_LIMIT).clamp(1, MAX_LIST_LIMIT);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {SCAN_COLS} FROM wear_scan s WHERE (?1 IS NULL OR s.record_side_id = ?1)
             ORDER BY s.created_at DESC, s.rowid DESC LIMIT ?2"
        ))
        .map_err(e2s)?;
    let rows = stmt.query_map(params![record_side_id, limit], scan_row).map_err(e2s)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)
}

/// One scan with its bins in idx order; `None` for an unknown id.
pub fn get(conn: &Connection, id: &str) -> Result<Option<WearScanDetail>, String> {
    let Some(scan) = get_scan(conn, id)? else { return Ok(None) };
    let mut stmt = conn
        .prepare("SELECT idx, t_sec, snr_db, phase_err_deg, balance_db, level_dbfs, dropouts, flags FROM wear_bin WHERE scan_id = ?1 ORDER BY idx")
        .map_err(e2s)?;
    let bins = stmt
        .query_map([id], |r| {
            Ok(WearBin {
                idx: r.get(0)?,
                t_sec: r.get(1)?,
                snr_db: r.get(2)?,
                phase_err_deg: r.get(3)?,
                balance_db: r.get(4)?,
                level_dbfs: r.get(5)?,
                dropouts: r.get(6)?,
                flags: r.get(7)?,
            })
        })
        .map_err(e2s)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e2s)?;
    Ok(Some(WearScanDetail { scan, bins }))
}

/// Returns whether a scan was removed; its bins go with it (ON DELETE CASCADE).
pub fn delete(conn: &Connection, id: &str) -> Result<bool, String> {
    conn.execute("DELETE FROM wear_scan WHERE id = ?1", [id]).map(|n| n > 0).map_err(e2s)
}

#[tauri::command]
pub fn wearmap_save(app: AppHandle, scan: WearScanInput) -> Result<WearScan, String> {
    let mut conn = open_database(&database_path(&app)?)?;
    save(&mut conn, &scan)
}

#[tauri::command]
pub fn wearmap_list(app: AppHandle, record_side_id: Option<String>, limit: Option<u32>) -> Result<Vec<WearScan>, String> {
    let conn = open_database(&database_path(&app)?)?;
    list(&conn, record_side_id.as_deref(), limit)
}

#[tauri::command]
pub fn wearmap_get(app: AppHandle, id: String) -> Result<Option<WearScanDetail>, String> {
    let conn = open_database(&database_path(&app)?)?;
    get(&conn, &id)
}

#[tauri::command]
pub fn wearmap_delete(app: AppHandle, id: String) -> Result<bool, String> {
    let conn = open_database(&database_path(&app)?)?;
    delete(&conn, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;
    use serde_json::json;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        c.execute_batch(
            "INSERT INTO asset (id, nickname, created_at, updated_at) VALUES ('stylus-1','Stylus A','t','t');
             INSERT INTO session (id, session_type, started_at, app_version, schema_version, status) VALUES ('s1','wear_map','t','0',1,'complete');
             INSERT INTO record_release (id, title) VALUES ('rel-1','Serato CV02.5');
             INSERT INTO record_copy (id, record_id, nickname) VALUES ('copy-1','rel-1','CV02.5 main');
             INSERT INTO record_side (id, record_copy_id, side_label) VALUES ('side-a','copy-1','A'),('side-b','copy-1','B');
             INSERT INTO full_side_scan (id, session_id, record_side_id, start_sample, end_sample, scan_version) VALUES ('fss-1','s1','side-a',0,100,1);",
        )
        .unwrap();
        c
    }

    fn bin(i: i64) -> WearBin {
        WearBin {
            idx: i,
            t_sec: i as f64 * 2.0,
            snr_db: Some(30.0 - (i % 7) as f64),
            phase_err_deg: Some(2.5),
            balance_db: Some(-0.25),
            level_dbfs: Some(-18.0),
            dropouts: i % 3,
            flags: if i % 50 == 0 { 1 } else { 0 },
        }
    }

    fn scan(side: &str, n: i64) -> WearScanInput {
        WearScanInput {
            full_side_scan_id: None,
            record_side_id: side.into(),
            session_id: None,
            stylus_asset_id: None,
            format: " Serato CV02.5 ".into(),
            bin_sec: 2.0,
            coverage: 0.62,
            verdict: "watch".into(),
            score: Some(91.5),
            summary: Some(json!({"badPct": 1.5, "envelope": {"hz": 1, "db": [-18.0, -18.5]}})),
            geometry: Some(json!({"v": 1, "outerMm": 146, "innerMm": 58, "grooveModel": "linear-radius"})),
            bins: (0..n).map(bin).collect(),
        }
    }

    #[test]
    fn migration_creates_tables_and_is_rerunnable() {
        let c = mem();
        let sql = crate::db::MIGRATIONS.iter().find(|(v, _)| *v == 10).expect("0010 registered").1;
        c.execute_batch(sql).unwrap();
        let cols = |t: &str| -> Vec<String> {
            c.prepare(&format!("SELECT name FROM pragma_table_info('{t}')")).unwrap().query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap()
        };
        assert_eq!(
            cols("wear_scan"),
            [
                "id", "full_side_scan_id", "record_side_id", "session_id", "stylus_asset_id", "format", "bin_sec", "coverage", "verdict", "score",
                "summary_json", "geometry_json", "created_at"
            ]
        );
        assert_eq!(cols("wear_bin"), ["scan_id", "idx", "t_sec", "snr_db", "phase_err_deg", "balance_db", "level_dbfs", "dropouts", "flags"]);
        let idx: i64 = c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name = 'idx_wear_scan_side'", [], |r| r.get(0)).unwrap();
        assert_eq!(idx, 1);
    }

    #[test]
    fn save_get_list_delete_round_trip_with_600_bins() {
        let mut c = mem();
        let mut i = scan("side-a", 600);
        i.session_id = Some("s1".into());
        i.stylus_asset_id = Some("stylus-1".into());
        i.full_side_scan_id = Some("fss-1".into());
        let s = save(&mut c, &i).unwrap();
        assert_eq!((s.bin_count, s.format.as_str(), s.verdict.as_str(), s.score), (600, "Serato CV02.5", "watch", Some(91.5)));
        assert_eq!(s.geometry["outerMm"], 146);
        assert_eq!(s.summary["envelope"]["db"][1], -18.5);
        let d = get(&c, &s.id).unwrap().unwrap();
        assert_eq!(d.scan, s);
        assert_eq!(d.bins, i.bins, "every bin comes back exactly, in idx order");
        assert_eq!(list(&c, None, None).unwrap(), vec![s.clone()]);
        assert!(get(&c, "nope").unwrap().is_none());
        assert!(delete(&c, &s.id).unwrap());
        assert!(!delete(&c, &s.id).unwrap());
        let left: i64 = c.query_row("SELECT COUNT(*) FROM wear_bin", [], |x| x.get(0)).unwrap();
        assert_eq!(left, 0, "bins cascade with the scan");
    }

    #[test]
    fn null_metrics_and_bins_out_of_order_round_trip() {
        let mut c = mem();
        let mut i = scan("side-a", 0);
        i.bins = vec![
            WearBin { idx: 3, t_sec: 6.0, snr_db: None, phase_err_deg: None, balance_db: None, level_dbfs: None, dropouts: 0, flags: 1 },
            WearBin { idx: 1, ..bin(1) },
        ];
        i.summary = None;
        i.geometry = Some(Value::Null);
        let s = save(&mut c, &i).unwrap();
        assert_eq!((s.summary.clone(), s.geometry.clone()), (json!({}), json!({})));
        let d = get(&c, &s.id).unwrap().unwrap();
        assert_eq!(d.bins.iter().map(|b| b.idx).collect::<Vec<_>>(), [1, 3]);
        assert_eq!(d.bins[1].snr_db, None);
    }

    #[test]
    fn list_filters_by_side_newest_first() {
        let mut c = mem();
        let a1 = save(&mut c, &scan("side-a", 2)).unwrap();
        let a2 = save(&mut c, &scan("side-a", 2)).unwrap();
        let b = save(&mut c, &scan("side-b", 2)).unwrap();
        let ids = |side: Option<&str>, lim: Option<u32>| list(&c, side, lim).unwrap().into_iter().map(|s| s.id).collect::<Vec<_>>();
        assert_eq!(ids(Some("side-a"), None), vec![a2.id.clone(), a1.id.clone()], "same created_at falls back to insertion order");
        assert_eq!(ids(Some("side-b"), None), vec![b.id.clone()]);
        assert_eq!(ids(None, None).len(), 3);
        assert_eq!(ids(None, Some(1)), vec![b.id.clone()]);
        assert_eq!(ids(None, Some(0)).len(), 1, "limit is clamped to at least 1");
        assert!(ids(Some("side-a' OR '1'='1"), None).is_empty());
    }

    #[test]
    fn references_are_checked_and_cleaned_up() {
        let mut c = mem();
        assert!(save(&mut c, &scan("side-x", 1)).unwrap_err().contains("unknown record side"));
        for (field, msg) in [("fss", "unknown full side scan"), ("session", "unknown session"), ("stylus", "unknown stylus asset")] {
            let mut i = scan("side-a", 1);
            match field {
                "fss" => i.full_side_scan_id = Some("x".into()),
                "session" => i.session_id = Some("x".into()),
                _ => i.stylus_asset_id = Some("x".into()),
            }
            assert!(save(&mut c, &i).unwrap_err().contains(msg), "{field}");
        }
        let mut with_session = scan("side-a", 3);
        with_session.session_id = Some("s1".into());
        let s = save(&mut c, &with_session).unwrap();
        let mut with_fss = scan("side-a", 3);
        with_fss.full_side_scan_id = Some("fss-1".into());
        let f = save(&mut c, &with_fss).unwrap();
        // deleting the session cascades its full_side_scan (and the wear scan built on it) and nulls the plain link
        c.execute("DELETE FROM session WHERE id = 's1'", []).unwrap();
        assert_eq!(get(&c, &s.id).unwrap().unwrap().scan.session_id, None, "session delete nulls the link");
        assert!(get(&c, &f.id).unwrap().is_none(), "full side scan delete cascades");
        let bins: i64 = c.query_row("SELECT COUNT(*) FROM wear_bin", [], |x| x.get(0)).unwrap();
        assert_eq!(bins, 3);
    }

    #[test]
    fn validation_boundaries() {
        let mut c = mem();
        let ok = |f: &dyn Fn(&mut WearScanInput)| {
            let mut i = scan("side-a", 3);
            f(&mut i);
            validate(&i)
        };
        assert!(ok(&|_| {}).is_ok());
        for v in [1.0, 5.0] {
            assert!(ok(&|i| i.bin_sec = v).is_ok(), "binSec {v}");
        }
        for v in [0.99, 5.01, f64::NAN] {
            assert!(ok(&|i| i.bin_sec = v).is_err(), "binSec {v}");
        }
        for v in [0.0, 1.0] {
            assert!(ok(&|i| i.coverage = v).is_ok());
        }
        for v in [-0.01, 1.01, f64::INFINITY] {
            assert!(ok(&|i| i.coverage = v).is_err());
        }
        for v in VERDICTS {
            assert!(ok(&|i| i.verdict = (*v).into()).is_ok());
        }
        assert!(ok(&|i| i.verdict = "fine".into()).unwrap_err().contains("verdict"));
        assert!(ok(&|i| i.score = Some(100.01)).is_err());
        assert!(ok(&|i| i.score = None).is_ok());
        assert!(ok(&|i| i.format = "  ".into()).is_err());
        assert!(ok(&|i| i.format = "x".repeat(81)).is_err());
        assert!(ok(&|i| i.record_side_id = " ".into()).is_err());
        assert!(ok(&|i| i.summary = Some(json!([1]))).unwrap_err().contains("object"));
        assert!(ok(&|i| i.summary = Some(json!({"x": "y".repeat(MAX_SUMMARY_BYTES)}))).is_err());
        assert!(ok(&|i| i.geometry = Some(json!({"x": "y".repeat(MAX_GEOMETRY_BYTES)}))).is_err());
        assert!(ok(&|i| i.bins = (0..MAX_BINS as i64).map(|k| WearBin { t_sec: k as f64, ..bin(k) }).collect()).is_ok(), "5000 one-second bins");
        assert!(ok(&|i| i.bins = (0..=MAX_BINS as i64).map(|k| WearBin { t_sec: k as f64, ..bin(k) }).collect()).unwrap_err().contains("at most"));
        assert!(ok(&|i| i.bins[1].idx = 0).unwrap_err().contains("twice"));
        assert!(ok(&|i| i.bins[0].idx = -1).is_err());
        assert!(ok(&|i| i.bins[0].t_sec = -0.1).is_err());
        assert!(ok(&|i| i.bins[0].t_sec = MAX_T_SEC + 1.0).is_err());
        assert!(ok(&|i| i.bins[0].snr_db = Some(f64::NAN)).is_err());
        assert!(ok(&|i| i.bins[0].phase_err_deg = Some(180.0)).is_ok());
        assert!(ok(&|i| i.bins[0].phase_err_deg = Some(180.1)).is_err());
        assert!(ok(&|i| i.bins[0].phase_err_deg = Some(-0.1)).is_err());
        assert!(ok(&|i| i.bins[0].dropouts = -1).is_err());
        assert!(ok(&|i| i.bins[0].flags = 7).is_ok());
        assert!(ok(&|i| i.bins[0].flags = 8).is_err());
        // a rejected scan writes nothing
        let mut bad = scan("side-a", 3);
        bad.bins[2].flags = 99;
        assert!(save(&mut c, &bad).is_err());
        let n: i64 = c.query_row("SELECT COUNT(*) FROM wear_scan", [], |x| x.get(0)).unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn table_constraints_hold_below_the_api() {
        let c = mem();
        let ins = |verdict: &str| {
            c.execute(
                "INSERT INTO wear_scan (id, record_side_id, format, bin_sec, coverage, verdict, created_at) VALUES (?1, 'side-a', 'x', 2, 1, ?2, 't')",
                params![new_id(), verdict],
            )
        };
        for v in VERDICTS {
            assert!(ins(v).is_ok(), "{v}");
        }
        assert!(ins("fine").is_err());
        assert!(c.execute("INSERT INTO wear_bin (scan_id, idx, t_sec) VALUES ('missing', 0, 0)", []).is_err(), "bin needs its scan");
        assert!(c
            .execute("INSERT INTO wear_scan (id, record_side_id, format, bin_sec, coverage, verdict, created_at) VALUES ('z', 'no-side', 'x', 2, 1, 'keep', 't')", [])
            .is_err());
    }

    #[test]
    fn contract_examples_round_trip() {
        let raw = std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/wearmap.json")).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        let input: WearScanInput = serde_json::from_value(v["wearmap_save"]["request"]["scan"].clone()).unwrap();
        let mut c = mem();
        let saved = save(&mut c, &input).unwrap();
        let mut got = serde_json::to_value(&saved).unwrap();
        let want = &v["wearmap_save"]["response"];
        for k in ["id", "createdAt"] {
            assert!(got[k].is_string());
            got[k] = want[k].clone();
        }
        // JS writes 2 where serde writes 2.0: compare numbers by value
        fn norm(v: &Value) -> Value {
            match v {
                Value::Number(n) => json!(n.as_f64()),
                Value::Array(a) => Value::Array(a.iter().map(norm).collect()),
                Value::Object(o) => Value::Object(o.iter().map(|(k, x)| (k.clone(), norm(x))).collect()),
                x => x.clone(),
            }
        }
        assert_eq!(norm(&got), norm(want));
        let side = v["wearmap_list"]["request"]["recordSideId"].as_str().unwrap();
        assert_eq!(list(&c, Some(side), v["wearmap_list"]["request"]["limit"].as_u64().map(|n| n as u32)).unwrap().len(), 1);
        assert!(v["wearmap_get"]["request"]["id"].is_string() && v["wearmap_delete"]["request"]["id"].is_string());
        let mut detail = serde_json::to_value(get(&c, &saved.id).unwrap().unwrap()).unwrap();
        let want_detail = &v["wearmap_get"]["response"];
        for k in ["id", "createdAt"] {
            detail[k] = want_detail[k].clone();
        }
        assert_eq!(norm(&detail), norm(want_detail), "get returns the scan fields flattened next to its bins");
    }
}
