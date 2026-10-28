// Learned MIDI map / device profile -> neutral mapping model (FS-32 §6, AC-7). Works for any controller: the
// controls come from the unit's learned map (`asset_midi_map`, saved by the MIDI coverage test) merged with the
// profile's published controls when there are any, and functions are suggested from the words of each control's
// label, group and id plus its profile type (vocabulary.js FUNCTION_HINTS). Nothing is keyed to a model name.
// Unrecognised controls stay in the model with no function ("unassigned") so the person can assign them.

import { createModel, cleanControl, uniqueIds, LIMITS, kindForType } from './model.js';
import { suggestFunction, deckFromWords, normalizeFunction, functionDef } from './vocabulary.js';

const KIND_BY_TYPE = { button: 'button', pad: 'button', switch: 'button', 'jog-touch': 'button', fader: 'absolute', knob: 'absolute', 'touch-strip': 'absolute', encoder: 'relative', jog: 'relative', platter: 'relative' };

/** Profile-schema message -> model MIDI descriptor (null for sysex or incomplete messages). */
export function midiFromMessage(message) {
  const m = message || {};
  const channel = Number(m.channel);
  if (!Number.isInteger(channel)) return null;
  if (m.kind === 'note' || m.kind === 'cc') return Number.isInteger(m.number) ? { type: m.kind, channel, number: m.number } : null;
  if (m.kind === 'cc14') {
    const msb = Number.isInteger(m.msbNumber) ? m.msbNumber : m.number;
    if (!Number.isInteger(msb)) return null;
    return { type: 'cc14', channel, number: msb, lsbNumber: Number.isInteger(m.lsbNumber) ? m.lsbNumber : msb + 32 };
  }
  if (m.kind === 'pitchbend') return { type: 'pitchbend', channel, number: 0 };
  return null;
}

/** Controls of a learned map merged over the profile's published controls (learned wins on the same id). */
function mergedControls(midiMap, profile) {
  const learned = Array.isArray(midiMap?.map?.controls) ? midiMap.map.controls : Array.isArray(midiMap?.controls) ? midiMap.controls : [];
  const published = Array.isArray(profile?.midi?.controls) ? profile.midi.controls : [];
  const byId = new Map();
  for (const c of published) if (c && typeof c === 'object' && c.message) byId.set(String(c.id), c);
  for (const c of learned) {
    if (!c || typeof c !== 'object') continue;
    const known = published.find(p => p && String(p.id) === String(c.id));
    byId.set(String(c.id ?? `${byId.size}`), { ...known, ...c, group: c.group || known?.group || null, type: c.type || known?.type || null });
  }
  return [...byId.values()];
}

/**
 * learnedToModel(midiMap, profile) -> MapperModel. `midiMap` is the stored row ({map:{controls}}) or the map itself;
 * `profile` is the device profile (optional: the editor works from a learned map alone, AC-7).
 */
export function learnedToModel(midiMap, profile = null, { name, manufacturer, decks } = {}) {
  const controls = mergedControls(midiMap, profile).slice(0, LIMITS.maxControls);
  const channels = new Set();
  const rows = [];
  for (const c of controls) {
    const midi = midiFromMessage(c.message);
    if (!midi) continue;
    channels.add(midi.channel);
    rows.push({ c, midi });
  }
  const deckCount = Number.isInteger(decks) ? decks : Math.min(4, Math.max(2, ...[...rows].map(r => deckFromWords(`${r.c.label || ''} ${r.c.group || ''}`) || 0)));
  // Many controllers send each deck on its own channel; use that only when the map spreads over a few channels.
  const useChannel = channels.size >= 2 && channels.size <= 4 && [...channels].every(ch => ch <= deckCount);
  const model = createModel({
    name: name || [profile?.manufacturer, profile?.model].filter(Boolean).join(' ') || 'Learned controller',
    manufacturer: manufacturer ?? profile?.manufacturer ?? '',
    decks: deckCount,
    source: midiMap ? 'learned' : 'profile',
    sourceId: profile?.id || midiMap?.assetId || null,
  });
  for (const { c, midi } of rows) {
    const type = String(c.type || '');
    const kind = KIND_BY_TYPE[type] || (midi.type === 'cc' && type === '' ? 'absolute' : kindForType(midi.type));
    // "Shift + Play" is Play on the shift layer; a control named only "Shift" is the modifier itself.
    const SHIFT = /\bshift(?:ed)?\b/gi;
    const words = `${c.label || ''} ${c.group || ''} ${String(c.id || '').replace(/_/g, ' ')}`;
    const shiftNamed = /\bshift(?:ed)?\b/i.test(words);
    const other = shiftNamed ? suggestFunction({ label: String(c.label || '').replace(SHIFT, ' '), group: String(c.group || '').replace(SHIFT, ' '), id: String(c.id || '').replace(/_/g, ' ').replace(SHIFT, ' '), type }) : null;
    const suggestion = other || suggestFunction({ label: c.label, group: c.group, id: c.id, type });
    const layer = shiftNamed && other ? 'shift' : 'base';
    let fn = null;
    if (suggestion) {
      const deck = deckFromWords(words) || (useChannel ? midi.channel : 1);
      fn = normalizeFunction({ ...suggestion, deck: Math.min(deck, deckCount) }, deckCount);
    }
    const isRelative = kind === 'relative' || (fn && functionDef(fn.id) && ['jog', 'browse'].includes(fn.id) && fn.args.action !== 'touch' && fn.args.action !== 'press');
    const control = cleanControl({
      label: c.label || c.id,
      midi: { ...midi, encoding: isRelative ? (c.encoding || 'relative-two-complement') : undefined },
      kind: isRelative ? 'relative' : kind,
      layer,
      function: fn,
      feedback: c.led && midi.type !== 'pitchbend' && midi.type !== 'cc14' ? { led: { type: midi.type, channel: midi.channel, number: midi.number, on: 127, off: 0 } } : null,
    });
    if (control) model.controls.push(control);
  }
  uniqueIds(model.controls);
  return model;
}
