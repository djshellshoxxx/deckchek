import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  stepPlan, limiter, rampToSilence, welchSpectrum, analyzeSpectrum, spectrumFrame, detectHowl, feedbackGuidance,
  createFeedbackTest, feedbackRunInput, START_DBFS, STEP_DB, DEFAULT_CAP_DBFS, MIN_STEP_DWELL_MS, NO_INPUT_MS, INACTIVITY_MS,
  GROWTH_DB, PEAK_TO_MEDIAN_DB, WINDOW_SEC,
} from '../app/feedback.js';
import { createAudioOut, ABS_MAX_DBFS } from '../app/audio-out.js';
import { howlGrowth, rng, whiteNoise, gaussian } from './fixtures/signals.mjs';

const CONTRACT = JSON.parse(readFileSync(new URL('./contracts/humrun.json', import.meta.url), 'utf8'));
const FS = 48000;
const amp = db => 10 ** (db / 20);

// ---------- plan ----------

test('stepPlan defaults: -60 dBFS start, 3 dB steps, -30 dBFS cap (AC-4)', () => {
  const p = stepPlan();
  assert.equal(p.startDbfs, START_DBFS);
  assert.equal(p.stepDb, STEP_DB);
  assert.equal(p.capDbfs, DEFAULT_CAP_DBFS);
  assert.deepEqual(p.levels, [-60, -57, -54, -51, -48, -45, -42, -39, -36, -33, -30]);
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.levels));
});

test('stepPlan never exceeds the cap or the -12 dBFS absolute cap', () => {
  assert.equal(stepPlan({ capDbfs: 0 }).capDbfs, ABS_MAX_DBFS);
  assert.equal(Math.max(...stepPlan({ capDbfs: 0 }).levels), -12);
  assert.deepEqual(stepPlan({ startDbfs: -20, capDbfs: -30 }).levels, [-30], 'a start above the cap starts at the cap');
  assert.deepEqual(stepPlan({ startDbfs: -40, stepDb: 4, capDbfs: -31 }).levels, [-40, -36, -32]);
  assert.equal(stepPlan({ startDbfs: -200 }).startDbfs, -90);
  for (const bad of [{ stepDb: 0.99 }, { stepDb: 6.01 }, { stepDb: NaN }, { startDbfs: NaN }, { capDbfs: Infinity }, { capDbfs: NaN }])
    assert.throws(() => stepPlan(bad), RangeError, JSON.stringify(bad));
  assert.doesNotThrow(() => stepPlan({ stepDb: 1 }));
  assert.doesNotThrow(() => stepPlan({ stepDb: 6 }));
});

test('property: random plans stay under min(cap, -12) and rise by exactly stepDb', () => {
  const r = rng(42);
  for (let i = 0; i < 200; i++) {
    const cap = -80 + r() * 100, start = -100 + r() * 120, step = 1 + r() * 5;
    const p = stepPlan({ startDbfs: start, stepDb: step, capDbfs: cap });
    const lim = Math.min(cap, -12);
    assert.ok(p.levels.length >= 1);
    for (const l of p.levels) assert.ok(l <= lim + 1e-9, `${l} > ${lim}`);
    for (let k = 1; k < p.levels.length; k++) assert.ok(Math.abs(p.levels[k] - p.levels[k - 1] - step) < 0.011);
  }
});

// ---------- limiter ----------

test('property: limiter never exceeds the cap for adversarial buffers', () => {
  const g = gaussian(7), r = rng(8);
  for (let i = 0; i < 200; i++) {
    const cap = r() < 0.2 ? r() * 20 : -60 + r() * 50;
    const lim = 10 ** (Math.min(cap, -12) / 20);
    const buf = new Float64Array(512);
    for (let k = 0; k < buf.length; k++) {
      const c = r();
      buf[k] = c < 0.05 ? NaN : c < 0.1 ? Infinity : c < 0.15 ? -Infinity : c < 0.2 ? 1e30 : g() * 10 ** (r() * 6 - 3);
    }
    const out = limiter(buf, cap);
    for (const v of out) assert.ok(Math.abs(v) <= lim && Number.isFinite(v), `${v} > ${lim}`);
  }
  assert.deepEqual([...limiter([0.001, -0.001], -30)].map(v => Math.round(v * 1e6)), [1000, -1000], 'quiet samples pass unchanged');
  assert.equal(limiter(null).length, 0);
});

// ---------- spectrum ----------

const sine = (hz, dbfs, n, phase = 0) => { const o = new Float32Array(n), a = amp(dbfs), w = 2 * Math.PI * hz / FS; for (let i = 0; i < n; i++) o[i] = a * Math.sin(w * i + phase); return o; };

test('welchSpectrum reads a bin-centred sine at its peak dBFS; peak frequency interpolated', () => {
  const bin = FS / 8192, hz = 11 * bin;
  const sp = welchSpectrum(sine(hz, -20, FS), FS);
  assert.equal(sp.nfft, 8192);
  assert.ok(sp.segments >= 10);
  const a = analyzeSpectrum(sp);
  assert.ok(Math.abs(a.peakDb + 20) < 0.05, String(a.peakDb));
  assert.ok(Math.abs(a.peakHz - hz) < 0.1);
  assert.ok(Math.abs(a.totalDb + 20) < 0.2, `total ${a.totalDb}`);
  assert.equal(a.narrow, true);
  const off = analyzeSpectrum(welchSpectrum(sine(63, -20, FS), FS));
  assert.ok(Math.abs(off.peakHz - 63) < 1, String(off.peakHz));
  assert.ok(off.peakDb < -20 + 0.01 && off.peakDb > -21.6, 'Hann scalloping < 1.5 dB');
  assert.throws(() => welchSpectrum(new Float32Array(100), FS), RangeError);
  assert.equal(welchSpectrum(new Float32Array(3000), FS).nfft, 2048);
});

test('analyzeSpectrum: white noise is not a narrowband peak', () => {
  const a = analyzeSpectrum(welchSpectrum(whiteNoise(FS, 0.01, 3), FS));
  assert.ok(a.peakToMedianDb < PEAK_TO_MEDIAN_DB, String(a.peakToMedianDb));
  assert.ok(Math.abs(a.snrDb) < 3);
});

// ---------- howl detector ----------

const framesOf = (samples, { levelDbfs = -40, startSec = 0 } = {}) => {
  const out = [];
  for (let s = 0; s + FS <= samples.length; s += FS) out.push(spectrumFrame(samples.subarray(s, s + FS), FS, { tSec: startSec + (s + FS) / FS, levelDbfs }));
  return out;
};

test('detectHowl fires on the synthetic exponential howl (howlGrowth fixture)', () => {
  const h = howlGrowth({ hz: 63, startDbfs: -70, growthDbPerSec: 8, capDbfs: -3, seconds: 3, noiseDbfs: -90 });
  const d = detectHowl(framesOf(h.samples));
  assert.equal(d.onset, true);
  assert.equal(d.reason, 'narrowbandGrowth');
  assert.ok(Math.abs(d.freqHz - 63) < 2, String(d.freqHz));
  assert.ok(Math.abs(d.growthDbPerS - 8) < 1, String(d.growthDbPerS));
  const fast = howlGrowth({ hz: 2000, startDbfs: -60, growthDbPerSec: 30, capDbfs: -3, seconds: 3, noiseDbfs: -90 });
  assert.equal(detectHowl(framesOf(fast.samples).slice(0, 3)).onset, true);
});

test('detectHowl stays quiet for slow growth, a steady tone and music', () => {
  const slow = howlGrowth({ hz: 63, startDbfs: -70, growthDbPerSec: 2, seconds: 3, noiseDbfs: -90 });
  assert.equal(detectHowl(framesOf(slow.samples)).onset, false, '4 dB over 2 s is below the 6 dB criterion');
  const steady = sine(63, -30, 3 * FS); const n = whiteNoise(3 * FS, 1e-4, 5); for (let i = 0; i < steady.length; i++) steady[i] += n[i];
  assert.equal(detectHowl(framesOf(steady)).onset, false);
  // music-like: random notes every 250 ms with decaying envelopes plus a beat
  const r = rng(11), music = new Float32Array(6 * FS), scale = [110, 131, 147, 165, 196, 220, 262, 294, 330, 392];
  for (let note = 0; note < 24; note++) {
    const f = scale[Math.floor(r() * scale.length)], a = amp(-30 + r() * 12), s0 = note * FS / 4;
    for (let i = 0; i < FS && s0 + i < music.length; i++) music[s0 + i] += a * Math.exp(-i / (FS * 0.3)) * Math.sin(2 * Math.PI * f * i / FS);
  }
  for (let b = 0; b < 12; b++) { const s0 = b * FS / 2; for (let i = 0; i < 2400; i++) music[s0 + i] += amp(-24) * Math.exp(-i / 400) * Math.sin(2 * Math.PI * 55 * i / FS); }
  const frames = framesOf(music);
  for (let k = 3; k <= frames.length; k++) assert.equal(detectHowl(frames.slice(0, k)).onset, false, `music frame ${k}`);
});

/** Hand-made frames for exact threshold tests: a narrow peak at bin 11 on a flat -100 dB floor. */
function frame(peakDb, { tSec = 1, levelDbfs = -40, levelStable = true, floor = -100, totalDb, snrDb = 30 } = {}) {
  const db = new Float64Array(4097).fill(floor); db[11] = peakDb;
  return { tSec, levelDbfs, levelStable, binHz: FS / 8192, db, peakBin: 11, peakHz: 11 * FS / 8192, peakDb, medianDb: floor, peakToMedianDb: peakDb - floor, widthBins: 1, narrow: true, totalDb: totalDb ?? peakDb, snrDb };
}

test('detectHowl narrowband criterion boundaries (AC-5: > 6 dB over two consecutive 1 s windows)', () => {
  const run = (a, b, c, o = {}) => detectHowl([frame(a, { tSec: 1, ...o }), frame(b, { tSec: 2, ...o }), frame(c, { tSec: 3, ...o })]);
  assert.equal(GROWTH_DB, 6);
  assert.equal(run(-60, -57, -54).onset, false, 'exactly 6 dB is not > 6');
  assert.equal(run(-60, -57, -53.99).onset, true);
  assert.equal(run(-60, -50, -50.5).onset, false, 'must grow in both windows');
  assert.equal(run(-60, -60, -50).onset, false, 'must grow in both windows');
  const ok = run(-60, -55, -50);
  assert.equal(ok.growthDbPerS, 5);
  assert.equal(detectHowl([frame(-60, { tSec: 1 }), frame(-55, { tSec: 2, levelStable: false }), frame(-50, { tSec: 3 })]).onset, false, 'output changed inside a window');
  // growth is judged relative to the output level: the user's own steps cancel
  assert.equal(detectHowl([frame(-60, { tSec: 1, levelDbfs: -46, snrDb: 0 }), frame(-57, { tSec: 2, levelDbfs: -43, snrDb: 0 }), frame(-54, { tSec: 3 })]).onset, false, 'linear loop across steps');
  assert.equal(detectHowl([frame(-60, { tSec: 1, levelDbfs: -43, snrDb: 0 }), frame(-55, { tSec: 2 }), frame(-50, { tSec: 3 })]).onset, true, '7 dB of loop growth beyond the 3 dB step');
  // slower runaway growth over a longer run of windows (sustainedGrowth)
  const slow = [-60, -57.9, -55.8, -53.7].map((d, i) => frame(d, { tSec: i + 1 }));
  assert.equal(detectHowl(slow.slice(0, 3)).onset, false);
  assert.equal(detectHowl(slow).reason, 'sustainedGrowth');
  assert.ok(Math.abs(detectHowl(slow).growthDbPerS - 2.1) < 1e-9);
  assert.equal(detectHowl([frame(-62, { tSec: 1 }), frame(-60, { tSec: 2 }), frame(-60.5, { tSec: 3 }), frame(-57, { tSec: 4 }), frame(-53.9, { tSec: 5 })]).onset, true);
  assert.equal(detectHowl([frame(-62, { tSec: 1 }), frame(-57, { tSec: 2 }), frame(-57.5, { tSec: 3 }), frame(-55, { tSec: 4 }), frame(-53.6, { tSec: 5 })]).onset, false, 'run restarts after a dip');
  assert.equal(detectHowl([frame(-60, { tSec: 1 }), frame(-57, { tSec: 5 }), frame(-53, { tSec: 6 })]).onset, false, 'a gap breaks the run');
  const moved = frame(-55, { tSec: 2 }); moved.peakBin = 20;
  assert.equal(detectHowl([frame(-60, { tSec: 1 }), moved, frame(-50, { tSec: 3 })]).onset, false, 'peak must already dominate the previous window');
  // peak-to-median boundary: > 15 dB
  assert.equal(run(-95, -90, -85, { floor: -100 }).onset, false, 'peak exactly 15 dB above the median');
  assert.equal(detectHowl([frame(-95, { floor: -100, tSec: 1 }), frame(-90, { floor: -100, tSec: 2 }), frame(-84.99, { floor: -100, tSec: 3 })]).onset, true);
  assert.equal(detectHowl([]).onset, false);
  assert.equal(detectHowl([frame(-50)]).onset, false);
});

test('detectHowl step-jump criterion: total rise > step + 6 dB after a level step', () => {
  const prev = o => frame(-50, { tSec: 1, levelDbfs: -45, totalDb: -50, ...o });
  const cur = total => frame(-50, { tSec: 2, levelDbfs: -42, totalDb: total });
  assert.equal(detectHowl([prev(), cur(-41)]).onset, false, '9 dB = step + 6 is not more');
  const d = detectHowl([prev(), cur(-40.99)]);
  assert.equal(d.onset, true);
  assert.equal(d.reason, 'stepJump');
  assert.equal(detectHowl([prev({ snrDb: 5.9 }), cur(-30)]).onset, false, 'test signal emerging from the noise is not a howl');
  assert.equal(detectHowl([prev({ levelStable: false }), cur(-30)]).onset, false);
});

test('feedbackGuidance: low vs mid frequency advice', () => {
  assert.match(feedbackGuidance(63).join(' '), /High-pass the booth monitor/);
  assert.match(feedbackGuidance(119.9).join(' '), /Decouple/);
  assert.match(feedbackGuidance(120).join(' '), /cardioid/);
  assert.deepEqual(feedbackGuidance(null), []);
});

// ---------- run controller ----------

/** Fake Tauri invoke behind the real audio-out bridge: records every IPC call and tracks the voice. */
function fakeAudio({ fail = {} } = {}) {
  const calls = [];
  let next = 1, playing = null, resolvePlay = null;
  const invoke = (name, args) => {
    calls.push([name, structuredClone(args)]);
    const f = fail[name];
    if (f === 'hang' && name === 'audio_play_tone') return new Promise(res => { resolvePlay = () => { playing = next; res({ handle: next++, levelDbfs: args.spec.levelDbfs, capDbfs: args.spec.capDbfs }); }; });
    if (f) return Promise.reject(f);
    if (name === 'audio_play_tone') { playing = next; return Promise.resolve({ handle: next++, levelDbfs: args.spec.levelDbfs, capDbfs: args.spec.capDbfs }); }
    if (name === 'audio_set_level') return playing === args.handle ? Promise.resolve({ handle: args.handle, levelDbfs: args.levelDbfs }) : Promise.reject('AUDIO_OUT_NOT_PLAYING: no such voice');
    if (name === 'audio_stop') { if (playing === args.handle) playing = null; return Promise.resolve(null); }
    if (name === 'audio_stop_all') { const n = playing ? 1 : 0; playing = null; return Promise.resolve(n); }
    return Promise.resolve(null);
  };
  return {
    audio: createAudioOut({ invoke }), calls,
    get playing() { return playing; },
    release: () => resolvePlay?.(),
    names: () => calls.map(c => c[0]),
    levels: () => calls.filter(c => c[0] === 'audio_set_level').map(c => c[1].levelDbfs),
  };
}

function clock() {
  let t = 0, fn = null, cleared = 0;
  return {
    now: () => t, advance: ms => { t += ms; }, tick: () => fn?.(),
    setInterval: f => { fn = f; return 1; }, clearInterval: () => { fn = null; cleared++; },
    get armed() { return fn !== null; }, get cleared() { return cleared; },
  };
}

/** Booth loop model: input = tone at (output + gain) dBFS; at/after onsetLevel it grows at growth dB/s. */
function booth({ hz = 63, gainDb = -8, onsetLevel = -42, growth = 10, noiseDbfs = -85, seed = 1 } = {}) {
  let phase = 0, t = 0, unstableSince = null;
  const g = gaussian(seed), w = 2 * Math.PI * hz / FS;
  return (levelDbfs, n) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let db = levelDbfs + gainDb;
      if (levelDbfs >= onsetLevel) { if (unstableSince === null) unstableSince = t; db += growth * (t - unstableSince); }
      out[i] = Math.min(0.5, amp(Math.min(db, -8))) * Math.sin(phase) + amp(noiseDbfs) * g();
      phase += w; t += 1 / FS;
    }
    return out;
  };
}

async function started(opts = {}) {
  const fa = fakeAudio(opts.audio), c = clock();
  const t = createFeedbackTest({ audio: fa.audio, now: c.now, setInterval: c.setInterval, clearInterval: c.clearInterval, ...opts.test });
  await t.start();
  return { fa, c, t };
}
const flush = () => new Promise(r => setImmediate(r));

/** Feeds 250 ms blocks for `ms`, advancing the clock; returns the first howl detection seen. */
function feed(t, c, src, ms) {
  let det = null;
  for (let k = 0; k < ms / 250; k++) {
    c.advance(250);
    const d = t.pushInput({ samples: src(t.snapshot().levelDbfs ?? -120, FS / 4), sampleRate: FS });
    if (d?.onset) det = d;
    c.tick();
    if (t.state !== 'running') break;
  }
  return det;
}

test('start plays the first planned level through audio_out, under the cap', async () => {
  const { fa, t } = await started({ test: { tone: { type: 'pinkband', freqHz: 63 } } });
  assert.equal(t.state, 'running');
  const [name, args] = fa.calls[0];
  assert.equal(name, 'audio_play_tone');
  assert.deepEqual(args.spec, { type: 'pinkband', freqHz: 63, levelDbfs: -60, capDbfs: -30, rampMs: 50 });
  assert.equal(t.snapshot().levelDbfs, -60);
  await assert.rejects(t.start(), /already running/);
});

test('levels rise only on confirmation, after the dwell, and stop at the cap (AC-4)', async () => {
  const { fa, c, t } = await started();
  assert.equal(fa.levels().length, 0, 'never auto-raises');
  c.advance(MIN_STEP_DWELL_MS - 1);
  assert.equal(t.nextStep().reason, 'dwell');
  c.advance(1);
  assert.deepEqual(t.nextStep(), { ok: true, levelDbfs: -57, stepIndex: 1 });
  for (let i = 0; i < 100; i++) { c.advance(MIN_STEP_DWELL_MS); t.pushInput({ samples: new Float32Array(10).fill(1e-4), sampleRate: FS }); t.nextStep(); }
  assert.deepEqual(fa.levels(), [-57, -54, -51, -48, -45, -42, -39, -36, -33, -30]);
  assert.equal(t.nextStep().reason, 'atCap');
  assert.equal(t.snapshot().atCap, true);
  for (const [name, args] of fa.calls) {
    if (name === 'audio_set_level') assert.ok(args.levelDbfs <= -30);
    if (name === 'audio_play_tone') assert.ok(args.spec.levelDbfs <= args.spec.capDbfs && args.spec.capDbfs <= -12);
  }
});

test('a hostile plan cannot push a request above the caps', async () => {
  const plan = { capDbfs: 0, levels: [-60, -20, 0, 6, 40, NaN] };
  const { fa, c, t } = await started({ test: { plan, minStepDwellMs: 0 } });
  for (let i = 0; i < 10; i++) { c.advance(1); t.pushInput({ samples: new Float32Array(10), sampleRate: FS }); t.nextStep(); }
  assert.ok(fa.calls[0][1].spec.capDbfs <= ABS_MAX_DBFS);
  for (const l of fa.levels()) assert.ok(l <= ABS_MAX_DBFS, String(l));
  assert.throws(() => createFeedbackTest({ audio: fa.audio, tone: { type: 'chirp', freqHz: 63 } }), RangeError);
  assert.throws(() => createFeedbackTest({ audio: fa.audio, plan: { levels: [] } }), RangeError);
  assert.throws(() => createFeedbackTest({}), TypeError);
});

test('howl onset aborts within the same call, stops output and records the onset (AC-5)', async () => {
  const { fa, c, t } = await started();
  const src = booth({ onsetLevel: -42, growth: 10 });
  let det = null;
  while (t.state === 'running' && !det) {
    det = feed(t, c, src, MIN_STEP_DWELL_MS);
    if (t.state === 'running') t.nextStep();
  }
  assert.equal(det?.onset, true);
  // the stop request is already on the IPC queue when pushInput returns (no await in between)
  assert.equal(fa.names().at(-1), 'audio_stop');
  assert.equal(t.state, 'stopping');
  await flush();
  assert.equal(t.state, 'stopped');
  assert.equal(fa.playing, null);
  const res = t.result();
  assert.equal(res.reason, 'howl');
  assert.equal(res.onset.levelDbfs, -42);
  assert.ok(Math.abs(res.onset.freqHz - 63) < 3, String(res.onset.freqHz));
  assert.ok(res.onset.growthDbPerS > 3);
  assert.equal(res.lastStableLevelDbfs, -45);
  assert.equal(res.loopGainMarginDb, 3);
  assert.match(res.guidance.join(' '), /High-pass/);
  // nothing reaches the output after the abort
  const after = fa.calls.length;
  c.advance(MIN_STEP_DWELL_MS);
  assert.equal(t.nextStep().reason, 'notRunning');
  assert.equal(t.pushInput({ samples: new Float32Array(100), sampleRate: FS }), null);
  assert.equal(fa.calls.length, after);
  // and the run saves in the contract shape
  const input = feedbackRunInput(res, { venueId: 'venue-1' });
  const expect = CONTRACT.commands.hum_run_save_feedback.request.input;
  assert.deepEqual(Object.keys(input), Object.keys(expect));
  const onsetStep = input.steps.find(s => s.onset);
  assert.equal(onsetStep.stepId, 'level_7');
  assert.equal(onsetStep.levelDbfs, -42);
  assert.ok(input.steps.every(s => s.levelDbfs <= -12));
  assert.match(input.verdict, /^Feedback onset at 6\d\.\d Hz on step 7 \(-42 dBFS\)\.$/);
});

test('a stable loop runs to the cap without a false onset; finish stops output', async () => {
  const { fa, c, t } = await started();
  const src = booth({ onsetLevel: 0 });
  for (let i = 0; i < 12; i++) { assert.equal(feed(t, c, src, MIN_STEP_DWELL_MS), null, `step ${i}`); t.nextStep(); }
  assert.equal(t.state, 'running');
  assert.equal(t.snapshot().levelDbfs, -30);
  t.finish();
  await flush();
  assert.equal(t.state, 'done');
  assert.equal(fa.playing, null);
  const res = t.result();
  assert.equal(res.onset, null);
  assert.equal(res.lastStableLevelDbfs, -30);
  assert.match(feedbackRunInput(res).verdict, /^No feedback up to -30 dBFS\.$/);
});

const ABORTS = {
  'STOP / Esc (AC-6)': async ({ t }) => { t.stop(); },
  'no input for more than 1 s': async ({ t, c }) => { c.advance(NO_INPUT_MS + 1); c.tick(); },
  '60 s without user action': async ({ t, c }) => { for (let s = 0; s <= INACTIVITY_MS; s += 500) { c.advance(500); t.pushInput({ samples: new Float32Array(10), sampleRate: FS }); c.tick(); } },
  'input clipping': async ({ t }) => { t.pushInput({ samples: Float32Array.of(0, 0.999), sampleRate: FS }); },
  'NaN input': async ({ t }) => { t.pushInput({ samples: Float32Array.of(NaN), sampleRate: FS }); },
  dispose: async ({ t }) => { t.dispose(); },
};
for (const [name, act] of Object.entries(ABORTS)) {
  test(`abort path stops output: ${name}`, async () => {
    const ctx = await started();
    const before = ctx.fa.names().length;
    await act(ctx);
    assert.ok(ctx.fa.names().slice(before).includes('audio_stop'), ctx.fa.names().join());
    assert.equal(ctx.fa.calls.find(x => x[0] === 'audio_stop')[1].handle, ctx.t.handle);
    await flush();
    assert.equal(ctx.fa.playing, null);
    assert.equal(ctx.t.state, 'stopped');
    assert.equal(ctx.c.armed, false, 'watchdog cleared');
  });
}

test('watchdog boundaries: exactly 1 s without input and exactly 60 s idle do not abort', async () => {
  const { c, t } = await started();
  c.advance(NO_INPUT_MS); c.tick();
  assert.equal(t.state, 'running');
  t.touch();
  for (let s = 0; s < INACTIVITY_MS; s += 500) { t.pushInput({ samples: new Float32Array(10), sampleRate: FS }); c.advance(500); c.tick(); }
  t.pushInput({ samples: new Float32Array(10), sampleRate: FS }); c.tick();
  assert.equal(t.state, 'running');
  c.advance(1); t.pushInput({ samples: new Float32Array(10), sampleRate: FS }); c.tick();
  assert.equal(t.result().reason, 'inactivity');
  const t2 = (await started()).t;
  t2.touch();
  assert.equal(t2.state, 'running');
});

test('output error on a level change aborts and stops output', async () => {
  const { fa, c, t } = await started({ audio: { fail: { audio_set_level: 'AUDIO_OUT_DEVICE: unplugged' } } });
  c.advance(MIN_STEP_DWELL_MS);
  t.nextStep();
  await flush();
  assert.equal(t.state, 'error');
  assert.equal(t.result().reason, 'outputError');
  assert.equal(t.result().error.code, 'AUDIO_OUT_DEVICE');
  assert.ok(fa.names().includes('audio_stop'));
});

test('failed stop falls back to stopAll; both failing never throws', async () => {
  const a = await started({ audio: { fail: { audio_stop: 'AUDIO_OUT_DEVICE: gone' } } });
  await a.t.stop();
  assert.deepEqual(a.fa.names().slice(-2), ['audio_stop', 'audio_stop_all']);
  assert.equal(a.t.state, 'stopped');
  const b = await started({ audio: { fail: { audio_stop: 'x', audio_stop_all: 'y' } } });
  const r = await b.t.stop();
  assert.equal(r.ok, false);
  assert.equal(b.t.state, 'stopped');
  const thrower = { stop() { throw new Error('sync'); }, stopAll: async () => 0 };
  assert.deepEqual(await rampToSilence(thrower, 3), { ok: true, method: 'stopAll' });
  assert.deepEqual(await rampToSilence({ stop: async () => {}, stopAll: async () => 1 }, null), { ok: true, method: 'stopAll' });
});

test('start failure leaves no output: stopAll and error state', async () => {
  const { fa, t } = await started({ audio: { fail: { audio_play_tone: 'AUDIO_OUT_DISABLED: output disabled after a fault' } } });
  assert.equal(t.state, 'error');
  assert.equal(t.result().error.code, 'AUDIO_OUT_DISABLED');
  assert.ok(fa.names().includes('audio_stop_all'));
});

test('STOP while the tone is still starting silences the voice as soon as it exists', async () => {
  const fa = fakeAudio({ fail: { audio_play_tone: 'hang' } }), c = clock();
  const t = createFeedbackTest({ audio: fa.audio, now: c.now, setInterval: c.setInterval, clearInterval: c.clearInterval });
  const p = t.start();
  assert.equal(t.state, 'starting');
  t.stop();
  assert.ok(fa.names().includes('audio_stop_all'), 'stopAll issued at once');
  fa.release();
  await p;
  await flush();
  assert.equal(fa.calls.filter(x => x[0] === 'audio_stop').at(-1)[1].handle, t.handle);
  assert.equal(fa.playing, null);
  assert.equal(t.state, 'stopped');
  assert.equal(c.armed, false);
});

test('stop is idempotent and a UI callback error cannot block it', async () => {
  const { fa, t } = await started({ test: { onChange: () => { throw new Error('ui'); } } });
  const a = t.stop(), b = t.stop();
  await Promise.all([a, b]);
  assert.equal(fa.names().filter(n => n === 'audio_stop').length, 1);
  assert.equal(t.state, 'stopped');
  t.finish();
  assert.equal(t.state, 'stopped');
});

test('frames are 1 s windows tagged with the playing level', async () => {
  const { c, t } = await started();
  assert.equal(WINDOW_SEC, 1);
  const src = booth({ onsetLevel: 0 });
  feed(t, c, src, 2000);
  const f = t.snapshot().lastFrame;
  assert.equal(f.levelDbfs, -60);
  assert.equal(f.tSec, 2);
  assert.ok(Math.abs(f.peakHz - 63) < 3);
});

test('property: seeded booth loops - every runaway is caught at its level, no stable loop false-fires', async () => {
  // 16 seeded cases (the full 480-case scan was run during development): input under, near and above the noise
  for (let seed = 1; seed <= 16; seed++) {
    const howl = seed % 2 === 0, gainDb = [-30, -8, 5][seed % 3], hz = [45, 63, 150, 1000][seed % 4];
    const onsetLevel = howl ? -60 + 3 * (seed % 10) : 0;
    const { c, t, fa } = await started({ test: { tone: { type: 'sine', freqHz: hz } } });
    const src = booth({ hz, gainDb, onsetLevel, growth: 3 + (seed % 8), seed });
    for (let s = 0; s < 12 && t.state === 'running'; s++) { feed(t, c, src, MIN_STEP_DWELL_MS); t.nextStep(); }
    const r = t.result(), label = JSON.stringify({ seed, howl, gainDb, hz, onsetLevel, reason: r.reason, onset: r.onset });
    if (howl) {
      assert.equal(r.reason, 'howl', label);
      assert.ok(r.onset.levelDbfs >= onsetLevel && r.onset.levelDbfs <= onsetLevel + 3, label);
      assert.ok(Math.abs(r.onset.freqHz - hz) < 6, label);
      await flush();
      assert.equal(fa.playing, null, label);
    } else assert.equal(r.reason, null, label);
    for (const l of fa.levels()) assert.ok(l <= DEFAULT_CAP_DBFS, label);
  }
});
