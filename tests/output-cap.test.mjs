// BUG-13 (docs/audit/2026-10-bug-hunt.md): the WebAudio path enforces the -12 dBFS cap that
// audio-out.js documents, like every native output path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playStereo, capStereo, ABS_MAX_AMP } from '../app/ui/audio-io.js';
import { ABS_MAX_DBFS } from '../app/audio-out.js';

const peakDb = chans => 20 * Math.log10(Math.max(...chans.flatMap(ch => Array.from(ch, Math.abs))));

/** Minimal AudioContext that records what reaches the output buffer. */
function fakeAudioContext() {
  const written = [];
  class Ctx {
    constructor() { this.sampleRate = 48000; this.destination = {}; }
    async resume() {}
    async close() {}
    createBuffer() { return { copyToChannel: data => written.push(Float32Array.from(data)) }; }
    createBufferSource() { return { connect() {}, start() {}, stop() {}, onended: null }; }
  }
  return { Ctx, written };
}

async function play(left, right) {
  const { Ctx, written } = fakeAudioContext();
  const saved = globalThis.AudioContext;
  globalThis.AudioContext = Ctx;
  try { await playStereo({ left, right, sampleRate: 48000 }); } finally { globalThis.AudioContext = saved; }
  return written;
}

test('BUG-13: playStereo enforces the -12 dBFS cap that audio-out.js documents for the WebAudio path', async () => {
  const full = new Float32Array(480).fill(1); // 0 dBFS from a caller bug or a future caller
  const written = await play(full, full);
  assert.equal(written.length, 2);
  assert.ok(peakDb(written) <= ABS_MAX_DBFS + 1e-6, `WebAudio output peaked at ${peakDb(written).toFixed(1)} dBFS`);
});

test('playStereo leaves a stimulus at or below the cap untouched', async () => {
  const quiet = Float32Array.from({ length: 480 }, (_, i) => 0.1 * Math.sin(i / 7));
  const written = await play(quiet, null);
  assert.deepEqual(Array.from(written[0]), Array.from(quiet));
  assert.deepEqual(Array.from(written[1]), Array.from(quiet), 'mono is duplicated');
});

test('capStereo scales a loud buffer as a whole and zeroes non-finite samples', () => {
  assert.ok(ABS_MAX_AMP <= 10 ** (ABS_MAX_DBFS / 20) && ABS_MAX_AMP > 0.2511);
  const { left, right, gain } = capStereo(Float32Array.of(0.5, -1, NaN), Float32Array.of(0.25, Infinity, 0));
  assert.ok(Math.abs(gain - ABS_MAX_AMP) < 1e-9);
  assert.deepEqual(Array.from(left), [0.5 * gain, -gain, 0].map(Math.fround));
  assert.deepEqual(Array.from(right), [0.25 * gain, 0, 0].map(Math.fround));
  assert.ok(peakDb([left, right]) <= ABS_MAX_DBFS + 1e-6);
  assert.equal(capStereo(Float32Array.of(0.1), null).gain, 1);
});
