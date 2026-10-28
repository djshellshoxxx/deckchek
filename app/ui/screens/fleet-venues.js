// FS-23 venues, booths and positions editor (spec §3 view 2). A tree of venue > booth > position with the assets
// placed in each position. Assets move by drag and drop or by the "Move to" menu (keyboard path); locations are
// added and renamed with one form; deleting asks for the typed name, shows the counts and never deletes assets
// (they are moved or unplaced). Persistence goes through the fleet bridge; `act` reloads the view afterwards.

import { h } from '../dom.js';
import { store } from '../state.js';
import { registerBoothSheet } from '../booth-sheet.js';
import { exportPdfWithFeedback } from '../persistence.js';

const label = (text, input) => h('label', { class: 'field' }, h('span', { class: 'field-label', text }), input);
const option = (value, text) => h('option', { value, text });
const button = (text, onclick, attrs = {}) => h('button', { type: 'button', class: 'btn btn-secondary', text, onclick, ...attrs });

/** Options for a "Move to" select: Unplaced first, then every position as "Venue / Booth / Position". */
export function positionOptions(view) {
  const booth = id => view.booths.find(b => b.id === id);
  const venue = id => view.venues.find(v => v.id === id);
  return view.positions.map(p => {
    const b = booth(p.boothId);
    return [p.id, [venue(b?.venueId)?.name, b?.name, p.name].filter(Boolean).join(' / ')];
  }).sort((a, b) => a[1].localeCompare(b[1]));
}

function emptyGuide() {
  return h('div', { class: 'empty fleet-empty', id: 'fleet-empty' },
    h('h2', { text: 'Add your first venue' }),
    h('p', { text: 'A venue holds booths, a booth holds positions, and each position holds the decks and mixers you place there.' }),
    h('ol', { class: 'fleet-steps' }, h('li', { text: 'Add a venue (for example “Home” or “Club Nova”).' }), h('li', { text: 'Add a booth in that venue.' }), h('li', { text: 'Add a position (for example “Left deck”), then place an asset in it.' })));
}

function tree({ view, api, act }) {
  const root = h('div', { class: 'fleet-tree', id: 'fleet-tree' });
  const moveOptions = positionOptions(view);
  const assetsAt = id => view.rows.filter(r => r.deckPositionId === id);
  const place = (assetId, positionId) => act(() => api.place(assetId, positionId || null));
  const assetItem = row => {
    const select = h('select', { 'aria-label': `Move ${row.nickname} to`, 'data-move-asset': row.assetId }, option('', 'Move to…'), option('unplaced', 'Unplaced'), ...moveOptions.map(([id, text]) => option(id, text)));
    select.addEventListener('change', () => { if (select.value) place(row.assetId, select.value === 'unplaced' ? null : select.value); });
    const item = h('li', { class: 'fleet-asset', draggable: 'true', 'data-drag-asset': row.assetId }, h('span', { text: row.nickname }), select);
    item.addEventListener('dragstart', e => { e.dataTransfer?.setData('text/plain', row.assetId); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; });
    return item;
  };
  for (const venue of view.venues) {
    const booths = view.booths.filter(b => b.venueId === venue.id);
    const node = h('section', { class: 'fleet-venue' }, h('h3', { text: venue.name }));
    if (!booths.length) node.append(h('p', { class: 'muted', text: 'No booths yet.' }));
    for (const booth of booths) {
      const positions = view.positions.filter(p => p.boothId === booth.id);
      const boothRows = view.rows.filter(r => r.boothId === booth.id);
      const print = button(`Print ${booth.name} sheet`, async () => {
        registerBoothSheet();
        await exportPdfWithFeedback('boothSheet', { booth, rows: boothRows, positions });
      }, { 'data-print-booth': booth.id });
      const boothNode = h('div', { class: 'fleet-booth' }, h('div', { class: 'fleet-booth-head' }, h('h4', { text: booth.name }), print));
      if (!positions.length) boothNode.append(h('p', { class: 'muted', text: 'No positions yet.' }));
      for (const position of positions) {
        const assets = assetsAt(position.id);
        const zone = h('div', { class: 'fleet-position', 'data-drop-position': position.id }, h('strong', { text: position.name }),
          assets.length ? h('ul', {}, ...assets.map(assetItem)) : h('p', { class: 'muted', text: 'Empty. Drop an asset here or use an asset’s Move to menu.' }));
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('fleet-drop'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('fleet-drop'));
        zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('fleet-drop'); const id = e.dataTransfer?.getData('text/plain'); if (id && view.rows.some(r => r.assetId === id)) place(id, position.id); });
        boothNode.append(zone);
      }
      node.append(boothNode);
    }
    root.append(node);
  }
  const unplaced = view.rows.filter(r => !r.deckPositionId);
  if (unplaced.length) {
    root.append(h('section', { class: 'fleet-venue', id: 'fleet-unplaced' }, h('h3', { text: `Unplaced (${unplaced.length})` }),
      h('ul', {}, ...unplaced.slice(0, 200).map(assetItem)), unplaced.length > 200 ? h('p', { class: 'muted', text: `and ${unplaced.length - 200} more` }) : null));
  }
  return root;
}

function locationForm({ view, api, act }) {
  const form = h('form', { id: 'fleet-location-form', class: 'fleet-form' });
  const kind = h('select', { name: 'kind' }, option('booth', 'Booth'), option('position', 'Position'), option('venue', 'Venue'));
  const existing = h('select', { name: 'existing' }), parent = h('select', { name: 'parent' });
  const name = h('input', { name: 'name', required: true, maxlength: 200 });
  const confirmation = h('input', { name: 'confirmation', autocomplete: 'off' }), destination = h('select', { name: 'deleteDestination' });
  const impact = h('p', { id: 'fleet-delete-impact', 'aria-live': 'polite' });
  const remove = button('Delete empty location', () => act(() => api.deleteLocation(kind.value, existing.value,
    destination.value ? { deckPositionId: destination.value === 'unplaced' ? null : destination.value.slice(9) } : null)), { disabled: true });
  const records = () => kind.value === 'venue' ? view.venues : kind.value === 'booth' ? view.booths : view.positions;
  const choose = () => {
    const row = records().find(r => r.id === existing.value);
    name.value = row?.name || ''; confirmation.value = ''; remove.disabled = true;
    const booths = view.booths.filter(b => kind.value === 'venue' ? b.venueId === existing.value : kind.value === 'booth' && b.id === existing.value);
    const positions = view.positions.filter(p => kind.value === 'position' ? p.id === existing.value : booths.some(b => b.id === p.boothId));
    const affected = view.rows.filter(a => positions.some(p => p.id === a.deckPositionId));
    impact.textContent = row ? `Deletion affects ${affected.length} assets, ${booths.length} booths and ${positions.length} positions. Saved setup or diagnostic references block deletion; failed deletion rolls back all moves.` : 'Choose an existing location to delete.';
    destination.replaceChildren(option('', 'Keep occupied locations blocked'), option('unplaced', 'Move assets to Unplaced'),
      ...positionOptions(view).filter(([id]) => !positions.some(p => p.id === id)).map(([id, text]) => option(`position:${id}`, `Move assets to ${text}`)));
    destination.disabled = !row; remove.textContent = 'Delete empty location';
    if (row && kind.value !== 'venue') parent.value = row.venueId ?? row.boothId;
  };
  const update = () => {
    existing.replaceChildren(option('', 'New location'), ...records().map(r => option(r.id, r.name)));
    parent.replaceChildren(...(kind.value === 'booth' ? view.venues : view.booths).map(r => option(r.id, r.name)));
    parent.disabled = kind.value === 'venue'; choose();
  };
  kind.value = view.venues.length ? 'booth' : 'venue';
  kind.addEventListener('change', update); existing.addEventListener('change', choose);
  destination.addEventListener('change', () => { remove.textContent = destination.value ? 'Move assets and delete location' : 'Delete empty location'; });
  confirmation.addEventListener('input', () => { remove.disabled = !existing.value || confirmation.value !== records().find(r => r.id === existing.value)?.name; });
  update();
  form.append(h('h3', { text: 'Add, rename or delete a location' }),
    h('p', { class: 'muted', text: 'Choose a destination to move or unplace affected assets atomically with the deletion. Assets are never deleted.' }),
    h('div', { class: 'field-grid' }, label('Location type', kind), label('Edit', existing), label('Parent', parent), label('Name', name)),
    h('button', { type: 'submit', class: 'btn btn-primary', text: 'Save location' }),
    impact, label('Assets when deleting', destination), label('Type the existing name to enable deletion', confirmation), remove);
  form.addEventListener('submit', event => {
    event.preventDefault();
    act(() => kind.value === 'venue'
      ? store.upsert('venue', { id: existing.value || undefined, name: name.value })
      : (kind.value === 'booth' ? api.saveBooth : api.savePosition)({ id: existing.value || null, parentId: parent.value, name: name.value }));
  });
  return form;
}

export function venuesPanel({ view, api, act }) {
  const panel = h('section', { class: 'card', id: 'fleet-venues' }, h('h2', { text: 'Venues, booths and positions' }));
  if (!view.venues.length) panel.append(emptyGuide());
  else panel.append(tree({ view, api, act }));
  panel.append(locationForm({ view, api, act }));
  return panel;
}
