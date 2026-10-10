//! Backup and restore (FS-08).
//!
//! A `.deckchek-backup` file is a zip whose entry names are fixed: `manifest.json`
//! (written first), `db/deckchek.sqlite3` (online-backup snapshot, integrity-checked
//! and VACUUMed), optional `settings/ui.json` + `settings/calibration.json` (handed
//! over by the webview, which owns those localStorage keys) and
//! `data/midi-maps.json` (redundant export of `asset_midi_map` for readability).
//!
//! Safety rules:
//! - Archive entry names are never used as paths: only the fixed names above are
//!   read, each into a path DeckChek chooses. An archive holding any absolute,
//!   drive-letter, backslash or `..` entry name is refused outright.
//! - Every read entry is size-capped (DB 2 GiB, JSON 5 MiB) and ratio-capped (100:1
//!   once past 1 MiB), counted on the bytes actually inflated, not the declared size.
//! - Restore never writes the live database until the extracted copy has passed its
//!   checksum, `integrity_check` and migration in a temp file next to it; the swap is
//!   rename-based (same volume) and is rolled back on any error, under the FS-00
//!   connection gate's write guard so no connection is open meanwhile.

use std::fs::{self, File};
use std::io::{self, BufWriter, Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::backup::{Backup, StepResult};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::db::{self, PersistRun};
use crate::userfiles::{self, UserFileError};

pub const EXT: &str = "deckchek-backup";
const FORMAT: &str = "deckchek-backup";
pub const FORMAT_VERSION: i64 = 1;

const MANIFEST: &str = "manifest.json";
const DB_ENTRY: &str = "db/deckchek.sqlite3";
const UI_ENTRY: &str = "settings/ui.json";
const CAL_ENTRY: &str = "settings/calibration.json";
const MIDI_ENTRY: &str = "data/midi-maps.json";

pub const MAX_DB_BYTES: u64 = 2 * 1024 * 1024 * 1024;
pub const MAX_JSON_BYTES: u64 = 5 * 1024 * 1024;
/// Decompression ratio guard (zip bomb), applied once an entry inflates past [`RATIO_FLOOR`].
pub const MAX_RATIO: u64 = 100;
const RATIO_FLOOR: u64 = 1024 * 1024;
const MAX_ENTRIES: usize = 100_000;

/// Online-backup step size and pause (FS-08 §6; tunable).
const PAGES_PER_STEP: i32 = 100;
const STEP_PAUSE: Duration = Duration::from_millis(10);
/// Consecutive `SQLITE_BUSY`/`LOCKED` steps tolerated before giving up (FS-08 §7).
const BUSY_RETRIES: u32 = 5;
/// Restarts caused by concurrent writers before copying the rest in one locked step.
const MAX_RESTARTS: u32 = 3;

pub const DEFAULT_KEEP: u32 = 7;
pub const MAX_KEEP: u32 = 365;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;
const ON_EXIT_CAP: Duration = Duration::from_secs(5);
const SETTINGS_KEY: &str = "backup";
const SETTINGS_CACHE: &str = ".settings-cache.json";
const MAX_IMPORT_RUNS: usize = 10_000;

// ---------------------------------------------------------------- errors

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackupError {
    pub code: &'static str,
    pub message: String,
}

impl BackupError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

impl std::fmt::Display for BackupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl Serialize for BackupError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("BackupError", 2)?;
        st.serialize_field("code", self.code)?;
        st.serialize_field("message", &self.message)?;
        st.end()
    }
}

impl From<UserFileError> for BackupError {
    fn from(e: UserFileError) -> Self {
        Self::new("invalid_path", e.to_string())
    }
}

/// Maps an I/O error to a user message without echoing OS text (which can hold full paths).
fn io_err(doing: &str, e: io::Error) -> BackupError {
    match e.kind() {
        io::ErrorKind::StorageFull => BackupError::new("disk_full", format!("Not enough disk space to {doing}. Free some space and retry.")),
        io::ErrorKind::PermissionDenied => BackupError::new("permission", format!("Permission denied while trying to {doing}. The file may be read-only or open in another program.")),
        io::ErrorKind::NotFound => BackupError::new("not_found", format!("A file needed to {doing} was not found.")),
        k => BackupError::new("io", format!("Could not {doing} ({k:?}).")),
    }
}

fn sql_err(doing: &str, e: rusqlite::Error) -> BackupError {
    BackupError::new("database", format!("Database error while trying to {doing}: {e}"))
}

fn bad_zip() -> BackupError {
    BackupError::new("bad_zip", "This file is not a valid DeckChek backup (the zip archive is damaged or not a zip file).")
}

// ---------------------------------------------------------------- types

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Manual,
    Auto,
    PreRestore,
}

impl Kind {
    fn as_str(self) -> &'static str {
        match self {
            Kind::Manual => "manual",
            Kind::Auto => "auto",
            Kind::PreRestore => "pre_restore",
        }
    }
}

/// Settings the webview hands over (localStorage `deckchek.ui.v1` and `deckchek.calibration.v1`).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SettingsBlob {
    pub ui: Option<Value>,
    pub calibration: Option<Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Counts {
    pub runs: i64,
    pub assets: i64,
    pub profiles: i64,
    pub midi_maps: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManifestFile {
    pub name: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: String,
    pub format_version: i64,
    pub created_at: String,
    pub kind: String,
    pub app_version: String,
    pub schema_version: i64,
    #[serde(default)]
    pub counts: Counts,
    pub files: Vec<ManifestFile>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateResult {
    pub path: String,
    pub bytes: u64,
    pub created_at: String,
    pub kind: Kind,
    pub counts: Counts,
    pub schema_version: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InspectResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub error_code: Option<String>,
    pub manifest: Option<Manifest>,
    pub counts: Option<Counts>,
    pub needs_migration: bool,
    pub too_new: bool,
    pub current_schema_version: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub restored_from: String,
    pub upgraded_from: Option<i64>,
    pub schema_version: i64,
    pub safety_backup: Option<String>,
    pub settings: Value,
    pub calibration_profiles: Value,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub created_at: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Mode {
    #[serde(rename = "off")]
    Off,
    #[serde(rename = "daily")]
    Daily,
    #[serde(rename = "weekly")]
    Weekly,
    #[serde(rename = "onExit")]
    OnExit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleSettings {
    pub mode: Mode,
    pub keep: u32,
    #[serde(default)]
    pub last_auto_at: Option<String>,
    #[serde(default)]
    pub last_auto_ms: Option<i64>,
}

impl Default for ScheduleSettings {
    fn default() -> Self {
        Self { mode: Mode::Off, keep: DEFAULT_KEEP, last_auto_at: None, last_auto_ms: None }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleInput {
    pub mode: Mode,
    pub keep: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub runs_imported: u32,
    pub runs_skipped: u32,
    pub runs_invalid: u32,
    pub equipment_imported: u32,
}

/// Where backups operate. `gate` is the FS-00 connection gate in the app; tests pass their own.
pub struct Ctx {
    pub live_db: PathBuf,
    pub backups_dir: PathBuf,
    pub gate: &'static RwLock<()>,
}

/// Points where tests inject a restore failure (production passes `None`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(not(test), allow(dead_code))]
pub enum FailPoint {
    Migration,
    AfterSafetyBackup,
    MidSwap,
    AfterSwap,
}

// ---------------------------------------------------------------- time

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// (year, month, day, hour, minute, second, millis) in UTC.
fn civil(ms: i64) -> (i64, u32, u32, u32, u32, u32, u32) {
    let days = ms.div_euclid(DAY_MS);
    let rem = ms.rem_euclid(DAY_MS);
    // Howard Hinnant's days_to_civil.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + i64::from(m <= 2);
    let (h, mi, s, milli) = ((rem / 3_600_000) as u32, (rem / 60_000 % 60) as u32, (rem / 1000 % 60) as u32, (rem % 1000) as u32);
    (y, m, d, h, mi, s, milli)
}

pub fn iso_utc(ms: i64) -> String {
    let (y, m, d, h, mi, s, milli) = civil(ms);
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}.{milli:03}Z")
}

fn file_stamp(ms: i64) -> String {
    let (y, m, d, h, mi, s, _) = civil(ms);
    format!("{y:04}{m:02}{d:02}-{h:02}{mi:02}{s:02}")
}

// ---------------------------------------------------------------- small helpers

fn current_schema_version() -> i64 {
    db::MIGRATIONS.iter().map(|(v, _)| *v).max().unwrap_or(0)
}

fn schema_version(conn: &Connection) -> Result<i64, BackupError> {
    conn.query_row("SELECT COALESCE(MAX(version), 0) FROM schema_migration WHERE version < 1000", [], |r| r.get(0))
        .map_err(|_| BackupError::new("corrupt_db", "The backup's database is not a DeckChek database (no schema version)."))
}

fn integrity_ok(conn: &Connection) -> bool {
    conn.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0)).map(|s| s == "ok").unwrap_or(false)
}

fn sha_hex(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn sha_file(path: &Path) -> Result<(u64, String), BackupError> {
    let mut f = File::open(path).map_err(|e| io_err("read the database snapshot", e))?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let n = f.read(&mut buf).map_err(|e| io_err("read the database snapshot", e))?;
        if n == 0 {
            break;
        }
        total += n as u64;
        h.update(&buf[..n]);
    }
    Ok((total, hex(&h.finalize())))
}

fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_os_string();
    s.push(suffix);
    PathBuf::from(s)
}

fn remove_quietly(path: &Path) {
    let _ = fs::remove_file(path);
}

/// Deletes the listed files when dropped unless disarmed (cleans temp files on every error path).
struct TempFiles(Vec<PathBuf>);
impl TempFiles {
    fn disarm(&mut self) {
        self.0.clear();
    }
}
impl Drop for TempFiles {
    fn drop(&mut self) {
        for p in &self.0 {
            remove_quietly(p);
        }
    }
}

/// An entry name is safe when it is relative, forward-slashed and free of `.`/`..`
/// segments, drive letters, colons and NULs. One trailing `/` (a folder entry) is allowed.
pub fn entry_name_safe(name: &str) -> bool {
    if name.is_empty() || name.contains('\0') || name.contains('\\') || name.contains(':') || name.starts_with('/') {
        return false;
    }
    let trimmed = name.strip_suffix('/').unwrap_or(name);
    !trimmed.is_empty() && trimmed.split('/').all(|s| !s.is_empty() && s != "." && s != "..")
}

/// Streams one entry into `sink`, enforcing the size cap and the ratio guard on the
/// inflated byte count. Returns (bytes, sha256 hex).
fn read_entry<R: Read + Seek>(archive: &mut ZipArchive<R>, name: &str, max: u64, sink: &mut dyn Write) -> Result<(u64, String), BackupError> {
    let mut f = archive
        .by_name(name)
        .map_err(|_| BackupError::new("missing_entry", format!("The backup is incomplete: {name} is missing.")))?;
    let too_large = || BackupError::new("too_large", format!("The backup entry {name} is larger than DeckChek accepts and was refused."));
    if f.size() > max {
        return Err(too_large());
    }
    let compressed = f.compressed_size().max(1);
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let n = f.read(&mut buf).map_err(|_| BackupError::new("corrupt", format!("The backup entry {name} is damaged and cannot be read.")))?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > max {
            return Err(too_large());
        }
        if total > RATIO_FLOOR && total > compressed.saturating_mul(MAX_RATIO) {
            return Err(BackupError::new("zip_bomb", format!("The backup entry {name} expands far more than a real backup would and was refused.")));
        }
        h.update(&buf[..n]);
        sink.write_all(&buf[..n]).map_err(|e| io_err("extract the backup", e))?;
    }
    Ok((total, hex(&h.finalize())))
}

fn known_limit(name: &str) -> Option<u64> {
    match name {
        DB_ENTRY => Some(MAX_DB_BYTES),
        UI_ENTRY | CAL_ENTRY | MIDI_ENTRY => Some(MAX_JSON_BYTES),
        _ => None,
    }
}

fn open_archive(path: &Path) -> Result<ZipArchive<File>, BackupError> {
    let f = File::open(path).map_err(|e| io_err("open the backup file", e))?;
    let archive = ZipArchive::new(f).map_err(|_| bad_zip())?;
    if archive.len() > MAX_ENTRIES {
        return Err(BackupError::new("too_large", "The backup holds too many entries and was refused."));
    }
    if archive.file_names().any(|n| !entry_name_safe(n)) {
        return Err(BackupError::new("unsafe_entry", "The backup contains an unsafe file name (absolute path or '..') and was refused."));
    }
    Ok(archive)
}

fn too_new_message(v: i64) -> String {
    format!("This backup was made by a newer DeckChek (schema v{v}). Update the app to restore it.")
}

/// Full verification: zip structure, entry names, manifest shape and versions, and the
/// size + sha256 of every known file listed in the manifest. Touches nothing on disk.
fn verify_archive(path: &Path) -> Result<Manifest, BackupError> {
    let mut archive = open_archive(path)?;
    let mut raw = Vec::new();
    read_entry(&mut archive, MANIFEST, MAX_JSON_BYTES, &mut raw)
        .map_err(|e| if e.code == "missing_entry" { BackupError::new("missing_manifest", "This file is not a DeckChek backup (manifest.json is missing).") } else { e })?;
    let bad_manifest = || BackupError::new("bad_manifest", "The backup's manifest is malformed.");
    let v: Value = serde_json::from_slice(&raw).map_err(|_| bad_manifest())?;
    if v.get("format").and_then(Value::as_str) != Some(FORMAT) {
        return Err(BackupError::new("bad_manifest", "This file is not a DeckChek backup (unknown format)."));
    }
    let fv = v.get("formatVersion").and_then(Value::as_i64).ok_or_else(bad_manifest)?;
    if fv > FORMAT_VERSION {
        return Err(BackupError::new("format_too_new", format!("This backup uses a newer backup format (v{fv}). Update DeckChek to restore it.")));
    }
    if fv != FORMAT_VERSION {
        return Err(bad_manifest());
    }
    let sv = v.get("schemaVersion").and_then(Value::as_i64).ok_or_else(bad_manifest)?;
    if sv > current_schema_version() {
        return Err(BackupError::new("too_new", too_new_message(sv)));
    }
    if sv < 1 {
        return Err(bad_manifest());
    }
    let manifest: Manifest = serde_json::from_value(v).map_err(|_| bad_manifest())?;
    let mut seen = std::collections::HashSet::new();
    for f in &manifest.files {
        if !entry_name_safe(&f.name) || !seen.insert(f.name.as_str()) {
            return Err(BackupError::new("bad_manifest", "The backup's manifest lists an unsafe or duplicate file name."));
        }
    }
    if !seen.contains(DB_ENTRY) {
        return Err(BackupError::new("bad_manifest", "The backup's manifest does not list the database."));
    }
    for f in &manifest.files {
        // Unknown names (later additive formats, e.g. photos/) are neither read nor used.
        let Some(limit) = known_limit(&f.name) else { continue };
        let (bytes, sha) = read_entry(&mut archive, &f.name, limit, &mut io::sink())?;
        if bytes != f.bytes || !sha.eq_ignore_ascii_case(&f.sha256) {
            return Err(BackupError::new("checksum", format!("The backup is damaged: {} does not match its checksum.", f.name)));
        }
    }
    Ok(manifest)
}

pub fn inspect_file(path: &Path) -> InspectResult {
    let current = current_schema_version();
    match verify_archive(path) {
        Ok(m) => InspectResult {
            valid: true,
            errors: vec![],
            error_code: None,
            counts: Some(m.counts.clone()),
            needs_migration: m.schema_version < current,
            too_new: false,
            manifest: Some(m),
            current_schema_version: current,
        },
        Err(e) => InspectResult {
            valid: false,
            errors: vec![e.message],
            error_code: Some(e.code.to_string()),
            manifest: None,
            counts: None,
            needs_migration: false,
            too_new: e.code == "too_new" || e.code == "format_too_new",
            current_schema_version: current,
        },
    }
}

// ---------------------------------------------------------------- create

/// Copies `live` into `dst_path` with the SQLite online backup API, so the copy is a
/// transactionally consistent snapshot even while other connections write.
fn snapshot_db(live: &Path, dst_path: &Path, progress: &mut dyn FnMut(u64, u64)) -> Result<(), BackupError> {
    let src = Connection::open_with_flags(live, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|e| sql_err("open the database for backup", e))?;
    let mut dst = Connection::open(dst_path).map_err(|e| sql_err("create the snapshot", e))?;
    {
        let b = Backup::new(&src, &mut dst).map_err(|e| sql_err("start the backup", e))?;
        let (mut busy, mut restarts, mut last_remaining, mut pages) = (0u32, 0u32, i32::MAX, PAGES_PER_STEP);
        loop {
            match b.step(pages).map_err(|e| sql_err("copy the database", e))? {
                StepResult::Done => break,
                StepResult::More => {
                    busy = 0;
                    let p = b.progress();
                    if p.remaining > last_remaining {
                        // A writer changed the source and SQLite restarted the copy.
                        restarts += 1;
                        if restarts >= MAX_RESTARTS {
                            pages = -1; // copy the rest under one read lock
                        }
                    }
                    last_remaining = p.remaining;
                    progress((p.pagecount - p.remaining).max(0) as u64, p.pagecount.max(0) as u64);
                    std::thread::sleep(STEP_PAUSE);
                }
                StepResult::Busy | StepResult::Locked => {
                    busy += 1;
                    if busy > BUSY_RETRIES {
                        return Err(BackupError::new("busy", "The database stayed busy; the backup was not made. Try again in a moment."));
                    }
                    std::thread::sleep(Duration::from_millis(100 * u64::from(busy)));
                }
                // Future StepResult variants: treat like a busy step.
                #[allow(unreachable_patterns)]
                _ => std::thread::sleep(STEP_PAUSE),
            }
        }
        let p = b.progress();
        progress(p.pagecount.max(0) as u64, p.pagecount.max(0) as u64);
    }
    if !integrity_ok(&dst) {
        return Err(BackupError::new("corrupt_db", "The database snapshot failed its integrity check; the backup was not made."));
    }
    dst.execute_batch("VACUUM;").map_err(|e| sql_err("compact the snapshot", e))?;
    dst.close().map_err(|(_, e)| sql_err("close the snapshot", e))?;
    Ok(())
}

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0)
}

fn calibration_count(cal: Option<&Value>) -> i64 {
    match cal {
        Some(Value::Object(m)) => m.len() as i64,
        Some(Value::Array(a)) => a.len() as i64,
        _ => 0,
    }
}

fn midi_maps_json(conn: &Connection) -> Result<Value, BackupError> {
    let mut stmt = conn
        .prepare("SELECT asset_id, profile_id, map_json, updated_at FROM asset_midi_map ORDER BY asset_id")
        .map_err(|e| sql_err("read MIDI maps", e))?;
    let rows = stmt
        .query_map([], |r| {
            let map: String = r.get(2)?;
            Ok(json!({
                "assetId": r.get::<_, String>(0)?,
                "profileId": r.get::<_, Option<String>>(1)?,
                "map": serde_json::from_str::<Value>(&map).unwrap_or(Value::String(map)),
                "updatedAt": r.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| sql_err("read MIDI maps", e))?;
    let maps = rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| sql_err("read MIDI maps", e))?;
    Ok(json!({ "version": 1, "maps": maps }))
}

/// Refuses destinations that would overwrite the live database or its journal files.
fn check_dest(live: &Path, dest: &Path) -> Result<(), BackupError> {
    let has_ext = dest.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case(EXT));
    if !has_ext {
        return Err(BackupError::new("invalid_path", format!("Backups must be saved as .{EXT} files.")));
    }
    let canon = |p: &Path| p.parent().and_then(|d| fs::canonicalize(d).ok()).map(|d| d.join(p.file_name().unwrap_or_default()));
    let (d, l) = (canon(dest), canon(live));
    let same_dir_live = matches!((&d, &l), (Some(d), Some(l)) if d.parent() == l.parent()
        && d.file_name().and_then(|n| n.to_str()).zip(l.file_name().and_then(|n| n.to_str())).is_some_and(|(dn, ln)| dn.to_ascii_lowercase().starts_with(&ln.to_ascii_lowercase())));
    if same_dir_live {
        return Err(BackupError::new("invalid_path", "A backup cannot be written over the live database."));
    }
    if dest.is_dir() {
        return Err(BackupError::new("invalid_path", "Choose a file name, not a folder."));
    }
    Ok(())
}

/// Writes a verified backup of `live` to `dest`. The caller holds the connection
/// gate (read for normal backups, write during restore). Nothing at `dest` changes
/// unless the finished archive re-verifies.
pub fn create_backup(live: &Path, dest: &Path, kind: Kind, settings: &SettingsBlob, progress: &mut dyn FnMut(u64, u64)) -> Result<CreateResult, BackupError> {
    check_dest(live, dest)?;
    if !live.is_file() {
        return Err(BackupError::new("no_database", "There is no database to back up yet."));
    }
    let live_bytes = fs::metadata(live).map_err(|e| io_err("read the database", e))?.len();
    if live_bytes > MAX_DB_BYTES {
        return Err(BackupError::new("too_large", "The database is larger than 2 GiB and cannot be backed up to a single file."));
    }
    let snap = sidecar(dest, ".snapshot");
    let partial = sidecar(dest, ".partial");
    let mut temps = TempFiles(vec![snap.clone(), sidecar(&snap, "-journal"), partial.clone()]);
    for p in &temps.0 {
        remove_quietly(p);
    }
    snapshot_db(live, &snap, progress)?;

    let (counts_db, schema, midi) = {
        let c = Connection::open_with_flags(&snap, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| sql_err("read the snapshot", e))?;
        let counts = Counts {
            runs: count(&c, "SELECT COUNT(*) FROM session"),
            assets: count(&c, "SELECT COUNT(*) FROM asset WHERE is_deleted = 0"),
            profiles: 0,
            midi_maps: count(&c, "SELECT COUNT(*) FROM asset_midi_map"),
        };
        (counts, schema_version(&c)?, midi_maps_json(&c)?)
    };
    let counts = Counts { profiles: calibration_count(settings.calibration.as_ref()), ..counts_db };

    let mut blobs: Vec<(&str, Vec<u8>)> = Vec::new();
    if let Some(ui) = settings.ui.as_ref().filter(|v| !v.is_null()) {
        blobs.push((UI_ENTRY, serde_json::to_vec(ui).map_err(|e| BackupError::new("bad_settings", e.to_string()))?));
    }
    if let Some(cal) = settings.calibration.as_ref().filter(|v| !v.is_null()) {
        blobs.push((CAL_ENTRY, serde_json::to_vec(cal).map_err(|e| BackupError::new("bad_settings", e.to_string()))?));
    }
    blobs.push((MIDI_ENTRY, serde_json::to_vec_pretty(&midi).map_err(|e| BackupError::new("bad_settings", e.to_string()))?));
    if let Some((name, _)) = blobs.iter().find(|(_, b)| b.len() as u64 > MAX_JSON_BYTES) {
        return Err(BackupError::new("too_large", format!("{name} is larger than 5 MiB and cannot be backed up.")));
    }

    let (db_bytes, db_sha) = sha_file(&snap)?;
    let created_ms = now_ms();
    let mut files = vec![ManifestFile { name: DB_ENTRY.into(), bytes: db_bytes, sha256: db_sha }];
    files.extend(blobs.iter().map(|(n, b)| ManifestFile { name: (*n).into(), bytes: b.len() as u64, sha256: sha_hex(b) }));
    let manifest = Manifest {
        format: FORMAT.into(),
        format_version: FORMAT_VERSION,
        created_at: iso_utc(created_ms),
        kind: kind.as_str().into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        schema_version: schema,
        counts: counts.clone(),
        files,
    };

    write_archive(&partial, &manifest, &snap, &blobs)?;
    remove_quietly(&snap);
    verify_archive(&partial).map_err(|e| BackupError::new("verify_failed", format!("The new backup did not verify ({}); nothing was saved.", e.message)))?;
    fs::rename(&partial, dest).map_err(|e| io_err("save the backup file", e))?;
    temps.disarm();
    let bytes = fs::metadata(dest).map(|m| m.len()).unwrap_or(0);
    Ok(CreateResult { path: dest.to_string_lossy().into_owned(), bytes, created_at: manifest.created_at, kind, counts, schema_version: schema })
}

fn write_archive(partial: &Path, manifest: &Manifest, db_file: &Path, blobs: &[(&str, Vec<u8>)]) -> Result<(), BackupError> {
    let write_err = |e: zip::result::ZipError| match e {
        zip::result::ZipError::Io(io) => io_err("write the backup file", io),
        other => BackupError::new("io", format!("Could not write the backup file ({other}).")),
    };
    let f = File::create(partial).map_err(|e| io_err("write the backup file", e))?;
    let mut zw = ZipWriter::new(BufWriter::new(f));
    let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    // The manifest goes first so a reader can describe the backup from the first entry.
    zw.start_file(MANIFEST, opts).map_err(write_err)?;
    let mjson = serde_json::to_vec_pretty(manifest).map_err(|e| BackupError::new("io", e.to_string()))?;
    zw.write_all(&mjson).map_err(|e| io_err("write the backup file", e))?;
    zw.start_file(DB_ENTRY, opts.large_file(manifest.files[0].bytes >= u64::from(u32::MAX))).map_err(write_err)?;
    let mut db = File::open(db_file).map_err(|e| io_err("read the database snapshot", e))?;
    io::copy(&mut db, &mut zw).map_err(|e| io_err("write the backup file", e))?;
    for (name, bytes) in blobs {
        zw.start_file(*name, opts).map_err(write_err)?;
        zw.write_all(bytes).map_err(|e| io_err("write the backup file", e))?;
    }
    let buf = zw.finish().map_err(write_err)?;
    let file = buf.into_inner().map_err(|e| io_err("write the backup file", e.into_error()))?;
    file.sync_all().map_err(|e| io_err("write the backup file", e))?;
    Ok(())
}

/// `<dir>/<prefix><stamp>.deckchek-backup`, suffixed `-2`, `-3`… if taken.
fn unique_path(dir: &Path, prefix: &str, ms: i64) -> PathBuf {
    let stamp = file_stamp(ms);
    let mut p = dir.join(format!("{prefix}{stamp}.{EXT}"));
    let mut n = 2;
    while p.exists() {
        p = dir.join(format!("{prefix}{stamp}-{n}.{EXT}"));
        n += 1;
    }
    p
}

// ---------------------------------------------------------------- restore

fn read_settings_entry<R: Read + Seek>(archive: &mut ZipArchive<R>, m: &Manifest, name: &str, warnings: &mut Vec<String>) -> Result<Value, BackupError> {
    let Some(f) = m.files.iter().find(|f| f.name == name) else { return Ok(Value::Null) };
    let mut raw = Vec::new();
    let (bytes, sha) = read_entry(archive, name, MAX_JSON_BYTES, &mut raw)?;
    if bytes != f.bytes || !sha.eq_ignore_ascii_case(&f.sha256) {
        return Err(BackupError::new("checksum", format!("The backup is damaged: {name} does not match its checksum.")));
    }
    let v: Value = match serde_json::from_slice(&raw) {
        Ok(v) => v,
        Err(_) => {
            warnings.push(format!("{name} was not valid JSON and was skipped."));
            return Ok(Value::Null);
        }
    };
    let ok = match name {
        UI_ENTRY => v.is_object(),
        CAL_ENTRY => v.as_object().is_some_and(|m| m.values().all(Value::is_string)),
        _ => true,
    };
    if ok {
        Ok(v)
    } else {
        warnings.push(format!("{name} had an unexpected shape and was skipped."));
        Ok(Value::Null)
    }
}

/// Fixed temp names next to the live DB (same volume, so renames are atomic). Startup
/// recovery knows them; restores are serialised by [`OP_LOCK`].
fn restore_tmp(live: &Path) -> PathBuf {
    sidecar(live, ".restore-tmp")
}
fn restore_bak(live: &Path) -> PathBuf {
    sidecar(live, ".restore-bak")
}
const SIDECARS: [&str; 4] = ["", "-journal", "-wal", "-shm"];

/// Restores `path` over the live database. Order: verify archive → extract DB to a
/// temp file (checksum re-verified while extracting) → integrity check → migrate the
/// temp copy → take the gate write guard → safety backup of the live DB → rename swap
/// with rollback. Any failure before the swap leaves the live files untouched; a failure
/// during or after the swap renames the originals back.
pub fn restore_backup(ctx: &Ctx, path: &Path, confirm: bool, current: &SettingsBlob, fail: Option<FailPoint>) -> Result<RestoreResult, BackupError> {
    if !confirm {
        return Err(BackupError::new("not_confirmed", "Restore needs confirmation: it replaces your current data."));
    }
    let manifest = verify_archive(path)?;
    let live = ctx.live_db.as_path();
    let tmp = restore_tmp(live);
    let mut temps = TempFiles(SIDECARS.iter().map(|s| sidecar(&tmp, s)).collect());
    for p in &temps.0 {
        remove_quietly(p);
    }

    let mut warnings = Vec::new();
    let (ui, cal) = {
        let mut archive = open_archive(path)?;
        let entry = manifest.files.iter().find(|f| f.name == DB_ENTRY).expect("verified manifest lists the DB");
        let mut out = BufWriter::new(File::create(&tmp).map_err(|e| io_err("extract the backup", e))?);
        let (bytes, sha) = read_entry(&mut archive, DB_ENTRY, MAX_DB_BYTES, &mut out)?;
        let f = out.into_inner().map_err(|e| io_err("extract the backup", e.into_error()))?;
        f.sync_all().map_err(|e| io_err("extract the backup", e))?;
        drop(f);
        if bytes != entry.bytes || !sha.eq_ignore_ascii_case(&entry.sha256) {
            return Err(BackupError::new("checksum", "The backup changed or is damaged: the database does not match its checksum."));
        }
        let ui = read_settings_entry(&mut archive, &manifest, UI_ENTRY, &mut warnings)?;
        let cal = read_settings_entry(&mut archive, &manifest, CAL_ENTRY, &mut warnings)?;
        (ui, cal)
    };

    let current_v = current_schema_version();
    let from = {
        let conn = Connection::open_with_flags(&tmp, OpenFlags::SQLITE_OPEN_READ_WRITE)
            .map_err(|_| BackupError::new("corrupt_db", "The backup's database cannot be opened."))?;
        if !integrity_ok(&conn) {
            return Err(BackupError::new("corrupt_db", "The backup's database is damaged (integrity check failed). Your current data was not changed."));
        }
        let from = schema_version(&conn)?;
        if from > current_v {
            return Err(BackupError::new("too_new", too_new_message(from)));
        }
        if fail == Some(FailPoint::Migration) {
            return Err(BackupError::new("migration_failed", "Upgrading the backup failed (injected). Your current data was not changed."));
        }
        db::apply_migrations(&conn).map_err(|e| BackupError::new("migration_failed", format!("Upgrading the backup failed: {e}. Your current data was not changed.")))?;
        if !integrity_ok(&conn) || schema_version(&conn)? != current_v {
            return Err(BackupError::new("migration_failed", "The upgraded backup failed its checks. Your current data was not changed."));
        }
        conn.close().map_err(|(_, e)| sql_err("close the restored copy", e))?;
        from
    };

    // From here no other connection may be open on the live DB.
    let _write = ctx.gate.write().unwrap_or_else(PoisonError::into_inner);
    let safety = if live.is_file() {
        fs::create_dir_all(&ctx.backups_dir).map_err(|e| io_err("create the backups folder", e))?;
        let dest = unique_path(&ctx.backups_dir, "auto-pre-restore-", now_ms());
        let r = create_backup(live, &dest, Kind::PreRestore, current, &mut |_, _| {})
            .map_err(|e| BackupError::new(e.code, format!("The safety backup failed, so nothing was restored: {}", e.message)))?;
        Some(r.path)
    } else {
        None
    };
    if fail == Some(FailPoint::AfterSafetyBackup) {
        return Err(BackupError::new("io", "Restore failed after the safety backup (injected). Your current data was not changed."));
    }

    swap_in(live, &tmp, fail)?;
    temps.disarm();
    Ok(RestoreResult {
        restored_from: path.to_string_lossy().into_owned(),
        upgraded_from: (from < current_v).then_some(from),
        schema_version: current_v,
        safety_backup: safety,
        settings: ui,
        calibration_profiles: cal,
        warnings,
    })
}

/// live (+ journal/wal/shm) → `.restore-bak`, tmp → live, verify; any error rolls back.
fn swap_in(live: &Path, tmp: &Path, fail: Option<FailPoint>) -> Result<(), BackupError> {
    let bak = restore_bak(live);
    for s in SIDECARS {
        remove_quietly(&sidecar(&bak, s));
    }
    let mut moved: Vec<&str> = Vec::new();
    let rollback = |moved: &[&str], placed: bool| {
        if placed {
            remove_quietly(live);
        }
        for s in moved {
            let _ = fs::rename(sidecar(&bak, s), sidecar(live, s));
        }
    };
    for s in SIDECARS {
        let from = sidecar(live, s);
        if from.exists() {
            if let Err(e) = fs::rename(&from, sidecar(&bak, s)) {
                rollback(&moved, false);
                return Err(io_err("move the current database aside", e));
            }
            moved.push(s);
        }
    }
    if fail == Some(FailPoint::MidSwap) {
        rollback(&moved, false);
        return Err(BackupError::new("io", "Restore failed while swapping files (injected). Your current data was restored."));
    }
    if let Err(e) = fs::rename(tmp, live) {
        rollback(&moved, false);
        return Err(io_err("put the restored database in place", e));
    }
    let verified = Connection::open_with_flags(live, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map(|c| c.query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0)).map(|s| s == "ok").unwrap_or(false))
        .unwrap_or(false);
    if !verified || fail == Some(FailPoint::AfterSwap) {
        rollback(&moved, true);
        return Err(BackupError::new("io", "The restored database could not be opened in place; your current data was put back."));
    }
    for s in SIDECARS {
        remove_quietly(&sidecar(&bak, s));
    }
    Ok(())
}

/// Startup recovery for a restore interrupted by a crash or power loss, and removal of
/// stale temp files. Returns what it did (for the diagnostics log).
pub fn recover_on_startup(ctx: &Ctx) -> Vec<String> {
    let mut notes = Vec::new();
    let live = ctx.live_db.as_path();
    let bak = restore_bak(live);
    if bak.exists() {
        if !live.exists() {
            // The swap stopped between its two renames: put the original back.
            for s in SIDECARS {
                let b = sidecar(&bak, s);
                if b.exists() && fs::rename(&b, sidecar(live, s)).is_ok() {
                    notes.push(format!("recovered database{s} from an interrupted restore"));
                }
            }
        } else {
            // The swap finished; the old copy is also in the pre-restore safety backup.
            for s in SIDECARS {
                remove_quietly(&sidecar(&bak, s));
            }
            notes.push("removed the previous database left by a finished restore".into());
        }
    }
    let tmp = restore_tmp(live);
    for s in SIDECARS {
        let p = sidecar(&tmp, s);
        if p.exists() {
            remove_quietly(&p);
            notes.push("removed an unfinished restore copy".into());
        }
    }
    if let Ok(rd) = fs::read_dir(&ctx.backups_dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let stale = [".partial", ".snapshot", ".snapshot-journal"].iter().any(|s| name.ends_with(&format!(".{EXT}{s}")));
            if stale && e.path().is_file() {
                remove_quietly(&e.path());
                notes.push(format!("removed unfinished backup {name}"));
            }
        }
    }
    notes
}

// ---------------------------------------------------------------- list, retention, log

fn read_manifest_quick(path: &Path) -> Option<Manifest> {
    let mut archive = open_archive(path).ok()?;
    let mut raw = Vec::new();
    read_entry(&mut archive, MANIFEST, MAX_JSON_BYTES, &mut raw).ok()?;
    serde_json::from_slice(&raw).ok()
}

fn kind_from_name(name: &str) -> &'static str {
    if name.starts_with("auto-pre-restore-") {
        "pre_restore"
    } else if name.starts_with("auto-") {
        "auto"
    } else {
        "manual"
    }
}

fn entry_for(path: &Path) -> Option<BackupEntry> {
    let meta = fs::metadata(path).ok().filter(|m| m.is_file())?;
    let name = path.file_name()?.to_string_lossy().into_owned();
    let manifest = read_manifest_quick(path);
    let mtime = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0);
    Some(BackupEntry {
        kind: manifest.as_ref().map(|m| m.kind.clone()).unwrap_or_else(|| kind_from_name(&name).into()),
        created_at: manifest.map(|m| m.created_at).unwrap_or_else(|| iso_utc(mtime)),
        name,
        path: path.to_string_lossy().into_owned(),
        bytes: meta.len(),
    })
}

/// Backups in the backups folder plus logged backups saved elsewhere that still exist,
/// newest first.
pub fn list_backups(ctx: &Ctx, conn: Option<&Connection>) -> Vec<BackupEntry> {
    let mut out: Vec<BackupEntry> = Vec::new();
    if let Ok(rd) = fs::read_dir(&ctx.backups_dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()).is_some_and(|x| x.eq_ignore_ascii_case(EXT)) {
                out.extend(entry_for(&p));
            }
        }
    }
    if let Some(conn) = conn {
        for path in logged_paths(conn) {
            let p = PathBuf::from(&path);
            if !out.iter().any(|e| Path::new(&e.path) == p) {
                out.extend(entry_for(&p));
            }
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| b.name.cmp(&a.name)));
    out
}

/// Keeps the newest `keep` automatic backups (scheduled and pre-restore) in the backups
/// folder and deletes older ones. A file is deleted only when its name starts with
/// `auto-` **and** its manifest says it is automatic, so manual backups never go.
pub fn apply_retention(dir: &Path, keep: u32) -> Vec<PathBuf> {
    let keep = keep.clamp(1, MAX_KEEP) as usize;
    let mut autos: Vec<(String, PathBuf)> = Vec::new();
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if !name.starts_with("auto-") || !name.ends_with(&format!(".{EXT}")) || !p.is_file() {
                continue;
            }
            if let Some(m) = read_manifest_quick(&p) {
                if m.kind == "auto" || m.kind == "pre_restore" {
                    autos.push((m.created_at, p));
                }
            }
        }
    }
    autos.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));
    let mut deleted = Vec::new();
    for (_, p) in autos.into_iter().skip(keep) {
        if fs::remove_file(&p).is_ok() {
            deleted.push(p);
        }
    }
    deleted
}

pub fn log_backup(conn: &Connection, r: &CreateResult, ok: bool) -> Result<(), BackupError> {
    conn.execute(
        "INSERT INTO backup_log (id, kind, path, bytes, schema_version, created_at, ok) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![db::new_id(), r.kind.as_str(), r.path, r.bytes as i64, r.schema_version, r.created_at, i64::from(ok)],
    )
    .map_err(|e| sql_err("record the backup", e))?;
    Ok(())
}

fn logged_paths(conn: &Connection) -> Vec<String> {
    let Ok(mut stmt) = conn.prepare("SELECT DISTINCT path FROM backup_log WHERE ok = 1 ORDER BY created_at DESC LIMIT 200") else { return vec![] };
    stmt.query_map([], |r| r.get(0)).map(|rows| rows.flatten().collect()).unwrap_or_default()
}

// ---------------------------------------------------------------- schedule

pub fn get_schedule(conn: &Connection) -> Result<ScheduleSettings, BackupError> {
    let entry = crate::app_state::get(conn, SETTINGS_KEY).map_err(|e| BackupError::new("database", e))?;
    Ok(entry.and_then(|e| serde_json::from_value::<ScheduleSettings>(e.value).ok()).unwrap_or_default())
}

/// Stores mode/keep (and last-run fields when `last` is given), preserving any other
/// keys the UI keeps under `app_state['backup']` (e.g. reminder choices).
pub fn set_schedule(conn: &Connection, input: Option<&ScheduleInput>, last: Option<i64>) -> Result<ScheduleSettings, BackupError> {
    if let Some(i) = input {
        if i.keep < 1 || i.keep > MAX_KEEP {
            return Err(BackupError::new("invalid_settings", format!("Keep must be between 1 and {MAX_KEEP}.")));
        }
    }
    let mut obj = crate::app_state::get(conn, SETTINGS_KEY)
        .map_err(|e| BackupError::new("database", e))?
        .and_then(|e| e.value.as_object().cloned())
        .unwrap_or_default();
    let cur = get_schedule(conn)?;
    let mode = input.map(|i| i.mode).unwrap_or(cur.mode);
    let keep = input.map(|i| i.keep).unwrap_or(cur.keep);
    obj.insert("mode".into(), serde_json::to_value(mode).unwrap_or(Value::Null));
    obj.insert("keep".into(), json!(keep));
    if let Some(ms) = last {
        obj.insert("lastAutoAt".into(), json!(iso_utc(ms)));
        obj.insert("lastAutoMs".into(), json!(ms));
    }
    crate::app_state::set(conn, SETTINGS_KEY, &Value::Object(obj)).map_err(|e| BackupError::new("database", e))?;
    get_schedule(conn)
}

/// Daily: 24 h since the last automatic backup; weekly: 7 days. Never run before → due.
pub fn is_due(mode: Mode, last_ms: Option<i64>, now: i64) -> bool {
    let interval = match mode {
        Mode::Daily => DAY_MS,
        Mode::Weekly => 7 * DAY_MS,
        Mode::Off | Mode::OnExit => return false,
    };
    last_ms.is_none_or(|last| now - last >= interval || now < last)
}

fn read_settings_cache(dir: &Path) -> SettingsBlob {
    let p = dir.join(SETTINGS_CACHE);
    match fs::metadata(&p) {
        Ok(m) if m.len() <= 2 * MAX_JSON_BYTES => fs::read(&p).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default(),
        _ => SettingsBlob::default(),
    }
}

fn write_settings_cache(dir: &Path, s: &SettingsBlob) {
    if let Ok(bytes) = serde_json::to_vec(s) {
        let tmp = dir.join(format!("{SETTINGS_CACHE}.tmp"));
        if fs::write(&tmp, bytes).is_ok() {
            let _ = fs::rename(&tmp, dir.join(SETTINGS_CACHE));
        }
    }
}

// ---------------------------------------------------------------- workspace import

fn str_field<'a>(v: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|k| v.get(*k).and_then(Value::as_str)).map(str::trim).filter(|s| !s.is_empty())
}

/// Imports a browser-mode workspace (`version: 1`) shaped by `workspaceToImportPayload`.
/// Runs whose id already exists are skipped; each run is written atomically.
pub fn import_workspace(conn: &mut Connection, payload: &Value) -> Result<ImportResult, BackupError> {
    if payload.get("version").and_then(Value::as_i64) != Some(1) {
        return Err(BackupError::new("bad_workspace", "Unsupported or invalid DeckChek workspace file."));
    }
    let runs = payload.get("runs").and_then(Value::as_array).ok_or_else(|| BackupError::new("bad_workspace", "Unsupported or invalid DeckChek workspace file."))?;
    let equipment = payload.get("equipment").and_then(Value::as_array).cloned().unwrap_or_default();
    if runs.len() > MAX_IMPORT_RUNS || equipment.len() > MAX_IMPORT_RUNS {
        return Err(BackupError::new("too_large", "The workspace holds too many items to import."));
    }
    let mut res = ImportResult { runs_imported: 0, runs_skipped: 0, runs_invalid: 0, equipment_imported: 0 };
    let mut seen = std::collections::HashSet::new();
    for r in runs {
        let Ok(run) = serde_json::from_value::<PersistRun>(r.clone()) else {
            res.runs_invalid += 1;
            continue;
        };
        if run.id.trim().is_empty() {
            res.runs_invalid += 1;
            continue;
        }
        let exists: bool = conn
            .query_row("SELECT 1 FROM session WHERE id = ?1", [&run.id], |_| Ok(()))
            .optional()
            .map_err(|e| sql_err("check existing runs", e))?
            .is_some();
        if exists || !seen.insert(run.id.clone()) {
            res.runs_skipped += 1;
            continue;
        }
        match db::persist_run(conn, &run) {
            Ok(()) => res.runs_imported += 1,
            Err(_) => res.runs_invalid += 1,
        }
    }
    let now = db::now_iso(conn).map_err(|e| BackupError::new("database", e))?;
    for e in &equipment {
        let (Some(id), Some(name)) = (str_field(e, &["id"]), str_field(e, &["nickname", "name", "label", "model"])) else { continue };
        let n = conn
            .execute(
                "INSERT OR IGNORE INTO asset (id, product_id, nickname, serial_number, notes, is_deleted, created_at, updated_at) VALUES (?1, NULL, ?2, ?3, ?4, 0, ?5, ?5)",
                params![id, name, str_field(e, &["serialNumber", "serial"]), str_field(e, &["notes"]), now],
            )
            .map_err(|e| sql_err("import equipment", e))?;
        res.equipment_imported += n as u32;
    }
    Ok(res)
}

// ---------------------------------------------------------------- app wiring

/// Serialises backup operations (FS-08 §4 `BackupState`).
static OP_LOCK: Mutex<()> = Mutex::new(());

fn app_ctx(app: &AppHandle) -> Result<Ctx, BackupError> {
    let live = db::database_path(app).map_err(|e| BackupError::new("io", e))?;
    let dir = app.path().app_data_dir().map_err(|e| BackupError::new("io", e.to_string()))?.join("backups");
    fs::create_dir_all(&dir).map_err(|e| io_err("create the backups folder", e))?;
    Ok(Ctx { live_db: live, backups_dir: dir, gate: db::gate() })
}

/// Opens (creating and migrating if needed) the live DB through the gate.
fn open_live(ctx: &Ctx) -> Result<db::DbConn, BackupError> {
    db::open_database(&ctx.live_db).map_err(|e| BackupError::new("database", e))
}

/// Backup with gate read guard, then log + retention. Used by commands and the scheduler.
fn run_backup(ctx: &Ctx, dest: &Path, kind: Kind, settings: &SettingsBlob, progress: &mut dyn FnMut(u64, u64)) -> Result<CreateResult, BackupError> {
    drop(open_live(ctx)?); // make sure the DB exists and is migrated
    let result = {
        let _read = ctx.gate.read().unwrap_or_else(PoisonError::into_inner);
        create_backup(&ctx.live_db, dest, kind, settings, progress)?
    };
    userfiles::record_written(dest);
    if let Ok(conn) = open_live(ctx) {
        let _ = log_backup(&conn, &result, true);
        if kind == Kind::Auto {
            let last = now_ms();
            let keep = get_schedule(&conn).map(|s| s.keep).unwrap_or(DEFAULT_KEEP);
            let _ = set_schedule(&conn, None, Some(last));
            apply_retention(&ctx.backups_dir, keep);
        }
    }
    Ok(result)
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, BackupError> + Send + 'static) -> Result<T, BackupError> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| BackupError::new("io", format!("background task failed: {e}")))?
}

fn validated_open_path(path: &str) -> Result<PathBuf, BackupError> {
    let p = userfiles::validate_save_path(path, &[EXT])?;
    if !p.is_file() {
        return Err(BackupError::new("not_found", "The backup file was not found."));
    }
    Ok(p)
}

#[tauri::command]
pub async fn backup_create(app: AppHandle, dest_path: Option<String>, kind: Option<String>, settings: Option<SettingsBlob>) -> Result<CreateResult, BackupError> {
    blocking(move || {
        let _op = OP_LOCK.lock().unwrap_or_else(PoisonError::into_inner);
        let ctx = app_ctx(&app)?;
        let kind = match kind.as_deref().unwrap_or("manual") {
            "manual" => Kind::Manual,
            "auto" => Kind::Auto,
            other => return Err(BackupError::new("invalid_kind", format!("Unknown backup kind '{other}'."))),
        };
        let dest = match dest_path {
            Some(p) => userfiles::validate_save_path(&p, &[EXT])?,
            None => unique_path(&ctx.backups_dir, if kind == Kind::Auto { "auto-" } else { "DeckChek-backup-" }, now_ms()),
        };
        let settings = settings.unwrap_or_default();
        if settings.ui.is_some() || settings.calibration.is_some() {
            write_settings_cache(&ctx.backups_dir, &settings);
        }
        let emitter = app.clone();
        let mut progress = move |done: u64, total: u64| {
            let _ = emitter.emit("backup://progress", json!({ "pages_done": done, "pages_total": total }));
        };
        run_backup(&ctx, &dest, kind, &settings, &mut progress)
    })
    .await
}

#[tauri::command]
pub async fn backup_inspect(path: String) -> Result<InspectResult, BackupError> {
    blocking(move || {
        let p = validated_open_path(&path)?;
        Ok(inspect_file(&p))
    })
    .await
}

#[tauri::command]
pub async fn backup_restore(app: AppHandle, path: String, confirm: bool, settings: Option<SettingsBlob>) -> Result<RestoreResult, BackupError> {
    blocking(move || {
        let _op = OP_LOCK.lock().unwrap_or_else(PoisonError::into_inner);
        let ctx = app_ctx(&app)?;
        let p = validated_open_path(&path)?;
        let current = settings.unwrap_or_else(|| read_settings_cache(&ctx.backups_dir));
        let result = restore_backup(&ctx, &p, confirm, &current, None)?;
        if let Ok(conn) = open_live(&ctx) {
            if let Some(safety) = &result.safety_backup {
                if let Some(entry) = entry_for(Path::new(safety)) {
                    let r = CreateResult { path: entry.path, bytes: entry.bytes, created_at: entry.created_at, kind: Kind::PreRestore, counts: Counts::default(), schema_version: result.schema_version };
                    let _ = log_backup(&conn, &r, true);
                }
            }
            let keep = get_schedule(&conn).map(|s| s.keep).unwrap_or(DEFAULT_KEEP);
            apply_retention(&ctx.backups_dir, keep);
        }
        Ok(result)
    })
    .await
}

#[tauri::command]
pub async fn backup_list(app: AppHandle) -> Result<Vec<BackupEntry>, BackupError> {
    blocking(move || {
        let ctx = app_ctx(&app)?;
        let conn = open_live(&ctx).ok();
        Ok(list_backups(&ctx, conn.as_deref()))
    })
    .await
}

#[tauri::command]
pub fn backup_settings_get(app: AppHandle) -> Result<ScheduleSettings, BackupError> {
    let ctx = app_ctx(&app)?;
    get_schedule(&*open_live(&ctx)?)
}

#[tauri::command]
pub fn backup_settings_set(app: AppHandle, settings: ScheduleInput) -> Result<ScheduleSettings, BackupError> {
    let ctx = app_ctx(&app)?;
    set_schedule(&*open_live(&ctx)?, Some(&settings), None)
}

#[tauri::command]
pub async fn backup_import_workspace(app: AppHandle, json: Value) -> Result<ImportResult, BackupError> {
    blocking(move || {
        let ctx = app_ctx(&app)?;
        let mut conn = open_live(&ctx)?;
        import_workspace(&mut conn, &json)
    })
    .await
}

/// Runs a scheduled (daily/weekly) backup when due. Settings come from the cache the
/// webview last handed over with a backup, since localStorage is not readable here.
pub fn run_scheduled_if_due(ctx: &Ctx) -> Result<Option<CreateResult>, BackupError> {
    let _op = OP_LOCK.lock().unwrap_or_else(PoisonError::into_inner);
    let s = get_schedule(&*open_live(ctx)?)?;
    if !is_due(s.mode, s.last_auto_ms, now_ms()) {
        return Ok(None);
    }
    let dest = unique_path(&ctx.backups_dir, "auto-", now_ms());
    run_backup(ctx, &dest, Kind::Auto, &read_settings_cache(&ctx.backups_dir), &mut |_, _| {}).map(Some)
}

fn run_on_exit(ctx: Ctx) {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _op = OP_LOCK.lock().unwrap_or_else(PoisonError::into_inner);
        let due = open_live(&ctx).ok().and_then(|c| get_schedule(&c).ok()).is_some_and(|s| s.mode == Mode::OnExit);
        if due {
            let dest = unique_path(&ctx.backups_dir, "auto-", now_ms());
            let _ = run_backup(&ctx, &dest, Kind::Auto, &read_settings_cache(&ctx.backups_dir), &mut |_, _| {});
        }
        let _ = tx.send(());
    });
    // FS-08 §4: on-exit backup gets at most 5 s; an unfinished one leaves only a
    // `.partial` that startup recovery removes.
    let _ = rx.recv_timeout(ON_EXIT_CAP);
}

/// FS-08 setup: crash recovery, background scheduler, on-exit hook on the main window.
pub fn setup(app: &AppHandle) {
    let Ok(ctx) = app_ctx(app) else { return };
    recover_on_startup(&ctx);
    std::thread::spawn(move || {
        let _ = run_scheduled_if_due(&ctx);
    });
    if let Some(win) = app.get_webview_window("main") {
        let handle = app.clone();
        win.on_window_event(move |e| {
            if let tauri::WindowEvent::CloseRequested { .. } = e {
                if let Ok(ctx) = app_ctx(&handle) {
                    run_on_exit(ctx);
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{apply_migrations, persist_run, PersistMeasurement, PersistRun};

    // ---------- fixtures ----------

    struct Env {
        root: PathBuf,
        ctx: Ctx,
    }

    impl Env {
        fn new(tag: &str) -> Self {
            // Spaces and non-ASCII in the folder names exercise path handling on every OS.
            let root = std::env::temp_dir().join(format!("deckchek backup ü {tag}-{}-{}", std::process::id(), db::new_id()));
            fs::create_dir_all(root.join("app data")).unwrap();
            fs::create_dir_all(root.join("app data").join("backups")).unwrap();
            fs::create_dir_all(root.join("out")).unwrap();
            let gate: &'static RwLock<()> = Box::leak(Box::new(RwLock::new(())));
            let ctx = Ctx { live_db: root.join("app data").join("deckchek.sqlite3"), backups_dir: root.join("app data").join("backups"), gate };
            Env { root, ctx }
        }
        fn out(&self, name: &str) -> PathBuf {
            self.root.join("out").join(name)
        }
        fn live(&self) -> &Path {
            &self.ctx.live_db
        }
    }

    impl Drop for Env {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn run(id: &str) -> PersistRun {
        PersistRun {
            id: id.into(),
            test: "Stereo balance".into(),
            created_at: "2026-10-10T08:00:00Z".into(),
            score: Some(80.0),
            measurements: vec![PersistMeasurement { metric_id: "balance".into(), label: None, value: 0.4, unit: "dB".into(), origin: None, confidence: Some(0.9), uncertainty: None, quality_flags: None }],
            ..Default::default()
        }
    }

    /// A current-schema DB at `path` with `n` runs, one asset and a MIDI map.
    fn make_db(path: &Path, prefix: &str, n: usize) {
        let mut c = Connection::open(path).unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        for i in 0..n {
            persist_run(&mut c, &run(&format!("{prefix}-{i}"))).unwrap();
        }
        c.execute("INSERT INTO asset (id, nickname, created_at, updated_at) VALUES (?1, 'Deck A', 'x', 'x')", [format!("{prefix}-asset")]).unwrap();
        c.execute("INSERT INTO asset_midi_map (asset_id, map_json, updated_at) VALUES (?1, '{\"cc\":1}', 'x')", [format!("{prefix}-asset")]).unwrap();
    }

    fn fixture_sql() -> String {
        fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/db/v0.04.sql")).unwrap()
    }

    fn rows(path: &Path, table: &str) -> i64 {
        let c = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        c.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)).unwrap()
    }

    fn settings() -> SettingsBlob {
        SettingsBlob {
            ui: Some(json!({ "theme": "dark", "sampleRate": 48000 })),
            calibration: Some(json!({ "audio 8 dj|48000": "{\"sampleRate\":48000}", "default|44100": "{}" })),
        }
    }

    fn backup_of(env: &Env, src: &Path, name: &str) -> PathBuf {
        let dest = env.out(name);
        create_backup(src, &dest, Kind::Manual, &settings(), &mut |_, _| {}).unwrap();
        dest
    }

    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let mut zw = ZipWriter::new(File::create(path).unwrap());
        let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for (name, bytes) in entries {
            zw.start_file(*name, opts).unwrap();
            zw.write_all(bytes).unwrap();
        }
        zw.finish().unwrap();
    }

    fn manifest_bytes(schema: i64, format_version: i64, files: &[(&str, &[u8])]) -> Vec<u8> {
        let files: Vec<Value> = files.iter().map(|(n, b)| json!({ "name": n, "bytes": b.len(), "sha256": sha_hex(b) })).collect();
        serde_json::to_vec(&json!({
            "format": "deckchek-backup", "formatVersion": format_version, "createdAt": "2026-10-10T08:00:00.000Z", "kind": "manual",
            "appVersion": "0.0.4", "schemaVersion": schema, "counts": { "runs": 1 }, "files": files,
        }))
        .unwrap()
    }

    /// Writes an archive with a correct manifest for `files` (so only the guard under test can fail).
    fn crafted(path: &Path, schema: i64, files: &[(&str, &[u8])]) {
        let m = manifest_bytes(schema, 1, files);
        let mut all: Vec<(&str, &[u8])> = vec![(MANIFEST, &m)];
        all.extend_from_slice(files);
        write_zip(path, &all);
    }

    fn extract_db(archive: &Path, to: &Path) {
        let mut a = ZipArchive::new(File::open(archive).unwrap()).unwrap();
        let mut f = a.by_name(DB_ENTRY).unwrap();
        let mut out = File::create(to).unwrap();
        io::copy(&mut f, &mut out).unwrap();
    }

    fn no_restore_leftovers(env: &Env) {
        for s in SIDECARS {
            assert!(!sidecar(&restore_tmp(env.live()), s).exists(), "restore-tmp{s} left behind");
            assert!(!sidecar(&restore_bak(env.live()), s).exists(), "restore-bak{s} left behind");
        }
    }

    // ---------- AC-1: backup writes a verified archive ----------

    #[test]
    fn backup_writes_verified_archive_with_manifest_first() {
        let env = Env::new("create");
        make_db(env.live(), "r", 3);
        let mut calls = Vec::new();
        let dest = env.out("DeckChek-backup-20261010-0800.deckchek-backup");
        let r = create_backup(env.live(), &dest, Kind::Manual, &settings(), &mut |d, t| calls.push((d, t))).unwrap();
        assert_eq!(r.counts, Counts { runs: 3, assets: 1, profiles: 2, midi_maps: 1 });
        assert_eq!(r.schema_version, current_schema_version());
        assert_eq!(r.bytes, fs::metadata(&dest).unwrap().len());
        assert!(calls.last().is_some_and(|(d, t)| d == t && *t > 0), "progress ends at 100%");

        let mut a = ZipArchive::new(File::open(&dest).unwrap()).unwrap();
        assert_eq!(a.by_index(0).unwrap().name(), MANIFEST, "manifest is the first entry");
        let names: Vec<String> = a.file_names().map(String::from).collect();
        for n in [MANIFEST, DB_ENTRY, UI_ENTRY, CAL_ENTRY, MIDI_ENTRY] {
            assert!(names.iter().any(|x| x == n), "{n}");
        }
        let insp = inspect_file(&dest);
        assert!(insp.valid, "{:?}", insp.errors);
        let m = insp.manifest.unwrap();
        assert_eq!((m.format.as_str(), m.format_version, m.kind.as_str()), ("deckchek-backup", 1, "manual"));
        assert_eq!(m.app_version, env!("CARGO_PKG_VERSION"));
        assert!(!insp.needs_migration && !insp.too_new);

        // sha256 in the manifest matches the stored DB, which is a healthy SQLite file
        let db = env.out("x.sqlite3");
        extract_db(&dest, &db);
        let (bytes, sha) = sha_file(&db).unwrap();
        let entry = m.files.iter().find(|f| f.name == DB_ENTRY).unwrap();
        assert_eq!((bytes, sha.as_str()), (entry.bytes, entry.sha256.as_str()));
        assert!(integrity_ok(&Connection::open(&db).unwrap()));
        assert_eq!(rows(&db, "session"), 3);

        // the MIDI maps are exported for readability
        let mut raw = Vec::new();
        a.by_name(MIDI_ENTRY).unwrap().read_to_end(&mut raw).unwrap();
        let midi: Value = serde_json::from_slice(&raw).unwrap();
        assert_eq!(midi["maps"][0]["map"]["cc"], 1);

        // no temp files next to the destination
        let left: Vec<_> = fs::read_dir(env.root.join("out")).unwrap().flatten().map(|e| e.file_name()).collect();
        assert_eq!(left.len(), 2, "only the backup and the extracted copy: {left:?}");
    }

    #[test]
    fn backup_without_settings_lists_only_db_and_midi_maps() {
        let env = Env::new("nosettings");
        make_db(env.live(), "r", 1);
        let dest = env.out("plain.deckchek-backup");
        let r = create_backup(env.live(), &dest, Kind::Auto, &SettingsBlob::default(), &mut |_, _| {}).unwrap();
        assert_eq!(r.counts.profiles, 0);
        let m = inspect_file(&dest).manifest.unwrap();
        let names: Vec<&str> = m.files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, vec![DB_ENTRY, MIDI_ENTRY]);
        assert_eq!(m.kind, "auto");
    }

    #[test]
    fn destination_rules() {
        let env = Env::new("dest");
        make_db(env.live(), "r", 1);
        let noop = &mut |_: u64, _: u64| {};
        let s = SettingsBlob::default();
        for bad in [env.out("x.zip"), env.out("x"), env.live().to_path_buf(), env.ctx.live_db.with_file_name("deckchek.sqlite3.deckchek-backup")] {
            let e = create_backup(env.live(), &bad, Kind::Manual, &s, noop).unwrap_err();
            assert_eq!(e.code, "invalid_path", "{bad:?}");
        }
        fs::create_dir(env.out("dir.deckchek-backup")).unwrap();
        assert_eq!(create_backup(env.live(), &env.out("dir.deckchek-backup"), Kind::Manual, &s, noop).unwrap_err().code, "invalid_path");
        let missing = Env::new("dest-missing");
        assert_eq!(create_backup(missing.live(), &missing.out("a.deckchek-backup"), Kind::Manual, &s, noop).unwrap_err().code, "no_database");
        // the userfiles rules apply to command paths
        assert!(validated_open_path("relative.deckchek-backup").is_err());
        assert!(validated_open_path(&env.out("..").join("x.deckchek-backup").to_string_lossy()).is_err());
        assert_eq!(validated_open_path(&env.out("nope.deckchek-backup").to_string_lossy()).unwrap_err().code, "not_found");
    }

    // ---------- AC-2: consistent snapshot while another connection writes ----------

    #[test]
    fn backup_is_transactionally_consistent_during_concurrent_writes() {
        let env = Env::new("concurrent");
        make_db(env.live(), "seed", 20);
        {
            // ~3 MB of filler so the copy takes many 100-page steps
            let c = Connection::open(env.live()).unwrap();
            c.execute_batch("CREATE TABLE filler (b BLOB);").unwrap();
            for _ in 0..30 {
                c.execute("INSERT INTO filler (b) VALUES (randomblob(100000))", []).unwrap();
            }
        }
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let writer = {
            let (live, stop) = (env.live().to_path_buf(), stop.clone());
            std::thread::spawn(move || {
                let mut c = Connection::open(&live).unwrap();
                c.busy_timeout(Duration::from_secs(10)).unwrap();
                let mut n = 0;
                while !stop.load(std::sync::atomic::Ordering::Relaxed) {
                    persist_run(&mut c, &run(&format!("w-{n}"))).unwrap();
                    n += 1;
                }
                n
            })
        };
        std::thread::sleep(Duration::from_millis(30));
        let dest = env.out("busy.deckchek-backup");
        let r = create_backup(env.live(), &dest, Kind::Manual, &SettingsBlob::default(), &mut |_, _| {}).unwrap();
        stop.store(true, std::sync::atomic::Ordering::Relaxed);
        let written = writer.join().unwrap();
        assert!(written > 0, "writer made progress during the backup");
        assert!(inspect_file(&dest).valid);
        let db = env.out("snap.sqlite3");
        extract_db(&dest, &db);
        let c = Connection::open(&db).unwrap();
        assert!(integrity_ok(&c));
        // each run commits its session and measurement together: a torn snapshot would differ
        let sessions: i64 = c.query_row("SELECT COUNT(*) FROM session", [], |x| x.get(0)).unwrap();
        let measured: i64 = c.query_row("SELECT COUNT(DISTINCT session_id) FROM measurement", [], |x| x.get(0)).unwrap();
        assert_eq!(sessions, measured);
        assert_eq!(sessions, r.counts.runs);
        assert!(sessions >= 20);
    }

    // ---------- AC-9 + zip safety: refuse before touching anything ----------

    #[test]
    fn inspect_refuses_damaged_or_foreign_files() {
        let env = Env::new("inspect");
        make_db(env.live(), "r", 2);
        let good = backup_of(&env, env.live(), "good.deckchek-backup");
        let db_bytes = {
            let p = env.out("g.sqlite3");
            extract_db(&good, &p);
            fs::read(&p).unwrap()
        };
        let code = |p: &Path| inspect_file(p).error_code.unwrap_or_default();

        let junk = env.out("junk.deckchek-backup");
        fs::write(&junk, b"PK\x03\x04 definitely not a zip").unwrap();
        assert_eq!(code(&junk), "bad_zip");

        // truncated archive
        let trunc = env.out("trunc.deckchek-backup");
        let full = fs::read(&good).unwrap();
        fs::write(&trunc, &full[..full.len() / 2]).unwrap();
        assert!(!inspect_file(&trunc).valid);

        let no_manifest = env.out("nomanifest.deckchek-backup");
        write_zip(&no_manifest, &[(DB_ENTRY, &db_bytes)]);
        assert_eq!(code(&no_manifest), "missing_manifest");

        // tampered DB (one byte flipped) no longer matches its sha256
        let tampered = env.out("tampered.deckchek-backup");
        let mut evil = db_bytes.clone();
        let last = evil.len() - 1;
        evil[last] ^= 0xff;
        let m = manifest_bytes(2, 1, &[(DB_ENTRY, &db_bytes)]);
        write_zip(&tampered, &[(MANIFEST, &m), (DB_ENTRY, &evil)]);
        assert_eq!(code(&tampered), "checksum");

        let fv99 = env.out("fv99.deckchek-backup");
        let m = manifest_bytes(2, 99, &[(DB_ENTRY, &db_bytes)]);
        write_zip(&fv99, &[(MANIFEST, &m), (DB_ENTRY, &db_bytes)]);
        let r = inspect_file(&fv99);
        assert_eq!((r.error_code.as_deref(), r.too_new), (Some("format_too_new"), true));

        // AC-6: newer schema is refused with the spec's message
        let newer = env.out("newer.deckchek-backup");
        crafted(&newer, 9999, &[(DB_ENTRY, &db_bytes)]);
        let r = inspect_file(&newer);
        assert!(r.too_new && !r.valid);
        assert_eq!(r.errors, vec!["This backup was made by a newer DeckChek (schema v9999). Update the app to restore it.".to_string()]);

        let foreign = env.out("foreign.deckchek-backup");
        write_zip(&foreign, &[(MANIFEST, br#"{"format":"something-else","formatVersion":1}"#), (DB_ENTRY, &db_bytes)]);
        assert_eq!(code(&foreign), "bad_manifest");

        let no_db = env.out("nodb.deckchek-backup");
        crafted(&no_db, 2, &[(UI_ENTRY, b"{}")]);
        assert_eq!(code(&no_db), "bad_manifest");

        // listed but absent
        let absent = env.out("absent.deckchek-backup");
        let m = manifest_bytes(2, 1, &[(DB_ENTRY, &db_bytes)]);
        write_zip(&absent, &[(MANIFEST, &m)]);
        assert_eq!(code(&absent), "missing_entry");

        // the well-formed crafted archive passes, so the failures above are the guards
        let ok = env.out("crafted-ok.deckchek-backup");
        crafted(&ok, 2, &[(DB_ENTRY, &db_bytes)]);
        let r = inspect_file(&ok);
        assert!(r.valid && r.needs_migration, "{:?}", r.errors);
    }

    #[test]
    fn entry_names_are_checked() {
        for ok in ["manifest.json", "db/deckchek.sqlite3", "photos/ab12.jpg", "photos/"] {
            assert!(entry_name_safe(ok), "{ok}");
        }
        for bad in ["", "../evil", "/etc/passwd", "C:/x", "c:x", "a\\..\\b", "db\\deckchek.sqlite3", "ok/../../x", "./x", "a//b", "a/./b", "x\0", "file:stream", "/"] {
            assert!(!entry_name_safe(bad), "{bad:?}");
        }
    }

    #[test]
    fn archives_with_traversal_or_absolute_entries_are_refused_and_nothing_is_written() {
        let env = Env::new("zipslip");
        make_db(env.live(), "live", 2);
        let src = env.out("src.sqlite3");
        make_db(&src, "src", 1);
        let good = backup_of(&env, &src, "good.deckchek-backup");
        let db_bytes = {
            let p = env.out("g.sqlite3");
            extract_db(&good, &p);
            fs::read(&p).unwrap()
        };
        let before = fs::read(env.live()).unwrap();
        for (i, evil) in ["../evil", "../../evil.txt", "/tmp/deckchek-evil", "C:/evil", "db\\..\\..\\evil"].iter().enumerate() {
            let p = env.out(&format!("slip{i}.deckchek-backup"));
            let m = manifest_bytes(current_schema_version(), 1, &[(DB_ENTRY, &db_bytes)]);
            write_zip(&p, &[(MANIFEST, &m), (DB_ENTRY, &db_bytes), (evil, b"pwned")]);
            assert_eq!(inspect_file(&p).error_code.as_deref(), Some("unsafe_entry"), "{evil}");
            let e = restore_backup(&env.ctx, &p, true, &SettingsBlob::default(), None).unwrap_err();
            assert_eq!(e.code, "unsafe_entry");
        }
        assert!(!env.root.join("evil").exists() && !env.root.join("out").join("evil").exists());
        assert!(!Path::new("/tmp/deckchek-evil").exists());
        assert_eq!(fs::read(env.live()).unwrap(), before);
        no_restore_leftovers(&env);
        // an unknown but safe entry is ignored, not extracted
        let extra = env.out("extra.deckchek-backup");
        let m = manifest_bytes(current_schema_version(), 1, &[(DB_ENTRY, &db_bytes)]);
        write_zip(&extra, &[(MANIFEST, &m), (DB_ENTRY, &db_bytes), ("photos/x.jpg", b"jpeg")]);
        assert!(inspect_file(&extra).valid);
    }

    #[test]
    fn oversized_and_zip_bomb_entries_are_refused() {
        let env = Env::new("bomb");
        let src = env.out("src.sqlite3");
        make_db(&src, "src", 1);
        let good = backup_of(&env, &src, "good.deckchek-backup");
        let db_bytes = {
            let p = env.out("g.sqlite3");
            extract_db(&good, &p);
            fs::read(&p).unwrap()
        };
        // > 5 MiB JSON entry: refused on size, even though it compresses well
        let big = vec![b' '; (MAX_JSON_BYTES + 1) as usize];
        let p = env.out("big.deckchek-backup");
        crafted(&p, 2, &[(DB_ENTRY, &db_bytes), (UI_ENTRY, &big)]);
        assert_eq!(inspect_file(&p).error_code.as_deref(), Some("too_large"));
        // 3 MiB of zeros (~1000:1) is under the size cap but trips the ratio guard
        let bomb = vec![0u8; 3 * 1024 * 1024];
        let p = env.out("ratio.deckchek-backup");
        crafted(&p, 2, &[(DB_ENTRY, &db_bytes), (CAL_ENTRY, &bomb)]);
        assert_eq!(inspect_file(&p).error_code.as_deref(), Some("zip_bomb"));
        // the manifest itself is size-capped too
        let p = env.out("hugemanifest.deckchek-backup");
        write_zip(&p, &[(MANIFEST, &big)]);
        assert_eq!(inspect_file(&p).error_code.as_deref(), Some("too_large"));
        // small, highly compressible entries stay fine (ratio applies past 1 MiB)
        let p = env.out("smallzeros.deckchek-backup");
        crafted(&p, 2, &[(DB_ENTRY, &db_bytes), (UI_ENTRY, b"{}"), (MIDI_ENTRY, &vec![b' '; 512 * 1024])]);
        assert!(inspect_file(&p).valid);
    }

    // ---------- AC-4 / AC-5: restore with safety backup and migration ----------

    #[test]
    fn restore_upgrades_the_v004_fixture_and_takes_a_safety_backup() {
        let env = Env::new("restore-v004");
        make_db(env.live(), "live", 4);
        let src = env.out("v004.sqlite3");
        {
            let c = Connection::open(&src).unwrap();
            c.execute_batch(&fixture_sql()).unwrap();
        }
        let fixture_counts: Vec<(String, i64)> = ["session", "asset", "measurement", "asset_midi_map", "device_profile", "maintenance_event"]
            .iter()
            .map(|t| (t.to_string(), rows(&src, t)))
            .collect();
        let backup = backup_of(&env, &src, "old.deckchek-backup");
        let insp = inspect_file(&backup);
        assert!(insp.valid && insp.needs_migration);
        assert_eq!(insp.manifest.as_ref().unwrap().schema_version, 2);

        let current = SettingsBlob { ui: Some(json!({ "theme": "light" })), calibration: None };
        let r = restore_backup(&env.ctx, &backup, true, &current, None).unwrap();
        assert_eq!(r.upgraded_from, Some(2));
        assert_eq!(r.schema_version, current_schema_version());
        assert_eq!(r.settings, json!({ "theme": "dark", "sampleRate": 48000 }));
        assert_eq!(r.calibration_profiles.as_object().unwrap().len(), 2);
        assert!(r.warnings.is_empty());
        for (t, n) in &fixture_counts {
            assert_eq!(rows(env.live(), t), *n, "{t} preserved");
        }
        let c = Connection::open(env.live()).unwrap();
        assert!(integrity_ok(&c));
        assert_eq!(schema_version(&c).unwrap(), current_schema_version());
        assert!(c.query_row("SELECT COUNT(*) FROM backup_log", [], |x| x.get::<_, i64>(0)).is_ok(), "0005 applied");
        drop(c);
        no_restore_leftovers(&env);

        // the safety backup holds the data that was live before, with the current settings
        let safety = PathBuf::from(r.safety_backup.unwrap());
        assert!(safety.starts_with(&env.ctx.backups_dir));
        assert!(safety.file_name().unwrap().to_string_lossy().starts_with("auto-pre-restore-"));
        let m = inspect_file(&safety).manifest.unwrap();
        assert_eq!((m.kind.as_str(), m.counts.runs), ("pre_restore", 4));
        let back = restore_backup(&env.ctx, &safety, true, &SettingsBlob::default(), None).unwrap();
        assert_eq!(back.upgraded_from, None);
        assert_eq!(back.settings, json!({ "theme": "light" }));
        assert_eq!(rows(env.live(), "session"), 4);
    }

    #[test]
    fn restore_needs_confirmation_and_works_without_a_live_database() {
        let env = Env::new("restore-fresh");
        let src = env.out("src.sqlite3");
        make_db(&src, "src", 2);
        let backup = backup_of(&env, &src, "b.deckchek-backup");
        assert_eq!(restore_backup(&env.ctx, &backup, false, &SettingsBlob::default(), None).unwrap_err().code, "not_confirmed");
        assert!(!env.live().exists());
        let r = restore_backup(&env.ctx, &backup, true, &SettingsBlob::default(), None).unwrap();
        assert_eq!(r.safety_backup, None, "nothing to protect on a fresh install");
        assert_eq!(rows(env.live(), "session"), 2);
    }

    #[test]
    fn restore_settings_with_unexpected_shapes_are_dropped_with_a_warning() {
        let env = Env::new("restore-settings");
        let src = env.out("src.sqlite3");
        make_db(&src, "src", 1);
        let dest = env.out("s.deckchek-backup");
        let odd = SettingsBlob { ui: Some(json!([1, 2])), calibration: Some(json!({ "k": 5 })) };
        create_backup(&src, &dest, Kind::Manual, &odd, &mut |_, _| {}).unwrap();
        let r = restore_backup(&env.ctx, &dest, true, &SettingsBlob::default(), None).unwrap();
        assert_eq!((r.settings.clone(), r.calibration_profiles.clone()), (Value::Null, Value::Null));
        assert_eq!(r.warnings.len(), 2);
    }

    // ---------- failure injection: the live DB stays byte-identical ----------

    fn assert_untouched(env: &Env, before: &[u8], label: &str) {
        assert_eq!(fs::read(env.live()).unwrap(), before, "{label}: live DB must be byte-identical");
        no_restore_leftovers(env);
        assert_eq!(rows(env.live(), "session"), 3, "{label}");
    }

    #[test]
    fn failed_restores_leave_the_live_database_byte_identical() {
        let env = Env::new("inject");
        make_db(env.live(), "live", 3);
        let src = env.out("src.sqlite3");
        make_db(&src, "src", 5);
        let good = backup_of(&env, &src, "good.deckchek-backup");
        let before = fs::read(env.live()).unwrap();
        let none = SettingsBlob::default();

        // injected failures at every stage, before and during the swap
        for fp in [FailPoint::Migration, FailPoint::AfterSafetyBackup, FailPoint::MidSwap, FailPoint::AfterSwap] {
            let e = restore_backup(&env.ctx, &good, true, &none, Some(fp)).unwrap_err();
            assert!(!e.message.is_empty());
            assert_untouched(&env, &before, &format!("{fp:?}"));
        }

        // corrupt database with a matching checksum: integrity check refuses it
        let junk_db = vec![0x42u8; 8192];
        let corrupt = env.out("corrupt.deckchek-backup");
        crafted(&corrupt, current_schema_version(), &[(DB_ENTRY, &junk_db)]);
        assert_eq!(restore_backup(&env.ctx, &corrupt, true, &none, None).unwrap_err().code, "corrupt_db");
        assert_untouched(&env, &before, "corrupt db");

        // truncated SQLite file (header intact, pages missing)
        let snap = env.out("snap.sqlite3");
        extract_db(&good, &snap);
        let mut half = fs::read(&snap).unwrap();
        half.truncate(half.len() / 2);
        let truncated = env.out("truncated.deckchek-backup");
        crafted(&truncated, current_schema_version(), &[(DB_ENTRY, &half)]);
        assert!(restore_backup(&env.ctx, &truncated, true, &none, None).is_err());
        assert_untouched(&env, &before, "truncated db");

        // a real migration error inside the backup's own data (v2 DB that blocks version 3)
        let v2 = env.out("v2.sqlite3");
        {
            let c = Connection::open(&v2).unwrap();
            c.execute_batch(&fixture_sql()).unwrap();
            c.execute_batch("CREATE TRIGGER block_v3 BEFORE INSERT ON schema_migration WHEN NEW.version = 3 BEGIN SELECT RAISE(ABORT, 'blocked'); END;").unwrap();
        }
        let blocked = backup_of(&env, &v2, "blocked.deckchek-backup");
        assert_eq!(restore_backup(&env.ctx, &blocked, true, &none, None).unwrap_err().code, "migration_failed");
        assert_untouched(&env, &before, "migration error");

        // DB inside says a newer schema than the manifest claims
        let newer_db = env.out("newer.sqlite3");
        make_db(&newer_db, "n", 1);
        Connection::open(&newer_db).unwrap().execute("INSERT INTO schema_migration (version, applied_at) VALUES (999, 'x')", []).unwrap();
        // (create_backup refuses to write it: its own verification sees schema v999)
        assert_eq!(create_backup(&newer_db, &env.out("n.deckchek-backup"), Kind::Manual, &none, &mut |_, _| {}).unwrap_err().code, "verify_failed");
        let liar_db = fs::read(&newer_db).unwrap();
        let liar = env.out("honest.deckchek-backup");
        crafted(&liar, 999, &[(DB_ENTRY, &liar_db)]);
        let lying = env.out("lying.deckchek-backup");
        crafted(&lying, current_schema_version(), &[(DB_ENTRY, &liar_db)]);
        assert_eq!(restore_backup(&env.ctx, &lying, true, &none, None).unwrap_err().code, "too_new");
        assert_untouched(&env, &before, "db newer than manifest");
        // and a manifest that is honest about it is refused at inspect (AC-6)
        assert_eq!(restore_backup(&env.ctx, &liar, true, &none, None).unwrap_err().code, "too_new");
        assert_untouched(&env, &before, "too new");

        // checksum mismatch and bad zip (AC-9)
        let tampered = env.out("tampered.deckchek-backup");
        let mut evil = liar_db.clone();
        evil[100] ^= 1;
        let m = manifest_bytes(2, 1, &[(DB_ENTRY, &liar_db)]);
        write_zip(&tampered, &[(MANIFEST, &m), (DB_ENTRY, &evil)]);
        assert_eq!(restore_backup(&env.ctx, &tampered, true, &none, None).unwrap_err().code, "checksum");
        assert_untouched(&env, &before, "checksum");
        let junk = env.out("junk.deckchek-backup");
        fs::write(&junk, b"not a zip").unwrap();
        assert_eq!(restore_backup(&env.ctx, &junk, true, &none, None).unwrap_err().code, "bad_zip");
        assert_untouched(&env, &before, "bad zip");

        // safety backup cannot be written (backups "folder" is a file): nothing restored
        let blocked_dir = env.root.join("not-a-dir");
        fs::write(&blocked_dir, b"x").unwrap();
        let ctx2 = Ctx { live_db: env.ctx.live_db.clone(), backups_dir: blocked_dir.join("backups"), gate: env.ctx.gate };
        assert!(restore_backup(&ctx2, &good, true, &none, None).is_err());
        assert_untouched(&env, &before, "safety backup failed");

        // hot journal / WAL sidecars of the live DB move with it and come back on rollback
        let journal = sidecar(env.live(), "-journal");
        fs::write(&journal, b"").unwrap();
        assert!(restore_backup(&env.ctx, &good, true, &none, Some(FailPoint::AfterSwap)).is_err());
        assert!(journal.exists());
        remove_quietly(&journal);
        assert_untouched(&env, &before, "sidecars");

        // and the same file then restores fine
        restore_backup(&env.ctx, &good, true, &none, None).unwrap();
        assert_eq!(rows(env.live(), "session"), 5);
        no_restore_leftovers(&env);
    }

    #[test]
    fn restore_waits_for_open_connections_through_the_gate() {
        let env = Env::new("gate");
        make_db(env.live(), "live", 1);
        let src = env.out("src.sqlite3");
        make_db(&src, "src", 2);
        let good = backup_of(&env, &src, "good.deckchek-backup");
        let reader = env.ctx.gate.read().unwrap();
        let handle = {
            let ctx = Ctx { live_db: env.ctx.live_db.clone(), backups_dir: env.ctx.backups_dir.clone(), gate: env.ctx.gate };
            std::thread::spawn(move || restore_backup(&ctx, &good, true, &SettingsBlob::default(), None).map(|_| ()))
        };
        std::thread::sleep(Duration::from_millis(300));
        assert!(!handle.is_finished(), "restore must wait while a connection holds the gate");
        assert_eq!(rows(env.live(), "session"), 1);
        drop(reader);
        handle.join().unwrap().unwrap();
        assert_eq!(rows(env.live(), "session"), 2);
    }

    #[test]
    fn startup_recovery_finishes_or_undoes_an_interrupted_restore() {
        let env = Env::new("recover");
        make_db(env.live(), "live", 3);
        let before = fs::read(env.live()).unwrap();
        // crash between "live -> bak" and "tmp -> live"
        fs::rename(env.live(), restore_bak(env.live())).unwrap();
        fs::write(restore_tmp(env.live()), b"half-written").unwrap();
        fs::write(env.ctx.backups_dir.join("auto-x.deckchek-backup.partial"), b"x").unwrap();
        fs::write(env.ctx.backups_dir.join("keep.deckchek-backup"), b"x").unwrap();
        let notes = recover_on_startup(&env.ctx);
        assert!(notes.len() >= 3, "{notes:?}");
        assert_eq!(fs::read(env.live()).unwrap(), before);
        no_restore_leftovers(&env);
        assert!(!env.ctx.backups_dir.join("auto-x.deckchek-backup.partial").exists());
        assert!(env.ctx.backups_dir.join("keep.deckchek-backup").exists());
        // crash after the swap finished: the leftover old copy is removed, live kept
        fs::write(restore_bak(env.live()), b"old").unwrap();
        recover_on_startup(&env.ctx);
        assert_eq!(fs::read(env.live()).unwrap(), before);
        no_restore_leftovers(&env);
        assert!(recover_on_startup(&env.ctx).is_empty());
    }

    // ---------- AC-7: retention ----------

    fn fake_backup(dir: &Path, name: &str, kind: &str, created: &str) -> PathBuf {
        let p = dir.join(name);
        let m = serde_json::to_vec(&json!({ "format": "deckchek-backup", "formatVersion": 1, "createdAt": created, "kind": kind, "appVersion": "0.0.5", "schemaVersion": 3, "files": [] })).unwrap();
        write_zip(&p, &[(MANIFEST, &m)]);
        p
    }

    #[test]
    fn retention_keeps_the_newest_n_automatic_backups_and_never_manual_ones() {
        let env = Env::new("retention");
        let dir = &env.ctx.backups_dir;
        let mut autos = Vec::new();
        for day in 1..=9 {
            // file names deliberately out of date order: sorting uses the manifest createdAt
            autos.push(fake_backup(dir, &format!("auto-{}.deckchek-backup", 10 - day), "auto", &format!("2026-10-{day:02}T00:00:00.000Z")));
        }
        let pre = fake_backup(dir, "auto-pre-restore-1.deckchek-backup", "pre_restore", "2026-10-10T00:00:00.000Z");
        let manual_old = fake_backup(dir, "DeckChek-backup-old.deckchek-backup", "manual", "2020-01-01T00:00:00.000Z");
        let manual_named_auto = fake_backup(dir, "auto-mine.deckchek-backup", "manual", "2019-01-01T00:00:00.000Z");
        let unreadable = dir.join("auto-broken.deckchek-backup");
        fs::write(&unreadable, b"not a zip").unwrap();

        let deleted = apply_retention(dir, 7);
        assert_eq!(deleted.len(), 3);
        // newest 7 of the 10 automatic ones: pre-restore (10th) + days 9..4
        assert!(pre.exists());
        for (i, p) in autos.iter().enumerate() {
            let day = i + 1;
            assert_eq!(p.exists(), day >= 4, "day {day}");
        }
        assert!(manual_old.exists() && manual_named_auto.exists() && unreadable.exists());
        // keep is clamped to at least 1
        apply_retention(dir, 0);
        assert!(pre.exists());
        assert!(manual_old.exists() && manual_named_auto.exists());

        let list = list_backups(&env.ctx, None);
        let newest_valid = list.iter().find(|e| e.name != "auto-broken.deckchek-backup").unwrap();
        assert_eq!((newest_valid.name.as_str(), newest_valid.kind.as_str()), ("auto-pre-restore-1.deckchek-backup", "pre_restore"));
        assert!(list.iter().any(|e| e.kind == "manual" && e.name == "auto-mine.deckchek-backup"));
    }

    // ---------- schedule, log, import ----------

    fn mem_db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        c
    }

    #[test]
    fn schedule_due_rules_at_their_boundaries() {
        let now = 1_000 * DAY_MS;
        assert!(!is_due(Mode::Off, None, now));
        assert!(!is_due(Mode::OnExit, None, now));
        assert!(is_due(Mode::Daily, None, now));
        assert!(!is_due(Mode::Daily, Some(now - DAY_MS + 1), now));
        assert!(is_due(Mode::Daily, Some(now - DAY_MS), now));
        assert!(!is_due(Mode::Weekly, Some(now - 7 * DAY_MS + 1), now));
        assert!(is_due(Mode::Weekly, Some(now - 7 * DAY_MS), now));
        assert!(is_due(Mode::Daily, Some(now + DAY_MS), now), "clock moved back: run");
    }

    #[test]
    fn schedule_settings_round_trip_through_app_state() {
        let c = mem_db();
        assert_eq!(get_schedule(&c).unwrap(), ScheduleSettings::default());
        assert_eq!(get_schedule(&c).unwrap().keep, 7);
        crate::app_state::set(&c, "backup", &json!({ "remindLater": "2026-11-01" })).unwrap();
        let s = set_schedule(&c, Some(&ScheduleInput { mode: Mode::Weekly, keep: 3 }), None).unwrap();
        assert_eq!((s.mode, s.keep, s.last_auto_ms), (Mode::Weekly, 3, None));
        let s = set_schedule(&c, None, Some(86_400_000)).unwrap();
        assert_eq!((s.mode, s.last_auto_ms, s.last_auto_at.as_deref()), (Mode::Weekly, Some(86_400_000), Some("1970-01-02T00:00:00.000Z")));
        let raw = crate::app_state::get(&c, "backup").unwrap().unwrap().value;
        assert_eq!(raw["remindLater"], "2026-11-01", "unknown keys are preserved");
        assert_eq!(raw["mode"], "weekly");
        for keep in [0, MAX_KEEP + 1] {
            assert_eq!(set_schedule(&c, Some(&ScheduleInput { mode: Mode::Daily, keep }), None).unwrap_err().code, "invalid_settings");
        }
        let input: ScheduleInput = serde_json::from_value(json!({ "mode": "onExit", "keep": 7 })).unwrap();
        assert_eq!(input.mode, Mode::OnExit);
        assert!(serde_json::from_value::<ScheduleInput>(json!({ "mode": "hourly", "keep": 7 })).is_err());
    }

    #[test]
    fn backup_log_round_trip_and_listing_of_backups_saved_elsewhere() {
        let env = Env::new("log");
        make_db(env.live(), "r", 1);
        let dest = env.out("elsewhere.deckchek-backup");
        let r = create_backup(env.live(), &dest, Kind::Manual, &SettingsBlob::default(), &mut |_, _| {}).unwrap();
        let c = Connection::open(env.live()).unwrap();
        log_backup(&c, &r, true).unwrap();
        let (kind, path, bytes, schema, ok): (String, String, i64, i64, i64) =
            c.query_row("SELECT kind, path, bytes, schema_version, ok FROM backup_log", [], |x| Ok((x.get(0)?, x.get(1)?, x.get(2)?, x.get(3)?, x.get(4)?))).unwrap();
        assert_eq!((kind.as_str(), path.as_str(), bytes as u64, schema, ok), ("manual", r.path.as_str(), r.bytes, current_schema_version(), 1));
        let list = list_backups(&env.ctx, Some(&c));
        assert_eq!(list.len(), 1);
        assert_eq!((list[0].kind.as_str(), list[0].bytes, list[0].created_at.as_str()), ("manual", r.bytes, r.created_at.as_str()));
        fs::remove_file(&dest).unwrap();
        assert!(list_backups(&env.ctx, Some(&c)).is_empty(), "deleted files drop out of the list");
    }

    #[test]
    fn workspace_import_skips_duplicates_and_bad_rows() {
        let mut c = mem_db();
        persist_run(&mut c, &run("dup")).unwrap();
        let payload = json!({
            "version": 1,
            "runs": [
                { "id": "dup", "test": "x", "createdAt": "2026-10-10T08:00:00Z", "measurements": [], "findings": [] },
                { "id": "new-1", "test": "Stereo balance", "createdAt": "2026-10-10T08:00:00Z", "measurements": [{ "metricId": "balance", "value": 0.1, "unit": "dB" }], "findings": [] },
                { "id": "new-1", "test": "again", "createdAt": "2026-10-10T08:00:00Z", "measurements": [], "findings": [] },
                { "id": "bad" },
                { "id": "", "test": "x", "createdAt": "x", "measurements": [], "findings": [] }
            ],
            "equipment": [{ "id": "eq-1", "name": "SL-1200MK4", "serialNumber": "GH1" }, { "id": "eq-1", "name": "dup" }, { "name": "no id" }]
        });
        let r = import_workspace(&mut c, &payload).unwrap();
        assert_eq!(r, ImportResult { runs_imported: 1, runs_skipped: 2, runs_invalid: 2, equipment_imported: 1 });
        let n: i64 = c.query_row("SELECT COUNT(*) FROM session", [], |x| x.get(0)).unwrap();
        assert_eq!(n, 2);
        let serial: String = c.query_row("SELECT serial_number FROM asset WHERE id = 'eq-1'", [], |x| x.get(0)).unwrap();
        assert_eq!(serial, "GH1");
        // re-import is a no-op
        let again = import_workspace(&mut c, &payload).unwrap();
        assert_eq!((again.runs_imported, again.equipment_imported), (0, 0));
        for bad in [json!({ "version": 2, "runs": [] }), json!({ "version": 1 }), json!([])] {
            assert_eq!(import_workspace(&mut c, &bad).unwrap_err().code, "bad_workspace");
        }
    }

    #[test]
    fn time_formatting_matches_known_dates() {
        assert_eq!(iso_utc(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_utc(951_782_400_000), "2000-02-29T00:00:00.000Z");
        assert_eq!(iso_utc(1_791_633_845_123), "2026-10-10T12:04:05.123Z");
        assert_eq!(file_stamp(1_791_633_845_123), "20261010-120405");
        let dir = std::env::temp_dir();
        let p = unique_path(&dir, "auto-", 0);
        assert!(p.file_name().unwrap().to_string_lossy().starts_with("auto-19700101-000000"));
    }

    #[test]
    fn manifest_contract_round_trips_with_the_js_example() {
        let raw = fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/backup-manifest.json")).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        let m: Manifest = serde_json::from_value(v.clone()).unwrap();
        assert_eq!(m.counts, Counts { runs: 128, assets: 12, profiles: 3, midi_maps: 4 });
        assert_eq!(serde_json::to_value(&m).unwrap(), v, "field names match exactly");
    }

    #[test]
    fn errors_serialize_with_code_and_message() {
        let v = serde_json::to_value(BackupError::new("too_new", "m")).unwrap();
        assert_eq!(v, json!({ "code": "too_new", "message": "m" }));
        let e = io_err("save the backup", io::Error::new(io::ErrorKind::StorageFull, "/home/secret/path"));
        assert_eq!(e.code, "disk_full");
        assert!(!e.message.contains("secret"));
    }
}
