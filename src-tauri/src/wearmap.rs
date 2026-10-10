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

// ------------------------------------------------------------------ control-vinyl copies and sides
// A wear scan needs a `record_side` row. Control-vinyl copies are ordinary record_release / record_copy /
// record_side rows whose release is tagged external_reference_type = 'timecode' with the timecode format name
// in external_reference_id, so music records from the SPEC-03 side scan never show up in the wear-map picker.

pub const RECORD_REF_TYPE: &str = "timecode";
pub const MAX_RECORD_TEXT: usize = 120;
pub const MAX_SIDES: usize = 4;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordSide {
    pub id: String,
    pub side_label: String,
    pub nominal_rpm: Option<f64>,
    pub expected_duration_sec: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordCopy {
    pub id: String,
    pub release_id: String,
    pub title: String,
    pub format: String,
    pub nickname: Option<String>,
    pub cleaning_state: Option<String>,
    pub retired: bool,
    pub sides: Vec<RecordSide>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordSideInput {
    pub id: Option<String>,
    pub side_label: String,
    pub nominal_rpm: Option<f64>,
    pub expected_duration_sec: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordCopyInput {
    pub id: Option<String>,
    pub title: String,
    pub format: String,
    pub nickname: Option<String>,
    pub cleaning_state: Option<String>,
    #[serde(default)]
    pub retired: bool,
    #[serde(default)]
    pub sides: Vec<RecordSideInput>,
}

fn text_field(name: &str, v: &str, required: bool, max: usize) -> Result<(), String> {
    let n = v.trim().chars().count();
    if (required && n == 0) || n > max {
        return Err(format!("{name} must be {} to {max} characters", if required { 1 } else { 0 }));
    }
    Ok(())
}

pub fn validate_record(input: &RecordCopyInput) -> Result<(), String> {
    text_field("title", &input.title, true, MAX_RECORD_TEXT)?;
    text_field("format", &input.format, true, MAX_FORMAT_CHARS)?;
    text_field("nickname", input.nickname.as_deref().unwrap_or(""), false, MAX_RECORD_TEXT)?;
    text_field("cleaningState", input.cleaning_state.as_deref().unwrap_or(""), false, 40)?;
    if input.sides.is_empty() || input.sides.len() > MAX_SIDES {
        return Err(format!("a record copy has 1 to {MAX_SIDES} sides"));
    }
    let mut labels = HashSet::new();
    for s in &input.sides {
        text_field("side label", &s.side_label, true, 16)?;
        if !labels.insert(s.side_label.trim().to_lowercase()) {
            return Err(format!("side '{}' appears twice", s.side_label.trim()));
        }
        check_opt("nominalRpm", s.nominal_rpm, 1.0, 100.0)?;
        check_opt("expectedDurationSec", s.expected_duration_sec, 1.0, MAX_T_SEC)?;
    }
    Ok(())
}

fn opt_text(v: &Option<String>) -> Option<String> {
    v.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

fn get_record(conn: &Connection, copy_id: &str) -> Result<Option<RecordCopy>, String> {
    let row = conn
        .query_row(
            "SELECT c.id, r.id, r.title, COALESCE(r.external_reference_id, ''), c.nickname, c.cleaning_state, c.retired
             FROM record_copy c JOIN record_release r ON r.id = c.record_id
             WHERE c.id = ?1 AND r.external_reference_type = ?2",
            params![copy_id, RECORD_REF_TYPE],
            |r| {
                Ok(RecordCopy {
                    id: r.get(0)?,
                    release_id: r.get(1)?,
                    title: r.get(2)?,
                    format: r.get(3)?,
                    nickname: r.get(4)?,
                    cleaning_state: r.get(5)?,
                    retired: r.get::<_, i64>(6)? != 0,
                    sides: Vec::new(),
                })
            },
        )
        .optional()
        .map_err(e2s)?;
    let Some(mut copy) = row else { return Ok(None) };
    let mut stmt = conn
        .prepare("SELECT id, side_label, nominal_rpm, expected_duration_sec FROM record_side WHERE record_copy_id = ?1 ORDER BY side_label COLLATE NOCASE, rowid")
        .map_err(e2s)?;
    copy.sides = stmt
        .query_map([copy_id], |r| Ok(RecordSide { id: r.get(0)?, side_label: r.get(1)?, nominal_rpm: r.get(2)?, expected_duration_sec: r.get(3)? }))
        .map_err(e2s)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e2s)?;
    Ok(Some(copy))
}

/// Control-vinyl copies with their sides, by title then nickname.
pub fn list_records(conn: &Connection) -> Result<Vec<RecordCopy>, String> {
    let ids = {
        let mut stmt = conn
            .prepare(
                "SELECT c.id FROM record_copy c JOIN record_release r ON r.id = c.record_id
                 WHERE r.external_reference_type = ?1 ORDER BY c.retired, r.title COLLATE NOCASE, c.nickname COLLATE NOCASE, c.rowid",
            )
            .map_err(e2s)?;
        let rows = stmt.query_map([RECORD_REF_TYPE], |r| r.get::<_, String>(0)).map_err(e2s)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)?
    };
    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        if let Some(c) = get_record(conn, &id)? {
            out.push(c);
        }
    }
    Ok(out)
}

/// Create a control-vinyl copy (new release + copy + sides) or update one: title, format, nickname, cleaning
/// state and retired flag change in place; sides with an id are updated, sides without one are added. Sides
/// are never deleted here because scans reference them.
pub fn save_record(conn: &mut Connection, input: &RecordCopyInput) -> Result<RecordCopy, String> {
    validate_record(input)?;
    let tx = conn.transaction().map_err(e2s)?;
    let copy_id = match input.id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(id) => {
            let release: Option<String> = tx
                .query_row(
                    "SELECT r.id FROM record_copy c JOIN record_release r ON r.id = c.record_id WHERE c.id = ?1 AND r.external_reference_type = ?2",
                    params![id, RECORD_REF_TYPE],
                    |r| r.get(0),
                )
                .optional()
                .map_err(e2s)?;
            let release = release.ok_or_else(|| format!("unknown control-vinyl copy '{id}'"))?;
            tx.execute(
                "UPDATE record_release SET title = ?1, external_reference_id = ?2 WHERE id = ?3",
                params![input.title.trim(), input.format.trim(), release],
            )
            .map_err(e2s)?;
            tx.execute(
                "UPDATE record_copy SET nickname = ?1, cleaning_state = ?2, retired = ?3 WHERE id = ?4",
                params![opt_text(&input.nickname), opt_text(&input.cleaning_state), input.retired as i64, id],
            )
            .map_err(e2s)?;
            id.to_string()
        }
        None => {
            let release = new_id();
            let copy = new_id();
            tx.execute(
                "INSERT INTO record_release (id, title, external_reference_type, external_reference_id) VALUES (?1, ?2, ?3, ?4)",
                params![release, input.title.trim(), RECORD_REF_TYPE, input.format.trim()],
            )
            .map_err(e2s)?;
            tx.execute(
                "INSERT INTO record_copy (id, record_id, nickname, cleaning_state, retired) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![copy, release, opt_text(&input.nickname), opt_text(&input.cleaning_state), input.retired as i64],
            )
            .map_err(e2s)?;
            copy
        }
    };
    for s in &input.sides {
        match s.id.as_deref().map(str::trim).filter(|x| !x.is_empty()) {
            Some(sid) => {
                let n = tx
                    .execute(
                        "UPDATE record_side SET side_label = ?1, nominal_rpm = ?2, expected_duration_sec = ?3 WHERE id = ?4 AND record_copy_id = ?5",
                        params![s.side_label.trim(), s.nominal_rpm, s.expected_duration_sec, sid, copy_id],
                    )
                    .map_err(e2s)?;
                if n == 0 {
                    return Err(format!("side '{sid}' does not belong to this copy"));
                }
            }
            None => {
                tx.execute(
                    "INSERT INTO record_side (id, record_copy_id, side_label, nominal_rpm, expected_duration_sec) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![new_id(), copy_id, s.side_label.trim(), s.nominal_rpm, s.expected_duration_sec],
                )
                .map_err(e2s)?;
            }
        }
    }
    let n: i64 = tx
        .query_row("SELECT COUNT(DISTINCT lower(trim(side_label))) - COUNT(*) FROM record_side WHERE record_copy_id = ?1", [&copy_id], |r| r.get(0))
        .map_err(e2s)?;
    if n != 0 {
        return Err("side labels must be unique within a copy".into());
    }
    tx.commit().map_err(e2s)?;
    get_record(conn, &copy_id)?.ok_or_else(|| "record copy vanished after save".to_string())
}

#[tauri::command]
pub fn wearmap_records_list(app: AppHandle) -> Result<Vec<RecordCopy>, String> {
    let conn = open_database(&database_path(&app)?)?;
    list_records(&conn)
}

#[tauri::command]
pub fn wearmap_record_save(app: AppHandle, record: RecordCopyInput) -> Result<RecordCopy, String> {
    let mut conn = open_database(&database_path(&app)?)?;
    save_record(&mut conn, &record)
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

    fn rec(title: &str, sides: &[&str]) -> RecordCopyInput {
        RecordCopyInput {
            id: None,
            title: title.into(),
            format: "Serato CV02.5".into(),
            nickname: Some(" Deck 1 ".into()),
            cleaning_state: None,
            retired: false,
            sides: sides.iter().map(|l| RecordSideInput { id: None, side_label: (*l).into(), nominal_rpm: Some(33.333333), expected_duration_sec: Some(712.0) }).collect(),
        }
    }

    #[test]
    fn record_copies_create_update_list_and_take_scans() {
        let mut c = mem();
        let a = save_record(&mut c, &rec("Serato CV02.5", &["A", "B"])).unwrap();
        assert_eq!((a.title.as_str(), a.format.as_str(), a.nickname.as_deref(), a.sides.len()), ("Serato CV02.5", "Serato CV02.5", Some("Deck 1"), 2));
        assert_eq!(a.sides.iter().map(|s| s.side_label.as_str()).collect::<Vec<_>>(), ["A", "B"]);
        // music records from the side scan (fixture copy-1) are not control vinyl
        assert_eq!(list_records(&c).unwrap().iter().map(|r| r.id.clone()).collect::<Vec<_>>(), vec![a.id.clone()]);
        // a scan can be saved against the new side
        save(&mut c, &scan(&a.sides[0].id, 3)).unwrap();
        // update: rename, mark cleaned, edit side A, add side C
        let mut u = rec("Serato CV02.5 (2nd)", &[]);
        u.id = Some(a.id.clone());
        u.cleaning_state = Some("cleaned".into());
        u.sides = vec![
            RecordSideInput { id: Some(a.sides[0].id.clone()), side_label: "A".into(), nominal_rpm: Some(45.0), expected_duration_sec: None },
            RecordSideInput { id: None, side_label: "C".into(), nominal_rpm: None, expected_duration_sec: None },
        ];
        let b = save_record(&mut c, &u).unwrap();
        assert_eq!(b.id, a.id);
        assert_eq!((b.title.as_str(), b.cleaning_state.as_deref(), b.sides.len()), ("Serato CV02.5 (2nd)", Some("cleaned"), 3));
        assert_eq!((b.sides[0].nominal_rpm, b.sides[0].expected_duration_sec), (Some(45.0), None));
        assert_eq!(list(&c, Some(&a.sides[0].id), None).unwrap().len(), 1, "scans stay on the edited side");
    }

    #[test]
    fn record_validation_and_ownership() {
        let mut c = mem();
        let v = |f: &dyn Fn(&mut RecordCopyInput)| {
            let mut i = rec("CV", &["A"]);
            f(&mut i);
            validate_record(&i)
        };
        assert!(v(&|_| {}).is_ok());
        assert!(v(&|i| i.title = " ".into()).is_err());
        assert!(v(&|i| i.title = "x".repeat(121)).is_err());
        assert!(v(&|i| i.format = "".into()).is_err());
        assert!(v(&|i| i.sides.clear()).unwrap_err().contains("sides"));
        assert!(v(&|i| i.sides = rec("x", &["A", "B", "C", "D", "E"]).sides).is_err());
        assert!(v(&|i| i.sides = rec("x", &["A", " a "]).sides).unwrap_err().contains("twice"));
        assert!(v(&|i| i.sides[0].nominal_rpm = Some(0.5)).is_err());
        assert!(v(&|i| i.sides[0].expected_duration_sec = Some(MAX_T_SEC + 1.0)).is_err());
        // unknown copy, a side from another copy, a duplicate label added later: nothing written
        let mut u = rec("CV", &["A"]);
        u.id = Some("copy-1".into());
        assert!(save_record(&mut c, &u).unwrap_err().contains("unknown control-vinyl copy"), "music copies are not editable here");
        let a = save_record(&mut c, &rec("CV", &["A"])).unwrap();
        let b = save_record(&mut c, &rec("CV", &["A"])).unwrap();
        let mut steal = rec("CV", &["A"]);
        steal.id = Some(b.id.clone());
        steal.sides[0].id = Some(a.sides[0].id.clone());
        assert!(save_record(&mut c, &steal).unwrap_err().contains("does not belong"));
        let mut dup = rec("CV", &["a"]);
        dup.id = Some(a.id.clone());
        assert!(save_record(&mut c, &dup).unwrap_err().contains("unique"));
        assert_eq!(list_records(&c).unwrap().iter().find(|r| r.id == a.id).unwrap().sides.len(), 1);
    }

    #[test]
    fn record_contract_examples_round_trip() {
        let raw = std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/wearmap.json")).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        let input: RecordCopyInput = serde_json::from_value(v["wearmap_record_save"]["request"]["record"].clone()).unwrap();
        let mut c = mem();
        let saved = save_record(&mut c, &input).unwrap();
        let mut got = serde_json::to_value(&saved).unwrap();
        let want = &v["wearmap_record_save"]["response"];
        got["id"] = want["id"].clone();
        got["releaseId"] = want["releaseId"].clone();
        for (k, s) in got["sides"].as_array_mut().unwrap().iter_mut().enumerate() {
            s["id"] = want["sides"][k]["id"].clone();
        }
        // JS writes 712 where serde writes 712.0: compare numbers by value
        fn norm(v: &Value) -> Value {
            match v {
                Value::Number(n) => json!(n.as_f64()),
                Value::Array(a) => Value::Array(a.iter().map(norm).collect()),
                Value::Object(o) => Value::Object(o.iter().map(|(k, x)| (k.clone(), norm(x))).collect()),
                x => x.clone(),
            }
        }
        assert_eq!(norm(&got), norm(want));
        let mut listed = serde_json::to_value(list_records(&c).unwrap()).unwrap();
        listed[0] = got;
        assert_eq!(norm(&listed), norm(&v["wearmap_records_list"]["response"]));
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
