#!/usr/bin/env python3
"""Generate a Linux-only, source-bound Fleet timing harness outside the repo.

This diagnostic preserves the original reminder regression and its 200 ms cap,
and adds a separate phase-instrumented copy. It is not full Tauri qualification.
Run Cargo with the original nightly/sanitizer settings, then verify the resolved
registry dependencies against the repository lock before interpreting timings.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import textwrap
import tomllib


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def between(source, start, end):
    begin = source.index(start)
    return source[begin:source.index(end, begin)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--verify-lock", action="store_true")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parent.parent
    output = args.output.resolve()
    if output == repo or repo in output.parents:
        raise SystemExit("Use an output directory outside the repository.")
    lock_text = (repo / "src-tauri/Cargo.lock").read_text()
    lock = tomllib.loads(lock_text)
    registry = {(p["name"], p["version"]): p.get("checksum")
                for p in lock["package"] if p.get("source", "").startswith("registry+")}
    if args.verify_lock:
        resolved = tomllib.loads((output / "Cargo.lock").read_text())
        drift = [{"name": p["name"], "version": p["version"]}
                 for p in resolved["package"] if p.get("source", "").startswith("registry+")
                 and registry.get((p["name"], p["version"])) != p.get("checksum")]
        if drift:
            raise SystemExit("Diagnostic dependency drift: " + json.dumps(drift))
        print(json.dumps({"registryDependencyDrift": [], "packages": len(resolved["package"])}))
        return
    if output.exists() and any(output.iterdir()):
        raise SystemExit("Choose an empty output directory; existing diagnostics are preserved.")
    (output / "src").mkdir(parents=True, exist_ok=True)
    source = (repo / "src-tauri/src/fleet.rs").read_text()
    db_source = (repo / "src-tauri/src/db.rs").read_text()
    snippets = {
        "error": between(source, "fn err(", "fn text("),
        "usage": between(source, "type ConfirmedUsageByAsset", "/// Titles of a device profile"),
        "reminders": between(source, "const REMINDERS_SQL", "#[derive(Debug, Deserialize)]"),
        "database": textwrap.dedent(between(source, "    fn database()", "    fn reminder(")),
        "regression": textwrap.dedent(between(source,
            "    fn regression_reminder_overview_has_no_per_reminder_scans_and_meets_budget()",
            "    #[test]\n    fn reminder_read_preserves_optional_fields")),
        "migrations": between(db_source, "pub fn apply_migrations(", "/// Versions recorded in"),
    }
    fixture = snippets["regression"].split("{\n", 1)[1].split("    let started = std::time::Instant::now();", 1)[0]
    exact_reminders = snippets["reminders"]
    instrumented = exact_reminders[exact_reminders.index("pub fn reminders("):]
    instrumented = instrumented.replace("pub fn reminders(", "fn measured_reminders(", 1)
    replacements = [
        ("    let mut completions:", "    let mut mark = Mark::now();\n    let mut completions:"),
        ("    let usage = if", "    record_phase(0, &mut mark);\n    let usage = if"),
        ("    let mut query = conn.prepare(REMINDERS_SQL)", "    record_phase(1, &mut mark);\n    let mut query = conn.prepare(REMINDERS_SQL)"),
        ("    for row in &mut rows {", "    record_phase(2, &mut mark);\n    for row in &mut rows {"),
        ("    Ok(rows)", "    record_phase(3, &mut mark);\n    Ok(rows)"),
    ]
    for old, new in replacements:
        assert instrumented.count(old) == 1, old
        instrumented = instrumented.replace(old, new, 1)
    migrations = sorted((repo / "database/migrations").glob("[0-9][0-9][0-9][0-9]_*.sql"))
    migration_rows = []
    for path in migrations:
        # JSON string quoting is valid for the ordinary absolute Rust paths used here.
        migration_rows.append(f"({int(path.name[:4])}, include_str!({json.dumps(str(path))}))")
    db = "mod db {\nuse rusqlite::{params, Connection};\nconst MIGRATIONS: &[(i64, &str)] = &[\n" + ",\n".join(migration_rows) + "];\n" + snippets["migrations"] + "}\n"
    instrumentation = r'''
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::RefCell;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
static ALLOCATIONS: AtomicU64 = AtomicU64::new(0);
static REQUESTED_BYTES: AtomicU64 = AtomicU64::new(0);
struct DiagnosticAllocator;
unsafe impl GlobalAlloc for DiagnosticAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        REQUESTED_BYTES.fetch_add(layout.size() as u64, Ordering::Relaxed);
        unsafe { System.alloc(layout) }
    }
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        REQUESTED_BYTES.fetch_add(layout.size() as u64, Ordering::Relaxed);
        unsafe { System.alloc_zeroed(layout) }
    }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        unsafe { System.dealloc(ptr, layout) }
    }
    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        REQUESTED_BYTES.fetch_add(size as u64, Ordering::Relaxed);
        unsafe { System.realloc(ptr, layout, size) }
    }
}
#[global_allocator]
static ALLOCATOR: DiagnosticAllocator = DiagnosticAllocator;
fn thread_cpu_ns() -> u128 {
    let mut value = libc::timespec { tv_sec: 0, tv_nsec: 0 };
    // Linux diagnostic only; clock_gettime writes this live, correctly sized value.
    assert_eq!(unsafe { libc::clock_gettime(libc::CLOCK_THREAD_CPUTIME_ID, &mut value) }, 0);
    value.tv_sec as u128 * 1_000_000_000 + value.tv_nsec as u128
}
struct Mark { wall: Instant, cpu: u128, allocations: u64, bytes: u64 }
impl Mark {
    fn now() -> Self {
        Self { wall: Instant::now(), cpu: thread_cpu_ns(),
            allocations: ALLOCATIONS.load(Ordering::Relaxed),
            bytes: REQUESTED_BYTES.load(Ordering::Relaxed) }
    }
    fn elapsed(&self) -> Value {
        let wall = self.wall.elapsed().as_nanos();
        let cpu = thread_cpu_ns() - self.cpu;
        let allocations = ALLOCATIONS.load(Ordering::Relaxed) - self.allocations;
        let bytes = REQUESTED_BYTES.load(Ordering::Relaxed) - self.bytes;
        json!({"wallNs":wall,"threadCpuNs":cpu,"rustAllocationCalls":allocations,
            "rustRequestedBytes":bytes})
    }
}
thread_local! { static PHASES: RefCell<Vec<Value>> = RefCell::new(Vec::with_capacity(4)); }
fn record_phase(index: usize, mark: &mut Mark) {
    let measurement = mark.elapsed();
    PHASES.with(|p| { let mut p = p.borrow_mut(); assert_eq!(p.len(), index); p.push(measurement); });
    *mark = Mark::now();
}
'''
    diagnostic = "#[test]\nfn diagnostic_phase_measurements_preserve_rows() {\n" + fixture + r'''
    PHASES.with(|p| p.borrow_mut().clear());
    let baseline = Mark::now();
    let expected = reminders(&conn, None).unwrap();
    let baseline_stats = baseline.elapsed();
    let measured = measured_reminders(&conn, None).unwrap();
    assert_eq!(measured, expected, "instrumentation must preserve every returned row");
    assert_eq!(measured.len(), 2000);
    let sqlite: String = conn.query_row("SELECT sqlite_version()", [], |r| r.get(0)).unwrap();
    let recorded: i64 = conn.query_row("SELECT COUNT(*) FROM schema_migration", [], |r| r.get(0)).unwrap();
    PHASES.with(|p| println!("FLEET_DIAGNOSTIC {}", json!({
        "sqliteVersion":sqlite,"migrations":recorded,"rows":measured.len(),
        "unmodifiedBody":baseline_stats,
        "phaseNames":["completionQueryAndMap","usageQueryAndMap","reminderQueryAndJson","enrichment"],
        "phases":*p.borrow(),
        "limits":"isolated diagnostic; allocation counts cover Rust requests, not SQLite C allocation or peak memory; not the full Tauri gate"
    })));
}
'''
    rust = "#![cfg(test)]\nuse rusqlite::{params, Connection};\nuse serde_json::{json, Value};\nuse std::collections::HashMap;\n" + db + snippets["error"] + snippets["usage"] + exact_reminders + snippets["database"] + instrumentation + instrumented + "#[test]\n" + snippets["regression"] + diagnostic
    (output / "src/lib.rs").write_text(rust)
    versions = {p["name"]: p["version"] for p in lock["package"]}
    manifest = '[package]\nname = "fleet-reminder-diagnostic"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n'
    manifest += f'rusqlite = {{ version = "={versions["rusqlite"]}", features = ["backup", "bundled"] }}\n'
    manifest += f'serde_json = {{ version = "={versions["serde_json"]}", features = ["float_roundtrip"] }}\n'
    manifest += f'libc = "={versions["libc"]}"\n'
    (output / "Cargo.toml").write_text(manifest)
    root_package = '[[package]]\nname = "fleet-reminder-diagnostic"\nversion = "0.1.0"\ndependencies = [\n "libc",\n "rusqlite",\n "serde_json",\n]\n\n'
    adapted, count = re.subn(r'\[\[package\]\]\nname = "deckchek"\n.*?(?=\[\[package\]\])', root_package, lock_text, count=1, flags=re.S)
    assert count == 1
    (output / "Cargo.lock").write_text(adapted)
    metadata = {
        "sourceCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
        "fleetSourceSha256": digest(source), "databaseSourceSha256": digest(db_source),
        "repositoryLockSha256": digest(lock_text), "harnessSha256": digest(rust),
        "snippetSha256": {name: digest(body) for name, body in snippets.items()},
        "migrationSha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in migrations},
        "originalRegressionIncluded": True, "unchangedBudgetMs": 200,
        "scope": "Linux extracted-source diagnostic, with app lock versions checked separately; not full Tauri or hosted qualification",
    }
    (output / "source-proof.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps({"output": str(output), "sourceCommit": metadata["sourceCommit"],
                      "harnessSha256": metadata["harnessSha256"], "migrations": len(migrations)}))


if __name__ == "__main__":
    main()
