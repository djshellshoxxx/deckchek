// External links (FS-07): the single choke point for anything that leaves the app.
// Desktop: the Rust command `open_external_url` is authoritative (allowlist + URL policy) and the
// webview holds no opener permission. Browser mode: same validation here, then a noopener window.
// This module is DOM-free except for the default confirm dialog and the click interceptor, and
// every side effect is injectable for tests.

// Mirror of src-tauri/resources/link-allowlist.json (tests/external-links.test.mjs asserts they match).
export const ALLOWLIST = Object.freeze({
  version: 1,
  hosts: ['pioneerdj.com', 'alphatheta.com', 'rekordbox.com', 'serato.com', 'rane.com', 'native-instruments.com', 'allen-heath.com', 'technics.com', 'panasonic.com', 'mixxx.org', 'github.com'],
  allowSubdomains: ['*.pioneerdj.com', '*.alphatheta.com', '*.rekordbox.com', '*.serato.com', '*.rane.com', '*.native-instruments.com', '*.allen-heath.com', '*.technics.com', '*.panasonic.com', '*.mixxx.org', '*.github.com'],
});

export const MAX_URL_LENGTH = 2048;
export const DEBOUNCE_MS = 500;

import { h } from './ui/dom.js';

// Captured before the interceptor replaces it; the only place a browser window is ever opened.
const rawOpen = typeof globalThis.open === 'function' ? globalThis.open.bind(globalThis) : null;

const tauri = () => globalThis.window?.__TAURI__ ?? globalThis.__TAURI__ ?? null;

/** Exact host or `*.domain` on a label boundary (`evilgithub.com` does not match `github.com`). Unknown version -> nothing matches. */
export function hostAllowed(host, allowlist = ALLOWLIST) {
  if (!allowlist || allowlist.version !== 1) return false;
  const h = String(host || '').toLowerCase();
  if (!h) return false;
  if ((allowlist.hosts || []).some(x => String(x).toLowerCase() === h)) return true;
  return (allowlist.allowSubdomains || []).some(p => {
    if (!String(p).startsWith('*.')) return false;
    const base = String(p).slice(2).toLowerCase();
    return h.length > base.length + 1 && h.endsWith('.' + base);
  });
}

/**
 * URL policy (FS-07 §6). Returns {ok, scheme, host, punycodeHost, allowlisted, reason, hasUserinfo, port}.
 * reason: 'invalid' | 'blocked_scheme' | null. Never regex-parses the URL.
 */
export function classifyUrl(input, allowlist = ALLOWLIST) {
  const fail = (reason, scheme = '', host = '') => ({ ok: false, scheme, host, punycodeHost: host, allowlisted: false, reason, hasUserinfo: false, port: '' });
  const raw = typeof input === 'string' ? input : '';
  // eslint-disable-next-line no-control-regex
  if (!raw || raw.length > MAX_URL_LENGTH || /[\u0000-\u001f\u007f-\u009f\s]/u.test(raw)) return fail('invalid');
  let u;
  try { u = new URL(raw); } catch { return fail('invalid'); }
  const scheme = u.protocol.replace(/:$/, '');
  if (scheme !== 'https') return fail('blocked_scheme', scheme);
  const host = u.hostname.replace(/\.$/, '').toLowerCase();
  if (!host) return fail('invalid', scheme);
  const hasUserinfo = Boolean(u.username || u.password);
  const isIp = /^\[.*\]$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  return {
    ok: true, scheme, host, punycodeHost: host, hasUserinfo, port: u.port,
    allowlisted: !isIp && !hasUserinfo && !u.port && hostAllowed(host, allowlist),
    reason: null,
  };
}

// ---------- shared state ----------
const sessionAllow = new Set(); // hosts the user chose "always allow" for, this session only
let lastOpenAt = -Infinity;
export function resetLinkState() { sessionAllow.clear(); lastOpenAt = -Infinity; }
export const sessionAllowedHosts = () => [...sessionAllow];

function defaultCopy(text) {
  return Promise.resolve().then(() => globalThis.navigator.clipboard.writeText(text)).then(() => true, () => false);
}

async function copyWithToast(url, { copy, toast }, message) {
  const ok = await (copy || defaultCopy)(url);
  toast?.(ok ? message : `${message.split(' — ')[0]} — copy it from here: ${url}`, { type: ok ? 'success' : 'info', timeout: ok ? 4000 : 12000 });
  return ok;
}

function toastBlocked(url, deps) {
  deps.toast?.('Blocked unsafe link', {
    type: 'error',
    action: { label: 'Copy link', run: () => { (deps.copy || defaultCopy)(url); } },
  });
}

/**
 * Open `url` through the policy. deps: { invoke, confirm, copy, toast, windowOpen, native, now }.
 * Resolves {opened, reason?, host?}. Never throws.
 */
export async function openExternal(url, deps = {}) {
  const now = (deps.now || Date.now)();
  if (now - lastOpenAt < DEBOUNCE_MS) return { opened: false, reason: 'debounced' };
  lastOpenAt = now;
  try {
    const c = classifyUrl(url);
    if (!c.ok) { toastBlocked(url, deps); return { opened: false, reason: c.reason, host: c.host }; }
    const invoke = deps.invoke ?? tauri()?.core?.invoke;
    const native = deps.native ?? typeof invoke === 'function';
    const ask = () => (deps.confirm ? deps.confirm({ url, host: c.host, punycodeHost: c.punycodeHost, hasUserinfo: c.hasUserinfo, port: c.port }) : 'cancel');
    const fallbackCopy = async host => {
      await copyWithToast(url, deps, 'Couldn’t open your browser — link copied');
      return { opened: false, reason: 'error', host };
    };

    if (native) {
      let confirmed = sessionAllow.has(c.host);
      let r;
      try { r = await invoke('open_external_url', { url, confirmed }); } catch { return fallbackCopy(c.host); }
      if (!r?.opened && r?.reason === 'needs_confirm') {
        const choice = await ask();
        if (choice === 'copy') { await copyWithToast(url, deps, 'Link copied'); return { opened: false, reason: 'copied', host: c.host }; }
        if (choice !== 'open' && choice !== 'always') return { opened: false, reason: 'cancelled', host: c.host };
        if (choice === 'always') sessionAllow.add(c.host);
        confirmed = true;
        try { r = await invoke('open_external_url', { url, confirmed }); } catch { return fallbackCopy(c.host); }
      }
      if (r?.opened) return { opened: true, host: r.host || c.host };
      if (r?.reason === 'blocked_scheme' || r?.reason === 'invalid') { toastBlocked(url, deps); return { opened: false, reason: r.reason, host: c.host }; }
      return fallbackCopy(c.host);
    }

    // Browser mode: same validation, then a noopener window.
    if (!c.allowlisted && !sessionAllow.has(c.host)) {
      const choice = await ask();
      if (choice === 'copy') { await copyWithToast(url, deps, 'Link copied'); return { opened: false, reason: 'copied', host: c.host }; }
      if (choice !== 'open' && choice !== 'always') return { opened: false, reason: 'cancelled', host: c.host };
      if (choice === 'always') sessionAllow.add(c.host);
    }
    const open = deps.windowOpen || rawOpen;
    if (!open) return fallbackCopy(c.host);
    // noopener makes browsers return null even on success, so the return value says nothing.
    open(url, '_blank', 'noopener,noreferrer');
    return { opened: true, host: c.host };
  } catch {
    return { opened: false, reason: 'error' };
  }
}

// ---------- local files (AC-8) ----------
async function pathCommand(command, path, deps) {
  const invoke = deps.invoke ?? tauri()?.core?.invoke;
  if (typeof invoke !== 'function') { deps.toast?.('Opening files is available in the DeckChek desktop app.', { type: 'info' }); return { opened: false, reason: 'unsupported' }; }
  try {
    const r = await invoke(command, { path });
    if (!r?.opened) deps.toast?.(r?.reason === 'not_found' ? 'That file no longer exists.' : 'Couldn’t open that location.', { type: 'warn' });
    return { opened: Boolean(r?.opened), reason: r?.reason };
  } catch {
    deps.toast?.('Couldn’t open that location.', { type: 'warn' });
    return { opened: false, reason: 'error' };
  }
}
/** Open a file DeckChek wrote this session, or one in an app-owned folder. Rust refuses anything else (`not_app_path`). */
export const openAppPath = (path, deps = {}) => pathCommand('open_path', path, deps);
/** Show such a file in the system file manager. */
export const revealAppPath = (path, deps = {}) => pathCommand('reveal_path', path, deps);

// ---------- interceptor ----------
/** Resolve what a click on `a` should do: null = leave alone (in-app/same-document/download), else the absolute href. */
export function interceptTarget(anchor, baseHref, appOrigin) {
  if (!anchor?.hasAttribute?.('href') || anchor.hasAttribute('download')) return null;
  const href = anchor.getAttribute('href').trim();
  if (!href || href.startsWith('#')) return null;
  let u;
  try { u = new URL(href, baseHref); } catch { return href; } // malformed -> blocked by openExternal
  if (u.protocol === 'blob:' && appOrigin && u.origin === appOrigin) return null;
  if ((u.protocol === 'http:' || u.protocol === 'https:') && u.origin === appOrigin) return null;
  return href;
}

/**
 * Delegated click/auxclick handler on `root` plus a window.open override. Returns an uninstall function.
 * deps are passed to openExternal (the shell supplies toast and the confirm dialog).
 */
export function installLinkInterceptor(root = globalThis.document, deps = {}) {
  const win = globalThis;
  const appOrigin = win.location?.origin;
  const handler = event => {
    if (event.type === 'auxclick' && event.button !== 1) return;
    if (event.type === 'click' && event.button !== 0) return;
    const a = event.target?.closest?.('a[href]');
    const target = a && interceptTarget(a, win.document?.baseURI || win.location?.href, appOrigin);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation(); // also keeps the opener plugin's own click script from acting
    openExternal(new URL(target, win.document?.baseURI || win.location?.href).href, deps);
  };
  // Capture phase: runs before page handlers, so a handler cannot re-route a link around the policy.
  root.addEventListener('click', handler, true);
  root.addEventListener('auxclick', handler, true);
  const originalOpen = win.open;
  win.open = (url) => { if (url != null && url !== '' && url !== 'about:blank') openExternal(String(url), deps); return null; };
  return () => {
    root.removeEventListener('click', handler, true);
    root.removeEventListener('auxclick', handler, true);
    win.open = originalOpen;
  };
}

// ---------- confirm dialog (non-allowlisted hosts) ----------
/**
 * Native <dialog>: shows the full host and URL. Resolves 'open' | 'always' | 'copy' | 'cancel'.
 * Cancel has default focus; "Always allow" lasts for this session only.
 */
export function linkConfirmDialog({ url, host, punycodeHost, hasUserinfo = false, port = '' }, doc = globalThis.document) {
  const trigger = doc.activeElement;
  const shownHost = punycodeHost || host;
  const id = `link-confirm-${Date.now().toString(36)}`;
  const always = h('input', { type: 'checkbox', id: `${id}-always` });
  const cancel = h('button', { type: 'submit', class: 'btn btn-secondary', value: 'cancel', text: 'Cancel' });
  const dlg = h('dialog', { 'aria-labelledby': `${id}-t`, 'aria-describedby': `${id}-d`, class: 'link-confirm' },
    h('form', { method: 'dialog', class: 'dialog-form' },
      h('h2', { id: `${id}-t`, text: 'Open this link in your browser?' }),
      h('div', { id: `${id}-d` },
        h('p', {}, h('strong', { class: 'link-confirm-host', text: shownHost }), port ? ` (port ${port})` : ''),
        h('p', { class: 'mono small link-confirm-url', style: 'overflow-wrap:anywhere', text: url }),
        shownHost.includes('xn--') ? h('p', { class: 'small', text: 'This address uses international characters, shown here in punycode. Check it matches the site you expect.' }) : null,
        hasUserinfo ? h('p', { class: 'small', text: 'This link contains a username or password, which is unusual for a normal website.' }) : null,
        h('p', { class: 'small muted', text: 'DeckChek hasn’t verified this site.' })),
      h('label', { class: 'small', for: `${id}-always` }, always, ` Always allow ${shownHost} until DeckChek is closed`),
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'submit', class: 'btn btn-ghost', value: 'copy', text: 'Copy link' }),
        cancel,
        h('button', { type: 'submit', class: 'btn btn-primary', value: 'open', text: 'Open' }))));
  doc.body.append(dlg);
  return new Promise(resolve => {
    dlg.addEventListener('close', () => {
      const v = dlg.returnValue;
      dlg.remove();
      if (trigger?.isConnected) trigger.focus();
      resolve(v === 'open' ? (always.checked ? 'always' : 'open') : v === 'copy' ? 'copy' : 'cancel');
    }, { once: true });
    dlg.showModal();
    cancel.focus();
  });
}
