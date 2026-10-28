//! Per-install Ed25519 signing identity (FS-20 §4, §7). Consumed by `certificate.rs` and, later,
//! by the FS-33 gear ledger. Small public surface:
//!
//! - [`get_or_create_identity`] `(conn, dir) -> Identity` — loads `signing-key.bin` from `dir`
//!   (the app data dir) or creates one on first use; registers the public key in `signing_key`.
//! - [`create_new_identity`] `(conn, dir) -> Identity` — replaces the key (missing/corrupt key
//!   recovery); older certificates still verify because each embeds its own public key.
//! - [`sign_digest`] `(conn, dir, &[u8; 32]) -> (signature_b64, Identity)` — signs a SHA-256 digest.
//! - [`verify_digest`] `(public_key_b64, &[u8; 32], signature_b64) -> Result<(), VerifyError>` —
//!   `VerifyingKey::verify_strict` (rejects small-order keys and malleable signatures).
//! - [`fingerprint`] — first 16 hex chars of SHA-256(public key bytes).
//! - [`is_local_key`] — whether a fingerprint is in this install's `signing_key` table.
//!
//! Key storage: `signing-key.bin` = magic `DCSK` + format byte (1) + protection byte + body.
//! - Windows: protection 1 = the 32-byte seed sealed with DPAPI (`CryptProtectData`, current-user
//!   scope, UI forbidden, app-specific entropy). If DPAPI fails, protection 2 = the raw seed in the
//!   per-user app data folder (inherits that folder's user-only ACL); `Identity.protection` reports
//!   `"file"` so the UI can flag it.
//! - Elsewhere (Linux/macOS dev and CI builds): protection 2, file created with mode 0600
//!   (`"file-user-only"`). There is no OS key store binding outside Windows in v1.
//!
//! The private key never leaves this module: no command returns it, no type holding it implements
//! `Debug`/`Serialize`, seeds are wiped after use, and errors never carry key bytes or full paths.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::canonical::sha256_hex;
use crate::db::now_iso;

pub const KEY_FILE: &str = "signing-key.bin";
const MAGIC: &[u8; 4] = b"DCSK";
const FORMAT: u8 = 1;
const PROT_DPAPI: u8 = 1;
const PROT_FILE: u8 = 2;
/// A key file is at most a few hundred bytes (DPAPI blobs ~250 B); anything larger is corrupt.
const MAX_KEY_FILE_BYTES: u64 = 64 * 1024;

/// Serialises key creation/rotation so two first-use calls cannot race to create two keys.
static KEY_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub fingerprint: String,
    pub created_at: String,
    pub public_key_b64: String,
    /// `"dpapi"`, `"file-user-only"` or `"file"` (unprotected fallback, flagged in the UI).
    pub protection: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SigningError {
    /// The key file exists but cannot be decoded or unsealed. Never auto-replaced.
    KeyCorrupt(&'static str),
    Random,
    /// `signing_create_identity` called without `confirm: true`.
    ConfirmationRequired,
    Io(String),
    Db(String),
}

impl SigningError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::KeyCorrupt(_) => "key_corrupt",
            Self::Random => "random_unavailable",
            Self::ConfirmationRequired => "confirmation_required",
            Self::Io(_) => "io",
            Self::Db(_) => "db",
        }
    }
}

impl std::fmt::Display for SigningError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::KeyCorrupt(why) => write!(f, "the signing key cannot be read ({why}); create a new identity"),
            Self::Random => write!(f, "the system random number generator is unavailable"),
            Self::ConfirmationRequired => write!(f, "replacing the signing identity needs confirmation"),
            Self::Io(kind) => write!(f, "signing key storage failed ({kind})"),
            Self::Db(e) => write!(f, "signing key registry failed: {e}"),
        }
    }
}

impl Serialize for SigningError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("SigningError", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

impl From<std::io::Error> for SigningError {
    fn from(e: std::io::Error) -> Self {
        // Kind only: OS messages can embed full user paths.
        Self::Io(format!("{:?}", e.kind()))
    }
}

fn db_err(e: rusqlite::Error) -> SigningError {
    SigningError::Db(e.to_string())
}

/// 32 secret bytes, wiped on drop. Deliberately no Debug/Clone/Serialize.
struct Seed([u8; 32]);

impl Drop for Seed {
    fn drop(&mut self) {
        for b in self.0.iter_mut() {
            // SAFETY: `b` is a valid, aligned &mut u8; a volatile write keeps the wipe from being optimised out.
            unsafe { std::ptr::write_volatile(b, 0) };
        }
    }
}

fn wipe(v: &mut [u8]) {
    for b in v.iter_mut() {
        // SAFETY: as in Seed::drop.
        unsafe { std::ptr::write_volatile(b, 0) };
    }
}

/// First 16 lowercase hex chars of SHA-256(public key bytes) (`signing_key.id`).
pub fn fingerprint(public_key: &[u8; 32]) -> String {
    sha256_hex(public_key)[..16].to_string()
}

// ------------------------------------------------------------------ protection backends

#[cfg(windows)]
mod dpapi {
    //! DPAPI via the `windows` crate (feature `Win32_Security_Cryptography`, already in Cargo.toml).
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB};

    const ENTROPY: &[u8] = b"DeckChek FS-20 signing key v1";

    fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
    }

    fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        if out.pbData.is_null() {
            return Vec::new();
        }
        // SAFETY: on success DPAPI returns a LocalAlloc'd buffer of cbData bytes that we own.
        let v = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize) }.to_vec();
        // SAFETY: wipe then free the DPAPI-owned buffer exactly once.
        unsafe {
            for i in 0..out.cbData as usize {
                std::ptr::write_volatile(out.pbData.add(i), 0);
            }
            let _ = LocalFree(Some(HLOCAL(out.pbData as *mut core::ffi::c_void)));
        }
        v
    }

    pub fn protect(secret: &[u8]) -> Result<Vec<u8>, ()> {
        let input = blob(secret);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB::default();
        // SAFETY: input/entropy point to live slices for the duration of the call; `out` is written by DPAPI.
        let r = unsafe { CryptProtectData(&input, windows::core::PCWSTR::null(), Some(&entropy), None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out) };
        if r.is_err() {
            return Err(());
        }
        Ok(take(out))
    }

    pub fn unprotect(sealed: &[u8]) -> Result<Vec<u8>, ()> {
        let input = blob(sealed);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB::default();
        // SAFETY: as in `protect`.
        let r = unsafe { CryptUnprotectData(&input, None, Some(&entropy), None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out) };
        if r.is_err() {
            return Err(());
        }
        Ok(take(out))
    }
}

/// Seals the seed: (protection byte, body bytes, protection label).
fn seal(seed: &Seed) -> (u8, Vec<u8>, &'static str) {
    #[cfg(windows)]
    {
        if let Ok(sealed) = dpapi::protect(&seed.0) {
            return (PROT_DPAPI, sealed, "dpapi");
        }
        (PROT_FILE, seed.0.to_vec(), "file")
    }
    #[cfg(not(windows))]
    {
        (PROT_FILE, seed.0.to_vec(), "file-user-only")
    }
}

fn protection_label(prot: u8) -> &'static str {
    match prot {
        PROT_DPAPI => "dpapi",
        _ if cfg!(windows) => "file",
        _ => "file-user-only",
    }
}

fn unseal(prot: u8, body: &[u8]) -> Result<Seed, SigningError> {
    let mut raw: Vec<u8> = match prot {
        PROT_FILE => body.to_vec(),
        #[cfg(windows)]
        PROT_DPAPI => dpapi::unprotect(body).map_err(|_| SigningError::KeyCorrupt("DPAPI could not unseal the key for this Windows user"))?,
        #[cfg(not(windows))]
        PROT_DPAPI => return Err(SigningError::KeyCorrupt("DPAPI-sealed key on a non-Windows system")),
        _ => return Err(SigningError::KeyCorrupt("unknown protection")),
    };
    if raw.len() != 32 {
        wipe(&mut raw);
        return Err(SigningError::KeyCorrupt("wrong key length"));
    }
    let mut seed = Seed([0u8; 32]);
    seed.0.copy_from_slice(&raw);
    wipe(&mut raw);
    Ok(seed)
}

// ------------------------------------------------------------------ key file

fn key_path(dir: &Path) -> PathBuf {
    dir.join(KEY_FILE)
}

/// Reads and unseals the key file. Ok(None) when it does not exist.
fn load_seed(dir: &Path) -> Result<Option<(Seed, u8)>, SigningError> {
    let path = key_path(dir);
    let meta = match fs::symlink_metadata(&path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    if !meta.is_file() {
        return Err(SigningError::KeyCorrupt("not a regular file"));
    }
    if meta.len() > MAX_KEY_FILE_BYTES {
        return Err(SigningError::KeyCorrupt("file too large"));
    }
    let mut buf = Vec::with_capacity(meta.len() as usize);
    fs::File::open(&path)?.take(MAX_KEY_FILE_BYTES + 1).read_to_end(&mut buf)?;
    let result = (|| {
        if buf.len() < 6 || &buf[..4] != MAGIC {
            return Err(SigningError::KeyCorrupt("bad header"));
        }
        if buf[4] != FORMAT {
            return Err(SigningError::KeyCorrupt("unknown key format"));
        }
        let prot = buf[5];
        Ok((unseal(prot, &buf[6..])?, prot))
    })();
    wipe(&mut buf);
    result.map(Some)
}

/// Writes the sealed key atomically (temp file + rename); user-only permissions on Unix.
fn write_seed(dir: &Path, seed: &Seed) -> Result<&'static str, SigningError> {
    fs::create_dir_all(dir)?;
    let (prot, mut body, label) = seal(seed);
    let mut bytes = Vec::with_capacity(6 + body.len());
    bytes.extend_from_slice(MAGIC);
    bytes.push(FORMAT);
    bytes.push(prot);
    bytes.extend_from_slice(&body);
    wipe(&mut body);
    let tmp = dir.join(format!("{KEY_FILE}.tmp"));
    let _ = fs::remove_file(&tmp);
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let written = (|| -> Result<(), SigningError> {
        let mut f = opts.open(&tmp)?;
        f.write_all(&bytes)?;
        f.sync_all()?;
        Ok(())
    })();
    wipe(&mut bytes);
    if let Err(e) = written {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    if let Err(e) = fs::rename(&tmp, key_path(dir)) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(label)
}

fn new_seed() -> Result<Seed, SigningError> {
    let mut seed = Seed([0u8; 32]);
    getrandom::fill(&mut seed.0).map_err(|_| SigningError::Random)?;
    Ok(seed)
}

/// Registers `public_key` in `signing_key` (idempotent) and returns its created_at.
fn register(conn: &Connection, vk: &VerifyingKey) -> Result<(String, String), SigningError> {
    let pk = vk.to_bytes();
    let fp = fingerprint(&pk);
    let b64 = B64.encode(pk);
    let existing: Option<String> = conn
        .query_row("SELECT created_at FROM signing_key WHERE id = ?1", [&fp], |r| r.get(0))
        .optional()
        .map_err(db_err)?;
    let created = match existing {
        Some(c) => c,
        None => {
            let now = now_iso(conn).map_err(SigningError::Db)?;
            conn.execute("INSERT INTO signing_key (id, public_key_b64, created_at) VALUES (?1, ?2, ?3)", params![fp, b64, now]).map_err(db_err)?;
            now
        }
    };
    Ok((fp, created))
}

fn identity_for(conn: &Connection, seed: &Seed, protection: &str) -> Result<Identity, SigningError> {
    let vk = SigningKey::from_bytes(&seed.0).verifying_key();
    let (fingerprint, created_at) = register(conn, &vk)?;
    Ok(Identity { fingerprint, created_at, public_key_b64: B64.encode(vk.to_bytes()), protection: protection.to_string() })
}

/// The install's identity; creates and stores a key on first use. A corrupt key is an error
/// (`key_corrupt`), never silently replaced: the UI offers [`create_new_identity`].
pub fn get_or_create_identity(conn: &Connection, dir: &Path) -> Result<Identity, SigningError> {
    let _g = KEY_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    if let Some((seed, prot)) = load_seed(dir)? {
        return identity_for(conn, &seed, protection_label(prot));
    }
    let seed = new_seed()?;
    let label = write_seed(dir, &seed)?;
    identity_for(conn, &seed, label)
}

/// Replaces the key with a fresh one and retires every other key in `signing_key`.
pub fn create_new_identity(conn: &Connection, dir: &Path) -> Result<Identity, SigningError> {
    let _g = KEY_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let seed = new_seed()?;
    let label = write_seed(dir, &seed)?;
    let id = identity_for(conn, &seed, label)?;
    let now = now_iso(conn).map_err(SigningError::Db)?;
    conn.execute("UPDATE signing_key SET retired_at = ?1 WHERE retired_at IS NULL AND id <> ?2", params![now, id.fingerprint]).map_err(db_err)?;
    Ok(id)
}

/// Signs a 32-byte digest with the install key (creating it on first use).
pub fn sign_digest(conn: &Connection, dir: &Path, digest: &[u8; 32]) -> Result<(String, Identity), SigningError> {
    let identity = get_or_create_identity(conn, dir)?;
    let _g = KEY_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let (seed, _) = load_seed(dir)?.ok_or(SigningError::KeyCorrupt("key file disappeared"))?;
    let key = SigningKey::from_bytes(&seed.0); // zeroized on drop (ed25519-dalek `zeroize` feature)
    if B64.encode(key.verifying_key().to_bytes()) != identity.public_key_b64 {
        return Err(SigningError::KeyCorrupt("key changed while signing"));
    }
    let sig: Signature = key.sign(digest);
    Ok((B64.encode(sig.to_bytes()), identity))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerifyError {
    BadPublicKey,
    BadSignatureEncoding,
    Mismatch,
}

impl std::fmt::Display for VerifyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::BadPublicKey => "the embedded public key is not a valid Ed25519 key",
            Self::BadSignatureEncoding => "the signature is not 64 bytes of base64",
            Self::Mismatch => "signature does not match the embedded public key",
        })
    }
}

/// Decodes standard base64 into exactly N bytes (rejects other lengths before decoding large input).
pub fn decode_fixed<const N: usize>(b64: &str) -> Option<[u8; N]> {
    if b64.len() != N.div_ceil(3) * 4 {
        return None;
    }
    let v = B64.decode(b64).ok()?;
    v.try_into().ok()
}

/// Strict Ed25519 verification of `signature_b64` over `digest` with `public_key_b64`.
pub fn verify_digest(public_key_b64: &str, digest: &[u8; 32], signature_b64: &str) -> Result<(), VerifyError> {
    let pk = decode_fixed::<32>(public_key_b64).ok_or(VerifyError::BadPublicKey)?;
    let vk = VerifyingKey::from_bytes(&pk).map_err(|_| VerifyError::BadPublicKey)?;
    let sig = decode_fixed::<64>(signature_b64).ok_or(VerifyError::BadSignatureEncoding)?;
    let sig = Signature::from_bytes(&sig);
    vk.verify_strict(digest, &sig).map_err(|_| VerifyError::Mismatch)
}

/// True when `fingerprint` is a key of this install (current or retired).
pub fn is_local_key(conn: &Connection, fingerprint: &str) -> bool {
    conn.query_row("SELECT 1 FROM signing_key WHERE id = ?1", [fingerprint], |_| Ok(()))
        .optional()
        .ok()
        .flatten()
        .is_some()
}

/// Directory holding the key file: the app data dir.
pub fn key_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    app.path().app_data_dir().map_err(|e| e.to_string())
}

// ------------------------------------------------------------------ commands

fn with_conn<T>(app: &tauri::AppHandle, f: impl FnOnce(&Connection, &Path) -> Result<T, SigningError>) -> Result<T, SigningError> {
    let dir = key_dir(app).map_err(|_| SigningError::Io("app data folder unavailable".into()))?;
    let conn = crate::db::open_database(&crate::db::database_path(app).map_err(SigningError::Db)?).map_err(SigningError::Db)?;
    f(&conn, &dir)
}

#[tauri::command]
pub fn signing_get_identity(app: tauri::AppHandle) -> Result<Identity, SigningError> {
    with_conn(&app, get_or_create_identity)
}

/// "Create new identity" (missing or corrupt key). `confirm` must be true: the UI shows the warning first.
#[tauri::command]
pub fn signing_create_identity(app: tauri::AppHandle, confirm: bool) -> Result<Identity, SigningError> {
    if !confirm {
        return Err(SigningError::ConfirmationRequired);
    }
    with_conn(&app, create_new_identity)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::db::apply_migrations;

    pub(crate) fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        apply_migrations(&c).unwrap();
        c
    }

    pub(crate) fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("deckchek-signing-{tag}-{}-{}", std::process::id(), crate::db::new_id()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn first_use_creates_key_registers_it_and_reuses_it() {
        let (c, d) = (mem(), tmpdir("first"));
        let a = get_or_create_identity(&c, &d).unwrap();
        assert_eq!(a.fingerprint.len(), 16);
        assert_eq!(a.fingerprint, fingerprint(&decode_fixed::<32>(&a.public_key_b64).unwrap()));
        let b = get_or_create_identity(&c, &d).unwrap();
        assert_eq!(a, b, "second call loads the same key");
        assert!(is_local_key(&c, &a.fingerprint));
        assert!(!is_local_key(&c, "0000000000000000"));
        let n: i64 = c.query_row("SELECT COUNT(*) FROM signing_key", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        if cfg!(windows) {
            assert!(a.protection == "dpapi" || a.protection == "file");
        } else {
            assert_eq!(a.protection, "file-user-only");
        }
    }

    #[cfg(unix)]
    #[test]
    fn key_file_is_user_only_on_unix() {
        use std::os::unix::fs::PermissionsExt;
        let (c, d) = (mem(), tmpdir("perm"));
        get_or_create_identity(&c, &d).unwrap();
        let mode = fs::metadata(d.join(KEY_FILE)).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[test]
    fn sign_and_verify_roundtrip_and_one_bit_tamper() {
        let (c, d) = (mem(), tmpdir("sign"));
        let digest = [7u8; 32];
        let (sig, id) = sign_digest(&c, &d, &digest).unwrap();
        verify_digest(&id.public_key_b64, &digest, &sig).unwrap();
        let mut other = digest;
        other[31] ^= 1;
        assert_eq!(verify_digest(&id.public_key_b64, &other, &sig), Err(VerifyError::Mismatch));
        let mut raw = decode_fixed::<64>(&sig).unwrap();
        raw[0] ^= 0x80;
        assert_eq!(verify_digest(&id.public_key_b64, &digest, &B64.encode(raw)), Err(VerifyError::Mismatch));
    }

    #[test]
    fn wrong_key_and_small_order_key_are_rejected() {
        let (c, d) = (mem(), tmpdir("wrong"));
        let digest = [9u8; 32];
        let (sig, _) = sign_digest(&c, &d, &digest).unwrap();
        let other = SigningKey::from_bytes(&[3u8; 32]).verifying_key();
        assert_eq!(verify_digest(&B64.encode(other.to_bytes()), &digest, &sig), Err(VerifyError::Mismatch));
        // identity point (small order): from_bytes accepts it, verify_strict must reject any signature
        let mut identity_point = [0u8; 32];
        identity_point[0] = 1;
        let mut s = [0u8; 64];
        s[0] = 1; // R = identity, S = 0: verifies under the non-strict equation for the identity key
        assert!(verify_digest(&B64.encode(identity_point), &digest, &B64.encode(s)).is_err());
        assert_eq!(verify_digest("not base64!", &digest, &sig), Err(VerifyError::BadPublicKey));
        assert_eq!(verify_digest(&B64.encode(other.to_bytes()), &digest, "AAAA"), Err(VerifyError::BadSignatureEncoding));
    }

    #[test]
    fn corrupt_key_is_reported_not_replaced_and_new_identity_retires_the_old_one() {
        let (c, d) = (mem(), tmpdir("corrupt"));
        let old = get_or_create_identity(&c, &d).unwrap();
        fs::write(d.join(KEY_FILE), b"DCSK\x01\x02short").unwrap();
        let e = get_or_create_identity(&c, &d).unwrap_err();
        assert_eq!(e.code(), "key_corrupt");
        assert_eq!(fs::read(d.join(KEY_FILE)).unwrap(), b"DCSK\x01\x02short", "corrupt key left for the user to decide");
        for junk in [&b""[..], b"XXXX\x01\x02", b"DCSK\x09\x02", b"DCSK\x01\x07aaaa"] {
            fs::write(d.join(KEY_FILE), junk).unwrap();
            assert_eq!(get_or_create_identity(&c, &d).unwrap_err().code(), "key_corrupt");
        }
        let new = create_new_identity(&c, &d).unwrap();
        assert_ne!(new.fingerprint, old.fingerprint);
        let retired: Option<String> = c.query_row("SELECT retired_at FROM signing_key WHERE id = ?1", [&old.fingerprint], |r| r.get(0)).unwrap();
        assert!(retired.is_some());
        let active: Option<String> = c.query_row("SELECT retired_at FROM signing_key WHERE id = ?1", [&new.fingerprint], |r| r.get(0)).unwrap();
        assert!(active.is_none());
        assert_eq!(get_or_create_identity(&c, &d).unwrap(), new);
    }

    #[test]
    fn oversized_key_file_is_rejected_before_reading() {
        let (c, d) = (mem(), tmpdir("big"));
        fs::write(d.join(KEY_FILE), vec![0u8; (MAX_KEY_FILE_BYTES + 1) as usize]).unwrap();
        assert_eq!(get_or_create_identity(&c, &d).unwrap_err(), SigningError::KeyCorrupt("file too large"));
    }

    #[test]
    fn identity_and_errors_never_expose_private_key_material() {
        let (c, d) = (mem(), tmpdir("leak"));
        let id = get_or_create_identity(&c, &d).unwrap();
        let file = fs::read(d.join(KEY_FILE)).unwrap();
        let body = &file[6..];
        let json = serde_json::to_string(&id).unwrap();
        assert!(!json.contains(&B64.encode(body)), "identity JSON carries no key-file body");
        assert!(!json.to_lowercase().contains("private") && !json.contains("seed"));
        assert_eq!(serde_json::to_value(&id).unwrap().as_object().unwrap().len(), 4);
        let e = serde_json::to_string(&SigningError::KeyCorrupt("x")).unwrap();
        assert!(!e.contains(&B64.encode(body)));
        let dbg = format!("{id:?}");
        assert!(!dbg.contains(&B64.encode(body)));
    }

    #[test]
    fn concurrent_first_use_creates_one_key() {
        let d = tmpdir("race");
        let path = std::env::temp_dir().join(format!("deckchek-race-{}.sqlite3", crate::db::new_id()));
        { let c = Connection::open(&path).unwrap(); apply_migrations(&c).unwrap(); }
        let hs: Vec<_> = (0..4).map(|_| { let (d, p) = (d.clone(), path.clone()); std::thread::spawn(move || {
            let c = Connection::open(&p).unwrap();
            c.busy_timeout(std::time::Duration::from_secs(5)).unwrap();
            get_or_create_identity(&c, &d).unwrap().fingerprint
        }) }).collect();
        let fps: Vec<String> = hs.into_iter().map(|h| h.join().unwrap()).collect();
        assert!(fps.windows(2).all(|w| w[0] == w[1]));
        let _ = fs::remove_file(&path);
    }

    #[cfg(windows)]
    #[test]
    fn dpapi_roundtrip_seals_the_seed() {
        let secret = [0x5au8; 32];
        let sealed = dpapi::protect(&secret).expect("DPAPI available on Windows CI");
        assert!(!sealed.windows(32).any(|w| w == secret), "sealed blob does not contain the plain seed");
        assert_eq!(dpapi::unprotect(&sealed).unwrap(), secret.to_vec());
        let (c, d) = (mem(), tmpdir("dpapi with spaces"));
        let id = get_or_create_identity(&c, &d).unwrap();
        assert_eq!(id.protection, "dpapi");
        assert_eq!(fs::read(d.join(KEY_FILE)).unwrap()[5], PROT_DPAPI);
        let (sig, _) = sign_digest(&c, &d, &[1u8; 32]).unwrap();
        verify_digest(&id.public_key_b64, &[1u8; 32], &sig).unwrap();
    }
}
