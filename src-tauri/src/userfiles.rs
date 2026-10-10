//! User-chosen file writes (FS-00 §4.4). The webview obtains a path from a native
//! save dialog and hands it to these commands; everything is re-validated here so a
//! compromised or buggy page cannot write outside what the user picked.

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
    let p = validate_save_path(path, allowed_ext)?;
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
    // Validate and decode everything before touching the disk.
    let mut plan: Vec<(Vec<String>, Vec<u8>)> = Vec::with_capacity(files.len());
    let mut seen = HashSet::new();
    let mut total = 0usize;
    for f in files {
        let segs = validate_rel(&f.rel_path, allowed_exts)?;
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

    #[test]
    fn error_serializes_with_code() {
        let v = serde_json::to_value(UserFileError::BadExtension).unwrap();
        assert_eq!(v["code"], "bad_extension");
    }
}
