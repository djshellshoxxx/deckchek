//! Best-effort DJ session spans for the stylus hours ledger (FS-12 AC-3).
//!
//! Reads the DJ program log files that `system_check` already locates (read-only reuse of its
//! scan), and extracts only TIMESTAMPS from line starts, never content. Consecutive timestamps
//! closer than [`GAP_SECS`] form one span; a span shorter than [`MIN_SPAN_SECS`] is dropped.
//! Whether DJ programs write parseable session logs is an open question (FS-12 §10), so an
//! empty result is normal and the UI treats these spans as proposals the user confirms.
//!
//! Naive timestamps (no `Z`/offset) are local time. The offset is inferred from the file's
//! modified time (the last log line is written near it) and rounded to 15 minutes; if no
//! plausible offset exists the file is skipped rather than guessed.

#![cfg_attr(not(windows), allow(dead_code))]

use serde::Serialize;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use crate::system_check::{iso_from_unix, scan_dj_logs};

pub const GAP_SECS: i64 = 30 * 60;
pub const MIN_SPAN_SECS: i64 = 60;
const MAX_READ_BYTES: u64 = 2 * 1024 * 1024;
const MAX_OFFSET_SECS: i64 = 14 * 3600;
/// The last log line must sit within this window before the file's modified time (after the zone offset) ...
const MTIME_SLACK_BEFORE: i64 = 300;
/// ... and may be at most this far after it (clock rounding).
const MTIME_SLACK_AFTER: i64 = 120;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSpan {
    pub app: String,
    pub start: String,
    pub end: String,
    /// "log" (parsed from a log file) or "process" (reserved; not produced yet).
    pub source: String,
}

/// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Stamp {
    /// Seconds since the epoch, reading the wall clock as UTC unless `explicit_tz`.
    pub secs: i64,
    pub explicit_tz: bool,
}

fn num(b: &[u8], from: usize, len: usize) -> Option<i64> {
    let s = b.get(from..from + len)?;
    if !s.iter().all(u8::is_ascii_digit) {
        return None;
    }
    Some(s.iter().fold(0i64, |a, c| a * 10 + (c - b'0') as i64))
}

/// Parse `YYYY-MM-DD[T ]HH:MM:SS[.fff][Z|±HH:MM|±HHMM]` at the start of a line (optionally after `[`).
pub fn parse_stamp(line: &str) -> Option<Stamp> {
    let b = line.trim_start().as_bytes();
    let b = if b.first() == Some(&b'[') { &b[1..] } else { b };
    let (y, mo, d) = (num(b, 0, 4)?, num(b, 5, 2)?, num(b, 8, 2)?);
    if b.get(4) != Some(&b'-') || b.get(7) != Some(&b'-') || !matches!(b.get(10), Some(b'T') | Some(b' ')) {
        return None;
    }
    let (h, mi, s) = (num(b, 11, 2)?, num(b, 14, 2)?, num(b, 17, 2)?);
    if b.get(13) != Some(&b':') || b.get(16) != Some(&b':') {
        return None;
    }
    if !(1970..=2100).contains(&y) || !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || s > 59 {
        return None;
    }
    let mut i = 19;
    if b.get(i) == Some(&b'.') {
        i += 1;
        while b.get(i).map_or(false, u8::is_ascii_digit) {
            i += 1;
        }
    }
    let mut secs = days_from_civil(y, mo, d) * 86_400 + h * 3600 + mi * 60 + s;
    let mut explicit_tz = false;
    match b.get(i) {
        Some(b'Z') => explicit_tz = true,
        Some(&sign @ (b'+' | b'-')) => {
            let (oh, rest) = (num(b, i + 1, 2)?, i + 3);
            let om = if b.get(rest) == Some(&b':') { num(b, rest + 1, 2)? } else { num(b, rest, 2).unwrap_or(0) };
            if oh > 14 || om > 59 {
                return None;
            }
            let off = oh * 3600 + om * 60;
            secs -= if sign == b'+' { off } else { -off };
            explicit_tz = true;
        }
        _ => {}
    }
    Some(Stamp { secs, explicit_tz })
}

/// Group sorted-or-not timestamps into spans: a gap above [`GAP_SECS`] starts a new span.
pub fn spans_from_times(mut times: Vec<i64>) -> Vec<(i64, i64)> {
    times.sort_unstable();
    let mut out: Vec<(i64, i64)> = Vec::new();
    for t in times {
        match out.last_mut() {
            Some(last) if t - last.1 <= GAP_SECS => last.1 = t,
            _ => out.push((t, t)),
        }
    }
    out.retain(|(a, b)| b - a >= MIN_SPAN_SECS);
    out
}

/// Spans (epoch seconds) from log text. `modified_secs` calibrates naive local timestamps.
pub fn spans_from_text(text: &str, modified_secs: i64) -> Vec<(i64, i64)> {
    let stamps: Vec<Stamp> = text.lines().filter_map(parse_stamp).collect();
    let Some(last_naive) = stamps.iter().rev().find(|s| !s.explicit_tz).map(|s| s.secs) else {
        return spans_from_times(stamps.iter().map(|s| s.secs).collect());
    };
    // offset (local - UTC) is the multiple of 15 min that puts the last naive stamp just before the modified time
    let delta = modified_secs - last_naive;
    let offset_to_utc = (delta as f64 / 900.0).round() as i64 * 900; // add to a naive reading to get UTC
    let residual = modified_secs - (last_naive + offset_to_utc);
    if offset_to_utc.abs() > MAX_OFFSET_SECS || residual < -MTIME_SLACK_AFTER || residual > MTIME_SLACK_BEFORE {
        // no plausible zone: keep only stamps that carry their own zone
        return spans_from_times(stamps.iter().filter(|s| s.explicit_tz).map(|s| s.secs).collect());
    }
    spans_from_times(stamps.iter().map(|s| if s.explicit_tz { s.secs } else { s.secs + offset_to_utc }).collect())
}

fn read_tail(path: &Path) -> Option<String> {
    let mut f = std::fs::File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    if len > MAX_READ_BYTES {
        f.seek(SeekFrom::Start(len - MAX_READ_BYTES)).ok()?;
    }
    let mut buf = Vec::new();
    f.take(MAX_READ_BYTES).read_to_end(&mut buf).ok()?;
    Some(crate::system_check::decode_text(&buf))
}

fn mtime_secs(path: &Path) -> Option<i64> {
    let m = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(m.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs() as i64)
}

/// Build spans from a set of (app, path) log files.
pub fn spans_from_files(files: &[(String, std::path::PathBuf)]) -> Vec<SessionSpan> {
    let mut out = Vec::new();
    for (app, path) in files {
        let (Some(text), Some(mt)) = (read_tail(path), mtime_secs(path)) else { continue };
        for (a, b) in spans_from_text(&text, mt) {
            out.push(SessionSpan { app: app.clone(), start: iso_from_unix(a.max(0) as u64), end: iso_from_unix(b.max(0) as u64), source: "log".into() });
        }
    }
    out.sort_by(|x, y| x.start.cmp(&y.start).then_with(|| x.app.cmp(&y.app)));
    out.dedup();
    out
}

#[tauri::command]
pub async fn dj_session_spans() -> Result<Vec<SessionSpan>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let scan = scan_dj_logs();
        if !scan.supported {
            return Vec::new();
        }
        let files: Vec<(String, std::path::PathBuf)> = scan
            .apps
            .iter()
            .flat_map(|a| a.files.iter().filter(|f| f.kind == "log").map(move |f| (a.app.clone(), std::path::PathBuf::from(&f.path))))
            .collect();
        spans_from_files(&files)
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const T: i64 = 1_760_126_400; // 2025-10-10T20:00:00Z

    #[test]
    fn civil_days_known_dates() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(days_from_civil(2024, 2, 29), 19_782);
        assert_eq!(days_from_civil(2025, 10, 10) * 86_400 + 20 * 3600, T);
    }

    #[test]
    fn parses_timestamp_shapes() {
        let z = parse_stamp("2025-10-10T20:00:00Z started").unwrap();
        assert_eq!((z.secs, z.explicit_tz), (T, true));
        assert_eq!(parse_stamp("[2025-10-10 20:00:00.123] x").unwrap(), Stamp { secs: T, explicit_tz: false });
        assert_eq!(parse_stamp("2025-10-10T22:00:00+02:00").unwrap(), Stamp { secs: T, explicit_tz: true });
        assert_eq!(parse_stamp("2025-10-10T15:30:00-0430").unwrap().secs, T);
        for bad in ["", "hello", "2025-13-10 20:00:00", "2025-10-10 25:00:00", "2025/10/10 20:00:00", "1960-01-01 00:00:00", "2025-10-10T20:00", "2025-10-10T20:00:00+25:00", "２０２５-10-10 20:00:00"] {
            assert!(parse_stamp(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn gap_splits_spans_and_short_ones_drop() {
        let s = spans_from_times(vec![T + 600, T, T + 1200, T + 1200 + GAP_SECS, T + 1200 + GAP_SECS + GAP_SECS + 1, T + 100_000]);
        assert_eq!(s, vec![(T, T + 1200 + GAP_SECS)]);
        assert_eq!(spans_from_times(vec![T, T + 59]), vec![]);
        assert_eq!(spans_from_times(vec![T, T + 60]), vec![(T, T + 60)]);
        assert_eq!(spans_from_times(vec![]), vec![]);
    }

    #[test]
    fn explicit_zone_ignores_mtime() {
        let text = "2025-10-10T20:00:00Z a\nnoise without time\n2025-10-10T20:20:00Z b\n2025-10-10T23:00:00Z c\n2025-10-10T23:20:00Z d\n";
        assert_eq!(spans_from_text(text, 0), vec![(T, T + 1200), (T + 10_800, T + 12_000)]);
    }

    #[test]
    fn naive_local_time_is_calibrated_from_modified_time() {
        // local = UTC+2: file shows 22:00..22:40 local, i.e. 20:00..20:40 UTC; mtime = last line time
        let text = "2025-10-10 22:00:00 open\n2025-10-10 22:20:00 x\n2025-10-10 22:40:00 close\n";
        assert_eq!(spans_from_text(text, T + 2400 + 5), vec![(T, T + 2400)]);
        // local = UTC-5 (offset crosses a day boundary in the other direction)
        let text = "2025-10-10 15:00:00 open\n2025-10-10 15:30:00 close\n";
        assert_eq!(spans_from_text(text, T + 1800), vec![(T, T + 1800)]);
        // half-hour zone UTC+5:30
        let text = "2025-10-11 01:30:00 open\n2025-10-11 02:00:00 close\n";
        assert_eq!(spans_from_text(text, T + 1800), vec![(T, T + 1800)]);
    }

    #[test]
    fn implausible_offset_skips_naive_stamps_but_keeps_explicit() {
        // mtime 5 days after the last line: no zone explains it (>14 h)
        let text = "2025-10-10 20:00:00 a\n2025-10-10 20:30:00 b\n";
        assert_eq!(spans_from_text(text, T + 5 * 86_400), vec![]);
        // an offset that is not a clean multiple of 15 min (mtime 7.5 min off) is rejected
        assert_eq!(spans_from_text(text, T + 1800 + 450), vec![]);
        let mixed = "2025-10-10T20:00:00Z a\n2025-10-10T20:10:00Z b\n2025-10-10 20:30:00 c\n";
        assert_eq!(spans_from_text(mixed, T + 5 * 86_400), vec![(T, T + 600)]);
    }

    #[test]
    fn files_are_read_and_non_logs_never_leak_content() {
        let dir = std::env::temp_dir().join(format!("deckchek-djs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("a.log");
        std::fs::write(&p, "2025-10-10T20:00:00Z secret track title\n2025-10-10T20:25:00Z x\n2025-10-10T20:45:00Z more secret\n").unwrap();
        let q = dir.join("missing.log");
        let spans = spans_from_files(&[("Mixxx".into(), p), ("Mixxx".into(), q)]);
        assert_eq!(spans.len(), 1);
        assert_eq!((spans[0].start.as_str(), spans[0].end.as_str(), spans[0].source.as_str()), ("2025-10-10T20:00:00Z", "2025-10-10T20:45:00Z", "log"));
        let json = serde_json::to_string(&spans[0]).unwrap();
        assert!(!json.contains("secret"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
