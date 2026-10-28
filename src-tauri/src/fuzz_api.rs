//! Fuzz entry points for every parser that reads untrusted bytes (DeckChek original work).
//!
//! Each `fuzz_*` function takes arbitrary bytes and must never panic, hang or allocate
//! without bound; invariants that must hold for any input are asserted here so a violation
//! is reported as a crash. Two drivers share these functions:
//! - `src-tauri/fuzz/` (cargo-fuzz / libFuzzer, nightly, ASan) for coverage-guided runs;
//! - the `smoke` test module below (stable `cargo test`), which replays the committed seed
//!   corpus plus a fixed number of seeded mutations on every push.
//!
//! Compiled only for tests and with the `fuzzing` feature; never part of a release build.

use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;

use rusqlite::Connection;
use serde_json::Value;

use crate::{backup, canonical, db, dj_sessions, links, photo, system_check, userfiles};

/// Untrusted text inputs are decoded leniently, exactly as the app does for files on disk.
fn text(data: &[u8]) -> String {
    String::from_utf8_lossy(data).into_owned()
}

/// A per-process scratch folder (fuzz processes are single-threaded per worker).
fn scratch() -> &'static PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let d = std::env::temp_dir().join(format!("deckchek-fuzz-{}", std::process::id()));
        std::fs::create_dir_all(&d).expect("fuzz scratch dir");
        d
    })
}

/// Backup archive verification on raw bytes (zip structure, names, manifest, sizes, ratios).
pub fn fuzz_backup_inspect(data: &[u8]) {
    let p = scratch().join("inspect.deckchek-backup");
    std::fs::write(&p, data).expect("write scratch");
    let r = backup::inspect_file(&p);
    assert!(r.valid == r.errors.is_empty(), "inspect: valid flag and errors disagree");
}

/// Builds a structurally valid backup around fuzzed parts so the fuzzer reaches the deep
/// restore path (hostile SQLite database, settings JSON, extra entries) past the checksum gate.
/// Layout of `data`: [selector byte][db bytes ...] split at the first 0xFE 0xFE pair into db / ui JSON.
pub fn fuzz_backup_restore(data: &[u8]) {
    let (sel, rest) = match data.split_first() {
        Some((s, r)) => (*s, r),
        None => return,
    };
    let split = rest.windows(2).position(|w| w == [0xFE, 0xFE]);
    let (db_bytes, ui_bytes) = match split {
        Some(i) => (&rest[..i], &rest[i + 2..]),
        None => (rest, &[][..]),
    };
    // Half the time start from a real migrated database and overwrite a slice of it, so SQLite
    // gets past its header check and the fuzzer explores page/schema corruption.
    let db_payload = if sel & 1 == 1 { patch_template_db(db_bytes) } else { db_bytes.to_vec() };
    let dir = scratch().join("restore");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("restore dir");
    let archive = dir.join("in.deckchek-backup");
    let schema = if sel & 2 == 2 { 1 } else { db::MIGRATIONS.len() as i64 };
    write_backup_zip(&archive, &db_payload, if ui_bytes.is_empty() { None } else { Some(ui_bytes) }, schema, sel & 4 == 4);
    let ctx = backup::Ctx {
        live_db: dir.join("live.sqlite3"),
        backups_dir: dir.join("backups"),
        gate: db::gate(),
        capture_running: std::sync::Arc::new(|| false),
    };
    let _ = backup::restore_backup(&ctx, &archive, true, &backup::SettingsBlob::default(), None);
    // Whatever happened, the live database (if one was swapped in) must be openable and sane.
    if ctx.live_db.is_file() {
        let c = Connection::open(&ctx.live_db).expect("open restored live db");
        let ok: String = c.query_row("PRAGMA quick_check", [], |r| r.get(0)).unwrap_or_default();
        assert_eq!(ok, "ok", "restore swapped in a database that fails quick_check");
        let hostile: i64 = c
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type IN ('trigger','view')", [], |r| r.get(0))
            .unwrap_or(0);
        assert_eq!(hostile, 0, "restore accepted a database with triggers or views");
    }
}

fn template_db() -> &'static Vec<u8> {
    static T: OnceLock<Vec<u8>> = OnceLock::new();
    T.get_or_init(|| {
        let p = scratch().join("template.sqlite3");
        let _ = std::fs::remove_file(&p);
        {
            let c = Connection::open(&p).expect("template db");
            db::apply_migrations(&c).expect("template migrations");
        }
        std::fs::read(&p).expect("read template")
    })
}

fn patch_template_db(patch: &[u8]) -> Vec<u8> {
    let mut t = template_db().clone();
    if patch.len() >= 4 {
        let off = (u32::from_le_bytes([patch[0], patch[1], patch[2], patch[3]]) as usize) % t.len().max(1);
        for (i, b) in patch[4..].iter().enumerate() {
            if let Some(slot) = t.get_mut(off + i) {
                *slot = *b;
            }
        }
    }
    t
}

/// Writes a backup zip whose manifest matches the given parts (sizes + sha256).
pub fn write_backup_zip(path: &std::path::Path, db_bytes: &[u8], ui: Option<&[u8]>, schema: i64, extra_unknown: bool) {
    use zip::write::SimpleFileOptions;
    let mut files = vec![serde_json::json!({"name": "db/deckchek.sqlite3", "bytes": db_bytes.len(), "sha256": canonical::sha256_hex(db_bytes)})];
    if let Some(u) = ui {
        files.push(serde_json::json!({"name": "settings/ui.json", "bytes": u.len(), "sha256": canonical::sha256_hex(u)}));
    }
    let manifest = serde_json::json!({
        "format": "deckchek-backup", "formatVersion": backup::FORMAT_VERSION, "createdAt": "2026-01-01T00:00:00.000Z",
        "kind": "manual", "appVersion": "0.0.0-fuzz", "schemaVersion": schema, "counts": {}, "files": files,
    });
    let f = std::fs::File::create(path).expect("create zip");
    let mut z = zip::ZipWriter::new(f);
    let o = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    z.start_file("manifest.json", o).expect("zip");
    z.write_all(manifest.to_string().as_bytes()).expect("zip");
    z.start_file("db/deckchek.sqlite3", o).expect("zip");
    z.write_all(db_bytes).expect("zip");
    if let Some(u) = ui {
        z.start_file("settings/ui.json", o).expect("zip");
        z.write_all(u).expect("zip");
    }
    if extra_unknown {
        z.start_file("photos/not-a-hash.jpg", o).expect("zip");
        z.write_all(b"x").expect("zip");
    }
    z.finish().expect("zip finish");
}

/// Browser-workspace JSON import into a fresh, fully migrated database.
pub fn fuzz_workspace_import(data: &[u8]) {
    let Ok(v) = serde_json::from_slice::<Value>(data) else { return };
    let mut c = Connection::open_in_memory().expect("mem db");
    c.execute_batch("PRAGMA foreign_keys=ON;").expect("fk");
    db::apply_migrations(&c).expect("migrations");
    let _ = backup::import_workspace(&mut c, &v);
    let fk: i64 = c.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).unwrap_or(0);
    assert_eq!(fk, 0, "workspace import left dangling foreign keys");
}

/// Canonical JSON: output is canonical, idempotent and hash-stable.
pub fn fuzz_canonical(data: &[u8]) {
    let Ok(v) = serde_json::from_slice::<Value>(data) else { return };
    if let Ok(s) = canonical::canonical_json(&v) {
        assert!(canonical::is_canonical(&s), "canonical output not recognised as canonical");
        let back: Value = serde_json::from_str(&s).expect("canonical output parses");
        assert_eq!(canonical::canonical_json(&back).expect("re-canonicalise"), s, "canonical form not idempotent");
    }
    let _ = canonical::is_canonical(&text(data));
}

/// JPEG structure and metadata scan used before storing a photo.
pub fn fuzz_jpeg(data: &[u8]) {
    if let Ok(info) = photo::inspect_jpeg(data) {
        assert!(info.width > 0 && info.height > 0, "accepted a JPEG with a zero dimension");
    }
    let _ = photo::validate_jpeg(data);
}

/// URL policy, Windows Settings URIs and the allowlist parser.
pub fn fuzz_links(data: &[u8]) {
    let s = text(data);
    let _ = links::classify(&s, &links::Allowlist::bundled());
    let _ = links::is_settings_uri(&s);
    let a = links::Allowlist::parse(&s);
    let _ = a.matches("github.com");
}

/// Save-path validation and file-stem sanitising.
pub fn fuzz_userfiles(data: &[u8]) {
    let s = text(data);
    let _ = userfiles::validate_save_path(&s, &["json", "html", "csv"]);
    let stem = userfiles::sanitize_file_stem(&s);
    assert!(stem.chars().count() <= 81, "sanitised stem too long");
    assert!(stem.chars().all(|c| c.is_ascii_alphanumeric() || "._ -".contains(c)), "sanitised stem has a forbidden char");
    let _ = backup::entry_name_safe(&s);
}

/// DJ-software log timestamps and session spans.
pub fn fuzz_dj_logs(data: &[u8]) {
    let s = text(data);
    for line in s.lines().take(10_000) {
        let _ = dj_sessions::parse_stamp(line);
    }
    let spans = dj_sessions::spans_from_text(&s, 1_700_000_000);
    assert!(spans.iter().all(|(a, b)| a <= b), "session span ends before it starts");
}

/// System Health parsers for script output, WER reports and logs.
pub fn fuzz_system_check(data: &[u8]) {
    let s = system_check::decode_text(data);
    let _ = system_check::parse_drivers_output(&s);
    let _ = system_check::parse_events_output(&s);
    let _ = system_check::parse_wer(&s);
    let _ = system_check::analyze_text(&s);
    let _ = system_check::truncate_chars(&s, 200);
    if let Some((p, t)) = s.split_once('\n') {
        let _ = system_check::glob_match(p, t);
    }
}

/// Every target, by name, for the drivers.
pub const TARGETS: &[(&str, fn(&[u8]))] = &[
    ("backup_inspect", fuzz_backup_inspect),
    ("backup_restore", fuzz_backup_restore),
    ("workspace_import", fuzz_workspace_import),
    ("canonical", fuzz_canonical),
    ("jpeg", fuzz_jpeg),
    ("links", fuzz_links),
    ("userfiles", fuzz_userfiles),
    ("dj_logs", fuzz_dj_logs),
    ("system_check", fuzz_system_check),
];

#[cfg(test)]
mod smoke {
    //! Stable-toolchain fuzz smoke: committed seeds + seeded mutations, every push.
    use super::*;

    /// xorshift64*: deterministic, so a failure reproduces from the printed seed.
    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 >> 12;
            self.0 ^= self.0 << 25;
            self.0 ^= self.0 >> 27;
            self.0.wrapping_mul(0x2545_F491_4F6C_DD1D)
        }
        fn below(&mut self, n: usize) -> usize {
            if n == 0 { 0 } else { (self.next() % n as u64) as usize }
        }
    }

    const INTERESTING: &[&[u8]] = &[b"\0", b"\xff\xff\xff\xff", b"..", b"../", b"\"", b"{", b"}", b"[", b"]", b"9007199254740993", b"-0", b"1e308", b"\\u0000", b"\r\n", b"%00", b"\xef\xbb\xbf", b"\xff\xfe", b"PK\x03\x04", b"\xff\xd8\xff\xe1"];

    fn mutate(rng: &mut Rng, input: &[u8], max_len: usize) -> Vec<u8> {
        let mut v = input.to_vec();
        for _ in 0..1 + rng.below(8) {
            match rng.below(7) {
                0 if !v.is_empty() => { let i = rng.below(v.len()); v[i] ^= 1 << rng.below(8); }
                1 if !v.is_empty() => { let i = rng.below(v.len()); v[i] = rng.next() as u8; }
                2 => { let i = rng.below(v.len() + 1); let t = INTERESTING[rng.below(INTERESTING.len())]; v.splice(i..i, t.iter().copied()); }
                3 if !v.is_empty() => { let a = rng.below(v.len()); let b = (a + 1 + rng.below(16)).min(v.len()); v.drain(a..b); }
                4 if !v.is_empty() => { let a = rng.below(v.len()); let b = (a + 1 + rng.below(64)).min(v.len()); let chunk = v[a..b].to_vec(); let i = rng.below(v.len() + 1); v.splice(i..i, chunk); }
                5 => { let n = rng.below(v.len() + 1); v.truncate(n); }
                _ => { let i = rng.below(v.len() + 1); v.insert(i, rng.next() as u8); }
            }
        }
        v.truncate(max_len);
        v
    }

    fn corpus_dir(target: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fuzz").join("corpus").join(target)
    }

    fn seeds(target: &str) -> Vec<Vec<u8>> {
        let mut out = vec![Vec::new()];
        if let Ok(rd) = std::fs::read_dir(corpus_dir(target)) {
            let mut paths: Vec<_> = rd.flatten().map(|e| e.path()).filter(|p| p.is_file()).collect();
            paths.sort();
            out.extend(paths.into_iter().filter_map(|p| std::fs::read(p).ok()));
        }
        out
    }

    fn run(target: &str, iterations: usize) {
        let (_, f) = TARGETS.iter().find(|(n, _)| *n == target).expect("target");
        let seeds = seeds(target);
        assert!(seeds.len() > 1, "no committed seed corpus for {target} (run the write_seed_corpus test)");
        let mut rng = Rng(0x9E37_79B9_7F4A_7C15 ^ target.len() as u64);
        for s in &seeds {
            f(s);
        }
        for i in 0..iterations {
            let base = &seeds[rng.below(seeds.len())];
            let input = mutate(&mut rng, base, 1 << 16);
            let r = std::panic::catch_unwind(|| f(&input));
            if r.is_err() {
                let dump = scratch().join(format!("crash-{target}-{i}.bin"));
                let _ = std::fs::write(&dump, &input);
                panic!("fuzz smoke {target}: iteration {i} panicked; input saved to {}", dump.display());
            }
        }
    }

    // Budgets keep the whole module under ~20 s on a CI runner; the deep runs are cargo-fuzz.
    #[test] fn backup_inspect() { run("backup_inspect", 1500); }
    #[test] fn backup_restore() { run("backup_restore", 150); }
    #[test] fn workspace_import() { run("workspace_import", 300); }
    #[test] fn canonical() { run("canonical", 5000); }
    #[test] fn jpeg() { run("jpeg", 5000); }
    #[test] fn links() { run("links", 5000); }
    #[test] fn userfiles() { run("userfiles", 5000); }
    #[test] fn dj_logs() { run("dj_logs", 3000); }
    #[test] fn system_check() { run("system_check", 3000); }

    /// Regenerates the seed corpus from real artefacts (run with `--ignored` after format changes).
    #[test]
    #[ignore]
    fn write_seed_corpus() {
        let put = |t: &str, name: &str, bytes: &[u8]| {
            let d = corpus_dir(t);
            std::fs::create_dir_all(&d).unwrap();
            std::fs::write(d.join(name), bytes).unwrap();
        };
        // Backups: a real one from create_backup, plus a hand-built minimal one.
        let dir = scratch().join("seed");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let live = dir.join("live.sqlite3");
        { let c = Connection::open(&live).unwrap(); db::apply_migrations(&c).unwrap(); }
        let dest = dir.join("seed.deckchek-backup");
        backup::create_backup(&live, &dest, backup::Kind::Manual, &backup::SettingsBlob { ui: Some(serde_json::json!({"theme": "dark"})), calibration: None }, &mut |_, _| {}).unwrap();
        put("backup_inspect", "real-backup.zip", &std::fs::read(&dest).unwrap());
        let mini = dir.join("mini.zip");
        write_backup_zip(&mini, b"not a database", Some(b"{\"a\":1}"), 1, true);
        put("backup_inspect", "mini.zip", &std::fs::read(&mini).unwrap());
        put("backup_restore", "template-patch", &[1, 0, 0, 0, 0, b'S', b'Q', b'L']);
        put("backup_restore", "raw-db-with-ui", b"\x00SQLite format 3\x00\xfe\xfe{\"theme\":\"light\"}");
        put("workspace_import", "workspace.json", br#"{"version":1,"runs":[{"id":"r1","workflow":"quick","label":"Quick","createdAt":"2026-01-01T00:00:00Z","metrics":[{"id":"rms_l","label":"RMS L","value":-12.5,"unit":"dBFS"}],"findings":[]}],"equipment":[{"id":"e1","type":"turntable","make":"Technics","model":"SL-1200MK7"}]}"#);
        put("workspace_import", "empty.json", br#"{"version":1,"runs":[],"equipment":[]}"#);
        if let Ok(v) = std::fs::read(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/canonical-vectors.json")) {
            put("canonical", "vectors.json", &v);
        }
        put("canonical", "nested.json", br#"{"b":[1,2,{"z":null,"a":true}],"a":"\u00e9\n","c":-9007199254740991}"#);
        put("jpeg", "tiny.jpg", &crate::photo::test_support::tiny_jpeg(4, 3, &[], 7));
        put("jpeg", "exif.jpg", &[0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x08, b'E', b'x', b'i', b'f', 0, 0, 0xFF, 0xD9]);
        put("links", "urls.txt", b"https://github.com/djshellshoxxx/deckchek/issues");
        put("links", "allowlist.json", br#"{"version":1,"hosts":["github.com"],"allowSubdomains":["pioneerdj.com"]}"#);
        put("links", "settings.txt", b"ms-settings:sound");
        put("userfiles", "path.txt", b"/home/user/Documents/report.html");
        put("userfiles", "win.txt", b"C:\\Users\\dj\\Desktop\\CON.json");
        put("dj_logs", "serato.log", b"2026-03-01 21:00:01.123 Serato started\n[2026-03-01T22:15:00+01:00] deck A load\n2026-03-01 23:59:59 quit\n");
        put("system_check", "drivers.json", br#"{"drivers":[{"class":"MEDIA","name":"Pioneer DJM-A9","manufacturer":"Pioneer","version":"1.0"}],"asio":[{"name":"Traktor Audio 8"}],"errors":[]}"#);
        put("system_check", "events.json", br#"[{"log":"System","provider":"Service Control Manager","id":7034,"time":"2026-01-01T00:00:00Z","message":"The Windows Audio service terminated unexpectedly.","props":["a","b"]}]"#);
        put("system_check", "wer.txt", b"Version=1\r\nEventType=APPCRASH\r\nSig[0].Name=Application Name\r\nSig[0].Value=Serato DJ Pro.exe\r\n");
    }
}
