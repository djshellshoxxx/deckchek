// Failing reproduction from docs/audit/2026-10-bug-hunt.md (WebAudio output cap).
// Skipped by default so the suite stays green; run it with
//   AUDIT_REPRO=1 node --test tests/audit-repro/
// and delete the `skip` option once the bug is fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playStereo } from '../../app/ui/audio-io.js';
import { ABS_MAX_DBFS } from '../../app/audio-out.js';

const skip = id => (process.env.AUDIT_REPRO ? false : id);

/** Minimal AudioContext that records what reaches the output buffer. */
function fakeAudioContext() {
  const written = [];
  class Ctx {
    constructor() { this.sampleRate = 48000; this.destination = {}; }
    async resume() {}
    async close() {}
    createBuffer(channels, length) { return { copyToChannel: data => written.push(Float32Array.from(data)) }; }
    createBufferSource() { return { connect() {}, start() {}, stop() {}, onended: null }; }
  }
  return { Ctx, written };
}

test('BUG-13: playStereo enforces the -12 dBFS cap that audio-out.js documents for the WebAudio path', { skip: skip('BUG-13: playStereo has no level clamp') }, async () => {
  const { Ctx, written } = fakeAudioContext();
  const saved = globalThis.AudioContext;
  globalThis.AudioContext = Ctx;
  try {
    const full = new Float32Array(480).fill(1); // 0 dBFS from a caller bug or a future caller
    await playStereo({ left: full, right: full, sampleRate: 48000 });
    const peak = Math.max(...written.flatMap(ch => Array.from(ch, Math.abs)));
    assert.ok(20 * Math.log10(peak) <= ABS_MAX_DBFS + 1e-6, `WebAudio output peaked at ${(20 * Math.log10(peak)).toFixed(1)} dBFS`);
  } finally {
    globalThis.AudioContext = saved;
  }
});
