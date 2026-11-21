// Pre-gig check screen (FS-10, "Ready to play"). Built for a nervous DJ minutes before a set: one big Start button,
// a live checklist with a status word per step, a green / amber / red verdict with a fix-it button beside every
// problem, single-step re-run, and a history that shows what changed since the last check. Pass / warn / fail
// decisions come from pre-gig.js; wording and run state come from workflows/pregig.js. Flag: features.pregig.

import { h, isNative, storageGet, storageSet, download, pickFile } from '../dom.js';
import { icon, chip } from '../icons.js';
import { announce, toast } from '../live.js';
import { go, confirmDialog } from '../shell.js';
import { active } from '../state.js';
import { isEnabled, onFeatureChange } from '../../features.js';
import { confirmCaptureBusy } from '../capture-busy.js';
import { ensureMedia, media as mediaState } from '../media-picker.js';
import { listMedia } from '../../media-library.js';
import { createPairPicker, currentPair, cachedInputDevices } from '../pair-picker.js';
import { lib, ensureLibrary } from '../devices/library-state.js';
import { TIMECODE_FORMATS } from '../../timecode.js';
import { withCrossFixes } from '../../crosslinks.js';
import { navigateTo, openWindowsSettings } from '../crosslinks.js';
import { exportPdfWithFeedback, pdfExportEnabled } from '../persistence.js';
import { ensurePregigPrintable, pregigPrintData, PREGIG_KIND } from '../workflows/pregig-report.js';
import { readTextFile } from '../../text-file.js';
import {
  buildPlan, validatePreset, parsePresetJson, exportPresetJson, duplicatePreset, presetFromEquipment, loadBuiltinPresets,
  createPregigApi, createNativeDeps, diffRuns, PREGIG_BUDGET_MS, MAX_PRESET_BYTES, namesMatch, deckPairFirst,
} from '../../pre-gig.js';
import {
  createPregigController, describeStep, verdictView, fixButtons, evidenceRows, rerunTargets, compareView, stepLabel,
  estimateText, durationText, runMatchesPreset, PAIR_UNAVAILABLE_TEXT,
} from '../workflows/pregig.js';

const LAST_PRESET_KEY = 'deckchek.pregig.lastPreset.v1';
const TABS = [['check', 'Check'], ['history', 'History'], ['presets', 'Presets']];
const RATES = [44100, 48000, 88200, 96000, 192000];
const INPUT_PAIRS = [[0, 1], [2, 3], [4, 5], [6, 7]];
const VERDICT_CHIP = { green: ['pass', 'Ready'], amber: ['warn', 'Amber'], red: ['fail', 'Not ready'], incomplete: ['warn', 'Incomplete'], cancelled: ['info', 'Cancelled'] };
const friendly = e => (typeof e === 'string' ? e : e?.message || 'Something went wrong.');
const pad = n => String(n).padStart(2, '0');
const whenText = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso ?? '') : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const pairText = input => `${input[0] + 1}-${input[1] + 1}`;

/** State chip for a checklist row: icon + word, so colour is never the only signal. */
function stateBadge(view) {
  if (view.kind === 'live') {
    return h('span', { class: `pg-live pg-live-${view.state}` }, h('span', { class: 'pg-dot', 'aria-hidden': 'true' }), h('span', { class: 'pg-live-word', text: view.word }));
  }
  const el = document.createElement('span');
  el.innerHTML = chip(view.tone, view.word);
  return el.firstElementChild;
}

/** Small modal built from DOM nodes; resolves when closed. Esc and the Cancel button both close it. */
function openDialog({ title, body, actions, labelId = 'pg-dlg-title', canClose = () => true }) {
  const trigger = document.activeElement;
  const dlg = h('dialog', { class: 'pg-dialog', 'aria-labelledby': labelId });
  const close = value => { if (!canClose() || !dlg.isConnected) return; if (dlg.open) dlg.close(); dlg.remove(); if (trigger?.isConnected) trigger.focus(); settle(value); };
  let settle = () => {};
  const done = new Promise(res => { settle = res; });
  const acts = actions(close);
  dlg.append(h('div', { class: 'dialog-form' }, h('h2', { id: labelId, text: title }), body, h('div', { class: 'dialog-actions' }, ...acts)));
  dlg.addEventListener('cancel', e => { e.preventDefault(); close(null); });
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, close, done };
}

export function createPregigScreen(section, { api = createPregigApi(), nativeInvoke = isNative() ? window.__TAURI__.core.invoke : null } = {}) {
  const native = !!nativeInvoke;
  const getVersion = async () => { try { return (await window.__TAURI__?.app?.getVersion?.()) || '0.0.0'; } catch { return '0.0.0'; } };
  const deps = native ? createNativeDeps(nativeInvoke) : {};
  const ctl = createPregigController({
    api, deps, ui: { confirmPreempt: e => confirmCaptureBusy({ holder: e?.holder, since: e?.since }, { action: 'continue the pre-gig check' }) },
    profiles: () => lib.profiles || [], appVersion: getVersion,
  });
  const st = {
    tab: 'check', presets: [], problems: [], presetId: storageGet(LAST_PRESET_KEY, null), skip: new Set(), expanded: new Set(), history: null, historyOpen: new Map(), historyCompare: null,
    notice: null, timer: null, focusPrompt: null, loading: true,
    presetError: null, historyError: null, historyLoading: false, presetLoad: 0, historyLoad: 0, disposed: false, replacing: false,
  };
  const S = ctl.state;

  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('pass', { size: 24 })}</span><div><h1 tabindex="-1">Pre-gig check</h1>
      <p class="lede">One button checks your whole rig and tells you if you are ready to play, with a fix beside every problem.</p></div></div></header>
    <div id="pg-notice" class="pg-notice" role="status" aria-live="polite"></div>
    <div id="pg-storage-status" class="pg-notice" aria-live="polite"></div>
    <div class="tabs" role="tablist" aria-label="Pre-gig sections" id="pg-tabs"></div>
    <div id="pg-panel" class="pg-panel" role="tabpanel" tabindex="-1"></div>`;
  const q = s => section.querySelector(s);
  const panel = q('#pg-panel'), tabs = q('#pg-tabs'), noticeEl = q('#pg-notice'), storageStatus = q('#pg-storage-status');

  const currentPreset = () => st.presets.find(p => p.id === st.presetId) || (!st.presetError ? st.presets[0] : null) || null;

  // ------------------------------------------------------------ input pairs per deck (GAP-02)
  // The preset says which inputs each deck is plugged into (deck B on a Traktor Audio 8 DJ: 3-4). The Inputs boxes on the
  // start card override that for this interface and are remembered per deck, so a different cable layout needs no preset edit.
  const interfaceName = preset => cachedInputDevices().find(d => namesMatch(d.name, preset.audioDevice))?.name ?? preset.audioDevice;
  const deckSlot = d => ({ slot: `pregig:${d.id}`, fallback: (deckPairFirst(d.input) ?? 1), anyPair: true });
  /** The preset with each deck's inputs replaced by the pair chosen on the start card (browser: the preset as saved). */
  function withChosenPairs(preset) {
    if (!native || !preset?.decks) return preset;
    const name = interfaceName(preset);
    return { ...preset, decks: preset.decks.map(d => { const c = currentPair(name, deckSlot(d)); return { ...d, input: [c.first - 1, c.first] }; }) };
  }
  function pairRow(preset, running) {
    if (!native || !preset.decks?.length) return null;
    const pickers = preset.decks.map(d => createPairPicker({ id: `pg-pair-${d.id}`, label: `Deck ${d.id} inputs`, deviceName: () => interfaceName(preset), onChange: () => { if (!running) renderStartSummary(); }, ...deckSlot(d) }));
    return h('div', { class: 'pg-pairs field-grid', id: 'pg-pairs', role: 'group', 'aria-label': 'Which inputs each deck is plugged into' }, ...pickers.map(x => x.el));
  }
  function renderStartSummary() {
    const preset = currentPreset(), chips = q('.pg-chips');
    if (preset && chips) chips.replaceWith(presetChips(withChosenPairs(preset)));
  }
  const setNotice = (text, kind = 'info') => {
    noticeEl.replaceChildren();
    if (!text) return;
    noticeEl.append(h('div', { class: `banner banner-${kind === 'error' ? 'fail' : kind === 'warn' ? 'warn' : 'info'}`, role: kind === 'error' ? 'alert' : null }, h('span', { class: 'banner-text', text })));
  };

  // ------------------------------------------------------------ presets
  function presetView(row) {
    try {
      const body = typeof row.json === 'string' ? JSON.parse(row.json) : row.json;
      const p = { ...body, id: row.id, name: row.name, builtin: false }, v = validatePreset(p);
      if (typeof row.id !== 'string' || !row.id || !v.ok) throw new Error();
      return { ...v.preset, readOnly: v.readOnly };
    } catch { throw new Error('A saved preset could not be read completely. Its original contents were kept.'); }
  }

  async function loadPresets() {
    if (st.disposed) return false;
    const request = ++st.presetLoad, current = () => !st.disposed && request === st.presetLoad;
    st.loading = true; render();
    const known = lib.profiles?.length ? new Set(lib.profiles.map(p => p.id)) : null;
    const { presets: builtin, problems } = await loadBuiltinPresets(undefined, { knownProfileIds: known });
    if (!current()) return false;
    st.problems = problems;
    try {
      const rows = await api.listPresets();
      if (!current()) return false;
      if (!Array.isArray(rows)) throw new Error();
      const mine = rows.map(presetView);
      if (new Set(mine.map(p => p.id)).size !== mine.length) throw new Error();
      st.presets = [...builtin, ...mine]; st.presetError = null;
      if (!st.presets.some(p => p.id === st.presetId)) st.presetId = st.presets[0]?.id ?? null;
      return true;
    } catch {
      if (!current()) return false;
      if (!st.presets.length) st.presets = builtin;
      st.presetError = 'Your saved presets are unavailable. Previously loaded copies may be out of date. Retry loading them, or explicitly choose a built-in preset.';
      return false;
    } finally { if (current()) { st.loading = false; render(); } }
  }

  async function savePreset(preset) {
    const { id, builtin, readOnly, ...body } = preset;
    const row = await api.upsertPreset({ id: builtin ? undefined : id, name: preset.name, json: body });
    // A failed refresh must retain the row whose write already acknowledged success.
    st.presets = [...st.presets.filter(p => p.id !== row.id), presetView(row)];
    if (S.phase === 'idle') { st.presetId = row.id; storageSet(LAST_PRESET_KEY, row.id); }
    // Acknowledgement completes this save; an optional refresh owns its read status.
    void loadPresets();
    return row;
  }

  function presetForm(initial, { readOnly = false } = {}) {
    const p = structuredClone(initial);
    const form = h('form', { class: 'pg-form', novalidate: true });
    const err = h('div', { class: 'pg-form-errors', role: 'alert' });
    const name = h('input', { type: 'text', id: 'pg-f-name', value: p.name || '', maxlength: 100 });
    const device = h('input', { type: 'text', id: 'pg-f-device', value: p.audioDevice || '', list: 'pg-device-list' });
    const software = h('input', { type: 'text', id: 'pg-f-software', value: p.software || '' });
    const rate = h('select', { id: 'pg-f-rate' }, ...RATES.map(r => h('option', { value: String(r), text: `${r} Hz`, selected: r === Number(p.sampleRate) })));
    const midi = h('textarea', { id: 'pg-f-midi', rows: 2, text: (p.midi || []).map(m => (typeof m === 'string' ? m : m.name)).join('\n') });
    const needle = h('input', { type: 'checkbox', id: 'pg-f-needle', checked: !!p.requireNeedleUpHum });
    const decksBox = h('div', { class: 'pg-deck-rows' });
    p.decks = p.decks?.length ? p.decks : [{ id: 'A', input: [0, 1], format: TIMECODE_FORMATS[0].name }];
    const drawDecks = () => {
      decksBox.replaceChildren(...p.decks.map((d, i) => {
        const pair = h('select', { 'aria-label': `Deck ${d.id} inputs`, onchange: e => { d.input = INPUT_PAIRS[Number(e.target.value)]; } },
          ...INPUT_PAIRS.map((pr, k) => h('option', { value: String(k), text: `Inputs ${pairText(pr)}`, selected: pr[0] === d.input?.[0] })));
        const fmt = h('select', { 'aria-label': `Deck ${d.id} timecode format`, onchange: e => { d.format = e.target.value; } },
          ...TIMECODE_FORMATS.map(f => h('option', { value: f.name, text: f.name, selected: f.name === d.format })));
        return h('div', { class: 'pg-deck-row' }, h('strong', { text: `Deck ${d.id}` }), pair, fmt,
          p.decks.length > 1 ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Remove', 'aria-label': `Remove deck ${d.id}`, onclick: () => { p.decks.splice(i, 1); p.decks.forEach((x, k) => { x.id = 'ABCD'[k]; }); drawDecks(); } }) : null);
      }), p.decks.length < 4 ? h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Add a deck', onclick: () => { const k = p.decks.length; p.decks.push({ id: 'ABCD'[k], input: INPUT_PAIRS[k], format: p.decks.at(-1).format, mixerChannel: String(k + 1) }); drawDecks(); } }) : null);
    };
    drawDecks();
    const datalist = h('datalist', { id: 'pg-device-list' });
    if (native) nativeInvoke('list_native_audio_inputs').then(list => (list || []).forEach(d => datalist.append(h('option', { value: d.name })))).catch(() => {});
    const lab = (text, id) => h('label', { class: 'field-label', for: id, text });
    form.append(
      h('div', { class: 'field-grid' },
        h('div', { class: 'field' }, lab('Preset name', 'pg-f-name'), name),
        h('div', { class: 'field' }, lab('Audio interface', 'pg-f-device'), device, datalist, h('span', { class: 'field-help', text: 'As Windows lists it, for example "Traktor Audio 8 DJ".' })),
        h('div', { class: 'field' }, lab('DJ software', 'pg-f-software'), software),
        h('div', { class: 'field' }, lab('Sample rate', 'pg-f-rate'), rate),
        h('div', { class: 'field field-wide' }, h('span', { class: 'field-label', text: 'Decks' }), decksBox),
        h('div', { class: 'field field-wide' }, lab('MIDI gear to look for (one name per line)', 'pg-f-midi'), midi),
        h('label', { class: 'pg-check field-wide' }, needle, h('span', { text: 'Ask me to lift the needle so hum is measured on silence' }))),
      err);
    if (readOnly) form.querySelectorAll('input,select,textarea,button').forEach(el => { el.disabled = true; });
    const collect = () => {
      const out = { ...p, v: 1, name: name.value.trim(), audioDevice: device.value.trim(), software: software.value.trim(), sampleRate: Number(rate.value),
        midi: midi.value.split('\n').map(x => x.trim()).filter(Boolean), requireNeedleUpHum: needle.checked };
      if (!out.requireNeedleUpHum) delete out.requireNeedleUpHum;
      return out;
    };
    const check = () => {
      const out = collect(), v = validatePreset(out);
      err.replaceChildren(...v.errors.map(e => h('p', { text: e.message })));
      return v.ok ? out : null;
    };
    let disabledBeforeSave = null;
    const setBusy = busy => {
      if (busy) {
        if (disabledBeforeSave) return;
        disabledBeforeSave = new Map([...form.querySelectorAll('input,select,textarea,button')].map(control => [control, !!control.disabled]));
        for (const control of disabledBeforeSave.keys()) control.disabled = true;
      } else {
        for (const [control, disabled] of disabledBeforeSave || []) control.disabled = disabled;
        disabledBeforeSave = null;
      }
    };
    return { form, collect, check, setBusy, showError: text => { err.textContent = text; } };
  }

  async function editPreset(preset, { isNew = false } = {}) {
    if (preset.readOnly || validatePreset(preset).readOnly) { setNotice('This preset needs a newer DeckChek version and cannot be edited here.', 'warn'); return; }
    const formPreset = preset.builtin ? duplicatePreset(preset) : preset;
    const f = presetForm(formPreset);
    let saving = false;
    const title = isNew ? 'New preset' : preset.builtin ? 'Edit a copy of this built-in preset' : 'Edit preset';
    const dlg = openDialog({
      title, body: f.form, canClose: () => !saving,
      actions: close => [
        h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'save', text: 'Save preset', onclick: async e => {
          if (saving || st.disposed || !dlg.dlg.isConnected) return;
          const button = e.currentTarget;
          const out = f.check();
          if (!out) return;
          const submitted = structuredClone(out);
          saving = true; button.disabled = true; f.setBusy(true);
          try {
            await savePreset({ ...submitted, id: preset.builtin || isNew ? undefined : preset.id });
            saving = false;
            if (!st.disposed && dlg.dlg.isConnected) { close(true); toast(`Saved "${submitted.name}".`, { type: 'success', timeout: 2500 }); }
          } catch (error) { if (!st.disposed && dlg.dlg.isConnected) f.showError(`Could not save the preset: ${friendly(error)}`); }
          finally { saving = false; f.setBusy(false); button.disabled = false; }
        } }),
        h('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel', onclick: () => close(null) })],
    });
    f.form.addEventListener('submit', e => e.preventDefault());
    f.form.querySelector('input')?.focus();
    return dlg.done;
  }

  async function newFromGear() {
    await ensureLibrary();
    const byCat = (...cats) => (lib.profiles || []).filter(p => cats.includes(p.category));
    const sel = (id, label, list, blank = 'None') => h('div', { class: 'field' }, h('label', { class: 'field-label', for: id, text: label }),
      h('select', { id }, h('option', { value: '', text: blank }), ...list.map(p => h('option', { value: p.id, text: p.model || p.id }))));
    // Control vinyl choices come from the test-media library (the same list as the DVS and scratch forms), timecode discs only.
    try { await ensureMedia(); } catch { /* the list below is then just "Not sure yet" */ }
    const media = [['', 'Not sure yet'], ...listMedia(mediaState.entries, { kind: 'timecode' }).map(e => [e.id, e.name])];
    const body = h('div', { class: 'field-grid' },
      sel('pg-g-tt', 'Turntable', byCat('turntable')), sel('pg-g-mixer', 'Mixer', byCat('mixer')),
      sel('pg-g-if', 'Audio interface', byCat('audio-interface')), sel('pg-g-ctl', 'Controller', byCat('controller')),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'pg-g-media', text: 'Control vinyl' }), h('select', { id: 'pg-g-media' }, ...media.map(([v, t]) => h('option', { value: v, text: t })))),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'pg-g-decks', text: 'Number of decks' }), h('select', { id: 'pg-g-decks' }, ...[1, 2, 3, 4].map(n => h('option', { value: String(n), text: String(n), selected: n === 2 })))));
    let chosen = null;
    const dlg = openDialog({
      title: 'Create a preset from my gear', body,
      actions: close => [
        h('button', { type: 'button', class: 'btn btn-primary', text: 'Continue', onclick: () => {
          const v = id => body.querySelector(`#${id}`).value;
          const byId = Object.fromEntries((lib.profiles || []).map(p => [p.id, p]));
          chosen = presetFromEquipment({ turntables: v('pg-g-tt') ? [v('pg-g-tt')] : [], mixer: v('pg-g-mixer') || undefined, interface: v('pg-g-if') || undefined, controller: v('pg-g-ctl') || undefined, media: v('pg-g-media') || undefined, decks: Number(v('pg-g-decks')) }, byId, { media: mediaState.entries });
          close(true);
        } }),
        h('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel', onclick: () => close(null) })],
    });
    if (await dlg.done && chosen) await editPreset(chosen, { isNew: true });
  }

  async function importPreset() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    let parsed;
    try { parsed = parsePresetJson(await readTextFile(file, { maxBytes: MAX_PRESET_BYTES, label: 'Preset file' })); }
    catch (e) { setNotice(`That preset could not be imported: ${friendly(e)}`, 'error'); return; }
    if (!parsed.ok) { setNotice(`That preset could not be imported: ${parsed.errors.map(e => e.message).join(' ')}`, 'error'); return; }
    try { await savePreset({ ...parsed.preset, id: undefined, builtin: false }); setNotice(`Imported "${parsed.preset.name}".`); }
    catch (e) { retryImportedPreset({ ...parsed.preset, id: undefined, builtin: false }, e); }
  }

  function retryImportedPreset(preset, failure) {
    const error = h('p', { role: 'alert', text: `The imported preset was not saved: ${friendly(failure)}` });
    let saving = false;
    const dlg = openDialog({
      title: 'Imported preset not saved', canClose: () => !saving,
      body: h('div', {}, h('p', { text: `The imported draft "${preset.name}" is still available here. Retry saving it when storage is available.` }), error),
      actions: close => [
        h('button', { type: 'button', class: 'btn btn-primary', id: 'pg-retry-import', text: 'Retry saving preset', onclick: async e => {
          if (saving || st.disposed || !dlg.dlg.isConnected) return;
          const button = e.currentTarget; saving = true; button.disabled = true;
          try {
            await savePreset(preset); saving = false;
            if (!st.disposed && dlg.dlg.isConnected) { close(true); setNotice(`Imported "${preset.name}".`); }
          } catch (e) { if (dlg.dlg.isConnected) error.textContent = `The imported preset was not saved: ${friendly(e)}`; }
          finally { saving = false; button.disabled = false; }
        } }),
        h('button', { type: 'button', class: 'btn btn-secondary', text: 'Discard unsaved import', onclick: () => close(null) }),
      ],
    });
  }

  const exportPreset = preset => { const { id, builtin, readOnly, ...body } = preset; download(`${preset.name.replace(/[^\w.-]+/g, '-')}.deckchek-preset.json`, exportPresetJson(body), 'application/json'); };

  async function deletePreset(preset) {
    if (!await confirmDialog({ title: 'Delete this preset?', body: `"${preset.name}" will be removed. Your check history stays.`, confirmLabel: 'Delete preset' })) return;
    try { await api.deletePreset(preset.id); await loadPresets(); } catch (e) { setNotice(`Could not delete: ${friendly(e)}`, 'error'); }
  }

  // ------------------------------------------------------------ rendering: tabs
  function renderTabs() {
    tabs.replaceChildren(...TABS.map(([id, label]) => h('button', {
      type: 'button', class: 'tab', role: 'tab', id: `pg-tab-${id}`, 'aria-selected': String(st.tab === id), 'aria-controls': 'pg-panel', tabindex: st.tab === id ? '0' : '-1', 'data-tab': id, text: label,
      onclick: () => selectTab(id),
      onkeydown: e => {
        const i = TABS.findIndex(([t]) => t === st.tab);
        const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : -1;
        if (next < 0) return;
        e.preventDefault(); selectTab(TABS[next][0], true);
      },
    })));
    panel.setAttribute('aria-labelledby', `pg-tab-${st.tab}`);
  }
  function selectTab(id, focusTab = false) {
    st.tab = id; renderTabs();
    if (id === 'history') loadHistory(); else render();
    if (focusTab) q(`#pg-tab-${id}`)?.focus();
  }

  function render() {
    if (st.disposed) return;
    storageStatus.replaceChildren();
    if (st.presetError) storageStatus.append(h('div', { class: 'banner banner-warn', id: 'pg-presets-unavailable', role: 'alert' },
      h('span', { class: 'banner-text', text: st.presetError }),
      h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'pg-retry-presets', text: 'Retry loading presets', disabled: st.loading,
        onclick: () => { if (!st.loading && !st.disposed) loadPresets(); } })));
    renderTabs();
    panel.replaceChildren();
    if (st.tab === 'history') { renderHistory(); return; }
    if (st.tab === 'presets') { renderPresets(); return; }
    renderCheck();
  }

  // ------------------------------------------------------------ rendering: check
  function presetChips(preset) {
    if (preset.readOnly) return h('p', { class: 'hint', text: 'This preset needs a newer DeckChek version. You can view its name, export it or delete it; its contents remain unchanged.' });
    const items = [
      ['Interface', preset.audioDevice], ['Software', preset.software || 'Not set'], ['Rate', `${preset.sampleRate} Hz`],
      ['Decks', preset.decks.map(d => `${d.id} (inputs ${pairText(d.input)})`).join(', ')],
      ...(preset.mixer ? [['Mixer', preset.mixer]] : []),
    ];
    return h('ul', { class: 'pg-chips', 'aria-label': 'Rig summary' }, ...items.map(([k, v]) => h('li', { class: 'pg-fact' }, h('span', { class: 'pg-fact-k', text: k }), h('span', { class: 'pg-fact-v', text: v }))));
  }

  function pickerRow(preset, running) {
    const sel = h('select', { id: 'pg-preset', disabled: running || S.saving || !st.presets.length, onchange: e => choosePreset(e.target.value) },
      ...(!preset ? [h('option', { value: '', text: 'Choose a preset', selected: true, disabled: true })] : []),
      ...(preset && !st.presets.some(p => p.id === preset.id) ? [h('option', { value: preset.id, text: `${preset.name} (used for this check)`, selected: true, disabled: true })] : []),
      ...st.presets.map(p => h('option', { value: p.id, text: `${p.name}${p.builtin ? ' (built in)' : ''}`, selected: p.id === preset?.id })));
    return h('div', { class: 'pg-picker' }, h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'pg-preset', text: 'Your rig' }), sel),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Edit presets', disabled: running, onclick: () => selectTab('presets') }));
  }

  function renderCheck() {
    if (st.loading) { panel.append(h('p', { class: 'hint', text: 'Loading your presets…' })); return; }
    const preset = S.phase === 'running' || S.phase === 'done' ? S.preset : currentPreset();
    if (!preset) {
      if (st.presetError) panel.append(pickerRow(null, false), h('p', { class: 'hint', text: 'Saved presets have not been loaded. Retry above before deciding whether they are missing.' }));
      else panel.append(emptyState());
      return;
    }
    if (preset.readOnly) { panel.append(pickerRow(preset, false), presetChips(preset)); return; }
    const running = S.phase === 'running', done = S.phase === 'done';
    const plan = running || done ? S.plan : buildPlan(preset, { skip: [...st.skip] });
    panel.append(pickerRow(preset, running));
    if (!native) panel.append(h('div', { class: 'banner banner-device banner-device-info', id: 'pg-browser-note' }, h('span', { class: 'banner-device-icon', html: icon('info', { size: 20 }) }),
      h('span', { class: 'banner-text' }, h('strong', { text: 'Browser preview' }), h('span', { text: 'Most checks read your audio interface, drivers and DJ software, which only the Windows desktop app can do. You can still try the screen; unavailable checks will say so.' }))));
    if (done && S.run) panel.append(verdictBanner(S.run));
    else if (!running) panel.append(startCard(preset, plan));
    if (running) panel.append(progressCard(plan));
    if (S.error) panel.append(h('div', { class: 'banner banner-warn', role: 'alert' }, h('span', { class: 'banner-text', text: S.error })));
    if (S.prompt) panel.append(promptCard(S.prompt));
    if (done && S.run) panel.append(fixFirstCard(S.run));
    panel.append(checklistCard(plan, { running, done }));
    if (done && S.compare) panel.append(compareCard(S.compare, 'Compared with your last check'));
    if (done) panel.append(afterActions());
    if (S.prompt && st.focusPrompt !== S.prompt) { st.focusPrompt = S.prompt; panel.querySelector('.pg-prompt .btn-primary')?.focus(); }
  }

  function emptyState() {
    return h('div', { class: 'card pg-empty' }, h('h2', { class: 'card-title', text: 'Create your first rig' }),
      h('p', { text: 'A rig tells the check which interface, decks and control vinyl to test. It takes three fields.' }),
      h('div', { class: 'pg-actions' },
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', text: 'Create a preset', onclick: () => editPreset({ v: 1, name: '', audioDevice: '', software: '', sampleRate: 48000, decks: [{ id: 'A', input: [0, 1], format: TIMECODE_FORMATS[0].name, mixerChannel: '1' }], midi: [] }, { isNew: true }) }),
        h('button', { type: 'button', class: 'btn btn-secondary btn-lg', text: 'Start from my gear', onclick: newFromGear })));
  }

  function startCard(preset, plan) {
    const enabled = plan.filter(s => s.enabled);
    const start = h('button', { type: 'button', class: 'btn btn-primary btn-xl pg-start', id: 'pg-start', disabled: !enabled.length, onclick: () => startRun() },
      h('span', { html: icon('play', { size: 20 }) }), h('span', { text: 'Start pre-gig check' }), h('kbd', { text: 'Ctrl+G' }));
    return h('div', { class: 'card pg-start-card' },
      h('div', { class: 'pg-start-row' }, h('div', { class: 'pg-start-copy' }, h('h2', { class: 'card-title', text: preset.name }), presetChips(withChosenPairs(preset))),
        h('div', { class: 'pg-start-action' }, start, h('span', { class: 'pg-estimate', id: 'pg-estimate', text: enabled.length ? `${estimateText(plan)}. Keep a track playing on each deck.` : 'Tick at least one check below.' }))),
      pairRow(preset, false),
      preset.decks.length ? h('p', { class: 'hint', text: 'Put the needle on the control vinyl and let it play while the check runs.' }) : null);
  }

  function progressCard(plan) {
    const total = plan.filter(s => s.enabled).length;
    const done = [...S.steps.values()].filter(v => v.result && v.state !== 'pending' && v.state !== 'running').length;
    const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
    const label = S.rerunning ? 'Re-running' : 'Checking your rig';
    return h('div', { class: 'card pg-progress' },
      h('div', { class: 'pg-progress-row' },
        h('div', {}, h('h2', { class: 'card-title', text: label }), h('p', { class: 'pg-progress-text', id: 'pg-progress-text', text: `${Math.min(done, total)} of ${total} checks finished` })),
        h('div', { class: 'pg-timer-box' }, h('span', { class: 'pg-timer', id: 'pg-timer', 'aria-hidden': 'true', text: '0:00' }),
          h('button', { type: 'button', class: 'btn btn-secondary', id: 'pg-cancel', onclick: () => ctl.cancel() }, h('span', { text: 'Cancel' }), h('kbd', { text: 'Esc' })))),
      h('div', { class: 'pg-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Check progress' }, h('div', { class: 'pg-bar-fill', style: `width:${pct}%` })));
  }

  function promptCard(prompt) {
    if (prompt.kind === 'needleUp') {
      return h('div', { class: 'card pg-prompt', role: 'group', 'aria-label': 'Needle lift' },
        h('h2', { class: 'card-title', text: `Lift the needle on deck ${prompt.deck}` }),
        h('p', { text: 'Lift the needle off the record for 3 seconds so hum is measured on silence. Ready?' }),
        h('div', { class: 'pg-actions' }, h('button', { type: 'button', class: 'btn btn-primary', 'data-answer': 'yes', onclick: () => ctl.answer(true) }, h('span', { text: 'Needle is up' }), h('kbd', { text: 'Y' })),
          h('button', { type: 'button', class: 'btn btn-secondary', 'data-answer': 'skip', onclick: () => ctl.answer(false) }, h('span', { text: 'Skip' }), h('kbd', { text: 'S' }))));
    }
    return h('div', { class: 'card pg-prompt', role: 'group', 'aria-label': 'Headphone cue' },
      h('h2', { class: 'card-title', text: 'Headphone cue' }),
      h('p', { text: 'Cue deck A in your headphones. Do you hear it clearly in both ears?' }),
      h('div', { class: 'pg-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', 'data-answer': 'yes', onclick: () => ctl.answer('yes') }, h('span', { text: 'Yes' }), h('kbd', { text: 'Y' })),
        h('button', { type: 'button', class: 'btn btn-secondary', 'data-answer': 'no', onclick: () => ctl.answer('no') }, h('span', { text: 'No' }), h('kbd', { text: 'N' })),
        h('button', { type: 'button', class: 'btn btn-ghost', 'data-answer': 'skip', onclick: () => ctl.answer('skip') }, h('span', { text: 'Skip' }), h('kbd', { text: 'S' }))));
  }

  function verdictBanner(run) {
    const v = verdictView(run);
    const icn = v.tone === 'pass' ? 'pass' : v.tone === 'fail' ? 'fail' : v.tone === 'info' ? 'info' : 'warn';
    const dur = `${durationText(run.durationMs)}${run.manualMs ? ` (plus ${durationText(run.manualMs)} answering prompts)` : ''}`;
    return h('div', { class: `pg-verdict pg-verdict-${v.level}`, id: 'pg-verdict', 'data-verdict': v.verdict, 'data-level': v.level, role: 'status', 'aria-live': 'polite' },
      h('span', { class: 'pg-verdict-icon', html: icon(icn, { size: 40 }) }),
      h('div', { class: 'pg-verdict-text' },
        h('div', { class: 'pg-verdict-head' }, h('span', { class: 'pg-verdict-word', text: v.title }), h('span', { class: 'pg-verdict-dur', text: `Took ${dur}` })),
        h('p', { class: 'pg-verdict-copy', text: v.copy }),
        ...v.notices.map(n => h('p', { class: 'pg-verdict-note', 'data-notice': 'coming-next', text: n })),
        run.rollup?.partial ? h('p', { class: 'pg-verdict-note', text: 'Partial check: some checks only run in the Windows desktop app.' }) : null,
        h('p', { class: 'pg-verdict-note', text: S.saving ? 'Saving to History…' : S.saved ? 'Saved to History.' : 'Not saved to History. Keep this result open to retry saving, or save it as a file.' })));
  }

  function fixFirstCard(run) {
    const problems = (run.results || []).filter(r => r.state === 'fail' || r.state === 'error' || r.state === 'warn');
    if (!problems.length) return h('span', { hidden: true });
    const order = { fail: 0, error: 1, warn: 2 };
    problems.sort((a, b) => order[a.state] - order[b.state]);
    return h('div', { class: 'card pg-fixfirst', id: 'pg-fixfirst' }, h('h2', { class: 'card-title', text: problems.length === 1 ? 'Fix this first' : `Fix these ${problems.length}, in this order` }),
      h('ol', { class: 'pg-fixlist' }, ...problems.map(r => h('li', { class: `pg-fixitem pg-fixitem-${r.state}`, 'data-step': r.stepId },
        h('div', { class: 'pg-fixhead' }, stateBadge(describeStep({ state: r.state, result: r })), h('strong', { text: r.label })),
        h('p', { class: 'pg-fixsum', text: r.summary }),
        h('div', { class: 'pg-fixbtns' }, ...fixesFor(r).map(b => fixButton(b, r)),
          fixesFor(r).some(b => b.kind === 'retry') ? null : h('div', { class: 'pg-fix' }, h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-fix': 'retry', 'aria-label': `Check ${r.label} again`, onclick: () => rerunChecks([r.stepId]) }, h('span', { html: icon('refresh', { size: 16 }) }), h('span', { text: 'Check again' }))))))));
  }

  // The engine's own fixes plus the cross-links to Hum hunter / Stylus / Latency (only for features that are on).
  const fixesFor = r => withCrossFixes(fixButtons(r), r.stepId, r.state, isEnabled);

  function fixButton(b, r) {
    const wrap = h('div', { class: 'pg-fix' });
    const primary = b.kind !== 'info';
    const label = b.kind === 'retry' ? 'Check again' : b.label;
    const run = () => {
      if (b.kind === 'retry') return rerunChecks([r.stepId]);
      if (b.kind === 'preempt') return rerunChecks([r.stepId], { preempt: true });
      if (b.kind === 'navigate' && b.to) return navigateTo(b.to);
      if (b.kind === 'settings' && b.target) return openWindowsSettings(b.target, { invoke: nativeInvoke });
      return null;
    };
    if (b.kind === 'info') {
      wrap.append(h('p', { class: 'pg-fixtext' }, h('strong', { text: `${b.label}. ` }), b.text));
    } else {
      wrap.append(h('p', { class: 'pg-fixtext', text: b.text }),
        h('button', { type: 'button', class: `btn ${primary ? 'btn-secondary' : 'btn-ghost'} btn-sm`, 'data-fix': b.kind, text: label, onclick: run }));
    }
    return wrap;
  }

  function checklistCard(plan, { running, done }) {
    const rows = plan.map(step => {
      const entry = S.steps.get(step.id);
      if (!running && !done) return idleRow(step);
      return resultRow(step, describeStep(entry || { state: 'pending' }), entry?.result, { running });
    });
    const head = running ? 'Checklist' : done ? 'All checks' : 'What will be checked';
    return h('div', { class: 'card pg-checklist-card' }, h('h2', { class: 'card-title', text: head }), h('ul', { class: 'pg-checklist', id: 'pg-checklist', 'aria-label': 'Check steps' }, ...rows));
  }

  function idleRow(step) {
    const id = `pg-step-${step.id.replace(':', '-')}`;
    const input = h('input', { type: 'checkbox', id, checked: step.enabled, 'data-step': step.id, onchange: e => { if (e.target.checked) st.skip.delete(step.id); else st.skip.add(step.id); render(); } });
    return h('li', { class: 'pg-row pg-row-idle', 'data-step': step.id },
      h('label', { class: 'pg-row-check', for: id }, input, h('span', { class: 'pg-row-label', text: step.label }),
        step.manual ? h('span', { class: 'pg-row-tag', text: 'You answer a question' }) : step.required ? h('span', { class: 'pg-row-tag', text: 'Needed to say "ready"' }) : null));
  }

  function resultRow(step, view, result, { running }) {
    const open = st.expanded.has(step.id);
    const rows = result ? evidenceRows(result.evidence) : [];
    const canRerun = !running && result && (result.state !== 'skipped' || !['input-pair', 'needs-desktop', 'user'].includes(result.reason)) && result.state !== 'unsupported';
    return h('li', { class: `pg-row pg-row-${view.state}${view.notMeasured ? ' pg-row-muted' : ''}`, 'data-step': step.id, 'data-state': view.state, 'data-reason': result?.reason || null },
      h('div', { class: 'pg-row-main' },
        h('div', { class: 'pg-row-state' }, stateBadge(view)),
        h('div', { class: 'pg-row-body' }, h('div', { class: 'pg-row-label', text: step.label }),
          view.headline ? h('div', { class: 'pg-row-sum', text: view.headline }) : null,
          view.detail ? h('div', { class: 'pg-row-detail', text: view.detail }) : null),
        h('div', { class: 'pg-row-actions' },
          canRerun ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-rerun': step.id, 'aria-label': `Re-run ${step.label}`, onclick: () => rerunChecks([step.id]) }, h('span', { html: icon('refresh', { size: 16 }) }), h('span', { text: 'Re-run' })) : null,
          rows.length ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-expanded': String(open), 'aria-label': `${open ? 'Hide' : 'Show'} details for ${step.label}`, onclick: () => { if (open) st.expanded.delete(step.id); else st.expanded.add(step.id); render(); } }, h('span', { text: open ? 'Hide' : 'Details' })) : null)),
      open && rows.length ? h('dl', { class: 'pg-evidence' }, ...rows.flatMap(r => [h('dt', { text: r.label }), h('dd', { text: r.value })])) : null);
  }

  function afterActions() {
    const run = S.run;
    const targets = rerunTargets(S.run);
    return h('div', { class: 'pg-after' },
      !S.saved ? h('button', { type: 'button', class: 'btn btn-primary', id: 'pg-retry-save', disabled: S.saving, text: S.saving ? 'Saving to History…' : 'Retry saving to History', onclick: () => { if (!st.disposed && S.run === run) return ctl.retrySave(); } }) : null,
      h('button', { type: 'button', class: 'btn btn-primary', id: 'pg-rerun-failed', disabled: S.saving || !targets.length, onclick: () => rerunChecks(targets) }, h('span', { text: 'Re-run problem checks' }), h('kbd', { text: 'Ctrl+R' })),
      h('button', { type: 'button', class: 'btn btn-secondary', id: 'pg-run-again', disabled: S.saving, onclick: () => startRun() }, h('span', { text: 'Run everything again' }), h('kbd', { text: 'Ctrl+G' })),
      h('button', { type: 'button', class: 'btn btn-secondary', id: 'pg-export', onclick: () => exportRun() }, h('span', { html: icon('download', { size: 16 }) }), h('span', { text: 'Save result' }), h('kbd', { text: 'Ctrl+E' })),
      pdfExportEnabled() ? h('button', { type: 'button', class: 'btn btn-secondary', id: 'pg-export-pdf', onclick: e => exportRunPdf(e.currentTarget) }, h('span', { html: icon('download', { size: 16 }) }), h('span', { text: 'Export PDF' })) : null,
      h('button', { type: 'button', class: 'btn btn-ghost', id: 'pg-back', disabled: S.saving, onclick: async () => { if (await allowResultReplacement()) { ctl.reset(); render(); } } }, h('span', { text: 'Done' })));
  }

  function compareCard(c, title) {
    return h('div', { class: 'card pg-compare', id: 'pg-compare' }, h('h2', { class: 'card-title', text: title }),
      h('p', { class: 'pg-compare-head', text: c.headline }),
      c.lines.length ? h('ul', { class: 'pg-compare-list' }, ...c.lines.map(l => h('li', { class: `pg-compare-${l.trend}`, 'data-trend': l.trend },
        h('span', { class: 'pg-compare-trend', text: l.trend === 'better' ? 'Better' : 'Worse' }), h('span', { text: ` ${l.text}` })))) : null,
      c.added.length ? h('p', { class: 'hint', text: `New this time: ${c.added.join(', ')}.` }) : null,
      c.removed.length ? h('p', { class: 'hint', text: `Not run this time: ${c.removed.join(', ')}.` }) : null);
  }

  // ------------------------------------------------------------ run control
  async function allowResultReplacement() {
    if (st.disposed || st.replacing || S.saving || S.phase === 'running') return false;
    if (!S.run || S.saved) return true;
    const run = S.run;
    st.replacing = true;
    try {
      const accepted = await confirmDialog({ title: 'Discard this unsaved result?',
        body: 'This check has not been saved to History. Keep it open to retry saving, or save the result as a file before replacing it.',
        confirmLabel: 'Discard result' });
      return accepted && !st.disposed && !S.saving && S.run === run && S.phase === 'done';
    } finally { st.replacing = false; }
  }

  async function choosePreset(id, { showCheck = false } = {}) {
    if (st.disposed || S.saving || S.phase === 'running') return;
    if (id !== st.presetId) {
      if (!await allowResultReplacement()) { render(); return; }
      st.presetId = id; storageSet(LAST_PRESET_KEY, id); st.skip.clear();
      if (S.phase === 'done') ctl.reset();
    }
    if (showCheck) selectTab('check'); else render();
  }

  async function rerunChecks(ids, options) {
    if (!ids.length || !await allowResultReplacement()) return;
    return ctl.rerun(ids, options);
  }

  async function startRun() {
    const preset = currentPreset();
    if (!preset || preset.readOnly || S.phase === 'running' || S.saving || st.loading || st.disposed) return;
    if (!preset.decks?.length) return;
    if (!await allowResultReplacement() || currentPreset() !== preset) return;
    const chosen = withChosenPairs(preset);
    const used = chosen.decks.map(d => d.input[0]);
    if (new Set(used).size !== used.length) { setNotice('Two decks are set to the same inputs. Choose a different input pair for one of them in the Inputs boxes, then start again.', 'warn'); return; }
    st.expanded.clear(); st.focusPrompt = null;
    setNotice(null);
    ctl.start(chosen, { skip: [...st.skip] });
    startTimer();
  }

  function startTimer() {
    clearInterval(st.timer);
    st.timer = setInterval(() => {
      const el = q('#pg-timer');
      if (!el || S.phase !== 'running') { if (S.phase !== 'running') { clearInterval(st.timer); st.timer = null; } return; }
      const s = Math.floor((Date.now() - S.startedMs) / 1000);
      el.textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`;
    }, 500);
  }

  function exportRun(run = S.run) {
    if (!run || st.disposed) return;
    const text = JSON.stringify({ deckchek: 'pre-gig-result', preset: run.presetName, startedAt: run.startedAt, verdict: run.verdict, results: run.results.map(({ stepId, state, summary, evidence, fix }) => ({ stepId, state, summary, evidence, fix })) }, null, 2);
    download(`pre-gig-${run.startedAt.slice(0, 16).replace(/[:T]/g, '-')}.json`, text, 'application/json');
    toast('Saved the check result as a file.', { type: 'success', timeout: 2500 });
  }

  /** PDF of the finished check (FS-03 kind "pregig"); the print dialog is the fallback in the browser preview. */
  async function exportRunPdf(button) {
    const run = S.run, preset = S.preset;
    if (!run) { toast('Run a check first, then export it.'); return; }
    const isCurrent = () => !st.disposed && S.phase === 'done' && S.run === run;
    await ensurePregigPrintable();
    if (!isCurrent()) return { stale: true };
    return exportPdfWithFeedback(PREGIG_KIND, pregigPrintData(run, { device: preset?.audioDevice || '' }), { button, isCurrent, htmlFallback: () => exportRun(run) });
  }
  const stopFeatureListener = onFeatureChange(({ name } = {}) => { if (name === 'pdfExport' && active.screen?.def.id === 'pregig') render(); });

  // announce each finished step once, and the verdict once
  let announced = new Set(), lastPhase = 'idle';
  const stopControllerListener = ctl.subscribe(state => {
    for (const [id, v] of state.steps) {
      if (!v.result || v.state === 'pending' || v.state === 'running') continue;
      const key = `${state.startedMs}:${id}:${v.state}`;
      if (!announced.has(key)) { announced.add(key); announce(`${v.result.label}: ${describeStep(v).word}`); }
    }
    if (state.phase === 'done' && lastPhase === 'running' && state.run) { const v = verdictView(state.run); announce(`${v.title}. ${v.copy}`, { assertive: v.level === 'red' }); }
    lastPhase = state.phase;
    if (active.screen?.def.id === 'pregig') render();
  });

  // ------------------------------------------------------------ rendering: presets
  function renderPresets() {
    panel.append(h('div', { class: 'pg-preset-bar' },
      h('button', { type: 'button', class: 'btn btn-primary', id: 'pg-new', onclick: () => editPreset({ v: 1, name: '', audioDevice: '', software: '', sampleRate: 48000, decks: [{ id: 'A', input: [0, 1], format: TIMECODE_FORMATS[0].name, mixerChannel: '1' }], midi: [] }, { isNew: true }) }, h('span', { html: icon('plus', { size: 16 }) }), h('span', { text: 'New preset' })),
      h('button', { type: 'button', class: 'btn btn-secondary', id: 'pg-gear', onclick: newFromGear, text: 'From my gear' }),
      h('button', { type: 'button', class: 'btn btn-secondary', id: 'pg-import', onclick: importPreset }, h('span', { html: icon('upload', { size: 16 }) }), h('span', { text: 'Import' }))));
    if (st.problems.length) panel.append(h('div', { class: 'banner banner-warn' }, h('span', { class: 'banner-text', text: `${st.problems.length} built-in preset(s) could not be loaded.` })));
    panel.append(h('ul', { class: 'pg-preset-list' }, ...st.presets.map(p => h('li', { class: 'card pg-preset', 'data-preset': p.id },
      h('div', { class: 'pg-preset-main' }, h('h2', { class: 'card-title', text: p.name }), h('span', { class: 'pg-preset-tag', text: p.builtin ? 'Built in' : 'Yours' }), presetChips(p)),
      h('div', { class: 'pg-preset-actions' },
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Use for the check', disabled: S.saving || S.phase === 'running', onclick: () => choosePreset(p.id, { showCheck: true }) }),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-act': 'edit', text: p.builtin ? 'Edit a copy' : 'Edit', disabled: p.readOnly, onclick: () => editPreset(p) }),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-act': 'duplicate', text: 'Duplicate', disabled: p.readOnly, onclick: async () => { if (p.readOnly) return; try { await savePreset({ ...duplicatePreset(p), builtin: false }); } catch (e) { setNotice(friendly(e), 'error'); } } }),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-act': 'export', text: 'Export', onclick: () => exportPreset(p) }),
        !p.builtin ? h('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm', 'data-act': 'delete', text: 'Delete', onclick: () => deletePreset(p) }) : null)))));
  }

  // ------------------------------------------------------------ rendering: history
  async function loadHistory() {
    if (st.disposed) return;
    const request = ++st.historyLoad, current = () => !st.disposed && request === st.historyLoad;
    st.historyLoading = true; st.historyCompare = null; render();
    try {
      const rows = await api.listRuns(null, 50);
      if (!current()) return;
      if (!Array.isArray(rows)) throw new Error();
      st.history = rows; st.historyError = null; st.historyOpen.clear();
    } catch {
      if (current()) st.historyError = 'History is unavailable. Previously loaded results may be out of date. Your stored checks were not replaced.';
    } finally { if (current()) { st.historyLoading = false; render(); } }
  }

  function renderHistory() {
    if (st.historyError) panel.append(h('div', { class: 'banner banner-warn', id: 'pg-history-unavailable', role: 'alert' }, h('span', { class: 'banner-text', text: st.historyError }),
      h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'pg-retry-history', text: 'Retry loading history', disabled: st.historyLoading, onclick: () => { if (!st.historyLoading) loadHistory(); } })));
    if (st.historyLoading || (st.history == null && !st.historyError)) { panel.append(h('p', { class: 'hint', text: 'Loading history…' })); return; }
    if (st.history == null || (st.historyError && !st.history.length)) return;
    if (!st.history.length) { panel.append(h('div', { class: 'card pg-empty', id: 'pg-history-empty' }, h('h2', { class: 'card-title', text: 'No checks yet' }), h('p', { text: 'Finished checks appear here after they have been saved successfully.' }),
      h('button', { type: 'button', class: 'btn btn-primary', text: 'Run a check', onclick: () => selectTab('check') }))); return; }
    if (st.historyCompare) panel.append(compareCard(st.historyCompare, 'Compared with the latest check'));
    panel.append(h('ul', { class: 'pg-history', id: 'pg-history' }, ...st.history.map((r, i) => {
      const [tone, word] = VERDICT_CHIP[r.verdict] || ['info', r.verdict];
      const detail = st.historyOpen.get(r.id);
      const badge = document.createElement('span'); badge.innerHTML = chip(tone, word);
      return h('li', { class: 'card pg-hist', 'data-run': r.id },
        h('div', { class: 'pg-hist-main' }, badge.firstElementChild,
          h('div', { class: 'pg-hist-body' }, h('strong', { text: (r.notes || '').replace(/^Preset: /, '') || 'Pre-gig check' }),
            h('span', { class: 'pg-hist-meta', text: `${whenText(r.startedAt)} · ${durationText(r.durationMs)} · ${r.failCount} failed, ${r.warnCount} warnings` })),
          h('div', { class: 'pg-hist-actions' },
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-act': 'details', 'aria-expanded': String(!!detail), text: detail ? 'Hide' : 'Details', onclick: () => toggleHistory(r) }),
            i > 0 ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-act': 'compare', text: 'Compare with latest', onclick: () => compareHistory(r) }) : null,
            h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-act': 'rerun', text: 'Re-run', onclick: () => rerunFromHistory(r) }))),
        detail ? h('ul', { class: 'pg-hist-steps' }, ...detail.steps.map(s => h('li', { 'data-state': s.state }, stateBadge(describeStep({ state: s.state, result: { reason: s.evidence?.reason || null, summary: s.summary } })), h('span', { text: ` ${stepLabel(s.stepId)}: ${s.summary}` })))) : null);
    })));
  }

  async function toggleHistory(r) {
    if (st.historyOpen.has(r.id)) st.historyOpen.delete(r.id);
    else { try { st.historyOpen.set(r.id, await api.getRun(r.id)); } catch (e) { setNotice(friendly(e), 'error'); } }
    render();
  }
  async function compareHistory(r) {
    try {
      const [a, b] = await Promise.all([api.getRun(r.id), api.getRun(st.history[0].id)]);
      st.historyCompare = compareView(diffRuns({ verdict: a.run.verdict, steps: a.steps }, { verdict: b.run.verdict, steps: b.steps }), stepLabel);
    } catch (e) { setNotice(friendly(e), 'error'); }
    render();
  }
  async function rerunFromHistory(r) {
    if (!await allowResultReplacement()) return;
    const preset = st.presets.find(p => runMatchesPreset(r, p)) || currentPreset();
    if (preset) { st.presetId = preset.id; storageSet(LAST_PRESET_KEY, preset.id); }
    ctl.reset(); st.tab = 'check'; render(); startRun();
  }

  // ------------------------------------------------------------ keyboard (this screen only)
  function onKey(e) {
    if (st.disposed || active.screen?.def.id !== 'pregig' || !isEnabled('pregig') || document.querySelector('dialog[open]')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && !e.shiftKey && !e.altKey && k === 'g') { e.preventDefault(); if (S.phase !== 'running' && currentPreset()) { st.tab = 'check'; render(); startRun(); } return; }
    if (ctrl && !e.shiftKey && !e.altKey && k === 'r') { e.preventDefault(); const t = S.run ? rerunTargets(S.run) : []; if (S.phase === 'done' && t.length) rerunChecks(t); return; }
    if (S.prompt && !ctrl && !e.altKey && !isTypingTarget(e.target)) {
      if (S.prompt.kind === 'headphones') {
        if (k === 'y') { e.preventDefault(); ctl.answer('yes'); } else if (k === 'n') { e.preventDefault(); ctl.answer('no'); } else if (k === 's') { e.preventDefault(); ctl.answer('skip'); }
      } else if (k === 'y') { e.preventDefault(); ctl.answer(true); } else if (k === 's') { e.preventDefault(); ctl.answer(false); }
    }
  }
  const isTypingTarget = t => t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(t.type)));
  document.addEventListener('keydown', onKey);

  // ------------------------------------------------------------ lifecycle
  render();
  ensureLibrary().catch(() => {}).then(loadPresets);

  return {
    onShow() { if (!st.presets.length && !st.loading) loadPresets(); else render(); },
    onHide() {},
    /** Esc cancels a running check. */
    onEscape() { if (S.phase === 'running') { ctl.cancel(); return true; } return false; },
    onExport() { if (S.run) exportRun(); else toast('Run a check first, then save the result.'); },
    async onSave() {
      if (st.disposed) return;
      if (S.phase !== 'done' || !S.run) { toast('Finish a check before saving it to History.'); return; }
      if (S.saving) { toast('Saving to History…'); return; }
      if (S.saved) { toast('This result is saved to History.'); return; }
      const run = S.run, saved = await ctl.retrySave();
      if (saved && !st.disposed && S.run === run) toast('Saved the result to History.', { type: 'success' });
    },
    dispose() {
      st.disposed = true; st.presetLoad++; st.historyLoad++;
      clearInterval(st.timer); stopFeatureListener(); stopControllerListener();
      document.removeEventListener?.('keydown', onKey);
    },
    onEnter() { return false; },
    /** For tests and deep links. */
    controller: ctl,
  };
}

/** Rail entry for the app shell; follows features.pregig live. Also installs the global Ctrl+G entry point. */
export function pregigScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-pregig')) main.append(h('section', { class: 'screen', id: 'screen-pregig', hidden: true }));
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'g' || !isEnabled('pregig')) return;
    if (document.querySelector('dialog[open]') || active.screen?.def.id === 'pregig') return; // on the screen it handles its own key
    e.preventDefault();
    go('pregig', { focus: true });
  });
  return [{ id: 'pregig', title: 'Pre-gig check', short: 'Pre-gig', icon: 'pass', feature: 'pregig', create: createPregigScreen }];
}

export { PAIR_UNAVAILABLE_TEXT, PREGIG_BUDGET_MS };
