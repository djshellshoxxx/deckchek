//! Service worksheets persistence (FS-22, tables from `0016_service_worksheets.sql`).
//!
//! A job ties a customer and a unit (`asset`) to a fault, a status history, an append-only work log
//! (parts, labour, notes; corrections are new rows linked by `amends_id`), before/after test results
//! (`service_job_result`, phase `before|after`, exactly one of `session_id` / `device_test_result_id`)
//! and photos in the FS-00 photo store (`photo_link.owner_kind = 'service_job'`).
//!
//! Privacy: customer name, phone and email stay in this database. No error message, log line or
//! event payload produced here contains them (errors name ids and job numbers only), and no other
//! export reads the `customer` table (diagnostics bundle, packs, ledgers, workspace JSON).
//!
//! Concurrency: single user, but every status change is `UPDATE ... WHERE id = ? AND status = ?expected`
//! so a double click cannot apply a transition twice. Job numbers (`J-<year>-<seq>`) are allocated
//! inside an IMMEDIATE transaction.
//!
//! Completion hook (for FS-23 and later features): every status change emits the Tauri event
//! `job-status-changed` with `{id, jobNumber, assetId, from, to}` (`from` is null on creation); a job is complete when `to` is
//! `ready` or `collected`. Listeners must not expect customer data in the payload.

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::db::{database_path, new_id, now_iso, open_database};
use crate::photo::{self, PhotoAttachInput, PhotoAttached, PhotoLinkInfo};

pub const STATUSES: &[&str] = &["intake", "diagnosing", "awaiting_parts", "repairing", "testing", "ready", "collected", "cancelled"];
pub const TERMINAL: &[&str] = &["collected", "cancelled"];
pub const LOG_KINDS: &[&str] = &["part", "labour", "note"];
pub const PHASES: &[&str] = &["before", "after"];
pub const PHOTO_STAGES: &[&str] = &["intake", "before", "after"];
pub const STATUS_EVENT: &str = "job-status-changed";

pub const MAX_ID_CHARS: usize = 128;
pub const MAX_NAME_CHARS: usize = 120;
pub const MAX_PHONE_CHARS: usize = 40;
pub const MAX_EMAIL_CHARS: usize = 254;
pub const MAX_CUSTOMER_NOTES_CHARS: usize = 2000;
pub const MAX_FAULT_CHARS: usize = 4000;
pub const MAX_CONDITION_CHARS: usize = 2000;
pub const MAX_RESOLUTION_CHARS: usize = 4000;
pub const MAX_NOTE_CHARS: usize = 4000;
pub const MAX_DESCRIPTION_CHARS: usize = 200;
pub const MAX_STATUS_NOTE_CHARS: usize = 500;
pub const MAX_ACCESSORIES: usize = 20;
pub const MAX_ACCESSORY_CHARS: usize = 80;
pub const MAX_NICKNAME_CHARS: usize = 120;
pub const MAX_SERIAL_CHARS: usize = 80;
pub const MAX_QUERY_CHARS: usize = 100;
pub const MAX_LIST_LIMIT: u32 = 500;
pub const MAX_LIST_OFFSET: u32 = 1_000_000;
pub const MAX_LINKS_PER_CALL: usize = 200;
pub const MAX_RESULTS_PER_JOB: i64 = 1000;
pub const MAX_LOG_ENTRIES_PER_JOB: i64 = 5000;
pub const MAX_PHOTOS_PER_JOB: i64 = 10;
pub const MAX_QUANTITY: f64 = 10_000.0;
pub const MAX_UNIT_COST: f64 = 10_000_000.0;
pub const MAX_MINUTES: i64 = 10_080; // one week in a single entry
/// Detail JSON of a device test result larger than this is not parsed for comparison values.
pub const MAX_DETAIL_BYTES: usize = 256 * 1024;
/// Values read per session / result for the comparison.
pub const MAX_VALUES_PER_SOURCE: i64 = 2000;

fn e2s(e: rusqlite::Error) -> String {
    e.to_string()
}

// ------------------------------------------------------------------ transitions

/// Allowed forward transitions (FS-22 §6). Reopen (terminal -> diagnosing) is separate: see [`can_transition`].
pub fn next_statuses(from: &str) -> &'static [&'static str] {
    match from {
        "intake" => &["diagnosing", "cancelled"],
        "diagnosing" => &["awaiting_parts", "repairing", "ready", "cancelled"],
        "awaiting_parts" => &["repairing", "cancelled"],
        "repairing" => &["testing", "awaiting_parts"],
        "testing" => &["ready", "repairing"],
        "ready" => &["collected"],
        _ => &[],
    }
}

/// `reopen` must be set for the only transition out of a terminal status (to `diagnosing`).
pub fn can_transition(from: &str, to: &str, reopen: bool) -> bool {
    if !STATUSES.contains(&from) || !STATUSES.contains(&to) {
        return false;
    }
    if TERMINAL.contains(&from) {
        return reopen && to == "diagnosing";
    }
    !reopen && next_statuses(from).contains(&to)
}

pub fn is_read_only(status: &str) -> bool {
    TERMINAL.contains(&status)
}

// ------------------------------------------------------------------ input validation

/// Trimmed text or None; rejects over-long text and control characters (`multiline` allows LF/CR/TAB).
fn opt_text(field: &str, v: &Option<String>, max: usize, multiline: bool) -> Result<Option<String>, String> {
    let Some(raw) = v else { return Ok(None) };
    let t = raw.trim();
    if t.is_empty() {
        return Ok(None);
    }
    if t.chars().count() > max {
        return Err(format!("{field} is limited to {max} characters"));
    }
    if t.chars().any(|c| c.is_control() && !(multiline && matches!(c, '\n' | '\r' | '\t'))) {
        return Err(format!("{field} contains control characters"));
    }
    Ok(Some(t.to_string()))
}

fn req_text(field: &str, v: &str, max: usize, multiline: bool) -> Result<String, String> {
    opt_text(field, &Some(v.to_string()), max, multiline)?.ok_or_else(|| format!("{field} is required"))
}

fn check_id(field: &str, id: &str) -> Result<(), String> {
    if id.is_empty() || id.chars().count() > MAX_ID_CHARS || id.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(format!("{field} must be 1-{MAX_ID_CHARS} characters without spaces"));
    }
    Ok(())
}

fn check_phone(v: &Option<String>) -> Result<Option<String>, String> {
    let p = opt_text("phone", v, MAX_PHONE_CHARS, false)?;
    if let Some(p) = &p {
        if !p.chars().all(|c| c.is_ascii_digit() || " +-().x#/".contains(c)) || !p.chars().any(|c| c.is_ascii_digit()) {
            return Err("phone may contain digits, spaces and + - ( ) . x # / only".into());
        }
    }
    Ok(p)
}

fn check_email(v: &Option<String>) -> Result<Option<String>, String> {
    let e = opt_text("email", v, MAX_EMAIL_CHARS, false)?;
    if let Some(e) = &e {
        let mut parts = e.splitn(2, '@');
        let (local, domain) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
        if local.is_empty() || domain.is_empty() || domain.contains('@') || !domain.contains('.') || e.chars().any(char::is_whitespace) {
            return Err("email must look like name@example.com".into());
        }
    }
    Ok(e)
}

fn check_accessories(v: &Option<Vec<String>>) -> Result<Vec<String>, String> {
    let list = v.as_deref().unwrap_or(&[]);
    if list.len() > MAX_ACCESSORIES {
        return Err(format!("at most {MAX_ACCESSORIES} accessories"));
    }
    let mut out: Vec<String> = Vec::new();
    for a in list {
        if let Some(t) = opt_text("accessory", &Some(a.clone()), MAX_ACCESSORY_CHARS, false)? {
            if !out.contains(&t) {
                out.push(t);
            }
        }
    }
    Ok(out)
}

// ------------------------------------------------------------------ types

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustomerInput {
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewUnitInput {
    pub product_id: Option<String>,
    pub nickname: String,
    pub serial_number: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobCreateInput {
    pub customer_id: Option<String>,
    pub customer: Option<CustomerInput>,
    pub asset_id: Option<String>,
    pub new_unit: Option<NewUnitInput>,
    pub reported_fault: String,
    pub accessories: Option<Vec<String>>,
    pub arrival_condition: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobPatch {
    pub reported_fault: Option<String>,
    pub accessories: Option<Vec<String>>,
    /// Empty string clears it.
    pub arrival_condition: Option<String>,
    /// Empty string clears it.
    pub resolution: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustomerPatch {
    pub name: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LogPayload {
    pub description: String,
    pub quantity: Option<f64>,
    pub minutes: Option<i64>,
    pub unit_cost: Option<f64>,
    pub amends_id: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobListQuery {
    pub status: Option<String>,
    pub q: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResultLinks {
    #[serde(default)]
    pub session_ids: Vec<String>,
    #[serde(default)]
    pub device_test_result_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobPhotoInput {
    pub bytes_b64: String,
    pub caption: Option<String>,
    pub alt_text: Option<String>,
    pub stage: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub job_number: String,
    pub customer_id: Option<String>,
    pub asset_id: Option<String>,
    pub status: String,
    pub reported_fault: String,
    pub accessories: Vec<String>,
    pub arrival_condition: Option<String>,
    pub resolution: Option<String>,
    pub opened_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
    pub read_only: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    pub id: String,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub job_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSummary {
    #[serde(flatten)]
    pub job: Job,
    pub customer_name: Option<String>,
    pub asset_name: Option<String>,
    pub serial_number: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobList {
    pub jobs: Vec<JobSummary>,
    pub total: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: String,
    pub job_id: String,
    pub kind: String,
    pub description: String,
    pub quantity: Option<f64>,
    pub minutes: Option<i64>,
    pub unit_cost: Option<f64>,
    pub amends_id: Option<String>,
    pub at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusLogEntry {
    pub id: String,
    pub from_status: Option<String>,
    pub to_status: String,
    pub note: Option<String>,
    pub at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRef {
    pub id: String,
    pub nickname: String,
    pub serial_number: Option<String>,
    pub product_id: Option<String>,
    pub profile_id: Option<String>,
    pub is_deleted: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobResult {
    pub id: String,
    pub phase: String,
    pub session_id: Option<String>,
    pub device_test_result_id: Option<String>,
    pub test_id: Option<String>,
    pub status: Option<String>,
    pub at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobDetail {
    pub job: Job,
    pub customer: Option<Customer>,
    pub asset: Option<AssetRef>,
    pub status_log: Vec<StatusLogEntry>,
    pub log: Vec<LogEntry>,
    pub results: Vec<JobResult>,
    pub photos: Vec<PhotoLinkInfo>,
    pub allowed_next: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkOutcome {
    pub linked: usize,
    pub already_linked: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricValue {
    pub phase: String,
    pub metric_key: String,
    pub label: Option<String>,
    pub value: f64,
    pub unit: Option<String>,
    pub uncertainty: Option<f64>,
    pub method_key: String,
    pub method_version: i64,
    pub reference_low: Option<f64>,
    pub reference_high: Option<f64>,
    pub at: String,
    pub source: String,
    pub test_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestStatus {
    pub phase: String,
    pub test_id: String,
    pub title: Option<String>,
    pub status: String,
    pub at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MethodRow {
    pub key: String,
    pub version: i64,
    pub parameters_json: String,
}

/// Raw inputs for the before/after comparison; `app/service.js compareBeforeAfter` does the maths.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonData {
    pub job_id: String,
    pub values: Vec<MetricValue>,
    pub tests: Vec<TestStatus>,
    pub methods: Vec<MethodRow>,
}

// ------------------------------------------------------------------ row helpers

const JOB_COLS: &str = "id, job_number, customer_id, asset_id, status, reported_fault, accessories_json, arrival_condition, resolution, opened_at, updated_at, closed_at";

fn job_row(r: &rusqlite::Row) -> rusqlite::Result<Job> {
    let acc: String = r.get(6)?;
    let status: String = r.get(4)?;
    Ok(Job {
        id: r.get(0)?,
        job_number: r.get(1)?,
        customer_id: r.get(2)?,
        asset_id: r.get(3)?,
        read_only: is_read_only(&status),
        status,
        reported_fault: r.get(5)?,
        accessories: serde_json::from_str(&acc).unwrap_or_default(),
        arrival_condition: r.get(7)?,
        resolution: r.get(8)?,
        opened_at: r.get(9)?,
        updated_at: r.get(10)?,
        closed_at: r.get(11)?,
    })
}

fn find_job(conn: &Connection, id: &str) -> Result<Job, String> {
    check_id("job id", id)?;
    conn.query_row(&format!("SELECT {JOB_COLS} FROM service_job WHERE id = ?1"), [id], job_row)
        .optional()
        .map_err(e2s)?
        .ok_or_else(|| format!("unknown job '{id}'"))
}

fn editable_job(conn: &Connection, id: &str) -> Result<Job, String> {
    let job = find_job(conn, id)?;
    if job.read_only {
        return Err(format!("job {} is {} and read-only; reopen it to make changes", job.job_number, job.status));
    }
    Ok(job)
}

fn touch(conn: &Connection, id: &str, now: &str) -> Result<(), String> {
    conn.execute("UPDATE service_job SET updated_at = ?2 WHERE id = ?1", params![id, now]).map_err(e2s)?;
    Ok(())
}

const CUSTOMER_COLS: &str = "c.id, c.name, c.phone, c.email, c.notes, c.created_at, (SELECT COUNT(*) FROM service_job j WHERE j.customer_id = c.id)";

fn customer_row(r: &rusqlite::Row) -> rusqlite::Result<Customer> {
    Ok(Customer { id: r.get(0)?, name: r.get(1)?, phone: r.get(2)?, email: r.get(3)?, notes: r.get(4)?, created_at: r.get(5)?, job_count: r.get(6)? })
}

fn get_customer(conn: &Connection, id: &str) -> Result<Option<Customer>, String> {
    conn.query_row(&format!("SELECT {CUSTOMER_COLS} FROM customer c WHERE c.id = ?1"), [id], customer_row).optional().map_err(e2s)
}

fn log_row(r: &rusqlite::Row) -> rusqlite::Result<LogEntry> {
    Ok(LogEntry { id: r.get(0)?, job_id: r.get(1)?, kind: r.get(2)?, description: r.get(3)?, quantity: r.get(4)?, minutes: r.get(5)?, unit_cost: r.get(6)?, amends_id: r.get(7)?, at: r.get(8)? })
}

/// Escape LIKE wildcards so a search for `50%` matches literally.
fn like_pattern(q: &str) -> String {
    let mut s = String::from("%");
    for c in q.chars() {
        if matches!(c, '%' | '_' | '\\') {
            s.push('\\');
        }
        s.push(c);
    }
    s.push('%');
    s
}

// ------------------------------------------------------------------ job numbers

/// Next `J-<year>-<seq>` for `year` (4-digit sequence, wider once a year passes 9999 jobs).
/// Call inside the creating transaction so two creations cannot share a number.
pub fn next_job_number(conn: &Connection, year: i32) -> Result<String, String> {
    let prefix = format!("J-{year}-");
    let max: Option<i64> = conn
        .query_row(
            "SELECT MAX(CAST(substr(job_number, ?2) AS INTEGER)) FROM service_job WHERE job_number LIKE ?1 || '%'",
            params![prefix, prefix.len() as i64 + 1],
            |r| r.get(0),
        )
        .map_err(e2s)?;
    Ok(format!("{prefix}{:04}", max.unwrap_or(0) + 1))
}

fn current_year(conn: &Connection) -> Result<i32, String> {
    conn.query_row("SELECT CAST(strftime('%Y','now') AS INTEGER)", [], |r| r.get(0)).map_err(e2s)
}

// ------------------------------------------------------------------ customers

fn validate_customer(c: &CustomerInput) -> Result<(String, Option<String>, Option<String>, Option<String>), String> {
    let name = req_text("customer name", &c.name, MAX_NAME_CHARS, false)?;
    Ok((name, check_phone(&c.phone)?, check_email(&c.email)?, opt_text("customer notes", &c.notes, MAX_CUSTOMER_NOTES_CHARS, true)?))
}

fn insert_customer(conn: &Connection, c: &CustomerInput, now: &str) -> Result<String, String> {
    let (name, phone, email, notes) = validate_customer(c)?;
    let id = new_id();
    conn.execute("INSERT INTO customer (id, name, phone, email, notes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![id, name, phone, email, notes, now]).map_err(e2s)?;
    Ok(id)
}

pub fn customers(conn: &Connection, q: Option<&str>, limit: Option<u32>) -> Result<Vec<Customer>, String> {
    let q = opt_text("q", &q.map(str::to_string), MAX_QUERY_CHARS, false)?;
    let limit = limit.unwrap_or(50).clamp(1, MAX_LIST_LIMIT);
    let mut stmt = conn
        .prepare(&format!("SELECT {CUSTOMER_COLS} FROM customer c WHERE (?1 IS NULL OR c.name LIKE ?1 ESCAPE '\\' OR c.phone LIKE ?1 ESCAPE '\\' OR c.email LIKE ?1 ESCAPE '\\') ORDER BY c.name COLLATE NOCASE, c.id LIMIT ?2"))
        .map_err(e2s)?;
    let rows = stmt.query_map(params![q.as_deref().map(like_pattern), limit], customer_row).map_err(e2s)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)
}

pub fn update_customer(conn: &Connection, id: &str, patch: &CustomerPatch) -> Result<Customer, String> {
    check_id("customer id", id)?;
    let cur = get_customer(conn, id)?.ok_or_else(|| format!("unknown customer '{id}'"))?;
    let name = match &patch.name {
        Some(n) => req_text("customer name", n, MAX_NAME_CHARS, false)?,
        None => cur.name,
    };
    let phone = if patch.phone.is_some() { check_phone(&patch.phone)? } else { cur.phone };
    let email = if patch.email.is_some() { check_email(&patch.email)? } else { cur.email };
    let notes = if patch.notes.is_some() { opt_text("customer notes", &patch.notes, MAX_CUSTOMER_NOTES_CHARS, true)? } else { cur.notes };
    conn.execute("UPDATE customer SET name = ?2, phone = ?3, email = ?4, notes = ?5 WHERE id = ?1", params![id, name, phone, email, notes]).map_err(e2s)?;
    get_customer(conn, id)?.ok_or_else(|| format!("unknown customer '{id}'"))
}

/// Blocked while any job references the customer (FS-22 §7).
pub fn delete_customer(conn: &Connection, id: &str) -> Result<(), String> {
    check_id("customer id", id)?;
    let cur = get_customer(conn, id)?.ok_or_else(|| format!("unknown customer '{id}'"))?;
    if cur.job_count > 0 {
        return Err(format!("this customer has {} job{}; a customer with jobs cannot be deleted", cur.job_count, if cur.job_count == 1 { "" } else { "s" }));
    }
    conn.execute("DELETE FROM customer WHERE id = ?1", [id]).map_err(e2s)?;
    Ok(())
}

// ------------------------------------------------------------------ jobs

fn insert_status_log(conn: &Connection, job_id: &str, from: Option<&str>, to: &str, note: Option<&str>, at: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO service_job_status_log (id, job_id, from_status, to_status, note, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![new_id(), job_id, from, to, note, at],
    )
    .map_err(e2s)?;
    Ok(())
}

/// Creates a job in `intake` (AC-1). `year` overrides the current UTC year (tests: year rollover).
pub fn create_at(conn: &mut Connection, input: &JobCreateInput, year: Option<i32>) -> Result<Job, String> {
    let fault = req_text("reportedFault", &input.reported_fault, MAX_FAULT_CHARS, true)?;
    let accessories = check_accessories(&input.accessories)?;
    let condition = opt_text("arrivalCondition", &input.arrival_condition, MAX_CONDITION_CHARS, true)?;
    match (&input.customer_id, &input.customer) {
        (Some(_), Some(_)) => return Err("give either customerId or customer, not both".into()),
        (None, None) => return Err("a job needs a customer (customerId or customer)".into()),
        (Some(id), None) => check_id("customerId", id)?,
        (None, Some(c)) => {
            validate_customer(c)?;
        }
    }
    match (&input.asset_id, &input.new_unit) {
        (Some(_), Some(_)) => return Err("give either assetId or newUnit, not both".into()),
        (None, None) => return Err("a job needs a unit (assetId or newUnit)".into()),
        (Some(id), None) => check_id("assetId", id)?,
        (None, Some(u)) => {
            req_text("unit nickname", &u.nickname, MAX_NICKNAME_CHARS, false)?;
            opt_text("serialNumber", &u.serial_number, MAX_SERIAL_CHARS, false)?;
            if let Some(p) = &u.product_id {
                check_id("productId", p)?;
            }
        }
    }

    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(e2s)?;
    let now = now_iso(&tx)?;
    let customer_id = match (&input.customer_id, &input.customer) {
        (Some(id), _) => {
            if get_customer(&tx, id)?.is_none() {
                return Err(format!("unknown customer '{id}'"));
            }
            id.clone()
        }
        (None, Some(c)) => insert_customer(&tx, c, &now)?,
        _ => unreachable!("checked above"),
    };
    let asset_id = match (&input.asset_id, &input.new_unit) {
        (Some(id), _) => {
            let deleted: Option<i64> = tx.query_row("SELECT is_deleted FROM asset WHERE id = ?1", [id], |r| r.get(0)).optional().map_err(e2s)?;
            match deleted {
                None => return Err(format!("unknown asset '{id}'")),
                Some(d) if d != 0 => return Err(format!("asset '{id}' is deleted")),
                _ => {}
            }
            id.clone()
        }
        (None, Some(u)) => {
            let nickname = req_text("unit nickname", &u.nickname, MAX_NICKNAME_CHARS, false)?;
            // The asset row travels into workspace exports, packs and ledgers: keep the customer's name out of it.
            let cname: String = tx.query_row("SELECT name FROM customer WHERE id = ?1", [&customer_id], |r| r.get(0)).map_err(e2s)?;
            if cname.chars().count() >= 3 && nickname.to_lowercase().contains(&cname.to_lowercase()) {
                return Err("the unit nickname must not contain the customer's name (unit names appear in exports)".into());
            }
            if let Some(p) = &u.product_id {
                let n: Option<i64> = tx.query_row("SELECT 1 FROM product WHERE id = ?1", [p], |r| r.get(0)).optional().map_err(e2s)?;
                if n.is_none() {
                    return Err(format!("unknown product '{p}'"));
                }
            }
            let serial = opt_text("serialNumber", &u.serial_number, MAX_SERIAL_CHARS, false)?;
            let id = new_id();
            tx.execute(
                "INSERT INTO asset (id, product_id, nickname, serial_number, notes, is_deleted, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'Added for a service job.', 0, ?5, ?5)",
                params![id, u.product_id, nickname, serial, now],
            )
            .map_err(e2s)?;
            id
        }
        _ => unreachable!("checked above"),
    };
    let year = match year {
        Some(y) => y,
        None => current_year(&tx)?,
    };
    if !(2000..=9999).contains(&year) {
        return Err("year out of range".into());
    }
    let number = next_job_number(&tx, year)?;
    let id = new_id();
    tx.execute(
        "INSERT INTO service_job (id, job_number, customer_id, asset_id, status, reported_fault, accessories_json, arrival_condition, opened_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'intake', ?5, ?6, ?7, ?8, ?8)",
        params![id, number, customer_id, asset_id, fault, serde_json::to_string(&accessories).map_err(|e| e.to_string())?, condition, now],
    )
    .map_err(e2s)?;
    insert_status_log(&tx, &id, None, "intake", None, &now)?;
    let job = find_job(&tx, &id)?;
    tx.commit().map_err(e2s)?;
    Ok(job)
}

pub fn create(conn: &mut Connection, input: &JobCreateInput) -> Result<Job, String> {
    create_at(conn, input, None)
}

pub fn list(conn: &Connection, q: &JobListQuery) -> Result<JobList, String> {
    if let Some(s) = &q.status {
        if !STATUSES.contains(&s.as_str()) && s != "open" {
            return Err(format!("status must be one of open, {}", STATUSES.join(", ")));
        }
    }
    let text = opt_text("q", &q.q, MAX_QUERY_CHARS, false)?;
    let limit = q.limit.unwrap_or(50);
    if !(1..=MAX_LIST_LIMIT).contains(&limit) {
        return Err(format!("limit must be 1-{MAX_LIST_LIMIT}"));
    }
    let offset = q.offset.unwrap_or(0);
    if offset > MAX_LIST_OFFSET {
        return Err(format!("offset must be at most {MAX_LIST_OFFSET}"));
    }
    let filter = "FROM service_job j LEFT JOIN customer c ON c.id = j.customer_id LEFT JOIN asset a ON a.id = j.asset_id
        WHERE (?1 IS NULL OR j.status = ?1 OR (?1 = 'open' AND j.status NOT IN ('collected','cancelled')))
          AND (?2 IS NULL OR j.job_number LIKE ?2 ESCAPE '\\' OR c.name LIKE ?2 ESCAPE '\\' OR a.serial_number LIKE ?2 ESCAPE '\\')";
    let pat = text.as_deref().map(like_pattern);
    let total: i64 = conn.query_row(&format!("SELECT COUNT(*) {filter}"), params![q.status, pat], |r| r.get(0)).map_err(e2s)?;
    let cols = JOB_COLS.split(", ").map(|c| format!("j.{c}")).collect::<Vec<_>>().join(", ");
    let mut stmt = conn
        .prepare(&format!("SELECT {cols}, c.name, a.nickname, a.serial_number {filter} ORDER BY j.updated_at DESC, j.job_number DESC LIMIT ?3 OFFSET ?4"))
        .map_err(e2s)?;
    let rows = stmt
        .query_map(params![q.status, pat, limit, offset], |r| Ok(JobSummary { job: job_row(r)?, customer_name: r.get(12)?, asset_name: r.get(13)?, serial_number: r.get(14)? }))
        .map_err(e2s)?;
    Ok(JobList { jobs: rows.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)?, total })
}

pub fn get(conn: &Connection, id: &str) -> Result<JobDetail, String> {
    let job = find_job(conn, id)?;
    let customer = match &job.customer_id {
        Some(c) => get_customer(conn, c)?,
        None => None,
    };
    let asset = match &job.asset_id {
        Some(a) => conn
            .query_row(
                "SELECT a.id, a.nickname, a.serial_number, a.product_id, (SELECT dp.id FROM device_profile dp WHERE dp.product_id = a.product_id ORDER BY dp.id LIMIT 1), a.is_deleted FROM asset a WHERE a.id = ?1",
                [a],
                |r| Ok(AssetRef { id: r.get(0)?, nickname: r.get(1)?, serial_number: r.get(2)?, product_id: r.get(3)?, profile_id: r.get(4)?, is_deleted: r.get::<_, i64>(5)? != 0 }),
            )
            .optional()
            .map_err(e2s)?,
        None => None,
    };
    let mut st = conn.prepare("SELECT id, from_status, to_status, note, at FROM service_job_status_log WHERE job_id = ?1 ORDER BY at, rowid").map_err(e2s)?;
    let status_log = st
        .query_map([id], |r| Ok(StatusLogEntry { id: r.get(0)?, from_status: r.get(1)?, to_status: r.get(2)?, note: r.get(3)?, at: r.get(4)? }))
        .map_err(e2s)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e2s)?;
    let mut st = conn
        .prepare("SELECT id, job_id, kind, description, quantity, minutes, unit_cost, amends_id, at FROM service_job_log WHERE job_id = ?1 ORDER BY at, rowid")
        .map_err(e2s)?;
    let log = st.query_map([id], log_row).map_err(e2s)?.collect::<rusqlite::Result<Vec<_>>>().map_err(e2s)?;
    let mut st = conn
        .prepare(
            "SELECT r.id, r.phase, r.session_id, r.device_test_result_id, d.test_id, COALESCE(d.status, s.status), COALESCE(d.created_at, s.started_at)
             FROM service_job_result r LEFT JOIN device_test_result d ON d.id = r.device_test_result_id LEFT JOIN session s ON s.id = r.session_id
             WHERE r.job_id = ?1 ORDER BY r.phase DESC, 7, r.id",
        )
        .map_err(e2s)?;
    let results = st
        .query_map([id], |r| Ok(JobResult { id: r.get(0)?, phase: r.get(1)?, session_id: r.get(2)?, device_test_result_id: r.get(3)?, test_id: r.get(4)?, status: r.get(5)?, at: r.get(6)? }))
        .map_err(e2s)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e2s)?;
    let photos = photo::list(conn, "service_job", id)?;
    let allowed_next: Vec<String> = if job.read_only { vec!["diagnosing".to_string()] } else { next_statuses(&job.status).iter().map(|s| s.to_string()).collect() };
    Ok(JobDetail { job, customer, asset, status_log, log, results, photos, allowed_next })
}

pub fn update_fields(conn: &Connection, id: &str, patch: &JobPatch) -> Result<Job, String> {
    let job = editable_job(conn, id)?;
    let fault = match &patch.reported_fault {
        Some(f) => req_text("reportedFault", f, MAX_FAULT_CHARS, true)?,
        None => job.reported_fault.clone(),
    };
    let acc = if patch.accessories.is_some() { check_accessories(&patch.accessories)? } else { job.accessories.clone() };
    let condition = if patch.arrival_condition.is_some() { opt_text("arrivalCondition", &patch.arrival_condition, MAX_CONDITION_CHARS, true)? } else { job.arrival_condition.clone() };
    let resolution = if patch.resolution.is_some() { opt_text("resolution", &patch.resolution, MAX_RESOLUTION_CHARS, true)? } else { job.resolution.clone() };
    let now = now_iso(conn)?;
    conn.execute(
        "UPDATE service_job SET reported_fault = ?2, accessories_json = ?3, arrival_condition = ?4, resolution = ?5, updated_at = ?6 WHERE id = ?1",
        params![id, fault, serde_json::to_string(&acc).map_err(|e| e.to_string())?, condition, resolution, now],
    )
    .map_err(e2s)?;
    find_job(conn, id)
}

/// Validated, logged status change (AC-6). `expected` is the status the caller saw; when it no longer
/// matches (double click, second window) nothing changes. Returns the job and the previous status.
pub fn set_status(conn: &mut Connection, id: &str, expected: Option<&str>, to: &str, note: Option<&str>, reopen: bool) -> Result<(Job, String), String> {
    if !STATUSES.contains(&to) {
        return Err(format!("status must be one of {}", STATUSES.join(", ")));
    }
    let note = opt_text("note", &note.map(str::to_string), MAX_STATUS_NOTE_CHARS, true)?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(e2s)?;
    let job = find_job(&tx, id)?;
    let from = match expected {
        Some(e) => {
            if !STATUSES.contains(&e) {
                return Err(format!("expected status must be one of {}", STATUSES.join(", ")));
            }
            e.to_string()
        }
        None => job.status.clone(),
    };
    if !can_transition(&from, to, reopen) {
        return Err(if TERMINAL.contains(&from.as_str()) && !reopen {
            format!("job {} is {}; use Reopen to move it back to diagnosing", job.job_number, from)
        } else {
            format!("a job cannot move from {from} to {to}")
        });
    }
    let now = now_iso(&tx)?;
    let closed = if TERMINAL.contains(&to) { Some(now.clone()) } else { None };
    let n = tx
        .execute("UPDATE service_job SET status = ?3, updated_at = ?4, closed_at = ?5 WHERE id = ?1 AND status = ?2", params![id, from, to, now, closed])
        .map_err(e2s)?;
    if n == 0 {
        return Err(format!("job {} changed meanwhile (it is now {}); reload and try again", job.job_number, job.status));
    }
    let note = match (reopen, note) {
        (true, Some(n)) => Some(format!("Reopened: {n}")),
        (true, None) => Some("Reopened".to_string()),
        (false, n) => n,
    };
    insert_status_log(&tx, id, Some(&from), to, note.as_deref(), &now)?;
    let out = find_job(&tx, id)?;
    tx.commit().map_err(e2s)?;
    Ok((out, from))
}

pub fn add_log(conn: &mut Connection, id: &str, kind: &str, p: &LogPayload) -> Result<LogEntry, String> {
    if !LOG_KINDS.contains(&kind) {
        return Err(format!("kind must be one of {}", LOG_KINDS.join(", ")));
    }
    let (description, quantity, minutes, unit_cost) = match kind {
        "part" => {
            let d = req_text("part name", &p.description, MAX_DESCRIPTION_CHARS, false)?;
            let q = p.quantity.unwrap_or(1.0);
            if !q.is_finite() || q <= 0.0 || q > MAX_QUANTITY {
                return Err(format!("quantity must be above 0 and at most {MAX_QUANTITY}"));
            }
            if let Some(c) = p.unit_cost {
                if !c.is_finite() || !(0.0..=MAX_UNIT_COST).contains(&c) {
                    return Err(format!("unitCost must be between 0 and {MAX_UNIT_COST}"));
                }
            }
            if p.minutes.is_some() {
                return Err("a part has no minutes".into());
            }
            (d, Some(q), None, p.unit_cost)
        }
        "labour" => {
            let d = req_text("labour description", &p.description, MAX_DESCRIPTION_CHARS, false)?;
            let m = p.minutes.ok_or("labour needs minutes")?;
            if !(1..=MAX_MINUTES).contains(&m) {
                return Err(format!("minutes must be 1-{MAX_MINUTES}"));
            }
            if p.quantity.is_some() || p.unit_cost.is_some() {
                return Err("labour has no quantity or unit cost".into());
            }
            (d, None, Some(m), None)
        }
        _ => {
            let d = req_text("note", &p.description, MAX_NOTE_CHARS, true)?;
            if p.quantity.is_some() || p.unit_cost.is_some() || p.minutes.is_some() {
                return Err("a note has text only".into());
            }
            (d, None, None, None)
        }
    };
    let tx = conn.transaction().map_err(e2s)?;
    editable_job(&tx, id)?;
    let count: i64 = tx.query_row("SELECT COUNT(*) FROM service_job_log WHERE job_id = ?1", [id], |r| r.get(0)).map_err(e2s)?;
    if count >= MAX_LOG_ENTRIES_PER_JOB {
        return Err(format!("a job can have at most {MAX_LOG_ENTRIES_PER_JOB} work-log entries"));
    }
    if let Some(a) = &p.amends_id {
        check_id("amendsId", a)?;
        let target: Option<(String, String)> = tx.query_row("SELECT job_id, kind FROM service_job_log WHERE id = ?1", [a], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(e2s)?;
        match target {
            Some((j, k)) if j == id && k == kind => {}
            Some(_) => return Err("an amendment must correct an entry of the same kind in the same job".into()),
            None => return Err(format!("unknown log entry '{a}'")),
        }
        let already: i64 = tx.query_row("SELECT COUNT(*) FROM service_job_log WHERE amends_id = ?1", [a], |r| r.get(0)).map_err(e2s)?;
        if already > 0 {
            return Err("that entry was already amended; amend the latest version".into());
        }
    }
    let now = now_iso(&tx)?;
    let log_id = new_id();
    tx.execute(
        "INSERT INTO service_job_log (id, job_id, kind, description, quantity, minutes, unit_cost, amends_id, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![log_id, id, kind, description, quantity, minutes, unit_cost, p.amends_id, now],
    )
    .map_err(e2s)?;
    touch(&tx, id, &now)?;
    let row = tx
        .query_row("SELECT id, job_id, kind, description, quantity, minutes, unit_cost, amends_id, at FROM service_job_log WHERE id = ?1", [&log_id], log_row)
        .map_err(e2s)?;
    tx.commit().map_err(e2s)?;
    Ok(row)
}

/// Thin wrapper over the FS-00 photo store: owner kind `service_job`, stage intake|before|after, at most 10 per job.
pub fn attach_photo(conn: &mut Connection, dir: &std::path::Path, id: &str, input: &JobPhotoInput) -> Result<PhotoAttached, String> {
    editable_job(conn, id)?;
    let stage = input.stage.as_deref().unwrap_or("intake");
    if !PHOTO_STAGES.contains(&stage) {
        return Err(format!("stage must be one of {}", PHOTO_STAGES.join(", ")));
    }
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM photo_link WHERE owner_kind = 'service_job' AND owner_id = ?1", [id], |r| r.get(0)).map_err(e2s)?;
    if count >= MAX_PHOTOS_PER_JOB {
        return Err(format!("a job can have at most {MAX_PHOTOS_PER_JOB} photos"));
    }
    let attached = photo::attach(
        conn,
        dir,
        &PhotoAttachInput { owner_kind: "service_job".into(), owner_id: id.to_string(), bytes_b64: input.bytes_b64.clone(), caption: input.caption.clone(), alt_text: input.alt_text.clone(), stage: Some(stage.to_string()), is_primary: None },
    )?;
    let now = now_iso(conn)?;
    touch(conn, id, &now)?;
    Ok(attached)
}

/// Links finished results to the job as `before` or `after` evidence (AC-2). Re-linking is a no-op.
/// Device test results must belong to the job's unit.
pub fn link_results(conn: &mut Connection, id: &str, phase: &str, links: &ResultLinks) -> Result<LinkOutcome, String> {
    if !PHASES.contains(&phase) {
        return Err(format!("phase must be one of {}", PHASES.join(", ")));
    }
    let n = links.session_ids.len() + links.device_test_result_ids.len();
    if n == 0 {
        return Err("nothing to link".into());
    }
    if n > MAX_LINKS_PER_CALL {
        return Err(format!("at most {MAX_LINKS_PER_CALL} results per call"));
    }
    for s in links.session_ids.iter().chain(&links.device_test_result_ids) {
        check_id("result id", s)?;
    }
    let tx = conn.transaction().map_err(e2s)?;
    let job = editable_job(&tx, id)?;
    let existing: i64 = tx.query_row("SELECT COUNT(*) FROM service_job_result WHERE job_id = ?1", [id], |r| r.get(0)).map_err(e2s)?;
    if existing + n as i64 > MAX_RESULTS_PER_JOB {
        return Err(format!("a job can link at most {MAX_RESULTS_PER_JOB} results"));
    }
    let (mut linked, mut already) = (0usize, 0usize);
    for s in &links.session_ids {
        let ok: Option<i64> = tx.query_row("SELECT 1 FROM session WHERE id = ?1", [s], |r| r.get(0)).optional().map_err(e2s)?;
        if ok.is_none() {
            return Err(format!("unknown session '{s}'"));
        }
        let c = tx
            .execute("INSERT OR IGNORE INTO service_job_result (id, job_id, phase, session_id) VALUES (?1, ?2, ?3, ?4)", params![new_id(), id, phase, s])
            .map_err(e2s)?;
        if c == 1 { linked += 1 } else { already += 1 }
    }
    for d in &links.device_test_result_ids {
        let asset: Option<String> = tx.query_row("SELECT asset_id FROM device_test_result WHERE id = ?1", [d], |r| r.get(0)).optional().map_err(e2s)?;
        match asset {
            None => return Err(format!("unknown device test result '{d}'")),
            Some(a) if job.asset_id.as_deref() != Some(a.as_str()) => return Err(format!("device test result '{d}' belongs to another unit")),
            _ => {}
        }
        let c = tx
            .execute("INSERT OR IGNORE INTO service_job_result (id, job_id, phase, device_test_result_id) VALUES (?1, ?2, ?3, ?4)", params![new_id(), id, phase, d])
            .map_err(e2s)?;
        if c == 1 { linked += 1 } else { already += 1 }
    }
    let now = now_iso(&tx)?;
    touch(&tx, id, &now)?;
    tx.commit().map_err(e2s)?;
    Ok(LinkOutcome { linked, already_linked: already })
}

fn session_values(conn: &Connection, phase: &str, session: &str, test_id: Option<&str>, out: &mut Vec<MetricValue>) -> Result<(), String> {
    let mut st = conn
        .prepare(
            "SELECT m.metric_key, a.description, m.numeric_value, m.unit, m.uncertainty, a.key, a.version, m.reference_low, m.reference_high, m.created_at
             FROM measurement m JOIN analysis_method a ON a.id = m.method_id
             WHERE m.session_id = ?1 AND m.numeric_value IS NOT NULL ORDER BY m.created_at, m.id LIMIT ?2",
        )
        .map_err(e2s)?;
    let rows = st
        .query_map(params![session, MAX_VALUES_PER_SOURCE], |r| {
            Ok(MetricValue {
                phase: phase.to_string(),
                metric_key: r.get(0)?,
                label: r.get(1)?,
                value: r.get(2)?,
                unit: r.get(3)?,
                uncertainty: r.get(4)?,
                method_key: r.get(5)?,
                method_version: r.get(6)?,
                reference_low: r.get(7)?,
                reference_high: r.get(8)?,
                at: r.get(9)?,
                source: "session".into(),
                test_id: test_id.map(str::to_string),
            })
        })
        .map_err(e2s)?;
    for v in rows {
        let v = v.map_err(e2s)?;
        if v.value.is_finite() {
            out.push(v);
        }
    }
    Ok(())
}

/// Values recorded only in a device test result's detail (runners without a session).
fn detail_values(phase: &str, test_id: &str, detail: &str, at: &str, out: &mut Vec<MetricValue>) {
    if detail.len() > MAX_DETAIL_BYTES {
        return;
    }
    let Ok(v) = serde_json::from_str::<Value>(detail) else { return };
    let version = v.get("methodVersion").and_then(Value::as_i64).unwrap_or(1);
    for m in v.get("measurements").and_then(Value::as_array).map(|a| a.as_slice()).unwrap_or(&[]).iter().take(MAX_VALUES_PER_SOURCE as usize) {
        let (Some(key), Some(value)) = (m.get("metricId").and_then(Value::as_str), m.get("value").and_then(Value::as_f64)) else { continue };
        if key.is_empty() || key.len() > 128 || !value.is_finite() {
            continue;
        }
        out.push(MetricValue {
            phase: phase.to_string(),
            metric_key: key.to_string(),
            label: m.get("label").and_then(Value::as_str).map(|s| s.chars().take(200).collect()),
            value,
            unit: m.get("unit").and_then(Value::as_str).filter(|u| !u.is_empty()).map(|s| s.chars().take(40).collect()),
            uncertainty: m.get("uncertainty").and_then(Value::as_f64).filter(|u| u.is_finite() && *u >= 0.0),
            method_key: key.to_string(),
            method_version: version,
            reference_low: None,
            reference_high: None,
            at: at.to_string(),
            source: "deviceTest".into(),
            test_id: Some(test_id.to_string()),
        });
    }
}

/// Every value linked to the job, per phase, plus test statuses and the method registry rows they use.
pub fn comparison(conn: &Connection, id: &str) -> Result<ComparisonData, String> {
    find_job(conn, id)?;
    let mut values = Vec::new();
    let mut tests = Vec::new();
    let mut seen_sessions: Vec<(String, String)> = Vec::new();
    let mut st = conn.prepare("SELECT phase, session_id, device_test_result_id FROM service_job_result WHERE job_id = ?1 ORDER BY rowid").map_err(e2s)?;
    let links = st
        .query_map([id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, Option<String>>(2)?)))
        .map_err(e2s)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e2s)?;
    for (phase, session, dtr) in links {
        if let Some(s) = session {
            if !seen_sessions.contains(&(phase.clone(), s.clone())) {
                session_values(conn, &phase, &s, None, &mut values)?;
                seen_sessions.push((phase.clone(), s));
            }
        }
        if let Some(d) = dtr {
            let row: Option<(String, Option<String>, String, String, String)> = conn
                .query_row("SELECT test_id, session_id, status, detail_json, created_at FROM device_test_result WHERE id = ?1", [&d], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))
                .optional()
                .map_err(e2s)?;
            let Some((test_id, session, status, detail, at)) = row else { continue };
            let title = if detail.len() <= MAX_DETAIL_BYTES {
                serde_json::from_str::<Value>(&detail).ok().and_then(|v| v.get("title").and_then(Value::as_str).map(|s| s.chars().take(200).collect()))
            } else {
                None
            };
            tests.push(TestStatus { phase: phase.clone(), test_id: test_id.clone(), title, status, at: at.clone() });
            match session {
                Some(s) => {
                    if !seen_sessions.contains(&(phase.clone(), s.clone())) {
                        session_values(conn, &phase, &s, Some(&test_id), &mut values)?;
                        seen_sessions.push((phase.clone(), s));
                    }
                }
                None => detail_values(&phase, &test_id, &detail, &at, &mut values),
            }
        }
    }
    let mut keys: Vec<(String, i64)> = values.iter().map(|v| (v.method_key.clone(), v.method_version)).collect();
    keys.sort();
    keys.dedup();
    let mut methods = Vec::new();
    for (k, v) in keys {
        if let Some(p) = conn.query_row("SELECT parameters_json FROM analysis_method WHERE key = ?1 AND version = ?2", params![k, v], |r| r.get::<_, String>(0)).optional().map_err(e2s)? {
            methods.push(MethodRow { key: k, version: v, parameters_json: p });
        }
    }
    Ok(ComparisonData { job_id: id.to_string(), values, tests, methods })
}

/// Deletes a job and everything that belongs only to it (AC-7): the caller must type the job number.
/// The customer and the unit stay. Photos lose their link; files without other links are removed.
pub fn delete(conn: &mut Connection, dir: &std::path::Path, id: &str, confirm: &str) -> Result<(), String> {
    let tx = conn.transaction().map_err(e2s)?;
    let job = find_job(&tx, id)?;
    if confirm.trim() != job.job_number {
        return Err(format!("type the job number {} to delete this job", job.job_number));
    }
    photo::unlink_owner(&tx, dir, "service_job", id)?;
    tx.execute("DELETE FROM service_job_log WHERE job_id = ?1 AND amends_id IS NOT NULL", [id]).map_err(e2s)?;
    tx.execute("DELETE FROM service_job WHERE id = ?1", [id]).map_err(e2s)?;
    tx.commit().map_err(e2s)
}

// ------------------------------------------------------------------ commands

/// `from` is None for a newly created job.
fn emit_status(app: &AppHandle, job: &Job, from: Option<&str>) {
    let _ = app.emit(STATUS_EVENT, json!({ "id": job.id, "jobNumber": job.job_number, "assetId": job.asset_id, "from": from, "to": job.status }));
}

#[tauri::command]
pub async fn job_create(app: AppHandle, input: JobCreateInput) -> Result<Job, String> {
    crate::db::off_main(move || {
        let mut conn = open_database(&database_path(&app)?)?;
        let job = create(&mut conn, &input)?;
        emit_status(&app, &job, None);
        Ok(job)
    })
    .await?
}

#[tauri::command]
pub async fn job_get(app: AppHandle, id: String) -> Result<JobDetail, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        get(&conn, &id)
    })
    .await?
}

#[tauri::command]
pub async fn job_list(app: AppHandle, query: Option<JobListQuery>) -> Result<JobList, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        list(&conn, &query.unwrap_or_default())
    })
    .await?
}

#[tauri::command]
pub async fn job_update_fields(app: AppHandle, id: String, patch: JobPatch) -> Result<Job, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        update_fields(&conn, &id, &patch)
    })
    .await?
}

#[tauri::command]
pub async fn job_set_status(app: AppHandle, id: String, to: String, expected: Option<String>, note: Option<String>, reopen: Option<bool>) -> Result<Job, String> {
    crate::db::off_main(move || {
        let mut conn = open_database(&database_path(&app)?)?;
        let (job, from) = set_status(&mut conn, &id, expected.as_deref(), &to, note.as_deref(), reopen.unwrap_or(false))?;
        emit_status(&app, &job, Some(&from));
        Ok(job)
    })
    .await?
}

#[tauri::command]
pub async fn job_add_log(app: AppHandle, id: String, kind: String, payload: LogPayload) -> Result<LogEntry, String> {
    crate::db::off_main(move || {
        let mut conn = open_database(&database_path(&app)?)?;
        add_log(&mut conn, &id, &kind, &payload)
    })
    .await?
}

#[tauri::command]
pub async fn job_attach_photo(app: AppHandle, id: String, input: JobPhotoInput) -> Result<PhotoAttached, String> {
    crate::db::off_main(move || {
        let mut conn = open_database(&database_path(&app)?)?;
        attach_photo(&mut conn, &photo::photos_dir(&app)?, &id, &input)
    })
    .await?
}

#[tauri::command]
pub async fn job_link_results(app: AppHandle, id: String, phase: String, links: ResultLinks) -> Result<LinkOutcome, String> {
    crate::db::off_main(move || {
        let mut conn = open_database(&database_path(&app)?)?;
        link_results(&mut conn, &id, &phase, &links)
    })
    .await?
}

#[tauri::command]
pub async fn job_comparison(app: AppHandle, id: String) -> Result<ComparisonData, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        comparison(&conn, &id)
    })
    .await?
}

#[tauri::command]
pub async fn job_delete(app: AppHandle, id: String, confirm: String) -> Result<(), String> {
    crate::db::off_main(move || {
        let mut conn = open_database(&database_path(&app)?)?;
        delete(&mut conn, &photo::photos_dir(&app)?, &id, &confirm)
    })
    .await?
}

#[tauri::command]
pub async fn customer_list(app: AppHandle, q: Option<String>, limit: Option<u32>) -> Result<Vec<Customer>, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        customers(&conn, q.as_deref(), limit)
    })
    .await?
}

#[tauri::command]
pub async fn customer_update(app: AppHandle, id: String, patch: CustomerPatch) -> Result<Customer, String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        update_customer(&conn, &id, &patch)
    })
    .await?
}

#[tauri::command]
pub async fn customer_delete(app: AppHandle, id: String) -> Result<(), String> {
    crate::db::off_main(move || {
        let conn = open_database(&database_path(&app)?)?;
        delete_customer(&conn, &id)
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;
    use crate::photo::test_support::tiny_jpeg;
    use base64::Engine as _;
    use std::path::{Path, PathBuf};

    const PII_NAME: &str = "Zebedee Quixotic-Pii";
    const PII_PHONE: &str = "+44 7700 900123";
    const PII_EMAIL: &str = "zebedee.pii@example.org";

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        c.execute_batch(
            "INSERT INTO asset (id, nickname, serial_number, created_at, updated_at) VALUES ('a1','SL-1200MK4','GH8KA001','t','t'),('a2','Rane Twelve',NULL,'t','t');
             INSERT INTO product (id, model, category, created_at, updated_at) VALUES ('p1','SL-1200MK4','turntable','t','t');",
        )
        .unwrap();
        c
    }

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("deckchek-service-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn customer() -> CustomerInput {
        CustomerInput { name: PII_NAME.into(), phone: Some(PII_PHONE.into()), email: Some(PII_EMAIL.into()), notes: None }
    }

    fn input(asset: &str) -> JobCreateInput {
        JobCreateInput {
            customer_id: None,
            customer: Some(customer()),
            asset_id: Some(asset.into()),
            new_unit: None,
            reported_fault: "Pitch drifts +0.4 %".into(),
            accessories: Some(vec!["Dust cover".into(), "Mains lead".into()]),
            arrival_condition: Some("Light scratches".into()),
        }
    }

    fn n(c: &Connection, q: &str) -> i64 {
        c.query_row(q, [], |r| r.get(0)).unwrap()
    }

    fn add_dtr(c: &Connection, id: &str, asset: &str, test: &str, status: &str, session: Option<&str>, detail: &str, at: &str) {
        c.execute("INSERT OR IGNORE INTO device_profile (id, json, loaded_at) VALUES ('technics-sl-1200mk4','{}','t')", []).unwrap();
        c.execute(
            "INSERT INTO device_test_result (id, asset_id, profile_id, test_id, session_id, status, detail_json, created_at) VALUES (?1, ?2, 'technics-sl-1200mk4', ?3, ?4, ?5, ?6, ?7)",
            params![id, asset, test, session, status, detail, at],
        )
        .unwrap();
    }

    #[test]
    fn migration_0016_fresh_rerun_and_fixture_upgrades() {
        let c = mem();
        assert!(crate::db::MIGRATIONS.iter().any(|(v, s)| *v == 16 && s.contains("service_job_result")));
        apply_migrations(&c).unwrap();
        assert_eq!(n(&c, "SELECT COUNT(*) FROM schema_migration WHERE version = 16"), 1);
        for t in ["customer", "service_job", "service_job_status_log", "service_job_log", "service_job_result"] {
            let k: i64 = c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1", [t], |r| r.get(0)).unwrap();
            assert_eq!(k, 1, "{t}");
        }
        // upgrade from every release fixture: rows kept, schema healthy, jobs usable on old assets
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/db");
        let mut fixtures: Vec<_> = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().path()).filter(|p| p.extension().map_or(false, |x| x == "sql")).collect();
        fixtures.sort();
        assert!(fixtures.len() >= 3);
        for f in fixtures {
            let mut db = Connection::open_in_memory().unwrap();
            db.execute_batch(&std::fs::read_to_string(&f).unwrap()).unwrap();
            db.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
            let assets = n(&db, "SELECT COUNT(*) FROM asset");
            apply_migrations(&db).unwrap();
            apply_migrations(&db).unwrap();
            assert_eq!(n(&db, "SELECT COUNT(*) FROM asset"), assets, "{f:?}");
            assert_eq!(n(&db, "SELECT COUNT(*) FROM pragma_foreign_key_check"), 0, "{f:?}");
            let ok: String = db.query_row("PRAGMA integrity_check", [], |r| r.get(0)).unwrap();
            assert_eq!(ok, "ok");
            let asset: String = db.query_row("SELECT id FROM asset WHERE is_deleted = 0 ORDER BY id LIMIT 1", [], |r| r.get(0)).unwrap();
            let job = create(&mut db, &input(&asset)).unwrap();
            assert_eq!(get(&db, &job.id).unwrap().asset.unwrap().id, asset);
        }
    }

    #[test]
    fn ac1_create_job_in_intake_with_human_number_and_crud_round_trip() {
        let mut c = mem();
        let j = create_at(&mut c, &input("a1"), Some(2026)).unwrap();
        assert_eq!((j.status.as_str(), j.job_number.as_str()), ("intake", "J-2026-0001"));
        assert_eq!(j.accessories, vec!["Dust cover", "Mains lead"]);
        let j2 = create_at(&mut c, &JobCreateInput { customer_id: j.customer_id.clone(), customer: None, ..input("a2") }, Some(2026)).unwrap();
        assert_eq!(j2.job_number, "J-2026-0002");
        assert_eq!(n(&c, "SELECT COUNT(*) FROM customer"), 1, "existing customer reused");
        let d = get(&c, &j.id).unwrap();
        assert_eq!(d.customer.as_ref().unwrap().name, PII_NAME);
        assert_eq!(d.customer.as_ref().unwrap().job_count, 2);
        assert_eq!(d.status_log.len(), 1);
        assert_eq!(d.status_log[0].to_status, "intake");
        assert_eq!(d.allowed_next, vec!["diagnosing", "cancelled"]);
        // new unit instead of an existing asset
        let nu = JobCreateInput { asset_id: None, new_unit: Some(NewUnitInput { product_id: Some("p1".into()), nickname: "SL-1200MK4 (bench)".into(), serial_number: Some("GH9".into()) }), ..input("x") };
        let j3 = create_at(&mut c, &nu, Some(2026)).unwrap();
        let a = get(&c, &j3.id).unwrap().asset.unwrap();
        assert_eq!((a.nickname.as_str(), a.serial_number.as_deref(), a.product_id.as_deref()), ("SL-1200MK4 (bench)", Some("GH9"), Some("p1")));
        // update fields
        let u = update_fields(&c, &j.id, &JobPatch { resolution: Some("Pitch trimmer adjusted".into()), arrival_condition: Some(String::new()), ..Default::default() }).unwrap();
        assert_eq!((u.resolution.as_deref(), u.arrival_condition.as_deref()), (Some("Pitch trimmer adjusted"), None));
        // list: filter, search by job number / customer / serial, total
        let all = list(&c, &JobListQuery { limit: Some(2), ..Default::default() }).unwrap();
        assert_eq!((all.total, all.jobs.len()), (3, 2));
        assert_eq!(list(&c, &JobListQuery { q: Some("J-2026-0002".into()), ..Default::default() }).unwrap().total, 1);
        assert_eq!(list(&c, &JobListQuery { q: Some("quixotic".into()), ..Default::default() }).unwrap().total, 3);
        assert_eq!(list(&c, &JobListQuery { q: Some("GH8KA".into()), ..Default::default() }).unwrap().total, 1);
        assert_eq!(list(&c, &JobListQuery { q: Some("%".into()), ..Default::default() }).unwrap().total, 0, "wildcards are literal");
        assert_eq!(list(&c, &JobListQuery { status: Some("open".into()), ..Default::default() }).unwrap().total, 3);
        assert_eq!(list(&c, &JobListQuery { status: Some("ready".into()), ..Default::default() }).unwrap().total, 0);
    }

    #[test]
    fn create_validates_every_input() {
        let bad = |i: JobCreateInput| create(&mut mem(), &i).unwrap_err();
        assert!(bad(JobCreateInput { reported_fault: "  ".into(), ..input("a1") }).contains("reportedFault"));
        assert!(bad(JobCreateInput { reported_fault: "x".repeat(MAX_FAULT_CHARS + 1), ..input("a1") }).contains("limited"));
        assert!(bad(JobCreateInput { customer: None, ..input("a1") }).contains("customer"));
        assert!(bad(JobCreateInput { customer_id: Some("c".into()), ..input("a1") }).contains("not both"));
        assert!(bad(JobCreateInput { asset_id: None, ..input("a1") }).contains("unit"));
        assert!(bad(input("ghost")).contains("unknown asset"));
        assert!(bad(JobCreateInput { customer: None, customer_id: Some("ghost".into()), ..input("a1") }).contains("unknown customer"));
        assert!(bad(JobCreateInput { accessories: Some(vec!["x".into(); MAX_ACCESSORIES + 1]), ..input("a1") }).contains("accessories"));
        assert!(bad(JobCreateInput { accessories: Some(vec!["y".repeat(MAX_ACCESSORY_CHARS + 1)]), ..input("a1") }).contains("limited"));
        let cust = |name: &str, phone: Option<&str>, email: Option<&str>| JobCreateInput {
            customer: Some(CustomerInput { name: name.into(), phone: phone.map(Into::into), email: email.map(Into::into), notes: None }),
            ..input("a1")
        };
        assert!(bad(cust("", None, None)).contains("customer name"));
        assert!(bad(cust(&"n".repeat(MAX_NAME_CHARS + 1), None, None)).contains("limited"));
        assert!(bad(cust("Ann\u{0007}", None, None)).contains("control"));
        assert!(bad(cust("Ann", Some("call me"), None)).contains("phone"));
        assert!(bad(cust("Ann", None, Some("not-an-email"))).contains("email"));
        assert!(bad(cust("Ann", None, Some("a@b@c.d"))).contains("email"));
        let nu = |nick: &str, product: Option<&str>| JobCreateInput { asset_id: None, new_unit: Some(NewUnitInput { product_id: product.map(Into::into), nickname: nick.into(), serial_number: None }), ..input("x") };
        assert!(bad(nu("", None)).contains("nickname"));
        assert!(bad(nu("Deck", Some("ghost"))).contains("unknown product"));
        let e = bad(nu(&format!("{PII_NAME}'s deck"), None));
        assert!(e.contains("customer's name") && !e.contains(PII_NAME), "guard error never echoes the name");
        // a failed attempt writes nothing
        let mut c = mem();
        assert!(create(&mut c, &input("ghost")).is_err());
        assert_eq!(n(&c, "SELECT COUNT(*) FROM customer") + n(&c, "SELECT COUNT(*) FROM service_job"), 0, "transaction rolled back");
        assert!(list(&c, &JobListQuery { status: Some("lost".into()), ..Default::default() }).is_err());
        assert!(list(&c, &JobListQuery { limit: Some(0), ..Default::default() }).is_err());
        assert!(list(&c, &JobListQuery { limit: Some(MAX_LIST_LIMIT + 1), ..Default::default() }).is_err());
        assert!(list(&c, &JobListQuery { offset: Some(MAX_LIST_OFFSET + 1), ..Default::default() }).is_err());
        assert!(list(&c, &JobListQuery { q: Some("q".repeat(MAX_QUERY_CHARS + 1)), ..Default::default() }).is_err());
        assert!(get(&c, "").is_err() && get(&c, &"i".repeat(MAX_ID_CHARS + 1)).is_err() && get(&c, "a b").is_err());
        let json: Result<JobCreateInput, _> = serde_json::from_value(json!({"reportedFault": "x", "assetId": "a1", "customerId": "c", "price": 3}));
        assert!(json.is_err(), "unknown fields rejected");
    }

    #[test]
    fn job_numbers_restart_at_year_rollover_and_widen_past_9999() {
        let mut c = mem();
        assert_eq!(create_at(&mut c, &input("a1"), Some(2026)).unwrap().job_number, "J-2026-0001");
        assert_eq!(create_at(&mut c, &input("a1"), Some(2026)).unwrap().job_number, "J-2026-0002");
        assert_eq!(create_at(&mut c, &input("a1"), Some(2027)).unwrap().job_number, "J-2027-0001");
        assert_eq!(create_at(&mut c, &input("a1"), Some(2026)).unwrap().job_number, "J-2026-0003");
        c.execute("UPDATE service_job SET job_number = 'J-2026-9999' WHERE job_number = 'J-2026-0003'", []).unwrap();
        assert_eq!(create_at(&mut c, &input("a1"), Some(2026)).unwrap().job_number, "J-2026-10000");
        assert_eq!(create_at(&mut c, &input("a1"), Some(2026)).unwrap().job_number, "J-2026-10001", "numeric, not text, maximum");
        assert!(create_at(&mut c, &input("a1"), Some(1999)).is_err());
    }

    #[test]
    fn unique_job_number_under_rapid_creation_from_several_connections() {
        let dir = tmp("rapid");
        let path = dir.join("db.sqlite3");
        {
            let c = Connection::open(&path).unwrap();
            c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;").unwrap();
            apply_migrations(&c).unwrap();
            c.execute("INSERT INTO asset (id, nickname, created_at, updated_at) VALUES ('a1','Deck','t','t')", []).unwrap();
        }
        let handles: Vec<_> = (0..4)
            .map(|_| {
                let path = path.clone();
                std::thread::spawn(move || {
                    let mut c = Connection::open(&path).unwrap();
                    c.busy_timeout(std::time::Duration::from_secs(20)).unwrap();
                    c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
                    (0..10).map(|_| create_at(&mut c, &input("a1"), Some(2026)).unwrap().job_number).collect::<Vec<_>>()
                })
            })
            .collect();
        let mut all: Vec<String> = handles.into_iter().flat_map(|h| h.join().unwrap()).collect();
        all.sort();
        let len = all.len();
        all.dedup();
        assert_eq!((len, all.len()), (40, 40), "no duplicate job numbers");
        assert_eq!(all.last().unwrap(), "J-2026-0040");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn transition_table_is_exhaustive() {
        let allowed: &[(&str, &str)] = &[
            ("intake", "diagnosing"),
            ("intake", "cancelled"),
            ("diagnosing", "awaiting_parts"),
            ("diagnosing", "repairing"),
            ("diagnosing", "ready"),
            ("diagnosing", "cancelled"),
            ("awaiting_parts", "repairing"),
            ("awaiting_parts", "cancelled"),
            ("repairing", "testing"),
            ("repairing", "awaiting_parts"),
            ("testing", "ready"),
            ("testing", "repairing"),
            ("ready", "collected"),
        ];
        for from in STATUSES {
            for to in STATUSES {
                let want = allowed.contains(&(*from, *to));
                assert_eq!(can_transition(from, to, false), want, "{from} -> {to}");
                assert_eq!(can_transition(from, to, true), TERMINAL.contains(from) && *to == "diagnosing", "reopen {from} -> {to}");
            }
        }
        assert!(!can_transition("intake", "bogus", false) && !can_transition("bogus", "intake", false));
    }

    #[test]
    fn ac6_status_changes_are_validated_logged_and_guarded_against_double_clicks() {
        let mut c = mem();
        let j = create(&mut c, &input("a1")).unwrap();
        assert!(set_status(&mut c, &j.id, None, "ready", None, false).unwrap_err().contains("cannot move from intake to ready"));
        let (d, from) = set_status(&mut c, &j.id, Some("intake"), "diagnosing", Some("Bench check"), false).unwrap();
        assert_eq!((d.status.as_str(), from.as_str()), ("diagnosing", "intake"));
        // a second click with the stale expected status changes nothing
        let e = set_status(&mut c, &j.id, Some("intake"), "diagnosing", None, false).unwrap_err();
        assert!(e.contains("changed meanwhile"), "{e}");
        assert!(set_status(&mut c, &j.id, Some("intake"), "cancelled", None, false).unwrap_err().contains("changed meanwhile"));
        for to in ["repairing", "testing", "ready", "collected"] {
            set_status(&mut c, &j.id, None, to, None, false).unwrap();
        }
        let det = get(&c, &j.id).unwrap();
        assert_eq!(det.status_log.iter().map(|s| s.to_status.as_str()).collect::<Vec<_>>(), ["intake", "diagnosing", "repairing", "testing", "ready", "collected"]);
        assert!(det.status_log.iter().all(|s| crate::usage::valid_timestamp(&s.at)), "every change has a timestamp");
        assert_eq!(det.status_log[1].note.as_deref(), Some("Bench check"));
        assert!(det.job.closed_at.is_some() && det.job.read_only);
        assert!(set_status(&mut c, &j.id, None, "diagnosing", None, false).unwrap_err().contains("Reopen"));
        let (r, _) = set_status(&mut c, &j.id, None, "diagnosing", Some("Came back"), true).unwrap();
        assert!(!r.read_only && r.closed_at.is_none());
        assert_eq!(get(&c, &j.id).unwrap().status_log.last().unwrap().note.as_deref(), Some("Reopened: Came back"));
        assert!(set_status(&mut c, &j.id, None, "nope", None, false).is_err());
        assert!(set_status(&mut c, &j.id, Some("nope"), "ready", None, false).is_err());
        assert!(set_status(&mut c, &j.id, None, "ready", Some(&"n".repeat(MAX_STATUS_NOTE_CHARS + 1)), false).is_err());
        assert!(set_status(&mut c, "ghost", None, "ready", None, false).unwrap_err().contains("unknown job"));
    }

    #[test]
    fn ac3_work_log_parts_labour_notes_and_amendments() {
        let mut c = mem();
        let j = create(&mut c, &input("a1")).unwrap();
        let p = add_log(&mut c, &j.id, "part", &LogPayload { description: "Pitch fader".into(), quantity: Some(2.0), unit_cost: Some(12.5), ..Default::default() }).unwrap();
        assert_eq!((p.quantity, p.unit_cost), (Some(2.0), Some(12.5)));
        add_log(&mut c, &j.id, "part", &LogPayload { description: "Grease".into(), ..Default::default() }).unwrap();
        add_log(&mut c, &j.id, "labour", &LogPayload { description: "Strip and clean".into(), minutes: Some(45), ..Default::default() }).unwrap();
        let note = add_log(&mut c, &j.id, "note", &LogPayload { description: "Trimmer VR1 at 3 o'clock\nre-check".into(), ..Default::default() }).unwrap();
        let am = add_log(&mut c, &j.id, "note", &LogPayload { description: "Trimmer VR1 at 2 o'clock".into(), amends_id: Some(note.id.clone()), ..Default::default() }).unwrap();
        assert_eq!(am.amends_id.as_deref(), Some(note.id.as_str()));
        assert!(add_log(&mut c, &j.id, "note", &LogPayload { description: "again".into(), amends_id: Some(note.id.clone()), ..Default::default() }).unwrap_err().contains("already amended"));
        assert!(add_log(&mut c, &j.id, "part", &LogPayload { description: "x".into(), amends_id: Some(note.id.clone()), ..Default::default() }).unwrap_err().contains("same kind"));
        assert!(add_log(&mut c, &j.id, "note", &LogPayload { description: "x".into(), amends_id: Some("ghost".into()), ..Default::default() }).is_err());
        let log = get(&c, &j.id).unwrap().log;
        assert_eq!(log.len(), 5);
        assert_eq!(log.iter().find(|l| l.id == note.id).unwrap().description, "Trimmer VR1 at 3 o'clock\nre-check", "original kept (append-only)");
        let id = j.id.clone();
        let bad = |c: &mut Connection, kind: &str, p: LogPayload| add_log(c, &id, kind, &p).unwrap_err();
        assert!(bad(&mut c, "invoice", LogPayload { description: "x".into(), ..Default::default() }).contains("kind"));
        assert!(bad(&mut c, "part", LogPayload { description: "x".into(), quantity: Some(0.0), ..Default::default() }).contains("quantity"));
        assert!(bad(&mut c, "part", LogPayload { description: "x".into(), quantity: Some(f64::NAN), ..Default::default() }).contains("quantity"));
        assert!(bad(&mut c, "part", LogPayload { description: "x".into(), unit_cost: Some(-1.0), ..Default::default() }).contains("unitCost"));
        assert!(bad(&mut c, "part", LogPayload { description: "x".repeat(MAX_DESCRIPTION_CHARS + 1), ..Default::default() }).contains("limited"));
        assert!(bad(&mut c, "part", LogPayload { description: "a\nb".into(), ..Default::default() }).contains("control"));
        assert!(bad(&mut c, "labour", LogPayload { description: "x".into(), ..Default::default() }).contains("minutes"));
        assert!(bad(&mut c, "labour", LogPayload { description: "x".into(), minutes: Some(MAX_MINUTES + 1), ..Default::default() }).contains("minutes"));
        assert!(bad(&mut c, "labour", LogPayload { description: "x".into(), minutes: Some(5), unit_cost: Some(1.0), ..Default::default() }).contains("no quantity"));
        assert!(bad(&mut c, "note", LogPayload { description: "x".into(), minutes: Some(5), ..Default::default() }).contains("text only"));
        assert!(bad(&mut c, "note", LogPayload { description: " ".into(), ..Default::default() }).contains("required"));
    }

    #[test]
    fn ac7_cancelled_job_is_kept_read_only_and_delete_needs_the_job_number() {
        let mut c = mem();
        let dir = tmp("ac7");
        let j = create_at(&mut c, &input("a1"), Some(2026)).unwrap();
        add_log(&mut c, &j.id, "note", &LogPayload { description: "Customer declined quote".into(), ..Default::default() }).unwrap();
        let first = add_log(&mut c, &j.id, "labour", &LogPayload { description: "Diag".into(), minutes: Some(10), ..Default::default() }).unwrap();
        add_log(&mut c, &j.id, "labour", &LogPayload { description: "Diag".into(), minutes: Some(15), amends_id: Some(first.id), ..Default::default() }).unwrap();
        let b64 = base64::engine::general_purpose::STANDARD.encode(tiny_jpeg(8, 8, &[], 1));
        attach_photo(&mut c, &dir, &j.id, &JobPhotoInput { bytes_b64: b64, caption: Some("Arrival".into()), alt_text: None, stage: Some("intake".into()) }).unwrap();
        set_status(&mut c, &j.id, None, "cancelled", Some("Declined"), false).unwrap();
        let d = get(&c, &j.id).unwrap();
        assert!(d.job.read_only && d.log.len() == 3 && d.photos.len() == 1, "data kept");
        assert_eq!(d.allowed_next, vec!["diagnosing"]);
        assert!(add_log(&mut c, &j.id, "note", &LogPayload { description: "x".into(), ..Default::default() }).unwrap_err().contains("read-only"));
        assert!(update_fields(&c, &j.id, &JobPatch { resolution: Some("x".into()), ..Default::default() }).unwrap_err().contains("read-only"));
        assert!(link_results(&mut c, &j.id, "before", &ResultLinks { session_ids: vec!["s".into()], ..Default::default() }).unwrap_err().contains("read-only"));
        assert!(attach_photo(&mut c, &dir, &j.id, &JobPhotoInput { bytes_b64: String::new(), caption: None, alt_text: None, stage: None }).unwrap_err().contains("read-only"));
        assert!(delete(&mut c, &dir, &j.id, "J-2026-0002").unwrap_err().contains("J-2026-0001"));
        assert!(delete(&mut c, &dir, &j.id, "").is_err());
        assert_eq!(n(&c, "SELECT COUNT(*) FROM service_job"), 1);
        delete(&mut c, &dir, &j.id, " J-2026-0001 ").unwrap();
        for t in ["service_job", "service_job_log", "service_job_status_log", "service_job_result"] {
            assert_eq!(n(&c, &format!("SELECT COUNT(*) FROM {t}")), 0, "{t}");
        }
        assert_eq!(n(&c, "SELECT COUNT(*) FROM photo_link WHERE owner_kind = 'service_job'"), 0);
        assert_eq!(n(&c, "SELECT COUNT(*) FROM photo"), 0, "orphaned photo removed");
        assert_eq!(n(&c, "SELECT COUNT(*) FROM customer"), 1, "customer kept");
        assert_eq!(n(&c, "SELECT COUNT(*) FROM asset WHERE id = 'a1'"), 1, "unit kept");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn deleting_a_customer_with_jobs_is_blocked_and_errors_never_echo_pii() {
        let mut c = mem();
        let j = create(&mut c, &input("a1")).unwrap();
        let cid = j.customer_id.clone().unwrap();
        let e = delete_customer(&c, &cid).unwrap_err();
        assert!(e.contains("1 job") && !e.contains(PII_NAME));
        assert!(c.execute("DELETE FROM customer WHERE id = ?1", [&cid]).is_err(), "FK also blocks a raw delete");
        let u = update_customer(&c, &cid, &CustomerPatch { phone: Some(String::new()), notes: Some("Prefers email".into()), ..Default::default() }).unwrap();
        assert_eq!((u.phone, u.notes.as_deref(), u.name.as_str()), (None, Some("Prefers email"), PII_NAME));
        assert!(update_customer(&c, &cid, &CustomerPatch { email: Some("nope".into()), ..Default::default() }).is_err());
        assert!(update_customer(&c, &cid, &CustomerPatch { name: Some(String::new()), ..Default::default() }).is_err());
        assert_eq!(customers(&c, Some("zebedee"), None).unwrap().len(), 1);
        assert_eq!(customers(&c, Some("nobody"), None).unwrap().len(), 0);
        let dir = tmp("cust");
        delete(&mut c, &dir, &j.id, &j.job_number).unwrap();
        delete_customer(&c, &cid).unwrap();
        assert_eq!(n(&c, "SELECT COUNT(*) FROM customer"), 0);
        assert!(delete_customer(&c, &cid).unwrap_err().contains("unknown customer"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn ac2_results_link_with_phase_and_comparison_reads_both_sources() {
        let mut c = mem();
        let j = create(&mut c, &input("a1")).unwrap();
        c.execute_batch(
            "INSERT INTO session (id, session_type, started_at, app_version, schema_version, status) VALUES ('s-before','speed','2026-10-10T10:00:00Z','0',1,'completed'),('s-after','speed','2026-10-12T10:00:00Z','0',1,'completed');
             INSERT INTO analysis_method (id, key, version, description, parameters_json, created_at) VALUES ('method:speed_error_pct:1','speed_error_pct',1,'Speed error','{\"unit\":\"%\"}','t'),('method:wow_pct:2','wow_pct',2,'Wow v2','{}','t');
             INSERT INTO measurement (id, session_id, method_id, metric_key, state, numeric_value, unit, uncertainty, created_at) VALUES
               ('m1','s-before','method:speed_error_pct:1','speed_error_pct','measured',0.42,'%',0.02,'2026-10-10T10:00:00Z'),
               ('m2','s-after','method:speed_error_pct:1','speed_error_pct','measured',0.03,'%',0.02,'2026-10-12T10:00:00Z'),
               ('m3','s-after','method:wow_pct:2','wow_pct','measured',NULL,'%',NULL,'2026-10-12T10:00:00Z');",
        )
        .unwrap();
        add_dtr(&c, "d-before", "a1", "sl-balance", "fail", None, r#"{"title":"Channel balance","measurements":[{"metricId":"balance_db","label":"Balance","value":1.8,"unit":"dB"}]}"#, "2026-10-10T11:00:00.000Z");
        add_dtr(&c, "d-after", "a1", "sl-balance", "pass", None, r#"{"title":"Channel balance","measurements":[{"metricId":"balance_db","value":0.2,"unit":"dB"},{"metricId":"bad","value":"x"}]}"#, "2026-10-12T11:00:00.000Z");
        add_dtr(&c, "d-sess", "a1", "sl-speed", "pass", Some("s-after"), r#"{"measurements":[{"metricId":"speed_error_pct","value":99}]}"#, "2026-10-12T10:00:00.000Z");
        add_dtr(&c, "d-other", "a2", "x", "pass", None, "{}", "2026-10-12T10:00:00.000Z");
        let r = link_results(&mut c, &j.id, "before", &ResultLinks { session_ids: vec!["s-before".into()], device_test_result_ids: vec!["d-before".into()] }).unwrap();
        assert_eq!((r.linked, r.already_linked), (2, 0));
        let r = link_results(&mut c, &j.id, "before", &ResultLinks { session_ids: vec!["s-before".into()], ..Default::default() }).unwrap();
        assert_eq!((r.linked, r.already_linked), (0, 1), "re-linking is a no-op (unique index)");
        link_results(&mut c, &j.id, "after", &ResultLinks { device_test_result_ids: vec!["d-after".into(), "d-sess".into()], ..Default::default() }).unwrap();
        assert!(link_results(&mut c, &j.id, "after", &ResultLinks { device_test_result_ids: vec!["d-other".into()], ..Default::default() }).unwrap_err().contains("another unit"));
        assert!(link_results(&mut c, &j.id, "during", &ResultLinks { session_ids: vec!["s-before".into()], ..Default::default() }).is_err());
        assert!(link_results(&mut c, &j.id, "after", &ResultLinks::default()).is_err());
        assert!(link_results(&mut c, &j.id, "after", &ResultLinks { session_ids: vec!["ghost".into()], ..Default::default() }).unwrap_err().contains("unknown session"));
        assert!(link_results(&mut c, &j.id, "after", &ResultLinks { session_ids: vec!["s".into(); MAX_LINKS_PER_CALL + 1], ..Default::default() }).is_err());
        let det = get(&c, &j.id).unwrap();
        assert_eq!(det.results.iter().filter(|r| r.phase == "before").count(), 2);
        assert_eq!(det.results.iter().find(|r| r.device_test_result_id.as_deref() == Some("d-before")).unwrap().status.as_deref(), Some("fail"));
        let cmp = comparison(&c, &j.id).unwrap();
        let v = |phase: &str, key: &str| cmp.values.iter().filter(|v| v.phase == phase && v.metric_key == key).map(|v| v.value).collect::<Vec<_>>();
        assert_eq!(v("before", "speed_error_pct"), [0.42]);
        assert_eq!(v("after", "speed_error_pct"), [0.03], "session value wins over the result's detail copy");
        assert_eq!(v("before", "balance_db"), [1.8]);
        assert_eq!(v("after", "balance_db"), [0.2]);
        assert!(v("after", "bad").is_empty() && v("after", "wow_pct").is_empty(), "non-numeric values skipped");
        let s = cmp.values.iter().find(|v| v.metric_key == "speed_error_pct").unwrap();
        assert_eq!((s.uncertainty, s.method_version, s.source.as_str()), (Some(0.02), 1, "session"));
        assert_eq!(cmp.tests.iter().map(|t| (t.phase.as_str(), t.status.as_str())).collect::<Vec<_>>(), [("before", "fail"), ("after", "pass"), ("after", "pass")]);
        assert_eq!(cmp.tests[0].title.as_deref(), Some("Channel balance"));
        assert!(cmp.methods.iter().any(|m| m.key == "speed_error_pct" && m.parameters_json.contains("unit")));
        assert!(c.execute("INSERT INTO service_job_result (id, job_id, phase, device_test_result_id) VALUES ('x', ?1, 'after', 'ghost')", [&j.id]).is_err(), "FK on results");
    }

    #[test]
    fn ac8_photos_by_content_hash_capped_at_ten_and_metadata_rejected() {
        let mut c = mem();
        let dir = tmp("photos");
        let j = create(&mut c, &input("a1")).unwrap();
        let b64 = |b: Vec<u8>| base64::engine::general_purpose::STANDARD.encode(b);
        let ph = |seed: u8, stage: Option<&str>| JobPhotoInput { bytes_b64: b64(tiny_jpeg(8, 8, &[], seed)), caption: Some(format!("Photo {seed}")), alt_text: None, stage: stage.map(Into::into) };
        let a = attach_photo(&mut c, &dir, &j.id, &ph(1, Some("intake"))).unwrap();
        assert!(dir.join(format!("{}.jpg", a.sha256)).is_file(), "stored as photos/<sha256>.jpg");
        let again = attach_photo(&mut c, &dir, &j.id, &ph(1, Some("intake"))).unwrap();
        assert_eq!(again.photo_id, a.photo_id, "dedupe by hash");
        assert!(again.deduplicated);
        let j2 = create(&mut c, &input("a2")).unwrap();
        assert!(attach_photo(&mut c, &dir, &j2.id, &ph(1, None)).unwrap().deduplicated, "same file shared by two jobs");
        let exif = JobPhotoInput { bytes_b64: b64(tiny_jpeg(8, 8, &[0xFF, 0xE1, 0, 8, b'E', b'x', b'i', b'f', 0, 0], 3)), ..ph(3, None) };
        assert!(attach_photo(&mut c, &dir, &j.id, &exif).is_err(), "EXIF/GPS segment rejected");
        assert!(attach_photo(&mut c, &dir, &j.id, &ph(4, Some("during"))).unwrap_err().contains("stage"));
        for seed in 10..19 {
            attach_photo(&mut c, &dir, &j.id, &ph(seed, Some("before"))).unwrap();
        }
        assert_eq!(get(&c, &j.id).unwrap().photos.len(), 10);
        assert!(attach_photo(&mut c, &dir, &j.id, &ph(30, None)).unwrap_err().contains("at most 10"));
        assert_eq!(get(&c, &j.id).unwrap().photos[0].caption.as_deref(), Some("Photo 1"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sheet_paths_reject_traversal_unc_and_reserved_names() {
        for bad in ["..\\..\\Windows\\job.html", "../../etc/job.html", "\\\\server\\share\\job.html", "C:\\Users\\x\\CON.html", "nul.html", "job.exe"] {
            assert!(crate::userfiles::validate_save_path(bad, &["html", "pdf"]).is_err(), "{bad}");
        }
    }

    #[test]
    fn customer_pii_never_reaches_the_diagnostics_bundle() {
        use crate::diagnostics::{build_parts, BundleInputs, BundleOpts, ClientContext, RedactCtx};
        let dir = tmp("pii");
        let logs = dir.join("logs");
        std::fs::create_dir_all(&logs).unwrap();
        let mut c = Connection::open(dir.join("db.sqlite3")).unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        c.execute_batch(
            "INSERT INTO asset (id, nickname, created_at, updated_at) VALUES ('a1','SL-1200MK4','t','t');
             INSERT INTO session (id, session_type, started_at, app_version, schema_version, status, context_profile) VALUES ('s1','diagnostic','2026-10-10T10:00:00Z','0',1,'completed','speed');",
        )
        .unwrap();
        let j = create(&mut c, &JobCreateInput { reported_fault: format!("Ring {PII_PHONE} when done"), ..input("a1") }).unwrap();
        link_results(&mut c, &j.id, "before", &ResultLinks { session_ids: vec!["s1".into()], ..Default::default() }).unwrap();
        add_log(&mut c, &j.id, "note", &LogPayload { description: format!("Emailed {PII_EMAIL}"), ..Default::default() }).unwrap();
        // errors from command paths name ids or job numbers only
        let errs = [
            delete_customer(&c, j.customer_id.as_deref().unwrap()).unwrap_err(),
            set_status(&mut c, &j.id, None, "collected", None, false).unwrap_err(),
            delete(&mut c, &dir, &j.id, PII_NAME).unwrap_err(),
            create(&mut c, &JobCreateInput { asset_id: None, new_unit: Some(NewUnitInput { product_id: None, nickname: format!("{PII_NAME} deck"), serial_number: None }), ..input("x") }).unwrap_err(),
        ];
        for e in errs {
            assert!(![PII_NAME, PII_PHONE, PII_EMAIL].iter().any(|p| e.contains(p)), "error leaks PII: {e}");
        }
        // settings as the service screen persists them (status filter only, never search text or drafts)
        let o = BundleOpts { redact: false, run_count: 50, context: Some(ClientContext { settings: Some(json!({"serviceList": {"status": "open"}})), ..Default::default() }) };
        let ctx = RedactCtx::new();
        let parts = build_parts(&BundleInputs { dir: &logs, app_version: "0.0.7", conn: Some(&c), ctx: &ctx, opts: &o, previous_marker: None, now_iso: "t".into() });
        assert!(parts.iter().any(|p| p.info.name == "runs-summary.json" && p.info.status == "ok"));
        for p in &parts {
            let text = String::from_utf8_lossy(&p.bytes);
            for pii in [PII_NAME, PII_PHONE, PII_EMAIL, "Zebedee", "900123"] {
                assert!(!text.contains(pii), "{} contains customer PII {pii}", p.info.name);
            }
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
