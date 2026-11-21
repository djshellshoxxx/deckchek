import test from 'node:test';
import assert from 'node:assert/strict';
import { runQualitySession, qualityResult, AudioSessionError, AQ_LEAD_MS } from '../app/devices/audio-session.js';
import { buildStimulus, analyzeAudioQuality } from '../app/audio-quality.js';
import { createAudioOut, ABS_MAX_DBFS } from '../app/audio-out.js';
import { CaptureBusyError, classifyCaptureError } from '../app/ui/audio-io.js';
import { dispatchFor, methodLabel } from '../app/devices/dispatch.js';
import { validateProfile } from '../app/devices/library.js';

const SR = 48000;
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

/** What a device recording at `rate` captures of the stimulus played at `levelDbfs` (gain, 211-sample delay). */
function recording(buffer, levelDbfs, { gain = 1, silent = false, rate = SR } = {}) {
  const amp = 10 ** (levelDbfs / 20) * gain, delay = 211;
  const src = rate === SR ? buffer : buildStimulus({ sampleRate: rate, playLevelDbfs: levelDbfs });
  const mk = s => { const o = new Float32Array(s.length + delay + 2 * rate); if (!silent) for (let i = 0; i < s.length; i++) o[i + delay] = s[i] * amp; return o; };
  return { left: mk(src.left), right: mk(src.right), sampleRate: rate };
}

/**
 * Fake audio_out + live capture. The capture is a startLiveSession-shaped session; `lease` models the
 * single capture lease (a second start while one is held is CAPTURE_BUSY). Hooks run inside the
 * session's waits: hooks.lead / hooks.play receive the capture options (onPreempted, onStatus, ...).
 */
function fakes({ gain = 1, silent = false, failPlay = false, rate = SR, startError = null, play = null, start = null, hooks = {}, lease = { held: false }, quality = {}, streamErrors = [], deviceName = 'Interface' } = {}) {
  const calls = { play: [], stop: [], stopAll: 0, capture: [], captureStops: 0, cancels: 0, order: [], waits: [] };
  let recorded = null, options = null;
  const out = {
    supported: true,
    async playBuffer(buffer, opts, extra) {
      calls.order.push('play'); calls.play.push({ buffer, opts, extra });
      if (failPlay) throw Object.assign(new Error('device busy'), { name: 'AudioOutError', code: 'AUDIO_OUT_DEVICE' });
      recorded = recording(buffer, opts.levelDbfs, { gain, silent, rate });
      return play ? play() : { handle: 7 };
    },
    async stop(h) { calls.order.push(`stop:${h}`); calls.stop.push(h); },
    async stopAll() { calls.stopAll++; return 3; },
  };
  const session = () => ({
    info: { sampleRate: rate, leaseId: 1, deviceName },
    async stop() {
      calls.captureStops++; calls.order.push('capture-stop'); lease.held = false;
      const audio = recorded || recording({ left: [], right: [] }, -12, { silent: true });
      return { audio, deviceName, streamErrors, quality: quality == null ? null : {
        framesCaptured: audio.left.length, overrunSamples: 0, clippedSamplesL: 0, clippedSamplesR: 0,
        streamErrors: 0, streamErrorMessages: [], truncated: false, callbackCount: 1, maxCallbackGapMs: 1, pairs: [], ...quality,
      } };
    },
    async cancel() { calls.cancels++; calls.order.push('capture-cancel'); lease.held = false; },
  });
  const startCapture = async args => {
    calls.order.push('capture'); calls.capture.push(args); options = args;
    if (startError) throw startError;
    if (lease.held) throw new CaptureBusyError({ holder: 'live-capture', message: 'The audio input is busy: "live-capture" is already running.' });
    if (start) await start();
    lease.held = true;
    return session();
  };
  const wait = async ms => { calls.waits.push(ms); const hook = calls.waits.length === 1 ? hooks.lead : hooks.play; if (hook) await hook(options); };
  return { out, startCapture, wait, calls, lease };
}
const run = (f, extra = {}) => runQualitySession({ out: f.out, startCapture: f.startCapture, outputDevice: 'USB Out', inputDevice: 'Interface', pairs: [3], wait: f.wait, ...extra });

test('session starts recording before playback, plays within the cap, and analyses', async () => {
  const f = fakes({ gain: 1 });
  const phases = [];
  const r = await run(f, { onPhase: p => phases.push(p), profile: { specs: [{ key: 'snr_line', label: 'SNR', value: 100, unit: 'dB', confidence: 'unverified', source: 'x' }] } });
  assert.deepEqual(f.calls.order, ['capture', 'play', 'stop:7', 'capture-stop']);
  assert.deepEqual(phases, ['recording', 'playing', 'analysing']);
  assert.equal(f.calls.play[0].opts.levelDbfs, -12);
  assert.equal(f.calls.play[0].opts.capDbfs, ABS_MAX_DBFS, 'the -12 dBFS audio-out cap is passed explicitly');
  assert.equal(f.calls.play[0].extra.device, 'USB Out');
  assert.equal(f.calls.capture[0].deviceName, 'Interface');
  assert.deepEqual(f.calls.capture[0].pairs, [3]);
  assert.ok(f.calls.capture[0].maxSeconds > f.calls.play[0].buffer.left.length / SR + 1, 'the capture outlasts the stimulus');
  assert.equal(f.calls.waits[0], AQ_LEAD_MS);
  assert.ok(f.calls.waits[1] > f.calls.play[0].buffer.left.length / SR * 1000, 'recording continues past the end of the stimulus');
  assert.equal(f.calls.cancels, 0, 'a completed capture is stopped, not cancelled');
  assert.equal(f.calls.stopAll, 0);
  assert.equal(r.status, 'pass', r.detail);
  assert.ok(r.measurements.find(m => m.metricId === 'aq_thdn_percent').value < 0.01);
  assert.equal(r.findings.filter(x => x.severity === 'info').length, 1, 'profile spec quoted');
  assert.equal(r.extra.outputDevice, 'USB Out');
  assert.equal(r.extra.thresholds.length, 9);
});

test('session clamps the level to the -12 dBFS cap and honours a lower level', async () => {
  const hot = fakes(); await run(hot, { playLevelDbfs: -3 });
  assert.equal(hot.calls.play[0].opts.levelDbfs, -12);
  const quiet = fakes(); const r = await run(quiet, { playLevelDbfs: -30 });
  assert.equal(quiet.calls.play[0].opts.levelDbfs, -30);
  const gain = r.measurements.find(m => m.metricId === 'aq_gain_db').value;
  assert.ok(Math.abs(gain) < 0.1, `gain is relative to the played level: measured ${gain} dB at ${quiet.calls.play[0].opts.levelDbfs} dBFS`);
});

test('regression: loss, stream errors and truncated capture retain evidence but cannot certify the device', async () => {
  for (const [quality, streamErrors] of [
    [{ overrunSamples: 10000 }, []],
    [{ streamErrors: 1 }, []],
    [{ streamErrorMessages: ['Device disconnected'] }, []],
    [{}, ['Device disconnected']],
    [{ truncated: true }, []],
  ]) {
    const r = await run(fakes({ quality, streamErrors }));
    assert.equal(r.status, 'unknown', JSON.stringify({ quality, streamErrors }));
    assert.equal(r.extra.captureIntegrity.state, 'incomplete');
    assert.ok(r.measurements.length > 0, 'raw measured values remain available');
    assert.ok(r.measurements.every(m => m.qualityFlags.includes('capture-incomplete')));
    assert.ok(r.findings.some(f => f.id === 'aq-capture-incomplete'));
    for (const [key, value] of Object.entries(quality)) assert.deepEqual(r.extra.captureQuality[key], value);
    assert.deepEqual(r.extra.streamErrors, streamErrors);
  }
});

test('regression: missing or invalid capture integrity is unknown, never measured zero', async () => {
  for (const quality of [null, { overrunSamples: undefined }, { overrunSamples: -1 }, { streamErrors: 0.5 }, { truncated: undefined }, { streamErrorMessages: null }, { callbackCount: Number.NaN }]) {
    const r = await run(fakes({ quality }));
    assert.equal(r.status, 'unknown');
    assert.equal(r.extra.captureIntegrity.state, 'unavailable');
    assert.ok(r.findings.some(f => f.id === 'aq-capture-unverified'));
    assert.ok(r.measurements.every(m => m.qualityFlags.includes('capture-unverified')));
    if (quality == null) assert.equal(r.extra.captureQuality, null);
  }
  const clean = await run(fakes());
  assert.equal(clean.status, 'pass');
  assert.equal(clean.extra.captureIntegrity.state, 'observed');
  assert.equal(clean.extra.captureQuality.overrunSamples, 0);
});

const calibrationProfile = (over = {}) => ({
  version: 1, valid: true, issues: [], gainDb: { left: 0, right: 0 }, uncertainty: {},
  mismatchDb: 0, clockPpm: 0, latencyMs: 0, sampleRate: SR, deviceName: 'Interface',
  createdAt: '2026-11-17T00:00:00Z', thdnPercent: 1, ...over,
});

test('regression: calibration applies only to the actual captured device and sample rate', async () => {
  const matching = await run(fakes(), { calibrationProfile: calibrationProfile() });
  assert.equal(matching.extra.calibrated, true);
  assert.equal(matching.extra.calibration.state, 'applied');
  assert.ok(matching.measurements.find(m => m.metricId === 'aq_thdn_percent').qualityFlags.includes('chain-corrected'));
  for (const [options, selected] of [
    [{ rate: 44100 }, calibrationProfile()],
    [{ deviceName: 'Different interface' }, calibrationProfile()],
    [{}, calibrationProfile({ valid: false })],
    ...[undefined, null, '', '   ', 123, {}, []].map(deviceName => [{}, calibrationProfile({ deviceName })]),
  ]) {
    const r = await run(fakes(options), { calibrationProfile: selected, calibrated: true, chainFloor: { thdnPercent: 1 } });
    assert.equal(r.extra.calibrated, false);
    assert.equal(r.extra.calibration.state, 'inapplicable');
    const flags = r.measurements.find(m => m.metricId === 'aq_thdn_percent').qualityFlags;
    assert.ok(flags.includes('uncalibrated-chain'));
    assert.ok(!flags.includes('chain-corrected'));
    assert.ok(r.findings.some(f => f.id === 'aq-calibration-inapplicable'));
  }
  const anonymous = await run(fakes(), { calibrated: true, chainFloor: { thdnPercent: 1 } });
  assert.equal(anonymous.extra.calibrated, false, 'a boolean cannot establish calibration applicability');
  assert.ok(!anonymous.measurements.find(m => m.metricId === 'aq_thdn_percent').qualityFlags.includes('chain-corrected'));
  assert.equal(matching.extra.analysisVersion, 2, 'saved evidence identifies the corrected analysis revision');
});

test('session handles a capture at a different sample rate, silence, and playback failure', async () => {
  const r44 = await run(fakes({ rate: 44100 }));
  assert.equal(r44.analysis.valid, true, 'segment timing is defined in seconds, so a 44.1 kHz recording of the 48 kHz buffer analyses cleanly');
  assert.equal(r44.status, 'pass', r44.detail);
  assert.equal(r44.extra.sampleRate, 44100);
  const silent = await run(fakes({ silent: true }));
  assert.equal(silent.status, 'unknown');
  assert.equal(silent.analysis.issues[0].code, 'NO_SIGNAL');
  assert.equal(silent.findings[0].id, 'aq-no_signal');
  assert.deepEqual(silent.measurements, [], 'an invalid analysis has nothing to save');
  const bad = fakes({ failPlay: true });
  await assert.rejects(() => run(bad), /device busy/);
  assert.equal(bad.calls.cancels, 1, 'the capture this run started is cancelled after a playback failure');
  assert.equal(bad.calls.stopAll, 0, 'other screens keep their playback');
  await assert.rejects(() => runQualitySession({ out: { supported: false }, startCapture: async () => ({}) }), e => e instanceof AudioSessionError && e.code === 'unsupported');
  await assert.rejects(() => runQualitySession({ out: { supported: true } }), e => e instanceof AudioSessionError && e.code === 'unsupported');
});

// ---------- bug 1: an early capture failure must prevent playback ----------

test('bug 1: a capture that cannot start (input busy) plays nothing and returns nothing', async () => {
  for (const error of [new CaptureBusyError({ holder: 'live-monitor' }), new Error('No input device found'), new Error('The capture was stopped because another DeckChek feature needed the audio input.')]) {
    const f = fakes({ startError: error });
    await assert.rejects(() => run(f), e => e === error);
    assert.equal(f.calls.play.length, 0, `nothing may play after: ${error.message}`);
    assert.deepEqual(f.calls.waits, [], 'the lead-in is not waited out');
    assert.equal(f.calls.stopAll, 0);
  }
  const busy = fakes({ startError: new CaptureBusyError({ holder: 'live-monitor' }) });
  const error = await run(busy).catch(e => e);
  assert.equal(classifyCaptureError(error).kind, 'busy');
});

test('bug 1: a capture preempted or lost during the lead-in plays nothing', async () => {
  for (const [hook, code] of [[o => o.onPreempted(), 'preempted'], [o => o.onStatus({ running: false }), 'capture-lost']]) {
    const f = fakes({ hooks: { lead: hook } });
    await assert.rejects(() => run(f), e => e instanceof AudioSessionError && e.code === code);
    assert.equal(f.calls.play.length, 0, code);
    assert.equal(f.calls.cancels, 1, 'this run releases its own capture');
    assert.equal(f.calls.stopAll, 0);
  }
});

test('bug 1: a capture preempted or lost during playback stops this run\'s voice and returns no result', async () => {
  for (const [hook, code] of [[o => o.onPreempted(), 'preempted'], [o => o.onStatus({ running: false }), 'capture-lost']]) {
    const f = fakes({ hooks: { play: hook } });
    await assert.rejects(() => run(f), e => e.code === code);
    assert.deepEqual(f.calls.stop, [7], 'only the handle this run started is stopped');
    assert.equal(f.calls.stopAll, 0);
    assert.equal(f.calls.captureStops, 0, 'nothing is recorded for analysis');
  }
  // a capture still running keeps the run going
  const ok = fakes({ hooks: { play: o => o.onStatus({ running: true }) } });
  assert.equal((await run(ok)).status, 'pass');
});

test('bug 1: a stop() that reports the capture was preempted is never analysed', async () => {
  const f = fakes();
  const startCapture = async args => { const s = await f.startCapture(args); return { ...s, stop: async () => ({ ...(await s.stop()), preempted: true }) }; };
  await assert.rejects(() => run(f, { startCapture }), e => e.code === 'preempted');
});

// ---------- bugs 2 and 4: cancellation stops only what this run owns ----------

test('bug 2: cancelling during playback stops only this run\'s handle and cancels only its capture', async () => {
  const ac = new AbortController();
  const f = fakes({ hooks: { play: () => ac.abort() } });
  await assert.rejects(() => run(f, { signal: ac.signal }), e => e instanceof AudioSessionError && e.code === 'cancelled');
  assert.deepEqual(f.calls.stop, [7]);
  assert.equal(f.calls.stopAll, 0, 'stopAll would silence other screens');
  assert.equal(f.calls.cancels, 1);
  assert.equal(f.calls.captureStops, 0);
  // already cancelled: nothing starts at all
  const pre = new AbortController(); pre.abort();
  const g = fakes();
  await assert.rejects(() => run(g, { signal: pre.signal }), e => e.code === 'cancelled');
  assert.deepEqual(g.calls.capture, []); assert.equal(g.calls.play.length, 0);
});

test('bug 4: a playBuffer that resolves after cancellation has its late handle stopped at once', async () => {
  const late = deferred(); const ac = new AbortController();
  const f = fakes({ play: () => late.promise });
  const p = run(f, { signal: ac.signal });
  await turn(); await turn();
  assert.equal(f.calls.play.length, 1, 'playback was requested');
  ac.abort();
  await assert.rejects(p, e => e.code === 'cancelled');
  assert.deepEqual(f.calls.stop, [], 'no handle known yet');
  late.resolve({ handle: 9 }); await turn(); await turn();
  assert.deepEqual(f.calls.stop, [9], 'the late voice is stopped as soon as its handle arrives');
  assert.equal(f.calls.stopAll, 0);
  assert.equal(f.calls.cancels, 1);
});

test('bug 4: a handle-less playback result never stops every voice', async () => {
  for (const result of [{}, null, undefined, { handle: null }]) {
    const ac = new AbortController();
    const f = fakes({ play: () => result, hooks: { play: () => ac.abort() } });
    await assert.rejects(() => run(f, { signal: ac.signal }), e => e.code === 'cancelled');
    assert.equal(f.calls.stopAll, 0);
    assert.deepEqual(f.calls.stop, []);
    // late handle-less resolution after cancel
    const late = deferred(), ac2 = new AbortController();
    const g = fakes({ play: () => late.promise });
    const p = run(g, { signal: ac2.signal }); await turn(); await turn(); ac2.abort();
    await assert.rejects(p); late.resolve(result); await turn(); await turn();
    assert.equal(g.calls.stopAll, 0); assert.deepEqual(g.calls.stop, []);
  }
});

test('bug 2: a capture that starts after cancellation is cancelled at once and nothing plays', async () => {
  const started = deferred(); const ac = new AbortController();
  const f = fakes({ start: () => started.promise });
  const p = run(f, { signal: ac.signal });
  await turn();
  ac.abort();
  await assert.rejects(p, e => e.code === 'cancelled');
  started.resolve(); await turn(); await turn();
  assert.equal(f.calls.cancels, 1, 'the late session is released');
  assert.equal(f.calls.play.length, 0);
  assert.equal(f.lease.held, false);
});

// ---------- bug 5: never above -12 dBFS ----------

test('bug 5: any level, including non-numeric ones, plays at or below -12 dBFS with the cap passed', async () => {
  for (const level of [NaN, undefined, null, '', 'loud', {}, Infinity, 6, 0, '-3', -12.0001, -200, -Infinity]) {
    const f = fakes(); await run(f, { playLevelDbfs: level });
    const { opts, buffer } = f.calls.play[0];
    assert.ok(Number.isFinite(opts.levelDbfs) && opts.levelDbfs <= -12 && opts.levelDbfs >= -60, `${String(level)} → ${opts.levelDbfs}`);
    assert.equal(opts.capDbfs, -12);
    let peak = 0; for (const v of buffer.left) peak = Math.max(peak, Math.abs(v)); for (const v of buffer.right) peak = Math.max(peak, Math.abs(v));
    assert.ok(peak <= 1 + 1e-9, 'the buffer is full-scale at most: its level is the play gain');
  }
});

test('bug 5 (guard): through the real audio-out bridge the native call stays capped at -12 dBFS and only its own handle is stopped', async () => {
  const sent = [];
  const out = createAudioOut({ invoke: async (cmd, args) => { sent.push({ cmd, args }); return cmd === 'audio_play_buffer' ? { handle: 4 } : null; } });
  const f = fakes();
  await runQualitySession({ out, startCapture: f.startCapture, wait: f.wait, playLevelDbfs: 'loud' });
  const play = sent.find(c => c.cmd === 'audio_play_buffer');
  assert.ok(play.args.opts.levelDbfs <= -12 && play.args.opts.capDbfs === -12, JSON.stringify(play.args.opts));
  assert.deepEqual(sent.filter(c => c.cmd === 'audio_stop').map(c => c.args.handle), [4]);
  assert.equal(sent.filter(c => c.cmd === 'audio_stop_all').length, 0);
});

// ---------- bug 6: a failure leaves nothing behind ----------

test('bug 6: a failed attempt releases its capture, so an immediate retry records and analyses', async () => {
  const lease = { held: false };
  const first = fakes({ failPlay: true, lease });
  await assert.rejects(() => run(first));
  assert.equal(lease.held, false, 'the failed attempt released the input');
  const retry = fakes({ lease });
  const r = await run(retry);
  assert.equal(r.status, 'pass', r.detail);
  assert.ok(r.measurements.length > 0);
});

test('qualityResult: an invalid analysis has no measurements, a valid one evaluates every threshold', () => {
  const st = buildStimulus({ sampleRate: SR });
  const bad = qualityResult(analyzeAudioQuality(null, st.meta), { extra: { source: 'x.wav' } });
  assert.deepEqual(bad.measurements, []); assert.equal(bad.status, 'unknown'); assert.equal(bad.extra.source, 'x.wav');
  assert.equal(bad.findings[0].id, 'aq-bad_input');
  assert.deepEqual(qualityResult(undefined).measurements, []);
  const good = qualityResult(analyzeAudioQuality(recording(st, -12), st.meta), { profile: { specs: [] } });
  assert.equal(good.status, 'pass', good.detail); assert.equal(good.extra.thresholds.length, 9);
});

test('audio:quality dispatches and validates (ported from PR9)', () => {
  const t = { id: 'a', title: 'Q', method: 'audio:quality', steps: ['x'], category: 'audio', severity: 'major' };
  assert.deepEqual(dispatchFor(t), { runner: 'audio', kind: 'quality' });
  assert.equal(methodLabel(t), 'Audio quality');
  assert.equal(dispatchFor({ method: 'audio:nope' }).runner, 'unsupported');
  assert.equal(dispatchFor({ method: 'midi:conformance' }).kind, 'conformance');
  assert.equal(methodLabel({ method: 'midi:gm' }), 'MIDI · General MIDI');
  const p = { schemaVersion: 1, id: 'x', manufacturer: 'A', model: 'B', summary: 's', category: 'mixer', specs: [], tests: [t, { ...t, id: 'b', method: 'audio:nope' }] };
  const v = validateProfile(p);
  assert.ok(v.errors.some(e => e.includes('unknown audio test')));
  assert.ok(!v.errors.some(e => e.includes('"audio:quality"') || e.includes('unknown audio test "quality"')));
});
