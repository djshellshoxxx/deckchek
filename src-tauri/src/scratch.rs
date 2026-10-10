//! Scratch stress test runs (FS-14 §4-5, tables from `0011_scratch_stress.sql`).
//! The DSP and scoring live in `app/scratch.js`; Rust stores a finished (or aborted)
//! run with its events, lists runs per cartridge / control-vinyl side / setup for
//! comparisons, and returns one run with its events. Every input is validated
//! (imported runs included) and all SQL is parameterised.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::db::{database_path, new_id, now_iso, open_database};

pub const EVENT_KINDS: &[&str] = &["reversal", "lock_loss", "direction_error", "skip", "recovery"];
pub const MAX_EVENTS: usize = 20_000;
pub const MAX_COMPONENTS_BYTES: usize = 16 * 1024;
pub const MAX_DETAIL_BYTES: usize = 2 * 1024;
pub const MAX_NOTE_CHARS: usize = 500;
pub const MAX_FORMAT_CHARS: usize = 80;
/// One protocol run is ~90 s; anything past an hour is not a scratch run.
pub const MAX_T_MS: f64 = 3_600_000.0;
pub const DEFAULT_LIST_LIMIT: u32 = 200;
pub const MAX_LIST_LIMIT: u32 = 1000;

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchEventInput {
    pub pattern: String,
    pub kind: String,
    pub t_ms: f64,
    pub duration_ms: Option<f64>,
    pub value: Option<f64>,
    pub detail: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchRunInput {
    pub session_id: Option<String>,
    pub setup_id: Option<String>,
    pub cartridge_asset_id: Option<String>,
    pub record_side_id: Option<String>,
    pub format: String,
    pub bpm: f64,
    pub protocol_version: i64,
    pub completed: Option<bool>,
    pub score: Option<f64>,
    pub components: Option<Value>,
    pub lock_losses: Option<i64>,
    pub longest_loss_ms: Option<f64>,
    pub median_recovery_ms: Option<f64>,
    pub direction_errors: Option<i64>,
    pub skips: Option<i64>,
    pub reversals: Option<i64>,
    pub peak_velocity: Option<f64>,
    pub tracking_force_g: Option<f64>,
    pub tonearm_note: Option<String>,
    #[serde(default)]
    pub events: Vec<ScratchEventInput>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchRun {
    pub id: String,
    pub session_id: Option<String>,
    pub setup_id: Option<String>,
    pub cartridge_asset_id: Option<String>,
    pub record_side_id: Option<String>,
    pub format: String,
    pub bpm: f64,
    pub protocol_version: i64,
    pub completed: bool,
    pub score: Option<f64>,
    pub components: Value,
    pub lock_losses: Option<i64>,
    pub longest_loss_ms: Option<f64>,
    pub median_recovery_ms: Option<f64>,
    pub direction_errors: Option<i64>,
    pub skips: Option<i64>,
    pub reversals: Option<i64>,
    pub peak_velocity: Option<f64>,
    pub tracking_force_g: Option<f64>,
    pub tonearm_note: Option<String>,
    pub created_at: String,
    pub event_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchEvent {
    pub id: String,
    pub run_id: String,
    pub pattern: String,
    pub kind: String,
    pub t_ms: f64,
    pub duration_ms: Option<f64>,
    pub value: Option<f64>,
    pub detail: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchRunDetail {
    pub run: ScratchRun,
    pub events: Vec<ScratchEvent>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchFilter {
    pub cartridge_asset_id: Option<String>,
    pub record_side_id: Option<String>,
    pub setup_id: Option<String>,
    pub format: Option<String>,
    pub protocol_version: Option<i64>,
    pub limit: Option<u32>,
}

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

fn valid_pattern(p: &str) -> bool {
    let b = p.as_bytes();
    !b.is_empty() && b.len() <= 32 && b[0].is_ascii_lowercase() && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'_' || *c == b'-')
}

fn check_opt(name: &str, v: Option<f64>, lo: f64, hi: f64) -> Result<(), String> {
    match v {
        Some(x) if !x.is_finite() || x < lo || x > hi => Err(format!("{name} must be between {lo} and {hi}")),
        _ => Ok(()),
    }
}

fn check_count(name: &str, v: Option<i64>) -> Result<(), String> {
    match v {
        Some(x) if !(0..=1_000_000).contains(&x) => Err(format!("{name} must be a count between 0 and 1000000")),
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

pub fn validate(input: &ScratchRunInput) -> Result<(), String> {
    let f = input.format.trim();
    if f.is_empty() || f.chars().count() > MAX_FORMAT_CHARS {
        return Err(format!("format must be 1 to {MAX_FORMAT_CHARS} characters"));
    }
    if !input.bpm.is_finite() || input.bpm < 30.0 || input.bpm > 300.0 {
        return Err("bpm must be between 30 and 300".into());
    }
    if !(1..=1000).contains(&input.protocol_version) {
        return Err("protocolVersion must be between 1 and 1000".into());
    }
    check_opt("score", input.score, 0.0, 100.0)?;
    check_opt("longestLossMs", input.longest_loss_ms, 0.0, MAX_T_MS)?;
    check_opt("medianRecoveryMs", input.median_recovery_ms, 0.0, MAX_T_MS)?;
    check_opt("peakVelocity", input.peak_velocity, -1000.0, 1000.0)?;
    check_opt("trackingForceG", input.tracking_force_g, 0.0, 10.0)?;
    for (name, v) in [
        ("lockLosses", input.lock_losses),
        ("directionErrors", input.direction_errors),
        ("skips", input.skips),
        ("reversals", input.reversals),
    ] {
        check_count(name, v)?;
    }
    if input.tonearm_note.as_ref().map_or(false, |n| n.chars().count() > MAX_NOTE_CHARS) {
        return Err(format!("tonearmNote is limited to {MAX_NOTE_CHARS} characters"));
    }
    object_json("components", input.components.as_ref(), MAX_COMPONENTS_BYTES)?;
    if input.events.len() > MAX_EVENTS {
        return Err(format!("a scratch run holds at most {MAX_EVENTS} events"));
    }
    for (i, e) in input.events.iter().enumerate() {
        if !valid_pattern(&e.pattern) {
            return Err(format!("event {i}: pattern must match [a-z][a-z0-9_-]{{0,31}}"));
        }
        if !EVENT_KINDS.contains(&e.kind.as_str()) {
            return Err(format!("event {i}: kind must be one of {}", EVENT_KINDS.join(", ")));
        }
        if !e.t_ms.is_finite() || e.t_ms < 0.0 || e.t_ms > MAX_T_MS {
            return Err(format!("event {i}: tMs must be between 0 and {MAX_T_MS}"));
        }
        check_opt(&format!("event {i}: durationMs"), e.duration_ms, 0.0, MAX_T_MS)?;
        check_opt(&format!("event {i}: value"), e.value, -1e6, 1e6)?;
        object_json(&format!("event {i}: detail"), e.detail.as_ref(), MAX_DETAIL_BYTES)?;
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

const RUN_COLS: &str = "r.id, r.session_id, r.setup_id, r.cartridge_asset_id, r.record_side_id, r.format, r.bpm, r.protocol_version, r.completed, r.score, \
    r.components_json, r.lock_losses, r.longest_loss_ms, r.median_recovery_ms, r.direction_errors, r.skips, r.reversals, r.peak_velocity, \
    r.tracking_force_g, r.tonearm_note, r.created_at, (SELECT COUNT(*) FROM scratch_event e WHERE e.run_id = r.id)";

fn run_row(r: &rusqlite::Row) -> rusqlite::Result<ScratchRun> {
    let components: String = r.get(10)?;
    Ok(ScratchRun {
        id: r.get(0)?,
        session_id: r.get(1)?,
        setup_id: r.get(2)?,
        cartridge_asset_id: r.get(3)?,
        record_side_id: r.get(4)?,
        format: r.get(5)?,
        bpm: r.get(6)?,
        protocol_version: r.get(7)?,
        completed: r.get::<_, i64>(8)? != 0,
        score: r.get(9)?,
        components: serde_json::from_str(&components).unwrap_or(Value::Object(Default::default())),
        lock_losses: r.get(11)?,
        longest_loss_ms: r.get(12)?,
        median_recovery_ms: r.get(13)?,
        direction_errors: r.get(14)?,
        skips: r.get(15)?,
        reversals: r.get(16)?,
        peak_velocity: r.get(17)?,
        tracking_force_g: r.get(18)?,
        tonearm_note: r.get(19)?,
        created_at: r.get(20)?,
        event_count: r.get(21)?,
    })
}

fn get_run(conn: &Connection, id: &str) -> Result<Option<ScratchRun>, String> {
    conn.query_row(&format!("SELECT {RUN_COLS} FROM scratch_run r WHERE r.id = ?1"), [id], run_row).optional().map_err(e2s)
}

/// Validate and store a run with its events in one transaction.
pub fn save(conn: &mut Connection, input: &ScratchRunInput) -> Result<ScratchRun, String> {
    validate(input)?;
    for (table, label, id) in [
        ("session", "session", &input.session_id),
        ("setup", "setup", &input.setup_id),
        ("asset", "cartridge asset", &input.cartridge_asset_id),
        ("record_side", "record side", &input.record_side_id),
    ] {
        if let Some(id) = id {
            if !exists(conn, table, id)? {
                return Err(format!("unknown {label} '{id}'"));
            }
        }
    }
    let id = new_id();
    let now = now_iso(conn)?;
    let components = object_json("components", input.components.as_ref(), MAX_COMPONENTS_BYTES)?;
    let note = input.tonearm_note.as_ref().map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let tx = conn.transaction().map_err(e2s)?;
    tx.execute(
        "INSERT INTO scratch_run (id, session_id, setup_id, cartridge_asset_id, record_side_id, format, bpm, protocol_version, completed, score,
           components_json, lock_losses, longest_loss_ms, median_recovery_ms, direction_errors, skips, reversals, peak_velocity, tracking_force_g,
           tonearm_note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        params![
            id,
            input.session_id,
            input.setup_id,
            input.cartridge_asset_id,
            input.record_side_id,
            input.format.trim(),
            input.bpm,
            input.protocol_version,
            input.completed.unwrap_or(true) as i64,
            input.score,
            components,
            input.lock_losses,
            input.longest_loss_ms,
            input.median_recovery_ms,
            input.direction_errors,
            input.skips,
            input.reversals,
            input.peak_velocity,
            input.tracking_force_g,
            note,
            now
        ],
    )
    .map_err(e2s)?;
    {
        let mut stmt = tx
            .prepare("INSERT INTO scratch_event (id, run_id, pattern, kind, t_ms, duration_ms, value, detail_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
            .map_err(e2s)?;
        for e in &input.events {
            let detail = object_json("detail", e.detail.as_ref(), MAX_DETAIL_BYTES)?;
            stmt.execute(params![new_id(), id, e.pattern, e.kind, e.t_ms, e.duration_ms, e.value, detail]).map_err(e2s)?;
        }
    }
    tx.commit().map_err(e2s)?;
    get_run(conn, &id)?.ok_or_else(|| "scratch run vanished after save".to_string())
}

/// Runs matching every given filter field, newest first, without their events.
pub fn list(conn: &Connection, filter: &ScratchFilter) -> Result<Vec<ScratchRun>, String> {
    let limit = filter.limit.unwrap_or(DEFAULT_LIST_LIMIT).clamp(1, MAX_LIST_LIMIT);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {RUN_COLS} FROM scratch_run r
             WHERE (?1 IS NULL OR r.cartridge_asset_id = ?1) AND (?2 IS NULL OR r.record_side_id = ?2)
               AND (?3 IS NULL OR r.setup_id = ?3) AND (?4 IS NULL OR r.format = ?4) AND (?5 IS NULL OR r.protocol_version = ?5)
             ORDER BY r.created_at DESC, r.id DESC LIMIT ?6"
        ))
        .map_err(e2s)?;
    let rows = stmt
        .query_map(
            params![filter.cartridge_asset_id, filter.record_side_id, filter.setup_id, filter.format, filter.protocol_version, limit],
            run_row,
        )
        .map_err(e2s)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)
}

/// One run with its events in time order; `None` for an unknown id.
pub fn get(conn: &Connection, id: &str) -> Result<Option<ScratchRunDetail>, String> {
    let Some(run) = get_run(conn, id)? else { return Ok(None) };
    let mut stmt = conn
        .prepare("SELECT id, run_id, pattern, kind, t_ms, duration_ms, value, detail_json FROM scratch_event WHERE run_id = ?1 ORDER BY t_ms, rowid")
        .map_err(e2s)?;
    let events = stmt
        .query_map([id], |r| {
            let detail: String = r.get(7)?;
            Ok(ScratchEvent {
                id: r.get(0)?,
                run_id: r.get(1)?,
                pattern: r.get(2)?,
                kind: r.get(3)?,
                t_ms: r.get(4)?,
                duration_ms: r.get(5)?,
                value: r.get(6)?,
                detail: serde_json::from_str(&detail).unwrap_or(Value::Object(Default::default())),
            })
        })
        .map_err(e2s)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e2s)?;
    Ok(Some(ScratchRunDetail { run, events }))
}

/// Returns whether a run was removed; its events go with it (ON DELETE CASCADE).
pub fn delete(conn: &Connection, id: &str) -> Result<bool, String> {
    conn.execute("DELETE FROM scratch_run WHERE id = ?1", [id]).map(|n| n > 0).map_err(e2s)
}

#[tauri::command]
pub fn scratch_save(app: AppHandle, run: ScratchRunInput) -> Result<ScratchRun, String> {
    let mut conn = open_database(&database_path(&app)?)?;
    save(&mut conn, &run)
}

#[tauri::command]
pub fn scratch_list(app: AppHandle, filter: Option<ScratchFilter>) -> Result<Vec<ScratchRun>, String> {
    let conn = open_database(&database_path(&app)?)?;
    list(&conn, &filter.unwrap_or_default())
}

#[tauri::command]
pub fn scratch_get(app: AppHandle, id: String) -> Result<Option<ScratchRunDetail>, String> {
    let conn = open_database(&database_path(&app)?)?;
    get(&conn, &id)
}

#[tauri::command]
pub fn scratch_delete(app: AppHandle, id: String) -> Result<bool, String> {
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
            "INSERT INTO asset (id, nickname, created_at, updated_at) VALUES ('cart-1','Cart A','t','t'),('cart-2','Cart B','t','t');
             INSERT INTO setup (id, name, created_at) VALUES ('setup-1','Booth','t');
             INSERT INTO session (id, session_type, started_at, app_version, schema_version, status) VALUES ('s1','scratch','t','0',1,'complete');
             INSERT INTO record_release (id, title) VALUES ('rel-1','Serato CV02.5');
             INSERT INTO record_copy (id, record_id, nickname) VALUES ('copy-1','rel-1','CV02.5 spare');
             INSERT INTO record_side (id, record_copy_id, side_label) VALUES ('side-a','copy-1','A');",
        )
        .unwrap();
        c
    }

    fn ev(kind: &str, t: f64) -> ScratchEventInput {
        ScratchEventInput { pattern: "baby".into(), kind: kind.into(), t_ms: t, duration_ms: Some(10.0), value: Some(2.0), detail: Some(json!({"fromSign": 1})) }
    }

    fn run(cart: Option<&str>) -> ScratchRunInput {
        ScratchRunInput {
            session_id: None,
            setup_id: None,
            cartridge_asset_id: cart.map(String::from),
            record_side_id: None,
            format: "Serato CV02.5".into(),
            bpm: 90.0,
            protocol_version: 1,
            completed: None,
            score: Some(88.0),
            components: Some(json!({"continuity": {"points": 30, "max": 30}})),
            lock_losses: Some(1),
            longest_loss_ms: Some(30.0),
            median_recovery_ms: Some(12.5),
            direction_errors: Some(0),
            skips: Some(0),
            reversals: Some(2),
            peak_velocity: Some(-2.1),
            tracking_force_g: Some(3.0),
            tonearm_note: Some("  height +2 ".into()),
            events: vec![ev("reversal", 200.0), ev("lock_loss", 100.0), ev("recovery", 130.0)],
        }
    }

    #[test]
    fn migration_creates_tables_and_is_rerunnable() {
        let c = mem();
        let sql = crate::db::MIGRATIONS.iter().find(|(v, _)| *v == 11).expect("0011 registered").1;
        c.execute_batch(sql).unwrap();
        let cols = |t: &str| -> Vec<String> {
            c.prepare(&format!("SELECT name FROM pragma_table_info('{t}')")).unwrap().query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap()
        };
        assert_eq!(
            cols("scratch_run"),
            [
                "id", "session_id", "setup_id", "cartridge_asset_id", "record_side_id", "format", "bpm", "protocol_version", "completed", "score",
                "components_json", "lock_losses", "longest_loss_ms", "median_recovery_ms", "direction_errors", "skips", "reversals", "peak_velocity",
                "tracking_force_g", "tonearm_note", "created_at"
            ]
        );
        assert_eq!(cols("scratch_event"), ["id", "run_id", "pattern", "kind", "t_ms", "duration_ms", "value", "detail_json"]);
        let idx: i64 = c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_scratch_%'", [], |r| r.get(0)).unwrap();
        assert_eq!(idx, 2);
    }

    #[test]
    fn save_get_list_delete_round_trip() {
        let mut c = mem();
        let mut i = run(Some("cart-1"));
        i.session_id = Some("s1".into());
        i.setup_id = Some("setup-1".into());
        i.record_side_id = Some("side-a".into());
        let r = save(&mut c, &i).unwrap();
        assert_eq!((r.completed, r.event_count, r.score), (true, 3, Some(88.0)));
        assert_eq!(r.tonearm_note.as_deref(), Some("height +2"));
        assert_eq!(r.components["continuity"]["max"], 30);
        let d = get(&c, &r.id).unwrap().unwrap();
        assert_eq!(d.run, r);
        assert_eq!(d.events.iter().map(|e| e.kind.as_str()).collect::<Vec<_>>(), ["lock_loss", "recovery", "reversal"], "events in time order");
        assert!(d.events.iter().all(|e| e.run_id == r.id && e.detail["fromSign"] == 1));
        assert_eq!(list(&c, &ScratchFilter::default()).unwrap(), vec![r.clone()]);
        assert!(get(&c, "nope").unwrap().is_none());
        assert!(delete(&c, &r.id).unwrap());
        assert!(!delete(&c, &r.id).unwrap());
        let left: i64 = c.query_row("SELECT COUNT(*) FROM scratch_event", [], |x| x.get(0)).unwrap();
        assert_eq!(left, 0, "events cascade with the run");
    }

    #[test]
    fn list_filters_by_entity_for_comparisons() {
        let mut c = mem();
        let a1 = save(&mut c, &run(Some("cart-1"))).unwrap();
        let a2 = save(&mut c, &run(Some("cart-1"))).unwrap();
        let mut other = run(Some("cart-2"));
        other.format = "Traktor Scratch MK2".into();
        other.protocol_version = 2;
        let b = save(&mut c, &other).unwrap();
        let ids = |f: ScratchFilter| list(&c, &f).unwrap().into_iter().map(|r| r.id).collect::<Vec<_>>();
        let mut cart1 = ids(ScratchFilter { cartridge_asset_id: Some("cart-1".into()), ..Default::default() });
        cart1.sort();
        let mut want = vec![a1.id.clone(), a2.id.clone()];
        want.sort();
        assert_eq!(cart1, want);
        assert_eq!(ids(ScratchFilter { format: Some("Traktor Scratch MK2".into()), ..Default::default() }), vec![b.id.clone()]);
        assert_eq!(ids(ScratchFilter { protocol_version: Some(2), ..Default::default() }), vec![b.id.clone()]);
        assert_eq!(ids(ScratchFilter { limit: Some(1), ..Default::default() }).len(), 1);
        assert_eq!(ids(ScratchFilter { limit: Some(0), ..Default::default() }).len(), 1, "limit is clamped to at least 1");
        assert!(ids(ScratchFilter { cartridge_asset_id: Some("cart-1' OR '1'='1".into()), ..Default::default() }).is_empty());
    }

    #[test]
    fn references_are_checked_and_cleaned_up() {
        let mut c = mem();
        for (field, msg) in [("session", "unknown session"), ("setup", "unknown setup"), ("cart", "unknown cartridge asset"), ("side", "unknown record side")] {
            let mut i = run(None);
            match field {
                "session" => i.session_id = Some("x".into()),
                "setup" => i.setup_id = Some("x".into()),
                "cart" => i.cartridge_asset_id = Some("x".into()),
                _ => i.record_side_id = Some("x".into()),
            }
            assert!(save(&mut c, &i).unwrap_err().contains(msg), "{field}");
        }
        let mut i = run(Some("cart-1"));
        i.session_id = Some("s1".into());
        let r = save(&mut c, &i).unwrap();
        c.execute("DELETE FROM session WHERE id = 's1'", []).unwrap();
        assert_eq!(get(&c, &r.id).unwrap().unwrap().run.session_id, None, "session delete nulls the link");
        let n: i64 = c.query_row("SELECT COUNT(*) FROM scratch_run", [], |x| x.get(0)).unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn validation_boundaries() {
        let mut c = mem();
        let ok = |f: &dyn Fn(&mut ScratchRunInput)| {
            let mut i = run(None);
            f(&mut i);
            validate(&i)
        };
        assert!(ok(&|_| {}).is_ok());
        assert!(ok(&|i| i.bpm = 30.0).is_ok());
        assert!(ok(&|i| i.bpm = 300.0).is_ok());
        for bad in [29.9, 300.1, f64::NAN] {
            assert!(ok(&|i| i.bpm = bad).is_err(), "bpm {bad}");
        }
        assert!(ok(&|i| i.score = Some(100.0)).is_ok());
        assert!(ok(&|i| i.score = Some(0.0)).is_ok());
        assert!(ok(&|i| i.score = Some(100.01)).is_err());
        assert!(ok(&|i| i.score = Some(-0.01)).is_err());
        assert!(ok(&|i| i.score = None).is_ok(), "aborted run before any pattern has no score");
        assert!(ok(&|i| i.protocol_version = 0).is_err());
        assert!(ok(&|i| i.format = "  ".into()).is_err());
        assert!(ok(&|i| i.format = "x".repeat(81)).is_err());
        assert!(ok(&|i| i.skips = Some(-1)).is_err());
        assert!(ok(&|i| i.tracking_force_g = Some(10.5)).is_err());
        assert!(ok(&|i| i.longest_loss_ms = Some(f64::INFINITY)).is_err());
        assert!(ok(&|i| i.tonearm_note = Some("é".repeat(500))).is_ok());
        assert!(ok(&|i| i.tonearm_note = Some("é".repeat(501))).is_err());
        assert!(ok(&|i| i.components = Some(json!([1, 2]))).unwrap_err().contains("object"));
        assert!(ok(&|i| i.components = Some(json!({"x": "y".repeat(MAX_COMPONENTS_BYTES)}))).is_err());
        assert!(ok(&|i| i.events[0].kind = "scratch".into()).unwrap_err().contains("kind"));
        assert!(ok(&|i| i.events[0].pattern = "Baby".into()).unwrap_err().contains("pattern"));
        assert!(ok(&|i| i.events[0].pattern = "baby; DROP TABLE".into()).is_err());
        assert!(ok(&|i| i.events[0].t_ms = -1.0).is_err());
        assert!(ok(&|i| i.events[0].t_ms = MAX_T_MS + 1.0).is_err());
        assert!(ok(&|i| i.events[0].duration_ms = None).is_ok());
        assert!(ok(&|i| i.events[0].detail = Some(json!("text"))).is_err());
        assert!(ok(&|i| i.events[0].detail = Some(json!({"x": "y".repeat(MAX_DETAIL_BYTES)}))).is_err());
        assert!(ok(&|i| i.events = (0..=MAX_EVENTS).map(|k| ev("reversal", k as f64)).collect()).is_err());
        // a rejected run writes nothing
        let mut bad = run(None);
        bad.events.push(ev("bogus", 1.0));
        assert!(save(&mut c, &bad).is_err());
        let n: i64 = c.query_row("SELECT COUNT(*) FROM scratch_run", [], |x| x.get(0)).unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn table_constraints_hold_below_the_api() {
        let mut c = mem();
        let r = save(&mut c, &run(None)).unwrap();
        let ins = |kind: &str, run_id: &str| {
            c.execute(
                "INSERT INTO scratch_event (id, run_id, pattern, kind, t_ms) VALUES (?1, ?2, 'baby', ?3, 1.0)",
                params![new_id(), run_id, kind],
            )
        };
        for k in EVENT_KINDS {
            assert!(ins(k, &r.id).is_ok(), "{k}");
        }
        assert!(ins("wobble", &r.id).is_err());
        assert!(ins("reversal", "missing-run").is_err(), "event needs its run");
    }

    #[test]
    fn contract_examples_round_trip() {
        let raw = std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/scratch.json")).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        let input: ScratchRunInput = serde_json::from_value(v["scratch_save"]["request"]["run"].clone()).unwrap();
        let mut c = mem();
        c.execute("INSERT INTO asset (id, nickname, created_at, updated_at) VALUES ('asset-cart-1','x','t','t')", []).unwrap();
        let mut got = serde_json::to_value(save(&mut c, &input).unwrap()).unwrap();
        let want = &v["scratch_save"]["response"];
        for k in ["id", "createdAt"] {
            assert!(got[k].is_string());
            got[k] = want[k].clone();
        }
        // JS writes 90 where serde writes 90.0: compare numbers by value
        fn norm(v: &Value) -> Value {
            match v {
                Value::Number(n) => json!(n.as_f64()),
                Value::Array(a) => Value::Array(a.iter().map(norm).collect()),
                Value::Object(o) => Value::Object(o.iter().map(|(k, x)| (k.clone(), norm(x))).collect()),
                x => x.clone(),
            }
        }
        assert_eq!(norm(&got), norm(want));
        let filter: ScratchFilter = serde_json::from_value(v["scratch_list"]["request"]["filter"].clone()).unwrap();
        assert_eq!(filter.cartridge_asset_id.as_deref(), Some("asset-cart-1"));
        assert_eq!(list(&c, &filter).unwrap().len(), 1);
        assert!(v["scratch_get"]["request"]["id"].is_string() && v["scratch_delete"]["request"]["id"].is_string());
        let id = got["id"].as_str().unwrap().to_string();
        let real_id = list(&c, &ScratchFilter::default()).unwrap()[0].id.clone();
        assert_ne!(id, "");
        let detail = serde_json::to_value(get(&c, &real_id).unwrap().unwrap()).unwrap();
        assert_eq!(detail["events"].as_array().unwrap().len(), 4);
        assert_eq!(detail["events"][0]["tMs"], 3333.3);
        assert!(detail["run"]["eventCount"] == 4);
    }
}
