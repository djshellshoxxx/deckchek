//! FS-31 live monitor session log (tables from `0019_monitor_log.sql`).
//!
//! The analysis runs in the webview (`app/monitor.js`) on the FS-00 streaming capture, which holds the capture
//! lease as `live-monitor`; this module only persists what it reports: one `monitor_session` per run, its
//! alert/info events and per-minute per-deck summaries. Everything is bounded: per-call and per-session caps on
//! events and minute rows (a multi-hour session cannot grow the database without limit), size caps on the JSON
//! columns, and retention pruning (`app_state` key `monitor`, `retentionDays`, default 90, plus a session-count
//! cap) at startup and on demand. All SQL is parameterised; every argument is validated before use.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::db::{database_path, new_id, now_iso, open_database};

pub const MAX_EVENTS_PER_CALL: usize = 500;
pub const MAX_MINUTES_PER_CALL: usize = 240;
/// A 12 h session with two decks raising an alert every 10 s still fits; beyond it events are counted, not stored.
pub const MAX_EVENTS_PER_SESSION: i64 = 10_000;
/// 24 h x 4 decks.
pub const MAX_MINUTES_PER_SESSION: i64 = 24 * 60 * 4;
pub const MAX_MINUTE_INDEX: i64 = 7 * 24 * 60;
pub const MAX_T_MS: i64 = 7 * 24 * 3600 * 1000;
pub const MAX_SESSIONS: i64 = 500;
pub const DEFAULT_RETENTION_DAYS: i64 = 90;
pub const MAX_RETENTION_DAYS: i64 = 3650;
pub const MAX_CONFIG_BYTES: usize = 16 * 1024;
pub const MAX_SUMMARY_BYTES: usize = 64 * 1024;
pub const MAX_MESSAGE_CHARS: usize = 300;
pub const MAX_NAME_CHARS: usize = 200;
pub const MAX_LIST: u32 = 500;
pub const SEVERITIES: &[&str] = &["info", "warning", "critical"];
pub const DECKS: &[&str] = &["A", "B", "C", "D"];
pub const SETTINGS_KEY: &str = "monitor";

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStartInput {
    pub device_name: Option<String>,
    pub host_api: Option<String>,
    pub sample_rate: Option<i64>,
    pub format: String,
    pub config: Value,
    pub asset_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStarted {
    pub id: String,
    pub started_at: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    pub t_ms: i64,
    pub deck: Option<String>,
    pub kind: String,
    pub severity: String,
    pub value: Option<f64>,
    pub baseline: Option<f64>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinuteInput {
    pub minute: i64,
    pub deck: String,
    pub snr_db_min: Option<f64>,
    pub snr_db_mean: Option<f64>,
    pub hum_db_max: Option<f64>,
    pub drift_deg_max: Option<f64>,
    pub dropouts: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendResult {
    pub events_stored: usize,
    pub events_dropped: usize,
    pub minutes_stored: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRow {
    pub id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub device_name: Option<String>,
    pub host_api: Option<String>,
    pub sample_rate: Option<i64>,
    pub format: Option<String>,
    pub config: Value,
    pub summary: Option<Value>,
    pub asset_id: Option<String>,
    pub event_count: i64,
    pub warning_count: i64,
    pub critical_count: i64,
    pub minute_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRow {
    pub id: String,
    pub t_ms: i64,
    pub deck: Option<String>,
    pub kind: String,
    pub severity: String,
    pub value: Option<f64>,
    pub baseline: Option<f64>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MinuteRow {
    pub minute: i64,
    pub deck: String,
    pub snr_db_min: Option<f64>,
    pub snr_db_mean: Option<f64>,
    pub hum_db_max: Option<f64>,
    pub drift_deg_max: Option<f64>,
    pub dropouts: Option<i64>,
}

/// Log export shape (FS-31 §5): `{version: 1, session, events, minutes}`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SessionLog {
    pub version: u32,
    pub session: SessionRow,
    pub events: Vec<EventRow>,
    pub minutes: Vec<MinuteRow>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PruneResult {
    pub deleted: usize,
    pub retention_days: i64,
    pub closed: usize,
}

// ---------------------------------------------------------------- validation

fn opt_text(name: &str, v: &Option<String>, max: usize) -> Result<Option<String>, String> {
    match v {
        None => Ok(None),
        Some(s) => {
            if s.chars().count() > max {
                return Err(format!("{name} is limited to {max} characters"));
            }
            if s.chars().any(|c| c.is_control()) {
                return Err(format!("{name} must not contain control characters"));
            }
            let t = s.trim();
            Ok(if t.is_empty() { None } else { Some(t.to_string()) })
        }
    }
}

fn check_num(name: &str, v: Option<f64>, lo: f64, hi: f64) -> Result<(), String> {
    match v {
        Some(x) if !x.is_finite() || x < lo || x > hi => Err(format!("{name} must be a number between {lo} and {hi}")),
        _ => Ok(()),
    }
}

/// Event kinds are short camelCase identifiers (`snrDrop`, `dropouts`, `deviceLost`, ...).
pub fn valid_kind(kind: &str) -> bool {
    !kind.is_empty() && kind.len() <= 32 && kind.starts_with(|c: char| c.is_ascii_lowercase()) && kind.chars().all(|c| c.is_ascii_alphanumeric())
}

fn valid_deck(deck: &str) -> bool {
    DECKS.contains(&deck)
}

/// Session ids are generated by [`new_id`]; anything else is refused before it reaches SQL.
pub fn valid_id(id: &str) -> bool {
    id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

fn require_id(id: &str) -> Result<(), String> {
    if valid_id(id) {
        Ok(())
    } else {
        Err("monitor session id is not valid".into())
    }
}

fn bounded_json(name: &str, v: &Value, max: usize) -> Result<String, String> {
    let s = serde_json::to_string(v).map_err(|e| e.to_string())?;
    if s.len() > max {
        return Err(format!("{name} is limited to {max} bytes"));
    }
    Ok(s)
}

pub fn validate_start(i: &SessionStartInput) -> Result<(), String> {
    let f = i.format.trim();
    if f.is_empty() || f.chars().count() > 80 || f.chars().any(|c| c.is_control()) {
        return Err("format must be 1-80 printable characters".into());
    }
    opt_text("deviceName", &i.device_name, MAX_NAME_CHARS)?;
    opt_text("hostApi", &i.host_api, 40)?;
    if let Some(sr) = i.sample_rate {
        if !(4000..=384_000).contains(&sr) {
            return Err("sampleRate must be between 4000 and 384000".into());
        }
    }
    if !i.config.is_object() {
        return Err("config must be an object".into());
    }
    bounded_json("config", &i.config, MAX_CONFIG_BYTES)?;
    Ok(())
}

pub fn validate_event(e: &EventInput) -> Result<(), String> {
    if !(0..=MAX_T_MS).contains(&e.t_ms) {
        return Err(format!("event tMs must be between 0 and {MAX_T_MS}"));
    }
    if let Some(d) = &e.deck {
        if !valid_deck(d) {
            return Err("event deck must be A, B, C or D".into());
        }
    }
    if !valid_kind(&e.kind) {
        return Err("event kind must be a short camelCase identifier".into());
    }
    if !SEVERITIES.contains(&e.severity.as_str()) {
        return Err("event severity must be info, warning or critical".into());
    }
    check_num("event value", e.value, -1000.0, 1000.0)?;
    check_num("event baseline", e.baseline, -1000.0, 1000.0)?;
    opt_text("event message", &e.message, MAX_MESSAGE_CHARS)?;
    Ok(())
}

pub fn validate_minute(m: &MinuteInput) -> Result<(), String> {
    if !(0..=MAX_MINUTE_INDEX).contains(&m.minute) {
        return Err(format!("minute must be between 0 and {MAX_MINUTE_INDEX}"));
    }
    if !valid_deck(&m.deck) {
        return Err("minute deck must be A, B, C or D".into());
    }
    for (n, v) in [("snrDbMin", m.snr_db_min), ("snrDbMean", m.snr_db_mean), ("humDbMax", m.hum_db_max), ("driftDegMax", m.drift_deg_max)] {
        check_num(n, v, -1000.0, 1000.0)?;
    }
    if m.dropouts.map_or(false, |d| !(0..=100_000).contains(&d)) {
        return Err("dropouts must be between 0 and 100000".into());
    }
    Ok(())
}

// ---------------------------------------------------------------- persistence

pub fn session_start(conn: &Connection, i: &SessionStartInput) -> Result<SessionStarted, String> {
    validate_start(i)?;
    if let Some(a) = &i.asset_id {
        let n: Option<i64> = conn.query_row("SELECT 1 FROM asset WHERE id = ?1", [a], |r| r.get(0)).optional().map_err(e2s)?;
        if n.is_none() {
            return Err(format!("unknown asset '{}'", a.chars().take(64).collect::<String>()));
        }
    }
    let config = bounded_json("config", &i.config, MAX_CONFIG_BYTES)?;
    let id = new_id();
    let now = now_iso(conn)?;
    conn.execute(
        "INSERT INTO monitor_session (id, started_at, device_name, host_api, sample_rate, format, config_json, asset_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, now, opt_text("deviceName", &i.device_name, MAX_NAME_CHARS)?, opt_text("hostApi", &i.host_api, 40)?, i.sample_rate, i.format.trim(), config, i.asset_id],
    )
    .map_err(e2s)?;
    Ok(SessionStarted { id, started_at: now })
}

fn session_open(conn: &Connection, id: &str) -> Result<bool, String> {
    let row: Option<Option<String>> = conn.query_row("SELECT ended_at FROM monitor_session WHERE id = ?1", [id], |r| r.get(0)).optional().map_err(e2s)?;
    match row {
        None => Err("unknown monitor session".into()),
        Some(ended) => Ok(ended.is_none()),
    }
}

/// Append a batch of events and minute summaries in one transaction. Minute rows upsert (a re-flush of the
/// same minute replaces it). Events beyond the per-session cap are dropped and counted, never an error.
pub fn log_append(conn: &mut Connection, session_id: &str, events: &[EventInput], minutes: &[MinuteInput]) -> Result<AppendResult, String> {
    require_id(session_id)?;
    if events.len() > MAX_EVENTS_PER_CALL {
        return Err(format!("at most {MAX_EVENTS_PER_CALL} events per call"));
    }
    if minutes.len() > MAX_MINUTES_PER_CALL {
        return Err(format!("at most {MAX_MINUTES_PER_CALL} minute rows per call"));
    }
    for e in events {
        validate_event(e)?;
    }
    for m in minutes {
        validate_minute(m)?;
    }
    if !session_open(conn, session_id)? {
        return Err("monitor session has ended".into());
    }
    let tx = conn.transaction().map_err(e2s)?;
    let have: i64 = tx.query_row("SELECT COUNT(*) FROM monitor_event WHERE session_id = ?1", [session_id], |r| r.get(0)).map_err(e2s)?;
    let room = (MAX_EVENTS_PER_SESSION - have).max(0) as usize;
    let keep = events.len().min(room);
    for e in &events[..keep] {
        tx.execute(
            "INSERT INTO monitor_event (id, session_id, t_ms, deck, kind, severity, value, baseline, message) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![new_id(), session_id, e.t_ms, e.deck, e.kind, e.severity, e.value, e.baseline, opt_text("event message", &e.message, MAX_MESSAGE_CHARS)?],
        )
        .map_err(e2s)?;
    }
    let mins: i64 = tx.query_row("SELECT COUNT(*) FROM monitor_minute WHERE session_id = ?1", [session_id], |r| r.get(0)).map_err(e2s)?;
    let mut stored = 0usize;
    for m in minutes {
        let exists: Option<i64> = tx
            .query_row("SELECT 1 FROM monitor_minute WHERE session_id = ?1 AND minute = ?2 AND deck = ?3", params![session_id, m.minute, m.deck], |r| r.get(0))
            .optional()
            .map_err(e2s)?;
        if exists.is_none() && mins + stored as i64 >= MAX_MINUTES_PER_SESSION {
            continue;
        }
        tx.execute(
            "INSERT OR REPLACE INTO monitor_minute (session_id, minute, deck, snr_db_min, snr_db_mean, hum_db_max, drift_deg_max, dropouts) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![session_id, m.minute, m.deck, m.snr_db_min, m.snr_db_mean, m.hum_db_max, m.drift_deg_max, m.dropouts],
        )
        .map_err(e2s)?;
        if exists.is_none() {
            stored += 1;
        }
    }
    tx.commit().map_err(e2s)?;
    Ok(AppendResult { events_stored: keep, events_dropped: events.len() - keep, minutes_stored: stored })
}

/// Close a session with its summary. Ending twice keeps the first end time and replaces the summary.
pub fn session_end(conn: &Connection, session_id: &str, summary: &Value) -> Result<(), String> {
    require_id(session_id)?;
    if !summary.is_object() {
        return Err("summary must be an object".into());
    }
    let json = bounded_json("summary", summary, MAX_SUMMARY_BYTES)?;
    let now = now_iso(conn)?;
    let n = conn
        .execute("UPDATE monitor_session SET ended_at = COALESCE(ended_at, ?2), summary_json = ?3 WHERE id = ?1", params![session_id, now, json])
        .map_err(e2s)?;
    if n == 0 {
        return Err("unknown monitor session".into());
    }
    Ok(())
}

const SESSION_COLS: &str = "s.id, s.started_at, s.ended_at, s.device_name, s.host_api, s.sample_rate, s.format, s.config_json, s.summary_json, s.asset_id,
    (SELECT COUNT(*) FROM monitor_event e WHERE e.session_id = s.id),
    (SELECT COUNT(*) FROM monitor_event e WHERE e.session_id = s.id AND e.severity = 'warning'),
    (SELECT COUNT(*) FROM monitor_event e WHERE e.session_id = s.id AND e.severity = 'critical'),
    (SELECT COUNT(*) FROM monitor_minute m WHERE m.session_id = s.id)";

fn session_row(r: &rusqlite::Row) -> rusqlite::Result<SessionRow> {
    let config: String = r.get(7)?;
    let summary: Option<String> = r.get(8)?;
    Ok(SessionRow {
        id: r.get(0)?,
        started_at: r.get(1)?,
        ended_at: r.get(2)?,
        device_name: r.get(3)?,
        host_api: r.get(4)?,
        sample_rate: r.get(5)?,
        format: r.get(6)?,
        config: serde_json::from_str(&config).unwrap_or(Value::Null),
        summary: summary.and_then(|s| serde_json::from_str(&s).ok()),
        asset_id: r.get(9)?,
        event_count: r.get(10)?,
        warning_count: r.get(11)?,
        critical_count: r.get(12)?,
        minute_count: r.get(13)?,
    })
}

/// Newest first.
pub fn session_list(conn: &Connection, limit: Option<u32>) -> Result<Vec<SessionRow>, String> {
    let limit = limit.unwrap_or(50).clamp(1, MAX_LIST);
    let mut stmt = conn
        .prepare(&format!("SELECT {SESSION_COLS} FROM monitor_session s ORDER BY s.started_at DESC, s.id DESC LIMIT ?1"))
        .map_err(e2s)?;
    let rows = stmt.query_map([limit], session_row).map_err(e2s)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)
}

pub fn session_get(conn: &Connection, id: &str) -> Result<Option<SessionLog>, String> {
    require_id(id)?;
    let session = conn
        .query_row(&format!("SELECT {SESSION_COLS} FROM monitor_session s WHERE s.id = ?1"), [id], session_row)
        .optional()
        .map_err(e2s)?;
    let Some(session) = session else { return Ok(None) };
    let mut stmt = conn
        .prepare("SELECT id, t_ms, deck, kind, severity, value, baseline, message FROM monitor_event WHERE session_id = ?1 ORDER BY t_ms, rowid")
        .map_err(e2s)?;
    let events = stmt
        .query_map([id], |r| {
            Ok(EventRow { id: r.get(0)?, t_ms: r.get(1)?, deck: r.get(2)?, kind: r.get(3)?, severity: r.get(4)?, value: r.get(5)?, baseline: r.get(6)?, message: r.get(7)? })
        })
        .map_err(e2s)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e2s)?;
    let mut stmt = conn
        .prepare("SELECT minute, deck, snr_db_min, snr_db_mean, hum_db_max, drift_deg_max, dropouts FROM monitor_minute WHERE session_id = ?1 ORDER BY minute, deck")
        .map_err(e2s)?;
    let minutes = stmt
        .query_map([id], |r| {
            Ok(MinuteRow { minute: r.get(0)?, deck: r.get(1)?, snr_db_min: r.get(2)?, snr_db_mean: r.get(3)?, hum_db_max: r.get(4)?, drift_deg_max: r.get(5)?, dropouts: r.get(6)? })
        })
        .map_err(e2s)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e2s)?;
    Ok(Some(SessionLog { version: 1, session, events, minutes }))
}

pub fn session_delete(conn: &Connection, id: &str) -> Result<bool, String> {
    require_id(id)?;
    Ok(conn.execute("DELETE FROM monitor_session WHERE id = ?1", [id]).map_err(e2s)? > 0)
}

/// Retention from `app_state` `monitor.retentionDays` (clamped), or the default.
pub fn stored_retention_days(conn: &Connection) -> i64 {
    crate::app_state::get(conn, SETTINGS_KEY)
        .ok()
        .flatten()
        .and_then(|e| e.value.get("retentionDays").and_then(Value::as_f64))
        .filter(|d| d.is_finite())
        .map(|d| (d.round() as i64).clamp(1, MAX_RETENTION_DAYS))
        .unwrap_or(DEFAULT_RETENTION_DAYS)
}

/// Delete sessions that ended (or started, if never ended) more than `days` ago, and all but the newest
/// [`MAX_SESSIONS`]. With `close_open_before` (Unix seconds, the process start), sessions still open that started
/// before it were left open by a crash or a kill: they are closed first, at their last event, and marked
/// "interrupted". Sessions of the running process are never touched.
pub fn prune(conn: &mut Connection, days: i64, close_open_before: Option<f64>) -> Result<PruneResult, String> {
    if !(1..=MAX_RETENTION_DAYS).contains(&days) {
        return Err(format!("retentionDays must be between 1 and {MAX_RETENTION_DAYS}"));
    }
    let tx = conn.transaction().map_err(e2s)?;
    let closed = match close_open_before {
        Some(before) if before.is_finite() => tx
            .execute(
                "UPDATE monitor_session SET
                   ended_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', julianday(started_at) + (SELECT MAX(t_ms) FROM monitor_event e WHERE e.session_id = monitor_session.id) / 86400000.0), started_at),
                   summary_json = COALESCE(summary_json, '{\"version\":1,\"endReason\":\"interrupted\"}')
                 WHERE ended_at IS NULL AND julianday(started_at) < julianday(?1, 'unixepoch')",
                [before],
            )
            .map_err(e2s)?,
        _ => 0,
    };
    let cutoff: String = tx
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?1)", [format!("-{days} days")], |r| r.get(0))
        .map_err(e2s)?;
    let mut deleted = tx
        .execute("DELETE FROM monitor_session WHERE COALESCE(ended_at, started_at) < ?1 AND ended_at IS NOT NULL", [&cutoff])
        .map_err(e2s)?;
    deleted += tx
        .execute(
            "DELETE FROM monitor_session WHERE ended_at IS NOT NULL AND id NOT IN (SELECT id FROM monitor_session ORDER BY started_at DESC, id DESC LIMIT ?1)",
            [MAX_SESSIONS],
        )
        .map_err(e2s)?;
    tx.commit().map_err(e2s)?;
    Ok(PruneResult { deleted, retention_days: days, closed })
}

/// Startup hook ([FS-31] setup): close crashed sessions and prune by the stored retention, off the UI thread.
pub fn setup(app: &AppHandle) {
    let Ok(path) = database_path(app) else { return };
    let started = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or(0.0);
    std::thread::spawn(move || {
        if let Ok(mut conn) = open_database(&path) {
            let days = stored_retention_days(&conn);
            let _ = prune(&mut conn, days, Some(started));
        }
    });
}

// ---------------------------------------------------------------- commands

#[tauri::command]
pub async fn monitor_session_start(app: AppHandle, input: SessionStartInput) -> Result<SessionStarted, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        session_start(&conn, &input)
    })
    .await?
}

#[tauri::command]
pub async fn monitor_log_append(app: AppHandle, session_id: String, events: Vec<EventInput>, minutes: Vec<MinuteInput>) -> Result<AppendResult, String> {
    crate::db::off_main(move || {
        let mut conn = open_database(&database_path(&app)?)?;
        log_append(&mut conn, &session_id, &events, &minutes)
    })
    .await?
}

#[tauri::command]
pub async fn monitor_session_end(app: AppHandle, session_id: String, summary: Value) -> Result<(), String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        session_end(&conn, &session_id, &summary)
    })
    .await?
}

#[tauri::command]
pub async fn monitor_session_list(app: AppHandle, limit: Option<u32>) -> Result<Vec<SessionRow>, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        session_list(&conn, limit)
    })
    .await?
}

#[tauri::command]
pub async fn monitor_session_get(app: AppHandle, id: String) -> Result<Option<SessionLog>, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        session_get(&conn, &id)
    })
    .await?
}

#[tauri::command]
pub async fn monitor_session_delete(app: AppHandle, id: String) -> Result<bool, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        session_delete(&conn, &id)
    })
    .await?
}

/// Prune now with `retentionDays` (or the stored setting). Open sessions are never touched here.
#[tauri::command]
pub async fn monitor_prune(app: AppHandle, retention_days: Option<i64>) -> Result<PruneResult, String> {
    crate::db::off_main(move || {
        let mut conn = open_database(&database_path(&app)?)?;
        let days = match retention_days {
            Some(d) => d,
            None => stored_retention_days(&conn),
        };
        prune(&mut conn, days, None)
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;
    use serde_json::json;
    use std::path::Path;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        c
    }

    fn start(c: &Connection) -> String {
        session_start(c, &SessionStartInput { device_name: Some("Traktor Audio 8 DJ".into()), host_api: Some("WASAPI".into()), sample_rate: Some(48000), format: "Traktor Scratch MK2".into(), config: json!({"decks": [{"deck": "A", "first": 1}], "hopMs": 250}), asset_id: None })
            .unwrap()
            .id
    }

    fn ev(t: i64, sev: &str) -> EventInput {
        EventInput { t_ms: t, deck: Some("A".into()), kind: "snrDrop".into(), severity: sev.into(), value: Some(24.0), baseline: Some(32.0), message: Some("Deck A: timecode SNR dropped 8 dB".into()) }
    }

    fn minute(m: i64, deck: &str) -> MinuteInput {
        MinuteInput { minute: m, deck: deck.into(), snr_db_min: Some(28.0), snr_db_mean: Some(30.5), hum_db_max: Some(-70.0), drift_deg_max: Some(1.5), dropouts: Some(0) }
    }

    fn table_count(c: &Connection, t: &str) -> i64 {
        c.query_row(&format!("SELECT COUNT(*) FROM {t}"), [], |r| r.get(0)).unwrap()
    }

    fn fixtures() -> Vec<(String, String)> {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/db");
        let mut out: Vec<(String, String)> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with('v') && n.ends_with(".sql"))
            .map(|n| {
                let sql = std::fs::read_to_string(dir.join(&n)).unwrap();
                (n, sql)
            })
            .collect();
        out.sort();
        out
    }

    #[test]
    fn migration_0019_fresh_database_and_rerun_is_a_noop() {
        let c = mem();
        assert!(crate::db::MIGRATIONS.iter().any(|(v, sql)| *v == 19 && sql.contains("monitor_session")));
        for t in ["monitor_session", "monitor_event", "monitor_minute"] {
            let n: i64 = c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1", [t], |r| r.get(0)).unwrap();
            assert_eq!(n, 1, "{t}");
        }
        let idx: i64 = c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name IN ('idx_monitor_event_session','idx_monitor_session_started')", [], |r| r.get(0)).unwrap();
        assert_eq!(idx, 2);
        apply_migrations(&c).unwrap();
        let n: i64 = c.query_row("SELECT COUNT(*) FROM schema_migration WHERE version = 19", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        // the SQL itself is idempotent too (IF NOT EXISTS everywhere)
        let sql = crate::db::MIGRATIONS.iter().find(|(v, _)| *v == 19).unwrap().1;
        c.execute_batch(sql).unwrap();
    }

    #[test]
    fn migration_0019_upgrades_every_release_fixture_and_keeps_rows() {
        let all = fixtures();
        assert!(!all.is_empty());
        for (name, sql) in all {
            let c = Connection::open_in_memory().unwrap();
            c.execute_batch(&sql).unwrap();
            c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
            let before: Vec<(String, i64)> = {
                let mut st = c.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migration' ORDER BY name").unwrap();
                let names: Vec<String> = st.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect();
                names.into_iter().map(|t| { let n = table_count(&c, &t); (t, n) }).collect()
            };
            apply_migrations(&c).unwrap();
            for (t, n) in &before {
                assert_eq!(table_count(&c, t), *n, "{name}: {t} row count");
            }
            let ok: String = c.query_row("PRAGMA integrity_check", [], |r| r.get(0)).unwrap();
            assert_eq!(ok, "ok", "{name}");
            let fk: i64 = c.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).unwrap();
            assert_eq!(fk, 0, "{name}");
            // and the new tables work on the upgraded database
            let id = start(&c);
            let mut c = c;
            log_append(&mut c, &id, &[ev(1000, "warning")], &[minute(0, "A")]).unwrap();
            assert_eq!(session_get(&c, &id).unwrap().unwrap().events.len(), 1, "{name}");
        }
    }

    #[test]
    fn session_round_trip_with_events_minutes_and_summary() {
        let mut c = mem();
        let id = start(&c);
        let r = log_append(&mut c, &id, &[ev(5250, "warning"), ev(1000, "critical")], &[minute(0, "A"), minute(0, "B"), minute(1, "A")]).unwrap();
        assert_eq!(r, AppendResult { events_stored: 2, events_dropped: 0, minutes_stored: 3 });
        // re-flushing a minute replaces it, it does not add a row
        let mut m = minute(1, "A");
        m.dropouts = Some(3);
        assert_eq!(log_append(&mut c, &id, &[], &[m]).unwrap().minutes_stored, 0);
        session_end(&c, &id, &json!({"version": 1, "worst": "critical"})).unwrap();
        let log = session_get(&c, &id).unwrap().unwrap();
        assert_eq!(log.version, 1);
        assert_eq!(log.events.iter().map(|e| e.t_ms).collect::<Vec<_>>(), [1000, 5250]);
        assert_eq!(log.minutes.len(), 3);
        assert_eq!(log.minutes.iter().find(|m| m.minute == 1).unwrap().dropouts, Some(3));
        assert_eq!(log.session.summary.as_ref().unwrap()["worst"], "critical");
        assert_eq!((log.session.event_count, log.session.warning_count, log.session.critical_count, log.session.minute_count), (2, 1, 1, 3));
        assert_eq!(log.session.device_name.as_deref(), Some("Traktor Audio 8 DJ"));
        assert_eq!(log.session.config["hopMs"], 250);
        let first_end = log.session.ended_at.clone().unwrap();
        session_end(&c, &id, &json!({"version": 1, "worst": "ok"})).unwrap();
        assert_eq!(session_get(&c, &id).unwrap().unwrap().session.ended_at.unwrap(), first_end, "end time kept");
        // an ended session takes no more events
        assert!(log_append(&mut c, &id, &[ev(9000, "info")], &[]).unwrap_err().contains("ended"));
        let list = session_list(&c, None).unwrap();
        assert_eq!(list.len(), 1);
        assert!(session_delete(&c, &id).unwrap());
        assert_eq!((table_count(&c, "monitor_event"), table_count(&c, "monitor_minute")), (0, 0), "cascade");
        assert!(!session_delete(&c, &id).unwrap());
        assert!(session_get(&c, &id).unwrap().is_none());
    }

    #[test]
    fn list_is_newest_first_and_limited() {
        let c = mem();
        for i in 0..5 {
            let id = start(&c);
            c.execute("UPDATE monitor_session SET started_at = ?2 WHERE id = ?1", params![id, format!("2026-10-0{}T20:00:00.000Z", i + 1)]).unwrap();
        }
        let l = session_list(&c, Some(3)).unwrap();
        assert_eq!(l.len(), 3);
        assert!(l[0].started_at > l[1].started_at && l[1].started_at > l[2].started_at);
        assert_eq!(session_list(&c, Some(0)).unwrap().len(), 1, "limit clamps to at least 1");
    }

    #[test]
    fn events_are_capped_per_session_and_per_call() {
        let mut c = mem();
        let id = start(&c);
        let batch: Vec<EventInput> = (0..MAX_EVENTS_PER_CALL as i64).map(|i| ev(i, "info")).collect();
        let mut stored = 0;
        let mut dropped = 0;
        for _ in 0..(MAX_EVENTS_PER_SESSION as usize / MAX_EVENTS_PER_CALL + 2) {
            let r = log_append(&mut c, &id, &batch, &[]).unwrap();
            stored += r.events_stored;
            dropped += r.events_dropped;
        }
        assert_eq!(stored as i64, MAX_EVENTS_PER_SESSION);
        assert_eq!(dropped, 2 * MAX_EVENTS_PER_CALL);
        assert_eq!(table_count(&c, "monitor_event"), MAX_EVENTS_PER_SESSION);
        let too_many: Vec<EventInput> = (0..=MAX_EVENTS_PER_CALL as i64).map(|i| ev(i, "info")).collect();
        assert!(log_append(&mut c, &id, &too_many, &[]).is_err());
        let mins: Vec<MinuteInput> = (0..=MAX_MINUTES_PER_CALL as i64).map(|m| minute(m, "A")).collect();
        assert!(log_append(&mut c, &id, &[], &mins).is_err());
    }

    #[test]
    fn validation_rejects_bad_arguments_before_sql() {
        let mut c = mem();
        let id = start(&c);
        let bad_events = [
            EventInput { t_ms: -1, ..ev(0, "info") },
            EventInput { t_ms: MAX_T_MS + 1, ..ev(0, "info") },
            EventInput { deck: Some("E".into()), ..ev(0, "info") },
            EventInput { kind: "snr drop".into(), ..ev(0, "info") },
            EventInput { kind: "Snr".into(), ..ev(0, "info") },
            EventInput { kind: "x".repeat(33), ..ev(0, "info") },
            EventInput { severity: "red".into(), ..ev(0, "info") },
            EventInput { value: Some(f64::NAN), ..ev(0, "info") },
            EventInput { baseline: Some(1e9), ..ev(0, "info") },
            EventInput { message: Some("m".repeat(MAX_MESSAGE_CHARS + 1)), ..ev(0, "info") },
            EventInput { message: Some("line\u{0}break".into()), ..ev(0, "info") },
        ];
        for e in bad_events {
            assert!(log_append(&mut c, &id, &[e.clone()], &[]).is_err(), "{e:?}");
        }
        for m in [MinuteInput { minute: -1, ..minute(0, "A") }, MinuteInput { deck: "Z".into(), ..minute(0, "A") }, MinuteInput { dropouts: Some(-2), ..minute(0, "A") }, MinuteInput { hum_db_max: Some(f64::INFINITY), ..minute(0, "A") }] {
            assert!(log_append(&mut c, &id, &[], &[m]).is_err());
        }
        assert_eq!(table_count(&c, "monitor_event"), 0, "nothing stored from a rejected batch");
        for bad_id in ["", "x' OR '1'='1", "../../etc/passwd", &"z".repeat(36)] {
            assert!(log_append(&mut c, bad_id, &[], &[]).is_err());
            assert!(session_get(&c, bad_id).is_err());
            assert!(session_delete(&c, bad_id).is_err());
        }
        assert!(log_append(&mut c, "00000000-0000-4000-8000-000000000000", &[], &[]).unwrap_err().contains("unknown"));
        let base = SessionStartInput { device_name: None, host_api: None, sample_rate: None, format: "Serato CV02.5".into(), config: json!({}), asset_id: None };
        for bad in [
            SessionStartInput { format: " ".into(), ..base.clone() },
            SessionStartInput { format: "f".repeat(81), ..base.clone() },
            SessionStartInput { sample_rate: Some(1), ..base.clone() },
            SessionStartInput { config: json!([1, 2]), ..base.clone() },
            SessionStartInput { config: json!({"x": "y".repeat(MAX_CONFIG_BYTES)}), ..base.clone() },
            SessionStartInput { device_name: Some("d".repeat(MAX_NAME_CHARS + 1)), ..base.clone() },
            SessionStartInput { asset_id: Some("ghost".into()), ..base.clone() },
        ] {
            assert!(session_start(&c, &bad).is_err(), "{bad:?}");
        }
        assert!(session_end(&c, &id, &json!("str")).is_err());
        assert!(session_end(&c, &id, &json!({"x": "y".repeat(MAX_SUMMARY_BYTES)})).is_err());
        assert!(session_end(&c, "00000000-0000-4000-8000-000000000000", &json!({})).is_err());
    }

    #[test]
    fn asset_link_is_checked_and_nulled_on_asset_delete() {
        let c = mem();
        c.execute("INSERT INTO asset (id, nickname, created_at, updated_at) VALUES ('a1','Deck 1','t','t')", []).unwrap();
        let id = session_start(&c, &SessionStartInput { device_name: None, host_api: None, sample_rate: None, format: "Serato CV02.5".into(), config: json!({}), asset_id: Some("a1".into()) }).unwrap().id;
        c.execute("DELETE FROM asset WHERE id = 'a1'", []).unwrap();
        assert_eq!(session_get(&c, &id).unwrap().unwrap().session.asset_id, None);
        // constraint: unknown severity at the SQL level, and orphan events
        assert!(c.execute("INSERT INTO monitor_event (id, session_id, t_ms, kind, severity) VALUES ('e1', ?1, 0, 'x', 'loud')", [&id]).is_err());
        assert!(c.execute("INSERT INTO monitor_event (id, session_id, t_ms, kind, severity) VALUES ('e2', 'nope', 0, 'x', 'info')", []).is_err());
        assert!(c.execute("INSERT INTO monitor_minute (session_id, minute, deck) VALUES ('nope', 0, 'A')", []).is_err());
    }

    #[test]
    fn retention_prunes_old_sessions_closes_crashed_ones_and_caps_the_count() {
        let mut c = mem();
        let old = start(&c);
        let recent = start(&c);
        let open_old = start(&c);
        log_append(&mut c, &old, &[ev(1, "info")], &[minute(0, "A")]).unwrap();
        c.execute("UPDATE monitor_session SET started_at = '2020-01-01T00:00:00.000Z', ended_at = '2020-01-01T01:00:00.000Z' WHERE id = ?1", [&old]).unwrap();
        session_end(&c, &recent, &json!({})).unwrap();
        c.execute("UPDATE monitor_session SET started_at = '2020-01-01T00:00:00.000Z' WHERE id = ?1", [&open_old]).unwrap();
        // on-demand prune leaves open sessions alone
        let r = prune(&mut c, 90, None).unwrap();
        assert_eq!((r.deleted, r.closed, r.retention_days), (1, 0, 90));
        assert!(session_get(&c, &old).unwrap().is_none());
        assert_eq!((table_count(&c, "monitor_event"), table_count(&c, "monitor_minute")), (0, 0));
        assert!(session_get(&c, &open_old).unwrap().is_some());
        // startup prune: sessions left open before the process started are closed at their last event and marked
        // interrupted (an old one then ages out); a session of the running process is not touched
        let crashed = start(&c);
        log_append(&mut c, &crashed, &[ev(90_000, "warning")], &[]).unwrap();
        c.execute("UPDATE monitor_session SET started_at = '2026-10-27T20:00:00.000Z' WHERE id = ?1", [&crashed]).unwrap();
        let running = start(&c);
        let process_start = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs_f64() - 60.0;
        let r = prune(&mut c, 3650, Some(process_start)).unwrap();
        assert_eq!(r.closed, 2);
        let cr = session_get(&c, &crashed).unwrap().unwrap().session;
        assert_eq!(cr.ended_at.as_deref(), Some("2026-10-27T20:01:30.000Z"));
        assert_eq!(cr.summary.unwrap()["endReason"], "interrupted");
        assert!(session_get(&c, &running).unwrap().unwrap().session.ended_at.is_none());
        let r = prune(&mut c, 90, Some(process_start)).unwrap();
        assert_eq!((r.closed, r.deleted), (0, 1), "the 2020 session closed above now ages out");
        assert!(session_get(&c, &open_old).unwrap().is_none());
        assert!(session_get(&c, &recent).unwrap().is_some());
        session_end(&c, &running, &json!({})).unwrap();
        session_end(&c, &crashed, &json!({})).unwrap();
        assert!(prune(&mut c, 0, None).is_err());
        assert!(prune(&mut c, MAX_RETENTION_DAYS + 1, None).is_err());
        // count cap
        for _ in 0..(MAX_SESSIONS + 3) {
            let id = start(&c);
            session_end(&c, &id, &json!({})).unwrap();
        }
        prune(&mut c, MAX_RETENTION_DAYS, None).unwrap();
        assert_eq!(table_count(&c, "monitor_session"), MAX_SESSIONS);
    }

    #[test]
    fn retention_setting_is_read_from_app_state() {
        let c = mem();
        assert_eq!(stored_retention_days(&c), DEFAULT_RETENTION_DAYS);
        crate::app_state::set(&c, SETTINGS_KEY, &json!({"version": 1, "retentionDays": 30})).unwrap();
        assert_eq!(stored_retention_days(&c), 30);
        crate::app_state::set(&c, SETTINGS_KEY, &json!({"retentionDays": 1e12})).unwrap();
        assert_eq!(stored_retention_days(&c), MAX_RETENTION_DAYS);
        crate::app_state::set(&c, SETTINGS_KEY, &json!({"retentionDays": "x"})).unwrap();
        assert_eq!(stored_retention_days(&c), DEFAULT_RETENTION_DAYS);
    }

    #[test]
    fn contract_examples_round_trip() {
        let raw = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/monitor.json")).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        let mut c = mem();
        let input: SessionStartInput = serde_json::from_value(v["monitor_session_start"]["request"]["input"].clone()).unwrap();
        let started = session_start(&c, &input).unwrap();
        assert!(valid_id(&started.id));
        let ap = &v["monitor_log_append"]["request"];
        let events: Vec<EventInput> = serde_json::from_value(ap["events"].clone()).unwrap();
        let minutes: Vec<MinuteInput> = serde_json::from_value(ap["minutes"].clone()).unwrap();
        let r = log_append(&mut c, &started.id, &events, &minutes).unwrap();
        assert_eq!(serde_json::to_value(&r).unwrap(), v["monitor_log_append"]["response"]);
        session_end(&c, &started.id, &v["monitor_session_end"]["request"]["summary"]).unwrap();
        let mut got = serde_json::to_value(session_get(&c, &started.id).unwrap().unwrap()).unwrap();
        let want = &v["monitor_session_get"]["response"];
        for k in ["id", "startedAt", "endedAt"] {
            got["session"][k] = want["session"][k].clone();
        }
        for (i, e) in got["events"].as_array_mut().unwrap().iter_mut().enumerate() {
            e["id"] = want["events"][i]["id"].clone();
        }
        assert_eq!(&got, want);
        let list = serde_json::to_value(session_list(&c, Some(10)).unwrap()).unwrap();
        assert_eq!(list[0]["eventCount"], v["monitor_session_list"]["response"][0]["eventCount"]);
        assert_eq!(list[0]["criticalCount"], v["monitor_session_list"]["response"][0]["criticalCount"]);
    }
}
