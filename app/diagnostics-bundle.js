// Pure helpers for crash capture and the diagnostics bundle (FS-02).
// Redaction mirrors src-tauri/src/diagnostics.rs (`redact_text`); both are tested against
// tests/fixtures/redaction-vectors.json. Name note: app/diagnostics.js is the measurement engine.

// Target repo for "Report on GitHub". The button stays hidden while this is empty.
export const ISSUE_REPO = 'djshellshoxxx/deckchek';

export const MAX_ISSUE_BODY_CHARS = 5999; // spec: body < 6000 chars
export const MAX_ISSUE_URL_CHARS = 8000; // GitHub rejects very long URLs
export const CLIENT_ERRORS_PER_MIN = 20;

const PLACEHOLDERS = ['<user>', '<profile>', '<host>', '<serial>', '<email>'].map(p => Array.from(p));

// ---------------------------------------------------------------- redaction

const isAlnum = c => /^[\p{Alphabetic}\p{N}]$/u.test(c);
const isAlpha = c => /^\p{Alphabetic}$/u.test(c);
const isAsciiAlnum = c => /^[A-Za-z0-9]$/.test(c);
const isWs = c => /^\s$/u.test(c);
const isCtl = c => /^\p{Cc}$/u.test(c);
const lowerAscii = c => (c >= 'A' && c <= 'Z' ? c.toLowerCase() : c);

// Single-code-point lowercase fold, identical in spirit to the Rust `fold`.
function fold(c) {
  const l = c.toLowerCase();
  return Array.from(l).length === 1 ? l : c;
}

const chars = s => Array.from(String(s ?? ''));

function placeholderAt(t, i) {
  if (t[i] !== '<') return 0;
  for (const p of PLACEHOLDERS) {
    if (i + p.length <= t.length && p.every((ch, k) => t[i + k] === ch)) return p.length;
  }
  return 0;
}

function eqCiAscii(t, i, word) {
  const w = Array.from(word);
  if (i + w.length > t.length) return false;
  return w.every((ch, k) => lowerAscii(t[i + k]) === ch);
}

const isLocalChar = c => isAlnum(c) || '._%+-'.includes(c);
const isDomainChar = c => isAlnum(c) || '.-'.includes(c);

function redactEmails(t) {
  const out = [];
  let i = 0;
  while (i < t.length) {
    if (t[i] === '@') {
      let end = i + 1;
      while (end < t.length && isDomainChar(t[end])) end++;
      while (end > i + 1 && (t[end - 1] === '.' || t[end - 1] === '-')) end--;
      const domain = t.slice(i + 1, end);
      const dot = domain.lastIndexOf('.');
      const tldOk = dot >= 0 && domain.length - dot - 1 >= 2 && domain.slice(dot + 1).every(isAlpha);
      let ls = out.length;
      while (ls > 0 && isLocalChar(out[ls - 1])) ls--;
      if (tldOk && ls < out.length && domain.length > 0) {
        out.length = ls;
        out.push(...'<email>');
        i = end;
        continue;
      }
    }
    out.push(t[i]);
    i++;
  }
  return out;
}

function buildLiterals(ctx) {
  const lits = [];
  const add = (value, ph) => {
    if (typeof value !== 'string') return;
    const f = Array.from(value.trim()).map(fold);
    if (f.length < 2 || f.some(isCtl)) return;
    lits.push([f, Array.from(ph)]);
  };
  add(ctx?.profile, '<profile>');
  add(ctx?.user, '<user>');
  add(ctx?.host, '<host>');
  for (const s of ctx?.serials ?? []) add(s, '<serial>');
  return lits.sort((a, b) => b[0].length - a[0].length); // stable: ties keep insertion order
}

function redactLiterals(t, ctx) {
  const lits = buildLiterals(ctx);
  if (!lits.length) return t;
  const out = [];
  let i = 0;
  scan: while (i < t.length) {
    const ph = placeholderAt(t, i);
    if (ph) {
      for (let k = 0; k < ph; k++) out.push(t[i + k]);
      i += ph;
      continue;
    }
    for (const [lit, rep] of lits) {
      const n = lit.length;
      if (i + n > t.length) continue;
      let hit = true;
      for (let k = 0; k < n; k++) if (fold(t[i + k]) !== lit[k]) { hit = false; break; }
      if (!hit) continue;
      if (n < 3) {
        const before = i > 0 && isAlnum(t[i - 1]);
        const after = i + n < t.length && isAlnum(t[i + n]);
        if (before || after) continue;
      }
      out.push(...rep);
      i += n;
      continue scan;
    }
    out.push(t[i]);
    i++;
  }
  return out;
}

const isSep = c => c === '\\' || c === '/';
const endsSegment = c => isWs(c) || '\\/:*?"<>|\',;()[]{}'.includes(c);
const UNIX_PREV = '"\'=([{,;:';

function redactPaths(t) {
  const out = [];
  let i = 0;
  while (i < t.length) {
    let prefixEnd = -1;
    if (/^[A-Za-z]$/.test(t[i]) && t[i + 1] === ':') {
      let j = i + 2;
      const s = j;
      while (j < t.length && isSep(t[j]) && j - s < 4) j++;
      if (j > s && eqCiAscii(t, j, 'users')) {
        j += 5;
        const s2 = j;
        while (j < t.length && isSep(t[j]) && j - s2 < 4) j++;
        if (j > s2) prefixEnd = j;
      }
    } else if (t[i] === '/' && (i === 0 || UNIX_PREV.includes(t[i - 1]) || isWs(t[i - 1]))) {
      for (const word of ['home', 'Users']) {
        const w = Array.from(word);
        if (t.length > i + 1 + w.length && w.every((ch, k) => t[i + 1 + k] === ch) && t[i + 1 + w.length] === '/') {
          prefixEnd = i + 2 + w.length;
          break;
        }
      }
    }
    if (prefixEnd >= 0) {
      let k = prefixEnd;
      while (k < t.length && !endsSegment(t[k])) k++;
      for (let q = i; q < prefixEnd; q++) out.push(t[q]);
      if (k > prefixEnd) {
        out.push(...'<user>');
        i = k;
      } else {
        i = prefixEnd;
      }
      continue;
    }
    out.push(t[i]);
    i++;
  }
  return out;
}

const isSerialChar = c => isAsciiAlnum(c) || c === '-';

function redactSerialTokens(t) {
  const out = [];
  let i = 0;
  while (i < t.length) {
    let after = -1;
    if (eqCiAscii(t, i, 'serial')) {
      let j = i + 6;
      for (const w of ['number', 'num', 'no']) {
        let k = j;
        if (t[k] === ' ' || t[k] === '_' || t[k] === '-') k++;
        if (eqCiAscii(t, k, w)) {
          j = k + w.length;
          if (t[j] === '.') j++;
          break;
        }
      }
      if (!(j < t.length && isAlnum(t[j]))) after = j;
    } else if ((eqCiAscii(t, i, 's/n') || eqCiAscii(t, i, 'sn')) && (i === 0 || !isAlnum(t[i - 1]))) {
      const j = i + (eqCiAscii(t, i, 's/n') ? 3 : 2);
      if (!(j < t.length && isAlnum(t[j]))) after = j;
    }
    if (after >= 0) {
      let j = after;
      for (let q = i; q < j; q++) out.push(t[q]);
      while (j < t.length && (isWs(t[j]) || ':=#"\'-.'.includes(t[j]))) { out.push(t[j]); j++; }
      let k = j;
      while (k < t.length && isSerialChar(t[k])) k++;
      const tok = t.slice(j, k);
      if (tok.length >= 4 && tok.some(c => c >= '0' && c <= '9')) {
        out.push(...'<serial>');
        j = k;
      }
      i = j;
      continue;
    }
    out.push(t[i]);
    i++;
  }
  return out;
}

/**
 * Best-effort removal of personal information. `ctx` = {user, profile, host, serials[]}; in the
 * desktop app the Rust side owns the real values, browser mode passes none and relies on the
 * path / e-mail / serial-label rules. Idempotent.
 */
export function redactText(text, ctx = {}) {
  let t = chars(text);
  t = redactEmails(t);
  t = redactLiterals(t, ctx);
  t = redactEmails(t); // again: a literal next to an address can hide its domain boundary
  t = redactPaths(t);
  t = redactSerialTokens(t);
  return t.join('');
}

const isSerialKey = k => /serial/i.test(k) || /^(sn|s\/n)$/i.test(k);

// The value of a field named like a serial number is replaced whatever it looks like.
function serialValue(v, ctx) {
  if (typeof v === 'string') return v === '' ? v : '<serial>';
  if (typeof v === 'number') return '<serial>';
  if (Array.isArray(v)) return v.map(x => serialValue(x, ctx));
  return redactValue(v, ctx);
}

export function redactValue(value, ctx = {}) {
  if (typeof value === 'string') return redactText(value, ctx);
  if (Array.isArray(value)) return value.map(v => redactValue(v, ctx));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [redactText(k, ctx), isSerialKey(k) ? serialValue(v, ctx) : redactValue(v, ctx)]));
  }
  return value;
}

// ---------------------------------------------------------------- client errors

/** Control characters become spaces (newlines become " | "), length capped in code points. */
export function sanitizeLogText(s, max) {
  const out = [];
  let n = 0; // counts output chars, so the cap bounds the result
  for (const c of String(s ?? '')) {
    const piece = c === '\n' || c === '\r' ? ' | ' : isCtl(c) ? ' ' : c;
    const w = Array.from(piece).length;
    if (n + w > max) { out.push('…'); break; }
    out.push(piece);
    n += w;
  }
  return out.join('');
}

/** Length-capped, control-free payload for `log_client_error` (total well under 4 KiB). */
export function capClientError(e = {}) {
  const num = v => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);
  const out = {
    kind: e.kind === 'unhandledrejection' ? 'unhandledrejection' : 'error',
    message: sanitizeLogText(e.message, 1500),
    source: sanitizeLogText(e.source, 400),
    line: num(e.line),
    col: num(e.col),
  };
  if (e.stack) out.stack = sanitizeLogText(e.stack, 1800);
  if (e.screen) out.screen = sanitizeLogText(e.screen, 64);
  return out;
}

/** Sliding-window limiter: at most `max` events per `windowMs`. */
export function createRateLimiter(max = CLIENT_ERRORS_PER_MIN, windowMs = 60000, now = () => Date.now()) {
  let stamps = [];
  return {
    allow() {
      const t = now();
      stamps = stamps.filter(s => t - s < windowMs);
      if (stamps.length >= max) return false;
      stamps.push(t);
      return true;
    },
  };
}

/**
 * Forwards uncaught errors and unhandled rejections to the `log_client_error` command.
 * `invoke(cmd, args)` is injected; `target` is the window (or any EventTarget). Returns a disposer.
 */
export function installClientErrorHooks(invoke, { target = globalThis, screen = () => undefined, limiter = createRateLimiter() } = {}) {
  if (typeof invoke !== 'function' || typeof target?.addEventListener !== 'function') return () => {};
  const send = entry => {
    if (!limiter.allow()) return;
    try {
      const r = invoke('log_client_error', { entry: capClientError({ ...entry, screen: screen() }) });
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch { /* logging must never throw */ }
  };
  const onError = ev => send({ kind: 'error', message: ev?.message ?? ev?.error?.message ?? String(ev?.error ?? 'error'), source: ev?.filename, line: ev?.lineno, col: ev?.colno, stack: ev?.error?.stack });
  const onRejection = ev => {
    const r = ev?.reason;
    send({ kind: 'unhandledrejection', message: r?.message ?? String(r ?? 'unhandled rejection'), source: '', stack: r?.stack });
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener?.('error', onError);
    target.removeEventListener?.('unhandledrejection', onRejection);
  };
}

// ---------------------------------------------------------------- summary and issue URL

/** Human-readable summary (also the GitHub issue body). `info` fields are all optional. */
export function buildSummaryText(info = {}, ctx = {}) {
  const lines = ['DeckChek diagnostics summary'];
  const add = (label, v) => { if (v !== undefined && v !== null && v !== '') lines.push(`${label}: ${sanitizeLogText(v, 300)}`); };
  add('App version', info.appVersion);
  add('OS', [info.os, info.osVersion, info.arch && `(${info.arch})`].filter(Boolean).join(' '));
  add('WebView2', info.webview2Version);
  add('Locale', info.locale);
  add('Mode', info.mode);
  add('Previous run closed unexpectedly', info.crashedLastRun === undefined ? undefined : info.crashedLastRun ? 'yes' : 'no');
  add('Last panic', info.lastPanic);
  add('Database schema version', info.schemaVersion);
  add('Latest run', info.latestRun);
  if (Array.isArray(info.notIncluded) && info.notIncluded.length) add('Not included', info.notIncluded.join(', '));
  lines.push('', 'This summary contains no audio. Nothing is sent automatically.');
  const text = lines.join('\n');
  return info.redact === false ? text : redactText(text, ctx);
}

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * Prefilled "new issue" URL on github.com with a text-only body (< 6000 chars). Returns null
 * when `repo` is unset or malformed (the UI hides the button). The user attaches the zip by hand.
 */
export function buildIssueUrl(summary, repo = ISSUE_REPO, { title = 'Bug report' } = {}) {
  if (typeof repo !== 'string' || !REPO_RE.test(repo)) return null;
  const note = '\n\n(Please drag the diagnostics zip into this issue before submitting.)';
  const cut = (s, n) => (Array.from(s).length > n ? Array.from(s).slice(0, n).join('') + '…' : s);
  const t = cut(String(title).replace(/[\r\n]+/g, ' '), 120);
  let budget = MAX_ISSUE_BODY_CHARS - Array.from(note).length - 1; // -1: the ellipsis
  const build = n => {
    const body = cut(String(summary ?? ''), n) + note;
    return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(t)}&body=${encodeURIComponent(body)}`;
  };
  let url = build(budget);
  while (url.length > MAX_ISSUE_URL_CHARS && budget > 100) {
    budget = Math.floor(budget * 0.9);
    url = build(budget);
  }
  return url;
}
