//! Shared hours ledger (FS-00 §4.8, table from `0006_asset_usage.sql`).
//! Rows record hours an asset was played or benched; the merge/priority logic
//! lives in `app/usage-hours.js`. All SQL is parameterised.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::db::{database_path, new_id, now_iso, open_database};

pub const KINDS: &[&str] = &["play", "bench"];
pub const SOURCES: &[&str] = &["manual", "djlog", "deckchek", "import"];
pub const MAX_HOURS: f64 = 24.0;
pub const MAX_NOTE_CHARS: usize = 500;

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageAddInput {
    pub asset_id: String,
    pub kind: Option<String>,
    pub started_at: String,
    pub hours: f64,
    pub source: String,
    pub session_id: Option<String>,
    pub note: Option<String>,
    /// Defaults to confirmed; proposals from sessions are added with `false`.
    pub confirmed: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageEntry {
    pub id: String,
    pub asset_id: String,
    pub kind: String,
    pub started_at: String,
    pub hours: f64,
    pub source: String,
    pub session_id: Option<String>,
    pub note: Option<String>,
    pub confirmed: bool,
    pub created_at: String,
}

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

/// Accepts `YYYY-MM-DDTHH:MM:SS[.fff]Z` only (UTC), so text comparison in
/// `usage_list` orders chronologically.
pub fn valid_timestamp(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() < 20 || b.len() > 24 || b[b.len() - 1] != b'Z' {
        return false;
    }
    let digit = |i: usize| b[i].is_ascii_digit();
    let fixed = [(4, b'-'), (7, b'-'), (10, b'T'), (13, b':'), (16, b':')];
    if !fixed.iter().all(|&(i, c)| b[i] == c) {
        return false;
    }
    if !(0..4).chain(5..7).chain(8..10).chain(11..13).chain(14..16).chain(17..19).all(digit) {
        return false;
    }
    let rest = &b[19..b.len() - 1];
    if !rest.is_empty() && !(rest[0] == b'.' && rest.len() >= 2 && rest.len() <= 4 && rest[1..].iter().all(u8::is_ascii_digit)) {
        return false;
    }
    let n = |r: std::ops::Range<usize>| s[r].parse::<u32>().unwrap_or(99);
    let (mo, d, h, mi, sec) = (n(5..7), n(8..10), n(11..13), n(14..16), n(17..19));
    (1..=12).contains(&mo) && (1..=31).contains(&d) && h < 24 && mi < 60 && sec < 60
}

pub fn validate(input: &UsageAddInput) -> Result<(), String> {
    if input.asset_id.trim().is_empty() {
        return Err("usage entry needs an assetId".into());
    }
    if !valid_timestamp(&input.started_at) {
        return Err(format!("startedAt must be a UTC ISO timestamp like 2026-10-10T20:00:00.000Z, got '{}'", input.started_at));
    }
    if !input.hours.is_finite() || input.hours < 0.0 || input.hours > MAX_HOURS {
        return Err(format!("hours must be between 0 and {MAX_HOURS}"));
    }
    if !SOURCES.contains(&input.source.as_str()) {
        return Err(format!("source must be one of {}", SOURCES.join(", ")));
    }
    if let Some(k) = &input.kind {
        if !KINDS.contains(&k.as_str()) {
            return Err(format!("kind must be one of {}", KINDS.join(", ")));
        }
    }
    if input.note.as_ref().map_or(false, |n| n.chars().count() > MAX_NOTE_CHARS) {
        return Err(format!("note is limited to {MAX_NOTE_CHARS} characters"));
    }
    Ok(())
}

fn row(r: &rusqlite::Row) -> rusqlite::Result<UsageEntry> {
    Ok(UsageEntry {
        id: r.get(0)?,
        asset_id: r.get(1)?,
        kind: r.get(2)?,
        started_at: r.get(3)?,
        hours: r.get(4)?,
        source: r.get(5)?,
        session_id: r.get(6)?,
        note: r.get(7)?,
        confirmed: r.get::<_, i64>(8)? != 0,
        created_at: r.get(9)?,
    })
}

const COLS: &str = "id, asset_id, kind, started_at, hours, source, session_id, note, confirmed, created_at";

pub fn add(conn: &Connection, input: &UsageAddInput) -> Result<UsageEntry, String> {
    validate(input)?;
    let exists: Option<i64> = conn
        .query_row("SELECT 1 FROM asset WHERE id = ?1", [&input.asset_id], |r| r.get(0))
        .optional()
        .map_err(e2s)?;
    if exists.is_none() {
        return Err(format!("unknown asset '{}'", input.asset_id));
    }
    if let Some(sid) = &input.session_id {
        let s: Option<i64> = conn.query_row("SELECT 1 FROM session WHERE id = ?1", [sid], |r| r.get(0)).optional().map_err(e2s)?;
        if s.is_none() {
            return Err(format!("unknown session '{sid}'"));
        }
    }
    let id = new_id();
    let now = now_iso(conn)?;
    let note = input.note.as_ref().map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    conn.execute(
        "INSERT INTO asset_usage (id, asset_id, kind, started_at, hours, source, session_id, note, confirmed, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            id,
            input.asset_id,
            input.kind.as_deref().unwrap_or("play"),
            input.started_at,
            input.hours,
            input.source,
            input.session_id,
            note,
            input.confirmed.unwrap_or(true) as i64,
            now
        ],
    )
    .map_err(e2s)?;
    conn.query_row(&format!("SELECT {COLS} FROM asset_usage WHERE id = ?1"), [&id], row).map_err(e2s)
}

/// Entries for one asset, oldest first; `since` keeps rows starting at or after it.
pub fn list(conn: &Connection, asset_id: &str, since: Option<&str>) -> Result<Vec<UsageEntry>, String> {
    if let Some(s) = since {
        if !valid_timestamp(s) {
            return Err(format!("since must be a UTC ISO timestamp, got '{s}'"));
        }
    }
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {COLS} FROM asset_usage WHERE asset_id = ?1 AND (?2 IS NULL OR started_at >= ?2) ORDER BY started_at, created_at, id"
        ))
        .map_err(e2s)?;
    let rows = stmt.query_map(params![asset_id, since], row).map_err(e2s)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)
}

/// Returns whether a row was removed.
pub fn delete(conn: &Connection, id: &str) -> Result<bool, String> {
    conn.execute("DELETE FROM asset_usage WHERE id = ?1", [id]).map(|n| n > 0).map_err(e2s)
}

pub fn confirm(conn: &Connection, id: &str) -> Result<(), String> {
    let n = conn.execute("UPDATE asset_usage SET confirmed = 1 WHERE id = ?1", [id]).map_err(e2s)?;
    if n == 0 {
        return Err(format!("unknown usage entry '{id}'"));
    }
    Ok(())
}

#[tauri::command]
pub fn usage_add(app: AppHandle, input: UsageAddInput) -> Result<UsageEntry, String> {
    let conn = open_database(&database_path(&app)?)?;
    add(&conn, &input)
}

#[tauri::command]
pub fn usage_list(app: AppHandle, asset_id: String, since: Option<String>) -> Result<Vec<UsageEntry>, String> {
    let conn = open_database(&database_path(&app)?)?;
    list(&conn, &asset_id, since.as_deref())
}

#[tauri::command]
pub fn usage_delete(app: AppHandle, id: String) -> Result<bool, String> {
    let conn = open_database(&database_path(&app)?)?;
    delete(&conn, &id)
}

#[tauri::command]
pub fn usage_confirm(app: AppHandle, id: String) -> Result<(), String> {
    let conn = open_database(&database_path(&app)?)?;
    confirm(&conn, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;
    use serde_json::Value;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        c.execute(
            "INSERT INTO asset (id, nickname, created_at, updated_at) VALUES ('a1','Deck 1','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),('a2','Deck 2','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        c
    }

    fn input(asset: &str, started: &str, hours: f64, source: &str) -> UsageAddInput {
        UsageAddInput {
            asset_id: asset.into(),
            kind: None,
            started_at: started.into(),
            hours,
            source: source.into(),
            session_id: None,
            note: None,
            confirmed: None,
        }
    }

    #[test]
    fn migration_creates_table_and_is_rerunnable() {
        let c = mem();
        let sql = crate::db::MIGRATIONS.iter().find(|(v, _)| *v == 6).expect("0006 registered").1;
        c.execute_batch(sql).unwrap(); // IF NOT EXISTS: second run is a no-op
        let cols: Vec<String> = c
            .prepare("SELECT name FROM pragma_table_info('asset_usage')")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(cols, ["id", "asset_id", "kind", "started_at", "hours", "source", "session_id", "note", "confirmed", "created_at"]);
    }

    #[test]
    fn add_list_confirm_delete_round_trip() {
        let c = mem();
        let mut i = input("a1", "2026-10-10T20:00:00.000Z", 3.5, "manual");
        i.note = Some("  Friday club night ".into());
        let e = add(&c, &i).unwrap();
        assert_eq!((e.kind.as_str(), e.hours, e.confirmed), ("play", 3.5, true));
        assert_eq!(e.note.as_deref(), Some("Friday club night"));
        assert_eq!(list(&c, "a1", None).unwrap(), vec![e.clone()]);
        assert!(list(&c, "a2", None).unwrap().is_empty());

        let mut p = input("a1", "2026-10-11T20:00:00.000Z", 2.0, "deckchek");
        p.confirmed = Some(false);
        p.kind = Some("bench".into());
        let p = add(&c, &p).unwrap();
        assert!(!p.confirmed && p.kind == "bench");
        confirm(&c, &p.id).unwrap();
        assert!(list(&c, "a1", None).unwrap().iter().all(|x| x.confirmed));
        assert!(confirm(&c, "nope").is_err());

        assert!(delete(&c, &e.id).unwrap());
        assert!(!delete(&c, &e.id).unwrap());
        assert_eq!(list(&c, "a1", None).unwrap().len(), 1);
    }

    #[test]
    fn list_since_is_inclusive_and_ordered() {
        let c = mem();
        for (t, h) in [("2026-03-01T00:00:00Z", 1.0), ("2026-01-01T00:00:00.500Z", 2.0), ("2026-02-01T00:00:00.000Z", 3.0)] {
            add(&c, &input("a1", t, h, "import")).unwrap();
        }
        let all = list(&c, "a1", None).unwrap();
        assert_eq!(all.iter().map(|e| e.hours).collect::<Vec<_>>(), [2.0, 3.0, 1.0]);
        let since = list(&c, "a1", Some("2026-02-01T00:00:00.000Z")).unwrap();
        assert_eq!(since.iter().map(|e| e.hours).collect::<Vec<_>>(), [3.0, 1.0]);
        assert!(list(&c, "a1", Some("yesterday")).is_err());
        // injection-shaped ids are just data
        assert!(list(&c, "a1' OR '1'='1", None).unwrap().is_empty());
    }

    #[test]
    fn validation_boundaries() {
        let c = mem();
        let ok = "2026-10-10T20:00:00.000Z";
        assert!(add(&c, &input("a1", ok, 0.0, "manual")).is_ok());
        assert!(add(&c, &input("a1", ok, 24.0, "manual")).is_ok());
        for bad in [-0.001, 24.001, f64::NAN, f64::INFINITY] {
            assert!(add(&c, &input("a1", ok, bad, "manual")).is_err(), "{bad}");
        }
        assert!(add(&c, &input("a1", ok, 1.0, "Manual")).unwrap_err().contains("source"));
        assert!(add(&c, &input("zzz", ok, 1.0, "manual")).unwrap_err().contains("unknown asset"));
        assert!(add(&c, &input("", ok, 1.0, "manual")).is_err());
        let mut k = input("a1", ok, 1.0, "manual");
        k.kind = Some("sleep".into());
        assert!(add(&c, &k).unwrap_err().contains("kind"));
        let mut n = input("a1", ok, 1.0, "manual");
        n.note = Some("x".repeat(501));
        assert!(add(&c, &n).is_err());
        n.note = Some("é".repeat(500));
        assert!(add(&c, &n).is_ok());
        let mut s = input("a1", ok, 1.0, "manual");
        s.session_id = Some("missing".into());
        assert!(add(&c, &s).unwrap_err().contains("unknown session"));
    }

    #[test]
    fn timestamp_validator() {
        for good in ["2026-10-10T20:00:00Z", "2026-10-10T20:00:00.1Z", "2026-10-10T20:00:00.123Z", "2026-02-31T00:00:00Z"] {
            // day-of-month is only range-checked (JS Date rolls it over); shape is what matters
            assert!(valid_timestamp(good), "{good}");
        }
        for bad in ["", "2026-10-10", "2026-10-10T20:00:00", "2026-10-10T20:00:00+02:00", "2026-13-10T20:00:00Z", "2026-10-10T24:00:00Z",
            "2026-10-10 20:00:00Z", "2026-10-10T20:00:00.Z", "2026-10-10T20:00:00.12345Z", "２０２６-10-10T20:00:00Z", "2026-10-10T20:00:00Zé"] {
            assert!(!valid_timestamp(bad), "{bad}");
        }
    }

    #[test]
    fn session_link_survives_nothing_but_nulls_on_session_delete() {
        let c = mem();
        c.execute(
            "INSERT INTO session (id, session_type, started_at, app_version, schema_version, status) VALUES ('s1','diagnostic','2026-10-10T20:00:00Z','0',1,'complete')",
            [],
        )
        .unwrap();
        let mut i = input("a1", "2026-10-10T20:00:00Z", 1.0, "deckchek");
        i.session_id = Some("s1".into());
        let e = add(&c, &i).unwrap();
        c.execute("DELETE FROM session WHERE id = 's1'", []).unwrap();
        let after = list(&c, "a1", None).unwrap();
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].id, e.id);
        assert_eq!(after[0].session_id, None);
    }

    #[test]
    fn table_check_constraints_hold_below_the_api() {
        let c = mem();
        let bad = |kind: &str, hours: f64, source: &str| {
            c.execute(
                "INSERT INTO asset_usage (id, asset_id, kind, started_at, hours, source, created_at) VALUES (?1,'a1',?2,'2026-01-01T00:00:00Z',?3,?4,'x')",
                params![new_id(), kind, hours, source],
            )
        };
        assert!(bad("play", 1.0, "manual").is_ok());
        assert!(bad("nap", 1.0, "manual").is_err());
        assert!(bad("play", 25.0, "manual").is_err());
        assert!(bad("play", -1.0, "manual").is_err());
        assert!(bad("play", 1.0, "guess").is_err());
    }

    #[test]
    fn contract_examples_round_trip() {
        let raw = std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/usage.json")).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        let input: UsageAddInput = serde_json::from_value(v["usage_add"]["request"]["input"].clone()).unwrap();
        let c = mem();
        c.execute("INSERT INTO asset (id, nickname, created_at, updated_at) VALUES ('asset-1','x','t','t')", []).unwrap();
        let mut got = serde_json::to_value(add(&c, &input).unwrap()).unwrap();
        let want = &v["usage_add"]["response"];
        // id and createdAt are generated
        for k in ["id", "createdAt"] {
            assert!(got[k].is_string());
            got[k] = want[k].clone();
        }
        assert_eq!(&got, want);
        let list_req = &v["usage_list"]["request"];
        assert!(list_req["assetId"].is_string() && valid_timestamp(list_req["since"].as_str().unwrap()));
    }
}
