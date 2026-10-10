//! Small persistent key/value store (FS-00 §4.5, table from `0003_app_state.sql`).
//! For state Rust must read, or that must survive a WebView reset (`wizard`,
//! `backup`, `monitor`, …). UI preferences stay in localStorage.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::db::{database_path, now_iso, open_database};

/// Largest accepted value, measured as its serialized JSON in bytes.
pub const MAX_VALUE_BYTES: usize = 256 * 1024;
/// Longest accepted key (`^[a-z][a-z0-9_.]{0,63}$`).
pub const MAX_KEY_LEN: usize = 64;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStateEntry {
    pub value: Value,
    pub updated_at: String,
}

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

/// Keys match `^[a-z][a-z0-9_.]{0,63}$`.
pub fn validate_key(key: &str) -> Result<(), String> {
    let bytes = key.as_bytes();
    let ok = !bytes.is_empty()
        && bytes.len() <= MAX_KEY_LEN
        && bytes[0].is_ascii_lowercase()
        && bytes.iter().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'_' || *b == b'.');
    if ok {
        Ok(())
    } else {
        Err(format!("invalid app_state key '{key}': expected ^[a-z][a-z0-9_.]{{0,63}}$"))
    }
}

pub fn get(conn: &Connection, key: &str) -> Result<Option<AppStateEntry>, String> {
    validate_key(key)?;
    let row: Option<(String, String)> = conn
        .query_row("SELECT value_json, updated_at FROM app_state WHERE key = ?1", [key], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()
        .map_err(e2s)?;
    match row {
        None => Ok(None),
        Some((json, updated_at)) => {
            let value = serde_json::from_str(&json).map_err(|e| format!("app_state '{key}' holds invalid JSON: {e}"))?;
            Ok(Some(AppStateEntry { value, updated_at }))
        }
    }
}

pub fn set(conn: &Connection, key: &str, value: &Value) -> Result<(), String> {
    validate_key(key)?;
    let json = serde_json::to_string(value).map_err(|e| e.to_string())?;
    if json.len() > MAX_VALUE_BYTES {
        return Err(format!("app_state '{key}' value is {} bytes; the limit is {MAX_VALUE_BYTES}", json.len()));
    }
    let now = now_iso(conn)?;
    conn.execute(
        "INSERT INTO app_state (key, value_json, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        params![key, json, now],
    )
    .map_err(e2s)?;
    Ok(())
}

/// Removes the key; returns whether it existed.
pub fn delete(conn: &Connection, key: &str) -> Result<bool, String> {
    validate_key(key)?;
    conn.execute("DELETE FROM app_state WHERE key = ?1", [key]).map(|n| n > 0).map_err(e2s)
}

#[tauri::command]
pub fn app_state_get(app: AppHandle, key: String) -> Result<Option<AppStateEntry>, String> {
    let conn = open_database(&database_path(&app)?)?;
    get(&conn, &key)
}

#[tauri::command]
pub fn app_state_set(app: AppHandle, key: String, value: Value) -> Result<(), String> {
    let conn = open_database(&database_path(&app)?)?;
    set(&conn, &key, &value)
}

#[tauri::command]
pub fn app_state_delete(app: AppHandle, key: String) -> Result<(), String> {
    let conn = open_database(&database_path(&app)?)?;
    delete(&conn, &key).map(|_| ())
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
        c
    }

    #[test]
    fn round_trip_overwrite_and_delete() {
        let c = mem();
        assert_eq!(get(&c, "wizard").unwrap(), None);
        let v = json!({"step": 3, "done": ["input", "calibration"], "deck": {"name": "Left ü", "gain": -6}});
        set(&c, "wizard", &v).unwrap();
        let got = get(&c, "wizard").unwrap().unwrap();
        assert_eq!(got.value, v);
        assert!(got.updated_at.ends_with('Z') && got.updated_at.contains('T'), "{}", got.updated_at);
        set(&c, "wizard", &json!(null)).unwrap();
        assert_eq!(get(&c, "wizard").unwrap().unwrap().value, Value::Null);
        set(&c, "backup.last", &json!("2026-10-10")).unwrap();
        let n: i64 = c.query_row("SELECT COUNT(*) FROM app_state", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 2, "overwrite must not add a row");
        assert!(delete(&c, "wizard").unwrap());
        assert!(!delete(&c, "wizard").unwrap());
        assert_eq!(get(&c, "wizard").unwrap(), None);
        assert!(get(&c, "backup.last").unwrap().is_some());
    }

    #[test]
    fn entry_serializes_camel_case() {
        let e = AppStateEntry { value: json!({"a": 1}), updated_at: "2026-10-10T00:00:00.000Z".into() };
        assert_eq!(serde_json::to_value(&e).unwrap(), json!({"value": {"a": 1}, "updatedAt": "2026-10-10T00:00:00.000Z"}));
    }

    #[test]
    fn key_rules_at_the_boundaries() {
        for ok in ["a", "wizard", "backup.last_run", "monitor.v2", "z9._", &format!("a{}", "b".repeat(63))] {
            assert!(validate_key(ok).is_ok(), "{ok}");
        }
        for bad in ["", "Wizard", "9lives", "_x", ".x", "a-b", "a b", "a/b", "ä", "wizard\n", &format!("a{}", "b".repeat(64))] {
            assert!(validate_key(bad).is_err(), "{bad:?}");
        }
        let c = mem();
        assert!(set(&c, "Bad", &json!(1)).is_err());
        assert!(get(&c, "Bad").is_err());
        assert!(delete(&c, "Bad").is_err());
    }

    #[test]
    fn value_size_cap_at_the_boundary() {
        let c = mem();
        // a JSON string serializes with two quote bytes
        let at_cap = Value::String("x".repeat(MAX_VALUE_BYTES - 2));
        set(&c, "big", &at_cap).unwrap();
        assert_eq!(get(&c, "big").unwrap().unwrap().value, at_cap);
        let over = Value::String("x".repeat(MAX_VALUE_BYTES - 1));
        let err = set(&c, "big", &over).unwrap_err();
        assert!(err.contains("limit"), "{err}");
        assert_eq!(get(&c, "big").unwrap().unwrap().value, at_cap, "rejected write leaves the old value");
        // multi-byte characters count as UTF-8 bytes
        let wide = Value::String("é".repeat(MAX_VALUE_BYTES / 2));
        assert!(set(&c, "wide", &wide).is_err());
    }

    #[test]
    fn corrupt_stored_json_is_reported_not_hidden() {
        let c = mem();
        c.execute("INSERT INTO app_state (key, value_json, updated_at) VALUES ('wizard', '{oops', 'now')", []).unwrap();
        let err = get(&c, "wizard").unwrap_err();
        assert!(err.contains("invalid JSON"), "{err}");
    }
}
