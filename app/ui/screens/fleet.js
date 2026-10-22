// FS-23 fleet UI. Persistence stays in fleet-api; health/reminders/CSV are pure.
import { h } from '../dom.js';
import { store, settings, setSetting } from '../state.js';
import { navigateTo, takeHandoff } from '../crosslinks.js';
import { go } from '../shell.js';
import { toast } from '../live.js';
import { createFleetApi } from '../../fleet-api.js';
import { filterFleet, fleetToCsv, summarizeFleet } from '../../fleet.js';
import { saveTextFile } from '../../userfiles.js';
import { isEnabled, onFeatureChange } from '../../features.js';
import { registerBoothSheet } from '../booth-sheet.js';
import { exportPdfWithFeedback } from '../persistence.js';

const HEALTH = { never: 'Never tested', healthy: 'Healthy', review: 'Review', attention: 'Attention' };
const label = (text, input) => h('label', { class: 'field' }, h('span', { class: 'field-label', text }), input);
const button = (text, onclick, attrs = {}) => h('button', { type: 'button', class: 'btn btn-secondary', text, onclick, ...attrs });
const option = (value, text) => h('option', { value, text });
const friendly = error => typeof error === 'string' ? error : error?.message || 'Fleet operation failed.';
const dueText = reminder => `${reminder.title}: ${reminder.state === 'dueSoon' ? 'Due soon' : reminder.state}${reminder.dueAt ? ` ${reminder.dueAt}` : Number.isFinite(reminder.dueInHours) ? ` (${reminder.dueInHours.toFixed(1)} tracked h remaining)` : reminder.basis === 'hours' && reminder.state === 'unknown' ? ' (review usage history at the maintenance boundary)' : ''}${reminder.snoozed ? ' (snoozed)' : ''}`;

export function createFleetScreen(section, { api = createFleetApi() } = {}) {
  const state = { view: null, selected: null, filters: {}, sort: 'nickname', descending: false };
  section.innerHTML = '<header class="screen-head"><div class="screen-title"><div><h1 tabindex="-1">Fleet</h1><p class="lede">Recorded checks and maintenance across your venues. Tracked hours are estimates, not true runtime.</p></div></div></header><div id="fleet-status" role="status" aria-live="polite"></div><div id="fleet-content"></div>';
  const status = section.querySelector('#fleet-status'), content = section.querySelector('#fleet-content');
  const act = async action => { try { await action(); await load(); window.dispatchEvent(new Event('deckchek:fleet-changed')); } catch (error) { status.textContent = friendly(error); } };
  const filtered = () => filterFleet(state.view?.rows ?? [], state.filters).sort((a, b) => String(a[state.sort] ?? '').localeCompare(String(b[state.sort] ?? '')) * (state.descending ? -1 : 1));
  async function load() {
    if (!api.native) { content.replaceChildren(h('div', { class: 'empty', text: 'Fleet persistence requires the desktop app. Equipment and recorded-file diagnostics remain available in this browser.' })); return; }
    status.textContent = 'Loading fleet…';
    try { state.view = await api.overview({ staleDays: settings.fleet?.staleDays ?? 90 }); status.textContent = ''; render(); }
    catch (error) { status.replaceChildren(h('p', { text: friendly(error) }), button('Retry', load)); }
  }
  async function exportCsv() { try { await saveTextFile({ suggestedName: 'DeckChek-fleet.csv', ext: 'csv', content: fleetToCsv(filtered()) }); } catch (error) { status.textContent = friendly(error); } }
  function filterSelect(name, title, values) {
    const select = h('select', { 'data-fleet-filter': name }, option('', `All ${title.toLowerCase()}`), ...values.map(([id, text]) => option(id, text)));
    select.value = state.filters[name] ?? '';
    select.addEventListener('change', () => { state.filters[name] = select.value; render(); });
    return label(title, select);
  }
  function render() {
    const view = state.view, rows = filtered(), tiles = summarizeFleet(rows);
    const search = h('input', { type: 'search', id: 'fleet-search', value: state.filters.search || '', placeholder: 'Asset, model or location' });
    search.addEventListener('input', () => { state.filters.search = search.value; renderRows(); });
    const filters = h('div', { class: 'field-grid' }, label('Search fleet', search),
      filterSelect('venueId', 'Venues', view.venues.map(v => [v.id, v.name])),
      filterSelect('boothId', 'Booths', view.booths.map(b => [b.id, b.name])),
      filterSelect('category', 'Categories', [...new Set(view.rows.map(r => r.category).filter(Boolean))].sort().map(v => [v, v])),
      filterSelect('status', 'Statuses', Object.entries(HEALTH)));
    const summary = h('p', { id: 'fleet-summary', role: 'status', text: `Attention ${tiles.attention} · Overdue ${tiles.overdue} · Due soon ${tiles.dueSoon} · Never tested ${tiles.never}` });
    const gridHost = h('div', { id: 'fleet-grid-host' });
    content.replaceChildren(h('section', { class: 'card' }, summary, filters,
      h('div', { class: 'action-bar' }, button('Export CSV', exportCsv, { id: 'fleet-export' }), button('Refresh', load)), gridHost),
      h('section', { class: 'card', id: 'fleet-detail' }), locationEditor(), settingsEditor());
    renderRows(); renderDetail();
  }
  function renderRows() {
    const rows = filtered(), grid = h('table', { role: 'grid', 'aria-label': 'Fleet assets', id: 'fleet-grid' });
    const columns = [['nickname', 'Asset'], ['venue', 'Location'], ['lastTestedAt', 'Last tested'], ['health', 'Health'], ['failing', 'Failing items'], ['reminders', 'Next due']];
    const header = h('tr');
    for (const [key, title] of columns) {
      const sortable = !['failing', 'reminders'].includes(key);
      header.append(h('th', { scope: 'col', 'aria-sort': state.sort === key ? state.descending ? 'descending' : 'ascending' : 'none' }, sortable ? button(title, () => { state.descending = state.sort === key && !state.descending; state.sort = key; renderRows(); }) : title));
    }
    grid.append(h('thead', {}, header));
    const body = h('tbody');
    for (const [index, row] of rows.entries()) {
      const tr = h('tr', { tabindex: index === 0 ? '0' : '-1', 'data-fleet-asset': row.assetId, 'aria-selected': state.selected === row.assetId ? 'true' : 'false' },
        h('td', {}, button(`${row.nickname}${row.productName ? ` · ${row.productName}` : ''}`, () => { state.selected = row.assetId; renderDetail(); })),
        h('td', { text: [row.venue, row.booth, row.position].filter(Boolean).join(' / ') || 'Unplaced' }), h('td', { text: row.lastTestedAt?.slice(0, 10) || 'Never tested' }),
        h('td', { text: HEALTH[row.health] }), h('td', { text: row.failing.slice(0, 3).map(f => f.name).join(', ') + (row.failing.length > 3 ? ` +${row.failing.length - 3}` : '') || 'None recorded' }),
        h('td', { text: row.reminders.map(dueText).join('; ') || 'No reminders' }));
      tr.addEventListener('keydown', event => {
        const next = event.key === 'ArrowDown' ? tr.nextElementSibling : event.key === 'ArrowUp' ? tr.previousElementSibling : null;
        if (next) { event.preventDefault(); tr.tabIndex = -1; next.tabIndex = 0; next.focus(); }
        if (event.key === 'Enter' && event.target === tr) { state.selected = row.assetId; renderDetail(); }
      }); body.append(tr);
    }
    grid.append(body);
    content.querySelector('#fleet-grid-host').replaceChildren(rows.length ? grid : h('p', { class: 'empty', text: 'No assets match. Add assets in Equipment, then place them in a venue below.' }));
    const tiles = summarizeFleet(rows);
    content.querySelector('#fleet-summary').textContent = `Attention ${tiles.attention} · Overdue ${tiles.overdue} · Due soon ${tiles.dueSoon} · Never tested ${tiles.never}`;
  }
  function renderDetail() {
    const host = content.querySelector('#fleet-detail'), row = state.view.rows.find(r => r.assetId === state.selected);
    if (!row) { host.replaceChildren(h('p', { text: 'Choose an asset to place it, review reminders or log maintenance.' })); return; }
    const placement = h('select', { id: 'fleet-placement' }, option('', 'Unplaced'), ...state.view.positions.map(p => option(p.id, `${state.view.booths.find(b => b.id === p.boothId)?.name || ''} / ${p.name}`)));
    placement.value = row.deckPositionId ?? '';
    const reminderForm = h('form', { id: 'fleet-reminder-form' });
    const title = h('input', { name: 'title', required: true, maxlength: 200 }), basis = h('select', { name: 'basis' }, option('days', 'Calendar days'), option('hours', 'Tracked hours')),
      interval = h('input', { name: 'interval', type: 'number', min: 1, max: 1000000, value: 90, required: true }), warning = h('input', { name: 'warning', type: 'number', min: 0, max: 1000000, value: 14, required: true });
    reminderForm.append(h('h3', { text: 'Add reminder' }), h('div', { class: 'field-grid' }, label('Title', title), label('Basis', basis), label('Every', interval), label('Warn before', warning)), h('button', { type: 'submit', class: 'btn btn-primary', text: 'Save reminder' }));
    reminderForm.addEventListener('submit', event => { event.preventDefault(); act(() => api.saveReminder({ assetId: row.assetId, title: title.value, basis: basis.value, intervalValue: Number(interval.value), warnBefore: Number(warning.value) })); });
    const eventForm = h('form', { id: 'fleet-event-form' }), kind = h('select', {}, ...['clean', 'lubricate', 'calibrate', 'repair', 'replace_part', 'inspect', 'other'].map(v => option(v, v.replaceAll('_', ' ')))),
      description = h('textarea', { maxlength: 2000 }), completes = h('select', {}, option('', 'No reminder completed'), ...row.reminders.map(r => option(r.id, r.title)));
    eventForm.append(h('h3', { text: 'Log maintenance' }), h('div', { class: 'field-grid' }, label('Event type', kind), label('Description', description), label('Completes reminder', completes)), h('button', { type: 'submit', class: 'btn btn-primary', text: 'Log event' }));
    eventForm.addEventListener('submit', event => { event.preventDefault(); act(() => api.log({ assetId: row.assetId, eventType: kind.value, eventAt: new Date().toISOString(), description: description.value, reminderId: completes.value || null })); });
    const reminders = h('ul', {}, ...row.reminders.map(reminder => h('li', {}, h('span', { text: dueText(reminder) }), button('Snooze 1 day', () => act(() => api.snooze(reminder.id, new Date(Date.now() + 86400000).toISOString()))))));
    const events = h('div', { id: 'fleet-events', 'aria-live': 'polite', text: 'Loading maintenance history…' });
    host.replaceChildren(h('h2', { tabindex: '-1', text: row.nickname }), h('p', { text: `${HEALTH[row.health]} · ${row.hoursTotal.toFixed(1)} tracked hours (estimate)` }),
      h('div', { class: 'action-bar' }, button('Run tests', () => navigateTo('devices', { assetId: row.assetId })), label('Move to position', placement), button('Move asset', () => act(() => api.place(row.assetId, placement.value || null)))),
      h('h3', { text: 'Reminders' }), reminders, reminderForm, eventForm, h('h3', { text: 'Recent maintenance (latest 1,000)' }), events);
    api.events(row.assetId).then(rows => { if (state.selected !== row.assetId) return; events.replaceChildren(rows.length ? h('ul', {}, ...rows.map(e => h('li', { text: `${e.eventAt.slice(0, 10)} · ${e.eventType.replaceAll('_', ' ')} · ${e.description || ''}` }))) : h('p', { text: 'No maintenance recorded.' })); }).catch(error => { events.textContent = friendly(error); });
  }
  function locationEditor() {
    const form = h('form', { id: 'fleet-location-form' }), kind = h('select', { name: 'kind' }, option('booth', 'Booth'), option('position', 'Position'), option('venue', 'Venue')),
      existing = h('select', { name: 'existing' }), parent = h('select', { name: 'parent' }), name = h('input', { name: 'name', required: true, maxlength: 200 }),
      confirmation = h('input', { name: 'confirmation', autocomplete: 'off' }), remove = button('Delete empty location', () => act(() => api.deleteLocation(kind.value, existing.value)), { disabled: true });
    const records = () => kind.value === 'venue' ? state.view.venues : kind.value === 'booth' ? state.view.booths : state.view.positions;
    const choose = () => {
      const row = records().find(row => row.id === existing.value);
      name.value = row?.name || ''; confirmation.value = ''; remove.disabled = true;
      if (row && kind.value !== 'venue') parent.value = row.venueId ?? row.boothId;
    };
    const update = () => {
      existing.replaceChildren(option('', 'New location'), ...records().map(row => option(row.id, row.name)));
      parent.replaceChildren(...(kind.value === 'booth' ? state.view.venues : state.view.booths).map(row => option(row.id, row.name)));
      parent.disabled = kind.value === 'venue'; choose();
    };
    kind.addEventListener('change', update); existing.addEventListener('change', choose);
    confirmation.addEventListener('input', () => { remove.disabled = !existing.value || confirmation.value !== records().find(row => row.id === existing.value)?.name; });
    update();
    form.append(h('h2', { text: 'Venues and positions' }), h('p', { text: 'Add a venue, a booth and a position, then place an asset above. Existing locations can be renamed or moved. Deletion keeps assets and diagnostic history safe: move or unplace assets and clear setup references first.' }),
      h('div', { class: 'field-grid' }, label('Location type', kind), label('Edit', existing), label('Parent', parent), label('Name', name)), h('button', { type: 'submit', class: 'btn btn-primary', text: 'Save location' }),
      label('Type the existing name to enable deletion', confirmation), remove);
    form.addEventListener('submit', event => { event.preventDefault(); act(() => kind.value === 'venue'
      ? store.upsert('venue', { id: existing.value || undefined, name: name.value })
      : (kind.value === 'booth' ? api.saveBooth : api.savePosition)({ id: existing.value || null, parentId: parent.value, name: name.value })); });
    const sheets = state.view.booths.map(booth => button(`Print ${booth.name} sheet`, async () => { registerBoothSheet(); await exportPdfWithFeedback('boothSheet', { booth, rows: state.view.rows.filter(r => r.boothId === booth.id) }); }));
    return h('section', { class: 'card' }, form, h('div', { class: 'action-bar' }, ...sheets), button('Manage venues in Equipment', () => go('equipment')));
  }
  function settingsEditor() {
    const form = h('form', { class: 'card', id: 'fleet-settings' }), stale = h('input', { type: 'number', min: 1, max: 3650, required: true, value: settings.fleet?.staleDays ?? 90 }), banner = h('input', { type: 'checkbox', checked: settings.fleet?.startupBanner !== false });
    form.append(h('h2', { text: 'Fleet settings' }), label('Review results after this many calendar days', stale), label('Show startup maintenance summary', banner), h('button', { type: 'submit', class: 'btn btn-primary', text: 'Save fleet settings' }));
    form.addEventListener('submit', event => { event.preventDefault(); setSetting('fleet', { ...settings.fleet, staleDays: Number(stale.value), startupBanner: banner.checked }); load(); window.dispatchEvent(new Event('deckchek:fleet-changed')); });
    return form;
  }
  section.addEventListener('keydown', event => {
    if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === '/') { event.preventDefault(); section.querySelector('#fleet-search')?.focus(); }
    if (event.key.toLowerCase() === 'e') exportCsv();
    if (event.key.toLowerCase() === 'n') section.querySelector('#fleet-event-form select')?.focus();
  });
  return { onShow: () => { const handoff = takeHandoff('fleet'); if (handoff?.assetId) state.selected = handoff.assetId; return load(); } };
}

export function fleetScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-fleet')) main.append(h('section', { class: 'screen', id: 'screen-fleet', hidden: true }));
  return [{ id: 'fleet', title: 'Fleet', short: 'Fleet', icon: 'equipment', feature: 'fleet', create: createFleetScreen }];
}

/** Non-blocking startup reminder summary; dismissing snoozes, never deletes. */
export async function initFleetReminders({ api = createFleetApi() } = {}) {
  async function refresh() {
    document.getElementById('fleet-reminder-banner')?.remove();
    document.querySelector('.rail-item[data-screen="fleet"] [data-fleet-badge]')?.remove();
    if (!api.native || !isEnabled('fleet') || settings.fleet?.startupBanner === false) return;
    try {
      const view = await api.overview({ staleDays: settings.fleet?.staleDays ?? 90 }), due = view.rows.flatMap(row => row.reminders).filter(r => !r.snoozed && ['overdue', 'dueSoon'].includes(r.state));
      if (!due.length) return;
      const banner = h('section', { id: 'fleet-reminder-banner', role: 'status', class: 'card' }, h('p', { text: `${due.length} maintenance items need attention: ${view.tiles.overdue} overdue, ${view.tiles.dueSoon} due soon.` }),
        h('ul', {}, ...due.slice(0, 5).map(r => h('li', { text: dueText(r) }))), due.length > 5 ? h('p', { text: `and ${due.length - 5} more` }) : null,
        button('Review fleet', () => go('fleet')), button('Dismiss for 1 day', async () => { try { const until = new Date(Date.now() + 86400000).toISOString(); await Promise.all(due.map(r => api.snooze(r.id, until))); await refresh(); } catch (error) { toast(friendly(error), { type: 'error' }); } }));
      document.getElementById('main')?.prepend(banner);
      document.querySelector('.rail-item[data-screen="fleet"]')?.append(h('span', { class: 'badge', 'data-fleet-badge': true, text: String(due.length) }));
    } catch (error) { toast(`Maintenance reminders unavailable: ${friendly(error)}`, { type: 'warn' }); }
  }
  onFeatureChange(({ name }) => { if (name === 'fleet') refresh(); });
  window.addEventListener('deckchek:fleet-changed', refresh);
  await refresh();
}
