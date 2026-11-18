import test from 'node:test';
import assert from 'node:assert/strict';
import { quickDiagnostic } from '../../app/core.js';
import { FULL, measure, tone } from './helpers.mjs';

test('stress: Quick Check on a long capture is deterministic', () => {
  const sig = tone(FULL ? 600 : 60);
  const a = measure('quickDiagnostic', () => quickDiagnostic(sig), { budgetMs: FULL ? 60_000 : 10_000, budgetMb: FULL ? 1500 : 800 });
  const b = quickDiagnostic(sig);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), 'same input twice gives identical output');
});
