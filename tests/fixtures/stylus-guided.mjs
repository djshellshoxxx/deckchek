import { BENCHMARK_STEPS } from '../../app/stylus-benchmark.js';
import { quadratureTimecode } from './signals.mjs';
import { payloadToAudio } from '../../app/ui/audio-io.js';

export const guidedConfig = (extra = {}) => ({ assetId: 'stylus-a', assetName: 'Cartridge A', hoursAt: 12,
  record: 'Reference LP', side: 'A', trackingForce: 2.5, vta: 'Height 2', chain: 'Deck > phono stage > Input A, gain 0 dB',
  setupId: 'setup-a', deviceName: 'Input A', pairs: [1], nominalRpm: 33.333333, timecodeFormat: '', sameConditions: true, ...extra });

export const guidedProfile = (extra = {}) => ({ version: 1, valid: true, deviceName: 'Input A', sampleRate: 22050, createdAt: '2026-11-01T00:00:00Z',
  gainDb: { left: 0, right: 0 }, mismatchDb: 0, noiseFloorDbfs: -90, thdnPercent: .05, latencyMs: 10, clockPpm: 0, response: [],
  uncertainty: { gainDb: .02, mismatchDb: .03, clockPpm: 5, k: 2 }, issues: [], ...extra });

export function guidedCapture(id, { sampleRate = 22050, frequency = 1000, harmonics = {}, leftScale = id === 'right' ? .01 : 1, rightScale = id === 'left' ? .01 : 1 } = {}) {
  const step = BENCHMARK_STEPS.find(row => row.id === id), seconds = step.seconds, n = sampleRate * seconds;
  let left = new Float32Array(n), right = new Float32Array(n);
  if (id === 'timecode') ({ left, right } = quadratureTimecode({ sampleRate, seconds, carrierHz: frequency, snrDb: 45, seed: 7 }));
  else for (let i = 0; i < n; i++) {
    const phase = 2 * Math.PI * frequency * i / sampleRate;
    let value = .2 * Math.sin(phase);
    for (const [order, amplitude] of Object.entries(harmonics)) value += amplitude * Math.sin(phase * Number(order));
    left[i] = value * leftScale; right[i] = value * rightScale;
  }
  const pair = { first: 1, second: 2, mono: false, label: '1-2' };
  return {
    audio: payloadToAudio({ left, right, sampleRate, channels: 2, pairs: [pair], deviceName: 'Input A', streamErrors: [] }),
    quality: { framesCaptured: n, overrunSamples: 0, streamErrors: 0, clippedSamplesL: 0, clippedSamplesR: 0, callbackCount: 100, maxCallbackGapMs: 10, truncated: false, streamErrorMessages: [] },
    streamErrors: [], deviceName: 'Input A',
    captureInfo: { deviceName: 'Input A', sampleRate, channels: 2, pairs: [pair], leaseId: 4, maxSeconds: seconds + 5 },
  };
}
