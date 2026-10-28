//! User-chosen file writes (FS-00 §4.4). The webview obtains a path from a native
//! save dialog and hands it to these commands; everything is re-validated here.
//!
//! Trust model (AUD-01): Rust never sees the dialog result, so `path`/`dir` and the extension
//! list come from the page and are treated as hostile. What a compromised page can do is bounded
//! by server-side rules, not by what it passes:
//! - Extensions: the caller's list only narrows `WRITABLE_EXTS`, a fixed list of data, report and
//!   static-site types. Anything else (exe, bat, cmd, com, lnk, ps1, vbs, msi, scr, url, desktop,
//!   sh, app, command, dll, ...) is `bad_extension`. `NEVER_WRITABLE` names the types that must
//!   stay out, and a test keeps the two lists disjoint.
//! - `.js` stays writable because real exports need it (FS-32 Mixxx script next to `.midi.xml`,
//!   FS-33 static ledger site). It is made safe by the next two rules instead of a ban:
//!   `links::open_path` launches only a viewer set (pdf/html/htm/csv/json/txt and folders), so
//!   DeckChek never launches a written `.js` (Windows Script Host would run it); and no write may
//!   land in an OS autostart location.
//! - Autostart (`forbidden_location`): the Windows Startup folder (`Start Menu\Programs\Startup`),
//!   XDG `autostart` folders and macOS `Library/LaunchAgents|LaunchDaemons|StartupItems` are
//!   refused. Both the given path and its canonical form (symlinks, junctions and 8.3 names
//!   resolved) are checked.
//! Rust-internal callers (backup, pdf, diagnostics) pass fixed extension constants to
//! `validate_save_path`, which applies the same autostart rule.

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const MAX_FOLDER_FILES: usize = 2000;
const MAX_FOLDER_BYTES: usize = 512 * 1024 * 1024;
const RESERVED: [&str; 4] = ["CON", "PRN", "AUX", "NUL"];

/// The only extensions the `userfiles_*` commands may write (AUD-01). Callers: media profile
/// `json` (media.js), report `csv`/`html`/`txt`/`md`/`svg`, FS-32 mapper `xml` and `js` (Mixxx
/// `.midi.xml` and script, VirtualDJ/Serato `.xml`), FS-33 ledger site `html`/`css`/`js`/`json`/
/// `jpg`/`png`. PDFs, backups and diagnostics bundles are written by Rust, not through these commands.
pub const WRITABLE_EXTS: &[&str] =
    &["csv", "json", "txt", "md", "html", "htm", "xml", "svg", "css", "js", "jpg", "jpeg", "png", "pdf"];

/// Executable, script and shortcut types that must never be writable from the webview. Filtering
/// uses the `WRITABLE_EXTS` allowlist; this list exists so a test proves the two are disjoint.
#[cfg_attr(not(test), allow(dead_code))]
pub const NEVER_WRITABLE: &[&str] = &[
    "exe", "bat", "cmd", "com", "lnk", "ps1", "psm1", "vbs", "vbe", "jse", "wsf", "wsh", "hta", "msi", "msp", "scr", "url", "desktop",
    "sh", "app", "command", "dll", "reg", "pif", "cpl", "jar", "inf", "plist", "service", "scf", "appref-ms",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UserFileError {
    Relative,
    Invalid(&'static str),
    BadExtension,
    Reserved,
    Traversal,
    Symlink,
    NotFound,
    TooLarge,
    Forbidden,
    Io(String),
}

impl UserFileError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Relative => "relative_path",
            Self::Invalid(_) => "invalid_path",
            Self::BadExtension => "bad_extension",
            Self::Reserved => "reserved_name",
            Self::Traversal => "traversal",
            Self::Symlink => "symlink",
            Self::NotFound => "not_found",
            Self::TooLarge => "too_large",
            Self::Forbidden => "forbidden_location",
            Self::Io(_) => "io",
        }
    }
}

impl std::fmt::Display for UserFileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Relative => write!(f, "path must be absolute"),
            Self::Invalid(why) => write!(f, "invalid path: {why}"),
            Self::BadExtension => write!(f, "file extension is not allowed"),
            Self::Reserved => write!(f, "reserved file name"),
            Self::Traversal => write!(f, "path traversal is not allowed"),
            Self::Symlink => write!(f, "symbolic links are not allowed"),
            Self::NotFound => write!(f, "destination folder does not exist"),
            Self::TooLarge => write!(f, "content too large"),
            Self::Forbidden => write!(f, "this folder is not allowed"),
            Self::Io(e) => write!(f, "write failed: {e}"),
        }
    }
}

impl Serialize for UserFileError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("UserFileError", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

impl From<std::io::Error> for UserFileError {
    fn from(e: std::io::Error) -> Self {
        // Only the error kind: OS messages can embed full user paths (FS-02 log rule).
        Self::Io(format!("{:?}", e.kind()))
    }
}

fn is_reserved_stem(name: &str) -> bool {
    // Windows treats "CON.txt" and "con.tar.gz" as the device, so test the part before the first dot.
    let stem = name.split('.').next().unwrap_or("").trim_end_matches(' ').to_ascii_uppercase();
    if RESERVED.contains(&stem.as_str()) {
        return true;
    }
    for p in ["COM", "LPT"] {
        if let Some(d) = stem.strip_prefix(p) {
            if d.len() == 1 && matches!(d.as_bytes()[0], b'1'..=b'9') {
                return true;
            }
        }
    }
    false
}

/// Validates one path segment (file or folder name) against Windows rules, applied on every OS.
fn check_segment(name: &str) -> Result<(), UserFileError> {
    if name.is_empty() || name == "." || name == ".." {
        return Err(UserFileError::Invalid("empty or dot segment"));
    }
    if name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c)) {
        return Err(UserFileError::Invalid("illegal character"));
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return Err(UserFileError::Invalid("trailing dot or space"));
    }
    if is_reserved_stem(name) {
        return Err(UserFileError::Reserved);
    }
    Ok(())
}

fn ext_allowed(name: &str, allowed: &[&str]) -> bool {
    let Some((_, ext)) = name.rsplit_once('.') else { return false };
    allowed.iter().any(|a| a.trim_start_matches('.').eq_ignore_ascii_case(ext))
}

/// Narrows the caller's extension list to `WRITABLE_EXTS` (AUD-01). An entry outside it, or an
/// empty list, is `BadExtension`: the page can only choose among the fixed safe types.
fn restrict_exts(requested: &[&str]) -> Result<Vec<&'static str>, UserFileError> {
    if requested.is_empty() {
        return Err(UserFileError::BadExtension);
    }
    requested
        .iter()
        .map(|r| {
            let r = r.trim_start_matches('.');
            WRITABLE_EXTS.iter().copied().find(|w| w.eq_ignore_ascii_case(r)).ok_or(UserFileError::BadExtension)
        })
        .collect()
}

/// True when `p` is inside an OS autostart location (AUD-01): Windows `Start Menu\Programs\Startup`,
/// XDG `autostart`, macOS `Library/LaunchAgents|LaunchDaemons|StartupItems`. Case-insensitive.
fn in_autostart_location(p: &Path) -> bool {
    let segs: Vec<String> = p
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy().to_ascii_lowercase()),
            _ => None,
        })
        .collect();
    segs.iter().enumerate().any(|(i, s)| match s.as_str() {
        "autostart" => true,
        "launchagents" | "launchdaemons" | "startupitems" => i >= 1 && segs[i - 1] == "library",
        "startup" => i >= 2 && segs[i - 1] == "programs" && segs[i - 2] == "start menu",
        _ => false,
    })
}

/// Refuses `target` if it, or its canonical form (deepest existing ancestor resolved, the rest
/// appended), is in an autostart location, so symlinks, junctions and 8.3 names cannot hide one.
fn check_location(target: &Path) -> Result<(), UserFileError> {
    if in_autostart_location(target) {
        return Err(UserFileError::Forbidden);
    }
    let mut base = target;
    let mut rest: Vec<&std::ffi::OsStr> = Vec::new();
    loop {
        if let Ok(canon) = fs::canonicalize(base) {
            let full = rest.iter().rev().fold(canon, |acc, s| acc.join(s));
            return if in_autostart_location(&full) { Err(UserFileError::Forbidden) } else { Ok(()) };
        }
        match (base.parent(), base.file_name()) {
            (Some(parent), Some(name)) => {
                rest.push(name);
                base = parent;
            }
            _ => return Ok(()),
        }
    }
}

fn is_symlink(p: &Path) -> bool {
    fs::symlink_metadata(p).map(|m| m.file_type().is_symlink()).unwrap_or(false)
}

/// Validates a save path chosen in a dialog. The file itself need not exist; its folder must.
pub fn validate_save_path(path: &str, allowed_exts: &[&str]) -> Result<PathBuf, UserFileError> {
    if path.is_empty() || path.contains('\0') {
        return Err(UserFileError::Invalid("empty or NUL"));
    }
    let p = PathBuf::from(path);
    if !p.is_absolute() {
        return Err(UserFileError::Relative);
    }
    if p.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(UserFileError::Traversal);
    }
    let name = p.file_name().and_then(|n| n.to_str()).ok_or(UserFileError::Invalid("no file name"))?;
    check_segment(name)?;
    if !ext_allowed(name, allowed_exts) {
        return Err(UserFileError::BadExtension);
    }
    let parent = p.parent().ok_or(UserFileError::Invalid("no parent"))?;
    if !parent.is_dir() {
        return Err(UserFileError::NotFound);
    }
    check_location(&p)?;
    match fs::symlink_metadata(&p) {
        Ok(m) if m.file_type().is_symlink() => return Err(UserFileError::Symlink),
        Ok(m) if m.is_dir() => return Err(UserFileError::Invalid("is a directory")),
        _ => {}
    }
    Ok(p)
}

/// Replaces characters outside `[A-Za-z0-9._ -]` with `_`, caps at 80 chars, and
/// makes the result a safe Windows file stem (no trailing dot/space, reserved names suffixed).
#[allow(dead_code)] // consumed by export jobs (FS-02/03/08/33)
pub fn sanitize_file_stem(s: &str) -> String {
    let mut out: String = s
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ' ' | '-') { c } else { '_' })
        .take(80)
        .collect();
    while out.ends_with('.') || out.ends_with(' ') {
        out.pop();
    }
    if out.is_empty() {
        return "_".into();
    }
    if is_reserved_stem(&out) {
        out.push('_');
    }
    out
}

fn written() -> &'static Mutex<HashSet<PathBuf>> {
    static SET: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Remembers a path DeckChek wrote this session (consumed by FS-07 open/reveal).
pub fn record_written(path: &Path) {
    let canon = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    if let Ok(mut set) = written().lock() {
        set.insert(canon);
    }
}

#[allow(dead_code)] // consumed by FS-07 open/reveal
pub fn is_recorded(path: &Path) -> bool {
    let canon = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    written().lock().map(|s| s.contains(&canon)).unwrap_or(false)
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct WriteTextResult {
    pub path: String,
    pub bytes: usize,
}

pub fn write_text(path: &str, content: &str, allowed_ext: &[&str]) -> Result<WriteTextResult, UserFileError> {
    let p = validate_save_path(path, &restrict_exts(allowed_ext)?)?;
    fs::write(&p, content.as_bytes())?;
    record_written(&p);
    Ok(WriteTextResult { path: p.to_string_lossy().into_owned(), bytes: content.len() })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderFile {
    pub rel_path: String,
    pub text: Option<String>,
    pub base64: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct WriteFolderResult {
    pub written: usize,
    pub path: String,
}

fn validate_rel(rel: &str, allowed: &[&str]) -> Result<Vec<String>, UserFileError> {
    if rel.contains('\0') || rel.starts_with('/') || rel.starts_with('\\') {
        return Err(UserFileError::Traversal);
    }
    let b = rel.as_bytes();
    if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' {
        return Err(UserFileError::Traversal);
    }
    let segs: Vec<&str> = rel.split(['/', '\\']).collect();
    if segs.iter().any(|s| *s == "..") {
        return Err(UserFileError::Traversal);
    }
    for s in &segs {
        check_segment(s)?;
    }
    if !ext_allowed(segs.last().unwrap(), allowed) {
        return Err(UserFileError::BadExtension);
    }
    Ok(segs.into_iter().map(String::from).collect())
}

pub fn write_folder(dir: &str, files: &[FolderFile], allowed_exts: &[&str]) -> Result<WriteFolderResult, UserFileError> {
    if dir.is_empty() || dir.contains('\0') {
        return Err(UserFileError::Invalid("empty or NUL"));
    }
    let root = PathBuf::from(dir);
    if !root.is_absolute() {
        return Err(UserFileError::Relative);
    }
    if root.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(UserFileError::Traversal);
    }
    if is_symlink(&root) {
        return Err(UserFileError::Symlink);
    }
    if !root.is_dir() {
        return Err(UserFileError::NotFound);
    }
    if files.len() > MAX_FOLDER_FILES {
        return Err(UserFileError::TooLarge);
    }
    let allowed_exts = restrict_exts(allowed_exts)?;
    let allowed_exts = allowed_exts.as_slice();
    check_location(&root)?;
    // Validate and decode everything before touching the disk.
    let mut plan: Vec<(Vec<String>, Vec<u8>)> = Vec::with_capacity(files.len());
    let mut seen = HashSet::new();
    let mut total = 0usize;
    for f in files {
        let segs = validate_rel(&f.rel_path, allowed_exts)?;
        check_location(&segs.iter().fold(root.clone(), |acc, s| acc.join(s)))?;
        if !seen.insert(segs.join("/").to_ascii_lowercase()) {
            return Err(UserFileError::Invalid("duplicate entry"));
        }
        let bytes = match (&f.text, &f.base64) {
            (Some(t), None) => t.as_bytes().to_vec(),
            (None, Some(b)) => base64::engine::general_purpose::STANDARD
                .decode(b)
                .map_err(|_| UserFileError::Invalid("bad base64"))?,
            _ => return Err(UserFileError::Invalid("entry needs exactly one of text or base64")),
        };
        total = total.saturating_add(bytes.len());
        if total > MAX_FOLDER_BYTES {
            return Err(UserFileError::TooLarge);
        }
        plan.push((segs, bytes));
    }
    let mut count = 0;
    for (segs, bytes) in &plan {
        let mut cur = root.clone();
        for dir_seg in &segs[..segs.len() - 1] {
            cur.push(dir_seg);
            match fs::symlink_metadata(&cur) {
                Ok(m) if m.file_type().is_symlink() => return Err(UserFileError::Symlink),
                Ok(m) if m.is_dir() => {}
                Ok(_) => return Err(UserFileError::Invalid("path segment is a file")),
                Err(_) => fs::create_dir(&cur)?,
            }
        }
        cur.push(segs.last().unwrap());
        match fs::symlink_metadata(&cur) {
            Ok(m) if m.file_type().is_symlink() => return Err(UserFileError::Symlink),
            Ok(m) if m.is_dir() => return Err(UserFileError::Invalid("is a directory")),
            _ => {}
        }
        let mut file = fs::File::create(&cur)?;
        file.write_all(bytes)?;
        record_written(&cur);
        count += 1;
    }
    record_written(&root);
    Ok(WriteFolderResult { written: count, path: root.to_string_lossy().into_owned() })
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn userfiles_write_text(path: String, content: String, allowedExt: String) -> Result<WriteTextResult, UserFileError> {
    write_text(&path, &content, &[allowedExt.as_str()])
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn userfiles_write_folder(dir: String, files: Vec<FolderFile>, allowedExts: Vec<String>) -> Result<WriteFolderResult, UserFileError> {
    let exts: Vec<&str> = allowedExts.iter().map(String::as_str).collect();
    write_folder(&dir, &files, &exts)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("deckchek-uf-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn s(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }

    #[test]
    fn accepts_plain_save_path_case_insensitive_ext() {
        let d = tmp("ok");
        assert!(validate_save_path(&s(&d.join("report.csv")), &["csv"]).is_ok());
        assert!(validate_save_path(&s(&d.join("REPORT.CSV")), &[".csv"]).is_ok());
    }

    #[test]
    fn rejects_relative_empty_nul() {
        assert_eq!(validate_save_path("report.csv", &["csv"]), Err(UserFileError::Relative));
        assert!(validate_save_path("", &["csv"]).is_err());
        let d = tmp("nul");
        assert!(validate_save_path(&format!("{}/a\0.csv", s(&d)), &["csv"]).is_err());
    }

    #[test]
    fn rejects_directory_and_wrong_ext() {
        let d = tmp("dir");
        fs::create_dir(d.join("sub.csv")).unwrap();
        assert!(validate_save_path(&s(&d.join("sub.csv")), &["csv"]).is_err());
        assert_eq!(validate_save_path(&s(&d.join("a.exe")), &["csv"]), Err(UserFileError::BadExtension));
        assert_eq!(validate_save_path(&s(&d.join("noext")), &["csv"]), Err(UserFileError::BadExtension));
        assert_eq!(validate_save_path(&s(&d.join("a.csv.exe")), &["csv"]), Err(UserFileError::BadExtension));
    }

    #[test]
    fn rejects_reserved_names_trailing_dots_spaces() {
        let d = tmp("res");
        for n in ["CON.csv", "nul.csv", "Com1.csv", "LPT9.csv", "aux.tar.csv", "con .csv"] {
            assert_eq!(validate_save_path(&s(&d.join(n)), &["csv"]), Err(UserFileError::Reserved), "{n}");
        }
        assert!(validate_save_path(&s(&d.join("COM0.csv")), &["csv"]).is_ok());
        assert!(validate_save_path(&s(&d.join("console.csv")), &["csv"]).is_ok());
        assert!(validate_save_path(&s(&d.join("a.csv.")), &["csv"]).is_err());
        assert!(validate_save_path(&s(&d.join("a.csv ")), &["csv"]).is_err());
        assert!(validate_save_path(&s(&d.join("a:b.csv")), &["csv"]).is_err());
    }

    #[test]
    fn rejects_traversal_and_missing_parent() {
        let d = tmp("trav");
        assert_eq!(validate_save_path(&format!("{}/../x.csv", s(&d)), &["csv"]), Err(UserFileError::Traversal));
        assert_eq!(validate_save_path(&s(&d.join("nope").join("x.csv")), &["csv"]), Err(UserFileError::NotFound));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_target_and_folder_entries() {
        let d = tmp("sym");
        let outside = tmp("sym-out");
        std::os::unix::fs::symlink(outside.join("t.csv"), d.join("link.csv")).unwrap();
        assert_eq!(validate_save_path(&s(&d.join("link.csv")), &["csv"]), Err(UserFileError::Symlink));
        std::os::unix::fs::symlink(&outside, d.join("linkdir")).unwrap();
        let f = vec![FolderFile { rel_path: "linkdir/a.txt".into(), text: Some("x".into()), base64: None }];
        assert_eq!(write_folder(&s(&d), &f, &["txt"]), Err(UserFileError::Symlink));
        assert!(!outside.join("a.txt").exists());
        assert_eq!(write_folder(&s(&d.join("linkdir")), &f, &["txt"]), Err(UserFileError::Symlink));
    }

    #[test]
    fn sanitizes_stems() {
        assert_eq!(sanitize_file_stem("Rane Twelve/MK2: test?"), "Rane Twelve_MK2_ test_");
        assert_eq!(sanitize_file_stem("CON"), "CON_");
        assert_eq!(sanitize_file_stem("nul.report"), "nul.report_");
        assert_eq!(sanitize_file_stem("name. "), "name");
        assert_eq!(sanitize_file_stem(""), "_");
        assert_eq!(sanitize_file_stem("..."), "_");
        assert_eq!(sanitize_file_stem(&"a".repeat(200)).len(), 80);
        assert_eq!(sanitize_file_stem("Ünï"), "_n_");
    }

    #[test]
    fn write_text_round_trip_and_records() {
        let d = tmp("wt");
        let p = s(&d.join("out.csv"));
        let r = write_text(&p, "a,b\n1,2\n", &["csv"]).unwrap();
        assert_eq!(r.bytes, 8);
        assert_eq!(fs::read_to_string(&p).unwrap(), "a,b\n1,2\n");
        assert!(is_recorded(Path::new(&p)));
        assert!(!is_recorded(&d.join("other.csv")));
        assert!(write_text(&s(&d.join("bad.exe")), "x", &["csv"]).is_err());
        assert!(!d.join("bad.exe").exists());
    }

    #[test]
    fn write_folder_round_trip() {
        let d = tmp("wf");
        let files = vec![
            FolderFile { rel_path: "index.html".into(), text: Some("<p>hi</p>".into()), base64: None },
            FolderFile { rel_path: "img/a.png".into(), text: None, base64: Some("iVBORw0=".into()) },
            FolderFile { rel_path: "img\\b.png".into(), text: None, base64: Some("AAEC".into()) },
        ];
        let r = write_folder(&s(&d), &files, &["html", "png"]).unwrap();
        assert_eq!(r.written, 3);
        assert_eq!(fs::read(d.join("img/b.png")).unwrap(), vec![0, 1, 2]);
        assert!(is_recorded(&d.join("index.html")));
    }

    #[test]
    fn write_folder_rejects_bad_entries_without_writing() {
        let d = tmp("wfbad");
        let ok = FolderFile { rel_path: "ok.txt".into(), text: Some("x".into()), base64: None };
        for bad in [
            "../evil.txt", "a/../../evil.txt", "/abs.txt", "\\abs.txt", "C:/x.txt", "C:x.txt", "\\\\server\\share\\x.txt",
            "a//b.txt", "CON.txt", "dir/NUL.txt", "x.exe", "trail./x.txt", "a/b ", "",
        ] {
            let f = vec![
                FolderFile { rel_path: "ok.txt".into(), text: Some("x".into()), base64: None },
                FolderFile { rel_path: bad.into(), text: Some("x".into()), base64: None },
            ];
            assert!(write_folder(&s(&d), &f, &["txt"]).is_err(), "{bad:?}");
        }
        assert!(!d.join("ok.txt").exists(), "validation precedes any write");
        let both = FolderFile { rel_path: "b.txt".into(), text: Some("x".into()), base64: Some("AA==".into()) };
        assert!(write_folder(&s(&d), &[both], &["txt"]).is_err());
        let neither = FolderFile { rel_path: "n.txt".into(), text: None, base64: None };
        assert!(write_folder(&s(&d), &[neither], &["txt"]).is_err());
        let badb64 = FolderFile { rel_path: "c.txt".into(), text: None, base64: Some("!!".into()) };
        assert!(write_folder(&s(&d), &[badb64], &["txt"]).is_err());
        let dup = vec![ok, FolderFile { rel_path: "OK.txt".into(), text: Some("y".into()), base64: None }];
        assert!(write_folder(&s(&d), &dup, &["txt"]).is_err());
        assert_eq!(write_folder("relative", &[], &["txt"]), Err(UserFileError::Relative));
        assert_eq!(write_folder(&s(&d.join("missing")), &[], &["txt"]), Err(UserFileError::NotFound));
        assert!(write_folder(&format!("{}/..", s(&d)), &[], &["txt"]).is_err());
    }

    // AUD-01: the webview must not choose an executable extension.
    #[test]
    fn regression_aud_01_commands_reject_caller_supplied_executable_exts() {
        let d = tmp("aud01-exe");
        for ext in [
            "bat", "cmd", "exe", "com", "lnk", "ps1", "vbs", "vbe", "jse", "wsf", "hta", "msi", "scr", "url", "desktop", "sh", "app", "command",
            "dll", "reg", "pif", "cpl", "plist", "service",
        ] {
            let p = d.join(format!("x.{ext}"));
            let r = userfiles_write_text(s(&p), "x".into(), ext.into());
            assert_eq!(r, Err(UserFileError::BadExtension), "{ext}");
            assert!(!p.exists(), "{ext}");
            let f = vec![FolderFile { rel_path: format!("a.{ext}"), text: Some("x".into()), base64: None }];
            assert_eq!(userfiles_write_folder(s(&d), f, vec![ext.into()]), Err(UserFileError::BadExtension), "{ext}");
            assert!(!d.join(format!("a.{ext}")).exists(), "{ext}");
        }
        // A safe entry in the list does not smuggle an unsafe one through.
        let f = vec![FolderFile { rel_path: "run.cmd".into(), text: Some("x".into()), base64: None }];
        assert_eq!(userfiles_write_folder(s(&d), f, vec!["txt".into(), "cmd".into()]), Err(UserFileError::BadExtension));
        assert!(!d.join("run.cmd").exists());
    }

    // AUD-01: .js/.html are writable (FS-32/FS-33) but never into an OS autostart folder.
    #[test]
    fn regression_aud_01_writes_never_land_in_autostart_locations() {
        let d = tmp("aud01-auto");
        let win = d.join("AppData").join("Roaming").join("Microsoft").join("Windows");
        let startup = win.join("Start Menu").join("Programs").join("Startup");
        let startup_upper = d.join("ProgramData").join("START MENU").join("programs").join("StartUp");
        let xdg = d.join("home").join(".config").join("autostart");
        let etc_xdg = d.join("etc").join("xdg").join("autostart");
        let agents = d.join("Users").join("u").join("Library").join("LaunchAgents");
        let daemons = d.join("Library").join("LaunchDaemons");
        for dir in [&startup, &startup_upper, &xdg, &etc_xdg, &agents, &daemons] {
            fs::create_dir_all(dir).unwrap();
            for (name, ext) in [("x.js", "js"), ("x.html", "html"), ("x.json", "json"), ("x.xml", "xml")] {
                assert!(userfiles_write_text(s(&dir.join(name)), "x".into(), ext.into()).is_err(), "{}", dir.join(name).display());
                assert!(!dir.join(name).exists());
            }
            let f = vec![FolderFile { rel_path: "a.js".into(), text: Some("x".into()), base64: None }];
            assert!(userfiles_write_folder(s(dir), f, vec!["js".into()]).is_err(), "{}", dir.display());
            assert!(!dir.join("a.js").exists());
        }
        // A folder export whose relative paths descend into the Startup folder.
        let f = vec![FolderFile { rel_path: "Start Menu/Programs/Startup/b.js".into(), text: Some("x".into()), base64: None }];
        assert!(userfiles_write_folder(s(&win), f, vec!["js".into()]).is_err());
        assert!(!startup.join("b.js").exists());
        // Ordinary folders that merely contain the words still work.
        let fine = d.join("Startup ideas");
        fs::create_dir_all(&fine).unwrap();
        assert!(userfiles_write_text(s(&fine.join("plan.md")), "x".into(), "md".into()).is_ok());
    }

    #[test]
    fn regression_aud_01_writable_allowlist_excludes_executables_and_covers_callers() {
        for e in NEVER_WRITABLE {
            assert!(!WRITABLE_EXTS.iter().any(|w| w.eq_ignore_ascii_case(e)), "{e}");
        }
        let d = tmp("aud01-ok");
        for ext in ["csv", "json", "txt", "md", "html", "xml", "svg", "css", "js", "jpg", "png", ".JSON"] {
            let name = format!("ok.{}", ext.trim_start_matches('.'));
            assert!(userfiles_write_text(s(&d.join(&name)), "x".into(), ext.into()).is_ok(), "{ext}");
        }
        assert_eq!(write_text(&s(&d.join("e.csv")), "x", &[]), Err(UserFileError::BadExtension));
        assert_eq!(write_folder(&s(&d), &[], &[]), Err(UserFileError::BadExtension));
        assert_eq!(check_location(&d.join("x.json")), Ok(()));
        let start = d.join("Start Menu").join("Programs").join("Startup");
        assert_eq!(check_location(&start.join("x.json")), Err(UserFileError::Forbidden));
        assert_eq!(serde_json::to_value(UserFileError::Forbidden).unwrap()["code"], "forbidden_location");
    }

    #[cfg(unix)]
    #[test]
    fn regression_aud_01_symlinked_folder_into_autostart_is_refused() {
        let d = tmp("aud01-symauto");
        let xdg = d.join(".config").join("autostart");
        fs::create_dir_all(&xdg).unwrap();
        std::os::unix::fs::symlink(&xdg, d.join("innocent")).unwrap();
        assert!(userfiles_write_text(s(&d.join("innocent").join("x.json")), "x".into(), "json".into()).is_err());
        assert!(!xdg.join("x.json").exists());
    }

    #[test]
    fn error_serializes_with_code() {
        let v = serde_json::to_value(UserFileError::BadExtension).unwrap();
        assert_eq!(v["code"], "bad_extension");
    }
}
