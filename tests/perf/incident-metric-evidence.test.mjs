// The existing FS-31 10-minute / 5 ms / 10 MB proxy, through the actual
// controller including its bounded observation copy. No hardware CPU claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonitorController } from '../../app/monitor.js';
import { createIncidentDraft } from '../../app/venue-incidents.js';
import { quadratureTimecode } from '../fixtures/signals.mjs';

const SR = 48000, HOP = SR / 4, TOTAL = 10 * 60 * 4, WARMUP = 60 * 4;
const BUDGET_MS = process.env.DECKCHEK_PERF_STRICT === '1' ? 1 : 5;
function heapMb() { globalThis.gc?.(); globalThis.gc?.(); return process.memoryUsage().heapUsed / 1048576; }

test(`controller metadata proxy: 10 min at 48 kHz, mean < ${BUDGET_MS} ms/hop and retained heap growth < 10 MB`, async t => {
  const chunk = quadratureTimecode({ carrierHz: 1000, sampleRate: SR, seconds: 10, snrDb: 30, seed: 31 });
  let block, starts = 0, stops = 0;
  const controller = createMonitorController({
    startStream: async args => { starts++; block = args.onBlock; return { info: { deviceName: 'Performance fixture', sampleRate: SR }, async stop() { stops++; } }; },
    timers: { setInterval() {}, clearInterval() {}, clearTimeout() {} },
  });
  t.after(() => controller.stop());
  await controller.start({ deviceName: 'Performance fixture', format: 'Serato CV02.5', decks: [{ deck: 'A', pair: 1 }] });
  const perChunk = chunk.left.length / HOP;
  let warmHeap = 0, busy = 0, measured = 0, worst = 0;
  for (let k = 0; k < TOTAL; k++) {
    const offset = k % perChunk * HOP;
    if (k === WARMUP) warmHeap = heapMb();
    const start = performance.now();
    block({ sampleRate: SR, frames: HOP, quality: { droppedBlocks: 0 }, pairs: [{ left: chunk.left.subarray(offset, offset + HOP), right: chunk.right.subarray(offset, offset + HOP) }] });
    const elapsed = performance.now() - start;
    if (k >= WARMUP) { busy += elapsed; measured++; worst = Math.max(worst, elapsed); }
  }
  const mean = busy / measured, growth = heapMb() - warmHeap;
  console.log(`incident snapshot controller perf: ${TOTAL} hops, mean ${mean.toFixed(3)} ms/hop, worst ${worst.toFixed(2)} ms, heap growth ${growth.toFixed(2)} MB${globalThis.gc ? '' : ' (approximate without --expose-gc)'}`);
  assert.ok(mean < BUDGET_MS, `mean ${mean} ms exceeds ${BUDGET_MS} ms`);
  assert.ok(growth < 10, `retained heap grew ${growth} MB`);
  assert.equal(controller.perf().blocks, TOTAL);
  const sources = controller.metricSources(); assert.equal(sources.length, 1);
  const incident = createIncidentDraft({ kind: 'other', venue: { id: 'perf-venue', name: 'Fixture' } });
  const snapshot = controller.metricSnapshot(sources[0].source, incident);
  assert.ok(new TextEncoder().encode(JSON.stringify(snapshot)).length < 32768);
  assert.equal(starts, 1); assert.equal(stops, 0, 'the snapshot has no capture side effect');
  assert.equal(controller.events.list().filter(event => event.severity === 'critical').length, 0);
});
