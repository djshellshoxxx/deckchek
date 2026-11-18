import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '../../app/canonical-json.js';
import { FULL, measure } from './helpers.mjs';

test('stress: canonical JSON of a 5 MB certificate-sized payload is stable', () => {
  const big = { items: Array.from({ length: FULL ? 50_000 : 10_000 }, (_, i) => ({ id: i, name: `unit ${i} é`, values: [i, -i, i * 3], ok: i % 2 === 0 })) };
  const a = measure('canonicalJson large', () => canonicalJson(big), { budgetMs: 15_000, budgetMb: 1200 });
  assert.equal(canonicalJson(JSON.parse(a)), a);
});
