//! Canonical JSON and SHA-256 helpers (FS-00 §4.12, rules §6.1).
//!
//! Byte-identical with `app/canonical-json.js`; both consume
//! `tests/fixtures/canonical-vectors.json`. Rules: object keys sorted by UTF-16 code units,
//! arrays in order, strings escaped per RFC 8785 (only `"`, `\` and control characters),
//! numbers ONLY safe integers (|n| <= 2^53-1), no whitespace, nesting depth <= 64.
//! A Rust `String` can never hold a lone surrogate; text that carries one (`"\ud800"`) fails
//! at JSON parse time, which callers treat as a rejection as well.

use std::fmt;

use serde_json::Value;
use sha2::{Digest, Sha256};

/// Same cap as `MAX_DEPTH` in `app/canonical-json.js` (outermost value is depth 0).
pub const MAX_DEPTH: usize = 64;
const MAX_SAFE: i64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanonicalError {
    pub message: String,
    pub path: String,
}

impl fmt::Display for CanonicalError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} at {}", self.message, self.path)
    }
}

impl std::error::Error for CanonicalError {}

fn err<T>(message: impl Into<String>, path: &str) -> Result<T, CanonicalError> {
    Err(CanonicalError { message: message.into(), path: path.to_string() })
}

/// The canonical text of an `f64` that must be a safe integer (`-0` -> `0`).
pub fn canonical_f64(n: f64) -> Result<String, CanonicalError> {
    number_text_f64(n, "$")
}

fn number_text_f64(n: f64, path: &str) -> Result<String, CanonicalError> {
    if !n.is_finite() {
        return err(format!("{n} is not allowed"), path);
    }
    if n.fract() != 0.0 {
        return err(format!("non-integer number {n} (emit measured values as decimal strings)"), path);
    }
    if n.abs() > MAX_SAFE as f64 {
        return err(format!("integer {n} outside the safe range"), path);
    }
    Ok((n as i64).to_string())
}

fn number_text(n: &serde_json::Number, path: &str) -> Result<String, CanonicalError> {
    if let Some(i) = n.as_i64() {
        return if i.abs() <= MAX_SAFE { Ok(i.to_string()) } else { err(format!("integer {i} outside the safe range"), path) };
    }
    if let Some(u) = n.as_u64() {
        return err(format!("integer {u} outside the safe range"), path);
    }
    match n.as_f64() {
        Some(f) => number_text_f64(f, path),
        None => err("unrepresentable number", path),
    }
}

fn write_string(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn write_value(out: &mut String, v: &Value, path: &str, depth: usize) -> Result<(), CanonicalError> {
    if depth > MAX_DEPTH {
        return err(format!("nesting deeper than {MAX_DEPTH}"), path);
    }
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&number_text(n, path)?),
        Value::String(s) => write_string(out, s),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_value(out, item, &format!("{path}[{i}]"), depth + 1)?;
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut entries: Vec<(&String, &Value)> = map.iter().collect();
            // UTF-16 code unit order, as JavaScript's default sort
            entries.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
            out.push('{');
            for (i, (k, val)) in entries.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_string(out, k);
                out.push(':');
                write_value(out, val, &format!("{path}.{k}"), depth + 1)?;
            }
            out.push('}');
        }
    }
    Ok(())
}

/// Canonical JSON text of `value`, or the first rule it breaks.
pub fn canonical_json(value: &Value) -> Result<String, CanonicalError> {
    let mut out = String::new();
    write_value(&mut out, value, "$", 0)?;
    Ok(out)
}

/// Lowercase hex SHA-256 of `bytes`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

/// SHA-256 (hex) of the canonical UTF-8 bytes of `value`.
pub fn canonical_sha256(value: &Value) -> Result<String, CanonicalError> {
    Ok(sha256_hex(canonical_json(value)?.as_bytes()))
}

/// True when `text` parses as JSON and is already byte-for-byte its own canonical form.
pub fn is_canonical(text: &str) -> bool {
    serde_json::from_str::<Value>(text).ok().and_then(|v| canonical_json(&v).ok()).is_some_and(|c| c == text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn vectors() -> Value {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/canonical-vectors.json");
        serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
    }

    fn list<'a>(v: &'a Value, key: &str) -> &'a Vec<Value> {
        v[key].as_array().unwrap_or_else(|| panic!("{key} missing"))
    }

    #[test]
    fn shared_vectors_match_javascript_byte_for_byte() {
        let v = vectors();
        assert_eq!(v["maxDepth"].as_u64().unwrap() as usize, MAX_DEPTH);
        let items = list(&v, "vectors");
        assert!(items.len() >= 25);
        for item in items {
            let name = item["name"].as_str().unwrap();
            let input: Value = serde_json::from_str(item["inputJson"].as_str().unwrap()).unwrap_or_else(|e| panic!("{name}: {e}"));
            let out = canonical_json(&input).unwrap_or_else(|e| panic!("{name}: {e}"));
            assert_eq!(out, item["canonical"].as_str().unwrap(), "{name}");
            assert_eq!(sha256_hex(out.as_bytes()), item["sha256"].as_str().unwrap(), "{name} sha256");
            assert_eq!(canonical_sha256(&input).unwrap(), item["sha256"].as_str().unwrap(), "{name} canonical_sha256");
            assert!(is_canonical(&out), "{name} is its own canonical form");
        }
    }

    #[test]
    fn rejection_vectors_fail_at_parse_or_canonicalisation() {
        let v = vectors();
        for item in list(&v, "rejectJson") {
            let name = item["name"].as_str().unwrap();
            let rejected = match serde_json::from_str::<Value>(item["json"].as_str().unwrap()) {
                Err(_) => true, // lone surrogates, overflowing exponents: refused by the parser
                Ok(value) => canonical_json(&value).is_err(),
            };
            assert!(rejected, "{name} must be rejected");
        }
    }

    #[test]
    fn nan_and_infinities_are_rejected() {
        let v = vectors();
        for name in list(&v, "rejectNumbers") {
            let n: f64 = match name.as_str().unwrap() {
                "NaN" => f64::NAN,
                "Infinity" => f64::INFINITY,
                "-Infinity" => f64::NEG_INFINITY,
                other => panic!("unknown special number {other}"),
            };
            assert!(canonical_f64(n).is_err(), "{n}");
        }
        assert_eq!(canonical_f64(-0.0).unwrap(), "0");
        assert_eq!(canonical_f64(9_007_199_254_740_991.0).unwrap(), "9007199254740991");
        assert!(canonical_f64(9_007_199_254_740_992.0).is_err());
        assert!(canonical_f64(0.5).is_err());
    }

    #[test]
    fn non_canonical_texts_are_detected() {
        let v = vectors();
        for item in list(&v, "nonCanonical") {
            let name = item["name"].as_str().unwrap();
            let text = item["text"].as_str().unwrap();
            assert!(!is_canonical(text), "{name}");
            let parsed: Value = serde_json::from_str(text).unwrap();
            assert!(is_canonical(&canonical_json(&parsed).unwrap()), "{name} re-canonicalised");
        }
        assert!(!is_canonical("not json"));
    }

    #[test]
    fn error_path_points_at_the_offending_value() {
        let e = canonical_json(&serde_json::json!({"a": [1, {"b": 1.5}]})).unwrap_err();
        assert_eq!(e.path, "$.a[1].b");
        assert!(e.to_string().contains("decimal strings"));
    }

    #[test]
    fn large_unsigned_and_negative_integers() {
        let big: Value = serde_json::from_str("9007199254740993").unwrap();
        assert!(canonical_json(&big).is_err());
        let ok: Value = serde_json::from_str("-9007199254740991").unwrap();
        assert_eq!(canonical_json(&ok).unwrap(), "-9007199254740991");
    }

    #[test]
    fn sha256_known_answers() {
        assert_eq!(sha256_hex(b""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(sha256_hex(&vec![b'a'; 1_000_000]), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
    }
}
