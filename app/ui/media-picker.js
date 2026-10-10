// Test-media state and pickers (FS-06): loads the built-in library, keeps the shared list, builds the
// "Test medium" combobox used by the Speed, Cartridge and DVS forms and prefills expected values.
// Flag: features.testMedia. With the flag off nothing is loaded and the form field has no modes.

import { h } from './dom.js';
import { icon } from './icons.js';
import { announce } from './live.js';
import { emit, on } from './state.js';
import { isEnabled, onFeatureChange } from '../features.js';
import { PARAMS } from './workflows/definitions.js';
import { createMediaStore, loadBuiltInMedia, listMedia, expectedValuesFor, TEST_KINDS, UNVERIFIED_WARNING } from '../media-library.js';

export const PARAM_ID = 'testMedium';
const SEP = '::';
const CUSTOM = '__custom';

export const media = { entries: [], ready: false, problems: [], error: null, store: null };

function storage() { try { const s = globalThis.localStorage; s?.getItem('x'); return s; } catch { return null; } }
function nativeInvoke() { return globalThis.window?.__TAURI__?.core?.invoke ?? null; }
export function mediaStore() {
  media.store ??= createMediaStore({ invoke: nativeInvoke(), storage: storage() });
  return media.store;
}

// ---------- value encoding: "<mediaId>" or "<mediaId>::<trackKey>" ----------
export const encodeChoice = (mediaId, trackKey = null) => (trackKey ? `${mediaId}${SEP}${trackKey}` : String(mediaId));
export function decodeChoice(value) {
  const s = String(value ?? '');
  if (!s || s === CUSTOM) return { mediaId: null, trackKey: null };
  const i = s.indexOf(SEP);
  return i < 0 ? { mediaId: s, trackKey: null } : { mediaId: s.slice(0, i), trackKey: s.slice(i + SEP.length) || null };
}
/** `{mediaId, mediaTrackKey}` for a saved result, from a workflow's collected params (null fields when none chosen). */
export function mediaRefFromParams(params) {
  const { mediaId, trackKey } = decodeChoice(params?.[PARAM_ID]);
  return { mediaId, mediaTrackKey: trackKey };
}

/**
 * Human text for a saved `{mediaId, mediaTrackKey}` (FS-06 AC-6): "<name> — track 5 · 1000 Hz". Falls back to the raw id
 * for a medium that has since been deleted. Null when no medium was used. Loads the library when the flag is on.
 */
export async function describeMediaRef(ref) {
  const mediaId = ref?.mediaId;
  if (!mediaId) return null;
  if (!media.ready && isEnabled('testMedia')) { try { await ensureMedia(); } catch { /* fall through to the id */ } }
  const entry = findEntry(mediaId);
  if (!entry) return mediaId;
  const key = ref.mediaTrackKey ?? ref.trackKey;
  const track = key ? (entry.profile?.tracks || []).find(t => t.key === key) : null;
  return track ? `${entry.name} — ${trackText(track)}` : entry.name;
}

// ---------- loading ----------
let loading = null;
export function ensureMedia({ force = false } = {}) {
  if (loading && !force) return loading;
  loading = (async () => {
    const store = mediaStore();
    try {
      const { media: builtin, problems } = await loadBuiltInMedia();
      media.problems = problems;
      try { await store.syncBuiltIns(builtin); } catch (e) { media.error = `Could not sync the media library: ${e?.message || e}`; }
      media.entries = await store.list();
    } catch (e) {
      media.error = `Could not load the media library: ${e?.message || e}`;
      try { media.entries = await store.list(); } catch { media.entries = []; }
    }
    media.ready = true;
    refreshParam();
    emit('media', media);
    return media;
  })();
  return loading;
}
export async function reloadMedia() {
  try { media.entries = await mediaStore().list(); media.error = null; } catch (e) { media.error = `Could not read the media library: ${e?.message || e}`; }
  refreshParam();
  emit('media', media);
}

export const findEntry = id => media.entries.find(e => e.id === id) || null;

// ---------- choices ----------
const trackText = t => [t.trackNo ? `track ${t.trackNo}` : (t.label || t.key), t.label && t.trackNo ? t.label : null, Number.isFinite(t.frequencyHz) ? `${Number(t.frequencyHz.toFixed(3))} Hz` : null].filter(Boolean).join(' · ');

/** Grouped choices for a test: [{entry, options:[{value, text}]}], filtered to the kinds the test can use. */
export function choicesFor(testId, entries = media.entries) {
  const kinds = TEST_KINDS[testId];
  return listMedia(entries).filter(e => !kinds || kinds.includes(e.kind)).map(entry => {
    const tracks = entry.profile?.tracks || [];
    const options = entry.kind === 'timecode' || !tracks.length
      ? [{ value: encodeChoice(entry.id), text: entry.name }]
      : tracks.map(t => ({ value: encodeChoice(entry.id, t.key), text: trackText(t) }));
    return { entry, options };
  });
}

/** Resolve a picker value to its medium, expected values and display label; null when "Auto" or unknown. */
export function describeChoice(value, testId, entries = media.entries) {
  const { mediaId, trackKey } = decodeChoice(value);
  const entry = entries.find(e => e.id === mediaId);
  if (!entry) return null;
  const expected = expectedValuesFor(entry, trackKey, testId);
  return expected ? { entry, trackKey, expected } : null;
}

function fillSelect(select, testId, value) {
  select.replaceChildren(h('option', { value: '', text: 'Auto' }));
  for (const g of choicesFor(testId)) {
    const grp = h('optgroup', { label: g.entry.owned ? `${g.entry.name} (I own this)` : g.entry.name });
    g.options.forEach(o => grp.append(h('option', { value: o.value, text: o.text })));
    select.append(grp);
  }
  select.append(h('option', { value: CUSTOM, text: 'Custom…' }));
  select.value = [...select.options].some(o => o.value === value) ? value : '';
}

// ---------- chip + warning ----------
export function renderChip(host, described) {
  host.replaceChildren();
  host.hidden = !described;
  if (!described) return;
  const { expected } = described;
  host.append(h('span', { class: 'media-chip-label', text: expected.label }));
  if (expected.unverified) {
    host.append(h('span', { class: 'media-warning', role: 'note', html: `${icon('warn', { size: 16 })}<span></span>` }));
    host.querySelector('.media-warning span:last-child').textContent = expected.warning || UNVERIFIED_WARNING;
  }
}

/**
 * Standalone picker: labelled select + chip. `onChange({value, mediaId, trackKey, described})`.
 * The Speed/Cartridge/DVS forms use the same pieces through the param below.
 */
export function createMediaPicker({ testId, onChange = () => {}, value = '' } = {}) {
  const id = `media-pick-${testId}-${Math.random().toString(36).slice(2, 7)}`;
  const select = h('select', { id, 'data-media-picker': testId });
  const chipHost = h('div', { class: 'media-chip', role: 'status', hidden: true });
  const wrap = h('div', { class: 'field media-picker' }, h('label', { class: 'field-label', for: id, text: 'Test medium' }), select, chipHost);
  fillSelect(select, testId, value);
  const update = () => {
    const described = describeChoice(select.value, testId);
    renderChip(chipHost, described);
    onChange({ value: select.value, ...decodeChoice(select.value), described });
  };
  select.addEventListener('change', update);
  on('media', () => { const v = select.value; fillSelect(select, testId, v); renderChip(chipHost, describeChoice(select.value, testId)); });
  if (value) renderChip(chipHost, describeChoice(value, testId));
  return wrap;
}

// ---------- the workflow form parameter ----------
export const getParam = () => PARAMS.find(p => p.id === PARAM_ID) || null;

/** Show/hide the form field with the flag and keep the static option list in step with the library. */
export function refreshParam() {
  const p = getParam();
  if (!p) return;
  p.modes = isEnabled('testMedia') ? [...(p.allModes || [])] : [];
  const flat = [['', 'Auto']];
  for (const e of media.entries) {
    const tracks = e.profile?.tracks || [];
    if (e.kind === 'timecode' || !tracks.length) flat.push([encodeChoice(e.id), e.name]);
    else tracks.forEach(t => flat.push([encodeChoice(e.id, t.key), `${e.name} — ${trackText(t)}`]));
  }
  p.options = flat;
  for (const s of document.querySelectorAll(`select[data-param="${PARAM_ID}"][data-media-ready]`)) {
    const wf = workflowOf(s);
    fillSelect(s, wf, s.value);
    paintChip(s, wf);
  }
}

const workflowOf = el => el.closest('section.screen')?.id.replace(/^screen-/, '') || '';
const RPM_OPTIONS = [[33.333333, '33.333333'], [45, '45'], [78, '78']];
const rpmOption = rpm => (Number.isFinite(rpm) ? RPM_OPTIONS.find(([r]) => Math.abs(r - rpm) < 0.01)?.[1] : null) ?? null;

function noteFor(input, text, warning = null) {
  const label = input.closest('label.field');
  if (!label) return;
  label.querySelectorAll('.media-prefill-note').forEach(n => n.remove());
  if (!text) { input.removeAttribute('aria-describedby'); delete input.dataset.fromMedium; return; }
  const id = `media-note-${input.dataset.param}`;
  const note = h('span', { class: `field-help media-prefill-note${warning ? ' media-prefill-unverified' : ''}`, id, role: 'note' });
  if (warning) note.append(h('strong', { text: `${warning}. ` }));
  note.append(text);
  label.append(note);
  input.setAttribute('aria-describedby', id);
  input.dataset.fromMedium = '1';
}

let programmatic = false;
function setField(input, value) {
  programmatic = true;
  try {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } finally { programmatic = false; }
}

/** Write the expected values into the neighbouring fields and mark each with a note (and the warning when unverified). */
export function applyPrefill(select, described) {
  const scope = select.closest('.field-grid') || select.closest('section') || document;
  const fieldOf = id => scope.querySelector(`[data-param="${id}"]`);
  const warning = described?.expected?.unverified ? (described.expected.warning || UNVERIFIED_WARNING) : null;
  const shown = [];
  const ref = fieldOf('referenceHz'), rpm = fieldOf('nominalRpm'), fmt = fieldOf('timecodeFormat');
  for (const input of [ref, rpm, fmt]) if (input?.dataset.fromMedium) { noteFor(input, null); }
  if (fmt?.dataset.mediumSet) { setField(fmt, ''); delete fmt.dataset.mediumSet; } // medium cleared: back to auto-detect
  if (!described) return shown;
  const e = described.expected;
  const fmtName = timecodeFormatChoice(fmt, e);
  if (fmt && fmtName) { setField(fmt, fmtName); fmt.dataset.mediumSet = '1'; noteFor(fmt, `${e.label}.`, warning); shown.push('timecode format'); fmt.addEventListener('change', clearOnEdit); }
  if (ref && Number.isFinite(e.referenceHz)) { setField(ref, Number(e.referenceHz.toFixed(3))); noteFor(ref, `${e.label}.`, warning); shown.push('reference tone'); ref.addEventListener('input', clearOnEdit, { once: false }); }
  const rpmValue = rpmOption(e.nominalRpm);
  if (rpm && rpmValue) { setField(rpm, rpmValue); noteFor(rpm, `${e.label}.`, warning); shown.push('nominal speed'); rpm.addEventListener('change', clearOnEdit); }
  return shown;
}
/** The decoder format a timecode medium selects, when the form's format list offers it; else null (auto-detect stays). */
export function timecodeFormatChoice(field, expected) {
  const name = expected?.formatName;
  if (!field || !name) return null;
  return [...(field.options || [])].some(o => o.value === name) ? name : null;
}
function clearOnEdit(event) {
  if (programmatic) return;
  delete event.currentTarget.dataset.mediumSet;
  noteFor(event.currentTarget, null); // a manual edit overrides the medium (precedence: user > medium)
}

function paintChip(select, testId) {
  const label = select.closest('label.field');
  if (!label) return;
  let host = label.querySelector('.media-chip');
  if (!host) { host = h('div', { class: 'media-chip', role: 'status' }); label.append(host); }
  renderChip(host, describeChoice(select.value, testId));
}

const previous = new WeakMap();
let pendingUse = null;
/** "Use in test" from the library: the next time that form renders, its picker is set to this choice. */
export function useInTest(testId, value) { pendingUse = { testId, value, at: Date.now() }; decorateAll(); }

function decorate(select) {
  if (select.dataset.mediaReady) return;
  select.dataset.mediaReady = '1';
  const testId = workflowOf(select);
  select.id ||= `${testId}-test-medium`;
  fillSelect(select, testId, select.value);
  paintChip(select, testId);
  previous.set(select, select.value);
  select.addEventListener('change', () => {
    if (select.dataset.guard) return;
    if (select.value === CUSTOM) {
      const back = previous.get(select) ?? '';
      select.value = back;
      select.dataset.guard = '1';
      try { select.dispatchEvent(new Event('change', { bubbles: true })); } finally { delete select.dataset.guard; }
      import('./shell.js').then(m => m.go('media'));
      return;
    }
    previous.set(select, select.value);
    const described = describeChoice(select.value, testId);
    paintChip(select, testId);
    const shown = applyPrefill(select, described);
    announce(described ? `${described.expected.label}.${shown.length ? ` Prefilled ${shown.join(' and ')}.` : ''}${described.expected.unverified ? ` ${described.expected.warning}.` : ''}` : 'Test medium: Auto.');
  });
}

function decorateAll() {
  for (const s of document.querySelectorAll(`select[data-param="${PARAM_ID}"]:not([data-media-ready])`)) decorate(s);
  if (pendingUse) {
    if (Date.now() - pendingUse.at > 4000) { pendingUse = null; return; }
    const s = document.querySelector(`#screen-${pendingUse.testId}:not([hidden]) select[data-param="${PARAM_ID}"][data-media-ready]`);
    if (s && [...s.options].some(o => o.value === pendingUse.value)) {
      const value = pendingUse.value; pendingUse = null;
      s.value = value;
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

let installed = false;
/** Idempotent; called from app.js. Loads the library when the flag is on and decorates forms as they render. */
export function installMediaPicker() {
  if (installed) return;
  installed = true;
  refreshParam();
  onFeatureChange(({ name }) => { if (name === 'testMedia') { refreshParam(); if (isEnabled('testMedia')) ensureMedia(); } });
  const main = document.getElementById('main');
  if (main) new MutationObserver(decorateAll).observe(main, { childList: true, subtree: true });
  if (isEnabled('testMedia')) ensureMedia();
}
