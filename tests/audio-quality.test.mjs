import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStimulus, analyzeAudioQuality, evaluateAudioQuality, aWeightDb, aWeightedRms, profileSpecNotes, DEFAULT_THRESHOLDS } from '../app/audio-quality.js';

const SR = 48000;
const rng = (seed = 1) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = r => () => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
const mv = (r, id) => r.measurements.find(x => x.metricId === id)?.value;
const st = buildStimulus({ sampleRate: SR });

/** Simulated device + recorder: stimulus -> play level -> device -> delay -> capture buffer. */
function simulate({ gainDb = 0, delay = 137, cubic = 0, noiseRms = 0, lowpassHz = 0, xtalkDb = -Infinity, invertR = false, dropout = null, ppm = 0, extraSec = 1, seed = 3 } = {}) {
  const play = 10 ** (st.meta.playLevelDbfs / 20), g = 10 ** (gainDb / 20), n = st.left.length + delay + Math.round(extraSec * SR);
  const stage = src => {
    const y = new Float64Array(n);
    let lp = 0; const a = lowpassHz ? 1 - Math.exp(-2 * Math.PI * lowpassHz / SR) : 1;
    for (let i = 0; i < src.length; i++) { let x = src[i] * play; x = x + cubic * x ** 3; lp += a * (x - lp); y[i + delay] = g * lp; }
    return y;
  };
  let L = stage(st.left), R = stage(st.right);
  const x = 10 ** (xtalkDb / 20);
  if (x > 0) { const l2 = L.map((v, i) => v + x * R[i]), r2 = R.map((v, i) => v + x * L[i]); L = l2; R = r2; }
  if (invertR) R = R.map(v => -v);
  if (dropout) for (const c of [L, R]) c.fill(0, dropout[0], dropout[1]);
  if (ppm) { const warp = c => { const o = new Float64Array(c.length), k = 1 + ppm * 1e-6; for (let i = 2; i < c.length - 3; i++) { const p = i * k, j = Math.floor(p), f = p - j, [y0, y1, y2, y3] = [c[j - 1], c[j], c[j + 1], c[j + 2]]; o[i] = y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0))); } return o; }; L = warp(L); R = warp(R); }
  if (noiseRms) { const gn = gauss(rng(seed)); for (const c of [L, R]) for (let i = 0; i < c.length; i++) c[i] += noiseRms * gn(); }
  return { left: Float32Array.from(L), right: Float32Array.from(R), sampleRate: SR };
}

test('stimulus: peak is exactly 1, segments are ordered, inside the buffer, edges faded', () => {
  let pk = 0; for (const v of st.left) pk = Math.max(pk, Math.abs(v)); for (const v of st.right) pk = Math.max(pk, Math.abs(v));
  assert.ok(Math.abs(pk - 1) < 1e-6, String(pk));
  let prev = st.meta.markerStart + st.meta.markerLength;
  for (const s of st.meta.segments) { assert.ok(s.start >= prev && s.end > s.start && s.end <= st.meta.totalSamples, s.name); prev = s.end; assert.ok(Math.abs(st.left[s.start]) < 1e-3); }
  assert.deepEqual(st.meta.segments.filter(s => s.name === 'resp').map(s => s.hz), [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 20000]);
  // crosstalk segments drive one channel only
  const xl = st.meta.segments.find(s => s.name === 'xtalk-L');
  assert.ok(st.left.subarray(xl.start, xl.end).some(v => Math.abs(v) > 0.1) && st.right.subarray(xl.start, xl.end).every(v => v === 0));
  assert.throws(() => buildStimulus({ sampleRate: 8000 }), RangeError);
  const low = buildStimulus({ sampleRate: 22050 }).meta;
  assert.ok(low.segments.filter(s => s.name === 'resp').every(s => s.skipped === (s.hz >= 0.45 * 22050)));
  assert.equal(low.segments.filter(s => s.name === 'resp' && s.skipped).length, 3);
  // same timing at every sample rate
  assert.ok(Math.abs(low.durationSec - st.meta.durationSec) < 0.01);
});

test('A-weighting matches IEC 61672 reference gains', () => {
  assert.ok(Math.abs(aWeightDb(1000)) < 1e-9);
  assert.ok(Math.abs(aWeightDb(100) + 19.1) < 0.1);
  assert.ok(Math.abs(aWeightDb(10000) + 2.5) < 0.2);
  assert.ok(Math.abs(aWeightDb(20) + 50.5) < 0.2);
  const tone = f => Float32Array.from({ length: 65536 }, (_, i) => Math.sin(2 * Math.PI * f * i / SR));
  const base = aWeightedRms(tone(1000), SR);
  assert.ok(Math.abs(20 * Math.log10(base * Math.SQRT2)) < 0.1, 'unit sine rms');
  assert.ok(Math.abs(20 * Math.log10(aWeightedRms(tone(100), SR) / base) + 19.1) < 0.3);
});

test('clean pass-through: no findings, gain/delay recovered', () => {
  const cap = simulate({ gainDb: 3 });
  const a = analyzeAudioQuality(cap, st.meta);
  assert.equal(a.valid, true, JSON.stringify(a.issues));
  assert.ok(Math.abs(mv(a, 'aq_gain_db') - 3) < 0.05, String(mv(a, 'aq_gain_db')));
  assert.ok(Math.abs(a.lagSamples - 137) < 1, String(a.lagSamples));
  assert.ok(mv(a, 'aq_thdn_percent') < 0.01 && mv(a, 'aq_dropouts') === 0 && mv(a, 'aq_polarity_inverted') === 0);
  assert.ok(Math.abs(mv(a, 'aq_balance_db')) < 0.01 && mv(a, 'aq_response_flatness_db') < 0.05 && mv(a, 'aq_linearity_db') < 0.01);
  assert.ok(mv(a, 'aq_separation_db') > 100);
  const ev = evaluateAudioQuality(a.measurements);
  assert.equal(ev.status, 'pass', JSON.stringify(ev.results.filter(r => r.status !== 'pass').map(r => r.detail)));
  assert.equal(ev.findings.length, 0);
  assert.equal(a.response.length, 11);
  assert.ok(a.measurements.find(x => x.metricId === 'aq_thdn_percent').qualityFlags.includes('uncalibrated-chain'));
  assert.ok(!analyzeAudioQuality(cap, st.meta, { calibrated: true }).measurements.find(x => x.metricId === 'aq_thdn_percent').qualityFlags.includes('uncalibrated-chain'));
});

test('harmonic distortion is measured (cubic nonlinearity) and chain floor is subtracted', () => {
  const k = 20, A = 0.1 * 1; // tone amplitude at -20 dBFS
  const h3 = k * A ** 3 / 4, fund = A + 3 * k * A ** 3 / 4, expected = (h3 / fund) * 100;
  const a = analyzeAudioQuality(simulate({ cubic: k }), st.meta);
  const thd = mv(a, 'aq_thd_percent');
  assert.ok(Math.abs(thd - expected) / expected < 0.1, `${thd} vs ${expected}`);
  assert.ok(mv(a, 'aq_thdn_percent') >= thd * 0.95);
  assert.equal(evaluateAudioQuality(a.measurements).findings.some(f => f.id === 'aq-thdn'), true);
  const corr = analyzeAudioQuality(simulate({ cubic: k }), st.meta, { chainFloor: { thdnPercent: 1 } });
  assert.ok(mv(corr, 'aq_thdn_percent') < mv(a, 'aq_thdn_percent'));
  assert.ok(corr.measurements.find(x => x.metricId === 'aq_thdn_percent').qualityFlags.includes('chain-corrected'));
  // compression is flagged by the linearity step
  assert.ok(mv(analyzeAudioQuality(simulate({ cubic: -30 }), st.meta), 'aq_linearity_db') > 0.5);
});

test('noise floor, SNR and DC are measured', () => {
  const sigma = 10 ** (-70 / 20);
  const a = analyzeAudioQuality(simulate({ noiseRms: sigma }), st.meta);
  assert.ok(Math.abs(mv(a, 'aq_noise_unweighted_dbfs') + 70) < 0.7, String(mv(a, 'aq_noise_unweighted_dbfs')));
  let acc = 0, cnt = 0; for (let f = 10; f < SR / 2; f += 10) { acc += 10 ** (aWeightDb(f) / 10); cnt++; }
  const expectedA = -70 + 10 * Math.log10(acc / cnt);
  assert.ok(Math.abs(mv(a, 'aq_noise_floor_dbfs') - expectedA) < 1, `${mv(a, 'aq_noise_floor_dbfs')} vs ${expectedA}`);
  assert.ok(mv(a, 'aq_snr_db') < 55 && mv(a, 'aq_snr_db') > 40);
  assert.equal(evaluateAudioQuality(a.measurements).findings.some(f => f.id === 'aq-snr'), true);
});

test('frequency response roll-off, crosstalk, polarity, dropout and clock offset', () => {
  const lp = analyzeAudioQuality(simulate({ lowpassHz: 8000 }), st.meta);
  const mag = f => { const a = 1 - Math.exp(-2 * Math.PI * 8000 / SR), w = 2 * Math.PI * f / SR; return 20 * Math.log10(a / Math.hypot(1 - (1 - a) * Math.cos(w), (1 - a) * Math.sin(w))); };
  for (const r of lp.response) assert.ok(Math.abs(r.devDb - (mag(r.hz) - mag(1000))) < 0.2, `${r.hz}: ${r.devDb} vs ${mag(r.hz) - mag(1000)}`);
  assert.ok(Math.abs(mv(lp, 'aq_response_flatness_db') - Math.abs(mag(10000) - mag(1000))) < 0.2);
  assert.equal(evaluateAudioQuality(lp.measurements).findings.some(f => f.id === 'aq-response'), true);

  const xt = analyzeAudioQuality(simulate({ xtalkDb: -40 }), st.meta);
  assert.ok(Math.abs(mv(xt, 'aq_separation_db') - 40) < 1.5, String(mv(xt, 'aq_separation_db')));
  assert.equal(evaluateAudioQuality(xt.measurements).findings.some(f => f.id === 'aq-xtalk'), true);

  const inv = analyzeAudioQuality(simulate({ invertR: true }), st.meta);
  assert.equal(mv(inv, 'aq_polarity_inverted'), 1);
  assert.equal(evaluateAudioQuality(inv.measurements).findings.some(f => f.id === 'aq-polarity'), true);

  const tone = st.meta.segments.find(s => s.name === 'tone');
  const at = tone.start + 137 + Math.round(SR * 0.9);
  const dr = analyzeAudioQuality(simulate({ dropout: [at, at + Math.round(SR * 0.005)] }), st.meta);
  assert.equal(mv(dr, 'aq_dropouts'), 2);
  assert.equal(evaluateAudioQuality(dr.measurements).status, 'fail');

  const clk = analyzeAudioQuality(simulate({ ppm: 100 }), st.meta);
  assert.ok(Math.abs(Math.abs(mv(clk, 'aq_clock_offset_ppm')) - 100) < 20, String(mv(clk, 'aq_clock_offset_ppm')));
  assert.ok(mv(clk, 'aq_thdn_percent') < 0.2, String(mv(clk, 'aq_thdn_percent')));
});

test('bad captures give an issue, never a crash', () => {
  const sil = { left: new Float32Array(st.left.length + SR), right: new Float32Array(st.left.length + SR), sampleRate: SR };
  assert.equal(analyzeAudioQuality(sil, st.meta).issues[0].code, 'NO_SIGNAL');
  const gn = gauss(rng(9)); const noise = Float32Array.from({ length: st.left.length + SR }, () => 0.05 * gn());
  assert.equal(analyzeAudioQuality({ left: noise, right: noise, sampleRate: SR }, st.meta).issues[0].code, 'NO_MARKER');
  const cap = simulate({});
  const short = { left: cap.left.subarray(0, Math.round(SR * 4)), right: cap.right.subarray(0, Math.round(SR * 4)), sampleRate: SR };
  assert.equal(analyzeAudioQuality(short, st.meta).issues[0].code, 'CAPTURE_TOO_SHORT');
  assert.equal(analyzeAudioQuality({ left: cap.left, right: cap.right, sampleRate: 44100 }, st.meta).issues[0].code, 'BAD_INPUT');
  assert.equal(analyzeAudioQuality(null, st.meta).issues[0].code, 'BAD_INPUT');
  const dead = simulate({}); dead.right.fill(0);
  const d = analyzeAudioQuality(dead, st.meta);
  assert.ok(d.issues.some(i => i.code === 'CHANNEL_DEAD'));
});

test('thresholds and spec notes', () => {
  assert.ok(DEFAULT_THRESHOLDS.every(t => t.id && t.title && t.meaning && t.action));
  const notes = profileSpecNotes({ specs: [{ key: 'thd_n', label: 'THD+N', value: 0.005, unit: '%', confidence: 'confirmed', source: 'manual' }, { key: 'weight', value: 1 }] });
  assert.equal(notes.length, 1);
  assert.match(notes[0].title, /THD\+N/);
  assert.equal(evaluateAudioQuality([]).status, 'unknown');
});
