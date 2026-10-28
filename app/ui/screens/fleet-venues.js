// FS-23 venues, booths and positions editor (spec §3 view 2). A tree of venue > booth > position with the assets
// placed in each position. Assets move by drag and drop or by the "Move to" select plus its Move button
// (keyboard path); locations are added and renamed with one form; deleting asks for the typed name, shows the
// counts and never deletes assets (they are moved or unplaced). Persistence goes through the fleet bridge;
// `act` (fleet.js) runs one change at a time, reloads the view, announces the result and restores focus.

import { h } from '../dom.js';
import { store } from '../state.js';
import { announce, toast } from '../live.js';
import { registerBoothSheet } from '../booth-sheet.js';
import { exportPdfWithFeedback, pdfExportEnabled } from '../persistence.js';

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

/** Assets listed per position (and in Unplaced) before "and N more"; the rest move from the Overview panel. */
export const TREE_LIST_CAP = 200;

/**
 * Rename keeps the venue's other columns: catalog_upsert (and the browser store) replace the whole record, so
 * the current record is read and only `name` changes. A new venue (no id) is created with its name.
 */
export async function saveVenue(catalog, id, name) {
  if (!id) return catalog.upsert('venue', { name });
  const current = (await catalog.list('venue')).find(v => v.id === id);
  if (!current) throw new Error('This venue no longer exists. Refresh the fleet and try again.');
  return catalog.upsert('venue', { ...current, name });
}

async function printBoothSheet(data, control) {
  registerBoothSheet();
  if (pdfExportEnabled()) { await exportPdfWithFeedback('boothSheet', data, { button: control }); return; }
  // FS-03 PDF export is switched off: open the same printable layout in the browser print dialog
  // (spec §3(5) fallback) rather than doing nothing.
  if (control.disabled) return;
  control.disabled = true;
  try {
    const { composePrintable, printViaIframe, loadPrintCss } = await import('../../report-pdf.js');
    const { html } = composePrintable('boothSheet', data, { css: await loadPrintCss() });
    announce('The print dialog is open for the booth sheet.');
    await printViaIframe(html);
  } catch (error) {
    toast(`Could not open the print dialog: ${error?.message || error}`, { type: 'error' });
  } finally { control.disabled = false; }
}

function tree({ view, api, act }) {
  const root = h('div', { class: 'fleet-tree', id: 'fleet-tree' });
  const moveOptions = positionOptions(view);
  const positionName = id => moveOptions.find(([pid]) => pid === id)?.[1] ?? 'Unplaced';
  const assetsAt = id => view.rows.filter(r => r.deckPositionId === id);
  // Never a no-op move: placing an asset where it already is would log a fake "Moved from A to A" event.
  const place = (row, positionId, control) => {
    const target = positionId || null;
    if (target === (row.deckPositionId ?? null)) { announce(`${row.nickname} is already ${target ? `in ${positionName(target)}` : 'unplaced'}.`); return; }
    act(() => api.place(row.assetId, target), { done: `${row.nickname} moved to ${positionName(target)}.`, control });
  };
  // Keyboard path: choose a destination, then press Move (or Enter on the select). Arrow keys on a closed
  // select fire `change` in Chromium/WebView2, so `change` never moves anything. The position list is built
  // when the select is first focused, so a large fleet does not create one full option list per asset.
  const assetItem = row => {
    const select = h('select', { 'aria-label': `Move ${row.nickname} to`, 'data-move-asset': row.assetId }, option('', 'Move to…'));
    const fill = () => {
      if (select.dataset.filled) return;
      select.dataset.filled = 'true';
      select.append(...[row.deckPositionId ? option('unplaced', 'Unplaced') : null, ...moveOptions.filter(([id]) => id !== row.deckPositionId).map(([id, text]) => option(id, text))].filter(Boolean));
    };
    select.addEventListener('focus', fill);
    select.addEventListener('pointerdown', fill);
    const go = button('Move', () => {
      if (!select.value) { announce(`Choose where to move ${row.nickname} first.`); select.focus(); return; }
      place(row, select.value === 'unplaced' ? null : select.value, go);
    }, { 'data-move-go': row.assetId, 'aria-label': `Move ${row.nickname}` });
    select.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
    const item = h('li', { class: 'fleet-asset', draggable: 'true', 'data-drag-asset': row.assetId }, h('span', { text: row.nickname }), h('span', { class: 'fleet-move' }, select, go));
    item.addEventListener('dragstart', e => { e.dataTransfer?.setData('text/plain', row.assetId); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; });
    return item;
  };
  const assetList = rows => [h('ul', {}, ...rows.slice(0, TREE_LIST_CAP).map(assetItem)),
    rows.length > TREE_LIST_CAP ? h('p', { class: 'muted', text: `and ${rows.length - TREE_LIST_CAP} more (move them from each asset’s panel on Overview)` }) : null];
  for (const venue of view.venues) {
    const booths = view.booths.filter(b => b.venueId === venue.id);
    const node = h('section', { class: 'fleet-venue' }, h('h3', { text: venue.name }));
    if (!booths.length) node.append(h('p', { class: 'muted', text: 'No booths yet.' }));
    for (const booth of booths) {
      const positions = view.positions.filter(p => p.boothId === booth.id);
      const boothRows = view.rows.filter(r => r.boothId === booth.id);
      const print = button(`Print ${booth.name} sheet`, () => printBoothSheet({ booth, rows: boothRows, positions }, print), { 'data-print-booth': booth.id });
      const boothNode = h('div', { class: 'fleet-booth' }, h('div', { class: 'fleet-booth-head' }, h('h4', { text: booth.name }), print));
      if (!positions.length) boothNode.append(h('p', { class: 'muted', text: 'No positions yet.' }));
      for (const position of positions) {
        const assets = assetsAt(position.id);
        const zone = h('div', { class: 'fleet-position', 'data-drop-position': position.id }, h('strong', { text: position.name }),
          ...(assets.length ? assetList(assets) : [h('p', { class: 'muted', text: 'Empty. Drop an asset here or use an asset’s Move to menu.' })]));
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('fleet-drop'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('fleet-drop'));
        zone.addEventListener('drop', e => {
          e.preventDefault(); zone.classList.remove('fleet-drop');
          const id = e.dataTransfer?.getData('text/plain'), row = id ? view.rows.find(r => r.assetId === id) : null;
          if (row && row.deckPositionId !== position.id) place(row, position.id); // dropped back where it was: nothing to do
        });
        boothNode.append(zone);
      }
      node.append(boothNode);
    }
    root.append(node);
  }
  const unplaced = view.rows.filter(r => !r.deckPositionId);
  if (unplaced.length) {
    root.append(h('section', { class: 'fleet-venue', id: 'fleet-unplaced' }, h('h3', { text: `Unplaced (${unplaced.length})` }),
      ...assetList(unplaced)));
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
  const remove = button('Delete empty location', () => {
    const doomed = records().find(r => r.id === existing.value)?.name ?? 'Location';
    act(() => api.deleteLocation(kind.value, existing.value, destination.value ? { deckPositionId: destination.value === 'unplaced' ? null : destination.value.slice(9) } : null),
      { done: `${doomed} deleted.`, control: remove, fallback: '#fleet-location-form [name="kind"]' });
  }, { disabled: true, id: 'fleet-location-delete' });
  const records = () => kind.value === 'venue' ? view.venues : kind.value === 'booth' ? view.booths : view.positions;
  const choose = () => {
    const row = records().find(r => r.id === existing.value);
    name.value = row?.name || ''; confirmation.value = ''; remove.disabled = true;
    const booths = view.booths.filter(b => kind.value === 'venue' ? b.venueId === existing.value : kind.value === 'booth' && b.id === existing.value);
    const positions = view.positions.filter(p => kind.value === 'position' ? p.id === existing.value : booths.some(b => b.id === p.boothId));
    const affected = view.rows.filter(a => positions.some(p => p.id === a.deckPositionId));
    // What the schema really does: saved setups and support configurations that point here block the delete;
    // pre-gig and hum/feedback runs only hold an optional venue link (ON DELETE SET NULL), so they are kept unlinked.
    const unlinked = kind.value === 'venue' ? ' Pre-gig and hum/feedback runs recorded at this venue are kept, but lose their venue link.' : '';
    impact.textContent = row ? `Deletion affects ${affected.length} assets, ${booths.length} booths and ${positions.length} positions. Saved setups or support configurations that use it block deletion.${unlinked} A failed deletion rolls back all moves.` : 'Choose an existing location to delete.';
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
    const what = kind.value === 'venue' ? 'Venue' : kind.value === 'booth' ? 'Booth' : 'Position';
    act(() => kind.value === 'venue'
      ? saveVenue(store, existing.value || null, name.value)
      : (kind.value === 'booth' ? api.saveBooth : api.savePosition)({ id: existing.value || null, parentId: parent.value, name: name.value }),
    { done: `Location saved: ${what.toLowerCase()} “${name.value}”.`, control: form.querySelector('[type="submit"]') });
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
