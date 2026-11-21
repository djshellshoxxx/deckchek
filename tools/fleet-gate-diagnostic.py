#!/usr/bin/env python3
"""Emit a temporary, source-bound Linux Fleet diagnostic for the full native crate.

This never edits the source checkout. The caller may install the emitted fleet.rs
in a disposable checkout AFTER preserving one untouched full-suite ASan result.
The normal 200 ms assertion, fixture, dependencies and CI workflow stay intact.
"""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import textwrap


FLEET_SHA256 = "3555c7d515aa64c383098ded7954e2f65c4899ae4589018ffaf0d03f54cef186"
MODULE = "fleet_gate_diagnostic"


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()


def between(source, start, end):
    if source.count(start) != 1:
        raise SystemExit(f"Expected one source anchor: {start!r}")
    begin = source.index(start)
    finish = source.index(end, begin)
    return source[begin:finish]


def replace_once(source, old, new):
    if source.count(old) != 1:
        raise SystemExit(f"Expected one measurement anchor: {old!r}")
    return source.replace(old, new, 1)


SUPPORT = r'''
    // Kernel counters surround wall intervals; procfs reads add overhead outside
    // those wall intervals. Zero/unavailable counters do not establish no wait.
    pub(super) fn scheduler_snapshot() -> Option<[u64; 3]> {
        let text = std::fs::read_to_string("/proc/thread-self/schedstat").ok()?;
        let mut fields = text.split_whitespace();
        let values = [fields.next()?.parse().ok()?, fields.next()?.parse().ok()?,
            fields.next()?.parse().ok()?];
        if fields.next().is_some() { return None; }
        Some(values)
    }
    fn scheduler_delta(before: Option<[u64; 3]>, after: Option<[u64; 3]>) -> Value {
        let delta = before.zip(after).and_then(|(b, a)| Some([
            a[0].checked_sub(b[0])?, a[1].checked_sub(b[1])?, a[2].checked_sub(b[2])?
        ]));
        match delta {
            Some(d) => json!({"cpuRuntimeNs":d[0], "runqueueWaitNs":d[1],
                "timeslices":d[2], "cpuCounterAdvanced":d[0] != 0}),
            None => Value::Null,
        }
    }
    pub(super) fn print_gate(wall_ns: u128, before: Option<[u64; 3]>) {
        let after = scheduler_snapshot();
        println!("FLEET_GATE_CONTEXT {}", json!({
            "wallNs":wall_ns, "schedulerBefore":before, "schedulerAfter":after,
            "schedulerDelta":scheduler_delta(before, after), "budgetMs":200,
            "scope":"full-suite test; only wallNs is the existing assertion interval; scheduler snapshots surround it"
        }));
    }
    struct Mark { wall: std::time::Instant, scheduler: Option<[u64; 3]> }
    impl Mark {
        fn now() -> Self {
            let scheduler = scheduler_snapshot();
            Self { wall: std::time::Instant::now(), scheduler }
        }
        fn elapsed(&self) -> Value {
            let wall_ns = self.wall.elapsed().as_nanos();
            let after = scheduler_snapshot();
            json!({"wallNs":wall_ns, "schedulerBefore":self.scheduler,
                "schedulerAfter":after, "schedulerDelta":scheduler_delta(self.scheduler, after)})
        }
    }
    fn record_phase(name: &str, mark: &mut Mark, phases: &mut Vec<Value>) {
        phases.push(json!({"name":name, "measurement":mark.elapsed()}));
        *mark = Mark::now();
    }
    fn query_plan(conn: &Connection, sql: &str, asset: Option<&str>) -> Vec<String> {
        conn.prepare(&format!("EXPLAIN QUERY PLAN {sql}")).unwrap()
            .query_map([asset], |row| row.get::<_, String>(3)).unwrap()
            .collect::<Result<Vec<_>, _>>().unwrap()
    }
'''


TRIALS = r'''
        // Four pairs are a fixed diagnostic bound, not an attempt-until-green loop.
        // Each pair reuses the same in-memory fixture. First-call pages have been
        // warmed by fixture writes and its original pre-fixture plan assertions.
        for pair in 0..4 {
            let mut phases = Vec::with_capacity(4);
            let baseline;
            let baseline_stats;
            let measured;
            let measured_stats;
            if pair % 2 == 0 {
                let mark = Mark::now();
                baseline = reminders(&conn, None).unwrap();
                baseline_stats = mark.elapsed();
                let mark = Mark::now();
                measured = measured_reminders(&conn, None, &mut phases).unwrap();
                measured_stats = mark.elapsed();
            } else {
                let mark = Mark::now();
                measured = measured_reminders(&conn, None, &mut phases).unwrap();
                measured_stats = mark.elapsed();
                let mark = Mark::now();
                baseline = reminders(&conn, None).unwrap();
                baseline_stats = mark.elapsed();
            }
            assert_eq!(baseline.len(), 2000);
            assert_eq!(measured, baseline, "phase copy must preserve every returned row");
            assert_eq!(phases.len(), 4);
            println!("FLEET_PHASE_SAMPLE {}", json!({
                "pair":pair, "baselineFirst":pair % 2 == 0,
                "pairContainsFirstReminderCallOnFreshFixture":pair == 0,
                "rows":baseline.len(), "allRowsEqual":true,
                "baselineWholeCall":baseline_stats, "instrumentedWholeCall":measured_stats,
                "phases":phases,
                "limits":"whole calls include return cleanup; four phases exclude it and recorder work; scheduler intervals surround wall intervals; no allocation measurement; repeated fixture is warm; not hosted qualification"
            }));
        }
        // Capture plans from this application's bundled SQLite after timings.
        let mut plans = Vec::new();
        for asset in [None, Some("fleet-5")] {
            for (name, sql) in [("reminders", REMINDERS_SQL),
                ("latestCompletions", LATEST_COMPLETIONS_SQL), ("confirmedUsage", USAGE_SQL)] {
                plans.push(json!({"query":name, "asset":asset,
                    "steps":query_plan(&conn, sql, asset)}));
            }
        }
        let sqlite: String = conn.query_row("SELECT sqlite_version()", [], |r| r.get(0)).unwrap();
        let migrations: i64 = conn.query_row("SELECT COUNT(*) FROM schema_migration", [], |r| r.get(0)).unwrap();
        assert_eq!(migrations, 25);
        let compile_options = conn.prepare("PRAGMA compile_options").unwrap()
            .query_map([], |r| r.get::<_, String>(0)).unwrap()
            .collect::<Result<Vec<_>, _>>().unwrap();
        println!("FLEET_SQL_CONTEXT {}", json!({"sqliteVersion":sqlite,
            "migrations":migrations, "compileOptions":compile_options, "queryPlans":plans,
            "fixture":{"seedAssets":2,"fleetAssets":1000,"reminders":2000,
                "events":10000,"confirmedUsageRows":3000},
            "availableParallelism":std::thread::available_parallelism().ok().map(|n| n.get())
        }));
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--expected-commit", required=True)
    parser.add_argument("--expected-tree", required=True)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    repo = args.source.resolve()
    output = args.output.resolve()
    if output == repo or repo in output.parents:
        raise SystemExit("Output must be outside the source repository.")
    if output.exists() and any(output.iterdir()):
        raise SystemExit("Existing diagnostic output is preserved; choose an empty directory.")
    commit = git(repo, "rev-parse", "HEAD")
    tree = git(repo, "rev-parse", "HEAD^{tree}")
    if commit != args.expected_commit or tree != args.expected_tree:
        raise SystemExit("Source commit/tree differs from the explicitly expected identity.")
    if git(repo, "status", "--porcelain", "--untracked-files=no"):
        raise SystemExit("Tracked source must be clean before diagnostic generation.")
    original_bytes = (repo / "src-tauri/src/fleet.rs").read_bytes()
    if sha256(original_bytes) != FLEET_SHA256:
        raise SystemExit("Fleet source differs from this reviewed diagnostic's exact input.")
    original = original_bytes.decode()
    function = between(original, "pub fn reminders(", "#[derive(Debug, Deserialize)]")
    database = textwrap.dedent(between(original, "    fn database()", "    fn reminder("))
    regression = between(original,
        "    fn regression_reminder_overview_has_no_per_reminder_scans_and_meets_budget()",
        "    #[test]\n    fn reminder_read_preserves_optional_fields")
    fixture = regression.split("{\n", 1)[1].split(
        "        let started = std::time::Instant::now();", 1)[0]
    usage = between(original, "type ConfirmedUsageByAsset", "/// Titles of a device profile")
    usage_sql = between(usage, 'conn.prepare("', '").map_err(err)?;')[len('conn.prepare('):] + '"'
    measured = replace_once(function, "pub fn reminders(conn: &Connection, asset: Option<&str>)",
        "fn measured_reminders(conn: &Connection, asset: Option<&str>, phases: &mut Vec<Value>)")
    insertions = [
        ("    let mut completions:", "    let mut mark = Mark::now();\n    let mut completions:"),
        ("    let usage = if", '    record_phase("completionQueryAndMap", &mut mark, phases);\n    let usage = if'),
        ("    let mut query = conn.prepare(REMINDERS_SQL)",
            '    record_phase("usageQueryAndMap", &mut mark, phases);\n    let mut query = conn.prepare(REMINDERS_SQL)'),
        ("    for row in &mut rows {", '    record_phase("reminderQueryAndJson", &mut mark, phases);\n    for row in &mut rows {'),
        ("    Ok(rows)", '    record_phase("enrichment", &mut mark, phases);\n    Ok(rows)'),
    ]
    for old, new in insertions:
        measured = replace_once(measured, old, new)
    restored = measured
    for old, new in reversed(insertions):
        restored = replace_once(restored, new, old)
    restored = replace_once(restored,
        "fn measured_reminders(conn: &Connection, asset: Option<&str>, phases: &mut Vec<Value>)",
        "pub fn reminders(conn: &Connection, asset: Option<&str>)")
    if restored != function:
        raise SystemExit("Instrumentation no longer round-trips to the exact original function.")
    before = '        #[cfg(target_os = "linux")]\n        let fleet_gate_scheduler_before = super::fleet_gate_diagnostic::scheduler_snapshot();\n'
    after = '\n        #[cfg(target_os = "linux")]\n        super::fleet_gate_diagnostic::print_gate(elapsed.as_nanos(), fleet_gate_scheduler_before);'
    probed_regression = replace_once(regression,
        "        let started = std::time::Instant::now();",
        before + "        let started = std::time::Instant::now();")
    probed_regression = replace_once(probed_regression,
        "        let elapsed = started.elapsed();",
        "        let elapsed = started.elapsed();" + after)
    if probed_regression.replace(before, "", 1).replace(after, "", 1) != regression:
        raise SystemExit("Gate probes no longer round-trip to the exact regression.")
    overlay = replace_once(original, regression, probed_regression)
    module = '\n// Generated diagnostic only; never install as a production change.\n#[cfg(all(test, target_os = "linux"))]\nmod ' + MODULE + ' {\n    use super::*;\n'
    module += '    const USAGE_SQL: &str = ' + usage_sql + ';\n'
    module += textwrap.indent(database, "    ") + SUPPORT
    module += textwrap.indent(measured, "    ")
    module += '    #[test]\n    #[ignore = "explicit bounded Fleet profiling experiment"]\n    fn bounded_phase_measurements() {\n'
    module += fixture + TRIALS + '    }\n}\n'
    overlay_bytes = (overlay + module).encode()
    migrations = sorted((repo / "database/migrations").glob("[0-9][0-9][0-9][0-9]_*.sql"))
    if len(migrations) != 25:
        raise SystemExit("Expected the reviewed 25-migration fixture.")
    proof = {
        "sourceCommit": commit, "sourceTree": tree,
        "nativeTree": git(repo, "rev-parse", "HEAD:src-tauri"),
        "migrationTree": git(repo, "rev-parse", "HEAD:database/migrations"),
        "vendorTree": git(repo, "rev-parse", "HEAD:vendor"),
        "originalFleetSha256": sha256(original_bytes), "overlaySha256": sha256(overlay_bytes),
        "generatorSha256": sha256(Path(__file__).read_bytes()),
        "manifestSha256": sha256((repo / "src-tauri/Cargo.toml").read_bytes()),
        "lockSha256": sha256((repo / "src-tauri/Cargo.lock").read_bytes()),
        "originalFunctionSha256": sha256(function.encode()),
        "originalRegressionSha256": sha256(regression.encode()),
        "fixtureSha256": sha256(fixture.encode()),
        "migrationSha256": {p.name: sha256(p.read_bytes()) for p in migrations},
        "exactFunctionRoundTrip": True, "exactRegressionRoundTrip": True,
        "unchangedBudgetMs": 200, "boundedPairs": 4,
        "scope": "transient full-native test-only diagnostic; original production function unchanged; no native execution implied by generation",
        "limits": "scheduler snapshots surround wall intervals; unsupported/zero counters are inconclusive; four phases exclude recorder and return cleanup; no allocation counts; fixture warm after writes; original hosted failure retained",
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "fleet.rs").write_bytes(overlay_bytes)
    (output / "source-proof.json").write_text(json.dumps(proof, indent=2) + "\n")
    print(json.dumps({"output": str(output), "sourceCommit": commit,
        "overlaySha256": proof["overlaySha256"], "unchangedBudgetMs": 200}))


if __name__ == "__main__":
    main()
