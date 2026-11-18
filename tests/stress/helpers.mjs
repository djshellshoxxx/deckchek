// Stress helpers (nightly CI: DECKCHEK_STRESS=full; default sizes are a quick local check).
// Keep each workload in its own .test.mjs file: Node's test runner gives each file a
// fresh process, so the process-lifetime RSS high-water mark belongs to that workload.
import test from 'node:test';
import assert from 'node:assert/strict';

export const FULL = process.env.DECKCHEK_STRESS === 'full';
const results = [];

export function measure(name, fn, { budgetMs, budgetMb }) {
  globalThis.gc?.();
  const rss0 = process.memoryUsage().rss;
  const t0 = performance.now();
  const out = fn();
  const ms = performance.now() - t0;
  // These workloads are synchronous, so an interval cannot sample their intermediate
  // allocations. The kernel high-water mark captures them, including fixture setup.
  const peak = Math.max(rss0, process.memoryUsage().rss, process.resourceUsage().maxRSS * 1024);
  const r = { name, ms: Math.round(ms), peakMb: Math.round(peak / 1e6), budgetMs, budgetMb };
  results.push(r);
  console.log(`STRESS ${JSON.stringify(r)}`);
  assert.ok(ms <= budgetMs, `${name}: ${Math.round(ms)} ms > budget ${budgetMs} ms`);
  assert.ok(peak / 1e6 <= budgetMb, `${name}: peak ${Math.round(peak / 1e6)} MB > budget ${budgetMb} MB`);
  return out;
}

export function tone(seconds, sampleRate = 48000) {
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

test.after(() => { console.log(`STRESS-SUMMARY ${JSON.stringify(results)}`); });
