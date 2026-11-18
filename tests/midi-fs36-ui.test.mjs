// SPEC-36 UI: the MIDI conformance and General MIDI panels in app/ui/devices/midi-runner.js,
// driven through the real runner with an injected bridge. Focus: evidence rules and connection
// ownership (late sends, probe timers and cleanup must stay with the connection that made them).
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, bridge, mount, settle, turn, deferred } from './fixtures/midi-runner-dom.mjs';
import { IDENTITY_TIMEOUT_MS, CONFORMANCE_MAX_EVENTS } from '../app/ui/devices/midi-runner.js';
import { IDENTITY_REQUEST, gmSteps, gmAbortCleanup } from '../app/midi-conformance.js';
import { dispatchFor, methodLabel } from '../app/devices/dispatch.js';
import { validateProfile, MIDI_KINDS, AUDIO_KINDS } from '../app/devices/library.js';

installDom();

const REPLY = [0xf0, 0x7e, 0x00, 0x06, 0x02, 0x47, 0x12, 0x00, 0x34, 0x00, 1, 2, 3, 4, 0xf7];
const metric = (result, id) => result.measurements.find(m => m.metricId === id);
const finding = (result, id) => result.findings.find(f => f.id === id);
const answerButtons = (host, value) => host.findAll(el => el.attributes?.['data-answer'] === value);
const noteOns = sends => sends.filter(s => (s.bytes[0] & 0xf0) === 0x90 && s.bytes[2] > 0);

test('dispatch and validation know the SPEC-36 MIDI kinds and the SPEC-35 audio kind', () => {
  assert.ok(MIDI_KINDS.includes('conformance') && MIDI_KINDS.includes('gm'));
  assert.deepEqual(AUDIO_KINDS, ['quality']);
  assert.deepEqual(dispatchFor({ method: 'midi:conformance' }), { runner: 'midi', kind: 'conformance' });
  assert.deepEqual(dispatchFor({ method: 'audio:quality' }), { runner: 'audio', kind: 'quality' });
  assert.equal(dispatchFor({ method: 'audio:loudness' }).runner, 'unsupported');
  assert.equal(methodLabel({ method: 'midi:gm' }), 'MIDI · General MIDI');
  assert.equal(methodLabel({ method: 'audio:quality' }), 'Audio quality');
  const profile = { schemaVersion: 1, id: 'acme-x', manufacturer: 'Acme', model: 'X', summary: 's', category: 'controller', specs: [], documents: [], tests: [{ id: 't', title: 'T', method: 'audio:loudness', category: 'audio', steps: ['a'] }] };
  assert.ok(validateProfile(profile).errors.some(e => e.includes('unknown audio test "loudness"')));
  assert.equal(validateProfile({ ...profile, tests: [{ ...profile.tests[0], method: 'audio:quality' }] }).ok, true);
});

test('conformance: a clean exercised stream with an identity reply passes and keeps raw realtime bytes', async t => {
  const m = mount({ kind: 'conformance' }); t.after(() => m.runner.dispose()); await settle();
  assert.deepEqual(m.midi.sends, [{ port: 'A', bytes: [...IDENTITY_REQUEST] }], 'identity request goes to the captured output');
  m.midi.emit(REPLY, 1000);
  [[0xfe], [0x90, 60, 100], [0xfe], [0x80, 60, 0], [0xb0, 7, 64], [0xfe]].forEach((bytes, i) => m.midi.emit(bytes, 2000 + i * 100000));
  await m.click('midi-finish'); await settle();
  const r = m.finished[0];
  assert.equal(r?.status, 'pass', r?.detail);
  assert.equal(metric(r, 'midi_identity_reply').value, 1);
  assert.equal(r.extra.identityStatus, 'ok');
  assert.equal(r.extra.sensing.count, 3, 'Active Sensing bytes reach the analyzer');
  assert.ok(r.extra.burst.maxMessages >= 1 && r.extra.burst.windowMs === 100);
  assert.equal(r.extra.droppedDuringCapture, 0);
  assert.equal(r.extra.port, 'A');
});

test('conformance: malformed bytes and stuck notes fail; orphans and control-free streams need review', async t => {
  for (const [name, events, expected] of [
    ['data byte with high bit', [[0x90, 0x80, 1]], 'fail'],
    ['note never released', [[0x90, 61, 100]], 'fail'],
    ['orphan note-off only', [[0x80, 62, 0], [0xb0, 1, 3]], 'unknown'],
    ['identity reply and sensing but no controls', [REPLY, [0xfe]], 'unknown'],
  ]) {
    const m = mount({ kind: 'conformance' }); await settle();
    events.forEach((bytes, i) => m.midi.emit(bytes, 1000 + i * 1000));
    await m.click('midi-finish'); await settle();
    assert.equal(m.finished[0]?.status, expected, name);
    m.runner.dispose();
  }
  const silent = mount({ kind: 'conformance' }); t.after(() => silent.runner.dispose()); await settle();
  await silent.click('midi-finish'); await settle();
  assert.equal(silent.finished[0].status, 'unknown');
  assert.ok(finding(silent.finished[0], 'midi-silent'));
});

test('conformance: no reply inside the window is recorded as 0; finishing early records no identity value', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const waited = mount({ kind: 'conformance' }); await settle();
  t.mock.timers.tick(IDENTITY_TIMEOUT_MS);
  waited.midi.emit(REPLY, 5000); // too late: the window has closed
  waited.midi.emit([0xb0, 1, 2], 6000);
  await waited.click('midi-finish'); await settle();
  assert.equal(waited.finished[0].extra.identityStatus, 'none');
  assert.equal(metric(waited.finished[0], 'midi_identity_reply').value, 0);
  assert.ok(finding(waited.finished[0], 'midi-identity'), 'no answer stays informational');
  waited.runner.dispose();

  const early = mount({ kind: 'conformance' }); t.after(() => early.runner.dispose()); await settle();
  early.midi.emit([0xb0, 1, 2], 6000);
  await early.click('midi-finish'); await settle();
  assert.equal(metric(early.finished[0], 'midi_identity_reply'), undefined, 'an unanswered-yet request is not a "no"');
  assert.ok(finding(early.finished[0], 'midi-identity-unfinished'));
  t.mock.timers.tick(IDENTITY_TIMEOUT_MS * 2); await settle();
  assert.equal(early.finished.length, 1, 'the cancelled probe timer cannot record anything afterwards');
});

test('conformance: no output port or a failed send never fabricates an identity result', async t => {
  const noOut = mount({ kind: 'conformance', midi: bridge({ listPorts: async () => ({ inputs: [{ name: 'A' }], outputs: [] }) }) }); await settle();
  assert.deepEqual(noOut.midi.sends, []);
  noOut.midi.emit([0xb0, 1, 2]);
  await noOut.click('midi-finish'); await settle();
  assert.equal(noOut.finished[0].extra.identityStatus, 'no-port');
  assert.equal(metric(noOut.finished[0], 'midi_identity_reply'), undefined);
  noOut.runner.dispose();

  const failing = mount({ kind: 'conformance', midi: bridge({ send: async () => { throw new Error('port busy'); } }) }); t.after(() => failing.runner.dispose()); await settle();
  failing.midi.emit([0xb0, 1, 2]);
  await failing.click('midi-finish'); await settle();
  assert.equal(failing.finished[0].extra.identityStatus, 'send-failed');
  assert.equal(metric(failing.finished[0], 'midi_identity_reply'), undefined);
  assert.ok(finding(failing.finished[0], 'midi-identity-unsent'));
});

test('conformance: host-side drops and unavailable counters both require review', async t => {
  const dropping = mount({ kind: 'conformance', midi: bridge({ status: async call => ({ dropped: call === 1 ? 5 : 9, openInputs: ['A'] }) }) }); await settle();
  dropping.midi.emit(REPLY); dropping.midi.emit([0xb0, 1, 2]);
  await dropping.click('midi-finish'); await settle();
  assert.equal(dropping.finished[0].status, 'unknown');
  assert.equal(dropping.finished[0].extra.droppedDuringCapture, 4, 'only drops inside the capture window count');
  assert.ok(finding(dropping.finished[0], 'midi-transport-drops'));
  dropping.runner.dispose();

  const unknownCounter = mount({ kind: 'conformance', midi: bridge({ status: async () => { throw new Error('no status'); } }) }); t.after(() => unknownCounter.runner.dispose()); await settle();
  unknownCounter.midi.emit(REPLY); unknownCounter.midi.emit([0xb0, 1, 2]);
  await unknownCounter.click('midi-finish'); await settle();
  assert.equal(unknownCounter.finished[0].status, 'unknown');
  assert.equal(unknownCounter.finished[0].extra.droppedDuringCapture, null);
  assert.equal(unknownCounter.finished[0].extra.captureIntegrity.counterState, 'unavailable');
  assert.ok(finding(unknownCounter.finished[0], 'midi-capture-unverified'));
});

test('conformance: reset or invalid counters never establish a clean capture', async () => {
  for (const [before, after, expected] of [[5, 2, 'reset'], [0, -1, 'unavailable'], [0, 0.5, 'unavailable'], [NaN, 0, 'unavailable'], [0, Infinity, 'unavailable'], [0, Number.MAX_SAFE_INTEGER + 1, 'unavailable']]) {
    const m = mount({ kind: 'conformance', midi: bridge({ status: async call => ({ dropped: call === 1 ? before : after, openInputs: ['A'] }) }) }); await settle();
    m.midi.emit([0xb0, 1, 2]);
    await m.click('midi-finish'); await settle();
    const r = m.finished[0];
    assert.equal(r.status, 'unknown', `${before} -> ${after}`);
    assert.equal(r.extra.droppedDuringCapture, null);
    assert.equal(r.extra.captureIntegrity.counterState, expected);
    assert.equal(metric(r, 'midi_message_count').value, 1, 'observed evidence remains available');
    m.runner.dispose();
  }
});

test('conformance: a disconnected or unobservable selected input cannot pass', async () => {
  for (const [openInputs, expected] of [[[], false], [['B'], false], [undefined, null]]) {
    const m = mount({ kind: 'conformance', midi: bridge({ status: async call => ({ dropped: 0, openInputs: call === 1 ? ['A'] : openInputs }) }) }); await settle();
    m.midi.emit([0xb0, 1, 2]);
    await m.click('midi-finish'); await settle();
    const r = m.finished[0];
    assert.equal(r.status, 'unknown');
    assert.equal(r.extra.droppedDuringCapture, 0, 'a zero counter is distinct from input continuity');
    assert.equal(r.extra.captureIntegrity.inputOpenAtEnd, expected);
    assert.ok(finding(r, expected === false ? 'midi-input-disconnected' : 'midi-capture-unverified'));
    m.runner.dispose();
  }
});

test('conformance: browser MIDI cannot claim a measured zero-loss counter', async t => {
  const midi = bridge(); midi.backend = () => 'webmidi';
  const m = mount({ kind: 'conformance', midi }); t.after(() => m.runner.dispose()); await settle();
  m.midi.emit([0xb0, 1, 2]);
  await m.click('midi-finish'); await settle();
  assert.equal(m.finished[0].status, 'unknown');
  assert.equal(m.finished[0].extra.droppedDuringCapture, null);
});

test('MIDI routing: changing the input pairs its matching output, even against the profile hint', async t => {
  const m = mount({ kind: 'conformance', profile: { model: 'A', midi: { controls: [] }, connectivity: { midi: { portNamePatterns: ['A'] } } } }); t.after(() => m.runner.dispose()); await settle();
  await m.select('B'); await settle();
  assert.deepEqual(m.midi.sends.map(s => s.port), ['A', 'B']);
  assert.equal(m.byId('midi-output').value, 'B');
});

test('MIDI routing: ambiguous outputs require explicit selection before sending', async t => {
  const midi = bridge({ listPorts: async () => ({ inputs: [{ name: 'Input 1' }, { name: 'Input 2' }], outputs: [{ name: 'Output 1' }, { name: 'Output 2' }] }) });
  const m = mount({ kind: 'conformance', midi }); t.after(() => m.runner.dispose()); await settle();
  assert.deepEqual(midi.sends, [], 'an arbitrary first output must not receive SysEx');
  assert.equal(m.byId('midi-output').value, '');
  const output = m.byId('midi-output'); output.value = 'Output 2'; await output.fire('change'); await settle();
  assert.deepEqual(midi.sends.map(s => s.port), ['Output 2']);
  await m.select('Input 2'); await settle();
  assert.equal(m.byId('midi-output').value, '', 'changing inputs clears an unverified manual pairing');
  assert.equal(midi.sends.length, 1);
});

test('MIDI routing: duplicate names cannot silently select the first device', async () => {
  const duplicateInput = mount({ kind: 'conformance', midi: bridge({ listPorts: async () => ({ inputs: [{ name: 'A' }, { name: 'A' }], outputs: [{ name: 'A' }] }) }) }); await settle();
  assert.deepEqual(duplicateInput.midi.opens, []);
  assert.deepEqual(duplicateInput.midi.sends, []);
  duplicateInput.runner.dispose();

  const duplicateOutput = mount({ kind: 'conformance', midi: bridge({ listPorts: async () => ({ inputs: [{ name: 'A' }], outputs: [{ name: 'A' }, { name: 'A' }] }) }) }); await settle();
  assert.deepEqual(duplicateOutput.midi.sends, []);
  const output = duplicateOutput.byId('midi-output'); output.value = 'A'; await output.fire('change'); await settle();
  assert.deepEqual(duplicateOutput.midi.sends, [], 'the operation boundary rejects an ambiguous choice even if a change event supplies it');
  duplicateOutput.runner.dispose();
});

test('MIDI routing: the sole input/output pair and a unique profile pair remain usable', async () => {
  for (const [ports, profile, expected] of [
    [{ inputs: [{ name: 'Input' }], outputs: [{ name: 'Output' }] }, { model: 'Unit', midi: { controls: [] } }, 'Output'],
    [{ inputs: [{ name: 'Unit In' }, { name: 'Other' }], outputs: [{ name: 'Unit Out' }, { name: 'Other' }] }, { model: 'Unit', midi: { controls: [] }, connectivity: { midi: { portNamePatterns: ['Unit'] } } }, 'Unit Out'],
  ]) {
    const m = mount({ kind: 'conformance', midi: bridge({ listPorts: async () => ports }), profile }); await settle();
    assert.deepEqual(m.midi.sends.map(s => s.port), [expected]);
    m.runner.dispose();
  }
});

test('conformance: an old probe or a Finish awaiting the drop counter cannot affect a replacement port', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const oldSend = deferred();
  const m = mount({ kind: 'conformance', midi: bridge({ send: (_, __, n) => (n === 1 ? oldSend.promise : Promise.resolve()) }) }); t.after(() => m.runner.dispose()); await settle();
  await m.select('B'); await settle();
  oldSend.resolve(); await settle();
  t.mock.timers.tick(IDENTITY_TIMEOUT_MS);
  m.midi.emit([0xb0, 1, 2], 1000, 'B');
  m.midi.emit([0xb0, 1, 3], 2000, 'A');
  await m.click('midi-finish'); await settle();
  const r = m.finished[0];
  assert.equal(m.finished.length, 1);
  assert.equal(r.extra.port, 'B');
  assert.equal(r.extra.identityStatus, 'none', 'B ran its own probe window');
  assert.equal(metric(r, 'midi_message_count').value, 1, 'traffic from the old port is ignored');

  const held = deferred();
  const slow = mount({ kind: 'conformance', midi: bridge({ status: call => (call === 2 ? held.promise : Promise.resolve({ dropped: 0 })) }) }); await settle();
  slow.midi.emit([0xb0, 1, 2]);
  const finishing = slow.click('midi-finish'); await turn();
  slow.runner.dispose();
  held.resolve({ dropped: 0 }); await finishing; await settle();
  assert.deepEqual(slow.finished, [], 'a disposed runner cannot save after the counter resolves');
});

test('conformance: the capture is bounded and a full capture is not judged', async t => {
  const m = mount({ kind: 'conformance' }); t.after(() => m.runner.dispose()); await settle();
  for (let i = 0; i <= CONFORMANCE_MAX_EVENTS; i++) m.midi.emit([0xb0, 1, i & 0x7f], i);
  await m.click('midi-finish'); await settle();
  assert.equal(m.finished[0].status, 'unknown');
  assert.equal(m.finished[0].extra.truncated, true);
  assert.equal(metric(m.finished[0], 'midi_message_count').value, CONFORMANCE_MAX_EVENTS);
  assert.ok(finding(m.finished[0], 'midi-capture-full'));
});

test('GM: without an output port the panel offers a skip and sends nothing', async t => {
  const m = mount({ kind: 'gm', midi: bridge({ listPorts: async () => ({ inputs: [{ name: 'A' }], outputs: [] }) }) }); t.after(() => m.runner.dispose()); await settle();
  await m.click('gm-skip');
  assert.equal(m.skipped.length, 1);
  assert.deepEqual(m.midi.sends, []);
});

test('GM: answers decide pass, fail and skipped; Save stays disabled until every step is answered', async t => {
  for (const [answers, expected] of [[() => 'yes', 'pass'], [i => (i === 3 ? 'no' : 'yes'), 'fail'], [() => 'na', 'skipped']]) {
    const m = mount({ kind: 'gm' }); await settle();
    const steps = gmSteps();
    steps.forEach((_, i) => { if (i < steps.length - 1) answerButtons(m.host, answers(i))[i]?.fire('click'); });
    assert.equal(m.byId('midi-finish').disabled, true);
    await answerButtons(m.host, answers(steps.length - 1))[steps.length - 1].fire('click');
    await m.click('midi-finish'); await settle();
    assert.equal(m.finished[0]?.status, expected);
    assert.equal(m.finished[0].extra.port, 'A');
    m.runner.dispose();
  }
});

test('GM: stopping a step queues the abort cleanup behind the in-flight note and plays nothing after it', async t => {
  const inFlight = deferred();
  const m = mount({ kind: 'gm', midi: bridge({ send: (_, __, n) => (n === 1 ? inFlight.promise : Promise.resolve()) }) }); t.after(() => m.runner.dispose()); await settle();
  const playing = m.click('gm-play-programs'); await turn();
  const stopping = m.click('gm-play-programs'); await turn();
  assert.equal(m.midi.sends.length, 1, 'no cleanup send starts while the note send is still in flight');
  inFlight.resolve(); await playing; await stopping; await settle();
  const cleanup = gmAbortCleanup();
  assert.equal(m.midi.sends.length, 1 + cleanup.length, 'the step stops after its in-flight message');
  assert.deepEqual(m.midi.sends.slice(1).map(s => s.bytes), cleanup, 'panic then controller defaults, in order');
  assert.ok(m.midi.sends.every(s => s.port === 'A'));
  assert.equal(noteOns(m.midi.sends.slice(1)).length, 0);
});

test('GM: a pending step switch cannot replace a newer Play action after cleanup resolves', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const inFlight = deferred();
  const m = mount({ kind: 'gm', midi: bridge({ send: (_, __, n) => n === 1 ? inFlight.promise : Promise.resolve() }) });
  t.after(() => m.runner.dispose()); await settle();
  await m.click('gm-play-programs'); await settle();
  await m.click('gm-play-drums'); await settle(); // waits for the original send and its cleanup
  await m.click('gm-play-pan'); await settle(); // newer intent while cleanup is still pending
  inFlight.resolve(); await settle();
  assert.equal(m.midi.sends.some(s => s.bytes[0] === 0x99), false, 'the superseded drum switch never starts');
  assert.equal(m.byId('gm-play-pan').getAttribute('aria-pressed'), 'true', 'the newest step owns playback');
  assert.equal(m.byId('gm-play-drums').getAttribute('aria-pressed'), 'false');
});

test('GM: Silence cancels a pending step switch even when no step is currently marked playing', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const inFlight = deferred();
  const m = mount({ kind: 'gm', midi: bridge({ send: (_, __, n) => n === 1 ? inFlight.promise : Promise.resolve() }) });
  t.after(() => m.runner.dispose()); await settle();
  await m.click('gm-play-programs'); await settle();
  await m.click('gm-play-drums'); await settle();
  await m.click('gm-silence'); await settle();
  inFlight.resolve(); await settle();
  t.mock.timers.tick(10000); await settle();
  assert.equal(noteOns(m.midi.sends).length, 0, 'a cancelled switch cannot restart notes after Silence');
  assert.equal(m.byId('gm-play-drums').getAttribute('aria-pressed'), 'false');
});

test('GM: Save cancels a pending step switch before it can restart playback', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const inFlight = deferred();
  const m = mount({ kind: 'gm', midi: bridge({ send: (_, __, n) => n === 1 ? inFlight.promise : Promise.resolve() }) });
  t.after(() => m.runner.dispose()); await settle();
  gmSteps().forEach((_, i) => answerButtons(m.host, 'yes')[i].fire('click'));
  await m.click('gm-play-programs'); await settle();
  await m.click('gm-play-drums'); await settle();
  await m.click('midi-finish'); await settle();
  inFlight.resolve(); await settle();
  t.mock.timers.tick(10000); await settle();
  assert.equal(m.finished.length, 1);
  assert.equal(noteOns(m.midi.sends).length, 0, 'saving cannot be followed by the stale switch starting notes');
});

test('GM: disposal or a port switch mid-step silences only the captured output and saves nothing', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const m = mount({ kind: 'gm' }); await settle();
  m.click('gm-play-system-on'); await settle();
  const before = m.midi.sends.length;
  m.runner.dispose(); await settle();
  t.mock.timers.tick(10000); await settle();
  const after = m.midi.sends.slice(before);
  assert.deepEqual(after.map(s => s.bytes), gmAbortCleanup(), 'only cleanup follows disposal, even after the step delays elapse');
  assert.ok(after.every(s => s.port === 'A'));
  assert.deepEqual(m.finished, []);

  const s = mount({ kind: 'gm' }); t.after(() => s.runner.dispose()); await settle();
  s.click('gm-play-system-on'); await settle();
  await s.select('B'); await settle();
  t.mock.timers.tick(10000); await settle();
  const toB = s.midi.sends.filter(x => x.port === 'B');
  assert.deepEqual(toB, [], 'the replacement port receives nothing from the old panel');
  assert.deepEqual(s.midi.sends.filter(x => x.port === 'A').slice(-gmAbortCleanup().length).map(x => x.bytes), gmAbortCleanup(), 'the old output is silenced');
});

test('GM: a failed send aborts the step with cleanup; saving while a step plays silences it first', async t => {
  let failNext = true;
  const m = mount({ kind: 'gm', midi: bridge({ send: async () => { if (failNext) { failNext = false; throw new Error('unplugged'); } } }) }); t.after(() => m.runner.dispose()); await settle();
  await m.click('gm-play-drums'); await settle();
  assert.equal(m.midi.sends.length, 1 + gmAbortCleanup().length);
  assert.equal(noteOns(m.midi.sends).length, 1, 'the failed note-on was the only note attempted');
  assert.deepEqual(m.midi.sends.slice(1).map(s => s.bytes), gmAbortCleanup(), 'nothing but cleanup follows the failure');

  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = mount({ kind: 'gm' }); t.after(() => p.runner.dispose()); await settle();
  gmSteps().forEach((_, i) => answerButtons(p.host, 'yes')[i].fire('click'));
  p.click('gm-play-pan'); await settle();
  const before = p.midi.sends.length;
  await p.click('midi-finish'); await settle();
  assert.equal(p.finished[0].status, 'pass');
  assert.deepEqual(p.midi.sends.slice(before).map(s => s.bytes), gmAbortCleanup());
});
