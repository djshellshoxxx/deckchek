//! Gear ledger persistence (FS-33 §5; tables from `0021_gear_ledger.sql`).
//! The ledger itself (model, privacy whitelist, static HTML, hashes) is built by the pure JS in `app/ledger/`;
//! folder exports are written by [`write_ledger_folder`] (through `userfiles::write_folder` with [`LEDGER_EXTS`]).
//! This module stores:
//!   - one `ledger_export` row per successful export, with a revision counter that increases by one (AC-7), plus a
//!     revision floor outside the database so a backup restore never rewinds it;
//!   - `asset.public_notes`, the note the owner writes for the public ledger (the private `asset.notes` stays private).
//! It also lists customers' bench units (FS-21 service jobs), which never belong in the owner's ledger.
//! Every IPC argument is validated here; all SQL is parameterised.

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::AppHandle;

use crate::db::{database_path, new_id, now_iso, open_database};
use crate::userfiles::{write_folder, FolderFile, UserFileError};

/// Extensions the ledger export writes (`index.html`, `ledger.json`, `assets/<item>/pN.jpg`). No script or style files:
/// the page keeps its CSS and its small verification script inline (spec §4, CSP in §7).
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
/// The desktop command goes through [`record_export_with_floor`], which also respects the revision floor.
#[allow(dead_code)] // tests: the history alone (floor 0)
pub fn record_export(conn: &mut Connection, i: &LedgerExportInput) -> Result<LedgerExportRow, String> {
    record_export_with_floor(conn, i, 0)
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

// ---------------------------------------------------------------- customer units (FS-33 review)

/// Assets that belong to FS-21 service jobs: customers' bench units, never the owner's gear (spec AC-1 "owned").
pub fn customer_unit_ids(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT DISTINCT asset_id FROM service_job WHERE asset_id IS NOT NULL ORDER BY asset_id LIMIT 100000")
        .map_err(db_err)?;
    let rows = stmt.query_map([], |r| r.get(0)).map_err(db_err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
}

// ---------------------------------------------------------------- revision floor (FS-33 review)
//
// `ledger_export` lives in the database, which a backup restore replaces as a whole. The highest revision ever
// recorded is therefore also kept in a small file next to the database (restore never touches it), and the next
// revision is max(history, floor) + 1, so a restore never hands out a revision that was already published.

pub const FLOOR_FILE: &str = "ledger-revision.json";
const MAX_FLOOR_FILE_BYTES: u64 = 1024;

/// The revision floor, or 0 when the file is missing, a symlink, too large or not `{"revision": n}`.
pub fn read_floor(path: &Path) -> i64 {
    match fs::symlink_metadata(path) {
        Ok(m) if m.is_file() && m.len() <= MAX_FLOOR_FILE_BYTES => {}
        _ => return 0,
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v.get("revision").and_then(Value::as_i64))
        .filter(|n| *n > 0)
        .unwrap_or(0)
}

/// Raises the floor to `revision` (never lowers it). Written to a temporary file and renamed into place.
pub fn raise_floor(path: &Path, revision: i64) -> Result<(), String> {
    if revision <= read_floor(path) {
        return Ok(());
    }
    if fs::symlink_metadata(path).is_ok_and(|m| !m.is_file()) {
        return Err(invalid("the ledger revision file is not a regular file"));
    }
    let tmp = path.with_extension("json.tmp");
    let _ = fs::remove_file(&tmp);
    fs::write(&tmp, serde_json::json!({ "revision": revision }).to_string()).map_err(|e| format!("LEDGER_FLOOR: {:?}", e.kind()))?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("LEDGER_FLOOR: {:?}", e.kind())
    })
}

/// max(highest recorded revision, floor) + 1.
pub fn next_revision_with_floor(conn: &Connection, floor: i64) -> Result<i64, String> {
    Ok(next_revision(conn)?.max(floor.max(0) + 1))
}

/// [`record_export`] against the floor: the revision must be exactly [`next_revision_with_floor`].
pub fn record_export_with_floor(conn: &mut Connection, i: &LedgerExportInput, floor: i64) -> Result<LedgerExportRow, String> {
    let (selection, privacy) = validate_export(i)?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(db_err)?;
    let expected = next_revision_with_floor(&tx, floor)?;
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

fn floor_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(database_path(app)?.with_file_name(FLOOR_FILE))
}

// ---------------------------------------------------------------- folder export (FS-33 review)
//
// `ledger_write_folder` owns `<root>/ledger/`: it writes every file into a fresh staging folder in `<root>` first
// (through `userfiles::write_folder`, so every userfiles check applies), then removes the photos and certificate files
// an earlier export left in `ledger/assets` and `ledger/certificates` that this export no longer contains (only names
// the ledger itself generates, never following a symlink), then moves the new files in, index.html last. A failure
// before the move leaves the previous export untouched. A folder that already holds the same or a later revision is
// refused (and the floor raised), so a published ledger never goes back in revision.

pub const LEDGER_DIR: &str = "ledger";
const STAGING_PREFIX: &str = ".ledger-staging-";
const MAX_EXISTING_LEDGER_JSON_BYTES: u64 = 64 * 1024 * 1024;
const MAX_PRUNE_ENTRIES: usize = 20_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LedgerWriteResult {
    pub written: usize,
    pub removed: usize,
    pub path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WriteFail {
    AfterStage,
}

fn uf(e: UserFileError) -> String {
    format!("LEDGER_WRITE: {e}")
}

fn is_lower_hex(s: &str, n: usize) -> bool {
    s.len() == n && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// `a<sha10>`: an item folder under `ledger/assets` (build.js ledgerItemId).
pub fn is_ledger_item_dir(name: &str) -> bool {
    name.strip_prefix('a').is_some_and(|h| is_lower_hex(h, 10))
}

/// `pN.jpg` (N = 1..999, no leading zero): a ledger photo inside an item folder.
pub fn is_ledger_photo(name: &str) -> bool {
    name.strip_prefix('p').and_then(|r| r.strip_suffix(".jpg")).is_some_and(|n| (1..=3).contains(&n.len()) && !n.starts_with('0') && n.bytes().all(|b| b.is_ascii_digit()))
}

/// `c-<hash12>.deckchek-cert.json`: a certificate file under `ledger/certificates`.
pub fn is_ledger_certificate(name: &str) -> bool {
    name.strip_prefix("c-").and_then(|r| r.strip_suffix(".deckchek-cert.json")).is_some_and(|h| is_lower_hex(h, 12))
}

/// `ledger.json` text -> its revision, if it is a DeckChek ledger.
fn ledger_revision_of(text: &str) -> Option<i64> {
    let v: Value = serde_json::from_str(text).ok()?;
    (v.get("format")?.as_str()? == "deckchek-ledger").then_some(())?;
    v.get("revision")?.as_i64().filter(|n| *n >= 1)
}

/// The revision of the ledger already in `<root>/ledger/ledger.json`, if any (never through a symlink).
fn existing_revision(root: &Path) -> Option<i64> {
    let dir = root.join(LEDGER_DIR);
    if !fs::symlink_metadata(&dir).is_ok_and(|m| m.is_dir()) {
        return None;
    }
    let file = dir.join("ledger.json");
    match fs::symlink_metadata(&file) {
        Ok(m) if m.is_file() && m.len() <= MAX_EXISTING_LEDGER_JSON_BYTES => ledger_revision_of(&fs::read_to_string(&file).ok()?),
        _ => None,
    }
}

/// A real directory (created when missing); a symlink or a file in its place is an error.
fn ensure_real_dir(p: &Path) -> Result<(), String> {
    match fs::symlink_metadata(p) {
        Ok(m) if m.file_type().is_symlink() => Err(uf(UserFileError::Symlink)),
        Ok(m) if m.is_dir() => Ok(()),
        Ok(_) => Err(uf(UserFileError::Invalid("path segment is a file"))),
        Err(_) => fs::create_dir(p).map_err(|e| uf(e.into())),
    }
}

fn read_dir_capped(p: &Path) -> Result<Vec<(String, fs::Metadata)>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(p).map_err(|e| uf(e.into()))? {
        let entry = entry.map_err(|e| uf(e.into()))?;
        if out.len() >= MAX_PRUNE_ENTRIES {
            return Err(uf(UserFileError::TooLarge));
        }
        let Some(name) = entry.file_name().to_str().map(String::from) else { continue };
        let meta = fs::symlink_metadata(entry.path()).map_err(|e| uf(e.into()))?;
        out.push((name, meta));
    }
    Ok(out)
}

/// Removes ledger-named files under `ledger/assets` and `ledger/certificates` that are not in `keep` (paths relative
/// to `ledger/`, '/'-separated) and item folders left empty. Anything else is left alone; a symlink with a ledger name
/// is an error (never followed, never removed). Returns the number of files removed.
pub fn prune_stale(ledger_dir: &Path, keep: &HashSet<String>) -> Result<usize, String> {
    let mut removed = 0;
    let certs = ledger_dir.join("certificates");
    match fs::symlink_metadata(&certs) {
        Ok(m) if m.file_type().is_symlink() => return Err(uf(UserFileError::Symlink)),
        Ok(m) if m.is_dir() => {
            for (name, meta) in read_dir_capped(&certs)? {
                if !is_ledger_certificate(&name) || keep.contains(&format!("certificates/{name}")) {
                    continue;
                }
                if meta.file_type().is_symlink() {
                    return Err(uf(UserFileError::Symlink));
                }
                if meta.is_file() {
                    fs::remove_file(certs.join(&name)).map_err(|e| uf(e.into()))?;
                    removed += 1;
                }
            }
        }
        _ => {}
    }
    let assets = ledger_dir.join("assets");
    match fs::symlink_metadata(&assets) {
        Ok(m) if m.file_type().is_symlink() => return Err(uf(UserFileError::Symlink)),
        Ok(m) if m.is_dir() => {
            for (item, meta) in read_dir_capped(&assets)? {
                if !is_ledger_item_dir(&item) {
                    continue;
                }
                if meta.file_type().is_symlink() {
                    return Err(uf(UserFileError::Symlink));
                }
                if !meta.is_dir() {
                    continue;
                }
                let dir = assets.join(&item);
                for (name, meta) in read_dir_capped(&dir)? {
                    if !is_ledger_photo(&name) || keep.contains(&format!("assets/{item}/{name}")) {
                        continue;
                    }
                    if meta.file_type().is_symlink() {
                        return Err(uf(UserFileError::Symlink));
                    }
                    if meta.is_file() {
                        fs::remove_file(dir.join(&name)).map_err(|e| uf(e.into()))?;
                        removed += 1;
                    }
                }
                if fs::read_dir(&dir).map(|mut d| d.next().is_none()).unwrap_or(false) {
                    let _ = fs::remove_dir(&dir);
                }
            }
        }
        _ => {}
    }
    Ok(removed)
}

/// Writes a folder-mode ledger (every `relPath` starts with `ledger/`, `ledger/ledger.json` included) into `dir`.
/// `floor` is the revision floor file, raised when the folder already holds the same or a later revision.
pub fn write_ledger_folder(dir: &str, files: Vec<FolderFile>, floor: Option<&Path>) -> Result<LedgerWriteResult, String> {
    write_ledger_folder_inner(dir, files, floor, None)
}

fn write_ledger_folder_inner(dir: &str, files: Vec<FolderFile>, floor: Option<&Path>, fail: Option<WriteFail>) -> Result<LedgerWriteResult, String> {
    if dir.is_empty() || dir.contains('\0') {
        return Err(uf(UserFileError::Invalid("empty or NUL")));
    }
    let root = PathBuf::from(dir);
    if !root.is_absolute() {
        return Err(uf(UserFileError::Relative));
    }
    if root.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(uf(UserFileError::Traversal));
    }
    match fs::symlink_metadata(&root) {
        Ok(m) if m.file_type().is_symlink() => return Err(uf(UserFileError::Symlink)),
        Ok(m) if m.is_dir() => {}
        _ => return Err(uf(UserFileError::NotFound)),
    }
    // Every entry under ledger/; the rest of each path is checked by userfiles::write_folder below.
    let mut rels = Vec::with_capacity(files.len());
    for f in &files {
        let rest = f.rel_path.strip_prefix("ledger/").filter(|r| !r.is_empty()).ok_or_else(|| invalid("every file must be under ledger/"))?;
        rels.push(rest.split(['/', '\\']).collect::<Vec<_>>().join("/"));
    }
    let json_at = rels.iter().position(|r| r == "ledger.json").ok_or_else(|| invalid("ledger/ledger.json is missing"))?;
    let revision = files[json_at].text.as_deref().and_then(ledger_revision_of).ok_or_else(|| invalid("ledger/ledger.json is not a DeckChek ledger"))?;
    if let Some(existing) = existing_revision(&root) {
        if existing >= revision {
            if let Some(f) = floor {
                raise_floor(f, existing)?;
            }
            return Err(format!(
                "LEDGER_REVISION: this folder already holds ledger revision {existing}; export again to write revision {}",
                existing + 1
            ));
        }
    }

    // 1. Stage: a fresh folder next to ledger/, written with every userfiles check (extensions, names, sizes).
    let staging = format!("{STAGING_PREFIX}{}", new_id().replace('-', ""));
    let staging_dir = root.join(&staging);
    if fs::symlink_metadata(&staging_dir).is_ok() {
        return Err(uf(UserFileError::Invalid("staging folder already exists")));
    }
    let staged: Vec<FolderFile> = files
        .into_iter()
        .zip(&rels)
        .map(|(f, rel)| FolderFile { rel_path: format!("{staging}/{rel}"), text: f.text, base64: f.base64 })
        .collect();
    let cleanup = || {
        if fs::symlink_metadata(&staging_dir).is_ok_and(|m| m.is_dir()) {
            let _ = fs::remove_dir_all(&staging_dir);
        }
    };
    if let Err(e) = write_folder(dir, &staged, &LEDGER_EXTS) {
        cleanup();
        return Err(uf(e));
    }
    if fail == Some(WriteFail::AfterStage) {
        cleanup();
        return Err(uf(UserFileError::Io("injected failure after staging".into())));
    }

    // 2. Check every destination before changing anything in ledger/.
    let ledger_dir = root.join(LEDGER_DIR);
    let swap = || -> Result<usize, String> {
        ensure_real_dir(&ledger_dir)?;
        for rel in &rels {
            let mut cur = ledger_dir.clone();
            let segs: Vec<&str> = rel.split('/').collect();
            for s in &segs[..segs.len() - 1] {
                cur.push(s);
                match fs::symlink_metadata(&cur) {
                    Ok(m) if m.file_type().is_symlink() => return Err(uf(UserFileError::Symlink)),
                    Ok(m) if !m.is_dir() => return Err(uf(UserFileError::Invalid("path segment is a file"))),
                    _ => {}
                }
            }
            cur.push(segs[segs.len() - 1]);
            match fs::symlink_metadata(&cur) {
                Ok(m) if m.file_type().is_symlink() => return Err(uf(UserFileError::Symlink)),
                Ok(m) if m.is_dir() => return Err(uf(UserFileError::Invalid("is a directory"))),
                _ => {}
            }
        }
        // 3. Remove what earlier exports left behind, 4. move the new files in (pages last).
        let keep: HashSet<String> = rels.iter().cloned().collect();
        let removed = prune_stale(&ledger_dir, &keep)?;
        let mut order: Vec<&String> = rels.iter().collect();
        order.sort_by_key(|r| match r.as_str() {
            "index.html" => 2,
            "ledger.json" => 1,
            _ => 0,
        });
        for rel in order {
            let segs: Vec<&str> = rel.split('/').collect();
            let mut cur = ledger_dir.clone();
            for s in &segs[..segs.len() - 1] {
                cur.push(s);
                ensure_real_dir(&cur)?;
            }
            cur.push(segs[segs.len() - 1]);
            let from = segs.iter().fold(staging_dir.clone(), |acc, s| acc.join(s));
            fs::rename(&from, &cur).map_err(|e| uf(e.into()))?;
            crate::userfiles::record_written(&cur);
        }
        Ok(removed)
    };
    let result = swap();
    cleanup();
    let removed = result?;
    crate::userfiles::record_written(&ledger_dir);
    Ok(LedgerWriteResult { written: rels.len(), removed, path: root.to_string_lossy().into_owned() })
}

#[tauri::command]
pub async fn ledger_customer_units(app: AppHandle) -> Result<Vec<String>, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        customer_unit_ids(&conn)
    })
    .await?
}

#[tauri::command]
pub async fn ledger_next_revision(app: AppHandle) -> Result<i64, String> {
    crate::db::off_main(move || {
        let floor = read_floor(&floor_path(&app)?);
        let conn = open_database(&database_path(&app)?)?;
        next_revision_with_floor(&conn, floor)
    })
    .await?
}

/// Folder export (see the section comment above). Off the main thread: it may write hundreds of megabytes.
#[tauri::command]
pub async fn ledger_write_folder(app: AppHandle, dir: String, files: Vec<FolderFile>) -> Result<LedgerWriteResult, String> {
    crate::db::off_main(move || {
        let floor = floor_path(&app)?;
        write_ledger_folder(&dir, files, Some(&floor))
    })
    .await?
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
        let floor_file = floor_path(&app)?;
        let mut conn = open_database(&database_path(&app)?)?;
        let row = record_export_with_floor(&mut conn, &record, read_floor(&floor_file))?;
        // The row is committed; a floor that cannot be written only loses the restore guard for this revision.
        let _ = raise_floor(&floor_file, row.revision);
        Ok(row)
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

    // ---------------------------------------------------------------- FS-33 review regressions

    const ITEM: &str = "a0123456789";
    const GONE_ITEM: &str = "abbbbbbbbbb";
    const OLD_CERT: &str = "c-aaaaaaaaaaaa.deckchek-cert.json";

    fn put(root: &Path, rel: &str, body: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, body).unwrap();
    }
    fn text(root: &Path, rel: &str) -> String {
        std::fs::read_to_string(root.join(rel)).unwrap()
    }
    fn ledger_json(rev: i64) -> String {
        format!("{{\"format\":\"deckchek-ledger\",\"revision\":{rev}}}")
    }
    /// An earlier Private export (photos p1/p2, a second unit, a certificate) plus files the user put there.
    fn earlier_export(root: &Path, rev: i64) {
        put(root, "ledger/index.html", "old page");
        put(root, "ledger/ledger.json", &ledger_json(rev));
        put(root, &format!("ledger/assets/{ITEM}/p1.jpg"), "old p1");
        put(root, &format!("ledger/assets/{ITEM}/p2.jpg"), "old p2");
        put(root, &format!("ledger/assets/{GONE_ITEM}/p1.jpg"), "excluded unit photo");
        put(root, &format!("ledger/certificates/{OLD_CERT}"), "full serial and tester name");
        // not the ledger's own names: never touched
        put(root, "ledger/CNAME", "gear.example.org");
        put(root, &format!("ledger/assets/{ITEM}/notes.txt"), "mine");
        put(root, "ledger/assets/custom/p1.jpg", "mine");
        put(root, "ledger/certificates/readme.json", "mine");
        put(root, "other.jpg", "mine");
    }
    fn new_export(rev: i64) -> Vec<FolderFile> {
        vec![
            FolderFile { rel_path: "ledger/index.html".into(), text: Some("new page".into()), base64: None },
            FolderFile { rel_path: "ledger/ledger.json".into(), text: Some(ledger_json(rev)), base64: None },
            FolderFile { rel_path: format!("ledger/assets/{ITEM}/p1.jpg"), text: None, base64: Some("/9j/2Q==".into()) },
        ]
    }
    fn no_staging_left(root: &Path) -> bool {
        std::fs::read_dir(root).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(STAGING_PREFIX))
    }
    fn unchanged_earlier_export(root: &Path) {
        assert_eq!(text(root, "ledger/index.html"), "old page");
        assert_eq!(text(root, &format!("ledger/assets/{ITEM}/p1.jpg")), "old p1");
        assert!(root.join(format!("ledger/certificates/{OLD_CERT}")).exists());
        assert!(no_staging_left(root), "the staging folder is removed");
    }

    #[test]
    fn regression_fs33_reexport_removes_stale_certificates_and_photos_and_nothing_else() {
        let d = tmp("prune");
        earlier_export(&d, 1);
        let r = write_ledger_folder(&d.to_string_lossy(), new_export(2), None).unwrap();
        assert_eq!(r, LedgerWriteResult { written: 3, removed: 3, path: d.to_string_lossy().into_owned() });
        assert_eq!(text(&d, "ledger/index.html"), "new page");
        assert_eq!(ledger_revision_of(&text(&d, "ledger/ledger.json")), Some(2));
        assert_eq!(std::fs::read(d.join(format!("ledger/assets/{ITEM}/p1.jpg"))).unwrap(), vec![0xff, 0xd8, 0xff, 0xd9]);
        assert!(!d.join(format!("ledger/assets/{ITEM}/p2.jpg")).exists(), "a photo the new export no longer has");
        assert!(!d.join(format!("ledger/assets/{GONE_ITEM}")).exists(), "a unit no longer in the ledger");
        assert!(!d.join(format!("ledger/certificates/{OLD_CERT}")).exists(), "a certificate no longer included");
        for mine in ["ledger/CNAME", &format!("ledger/assets/{ITEM}/notes.txt"), "ledger/assets/custom/p1.jpg", "ledger/certificates/readme.json", "other.jpg"] {
            assert_eq!(text(&d, mine), if mine.ends_with("CNAME") { "gear.example.org" } else { "mine" }, "{mine} is left alone");
        }
        assert!(no_staging_left(&d));
        // the ledger's own names, exactly
        assert!(is_ledger_item_dir(ITEM) && !is_ledger_item_dir("a012345678") && !is_ledger_item_dir("A0123456789") && !is_ledger_item_dir("custom"));
        assert!(is_ledger_photo("p1.jpg") && is_ledger_photo("p24.jpg") && !is_ledger_photo("p0.jpg") && !is_ledger_photo("p01.jpg") && !is_ledger_photo("photo.jpg") && !is_ledger_photo("p1.jpeg"));
        assert!(is_ledger_certificate(OLD_CERT) && !is_ledger_certificate("c-aaaa.deckchek-cert.json") && !is_ledger_certificate("readme.json"));
    }

    #[test]
    fn regression_fs33_failed_write_leaves_the_previous_export_untouched() {
        let d = tmp("atomic");
        earlier_export(&d, 1);
        // an I/O failure after the files were staged: ledger/ is not touched, the staging folder is removed
        let e = write_ledger_folder_inner(&d.to_string_lossy(), new_export(2), None, Some(WriteFail::AfterStage)).unwrap_err();
        assert!(e.starts_with("LEDGER_WRITE"), "{e}");
        unchanged_earlier_export(&d);
        assert!(d.join(format!("ledger/assets/{ITEM}/p2.jpg")).exists());
        // a rejected entry (script file, path outside ledger/, traversal) changes nothing either
        for bad in ["ledger/run.js", "other/x.json", "ledger/../x.json", "ledger/assets/../../x.jpg"] {
            let mut files = new_export(2);
            files.push(FolderFile { rel_path: bad.into(), text: Some("x".into()), base64: None });
            assert!(write_ledger_folder(&d.to_string_lossy(), files, None).is_err(), "{bad}");
            unchanged_earlier_export(&d);
        }
        // a ledger.json that is not a DeckChek ledger, or none at all
        let mut files = new_export(2);
        files[1].text = Some("{}".into());
        assert!(write_ledger_folder(&d.to_string_lossy(), files, None).unwrap_err().starts_with("LEDGER_INVALID"));
        assert!(write_ledger_folder(&d.to_string_lossy(), new_export(2).into_iter().filter(|f| !f.rel_path.ends_with(".json")).collect(), None).is_err());
        assert!(write_ledger_folder("relative/dir", new_export(2), None).is_err());
        unchanged_earlier_export(&d);
    }

    #[cfg(unix)]
    #[test]
    fn regression_fs33_prune_never_follows_or_removes_symlinks() {
        let d = tmp("prune-sym");
        let outside = tmp("prune-sym-out");
        earlier_export(&d, 1);
        put(&outside, OLD_CERT, "someone else's file");
        std::fs::remove_dir_all(d.join("ledger/certificates")).unwrap();
        std::os::unix::fs::symlink(&outside, d.join("ledger/certificates")).unwrap();
        let e = write_ledger_folder(&d.to_string_lossy(), new_export(2), None).unwrap_err();
        assert!(e.contains("symbolic links"), "{e}");
        assert_eq!(text(&outside, OLD_CERT), "someone else's file");
        assert_eq!(text(&d, "ledger/index.html"), "old page");
        assert!(no_staging_left(&d));
        // a symlinked photo with a ledger name inside a real item folder
        std::fs::remove_file(d.join("ledger/certificates")).unwrap();
        let p2 = d.join(format!("ledger/assets/{ITEM}/p2.jpg"));
        std::fs::remove_file(&p2).unwrap();
        std::os::unix::fs::symlink(outside.join(OLD_CERT), &p2).unwrap();
        assert!(write_ledger_folder(&d.to_string_lossy(), new_export(2), None).unwrap_err().contains("symbolic links"));
        assert_eq!(text(&outside, OLD_CERT), "someone else's file");
        // the export root itself as a symlink
        let link = tmp("prune-sym-root").join("root");
        std::os::unix::fs::symlink(&d, &link).unwrap();
        assert!(write_ledger_folder(&link.to_string_lossy(), new_export(2), None).unwrap_err().contains("symbolic links"));
    }

    #[test]
    fn regression_fs33_folder_with_the_same_or_a_later_revision_is_refused_and_raises_the_floor() {
        let d = tmp("rev-folder");
        let floor = tmp("rev-floor").join(FLOOR_FILE);
        earlier_export(&d, 5);
        for rev in [3, 5] {
            let e = write_ledger_folder(&d.to_string_lossy(), new_export(rev), Some(&floor)).unwrap_err();
            assert!(e.starts_with("LEDGER_REVISION") && e.contains("revision 5") && e.contains("revision 6"), "{e}");
            unchanged_earlier_export(&d);
        }
        assert_eq!(read_floor(&floor), 5);
        let c = mem();
        assert_eq!(next_revision_with_floor(&c, read_floor(&floor)).unwrap(), 6, "the next attempt writes revision 6");
        assert_eq!(write_ledger_folder(&d.to_string_lossy(), new_export(6), Some(&floor)).unwrap().written, 3);
    }

    #[test]
    fn regression_fs33_backup_restore_does_not_rewind_the_revision_counter() {
        let floor = tmp("floor").join(FLOOR_FILE);
        assert_eq!(read_floor(&floor), 0);
        // revisions 1-3 exported; the backup was taken after revision 1
        let mut live = mem();
        for rev in 1..=3 {
            let row = record_export_with_floor(&mut live, &input(rev), read_floor(&floor)).unwrap();
            raise_floor(&floor, row.revision).unwrap();
        }
        let mut restored = mem();
        record_export_with_floor(&mut restored, &input(1), 0).unwrap();
        assert_eq!(next_revision(&restored).unwrap(), 2, "the restored history alone would reuse revision 2");
        assert_eq!(next_revision_with_floor(&restored, read_floor(&floor)).unwrap(), 4);
        for stale in [2, 3] {
            assert!(record_export_with_floor(&mut restored, &input(stale), read_floor(&floor)).unwrap_err().starts_with("LEDGER_REVISION"));
        }
        assert_eq!(record_export_with_floor(&mut restored, &input(4), read_floor(&floor)).unwrap().revision, 4);
        // the floor never goes down and ignores junk
        raise_floor(&floor, 2).unwrap();
        assert_eq!(read_floor(&floor), 3);
        std::fs::write(&floor, "not json").unwrap();
        assert_eq!(read_floor(&floor), 0);
        std::fs::write(&floor, format!("{{\"revision\":7,\"pad\":\"{}\"}}", "x".repeat(2000))).unwrap();
        assert_eq!(read_floor(&floor), 0, "oversized file ignored");
        raise_floor(&floor, 8).unwrap();
        assert_eq!(read_floor(&floor), 8);
    }

    #[test]
    fn regression_fs33_customer_bench_units_are_listed_for_exclusion() {
        let c = mem();
        assert!(customer_unit_ids(&c).unwrap().is_empty());
        c.execute_batch(
            "INSERT INTO asset (id, nickname, serial_number, created_at, updated_at) VALUES ('fs33-cust','Bench unit','CUST-1','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
             INSERT INTO service_job (id, job_number, customer_id, asset_id, status, reported_fault, opened_at, updated_at) VALUES ('j1','2026-0001',NULL,'fs33-cust','intake','hum','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
             INSERT INTO service_job (id, job_number, customer_id, asset_id, status, reported_fault, opened_at, updated_at) VALUES ('j2','2026-0002',NULL,'fs33-cust','collected','hum','2026-01-02T00:00:00Z','2026-01-02T00:00:00Z');
             INSERT INTO service_job (id, job_number, customer_id, asset_id, status, reported_fault, opened_at, updated_at) VALUES ('j3','2026-0003',NULL,NULL,'intake','x','2026-01-02T00:00:00Z','2026-01-02T00:00:00Z');",
        )
        .unwrap();
        assert_eq!(customer_unit_ids(&c).unwrap(), vec!["fs33-cust".to_string()]);
    }
}
