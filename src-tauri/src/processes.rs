//! Process facts for FS-10/11/12 (FS-00 §4.10): which DJ programs are running and
//! which executables use the most CPU. Exe names only, never command lines.
//!
//! Both commands run a FIXED command line (no user input is interpolated into
//! it) with `CREATE_NO_WINDOW` through `system_check::run_with_timeout`. The
//! parsers are pure and tested against recorded fixtures, including localized
//! output and odd file names.

// The parsers are used by the Windows-only live queries; tests exercise them everywhere.
#![cfg_attr(not(windows), allow(dead_code))]

use serde::Serialize;
use std::collections::HashMap;
use std::time::Duration;

use crate::system_check::is_dj_program;

#[cfg(not(windows))]
const UNSUPPORTED: &str = "Process listing requires Windows.";
const MAX_TOP_N: usize = 50;
#[cfg_attr(not(windows), allow(dead_code))]
const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjApp {
    pub app: String,
    pub exe: String,
    pub pid: Option<u32>,
    pub running: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjProcesses {
    pub supported: bool,
    pub apps: Vec<DjApp>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuUse {
    pub exe: String,
    pub cpu_pct: f64,
}

/// Known DJ programs: display name, canonical exe, lowercase exe names that map to it.
const KNOWN: &[(&str, &str, &[&str])] = &[
    ("Serato DJ Pro", "Serato DJ Pro.exe", &["serato dj pro.exe"]),
    ("Serato DJ Lite", "Serato DJ Lite.exe", &["serato dj lite.exe"]),
    ("Traktor Pro", "Traktor.exe", &["traktor.exe", "traktor pro 4.exe", "traktor pro 3.exe", "traktor pro 2.exe"]),
    ("rekordbox", "rekordbox.exe", &["rekordbox.exe"]),
    ("VirtualDJ", "VirtualDJ.exe", &["virtualdj.exe"]),
    ("Mixxx", "mixxx.exe", &["mixxx.exe"]),
    ("djay", "djay Pro.exe", &["djay pro.exe", "djay.exe"]),
    ("Engine DJ", "Engine DJ.exe", &["engine dj.exe"]),
];

/// Background helpers of DJ programs (updaters, agents) must not count as "the app is running".
const HELPER_WORDS: &[&str] = &["agent", "helper", "updater", "update", "service", "crash", "setup", "install", "uninst", "launcher", "daemon"];

// ---------------------------------------------------------------- CSV parsing

/// Parse CSV text (RFC 4180 subset, lenient): quoted fields may contain commas and `""`;
/// rows end at LF or CRLF; blank lines are skipped. Unterminated quotes end the row.
pub fn parse_csv(text: &str) -> Vec<Vec<String>> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut rows = Vec::new();
    for line in text.split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.trim().is_empty() {
            continue;
        }
        let mut fields = Vec::new();
        let mut cur = String::new();
        let mut in_q = false;
        let mut chars = line.chars().peekable();
        while let Some(c) = chars.next() {
            match (c, in_q) {
                ('"', true) if chars.peek() == Some(&'"') => {
                    cur.push('"');
                    chars.next();
                }
                // closes the field only before a comma or the end of the line; tasklist does not
                // escape quotes, so a stray inner quote stays part of the name
                ('"', true) if matches!(chars.peek(), None | Some(&',')) => in_q = false,
                ('"', false) if cur.is_empty() => in_q = true,
                (',', false) => fields.push(std::mem::take(&mut cur)),
                (c, _) => cur.push(c),
            }
        }
        fields.push(cur);
        rows.push(fields);
    }
    rows
}

/// `tasklist /FO CSV /NH` rows are `"Image Name","PID","Session Name","Session#","Mem Usage"`.
/// Headers are absent (/NH) so localization only affects the memory column and the
/// "no tasks" notice, which has no quoted CSV shape and is skipped. Rows whose PID is
/// not a number are dropped. Returns (image name, pid).
pub fn parse_tasklist(text: &str) -> Vec<(String, u32)> {
    parse_csv(text)
        .into_iter()
        .filter(|r| r.len() >= 2)
        .filter_map(|r| {
            let name = r[0].trim().to_string();
            let pid = r[1].trim().parse::<u32>().ok()?;
            if name.is_empty() {
                None
            } else {
                Some((name, pid))
            }
        })
        .collect()
}

// ---------------------------------------------------------------- DJ program matching

fn is_helper(lower: &str) -> bool {
    HELPER_WORDS.iter().any(|w| lower.contains(w))
}

/// Maps an image name to (display app, canonical exe) when it is a DJ program itself.
pub fn classify_exe(image: &str) -> Option<(String, String)> {
    let lower = image.to_lowercase();
    for (app, canon, names) in KNOWN {
        if names.contains(&lower.as_str()) {
            return Some(((*app).to_string(), (*canon).to_string()));
        }
    }
    // Unknown build of a DJ program (e.g. "Serato DJ Pro 4.exe"): accept unless it is a helper.
    if is_dj_program(&lower) && !is_helper(&lower) && lower.ends_with(".exe") {
        let stem = image[..image.len() - 4].trim().to_string();
        return Some((stem, image.to_string()));
    }
    None
}

/// Running DJ programs from parsed tasklist rows, plus a not-running entry for every
/// known program that was not seen, so the UI can show "closed" without a second lookup.
pub fn dj_apps_from(rows: &[(String, u32)]) -> Vec<DjApp> {
    let mut apps: Vec<DjApp> = Vec::new();
    for (image, pid) in rows {
        if let Some((app, exe)) = classify_exe(image) {
            apps.push(DjApp { app, exe, pid: Some(*pid), running: true });
        }
    }
    apps.sort_by(|a, b| a.app.cmp(&b.app).then(a.pid.cmp(&b.pid)));
    for (app, canon, _) in KNOWN {
        if !apps.iter().any(|a| a.app == *app) {
            apps.push(DjApp { app: (*app).to_string(), exe: (*canon).to_string(), pid: None, running: false });
        }
    }
    apps
}

// ---------------------------------------------------------------- CPU parsing

/// Windows performance-counter instance names are exe stems, with `#N` appended for
/// duplicates (`chrome#2`). Returns the `.exe` name; `_total`/`idle` yield None.
pub fn exe_from_instance(instance: &str) -> Option<String> {
    let name = instance.trim();
    let base = match name.rfind('#') {
        Some(i) if i > 0 && name[i + 1..].chars().all(|c| c.is_ascii_digit()) && i + 1 < name.len() => &name[..i],
        _ => name,
    };
    let lower = base.to_lowercase();
    if base.is_empty() || lower == "_total" || lower == "idle" {
        return None;
    }
    Some(if lower.ends_with(".exe") { base.to_string() } else { format!("{base}.exe") })
}

/// Parse `ConvertTo-Csv` output with header `Name,Cpu` (the script is fixed). Instances
/// of the same exe are summed, the total is divided by `logical_cpus` so 100 means
/// the whole machine, sorted descending (ties by name), cut to `n`.
pub fn parse_top_cpu(text: &str, logical_cpus: usize, n: usize) -> Vec<CpuUse> {
    let cpus = logical_cpus.max(1) as f64;
    let mut sums: HashMap<String, (String, f64)> = HashMap::new();
    for r in parse_csv(text) {
        if r.len() < 2 || r[0].eq_ignore_ascii_case("name") {
            continue;
        }
        // Decimal commas in localized output arrive quoted ("12,5"): accept both separators.
        let Ok(v) = r[1].trim().replace(',', ".").parse::<f64>() else { continue };
        if !v.is_finite() || v < 0.0 {
            continue;
        }
        let Some(exe) = exe_from_instance(&r[0]) else { continue };
        let e = sums.entry(exe.to_lowercase()).or_insert((exe, 0.0));
        e.1 += v;
    }
    let mut out: Vec<CpuUse> = sums
        .into_values()
        .map(|(exe, v)| CpuUse { exe, cpu_pct: (v / cpus * 10.0).round() / 10.0 })
        .collect();
    out.sort_by(|a, b| b.cpu_pct.partial_cmp(&a.cpu_pct).unwrap_or(std::cmp::Ordering::Equal).then_with(|| a.exe.to_lowercase().cmp(&b.exe.to_lowercase())));
    out.truncate(n.min(MAX_TOP_N));
    out
}

pub const CPU_UNAVAILABLE: &str = "CPU usage counters are unavailable on this PC (no samples were returned).";

/// Like [`parse_top_cpu`], but no samples at all is "unavailable", not an
/// empty (and therefore passing) list.
pub fn top_cpu_from(text: &str, logical_cpus: usize, n: usize) -> Result<Vec<CpuUse>, String> {
    let top = parse_top_cpu(text, logical_cpus, n);
    if top.is_empty() {
        Err(CPU_UNAVAILABLE.to_string())
    } else {
        Ok(top)
    }
}

// ---------------------------------------------------------------- live queries

#[cfg(windows)]
fn tasklist_output() -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut cmd = Command::new("tasklist.exe");
    cmd.args(["/FO", "CSV", "/NH"]);
    cmd.creation_flags(CREATE_NO_WINDOW);
    crate::system_check::run_with_timeout(cmd, TIMEOUT)
}

#[cfg(windows)]
fn cpu_output() -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // Fixed script: every process's CPU time over 1 s, as CSV (Name,Cpu).
    // Uses the raw WMI performance class, whose class and property names are
    // the same on every Windows display language (`Get-Counter` paths such as
    // '\\Process(*)\\% Processor Time' are localized and fail on German,
    // French, ... Windows: BUG-06). PercentProcessorTime is a 100 ns timer:
    // percent of one core = 100 * delta(time) / delta(Timestamp_Sys100NS),
    // the same value Get-Counter cooks. No double quotes (argument quoting).
    const SCRIPT: &str = "$ErrorActionPreference='SilentlyContinue'; $inv=[cultureinfo]::InvariantCulture; \
        $q={ Get-CimInstance -ClassName Win32_PerfRawData_PerfProc_Process | Where-Object { $_.Name -ne '_Total' -and $_.Name -ne 'Idle' } }; \
        $a=@{}; foreach ($x in (& $q)) { $a[[string]$x.IDProcess]=$x }; \
        Start-Sleep -Seconds 1; \
        & $q | ForEach-Object { $x=$a[[string]$_.IDProcess]; if ($x -and $x.Name -eq $_.Name) { \
            $dt=[double]$_.Timestamp_Sys100NS - [double]$x.Timestamp_Sys100NS; \
            if ($dt -gt 0) { [pscustomobject]@{ Name=$_.Name; Cpu=[math]::Round(100.0*([double]$_.PercentProcessorTime - [double]$x.PercentProcessorTime)/$dt, 2).ToString($inv) } } } } | \
        ConvertTo-Csv -NoTypeInformation";
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT]);
    cmd.creation_flags(CREATE_NO_WINDOW);
    crate::system_check::run_with_timeout(cmd, TIMEOUT)
}

#[cfg(windows)]
fn logical_cpus() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1)
}

#[tauri::command]
pub async fn dj_processes() -> Result<DjProcesses, String> {
    tauri::async_runtime::spawn_blocking(dj_processes_blocking).await.map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn dj_processes_blocking() -> Result<DjProcesses, String> {
    let out = tasklist_output()?;
    Ok(DjProcesses { supported: true, apps: dj_apps_from(&parse_tasklist(&out)) })
}

#[cfg(not(windows))]
fn dj_processes_blocking() -> Result<DjProcesses, String> {
    Ok(DjProcesses { supported: false, apps: Vec::new() })
}

#[tauri::command]
pub async fn top_cpu(n: Option<usize>) -> Result<Vec<CpuUse>, String> {
    let n = n.unwrap_or(5).clamp(1, MAX_TOP_N);
    tauri::async_runtime::spawn_blocking(move || top_cpu_blocking(n)).await.map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn top_cpu_blocking(n: usize) -> Result<Vec<CpuUse>, String> {
    top_cpu_from(&cpu_output()?, logical_cpus(), n)
}

#[cfg(not(windows))]
fn top_cpu_blocking(_n: usize) -> Result<Vec<CpuUse>, String> {
    Err(UNSUPPORTED.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const ENGLISH: &str = include_str!("../../tests/fixtures/processes/tasklist-en.csv");
    const GERMAN: &str = include_str!("../../tests/fixtures/processes/tasklist-de.csv");
    const ODD: &str = include_str!("../../tests/fixtures/processes/tasklist-odd.csv");

    #[test]
    fn english_fixture_finds_serato_and_ignores_helpers() {
        let rows = parse_tasklist(ENGLISH);
        assert_eq!(rows.len(), 9);
        assert_eq!(rows[0], ("System Idle Process".to_string(), 0));
        let apps = dj_apps_from(&rows);
        let running: Vec<_> = apps.iter().filter(|a| a.running).collect();
        assert_eq!(running.len(), 2);
        assert_eq!((running[0].app.as_str(), running[0].exe.as_str(), running[0].pid), ("Serato DJ Pro", "Serato DJ Pro.exe", Some(7312)));
        assert_eq!((running[1].app.as_str(), running[1].pid), ("rekordbox", Some(9020)));
        // rekordboxAgent.exe and Traktor updater are helpers, not the app
        assert!(apps.iter().any(|a| a.app == "Traktor Pro" && !a.running && a.pid.is_none()));
        assert_eq!(apps.len(), running.len() + KNOWN.len() - 2);
    }

    #[test]
    fn localized_german_fixture_parses_the_same_way() {
        let rows = parse_tasklist(GERMAN);
        // memory column uses "1.234 K" with NBSP / thin spaces; header-less rows still parse
        assert_eq!(rows.len(), 4);
        let apps = dj_apps_from(&rows);
        let traktor = apps.iter().find(|a| a.app == "Traktor Pro").unwrap();
        assert!(traktor.running && traktor.pid == Some(2468) && traktor.exe == "Traktor.exe");
        let mixxx = apps.iter().find(|a| a.app == "Mixxx").unwrap();
        assert!(mixxx.running);
        assert!(rows.iter().any(|(n, _)| n == "Größenänderung.exe"));
    }

    #[test]
    fn odd_names_commas_quotes_unicode_and_junk() {
        let rows = parse_tasklist(ODD);
        let names: Vec<&str> = rows.iter().map(|(n, _)| n.as_str()).collect();
        assert!(names.contains(&"my, weird app.exe"));
        assert!(names.contains(&"Привет мир.exe"));
        assert!(names.contains(&"日本語プロセス.exe"));
        assert!(names.contains(&"say \"hi\".exe"));
        assert!(names.contains(&"a,b,c,d,e.exe"));
        // INFO notice, blank lines, non-numeric PID and short rows are dropped
        assert!(!names.iter().any(|n| n.starts_with("INFO")));
        assert!(!names.contains(&"badpid.exe"));
        assert!(!names.contains(&"short.exe"));
        // CRLF endings and a BOM do not leak into names
        assert!(rows.iter().all(|(n, _)| !n.contains('\r') && !n.starts_with('\u{feff}')));
        let apps = dj_apps_from(&rows);
        // "Serato DJ Pro 4.exe" is an unknown build: accepted via is_dj_program, helper rejected
        assert!(apps.iter().any(|a| a.running && a.app == "Serato DJ Pro 4" && a.exe == "Serato DJ Pro 4.exe"));
        assert!(!apps.iter().any(|a| a.exe.to_lowercase().contains("updater")));
        // a process merely named like a DJ stem in the middle of a different file is still classified by stem rule only for .exe
        assert!(!apps.iter().any(|a| a.exe.ends_with(".dll")));
    }

    #[test]
    fn multiple_instances_each_get_an_entry() {
        let rows = vec![("mixxx.exe".to_string(), 30), ("MIXXX.EXE".to_string(), 10)];
        let apps = dj_apps_from(&rows);
        let m: Vec<_> = apps.iter().filter(|a| a.app == "Mixxx").collect();
        assert_eq!(m.len(), 2);
        assert_eq!(m[0].pid, Some(10));
        assert!(m.iter().all(|a| a.running && a.exe == "mixxx.exe"));
    }

    #[test]
    fn empty_and_garbage_input() {
        assert!(parse_tasklist("").is_empty());
        assert!(parse_tasklist("INFO: No tasks are running which match the specified criteria.\r\n").is_empty());
        assert!(parse_tasklist("\"unterminated,12").is_empty());
        let apps = dj_apps_from(&[]);
        assert_eq!(apps.len(), KNOWN.len());
        assert!(apps.iter().all(|a| !a.running && a.pid.is_none()));
    }

    #[test]
    fn csv_parser_edge_cases() {
        assert_eq!(parse_csv("\"a\",\"b\"\n"), vec![vec!["a", "b"]]);
        assert_eq!(parse_csv("\"a,b\",c\r\n\r\n\"x\"\"y\",\"\""), vec![vec!["a,b", "c"], vec!["x\"y", ""]]);
        assert_eq!(parse_csv("\u{feff}a,b"), vec![vec!["a", "b"]]);
    }

    #[test]
    fn instance_names() {
        assert_eq!(exe_from_instance("chrome#2").as_deref(), Some("chrome.exe"));
        assert_eq!(exe_from_instance("Serato DJ Pro").as_deref(), Some("Serato DJ Pro.exe"));
        assert_eq!(exe_from_instance("name.exe#3").as_deref(), Some("name.exe"));
        assert_eq!(exe_from_instance("C#").as_deref(), Some("C#.exe"));
        assert_eq!(exe_from_instance("#1").as_deref(), Some("#1.exe"));
        assert_eq!(exe_from_instance("_Total"), None);
        assert_eq!(exe_from_instance("Idle"), None);
        assert_eq!(exe_from_instance("  "), None);
    }

    #[test]
    fn top_cpu_aggregates_normalises_sorts_and_cuts() {
        let csv = "\"Name\",\"Cpu\"\r\n\"_Total\",\"800\"\r\n\"Idle\",\"700\"\r\n\"chrome\",\"40\"\r\n\"chrome#1\",\"40\"\r\n\"Serato DJ Pro\",\"60.04\"\r\n\"System\",\"3\"\r\n\"odd, name#2\",\"4\"\r\n\"bad\",\"abc\"\r\n\"neg\",\"-5\"\r\n\"german\",\"12,5\"\r\n";
        let top = parse_top_cpu(csv, 8, 10);
        let got: Vec<(&str, f64)> = top.iter().map(|c| (c.exe.as_str(), c.cpu_pct)).collect();
        assert_eq!(got, [("chrome.exe", 10.0), ("Serato DJ Pro.exe", 7.5), ("german.exe", 1.6), ("odd, name.exe", 0.5), ("System.exe", 0.4)]);
        assert_eq!(parse_top_cpu(csv, 8, 2).len(), 2);
        assert_eq!(parse_top_cpu(csv, 8, 1000).len(), 5);
        assert_eq!(parse_top_cpu(csv, 0, 1)[0].cpu_pct, 80.0); // zero cpus clamps to 1
        assert!(parse_top_cpu("", 4, 5).is_empty());
    }

    /// BUG-06: an empty query result (e.g. counters missing) is reported as
    /// unavailable instead of an empty list that passes the background-CPU check.
    #[test]
    fn no_cpu_samples_is_unavailable_not_an_empty_list() {
        assert_eq!(top_cpu_from("", 8, 5).unwrap_err(), CPU_UNAVAILABLE);
        assert_eq!(top_cpu_from("\"Name\",\"Cpu\"\r\n\"_Total\",\"800\"\r\n", 8, 5).unwrap_err(), CPU_UNAVAILABLE);
        let idle = top_cpu_from("\"Name\",\"Cpu\"\r\n\"svchost#4\",\"0\"\r\n", 8, 5).unwrap();
        assert_eq!((idle[0].exe.as_str(), idle[0].cpu_pct), ("svchost.exe", 0.0), "a quiet PC still has samples");
    }

    #[test]
    fn serialises_to_the_contract() {
        let raw = std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/usage.json")).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        let dj = DjProcesses {
            supported: true,
            apps: vec![
                DjApp { app: "Serato DJ Pro".into(), exe: "Serato DJ Pro.exe".into(), pid: Some(4242), running: true },
                DjApp { app: "Traktor Pro".into(), exe: "Traktor.exe".into(), pid: None, running: false },
            ],
        };
        assert_eq!(serde_json::to_value(&dj).unwrap(), v["dj_processes"]["response"]);
        let cpu = vec![CpuUse { exe: "chrome.exe".into(), cpu_pct: 12.5 }, CpuUse { exe: "System".into(), cpu_pct: 0.4 }];
        assert_eq!(serde_json::to_value(&cpu).unwrap(), v["top_cpu"]["response"]);
    }

    #[cfg(not(windows))]
    #[test]
    fn non_windows_reports_unsupported() {
        let d = dj_processes_blocking().unwrap();
        assert!(!d.supported && d.apps.is_empty());
        assert!(top_cpu_blocking(5).is_err());
    }

    /// Runs the real fixed commands on the Windows runner (FS-00 test plan).
    #[cfg(windows)]
    #[test]
    fn live_tasklist_parses() {
        let rows = parse_tasklist(&tasklist_output().unwrap());
        assert!(rows.len() > 10);
        assert!(rows.iter().any(|(n, _)| n.eq_ignore_ascii_case("explorer.exe") || n.eq_ignore_ascii_case("svchost.exe")));
        let d = dj_processes_blocking().unwrap();
        assert!(d.supported && d.apps.len() >= KNOWN.len());
        let top = top_cpu_blocking(5).unwrap();
        assert!(top.len() <= 5);
    }
}
