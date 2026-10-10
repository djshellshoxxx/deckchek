//! Pre-gig check persistence and process facts (FS-10 §4-5, tables from `0008_pregig.sql`).
//! The checks themselves (rules, verdict, plan) live in `app/pre-gig.js`; Rust stores presets,
//! finished runs with their step results, and wraps the shared DJ process list. Every input is
//! validated (imported presets included) and all SQL is parameterised. Process facts are exe
//! names only, never command lines.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::db::{database_path, new_id, now_iso, open_database};

pub const VERDICTS: &[&str] = &["green", "amber", "red", "incomplete", "cancelled"];
pub const STEP_STATES: &[&str] = &["pass", "warn", "fail", "skipped", "unsupported", "error"];
pub const MAX_STEPS: usize = 64;
pub const MAX_PRESET_BYTES: usize = 256 * 1024;
pub const MAX_EVIDENCE_BYTES: usize = 64 * 1024;
pub const MAX_FIX_BYTES: usize = 16 * 1024;
pub const MAX_SUMMARY_CHARS: usize = 500;
pub const MAX_NOTES_CHARS: usize = 1000;
pub const MAX_NAME_CHARS: usize = 100;
pub const DEFAULT_LIST_LIMIT: u32 = 100;
pub const MAX_LIST_LIMIT: u32 = 1000;

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

// ---------------------------------------------------------------- processes

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PregigApp {
    pub app: String,
    pub running: bool,
    pub exe: String,
    pub pid: Option<u32>,
    /// Not available from `tasklist`; reserved so the shape does not change later.
    pub version: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PregigProcesses {
    pub supported: bool,
    pub apps: Vec<PregigApp>,
    pub scanned_at: String,
}

pub fn from_dj_processes(d: crate::processes::DjProcesses, scanned_at: String) -> PregigProcesses {
    PregigProcesses {
        supported: d.supported,
        apps: d.apps.into_iter().map(|a| PregigApp { app: a.app, running: a.running, exe: a.exe, pid: a.pid, version: None }).collect(),
        scanned_at,
    }
}

#[tauri::command]
pub async fn pregig_processes() -> Result<PregigProcesses, String> {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let dj = crate::processes::dj_processes().await?;
    Ok(from_dj_processes(dj, crate::system_check::iso_from_unix(secs)))
}

// ---------------------------------------------------------------- types

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepInput {
    pub step_id: String,
    pub deck: Option<String>,
    pub state: String,
    pub summary: String,
    pub evidence: Option<Value>,
    pub fix: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunInput {
    pub preset_id: Option<String>,
    pub session_id: Option<String>,
    pub venue_id: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub verdict: String,
    pub duration_ms: Option<i64>,
    pub app_version: String,
    pub notes: Option<String>,
    #[serde(default)]
    pub steps: Vec<StepInput>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct IdResult {
    pub id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSummary {
    pub id: String,
    pub preset_id: Option<String>,
    pub session_id: Option<String>,
    pub venue_id: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub verdict: String,
    pub duration_ms: Option<i64>,
    pub app_version: String,
    pub notes: Option<String>,
    pub step_count: i64,
    pub fail_count: i64,
    pub warn_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepResult {
    pub id: String,
    pub run_id: String,
    pub step_id: String,
    pub deck: Option<String>,
    pub state: String,
    pub summary: String,
    pub evidence: Value,
    pub fix: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunDetail {
    pub run: RunSummary,
    pub steps: Vec<StepResult>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetInput {
    pub id: Option<String>,
    pub name: String,
    pub setup_id: Option<String>,
    pub json: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub builtin: bool,
    pub setup_id: Option<String>,
    pub json: Value,
    pub created_at: String,
    pub updated_at: String,
}

// ---------------------------------------------------------------- validation

fn valid_step_id(s: &str) -> bool {
    let b = s.as_bytes();
    !b.is_empty() && b.len() <= 40 && b[0].is_ascii_lowercase() && b.iter().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-' | b':'))
}

fn json_len(name: &str, v: &Value, max: usize) -> Result<String, String> {
    let s = serde_json::to_string(v).map_err(|e| e.to_string())?;
    if s.len() > max {
        return Err(format!("{name} is limited to {max} bytes"));
    }
    Ok(s)
}

fn check_timestamp(name: &str, s: &str) -> Result<(), String> {
    // Shape check only: YYYY-MM-DDTHH:MM... (the JS side writes ISO-8601 UTC).
    let b = s.as_bytes();
    let ok = b.len() >= 16 && b.len() <= 40 && b[4] == b'-' && b[7] == b'-' && b[10] == b'T' && b[13] == b':' && b[..4].iter().all(u8::is_ascii_digit);
    if ok { Ok(()) } else { Err(format!("{name} must be an ISO-8601 timestamp")) }
}

pub fn validate_run(i: &RunInput) -> Result<(), String> {
    if !VERDICTS.contains(&i.verdict.as_str()) {
        return Err(format!("verdict must be one of {}", VERDICTS.join(", ")));
    }
    check_timestamp("startedAt", &i.started_at)?;
    if let Some(f) = &i.finished_at {
        check_timestamp("finishedAt", f)?;
    }
    if i.duration_ms.map_or(false, |d| !(0..=86_400_000).contains(&d)) {
        return Err("durationMs must be between 0 and 86400000".into());
    }
    let v = i.app_version.trim();
    if v.is_empty() || v.chars().count() > 40 {
        return Err("appVersion must be 1 to 40 characters".into());
    }
    if i.notes.as_ref().map_or(false, |n| n.chars().count() > MAX_NOTES_CHARS) {
        return Err(format!("notes are limited to {MAX_NOTES_CHARS} characters"));
    }
    if i.steps.len() > MAX_STEPS {
        return Err(format!("a pre-gig run holds at most {MAX_STEPS} steps"));
    }
    for (n, s) in i.steps.iter().enumerate() {
        if !valid_step_id(&s.step_id) {
            return Err(format!("step {n}: stepId must match [a-z][A-Za-z0-9_:-]{{0,39}}"));
        }
        if !STEP_STATES.contains(&s.state.as_str()) {
            return Err(format!("step {n}: state must be one of {}", STEP_STATES.join(", ")));
        }
        if s.deck.as_ref().map_or(false, |d| d.is_empty() || d.chars().count() > 8) {
            return Err(format!("step {n}: deck must be 1 to 8 characters"));
        }
        if s.summary.trim().is_empty() || s.summary.chars().count() > MAX_SUMMARY_CHARS {
            return Err(format!("step {n}: summary must be 1 to {MAX_SUMMARY_CHARS} characters"));
        }
        match &s.evidence {
            None | Some(Value::Null) => {}
            Some(v @ Value::Object(_)) => {
                json_len(&format!("step {n}: evidence"), v, MAX_EVIDENCE_BYTES)?;
            }
            Some(_) => return Err(format!("step {n}: evidence must be a JSON object")),
        }
        match &s.fix {
            None | Some(Value::Null) => {}
            Some(v @ Value::Array(_)) => {
                json_len(&format!("step {n}: fix"), v, MAX_FIX_BYTES)?;
            }
            Some(_) => return Err(format!("step {n}: fix must be a JSON array")),
        }
    }
    Ok(())
}

pub fn validate_preset(i: &PresetInput) -> Result<(), String> {
    let name = i.name.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME_CHARS {
        return Err(format!("name must be 1 to {MAX_NAME_CHARS} characters"));
    }
    if !i.json.is_object() {
        return Err("preset json must be an object".into());
    }
    if !i.json.get("v").map_or(false, |v| v.is_u64()) {
        return Err("preset json needs an integer version field 'v'".into());
    }
    json_len("preset json", &i.json, MAX_PRESET_BYTES)?;
    Ok(())
}

fn exists(conn: &Connection, table: &str, id: &str) -> Result<bool, String> {
    // `table` is one of the fixed names below, never user input.
    conn.query_row(&format!("SELECT 1 FROM {table} WHERE id = ?1"), [id], |r| r.get::<_, i64>(0)).optional().map(|o| o.is_some()).map_err(e2s)
}

// ---------------------------------------------------------------- runs

/// Validate and store a run with its step results in one transaction.
pub fn save_run(conn: &mut Connection, input: &RunInput) -> Result<IdResult, String> {
    validate_run(input)?;
    for (table, label, id) in [("pregig_preset", "preset", &input.preset_id), ("session", "session", &input.session_id), ("venue", "venue", &input.venue_id)] {
        if let Some(id) = id {
            if !exists(conn, table, id)? {
                return Err(format!("unknown {label} '{id}'"));
            }
        }
    }
    let id = new_id();
    let notes = input.notes.as_ref().map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let tx = conn.transaction().map_err(e2s)?;
    tx.execute(
        "INSERT INTO pregig_run (id, preset_id, session_id, started_at, finished_at, verdict, duration_ms, app_version, venue_id, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![id, input.preset_id, input.session_id, input.started_at, input.finished_at, input.verdict, input.duration_ms, input.app_version.trim(), input.venue_id, notes],
    )
    .map_err(e2s)?;
    {
        let mut stmt = tx
            .prepare("INSERT INTO pregig_step_result (id, run_id, step_id, deck, state, summary, evidence_json, fix_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
            .map_err(e2s)?;
        for s in &input.steps {
            let evidence = match &s.evidence {
                Some(v @ Value::Object(_)) => json_len("evidence", v, MAX_EVIDENCE_BYTES)?,
                _ => "{}".to_string(),
            };
            let fix = match &s.fix {
                Some(v @ Value::Array(_)) => json_len("fix", v, MAX_FIX_BYTES)?,
                _ => "[]".to_string(),
            };
            stmt.execute(params![new_id(), id, s.step_id, s.deck, s.state, s.summary.trim(), evidence, fix]).map_err(e2s)?;
        }
    }
    tx.commit().map_err(e2s)?;
    Ok(IdResult { id })
}

const RUN_COLS: &str = "r.id, r.preset_id, r.session_id, r.venue_id, r.started_at, r.finished_at, r.verdict, r.duration_ms, r.app_version, r.notes, \
    (SELECT COUNT(*) FROM pregig_step_result s WHERE s.run_id = r.id), \
    (SELECT COUNT(*) FROM pregig_step_result s WHERE s.run_id = r.id AND s.state IN ('fail', 'error')), \
    (SELECT COUNT(*) FROM pregig_step_result s WHERE s.run_id = r.id AND s.state = 'warn')";

fn run_row(r: &rusqlite::Row) -> rusqlite::Result<RunSummary> {
    Ok(RunSummary {
        id: r.get(0)?,
        preset_id: r.get(1)?,
        session_id: r.get(2)?,
        venue_id: r.get(3)?,
        started_at: r.get(4)?,
        finished_at: r.get(5)?,
        verdict: r.get(6)?,
        duration_ms: r.get(7)?,
        app_version: r.get(8)?,
        notes: r.get(9)?,
        step_count: r.get(10)?,
        fail_count: r.get(11)?,
        warn_count: r.get(12)?,
    })
}

/// Runs newest first, optionally only those of one preset; steps are not included.
pub fn list_runs(conn: &Connection, preset_id: Option<&str>, limit: Option<u32>) -> Result<Vec<RunSummary>, String> {
    let limit = limit.unwrap_or(DEFAULT_LIST_LIMIT).clamp(1, MAX_LIST_LIMIT);
    let mut stmt = conn
        .prepare(&format!("SELECT {RUN_COLS} FROM pregig_run r WHERE (?1 IS NULL OR r.preset_id = ?1) ORDER BY r.started_at DESC, r.id DESC LIMIT ?2"))
        .map_err(e2s)?;
    let rows = stmt.query_map(params![preset_id, limit], run_row).map_err(e2s)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)
}

pub fn get_run(conn: &Connection, id: &str) -> Result<Option<RunDetail>, String> {
    let Some(run) = conn.query_row(&format!("SELECT {RUN_COLS} FROM pregig_run r WHERE r.id = ?1"), [id], run_row).optional().map_err(e2s)? else {
        return Ok(None);
    };
    let mut stmt = conn
        .prepare("SELECT id, run_id, step_id, deck, state, summary, evidence_json, fix_json FROM pregig_step_result WHERE run_id = ?1 ORDER BY rowid")
        .map_err(e2s)?;
    let steps = stmt
        .query_map([id], |r| {
            let evidence: String = r.get(6)?;
            let fix: String = r.get(7)?;
            Ok(StepResult {
                id: r.get(0)?,
                run_id: r.get(1)?,
                step_id: r.get(2)?,
                deck: r.get(3)?,
                state: r.get(4)?,
                summary: r.get(5)?,
                evidence: serde_json::from_str(&evidence).unwrap_or(Value::Object(Default::default())),
                fix: serde_json::from_str(&fix).unwrap_or(Value::Array(Vec::new())),
            })
        })
        .map_err(e2s)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e2s)?;
    Ok(Some(RunDetail { run, steps }))
}

// ---------------------------------------------------------------- presets

fn preset_row(r: &rusqlite::Row) -> rusqlite::Result<Preset> {
    let json: String = r.get(4)?;
    Ok(Preset {
        id: r.get(0)?,
        name: r.get(1)?,
        builtin: r.get::<_, i64>(2)? != 0,
        setup_id: r.get(3)?,
        json: serde_json::from_str(&json).unwrap_or(Value::Null),
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

const PRESET_COLS: &str = "id, name, builtin, setup_id, json, created_at, updated_at";

fn get_preset(conn: &Connection, id: &str) -> Result<Option<Preset>, String> {
    conn.query_row(&format!("SELECT {PRESET_COLS} FROM pregig_preset WHERE id = ?1"), [id], preset_row).optional().map_err(e2s)
}

/// Insert a new user preset, or update an existing one in place (keeps its id and created_at).
/// Built-in presets ship in `app/pregig-presets.json` and are never rows the user can overwrite.
pub fn preset_upsert(conn: &Connection, input: &PresetInput) -> Result<Preset, String> {
    validate_preset(input)?;
    if let Some(s) = &input.setup_id {
        if !exists(conn, "setup", s)? {
            return Err(format!("unknown setup '{s}'"));
        }
    }
    let json = json_len("preset json", &input.json, MAX_PRESET_BYTES)?;
    let now = now_iso(conn)?;
    let name = input.name.trim();
    let id = match &input.id {
        Some(id) => {
            let existing = get_preset(conn, id)?;
            match existing {
                Some(p) if p.builtin => return Err("built-in presets cannot be changed; duplicate it instead".into()),
                Some(_) => {
                    conn.execute("UPDATE pregig_preset SET name = ?2, setup_id = ?3, json = ?4, updated_at = ?5 WHERE id = ?1", params![id, name, input.setup_id, json, now]).map_err(e2s)?;
                }
                None => {
                    conn.execute(
                        "INSERT INTO pregig_preset (id, name, builtin, setup_id, json, created_at, updated_at) VALUES (?1, ?2, 0, ?3, ?4, ?5, ?5)",
                        params![id, name, input.setup_id, json, now],
                    )
                    .map_err(e2s)?;
                }
            }
            id.clone()
        }
        None => {
            let id = new_id();
            conn.execute(
                "INSERT INTO pregig_preset (id, name, builtin, setup_id, json, created_at, updated_at) VALUES (?1, ?2, 0, ?3, ?4, ?5, ?5)",
                params![id, name, input.setup_id, json, now],
            )
            .map_err(e2s)?;
            id
        }
    };
    get_preset(conn, &id)?.ok_or_else(|| "preset vanished after save".to_string())
}

pub fn preset_list(conn: &Connection) -> Result<Vec<Preset>, String> {
    let mut stmt = conn.prepare(&format!("SELECT {PRESET_COLS} FROM pregig_preset ORDER BY name COLLATE NOCASE, id")).map_err(e2s)?;
    let rows = stmt.query_map([], preset_row).map_err(e2s)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)
}

/// Returns whether a preset was removed; its runs stay (preset_id becomes NULL).
pub fn preset_delete(conn: &Connection, id: &str) -> Result<bool, String> {
    conn.execute("DELETE FROM pregig_preset WHERE id = ?1 AND builtin = 0", [id]).map(|n| n > 0).map_err(e2s)
}

#[tauri::command]
pub fn pregig_save_run(app: AppHandle, run: RunInput) -> Result<IdResult, String> {
    let mut conn = open_database(&database_path(&app)?)?;
    save_run(&mut conn, &run)
}

#[tauri::command]
pub fn pregig_list_runs(app: AppHandle, preset_id: Option<String>, limit: Option<u32>) -> Result<Vec<RunSummary>, String> {
    let conn = open_database(&database_path(&app)?)?;
    list_runs(&conn, preset_id.as_deref(), limit)
}

#[tauri::command]
pub fn pregig_get_run(app: AppHandle, id: String) -> Result<Option<RunDetail>, String> {
    let conn = open_database(&database_path(&app)?)?;
    get_run(&conn, &id)
}

#[tauri::command]
pub fn pregig_preset_upsert(app: AppHandle, preset: PresetInput) -> Result<Preset, String> {
    let conn = open_database(&database_path(&app)?)?;
    preset_upsert(&conn, &preset)
}

#[tauri::command]
pub fn pregig_preset_list(app: AppHandle) -> Result<Vec<Preset>, String> {
    let conn = open_database(&database_path(&app)?)?;
    preset_list(&conn)
}

#[tauri::command]
pub fn pregig_preset_delete(app: AppHandle, id: String) -> Result<bool, String> {
    let conn = open_database(&database_path(&app)?)?;
    preset_delete(&conn, &id)
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
            "INSERT INTO setup (id, name, created_at) VALUES ('setup-1','Booth','t');
             INSERT INTO session (id, session_type, started_at, app_version, schema_version, status) VALUES ('s1','pregig','t','0',1,'complete');
             INSERT INTO venue (id, name, created_at, updated_at) VALUES ('v1','Club','t','t');",
        )
        .unwrap_or_else(|e| panic!("fixture rows: {e}"));
        c
    }

    fn preset_in(name: &str) -> PresetInput {
        PresetInput { id: None, name: name.into(), setup_id: None, json: json!({"v": 1, "name": name, "decks": []}) }
    }

    fn step(id: &str, state: &str) -> StepInput {
        StepInput { step_id: id.into(), deck: None, state: state.into(), summary: "ok".into(), evidence: Some(json!({"snrDb": 31.5})), fix: Some(json!([{"label": "Clean stylus"}])) }
    }

    fn run_in(preset: Option<&str>, started: &str) -> RunInput {
        RunInput {
            preset_id: preset.map(String::from),
            session_id: None,
            venue_id: None,
            started_at: started.into(),
            finished_at: Some("2026-10-10T18:02:00.000Z".into()),
            verdict: "amber".into(),
            duration_ms: Some(71_000),
            app_version: "0.0.6".into(),
            notes: None,
            steps: vec![step("audio", "pass"), step("timecode:A", "warn"), step("signal:A", "fail"), step("midi", "skipped")],
        }
    }

    #[test]
    fn migration_creates_tables_and_is_rerunnable() {
        let c = mem();
        apply_migrations(&c).unwrap();
        for t in ["pregig_preset", "pregig_run", "pregig_step_result"] {
            let n: i64 = c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1", [t], |r| r.get(0)).unwrap();
            assert_eq!(n, 1, "{t}");
        }
    }

    #[test]
    fn run_save_list_get_round_trip() {
        let mut c = mem();
        let p = preset_upsert(&c, &preset_in("Rig A")).unwrap();
        let a = save_run(&mut c, &run_in(Some(&p.id), "2026-10-10T18:00:00.000Z")).unwrap();
        let b = save_run(&mut c, &run_in(None, "2026-10-11T18:00:00.000Z")).unwrap();
        let all = list_runs(&c, None, None).unwrap();
        assert_eq!(all.iter().map(|r| r.id.as_str()).collect::<Vec<_>>(), [b.id.as_str(), a.id.as_str()], "newest first");
        assert_eq!((all[1].step_count, all[1].fail_count, all[1].warn_count), (4, 1, 1));
        let only = list_runs(&c, Some(&p.id), Some(5)).unwrap();
        assert_eq!(only.len(), 1);
        assert_eq!(only[0].id, a.id);
        let d = get_run(&c, &a.id).unwrap().unwrap();
        assert_eq!(d.steps.iter().map(|s| s.step_id.as_str()).collect::<Vec<_>>(), ["audio", "timecode:A", "signal:A", "midi"], "insertion order");
        assert_eq!(d.steps[0].evidence, json!({"snrDb": 31.5}));
        assert_eq!(d.steps[0].fix, json!([{"label": "Clean stylus"}]));
        assert!(get_run(&c, "nope").unwrap().is_none());
        assert_eq!(list_runs(&c, None, Some(0)).unwrap().len(), 1, "limit clamps to at least 1 and is not an error");
    }

    #[test]
    fn references_are_checked_and_cleaned_up() {
        let mut c = mem();
        let mut bad = run_in(Some("missing"), "2026-10-10T18:00:00.000Z");
        assert!(save_run(&mut c, &bad).unwrap_err().contains("preset"));
        bad.preset_id = None;
        bad.session_id = Some("nope".into());
        assert!(save_run(&mut c, &bad).unwrap_err().contains("session"));
        bad.session_id = None;
        bad.venue_id = Some("nope".into());
        assert!(save_run(&mut c, &bad).unwrap_err().contains("venue"));
        let p = preset_upsert(&c, &preset_in("Rig A")).unwrap();
        let mut ok = run_in(Some(&p.id), "2026-10-10T18:00:00.000Z");
        ok.session_id = Some("s1".into());
        ok.venue_id = Some("v1".into());
        let r = save_run(&mut c, &ok).unwrap();
        assert!(preset_delete(&c, &p.id).unwrap());
        c.execute("DELETE FROM session WHERE id = 's1'", []).unwrap();
        let d = get_run(&c, &r.id).unwrap().unwrap();
        assert_eq!((d.run.preset_id, d.run.session_id), (None, None), "runs outlive their preset and session");
        c.execute("DELETE FROM pregig_run WHERE id = ?1", [&r.id]).unwrap();
        let n: i64 = c.query_row("SELECT COUNT(*) FROM pregig_step_result", [], |x| x.get(0)).unwrap();
        assert_eq!(n, 0, "step results cascade with the run");
    }

    #[test]
    fn run_validation_boundaries() {
        let ok = |f: &dyn Fn(&mut RunInput)| {
            let mut i = run_in(None, "2026-10-10T18:00:00.000Z");
            f(&mut i);
            validate_run(&i)
        };
        assert!(ok(&|_| {}).is_ok());
        for v in VERDICTS {
            assert!(ok(&|i| i.verdict = v.to_string()).is_ok(), "{v}");
        }
        assert!(ok(&|i| i.verdict = "yellow".into()).is_err());
        assert!(ok(&|i| i.started_at = "yesterday".into()).is_err());
        assert!(ok(&|i| i.finished_at = Some("2026".into())).is_err());
        assert!(ok(&|i| i.duration_ms = Some(-1)).is_err());
        assert!(ok(&|i| i.duration_ms = Some(86_400_001)).is_err());
        assert!(ok(&|i| i.app_version = " ".into()).is_err());
        assert!(ok(&|i| i.notes = Some("x".repeat(1001))).is_err());
        assert!(ok(&|i| i.steps = (0..=MAX_STEPS).map(|k| step(&format!("s{k}"), "pass")).collect()).is_err());
        assert!(ok(&|i| i.steps[0].step_id = "Audio".into()).unwrap_err().contains("stepId"));
        assert!(ok(&|i| i.steps[0].step_id = "a'; DROP TABLE x".into()).is_err());
        for s in STEP_STATES {
            assert!(ok(&|i| i.steps[0].state = s.to_string()).is_ok(), "{s}");
        }
        assert!(ok(&|i| i.steps[0].state = "green".into()).unwrap_err().contains("state"));
        assert!(ok(&|i| i.steps[0].summary = "  ".into()).is_err());
        assert!(ok(&|i| i.steps[0].summary = "x".repeat(501)).is_err());
        assert!(ok(&|i| i.steps[0].evidence = Some(json!([1]))).is_err());
        assert!(ok(&|i| i.steps[0].evidence = Some(json!({"x": "y".repeat(MAX_EVIDENCE_BYTES)}))).is_err());
        assert!(ok(&|i| i.steps[0].fix = Some(json!({"a": 1}))).is_err());
        assert!(ok(&|i| i.steps[0].fix = Some(json!(["y".repeat(MAX_FIX_BYTES)]))).is_err());
        assert!(ok(&|i| i.steps[0].deck = Some(String::new())).is_err());
        let mut c = mem();
        let mut bad = run_in(None, "2026-10-10T18:00:00.000Z");
        bad.steps[3].state = "bogus".into();
        assert!(save_run(&mut c, &bad).is_err());
        let n: i64 = c.query_row("SELECT COUNT(*) FROM pregig_run", [], |x| x.get(0)).unwrap();
        assert_eq!(n, 0, "a rejected run writes nothing");
    }

    #[test]
    fn table_constraints_hold_below_the_api() {
        let mut c = mem();
        let r = save_run(&mut c, &run_in(None, "2026-10-10T18:00:00.000Z")).unwrap();
        assert!(c.execute("UPDATE pregig_run SET verdict = 'purple' WHERE id = ?1", [&r.id]).is_err());
        assert!(c.execute("INSERT INTO pregig_step_result (id, run_id, step_id, state, summary) VALUES ('x', ?1, 'a', 'maybe', 's')", [&r.id]).is_err());
        assert!(c.execute("INSERT INTO pregig_step_result (id, run_id, step_id, state, summary) VALUES ('y', 'missing', 'a', 'pass', 's')", []).is_err());
    }

    #[test]
    fn preset_crud_and_builtin_protection() {
        let c = mem();
        let a = preset_upsert(&c, &preset_in("zeta rig")).unwrap();
        let b = preset_upsert(&c, &preset_in("Alpha rig")).unwrap();
        assert!(!a.builtin);
        assert_eq!(preset_list(&c).unwrap().iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), ["Alpha rig", "zeta rig"], "case-insensitive name order");
        let mut edit = preset_in("Alpha renamed");
        edit.id = Some(b.id.clone());
        edit.setup_id = Some("setup-1".into());
        let e = preset_upsert(&c, &edit).unwrap();
        assert_eq!((e.id.as_str(), e.name.as_str(), e.setup_id.as_deref(), e.created_at.as_str()), (b.id.as_str(), "Alpha renamed", Some("setup-1"), b.created_at.as_str()));
        // import with a caller-chosen id creates it
        let mut imp = preset_in("Imported");
        imp.id = Some("user-chosen".into());
        assert_eq!(preset_upsert(&c, &imp).unwrap().id, "user-chosen");
        // builtin rows cannot be overwritten or deleted
        c.execute("INSERT INTO pregig_preset (id, name, builtin, json, created_at, updated_at) VALUES ('bi', 'Builtin', 1, '{\"v\":1}', 't', 't')", []).unwrap();
        let mut over = preset_in("Hijack");
        over.id = Some("bi".into());
        assert!(preset_upsert(&c, &over).unwrap_err().contains("built-in"));
        assert!(!preset_delete(&c, "bi").unwrap());
        assert!(preset_delete(&c, &a.id).unwrap());
        assert!(!preset_delete(&c, &a.id).unwrap());
        edit.setup_id = Some("nope".into());
        assert!(preset_upsert(&c, &edit).unwrap_err().contains("setup"));
    }

    #[test]
    fn preset_validation_boundaries() {
        let ok = |f: &dyn Fn(&mut PresetInput)| {
            let mut i = preset_in("Rig");
            f(&mut i);
            validate_preset(&i)
        };
        assert!(ok(&|_| {}).is_ok());
        assert!(ok(&|i| i.name = " ".into()).is_err());
        assert!(ok(&|i| i.name = "x".repeat(101)).is_err());
        assert!(ok(&|i| i.name = "é".repeat(100)).is_ok());
        assert!(ok(&|i| i.json = json!([1])).is_err());
        assert!(ok(&|i| i.json = json!({"name": "no version"})).is_err());
        assert!(ok(&|i| i.json = json!({"v": "1"})).is_err());
        assert!(ok(&|i| i.json = json!({"v": 1, "pad": "x".repeat(MAX_PRESET_BYTES)})).unwrap_err().contains("limited"));
        assert!(ok(&|i| i.json = json!({"v": 99, "future": true})).is_ok(), "unknown higher versions are stored; JS shows them read-only");
    }

    #[test]
    fn processes_wrapper_keeps_exe_names_only() {
        use crate::processes::{DjApp, DjProcesses};
        let got = from_dj_processes(
            DjProcesses {
                supported: true,
                apps: vec![
                    DjApp { app: "Serato DJ Pro".into(), exe: "Serato DJ Pro.exe".into(), pid: Some(4242), running: true },
                    DjApp { app: "Traktor Pro".into(), exe: "Traktor.exe".into(), pid: None, running: false },
                ],
            },
            "2026-10-10T18:00:00Z".into(),
        );
        assert_eq!(got.apps.len(), 2);
        assert_eq!((got.apps[0].running, got.apps[0].pid, got.apps[0].version.clone()), (true, Some(4242), None));
        let off = from_dj_processes(DjProcesses { supported: false, apps: vec![] }, "t".into());
        assert!(!off.supported && off.apps.is_empty());
    }

    #[test]
    fn contract_examples_round_trip() {
        let raw = std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/pregig.json")).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        let mut c = mem();
        let preset_in: PresetInput = serde_json::from_value(v["pregig_preset_upsert"]["request"]["preset"].clone()).unwrap();
        let mut got = serde_json::to_value(preset_upsert(&c, &preset_in).unwrap()).unwrap();
        let want = &v["pregig_preset_upsert"]["response"];
        for k in ["createdAt", "updatedAt"] {
            assert!(got[k].is_string());
            got[k] = want[k].clone();
        }
        assert_eq!(&got, want);
        let run: RunInput = serde_json::from_value(v["pregig_save_run"]["request"]["run"].clone()).unwrap();
        let saved = save_run(&mut c, &run).unwrap();
        assert_eq!(serde_json::to_value(&saved).unwrap().as_object().unwrap().keys().collect::<Vec<_>>(), ["id"]);
        let mut list = serde_json::to_value(list_runs(&c, Some("preset-contract"), Some(10)).unwrap()).unwrap();
        list[0]["id"] = v["pregig_list_runs"]["response"][0]["id"].clone();
        assert_eq!(list, v["pregig_list_runs"]["response"]);
        let mut detail = serde_json::to_value(get_run(&c, &saved.id).unwrap().unwrap()).unwrap();
        detail["run"]["id"] = v["pregig_get_run"]["response"]["run"]["id"].clone();
        for s in detail["steps"].as_array_mut().unwrap() {
            s["id"] = Value::String("step-id".into());
            s["runId"] = v["pregig_get_run"]["response"]["run"]["id"].clone();
        }
        assert_eq!(detail, v["pregig_get_run"]["response"]);
        let procs = from_dj_processes(
            crate::processes::DjProcesses {
                supported: true,
                apps: vec![
                    crate::processes::DjApp { app: "Traktor Pro".into(), exe: "Traktor.exe".into(), pid: Some(4242), running: true },
                    crate::processes::DjApp { app: "Serato DJ Pro".into(), exe: "Serato DJ Pro.exe".into(), pid: None, running: false },
                ],
            },
            "2026-10-10T18:00:00Z".into(),
        );
        assert_eq!(serde_json::to_value(&procs).unwrap(), v["pregig_processes"]["response"]);
    }
}
