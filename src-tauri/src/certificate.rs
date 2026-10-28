//! Used-gear test certificates (FS-20 §4–§7): signing, verification, extraction and storage.
//! Mirror of the pure JS engine `app/certificate.js` (same schema, limits and status rules).
//!
//! Public surface (kept small; FS-33 gear ledger builds on it):
//! - [`parse_strict`] `(text) -> Value` — size cap, depth <= 32, duplicate keys rejected.
//! - [`validate_payload`] `(&Value) -> Result<(), String>` — strict schema v1 of `payload`.
//! - [`content_hash`] `(&Value) -> (hex, [u8;32])` — SHA-256 of the canonical payload (FS-00 §6.1).
//! - [`sign_payload`] `(conn, key_dir, &Value) -> SignResult` — validate, hash, Ed25519-sign the hash bytes.
//! - [`verify_text`] `(text, now_iso, is_local) -> VerifyReport` — never panics or errors; untrusted input
//!   becomes status `unverifiable` (unknown format/version, malformed, missing signature) or `modified`
//!   ("content hash mismatch", bad signature) with reasons. `expired` is separate from `status`.
//! - [`extract_json`] `(path) -> String` — bounded certificate-envelope JSON from `.json` or the
//!   `<script id="deckchek-cert">` block of a DeckChek `.html`; validity is left to `verify_text`.
//!   `.pdf` returns `pdf_has_no_attachment` (v1: WebView2 PrintToPdf embeds no files).
//! - [`store`] / [`list`] / [`get`] — `certificate` rows (0014). `store` re-verifies the file and derives
//!   every column from the signed payload, so the UI cannot store a record that does not match it.
//!
//! File format v1 (`.deckchek-cert.json`): `{format:"deckchek-certificate", version:1, payload:{…},
//! integrity:{alg:"ed25519", hashAlg:"sha256", contentHash, signature, publicKey, fingerprint}}`.
//! The hash covers `payload` only; the signature is over the 32 hash bytes. Measured values are decimal
//! strings (the canonical form forbids non-integer numbers).

use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::de::{self, Deserializer, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

use crate::canonical::canonical_json;
use crate::signing::{self, SigningError};

pub const FORMAT: &str = "deckchek-certificate";
pub const VERSION: i64 = 1;
pub const SCHEMA_VERSION: i64 = 1;
pub const QR_PREFIX: &str = "deckchek:cert:v1:";
/// JSON text cap (FS-20 §7: "JSON parsing limited to 20 MB and depth 32").
pub const MAX_JSON_BYTES: u64 = 20 * 1024 * 1024;
/// HTML certificates carry the photos twice (img + embedded JSON), so the file cap is larger.
pub const MAX_HTML_BYTES: u64 = 48 * 1024 * 1024;
/// Canonical payload cap (photos included): FS-20 §7 "cap total payload at 16 MB".
pub const MAX_PAYLOAD_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_JSON_DEPTH: usize = 32;
pub const MAX_PHOTOS: usize = 6;
pub const MAX_PHOTO_B64: usize = 4 * 1024 * 1024;
pub const MAX_RESULTS: usize = 500;
pub const MAX_MEASUREMENTS: usize = 2000;
pub const MAX_TEXT: usize = 200;
pub const MAX_LONG_TEXT: usize = 4000;
pub const HTML_MARKER: &str = r#"<script type="application/json" id="deckchek-cert">"#;
pub const RESULT_STATUSES: &[&str] = &["pass", "fail", "unknown", "skipped"];
pub const VERDICTS: &[&str] = &["pass", "pass_uncalibrated", "review", "fail"];
pub const CAL_STATES: &[&str] = &["calibrated", "uncalibrated", "expired", "not_required"];
pub const DECISIONS: &[&str] = &["inside", "ambiguous", "outside", "no_limit"];

// ------------------------------------------------------------------ errors

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CertError {
    TooLarge,
    NotUtf8,
    Json(String),
    TooDeep,
    DuplicateKey,
    Schema(String),
    NotCanonical(String),
    BadPath(&'static str),
    PdfNoAttachment,
    NoCertificateData,
    NotVerified(String),
    Io(String),
    Signing(SigningError),
    Db(String),
}

impl CertError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::TooLarge => "too_large",
            Self::NotUtf8 => "not_utf8",
            Self::Json(_) => "invalid_json",
            Self::TooDeep => "too_deep",
            Self::DuplicateKey => "duplicate_key",
            Self::Schema(_) => "schema",
            Self::NotCanonical(_) => "not_canonical",
            Self::BadPath(_) => "bad_path",
            Self::PdfNoAttachment => "pdf_has_no_attachment",
            Self::NoCertificateData => "no_certificate_data",
            Self::NotVerified(_) => "not_verified",
            Self::Io(_) => "io",
            Self::Signing(e) => e.code(),
            Self::Db(_) => "db",
        }
    }
}

impl std::fmt::Display for CertError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooLarge => write!(f, "the file is larger than a DeckChek certificate can be"),
            Self::NotUtf8 => write!(f, "the file is not UTF-8 text"),
            Self::Json(e) => write!(f, "the file is not valid JSON ({e})"),
            Self::TooDeep => write!(f, "the JSON is nested deeper than {MAX_JSON_DEPTH} levels"),
            Self::DuplicateKey => write!(f, "the JSON repeats a key inside one object"),
            Self::Schema(e) => write!(f, "the certificate does not follow schema v1: {e}"),
            Self::NotCanonical(e) => write!(f, "the payload cannot be canonicalised: {e}"),
            Self::BadPath(why) => write!(f, "invalid file path: {why}"),
            Self::PdfNoAttachment => write!(f, "This PDF has no DeckChek data attached. Open the .deckchek-cert.json file that came with it."),
            Self::NoCertificateData => write!(f, "this HTML file has no DeckChek certificate data"),
            Self::NotVerified(why) => write!(f, "the certificate did not verify: {why}"),
            Self::Io(kind) => write!(f, "could not read or write the file ({kind})"),
            Self::Signing(e) => write!(f, "{e}"),
            Self::Db(e) => write!(f, "certificate storage failed: {e}"),
        }
    }
}

impl Serialize for CertError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("CertError", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

impl From<std::io::Error> for CertError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(format!("{:?}", e.kind()))
    }
}

impl From<SigningError> for CertError {
    fn from(e: SigningError) -> Self {
        Self::Signing(e)
    }
}

fn db_err(e: rusqlite::Error) -> CertError {
    CertError::Db(e.to_string())
}

// ------------------------------------------------------------------ strict JSON

/// Rejects nesting deeper than MAX_JSON_DEPTH with a byte scan before serde recursion starts.
fn check_depth(text: &str) -> Result<(), CertError> {
    let (mut depth, mut in_str, mut esc) = (0usize, false, false);
    for &b in text.as_bytes() {
        if in_str {
            if esc {
                esc = false;
            } else if b == b'\\' {
                esc = true;
            } else if b == b'"' {
                in_str = false;
            }
            continue;
        }
        match b {
            b'"' => in_str = true,
            b'{' | b'[' => {
                depth += 1;
                if depth > MAX_JSON_DEPTH {
                    return Err(CertError::TooDeep);
                }
            }
            b'}' | b']' => depth = depth.saturating_sub(1),
            _ => {}
        }
    }
    Ok(())
}

struct StrictValue(Value);

impl<'de> Deserialize<'de> for StrictValue {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        d.deserialize_any(StrictVisitor).map(StrictValue)
    }
}

struct StrictVisitor;

const DUP: &str = "duplicate object key";

impl<'de> Visitor<'de> for StrictVisitor {
    type Value = Value;
    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str("JSON")
    }
    fn visit_bool<E>(self, v: bool) -> Result<Value, E> {
        Ok(Value::Bool(v))
    }
    fn visit_i64<E>(self, v: i64) -> Result<Value, E> {
        Ok(Value::from(v))
    }
    fn visit_u64<E>(self, v: u64) -> Result<Value, E> {
        Ok(Value::from(v))
    }
    fn visit_f64<E: de::Error>(self, v: f64) -> Result<Value, E> {
        serde_json::Number::from_f64(v).map(Value::Number).ok_or_else(|| E::custom("non-finite number"))
    }
    fn visit_str<E>(self, v: &str) -> Result<Value, E> {
        Ok(Value::String(v.to_owned()))
    }
    fn visit_string<E>(self, v: String) -> Result<Value, E> {
        Ok(Value::String(v))
    }
    fn visit_unit<E>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }
    fn visit_none<E>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Value, A::Error> {
        let mut out = Vec::new();
        while let Some(StrictValue(v)) = seq.next_element()? {
            out.push(v);
        }
        Ok(Value::Array(out))
    }
    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Value, A::Error> {
        let mut out = Map::new();
        while let Some(k) = map.next_key::<String>()? {
            if out.contains_key(&k) {
                return Err(de::Error::custom(DUP));
            }
            let StrictValue(v) = map.next_value()?;
            out.insert(k, v);
        }
        Ok(Value::Object(out))
    }
}

/// Parses untrusted certificate JSON: size cap, depth cap, no duplicate keys, single value.
pub fn parse_strict(text: &str) -> Result<Value, CertError> {
    if text.len() as u64 > MAX_JSON_BYTES {
        return Err(CertError::TooLarge);
    }
    check_depth(text)?;
    let mut de = serde_json::Deserializer::from_str(text);
    let v = StrictValue::deserialize(&mut de).map_err(|e| {
        if e.to_string().starts_with(DUP) {
            CertError::DuplicateKey
        } else {
            CertError::Json(format!("line {} column {}", e.line(), e.column()))
        }
    })?;
    de.end().map_err(|e| CertError::Json(format!("trailing data at line {} column {}", e.line(), e.column())))?;
    Ok(v.0)
}

// ------------------------------------------------------------------ schema v1

type Obj = Map<String, Value>;

fn obj<'a>(v: &'a Value, path: &str) -> Result<&'a Obj, String> {
    v.as_object().ok_or_else(|| format!("{path} must be an object"))
}

fn exact_keys(o: &Obj, path: &str, required: &[&str], optional: &[&str]) -> Result<(), String> {
    for k in required {
        if !o.contains_key(*k) {
            return Err(format!("{path}.{k} is missing"));
        }
    }
    for k in o.keys() {
        if !required.contains(&k.as_str()) && !optional.contains(&k.as_str()) {
            return Err(format!("{path} has an unknown field \"{}\"", k.chars().take(40).collect::<String>()));
        }
    }
    Ok(())
}

fn text<'a>(o: &'a Obj, key: &str, path: &str, min: usize, max: usize) -> Result<&'a str, String> {
    let s = o.get(key).and_then(Value::as_str).ok_or_else(|| format!("{path}.{key} must be a string"))?;
    let n = s.chars().count();
    if n < min || n > max {
        return Err(format!("{path}.{key} must be {min}–{max} characters"));
    }
    Ok(s)
}

fn opt_text<'a>(o: &'a Obj, key: &str, path: &str, max: usize) -> Result<Option<&'a str>, String> {
    match o.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(_) => text(o, key, path, 0, max).map(Some),
    }
}

fn one_of(o: &Obj, key: &str, path: &str, allowed: &[&str]) -> Result<(), String> {
    let s = o.get(key).and_then(Value::as_str).ok_or_else(|| format!("{path}.{key} must be a string"))?;
    if allowed.contains(&s) {
        Ok(())
    } else {
        Err(format!("{path}.{key} has an unknown value"))
    }
}

/// An integer as JavaScript sees it: `1` and `1.0` are the same number (JSON.parse), so both count.
fn as_int(v: &Value) -> Option<i64> {
    v.as_i64().or_else(|| v.as_f64().filter(|f| f.fract() == 0.0 && f.abs() <= 9_007_199_254_740_991.0).map(|f| f as i64))
}

fn int(o: &Obj, key: &str, path: &str, min: i64, max: i64) -> Result<i64, String> {
    let n = o.get(key).and_then(as_int).filter(|n| (min..=max).contains(n));
    n.ok_or_else(|| format!("{path}.{key} must be an integer {min}–{max}"))
}

/// `-?(0|[1-9]\d{0,14})(\.\d{1,12})?` — decimal strings for measured values.
pub fn is_decimal(s: &str) -> bool {
    let b = s.strip_prefix('-').unwrap_or(s).as_bytes();
    let (int_part, frac) = match b.iter().position(|&c| c == b'.') {
        Some(i) => (&b[..i], Some(&b[i + 1..])),
        None => (b, None),
    };
    let int_ok = !int_part.is_empty() && int_part.len() <= 15 && int_part.iter().all(u8::is_ascii_digit) && (int_part == b"0" || int_part[0] != b'0');
    let frac_ok = frac.map_or(true, |f| !f.is_empty() && f.len() <= 12 && f.iter().all(u8::is_ascii_digit));
    int_ok && frac_ok
}

fn decimal(o: &Obj, key: &str, path: &str, nullable: bool) -> Result<(), String> {
    match o.get(key) {
        Some(Value::Null) if nullable => Ok(()),
        Some(Value::String(s)) if is_decimal(s) => Ok(()),
        _ => Err(format!("{path}.{key} must be a decimal string{}", if nullable { " or null" } else { "" })),
    }
}

/// `YYYY-MM-DDTHH:MM:SS(.sss)Z`, with plausible field ranges.
pub fn is_iso_utc(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() < 20 || b.len() > 24 || b[b.len() - 1] != b'Z' {
        return false;
    }
    let digits = |r: std::ops::Range<usize>| b[r].iter().all(u8::is_ascii_digit);
    let num = |r: std::ops::Range<usize>| s[r].parse::<u32>().unwrap_or(99);
    let shape = digits(0..4) && b[4] == b'-' && digits(5..7) && b[7] == b'-' && digits(8..10) && b[10] == b'T' && digits(11..13) && b[13] == b':' && digits(14..16) && b[16] == b':' && digits(17..19);
    if !shape || !(1..=12).contains(&num(5..7)) || !(1..=31).contains(&num(8..10)) || num(11..13) > 23 || num(14..16) > 59 || num(17..19) > 60 {
        return false;
    }
    match b.len() {
        20 => true,
        n => b[19] == b'.' && n >= 22 && digits(20..n - 1),
    }
}

/// Sort key for ISO timestamps: seconds part plus milliseconds padded to 3 digits.
fn iso_key(s: &str) -> String {
    let frac = s.get(20..s.len().saturating_sub(1)).unwrap_or("");
    format!("{}.{:0<3}", s.get(..19).unwrap_or(""), frac)
}

fn iso(o: &Obj, key: &str, path: &str) -> Result<(), String> {
    match o.get(key).and_then(Value::as_str) {
        Some(s) if is_iso_utc(s) => Ok(()),
        _ => Err(format!("{path}.{key} must be an ISO UTC timestamp")),
    }
}

fn array<'a>(o: &'a Obj, key: &str, path: &str, max: usize) -> Result<&'a Vec<Value>, String> {
    let a = o.get(key).and_then(Value::as_array).ok_or_else(|| format!("{path}.{key} must be an array"))?;
    if a.len() > max {
        return Err(format!("{path}.{key} has more than {max} entries"));
    }
    Ok(a)
}

fn is_hex(s: &str, len: usize) -> bool {
    s.len() == len && s.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

/// Strict schema v1 of `payload` (mirrors `validatePayload` in app/certificate.js).
pub fn validate_payload(payload: &Value) -> Result<(), String> {
    let p = obj(payload, "payload")?;
    exact_keys(p, "payload", &["unit", "plan", "results", "measurements", "tester", "deckchekVersion", "schemaVersion", "issuedAt", "validUntil", "verdict", "disclaimer"], &[])?;
    let unit = obj(&p["unit"], "payload.unit")?;
    exact_keys(unit, "payload.unit", &["model", "productId", "serial", "firmware", "notes", "photos"], &[])?;
    text(unit, "model", "payload.unit", 1, MAX_TEXT)?;
    text(unit, "productId", "payload.unit", 1, MAX_TEXT)?;
    text(unit, "serial", "payload.unit", 1, MAX_TEXT)?;
    text(unit, "firmware", "payload.unit", 0, MAX_TEXT)?;
    text(unit, "notes", "payload.unit", 0, MAX_LONG_TEXT)?;
    for (i, ph) in array(unit, "photos", "payload.unit", MAX_PHOTOS)?.iter().enumerate() {
        let path = format!("payload.unit.photos[{i}]");
        let ph = obj(ph, &path)?;
        exact_keys(ph, &path, &["name", "sha256", "mime", "dataB64"], &[])?;
        text(ph, "name", &path, 1, MAX_TEXT)?;
        if !ph["sha256"].as_str().is_some_and(|s| is_hex(s, 64)) {
            return Err(format!("{path}.sha256 must be 64 lowercase hex characters"));
        }
        one_of(ph, "mime", &path, &["image/jpeg"])?;
        let data = ph["dataB64"].as_str().ok_or_else(|| format!("{path}.dataB64 must be a string"))?;
        if data.is_empty() || data.len() > MAX_PHOTO_B64 || data.len() % 4 != 0 || !data.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'+' || c == b'/' || c == b'=') {
            return Err(format!("{path}.dataB64 must be base64 of at most {MAX_PHOTO_B64} characters"));
        }
    }
    let plan = obj(&p["plan"], "payload.plan")?;
    exact_keys(plan, "payload.plan", &["profileId", "profileVersion", "testIds"], &[])?;
    text(plan, "profileId", "payload.plan", 1, MAX_TEXT)?;
    int(plan, "profileVersion", "payload.plan", 0, 1_000_000)?;
    for (i, t) in array(plan, "testIds", "payload.plan", MAX_RESULTS)?.iter().enumerate() {
        if !t.as_str().is_some_and(|s| !s.is_empty() && s.chars().count() <= MAX_TEXT) {
            return Err(format!("payload.plan.testIds[{i}] must be a non-empty string"));
        }
    }
    for (i, r) in array(p, "results", "payload", MAX_RESULTS)?.iter().enumerate() {
        let path = format!("payload.results[{i}]");
        let r = obj(r, &path)?;
        exact_keys(r, &path, &["testId", "title", "status", "detail"], &[])?;
        text(r, "testId", &path, 1, MAX_TEXT)?;
        text(r, "title", &path, 0, MAX_TEXT)?;
        one_of(r, "status", &path, RESULT_STATUSES)?;
        text(r, "detail", &path, 0, MAX_LONG_TEXT)?;
    }
    for (i, m) in array(p, "measurements", "payload", MAX_MEASUREMENTS)?.iter().enumerate() {
        let path = format!("payload.measurements[{i}]");
        let m = obj(m, &path)?;
        exact_keys(m, &path, &["testId", "metricId", "label", "value", "unit", "uncertainty", "referenceLow", "referenceHigh", "methodKey", "methodVersion", "decision", "calibration"], &[])?;
        text(m, "testId", &path, 1, MAX_TEXT)?;
        text(m, "metricId", &path, 1, MAX_TEXT)?;
        text(m, "label", &path, 0, MAX_TEXT)?;
        decimal(m, "value", &path, false)?;
        text(m, "unit", &path, 0, 40)?;
        decimal(m, "uncertainty", &path, true)?;
        decimal(m, "referenceLow", &path, true)?;
        decimal(m, "referenceHigh", &path, true)?;
        text(m, "methodKey", &path, 0, MAX_TEXT)?;
        int(m, "methodVersion", &path, 0, 1_000_000)?;
        one_of(m, "decision", &path, DECISIONS)?;
        let cpath = format!("{path}.calibration");
        let c = obj(&m["calibration"], &cpath)?;
        exact_keys(c, &cpath, &["state", "refId", "date"], &[])?;
        one_of(c, "state", &cpath, CAL_STATES)?;
        opt_text(c, "refId", &cpath, MAX_TEXT)?;
        if !matches!(c.get("date"), Some(Value::Null)) {
            iso(c, "date", &cpath)?;
        }
    }
    text(p, "tester", "payload", 1, MAX_TEXT)?;
    text(p, "deckchekVersion", "payload", 0, 40)?;
    int(p, "schemaVersion", "payload", SCHEMA_VERSION, SCHEMA_VERSION)?;
    iso(p, "issuedAt", "payload")?;
    iso(p, "validUntil", "payload")?;
    if iso_key(p["validUntil"].as_str().unwrap_or("")) <= iso_key(p["issuedAt"].as_str().unwrap_or("")) {
        return Err("payload.validUntil must be after issuedAt".into());
    }
    one_of(p, "verdict", "payload", VERDICTS)?;
    text(p, "disclaimer", "payload", 1, MAX_LONG_TEXT)?;
    Ok(())
}

/// Canonical payload text, capped at MAX_PAYLOAD_BYTES.
fn canonical_payload(payload: &Value) -> Result<String, CertError> {
    let text = canonical_json(payload).map_err(|e| CertError::NotCanonical(e.to_string()))?;
    if text.len() > MAX_PAYLOAD_BYTES {
        return Err(CertError::TooLarge);
    }
    Ok(text)
}

/// SHA-256 of the canonical payload: (lowercase hex, raw bytes).
pub fn content_hash(payload: &Value) -> Result<(String, [u8; 32]), CertError> {
    let digest: [u8; 32] = Sha256::digest(canonical_payload(payload)?.as_bytes()).into();
    Ok((hex(&digest), digest))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Longest object key and most keys per object any schema v1 payload has (with headroom).
const MAX_KEY_BYTES: usize = 64;
const MAX_OBJECT_KEYS: usize = 32;

/// Cheap, linear bounds every schema v1 payload is inside: the payload key set, and caps on key
/// length, keys per object, array length (MAX_MEASUREMENTS) and string length (MAX_PHOTO_B64).
/// Runs on untrusted input BEFORE canonicalisation so a hostile file cannot make hashing slow
/// (FS-20 review); the full `validate_payload` still runs after the signature check.
fn check_payload_bounds(payload: &Value) -> Result<(), String> {
    let p = obj(payload, "payload")?;
    exact_keys(p, "payload", &["unit", "plan", "results", "measurements", "tester", "deckchekVersion", "schemaVersion", "issuedAt", "validUntil", "verdict", "disclaimer"], &[])?;
    let mut stack = vec![payload];
    while let Some(v) = stack.pop() {
        match v {
            Value::String(s) if s.len() > MAX_PHOTO_B64 => return Err(format!("a string is longer than {MAX_PHOTO_B64} bytes")),
            Value::Array(items) if items.len() > MAX_MEASUREMENTS => return Err(format!("an array has more than {MAX_MEASUREMENTS} entries")),
            Value::Array(items) => stack.extend(items),
            Value::Object(map) if map.len() > MAX_OBJECT_KEYS => return Err(format!("an object has more than {MAX_OBJECT_KEYS} fields")),
            Value::Object(map) => {
                if map.keys().any(|k| k.len() > MAX_KEY_BYTES) {
                    return Err(format!("a field name is longer than {MAX_KEY_BYTES} bytes"));
                }
                stack.extend(map.values());
            }
            _ => {}
        }
    }
    Ok(())
}

// ------------------------------------------------------------------ sign

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignResult {
    pub content_hash: String,
    pub signature_b64: String,
    pub public_key_b64: String,
    pub fingerprint: String,
    pub protection: String,
}

/// Validates the payload (never signs drafts or malformed payloads), hashes and signs it.
pub fn sign_payload(conn: &Connection, key_dir: &Path, payload: &Value) -> Result<SignResult, CertError> {
    validate_payload(payload).map_err(CertError::Schema)?;
    let (hash, digest) = content_hash(payload)?;
    let (signature_b64, id) = signing::sign_digest(conn, key_dir, &digest)?;
    Ok(SignResult { content_hash: hash, signature_b64, public_key_b64: id.public_key_b64, fingerprint: id.fingerprint, protection: id.protection })
}

// ------------------------------------------------------------------ verify

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VerifyReport {
    /// "valid" | "modified" | "unverifiable"
    pub status: String,
    pub reasons: Vec<String>,
    pub fingerprint: Option<String>,
    pub expired: bool,
    pub content_hash: Option<String>,
    pub declared_hash: Option<String>,
    pub issued_at: Option<String>,
    pub valid_until: Option<String>,
    pub tester: Option<String>,
    pub model: Option<String>,
    pub serial: Option<String>,
    pub verdict: Option<String>,
    pub issued_by_this_install: bool,
}

fn report(status: &str, reasons: Vec<String>) -> VerifyReport {
    VerifyReport { status: status.into(), reasons, ..Default::default() }
}

fn short(s: &str) -> Option<String> {
    Some(s.chars().take(MAX_TEXT).collect())
}

/// Verifies certificate text. Never panics; every failure is a status with reasons.
pub fn verify_text(text: &str, now_iso: &str, is_local: impl Fn(&str) -> bool) -> VerifyReport {
    let root = match parse_strict(text) {
        Ok(v) => v,
        Err(e) => return report("unverifiable", vec![e.to_string()]),
    };
    let Some(file) = root.as_object() else { return report("unverifiable", vec!["not a DeckChek certificate".into()]) };
    if file.get("format").and_then(Value::as_str) != Some(FORMAT) {
        return report("unverifiable", vec!["not a DeckChek certificate (unknown format)".into()]);
    }
    match file.get("version").and_then(as_int) {
        Some(VERSION) => {}
        Some(v) => return report("unverifiable", vec![format!("unsupported certificate version {v}; update DeckChek to check it")]),
        None => return report("unverifiable", vec!["unsupported certificate version".into()]),
    }
    if let Err(e) = exact_keys(file, "certificate", &["format", "version", "payload"], &["integrity"]) {
        return report("unverifiable", vec![e]);
    }
    let Some(integrity) = file.get("integrity") else { return report("unverifiable", vec!["missing signature (unsigned draft or stripped integrity block)".into()]) };
    let integrity_ok = (|| -> Result<(), String> {
        let i = obj(integrity, "integrity")?;
        exact_keys(i, "integrity", &["alg", "hashAlg", "contentHash", "signature", "publicKey", "fingerprint"], &[])?;
        one_of(i, "alg", "integrity", &["ed25519"])?;
        one_of(i, "hashAlg", "integrity", &["sha256"])?;
        if !i["contentHash"].as_str().is_some_and(|s| is_hex(s, 64)) {
            return Err("integrity.contentHash must be 64 lowercase hex characters".into());
        }
        if !i["fingerprint"].as_str().is_some_and(|s| is_hex(s, 16)) {
            return Err("integrity.fingerprint must be 16 lowercase hex characters".into());
        }
        if !i["signature"].as_str().is_some_and(|s| !s.is_empty()) {
            return Err("missing signature".into());
        }
        if !i["publicKey"].as_str().is_some_and(|s| s.len() <= 64) {
            return Err("integrity.publicKey must be a base64 string".into());
        }
        Ok(())
    })();
    if let Err(e) = integrity_ok {
        return report("unverifiable", vec![e]);
    }
    let Some(i) = integrity.as_object() else { return report("unverifiable", vec!["integrity must be an object".into()]) };
    let declared = i["contentHash"].as_str().unwrap_or_default().to_string();
    let fp = i["fingerprint"].as_str().unwrap_or_default().to_string();
    let pk = i["publicKey"].as_str().unwrap_or_default();
    let sig = i["signature"].as_str().unwrap_or_default();
    let payload = &file["payload"];
    let p = payload.as_object();
    let pick = |k: &str| p.and_then(|p| p.get(k)).and_then(Value::as_str).and_then(short);
    let unit = |k: &str| p.and_then(|p| p.get("unit")).and_then(|u| u.get(k)).and_then(Value::as_str).and_then(short);
    let mut r = VerifyReport {
        status: "modified".into(),
        fingerprint: Some(fp.clone()),
        declared_hash: Some(declared.clone()),
        issued_at: pick("issuedAt"),
        valid_until: pick("validUntil"),
        tester: pick("tester"),
        verdict: pick("verdict"),
        model: unit("model"),
        serial: unit("serial"),
        // set below, only once the signature by the key behind `fp` has verified (FS-20 review)
        issued_by_this_install: false,
        ..Default::default()
    };
    if let Err(e) = check_payload_bounds(payload) {
        // no signed v1 payload is outside these bounds, so the hash cannot match one
        r.reasons.push("content hash mismatch".into());
        r.reasons.push(format!("the payload is outside the schema v1 bounds: {e}"));
        return r;
    }
    let digest = match content_hash(payload) {
        Ok((hash, digest)) => {
            r.content_hash = Some(hash.clone());
            if hash != declared {
                r.reasons.push("content hash mismatch".into());
                return r;
            }
            digest
        }
        Err(e) => {
            r.reasons.push("content hash mismatch".into());
            r.reasons.push(e.to_string());
            return r;
        }
    };
    match signing::decode_fixed::<32>(pk) {
        Some(bytes) if signing::fingerprint(&bytes) == fp => {}
        Some(_) => {
            r.reasons.push("fingerprint does not match the embedded public key".into());
            return r;
        }
        None => {
            r.reasons.push("the embedded public key is not a valid Ed25519 key".into());
            return r;
        }
    }
    if let Err(e) = signing::verify_digest(pk, &digest, sig) {
        r.reasons.push(e.to_string());
        return r;
    }
    if let Err(e) = validate_payload(payload) {
        r.status = "unverifiable".into();
        r.reasons.push(format!("signed, but the payload does not follow schema v1: {e}"));
        return r;
    }
    r.status = "valid".into();
    r.issued_by_this_install = is_local(&fp);
    if let Some(until) = &r.valid_until {
        r.expired = iso_key(now_iso) > iso_key(until);
        if r.expired {
            r.reasons.push("validity period has ended (EXPIRED)".into());
        }
    }
    r
}

// ------------------------------------------------------------------ extract

fn validate_read_path(path: &str) -> Result<(PathBuf, String), CertError> {
    if path.is_empty() || path.len() > 4096 || path.contains('\0') {
        return Err(CertError::BadPath("empty, too long or NUL"));
    }
    let p = PathBuf::from(path);
    if !p.is_absolute() {
        return Err(CertError::BadPath("path must be absolute"));
    }
    if p.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(CertError::BadPath("path traversal is not allowed"));
    }
    let ext = p.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).unwrap_or_default();
    if !["json", "html", "htm", "pdf"].contains(&ext.as_str()) {
        return Err(CertError::BadPath("choose a .deckchek-cert.json, .html or .pdf file"));
    }
    let real = fs::canonicalize(&p).map_err(|_| CertError::BadPath("file not found"))?;
    if !fs::metadata(&real).map(|m| m.is_file()).unwrap_or(false) {
        return Err(CertError::BadPath("not a file"));
    }
    Ok((real, ext))
}

fn read_capped(path: &Path, cap: u64) -> Result<String, CertError> {
    let len = fs::metadata(path)?.len();
    if len > cap {
        return Err(CertError::TooLarge); // rejected before reading
    }
    let mut buf = Vec::with_capacity(len as usize);
    fs::File::open(path)?.take(cap + 1).read_to_end(&mut buf)?;
    if buf.len() as u64 > cap {
        return Err(CertError::TooLarge); // grew while reading
    }
    String::from_utf8(buf).map_err(|_| CertError::NotUtf8)
}

/// The embedded certificate JSON of a DeckChek HTML certificate.
pub fn json_from_html(html: &str) -> Result<String, CertError> {
    let start = html.find(HTML_MARKER).ok_or(CertError::NoCertificateData)? + HTML_MARKER.len();
    let len = html[start..].find("</script>").ok_or(CertError::NoCertificateData)?;
    let json = html[start..start + len].trim();
    if json.len() as u64 > MAX_JSON_BYTES {
        return Err(CertError::TooLarge);
    }
    Ok(json.to_string())
}

/// A recognizable v1 envelope, not a valid signature or a semantically valid signed payload.
/// Keep modified values available to `verify_text` instead of treating extraction as verification.
fn validate_extract_envelope(root: &Value) -> Result<(), CertError> {
    let shape = (|| -> Result<(), String> {
        let file = obj(root, "certificate")?;
        exact_keys(file, "certificate", &["format", "version", "payload"], &["integrity"])?;
        one_of(file, "format", "certificate", &[FORMAT])?;
        int(file, "version", "certificate", VERSION, VERSION)?;
        let payload = &file["payload"];
        check_payload_bounds(payload)?;
        let p = obj(payload, "payload")?;
        obj(&p["unit"], "payload.unit")?;
        obj(&p["plan"], "payload.plan")?;
        array(p, "results", "payload", MAX_RESULTS)?;
        array(p, "measurements", "payload", MAX_MEASUREMENTS)?;
        // Unsigned drafts and stripped signatures have meaningful verification diagnostics.
        if let Some(integrity) = file.get("integrity") {
            let i = obj(integrity, "integrity")?;
            exact_keys(i, "integrity", &["alg", "hashAlg", "contentHash", "publicKey", "fingerprint"], &["signature"])?;
            for key in ["alg", "hashAlg", "contentHash", "publicKey", "fingerprint"] {
                text(i, key, "integrity", 0, MAX_TEXT)?;
            }
            if i.contains_key("signature") {
                text(i, "signature", "integrity", 0, MAX_TEXT)?;
            }
        }
        Ok(())
    })();
    // Schema helpers can name unknown fields; extraction errors must not echo unrelated file data.
    shape.map_err(|_| CertError::Schema("expected a DeckChek certificate v1 envelope".into()))
}

/// FS-20 `certificate_extract_json`: shape-checked certificate JSON without rewriting its contents.
/// This content check does not establish path authorization or cryptographic validity.
pub fn extract_json(path: &str) -> Result<String, CertError> {
    let (real, ext) = validate_read_path(path)?;
    let json = match ext.as_str() {
        "pdf" => Err(CertError::PdfNoAttachment),
        "json" => read_capped(&real, MAX_JSON_BYTES),
        _ => json_from_html(&read_capped(&real, MAX_HTML_BYTES)?),
    }?;
    validate_extract_envelope(&parse_strict(&json)?)?;
    Ok(json)
}

// ------------------------------------------------------------------ store / list

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StoreInput {
    pub asset_id: String,
    pub profile_id: String,
    /// The signed certificate file (JSON text) exactly as exported.
    pub file_json: String,
    pub pdf_path: Option<String>,
    pub json_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateSummary {
    pub id: String,
    pub asset_id: String,
    pub profile_id: String,
    pub signing_key_id: String,
    pub serial_number: String,
    pub tester_name: String,
    pub verdict: String,
    pub content_hash: String,
    pub issued_at: String,
    pub valid_until: String,
    pub pdf_path: Option<String>,
    pub json_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateRecord {
    #[serde(flatten)]
    pub summary: CertificateSummary,
    /// Canonical JSON of the whole signed file (payload + integrity); `certificate.payload_json`.
    pub file_json: String,
}

fn check_id(s: &str, what: &'static str) -> Result<(), CertError> {
    if s.is_empty() || s.len() > 128 || s.chars().any(|c| c.is_control()) {
        return Err(CertError::Schema(format!("{what} must be 1–128 printable characters")));
    }
    Ok(())
}

fn check_saved_path(p: &Option<String>) -> Result<Option<String>, CertError> {
    match p {
        None => Ok(None),
        Some(s) if s.len() <= 4096 && !s.contains('\0') && Path::new(s).is_absolute() => Ok(Some(s.clone())),
        Some(_) => Err(CertError::BadPath("saved file paths must be absolute")),
    }
}

/// Stores a signed certificate made by this install. Columns come from the verified payload.
pub fn store(conn: &Connection, input: &StoreInput) -> Result<CertificateSummary, CertError> {
    check_id(&input.asset_id, "assetId")?;
    check_id(&input.profile_id, "profileId")?;
    let (pdf_path, json_path) = (check_saved_path(&input.pdf_path)?, check_saved_path(&input.json_path)?);
    let now = crate::db::now_iso(conn).map_err(CertError::Db)?;
    let rep = verify_text(&input.file_json, &now, |fp| signing::is_local_key(conn, fp));
    if rep.status != "valid" {
        return Err(CertError::NotVerified(rep.reasons.join("; ")));
    }
    if !rep.issued_by_this_install {
        return Err(CertError::NotVerified("it was signed by another install".into()));
    }
    let file = parse_strict(&input.file_json)?;
    let payload = &file["payload"];
    if payload["plan"]["profileId"].as_str() != Some(input.profile_id.as_str()) {
        return Err(CertError::Schema("profileId does not match the certificate plan".into()));
    }
    let canonical = canonical_json(&file).map_err(|e| CertError::NotCanonical(e.to_string()))?;
    let id = crate::db::new_id();
    let s = CertificateSummary {
        id: id.clone(),
        asset_id: input.asset_id.clone(),
        profile_id: input.profile_id.clone(),
        signing_key_id: rep.fingerprint.clone().unwrap_or_default(),
        serial_number: payload["unit"]["serial"].as_str().unwrap_or_default().to_string(),
        tester_name: payload["tester"].as_str().unwrap_or_default().to_string(),
        verdict: payload["verdict"].as_str().unwrap_or_default().to_string(),
        content_hash: rep.content_hash.clone().unwrap_or_default(),
        issued_at: payload["issuedAt"].as_str().unwrap_or_default().to_string(),
        valid_until: payload["validUntil"].as_str().unwrap_or_default().to_string(),
        pdf_path,
        json_path,
    };
    conn.execute(
        "INSERT INTO certificate (id, asset_id, profile_id, signing_key_id, serial_number, tester_name, verdict, content_hash, issued_at, valid_until, pdf_path, json_path, payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        params![s.id, s.asset_id, s.profile_id, s.signing_key_id, s.serial_number, s.tester_name, s.verdict, s.content_hash, s.issued_at, s.valid_until, s.pdf_path, s.json_path, canonical],
    )
    .map_err(|e| match e {
        rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation => CertError::Db("unknown asset or device profile".into()),
        e => db_err(e),
    })?;
    Ok(s)
}

const SUMMARY_COLS: &str = "id, asset_id, profile_id, signing_key_id, serial_number, tester_name, verdict, content_hash, issued_at, valid_until, pdf_path, json_path";

fn summary_row(r: &rusqlite::Row) -> rusqlite::Result<CertificateSummary> {
    Ok(CertificateSummary {
        id: r.get(0)?,
        asset_id: r.get(1)?,
        profile_id: r.get(2)?,
        signing_key_id: r.get(3)?,
        serial_number: r.get(4)?,
        tester_name: r.get(5)?,
        verdict: r.get(6)?,
        content_hash: r.get(7)?,
        issued_at: r.get(8)?,
        valid_until: r.get(9)?,
        pdf_path: r.get(10)?,
        json_path: r.get(11)?,
    })
}

/// Newest first, at most 500; all assets when `asset_id` is None.
pub fn list(conn: &Connection, asset_id: Option<&str>) -> Result<Vec<CertificateSummary>, CertError> {
    if let Some(a) = asset_id {
        check_id(a, "assetId")?;
    }
    let sql = format!("SELECT {SUMMARY_COLS} FROM certificate WHERE (?1 IS NULL OR asset_id = ?1) ORDER BY issued_at DESC, rowid DESC LIMIT 500");
    let mut st = conn.prepare(&sql).map_err(db_err)?;
    let rows = st.query_map([asset_id], summary_row).map_err(db_err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
}

pub fn get(conn: &Connection, id: &str) -> Result<Option<CertificateRecord>, CertError> {
    check_id(id, "id")?;
    conn.query_row(&format!("SELECT {SUMMARY_COLS}, payload_json FROM certificate WHERE id = ?1"), [id], |r| {
        Ok(CertificateRecord { summary: summary_row(r)?, file_json: r.get(12)? })
    })
    .optional()
    .map_err(db_err)
}

// ------------------------------------------------------------------ commands

fn open(app: &tauri::AppHandle) -> Result<crate::db::DbConn, CertError> {
    crate::db::open_database(&crate::db::database_path(app).map_err(CertError::Db)?).map_err(CertError::Db)
}

/// Cap on the IPC payload argument before it is re-serialised (photos included).
const MAX_SIGN_ARG_BYTES: usize = MAX_PAYLOAD_BYTES + 1024 * 1024;

// Every command below runs off the main (UI) thread (FS-20 review, AUD-03): Tauri 2 runs a
// non-async command on the main thread, so a large or hostile file froze the window. DB work goes
// through `db::off_main`; CPU or file work that needs no DB runs on the blocking pool directly so
// it never holds the DB lane.

fn background_err(e: impl std::fmt::Display) -> CertError {
    CertError::Io(format!("background task failed: {e}"))
}

#[tauri::command]
pub async fn certificate_sign(app: tauri::AppHandle, payload: Value) -> Result<SignResult, CertError> {
    crate::db::off_main(move || {
        // serde_json already bounded recursion; re-check size and depth like untrusted file input.
        let text = serde_json::to_string(&payload).map_err(|e| CertError::Json(e.to_string()))?;
        if text.len() > MAX_SIGN_ARG_BYTES {
            return Err(CertError::TooLarge);
        }
        check_depth(&text)?;
        let conn = open(&app)?;
        let dir = signing::key_dir(&app).map_err(|_| CertError::Io("app data folder unavailable".into()))?;
        sign_payload(&conn, &dir, &payload)
    })
    .await
    .map_err(background_err)?
}

#[tauri::command]
pub async fn certificate_verify(app: tauri::AppHandle, json: String) -> VerifyReport {
    // `verify_text` asks `is_local` only once the signature has verified, so answering true here
    // just marks "ask the database"; the real lookup follows with the verified fingerprint.
    let checked = tauri::async_runtime::spawn_blocking(move || {
        let now = Connection::open_in_memory().ok().and_then(|c| crate::db::now_iso(&c).ok()).unwrap_or_default();
        verify_text(&json, &now, |_| true)
    })
    .await;
    let mut rep = match checked {
        Ok(rep) => rep,
        Err(e) => return report("unverifiable", vec![format!("could not check the file ({e})")]),
    };
    if rep.issued_by_this_install {
        let fp = rep.fingerprint.clone().unwrap_or_default();
        rep.issued_by_this_install = crate::db::off_main(move || open(&app).is_ok_and(|c| signing::is_local_key(&c, &fp))).await.unwrap_or(false);
    }
    rep
}

#[tauri::command]
pub async fn certificate_extract_json(path: String) -> Result<String, CertError> {
    tauri::async_runtime::spawn_blocking(move || extract_json(&path)).await.map_err(background_err)?
}

#[tauri::command]
pub async fn certificate_store(app: tauri::AppHandle, record: StoreInput) -> Result<CertificateSummary, CertError> {
    if record.file_json.len() as u64 > MAX_JSON_BYTES {
        return Err(CertError::TooLarge);
    }
    crate::db::off_main(move || store(&*open(&app)?, &record)).await.map_err(background_err)?
}

#[tauri::command]
pub async fn certificate_list(app: tauri::AppHandle, asset_id: Option<String>) -> Result<Vec<CertificateSummary>, CertError> {
    crate::db::off_main(move || list(&*open(&app)?, asset_id.as_deref())).await.map_err(background_err)?
}

#[tauri::command]
pub async fn certificate_get(app: tauri::AppHandle, id: String) -> Result<Option<CertificateRecord>, CertError> {
    crate::db::off_main(move || get(&*open(&app)?, &id)).await.map_err(background_err)?
}

#[cfg(test)]
#[path = "certificate_tests.rs"]
mod tests;
