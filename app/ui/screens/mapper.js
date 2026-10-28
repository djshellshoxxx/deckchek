// MIDI mapper studio screen (FS-32, flag features.mapperStudio). Three panes: the control list (from a learned map,
// an official profile, an imported file or live MIDI learn), function assignment (searchable vocabulary, deck,
// shift layer) and export (target with status chip, validation, preview, Save…). All conversion lives in
// app/mapper/; this file is the controller (small pure helpers, unit-tested) and the DOM. Imported text and every
// model string reach the page through textContent only.
// Keys (when not typing): arrow keys move in the list, Enter goes to function search, L learns, Ctrl+S saves the
// export, Ctrl+Z undoes, Esc cancels learning.

import { h, isNative, isTyping } from '../dom.js';
import { icon, chip } from '../icons.js';
import { announce, toast } from '../live.js';
import { confirmDialog } from '../shell.js';
import { store } from '../state.js';
import { takeHandoff } from '../crosslinks.js';
import { ensureLibrary, lib, profileById } from '../devices/library-state.js';
import * as midi from '../../midi.js';
import { saveTextFile, saveFolder } from '../../userfiles.js';
import { FUNCTIONS, TARGETS, MAX_DECKS, LAYERS, RELATIVE_ENCODINGS, functionDef, argsFor, deckApplies, describeFunction, normalizeFunction } from '../../mapper/vocabulary.js';
import { createModel, sanitizeModel, parseJsonFile, midiFromBytes, addLearnedControl, updateControl, removeControl, modelStats, cleanText, LIMITS } from '../../mapper/model.js';
import { validateModel } from '../../mapper/validate.js';
import { learnedToModel } from '../../mapper/from-learned.js';
import { exportMixxx, importMixxx, fileStem } from '../../mapper/mixxx.js';
import { exportVdj, importVdj } from '../../mapper/vdj.js';
import { seratoReport } from '../../mapper/serato.js';
import { traktorReport } from '../../mapper/traktor-report.js';
import { parseXml } from '../../mapper/xml.js';
import { createMapperStore } from '../../mapper/store.js';

export const EMPTY_TEXT = 'No MIDI map for this device. Learn controls or pick an official profile';
const MAX_FILES = 18;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const UNDO_LIMIT = 50;
const LEARN_TIMEOUT_MS = 30000;
const STATUS_WARNINGS = 5; // at most this many import notes go into the polite live status; the rest sit in a <details>
const LISTED_WARNINGS = 1000;
const KIND_LABEL = { button: 'Button', absolute: 'Fader / knob', relative: 'Encoder' };
const ENCODING_LABEL = { 'relative-two-complement': "Two's complement (1 = right, 127 = left)", 'relative-offset64': 'Offset 64 (65 = right, 63 = left)', 'absolute-wrap': 'Absolute, wraps around' };
// Where focus goes when the focused control disappears or turns disabled in a re-render ('@row' = selected row).
const FOCUS_FALLBACK = { 'mp-clear': ['mp-fn-search', '@row'], 'mp-remove': ['@row', 'mp-learn', 'mp-new'] };
const ARG_LABEL = { action: 'Action', n: 'Number', unit: 'FX unit', param: 'Parameter', band: 'Band' };

export const COPY_HINTS = {
  mixxx: 'Copy both files to your Mixxx controllers folder (Windows: %LOCALAPPDATA%\\Mixxx\\controllers, macOS: ~/Library/Containers/org.mixxx.mixxx/Data/Library/Application Support/Mixxx/controllers, Linux: ~/.mixxx/controllers), then pick the mapping in Mixxx Preferences > Controllers.',
  vdj: 'Copy the Devices file to Documents/VirtualDJ/Devices and the Mappers file to Documents/VirtualDJ/Mappers, then restart VirtualDJ.',
  serato: 'Use the report to map each control in Serato\'s MIDI mapping mode.',
  traktor: 'Use the report to add each control in Traktor\'s Controller Manager.',
};

// ------------------------------------------------------------------ pure helpers (unit tested)

export const targetById = id => TARGETS.find(t => t.id === id) || TARGETS[0];

/** Export for a target: {files:[{name, content}], errors, warnings, report:boolean}. Never throws. */
export function buildExport(model, target, { name, author = 'DeckChek', scripts = [], force = false } = {}) {
  try {
    if (target === 'mixxx') return { ...exportMixxx(model, { name, author, scripts }), report: false };
    if (target === 'vdj') return { ...exportVdj(model, { name, author, force }), report: false };
    const { errors, warnings } = validateModel(model, { target });
    const content = target === 'serato' ? seratoReport(model) : traktorReport(model);
    return { files: [{ name: `${fileStem(name || model?.name)} ${target === 'serato' ? 'Serato' : 'Traktor'} report.md`, content }], errors: errors.filter(e => e.code === 'MODEL_INVALID'), warnings: [...errors, ...warnings], report: true };
  } catch (e) {
    return { files: [], errors: [{ code: 'EXPORT_FAILED', controlIds: [], message: `The export could not be built: ${e?.message || e}` }], warnings: [], report: false };
  }
}

/** Per-control problem words for the list (never colour alone): {id: 'Conflict' | 'Error' | 'Check'}. */
export function rowFlags(validation) {
  const out = {};
  for (const e of validation?.errors || []) for (const id of e.controlIds) out[id] = e.code === 'DUPLICATE_BINDING' ? 'Conflict' : 'Error';
  for (const w of validation?.warnings || []) if (w.code !== 'UNASSIGNED') for (const id of w.controlIds) out[id] ||= 'Check';
  return out;
}

/** Sort picked files into what they are: {json:[], xml:[], js:[], rejected:[messages]}. Size is checked first. */
export function classifyFiles(files) {
  const out = { json: [], xml: [], js: [], rejected: [] };
  const list = [...(files || [])];
  if (list.length > MAX_FILES) { out.rejected.push(`Pick at most ${MAX_FILES} files at a time.`); return out; }
  const total = list.reduce((a, f) => a + (Number(f?.size) || 0), 0);
  if (total > MAX_TOTAL_BYTES) { out.rejected.push('Together these files are larger than 20 MB, so DeckChek will not read them.'); return out; }
  for (const f of list) {
    const name = String(f?.name || '');
    if (!(f?.size >= 0) || f.size > LIMITS.maxImportBytes) { out.rejected.push(`${cleanText(name, 80)} is larger than 5 MB, so DeckChek will not read it.`); continue; }
    if (/\.json$/i.test(name)) out.json.push(f);
    else if (/\.xml$/i.test(name)) out.xml.push(f);
    else if (/\.js$/i.test(name)) out.js.push(f);
    else out.rejected.push(`${cleanText(name, 80)} is not a .xml, .json or .js file.`);
  }
  return out;
}

/** Which program an XML text belongs to (root element only; the full parse happens in the importer). */
export function sniffXml(text) {
  const r = parseXml(text);
  if (!r.ok) return { kind: 'error', error: r.error };
  if (/^Mixxx(Controller|MIDI)Preset$/.test(r.root.name)) return { kind: 'mixxx' };
  if (r.root.name === 'device') return { kind: 'vdj-definition' };
  if (r.root.name === 'mapper') return { kind: r.root.children.some(c => c.name === 'note') ? 'vdj-legacy' : 'vdj-mapper' };
  return { kind: 'unknown' };
}

/** Keep at most LIMITS.maxControls controls (the XML importers read up to twice that), with one summary note. */
export function capControls(model, warnings = []) {
  const n = model?.controls?.length || 0;
  if (n <= LIMITS.maxControls) return { model, warnings };
  return { model: { ...model, controls: model.controls.slice(0, LIMITS.maxControls) }, warnings: [`The file has ${n} controls; only the first ${LIMITS.maxControls} were kept.`, ...warnings] };
}

/**
 * Turn read file texts into a model. `texts` = [{name, text}]. Returns {ok, model, scripts, warnings, source} or
 * {ok:false, error:{message, line, column}}. Never throws: a hostile file (for example a JSON value whose toString is
 * not callable) becomes a typed error instead of an unhandled rejection.
 */
export function importTexts(texts, opts = {}) {
  try { return importTextsUnchecked(texts, opts); } catch (e) {
    return { ok: false, error: { message: `The file is not a usable mapping (${cleanText(e?.name || 'error', 40)}).` } };
  }
}

function importTextsUnchecked(texts, { profile = null } = {}) {
  const json = texts.filter(t => /\.json$/i.test(t.name)), xml = texts.filter(t => /\.xml$/i.test(t.name)), js = texts.filter(t => /\.js$/i.test(t.name));
  if (json.length) {
    const p = parseJsonFile(json[0].text);
    if (!p.ok) return { ok: false, error: { ...p.error, message: `${cleanText(json[0].name, 80)}: ${p.error.message}` } };
    if (p.kind === 'learned') return { ok: true, model: learnedToModel(p.value, profile), scripts: [], warnings: [], source: 'Learned map' };
    const s = sanitizeModel(p.value);
    if (!s.model) return { ok: false, error: { message: s.warnings[0] || 'The file is not a mapping.' } };
    return { ok: true, model: s.model, scripts: [], warnings: s.warnings, readOnly: s.readOnly, source: 'DeckChek mapping' };
  }
  if (!xml.length) return { ok: false, error: { message: 'Pick a Mixxx .midi.xml, VirtualDJ .xml files, or a DeckChek .json mapping.' } };
  const kinds = xml.map(x => ({ ...x, ...sniffXml(x.text) }));
  const bad = kinds.find(k => k.kind === 'error');
  if (bad) return { ok: false, error: { ...bad.error, message: `${cleanText(bad.name, 80)}: ${bad.error.message}` } };
  const mixxx = kinds.find(k => k.kind === 'mixxx');
  if (mixxx) {
    const r = importMixxx(mixxx.text, js.map(j => ({ name: j.name, content: j.text })));
    return r.ok ? { ok: true, ...capControls(r.model, r.warnings), scripts: r.preservedRaw, source: 'Mixxx mapping' } : { ok: false, error: r.error };
  }
  const def = kinds.find(k => k.kind === 'vdj-definition'), map = kinds.find(k => k.kind === 'vdj-mapper'), legacy = kinds.find(k => k.kind === 'vdj-legacy');
  if (def || legacy) {
    const r = def ? importVdj(def.text, map?.text ?? null) : importVdj(legacy.text);
    return r.ok ? { ok: true, ...capControls(r.model, r.warnings), scripts: [], source: 'VirtualDJ mapping' } : { ok: false, error: r.error };
  }
  if (map) return { ok: false, error: { message: 'That is a VirtualDJ mapper file. Open it together with its device definition (Documents/VirtualDJ/Devices).' } };
  return { ok: false, error: { message: 'DeckChek does not recognise this XML file as a Mixxx or VirtualDJ mapping.' } };
}

/** Short form of an import's notes for the live status: the first few plus "and N more". */
export function summariseWarnings(warnings, max = STATUS_WARNINGS) {
  const list = Array.isArray(warnings) ? warnings : [];
  if (list.length <= max) return list.join(' ');
  const more = list.length - max;
  return `${list.slice(0, max).join(' ')} …and ${more} more note${more === 1 ? '' : 's'} (listed under “All import notes”).`;
}

/** Success line after a save. */
export function savedMessage(target, result) {
  const where = result?.path ? ` Saved to ${result.path}.` : '';
  return `Saved.${where} ${COPY_HINTS[target] || ''}`.trim();
}

/** Minimal undo stack of model snapshots. */
export function createUndo(limit = UNDO_LIMIT) {
  const stack = [];
  return {
    push(model) { stack.push(JSON.stringify(model)); if (stack.length > limit) stack.shift(); },
    pop() { const s = stack.pop(); return s ? JSON.parse(s) : null; },
    get size() { return stack.length; },
    clear() { stack.length = 0; },
  };
}

/** Function catalogue filtered by a search text (label, id or category). */
export function filterFunctions(query) {
  const q = String(query || '').trim().toLowerCase();
  return FUNCTIONS.filter(f => !q || f.label.toLowerCase().includes(q) || f.id.includes(q) || String(f.category).toLowerCase().includes(q));
}

const midiText = m => (m.type === 'note' ? `Note ${m.number}` : m.type === 'cc14' ? `CC ${m.number}+${m.lsbNumber}` : m.type === 'pitchbend' ? 'Pitch bend' : `CC ${m.number}`) + ` · ch ${m.channel}`;

// ------------------------------------------------------------------ screen

function pickFiles(accept) {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept, multiple: true, hidden: true, id: 'mp-file-input' });
    input.addEventListener('change', () => { resolve([...(input.files || [])]); input.remove(); }, { once: true });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); }, { once: true });
    document.body.append(input);
    input.click();
  });
}

export function createMapperScreen(section) {
  const mstore = createMapperStore();
  const undo = createUndo();
  const st = {
    model: null, readOnly: false, savedId: null, assetId: null, profileId: null, selectedId: null, target: 'mixxx', force: false,
    scripts: [], saved: [], learning: null, ports: [], port: '', exportView: 0, busy: false, lastLoaded: '',
  };
  const status = h('div', { id: 'mp-status', class: 'mp-status', role: 'status', 'aria-live': 'polite' });
  const warningsBox = h('details', { id: 'mp-warnings', class: 'mp-warnings', hidden: true });
  const validationBox = h('div', { id: 'mp-validation', class: 'mp-validation', 'aria-live': 'polite' });
  const left = h('section', { class: 'card mp-pane mp-left', 'aria-labelledby': 'mp-controls-title' });
  const centre = h('section', { class: 'card mp-pane mp-centre', 'aria-labelledby': 'mp-assign-title' });
  const right = h('section', { class: 'card mp-pane mp-right', 'aria-labelledby': 'mp-export-title' });
  const deviceSelect = h('select', { id: 'mp-device', 'aria-label': 'Unit (device) to map' });
  const savedSelect = h('select', { id: 'mp-saved', 'aria-label': 'Saved mappings' });
  const nameInput = h('input', { id: 'mp-name', type: 'text', maxlength: String(LIMITS.maxText), autocomplete: 'off', 'aria-label': 'Mapping name' });
  const decksSelect = h('select', { id: 'mp-decks', 'aria-label': 'Number of decks' }, ...[1, 2, 3, 4].map(n => h('option', { value: String(n), text: `${n} deck${n === 1 ? '' : 's'}` })));

  const setStatus = (message, tone = 'info', { title = null } = {}) => {
    status.replaceChildren();
    if (!message) return;
    status.append(h('p', { class: `hint hint-${tone}`, 'data-tone': tone }, title ? h('strong', { text: `${title} ` }) : null, message));
  };
  // Full list of import notes, outside the live region, collapsed; only shown when the status had to shorten it.
  const showWarnings = (list = []) => {
    warningsBox.open = false;
    if (list.length <= STATUS_WARNINGS) { warningsBox.hidden = true; warningsBox.replaceChildren(); return; }
    const shown = list.slice(0, LISTED_WARNINGS);
    warningsBox.replaceChildren(h('summary', { text: `All import notes (${list.length})` }),
      h('ul', { class: 'mp-warning-list' }, ...shown.map(w => h('li', { text: w })),
        ...(list.length > shown.length ? [h('li', { class: 'muted', text: `…and ${list.length - shown.length} more.` })] : [])));
    warningsBox.hidden = false;
  };
  const selected = () => st.model?.controls.find(c => c.id === st.selectedId) || null;

  // Validation and export depend only on the model object (edits replace it), the target and the export options, so
  // they are computed once per change instead of on every selection move.
  const memo = { v: null, vKey: [], ex: null, exKey: [] };
  const sameKey = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  function currentValidation() {
    const key = [st.model, st.target];
    if (!sameKey(key, memo.vKey)) { memo.v = st.model ? validateModel(st.model, { target: st.target }) : null; memo.vKey = key; }
    return memo.v;
  }

  /** Move the selection without rebuilding the list or the export: patch the rows in place, redraw the inspector. */
  function selectControl(id, { focus = false } = {}) {
    if (!st.model?.controls.some(c => c.id === id)) return;
    st.selectedId = id;
    for (const tr of left.querySelectorAll('#mp-rows tr')) {
      const sel = tr.dataset.id === id;
      tr.setAttribute('aria-selected', String(sel));
      tr.tabIndex = sel ? 0 : -1;
      tr.classList.toggle('is-selected', sel);
    }
    keepFocus(renderCentre);
    if (focus) focusRow();
  }

  function setModel(model, { keepUndo = false, select = null } = {}) {
    if (!keepUndo) undo.clear();
    showWarnings();
    st.model = model;
    nameInput.value = model?.name || '';
    decksSelect.value = String(model?.decks || 2);
    st.selectedId = select ?? (model?.controls.some(c => c.id === st.selectedId) ? st.selectedId : model?.controls[0]?.id ?? null);
    renderAll();
  }

  function edit(mutator, { announceText = null } = {}) {
    if (!st.model || st.readOnly) return;
    undo.push(st.model);
    const res = mutator(st.model);
    st.model = res.model || res;
    if (res.id !== undefined) st.selectedId = res.id;
    renderAll();
    if (announceText) announce(announceText);
  }

  function doUndo() {
    const prev = undo.pop();
    if (!prev) { announce('Nothing to undo.'); return; }
    st.model = prev;
    nameInput.value = prev.name; decksSelect.value = String(prev.decks);
    if (!prev.controls.some(c => c.id === st.selectedId)) st.selectedId = prev.controls[0]?.id ?? null;
    renderAll();
    announce('Undone.');
  }

  // ---------------------------------------------------------------- sources
  async function loadLibrary() {
    try { await ensureLibrary(); } catch { /* library errors are shown on the Devices screen */ }
    const assets = (lib.assets || []).filter(a => !a.isDeleted).sort((a, b) => String(a.nickname || '').localeCompare(String(b.nickname || '')));
    const keep = deviceSelect.value;
    deviceSelect.replaceChildren(h('option', { value: '', text: assets.length ? 'Choose a unit…' : 'No units in the device library' }), ...assets.map(a => h('option', { value: a.id, text: a.nickname || a.id })));
    if (assets.some(a => a.id === keep)) deviceSelect.value = keep;
  }
  const profileForAsset = asset => {
    if (!asset?.productId) return null;
    for (const [pid, prod] of lib.products || []) if (prod === asset.productId) return profileById(pid);
    return null;
  };

  async function loadFromDevice(assetId = deviceSelect.value) {
    if (!assetId) { setStatus('Choose a unit first.', 'warn'); deviceSelect.focus(); return; }
    const asset = (lib.assets || []).find(a => a.id === assetId) || { id: assetId };
    const profile = profileForAsset(asset);
    setStatus('Loading the MIDI map…');
    let row = null;
    try { row = await store.getMidiMap(assetId); } catch (e) { setStatus(`Could not read the learned map: ${e?.message || e}`, 'warn'); }
    const learnedControls = Array.isArray(row?.map?.controls) ? row.map.controls.length : 0;
    const published = (profile?.midi?.controls || []).filter(c => c?.message).length;
    const name = asset.nickname || [profile?.manufacturer, profile?.model].filter(Boolean).join(' ') || 'My controller';
    const reset = () => { st.assetId = assetId; st.profileId = profile?.id || null; st.savedId = null; st.readOnly = false; st.scripts = []; };
    if (!learnedControls && !published) {
      reset();
      setModel(createModel({ name, manufacturer: profile?.manufacturer || '', source: 'learned', sourceId: profile?.id || assetId }));
      setStatus(EMPTY_TEXT, 'info');
      announce(EMPTY_TEXT);
      return;
    }
    let model;
    try { model = learnedToModel(learnedControls ? row : null, profile, { name }); } catch {
      setStatus('The MIDI map stored for this unit could not be read.', 'fail', { title: 'Could not open the mapping.' });
      announce('Could not open the mapping.', { assertive: true });
      return;
    }
    reset();
    setModel(model);
    const s = modelStats(model);
    setStatus(`${s.total} control${s.total === 1 ? '' : 's'} loaded from the ${learnedControls ? 'map learned on this unit' : 'official profile'}; ${s.assigned} got a suggested function.${s.unassigned ? ` ${s.unassigned} unmapped control${s.unassigned === 1 ? '' : 's'} to assign.` : ''}`, s.unassigned ? 'warn' : 'pass');
    announce('MIDI map loaded.');
  }

  async function openFiles() {
    const files = await pickFiles('.xml,.json,.js,application/xml,text/xml,application/json');
    if (!files.length) return;
    const c = classifyFiles(files);
    if (c.rejected.length) { setStatus(c.rejected.join(' '), 'fail', { title: 'Not opened.' }); return; }
    setStatus('Reading…');
    let texts;
    try { texts = await Promise.all([...c.json, ...c.xml, ...c.js].map(async f => ({ name: f.name, text: await f.text() }))); } catch (e) { setStatus(`The file could not be read: ${e?.message || e}`, 'fail'); return; }
    const profile = st.profileId ? profileById(st.profileId) : null;
    const r = importTexts(texts, { profile }); // never throws
    if (!r.ok) {
      setStatus(r.error.message, 'fail', { title: 'Could not open the mapping.' });
      announce('Could not open the mapping.', { assertive: true });
      return;
    }
    st.savedId = null; st.readOnly = Boolean(r.readOnly); st.scripts = r.scripts || [];
    setModel(r.model);
    const s = modelStats(r.model);
    setStatus(`${r.source} opened: ${s.assigned} recognised, ${s.custom} unmapped/custom (preserved), ${s.unassigned} without a function.${r.warnings.length ? ` ${summariseWarnings(r.warnings)}` : ''}`, r.warnings.length || s.custom ? 'warn' : 'pass');
    showWarnings(r.warnings);
    announce('Mapping opened.');
  }

  function newModel() {
    st.savedId = null; st.readOnly = false; st.scripts = [];
    setModel(createModel({ name: 'New mapping', source: 'manual' }));
    setStatus('Empty mapping. Press Learn (L) and move a control, then assign it a function.', 'info');
  }

  async function refreshSaved() {
    try { st.saved = await mstore.list(); } catch { st.saved = []; }
    savedSelect.replaceChildren(h('option', { value: '', text: st.saved.length ? 'Saved mappings…' : 'No saved mappings' }), ...st.saved.map(r => h('option', { value: r.id, text: `${r.name} (${r.controlCount} controls)` })));
    if (st.savedId && st.saved.some(r => r.id === st.savedId)) savedSelect.value = st.savedId;
  }

  async function openSaved() {
    const id = savedSelect.value;
    if (!id) return;
    try {
      const row = await mstore.get(id);
      if (!row?.model) { setStatus('That mapping could not be read.', 'fail'); return; }
      st.savedId = row.id; st.assetId = row.assetId; st.profileId = row.profileId; st.readOnly = row.readOnly; st.scripts = [];
      setModel(row.model);
      setStatus(row.warnings?.length ? summariseWarnings(row.warnings) : `Opened ${row.name}.`, row.readOnly ? 'warn' : 'pass');
      showWarnings(row.warnings || []);
    } catch (e) { setStatus(`Could not open the mapping: ${e?.message || e}`, 'fail'); }
  }

  async function saveModel() {
    if (!st.model) return;
    try {
      const row = await mstore.save({ id: st.savedId, assetId: st.assetId, profileId: st.profileId, name: st.model.name, model: st.model });
      st.savedId = row.id;
      await refreshSaved();
      setStatus(`Mapping "${row.name}" saved${mstore.native ? '' : ' in this browser'}.`, 'pass');
      toast('Mapping saved.', { type: 'success' });
    } catch (e) {
      const msg = typeof e === 'string' ? e : e?.message || 'The mapping could not be saved.';
      setStatus(msg.replace(/^MAPPER_[A-Z_]+: /, ''), 'fail', { title: 'Not saved.' });
    }
  }

  async function deleteSaved() {
    const id = savedSelect.value;
    if (!id) return;
    const row = st.saved.find(r => r.id === id);
    const ok = await confirmDialog({ title: 'Delete saved mapping?', body: `“${row?.name || 'This mapping'}” is removed from DeckChek. Exported files are not touched.` });
    if (!ok) return;
    try { await mstore.remove(id); if (st.savedId === id) st.savedId = null; await refreshSaved(); setStatus('Saved mapping deleted.', 'info'); } catch (e) { setStatus(`Could not delete: ${e?.message || e}`, 'fail'); }
  }

  // ---------------------------------------------------------------- MIDI learn
  async function refreshPorts() {
    if (!midi.isAvailable()) { st.ports = []; return; }
    try { st.ports = ((await midi.listPorts()).inputs || []).map(p => p.name); } catch { st.ports = []; }
    if (!st.ports.includes(st.port)) st.port = st.ports[0] || '';
  }

  function stopLearn(message = null) {
    if (!st.learning) return false;
    st.learning.unsub?.();
    clearTimeout(st.learning.timer);
    st.learning = null;
    keepFocus(renderLeft);
    if (message) { setStatus(message, 'info'); announce(message); }
    return true;
  }

  async function learn() {
    if (st.learning) { stopLearn('Learning cancelled.'); return; }
    if (st.readOnly) return;
    if (!midi.isAvailable()) { setStatus(`MIDI is not available here (backend: ${midi.backend()}). Use the DeckChek desktop app or a browser with Web MIDI.`, 'warn'); return; }
    if (!st.model) newModel();
    await refreshPorts();
    if (!st.port) { setStatus('No MIDI input found. Connect the controller and try again.', 'warn'); keepFocus(renderLeft); return; }
    try { await midi.open(st.port); } catch (e) { setStatus(`Could not open ${st.port}: ${e?.message || e}`, 'fail'); return; }
    const unsub = midi.onMessage(msg => {
      if (!st.learning || (msg?.port && msg.port !== st.port)) return;
      const m = midiFromBytes(msg?.bytes || []);
      if (!m) return;
      stopLearn();
      const res = addLearnedControl(st.model, m, { layer: selected()?.layer === 'shift' ? 'shift' : 'base' });
      if (!res.control) { setStatus(`The mapping already has ${LIMITS.maxControls} controls.`, 'warn'); return; }
      if (res.added) edit(() => ({ model: res.model, id: res.control.id }));
      else selectControl(res.control.id);
      const text = `${res.added ? 'Learned' : 'Selected'} ${midiText(res.control.midi)}.`;
      setStatus(`${text} Now pick its function.`, 'pass');
      announce(text);
      focusRow();
    });
    st.learning = { unsub, timer: setTimeout(() => stopLearn('No MIDI message arrived in 30 seconds; learning stopped.'), LEARN_TIMEOUT_MS) };
    keepFocus(renderLeft);
    setStatus(`Listening on ${st.port}: move or press one control. Esc cancels.`, 'info');
    announce('Listening for a MIDI message.');
  }

  // ---------------------------------------------------------------- render
  const selectedRow = () => section.querySelector(`#mp-rows tr[data-id="${CSS.escape(st.selectedId || '')}"]`);
  function focusRow() { selectedRow()?.focus(); }

  /**
   * Run a re-render and keep keyboard focus in place: the same field by id (fields have stable ids), the selected
   * row, or a sensible neighbour when the focused control is gone or now disabled. Never pulls focus from outside.
   */
  function keepFocus(render) {
    const active = document.activeElement;
    const inside = Boolean(active && active !== document.body && section.contains(active));
    const fid = inside && active.id ? active.id : null;
    const onRow = inside && Boolean(active.matches?.('#mp-rows tr'));
    render();
    if (!inside || (section.contains(active) && !active.disabled)) return;
    const tryFocus = el => { if (!el || el.disabled) return false; el.focus(); return document.activeElement === el; };
    const byId = id => (id === '@row' ? selectedRow() : section.querySelector(`#${CSS.escape(id)}`));
    if (onRow && tryFocus(selectedRow())) return;
    if (fid && tryFocus(byId(fid))) return;
    for (const id of FOCUS_FALLBACK[fid] || []) if (tryFocus(byId(id))) return;
    if (tryFocus(selectedRow())) return;
    section.querySelector('h1')?.focus();
  }

  function renderLeft() {
    left.replaceChildren();
    const v = currentValidation();
    const flags = rowFlags(v);
    const s = st.model ? modelStats(st.model) : null;
    const portSel = h('select', { id: 'mp-port', 'aria-label': 'MIDI input for Learn', disabled: !st.ports.length }, ...(st.ports.length ? st.ports.map(p => h('option', { value: p, text: p })) : [h('option', { value: '', text: midi.isAvailable() ? 'No MIDI input' : 'MIDI not available' })]));
    portSel.value = st.port;
    portSel.addEventListener('change', () => { st.port = portSel.value; });
    left.append(
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'mp-controls-title', text: 'Controls' }),
        ...[s ? h('span', { id: 'mp-partial', class: 'muted small', text: `${s.total} control${s.total === 1 ? '' : 's'}${s.unassigned ? ` · ${s.unassigned} unmapped` : ''}${s.custom ? ` · ${s.custom} custom (preserved)` : ''}` }) : null].filter(Boolean)),
      h('div', { class: 'mp-learn' }, portSel,
        h('button', { type: 'button', id: 'mp-learn', class: `btn ${st.learning ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': String(Boolean(st.learning)), disabled: st.readOnly || (!midi.isAvailable()), onclick: learn, title: 'Learn (L)' },
          h('span', { html: icon('keyboard', { size: 18 }) }), h('span', { text: st.learning ? 'Listening… (Esc)' : 'Learn' }))),
      ...(midi.isAvailable() ? [] : [h('p', { id: 'mp-midi-unsupported', class: 'hint hint-warn', text: `Live MIDI learn is not available here (backend: ${midi.backend()}). You can still open a learned map or a mapping file.` })]));
    if (!st.model) { left.append(h('p', { class: 'muted', id: 'mp-empty', text: `${EMPTY_TEXT}, or open a Mixxx/VirtualDJ file.` })); return; }
    if (!st.model.controls.length) { left.append(h('p', { class: 'muted', id: 'mp-empty', text: EMPTY_TEXT })); return; }
    const rows = st.model.controls.map(c => {
      const sel = c.id === st.selectedId;
      const flag = flags[c.id];
      const tr = h('tr', { 'data-id': c.id, tabindex: sel ? '0' : '-1', 'aria-selected': String(sel), class: `${sel ? 'is-selected' : ''} ${flag ? `has-${flag.toLowerCase()}` : ''}`.trim(), onclick: () => selectControl(c.id, { focus: true }) },
        h('th', { scope: 'row', class: 'mp-label' }, h('span', { text: c.label }), flag ? h('span', { class: `mp-flag mp-flag-${flag.toLowerCase()}`, html: icon(flag === 'Check' ? 'info' : 'warn', { size: 14 }) }, h('span', { text: flag })) : null),
        h('td', { class: 'mp-midi', text: midiText(c.midi) }),
        h('td', { text: c.layer === 'shift' ? 'Shift' : 'Base' }),
        h('td', { class: c.function ? '' : 'muted', text: c.function ? describeFunction(c.function) : c.custom ? `Custom (preserved, ${c.custom.target === 'mixxx' ? 'Mixxx' : 'VirtualDJ'})` : 'Unassigned' }));
      return tr;
    });
    const table = h('table', { class: 'mp-table', id: 'mp-table' },
      h('caption', { class: 'sr-only', text: 'Controls: arrow keys move, Enter assigns, L learns' }),
      h('thead', {}, h('tr', {}, ...['Control', 'MIDI', 'Layer', 'Function'].map(t => h('th', { scope: 'col', text: t })))),
      h('tbody', { id: 'mp-rows' }, ...rows));
    table.addEventListener('keydown', ev => {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp' && ev.key !== 'Enter' && ev.key !== 'Home' && ev.key !== 'End') return;
      const ids = st.model.controls.map(c => c.id);
      let i = ids.indexOf(st.selectedId);
      if (ev.key === 'Enter') { ev.preventDefault(); section.querySelector('#mp-fn-search')?.focus(); return; }
      ev.preventDefault();
      i = ev.key === 'ArrowDown' ? Math.min(ids.length - 1, i + 1) : ev.key === 'ArrowUp' ? Math.max(0, i - 1) : ev.key === 'Home' ? 0 : ids.length - 1;
      selectControl(ids[i], { focus: true });
    });
    left.append(h('div', { class: 'mp-table-wrap' }, table));
  }

  function argSelect(def, fn, a) {
    const sel = h('select', { id: `mp-arg-${a.name}`, 'aria-label': ARG_LABEL[a.name] || a.name, disabled: st.readOnly }, ...a.values.map(v => h('option', { value: String(v), text: String(v) })));
    sel.value = String(fn.args?.[a.name] ?? a.values[0]);
    sel.addEventListener('change', () => edit(m => updateControl(m, st.selectedId, { function: normalizeFunction({ ...fn, args: { ...fn.args, [a.name]: sel.value } }, m.decks) })));
    return h('label', { class: 'mp-field' }, h('span', { class: 'field-label', text: ARG_LABEL[a.name] || a.name }), sel);
  }

  function renderCentre() {
    centre.replaceChildren(h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'mp-assign-title', text: 'Function' })));
    const c = selected();
    if (!c) { centre.append(h('p', { class: 'muted', text: 'Select a control in the list, or press Learn and move one.' })); return; }
    const ro = st.readOnly;
    const label = h('input', { id: 'mp-label', type: 'text', value: c.label, maxlength: String(LIMITS.maxText), disabled: ro, autocomplete: 'off' });
    label.addEventListener('change', () => edit(m => updateControl(m, c.id, { label: label.value })));
    const kind = h('select', { id: 'mp-kind', disabled: ro }, ...Object.entries(KIND_LABEL).map(([k, t]) => h('option', { value: k, text: t })));
    kind.value = c.kind;
    kind.addEventListener('change', () => edit(m => updateControl(m, c.id, { kind: kind.value, midi: { ...c.midi, encoding: kind.value === 'relative' ? c.midi.encoding || 'relative-two-complement' : undefined } })));
    const layer = h('select', { id: 'mp-layer', disabled: ro }, ...LAYERS.map(l => h('option', { value: l, text: l === 'shift' ? 'Shift layer (while Shift is held)' : 'Base layer' })));
    layer.value = c.layer;
    layer.addEventListener('change', () => edit(m => updateControl(m, c.id, { layer: layer.value })));
    centre.append(h('div', { class: 'mp-fields' },
      h('label', { class: 'mp-field', for: 'mp-label' }, h('span', { class: 'field-label', text: 'Name' }), label),
      h('label', { class: 'mp-field', for: 'mp-kind' }, h('span', { class: 'field-label', text: 'Control type' }), kind),
      c.kind === 'relative' ? (() => {
        const enc = h('select', { id: 'mp-encoding', disabled: ro }, ...RELATIVE_ENCODINGS.map(e => h('option', { value: e, text: ENCODING_LABEL[e] })));
        enc.value = c.midi.encoding || 'relative-two-complement';
        enc.addEventListener('change', () => edit(m => updateControl(m, c.id, { midi: { ...c.midi, encoding: enc.value } })));
        return h('label', { class: 'mp-field', for: 'mp-encoding' }, h('span', { class: 'field-label', text: 'Encoder sends' }), enc);
      })() : null,
      h('label', { class: 'mp-field', for: 'mp-layer' }, h('span', { class: 'field-label', text: 'Layer' }), layer)));

    const fn = c.function;
    const def = functionDef(fn?.id);
    const current = h('p', { id: 'mp-current', class: 'mp-current' }, h('span', { class: 'muted', text: 'Assigned: ' }), h('strong', { text: fn ? describeFunction(fn) : c.custom ? 'Custom (preserved from the imported file)' : 'Nothing yet' }));
    centre.append(current);
    if (def) {
      const opts = [];
      if (deckApplies(def, fn.args)) {
        const deck = h('select', { id: 'mp-deck', disabled: ro }, ...Array.from({ length: st.model.decks }, (_, i) => h('option', { value: String(i + 1), text: `Deck ${i + 1}` })));
        deck.value = String(fn.deck || 1);
        deck.addEventListener('change', () => edit(m => updateControl(m, c.id, { function: { ...fn, deck: Number(deck.value) } })));
        opts.push(h('label', { class: 'mp-field', for: 'mp-deck' }, h('span', { class: 'field-label', text: 'Deck' }), deck));
      }
      for (const a of argsFor(def, fn.args)) opts.push(argSelect(def, fn, a));
      const ledOk = c.midi.type === 'note' || c.midi.type === 'cc';
      const led = h('input', { type: 'checkbox', id: 'mp-led', checked: Boolean(c.feedback?.led), disabled: ro || !ledOk });
      led.addEventListener('change', () => edit(m => updateControl(m, c.id, { feedback: led.checked ? { led: { type: c.midi.type, channel: c.midi.channel, number: c.midi.number, on: 127, off: 0 } } : null })));
      opts.push(h('label', { class: 'mp-check', for: 'mp-led' }, led, h('span', { text: 'Light the control\'s LED (same message)' })));
      centre.append(h('div', { class: 'mp-fields' }, ...opts));
    }
    const search = h('input', { id: 'mp-fn-search', type: 'search', placeholder: 'Search functions (play, hot cue, loop…)', 'aria-label': 'Search functions', 'aria-controls': 'mp-fn-list', autocomplete: 'off', disabled: ro });
    const list = h('div', { id: 'mp-fn-list', class: 'mp-fn-list', role: 'group', 'aria-label': 'Functions' });
    const fill = () => {
      const fs = filterFunctions(search.value);
      list.replaceChildren(...fs.map(f => h('button', { type: 'button', id: `mp-fn-${f.id}`, class: `btn btn-sm ${fn?.id === f.id ? 'btn-primary' : 'btn-secondary'}`, 'data-fn': f.id, 'aria-pressed': String(fn?.id === f.id), disabled: ro,
        onclick: () => {
          const deckSel = section.querySelector('#mp-deck');
          const next = normalizeFunction({ id: f.id, deck: Number(deckSel?.value) || fn?.deck || 1, args: {} }, st.model.decks);
          edit(m => updateControl(m, c.id, { function: next }), { announceText: `${c.label}: ${describeFunction(next)}` });
          section.querySelector(`#mp-fn-list [data-fn="${f.id}"]`)?.focus();
        } }, f.label)));
      if (!fs.length) list.append(h('p', { class: 'muted small', text: 'No function matches.' }));
    };
    search.addEventListener('input', fill);
    search.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); list.querySelector('button')?.click(); } });
    fill();
    centre.append(search, list,
      h('div', { class: 'mp-actions' },
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'mp-clear', disabled: ro || !fn, text: 'Clear function', onclick: () => edit(m => updateControl(m, c.id, { function: null })) }),
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'mp-remove', disabled: ro, onclick: () => edit(m => ({ model: removeControl(m, c.id), id: m.controls.find(x => x.id !== c.id)?.id ?? null }), { announceText: 'Control removed.' }) },
          h('span', { html: icon('trash', { size: 16 }) }), h('span', { text: 'Remove control' }))));
  }

  function currentExport() {
    if (!st.model) return null;
    const name = nameInput.value || st.model.name;
    const key = [st.model, st.target, name, st.scripts, st.force];
    if (!sameKey(key, memo.exKey)) { memo.ex = buildExport({ ...st.model, name }, st.target, { name, scripts: st.scripts, force: st.force }); memo.exKey = key; }
    return memo.ex;
  }

  function renderRight() {
    right.replaceChildren();
    const t = targetById(st.target);
    const target = h('select', { id: 'mp-target', 'aria-label': 'Export target' }, ...TARGETS.map(x => h('option', { value: x.id, text: `${x.label} (${x.status})` })));
    target.value = st.target;
    target.addEventListener('change', () => { st.target = target.value; st.exportView = 0; renderAll(); });
    right.append(h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'mp-export-title', text: 'Export' }), h('span', { id: 'mp-target-chip', class: 'mp-chip', html: chip(t.tone, t.status) })),
      h('label', { class: 'mp-field', for: 'mp-target' }, h('span', { class: 'field-label', text: 'DJ software' }), target));
    if (st.target === 'vdj') {
      const force = h('input', { type: 'checkbox', id: 'mp-force', checked: st.force });
      force.addEventListener('change', () => { st.force = force.checked; keepFocus(renderRight); });
      right.append(h('label', { class: 'mp-check', for: 'mp-force' }, force, h('span', { text: 'VirtualDJ already supports this controller (name the definition force-…)' })));
    }
    if (st.target === 'serato' || st.target === 'traktor') right.append(h('p', { class: 'hint hint-warn', id: 'mp-report-note', text: st.target === 'serato' ? 'Experimental/Report: Serato has no published mapping format, so DeckChek writes a report to follow by hand.' : 'Report only: Traktor .tsi files are not written. Follow the report in Traktor\'s Controller Manager.' }));
    const ex = currentExport();
    validationBox.replaceChildren();
    if (!ex) { right.append(validationBox, h('p', { class: 'muted', text: 'Nothing to export yet.' })); return; }
    const items = [...ex.errors.map(e => ({ ...e, sev: 'error' })), ...ex.warnings.map(w => ({ ...w, sev: 'warning' }))];
    validationBox.append(h('h3', { class: 'mp-sub', text: ex.errors.length ? `${ex.errors.length} problem${ex.errors.length === 1 ? '' : 's'} block the export` : 'Ready to export' }));
    if (items.length) {
      validationBox.append(h('ul', { class: 'mp-issues' }, ...items.map(it => h('li', { class: `mp-issue mp-${it.sev}`, 'data-code': it.code },
        h('span', { class: 'mp-sev', html: icon(it.sev === 'error' ? 'fail' : 'warn', { size: 14 }) }, h('span', { text: it.sev === 'error' ? 'Error: ' : 'Note: ' })),
        h('span', { text: it.message }),
        it.controlIds?.length ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm mp-show', text: it.controlIds.length > 1 ? `Show (${it.controlIds.length})` : 'Show', onclick: () => selectControl(it.controlIds[0], { focus: true }) }) : null))));
    }
    right.append(validationBox);
    if (ex.files.length) {
      st.exportView = Math.min(st.exportView, ex.files.length - 1);
      if (ex.files.length > 1) right.append(h('div', { class: 'mp-tabs', role: 'group', 'aria-label': 'Files in the export' }, ...ex.files.map((f, i) => h('button', { type: 'button', id: `mp-tab-${i}`, class: `btn btn-sm ${i === st.exportView ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': String(i === st.exportView), text: f.name, onclick: () => { st.exportView = i; keepFocus(renderRight); } }))));
      right.append(h('pre', { id: 'mp-preview', class: 'mp-preview', tabindex: '0', 'aria-label': `Preview of ${ex.files[st.exportView].name}` }, ex.files[st.exportView].content));
    }
    right.append(h('div', { class: 'mp-actions' },
      // While saving the button stays focusable (aria-disabled, guarded in saveExport) so focus does not drop to <body>.
      h('button', { type: 'button', class: 'btn btn-primary', id: 'mp-export-save', disabled: Boolean(ex.errors.length) || !ex.files.length, 'aria-disabled': st.busy ? 'true' : null, title: 'Save (Ctrl+S)', onclick: saveExport },
        h('span', { html: icon('download', { size: 18 }) }), h('span', { text: ex.report ? 'Save report…' : 'Save…' }))),
      h('p', { class: 'muted small', text: COPY_HINTS[st.target] }));
  }

  async function saveExport() {
    const ex = currentExport();
    if (!ex) return;
    if (ex.errors.length) { setStatus('Fix the problems listed under Export first.', 'fail', { title: 'Not saved.' }); section.querySelector('#mp-validation')?.scrollIntoView?.({ block: 'nearest' }); return; }
    if (st.busy) return;
    st.busy = true; keepFocus(renderRight);
    try {
      let result;
      if (ex.report) {
        const f = ex.files[0];
        result = await saveTextFile({ suggestedName: f.name, content: f.content, ext: 'md' });
      } else if (isNative()) {
        result = await saveFolder({ files: ex.files.map(f => ({ relPath: f.name, text: f.content })), allowedExts: ['xml', 'js'], title: st.target === 'vdj' ? 'Choose your Documents/VirtualDJ folder' : 'Choose a folder for the Mixxx mapping' });
      } else {
        for (const f of ex.files) {
          const flat = f.name.replace(/^(Devices|Mappers)\/(.+)\.xml$/, '$2 - $1.xml');
          result = await saveTextFile({ suggestedName: flat, content: f.content, ext: /\.js$/.test(f.name) ? 'js' : 'xml' });
        }
      }
      if (result?.cancelled) { setStatus('Save cancelled.', 'info'); return; }
      const msg = savedMessage(st.target, result);
      setStatus(msg, 'pass');
      announce('Saved.');
    } catch (e) {
      const msg = typeof e === 'string' ? e : e?.message || 'The files could not be written.';
      setStatus(msg, 'fail', { title: 'Not saved.' });
    } finally { st.busy = false; keepFocus(renderRight); }
  }

  function renderAll() {
    keepFocus(() => {
      section.classList.toggle('mp-readonly', st.readOnly);
      renderLeft(); renderCentre(); renderRight();
    });
  }

  // ---------------------------------------------------------------- layout
  nameInput.addEventListener('change', () => edit(m => ({ ...m, name: cleanText(nameInput.value) || m.name })));
  decksSelect.addEventListener('change', () => edit(m => ({ ...m, decks: Math.min(MAX_DECKS, Math.max(1, Number(decksSelect.value) || 2)) })));
  section.replaceChildren(
    h('header', { class: 'screen-head' }, h('div', { class: 'screen-title' }, h('span', { class: 'screen-icon', html: icon('keyboard', { size: 24 }) }),
      h('div', {}, h('h1', { tabindex: '-1', text: 'MIDI mapper' }),
        h('p', { class: 'lede', text: 'Turn a controller\'s learned MIDI map into a mapping for Mixxx or VirtualDJ, or a report for Traktor and Serato. Nothing is sent anywhere and no DJ software is changed: you copy the saved files yourself.' })))),
    h('div', { class: 'card mp-source' },
      h('div', { class: 'mp-row' },
        h('label', { class: 'mp-field', for: 'mp-device' }, h('span', { class: 'field-label', text: 'Unit' }), deviceSelect),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'mp-load-device', text: 'Load MIDI map', onclick: () => loadFromDevice() }),
        h('button', { type: 'button', class: 'btn btn-secondary', id: 'mp-open', onclick: openFiles }, h('span', { html: icon('file', { size: 18 }) }), h('span', { text: 'Open file…' })),
        h('button', { type: 'button', class: 'btn btn-secondary', id: 'mp-new', text: 'New empty', onclick: newModel })),
      h('div', { class: 'mp-row' },
        h('label', { class: 'mp-field', for: 'mp-saved' }, h('span', { class: 'field-label', text: 'Saved' }), savedSelect),
        h('button', { type: 'button', class: 'btn btn-secondary', id: 'mp-open-saved', text: 'Open', onclick: openSaved }),
        h('button', { type: 'button', class: 'btn btn-ghost', id: 'mp-delete-saved', 'aria-label': 'Delete saved mapping', onclick: deleteSaved }, h('span', { html: icon('trash', { size: 18 }) }))),
      h('div', { class: 'mp-row' },
        h('label', { class: 'mp-field mp-grow', for: 'mp-name' }, h('span', { class: 'field-label', text: 'Mapping name' }), nameInput),
        h('label', { class: 'mp-field', for: 'mp-decks' }, h('span', { class: 'field-label', text: 'Decks' }), decksSelect),
        h('button', { type: 'button', class: 'btn btn-secondary', id: 'mp-save-model', text: 'Save mapping', onclick: saveModel })),
      h('p', { class: 'muted small', text: 'Opens Mixxx .midi.xml (add its .js script files to keep them), VirtualDJ device + mapper .xml (pick both), or a DeckChek .json mapping or learned map. Up to 5 MB each; scripts are kept as text and never run.' }),
      status, warningsBox),
    h('div', { class: 'mp-panes' }, left, centre, right));

  // Screen keys work wherever focus is while this screen is shown (re-renders can drop focus to <body>).
  document.addEventListener('keydown', ev => {
    if (section.hidden || document.querySelector('dialog[open]') || isTyping(ev.target)) return;
    const ctrl = ev.ctrlKey || ev.metaKey;
    if (ctrl && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); doUndo(); return; }
    if (!ctrl && !ev.altKey && (ev.key === 'l' || ev.key === 'L')) { ev.preventDefault(); learn(); }
  });

  renderAll();
  refreshPorts().then(() => keepFocus(renderLeft));
  refreshSaved();
  loadLibrary();
  return {
    onShow: () => {
      const hand = takeHandoff('mapper');
      refreshSaved();
      loadLibrary().then(() => { if (hand?.assetId) { deviceSelect.value = hand.assetId; loadFromDevice(hand.assetId); } });
    },
    onHide: () => { stopLearn(); },
    onEscape: () => stopLearn('Learning cancelled.'),
    onSave: () => { saveExport(); },
  };
}

export function mapperScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-mapper')) main.append(h('section', { class: 'screen', id: 'screen-mapper', hidden: true }));
  return [{ id: 'mapper', title: 'MIDI mapper', short: 'Mapper', icon: 'keyboard', feature: 'mapperStudio', create: createMapperScreen }];
}
