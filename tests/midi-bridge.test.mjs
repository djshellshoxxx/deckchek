import test from 'node:test';
import assert from 'node:assert/strict';

let sequence = 0;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };

async function bridge(t, { access, request = async () => access, native = null } = {}) {
  const descriptors = new Map(['window', 'navigator'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: native ? { __TAURI__: native } : {} });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { requestMIDIAccess: request } });
  t.after(() => { for (const [name, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  return import(`../app/midi.js?bridge-test=${++sequence}`);
}

const port = (name, id) => ({ name, id, state: 'connected', onmidimessage: null, sent: [], closed: 0,
  send(bytes) { this.sent.push([...bytes]); }, async close() { this.closed++; },
});

test('Web MIDI rejects ambiguous names at input and initial output selection', async t => {
  const first = port('A', 'a'), second = port('A', 'b');
  const access = { inputs: new Map([['a', first], ['b', second]]), outputs: new Map([['a', first], ['b', second]]) };
  const midi = await bridge(t, { access });
  await assert.rejects(midi.open('A'), /input name is ambiguous/i);
  await assert.rejects(midi.send('A', [0x90, 60, 100]), /output name is ambiguous/i);
  assert.equal(first.onmidimessage, null);
  assert.deepEqual(first.sent, []);
  assert.deepEqual(second.sent, []);
});

test('Web MIDI input callbacks remain owned when a repeated open is ambiguous or replaces the port object', async t => {
  const first = port('A', 'a'), second = port('A', 'b');
  const access = { inputs: new Map([['a', first]]), outputs: new Map() };
  const midi = await bridge(t, { access });
  const received = []; const unsubscribe = midi.onMessage(message => received.push(message)); t.after(unsubscribe);
  await midi.open('A'); const callback = first.onmidimessage;
  await midi.open('A'); assert.equal(first.onmidimessage, callback);
  access.inputs.set('b', second);
  await assert.rejects(midi.open('A'), /ambiguous/i);
  assert.equal(first.onmidimessage, callback);
  assert.equal(second.onmidimessage, null);
  callback({ data: [0xb0, 1, 2], timeStamp: 123 });
  assert.deepEqual(received, [{ port: 'A', timestampUs: 123000, bytes: [0xb0, 1, 2] }]);
  access.inputs.delete('a');
  await assert.rejects(midi.open('A'), /changed|replaced/i);
  assert.equal(first.onmidimessage, callback);
  await midi.close('A');
  assert.equal(first.onmidimessage, null);
  assert.equal(first.closed, 1);
  await midi.open('A');
  assert.equal(typeof second.onmidimessage, 'function');
});

test('Web MIDI output cleanup uses its captured port and never retargets a same-name replacement', async t => {
  const first = port('A', 'a'), second = port('A', 'b');
  const access = { inputs: new Map(), outputs: new Map([['a', first]]) };
  const midi = await bridge(t, { access });
  await midi.send('A', [0x90, 60, 100]);
  access.outputs.set('b', second);
  await midi.send('A', [0x80, 60, 0]);
  assert.deepEqual(first.sent, [[0x90, 60, 100], [0x80, 60, 0]], 'a new duplicate cannot steal Note Off from the captured output');
  assert.deepEqual(second.sent, []);
  access.outputs.delete('a'); first.state = 'disconnected';
  await assert.rejects(midi.send('A', [0xb0, 123, 0]), /disconnected|changed|replaced/i);
  assert.deepEqual(second.sent, [], 'old cleanup cannot reconnect to another device by display name');
  await midi.closeAll();
  assert.equal(first.closed, 1);
  await midi.send('A', [0x90, 64, 100]);
  assert.deepEqual(second.sent, [[0x90, 64, 100]], 'explicit close-all releases the old output binding');
});

test('Web MIDI sends cannot change port after an output failure', async t => {
  const first = port('A', 'a'), replacement = port('A', 'b');
  const access = { inputs: new Map(), outputs: new Map([['a', first]]) };
  const midi = await bridge(t, { access });
  await midi.send('A', [0x90, 60, 100]);
  first.send = () => { throw new Error('device disconnected'); };
  await assert.rejects(midi.send('A', [0x80, 60, 0]), /disconnected/);
  access.outputs = new Map([['b', replacement]]);
  await assert.rejects(midi.send('A', [0xb0, 120, 0]), /disconnected|changed|replaced/i);
  assert.deepEqual(replacement.sent, []);
});

test('concurrent Web MIDI requests share one access instance and a failed request can retry', async t => {
  let calls = 0; const pending = deferred(); const input = port('A', 'a');
  const access = { inputs: new Map([['a', input]]), outputs: new Map() };
  const midi = await bridge(t, { request: () => { calls++; return calls === 1 ? pending.promise : Promise.resolve(access); } });
  const listing = midi.listPorts(); const opening = midi.open('A'); await settle();
  assert.equal(calls, 1);
  pending.reject(new Error('permission rejected'));
  await Promise.all([assert.rejects(listing, /permission rejected/), assert.rejects(opening, /permission rejected/)]);
  await midi.open('A'); assert.equal(calls, 2);
  assert.equal(typeof input.onmidimessage, 'function');
});

test('concurrent native opens and subscriptions install one MIDI event listener', async t => {
  const pending = deferred(), handlers = [], invokes = [];
  const midi = await bridge(t, { native: {
    core: { invoke: async (command, args) => { invokes.push({ command, args }); } },
    event: { listen: async (event, handler) => { assert.equal(event, 'midi-message'); handlers.push(handler); return pending.promise; } },
  } });
  const messages = []; const unsubscribe = midi.onMessage(message => messages.push(message)); t.after(unsubscribe);
  const opening = midi.open('A'); await settle();
  assert.equal(handlers.length, 1, 'one native batch must be delivered only once');
  pending.resolve(() => {}); await opening;
  handlers[0]({ payload: [{ port: 'A', timestampUs: 1, bytes: [0xb0, 1, 2] }] });
  assert.equal(messages.length, 1);
  assert.deepEqual(invokes, [{ command: 'midi_open_input', args: { name: 'A' } }]);
});

test('closing MIDI cancels an input still awaiting Web MIDI permission', async t => {
  for (const all of [false, true]) {
    const pending = deferred(), input = port('A', 'a');
    const midi = await bridge(t, { request: () => pending.promise });
    const opening = midi.open('A').then(() => null, error => error);
    await settle();
    if (all) await midi.closeAll(); else await midi.close('A');
    pending.resolve({ inputs: new Map([['a', input]]), outputs: new Map() });
    assert.ok(await opening, 'obsolete open reports cancellation');
    assert.equal(input.onmidimessage, null, 'late permission cannot revive a closed input');
  }
});

test('closeAll cancels an output send that has not yet acquired its captured port', async t => {
  const first = port('A', 'a'), replacement = port('A', 'b');
  const access = { inputs: new Map(), outputs: new Map([['a', first]]) };
  const midi = await bridge(t, { access });
  await midi.send('A', [0x90, 60, 100]);
  const stale = midi.send('A', [0x80, 60, 0]).then(() => null, error => error);
  const closing = midi.closeAll(); access.outputs = new Map([['b', replacement]]);
  await closing;
  assert.ok(await stale);
  assert.deepEqual(replacement.sent, []);
});

test('closeAll cancels a native input waiting for event subscription', async t => {
  const pending = deferred(), invokes = [];
  const midi = await bridge(t, { native: { core: { invoke: async command => invokes.push(command) }, event: { listen: () => pending.promise } } });
  const opening = midi.open('A').then(() => null, error => error);
  await settle(); await midi.closeAll(); pending.resolve(() => {});
  assert.ok(await opening);
  assert.deepEqual(invokes, ['midi_close_all']);
});

test('new input operations wait for their captured close before installing a new callback', async t => {
  const pending = deferred(), input = port('A', 'a');
  input.close = async () => { input.closed++; await pending.promise; input.onmidimessage = null; };
  const midi = await bridge(t, { access: { inputs: new Map([['a', input]]), outputs: new Map() } });
  await midi.open('A'); const oldCallback = input.onmidimessage;
  const closing = midi.close('A');
  const opening = midi.open('A'); await settle();
  assert.equal(input.onmidimessage, null, 'reopen waits for the old close');
  pending.resolve(); await closing; await opening;
  assert.equal(typeof input.onmidimessage, 'function');
  assert.notEqual(input.onmidimessage, oldCallback);
  const received = []; midi.onMessage(message => received.push(message));
  oldCallback({ data: [0xb0, 1, 2], timeStamp: 1 });
  assert.deepEqual(received, [], 'a callback queued before close cannot enter the new input session');
});

test('new output sends wait for all captured close operations, including a slower close after another rejects', async t => {
  const pending = deferred(), first = port('A', 'a'), second = port('B', 'b');
  first.close = async () => { throw new Error('close failed'); };
  second.close = async () => { await pending.promise; };
  const access = { inputs: new Map(), outputs: new Map([['a', first], ['b', second]]) };
  const midi = await bridge(t, { access });
  await midi.send('A', [0x90, 60, 100]); await midi.send('B', [0x90, 60, 100]);
  const closing = midi.closeAll().then(() => null, error => error);
  const sending = midi.send('A', [0x80, 60, 0]).then(() => null, error => error);
  await settle();
  assert.equal(first.sent.length, 1, 'new send waits until every old close settles');
  pending.resolve();
  assert.match((await closing).message, /close failed/);
  assert.ok(await sending, 'the pending operation surfaces the failed close');
});
