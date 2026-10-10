//! Booth hum hunter and feedback step records (FS-15 §5, AC-7; tables from
//! `0012_hum_feedback.sql`). One `hum_run` per hum isolation or feedback test,
//! linked to a venue and/or session so it appears in the venue report, and one
//! `hum_step` per measured or skipped step. The measuring, decision tree and
//! howl detection live in `app/hum-tree.js` and `app/feedback.js`; output
//! playback goes through `audio_out.rs`. This module only validates and stores.
//! All SQL is parameterised.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::audio_out::{ABS_MAX_DBFS, SILENCE_DBFS};
use crate::db::{database_path, new_id, now_iso, open_database};

pub const KINDS: &[&str] = &["hum", "feedback"];
pub const MAX_STEPS: usize = 64;
pub const MAX_CAUSES: usize = 32;
pub const MAX_CAUSES_BYTES: usize = 64 * 1024;
pub const MAX_HARMONICS: usize = 32;
pub const MAX_HARMONICS_BYTES: usize = 16 * 1024;
pub const MAX_LABEL_CHARS: usize = 200;
pub const MAX_NOTE_CHARS: usize = 500;
pub const MAX_VERDICT_CHARS: usize = 1000;
pub const DEFAULT_LIST_LIMIT: u32 = 50;
pub const MAX_LIST_LIMIT: u32 = 500;
/// Plausible range for any stored level in dBFS (measured floors can be very low).
const LEVEL_RANGE: (f64, f64) = (-400.0, 40.0);

#[derive(Debug, Clone, PartialEq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HumStepInput {
    pub step_id: String,
    pub label: String,
    pub fundamental_dbfs: Option<f64>,
    pub harmonics: Option<Value>,
    pub total_dbfs: Option<f64>,
    pub floor_dbfs: Option<f64>,
    pub delta_db: Option<f64>,
    /// DeckChek output level of a feedback step (never above the absolute cap).
    pub level_dbfs: Option<f64>,
    pub peak_hz: Option<f64>,
    pub growth_db_per_s: Option<f64>,
    pub onset: Option<bool>,
    pub skipped: Option<bool>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HumRunInput {
    pub session_id: Option<String>,
    pub venue_id: Option<String>,
    pub setup_id: Option<String>,
    pub kind: String,
    pub mains_hz: Option<i64>,
    pub verdict: Option<String>,
    pub causes: Option<Value>,
    pub steps: Vec<HumStepInput>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HumStep {
    pub idx: i64,
    pub step_id: String,
    pub label: String,
    pub fundamental_dbfs: Option<f64>,
    pub harmonics: Value,
    pub total_dbfs: Option<f64>,
    pub floor_dbfs: Option<f64>,
    pub delta_db: Option<f64>,
    pub level_dbfs: Option<f64>,
    pub peak_hz: Option<f64>,
    pub growth_db_per_s: Option<f64>,
    pub onset: bool,
    pub skipped: bool,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HumRun {
    pub id: String,
    pub session_id: Option<String>,
    pub venue_id: Option<String>,
    pub setup_id: Option<String>,
    pub kind: String,
    pub mains_hz: Option<i64>,
    pub verdict: Option<String>,
    pub causes: Value,
    pub created_at: String,
    pub steps: Vec<HumStep>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HumRunSummary {
    pub id: String,
    pub session_id: Option<String>,
    pub venue_id: Option<String>,
    pub setup_id: Option<String>,
    pub kind: String,
    pub mains_hz: Option<i64>,
    pub verdict: Option<String>,
    pub created_at: String,
    pub step_count: i64,
    pub onset: bool,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HumRunFilter {
    pub venue_id: Option<String>,
    pub session_id: Option<String>,
    pub kind: Option<String>,
    pub limit: Option<u32>,
}

fn invalid(msg: impl std::fmt::Display) -> String {
    format!("HUMRUN_INVALID: {msg}")
}

fn db_err(e: rusqlite::Error) -> String {
    format!("HUMRUN_DB: {e}")
}

/// Step ids are code identifiers from `HUM_STEPS` or generated feedback ids (`level_9`).
pub fn valid_step_id(s: &str) -> bool {
    let b = s.as_bytes();
    !b.is_empty() && b.len() <= 40 && b[0].is_ascii_lowercase() && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'_')
}

fn check_text(name: &str, v: &Option<String>, max: usize) -> Result<(), String> {
    match v {
        Some(t) if t.chars().count() > max => Err(invalid(format!("{name} is limited to {max} characters"))),
        _ => Ok(()),
    }
}

fn check_num(name: &str, v: Option<f64>, lo: f64, hi: f64) -> Result<(), String> {
    match v {
        Some(x) if !x.is_finite() || x < lo || x > hi => Err(invalid(format!("{name} must be a finite number between {lo} and {hi}"))),
        _ => Ok(()),
    }
}

fn check_json_array(name: &str, v: &Option<Value>, max_items: usize, max_bytes: usize) -> Result<String, String> {
    let Some(v) = v else { return Ok("[]".into()) };
    if v.is_null() {
        return Ok("[]".into());
    }
    let arr = v.as_array().ok_or_else(|| invalid(format!("{name} must be an array")))?;
    if arr.len() > max_items {
        return Err(invalid(format!("{name} is limited to {max_items} entries")));
    }
    let text = serde_json::to_string(v).map_err(|e| invalid(e))?;
    if text.len() > max_bytes {
        return Err(invalid(format!("{name} is limited to {max_bytes} bytes")));
    }
    Ok(text)
}

fn clean(v: &Option<String>) -> Option<String> {
    v.as_ref().map(|t| t.trim().to_string()).filter(|t| !t.is_empty())
}

pub fn validate_step(kind: &str, s: &HumStepInput) -> Result<(), String> {
    if !valid_step_id(&s.step_id) {
        return Err(invalid(format!("stepId '{}' must match ^[a-z][a-z0-9_]{{0,39}}$", s.step_id)));
    }
    if s.label.trim().is_empty() {
        return Err(invalid(format!("step '{}' needs a label", s.step_id)));
    }
    check_text("label", &Some(s.label.clone()), MAX_LABEL_CHARS)?;
    check_text("note", &s.note, MAX_NOTE_CHARS)?;
    let (lo, hi) = LEVEL_RANGE;
    check_num("fundamentalDbfs", s.fundamental_dbfs, lo, hi)?;
    check_num("totalDbfs", s.total_dbfs, lo, hi)?;
    check_num("floorDbfs", s.floor_dbfs, lo, hi)?;
    check_num("deltaDb", s.delta_db, -400.0, 400.0)?;
    // A recorded output level above the absolute cap can only come from a bug: refuse it.
    check_num("levelDbfs", s.level_dbfs, SILENCE_DBFS as f64, ABS_MAX_DBFS as f64)?;
    check_num("peakHz", s.peak_hz, 0.0, 100_000.0)?;
    check_num("growthDbPerS", s.growth_db_per_s, -1000.0, 1000.0)?;
    check_json_array("harmonics", &s.harmonics, MAX_HARMONICS, MAX_HARMONICS_BYTES)?;
    if kind != "feedback" && (s.onset == Some(true) || s.level_dbfs.is_some()) {
        return Err(invalid("onset and levelDbfs belong to feedback runs only"));
    }
    Ok(())
}

pub fn validate(input: &HumRunInput) -> Result<(), String> {
    if !KINDS.contains(&input.kind.as_str()) {
        return Err(invalid(format!("kind must be one of {}", KINDS.join(", "))));
    }
    if let Some(m) = input.mains_hz {
        if m != 50 && m != 60 {
            return Err(invalid("mainsHz must be 50 or 60"));
        }
    }
    check_text("verdict", &input.verdict, MAX_VERDICT_CHARS)?;
    check_json_array("causes", &input.causes, MAX_CAUSES, MAX_CAUSES_BYTES)?;
    if input.steps.is_empty() {
        return Err(invalid("a run needs at least one step"));
    }
    if input.steps.len() > MAX_STEPS {
        return Err(invalid(format!("a run is limited to {MAX_STEPS} steps")));
    }
    for s in &input.steps {
        validate_step(&input.kind, s)?;
    }
    Ok(())
}

fn exists(conn: &Connection, table: &str, id: &str) -> Result<bool, String> {
    // `table` is one of three literals below, never user input.
    conn.query_row(&format!("SELECT 1 FROM {table} WHERE id = ?1"), [id], |_| Ok(()))
        .optional()
        .map(|o| o.is_some())
        .map_err(db_err)
}

fn parse_json(text: String) -> Value {
    serde_json::from_str(&text).unwrap_or_else(|_| Value::Array(vec![]))
}

pub fn save(conn: &Connection, input: &HumRunInput) -> Result<HumRun, String> {
    validate(input)?;
    let (session_id, venue_id, setup_id) = (clean(&input.session_id), clean(&input.venue_id), clean(&input.setup_id));
    for (table, id) in [("session", &session_id), ("venue", &venue_id), ("setup", &setup_id)] {
        if let Some(id) = id {
            if !exists(conn, table, id)? {
                return Err(format!("HUMRUN_NOT_FOUND: unknown {table} '{id}'"));
            }
        }
    }
    let causes = check_json_array("causes", &input.causes, MAX_CAUSES, MAX_CAUSES_BYTES)?;
    let id = new_id();
    let now = now_iso(conn)?;
    let tx = conn.unchecked_transaction().map_err(db_err)?;
    tx.execute(
        "INSERT INTO hum_run (id, session_id, venue_id, setup_id, kind, mains_hz, verdict, causes_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, session_id, venue_id, setup_id, input.kind, input.mains_hz, clean(&input.verdict), causes, now],
    )
    .map_err(db_err)?;
    for (idx, s) in input.steps.iter().enumerate() {
        let skipped = s.skipped.unwrap_or(false);
        // A skipped step carries no measurement, whatever the caller sent.
        let m = |v: Option<f64>| if skipped { None } else { v };
        let harmonics = if skipped { "[]".to_string() } else { check_json_array("harmonics", &s.harmonics, MAX_HARMONICS, MAX_HARMONICS_BYTES)? };
        tx.execute(
            "INSERT INTO hum_step (id, run_id, idx, step_id, label, fundamental_dbfs, harmonics_json, total_dbfs, floor_dbfs,
               delta_db, level_dbfs, peak_hz, growth_db_per_s, onset, skipped, note)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                new_id(),
                id,
                idx as i64,
                s.step_id,
                s.label.trim(),
                m(s.fundamental_dbfs),
                harmonics,
                m(s.total_dbfs),
                m(s.floor_dbfs),
                m(s.delta_db),
                m(s.level_dbfs),
                m(s.peak_hz),
                m(s.growth_db_per_s),
                (!skipped && s.onset.unwrap_or(false)) as i64,
                skipped as i64,
                clean(&s.note)
            ],
        )
        .map_err(db_err)?;
    }
    tx.commit().map_err(db_err)?;
    get(conn, &id)?.ok_or_else(|| format!("HUMRUN_DB: run '{id}' vanished after insert"))
}

fn step_row(r: &rusqlite::Row) -> rusqlite::Result<HumStep> {
    Ok(HumStep {
        idx: r.get(0)?,
        step_id: r.get(1)?,
        label: r.get(2)?,
        fundamental_dbfs: r.get(3)?,
        harmonics: parse_json(r.get(4)?),
        total_dbfs: r.get(5)?,
        floor_dbfs: r.get(6)?,
        delta_db: r.get(7)?,
        level_dbfs: r.get(8)?,
        peak_hz: r.get(9)?,
        growth_db_per_s: r.get(10)?,
        onset: r.get::<_, i64>(11)? != 0,
        skipped: r.get::<_, i64>(12)? != 0,
        note: r.get(13)?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<Option<HumRun>, String> {
    let run = conn
        .query_row(
            "SELECT id, session_id, venue_id, setup_id, kind, mains_hz, verdict, causes_json, created_at FROM hum_run WHERE id = ?1",
            [id],
            |r| {
                Ok(HumRun {
                    id: r.get(0)?,
                    session_id: r.get(1)?,
                    venue_id: r.get(2)?,
                    setup_id: r.get(3)?,
                    kind: r.get(4)?,
                    mains_hz: r.get(5)?,
                    verdict: r.get(6)?,
                    causes: parse_json(r.get(7)?),
                    created_at: r.get(8)?,
                    steps: vec![],
                })
            },
        )
        .optional()
        .map_err(db_err)?;
    let Some(mut run) = run else { return Ok(None) };
    let mut stmt = conn
        .prepare(
            "SELECT idx, step_id, label, fundamental_dbfs, harmonics_json, total_dbfs, floor_dbfs, delta_db, level_dbfs,
                    peak_hz, growth_db_per_s, onset, skipped, note FROM hum_step WHERE run_id = ?1 ORDER BY idx, id",
        )
        .map_err(db_err)?;
    run.steps = stmt.query_map([id], step_row).map_err(db_err)?.collect::<rusqlite::Result<Vec<_>>>().map_err(db_err)?;
    Ok(Some(run))
}

/// Newest first. Filters combine with AND; `limit` defaults to 50 (max 500).
pub fn list(conn: &Connection, f: &HumRunFilter) -> Result<Vec<HumRunSummary>, String> {
    if let Some(k) = &f.kind {
        if !KINDS.contains(&k.as_str()) {
            return Err(invalid(format!("kind must be one of {}", KINDS.join(", "))));
        }
    }
    let limit = f.limit.unwrap_or(DEFAULT_LIST_LIMIT).clamp(1, MAX_LIST_LIMIT);
    let mut stmt = conn
        .prepare(
            "SELECT r.id, r.session_id, r.venue_id, r.setup_id, r.kind, r.mains_hz, r.verdict, r.created_at,
                    (SELECT COUNT(*) FROM hum_step s WHERE s.run_id = r.id),
                    EXISTS (SELECT 1 FROM hum_step s WHERE s.run_id = r.id AND s.onset = 1)
             FROM hum_run r
             WHERE (?1 IS NULL OR r.venue_id = ?1) AND (?2 IS NULL OR r.session_id = ?2) AND (?3 IS NULL OR r.kind = ?3)
             ORDER BY r.created_at DESC, r.id LIMIT ?4",
        )
        .map_err(db_err)?;
    let rows = stmt
        .query_map(params![clean(&f.venue_id), clean(&f.session_id), f.kind, limit], |r| {
            Ok(HumRunSummary {
                id: r.get(0)?,
                session_id: r.get(1)?,
                venue_id: r.get(2)?,
                setup_id: r.get(3)?,
                kind: r.get(4)?,
                mains_hz: r.get(5)?,
                verdict: r.get(6)?,
                created_at: r.get(7)?,
                step_count: r.get(8)?,
                onset: r.get::<_, i64>(9)? != 0,
            })
        })
        .map_err(db_err)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(db_err)
}

/// Returns whether a run was removed (its steps go with it).
pub fn delete(conn: &Connection, id: &str) -> Result<bool, String> {
    let tx = conn.unchecked_transaction().map_err(db_err)?;
    tx.execute("DELETE FROM hum_step WHERE run_id = ?1", [id]).map_err(db_err)?;
    let n = tx.execute("DELETE FROM hum_run WHERE id = ?1", [id]).map_err(db_err)?;
    tx.commit().map_err(db_err)?;
    Ok(n > 0)
}

#[tauri::command]
pub fn hum_run_save(app: AppHandle, input: HumRunInput) -> Result<HumRun, String> {
    let conn = open_database(&database_path(&app)?)?;
    save(&conn, &input)
}

#[tauri::command]
pub fn hum_run_list(app: AppHandle, filter: Option<HumRunFilter>) -> Result<Vec<HumRunSummary>, String> {
    let conn = open_database(&database_path(&app)?)?;
    list(&conn, &filter.unwrap_or_default())
}

#[tauri::command]
pub fn hum_run_get(app: AppHandle, id: String) -> Result<Option<HumRun>, String> {
    let conn = open_database(&database_path(&app)?)?;
    get(&conn, &id)
}

#[tauri::command]
pub fn hum_run_delete(app: AppHandle, id: String) -> Result<bool, String> {
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
            "INSERT INTO venue (id, name, created_at, updated_at) VALUES ('venue-1','Club','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
             INSERT INTO setup (id, name, venue_id, created_at) VALUES ('setup-1','Booth A','venue-1','2026-01-01T00:00:00Z');
             INSERT INTO session (id, session_type, setup_id, started_at, app_version, schema_version, status)
               VALUES ('sess-1','venue','setup-1','2026-01-01T00:00:00Z','0.0.6',12,'open');",
        )
        .unwrap();
        c
    }

    fn step(id: &str, total: f64) -> HumStepInput {
        HumStepInput { step_id: id.into(), label: format!("Step {id}"), total_dbfs: Some(total), ..Default::default() }
    }

    fn hum_run() -> HumRunInput {
        HumRunInput {
            venue_id: Some("venue-1".into()),
            kind: "hum".into(),
            mains_hz: Some(50),
            verdict: Some("Hum dropped 18 dB".into()),
            causes: Some(json!([{ "id": "tt_ground_missing", "confidence": 0.85 }])),
            steps: vec![step("mixer_alone", -90.0), step("deck_cables", -57.0), step("tt_ground", -75.0)],
            ..Default::default()
        }
    }

    fn contract() -> Value {
        let raw = std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/humrun.json")).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    #[test]
    fn migration_creates_tables_and_is_rerunnable() {
        let c = mem();
        let sql = crate::db::MIGRATIONS.iter().find(|(v, _)| *v == 12).expect("0012 registered").1;
        c.execute_batch(sql).unwrap();
        let cols = |t: &str| -> Vec<String> {
            c.prepare(&format!("SELECT name FROM pragma_table_info('{t}')")).unwrap().query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap()
        };
        assert_eq!(cols("hum_run"), ["id", "session_id", "venue_id", "setup_id", "kind", "mains_hz", "verdict", "causes_json", "created_at"]);
        assert_eq!(
            cols("hum_step"),
            [
                "id", "run_id", "idx", "step_id", "label", "fundamental_dbfs", "harmonics_json", "total_dbfs", "floor_dbfs", "delta_db", "level_dbfs",
                "peak_hz", "growth_db_per_s", "onset", "skipped", "note"
            ]
        );
    }

    #[test]
    fn kind_check_constraint_rejects_unknown_kinds() {
        let c = mem();
        let r = c.execute("INSERT INTO hum_run (id, kind, created_at) VALUES ('x','noise','2026-01-01T00:00:00Z')", []);
        assert!(r.is_err());
    }

    #[test]
    fn save_round_trips_run_and_steps_in_order() {
        let c = mem();
        let mut input = hum_run();
        input.session_id = Some("sess-1".into());
        input.setup_id = Some("setup-1".into());
        input.steps[1].harmonics = Some(json!([{ "n": 1, "hz": 50, "dbfs": -58.1 }]));
        input.steps[2].note = Some("  SL-1200MK4  ".into());
        input.steps[2].delta_db = Some(-18.0);
        let saved = save(&c, &input).unwrap();
        assert_eq!(saved.kind, "hum");
        assert_eq!(saved.mains_hz, Some(50));
        assert_eq!(saved.session_id.as_deref(), Some("sess-1"));
        assert_eq!(saved.causes, json!([{ "id": "tt_ground_missing", "confidence": 0.85 }]));
        assert_eq!(saved.steps.iter().map(|s| s.step_id.as_str()).collect::<Vec<_>>(), ["mixer_alone", "deck_cables", "tt_ground"]);
        assert_eq!(saved.steps.iter().map(|s| s.idx).collect::<Vec<_>>(), [0, 1, 2]);
        assert_eq!(saved.steps[1].harmonics, json!([{ "n": 1, "hz": 50, "dbfs": -58.1 }]));
        assert_eq!(saved.steps[0].harmonics, json!([]));
        assert_eq!(saved.steps[2].note.as_deref(), Some("SL-1200MK4"));
        assert_eq!(saved.steps[2].delta_db, Some(-18.0));
        assert_eq!(get(&c, &saved.id).unwrap().unwrap(), saved);
    }

    #[test]
    fn skipped_steps_drop_measurements() {
        let c = mem();
        let mut input = hum_run();
        input.steps[1].skipped = Some(true);
        input.steps[1].harmonics = Some(json!([{ "n": 1 }]));
        let saved = save(&c, &input).unwrap();
        let s = &saved.steps[1];
        assert!(s.skipped);
        assert_eq!((s.total_dbfs, s.harmonics.clone()), (None, json!([])));
    }

    #[test]
    fn feedback_run_stores_onset_and_output_level() {
        let c = mem();
        let mut a = step("level_1", -71.0);
        a.level_dbfs = Some(-60.0);
        let mut b = step("level_9", -38.0);
        b.level_dbfs = Some(-36.0);
        b.peak_hz = Some(63.2);
        b.growth_db_per_s = Some(4.1);
        b.onset = Some(true);
        let input = HumRunInput { venue_id: Some("venue-1".into()), kind: "feedback".into(), steps: vec![a, b], ..Default::default() };
        let saved = save(&c, &input).unwrap();
        assert!(saved.steps[1].onset && !saved.steps[0].onset);
        assert_eq!(saved.steps[1].peak_hz, Some(63.2));
        let rows = list(&c, &HumRunFilter { kind: Some("feedback".into()), ..Default::default() }).unwrap();
        assert_eq!(rows.len(), 1);
        assert!(rows[0].onset);
        assert_eq!(rows[0].step_count, 2);
    }

    #[test]
    fn output_level_above_the_absolute_cap_is_refused() {
        let c = mem();
        for (level, ok) in [(-12.0, true), (-11.99, false), (0.0, false), (-120.0, true), (-120.01, false), (f64::NAN, false)] {
            let mut s = step("level_1", -40.0);
            s.level_dbfs = Some(level);
            let input = HumRunInput { kind: "feedback".into(), steps: vec![s], ..Default::default() };
            assert_eq!(save(&c, &input).is_ok(), ok, "level {level}");
        }
    }

    #[test]
    fn validation_rejects_bad_input_with_codes() {
        let c = mem();
        let cases: Vec<(&str, Box<dyn Fn(&mut HumRunInput)>)> = vec![
            ("kind", Box::new(|i| i.kind = "noise".into())),
            ("mains", Box::new(|i| i.mains_hz = Some(55))),
            ("no steps", Box::new(|i| i.steps.clear())),
            ("too many steps", Box::new(|i| i.steps = (0..=MAX_STEPS).map(|n| step(&format!("s{n}"), -60.0)).collect())),
            ("step id", Box::new(|i| i.steps[0].step_id = "Bad-Id".into())),
            ("step id long", Box::new(|i| i.steps[0].step_id = "a".repeat(41))),
            ("label", Box::new(|i| i.steps[0].label = "  ".into())),
            ("label long", Box::new(|i| i.steps[0].label = "x".repeat(MAX_LABEL_CHARS + 1))),
            ("note long", Box::new(|i| i.steps[0].note = Some("x".repeat(MAX_NOTE_CHARS + 1)))),
            ("verdict long", Box::new(|i| i.verdict = Some("x".repeat(MAX_VERDICT_CHARS + 1)))),
            ("causes object", Box::new(|i| i.causes = Some(json!({ "a": 1 })))),
            ("causes many", Box::new(|i| i.causes = Some(Value::Array(vec![json!(1); MAX_CAUSES + 1])))),
            ("harmonics object", Box::new(|i| i.steps[0].harmonics = Some(json!("x")))),
            ("total inf", Box::new(|i| i.steps[0].total_dbfs = Some(f64::INFINITY))),
            ("peak negative", Box::new(|i| i.steps[0].peak_hz = Some(-1.0))),
            ("onset on hum", Box::new(|i| i.steps[0].onset = Some(true))),
            ("level on hum", Box::new(|i| i.steps[0].level_dbfs = Some(-40.0))),
        ];
        for (name, mutate) in cases {
            let mut input = hum_run();
            mutate(&mut input);
            let err = save(&c, &input).expect_err(name);
            assert!(err.starts_with("HUMRUN_INVALID: "), "{name}: {err}");
        }
        let n: i64 = c.query_row("SELECT COUNT(*) FROM hum_run", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0, "nothing is written for invalid input");
    }

    #[test]
    fn boundary_lengths_are_accepted() {
        let c = mem();
        let mut input = hum_run();
        input.steps = (0..MAX_STEPS).map(|n| step(&format!("s{n}"), -60.0)).collect();
        input.steps[0].step_id = format!("a{}", "b".repeat(39));
        input.steps[0].label = "x".repeat(MAX_LABEL_CHARS);
        input.steps[0].note = Some("n".repeat(MAX_NOTE_CHARS));
        input.verdict = Some("v".repeat(MAX_VERDICT_CHARS));
        input.causes = Some(Value::Array(vec![json!(1); MAX_CAUSES]));
        assert_eq!(save(&c, &input).unwrap().steps.len(), MAX_STEPS);
    }

    #[test]
    fn unknown_links_are_reported_and_nothing_is_written() {
        let c = mem();
        for (field, val) in [("venue", "nope"), ("session", "nope"), ("setup", "nope")] {
            let mut input = hum_run();
            match field {
                "venue" => input.venue_id = Some(val.into()),
                "session" => input.session_id = Some(val.into()),
                _ => input.setup_id = Some(val.into()),
            }
            let err = save(&c, &input).unwrap_err();
            assert!(err.starts_with("HUMRUN_NOT_FOUND: ") && err.contains(field), "{err}");
        }
        let blank = HumRunInput { venue_id: Some("  ".into()), ..hum_run() };
        assert_eq!(save(&c, &blank).unwrap().venue_id, None, "blank ids are treated as absent");
    }

    #[test]
    fn list_filters_orders_newest_first_and_limits() {
        let c = mem();
        let a = save(&c, &hum_run()).unwrap();
        let b = save(&c, &HumRunInput { session_id: Some("sess-1".into()), ..hum_run() }).unwrap();
        let other = save(&c, &HumRunInput { venue_id: None, ..hum_run() }).unwrap();
        c.execute("UPDATE hum_run SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = ?1", [&a.id]).unwrap();
        let venue = list(&c, &HumRunFilter { venue_id: Some("venue-1".into()), ..Default::default() }).unwrap();
        assert_eq!(venue.iter().map(|r| r.id.clone()).collect::<Vec<_>>(), [b.id.clone(), a.id.clone()]);
        assert_eq!(venue[0].step_count, 3);
        let sess = list(&c, &HumRunFilter { session_id: Some("sess-1".into()), ..Default::default() }).unwrap();
        assert_eq!(sess.len(), 1);
        assert_eq!(list(&c, &HumRunFilter::default()).unwrap().len(), 3);
        assert_eq!(list(&c, &HumRunFilter { limit: Some(1), ..Default::default() }).unwrap().len(), 1);
        assert_eq!(list(&c, &HumRunFilter { limit: Some(0), ..Default::default() }).unwrap().len(), 1, "limit is at least 1");
        assert!(list(&c, &HumRunFilter { kind: Some("x".into()), ..Default::default() }).is_err());
        assert!(list(&c, &HumRunFilter::default()).unwrap().iter().any(|r| r.id == other.id));
    }

    #[test]
    fn delete_removes_steps_and_is_idempotent() {
        let c = mem();
        let r = save(&c, &hum_run()).unwrap();
        assert!(delete(&c, &r.id).unwrap());
        assert!(!delete(&c, &r.id).unwrap());
        assert_eq!(get(&c, &r.id).unwrap(), None);
        let n: i64 = c.query_row("SELECT COUNT(*) FROM hum_step", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn deleting_a_venue_or_session_keeps_the_run_unlinked() {
        let c = mem();
        let r = save(&c, &HumRunInput { session_id: Some("sess-1".into()), ..hum_run() }).unwrap();
        c.execute("DELETE FROM session WHERE id = 'sess-1'", []).unwrap();
        c.execute("UPDATE setup SET venue_id = NULL", []).unwrap();
        c.execute("DELETE FROM venue WHERE id = 'venue-1'", []).unwrap();
        let after = get(&c, &r.id).unwrap().unwrap();
        assert_eq!((after.session_id, after.venue_id), (None, None));
        assert_eq!(after.steps.len(), 3);
    }

    #[test]
    fn corrupt_json_columns_read_back_as_empty_arrays() {
        let c = mem();
        let r = save(&c, &hum_run()).unwrap();
        c.execute("UPDATE hum_run SET causes_json = 'not json' WHERE id = ?1", [&r.id]).unwrap();
        c.execute("UPDATE hum_step SET harmonics_json = '{' WHERE run_id = ?1", [&r.id]).unwrap();
        let g = get(&c, &r.id).unwrap().unwrap();
        assert_eq!(g.causes, json!([]));
        assert!(g.steps.iter().all(|s| s.harmonics == json!([])));
    }

    #[test]
    fn contract_examples_round_trip_through_the_real_types() {
        let c = mem();
        let k = contract();
        for name in ["hum_run_save", "hum_run_save_feedback"] {
            let input: HumRunInput = serde_json::from_value(k["commands"][name]["request"]["input"].clone()).unwrap();
            let saved = save(&c, &input).unwrap();
            let mut got = serde_json::to_value(&saved).unwrap();
            if let Some(expect) = k["commands"][name].get("response") {
                let mut expect = expect.clone();
                for v in [&mut got, &mut expect] {
                    v["id"] = json!("<id>");
                    v["createdAt"] = json!("<t>");
                }
                assert_eq!(got, expect, "{name}");
            }
        }
        let f: HumRunFilter = serde_json::from_value(k["commands"]["hum_run_list"]["request"]["filter"].clone()).unwrap();
        let rows = list(&c, &f).unwrap();
        let mut row = serde_json::to_value(rows.iter().find(|r| r.kind == "hum").unwrap()).unwrap();
        let mut expect = k["commands"]["hum_run_list"]["response"][0].clone();
        for v in [&mut row, &mut expect] {
            v["id"] = json!("<id>");
            v["createdAt"] = json!("<t>");
        }
        assert_eq!(row, expect);
    }
}
