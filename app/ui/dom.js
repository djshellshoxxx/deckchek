// Small DOM, formatting and storage helpers shared by every UI module.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Create an element. attrs: class, text, html (trusted markup only), dataset, on* listeners, any attribute. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Parse trusted markup into a single element (or fragment when several roots). */
export function frag(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
}

export function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function slug(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------- number formatting ----------
export function formatNumber(value, { digits = null } = {}) {
  if (typeof value !== 'number') return value == null ? '—' : String(value);
  if (!Number.isFinite(value)) return value === -Infinity ? '−∞' : value === Infinity ? '∞' : '—';
  if (digits == null && Number.isInteger(value)) return String(value).replace('-', '−');
  const abs = Math.abs(value);
  const d = digits ?? (abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 10 ? 2 : 3);
  return value.toFixed(d).replace('-', '−');
}

export function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

export function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso ?? '—') : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function toDb(amplitude) {
  return amplitude > 0 ? 20 * Math.log10(amplitude) : -Infinity;
}

// ---------- storage (never throws) ----------
export function storageGet(key, fallback = null) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

export function storageSet(key, value) {
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// ---------- downloads ----------
export function download(filename, data, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function pickFile(accept) {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept, hidden: true });
    input.addEventListener('change', () => { resolve(input.files?.[0] || null); input.remove(); }, { once: true });
    document.body.append(input);
    input.click();
  });
}

/** True when keyboard focus is in a text-entry control (shortcuts must not fire). */
export function isTyping(target = document.activeElement) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  if (target.tagName === 'INPUT') return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range'].includes((target.type || 'text').toLowerCase());
  return false;
}

/**
 * A link that leaves the app. Click handling is done by the global interceptor (app/external-links.js),
 * which sends it through the URL policy; this only builds the markup (icon + screen-reader hint).
 */
export function externalLink(href, text, { class: cls = '' } = {}) {
  const a = h('a', { href, rel: 'noopener noreferrer', class: `external-link ${cls}`.trim(), 'data-external': '' }, text ?? href);
  a.append(frag('<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'));
  a.append(h('span', { class: 'sr-only', text: ' (opens in your browser)' }));
  return a;
}

export function isNative() {
  return typeof globalThis.window?.__TAURI__?.core?.invoke === 'function';
}
