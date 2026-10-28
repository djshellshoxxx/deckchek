//! FS-21 population packs (tables from `0015_unit_population.sql` and `0022_unit_population_ext.sql`).
//!
//! A `.deckchek-pack` is an anonymous JSON file: product key, metric id, method key and version,
//! value and unit, plus a random contributor token. Packs are UNTRUSTED input. Importing therefore
//! checks the file size before reading anything, caps rows and nesting, demands the exact field set
//! (unknown fields are refused, never ignored), validates every identifier against
//! `[a-z0-9._:-]{1,64}`, and accepts a metric only when it is listed in `app/population-metrics.json`
//! with the listed unit and inside its plausible range. The same table is the export whitelist, so
//! the exporter can never write a field or metric that the importer would refuse. Nothing here
//! panics on bad input: every failure is a typed [`PackError`] with a stable `code`.
//!
//! One invalid row rejects the whole pack (a pack that contains poison is not trusted for its other
//! rows). Rows already stored from an earlier pack are skipped and reported, which makes importing
//! the same pack twice a no-op. Digests use `canonical.rs` with values rendered as decimal strings,
//! because canonical JSON only allows integer numbers.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Component, PathBuf};
use std::sync::OnceLock;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::AppHandle;

use crate::canonical::{canonical_sha256, sha256_hex};
use crate::db::{database_path, new_id, open_database};

pub const MAX_PACK_BYTES: u64 = 5 * 1024 * 1024;
pub const MAX_ROWS: usize = 100_000;
pub const MAX_DEPTH: usize = 8;
pub const PACK_FORMAT: &str = "deckchek-pack";
pub const PACK_VERSION: i64 = 1;
const MAX_REPORTED_ISSUES: usize = 20;
const MAX_UNIT_ROWS_PER_PAIR: usize = 50;
const MAX_UNIT_ROWS: usize = 20_000;
/// Population query, per (contributor, method version): only the rows nearest that contributor's median are read
/// (a window symmetric around the middle, so the median `population.js` takes per contributor is unchanged).
const MAX_POP_WINDOW: usize = 64;
/// Population query: method versions read per contributor (newest first).
const MAX_POP_VERSIONS_PER_CONTRIBUTOR: usize = 16;
/// Population query: analysis_method rows returned per method key, and the largest parameters_json passed on.
const MAX_POP_METHODS: usize = 256;
const MAX_POP_METHOD_PARAMS: usize = 16 * 1024;
const MAX_LABEL_CHARS: usize = 64;
const PACK_EXTENSIONS: &[&str] = &["deckchek-pack", "json"];
const METRICS_JSON: &str = include_str!("../../app/population-metrics.json");

// ------------------------------------------------------------------ errors

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RowIssue {
    /// 1-based row number in the pack.
    pub row: usize,
    pub reason: String,
}

/// Typed failure. `code` is stable for the UI; `message` is safe to show (it never echoes file content).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PackError {
    pub code: &'static str,
    pub message: String,
    pub rows: Vec<RowIssue>,
}

impl PackError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        PackError { code, message: message.into(), rows: Vec::new() }
    }
}

impl std::fmt::Display for PackError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl From<rusqlite::Error> for PackError {
    fn from(e: rusqlite::Error) -> Self {
        PackError::new("db", e.to_string())
    }
}

impl From<String> for PackError {
    fn from(e: String) -> Self {
        PackError::new("db", e)
    }
}

// ------------------------------------------------------------------ metric whitelist

#[derive(Debug, Clone)]
pub struct MetricDef {
    pub unit: String,
    pub lo: f64,
    pub hi: f64,
}

pub fn metric_table() -> &'static HashMap<String, MetricDef> {
    static TABLE: OnceLock<HashMap<String, MetricDef>> = OnceLock::new();
    TABLE.get_or_init(|| {
        let mut out = HashMap::new();
        let Ok(root) = serde_json::from_str::<Value>(METRICS_JSON) else { return out };
        let Some(metrics) = root.get("metrics").and_then(Value::as_object) else { return out };
        for (key, def) in metrics {
            let (Some(unit), Some(range)) = (def.get("unit").and_then(Value::as_str), def.get("plausible").and_then(Value::as_array)) else { continue };
            if let (Some(lo), Some(hi)) = (range.first().and_then(Value::as_f64), range.get(1).and_then(Value::as_f64)) {
                if lo <= hi && is_id(key) {
                    out.insert(key.clone(), MetricDef { unit: unit.to_string(), lo, hi });
                }
            }
        }
        out
    })
}

// ------------------------------------------------------------------ model and validation

#[derive(Debug, Clone, PartialEq)]
pub struct PackRow {
    pub product: String,
    pub metric: String,
    pub method_key: String,
    pub method_version: i64,
    pub value: f64,
    pub unit: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedPack {
    pub pack_id: String,
    pub created_month: String,
    pub app_version: String,
    pub contributor: String,
    pub rows: Vec<PackRow>,
    /// SHA-256 of the canonical form (values as decimal strings).
    pub digest: String,
}

/// `[a-z0-9._:-]{1,64}` (spec §7).
pub fn is_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

fn is_month(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 7 && b[..4].iter().all(u8::is_ascii_digit) && b[4] == b'-' && matches!(&s[5..], "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12")
}

/// `^[0-9][a-z0-9.+-]{0,63}$`
fn is_app_version(s: &str) -> bool {
    let b = s.as_bytes();
    !b.is_empty() && b.len() <= 64 && b[0].is_ascii_digit() && b[1..].iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, b'.' | b'+' | b'-'))
}

fn depth_ok(root: &Value) -> bool {
    let mut stack: Vec<(&Value, usize)> = vec![(root, 0)];
    while let Some((v, depth)) = stack.pop() {
        match v {
            Value::Array(items) => {
                if depth + 1 > MAX_DEPTH {
                    return false;
                }
                stack.extend(items.iter().map(|c| (c, depth + 1)));
            }
            Value::Object(map) => {
                if depth + 1 > MAX_DEPTH {
                    return false;
                }
                stack.extend(map.values().map(|c| (c, depth + 1)));
            }
            _ => {}
        }
    }
    true
}

fn exact_keys(map: &Map<String, Value>, keys: &[&str]) -> bool {
    map.len() == keys.len() && keys.iter().all(|k| map.contains_key(*k))
}

/// Round to three significant digits (spec §7: reduces fingerprinting). Idempotent.
///
/// Same rule as the export preview (JS `Number(v.toPrecision(3))`): nearest, and an exact tie of the double's decimal
/// value rounds half away from zero (31.25 -> 31.3, -62.25 -> -62.3, 1005 -> 1010). Rust's own `{:.2e}` would round
/// such ties to even, so the file could differ from the preview the user approved.
pub fn round_sig3(v: f64) -> f64 {
    if v == 0.0 || !v.is_finite() {
        return if v == 0.0 { 0.0 } else { v };
    }
    let nearest = format!("{:.2e}", v).parse::<f64>().unwrap_or(v);
    // Exact tie: the 4th significant digit is 5 and every later digit of the exact expansion is 0. The 20-digit
    // check is cheap; only a candidate pays for the exact expansion (a double has at most 767 significant digits).
    let is_tie = |text: &str| {
        let mantissa = text.split('e').next().unwrap_or("");
        mantissa.len() > 5 && mantissa.as_bytes()[4] == b'5' && mantissa[5..].bytes().all(|b| b == b'0')
    };
    let abs = v.abs();
    if !is_tie(&format!("{abs:.20e}")) || !is_tie(&format!("{abs:.800e}")) {
        return nearest;
    }
    let wide = format!("{abs:.3e}");
    let (mantissa, exp) = wide.split_once('e').unwrap_or(("", "0"));
    let (Ok(digits), Ok(mut exp)) = (mantissa.replace('.', "")[..3].parse::<u32>(), exp.parse::<i32>()) else { return nearest };
    let mut up = digits + 1;
    if up == 1000 {
        up = 100;
        exp += 1;
    }
    let sign = if v < 0.0 { "-" } else { "" };
    format!("{sign}{}.{:02}e{exp}", up / 100, up % 100).parse::<f64>().unwrap_or(nearest)
}

fn value_text(v: f64) -> String {
    format!("{}", if v == 0.0 { 0.0 } else { v })
}

fn digest_of(pack_id: &str, created_month: &str, app_version: &str, contributor: &str, rows: &[PackRow]) -> Result<String, PackError> {
    let rows: Vec<Value> = rows
        .iter()
        .map(|r| json!({"product": r.product, "metric": r.metric, "method": {"key": r.method_key, "version": r.method_version}, "value": value_text(r.value), "unit": r.unit}))
        .collect();
    let doc = json!({"format": PACK_FORMAT, "version": PACK_VERSION, "packId": pack_id, "createdMonth": created_month, "appVersion": app_version, "contributor": contributor, "rows": rows});
    canonical_sha256(&doc).map_err(|e| PackError::new("digest", e.to_string()))
}

fn row_hash(contributor: &str, r: &PackRow) -> Result<String, PackError> {
    let doc = json!([contributor, r.product, r.metric, r.method_key, r.method_version, r.unit, value_text(r.value)]);
    canonical_sha256(&doc).map_err(|e| PackError::new("digest", e.to_string()))
}

/// Check one row's content against the whitelist. `Err` carries a reason that never echoes input.
fn check_row(r: &PackRow) -> Result<(), &'static str> {
    if ![&r.product, &r.metric, &r.method_key].iter().all(|s| is_id(s)) {
        return Err("invalid identifier");
    }
    if r.method_version < 1 || r.method_version > 9_007_199_254_740_991 {
        return Err("invalid method version");
    }
    if !r.value.is_finite() {
        return Err("value must be finite");
    }
    let Some(def) = metric_table().get(&r.metric) else { return Err("metric is not in the population whitelist") };
    if r.unit != def.unit {
        return Err("unit differs from the metric definition");
    }
    if r.value < def.lo || r.value > def.hi {
        return Err("value is outside the plausible range");
    }
    Ok(())
}

/// Parse and validate untrusted pack bytes. The caller has already bounded how many bytes it read;
/// this re-checks the cap so the function is safe on its own.
pub fn parse_pack(bytes: &[u8]) -> Result<ParsedPack, PackError> {
    if bytes.len() as u64 > MAX_PACK_BYTES {
        return Err(PackError::new("too_large", "Pack exceeds 5 MB"));
    }
    let root: Value = serde_json::from_slice(bytes).map_err(|_| PackError::new("bad_json", "This is not a DeckChek pack: the file is not valid JSON"))?;
    if !depth_ok(&root) {
        return Err(PackError::new("too_deep", "Pack nesting exceeds eight levels"));
    }
    let Some(obj) = root.as_object() else { return Err(PackError::new("not_a_pack", "This is not a DeckChek pack")) };
    if obj.get("format").and_then(Value::as_str) != Some(PACK_FORMAT) {
        return Err(PackError::new("not_a_pack", "This is not a DeckChek pack"));
    }
    match obj.get("version") {
        Some(Value::Number(n)) if n.as_i64() == Some(PACK_VERSION) => {}
        Some(Value::Number(n)) if n.is_i64() || n.is_u64() => {
            let v = n.as_i64().map(|v| v.to_string()).unwrap_or_else(|| "?".into());
            return Err(PackError::new("unsupported_version", format!("Pack version {v} needs a different version of DeckChek")));
        }
        _ => return Err(PackError::new("bad_envelope", "This is not a DeckChek pack: the version is missing or not a whole number")),
    }
    if !exact_keys(obj, &["format", "version", "packId", "createdMonth", "appVersion", "contributor", "rows"]) {
        return Err(PackError::new("bad_envelope", "This is not a DeckChek pack: missing or unknown fields"));
    }
    let text = |k: &str| obj.get(k).and_then(Value::as_str);
    let (Some(pack_id), Some(contributor)) = (text("packId"), text("contributor")) else {
        return Err(PackError::new("bad_envelope", "Pack and contributor IDs must be text"));
    };
    if !is_id(pack_id) || !is_id(contributor) {
        return Err(PackError::new("bad_envelope", "Pack and contributor IDs must be safe identifiers"));
    }
    let Some(created_month) = text("createdMonth").filter(|m| is_month(m)) else {
        return Err(PackError::new("bad_envelope", "createdMonth must contain only year and month"));
    };
    let Some(app_version) = text("appVersion").filter(|v| is_app_version(v)) else {
        return Err(PackError::new("bad_envelope", "Invalid app version"));
    };
    let Some(rows) = obj.get("rows").and_then(Value::as_array) else { return Err(PackError::new("bad_envelope", "rows must be a list")) };
    if rows.len() > MAX_ROWS {
        return Err(PackError::new("too_many_rows", "Pack must contain at most 100000 rows"));
    }
    let mut out = Vec::with_capacity(rows.len());
    let mut seen: HashSet<(String, String, String, i64, u64)> = HashSet::new();
    let mut issues: Vec<RowIssue> = Vec::new();
    let mut invalid = 0usize;
    for (i, raw) in rows.iter().enumerate() {
        match parse_row(raw) {
            Ok(row) => {
                if !seen.insert((row.product.clone(), row.metric.clone(), row.method_key.clone(), row.method_version, row.value.to_bits())) {
                    invalid += 1;
                    if issues.len() < MAX_REPORTED_ISSUES {
                        issues.push(RowIssue { row: i + 1, reason: "duplicate observation".into() });
                    }
                    continue;
                }
                out.push(row);
            }
            Err(reason) => {
                invalid += 1;
                if issues.len() < MAX_REPORTED_ISSUES {
                    issues.push(RowIssue { row: i + 1, reason: reason.into() });
                }
            }
        }
    }
    if invalid > 0 {
        return Err(PackError { code: "invalid_rows", message: format!("{invalid} row(s) are not valid, so the pack was not imported"), rows: issues });
    }
    let digest = digest_of(pack_id, created_month, app_version, contributor, &out)?;
    Ok(ParsedPack { pack_id: pack_id.into(), created_month: created_month.into(), app_version: app_version.into(), contributor: contributor.into(), rows: out, digest })
}

fn parse_row(raw: &Value) -> Result<PackRow, &'static str> {
    let Some(obj) = raw.as_object().filter(|o| exact_keys(o, &["product", "metric", "method", "value", "unit"])) else { return Err("missing or unknown row fields") };
    let Some(method) = obj["method"].as_object().filter(|m| exact_keys(m, &["key", "version"])) else { return Err("missing or unknown row fields") };
    let (Some(product), Some(metric), Some(method_key), Some(unit)) = (obj["product"].as_str(), obj["metric"].as_str(), method["key"].as_str(), obj["unit"].as_str()) else {
        return Err("wrong field type");
    };
    let Some(method_version) = method["version"].as_i64() else { return Err("invalid method version") };
    let Some(value) = obj["value"].as_f64() else { return Err("value must be a number") };
    let row = PackRow { product: product.into(), metric: metric.into(), method_key: method_key.into(), method_version, value: if value == 0.0 { 0.0 } else { value }, unit: unit.into() };
    check_row(&row)?;
    Ok(row)
}

// ------------------------------------------------------------------ reading files

/// Validate a path the user picked in an open dialog and read it, bounded. The size is checked from
/// metadata before reading and again while reading, so a file that grows or lies cannot exceed the cap.
pub fn read_pack_file(path: &str) -> Result<Vec<u8>, PackError> {
    if path.is_empty() || path.contains('\0') {
        return Err(PackError::new("bad_path", "Choose a pack file"));
    }
    let p = PathBuf::from(path);
    if !p.is_absolute() {
        return Err(PackError::new("bad_path", "Path must be absolute"));
    }
    if p.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(PackError::new("bad_path", "Path traversal is not allowed"));
    }
    let ext_ok = p.extension().and_then(|e| e.to_str()).is_some_and(|e| PACK_EXTENSIONS.iter().any(|a| a.eq_ignore_ascii_case(e)));
    if !ext_ok {
        return Err(PackError::new("bad_extension", "Choose a .deckchek-pack file"));
    }
    let meta = fs::symlink_metadata(&p).map_err(|_| PackError::new("not_found", "The file could not be found"))?;
    if meta.file_type().is_symlink() {
        return Err(PackError::new("bad_path", "Symbolic links are not allowed"));
    }
    if !meta.is_file() {
        return Err(PackError::new("bad_path", "Choose a file, not a folder"));
    }
    if meta.len() > MAX_PACK_BYTES {
        return Err(PackError::new("too_large", "Pack exceeds 5 MB"));
    }
    let file = fs::File::open(&p).map_err(|_| PackError::new("io", "The file could not be opened"))?;
    let mut buf = Vec::with_capacity(meta.len() as usize);
    file.take(MAX_PACK_BYTES + 1).read_to_end(&mut buf).map_err(|_| PackError::new("io", "The file could not be read"))?;
    if buf.len() as u64 > MAX_PACK_BYTES {
        return Err(PackError::new("too_large", "Pack exceeds 5 MB"));
    }
    Ok(buf)
}

// ------------------------------------------------------------------ preview and import

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CellCount {
    pub product: String,
    pub metric: String,
    pub rows: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackPreview {
    pub pack_id: String,
    pub created_month: String,
    pub app_version: String,
    pub rows: usize,
    pub counts: Vec<CellCount>,
    pub sha256: String,
    pub already_imported: bool,
}

fn counts_of(rows: &[PackRow]) -> Vec<CellCount> {
    let mut map: BTreeMap<(String, String), usize> = BTreeMap::new();
    for r in rows {
        *map.entry((r.product.clone(), r.metric.clone())).or_default() += 1;
    }
    map.into_iter().map(|((product, metric), rows)| CellCount { product, metric, rows }).collect()
}

pub fn preview(conn: &Connection, bytes: &[u8]) -> Result<PackPreview, PackError> {
    let p = parse_pack(bytes)?;
    let existing: Option<String> = conn.query_row("SELECT sha256 FROM reference_pack WHERE id = ?1", [&p.pack_id], |r| r.get(0)).ok();
    Ok(PackPreview {
        already_imported: existing.as_deref() == Some(p.digest.as_str()),
        counts: counts_of(&p.rows),
        rows: p.rows.len(),
        pack_id: p.pack_id,
        created_month: p.created_month,
        app_version: p.app_version,
        sha256: p.digest,
    })
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub pack_id: String,
    pub accepted: usize,
    pub rejected: Vec<RowIssue>,
    /// The same pack (same id, same content) was already imported: nothing changed.
    pub duplicate: bool,
}

fn clean_label(label: Option<&str>) -> Result<Option<String>, PackError> {
    let Some(label) = label.map(str::trim).filter(|s| !s.is_empty()) else { return Ok(None) };
    if label.chars().count() > MAX_LABEL_CHARS || label.chars().any(char::is_control) {
        return Err(PackError::new("bad_label", "The source label must be 64 characters or fewer, without control characters"));
    }
    Ok(Some(label.to_string()))
}

pub fn import(conn: &Connection, bytes: &[u8], source_label: Option<&str>) -> Result<ImportResult, PackError> {
    let p = parse_pack(bytes)?;
    let label = clean_label(source_label)?;
    let existing: Option<String> = conn.query_row("SELECT sha256 FROM reference_pack WHERE id = ?1", [&p.pack_id], |r| r.get(0)).ok();
    if let Some(sha) = existing {
        if sha == p.digest {
            return Ok(ImportResult { pack_id: p.pack_id, accepted: 0, rejected: Vec::new(), duplicate: true });
        }
        return Err(PackError::new("id_conflict", "A different pack with this ID is already imported. Remove it first if you want to replace it."));
    }
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO reference_pack (id, source_label, imported_at, row_count, sha256) VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?3, ?4)",
        params![p.pack_id, label, p.rows.len() as i64, p.digest],
    )?;
    let mut accepted = 0usize;
    let mut rejected = Vec::new();
    {
        let mut claim = tx.prepare("INSERT OR IGNORE INTO reference_sample_claim (pack_id, row_hash) VALUES (?1, ?2)")?;
        let mut sample = tx.prepare(
            "INSERT OR IGNORE INTO reference_sample (id, pack_id, contributor, product_key, metric_key, method_key, method_version, value, unit, row_hash) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        )?;
        for (i, r) in p.rows.iter().enumerate() {
            let hash = row_hash(&p.contributor, r)?;
            claim.execute(params![p.pack_id, hash])?;
            let n = sample.execute(params![new_id(), p.pack_id, p.contributor, r.product, r.metric, r.method_key, r.method_version, r.value, r.unit, hash])?;
            if n == 1 {
                accepted += 1;
            } else if rejected.len() < MAX_REPORTED_ISSUES {
                rejected.push(RowIssue { row: i + 1, reason: "already imported from another pack".into() });
            }
        }
    }
    tx.commit()?;
    Ok(ImportResult { pack_id: p.pack_id, accepted, rejected, duplicate: false })
}

// ------------------------------------------------------------------ list, remove, query

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackInfo {
    pub id: String,
    pub source_label: Option<String>,
    pub imported_at: String,
    pub row_count: i64,
    pub sha256: String,
}

pub fn list(conn: &Connection) -> Result<Vec<PackInfo>, PackError> {
    let mut stmt = conn.prepare("SELECT id, source_label, imported_at, row_count, sha256 FROM reference_pack ORDER BY imported_at, id")?;
    let rows = stmt.query_map([], |r| Ok(PackInfo { id: r.get(0)?, source_label: r.get(1)?, imported_at: r.get(2)?, row_count: r.get(3)?, sha256: r.get(4)? }))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveResult {
    pub removed: bool,
    pub samples_deleted: i64,
}

/// AC-9. Observations that another imported pack also carries move to that pack; the rest are deleted.
pub fn remove(conn: &Connection, pack_id: &str) -> Result<RemoveResult, PackError> {
    if !is_id(pack_id) {
        return Err(PackError::new("bad_id", "Invalid pack id"));
    }
    let tx = conn.unchecked_transaction()?;
    let exists: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM reference_pack WHERE id = ?1)", [pack_id], |r| r.get(0))?;
    if !exists {
        return Ok(RemoveResult { removed: false, samples_deleted: 0 });
    }
    tx.execute(
        "UPDATE reference_sample SET pack_id = (SELECT c.pack_id FROM reference_sample_claim c WHERE c.row_hash = reference_sample.row_hash AND c.pack_id <> ?1 ORDER BY c.pack_id LIMIT 1)
         WHERE pack_id = ?1 AND EXISTS (SELECT 1 FROM reference_sample_claim c WHERE c.row_hash = reference_sample.row_hash AND c.pack_id <> ?1)",
        [pack_id],
    )?;
    let owned_after: i64 = tx.query_row("SELECT COUNT(*) FROM reference_sample WHERE pack_id = ?1", [pack_id], |r| r.get(0))?;
    tx.execute("DELETE FROM reference_pack WHERE id = ?1", [pack_id])?;
    tx.commit()?;
    Ok(RemoveResult { removed: true, samples_deleted: owned_after })
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MethodRef {
    pub key: String,
    pub version: i64,
}

/// Shaped like the rows `population.js` consumes (`contributor`, `metric`, `method`, `value`, `unit`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PopulationRow {
    pub contributor: String,
    pub product: String,
    pub metric: String,
    pub method: MethodRef,
    pub value: f64,
    pub unit: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PopulationQuery {
    pub rows: Vec<PopulationRow>,
    pub contributors: usize,
    /// True when some stored rows of this cell were not returned (per-contributor caps or the global row limit).
    pub truncated: bool,
    /// The local analysis_method rows of this method key (every version, oldest first), so `compare.js` can apply the
    /// AC-7 mutual-compat rule (`parameters_json.compat`) between the user's version and the population's versions.
    pub methods: Vec<MethodInfo>,
}

/// One analysis_method registry row, shaped like the `registry` entries `metric-compat.js` reads.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MethodInfo {
    pub key: String,
    pub version: i64,
    pub parameters_json: String,
}

/// Registry rows of one method key, at most MAX_POP_METHODS; a row with oversized parameters is left out (that version
/// then simply has no compat list, so it is only compared with itself).
fn method_registry(conn: &Connection, method_key: &str) -> Result<Vec<MethodInfo>, PackError> {
    let mut stmt = conn.prepare(
        "SELECT key, version, parameters_json FROM analysis_method WHERE key = ?1 AND length(parameters_json) <= ?2 ORDER BY version LIMIT ?3",
    )?;
    let rows = stmt.query_map(params![method_key, MAX_POP_METHOD_PARAMS as i64, MAX_POP_METHODS as i64], |r| {
        Ok(MethodInfo { key: r.get(0)?, version: r.get(1)?, parameters_json: r.get(2)? })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn query_population(conn: &Connection, product: &str, metric: &str, method_key: &str) -> Result<PopulationQuery, PackError> {
    if ![product, metric, method_key].iter().all(|s| is_id(s)) {
        return Err(PackError::new("bad_id", "Invalid product, metric or method"));
    }
    // One voice per contributor (spec section 6): caps are applied per contributor BEFORE the global limit, and the
    // global limit then takes rows round-robin across contributors, so no contributor token, however it sorts and
    // however many rows or method versions it imported, can push other contributors out of the comparison.
    //  - per (contributor, method version): only the rows nearest the middle rank are kept, in a window symmetric around
    //    it, so the median `population.js` takes per contributor is unchanged;
    //  - per contributor: the newest MAX_POP_VERSIONS_PER_CONTRIBUTOR method versions;
    //  - globally: by "pair rank" (distance from the middle, then version, newest first) and then contributor, so every
    //    contributor's median rows are read before any contributor's outer rows.
    // The scan reads the cell in (contributor, version, value, row_hash) order, as before; only kept rows are held.
    let mut stmt = conn.prepare(
        "SELECT contributor, method_version, value, unit FROM reference_sample
         WHERE product_key = ?1 AND metric_key = ?2 AND method_key = ?3
         ORDER BY contributor, method_version, value, row_hash",
    )?;
    struct Kept {
        seq: usize,
        contributor: usize,
        version: i64,
        value: f64,
        unit: String,
        pair_rank: usize,
    }
    let mut tokens: Vec<String> = Vec::new();
    let mut kept: Vec<Kept> = Vec::new();
    // The current contributor's finished version groups (oldest dropped past the cap), and the open group.
    let mut versions: std::collections::VecDeque<Vec<(Kept, usize)>> = std::collections::VecDeque::new();
    let mut group: Vec<(usize, f64, String)> = Vec::new();
    let mut group_version = 0i64;
    let mut total = 0usize;
    fn close_group(group: &mut Vec<(usize, f64, String)>, version: i64, contributor: usize, versions: &mut std::collections::VecDeque<Vec<(Kept, usize)>>) {
        if group.is_empty() {
            return;
        }
        let n = group.len();
        let window: Vec<(Kept, usize)> = group
            .drain(..)
            .enumerate()
            .filter_map(|(i, (seq, value, unit))| {
                let d = (2 * (i + 1)).abs_diff(n + 1);
                (d < MAX_POP_WINDOW).then_some((Kept { seq, contributor, version, value, unit, pair_rank: 0 }, d))
            })
            .collect();
        versions.push_back(window);
        if versions.len() > MAX_POP_VERSIONS_PER_CONTRIBUTOR {
            versions.pop_front();
        }
    }
    fn close_contributor(versions: &mut std::collections::VecDeque<Vec<(Kept, usize)>>, kept: &mut Vec<Kept>) {
        let mut rows: Vec<(Kept, usize)> = versions.drain(..).flatten().collect();
        rows.sort_by(|a, b| a.1.cmp(&b.1).then(b.0.version.cmp(&a.0.version)).then(a.0.seq.cmp(&b.0.seq)));
        let mut rank = 0usize;
        let mut last: Option<(usize, i64)> = None;
        for (mut row, d) in rows {
            if last != Some((d, row.version)) {
                rank += 1;
                last = Some((d, row.version));
            }
            row.pair_rank = rank;
            kept.push(row);
        }
    }
    let mut rows = stmt.query(params![product, metric, method_key])?;
    while let Some(r) = rows.next()? {
        let contributor = r.get_ref(0)?.as_str().map_err(rusqlite::Error::from)?;
        let version: i64 = r.get(1)?;
        if tokens.last().map(String::as_str) != Some(contributor) {
            if let Some(current) = tokens.len().checked_sub(1) {
                close_group(&mut group, group_version, current, &mut versions);
                close_contributor(&mut versions, &mut kept);
            }
            tokens.push(contributor.to_string());
            group_version = version;
        } else if version != group_version {
            close_group(&mut group, group_version, tokens.len() - 1, &mut versions);
            group_version = version;
        }
        group.push((total, r.get(2)?, r.get(3)?));
        total += 1;
    }
    if let Some(current) = tokens.len().checked_sub(1) {
        close_group(&mut group, group_version, current, &mut versions);
        close_contributor(&mut versions, &mut kept);
    }
    kept.sort_by(|a, b| a.pair_rank.cmp(&b.pair_rank).then(a.seq.cmp(&b.seq)));
    kept.truncate(MAX_ROWS);
    kept.sort_by_key(|k| k.seq);
    let truncated = total > kept.len();
    let contributors = kept.iter().map(|k| k.contributor).collect::<HashSet<_>>().len();
    let rows = kept
        .into_iter()
        .map(|k| PopulationRow { contributor: tokens[k.contributor].clone(), product: product.to_string(), metric: metric.to_string(), method: MethodRef { key: method_key.to_string(), version: k.version }, value: k.value, unit: k.unit })
        .collect();
    let methods = method_registry(conn, method_key)?;
    Ok(PopulationQuery { rows, contributors, truncated, methods })
}

// ------------------------------------------------------------------ export

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExportMethod {
    pub key: String,
    pub version: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExportRow {
    pub product: String,
    pub metric: String,
    pub method: ExportMethod,
    pub value: f64,
    pub unit: String,
}

/// What the webview may ask to export. Unknown fields (a serial number, a nickname...) are refused.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ExportSelection {
    pub pack_id: Option<String>,
    pub created_month: Option<String>,
    pub contributor: String,
    pub rows: Vec<ExportRow>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub pack_id: String,
    pub rows: usize,
    pub bytes: usize,
    pub sha256: String,
    pub path: String,
}

fn current_month() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    // civil-from-days (Howard Hinnant), UTC
    let z = secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}")
}

/// Build the pack text from a selection, re-validating every field against the whitelist. The result
/// is parsed again with [`parse_pack`], so anything written is guaranteed to import cleanly.
pub fn build_export(sel: &ExportSelection) -> Result<(ParsedPack, String), PackError> {
    if sel.rows.is_empty() {
        return Err(PackError::new("empty", "Choose at least one result to share"));
    }
    if sel.rows.len() > MAX_ROWS {
        return Err(PackError::new("too_many_rows", "Pack must contain at most 100000 rows"));
    }
    if !is_id(&sel.contributor) {
        return Err(PackError::new("bad_selection", "Invalid contributor token"));
    }
    let pack_id = match &sel.pack_id {
        Some(id) if is_id(id) => id.clone(),
        Some(_) => return Err(PackError::new("bad_selection", "Invalid pack id")),
        None => new_id(),
    };
    let month = match &sel.created_month {
        Some(m) if is_month(m) => m.clone(),
        Some(_) => return Err(PackError::new("bad_selection", "createdMonth must contain only year and month")),
        None => current_month(),
    };
    let app_version = env!("CARGO_PKG_VERSION").to_string();
    let mut issues = Vec::new();
    let mut rows = Vec::with_capacity(sel.rows.len());
    for (i, r) in sel.rows.iter().enumerate() {
        let row = PackRow { product: r.product.clone(), metric: r.metric.clone(), method_key: r.method.key.clone(), method_version: r.method.version, value: round_sig3(r.value), unit: r.unit.clone() };
        match check_row(&row) {
            Ok(()) => rows.push(row),
            Err(reason) => {
                if issues.len() < MAX_REPORTED_ISSUES {
                    issues.push(RowIssue { row: i + 1, reason: reason.into() });
                }
            }
        }
    }
    if !issues.is_empty() {
        return Err(PackError { code: "invalid_rows", message: "Some selected results cannot be shared".into(), rows: issues });
    }
    let rows_json: Vec<Value> = rows
        .iter()
        .map(|r| json!({"product": r.product, "metric": r.metric, "method": {"key": r.method_key, "version": r.method_version}, "value": r.value, "unit": r.unit}))
        .collect();
    let doc = json!({"format": PACK_FORMAT, "version": PACK_VERSION, "packId": pack_id, "createdMonth": month, "appVersion": app_version, "contributor": sel.contributor, "rows": rows_json});
    let text = serde_json::to_string_pretty(&doc).map_err(|e| PackError::new("serialize", e.to_string()))?;
    let parsed = parse_pack(text.as_bytes())?;
    Ok((parsed, text))
}

pub fn export_to(sel: &ExportSelection, path: &str) -> Result<ExportResult, PackError> {
    let (parsed, text) = build_export(sel)?;
    let written = crate::userfiles::write_text(path, &text, &["deckchek-pack"]).map_err(|e| PackError::new(e.code(), e.to_string()))?;
    Ok(ExportResult { pack_id: parsed.pack_id, rows: parsed.rows.len(), bytes: written.bytes, sha256: sha256_hex(text.as_bytes()), path: written.path })
}

// ------------------------------------------------------------------ this computer's own values

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitValue {
    pub asset_id: String,
    pub nickname: String,
    pub product_key: String,
    pub metric: String,
    pub method_key: String,
    pub method_version: i64,
    pub unit: String,
    pub value: f64,
    pub at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitValues {
    pub rows: Vec<UnitValue>,
    /// Measurements ignored because their unit differs from the metric definition.
    pub skipped_unit: usize,
    /// Measurements that could not be attributed to exactly one unit.
    pub skipped_unattributed: usize,
    /// True when values were left out to stay under the row cap (oldest history first; a whole unit only when there
    /// are more than MAX_UNIT_ROWS (unit, metric) pairs).
    pub truncated: bool,
}

/// Measured values per unit (asset) for whitelisted metrics, oldest first, newest 50 per (unit, metric), at most
/// MAX_UNIT_ROWS in all (see `truncated`).
/// Attribution: the run's own `assetId`/`deviceId`, or else the only profiled unit in the run's setup.
/// Measurements with quality flags or a non-measured origin are left out (AC: passing quality only).
pub fn unit_values(conn: &Connection) -> Result<UnitValues, PackError> {
    let mut assets: HashMap<String, (String, String)> = HashMap::new();
    {
        let mut stmt = conn.prepare(
            "SELECT a.id, a.nickname, MIN(dp.id) FROM asset a JOIN device_profile dp ON dp.product_id = a.product_id WHERE a.is_deleted = 0 GROUP BY a.id",
        )?;
        for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))? {
            let (id, nick, profile) = row?;
            assets.insert(id, (nick, profile));
        }
    }
    let mut setups: HashMap<String, Vec<String>> = HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT setup_id, asset_id FROM setup_component WHERE asset_id IS NOT NULL ORDER BY setup_id, asset_id")?;
        for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
            let (setup, asset) = row?;
            if assets.contains_key(&asset) {
                setups.entry(setup).or_default().push(asset);
            }
        }
    }
    let table = metric_table();
    let mut names: Vec<&String> = table.keys().collect();
    names.sort();
    let marks = vec!["?"; names.len()].join(",");
    // Newest MAX_UNIT_ROWS_PER_PAIR per (attribution source, metric, unit) BEFORE any overall limit: attribution is a
    // function of (direct id, setup), so this keeps every unit's newest values however many newer measurements
    // other units have. The overall LIMIT is only a safety net, and hitting it sets `truncated`; it is taken by `rn`
    // first (every source's newest value before any source's second), so it cuts old history, never a whole unit
    // because its runs are older than other units' runs.
    let sql = format!(
        "WITH base AS (
           SELECT m.metric_key, am.key AS method_key, am.version, m.unit, m.numeric_value, s.started_at, s.setup_id, m.id AS mid,
                  COALESCE(json_extract(CASE WHEN json_valid(s.config_snapshot_json) THEN s.config_snapshot_json ELSE '{{}}' END, '$.assetId'),
                           json_extract(CASE WHEN json_valid(s.config_snapshot_json) THEN s.config_snapshot_json ELSE '{{}}' END, '$.deviceId')) AS direct
           FROM measurement m JOIN session s ON s.id = m.session_id JOIN analysis_method am ON am.id = m.method_id
           WHERE m.numeric_value IS NOT NULL AND m.state = 'measured' AND m.quality_flags_json = '[]' AND m.metric_key IN ({marks})
         ), ranked AS (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY direct, setup_id, metric_key, unit ORDER BY started_at DESC, mid DESC) AS rn FROM base
         )
         SELECT metric_key, method_key, version, unit, numeric_value, started_at, setup_id, direct, mid FROM ranked
         WHERE rn <= {per_pair} ORDER BY rn, started_at DESC, mid DESC LIMIT {limit}",
        per_pair = MAX_UNIT_ROWS_PER_PAIR,
        limit = MAX_UNIT_ROWS * 5 + 1
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut skipped_unit = 0usize;
    let mut skipped_unattributed = 0usize;
    // Each value with its (started_at, measurement id) sort key: rows arrive by rank, not by time.
    let mut by_pair: BTreeMap<(String, String), Vec<(String, UnitValue)>> = BTreeMap::new();
    let mut rows = stmt.query(rusqlite::params_from_iter(names.iter().map(|s| s.as_str())))?;
    let mut read = 0usize;
    let mut truncated = false;
    while let Some(r) = rows.next()? {
        read += 1;
        if read > MAX_UNIT_ROWS * 5 {
            truncated = true;
            break;
        }
        let metric: String = r.get(0)?;
        let (method_key, method_version): (String, i64) = (r.get(1)?, r.get(2)?);
        let unit: Option<String> = r.get(3)?;
        let value: f64 = r.get(4)?;
        let (at, setup, direct, mid): (String, Option<String>, Option<String>, String) = (r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?);
        let Some(def) = table.get(&metric) else { continue };
        if unit.as_deref() != Some(def.unit.as_str()) || !value.is_finite() || !is_id(&method_key) {
            skipped_unit += 1;
            continue;
        }
        let asset_id = match direct.filter(|d| assets.contains_key(d)) {
            Some(d) => d,
            None => match setup.as_ref().and_then(|s| setups.get(s)) {
                Some(list) if list.len() == 1 => list[0].clone(),
                _ => {
                    skipped_unattributed += 1;
                    continue;
                }
            },
        };
        let (nickname, product_key) = assets[&asset_id].clone();
        by_pair.entry((asset_id.clone(), metric.clone())).or_default().push((mid, UnitValue { asset_id, nickname, product_key, metric, method_key, method_version, unit: def.unit.clone(), value, at }));
    }
    // Each list is newest first. Keep the newest MAX_UNIT_ROWS_PER_PAIR per (unit, metric); if the total is still over
    // MAX_UNIT_ROWS, share the cap round-robin (every pair's newest value before any pair's second), so the cut drops
    // old history evenly instead of whole units, and say so with `truncated`.
    let mut lists: Vec<Vec<UnitValue>> = by_pair
        .into_values()
        .map(|mut list| {
            list.sort_by(|a, b| b.1.at.cmp(&a.1.at).then_with(|| b.0.cmp(&a.0))); // newest first, as the old SQL order
            list.into_iter().map(|(_, v)| v).collect()
        })
        .collect();
    for list in &mut lists {
        list.truncate(MAX_UNIT_ROWS_PER_PAIR);
    }
    if lists.iter().map(Vec::len).sum::<usize>() > MAX_UNIT_ROWS {
        truncated = true;
        let mut keep = vec![0usize; lists.len()];
        let mut budget = MAX_UNIT_ROWS;
        'fill: for depth in 0..MAX_UNIT_ROWS_PER_PAIR {
            for (i, list) in lists.iter().enumerate() {
                if budget == 0 {
                    break 'fill;
                }
                if list.len() > depth {
                    keep[i] += 1;
                    budget -= 1;
                }
            }
        }
        for (list, k) in lists.iter_mut().zip(keep) {
            list.truncate(k);
        }
    }
    let mut out = Vec::new();
    for mut list in lists {
        list.reverse(); // callers get oldest first
        out.extend(list);
    }
    Ok(UnitValues { rows: out, skipped_unit, skipped_unattributed, truncated })
}

// ------------------------------------------------------------------ commands

fn open(app: &AppHandle) -> Result<crate::db::DbConn, PackError> {
    Ok(open_database(&database_path(app)?)?)
}

// Every command that opens the database is `async` and runs its body through `db::off_main` (AUD-03): a sync command
// runs on the main thread, and opening the database can wait on the DB gate, migrations or a busy lock.

#[tauri::command]
pub async fn pack_preview(app: AppHandle, path: String) -> Result<PackPreview, PackError> {
    crate::db::off_main(move || {
        let bytes = read_pack_file(&path)?;
        let conn = open(&app)?;
        preview(&conn, &bytes)
    })
    .await?
}

#[tauri::command]
pub async fn pack_import(app: AppHandle, path: String, source_label: Option<String>) -> Result<ImportResult, PackError> {
    crate::db::off_main(move || {
        let bytes = read_pack_file(&path)?;
        let conn = open(&app)?;
        import(&conn, &bytes, source_label.as_deref())
    })
    .await?
}

#[tauri::command]
pub async fn pack_list(app: AppHandle) -> Result<Vec<PackInfo>, PackError> {
    crate::db::off_main(move || {
        let conn = open(&app)?;
        list(&conn)
    })
    .await?
}

#[tauri::command]
pub async fn pack_remove(app: AppHandle, pack_id: String) -> Result<RemoveResult, PackError> {
    crate::db::off_main(move || {
        let conn = open(&app)?;
        remove(&conn, &pack_id)
    })
    .await?
}

#[tauri::command]
pub fn pack_export(selection: ExportSelection, path: String) -> Result<ExportResult, PackError> {
    export_to(&selection, &path)
}

#[tauri::command]
pub async fn population_query(app: AppHandle, product_id: String, metric_id: String, method_key: String) -> Result<PopulationQuery, PackError> {
    crate::db::off_main(move || {
        let conn = open(&app)?;
        query_population(&conn, &product_id, &metric_id, &method_key)
    })
    .await?
}

#[tauri::command]
pub async fn population_unit_values(app: AppHandle) -> Result<UnitValues, PackError> {
    crate::db::off_main(move || {
        let conn = open(&app)?;
        unit_values(&conn)
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;
    use std::path::Path;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        c
    }

    fn row(product: &str, metric: &str, value: f64) -> Value {
        let unit = metric_table()[metric].unit.clone();
        json!({"product": product, "metric": metric, "method": {"key": metric, "version": 1}, "value": value, "unit": unit})
    }

    fn pack_with(pack_id: &str, contributor: &str, rows: Vec<Value>) -> Value {
        json!({"format": "deckchek-pack", "version": 1, "packId": pack_id, "createdMonth": "2026-10", "appVersion": "0.0.8", "contributor": contributor, "rows": rows})
    }

    fn bytes(v: &Value) -> Vec<u8> {
        serde_json::to_vec(v).unwrap()
    }

    fn good() -> Value {
        pack_with("pack-one", "contrib-a", vec![row("pioneer-plx-crss12", "wow_flutter_rms_percent", 0.12), row("pioneer-plx-crss12", "channel_separation_db", 31.5)])
    }

    fn code(r: Result<ParsedPack, PackError>) -> &'static str {
        r.expect_err("expected a typed error").code
    }

    fn count(c: &Connection, table: &str) -> i64 {
        c.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)).unwrap()
    }

    fn tmp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("deckchek-pack-{tag}-{}-{}", std::process::id(), new_id()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn metric_whitelist_loads_and_is_sane() {
        let t = metric_table();
        assert!(t.len() >= 10, "population-metrics.json must parse");
        for (k, d) in t {
            assert!(is_id(k) && d.lo <= d.hi && !d.unit.is_empty(), "{k}");
        }
    }

    #[test]
    fn valid_pack_parses_and_digest_is_stable_for_the_same_input() {
        let a = parse_pack(&bytes(&good())).unwrap();
        let b = parse_pack(&bytes(&good())).unwrap();
        assert_eq!(a, b);
        assert_eq!(a.digest.len(), 64);
        assert_eq!(a.rows.len(), 2);
        let mut changed = good();
        changed["rows"][0]["value"] = json!(0.13);
        assert_ne!(parse_pack(&bytes(&changed)).unwrap().digest, a.digest);
    }

    #[test]
    fn adversarial_envelopes_return_typed_errors() {
        let mutate = |f: &dyn Fn(&mut Value)| {
            let mut v = good();
            f(&mut v);
            v
        };
        let cases: Vec<(&str, Value, &str)> = vec![
            ("array root", json!([1, 2]), "not_a_pack"),
            ("string root", json!("pack"), "not_a_pack"),
            ("wrong format", mutate(&|v| v["format"] = json!("other")), "not_a_pack"),
            ("version 3", mutate(&|v| v["version"] = json!(3)), "unsupported_version"),
            ("version 0", mutate(&|v| v["version"] = json!(0)), "unsupported_version"),
            ("version negative", mutate(&|v| v["version"] = json!(-1)), "unsupported_version"),
            ("version huge", mutate(&|v| v["version"] = json!(u64::MAX)), "unsupported_version"),
            ("version string", mutate(&|v| v["version"] = json!("1")), "bad_envelope"),
            ("version float", mutate(&|v| v["version"] = json!(1.5)), "bad_envelope"),
            ("version null", mutate(&|v| v["version"] = Value::Null), "bad_envelope"),
            ("unknown root field", mutate(&|v| v["serial"] = json!("SN1")), "bad_envelope"),
            ("missing contributor", mutate(&|v| { v.as_object_mut().unwrap().remove("contributor"); }), "bad_envelope"),
            ("packId number", mutate(&|v| v["packId"] = json!(5)), "bad_envelope"),
            ("packId uppercase", mutate(&|v| v["packId"] = json!("Pack-One")), "bad_envelope"),
            ("packId 65 chars", mutate(&|v| v["packId"] = json!("a".repeat(65))), "bad_envelope"),
            ("packId path", mutate(&|v| v["packId"] = json!("../etc")), "bad_envelope"),
            ("contributor space", mutate(&|v| v["contributor"] = json!("a b")), "bad_envelope"),
            ("createdMonth with day", mutate(&|v| v["createdMonth"] = json!("2026-10-05")), "bad_envelope"),
            ("createdMonth 13", mutate(&|v| v["createdMonth"] = json!("2026-13")), "bad_envelope"),
            ("appVersion odd", mutate(&|v| v["appVersion"] = json!("v1; DROP")), "bad_envelope"),
            ("rows object", mutate(&|v| v["rows"] = json!({"a": 1})), "bad_envelope"),
            ("rows string", mutate(&|v| v["rows"] = json!("none")), "bad_envelope"),
        ];
        for (name, v, want) in cases {
            assert_eq!(code(parse_pack(&bytes(&v))), want, "{name}");
        }
    }

    #[test]
    fn adversarial_rows_reject_the_whole_pack_with_row_reasons() {
        let bad_rows: Vec<(&str, Value)> = vec![
            ("value as text", json!({"product":"p","metric":"dropout_count","method":{"key":"k","version":1},"value":"3","unit":"regions"})),
            ("value null", json!({"product":"p","metric":"dropout_count","method":{"key":"k","version":1},"value":null,"unit":"regions"})),
            ("value NaN text", json!({"product":"p","metric":"dropout_count","method":{"key":"k","version":1},"value":"NaN","unit":"regions"})),
            ("value huge", json!({"product":"p","metric":"dropout_count","method":{"key":"k","version":1},"value":1e300,"unit":"regions"})),
            ("value negative out of range", json!({"product":"p","metric":"dropout_count","method":{"key":"k","version":1},"value":-1,"unit":"regions"})),
            ("unknown metric", json!({"product":"p","metric":"serial_number","method":{"key":"k","version":1},"value":1,"unit":"regions"})),
            ("wrong unit", json!({"product":"p","metric":"dropout_count","method":{"key":"k","version":1},"value":1,"unit":"dB"})),
            ("extra row field", json!({"product":"p","metric":"dropout_count","method":{"key":"k","version":1},"value":1,"unit":"regions","nickname":"Deck 1"})),
            ("extra method field", json!({"product":"p","metric":"dropout_count","method":{"key":"k","version":1,"note":"x"},"value":1,"unit":"regions"})),
            ("missing unit", json!({"product":"p","metric":"dropout_count","method":{"key":"k","version":1},"value":1})),
            ("method string", json!({"product":"p","metric":"dropout_count","method":"k@1","value":1,"unit":"regions"})),
            ("version 0", json!({"product":"p","metric":"dropout_count","method":{"key":"k","version":0},"value":1,"unit":"regions"})),
            ("version fractional", json!({"product":"p","metric":"dropout_count","method":{"key":"k","version":1.5},"value":1,"unit":"regions"})),
            ("product number", json!({"product":7,"metric":"dropout_count","method":{"key":"k","version":1},"value":1,"unit":"regions"})),
            ("product with space", json!({"product":"my deck","metric":"dropout_count","method":{"key":"k","version":1},"value":1,"unit":"regions"})),
            ("product windows path", json!({"product":"C:\\Users\\sam","metric":"dropout_count","method":{"key":"k","version":1},"value":1,"unit":"regions"})),
            ("row is a number", json!(7)),
            ("row is null", Value::Null),
        ];
        for (name, bad) in bad_rows {
            let err = parse_pack(&bytes(&pack_with("pack-bad", "c", vec![row("p", "dropout_count", 1.0), bad]))).expect_err(name);
            assert_eq!(err.code, "invalid_rows", "{name}");
            assert_eq!(err.rows.len(), 1, "{name}");
            assert_eq!(err.rows[0].row, 2, "{name}");
            assert!(!err.rows[0].reason.is_empty());
        }
    }

    #[test]
    fn duplicate_observations_inside_one_pack_are_rejected() {
        let r = row("p", "dropout_count", 4.0);
        let err = parse_pack(&bytes(&pack_with("pack-dup", "c", vec![r.clone(), r]))).unwrap_err();
        assert_eq!((err.code, err.rows[0].reason.as_str()), ("invalid_rows", "duplicate observation"));
    }

    #[test]
    fn non_json_truncation_and_garbage_never_panic() {
        let full = bytes(&good());
        for len in (0..full.len()).step_by(7).chain([full.len() - 1]) {
            assert!(parse_pack(&full[..len]).is_err(), "truncated at {len}");
        }
        for junk in [&b""[..], b"NaN", b"{\"value\": NaN}", b"{\"value\": 1e999}", b"\xff\xfe\x00\x01", b"{\"format\":\"deckchek-pack\"", &[0u8; 64]] {
            assert!(parse_pack(junk).is_err());
        }
        // a JSON number that does not fit a double is a parse error, not a panic
        let text = String::from_utf8(full).unwrap().replace("0.12", "1e999");
        assert_eq!(code(parse_pack(text.as_bytes())), "bad_json");
    }

    #[test]
    fn nesting_and_size_limits_hold_before_any_row_work() {
        let nested = format!("{}{}", "[".repeat(100_000), "]".repeat(100_000));
        assert_eq!(code(parse_pack(nested.as_bytes())), "bad_json", "serde recursion limit, no stack overflow");
        let mut v = good();
        v["rows"][0] = json!({"a": {"b": {"c": {"d": {"e": {"f": {"g": {"h": {"i": 1}}}}}}}}});
        assert_eq!(code(parse_pack(&bytes(&v))), "too_deep");
        let big = vec![b' '; MAX_PACK_BYTES as usize + 1];
        assert_eq!(code(parse_pack(&big)), "too_large");
        let rows: Vec<Value> = (0..MAX_ROWS + 1).map(|_| json!(0)).collect();
        assert_eq!(code(parse_pack(&bytes(&pack_with("pack-many", "c", rows)))), "too_many_rows");
    }

    #[test]
    fn mutated_packs_never_panic() {
        let seed = bytes(&good());
        let mut state = 0x2545_F491_4F6C_DD1Du64;
        let mut next = move || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };
        for _ in 0..2000 {
            let mut b = seed.clone();
            for _ in 0..(next() % 4 + 1) {
                let i = (next() as usize) % b.len();
                match next() % 3 {
                    0 => b[i] = (next() % 256) as u8,
                    1 => {
                        b.remove(i);
                    }
                    _ => b.insert(i, (next() % 256) as u8),
                }
            }
            let _ = parse_pack(&b); // Ok or Err, never a panic
        }
    }

    #[test]
    fn read_pack_file_checks_size_path_and_extension_before_reading() {
        let dir = tmp_dir("read");
        let ok = dir.join("a.deckchek-pack");
        fs::write(&ok, bytes(&good())).unwrap();
        assert!(read_pack_file(ok.to_str().unwrap()).is_ok());
        let big = dir.join("big.deckchek-pack");
        fs::write(&big, vec![b'x'; MAX_PACK_BYTES as usize + 1]).unwrap();
        assert_eq!(read_pack_file(big.to_str().unwrap()).unwrap_err().code, "too_large");
        let exact = dir.join("exact.json");
        fs::write(&exact, vec![b' '; MAX_PACK_BYTES as usize]).unwrap();
        assert!(read_pack_file(exact.to_str().unwrap()).is_ok(), "exactly the cap is allowed");
        for (path, want) in [
            ("".to_string(), "bad_path"),
            ("pack.deckchek-pack".to_string(), "bad_path"),
            (format!("{}/../a.deckchek-pack", dir.display()), "bad_path"),
            (format!("{}/a.txt", dir.display()), "bad_extension"),
            (format!("{}/missing.deckchek-pack", dir.display()), "not_found"),
            (format!("{}/a\0.deckchek-pack", dir.display()), "bad_path"),
            (dir.display().to_string(), "bad_extension"),
        ] {
            assert_eq!(read_pack_file(&path).unwrap_err().code, want, "{path:?}");
        }
        let folder = dir.join("folder.deckchek-pack");
        fs::create_dir(&folder).unwrap();
        assert_eq!(read_pack_file(folder.to_str().unwrap()).unwrap_err().code, "bad_path");
        #[cfg(unix)]
        {
            let link = dir.join("link.deckchek-pack");
            std::os::unix::fs::symlink(&ok, &link).unwrap();
            assert_eq!(read_pack_file(link.to_str().unwrap()).unwrap_err().code, "bad_path");
        }
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn import_is_idempotent_and_preview_counts_rows() {
        let c = mem();
        let b = bytes(&good());
        let p = preview(&c, &b).unwrap();
        assert_eq!((p.rows, p.already_imported), (2, false));
        assert_eq!(p.counts.len(), 2);
        assert!(p.counts.windows(2).all(|w| (&w[0].product, &w[0].metric) < (&w[1].product, &w[1].metric)), "deterministic order");
        assert_eq!(count(&c, "reference_sample"), 0, "preview writes nothing");
        let first = import(&c, &b, Some("Shop A")).unwrap();
        assert_eq!((first.accepted, first.duplicate, first.rejected.len()), (2, false, 0));
        let again = import(&c, &b, None).unwrap();
        assert_eq!((again.accepted, again.duplicate), (0, true));
        assert_eq!((count(&c, "reference_pack"), count(&c, "reference_sample")), (1, 2));
        assert!(preview(&c, &b).unwrap().already_imported);
        let info = list(&c).unwrap();
        assert_eq!((info[0].id.as_str(), info[0].source_label.as_deref(), info[0].row_count), ("pack-one", Some("Shop A"), 2));
    }

    #[test]
    fn same_pack_id_with_different_content_is_a_typed_conflict() {
        let c = mem();
        import(&c, &bytes(&good()), None).unwrap();
        let mut other = good();
        other["rows"][0]["value"] = json!(0.5);
        assert_eq!(import(&c, &bytes(&other), None).unwrap_err().code, "id_conflict");
        assert_eq!(count(&c, "reference_sample"), 2);
    }

    #[test]
    fn invalid_pack_leaves_the_database_untouched() {
        let c = mem();
        let mut bad = good();
        bad["rows"][1]["value"] = json!(1e9);
        assert_eq!(import(&c, &bytes(&bad), None).unwrap_err().code, "invalid_rows");
        assert_eq!((count(&c, "reference_pack"), count(&c, "reference_sample"), count(&c, "reference_sample_claim")), (0, 0, 0));
        assert_eq!(import(&c, &bytes(&good()), Some(&"x".repeat(65))).unwrap_err().code, "bad_label");
        assert_eq!(import(&c, &bytes(&good()), Some("bad\nlabel")).unwrap_err().code, "bad_label");
        assert_eq!(count(&c, "reference_pack"), 0);
    }

    #[test]
    fn shared_observations_survive_removal_of_one_pack() {
        let c = mem();
        let shared = row("deck-a", "dropout_count", 2.0);
        import(&c, &bytes(&pack_with("pack-one", "same-shop", vec![shared.clone(), row("deck-a", "dropout_count", 3.0)])), None).unwrap();
        let second = import(&c, &bytes(&pack_with("pack-two", "same-shop", vec![shared, row("deck-a", "dropout_count", 9.0)])), None).unwrap();
        assert_eq!(second.accepted, 1);
        assert_eq!(second.rejected, vec![RowIssue { row: 1, reason: "already imported from another pack".into() }]);
        assert_eq!(count(&c, "reference_sample"), 3);
        let r = remove(&c, "pack-one").unwrap();
        assert_eq!((r.removed, r.samples_deleted), (true, 1));
        let q = query_population(&c, "deck-a", "dropout_count", "dropout_count").unwrap();
        assert_eq!(q.rows.iter().map(|r| r.value).collect::<Vec<_>>(), vec![2.0, 9.0], "shared row moved to pack-two");
        remove(&c, "pack-two").unwrap();
        assert_eq!((count(&c, "reference_pack"), count(&c, "reference_sample"), count(&c, "reference_sample_claim")), (0, 0, 0));
        assert_eq!(remove(&c, "pack-two").unwrap(), RemoveResult { removed: false, samples_deleted: 0 });
        assert_eq!(remove(&c, "Not An Id").unwrap_err().code, "bad_id");
    }

    #[test]
    fn population_query_is_deterministic_and_counts_contributors() {
        let c = mem();
        let rows = |vals: &[f64]| vals.iter().map(|v| row("deck-a", "channel_separation_db", *v)).collect::<Vec<_>>();
        import(&c, &bytes(&pack_with("pack-b", "zed", rows(&[30.0, 28.0]))), None).unwrap();
        import(&c, &bytes(&pack_with("pack-a", "amy", rows(&[33.0]))), None).unwrap();
        let q1 = query_population(&c, "deck-a", "channel_separation_db", "channel_separation_db").unwrap();
        let q2 = query_population(&c, "deck-a", "channel_separation_db", "channel_separation_db").unwrap();
        assert_eq!(q1, q2);
        assert_eq!(q1.contributors, 2);
        assert_eq!(q1.rows.iter().map(|r| (r.contributor.as_str(), r.value)).collect::<Vec<_>>(), vec![("amy", 33.0), ("zed", 28.0), ("zed", 30.0)]);
        assert_eq!(query_population(&c, "other", "channel_separation_db", "channel_separation_db").unwrap().rows.len(), 0);
        assert_eq!(query_population(&c, "deck a", "x", "y").unwrap_err().code, "bad_id");
        assert_eq!(query_population(&c, "p'; DROP TABLE reference_pack;--", "x", "y").unwrap_err().code, "bad_id");
    }

    fn selection(rows: Vec<Value>) -> Value {
        json!({"packId": "pack-out", "createdMonth": "2026-10", "contributor": "token-1", "rows": rows})
    }

    #[test]
    fn export_whitelists_rounds_and_round_trips_through_import() {
        let sel: ExportSelection = serde_json::from_value(selection(vec![row("pioneer-plx-crss12", "wow_flutter_rms_percent", 0.123456)])).unwrap();
        let (parsed, text) = build_export(&sel).unwrap();
        assert_eq!(parsed.rows[0].value, 0.123);
        assert_eq!(parsed.app_version, env!("CARGO_PKG_VERSION"));
        let doc: Value = serde_json::from_str(&text).unwrap();
        let mut keys: Vec<_> = doc.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(keys, ["appVersion", "contributor", "createdMonth", "format", "packId", "rows", "version"]);
        assert_eq!(doc["rows"][0].as_object().unwrap().len(), 5);
        let dir = tmp_dir("export");
        let path = dir.join("out.deckchek-pack");
        let res = export_to(&sel, path.to_str().unwrap()).unwrap();
        assert_eq!((res.rows, res.bytes), (1, fs::metadata(&path).unwrap().len() as usize));
        assert_eq!(res.sha256, sha256_hex(&fs::read(&path).unwrap()));
        let c = mem();
        let read = read_pack_file(path.to_str().unwrap()).unwrap();
        assert_eq!(import(&c, &read, None).unwrap().accepted, 1);
        let q = query_population(&c, "pioneer-plx-crss12", "wow_flutter_rms_percent", "wow_flutter_rms_percent").unwrap();
        assert_eq!(q.rows[0].value, 0.123);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn export_refuses_pii_fields_and_never_writes_seeded_values() {
        const PII: [&str; 6] = ["SN-998877", "Sam's Deck", "C:\\Users\\sam\\gig.wav", "booth-pc.local", "Club Neon", "sam@example.com"];
        let base = row("pioneer-plx-crss12", "wow_flutter_rms_percent", 0.1);
        for (k, v) in [("serial", PII[0]), ("nickname", PII[1]), ("path", PII[2]), ("hostname", PII[3]), ("venue", PII[4]), ("email", PII[5]), ("assetId", "a-1"), ("sessionId", "s-1")] {
            let mut p = base.clone();
            p[k] = json!(v);
            assert!(serde_json::from_value::<ExportSelection>(selection(vec![p])).is_err(), "{k} must be refused");
        }
        let mut nested = base.clone();
        nested["method"]["note"] = json!(PII[1]);
        assert!(serde_json::from_value::<ExportSelection>(selection(vec![nested])).is_err());
        let mut top = selection(vec![row("p", "dropout_count", 1.0)]);
        top["serial"] = json!(PII[0]);
        assert!(serde_json::from_value::<ExportSelection>(top).is_err());
        let sel: ExportSelection = serde_json::from_value(selection(vec![row("p", "dropout_count", 1.0)])).unwrap();
        let (_, text) = build_export(&sel).unwrap();
        for needle in PII.iter().chain(["serial", "nickname", "assetId", "sessionId", "path", "venue", "email", "hostname"].iter()) {
            assert!(!text.contains(needle), "{needle} leaked into the pack");
        }
    }

    #[test]
    fn export_rejects_bad_selections_with_typed_errors() {
        let mk = |v: Value| serde_json::from_value::<ExportSelection>(v).unwrap();
        assert_eq!(build_export(&mk(selection(vec![]))).unwrap_err().code, "empty");
        let mut bad_contrib = selection(vec![row("p", "dropout_count", 1.0)]);
        bad_contrib["contributor"] = json!("Sam Smith");
        assert_eq!(build_export(&mk(bad_contrib)).unwrap_err().code, "bad_selection");
        let mut bad_month = selection(vec![row("p", "dropout_count", 1.0)]);
        bad_month["createdMonth"] = json!("2026-10-05");
        assert_eq!(build_export(&mk(bad_month)).unwrap_err().code, "bad_selection");
        let mut bad_id = selection(vec![row("p", "dropout_count", 1.0)]);
        bad_id["packId"] = json!("../x");
        assert_eq!(build_export(&mk(bad_id)).unwrap_err().code, "bad_selection");
        let unknown = mk(selection(vec![json!({"product":"p","metric":"serial_number","method":{"key":"k","version":1},"value":1.0,"unit":"x"})]));
        assert_eq!(build_export(&unknown).unwrap_err().rows[0].reason, "metric is not in the population whitelist");
        let mut sel = mk(selection(vec![row("p", "dropout_count", 1.0)]));
        for v in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 1e300, -5.0] {
            sel.rows[0].value = v;
            assert_eq!(build_export(&sel).unwrap_err().code, "invalid_rows", "{v}");
        }
        let dups = mk(selection(vec![row("p", "dropout_count", 1.0), row("p", "dropout_count", 1.0)]));
        assert_eq!(build_export(&dups).unwrap_err().code, "invalid_rows");
        let dir = tmp_dir("badexport");
        let ok = mk(selection(vec![row("p", "dropout_count", 1.0)]));
        for path in [dir.join("x.txt"), dir.join("missing").join("x.deckchek-pack")] {
            assert!(export_to(&ok, path.to_str().unwrap()).is_err());
        }
        assert!(export_to(&ok, "relative.deckchek-pack").is_err());
        assert!(fs::read_dir(&dir).unwrap().next().is_none(), "failed exports leave no file");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn rounding_to_three_significant_figures_is_idempotent() {
        for (v, want) in [(-62.12345, -62.1), (0.123456, 0.123), (1234.5, 1230.0), (0.0, 0.0), (-0.0, 0.0), (9.996, 10.0), (9.995, 9.99), (0.000123456, 0.000123)] {
            let r = round_sig3(v);
            assert_eq!(r, want, "{v}");
            assert_eq!(round_sig3(r), r);
        }
    }

    #[test]
    fn current_month_is_a_valid_month() {
        assert!(is_month(&current_month()));
    }

    #[test]
    fn near_cap_pack_imports_quickly() {
        // 5 MB holds about 45k compact rows; the spec's 100k rows cannot fit under its own 5 MB cap.
        let mut rows = Vec::new();
        let mut size = 300usize;
        let mut i = 0usize;
        while size < (MAX_PACK_BYTES as usize) - 200 {
            let r = row(&format!("p{i}"), "dropout_count", (i % 1000) as f64);
            size += serde_json::to_vec(&r).unwrap().len() + 1;
            rows.push(r);
            i += 1;
        }
        let b = bytes(&pack_with("pack-big", "big", rows));
        assert!(b.len() as u64 <= MAX_PACK_BYTES);
        let c = mem();
        let t = std::time::Instant::now();
        let res = import(&c, &b, None).unwrap();
        let elapsed = t.elapsed();
        assert_eq!(res.accepted, i);
        let limit = if cfg!(debug_assertions) { 20 } else { 2 };
        assert!(elapsed.as_secs() < limit, "import took {elapsed:?}");
    }

    fn seed_units(c: &Connection) {
        c.execute_batch(
            "INSERT INTO product(id,category,model,created_at,updated_at) VALUES('prod-tt','turntable','TT','t','t'),('prod-mx','mixer','MX','t','t');
             INSERT INTO device_profile(id,product_id,json,loaded_at) VALUES('profile-tt','prod-tt','{}','t'),('profile-mx','prod-mx','{}','t');
             INSERT INTO asset(id,product_id,nickname,serial_number,created_at,updated_at) VALUES('a1','prod-tt','Deck 1','SN-1','t','t'),('a2','prod-tt','Deck 2','SN-2','t','t'),('a3','prod-mx','Mixer','SN-3','t','t');
             INSERT INTO setup(id,name,created_at) VALUES('s-one','One deck','t'),('s-two','Two units','t');
             INSERT INTO setup_component(id,setup_id,role,asset_id) VALUES('c1','s-one','deck','a1'),('c2','s-two','deck','a1'),('c3','s-two','mixer','a3');
             INSERT INTO analysis_method(id,key,version,description,created_at) VALUES('m-wf','wow_flutter_rms_percent',1,'wf','t'),('m-x','not_listed',1,'x','t');
             INSERT INTO session(id,session_type,setup_id,started_at,app_version,schema_version,status,config_snapshot_json) VALUES
               ('r-direct','speed',NULL,'2026-10-01T10:00:00Z','0',1,'completed','{\"assetId\":\"a2\"}'),
               ('r-setup','speed','s-one','2026-10-02T10:00:00Z','0',1,'completed','{}'),
               ('r-ambiguous','speed','s-two','2026-10-03T10:00:00Z','0',1,'completed','{}'),
               ('r-newer','speed',NULL,'2026-10-04T10:00:00Z','0',1,'completed','{\"deviceId\":\"a2\"}'),
               ('r-bad-json','speed','s-one','2026-10-05T10:00:00Z','0',1,'completed','not json');
             INSERT INTO measurement(id,session_id,method_id,metric_key,state,numeric_value,unit,quality_flags_json,created_at) VALUES
               ('x1','r-direct','m-wf','wow_flutter_rms_percent','measured',0.30,'%','[]','t'),
               ('x2','r-setup','m-wf','wow_flutter_rms_percent','measured',0.10,'%','[]','t'),
               ('x3','r-ambiguous','m-wf','wow_flutter_rms_percent','measured',0.20,'%','[]','t'),
               ('x4','r-newer','m-wf','wow_flutter_rms_percent','measured',0.25,'%','[]','t'),
               ('x5','r-newer','m-wf','left_thd_percent','measured',0.5,'dB','[]','t'),
               ('x6','r-newer','m-x','not_listed','measured',1,'%','[]','t'),
               ('x7','r-direct','m-wf','wow_flutter_rms_percent','estimated',9,'%','[]','t'),
               ('x8','r-bad-json','m-wf','wow_flutter_rms_percent','measured',0.4,'%','[\"clipped\"]','t'),
               ('x9','r-bad-json','m-wf','wow_flutter_rms_percent','measured',0.15,'%','[]','t');",
        )
        .unwrap();
    }

    #[test]
    fn population_migrations_apply_fresh_rerun_and_upgrade_every_fixture() {
        let tables = ["reference_pack", "reference_sample", "reference_sample_claim"];
        let exists = |c: &Connection, t: &str| -> i64 { c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1", [t], |r| r.get(0)).unwrap() };
        let fresh = mem();
        for t in tables {
            assert_eq!(exists(&fresh, t), 1, "{t}");
        }
        let versions = |c: &Connection| crate::db::applied_migrations(c).unwrap();
        let before = versions(&fresh);
        assert!(before.contains(&15) && before.contains(&22));
        let schema = |c: &Connection| -> Vec<String> { c.prepare("SELECT sql FROM sqlite_master WHERE name LIKE 'reference_%' OR name LIKE 'idx_ref_%' ORDER BY name").unwrap().query_map([], |r| r.get::<_, String>(0)).unwrap().map(Result::unwrap).collect() };
        let snapshot = schema(&fresh);
        apply_migrations(&fresh).unwrap();
        assert_eq!((versions(&fresh), schema(&fresh)), (before, snapshot), "re-run is a no-op");
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/db");
        let mut seen = 0;
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().and_then(|e| e.to_str()) != Some("sql") {
                continue;
            }
            let c = Connection::open_in_memory().unwrap();
            c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
            c.execute_batch(&fs::read_to_string(&path).unwrap()).unwrap();
            apply_migrations(&c).unwrap_or_else(|e| panic!("{path:?}: {e}"));
            for t in tables {
                assert_eq!(exists(&c, t), 1, "{path:?} {t}");
            }
            assert_eq!(count(&c, "reference_pack"), 0);
            seen += 1;
        }
        assert!(seen >= 3, "all release fixtures are exercised");
    }

    #[test]
    fn population_tables_enforce_their_constraints() {
        let c = mem();
        c.execute("INSERT INTO reference_pack(id,imported_at,row_count,sha256) VALUES('p1','t',1,'h')", []).unwrap();
        assert!(c.execute("INSERT INTO reference_pack(id,imported_at,row_count,sha256) VALUES('p2','t',-1,'h')", []).is_err(), "row_count >= 0");
        let sample = "INSERT INTO reference_sample(id,pack_id,contributor,product_key,metric_key,method_key,method_version,value,unit,row_hash) VALUES(?1,?2,'c','p','m','k',?3,1.5,'dB',?4)";
        c.execute(sample, params!["s1", "p1", 1, "h1"]).unwrap();
        assert!(c.execute(sample, params!["s2", "p1", 1, "h1"]).is_err(), "row_hash unique");
        assert!(c.execute(sample, params!["s3", "p1", 0, "h3"]).is_err(), "method_version > 0");
        assert!(c.execute(sample, params!["s4", "missing", 1, "h4"]).is_err(), "pack must exist");
        c.execute("INSERT INTO reference_sample_claim(pack_id,row_hash) VALUES('p1','h1')", []).unwrap();
        assert!(c.execute("INSERT INTO reference_sample_claim(pack_id,row_hash) VALUES('p1','h1')", []).is_err(), "one claim per (pack, row)");
        assert!(c.execute("INSERT INTO reference_sample_claim(pack_id,row_hash) VALUES('nope','h1')", []).is_err());
        c.execute("DELETE FROM reference_pack WHERE id='p1'", []).unwrap();
        assert_eq!((count(&c, "reference_sample"), count(&c, "reference_sample_claim")), (0, 0), "cascade");
    }

    #[test]
    fn unit_values_attribute_only_unambiguous_passing_measurements() {
        let c = mem();
        seed_units(&c);
        let v = unit_values(&c).unwrap();
        let got: Vec<(String, String, f64)> = v.rows.iter().map(|r| (r.asset_id.clone(), r.at.clone(), r.value)).collect();
        assert_eq!(
            got,
            vec![
                ("a1".to_string(), "2026-10-02T10:00:00Z".to_string(), 0.10),
                ("a1".to_string(), "2026-10-05T10:00:00Z".to_string(), 0.15),
                ("a2".to_string(), "2026-10-01T10:00:00Z".to_string(), 0.30),
                ("a2".to_string(), "2026-10-04T10:00:00Z".to_string(), 0.25),
            ]
        );
        assert_eq!(v.skipped_unattributed, 1, "setup with two profiled units is ambiguous");
        assert_eq!(v.skipped_unit, 1, "unit mismatch is never converted");
        assert!(v.rows.iter().all(|r| r.product_key == "profile-tt" && r.method_key == r.metric && r.method_version == 1));
        assert_eq!(unit_values(&c).unwrap(), v, "same input twice, same output");
    }

    // Shared with the JS regression test in tests/pack-population.test.mjs: raw exact binary ties and what the preview
    // (JS `Number(v.toPrecision(3))`, half away from zero) shows for them.
    const TIES: [(&str, f64, f64); 7] = [
        ("channel_separation_db", 31.25, 31.3),
        ("wow_flutter_rms_percent", 1.125, 1.13),
        ("left_hum_dbfs", -62.25, -62.3),
        ("dropout_count", 100.5, 101.0),
        ("dropout_count", 1005.0, 1010.0),
        ("channel_separation_db", 10.25, 10.3),
        ("channel_separation_db", 12.25, 12.3),
    ];

    #[test]
    fn regression_round_sig3_ties_match_the_js_preview() {
        for (_, raw, shown) in TIES {
            assert_eq!(round_sig3(raw), shown, "tie {raw} rounds like toPrecision(3)");
            assert_eq!(round_sig3(shown), shown, "already-rounded {shown} is left alone");
            assert_eq!(round_sig3(-raw), -shown, "ties round away from zero for negatives too");
        }
        // Not ties: the exact double just below/above x.xx5 rounds to the nearest value as before.
        assert_eq!(round_sig3(9.995), 9.99);
        assert_eq!(round_sig3(31.250000000000004), 31.3);
        assert_eq!(round_sig3(31.249999999999996), 31.2);
        // Carry into the next decade.
        assert_eq!(round_sig3(9.995_f64.next_up()), 10.0);
        assert_eq!(round_sig3(999.5), 1000.0);
        assert_eq!(round_sig3(0.0009995), 0.000999, "0.0009995 is not an exact tie in binary");

        // The written file equals the previewed document, whether the bridge sends raw or already-rounded rows.
        for values in [TIES.map(|(m, raw, _)| (m, raw)), TIES.map(|(m, _, shown)| (m, shown))] {
            let rows: Vec<Value> = values.iter().map(|(m, v)| row("plx", m, *v)).collect();
            let sel: ExportSelection = serde_json::from_value(selection(rows)).unwrap();
            let (_, text) = build_export(&sel).unwrap();
            let written: Value = serde_json::from_str(&text).unwrap();
            let previewed = json!({
                "format": "deckchek-pack", "version": 1, "packId": "pack-out", "createdMonth": "2026-10",
                "appVersion": env!("CARGO_PKG_VERSION"), "contributor": "token-1",
                "rows": TIES.iter().map(|(m, _, shown)| row("plx", m, *shown)).collect::<Vec<_>>(),
            });
            assert_eq!(written, previewed);
        }
    }

    fn insert_samples(c: &Connection, pack_id: &str, rows: impl Iterator<Item = (String, i64, f64)>) {
        c.execute("INSERT INTO reference_pack(id, source_label, imported_at, row_count, sha256) VALUES (?1, NULL, 't', 0, 'x')", params![pack_id]).unwrap();
        c.execute_batch("BEGIN").unwrap();
        {
            let mut stmt = c
                .prepare("INSERT INTO reference_sample(id, pack_id, contributor, product_key, metric_key, method_key, method_version, value, unit, row_hash) VALUES (?1, ?2, ?3, 'plx', 'dropout_count', 'dropout_count', ?4, ?5, 'regions', ?1)")
                .unwrap();
            for (i, (contributor, version, value)) in rows.enumerate() {
                stmt.execute(params![format!("{pack_id}-{i}"), pack_id, contributor, version, value]).unwrap();
            }
        }
        c.execute_batch("COMMIT").unwrap();
    }

    #[test]
    fn regression_population_query_one_contributor_cannot_crowd_out_honest_contributors() {
        let c = mem();
        // One hostile token that sorts before every real one, with more rows than the global limit (distinct versions).
        insert_samples(&c, "hostile", (0..(MAX_ROWS as i64 + 10)).map(|i| ("-".to_string(), i + 1, (i % 1000) as f64)));
        // Sybil tokens that also sort first, each filling its own per-contributor share.
        insert_samples(&c, "sybil", (0..250 * 1100).map(|i| (format!("-s{:03}", i / 1100), 1 + (i % 7) as i64, (i % 1100) as f64)));
        // 25 honest contributors with one row each, and one honest contributor with many rows.
        insert_samples(&c, "honest", (0..25).map(|i| (format!("c{i:02}"), 1, 10.0 + i as f64)));
        insert_samples(&c, "big", (0..2001).map(|i| ("cbig".to_string(), 1, i as f64)));
        let q = query_population(&c, "plx", "dropout_count", "dropout_count").unwrap();
        assert!(q.truncated, "rows were dropped, so the result says so");
        assert_eq!(q.rows.len(), MAX_ROWS, "the global limit was reached, so the round-robin share decided");
        let honest: HashSet<&str> = q.rows.iter().map(|r| r.contributor.as_str()).filter(|t| t.starts_with('c')).collect();
        assert_eq!(honest.len(), 26, "every honest contributor survives the limit");
        assert_eq!(q.contributors, 1 + 250 + 26);
        let mut big: Vec<f64> = q.rows.iter().filter(|r| r.contributor == "cbig").map(|r| r.value).collect();
        big.sort_by(f64::total_cmp);
        assert!(big.len() < 2001, "one contributor's rows are capped");
        assert_eq!(big[big.len() / 2], 1000.0, "the kept window is centred, so the contributor's median is unchanged");
        assert_eq!(big.len() % 2, 1, "symmetric window around the median of an odd count");
        let per: HashMap<&str, usize> = q.rows.iter().fold(HashMap::new(), |mut m, r| {
            *m.entry(r.contributor.as_str()).or_default() += 1;
            m
        });
        assert!(per["-"] <= MAX_POP_WINDOW * MAX_POP_VERSIONS_PER_CONTRIBUTOR, "the hostile token gets one share, not the whole limit");
        assert_eq!(query_population(&c, "plx", "dropout_count", "dropout_count").unwrap(), q, "deterministic");
        // Small cells are untouched and not marked truncated.
        let small = mem();
        insert_samples(&small, "p", (0..5).map(|i| (format!("t{i}"), 1, i as f64)));
        let s = query_population(&small, "plx", "dropout_count", "dropout_count").unwrap();
        assert_eq!((s.rows.len(), s.contributors, s.truncated), (5, 5, false));
    }

    /// AUD-03: the pack commands open the database through `open(&app)`, which the db.rs source scan does not list, so
    /// check them here: every command that opens the database is `async` and runs its body through `db::off_main`.
    #[test]
    fn regression_aud_03_pack_db_commands_run_off_the_main_thread() {
        let src = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("src/pack.rs")).unwrap();
        let src = &src[..src.find("#[cfg(test)]").unwrap()];
        let mut checked = Vec::new();
        for chunk in src.split("#[tauri::command]").skip(1) {
            let body = &chunk[..chunk.find("\n}").unwrap()];
            let name: String = body[body.find("fn ").unwrap() + 3..].chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
            if body.contains("open(&app)") || body.contains("open_database(") {
                assert!(body.contains("pub async fn") && body.contains("crate::db::off_main("), "{name} opens the database on the main thread");
                checked.push(name);
            }
        }
        assert_eq!(checked, ["pack_preview", "pack_import", "pack_list", "pack_remove", "population_query", "population_unit_values"]);
    }

    #[test]
    fn regression_population_query_returns_the_method_registry_for_ac7_compat() {
        let c = mem();
        c.execute_batch(
            "INSERT INTO analysis_method(id,key,version,description,parameters_json,created_at) VALUES
               ('d1','dropout_count',1,'v1','{\"compat\":[2]}','t'),
               ('d2','dropout_count',2,'v2','{\"compat\":[1]}','t'),
               ('d3','dropout_count',3,'v3','{\"compat\":[]}','t'),
               ('o1','wow_flutter_rms_percent',1,'other key','{\"compat\":[2]}','t');",
        )
        .unwrap();
        insert_samples(&c, "p", (0..9).map(|i| (format!("t{i}"), 1 + (i % 3) as i64, i as f64)));
        let q = query_population(&c, "plx", "dropout_count", "dropout_count").unwrap();
        let got: Vec<(&str, i64, &str)> = q.methods.iter().map(|m| (m.key.as_str(), m.version, m.parameters_json.as_str())).collect();
        assert_eq!(got, vec![("dropout_count", 1, "{\"compat\":[2]}"), ("dropout_count", 2, "{\"compat\":[1]}"), ("dropout_count", 3, "{\"compat\":[]}")], "only this method key, every version");
        // compare.js comparePopulation reads result.methods[].{key, version, parametersJson}.
        let json = serde_json::to_value(&q).unwrap();
        assert_eq!(json["methods"][1], json!({ "key": "dropout_count", "version": 2, "parametersJson": "{\"compat\":[1]}" }));
        // A cell with no local method rows still answers, with an empty registry.
        assert!(query_population(&c, "plx", "dropout_count", "unknown_method").unwrap().methods.is_empty());
    }

    fn seed_many_units(c: &Connection, units: usize, runs: usize) {
        c.execute_batch(
            "INSERT INTO product(id,category,model,created_at,updated_at) VALUES('prod-tt','turntable','TT','t','t');
             INSERT INTO device_profile(id,product_id,json,loaded_at) VALUES('profile-tt','prod-tt','{}','t');
             BEGIN;",
        )
        .unwrap();
        let metrics: Vec<String> = {
            let mut m: Vec<String> = metric_table().keys().cloned().collect();
            m.sort();
            m
        };
        for (i, m) in metrics.iter().enumerate() {
            c.execute("INSERT INTO analysis_method(id,key,version,description,created_at) VALUES(?1,?2,1,'x','t')", params![format!("m{i}"), m]).unwrap();
        }
        let mut ins = c.prepare("INSERT INTO measurement(id,session_id,method_id,metric_key,state,numeric_value,unit,quality_flags_json,created_at) VALUES(?1,?2,?3,?4,'measured',?5,?6,'[]','t')").unwrap();
        for u in 0..units {
            c.execute("INSERT INTO asset(id,product_id,nickname,serial_number,created_at,updated_at) VALUES(?1,'prod-tt',?1,NULL,'t','t')", params![format!("u{u:03}")]).unwrap();
            for r in 0..runs {
                let sid = format!("s{u:03}-{r:03}");
                c.execute(
                    "INSERT INTO session(id,session_type,setup_id,started_at,app_version,schema_version,status,config_snapshot_json) VALUES(?1,'speed',NULL,?2,'0',1,'completed',?3)",
                    params![sid, format!("2026-{:02}-{:02}T{:02}:00:00Z", 1 + u % 12, 1 + r % 28, r % 24), format!("{{\"assetId\":\"u{u:03}\"}}")],
                )
                .unwrap();
                for (i, m) in metrics.iter().enumerate() {
                    let unit = &metric_table()[m].unit;
                    ins.execute(params![format!("{sid}-{i}"), sid, format!("m{i}"), m, (r % 10) as f64, unit]).unwrap();
                }
            }
        }
        drop(ins);
        c.execute_batch("COMMIT").unwrap();
    }

    #[test]
    fn regression_unit_values_never_drop_whole_units_at_the_row_cap() {
        let c = mem();
        let units = 40; // 40 units x 13 metrics x 50 runs = 26,000 rows, above MAX_UNIT_ROWS
        seed_many_units(&c, units, MAX_UNIT_ROWS_PER_PAIR);
        let v = unit_values(&c).unwrap();
        assert!(v.truncated, "the cap was hit, so the result says so");
        assert!(v.rows.len() <= MAX_UNIT_ROWS);
        let assets: HashSet<&str> = v.rows.iter().map(|r| r.asset_id.as_str()).collect();
        assert_eq!(assets.len(), units, "every unit is still in the picker, the sibling ranking and the export");
        let pairs: HashSet<(&str, &str)> = v.rows.iter().map(|r| (r.asset_id.as_str(), r.metric.as_str())).collect();
        assert_eq!(pairs.len(), units * metric_table().len(), "every (unit, metric) keeps its latest value");
        // Rows stay grouped per (unit, metric), oldest first, and the newest run is the one kept last.
        for w in v.rows.windows(2) {
            if (w[0].asset_id.as_str(), w[0].metric.as_str()) == (w[1].asset_id.as_str(), w[1].metric.as_str()) {
                assert!(w[0].at <= w[1].at);
            }
        }
        let small = mem();
        seed_many_units(&small, 2, 3);
        assert!(!unit_values(&small).unwrap().truncated);
    }

    #[test]
    fn regression_unit_values_sql_limit_never_drops_a_whole_old_unit() {
        let c = mem();
        // 160 units x 13 metrics x 50 runs = 104,000 rows after the per-pair cap: above the SQL safety LIMIT.
        seed_many_units(&c, 160, MAX_UNIT_ROWS_PER_PAIR);
        // One unit measured once, years before everything else, so a LIMIT taken newest first would cut it off.
        c.execute_batch(
            "INSERT INTO asset(id,product_id,nickname,serial_number,created_at,updated_at) VALUES('old','prod-tt','Old deck',NULL,'t','t');
             INSERT INTO session(id,session_type,setup_id,started_at,app_version,schema_version,status,config_snapshot_json) VALUES('s-old','speed',NULL,'2020-01-01T00:00:00Z','0',1,'completed','{\"assetId\":\"old\"}');
             INSERT INTO measurement(id,session_id,method_id,metric_key,state,numeric_value,unit,quality_flags_json,created_at)
               SELECT 'm-old', 's-old', id, key, 'measured', 0.3, '%', '[]', 't' FROM analysis_method WHERE key = 'wow_flutter_rms_percent';",
        )
        .unwrap();
        let v = unit_values(&c).unwrap();
        assert!(v.truncated, "values were left out, so the result says so");
        assert!(v.rows.len() <= MAX_UNIT_ROWS);
        let assets: HashSet<&str> = v.rows.iter().map(|r| r.asset_id.as_str()).collect();
        assert!(assets.contains("old"), "the oldest unit is still listed");
        assert_eq!(assets.len(), 161);
        let pairs: HashSet<(&str, &str)> = v.rows.iter().map(|r| (r.asset_id.as_str(), r.metric.as_str())).collect();
        assert_eq!(pairs.len(), 160 * metric_table().len() + 1, "every (unit, metric) keeps its latest value");
        // Each kept list is still the newest values of that pair, oldest first.
        let mut newest: HashMap<(&str, &str), &str> = HashMap::new();
        for w in v.rows.windows(2) {
            if (w[0].asset_id.as_str(), w[0].metric.as_str()) == (w[1].asset_id.as_str(), w[1].metric.as_str()) {
                assert!(w[0].at <= w[1].at);
            }
        }
        for r in &v.rows {
            newest.insert((r.asset_id.as_str(), r.metric.as_str()), r.at.as_str());
        }
        let latest: String = c.query_row("SELECT MAX(started_at) FROM session WHERE id LIKE 's000-%'", [], |r| r.get(0)).unwrap();
        assert_eq!(newest[&("u000", "dropout_count")], latest.as_str(), "the newest run of a unit is the one kept last");
    }

    #[test]
    fn regression_unit_values_old_units_survive_many_newer_measurements() {
        let c = mem();
        seed_units(&c); // a1 and a2, measured in early October 2026
        c.execute_batch("INSERT INTO asset(id,product_id,nickname,serial_number,created_at,updated_at) VALUES('busy','prod-tt','Busy','SN-9','t','t'); BEGIN;").unwrap();
        {
            let mut s = c.prepare("INSERT INTO session(id,session_type,setup_id,started_at,app_version,schema_version,status,config_snapshot_json) VALUES(?1,'speed',NULL,?2,'0',1,'completed','{\"assetId\":\"busy\"}')").unwrap();
            let mut m = c.prepare("INSERT INTO measurement(id,session_id,method_id,metric_key,state,numeric_value,unit,quality_flags_json,created_at) VALUES(?1,?2,'m-wf','wow_flutter_rms_percent','measured',0.2,'%','[]','t')").unwrap();
            for r in 0..(MAX_UNIT_ROWS * 5 + 10) {
                let sid = format!("busy-{r:06}");
                s.execute(params![sid, format!("2026-11-01T00:00:00.{r:06}Z")]).unwrap();
                m.execute(params![format!("bm-{r:06}"), sid]).unwrap();
            }
        }
        c.execute_batch("COMMIT").unwrap();
        let v = unit_values(&c).unwrap();
        let assets: HashSet<&str> = v.rows.iter().map(|r| r.asset_id.as_str()).collect();
        assert_eq!(assets, HashSet::from(["a1", "a2", "busy"]), "older units are not pushed out by a busy one");
        assert_eq!(v.rows.iter().filter(|r| r.asset_id == "busy").count(), MAX_UNIT_ROWS_PER_PAIR);
    }
}
