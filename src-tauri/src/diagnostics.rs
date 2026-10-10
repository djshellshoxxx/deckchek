//! Crash capture and the diagnostics bundle (FS-02).
//!
//! * A tiny rotating log (`deckchek.log` + 4 older files, 1 MiB each) written with std only.
//! * A panic hook that appends a line (thread, location, message, backtrace) and records
//!   the last panic in `crash.marker`.
//! * `crash.marker` is written at startup and removed on clean exit, so kills and power
//!   loss are detected on the next start as well.
//! * A zip bundle (no audio, optional PII redaction) that is only ever written to a path the
//!   user picked in a save dialog. Nothing is uploaded.
//!
//! Redaction (`redact_text`) is hand-written (no regex crate) and mirrors
//! `app/diagnostics-bundle.js`; both are tested against `tests/fixtures/redaction-vectors.json`.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::cell::Cell;
use std::collections::VecDeque;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::Manager;

pub const LOG_MAX_BYTES: u64 = 1024 * 1024;
pub const LOG_KEEP_FILES: usize = 5;
pub const LOGS_BUNDLE_CAP: usize = 2 * 1024 * 1024;
pub const BUNDLE_CAP: usize = 20 * 1024 * 1024;
const JSON_PART_CAP: usize = 256 * 1024;
const MAX_LINE_CHARS: usize = 16 * 1024;
const MARKER_NAME: &str = "crash.marker";
const CLIENT_ERRORS_PER_MIN: usize = 20;
const SUMMARY_CAP_CHARS: usize = 5500;

// ------------------------------------------------------------------ time

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// `YYYY-MM-DDTHH:MM:SS.mmmZ`
pub fn iso_from_ms(ms: u64) -> String {
    let base = crate::system_check::iso_from_unix(ms / 1000);
    format!("{}.{:03}Z", base.trim_end_matches('Z'), ms % 1000)
}

// ------------------------------------------------------------------ redaction

const PLACEHOLDERS: [&str; 5] = ["<user>", "<profile>", "<host>", "<serial>", "<email>"];

/// Single-code-point lowercase fold (keeps the char when lowercasing is not 1:1) so that
/// folded strings have the same char count as the original on every platform.
fn fold(c: char) -> char {
    let mut it = c.to_lowercase();
    match (it.next(), it.next()) {
        (Some(l), None) => l,
        _ => c,
    }
}

#[derive(Debug, Clone, Default)]
pub struct RedactCtx {
    /// (folded literal chars, placeholder), longest first.
    literals: Vec<(Vec<char>, &'static str)>,
}

impl RedactCtx {
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers an exact (case-insensitive) literal. Empty / 1-char values are ignored.
    pub fn add(&mut self, value: &str, placeholder: &'static str) {
        let folded: Vec<char> = value.trim().chars().map(fold).collect();
        if folded.len() < 2 || folded.iter().any(|c| c.is_control()) {
            return;
        }
        self.literals.push((folded, placeholder));
        self.literals.sort_by(|a, b| b.0.len().cmp(&a.0.len()));
    }

    pub fn from_parts(user: Option<&str>, profile: Option<&str>, host: Option<&str>, serials: &[String]) -> Self {
        let mut c = Self::new();
        if let Some(p) = profile {
            c.add(p, "<profile>");
        }
        if let Some(u) = user {
            c.add(u, "<user>");
        }
        if let Some(h) = host {
            c.add(h, "<host>");
        }
        for s in serials {
            c.add(s, "<serial>");
        }
        c
    }

    /// User name, profile dir and machine name from the process environment.
    pub fn from_env(serials: &[String]) -> Self {
        let env = |keys: &[&str]| keys.iter().find_map(|k| std::env::var(k).ok()).filter(|v| !v.trim().is_empty());
        let host = env(&["COMPUTERNAME", "HOSTNAME"]).or_else(|| {
            fs::read_to_string("/etc/hostname").ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
        });
        Self::from_parts(
            env(&["USERNAME", "USER", "LOGNAME"]).as_deref(),
            env(&["USERPROFILE", "HOME"]).as_deref(),
            host.as_deref(),
            serials,
        )
    }
}

fn starts_with_placeholder(text: &[char], i: usize) -> Option<usize> {
    if text.get(i) != Some(&'<') {
        return None;
    }
    PLACEHOLDERS.iter().find_map(|p| {
        let pc: Vec<char> = p.chars().collect();
        (text.len() >= i + pc.len() && text[i..i + pc.len()] == pc[..]).then_some(pc.len())
    })
}

fn is_local_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '.' | '_' | '%' | '+' | '-')
}

fn is_domain_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '.' | '-')
}

fn redact_emails(text: &[char]) -> Vec<char> {
    let mut out: Vec<char> = Vec::with_capacity(text.len());
    let mut i = 0;
    while i < text.len() {
        if text[i] == '@' {
            let mut end = i + 1;
            while end < text.len() && is_domain_char(text[end]) {
                end += 1;
            }
            // Trailing punctuation belongs to the sentence, not the address.
            while end > i + 1 && matches!(text[end - 1], '.' | '-') {
                end -= 1;
            }
            let domain = &text[i + 1..end];
            let tld_ok = domain
                .iter()
                .rposition(|&c| c == '.')
                .map(|p| domain.len() - p - 1 >= 2 && domain[p + 1..].iter().all(|c| c.is_alphabetic()))
                .unwrap_or(false);
            let mut ls = out.len();
            while ls > 0 && is_local_char(out[ls - 1]) {
                ls -= 1;
            }
            if tld_ok && ls < out.len() && !domain.is_empty() {
                out.truncate(ls);
                out.extend("<email>".chars());
                i = end;
                continue;
            }
        }
        out.push(text[i]);
        i += 1;
    }
    out
}

fn redact_literals(text: &[char], ctx: &RedactCtx) -> Vec<char> {
    if ctx.literals.is_empty() {
        return text.to_vec();
    }
    let mut out = Vec::with_capacity(text.len());
    let mut i = 0;
    'scan: while i < text.len() {
        if let Some(n) = starts_with_placeholder(text, i) {
            out.extend_from_slice(&text[i..i + n]);
            i += n;
            continue;
        }
        for (lit, ph) in &ctx.literals {
            let n = lit.len();
            if i + n > text.len() || !(0..n).all(|k| fold(text[i + k]) == lit[k]) {
                continue;
            }
            if n < 3 {
                let before = i > 0 && text[i - 1].is_alphanumeric();
                let after = i + n < text.len() && text[i + n].is_alphanumeric();
                if before || after {
                    continue;
                }
            }
            out.extend(ph.chars());
            i += n;
            continue 'scan;
        }
        out.push(text[i]);
        i += 1;
    }
    out
}

fn is_sep(c: char) -> bool {
    c == '\\' || c == '/'
}

/// Characters that end a profile-folder name (Windows-illegal ones, whitespace, quotes, brackets).
fn ends_segment(c: char) -> bool {
    c.is_whitespace() || matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\'' | ',' | ';' | '(' | ')' | '[' | ']' | '{' | '}')
}

fn eq_ci_ascii(text: &[char], i: usize, word: &str) -> bool {
    let w: Vec<char> = word.chars().collect();
    i + w.len() <= text.len() && (0..w.len()).all(|k| text[i + k].to_ascii_lowercase() == w[k])
}

fn redact_paths(text: &[char]) -> Vec<char> {
    let mut out: Vec<char> = Vec::with_capacity(text.len());
    let mut i = 0;
    while i < text.len() {
        // Windows: <drive>:<sep+>Users<sep+><name>
        let mut matched_prefix = None;
        if text[i].is_ascii_alphabetic() && text.get(i + 1) == Some(&':') {
            let mut j = i + 2;
            let s = j;
            while j < text.len() && is_sep(text[j]) && j - s < 4 {
                j += 1;
            }
            if j > s && eq_ci_ascii(text, j, "users") {
                j += 5;
                let s2 = j;
                while j < text.len() && is_sep(text[j]) && j - s2 < 4 {
                    j += 1;
                }
                if j > s2 {
                    matched_prefix = Some(j);
                }
            }
        } else if text[i] == '/' && (i == 0 || matches!(text[i - 1], '"' | '\'' | '=' | '(' | '[' | '{' | ',' | ';' | ':') || text[i - 1].is_whitespace()) {
            // Unix-style homes (/home/<name>, /Users/<name>) for logs from non-Windows builds.
            for word in ["home", "Users"] {
                let w: Vec<char> = word.chars().collect();
                if text.len() > i + 1 + w.len() && text[i + 1..i + 1 + w.len()] == w[..] && text[i + 1 + w.len()] == '/' {
                    matched_prefix = Some(i + 2 + w.len());
                    break;
                }
            }
        }
        if let Some(p) = matched_prefix {
            let mut k = p;
            while k < text.len() && !ends_segment(text[k]) {
                k += 1;
            }
            if k > p {
                out.extend_from_slice(&text[i..p]);
                out.extend("<user>".chars());
                i = k;
                continue;
            }
            // Empty segment: copy the prefix as is (covers already-redacted "<user>").
            out.extend_from_slice(&text[i..p]);
            i = p;
            continue;
        }
        out.push(text[i]);
        i += 1;
    }
    out
}

fn is_serial_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '-'
}

/// After a "serial" / "S/N" keyword (also `serial_number`, `serialNumber`, `serial no.`), the
/// next token of 4+ serial characters containing a digit becomes `<serial>`.
fn redact_serial_tokens(text: &[char]) -> Vec<char> {
    let mut out: Vec<char> = Vec::with_capacity(text.len());
    let mut i = 0;
    while i < text.len() {
        let mut after = None;
        if eq_ci_ascii(text, i, "serial") {
            let mut j = i + 6;
            for w in ["number", "num", "no"] {
                let mut k = j;
                if matches!(text.get(k), Some(' ' | '_' | '-')) {
                    k += 1;
                }
                if eq_ci_ascii(text, k, w) {
                    j = k + w.len();
                    if text.get(j) == Some(&'.') {
                        j += 1;
                    }
                    break;
                }
            }
            // "serialize", "serials" ... are words, not labels.
            if !text.get(j).map(|c| c.is_alphanumeric()).unwrap_or(false) {
                after = Some(j);
            }
        } else if (eq_ci_ascii(text, i, "s/n") || eq_ci_ascii(text, i, "sn"))
            && (i == 0 || !text[i - 1].is_alphanumeric())
        {
            let j = i + if eq_ci_ascii(text, i, "s/n") { 3 } else { 2 };
            if !text.get(j).map(|c| c.is_alphanumeric()).unwrap_or(false) {
                after = Some(j);
            }
        }
        if let Some(mut j) = after {
            out.extend_from_slice(&text[i..j]);
            while j < text.len() && (text[j].is_whitespace() || matches!(text[j], ':' | '=' | '#' | '"' | '\'' | '-' | '.')) {
                out.push(text[j]);
                j += 1;
            }
            let mut k = j;
            while k < text.len() && is_serial_char(text[k]) {
                k += 1;
            }
            let tok = &text[j..k];
            if tok.len() >= 4 && tok.iter().any(|c| c.is_ascii_digit()) {
                out.extend("<serial>".chars());
                j = k;
            }
            i = j;
            continue;
        }
        out.push(text[i]);
        i += 1;
    }
    out
}

/// Best-effort removal of personal information. Order: emails, exact literals (user,
/// profile, host, serials), user-profile paths, serial-number labels. Idempotent.
pub fn redact_text(text: &str, ctx: &RedactCtx) -> String {
    let chars: Vec<char> = text.chars().collect();
    let chars = redact_emails(&chars);
    let chars = redact_literals(&chars, ctx);
    let chars = redact_emails(&chars); // again: a literal next to an address can hide its domain boundary
    let chars = redact_paths(&chars);
    let chars = redact_serial_tokens(&chars);
    chars.into_iter().collect()
}

fn is_serial_key(k: &str) -> bool {
    let l = k.to_lowercase();
    l.contains("serial") || l == "sn" || l == "s/n"
}

/// The value of a field named like a serial number is replaced whatever it looks like.
fn serial_value(v: &Value, ctx: &RedactCtx) -> Value {
    match v {
        Value::String(s) if s.is_empty() => v.clone(),
        Value::String(_) | Value::Number(_) => Value::String("<serial>".into()),
        Value::Array(a) => Value::Array(a.iter().map(|x| serial_value(x, ctx)).collect()),
        other => redact_value(other, ctx),
    }
}

pub fn redact_value(v: &Value, ctx: &RedactCtx) -> Value {
    match v {
        Value::String(s) => Value::String(redact_text(s, ctx)),
        Value::Array(a) => Value::Array(a.iter().map(|x| redact_value(x, ctx)).collect()),
        Value::Object(m) => Value::Object(
            m.iter()
                .map(|(k, x)| (redact_text(k, ctx), if is_serial_key(k) { serial_value(x, ctx) } else { redact_value(x, ctx) }))
                .collect(),
        ),
        other => other.clone(),
    }
}

// ------------------------------------------------------------------ log files

pub fn log_file_name(index: usize) -> String {
    if index == 0 { "deckchek.log".into() } else { format!("deckchek.{index}.log") }
}

fn is_log_file_name(name: &str) -> bool {
    (0..LOG_KEEP_FILES).any(|i| log_file_name(i) == name)
}

/// Replaces control characters (log injection) and caps the length in chars.
pub fn sanitize_log_text(s: &str, max_chars: usize) -> String {
    let mut out = String::with_capacity(s.len().min(max_chars * 2));
    let mut n = 0; // counts output chars, so the cap bounds the result
    for c in s.chars() {
        let piece: String = if c == '\n' || c == '\r' {
            " | ".into()
        } else if c.is_control() {
            " ".into()
        } else {
            c.to_string()
        };
        let w = piece.chars().count();
        if n + w > max_chars {
            out.push('…');
            break;
        }
        out.push_str(&piece);
        n += w;
    }
    out
}

pub fn format_line(ts: &str, level: &str, target: &str, thread: &str, msg: &str) -> String {
    format!("{ts} {level} {target} [{thread}] {}", sanitize_log_text(msg, MAX_LINE_CHARS))
}

pub struct Logger {
    dir: PathBuf,
    max_bytes: u64,
    keep: usize,
    file: Option<File>,
    size: u64,
}

impl Logger {
    pub fn new(dir: &Path, max_bytes: u64, keep: usize) -> Logger {
        let mut l = Logger { dir: dir.to_path_buf(), max_bytes, keep: keep.max(1), file: None, size: 0 };
        l.open_current();
        l
    }

    fn open_current(&mut self) {
        let path = self.dir.join(log_file_name(0));
        self.file = OpenOptions::new().create(true).append(true).open(&path).ok();
        self.size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    }

    fn rotate(&mut self) {
        self.file = None;
        let _ = fs::remove_file(self.dir.join(log_file_name(self.keep - 1)));
        for i in (0..self.keep - 1).rev() {
            let from = self.dir.join(log_file_name(i));
            if from.exists() {
                let _ = fs::rename(&from, self.dir.join(log_file_name(i + 1)));
            }
        }
        self.open_current();
    }

    /// Appends one line (a trailing LF is added). Failures are ignored by design.
    pub fn append(&mut self, line: &str) {
        let len = line.len() as u64 + 1;
        if self.size > 0 && self.size + len > self.max_bytes {
            self.rotate();
        }
        if let Some(f) = self.file.as_mut() {
            let mut buf = Vec::with_capacity(line.len() + 1);
            buf.extend_from_slice(line.as_bytes());
            buf.push(b'\n');
            if f.write_all(&buf).is_ok() {
                self.size += len;
            }
        }
    }
}

// ------------------------------------------------------------------ crash marker

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Marker {
    pub started_at: Option<String>,
    pub pid: u32,
    pub app_version: String,
    pub last_panic: Option<String>,
}

fn write_marker(dir: &Path, m: &Marker) {
    if let Ok(s) = serde_json::to_string(m) {
        let _ = fs::write(dir.join(MARKER_NAME), s);
    }
}

pub fn read_marker(dir: &Path) -> Option<Marker> {
    let path = dir.join(MARKER_NAME);
    if !path.exists() {
        return None;
    }
    // A corrupt marker still means "the last run did not exit cleanly".
    Some(fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default())
}

// ------------------------------------------------------------------ rate limiter

/// Sliding-window limiter (max events per 60 s) that reports how many events were dropped.
pub struct RateLimiter {
    max: usize,
    window_ms: u64,
    stamps: VecDeque<u64>,
    dropped: u64,
}

impl RateLimiter {
    pub fn new(max: usize, window_ms: u64) -> Self {
        Self { max, window_ms, stamps: VecDeque::new(), dropped: 0 }
    }

    /// `(allowed, dropped_since_last_allowed)`
    pub fn check(&mut self, now_ms: u64) -> (bool, u64) {
        while self.stamps.front().is_some_and(|&t| now_ms.saturating_sub(t) >= self.window_ms) {
            self.stamps.pop_front();
        }
        if self.stamps.len() >= self.max {
            self.dropped += 1;
            return (false, 0);
        }
        self.stamps.push_back(now_ms);
        (true, std::mem::take(&mut self.dropped))
    }
}

// ------------------------------------------------------------------ state

struct Inner {
    dir: PathBuf,
    app_version: String,
    logger: Mutex<Option<Logger>>,
    marker: Mutex<Marker>,
    previous: Mutex<Option<Marker>>,
    limiter: Mutex<RateLimiter>,
    enabled: AtomicBool,
}

#[derive(Clone)]
pub struct DiagState(Arc<Inner>);

thread_local! {
    static IN_HOOK: Cell<bool> = const { Cell::new(false) };
}

impl DiagState {
    /// Opens the log in `dir`, detects a stale marker from the previous run and writes a new one.
    pub fn open(dir: &Path, app_version: &str) -> DiagState {
        let _ = fs::create_dir_all(dir);
        let previous = read_marker(dir);
        let marker = Marker {
            started_at: Some(iso_from_ms(now_ms())),
            pid: std::process::id(),
            app_version: app_version.to_string(),
            last_panic: None,
        };
        write_marker(dir, &marker);
        let state = DiagState(Arc::new(Inner {
            dir: dir.to_path_buf(),
            app_version: app_version.to_string(),
            logger: Mutex::new(Some(Logger::new(dir, LOG_MAX_BYTES, LOG_KEEP_FILES))),
            marker: Mutex::new(marker),
            previous: Mutex::new(previous.clone()),
            limiter: Mutex::new(RateLimiter::new(CLIENT_ERRORS_PER_MIN, 60_000)),
            enabled: AtomicBool::new(true),
        }));
        let note = if previous.is_some() { "previous run did not exit cleanly" } else { "previous run exited cleanly" };
        state.log("INFO", "app", &format!("start version={app_version} pid={} ({note})", std::process::id()));
        state
    }

    pub fn dir(&self) -> &Path {
        &self.0.dir
    }

    pub fn log(&self, level: &str, target: &str, msg: &str) {
        let thread = std::thread::current();
        let line = format_line(&iso_from_ms(now_ms()), level, target, thread.name().unwrap_or("?"), msg);
        if let Ok(mut g) = self.0.logger.lock() {
            if let Some(l) = g.as_mut() {
                l.append(&line);
            }
        }
    }

    /// Panic path: never blocks, never allocates unbounded memory.
    fn log_try(&self, line: &str, last_panic: &str) {
        if let Ok(mut g) = self.0.logger.try_lock() {
            if let Some(l) = g.as_mut() {
                l.append(line);
            }
        }
        if let Ok(mut m) = self.0.marker.try_lock() {
            m.last_panic = Some(last_panic.to_string());
            write_marker(&self.0.dir, &m);
        }
    }

    /// Removes the marker (normal quit). Safe to call more than once.
    pub fn clean_exit(&self) {
        self.log("INFO", "app", "exit clean");
        let _ = fs::remove_file(self.0.dir.join(MARKER_NAME));
    }

    /// Makes the panic hook a pass-through (used by tests; the hook cannot be uninstalled).
    #[cfg(test)]
    pub fn disable(&self) {
        self.0.enabled.store(false, Ordering::SeqCst);
    }

    pub fn crashed_last_run(&self) -> Option<Marker> {
        self.0.previous.lock().ok().and_then(|g| g.clone())
    }

    pub fn ack_crash(&self) {
        if let Ok(mut g) = self.0.previous.lock() {
            *g = None;
        }
    }

    pub fn client_error(&self, e: &ClientError, now: u64) {
        let (allowed, dropped) = self.0.limiter.lock().map(|mut l| l.check(now)).unwrap_or((true, 0));
        if dropped > 0 {
            self.log("WARN", "js", &format!("rate limit: dropped {dropped} client error(s)"));
        }
        if !allowed {
            return;
        }
        self.log("ERROR", "js", &e.to_message());
    }
}

pub fn panic_message(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "non-string panic payload".to_string()
    }
}

/// Installs a panic hook (chained to the previous one). Do NOT set `panic = "abort"` in release.
///
/// Output is silenced before anything slow happens (backtrace symbolisation,
/// log I/O), whatever order the hooks were installed in (BUG-03).
pub fn install_panic_hook(state: &DiagState) {
    let st = state.clone();
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        crate::audio_out::emergency_silence();
        if st.0.enabled.load(Ordering::SeqCst) && !IN_HOOK.with(|c| c.replace(true)) {
            let thread = std::thread::current();
            let loc = info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_else(|| "unknown".into());
            let msg = sanitize_log_text(&panic_message(info.payload()), 2000);
            let bt = std::backtrace::Backtrace::force_capture().to_string();
            let full = format!("panic at {loc}: {msg} | backtrace: {}", sanitize_log_text(&bt, 8000));
            let line = format_line(&iso_from_ms(now_ms()), "ERROR", "panic", thread.name().unwrap_or("?"), &full);
            st.log_try(&line, &format!("{msg} ({loc})"));
            IN_HOOK.with(|c| c.set(false));
        }
        prev(info);
    }));
}

// ------------------------------------------------------------------ client errors

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ClientError {
    pub kind: Option<String>,
    pub message: Option<String>,
    pub source: Option<String>,
    pub line: Option<i64>,
    pub col: Option<i64>,
    pub stack: Option<String>,
    pub screen: Option<String>,
}

impl ClientError {
    /// One sanitized, length-capped (under 4 KiB) log message.
    pub fn to_message(&self) -> String {
        let kind = match self.kind.as_deref() {
            Some("unhandledrejection") => "unhandledrejection",
            _ => "error",
        };
        let f = |o: &Option<String>, n: usize| sanitize_log_text(o.as_deref().unwrap_or(""), n);
        let num = |o: Option<i64>| o.map(|n| n.to_string()).unwrap_or_else(|| "?".into());
        let mut s = format!("{kind}: {} @ {}:{}:{}", f(&self.message, 1500), f(&self.source, 400), num(self.line), num(self.col));
        if self.screen.is_some() {
            s.push_str(&format!(" screen={}", f(&self.screen, 64)));
        }
        if self.stack.as_deref().is_some_and(|x| !x.is_empty()) {
            s.push_str(&format!(" stack={}", f(&self.stack, 1800)));
        }
        s
    }
}

// ------------------------------------------------------------------ bundle

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleOpts {
    #[serde(default = "yes")]
    pub redact: bool,
    #[serde(default)]
    pub run_count: u32,
    /// Values only the webview knows (settings, WebView2 version, System Health findings).
    #[serde(default)]
    pub context: Option<ClientContext>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ClientContext {
    pub system: Option<Value>,
    pub settings: Option<Value>,
    pub system_health: Option<Value>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PartInfo {
    pub name: String,
    pub size_bytes: usize,
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

pub struct PartData {
    pub info: PartInfo,
    pub bytes: Vec<u8>,
}

fn ok_part(name: &str, bytes: Vec<u8>) -> PartData {
    PartData { info: PartInfo { name: name.into(), size_bytes: bytes.len(), status: "ok", note: None }, bytes }
}

fn missing_part(name: &str, status: &'static str, note: &str) -> PartData {
    PartData { info: PartInfo { name: name.into(), size_bytes: 0, status, note: Some(note.into()) }, bytes: Vec::new() }
}

pub struct BundleInputs<'a> {
    pub dir: &'a Path,
    pub app_version: &'a str,
    pub conn: Option<&'a rusqlite::Connection>,
    pub ctx: &'a RedactCtx,
    pub opts: &'a BundleOpts,
    pub previous_marker: Option<Marker>,
    pub now_iso: String,
}

fn pretty(v: &Value) -> Vec<u8> {
    serde_json::to_vec_pretty(v).unwrap_or_default()
}

fn json_part(name: &str, v: &Value, inp: &BundleInputs) -> PartData {
    let v = if inp.opts.redact { redact_value(v, inp.ctx) } else { v.clone() };
    let bytes = pretty(&v);
    if bytes.len() > JSON_PART_CAP {
        return missing_part(name, "skipped", "too large");
    }
    ok_part(name, bytes)
}

fn text_part(name: &str, text: &str, inp: &BundleInputs) -> PartData {
    let t = if inp.opts.redact { redact_text(text, inp.ctx) } else { text.to_string() };
    ok_part(name, t.into_bytes())
}

fn system_json(inp: &BundleInputs) -> Value {
    let client = inp.opts.context.as_ref().and_then(|c| c.system.as_ref());
    let pick = |k: &str| client.and_then(|c| c.get(k)).filter(|v| v.is_string() || v.is_number()).cloned().unwrap_or(Value::Null);
    let os_version = client.and_then(|c| c.get("os")).and_then(|o| o.get("version")).filter(|v| v.is_string()).cloned().unwrap_or(Value::Null);
    json!({
        "os": { "name": std::env::consts::OS, "version": os_version, "arch": std::env::consts::ARCH },
        "webview2Version": pick("webview2Version"),
        "locale": pick("locale"),
        "cpuCount": std::thread::available_parallelism().map(|n| n.get()).unwrap_or(0),
        "memoryMb": pick("memoryMb"),
    })
}

fn schema_json(conn: &rusqlite::Connection) -> Result<Value, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT version FROM schema_migration WHERE version < 1000 ORDER BY version")?;
    let applied = stmt.query_map([], |r| r.get::<_, i64>(0))?.collect::<Result<Vec<_>, _>>()?;
    Ok(json!({ "schemaVersion": applied.iter().max().copied().unwrap_or(0), "applied": applied }))
}

fn runs_json(conn: &rusqlite::Connection, n: u32) -> Result<Value, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, session_type, context_profile, started_at, status, session_quality
         FROM session ORDER BY started_at DESC, id LIMIT ?1",
    )?;
    let rows = stmt
        .query_map([n as i64], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, Option<f64>>(5)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut find = conn.prepare("SELECT summary FROM hypothesis WHERE session_id = ?1 ORDER BY created_at, id LIMIT 20")?;
    let mut runs = Vec::new();
    for (id, kind, test, started, status, quality) in rows {
        let titles = find.query_map([&id], |r| r.get::<_, String>(0))?.collect::<Result<Vec<_>, _>>()?;
        runs.push(json!({
            "id": id, "sessionType": kind, "test": test, "startedAt": started, "status": status,
            "score": quality.map(|q| (q * 1000.0).round() / 10.0),
            "findings": titles.iter().map(|t| sanitize_log_text(t, 200)).collect::<Vec<_>>(),
        }));
    }
    Ok(json!({ "runs": runs }))
}

/// A tail read starts mid-line: drop everything up to and including the first LF.
fn drop_partial_first_line(mut bytes: Vec<u8>) -> Vec<u8> {
    if let Some(p) = bytes.iter().position(|&b| b == b'\n') {
        bytes.drain(..=p);
    }
    bytes
}

fn log_parts(inp: &BundleInputs) -> (Vec<PartData>, usize, usize) {
    let mut parts = Vec::new();
    let mut budget = LOGS_BUNDLE_CAP;
    let mut found = 0usize;
    let mut found_bytes = 0usize;
    for i in 0..LOG_KEEP_FILES {
        let name = log_file_name(i);
        let Ok(mut f) = File::open(inp.dir.join(&name)) else { continue };
        let len = f.metadata().map(|m| m.len()).unwrap_or(0) as usize;
        found += 1;
        found_bytes += len;
        let want = len.min(budget);
        if want == 0 {
            parts.push(missing_part(&format!("logs/{name}"), "skipped", if len == 0 { "empty" } else { "size cap reached" }));
            continue;
        }
        let mut buf = Vec::with_capacity(want);
        if f.seek(SeekFrom::Start((len - want) as u64)).is_err() || f.take(want as u64).read_to_end(&mut buf).is_err() {
            parts.push(missing_part(&format!("logs/{name}"), "error", "could not read"));
            continue;
        }
        let buf = if len > want { drop_partial_first_line(buf) } else { buf };
        let text = String::from_utf8_lossy(&buf).into_owned();
        let text = if inp.opts.redact { redact_text(&text, inp.ctx) } else { text };
        budget = budget.saturating_sub(buf.len());
        let mut p = ok_part(&format!("logs/{name}"), text.into_bytes());
        if len > want {
            p.info.note = Some("truncated to the most recent lines".into());
        }
        parts.push(p);
    }
    (parts, found, found_bytes)
}

fn build_summary(inp: &BundleInputs, schema: Option<&Value>, runs: Option<&Value>, log_files: usize, log_bytes: usize) -> String {
    let mut s = String::new();
    s.push_str("DeckChek diagnostics summary\n");
    s.push_str(&format!("App version: {}\n", inp.app_version));
    s.push_str(&format!("OS: {} ({})\n", std::env::consts::OS, std::env::consts::ARCH));
    s.push_str(&format!("Created: {}\n", inp.now_iso));
    s.push_str(&format!("Personal info redacted: {}\n", if inp.opts.redact { "yes (best effort)" } else { "no" }));
    match &inp.previous_marker {
        Some(m) => {
            s.push_str(&format!("Previous run closed unexpectedly: yes (started {})\n", m.started_at.as_deref().unwrap_or("unknown")));
            if let Some(p) = &m.last_panic {
                s.push_str(&format!("Last panic: {}\n", sanitize_log_text(p, 500)));
            }
        }
        None => s.push_str("Previous run closed unexpectedly: no\n"),
    }
    if let Some(v) = schema.and_then(|v| v.get("schemaVersion")).and_then(|v| v.as_i64()) {
        s.push_str(&format!("Database schema version: {v}\n"));
    }
    if let Some(r) = runs.and_then(|v| v.get("runs")).and_then(|v| v.as_array()) {
        s.push_str(&format!("Runs included: {}\n", r.len()));
        if let Some(l) = r.first() {
            s.push_str(&format!(
                "Latest run: {} {} status={} score={}\n",
                l["startedAt"].as_str().unwrap_or("?"),
                l["test"].as_str().unwrap_or("-"),
                l["status"].as_str().unwrap_or("?"),
                l["score"].as_f64().map(|x| x.to_string()).unwrap_or_else(|| "-".into()),
            ));
        }
    }
    if log_files == 0 {
        s.push_str("Log files: none found (nothing has been logged yet)\n");
    } else {
        s.push_str(&format!("Log files: {log_files} ({} KiB)\n", log_bytes / 1024));
    }
    s.push_str("\nThis bundle contains no audio. Nothing is sent automatically.\n");
    sanitize_multiline(&s, SUMMARY_CAP_CHARS)
}

fn sanitize_multiline(s: &str, max: usize) -> String {
    s.chars().take(max).filter(|c| *c == '\n' || !c.is_control()).collect()
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

/// Builds every part of the bundle; `manifest.json` is first. Used by both preview and create.
pub fn build_parts(inp: &BundleInputs) -> Vec<PartData> {
    let mut parts: Vec<PartData> = Vec::new();
    let ctx = inp.opts.context.as_ref();

    let (schema, schema_part) = match inp.conn {
        None => (None, missing_part("schema.json", "skipped", "database not available")),
        Some(c) => match schema_json(c) {
            Ok(v) => (Some(v.clone()), json_part("schema.json", &v, inp)),
            Err(_) => (None, missing_part("schema.json", "error", "schema query failed")),
        },
    };
    let n = if inp.opts.run_count == 0 { 1 } else { inp.opts.run_count.min(50) };
    let (runs, runs_part) = match inp.conn {
        None => (None, missing_part("runs-summary.json", "skipped", "database not available")),
        Some(c) => match runs_json(c, n) {
            Ok(v) => (Some(v.clone()), json_part("runs-summary.json", &v, inp)),
            Err(_) => (None, missing_part("runs-summary.json", "error", "run query failed")),
        },
    };
    let (logs, log_files, log_bytes) = log_parts(inp);

    let summary = build_summary(inp, schema.as_ref(), runs.as_ref(), log_files, log_bytes);
    parts.push(text_part("summary.txt", &summary, inp));
    parts.push(json_part("system.json", &system_json(inp), inp));
    parts.push(match ctx.and_then(|c| c.settings.as_ref()) {
        Some(v) => json_part("settings.json", v, inp),
        None => missing_part("settings.json", "skipped", "settings not provided"),
    });
    parts.push(schema_part);
    parts.push(runs_part);
    parts.push(match ctx.and_then(|c| c.system_health.as_ref()) {
        Some(v) => json_part("system-health.json", v, inp),
        None => missing_part("system-health.json", "skipped", "System Health scan unsupported or not run"),
    });
    parts.extend(logs);

    // Whole-bundle cap: drop the oldest logs first.
    let mut total: usize = parts.iter().map(|p| p.bytes.len()).sum();
    while total > BUNDLE_CAP {
        match parts.iter().rposition(|p| p.info.name.starts_with("logs/") && p.info.status == "ok") {
            Some(i) => {
                total -= parts[i].bytes.len();
                let name = parts[i].info.name.clone();
                parts[i] = missing_part(&name, "skipped", "bundle size cap");
            }
            None => break,
        }
    }

    let manifest = json!({
        "bundleVersion": 1,
        "createdAt": inp.now_iso,
        "appVersion": inp.app_version,
        "redacted": inp.opts.redact,
        "parts": parts.iter().filter(|p| p.info.status == "ok")
            .map(|p| json!({ "name": p.info.name, "sha256": sha256_hex(&p.bytes), "bytes": p.bytes.len() }))
            .collect::<Vec<_>>(),
    });
    let mut all = vec![ok_part("manifest.json", pretty(&manifest))];
    all.extend(parts);
    all
}

/// Writes only `status == "ok"` parts. Entry names are fixed constants or our own log file names.
pub fn write_zip(parts: &[PartData], dest: &Path) -> Result<u64, String> {
    use zip::write::SimpleFileOptions;
    let file = File::create(dest).map_err(|e| format!("write failed: {:?}", e.kind()))?;
    let mut zw = zip::ZipWriter::new(file);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let result = (|| -> Result<(), String> {
        for p in parts.iter().filter(|p| p.info.status == "ok") {
            let n = &p.info.name;
            let fixed = matches!(n.as_str(), "manifest.json" | "summary.txt" | "system.json" | "settings.json" | "schema.json" | "runs-summary.json" | "system-health.json")
                || n.strip_prefix("logs/").is_some_and(is_log_file_name);
            if !fixed {
                return Err("unexpected bundle entry".into());
            }
            zw.start_file(n.as_str(), opts).map_err(|e| e.to_string())?;
            zw.write_all(&p.bytes).map_err(|e| format!("write failed: {:?}", e.kind()))?;
        }
        zw.finish().map(|_| ()).map_err(|e| e.to_string())
    })();
    match result {
        Ok(()) => Ok(fs::metadata(dest).map(|m| m.len()).unwrap_or(0)),
        Err(e) => {
            let _ = fs::remove_file(dest);
            Err(e)
        }
    }
}

// ------------------------------------------------------------------ commands

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogFileInfo {
    name: String,
    size_bytes: u64,
    modified_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    crashed_last_run: bool,
    marker_at: Option<String>,
    last_panic: Option<String>,
    log_dir: String,
    log_files: Vec<LogFileInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    summary_text: String,
    parts: Vec<PartInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleResult {
    path: String,
    size_bytes: u64,
    parts: Vec<PartInfo>,
}

/// A read-only connection that holds the [`crate::db::gate`] read guard for its
/// lifetime, so a restore (which takes the write guard) never swaps the file
/// while the bundle reads it (BUG-07). The connection closes before the guard drops.
struct GatedReadOnly {
    conn: rusqlite::Connection,
    _gate: std::sync::RwLockReadGuard<'static, ()>,
}

impl std::ops::Deref for GatedReadOnly {
    type Target = rusqlite::Connection;
    fn deref(&self) -> &rusqlite::Connection {
        &self.conn
    }
}

fn open_db_readonly_at(path: &Path) -> Option<GatedReadOnly> {
    let gate = crate::db::gate().read().unwrap_or_else(std::sync::PoisonError::into_inner);
    if !path.is_file() {
        return None;
    }
    let conn = rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    Some(GatedReadOnly { conn, _gate: gate })
}

fn open_db_readonly(app: &tauri::AppHandle) -> Option<GatedReadOnly> {
    open_db_readonly_at(&app.path().app_data_dir().ok()?.join("deckchek.sqlite3"))
}

fn serials_from(conn: Option<&rusqlite::Connection>) -> Vec<String> {
    let Some(c) = conn else { return Vec::new() };
    let Ok(mut stmt) = c.prepare("SELECT serial_number FROM asset WHERE serial_number IS NOT NULL AND trim(serial_number) <> ''") else { return Vec::new() };
    stmt.query_map([], |r| r.get::<_, String>(0)).map(|rows| rows.flatten().collect()).unwrap_or_default()
}

fn run_parts(app: &tauri::AppHandle, state: &DiagState, opts: &BundleOpts) -> Vec<PartData> {
    let conn = open_db_readonly(app);
    let ctx = RedactCtx::from_env(&serials_from(conn.as_deref()));
    let inp = BundleInputs {
        dir: state.dir(),
        app_version: &state.0.app_version,
        conn: conn.as_deref(),
        ctx: &ctx,
        opts,
        previous_marker: state.crashed_last_run(),
        now_iso: iso_from_ms(now_ms()),
    };
    build_parts(&inp)
}

/// Call from `lib.rs` setup: creates the log dir, installs the panic hook and manages the state.
/// The crash marker is removed from `on_run_event` when the app exits (`RunEvent::Exit`).
pub fn setup(app: &mut tauri::App) {
    let dir = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("deckchek-logs"));
    let state = DiagState::open(&dir, &app.package_info().version.to_string());
    install_panic_hook(&state);
    app.manage(state);
}

/// True for the event that means a normal quit: the event loop is ending (FS-02 AC-4).
fn is_clean_exit_event(ev: &tauri::RunEvent) -> bool {
    matches!(ev, tauri::RunEvent::Exit)
}

/// Call from the `.run(|app, event| ..)` callback in `lib.rs`.
pub fn on_run_event(app: &tauri::AppHandle, ev: &tauri::RunEvent) {
    if is_clean_exit_event(ev) {
        if let Some(state) = app.try_state::<DiagState>() {
            state.clean_exit();
        }
    }
}

#[tauri::command]
pub fn log_client_error(state: tauri::State<'_, DiagState>, entry: ClientError) {
    state.client_error(&entry, now_ms());
}

#[tauri::command]
pub fn diagnostics_status(state: tauri::State<'_, DiagState>) -> Status {
    let prev = state.crashed_last_run();
    let ctx = RedactCtx::from_env(&[]);
    let mut files = Vec::new();
    for i in 0..LOG_KEEP_FILES {
        let name = log_file_name(i);
        if let Ok(m) = fs::metadata(state.dir().join(&name)) {
            let modified = m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| iso_from_ms(d.as_millis() as u64));
            files.push(LogFileInfo { name, size_bytes: m.len(), modified_at: modified });
        }
    }
    Status {
        crashed_last_run: prev.is_some(),
        marker_at: prev.as_ref().and_then(|m| m.started_at.clone()),
        last_panic: prev.and_then(|m| m.last_panic).map(|p| redact_text(&p, &ctx)),
        log_dir: state.dir().to_string_lossy().into_owned(),
        log_files: files,
    }
}

#[tauri::command]
pub fn diagnostics_ack_crash(state: tauri::State<'_, DiagState>) {
    state.ack_crash();
}

#[tauri::command]
pub fn diagnostics_preview(app: tauri::AppHandle, state: tauri::State<'_, DiagState>, opts: BundleOpts) -> PreviewResult {
    let parts = run_parts(&app, &state, &opts);
    let summary_text = parts.iter().find(|p| p.info.name == "summary.txt").map(|p| String::from_utf8_lossy(&p.bytes).into_owned()).unwrap_or_default();
    PreviewResult { summary_text, parts: parts.into_iter().map(|p| p.info).collect() }
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn diagnostics_create_bundle(app: tauri::AppHandle, state: tauri::State<'_, DiagState>, destPath: String, opts: BundleOpts) -> Result<BundleResult, String> {
    let dest = crate::userfiles::validate_save_path(&destPath, &["zip"]).map_err(|e| format!("{}: {}", e.code(), e))?;
    let parts = run_parts(&app, &state, &opts);
    let size = write_zip(&parts, &dest)?;
    crate::userfiles::record_written(&dest);
    state.log("INFO", "diagnostics", &format!("bundle written ({size} bytes, redact={})", opts.redact));
    Ok(BundleResult { path: dest.to_string_lossy().into_owned(), size_bytes: size, parts: parts.into_iter().map(|p| p.info).collect() })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("deckchek-diag-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn ctx_from_json(c: &Value) -> RedactCtx {
        let serials: Vec<String> = c["serials"].as_array().map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect()).unwrap_or_default();
        RedactCtx::from_parts(c["user"].as_str(), c["profile"].as_str(), c["host"].as_str(), &serials)
    }

    // ---- redaction

    #[test]
    fn shared_redaction_vectors_match_the_js_implementation() {
        let vectors: Vec<Value> = serde_json::from_str(include_str!("../../tests/fixtures/redaction-vectors.json")).unwrap();
        assert!(vectors.len() >= 15);
        for v in vectors {
            let ctx = ctx_from_json(&v["ctx"]);
            let input = v["input"].as_str().unwrap();
            let expected = v["expected"].as_str().unwrap();
            assert_eq!(redact_text(input, &ctx), expected, "vector {}", v["name"]);
            assert_eq!(redact_text(expected, &ctx), expected, "idempotent {}", v["name"]);
        }
    }

    struct Lcg(u32);
    impl Lcg {
        fn next(&mut self) -> u32 {
            self.0 = self.0.wrapping_mul(1664525).wrapping_add(1013904223);
            self.0
        }
        fn below(&mut self, n: usize) -> usize {
            (self.next() as usize >> 8) % n
        }
        fn pick<'a>(&mut self, a: &[&'a str]) -> &'a str {
            a[self.below(a.len())]
        }
        fn case(&mut self, s: &str) -> String {
            s.chars().map(|c| if self.next() & 0x100 != 0 { c.to_uppercase().next().unwrap() } else { c.to_lowercase().next().unwrap() }).collect()
        }
    }

    #[test]
    fn fuzz_no_seeded_secret_survives_and_output_is_idempotent() {
        let mut r = Lcg(0xdec4c3);
        let noise = ["", " ", "\n", "\\", "/", "\"", "'", ":", "abc", "Users", "<", ">", "@", ".", "-", "_", "😀", "é", "serial", "S/N", "{", "}", "COM3", "1234", "x\ty"];
        let (user, host) = ("zqxjordan", "zqxhost-77");
        let serials = ["zqx00ab9917", "ZQXSN-424242"];
        let ctx = RedactCtx::from_parts(Some(user), Some("C:\\Users\\zqxjordan"), Some(host), &serials.map(String::from));
        for _ in 0..1500 {
            let mut parts: Vec<String> = Vec::new();
            for _ in 0..1 + r.below(8) {
                if r.below(2) == 0 {
                    parts.push(r.pick(&noise).to_string());
                    continue;
                }
                let s = match r.below(7) {
                    0 => r.case(user),
                    1 => format!("C:\\Users\\{}\\AppData", r.case(user)),
                    2 => format!("{}:{}Users{}zqx{}name{}", r.pick(&["c", "D", "E"]), r.pick(&["\\", "/", "\\\\"]), r.pick(&["\\", "/", "\\\\"]), r.below(1_000_000), r.pick(&["\\", "/", " ", "\""])),
                    3 => r.case(host),
                    4 => {
                        let k = r.below(2);
                        r.case(serials[k])
                    }
                    5 => format!("zqx{}@{}", r.below(100_000), r.pick(&["example.com", "mail.example.co.uk"])),
                    _ => format!("{}{}ZQ{}", r.pick(&["serial", "Serial Number", "S/N", "serial_number"]), r.pick(&[": ", "=", " ", "\":\""]), r.below(100_000_000)),
                };
                parts.push(s);
            }
            let input = parts.join(r.pick(&[" ", "\n", " | "]));
            let out = redact_text(&input, &ctx);
            let low = out.to_lowercase();
            for lit in [user, host, serials[0], serials[1]] {
                assert!(!low.contains(&lit.to_lowercase()), "leaked {lit} in {out:?} from {input:?}");
            }
            assert!(!low.contains("users\\zqx") && !low.contains("users/zqx") && !low.contains("users\\\\zqx"), "profile name left: {out:?}");
            assert!(!low.contains("@example.com") && !low.contains("@mail.example"), "email left: {out:?}");
            assert_eq!(redact_text(&out, &ctx), out, "not idempotent for {input:?}");
        }
        for _ in 0..300 {
            let words = ["The", "deck", "capture", "ok", "12.5 dB", "Rane", "MK2", "-3", "C:\\Program Files\\DeckChek", "wow & flutter"];
            let s = (0..12).map(|_| r.pick(&words)).collect::<Vec<_>>().join(" ");
            assert_eq!(redact_text(&s, &ctx), s);
        }
    }

    #[test]
    fn redact_value_replaces_values_of_serial_fields_and_keeps_json_valid() {
        let ctx = RedactCtx::from_parts(Some("zed99"), None, None, &[]);
        let v = json!({"a": ["C:\\Users\\zed99\\x", {"serial_number": "ZZ12345678", "serialNo": 5, "n": 4, "ok": true}], "zed99": null});
        let out = redact_value(&v, &ctx);
        assert_eq!(out, json!({"a": ["C:\\Users\\<user>\\x", {"serial_number": "<serial>", "serialNo": "<serial>", "n": 4, "ok": true}], "<user>": null}));
    }

    // ---- logger / rotation (AC-8)

    #[test]
    fn rotation_keeps_five_files_and_deletes_the_oldest() {
        let dir = tmp("rotate");
        let mut l = Logger::new(&dir, 100, 5);
        for i in 0..60 {
            l.append(&format!("line-{i:03}-{}", "x".repeat(20)));
        }
        let names: Vec<_> = (0..7).map(|i| dir.join(log_file_name(i)).exists()).collect();
        assert_eq!(names, vec![true, true, true, true, true, false, false]);
        for i in 0..5 {
            assert!(fs::metadata(dir.join(log_file_name(i))).unwrap().len() <= 100);
        }
        let all: String = (0..5).map(|i| fs::read_to_string(dir.join(log_file_name(i))).unwrap()).collect();
        assert!(!all.contains("line-000-"), "oldest content must be gone");
        assert!(all.contains("line-059-"));
        // newest lines are in deckchek.log, older ones in higher indexes
        let newest = fs::read_to_string(dir.join("deckchek.log")).unwrap();
        let oldest = fs::read_to_string(dir.join("deckchek.4.log")).unwrap();
        assert!(newest.contains("line-059-") && !oldest.contains("line-059-"));
    }

    #[test]
    fn rotation_boundary_exactly_at_the_limit_does_not_rotate() {
        let dir = tmp("boundary");
        let mut l = Logger::new(&dir, 100, 5);
        l.append(&"a".repeat(49)); // 50 bytes with LF
        l.append(&"b".repeat(49)); // 100 bytes: fits exactly
        assert!(!dir.join("deckchek.1.log").exists());
        l.append("c"); // 102 > 100: rotates
        assert!(dir.join("deckchek.1.log").exists());
        assert_eq!(fs::read_to_string(dir.join("deckchek.log")).unwrap(), "c\n");
    }

    #[test]
    fn log_line_format_and_injection_safety() {
        let line = format_line("2026-10-10T12:34:56.789Z", "ERROR", "js", "main", "a\nINFO fake line\r\x07");
        assert_eq!(line, "2026-10-10T12:34:56.789Z ERROR js [main] a | INFO fake line |  ");
        assert!(!line.contains('\n'));
        assert_eq!(iso_from_ms(1_760_099_696_789), "2025-10-10T12:34:56.789Z");
        assert!(sanitize_log_text(&"é".repeat(100), 10).chars().count() <= 11);
    }

    // ---- marker lifecycle (AC-4)

    #[test]
    fn marker_is_written_at_start_detected_when_stale_and_removed_on_clean_exit() {
        let dir = tmp("marker");
        let a = DiagState::open(&dir, "0.0.5");
        assert!(a.crashed_last_run().is_none());
        let m = read_marker(&dir).expect("marker exists while running");
        assert_eq!(m.app_version, "0.0.5");
        assert_eq!(m.pid, std::process::id());
        // killed: no clean_exit, next start sees the stale marker
        let b = DiagState::open(&dir, "0.0.5");
        let prev = b.crashed_last_run().expect("stale marker detected");
        assert!(prev.started_at.is_some());
        assert!(read_marker(&dir).is_some(), "fresh marker for the new run");
        b.ack_crash();
        assert!(b.crashed_last_run().is_none());
        b.clean_exit();
        assert!(read_marker(&dir).is_none(), "removed on normal quit");
        b.clean_exit(); // idempotent
        let c = DiagState::open(&dir, "0.0.5");
        assert!(c.crashed_last_run().is_none());
        c.clean_exit();
        // corrupt marker still counts as a crash
        fs::write(dir.join(MARKER_NAME), "{not json").unwrap();
        assert!(DiagState::open(&dir, "0.0.5").crashed_last_run().is_some());
    }

    // ---- panic hook (AC-1)

    /// BUG-07: the bundle's read-only connection holds the DB gate, so a
    /// restore (write guard) waits for it instead of swapping the file under it.
    #[test]
    fn bundle_db_connection_holds_the_restore_gate() {
        let dir = tmp("gate");
        let path = dir.join("deckchek.sqlite3");
        rusqlite::Connection::open(&path).unwrap().execute_batch("CREATE TABLE asset (serial_number TEXT); INSERT INTO asset VALUES ('SER-1');").unwrap();
        let conn = open_db_readonly_at(&path).expect("opens");
        assert!(crate::db::gate().try_write().is_err(), "restore must wait while the bundle reads");
        assert_eq!(serials_from(Some(&conn)), vec!["SER-1".to_string()]);
        drop(conn);
        assert!(open_db_readonly_at(&dir.join("missing.sqlite3")).is_none());
    }

    #[test]
    fn only_run_event_exit_counts_as_a_clean_exit() {
        assert!(is_clean_exit_event(&tauri::RunEvent::Exit));
        assert!(!is_clean_exit_event(&tauri::RunEvent::Ready));
        assert!(!is_clean_exit_event(&tauri::RunEvent::MainEventsCleared));
    }

    #[test]
    fn panic_on_any_thread_is_logged_and_marker_records_it() {
        let dir = tmp("panic");
        let st = DiagState::open(&dir, "0.0.5");
        let output = crate::audio_out::output_group();
        install_panic_hook(&st);
        let h = std::thread::Builder::new().name("worker-xyz".into()).spawn(|| {
            panic!("kaboom\nsecond line");
        }).unwrap();
        assert!(h.join().is_err());
        st.disable();
        // BUG-03: the logging hook silences output first, whatever the hook order.
        assert!(output.is_killed());
        let log = fs::read_to_string(dir.join("deckchek.log")).unwrap();
        let line = log.lines().find(|l| l.contains(" ERROR panic ")).expect("panic line");
        assert!(line.contains("[worker-xyz]"), "{line}");
        assert!(line.contains("kaboom | second line"), "{line}");
        assert!(line.contains("diagnostics.rs:"), "location: {line}");
        assert!(line.contains("backtrace:"), "{line}");
        let ts = line.split(' ').next().unwrap();
        assert!(ts.ends_with('Z') && ts.contains('T'));
        let m = read_marker(&dir).expect("marker exists after panic");
        assert!(m.last_panic.unwrap().contains("kaboom"));
        // panic payloads of other types
        assert_eq!(panic_message(&42u8), "non-string panic payload");
    }

    // ---- client errors (AC-2)

    #[test]
    fn rate_limiter_allows_20_per_minute_and_reports_drops() {
        let mut l = RateLimiter::new(20, 60_000);
        let allowed = (0..25).filter(|i| l.check(1000 + i).0).count();
        assert_eq!(allowed, 20);
        assert_eq!(l.check(60_999), (false, 0));
        assert_eq!(l.check(61_000), (true, 6));
        assert_eq!(l.check(61_001), (true, 0));
    }

    #[test]
    fn client_errors_write_error_js_lines_rate_limited() {
        let dir = tmp("client");
        let st = DiagState::open(&dir, "0.0.5");
        for i in 0..25u64 {
            let e = ClientError { kind: Some("unhandledrejection".into()), message: Some(format!("bad {i}\nINFO forged")), source: Some("app.js".into()), line: Some(3), col: Some(9), stack: Some("a\nb".into()), screen: Some("quick".into()) };
            st.client_error(&e, 5_000 + i);
        }
        st.client_error(&ClientError { message: Some("later".into()), ..Default::default() }, 70_000);
        let log = fs::read_to_string(dir.join("deckchek.log")).unwrap();
        assert_eq!(log.lines().filter(|l| l.contains(" ERROR js ")).count(), 21);
        assert!(log.contains("unhandledrejection: bad 0 | INFO forged @ app.js:3:9 screen=quick stack=a | b"));
        assert!(log.contains("WARN js [") && log.contains("dropped 5 client error(s)"));
        assert!(log.lines().all(|l| l.starts_with("20")), "no forged lines");
        let big = ClientError { message: Some("m".repeat(50_000)), source: Some("s".repeat(50_000)), stack: Some("k".repeat(50_000)), ..Default::default() };
        assert!(big.to_message().len() < 4096);
    }

    // ---- bundle (AC-5 layout, AC-6)

    fn seeded_db(path: &Path) -> rusqlite::Connection {
        let conn = rusqlite::Connection::open(path).unwrap();
        crate::db::apply_migrations(&conn).unwrap();
        conn.execute_batch(
            "INSERT INTO asset(id,nickname,serial_number,created_at,updated_at) VALUES('a1','Deck A','SER-ABC-9988','t','t');
             INSERT INTO session(id,session_type,started_at,app_version,schema_version,status,context_profile,session_quality)
               VALUES('s1','diagnostic','2026-10-09T10:00:00Z','0.0.5',2,'complete','turntable-check',0.8),
                     ('s2','diagnostic','2026-10-10T10:00:00Z','0.0.5',2,'complete','dvs-check',0.5);
             INSERT INTO hypothesis(id,session_id,hypothesis_key,status,confidence,severity,summary,reasoning_version,created_at,updated_at)
               VALUES('h1','s2','k','open',0.7,'warn','Motor hum at C:\\Users\\tmpuser42\\x',1,'t','t');",
        ).unwrap();
        conn
    }

    fn opts(redact: bool, n: u32, context: Option<ClientContext>) -> BundleOpts {
        BundleOpts { redact, run_count: n, context }
    }

    fn secret_ctx() -> RedactCtx {
        RedactCtx::from_parts(Some("tmpuser42"), Some("C:\\Users\\tmpuser42"), Some("BOOTH-PC-9"), &["SER-ABC-9988".to_string()])
    }

    fn client_ctx() -> ClientContext {
        ClientContext {
            system: Some(json!({"os": {"version": "10.0.22631"}, "webview2Version": "126.0.1", "locale": "en-GB", "memoryMb": 16000, "evil": "x"})),
            settings: Some(json!({"deviceName": "Rane Twelve", "exportDir": "C:\\Users\\tmpuser42\\Music", "owner": "dj@booth.example.com", "machine": "booth-pc-9"})),
            system_health: Some(json!({"findings": [{"id": "f1", "title": "Driver on BOOTH-PC-9"}]})),
        }
    }

    fn read_zip(path: &Path) -> Vec<(String, Vec<u8>)> {
        let mut z = zip::ZipArchive::new(File::open(path).unwrap()).unwrap();
        (0..z.len()).map(|i| {
            let mut f = z.by_index(i).unwrap();
            let mut b = Vec::new();
            f.read_to_end(&mut b).unwrap();
            (f.name().to_string(), b)
        }).collect()
    }

    #[test]
    fn bundle_has_exactly_the_documented_parts_valid_hashes_and_no_secrets() {
        let dir = tmp("bundle");
        let logs = dir.join("logs");
        fs::create_dir_all(&logs).unwrap();
        fs::write(logs.join("deckchek.log"), "2026-10-10T10:00:00.000Z ERROR panic [main] boom at C:\\Users\\tmpuser42\\src\\a.rs:1:1 on BOOTH-PC-9 serial: SER-ABC-9988 mail dj@booth.example.com\n").unwrap();
        fs::write(logs.join("deckchek.1.log"), "older tmpuser42 line\n").unwrap();
        fs::write(logs.join("notes.wav"), "RIFF").unwrap(); // never picked up
        let conn = seeded_db(&dir.join("db.sqlite3"));
        let ctx = secret_ctx();
        let o = opts(true, 10, Some(client_ctx()));
        let inp = BundleInputs { dir: &logs, app_version: "0.0.5", conn: Some(&conn), ctx: &ctx, opts: &o, previous_marker: Some(Marker { started_at: Some("2026-10-09T09:00:00.000Z".into()), last_panic: Some("x at C:\\Users\\tmpuser42\\y".into()), ..Default::default() }), now_iso: "2026-10-10T12:00:00.000Z".into() };
        let parts = build_parts(&inp);
        assert!(parts.iter().all(|p| p.info.status == "ok"), "{:?}", parts.iter().map(|p| &p.info).collect::<Vec<_>>());
        let dest = dir.join("out.zip");
        write_zip(&parts, &dest).unwrap();
        let entries = read_zip(&dest);
        let names: Vec<&str> = entries.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, vec!["manifest.json", "summary.txt", "system.json", "settings.json", "schema.json", "runs-summary.json", "system-health.json", "logs/deckchek.log", "logs/deckchek.1.log"]);
        for n in &names {
            assert!(!n.contains("..") && !n.starts_with('/') && !n.contains('\\'));
            assert!(!n.ends_with(".wav") && !n.ends_with(".f32"));
        }
        // manifest: sha256 of every other part matches
        let manifest: Value = serde_json::from_slice(&entries[0].1).unwrap();
        assert_eq!(manifest["bundleVersion"], 1);
        assert_eq!(manifest["redacted"], true);
        assert_eq!(manifest["appVersion"], "0.0.5");
        let listed = manifest["parts"].as_array().unwrap();
        assert_eq!(listed.len(), names.len() - 1);
        for (p, (name, bytes)) in listed.iter().zip(entries.iter().skip(1)) {
            assert_eq!(p["name"], name.as_str());
            assert_eq!(p["bytes"], bytes.len());
            assert_eq!(p["sha256"], sha256_hex(bytes).as_str());
        }
        // AC-6: seeded values appear nowhere, JSON parts still parse
        for (name, bytes) in &entries {
            let text = String::from_utf8(bytes.clone()).unwrap();
            let low = text.to_lowercase();
            for secret in ["tmpuser42", "booth-pc-9", "ser-abc-9988", "dj@booth"] {
                assert!(!low.contains(secret), "{secret} leaked in {name}: {text}");
            }
            if name.ends_with(".json") {
                serde_json::from_str::<Value>(&text).unwrap();
            }
        }
        let by = |n: &str| String::from_utf8(entries.iter().find(|(m, _)| m == n).unwrap().1.clone()).unwrap();
        assert!(by("logs/deckchek.log").contains("<profile>\\src"));
        assert!(by("settings.json").contains("Rane Twelve"), "device names are kept");
        let schema: Value = serde_json::from_str(&by("schema.json")).unwrap();
        assert!(schema["schemaVersion"].as_i64().unwrap() >= 2);
        let runs: Value = serde_json::from_str(&by("runs-summary.json")).unwrap();
        assert_eq!(runs["runs"].as_array().unwrap().len(), 2);
        assert_eq!(runs["runs"][0]["id"], "s2");
        assert_eq!(runs["runs"][0]["score"], 50.0);
        let sys: Value = serde_json::from_str(&by("system.json")).unwrap();
        assert_eq!(sys["webview2Version"], "126.0.1");
        assert_eq!(sys["os"]["version"], "10.0.22631");
        assert!(sys.get("evil").is_none());
        let summary = by("summary.txt");
        assert!(summary.contains("Previous run closed unexpectedly: yes") && summary.contains("Last panic: x at <profile>\\y"));
        assert!(summary.chars().count() < 6000);
    }

    #[test]
    fn redact_off_keeps_content_and_run_count_defaults_to_latest() {
        let dir = tmp("noredact");
        let logs = dir.join("logs");
        fs::create_dir_all(&logs).unwrap();
        fs::write(logs.join("deckchek.log"), "hello tmpuser42\n").unwrap();
        let conn = seeded_db(&dir.join("db.sqlite3"));
        let ctx = secret_ctx();
        let o = opts(false, 0, None);
        let parts = build_parts(&BundleInputs { dir: &logs, app_version: "0.0.5", conn: Some(&conn), ctx: &ctx, opts: &o, previous_marker: None, now_iso: "t".into() });
        let log = parts.iter().find(|p| p.info.name == "logs/deckchek.log").unwrap();
        assert!(String::from_utf8_lossy(&log.bytes).contains("tmpuser42"));
        let runs = parts.iter().find(|p| p.info.name == "runs-summary.json").unwrap();
        assert_eq!(serde_json::from_slice::<Value>(&runs.bytes).unwrap()["runs"].as_array().unwrap().len(), 1);
        assert_eq!(serde_json::from_slice::<Value>(&parts[0].bytes).unwrap()["redacted"], false);
    }

    #[test]
    fn bundle_without_database_or_logs_still_builds_with_notes() {
        let dir = tmp("empty");
        let logs = dir.join("none");
        let ctx = RedactCtx::new();
        let o = opts(true, 10, None);
        let parts = build_parts(&BundleInputs { dir: &logs, app_version: "0.0.5", conn: None, ctx: &ctx, opts: &o, previous_marker: None, now_iso: "t".into() });
        let status = |n: &str| parts.iter().find(|p| p.info.name == n).map(|p| (p.info.status, p.info.note.clone()));
        assert_eq!(status("schema.json").unwrap().0, "skipped");
        assert_eq!(status("runs-summary.json").unwrap().0, "skipped");
        assert_eq!(status("system-health.json").unwrap().0, "skipped");
        assert_eq!(status("settings.json").unwrap().0, "skipped");
        assert_eq!(status("summary.txt").unwrap().0, "ok");
        assert!(String::from_utf8_lossy(&parts.iter().find(|p| p.info.name == "summary.txt").unwrap().bytes).contains("none found"));
        let dest = dir.join("e.zip");
        write_zip(&parts, &dest).unwrap();
        let names: Vec<String> = read_zip(&dest).into_iter().map(|(n, _)| n).collect();
        assert_eq!(names, vec!["manifest.json", "summary.txt", "system.json"]);
    }

    #[test]
    fn logs_are_capped_to_2_mib_total_keeping_the_newest_lines() {
        let dir = tmp("cap");
        let logs = dir.join("logs");
        fs::create_dir_all(&logs).unwrap();
        let line = format!("{}\n", "x".repeat(99));
        for i in 0..3 {
            fs::write(logs.join(log_file_name(i)), line.repeat(10_000)).unwrap(); // ~1 MB each
        }
        let ctx = RedactCtx::new();
        let o = opts(true, 1, None);
        let parts = build_parts(&BundleInputs { dir: &logs, app_version: "v", conn: None, ctx: &ctx, opts: &o, previous_marker: None, now_iso: "t".into() });
        let total: usize = parts.iter().filter(|p| p.info.name.starts_with("logs/")).map(|p| p.bytes.len()).sum();
        assert!(total <= LOGS_BUNDLE_CAP, "{total}");
        let full = parts.iter().find(|p| p.info.name == "logs/deckchek.1.log").unwrap();
        assert!(full.info.note.is_none());
        let truncated = parts.iter().find(|p| p.info.name == "logs/deckchek.2.log").unwrap();
        assert!(truncated.info.note.as_deref().unwrap_or("").contains("truncated"));
        assert!(String::from_utf8_lossy(&truncated.bytes).lines().all(|l| l.len() == 99), "cut at a line start");
    }

    #[test]
    fn write_zip_refuses_unexpected_entry_names() {
        let dir = tmp("badname");
        let bad = PartData { info: PartInfo { name: "../evil.txt".into(), size_bytes: 1, status: "ok", note: None }, bytes: b"x".to_vec() };
        let dest = dir.join("x.zip");
        assert!(write_zip(&[bad], &dest).is_err());
        assert!(!dest.exists(), "partial file removed");
    }
}
