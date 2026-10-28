// Function vocabulary of the MIDI mapper studio (FS-32 §5): the neutral functions a control can be assigned to, the
// arguments each takes, its value kind, and FUNCTION_TARGETS, the per-target names (Mixxx control groups/keys,
// VirtualDJ VDJscript verbs, Traktor/Serato report labels). Nothing here is specific to one controller model: the
// learned-map suggestions (FUNCTION_HINTS) work on the words of any device profile or learned label.
//
// Facts used (no third-party code or mapping files): Mixxx control names from the Mixxx controls manual
// (https://manual.mixxx.org/2.4/en/chapters/appendix/mixxx_controls), VDJscript verbs from the VirtualDJ wiki. Both
// are documented interfaces; the exact VirtualDJ mapper schema is unverified (FS-32 §5) and flagged as such in exports.

/** Value kinds: button (note/cc on-off), absolute (fader/knob 0..127 or 14-bit), relative (encoder deltas). */
export const VALUE_KINDS = ['button', 'absolute', 'relative'];
export const LAYERS = ['base', 'shift'];
export const MAX_DECKS = 4;
export const HOTCUE_MAX = 8;
export const AUTOLOOP_SIZES = [1, 2, 4, 8, 16, 32, 64];
export const RELATIVE_ENCODINGS = ['relative-two-complement', 'relative-offset64', 'absolute-wrap'];

// args: ordered list of {name, values} (values = allowed list). `deck`: 'required' | 'none' | fn(args) -> bool.
const F = (id, label, kind, { deck = 'required', args = [], mode, category, kinds } = {}) =>
  Object.freeze({ id, label, kind, deck, args: Object.freeze(args), mode: mode || (kind === 'button' ? 'momentary' : kind), category, kinds: kinds || null });
const ACTION = (values, kindOf) => ({ name: 'action', values, kindOf });
const N = (name, values) => ({ name, values });

export const FUNCTIONS = Object.freeze([
  F('play', 'Play / pause', 'button', { mode: 'toggle', category: 'Transport' }),
  F('cue', 'Cue', 'button', { category: 'Transport' }),
  F('sync', 'Sync', 'button', { mode: 'toggle', category: 'Transport' }),
  F('pitch', 'Pitch (tempo)', 'absolute', { category: 'Transport', kinds: ['absolute', 'relative'] }),
  F('jog', 'Jog wheel', 'relative', { category: 'Jog', args: [ACTION(['rotate', 'touch', 'search'], a => (a === 'touch' ? 'button' : 'relative'))] }),
  F('hotcue', 'Hot cue', 'button', { category: 'Cues', args: [ACTION(['activate', 'set', 'clear']), N('n', [1, 2, 3, 4, 5, 6, 7, 8])] }),
  F('loop', 'Loop', 'button', { category: 'Loops', args: [ACTION(['in', 'out', 'toggle', 'halve', 'double', 'auto']), N('n', AUTOLOOP_SIZES)] }),
  F('fx', 'Effects', 'button', { category: 'Effects', deck: a => a.action === 'enable', args: [ACTION(['enable', 'drywet', 'param'], a => (a === 'enable' ? 'button' : 'absolute')), N('unit', [1, 2, 3, 4]), N('param', [1, 2, 3])] }),
  F('load', 'Load selected track', 'button', { category: 'Library' }),
  F('gain', 'Gain (trim)', 'absolute', { category: 'Mixer' }),
  F('eq', 'EQ', 'absolute', { category: 'Mixer', args: [N('band', ['hi', 'mid', 'lo'])] }),
  F('filter', 'Filter', 'absolute', { category: 'Mixer' }),
  F('crossfader', 'Crossfader', 'absolute', { category: 'Mixer', deck: 'none' }),
  F('volume', 'Channel volume', 'absolute', { category: 'Mixer' }),
  F('browse', 'Browse', 'relative', { category: 'Library', deck: 'none', args: [ACTION(['rotate', 'press'], a => (a === 'press' ? 'button' : 'relative'))] }),
  F('pfl', 'Headphone cue (PFL)', 'button', { mode: 'toggle', category: 'Mixer' }),
  F('keylock', 'Key lock', 'button', { mode: 'toggle', category: 'Transport' }),
  F('shift', 'Shift (modifier)', 'button', { category: 'Modifier', deck: 'none' }),
]);

const BY_ID = new Map(FUNCTIONS.map(f => [f.id, f]));
export const functionDef = id => BY_ID.get(id) || null;

/** Which args apply to a function given its action (e.g. loop n only for auto, fx param only for param). */
export function argsFor(def, args = {}) {
  if (!def) return [];
  return def.args.filter(a => {
    if (def.id === 'loop' && a.name === 'n') return args.action === 'auto';
    if (def.id === 'fx' && a.name === 'param') return args.action === 'param';
    return true;
  });
}

export function deckApplies(def, args = {}) {
  if (!def) return false;
  return typeof def.deck === 'function' ? def.deck(args) : def.deck === 'required';
}

/** Value kind of an assigned function: button | absolute | relative. */
export function valueKind(fn) {
  const def = functionDef(fn?.id);
  if (!def) return null;
  const action = def.args.find(a => a.name === 'action');
  if (action?.kindOf) return action.kindOf(fn.args?.action ?? action.values[0]);
  return def.kind;
}

/** Interaction mode stored in the model (derived, so it never disagrees with the function). */
export function defaultMode(fn) {
  const def = functionDef(fn?.id);
  if (!def) return null;
  const k = valueKind(fn);
  if (k !== 'button') return k;
  if (def.id === 'loop' && fn.args?.action === 'toggle') return 'toggle';
  if (def.id === 'fx' && fn.args?.action === 'enable') return 'toggle';
  return def.mode === 'toggle' ? 'toggle' : 'momentary';
}

/**
 * Normalise an assigned function: known id, deck within 1..decks when it applies (else null), args limited to the
 * ones that apply, defaults filled. Returns null for an unknown id.
 */
export function normalizeFunction(fn, decks = 2) {
  const def = functionDef(fn?.id);
  if (!def) return null;
  const src = fn.args && typeof fn.args === 'object' ? fn.args : {};
  const args = {};
  for (const a of def.args) {
    const raw = src[a.name];
    const v = a.values.find(x => String(x) === String(raw));
    args[a.name] = v === undefined ? a.values[0] : v;
  }
  for (const a of def.args) if (!argsFor(def, args).includes(a)) delete args[a.name];
  const deckOn = deckApplies(def, args);
  const d = Number(fn.deck);
  return { id: def.id, deck: deckOn ? (Number.isInteger(d) && d >= 1 ? d : 1) : null, args };
}

/** Human label: "Deck 1 hot cue 3 (set)". */
export function describeFunction(fn) {
  const def = functionDef(fn?.id);
  if (!def) return 'Unassigned';
  const a = fn.args || {};
  let s = def.label;
  if (def.id === 'hotcue') s = `Hot cue ${a.n}${a.action !== 'activate' ? ` (${a.action})` : ''}`;
  else if (def.id === 'loop') s = a.action === 'auto' ? `Auto loop ${a.n} beats` : `Loop ${a.action}`;
  else if (def.id === 'fx') s = a.action === 'enable' ? `FX unit ${a.unit} on/off` : a.action === 'drywet' ? `FX unit ${a.unit} dry/wet` : `FX unit ${a.unit} parameter ${a.param}`;
  else if (def.id === 'eq') s = `EQ ${a.band}`;
  else if (def.id === 'jog') s = a.action === 'touch' ? 'Jog touch (scratch)' : a.action === 'search' ? 'Jog search (fast)' : 'Jog rotate';
  else if (def.id === 'browse') s = a.action === 'press' ? 'Browse press (open)' : 'Browse rotate';
  return fn.deck ? `Deck ${fn.deck} ${s.charAt(0).toLowerCase()}${s.slice(1)}` : s;
}

/**
 * Identifier-safe token for a function, used in generated Mixxx script function names so an exported file can be
 * read back: `hotcue_d1_set_3`, `crossfader`, `fx_d2_enable_1`. Inverse: parseFunctionToken.
 */
export function functionToken(fn) {
  const def = functionDef(fn?.id);
  if (!def) return null;
  const parts = [def.id];
  if (fn.deck) parts.push(`d${fn.deck}`);
  for (const a of argsFor(def, fn.args || {})) parts.push(String(fn.args[a.name]));
  return parts.join('_');
}

export function parseFunctionToken(token) {
  const parts = String(token || '').split('_');
  const def = functionDef(parts.shift());
  if (!def) return null;
  let deck = null;
  if (/^d[1-9]$/.test(parts[0] || '')) deck = Number(parts.shift().slice(1));
  const args = {};
  const action = def.args.find(a => a.name === 'action');
  if (action) { const v = parts.shift(); if (!action.values.includes(v)) return null; args.action = v; }
  for (const a of argsFor(def, args)) {
    if (a.name === 'action') continue;
    const raw = parts.shift();
    const v = a.values.find(x => String(x) === raw);
    if (v === undefined) return null;
    args[a.name] = v;
  }
  if (parts.length) return null;
  const fn = { id: def.id, deck, args };
  if (deckApplies(def, args) !== (deck != null)) return null;
  return fn;
}

// ------------------------------------------------------------------------------------------------ targets

const ch = d => `[Channel${d}]`;
const EQ_PARAM = { hi: 'parameter3', mid: 'parameter2', lo: 'parameter1' };
const VDJ_EQ = { hi: 'eq_high', mid: 'eq_mid', lo: 'eq_low' };

/**
 * Per-target names. mixxx(fn) -> {group, key, led?, script?} where `script` names a template in mixxx.js (jog, relative
 * pitch, shift) because the plain XML options cannot express it. vdj(fn) -> VDJscript action. traktor/serato -> the
 * label of the command to pick in that software's own mapping editor (report only).
 */
export const FUNCTION_TARGETS = Object.freeze({
  mixxx: Object.freeze({
    play: f => ({ group: ch(f.deck), key: 'play', led: 'play_indicator' }),
    cue: f => ({ group: ch(f.deck), key: 'cue_default', led: 'cue_indicator' }),
    sync: f => ({ group: ch(f.deck), key: 'sync_enabled', led: 'sync_enabled' }),
    pitch: f => ({ group: ch(f.deck), key: 'rate' }),
    jog: f => ({ group: ch(f.deck), key: 'jog', script: `jog-${f.args.action}` }),
    hotcue: f => ({ group: ch(f.deck), key: `hotcue_${f.args.n}_${f.args.action}`, led: `hotcue_${f.args.n}_enabled` }),
    loop: f => {
      const a = f.args.action;
      const key = { in: 'loop_in', out: 'loop_out', toggle: 'reloop_toggle', halve: 'loop_halve', double: 'loop_double' }[a] || `beatloop_${f.args.n}_toggle`;
      return { group: ch(f.deck), key, led: a === 'toggle' ? 'loop_enabled' : a === 'auto' ? `beatloop_${f.args.n}_enabled` : null };
    },
    fx: f => {
      const unit = `[EffectRack1_EffectUnit${f.args.unit}]`;
      if (f.args.action === 'enable') return { group: unit, key: `group_${ch(f.deck)}_enable`, led: `group_${ch(f.deck)}_enable` };
      if (f.args.action === 'drywet') return { group: unit, key: 'mix' };
      return { group: `[EffectRack1_EffectUnit${f.args.unit}_Effect${f.args.param}]`, key: 'meta' };
    },
    load: f => ({ group: ch(f.deck), key: 'LoadSelectedTrack' }),
    gain: f => ({ group: ch(f.deck), key: 'pregain' }),
    eq: f => ({ group: `[EqualizerRack1_${ch(f.deck)}_Effect1]`, key: EQ_PARAM[f.args.band] }),
    filter: f => ({ group: `[QuickEffectRack1_${ch(f.deck)}]`, key: 'super1' }),
    crossfader: () => ({ group: '[Master]', key: 'crossfader' }),
    volume: f => ({ group: ch(f.deck), key: 'volume' }),
    browse: f => (f.args.action === 'press' ? { group: '[Library]', key: 'GoToItem' } : { group: '[Library]', key: 'MoveVertical' }),
    pfl: f => ({ group: ch(f.deck), key: 'pfl', led: 'pfl' }),
    keylock: f => ({ group: ch(f.deck), key: 'keylock', led: 'keylock' }),
    shift: () => ({ group: '[Master]', key: 'shift', script: 'shift' }),
  }),
  vdj: Object.freeze({
    play: () => 'play_pause',
    cue: () => 'cue',
    sync: () => 'sync',
    pitch: () => 'pitch',
    jog: f => (f.args.action === 'touch' ? 'touchwheel_touch' : f.args.action === 'search' ? 'seek' : 'jog'),
    hotcue: f => (f.args.action === 'set' ? `set_cue ${f.args.n}` : f.args.action === 'clear' ? `delete_cue ${f.args.n}` : `hot_cue ${f.args.n}`),
    loop: f => ({ in: 'loop_in', out: 'loop_out', toggle: 'loop', halve: 'loop_half', double: 'loop_double' }[f.args.action] || `loop ${f.args.n}`),
    fx: f => (f.args.action === 'enable' ? `effect_active ${f.args.unit}` : f.args.action === 'drywet' ? `effect_dry_wet ${f.args.unit}` : `effect_slider ${f.args.unit} ${f.args.param}`),
    load: () => 'load',
    gain: () => 'gain',
    eq: f => VDJ_EQ[f.args.band],
    filter: () => 'filter',
    crossfader: () => 'crossfader',
    volume: () => 'volume',
    browse: f => (f.args.action === 'press' ? 'browser_enter' : 'browser_scroll'),
    pfl: () => 'pfl',
    keylock: () => 'key_lock',
    shift: () => 'shift',
  }),
  traktor: Object.freeze({
    play: () => 'Deck Common > Play/Pause', cue: () => 'Deck Common > Cue', sync: () => 'Deck Common > Sync On',
    pitch: () => 'Tempo > Tempo Adjust', jog: f => (f.args.action === 'touch' ? 'Track Deck > Jog Touch On' : f.args.action === 'search' ? 'Track Deck > Seek Position' : 'Track Deck > Jog Turn'),
    hotcue: f => (f.args.action === 'clear' ? `Cue/Loops > Delete Hotcue (${f.args.n})` : `Cue/Loops > Select/Set+Store Hotcue (${f.args.n})`),
    loop: f => ({ in: 'Cue/Loops > Loop In/Set Cue', out: 'Cue/Loops > Loop Out', toggle: 'Cue/Loops > Loop Active On', halve: 'Cue/Loops > Loop Size Selector (/2)', double: 'Cue/Loops > Loop Size Selector (x2)' }[f.args.action] || `Cue/Loops > Loop Set (${f.args.n})`),
    fx: f => (f.args.action === 'enable' ? `FX Unit > FX Unit ${f.args.unit} On (deck assign)` : f.args.action === 'drywet' ? `FX Unit > Dry/Wet Adjust (unit ${f.args.unit})` : `FX Unit > Knob ${f.args.param} (unit ${f.args.unit})`),
    load: () => 'Browser > Load > Load Selected', gain: () => 'Mixer > Deck Gain Adjust', eq: f => `Mixer > EQ > ${{ hi: 'High', mid: 'Mid', lo: 'Low' }[f.args.band]} Adjust`,
    filter: () => 'Mixer > Filter Adjust', crossfader: () => 'Mixer > X-Fader > X-Fader Position', volume: () => 'Mixer > Volume Adjust',
    browse: f => (f.args.action === 'press' ? 'Browser > List > Expand/Collapse' : 'Browser > List > Select Up/Down'), pfl: () => 'Mixer > Monitor Cue On',
    keylock: () => 'Tempo > Keylock On', shift: () => 'Modifier > Modifier #1',
  }),
  serato: Object.freeze({
    play: () => 'Play', cue: () => 'Cue', sync: () => 'Sync', pitch: () => 'Pitch slider', jog: f => (f.args.action === 'touch' ? 'Platter touch' : f.args.action === 'search' ? 'Search' : 'Platter / jog'),
    hotcue: f => (f.args.action === 'clear' ? `Delete cue point ${f.args.n}` : f.args.action === 'set' ? `Set cue point ${f.args.n}` : `Cue point ${f.args.n}`),
    loop: f => ({ in: 'Loop in', out: 'Loop out', toggle: 'Reloop / exit', halve: 'Loop length half', double: 'Loop length double' }[f.args.action] || `Auto loop ${f.args.n}`),
    fx: f => (f.args.action === 'enable' ? `FX unit ${f.args.unit} assign/on` : f.args.action === 'drywet' ? `FX unit ${f.args.unit} depth` : `FX unit ${f.args.unit} parameter ${f.args.param}`),
    load: () => 'Load track', gain: () => 'Gain', eq: f => `EQ ${{ hi: 'high', mid: 'mid', lo: 'low' }[f.args.band]}`, filter: () => 'Filter', crossfader: () => 'Crossfader', volume: () => 'Channel fader',
    browse: f => (f.args.action === 'press' ? 'Library load/open' : 'Library scroll'), pfl: () => 'Headphone cue', keylock: () => 'Key lock', shift: () => 'Shift',
  }),
});

/** Targets with their status chip (FS-32 §3). */
export const TARGETS = Object.freeze([
  { id: 'mixxx', label: 'Mixxx', status: 'Supported', tone: 'pass' },
  { id: 'vdj', label: 'VirtualDJ', status: 'Supported', tone: 'pass' },
  { id: 'serato', label: 'Serato', status: 'Experimental', tone: 'warn' },
  { id: 'traktor', label: 'Traktor', status: 'Report only', tone: 'review' },
]);

/** Whether a MIDI message type can be expressed for a target (pitch-bend is not exported in v1). */
export function targetSupportsMessage(target, type) {
  if (target === 'mixxx' || target === 'vdj') return type === 'note' || type === 'cc' || type === 'cc14';
  return true;
}

// ------------------------------------------------------------------------------------------------ suggestions

/**
 * Keyword rules that turn the words of a learned label / profile control (any model) into a function. Order matters:
 * the first matching rule wins. Each rule: [regex on "label group id" text, function id, args, {types?}].
 */
export const FUNCTION_HINTS = Object.freeze([
  [/\bshift\b/, 'shift', {}],
  [/\b(?:hot ?cue|pad)\s*(\d)\b/, 'hotcue', m => ({ action: 'activate', n: Number(m[1]) })],
  [/\bhot ?cue\b/, 'hotcue', { action: 'activate', n: 1 }],
  [/\bplay\b/, 'play', {}],
  [/\bsync\b/, 'sync', {}],
  [/\b(?:key ?lock|master ?tempo)\b/, 'keylock', {}],
  [/\b(?:headphone|phones|pfl|monitor)\b/, 'pfl', {}],
  [/\bcue\b/, 'cue', {}],
  [/\b(?:cross ?fader|x ?fader)\b/, 'crossfader', {}],
  [/\b(?:pitch|tempo)\b/, 'pitch', {}, { types: ['fader', 'knob', 'encoder', 'touch-strip'] }],
  [/\b(?:jog|platter|wheel)\b.*\btouch\b|\btouch\b.*\b(?:jog|platter|wheel)\b/, 'jog', { action: 'touch' }],
  [/\b(?:jog|platter|wheel)\b/, 'jog', { action: 'rotate' }],
  [/\bloop\b.*\bin\b/, 'loop', { action: 'in' }],
  [/\bloop\b.*\bout\b/, 'loop', { action: 'out' }],
  [/\b(?:reloop|loop\b.*\b(?:toggle|active|exit|on))\b/, 'loop', { action: 'toggle' }],
  [/\b(?:halve|half)\b|1\/2/, 'loop', { action: 'halve' }],
  [/\bdouble\b|\bx2\b/, 'loop', { action: 'double' }],
  [/\b(?:auto ?loop|beat ?loop)\s*(\d+)?/, 'loop', m => ({ action: 'auto', n: Number(m[1]) || 4 })],
  [/\b(?:fx|effect)\s*(\d)?\b.*\b(?:wet|dry|mix|depth)\b/, 'fx', m => ({ action: 'drywet', unit: Number(m[1]) || 1 })],
  [/\b(?:fx|effect)\s*(\d)?\b.*\b(?:param|knob|level)\s*(\d)?/, 'fx', m => ({ action: 'param', unit: Number(m[1]) || 1, param: Number(m[2]) || 1 })],
  [/\b(?:fx|effect)\s*(\d)?\b/, 'fx', m => ({ action: 'enable', unit: Number(m[1]) || 1 })],
  [/\bload\b/, 'load', {}],
  [/\b(?:gain|trim)\b/, 'gain', {}],
  [/\b(?:hi|high|treble)\b/, 'eq', { band: 'hi' }],
  [/\bmid\b/, 'eq', { band: 'mid' }],
  [/\b(?:lo|low|bass)\b/, 'eq', { band: 'lo' }],
  [/\b(?:filter|colou?r)\b/, 'filter', {}],
  [/\b(?:browse|rotary|select)\b.*\b(?:press|push|click|load)\b/, 'browse', { action: 'press' }],
  [/\b(?:browse|rotary|select)\b/, 'browse', { action: 'rotate' }],
  [/\b(?:volume|channel fader|line fader|fader)\b/, 'volume', {}, { types: ['fader', 'knob'] }],
]);

/** Profile control types that imply a function on their own (when no label word matches). */
const TYPE_HINTS = { 'jog-touch': ['jog', { action: 'touch' }], platter: ['jog', { action: 'rotate' }], jog: ['jog', { action: 'rotate' }] };

/**
 * Longest text the hint rules look at. Some rules (`\bloop\b.*\bin\b`) cost O(n^2) on hostile text, so every input
 * is cut to this many characters per field before any regex runs.
 */
export const MAX_HINT_CHARS = 200;
const hintText = v => String(v ?? '').slice(0, MAX_HINT_CHARS);

/** Best-guess function for a control described by words and a type, or null. Deck is decided by the caller. */
export function suggestFunction({ label = '', group = '', id = '', type = '' } = {}) {
  const words = `${hintText(label)} ${hintText(group)} ${hintText(id).replace(/_/g, ' ')}`.toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ');
  for (const [re, fid, args, opt] of FUNCTION_HINTS) {
    const m = re.exec(words);
    if (!m) continue;
    if (opt?.types && type && !opt.types.includes(type)) continue;
    return { id: fid, args: typeof args === 'function' ? args(m) : { ...args } };
  }
  if (TYPE_HINTS[type]) return { id: TYPE_HINTS[type][0], args: { ...TYPE_HINTS[type][1] } };
  return null;
}

/** Deck number named in a label/group ("Deck 2", "CH2", "Left", "B"), or null. */
export function deckFromWords(text = '') {
  const t = String(text ?? '').slice(0, MAX_HINT_CHARS * 3).toLowerCase();
  let m = /\b(?:deck|ch|channel)\s*([1-4])\b/.exec(t) || /\bdeck\s*([a-d])\b/.exec(t);
  if (m) return /[a-d]/.test(m[1]) ? 'abcd'.indexOf(m[1]) + 1 : Number(m[1]);
  if (/\bleft\b/.test(t)) return 1;
  if (/\bright\b/.test(t)) return 2;
  m = /^\s*([1-4])\b/.exec(t) || /\bd([1-4])\b/.exec(t);
  return m ? Number(m[1]) : null;
}
