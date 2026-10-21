import test from 'node:test';
import assert from 'node:assert/strict';
import { runQualitySession, AudioSessionError } from '../app/devices/audio-session.js';
import { buildStimulus } from '../app/audio-quality.js';
import { dispatchFor, methodLabel } from '../app/devices/dispatch.js';
import { validateProfile } from '../app/devices/library.js';

const SR = 48000;
function fakes({ gain = 1, silent = false, failPlay = false, rate = SR } = {}) {
  const calls = { play: [], stop: [], capture: [], order: [] };
  let finish;
  const out = {
    supported: true,
    async playBuffer(buffer, opts, extra) {
      calls.order.push('play'); calls.play.push({ buffer, opts, extra });
      if (failPlay) throw new Error('device busy');
      const amp = 10 ** (opts.levelDbfs / 20) * gain, delay = 211;
      const src0 = rate === SR ? buffer : buildStimulus({ sampleRate: rate, playLevelDbfs: -12 }); // what a device recording at `rate` would capture
      const mk = src => { const o = new Float32Array(src.length + delay + 2 * rate); if (!silent) for (let i = 0; i < src.length; i++) o[i + delay] = src[i] * amp; return o; };
      finish({ audio: { left: mk(src0.left), right: mk(src0.right), sampleRate: rate } });
      return { handle: 7 };
    },
    async stop(h) { calls.stop.push(h); },
  };
  const capture = args => { calls.order.push('capture'); calls.capture.push(args); return new Promise(res => { finish = res; }); };
  return { out, capture, calls };
}
const run = (f, extra = {}) => runQualitySession({ out: f.out, capture: f.capture, outputDevice: 'USB Out', inputDevice: 'Interface', pairs: [{ label: '1-2' }], wait: async () => {}, ...extra });

test('session starts recording before playback, plays within the cap, and analyses', async () => {
  const f = fakes({ gain: 1 });
  const phases = [];
  const r = await run(f, { onPhase: p => phases.push(p), profile: { specs: [{ key: 'snr_line', label: 'SNR', value: 100, unit: 'dB', confidence: 'unverified', source: 'x' }] } });
  assert.deepEqual(f.calls.order, ['capture', 'play']);
  assert.deepEqual(phases, ['recording', 'playing', 'analysing']);
  assert.equal(f.calls.play[0].opts.levelDbfs, -12);
  assert.equal(f.calls.play[0].extra.device, 'USB Out');
  assert.equal(f.calls.capture[0].deviceName, 'Interface');
  assert.ok(f.calls.capture[0].durationSec > f.calls.play[0].buffer.left.length / SR);
  assert.deepEqual(f.calls.stop, [7]);
  assert.equal(r.status, 'pass', r.detail);
  assert.ok(r.measurements.find(m => m.metricId === 'aq_thdn_percent').value < 0.01);
  assert.equal(r.findings.filter(x => x.severity === 'info').length, 1, 'profile spec quoted');
  assert.equal(r.extra.outputDevice, 'USB Out');
});

test('session clamps the level to the -12 dBFS cap and honours a lower level', async () => {
  const hot = fakes(); await run(hot, { playLevelDbfs: -3 });
  assert.equal(hot.calls.play[0].opts.levelDbfs, -12);
  const quiet = fakes(); const r = await run(quiet, { playLevelDbfs: -30 });
  assert.equal(quiet.calls.play[0].opts.levelDbfs, -30);
  assert.ok(Math.abs(r.measurements.find(m => m.metricId === 'aq_gain_db').value) < 0.1, 'gain is relative to the played level');
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
  const bad = fakes({ failPlay: true });
  await assert.rejects(() => run(bad), /device busy/);
  assert.ok(bad.calls.stop.length >= 1, 'stop is attempted after a failure');
  await assert.rejects(() => runQualitySession({ out: { supported: false }, capture: async () => ({}) }), e => e instanceof AudioSessionError && e.code === 'unsupported');
});

test('audio:quality dispatches and validates', () => {
  const t = { id: 'a', title: 'Q', method: 'audio:quality', steps: ['x'], category: 'audio', severity: 'major' };
  assert.deepEqual(dispatchFor(t), { runner: 'audio', kind: 'quality' });
  assert.equal(methodLabel(t), 'Audio quality');
  assert.equal(dispatchFor({ method: 'audio:nope' }).runner, 'unsupported');
  assert.equal(dispatchFor({ method: 'midi:conformance' }).kind, 'conformance');
  assert.equal(methodLabel({ method: 'midi:gm' }), 'MIDI · General MIDI');
  const p = { schemaVersion: 1, id: 'x', manufacturer: 'A', model: 'B', summary: 's', category: 'mixer', specs: [], tests: [t, { ...t, id: 'b', method: 'audio:nope' }] };
  const v = validateProfile(p);
  assert.ok(v.errors.some(e => e.includes('unknown audio test')));
});
