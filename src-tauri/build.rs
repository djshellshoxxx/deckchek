// Build script: Tauri codegen plus migration discovery (FS-00 §4.2).
//
// Every `database/migrations/NNNN_name.sql` file is validated and embedded in
// `$OUT_DIR/migrations.rs` as `MIGRATIONS: &[(i64, &str)]`, which `db.rs`
// includes, so a new migration needs no edit to `db.rs`. A bad name, a
// duplicate number or a transaction statement in a file fails the build.
//
// `migration_rules` is plain std code: `db.rs` tests `include!` this file to
// unit-test the same rules (`main` is compiled out under `cfg(test)`).
// Keep this file free of inner attributes and inner doc comments for that reason.

pub mod migration_rules {
    /// Parse `NNNN_name.sql` (exactly four digits, then `_[a-z0-9_]+`). Returns the version.
    pub fn parse_migration_name(name: &str) -> Result<i64, String> {
        let bad = || format!("invalid migration file name '{name}': expected NNNN_lower_snake.sql (four digits)");
        let stem = name.strip_suffix(".sql").ok_or_else(bad)?;
        let digits = stem.get(..4).ok_or_else(bad)?;
        if !digits.bytes().all(|b| b.is_ascii_digit()) {
            return Err(bad());
        }
        let slug = stem[4..].strip_prefix('_').ok_or_else(bad)?;
        if slug.is_empty() || !slug.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_') {
            return Err(bad());
        }
        let version: i64 = digits.parse().map_err(|_| bad())?;
        if version == 0 {
            return Err(format!("invalid migration file name '{name}': version 0000 is reserved"));
        }
        Ok(version)
    }

    /// Validate every `*.sql` name (other files are ignored) and return
    /// `(version, file name)` sorted by version. Duplicate numbers are an error.
    pub fn plan_migrations(names: &[String]) -> Result<Vec<(i64, String)>, String> {
        let mut out = Vec::new();
        for name in names.iter().filter(|n| n.ends_with(".sql")) {
            out.push((parse_migration_name(name)?, name.clone()));
        }
        out.sort();
        for w in out.windows(2) {
            if w[0].0 == w[1].0 {
                return Err(format!("duplicate migration number {:04}: '{}' and '{}'", w[0].0, w[0].1, w[1].1));
            }
        }
        Ok(out)
    }

    /// Words and `;` of a SQL script with comments and quoted text removed.
    fn tokens(sql: &str) -> Vec<String> {
        let chars: Vec<char> = sql.chars().collect();
        let mut out = Vec::new();
        let mut i = 0;
        while i < chars.len() {
            let c = chars[i];
            if c == '-' && chars.get(i + 1) == Some(&'-') {
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
            } else if c == '/' && chars.get(i + 1) == Some(&'*') {
                i += 2;
                while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                    i += 1;
                }
                i += 2;
            } else if c == '\'' || c == '"' || c == '`' || c == '[' {
                let close = if c == '[' { ']' } else { c };
                i += 1;
                while i < chars.len() {
                    if chars[i] == close {
                        // a doubled quote is an escaped quote inside the literal
                        if close != ']' && chars.get(i + 1) == Some(&close) {
                            i += 2;
                            continue;
                        }
                        break;
                    }
                    i += 1;
                }
                i += 1;
                out.push("<quoted>".to_string());
            } else if c == ';' {
                out.push(";".to_string());
                i += 1;
            } else if c.is_alphanumeric() || c == '_' {
                let start = i;
                while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') {
                    i += 1;
                }
                out.push(chars[start..i].iter().collect::<String>().to_ascii_uppercase());
            } else {
                i += 1;
            }
        }
        out
    }

    /// Transaction-control statements (`BEGIN`, `COMMIT`, `END`, `ROLLBACK`,
    /// `SAVEPOINT`, `RELEASE`) at statement level. The runner wraps each file in
    /// its own transaction, so files must not contain any. `BEGIN … END` inside
    /// `CREATE TRIGGER` and `RAISE(ROLLBACK, …)` are allowed.
    pub fn transaction_statements(sql: &str) -> Vec<String> {
        const FORBIDDEN: [&str; 6] = ["BEGIN", "COMMIT", "END", "ROLLBACK", "SAVEPOINT", "RELEASE"];
        let toks = tokens(sql);
        let mut found = Vec::new();
        let mut i = 0;
        while i < toks.len() {
            while i < toks.len() && toks[i] == ";" {
                i += 1;
            }
            if i >= toks.len() {
                break;
            }
            let first = toks[i].as_str();
            if FORBIDDEN.contains(&first) {
                found.push(first.to_string());
            }
            let is_trigger = first == "CREATE"
                && toks[i + 1..].iter().take(3).any(|t| t == "TRIGGER")
                && !toks[i + 1..].iter().take_while(|t| *t != "TRIGGER").any(|t| t == ";");
            if is_trigger {
                // Skip to the trigger's END (CASE … END pairs nest inside the body).
                let mut case_depth = 0usize;
                let mut in_body = false;
                while i < toks.len() {
                    match toks[i].as_str() {
                        "BEGIN" => in_body = true,
                        "CASE" => case_depth += 1,
                        "END" if in_body && case_depth > 0 => case_depth -= 1,
                        "END" if in_body => {
                            i += 1;
                            break;
                        }
                        _ => {}
                    }
                    i += 1;
                }
            }
            while i < toks.len() && toks[i] != ";" {
                i += 1;
            }
        }
        found
    }
}

#[cfg(not(test))]
fn main() {
    use std::{env, fs, path::PathBuf};

    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let dir = manifest.join("..").join("database").join("migrations");
    println!("cargo:rerun-if-changed=../database/migrations");

    let mut names: Vec<String> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", dir.display()))
        .map(|entry| entry.expect("migration dir entry").file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    let plan = migration_rules::plan_migrations(&names).unwrap_or_else(|e| panic!("{e}"));

    let mut code = String::from("// Generated by build.rs from database/migrations. Do not edit.\npub const MIGRATIONS: &[(i64, &str)] = &[\n");
    for (version, name) in &plan {
        let path = dir.join(name);
        let sql = fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
        let bad = migration_rules::transaction_statements(&sql);
        if !bad.is_empty() {
            panic!("{name}: remove transaction statements {bad:?}; the migration runner wraps each file in a transaction");
        }
        let literal = format!("{:?}", path.to_string_lossy());
        code.push_str(&format!("    ({version}, include_str!({literal})),\n"));
    }
    code.push_str("];\n");
    let out = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR")).join("migrations.rs");
    fs::write(&out, code).unwrap_or_else(|e| panic!("cannot write {}: {e}", out.display()));

    tauri_build::build()
}
