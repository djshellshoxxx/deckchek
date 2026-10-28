//! Gear ledger persistence (FS-33 §5; tables from `0021_gear_ledger.sql`).
//! The ledger itself (model, privacy whitelist, static HTML, hashes) is built by the pure JS in `app/ledger/`;
//! files are written through `userfiles_write_folder` with [`LEDGER_EXTS`]. This module only stores:
//!   - one `ledger_export` row per successful export, with a revision counter that increases by one (AC-7);
//!   - `asset.public_notes`, the note the owner writes for the public ledger (the private `asset.notes` stays private).
//! Every IPC argument is validated here; all SQL is parameterised.

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::db::{database_path, new_id, now_iso, open_database};

/// Extensions the ledger export writes (`index.html`, `ledger.json`, `assets/<item>/pN.jpg`). No script or style files:
/// the page keeps its CSS and its small verification script inline (spec §4, CSP in §7).
#[allow(dead_code)] // the JS passes the same list to userfiles_write_folder; tests pin it
pub const LEDGER_EXTS: [&str; 3] = ["html", "json", "jpg"];
pub const MAX_PUBLIC_NOTE_CHARS: usize = 2000;
pub const MAX_SELECTION_ITEMS: usize = 500;
pub const MAX_ID_CHARS: usize = 128;
pub const MAX_META_BYTES: usize = 64 * 1024;
pub const MAX_LIST: u32 = 200;

fn invalid(msg: impl std::fmt::Display) -> String {
    format!("LEDGER_INVALID: {msg}")
}

fn db_err(e: rusqlite::Error) -> String {
    format!("LEDGER_DB: {e}")
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicNote {
    pub asset_id: String,
    pub public_notes: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerExportInput {
    pub revision: i64,
    pub selection: Value,
    pub privacy: Value,
    pub ledger_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerExportRow {
    pub id: String,
    pub revision: i64,
    pub created_at: String,
    pub selection: Value,
    pub privacy: Value,
    pub ledger_sha256: String,
}

fn check_asset_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.chars().count() > MAX_ID_CHARS || id.chars().any(char::is_control) {
        return Err(invalid("assetId must be 1-128 printable characters"));
    }
    Ok(())
}

/// Trims the note; empty becomes NULL. Line breaks and tabs are allowed, other control characters are not.
pub fn clean_public_note(text: Option<&str>) -> Result<Option<String>, String> {
    let Some(t) = text.map(str::trim).filter(|t| !t.is_empty()) else { return Ok(None) };
    if t.chars().count() > MAX_PUBLIC_NOTE_CHARS {
        return Err(invalid(format!("the public note is longer than {MAX_PUBLIC_NOTE_CHARS} characters")));
    }
    if t.chars().any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t')) {
        return Err(invalid("the public note contains control characters"));
    }
    Ok(Some(t.to_string()))
}

pub fn list_public_notes(conn: &Connection) -> Result<Vec<PublicNote>, String> {
    let mut stmt = conn
        .prepare("SELECT id, public_notes FROM asset WHERE is_deleted = 0 AND public_notes IS NOT NULL ORDER BY id")
        .map_err(db_err)?;
    let rows = stmt
        .query_map([], |r| Ok(PublicNote { asset_id: r.get(0)?, public_notes: r.get(1)? }))
        .map_err(db_err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
}

pub fn set_public_note(conn: &Connection, asset_id: &str, text: Option<&str>) -> Result<PublicNote, String> {
    check_asset_id(asset_id)?;
    let note = clean_public_note(text)?;
    let n = conn
        .execute("UPDATE asset SET public_notes = ?2 WHERE id = ?1 AND is_deleted = 0", params![asset_id, note])
        .map_err(db_err)?;
    if n == 0 {
        return Err(invalid("unknown asset"));
    }
    Ok(PublicNote { asset_id: asset_id.to_string(), public_notes: note })
}

fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// `selection` = {items:[assetId...], ...}; `privacy` = an object. Both capped at 64 KiB of JSON.
pub fn validate_export(i: &LedgerExportInput) -> Result<(String, String), String> {
    if i.revision < 1 {
        return Err(invalid("revision must be 1 or more"));
    }
    if !is_sha256_hex(&i.ledger_sha256) {
        return Err(invalid("ledgerSha256 must be 64 lowercase hex characters"));
    }
    let sel = i.selection.as_object().ok_or_else(|| invalid("selection must be an object"))?;
    let items = sel.get("items").and_then(Value::as_array).ok_or_else(|| invalid("selection.items must be an array"))?;
    if items.is_empty() || items.len() > MAX_SELECTION_ITEMS {
        return Err(invalid(format!("selection.items must hold 1-{MAX_SELECTION_ITEMS} ids")));
    }
    for it in items {
        let s = it.as_str().ok_or_else(|| invalid("selection.items must be strings"))?;
        check_asset_id(s)?;
    }
    if !i.privacy.is_object() {
        return Err(invalid("privacy must be an object"));
    }
    let selection = serde_json::to_string(&i.selection).map_err(|e| invalid(e))?;
    let privacy = serde_json::to_string(&i.privacy).map_err(|e| invalid(e))?;
    if selection.len() > MAX_META_BYTES || privacy.len() > MAX_META_BYTES {
        return Err(invalid("selection or privacy is larger than 64 KiB"));
    }
    Ok((selection, privacy))
}

fn row(r: &rusqlite::Row) -> rusqlite::Result<LedgerExportRow> {
    let sel: String = r.get(3)?;
    let pri: String = r.get(4)?;
    Ok(LedgerExportRow {
        id: r.get(0)?,
        revision: r.get(1)?,
        created_at: r.get(2)?,
        selection: serde_json::from_str(&sel).unwrap_or(Value::Null),
        privacy: serde_json::from_str(&pri).unwrap_or(Value::Null),
        ledger_sha256: r.get(5)?,
    })
}

const SELECT: &str = "SELECT id, revision, created_at, selection_json, privacy_json, ledger_sha256 FROM ledger_export";

pub fn next_revision(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT COALESCE(MAX(revision), 0) + 1 FROM ledger_export", [], |r| r.get(0)).map_err(db_err)
}

/// Records a finished export. The revision must be exactly the next one, so two exports never share a number and
/// the counter never skips (AC-7); a stale page gets `LEDGER_REVISION` and rebuilds with the new number.
pub fn record_export(conn: &mut Connection, i: &LedgerExportInput) -> Result<LedgerExportRow, String> {
    let (selection, privacy) = validate_export(i)?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(db_err)?;
    let expected = next_revision(&tx)?;
    if i.revision != expected {
        return Err(format!("LEDGER_REVISION: the next revision is {expected}, not {}", i.revision));
    }
    let id = new_id();
    let at = now_iso(&tx)?;
    tx.execute(
        "INSERT INTO ledger_export (id, revision, created_at, selection_json, privacy_json, ledger_sha256) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, i.revision, at, selection, privacy, i.ledger_sha256],
    )
    .map_err(db_err)?;
    let out = tx.query_row(&format!("{SELECT} WHERE id = ?1"), [&id], row).map_err(db_err)?;
    tx.commit().map_err(db_err)?;
    Ok(out)
}

pub fn list_exports(conn: &Connection, limit: Option<u32>) -> Result<Vec<LedgerExportRow>, String> {
    let n = limit.unwrap_or(20).clamp(1, MAX_LIST);
    let mut stmt = conn.prepare(&format!("{SELECT} ORDER BY revision DESC LIMIT ?1")).map_err(db_err)?;
    let rows = stmt.query_map([n], row).map_err(db_err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
}

#[allow(dead_code)] // used by tests; the UI reads the newest row from ledger_export_list
pub fn get_export(conn: &Connection, id: &str) -> Result<Option<LedgerExportRow>, String> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], row).optional().map_err(db_err)
}

#[tauri::command]
pub async fn ledger_public_notes(app: AppHandle) -> Result<Vec<PublicNote>, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        list_public_notes(&conn)
    })
    .await?
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn ledger_public_note_set(app: AppHandle, assetId: String, text: Option<String>) -> Result<PublicNote, String> {
    crate::db::off_main(move || {
        check_asset_id(&assetId)?;
        let conn = open_database(&database_path(&app)?)?;
        set_public_note(&conn, &assetId, text.as_deref())
    })
    .await?
}

#[tauri::command]
pub async fn ledger_export_list(app: AppHandle, limit: Option<u32>) -> Result<Vec<LedgerExportRow>, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        list_exports(&conn, limit)
    })
    .await?
}

#[tauri::command]
pub async fn ledger_export_record(app: AppHandle, record: LedgerExportInput) -> Result<LedgerExportRow, String> {
    crate::db::off_main(move || {
        validate_export(&record)?;
        let mut conn = open_database(&database_path(&app)?)?;
        record_export(&mut conn, &record)
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{applied_migrations, apply_migrations};
    use crate::userfiles::{write_folder, FolderFile, UserFileError};
    use serde_json::json;
    use std::path::{Path, PathBuf};

    fn seed(c: &Connection) {
        c.execute_batch(
            "INSERT INTO asset (id, nickname, serial_number, notes, created_at, updated_at) VALUES ('fs33-a','Deck L','SN-1','private','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
             INSERT INTO asset (id, nickname, is_deleted, created_at, updated_at) VALUES ('fs33-gone','Old',1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');",
        )
        .unwrap();
    }

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        seed(&c);
        c
    }

    fn input(rev: i64) -> LedgerExportInput {
        LedgerExportInput {
            revision: rev,
            selection: json!({ "items": ["fs33-a"], "mode": "folder" }),
            privacy: json!({ "preset": "public", "serialMode": "hidden" }),
            ledger_sha256: "ab".repeat(32),
        }
    }

    fn contract() -> Value {
        let raw = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/ledger.json")).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    #[test]
    fn migration_creates_table_column_index_and_rerun_is_a_no_op() {
        let c = mem();
        apply_migrations(&c).unwrap();
        assert!(applied_migrations(&c).unwrap().contains(&21));
        let cols: Vec<String> = c.prepare("SELECT name FROM pragma_table_info('ledger_export')").unwrap().query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(cols, ["id", "revision", "created_at", "selection_json", "privacy_json", "ledger_sha256"]);
        let has_col: i64 = c.query_row("SELECT COUNT(*) FROM pragma_table_info('asset') WHERE name='public_notes'", [], |r| r.get(0)).unwrap();
        assert_eq!(has_col, 1);
        let idx: i64 = c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_ledger_export_revision'", [], |r| r.get(0)).unwrap();
        assert_eq!(idx, 1);
    }

    #[test]
    fn every_release_fixture_upgrades_keeps_rows_and_then_records_exports() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/db");
        let mut names: Vec<String> = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).filter(|n| n.starts_with('v') && n.ends_with(".sql")).collect();
        names.sort();
        assert!(!names.is_empty());
        for name in names {
            let mut c = Connection::open_in_memory().unwrap();
            c.execute_batch(&std::fs::read_to_string(dir.join(&name)).unwrap()).unwrap();
            let assets_before: i64 = c.query_row("SELECT COUNT(*) FROM asset", [], |r| r.get(0)).unwrap();
            c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
            apply_migrations(&c).unwrap_or_else(|e| panic!("{name}: {e}"));
            apply_migrations(&c).unwrap();
            let assets_after: i64 = c.query_row("SELECT COUNT(*) FROM asset", [], |r| r.get(0)).unwrap();
            assert_eq!(assets_before, assets_after, "{name}: asset rows preserved");
            let nulls: i64 = c.query_row("SELECT COUNT(*) FROM asset WHERE public_notes IS NULL", [], |r| r.get(0)).unwrap();
            assert_eq!(nulls, assets_after, "{name}: public_notes starts empty");
            seed(&c);
            let r = record_export(&mut c, &input(1)).unwrap_or_else(|e| panic!("{name}: {e}"));
            assert_eq!(r.revision, 1, "{name}");
            set_public_note(&c, "fs33-a", Some("Serviced 2025")).unwrap();
            let ok: String = c.query_row("PRAGMA integrity_check", [], |r| r.get(0)).unwrap();
            assert_eq!(ok, "ok", "{name}");
            let fk: i64 = c.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).unwrap();
            assert_eq!(fk, 0, "{name}");
        }
    }

    #[test]
    fn ac7_revision_counts_up_by_one_and_round_trips() {
        let mut c = mem();
        assert_eq!(next_revision(&c).unwrap(), 1);
        let a = record_export(&mut c, &input(1)).unwrap();
        assert_eq!(a.revision, 1);
        assert_eq!(a.selection, json!({ "items": ["fs33-a"], "mode": "folder" }));
        assert_eq!(a.privacy["preset"], "public");
        assert_eq!(get_export(&c, &a.id).unwrap().unwrap(), a);
        assert_eq!(next_revision(&c).unwrap(), 2);
        let b = record_export(&mut c, &LedgerExportInput { ledger_sha256: "cd".repeat(32), ..input(2) }).unwrap();
        assert_eq!(b.revision, 2);
        let list = list_exports(&c, None).unwrap();
        assert_eq!(list.iter().map(|r| r.revision).collect::<Vec<_>>(), [2, 1], "newest first");
        assert_eq!(list_exports(&c, Some(1)).unwrap().len(), 1);
        assert_eq!(list_exports(&c, Some(0)).unwrap().len(), 1, "limit clamps to at least 1");
    }

    #[test]
    fn ac7_stale_or_skipped_revision_is_rejected_without_writing() {
        let mut c = mem();
        record_export(&mut c, &input(1)).unwrap();
        for rev in [1, 3, 99] {
            let e = record_export(&mut c, &input(rev)).unwrap_err();
            assert!(e.starts_with("LEDGER_REVISION"), "{rev}: {e}");
        }
        assert_eq!(list_exports(&c, None).unwrap().len(), 1);
    }

    #[test]
    fn export_input_is_validated() {
        let mut c = mem();
        let bad = [
            LedgerExportInput { revision: 0, ..input(1) },
            LedgerExportInput { ledger_sha256: "AB".repeat(32), ..input(1) },
            LedgerExportInput { ledger_sha256: "ab".into(), ..input(1) },
            LedgerExportInput { selection: json!([]), ..input(1) },
            LedgerExportInput { selection: json!({ "items": [] }), ..input(1) },
            LedgerExportInput { selection: json!({ "items": [1] }), ..input(1) },
            LedgerExportInput { selection: json!({ "items": ["a\u{0}b"] }), ..input(1) },
            LedgerExportInput { selection: json!({ "items": vec!["x"; MAX_SELECTION_ITEMS + 1] }), ..input(1) },
            LedgerExportInput { privacy: json!("public"), ..input(1) },
            LedgerExportInput { privacy: json!({ "pad": "x".repeat(MAX_META_BYTES) }), ..input(1) },
        ];
        for b in bad {
            assert!(record_export(&mut c, &b).unwrap_err().starts_with("LEDGER_INVALID"), "{b:?}");
        }
        assert!(list_exports(&c, None).unwrap().is_empty());
    }

    #[test]
    fn table_constraints_hold_for_direct_inserts() {
        let c = mem();
        let ins = |rev: i64, sel: &str, sha: &str| c.execute("INSERT INTO ledger_export VALUES (?1, ?2, 'x', ?3, '{}', ?4)", params![new_id(), rev, sel, sha]);
        assert!(ins(1, "{}", &"a".repeat(64)).is_ok());
        assert!(ins(1, "{}", &"a".repeat(64)).is_err(), "unique revision");
        assert!(ins(0, "{}", &"a".repeat(64)).is_err(), "revision >= 1");
        assert!(ins(2, "not json", &"a".repeat(64)).is_err(), "json_valid");
        assert!(ins(3, "{}", "short").is_err(), "hash length");
    }

    #[test]
    fn public_notes_round_trip_and_validation() {
        let c = mem();
        assert!(list_public_notes(&c).unwrap().is_empty());
        let n = set_public_note(&c, "fs33-a", Some("  Serviced by the factory in 2025.\nAll original.  ")).unwrap();
        assert_eq!(n.public_notes.as_deref(), Some("Serviced by the factory in 2025.\nAll original."));
        assert_eq!(list_public_notes(&c).unwrap(), vec![n]);
        let private: String = c.query_row("SELECT notes FROM asset WHERE id='fs33-a'", [], |r| r.get(0)).unwrap();
        assert_eq!(private, "private", "the private note is untouched");
        assert_eq!(set_public_note(&c, "fs33-a", Some("   ")).unwrap().public_notes, None);
        assert!(list_public_notes(&c).unwrap().is_empty());
        assert!(set_public_note(&c, "missing", Some("x")).is_err());
        assert!(set_public_note(&c, "fs33-gone", Some("x")).is_err(), "deleted assets are not editable");
        assert!(set_public_note(&c, "", Some("x")).is_err());
        assert!(set_public_note(&c, "fs33-a", Some(&"x".repeat(MAX_PUBLIC_NOTE_CHARS + 1))).is_err());
        assert!(set_public_note(&c, "fs33-a", Some("bell\u{7}")).is_err());
        assert!(set_public_note(&c, "fs33-a", Some(&"é".repeat(MAX_PUBLIC_NOTE_CHARS))).is_ok(), "limit counts characters");
    }

    #[test]
    fn contract_examples_round_trip() {
        let k = contract();
        let req: LedgerExportInput = serde_json::from_value(k["ledger_export_record"]["request"]["record"].clone()).unwrap();
        validate_export(&req).unwrap();
        let resp = &k["ledger_export_record"]["response"];
        let row = LedgerExportRow {
            id: resp["id"].as_str().unwrap().into(),
            revision: resp["revision"].as_i64().unwrap(),
            created_at: resp["createdAt"].as_str().unwrap().into(),
            selection: req.selection.clone(),
            privacy: req.privacy.clone(),
            ledger_sha256: req.ledger_sha256.clone(),
        };
        assert_eq!(&serde_json::to_value(&row).unwrap(), resp);
        let note = PublicNote { asset_id: "fs33-a".into(), public_notes: Some("All original.".into()) };
        assert_eq!(serde_json::to_value(&note).unwrap(), k["ledger_public_note_set"]["response"]);
        let req = &k["ledger_public_note_set"]["request"];
        assert!(req["assetId"].is_string() && req["text"].is_string());
    }

    // ---------------------------------------------------------------- folder writes (spec §8 "write_ledger_folder")

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("deckchek-ledger-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }
    fn file(rel: &str) -> FolderFile {
        FolderFile { rel_path: rel.into(), text: Some("x".into()), base64: None }
    }

    #[test]
    fn ledger_folder_layout_writes_with_ledger_extensions() {
        let d = tmp("ok");
        let files = vec![
            file("ledger/index.html"),
            file("ledger/ledger.json"),
            FolderFile { rel_path: "ledger/assets/a1b2c3d4/p1.jpg".into(), text: None, base64: Some("/9j/2Q==".into()) },
        ];
        let r = write_folder(&d.to_string_lossy(), &files, &LEDGER_EXTS).unwrap();
        assert_eq!(r.written, 3);
        assert_eq!(std::fs::read(d.join("ledger/assets/a1b2c3d4/p1.jpg")).unwrap(), vec![0xff, 0xd8, 0xff, 0xd9]);
    }

    #[test]
    fn ledger_folder_rejects_traversal_absolute_drive_backslash_reserved_and_other_types() {
        let d = tmp("bad");
        for bad in [
            "../x.html", "ledger/../../x.html", "ledger\\..\\..\\x.html", "/etc/x.json", "\\x.json", "C:/x.json", "C:x.json", "c:\\x.json",
            "\\\\server\\share\\x.json", "ledger/CON.html", "ledger/nul.json", "ledger/assets/x./p1.jpg", "ledger/p1.jpg ", "ledger/run.js",
            "ledger/style.css", "ledger/x.exe", "ledger/a:b.jpg", "ledger//x.json",
        ] {
            let files = vec![file("ledger/index.html"), file(bad)];
            assert!(write_folder(&d.to_string_lossy(), &files, &LEDGER_EXTS).is_err(), "{bad:?}");
        }
        assert!(!d.join("ledger").exists(), "nothing is written when any entry is rejected");
    }

    #[cfg(unix)]
    #[test]
    fn ledger_folder_refuses_an_existing_symlink() {
        let d = tmp("sym");
        let outside = tmp("sym-out");
        std::os::unix::fs::symlink(&outside, d.join("ledger")).unwrap();
        let r = write_folder(&d.to_string_lossy(), &[file("ledger/index.html")], &LEDGER_EXTS);
        assert_eq!(r, Err(UserFileError::Symlink));
        assert!(!outside.join("index.html").exists());
        std::fs::remove_file(d.join("ledger")).unwrap();
        std::fs::create_dir(d.join("ledger")).unwrap();
        std::os::unix::fs::symlink(outside.join("t.json"), d.join("ledger/ledger.json")).unwrap();
        assert_eq!(write_folder(&d.to_string_lossy(), &[file("ledger/ledger.json")], &LEDGER_EXTS), Err(UserFileError::Symlink));
        assert!(!outside.join("t.json").exists());
    }
}
