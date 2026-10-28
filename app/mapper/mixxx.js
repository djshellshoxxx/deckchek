// Mixxx controller mapping export/import (FS-32 §5, AC-1, AC-3, AC-5).
//
// Format facts (documented in FS-32 §5 from the Mixxx wiki and a read of the format; no Mixxx file or script is
// copied, adapted or bundled — Mixxx mappings are GPL): root <MixxxControllerPreset schemaVersion="1"
// mixxxVersion="2.4+"> (legacy <MixxxMIDIPreset> accepted on import), <info> name/author/description,
// <controller id> with <scriptfiles>, <controls> and <outputs>. <control>: description?, group, key, status (hex),
// midino (hex), <options> with one child (normal, script-binding, fourteen-bit-msb/lsb, selectknob, diff, …; parsed
// case-insensitively, written lowercase). <output>: group, key, status, midino, on, off, minimum.
//
// What needs a script is generated from DeckChek's own templates into `<name>-scripts.js`: the Shift modifier and
// every shift-layer control (Mixxx XML has no modifier layers), base controls that share their MIDI message with a
// shift-layer control, jog (engine.scratchEnable/scratchTick), relative pitch, and offset-64 encoders. Script function
// names encode the DeckChek function (`<prefix>.b_hotcue_d1_set_3`), so an exported file imports back to the same
// model. 14-bit absolute controls use <fourteen-bit-msb/>/<fourteen-bit-lsb/> pairs (no script).

import { writeXml, el, tx, parseXml, kids, kid, childText } from './xml.js';
import { FUNCTION_TARGETS, FUNCTIONS, functionToken, parseFunctionToken, valueKind, deckApplies, normalizeFunction, MAX_DECKS } from './vocabulary.js';
import { normalizeModel, createModel, cleanControl, uniqueIds, statusByte, cleanText, LIMITS } from './model.js';
import { validateModel, checkExportSize } from './validate.js';

export const MIXXX_VERSION = '2.4+';
const ENC_SUFFIX = { 'relative-two-complement': 'e2c', 'relative-offset64': 'e64', 'absolute-wrap': 'ewrap' };
const SUFFIX_ENC = Object.fromEntries(Object.entries(ENC_SUFFIX).map(([k, v]) => [v, k]));
const OPTION_NAME = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_SCRIPT_BYTES = 1024 * 1024;

const hex = n => `0x${Number(n).toString(16).toUpperCase().padStart(2, '0')}`;

/** File-name stem (FS-32 §7: [A-Za-z0-9 ._-], at most 80 characters). */
export function fileStem(name) {
  const s = String(name ?? '').replace(/[^A-Za-z0-9 ._-]/g, '_').replace(/^[ .]+|[ .]+$/g, '').slice(0, 80);
  return s || 'DeckChek mapping';
}

/** JavaScript identifier used as the Mixxx functionprefix. */
export function scriptPrefix(name) {
  const core = String(name ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
  return `DeckChek${core ? '_' + core : ''}`;
}

/** Functions whose button release matters (held cue/hot cue preview, scratch touch, Shift). */
const releaseMatters = fn => fn.id === 'cue' || fn.id === 'shift' || (fn.id === 'hotcue' && fn.args.action === 'activate') || (fn.id === 'jog' && fn.args.action === 'touch');

const STATE_TOGGLES = new Set(['play', 'sync', 'pfl', 'keylock']);
const isStateToggle = fn => STATE_TOGGLES.has(fn.id) || (fn.id === 'fx' && fn.args.action === 'enable');

function decodeJs(enc, keyLiteral) {
  if (enc === 'relative-offset64') return 'var d = value - 64;';
  if (enc === 'absolute-wrap') return `var last = P.last[${keyLiteral}]; P.last[${keyLiteral}] = value; var d = last === undefined ? 0 : value - last; if (d > 64) { d -= 128; } else if (d < -64) { d += 128; }`;
  return 'var d = value < 64 ? value : value - 128;';
}

/** Body of one generated script function. Only DeckChek's own constants reach the code (strings via JSON.stringify). */
function scriptBody(c, fn, t, guard, fname) {
  const G = JSON.stringify(t.group), K = JSON.stringify(t.key);
  const lines = [];
  if (guard) lines.push(guard);
  const rel = c.kind === 'relative';
  const enc = c.midi.encoding || 'relative-two-complement';
  if (fn.id === 'shift') { lines.push('P.shifted = value > 0;'); return lines; }
  if (fn.id === 'jog') {
    const deck = fn.deck;
    if (fn.args.action === 'touch') {
      lines.push(`if (value > 0) { engine.scratchEnable(${deck}, P.jogResolution, 33 + 1 / 3, 1 / 8, 1 / 8 / 32, true); } else { engine.scratchDisable(${deck}, true); }`);
      return lines;
    }
    lines.push(decodeJs(enc, JSON.stringify(fname)));
    if (fn.args.action === 'search') lines.push(`engine.setValue(${G}, "jog", d * 5);`);
    else lines.push(`if (engine.isScratching(${deck})) { engine.scratchTick(${deck}, d); } else { engine.setValue(${G}, "jog", d); }`);
    return lines;
  }
  const kind = valueKind(fn);
  if (kind === 'button') {
    if (isStateToggle(fn)) lines.push(`if (value > 0) { engine.setValue(${G}, ${K}, engine.getValue(${G}, ${K}) ? 0 : 1); }`);
    else lines.push(`engine.setValue(${G}, ${K}, value > 0 ? 1 : 0);`);
    return lines;
  }
  if (rel) {
    lines.push(decodeJs(enc, JSON.stringify(fname)));
    if (kind === 'relative') lines.push(`engine.setValue(${G}, ${K}, d);`);
    else if (fn.id === 'pitch') lines.push(`engine.setValue(${G}, ${K}, Math.max(-1, Math.min(1, engine.getValue(${G}, ${K}) + d / 1000)));`);
    else lines.push(`engine.setParameter(${G}, ${K}, Math.max(0, Math.min(1, engine.getParameter(${G}, ${K}) + d / 128)));`);
    return lines;
  }
  lines.push(`engine.setParameter(${G}, ${K}, value / 127);`);
  return lines;
}

function scriptFile(prefix, name, fns) {
  const safeName = String(name).replace(/[^A-Za-z0-9 ._-]/g, '_').slice(0, 80);
  const out = [
    `// ${safeName}: Mixxx controller script generated by DeckChek MIDI mapper studio.`,
    '// Self-authored template (DeckChek). Edit the mapping in DeckChek and export again rather than editing this file.',
    `var ${prefix} = {};`,
    `(function (P) {`,
    '  P.shifted = false;',
    '  P.last = {};',
    '  // Jog wheel ticks per revolution used for scratching; adjust to your controller (DeckChek midi:jog test measures it).',
    '  P.jogResolution = 128;',
    '  P.init = function (id, debugging) {};',
    '  P.shutdown = function () {};',
  ];
  for (const f of fns) {
    out.push(`  P.${f.name} = function (channel, control, value, status, group) {`);
    for (const l of f.body) out.push(`    ${l}`);
    out.push('  };');
  }
  out.push(`}(${prefix}));`, '');
  return out.join('\n');
}

/**
 * exportMixxx(model, {name, author, description, scripts}) -> {files:[{name, content}], warnings, errors}.
 * `scripts` are preserved third-party script files from an import (preservedRaw), passed through unchanged when the
 * imported mapping declared them. Nothing is written when `errors` is non-empty.
 */
export function exportMixxx(model, { name, author = 'DeckChek', description = '', scripts = [] } = {}) {
  const m = normalizeModel(model);
  if (!m) return { files: [], warnings: [], errors: [{ code: 'MODEL_INVALID', controlIds: [], message: 'There is no mapping to export.' }] };
  const presetName = cleanText(name) || m.name;
  const { errors, warnings } = validateModel({ ...m, name: presetName }, { target: 'mixxx' });
  if (errors.length) return { files: [], warnings, errors };
  const stem = fileStem(presetName);
  const prefix = scriptPrefix(presetName);
  const scriptName = `${stem}-scripts.js`;

  const slot = c => `${c.midi.type === 'cc14' ? 'cc' : c.midi.type}:${c.midi.channel}:${c.midi.number}`;
  const shiftSlots = new Set(m.controls.filter(c => c.layer === 'shift' && c.function).map(slot));
  const controls = [], outputs = [], fns = [];
  const ctl = (c, status, midino, key, option) => el('control', {}, c.label ? tx('description', c.label) : null, tx('group', key.group), tx('key', key.key), tx('status', hex(status)), tx('midino', hex(midino)), el('options', {}, el(option)));

  for (const c of m.controls) {
    if (c.custom) {
      if (c.custom.target !== 'mixxx') continue;
      const opts = (c.custom.options || []).filter(o => OPTION_NAME.test(o));
      const status = Number.isInteger(c.custom.status) ? c.custom.status : c.midi.status;
      const node = st => el('control', {}, c.custom.description ? tx('description', c.custom.description) : null, tx('group', c.custom.group || ''), tx('key', c.custom.key || ''),
        tx('status', hex(st)), tx('midino', hex(c.midi.number)), el('options', {}, ...(opts.length ? opts : ['normal']).map(o => el(o))));
      controls.push(node(status));
      if (c.custom.noteOff) controls.push(node(0x80 | (status & 0x0f)));
      continue;
    }
    const fn = c.function;
    if (!fn || c.midi.type === 'pitchbend') continue;
    const t = FUNCTION_TARGETS.mixxx[fn.id]?.(fn);
    if (!t) continue;
    const enc = c.midi.encoding || 'relative-two-complement';
    const relFn = valueKind(fn) === 'relative';
    const collides = c.layer === 'base' && shiftSlots.has(slot(c)) && c.midi.type !== 'cc14';
    const needsScript = c.layer === 'shift' || collides || Boolean(t.script)
      || (c.kind === 'relative' && !(relFn && fn.id === 'browse' && enc !== 'relative-offset64'));
    // Controllers that release with a note-off (0x8n) need a twin entry where the release does something.
    const noteOff = c.midi.type === 'note' && releaseMatters(fn);
    if (needsScript) {
      const fname = `${c.layer === 'shift' ? 's' : 'b'}_${functionToken(fn)}${c.kind === 'relative' ? `_${ENC_SUFFIX[enc]}` : ''}`;
      if (!fns.some(f => f.name === fname)) {
        const guard = c.layer === 'shift' ? 'if (!P.shifted) { return; }' : collides ? 'if (P.shifted) { return; }' : '';
        fns.push({ name: fname, body: scriptBody(c, fn, t, guard, fname) });
      }
      const key = { group: t.group, key: `${prefix}.${fname}` };
      controls.push(ctl(c, c.midi.status, c.midi.number, key, 'script-binding'));
      if (noteOff) controls.push(ctl(c, 0x80 | (c.midi.channel - 1), c.midi.number, key, 'script-binding'));
    } else if (c.midi.type === 'cc14') {
      controls.push(ctl(c, c.midi.status, c.midi.number, t, 'fourteen-bit-msb'));
      controls.push(ctl(c, c.midi.status, c.midi.lsbNumber, t, 'fourteen-bit-lsb'));
    } else {
      const option = c.kind === 'relative' ? (enc === 'absolute-wrap' ? 'diff' : 'selectknob') : 'normal';
      controls.push(ctl(c, c.midi.status, c.midi.number, t, option));
      if (noteOff) controls.push(ctl(c, 0x80 | (c.midi.channel - 1), c.midi.number, t, option));
    }
    const led = c.feedback?.led;
    if (led && t.led) {
      if (c.layer === 'shift') warnings.push({ code: 'LED_SHIFT', controlIds: [c.id], message: `${c.label}: LEDs on the shift layer are not exported to Mixxx.` });
      else outputs.push(el('output', {}, tx('group', t.group), tx('key', t.led), tx('status', hex(statusByte(led.type, led.channel))), tx('midino', hex(led.number)), tx('on', hex(led.on)), tx('off', hex(led.off)), tx('minimum', '0.5')));
    }
  }
  for (const o of m.preserved?.mixxx?.outputs || []) {
    const opt = k => (Number.isFinite(o[k]) ? tx(k, k === 'minimum' || k === 'maximum' ? String(o[k]) : hex(o[k])) : null);
    outputs.push(el('output', {}, tx('group', o.group || ''), tx('key', o.key || ''), opt('status'), opt('midino'), opt('on'), opt('off'), opt('minimum'), opt('maximum')));
  }

  const preservedFiles = (m.preserved?.mixxx?.scriptfiles || []);
  const scriptDecls = preservedFiles.map(f => el('file', { functionprefix: f.functionprefix || null, filename: f.filename }));
  if (fns.length) scriptDecls.push(el('file', { functionprefix: prefix, filename: scriptName }));
  const pInfo = m.preserved?.mixxx?.info || {};
  const origAuthor = pInfo.author && cleanText(pInfo.author, 200);
  const authorText = origAuthor && origAuthor !== cleanText(author) ? `${origAuthor}; edited by ${cleanText(author) || 'DeckChek'}` : cleanText(author) || 'DeckChek';
  const infoExtra = Object.entries(pInfo).filter(([k]) => !['name', 'author', 'description'].includes(k)).map(([k, v]) => tx(k, v));
  const doc = el('MixxxControllerPreset', { schemaVersion: '1', mixxxVersion: MIXXX_VERSION },
    el('info', {}, tx('name', presetName), tx('author', authorText), tx('description', cleanText(description, 2000) || pInfo.description || `Created with DeckChek MIDI mapper studio for ${presetName}.`), ...infoExtra),
    el('controller', { id: stem },
      el('scriptfiles', {}, ...scriptDecls),
      el('controls', {}, ...controls),
      el('outputs', {}, ...outputs)));
  const files = [{ name: `${stem}.midi.xml`, content: writeXml(doc) }];
  if (fns.length) files.push({ name: scriptName, content: scriptFile(prefix, presetName, fns) });
  for (const s of Array.isArray(scripts) ? scripts : []) {
    if (!s || typeof s.content !== 'string' || s.content.length > MAX_SCRIPT_BYTES) continue;
    const fname = fileStem(String(s.name || '').replace(/\.js$/i, '')) + '.js';
    if (preservedFiles.some(f => fileStem(f.filename.replace(/\.js$/i, '')) + '.js' === fname) && !files.some(f => f.name === fname)) files.push({ name: fname, content: s.content });
  }
  const size = checkExportSize(files);
  if (size) return { files: [], warnings, errors: [size] };
  return { files, warnings, errors: [] };
}

// ------------------------------------------------------------------------------------------------ import

let REVERSE = null;
/** group\0key -> function, and group\0ledKey -> function, built from FUNCTION_TARGETS for decks 1..4. */
function reverse() {
  if (REVERSE) return REVERSE;
  const keys = new Map(), leds = new Map();
  for (const def of FUNCTIONS) {
    const combos = [{}];
    for (const a of def.args) {
      const next = [];
      for (const c of combos) for (const v of a.values) next.push({ ...c, [a.name]: v });
      combos.splice(0, combos.length, ...next);
    }
    for (const raw of combos) {
      const decks = deckApplies(def, raw) ? [1, 2, 3, 4] : [null];
      for (const deck of decks) {
        const fn = normalizeFunction({ id: def.id, deck, args: raw }, MAX_DECKS);
        const t = FUNCTION_TARGETS.mixxx[def.id](fn);
        if (t.script) continue;
        const k = `${t.group}\u0000${t.key}`;
        if (!keys.has(k)) keys.set(k, fn);
        if (t.led) { const lk = `${t.group}\u0000${t.led}`; if (!leds.has(lk)) leds.set(lk, fn); }
      }
    }
  }
  REVERSE = { keys, leds };
  return REVERSE;
}

const GROUP_ALIASES = { '[Mixer]': '[Master]' };
const sameFn = (a, b) => a && b && a.id === b.id && (a.deck ?? null) === (b.deck ?? null) && JSON.stringify(a.args) === JSON.stringify(b.args);

function parseByte(text) {
  const t = String(text ?? '').trim();
  let n = NaN;
  if (/^0x[0-9a-f]{1,2}$/i.test(t)) n = parseInt(t.slice(2), 16);
  else if (/^\d{1,3}$/.test(t)) n = parseInt(t, 10);
  return Number.isInteger(n) && n >= 0 && n <= 255 ? n : null;
}
const parseNum = text => { const t = String(text ?? '').trim(); const b = parseByte(t); if (b != null) return b; const f = Number(t); return t !== '' && Number.isFinite(f) ? f : null; };

/** Recognise our own generated script key: <prefix>.<b|s>_<token>[_<enc>]. */
function parseScriptKey(key) {
  const m = /^[A-Za-z_$][A-Za-z0-9_$]*\.([bs])_([a-z0-9_]+)$/.exec(key);
  if (!m) return null;
  const layer = m[1] === 's' ? 'shift' : 'base';
  let token = m[2], encoding = null;
  const sm = /_(e2c|e64|ewrap)$/.exec(token);
  if (sm) { const fn = parseFunctionToken(token.slice(0, -sm[0].length)); if (fn) return { layer, fn, encoding: SUFFIX_ENC[sm[1]] }; }
  const fn = parseFunctionToken(token);
  return fn ? { layer, fn, encoding } : null;
}

/** Sanitise optional script files supplied with an import: opaque text, never executed. */
function takeScripts(jsFiles, warnings) {
  const out = [];
  for (const f of (Array.isArray(jsFiles) ? jsFiles : []).slice(0, LIMITS.maxScriptFiles)) {
    if (!f || typeof f.content !== 'string') continue;
    if (f.content.length > MAX_SCRIPT_BYTES) { warnings.push(`${cleanText(f.name, 80)} is larger than 1 MB and was not kept.`); continue; }
    out.push({ kind: 'script', name: fileStem(String(f.name || 'script').replace(/\.js$/i, '')) + '.js', content: f.content });
  }
  return out;
}

/**
 * importMixxx(xmlText, jsFiles?) -> {ok:true, model, preservedRaw, warnings, info} | {ok:false, error:{code, message,
 * line, column}}. Recognised controls become functions; everything else is kept as "custom (preserved)" and written
 * back unchanged by exportMixxx. Never throws.
 */
export function importMixxx(xmlText, jsFiles = [], { decks } = {}) {
  try {
    const parsed = parseXml(xmlText, { maxBytes: LIMITS.maxImportBytes });
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const root = parsed.root;
    if (!/^Mixxx(Controller|MIDI)Preset$/.test(root.name)) return { ok: false, error: { code: 'NOT_MIXXX', message: 'This is not a Mixxx MIDI mapping (the root element must be MixxxControllerPreset or MixxxMIDIPreset).', line: root.line, column: root.column } };
    const warnings = [];
    const info = {};
    const infoNode = kid(root, 'info');
    for (const c of infoNode?.children || []) if (/^[a-z]{1,16}$/i.test(c.name) && !c.children.length) info[c.name.toLowerCase()] = cleanText(c.text, 2000);
    const controller = kid(root, 'controller');
    if (!controller) return { ok: false, error: { code: 'NOT_MIXXX', message: 'The mapping has no <controller> section.', line: root.line, column: root.column } };
    const scriptfiles = kids(kid(controller, 'scriptfiles'), 'file').map(f => ({ filename: cleanText(f.attrs.filename, LIMITS.maxCustomText), functionprefix: cleanText(f.attrs.functionprefix, 64) })).filter(f => f.filename);
    const ownFile = scriptfiles.find(f => /^DeckChek(_[A-Za-z0-9]+)?$/.test(f.functionprefix) && /-scripts\.js$/.test(f.filename));
    const ownPrefix = ownFile?.functionprefix || null;
    const preservedFiles = scriptfiles.filter(f => f !== ownFile);

    const { keys, leds } = reverse();
    const model = createModel({ name: info.name || 'Imported Mixxx mapping', source: 'import-mixxx', sourceId: cleanText(controller.attrs.id, 80) || null });
    const ctrlNodes = kids(kid(controller, 'controls'), 'control');
    if (ctrlNodes.length > LIMITS.maxControls * 2) warnings.push(`Only the first ${LIMITS.maxControls * 2} <control> entries were read.`);
    const entries = [];
    for (const n of ctrlNodes.slice(0, LIMITS.maxControls * 2)) {
      const status = parseByte(childText(n, 'status')), midino = parseByte(childText(n, 'midino'));
      const group = childText(n, 'group') ?? '', key = childText(n, 'key') ?? '';
      if (status == null || midino == null || midino > 127 || status < 0x80 || status > 0xef) { warnings.push(`Line ${n.line}: a control with an invalid status or midino was skipped.`); continue; }
      if (group.length > LIMITS.maxCustomText || key.length > LIMITS.maxCustomText) { warnings.push(`Line ${n.line}: a control with a group or key longer than ${LIMITS.maxCustomText} characters was skipped.`); continue; }
      const options = (kid(n, 'options')?.children || []).map(o => o.name.toLowerCase()).filter(o => OPTION_NAME.test(o));
      entries.push({ line: n.line, status, midino, group: cleanText(group, LIMITS.maxCustomText), key: cleanText(key, LIMITS.maxCustomText), options, description: cleanText(childText(n, 'description'), LIMITS.maxText) });
    }
    const typeOf = st => ({ 0x80: 'note', 0x90: 'note', 0xb0: 'cc', 0xe0: 'pitchbend' }[st & 0xf0] || null);
    const recognise = e => {
      if (e.options.includes('script-binding')) {
        const p = ownPrefix && e.key.startsWith(ownPrefix + '.') ? parseScriptKey(e.key) : null;
        return p ? { ...p, scripted: true } : null;
      }
      const g = GROUP_ALIASES[e.group] || e.group;
      const fn = keys.get(`${g}\u0000${e.key}`);
      return fn ? { fn, layer: 'base', encoding: e.options.includes('selectknob') ? 'relative-two-complement' : e.options.includes('diff') ? 'absolute-wrap' : null } : null;
    };
    const used = new Set();
    // 14-bit pairs first: an MSB entry joined with the LSB entry of the same group/key/status.
    for (const e of entries) {
      if (!e.options.includes('fourteen-bit-msb') || used.has(e)) continue;
      const lsb = entries.find(x => !used.has(x) && x !== e && x.options.includes('fourteen-bit-lsb') && x.group === e.group && x.key === e.key && x.status === e.status);
      const r = recognise({ ...e, options: ['normal'] });
      if (!lsb || !r) continue;
      used.add(e); used.add(lsb);
      model.controls.push(cleanControl({ label: e.description, midi: { type: 'cc14', channel: (e.status & 0x0f) + 1, number: e.midino, lsbNumber: lsb.midino }, kind: 'absolute', layer: 'base', function: r.fn }));
    }
    for (const e of entries) {
      if (used.has(e)) continue;
      const type = typeOf(e.status);
      if (!type) { warnings.push(`Line ${e.line}: status ${hex(e.status)} is not a note, CC or pitch-bend message and was skipped.`); continue; }
      const channel = (e.status & 0x0f) + 1;
      const r = type === 'pitchbend' ? null : recognise(e);
      // A note-off (0x80) twin of a note-on entry with the same group/key is folded into it.
      if ((e.status & 0xf0) === 0x80) {
        const twin = entries.find(x => x !== e && (x.status & 0xf0) === 0x90 && (x.status & 0x0f) === (e.status & 0x0f) && x.midino === e.midino && x.group === e.group && x.key === e.key);
        if (twin) { twin.noteOff = true; used.add(e); continue; }
      }
      used.add(e);
      if (r) {
        const kind = r.encoding ? 'relative' : valueKind(r.fn) === 'relative' ? 'relative' : valueKind(r.fn);
        model.controls.push(cleanControl({ label: e.description || undefined, midi: { type, channel, number: e.midino, encoding: kind === 'relative' ? (r.encoding || 'relative-two-complement') : undefined }, kind, layer: r.layer, function: r.fn }));
      } else {
        model.controls.push({ __entry: e, ...cleanControl({ label: e.description || e.key || undefined, midi: { type, channel, number: e.midino }, layer: 'base',
          custom: { target: 'mixxx', group: e.group, key: e.key, options: e.options.length ? e.options : ['normal'], description: e.description, status: e.status } }) });
      }
    }
    // Note-off twins discovered after their custom control was created.
    for (const c of model.controls) if (c.__entry) { if (c.__entry.noteOff) c.custom.noteOff = true; delete c.__entry; }
    const outs = [];
    for (const o of kids(kid(controller, 'outputs'), 'output').slice(0, LIMITS.maxControls)) {
      const group = cleanText(childText(o, 'group'), LIMITS.maxCustomText), key = cleanText(childText(o, 'key'), LIMITS.maxCustomText);
      const status = parseByte(childText(o, 'status')), midino = parseByte(childText(o, 'midino'));
      const on = parseNum(childText(o, 'on')), off = parseNum(childText(o, 'off'));
      const fn = leds.get(`${GROUP_ALIASES[group] || group}\u0000${key}`);
      const target = fn && status != null && midino != null && midino <= 127 && [0x90, 0xb0].includes(status & 0xf0)
        ? model.controls.find(c => c.layer === 'base' && sameFn(c.function, fn) && !c.feedback) : null;
      if (target) {
        target.feedback = { led: { type: (status & 0xf0) === 0x90 ? 'note' : 'cc', channel: (status & 0x0f) + 1, number: midino, on: Number.isInteger(on) && on <= 127 ? on : 127, off: Number.isInteger(off) && off <= 127 ? off : 0 } };
        continue;
      }
      const rec = { group, key };
      for (const [k, v] of [['status', status], ['midino', midino], ['on', on], ['off', off], ['minimum', parseNum(childText(o, 'minimum'))], ['maximum', parseNum(childText(o, 'maximum'))]]) if (v != null) rec[k] = v;
      outs.push(rec);
    }
    const usedDecks = model.controls.map(c => c.function?.deck || 0);
    model.decks = Number.isInteger(decks) ? decks : Math.min(MAX_DECKS, Math.max(2, ...usedDecks));
    uniqueIds(model.controls);
    const infoKeep = Object.fromEntries(Object.entries(info).filter(([k]) => k !== 'name'));
    if (preservedFiles.length || outs.length || Object.keys(infoKeep).length) model.preserved = { mixxx: { scriptfiles: preservedFiles, outputs: outs, ...(Object.keys(infoKeep).length ? { info: infoKeep } : {}) } };
    const custom = model.controls.filter(c => c.custom).length;
    if (custom) warnings.push(`${custom} control${custom === 1 ? '' : 's'} could not be matched to a DeckChek function and ${custom === 1 ? 'is' : 'are'} kept as custom (preserved).`);
    const missing = preservedFiles.filter(f => !(jsFiles || []).some(j => fileStem(String(j?.name || '').replace(/\.js$/i, '')) + '.js' === fileStem(f.filename.replace(/\.js$/i, '')) + '.js'));
    if (missing.length) warnings.push(`The mapping uses script file${missing.length === 1 ? '' : 's'} ${missing.map(f => f.filename).join(', ')}; add ${missing.length === 1 ? 'it' : 'them'} next to the exported file yourself.`);
    return { ok: true, model, preservedRaw: takeScripts(jsFiles, warnings), warnings, info };
  } catch {
    return { ok: false, error: { code: 'IMPORT_FAILED', message: 'The Mixxx mapping could not be read.', line: null, column: null } };
  }
}

