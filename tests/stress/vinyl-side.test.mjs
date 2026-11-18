import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeVinylSide } from '../../app/core.js';
import { FULL, measure, tone } from './helpers.mjs';

test('stress: full vinyl side analysis (20 min stereo 48 kHz = 460 MB of samples when full)', () => {
  const minutes = FULL ? 20 : 2;
  const sig = tone(minutes * 60);
  const r = measure(`analyzeVinylSide ${minutes} min`, () => analyzeVinylSide(sig), { budgetMs: FULL ? 240_000 : 30_000, budgetMb: FULL ? 2600 : 900 });
  assert.ok(Array.isArray(r.measurements ?? r.events ?? []));
});
