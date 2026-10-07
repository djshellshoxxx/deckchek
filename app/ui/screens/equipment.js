// Equipment: catalog CRUD for manufacturers, products, assets, setups (with
// components) and venues via catalog-store (SQLite in the app, localStorage otherwise).

import { h, esc, formatDate } from '../dom.js';
import { icon } from '../icons.js';
import { store, emit } from '../state.js';
import { toast, announce } from '../live.js';
import { confirmDialog } from '../shell.js';

const CATEGORIES = [['turntable', 'Turntable'], ['cartridge', 'Cartridge'], ['stylus', 'Stylus'], ['mixer', 'Mixer'], ['audio_interface', 'Audio interface'], ['dvs_interface', 'DVS interface'], ['media_player', 'Media player'], ['controller', 'Controller'], ['preamp', 'Phono preamp'], ['dvs_media', 'DVS / timecode media'], ['software', 'Software'], ['other', 'Other']];
const ROLES = [['turntable', 'Turntable'], ['cartridge', 'Cartridge'], ['mixer', 'Mixer'], ['interface', 'Interface'], ['dvs_interface', 'DVS interface'], ['preamp', 'Preamp'], ['media_player', 'Media player'], ['other', 'Other']];

const ENTITIES = {
  asset: { title: 'Assets', one: 'asset', icon: 'equipment', name: r => r.nickname, sub: (r, ctx) => [ctx.productName(r.productId), r.serialNumber && `S/N ${r.serialNumber}`, r.condition].filter(Boolean).join(' · '),
    blurb: 'Physical units you own or test — the thing results are tracked against.',
    fields: [{ key: 'nickname', label: 'Nickname', required: true, placeholder: 'Deck 1 — SL-1200MK7' }, { key: 'productId', label: 'Product', type: 'ref', ref: 'product' }, { key: 'serialNumber', label: 'Serial number' }, { key: 'firmware', label: 'Firmware' }, { key: 'condition', label: 'Condition', type: 'select', options: [['', '—'], ['excellent', 'Excellent'], ['good', 'Good'], ['fair', 'Fair'], ['poor', 'Poor'], ['service', 'Needs service']] }, { key: 'purchaseDate', label: 'Purchased', type: 'date' }, { key: 'installedDate', label: 'Installed', type: 'date' }, { key: 'notes', label: 'Notes', type: 'textarea' }] },
  product: { title: 'Products', one: 'product', icon: 'cartridge', name: r => [r.model, r.variant].filter(Boolean).join(' '), sub: (r, ctx) => [ctx.manufacturerName(r.manufacturerId), labelOf(CATEGORIES, r.category), r.releaseYear].filter(Boolean).join(' · '),
    blurb: 'Make/model definitions shared by many assets.',
    fields: [{ key: 'model', label: 'Model', required: true }, { key: 'manufacturerId', label: 'Manufacturer', type: 'ref', ref: 'manufacturer' }, { key: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES }, { key: 'variant', label: 'Variant' }, { key: 'revision', label: 'Revision' }, { key: 'releaseYear', label: 'Release year', type: 'number' }, { key: 'region', label: 'Region' }, { key: 'description', label: 'Description', type: 'textarea' }, { key: 'sourceUrl', label: 'Source URL', type: 'url' }] },
  manufacturer: { title: 'Manufacturers', one: 'manufacturer', icon: 'plug', name: r => r.name, sub: r => r.website || '',
    blurb: 'Brands and makers.',
    fields: [{ key: 'name', label: 'Name', required: true }, { key: 'website', label: 'Website', type: 'url' }, { key: 'notes', label: 'Notes', type: 'textarea' }] },
  setup: { title: 'Setups', one: 'setup', icon: 'link', name: r => r.name, sub: (r, ctx) => [ctx.venueName(r.venueId), `${(r.components || []).length} component(s)`].filter(Boolean).join(' · '),
    blurb: 'A signal chain: which assets are connected, in which role and position.',
    fields: [{ key: 'name', label: 'Name', required: true, placeholder: 'Club booth — left deck' }, { key: 'profile', label: 'Profile', type: 'select', options: [['', '—'], ['home', 'Home'], ['club', 'Club'], ['mobile', 'Mobile'], ['studio', 'Studio']] }, { key: 'venueId', label: 'Venue', type: 'ref', ref: 'venue' }, { key: 'notes', label: 'Notes', type: 'textarea' }, { key: 'components', label: 'Components', type: 'components' }] },
  venue: { title: 'Venues', one: 'venue', icon: 'vinyl', name: r => r.name, sub: r => [r.venueType, r.city, r.country].filter(Boolean).join(' · '),
    blurb: 'Places where setups live — useful for booth vibration and hum history.',
    fields: [{ key: 'name', label: 'Name', required: true }, { key: 'venueType', label: 'Type', type: 'select', options: [['', '—'], ['club', 'Club'], ['bar', 'Bar'], ['festival', 'Festival'], ['studio', 'Studio'], ['home', 'Home'], ['other', 'Other']] }, { key: 'city', label: 'City' }, { key: 'region', label: 'Region' }, { key: 'country', label: 'Country' }, { key: 'notes', label: 'Notes', type: 'textarea' }] },
};
const ORDER = ['asset', 'product', 'manufacturer', 'setup', 'venue'];
function labelOf(opts, v) { return opts.find(([k]) => k === v)?.[1] || v || ''; }

export function createEquipmentScreen(section) {
  const state = { entity: 'asset', search: '', records: {}, editing: null };
  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('equipment', { size: 24 })}</span><div><h1 tabindex="-1">Equipment</h1>
      <p class="lede">Your decks, cartridges, mixers, interfaces, the setups they form and the venues they live in.</p></div></div></header>
    <div class="tabs" role="tablist" aria-label="Catalog type"></div>
    <div class="eq-layout">
      <section class="card eq-list" role="tabpanel" id="eq-panel">
        <div class="toolbar"><search class="search"><label for="eq-search" class="sr-only">Search</label>${icon('search', { size: 18 })}<input id="eq-search" type="search" autocomplete="off"></search><button type="button" class="btn btn-primary" id="eq-add"></button></div>
        <div id="eq-rows" aria-live="polite"></div>
      </section>
      <section class="card eq-editor" id="eq-editor" aria-label="Editor"></section>
    </div>`;
  const $ = s => section.querySelector(s);
  const tabs = $('.tabs');

  const ctx = {
    productName: id => { const p = (state.records.product || []).find(x => x.id === id); return p ? ENTITIES.product.name(p) : ''; },
    manufacturerName: id => (state.records.manufacturer || []).find(x => x.id === id)?.name || '',
    venueName: id => (state.records.venue || []).find(x => x.id === id)?.name || '',
    assetName: id => (state.records.asset || []).find(x => x.id === id)?.nickname || '',
  };

  async function loadAll() {
    await Promise.all(ORDER.map(async e => { try { state.records[e] = await store.list(e); } catch (error) { state.records[e] = []; toast(`Could not load ${ENTITIES[e].title.toLowerCase()}: ${error?.message || error}`, { type: 'error' }); } }));
    renderTabs(); renderRows(); renderEditor();
  }

  function renderTabs() {
    tabs.replaceChildren(...ORDER.map(e => {
      const sel = e === state.entity;
      const t = h('button', { type: 'button', role: 'tab', id: `eq-tab-${e}`, 'aria-selected': String(sel), 'aria-controls': 'eq-panel', tabindex: sel ? '0' : '-1', class: 'tab', html: `${icon(ENTITIES[e].icon, { size: 18 })}<span>${ENTITIES[e].title}</span><span class="count num">${(state.records[e] || []).length}</span>` });
      t.addEventListener('click', () => select(e));
      return t;
    }));
    $('#eq-panel').setAttribute('aria-labelledby', `eq-tab-${state.entity}`);
    const d = ENTITIES[state.entity];
    $('#eq-search').placeholder = `Search ${d.title.toLowerCase()}…`;
    $('#eq-add').innerHTML = `${icon('plus', { size: 18 })}<span>Add ${d.one}</span>`;
  }
  tabs.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = ORDER.indexOf(state.entity);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? ORDER.length - 1 : (i + (e.key === 'ArrowLeft' ? ORDER.length - 1 : 1)) % ORDER.length;
    select(ORDER[next]);
    tabs.querySelector('[aria-selected="true"]')?.focus();
  });

  function select(entity) { state.entity = entity; state.editing = null; state.search = ''; $('#eq-search').value = ''; renderTabs(); renderRows(); renderEditor(); }

  function renderRows() {
    const d = ENTITIES[state.entity], q = state.search.trim().toLowerCase();
    const rows = (state.records[state.entity] || []).filter(r => !q || `${d.name(r)} ${d.sub(r, ctx)}`.toLowerCase().includes(q));
    const host = $('#eq-rows');
    if (!rows.length) {
      host.innerHTML = q
        ? `<div class="empty empty-sm">${icon('search', { size: 32 })}<h2>No matches</h2><p>Nothing in ${esc(d.title.toLowerCase())} matches “${esc(state.search)}”.</p></div>`
        : `<div class="empty">${icon(d.icon, { size: 48 })}<h2>No ${esc(d.title.toLowerCase())} yet</h2><p>${esc(d.blurb)}</p><button type="button" class="btn btn-primary" data-add>${icon('plus', { size: 18 })}<span>Add ${esc(d.one)}</span></button></div>`;
      host.querySelector('[data-add]')?.addEventListener('click', () => edit(null));
      return;
    }
    const list = h('ul', { class: 'record-list', role: 'list' });
    rows.forEach(r => {
      const li = h('li', { class: `record ${state.editing?.id === r.id ? 'selected' : ''}` });
      const open = h('button', { type: 'button', class: 'record-main', 'aria-current': state.editing?.id === r.id ? 'true' : null, html: `<strong>${esc(d.name(r) || '(unnamed)')}</strong><span class="muted small">${esc(d.sub(r, ctx) || '—')}</span>` });
      open.addEventListener('click', () => edit(r));
      const del = h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-danger-ghost', 'aria-label': `Delete ${d.name(r)}`, html: icon('trash', { size: 18 }) });
      del.addEventListener('click', () => remove(r));
      li.append(open, del);
      list.append(li);
    });
    host.replaceChildren(h('p', { class: 'muted small list-count', text: `${rows.length} ${rows.length === 1 ? d.one : d.title.toLowerCase()}` }), list);
  }

  function edit(record) { state.editing = record ? { ...record } : {}; renderRows(); renderEditor(); section.querySelector('#eq-editor input, #eq-editor select')?.focus(); }

  function refOptions(entity) {
    return [['', '— none —'], ...(state.records[entity] || []).map(r => [r.id, ENTITIES[entity].name(r)])];
  }

  function fieldEl(f, value) {
    const id = `eq-f-${f.key}`;
    const wrap = h('label', { class: `field ${f.type === 'textarea' || f.type === 'components' ? 'field-wide' : ''}`, for: id }, h('span', { class: 'field-label', text: `${f.label}${f.required ? ' *' : ''}` }));
    let input;
    if (f.type === 'select' || f.type === 'ref') {
      input = h('select', { id, name: f.key, required: f.required || null });
      (f.type === 'ref' ? refOptions(f.ref) : f.options).forEach(([v, t]) => input.append(h('option', { value: v, text: t, selected: String(value ?? '') === String(v) ? true : null })));
    } else if (f.type === 'textarea') input = h('textarea', { id, name: f.key, rows: 3 }, value ?? '');
    else input = h('input', { id, name: f.key, type: f.type || 'text', value: value ?? '', required: f.required || null, placeholder: f.placeholder || null });
    wrap.append(input);
    return wrap;
  }

  function componentsEditor(components) {
    const box = h('fieldset', { class: 'components field-wide' }, h('legend', { class: 'field-label', text: 'Components' }));
    const list = h('div', { class: 'component-rows' });
    const addRow = c => {
      const row = h('div', { class: 'component-row' });
      const role = h('select', { 'aria-label': 'Role', name: 'role' }); ROLES.forEach(([v, t]) => role.append(h('option', { value: v, text: t, selected: c.role === v ? true : null })));
      const asset = h('select', { 'aria-label': 'Asset', name: 'assetId', required: true }); refOptions('asset').forEach(([v, t]) => asset.append(h('option', { value: v, text: v ? t : '— choose asset —', selected: c.assetId === v ? true : null })));
      const pos = h('input', { 'aria-label': 'Position', name: 'position', placeholder: 'Position (e.g. left)', value: c.position || '' });
      const del = h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Remove component', html: icon('minus', { size: 16 }), onclick: () => { row.remove(); } });
      row.dataset.id = c.id || '';
      row.append(role, asset, pos, del);
      list.append(row);
    };
    (components || []).forEach(addRow);
    const add = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', html: `${icon('plus', { size: 16 })}<span>Add component</span>` });
    add.addEventListener('click', () => { addRow({}); list.lastElementChild?.querySelector('select')?.focus(); });
    if (!(state.records.asset || []).length) box.append(h('p', { class: 'muted small', text: 'Add assets first, then attach them here.' }));
    box.append(list, add);
    return box;
  }

  function renderEditor() {
    const host = $('#eq-editor'), d = ENTITIES[state.entity];
    if (!state.editing) {
      host.innerHTML = `<div class="empty empty-sm">${icon('edit', { size: 36 })}<h2>Select a record</h2><p>Choose an item to edit, or add a new ${esc(d.one)}.</p></div>`;
      return;
    }
    const r = state.editing, isNew = !r.id;
    const form = h('form', { class: 'editor-form', novalidate: true });
    form.append(h('h2', { class: 'card-title', text: isNew ? `New ${d.one}` : `Edit ${d.name(r) || d.one}` }));
    const grid = h('div', { class: 'field-grid' });
    d.fields.forEach(f => grid.append(f.type === 'components' ? componentsEditor(r.components) : fieldEl(f, r[f.key])));
    form.append(grid);
    if (r.updatedAt || r.createdAt) form.append(h('p', { class: 'muted small', text: `Created ${formatDate(r.createdAt)}${r.updatedAt ? ` · updated ${formatDate(r.updatedAt)}` : ''}` }));
    const err = h('p', { class: 'form-error', role: 'alert' });
    const cancel = h('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel', onclick: () => { state.editing = null; renderRows(); renderEditor(); } });
    const save = h('button', { type: 'submit', class: 'btn btn-primary', html: `${icon('check', { size: 18 })}<span>${isNew ? 'Create' : 'Save changes'}</span>` });
    form.append(err, h('div', { class: 'form-actions' }, cancel, save));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const record = { ...(r.id ? { id: r.id } : {}) };
      for (const f of d.fields) {
        if (f.type === 'components') continue;
        const el = form.elements[f.key]; let v = el.value.trim();
        if (f.required && !v) { err.textContent = `${f.label} is required.`; el.setAttribute('aria-invalid', 'true'); el.focus(); return; }
        el.removeAttribute('aria-invalid');
        record[f.key] = v === '' ? null : f.type === 'number' ? Number(v) : v;
      }
      if (state.entity === 'setup') {
        const rows = [...form.querySelectorAll('.component-row')];
        const missing = rows.find(row => !row.querySelector('[name="assetId"]').value);
        if (missing) { err.textContent = 'Each component needs an asset.'; missing.querySelector('[name="assetId"]').focus(); return; }
        record.components = rows.map(row => ({ ...(row.dataset.id ? { id: row.dataset.id } : {}), role: row.querySelector('[name="role"]').value, assetId: row.querySelector('[name="assetId"]').value, position: row.querySelector('[name="position"]').value.trim() || null }));
      }
      save.disabled = true;
      try {
        const saved = await store.upsert(state.entity, record);
        await reload(state.entity);
        state.editing = saved ? { ...saved } : null;
        renderTabs(); renderRows(); renderEditor();
        toast(`${d.one[0].toUpperCase() + d.one.slice(1)} ${isNew ? 'created' : 'saved'}.`, { type: 'success' });
        emit('catalog');
      } catch (error) { err.textContent = `Could not save: ${error?.message || error}`; save.disabled = false; }
    });
    host.replaceChildren(form);
  }

  async function reload(entity) { state.records[entity] = await store.list(entity); }

  async function remove(r) {
    const d = ENTITIES[state.entity];
    const ok = await confirmDialog({ title: `Delete ${d.one}?`, body: `“${d.name(r)}” will be removed from your catalog. Saved results keep their measurements. This cannot be undone.` });
    if (!ok) return;
    try {
      await store.remove(state.entity, r.id);
      await reload(state.entity);
      if (state.editing?.id === r.id) state.editing = null;
      renderTabs(); renderRows(); renderEditor();
      announce(`${d.name(r)} deleted`);
      toast(`Deleted ${d.name(r)}.`);
      emit('catalog');
    } catch (error) { toast(`Delete failed: ${error?.message || error}`, { type: 'error' }); }
  }

  $('#eq-search').addEventListener('input', e => { state.search = e.target.value; renderRows(); });
  $('#eq-add').addEventListener('click', () => edit(null));
  loadAll();

  return {
    onShow: () => {
      loadAll();
      document.getElementById('inspector-title').textContent = 'About equipment';
      document.getElementById('inspector-body').innerHTML = `<div class="inspect"><p>Results are tied to an <strong>asset</strong> so you can track a deck over time. Products and manufacturers describe what an asset is; setups describe how assets are wired together.</p><h3>Storage</h3><p>${store.native ? 'Saved in the local DeckChek database on this computer.' : 'Browser preview: saved in this browser only.'}</p></div>`;
    },
    onEscape: () => { if (state.editing) { state.editing = null; renderRows(); renderEditor(); return true; } return false; },
  };
}
