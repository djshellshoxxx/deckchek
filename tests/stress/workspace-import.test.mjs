import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceToImportPayload } from '../../app/backup.js';
import { FULL, measure } from './helpers.mjs';

test('stress: workspace import shaping of 10 000 runs x 40 measurements', () => {
  const n = FULL ? 10_000 : 2_000;
  const runs = Array.from({ length: n }, (_, i) => ({ id: `run-${i}`, test: 'Quick Check', createdAt: '2026-01-01T00:00:00Z',
    measurements: Array.from({ length: 40 }, (_, k) => ({ metricId: `m${k}`, value: i + k / 10, unit: 'dB', label: `Metric ${k} ${'ü'.repeat(k % 5)}` })),
    findings: [{ title: 'x'.repeat(200), severity: 'review', possibleCauses: ['a', 'b'] }] }));
  const out = measure(`workspace import ${n} runs`, () => workspaceToImportPayload({ version: 1, equipment: [], runs }), { budgetMs: FULL ? 20_000 : 8_000, budgetMb: FULL ? 2000 : 900 });
  assert.equal(out.runs.length, n);
});
