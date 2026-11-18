//! SPEC-05 section 16: append-only digital LF evidence and derived comparisons.
//! No PCM is analyzed or reconstructed by this API. Catalog changes are recorded
//! as context issues; original snapshots and numerical evidence remain intact.
//! Validation mirrors app/support-isolation.js, independently of its FFT.

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde_json::{json, Map, Value};
use tauri::AppHandle;

use crate::db::{database_path, now_iso, open_database};

const METHOD: &str = "support-lf-welch-ms-v1";
const EVIDENCE_BYTES: usize = 64 * 1024;
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;
const OBS_KEYS: &[&str] = &[
    "schemaVersion",
    "id",
    "pairId",
    "stage",
    "venueId",
    "setupId",
    "capturedAt",
    "finishedAt",
    "context",
    "capture",
    "calibration",
    "analysis",
    "analysisError",
    "rawAudioRetained",
];
const CMP_KEYS: &[&str] = &[
    "schemaVersion",
    "id",
    "observationAId",
    "observationBId",
    "createdAt",
    "sameConditions",
];
const CONDITIONS: &[&str] = &[
    "route",
    "gainSettings",
    "procedure",
    "source",
    "placement",
    "paState",
    "paLevel",
    "stationaryConfirmed",
];
const ANALYSIS_KEYS: &[&str] = &[
    "method",
    "bandHz",
    "window",
    "detrend",
    "statistic",
    "sampleRate",
    "fftSize",
    "hop",
    "segments",
    "capturedFrames",
    "candidateFrames",
    "analyzedFrames",
    "omittedFrames",
    "binHz",
    "windowSumSquares",
    "coherentGain",
    "binIndices",
    "overlapHz",
    "psdL",
    "psdR",
    "segmentPowersL",
    "segmentPowersR",
    "powerL",
    "powerR",
    "pairPower",
    "levelDbfsL",
    "levelDbfsR",
    "levelDbfsPair",
    "uncertainty",
];

fn invalid(message: impl std::fmt::Display) -> String {
    format!("SUPPORT_INVALID: {message}")
}

fn storage(message: impl std::fmt::Display) -> String {
    format!("SUPPORT_STORAGE: {message}")
}

fn conflict() -> String {
    "SUPPORT_CONFLICT: Conflicting submission for an existing immutable ID".into()
}

fn uncertainty() -> Value {
    json!({"status":"unknown", "standard":null, "expanded":null,
        "coverageFactor":null,
        "reason":"No validated uncertainty model for this digital LF observation."})
}

fn object<'a>(
    value: &'a Value,
    keys: Option<&[&str]>,
    name: &str,
) -> Result<&'a Map<String, Value>, String> {
    let object = value
        .as_object()
        .ok_or_else(|| invalid(format!("{name} must be an object")))?;
    if keys.is_some_and(|keys| object.keys().any(|key| !keys.contains(&key.as_str()))) {
        return Err(invalid(format!("{name} has unsupported fields")));
    }
    Ok(object)
}

// ECMAScript trim, including BOM and excluding the C1 NEXT LINE character.
fn js_whitespace(c: char) -> bool {
    matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}'
        | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}'
        | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn js_trim(value: &str) -> &str {
    value.trim_matches(js_whitespace)
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value == js_trim(value)
        && value.chars().count() <= 128
        && !value.chars().any(|c| c.is_ascii_control())
}

fn identifier<'a>(value: &'a Value, name: &str) -> Result<&'a str, String> {
    value
        .as_str()
        .filter(|text| valid_identifier(text))
        .ok_or_else(|| invalid(format!("{name} must be a valid identifier")))
}

fn valid_time(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 24 {
        return false;
    }
    for (index, expected) in [
        (4, b'-'),
        (7, b'-'),
        (10, b'T'),
        (13, b':'),
        (16, b':'),
        (19, b'.'),
        (23, b'Z'),
    ] {
        if bytes[index] != expected {
            return false;
        }
    }
    if !(0..24)
        .all(|index| [4, 7, 10, 13, 16, 19, 23].contains(&index) || bytes[index].is_ascii_digit())
    {
        return false;
    }
    let number = |start, end| value[start..end].parse::<u32>().unwrap_or(u32::MAX);
    let year = number(0, 4);
    let days = match number(5, 7) {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        _ => 0,
    };
    number(8, 10) >= 1
        && number(8, 10) <= days
        && number(11, 13) < 24
        && number(14, 16) < 60
        && number(17, 19) < 60
}

fn timestamp<'a>(value: &'a Value, name: &str) -> Result<&'a str, String> {
    value
        .as_str()
        .filter(|value| valid_time(value))
        .ok_or_else(|| invalid(format!("{name} must be a UTC timestamp with milliseconds")))
}

fn number(value: &Value) -> Option<f64> {
    value.as_f64().filter(|value| value.is_finite())
}

fn integer(value: &Value) -> bool {
    number(value)
        .is_some_and(|value| (0.0..=MAX_SAFE_INTEGER).contains(&value) && value.fract() == 0.0)
}

fn numeric_equal(value: &Value, expected: f64) -> bool {
    number(value) == Some(expected)
}

fn close(a: f64, b: f64) -> bool {
    a.is_finite() && b.is_finite() && (a - b).abs() <= 1e-14 + 1e-9 * b.abs()
}

fn close_value(value: &Value, expected: f64) -> bool {
    number(value).is_some_and(|value| close(value, expected))
}

// Evidence algebra has no absolute floor: zero densities cannot acquire a
// small invented positive power through the logarithm/window tolerance.
fn close_power(a: f64, b: f64) -> bool {
    a.is_finite()
        && b.is_finite()
        && a >= 0.0
        && b >= 0.0
        && if a == 0.0 || b == 0.0 {
            a == b
        } else {
            (a - b).abs() <= (4.0 * f64::from_bits(1)).max(1e-9 * a.max(b))
        }
}

fn close_power_value(value: &Value, expected: f64) -> bool {
    number(value).is_some_and(|value| close_power(value, expected))
}

// JSON object order is immaterial; JSON's single Number type treats 1 and 1.0
// equally. Preserve the original Value rather than normalizing its snapshots.
fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(_), Value::Number(_)) => number(a) == number(b),
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| same(a, b))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter()
                    .all(|(key, a)| b.get(key).is_some_and(|b| same(a, b)))
        }
        _ => a == b,
    }
}

fn same_optional(a: Option<&Value>, b: Option<&Value>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => same(a, b),
        (None, None) => true,
        _ => false,
    }
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(_) => number(value).is_some_and(|value| value != 0.0),
        Value::String(value) => !value.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

// Only the capture-duration comparisons in the JS qualifier coerce scalars.
// The independent integer/route checks still reject them as qualified evidence.
fn js_number(value: Option<&Value>) -> f64 {
    match value {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(value)) => {
            if *value {
                1.0
            } else {
                0.0
            }
        }
        Some(Value::Number(value)) => value.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(value)) => {
            let value = js_trim(value);
            if value.is_empty() {
                return 0.0;
            }
            for (prefix, radix) in [
                ("0x", 16),
                ("0X", 16),
                ("0b", 2),
                ("0B", 2),
                ("0o", 8),
                ("0O", 8),
            ] {
                if let Some(digits) = value.strip_prefix(prefix) {
                    return u64::from_str_radix(digits, radix)
                        .map(|n| n as f64)
                        .unwrap_or(f64::NAN);
                }
            }
            let parsed = value.parse::<f64>().unwrap_or(f64::NAN);
            if parsed.is_infinite() && !matches!(value, "Infinity" | "+Infinity" | "-Infinity") {
                f64::NAN
            } else {
                parsed
            }
        }
        Some(Value::Array(values)) if values.is_empty() => 0.0,
        Some(Value::Array(values)) if values.len() == 1 => {
            if values[0].is_boolean() {
                f64::NAN
            } else {
                js_number(values.first())
            }
        }
        _ => f64::NAN,
    }
}

fn json_evidence(value: &Value) -> Result<(), String> {
    fn visit(value: &Value, depth: usize) -> Result<(), String> {
        if depth > 20 {
            return Err(invalid("Evidence is too deeply nested"));
        }
        match value {
            Value::Number(_) if number(value).is_none() => {
                return Err(invalid("Evidence contains a non-finite number"))
            }
            Value::Array(values) => {
                for value in values {
                    visit(value, depth + 1)?;
                }
            }
            Value::Object(values) => {
                for value in values.values() {
                    visit(value, depth + 1)?;
                }
            }
            _ => {}
        }
        Ok(())
    }
    visit(value, 0)?;
    if serde_json::to_vec(value).map_err(invalid)?.len() > EVIDENCE_BYTES {
        return Err(invalid(format!(
            "Complete evidence exceeds {EVIDENCE_BYTES} bytes; nothing was trimmed"
        )));
    }
    Ok(())
}

struct Geometry {
    sample_rate: u64,
    fft_size: u64,
    hop: u64,
    segments: u64,
    captured_frames: u64,
    candidate_frames: u64,
    analyzed_frames: u64,
    omitted_frames: u64,
    bin_hz: f64,
}

fn geometry(sample_rate: &Value, captured_frames: &Value) -> Result<Geometry, String> {
    if !integer(sample_rate) || number(sample_rate).unwrap_or(0.0) <= 400.0 {
        return Err(invalid("Unsupported sample rate for the 20–200 Hz method"));
    }
    let sample_rate = number(sample_rate).unwrap_or(0.0) as u64;
    if sample_rate > 1 << 18 {
        return Err(invalid("Unsupported FFT size for this bounded method"));
    }
    let fft_size = sample_rate.next_power_of_two();
    let candidate_frames = 30 * sample_rate;
    if !integer(captured_frames) || number(captured_frames).unwrap_or(0.0) < candidate_frames as f64
    {
        return Err(invalid(
            "Incomplete capture: at least 30 seconds of samples are required",
        ));
    }
    let captured_frames = number(captured_frames).unwrap_or(0.0) as u64;
    if captured_frames > 35 * sample_rate {
        return Err(invalid(
            "Capture exceeds the bounded 35 second recording window",
        ));
    }
    let hop = fft_size / 2;
    let segments = 1 + (candidate_frames - fft_size) / hop;
    let analyzed_frames = fft_size + (segments - 1) * hop;
    Ok(Geometry {
        sample_rate,
        fft_size,
        hop,
        segments,
        captured_frames,
        candidate_frames,
        analyzed_frames,
        omitted_frames: captured_frames - analyzed_frames,
        bin_hz: sample_rate as f64 / fft_size as f64,
    })
}

fn band_bins(g: &Geometry) -> (Vec<u64>, Vec<f64>) {
    let mut indices = Vec::new();
    let mut overlaps = Vec::new();
    for k in 0..=g.fft_size / 2 {
        let frequency = k as f64 * g.bin_hz;
        let overlap = ((frequency + g.bin_hz / 2.0).min(200.0)
            - (frequency - g.bin_hz / 2.0).max(20.0))
        .max(0.0);
        if overlap > 0.0 {
            indices.push(k);
            overlaps.push(overlap);
        }
    }
    (indices, overlaps)
}

fn validate_analysis(a: &Value) -> Result<(), String> {
    object(a, Some(ANALYSIS_KEYS), "Analysis")?;
    if a["method"] != METHOD
        || !same(&a["bandHz"], &json!([20, 200]))
        || a["window"] != "hann-periodic"
        || a["detrend"] != "segment-mean"
        || a["statistic"] != "mean-channel-power"
        || !same(&a["uncertainty"], &uncertainty())
    {
        return Err(invalid(
            "Unsupported analysis method, statistic or uncertainty",
        ));
    }
    let g = geometry(&a["sampleRate"], &a["capturedFrames"])?;
    for (key, expected) in [
        ("sampleRate", g.sample_rate as f64),
        ("fftSize", g.fft_size as f64),
        ("hop", g.hop as f64),
        ("segments", g.segments as f64),
        ("capturedFrames", g.captured_frames as f64),
        ("candidateFrames", g.candidate_frames as f64),
        ("analyzedFrames", g.analyzed_frames as f64),
        ("omittedFrames", g.omitted_frames as f64),
        ("binHz", g.bin_hz),
    ] {
        if !numeric_equal(&a[key], expected) {
            return Err(invalid(format!("Analysis {key} is inconsistent")));
        }
    }
    let (indices, overlaps) = band_bins(&g);
    if !close_value(&a["windowSumSquares"], 3.0 * g.fft_size as f64 / 8.0)
        || !close_value(&a["coherentGain"], 0.5)
        || !same(&a["binIndices"], &json!(indices))
        || !same(&a["overlapHz"], &json!(overlaps))
    {
        return Err(invalid(
            "Analysis window or frequency geometry is inconsistent",
        ));
    }
    for channel in ["L", "R"] {
        let psd = a[format!("psd{channel}")].as_array();
        let powers = a[format!("segmentPowers{channel}")].as_array();
        let (Some(psd), Some(powers)) = (psd, powers) else {
            return Err(invalid("Analysis density or segment powers are invalid"));
        };
        if psd.len() != indices.len()
            || powers.len() != g.segments as usize
            || psd
                .iter()
                .chain(powers)
                .any(|value| !number(value).is_some_and(|value| value >= 0.0))
        {
            return Err(invalid("Analysis density or segment powers are invalid"));
        }
        let integrated = psd
            .iter()
            .zip(&overlaps)
            .fold(0.0, |sum, (value, overlap)| {
                sum + number(value).unwrap_or(0.0) * overlap
            });
        let averaged = powers
            .iter()
            .fold(0.0, |sum, value| sum + number(value).unwrap_or(0.0))
            / powers.len() as f64;
        if !close_power_value(&a[format!("power{channel}")], integrated)
            || !close_power(integrated, averaged)
        {
            return Err(invalid(
                "Analysis power disagrees with original density or segment powers",
            ));
        }
    }
    let left = number(&a["powerL"]).ok_or_else(|| invalid("Invalid left power"))?;
    let right = number(&a["powerR"]).ok_or_else(|| invalid("Invalid right power"))?;
    if !close_power_value(&a["pairPower"], (left + right) / 2.0) {
        return Err(invalid("Analysis mean channel power is inconsistent"));
    }
    let pair = number(&a["pairPower"]).ok_or_else(|| invalid("Invalid pair power"))?;
    for (suffix, power) in [("L", left), ("R", right), ("Pair", pair)] {
        let observed = a.get(format!("levelDbfs{suffix}"));
        let valid = if power > 0.0 {
            observed.is_some_and(|value| close_value(value, 10.0 * power.log10()))
        } else {
            observed == Some(&Value::Null)
        };
        if !valid {
            return Err(invalid("Analysis logarithmic level is inconsistent"));
        }
    }
    Ok(())
}

pub fn normalize_observation(input: &Value) -> Result<Value, String> {
    let fields = object(input, Some(OBS_KEYS), "Observation")?;
    json_evidence(input)?;
    if OBS_KEYS.iter().any(|key| !fields.contains_key(*key)) {
        return Err(invalid("Observation is missing required fields"));
    }
    if !numeric_equal(&input["schemaVersion"], 1.0)
        || input["rawAudioRetained"] != false
        || !matches!(input["stage"].as_str(), Some("A" | "B"))
    {
        return Err(invalid(
            "Unsupported observation version, stage or audio retention",
        ));
    }
    for key in ["id", "pairId", "venueId", "setupId"] {
        identifier(&input[key], key)?;
    }
    let start = timestamp(&input["capturedAt"], "Capture start")?;
    let end = timestamp(&input["finishedAt"], "Capture end")?;
    if end < start {
        return Err(invalid("Capture timestamps are reversed"));
    }
    let context = &input["context"];
    object(
        context,
        Some(&["venue", "setup", "support", "conditions"]),
        "Context",
    )?;
    for key in ["venue", "setup", "support"] {
        object(&context[key], None, key)?;
        identifier(&context[key]["id"], &format!("{key} ID"))?;
        if !context[key]["name"]
            .as_str()
            .is_some_and(|name| !js_trim(name).is_empty())
        {
            return Err(invalid(format!("{key} name is required")));
        }
    }
    if !same(&context["venue"]["id"], &input["venueId"])
        || !same(&context["setup"]["id"], &input["setupId"])
        || !same(&context["setup"]["venueId"], &input["venueId"])
    {
        return Err(invalid("Selected context does not match venue/setup"));
    }
    let conditions = &context["conditions"];
    object(conditions, Some(CONDITIONS), "Conditions")?;
    for key in CONDITIONS
        .iter()
        .filter(|key| **key != "stationaryConfirmed")
    {
        if !conditions[*key]
            .as_str()
            .is_some_and(|value| !js_trim(value).is_empty() && value.encode_utf16().count() <= 2000)
        {
            return Err(invalid(format!("Record {key} within 2000 characters")));
        }
    }
    if !matches!(conditions["paState"].as_str(), Some("off" | "fixed"))
        || !conditions["stationaryConfirmed"].is_boolean()
    {
        return Err(invalid(
            "Record the stationary procedure and fixed/off PA state",
        ));
    }
    object(&input["capture"], None, "Capture")?;
    let calibration = &input["calibration"];
    object(
        calibration,
        Some(&["state", "sourceKey", "profile", "reasons", "applied"]),
        "Calibration",
    )?;
    if !matches!(
        calibration["state"].as_str(),
        Some("none" | "available" | "unavailable" | "rejected")
    ) || calibration["applied"] != false
        || !calibration["reasons"]
            .as_array()
            .is_some_and(|reasons| reasons.iter().all(Value::is_string))
    {
        return Err(invalid("Invalid calibration observation"));
    }
    if input["analysis"].is_null() {
        if !input["analysisError"]
            .as_str()
            .is_some_and(|reason| !reason.is_empty())
        {
            return Err(invalid("Unavailable analysis requires a reason"));
        }
    } else {
        validate_analysis(&input["analysis"])?;
        if !input["analysisError"].is_null() {
            return Err(invalid(
                "A completed analysis cannot contain an analysis error",
            ));
        }
    }
    Ok(input.clone())
}

fn stereo_pair(pair: &Value) -> bool {
    pair["mono"] == false
        && number(&pair["first"]).is_some_and(|first| {
            first > 0.0
                && first.fract() == 0.0
                && first % 2.0 == 1.0
                && numeric_equal(&pair["second"], first + 1.0)
        })
}

fn add_reason(reasons: &mut Vec<String>, reason: &str) {
    if !reasons.iter().any(|current| current == reason) {
        reasons.push(reason.into());
    }
}

fn calibration_applicable(profile: &Value, capture: &Value) -> bool {
    let device = profile["deviceName"].as_str();
    if !device.is_some_and(|name| !js_trim(name).is_empty())
        || !numeric_equal(&profile["version"], 1.0)
        || js_number(profile.get("sampleRate")).partial_cmp(&0.0)
            != Some(std::cmp::Ordering::Greater)
        || profile["valid"] != true
        || !profile["issues"].is_array()
        || !(profile["gainDb"].is_object() || profile["gainDb"].is_array())
        || !(profile["uncertainty"].is_object() || profile["uncertainty"].is_array())
        || [
            &profile["gainDb"]["left"],
            &profile["gainDb"]["right"],
            &profile["mismatchDb"],
            &profile["clockPpm"],
            &profile["latencyMs"],
        ]
        .iter()
        .any(|value| number(value).is_none())
    {
        return false;
    }
    if capture
        .get("sampleRate")
        .is_some_and(|value| !value.is_null())
        && !same_optional(profile.get("sampleRate"), capture.get("sampleRate"))
    {
        return false;
    }
    if let Some(input) = capture.get("deviceName").filter(|value| !value.is_null()) {
        let input = input
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| input.to_string());
        if js_trim(device.unwrap_or_default()).to_lowercase() != js_trim(&input).to_lowercase() {
            return false;
        }
    }
    true
}

/// Ordered qualification reasons from original raw evidence, never live catalog defaults.
pub fn observation_issues(row: &Value) -> Vec<String> {
    let mut reasons = Vec::new();
    let c = &row["capture"];
    let q = &c["quality"];
    let info = &c["info"];
    let native = &c["nativeFields"];
    let pair = &c["pair"];
    let integrity = &c["sampleIntegrity"];
    if !truthy(&row["analysis"]) {
        add_reason(&mut reasons, "analysis_unavailable");
    }
    if truthy(&c["preempted"]) {
        add_reason(&mut reasons, "capture_preempted");
    }
    let frames = js_number(c.get("framesL"));
    let rate = js_number(c.get("sampleRate"));
    if !integer(&c["framesL"])
        || !same_optional(c.get("framesL"), c.get("framesR"))
        || frames < 30.0 * rate
        || frames > 35.0 * rate
    {
        add_reason(&mut reasons, "capture_incomplete");
    }
    let channels_valid = |value: &Value| {
        integer(value) && number(value).is_some_and(|n| (2.0..=65535.0).contains(&n))
    };
    let rate_valid = |value: &Value| integer(value) && number(value).is_some_and(|n| n > 400.0);
    if !channels_valid(&c["channels"])
        || !rate_valid(&c["sampleRate"])
        || !stereo_pair(pair)
        || js_number(pair.get("second")) > js_number(c.get("channels"))
        || !truthy(info)
        || !channels_valid(&info["channels"])
        || !rate_valid(&info["sampleRate"])
        || !stereo_pair(&info["pairs"][0])
        || info["pairs"].as_array().map(Vec::len) != Some(1)
        || !integer(&info["leaseId"])
        || numeric_equal(&info["leaseId"], 0.0)
        || !number(&info["maxSeconds"]).is_some_and(|n| (30.0..=35.0).contains(&n))
    {
        add_reason(&mut reasons, "native_observation_missing");
    }
    if !c["deviceName"].as_str().is_some_and(|name| {
        !js_trim(name).is_empty() && name != "input" && name != "Unnamed audio input"
    }) {
        add_reason(&mut reasons, "native_observation_missing");
    }
    if truthy(info)
        && (["deviceName", "sampleRate", "channels"]
            .iter()
            .any(|key| !same_optional(info.get(*key), c.get(*key)))
            || !same_optional(info["pairs"].get(0), c.get("pair")))
    {
        add_reason(&mut reasons, "actual_input_changed");
    }
    let fields = [
        "left",
        "right",
        "sampleRate",
        "channels",
        "deviceName",
        "pairs",
        "streamErrors",
    ];
    if !truthy(native)
        || fields
            .iter()
            .any(|key| native[*key]["present"] != true || native[*key]["valid"] != true)
    {
        add_reason(&mut reasons, "native_observation_missing");
    } else if !same_optional(native["left"].get("samples"), c.get("framesL"))
        || !same_optional(native["right"].get("samples"), c.get("framesR"))
        || ["sampleRate", "channels", "deviceName"]
            .iter()
            .any(|key| !same_optional(native[*key].get("value"), c.get(*key)))
        || native["pairs"]["value"].as_array().map(Vec::len) != Some(1)
        || !same_optional(native["pairs"]["value"].get(0), c.get("pair"))
        || !same_optional(native["streamErrors"].get("value"), c.get("streamErrors"))
    {
        add_reason(&mut reasons, "native_observation_mismatch");
    }
    let counters = [
        "framesCaptured",
        "overrunSamples",
        "clippedSamplesL",
        "clippedSamplesR",
        "streamErrors",
        "callbackCount",
    ];
    if !truthy(q)
        || counters.iter().any(|key| !integer(&q[*key]))
        || !number(&q["maxCallbackGapMs"]).is_some_and(|n| n >= 0.0)
        || !q["truncated"].is_boolean()
    {
        add_reason(&mut reasons, "capture_integrity_missing");
    } else {
        if !same_optional(q.get("framesCaptured"), c.get("framesL"))
            || numeric_equal(&q["callbackCount"], 0.0)
            || number(&q["overrunSamples"]).is_some_and(|n| n > 0.0)
            || number(&q["streamErrors"]).is_some_and(|n| n > 0.0)
            || q["truncated"] == true
        {
            add_reason(&mut reasons, "capture_integrity_failed");
        }
        if number(&q["clippedSamplesL"]).is_some_and(|n| n > 0.0)
            || number(&q["clippedSamplesR"]).is_some_and(|n| n > 0.0)
        {
            add_reason(&mut reasons, "clipped_input");
        }
        let quality_pair = &q["pairs"][0];
        if q["pairs"].as_array().map(Vec::len) != Some(1)
            || !quality_pair.is_object()
            || !same_optional(quality_pair.get("first"), pair.get("first"))
            || ["clippedSamplesL", "clippedSamplesR"]
                .iter()
                .any(|key| !same_optional(quality_pair.get(*key), q.get(*key)))
        {
            add_reason(&mut reasons, "capture_integrity_missing");
        }
    }
    if !c["streamErrors"].as_array().is_some_and(Vec::is_empty)
        || !q["streamErrorMessages"]
            .as_array()
            .is_some_and(Vec::is_empty)
    {
        add_reason(&mut reasons, "capture_integrity_failed");
    }
    if !truthy(integrity)
        || ["nonFiniteL", "nonFiniteR", "clippedL", "clippedR"]
            .iter()
            .any(|key| !integer(&integrity[*key]))
    {
        add_reason(&mut reasons, "capture_integrity_missing");
    } else {
        if truthy(&integrity["nonFiniteL"]) || truthy(&integrity["nonFiniteR"]) {
            add_reason(&mut reasons, "non_finite_samples");
        }
        if truthy(&integrity["clippedL"]) || truthy(&integrity["clippedR"]) {
            add_reason(&mut reasons, "clipped_input");
        }
    }
    if truthy(&row["analysis"])
        && (!same_optional(row["analysis"].get("sampleRate"), c.get("sampleRate"))
            || !same_optional(row["analysis"].get("capturedFrames"), c.get("framesL")))
    {
        add_reason(&mut reasons, "native_observation_mismatch");
    }
    if !truthy(&row["context"]["conditions"]["stationaryConfirmed"]) {
        add_reason(&mut reasons, "procedure_not_confirmed");
    }
    let support = &row["context"]["support"];
    let setup = &row["context"]["setup"];
    if truthy(&support["deckPositionId"])
        && !same_optional(support.get("deckPositionId"), setup.get("deckPositionId"))
    {
        add_reason(&mut reasons, "support_position_incompatible");
    }
    if !setup["components"].as_array().is_some_and(|components| {
        components.iter().all(|component| {
            component.is_object()
                && ["id", "assetId", "role"]
                    .iter()
                    .all(|key| component[*key].is_string())
        })
    }) {
        add_reason(&mut reasons, "setup_context_unavailable");
    }
    let cal = &row["calibration"];
    if !truthy(cal)
        || matches!(cal["state"].as_str(), Some("unavailable" | "rejected"))
        || cal["applied"] != false
        || (cal["state"] == "available" && !calibration_applicable(&cal["profile"], c))
        || (cal["state"] == "none" && cal.get("profile") != Some(&Value::Null))
    {
        add_reason(&mut reasons, "calibration_context_unavailable");
    }
    if let Some(issues) = row["contextIssues"].as_array() {
        for issue in issues.iter().filter_map(Value::as_str) {
            add_reason(&mut reasons, issue);
        }
    }
    reasons
}

fn normalize_comparison(input: &Value) -> Result<Value, String> {
    object(input, Some(CMP_KEYS), "Comparison")?;
    json_evidence(input)?;
    if !numeric_equal(&input["schemaVersion"], 1.0) || !input["sameConditions"].is_boolean() {
        return Err(invalid(
            "Invalid comparison version or conditions confirmation",
        ));
    }
    for key in ["id", "observationAId", "observationBId"] {
        identifier(&input[key], key)?;
    }
    timestamp(&input["createdAt"], "Comparison time")?;
    if same(&input["observationAId"], &input["observationBId"]) {
        return Err(invalid(
            "Comparison references must identify distinct observations",
        ));
    }
    Ok(input.clone())
}

fn selected_input(row: &Value, keys: &[&str]) -> Value {
    Value::Object(
        keys.iter()
            .filter_map(|key| row.get(*key).map(|value| ((*key).into(), value.clone())))
            .collect(),
    )
}

fn observation_record(value: &Value) -> Result<Value, String> {
    let keys: Vec<&str> = OBS_KEYS
        .iter()
        .copied()
        .chain(["recordedAt", "contextIssues"])
        .collect();
    object(value, Some(&keys), "Saved observation")?;
    normalize_observation(&selected_input(value, OBS_KEYS))?;
    timestamp(&value["recordedAt"], "Persistence time")?;
    if !value["contextIssues"].as_array().is_some_and(|issues| {
        issues
            .iter()
            .all(|reason| reason == "catalog_context_changed")
    }) {
        return Err(invalid("Invalid saved context validation"));
    }
    Ok(value.clone())
}

fn js_string(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::Bool(value) => value.to_string(),
        Value::String(value) => value.clone(),
        Value::Number(_) => number(value).unwrap_or(0.0).to_string(),
        Value::Array(values) => values
            .iter()
            .map(|value| {
                if value.is_null() {
                    String::new()
                } else {
                    js_string(value)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}

fn setup_basis(context: &Value) -> Value {
    let setup = &context["setup"];
    let mut components = Vec::new();
    if let Some(rows) = setup["components"].as_array() {
        for row in rows {
            let mut component = Map::new();
            for key in ["id", "role", "assetId", "position", "settingsSnapshotId"] {
                component.insert(key.into(), row.get(key).cloned().unwrap_or(Value::Null));
            }
            components.push(Value::Object(component));
        }
    }
    components.sort_by_cached_key(|component| js_string(&component["id"]));
    json!({"venueId":setup["venueId"], "boothId":setup["boothId"],
        "deckPositionId":setup["deckPositionId"], "components":components})
}

fn support_basis(support: &Value) -> Value {
    json!({"deckPositionId":support["deckPositionId"], "description":support["description"],
        "structureJson":support.get("structureJson").filter(|value| !value.is_null()).cloned().unwrap_or_else(|| json!("[]")),
        "approximateMassKg":support["approximateMassKg"], "coupledState":support["coupledState"], "notes":support["notes"]})
}

pub fn compare_observations(a: &Value, b: &Value, input: &Value) -> Result<Value, String> {
    let draft = normalize_comparison(input)?;
    if a.get("id") != draft.get("observationAId") || b.get("id") != draft.get("observationBId") {
        return Err(invalid("Comparison source observation is missing"));
    }
    for row in [a, b] {
        if row.get("recordedAt").is_some() {
            observation_record(row)?;
        } else {
            normalize_observation(row)?;
        }
    }
    if a["stage"] != "A"
        || b["stage"] != "B"
        || ["pairId", "venueId", "setupId"]
            .iter()
            .any(|key| !same(&a[*key], &b[*key]))
    {
        return Err(invalid(
            "Comparison references do not belong to the same ordered A/B pair",
        ));
    }
    let mut reasons = observation_issues(a);
    for reason in observation_issues(b) {
        add_reason(&mut reasons, &reason);
    }
    if draft["sameConditions"] != true {
        add_reason(&mut reasons, "pa_comparability_unconfirmed");
    }
    if same(
        &a["context"]["support"]["id"],
        &b["context"]["support"]["id"],
    ) {
        add_reason(&mut reasons, "support_change_not_recorded");
    }
    if !same(&setup_basis(&a["context"]), &setup_basis(&b["context"])) {
        add_reason(&mut reasons, "setup_context_changed");
    }
    for (keys, reason) in [
        (&["route"][..], "physical_route_changed"),
        (&["gainSettings"][..], "gain_or_filter_changed"),
        (
            &["procedure", "source", "stationaryConfirmed"][..],
            "procedure_changed",
        ),
        (&["placement"][..], "placement_changed"),
        (&["paState", "paLevel"][..], "pa_conditions_changed"),
    ] {
        if keys.iter().any(|key| {
            !same_optional(
                a["context"]["conditions"].get(*key),
                b["context"]["conditions"].get(*key),
            )
        }) {
            add_reason(&mut reasons, reason);
        }
    }
    if ["deviceName", "channels"]
        .iter()
        .any(|key| !same_optional(a["capture"].get(*key), b["capture"].get(*key)))
    {
        add_reason(&mut reasons, "actual_input_changed");
    }
    if !same_optional(a["capture"].get("pair"), b["capture"].get("pair")) {
        add_reason(&mut reasons, "input_pair_changed");
    }
    if !same_optional(
        a["capture"].get("sampleRate"),
        b["capture"].get("sampleRate"),
    ) {
        add_reason(&mut reasons, "sample_rate_changed");
    }
    if !same(&a["calibration"], &b["calibration"]) {
        add_reason(&mut reasons, "calibration_context_changed");
    }
    if !a["analysis"].is_null() && !b["analysis"].is_null() {
        for key in [
            "method",
            "sampleRate",
            "fftSize",
            "hop",
            "segments",
            "candidateFrames",
            "analyzedFrames",
            "window",
            "detrend",
            "statistic",
        ] {
            if !same(&a["analysis"][key], &b["analysis"][key]) {
                add_reason(&mut reasons, "method_mismatch");
            }
        }
        if [
            &a["analysis"]["powerL"],
            &a["analysis"]["powerR"],
            &b["analysis"]["powerL"],
            &b["analysis"]["powerR"],
        ]
        .iter()
        .any(|value| !number(value).is_some_and(|power| power > 0.0))
        {
            add_reason(&mut reasons, "zero_band_power");
        }
    }
    let mut delta = json!({"left":null, "right":null, "pair":null});
    if reasons.is_empty() {
        for (key, metric) in [
            ("left", "powerL"),
            ("right", "powerR"),
            ("pair", "pairPower"),
        ] {
            let before =
                number(&a["analysis"][metric]).ok_or_else(|| invalid("Invalid original power"))?;
            let after =
                number(&b["analysis"][metric]).ok_or_else(|| invalid("Invalid original power"))?;
            let difference = 10.0 * after.log10() - 10.0 * before.log10();
            if !difference.is_finite() {
                return Err(invalid("Comparison logarithmic difference is not finite"));
            }
            delta[key] = json!(difference);
        }
    }
    Ok(json!({"method":METHOD, "direction":"B-minus-A",
        "status":if reasons.is_empty() { "operator_reported_comparable" } else { "not_comparable" },
        "reasons":reasons, "deltaDb":delta, "uncertainty":uncertainty()}))
}

fn comparison_record(value: &Value) -> Result<Value, String> {
    let keys: Vec<&str> = CMP_KEYS
        .iter()
        .copied()
        .chain(["pairId", "venueId", "setupId", "result", "recordedAt"])
        .collect();
    object(value, Some(&keys), "Saved comparison")?;
    normalize_comparison(&selected_input(value, CMP_KEYS))?;
    for key in ["pairId", "venueId", "setupId"] {
        identifier(&value[key], key)?;
    }
    timestamp(&value["recordedAt"], "Persistence time")?;
    let result = &value["result"];
    object(
        result,
        Some(&[
            "method",
            "direction",
            "status",
            "reasons",
            "deltaDb",
            "uncertainty",
        ]),
        "Comparison result",
    )?;
    if result["method"] != METHOD
        || result["direction"] != "B-minus-A"
        || !matches!(
            result["status"].as_str(),
            Some("not_comparable" | "operator_reported_comparable")
        )
        || !result["reasons"].is_array()
        || !same(&result["uncertainty"], &uncertainty())
    {
        return Err(invalid("Invalid saved comparison result"));
    }
    object(
        &result["deltaDb"],
        Some(&["left", "right", "pair"]),
        "Delta",
    )?;
    for key in ["left", "right", "pair"] {
        if !result["deltaDb"]
            .get(key)
            .is_some_and(|value| value.is_null() || number(value).is_some())
        {
            return Err(invalid("Invalid saved delta"));
        }
    }
    Ok(value.clone())
}

fn verified_comparison(record: &Value, a: &Value, b: &Value) -> Result<Value, String> {
    let expected = compare_observations(a, b, &selected_input(record, CMP_KEYS))?;
    if ["pairId", "venueId", "setupId"]
        .iter()
        .any(|key| !same(&record[*key], &a[*key]))
        || !same(&record["result"]["status"], &expected["status"])
        || !same(&record["result"]["reasons"], &expected["reasons"])
    {
        return Err(invalid("Saved comparison disagrees with original evidence"));
    }
    for key in ["left", "right", "pair"] {
        let expected = &expected["deltaDb"][key];
        let saved = &record["result"]["deltaDb"][key];
        if if expected.is_null() {
            !saved.is_null()
        } else {
            !number(expected).is_some_and(|expected| close_value(saved, expected))
        } {
            return Err(invalid("Saved delta disagrees with original evidence"));
        }
    }
    let mut enriched = record.clone();
    enriched["observationA"] = a.clone();
    enriched["observationB"] = b.clone();
    Ok(enriched)
}

struct Stored {
    id: String,
    pair_id: String,
    venue_id: String,
    setup_id: String,
    occurred_at: String,
    recorded_at: String,
    payload_json: String,
    observation_a_id: Option<String>,
    observation_b_id: Option<String>,
}

fn read_table(
    conn: &Connection,
    comparison: bool,
    mut visit: impl FnMut(Value) -> Result<(), String>,
) -> Result<(), String> {
    let sql = if comparison {
        "SELECT id,pair_id,venue_id,setup_id,created_at,recorded_at,payload_json,observation_a_id,observation_b_id FROM support_isolation_comparison ORDER BY created_at COLLATE BINARY DESC,id COLLATE BINARY DESC"
    } else {
        "SELECT id,pair_id,venue_id,setup_id,captured_at,recorded_at,payload_json,NULL,NULL FROM support_isolation_observation ORDER BY captured_at COLLATE BINARY DESC,id COLLATE BINARY DESC"
    };
    let mut statement = conn.prepare(sql).map_err(storage)?;
    let rows = statement
        .query_map([], |row| {
            Ok(Stored {
                id: row.get(0)?,
                pair_id: row.get(1)?,
                venue_id: row.get(2)?,
                setup_id: row.get(3)?,
                occurred_at: row.get(4)?,
                recorded_at: row.get(5)?,
                payload_json: row.get(6)?,
                observation_a_id: row.get(7)?,
                observation_b_id: row.get(8)?,
            })
        })
        .map_err(storage)?;
    for row in rows {
        let row = row.map_err(storage)?;
        let value: Value = serde_json::from_str(&row.payload_json).map_err(storage)?;
        let value = if comparison {
            comparison_record(&value)
        } else {
            observation_record(&value)
        }
        .map_err(storage)?;
        for (key, expected) in [
            ("id", &row.id),
            ("pairId", &row.pair_id),
            ("venueId", &row.venue_id),
            ("setupId", &row.setup_id),
            ("recordedAt", &row.recorded_at),
            (
                if comparison {
                    "createdAt"
                } else {
                    "capturedAt"
                },
                &row.occurred_at,
            ),
        ] {
            if value[key].as_str() != Some(expected.as_str()) {
                return Err(storage("Stored record columns and original JSON disagree"));
            }
        }
        if comparison
            && (value["observationAId"].as_str() != row.observation_a_id.as_deref()
                || value["observationBId"].as_str() != row.observation_b_id.as_deref())
        {
            return Err(storage("Stored comparison reference columns disagree"));
        }
        visit(value)?;
    }
    Ok(())
}

// Call only after both tables' original JSON and columns have been validated
// in the current transaction. The transaction keeps these indexed lookups on
// the same snapshot; retaining every parsed original is unnecessary.
fn lookup_validated_record(
    conn: &Connection,
    comparison: bool,
    id: &str,
) -> Result<Option<Value>, String> {
    let sql = if comparison {
        "SELECT payload_json FROM support_isolation_comparison WHERE id=?1"
    } else {
        "SELECT payload_json FROM support_isolation_observation WHERE id=?1"
    };
    let payload: Option<String> = conn
        .query_row(sql, [id], |row| row.get(0))
        .optional()
        .map_err(storage)?;
    payload
        .map(|payload| serde_json::from_str(&payload).map_err(storage))
        .transpose()
}

struct History {
    observations: Vec<Value>,
    comparisons: Vec<Value>,
    observation_total: usize,
    comparison_total: usize,
}

fn read_history(
    conn: &Connection,
    venue_id: Option<&str>,
    limit: usize,
) -> Result<History, String> {
    let mut history = History {
        observations: Vec::new(),
        comparisons: Vec::new(),
        observation_total: 0,
        comparison_total: 0,
    };
    // Keep the original refusal order: all observation records, then all
    // comparison records, then ID collisions, then derived/reference checks.
    // A filter or zero retained rows never skips global history validation.
    read_table(conn, false, |row| {
        if venue_id.is_none_or(|venue| row["venueId"] == venue) {
            history.observation_total += 1;
            if history.observations.len() < limit {
                history.observations.push(row);
            }
        }
        Ok(())
    })?;
    read_table(conn, true, |row| {
        if venue_id.is_none_or(|venue| row["venueId"] == venue) {
            history.comparison_total += 1;
            if history.comparisons.len() < limit {
                history.comparisons.push(row);
            }
        }
        Ok(())
    })?;
    // Each table's primary key enforces its own unique IDs. The remaining
    // collision is across the two tables and can use their existing indexes.
    let duplicate: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM support_isolation_comparison AS c JOIN support_isolation_observation AS o ON o.id=c.id)",
            [],
            |row| row.get(0),
        )
        .map_err(storage)?;
    if duplicate {
        return Err(storage("Duplicate immutable record ID"));
    }
    read_table(conn, true, |row| {
        let a = lookup_validated_record(
            conn,
            false,
            row["observationAId"].as_str().unwrap_or_default(),
        )?
        .ok_or_else(|| storage("Comparison source observation is missing"))?;
        let b = lookup_validated_record(
            conn,
            false,
            row["observationBId"].as_str().unwrap_or_default(),
        )?
        .ok_or_else(|| storage("Comparison source observation is missing"))?;
        verified_comparison(&row, &a, &b).map_err(storage)?;
        Ok(())
    })?;
    Ok(history)
}

fn current_context_matches(conn: &Connection, input: &Value) -> Result<bool, String> {
    // Match only the browser's physical projections, preserving full original
    // snapshots. A different selected A/B support need not rewrite the setup.
    let venue: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM venue WHERE id=?1)",
            [input["venueId"].as_str().unwrap_or_default()],
            |row| row.get(0),
        )
        .map_err(storage)?;
    let setup_id = input["setupId"].as_str().unwrap_or_default();
    let mut setup: Option<Value> = conn.query_row(
        "SELECT venue_id,booth_id,deck_position_id,support_configuration_id FROM setup WHERE id=?1",
        [setup_id], |row| Ok(json!({"venueId":row.get::<_, Option<String>>(0)?,
            "boothId":row.get::<_, Option<String>>(1)?, "deckPositionId":row.get::<_, Option<String>>(2)?,
            "supportConfigurationId":row.get::<_, Option<String>>(3)?})))
        .optional().map_err(storage)?;
    if let Some(setup) = &mut setup {
        let mut statement = conn.prepare("SELECT id,role,asset_id,position,settings_snapshot_id FROM setup_component WHERE setup_id=?1 ORDER BY id COLLATE BINARY").map_err(storage)?;
        let rows = statement.query_map([setup_id], |row| Ok(json!({"id":row.get::<_, String>(0)?,
            "role":row.get::<_, String>(1)?, "assetId":row.get::<_, String>(2)?,
            "position":row.get::<_, Option<String>>(3)?, "settingsSnapshotId":row.get::<_, Option<String>>(4)?}))).map_err(storage)?;
        setup["components"] = Value::Array(
            rows.collect::<rusqlite::Result<Vec<_>>>()
                .map_err(storage)?,
        );
    }
    struct PhysicalSupport {
        position: Option<String>,
        description: Option<String>,
        structure: String,
        mass: Option<f64>,
        coupled: Option<String>,
        notes: Option<String>,
    }
    let support: Option<PhysicalSupport> = conn.query_row(
        "SELECT deck_position_id,description,structure_json,approximate_mass_kg,coupled_state,notes FROM support_configuration WHERE id=?1",
        [input["context"]["support"]["id"].as_str().unwrap_or_default()], |row| Ok(PhysicalSupport {
            position: row.get(0)?, description: row.get(1)?, structure: row.get(2)?,
            mass: row.get(3)?, coupled: row.get(4)?, notes: row.get(5)?,
        }))
        .optional().map_err(storage)?;
    if support
        .as_ref()
        .is_some_and(|support| support.mass.is_some_and(|mass| !mass.is_finite()))
    {
        return Err(storage(
            "Current support catalog contains a non-finite mass",
        ));
    }
    let support = support.map(|support| {
        json!({"deckPositionId":support.position,
        "description":support.description, "structureJson":support.structure,
        "approximateMassKg":support.mass, "coupledState":support.coupled, "notes":support.notes})
    });
    let (Some(setup), Some(support)) = (setup, support) else {
        return Ok(false);
    };
    Ok(venue
        && same(&setup["venueId"], &input["venueId"])
        && (!truthy(&support["deckPositionId"])
            || same(&support["deckPositionId"], &setup["deckPositionId"]))
        && same(
            &setup_basis(&json!({"setup":setup})),
            &setup_basis(&input["context"]),
        )
        && same(
            &setup["supportConfigurationId"],
            &input["context"]["setup"]["supportConfigurationId"],
        )
        && same(
            &support_basis(&support),
            &support_basis(&input["context"]["support"]),
        ))
}

fn persistence_time(conn: &Connection) -> Result<String, String> {
    let value = now_iso(conn).map_err(storage)?;
    if !valid_time(&value) {
        return Err(storage("Database clock returned an invalid timestamp"));
    }
    Ok(value)
}

pub fn save_observation(conn: &Connection, value: &Value) -> Result<Value, String> {
    let input = normalize_observation(value)?;
    let tx = Transaction::new_unchecked(conn, TransactionBehavior::Immediate).map_err(storage)?;
    read_history(&tx, None, 0)?;
    let id = input["id"].as_str().unwrap_or_default();
    if let Some(previous) = lookup_validated_record(&tx, false, id)? {
        if !same(&selected_input(&previous, OBS_KEYS), &input) {
            return Err(conflict());
        }
        tx.commit().map_err(storage)?;
        return Ok(previous);
    }
    if lookup_validated_record(&tx, true, id)?.is_some() {
        return Err(conflict());
    }
    let matches = current_context_matches(&tx, &input)?;
    let mut record = input;
    record["recordedAt"] = json!(persistence_time(&tx)?);
    record["contextIssues"] = if matches {
        json!([])
    } else {
        json!(["catalog_context_changed"])
    };
    observation_record(&record)?;
    tx.execute("INSERT INTO support_isolation_observation (id,pair_id,venue_id,setup_id,captured_at,recorded_at,payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![record["id"].as_str(), record["pairId"].as_str(), record["venueId"].as_str(), record["setupId"].as_str(),
            record["capturedAt"].as_str(), record["recordedAt"].as_str(), serde_json::to_string(&record).map_err(storage)?]).map_err(storage)?;
    tx.commit().map_err(storage)?;
    Ok(record)
}

pub fn get_observation(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    if !valid_identifier(id) {
        return Err(invalid("Observation ID must be a valid identifier"));
    }
    let tx = Transaction::new_unchecked(conn, TransactionBehavior::Deferred).map_err(storage)?;
    read_history(&tx, None, 0)?;
    let result = lookup_validated_record(&tx, false, id)?;
    tx.commit().map_err(storage)?;
    Ok(result)
}

pub fn save_comparison(conn: &Connection, value: &Value) -> Result<Value, String> {
    let input = normalize_comparison(value)?;
    let tx = Transaction::new_unchecked(conn, TransactionBehavior::Immediate).map_err(storage)?;
    read_history(&tx, None, 0)?;
    let id = input["id"].as_str().unwrap_or_default();
    if let Some(previous) = lookup_validated_record(&tx, true, id)? {
        if !same(&selected_input(&previous, CMP_KEYS), &input) {
            return Err(conflict());
        }
        tx.commit().map_err(storage)?;
        return Ok(previous);
    }
    if lookup_validated_record(&tx, false, id)?.is_some() {
        return Err(conflict());
    }
    let a = lookup_validated_record(
        &tx,
        false,
        input["observationAId"].as_str().unwrap_or_default(),
    )?
    .ok_or_else(|| invalid("Comparison source observation is missing"))?;
    let b = lookup_validated_record(
        &tx,
        false,
        input["observationBId"].as_str().unwrap_or_default(),
    )?
    .ok_or_else(|| invalid("Comparison source observation is missing"))?;
    let result = compare_observations(&a, &b, &input)?;
    let mut record = input;
    for key in ["pairId", "venueId", "setupId"] {
        record[key] = a[key].clone();
    }
    record["result"] = result;
    record["recordedAt"] = json!(persistence_time(&tx)?);
    comparison_record(&record)?;
    tx.execute("INSERT INTO support_isolation_comparison (id,pair_id,venue_id,setup_id,observation_a_id,observation_b_id,created_at,recorded_at,payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![record["id"].as_str(), record["pairId"].as_str(), record["venueId"].as_str(), record["setupId"].as_str(),
            record["observationAId"].as_str(), record["observationBId"].as_str(), record["createdAt"].as_str(),
            record["recordedAt"].as_str(), serde_json::to_string(&record).map_err(storage)?]).map_err(storage)?;
    tx.commit().map_err(storage)?;
    Ok(record)
}

pub fn list(conn: &Connection, filter: &Value) -> Result<Value, String> {
    object(filter, Some(&["venueId", "limit"]), "History filter")?;
    let venue_id = if filter["venueId"].is_null() {
        None
    } else {
        Some(identifier(&filter["venueId"], "Venue ID")?)
    };
    let limit = if filter["limit"].is_null() {
        50
    } else {
        if !integer(&filter["limit"])
            || !number(&filter["limit"]).is_some_and(|n| (1.0..=100.0).contains(&n))
        {
            return Err(invalid("History limit must be 1–100"));
        }
        number(&filter["limit"]).unwrap_or(0.0) as usize
    };
    let tx = Transaction::new_unchecked(conn, TransactionBehavior::Deferred).map_err(storage)?;
    let history = read_history(&tx, venue_id, limit)?;
    let expanded: Vec<Value> = history
        .comparisons
        .iter()
        .map(|row| {
            let a = lookup_validated_record(
                &tx,
                false,
                row["observationAId"].as_str().unwrap_or_default(),
            )?
            .ok_or_else(|| storage("Comparison source observation is missing"))?;
            let b = lookup_validated_record(
                &tx,
                false,
                row["observationBId"].as_str().unwrap_or_default(),
            )?
            .ok_or_else(|| storage("Comparison source observation is missing"))?;
            verified_comparison(row, &a, &b).map_err(storage)
        })
        .collect::<Result<_, _>>()?;
    let response = json!({"observations":history.observations,
        "comparisons":expanded, "observationTotal":history.observation_total, "comparisonTotal":history.comparison_total, "limit":limit});
    tx.commit().map_err(storage)?;
    Ok(response)
}

fn with_db<T>(
    app: &AppHandle,
    f: impl FnOnce(&Connection) -> Result<T, String>,
) -> Result<T, String> {
    let conn = open_database(&database_path(app)?)?;
    f(&conn)
}

#[tauri::command]
pub async fn support_isolation_observation_save(
    app: AppHandle,
    input: Value,
) -> Result<Value, String> {
    crate::db::off_main(move || with_db(&app, |conn| save_observation(conn, &input))).await?
}

#[tauri::command]
pub async fn support_isolation_observation_get(
    app: AppHandle,
    id: String,
) -> Result<Option<Value>, String> {
    crate::db::off_main(move || with_db(&app, |conn| get_observation(conn, &id))).await?
}

#[tauri::command]
pub async fn support_isolation_comparison_save(
    app: AppHandle,
    input: Value,
) -> Result<Value, String> {
    crate::db::off_main(move || with_db(&app, |conn| save_comparison(conn, &input))).await?
}

#[tauri::command]
pub async fn support_isolation_list(
    app: AppHandle,
    filter: Option<Value>,
) -> Result<Value, String> {
    crate::db::off_main(move || {
        with_db(&app, |conn| {
            list(conn, &filter.unwrap_or_else(|| json!({})))
        })
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;

    fn fixture() -> Value {
        serde_json::from_str(include_str!("../../tests/contracts/support-isolation.json")).unwrap()
    }

    fn initialize(conn: &Connection) {
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(conn).unwrap();
        conn.execute_batch(
            "INSERT INTO venue(id,name,created_at,updated_at) VALUES
                ('venue-a','Club live','2026-01-01','2026-01-01'),
                ('venue-b','Other venue','2026-01-01','2026-01-01');
            INSERT INTO support_configuration(id,name,description,structure_json) VALUES
                ('support-a','Shelf','Original shelf','[ { \"legacy\": true } ]'),
                ('support-b','Paver <img src=x>','Shelf + paver','[ { \"legacy\": true } ]');
            INSERT INTO asset(id,nickname,created_at,updated_at) VALUES
                ('asset-a','Original deck','2026-01-01','2026-01-01'),
                ('asset-b','Replacement deck','2026-01-01','2026-01-01');
            INSERT INTO asset_settings_snapshot(id,asset_id,captured_at) VALUES
                ('settings-a','asset-a','2026-01-01'),('settings-b','asset-b','2026-01-01');
            INSERT INTO setup(id,name,venue_id,support_configuration_id,created_at) VALUES
                ('setup-a','Left deck','venue-a','support-a','2026-01-01');
            INSERT INTO setup_component(id,setup_id,role,asset_id,position) VALUES
                ('component-a','setup-a','deck','asset-a','left');",
        )
        .unwrap();
    }

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        initialize(&conn);
        conn
    }

    fn save_pair(conn: &Connection) -> (Value, Value, Value) {
        let fixture = fixture();
        let a = save_observation(conn, &fixture["observationA"]).unwrap();
        let b = save_observation(conn, &fixture["observationB"]).unwrap();
        let comparison = save_comparison(conn, &fixture["comparison"]).unwrap();
        (a, b, comparison)
    }

    fn raw_rows(conn: &Connection) -> Vec<(String, String)> {
        let mut statement = conn
            .prepare(
                "SELECT id,payload_json FROM support_isolation_observation
             UNION ALL SELECT id,payload_json FROM support_isolation_comparison ORDER BY id",
            )
            .unwrap();
        statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap()
    }

    #[test]
    fn complete_migrations_add_only_the_two_history_tables_and_preserve_catalog_entities() {
        let conn = mem();
        let before: i64 = conn
            .query_row("SELECT COUNT(*) FROM asset", [], |row| row.get(0))
            .unwrap();
        apply_migrations(&conn).unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM asset", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            before
        );
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM schema_migration WHERE version BETWEEN 1 AND 24",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            24
        );
        for table in [
            "venue",
            "setup",
            "support_configuration",
            "venue_incident",
            "support_isolation_observation",
            "support_isolation_comparison",
        ] {
            assert!(conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                    [table],
                    |row| row.get::<_, bool>(0)
                )
                .unwrap());
        }
        assert_eq!(
            list(&conn, &json!({})).unwrap(),
            json!({"observations":[], "comparisons":[], "observationTotal":0, "comparisonTotal":0, "limit":50})
        );
        assert!(get_observation(&conn, "missing").unwrap().is_none());
    }

    #[test]
    fn fixture_round_trip_derives_delta_and_retains_all_original_metadata() {
        let conn = mem();
        let fixture = fixture();
        let (a, b, comparison) = save_pair(&conn);
        assert!(same(
            &selected_input(&a, OBS_KEYS),
            &fixture["observationA"]
        ));
        assert!(same(
            &selected_input(&b, OBS_KEYS),
            &fixture["observationB"]
        ));
        assert_eq!(a["contextIssues"], json!([]));
        assert_eq!(b["contextIssues"], json!([]));
        assert_eq!(
            a["context"]["support"]["structureJson"],
            "[ { \"legacy\": true } ]"
        );
        assert_eq!(b["context"]["support"]["name"], "Paver <img src=x>");
        assert_eq!(
            comparison["result"]["status"],
            "operator_reported_comparable"
        );
        assert_eq!(comparison["result"]["reasons"], json!([]));
        for key in ["left", "right", "pair"] {
            assert!(
                (comparison["result"]["deltaDb"][key].as_f64().unwrap()
                    - fixture["expectedDeltaDb"].as_f64().unwrap())
                .abs()
                    < 1e-12
            );
        }
        assert_eq!(comparison["result"]["uncertainty"], uncertainty());
        assert_eq!(a["rawAudioRetained"], false);
        let history = list(&conn, &json!({"venueId":"venue-a", "limit":1})).unwrap();
        assert_eq!(history["observationTotal"], 2);
        assert_eq!(history["comparisonTotal"], 1);
        assert_eq!(history["observations"].as_array().unwrap().len(), 1);
        assert_eq!(history["comparisons"][0]["observationA"], a);
        assert_eq!(history["comparisons"][0]["observationB"], b);
        assert_eq!(get_observation(&conn, "observation-a").unwrap().unwrap(), a);
    }

    #[test]
    fn exact_retries_precede_catalog_reads_and_keep_original_context_after_moves_and_deletion() {
        let conn = mem();
        let fixture = fixture();
        let (a, b, comparison) = save_pair(&conn);
        let before = raw_rows(&conn);
        conn.execute("UPDATE setup SET venue_id='venue-b' WHERE id='setup-a'", [])
            .unwrap();
        assert_eq!(
            save_observation(&conn, &fixture["observationA"]).unwrap(),
            a
        );
        conn.execute_batch(
            "DELETE FROM setup; DELETE FROM support_configuration; DELETE FROM venue;",
        )
        .unwrap();
        assert_eq!(
            save_observation(&conn, &fixture["observationB"]).unwrap(),
            b
        );
        assert_eq!(
            save_comparison(&conn, &fixture["comparison"]).unwrap(),
            comparison
        );
        assert_eq!(raw_rows(&conn), before);
        assert_eq!(
            list(&conn, &json!({})).unwrap()["comparisons"][0]["observationA"],
            a
        );
        conn.execute_batch(
            "ALTER TABLE support_configuration RENAME TO temporarily_unavailable_support;",
        )
        .unwrap();
        assert_eq!(
            save_observation(&conn, &fixture["observationA"]).unwrap(),
            a
        );
        let mut new = fixture["observationA"].clone();
        new["id"] = json!("new-after-catalog-read-error");
        assert!(save_observation(&conn, &new)
            .unwrap_err()
            .contains("SUPPORT_STORAGE"));
        assert_eq!(raw_rows(&conn), before);
    }

    #[test]
    fn conflicting_submissions_and_cross_table_ids_do_not_replace_originals() {
        let conn = mem();
        let fixture = fixture();
        save_pair(&conn);
        let before = raw_rows(&conn);
        let mut changed = fixture["observationA"].clone();
        changed["context"]["support"]["name"] = json!("Replacement original");
        assert!(save_observation(&conn, &changed)
            .unwrap_err()
            .contains("SUPPORT_CONFLICT"));
        changed = fixture["observationA"].clone();
        changed["id"] = json!("comparison-one");
        assert!(save_observation(&conn, &changed)
            .unwrap_err()
            .contains("SUPPORT_CONFLICT"));
        let mut comparison = fixture["comparison"].clone();
        comparison["sameConditions"] = json!(false);
        assert!(save_comparison(&conn, &comparison)
            .unwrap_err()
            .contains("SUPPORT_CONFLICT"));
        comparison = fixture["comparison"].clone();
        comparison["id"] = json!("observation-a");
        assert!(save_comparison(&conn, &comparison)
            .unwrap_err()
            .contains("SUPPORT_CONFLICT"));
        assert_eq!(raw_rows(&conn), before);
    }

    #[test]
    fn new_records_capture_same_id_physical_catalog_changes_without_replacing_snapshots() {
        for sql in [
            "UPDATE support_configuration SET structure_json='[{\"newLayer\":\"foam\"}]' WHERE id='support-a'",
            "UPDATE support_configuration SET coupled_state='decoupled' WHERE id='support-a'",
            "UPDATE support_configuration SET approximate_mass_kg=12 WHERE id='support-a'",
            "UPDATE support_configuration SET notes='Physical placement changed' WHERE id='support-a'",
            "UPDATE setup_component SET asset_id='asset-b' WHERE id='component-a'",
            "UPDATE setup_component SET settings_snapshot_id='settings-a' WHERE id='component-a'",
            "UPDATE setup SET support_configuration_id='support-b' WHERE id='setup-a'",
            "UPDATE setup SET venue_id='venue-b' WHERE id='setup-a'",
            "DELETE FROM setup_component WHERE id='component-a'",
        ] {
            let conn = mem();
            conn.execute_batch(sql).unwrap();
            let input = fixture()["observationA"].clone();
            let row = save_observation(&conn, &input).unwrap();
            assert_eq!(row["context"], input["context"], "{sql}");
            assert_eq!(row["contextIssues"], json!(["catalog_context_changed"]), "{sql}");
            assert!(observation_issues(&row).contains(&"catalog_context_changed".into()));
        }
        let conn = mem();
        conn.execute_batch("UPDATE venue SET name='Renamed'; UPDATE setup SET name='Display name',notes='Display note'; UPDATE support_configuration SET name='Display support name';").unwrap();
        assert_eq!(
            save_observation(&conn, &fixture()["observationA"]).unwrap()["contextIssues"],
            json!([])
        );
    }

    #[test]
    fn missing_catalog_context_remains_completed_evidence_with_an_explicit_issue() {
        let conn = mem();
        conn.execute_batch(
            "DELETE FROM setup; DELETE FROM support_configuration; DELETE FROM venue;",
        )
        .unwrap();
        let input = fixture()["observationA"].clone();
        let saved = save_observation(&conn, &input).unwrap();
        assert!(same(&selected_input(&saved, OBS_KEYS), &input));
        assert_eq!(saved["contextIssues"], json!(["catalog_context_changed"]));
        let b = save_observation(&conn, &fixture()["observationB"]).unwrap();
        let compared = save_comparison(&conn, &fixture()["comparison"]).unwrap();
        assert_eq!(compared["result"]["status"], "not_comparable");
        assert_eq!(
            compared["result"]["reasons"],
            json!(["catalog_context_changed"])
        );
        assert_eq!(
            compared["result"]["deltaDb"],
            json!({"left":null,"right":null,"pair":null})
        );
        assert_eq!(get_observation(&conn, "observation-b").unwrap().unwrap(), b);
    }

    #[test]
    fn pa_route_quality_calibration_and_setup_changes_block_delta_without_mutating_evidence() {
        let fixture = fixture();
        for (pointer, changed, reason) in [
            (
                "/context/conditions/paLevel",
                json!("Master mark 3"),
                "pa_conditions_changed",
            ),
            (
                "/context/conditions/route",
                json!("Different preamp"),
                "physical_route_changed",
            ),
            (
                "/context/conditions/gainSettings",
                json!("New gain"),
                "gain_or_filter_changed",
            ),
            (
                "/context/conditions/procedure",
                json!("Other groove"),
                "procedure_changed",
            ),
            (
                "/context/conditions/placement",
                json!("Moved"),
                "placement_changed",
            ),
            (
                "/capture/quality/truncated",
                json!(true),
                "capture_integrity_failed",
            ),
            (
                "/capture/sampleIntegrity/clippedL",
                json!(1),
                "clipped_input",
            ),
            (
                "/calibration/state",
                json!("unavailable"),
                "calibration_context_unavailable",
            ),
            (
                "/context/setup/components/0/assetId",
                json!("asset-b"),
                "setup_context_changed",
            ),
            (
                "/context/setup/components",
                json!([null]),
                "setup_context_unavailable",
            ),
        ] {
            let conn = mem();
            let a = fixture["observationA"].clone();
            let mut b = fixture["observationB"].clone();
            *b.pointer_mut(pointer).unwrap() = changed;
            let before_a = a.clone();
            let before_b = b.clone();
            save_observation(&conn, &a).unwrap();
            save_observation(&conn, &b).unwrap();
            let result = save_comparison(&conn, &fixture["comparison"]).unwrap()["result"].clone();
            assert_eq!(result["status"], "not_comparable", "{pointer}");
            assert!(
                result["reasons"]
                    .as_array()
                    .unwrap()
                    .contains(&json!(reason)),
                "{pointer}: {result}"
            );
            assert_eq!(
                result["deltaDb"],
                json!({"left":null,"right":null,"pair":null})
            );
            assert_eq!(a, before_a);
            assert_eq!(b, before_b);
        }
        let result = compare_observations(&fixture["observationA"], &fixture["observationB"],
            &json!({"sameConditions":false, "id":"no-confirmation", "schemaVersion":1,
                "observationAId":"observation-a", "observationBId":"observation-b", "createdAt":"2026-11-18T12:03:00.000Z"})).unwrap();
        assert_eq!(result["reasons"], json!(["pa_comparability_unconfirmed"]));
    }

    #[test]
    fn raw_quality_scalar_types_and_malformed_pairs_profiles_are_retained_as_ordered_issues() {
        let mut input = fixture()["observationA"].clone();
        input["capture"]["channels"] = json!("2");
        input["capture"]["info"]["channels"] = json!("2");
        input["capture"]["nativeFields"]["channels"]["value"] = json!("2");
        let conn = mem();
        let saved = save_observation(&conn, &input).unwrap();
        assert_eq!(saved["capture"], input["capture"]);
        assert!(observation_issues(&saved).contains(&"native_observation_missing".into()));
        let mut input = fixture()["observationA"].clone();
        input["capture"]["quality"]["pairs"] = json!([null]);
        assert!(observation_issues(&input).contains(&"capture_integrity_missing".into()));
        input["calibration"] = json!({"state":"available", "applied":false, "sourceKey":"x", "reasons":[],
            "profile":{"version":1,"deviceName":12,"sampleRate":4096,"valid":true,"issues":[],
                "gainDb":{"left":0,"right":0},"uncertainty":{},"mismatchDb":0,"clockPpm":0,"latencyMs":0}});
        assert!(observation_issues(&input).contains(&"calibration_context_unavailable".into()));

        let mut input = fixture()["observationA"].clone();
        input["analysis"] = Value::Null;
        input["analysisError"] = json!("Capture unavailable");
        input["capture"]["preempted"] = json!(true);
        input["capture"]["framesR"] = json!(0);
        input["capture"]["nativeFields"] = Value::Null;
        input["capture"]["quality"] = Value::Null;
        input["capture"]["streamErrors"] = json!(["Stopped"]);
        input["capture"]["sampleIntegrity"]["nonFiniteL"] = json!(1);
        input["context"]["conditions"]["stationaryConfirmed"] = json!(false);
        input["context"]["support"]["deckPositionId"] = json!("other-position");
        input["context"]["setup"]["components"] = json!([null]);
        input["calibration"]["state"] = json!("unavailable");
        input["contextIssues"] = json!(["catalog_context_changed"]);
        assert_eq!(
            observation_issues(&input),
            vec![
                "analysis_unavailable",
                "capture_preempted",
                "capture_incomplete",
                "native_observation_missing",
                "capture_integrity_missing",
                "capture_integrity_failed",
                "non_finite_samples",
                "procedure_not_confirmed",
                "support_position_incompatible",
                "setup_context_unavailable",
                "calibration_context_unavailable",
                "catalog_context_changed"
            ]
        );
    }

    #[test]
    fn strict_method_geometry_finite_types_and_unknown_fields_reject_before_any_write() {
        let conn = mem();
        for (pointer, value) in [
            ("/schemaVersion", json!(2)),
            ("/rawAudioRetained", json!(true)),
            ("/analysis/method", json!("broadband-total")),
            ("/analysis/sampleRate", json!("4096")),
            ("/analysis/hop", json!(1024)),
            ("/analysis/candidateFrames", json!(122879)),
            ("/analysis/capturedFrames", json!(122879)),
            ("/analysis/capturedFrames", json!(143361)),
            ("/analysis/analyzedFrames", json!(122879)),
            ("/analysis/omittedFrames", json!(1)),
            ("/analysis/binHz", json!(2)),
            ("/analysis/windowSumSquares", json!(1024)),
            ("/analysis/overlapHz/0", json!(1)),
            ("/analysis/binIndices/0", json!(19)),
            ("/analysis/psdL/0", json!(1)),
            ("/analysis/segmentPowersL/0", json!(-1)),
            ("/analysis/powerL", json!("NaN")),
            ("/analysis/pairPower", Value::Null),
            ("/analysis/levelDbfsPair", json!(0)),
            ("/analysis/uncertainty/standard", json!(0.1)),
            ("/context/conditions/stationaryConfirmed", json!("true")),
            ("/calibration/applied", json!(true)),
        ] {
            let mut input = fixture()["observationA"].clone();
            *input.pointer_mut(pointer).unwrap() = value;
            assert!(save_observation(&conn, &input).is_err(), "{pointer}");
            assert!(raw_rows(&conn).is_empty());
        }
        for key in ["deltaDb", "verdict", "recordedAt", "contextIssues"] {
            let mut input = fixture()["observationA"].clone();
            input[key] = json!("caller-supplied");
            assert!(save_observation(&conn, &input)
                .unwrap_err()
                .contains("unsupported fields"));
        }
        let mut input = fixture()["observationA"].clone();
        input["analysis"]["extra"] = json!(true);
        assert!(normalize_observation(&input)
            .unwrap_err()
            .contains("unsupported fields"));
        assert!(serde_json::from_str::<Value>("{\"powerL\":1e400}").is_err());
    }

    #[test]
    fn exact_zero_cannot_be_relabelled_as_tiny_positive_power_and_small_real_power_is_preserved() {
        let mut zero = fixture()["observationA"].clone();
        for key in ["psdL", "psdR", "segmentPowersL", "segmentPowersR"] {
            for value in zero["analysis"][key].as_array_mut().unwrap() {
                *value = json!(0);
            }
        }
        for key in ["powerL", "powerR", "pairPower"] {
            zero["analysis"][key] = json!(0);
        }
        for key in ["levelDbfsL", "levelDbfsR", "levelDbfsPair"] {
            zero["analysis"][key] = Value::Null;
        }
        assert!(normalize_observation(&zero).is_ok());
        let result =
            compare_observations(&zero, &fixture()["observationB"], &fixture()["comparison"])
                .unwrap();
        assert_eq!(result["reasons"], json!(["zero_band_power"]));
        assert!(result["deltaDb"]["pair"].is_null());
        for key in ["powerL", "powerR", "pairPower"] {
            zero["analysis"][key] = json!(1e-15);
        }
        for key in ["levelDbfsL", "levelDbfsR", "levelDbfsPair"] {
            zero["analysis"][key] = json!(-150);
        }
        assert!(normalize_observation(&zero)
            .unwrap_err()
            .contains("power disagrees"));
        assert!(!close_power(0.0, f64::from_bits(1)));
        assert!(close_power(f64::from_bits(1), f64::from_bits(2)));
    }

    #[test]
    fn logarithmic_difference_remains_finite_when_a_power_ratio_would_overflow() {
        let fixture = fixture();
        let mut a = fixture["observationA"].clone();
        let mut b = fixture["observationB"].clone();
        for (row, factor) in [(&mut a, 1e-290), (&mut b, 1e290)] {
            for key in ["psdL", "psdR", "segmentPowersL", "segmentPowersR"] {
                for value in row["analysis"][key].as_array_mut().unwrap() {
                    *value = json!(value.as_f64().unwrap() * factor);
                }
            }
            for key in ["powerL", "powerR", "pairPower"] {
                row["analysis"][key] = json!(row["analysis"][key].as_f64().unwrap() * factor);
            }
            for (suffix, key) in [("L", "powerL"), ("R", "powerR"), ("Pair", "pairPower")] {
                row["analysis"][format!("levelDbfs{suffix}")] =
                    json!(10.0 * row["analysis"][key].as_f64().unwrap().log10());
            }
            normalize_observation(row).unwrap();
        }
        assert!((b["analysis"]["pairPower"].as_f64().unwrap()
            / a["analysis"]["pairPower"].as_f64().unwrap())
        .is_infinite());
        let result = compare_observations(&a, &b, &fixture["comparison"]).unwrap();
        assert_eq!(result["status"], "operator_reported_comparable");
        let expected = b["analysis"]["levelDbfsPair"].as_f64().unwrap()
            - a["analysis"]["levelDbfsPair"].as_f64().unwrap();
        assert!(result["deltaDb"]["pair"].as_f64().unwrap().is_finite());
        assert!((result["deltaDb"]["pair"].as_f64().unwrap() - expected).abs() < 1e-9);
    }

    #[test]
    fn original_legacy_keys_whitespace_and_json_text_survive_without_pruning() {
        let conn = mem();
        let mut input = fixture()["observationA"].clone();
        input["context"]["support"]["unrecognizedLegacy"] =
            json!({"nested":[false, null, " exact ", {"x":1}]});
        input["context"]["setup"]["old_notes"] = json!("  keep <tag> and whitespace  ");
        input["capture"]["legacyCounter"] = json!(17);
        let saved = save_observation(&conn, &input).unwrap();
        assert!(same(&selected_input(&saved, OBS_KEYS), &input));
        assert_eq!(saved["contextIssues"], json!([]));
        let before = raw_rows(&conn);
        let mut oversized = fixture()["observationB"].clone();
        oversized["context"]["support"]["notes"] = json!("x".repeat(EVIDENCE_BYTES));
        assert!(save_observation(&conn, &oversized)
            .unwrap_err()
            .contains("nothing was trimmed"));
        let mut nested = json!("leaf");
        for _ in 0..21 {
            nested = json!([nested]);
        }
        oversized = fixture()["observationB"].clone();
        oversized["context"]["support"]["legacy"] = nested;
        assert!(save_observation(&conn, &oversized)
            .unwrap_err()
            .contains("deeply nested"));
        assert_eq!(raw_rows(&conn), before);
    }

    #[test]
    fn timestamps_identifiers_filters_and_ordered_pair_references_are_strict() {
        let conn = mem();
        let fixture = fixture();
        for time in [
            "2026-02-29T00:00:00.000Z",
            "2026-11-18T24:00:00.000Z",
            "2026-11-18T12:00:00Z",
            "2026-11-18T12:00:00.000+00:00",
        ] {
            let mut input = fixture["observationA"].clone();
            input["capturedAt"] = json!(time);
            assert!(save_observation(&conn, &input).is_err(), "{time}");
        }
        assert!(valid_time("2000-02-29T23:59:59.999Z"));
        for id in ["", " leading", "trailing ", "bad\u{007f}id", "\u{feff}bom"] {
            assert!(get_observation(&conn, id).is_err(), "{id:?}");
        }
        for filter in [
            json!({"limit":0}),
            json!({"limit":101}),
            json!({"limit":true}),
            json!({"limit":"1"}),
            json!({"limit":1.5}),
            json!({"extra":1}),
            json!([]),
            Value::Null,
        ] {
            assert!(list(&conn, &filter).is_err(), "{filter}");
        }
        assert_eq!(list(&conn, &json!({"limit":null})).unwrap()["limit"], 50);
        assert_eq!(list(&conn, &json!({"limit":1.0})).unwrap()["limit"], 1);
        assert!(save_comparison(&conn, &fixture["comparison"])
            .unwrap_err()
            .contains("missing"));
        let mut wrong = fixture["comparison"].clone();
        wrong["observationBId"] = wrong["observationAId"].clone();
        assert!(save_comparison(&conn, &wrong)
            .unwrap_err()
            .contains("distinct"));
        save_observation(&conn, &fixture["observationA"]).unwrap();
        let mut b = fixture["observationB"].clone();
        b["pairId"] = json!("different-pair");
        save_observation(&conn, &b).unwrap();
        assert!(save_comparison(&conn, &fixture["comparison"])
            .unwrap_err()
            .contains("same ordered A/B pair"));
        wrong = fixture["comparison"].clone();
        wrong["result"] = json!({"status":"operator_reported_comparable"});
        assert!(save_comparison(&conn, &wrong)
            .unwrap_err()
            .contains("unsupported fields"));
    }

    #[test]
    fn native_reads_keep_unicode_scalar_order_totals_and_all_original_rows() {
        let conn = mem();
        for id in ["ä", "z", "\u{e000}", "𐀀"] {
            let mut row = fixture()["observationA"].clone();
            row["id"] = json!(id);
            save_observation(&conn, &row).unwrap();
        }
        let before = raw_rows(&conn);
        let changes = conn.total_changes();
        let history = list(&conn, &json!({"venueId":"venue-a", "limit":2})).unwrap();
        assert_eq!(history["observationTotal"], 4);
        assert_eq!(history["observations"][0]["id"], "𐀀");
        assert_eq!(history["observations"][1]["id"], "\u{e000}");
        assert_eq!(
            list(&conn, &json!({})).unwrap()["observations"][2]["id"],
            "ä"
        );
        assert_eq!(
            list(&conn, &json!({"venueId":"venue-b"})).unwrap()["observationTotal"],
            0
        );
        assert!(get_observation(&conn, "missing").unwrap().is_none());
        assert_eq!(conn.total_changes(), changes);
        assert_eq!(raw_rows(&conn), before);
    }

    #[test]
    fn setup_projection_sorts_components_but_keeps_original_array_order() {
        let conn = mem();
        conn.execute("INSERT INTO setup_component(id,setup_id,role,asset_id,position) VALUES ('component-b','setup-a','interface','asset-b','right')", []).unwrap();
        let mut input = fixture()["observationA"].clone();
        input["context"]["setup"]["components"].as_array_mut().unwrap().insert(0,
            json!({"id":"component-b", "role":"interface", "assetId":"asset-b", "position":"right", "settingsSnapshotId":null}));
        let saved = save_observation(&conn, &input).unwrap();
        assert_eq!(saved["contextIssues"], json!([]));
        assert_eq!(
            saved["context"]["setup"]["components"],
            input["context"]["setup"]["components"]
        );
        let mut b = fixture()["observationB"].clone();
        b["context"]["setup"]["components"] = input["context"]["setup"]["components"].clone();
        b["context"]["setup"]["components"]
            .as_array_mut()
            .unwrap()
            .reverse();
        assert_eq!(
            compare_observations(&input, &b, &fixture()["comparison"]).unwrap()["status"],
            "operator_reported_comparable"
        );
    }

    #[test]
    fn corrupt_rows_columns_and_derived_results_are_errors_without_history_repair() {
        for corruption in [
            "invalid-json",
            "changed-column",
            "forged-delta",
            "invalid-time",
            "invalid-context-issues",
        ] {
            let conn = mem();
            let (mut a, _, mut comparison) = save_pair(&conn);
            match corruption {
                "invalid-json" => {
                    conn.execute("UPDATE support_isolation_observation SET payload_json='{broken' WHERE id='observation-a'", []).unwrap();
                }
                "changed-column" => {
                    conn.execute("UPDATE support_isolation_observation SET venue_id='wrong' WHERE id='observation-a'", []).unwrap();
                }
                "forged-delta" => {
                    comparison["result"]["deltaDb"]["pair"] = json!(99);
                    conn.execute("UPDATE support_isolation_comparison SET payload_json=?1 WHERE id='comparison-one'", [comparison.to_string()]).unwrap();
                }
                "invalid-time" => {
                    a["recordedAt"] = json!("2026-02-29T12:00:00.000Z");
                    conn.execute("UPDATE support_isolation_observation SET payload_json=?1 WHERE id='observation-a'", [a.to_string()]).unwrap();
                }
                _ => {
                    a["contextIssues"] = json!(["caller-approved"]);
                    conn.execute("UPDATE support_isolation_observation SET payload_json=?1 WHERE id='observation-a'", [a.to_string()]).unwrap();
                }
            }
            let before = raw_rows(&conn);
            assert!(
                list(&conn, &json!({"venueId":"other", "limit":1}))
                    .unwrap_err()
                    .contains("SUPPORT_STORAGE"),
                "{corruption}"
            );
            assert!(get_observation(&conn, "missing").is_err(), "{corruption}");
            let mut new = fixture()["observationA"].clone();
            new["id"] = json!("new");
            assert!(save_observation(&conn, &new).is_err(), "{corruption}");
            assert_eq!(raw_rows(&conn), before);
        }
    }

    #[test]
    fn missing_comparison_sources_are_restricted_and_detected_if_storage_was_corrupted() {
        let conn = mem();
        save_pair(&conn);
        assert!(conn
            .execute(
                "DELETE FROM support_isolation_observation WHERE id='observation-a'",
                []
            )
            .is_err());
        conn.execute_batch("PRAGMA foreign_keys=OFF; DELETE FROM support_isolation_observation WHERE id='observation-a'; PRAGMA foreign_keys=ON;").unwrap();
        let before = raw_rows(&conn);
        assert!(list(&conn, &json!({}))
            .unwrap_err()
            .contains("source observation is missing"));
        assert!(get_observation(&conn, "observation-b").is_err());
        assert!(save_comparison(&conn, &fixture()["comparison"]).is_err());
        assert_eq!(raw_rows(&conn), before);
    }

    #[test]
    fn actual_late_uniqueness_violation_rolls_back_new_evidence_and_trigger_side_effects() {
        let conn = mem();
        save_observation(&conn, &fixture()["observationA"]).unwrap();
        let before = raw_rows(&conn);
        conn.execute_batch(
            "CREATE TABLE support_test_side_effect(id TEXT PRIMARY KEY);
            CREATE TRIGGER support_test_late_failure AFTER INSERT ON support_isolation_observation
            BEGIN
              INSERT INTO support_test_side_effect(id) VALUES (NEW.id);
              INSERT INTO support_isolation_observation
                SELECT * FROM support_isolation_observation WHERE id=NEW.id;
            END;",
        )
        .unwrap();
        let error = save_observation(&conn, &fixture()["observationB"]).unwrap_err();
        assert!(
            error.contains("SUPPORT_STORAGE") && error.contains("UNIQUE"),
            "{error}"
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM support_test_side_effect", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap(),
            0
        );
        assert_eq!(raw_rows(&conn), before);
        conn.execute_batch("DROP TRIGGER support_test_late_failure;")
            .unwrap();
        assert!(save_observation(&conn, &fixture()["observationB"]).is_ok());
        assert_eq!(list(&conn, &json!({})).unwrap()["observationTotal"], 2);
    }

    #[test]
    fn independent_connections_serialize_conflicting_ids_and_exact_retries() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "deckchek-support-isolation-{}-{nonce}.sqlite",
            std::process::id()
        ));
        let conn = Connection::open(&path).unwrap();
        initialize(&conn);
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let mut handles = Vec::new();
        for name in ["First submission", "Second submission"] {
            let path = path.clone();
            let barrier = barrier.clone();
            let mut input = fixture()["observationA"].clone();
            input["context"]["support"]["name"] = json!(name);
            handles.push(std::thread::spawn(move || {
                let conn = Connection::open(path).unwrap();
                conn.busy_timeout(std::time::Duration::from_secs(5))
                    .unwrap();
                conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
                barrier.wait();
                let result = save_observation(&conn, &input);
                (input, result)
            }));
        }
        let results: Vec<_> = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect();
        assert_eq!(
            results.iter().filter(|(_, result)| result.is_ok()).count(),
            1
        );
        assert_eq!(
            results
                .iter()
                .filter(|(_, result)| result
                    .as_ref()
                    .is_err_and(|error| error.contains("SUPPORT_CONFLICT")))
                .count(),
            1
        );
        let (input, saved) = results.iter().find(|(_, result)| result.is_ok()).unwrap();
        assert_eq!(
            save_observation(&conn, input).unwrap(),
            *saved.as_ref().unwrap()
        );
        assert_eq!(list(&conn, &json!({})).unwrap()["observationTotal"], 1);
        drop(conn);
        std::fs::remove_file(path).unwrap();
    }
    // Build valid retained history once; avoid measuring repeated append preflights.
    fn seed_retained_history(conn: &Connection, pairs: usize) -> (Value, Value, Value) {
        assert!(pairs > 0);
        let (mut a, mut b, mut comparison) = save_pair(conn);
        for row in [&mut a, &mut b, &mut comparison] {
            row["recordedAt"] = json!("2026-01-01T00:00:00.000Z");
        }
        let tx = Transaction::new_unchecked(conn, TransactionBehavior::Immediate).unwrap();
        tx.execute("DELETE FROM support_isolation_comparison", [])
            .unwrap();
        tx.execute("DELETE FROM support_isolation_observation", [])
            .unwrap();
        for index in 0..pairs {
            a["id"] = json!(format!("retained-a-{index:06}"));
            b["id"] = json!(format!("retained-b-{index:06}"));
            comparison["id"] = json!(format!("retained-c-{index:06}"));
            for row in [&mut a, &mut b, &mut comparison] {
                row["pairId"] = json!(format!("retained-pair-{index:06}"));
            }
            comparison["observationAId"] = a["id"].clone();
            comparison["observationBId"] = b["id"].clone();
            for row in [&a, &b] {
                tx.execute("INSERT INTO support_isolation_observation (id,pair_id,venue_id,setup_id,captured_at,recorded_at,payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                    params![row["id"].as_str(), row["pairId"].as_str(), row["venueId"].as_str(), row["setupId"].as_str(),
                        row["capturedAt"].as_str(), row["recordedAt"].as_str(), row.to_string()]).unwrap();
            }
            tx.execute("INSERT INTO support_isolation_comparison (id,pair_id,venue_id,setup_id,observation_a_id,observation_b_id,created_at,recorded_at,payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![comparison["id"].as_str(), comparison["pairId"].as_str(), comparison["venueId"].as_str(), comparison["setupId"].as_str(),
                    comparison["observationAId"].as_str(), comparison["observationBId"].as_str(), comparison["createdAt"].as_str(),
                    comparison["recordedAt"].as_str(), comparison.to_string()]).unwrap();
        }
        tx.commit().unwrap();
        (a, b, comparison)
    }

    #[test]
    fn retained_history_small_page_keeps_totals_full_sources_and_exact_retries() {
        let conn = mem();
        let (a, b, comparison) = seed_retained_history(&conn, 24);
        let before = raw_rows(&conn);
        let mut expanded = comparison.clone();
        expanded["observationA"] = a.clone();
        expanded["observationB"] = b.clone();
        assert_eq!(
            list(&conn, &json!({"venueId":"venue-a", "limit":1})).unwrap(),
            json!({"observations":[b.clone()], "comparisons":[expanded],
                "observationTotal":48, "comparisonTotal":24, "limit":1})
        );
        assert_eq!(
            get_observation(&conn, a["id"].as_str().unwrap()).unwrap(),
            Some(a.clone())
        );
        assert_eq!(
            save_observation(&conn, &selected_input(&a, OBS_KEYS)).unwrap(),
            a
        );
        assert_eq!(
            save_comparison(&conn, &selected_input(&comparison, CMP_KEYS)).unwrap(),
            comparison
        );
        let mut oldest = b;
        oldest["id"] = json!("retained-b-000000");
        oldest["pairId"] = json!("retained-pair-000000");
        assert_eq!(
            get_observation(&conn, "retained-b-000000").unwrap(),
            Some(oldest)
        );
        assert_eq!(
            list(&conn, &json!({"venueId":"venue-b", "limit":1})).unwrap(),
            json!({"observations":[], "comparisons":[], "observationTotal":0, "comparisonTotal":0, "limit":1})
        );
        assert_eq!(raw_rows(&conn), before);
    }

    #[test]
    fn retained_history_global_corruption_keeps_validation_phase_and_refusal_order() {
        fn every_operation_refuses(
            conn: &Connection,
            a: &Value,
            comparison: &Value,
            expected: &str,
        ) {
            let before = raw_rows(conn);
            assert_eq!(
                list(conn, &json!({"venueId":"venue-b", "limit":1})).unwrap_err(),
                expected
            );
            assert_eq!(get_observation(conn, "missing").unwrap_err(), expected);
            assert_eq!(
                save_observation(conn, &fixture()["observationA"]).unwrap_err(),
                expected
            );
            assert_eq!(
                save_comparison(conn, &fixture()["comparison"]).unwrap_err(),
                expected
            );
            assert_eq!(
                save_observation(conn, &selected_input(a, OBS_KEYS)).unwrap_err(),
                expected
            );
            assert_eq!(
                save_comparison(conn, &selected_input(comparison, CMP_KEYS)).unwrap_err(),
                expected
            );
            assert_eq!(raw_rows(conn), before);
        }
        let conn = mem();
        let (a, _, comparison) = seed_retained_history(&conn, 20);
        let old_a: String = conn.query_row("SELECT payload_json FROM support_isolation_observation WHERE id='retained-a-000000'", [], |row| row.get(0)).unwrap();
        let old_c: String = conn.query_row("SELECT payload_json FROM support_isolation_comparison WHERE id='retained-c-000000'", [], |row| row.get(0)).unwrap();
        let mut malformed: Value = serde_json::from_str(&old_c).unwrap();
        malformed["result"]["deltaDb"]["pair"] = json!("not a number");
        conn.execute(
            "UPDATE support_isolation_comparison SET payload_json=?1 WHERE id='retained-c-000000'",
            [malformed.to_string()],
        )
        .unwrap();
        let mut forged = comparison.clone();
        forged["result"]["deltaDb"]["pair"] = json!(99);
        conn.execute(
            "UPDATE support_isolation_comparison SET payload_json=?1 WHERE id=?2",
            params![forged.to_string(), forged["id"].as_str()],
        )
        .unwrap();
        let mut duplicate = comparison.clone();
        duplicate["id"] = json!("retained-a-000005");
        conn.execute("INSERT INTO support_isolation_comparison SELECT ?1,pair_id,venue_id,setup_id,observation_a_id,observation_b_id,created_at,recorded_at,?2 FROM support_isolation_comparison WHERE id=?3",
            params![duplicate["id"].as_str(), duplicate.to_string(), comparison["id"].as_str()]).unwrap();
        conn.execute("UPDATE support_isolation_observation SET payload_json='{invalid' WHERE id='retained-a-000000'", []).unwrap();
        let parse_error = storage(serde_json::from_str::<Value>("{invalid").unwrap_err());
        every_operation_refuses(&conn, &a, &comparison, &parse_error);
        conn.execute(
            "UPDATE support_isolation_observation SET payload_json=?1 WHERE id='retained-a-000000'",
            [&old_a],
        )
        .unwrap();
        every_operation_refuses(
            &conn,
            &a,
            &comparison,
            "SUPPORT_STORAGE: SUPPORT_INVALID: Invalid saved delta",
        );
        conn.execute(
            "UPDATE support_isolation_comparison SET payload_json=?1 WHERE id='retained-c-000000'",
            [&old_c],
        )
        .unwrap();
        every_operation_refuses(
            &conn,
            &a,
            &comparison,
            "SUPPORT_STORAGE: Duplicate immutable record ID",
        );
        conn.execute(
            "DELETE FROM support_isolation_comparison WHERE id='retained-a-000005'",
            [],
        )
        .unwrap();
        every_operation_refuses(
            &conn,
            &a,
            &comparison,
            "SUPPORT_STORAGE: SUPPORT_INVALID: Saved delta disagrees with original evidence",
        );
        conn.execute(
            "UPDATE support_isolation_comparison SET payload_json=?1 WHERE id=?2",
            params![comparison.to_string(), comparison["id"].as_str()],
        )
        .unwrap();
        conn.execute_batch("PRAGMA foreign_keys=OFF; DELETE FROM support_isolation_observation WHERE id='retained-a-000000'; PRAGMA foreign_keys=ON;").unwrap();
        every_operation_refuses(
            &conn,
            &a,
            &comparison,
            "SUPPORT_STORAGE: Comparison source observation is missing",
        );
    }

    #[test]
    fn retained_history_raw_whitespace_larger_than_evidence_limit_is_preserved() {
        let conn = mem();
        let (a, _, comparison) = save_pair(&conn);
        for (table, row) in [
            ("support_isolation_observation", &a),
            ("support_isolation_comparison", &comparison),
        ] {
            let encoded = row.to_string();
            assert!(encoded.len() < EVIDENCE_BYTES);
            let padded = format!("{}{}\n\t", " ".repeat(EVIDENCE_BYTES + 8192), encoded);
            assert!(padded.len() > EVIDENCE_BYTES);
            conn.execute(
                &format!("UPDATE {table} SET payload_json=?1 WHERE id=?2"),
                params![padded, row["id"].as_str()],
            )
            .unwrap();
        }
        let before = raw_rows(&conn);
        assert_eq!(
            get_observation(&conn, "observation-a").unwrap(),
            Some(a.clone())
        );
        assert_eq!(
            list(&conn, &json!({"limit":1})).unwrap()["comparisons"][0]["observationA"],
            a
        );
        assert_eq!(
            save_observation(&conn, &selected_input(&a, OBS_KEYS)).unwrap(),
            a
        );
        assert_eq!(
            save_comparison(&conn, &selected_input(&comparison, CMP_KEYS)).unwrap(),
            comparison
        );
        assert_eq!(raw_rows(&conn), before);
    }
}
