// Test media library screen (FS-06): browse built-in and custom test records / timecode media, mark the ones you own,
// add / edit / import / export / delete custom media, and send a medium to a test form ("Use in test").
// Flag: features.testMedia (the screen is only registered while it is on).

import { h, esc, externalLink, $ } from '../dom.js';
import { icon } from '../icons.js';
import { announce, toast } from '../live.js';
import { go, confirmDialog } from '../shell.js';
import { store as catalog, on } from '../state.js';
import { saveTextFile } from '../../userfiles.js';
import { TIMECODE_FORMATS } from '../../timecode.js';
import { KINDS, PURPOSES, LEVEL_UNITS, CONFIDENCE, LIMITS, TEST_KINDS, UNVERIFIED_WARNING, validateMediaProfile, prepareImport, listMedia } from '../../media-library.js';
import { media, mediaStore, ensureMedia, reloadMedia, encodeChoice, useInTest, installMediaPicker } from '../media-picker.js';

const KIND_LABEL = { test_record: 'Test record', timecode: 'Timecode', tone_file: 'Tone file' };
const FILTERS = [['all', 'All'], ['test_record', 'Test records'], ['timecode', 'Timecode'], ['custom', 'Custom']];
const TESTS = [['speed', 'Speed & Pitch'], ['cartridge', 'Cartridge'], ['dvs', 'DVS Timecode']];
const LEVEL_UNIT_LABEL = { 'cm/s_rms': 'cm/s RMS', um_peak: 'µm peak', db: 'dB', dbfs: 'dBFS' };

const num = v => { const s = String(v ?? '').trim().replace(',', '.'); if (!s) return undefined; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
const txt = v => { const s = String(v ?? '').trim(); return s || undefined; };

// ---------- draft <-> profile ----------
export function emptyDraft() {
  return { id: undefined, version: 1, name: '', kind: 'test_record', manufacturer: '', playbackRpm: '33.333', confidence: 'unverified', formatName: TIMECODE_FORMATS[0].name, tracks: [] };
}
export function draftFromProfile(p, { copy = false } = {}) {
  return {
    id: copy ? undefined : p.id, version: copy ? 1 : p.version, name: copy ? `${p.name} (copy)` : p.name, kind: p.kind, manufacturer: p.manufacturer ?? '',
    playbackRpm: p.playbackRpm ?? '', confidence: copy ? 'unverified' : p.confidence, formatName: p.timecode?.formatName ?? TIMECODE_FORMATS[0].name,
    tracks: (p.tracks || []).map(t => ({ key: t.key, trackNo: t.trackNo ?? '', side: t.side ?? '', purpose: t.purpose, frequencyHz: t.frequencyHz ?? '', levelValue: t.level?.value ?? '', levelUnit: t.level?.unit ?? 'cm/s_rms', durationS: t.durationS ?? '', label: t.label ?? '' })),
  };
}
/** Draft (strings from inputs) -> profile object. Non-numeric text becomes NaN so validation reports it. */
export function draftToProfile(d) {
  const p = { schemaVersion: 1, ...(d.id ? { id: d.id } : {}), version: d.version || 1, kind: d.kind, name: String(d.name ?? '').trim(), confidence: d.confidence };
  const m = txt(d.manufacturer); if (m) p.manufacturer = m;
  if (d.kind !== 'timecode') { const r = num(d.playbackRpm); if (r !== undefined) p.playbackRpm = r; }
  p.tracks = d.kind === 'timecode' ? [] : d.tracks.map(t => {
    const o = { key: t.key, purpose: t.purpose };
    const no = num(t.trackNo), hz = num(t.frequencyHz), lv = num(t.levelValue), du = num(t.durationS);
    if (no !== undefined) o.trackNo = no;
    if (txt(t.side)) o.side = txt(t.side);
    if (hz !== undefined) o.frequencyHz = hz;
    if (lv !== undefined) o.level = { value: lv, unit: t.levelUnit };
    if (du !== undefined) o.durationS = du;
    if (txt(t.label)) o.label = txt(t.label);
    return o;
  });
  if (d.kind === 'timecode') p.timecode = { formatName: d.formatName };
  return p;
}

const levelText = l => (l ? `${Number(Number(l.value).toFixed(3))} ${LEVEL_UNIT_LABEL[l.unit] || l.unit}` : '—');
const confBadge = c => `<span class="badge ${c === 'confirmed' ? 'badge-verified' : 'badge-unverified'}">${icon(c === 'confirmed' ? 'check' : 'warn', { size: 12 })}${c === 'confirmed' ? 'Confirmed' : 'Unverified'}</span>`;

export function createMediaScreen(section) {
  const st = { filter: 'all', query: '', selected: null, draft: null, touched: false, importErrors: null, uses: {}, nextKey: 1 };
  const store = mediaStore();

  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('vinyl', { size: 24 })}</span><div><h1 tabindex="-1">Test media</h1>
      <p class="lede">Test records and timecode media with their expected reference values. Pick one in a test to prefill the reference tone, speed and carrier.</p></div></div></header>
    <div class="media-toolbar toolbar">
      <search class="search"><label for="media-search" class="sr-only">Search test media</label>${icon('search', { size: 18 })}<input id="media-search" type="search" autocomplete="off" placeholder="Search media ( / )"></search>
      <button type="button" class="btn btn-primary" id="media-add">${icon('plus', { size: 18 })}<span>Add custom medium</span></button>
      <button type="button" class="btn btn-secondary" id="media-import">${icon('upload', { size: 18 })}<span>Import JSON</span></button>
      <input type="file" id="media-import-file" accept=".json,application/json" class="sr-only" tabindex="-1" aria-label="Import a media profile JSON file">
    </div>
    <div class="media-filters" role="group" aria-label="Filter media"></div>
    <div id="media-import-errors" aria-live="assertive"></div>
    <div class="media-layout">
      <section class="card media-list" aria-label="Media list"><div id="media-rows" aria-live="polite"></div></section>
      <section class="card media-detail" id="media-detail" aria-label="Medium details" tabindex="-1"></section>
    </div>`;
  const q = s => section.querySelector(s);

  // ----- list -----
  const visible = () => listMedia(media.entries, { kind: st.filter, query: st.query });
  const selectedEntry = () => media.entries.find(e => e.id === st.selected) || null;

  function renderFilters() {
    const host = q('.media-filters');
    host.replaceChildren(...FILTERS.map(([k, label]) => h('button', { type: 'button', class: 'seg media-filter', 'aria-pressed': String(st.filter === k), 'data-filter': k, text: label, onclick: () => { st.filter = k; renderFilters(); renderRows(); } })));
  }

  function renderRows() {
    const host = q('#media-rows');
    const rows = visible();
    if (!media.ready) { host.replaceChildren(h('p', { class: 'muted', text: 'Loading test media…' })); return; }
    const err = media.error ? h('p', { class: 'hint hint-warn', role: 'alert', html: `${icon('warn', { size: 16 })}<span></span>` }) : null;
    if (err) err.querySelector('span').textContent = media.error;
    if (!rows.length) {
      const msg = st.filter === 'custom' && !st.query ? 'No custom media yet. Add the discs you own.' : st.query ? `No media match “${st.query}”.` : 'No test media available.';
      host.replaceChildren(...[err, h('div', { class: 'empty empty-sm' }, h('p', { text: msg }))].filter(Boolean));
      return;
    }
    const ul = h('ul', { class: 'media-rows', role: 'list' });
    for (const e of rows) {
      const p = e.profile || {};
      const id = `media-own-${e.id}`;
      const own = h('input', { type: 'checkbox', id, 'aria-label': `I own ${e.name}` });
      own.checked = !!e.owned;
      own.addEventListener('change', async () => {
        try { await store.setOwned(e.id, own.checked); await reloadMedia(); announce(`${e.name} ${own.checked ? 'marked as owned' : 'no longer marked as owned'}.`); }
        catch (error) { own.checked = !own.checked; toast(`Could not update ownership: ${error?.message || error}`, { type: 'error' }); }
      });
      const main = h('button', { type: 'button', class: 'media-row-main', 'aria-current': st.selected === e.id ? 'true' : null, 'data-media-id': e.id, onclick: () => open(e.id) });
      main.innerHTML = `<span class="media-row-name">${esc(e.name)}</span><span class="media-row-meta muted small">${esc(KIND_LABEL[e.kind] || e.kind)}${p.manufacturer ? ` · ${esc(p.manufacturer)}` : ''}${e.source === 'custom' ? ' · Custom' : ''}${(p.tracks || []).length ? ` · ${p.tracks.length} tracks` : ''}</span>${confBadge(p.confidence)}`;
      ul.append(h('li', { class: 'media-row' }, main, h('label', { class: 'media-own', for: id }, own, h('span', { class: 'small', text: 'I own this' }))));
    }
    host.replaceChildren(...[err, ul].filter(Boolean));
  }

  // ----- detail -----
  async function loadUses() {
    try { const rows = await catalog.listDeviceTestResults(null); st.uses = {}; for (const r of rows) if (r.mediaId) st.uses[r.mediaId] = (st.uses[r.mediaId] || 0) + 1; } catch { st.uses = {}; }
  }

  async function open(id) {
    st.selected = id; st.draft = null; st.importErrors = null;
    await loadUses();
    renderRows(); renderDetail();
    q('#media-detail').focus();
  }
  function close() {
    const id = st.selected;
    st.selected = null; st.draft = null;
    renderRows(); renderDetail();
    q(`[data-media-id="${CSS.escape(id || '')}"]`)?.focus();
  }

  function renderDetail() {
    const host = q('#media-detail');
    if (st.draft) { renderEditor(host); return; }
    const e = selectedEntry();
    if (!e) { host.replaceChildren(h('div', { class: 'empty empty-sm' }, h('p', { text: 'Select a medium to see its tracks and expected values.' }))); return; }
    const p = e.profile || {};
    const custom = e.source === 'custom';
    const tests = TESTS.filter(([id]) => TEST_KINDS[id]?.includes(e.kind));
    host.innerHTML = `
      <div class="card-head"><h2>${esc(e.name)}</h2><button type="button" class="btn btn-ghost btn-sm" id="media-close">${icon('x', { size: 16 })}<span>Close</span></button></div>
      <p class="muted small">${esc(KIND_LABEL[e.kind] || e.kind)}${p.manufacturer ? ` · ${esc(p.manufacturer)}` : ''} · ${custom ? 'Custom (editable)' : 'Built-in (read-only)'} ${confBadge(p.confidence)}</p>
      ${p.confidence !== 'confirmed' ? `<p class="hint hint-warn media-unverified">${icon('warn', { size: 16 })}<span>${esc(UNVERIFIED_WARNING)}. Values below come from retailer or forum summaries until you check them against your own copy.</span></p>` : ''}
      <dl class="kv media-facts">
        ${p.playbackRpm ? `<dt>Playback speed</dt><dd>${esc(Number(Number(p.playbackRpm).toFixed(3)))} rpm</dd>` : ''}
        ${p.timecode?.formatName ? `<dt>Timecode format</dt><dd>${esc(p.timecode.formatName)}</dd>` : ''}
        ${p.rias ? `<dt>Phono input</dt><dd>${esc(p.rias)}</dd>` : ''}
        <dt>Saved results</dt><dd id="media-uses">${st.uses[e.id] ? `Used in ${st.uses[e.id]} saved result${st.uses[e.id] === 1 ? '' : 's'}` : 'Not used in a saved result yet'}</dd>
      </dl>
      ${p.notes ? `<p class="small">${esc(p.notes)}</p>` : ''}
      <div id="media-tracks"></div><div id="media-sources"></div>
      <div class="media-actions" id="media-actions"></div>`;
    $('#media-close', host).addEventListener('click', close);

    const tracks = p.tracks || [];
    const useBtn = (key, testId) => h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-use': key ?? '', text: 'Use in test', 'aria-label': `Use ${key ? `track ${key}` : e.name} in ${TESTS.find(t => t[0] === testId)?.[1] || 'a test'}`, onclick: () => { useInTest(testId, encodeChoice(e.id, key)); go(testId); } });
    const testSel = h('select', { id: 'media-test', 'aria-label': 'Test to use this medium in' }, ...tests.map(([id, label]) => h('option', { value: id, text: label })));
    if (tracks.length) {
      const rows = tracks.map(t => {
        const tr = h('tr', {});
        tr.innerHTML = `<th scope="row">${esc(t.trackNo ?? t.key)}</th><td>${esc(t.side ?? '—')}</td><td class="num">${t.frequencyHz != null ? esc(`${Number(t.frequencyHz.toFixed(3))} Hz`) : '—'}</td><td class="num">${esc(levelText(t.level))}</td><td>${esc((t.purpose || '').replace(/_/g, ' '))}${t.label ? ` · ${esc(t.label)}` : ''}</td><td>${esc(t.confidence === 'confirmed' ? 'Confirmed' : 'Unverified')}</td><td class="media-track-use"></td>`;
        if (tests.length) tr.querySelector('.media-track-use').append(useBtn(t.key, testSel.value));
        return tr;
      });
      const table = h('div', { class: 'table-wrap' });
      table.innerHTML = '<table class="data media-tracks"><caption class="sr-only">Tracks</caption><thead><tr><th scope="col">Track</th><th scope="col">Side</th><th scope="col">Frequency</th><th scope="col">Level</th><th scope="col">Purpose</th><th scope="col">Confidence</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead><tbody></tbody></table>';
      table.querySelector('tbody').append(...rows);
      $('#media-tracks', host).append(h('h3', { text: 'Tracks' }), table);
      testSel.addEventListener('change', () => { $('#media-tracks', host).querySelectorAll('[data-use]').forEach(b => b.replaceWith(useBtn(b.dataset.use, testSel.value))); });
    } else if (tracks.length === 0 && e.kind !== 'timecode') {
      $('#media-tracks', host).append(h('p', { class: 'muted small', text: 'No tracks listed for this medium.' }));
    }
    const actions = $('#media-actions', host);
    if (tests.length) {
      actions.append(h('label', { class: 'media-test-pick small', for: 'media-test' }, 'Test: ', testSel));
      if (!tracks.length || e.kind === 'timecode') actions.append(useBtn(null, testSel.value));
      if (!tracks.length || e.kind === 'timecode') testSel.addEventListener('change', () => { actions.querySelector('[data-use=""]')?.replaceWith(useBtn(null, testSel.value)); });
    }
    if (custom) {
      actions.append(
        h('button', { type: 'button', class: 'btn btn-secondary', id: 'media-edit', html: `${icon('edit', { size: 18 })}<span>Edit</span>`, onclick: () => startEdit(draftFromProfile(p)) }),
        h('button', { type: 'button', class: 'btn btn-secondary', id: 'media-export', html: `${icon('download', { size: 18 })}<span>Export JSON</span>`, onclick: () => exportJson(e) }),
        h('button', { type: 'button', class: 'btn btn-danger', id: 'media-delete', html: `${icon('trash', { size: 18 })}<span>Delete</span>`, onclick: () => remove(e) }));
    } else {
      actions.append(h('button', { type: 'button', class: 'btn btn-secondary', id: 'media-duplicate', html: `${icon('copy', { size: 18 })}<span>Duplicate and edit</span>`, onclick: () => startEdit(draftFromProfile(p, { copy: true })) }));
    }
    const sources = [...(p.sources || [])];
    if (sources.length) {
      const ul = h('ul', { class: 'media-sources', role: 'list' });
      sources.forEach(s => ul.append(h('li', {}, externalLink(s.url, s.title), h('span', { class: 'muted small', text: s.verified ? ' (verified)' : ' (not verified)' }))));
      $('#media-sources', host).append(h('h3', { text: 'Sources' }), ul);
    }
  }

  async function exportJson(e) {
    try {
      const r = await saveTextFile({ suggestedName: e.name, content: store.exportCustom(e.profile), ext: 'json' });
      if (!r.cancelled) toast(r.path ? `Exported to ${r.path}` : 'Exported as a download.', { type: 'success' });
    } catch (error) { toast(`Could not export: ${error?.message || error?.code || error}`, { type: 'error' }); }
  }
  async function remove(e) {
    const ok = await confirmDialog({ title: `Delete “${e.name}”?`, body: 'Saved results keep their record of which medium was used. This custom medium is removed from every picker.', confirmLabel: 'Delete' });
    if (!ok) return;
    try { await store.deleteCustom(e.id); await reloadMedia(); st.selected = null; renderRows(); renderDetail(); toast(`Deleted ${e.name}.`, { type: 'success' }); q('#media-add').focus(); }
    catch (error) { toast(`Could not delete: ${error?.message || error}`, { type: 'error' }); }
  }

  // ----- editor -----
  function startEdit(draft) {
    st.draft = draft; st.touched = false; st.nextKey = Math.max(1, ...draft.tracks.map(t => Number(/^t(\d+)$/.exec(t.key)?.[1]) || 0)) + 1;
    renderDetail();
    q('#media-name')?.focus();
  }
  const builtinIds = () => media.entries.filter(e => e.source === 'builtin').map(e => e.id);

  function validate(showAll = false) {
    const d = st.draft;
    const res = validateMediaProfile(draftToProfile(d), { mode: 'custom', builtinIds: builtinIds() });
    const host = q('#media-errors');
    const list = st.touched || showAll ? res.errors : [];
    host.replaceChildren();
    section.querySelectorAll('#media-detail [data-field]').forEach(el => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); });
    if (list.length) {
      const ul = h('ul', { class: 'media-error-list' });
      list.forEach((er, i) => {
        const id = `media-err-${i}`;
        ul.append(h('li', { id, text: `${er.field || 'profile'}: ${er.message}` }));
        const input = section.querySelector(`#media-detail [data-field="${CSS.escape(er.field)}"]`);
        if (input) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', id); }
      });
      host.append(h('p', { class: 'small', text: `${list.length} problem${list.length === 1 ? '' : 's'} to fix before saving:` }), ul);
    }
    return res;
  }

  function renderEditor(host) {
    const d = st.draft;
    const field = (label, key, { type = 'text', attrs = {}, wide = false } = {}) => {
      const id = `media-${key}`;
      const input = h('input', { type, id: key === 'name' ? 'media-name' : id, 'data-field': key, value: d[key] ?? '', autocomplete: 'off', ...attrs });
      input.addEventListener('input', () => { d[key] = input.value; st.touched = true; validate(); });
      return h('div', { class: `field${wide ? ' field-wide' : ''}` }, h('label', { class: 'field-label', for: input.id, text: label }), input);
    };
    const selectField = (label, key, options, onChange) => {
      const sel = h('select', { id: `media-${key}`, 'data-field': key }, ...options.map(([v, t]) => h('option', { value: v, text: t, selected: v === d[key] ? true : null })));
      sel.addEventListener('change', () => { d[key] = sel.value; st.touched = true; onChange?.(); validate(); });
      return h('div', { class: 'field' }, h('label', { class: 'field-label', for: sel.id, text: label }), sel);
    };
    host.replaceChildren(
      h('div', { class: 'card-head' }, h('h2', { text: d.id ? 'Edit custom medium' : 'Add custom medium' })),
      h('form', { id: 'media-form', novalidate: true, 'aria-label': 'Custom medium', onsubmit: e => { e.preventDefault(); save(); } },
        h('div', { class: 'field-grid' },
          field('Name', 'name', { attrs: { required: true, maxlength: LIMITS.maxString } }),
          selectField('Kind', 'kind', KINDS.map(k => [k, KIND_LABEL[k]]), renderDetail),
          field('Manufacturer', 'manufacturer', { attrs: { maxlength: LIMITS.maxString } }),
          d.kind === 'timecode' ? selectField('Timecode format', 'formatName', TIMECODE_FORMATS.map(f => [f.name, f.name])) : field('Playback speed (rpm)', 'playbackRpm', { attrs: { inputmode: 'decimal' } }),
          selectField('Confidence', 'confidence', CONFIDENCE.map(c => [c, c === 'confirmed' ? 'Confirmed (I checked it)' : 'Unverified']))),
        d.kind === 'timecode' ? h('p', { class: 'hint', html: `${icon('info', { size: 16 })}<span>Carrier frequency and side lengths come from the timecode format table, so they are not entered here.</span>` }) : trackEditor(d),
        h('div', { id: 'media-errors', class: 'media-errors', role: 'alert' }),
        h('div', { class: 'media-actions' },
          h('button', { type: 'submit', class: 'btn btn-primary', id: 'media-save', html: `${icon('check', { size: 18 })}<span>Save</span>` }),
          h('button', { type: 'button', class: 'btn btn-ghost', id: 'media-cancel', text: 'Cancel', onclick: cancelEdit }))));
    validate();
  }

  function trackEditor(d) {
    const wrap = h('div', { class: 'media-track-editor' }, h('h3', { text: 'Tracks' }));
    const table = h('div', { class: 'table-wrap' });
    table.innerHTML = `<table class="data media-edit-tracks"><caption class="sr-only">Tracks, one row each</caption><thead><tr>${['Track no.', 'Side', 'Purpose', 'Frequency (Hz)', 'Level', 'Unit', 'Duration (s)', 'Label', ''].map(c => `<th scope="col">${c || '<span class="sr-only">Remove</span>'}</th>`).join('')}</tr></thead><tbody></tbody></table>`;
    const body = table.querySelector('tbody');
    d.tracks.forEach((t, i) => {
      const cell = (key, { type = 'text', width = null, inputmode = null } = {}) => {
        const input = h('input', { type, 'data-field': `tracks[${i}].${{ trackNo: 'trackNo', side: 'side', frequencyHz: 'frequencyHz', levelValue: 'level.value', durationS: 'durationS', label: 'label' }[key]}`, value: t[key] ?? '', 'aria-label': `Track ${i + 1} ${key}`, inputmode, autocomplete: 'off', style: width ? `min-width:${width}` : null });
        input.addEventListener('input', () => { t[key] = input.value; st.touched = true; validate(); });
        return h('td', {}, input);
      };
      const sel = (key, opts, field) => {
        const s = h('select', { 'data-field': field, 'aria-label': `Track ${i + 1} ${key}` }, ...opts.map(([v, tx]) => h('option', { value: v, text: tx, selected: v === t[key] ? true : null })));
        s.addEventListener('change', () => { t[key] = s.value; st.touched = true; validate(); });
        return h('td', {}, s);
      };
      body.append(h('tr', {},
        cell('trackNo', { inputmode: 'numeric', width: '5rem' }), cell('side', { width: '4rem' }), sel('purpose', PURPOSES.map(p => [p, p.replace(/_/g, ' ')]), `tracks[${i}].purpose`),
        cell('frequencyHz', { inputmode: 'decimal', width: '6rem' }), cell('levelValue', { inputmode: 'decimal', width: '5rem' }), sel('levelUnit', LEVEL_UNITS.map(u => [u, LEVEL_UNIT_LABEL[u]]), `tracks[${i}].level.unit`),
        cell('durationS', { inputmode: 'decimal', width: '5rem' }), cell('label', { width: '9rem' }),
        h('td', {}, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': `Remove track ${i + 1}`, html: icon('trash', { size: 16 }), onclick: () => { d.tracks.splice(i, 1); st.touched = true; renderDetail(); q('#media-add-track')?.focus(); } }))));
    });
    if (!d.tracks.length) body.append(h('tr', {}, h('td', { colspan: 9, class: 'muted small', text: 'No tracks yet. Add the tracks you need (frequency, level and purpose).' })));
    wrap.append(table, h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'media-add-track', html: `${icon('plus', { size: 16 })}<span>Add track</span>`, disabled: d.tracks.length >= LIMITS.maxTracks ? true : null,
      onclick: () => { d.tracks.push({ key: `t${st.nextKey++}`, trackNo: '', side: '', purpose: 'reference_tone', frequencyHz: '', levelValue: '', levelUnit: 'cm/s_rms', durationS: '', label: '' }); renderDetail(); const rows = q('.media-edit-tracks tbody').children; rows[rows.length - 1].querySelector('input')?.focus(); } }));
    return wrap;
  }

  async function save() {
    st.touched = true;
    const res = validate(true);
    if (!res.ok) { q('#media-errors').scrollIntoView?.({ block: 'nearest' }); announce(`${res.errors.length} problems to fix before saving.`, { assertive: true }); return; }
    try {
      const out = await store.saveCustom(draftToProfile(st.draft));
      if (!out.ok) { st.touched = true; showErrors(out.errors); return; }
      await reloadMedia();
      st.draft = null; st.filter = st.filter === 'all' ? 'all' : 'custom';
      renderFilters();
      await open(out.id);
      toast('Medium saved. It now appears in the test pickers.', { type: 'success' });
    } catch (error) { toast(`Could not save: ${error?.message || error}`, { type: 'error' }); }
  }
  function showErrors(errors) {
    const host = q('#media-errors');
    host.replaceChildren(h('ul', { class: 'media-error-list' }, ...errors.map(er => h('li', { text: `${er.field || 'profile'}: ${er.message}` }))));
  }
  function cancelEdit() {
    const was = st.draft?.id;
    st.draft = null;
    renderDetail();
    (was ? q('#media-edit') : q('#media-add'))?.focus();
  }

  // ----- import -----
  async function importFile(file) {
    const host = q('#media-import-errors');
    host.replaceChildren();
    if (file.size > LIMITS.maxJsonBytes) { showImportErrors([{ field: '', message: `file is larger than ${LIMITS.maxJsonBytes / 1024} KB` }]); return; }
    const text = await file.text();
    const custom = media.entries.filter(e => e.source === 'custom').map(e => e.id);
    const res = prepareImport(text, { builtinIds: builtinIds(), existingCustomIds: custom });
    if (!res.ok) { showImportErrors(res.errors); return; }
    const out = await store.saveCustom(res.profile);
    if (!out.ok) { showImportErrors(out.errors); return; }
    await reloadMedia();
    st.filter = 'custom'; renderFilters();
    await open(out.id);
    toast(`Imported ${res.profile.name}.`, { type: 'success' });
  }
  function showImportErrors(errors) {
    const host = q('#media-import-errors');
    const box = h('div', { class: 'banner banner-fail', role: 'alert' }, h('div', { class: 'banner-text' }, h('strong', { text: 'Import failed. Nothing was stored.' }),
      h('ul', { class: 'media-error-list' }, ...errors.map(er => h('li', { text: `${er.field || 'file'}: ${er.message}` })))));
    host.replaceChildren(box);
  }

  // ----- wiring -----
  q('#media-search').addEventListener('input', e => { st.query = e.target.value; renderRows(); });
  q('#media-add').addEventListener('click', () => { st.selected = null; renderRows(); startEdit(emptyDraft()); });
  q('#media-import').addEventListener('click', () => q('#media-import-file').click());
  q('#media-import-file').addEventListener('change', async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (f) { try { await importFile(f); } catch (error) { showImportErrors([{ field: '', message: String(error?.message || error) }]); } }
  });
  section.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (st.selected || st.draft) && !e.defaultPrevented) {
      if (st.draft) cancelEdit(); else close();
      e.preventDefault();
    }
  });
  const onSlash = e => {
    if (e.key !== '/' || section.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
    e.preventDefault(); q('#media-search').focus();
  };
  document.addEventListener('keydown', onSlash);
  on('media', () => { renderRows(); if (!st.draft) renderDetail(); });

  renderFilters(); renderRows(); renderDetail();
  return {
    onShow() { ensureMedia().then(() => { renderRows(); if (!st.draft) renderDetail(); }); },
  };
}

/** Rail entry for the app shell: the rail entry follows features.testMedia live. */
export function mediaScreenDefs() {
  installMediaPicker(); // the form field and its prefill are wired even before the screen is opened
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-media')) main.append(h('section', { class: 'screen', id: 'screen-media', hidden: true }));
  return [{ id: 'media', title: 'Test media', short: 'Media', icon: 'vinyl', feature: 'testMedia', create: createMediaScreen }];
}
