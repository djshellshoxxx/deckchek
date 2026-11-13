//! M7 schema compatibility tests, including upgrades from the out-of-order
//! FS-30 migration already present on main. Feature UI remains separately gated.
use rusqlite::Connection;

fn fresh() -> Connection {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    crate::db::apply_migrations(&db).unwrap();
    db
}

fn unit(db: &Connection) {
    db.execute_batch("INSERT INTO asset(id,nickname,created_at,updated_at) VALUES('unit','Unit','2026-10-01','2026-10-01');
        INSERT INTO device_profile(id,json,loaded_at) VALUES('profile','{}','2026-10-01');
        INSERT INTO device_test_result(id,asset_id,profile_id,test_id,status,created_at) VALUES('test','unit','profile','quick','pass','2026-10-01');").unwrap();
}

#[test]
fn fresh_m7_schema_is_idempotent_and_relationally_valid() {
    let db = fresh();
    unit(&db);
    for table in ["signing_key", "certificate", "reference_pack", "reference_sample", "customer", "service_job", "service_job_status_log", "service_job_log", "service_job_result", "maintenance_reminder"] {
        let exists: i64 = db.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1", [table], |row| row.get(0)).unwrap();
        assert_eq!(exists, 1, "{table}");
    }
    crate::db::apply_migrations(&db).unwrap();
    let count: i64 = db.query_row("SELECT COUNT(*) FROM schema_migration WHERE version BETWEEN 14 AND 17", [], |row| row.get(0)).unwrap();
    assert_eq!(count, 4);
    assert_eq!(db.query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0)).unwrap(), "ok");
    assert!(!db.prepare("PRAGMA foreign_key_check").unwrap().query([]).unwrap().next().unwrap().is_some());
}

#[test]
fn m7_upgrade_preserves_existing_rows_and_already_applied_fs30() {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch("PRAGMA foreign_keys=ON; CREATE TABLE schema_migration(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL,app_version TEXT);").unwrap();
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../database/migrations");
    let mut files: Vec<_> = std::fs::read_dir(root).unwrap().map(|entry| entry.unwrap().path()).collect();
    files.sort();
    for path in files {
        let name = path.file_name().unwrap().to_str().unwrap();
        let version: i64 = name[..4].parse().unwrap();
        if (14..=17).contains(&version) { continue; }
        db.execute_batch(&std::fs::read_to_string(path).unwrap()).unwrap();
        db.execute("INSERT OR IGNORE INTO schema_migration(version,applied_at) VALUES(?1,'2026-10-01')", [version]).unwrap();
    }
    unit(&db);
    crate::db::apply_migrations(&db).unwrap();
    crate::db::apply_migrations(&db).unwrap();
    assert_eq!(db.query_row("SELECT nickname FROM asset WHERE id='unit'", [], |row| row.get::<_, String>(0)).unwrap(), "Unit");
    assert_eq!(db.query_row("SELECT COUNT(*) FROM schema_migration WHERE version<=18", [], |row| row.get::<_, i64>(0)).unwrap(), 18);
    assert_eq!(db.query_row("SELECT deck_position_id FROM asset WHERE id='unit'", [], |row| row.get::<_, Option<String>>(0)).unwrap(), None);
}

#[test]
fn service_results_require_exactly_one_existing_reference_and_no_duplicates() {
    let db = fresh();
    unit(&db);
    db.execute_batch("INSERT INTO service_job(id,job_number,asset_id,status,reported_fault,opened_at,updated_at) VALUES('job','J-2026-0001','unit','intake','Noise','2026-10-01','2026-10-01');").unwrap();
    assert!(db.execute("INSERT INTO service_job_result(id,job_id,phase) VALUES('empty','job','before')", []).is_err());
    db.execute("INSERT INTO service_job_result(id,job_id,phase,device_test_result_id) VALUES('first','job','before','test')", []).unwrap();
    assert!(db.execute("INSERT INTO service_job_result(id,job_id,phase,device_test_result_id) VALUES('duplicate','job','before','test')", []).is_err());
    db.execute("INSERT INTO service_job_result(id,job_id,phase,device_test_result_id) VALUES('after','job','after','test')", []).unwrap();
    assert!(db.execute("INSERT INTO service_job_result(id,job_id,phase,device_test_result_id) VALUES('missing','job','before','no-test')", []).is_err());
    db.execute("DELETE FROM service_job WHERE id='job'", []).unwrap();
    assert_eq!(db.query_row("SELECT COUNT(*) FROM service_job_result", [], |row| row.get::<_, i64>(0)).unwrap(), 0);
}

#[test]
fn reference_hash_uniqueness_and_pack_cascade_are_enforced() {
    let db = fresh();
    db.execute_batch("INSERT INTO reference_pack(id,imported_at,row_count,sha256) VALUES('pack','2026-10-01',1,'hash');
        INSERT INTO reference_sample(id,pack_id,contributor,product_key,metric_key,method_key,method_version,value,unit,row_hash) VALUES('row','pack','anonymous','model','noise','rms',1,-62,'dBFS','row-hash');").unwrap();
    assert!(db.execute("INSERT INTO reference_sample SELECT 'duplicate',pack_id,contributor,product_key,metric_key,method_key,method_version,value,unit,row_hash FROM reference_sample", []).is_err());
    db.execute("DELETE FROM reference_pack WHERE id='pack'", []).unwrap();
    assert_eq!(db.query_row("SELECT COUNT(*) FROM reference_sample", [], |row| row.get::<_, i64>(0)).unwrap(), 0);
}

#[test]
fn fleet_reminder_constraints_reject_invalid_intervals_and_states() {
    let db = fresh();
    unit(&db);
    for (id, basis, interval, warning, enabled) in [("zero","days",0.0,14.0,1), ("negative","hours",-1.0,14.0,1), ("basis","weeks",7.0,14.0,1), ("warning","days",90.0,-1.0,1), ("enabled","days",90.0,14.0,2)] {
        assert!(db.execute("INSERT INTO maintenance_reminder(id,asset_id,title,basis,interval_value,warn_before,enabled,created_at) VALUES(?1,'unit','Clean',?2,?3,?4,?5,'2026-10-01')", rusqlite::params![id,basis,interval,warning,enabled]).is_err(), "{id}");
    }
    db.execute("INSERT INTO maintenance_reminder(id,asset_id,title,basis,interval_value,created_at) VALUES('valid','unit','Clean','days',90,'2026-10-01')", []).unwrap();
}
