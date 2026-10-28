// VirtualDJ controller definition + mapper export/import (FS-32 §5, AC-2, AC-3, AC-5).
//
// VirtualDJ splits a custom controller into two XML files (VirtualDJ wiki, ControllerDefinitionMIDI):
//  - a definition in Documents/VirtualDJ/Devices: <device name type="MIDI" decks version> with named <button>,
//    <slider>, <encoder> and <led> entries carrying note= or cc=, channel= (0-based) and deck=;
//  - a mapper in Documents/VirtualDJ/Mappers: <mapper device> with <map value="NAME" action="VDJscript"/>.
// A custom definition for a controller VirtualDJ already supports must be named force-<name>.xml.
// The mapper schema details are UNVERIFIED (FS-32 §5); every export carries a warning saying so, and the owner checks
// it in VirtualDJ (docs/testing/HARDWARE-TEST-SCRIPTS.md H-32). Shift uses VDJscript's `shift ? A : B`.
// Lossy by design (normalised away in round-trip comparisons): labels keep only letters, digits and spaces; 14-bit
// faders are written as their 7-bit MSB; encoder encodings other than two's complement are not expressed.

import { writeXml, el, parseXml, kids } from './xml.js';
import { FUNCTION_TARGETS, FUNCTIONS, deckApplies, normalizeFunction, MAX_DECKS } from './vocabulary.js';
import { normalizeModel, createModel, cleanControl, uniqueIds, cleanText, LIMITS } from './model.js';
import { validateModel, checkExportSize } from './validate.js';
import { fileStem } from './mixxx.js';

export const VDJ_VERSION = '800';
export const VDJ_UNVERIFIED = 'The VirtualDJ mapper format is not fully documented; load the files in VirtualDJ and check each control before relying on them.';
const hex = n => `0x${Number(n).toString(16).toUpperCase().padStart(2, '0')}`;
const ELEMENT_KIND = { button: 'button', pad: 'button', slider: 'absolute', knob: 'absolute', encoder: 'relative', jog: 'relative' };

/** Definition element name from a label: letters, digits and underscores, at most 40, never empty. */
export function vdjName(label, fallback = 'CONTROL') {
  const s = String(label ?? '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return s || fallback;
}

/** Action text with only characters VDJscript actions use (no quotes or markup reach the file unescaped anyway). */
const cleanAction = a => cleanText(a, LIMITS.maxCustomText);

/**
 * exportVdj(model, {name, author, force}) -> {files:[{name:'Devices/<stem>.xml'}, {name:'Mappers/<stem>.xml'}],
 * warnings, errors}. `force` names the definition force-<stem>.xml (controller natively supported by VirtualDJ).
 */
export function exportVdj(model, { name, author = 'DeckChek', force = false } = {}) {
  const m = normalizeModel(model);
  if (!m) return { files: [], warnings: [], errors: [{ code: 'MODEL_INVALID', controlIds: [], message: 'There is no mapping to export.' }] };
  const deviceName = cleanText(name) || m.name;
  const { errors, warnings } = validateModel({ ...m, name: deviceName }, { target: 'vdj' });
  if (errors.length) return { files: [], warnings, errors };
  warnings.push({ code: 'VDJ_UNVERIFIED', controlIds: [], message: VDJ_UNVERIFIED });
  const stem = fileStem(deviceName);

  // One definition entry per MIDI message; base and shift functions on it combine into one action.
  const slots = new Map();
  const slotKey = c => `${c.midi.type === 'cc14' ? 'cc' : c.midi.type}:${c.midi.channel}:${c.midi.number}`;
  for (const c of m.controls) {
    if (c.midi.type === 'pitchbend') continue;
    if (c.custom && c.custom.target !== 'vdj') continue;
    if (!c.custom && !c.function) continue;
    const k = slotKey(c);
    if (!slots.has(k)) slots.set(k, { midi: c.midi, base: null, shift: null, controls: [] });
    const s = slots.get(k);
    s[c.layer] = c;
    s.controls.push(c);
  }
  const used = new Set();
  const uniqueName = base => { let n = base, i = 2; while (used.has(n.toLowerCase())) n = `${base}_${i++}`; used.add(n.toLowerCase()); return n; };
  const defs = [], maps = [];
  // A function for another deck than the definition entry's deck is addressed explicitly ("deck 3 play_pause").
  const actionOf = (c, elDeck) => {
    if (c?.custom) return cleanAction(c.custom.action);
    const fn = c?.function;
    const a = fn ? FUNCTION_TARGETS.vdj[fn.id]?.(fn) : null;
    return a && fn.deck && fn.deck !== elDeck ? `deck ${fn.deck} ${a}` : a;
  };
  for (const s of slots.values()) {
    const lead = s.base || s.shift;
    const custom = lead.custom;
    const fn = s.base?.function || s.shift?.function;
    const element = custom?.element && ELEMENT_KIND[custom.element] ? custom.element : lead.kind === 'button' ? 'button' : lead.kind === 'relative' ? 'encoder' : 'slider';
    const elName = uniqueName(custom?.name ? vdjName(custom.name) : vdjName(lead.label));
    const deck = s.base?.function?.deck || s.shift?.function?.deck || (Number.isInteger(custom?.deck) ? custom.deck : null);
    const attrs = { [lead.midi.type === 'note' ? 'note' : 'cc']: hex(lead.midi.number), channel: String(lead.midi.channel - 1), name: elName, deck: deck ? String(deck) : null };
    defs.push(el(element, attrs));
    if (lead.midi.type === 'cc14') warnings.push({ code: 'VDJ_14BIT', controlIds: [lead.id], message: `${lead.label}: written as a 7-bit fader (VirtualDJ 14-bit pairing is not exported).` });
    let action;
    const a = actionOf(s.base, deck), b = actionOf(s.shift, deck);
    if (s.shift) action = `shift ? ${b} : ${a || 'nothing'}`;
    else action = a;
    if (action) maps.push(el('map', { value: elName, action }));
    const led = s.base?.feedback?.led;
    if (led && s.base.function && fn) {
      const ledName = uniqueName(`LED_${elName}`);
      defs.push(el('led', { [led.type === 'note' ? 'note' : 'cc']: hex(led.number), channel: String(led.channel - 1), name: ledName, deck: s.base.function.deck ? String(s.base.function.deck) : null }));
      maps.push(el('map', { value: ledName, action: a }));
    }
    if (s.shift?.feedback?.led) warnings.push({ code: 'LED_SHIFT', controlIds: [s.shift.id], message: `${s.shift.label}: LEDs on the shift layer are not exported to VirtualDJ.` });
  }
  const definition = el('device', { name: deviceName, author: cleanText(author) || 'DeckChek', type: 'MIDI', decks: String(m.decks), version: VDJ_VERSION }, ...defs);
  const mapper = el('mapper', { device: deviceName, author: cleanText(author) || 'DeckChek', version: VDJ_VERSION }, ...maps);
  const files = [
    { name: `Devices/${force ? 'force-' : ''}${stem}.xml`, content: writeXml(definition) },
    { name: `Mappers/${stem}.xml`, content: writeXml(mapper) },
  ];
  const size = checkExportSize(files);
  if (size) return { files: [], warnings, errors: [size] };
  return { files, warnings, errors: [] };
}

// ------------------------------------------------------------------------------------------------ import

const ALIASES = { hotcue: 'hot_cue', cue_button: 'cue', play: 'play_pause', pitch_slider: 'pitch', jogwheel: 'jog', jog_wheel: 'jog', level: 'volume', keylock: 'key_lock', loop_halve: 'loop_half' };
const normAction = a => {
  const parts = String(a ?? '').trim().toLowerCase().replace(/\s+/g, ' ').split(' ');
  if (parts[0] && ALIASES[parts[0]]) parts[0] = ALIASES[parts[0]];
  return parts.join(' ');
};

let REVERSE = null;
/** VDJscript action (normalised, deck-independent) -> function template (deck filled from the definition). */
function reverse() {
  if (REVERSE) return REVERSE;
  REVERSE = new Map();
  for (const def of FUNCTIONS) {
    let combos = [{}];
    for (const a of def.args) combos = combos.flatMap(c => a.values.map(v => ({ ...c, [a.name]: v })));
    for (const raw of combos) {
      const fn = normalizeFunction({ id: def.id, deck: 1, args: raw }, MAX_DECKS);
      const action = normAction(FUNCTION_TARGETS.vdj[def.id](fn));
      if (!REVERSE.has(action)) REVERSE.set(action, fn);
    }
  }
  return REVERSE;
}

function recogniseAction(action, deck) {
  let a = normAction(action);
  let d = deck;
  const dm = /^deck ([1-4]) (.+)$/.exec(a);
  if (dm) { d = Number(dm[1]); a = dm[2]; }
  const tpl = reverse().get(a);
  if (!tpl) return null;
  const def = FUNCTIONS.find(f => f.id === tpl.id);
  const fn = { ...tpl, args: { ...tpl.args }, deck: deckApplies(def, tpl.args) ? (d || 1) : null };
  return fn;
}

function splitShift(action) {
  const m = /^\s*shift\s*\?\s*(.+?)\s*:\s*(.+?)\s*$/i.exec(String(action ?? ''));
  return m ? { shift: m[1], base: m[2] } : { shift: null, base: action };
}

const parseHexOrDec = t => { const s = String(t ?? '').trim(); const n = /^0x[0-9a-f]{1,2}$/i.test(s) ? parseInt(s.slice(2), 16) : /^\d{1,3}$/.test(s) ? Number(s) : NaN; return Number.isInteger(n) && n >= 0 && n <= 127 ? n : null; };

/**
 * importVdj(definitionXml, mapperXml?) -> {ok:true, model, preservedRaw, warnings} | {ok:false, error}. Also reads the
 * old single-file format (<note note="22" chan="0" action="loop" value="4"/>). Never throws.
 */
export function importVdj(definitionXml, mapperXml = null) {
  try {
    const def = parseXml(definitionXml, { maxBytes: LIMITS.maxImportBytes });
    if (!def.ok) return { ok: false, error: { ...def.error, message: `Definition: ${def.error.message}` } };
    let mapRoot = null;
    if (mapperXml != null && String(mapperXml).trim()) {
      const mp = parseXml(mapperXml, { maxBytes: LIMITS.maxImportBytes });
      if (!mp.ok) return { ok: false, error: { ...mp.error, message: `Mapper: ${mp.error.message}` } };
      mapRoot = mp.root;
    }
    let root = def.root;
    // Accept the two files in either order.
    if (root.name === 'mapper' && mapRoot?.name === 'device') [root, mapRoot] = [mapRoot, root];
    const warnings = [];
    const legacy = kids(root, 'note');
    if (root.name !== 'device' && !legacy.length) return { ok: false, error: { code: 'NOT_VDJ', message: 'This is not a VirtualDJ controller definition (the root element must be <device>).', line: root.line, column: root.column } };
    if (mapRoot && mapRoot.name !== 'mapper') return { ok: false, error: { code: 'NOT_VDJ', message: 'The second file is not a VirtualDJ mapper (the root element must be <mapper>).', line: mapRoot.line, column: mapRoot.column } };
    const declaredDecks = Number(root.attrs.decks);
    const model = createModel({ name: root.attrs.name || 'Imported VirtualDJ mapping', manufacturer: '', decks: Number.isInteger(declaredDecks) ? Math.min(MAX_DECKS, Math.max(1, declaredDecks)) : 2, source: 'import-vdj', sourceId: cleanText(root.attrs.name, 80) || null });
    const actions = new Map();
    for (const mp of kids(mapRoot, 'map').slice(0, LIMITS.maxControls * 2)) if (mp.attrs.value) actions.set(String(mp.attrs.value).toLowerCase(), String(mp.attrs.action ?? ''));
    const entries = legacy.length
      ? legacy.slice(0, LIMITS.maxControls).map(n => ({ line: n.line, element: 'button', name: null, type: 'note', number: parseHexOrDec(n.attrs.note), channel: Number(n.attrs.chan ?? 0), deck: null, action: [n.attrs.action, n.attrs.value].filter(Boolean).join(' ') }))
      : root.children.slice(0, LIMITS.maxControls * 2).map(n => ({ line: n.line, element: n.name.toLowerCase(), name: n.attrs.name ?? null, type: n.attrs.note != null ? 'note' : n.attrs.cc != null ? 'cc' : null,
        number: parseHexOrDec(n.attrs.note ?? n.attrs.cc), channel: Number(n.attrs.channel ?? 0), deck: Number(n.attrs.deck) || null, action: n.attrs.name != null ? actions.get(String(n.attrs.name).toLowerCase()) ?? null : null }));
    const ledEntries = [];
    for (const e of entries) {
      if (e.element === 'led') { ledEntries.push(e); continue; }
      if (!e.type || e.number == null || !Number.isInteger(e.channel) || e.channel < 0 || e.channel > 15) { warnings.push(`Line ${e.line}: an entry without a usable note/cc number or channel was skipped.`); continue; }
      const midi = { type: e.type, channel: e.channel + 1, number: e.number };
      const label = e.name ? String(e.name).replace(/_/g, ' ') : undefined;
      const kind = ELEMENT_KIND[e.element] || (e.type === 'note' ? 'button' : 'absolute');
      const deck = e.deck && e.deck >= 1 && e.deck <= MAX_DECKS ? e.deck : null;
      const { shift, base } = splitShift(e.action);
      const fBase = base && normAction(base) !== 'nothing' ? recogniseAction(base, deck) : null;
      const fShift = shift && normAction(shift) !== 'nothing' ? recogniseAction(shift, deck) : null;
      const enc = kind === 'relative' ? 'relative-two-complement' : undefined;
      const ok = (!base || normAction(base) === 'nothing' || fBase) && (!shift || normAction(shift) === 'nothing' || fShift);
      if (ok && (fBase || fShift)) {
        if (fBase) model.controls.push(cleanControl({ label, midi: { ...midi, encoding: enc }, kind, layer: 'base', function: fBase }));
        if (fShift) model.controls.push(cleanControl({ label, midi: { ...midi, encoding: enc }, kind, layer: 'shift', function: fShift }));
      } else {
        model.controls.push(cleanControl({ label, midi, kind, layer: 'base', custom: { target: 'vdj', element: ELEMENT_KIND[e.element] ? e.element : 'button', name: e.name ? String(e.name).slice(0, 64) : vdjName(label), action: e.action || '', ...(deck ? { deck } : {}) } }));
      }
    }
    for (const e of ledEntries) {
      const fn = e.action ? recogniseAction(splitShift(e.action).base, e.deck) : null;
      const target = fn && e.number != null && model.controls.find(c => c.layer === 'base' && c.function && c.function.id === fn.id && c.function.deck === fn.deck && JSON.stringify(c.function.args) === JSON.stringify(fn.args) && !c.feedback);
      if (target && e.type && e.channel >= 0 && e.channel <= 15) target.feedback = { led: { type: e.type, channel: e.channel + 1, number: e.number, on: 127, off: 0 } };
      else warnings.push(`Line ${e.line}: LED ${cleanText(e.name, 40) || ''} is not linked to a recognised control and was not kept.`);
    }
    const maxDeck = Math.max(0, ...model.controls.map(c => c.function?.deck || 0));
    if (maxDeck > model.decks) model.decks = maxDeck;
    uniqueIds(model.controls);
    const custom = model.controls.filter(c => c.custom).length;
    if (custom) warnings.push(`${custom} control${custom === 1 ? '' : 's'} could not be matched to a DeckChek function and ${custom === 1 ? 'is' : 'are'} kept as custom (preserved).`);
    if (!mapRoot && !legacy.length) warnings.push('Only the definition was read; add the mapper file to bring in the actions.');
    return { ok: true, model, preservedRaw: [], warnings };
  } catch {
    return { ok: false, error: { code: 'IMPORT_FAILED', message: 'The VirtualDJ files could not be read.', line: null, column: null } };
  }
}

