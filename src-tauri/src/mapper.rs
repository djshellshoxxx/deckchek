//! MIDI mapper studio persistence (FS-32 §5; table from `0020_mapper_models.sql`).
//! Stores the neutral DeckChek mapping model as JSON, optionally linked to a unit (asset) and a device profile.
//! Conversion to Mixxx / VirtualDJ files and every format concern live in `app/mapper/` (pure JS); exports go through
//! `userfiles.rs`. This module only validates IPC input and stores rows. All SQL is parameterised.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::db::{database_path, new_id, now_iso, open_database};

pub const MAX_NAME_CHARS: usize = 120;
pub const MAX_ID_CHARS: usize = 128;
pub const MAX_MODEL_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_CONTROLS: usize = 4096;
pub const MAX_LIST: u32 = 500;
/// Mapping model version this build writes (`MODEL_VERSION` in app/mapper/model.js).
pub const MODEL_VERSION: i64 = 1;

#[derive(Debug, Clone, PartialEq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MapperModelInput {
    /// Present to update an existing row; absent to create one.
    pub id: Option<String>,
    pub asset_id: Option<String>,
    pub profile_id: Option<String>,
    pub name: String,
    pub model: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapperModelRow {
    pub id: String,
    pub asset_id: Option<String>,
    pub profile_id: Option<String>,
    pub name: String,
    pub model: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapperModelSummary {
    pub id: String,
    pub asset_id: Option<String>,
    pub profile_id: Option<String>,
    pub name: String,
    pub version: Option<i64>,
    pub control_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn invalid(msg: impl std::fmt::Display) -> String {
    format!("MAPPER_INVALID: {msg}")
}

fn db_err(e: rusqlite::Error) -> String {
    format!("MAPPER_DB: {e}")
}

/// Row ids: UUIDs from `db::new_id` or the browser fallback (`m-…`); letters, digits and '-' only.
pub fn valid_row_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

fn clean_link(name: &str, v: &Option<String>) -> Result<Option<String>, String> {
    let Some(t) = v.as_ref().map(|t| t.trim()).filter(|t| !t.is_empty()) else { return Ok(None) };
    if t.chars().count() > MAX_ID_CHARS || t.chars().any(char::is_control) {
        return Err(invalid(format!("{name} is not a valid id")));
    }
    Ok(Some(t.to_string()))
}

/// Validate the input and return (name, assetId, profileId, model JSON text).
pub fn validate(i: &MapperModelInput) -> Result<(String, Option<String>, Option<String>, String), String> {
    if let Some(id) = &i.id {
        if !valid_row_id(id) {
            return Err(invalid("id must be 1-64 letters, digits or '-'"));
        }
    }
    let name = i.name.trim();
    if name.is_empty() {
        return Err(invalid("name is required"));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(invalid(format!("name is limited to {MAX_NAME_CHARS} characters")));
    }
    if name.chars().any(char::is_control) {
        return Err(invalid("name must not contain control characters"));
    }
    let obj = i.model.as_object().ok_or_else(|| invalid("model must be an object"))?;
    match obj.get("version").and_then(Value::as_i64) {
        Some(v) if v >= 1 => {}
        _ => return Err(invalid("model.version must be a positive integer")),
    }
    let controls = obj.get("controls").and_then(Value::as_array).ok_or_else(|| invalid("model.controls must be an array"))?;
    if controls.len() > MAX_CONTROLS {
        return Err(invalid(format!("a model is limited to {MAX_CONTROLS} controls")));
    }
    let json = serde_json::to_string(&i.model).map_err(invalid)?;
    if json.len() > MAX_MODEL_BYTES {
        return Err(invalid(format!("model is limited to {MAX_MODEL_BYTES} bytes")));
    }
    Ok((name.to_string(), clean_link("assetId", &i.asset_id)?, clean_link("profileId", &i.profile_id)?, json))
}

fn exists(conn: &Connection, table: &str, id: &str) -> Result<bool, String> {
    // `table` is one of the literals used below, never user input.
    conn.query_row(&format!("SELECT 1 FROM {table} WHERE id = ?1"), [id], |_| Ok(())).optional().map(|o| o.is_some()).map_err(db_err)
}

const COLS: &str = "id, asset_id, profile_id, name, model_json, created_at, updated_at";

fn row(r: &rusqlite::Row) -> rusqlite::Result<MapperModelRow> {
    let json: String = r.get(4)?;
    Ok(MapperModelRow {
        id: r.get(0)?,
        asset_id: r.get(1)?,
        profile_id: r.get(2)?,
        name: r.get(3)?,
        model: serde_json::from_str(&json).unwrap_or(Value::Null),
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

pub fn save(conn: &Connection, input: &MapperModelInput) -> Result<MapperModelRow, String> {
    let (name, asset_id, profile_id, json) = validate(input)?;
    if let Some(a) = &asset_id {
        if !exists(conn, "asset", a)? {
            return Err(format!("MAPPER_NOT_FOUND: unknown asset '{a}'"));
        }
    }
    if let Some(p) = &profile_id {
        if !exists(conn, "device_profile", p)? {
            return Err(format!("MAPPER_NOT_FOUND: unknown device profile '{p}'"));
        }
    }
    let now = now_iso(conn)?;
    let id = match &input.id {
        Some(id) => {
            // Never overwrite a mapping written by a newer DeckChek (or a newer model than the incoming one): the
            // incoming model would be a lossy older copy. A row whose stored JSON has no readable version is repaired.
            let incoming = input.model.get("version").and_then(Value::as_i64).unwrap_or(0);
            let stored = get(conn, id)?.and_then(|r| r.model.get("version").and_then(Value::as_i64));
            if let Some(v) = stored.filter(|v| *v > incoming || *v > MODEL_VERSION) {
                return Err(format!("MAPPER_NEWER_VERSION: this mapping was saved by a newer DeckChek (model version {v}) and is not overwritten"));
            }
            let n = conn
                .execute(
                    "UPDATE mapper_model SET asset_id = ?2, profile_id = ?3, name = ?4, model_json = ?5, updated_at = ?6 WHERE id = ?1",
                    params![id, asset_id, profile_id, name, json, now],
                )
                .map_err(db_err)?;
            if n == 0 {
                return Err(format!("MAPPER_NOT_FOUND: unknown mapping '{id}'"));
            }
            id.clone()
        }
        None => {
            let id = new_id();
            conn.execute(
                "INSERT INTO mapper_model (id, asset_id, profile_id, name, model_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![id, asset_id, profile_id, name, json, now],
            )
            .map_err(db_err)?;
            id
        }
    };
    get(conn, &id)?.ok_or_else(|| format!("MAPPER_DB: mapping '{id}' vanished after save"))
}

pub fn get(conn: &Connection, id: &str) -> Result<Option<MapperModelRow>, String> {
    conn.query_row(&format!("SELECT {COLS} FROM mapper_model WHERE id = ?1"), [id], row).optional().map_err(db_err)
}

/// Newest first; all mappings, or those of one asset.
pub fn list(conn: &Connection, asset_id: Option<&str>) -> Result<Vec<MapperModelSummary>, String> {
    let asset_id = asset_id.map(str::trim).filter(|s| !s.is_empty());
    if asset_id.is_some_and(|a| a.chars().count() > MAX_ID_CHARS) {
        return Err(invalid("assetId is not a valid id"));
    }
    let mut stmt = conn
        .prepare(&format!("SELECT {COLS} FROM mapper_model WHERE (?1 IS NULL OR asset_id = ?1) ORDER BY updated_at DESC, id LIMIT ?2"))
        .map_err(db_err)?;
    let rows = stmt.query_map(params![asset_id, MAX_LIST], row).map_err(db_err)?.collect::<rusqlite::Result<Vec<_>>>().map_err(db_err)?;
    Ok(rows
        .into_iter()
        .map(|r| MapperModelSummary {
            version: r.model.get("version").and_then(Value::as_i64),
            control_count: r.model.get("controls").and_then(Value::as_array).map_or(0, |a| a.len() as i64),
            id: r.id,
            asset_id: r.asset_id,
            profile_id: r.profile_id,
            name: r.name,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .collect())
}

pub fn delete(conn: &Connection, id: &str) -> Result<bool, String> {
    Ok(conn.execute("DELETE FROM mapper_model WHERE id = ?1", [id]).map_err(db_err)? > 0)
}

#[tauri::command]
pub async fn mapper_model_save(app: AppHandle, input: MapperModelInput) -> Result<MapperModelRow, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        save(&conn, &input)
    })
    .await?
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn mapper_model_list(app: AppHandle, assetId: Option<String>) -> Result<Vec<MapperModelSummary>, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        list(&conn, assetId.as_deref())
    })
    .await?
}

#[tauri::command]
pub async fn mapper_model_get(app: AppHandle, id: String) -> Result<Option<MapperModelRow>, String> {
    crate::db::off_main(move || {
        if !valid_row_id(&id) {
            return Err(invalid("id must be 1-64 letters, digits or '-'"));
        }
        let conn = open_database(&database_path(&app)?)?;
        get(&conn, &id)
    })
    .await?
}

#[tauri::command]
pub async fn mapper_model_delete(app: AppHandle, id: String) -> Result<bool, String> {
    crate::db::off_main(move || {
        if !valid_row_id(&id) {
            return Err(invalid("id must be 1-64 letters, digits or '-'"));
        }
        let conn = open_database(&database_path(&app)?)?;
        delete(&conn, &id)
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{apply_migrations, applied_migrations, MIGRATIONS};
    use serde_json::json;
    use std::path::Path;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        seed(&c);
        c
    }

    fn seed(c: &Connection) {
        c.execute_batch(
            "INSERT INTO asset (id, nickname, created_at, updated_at) VALUES ('fs32-asset','Deck controller','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
             INSERT INTO device_profile (id, json, version, loaded_at) VALUES ('fs32-profile','{}',1,'2026-01-01T00:00:00Z');",
        )
        .unwrap();
    }

    fn model() -> Value {
        json!({ "version": 1, "name": "DDJ", "decks": 2, "controls": [
            { "id": "c-note-1-11", "label": "Play", "midi": { "type": "note", "channel": 1, "number": 11, "status": 144 },
              "kind": "button", "mode": "toggle", "layer": "base", "function": { "id": "play", "deck": 1, "args": {} }, "feedback": null } ],
            "provenance": { "source": "learned", "sourceId": null } })
    }

    fn input() -> MapperModelInput {
        MapperModelInput { name: "My mapping".into(), model: model(), asset_id: Some("fs32-asset".into()), profile_id: Some("fs32-profile".into()), ..Default::default() }
    }

    fn contract() -> Value {
        let raw = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/mapper.json")).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    #[test]
    fn migration_creates_the_table_and_rerun_is_a_no_op() {
        let c = mem();
        let sql = MIGRATIONS.iter().find(|(v, _)| *v == 20).expect("0020 registered").1;
        c.execute_batch(sql).unwrap();
        let cols: Vec<String> = c.prepare("SELECT name FROM pragma_table_info('mapper_model')").unwrap().query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(cols, ["id", "asset_id", "profile_id", "name", "model_json", "created_at", "updated_at"]);
        let idx: i64 = c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_mapper_model_asset'", [], |r| r.get(0)).unwrap();
        assert_eq!(idx, 1);
        assert!(applied_migrations(&c).unwrap().contains(&20));
    }

    #[test]
    fn every_release_fixture_upgrades_and_then_stores_mappings() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/db");
        let mut names: Vec<String> = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).filter(|n| n.starts_with('v') && n.ends_with(".sql")).collect();
        names.sort();
        assert!(!names.is_empty());
        for name in names {
            let c = Connection::open_in_memory().unwrap();
            c.execute_batch(&std::fs::read_to_string(dir.join(&name)).unwrap()).unwrap();
            c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
            apply_migrations(&c).unwrap_or_else(|e| panic!("{name}: {e}"));
            apply_migrations(&c).unwrap();
            seed(&c);
            let saved = save(&c, &input()).unwrap_or_else(|e| panic!("{name}: {e}"));
            assert_eq!(get(&c, &saved.id).unwrap().unwrap(), saved, "{name}");
            let fk: i64 = c.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).unwrap();
            assert_eq!(fk, 0, "{name}");
        }
    }

    #[test]
    fn save_get_update_list_delete_round_trip() {
        let c = mem();
        let a = save(&c, &input()).unwrap();
        assert_eq!(a.name, "My mapping");
        assert_eq!(a.model, model());
        assert_eq!((a.asset_id.as_deref(), a.profile_id.as_deref()), (Some("fs32-asset"), Some("fs32-profile")));
        assert_eq!(a.created_at, a.updated_at);
        let mut m2 = model();
        m2["name"] = json!("Renamed");
        c.execute("UPDATE mapper_model SET created_at = '2026-01-01T00:00:00.000Z', updated_at = '2026-01-01T00:00:00.000Z' WHERE id = ?1", [&a.id]).unwrap();
        let b = save(&c, &MapperModelInput { id: Some(a.id.clone()), name: "  Renamed  ".into(), model: m2.clone(), ..Default::default() }).unwrap();
        assert_eq!(b.id, a.id);
        assert_eq!(b.name, "Renamed");
        assert_eq!(b.model, m2);
        assert_eq!(b.created_at, "2026-01-01T00:00:00.000Z", "created_at survives an update");
        assert_ne!(b.updated_at, b.created_at);
        assert_eq!(b.asset_id, None, "links follow the latest save");
        let other = save(&c, &input()).unwrap();
        c.execute("UPDATE mapper_model SET updated_at = '2026-01-02T00:00:00.000Z' WHERE id = ?1", [&other.id]).unwrap();
        let all = list(&c, None).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!([all[0].id.clone(), all[1].id.clone()], [b.id.clone(), other.id.clone()], "most recently updated first");
        assert_eq!((all[0].version, all[0].control_count), (Some(1), 1));
        let mine = list(&c, Some("fs32-asset")).unwrap();
        assert_eq!(mine.iter().map(|r| r.id.clone()).collect::<Vec<_>>(), [other.id.clone()]);
        assert!(delete(&c, &other.id).unwrap());
        assert!(!delete(&c, &other.id).unwrap());
        assert_eq!(get(&c, &other.id).unwrap(), None);
    }

    #[test]
    fn validation_rejects_bad_input_and_writes_nothing() {
        let c = mem();
        let cases: Vec<(&str, Box<dyn Fn(&mut MapperModelInput)>)> = vec![
            ("blank name", Box::new(|i| i.name = "   ".into())),
            ("long name", Box::new(|i| i.name = "x".repeat(MAX_NAME_CHARS + 1))),
            ("control char", Box::new(|i| i.name = "a\u{0}b".into())),
            ("bad id", Box::new(|i| i.id = Some("../x".into()))),
            ("long id", Box::new(|i| i.id = Some("a".repeat(65)))),
            ("model array", Box::new(|i| i.model = json!([1]))),
            ("no version", Box::new(|i| i.model = json!({ "controls": [] }))),
            ("zero version", Box::new(|i| i.model = json!({ "version": 0, "controls": [] }))),
            ("string version", Box::new(|i| i.model = json!({ "version": "1", "controls": [] }))),
            ("no controls", Box::new(|i| i.model = json!({ "version": 1 }))),
            ("too many controls", Box::new(|i| i.model = json!({ "version": 1, "controls": vec![json!({}); MAX_CONTROLS + 1] }))),
            ("too large", Box::new(|i| i.model = json!({ "version": 1, "controls": [], "pad": "x".repeat(MAX_MODEL_BYTES) }))),
            ("asset id control char", Box::new(|i| i.asset_id = Some("a\nb".into()))),
            ("asset id long", Box::new(|i| i.asset_id = Some("a".repeat(MAX_ID_CHARS + 1)))),
        ];
        for (name, mutate) in cases {
            let mut i = input();
            mutate(&mut i);
            let err = save(&c, &i).expect_err(name);
            assert!(err.starts_with("MAPPER_INVALID: "), "{name}: {err}");
        }
        let n: i64 = c.query_row("SELECT COUNT(*) FROM mapper_model", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
        let mut ok = input();
        ok.name = "n".repeat(MAX_NAME_CHARS);
        ok.asset_id = Some("  ".into());
        assert_eq!(save(&c, &ok).unwrap().asset_id, None, "blank links are absent");
    }

    #[test]
    fn unknown_links_and_unknown_ids_are_not_found() {
        let c = mem();
        let e = save(&c, &MapperModelInput { asset_id: Some("nope".into()), ..input() }).unwrap_err();
        assert!(e.starts_with("MAPPER_NOT_FOUND: ") && e.contains("asset"), "{e}");
        let e = save(&c, &MapperModelInput { profile_id: Some("nope".into()), ..input() }).unwrap_err();
        assert!(e.contains("device profile"), "{e}");
        let e = save(&c, &MapperModelInput { id: Some("missing-id".into()), ..input() }).unwrap_err();
        assert!(e.starts_with("MAPPER_NOT_FOUND: "), "{e}");
    }

    #[test]
    fn constraints_and_foreign_keys_hold() {
        let c = mem();
        let ins = "INSERT INTO mapper_model (id, name, model_json, created_at, updated_at) VALUES (?1, ?2, ?3, 't', 't')";
        assert!(c.execute(ins, params!["a", " ", "{}"]).is_err(), "blank name refused");
        assert!(c.execute(ins, params!["b", "x", "not json"]).is_err(), "model_json must be JSON");
        assert!(c.execute("INSERT INTO mapper_model (id, asset_id, name, model_json, created_at, updated_at) VALUES ('c','ghost','x','{}','t','t')", []).is_err(), "asset FK");
        let saved = save(&c, &input()).unwrap();
        // Removing the profile (retired built-in) or the asset keeps the mapping, unlinked.
        c.execute("DELETE FROM device_profile WHERE id = 'fs32-profile'", []).unwrap();
        c.execute("DELETE FROM asset WHERE id = 'fs32-asset'", []).unwrap();
        let after = get(&c, &saved.id).unwrap().unwrap();
        assert_eq!((after.asset_id, after.profile_id), (None, None));
        assert_eq!(after.model, model());
    }

    #[test]
    fn corrupt_model_json_reads_back_as_null() {
        let c = mem();
        let s = save(&c, &input()).unwrap();
        c.execute_batch("PRAGMA ignore_check_constraints = ON;").unwrap();
        c.execute("UPDATE mapper_model SET model_json = '{' WHERE id = ?1", [&s.id]).unwrap();
        assert_eq!(get(&c, &s.id).unwrap().unwrap().model, Value::Null);
        assert_eq!(list(&c, None).unwrap()[0].control_count, 0);
    }

    #[test]
    fn regression_save_refuses_to_overwrite_a_newer_model_version() {
        let c = mem();
        let a = save(&c, &input()).unwrap();
        // A newer DeckChek stored version MODEL_VERSION + 1 in the same row.
        let newer = json!({ "version": MODEL_VERSION + 1, "name": "DDJ", "decks": 2, "controls": [], "futureField": "keep" });
        c.execute("UPDATE mapper_model SET model_json = ?2 WHERE id = ?1", params![a.id, newer.to_string()]).unwrap();
        let e = save(&c, &MapperModelInput { id: Some(a.id.clone()), ..input() }).unwrap_err();
        assert!(e.starts_with("MAPPER_NEWER_VERSION: "), "{e}");
        assert_eq!(get(&c, &a.id).unwrap().unwrap().model, newer, "the newer row is untouched");
        // Stored version greater than the incoming one is refused even when the incoming one is current.
        let mut v3 = newer.clone();
        v3["version"] = json!(3);
        c.execute("UPDATE mapper_model SET model_json = ?2 WHERE id = ?1", params![a.id, v3.to_string()]).unwrap();
        let mut m2 = model();
        m2["version"] = json!(2);
        let e = save(&c, &MapperModelInput { id: Some(a.id.clone()), model: m2, ..input() }).unwrap_err();
        assert!(e.starts_with("MAPPER_NEWER_VERSION: "), "{e}");
        // Same version still overwrites; a corrupt stored model can be repaired.
        c.execute("UPDATE mapper_model SET model_json = ?2 WHERE id = ?1", params![a.id, model().to_string()]).unwrap();
        assert_eq!(save(&c, &MapperModelInput { id: Some(a.id.clone()), name: "Again".into(), ..input() }).unwrap().name, "Again");
        c.execute_batch("PRAGMA ignore_check_constraints = ON;").unwrap();
        c.execute("UPDATE mapper_model SET model_json = '{' WHERE id = ?1", [&a.id]).unwrap();
        assert_eq!(save(&c, &MapperModelInput { id: Some(a.id.clone()), ..input() }).unwrap().model, model());
    }

    #[test]
    fn row_ids_are_checked() {
        assert!(valid_row_id("00000000-0000-4000-8000-000000000001"));
        assert!(valid_row_id("m-abc123"));
        for bad in ["", "a b", "x/y", "é", &"a".repeat(65)] {
            assert!(!valid_row_id(bad), "{bad}");
        }
    }

    #[test]
    fn contract_examples_round_trip_through_the_real_types() {
        let c = mem();
        let k = contract();
        let input: MapperModelInput = serde_json::from_value(k["mapper_model_save"]["request"]["input"].clone()).unwrap();
        let saved = save(&c, &input).unwrap();
        let norm = |mut v: Value| {
            v["id"] = json!("<id>");
            v["createdAt"] = json!("<t>");
            v["updatedAt"] = json!("<t>");
            v
        };
        assert_eq!(norm(serde_json::to_value(&saved).unwrap()), norm(k["mapper_model_save"]["response"].clone()));
        let rows = list(&c, k["mapper_model_list"]["request"]["assetId"].as_str()).unwrap();
        assert_eq!(norm(serde_json::to_value(&rows[0]).unwrap()), norm(k["mapper_model_list"]["response"][0].clone()));
    }
}
