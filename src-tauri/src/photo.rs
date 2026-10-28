//! Content-addressed photo store (FS-00 §4.11, table from `0013_photo_store.sql`).
//!
//! The frontend (`app/photo-store.js`) re-encodes every photo to a JPEG of at most 1600 px on the
//! long edge, which strips EXIF/GPS. This module never trusts that: it re-checks the JPEG
//! structure byte by byte, refuses metadata segments (APP1 = EXIF/XMP, APP13 = IPTC), refuses
//! trailing data after the end-of-image marker and enforces the size and dimension caps. The file
//! is stored once as `<app_data_dir>/photos/<sha256>.jpg`, where the hash is over the final bytes;
//! rows in `photo_link` attach a photo to an owner (asset, service job or certificate). A file is
//! deleted when its last link goes. Every SQL statement is parameterised and file names are only
//! ever built from a hash this module computed or validated as 64 lowercase hex digits.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::canonical::sha256_hex;
use crate::db::{database_path, new_id, now_iso, open_database};

/// Largest accepted photo after processing (FS-00 §4.11).
pub const MAX_PHOTO_BYTES: usize = 2 * 1024 * 1024;
/// Longest edge of a stored photo, in pixels.
pub const MAX_EDGE_PX: u32 = 1600;
pub const OWNER_KINDS: &[&str] = &["asset", "service_job", "certificate"];
pub const MAX_LINKS_PER_OWNER: i64 = 100;
const MAX_OWNER_ID_CHARS: usize = 128;
const MAX_TEXT_CHARS: usize = 500;
const MAX_STAGE_CHARS: usize = 64;

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoAttachInput {
    pub owner_kind: String,
    pub owner_id: String,
    pub bytes_b64: String,
    pub caption: Option<String>,
    pub alt_text: Option<String>,
    pub stage: Option<String>,
    pub is_primary: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoAttached {
    pub photo_id: String,
    pub sha256: String,
    pub link_id: String,
    pub width: u32,
    pub height: u32,
    pub bytes: usize,
    /// The same bytes were already in the store (file and row reused).
    pub deduplicated: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoLinkInfo {
    pub link_id: String,
    pub photo_id: String,
    pub sha256: String,
    pub width: i64,
    pub height: i64,
    pub bytes: i64,
    pub caption: Option<String>,
    pub alt_text: Option<String>,
    pub stage: Option<String>,
    pub is_primary: bool,
    pub sort: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoUnlinked {
    pub unlinked: bool,
    pub file_deleted: bool,
}

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

// ------------------------------------------------------------------ JPEG inspection

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct JpegInfo {
    pub width: u32,
    pub height: u32,
}

/// Structural JPEG check. Accepts only: SOI, segments, one frame header, at least one scan, EOI at
/// the very end. Rejects EXIF/XMP (APP1) and IPTC (APP13) anywhere (also between progressive
/// scans), and any byte after EOI. Returns the frame dimensions.
pub fn inspect_jpeg(b: &[u8]) -> Result<JpegInfo, String> {
    if b.len() < 4 || b[0] != 0xFF || b[1] != 0xD8 || b[2] != 0xFF {
        return Err("not a JPEG: the file does not start with FF D8 FF".into());
    }
    let mut i = 2usize;
    let mut dims: Option<JpegInfo> = None;
    let mut scans = 0usize;
    loop {
        // at a marker prefix; skip fill bytes
        if i >= b.len() || b[i] != 0xFF {
            return Err("corrupt JPEG: expected a marker".into());
        }
        while i + 1 < b.len() && b[i + 1] == 0xFF {
            i += 1;
        }
        let Some(&m) = b.get(i + 1) else { return Err("truncated JPEG".into()) };
        match m {
            0x00 | 0xD8 => return Err("corrupt JPEG: unexpected marker".into()),
            0xD9 => {
                if i + 2 != b.len() {
                    return Err("JPEG has data after the end-of-image marker".into());
                }
                let info = dims.ok_or("JPEG has no frame header")?;
                if scans == 0 {
                    return Err("JPEG has no image data".into());
                }
                return Ok(info);
            }
            0x01 | 0xD0..=0xD7 => {
                i += 2;
                continue;
            }
            _ => {}
        }
        if i + 4 > b.len() {
            return Err("truncated JPEG".into());
        }
        let len = u16::from_be_bytes([b[i + 2], b[i + 3]]) as usize;
        if len < 2 || i + 2 + len > b.len() {
            return Err("truncated or corrupt JPEG segment".into());
        }
        let seg = &b[i + 4..i + 2 + len];
        match m {
            0xE1 => return Err("the JPEG carries an EXIF/XMP (APP1) segment; metadata is not allowed".into()),
            0xED => return Err("the JPEG carries an IPTC (APP13) segment; metadata is not allowed".into()),
            0xC0..=0xCF if !matches!(m, 0xC4 | 0xC8 | 0xCC) => {
                if dims.is_some() {
                    return Err("JPEG has more than one frame header".into());
                }
                if seg.len() < 6 {
                    return Err("corrupt JPEG frame header".into());
                }
                dims = Some(JpegInfo { height: u16::from_be_bytes([seg[1], seg[2]]) as u32, width: u16::from_be_bytes([seg[3], seg[4]]) as u32 });
            }
            _ => {}
        }
        i += 2 + len;
        if m == 0xDA {
            scans += 1;
            // entropy-coded data: FF00 and RSTn are data, any other FFxx is the next marker
            loop {
                let Some(off) = b[i..].iter().position(|&x| x == 0xFF) else { return Err("truncated JPEG".into()) };
                i += off;
                match b.get(i + 1) {
                    None => return Err("truncated JPEG".into()),
                    Some(0x00) | Some(0xD0..=0xD7) => i += 2,
                    Some(0xFF) => i += 1,
                    Some(_) => break,
                }
            }
        }
    }
}

/// Full validation for a photo about to be stored: structure, no metadata, dimensions, size.
pub fn validate_jpeg(bytes: &[u8]) -> Result<JpegInfo, String> {
    if bytes.len() > MAX_PHOTO_BYTES {
        return Err(format!("the photo is {} bytes; the limit is {MAX_PHOTO_BYTES}", bytes.len()));
    }
    let info = inspect_jpeg(bytes)?;
    if info.width == 0 || info.height == 0 {
        return Err("the JPEG has a zero dimension".into());
    }
    if info.width.max(info.height) > MAX_EDGE_PX {
        return Err(format!("the photo is {}x{} px; the long edge limit is {MAX_EDGE_PX}", info.width, info.height));
    }
    Ok(info)
}

// ------------------------------------------------------------------ files

fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// `<photos_dir>/<sha256>.jpg`; refuses anything that is not 64 lowercase hex digits.
pub fn photo_file(dir: &Path, sha256: &str) -> Result<PathBuf, String> {
    if !is_sha256_hex(sha256) {
        return Err("invalid photo hash".into());
    }
    Ok(dir.join(format!("{sha256}.jpg")))
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension(format!("tmp{}", new_id()));
    let result = (|| -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        fs::rename(&tmp, path)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(format!("could not write the photo: {e}"));
    }
    Ok(())
}

// ------------------------------------------------------------------ operations

fn clean_text(label: &str, v: &Option<String>, max: usize) -> Result<Option<String>, String> {
    match v.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        None => Ok(None),
        Some(s) if s.chars().count() > max => Err(format!("{label} is longer than {max} characters")),
        Some(s) => Ok(Some(s.to_string())),
    }
}

/// Validate and store `input` (see module docs). `dir` is the photos directory.
pub fn attach(conn: &mut Connection, dir: &Path, input: &PhotoAttachInput) -> Result<PhotoAttached, String> {
    if !OWNER_KINDS.contains(&input.owner_kind.as_str()) {
        return Err(format!("ownerKind must be one of {}", OWNER_KINDS.join(", ")));
    }
    let owner_id = input.owner_id.trim();
    if owner_id.is_empty() || owner_id.chars().count() > MAX_OWNER_ID_CHARS {
        return Err(format!("ownerId must be 1-{MAX_OWNER_ID_CHARS} characters"));
    }
    let caption = clean_text("caption", &input.caption, MAX_TEXT_CHARS)?;
    let alt_text = clean_text("altText", &input.alt_text, MAX_TEXT_CHARS)?;
    let stage = clean_text("stage", &input.stage, MAX_STAGE_CHARS)?;
    if input.bytes_b64.len() > MAX_PHOTO_BYTES / 3 * 4 + 8 {
        return Err(format!("the photo is larger than the {MAX_PHOTO_BYTES}-byte limit"));
    }
    let bytes = B64.decode(input.bytes_b64.trim()).map_err(|e| format!("bytesB64 is not valid base64: {e}"))?;
    let info = validate_jpeg(&bytes)?;
    let sha = sha256_hex(&bytes);
    let path = photo_file(dir, &sha)?;
    fs::create_dir_all(dir).map_err(|e| format!("could not create the photos folder: {e}"))?;

    // reuse an intact file with the same name; replace one whose size does not match (damaged)
    let existing_ok = fs::metadata(&path).map(|m| m.is_file() && m.len() == bytes.len() as u64).unwrap_or(false);
    let created_file = !existing_ok;
    if created_file {
        write_atomic(&path, &bytes)?;
    }

    let result = (|| -> Result<PhotoAttached, String> {
        let tx = conn.transaction().map_err(e2s)?;
        let now = now_iso(&tx)?;
        let row: Option<String> = tx.query_row("SELECT id FROM photo WHERE sha256 = ?1", [&sha], |r| r.get(0)).optional().map_err(e2s)?;
        let deduplicated = row.is_some();
        let photo_id = match row {
            Some(id) => id,
            None => {
                let id = new_id();
                tx.execute(
                    "INSERT INTO photo (id, sha256, mime, width, height, bytes, created_at) VALUES (?1, ?2, 'image/jpeg', ?3, ?4, ?5, ?6)",
                    params![id, sha, info.width, info.height, bytes.len() as i64, now],
                )
                .map_err(e2s)?;
                id
            }
        };
        let make_primary = input.is_primary.unwrap_or(false);
        let link: Option<String> = tx
            .query_row(
                "SELECT id FROM photo_link WHERE photo_id = ?1 AND owner_kind = ?2 AND owner_id = ?3",
                params![photo_id, input.owner_kind, owner_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(e2s)?;
        let link_id = match link {
            Some(id) => {
                // attaching the same photo again updates its details instead of duplicating it
                tx.execute(
                    "UPDATE photo_link SET caption = COALESCE(?2, caption), alt_text = COALESCE(?3, alt_text), stage = COALESCE(?4, stage) WHERE id = ?1",
                    params![id, caption, alt_text, stage],
                )
                .map_err(e2s)?;
                id
            }
            None => {
                let (count, max_sort): (i64, Option<i64>) = tx
                    .query_row("SELECT COUNT(*), MAX(sort) FROM photo_link WHERE owner_kind = ?1 AND owner_id = ?2", params![input.owner_kind, owner_id], |r| Ok((r.get(0)?, r.get(1)?)))
                    .map_err(e2s)?;
                if count >= MAX_LINKS_PER_OWNER {
                    return Err(format!("an owner can have at most {MAX_LINKS_PER_OWNER} photos"));
                }
                let id = new_id();
                tx.execute(
                    "INSERT INTO photo_link (id, photo_id, owner_kind, owner_id, caption, alt_text, stage, is_primary, sort, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9)",
                    params![id, photo_id, input.owner_kind, owner_id, caption, alt_text, stage, max_sort.map_or(0, |m| m + 1), now],
                )
                .map_err(e2s)?;
                id
            }
        };
        if make_primary {
            tx.execute("UPDATE photo_link SET is_primary = (id = ?3) WHERE owner_kind = ?1 AND owner_id = ?2", params![input.owner_kind, owner_id, link_id]).map_err(e2s)?;
        }
        tx.commit().map_err(e2s)?;
        Ok(PhotoAttached { photo_id, sha256: sha.clone(), link_id, width: info.width, height: info.height, bytes: bytes.len(), deduplicated })
    })();
    if result.is_err() && created_file {
        // do not leave an unreferenced file behind unless another row already points at it
        let referenced: i64 = conn.query_row("SELECT COUNT(*) FROM photo WHERE sha256 = ?1", [&sha], |r| r.get(0)).unwrap_or(1);
        if referenced == 0 {
            let _ = fs::remove_file(&path);
        }
    }
    result
}

pub fn list(conn: &Connection, owner_kind: &str, owner_id: &str) -> Result<Vec<PhotoLinkInfo>, String> {
    if !OWNER_KINDS.contains(&owner_kind) {
        return Err(format!("ownerKind must be one of {}", OWNER_KINDS.join(", ")));
    }
    let mut st = conn
        .prepare(
            "SELECT l.id, p.id, p.sha256, p.width, p.height, p.bytes, l.caption, l.alt_text, l.stage, l.is_primary, l.sort, l.created_at
             FROM photo_link l JOIN photo p ON p.id = l.photo_id
             WHERE l.owner_kind = ?1 AND l.owner_id = ?2 ORDER BY l.sort, l.created_at, l.id",
        )
        .map_err(e2s)?;
    let rows = st
        .query_map(params![owner_kind, owner_id.trim()], |r| {
            Ok(PhotoLinkInfo {
                link_id: r.get(0)?,
                photo_id: r.get(1)?,
                sha256: r.get(2)?,
                width: r.get(3)?,
                height: r.get(4)?,
                bytes: r.get(5)?,
                caption: r.get(6)?,
                alt_text: r.get(7)?,
                stage: r.get(8)?,
                is_primary: r.get::<_, i64>(9)? != 0,
                sort: r.get(10)?,
                created_at: r.get(11)?,
            })
        })
        .map_err(e2s)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)
}

/// Deletes the photo row and its file when no link references it any more; returns whether the file went.
fn drop_if_orphan(conn: &Connection, dir: &Path, photo_id: &str) -> Result<bool, String> {
    let links: i64 = conn.query_row("SELECT COUNT(*) FROM photo_link WHERE photo_id = ?1", [photo_id], |r| r.get(0)).map_err(e2s)?;
    if links > 0 {
        return Ok(false);
    }
    let sha: Option<String> = conn.query_row("SELECT sha256 FROM photo WHERE id = ?1", [photo_id], |r| r.get(0)).optional().map_err(e2s)?;
    let Some(sha) = sha else { return Ok(false) };
    conn.execute("DELETE FROM photo WHERE id = ?1", [photo_id]).map_err(e2s)?;
    match fs::remove_file(photo_file(dir, &sha)?) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(format!("could not delete the photo file: {e}")),
    }
}

pub fn unlink(conn: &mut Connection, dir: &Path, link_id: &str) -> Result<PhotoUnlinked, String> {
    let tx = conn.transaction().map_err(e2s)?;
    let photo: Option<String> = tx.query_row("SELECT photo_id FROM photo_link WHERE id = ?1", [link_id], |r| r.get(0)).optional().map_err(e2s)?;
    let Some(photo_id) = photo else { return Ok(PhotoUnlinked { unlinked: false, file_deleted: false }) };
    tx.execute("DELETE FROM photo_link WHERE id = ?1", [link_id]).map_err(e2s)?;
    let file_deleted = drop_if_orphan(&tx, dir, &photo_id)?;
    tx.commit().map_err(e2s)?;
    Ok(PhotoUnlinked { unlinked: true, file_deleted })
}

/// For owners that are being deleted (asset, service job, certificate): removes all their links and
/// any photo left without links. Call it inside the owner's own transaction (`conn` may be a
/// `Transaction` via deref); files of orphaned photos are deleted immediately after the SQL.
pub fn unlink_owner(conn: &Connection, dir: &Path, owner_kind: &str, owner_id: &str) -> Result<usize, String> {
    let mut st = conn.prepare("SELECT DISTINCT photo_id FROM photo_link WHERE owner_kind = ?1 AND owner_id = ?2").map_err(e2s)?;
    let ids: Vec<String> = st.query_map(params![owner_kind, owner_id], |r| r.get(0)).map_err(e2s)?.collect::<rusqlite::Result<_>>().map_err(e2s)?;
    drop(st);
    conn.execute("DELETE FROM photo_link WHERE owner_kind = ?1 AND owner_id = ?2", params![owner_kind, owner_id]).map_err(e2s)?;
    for id in &ids {
        drop_if_orphan(conn, dir, id)?;
    }
    Ok(ids.len())
}

/// Base64 of the stored JPEG; verifies the file still matches its hash.
pub fn read(conn: &Connection, dir: &Path, photo_id: &str) -> Result<String, String> {
    let sha: Option<String> = conn.query_row("SELECT sha256 FROM photo WHERE id = ?1", [photo_id], |r| r.get(0)).optional().map_err(e2s)?;
    let sha = sha.ok_or("unknown photo")?;
    let bytes = fs::read(photo_file(dir, &sha)?).map_err(|e| format!("the photo file is missing or unreadable: {e}"))?;
    if sha256_hex(&bytes) != sha {
        return Err("the photo file is damaged (its hash no longer matches)".into());
    }
    Ok(B64.encode(bytes))
}

// ------------------------------------------------------------------ commands

pub fn photos_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("photos"))
}

#[tauri::command]
pub async fn photo_attach(app: AppHandle, input: PhotoAttachInput) -> Result<PhotoAttached, String> {
    crate::db::off_main(move || {
        let mut conn = open_database(&database_path(&app)?)?;
        attach(&mut conn, &photos_dir(&app)?, &input)
    })
    .await?
}

#[tauri::command]
pub async fn photo_list(app: AppHandle, owner_kind: String, owner_id: String) -> Result<Vec<PhotoLinkInfo>, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        list(&conn, &owner_kind, &owner_id)
    })
    .await?
}

#[tauri::command]
pub async fn photo_unlink(app: AppHandle, link_id: String) -> Result<PhotoUnlinked, String> {
    crate::db::off_main(move || {
        let mut conn = open_database(&database_path(&app)?)?;
        unlink(&mut conn, &photos_dir(&app)?, &link_id)
    })
    .await?
}

#[tauri::command]
pub async fn photo_read(app: AppHandle, photo_id: String) -> Result<String, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        read(&conn, &photos_dir(&app)?, &photo_id)
    })
    .await?
}

#[cfg(test)]
pub(crate) mod test_support {
    /// Structurally valid, not decodable: SOI, JFIF, frame header, scan, entropy data, EOI.
    pub(crate) fn tiny_jpeg(w: u16, h: u16, extra_before_sof: &[u8], seed: u8) -> Vec<u8> {
        let mut v = vec![0xFF, 0xD8, 0xFF, 0xE0, 0, 16, b'J', b'F', b'I', b'F', 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
        v.extend_from_slice(extra_before_sof);
        v.extend_from_slice(&[0xFF, 0xC0, 0, 11, 8, (h >> 8) as u8, h as u8, (w >> 8) as u8, w as u8, 1, 1, 0x11, 0]);
        v.extend_from_slice(&[0xFF, 0xDA, 0, 8, 1, 1, 0, 0, 63, 0]);
        v.extend_from_slice(&[0x12, seed, 0xFF, 0x00, 0x56, 0xFF, 0xD0, 0x78]);
        v.extend_from_slice(&[0xFF, 0xD9]);
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    use super::test_support::tiny_jpeg;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::apply_migrations(&c).unwrap();
        c
    }

    struct TempDir(PathBuf);
    impl TempDir {
        fn new() -> Self {
            TempDir(std::env::temp_dir().join(format!("deckchek-photo-{}-{}", std::process::id(), new_id())))
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn input(bytes: &[u8], kind: &str, owner: &str) -> PhotoAttachInput {
        PhotoAttachInput { owner_kind: kind.into(), owner_id: owner.into(), bytes_b64: B64.encode(bytes), caption: None, alt_text: None, stage: None, is_primary: None }
    }

    fn files(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(dir).map(|d| d.map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect()).unwrap_or_default();
        v.sort();
        v
    }

    #[test]
    fn attach_stores_by_hash_and_links_to_the_owner() {
        let mut c = mem();
        let d = TempDir::new();
        let jpg = tiny_jpeg(1200, 800, &[], 1);
        let mut i = input(&jpg, "asset", "asset-1");
        i.caption = Some("  Front panel ".into());
        i.stage = Some("before".into());
        i.is_primary = Some(true);
        let r = attach(&mut c, &d.0, &i).unwrap();
        assert_eq!(r.sha256, sha256_hex(&jpg));
        assert_eq!((r.width, r.height, r.bytes, r.deduplicated), (1200, 800, jpg.len(), false));
        assert_eq!(files(&d.0), vec![format!("{}.jpg", r.sha256)]);
        assert_eq!(fs::read(photo_file(&d.0, &r.sha256).unwrap()).unwrap(), jpg);
        let l = list(&c, "asset", "asset-1").unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!((l[0].caption.as_deref(), l[0].stage.as_deref(), l[0].is_primary, l[0].sort), (Some("Front panel"), Some("before"), true, 0));
        assert_eq!((l[0].width, l[0].height, l[0].bytes), (1200, 800, jpg.len() as i64));
        assert_eq!(read(&c, &d.0, &r.photo_id).unwrap(), B64.encode(&jpg));
        assert!(list(&c, "certificate", "asset-1").unwrap().is_empty());
    }

    #[test]
    fn identical_bytes_are_deduplicated_across_owners_and_idempotent_per_owner() {
        let mut c = mem();
        let d = TempDir::new();
        let jpg = tiny_jpeg(640, 480, &[], 2);
        let a = attach(&mut c, &d.0, &input(&jpg, "asset", "a")).unwrap();
        let b = attach(&mut c, &d.0, &input(&jpg, "service_job", "job-9")).unwrap();
        assert_eq!(a.photo_id, b.photo_id);
        assert!(!a.deduplicated && b.deduplicated);
        assert_ne!(a.link_id, b.link_id);
        // same owner again: no second link, details updated
        let mut again = input(&jpg, "asset", "a");
        again.caption = Some("updated".into());
        let a2 = attach(&mut c, &d.0, &again).unwrap();
        assert_eq!(a2.link_id, a.link_id);
        assert_eq!(list(&c, "asset", "a").unwrap().len(), 1);
        assert_eq!(list(&c, "asset", "a").unwrap()[0].caption.as_deref(), Some("updated"));
        assert_eq!(files(&d.0).len(), 1);
        assert_eq!(c.query_row::<i64, _, _>("SELECT COUNT(*) FROM photo", [], |r| r.get(0)).unwrap(), 1);
    }

    #[test]
    fn file_is_deleted_only_when_the_last_link_goes() {
        let mut c = mem();
        let d = TempDir::new();
        let jpg = tiny_jpeg(100, 100, &[], 3);
        let a = attach(&mut c, &d.0, &input(&jpg, "asset", "a")).unwrap();
        let b = attach(&mut c, &d.0, &input(&jpg, "certificate", "cert")).unwrap();
        assert_eq!(unlink(&mut c, &d.0, &a.link_id).unwrap(), PhotoUnlinked { unlinked: true, file_deleted: false });
        assert_eq!(files(&d.0).len(), 1);
        assert_eq!(read(&c, &d.0, &b.photo_id).unwrap(), B64.encode(&jpg));
        assert_eq!(unlink(&mut c, &d.0, &b.link_id).unwrap(), PhotoUnlinked { unlinked: true, file_deleted: true });
        assert!(files(&d.0).is_empty());
        assert_eq!(c.query_row::<i64, _, _>("SELECT COUNT(*) FROM photo", [], |r| r.get(0)).unwrap(), 0);
        assert_eq!(unlink(&mut c, &d.0, &b.link_id).unwrap(), PhotoUnlinked { unlinked: false, file_deleted: false });
        assert!(read(&c, &d.0, &b.photo_id).is_err());
    }

    #[test]
    fn exif_and_other_metadata_segments_are_rejected() {
        let mut c = mem();
        let d = TempDir::new();
        let exif = [0xFF, 0xE1, 0, 8, b'E', b'x', b'i', b'f', 0, 0];
        let e = attach(&mut c, &d.0, &input(&tiny_jpeg(10, 10, &exif, 4), "asset", "a")).unwrap_err();
        assert!(e.contains("APP1"), "{e}");
        let xmp = [0xFF, 0xE1, 0, 4, b'x', b'y'];
        assert!(attach(&mut c, &d.0, &input(&tiny_jpeg(10, 10, &xmp, 4), "asset", "a")).is_err());
        let iptc = [0xFF, 0xED, 0, 4, 1, 2];
        assert!(attach(&mut c, &d.0, &input(&tiny_jpeg(10, 10, &iptc, 4), "asset", "a")).unwrap_err().contains("APP13"));
        // APP1 hidden after the first scan (progressive-style), and APP1 appended after EOI
        let mut late = tiny_jpeg(10, 10, &[], 5);
        late.truncate(late.len() - 2);
        late.extend_from_slice(&[0xFF, 0xE1, 0, 4, b'g', b'p', 0xFF, 0xD9]);
        assert!(attach(&mut c, &d.0, &input(&late, "asset", "a")).unwrap_err().contains("APP1"));
        let mut trailing = tiny_jpeg(10, 10, &[], 6);
        trailing.extend_from_slice(&[0xFF, 0xE1, 0, 4, b'g', b'p']);
        assert!(attach(&mut c, &d.0, &input(&trailing, "asset", "a")).unwrap_err().contains("after the end"));
        // ICC (APP2), Adobe (APP14) and comments are allowed
        let ok = [0xFF, 0xFE, 0, 4, b'h', b'i', 0xFF, 0xEE, 0, 4, b'A', b'd'];
        attach(&mut c, &d.0, &input(&tiny_jpeg(10, 10, &ok, 7), "asset", "a")).unwrap();
        assert_eq!(files(&d.0).len(), 1, "rejected photos leave no file");
        assert_eq!(c.query_row::<i64, _, _>("SELECT COUNT(*) FROM photo", [], |r| r.get(0)).unwrap(), 1);
    }

    #[test]
    fn magic_structure_size_and_dimension_checks() {
        let mut c = mem();
        let d = TempDir::new();
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];
        assert!(attach(&mut c, &d.0, &input(&png, "asset", "a")).unwrap_err().contains("not a JPEG"));
        assert!(attach(&mut c, &d.0, &input(b"RIFF....WEBPVP8 ", "asset", "a")).is_err());
        assert!(attach(&mut c, &d.0, &input(&[], "asset", "a")).is_err());
        let good = tiny_jpeg(50, 50, &[], 8);
        assert!(attach(&mut c, &d.0, &input(&good[..good.len() - 2], "asset", "a")).is_err(), "no EOI");
        assert!(attach(&mut c, &d.0, &input(&good[..30], "asset", "a")).is_err(), "truncated");
        assert!(attach(&mut c, &d.0, &input(&tiny_jpeg(1601, 100, &[], 8), "asset", "a")).unwrap_err().contains("1600"));
        assert!(attach(&mut c, &d.0, &input(&tiny_jpeg(100, 1601, &[], 8), "asset", "a")).is_err());
        assert!(attach(&mut c, &d.0, &input(&tiny_jpeg(0, 100, &[], 8), "asset", "a")).is_err());
        attach(&mut c, &d.0, &input(&tiny_jpeg(1600, 1600, &[], 8), "asset", "a")).unwrap();
        // size cap: valid structure padded by entropy data
        let mut big = tiny_jpeg(100, 100, &[], 9);
        let eoi = big.split_off(big.len() - 2);
        big.extend(std::iter::repeat(0x11).take(MAX_PHOTO_BYTES));
        big.extend(eoi);
        assert!(attach(&mut c, &d.0, &input(&big, "asset", "a")).unwrap_err().contains("limit"));
        // exactly at the cap is fine
        let mut at_cap = tiny_jpeg(100, 100, &[], 10);
        let eoi = at_cap.split_off(at_cap.len() - 2);
        let pad = MAX_PHOTO_BYTES - at_cap.len() - 2;
        at_cap.extend(std::iter::repeat(0x11).take(pad));
        at_cap.extend(eoi);
        assert_eq!(at_cap.len(), MAX_PHOTO_BYTES);
        attach(&mut c, &d.0, &input(&at_cap, "asset", "a")).unwrap();
        // base64 problems and an absurdly long string
        let mut bad = input(&good, "asset", "a");
        bad.bytes_b64 = "not base64!!".into();
        assert!(attach(&mut c, &d.0, &bad).unwrap_err().contains("base64"));
        bad.bytes_b64 = "A".repeat(MAX_PHOTO_BYTES * 2);
        assert!(attach(&mut c, &d.0, &bad).unwrap_err().contains("limit"));
    }

    #[test]
    fn owner_and_text_validation() {
        let mut c = mem();
        let d = TempDir::new();
        let jpg = tiny_jpeg(20, 20, &[], 11);
        assert!(attach(&mut c, &d.0, &input(&jpg, "venue", "a")).is_err());
        assert!(attach(&mut c, &d.0, &input(&jpg, "asset", "  ")).is_err());
        assert!(attach(&mut c, &d.0, &input(&jpg, "asset", &"x".repeat(129))).is_err());
        let mut i = input(&jpg, "asset", "a");
        i.caption = Some("c".repeat(501));
        assert!(attach(&mut c, &d.0, &i).is_err());
        i.caption = None;
        i.stage = Some("s".repeat(65));
        assert!(attach(&mut c, &d.0, &i).is_err());
        assert!(list(&c, "bogus", "a").is_err());
        assert!(files(&d.0).is_empty(), "failed validation writes nothing");
    }

    #[test]
    fn primary_is_exclusive_and_sort_increases() {
        let mut c = mem();
        let d = TempDir::new();
        let mut ids = vec![];
        for n in 0..3u8 {
            let mut i = input(&tiny_jpeg(30, 30, &[], 20 + n), "asset", "a");
            i.is_primary = Some(n == 0 || n == 2);
            ids.push(attach(&mut c, &d.0, &i).unwrap().link_id);
        }
        let l = list(&c, "asset", "a").unwrap();
        assert_eq!(l.iter().map(|x| x.sort).collect::<Vec<_>>(), vec![0, 1, 2]);
        assert_eq!(l.iter().map(|x| x.is_primary).collect::<Vec<_>>(), vec![false, false, true], "the last primary wins");
        assert_eq!(l.iter().map(|x| x.link_id.clone()).collect::<Vec<_>>(), ids);
    }

    #[test]
    fn unlink_owner_removes_links_and_orphans_but_keeps_shared_photos() {
        let mut c = mem();
        let d = TempDir::new();
        let shared = tiny_jpeg(30, 30, &[], 30);
        let own = tiny_jpeg(30, 30, &[], 31);
        attach(&mut c, &d.0, &input(&shared, "asset", "gone")).unwrap();
        attach(&mut c, &d.0, &input(&own, "asset", "gone")).unwrap();
        let keep = attach(&mut c, &d.0, &input(&shared, "certificate", "cert")).unwrap();
        let tx = c.transaction().unwrap();
        assert_eq!(unlink_owner(&tx, &d.0, "asset", "gone").unwrap(), 2);
        tx.commit().unwrap();
        assert!(list(&c, "asset", "gone").unwrap().is_empty());
        assert_eq!(files(&d.0), vec![format!("{}.jpg", keep.sha256)]);
        assert_eq!(list(&c, "certificate", "cert").unwrap().len(), 1);
    }

    #[test]
    fn read_detects_missing_and_damaged_files() {
        let mut c = mem();
        let d = TempDir::new();
        let r = attach(&mut c, &d.0, &input(&tiny_jpeg(30, 30, &[], 40), "asset", "a")).unwrap();
        let path = photo_file(&d.0, &r.sha256).unwrap();
        fs::write(&path, b"tampered").unwrap();
        assert!(read(&c, &d.0, &r.photo_id).unwrap_err().contains("damaged"));
        // re-attaching the same bytes repairs a file whose size differs
        let again = attach(&mut c, &d.0, &input(&tiny_jpeg(30, 30, &[], 40), "asset", "b")).unwrap();
        assert!(again.deduplicated);
        assert!(read(&c, &d.0, &r.photo_id).is_ok());
        fs::remove_file(&path).unwrap();
        assert!(read(&c, &d.0, &r.photo_id).unwrap_err().contains("missing"));
        assert!(read(&c, &d.0, "nope").is_err());
    }

    #[test]
    fn file_names_only_come_from_valid_hashes() {
        let d = Path::new("/x");
        assert!(photo_file(d, &"a".repeat(64)).is_ok());
        for bad in ["", "../etc/passwd", &"A".repeat(64), &"a".repeat(63), &format!("{}/", "a".repeat(63)), "a/../".repeat(13).as_str()] {
            assert!(photo_file(d, bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn rows_survive_deleting_a_photo_row_via_cascade() {
        let mut c = mem();
        let d = TempDir::new();
        let r = attach(&mut c, &d.0, &input(&tiny_jpeg(30, 30, &[], 50), "asset", "a")).unwrap();
        c.execute("DELETE FROM photo WHERE id = ?1", [&r.photo_id]).unwrap();
        assert!(list(&c, "asset", "a").unwrap().is_empty(), "photo_link rows cascade with their photo");
        // CHECK constraints
        assert!(c.execute("INSERT INTO photo (id, sha256, mime, width, height, bytes, created_at) VALUES ('x','y','image/png',1,1,1,'t')", []).is_err());
    }

    #[test]
    fn contract_examples_round_trip() {
        let raw = fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/photo.json")).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        let req: PhotoAttachInput = serde_json::from_value(v["photo_attach"]["request"]["input"].clone()).unwrap();
        let mut c = mem();
        let d = TempDir::new();
        let mut got = serde_json::to_value(attach(&mut c, &d.0, &req).unwrap()).unwrap();
        let want = &v["photo_attach"]["response"];
        for k in ["photoId", "linkId"] {
            assert!(got[k].is_string());
            got[k] = want[k].clone();
        }
        assert_eq!(&got, want);
        let list_req = &v["photo_list"]["request"];
        let mut rows = serde_json::to_value(list(&c, list_req["ownerKind"].as_str().unwrap(), list_req["ownerId"].as_str().unwrap()).unwrap()).unwrap();
        let want_rows = &v["photo_list"]["response"];
        for k in ["linkId", "photoId", "createdAt"] {
            rows[0][k] = want_rows[0][k].clone();
        }
        assert_eq!(&rows, want_rows);
        assert!(v["photo_unlink"]["request"]["linkId"].is_string() && v["photo_read"]["request"]["photoId"].is_string());
        assert_eq!(v["photo_unlink"]["response"], serde_json::json!({"unlinked": true, "fileDeleted": true}));
    }
}
