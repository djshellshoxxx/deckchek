// Regression tests for defects found by the 2026-10 fuzz/audit run (see AUDIT.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceToImportPayload } from '../app/backup.js';
import { parseWorkspaceJson, MAX_WORKSPACE_CHARS } from '../app/export.js';

test('regression: fuzz workspace — non-array measurements/findings are dropped, not a TypeError (AUD-JS-01)', () => {
  const hostile = { version: 1, equipment: [], runs: [
    { id: 'a', measurements: {}, findings: 'x' },
    { id: 'b', measurements: [null, 3, { metricId: 'rms', value: 1, unit: 'dB', qualityFlags: 'bad' }], findings: [{ title: 5, possibleCauses: [1, 'hum'] }] },
  ] };
  const out = workspaceToImportPayload(hostile);
  assert.equal(out.runs.length, 2);
  assert.deepEqual(out.runs[0].measurements, []);
  assert.equal(out.runs[1].measurements.length, 1);
  assert.deepEqual(out.runs[1].measurements[0].qualityFlags, []);
  assert.deepEqual(out.runs[1].findings[0].possibleCauses, ['hum']);
});

test('regression: workspace files over the size cap are refused before parsing (AUD-JS-02)', () => {
  assert.throws(() => parseWorkspaceJson('x'.repeat(MAX_WORKSPACE_CHARS + 1)), /larger than 64 MB/);
  assert.throws(() => parseWorkspaceJson(undefined), /missing/);
});
