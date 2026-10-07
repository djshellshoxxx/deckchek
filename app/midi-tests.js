// Pure MIDI test analysis (no DOM). metricIds follow docs/DEVICE-PROFILE-SCHEMA.md.
import { normalizeMeasurement } from './core.js';

const m = (metricId, label, value, unit, extra = {}) => normalizeMeasurement({ metricId, label, value, unit, ...extra });
const round = (v, d = 3) => (v == null || !Number.isFinite(v) ? v : Math.round(v * 10 ** d) / 10 ** d);

/** Parse raw MIDI bytes. channel is 1-16 (null for system messages). */
export function parseMessage(bytes) {
  const b = Array.from(bytes || []);
  if (!b.length) return { kind: 'other', channel: null, number: null, value: null };
  const s = b[0];
  if (s === 0xf0) return { kind: 'sysex', channel: null, number: null, value: null, bytes: b };
  if (s === 0xf8) return { kind: 'clock', channel: null, number: null, value: null };
  if (s >= 0xf0 || s < 0x80) return { kind: 'other', channel: null, number: null, value: null };
  const type = s & 0xf0, channel = (s & 0x0f) + 1, d1 = b[1] ?? 0, d2 = b[2] ?? 0;
  switch (type) {
    case 0x90: return d2 === 0
      ? { kind: 'note-off', channel, number: d1, value: 0 }
      : { kind: 'note-on', channel, number: d1, value: d2 };
    case 0x80: return { kind: 'note-off', channel, number: d1, value: d2 };
    case 0xb0: return { kind: 'cc', channel, number: d1, value: d2 };
    case 0xe0: { const v14 = (d2 << 7) | d1; return { kind: 'pitchbend', channel, number: 0, value: d2, value14: v14 }; }
    case 0xc0: return { kind: 'program', channel, number: d1, value: d1 };
    case 0xd0: return { kind: 'aftertouch', channel, number: 0, value: d1 };
    case 0xa0: return { kind: 'aftertouch', channel, number: d1, value: d2 };
    default: return { kind: 'other', channel, number: d1, value: d2 };
  }
}

function cc14Numbers(c) {
  const msb = c.message.msbNumber ?? c.message.number;
  const lsb = c.message.lsbNumber ?? (msb != null ? msb + 32 : null);
  return { msb, lsb };
}

/**
 * Match a parsed message against profile controls. Returns {control, value, value14?, half?, complete?} or null.
 * For cc14 pass a persistent `state` object ({}) so MSB/LSB halves can be paired across calls.
 */
export function matchControl(profileMidi, msg, state = {}) {
  const controls = profileMidi?.controls || [];
  if (!msg) return null;
  for (const c of controls) {
    const mm = c.message || {};
    if (mm.channel != null && msg.channel != null && mm.channel !== msg.channel) continue;
    switch (mm.kind) {
      case 'note':
        if ((msg.kind === 'note-on' || msg.kind === 'note-off') && msg.number === mm.number)
          return { control: c, value: msg.kind === 'note-on' ? msg.value : 0, pressed: msg.kind === 'note-on' };
        break;
      case 'cc':
        if (msg.kind === 'cc' && msg.number === mm.number) return { control: c, value: msg.value };
        break;
      case 'cc14': {
        if (msg.kind !== 'cc') break;
        const { msb, lsb } = cc14Numbers(c);
        if (msg.number !== msb && msg.number !== lsb) break;
        const st = (state[c.id] ||= { msb: null, lsb: null });
        const half = msg.number === msb ? 'msb' : 'lsb';
        st[half] = msg.value;
        const complete = st.msb != null && st.lsb != null;
        return { control: c, half, complete, value: ((st.msb ?? 0) << 7) | (st.lsb ?? 0), value14: ((st.msb ?? 0) << 7) | (st.lsb ?? 0) };
      }
      case 'pitchbend':
        if (msg.kind === 'pitchbend') return { control: c, value: msg.value14, value14: msg.value14 };
        break;
      default: break;
    }
  }
  return null;
}

const isLearn = (p) => !p || p.mapSource === 'learn' || !(p.controls || []).length;
const ignorable = (msg) => msg.kind === 'clock' || (msg.kind === 'other' && msg.channel == null);

export function createCoverageSession(profileMidi) {
  const learn = isLearn(profileMidi);
  const controls = learn ? [] : profileMidi.controls;
  const stats = new Map(); // id -> {count,min,max,first,last}
  const discovered = new Map(); // learn key -> {kind,channel,number,count,min,max}
  const unexpected = [];
  const pairState = {};
  let total = 0;

  function ingest(msg, tUs = 0) {
    if (!msg || ignorable(msg)) return null;
    total++;
    if (learn) {
      const kind = msg.kind === 'note-on' || msg.kind === 'note-off' ? 'note' : msg.kind;
      const key = `${kind}:${msg.channel}:${msg.number}`;
      const d = discovered.get(key) || { kind, channel: msg.channel, number: msg.number, count: 0, min: Infinity, max: -Infinity };
      const v = msg.value14 ?? msg.value ?? 0;
      d.count++; d.min = Math.min(d.min, v); d.max = Math.max(d.max, v);
      discovered.set(key, d);
      return { learned: key };
    }
    const hit = matchControl(profileMidi, msg, pairState);
    if (!hit) {
      unexpected.push({ tUs, kind: msg.kind, channel: msg.channel, number: msg.number, value: msg.value });
      return null;
    }
    const s = stats.get(hit.control.id) || { count: 0, min: Infinity, max: -Infinity, first: tUs, last: tUs };
    s.count++; s.min = Math.min(s.min, hit.value); s.max = Math.max(s.max, hit.value); s.last = tUs;
    stats.set(hit.control.id, s);
    return hit;
  }

  function report({ groups } = {}) {
    if (learn) {
      const list = [...discovered.values()].map((d) => ({ ...d, min: d.min, max: d.max }));
      return {
        mode: 'learn', totalMessages: total, discovered: list, groups: {}, controls: [], unexpected: [],
        percentSeen: null,
        measurements: [m('midi_controls_discovered', 'Distinct controls discovered', list.length, 'controls', { confidence: 0.6, qualityFlags: ['learn-mode'] })],
      };
    }
    const scoped = groups?.length ? controls.filter((c) => groups.includes(c.group)) : controls;
    const byGroup = {};
    const rows = scoped.map((c) => {
      const s = stats.get(c.id);
      const row = { id: c.id, label: c.label, group: c.group || 'Ungrouped', seen: !!s, count: s?.count || 0, min: s ? s.min : null, max: s ? s.max : null };
      (byGroup[row.group] ||= { seen: [], unseen: [] })[row.seen ? 'seen' : 'unseen'].push(c.id);
      return row;
    });
    const seen = rows.filter((r) => r.seen).length;
    const percent = rows.length ? round((100 * seen) / rows.length, 1) : 0;
    const flags = profileMidi.complete === false ? ['incomplete-map'] : [];
    return {
      mode: 'map', totalMessages: total, groups: byGroup, controls: rows, unexpected: unexpected.slice(), percentSeen: percent,
      measurements: [
        m('midi_controls_seen_percent', 'Controls seen', percent, '%', { qualityFlags: flags, confidence: flags.length ? 0.7 : 1 }),
        m('midi_unexpected_messages', 'Unexpected MIDI messages', unexpected.length, 'messages', { qualityFlags: flags }),
      ],
    };
  }
  return { ingest, report };
}

export function analyzeFader(samples, { bits = 7, jitterLsb = 2 } = {}) {
  const v = (samples || []).map((s) => s.value).filter(Number.isFinite);
  if (v.length < 2) return { measurements: [], segments: 0, error: 'not enough samples' };
  const min = Math.min(...v), max = Math.max(...v);
  // zigzag segmentation: a segment ends when value retreats > jitterLsb from its extreme
  let dir = 0, ext = v[0];
  const segDir = new Array(v.length - 1).fill(0);
  let segments = 0, cur = 0, extIdx = 0;
  const breaks = [];
  for (let i = 1; i < v.length; i++) {
    const x = v[i];
    if (dir === 0) { if (Math.abs(x - ext) > jitterLsb) { dir = Math.sign(x - ext); ext = x; extIdx = i; cur = 1; segments = 1; } }
    else if (dir * (x - ext) > 0) { ext = x; extIdx = i; }
    else if (dir * (ext - x) > jitterLsb) { breaks.push([extIdx, dir]); dir = -dir; ext = x; extIdx = i; segments++; }
  }
  // assign directions to steps
  let bi = 0, d = 0;
  const firstDir = breaks.length ? breaks[0][1] : dir;
  d = firstDir;
  let seg = 0; let boundary = breaks.length ? breaks[0][0] : Infinity;
  for (let i = 0; i < v.length - 1; i++) {
    while (i >= boundary) { bi++; d = -d; boundary = bi < breaks.length ? breaks[bi][0] : Infinity; }
    segDir[i] = d;
  }
  // before the first real movement direction is unknown: only trust steps once movement exceeded threshold
  let good = 0, steps = 0, reversals = 0, prev = 0;
  for (let i = 0; i < v.length - 1; i++) {
    const step = v[i + 1] - v[i];
    if (step !== 0) {
      if (prev !== 0 && Math.sign(step) !== Math.sign(prev) && Math.abs(step) <= jitterLsb && Math.abs(prev) <= jitterLsb && segDir[i] === segDir[i - 1]) reversals++;
      prev = step;
    }
    if (segDir[i] === 0 || step === 0) continue;
    steps++;
    if (segDir[i] * step > 0) good++;
  }
  const distinct = new Set(v).size;
  const monotonic = steps ? (100 * good) / steps : 100;
  const resBits = Math.min(bits, Math.log2(Math.max(1, distinct)));
  const unit = bits === 14 ? 'LSB14' : 'LSB7';
  return {
    min, max, segments, distinct, resolutionBits: round(resBits, 2), monotonicPercent: round(monotonic, 2), jitterReversals: reversals,
    measurements: [
      m('midi_fader_min', 'Fader minimum', min, unit),
      m('midi_fader_max', 'Fader maximum', max, unit),
      m('midi_fader_monotonic_percent', 'Fader monotonic travel', round(monotonic, 2), '%', { qualityFlags: segments < 2 ? ['single-sweep'] : [] }),
      m('midi_fader_jitter_lsb', 'Fader jitter reversals', reversals, 'reversals'),
      m('midi_fader_resolution_bits', 'Fader effective resolution', round(resBits, 2), 'bits', { confidence: distinct < 8 ? 0.4 : 0.8, qualityFlags: distinct < 8 ? ['few-samples'] : [] }),
    ],
  };
}

export function decodeJogDelta(value, encoding = 'relative-two-complement', prev = null, bits = 7) {
  if (encoding === 'relative-two-complement') return value < 64 ? value : value - 128;
  if (encoding === 'relative-offset64') return value - 64;
  if (prev == null) return 0;
  const span = 2 ** bits;
  let dlt = value - prev;
  if (dlt > span / 2) dlt -= span; else if (dlt < -span / 2) dlt += span;
  return dlt;
}

/** opts.revolutions: [{startUs,endUs,direction:+1|-1}] marked by the user (one rev each way). */
export function analyzeJog(samples, { encoding = 'relative-two-complement', revolutions = [], bits = 7 } = {}) {
  const deltas = [];
  let prev = null;
  for (const s of samples || []) {
    const d = decodeJogDelta(s.value, encoding, prev, bits);
    prev = s.value;
    if (d !== 0) deltas.push({ tUs: s.tUs, d });
  }
  let ticks = null, errors = 0;
  const perRev = [];
  if (revolutions.length) {
    for (const r of revolutions) {
      const inR = deltas.filter((x) => x.tUs >= r.startUs && x.tUs <= r.endUs);
      const net = inR.reduce((a, x) => a + x.d, 0);
      perRev.push({ direction: r.direction, ticks: Math.abs(net) });
      errors += inR.filter((x) => Math.sign(x.d) !== Math.sign(r.direction)).length;
    }
    ticks = perRev.reduce((a, r) => a + r.ticks, 0) / perRev.length;
  } else {
    const pos = deltas.filter((x) => x.d > 0).length, neg = deltas.length - pos;
    errors = Math.min(pos, neg);
  }
  const flags = revolutions.length ? [] : ['no-revolution-marks'];
  return {
    ticksPerRev: ticks, directionErrors: errors, perRev, deltas: deltas.length,
    measurements: [
      ...(ticks == null ? [] : [m('midi_jog_ticks_per_rev', 'Jog ticks per revolution', round(ticks, 1), 'ticks', { qualityFlags: perRev.length < 2 ? ['single-direction'] : [] })]),
      m('midi_jog_direction_errors', 'Jog direction errors', errors, 'ticks', { qualityFlags: flags, confidence: flags.length ? 0.5 : 1 }),
    ],
  };
}

/** events: [{tUs, pressed:boolean, controlId?}] */
export function analyzeButton(events, { bounceWindowUs = 5000, stuckAfterSec = 10, endUs = null } = {}) {
  const per = new Map();
  let bounces = 0;
  for (const e of [...(events || [])].sort((a, b) => a.tUs - b.tUs)) {
    const id = e.controlId ?? '_';
    const st = per.get(id) || { pressed: null, lastT: null, bounces: 0 };
    if (st.pressed !== null && e.pressed !== st.pressed && e.tUs - st.lastT < bounceWindowUs) { st.bounces++; bounces++; }
    if (st.pressed === null || e.pressed !== st.pressed) { st.pressed = e.pressed; st.lastT = e.tUs; }
    per.set(id, st);
  }
  const stuck = [];
  if (endUs != null) for (const [id, st] of per) if (st.pressed && endUs - st.lastT > stuckAfterSec * 1e6) stuck.push(id);
  const perControl = Object.fromEntries([...per].map(([id, s]) => [id, { bounces: s.bounces, pressed: s.pressed }]));
  return {
    bounces, stuck, perControl,
    measurements: [
      m('midi_button_bounce_count', 'Button bounce events', bounces, 'events'),
      m('midi_button_stuck', 'Buttons stuck on', stuck.length, 'buttons', { confidence: endUs == null ? 0.5 : 1, qualityFlags: endUs == null ? ['no-session-end'] : [] }),
    ],
  };
}

/** timestamps: array of microsecond times (or objects with tUs). */
export function analyzeTiming(timestamps) {
  const t = (timestamps || []).map((x) => (typeof x === 'number' ? x : x.tUs)).filter(Number.isFinite);
  if (t.length < 3) return { jitterMs: null, ratePerSec: null, measurements: [], error: 'not enough samples' };
  const gaps = [];
  for (let i = 1; i < t.length; i++) gaps.push((t[i] - t[i - 1]) / 1000);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  const span = (t[t.length - 1] - t[0]) / 1e6;
  const rate = span > 0 ? (t.length - 1) / span : null;
  return {
    jitterMs: round(sd, 4), meanIntervalMs: round(mean, 4), maxIntervalMs: Math.max(...gaps), ratePerSec: round(rate, 2), count: t.length,
    measurements: [m('midi_jitter_ms', 'MIDI inter-message jitter', round(sd, 4), 'ms', { qualityFlags: t.length < 50 ? ['few-samples'] : [] })],
  };
}

/** LED on/off byte sequence for controls with led:true (or those listed). */
export function buildLedSequence(profileMidi, controlIds) {
  const ids = controlIds?.length ? new Set(controlIds) : null;
  const out = [];
  for (const c of profileMidi?.controls || []) {
    if (ids ? !ids.has(c.id) : !c.led) continue;
    const { kind, channel = 1, number } = c.message || {};
    const ch = ((channel || 1) - 1) & 0x0f;
    if (kind === 'note') {
      out.push({ controlId: c.id, bytes: [0x90 | ch, number, 127], label: `${c.label || c.id} ON` });
      out.push({ controlId: c.id, bytes: [0x80 | ch, number, 0], label: `${c.label || c.id} OFF` });
    } else if (kind === 'cc') {
      out.push({ controlId: c.id, bytes: [0xb0 | ch, number, 127], label: `${c.label || c.id} ON` });
      out.push({ controlId: c.id, bytes: [0xb0 | ch, number, 0], label: `${c.label || c.id} OFF` });
    }
  }
  return out;
}
