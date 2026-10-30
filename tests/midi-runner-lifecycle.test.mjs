import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runMidi } from '../app/ui/devices/midi-runner.js';

// The runner uses injected MIDI and the production DOM builders. This fixture models only the DOM
// operations those builders need; callbacks below are the actual runner's event handlers.
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.dataset = {}; this.className = ''; this.attributes = {}; }
  setAttribute(key, value) { this.attributes[key] = value; if (key === 'id') this.id = value; if (key === 'value') this.value = value; if (key === 'disabled') this.disabled = true; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html || ''; }
  set value(value) { this.selectedValue = value; }
  get value() { return this.selectedValue ?? this.children.find(c => c.tagName === 'OPTION' && Object.hasOwn(c.attributes, 'selected'))?.value ?? this.children.find(c => c.tagName === 'OPTION')?.value ?? ''; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  async fire(name) { for (const callback of this.listeners[name] || []) await callback({ target: this, currentTarget: this }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const match = el => selector.startsWith('#') ? el.id === selector.slice(1) : selector.startsWith('.') ? el.className.split(' ').includes(selector.slice(1)) : el.tagName === selector.toUpperCase();
    return this.children.flatMap(child => [...(match(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  get tBodies() { return this.children.filter(child => child.tagName === 'TBODY'); }
  get classList() { return { add() {}, remove() {}, toggle() {} }; }
  focus() {}
}
const previous = { document: globalThis.document, Node: globalThis.Node };
globalThis.Node = Element;
globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => Object.assign(new Element('#text'), { textContent: text }), getElementById: () => null };
after(() => Object.assign(globalThis, previous));

const turn = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { await turn(); await turn(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const shipped = JSON.parse(fs.readFileSync(new URL('../app/devices/profiles/pioneer-plx-crss12.json', import.meta.url), 'utf8'));
const control = (id, number, type = 'button') => ({ id, label: id, type, message: { kind: type === 'jog' || type === 'fader' ? 'cc' : 'note', channel: 1, number } });
const mapped = { model: 'Test', midi: { mapSource: 'published', controls: [control('play', 11), control('cue', 12), control('gain', 5, 'fader')] } };
function bridge({ open = async () => {}, close = async () => {}, send = async () => {}, listPorts = async () => ({ inputs: [{ name: 'A' }, { name: 'B' }], outputs: [] }) } = {}) {
  const listeners = new Set();
  const midi = {
    opens: [], closes: [], sends: [], subscriptions: 0, listeners,
    backend: () => 'tauri', isAvailable: () => true, listPorts,
    async open(port) { midi.opens.push(port); await open(port, midi.opens.length); },
    async close(port) { midi.closes.push(port); await close(port, midi.closes.length); },
    async send(port, bytes) { midi.sends.push({ port, bytes }); await send(port, bytes, midi.sends.length); },
    onMessage(callback) { midi.subscriptions++; listeners.add(callback); return () => listeners.delete(callback); },
    emit(bytes, timestampUs = 100000, port = 'A') { for (const listener of [...listeners]) listener({ bytes, timestampUs, port }); },
  };
  return midi;
}
function mount({ kind = 'button', profile = shipped, midi = bridge(), params, pass } = {}) {
  const original = profile.tests?.find(t => t.method === `midi:${kind}`);
  const test = { ...(original || { method: `midi:${kind}`, steps: [] }), ...(params ? { params } : {}), ...(pass ? { pass } : {}) };
  const host = new Element('div'), finished = [];
  const runner = runMidi(host, { test, profile, kind, midi, finish: result => finished.push(result) });
  return { host, runner, midi, finished, finish: async () => host.querySelector('#midi-finish').fire('click'), select: async port => { const select = host.querySelector('#midi-port'); select.value = port; return select.fire('change'); } };
}

for (const kind of ['button', 'jog']) test(`${kind}: Finish with zero MIDI messages records unknown, not fabricated zero-error PASS`, async t => {
  const m = mount({ kind }); t.after(() => m.runner.dispose()); await settle();
  await m.finish();
  assert.equal(m.finished[0]?.status, 'unknown');
  assert.deepEqual(m.finished[0].measurements, []);
});

test('mapped buttons: every requested control needs an observed press followed by release', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const [name, events, expected] of [
    ['one control untouched', [[0x90, 11, 127], [0x80, 11, 0]], 'unknown'],
    ['release-only traffic', [[0x80, 11, 0], [0x80, 12, 0]], 'unknown'],
    ['a press without release', [[0x90, 11, 127], [0x80, 11, 0], [0x90, 12, 127]], 'unknown'],
    ['unrelated fader traffic', [[0xb0, 5, 127], [0xb0, 5, 0]], 'unknown'],
    ['both controls exercised', [[0x90, 11, 127], [0x80, 11, 0], [0x90, 12, 127], [0x80, 12, 0]], 'pass'],
  ]) {
    const m = mount({ profile: mapped, params: { controlIds: ['play', 'cue'] }, pass: { metricId: 'midi_button_stuck', op: 'equals', value: 0 } });
    await settle();
    events.forEach((bytes, i) => m.midi.emit(bytes, i * 100000)); t.mock.timers.tick(1000);
    await m.finish();
    assert.equal(m.finished[0]?.status, expected, name);
    m.runner.dispose();
  }
});

test('mapped buttons: a missing requested map entry cannot be replaced by arbitrary input', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const m = mount({ profile: mapped, params: { controlIds: ['unmapped'] }, pass: { metricId: 'midi_button_stuck', op: 'equals', value: 0 } });
  t.after(() => m.runner.dispose()); await settle();
  m.midi.emit([0x90, 99, 127], 0); m.midi.emit([0x80, 99, 0], 100000); t.mock.timers.tick(1000);
  await m.finish();
  assert.equal(m.finished[0]?.status, 'unknown');
});

test('learn-mode button evidence remains incomplete while an observed button is still held', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const m = mount(); t.after(() => m.runner.dispose()); await settle();
  m.midi.emit([0x90, 11, 127], 0); m.midi.emit([0x80, 11, 0], 100000); m.midi.emit([0x90, 12, 127], 200000);
  t.mock.timers.tick(1000); await m.finish();
  assert.equal(m.finished[0]?.status, 'unknown');
});

test('jog: neutral traffic is incomplete, while observed motion retains existing thresholds', async t => {
  for (const [value, expected] of [[0, 'unknown'], [1, 'pass']]) {
    const m = mount({ kind: 'jog' }); t.after(() => m.runner.dispose()); await settle();
    m.midi.emit([0xb0, 5, value]); await m.finish();
    assert.equal(m.finished[0]?.status, expected);
  }
});

test('fader live statistics retain a long session without spreading its samples into function arguments', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const m = mount({ kind: 'fader', profile: mapped, params: { controlId: 'gain' } });
  t.after(() => m.runner.dispose()); await settle();
  for (let i = 0; i < 200000; i++) m.midi.emit([0xb0, 5, i % 128], i * 1000);
  t.mock.timers.tick(1000);
  assert.match(m.host.querySelector('.dev-live-stats').textContent, /^200000 samples · now 63 · min 0 · max 127$/);
});

test('dispose while listing ports prevents opening, subscribing or rendering a panel', async () => {
  const listed = deferred(); const m = mount({ midi: bridge({ listPorts: () => listed.promise }) });
  m.runner.dispose(); listed.resolve({ inputs: [{ name: 'A' }], outputs: [] }); await settle();
  assert.deepEqual(m.midi.opens, []); assert.equal(m.midi.subscriptions, 0); assert.equal(m.host.querySelector('#midi-finish'), null);
});

test('dispose during open closes that port after resolution without installing subscriber or panel', async () => {
  const opened = deferred(); const m = mount({ midi: bridge({ open: () => opened.promise }) }); await settle();
  assert.deepEqual(m.midi.opens, ['A']); m.runner.dispose(); opened.resolve(); await settle();
  assert.deepEqual(m.midi.closes, ['A']); assert.equal(m.midi.subscriptions, 0); assert.equal(m.host.querySelector('#midi-finish'), null);
});

test('a stale different-port open is closed without replacing the new port panel or listener', async () => {
  const old = deferred(); const m = mount({ midi: bridge({ open: port => port === 'A' ? old.promise : Promise.resolve() }) }); await settle();
  await m.select('B'); const panel = m.host.querySelector('#midi-finish');
  old.resolve(); await settle();
  assert.deepEqual(m.midi.closes, ['A']); assert.equal(m.midi.subscriptions, 1); assert.equal(m.midi.listeners.size, 1);
  assert.equal(m.host.querySelector('#midi-finish'), panel);
  m.runner.dispose(); await settle(); assert.deepEqual(m.midi.closes, ['A', 'B']);
});

test('a stale same-port open cannot close or replace the newer owner', async () => {
  const old = deferred(); const midi = bridge({ open: (_, count) => count === 1 ? old.promise : Promise.resolve() });
  const first = mount({ midi }); await settle(); first.runner.dispose();
  const second = mount({ midi }); await settle(); const panel = second.host.querySelector('#midi-finish');
  old.resolve(); await settle();
  assert.deepEqual(midi.closes, []); assert.equal(midi.listeners.size, 1); assert.equal(midi.subscriptions, 1);
  assert.equal(second.host.querySelector('#midi-finish'), panel);
  second.runner.dispose(); await settle(); assert.deepEqual(midi.closes, ['A']);
});

test('a stale open failure cannot overwrite the current connection status', async () => {
  const old = deferred(); const m = mount({ midi: bridge({ open: port => port === 'A' ? old.promise : Promise.resolve() }) }); await settle();
  await m.select('B'); const status = m.host.querySelector('.dev-port-status');
  const connected = status.innerHTML; old.reject(new Error('old A failed')); await settle();
  assert.equal(status.innerHTML, connected); assert.match(connected, /Listening on B/); assert.equal(m.midi.listeners.size, 1);
  m.runner.dispose(); await settle();
});

test('a pending old success is released when its replacement owner fails to open', async () => {
  const old = deferred(); const midi = bridge({ open: (_, count) => count === 1 ? old.promise : Promise.reject(new Error('new open failed')) });
  const first = mount({ midi }); await settle(); first.runner.dispose();
  const second = mount({ midi }); await settle(); old.resolve(); await settle();
  assert.deepEqual(midi.closes, ['A']); assert.equal(midi.listeners.size, 0);
  second.runner.dispose(); await settle();
});

test('port replacement unsubscribes immediately and waits for an owned close before reopening it', async () => {
  const closed = deferred(); const midi = bridge({ close: (_, count) => count === 1 ? closed.promise : Promise.resolve() });
  const m = mount({ midi }); await settle();
  const switching = m.select('B'); await turn();
  assert.equal(midi.listeners.size, 0);
  assert.equal(m.host.querySelector('#midi-finish'), null, 'old-port results cannot be submitted while reconnecting');
  const back = m.select('A'); await turn();
  assert.equal(midi.opens.filter(port => port === 'A').length, 1, 'new A open waits for the outstanding A close');
  closed.resolve(); await Promise.all([switching, back]); await settle();
  assert.equal(midi.listeners.size, 1); assert.equal(midi.opens.at(-1), 'A');
  m.runner.dispose(); await settle();
});

const ledProfile = count => ({ model: 'Test', midi: { mapSource: 'published', controls: [control('play', 11), control('cue', 12)].slice(0, count).map(c => ({ ...c, led: true })) } });
const ledPorts = async () => ({ inputs: [{ name: 'A' }, { name: 'B' }], outputs: [{ name: 'A' }, { name: 'B' }] });

test('LED answer awaiting an old-port off send cannot save a result for its replacement connection', async t => {
  const oldOff = deferred();
  const midi = bridge({ listPorts: ledPorts, send: (_, __, count) => count === 2 ? oldOff.promise : Promise.resolve() });
  const m = mount({ kind: 'led', profile: ledProfile(1), midi }); t.after(() => m.runner.dispose()); await settle();
  const oldAnswer = m.host.querySelector('#led-yes').fire('click'); await turn();
  await m.select('B'); await settle(); oldOff.resolve(); await oldAnswer; await settle();
  assert.deepEqual(m.finished, [], 'B has not been answered; old A evidence cannot finish B');
  await m.host.querySelector('#led-yes').fire('click'); await settle();
  assert.equal(m.finished.length, 1); assert.equal(m.finished[0].status, 'pass'); assert.equal(m.finished[0].extra.port, 'B');
});

test('LED old answers cannot send the next on message after switching connections', async t => {
  const oldOff = deferred();
  const midi = bridge({ listPorts: ledPorts, send: (_, __, count) => count === 2 ? oldOff.promise : Promise.resolve() });
  const m = mount({ kind: 'led', profile: ledProfile(2), midi }); t.after(() => m.runner.dispose()); await settle();
  const oldAnswer = m.host.querySelector('#led-yes').fire('click'); await turn();
  await m.select('B'); await settle(); const currentStage = m.host.querySelector('.dev-led-stage');
  const onBefore = midi.sends.filter(s => s.bytes[0] === 0x90).length;
  oldOff.resolve(); await oldAnswer; await settle();
  assert.equal(midi.sends.filter(s => s.bytes[0] === 0x90).length, onBefore, 'no next LED on from the old panel');
  assert.equal(m.host.querySelector('.dev-led-stage'), currentStage); assert.deepEqual(m.finished, []);
});

test('LED disposal during an on send suppresses later UI and safely turns off the captured output', async () => {
  const oldOn = deferred();
  const midi = bridge({ listPorts: ledPorts, send: (_, __, count) => count === 1 ? oldOn.promise : Promise.resolve() });
  const m = mount({ kind: 'led', profile: ledProfile(1), midi }); await settle();
  const oldStage = m.host.querySelector('.dev-led-stage'); m.runner.dispose();
  oldOn.resolve(); await settle();
  assert.equal(oldStage.children.length, 0, 'a disposed panel cannot render questions after send resolves');
  assert.ok(midi.sends.some(s => s.port === 'A' && s.bytes[0] === 0x80), 'old LED off cleanup is retained');
  assert.deepEqual(m.finished, []);
});

test('LED late on completion cleans up the original output after the selected output has changed', async t => {
  const oldOn = deferred();
  const midi = bridge({ listPorts: ledPorts, send: (_, __, count) => count === 1 ? oldOn.promise : Promise.resolve() });
  const m = mount({ kind: 'led', profile: ledProfile(1), midi }); t.after(() => m.runner.dispose()); await settle();
  await m.select('B'); await settle();
  await m.host.querySelector('.btn-icon').fire('click'); await settle();
  assert.equal(midi.sends.at(-1).port, 'B', 'refresh selects output B for the current connection');
  oldOn.resolve(); await settle();
  assert.deepEqual(midi.sends.at(-1), { port: 'A', bytes: [0x80, 11, 0] }, 'only an off cleanup is allowed on the old captured output');
  assert.deepEqual(m.finished, []);
});
