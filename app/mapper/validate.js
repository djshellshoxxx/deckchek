// Mapping model validation (FS-32 §6). Errors block export; warnings are shown next to the preview.
// validateModel(model, {target}) -> {errors:[{code, controlIds, message}], warnings:[{code, controlIds, message}]}

import { functionDef, argsFor, deckApplies, valueKind, describeFunction, targetSupportsMessage, FUNCTION_TARGETS, MAX_DECKS, HOTCUE_MAX } from './vocabulary.js';
import { LIMITS } from './model.js';

/** Largest generated file accepted for export (FS-32 §6). */
export const MAX_EXPORT_BYTES = 512 * 1024;

const midiText = m => `${m.type === 'note' ? 'Note' : m.type === 'pitchbend' ? 'Pitch bend' : 'CC'} ${m.type === 'pitchbend' ? '' : `${m.number} `}on channel ${m.channel}`;

export function validateModel(model, { target = null } = {}) {
  const errors = [], warnings = [];
  const err = (code, controlIds, message) => errors.push({ code, controlIds, message });
  const warn = (code, controlIds, message) => warnings.push({ code, controlIds, message });
  if (!model || !Array.isArray(model.controls)) { err('MODEL_INVALID', [], 'There is no mapping to check.'); return { errors, warnings }; }
  const decks = Number(model.decks);
  if (!Number.isInteger(decks) || decks < 1 || decks > MAX_DECKS) err('DECKS_RANGE', [], `The number of decks must be 1 to ${MAX_DECKS}.`);
  if (!String(model.name || '').trim()) err('NAME_EMPTY', [], 'Give the mapping a name.');
  if (model.controls.length > LIMITS.maxControls) err('TOO_MANY_CONTROLS', [], `A mapping can hold at most ${LIMITS.maxControls} controls.`);

  // Unique (status, data1, layer). A 14-bit control also occupies its LSB number.
  const slots = new Map();
  for (const c of model.controls) {
    const m = c.midi || {};
    if (!Number.isInteger(m.channel) || m.channel < 1 || m.channel > 16) err('CHANNEL_RANGE', [c.id], `${c.label}: MIDI channel must be 1 to 16.`);
    if (!Number.isInteger(m.number) || m.number < 0 || m.number > 127) err('NUMBER_RANGE', [c.id], `${c.label}: MIDI number must be 0 to 127.`);
    if (m.type === 'cc14' && (!Number.isInteger(m.lsbNumber) || m.lsbNumber < 0 || m.lsbNumber > 127 || m.lsbNumber === m.number)) err('NUMBER_RANGE', [c.id], `${c.label}: the 14-bit LSB number must be 0 to 127 and differ from the MSB.`);
    const nums = m.type === 'cc14' ? [m.number, m.lsbNumber] : [m.number];
    for (const n of nums) {
      const key = `${(m.type === 'cc14' ? 0xb0 : m.status & 0xf0)}:${m.channel}:${n}:${c.layer}`;
      if (!slots.has(key)) slots.set(key, []);
      slots.get(key).push(c.id);
    }
  }
  for (const [key, ids] of slots) {
    if (ids.length < 2) continue;
    const c = model.controls.find(x => x.id === ids[0]);
    const layer = key.split(':')[3];
    err('DUPLICATE_BINDING', [...new Set(ids)], `${midiText(c.midi)}${layer === 'shift' ? ' (shift layer)' : ''} is bound ${ids.length} times: ${ids.map(id => model.controls.find(x => x.id === id)?.label).join(', ')}.`);
  }

  const hasShift = model.controls.some(c => c.function?.id === 'shift');
  for (const c of model.controls) {
    const fn = c.function;
    if (!fn) continue;
    const def = functionDef(fn.id);
    if (!def) { err('UNKNOWN_FUNCTION', [c.id], `${c.label}: unknown function "${String(fn.id).slice(0, 40)}".`); continue; }
    const args = fn.args || {};
    for (const a of argsFor(def, args)) {
      const v = args[a.name];
      if (v == null || !a.values.some(x => String(x) === String(v))) {
        if (def.id === 'hotcue' && a.name === 'n') err('HOTCUE_RANGE', [c.id], `${c.label}: hot cue number must be 1 to ${HOTCUE_MAX}.`);
        else err('ARG_RANGE', [c.id], `${c.label}: ${a.name} must be one of ${a.values.join(', ')}.`);
      }
    }
    if (deckApplies(def, args)) {
      if (!Number.isInteger(fn.deck) || fn.deck < 1 || fn.deck > (Number.isInteger(decks) ? decks : MAX_DECKS)) err('DECK_RANGE', [c.id], `${c.label}: deck must be 1 to ${Number.isInteger(decks) ? decks : MAX_DECKS}.`);
    }
    if (def.id === 'shift' && c.layer === 'shift') err('SHIFT_ON_SHIFT_LAYER', [c.id], `${c.label}: the Shift button itself belongs on the base layer.`);
    if (c.layer === 'shift' && c.midi.type === 'cc14') err('SHIFT_14BIT', [c.id], `${c.label}: 14-bit controls cannot be used on the shift layer.`);
    const want = valueKind(fn);
    if (want === 'button' && c.kind !== 'button') warn('KIND_MISMATCH', [c.id], `${c.label}: ${describeFunction(fn)} expects a button, but this control is a ${c.kind === 'relative' ? 'encoder' : 'fader or knob'}.`);
    else if (want !== 'button' && c.kind === 'button') warn('KIND_MISMATCH', [c.id], `${c.label}: ${describeFunction(fn)} expects a ${want === 'relative' ? 'rotary encoder' : 'fader or knob'}, but this control is a button.`);
    if (c.kind === 'relative' && !c.midi.encoding) warn('ENCODING_MISSING', [c.id], `${c.label}: choose how the encoder sends its movement; two's complement is assumed.`);
    if (target && !FUNCTION_TARGETS[target]?.[def.id]) warn('NO_EQUIVALENT', [c.id], `${c.label}: ${describeFunction(fn)} has no equivalent in this target and is skipped.`);
    if (target && !targetSupportsMessage(target, c.midi.type)) warn('NO_EQUIVALENT', [c.id], `${c.label}: pitch-bend messages are not exported to this target yet and are skipped.`);
  }
  const shifted = model.controls.filter(c => c.layer === 'shift' && (c.function || c.custom));
  if (shifted.length && !hasShift) err('SHIFT_MISSING', shifted.map(c => c.id), 'Controls use the shift layer, but no control is assigned to Shift.');
  if (target === 'mixxx' || target === 'vdj') {
    const skipped = model.controls.filter(c => c.custom && c.custom.target !== target);
    if (skipped.length) warn('CUSTOM_OTHER_TARGET', skipped.map(c => c.id), `${skipped.length} preserved custom control${skipped.length === 1 ? '' : 's'} from another program ${skipped.length === 1 ? 'is' : 'are'} not written to this target.`);
  }
  const unassigned = model.controls.filter(c => !c.function && !c.custom);
  if (unassigned.length) warn('UNASSIGNED', unassigned.map(c => c.id), `${unassigned.length} control${unassigned.length === 1 ? ' has' : 's have'} no function and ${unassigned.length === 1 ? 'is' : 'are'} not exported.`);
  return { errors, warnings };
}

/** Export-size gate (FS-32 §6: max file size 512 KB). Returns an error entry or null. */
export function checkExportSize(files) {
  for (const f of files || []) {
    const bytes = new TextEncoder().encode(f.content).length;
    if (bytes > MAX_EXPORT_BYTES) return { code: 'FILE_TOO_LARGE', controlIds: [], message: `${f.name} would be ${Math.ceil(bytes / 1024)} KB; the limit is ${MAX_EXPORT_BYTES / 1024} KB.` };
  }
  return null;
}
