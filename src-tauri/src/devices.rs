//! Device library persistence: syncs researched device profiles
//! (app/devices/profiles/*.json) into the catalog, stores per-asset device
//! test results and learned MIDI maps. All SQL is parameterized.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::db::{database_path, new_id, now_iso, open_database};

pub const RESULT_STATUSES: &[&str] = &["pass", "fail", "unknown", "skipped"];

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncedProfile {
    pub profile_id: String,
    pub manufacturer_id: String,
    pub product_id: String,
    pub version: i64,
    /// True when the profile row was inserted by this sync (first time seen).
    pub created: bool,
    /// True when the stored JSON changed (insert or update).
    pub changed: bool,
    /// The "My <model>" asset created for a newly seen profile, if any.
    pub asset_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceTestResultInput {
    pub id: Option<String>,
    pub asset_id: String,
    pub profile_id: String,
    pub test_id: String,
    pub session_id: Option<String>,
    pub status: String,
    #[serde(default)]
    pub detail: Option<Value>,
    pub created_at: Option<String>,
}

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

fn str_field<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty())
}

/// Map a profile category onto the catalog product category vocabulary.
pub fn product_category(profile_category: &str) -> &'static str {
    match profile_category {
        "turntable" => "turntable",
        "controller" => "controller",
        "mixer" => "mixer",
        "audio-interface" => "audio_interface",
        "timecode-media" => "dvs_media",
        "software" => "software",
        _ => "other",
    }
}

/// Provenance for a spec: confirmed specs cite manufacturer documents; everything else is unverified research.
pub fn spec_provenance(confidence: Option<&str>) -> &'static str {
    if confidence == Some("confirmed") {
        "manufacturer-doc"
    } else {
        "research-unverified"
    }
}

fn ensure_manufacturer(conn: &Connection, name: &str, now: &str) -> Result<String, String> {
    if let Some(id) = conn
        .query_row("SELECT id FROM manufacturer WHERE name = ?1 COLLATE NOCASE", [name], |r| r.get::<_, String>(0))
        .optional()
        .map_err(e2s)?
    {
        return Ok(id);
    }
    let id = new_id();
    conn.execute(
        "INSERT INTO manufacturer (id, name, website, notes, created_at, updated_at) VALUES (?1, ?2, NULL, 'Added from the DeckChek device library', ?3, ?3)",
        params![id, name, now],
    )
    .map_err(e2s)?;
    Ok(id)
}

fn first_document_url(profile: &Value) -> Option<String> {
    profile
        .get("documents")
        .and_then(Value::as_array)?
        .iter()
        .filter_map(|d| str_field(d, "url"))
        .find(|u| u.starts_with("http"))
        .map(str::to_string)
}

fn sync_specs(conn: &Connection, profile_id: &str, product_id: &str, profile: &Value, now: &str) -> Result<(), String> {
    // Replace only the rows this sync owns (deterministic ids), leaving user-entered specs alone.
    conn.execute("DELETE FROM product_spec WHERE product_id = ?1 AND id LIKE ?2", params![product_id, format!("{profile_id}:spec:%")])
        .map_err(e2s)?;
    let specs = profile.get("specs").and_then(Value::as_array).cloned().unwrap_or_default();
    for (i, spec) in specs.iter().enumerate() {
        let Some(key) = str_field(spec, "key") else { continue };
        let value = spec.get("value").unwrap_or(&Value::Null);
        let (num, text, boolean) = match value {
            Value::Number(n) => (n.as_f64(), None, None),
            Value::Bool(b) => (None, None, Some(*b as i64)),
            Value::Null => (None, None, None),
            Value::String(s) => (None, Some(s.clone()), None),
            other => (None, Some(other.to_string()), None),
        };
        let source = str_field(spec, "source");
        let (source_title, source_url) = match source {
            Some(s) if s.starts_with("http") => (None, Some(s.to_string())),
            Some(s) => (Some(s.to_string()), None),
            None => (None, None),
        };
        let mut notes: Vec<String> = Vec::new();
        if let Some(label) = str_field(spec, "label") {
            notes.push(label.to_string());
        }
        if let Some(t) = spec.get("tolerance").filter(|t| !t.is_null()) {
            notes.push(format!("tolerance ±{t}"));
        }
        if let Some(n) = str_field(spec, "notes") {
            notes.push(n.to_string());
        }
        conn.execute(
            "INSERT INTO product_spec (id, product_id, key, numeric_value, text_value, boolean_value, unit, frequency_hz, method, provenance_type, source_title, source_url, retrieved_at, valid_from, valid_to, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, 'device-profile', ?8, ?9, ?10, ?11, NULL, NULL, ?12)",
            params![
                format!("{profile_id}:spec:{i}:{key}"),
                product_id,
                key,
                num,
                text,
                boolean,
                str_field(spec, "unit"),
                spec_provenance(str_field(spec, "confidence")),
                source_title,
                source_url,
                now,
                if notes.is_empty() { None } else { Some(notes.join(" · ")) },
            ],
        )
        .map_err(e2s)?;
    }
    Ok(())
}

/// Upsert manufacturer/product/product_spec + device_profile for each profile.
/// Idempotent: unchanged profiles keep their version; a profile seen for the
/// first time also gets one "My <model>" asset (the user's own unit).
pub fn sync_profiles(conn: &mut Connection, profiles: &[Value]) -> Result<Vec<SyncedProfile>, String> {
    let tx = conn.transaction().map_err(e2s)?;
    let now = now_iso(&tx)?;
    let mut out = Vec::new();
    for profile in profiles {
        let id = str_field(profile, "id").ok_or("profile.id is required")?.to_string();
        let manufacturer = str_field(profile, "manufacturer").ok_or_else(|| format!("{id}: manufacturer is required"))?;
        let model = str_field(profile, "model").ok_or_else(|| format!("{id}: model is required"))?;
        let category = product_category(str_field(profile, "category").unwrap_or("other"));
        let manufacturer_id = ensure_manufacturer(&tx, manufacturer, &now)?;
        let canonical = serde_json::to_string(profile).map_err(|e| e.to_string())?;

        let existing: Option<(Option<String>, String, i64)> = tx
            .query_row("SELECT product_id, json, version FROM device_profile WHERE id = ?1", [&id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .optional()
            .map_err(e2s)?;
        let known_product = existing.as_ref().and_then(|e| e.0.clone()).filter(|pid| {
            tx.query_row("SELECT COUNT(*) FROM product WHERE id = ?1", [pid], |r| r.get::<_, i64>(0)).map(|n| n > 0).unwrap_or(false)
        });
        let product_id = match known_product {
            Some(pid) => pid,
            None => tx
                .query_row(
                    "SELECT id FROM product WHERE manufacturer_id = ?1 AND model = ?2 COLLATE NOCASE ORDER BY created_at LIMIT 1",
                    params![manufacturer_id, model],
                    |r| r.get::<_, String>(0),
                )
                .optional()
                .map_err(e2s)?
                .unwrap_or_else(new_id),
        };
        tx.execute(
            "INSERT INTO product (id, manufacturer_id, category, model, variant, description, source_url, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?7)
             ON CONFLICT(id) DO UPDATE SET manufacturer_id = excluded.manufacturer_id, category = excluded.category, model = excluded.model,
               description = excluded.description, source_url = COALESCE(excluded.source_url, product.source_url), updated_at = excluded.updated_at",
            params![product_id, manufacturer_id, category, model, str_field(profile, "summary"), first_document_url(profile), now],
        )
        .map_err(e2s)?;
        sync_specs(&tx, &id, &product_id, profile, &now)?;

        let (version, created, changed) = match &existing {
            None => (1, true, true),
            Some((_, json, v)) if *json == canonical => (*v, false, false),
            Some((_, _, v)) => (v + 1, false, true),
        };
        tx.execute(
            "INSERT INTO device_profile (id, product_id, json, version, loaded_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET product_id = excluded.product_id, json = excluded.json, version = excluded.version, loaded_at = excluded.loaded_at",
            params![id, product_id, canonical, version, now],
        )
        .map_err(e2s)?;

        let mut asset_id = None;
        if created {
            let aid = new_id();
            tx.execute(
                "INSERT INTO asset (id, product_id, nickname, notes, is_deleted, created_at, updated_at) VALUES (?1, ?2, ?3, 'Created from the DeckChek device library. Rename it and add the serial number in Equipment.', 0, ?4, ?4)",
                params![aid, product_id, format!("My {model}"), now],
            )
            .map_err(e2s)?;
            asset_id = Some(aid);
        }
        out.push(SyncedProfile { profile_id: id, manufacturer_id, product_id, version, created, changed, asset_id });
    }
    tx.commit().map_err(e2s)?;
    Ok(out)
}

fn result_row(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    let detail: String = r.get(6)?;
    Ok(json!({
        "id": r.get::<_, String>(0)?,
        "assetId": r.get::<_, String>(1)?,
        "profileId": r.get::<_, String>(2)?,
        "testId": r.get::<_, String>(3)?,
        "sessionId": r.get::<_, Option<String>>(4)?,
        "status": r.get::<_, String>(5)?,
        "detail": serde_json::from_str::<Value>(&detail).unwrap_or(Value::Null),
        "createdAt": r.get::<_, String>(7)?,
    }))
}

const RESULT_COLS: &str = "id, asset_id, profile_id, test_id, session_id, status, detail_json, created_at";

pub fn save_result(conn: &Connection, input: &DeviceTestResultInput) -> Result<Value, String> {
    if !RESULT_STATUSES.contains(&input.status.as_str()) {
        return Err(format!("invalid status '{}' (expected pass, fail, unknown or skipped)", input.status));
    }
    if input.test_id.trim().is_empty() {
        return Err("testId is required".into());
    }
    let id = input.id.clone().filter(|s| !s.is_empty()).unwrap_or_else(new_id);
    let created = match &input.created_at {
        Some(s) if !s.is_empty() => s.clone(),
        _ => now_iso(conn)?,
    };
    // A session id is only kept when that run was actually persisted.
    let session = input.session_id.clone().filter(|sid| {
        conn.query_row("SELECT COUNT(*) FROM session WHERE id = ?1", [sid], |r| r.get::<_, i64>(0)).map(|n| n > 0).unwrap_or(false)
    });
    let detail = serde_json::to_string(input.detail.as_ref().unwrap_or(&json!({}))).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO device_test_result (id, asset_id, profile_id, test_id, session_id, status, detail_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, input.asset_id, input.profile_id, input.test_id, session, input.status, detail, created],
    )
    .map_err(e2s)?;
    conn.query_row(&format!("SELECT {RESULT_COLS} FROM device_test_result WHERE id = ?1"), [&id], result_row).map_err(e2s)
}

/// Results, newest first; all assets when `asset_id` is None.
pub fn list_results(conn: &Connection, asset_id: Option<&str>) -> Result<Vec<Value>, String> {
    let sql = format!(
        "SELECT {RESULT_COLS} FROM device_test_result {} ORDER BY created_at DESC, rowid DESC",
        if asset_id.is_some() { "WHERE asset_id = ?1" } else { "" }
    );
    let mut stmt = conn.prepare(&sql).map_err(e2s)?;
    let rows = match asset_id {
        Some(a) => stmt.query_map([a], result_row),
        None => stmt.query_map([], result_row),
    }
    .map_err(e2s)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)
}

pub fn save_midi_map(conn: &Connection, asset_id: &str, profile_id: Option<&str>, map: &Value) -> Result<Value, String> {
    if !map.is_object() {
        return Err("map must be an object".into());
    }
    let now = now_iso(conn)?;
    conn.execute(
        "INSERT INTO asset_midi_map (asset_id, profile_id, map_json, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(asset_id) DO UPDATE SET profile_id = excluded.profile_id, map_json = excluded.map_json, updated_at = excluded.updated_at",
        params![asset_id, profile_id, map.to_string(), now],
    )
    .map_err(e2s)?;
    Ok(get_midi_map(conn, asset_id)?.unwrap_or(Value::Null))
}

pub fn get_midi_map(conn: &Connection, asset_id: &str) -> Result<Option<Value>, String> {
    conn.query_row("SELECT asset_id, profile_id, map_json, updated_at FROM asset_midi_map WHERE asset_id = ?1", [asset_id], |r| {
        let map: String = r.get(2)?;
        Ok(json!({
            "assetId": r.get::<_, String>(0)?,
            "profileId": r.get::<_, Option<String>>(1)?,
            "map": serde_json::from_str::<Value>(&map).unwrap_or(Value::Null),
            "updatedAt": r.get::<_, String>(3)?,
        }))
    })
    .optional()
    .map_err(e2s)
}

fn with_db<T>(app: &AppHandle, f: impl FnOnce(&mut Connection) -> Result<T, String>) -> Result<T, String> {
    let mut conn = open_database(&database_path(app)?)?;
    f(&mut conn)
}

#[tauri::command]
pub fn device_profiles_sync(app: AppHandle, profiles: Vec<Value>) -> Result<Vec<SyncedProfile>, String> {
    with_db(&app, |c| sync_profiles(c, &profiles))
}

#[tauri::command]
pub fn device_test_result_save(app: AppHandle, result: DeviceTestResultInput) -> Result<Value, String> {
    with_db(&app, |c| save_result(c, &result))
}

#[tauri::command]
pub fn device_test_results(app: AppHandle, asset_id: Option<String>) -> Result<Vec<Value>, String> {
    with_db(&app, |c| list_results(c, asset_id.as_deref()))
}

#[tauri::command]
pub fn device_midi_map_save(app: AppHandle, asset_id: String, profile_id: Option<String>, map: Value) -> Result<Value, String> {
    with_db(&app, |c| save_midi_map(c, &asset_id, profile_id.as_deref(), &map))
}

#[tauri::command]
pub fn device_midi_map_get(app: AppHandle, asset_id: String) -> Result<Option<Value>, String> {
    with_db(&app, |c| get_midi_map(c, &asset_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        crate::catalog::seed_if_empty(&c).unwrap();
        c
    }

    fn profile(id: &str, manufacturer: &str, model: &str) -> Value {
        json!({
            "schemaVersion": 1, "id": id, "manufacturer": manufacturer, "model": model, "category": "turntable",
            "summary": "Test deck", "documents": [{"title": "Manual", "url": ""}, {"title": "Site", "url": "https://example.test/deck"}],
            "specs": [
                {"key": "speed", "label": "Speed", "value": 33.333, "unit": "rpm", "tolerance": 0.1, "source": "Manual p.4", "confidence": "confirmed", "notes": null},
                {"key": "wow", "label": "Wow", "value": "0.025", "unit": "%", "tolerance": null, "source": "https://example.test/spec", "confidence": "unverified", "notes": "forum"}
            ],
            "tests": []
        })
    }

    fn count(c: &Connection, sql: &str) -> i64 {
        c.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn sync_is_idempotent_and_reuses_seed_manufacturer() {
        let mut c = mem();
        let mfr_before = count(&c, "SELECT COUNT(*) FROM manufacturer");
        let profiles = vec![profile("pioneer-x", "pioneer dj", "X-1"), profile("acme-y", "Acme", "Y-2")];
        let first = sync_profiles(&mut c, &profiles).unwrap();
        assert!(first.iter().all(|p| p.created && p.changed && p.version == 1 && p.asset_id.is_some()));
        // "pioneer dj" matched the seeded "Pioneer DJ"; Acme is new
        assert_eq!(count(&c, "SELECT COUNT(*) FROM manufacturer"), mfr_before + 1);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM device_profile"), 2);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM product_spec WHERE id LIKE 'pioneer-x:spec:%'"), 2);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM product_spec WHERE provenance_type='manufacturer-doc' AND key='speed' AND source_title='Manual p.4'"), 2);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM product_spec WHERE provenance_type='research-unverified' AND source_url='https://example.test/spec'"), 2);
        let nick: String = c.query_row("SELECT nickname FROM asset WHERE id = ?1", [first[0].asset_id.as_ref().unwrap()], |r| r.get(0)).unwrap();
        assert_eq!(nick, "My X-1");
        let src: String = c.query_row("SELECT source_url FROM product WHERE id = ?1", [&first[0].product_id], |r| r.get(0)).unwrap();
        assert_eq!(src, "https://example.test/deck");

        let counts = |c: &Connection| ["manufacturer", "product", "product_spec", "asset", "device_profile"].map(|t| count(c, &format!("SELECT COUNT(*) FROM {t}")));
        let before = counts(&c);
        let second = sync_profiles(&mut c, &profiles).unwrap();
        assert_eq!(counts(&c), before, "second sync must not add rows");
        assert!(second.iter().all(|p| !p.created && !p.changed && p.version == 1 && p.asset_id.is_none()));
        assert_eq!(second[0].product_id, first[0].product_id);

        // a changed profile bumps the version but still creates no new asset
        let mut changed = profiles.clone();
        changed[0]["summary"] = json!("Updated summary");
        let third = sync_profiles(&mut c, &changed).unwrap();
        assert!(third[0].changed && third[0].version == 2 && third[0].asset_id.is_none());
        assert!(!third[1].changed);
        assert_eq!(count(&c, "SELECT COUNT(*) FROM asset"), before[3]);
    }

    #[test]
    fn sync_rejects_profiles_without_identity() {
        let mut c = mem();
        assert!(sync_profiles(&mut c, &[json!({"model": "x"})]).is_err());
        assert!(sync_profiles(&mut c, &[json!({"id": "a", "model": "x"})]).is_err());
        assert_eq!(count(&c, "SELECT COUNT(*) FROM device_profile"), 0);
    }

    #[test]
    fn results_round_trip_and_validate() {
        let mut c = mem();
        let synced = sync_profiles(&mut c, &[profile("acme-y", "Acme", "Y-2")]).unwrap();
        let asset = synced[0].asset_id.clone().unwrap();
        let input = |status: &str, test: &str, session: Option<&str>, at: &str| DeviceTestResultInput {
            id: None, asset_id: asset.clone(), profile_id: "acme-y".into(), test_id: test.into(), session_id: session.map(str::to_string),
            status: status.into(), detail: Some(json!({"detail": "Pass: 1==1", "metrics": [{"metricId": "driver_present", "value": 1}]})), created_at: Some(at.into()),
        };
        let a = save_result(&c, &input("pass", "t-driver", None, "2026-10-01T10:00:00Z")).unwrap();
        assert_eq!(a["status"], "pass");
        assert_eq!(a["detail"]["metrics"][0]["metricId"], "driver_present");
        // unknown session ids are dropped instead of violating the FK
        let b = save_result(&c, &input("fail", "t-midi", Some("no-such-session"), "2026-10-02T10:00:00Z")).unwrap();
        assert_eq!(b["sessionId"], Value::Null);
        // a persisted run's id is kept
        c.execute("INSERT INTO session (id, session_type, started_at, app_version, schema_version, status, config_snapshot_json) VALUES ('run-1', 'quick', 'now', 'test', 1, 'completed', '{}')", []).unwrap();
        let d = save_result(&c, &input("unknown", "t-quick", Some("run-1"), "2026-10-03T10:00:00Z")).unwrap();
        assert_eq!(d["sessionId"], "run-1");
        assert!(save_result(&c, &input("great", "t", None, "x")).is_err());
        assert!(save_result(&c, &input("pass", " ", None, "x")).is_err());

        let rows = list_results(&c, Some(&asset)).unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0]["testId"], "t-quick", "newest first");
        assert_eq!(list_results(&c, Some("other")).unwrap().len(), 0);
        assert_eq!(list_results(&c, None).unwrap().len(), 3);
        // re-saving by id replaces the row
        let mut again = input("skipped", "t-driver", None, "2026-10-04T10:00:00Z");
        again.id = Some(a["id"].as_str().unwrap().to_string());
        save_result(&c, &again).unwrap();
        assert_eq!(list_results(&c, None).unwrap().len(), 3);
    }

    #[test]
    fn learned_midi_map_round_trip() {
        let mut c = mem();
        let synced = sync_profiles(&mut c, &[profile("acme-y", "Acme", "Y-2")]).unwrap();
        let asset = synced[0].asset_id.clone().unwrap();
        assert!(get_midi_map(&c, &asset).unwrap().is_none());
        let map = json!({"mapSource": "learned", "controls": [{"id": "play", "label": "Play", "message": {"kind": "note", "channel": 1, "number": 11}}]});
        save_midi_map(&c, &asset, Some("acme-y"), &map).unwrap();
        let got = get_midi_map(&c, &asset).unwrap().unwrap();
        assert_eq!(got["map"]["controls"][0]["id"], "play");
        assert!(save_midi_map(&c, &asset, None, &json!([1])).is_err());
    }

    #[test]
    fn category_and_provenance_mapping() {
        assert_eq!(product_category("audio-interface"), "audio_interface");
        assert_eq!(product_category("timecode-media"), "dvs_media");
        assert_eq!(product_category("weird"), "other");
        assert_eq!(spec_provenance(Some("confirmed")), "manufacturer-doc");
        assert_eq!(spec_provenance(Some("unverified")), "research-unverified");
        assert_eq!(spec_provenance(None), "research-unverified");
    }
}
