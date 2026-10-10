//! First-run setup wizard persistence (FS-01 §4–5). The wizard state is a typed wrapper over the
//! `app_state` key `wizard`; gear selection creates "My <model>" assets keyed by device profile id
//! (the stable product key, FS-00 §5.3). All SQL is parameterized.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::app_state;
use crate::db::{database_path, new_id, now_iso, open_database};

pub const STATE_KEY: &str = "wizard";
pub const STATE_VERSION: i64 = 1;
pub const STATUSES: &[&str] = &["in_progress", "skipped", "completed"];
pub const MAX_STEP: i64 = 20;
pub const MAX_PRODUCT_IDS: usize = 500;
/// Notes written on assets created by the wizard; deliberately different from the library's auto-asset note,
/// so un-ticking later never retires an asset the user explicitly asked for.
pub const WIZARD_ASSET_NOTE: &str = "Added by the DeckChek setup wizard. Rename it and add the serial number in Equipment.";
/// Notes prefix of assets `device_profiles_sync` creates on its own.
pub const AUTO_ASSET_NOTE: &str = "Created from the DeckChek device library.";

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WizardState {
    /// "none" when nothing was saved yet.
    pub status: String,
    pub step: i64,
    pub answers: Value,
    pub updated_at: Option<String>,
    pub completed_at: Option<String>,
    pub version: i64,
}

impl WizardState {
    fn none() -> Self {
        WizardState { status: "none".into(), step: 1, answers: json!({}), updated_at: None, completed_at: None, version: STATE_VERSION }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WizardStateInput {
    pub status: String,
    pub step: i64,
    #[serde(default)]
    pub answers: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GearRef {
    pub product_id: String,
    pub asset_id: String,
}

#[derive(Debug, Default, Clone, PartialEq, Serialize)]
pub struct GearResult {
    pub created: Vec<GearRef>,
    pub existing: Vec<GearRef>,
    /// Library-created, untouched assets of unticked products that were soft-deleted (`apply_gear` only).
    pub removed: Vec<GearRef>,
}

/// Saved state, or `none` when absent or from a newer schema than this build understands.
pub fn state_get(conn: &Connection) -> Result<WizardState, String> {
    let Some(entry) = app_state::get(conn, STATE_KEY)? else { return Ok(WizardState::none()) };
    let Some(obj) = entry.value.as_object() else { return Ok(WizardState::none()) };
    let version = obj.get("version").and_then(Value::as_i64).unwrap_or(STATE_VERSION);
    let status = obj.get("status").and_then(Value::as_str).unwrap_or("");
    if version > STATE_VERSION || !STATUSES.contains(&status) {
        return Ok(WizardState::none());
    }
    Ok(WizardState {
        status: status.to_string(),
        step: obj.get("step").and_then(Value::as_i64).filter(|s| (1..=MAX_STEP).contains(s)).unwrap_or(1),
        answers: obj.get("answers").filter(|a| a.is_object()).cloned().unwrap_or_else(|| json!({})),
        updated_at: Some(entry.updated_at),
        completed_at: obj.get("completedAt").and_then(Value::as_str).map(str::to_string),
        version: STATE_VERSION,
    })
}

pub fn state_save(conn: &Connection, input: &WizardStateInput) -> Result<(), String> {
    if !STATUSES.contains(&input.status.as_str()) {
        return Err(format!("invalid wizard status '{}' (expected in_progress, skipped or completed)", input.status));
    }
    if !(1..=MAX_STEP).contains(&input.step) {
        return Err(format!("invalid wizard step {} (expected 1..={MAX_STEP})", input.step));
    }
    let answers = match &input.answers {
        Value::Null => json!({}),
        a if a.is_object() => a.clone(),
        _ => return Err("wizard answers must be an object".into()),
    };
    let previous = state_get(conn)?;
    let completed_at = if input.status == "completed" {
        Some(previous.completed_at.filter(|_| previous.status == "completed").map_or_else(|| now_iso(conn), Ok)?)
    } else {
        None
    };
    let value = json!({
        "version": STATE_VERSION, "status": input.status, "step": input.step, "answers": answers, "completedAt": completed_at,
    });
    app_state::set(conn, STATE_KEY, &value)
}

fn clean_ids(product_ids: &[String]) -> Result<Vec<String>, String> {
    if product_ids.len() > MAX_PRODUCT_IDS {
        return Err(format!("too many product ids ({}); the limit is {MAX_PRODUCT_IDS}", product_ids.len()));
    }
    let mut out: Vec<String> = Vec::new();
    for id in product_ids {
        let id = id.trim();
        if id.is_empty() || id.len() > 128 {
            return Err(format!("invalid product id '{id}'"));
        }
        if !out.iter().any(|x| x == id) {
            out.push(id.to_string());
        }
    }
    Ok(out)
}

/// (local product id, model) of a device profile; None when the profile is unknown.
fn profile_product(conn: &Connection, profile_id: &str) -> Result<Option<(String, String)>, String> {
    let row: Option<(Option<String>, String)> = conn
        .query_row("SELECT product_id, json FROM device_profile WHERE id = ?1", [profile_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()
        .map_err(e2s)?;
    let Some((Some(product_id), json)) = row else { return Ok(None) };
    let model = serde_json::from_str::<Value>(&json)
        .ok()
        .and_then(|v| v.get("model").and_then(Value::as_str).map(str::to_string))
        .or_else(|| conn.query_row("SELECT model FROM product WHERE id = ?1", [&product_id], |r| r.get(0)).ok())
        .unwrap_or_default();
    Ok(Some((product_id, model)))
}

fn ensure_assets(conn: &Connection, ids: &[String], now: &str) -> Result<GearResult, String> {
    // Validate everything first so an unknown id never leaves a partial result behind.
    let mut resolved = Vec::new();
    for id in ids {
        let (product_id, model) = profile_product(conn, id)?.ok_or_else(|| format!("unknown product id '{id}'"))?;
        resolved.push((id.clone(), product_id, model));
    }
    let mut out = GearResult::default();
    for (id, product_id, model) in resolved {
        let live: Option<String> = conn
            .query_row("SELECT id FROM asset WHERE product_id = ?1 AND is_deleted = 0 ORDER BY created_at, rowid LIMIT 1", [&product_id], |r| r.get(0))
            .optional()
            .map_err(e2s)?;
        if let Some(asset_id) = live {
            out.existing.push(GearRef { product_id: id, asset_id });
            continue;
        }
        // Re-ticking a product whose asset was soft-deleted brings that unit back instead of making a twin.
        let deleted: Option<String> = conn
            .query_row("SELECT id FROM asset WHERE product_id = ?1 AND is_deleted = 1 ORDER BY updated_at DESC, rowid DESC LIMIT 1", [&product_id], |r| r.get(0))
            .optional()
            .map_err(e2s)?;
        let asset_id = match deleted {
            Some(aid) => {
                conn.execute("UPDATE asset SET is_deleted = 0, retired_date = NULL, updated_at = ?2 WHERE id = ?1", params![aid, now]).map_err(e2s)?;
                aid
            }
            None => {
                let aid = new_id();
                conn.execute(
                    "INSERT INTO asset (id, product_id, nickname, notes, is_deleted, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
                    params![aid, product_id, format!("My {model}"), WIZARD_ASSET_NOTE, now],
                )
                .map_err(e2s)?;
                aid
            }
        };
        out.created.push(GearRef { product_id: id, asset_id });
    }
    Ok(out)
}

/// Create "My <model>" for each ticked profile id; idempotent per product. Unknown id rejects the whole call.
pub fn create_assets(conn: &mut Connection, product_ids: &[String]) -> Result<GearResult, String> {
    let ids = clean_ids(product_ids)?;
    let tx = conn.transaction().map_err(e2s)?;
    let now = now_iso(&tx)?;
    let out = ensure_assets(&tx, &ids, &now)?;
    tx.commit().map_err(e2s)?;
    Ok(out)
}

fn in_use(conn: &Connection, asset_id: &str) -> Result<bool, String> {
    let mut total = 0i64;
    for table in ["device_test_result", "asset_midi_map", "setup_component", "asset_settings_snapshot", "maintenance_event"] {
        total += conn.query_row(&format!("SELECT COUNT(*) FROM {table} WHERE asset_id = ?1"), [asset_id], |r| r.get::<_, i64>(0)).map_err(e2s)?;
    }
    Ok(total > 0)
}

/// Soft-delete library-created assets of profiles NOT in `owned` when the user never touched them: still carrying the
/// library note, nickname and timestamps as created, and referenced by no run, test result, setup or log entry.
fn retire_unowned(conn: &Connection, owned: &[String], now: &str) -> Result<Vec<GearRef>, String> {
    let rows: Vec<(String, String, String, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT dp.id, a.id, a.nickname, dp.json FROM device_profile dp JOIN asset a ON a.product_id = dp.product_id
                 WHERE a.is_deleted = 0 AND a.notes LIKE ?1 || '%' AND a.updated_at = a.created_at ORDER BY dp.id, a.created_at",
            )
            .map_err(e2s)?;
        let it = stmt.query_map([AUTO_ASSET_NOTE], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).map_err(e2s)?;
        it.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)?
    };
    let mut removed = Vec::new();
    for (profile_id, asset_id, nickname, json) in rows {
        if owned.contains(&profile_id) {
            continue;
        }
        let model = serde_json::from_str::<Value>(&json).ok().and_then(|v| v.get("model").and_then(Value::as_str).map(str::to_string)).unwrap_or_default();
        if nickname != format!("My {model}") || in_use(conn, &asset_id)? {
            continue;
        }
        conn.execute("UPDATE asset SET is_deleted = 1, retired_date = COALESCE(retired_date, substr(?2, 1, 10)), updated_at = ?2 WHERE id = ?1", params![asset_id, now]).map_err(e2s)?;
        removed.push(GearRef { product_id: profile_id, asset_id });
    }
    Ok(removed)
}

/// Finish-step gear application (FS-01 AC-6) in one transaction: create/keep assets for `owned`, then retire the
/// untouched library-created assets of every other profile. No other asset is touched.
pub fn apply_gear(conn: &mut Connection, owned: &[String]) -> Result<GearResult, String> {
    let ids = clean_ids(owned)?;
    let tx = conn.transaction().map_err(e2s)?;
    let now = now_iso(&tx)?;
    let mut out = ensure_assets(&tx, &ids, &now)?;
    out.removed = retire_unowned(&tx, &ids, &now)?;
    tx.commit().map_err(e2s)?;
    Ok(out)
}

fn with_db<T>(app: &AppHandle, f: impl FnOnce(&mut Connection) -> Result<T, String>) -> Result<T, String> {
    let mut conn = open_database(&database_path(app)?)?;
    f(&mut conn)
}

#[tauri::command]
pub fn wizard_state_get(app: AppHandle) -> Result<WizardState, String> {
    with_db(&app, |c| state_get(c))
}

#[tauri::command]
pub fn wizard_state_save(app: AppHandle, state: WizardStateInput) -> Result<(), String> {
    with_db(&app, |c| state_save(c, &state))
}

#[tauri::command]
pub fn wizard_create_assets(app: AppHandle, product_ids: Vec<String>) -> Result<GearResult, String> {
    with_db(&app, |c| create_assets(c, &product_ids))
}

#[tauri::command]
pub fn wizard_apply_gear(app: AppHandle, product_ids: Vec<String>) -> Result<GearResult, String> {
    with_db(&app, |c| apply_gear(c, &product_ids))
}

/// True when the database already holds a run or an asset: upgrade installs skip the wizard (FS-01 AC-10).
/// The caller must evaluate this before the first device-library sync of a fresh install, because older builds
/// created an asset per synced profile.
pub fn has_user_data(conn: &Connection) -> Result<bool, String> {
    let n = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, i64>(0)).map_err(e2s);
    Ok(n("SELECT COUNT(*) FROM session")? > 0 || n("SELECT COUNT(*) FROM asset")? > 0)
}

#[tauri::command]
pub fn wizard_has_user_data(app: AppHandle) -> Result<bool, String> {
    with_db(&app, |c| has_user_data(c))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;
    use crate::devices::sync_profiles_with;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        c
    }

    fn profile(id: &str, model: &str) -> Value {
        json!({"schemaVersion": 1, "id": id, "manufacturer": "Acme", "model": model, "category": "turntable", "specs": [], "tests": []})
    }

    fn count(c: &Connection, sql: &str) -> i64 {
        c.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    fn ids(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    fn input(status: &str, step: i64, answers: Value) -> WizardStateInput {
        WizardStateInput { status: status.into(), step, answers }
    }

    #[test]
    fn state_round_trips_through_app_state() {
        let c = mem();
        let none = state_get(&c).unwrap();
        assert_eq!((none.status.as_str(), none.step, none.updated_at.clone()), ("none", 1, None));
        let answers = json!({"inputDevice": "Traktor Audio 8 DJ", "sampleRate": 48000, "ownedProductIds": ["technics-sl-1200mk4"]});
        state_save(&c, &input("in_progress", 3, answers.clone())).unwrap();
        let got = state_get(&c).unwrap();
        assert_eq!((got.status.as_str(), got.step, got.version), ("in_progress", 3, 1));
        assert_eq!(got.answers, answers);
        assert!(got.updated_at.is_some() && got.completed_at.is_none());
        // the raw row is the documented shape, readable through the shared app_state commands
        let raw = app_state::get(&c, "wizard").unwrap().unwrap().value;
        assert_eq!(raw["version"], 1);
        assert_eq!(raw["answers"]["inputDevice"], "Traktor Audio 8 DJ");
        state_save(&c, &input("completed", 7, json!({}))).unwrap();
        let done = state_get(&c).unwrap();
        assert_eq!(done.status, "completed");
        let stamp = done.completed_at.clone().expect("completedAt is set on completion");
        state_save(&c, &input("completed", 7, json!({"x": 1}))).unwrap();
        assert_eq!(state_get(&c).unwrap().completed_at, Some(stamp), "completedAt is kept while it stays completed");
        state_save(&c, &input("in_progress", 1, Value::Null)).unwrap();
        let again = state_get(&c).unwrap();
        assert_eq!((again.completed_at, again.answers), (None, json!({})));
        assert_eq!(count(&c, "SELECT COUNT(*) FROM app_state"), 1);
    }

    #[test]
    fn state_save_validates_and_get_tolerates_bad_rows() {
        let c = mem();
        assert!(state_save(&c, &input("none", 1, json!({}))).is_err());
        assert!(state_save(&c, &input("bogus", 1, json!({}))).is_err());
        assert!(state_save(&c, &input("in_progress", 0, json!({}))).is_err());
        assert!(state_save(&c, &input("in_progress", MAX_STEP + 1, json!({}))).is_err());
        assert!(state_save(&c, &input("in_progress", 1, json!([1]))).is_err());
        assert_eq!(state_get(&c).unwrap().status, "none", "rejected saves write nothing");
        for (raw, why) in [
            (json!({"version": 2, "status": "completed", "step": 7, "answers": {}}), "newer version"),
            (json!({"version": 1, "status": "weird", "step": 2}), "unknown status"),
            (json!("text"), "not an object"),
            (json!(null), "null"),
        ] {
            app_state::set(&c, "wizard", &raw).unwrap();
            assert_eq!(state_get(&c).unwrap().status, "none", "{why}");
        }
        app_state::set(&c, "wizard", &json!({"version": 1, "status": "skipped", "step": 99, "answers": 5})).unwrap();
        let got = state_get(&c).unwrap();
        assert_eq!((got.status.as_str(), got.step, got.answers), ("skipped", 1, json!({})));
    }

    #[test]
    fn state_serializes_camel_case() {
        let s = WizardState { status: "none".into(), step: 1, answers: json!({}), updated_at: None, completed_at: None, version: 1 };
        let v = serde_json::to_value(&s).unwrap();
        assert_eq!(v, json!({"status": "none", "step": 1, "answers": {}, "updatedAt": null, "completedAt": null, "version": 1}));
        let r = GearResult { created: vec![GearRef { product_id: "p".into(), asset_id: "a".into() }], ..Default::default() };
        assert_eq!(serde_json::to_value(&r).unwrap(), json!({"created": [{"productId": "p", "assetId": "a"}], "existing": [], "removed": []}));
    }

    #[test]
    fn create_assets_is_idempotent_and_rejects_unknown_ids() {
        let mut c = mem();
        sync_profiles_with(&mut c, &[profile("deck-a", "A-1"), profile("deck-b", "B-2")], false).unwrap();
        assert_eq!(count(&c, "SELECT COUNT(*) FROM asset"), 0);
        let first = create_assets(&mut c, &ids(&["deck-a", "deck-b", "deck-a"])).unwrap();
        assert_eq!((first.created.len(), first.existing.len()), (2, 0));
        let nick: String = c.query_row("SELECT nickname FROM asset WHERE id = ?1", [&first.created[0].asset_id], |r| r.get(0)).unwrap();
        assert_eq!(nick, "My A-1");
        let second = create_assets(&mut c, &ids(&["deck-a", "deck-b"])).unwrap();
        assert_eq!((second.created.len(), second.existing.len()), (0, 2));
        assert_eq!(second.existing[0].asset_id, first.created[0].asset_id);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM asset"), 2);
        // an unknown id rejects the whole call and rolls back what came before it
        sync_profiles_with(&mut c, &[profile("deck-c", "C-3")], false).unwrap();
        let err = create_assets(&mut c, &ids(&["deck-c", "no-such-profile"])).unwrap_err();
        assert!(err.contains("no-such-profile"), "{err}");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM asset"), 2);
        assert!(create_assets(&mut c, &ids(&[""])).is_err());
        assert!(create_assets(&mut c, &[]).unwrap().created.is_empty());
    }

    #[test]
    fn create_assets_revives_a_soft_deleted_unit_instead_of_duplicating() {
        let mut c = mem();
        sync_profiles_with(&mut c, &[profile("deck-a", "A-1")], false).unwrap();
        let made = create_assets(&mut c, &ids(&["deck-a"])).unwrap();
        c.execute("UPDATE asset SET is_deleted = 1, retired_date = '2026-01-01'", []).unwrap();
        let back = create_assets(&mut c, &ids(&["deck-a"])).unwrap();
        assert_eq!(back.created[0].asset_id, made.created[0].asset_id);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM asset"), 1);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM asset WHERE is_deleted = 0 AND retired_date IS NULL"), 1);
    }

    #[test]
    fn apply_gear_retires_only_untouched_library_assets_of_unticked_products() {
        let mut c = mem();
        let profiles: Vec<Value> = ["keep", "drop", "edited", "used", "mine"].iter().map(|m| profile(&format!("deck-{m}"), m)).collect();
        // old behaviour: the library sync created an asset per profile
        let synced = sync_profiles_with(&mut c, &profiles, true).unwrap();
        let asset = |i: usize| synced[i].asset_id.clone().unwrap();
        c.execute("UPDATE asset SET nickname = 'Booth deck', updated_at = '2099-01-01T00:00:00.000Z' WHERE id = ?1", [asset(2)]).unwrap();
        c.execute("INSERT INTO device_test_result (id, asset_id, profile_id, test_id, status, detail_json, created_at) VALUES ('r1', ?1, 'deck-used', 't', 'pass', '{}', 'now')", [asset(3)]).unwrap();
        // a hand-made asset on a profile's product is never touched
        let mine = asset(4);
        c.execute("UPDATE asset SET notes = 'Bought 2020', nickname = 'Home deck' WHERE id = ?1", [&mine]).unwrap();
        // a non-library asset on an unrelated product
        c.execute("INSERT INTO asset (id, product_id, nickname, notes, is_deleted, created_at, updated_at) VALUES ('x1', NULL, 'Spare', NULL, 0, 'now', 'now')", []).unwrap();

        let out = apply_gear(&mut c, &ids(&["deck-keep"])).unwrap();
        assert_eq!((out.created.len(), out.existing.len()), (0, 1));
        assert_eq!(out.existing[0].asset_id, asset(0));
        assert_eq!(out.removed.iter().map(|r| r.product_id.as_str()).collect::<Vec<_>>(), vec!["deck-drop"]);
        fn deleted(c: &Connection, id: &str) -> i64 {
            count(c, &format!("SELECT is_deleted FROM asset WHERE id = '{id}'"))
        }
        assert_eq!(deleted(&c, &asset(0)), 0);
        assert_eq!(deleted(&c, &asset(1)), 1);
        assert_eq!(deleted(&c, &asset(2)), 0, "edited asset kept");
        assert_eq!(deleted(&c, &asset(3)), 0, "asset with results kept");
        assert_eq!(deleted(&c, &mine), 0);
        assert_eq!(deleted(&c, "x1"), 0);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM asset"), 6, "nothing is hard-deleted");
        // re-running is stable, and ticking the retired product revives it
        let again = apply_gear(&mut c, &ids(&["deck-keep"])).unwrap();
        assert!(again.removed.is_empty() && again.created.is_empty());
        let revived = apply_gear(&mut c, &ids(&["deck-keep", "deck-drop"])).unwrap();
        assert_eq!(revived.created[0].asset_id, asset(1));
        assert_eq!(deleted(&c, &asset(1)), 0);
    }

    #[test]
    fn apply_gear_with_unknown_id_changes_nothing() {
        let mut c = mem();
        sync_profiles_with(&mut c, &[profile("deck-a", "A"), profile("deck-b", "B")], true).unwrap();
        assert!(apply_gear(&mut c, &ids(&["deck-a", "ghost"])).is_err());
        assert_eq!(count(&c, "SELECT COUNT(*) FROM asset WHERE is_deleted = 0"), 2);
    }

    #[test]
    fn user_data_detection_for_upgrade_installs() {
        let mut c = mem();
        assert!(!has_user_data(&c).unwrap());
        sync_profiles_with(&mut c, &[profile("deck-a", "A")], false).unwrap();
        assert!(!has_user_data(&c).unwrap(), "a library sync without assets is not user data");
        sync_profiles_with(&mut c, &[profile("deck-b", "B")], true).unwrap();
        assert!(has_user_data(&c).unwrap());
        c.execute("DELETE FROM asset", []).unwrap();
        c.execute("INSERT INTO session (id, session_type, started_at, app_version, schema_version, status, config_snapshot_json) VALUES ('run-1', 'quick', 'now', 'test', 1, 'completed', '{}')", []).unwrap();
        assert!(has_user_data(&c).unwrap());
    }
}
