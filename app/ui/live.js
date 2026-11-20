// Live-region announcements and toasts.

import { h } from './dom.js';
import { icon } from './icons.js';

let politeEl = null, assertiveEl = null, toastHost = null;

function ensure() {
  politeEl ??= document.getElementById('sr-polite');
  assertiveEl ??= document.getElementById('sr-assertive');
  toastHost ??= document.getElementById('toasts');
}

const pendingAnnouncements = new Map();

/** Retire pending feedback when leaving a screen; the two live regions stay independent. */
export function cancelPendingAnnouncements() {
  for (const pending of pendingAnnouncements.values()) clearTimeout(pending.timer);
  pendingAnnouncements.clear();
}

/** Announce the latest message in its channel; optional ownership is checked again at delivery. */
export function announce(message, { assertive = false, isCurrent = () => true } = {}) {
  if (!isCurrent()) return;
  ensure();
  const el = assertive ? assertiveEl : politeEl;
  if (!el) return;
  const previous = pendingAnnouncements.get(el);
  if (previous) clearTimeout(previous.timer);
  const pending = {};
  pendingAnnouncements.set(el, pending);
  el.textContent = '';
  pending.timer = setTimeout(() => {
    if (pendingAnnouncements.get(el) !== pending) return;
    pendingAnnouncements.delete(el);
    if (isCurrent()) el.textContent = message;
  }, 40);
}

const ICON = { success: 'pass', info: 'info', error: 'fail', warn: 'warn' };

/** Toast: 5 s for info/success (paused on hover/focus), persistent with Details (support dialog) and Dismiss for errors. Max 3 stacked. */
export function toast(message, { type = 'info', timeout = 5000, action = null, actions = null, details = true } = {}) {
  ensure();
  if (!toastHost) return;
  const isError = type === 'error';
  const close = h('button', { type: 'button', class: 'btn btn-ghost btn-icon toast-close', 'aria-label': 'Dismiss notification', html: icon('x', { size: 16 }) });
  const el = h('div', { class: `toast toast-${type}`, role: isError ? 'alert' : 'status' },
    h('span', { class: 'toast-icon', html: icon(ICON[type] || 'info', { size: 18 }) }),
    h('span', { class: 'toast-msg', text: message }));
  for (const a of actions ?? (action ? [action] : [])) el.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-toast-action': a.label, text: a.label, onclick: () => { a.run(); remove(); } }));
  // Errors offer the support dialog (FS-02); it listens for this window event.
  if (isError && details) el.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm toast-details', text: 'Details', onclick: () => { globalThis.dispatchEvent(new CustomEvent('deckchek:diagnostics')); remove(); } }));
  el.append(close);
  toastHost.append(el);
  while (toastHost.children.length > 3) toastHost.firstElementChild.remove();
  let timer = null;
  function remove() { clearTimeout(timer); el.remove(); }
  function arm() { if (!isError && timeout) timer = setTimeout(remove, timeout); }
  close.addEventListener('click', remove);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('focusin', () => clearTimeout(timer));
  el.addEventListener('mouseleave', arm);
  arm();
  return remove;
}
