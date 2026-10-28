// FS-23 maintenance events: the add-event form (also used in the asset side panel) and the filterable
// fleet-wide timeline (spec §3 view 4). All text is set with textContent; events come from the database.
import { h } from './dom.js';

export const EVENT_TYPES = ['clean', 'lubricate', 'calibrate', 'repair', 'replace_part', 'inspect', 'other'];
const typeLabel = v => v.replaceAll('_', ' ');
const label = (text, input) => h('label', { class: 'field' }, h('span', { class: 'field-label', text }), input);
const option = (value, text) => h('option', { value, text });

/**
 * "Log maintenance" form. `assets` = fleet rows (nickname, assetId, reminders). With `fixedAsset` the asset is
 * the one in the side panel, otherwise a select lets the user pick it. Choosing a reminder marks it completed.
 */
export function maintenanceForm({ assets, fixedAsset = null, api, act, id = 'fleet-event-form' }) {
  const form = h('form', { id, class: 'fleet-form' });
  const asset = fixedAsset ? null : h('select', { name: 'asset', required: true }, ...assets.map(a => option(a.assetId, a.nickname)));
  const kind = h('select', { name: 'eventType' }, ...EVENT_TYPES.map(v => option(v, typeLabel(v))));
  const when = h('input', { type: 'date', name: 'date', 'aria-label': 'Date (UTC); leave empty for now' });
  const description = h('textarea', { name: 'description', maxlength: 2000 });
  const completes = h('select', { name: 'completes' });
  const current = () => fixedAsset ?? assets.find(a => a.assetId === asset?.value);
  const fillReminders = () => completes.replaceChildren(option('', 'No reminder completed'), ...(current()?.reminders ?? []).map(r => option(r.id, r.title)));
  asset?.addEventListener('change', fillReminders);
  fillReminders();
  form.append(h('h3', { text: 'Log maintenance' }),
    h('div', { class: 'field-grid' }, ...[asset && label('Asset', asset), label('Event type', kind), label('Date (UTC, optional)', when), label('Description', description), label('Completes reminder', completes)].filter(Boolean)),
    h('button', { type: 'submit', class: 'btn btn-primary', text: 'Log event' }));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const target = current();
    if (!target) return;
    const eventAt = when.value ? `${when.value}T12:00:00.000Z` : new Date().toISOString();
    act(() => api.log({ assetId: target.assetId, eventType: kind.value, eventAt, description: description.value.trim() || null, reminderId: completes.value || null }));
  });
  return form;
}

/** Fleet-wide timeline with asset / type / UTC-date filters. Newest first, at most 1,000 events. */
export function eventsPanel({ view, api, act }) {
  const panel = h('section', { class: 'card', id: 'fleet-events-panel' }, h('h2', { text: 'Maintenance events' }));
  const asset = h('select', { name: 'asset' }, option('', 'All assets'), ...view.rows.map(a => option(a.assetId, a.nickname)));
  const kind = h('select', { name: 'eventType' }, option('', 'All events'), ...EVENT_TYPES.map(v => option(v, typeLabel(v))));
  const from = h('input', { type: 'date', name: 'from' }), to = h('input', { type: 'date', name: 'to' });
  const list = h('div', { id: 'fleet-event-log', 'aria-live': 'polite', text: 'Loading maintenance events…' });
  let request = 0;
  const load = async () => {
    const mine = ++request;
    try {
      const rows = await api.events(asset.value || null, { from: from.value || null, to: to.value || null, eventType: kind.value || null });
      if (mine !== request || !list.isConnected) return;
      list.replaceChildren(rows.length
        ? h('ol', { class: 'fleet-timeline' }, ...rows.map(e => h('li', { text: `${e.eventAt.slice(0, 10)} · ${e.assetName ?? e.assetId} · ${typeLabel(e.eventType)}${e.description ? ` · ${e.description}` : ''}` })))
        : h('p', { text: 'No maintenance matches these filters.' }));
    } catch (error) { if (mine === request && list.isConnected) list.textContent = typeof error === 'string' ? error : error?.message || 'Could not load events.'; }
  };
  for (const filter of [asset, kind, from, to]) filter.addEventListener('change', load);
  panel.append(h('div', { class: 'field-grid', id: 'fleet-event-log-filters' }, label('Asset', asset), label('Event type', kind), label('From (UTC date)', from), label('To (UTC date)', to)),
    list, maintenanceForm({ assets: view.rows, api, act, id: 'fleet-log-form' }));
  queueMicrotask(load);
  return panel;
}
