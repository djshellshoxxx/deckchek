//! System Health scans (Windows only). See docs/SYSTEM-CHECK-CONTRACT.md.
//!
//! Rust only collects raw data; the JS side interprets it. All parsing and
//! classification logic is platform independent so it can be unit tested on
//! any OS; only the PowerShell launch differs per platform.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const UNSUPPORTED: &str = "System Health scans require Windows.";
const PS_TIMEOUT: Duration = Duration::from_secs(30);
const PS_EVENTS_TIMEOUT: Duration = Duration::from_secs(45);
const MAX_EVENTS: usize = 300;
const MAX_MESSAGE_CHARS: usize = 2000;
const MAX_LINE_CHARS: usize = 400;
const MAX_MATCHES: usize = 50;
const TAIL_LINES: usize = 20;
const MAX_FILES_PER_APP: usize = 10;
const MAX_FILE_AGE_DAYS: u64 = 90;
const MAX_READ_BYTES: u64 = 2 * 1024 * 1024;
const MAX_WALK_DEPTH: usize = 3;
const MAX_WALK_ENTRIES: usize = 3000;

// ---------------------------------------------------------------- contract types

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DriverInfo {
    pub device_name: Option<String>,
    pub device_class: Option<String>,
    pub manufacturer: Option<String>,
    pub driver_provider: Option<String>,
    pub driver_version: Option<String>,
    pub driver_date: Option<String>,
    pub inf_name: Option<String>,
    pub hardware_id: Option<String>,
    pub is_signed: Option<bool>,
    pub signer: Option<String>,
    pub status: String,
    pub problem_code: Option<i64>,
    pub present: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AsioDriver {
    pub name: String,
    pub clsid: String,
    pub dll_path: Option<String>,
    pub dll_exists: bool,
    pub signature_status: Option<String>,
    pub signer: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverScan {
    pub supported: bool,
    pub scanned_at: String,
    pub drivers: Vec<DriverInfo>,
    pub asio_drivers: Vec<AsioDriver>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EventRecord {
    pub log: String,
    pub provider: String,
    pub event_id: i64,
    pub level: String,
    pub time_created: String,
    pub message: String,
    pub category: String,
    pub app_name: Option<String>,
    pub faulting_module: Option<String>,
    pub exception_code: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventScan {
    pub supported: bool,
    pub scanned_at: String,
    pub days: u32,
    pub events: Vec<EventRecord>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LogMatch {
    pub line_no: usize,
    pub line: String,
    pub severity: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    pub path: String,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjFile {
    pub path: String,
    pub kind: String,
    pub modified: String,
    pub size_bytes: u64,
    pub matches: Vec<LogMatch>,
    pub tail: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjApp {
    pub app: String,
    pub exe_names: Vec<String>,
    pub installed: bool,
    pub locations: Vec<Location>,
    pub files: Vec<DjFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjLogScan {
    pub supported: bool,
    pub scanned_at: String,
    pub apps: Vec<DjApp>,
    pub errors: Vec<String>,
}

// ---------------------------------------------------------------- time helpers

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Unix seconds -> `YYYY-MM-DDTHH:MM:SSZ`.
pub fn iso_from_unix(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let mut y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    if m <= 2 {
        y += 1;
    }
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m, d, rem / 3600, (rem % 3600) / 60, rem % 60)
}

fn system_time_secs(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub fn clamp_days(days: Option<i64>) -> u32 {
    days.unwrap_or(14).clamp(1, 90) as u32
}

// ---------------------------------------------------------------- process runner

/// Run a command, capturing stdout, killing it after `timeout`.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn run_with_timeout(mut cmd: Command, timeout: Duration) -> Result<String, String> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("failed to start process: {e}"))?;
    let mut out = child.stdout.take();
    let mut err = child.stderr.take();
    let t_out = std::thread::spawn(move || {
        let mut b = Vec::new();
        if let Some(s) = out.as_mut() {
            let _ = s.read_to_end(&mut b);
        }
        b
    });
    let t_err = std::thread::spawn(move || {
        let mut b = Vec::new();
        if let Some(s) = err.as_mut() {
            let _ = s.read_to_end(&mut b);
        }
        b
    });
    let start = Instant::now();
    let success = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.success(),
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("scan timed out after {} seconds", timeout.as_secs()));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => return Err(format!("failed waiting for process: {e}")),
        }
    };
    let stdout = decode_text(&t_out.join().unwrap_or_default());
    let stderr = decode_text(&t_err.join().unwrap_or_default());
    if success || !stdout.trim().is_empty() {
        Ok(stdout)
    } else {
        Err(format!("process failed: {}", truncate_chars(stderr.trim(), 400)))
    }
}

#[cfg(windows)]
fn run_ps(script: &str, timeout: Duration) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
    cmd.creation_flags(CREATE_NO_WINDOW);
    run_with_timeout(cmd, timeout)
}

#[cfg(not(windows))]
fn run_ps(_script: &str, _timeout: Duration) -> Result<String, String> {
    Err(UNSUPPORTED.to_string())
}

// ---------------------------------------------------------------- text helpers

/// Decode bytes: UTF-16 LE/BE with BOM, otherwise lossy UTF-8; strips a BOM.
pub fn decode_text(bytes: &[u8]) -> String {
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let u: Vec<u16> = bytes[2..].chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        return String::from_utf16_lossy(&u);
    }
    if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        let u: Vec<u16> = bytes[2..].chunks_exact(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
        return String::from_utf16_lossy(&u);
    }
    let b = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) { &bytes[3..] } else { bytes };
    String::from_utf8_lossy(b).into_owned()
}

/// Read up to the last `max_bytes` of an open file. The encoding is sniffed from the file head first: for
/// UTF-16 the seek is rounded to a code-unit boundary and the BOM is re-attached, so `decode_text` keeps
/// the right encoding for the tail.
pub fn read_tail_bytes(f: &mut std::fs::File, max_bytes: u64) -> std::io::Result<Vec<u8>> {
    let len = f.metadata()?.len();
    let mut bom = [0u8; 2];
    f.seek(SeekFrom::Start(0))?;
    let got = f.read(&mut bom)?;
    let utf16 = got == 2 && (bom == [0xFF, 0xFE] || bom == [0xFE, 0xFF]);
    let mut buf = Vec::new();
    if len > max_bytes {
        let mut start = len - max_bytes;
        if utf16 && start % 2 == 1 {
            start += 1;
        }
        f.seek(SeekFrom::Start(start))?;
        if utf16 {
            buf.extend_from_slice(&bom);
        }
    } else {
        f.seek(SeekFrom::Start(0))?;
    }
    f.take(max_bytes).read_to_end(&mut buf)?;
    Ok(buf)
}

pub fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        s.chars().take(max).collect()
    }
}

fn contains_word(hay_lower: &str, needle_lower: &str) -> bool {
    let mut from = 0;
    while let Some(i) = hay_lower[from..].find(needle_lower) {
        let s = from + i;
        let e = s + needle_lower.len();
        let before_ok = hay_lower[..s].chars().next_back().map_or(true, |c| !c.is_alphanumeric());
        let after_ok = hay_lower[e..].chars().next().map_or(true, |c| !c.is_alphanumeric());
        if before_ok && after_ok {
            return true;
        }
        from = s + needle_lower.chars().next().map_or(1, |c| c.len_utf8());
        if from >= hay_lower.len() {
            break;
        }
    }
    false
}

const VENDORS: &[&str] = &[
    "pioneer", "alphatheta", "denon", "inmusic", "native instruments", "serato", "rane", "numark",
    "reloop", "hercules", "allen & heath", "focusrite", "rme", "behringer", "roland", "steinberg",
    "yamaha", "audient", "motu", "presonus", "universal audio", "ecler", "mixars", "technics",
    "audio-technica", "rekordbox",
];

pub fn is_audio_vendor(text: &str) -> bool {
    let l = text.to_lowercase();
    VENDORS.iter().any(|v| contains_word(&l, v))
}

/// Lowercased name stems used to recognise DJ programs in app names/messages.
const DJ_STEMS: &[&str] = &["serato dj", "traktor", "rekordbox", "virtualdj", "mixxx", "djay", "engine dj"];

pub fn is_dj_program(text: &str) -> bool {
    let l = text.to_lowercase();
    DJ_STEMS.iter().any(|s| l.contains(s))
}

fn s_opt(v: &Value, key: &str) -> Option<String> {
    match v.get(key)? {
        Value::String(s) => {
            let t = s.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Array(a) => {
            let parts: Vec<String> = a.iter().filter_map(|x| x.as_str().map(|s| s.trim().to_string())).filter(|s| !s.is_empty()).collect();
            if parts.is_empty() { None } else { Some(parts.join(";")) }
        }
        _ => None,
    }
}

fn b_opt(v: &Value, key: &str) -> Option<bool> {
    match v.get(key)? {
        Value::Bool(b) => Some(*b),
        Value::String(s) => match s.to_lowercase().as_str() {
            "true" => Some(true),
            "false" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

fn i_opt(v: &Value, key: &str) -> Option<i64> {
    match v.get(key)? {
        Value::Number(n) => n.as_i64(),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
}

/// PowerShell emits a single object (not an array) for one item and nothing/null for none.
fn as_items(v: &Value) -> Vec<&Value> {
    match v {
        Value::Null => vec![],
        Value::Array(a) => a.iter().filter(|x| !x.is_null()).collect(),
        other => vec![other],
    }
}

fn parse_json_lenient(s: &str) -> Result<Value, String> {
    let t = s.trim().trim_start_matches('\u{feff}').trim();
    if t.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(t).map_err(|e| format!("could not parse scan output: {e}"))
}

// ---------------------------------------------------------------- drivers

const DRIVERS_SCRIPT: &str = r#"$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$errs = @()
$ents = @{}
try { Get-CimInstance Win32_PnPEntity | ForEach-Object { if ($_.DeviceID) { $ents[$_.DeviceID] = $_ } } } catch { $errs += ('PnPEntity: ' + $_.Exception.Message) }
$drv = @()
try {
  $drv = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceClass -in 'MEDIA','AudioEndpoint','USB','USBDevice','HIDClass','HID' } | ForEach-Object {
    $e = $ents[$_.DeviceID]
    $name = $_.DeviceName
    if (-not $name -and $e) { $name = $e.Name }
    $date = $null
    if ($_.DriverDate) { $date = $_.DriverDate.ToString('yyyy-MM-dd') }
    $hw = $null
    if ($_.HardWareID) { $hw = (@($_.HardWareID) -join ';') }
    $code = $null; $st = $null; $pres = $false
    if ($e) { $code = $e.ConfigManagerErrorCode; $st = $e.Status; $pres = [bool]$e.Present }
    [pscustomobject]@{ deviceName = $name; deviceClass = $_.DeviceClass; manufacturer = $_.Manufacturer; driverProvider = $_.DriverProviderName; driverVersion = $_.DriverVersion; driverDate = $date; infName = $_.InfName; hardwareId = $hw; isSigned = $_.IsSigned; signer = $_.Signer; problemCode = $code; entityStatus = $st; present = $pres }
  })
} catch { $errs += ('PnPSignedDriver: ' + $_.Exception.Message) }
$asio = @()
try {
  foreach ($root in 'HKLM:\SOFTWARE\ASIO', 'HKLM:\SOFTWARE\WOW6432Node\ASIO') {
    if (Test-Path $root) {
      foreach ($k in @(Get-ChildItem $root)) {
        $p = Get-ItemProperty $k.PSPath
        $clsid = [string]$p.CLSID
        $name = [string]$p.Description
        if (-not $name) { $name = $k.PSChildName }
        $dll = $null
        if ($clsid) {
          foreach ($cr in @(('Registry::HKEY_CLASSES_ROOT\CLSID\' + $clsid + '\InprocServer32'), ('HKLM:\SOFTWARE\Classes\WOW6432Node\CLSID\' + $clsid + '\InprocServer32'))) {
            if (-not $dll -and (Test-Path $cr)) { $dll = (Get-ItemProperty $cr).'(default)' }
          }
        }
        $exists = $false; $sst = $null; $sub = $null
        if ($dll) {
          $dll = [Environment]::ExpandEnvironmentVariables([string]$dll)
          $exists = [bool](Test-Path -LiteralPath $dll)
          if ($exists) {
            $sig = Get-AuthenticodeSignature -LiteralPath $dll
            if ($sig) { $sst = [string]$sig.Status; if ($sig.SignerCertificate) { $sub = [string]$sig.SignerCertificate.Subject } }
          }
        }
        $asio += [pscustomobject]@{ name = $name; clsid = $clsid; dllPath = $dll; dllExists = $exists; signatureStatus = $sst; signer = $sub }
      }
    }
  }
} catch { $errs += ('ASIO: ' + $_.Exception.Message) }
ConvertTo-Json -InputObject ([pscustomobject]@{ drivers = @($drv); asio = @($asio); errors = @($errs) }) -Depth 4 -Compress
"#;

pub fn is_audio_relevant_driver(class: &str, name: &str, manufacturer: &str) -> bool {
    let c = class.trim().to_lowercase();
    match c.as_str() {
        "media" | "audioendpoint" => true,
        "usb" | "usbdevice" | "hidclass" | "hid" => is_audio_vendor(name) || is_audio_vendor(manufacturer),
        _ => false,
    }
}

fn driver_status(problem: Option<i64>, status: Option<&str>) -> String {
    if matches!(problem, Some(c) if c != 0) {
        return "Error".into();
    }
    match status.map(|s| s.to_lowercase()).as_deref() {
        Some("ok") => "OK",
        Some("error") => "Error",
        Some("degraded") => "Degraded",
        _ => "Unknown",
    }
    .into()
}

pub fn parse_drivers_output(raw: &str) -> Result<(Vec<DriverInfo>, Vec<AsioDriver>, Vec<String>), String> {
    let v = parse_json_lenient(raw)?;
    let mut drivers = Vec::new();
    for d in as_items(v.get("drivers").unwrap_or(&Value::Null)) {
        let class = s_opt(d, "deviceClass");
        let name = s_opt(d, "deviceName");
        let manu = s_opt(d, "manufacturer");
        if !is_audio_relevant_driver(
            class.as_deref().unwrap_or(""),
            name.as_deref().unwrap_or(""),
            manu.as_deref().unwrap_or(""),
        ) {
            continue;
        }
        let problem = i_opt(d, "problemCode");
        let status = driver_status(problem, s_opt(d, "entityStatus").as_deref());
        drivers.push(DriverInfo {
            device_name: name,
            device_class: class,
            manufacturer: manu,
            driver_provider: s_opt(d, "driverProvider"),
            driver_version: s_opt(d, "driverVersion"),
            driver_date: s_opt(d, "driverDate"),
            inf_name: s_opt(d, "infName"),
            hardware_id: s_opt(d, "hardwareId"),
            is_signed: b_opt(d, "isSigned"),
            signer: s_opt(d, "signer"),
            status,
            problem_code: problem,
            present: b_opt(d, "present").unwrap_or(false),
        });
    }
    let mut asio: Vec<AsioDriver> = Vec::new();
    for a in as_items(v.get("asio").unwrap_or(&Value::Null)) {
        let name = s_opt(a, "name").unwrap_or_default();
        let clsid = s_opt(a, "clsid").unwrap_or_default();
        if asio.iter().any(|x| x.name.eq_ignore_ascii_case(&name) && x.clsid.eq_ignore_ascii_case(&clsid)) {
            continue; // same driver registered in both registry views
        }
        asio.push(AsioDriver {
            name,
            clsid,
            dll_path: s_opt(a, "dllPath"),
            dll_exists: b_opt(a, "dllExists").unwrap_or(false),
            signature_status: s_opt(a, "signatureStatus"),
            signer: s_opt(a, "signer"),
        });
    }
    let errors = as_items(v.get("errors").unwrap_or(&Value::Null))
        .into_iter()
        .filter_map(|e| e.as_str().map(|s| s.to_string()))
        .collect();
    Ok((drivers, asio, errors))
}

pub fn scan_drivers() -> DriverScan {
    let mut scan = DriverScan { supported: cfg!(windows), scanned_at: iso_from_unix(now_secs()), drivers: vec![], asio_drivers: vec![], errors: vec![] };
    if !cfg!(windows) {
        scan.errors.push(UNSUPPORTED.into());
        return scan;
    }
    match run_ps(DRIVERS_SCRIPT, PS_TIMEOUT).and_then(|o| parse_drivers_output(&o)) {
        Ok((d, a, e)) => {
            scan.drivers = d;
            scan.asio_drivers = a;
            scan.errors = e;
        }
        Err(e) => scan.errors.push(e),
    }
    scan
}

// ---------------------------------------------------------------- events

const EVENTS_SCRIPT_TEMPLATE: &str = r#"$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$start = (Get-Date).AddDays(-@@DAYS@@)
$out = New-Object System.Collections.ArrayList
function Add-Ev($log, $filter) {
  $evs = @(Get-WinEvent -FilterHashtable $filter -MaxEvents 1000 -ErrorAction SilentlyContinue)
  foreach ($e in $evs) {
    if (-not $e) { continue }
    $props = @()
    try { foreach ($p in ($e.Properties | Select-Object -First 10)) { $props += [string]$p.Value } } catch {}
    $msg = ''
    try { $msg = [string]$e.Message } catch {}
    if ($msg.Length -gt 2000) { $msg = $msg.Substring(0, 2000) }
    [void]$out.Add([pscustomobject]@{ log = $log; provider = [string]$e.ProviderName; eventId = [int]$e.Id; level = [int]$e.Level; timeCreated = $e.TimeCreated.ToUniversalTime().ToString('o'); message = $msg; props = @($props) })
  }
}
foreach ($prov in 'Microsoft-Windows-Audio', 'AudioSrv', 'Microsoft-Windows-Kernel-PnP', 'Microsoft-Windows-UserPnp', 'USBHUB3', 'USBHUB', 'USBXHCI', 'usbaudio', 'usbaudio2', 'portcls') {
  Add-Ev 'System' @{ LogName = 'System'; ProviderName = $prov; Level = 1, 2, 3; StartTime = $start }
}
Add-Ev 'System' @{ LogName = 'System'; ProviderName = 'Service Control Manager'; Id = 7000, 7001, 7009, 7011, 7023, 7024, 7031, 7034; Level = 1, 2, 3; StartTime = $start }
Add-Ev 'Application' @{ LogName = 'Application'; Id = 1000, 1002; Level = 1, 2, 3; StartTime = $start }
Add-Ev 'Application' @{ LogName = 'Application'; ProviderName = 'Windows Error Reporting'; Id = 1001; StartTime = $start }
ConvertTo-Json -InputObject @($out) -Depth 4 -Compress
"#;

pub fn build_events_script(days: u32) -> String {
    EVENTS_SCRIPT_TEMPLATE.replace("@@DAYS@@", &days.clamp(1, 90).to_string())
}

fn is_audio_service_text(lower: &str) -> bool {
    lower.contains("audiosrv") || lower.contains("audioendpointbuilder") || lower.contains("windows audio")
}

/// Service Control Manager entries are only kept when they concern audio services or audio vendors.
pub fn is_scm_relevant(message: &str) -> bool {
    let l = message.to_lowercase();
    is_audio_service_text(&l) || is_audio_vendor(message)
}

pub fn categorize_event(log: &str, provider: &str, message: &str) -> &'static str {
    if log.eq_ignore_ascii_case("Application") {
        return "djApp";
    }
    let p = provider.to_lowercase();
    if p == "service control manager" {
        return if is_audio_service_text(&message.to_lowercase()) { "audio" } else { "driver" };
    }
    if p.contains("usbaudio") || p.contains("usbhub") || p.contains("usbxhci") {
        "usb"
    } else if p.contains("audio") || p.contains("portcls") {
        "audio"
    } else if p.contains("kernel-pnp") || p.contains("userpnp") {
        "driver"
    } else {
        "other"
    }
}

fn label_value(message: &str, label: &str) -> Option<String> {
    let lm = message.to_lowercase();
    let ll = label.to_lowercase();
    let i = lm.find(&ll)?;
    let rest = message.get(i + label.len()..)?;
    let line = rest.lines().next()?;
    let v = line.split(',').next()?.trim();
    if v.is_empty() { None } else { Some(v.to_string()) }
}

fn normalize_exception_code(raw: &str) -> String {
    let t = raw.trim();
    let lower = t.to_lowercase();
    let body = lower.strip_prefix("0x").unwrap_or(&lower);
    if !body.is_empty() && body.chars().all(|c| c.is_ascii_hexdigit()) {
        format!("0x{}", body)
    } else {
        t.to_string()
    }
}

fn prop(props: &[String], i: usize) -> Option<String> {
    props.get(i).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// (appName, faultingModule, exceptionCode) for Application Error/Hang/WER events.
pub fn extract_app_info(event_id: i64, props: &[String], message: &str) -> (Option<String>, Option<String>, Option<String>) {
    let (mut app, mut module, mut code) = (None, None, None);
    match event_id {
        1000 => {
            app = prop(props, 0);
            module = prop(props, 3);
            code = prop(props, 6);
        }
        1002 => app = prop(props, 0),
        _ => {}
    }
    if app.is_none() {
        app = label_value(message, "Faulting application name:")
            .or_else(|| {
                let m = label_value(message, "The program ")?;
                m.split(" version ").next().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
            })
            .or_else(|| if message.contains("APPCRASH") || message.contains("APPHANG") { label_value(message, "P1:") } else { None });
    }
    if module.is_none() {
        module = label_value(message, "Faulting module name:")
            .or_else(|| if message.contains("APPCRASH") { label_value(message, "P4:") } else { None });
    }
    if code.is_none() {
        code = label_value(message, "Exception code:")
            .or_else(|| if message.contains("APPCRASH") { label_value(message, "P7:") } else { None });
    }
    (app, module, code.map(|c| normalize_exception_code(&c)))
}

pub fn parse_events_output(raw: &str) -> Result<Vec<EventRecord>, String> {
    let v = parse_json_lenient(raw)?;
    let mut out = Vec::new();
    for e in as_items(&v) {
        let log = s_opt(e, "log").unwrap_or_default();
        let provider = s_opt(e, "provider").unwrap_or_default();
        let event_id = i_opt(e, "eventId").unwrap_or(0);
        let message = e.get("message").and_then(|m| m.as_str()).unwrap_or("").to_string();
        let props: Vec<String> = as_items(e.get("props").unwrap_or(&Value::Null))
            .into_iter()
            .map(|p| p.as_str().map(|s| s.to_string()).unwrap_or_else(|| p.to_string()))
            .collect();
        let is_app = log.eq_ignore_ascii_case("Application");
        let (app, module, code) = if is_app { extract_app_info(event_id, &props, &message) } else { (None, None, None) };
        if is_app {
            let hay = format!("{} {}", app.as_deref().unwrap_or(""), message);
            if !is_dj_program(&hay) {
                continue;
            }
        } else if provider.eq_ignore_ascii_case("Service Control Manager") && !is_scm_relevant(&message) {
            continue;
        }
        let level = match i_opt(e, "level").unwrap_or(3) {
            1 => "Critical",
            2 => "Error",
            _ => "Warning",
        };
        out.push(EventRecord {
            category: categorize_event(&log, &provider, &message).to_string(),
            log,
            provider,
            event_id,
            level: level.into(),
            time_created: s_opt(e, "timeCreated").unwrap_or_default(),
            message: truncate_chars(&message, MAX_MESSAGE_CHARS),
            app_name: app,
            faulting_module: module,
            exception_code: code,
        });
    }
    out.sort_by(|a, b| b.time_created.cmp(&a.time_created));
    out.truncate(MAX_EVENTS);
    Ok(out)
}

pub fn scan_events(days: Option<i64>) -> EventScan {
    let days = clamp_days(days);
    let mut scan = EventScan { supported: cfg!(windows), scanned_at: iso_from_unix(now_secs()), days, events: vec![], errors: vec![] };
    if !cfg!(windows) {
        scan.errors.push(UNSUPPORTED.into());
        return scan;
    }
    match run_ps(&build_events_script(days), PS_EVENTS_TIMEOUT).and_then(|o| parse_events_output(&o)) {
        Ok(e) => scan.events = e,
        Err(e) => scan.errors.push(e),
    }
    scan
}

// ---------------------------------------------------------------- DJ logs: line/WER parsing

/// Case-insensitive keyword classification of one log line.
pub fn classify_line(line: &str) -> Option<&'static str> {
    let l = line.to_lowercase();
    const CRASH: &[&str] = &["crash", "fatal", "unhandled exception", "access violation", "segfault", "abort"];
    const ERROR: &[&str] = &["error", "failed", "exception", "timeout", "dropout", "underrun", "overrun", "buffer", "disconnected", "not responding", "asio"];
    if CRASH.iter().any(|k| l.contains(k)) {
        Some("crash")
    } else if ERROR.iter().any(|k| l.contains(k)) {
        Some("error")
    } else if l.contains("warn") {
        Some("warning")
    } else {
        None
    }
}

/// Matches (last `MAX_MATCHES`, file order) and tail for decoded log text.
pub fn analyze_text(text: &str) -> (Vec<LogMatch>, Vec<String>) {
    let lines: Vec<&str> = text.lines().collect();
    let mut matches: Vec<LogMatch> = lines
        .iter()
        .enumerate()
        .filter_map(|(i, l)| {
            classify_line(l).map(|sev| LogMatch { line_no: i + 1, line: truncate_chars(l.trim(), MAX_LINE_CHARS), severity: sev.into() })
        })
        .collect();
    if matches.len() > MAX_MATCHES {
        matches.drain(..matches.len() - MAX_MATCHES);
    }
    let start = lines.len().saturating_sub(TAIL_LINES);
    let tail = lines[start..].iter().map(|l| truncate_chars(l, MAX_LINE_CHARS)).collect();
    (matches, tail)
}

#[derive(Debug, Default, PartialEq)]
pub struct WerInfo {
    pub app: Option<String>,
    pub module: Option<String>,
    pub exception_code: Option<String>,
}

/// Parse a Report.wer (already decoded): `Sig[n].Name=` / `Sig[n].Value=` pairs plus AppPath.
pub fn parse_wer(text: &str) -> WerInfo {
    let mut names: HashMap<String, String> = HashMap::new();
    let mut values: HashMap<String, String> = HashMap::new();
    let mut app_path = None;
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("Sig[") {
            if let Some((idx, tail)) = rest.split_once(']') {
                if let Some(n) = tail.strip_prefix(".Name=") {
                    names.insert(idx.to_string(), n.trim().to_string());
                } else if let Some(v) = tail.strip_prefix(".Value=") {
                    values.insert(idx.to_string(), v.trim().to_string());
                }
            }
        } else if let Some(p) = line.strip_prefix("AppPath=") {
            app_path = Some(p.trim().to_string());
        }
    }
    let find = |label: &str| -> Option<String> {
        names
            .iter()
            .find(|(_, n)| n.eq_ignore_ascii_case(label))
            .and_then(|(i, _)| values.get(i))
            .filter(|v| !v.is_empty())
            .cloned()
    };
    let app = find("Application Name").or_else(|| {
        app_path.as_ref().and_then(|p| p.rsplit(['\\', '/']).next().map(|s| s.to_string())).filter(|s| !s.is_empty())
    });
    WerInfo {
        app,
        module: find("Fault Module Name"),
        exception_code: find("Exception Code").map(|c| normalize_exception_code(&c)),
    }
}

pub fn wer_match(info: &WerInfo, is_hang: bool) -> Option<LogMatch> {
    if info.app.is_none() && info.module.is_none() && info.exception_code.is_none() {
        return None;
    }
    let line = format!(
        "{}: {}, faulting module: {}, exception code: {}",
        if is_hang { "Application hang" } else { "Application crash" },
        info.app.as_deref().unwrap_or("unknown"),
        info.module.as_deref().unwrap_or("unknown"),
        info.exception_code.as_deref().unwrap_or("unknown"),
    );
    Some(LogMatch { line_no: 1, line, severity: if is_hang { "error" } else { "crash" }.into() })
}

// ---------------------------------------------------------------- DJ logs: paths and files

pub struct AppSpec {
    pub name: &'static str,
    pub exes: &'static [&'static str],
    /// Install directories (glob `*` allowed in a segment).
    pub install: &'static [&'static str],
    /// App data roots; their existence also marks the app as installed.
    pub data: &'static [&'static str],
    /// Extra folders scanned for logs/crash files only.
    pub logs: &'static [&'static str],
}

pub const APPS: &[AppSpec] = &[
    AppSpec { name: "Serato DJ Pro", exes: &["Serato DJ Pro.exe"], install: &["%PROGRAMFILES%\\Serato\\Serato DJ Pro"], data: &[], logs: &["%MUSIC%\\_Serato_\\Logs", "%LOCALAPPDATA%\\Serato"] },
    AppSpec { name: "Serato DJ Lite", exes: &["Serato DJ Lite.exe"], install: &["%PROGRAMFILES%\\Serato\\Serato DJ Lite"], data: &[], logs: &["%MUSIC%\\_Serato_\\Logs", "%LOCALAPPDATA%\\Serato"] },
    AppSpec { name: "Traktor Pro", exes: &["Traktor.exe", "Traktor Pro 3.exe", "Traktor Pro 4.exe"], install: &["%PROGRAMFILES%\\Native Instruments\\Traktor Pro*"], data: &["%DOCUMENTS%\\Native Instruments\\Traktor *"], logs: &["%LOCALAPPDATA%\\Native Instruments\\Traktor*", "%APPDATA%\\Native Instruments\\Traktor*"] },
    AppSpec { name: "rekordbox", exes: &["rekordbox.exe", "rekordboxAgent.exe"], install: &["%PROGRAMFILES%\\rekordbox\\rekordbox*", "%PROGRAMFILES%\\Pioneer\\rekordbox*"], data: &["%APPDATA%\\Pioneer\\rekordbox*"], logs: &["%LOCALAPPDATA%\\Pioneer"] },
    AppSpec { name: "VirtualDJ", exes: &["VirtualDJ.exe"], install: &["%PROGRAMFILES%\\VirtualDJ", "%LOCALAPPDATA%\\VirtualDJ"], data: &["%DOCUMENTS%\\VirtualDJ"], logs: &[] },
    AppSpec { name: "Mixxx", exes: &["mixxx.exe"], install: &["%PROGRAMFILES%\\Mixxx*"], data: &["%LOCALAPPDATA%\\Mixxx"], logs: &[] },
    AppSpec { name: "djay Pro", exes: &["djay.exe", "djay Pro AI.exe", "djay Pro.exe"], install: &["%PROGRAMFILES%\\Algoriddim\\*"], data: &["%LOCALAPPDATA%\\Algoriddim", "%APPDATA%\\Algoriddim", "%DOCUMENTS%\\Algoriddim", "%LOCALAPPDATA%\\Packages\\Algoriddim*"], logs: &[] },
    AppSpec { name: "Engine DJ", exes: &["Engine DJ.exe"], install: &["%PROGRAMFILES%\\inMusic\\Engine DJ*", "%PROGRAMFILES%\\Denon DJ\\Engine*"], data: &["%LOCALAPPDATA%\\Engine DJ", "%APPDATA%\\Engine DJ", "%APPDATA%\\inMusic", "%LOCALAPPDATA%\\inMusic", "%APPDATA%\\Denon DJ", "%DOCUMENTS%\\Engine DJ"], logs: &[] },
];

pub type EnvMap = HashMap<String, String>;

/// Build the env map from the process environment (keys upper-case), adding
/// DOCUMENTS/MUSIC (profile folders) and *_OD variants for OneDrive redirection.
pub fn env_from_process() -> EnvMap {
    let mut m = EnvMap::new();
    for k in ["USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "ONEDRIVE"] {
        if let Ok(v) = std::env::var(k) {
            if !v.is_empty() {
                m.insert(k.to_string(), v);
            }
        }
    }
    add_known_folders(&mut m);
    m
}

pub fn add_known_folders(m: &mut EnvMap) {
    if let Some(up) = m.get("USERPROFILE").cloned() {
        m.entry("DOCUMENTS".into()).or_insert_with(|| Path::new(&up).join("Documents").to_string_lossy().into_owned());
        m.entry("MUSIC".into()).or_insert_with(|| Path::new(&up).join("Music").to_string_lossy().into_owned());
    }
    if let Some(od) = m.get("ONEDRIVE").cloned() {
        m.insert("DOCUMENTS_OD".into(), Path::new(&od).join("Documents").to_string_lossy().into_owned());
        m.insert("MUSIC_OD".into(), Path::new(&od).join("Music").to_string_lossy().into_owned());
    }
}

/// Expand `%TOKEN%\a\b` (token only as first segment). `None` if the token is unknown.
pub fn expand_template(t: &str, env: &EnvMap) -> Option<PathBuf> {
    let mut segs = t.split('\\');
    let first = segs.next()?;
    let mut p = if first.len() > 2 && first.starts_with('%') && first.ends_with('%') {
        PathBuf::from(env.get(&first[1..first.len() - 1].to_uppercase())?)
    } else {
        PathBuf::from(first)
    };
    for s in segs {
        p.push(s);
    }
    Some(p)
}

/// Template plus its OneDrive-redirected variant for Documents/Music folders.
pub fn template_variants(t: &str) -> Vec<String> {
    let mut v = vec![t.to_string()];
    if t.starts_with("%DOCUMENTS%") {
        v.push(t.replacen("%DOCUMENTS%", "%DOCUMENTS_OD%", 1));
    } else if t.starts_with("%MUSIC%") {
        v.push(t.replacen("%MUSIC%", "%MUSIC_OD%", 1));
    }
    v
}

pub fn glob_match(pattern: &str, text: &str) -> bool {
    fn go(p: &[char], t: &[char]) -> bool {
        match p.split_first() {
            None => t.is_empty(),
            Some(('*', rest)) => (0..=t.len()).any(|i| go(rest, &t[i..])),
            Some((c, rest)) => t.first().map_or(false, |x| x == c) && go(rest, &t[1..]),
        }
    }
    let p: Vec<char> = pattern.to_lowercase().chars().collect();
    let t: Vec<char> = text.to_lowercase().chars().collect();
    go(&p, &t)
}

/// Resolve `*` wildcards in path segments against the file system.
pub fn resolve_glob(path: &Path) -> Vec<PathBuf> {
    let mut frontier: Vec<PathBuf> = vec![PathBuf::new()];
    for comp in path.components() {
        let seg = comp.as_os_str().to_string_lossy().into_owned();
        let mut next = Vec::new();
        for base in &frontier {
            if seg.contains('*') {
                if let Ok(rd) = std::fs::read_dir(base) {
                    for e in rd.flatten() {
                        if glob_match(&seg, &e.file_name().to_string_lossy()) {
                            next.push(e.path());
                        }
                    }
                }
            } else {
                next.push(base.join(&seg));
            }
        }
        frontier = next;
    }
    frontier.sort();
    frontier
}

fn resolve_templates(templates: &[&str], env: &EnvMap) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    for t in templates {
        for v in template_variants(t) {
            if let Some(p) = expand_template(&v, env) {
                let resolved = resolve_glob(&p);
                // keep an unresolved literal (no wildcard) so "exists: false" is reported
                let list = if resolved.is_empty() && !v.contains('*') { vec![p] } else { resolved };
                for r in list {
                    if !out.contains(&r) {
                        out.push(r);
                    }
                }
            }
        }
    }
    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    Log,
    CrashDump,
    CrashReport,
}

impl FileKind {
    fn as_str(self) -> &'static str {
        match self {
            FileKind::Log => "log",
            FileKind::CrashDump => "crashDump",
            FileKind::CrashReport => "crashReport",
        }
    }
}

pub fn classify_file_name(name: &str) -> Option<FileKind> {
    let l = name.to_lowercase();
    let ext = l.rsplit_once('.').map(|(_, e)| e).unwrap_or("");
    if ext == "dmp" {
        Some(FileKind::CrashDump)
    } else if l.contains("crash") && matches!(ext, "log" | "txt" | "json" | "xml" | "wer" | "") {
        Some(FileKind::CrashReport)
    } else if ext == "log" || (ext == "txt" && l.contains("log")) {
        Some(FileKind::Log)
    } else {
        None
    }
}

#[derive(Debug, Clone)]
pub struct Candidate {
    pub path: PathBuf,
    pub kind: FileKind,
    pub modified_secs: u64,
    pub size: u64,
}

fn candidate_for(path: &Path, kind: FileKind) -> Option<Candidate> {
    let md = std::fs::metadata(path).ok()?;
    if !md.is_file() {
        return None;
    }
    Some(Candidate { path: path.to_path_buf(), kind, modified_secs: md.modified().map(system_time_secs).unwrap_or(0), size: md.len() })
}

fn walk(dir: &Path, depth: usize, budget: &mut usize, out: &mut Vec<Candidate>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        if *budget == 0 {
            return;
        }
        *budget -= 1;
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_symlink() {
            continue;
        }
        let p = e.path();
        if ft.is_dir() {
            if depth < MAX_WALK_DEPTH {
                walk(&p, depth + 1, budget, out);
            }
        } else if let Some(kind) = classify_file_name(&e.file_name().to_string_lossy()) {
            if let Some(c) = candidate_for(&p, kind) {
                out.push(c);
            }
        }
    }
}

/// Log/crash candidates under a root, up to depth 3.
pub fn collect_under_root(root: &Path) -> Vec<Candidate> {
    let mut out = Vec::new();
    let mut budget = MAX_WALK_ENTRIES;
    walk(root, 0, &mut budget, &mut out);
    out
}

/// `<CrashDumps>/<exe>*.dmp`
pub fn collect_crash_dumps(dir: &Path, exes: &[&str]) -> Vec<Candidate> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(dir) else { return out };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_lowercase();
        if name.ends_with(".dmp") && exes.iter().any(|x| name.starts_with(&x.to_lowercase())) {
            if let Some(c) = candidate_for(&e.path(), FileKind::CrashDump) {
                out.push(c);
            }
        }
    }
    out
}

/// WER `AppCrash_<exe>*` / `AppHang_<exe>*` folders -> their Report.wer.
pub fn collect_wer(dir: &Path, exes: &[&str]) -> Vec<Candidate> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(dir) else { return out };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_lowercase();
        let hit = exes.iter().any(|x| {
            let x = x.to_lowercase();
            name.starts_with(&format!("appcrash_{x}")) || name.starts_with(&format!("apphang_{x}"))
        });
        if hit {
            if let Some(c) = candidate_for(&e.path().join("Report.wer"), FileKind::CrashReport) {
                out.push(c);
            }
        }
    }
    out
}

/// Keep recent files only (<= `max_age_days`), dedupe, newest first, at most `limit`.
pub fn select_files(mut cands: Vec<Candidate>, now: u64, max_age_days: u64, limit: usize) -> Vec<Candidate> {
    let cutoff = now.saturating_sub(max_age_days * 86_400);
    cands.retain(|c| c.modified_secs >= cutoff);
    cands.sort_by(|a, b| b.modified_secs.cmp(&a.modified_secs).then_with(|| a.path.cmp(&b.path)));
    let mut seen: Vec<PathBuf> = Vec::new();
    cands.retain(|c| {
        if seen.contains(&c.path) {
            false
        } else {
            seen.push(c.path.clone());
            true
        }
    });
    cands.truncate(limit);
    cands
}

/// Read the last `max_bytes` of a file as text (dropping a partial first line).
fn read_tail_text(path: &Path, max_bytes: u64) -> Result<String, String> {
    let mut f = std::fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let truncated = len > max_bytes;
    let buf = read_tail_bytes(&mut f, max_bytes).map_err(|e| format!("{}: {e}", path.display()))?;
    let text = decode_text(&buf);
    if truncated {
        Ok(match text.find('\n') {
            Some(i) => text[i + 1..].to_string(),
            None => text,
        })
    } else {
        Ok(text)
    }
}

fn analyze_candidate(c: &Candidate) -> Result<DjFile, String> {
    let (matches, tail) = match c.kind {
        FileKind::CrashDump => (vec![], vec![]),
        FileKind::Log => analyze_text(&read_tail_text(&c.path, MAX_READ_BYTES)?),
        FileKind::CrashReport => {
            let text = read_tail_text(&c.path, MAX_READ_BYTES)?;
            let is_wer = c.path.file_name().map_or(false, |n| n.to_string_lossy().eq_ignore_ascii_case("Report.wer"));
            if is_wer {
                let hang = c.path.parent().and_then(|p| p.file_name()).map_or(false, |n| n.to_string_lossy().to_lowercase().starts_with("apphang_"));
                (wer_match(&parse_wer(&text), hang).into_iter().collect(), vec![])
            } else {
                (analyze_text(&text).0, vec![])
            }
        }
    };
    Ok(DjFile {
        path: c.path.to_string_lossy().into_owned(),
        kind: c.kind.as_str().into(),
        modified: iso_from_unix(c.modified_secs),
        size_bytes: c.size,
        matches,
        tail,
    })
}

pub fn scan_dj_logs_with(env: &EnvMap, now: u64) -> DjLogScan {
    let mut errors = Vec::new();
    let crash_dumps = resolve_templates(&["%LOCALAPPDATA%\\CrashDumps"], env);
    let wer_dirs = resolve_templates(
        &[
            "%PROGRAMDATA%\\Microsoft\\Windows\\WER\\ReportArchive",
            "%PROGRAMDATA%\\Microsoft\\Windows\\WER\\ReportQueue",
            "%LOCALAPPDATA%\\Microsoft\\Windows\\WER\\ReportArchive",
            "%LOCALAPPDATA%\\Microsoft\\Windows\\WER\\ReportQueue",
        ],
        env,
    );
    let mut apps = Vec::new();
    for spec in APPS {
        let installs = resolve_templates(spec.install, env);
        let data = resolve_templates(spec.data, env);
        let logs = resolve_templates(spec.logs, env);
        let installed = installs.iter().any(|p| p.is_dir()) || data.iter().any(|p| p.is_dir());
        let mut locations: Vec<Location> = Vec::new();
        for p in data.iter().chain(logs.iter()) {
            locations.push(Location { path: p.to_string_lossy().into_owned(), exists: p.exists() });
        }
        let mut cands = Vec::new();
        for root in data.iter().chain(logs.iter()).filter(|p| p.is_dir()) {
            cands.extend(collect_under_root(root));
        }
        for d in &crash_dumps {
            cands.extend(collect_crash_dumps(d, spec.exes));
        }
        for d in &wer_dirs {
            cands.extend(collect_wer(d, spec.exes));
        }
        let mut files = Vec::new();
        for c in select_files(cands, now, MAX_FILE_AGE_DAYS, MAX_FILES_PER_APP) {
            match analyze_candidate(&c) {
                Ok(f) => files.push(f),
                Err(e) => errors.push(e),
            }
        }
        apps.push(DjApp { app: spec.name.into(), exe_names: spec.exes.iter().map(|s| s.to_string()).collect(), installed, locations, files });
    }
    DjLogScan { supported: true, scanned_at: iso_from_unix(now), apps, errors }
}

pub fn scan_dj_logs() -> DjLogScan {
    if !cfg!(windows) {
        return DjLogScan { supported: false, scanned_at: iso_from_unix(now_secs()), apps: vec![], errors: vec![UNSUPPORTED.into()] };
    }
    scan_dj_logs_with(&env_from_process(), now_secs())
}

// ---------------------------------------------------------------- Tauri commands

#[tauri::command]
pub async fn system_scan_drivers() -> Result<DriverScan, String> {
    tauri::async_runtime::spawn_blocking(scan_drivers).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn system_scan_events(days: Option<i64>) -> Result<EventScan, String> {
    tauri::async_runtime::spawn_blocking(move || scan_events(days)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn system_scan_dj_logs() -> Result<DjLogScan, String> {
    tauri::async_runtime::spawn_blocking(scan_dj_logs).await.map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("deckchek-sc-{}-{}-{}", name, std::process::id(), now_secs()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn iso_and_clamp() {
        assert_eq!(iso_from_unix(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_from_unix(1_700_000_000), "2023-11-14T22:13:20Z");
        assert_eq!(iso_from_unix(1_709_164_800), "2024-02-29T00:00:00Z");
        assert_eq!(clamp_days(None), 14);
        assert_eq!(clamp_days(Some(0)), 1);
        assert_eq!(clamp_days(Some(500)), 90);
        assert_eq!(clamp_days(Some(-3)), 1);
    }

    #[test]
    fn scripts_have_no_double_quotes_and_days_is_numeric() {
        assert!(!DRIVERS_SCRIPT.contains('"'));
        let s = build_events_script(999);
        assert!(!s.contains('"'));
        assert!(s.contains("AddDays(-90)"));
        assert!(!s.contains("@@"));
    }

    #[test]
    fn runner_captures_and_times_out() {
        let mut c = Command::new("sh");
        c.args(["-c", "echo hi"]);
        assert_eq!(run_with_timeout(c, Duration::from_secs(5)).unwrap().trim(), "hi");
        let mut c = Command::new("sh");
        c.args(["-c", "sleep 5"]);
        let t = Instant::now();
        let e = run_with_timeout(c, Duration::from_millis(200)).unwrap_err();
        assert!(e.contains("timed out"));
        assert!(t.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn decode_utf16_bom() {
        let mut b = vec![0xFF, 0xFE];
        for u in "abc\r\nd".encode_utf16() {
            b.extend_from_slice(&u.to_le_bytes());
        }
        assert_eq!(decode_text(&b), "abc\r\nd");
        assert_eq!(decode_text(b"\xEF\xBB\xBFhey"), "hey");
    }

    #[test]
    fn vendor_matching_is_word_based() {
        assert!(is_audio_vendor("Pioneer DJ DDJ-1000"));
        assert!(is_audio_vendor("RME Fireface"));
        assert!(!is_audio_vendor("Intel firmware performance"));
        assert!(is_audio_vendor("Allen & Heath Xone"));
    }

    #[test]
    fn drivers_parse_filter_and_single_object() {
        let json = r#"{"drivers":[
          {"deviceName":"Realtek HD Audio","deviceClass":"MEDIA","manufacturer":"Realtek","driverVersion":"6.0.1","driverDate":"2023-05-01","isSigned":true,"signer":"Microsoft Windows Hardware Compatibility Publisher","problemCode":0,"entityStatus":"OK","present":true},
          {"deviceName":"Pioneer DJ DDJ","deviceClass":"USB","manufacturer":"AlphaTheta","hardwareId":["USB\\VID_2B73","USB\\VID_2B73&PID_1"],"problemCode":28,"entityStatus":"Error","present":true},
          {"deviceName":"Generic USB Hub","deviceClass":"USB","manufacturer":"Microsoft","problemCode":0,"entityStatus":"OK","present":true},
          {"deviceName":"Disk","deviceClass":"DiskDrive","manufacturer":"X"}],
          "asio":{"name":"FL Studio ASIO","clsid":"{ABC}","dllPath":"C:\\x\\a.dll","dllExists":true,"signatureStatus":"NotSigned","signer":null},
          "errors":null}"#;
        let (d, a, e) = parse_drivers_output(json).unwrap();
        assert_eq!(d.len(), 2);
        assert_eq!(d[0].status, "OK");
        assert_eq!(d[0].is_signed, Some(true));
        assert_eq!(d[1].status, "Error");
        assert_eq!(d[1].problem_code, Some(28));
        assert_eq!(d[1].hardware_id.as_deref(), Some("USB\\VID_2B73;USB\\VID_2B73&PID_1"));
        assert_eq!(a.len(), 1);
        assert!(a[0].dll_exists);
        assert_eq!(a[0].signature_status.as_deref(), Some("NotSigned"));
        assert!(e.is_empty());
        let (d, a, _) = parse_drivers_output("").unwrap();
        assert!(d.is_empty() && a.is_empty());
        let v = serde_json::to_value(&d).unwrap();
        assert!(v.is_array());
        assert!(parse_drivers_output("not json").is_err());
    }

    #[test]
    fn driver_serializes_camel_case() {
        let json = r#"{"drivers":[{"deviceName":"A","deviceClass":"MEDIA"}],"asio":[],"errors":[]}"#;
        let (d, _, _) = parse_drivers_output(json).unwrap();
        let v = serde_json::to_value(&d[0]).unwrap();
        for k in ["deviceName", "deviceClass", "manufacturer", "driverProvider", "driverVersion", "driverDate", "infName", "hardwareId", "isSigned", "signer", "status", "problemCode", "present"] {
            assert!(v.get(k).is_some(), "missing {k}");
        }
        assert_eq!(v["status"], "Unknown");
    }

    #[test]
    fn event_categories() {
        assert_eq!(categorize_event("System", "Microsoft-Windows-Audio", ""), "audio");
        assert_eq!(categorize_event("System", "AudioSrv", ""), "audio");
        assert_eq!(categorize_event("System", "portcls", ""), "audio");
        assert_eq!(categorize_event("System", "USBHUB3", ""), "usb");
        assert_eq!(categorize_event("System", "usbaudio2", ""), "usb");
        assert_eq!(categorize_event("System", "Microsoft-Windows-Kernel-PnP", ""), "driver");
        assert_eq!(categorize_event("System", "Service Control Manager", "The Windows Audio service terminated"), "audio");
        assert_eq!(categorize_event("System", "Service Control Manager", "The Focusrite service failed"), "driver");
        assert_eq!(categorize_event("Application", "Application Error", ""), "djApp");
        assert_eq!(categorize_event("System", "Foo", ""), "other");
    }

    #[test]
    fn app_info_from_props_and_message() {
        let props: Vec<String> = ["Traktor.exe", "4.0", "5f", "asio_xyz.dll", "1.0", "5e", "c0000005"].iter().map(|s| s.to_string()).collect();
        let (a, m, c) = extract_app_info(1000, &props, "");
        assert_eq!(a.as_deref(), Some("Traktor.exe"));
        assert_eq!(m.as_deref(), Some("asio_xyz.dll"));
        assert_eq!(c.as_deref(), Some("0xc0000005"));
        let msg = "Faulting application name: rekordbox.exe, version: 6.0, time stamp: 0x1\nFaulting module name: ntdll.dll, version: 10.0\nException code: 0xC0000374\n";
        let (a, m, c) = extract_app_info(1000, &[], msg);
        assert_eq!(a.as_deref(), Some("rekordbox.exe"));
        assert_eq!(m.as_deref(), Some("ntdll.dll"));
        assert_eq!(c.as_deref(), Some("0xc0000374"));
        let (a, _, _) = extract_app_info(1002, &[], "The program VirtualDJ.exe version 8.5 stopped interacting with Windows");
        assert_eq!(a.as_deref(), Some("VirtualDJ.exe"));
        let wer = "Fault bucket 1, type 5\nEvent Name: APPCRASH\nProblem signature:\nP1: mixxx.exe\nP2: 2.4\nP3: x\nP4: Qt6Core.dll\nP5: 1\nP6: 2\nP7: c0000005\n";
        let (a, m, c) = extract_app_info(1001, &[], wer);
        assert_eq!((a.as_deref(), m.as_deref(), c.as_deref()), (Some("mixxx.exe"), Some("Qt6Core.dll"), Some("0xc0000005")));
    }

    #[test]
    fn events_parse_filter_sort_cap() {
        let mut items = vec![
            r#"{"log":"System","provider":"Microsoft-Windows-Audio","eventId":65,"level":2,"timeCreated":"2024-05-02T10:00:00.0000000Z","message":"audio broke","props":[]}"#.to_string(),
            r#"{"log":"System","provider":"Service Control Manager","eventId":7031,"level":2,"timeCreated":"2024-05-03T10:00:00.0000000Z","message":"The Print Spooler service terminated","props":[]}"#.to_string(),
            r#"{"log":"System","provider":"Service Control Manager","eventId":7034,"level":1,"timeCreated":"2024-05-04T10:00:00.0000000Z","message":"The Windows Audio service terminated unexpectedly","props":[]}"#.to_string(),
            r#"{"log":"Application","provider":"Application Error","eventId":1000,"level":2,"timeCreated":"2024-05-05T10:00:00.0000000Z","message":"x","props":["chrome.exe","1","2","a.dll","1","2","c0000005"]}"#.to_string(),
            r#"{"log":"Application","provider":"Application Error","eventId":1000,"level":2,"timeCreated":"2024-05-06T10:00:00.0000000Z","message":"x","props":["Serato DJ Pro.exe","1","2","a.dll","1","2","c0000005"]}"#.to_string(),
            r#"{"log":"Application","provider":"Windows Error Reporting","eventId":1001,"level":4,"timeCreated":"2024-05-07T10:00:00.0000000Z","message":"APPCRASH P1: Traktor.exe","props":[]}"#.to_string(),
        ];
        let ev = parse_events_output(&format!("[{}]", items.join(","))).unwrap();
        assert_eq!(ev.len(), 4);
        assert_eq!(ev[0].time_created, "2024-05-07T10:00:00.0000000Z");
        assert_eq!(ev[0].level, "Warning");
        assert_eq!(ev[0].app_name.as_deref(), Some("Traktor.exe"));
        assert_eq!(ev[1].app_name.as_deref(), Some("Serato DJ Pro.exe"));
        assert_eq!(ev[1].category, "djApp");
        assert_eq!(ev[2].level, "Critical");
        assert_eq!(ev[2].category, "audio");
        // single object, not array
        assert_eq!(parse_events_output(&items[0]).unwrap().len(), 1);
        assert!(parse_events_output("  ").unwrap().is_empty());
        // cap and truncation
        let long = "x".repeat(5000);
        items.clear();
        for i in 0..350 {
            items.push(format!(r#"{{"log":"System","provider":"USBHUB3","eventId":1,"level":3,"timeCreated":"2024-01-01T00:{:02}:{:02}Z","message":"{}","props":[]}}"#, i / 60, i % 60, long));
        }
        let ev = parse_events_output(&format!("[{}]", items.join(","))).unwrap();
        assert_eq!(ev.len(), 300);
        assert_eq!(ev[0].message.chars().count(), 2000);
        assert!(ev[0].time_created >= ev[299].time_created);
    }

    #[test]
    fn line_classification() {
        assert_eq!(classify_line("Unhandled Exception at 0x0"), Some("crash"));
        assert_eq!(classify_line("ASIO buffer underrun"), Some("error"));
        assert_eq!(classify_line("WARN: low disk"), Some("warning"));
        assert_eq!(classify_line("all good"), None);
        let text: String = (0..100).map(|i| if i % 2 == 0 { format!("error {i}\n") } else { format!("ok {i}\n") }).collect();
        let (m, tail) = analyze_text(&text);
        assert_eq!(m.len(), 50);
        assert_eq!(m.last().unwrap().line_no, 99);
        assert_eq!(tail.len(), 20);
        assert_eq!(tail.last().unwrap(), "ok 99");
        let (m, _) = analyze_text(&format!("error {}", "y".repeat(1000)));
        assert_eq!(m[0].line.chars().count(), 400);
    }

    #[test]
    fn wer_parsing() {
        let wer = "Version=1\nEventType=APPCRASH\nSig[0].Name=Application Name\nSig[0].Value=Traktor.exe\nSig[3].Name=Fault Module Name\nSig[3].Value=asio_x.dll\nSig[6].Name=Exception Code\nSig[6].Value=c0000005\nAppPath=C:\\Program Files\\NI\\Traktor.exe\n";
        let info = parse_wer(wer);
        assert_eq!(info, WerInfo { app: Some("Traktor.exe".into()), module: Some("asio_x.dll".into()), exception_code: Some("0xc0000005".into()) });
        let m = wer_match(&info, false).unwrap();
        assert_eq!(m.severity, "crash");
        assert!(m.line.contains("asio_x.dll") && m.line.contains("0xc0000005"));
        assert_eq!(wer_match(&info, true).unwrap().severity, "error");
        assert!(wer_match(&WerInfo::default(), false).is_none());
        assert_eq!(parse_wer("AppPath=C:\\a\\b\\mixxx.exe").app.as_deref(), Some("mixxx.exe"));
    }

    #[test]
    fn templates_and_globs() {
        let mut env = EnvMap::new();
        env.insert("USERPROFILE".into(), "/u".into());
        env.insert("LOCALAPPDATA".into(), "/u/local".into());
        env.insert("ONEDRIVE".into(), "/u/od".into());
        add_known_folders(&mut env);
        assert_eq!(expand_template("%MUSIC%\\_Serato_\\Logs", &env).unwrap(), PathBuf::from("/u/Music/_Serato_/Logs"));
        assert_eq!(expand_template("%localappdata%\\Mixxx", &env).unwrap(), PathBuf::from("/u/local/Mixxx"));
        assert!(expand_template("%APPDATA%\\x", &env).is_none());
        assert_eq!(template_variants("%DOCUMENTS%\\VirtualDJ").len(), 2);
        assert_eq!(expand_template("%DOCUMENTS_OD%\\V", &env).unwrap(), PathBuf::from("/u/od/Documents/V"));
        assert!(glob_match("Traktor *", "traktor 3.11.0"));
        assert!(!glob_match("Traktor *", "Traktor"));
        assert!(glob_match("rekordbox*", "rekordbox6"));
        let root = tmp("glob");
        std::fs::create_dir_all(root.join("NI/Traktor 3.11.0")).unwrap();
        std::fs::create_dir_all(root.join("NI/Traktor 4.0.1")).unwrap();
        std::fs::create_dir_all(root.join("NI/Other")).unwrap();
        let r = resolve_glob(&root.join("NI/Traktor *"));
        assert_eq!(r.len(), 2);
        assert!(resolve_glob(&root.join("none/*")).is_empty());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn file_classification_and_selection() {
        assert_eq!(classify_file_name("Traktor.exe.123.dmp"), Some(FileKind::CrashDump));
        assert_eq!(classify_file_name("crash_report.txt"), Some(FileKind::CrashReport));
        assert_eq!(classify_file_name("mixxx.log"), Some(FileKind::Log));
        assert_eq!(classify_file_name("Log 2024.txt"), Some(FileKind::Log));
        assert_eq!(classify_file_name("collection.nml"), None);
        let now = 100 * 86_400;
        let mk = |n: &str, age_days: u64| Candidate { path: PathBuf::from(n), kind: FileKind::Log, modified_secs: now - age_days * 86_400, size: 1 };
        let mut c: Vec<Candidate> = (0..15).map(|i| mk(&format!("f{i}"), i)).collect();
        c.push(mk("old", 91));
        c.push(mk("f3", 3)); // duplicate
        let sel = select_files(c, now, 90, 10);
        assert_eq!(sel.len(), 10);
        assert_eq!(sel[0].path, PathBuf::from("f0"));
        assert!(!sel.iter().any(|x| x.path == PathBuf::from("old")));
        assert_eq!(sel.iter().filter(|x| x.path == PathBuf::from("f3")).count(), 1);
    }

    #[test]
    fn dj_log_scan_end_to_end() {
        let root = tmp("djscan");
        let p = |s: &str| root.join(s);
        let mut env = EnvMap::new();
        env.insert("USERPROFILE".into(), root.to_string_lossy().into_owned());
        env.insert("APPDATA".into(), p("AppData/Roaming").to_string_lossy().into_owned());
        env.insert("LOCALAPPDATA".into(), p("AppData/Local").to_string_lossy().into_owned());
        env.insert("PROGRAMDATA".into(), p("ProgramData").to_string_lossy().into_owned());
        env.insert("PROGRAMFILES".into(), p("PF").to_string_lossy().into_owned());
        add_known_folders(&mut env);
        std::fs::create_dir_all(p("Music/_Serato_/Logs")).unwrap();
        std::fs::write(p("Music/_Serato_/Logs/session.log"), "start\nERROR: buffer underrun\nok\nwarn x\n").unwrap();
        std::fs::create_dir_all(p("AppData/Local/Mixxx")).unwrap();
        std::fs::write(p("AppData/Local/Mixxx/mixxx.log"), "Debug [Main] hi\nCritical: crash in engine\n").unwrap();
        std::fs::create_dir_all(p("AppData/Local/CrashDumps")).unwrap();
        std::fs::write(p("AppData/Local/CrashDumps/Traktor.exe.42.dmp"), b"MDMP").unwrap();
        let wer = p("ProgramData/Microsoft/Windows/WER/ReportArchive/AppCrash_rekordbox.exe_abc");
        std::fs::create_dir_all(&wer).unwrap();
        let mut bytes = vec![0xFF, 0xFE];
        for u in "Sig[0].Name=Application Name\r\nSig[0].Value=rekordbox.exe\r\nSig[3].Name=Fault Module Name\r\nSig[3].Value=ntdll.dll\r\n".encode_utf16() {
            bytes.extend_from_slice(&u.to_le_bytes());
        }
        std::fs::write(wer.join("Report.wer"), bytes).unwrap();
        let scan = scan_dj_logs_with(&env, now_secs());
        assert!(scan.supported);
        assert_eq!(scan.apps.len(), APPS.len());
        let get = |n: &str| scan.apps.iter().find(|a| a.app == n).unwrap();
        let serato = get("Serato DJ Pro");
        assert_eq!(serato.files.len(), 1);
        assert_eq!(serato.files[0].kind, "log");
        assert_eq!(serato.files[0].matches.len(), 2);
        assert_eq!(serato.files[0].tail.len(), 4);
        let mixxx = get("Mixxx");
        assert!(mixxx.installed);
        assert_eq!(mixxx.files[0].matches[0].severity, "crash");
        assert_eq!(get("Traktor Pro").files[0].kind, "crashDump");
        let rb = get("rekordbox");
        assert_eq!(rb.files[0].kind, "crashReport");
        assert!(rb.files[0].matches[0].line.contains("ntdll.dll"));
        assert!(!get("VirtualDJ").installed);
        let v = serde_json::to_value(&scan).unwrap();
        assert!(v["apps"][0].get("exeNames").is_some() && v["apps"][0].get("scannedAt").is_none());
        assert!(v.get("scannedAt").is_some());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn non_windows_is_unsupported() {
        if cfg!(windows) {
            return;
        }
        let d = scan_drivers();
        assert!(!d.supported && d.drivers.is_empty() && d.errors == vec![UNSUPPORTED.to_string()]);
        let e = scan_events(Some(7));
        assert!(!e.supported && e.days == 7);
        assert!(!scan_dj_logs().supported);
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use super::*;

    #[test]
    fn real_scans_run_within_timeout() {
        let t = Instant::now();
        let d = scan_drivers();
        assert!(d.supported, "{:?}", d.errors);
        let e = scan_events(Some(14));
        assert!(e.supported, "{:?}", e.errors);
        let l = scan_dj_logs();
        assert!(l.supported, "{:?}", l.errors);
        assert!(t.elapsed() < Duration::from_secs(120));
        println!("drivers={} asio={} events={} apps={} errors={:?}{:?}{:?}", d.drivers.len(), d.asio_drivers.len(), e.events.len(), l.apps.len(), d.errors, e.errors, l.errors);
    }
}
