import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ABS_MAX_DBFS, SILENCE_DBFS, MIN_RAMP_MS, DEFAULT_RAMP_MS, AudioOutError,
  clampLevelDbfs, effectiveCapDbfs, clampRampMs, toneSpec, bufferArgs, toAudioOutError, createAudioOut,
} from '../app/audio-out.js';

const CONTRACT = JSON.parse(readFileSync(new URL('./contracts/audio_out.json', import.meta.url), 'utf8'));
const cmd = name => CONTRACT.commands[name];

function fakeInvoke(replies = {}) {
  const calls = [];
  const invoke = async (name, args) => {
    calls.push([name, args]);
    const r = replies[name];
    if (r instanceof Error || typeof r === 'string') throw r;
    return r === undefined ? cmd(name)?.response ?? null : r;
  };
  return { calls, invoke };
}

test('absolute cap matches the Rust constant', () => {
  assert.equal(ABS_MAX_DBFS, -12);
  assert.equal(CONTRACT.absMaxDbfs, ABS_MAX_DBFS);
});

test('effectiveCapDbfs never exceeds -12 dBFS', () => {
  assert.equal(effectiveCapDbfs(undefined), -12);
  assert.equal(effectiveCapDbfs(null), -12);
  assert.equal(effectiveCapDbfs(0), -12);
  assert.equal(effectiveCapDbfs(Infinity), -12);
  assert.equal(effectiveCapDbfs(-12), -12);
  assert.equal(effectiveCapDbfs(-11.99), -12);
  assert.equal(effectiveCapDbfs(-12.01), -12.01);
  assert.equal(effectiveCapDbfs(-30), -30);
  assert.equal(effectiveCapDbfs(-1000), SILENCE_DBFS);
  assert.equal(effectiveCapDbfs(NaN), SILENCE_DBFS);
});

test('clampLevelDbfs boundaries at the cap and the absolute cap', () => {
  assert.equal(clampLevelDbfs(-12), -12);
  assert.equal(clampLevelDbfs(-11.9), -12);
  assert.equal(clampLevelDbfs(-12.1), -12.1);
  assert.equal(clampLevelDbfs(0), -12);
  assert.equal(clampLevelDbfs(+100, 20), -12, 'a per-call cap cannot raise the absolute cap');
  assert.equal(clampLevelDbfs(-29.9, -30), -30);
  assert.equal(clampLevelDbfs(-30, -30), -30);
  assert.equal(clampLevelDbfs(-30.1, -30), -30.1);
  assert.equal(clampLevelDbfs(-Infinity), SILENCE_DBFS);
  assert.equal(clampLevelDbfs(NaN), SILENCE_DBFS);
  assert.equal(clampLevelDbfs('loud'), SILENCE_DBFS);
  assert.equal(clampLevelDbfs(-500), SILENCE_DBFS);
});

test('property: clamped level never exceeds min(cap, -12) for random inputs', () => {
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let i = 0; i < 200; i++) {
    const cap = rnd() < 0.1 ? undefined : (rnd() - 0.5) * 400;
    const level = (rnd() - 0.5) * 1000;
    const out = clampLevelDbfs(level, cap);
    assert.ok(out <= ABS_MAX_DBFS && out <= effectiveCapDbfs(cap) && out >= SILENCE_DBFS, `${level} ${cap} -> ${out}`);
  }
});

test('ramps are never shorter than 10 ms', () => {
  assert.equal(clampRampMs(undefined), DEFAULT_RAMP_MS);
  assert.equal(clampRampMs(NaN), DEFAULT_RAMP_MS);
  assert.equal(clampRampMs(0), MIN_RAMP_MS);
  assert.equal(clampRampMs(9.99), MIN_RAMP_MS);
  assert.equal(clampRampMs(10), 10);
  assert.equal(clampRampMs(10.01), 10.01);
  assert.equal(clampRampMs(1e9), 5000);
});

test('toneSpec validates type and level and clamps before sending', () => {
  assert.deepEqual(toneSpec({ type: 'sine', freqHz: 1000, levelDbfs: 0 }), { type: 'sine', freqHz: 1000, levelDbfs: -12, capDbfs: -12, rampMs: DEFAULT_RAMP_MS });
  assert.throws(() => toneSpec({ type: 'square', levelDbfs: -30 }), e => e instanceof AudioOutError && e.code === 'AUDIO_OUT_INVALID');
  assert.throws(() => toneSpec({ type: 'sine' }), /levelDbfs is required/);
  assert.throws(() => toneSpec({ type: 'sine', levelDbfs: -30, freqHz: NaN }), /freqHz/);
});

test('bufferArgs converts typed arrays, zeroes non-finite samples and checks lengths', () => {
  const { buffer, opts } = bufferArgs(
    { sampleRate: 48000, left: new Float32Array([0, 0.5, NaN, Infinity]), right: new Float32Array([0, 1, 2, 3]) },
    { levelDbfs: -6, loop: 1 },
  );
  assert.deepEqual(buffer, { sampleRate: 48000, left: [0, 0.5, 0, 0], right: [0, 1, 2, 3] });
  assert.ok(Array.isArray(buffer.left), 'JSON-friendly array, not a Float32Array');
  assert.deepEqual(opts, { levelDbfs: -12, capDbfs: -12, loop: true, rampMs: DEFAULT_RAMP_MS });
  assert.deepEqual(bufferArgs({ sampleRate: 44100, left: [0.1] }, { levelDbfs: -20 }).buffer.right, []);
  assert.throws(() => bufferArgs({ sampleRate: 48000, left: [0, 1], right: [0] }, { levelDbfs: -20 }), /same length/);
  assert.throws(() => bufferArgs({ sampleRate: 0, left: [0] }, { levelDbfs: -20 }), /sampleRate/);
  assert.throws(() => bufferArgs({ sampleRate: 48000, left: null }, { levelDbfs: -20 }), /left/);
  assert.throws(() => bufferArgs({ sampleRate: 48000, left: [0] }, {}), /levelDbfs/);
});

test('contract: the bridge sends exactly the documented command and argument names', async () => {
  const { calls, invoke } = fakeInvoke();
  const out = createAudioOut({ invoke });
  assert.equal(out.supported, true);

  assert.deepEqual(await out.listOutputs(), cmd('list_native_audio_outputs').response);
  const t = cmd('audio_play_tone').request;
  assert.deepEqual(await out.playTone(t.spec, { device: t.device }), cmd('audio_play_tone').response);
  const b = cmd('audio_play_buffer').request;
  assert.deepEqual(await out.playBuffer(b.buffer, b.opts, { device: b.device }), cmd('audio_play_buffer').response);
  const l = cmd('audio_set_level').request;
  assert.deepEqual(await out.setLevel(l.handle, l.levelDbfs), cmd('audio_set_level').response);
  await out.stop(cmd('audio_stop').request.handle);
  assert.equal(await out.stopAll(), cmd('audio_stop_all').response);
  const st = await out.status();
  assert.equal(st.supported, true);
  assert.equal(st.active.kind, 'bufferLoop');

  assert.deepEqual(calls, [
    ['list_native_audio_outputs', cmd('list_native_audio_outputs').request],
    ['audio_play_tone', t],
    ['audio_play_buffer', b],
    ['audio_set_level', l],
    ['audio_stop', cmd('audio_stop').request],
    ['audio_stop_all', cmd('audio_stop_all').request],
    ['audio_out_status', cmd('audio_out_status').request],
  ]);
});

test('setLevel pre-clamps hostile levels; Rust clamps again to the voice cap', async () => {
  const { calls, invoke } = fakeInvoke({ audio_set_level: { handle: 3, levelDbfs: -30 } });
  const out = createAudioOut({ invoke });
  await out.setLevel(3, 40);
  await out.setLevel(3, -10, { capDbfs: -30 });
  assert.deepEqual(calls.map(c => c[1]), [{ handle: 3, levelDbfs: -12 }, { handle: 3, levelDbfs: -30 }]);
  await assert.rejects(out.setLevel(3, NaN), /levelDbfs/);
});

test('Rust error strings become coded errors', async () => {
  const { invoke } = fakeInvoke({ audio_play_tone: 'AUDIO_OUT_DISABLED: audio output was disabled after an internal error; restart DeckChek' });
  const out = createAudioOut({ invoke });
  await assert.rejects(out.playTone({ type: 'sine', levelDbfs: -40 }), e => e.code === 'AUDIO_OUT_DISABLED' && /restart/.test(e.message));
  assert.equal(toAudioOutError(new Error('boom')).code, 'AUDIO_OUT_ERROR');
  assert.equal(toAudioOutError('AUDIO_OUT_NOT_PLAYING: audio handle 4 is not playing (inactivity)').code, 'AUDIO_OUT_NOT_PLAYING');
});

test('stop is idempotent and safe without a handle', async () => {
  const { calls, invoke } = fakeInvoke();
  const out = createAudioOut({ invoke });
  await out.stop(undefined);
  await out.stop(null);
  await out.stop(7);
  await out.stop(7);
  assert.deepEqual(calls, [['audio_stop', { handle: 7 }], ['audio_stop', { handle: 7 }]]);
});

test('browser mode reports unsupported and never plays', async () => {
  const out = createAudioOut({ invoke: null });
  assert.equal(out.supported, false);
  assert.deepEqual(await out.listOutputs(), []);
  await assert.rejects(out.playTone({ type: 'sine', levelDbfs: -40 }), e => e.code === 'unsupported');
  await assert.rejects(out.playBuffer({ sampleRate: 48000, left: [0] }, { levelDbfs: -40 }), e => e.code === 'unsupported');
  await assert.rejects(out.setLevel(1, -40), e => e.code === 'unsupported');
  await out.stop(1);
  assert.equal(await out.stopAll(), 0);
  assert.deepEqual(await out.status(), { absMaxDbfs: -12, disabled: false, active: null, recent: [], supported: false });
});
