// FS-31 live monitor: the live event list and the saved session logs (AC-7: every event and the per-minute
// summaries of a session, viewable and exportable after it ends; the sessions are also listed in History).
// User strings (device names, messages) only ever reach the DOM as textContent.

import { h } from './dom.js';
import { icon } from './icons.js';
import { announce, toast } from './live.js';
import { saveTextFile } from '../userfiles.js';
import { exportLog, kindLabel, DECK_STATE } from '../monitor.js';

const SEVERITY = { info: { label: 'Info', icon: 'info', chip: 'info' }, warning: { label: 'Warning', icon: 'warn', chip: 'warn' }, critical: { label: 'Critical', icon: 'fail', chip: 'fail' } };
export const severityInfo = s => SEVERITY[s] || SEVERITY.info;

/** Session clock: "m:ss" under an hour, "h:mm:ss" above. */
export function formatClock(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hh = Math.floor(total / 3600), mm = Math.floor((total % 3600) / 60), ss = total % 60;
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}

/** "28 Oct 2026, 21:04" in the user's locale; '' for an invalid date. */
export function formatWhen(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Duration of a stored session in seconds (summary first, then the timestamps). */
export function sessionDurationSec(s) {
  if (Number.isFinite(s?.summary?.durationSec)) return s.summary.durationSec;
  const a = Date.parse(s?.startedAt), b = Date.parse(s?.endedAt);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, (b - a) / 1000) : null;
}

/** One-line description of a stored session for lists and History. */
export function sessionMeta(s) {
  const dur = sessionDurationSec(s);
  const parts = [
    s?.format || null,
    s?.deviceName || null,
    Number.isFinite(dur) ? formatClock(dur * 1000) : null,
    Number.isFinite(s?.criticalCount) && s.criticalCount ? `${s.criticalCount} critical` : null,
    Number.isFinite(s?.warningCount) && s.warningCount ? `${s.warningCount} warning${s.warningCount === 1 ? '' : 's'}` : null,
    s?.endedAt ? null : 'not closed',
  ].filter(Boolean);
  return parts.join(' · ');
}

/** Worst severity of a stored session: 'critical' | 'warning' | 'ok'. */
export const sessionWorst = s => (s?.criticalCount ? 'critical' : s?.warningCount ? 'warning' : 'ok');

/** Export file name stem for a session log. */
export function logFileStem(s) {
  const d = new Date(s?.startedAt);
  const stamp = Number.isNaN(d.getTime()) ? 'session' : d.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  return `deckchek-live-monitor-${stamp}`;
}

/**
 * Live event list (newest first). role="log" so screen readers can review it; announcements come from the toasts.
 * Returns {el, add(alert), set(alerts), clear()}. At most `cap` rows are kept in the DOM.
 */
export function createEventList({ cap = 200, empty = 'No events yet. Alerts and notes appear here as they happen.' } = {}) {
  const list = h('ol', { class: 'mon-events', role: 'log', 'aria-label': 'Live monitor events', 'aria-live': 'off' });
  const none = h('p', { class: 'muted small mon-events-empty', text: empty });
  const el = h('div', { class: 'mon-events-wrap' }, none, list);
  const row = a => {
    const s = severityInfo(a.severity);
    return h('li', { class: `mon-event mon-sev-${s.chip}`, 'data-kind': a.kind, 'data-severity': a.severity },
      h('span', { class: 'mon-event-time', text: formatClock(a.tMs ?? (a.t || 0) * 1000) }),
      h('span', { class: `chip chip-${s.chip}`, html: `${icon(s.icon, { size: 14 })}<span>${s.label}</span>` }),
      h('span', { class: 'mon-event-msg', text: a.message || kindLabel(a.kind) }));
  };
  const sync = () => { none.hidden = list.childElementCount > 0; };
  sync();
  return {
    el,
    add(a) { list.prepend(row(a)); while (list.childElementCount > cap) list.lastElementChild.remove(); sync(); },
    set(alerts) { list.replaceChildren(...[...(alerts || [])].reverse().slice(0, cap).map(row)); sync(); },
    clear() { list.replaceChildren(); sync(); },
  };
}

/**
 * Saved session logs: list (newest first) with View, Export JSON and Delete; the viewer shows every event and the
 * per-minute table. `api`: {list(limit), get(id), remove(id)}. Returns {el, refresh(), open(id)}.
 */
export function createLogViewer({ api, onChange = () => {}, confirm = async () => true } = {}) {
  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const list = h('ul', { class: 'mon-logs', 'aria-label': 'Saved monitor sessions' });
  const detail = h('div', { class: 'mon-log-detail' });
  const el = h('section', { class: 'card mon-logs-card', 'aria-labelledby': 'mon-logs-title' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'mon-logs-title', tabindex: '-1', text: 'Session logs' }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'mon-logs-refresh', text: 'Refresh', onclick: () => refresh() })),
    status, list, detail);
  let rows = [], openId = null;

  async function refresh() {
    if (!api) { status.textContent = 'Session logs are saved in the desktop app.'; list.replaceChildren(); return; }
    status.textContent = 'Loading session logs…';
    try {
      rows = await api.list(50);
      status.textContent = rows.length ? `${rows.length} saved session${rows.length === 1 ? '' : 's'}. Logs older than the retention period are removed at start-up.` : 'No saved sessions yet. A log is saved each time you stop the monitor.';
    } catch (error) {
      rows = [];
      status.textContent = `Session logs could not be loaded: ${String(error?.message ?? error)}`;
    }
    draw();
  }

  const ACTIONS = ['data-log-view', 'data-log-export', 'data-log-delete'];
  /** Where keyboard focus is inside the list: {attr, id, index} of the focused row button, or null. */
  function focusedAction() {
    const a = document.activeElement;
    if (!a || !list.contains(a)) return null;
    const attr = ACTIONS.find(n => a.hasAttribute(n));
    if (!attr) return null;
    const li = a.closest('li');
    return { attr, id: a.getAttribute(attr), index: Math.max(0, [...list.children].indexOf(li)) };
  }
  /** After a rebuild: the same button of the same log, else the same button of the row now at that position (the
   * next log after a delete, or the previous one at the end), else the Session logs heading. */
  function restoreFocus(was) {
    if (!was) return;
    const buttons = [...list.querySelectorAll(`[${was.attr}]`)];
    const target = buttons.find(b => b.getAttribute(was.attr) === was.id) || buttons[Math.min(was.index, buttons.length - 1)];
    (target || el.querySelector('#mon-logs-title'))?.focus();
  }

  function draw() {
    const was = focusedAction();
    list.replaceChildren(...rows.map(s => {
      const worst = sessionWorst(s);
      const st = worst === 'critical' ? DECK_STATE.fault : worst === 'warning' ? DECK_STATE.watch : DECK_STATE.ok;
      return h('li', { class: `mon-log ${openId === s.id ? 'selected' : ''}`, 'data-session': s.id },
        h('span', { class: `chip chip-${st.chip}`, html: `${icon(st.icon, { size: 14 })}<span>${st.label}</span>` }),
        h('span', { class: 'mon-log-main' }, h('strong', { text: formatWhen(s.startedAt) || 'Session' }), h('span', { class: 'muted small', text: sessionMeta(s) })),
        h('span', { class: 'mon-log-actions' },
          h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-log-view': s.id, 'aria-label': `View log of ${formatWhen(s.startedAt)}`, text: 'View', onclick: () => open(s.id) }),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-log-export': s.id, 'aria-label': `Export log of ${formatWhen(s.startedAt)} as JSON`, text: 'Export JSON', onclick: () => exportOne(s.id) }),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-danger-ghost', 'data-log-delete': s.id, 'aria-label': `Delete log of ${formatWhen(s.startedAt)}`, html: icon('trash', { size: 16 }), onclick: () => removeOne(s.id) })));
    }));
    restoreFocus(was);
  }

  async function open(id) {
    openId = id;
    draw();
    detail.replaceChildren(h('p', { class: 'muted small', text: 'Loading log…' }));
    let log = null;
    try { log = await api.get(id); } catch (error) { detail.replaceChildren(h('p', { class: 'small', role: 'alert', text: `The log could not be opened: ${String(error?.message ?? error)}` })); return; }
    if (!log) { detail.replaceChildren(h('p', { class: 'small', text: 'This log no longer exists.' })); return; }
    const events = createEventList({ cap: 10000, empty: 'No events in this session: nothing needed attention.' });
    events.set(log.events.map(e => ({ ...e, t: e.tMs / 1000 })));
    const mins = h('table', { class: 'data mon-minutes' },
      h('caption', { class: 'sr-only', text: 'Per-minute summary per deck' }),
      h('thead', {}, h('tr', {}, ...['Minute', 'Deck', 'SNR min (dB)', 'SNR mean (dB)', 'Hum max (dBFS)', 'Drift max (deg)', 'Dropouts'].map(t => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, ...log.minutes.map(m => h('tr', {},
        h('td', { text: String(m.minute + 1) }), h('td', { text: m.deck }),
        ...[m.snrDbMin, m.snrDbMean, m.humDbMax, m.driftDegMax].map(v => h('td', { class: 'r', text: Number.isFinite(v) ? v.toFixed(1) : '—' })),
        h('td', { class: 'r', text: Number.isFinite(m.dropouts) ? String(m.dropouts) : '—' })))));
    detail.replaceChildren(
      h('h3', { class: 'mon-log-title', tabindex: '-1', text: `Log of ${formatWhen(log.session.startedAt)}` }),
      h('p', { class: 'muted small', text: sessionMeta({ ...log.session }) }),
      h('h4', { class: 'mon-sub', text: `Events (${log.events.length})` }), events.el,
      h('h4', { class: 'mon-sub', text: `Per-minute summary (${log.minutes.length} rows)` }),
      log.minutes.length ? h('div', { class: 'mon-table-wrap' }, mins) : h('p', { class: 'muted small', text: 'No complete minute was recorded.' }));
    detail.querySelector('.mon-log-title')?.focus();
  }

  async function exportOne(id) {
    try {
      const log = await api.get(id);
      if (!log) return;
      const r = await saveTextFile({ suggestedName: logFileStem(log.session), content: JSON.stringify(exportLog(log), null, 2), ext: 'json' });
      if (!r.cancelled) toast('Session log saved.', { type: 'success' });
    } catch (error) {
      toast(`The log could not be saved: ${String(error?.message ?? error)}`, { type: 'error' });
    }
  }

  async function removeOne(id) {
    const row = rows.find(r => r.id === id);
    if (!(await confirm({ title: 'Delete this session log?', body: `The log of ${formatWhen(row?.startedAt) || 'this session'} and all its events are removed. This cannot be undone.` }))) return;
    try {
      await api.remove(id);
      if (openId === id) { openId = null; detail.replaceChildren(); }
      announce('Session log deleted');
      await refresh();
      onChange();
    } catch (error) {
      toast(`The log could not be deleted: ${String(error?.message ?? error)}`, { type: 'error' });
    }
  }

  return { el, refresh, open };
}
