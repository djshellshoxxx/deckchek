import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, matchControl, createCoverageSession, analyzeFader, analyzeJog, analyzeButton, analyzeTiming, buildLedSequence } from '../app/midi-tests.js';

const profile = {
  mapSource: 'x', complete: true,
  controls: [
    { id: 'play', label: 'Play', group: 'Deck 1', type: 'button', led: true, message: { kind: 'note', channel: 1, number: 11 } },
    { id: 'gain', label: 'Gain', group: 'Mixer', type: 'knob', message: { kind: 'cc', channel: 1, number: 5 } },
    { id: 'fader', label: 'Fader', group: 'Mixer', type: 'fader', message: { kind: 'cc14', channel: 2, number: 1, msbNumber: 1, lsbNumber: 33 } },
    { id: 'pitch', label: 'Pitch', group: 'Deck 1', type: 'fader', message: { kind: 'pitchbend', channel: 1, number: 0 } },
    { id: 'cue', label: 'Cue', group: 'Deck 1', type: 'button', led: true, message: { kind: 'cc', channel: 3, number: 9 } },
  ],
};

test('parseMessage', () => {
  assert.deepEqual(parseMessage([0x91, 60, 100]), { kind: 'note-on', channel: 2, number: 60, value: 100 });
  assert.equal(parseMessage([0x90, 60, 0]).kind, 'note-off');
  assert.equal(parseMessage([0x80, 60, 5]).kind, 'note-off');
  assert.deepEqual(parseMessage([0xbf, 7, 99]), { kind: 'cc', channel: 16, number: 7, value: 99 });
  assert.equal(parseMessage([0xe0, 0x7f, 0x7f]).value14, 16383);
  assert.equal(parseMessage([0xc0, 3]).kind, 'program');
  assert.equal(parseMessage([0xd0, 3]).kind, 'aftertouch');
  assert.equal(parseMessage([0xf0, 1, 2, 0xf7]).kind, 'sysex');
  assert.equal(parseMessage([0xf8]).kind, 'clock');
  assert.equal(parseMessage([0xfe]).kind, 'other');
});

test('matchControl incl cc14 pairing and pitchbend', () => {
  assert.equal(matchControl(profile, parseMessage([0x90, 11, 127])).control.id, 'play');
  assert.equal(matchControl(profile, parseMessage([0x80, 11, 0])).value, 0);
  assert.equal(matchControl(profile, parseMessage([0x90, 11, 127])).pressed, true);
  assert.equal(matchControl(profile, parseMessage([0x91, 11, 127])), null); // wrong channel
  const st = {};
  const a = matchControl(profile, parseMessage([0xb1, 1, 2]), st);
  assert.equal(a.complete, false);
  const b = matchControl(profile, parseMessage([0xb1, 33, 5]), st);
  assert.equal(b.control.id, 'fader'); assert.equal(b.complete, true); assert.equal(b.value14, (2 << 7) | 5);
  assert.equal(matchControl(profile, parseMessage([0xe0, 0, 64])).value14, 64 << 7);
  assert.equal(matchControl(profile, parseMessage([0xb0, 99, 1])), null);
});

test('coverage session map mode', () => {
  const s = createCoverageSession(profile);
  s.ingest(parseMessage([0x90, 11, 127]), 1);
  s.ingest(parseMessage([0xb0, 5, 10]), 2);
  s.ingest(parseMessage([0xb0, 5, 90]), 3);
  s.ingest(parseMessage([0xb0, 77, 1]), 4);
  s.ingest(parseMessage([0xf8]), 5);
  const r = s.report();
  assert.equal(r.percentSeen, 40);
  const gain = r.controls.find((c) => c.id === 'gain');
  assert.equal(gain.min, 10); assert.equal(gain.max, 90);
  assert.deepEqual(r.groups['Deck 1'].unseen.sort(), ['cue', 'pitch']);
  assert.equal(r.unexpected.length, 1);
  assert.equal(r.measurements.find((x) => x.metricId === 'midi_unexpected_messages').value, 1);
  assert.equal(r.measurements.find((x) => x.metricId === 'midi_controls_seen_percent').unit, '%');
  const g = s.report({ groups: ['Mixer'] });
  assert.equal(g.controls.length, 2);
});

test('coverage session learn mode', () => {
  const s = createCoverageSession({ mapSource: 'learn', controls: [] });
  s.ingest(parseMessage([0x90, 1, 100])); s.ingest(parseMessage([0x80, 1, 0])); s.ingest(parseMessage([0xb0, 2, 5])); s.ingest(parseMessage([0xb0, 2, 9]));
  const r = s.report();
  assert.equal(r.mode, 'learn');
  assert.equal(r.discovered.length, 2);
  assert.equal(r.discovered.find((d) => d.kind === 'cc').max, 9);
  assert.equal(r.measurements[0].metricId, 'midi_controls_discovered');
});

test('analyzeFader clean sweeps', () => {
  const v = []; for (let i = 0; i <= 127; i++) v.push(i); for (let i = 126; i >= 0; i--) v.push(i);
  const r = analyzeFader(v.map((value, i) => ({ tUs: i * 1000, value })), { bits: 7 });
  assert.equal(r.min, 0); assert.equal(r.max, 127);
  assert.equal(r.monotonicPercent, 100); assert.equal(r.jitterReversals, 0);
  assert.equal(r.segments, 2); assert.equal(r.resolutionBits, 7);
  assert.equal(r.measurements.length, 5);
});

test('analyzeFader jitter and non-monotonic', () => {
  const v = [0, 10, 20, 21, 20, 21, 20, 30, 40, 50, 45, 55, 60];
  const r = analyzeFader(v.map((value) => ({ value })), { bits: 7 });
  assert.ok(r.jitterReversals >= 3);
  assert.ok(r.monotonicPercent < 100 && r.monotonicPercent > 70);
  const coarse = analyzeFader([0, 32, 64, 96, 127].map((value) => ({ value })), { bits: 7 });
  assert.ok(Math.abs(coarse.resolutionBits - Math.log2(5)) < 0.01);
});

test('analyzeJog twos complement', () => {
  const samples = []; const revs = [];
  let t = 0;
  const start1 = t; for (let i = 0; i < 100; i++) samples.push({ tUs: t += 1000, value: 4 }); // 400 ticks fwd
  revs.push({ startUs: start1, endUs: t, direction: 1 });
  t += 1000; const start2 = t;
  for (let i = 0; i < 100; i++) samples.push({ tUs: t += 1000, value: 124 }); // -4 each
  samples.push({ tUs: t += 1000, value: 2 }); // wrong direction tick
  revs.push({ startUs: start2, endUs: t, direction: -1 });
  const r = analyzeJog(samples, { encoding: 'relative-two-complement', revolutions: revs });
  assert.equal(r.directionErrors, 1);
  assert.equal(r.ticksPerRev, (400 + 398) / 2);
  assert.ok(r.measurements.some((x) => x.metricId === 'midi_jog_ticks_per_rev'));
});

test('analyzeJog offset64 and absolute', () => {
  const o = analyzeJog([{ tUs: 1, value: 65 }, { tUs: 2, value: 63 }, { tUs: 3, value: 64 }], { encoding: 'relative-offset64' });
  assert.equal(o.deltas, 2); assert.equal(o.directionErrors, 1); assert.equal(o.ticksPerRev, null);
  const a = analyzeJog([125, 127, 1, 3].map((value, i) => ({ tUs: i * 10, value })), { encoding: 'absolute', revolutions: [{ startUs: 0, endUs: 100, direction: 1 }] });
  assert.equal(a.ticksPerRev, 6); // 125->127->1(wrap)->3
});

test('analyzeButton bounce and stuck', () => {
  const ev = [
    { tUs: 0, pressed: true, controlId: 'a' }, { tUs: 2000, pressed: false, controlId: 'a' }, { tUs: 3000, pressed: true, controlId: 'a' },
    { tUs: 500000, pressed: false, controlId: 'a' },
    { tUs: 1000, pressed: true, controlId: 'b' },
  ];
  const r = analyzeButton(ev, { endUs: 20e6 });
  assert.equal(r.bounces, 2);
  assert.deepEqual(r.stuck, ['b']);
  const r2 = analyzeButton(ev, { endUs: 2e6 });
  assert.equal(r2.stuck.length, 0);
  assert.equal(analyzeButton([{ tUs: 0, pressed: true }, { tUs: 100000, pressed: false }]).bounces, 0);
});

test('analyzeTiming', () => {
  const steady = Array.from({ length: 100 }, (_, i) => i * 5000);
  const r = analyzeTiming(steady);
  assert.equal(r.jitterMs, 0); assert.equal(r.ratePerSec, 200);
  const j = analyzeTiming(steady.map((t, i) => t + (i % 2 ? 1000 : 0)));
  assert.ok(j.jitterMs > 0.9);
  assert.equal(r.measurements[0].metricId, 'midi_jitter_ms');
  assert.equal(analyzeTiming([1]).jitterMs, null);
});

test('buildLedSequence', () => {
  const seq = buildLedSequence(profile);
  assert.deepEqual(seq.map((s) => s.bytes), [[0x90, 11, 127], [0x80, 11, 0], [0xb2, 9, 127], [0xb2, 9, 0]]);
  assert.equal(buildLedSequence(profile, ['gain']).length, 2);
  assert.equal(buildLedSequence(profile, ['fader']).length, 0);
});
