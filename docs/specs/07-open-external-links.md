# Spec 07 — Open external links safely

## 1. Summary, goals, non-goals
Manual, support and source links open in the user's default browser through the Tauri opener plugin, restricted to https URLs on an allowlist, with a copy-link fallback and a confirm dialog for non-allowlisted domains. The webview itself never navigates away.

**Goals:** one choke point for every external link; least-privilege capabilities; clear UX when no browser handler exists. **Non-goals:** an in-app browser; opening `file:`, `http:`, `mailto:` or custom schemes in v1; link previews or fetching remote content (CSP stays offline).

## 2. Users & user stories
- AC-1 Given a link to an allowlisted https domain (e.g. `github.com`), when clicked, then it opens in the default browser with no dialog.
- AC-2 Given an https link on a non-allowlisted domain, then a confirm dialog shows full host and URL with Open / Copy link / Cancel; Open requires an explicit click; "Always allow this domain" is offered only for the session (not persisted) in v1.
- AC-3 Given an `http:`, `javascript:`, `file:`, `data:` or malformed URL, then it is blocked, a toast "Blocked unsafe link" appears and the URL can be copied.
- AC-4 Given opening fails (no handler/plugin error), then the URL is copied to the clipboard and a toast says "Couldn't open your browser — link copied".
- AC-5 Given browser (non-Tauri) mode, then links use `window.open(url,'_blank','noopener,noreferrer')` after the same validation.
- AC-6 Given any `<a href="https://…">` in rendered content (including user notes), then clicks are intercepted by the single handler; middle-click and Ctrl+click follow the same path.
- AC-7 Given a URL with userinfo (`https://user:pw@host`) or IDN/punycode lookalike, then it is treated as non-allowlisted and the dialog shows the punycode host.

## 3. UX
Entry points: Help menu (manual, support, release notes, GitHub issues), device-profile source links, System Health "Learn more" links, report footers, Spec 02 "Report on GitHub". Visuals: external links show an "external" icon and `rel`-like text for screen readers ("opens in your browser"). Confirm dialog copy: "Open this link in your browser? **example.org** — https://example.org/path. DeckChek hasn't verified this site." Buttons: Open (primary), Copy link, Cancel (default focus). States: success (silent), fallback (toast with Copy), blocked (toast), loading (none), offline (browser may show its own error; no pre-check), unsupported (no opener permission -> copy-only mode). Shortcut: F1 opens the manual; Enter on a focused link opens. A11y: links are real `<a>` with discernible text; dialog uses `aria-describedby` for the full URL; focus returns to the link.

## 4. Architecture
Plugin: `tauri-plugin-opener` (v2.x, MIT/Apache-2.0; exact version to pin at implementation — UNKNOWN here). Do NOT use deprecated `tauri-plugin-shell` `open`. Add to `Cargo.toml`, `lib.rs` (`.plugin(tauri_plugin_opener::init())`), JS access via `window.__TAURI__.opener.openUrl` (global enabled by `withGlobalTauri`). Capability file `src-tauri/capabilities/default.json`:
```json
{ "identifier":"default","windows":["main"],
  "permissions":["core:default",
    {"identifier":"opener:allow-open-url","allow":[
      {"url":"https://github.com/**"},{"url":"https://www.pioneerdj.com/**"},
      {"url":"https://support.serato.com/**"},{"url":"https://support.native-instruments.com/**"},
      {"url":"https://manual.mixxx.org/**"},{"url":"https://www.alphatheta.com/**"}]}]}
```
(scope glob syntax: snippet-only evidence for `https://**`; verify.) Non-allowlisted domains cannot be opened by the plugin from JS directly, so the Rust command mediates: `open_external_url(url: String, confirmed: bool) -> { opened: bool, reason?: "blocked_scheme"|"needs_confirm"|"invalid"|"error", host: string, allowlisted: bool }` in new `src-tauri/src/links.rs`, using `tauri_plugin_opener::OpenerExt::opener().open_url(url, None::<&str>)` with Rust-side permissions (Rust API is not scope-checked), so the JS side does not need broad `opener:allow-open-url` — the capability grants only `opener:default` minus open-url (omit it) and the app routes everything through `open_external_url`. This is the chosen design: allowlist enforced in Rust (single source of truth), JS cannot bypass via plugin calls. Allowlist stored in `src-tauri/resources/link-allowlist.json` (`{"version":1,"hosts":["github.com", ...], "allowSubdomains":["*.serato.com"]}`) loaded with `include_str!`.
JS: new `app/external-links.js`: `classifyUrl(url, allowlist) -> {ok, scheme, host, punycodeHost, allowlisted, reason}`, `openExternal(url, {invoke, confirm, copy, toast})`, `installLinkInterceptor(root=document)` (delegated click on `a[href]`, `auxclick`, plus `window.open` override). Changes: `app/ui/shell.js` (install interceptor, confirm dialog via `confirmDialog`), `app/ui/dom.js` (helper `externalLink(href,text)`), Help menu. CSP unchanged (`default-src 'self'`): no `connect-src` or `frame-src` added; `<a>` navigation is prevented in JS and additionally `on_navigation` handler in `lib.rs` denies any non-`tauri://`/app URL in the main window.

## 5. Data model
No DB. Optional setting `links.sessionAllow` kept in memory only. Allowlist JSON versioned `{version:1}`; app update replaces it; unknown version -> empty allowlist (everything asks to confirm). Migration: none.

## 6. Algorithms / URL policy
Parse with `url::Url` (Rust) / `URL` (JS) — never regex. Accept only scheme `https`, no username/password, host non-empty, length <= 2048, no control characters or whitespace. Normalize host: lowercase, strip trailing dot, convert to punycode (`url` crate does IDNA). Allowlist match: exact host or `*.domain` entry (suffix match on label boundary, so `evilgithub.com` does not match `github.com`). Port: only default 443. Result precedence: invalid -> blocked; allowlisted -> open; else needs_confirm. Both JS and Rust run the policy; Rust is authoritative.

## 7. Errors, edge cases, privacy, security
Open redirect or tracking not controllable — dialog states destination only. No referrer concerns (browser opens fresh). Prevent clickjacking via repeated rapid opens: debounce 500 ms. User-authored notes could contain links: shown as plain text with an explicit "open" action through the same path. Windows: opener uses ShellExecute; URL passed as one argument, not through a shell string, so no command injection. Log (Spec 02) records host only, not full URL query. If the plugin returns error (no default browser) fall back to copy. Prevent `target=_blank` windows: `on_new_window` denied.

## 8. Test plan
Unit (`tests/external-links.test.mjs`): classify matrix — `https://github.com/x` ok; `http://github.com` blocked; `https://evilgithub.com`, `https://github.com.evil.tld` not allowlisted; `https://user:pw@github.com` confirm; `HTTPS://GitHub.com.` normalized; punycode lookalike `https://xn--...`; `javascript:alert(1)`, `file:///c:/`, `data:text/html,` blocked; 3000-char URL blocked; port 8443 confirm. Rust: same matrix against `classify`, `open_external_url` returns `needs_confirm` without `confirmed`, never calls opener in blocked cases (trait-mock the opener). UI smoke: click allowlisted link -> invoke stub called; non-allowlisted -> dialog; Cancel does nothing; Copy puts text to clipboard. Windows CI: build checks capabilities JSON validates (`tauri build` schema) and that no `opener:allow-open-url` wildcard exists (grep test). Manual: click manual links on a machine with Edge default, then with no default browser set (VM), verify copy fallback.

## 9. Definition of done
- [ ] All links route through `openExternal`; grep test forbids raw `window.open` and `target=_blank` in `app/`
- [ ] Capabilities minimal; CSP unchanged; docs: README security note, SPEC-17
Rollout: no flag.

## 10. Dependencies, risks, open questions, effort
Depends on: none (used by Specs 02, 03, 06). Risks: Rust OpenerExt API names differ by plugin version — UNKNOWN, verify at pin. Open: final allowlist domains (manufacturer support sites need verification); persist "always allow"? Effort: S (~8 agent-hours).

## 11. Research notes
- Tauri opener plugin docs: https://v2.tauri.app/plugin/opener/ (snippet only): default permission set allows opening mailto/tel/http/https; permissions and scopes configured in capabilities; example scope entries `{ "url": "https://tauri.app" }`.
- Wildcard `https://**` pattern appears only in a third-party skill page https://openskillindex.com/skills/partme-ai-full-stack-skills-tauri-app-opener — unconfirmed.
- Current CSP: `src-tauri/tauri.conf.json` (default-src 'self').
