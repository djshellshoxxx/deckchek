// Attribution-free, generated audio checks for speakers, venue systems and audio interfaces.
// Output playback still passes through the native limiter in src-tauri/src/audio_out.rs.

export const TEST_TONES = Object.freeze([
  { id: 'tone-20', label: '20 Hz · sub-bass', type: 'sine', freqHz: 20, durationSec: 2, levelDbfs: -30, group: 'Bass' },
  { id: 'tone-31', label: '31.5 Hz · sub-bass', type: 'sine', freqHz: 31.5, durationSec: 2, levelDbfs: -30, group: 'Bass' },
  { id: 'tone-40', label: '40 Hz · bass', type: 'sine', freqHz: 40, durationSec: 2, levelDbfs: -30, group: 'Bass' },
  { id: 'tone-63', label: '63 Hz · bass', type: 'sine', freqHz: 63, durationSec: 2, levelDbfs: -30, group: 'Bass' },
  { id: 'tone-100', label: '100 Hz · bass', type: 'sine', freqHz: 100, durationSec: 2, levelDbfs: -30, group: 'Bass' },
  { id: 'tone-250', label: '250 Hz · low mid', type: 'sine', freqHz: 250, durationSec: 2, levelDbfs: -30, group: 'Reference' },
  { id: 'tone-1k', label: '1 kHz · reference', type: 'sine', freqHz: 1000, durationSec: 2, levelDbfs: -24, group: 'Reference' },
  { id: 'tone-5k', label: '5 kHz · upper mid', type: 'sine', freqHz: 5000, durationSec: 2, levelDbfs: -30, group: 'Reference' },
  { id: 'tone-10k', label: '10 kHz · high frequency', type: 'sine', freqHz: 10000, durationSec: 2, levelDbfs: -36, group: 'Reference' },
  { id: 'bass-sweep', label: '20–120 Hz · bass sweep', type: 'chirp', freqHz: 20, endHz: 120, durationSec: 10, levelDbfs: -30, group: 'Sweeps' },
  { id: 'full-band-sweep', label: '20 Hz–20 kHz · sweep', type: 'chirp', freqHz: 20, endHz: 20000, durationSec: 12, levelDbfs: -36, group: 'Sweeps' },
  { id: 'left-id', label: 'Left channel · 1 kHz', type: 'sine', freqHz: 1000, durationSec: 1.5, levelDbfs: -24, group: 'Routing', channel: 'left' },
  { id: 'right-id', label: 'Right channel · 1 kHz', type: 'sine', freqHz: 1000, durationSec: 1.5, levelDbfs: -24, group: 'Routing', channel: 'right' },
]);

export const AMBIENCE_PRESETS = Object.freeze([
  { id: 'soft-room', label: 'Soft room tone', description: 'Quiet, low-detail sound bed for a venue during setup.', notes: [55, 82.4, 110, 164.8, 220, 329.6, 440] },
  { id: 'warm-stage', label: 'Warm stage wash', description: 'Slow, gentle chord-like wash; no recorded or copyrighted material.', notes: [65.4, 98, 130.8, 196, 261.6, 392, 523.3] },
  { id: 'low-lounge', label: 'Low lounge bed', description: 'Soft low and mid-frequency background for checking the room.', notes: [49, 73.4, 98, 146.8, 196, 293.7, 392] },
]);

const MIN_LEVEL_DBFS = -90;
const SAFE_MAX_DBFS = -12;

/** Return a validated native-play spec. Interactive test tones default to reduced level. */
export function toneRequest(id, requestedLevelDbfs) {
  const signal = TEST_TONES.find(item => item.id === id);
  if (!signal) throw new Error(`Unknown test signal: ${id}`);
  const requested = requestedLevelDbfs === undefined ? signal.levelDbfs : Number(requestedLevelDbfs);
  if (!Number.isFinite(requested)) throw new Error('Test signal level must be finite.');
  const levelDbfs = Math.max(MIN_LEVEL_DBFS, Math.min(SAFE_MAX_DBFS, requested));
  return { ...signal, levelDbfs, capDbfs: SAFE_MAX_DBFS };
}

/** Small, faded stereo identifier buffer. Routing tests cannot use a mono generator tone. */
export function toneBuffer(signal, { sampleRate = 24_000 } = {}) {
  if (!signal || signal.type !== 'sine' || !['left', 'right'].includes(signal.channel)) throw new Error('A channel-identification tone is required.');
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 48_000) throw new Error('Test tone sample rate must be 8–48 kHz.');
  const frames = Math.round(sampleRate * signal.durationSec);
  const left = new Float32Array(frames), right = new Float32Array(frames);
  const fadeFrames = Math.min(Math.floor(sampleRate * 0.02), Math.floor(frames / 4));
  for (let n = 0; n < frames; n++) {
    const edge = Math.min(1, (n + 1) / fadeFrames, (frames - n) / fadeFrames);
    const sample = Math.sin(2 * Math.PI * signal.freqHz * n / sampleRate) * edge;
    if (signal.channel === 'left') left[n] = sample; else right[n] = sample;
  }
  return { sampleRate, left, right, durationSec: frames / sampleRate };
}

/** Generate a low-level, seamless synthetic ambience loop. `soft-room` is the default safe choice. */
export function ambientLoop(id, { sampleRate = 24_000, durationSec = 8 } = {}) {
  const preset = AMBIENCE_PRESETS.find(item => item.id === id);
  if (!preset) throw new Error(`Unknown ambience preset: ${id}`);
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 48_000) throw new Error('Ambience sample rate must be 8–48 kHz.');
  if (!Number.isFinite(durationSec) || durationSec < 2 || durationSec > 12) throw new Error('Ambience loop duration must be 2–12 seconds.');
  const frames = Math.round(sampleRate * durationSec);
  const left = new Float32Array(frames), right = new Float32Array(frames);
  const phases = preset.notes.map(() => 0);
  // Quantize each oscillator and LFO to an integer number of cycles so the
  // generated loop has matching phase at its wrap point for any allowed duration.
  const loopFrequencies = preset.notes.map(freq => Math.max(1, Math.round(freq * durationSec)) / durationSec);
  const lfoCycles = preset.notes.map((_, i) => Math.max(1, Math.round((0.07 + i * 0.009) * durationSec)));
  const gains = preset.notes.map((_, i) => 0.065 / (1 + i * 0.15));
  const twoPi = Math.PI * 2;
  for (let n = 0; n < frames; n++) {
    let l = 0, r = 0;
    for (let i = 0; i < preset.notes.length; i++) {
      const freq = loopFrequencies[i];
      const slow = 0.74 + 0.26 * Math.sin(twoPi * lfoCycles[i] * n / frames + i * 0.71);
      l += Math.sin(phases[i]) * gains[i] * slow;
      r += Math.sin(phases[i] + 0.13 * (i + 1)) * gains[i] * slow;
      phases[i] += twoPi * freq / sampleRate;
      if (phases[i] >= twoPi) phases[i] -= twoPi;
    }
    left[n] = l;
    right[n] = r;
  }
  // Make the discrete wrap sample equal the first sample as well as keeping
  // oscillator phase periodic; this removes a one-sample boundary discontinuity.
  left[frames - 1] = left[0];
  right[frames - 1] = right[0];
  return { sampleRate, left, right, durationSec: frames / sampleRate, peak: Math.max(peak(left), peak(right)), presetId: preset.id };
}

/** Encode a short stereo PCM signal with explicit sample-rate and bit-depth metadata. */
export function encodePcmWav({ left, right, sampleRate = 48_000, bits = 24 } = {}) {
  if (!left?.length || (right && right.length !== left.length)) throw new Error('WAV audio needs matching non-empty channel buffers.');
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) throw new Error('WAV sample rate must be 8–192 kHz.');
  if (![16, 24, 32].includes(bits)) throw new Error('PCM bit depth must be 16, 24 or 32 bits.');
  const channels = 2, bytesPerSample = bits / 8, blockAlign = channels * bytesPerSample;
  const dataBytes = left.length * blockAlign;
  const out = new ArrayBuffer(44 + dataBytes), view = new DataView(out);
  const fourcc = (offset, text) => { for (let i = 0; i < 4; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  fourcc(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); fourcc(8, 'WAVE');
  fourcc(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, bits, true);
  fourcc(36, 'data'); view.setUint32(40, dataBytes, true);
  const max = 2 ** (bits - 1) - 1, min = -(2 ** (bits - 1));
  let offset = 44;
  for (let i = 0; i < left.length; i++) {
    for (const input of [left[i], right ? right[i] : left[i]]) {
      const x = Number.isFinite(input) ? Math.max(-1, Math.min(1, input)) : 0;
      const sample = x < 0 ? Math.round(x * -min) : Math.round(x * max);
      if (bits === 16) view.setInt16(offset, sample, true);
      else if (bits === 24) {
        const v = sample < 0 ? sample + 0x1000000 : sample;
        view.setUint8(offset, v & 0xff); view.setUint8(offset + 1, (v >>> 8) & 0xff); view.setUint8(offset + 2, (v >>> 16) & 0xff);
      } else view.setInt32(offset, Math.max(min, sample), true);
      offset += bytesPerSample;
    }
  }
  return out;
}

function peak(samples) {
  let value = 0;
  for (const sample of samples) value = Math.max(value, Math.abs(sample));
  return value;
}
