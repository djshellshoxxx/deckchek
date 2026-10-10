//! Failing reproductions for the October 2026 deep bug hunt
//! (`docs/audit/2026-10-bug-hunt.md`). Compiled for tests only.
//!
//! Every test here demonstrates a confirmed defect and therefore FAILS on the
//! current code. Each is `#[ignore]`d with its BUG id so the suite stays green.
//! Run them with:
//!
//! ```text
//! cargo test --lib audit_repro -- --ignored
//! ```
//!
//! When a fix lands, delete the `#[ignore]` line of the matching test so it
//! guards against regressions.

use rusqlite::Connection;
use serde_json::json;

use crate::db::{apply_migrations, persist_run, save_scan_alignment, PersistRun, ScanAlignmentInput};

fn mem_db() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    // Same pragma as `db::open_database`.
    c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    apply_migrations(&c).unwrap();
    c
}

fn run(id: &str) -> PersistRun {
    serde_json::from_value(json!({
        "id": id,
        "test": "vinyl_scan",
        "createdAt": "2026-10-10T20:00:00.000Z",
        "measurements": [{"metricId": "vinyl_condition_score", "value": 80.0, "unit": "score"}],
        "findings": [],
        "score": 80.0
    }))
    .unwrap()
}

fn count(c: &Connection, sql: &str) -> i64 {
    c.query_row(sql, [], |r| r.get(0)).unwrap()
}

/// BUG-01: re-saving a run (Ctrl+S "save as baseline", History > Save) runs
/// `INSERT OR REPLACE INTO session`. With `foreign_keys=ON`, REPLACE deletes the
/// old row first, so every `ON DELETE CASCADE` child that persist_run does not
/// rewrite is destroyed (full_side_scan -> scan_alignment, vinyl_event, wear_scan)
/// and every `ON DELETE SET NULL` link from other features is cut.
#[test]
#[ignore = "BUG-01: persist_run INSERT OR REPLACE cascades away repeat-scan alignments"]
fn bug01_resaving_a_run_keeps_its_repeat_scan_alignment() {
    let mut c = mem_db();
    persist_run(&mut c, &run("scan-1")).unwrap();
    persist_run(&mut c, &run("scan-2")).unwrap();
    // flow.js: saveRepeatScanAlignment(run) right after the run is saved.
    let input: ScanAlignmentInput = serde_json::from_value(json!({
        "scanA": {"sessionId": "scan-1", "recordTitle": "Control vinyl", "sideLabel": "A", "startSample": 0, "endSample": 1000},
        "scanB": {"sessionId": "scan-2", "startSample": 0, "endSample": 1000},
        "method": "normalized_event_map_v1", "offsetSamples": 0, "confidence": 0.9,
        "counts": {"persistent": 3, "new": 1, "missing": 0}
    }))
    .unwrap();
    save_scan_alignment(&mut c, &input).unwrap();
    assert_eq!(count(&c, "SELECT COUNT(*) FROM scan_alignment"), 1);
    assert_eq!(count(&c, "SELECT COUNT(*) FROM full_side_scan"), 2);

    // The user presses Ctrl+S on the second run: persistRun(run) again, same id.
    persist_run(&mut c, &run("scan-2")).unwrap();

    assert_eq!(count(&c, "SELECT COUNT(*) FROM full_side_scan"), 2, "the second scan row was cascade-deleted");
    assert_eq!(count(&c, "SELECT COUNT(*) FROM scan_alignment"), 1, "the repeat-scan alignment was cascade-deleted");
}

/// BUG-01 (second face): links from other features (`ON DELETE SET NULL`) are cut
/// by the same REPLACE, e.g. a confirmed hours entry proposed from this run.
#[test]
#[ignore = "BUG-01: persist_run INSERT OR REPLACE nulls asset_usage.session_id"]
fn bug01_resaving_a_run_keeps_usage_links() {
    let mut c = mem_db();
    persist_run(&mut c, &run("live-1")).unwrap();
    c.execute(
        "INSERT INTO asset (id, nickname, is_deleted, created_at, updated_at) VALUES ('stylus-1', 'Stylus', 0, 'x', 'x')",
        [],
    )
    .unwrap();
    let input: crate::usage::UsageAddInput = serde_json::from_value(json!({
        "assetId": "stylus-1", "startedAt": "2026-10-10T19:00:00.000Z", "hours": 1.0, "source": "deckchek", "sessionId": "live-1"
    }))
    .unwrap();
    crate::usage::add(&c, &input).unwrap();

    persist_run(&mut c, &run("live-1")).unwrap();

    let sid: Option<String> = c.query_row("SELECT session_id FROM asset_usage", [], |r| r.get(0)).unwrap();
    assert_eq!(sid.as_deref(), Some("live-1"), "re-saving the run cut the hours entry's link to it");
}

/// BUG-11: `usage_list(since)` and its ORDER BY compare timestamps as text, but
/// `valid_timestamp` accepts both `...SSZ` and `...SS.fffZ`. '.' sorts before 'Z',
/// so an entry at 20:00:00.500Z is dropped by `since = 20:00:00Z` although it is later.
#[test]
#[ignore = "BUG-11: usage since-filter compares mixed timestamp shapes as text"]
fn bug11_since_filter_keeps_later_entries_with_milliseconds() {
    let c = mem_db();
    c.execute(
        "INSERT INTO asset (id, nickname, is_deleted, created_at, updated_at) VALUES ('stylus-1', 'Stylus', 0, 'x', 'x')",
        [],
    )
    .unwrap();
    let input: crate::usage::UsageAddInput = serde_json::from_value(json!({
        "assetId": "stylus-1", "startedAt": "2026-10-10T20:00:00.500Z", "hours": 1.0, "source": "manual"
    }))
    .unwrap();
    crate::usage::add(&c, &input).unwrap();
    assert!(crate::usage::valid_timestamp("2026-10-10T20:00:00Z"));
    let rows = crate::usage::list(&c, "stylus-1", Some("2026-10-10T20:00:00Z")).unwrap();
    assert_eq!(rows.len(), 1, "an entry 0.5 s after `since` was filtered out");
}

/// BUG-12: tail reads of logs larger than 2 MiB seek past the BOM, so a UTF-16LE
/// log is decoded as UTF-8 (NUL-interleaved text) and yields nothing.
#[test]
#[ignore = "BUG-12: UTF-16 logs over 2 MiB lose their BOM in the tail read"]
fn bug12_large_utf16_log_still_yields_spans() {
    let dir = std::env::temp_dir().join(format!("deckchek-audit-utf16-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("big.log");
    let mut text = String::new();
    while text.len() < 1_200_000 {
        text.push_str("filler line without a timestamp\n");
    }
    text.push_str("2025-10-10T20:00:00Z open\n2025-10-10T20:25:00Z x\n2025-10-10T20:45:00Z close\n");
    let mut bytes = vec![0xFF, 0xFE];
    for u in text.encode_utf16() {
        bytes.extend_from_slice(&u.to_le_bytes());
    }
    assert!(bytes.len() > 2 * 1024 * 1024);
    std::fs::write(&path, &bytes).unwrap();
    let spans = crate::dj_sessions::spans_from_files(&[("Mixxx".into(), path)]);
    let _ = std::fs::remove_dir_all(&dir);
    assert_eq!(spans.len(), 1, "the session at the end of a large UTF-16 log was not found");
}
