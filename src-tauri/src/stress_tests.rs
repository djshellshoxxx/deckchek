//! Stress and performance tests for the persistence layer (DeckChek original work).
//! `#[ignore]`d: run with `cargo test --release --lib stress_tests -- --ignored --nocapture`
//! (nightly CI). Each prints `STRESS {json}` with wall time and peak RSS (Linux VmHWM).

use std::path::PathBuf;
use std::time::Instant;

use rusqlite::Connection;

use crate::backup;
use crate::db::{self, PersistMeasurement, PersistRun};

fn peak_rss_mb() -> Option<u64> {
    let s = std::fs::read_to_string("/proc/self/status").ok()?;
    let kb: u64 = s.lines().find(|l| l.starts_with("VmHWM:"))?.split_whitespace().nth(1)?.parse().ok()?;
    Some(kb / 1024)
}

fn report(name: &str, t0: Instant, budget_ms: u128) {
    let ms = t0.elapsed().as_millis();
    println!("STRESS {{\"name\":\"{name}\",\"ms\":{ms},\"peakRssMb\":{},\"budgetMs\":{budget_ms}}}", peak_rss_mb().map(|v| v.to_string()).unwrap_or_else(|| "null".into()));
    assert!(ms <= budget_ms, "{name}: {ms} ms over budget {budget_ms} ms");
}

fn tmp(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("deckchek-stress-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn run(i: usize, measurements: usize) -> PersistRun {
    PersistRun {
        id: format!("stress-{i:06}"),
        test: "Stereo balance".into(),
        created_at: format!("2026-01-01T00:{:02}:{:02}Z", (i / 60) % 60, i % 60),
        score: Some(80.0),
        measurements: (0..measurements)
            .map(|k| PersistMeasurement { metric_id: format!("metric_{k}"), label: Some(format!("Metric {k} ü")), value: i as f64 + k as f64 / 10.0, unit: "dB".into(), origin: None, confidence: Some(0.9), uncertainty: None, quality_flags: None })
            .collect(),
        ..Default::default()
    }
}

#[test]
#[ignore]
fn stress_persist_list_backup_restore_large_history() {
    let dir = tmp("history");
    let live = dir.join("live.sqlite3");
    let n = 5_000;
    {
        let mut c = Connection::open(&live).unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        db::apply_migrations(&c).unwrap();
        let t0 = Instant::now();
        for i in 0..n {
            db::persist_run(&mut c, &run(i, 30)).unwrap();
        }
        report("persist 5000 runs x 30 measurements", t0, 240_000);
        let t0 = Instant::now();
        let listed = db::list_runs(&c, Some(500)).unwrap();
        report("list_runs 500 of 5000", t0, 2_000);
        assert_eq!(listed.len(), 500);
        // Re-saving the same run twice is idempotent (no duplicate measurements).
        db::persist_run(&mut c, &run(7, 30)).unwrap();
        let m: i64 = c.query_row("SELECT COUNT(*) FROM measurement", [], |r| r.get(0)).unwrap();
        assert_eq!(m, (n * 30) as i64);
    }
    let size_mb = std::fs::metadata(&live).unwrap().len() / 1_000_000;
    println!("STRESS-INFO database size {size_mb} MB");
    let dest = dir.join("big.deckchek-backup");
    let t0 = Instant::now();
    backup::create_backup(&live, &dest, backup::Kind::Manual, &backup::SettingsBlob::default(), &mut |_, _| {}).unwrap();
    report("create backup of large DB", t0, 60_000);
    let t0 = Instant::now();
    let inspected = backup::inspect_file(&dest);
    report("inspect backup of large DB", t0, 30_000);
    assert!(inspected.valid, "{:?}", inspected.errors);
    let ctx = backup::Ctx { live_db: dir.join("restored.sqlite3"), backups_dir: dir.join("backups"), gate: Box::leak(Box::new(std::sync::RwLock::new(()))), capture_running: std::sync::Arc::new(|| false), activity: Default::default() };
    let t0 = Instant::now();
    backup::restore_backup(&ctx, &dest, true, &backup::SettingsBlob::default(), None).unwrap();
    report("restore large backup", t0, 120_000);
    let c = Connection::open(&ctx.live_db).unwrap();
    let runs: i64 = c.query_row("SELECT COUNT(*) FROM session", [], |r| r.get(0)).unwrap();
    assert_eq!(runs, n as i64);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
#[ignore]
fn stress_workspace_import_at_the_cap() {
    let mut c = Connection::open_in_memory().unwrap();
    c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    db::apply_migrations(&c).unwrap();
    let runs: Vec<serde_json::Value> = (0..10_000)
        .map(|i| serde_json::json!({"id": format!("w{i}"), "test": "Quick Check", "createdAt": "2026-01-01T00:00:00Z",
            "measurements": (0..20).map(|k| serde_json::json!({"metricId": format!("m{k}"), "value": k, "unit": "dB"})).collect::<Vec<_>>(), "findings": []}))
        .collect();
    let payload = serde_json::json!({"version": 1, "runs": runs, "equipment": []});
    let t0 = Instant::now();
    let r = backup::import_workspace(&mut c, &payload).unwrap();
    report("import_workspace 10000 runs (cap)", t0, 240_000);
    assert_eq!(r.runs_imported, 10_000);
    let over = serde_json::json!({"version": 1, "runs": vec![serde_json::json!({"id": "x"}); 10_001], "equipment": []});
    assert_eq!(backup::import_workspace(&mut c, &over).unwrap_err().code, "too_large");
}

#[test]
#[ignore]
fn stress_concurrent_readers_during_backup() {
    let dir = tmp("concurrent");
    let live = dir.join("live.sqlite3");
    {
        let mut c = Connection::open(&live).unwrap();
        db::apply_migrations(&c).unwrap();
        for i in 0..1_000 {
            db::persist_run(&mut c, &run(i, 10)).unwrap();
        }
    }
    let t0 = Instant::now();
    let readers: Vec<_> = (0..4)
        .map(|_| {
            let p = live.clone();
            std::thread::spawn(move || {
                let c = Connection::open(&p).unwrap();
                for _ in 0..50 {
                    assert_eq!(db::list_runs(&c, Some(100)).unwrap().len(), 100);
                }
            })
        })
        .collect();
    for k in 0..3 {
        let dest = dir.join(format!("b{k}.deckchek-backup"));
        backup::create_backup(&live, &dest, backup::Kind::Manual, &backup::SettingsBlob::default(), &mut |_, _| {}).unwrap();
        assert!(backup::inspect_file(&dest).valid);
    }
    for r in readers {
        r.join().unwrap();
    }
    report("3 backups during 4x50 concurrent list_runs", t0, 120_000);
    let _ = std::fs::remove_dir_all(&dir);
}
