import test from 'node:test';
import assert from 'node:assert/strict';
import { SCREENS, parseHash } from '../mobile/lib/routes.js';

test('Mobile recognizes all five declared routes and supported prefixes', () => {
  const names = ['speed', 'strobe', 'vibration', 'spl', 'results'];
  assert.deepEqual(Object.keys(SCREENS), names);
  for (const name of names) {
    assert.equal(typeof SCREENS[name].load, 'function');
    assert.equal(typeof SCREENS[name].title, 'string');
    for (const prefix of ['', '#', '#/']) assert.deepEqual(parseHash(`${prefix}${name}`), { name, id: null });
  }
});

test('Mobile falls back to Speed for empty, unsupported and inherited names', () => {
  for (const value of [undefined, null, '', '#', '#/']) assert.deepEqual(parseHash(value), { name: 'speed', id: null });
  for (const name of ['not-a-screen', 'SPEED', ...Object.getOwnPropertyNames(Object.prototype)]) {
    for (const prefix of ['#', '#/']) assert.deepEqual(parseHash(`${prefix}${name}`), { name: 'speed', id: null });
  }
});

test('Mobile preserves result IDs and existing first-segment routing', () => {
  for (const prefix of ['#', '#/']) {
    for (const id of ['saved-id', 'a%2Fb']) assert.deepEqual(parseHash(`${prefix}results/${id}`), { name: 'results', id });
    assert.deepEqual(parseHash(`${prefix}results/saved-id/extra`), { name: 'results', id: 'saved-id' });
    assert.deepEqual(parseHash(`${prefix}results/`), { name: 'results', id: null });
    assert.deepEqual(parseHash(`${prefix}not-a-screen/saved-id`), { name: 'speed', id: 'saved-id' });
  }
});
