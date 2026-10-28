//! Tests for `certificate.rs` (FS-20 §8): migration, sign/verify, adversarial input, extraction, storage.

use super::*;
use crate::signing::tests::{mem, tmpdir};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::json;

/// TEST ONLY key for the shared fixture (never used by the app).
const FIXTURE_SEED: [u8; 32] = [0x42; 32];
const NOW: &str = "2026-10-28T12:00:00.000Z";

fn repo(p: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(p)
}

fn sample_payload() -> Value {
    json!({
        "unit": {"model": "Pioneer DJ PLX-CRSS12", "productId": "pioneer-plx-crss12", "serial": "SN <001> & \"x\"", "firmware": "1.02", "notes": "Light wear on the platter.", "photos": [
            {"name": "front.jpg", "sha256": "0".repeat(64), "mime": "image/jpeg", "dataB64": "/9j/4AAQSkZJRgABAQ=="}
        ]},
        "plan": {"profileId": "pioneer-plx-crss12", "profileVersion": 3, "testIds": ["crss12-driver", "crss12-speed"]},
        "results": [
            {"testId": "crss12-driver", "title": "Driver present", "status": "pass", "detail": "Pass: 1==1"},
            {"testId": "crss12-speed", "title": "Platter speed", "status": "pass", "detail": "Pass: 0.05<=0.1"}
        ],
        "measurements": [
            {"testId": "crss12-speed", "metricId": "measured_pitch_percent", "label": "Speed error", "value": "0.05", "unit": "%", "uncertainty": "0.02",
             "referenceLow": "-0.1", "referenceHigh": "0.1", "methodKey": "audio:speed", "methodVersion": 1, "decision": "inside",
             "calibration": {"state": "calibrated", "refId": "focusrite|48000", "date": "2026-09-01T10:00:00.000Z"}}
        ],
        "tester": "Alex Tester",
        "deckchekVersion": "0.0.8",
        "schemaVersion": 1,
        "issuedAt": "2026-10-01T09:30:00.000Z",
        "validUntil": "2099-12-31T00:00:00.000Z",
        "verdict": "pass",
        "disclaimer": "This certificate proves the report was not changed after signing. It does not prove the tester measured honestly or that the unit has not changed since."
    })
}

fn sign_with(seed: &[u8; 32], payload: Value) -> Value {
    let (hash, digest) = content_hash(&payload).unwrap();
    let key = SigningKey::from_bytes(seed);
    let pk = key.verifying_key().to_bytes();
    json!({"format": FORMAT, "version": 1, "payload": payload, "integrity": {
        "alg": "ed25519", "hashAlg": "sha256", "contentHash": hash,
        "signature": B64.encode(key.sign(&digest).to_bytes()), "publicKey": B64.encode(pk), "fingerprint": signing::fingerprint(&pk)
    }})
}

fn verify(v: &Value) -> VerifyReport {
    verify_text(&serde_json::to_string_pretty(v).unwrap(), NOW, |_| false)
}

fn valid_file() -> Value {
    sign_with(&FIXTURE_SEED, sample_payload())
}

fn seed_rows(c: &Connection) {
    c.execute("INSERT INTO asset (id, nickname, created_at, updated_at) VALUES ('a','Deck','t','t')", []).unwrap();
    c.execute("INSERT INTO device_profile (id, json, loaded_at) VALUES ('pioneer-plx-crss12','{}','t')", []).unwrap();
}

#[test]
fn migration_0014_tables_exist_and_reapply_is_a_noop() {
    let c = mem();
    assert!(crate::db::MIGRATIONS.iter().any(|(v, sql)| *v == 14 && sql.contains("CREATE TABLE IF NOT EXISTS certificate")));
    crate::db::apply_migrations(&c).unwrap();
    let n: i64 = c.query_row("SELECT COUNT(*) FROM schema_migration WHERE version = 14", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 1);
    for t in ["signing_key", "certificate"] {
        let n: i64 = c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1", [t], |r| r.get(0)).unwrap();
        assert_eq!(n, 1, "{t}");
    }
}

#[test]
fn migration_upgrades_every_release_fixture_and_stores_a_certificate() {
    let dir = repo("tests/fixtures/db");
    let mut names: Vec<_> = fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).filter(|n| n.starts_with('v') && n.ends_with(".sql")).collect();
    names.sort();
    assert!(!names.is_empty());
    for name in names {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(&fs::read_to_string(dir.join(&name)).unwrap()).unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        let assets: i64 = c.query_row("SELECT COUNT(*) FROM asset", [], |r| r.get(0)).unwrap();
        crate::db::apply_migrations(&c).unwrap();
        assert_eq!(c.query_row::<i64, _, _>("SELECT COUNT(*) FROM asset", [], |r| r.get(0)).unwrap(), assets, "{name}: rows kept");
        let (asset, profile): (String, String) = c.query_row("SELECT asset_id, profile_id FROM device_test_result LIMIT 1", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        c.execute("INSERT INTO signing_key (id, public_key_b64, created_at) VALUES ('k-fixture','pk','t')", []).unwrap();
        c.execute(
            "INSERT INTO certificate (id, asset_id, profile_id, signing_key_id, serial_number, tester_name, verdict, content_hash, issued_at, valid_until, payload_json) VALUES ('c-fixture',?1,?2,'k-fixture','s','t','pass','h','i','u','{}')",
            params![asset, profile],
        )
        .unwrap();
        let fk: i64 = c.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).unwrap();
        assert_eq!(fk, 0, "{name}");
        let ok: String = c.query_row("PRAGMA integrity_check", [], |r| r.get(0)).unwrap();
        assert_eq!(ok, "ok");
    }
}

#[test]
fn certificate_table_enforces_verdict_check_and_foreign_keys() {
    let c = mem();
    seed_rows(&c);
    c.execute("INSERT INTO signing_key (id, public_key_b64, created_at) VALUES ('k','pk','t')", []).unwrap();
    let ins = "INSERT INTO certificate (id, asset_id, profile_id, signing_key_id, serial_number, tester_name, verdict, content_hash, issued_at, valid_until, payload_json) VALUES (?1,?2,'pioneer-plx-crss12',?3,'s','t',?4,'h','i','u','{}')";
    c.execute(ins, params!["c1", "a", "k", "draft"]).unwrap();
    assert!(c.execute(ins, params!["c2", "a", "k", "great"]).is_err(), "verdict CHECK");
    assert!(c.execute(ins, params!["c3", "nope", "k", "pass"]).is_err(), "asset FK");
    assert!(c.execute(ins, params!["c4", "a", "nokey", "pass"]).is_err(), "signing key FK");
}

#[test]
fn ac2_sign_verify_roundtrip_with_install_key_then_store_list_get() {
    let (c, d) = (mem(), tmpdir("cert"));
    seed_rows(&c);
    let payload = sample_payload();
    let s = sign_payload(&c, &d, &payload).unwrap();
    assert_eq!(s.content_hash, content_hash(&payload).unwrap().0);
    let file = json!({"format": FORMAT, "version": 1, "payload": payload, "integrity": {"alg": "ed25519", "hashAlg": "sha256", "contentHash": s.content_hash, "signature": s.signature_b64, "publicKey": s.public_key_b64, "fingerprint": s.fingerprint}});
    let text = serde_json::to_string(&file).unwrap();
    let r = verify_text(&text, NOW, |fp| signing::is_local_key(&c, fp));
    assert_eq!(r.status, "valid", "{:?}", r.reasons);
    assert!(r.issued_by_this_install && !r.expired);
    assert_eq!(r.serial.as_deref(), Some("SN <001> & \"x\""));
    let stored = store(&c, &StoreInput { asset_id: "a".into(), profile_id: "pioneer-plx-crss12".into(), file_json: text, pdf_path: Some("/tmp/x.pdf".into()), json_path: None }).unwrap();
    assert_eq!((stored.verdict.as_str(), stored.signing_key_id.as_str()), ("pass", s.fingerprint.as_str()));
    assert_eq!(stored.serial_number, "SN <001> & \"x\"");
    assert_eq!(list(&c, Some("a")).unwrap(), vec![stored.clone()]);
    assert_eq!(list(&c, None).unwrap().len(), 1);
    assert!(list(&c, Some("other")).unwrap().is_empty());
    let rec = get(&c, &stored.id).unwrap().unwrap();
    assert_eq!(verify_text(&rec.file_json, NOW, |_| true).status, "valid", "stored file re-verifies");
    assert!(get(&c, "missing").unwrap().is_none());
}

#[test]
fn store_rejects_tampered_foreign_or_mismatched_files() {
    let (c, d) = (mem(), tmpdir("store"));
    seed_rows(&c);
    signing::get_or_create_identity(&c, &d).unwrap();
    let foreign = serde_json::to_string(&valid_file()).unwrap();
    let input = |file_json: String, profile: &str| StoreInput { asset_id: "a".into(), profile_id: profile.into(), file_json, pdf_path: None, json_path: None };
    assert_eq!(store(&c, &input(foreign.clone(), "pioneer-plx-crss12")).unwrap_err().code(), "not_verified", "signed by another install");
    let tampered = foreign.replace("Alex Tester", "Alex Tester2");
    assert_eq!(store(&c, &input(tampered, "pioneer-plx-crss12")).unwrap_err().code(), "not_verified");
    let mut i = input(foreign, "pioneer-plx-crss12");
    i.pdf_path = Some("relative.pdf".into());
    assert_eq!(store(&c, &i).unwrap_err().code(), "bad_path");
    assert_eq!(store(&c, &input(String::new(), "")).unwrap_err().code(), "schema");
    // own key, but the plan names another profile
    let s = sign_payload(&c, &d, &sample_payload()).unwrap();
    let own = json!({"format": FORMAT, "version": 1, "payload": sample_payload(), "integrity": {"alg": "ed25519", "hashAlg": "sha256", "contentHash": s.content_hash, "signature": s.signature_b64, "publicKey": s.public_key_b64, "fingerprint": s.fingerprint}});
    assert_eq!(store(&c, &input(own.to_string(), "other-profile")).unwrap_err().code(), "schema");
    let n: i64 = c.query_row("SELECT COUNT(*) FROM certificate", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 0);
}

#[test]
fn store_input_rejects_unknown_fields() {
    let r: Result<StoreInput, _> = serde_json::from_value(json!({"assetId": "a", "profileId": "p", "fileJson": "{}", "verdict": "pass"}));
    assert!(r.is_err(), "the UI cannot override derived columns");
}

#[test]
fn sign_rejects_invalid_payloads() {
    let (c, d) = (mem(), tmpdir("signbad"));
    let mut p = sample_payload();
    p["verdict"] = json!("draft");
    assert_eq!(sign_payload(&c, &d, &p).unwrap_err().code(), "schema", "drafts are never signed");
    let mut p = sample_payload();
    p["measurements"][0]["value"] = json!(0.05);
    assert_eq!(sign_payload(&c, &d, &p).unwrap_err().code(), "schema", "numbers must be decimal strings");
    let mut p = sample_payload();
    p["extra"] = json!(1);
    assert_eq!(sign_payload(&c, &d, &p).unwrap_err().code(), "schema");
    let mut p = sample_payload();
    p["unit"]["photos"] = json!((0..7).map(|_| p["unit"]["photos"][0].clone()).collect::<Vec<_>>());
    assert_eq!(sign_payload(&c, &d, &p).unwrap_err().code(), "schema", "at most 6 photos");
    let mut p = sample_payload();
    p["validUntil"] = p["issuedAt"].clone();
    assert_eq!(sign_payload(&c, &d, &p).unwrap_err().code(), "schema");
}

#[test]
fn shared_fixture_is_the_deterministic_signed_sample_and_verifies() {
    let path = repo("tests/fixtures/certificate/valid-v1.deckchek-cert.json");
    let built = valid_file();
    if std::env::var("DECKCHEK_WRITE_FIXTURES").is_ok() {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, serde_json::to_string_pretty(&built).unwrap() + "\n").unwrap();
    }
    let text = fs::read_to_string(&path).expect("fixture (regenerate with DECKCHEK_WRITE_FIXTURES=1)");
    assert_eq!(parse_strict(&text).unwrap(), built, "JS consumes the same file (tests/certificate.test.mjs)");
    let r = verify_text(&text, NOW, |_| false);
    assert_eq!(r.status, "valid", "{:?}", r.reasons);
    assert_eq!(r.content_hash.as_deref(), built["integrity"]["contentHash"].as_str());
    assert!(!r.issued_by_this_install);
}

#[test]
fn ac4_one_byte_edits_never_verify_and_value_edits_name_content_hash_mismatch() {
    let text = serde_json::to_string_pretty(&valid_file()).unwrap();
    let start = text.find("\"payload\"").unwrap() + 12;
    let end = text.rfind("\"version\"").unwrap(); // keys are sorted: payload is followed by version
    assert!(end > start + 1000);
    let mut modified = 0;
    for i in start..end {
        let b = text.as_bytes()[i];
        if !b.is_ascii_alphanumeric() {
            continue;
        }
        let mut bytes = text.as_bytes().to_vec();
        bytes[i] = if b == b'7' { b'8' } else if b.is_ascii_digit() { b'7' } else if b == b'x' { b'y' } else { b'x' };
        let t = String::from_utf8(bytes).unwrap();
        let r = verify_text(&t, NOW, |_| false);
        assert_ne!(r.status, "valid", "byte {i} edit must never verify");
        if r.status == "modified" {
            assert_eq!(r.reasons[0], "content hash mismatch", "byte {i}");
            modified += 1;
        }
    }
    assert!(modified > 300, "{modified} modified");
    let text = serde_json::to_string(&valid_file()).unwrap().replace("\"0.05\"", "\"0.06\"");
    let r = verify_text(&text, NOW, |_| false);
    assert_eq!((r.status.as_str(), r.reasons[0].as_str()), ("modified", "content hash mismatch"));
}

#[test]
fn ac5_expired_is_valid_with_expired_flag() {
    let mut p = sample_payload();
    p["validUntil"] = json!("2026-10-02T00:00:00Z");
    let r = verify(&sign_with(&FIXTURE_SEED, p));
    assert_eq!(r.status, "valid");
    assert!(r.expired);
    assert!(!verify(&valid_file()).expired);
}

#[test]
fn adversarial_inputs_never_verify_and_never_panic() {
    let good = valid_file();
    let text = serde_json::to_string(&good).unwrap();
    let edit = |f: &dyn Fn(&mut Value)| {
        let mut v = good.clone();
        f(&mut v);
        serde_json::to_string(&v).unwrap()
    };
    let cases: Vec<(&str, String, &str)> = vec![
        ("truncated", text[..text.len() / 2].to_string(), "unverifiable"),
        ("empty", String::new(), "unverifiable"),
        ("not json", "hello".into(), "unverifiable"),
        ("array root", "[1,2]".into(), "unverifiable"),
        ("trailing data", format!("{text} {{}}"), "unverifiable"),
        ("wrong format", text.replace(FORMAT, "other-format"), "unverifiable"),
        ("future version", text.replacen("\"version\":1", "\"version\":2", 1), "unverifiable"),
        ("version as string", text.replacen("\"version\":1", "\"version\":\"1\"", 1), "unverifiable"),
        ("huge number", text.replacen("\"schemaVersion\":1", "\"schemaVersion\":1e400", 1), "unverifiable"),
        ("unsafe integer", text.replacen("\"schemaVersion\":1", "\"schemaVersion\":99999999999999999999", 1), "modified"),
        ("float in payload", text.replacen("\"profileVersion\":3", "\"profileVersion\":3.5", 1), "modified"),
        ("wrong type in payload", text.replacen("\"tester\":\"Alex Tester\"", "\"tester\":[\"Alex\"]", 1), "modified"),
        ("payload not object", edit(&|v| v["payload"] = json!("x")), "modified"),
        ("missing signature", edit(&|v| { v["integrity"].as_object_mut().unwrap().remove("signature"); }), "unverifiable"),
        ("empty signature", edit(&|v| v["integrity"]["signature"] = json!("")), "unverifiable"),
        ("no integrity", edit(&|v| { v.as_object_mut().unwrap().remove("integrity"); }), "unverifiable"),
        ("no payload", edit(&|v| { v.as_object_mut().unwrap().remove("payload"); }), "unverifiable"),
        ("integrity wrong type", edit(&|v| v["integrity"] = json!([1])), "unverifiable"),
        ("unknown alg", edit(&|v| v["integrity"]["alg"] = json!("rsa")), "unverifiable"),
        ("hash wrong length", edit(&|v| v["integrity"]["contentHash"] = json!("abc")), "unverifiable"),
        ("unknown top-level key", edit(&|v| v["extra"] = json!(1)), "unverifiable"),
        ("duplicate key", text.replacen("{\"format\"", "{\"format\":\"x\",\"format\"", 1), "unverifiable"),
        ("garbage signature", edit(&|v| v["integrity"]["signature"] = json!("!!!")), "modified"),
        ("bad public key", edit(&|v| v["integrity"]["publicKey"] = json!("AAAA")), "modified"),
        ("lone surrogate", text.replacen("Alex Tester", "\\ud800", 1), "unverifiable"),
    ];
    for (name, t, want) in cases {
        let r = verify_text(&t, NOW, |_| false);
        assert_eq!(r.status, want, "{name}: {:?}", r.reasons);
        assert!(!r.reasons.is_empty(), "{name} names a reason");
    }
}

#[test]
fn wrong_key_with_consistent_fingerprint_is_modified() {
    let mut v = valid_file();
    let other = SigningKey::from_bytes(&[7u8; 32]).verifying_key().to_bytes();
    v["integrity"]["publicKey"] = json!(B64.encode(other));
    v["integrity"]["fingerprint"] = json!(signing::fingerprint(&other));
    let r = verify(&v);
    assert_eq!(r.status, "modified");
    assert!(r.reasons[0].contains("signature does not match"), "{:?}", r.reasons);
    let mut v = valid_file();
    v["integrity"]["fingerprint"] = json!("0123456789abcdef");
    assert!(verify(&v).reasons[0].contains("fingerprint does not match"));
}

#[test]
fn small_order_public_key_is_rejected() {
    let mut v = valid_file();
    let mut identity = [0u8; 32];
    identity[0] = 1;
    let mut sig = [0u8; 64];
    sig[0] = 1;
    v["integrity"]["publicKey"] = json!(B64.encode(identity));
    v["integrity"]["fingerprint"] = json!(signing::fingerprint(&identity));
    v["integrity"]["signature"] = json!(B64.encode(sig));
    assert_eq!(verify(&v).status, "modified");
}

#[test]
fn re_signed_malformed_payload_is_unverifiable_not_valid() {
    let mut p = sample_payload();
    p["verdict"] = json!("excellent");
    let r = verify(&sign_with(&FIXTURE_SEED, p));
    assert_eq!(r.status, "unverifiable");
    assert!(r.reasons[0].contains("schema v1"));
}

#[test]
fn non_canonical_but_equal_json_still_verifies() {
    // pretty-printed, 1.0 for 1: the hash covers the canonical payload, not the file bytes
    let text = serde_json::to_string_pretty(&valid_file()).unwrap().replacen("\"schemaVersion\": 1", "\"schemaVersion\": 1.0", 1);
    assert_eq!(verify_text(&text, NOW, |_| false).status, "valid");
}

#[test]
fn size_and_depth_caps_reject_before_parsing() {
    let deep = format!("{}{}", "[".repeat(MAX_JSON_DEPTH + 1), "]".repeat(MAX_JSON_DEPTH + 1));
    assert_eq!(parse_strict(&deep).unwrap_err(), CertError::TooDeep);
    let ok = format!("{}{}", "[".repeat(MAX_JSON_DEPTH), "]".repeat(MAX_JSON_DEPTH));
    assert!(parse_strict(&ok).is_ok());
    assert!(parse_strict(&format!("[\"{}\\\"\"]", "[".repeat(100))).is_ok(), "brackets inside strings do not count");
    let bomb = "[".repeat(100_000);
    assert_eq!(verify_text(&bomb, NOW, |_| false).status, "unverifiable");
    let big = " ".repeat(MAX_JSON_BYTES as usize + 1);
    assert_eq!(parse_strict(&big).unwrap_err(), CertError::TooLarge);
    assert_eq!(verify_text(&big, NOW, |_| false).status, "unverifiable");
}

#[test]
fn ac3_extract_json_handles_json_html_pdf_and_rejects_bad_paths() {
    let d = tmpdir("extract dir with spaces");
    let text = serde_json::to_string_pretty(&valid_file()).unwrap();
    let json_path = d.join("Deck-SN1-2026-10-01.deckchek-cert.json");
    fs::write(&json_path, &text).unwrap();
    assert_eq!(extract_json(json_path.to_str().unwrap()).unwrap(), text);
    let html_path = d.join("cert.HTML");
    let embedded = serde_json::to_string(&valid_file()).unwrap().replace('<', "\\u003c");
    fs::write(&html_path, format!("<!doctype html><html><body><h1>Cert</h1>{HTML_MARKER}\n{embedded}\n</script></body></html>")).unwrap();
    let from_html = extract_json(html_path.to_str().unwrap()).unwrap();
    let r = verify_text(&from_html, NOW, |_| false);
    assert_eq!(r.status, "valid", "AC-8: HTML carries the identical signed JSON");
    assert_eq!(r.content_hash, verify_text(&text, NOW, |_| false).content_hash);
    let pdf = d.join("cert.pdf");
    fs::write(&pdf, b"%PDF-1.7").unwrap();
    assert_eq!(extract_json(pdf.to_str().unwrap()).unwrap_err().code(), "pdf_has_no_attachment");
    let plain = d.join("plain.html");
    fs::write(&plain, "<html>no data</html>").unwrap();
    assert_eq!(extract_json(plain.to_str().unwrap()).unwrap_err().code(), "no_certificate_data");
    let bin = d.join("bin.json");
    fs::write(&bin, [0xffu8, 0xfe, 0x00]).unwrap();
    assert_eq!(extract_json(bin.to_str().unwrap()).unwrap_err().code(), "not_utf8");
    let dotdot = format!("{}/../x.json", d.display());
    for bad in ["", "relative.json", "/etc/passwd", dotdot.as_str(), "/nope/missing.json", "/tmp/x.json\0"] {
        assert_eq!(extract_json(bad).unwrap_err().code(), "bad_path", "{bad:?}");
    }
    let exe = d.join("cert.exe");
    fs::write(&exe, "x").unwrap();
    assert_eq!(extract_json(exe.to_str().unwrap()).unwrap_err().code(), "bad_path");
    let folder = d.join("folder.json");
    fs::create_dir_all(&folder).unwrap();
    assert_eq!(extract_json(folder.to_str().unwrap()).unwrap_err().code(), "bad_path");
}

#[test]
fn oversized_file_is_rejected_from_metadata_before_reading() {
    let d = tmpdir("huge");
    let p = d.join("huge.json");
    let f = fs::File::create(&p).unwrap();
    f.set_len(MAX_JSON_BYTES + 1).unwrap(); // sparse: no 20 MB write needed
    assert_eq!(extract_json(p.to_str().unwrap()).unwrap_err(), CertError::TooLarge);
}

#[test]
fn errors_serialise_as_code_and_message_without_paths() {
    let e = serde_json::to_value(CertError::PdfNoAttachment).unwrap();
    assert_eq!(e["code"], "pdf_has_no_attachment");
    assert!(e["message"].as_str().unwrap().contains("no DeckChek data attached"));
    let e = extract_json("/home/someone/secret/folder/x.json").unwrap_err().to_string();
    assert!(!e.contains("someone"));
    let e = serde_json::to_value(CertError::Signing(crate::signing::SigningError::KeyCorrupt("bad header"))).unwrap();
    assert_eq!(e["code"], "key_corrupt");
}

#[test]
fn decimal_and_timestamp_validators() {
    for ok in ["0", "-0.5", "12.000001", "123456789012345", "0.000000000001"] {
        assert!(is_decimal(ok), "{ok}");
    }
    for bad in ["", "-", "01", "1.", ".5", "1e5", "1234567890123456", "0.0000000000001", "NaN", " 1", "+1"] {
        assert!(!is_decimal(bad), "{bad}");
    }
    for ok in ["2026-10-28T12:00:00Z", "2026-10-28T12:00:00.1Z", "2026-10-28T12:00:00.123Z"] {
        assert!(is_iso_utc(ok), "{ok}");
    }
    for bad in ["2026-10-28", "2026-13-28T12:00:00Z", "2026-10-28T12:00:00+01:00", "2026-10-28T12:00:00.Z", "x026-10-28T12:00:00Z", "2026-10-28T12:00:00.1234Z"] {
        assert!(!is_iso_utc(bad), "{bad}");
    }
    assert!(iso_key("2026-10-28T12:00:00Z") < iso_key("2026-10-28T12:00:00.001Z"));
}

#[test]
fn ac7_qr_text_is_prefix_plus_hash_and_nothing_personal() {
    let hash = content_hash(&sample_payload()).unwrap().0;
    let qr = format!("{QR_PREFIX}{hash}");
    assert_eq!(qr.len(), 81, "17-char prefix + 64 hex (spec §6 says 71: miscount; needs QR version 5-L, which qrSvg picks)");
    assert!(!qr.contains("SN") && !qr.contains("Alex"));
}

#[test]
fn contract_examples_round_trip() {
    let mut raw = fs::read_to_string(repo("tests/contracts/certificate.json")).unwrap();
    if !cfg!(windows) {
        // the contract shows Windows paths; elsewhere `C:\…` is not absolute, so map the folder to a Unix one
        raw = raw.replace(r"C:\\Users\\dj\\Documents\\DeckChek certificates\\", "/home/dj/DeckChek certificates/");
    }
    let v: Value = serde_json::from_str(&raw).unwrap();
    let fixture = fs::read_to_string(repo("tests/fixtures/certificate/valid-v1.deckchek-cert.json")).unwrap();
    let file = parse_strict(&fixture).unwrap();
    // identity and sign responses have exactly the serialised field names
    let id_keys: Vec<&str> = v["signing_get_identity"]["response"].as_object().unwrap().keys().map(String::as_str).collect();
    let real = serde_json::to_value(crate::signing::get_or_create_identity(&mem(), &tmpdir("contract")).unwrap()).unwrap();
    assert_eq!(real.as_object().unwrap().keys().map(String::as_str).collect::<Vec<_>>(), id_keys);
    let sign = SignResult { content_hash: file["integrity"]["contentHash"].as_str().unwrap().into(), signature_b64: file["integrity"]["signature"].as_str().unwrap().into(), public_key_b64: file["integrity"]["publicKey"].as_str().unwrap().into(), fingerprint: file["integrity"]["fingerprint"].as_str().unwrap().into(), protection: "dpapi".into() };
    assert_eq!(serde_json::to_value(&sign).unwrap(), v["certificate_sign"]["response"]);
    assert_eq!(content_hash(&file["payload"]).unwrap().0, sign.content_hash);
    // verify, store, list, get against the fixture with its key registered as this install's
    let c = mem();
    seed_rows(&c);
    c.execute("UPDATE asset SET id = 'asset-1'", []).unwrap();
    c.execute("INSERT INTO signing_key (id, public_key_b64, created_at) VALUES (?1, ?2, 't')", params![sign.fingerprint, sign.public_key_b64]).unwrap();
    let rep = verify_text(&fixture, v["certificate_verify"]["now"].as_str().unwrap(), |fp| signing::is_local_key(&c, fp));
    assert_eq!(serde_json::to_value(&rep).unwrap(), v["certificate_verify"]["response"]);
    let mut record = v["certificate_store"]["request"]["record"].clone();
    record["fileJson"] = json!(fixture);
    let input: StoreInput = serde_json::from_value(record).unwrap();
    let mut got = serde_json::to_value(store(&c, &input).unwrap()).unwrap();
    let want = &v["certificate_store"]["response"];
    assert!(got["id"].is_string());
    got["id"] = want["id"].clone();
    assert_eq!(&got, want);
    let mut rows = serde_json::to_value(list(&c, v["certificate_list"]["request"]["assetId"].as_str()).unwrap()).unwrap();
    rows[0]["id"] = want["id"].clone();
    assert_eq!(rows, v["certificate_list"]["response"]);
    let real_id = list(&c, None).unwrap()[0].id.clone();
    let mut rec = serde_json::to_value(get(&c, &real_id).unwrap().unwrap()).unwrap();
    assert_eq!(verify_text(rec["fileJson"].as_str().unwrap(), NOW, |_| true).status, "valid");
    rec["id"] = want["id"].clone();
    rec["fileJson"] = v["certificate_get"]["response"]["fileJson"].clone();
    assert_eq!(rec, v["certificate_get"]["response"]);
    assert_eq!(v["certificate_extract_json"]["request"]["path"].as_str().map(|p| p.ends_with(".json")), Some(true));
    for code in v["certificate_extract_json"]["errorCodes"].as_array().unwrap() {
        let code = code.as_str().unwrap();
        let known = [CertError::BadPath(""), CertError::TooLarge, CertError::NotUtf8, CertError::Io(String::new()), CertError::PdfNoAttachment, CertError::NoCertificateData];
        assert!(known.iter().any(|e| e.code() == code), "{code}");
    }
}

/// FS-20 review (DoS): a hostile payload used to be canonicalised before any schema check, and the
/// canonicaliser copied a long key once per child, so a 1 MB key over 100k items froze the app for
/// seconds to minutes. Cheap schema bounds now run first and canonicalisation is linear.
#[test]
fn regression_fs20_hostile_payload_is_rejected_by_cheap_bounds_before_canonicalising() {
    let hostile = |payload: Value| {
        let file = json!({"format": FORMAT, "version": 1, "payload": payload, "integrity": {
            "alg": "ed25519", "hashAlg": "sha256", "contentHash": "0".repeat(64), "signature": "x", "publicKey": "x", "fingerprint": "0".repeat(16)
        }});
        let text = serde_json::to_string(&file).unwrap();
        let started = std::time::Instant::now();
        let r = verify_text(&text, NOW, |_| true);
        assert!(started.elapsed() < std::time::Duration::from_secs(1), "took {:?}", started.elapsed());
        r
    };
    let mut long_key = serde_json::Map::new();
    long_key.insert("k".repeat(1_000_000), Value::Array(vec![Value::from(0); 100_000]));
    let mut nested_key = sample_payload();
    nested_key["unit"]["notes"] = Value::Object(long_key.clone());
    let mut long_array = sample_payload();
    long_array["results"] = Value::Array(vec![Value::from(0); MAX_MEASUREMENTS + 1]);
    let mut long_string = sample_payload();
    long_string["tester"] = json!("x".repeat(MAX_PHOTO_B64 + 1));
    for (name, payload) in [("long top-level key", Value::Object(long_key)), ("long nested key", nested_key), ("long array", long_array), ("long string", long_string)] {
        let r = hostile(payload);
        assert_eq!(r.status, "modified", "{name}");
        assert_eq!(r.reasons[0], "content hash mismatch", "{name}");
        assert!(r.reasons.get(1).is_some_and(|m| m.contains("schema v1 bounds")), "{name}: {:?}", r.reasons);
        assert!(r.content_hash.is_none(), "{name}: the payload is never canonicalised");
        assert!(!r.issued_by_this_install, "{name}");
    }
    // a genuine certificate is still inside the bounds
    assert_eq!(verify(&valid_file()).status, "valid");
}

/// FS-20 review (DoS): the certificate commands were sync, so Tauri ran them on the main thread and
/// a slow file froze the window. Every certificate command must be `async` (off the UI thread).
#[test]
fn regression_fs20_certificate_commands_run_off_the_main_thread() {
    let src = fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("src/certificate.rs")).unwrap();
    let mut names = Vec::new();
    for (i, _) in src.match_indices("#[tauri::command") {
        let after = &src[i..];
        let attr_end = after.find(']').unwrap();
        let fn_at = after.find("fn ").unwrap();
        let name: String = after[fn_at + 3..].chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
        let is_async = after[..attr_end].contains("async") || after[attr_end..fn_at].contains("async");
        assert!(is_async, "{name} runs on the main thread");
        names.push(name);
    }
    for want in ["certificate_sign", "certificate_verify", "certificate_extract_json", "certificate_store", "certificate_list", "certificate_get"] {
        assert!(names.iter().any(|n| n == want), "{want} not found: {names:?}");
    }
}

/// FS-20 review: "issued by this install" came from the file's unverified fingerprint, so a forged
/// MODIFIED file carrying this install's (public, printed) fingerprint showed the ownership note.
#[test]
fn regression_fs20_issued_by_this_install_only_for_a_valid_signature_by_the_local_key() {
    let local = |_: &str| true;
    // forged: edited payload with a recomputed hash, the real fingerprint and key, a stale signature
    let mut forged = valid_file();
    forged["payload"]["tester"] = json!("Mallory");
    let (hash, _) = content_hash(&forged["payload"]).unwrap();
    forged["integrity"]["contentHash"] = json!(hash);
    let r = verify_text(&serde_json::to_string(&forged).unwrap(), NOW, local);
    assert_eq!(r.status, "modified");
    assert!(!r.issued_by_this_install, "{:?}", r.reasons);
    // hash mismatch, fingerprint mismatch
    let mut edited = valid_file();
    edited["payload"]["tester"] = json!("Mallory");
    assert!(!verify_text(&serde_json::to_string(&edited).unwrap(), NOW, local).issued_by_this_install);
    let mut other_fp = valid_file();
    other_fp["integrity"]["fingerprint"] = json!("0123456789abcdef");
    assert!(!verify_text(&serde_json::to_string(&other_fp).unwrap(), NOW, local).issued_by_this_install);
    // signed but outside schema v1: unverifiable, not claimed
    let mut p = sample_payload();
    p["verdict"] = json!("excellent");
    let r = verify_text(&serde_json::to_string(&sign_with(&FIXTURE_SEED, p)).unwrap(), NOW, local);
    assert_eq!(r.status, "unverifiable");
    assert!(!r.issued_by_this_install);
    // valid: the local-key lookup decides, and it is asked about the verified fingerprint only
    let seen = std::cell::RefCell::new(Vec::new());
    let r = verify_text(&serde_json::to_string(&valid_file()).unwrap(), NOW, |fp| {
        seen.borrow_mut().push(fp.to_string());
        true
    });
    assert_eq!(r.status, "valid");
    assert!(r.issued_by_this_install);
    assert_eq!(seen.into_inner(), vec![r.fingerprint.clone().unwrap()]);
    assert!(!verify(&valid_file()).issued_by_this_install);
}
