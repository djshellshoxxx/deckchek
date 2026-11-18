// FS-31 AC-6 automated proxy (DEVELOPMENT-PLAN §5.5): 10 min of synthetic 48 kHz stereo timecode through createMonitor
// in 250 ms hops. Asserts the mean processing time per hop and that the heap does not grow after warm-up (ring buffers,
// capped logs: memory must stay flat for multi-hour sessions).
//
// Run: node --test tests/perf/*.test.mjs          (lenient budget, the CI default: mean < 5 ms per hop, heap growth < 10 MB)
//      DECKCHEK_PERF_STRICT=1 node --expose-gc --test tests/perf/*.test.mjs  (owner PC: mean < 1 ms, i.e. < 0.4 % of one core)
// The real CPU budget (< 2 % of one core over 2 h) is measured by hand in H-31 step 9.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quadratureTimecode } from '../fixtures/signals.mjs';
import { createMonitor, createEventLog } from '../../app/monitor.js';

const SR = 48000, HOP = SR / 4, MINUTES = 10;
const STRICT = process.env.DECKCHEK_PERF_STRICT === '1';
const BUDGET_MS = STRICT ? 1 : 5;
const HEAP_MB = 10;

function heapMb() {
  if (typeof globalThis.gc === 'function') { globalThis.gc(); globalThis.gc(); }
  return process.memoryUsage().heapUsed / 1048576;
}

test(`AC-6 proxy: ${MINUTES} min of 48 kHz stereo, mean time per 250 ms hop < ${BUDGET_MS} ms and heap flat (< ${HEAP_MB} MB growth)`, () => {
  // 10 s of timecode with noise and a little wow, looped: 10 s x 1 kHz is a whole number of cycles, so the loop is seamless
  const chunk = quadratureTimecode({ carrierHz: 1000, sampleRate: SR, seconds: 10, snrDb: 30, velocityProfile: t => 1 + 0.001 * Math.sin(2 * Math.PI * 0.5 * t), seed: 31 });
  const deckA = createMonitor({ format: 'Serato CV02.5', deck: 'A' });
  const log = createEventLog(500);
  const hopsPerChunk = chunk.left.length / HOP;
  const total = MINUTES * 60 * 4;
  const warmup = 4 * 60; // 1 min
  let busy = 0, measured = 0, worst = 0, heapAfterWarmup = 0, frames = 0;
  for (let k = 0; k < total; k++) {
    const o = (k % hopsPerChunk) * HOP;
    const l = chunk.left.subarray(o, o + HOP), r = chunk.right.subarray(o, o + HOP);
    if (k === warmup) heapAfterWarmup = heapMb();
    const t0 = performance.now();
    const frame = deckA.push(l, r, SR);
    for (const a of deckA.alerts(frame)) log.add(a);
    const dt = performance.now() - t0;
    if (k >= warmup) { busy += dt; measured++; worst = Math.max(worst, dt); }
    frames++;
  }
  const heapEnd = heapMb();
  const mean = busy / measured;
  const growth = heapEnd - heapAfterWarmup;
  console.log(`monitor perf: ${frames} hops, mean ${mean.toFixed(3)} ms/hop (${(mean / 250 * 100).toFixed(2)} % of one core), worst ${worst.toFixed(2)} ms, heap growth ${growth.toFixed(2)} MB${typeof globalThis.gc === 'function' ? '' : ' (no --expose-gc: approximate)'}`);
  assert.ok(mean < BUDGET_MS, `mean ${mean.toFixed(3)} ms per hop exceeds ${BUDGET_MS} ms`);
  assert.ok(growth < HEAP_MB, `heap grew ${growth.toFixed(2)} MB after warm-up`);
  assert.equal(deckA.summary().frames, total);
  assert.equal(deckA.summary().alerts.critical, 0, 'healthy signal: no critical alarms over 10 min');
});
