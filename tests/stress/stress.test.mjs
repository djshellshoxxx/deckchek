// Stress and performance suite (nightly CI: DECKCHEK_STRESS=full; default sizes are a quick
// local check). Each case records wall time and peak RSS against a documented budget in
// docs/qa.md; budgets are lenient for shared CI runners. Determinism: same input twice must
// give identical output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeVinylSide, quickDiagnostic } from '../../app/core.js';
import { createScanner } from '../../app/wear-map.js';
import { workspaceToImportPayload } from '../../app/backup.js';
import { canonicalJson } from '../../app/canonical-json.js';
import { quadratureTimecode } from '../fixtures/signals.mjs';

const FULL = process.env.DECKCHEK_STRESS === 'full';
const results = [];
function measure(name, fn, { budgetMs, budgetMb }) {
  globalThis.gc?.();
  const rss0 = process.memoryUsage().rss;
  let peak = rss0;
  const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 20);
  const t0 = performance.now();
  let out;
  try { out = fn(); } finally { clearInterval(timer); }
  const ms = performance.now() - t0;
  peak = Math.max(peak, process.memoryUsage().rss, process.resourceUsage().maxRSS * 1024);
  const r = { name, ms: Math.round(ms), peakMb: Math.round(peak / 1e6), budgetMs, budgetMb };
  results.push(r);
  console.log(`STRESS ${JSON.stringify(r)}`);
  assert.ok(ms <= budgetMs, `${name}: ${Math.round(ms)} ms > budget ${budgetMs} ms`);
  assert.ok(peak / 1e6 <= budgetMb, `${name}: peak ${Math.round(peak / 1e6)} MB > budget ${budgetMb} MB`);
  return out;
}

function tone(seconds, sampleRate = 48000) {
  const n = Math.round(seconds * sampleRate), left = new Float32Array(n), right = new Float32Array(n);
  let s = 1;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    const noise = ((s >>> 8) / 16777216 - 0.5) * 0.002;
    const v = 0.25 * Math.sin(2 * Math.PI * 1000 * i / sampleRate) + noise;
    left[i] = v; right[i] = v * 0.98;
    if (i % (sampleRate * 1.8 | 0) === 0) { left[i] = 0.9; right[i] = 0.9; } // periodic clicks
  }
  return { left, right, sampleRate };
}

test('stress: full vinyl side analysis (20 min stereo 48 kHz = 460 MB of samples when full)', () => {
  const minutes = FULL ? 20 : 2;
  const sig = tone(minutes * 60);
  const r = measure(`analyzeVinylSide ${minutes} min`, () => analyzeVinylSide(sig), { budgetMs: FULL ? 240_000 : 30_000, budgetMb: FULL ? 2600 : 900 });
  assert.ok(Array.isArray(r.measurements ?? r.events ?? []));
});

test('stress: Quick Check on a long capture is deterministic', () => {
  const sig = tone(FULL ? 600 : 60);
  const a = measure('quickDiagnostic', () => quickDiagnostic(sig), { budgetMs: FULL ? 60_000 : 10_000, budgetMb: FULL ? 1500 : 800 });
  const b = quickDiagnostic(sig);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), 'same input twice gives identical output');
});

test('stress: wear-map streaming scanner keeps memory bounded over a long side', () => {
  const seconds = FULL ? 900 : 90, sampleRate = 48000, chunkSec = 30;
  const scanner = createScanner({ format: 'Serato CV02.5', sampleRate });
  measure(`wear-map stream ${seconds}s`, () => {
    for (let t = 0; t < seconds; t += chunkSec) {
      const c = quadratureTimecode({ carrierHz: 1000, seconds: chunkSec, sampleRate, snrDb: 35, seed: 1 + t });
      scanner.push(c.left, c.right);
    }
    return scanner.finish?.() ?? null;
  }, { budgetMs: FULL ? 180_000 : 30_000, budgetMb: FULL ? 900 : 700 });
});

test('stress: workspace import shaping of 10 000 runs x 40 measurements', () => {
  const n = FULL ? 10_000 : 2_000;
  const runs = Array.from({ length: n }, (_, i) => ({ id: `run-${i}`, test: 'Quick Check', createdAt: '2026-01-01T00:00:00Z',
    measurements: Array.from({ length: 40 }, (_, k) => ({ metricId: `m${k}`, value: i + k / 10, unit: 'dB', label: `Metric ${k} ${'ü'.repeat(k % 5)}` })),
    findings: [{ title: 'x'.repeat(200), severity: 'review', possibleCauses: ['a', 'b'] }] }));
  const out = measure(`workspace import ${n} runs`, () => workspaceToImportPayload({ version: 1, equipment: [], runs }), { budgetMs: FULL ? 20_000 : 8_000, budgetMb: FULL ? 2000 : 900 });
  assert.equal(out.runs.length, n);
});

test('stress: canonical JSON of a 5 MB certificate-sized payload is stable', () => {
  const big = { items: Array.from({ length: FULL ? 50_000 : 10_000 }, (_, i) => ({ id: i, name: `unit ${i} é`, values: [i, -i, i * 3], ok: i % 2 === 0 })) };
  const a = measure('canonicalJson large', () => canonicalJson(big), { budgetMs: 15_000, budgetMb: 1200 });
  assert.equal(canonicalJson(JSON.parse(a)), a);
});

test.after(() => { console.log(`STRESS-SUMMARY ${JSON.stringify(results)}`); });
