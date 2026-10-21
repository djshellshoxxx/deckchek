// General MIDI testing (SPEC-36): MIDI 1.0 message/stream conformance, universal Identity
// Request/Reply and a General MIDI Level 1 sound check. Pure module (no DOM, no I/O).
import { normalizeMeasurement } from './core.js';

const m = (metricId, label, value, unit, extra = {}) => normalizeMeasurement({ metricId, label, value, unit, ...extra });
const round = (v, d = 3) => (v == null || !Number.isFinite(v) ? v : Math.round(v * 10 ** d) / 10 ** d);

// ---------- message building ----------
export const GM_SYSTEM_ON = Object.freeze([0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7]);
export const GM_SYSTEM_OFF = Object.freeze([0xf0, 0x7e, 0x7f, 0x09, 0x02, 0xf7]);
export const IDENTITY_REQUEST = Object.freeze([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]);
export const ACTIVE_SENSING_MAX_GAP_MS = 330; // spec: sent at least every 300 ms, +10 % tolerance
const ch0 = c => (c - 1) & 0x0f;
export const noteOn = (ch, n, v = 100) => [0x90 | ch0(ch), n & 0x7f, v & 0x7f];
export const noteOff = (ch, n) => [0x80 | ch0(ch), n & 0x7f, 0];
export const controlChange = (ch, cc, v) => [0xb0 | ch0(ch), cc & 0x7f, v & 0x7f];
export const programChange = (ch, p) => [0xc0 | ch0(ch), p & 0x7f];
export const pitchBend = (ch, v14) => [0xe0 | ch0(ch), v14 & 0x7f, (v14 >> 7) & 0x7f];
export const masterVolume = (v14) => [0xf0, 0x7f, 0x7f, 0x04, 0x01, v14 & 0x7f, (v14 >> 7) & 0x7f, 0xf7];

// ---------- validation ----------
const CHANNEL_LEN = { 0x80: 3, 0x90: 3, 0xa0: 3, 0xb0: 3, 0xc0: 2, 0xd0: 2, 0xe0: 3 };
const SYSTEM_LEN = { 0xf1: 2, 0xf2: 3, 0xf3: 2, 0xf6: 1, 0xf8: 1, 0xfa: 1, 0xfb: 1, 0xfc: 1, 0xfe: 1, 0xff: 1 };

/** Validate one complete MIDI message. Returns {ok, kind, problem}; kind: channel|system|realtime|sysex. */
export function validateMessage(bytes) {
  const b = Array.from(bytes || []);
  if (!b.length) return { ok: false, kind: 'unknown', problem: 'empty message' };
  const s = b[0];
  if (s < 0x80) return { ok: false, kind: 'unknown', problem: `data byte 0x${s.toString(16)} without a status byte` };
  if (s === 0xf0) {
    if (b[b.length - 1] !== 0xf7) return { ok: false, kind: 'sysex', problem: 'SysEx is not terminated by F7' };
    if (b.length < 3) return { ok: false, kind: 'sysex', problem: 'SysEx has no manufacturer id' };
    const bad = b.slice(1, -1).findIndex(x => x > 0x7f);
    return bad >= 0 ? { ok: false, kind: 'sysex', problem: `SysEx byte ${bad + 1} has the high bit set` } : { ok: true, kind: 'sysex', problem: null };
  }
  const kind = s >= 0xf8 ? 'realtime' : s >= 0xf0 ? 'system' : 'channel';
  const need = s < 0xf0 ? CHANNEL_LEN[s & 0xf0] : s === 0xf7 ? null : SYSTEM_LEN[s];
  if (need == null) return { ok: false, kind, problem: s === 0xf7 ? 'stray F7 outside a SysEx' : `undefined status 0x${s.toString(16)}` };
  if (b.length !== need) return { ok: false, kind, problem: `status 0x${s.toString(16)} needs ${need} byte(s), got ${b.length}` };
  if (b.slice(1).some(x => x > 0x7f)) return { ok: false, kind, problem: 'data byte with the high bit set' };
  return { ok: true, kind, problem: null };
}

/**
 * Analyse a captured stream. events: [{tUs, bytes}] in arrival order; endUs = time the session ended
 * (for stuck notes and the trailing Active Sensing gap).
 */
export function analyzeStream(events = [], { endUs = null } = {}) {
  const evs = events.filter(e => e && e.bytes);
  const invalid = [], sysexBad = [];
  const sounding = new Map();
  let orphans = 0, total = 0;
  const channels = new Set();
  const ccTimes = new Map(); // `${ch}:${cc}` -> [tUs]
  const sensing = [], clock = [];
  for (const e of evs) {
    const bytes = Array.from(e.bytes || []);
    total++;
    const v = validateMessage(bytes);
    if (!v.ok) { (v.kind === 'sysex' ? sysexBad : invalid).push({ tUs: e.tUs, problem: v.problem, bytes: bytes.slice(0, 8) }); continue; }
    const s = bytes[0];
    if (v.kind === 'channel') {
      const ch = (s & 0x0f) + 1, type = s & 0xf0;
      channels.add(ch);
      if (type === 0x90 && bytes[2] > 0) { const k = `${ch}:${bytes[1]}`; sounding.set(k, (sounding.get(k) || 0) + 1); }
      else if (type === 0x80 || type === 0x90) {
        const k = `${ch}:${bytes[1]}`, n = sounding.get(k) || 0;
        if (n > 0) sounding.set(k, n - 1); else orphans++;
      } else if (type === 0xb0) { const k = `${ch}:${bytes[1]}`; (ccTimes.get(k) || ccTimes.set(k, []).get(k)).push(e.tUs); }
    } else if (s === 0xfe) sensing.push(e.tUs);
    else if (s === 0xf8) clock.push(e.tUs);
  }
  const hist = {};
  for (const e of evs) {
    const b = Array.from(e.bytes || []);
    if (!b.length) continue;
    const s = b[0];
    const name = s === 0xf0 ? 'sysex' : s >= 0xf8 ? (s === 0xfe ? 'active-sensing' : s === 0xf8 ? 'clock' : 'realtime') : s >= 0xf0 ? 'system' : s >= 0x80 ? ({ 0x80: 'note-off', 0x90: b[2] === 0 ? 'note-off' : 'note-on', 0xa0: 'poly-pressure', 0xb0: 'cc', 0xc0: 'program', 0xd0: 'pressure', 0xe0: 'pitch-bend' })[s & 0xf0] : 'data';
    hist[name] = (hist[name] || 0) + 1;
  }
  const stuck = [...sounding.entries()].filter(([, n]) => n > 0).map(([k]) => k);

  // 14-bit CC pairs: both n (0-31) and n+32 seen on one channel
  const pairs = [];
  for (const [key, msb] of ccTimes) {
    const [ch, cc] = key.split(':').map(Number);
    if (cc > 31) continue;
    const lsb = ccTimes.get(`${ch}:${cc + 32}`);
    if (!lsb) continue;
    const near = (t, list) => list.some(x => Math.abs(x - t) <= 20000);
    const hit = msb.filter(t => near(t, lsb)).length + lsb.filter(t => near(t, msb)).length;
    const frac = 1 - hit / (msb.length + lsb.length);
    pairs.push({ channel: ch, cc, unpairedFraction: round(frac, 3) });
  }
  const unpaired14 = pairs.filter(p => p.unpairedFraction > 0.5).length;

  const gaps = a => a.slice(1).map((t, i) => (t - a[i]) / 1000);
  let sensingMax = null;
  if (sensing.length >= 2) { const g = gaps(sensing); if (endUs != null) g.push((endUs - sensing[sensing.length - 1]) / 1000); sensingMax = Math.max(...g); }
  let clockJitter = null, bpm = null;
  if (clock.length >= 8) {
    const g = gaps(clock), mean = g.reduce((a, b) => a + b, 0) / g.length;
    const sd = Math.sqrt(g.reduce((a, x) => a + (x - mean) ** 2, 0) / g.length);
    clockJitter = (sd / mean) * 100; bpm = 60000 / (mean * 24);
  }
  const measurements = [
    m('midi_invalid_messages', 'Invalid MIDI messages', invalid.length, 'messages'),
    m('midi_sysex_malformed', 'Malformed SysEx messages', sysexBad.length, 'messages'),
    m('midi_stuck_notes', 'Notes still sounding at the end', stuck.length, 'notes', { confidence: endUs == null ? 0.6 : 1, qualityFlags: endUs == null ? ['no-session-end'] : [] }),
    m('midi_orphan_note_offs', 'Note-offs without a note-on', orphans, 'messages'),
    m('midi_unpaired_14bit', '14-bit controllers with unpaired halves', unpaired14, 'controllers'),
    m('midi_channels_used', 'MIDI channels used', channels.size, 'channels'),
    m('midi_message_count', 'Messages received', total, 'messages'),
    ...(sensingMax == null ? [] : [m('midi_active_sensing_gap_ms', 'Longest Active Sensing gap', round(sensingMax, 1), 'ms')]),
    ...(clockJitter == null ? [] : [m('midi_clock_jitter_percent', 'MIDI Clock interval jitter', round(clockJitter, 2), '%')]),
  ];
  return { total, invalid, sysexBad, stuck, orphans, channels: [...channels].sort((a, b) => a - b), kinds: hist, pairs, sensing: { count: sensing.length, maxGapMs: round(sensingMax, 1) }, clock: { count: clock.length, jitterPercent: round(clockJitter, 2), bpm: round(bpm, 2) }, measurements };
}

/** Plain-English findings for a stream analysis (+ optional identity result). */
export function conformanceFindings(a, identity = null) {
  const f = [];
  const F = (id, severity, title, meaning, action) => f.push({ id, severity, title, meaning, action });
  if (!a.total) F('midi-silent', 'warning', 'No MIDI messages were received', 'Nothing was sent while you exercised the device, so nothing could be checked.', 'Check the port selection, close DJ software that holds the port, then move controls during the test.');
  if (a.invalid.length) F('midi-invalid', 'error', `${a.invalid.length} invalid MIDI message${a.invalid.length > 1 ? 's' : ''}`, `First problem: ${a.invalid[0].problem}. Invalid messages confuse DJ software or are silently dropped.`, 'Retest with a different USB cable/port; if it persists the firmware or interface is faulty.');
  if (a.sysexBad.length) F('midi-sysex', 'error', `${a.sysexBad.length} malformed SysEx message${a.sysexBad.length > 1 ? 's' : ''}`, `First problem: ${a.sysexBad[0].problem}.`, 'Update the firmware; test another cable/port.');
  if (a.stuck.length) F('midi-stuck', 'error', `${a.stuck.length} note${a.stuck.length > 1 ? 's' : ''} never released`, `Notes ${a.stuck.slice(0, 6).join(', ')} stayed on. A pad or key that never sends note-off keeps triggering its function.`, 'Press and release them again; clean or replace the switch.');
  if (a.orphans) F('midi-orphan', 'warning', `${a.orphans} note-off without a note-on`, 'Releases arrived for notes that never started, which can mean dropped messages (USB hub, overloaded port) or a mis-sequenced controller.', 'Plug straight into the PC and retest.');
  const unp = a.pairs.filter(p => p.unpairedFraction > 0.5);
  if (unp.length) F('midi-14bit', 'info', `${unp.length} 14-bit controller${unp.length > 1 ? 's' : ''} send unpaired halves`, `CC ${unp.map(p => `${p.cc}/${p.cc + 32} (ch ${p.channel})`).join(', ')} rarely send MSB and LSB together, so 14-bit resolution may be lost in some software.`, 'Informational: many devices only send the half that changed.');
  if (a.sensing.maxGapMs != null && a.sensing.maxGapMs > ACTIVE_SENSING_MAX_GAP_MS) F('midi-sensing', 'warning', `Active Sensing gap ${a.sensing.maxGapMs} ms`, 'MIDI 1.0 requires Active Sensing at least every 300 ms once started; receivers may mute the device after a longer gap.', 'Update firmware; report to the manufacturer.');
  if (a.clock.jitterPercent != null && a.clock.jitterPercent > 5) F('midi-clock', 'warning', `MIDI Clock is uneven (${a.clock.jitterPercent}% jitter)`, 'Uneven clock ticks make synced software wobble.', 'Use a direct USB port and close heavy background apps.');
  if (identity && identity.status === 'none') F('midi-identity', 'info', 'No answer to the Identity Request', 'Many DJ controllers do not implement the universal Device Inquiry; this is normal.', 'None needed.');
  return f;
}

// ---------- identity ----------
/** Parse a Universal Identity Reply (F0 7E id 06 02 mfr(1|3) family(2) member(2) version(4) F7). */
export function parseIdentityReply(bytes) {
  const b = Array.from(bytes || []);
  if (b.length < 15 || b[0] !== 0xf0 || b[1] !== 0x7e || b[3] !== 0x06 || b[4] !== 0x02 || b[b.length - 1] !== 0xf7) return null;
  const three = b[5] === 0x00;
  const mfrLen = three ? 3 : 1;
  if (b.length !== 5 + mfrLen + 8 + 1) return null;
  const mfr = b.slice(5, 5 + mfrLen), r = 5 + mfrLen;
  if (b.slice(1, -1).some(x => x > 0x7f)) return null;
  const hex = a => a.map(x => x.toString(16).padStart(2, '0')).join(' ').toUpperCase();
  return {
    deviceId: b[2], manufacturerId: mfr, manufacturerHex: hex(mfr),
    family: b[r] | (b[r + 1] << 7), member: b[r + 2] | (b[r + 3] << 7), familyBytes: b.slice(r, r + 2), memberBytes: b.slice(r + 2, r + 4),
    version: b.slice(r + 4, r + 8), versionText: b.slice(r + 4, r + 8).join('.'),
  };
}

// ---------- General MIDI Level 1 ----------
export const GM_FACTS = Object.freeze({ percussionChannel: 10, drumKeyRange: [35, 81], minVoices: 24, programs: 128, pitchBendRangeSemitones: 2, requiredControllers: [1, 7, 10, 11, 64, 121, 123] });

const seq = (...items) => items.flat();
const at = (ms, bytes) => ({ delayMs: ms, bytes });
const allOff = () => Array.from({ length: 16 }, (_, c) => at(0, controlChange(c + 1, 123, 0)));

/** The ten audible steps. Each: {id, title, question, feature, messages:[{delayMs,bytes}]}; delayMs = wait AFTER sending. */
export function gmSteps() {
  const drum = (n, wait = 350) => [at(0, noteOn(10, n, 110)), at(wait, noteOff(10, n))];
  const steps = [
    { id: 'system-on', title: 'GM System On and a piano note', question: 'Did you hear a piano note (middle C)?', feature: 'GM System On / program 0',
      messages: seq(at(150, [...GM_SYSTEM_ON]), at(0, controlChange(1, 121, 0)), at(0, programChange(1, 0)), at(0, noteOn(1, 60, 100)), at(900, noteOff(1, 60))) },
    { id: 'programs', title: 'Program change', question: 'Did the sound change on each note (piano, nylon guitar, violin, trumpet, flute, square lead)?', feature: 'Program change',
      messages: [0, 24, 40, 56, 73, 80].flatMap(p => [at(0, programChange(1, p)), at(0, noteOn(1, 60, 100)), at(600, noteOff(1, 60))]) },
    { id: 'drums', title: 'Percussion on channel 10', question: 'Did you hear bass drum, snare, closed hi-hat, open hi-hat, crash and ride cymbals?', feature: 'Channel 10 percussion map',
      messages: [35, 38, 42, 46, 49, 51].flatMap(n => drum(n, 450)) },
    { id: 'volume', title: 'Channel volume (CC7)', question: 'Did a held note fade from loud to quiet?', feature: 'CC7 volume',
      messages: seq(at(0, programChange(1, 0)), at(0, controlChange(1, 7, 127)), at(0, noteOn(1, 60, 100)), [127, 100, 80, 60, 45, 30, 20].map(v => at(250, controlChange(1, 7, v))), at(0, noteOff(1, 60)), at(200, controlChange(1, 7, 100))) },
    { id: 'pan', title: 'Pan (CC10)', question: 'Did the held note move from the left speaker, to the middle, to the right?', feature: 'CC10 pan',
      messages: seq(at(0, controlChange(1, 10, 0)), at(0, noteOn(1, 64, 100)), at(600, controlChange(1, 10, 64)), at(600, controlChange(1, 10, 127)), at(600, noteOff(1, 64)), at(0, controlChange(1, 10, 64))) },
    { id: 'bend', title: 'Pitch bend (±2 semitones)', question: 'Did the held note rise, then fall below the start, then return?', feature: 'Pitch bend',
      messages: seq(at(0, noteOn(1, 60, 100)), [8192, 12288, 16383, 12288, 8192, 4096, 0, 4096, 8192].map(v => at(250, pitchBend(1, v))), at(0, noteOff(1, 60))) },
    { id: 'sustain', title: 'Sustain pedal (CC64)', question: 'Did the chord keep sounding after the keys were released, and stop when the pedal was lifted?', feature: 'CC64 sustain',
      messages: seq(at(0, controlChange(1, 64, 127)), [60, 64, 67].map(n => at(0, noteOn(1, n, 100))), at(500, []), [60, 64, 67].map(n => at(0, noteOff(1, n))), at(1500, controlChange(1, 64, 0))) },
    { id: 'polyphony', title: '24-voice polyphony', question: 'Did you hear a full chord and drums with no notes cutting out?', feature: '24 simultaneous voices',
      messages: seq(Array.from({ length: 16 }, (_, i) => at(0, noteOn(1, 40 + i * 2, 80))), Array.from({ length: 8 }, (_, i) => at(0, noteOn(10, 35 + i, 90))), at(1800, []), Array.from({ length: 16 }, (_, i) => at(0, noteOff(1, 40 + i * 2))), Array.from({ length: 8 }, (_, i) => at(0, noteOff(10, 35 + i)))) },
    { id: 'all-notes-off', title: 'All Notes Off (CC123)', question: 'Did all six held notes stop together when All Notes Off was sent?', feature: 'CC123 all notes off',
      messages: seq(Array.from({ length: 6 }, (_, i) => at(0, noteOn(1, 48 + i * 3, 90))), at(1200, controlChange(1, 123, 0)), at(600, [])) },
    { id: 'master-volume', title: 'Master volume SysEx', question: 'Was the second note clearly quieter than the first?', feature: 'Master volume SysEx',
      messages: seq(at(0, noteOn(1, 60, 100)), at(700, noteOff(1, 60)), at(0, masterVolume(0x2000)), at(100, noteOn(1, 60, 100)), at(700, noteOff(1, 60)), at(0, masterVolume(0x3fff))) },
  ];
  // an entry with no bytes is a pure wait: fold its delay into the previous message
  return steps.map(s => {
    const out = [];
    for (const x of s.messages) { if (x.bytes.length) out.push({ ...x }); else if (out.length) out[out.length - 1].delayMs += x.delayMs; }
    return { ...s, messages: out };
  });
}

/** Panic bytes sent when a GM test ends or is aborted. */
export const gmCleanup = () => allOff().map(x => x.bytes).concat([[0xb9, 120, 0]]);

/** answers: {[stepId]: 'yes'|'no'|'na'} -> measurement + findings + status ('skipped' when all N/A, null when unanswered). */
export function evaluateGm(answers = {}, steps = gmSteps()) {
  const vals = steps.map(s => answers[s.id]);
  const yes = vals.filter(v => v === 'yes').length, no = vals.filter(v => v === 'no').length, na = vals.filter(v => v === 'na').length;
  if (vals.some(v => !v)) return { status: null, detail: `${vals.filter(v => !v).length} step(s) still unanswered.`, measurements: [], findings: [] };
  if (na === steps.length) return { status: 'skipped', detail: 'Every step was marked not applicable (the device has no General MIDI sound source).', measurements: [], findings: [] };
  const pct = (100 * yes) / (yes + no);
  const findings = steps.filter(s => answers[s.id] === 'no').map(s => ({ id: `gm-${s.id}`, severity: 'warning', title: `General MIDI feature not heard: ${s.feature}`, meaning: `${s.title}: you reported that “${s.question}” was not true. A General MIDI Level 1 device must support this.`, action: 'Check the output volume and the selected sound source, resend after a GM reset, and update the firmware.' }));
  return { status: no ? 'fail' : 'pass', detail: no ? `${no} of ${yes + no} General MIDI features failed.` : `All ${yes} applicable General MIDI features worked.`, measurements: [m('midi_gm_ok_percent', 'General MIDI steps confirmed', round(pct, 1), '%'), m('midi_gm_steps_na', 'Steps marked not applicable', na, 'steps')], findings };
}
