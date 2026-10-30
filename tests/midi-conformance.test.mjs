import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMessage, analyzeStream, conformanceFindings, parseIdentityReply, gmSteps, gmCleanup, evaluateGm, noteOn, noteOff, controlChange, pitchBend, masterVolume, GM_SYSTEM_ON, IDENTITY_REQUEST, GM_FACTS } from '../app/midi-conformance.js';

const mv = (r, id) => r.measurements.find(x => x.metricId === id)?.value;
const ev = (t, bytes) => ({ tUs: t, bytes });

test('validateMessage accepts valid messages and flags every malformed class', () => {
  for (const b of [[0x90, 60, 100], [0x80, 60, 0], [0xb3, 7, 127], [0xc0, 5], [0xd1, 9], [0xe0, 0, 64], [0xa0, 60, 1], [0xf8], [0xfe], [0xfa], [0xf1, 5], [0xf2, 1, 2], [0xf3, 4], [0xf6], [0xf0, 0x7e, 0x7f, 6, 1, 0xf7]]) assert.equal(validateMessage(b).ok, true, String(b));
  const bad = [[], [0x40, 1], [0x90, 60], [0x90, 60, 200], [0xc0, 5, 5], [0xf4], [0xf5, 1], [0xf9], [0xfd], [0xf7], [0xf8, 1], [0xf0, 1, 2], [0xf0, 0x80, 1, 0xf7], [0xf0, 0xf7]];
  for (const b of bad) assert.equal(validateMessage(b).ok, false, String(b));
  assert.equal(validateMessage([0xf0, 1, 2]).kind, 'sysex');
});

test('analyzeStream: clean session reports zeros', () => {
  const evs = [ev(0, noteOn(1, 60)), ev(1000, noteOff(1, 60)), ev(2000, [0x90, 62, 90]), ev(3000, [0x90, 62, 0]), ev(4000, controlChange(2, 7, 80)), ev(5000, [0xf0, 0x7e, 0x7f, 0x06, 0x02, 0xf7])];
  const a = analyzeStream(evs, { endUs: 10000 });
  assert.equal(mv(a, 'midi_invalid_messages'), 0); assert.equal(mv(a, 'midi_sysex_malformed'), 0);
  assert.equal(mv(a, 'midi_stuck_notes'), 0); assert.equal(mv(a, 'midi_orphan_note_offs'), 0);
  assert.deepEqual(a.channels, [1, 2]); assert.equal(a.kinds['note-on'], 2); assert.equal(a.kinds['note-off'], 2); assert.equal(a.kinds.sysex, 1);
  assert.equal(conformanceFindings(a).length, 0);
  assert.equal(a.measurements.find(x => x.metricId === 'midi_active_sensing_gap_ms'), undefined);
});

test('analyzeStream: invalid, malformed SysEx, orphans, stuck notes', () => {
  const a = analyzeStream([ev(0, [0x90, 60, 200]), ev(1, [0xf0, 1, 2]), ev(2, noteOff(1, 70)), ev(3, noteOn(1, 61)), ev(4, noteOn(1, 61)), ev(5, noteOff(1, 61)), ev(6, noteOn(3, 5))], { endUs: 100 });
  assert.equal(mv(a, 'midi_invalid_messages'), 1); assert.equal(mv(a, 'midi_sysex_malformed'), 1);
  assert.equal(mv(a, 'midi_orphan_note_offs'), 1);
  assert.equal(mv(a, 'midi_stuck_notes'), 2); // 1:61 still held once, 3:5
  const ids = conformanceFindings(a).map(f => f.id);
  for (const id of ['midi-invalid', 'midi-sysex', 'midi-stuck', 'midi-orphan']) assert.ok(ids.includes(id), id);
  assert.equal(analyzeStream([ev(0, noteOn(1, 1))]).measurements.find(x => x.metricId === 'midi_stuck_notes').qualityFlags[0], 'no-session-end');
  assert.equal(conformanceFindings(analyzeStream([]))[0].id, 'midi-silent');
});

test('analyzeStream: Active Sensing gap, MIDI clock jitter, 14-bit pairing', () => {
  const sens = analyzeStream([ev(0, [0xfe]), ev(250000, [0xfe]), ev(500000, [0xfe]), ev(900000, [0xfe])]);
  assert.equal(mv(sens, 'midi_active_sensing_gap_ms'), 400);
  assert.equal(conformanceFindings(sens).some(f => f.id === 'midi-sensing'), true);
  assert.equal(conformanceFindings(analyzeStream([ev(0, [0xfe]), ev(250000, [0xfe])])).some(f => f.id === 'midi-sensing'), false);
  const steady = analyzeStream(Array.from({ length: 30 }, (_, i) => ev(i * 20833, [0xf8])));
  assert.ok(mv(steady, 'midi_clock_jitter_percent') < 0.01); assert.ok(Math.abs(steady.clock.bpm - 120) < 0.1, String(steady.clock.bpm));
  let t = 0; const ragged = analyzeStream(Array.from({ length: 30 }, (_, i) => ev(t += i % 2 ? 30000 : 12000, [0xf8])));
  assert.ok(mv(ragged, 'midi_clock_jitter_percent') > 20);
  assert.equal(conformanceFindings(ragged).some(f => f.id === 'midi-clock'), true);
  const paired = analyzeStream(Array.from({ length: 10 }, (_, i) => [ev(i * 5000, controlChange(1, 1, i)), ev(i * 5000 + 200, controlChange(1, 33, i))]).flat());
  assert.equal(mv(paired, 'midi_unpaired_14bit'), 0);
  const loose = analyzeStream([ev(0, controlChange(1, 1, 1)), ev(500000, controlChange(1, 33, 1)), ev(1000000, controlChange(1, 1, 2)), ev(1500000, controlChange(1, 33, 2))]);
  assert.equal(mv(loose, 'midi_unpaired_14bit'), 1);
  const only7 = analyzeStream([ev(0, controlChange(1, 1, 1)), ev(5, controlChange(1, 1, 2))]);
  assert.equal(mv(only7, 'midi_unpaired_14bit'), 0);
});

test('identity request/reply', () => {
  assert.deepEqual([...IDENTITY_REQUEST], [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]);
  const one = parseIdentityReply([0xf0, 0x7e, 0x00, 0x06, 0x02, 0x42, 0x01, 0x00, 0x02, 0x00, 1, 2, 3, 4, 0xf7]);
  assert.equal(one.manufacturerHex, '42'); assert.equal(one.family, 1); assert.equal(one.member, 2); assert.equal(one.versionText, '1.2.3.4');
  const three = parseIdentityReply([0xf0, 0x7e, 0x7f, 0x06, 0x02, 0x00, 0x20, 0x29, 0x03, 0x01, 0x00, 0x02, 5, 6, 7, 8, 0xf7]);
  assert.equal(three.manufacturerHex, '00 20 29'); assert.equal(three.family, 0x83); assert.equal(three.member, 0x100);
  for (const bad of [null, [], [0xf0, 0x7e, 0, 6, 2, 0xf7], [0xf0, 0x7e, 0, 6, 1, 0x42, 1, 0, 2, 0, 1, 2, 3, 4, 0xf7], [0xf0, 0x7e, 0, 6, 2, 0x42, 1, 0, 2, 0, 1, 2, 3, 0xf7]]) assert.equal(parseIdentityReply(bad), null);
});

test('GM steps follow General MIDI Level 1 facts', () => {
  assert.deepEqual([...GM_SYSTEM_ON], [0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7]);
  assert.deepEqual(masterVolume(0x3fff), [0xf0, 0x7f, 0x7f, 0x04, 0x01, 0x7f, 0x7f, 0xf7]);
  assert.deepEqual(pitchBend(1, 8192), [0xe0, 0x00, 0x40]);
  const steps = gmSteps();
  assert.equal(steps.length, 10);
  assert.equal(new Set(steps.map(s => s.id)).size, 10);
  const all = steps.flatMap(s => s.messages);
  assert.ok(all.every(x => validateMessage(x.bytes).ok && x.delayMs >= 0), 'every message is valid MIDI');
  const byId = Object.fromEntries(steps.map(s => [s.id, s.messages.map(x => x.bytes)]));
  assert.deepEqual(byId['system-on'][0], [...GM_SYSTEM_ON]);
  const drums = byId.drums.filter(b => b[0] === 0x99 && b[2] > 0).map(b => b[1]);
  assert.ok(drums.length === 6 && drums.every(n => n >= GM_FACTS.drumKeyRange[0] && n <= GM_FACTS.drumKeyRange[1]));
  const poly = byId.polyphony.filter(b => (b[0] & 0xf0) === 0x90);
  assert.equal(poly.length, GM_FACTS.minVoices);
  assert.equal(new Set(poly.map(b => `${b[0]}:${b[1]}`)).size, 24, 'distinct voices');
  assert.equal(poly.filter(b => b[0] === 0x99).length, 8);
  assert.ok(poly.every(b => b[1] >= 35 && b[1] <= 81 || b[0] === 0x90));
  assert.equal(byId.polyphony.filter(b => (b[0] & 0xf0) === 0x80).length, 24);
  const ccs = new Set(all.filter(x => (x.bytes[0] & 0xf0) === 0xb0).map(x => x.bytes[1]));
  for (const c of [7, 10, 64, 121, 123]) assert.ok(ccs.has(c), `CC${c}`);
  assert.ok(byId.sustain.some(b => b[0] === 0xb0 && b[1] === 64 && b[2] === 127) && byId.sustain.some(b => b[0] === 0xb0 && b[1] === 64 && b[2] === 0));
  assert.deepEqual(byId.programs.filter(b => b[0] === 0xc0).map(b => b[1]), [0, 24, 40, 56, 73, 80]);
  assert.ok(byId.bend.some(b => b[0] === 0xe0 && b[1] === 0x7f && b[2] === 0x7f));
  assert.ok(byId['all-notes-off'].some(b => b[0] === 0xb0 && b[1] === 123));
  // waits were folded into the previous message
  assert.ok(steps.find(s => s.id === 'polyphony').messages.some(x => x.delayMs >= 1800));
  assert.equal(gmCleanup().length, 17);
  assert.ok(gmCleanup().every(b => validateMessage(b).ok));
  assert.equal(noteOff(10, 36)[0], 0x89);
});

test('evaluateGm', () => {
  const steps = gmSteps();
  const yes = Object.fromEntries(steps.map(s => [s.id, 'yes']));
  assert.equal(evaluateGm({}).status, null);
  const ok = evaluateGm(yes);
  assert.equal(ok.status, 'pass'); assert.equal(ok.measurements[0].value, 100);
  const some = evaluateGm({ ...yes, drums: 'no', pan: 'na' });
  assert.equal(some.status, 'fail'); assert.equal(some.findings.length, 1); assert.equal(some.findings[0].id, 'gm-drums');
  assert.equal(some.measurements[0].value, round1(800 / 9));
  assert.equal(evaluateGm(Object.fromEntries(steps.map(s => [s.id, 'na']))).status, 'skipped');
});
function round1(v) { return Math.round(v * 10) / 10; }


test('raw MIDI validation rejects non-byte values without coercing them into evidence', () => {
  const badData = [-1, 0.5, 127.5, 128, 255, 256, NaN, Infinity, -Infinity, '60', null, undefined, true, 60n, Symbol('byte'), Object.create(null)];
  for (let i = 0; i < badData.length; i++) {
    for (const position of [1, 2]) {
      const bytes = [0x90, 60, 100];
      bytes[position] = badData[i];
      assert.equal(validateMessage(bytes).ok, false, 'invalid data case ' + i + ' at ' + position);
      const analysis = analyzeStream([ev(0, bytes)]);
      assert.equal(analysis.total, 1);
      assert.equal(analysis.invalid.length, 1);
      assert.deepEqual(analysis.channels, []);
      assert.deepEqual(analysis.stuck, []);
    }
    assert.equal(validateMessage([0xf0, 0x42, badData[i], 0xf7]).ok, false, 'invalid SysEx data case ' + i);
  }
  const badStatus = [-1, 0x100, 0x190, 0x90 + 0.5, NaN, Infinity, -Infinity, '144', null, undefined, true, 144n, Symbol('status'), Object.create(null)];
  for (let i = 0; i < badStatus.length; i++) {
    const bytes = [badStatus[i], 60, 100];
    assert.equal(validateMessage(bytes).ok, false, 'invalid status case ' + i);
    const analysis = analyzeStream([ev(0, bytes)]);
    assert.equal(analysis.invalid.length, 1);
    assert.deepEqual(analysis.channels, []);
    assert.deepEqual(analysis.stuck, []);
  }
  assert.equal(validateMessage([0x90, , 100]).ok, false, 'a missing byte is not zero');
  assert.equal(validateMessage(new Float64Array([0x90, 60.5, 100])).ok, false);
  assert.equal(validateMessage(new Uint8Array([0x90, 60, 100])).ok, true);
  assert.equal(validateMessage(Object.freeze([0xb0, 7, 127])).ok, true);
  const malformedSysex = analyzeStream([ev(0, [0xf0, 0x42, -1, 0xf7])]);
  assert.equal(malformedSysex.sysexBad.length, 1, 'retain the malformed SysEx evidence category');
  assert.equal(malformedSysex.invalid.length, 0);
});

test('identity replies require real data bytes before decoding fields', () => {
  const replies = [
    [0xf0, 0x7e, 0x00, 0x06, 0x02, 0x42, 0x01, 0x00, 0x02, 0x00, 1, 2, 3, 4, 0xf7],
    [0xf0, 0x7e, 0x7f, 0x06, 0x02, 0x00, 0x20, 0x29, 0x03, 0x01, 0x00, 0x02, 5, 6, 7, 8, 0xf7],
  ];
  const invalid = [-1, 0.5, 128, 256, NaN, Infinity, -Infinity, '1', null, undefined, true, 1n, Symbol('byte'), Object.create(null)];
  for (const original of replies) {
    assert.deepEqual(parseIdentityReply(new Uint8Array(original)), parseIdentityReply(original));
    for (let position = 1; position < original.length - 1; position++) {
      for (let i = 0; i < invalid.length; i++) {
        const bytes = original.slice();
        bytes[position] = invalid[i];
        assert.equal(parseIdentityReply(bytes), null, 'identity byte ' + position + ', invalid case ' + i);
      }
    }
  }
});

test('large Active Sensing streams retain every gap and the trailing session gap', () => {
  const count = 200000;
  // One early 400 ms gap among 250 ms gaps; it must not disappear in a bounded tail.
  const events = Array.from({ length: count }, (_, i) => ev(i * 250000 + (i >= 17 ? 150000 : 0), [0xfe]));
  for (const [endUs, expected] of [[null, 400], [events.at(-1).tUs + 625000, 625]]) {
    const analysis = analyzeStream(events, { endUs });
    assert.equal(analysis.total, count);
    assert.equal(analysis.sensing.count, count);
    assert.equal(analysis.sensing.maxGapMs, expected);
    assert.equal(mv(analysis, 'midi_active_sensing_gap_ms'), expected);
    assert.equal(analysis.invalid.length, 0);
    assert.ok(conformanceFindings(analysis).some(f => f.id === 'midi-sensing'));
  }
  for (const [gapMs, warned] of [[330, false], [331, true]]) {
    const analysis = analyzeStream([ev(0, [0xfe]), ev(gapMs * 1000, [0xfe])]);
    assert.equal(conformanceFindings(analysis).some(f => f.id === 'midi-sensing'), warned);
  }
});

function scheduledMessages(step) {
  let timeMs = 0;
  const events = step.messages.map(({ bytes, delayMs }) => {
    const event = { timeMs, bytes };
    timeMs += delayMs;
    return event;
  });
  return { events, totalMs: timeMs };
}

test('all ten GM schedules hold notes for the intended time before release', () => {
  const expected = {
    'system-on': { held: [900], total: 1050 },
    programs: { held: Array(6).fill(600), total: 3600 },
    drums: { held: Array(6).fill(450), total: 2700 },
    volume: { held: [1750], total: 1950 },
    pan: { held: [1800], total: 1800 },
    bend: { held: [2250], total: 2250 },
    sustain: { held: Array(3).fill(500), total: 2000 },
    polyphony: { held: Array(24).fill(1800), total: 1800 },
    'all-notes-off': { held: Array(6).fill(1200), total: 1800 },
    'master-volume': { held: [700, 700], total: 1500 },
  };
  for (const step of gmSteps()) {
    const schedule = scheduledMessages(step);
    const active = new Map(), held = [];
    const release = (key, timeMs) => {
      assert.ok(active.has(key), step.id + ': release must follow note-on');
      held.push(timeMs - active.get(key));
      active.delete(key);
    };
    for (const { bytes, timeMs } of schedule.events) {
      const type = bytes[0] & 0xf0, channel = bytes[0] & 0x0f;
      const key = channel + ':' + bytes[1];
      if (type === 0x90 && bytes[2] > 0) {
        assert.equal(active.has(key), false, step.id + ': note must be released before retrigger');
        active.set(key, timeMs);
      } else if (type === 0x80 || (type === 0x90 && bytes[2] === 0)) {
        release(key, timeMs);
      } else if (type === 0xb0 && bytes[1] === 123) {
        for (const sounding of [...active.keys()]) {
          if (sounding.startsWith(channel + ':')) release(sounding, timeMs);
        }
      }
    }
    assert.equal(active.size, 0, step.id + ': every note is released');
    assert.deepEqual(held, expected[step.id].held, step.id + ': audible hold times');
    assert.equal(schedule.totalMs, expected[step.id].total, step.id + ': total duration is unchanged');
  }
});

test('GM pan, sustain and master-volume transitions happen while the intended sound is audible', () => {
  const schedules = Object.fromEntries(gmSteps().map(step => [step.id, scheduledMessages(step).events]));
  assert.deepEqual(schedules.pan.filter(e => e.bytes[0] === 0xb0 && e.bytes[1] === 10).map(e => [e.timeMs, e.bytes[2]]),
    [[0, 0], [600, 64], [1200, 127], [1800, 64]], 'each pan position lasts 600 ms before reset');
  assert.deepEqual(schedules.sustain.filter(e => e.bytes[0] === 0x80).map(e => e.timeMs),
    [500, 500, 500], 'keys release after 500 ms');
  assert.deepEqual(schedules.sustain.filter(e => e.bytes[0] === 0xb0 && e.bytes[1] === 64).map(e => [e.timeMs, e.bytes[2]]),
    [[0, 127], [2000, 0]], 'pedal holds the released chord for another 1500 ms');
  assert.deepEqual(schedules['master-volume'].filter(e => e.bytes[0] === 0x90).map(e => e.timeMs),
    [0, 800], 'the second note starts after the volume change settles');
  assert.deepEqual(schedules['master-volume'].filter(e => e.bytes[0] === 0xf0).map(e => [e.timeMs, e.bytes]),
    [[700, masterVolume(0x2000)], [1500, masterVolume(0x3fff)]], 'restore volume only after both notes finish');
});

test('GM results remain unanswered when any answer is outside yes, no or na', () => {
  const steps = gmSteps();
  const yes = Object.fromEntries(steps.map(s => [s.id, 'yes']));
  const invalid = ['maybe', 'YES', 'No', 'N/A', ' yes ', true, false, 0, 1, {}, [], null, undefined, NaN, Symbol('answer'), new String('yes')];
  for (let i = 0; i < invalid.length; i++) {
    for (const answers of [
      { ...yes, drums: invalid[i] },
      { ...yes, drums: invalid[i], pan: 'no', volume: 'na' },
    ]) {
      const result = evaluateGm(answers, steps);
      assert.deepEqual(result, { status: null, detail: '1 step(s) still unanswered.', measurements: [], findings: [] }, 'invalid answer case ' + i);
    }
  }
  const allInvalid = Object.fromEntries(steps.map(s => [s.id, 'maybe']));
  assert.deepEqual(evaluateGm(allInvalid, steps), { status: null, detail: '10 step(s) still unanswered.', measurements: [], findings: [] });
});

test('GM answer summaries retain manual provenance for passing and failing results', () => {
  const steps = gmSteps();
  const yes = Object.fromEntries(steps.map(s => [s.id, 'yes']));
  for (const [answers, status, percent, na] of [
    [yes, 'pass', 100, 0],
    [{ ...yes, drums: 'no', pan: 'na' }, 'fail', round1(800 / 9), 1],
  ]) {
    const result = evaluateGm(answers, steps);
    assert.equal(result.status, status);
    assert.equal(mv(result, 'midi_gm_ok_percent'), percent);
    assert.equal(mv(result, 'midi_gm_steps_na'), na);
    assert.equal(result.measurements.length, 2);
    for (const measurement of result.measurements) {
      assert.equal(measurement.origin, 'manual');
      assert.equal(measurement.confidence, 1, 'existing confidence is unchanged');
    }
  }
  const stream = analyzeStream([ev(0, noteOn(1, 60)), ev(1000, noteOff(1, 60))], { endUs: 2000 });
  assert.ok(stream.measurements.every(measurement => measurement.origin === 'measured'), 'stream-derived evidence keeps its measured origin');
});

