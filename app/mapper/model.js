// Neutral DeckChek mapping model (FS-32 §5, version 1). Pure functions only: creating, sanitising untrusted model
// JSON, normalising for deterministic export and round-trip comparison, and small immutable edit helpers used by the
// mapper screen. Formats (Mixxx, VirtualDJ, reports) convert to and from this model; nothing here knows about them.
//
// Control: {id, label, midi:{type, channel, number, status, lsbNumber?, encoding?}, kind, mode, layer,
//           function:{id, deck, args}|null, feedback:{led:{type, channel, number, on, off}}|null, custom?}
// `custom` holds a control imported from a DJ-software file that DeckChek does not recognise; it is preserved and
// written back unchanged to the same target ("unmapped/custom (preserved)", AC-3).

import { functionDef, normalizeFunction, defaultMode, LAYERS, MAX_DECKS, RELATIVE_ENCODINGS } from './vocabulary.js';
import { parseMessage } from '../midi-tests.js';

export const MODEL_VERSION = 1;
export const MIDI_TYPES = ['note', 'cc', 'cc14', 'pitchbend'];
export const SOURCES = ['learned', 'profile', 'import-mixxx', 'import-vdj', 'manual'];
export const LIMITS = Object.freeze({
  maxImportBytes: 5 * 1024 * 1024, // any imported file (XML, JSON, JS)
  maxModelBytes: 2 * 1024 * 1024, // stored model JSON (Rust re-checks)
  maxControls: 2048,
  maxText: 120, // name, manufacturer, labels
  maxCustomText: 256, // preserved custom strings (group, key, action)
  maxScriptFiles: 16,
});

const STATUS_BASE = { note: 0x90, cc: 0xb0, cc14: 0xb0, pitchbend: 0xe0 };

/** MIDI status byte for a message type on channel 1..16. */
export const statusByte = (type, channel) => (STATUS_BASE[type] ?? 0xb0) | ((Number(channel) - 1) & 0x0f);

/** Stable control id from the MIDI triple and layer (FS-32 §6 normalisation). */
export function controlIdFor(midi, layer = 'base') {
  const t = midi?.type === 'cc14' ? 'cc' : midi?.type;
  return `c-${t}-${midi?.channel}-${midi?.number}${layer === 'shift' ? '-shift' : ''}`;
}

/** Hardware value kind implied by a message type (a cc can also be a button or an encoder; the user can change it). */
export const kindForType = type => (type === 'note' ? 'button' : 'absolute');

/** Plain text field: string, control characters removed, trimmed, length-capped. */
export function cleanText(value, max = LIMITS.maxText) {
  if (value == null) return '';
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

const int = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };

/** Keep the shape of a MIDI descriptor; out-of-range numbers are kept as numbers so validation can report them. */
function cleanMidi(m) {
  if (!m || typeof m !== 'object') return null;
  const type = MIDI_TYPES.includes(m.type) ? m.type : m.type === 'note-on' || m.type === 'note-off' ? 'note' : null;
  if (!type) return null;
  const num = v => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.trunc(Number(v)) : null);
  const channel = num(m.channel), number = type === 'pitchbend' ? 0 : num(m.number);
  if (channel == null || number == null) return null;
  const out = { type, channel, number, status: statusByte(type, channel) };
  if (type === 'cc14') out.lsbNumber = num(m.lsbNumber) ?? number + 32;
  if (RELATIVE_ENCODINGS.includes(m.encoding)) out.encoding = m.encoding;
  return out;
}

function cleanFunction(fn) {
  if (!fn || typeof fn !== 'object' || !functionDef(fn.id)) return null;
  const def = functionDef(fn.id);
  const args = {};
  const src = fn.args && typeof fn.args === 'object' ? fn.args : {};
  for (const a of def.args) {
    if (src[a.name] == null) continue;
    args[a.name] = typeof a.values[0] === 'number' ? Number(src[a.name]) : String(src[a.name]).slice(0, 16);
  }
  const deck = fn.deck == null || fn.deck === '' ? null : Math.trunc(Number(fn.deck));
  return { id: def.id, deck: Number.isFinite(deck) ? deck : null, args };
}

function cleanLed(led) {
  if (!led || typeof led !== 'object') return null;
  const type = led.type === 'cc' ? 'cc' : led.type === 'note' ? 'note' : null;
  const channel = int(led.channel, 1, 16), number = int(led.number, 0, 127);
  if (!type || channel == null || number == null) return null;
  return { type, channel, number, on: int(led.on, 0, 127) ?? 127, off: int(led.off, 0, 127) ?? 0 };
}

/** Preserved custom entry: only plain strings/numbers/booleans and string arrays, length-capped. */
function cleanCustom(c) {
  if (!c || typeof c !== 'object' || !['mixxx', 'vdj'].includes(c.target)) return null;
  const out = { target: c.target };
  for (const [k, v] of Object.entries(c)) {
    if (k === 'target' || !/^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(k)) continue;
    if (typeof v === 'string') out[k] = String(v).slice(0, LIMITS.maxCustomText);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 16).map(x => String(x).slice(0, 64));
  }
  return out;
}

/** One control from untrusted input, or null when it has no usable MIDI message. */
export function cleanControl(c) {
  if (!c || typeof c !== 'object') return null;
  const midi = cleanMidi(c.midi);
  if (!midi) return null;
  const layer = LAYERS.includes(c.layer) ? c.layer : 'base';
  const fn = cleanFunction(c.function);
  const kind = ['button', 'absolute', 'relative'].includes(c.kind) ? c.kind : kindForType(midi.type);
  const out = {
    id: controlIdFor(midi, layer),
    label: cleanText(c.label) || defaultLabel(midi),
    midi, kind, mode: fn ? defaultMode(fn) : kind === 'button' ? 'momentary' : kind,
    layer, function: fn,
    feedback: c.feedback?.led ? { led: cleanLed(c.feedback.led) } : null,
  };
  if (out.feedback && !out.feedback.led) out.feedback = null;
  const custom = cleanCustom(c.custom);
  if (custom) out.custom = custom;
  return out;
}

export const defaultLabel = midi => `${midi.type === 'note' ? 'Note' : midi.type === 'pitchbend' ? 'Pitch bend' : 'CC'} ${midi.type === 'pitchbend' ? '' : midi.number + ' '}ch ${midi.channel}`.replace(/\s+/g, ' ').trim();

export function createModel({ name = 'New mapping', manufacturer = '', decks = 2, source = 'manual', sourceId = null } = {}) {
  return { version: MODEL_VERSION, name: cleanText(name) || 'New mapping', manufacturer: cleanText(manufacturer), decks: int(decks, 1, MAX_DECKS) ?? 2, controls: [], provenance: { source: SOURCES.includes(source) ? source : 'manual', sourceId: sourceId == null ? null : cleanText(sourceId) } };
}

/**
 * Sanitise an untrusted model object. Returns {model, warnings, readOnly}. A newer `version` is kept read-only with a
 * warning (FS-32 §5); controls without a usable MIDI message are dropped with a warning; over-limit lists are cut.
 */
export function sanitizeModel(obj) {
  const warnings = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { model: null, warnings: ['The file does not contain a mapping model.'], readOnly: false };
  const version = Number(obj.version);
  let readOnly = false;
  if (!Number.isInteger(version) || version < 1) return { model: null, warnings: ['The mapping model has no valid version.'], readOnly: false };
  if (version > MODEL_VERSION) { readOnly = true; warnings.push(`This mapping was made by a newer DeckChek (model version ${version}). It is shown read-only.`); }
  const model = createModel({ name: obj.name, manufacturer: obj.manufacturer, decks: obj.decks, source: obj.provenance?.source, sourceId: obj.provenance?.sourceId });
  const list = Array.isArray(obj.controls) ? obj.controls : [];
  if (list.length > LIMITS.maxControls) warnings.push(`Only the first ${LIMITS.maxControls} controls were kept.`);
  let dropped = 0;
  for (const c of list.slice(0, LIMITS.maxControls)) { const k = cleanControl(c); if (k) model.controls.push(k); else dropped++; }
  uniqueIds(model.controls);
  if (dropped) warnings.push(`${dropped} control${dropped === 1 ? ' has' : 's have'} no usable MIDI message and ${dropped === 1 ? 'was' : 'were'} skipped.`);
  const pres = sanitizePreserved(obj.preserved);
  if (pres) model.preserved = pres;
  return { model, warnings, readOnly };
}

function sanitizePreserved(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  const mx = p.mixxx;
  if (mx && typeof mx === 'object') {
    const files = (Array.isArray(mx.scriptfiles) ? mx.scriptfiles : []).slice(0, LIMITS.maxScriptFiles)
      .map(f => ({ filename: cleanText(f?.filename, LIMITS.maxCustomText), functionprefix: cleanText(f?.functionprefix, 64) })).filter(f => f.filename);
    const outputs = (Array.isArray(mx.outputs) ? mx.outputs : []).slice(0, LIMITS.maxControls).map(o => cleanCustom({ ...o, target: 'mixxx' })).filter(Boolean);
    const info = mx.info && typeof mx.info === 'object' ? Object.fromEntries(Object.entries(mx.info).filter(([k, v]) => /^[a-z]{1,16}$/.test(k) && typeof v === 'string').slice(0, 12).map(([k, v]) => [k, String(v).slice(0, 2000)])) : null;
    if (files.length || outputs.length || info) out.mixxx = { scriptfiles: files, outputs, ...(info ? { info } : {}) };
  }
  return Object.keys(out).length ? out : null;
}

/** Give controls that share a MIDI triple and layer distinct ids (`…~2`) so validation can point at each one. */
export function uniqueIds(controls) {
  const seen = new Map();
  for (const c of controls) {
    const n = (seen.get(c.id) || 0) + 1;
    seen.set(c.id, n);
    if (n > 1) c.id = `${c.id}~${n}`;
  }
  return controls;
}

const LAYER_ORDER = { base: 0, shift: 1 };

/** Canonical form: sanitised, functions normalised, sorted by (layer, status, number), ids from the MIDI triple. */
export function normalizeModel(model) {
  const { model: m } = sanitizeModel(model);
  if (!m) return null;
  for (const c of m.controls) {
    if (c.function) {
      const n = normalizeFunction(c.function, m.decks);
      c.function = n;
      c.mode = defaultMode(n);
    }
  }
  m.controls.sort((a, b) => LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer] || a.midi.status - b.midi.status || a.midi.number - b.midi.number || a.id.localeCompare(b.id));
  return m;
}

/**
 * Offset of the first JSON syntax error (for "line X, column Y" messages; engines differ in what they report), or
 * null. A validating scan only: nothing is built, nesting is capped.
 */
export function jsonErrorPosition(text) {
  let i = 0;
  const n = text.length;
  const fail = () => { throw i; };
  const ws = () => { while (i < n && ' \t\n\r'.includes(text[i])) i++; };
  const lit = w => { if (text.startsWith(w, i)) i += w.length; else fail(); };
  const str = () => {
    i++;
    while (i < n && text[i] !== '"') {
      if (text.charCodeAt(i) < 0x20) fail();
      if (text[i] === '\\') { i++; if (text[i] === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) fail(); i += 4; } else if (!'"\\/bfnrt'.includes(text[i] ?? 'x')) fail(); }
      i++;
    }
    if (i >= n) fail();
    i++;
  };
  const num = () => { const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 400)); if (!m) fail(); i += m[0].length; };
  const val = depth => {
    if (depth > 512) fail();
    ws();
    const c = text[i];
    if (c === '{') {
      i++; ws();
      if (text[i] === '}') { i++; return; }
      for (;;) { ws(); if (text[i] !== '"') fail(); str(); ws(); if (text[i] !== ':') fail(); i++; val(depth + 1); ws(); if (text[i] === ',') { i++; continue; } if (text[i] === '}') { i++; return; } fail(); }
    }
    if (c === '[') {
      i++; ws();
      if (text[i] === ']') { i++; return; }
      for (;;) { val(depth + 1); ws(); if (text[i] === ',') { i++; continue; } if (text[i] === ']') { i++; return; } fail(); }
    }
    if (c === '"') return str();
    if (c === 't') return lit('true');
    if (c === 'f') return lit('false');
    if (c === 'n') return lit('null');
    return num();
  };
  try { val(0); ws(); if (i < n) fail(); return null; } catch (pos) { return typeof pos === 'number' ? Math.min(pos, n) : null; }
}

/**
 * Parse an untrusted JSON file (a saved model or a learned map export). Never throws.
 * Returns {ok:true, kind:'model'|'learned', value} or {ok:false, error:{code, message, line, column}}.
 */
export function parseJsonFile(text) {
  if (typeof text !== 'string') return { ok: false, error: { code: 'JSON_SYNTAX', message: 'The file is not text.' } };
  if (text.length > LIMITS.maxImportBytes) return { ok: false, error: { code: 'TOO_LARGE', message: 'The file is larger than 5 MB.' } };
  let value;
  const body = text.replace(/^\uFEFF/, '');
  try { value = JSON.parse(body); } catch {
    const pos = jsonErrorPosition(body);
    let line = null, column = null;
    if (pos != null) { const before = body.slice(0, pos).split('\n'); line = before.length; column = before[before.length - 1].length + 1; }
    return { ok: false, error: { code: 'JSON_SYNTAX', message: `The file is not valid JSON${line ? ` (line ${line}, column ${column})` : ''}.`, line, column } };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: { code: 'JSON_SHAPE', message: 'The JSON file does not hold a mapping or a learned MIDI map.' } };
  // A learned map (stored row {map:{controls}} or the map itself) has profile-schema `message` entries and no model version.
  const map = value.map && typeof value.map === 'object' ? value.map : value;
  const learnedShape = Array.isArray(map.controls) && (value.map || map.mapSource || map.controls.some(c => c && typeof c === 'object' && 'message' in c));
  if (Number.isInteger(value.version) && Array.isArray(value.controls) && !value.controls.some(c => c && typeof c === 'object' && 'message' in c && !('midi' in c))) return { ok: true, kind: 'model', value };
  if (learnedShape) return { ok: true, kind: 'learned', value };
  return { ok: false, error: { code: 'JSON_SHAPE', message: 'The JSON file does not hold a mapping or a learned MIDI map.' } };
}

// ------------------------------------------------------------------------------------------------ edit helpers

const clone = v => JSON.parse(JSON.stringify(v));

/** MIDI descriptor for a raw learned message, or null for messages a mapping cannot use (clock, sysex, …). */
export function midiFromBytes(bytes) {
  const msg = parseMessage(bytes);
  if (msg.kind === 'note-on' || msg.kind === 'note-off') return { type: 'note', channel: msg.channel, number: msg.number, status: statusByte('note', msg.channel) };
  if (msg.kind === 'cc') return { type: 'cc', channel: msg.channel, number: msg.number, status: statusByte('cc', msg.channel) };
  if (msg.kind === 'pitchbend') return { type: 'pitchbend', channel: msg.channel, number: 0, status: statusByte('pitchbend', msg.channel) };
  return null;
}

/** Find a control by MIDI message and layer (cc14 also matches on its LSB). */
export function findByMidi(model, midi, layer = 'base') {
  const t = midi.type === 'cc14' ? 'cc' : midi.type;
  return (model?.controls || []).find(c => c.layer === layer && (c.midi.type === 'cc14' ? 'cc' : c.midi.type) === t && c.midi.channel === midi.channel
    && (c.midi.number === midi.number || (c.midi.type === 'cc14' && c.midi.lsbNumber === midi.number))) || null;
}

/** Add a control for a learned message (or return the model unchanged and the existing control). */
export function addLearnedControl(model, midi, { label = '', layer = 'base' } = {}) {
  const existing = findByMidi(model, midi, layer);
  if (existing) return { model, control: existing, added: false };
  if (model.controls.length >= LIMITS.maxControls) return { model, control: null, added: false };
  const control = cleanControl({ midi, label, layer, kind: kindForType(midi.type) });
  const next = clone(model);
  next.controls.push(control);
  return { model: next, control, added: true };
}

/** Return a copy with one control patched (label, kind, layer, midi, function, feedback). Ids follow MIDI/layer. */
export function updateControl(model, id, patch) {
  const next = clone(model);
  const i = next.controls.findIndex(c => c.id === id);
  if (i < 0) return { model, id };
  const merged = cleanControl({ ...next.controls[i], ...clone(patch) });
  if (!merged) return { model, id };
  if (patch && 'function' in patch && patch.function == null) merged.function = null;
  next.controls[i] = merged;
  next.controls = next.controls.map((c, k) => (k === i ? c : { ...c, id: c.id.replace(/~\d+$/, '') }));
  uniqueIds(next.controls);
  return { model: next, id: next.controls[i].id };
}

export function removeControl(model, id) {
  const next = clone(model);
  next.controls = next.controls.filter(c => c.id !== id);
  return next;
}

/** Counts for the partial state: {total, assigned, unassigned, custom}. */
export function modelStats(model) {
  const cs = model?.controls || [];
  const custom = cs.filter(c => !c.function && c.custom).length;
  const assigned = cs.filter(c => c.function).length;
  return { total: cs.length, assigned, custom, unassigned: cs.length - assigned - custom };
}
