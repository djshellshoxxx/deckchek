//! Test-media library persistence (FS-06): syncs built-in media profiles
//! (app/media/profiles/*.json) into `test_media`, stores user-defined custom
//! media and the "I own this" flag, and fills `dvs_media_side` durations for
//! timecode media that are linked to a device profile. All SQL is parameterized.
//!
//! Timecode facts (carrier, side lengths) are resolved by the frontend from
//! `app/timecode.js` and arrive in the sync payload as `timecodeFacts`; they
//! are used to populate `dvs_media_*` and are not stored in `profile_json`.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use tauri::AppHandle;

use crate::db::{database_path, new_id, now_iso, open_database};

pub const KINDS: &[&str] = &["test_record", "timecode", "tone_file"];
pub const PURPOSES: &[&str] = &[
    "reference_tone", "speed_tone", "sweep", "tracking", "anti_skate", "wow_flutter", "vta", "balance", "square_wave", "noise", "silence", "other",
];
pub const LEVEL_UNITS: &[&str] = &["cm/s_rms", "um_peak", "db", "dbfs"];
pub const CONFIDENCE: &[&str] = &["confirmed", "unverified"];
pub const MAX_JSON_BYTES: usize = 256 * 1024;
pub const MAX_TRACKS: usize = 100;
pub const MAX_STRING: usize = 500;
const SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct SyncSummary {
    pub inserted: usize,
    pub updated: usize,
    pub unchanged: usize,
    pub retired: usize,
}

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

fn s<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str).map(str::trim).filter(|x| !x.is_empty())
}

fn https(u: &str) -> bool {
    u.len() > 8 && u.starts_with("https://") && !u.contains(char::is_whitespace)
}

fn pos(v: &Value) -> bool {
    v.as_f64().map(|n| n.is_finite() && n > 0.0).unwrap_or(false)
}

fn kebab(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && !id.starts_with('-') && !id.ends_with('-') && !id.contains("--") && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Validate a profile; returns every problem as `field: message`. Mirrors `validateMediaProfile` in app/media-library.js.
pub fn validate_profile(p: &Value, builtin: bool) -> Vec<String> {
    let mut errs = Vec::new();
    let mut err = |f: &str, m: &str| errs.push(format!("{f}: {m}"));
    let Some(obj) = p.as_object() else {
        return vec!["profile must be an object".into()];
    };
    if p.get("schemaVersion").and_then(Value::as_i64) != Some(SCHEMA_VERSION) {
        err("schemaVersion", "must be 1");
    }
    if builtin && !s(p, "id").map(kebab).unwrap_or(false) {
        err("id", "built-in ids must be kebab-case, up to 64 characters");
    }
    if p.get("version").and_then(Value::as_i64).map(|v| v < 1).unwrap_or(true) {
        err("version", "must be an integer >= 1");
    }
    let kind = s(p, "kind").unwrap_or("");
    if !KINDS.contains(&kind) {
        err("kind", "must be test_record, timecode or tone_file");
    }
    if s(p, "name").is_none() {
        err("name", "is required");
    }
    if !s(p, "confidence").map(|c| CONFIDENCE.contains(&c)).unwrap_or(false) {
        err("confidence", "must be confirmed or unverified");
    }
    if let Some(r) = obj.get("playbackRpm").filter(|v| !v.is_null()) {
        if !pos(r) || r.as_f64().unwrap_or(0.0) > 100.0 {
            err("playbackRpm", "must be > 0 and <= 100");
        }
    }
    for k in ["name", "manufacturer", "rias", "notes", "productProfileId"] {
        if p.get(k).and_then(Value::as_str).map(|x| x.chars().count() > MAX_STRING).unwrap_or(false) {
            err(k, "is too long");
        }
    }
    match p.get("tracks").and_then(Value::as_array) {
        None => err("tracks", "must be an array"),
        Some(tracks) => {
            if tracks.len() > MAX_TRACKS {
                err("tracks", "at most 100 tracks");
            }
            let mut seen = HashSet::new();
            for (i, t) in tracks.iter().take(MAX_TRACKS).enumerate() {
                let f = |k: &str| format!("tracks[{i}].{k}");
                match s(t, "key") {
                    Some(k) if k.len() <= 32 && k.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') => {
                        if !seen.insert(k.to_string()) {
                            err(&f("key"), "duplicate track key");
                        }
                    }
                    _ => err(&f("key"), "must be 1-32 letters, digits, - or _"),
                }
                if !s(t, "purpose").map(|x| PURPOSES.contains(&x)).unwrap_or(false) {
                    err(&f("purpose"), "unknown purpose");
                }
                if let Some(v) = t.get("trackNo").filter(|v| !v.is_null()) {
                    if v.as_i64().map(|n| n < 1).unwrap_or(true) {
                        err(&f("trackNo"), "must be an integer >= 1");
                    }
                }
                if let Some(v) = t.get("frequencyHz").filter(|v| !v.is_null()) {
                    if !pos(v) || v.as_f64().unwrap_or(0.0) > 192000.0 {
                        err(&f("frequencyHz"), "must be > 0 and <= 192000");
                    }
                }
                if let Some(l) = t.get("level").filter(|v| !v.is_null()) {
                    if l.get("value").and_then(Value::as_f64).map(|n| !n.is_finite()).unwrap_or(true) {
                        err(&f("level.value"), "must be a number");
                    }
                    if !l.get("unit").and_then(Value::as_str).map(|u| LEVEL_UNITS.contains(&u)).unwrap_or(false) {
                        err(&f("level.unit"), "unknown unit");
                    }
                }
                if let Some(v) = t.get("durationS").filter(|v| !v.is_null()) {
                    if v.as_f64().map(|n| !n.is_finite() || n < 0.0).unwrap_or(true) {
                        err(&f("durationS"), "must be >= 0");
                    }
                }
                if let Some(c) = t.get("confidence").filter(|v| !v.is_null()) {
                    if !c.as_str().map(|x| CONFIDENCE.contains(&x)).unwrap_or(false) {
                        err(&f("confidence"), "must be confirmed or unverified");
                    }
                }
                if let Some(u) = t.get("source").filter(|v| !v.is_null()) {
                    if !u.as_str().map(https).unwrap_or(false) {
                        err(&f("source"), "must be an https URL");
                    }
                }
                for k in ["label", "notes", "side"] {
                    if t.get(k).and_then(Value::as_str).map(|x| x.chars().count() > MAX_STRING).unwrap_or(false) {
                        err(&f(k), "is too long");
                    }
                }
            }
        }
    }
    let tc = p.get("timecode").filter(|v| !v.is_null());
    if kind == "timecode" {
        match tc {
            Some(t) if s(t, "formatName").is_some() => {
                if let Some(c) = t.get("carrierHz").filter(|v| !v.is_null()) {
                    if !pos(c) {
                        err("timecode.carrierHz", "must be > 0");
                    }
                }
            }
            _ => err("timecode.formatName", "timecode media need timecode.formatName"),
        }
    } else if tc.is_some() {
        err("timecode", "only allowed on kind timecode");
    }
    if let Some(src) = p.get("sources").filter(|v| !v.is_null()) {
        match src.as_array() {
            None => err("sources", "must be an array"),
            Some(a) => {
                for (i, x) in a.iter().enumerate() {
                    if s(x, "title").is_none() {
                        err(&format!("sources[{i}].title"), "is required");
                    }
                    if !s(x, "url").map(https).unwrap_or(false) {
                        err(&format!("sources[{i}].url"), "must be https");
                    }
                }
            }
        }
    }
    errs
}

fn replace_tracks(conn: &Connection, media_id: &str, profile: &Value) -> Result<(), String> {
    conn.execute("DELETE FROM test_media_track WHERE media_id = ?1", [media_id]).map_err(e2s)?;
    for t in profile.get("tracks").and_then(Value::as_array).into_iter().flatten() {
        let key = s(t, "key").unwrap_or_default();
        let level = t.get("level").filter(|l| l.is_object());
        conn.execute(
            "INSERT INTO test_media_track (id, media_id, track_key, side, track_no, purpose, frequency_hz, level_value, level_unit, duration_s, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                format!("{media_id}:{key}"),
                media_id,
                key,
                s(t, "side"),
                t.get("trackNo").and_then(Value::as_i64),
                s(t, "purpose").unwrap_or("other"),
                t.get("frequencyHz").and_then(Value::as_f64),
                level.and_then(|l| l.get("value")).and_then(Value::as_f64),
                level.and_then(|l| l.get("unit")).and_then(Value::as_str),
                t.get("durationS").and_then(Value::as_f64),
                s(t, "notes").or_else(|| s(t, "label")),
            ],
        )
        .map_err(e2s)?;
    }
    Ok(())
}

/// Populate dvs_media_profile/dvs_media_side for a timecode medium linked to a product.
/// Side durations are the frontend-resolved `lengthCycles / resolution` from TIMECODE_FORMATS.
fn sync_dvs(conn: &Connection, media_id: &str, product_id: &str, profile: &Value, facts: &Value) -> Result<(), String> {
    let sides: Vec<&Value> = facts.get("sides").and_then(Value::as_array).map(|a| a.iter().collect()).unwrap_or_default();
    if sides.is_empty() {
        return Ok(());
    }
    let cd = sides.iter().all(|x| s(x, "label").map(|l| l.eq_ignore_ascii_case("cd")).unwrap_or(false));
    let family = s(facts, "vendor").or_else(|| s(profile, "manufacturer")).or_else(|| s(profile, "name")).unwrap_or("unknown");
    let doc = profile
        .get("sources")
        .and_then(Value::as_array)
        .and_then(|a| a.iter().find(|x| x.get("verified").and_then(Value::as_bool) == Some(true)))
        .and_then(|x| s(x, "url"));
    conn.execute(
        "INSERT INTO dvs_media_profile (product_id, family, version, medium_type, analyzer_key, documentation_url, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(product_id) DO UPDATE SET family = excluded.family, version = excluded.version, medium_type = excluded.medium_type,
           analyzer_key = excluded.analyzer_key, documentation_url = excluded.documentation_url, notes = excluded.notes",
        params![
            product_id,
            family,
            profile.get("version").and_then(Value::as_i64).unwrap_or(1).to_string(),
            if cd { "cd" } else { "vinyl" },
            s(facts, "formatName"),
            doc,
            s(profile, "notes"),
        ],
    )
    .map_err(e2s)?;
    conn.execute("DELETE FROM dvs_media_side WHERE profile_id = ?1 AND id LIKE ?2", params![product_id, format!("{media_id}:side:%")]).map_err(e2s)?;
    let rpm = facts.get("atRpm").and_then(Value::as_f64);
    for side in sides {
        let Some(label) = s(side, "label") else { continue };
        conn.execute(
            "INSERT INTO dvs_media_side (id, profile_id, side_label, nominal_rpm, duration_sec, public_code, absolute_position_supported, relative_supported) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, NULL)",
            params![format!("{media_id}:side:{label}"), product_id, label, rpm, side.get("durationSec").and_then(Value::as_f64)],
        )
        .map_err(e2s)?;
    }
    Ok(())
}

/// Upsert built-in media. Unchanged profiles stay untouched; built-ins that no longer ship are flagged `retired`
/// (never deleted, so saved results keep their medium); custom rows are never touched. An empty set retires nothing.
pub fn sync_profiles(conn: &mut Connection, profiles: &[Value]) -> Result<SyncSummary, String> {
    let tx = conn.transaction().map_err(e2s)?;
    let now = now_iso(&tx)?;
    let mut sum = SyncSummary::default();
    let mut shipped: Vec<String> = Vec::new();
    for raw in profiles {
        let mut profile = raw.clone();
        let facts = profile.as_object_mut().and_then(|o| o.remove("timecodeFacts")).unwrap_or(Value::Null);
        let problems = validate_profile(&profile, true);
        let id = s(&profile, "id").unwrap_or("?").to_string();
        if !problems.is_empty() {
            return Err(format!("{id}: {}", problems.join("; ")));
        }
        let source: Option<String> = tx.query_row("SELECT source FROM test_media WHERE id = ?1", [&id], |r| r.get(0)).optional().map_err(e2s)?;
        if source.as_deref() == Some("custom") {
            return Err(format!("{id}: id-collision with a custom medium"));
        }
        let product_id: Option<String> = match s(&profile, "productProfileId") {
            Some(pp) => tx.query_row("SELECT product_id FROM device_profile WHERE id = ?1", [pp], |r| r.get(0)).optional().map_err(e2s)?.flatten(),
            None => None,
        };
        let json = serde_json::to_string(&profile).map_err(|e| e.to_string())?;
        let existing: Option<(String, Option<String>, i64)> = tx
            .query_row("SELECT profile_json, product_id, retired FROM test_media WHERE id = ?1", [&id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .optional()
            .map_err(e2s)?;
        match &existing {
            Some((j, p, 0)) if *j == json && *p == product_id => sum.unchanged += 1,
            Some(_) => {
                tx.execute(
                    "UPDATE test_media SET kind = ?2, manufacturer = ?3, product_id = ?4, name = ?5, version = ?6, profile_json = ?7, retired = 0, updated_at = ?8 WHERE id = ?1",
                    params![id, s(&profile, "kind"), s(&profile, "manufacturer"), product_id, s(&profile, "name"), profile["version"].as_i64(), json, now],
                )
                .map_err(e2s)?;
                replace_tracks(&tx, &id, &profile)?;
                sum.updated += 1;
            }
            None => {
                tx.execute(
                    "INSERT INTO test_media (id, source, kind, manufacturer, product_id, name, version, profile_json, owned, retired, created_at, updated_at) VALUES (?1, 'builtin', ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, ?8, ?8)",
                    params![id, s(&profile, "kind"), s(&profile, "manufacturer"), product_id, s(&profile, "name"), profile["version"].as_i64(), json, now],
                )
                .map_err(e2s)?;
                replace_tracks(&tx, &id, &profile)?;
                sum.inserted += 1;
            }
        }
        if let Some(pid) = &product_id {
            sync_dvs(&tx, &id, pid, &profile, &facts)?;
        }
        shipped.push(id);
    }
    if !shipped.is_empty() {
        let stale: Vec<String> = {
            let mut stmt = tx.prepare("SELECT id FROM test_media WHERE source = 'builtin' AND retired = 0").map_err(e2s)?;
            let it = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(e2s)?;
            it.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)?
        };
        for id in stale.into_iter().filter(|id| !shipped.contains(id)) {
            tx.execute("UPDATE test_media SET retired = 1, updated_at = ?2 WHERE id = ?1", params![id, now]).map_err(e2s)?;
            sum.retired += 1;
        }
    }
    tx.commit().map_err(e2s)?;
    Ok(sum)
}

/// All media, owned first then by name. Retired rows only when `include_retired`.
pub fn list(conn: &Connection, include_retired: bool) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, source, kind, name, version, owned, retired, profile_json FROM test_media
             WHERE (?1 = 1 OR retired = 0) ORDER BY owned DESC, name COLLATE NOCASE, id",
        )
        .map_err(e2s)?;
    let rows = stmt
        .query_map([include_retired as i64], |r| {
            let json: String = r.get(7)?;
            Ok(json!({
                "id": r.get::<_, String>(0)?, "source": r.get::<_, String>(1)?, "kind": r.get::<_, String>(2)?,
                "name": r.get::<_, String>(3)?, "version": r.get::<_, i64>(4)?, "owned": r.get::<_, i64>(5)? != 0,
                "retired": r.get::<_, i64>(6)? != 0, "profile": serde_json::from_str::<Value>(&json).unwrap_or(Value::Null),
            }))
        })
        .map_err(e2s)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)
}

/// Save a custom medium. The id is taken from the profile only when it names an existing custom row (an edit);
/// otherwise a fresh id is generated, so ids never come from user input. Built-in ids are rejected (`id-collision`).
pub fn custom_save(conn: &mut Connection, profile: &Value) -> Result<String, String> {
    let text = serde_json::to_string(profile).map_err(|e| e.to_string())?;
    if text.len() > MAX_JSON_BYTES {
        return Err(format!("profile is {} bytes; the limit is {MAX_JSON_BYTES}", text.len()));
    }
    let problems = validate_profile(profile, false);
    if !problems.is_empty() {
        return Err(problems.join("; "));
    }
    let tx = conn.transaction().map_err(e2s)?;
    let now = now_iso(&tx)?;
    let mut id = new_id();
    let mut edit = false;
    if let Some(given) = s(profile, "id") {
        let row: Option<String> = tx.query_row("SELECT source FROM test_media WHERE id = ?1", [given], |r| r.get(0)).optional().map_err(e2s)?;
        match row.as_deref() {
            Some("builtin") => return Err("id-collision: id belongs to a built-in medium".into()),
            Some(_) => {
                id = given.to_string();
                edit = true;
            }
            None => {}
        }
    }
    let mut stored = profile.clone();
    stored["id"] = json!(id);
    let json = serde_json::to_string(&stored).map_err(|e| e.to_string())?;
    if edit {
        tx.execute(
            "UPDATE test_media SET kind = ?2, manufacturer = ?3, name = ?4, version = ?5, profile_json = ?6, retired = 0, updated_at = ?7 WHERE id = ?1",
            params![id, s(&stored, "kind"), s(&stored, "manufacturer"), s(&stored, "name"), stored["version"].as_i64(), json, now],
        )
        .map_err(e2s)?;
    } else {
        tx.execute(
            "INSERT INTO test_media (id, source, kind, manufacturer, product_id, name, version, profile_json, owned, retired, created_at, updated_at) VALUES (?1, 'custom', ?2, ?3, NULL, ?4, ?5, ?6, 0, 0, ?7, ?7)",
            params![id, s(&stored, "kind"), s(&stored, "manufacturer"), s(&stored, "name"), stored["version"].as_i64(), json, now],
        )
        .map_err(e2s)?;
    }
    replace_tracks(&tx, &id, &stored)?;
    tx.commit().map_err(e2s)?;
    Ok(id)
}

/// Delete a custom medium. One that saved results still reference is retired instead (hidden, history intact).
/// Returns "deleted" or "retired". Built-ins cannot be deleted.
pub fn custom_delete(conn: &Connection, id: &str) -> Result<&'static str, String> {
    let source: Option<String> = conn.query_row("SELECT source FROM test_media WHERE id = ?1", [id], |r| r.get(0)).optional().map_err(e2s)?;
    match source.as_deref() {
        None => Err(format!("unknown medium '{id}'")),
        Some("builtin") => Err("built-in media are read-only; duplicate and edit instead".into()),
        Some(_) => {
            let used: i64 = conn.query_row("SELECT COUNT(*) FROM device_test_result WHERE media_id = ?1", [id], |r| r.get(0)).map_err(e2s)?;
            if used > 0 {
                let now = now_iso(conn)?;
                conn.execute("UPDATE test_media SET retired = 1, owned = 0, updated_at = ?2 WHERE id = ?1", params![id, now]).map_err(e2s)?;
                Ok("retired")
            } else {
                conn.execute("DELETE FROM test_media WHERE id = ?1", [id]).map_err(e2s)?;
                Ok("deleted")
            }
        }
    }
}

pub fn owned_set(conn: &Connection, media_id: &str, owned: bool) -> Result<(), String> {
    let now = now_iso(conn)?;
    let n = conn.execute("UPDATE test_media SET owned = ?2, updated_at = ?3 WHERE id = ?1", params![media_id, owned as i64, now]).map_err(e2s)?;
    if n == 0 {
        return Err(format!("unknown medium '{media_id}'"));
    }
    Ok(())
}

fn with_db<T>(app: &AppHandle, f: impl FnOnce(&mut Connection) -> Result<T, String>) -> Result<T, String> {
    let mut conn = open_database(&database_path(app)?)?;
    f(&mut conn)
}

#[tauri::command]
pub fn media_profiles_sync(app: AppHandle, profiles: Vec<Value>) -> Result<SyncSummary, String> {
    with_db(&app, |c| sync_profiles(c, &profiles))
}

#[tauri::command]
pub fn media_list(app: AppHandle, include_retired: Option<bool>) -> Result<Vec<Value>, String> {
    with_db(&app, |c| list(c, include_retired.unwrap_or(false)))
}

#[tauri::command]
pub fn media_custom_save(app: AppHandle, profile: Value) -> Result<Value, String> {
    with_db(&app, |c| custom_save(c, &profile).map(|id| json!({ "id": id })))
}

#[tauri::command]
pub fn media_custom_delete(app: AppHandle, id: String) -> Result<(), String> {
    with_db(&app, |c| custom_delete(c, &id).map(|_| ()))
}

#[tauri::command]
pub fn media_owned_set(app: AppHandle, media_id: String, owned: bool) -> Result<(), String> {
    with_db(&app, |c| owned_set(c, &media_id, owned))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;
    use std::path::Path;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        crate::catalog::seed_if_empty(&c).unwrap();
        c
    }

    fn count(c: &Connection, sql: &str) -> i64 {
        c.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    fn rec(id: &str, version: i64) -> Value {
        json!({"schemaVersion":1,"id":id,"version":version,"kind":"test_record","manufacturer":"Acme","name":format!("Disc {id}"),"playbackRpm":33.333,
          "confidence":"unverified","tracks":[{"key":"t5","trackNo":5,"purpose":"reference_tone","frequencyHz":1000,"level":{"value":5,"unit":"cm/s_rms"},"confidence":"unverified"},
          {"key":"t9","trackNo":9,"purpose":"tracking","frequencyHz":315,"level":{"value":50,"unit":"um_peak"},"confidence":"unverified"}],"timecode":null,"sources":[]})
    }

    fn custom(name: &str) -> Value {
        json!({"schemaVersion":1,"version":1,"kind":"test_record","name":name,"confidence":"unverified","tracks":[{"key":"a","purpose":"speed_tone","frequencyHz":3150}],"timecode":null})
    }

    fn repo_json(rel: &str) -> Value {
        serde_json::from_str(&std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(rel)).unwrap()).unwrap()
    }

    #[test]
    fn migration_creates_tables_and_result_columns() {
        let c = mem();
        for t in ["test_media", "test_media_track"] {
            assert_eq!(count(&c, &format!("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='{t}'")), 1, "{t}");
        }
        let cols: Vec<String> = c.prepare("PRAGMA table_info(device_test_result)").unwrap().query_map([], |r| r.get::<_, String>(1)).unwrap().map(Result::unwrap).collect();
        assert!(cols.contains(&"media_id".to_string()) && cols.contains(&"media_track_key".to_string()));
        assert!(c.execute("INSERT INTO test_media (id, source, kind, name, version, profile_json, created_at, updated_at) VALUES ('x','alien','test_record','n',1,'{}','t','t')", []).is_err());
    }

    #[test]
    fn sync_inserts_updates_and_is_idempotent() {
        let mut c = mem();
        let first = sync_profiles(&mut c, &[rec("disc-a", 1), rec("disc-b", 1)]).unwrap();
        assert_eq!(first, SyncSummary { inserted: 2, updated: 0, unchanged: 0, retired: 0 });
        assert_eq!(count(&c, "SELECT COUNT(*) FROM test_media_track"), 4);
        let again = sync_profiles(&mut c, &[rec("disc-a", 1), rec("disc-b", 1)]).unwrap();
        assert_eq!(again, SyncSummary { inserted: 0, updated: 0, unchanged: 2, retired: 0 });
        // newer version of A: updated, tracks replaced
        let mut a2 = rec("disc-a", 2);
        a2["tracks"].as_array_mut().unwrap().pop();
        let up = sync_profiles(&mut c, &[a2, rec("disc-b", 1)]).unwrap();
        assert_eq!(up, SyncSummary { inserted: 0, updated: 1, unchanged: 1, retired: 0 });
        assert_eq!(count(&c, "SELECT version FROM test_media WHERE id='disc-a'"), 2);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM test_media_track WHERE media_id='disc-a'"), 1);
        let (f, lv, u): (f64, f64, String) = c.query_row("SELECT frequency_hz, level_value, level_unit FROM test_media_track WHERE id='disc-b:t5'", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap();
        assert_eq!((f, lv, u.as_str()), (1000.0, 5.0, "cm/s_rms"));
    }

    #[test]
    fn ac7_update_leaves_custom_media_owned_flags_and_results_untouched() {
        let mut c = mem();
        sync_profiles(&mut c, &[rec("disc-a", 1)]).unwrap();
        let cid = custom_save(&mut c, &custom("Mine")).unwrap();
        owned_set(&c, "disc-a", true).unwrap();
        owned_set(&c, &cid, true).unwrap();
        // a result that used the built-in
        c.execute("INSERT INTO device_profile (id, product_id, json, version, loaded_at) VALUES ('p', NULL, '{}', 1, 't')", []).unwrap();
        c.execute("INSERT INTO asset (id, nickname, is_deleted, created_at, updated_at) VALUES ('as', 'x', 0, 't', 't')", []).unwrap();
        c.execute("INSERT INTO device_test_result (id, asset_id, profile_id, test_id, status, created_at, media_id, media_track_key) VALUES ('r1','as','p','speed','pass','t','disc-a','t5')", []).unwrap();
        let custom_json_before: String = c.query_row("SELECT profile_json FROM test_media WHERE id = ?1", [&cid], |r| r.get(0)).unwrap();
        let up = sync_profiles(&mut c, &[rec("disc-a", 2), rec("disc-c", 1)]).unwrap();
        assert_eq!((up.inserted, up.updated, up.retired), (1, 1, 0));
        let custom_json_after: String = c.query_row("SELECT profile_json FROM test_media WHERE id = ?1", [&cid], |r| r.get(0)).unwrap();
        assert_eq!(custom_json_before, custom_json_after);
        assert_eq!(count(&c, "SELECT owned FROM test_media WHERE id='disc-a'"), 1, "ownership survives a built-in update");
        assert_eq!(count(&c, &format!("SELECT owned FROM test_media WHERE id='{cid}'")), 1);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM device_test_result WHERE media_id='disc-a' AND media_track_key='t5'"), 1);
    }

    #[test]
    fn removed_builtins_retire_and_come_back_and_empty_sync_retires_nothing() {
        let mut c = mem();
        sync_profiles(&mut c, &[rec("disc-a", 1), rec("disc-b", 1)]).unwrap();
        assert_eq!(sync_profiles(&mut c, &[]).unwrap(), SyncSummary::default());
        let r = sync_profiles(&mut c, &[rec("disc-a", 1)]).unwrap();
        assert_eq!((r.retired, r.unchanged), (1, 1));
        assert_eq!(list(&c, false).unwrap().len(), 1);
        assert_eq!(list(&c, true).unwrap().len(), 2);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM test_media WHERE id='disc-b'"), 1, "retired, never deleted");
        let back = sync_profiles(&mut c, &[rec("disc-a", 1), rec("disc-b", 1)]).unwrap();
        assert_eq!((back.updated, back.unchanged), (1, 1));
        assert_eq!(count(&c, "SELECT retired FROM test_media WHERE id='disc-b'"), 0);
    }

    #[test]
    fn sync_rejects_invalid_and_custom_collisions_atomically() {
        let mut c = mem();
        let mut bad = rec("disc-b", 1);
        bad["kind"] = json!("cd");
        let err = sync_profiles(&mut c, &[rec("disc-a", 1), bad]).unwrap_err();
        assert!(err.contains("disc-b") && err.contains("kind"), "{err}");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM test_media"), 0, "all or nothing");
        let cid = custom_save(&mut c, &custom("Mine")).unwrap();
        let mut clash = rec("x", 1);
        clash["id"] = json!(cid);
        assert!(sync_profiles(&mut c, &[clash]).is_err());
    }

    #[test]
    fn custom_crud_rules() {
        let mut c = mem();
        sync_profiles(&mut c, &[rec("disc-a", 1)]).unwrap();
        // user-supplied id is never kept for a new medium
        let mut p = custom("A");
        p["id"] = json!("../../evil");
        let id = custom_save(&mut c, &p).unwrap();
        assert_ne!(id, "../../evil");
        assert_eq!(id.len(), 36);
        // edit keeps the id and flags
        owned_set(&c, &id, true).unwrap();
        let mut p2 = custom("A2");
        p2["id"] = json!(id);
        assert_eq!(custom_save(&mut c, &p2).unwrap(), id);
        let row = list(&c, false).unwrap().into_iter().find(|r| r["id"] == json!(id)).unwrap();
        assert_eq!((row["name"].as_str(), row["owned"].as_bool(), row["source"].as_str()), (Some("A2"), Some(true), Some("custom")));
        assert_eq!(row["profile"]["id"], json!(id));
        // built-in id rejected, built-in not deletable
        let mut clash = custom("X");
        clash["id"] = json!("disc-a");
        assert!(custom_save(&mut c, &clash).unwrap_err().contains("id-collision"));
        assert!(custom_delete(&c, "disc-a").is_err());
        assert!(custom_delete(&c, "nope").is_err());
        assert!(owned_set(&c, "nope", true).is_err());
        // invalid profile stores nothing
        let mut inv = custom("Bad");
        inv["tracks"] = json!([{"key":"a","purpose":"nope","frequencyHz":-1}]);
        let before = count(&c, "SELECT COUNT(*) FROM test_media");
        let e = custom_save(&mut c, &inv).unwrap_err();
        assert!(e.contains("tracks[0].purpose") && e.contains("tracks[0].frequencyHz"), "{e}");
        assert_eq!(count(&c, "SELECT COUNT(*) FROM test_media"), before);
        // delete cascades tracks
        assert_eq!(custom_delete(&c, &id).unwrap(), "deleted");
        assert_eq!(count(&c, &format!("SELECT COUNT(*) FROM test_media_track WHERE media_id='{id}'")), 0);
    }

    #[test]
    fn custom_media_with_results_is_retired_not_deleted() {
        let mut c = mem();
        let id = custom_save(&mut c, &custom("Used")).unwrap();
        c.execute("INSERT INTO device_profile (id, product_id, json, version, loaded_at) VALUES ('p', NULL, '{}', 1, 't')", []).unwrap();
        c.execute("INSERT INTO asset (id, nickname, is_deleted, created_at, updated_at) VALUES ('as', 'x', 0, 't', 't')", []).unwrap();
        c.execute("INSERT INTO device_test_result (id, asset_id, profile_id, test_id, status, created_at, media_id, media_track_key) VALUES ('r1','as','p','speed','pass','t',?1,'a')", [&id]).unwrap();
        assert_eq!(custom_delete(&c, &id).unwrap(), "retired");
        assert!(list(&c, false).unwrap().is_empty());
        assert_eq!(list(&c, true).unwrap().len(), 1);
        c.execute_batch("PRAGMA foreign_key_check;").unwrap();
        assert_eq!(count(&c, "SELECT COUNT(*) FROM device_test_result WHERE media_id IS NOT NULL"), 1);
    }

    #[test]
    fn size_and_track_caps() {
        let mut c = mem();
        let mut many = custom("Many");
        many["tracks"] = Value::Array((0..101).map(|i| json!({"key": format!("k{i}"), "purpose": "other"})).collect());
        assert!(custom_save(&mut c, &many).unwrap_err().contains("100"));
        let mut big = custom("Big");
        big["notes"] = json!("x".repeat(MAX_JSON_BYTES));
        assert!(custom_save(&mut c, &big).unwrap_err().contains("limit"));
        let mut http = custom("Http");
        http["tracks"][0]["source"] = json!("http://insecure.example/x");
        assert!(custom_save(&mut c, &http).unwrap_err().contains("https"));
    }

    /// FS-06 AC: dvs_media_side durations come from the sides table (lengthCycles / resolution).
    #[test]
    fn dvs_media_side_durations_populate_for_linked_timecode_media() {
        let mut c = mem();
        let dev = repo_json("app/devices/profiles/serato-control-vinyl-cv025.json");
        crate::devices::sync_profiles(&mut c, &[dev]).unwrap();
        let mut p = repo_json("app/media/profiles/serato-cv025.json");
        p["timecodeFacts"] = json!({"formatName":"Serato CV02.5","vendor":"Serato","carrierHz":1000,"atRpm":33.333333,"sides":[
            {"label":"A","durationSec":712.0},{"label":"B","durationSec":922.0}]});
        let r = sync_profiles(&mut c, &[p.clone()]).unwrap();
        assert_eq!(r.inserted, 1);
        let pid: String = c.query_row("SELECT product_id FROM test_media WHERE id='serato-cv025'", [], |r| r.get(0)).unwrap();
        assert!(!pid.is_empty());
        let sides: Vec<(String, f64, f64)> = c.prepare("SELECT side_label, duration_sec, nominal_rpm FROM dvs_media_side WHERE profile_id=?1 ORDER BY side_label").unwrap()
            .query_map([&pid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap().map(Result::unwrap).collect();
        assert_eq!(sides, vec![("A".to_string(), 712.0, 33.333333), ("B".to_string(), 922.0, 33.333333)]);
        let (fam, kind, key): (String, String, String) = c.query_row("SELECT family, medium_type, analyzer_key FROM dvs_media_profile WHERE product_id=?1", [&pid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap();
        assert_eq!((fam.as_str(), kind.as_str(), key.as_str()), ("Serato", "vinyl", "Serato CV02.5"));
        // timecodeFacts are not persisted in profile_json; re-sync is idempotent (no duplicate sides)
        let stored: String = c.query_row("SELECT profile_json FROM test_media WHERE id='serato-cv025'", [], |r| r.get(0)).unwrap();
        assert!(!stored.contains("timecodeFacts"));
        assert_eq!(sync_profiles(&mut c, &[p]).unwrap().unchanged, 1);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM dvs_media_side"), 2);
    }

    #[test]
    fn timecode_media_before_device_sync_has_no_product_then_links_later() {
        let mut c = mem();
        let mut p = repo_json("app/media/profiles/serato-cv025.json");
        p["timecodeFacts"] = json!({"formatName":"Serato CV02.5","carrierHz":1000,"atRpm":33.333333,"sides":[{"label":"A","durationSec":712.0}]});
        sync_profiles(&mut c, &[p.clone()]).unwrap();
        assert_eq!(count(&c, "SELECT COUNT(*) FROM test_media WHERE product_id IS NULL"), 1);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM dvs_media_side"), 0);
        crate::devices::sync_profiles(&mut c, &[repo_json("app/devices/profiles/serato-control-vinyl-cv025.json")]).unwrap();
        let r = sync_profiles(&mut c, &[p]).unwrap();
        assert_eq!(r.updated, 1);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM dvs_media_side"), 1);
    }

    #[test]
    fn every_shipped_profile_passes_rust_validation() {
        let idx = repo_json("app/media/index.json");
        let ids = idx["profiles"].as_array().unwrap();
        assert!(ids.len() >= 15);
        let mut c = mem();
        let profiles: Vec<Value> = ids.iter().map(|id| repo_json(&format!("app/media/profiles/{}.json", id.as_str().unwrap()))).collect();
        for p in &profiles {
            assert_eq!(validate_profile(p, true), Vec::<String>::new(), "{}", p["id"]);
        }
        assert_eq!(sync_profiles(&mut c, &profiles).unwrap().inserted, ids.len());
    }

    #[test]
    fn upgrade_from_v004_fixture_adds_media_tables_and_keeps_rows() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        let sql = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/db/v0.04.sql")).unwrap();
        c.execute_batch(&sql).unwrap();
        let before = count(&c, "SELECT COUNT(*) FROM device_test_result");
        apply_migrations(&c).unwrap();
        assert_eq!(count(&c, "SELECT COUNT(*) FROM device_test_result"), before);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM sqlite_master WHERE name='test_media'"), 1);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM device_test_result WHERE media_id IS NOT NULL"), 0);
        assert_eq!(c.prepare("PRAGMA foreign_key_check").unwrap().query_map([], |_| Ok(())).unwrap().count(), 0);
        apply_migrations(&c).unwrap();
    }
}
