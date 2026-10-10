//! External links and file reveal (FS-07). Every URL the webview wants opened goes through
//! `open_external_url`; the allowlist and URL policy are enforced here (authoritative), and the
//! webview holds no opener permission. Local files are opened only when DeckChek wrote them this
//! session or they live in an app-owned folder.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Url};
use tauri_plugin_opener::OpenerExt;

const MAX_URL_LEN: usize = 2048;
const ALLOWLIST_JSON: &str = include_str!("../resources/link-allowlist.json");

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Allowlist {
    pub version: u32,
    #[serde(default)]
    pub hosts: Vec<String>,
    #[serde(default)]
    pub allow_subdomains: Vec<String>,
}

impl Allowlist {
    /// Unknown version or malformed JSON -> empty list (everything asks for confirmation).
    pub fn parse(json: &str) -> Allowlist {
        match serde_json::from_str::<Allowlist>(json) {
            Ok(a) if a.version == 1 => a,
            _ => Allowlist::default(),
        }
    }

    pub fn bundled() -> Allowlist {
        Allowlist::parse(ALLOWLIST_JSON)
    }

    /// Exact host, or `*.domain` entry matching on a label boundary (`evilgithub.com` != `github.com`).
    pub fn matches(&self, host: &str) -> bool {
        if self.hosts.iter().any(|h| h.eq_ignore_ascii_case(host)) {
            return true;
        }
        self.allow_subdomains.iter().any(|pat| {
            pat.strip_prefix("*.").is_some_and(|base| {
                let base = base.to_ascii_lowercase();
                host.len() > base.len() + 1 && host.ends_with(&base) && host.as_bytes()[host.len() - base.len() - 1] == b'.'
            })
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Classification {
    pub ok: bool,
    pub scheme: String,
    pub host: String,
    pub punycode_host: String,
    pub allowlisted: bool,
    pub reason: Option<&'static str>,
}

fn blocked(reason: &'static str, scheme: &str, host: &str) -> Classification {
    Classification { ok: false, scheme: scheme.into(), host: host.into(), punycode_host: host.into(), allowlisted: false, reason: Some(reason) }
}

/// URL policy (FS-07 §6): https only, no userinfo, <= 2048 chars, no control/whitespace,
/// default port only for the allowlist. Parsed with the `url` crate (IDNA -> punycode), never regex.
pub fn classify(raw: &str, allow: &Allowlist) -> Classification {
    if raw.is_empty() || raw.len() > MAX_URL_LEN || raw.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return blocked("invalid", "", "");
    }
    let Ok(url) = Url::parse(raw) else { return blocked("invalid", "", "") };
    let scheme = url.scheme().to_string();
    if scheme != "https" {
        return blocked("blocked_scheme", &scheme, "");
    }
    let is_domain = url.domain().is_some();
    let host = match url.host_str() {
        Some(h) => h.trim_end_matches('.').to_ascii_lowercase(), // IP literals are valid but never allowlisted
        None => return blocked("invalid", &scheme, ""),
    };
    if host.is_empty() {
        return blocked("invalid", &scheme, "");
    }
    let plain = url.username().is_empty() && url.password().is_none() && url.port().is_none();
    Classification {
        ok: true,
        scheme,
        punycode_host: host.clone(),
        allowlisted: is_domain && plain && allow.matches(&host),
        host,
        reason: None,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenResult {
    pub opened: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<&'static str>,
    pub host: String,
    pub allowlisted: bool,
}

/// Abstraction over the opener plugin so the policy can be tested without launching anything.
pub trait Opener {
    fn open_url(&self, url: &str) -> Result<(), String>;
    fn open_path(&self, path: &Path) -> Result<(), String>;
    fn reveal(&self, path: &Path) -> Result<(), String>;
}

struct PluginOpener<'a>(&'a AppHandle);

impl Opener for PluginOpener<'_> {
    fn open_url(&self, url: &str) -> Result<(), String> {
        self.0.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
    }
    fn open_path(&self, path: &Path) -> Result<(), String> {
        self.0.opener().open_path(path.to_string_lossy().into_owned(), None::<&str>).map_err(|e| e.to_string())
    }
    fn reveal(&self, path: &Path) -> Result<(), String> {
        self.0.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
    }
}

pub fn open_external_with(raw: &str, confirmed: bool, allow: &Allowlist, opener: &dyn Opener) -> OpenResult {
    let c = classify(raw, allow);
    if !c.ok {
        return OpenResult { opened: false, reason: c.reason, host: c.host, allowlisted: false };
    }
    if !c.allowlisted && !confirmed {
        return OpenResult { opened: false, reason: Some("needs_confirm"), host: c.host, allowlisted: false };
    }
    // Pass the normalised URL as one argument (never through a shell string).
    let normalised = Url::parse(raw).map(String::from).unwrap_or_else(|_| raw.to_string());
    match opener.open_url(&normalised) {
        Ok(()) => OpenResult { opened: true, reason: None, host: c.host, allowlisted: c.allowlisted },
        Err(_) => OpenResult { opened: false, reason: Some("error"), host: c.host, allowlisted: c.allowlisted },
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PathResult {
    pub opened: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<&'static str>,
}

/// Canonicalises `raw` and accepts it only if DeckChek wrote it this session or it sits under an app root.
pub fn check_path(raw: &str, roots: &[PathBuf], recorded: &dyn Fn(&Path) -> bool) -> Result<PathBuf, &'static str> {
    let p = Path::new(raw);
    if raw.is_empty() || raw.contains('\0') || !p.is_absolute() {
        return Err("not_app_path");
    }
    let raw_roots = roots;
    let roots: Vec<PathBuf> = roots.iter().map(|r| std::fs::canonicalize(r).unwrap_or_else(|_| r.clone())).collect();
    match std::fs::canonicalize(p) {
        Ok(canon) => {
            if recorded(&canon) || roots.iter().any(|r| canon.starts_with(r)) {
                Ok(canon)
            } else {
                Err("not_app_path")
            }
        }
        Err(_) => {
            // Gone from disk: say so only for paths we would have allowed, so nothing else is probed.
            let lexical_ok = !p.components().any(|c| matches!(c, std::path::Component::ParentDir))
                // `p` is not canonical, so also compare with the roots as given (on Windows
                // canonical roots carry a `\\?\` prefix a plain path never matches).
                && (recorded(p) || roots.iter().chain(raw_roots).any(|r| p.starts_with(r)));
            Err(if lexical_ok { "not_found" } else { "not_app_path" })
        }
    }
}

fn open_path_with(raw: &str, roots: &[PathBuf], recorded: &dyn Fn(&Path) -> bool, opener: &dyn Opener, reveal: bool) -> PathResult {
    match check_path(raw, roots, recorded) {
        Err(reason) => PathResult { opened: false, reason: Some(reason) },
        Ok(p) => match if reveal { opener.reveal(&p) } else { opener.open_path(&p) } {
            Ok(()) => PathResult { opened: true, reason: None },
            Err(_) => PathResult { opened: false, reason: Some("error") },
        },
    }
}

fn app_roots(app: &AppHandle) -> Vec<PathBuf> {
    let p = app.path();
    [p.app_data_dir(), p.app_log_dir()].into_iter().filter_map(Result::ok).collect()
}

#[tauri::command]
pub fn open_external_url(app: AppHandle, url: String, confirmed: Option<bool>) -> OpenResult {
    let r = open_external_with(&url, confirmed.unwrap_or(false), &Allowlist::bundled(), &PluginOpener(&app));
    // Spec 02 log rule: host only, never the URL or query.
    eprintln!("[links] open_external_url host={} opened={} reason={:?}", r.host, r.opened, r.reason);
    r
}

#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> PathResult {
    open_path_with(&path, &app_roots(&app), &crate::userfiles::is_recorded, &PluginOpener(&app), false)
}

#[tauri::command]
pub fn reveal_path(app: AppHandle, path: String) -> PathResult {
    open_path_with(&path, &app_roots(&app), &crate::userfiles::is_recorded, &PluginOpener(&app), true)
}

/// Whether the main window may navigate to `url` (it must only ever show the bundled app).
pub fn navigation_allowed(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "ipc" => true,
        "about" => url.as_str() == "about:blank",
        "http" | "https" => {
            let host = url.host_str().unwrap_or("");
            host == "tauri.localhost" || host.ends_with(".tauri.localhost") || host == "ipc.localhost" || host == "asset.localhost"
                || (cfg!(debug_assertions) && matches!(host, "localhost" | "127.0.0.1"))
        }
        _ => false,
    }
}

/// Plugin that denies in-window navigation to anything but the bundled app.
pub fn navigation_guard<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("deckchek-links")
        .on_navigation(|_webview, url| navigation_allowed(url))
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::fs;

    fn al() -> Allowlist { Allowlist::bundled() }

    #[derive(Default)]
    struct Mock { calls: RefCell<Vec<String>>, fail: bool }
    impl Opener for Mock {
        fn open_url(&self, url: &str) -> Result<(), String> { self.calls.borrow_mut().push(format!("url:{url}")); if self.fail { Err("no handler".into()) } else { Ok(()) } }
        fn open_path(&self, p: &Path) -> Result<(), String> { self.calls.borrow_mut().push(format!("open:{}", p.display())); Ok(()) }
        fn reveal(&self, p: &Path) -> Result<(), String> { self.calls.borrow_mut().push(format!("reveal:{}", p.display())); Ok(()) }
    }

    #[test]
    fn bundled_allowlist_parses_with_required_domains() {
        let a = al();
        assert_eq!(a.version, 1);
        for d in ["pioneerdj.com", "alphatheta.com", "rekordbox.com", "serato.com", "rane.com", "native-instruments.com", "allen-heath.com", "technics.com", "panasonic.com", "mixxx.org", "github.com"] {
            assert!(a.matches(d), "{d}");
            assert!(a.matches(&format!("www.{d}")), "www.{d}");
        }
    }

    #[test]
    fn unknown_allowlist_version_is_empty() {
        assert!(!Allowlist::parse(r#"{"version":2,"hosts":["github.com"]}"#).matches("github.com"));
        assert!(!Allowlist::parse("not json").matches("github.com"));
    }

    #[test]
    fn classify_matrix() {
        let a = al();
        let c = classify("https://github.com/x", &a);
        assert!(c.ok && c.allowlisted && c.host == "github.com");
        assert_eq!(classify("http://github.com", &a).reason, Some("blocked_scheme"));
        assert_eq!(classify("javascript:alert(1)", &a).reason, Some("blocked_scheme"));
        assert_eq!(classify("file:///c:/", &a).reason, Some("blocked_scheme"));
        assert_eq!(classify("data:text/html,<b>", &a).reason, Some("blocked_scheme"));
        assert_eq!(classify("mailto:a@b.c", &a).reason, Some("blocked_scheme"));
        for bad in ["", "not a url", "https://", "https://exa mple.com", "https://github.com/\u{7}", "//github.com", "https://github.com/\nx"] {
            assert_eq!(classify(bad, &a).reason, Some("invalid"), "{bad:?}");
        }
        let long = format!("https://github.com/{}", "a".repeat(3000));
        assert_eq!(classify(&long, &a).reason, Some("invalid"));
        for ask in ["https://evilgithub.com", "https://github.com.evil.tld", "https://user:pw@github.com", "https://user@github.com", "https://github.com:8443/x", "https://127.0.0.1/", "https://[::1]/"] {
            let c = classify(ask, &a);
            assert!(c.ok && !c.allowlisted, "{ask}");
        }
    }

    #[test]
    fn classify_normalises_case_and_trailing_dot() {
        let c = classify("HTTPS://GitHub.COM./Foo", &al());
        assert!(c.ok && c.allowlisted);
        assert_eq!(c.host, "github.com");
        assert!(classify("https://github.com:443/", &al()).allowlisted);
    }

    #[test]
    fn classify_punycode_lookalike() {
        // Cyrillic "а" in place of the Latin a.
        let c = classify("https://github\u{0430}.com/", &al());
        assert!(c.ok && !c.allowlisted);
        assert!(c.punycode_host.starts_with("xn--"), "{}", c.punycode_host);
        let direct = classify("https://xn--githb-3bd.com/", &al());
        assert!(direct.ok && !direct.allowlisted);
        assert_eq!(classify("https://sub.serato.com/", &al()).allowlisted, true);
        assert_eq!(classify("https://notserato.com/", &al()).allowlisted, false);
    }

    #[test]
    fn open_requires_confirm_and_never_opens_blocked() {
        let m = Mock::default();
        let r = open_external_with("https://example.org/p", false, &al(), &m);
        assert_eq!((r.opened, r.reason, r.host.as_str()), (false, Some("needs_confirm"), "example.org"));
        for bad in ["http://github.com", "javascript:alert(1)", "file:///c:/x", "garbage"] {
            let r = open_external_with(bad, true, &al(), &m); // confirmed does not unblock
            assert!(!r.opened && matches!(r.reason, Some("blocked_scheme" | "invalid")), "{bad}");
        }
        assert!(m.calls.borrow().is_empty());
        let r = open_external_with("https://example.org/p", true, &al(), &m);
        assert!(r.opened && !r.allowlisted);
        let r = open_external_with("https://github.com/a", false, &al(), &m);
        assert!(r.opened && r.allowlisted);
        assert_eq!(m.calls.borrow().len(), 2);
    }

    #[test]
    fn userinfo_url_is_confirm_even_when_host_is_allowlisted() {
        let m = Mock::default();
        let r = open_external_with("https://user:pw@github.com/", false, &al(), &m);
        assert_eq!(r.reason, Some("needs_confirm"));
        assert!(m.calls.borrow().is_empty());
    }

    #[test]
    fn opener_failure_reports_error() {
        let m = Mock { fail: true, ..Default::default() };
        let r = open_external_with("https://github.com/", false, &al(), &m);
        assert_eq!((r.opened, r.reason), (false, Some("error")));
    }

    #[test]
    fn open_result_serialises_camel_case() {
        let r = OpenResult { opened: false, reason: Some("needs_confirm"), host: "a.b".into(), allowlisted: false };
        assert_eq!(serde_json::to_string(&r).unwrap(), r#"{"opened":false,"reason":"needs_confirm","host":"a.b","allowlisted":false}"#);
        let ok = OpenResult { opened: true, reason: None, host: "a.b".into(), allowlisted: true };
        assert_eq!(serde_json::to_string(&ok).unwrap(), r#"{"opened":true,"host":"a.b","allowlisted":true}"#);
    }

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("deckchek-links-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn paths_are_limited_to_written_files_and_app_roots() {
        let root = tmp("root");
        let other = tmp("other");
        let inside = root.join("log.txt");
        let written = other.join("report.pdf");
        let stranger = other.join("secret.txt");
        for f in [&inside, &written, &stranger] { fs::write(f, "x").unwrap(); }
        let written_canon = fs::canonicalize(&written).unwrap();
        let recorded = move |p: &Path| p == written_canon;
        let roots = vec![root.clone()];
        let m = Mock::default();

        assert!(open_path_with(inside.to_str().unwrap(), &roots, &recorded, &m, false).opened);
        assert!(open_path_with(written.to_str().unwrap(), &roots, &recorded, &m, true).opened);
        let r = open_path_with(stranger.to_str().unwrap(), &roots, &recorded, &m, false);
        assert_eq!((r.opened, r.reason), (false, Some("not_app_path")));
        assert_eq!(m.calls.borrow().len(), 2);
        // traversal out of the root is resolved by canonicalisation
        let sneaky = format!("{}/../{}/secret.txt", root.display(), other.file_name().unwrap().to_string_lossy());
        assert_eq!(open_path_with(&sneaky, &roots, &recorded, &m, false).reason, Some("not_app_path"));
        // relative and empty
        assert_eq!(check_path("log.txt", &roots, &recorded), Err("not_app_path"));
        assert_eq!(check_path("", &roots, &recorded), Err("not_app_path"));
        // missing files
        fs::remove_file(&inside).unwrap();
        assert_eq!(check_path(inside.to_str().unwrap(), &roots, &recorded), Err("not_found"));
        assert_eq!(check_path(other.join("nope.txt").to_str().unwrap(), &roots, &recorded), Err("not_app_path"));
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(other);
    }

    #[cfg(unix)]
    #[test]
    fn symlink_out_of_root_is_refused() {
        let root = tmp("symroot");
        let other = tmp("symother");
        fs::write(other.join("t.txt"), "x").unwrap();
        std::os::unix::fs::symlink(other.join("t.txt"), root.join("link.txt")).unwrap();
        let r = check_path(root.join("link.txt").to_str().unwrap(), &[root.clone()], &|_| false);
        assert_eq!(r, Err("not_app_path"));
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(other);
    }

    #[test]
    fn navigation_guard_policy() {
        let ok = |s: &str| navigation_allowed(&Url::parse(s).unwrap());
        assert!(ok("tauri://localhost/index.html"));
        assert!(ok("http://tauri.localhost/"));
        assert!(ok("https://tauri.localhost/x"));
        assert!(ok("about:blank"));
        assert!(!ok("https://github.com/"));
        assert!(!ok("http://evil.tld/"));
        assert!(!ok("https://tauri.localhost.evil.tld/"));
        assert!(!ok("file:///c:/x"));
        assert!(!ok("javascript:alert(1)"));
    }
}
