// FS-23 fleet dashboard screen: overview grid with summary tiles, filters and an asset side panel, plus the
// venues editor (fleet-venues.js), reminders manager and events log as tabs. Persistence stays in fleet-api;
// health, reminder state and CSV are the pure functions in app/fleet.js. Desktop only: the browser preview
// has no database, so it shows an explicit unsupported state. Flag: features.fleet (default on).
// The start-up banner lives in ui/fleet-banner.js (installed from the [FS-23] anchor in ui/shell.js).

import { h } from '../dom.js';
import { chip } from '../icons.js';
import { settings, setSetting } from '../state.js';
import { navigateTo, takeHandoff } from '../crosslinks.js';
import { announce, toast } from '../live.js';
import { createFleetApi } from '../../fleet-api.js';
import { filterFleet, fleetToCsv, summarizeFleet, reminderWhen, nextDueReminder, HEALTH_META, REMINDER_META } from '../../fleet.js';
import { saveTextFile } from '../../userfiles.js';
import { fleetTemplatePanel } from '../fleet-templates.js';
import { venuesPanel, positionOptions } from './fleet-venues.js';
import { eventsPanel, maintenanceForm, EVENT_TYPES } from '../fleet-events.js';

const TABS = [['overview', 'Overview'], ['venues', 'Venues & positions'], ['reminders', 'Reminders'], ['events', 'Events log']];
const HEALTH_RANK = { attention: 0, review: 1, never: 2, healthy: 3 };
const REMINDER_TABLE_CAP = 500;
const label = (text, input) => h('label', { class: 'field' }, h('span', { class: 'field-label', text }), input);
const button = (text, onclick, attrs = {}) => h('button', { type: 'button', class: 'btn btn-secondary', text, onclick, ...attrs });
const option = (value, text) => h('option', { value, text });
const friendly = error => typeof error === 'string' ? error : error?.message || 'Fleet operation failed.';
const healthChip = row => {
  // A unit with a session date but no device tests is "never tested" by AC-2; say so rather than hiding the date.
  const meta = HEALTH_META[row.health] ?? HEALTH_META.never;
  return h('span', { class: `fleet-health fleet-health-${row.health}`, html: chip(meta.status, meta.label, { size: 14 }) });
};
const reminderChip = reminder => {
  const meta = REMINDER_META[reminder.state] ?? REMINDER_META.unknown; // fixed vocabulary only: no user text goes into chip() markup
  return h('span', { class: `fleet-reminder fleet-reminder-${reminder.state}`, html: chip(meta.status, meta.label, { size: 14 }) });
};
const reminderLine = reminder => `${reminder.title}${reminderWhen(reminder) ? ` · ${reminderWhen(reminder)}` : ''}${reminder.snoozed ? ' (snoozed)' : ''}`;

const SORTS = {
  nickname: row => String(row.nickname ?? '').toLowerCase(),
  venue: row => [row.venue, row.booth, row.position].filter(Boolean).join(' / ').toLowerCase() || '￿',
  lastTestedAt: row => row.lastTestedAt ?? '',
  health: row => HEALTH_RANK[row.health] ?? 9,
};

export function sortRows(rows, key, descending) {
  const value = SORTS[key] ?? SORTS.nickname, sign = descending ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = value(a), y = value(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sign || String(a.nickname).localeCompare(String(b.nickname));
  });
}

const cssEsc = value => (globalThis.CSS?.escape ? globalThis.CSS.escape(String(value)) : String(value).replace(/[^\w-]/g, c => `\\${c}`));
// Attributes that name a control independently of the DOM node, so the same control can be found after a re-render.
const FOCUS_KEYS = ['data-fleet-filter', 'data-tile', 'data-sort', 'data-move-asset', 'data-move-go', 'data-print-booth', 'data-snooze', 'data-apply-template', 'data-fleet-asset'];

/** A selector that finds "the same" control after the view is rebuilt; null when `el` is not inside `root`. */
export function focusSelector(el, root) {
  if (!el || el === root || !root?.contains?.(el)) return null;
  if (el.id) return `#${cssEsc(el.id)}`;
  for (const key of FOCUS_KEYS) if (el.hasAttribute?.(key)) return `[${key}="${cssEsc(el.getAttribute(key))}"]`;
  const form = el.closest?.('form[id]');
  if (!form) return null;
  const name = el.getAttribute?.('name');
  return name ? `#${cssEsc(form.id)} [name="${cssEsc(name)}"]` : `#${cssEsc(form.id)} [type="submit"]`;
}

export function createFleetScreen(section, { api = createFleetApi() } = {}) {
  const state = { view: null, selected: null, filters: {}, sort: 'nickname', descending: false, tab: 'overview', loading: false };
  section.innerHTML = `<header class="screen-head"><div class="screen-title"><div><h1 tabindex="-1">Fleet</h1><p class="lede">Recorded checks and maintenance across your venues. Tracked hours are estimates, not true runtime.</p></div></div></header>
    <div id="fleet-status" role="status" aria-live="polite"></div><div class="tabs" role="tablist" aria-label="Fleet sections" id="fleet-tabs"></div><div id="fleet-content" role="tabpanel" tabindex="-1"></div>`;
  const status = section.querySelector('#fleet-status'), content = section.querySelector('#fleet-content'), tabs = section.querySelector('#fleet-tabs');

  // Re-renders replace the controls, so focus is put back on the matching new control (or `fallback`, or the
  // panel). Only when focus was lost: a user who has moved on elsewhere keeps their place.
  function restoreFocus(selector, fallback = null) {
    const now = document.activeElement;
    // Focus on the panel container itself counts as lost (a click on a disabled button lands there).
    if (now && now !== document.body && now !== content && now !== section && now.isConnected && !now.disabled) return;
    for (const sel of [selector, fallback]) {
      const el = sel ? section.querySelector(sel) : null;
      if (el && !el.disabled && !el.closest('[hidden]')) { el.focus(); if (document.activeElement === el) return; }
    }
    content.focus();
  }
  // Synchronous re-render that keeps the focused control focused.
  function keepFocus(rerender) {
    const selector = focusSelector(document.activeElement, section);
    rerender();
    if (selector) restoreFocus(selector);
  }

  // Every mutation goes through here: one at a time (a second click or Enter while a save is in flight is
  // ignored, so double submits cannot write duplicate rows), the triggering control is disabled meanwhile,
  // success is announced, and focus returns to the same control after the reload rebuilds the panel.
  let busy = false;
  const act = async (action, { done = 'Saved.', control = null, fallback = null } = {}) => {
    if (busy) return false;
    busy = true;
    const selector = focusSelector(control ?? document.activeElement, section);
    if (control) { control.disabled = true; control.setAttribute('aria-busy', 'true'); }
    try {
      await action(); await load();
      globalThis.dispatchEvent(new Event('deckchek:fleet-changed'));
      announce(done);
      restoreFocus(selector, fallback);
      return true;
    } catch (error) {
      status.replaceChildren(h('span', { role: 'alert', text: friendly(error) })); announce(friendly(error), { assertive: true });
      return false;
    } finally {
      busy = false;
      if (control) { control.disabled = false; control.removeAttribute('aria-busy'); }
      if (control?.isConnected && document.activeElement === document.body) control.focus();
    }
  };
  const filtered = () => sortRows(filterFleet(state.view?.rows ?? [], state.filters), state.sort, state.descending);

  async function load() {
    if (!api.native) { tabs.hidden = true; content.replaceChildren(h('div', { class: 'empty', id: 'fleet-unsupported', text: 'Fleet persistence requires the desktop app. Equipment and recorded-file diagnostics remain available in this browser.' })); return; }
    tabs.hidden = false;
    state.loading = true;
    if (!state.view) renderSkeleton();
    status.replaceChildren(h('span', { text: state.view ? 'Refreshing fleet…' : 'Loading fleet…' }));
    try { state.view = await api.overview({ staleDays: settings.fleet?.staleDays ?? 90 }); status.replaceChildren(); state.loading = false; render(); }
    catch (error) { state.loading = false; status.replaceChildren(h('span', { role: 'alert', text: `Could not load the fleet: ${friendly(error)} ` }), button('Retry', load, { id: 'fleet-retry' })); }
  }

  function renderSkeleton() {
    content.replaceChildren(h('div', { class: 'fleet-skeleton', 'aria-hidden': 'true' }, ...Array.from({ length: 5 }, () => h('div', { class: 'fleet-skeleton-row' }))));
  }

  function renderTabs() {
    tabs.replaceChildren(...TABS.map(([id, text]) => h('button', {
      type: 'button', class: 'tab', role: 'tab', id: `fleet-tab-${id}`, 'aria-selected': String(state.tab === id), 'aria-controls': 'fleet-content', tabindex: state.tab === id ? '0' : '-1', text,
      onclick: () => selectTab(id, { focusTab: true }),
      onkeydown: e => {
        const i = TABS.findIndex(([t]) => t === state.tab);
        const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
        if (next < 0) return;
        e.preventDefault(); selectTab(TABS[next][0], { focusTab: true });
      },
    })));
    content.setAttribute('aria-labelledby', `fleet-tab-${state.tab}`);
  }
  function selectTab(id, { focusTab = false } = {}) {
    state.tab = id; render();
    if (focusTab) section.querySelector(`#fleet-tab-${id}`)?.focus();
  }

  function render() {
    if (!state.view) return;
    renderTabs();
    const selected = state.view.rows.find(r => r.assetId === state.selected);
    if (state.tab === 'venues') content.replaceChildren(venuesPanel({ view: state.view, api, act }));
    else if (state.tab === 'reminders') content.replaceChildren(remindersManager(selected));
    else if (state.tab === 'events') content.replaceChildren(eventsPanel({ view: state.view, api, act }));
    else renderOverview();
  }

  // ----- overview -----
  async function exportCsv() {
    // Before the fleet has loaded (or in the browser preview, which has no fleet database) there is nothing
    // to export: say so instead of saving a header-only file that looks like an empty fleet.
    if (!api.native || !state.view) {
      toast(api.native ? 'The fleet is still loading. Export again once it is shown.' : 'Fleet CSV export requires the desktop app.', { type: 'info' });
      return;
    }
    try {
      const rows = filtered();
      const result = await saveTextFile({ suggestedName: 'DeckChek-fleet.csv', ext: 'csv', content: fleetToCsv(rows) });
      if (!result.cancelled) announce(`Exported ${rows.length} assets to CSV.`);
    } catch (error) { status.replaceChildren(h('span', { role: 'alert', text: friendly(error) })); }
  }

  function tile(key, title, count, filter) {
    const pressed = filter && Object.entries(filter).every(([k, v]) => state.filters[k] === v);
    return h('button', { type: 'button', class: `fleet-tile fleet-tile-${key}`, 'data-tile': key, 'aria-pressed': filter ? String(Boolean(pressed)) : null,
      onclick: () => { if (!filter) return; for (const k of ['status', 'reminder']) delete state.filters[k]; if (!pressed) Object.assign(state.filters, filter); keepFocus(render); announceSummary(filtered(), { speak: true }); } },
    h('span', { class: 'fleet-tile-count', text: String(count) }), h('span', { class: 'fleet-tile-label', text: title }));
  }

  function filterSelect(name, title, values) {
    const select = h('select', { 'data-fleet-filter': name }, option('', `All ${title.toLowerCase()}`), ...values.map(([id, text]) => option(id, text)));
    select.value = state.filters[name] ?? '';
    select.addEventListener('change', () => { state.filters[name] = select.value; if (name === 'venueId') delete state.filters.boothId; keepFocus(render); announceSummary(filtered(), { speak: true }); });
    return label(title, select);
  }

  function renderOverview() {
    const view = state.view, all = summarizeFleet(view.rows);
    const search = h('input', { type: 'search', id: 'fleet-search', value: state.filters.search || '', placeholder: 'Asset, model, serial or location' });
    search.addEventListener('input', () => { state.filters.search = search.value; renderRows({ speak: 'later' }); });
    const booths = view.booths.filter(b => !state.filters.venueId || b.venueId === state.filters.venueId);
    const filters = h('div', { class: 'field-grid fleet-filters' }, label('Search fleet', search),
      filterSelect('venueId', 'Venues', view.venues.map(v => [v.id, v.name])),
      filterSelect('boothId', 'Booths', booths.map(b => [b.id, b.name])),
      filterSelect('category', 'Categories', [...new Set(view.rows.map(r => r.category).filter(Boolean))].sort().map(v => [v, v])),
      filterSelect('status', 'Statuses', Object.entries(HEALTH_META).map(([id, m]) => [id, m.label])));
    const tiles = h('div', { class: 'fleet-tiles', id: 'fleet-tiles', role: 'group', 'aria-label': 'Fleet summary; select a tile to filter' },
      tile('attention', 'Attention', all.attention, { status: 'attention' }), tile('overdue', 'Overdue', all.overdue, { reminder: 'overdue' }),
      tile('dueSoon', 'Due soon', all.dueSoon, { reminder: 'dueSoon' }), tile('never', 'Never tested', all.never, { status: 'never' }));
    content.replaceChildren(h('section', { class: 'card' }, h('p', { id: 'fleet-summary', class: 'sr-only' }), tiles, filters,
      h('div', { class: 'action-bar' }, button('Export CSV', exportCsv, { id: 'fleet-export' }), button('Refresh', load, { id: 'fleet-refresh' }),
        h('span', { class: 'muted small', text: 'Shortcuts: / filter · E export · N new event' })),
    h('div', { id: 'fleet-grid-host' })),
    h('section', { class: 'card', id: 'fleet-detail', 'aria-label': 'Asset details' }), settingsEditor());
    renderRows(); renderDetail();
  }

  function renderRows({ speak = false } = {}) {
    const rows = filtered(), host = content.querySelector('#fleet-grid-host');
    if (!host) return;
    if (!rows.length) {
      host.replaceChildren(view0().rows.length
        ? h('p', { class: 'empty', text: 'No assets match these filters.' })
        : h('div', { class: 'empty', id: 'fleet-no-assets' }, h('p', { text: 'No assets yet. Add decks and mixers in Equipment, then place them in a venue.' }), button('Open Venues & positions', () => selectTab('venues'))));
      announceSummary(rows, { speak }); return;
    }
    const grid = h('table', { role: 'grid', 'aria-label': 'Fleet assets', id: 'fleet-grid', class: 'fleet-grid' });
    const columns = [['nickname', 'Asset'], ['venue', 'Location'], ['lastTestedAt', 'Last tested'], ['health', 'Health'], ['failing', 'Failing items'], ['reminders', 'Next due']];
    const header = h('tr');
    for (const [key, title] of columns) {
      const sortable = key in SORTS;
      header.append(h('th', { scope: 'col', 'aria-sort': sortable ? (state.sort === key ? (state.descending ? 'descending' : 'ascending') : 'none') : null },
        sortable ? button(title, () => {
          state.descending = state.sort === key && !state.descending; state.sort = key;
          keepFocus(renderRows);
          announce(`Sorted by ${title.toLowerCase()}, ${state.descending ? 'descending' : 'ascending'}.`);
        }, { class: 'btn btn-ghost fleet-sort', 'data-sort': key }) : title));
    }
    grid.append(h('thead', {}, header));
    const body = h('tbody');
    for (const [index, row] of rows.slice(0, 500).entries()) {
      const failing = row.failing ?? [];
      const next = nextDueReminder(row.reminders);
      const tr = h('tr', { tabindex: index === 0 ? '0' : '-1', 'data-fleet-asset': row.assetId, 'aria-selected': state.selected === row.assetId ? 'true' : 'false' },
        h('td', {}, button(`${row.nickname}${row.productName ? ` · ${row.productName}` : ''}`, () => select(row.assetId), { class: 'btn btn-ghost fleet-asset-name', tabindex: '-1' })),
        h('td', { text: [row.venue, row.booth, row.position].filter(Boolean).join(' / ') || 'Unplaced' }),
        h('td', { text: row.lastTestedAt?.slice(0, 10) || 'Never tested' }),
        h('td', {}, healthChip(row)),
        h('td', {}, failing.length ? [...failing.slice(0, 3).map(f => h('span', { class: 'fleet-failing', text: f.name })), failing.length > 3 ? h('span', { class: 'fleet-failing-more', text: `+${failing.length - 3}` }) : null] : h('span', { class: 'muted', text: 'None recorded' })),
        h('td', {}, next ? [reminderChip(next), ` ${reminderLine(next)}`] : h('span', { class: 'muted', text: 'No reminders' })));
      tr.addEventListener('keydown', event => {
        if (event.target !== tr) return;
        const move = event.key === 'ArrowDown' ? tr.nextElementSibling : event.key === 'ArrowUp' ? tr.previousElementSibling : event.key === 'Home' ? body.firstElementChild : event.key === 'End' ? body.lastElementChild : null;
        if (move) { event.preventDefault(); tr.tabIndex = -1; move.tabIndex = 0; move.focus(); }
        if (event.key === 'Enter') { event.preventDefault(); select(row.assetId); }
      });
      body.append(tr);
    }
    grid.append(body);
    host.replaceChildren(...[grid, rows.length > 500 ? h('p', { class: 'muted', text: `Showing the first 500 of ${rows.length} matching assets. Narrow the filters or export CSV for all of them.` }) : null].filter(Boolean));
    announceSummary(rows, { speak });
  }
  const view0 = () => state.view ?? { rows: [] };
  // The summary is spoken through the shared live region (live.js): a region created inside the re-rendered
  // subtree is not announced. speak: true = now (filter, tile); 'later' = once typing pauses (search box).
  let speakTimer = null;
  function announceSummary(rows, { speak = false } = {}) {
    const t = summarizeFleet(rows), el = content.querySelector('#fleet-summary');
    const text = `${rows.length} asset${rows.length === 1 ? '' : 's'}. Attention ${t.attention}, overdue ${t.overdue}, due soon ${t.dueSoon}, never tested ${t.never}.`;
    if (el) el.textContent = text;
    clearTimeout(speakTimer);
    if (speak === 'later') speakTimer = setTimeout(() => announce(text), 600);
    else if (speak) announce(text);
  }
  function select(assetId) { state.selected = assetId; content.querySelectorAll('[data-fleet-asset]').forEach(tr => tr.setAttribute('aria-selected', String(tr.dataset.fleetAsset === assetId))); renderDetail(); content.querySelector('#fleet-detail h2')?.focus(); }

  function renderDetail() {
    const host = content.querySelector('#fleet-detail'), row = state.view.rows.find(r => r.assetId === state.selected);
    if (!host) return;
    if (!row) { host.replaceChildren(h('p', { class: 'muted', text: 'Choose an asset to see its recent results, reminders and events, move it, or log maintenance.' })); return; }
    const placement = h('select', { id: 'fleet-placement' }, option('', 'Unplaced'), ...positionOptions(state.view).map(([id, text]) => option(id, text)));
    placement.value = row.deckPositionId ?? '';
    const move = button('Move asset', () => {
      const target = placement.value || null;
      // Moving to where it already is would only log a fake "Moved from A to A" event.
      if (target === (row.deckPositionId ?? null)) { announce(`${row.nickname} is already ${target ? 'in that position' : 'unplaced'}.`); return; }
      const where = target ? placement.selectedOptions[0]?.textContent : 'Unplaced';
      act(() => api.place(row.assetId, target), { done: `${row.nickname} moved to ${where}.`, control: move });
    }, { id: 'fleet-move' });
    const reminderForm = h('form', { id: 'fleet-reminder-form', class: 'fleet-form' });
    const title = h('input', { name: 'title', required: true, maxlength: 200 }), basis = h('select', { name: 'basis' }, option('days', 'Calendar days'), option('hours', 'Tracked hours')),
      interval = h('input', { name: 'interval', type: 'number', min: 1, max: 1000000, value: 90, required: true }), warning = h('input', { name: 'warning', type: 'number', min: 0, max: 1000000, value: 14, required: true });
    reminderForm.append(h('h3', { text: 'Add reminder' }), h('div', { class: 'field-grid' }, label('Title', title), label('Basis', basis), label('Every (days or tracked hours)', interval), label('Warn before', warning)), h('button', { type: 'submit', class: 'btn btn-primary', text: 'Save reminder' }));
    reminderForm.addEventListener('submit', event => {
      event.preventDefault();
      act(() => api.saveReminder({ assetId: row.assetId, title: title.value, basis: basis.value, intervalValue: Number(interval.value), warnBefore: Number(warning.value) }),
        { done: `Reminder saved for ${row.nickname}.`, control: reminderForm.querySelector('[type="submit"]') });
    });
    const snooze = (reminder, attrs) => {
      const control = button('Snooze 1 day', () => act(() => api.snooze(reminder.id, new Date(Date.now() + 86400000).toISOString()), { done: `${reminder.title} snoozed for 1 day.`, control }), { 'data-snooze': reminder.id, ...attrs });
      return control;
    };
    const reminders = h('ul', { class: 'fleet-reminders' }, ...row.reminders.map(reminder => h('li', {}, reminderChip(reminder), ` ${reminderLine(reminder)} `,
      snooze(reminder, { 'aria-label': `Snooze ${reminder.title} for 1 day` }))));
    const results = (row.lastResults ?? []).filter(r => r.status !== 'pass').slice(0, 10);
    // Not a live region: a long history would be read out in full on every load. Filter changes announce a count.
    const events = h('div', { id: 'fleet-events', text: 'Loading maintenance history…' }), eventFilters = h('div', { class: 'field-grid', id: 'fleet-event-filters' });
    const from = h('input', { type: 'date', name: 'from' }), to = h('input', { type: 'date', name: 'to' }), eventType = h('select', { name: 'eventType' }, option('', 'All events'), ...EVENT_TYPES.map(v => option(v, v.replaceAll('_', ' '))));
    eventFilters.append(label('From (UTC date)', from), label('To (UTC date)', to), label('Event type', eventType));
    host.replaceChildren(...[h('h2', { tabindex: '-1', text: row.nickname }),
      h('p', {}, healthChip(row), ` ${row.hoursTotal.toFixed(1)} tracked hours (estimate)`),
      results.length ? h('p', { class: 'muted', text: `Needs a look: ${results.map(r => `${r.name ?? r.testId} (${r.status})`).join(', ')}` }) : null,
      h('div', { class: 'action-bar' }, button('Run tests', () => navigateTo('devices', { assetId: row.assetId }), { id: 'fleet-run-tests' }), label('Move to position', placement), move),
      h('h3', { text: 'Reminders' }), row.reminders.length ? reminders : h('p', { class: 'muted', text: 'No reminders for this asset.' }), reminderForm,
      maintenanceForm({ assets: state.view.rows, fixedAsset: row, api, act }),
      h('h3', { text: 'Maintenance history (latest 1,000 matching events)' }), eventFilters, events].filter(Boolean));
    let request = 0;
    const loadEvents = async ({ speak = false } = {}) => {
      const mine = ++request;
      try {
        const rows = await api.events(row.assetId, { from: from.value || null, to: to.value || null, eventType: eventType.value || null });
        if (mine !== request || state.selected !== row.assetId || !events.isConnected) return;
        events.replaceChildren(rows.length ? h('ul', {}, ...rows.map(e => h('li', { text: `${e.eventAt.slice(0, 10)} · ${e.eventType.replaceAll('_', ' ')} · ${e.description || ''}` }))) : h('p', { text: 'No maintenance matches these filters.' }));
        if (speak) announce(rows.length ? `${rows.length} maintenance event${rows.length === 1 ? '' : 's'}.` : 'No maintenance matches these filters.');
      } catch (error) { if (mine === request && events.isConnected) { events.textContent = friendly(error); if (speak) announce(friendly(error), { assertive: true }); } }
    };
    for (const filter of [from, to, eventType]) filter.addEventListener('change', () => loadEvents({ speak: true }));
    loadEvents();
  }

  // ----- reminders manager -----
  function remindersManager(selected) {
    const all = state.view.rows.flatMap(r => r.reminders.map(reminder => ({ reminder, row: r })));
    const rank = { overdue: 0, dueSoon: 1, unknown: 2, ok: 3, disabled: 4 };
    all.sort((a, b) => (rank[a.reminder.state] ?? 5) - (rank[b.reminder.state] ?? 5) || a.row.nickname.localeCompare(b.row.nickname));
    const list = all.length
      ? h('table', { class: 'fleet-grid', id: 'fleet-reminder-table', 'aria-label': 'All reminders' }, h('thead', {}, h('tr', {}, ...['Asset', 'Reminder', 'State', ''].map(t => h('th', { scope: 'col', text: t })))),
        h('tbody', {}, ...all.slice(0, REMINDER_TABLE_CAP).map(({ reminder, row }) => {
          const snooze = button('Snooze 1 day', () => act(() => api.snooze(reminder.id, new Date(Date.now() + 86400000).toISOString()), { done: `${reminder.title} on ${row.nickname} snoozed for 1 day.`, control: snooze }),
            { 'aria-label': `Snooze ${reminder.title} on ${row.nickname} for 1 day`, 'data-snooze': reminder.id });
          return h('tr', {}, h('td', { text: row.nickname }), h('td', { text: reminder.title }), h('td', {}, reminderChip(reminder), reminder.snoozed ? ' (snoozed)' : ''), h('td', {}, snooze));
        })))
      : h('p', { class: 'muted', text: 'No reminders yet. Add one from an asset’s panel on Overview, or create a product template below.' });
    // The table stops at the cap (most urgent first); say so, and where the rest can be handled.
    const capNote = all.length > REMINDER_TABLE_CAP
      ? h('p', { class: 'muted', id: 'fleet-reminder-cap', text: `Showing the first ${REMINDER_TABLE_CAP} of ${all.length} reminders, most urgent first. Snooze or complete the others from each asset’s panel on Overview.` })
      : null;
    return h('div', { class: 'fleet-stack' }, h('section', { class: 'card' }, ...[h('h2', { text: 'Reminders' }),
      selected ? h('p', { class: 'muted', text: `Selected asset for templates: ${selected.nickname}` }) : h('p', { class: 'muted', text: 'Select an asset on Overview to apply a template to it.' }), capNote, list].filter(Boolean)),
    fleetTemplatePanel({ view: state.view, selectedAsset: selected, api, act }));
  }

  function settingsEditor() {
    const form = h('form', { class: 'card fleet-form', id: 'fleet-settings' }), stale = h('input', { type: 'number', min: 1, max: 3650, required: true, value: settings.fleet?.staleDays ?? 90 }), banner = h('input', { type: 'checkbox', checked: settings.fleet?.startupBanner !== false });
    form.append(h('h2', { text: 'Fleet settings' }), label('Review results after this many calendar days', stale), label('Show startup maintenance summary', banner), h('button', { type: 'submit', class: 'btn btn-primary', text: 'Save fleet settings' }));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const days = Math.round(Number(stale.value));
      if (!(days >= 1 && days <= 3650)) { announce('Stale days must be between 1 and 3650.', { assertive: true }); return; }
      act(async () => { setSetting('fleet', { ...settings.fleet, staleDays: days, startupBanner: banner.checked }); },
        { done: 'Fleet settings saved.', control: form.querySelector('[type="submit"]') });
    });
    return form;
  }

  section.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || document.querySelector('dialog[open]')) return;
    const key = event.key.toLowerCase();
    if (event.key === '/') { event.preventDefault(); if (state.tab !== 'overview') selectTab('overview'); section.querySelector('#fleet-search')?.focus(); }
    else if (key === 'e' && state.tab === 'overview') { event.preventDefault(); exportCsv(); }
    else if (key === 'n') {
      event.preventDefault();
      if (state.tab === 'overview' && state.selected) section.querySelector('#fleet-event-form select')?.focus();
      else { selectTab('events'); section.querySelector('#fleet-log-form select')?.focus(); }
    }
  });
  return {
    onShow: () => { const handoff = takeHandoff('fleet'); if (handoff?.assetId) { state.selected = handoff.assetId; state.tab = 'overview'; } return load(); },
    onExport: () => exportCsv(),
  };
}

export function fleetScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-fleet')) main.append(h('section', { class: 'screen', id: 'screen-fleet', hidden: true }));
  return [{ id: 'fleet', title: 'Fleet', short: 'Fleet', icon: 'equipment', feature: 'fleet', create: createFleetScreen }];
}
