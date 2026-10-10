// FS-14 guided flow controller (app/ui/workflows/scratch.js): protocol phase maths, trace downsampling,
// baseline gate, metronome silence on abort (AC-7), mute, partial scoring and saving, with fake capture/audio/clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quadratureTimecode } from './fixtures/signals.mjs';
import { patternVelocity, sequence } from './fixtures/scratch-patterns.mjs';
import { findFormat, directionSign } from '../app/timecode.js';
import { PROTOCOL_V1, protocolTimeline, createScratchApi } from '../app/scratch.js';
import { phaseAt, downsampleTrace, levelDbFromLevels, liveLock, createScratchRunner, SKIP_CALIBRATION, METRONOME_LEAD_SEC, BASELINE_SEC } from '../app/ui/workflows/scratch.js';

test('phaseAt follows count-in, perform and rest windows of every pattern', () => {
  const bpm = 120, tl = protocolTimeline(bpm), beat = 0.5;
  assert.equal(phaseAt(bpm, -0.4).phase, 'lead');
  const a = phaseAt(bpm, 0.1);
  assert.deepEqual([a.phase, a.index, a.beat], ['countin', 0, -4]);
  assert.equal(phaseAt(bpm, 3 * beat + 0.01).beat, -1);
  const b = phaseAt(bpm, tl.patterns[0].performStart + 2.2 * beat);
  assert.deepEqual([b.phase, b.beat], ['perform', 2]);
  assert.ok(Math.abs(b.beatFrac - 0.2) < 1e-9);
  assert.equal(phaseAt(bpm, tl.patterns[0].performEnd + 0.1).phase, 'rest');
  assert.equal(phaseAt(bpm, tl.patterns[1].countInStart + 0.01).index, 1);
  assert.equal(phaseAt(bpm, tl.patterns[2].performStart + 1).index, 2);
  const end = phaseAt(bpm, tl.totalSec + 1);
  assert.deepEqual([end.phase, end.overall], ['done', 1]);
  const mid = phaseAt(bpm, tl.totalSec / 2);
  assert.ok(Math.abs(mid.overall - 0.5) < 1e-9);
});

test('downsampleTrace keeps spikes and bounds the size', () => {
  const n = 10000, t = new Float64Array(n), v = new Float64Array(n);
  for (let i = 0; i < n; i++) { t[i] = i / 400; v[i] = Math.sin(i / 50); }
  v[5003] = 4; v[7001] = -4;
  const d = downsampleTrace({ t, v }, 600);
  assert.ok(d.t.length <= 600 && d.t.length === d.v.length);
  assert.ok(d.v.includes(4) && d.v.includes(-4));
  assert.ok(d.t.every((x, i) => i === 0 || x >= d.t[i - 1]), 'time stays monotonic');
  const small = downsampleTrace({ t: [0, 1], v: [NaN, 2] }, 600);
  assert.deepEqual(small.v, [0, 2]);
});

test('live lock indicator uses the engine drop threshold relative to the baseline', () => {
  assert.equal(levelDbFromLevels({ rmsL: 0.1, rmsR: 0.05 }).toFixed(2), '-26.02');
  assert.equal(levelDbFromLevels({ rmsL: 0, rmsR: 0.1 }), -Infinity);
  assert.equal(liveLock(-20, -9), 'ok');
  assert.equal(liveLock(-22, -9), 'low');
  assert.equal(liveLock(-22, NaN), 'unknown');
  assert.equal(SKIP_CALIBRATION.calibrated, false);
});

// ---------- fakes ----------
function fakeClock() {
  let now = 0, id = 0; const pending = new Map();
  const timers = {
    setTimeout(fn, ms) { pending.set(++id, { fn, at: now + ms, every: null }); return id; },
    setInterval(fn, ms) { pending.set(++id, { fn, at: now + ms, every: ms }); return id; },
    clearTimeout(i) { pending.delete(i); }, clearInterval(i) { pending.delete(i); },
  };
  const flush = async () => { for (let k = 0; k < 12; k++) await Promise.resolve(); };
  const advance = async (ms) => {
    await flush();
    const end = now + ms;
    for (;;) {
      let nextId = null, nextAt = Infinity;
      for (const [i, p] of pending) if (p.at <= end && p.at < nextAt) { nextId = i; nextAt = p.at; }
      if (nextId === null) break;
      now = nextAt; const p = pending.get(nextId);
      if (p.every) p.at += p.every; else pending.delete(nextId);
      p.fn();
      await flush();
    }
    now = end;
    await flush();
  };
  return { timers, perf: () => now, advance };
}
function fakeCtx(clock) {
  const gain = { events: [], value: 1, setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; }, linearRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); this.value = v; }, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} };
  const ctx = {
    get currentTime() { return clock.perf() / 1000; }, destination: {}, closed: false, gains: [gain], oscillators: [],
    createGain() { return { gain, connect() {}, disconnect() {} }; },
    createOscillator() { const o = { frequency: { value: 0 }, stops: [], connect() {}, start() {}, stop(t) { this.stops.push(t); } }; ctx.oscillators.push(o); return o; },
    resume: async () => {}, close: async () => { ctx.closed = true; },
  };
  return ctx;
}
const SR = 48000;
function sig(seconds, velocityProfile, fmtName = 'Serato CV02.5') {
  const fmt = findFormat(fmtName);
  return quadratureTimecode({ carrierHz: fmt.carrierHz, phaseSign: directionSign(fmt), seconds, sampleRate: SR, velocityProfile, snrDb: 30, seed: 5 });
}
function fakeCapture(audios) {
  const calls = [];
  const fn = async (opts) => { calls.push(opts); const audio = audios.shift(); return { async stop() { return { audio: { ...audio, durationSec: audio.left.length / SR } }; }, async cancel() { fn.cancelled = (fn.cancelled || 0) + 1; } }; };
  fn.calls = calls; return fn;
}
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

async function settle(t) { for (let k = 0; k < 5; k++) { await t.clock.advance(5); await new Promise(r => setImmediate(r)); } }

function setup({ audios, bpm = 120 }) {
  const clock = fakeClock(), ctx = fakeCtx(clock), capture = fakeCapture(audios), api = createScratchApi({ invoke: null, storage: memStorage() });
  const states = [];
  const runner = createScratchRunner({ capture, createAudioContext: () => ctx, api, perf: clock.perf, timers: clock.timers, onChange: s => states.push(s.phase) });
  const config = { format: 'Serato CV02.5', bpm, deviceName: 'X', levelDbfs: -24, sinkId: '', cartridgeAssetId: 'c1', setupId: null, trackingForceG: 2, tonearmNote: null };
  return { clock, ctx, capture, api, runner, states, config };
}

test('baseline gate: a clean 3 s needle-down passes; a weak carrier is refused with fix actions (AC-8)', async () => {
  const p = setup({ audios: [sig(3, 1)] });
  const run = p.runner.runBaseline(p.config);
  await p.clock.advance(BASELINE_SEC * 1000 + 300);
  await run;
  assert.equal(p.runner.state.phase, 'ready');
  assert.ok(p.runner.state.baseline.snrDb >= 25);

  const noisy = sig(3, 1);
  const g = 0.002;
  for (let i = 0; i < noisy.left.length; i++) { noisy.left[i] *= g; noisy.right[i] *= g; }
  const w = setup({ audios: [noisy] });
  const r = w.runner.runBaseline(w.config);
  await w.clock.advance(3300); await r;
  // a uniformly quiet clean carrier still has high SNR, so also require the refusal path with a dead channel
  const dead = sig(3, 1); dead.right.fill(0);
  const d = setup({ audios: [dead] });
  const rd = d.runner.runBaseline(d.config);
  await d.clock.advance(3300); await rd;
  assert.equal(d.runner.state.phase, 'baseline-failed');
  assert.ok(d.runner.state.baseline.reasons.length > 0 && d.runner.state.baseline.reasons.every(x => x.action));
});

test('abort silences the metronome synchronously and scores completed patterns only (AC-7)', async () => {
  const bpm = 120, tl = protocolTimeline(bpm);
  // capture timeline: the runner starts clicks METRONOME_LEAD_SEC after capture start
  const lead = METRONOME_LEAD_SEC;
  const parts = tl.patterns.map(p => ({ fn: patternVelocity(p.id, bpm, { seconds: 20 }).velocity, from: p.performStart + lead, to: p.performEnd + lead }));
  const seconds = lead + tl.patterns[0].restEnd + 1;           // only the first pattern is complete
  const run = sig(seconds, sequence(parts));
  const t = setup({ audios: [sig(3, 1), run], bpm });
  const b = t.runner.runBaseline(t.config); await t.clock.advance(3300); await b;
  assert.equal(t.runner.state.phase, 'ready');
  await t.runner.begin();
  assert.equal(t.runner.state.phase, 'running');
  assert.equal(t.capture.calls.at(-1).maxSeconds >= Math.ceil(tl.totalSec), true);
  await t.clock.advance(1500);
  assert.ok(t.ctx.oscillators.length >= 2, 'clicks are being scheduled');
  // M mutes without stopping the schedule
  assert.equal(t.runner.toggleMute(), true);
  assert.equal(t.ctx.gains[0].events.at(-1)[1], 0);
  assert.equal(t.runner.toggleMute(), false);
  await t.clock.advance(tl.patterns[0].restEnd * 1000 + 2000);   // into the second pattern
  const before = t.ctx.gains[0].events.length, nowSec = t.ctx.currentTime;
  assert.equal(t.runner.abort(), true);
  // synchronously after abort(): master gain ramped to 0 within 100 ms, schedule cancelled
  const tail = t.ctx.gains[0].events.slice(before);
  const ramp = tail.find(e => e[0] === 'ramp' && e[1] === 0);
  assert.ok(ramp && ramp[2] - nowSec <= 0.1, 'gain reaches 0 within 100 ms of abort');
  assert.ok(t.runner.state.mutedAtMs - t.runner.state.abortAtMs < 100);
  assert.equal(t.runner.abort(), false, 'second abort is a no-op');
  await settle(t);
  const s = t.runner.state;
  assert.equal(s.phase, 'done');
  assert.equal(s.aborted, true);
  assert.equal(s.result.completed, false);
  assert.equal(s.result.patterns.length, 1);
  assert.equal(s.result.patterns[0].id, 'baby');
  assert.ok(s.result.score > 0);
  assert.ok(s.saved?.id, 'partial run is stored');
  assert.equal((await t.api.list()).length, 1);
  assert.equal((await t.api.list())[0].completed, false);
  assert.ok(s.plot.t.length > 100 && t.ctx.closed);
});

test('abort before any pattern completes stores nothing', async () => {
  const t = setup({ audios: [sig(3, 1), sig(4, 1)] });
  const b = t.runner.runBaseline(t.config); await t.clock.advance(3300); await b;
  await t.runner.begin();
  await t.clock.advance(1500);
  t.runner.abort();
  await settle(t);
  assert.equal(t.runner.state.phase, 'done');
  assert.equal(t.runner.state.result.patterns.length, 0);
  assert.equal(t.runner.state.saved, null);
  assert.equal((await t.api.list()).length, 0);
});

test('capture failure surfaces as an error state and the metronome never starts', async () => {
  const clock = fakeClock(), ctx = fakeCtx(clock);
  const runner = createScratchRunner({ capture: async () => { throw new Error('Input is busy'); }, createAudioContext: () => ctx, api: createScratchApi({ invoke: null, storage: memStorage() }), perf: clock.perf, timers: clock.timers });
  await runner.runBaseline({ format: 'Serato CV02.5', bpm: 90, levelDbfs: -24 });
  assert.equal(runner.state.phase, 'error');
  assert.match(runner.state.error, /busy/);
  runner.reset();
  assert.equal(runner.state.phase, 'setup');
});

test('Esc during the baseline cancels the capture and returns to setup', async () => {
  const t = setup({ audios: [sig(3, 1)] });
  const b = t.runner.runBaseline(t.config); await t.clock.advance(1000);
  assert.equal(t.runner.state.phase, 'baseline');
  assert.equal(t.runner.abort(), true);
  await Promise.resolve();
  assert.equal(t.runner.state.phase, 'setup');
  assert.equal(t.capture.cancelled, 1);
  void b;
});
