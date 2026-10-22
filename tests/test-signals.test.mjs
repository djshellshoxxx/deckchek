import test from 'node:test';
import assert from 'node:assert/strict';
import { TEST_TONES, AMBIENCE_PRESETS, ambientLoop, toneRequest, toneBuffer, encodePcmWav } from '../app/test-signals.js';

test('test signal catalogue contains balanced audio, bass and full-band checks', () => {
  assert.ok(TEST_TONES.some(t => t.id === 'bass-sweep' && t.type === 'chirp'));
  assert.ok(TEST_TONES.some(t => t.id === 'full-band-sweep' && t.type === 'chirp'));
  assert.ok(TEST_TONES.some(t => t.id === 'left-id' && t.channel === 'left'));
  assert.ok(TEST_TONES.some(t => t.id === 'right-id' && t.channel === 'right'));
});

test('tone requests clamp levels below the native hard cap and validate levels', () => {
  assert.equal(toneRequest('tone-1k', -6).levelDbfs, -12);
  assert.throws(() => toneRequest('unknown', -24), /Unknown test signal/);
  assert.throws(() => toneRequest('tone-1k', Number.NaN), /finite/);
});

test('channel identification tones send audio only to the requested side', () => {
  const leftOnly = toneBuffer(toneRequest('left-id'), { sampleRate: 8000 });
  const rightOnly = toneBuffer(toneRequest('right-id'), { sampleRate: 8000 });
  assert.ok(leftOnly.left.some(x => x !== 0));
  assert.ok(leftOnly.right.every(x => x === 0));
  assert.ok(rightOnly.right.some(x => x !== 0));
  assert.ok(rightOnly.left.every(x => x === 0));
});

test('ambient loop is deterministic, stereo, seamless and bounded', () => {
  const a = ambientLoop('soft-room', { sampleRate: 8000, durationSec: 2 });
  const b = ambientLoop('soft-room', { sampleRate: 8000, durationSec: 2 });
  assert.equal(a.sampleRate, 8000);
  assert.equal(a.left.length, 16000);
  assert.deepEqual(a.left, b.left);
  assert.deepEqual(a.right, b.right);
  assert.ok(Math.max(...a.left.slice(0, 8).map(Math.abs)) < 0.7);
  assert.ok(Math.abs(a.left[0] - a.left.at(-1)) < 0.01);
});

test('ambient presets include multiple generated, attribution-free venue beds', () => {
  assert.ok(AMBIENCE_PRESETS.length >= 3);
  assert.equal(new Set(AMBIENCE_PRESETS.map(x => x.id)).size, AMBIENCE_PRESETS.length);
});

test('PCM WAV fixtures carry truthful sample rate, bit depth and uncompressed bitrate', () => {
  for (const bits of [16, 24, 32]) {
    const wav = encodePcmWav({ left: Float32Array.of(-1, 0, 1), sampleRate: 96_000, bits });
    const v = new DataView(wav);
    assert.equal(v.getUint32(24, true), 96_000);
    assert.equal(v.getUint16(34, true), bits);
    assert.equal(v.getUint32(28, true), 96_000 * 2 * bits / 8);
    assert.equal(wav.byteLength, 44 + 3 * 2 * bits / 8);
    if (bits === 16) {
      assert.equal(v.getInt16(44, true), -32768);
      assert.equal(v.getInt16(52, true), 32767);
    }
  }
  assert.throws(() => encodePcmWav({ left: [], bits: 20 }), /matching non-empty/);
});
