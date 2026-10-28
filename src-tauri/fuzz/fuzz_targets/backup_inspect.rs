#![no_main]
// cargo-fuzz driver; the target body and its invariants live in src/fuzz_api.rs.
libfuzzer_sys::fuzz_target!(|data: &[u8]| deckchek_lib::fuzz_api::fuzz_backup_inspect(data));
