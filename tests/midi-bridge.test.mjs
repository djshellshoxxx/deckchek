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
  assert.deepEqual(received, [{ port: 'A', portId: 'a', timestampUs: 123000, bytes: [0xb0, 1, 2] }]);
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
    core: { invoke: async (command, args) => { invokes.push({ command, args }); if (command === 'midi_list_ports') return { inputs: [{ name: 'A' }], outputs: [] }; } },
    event: { listen: async (event, handler) => { assert.equal(event, 'midi-message'); handlers.push(handler); return pending.promise; } },
  } });
  const messages = []; const unsubscribe = midi.onMessage(message => messages.push(message)); t.after(unsubscribe);
  const opening = midi.open('A'); await settle();
  assert.equal(handlers.length, 1, 'one native batch must be delivered only once');
  pending.resolve(() => {}); await opening;
  handlers[0]({ payload: [{ port: 'A', timestampUs: 1, bytes: [0xb0, 1, 2] }] });
  assert.equal(messages.length, 1);
  assert.deepEqual(invokes, [{ command: 'midi_list_ports', args: undefined }, { command: 'midi_open_input', args: { name: 'A' } }]);
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
  const midi = await bridge(t, { native: { core: { invoke: async command => { invokes.push(command); if (command === 'midi_list_ports') return { inputs: [{ name: 'A' }], outputs: [] }; } }, event: { listen: () => pending.promise } } });
  const opening = midi.open('A').then(() => null, error => error);
  await settle(); await midi.closeAll(); pending.resolve(() => {});
  assert.ok(await opening);
  assert.deepEqual(invokes, ['midi_list_ports', 'midi_close_all']);
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

test('logical IDs enumerate and route duplicate-named inputs and outputs independently', async t => {
  const first = port('USB MIDI', 'a'), second = port('USB MIDI', 'b');
  const outFirst = port('USB MIDI', 'a'), outSecond = port('USB MIDI', 'b');
  const access = { inputs: new Map([['a', first], ['b', second]]), outputs: new Map([['a', outFirst], ['b', outSecond]]) };
  const midi = await bridge(t, { access });
  const listed = await midi.listPorts();
  assert.deepEqual(listed.inputs.map(p => p.id), ['a', 'b']);
  const received = []; midi.onMessage(message => received.push(message));
  await midi.open({ id: 'b' });
  assert.equal(first.onmidimessage, null);
  second.onmidimessage({ data: [0x90, 60, 100], timeStamp: 7 });
  assert.deepEqual(received, [{ port: 'USB MIDI', portId: 'b', timestampUs: 7000, bytes: [0x90, 60, 100] }]);
  await midi.send({ id: 'b' }, [0x90, 60, 100]);
  access.inputs = new Map([['b', second], ['a', first]]);
  access.outputs = new Map([['b', outSecond], ['a', outFirst]]);
  await midi.open({ id: 'b' }); await midi.send({ id: 'b' }, [0x80, 60, 0]);
  assert.deepEqual(outFirst.sent, []);
  assert.deepEqual(outSecond.sent, [[0x90, 60, 100], [0x80, 60, 0]]);
  assert.deepEqual((await midi.status()).openInputIds, ['b']);
  assert.deepEqual((await midi.status()).openOutputIds, ['b']);
  await midi.close({ id: 'b' }); assert.equal(second.closed, 1); assert.equal(first.closed, 0);
});

test('logical ID selection rejects missing, malformed and colliding IDs without a name fallback', async t => {
  const first = port('A', 'a'), duplicate = port('B', 'a');
  const access = { inputs: new Map([['one', first], ['two', duplicate]]), outputs: new Map([['one', first], ['two', duplicate]]) };
  const midi = await bridge(t, { access });
  for (const selector of [{ id: 'a' }, { id: 'missing', name: 'A' }, { id: '' }, { id: 1 }, { id: 'a', backend: 'tauri' }]) {
    await assert.rejects(midi.open(selector));
    await assert.rejects(midi.send(selector, [0x90, 60, 100]));
  }
  assert.equal(first.onmidimessage, null); assert.equal(duplicate.onmidimessage, null);
  assert.deepEqual(first.sent, []); assert.deepEqual(duplicate.sent, []);
  access.inputs = new Map([['zero', port('Zero', '0')]]);
  await midi.open({ id: '0' });
  assert.deepEqual((await midi.status()).openInputIds, ['0'], 'opaque zero is valid when unique');
});

test('name and ID selectors share captured ownership and the same close barrier', async t => {
  const closed = deferred(), first = port('A', 'a'), duplicate = port('A', 'b');
  first.close = async () => { first.closed++; await closed.promise; first.onmidimessage = null; };
  const access = { inputs: new Map([['a', first]]), outputs: new Map([['a', first]]) };
  const midi = await bridge(t, { access });
  await midi.open('A'); const original = first.onmidimessage;
  await midi.open({ id: 'a' }); assert.equal(first.onmidimessage, original);
  await midi.send('A', [0x90, 60, 100]);
  access.inputs.set('b', duplicate); access.outputs.set('b', duplicate);
  await midi.send({ id: 'a' }, [0x80, 60, 0]);
  await midi.send('A', [0xb0, 123, 0]);
  assert.equal(first.sent.length, 3); assert.deepEqual(duplicate.sent, []);
  const closing = midi.close('A'), opening = midi.open({ id: 'a' }); await settle();
  assert.equal(first.onmidimessage, null, 'ID reopen waits for the captured name close');
  closed.resolve(); await closing; await opening;
  assert.equal(first.closed, 1); assert.notEqual(first.onmidimessage, original);
  access.inputs.delete('a'); access.outputs.delete('a');
  await assert.rejects(midi.open({ id: 'a', name: 'A' }), /not found|replaced|disconnected/i);
  await assert.rejects(midi.send({ id: 'a', name: 'A' }, [0x80, 60, 0]), /not found|replaced|disconnected/i);
  assert.deepEqual(duplicate.sent, []);
});

test('cross-selector closes cancel unresolved opens before Web MIDI permission returns', async t => {
  for (const [openingSelector, closingSelector] of [['A', { id: 'a' }], [{ id: 'a' }, 'A']]) {
    const pending = deferred(), input = port('A', 'a');
    const midi = await bridge(t, { request: () => pending.promise });
    const opening = midi.open(openingSelector).then(() => null, error => error);
    await settle(); await midi.close(closingSelector);
    pending.resolve({ inputs: new Map([['a', input]]), outputs: new Map() });
    assert.ok(await opening); assert.equal(input.onmidimessage, null);
  }
});

test('closing an input ID leaves an output with the same raw ID captured and sendable', async t => {
  const input = port('Input', 'shared'), output = port('Output', 'shared');
  const midi = await bridge(t, { access: { inputs: new Map([['shared', input]]), outputs: new Map([['shared', output]]) } });
  await midi.open({ id: 'shared' }); await midi.send({ id: 'shared' }, [0x90, 60, 100]);
  await midi.close({ id: 'shared' });
  assert.equal(input.closed, 1); assert.equal(output.closed, 0);
  assert.deepEqual((await midi.status()).openInputIds, []); assert.deepEqual((await midi.status()).openOutputIds, ['shared']);
  await midi.send({ id: 'shared' }, [0x80, 60, 0]);
  assert.deepEqual(output.sent, [[0x90, 60, 100], [0x80, 60, 0]]);
});

test('native selectors carry IDs explicitly while legacy names still require a unique enumeration', async t => {
  const invokes = [], ports = [{ id: 'a', name: 'USB MIDI' }, { id: 'b', name: 'USB MIDI' }];
  const midi = await bridge(t, { native: { core: { invoke: async (command, args) => {
    invokes.push({ command, args });
    if (command === 'midi_list_ports') return { inputs: ports, outputs: ports };
  } } } });
  await assert.rejects(midi.open('USB MIDI'), /ambiguous/);
  await midi.open({ id: 'b', name: 'ignored display label' });
  await midi.send({ id: 'a' }, [0x90, 60, 100]); await midi.close({ id: 'b' });
  assert.deepEqual(invokes.filter(call => call.command !== 'midi_list_ports'), [
    { command: 'midi_open_input', args: { id: 'b' } },
    { command: 'midi_send', args: { id: 'a', bytes: [0x90, 60, 100] } },
    { command: 'midi_close_input', args: { id: 'b' } },
  ]);
});

test('UI choices reject invalid ID metadata and retain an explicit unique-name legacy path', async t => {
  const midi = await bridge(t, { access: { inputs: new Map(), outputs: new Map() } });
  const choices = midi.portChoices([
    { name: 'Legacy' }, { name: 'Empty', id: '' }, { name: 'Wrong type', id: 42 },
    { name: 'Collision one', id: 'x' }, { name: 'Collision two', id: 'x' },
    { name: '', id: 'unreadable', nameAvailable: false }, { name: '', id: 'readable-empty', nameAvailable: true },
  ]);
  assert.equal(choices[0].available, true); assert.equal(choices[0].selector, 'Legacy');
  assert.ok(choices.slice(1, 6).every(p => !p.available));
  assert.equal(choices[6].available, true); assert.deepEqual(choices[6].selector, { id: 'readable-empty' });
  assert.equal(new Set(choices.filter(p => p.available).map(p => p.key)).size, 2);
});

test('native failed name reads cannot masquerade as successfully read empty names', async t => {
  const invokes = [];
  const midi = await bridge(t, { native: { core: { invoke: async (command, args) => {
    invokes.push({ command, args });
    if (command === 'midi_list_ports') return { inputs: [{ id: 'bad', name: '', nameAvailable: false }, { id: 'empty', name: '', nameAvailable: true }], outputs: [] };
  } } } });
  await midi.open('');
  assert.deepEqual(invokes.at(-1), { command: 'midi_open_input', args: { id: 'empty', name: '' } });
  await assert.rejects(midi.open({ id: 'bad' }), /name is unavailable/);
});

test('a late native open failure cannot discard a newer same-ID captured name alias', async t => {
  const pending = deferred(), ports = [{ id: 'a', name: 'A' }], closes = []; let opens = 0;
  const midi = await bridge(t, { native: { core: { invoke: async (command, args) => {
    if (command === 'midi_list_ports') return { inputs: [...ports], outputs: [] };
    if (command === 'midi_open_input' && ++opens === 1) await pending.promise;
    if (command === 'midi_close_input') closes.push(args);
  } } } });
  const old = midi.open('A').then(() => null, error => error); await settle();
  await midi.open({ id: 'a' }); pending.reject(new Error('old request failed')); assert.ok(await old);
  ports.push({ id: 'b', name: 'A' }); await midi.listPorts();
  await midi.close('A'); assert.deepEqual(closes, [{ id: 'a' }]);
});

test('a legacy close cancels its pending name request after a cached ID is replaced', async t => {
  const pending = deferred(), invokes = []; let lists = 0;
  const midi = await bridge(t, { native: { core: { invoke: async (command, args) => {
    invokes.push({ command, args });
    if (command === 'midi_list_ports') return ++lists === 1 ? { inputs: [{ id: 'old-id', name: 'A' }], outputs: [] } : pending.promise;
  } } } });
  await midi.listPorts();
  const opening = midi.open('A').then(() => null, error => error); await settle();
  assert.equal(lists, 2);
  await midi.close('A'); pending.resolve({ inputs: [{ id: 'new-id', name: 'A' }], outputs: [] });
  assert.match((await opening)?.message || '', /cancelled/i);
  assert.deepEqual(invokes.filter(call => call.command === 'midi_close_input'), [{ command: 'midi_close_input', args: { id: 'old-id' } }]);
  assert.deepEqual(invokes.filter(call => call.command === 'midi_open_input'), [], 'the canceled name request cannot open a replacement ID');
});

test('captured legacy close cancels its ID without canceling an independently selected namesake ID', async t => {
  const pending = deferred(), invokes = []; let lists = 0;
  const midi = await bridge(t, { native: { core: { invoke: async (command, args) => {
    invokes.push({ command, args });
    if (command === 'midi_list_ports') return ++lists === 1 ? { inputs: [{ id: 'a', name: 'A' }], outputs: [] } : pending.promise;
  } } } });
  await midi.open('A');
  const same = midi.open({ id: 'a' }).then(() => null, error => error);
  const other = midi.open({ id: 'b' }); await settle();
  await midi.close('A');
  pending.resolve({ inputs: [{ id: 'a', name: 'A' }, { id: 'b', name: 'A' }], outputs: [] });
  assert.match((await same)?.message || '', /cancelled/i); await other;
  assert.deepEqual(invokes.filter(call => call.command === 'midi_open_input').map(call => call.args), [{ id: 'a', name: 'A' }, { id: 'b' }]);
  assert.deepEqual(invokes.filter(call => call.command === 'midi_close_input').map(call => call.args), [{ id: 'a' }]);
});

test('an unresolved ambiguous name close cannot cancel two independently selected IDs', async t => {
  const pending = deferred(), first = port('A', 'a'), second = port('A', 'b');
  const midi = await bridge(t, { request: () => pending.promise });
  const openingFirst = midi.open({ id: 'a' }), openingSecond = midi.open({ id: 'b' }); await settle();
  await midi.close('A'); pending.resolve({ inputs: new Map([['a', first], ['b', second]]), outputs: new Map() });
  await Promise.all([openingFirst, openingSecond]);
  assert.equal(typeof first.onmidimessage, 'function'); assert.equal(typeof second.onmidimessage, 'function');
  assert.deepEqual((await midi.status()).openInputIds.sort(), ['a', 'b']);
});
