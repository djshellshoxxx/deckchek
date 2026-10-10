import test from 'node:test';
import assert from 'node:assert/strict';
import { chosenPair, pairsArg, rememberPair, readMemory, findDevice, pairsOf, PAIR_STORE_KEY } from '../app/input-pairs.js';
import { inputPairs } from '../app/capture.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const audio8 = { name: 'Traktor Audio 8 DJ', isDefault: false, maxChannels: 8, pairs: inputPairs(8) };
const stereo = { name: 'Focusrite USB', isDefault: true, maxChannels: 2, pairs: inputPairs(2) };
const odd = { name: 'Five', isDefault: false, maxChannels: 5, pairs: inputPairs(5) };
const devices = [stereo, audio8, odd];

test('the default pair is the first named pair (1-2) and sends no pairs argument', () => {
  const s = mem();
  assert.equal(chosenPair(s, devices, 'Traktor Audio 8 DJ').label, '1-2');
  assert.equal(pairsArg(s, devices, 'Traktor Audio 8 DJ'), null);
  assert.deepEqual(chosenPair(s, devices, 'Traktor Audio 8 DJ').available.map(p => p.label), ['1-2', '3-4', '5-6', '7-8']);
});

test('a chosen pair is remembered per device and sent as the first channel', () => {
  const s = mem();
  assert.ok(rememberPair(s, 'Traktor Audio 8 DJ', 3));
  assert.deepEqual(pairsArg(s, devices, 'Traktor Audio 8 DJ'), [3]);
  assert.equal(chosenPair(s, devices, 'Traktor Audio 8 DJ').remembered, true);
  assert.equal(chosenPair(s, devices, 'Traktor Audio 8 DJ').remembered, true);
  assert.equal(chosenPair(s, devices, 'Focusrite USB').label, '1-2', 'other devices are unaffected');
  rememberPair(s, 'Traktor Audio 8 DJ', 1);
  assert.deepEqual(readMemory(s), {}, 'choosing 1-2 forgets the entry');
});

test('a remembered pair the device no longer offers falls back to 1-2', () => {
  const s = mem();
  rememberPair(s, 'Focusrite USB', 5);
  assert.equal(chosenPair(s, devices, 'Focusrite USB').label, '1-2');
  assert.equal(pairsArg(s, devices, 'Focusrite USB'), null);
});

test('the system default input resolves to the default device and shares its memory', () => {
  const s = mem();
  assert.equal(findDevice(devices, '').name, 'Focusrite USB');
  rememberPair(s, 'Focusrite USB', 1);
  assert.deepEqual(chosenPair(s, [{ ...audio8, isDefault: true }, stereo], '').available.length, 4);
  rememberPair(s, 'Traktor Audio 8 DJ', 7);
  assert.deepEqual(pairsArg(s, [{ ...audio8, isDefault: true }], ''), [7]);
});

test('a trailing mono pair is offered and an unknown device falls back to 1-2', () => {
  assert.deepEqual(pairsOf(odd).map(p => [p.label, p.mono]), [['1-2', false], ['3-4', false], ['5', true]]);
  const s = mem();
  rememberPair(s, 'Five', 5);
  assert.deepEqual(pairsArg(s, devices, 'Five'), [5]);
  assert.equal(chosenPair(s, [], 'Missing').first, 1);
  assert.deepEqual(pairsOf({ name: 'old backend' }).map(p => p.label), ['1-2']);
});

test('broken or unavailable storage never throws', () => {
  assert.equal(rememberPair(null, 'x', 3), false);
  assert.deepEqual(readMemory({ getItem: () => '{not json' }), {});
  assert.deepEqual(readMemory({ getItem: () => '[1]' }), {});
  assert.equal(PAIR_STORE_KEY, 'deckchek.inputPairs.v1');
});

test('slots keep a separate choice per use (pre-gig deck B defaults to 3-4) without touching the device default', () => {
  const s = mem();
  const b = { slot: 'pregig:B', fallback: 3 };
  assert.equal(chosenPair(s, devices, 'Traktor Audio 8 DJ', b).label, '3-4');
  assert.deepEqual(pairsArg(s, devices, 'Traktor Audio 8 DJ', b), [3]);
  rememberPair(s, 'Traktor Audio 8 DJ', 5, b);
  assert.equal(chosenPair(s, devices, 'Traktor Audio 8 DJ', b).label, '5-6');
  assert.equal(chosenPair(s, devices, 'Traktor Audio 8 DJ').label, '1-2');
  rememberPair(s, 'Traktor Audio 8 DJ', 3, b);
  assert.deepEqual(readMemory(s), {}, 'choosing the slot default stores no override');
  const stereoB = chosenPair(s, devices, 'Focusrite USB', b);
  assert.deepEqual([stereoB.label, stereoB.offered], ['3-4', false], 'a stereo-only interface keeps the deck default so the check can say it has no inputs 3-4');
  assert.equal(chosenPair(s, devices, 'Traktor Audio 8 DJ', b).offered, true);
});

test('a named rig whose interface is not listed offers the usual pairs and keeps its remembered choice', () => {
  const s = mem();
  const opts = { slot: 'pregig:B', fallback: 3, anyPair: true };
  assert.deepEqual(chosenPair(s, [], 'Traktor Audio 8 DJ', opts).available.map(p => p.label), ['1-2', '3-4', '5-6', '7-8']);
  assert.equal(chosenPair(s, [], 'Traktor Audio 8 DJ', opts).label, '3-4');
  rememberPair(s, 'Traktor Audio 8 DJ', 7, opts);
  assert.equal(chosenPair(s, [stereo], 'Traktor Audio 8 DJ', opts).label, '7-8');
  const strict = chosenPair(s, [], 'Traktor Audio 8 DJ', { slot: 'pregig:B', fallback: 3 });
  assert.deepEqual(strict.available.map(p => p.label), ['1-2'], 'without anyPair an unknown device only offers 1-2');
  assert.deepEqual([strict.label, strict.offered], ['3-4', false]);
});
