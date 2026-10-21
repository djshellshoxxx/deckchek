// Output audio-quality test (SPEC-35): stimulus program + pure analysis. No DOM, no I/O.
// The stimulus is peak-normalised by audio_out, so segment levels are stored relative to the
// buffer peak (`relDb`); actual dBFS = meta.playLevelDbfs + relDb.
import { normalizeMeasurement, dbfs, rms, clippingCount, humMetrics } from './core.js';
import { markerSignal, detectMarkerLag, fitTone, refineToneFrequency } from './calibration.js';
import { evaluatePass } from './device-checks.js';

export const AQ_VERSION = 1;
export const DEFAULT_PLAY_LEVEL_DBFS = -12; // audio_out absolute cap
export const RESPONSE_HZ = Object.freeze([20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 20000]);
const TONE_REL_DB = -8;          // -20 dBFS at the default -12 dBFS play level
const LIN_LOW_REL_DB = -28;      // -40 dBFS
const EDGE_SEC = 0.005, LEAD_SEC = 0.3, GAP_SEC = 0.15, TAIL_SEC = 0.3, SILENCE_SEC = 1.5, TONE_SEC = 2.0, XTALK_SEC = 1.0, LIN_SEC = 0.5;
const db2amp = d => 10 ** (d / 20);
const round = (v, d = 3) => (v == null || !Number.isFinite(v) ? v : Math.round(v * 10 ** d) / 10 ** d);
const m = (metricId, label, value, unit, extra = {}) => normalizeMeasurement({ metricId, label, value, unit, ...extra });

// ---------- stimulus ----------
/** Stereo stimulus program. Peak amplitude is exactly 1.0 (the -12 dB linearity step). */
export function buildStimulus({ sampleRate = 48000, playLevelDbfs = DEFAULT_PLAY_LEVEL_DBFS } = {}) {
  if (!Number.isInteger(sampleRate) || sampleRate < 22050) throw new RangeError('sampleRate must be an integer >= 22050');
  const sr = sampleRate, S = s => Math.round(s * sr);
  const defs = [{ name: 'silence', channels: '', hz: 0, relDb: -Infinity, sec: SILENCE_SEC },
    { name: 'tone', channels: 'LR', hz: 1000, relDb: TONE_REL_DB, sec: TONE_SEC },
    { name: 'lin-low', channels: 'LR', hz: 1000, relDb: LIN_LOW_REL_DB, sec: LIN_SEC },
    { name: 'lin-high', channels: 'LR', hz: 1000, relDb: 0, sec: LIN_SEC }];
  // the time layout does not depend on the sample rate: steps above 0.45*sr stay in the layout but are silent and skipped
  for (const hz of RESPONSE_HZ) defs.push({ name: 'resp', channels: hz < 0.45 * sr ? 'LR' : '', hz, relDb: TONE_REL_DB, sec: Math.max(0.4, 16 / hz), skipped: hz >= 0.45 * sr });
  defs.push({ name: 'xtalk-L', channels: 'L', hz: 1000, relDb: TONE_REL_DB, sec: XTALK_SEC }, { name: 'xtalk-R', channels: 'R', hz: 1000, relDb: TONE_REL_DB, sec: XTALK_SEC });
  const marker = markerSignal(sr, db2amp(TONE_REL_DB));
  const markerStart = S(LEAD_SEC), markerEnd = markerStart + marker.length;
  let pos = markerEnd + S(GAP_SEC);
  const segments = defs.map(d => { const start = pos, end = start + S(d.sec); pos = end; return { ...d, start, end }; });
  const total = pos + S(TAIL_SEC);
  const left = new Float32Array(total), right = new Float32Array(total);
  left.set(marker, markerStart); right.set(marker, markerStart);
  const edge = S(EDGE_SEC);
  for (const s of segments) {
    if (!s.channels) continue;
    const amp = db2amp(s.relDb), n = s.end - s.start;
    for (let i = 0; i < n; i++) {
      const g = i < edge ? 0.5 - 0.5 * Math.cos(Math.PI * i / edge) : i >= n - edge ? 0.5 - 0.5 * Math.cos(Math.PI * (n - 1 - i) / edge) : 1;
      const v = amp * g * Math.sin(2 * Math.PI * s.hz * i / sr);
      if (s.channels.includes('L')) left[s.start + i] = v;
      if (s.channels.includes('R')) right[s.start + i] = v;
    }
  }
  return { left, right, meta: { version: AQ_VERSION, sampleRate: sr, playLevelDbfs, markerStart, markerLength: marker.length, segments, totalSamples: total, durationSec: total / sr } };
}

// ---------- A-weighting (IEC 61672 analogue response, applied in the frequency domain) ----------
/** A-weighting gain in dB, 0 dB at 1 kHz. */
export function aWeightDb(f) {
  const ra = x => { const f2 = x * x; return (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2)); };
  return 20 * Math.log10(ra(f) / ra(1000));
}

function fft(re, im) { // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** RMS of `samples` after A-weighting (DC excluded). Uses the largest power-of-two Hann-windowed block(s). */
export function aWeightedRms(samples, sampleRate) {
  let n = 1; while (n * 2 <= samples.length) n *= 2;
  if (n < 1024) return rms(samples);
  const re = new Float64Array(n), im = new Float64Array(n);
  let sw = 0;
  for (let i = 0; i < n; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); re[i] = samples[i] * w; sw += w * w; }
  fft(re, im);
  let acc = 0;
  for (let k = 1; k < n; k++) {
    const f = Math.min(k, n - k) * sampleRate / n;
    const wg = db2amp(aWeightDb(f));
    acc += (re[k] * re[k] + im[k] * im[k]) * wg * wg;
  }
  return Math.sqrt(acc / (n * sw));
}

// ---------- analysis ----------
const issue = (code, message, severity = 'error') => ({ code, message, severity });

function detectDropouts(x, fit, sr, w) {
  const n = x.length, win = Math.max(8, Math.round(sr * 0.001));
  const mask = new Uint8Array(n), env = [];
  for (let i = 0; i + win <= n; i += win) { let s = 0; for (let k = 0; k < win; k++) s += x[i + k] * x[i + k]; env.push(Math.sqrt(s / win)); }
  const med = [...env].sort((a, b) => a - b)[Math.floor(env.length / 2)] || 0;
  env.forEach((e, k) => { if (med > 0 && e < med * 0.5) mask.fill(1, k * win, (k + 1) * win); });
  const thr = Math.max(8 * fit.residualRms, db2amp(-70));
  for (let i = 0; i < n; i++) {
    const r = x[i] - (fit.amplitude * Math.sin(w * i + fit.phase) + fit.dc);
    if (Math.abs(r) > thr) mask[i] = 1;
  }
  const gap = Math.round(sr * 0.002);
  let events = 0, last = -Infinity;
  for (let i = 0; i < n; i++) if (mask[i]) { if (i - last > gap) events++; last = i; }
  return events;
}

/**
 * Analyse a capture of buildStimulus().
 * captured: {left, right, sampleRate}; meta: stimulus meta.
 * opts: {chainFloor:{thdnPercent}, calibrated:boolean, trimSec}
 * Returns {valid, issues, measurements, response[], channels, clockPpm, lagSamples}.
 */
export function analyzeAudioQuality(captured, meta, { chainFloor = null, calibrated = false, trimSec = 0.05 } = {}) {
  const out = { valid: false, issues: [], measurements: [], response: [], channels: {}, clockPpm: null, lagSamples: null };
  const sr = meta?.sampleRate;
  const L = captured?.left, R = captured?.right;
  if (!L || !R || !L.length || captured.sampleRate !== sr) { out.issues.push(issue('BAD_INPUT', 'Capture is missing or its sample rate differs from the stimulus.')); return out; }
  const marker = markerSignal(sr, 1);
  const eL = rms(L), eR = rms(R);
  if (Math.max(eL, eR) < db2amp(-80)) { out.issues.push(issue('NO_SIGNAL', 'The capture is silent. Check the cable, the output selection and the input gain.')); return out; }
  const ref = eL >= eR ? L : R;
  const det = detectMarkerLag(ref, marker, sr, { maxLagSec: 2 });
  if (det.lag == null || det.strength < 0.3) { out.issues.push(issue('NO_MARKER', 'The alignment marker was not found. The signal is too weak, distorted or the wrong input pair is selected.')); return out; }
  const shift = Math.round(det.lag) - meta.markerStart;
  out.lagSamples = det.lag - meta.markerStart;
  const seg = (name, hz = null) => meta.segments.filter(s => s.name === name && (hz == null || s.hz === hz));
  const trim = Math.round(trimSec * sr);
  const slice = (x, s, extra = 0) => {
    const a = s.start + shift + trim + extra, b = s.end + shift - trim - extra;
    return a >= 0 && b <= x.length && b - a > 64 ? x.subarray(a, b) : null;
  };
  const need = ['silence', 'tone', 'lin-low', 'lin-high', 'xtalk-L', 'xtalk-R'];
  for (const name of need) if (!slice(L, seg(name)[0]) || !slice(R, seg(name)[0])) { out.issues.push(issue('CAPTURE_TOO_SHORT', `The capture ends before the “${name}” section. Record for the whole stimulus length plus one second.`)); return out; }

  const chans = { L, R };
  const actual = s => meta.playLevelDbfs + s.relDb;
  const toneSeg = seg('tone')[0];
  // clock offset between playback and capture, from the long tone
  const ppms = Object.values(chans).map(x => refineToneFrequency(slice(x, toneSeg), sr, 1000).ppm).filter(Number.isFinite);
  const clockPpm = ppms.length ? ppms.reduce((a, b) => a + b, 0) / ppms.length : 0;
  out.clockPpm = clockPpm;
  const fAt = hz => hz * (1 + clockPpm * 1e-6);
  const fitAt = (x, s, hz = s.hz) => fitTone(slice(x, s), sr, fAt(hz));

  const per = {};
  for (const [c, x] of Object.entries(chans)) {
    const xs = slice(x, toneSeg), f0 = fAt(1000);
    const fit = fitTone(xs, sr, f0);
    const toneRms = fit.amplitude / Math.SQRT2;
    let thdn = toneRms > 0 ? (fit.residualRms / toneRms) * 100 : NaN;
    let flags = calibrated ? [] : ['uncalibrated-chain'];
    if (chainFloor?.thdnPercent > 0) { thdn = Math.sqrt(Math.max(0, thdn ** 2 - chainFloor.thdnPercent ** 2)); flags = [...flags, 'chain-corrected']; }
    let harm = 0;
    for (let k = 2; k <= 9 && k * f0 < 0.45 * sr; k++) harm += fitTone(xs, sr, k * f0).amplitude ** 2;
    const thd = fit.amplitude > 0 ? (Math.sqrt(harm) / fit.amplitude) * 100 : NaN;
    const sil = slice(x, seg('silence')[0], Math.round(0.1 * sr));
    const dc = sil.reduce((a, v) => a + v, 0) / sil.length;
    const centred = Float32Array.from(sil, v => v - dc);
    const noiseA = aWeightedRms(centred, sr), noiseU = rms(centred);
    const hum = humMetrics(sil, sr);
    const low = fitAt(x, seg('lin-low')[0]), high = fitAt(x, seg('lin-high')[0]);
    const lowS = seg('lin-low')[0], highS = seg('lin-high')[0];
    per[c] = {
      fit, flags, thdn, thd, dc, noiseA, noiseU, hum,
      gainDb: dbfs(fit.amplitude) - actual(toneSeg),
      gainLow: dbfs(low.amplitude) - actual(lowS), gainHigh: dbfs(high.amplitude) - actual(highS),
      snr: dbfs(toneRms) - dbfs(noiseA),
      dropouts: detectDropouts(xs, fit, sr, 2 * Math.PI * f0 / sr),
      clip: clippingCount(xs),
    };
    // polarity: phase of the capture against the ideal stimulus phase at the slice start
    const ph = fit.phase - 2 * Math.PI * 1000 * trim / sr;
    per[c].phaseDeg = Math.atan2(Math.sin(ph), Math.cos(ph)) * 180 / Math.PI;
  }
  out.channels = per;
  for (const c of ['L', 'R']) if (dbfs(per[c].fit.amplitude) < -70) out.issues.push(issue('CHANNEL_DEAD', `The ${c === 'L' ? 'left' : 'right'} channel is below −70 dBFS during the tone.`, 'warning'));

  // frequency response (levels relative to the 1 kHz tone, mean of both channels)
  const ref1k = Object.fromEntries(Object.keys(chans).map(c => [c, per[c].fit.amplitude]));
  for (const s of seg('resp').filter(x => !x.skipped)) {
    const devs = Object.entries(chans).map(([c, x]) => 20 * Math.log10(Math.max(fitAt(x, s).amplitude, 1e-12) / Math.max(ref1k[c], 1e-12)));
    out.response.push({ hz: s.hz, devDb: round(devs.reduce((a, b) => a + b, 0) / devs.length, 3), devLeftDb: round(devs[0], 3), devRightDb: round(devs[1], 3) });
  }
  // crosstalk
  const sepOf = (drv, leak, name) => { const s = seg(name)[0]; const a = fitAt(chans[drv], s).amplitude, b = fitAt(chans[leak], s).amplitude; return 20 * Math.log10(Math.max(a, 1e-12) / Math.max(b, 1e-12)); };
  const sepLR = sepOf('L', 'R', 'xtalk-L'), sepRL = sepOf('R', 'L', 'xtalk-R');

  const w = c => per[c];
  const worst = k => Math.max(w('L')[k], w('R')[k]);
  const flat = out.response.filter(r => r.hz >= 100 && r.hz <= 10000).map(r => Math.abs(r.devDb));
  const lowR = out.response[0], highR = out.response[out.response.length - 1];
  const bal = w('L').gainDb - w('R').gainDb;
  const flags = per.L.flags;
  const polarityInv = (Math.abs(w('L').phaseDeg) > 90 || Math.abs(w('R').phaseDeg) > 90) ? 1 : 0;
  const hum = Math.max(w('L').hum.mainsDb - dbfs(w('L').fit.amplitude), w('R').hum.mainsDb - dbfs(w('R').fit.amplitude));
  const ms = out.measurements;
  ms.push(
    m('aq_gain_db', 'Output gain (capture vs digital level)', round((w('L').gainDb + w('R').gainDb) / 2, 2), 'dB', { confidence: calibrated ? 1 : 0.6, qualityFlags: flags }),
    m('aq_thdn_percent', 'THD+N at 1 kHz', round(worst('thdn'), 4), '%', { qualityFlags: flags }),
    m('aq_thdn_db', 'THD+N at 1 kHz', round(20 * Math.log10(Math.max(worst('thdn'), 1e-9) / 100), 2), 'dB', { qualityFlags: flags }),
    m('aq_thd_percent', 'THD (harmonics 2–9)', round(worst('thd'), 4), '%', { qualityFlags: flags }),
    m('aq_noise_floor_dbfs', 'Noise floor (A-weighted)', round(worst('noiseA') > 0 ? dbfs(worst('noiseA')) : -140, 1), 'dBFS', { qualityFlags: flags }),
    m('aq_noise_unweighted_dbfs', 'Noise floor (unweighted)', round(worst('noiseU') > 0 ? dbfs(worst('noiseU')) : -140, 1), 'dBFS', { qualityFlags: flags }),
    m('aq_snr_db', 'Signal-to-noise (A-weighted)', round(Math.min(w('L').snr, w('R').snr), 1), 'dB', { qualityFlags: flags }),
    m('aq_dc_offset_percent', 'DC offset', round(Math.max(Math.abs(w('L').dc), Math.abs(w('R').dc)) * 100, 4), '%'),
    m('aq_hum_db', 'Mains hum vs tone', round(hum, 1), 'dB'),
    m('aq_balance_db', 'Channel balance L−R', round(bal, 3), 'dB', { qualityFlags: flags }),
    m('aq_polarity_inverted', 'Polarity inverted', polarityInv, 'bool'),
    m('aq_separation_db', 'Channel separation at 1 kHz', round(Math.min(sepLR, sepRL), 1), 'dB', { qualityFlags: Math.min(sepLR, sepRL) > 100 ? [...flags, 'noise-limited'] : flags }),
    m('aq_response_flatness_db', 'Frequency response flatness 100 Hz–10 kHz', round(flat.length ? Math.max(...flat) : NaN, 3), 'dB', { qualityFlags: flags }),
    ...(lowR ? [m('aq_response_low_db', `Response at ${lowR.hz} Hz`, lowR.devDb, 'dB')] : []),
    ...(highR ? [m('aq_response_high_db', `Response at ${highR.hz} Hz`, highR.devDb, 'dB')] : []),
    m('aq_linearity_db', 'Level linearity (−40 vs −12 dBFS)', round(Math.max(Math.abs(w('L').gainHigh - w('L').gainLow), Math.abs(w('R').gainHigh - w('R').gainLow)), 3), 'dB'),
    m('aq_clipping_samples', 'Clipped samples in tone', w('L').clip + w('R').clip, 'samples'),
    m('aq_dropouts', 'Dropouts / glitches in tone', w('L').dropouts + w('R').dropouts, 'events'),
    m('aq_clock_offset_ppm', 'Capture vs playback clock offset', round(clockPpm, 1), 'ppm', { confidence: 0.7 }),
    m('aq_latency_ms', 'Playback-to-capture delay', round(out.lagSamples / sr * 1000, 2), 'ms', { confidence: 0.6 }),
  );
  out.separation = { leftToRight: round(sepLR, 1), rightToLeft: round(sepRL, 1) };
  out.valid = true;
  return out;
}

// ---------- thresholds & findings ----------
export const DEFAULT_THRESHOLDS = Object.freeze([
  { metricId: 'aq_thdn_percent', op: '<=', value: 0.3, unit: '%', severity: 'major', id: 'thdn', title: 'Distortion is high', meaning: 'THD+N above 0.3 % at 1 kHz is audible as harshness. The output stage, a gain setting that is too hot, or the capture chain may be at fault.', action: 'Lower the unit’s master/trim level, retest with the loopback calibration, and compare against a known-good device.' },
  { metricId: 'aq_snr_db', op: '>=', value: 70, unit: 'dB', severity: 'major', id: 'snr', title: 'Noise floor is high', meaning: 'Signal-to-noise below 70 dB means hiss or interference is close to audible in quiet passages.', action: 'Check cables and grounding, move away from power supplies, and test the unit’s other outputs.' },
  { metricId: 'aq_separation_db', op: '>=', value: 50, unit: 'dB', severity: 'major', id: 'xtalk', title: 'Channel separation is poor', meaning: 'Signal leaks from one channel into the other, which narrows the stereo image and can indicate a failing stage or a bad cable.', action: 'Swap cables, retest, and inspect the output jacks.' },
  { metricId: 'aq_balance_db', op: 'abs<=', value: 0.5, unit: 'dB', severity: 'minor', id: 'balance', title: 'Left and right levels differ', meaning: 'A channel imbalance above 0.5 dB shifts the stereo image.', action: 'Check the balance setting and the output pots or faders; compare cables.' },
  { metricId: 'aq_response_flatness_db', op: '<=', value: 1.0, unit: 'dB', severity: 'minor', id: 'response', title: 'Frequency response is not flat', meaning: 'The level changes by more than 1 dB between 100 Hz and 10 kHz, so the output is audibly tilted or filtered.', action: 'Check EQ, filter and isolator positions are neutral, then retest.' },
  { metricId: 'aq_linearity_db', op: '<=', value: 0.5, unit: 'dB', severity: 'minor', id: 'linearity', title: 'Output compresses at higher levels', meaning: 'The gain changes by more than 0.5 dB between −40 and −12 dBFS: a limiter, soft-clip or failing stage is active.', action: 'Turn off limiters/effects and retest at a lower level.' },
  { metricId: 'aq_dropouts', op: 'equals', value: 0, unit: 'events', severity: 'critical', id: 'dropouts', title: 'Dropouts or glitches detected', meaning: 'The steady tone was interrupted. Buffer under-runs, USB problems or a loose connector cause this.', action: 'Use a direct USB port, raise the buffer size and re-seat the cable.' },
  { metricId: 'aq_polarity_inverted', op: 'equals', value: 0, unit: 'bool', severity: 'major', id: 'polarity', title: 'Polarity is inverted', meaning: 'A channel is out of phase with the digital signal; mixed with a correct channel, bass cancels.', action: 'Check for a miswired cable or output; correct the wiring.' },
  { metricId: 'aq_clipping_samples', op: 'equals', value: 0, unit: 'samples', severity: 'major', id: 'clip', title: 'The capture clipped', meaning: 'The recording input overloaded, so the distortion figures are not valid.', action: 'Lower the input gain on the recording interface and rerun.' },
]);

const SEV = { critical: 'error', major: 'error', minor: 'warning' };

/** Evaluate every threshold. Returns {status, results:[{threshold, status, detail}], findings}. */
export function evaluateAudioQuality(measurements, thresholds = DEFAULT_THRESHOLDS) {
  const results = thresholds.map(t => ({ threshold: t, ...evaluatePass({ metricId: t.metricId, op: t.op, value: t.value, unit: t.unit, source: 'DeckChek test definition' }, measurements) }));
  const findings = results.filter(r => r.status === 'fail').map(r => ({ id: `aq-${r.threshold.id}`, severity: SEV[r.threshold.severity] || 'warning', title: r.threshold.title, meaning: r.threshold.meaning, action: r.threshold.action, evidence: [r.detail] }));
  const bad = results.filter(r => r.status === 'fail');
  const clipped = results.find(r => r.threshold.id === 'clip' && r.status === 'fail');
  const status = bad.length ? 'fail' : results.some(r => r.status === 'unknown') ? 'unknown' : 'pass';
  return { status: clipped ? 'unknown' : status, results, findings, detail: bad.length ? `${bad.length} of ${results.length} checks failed: ${bad.map(r => r.threshold.id).join(', ')}.` : 'All output-quality checks passed.' };
}

/** Findings for analysis problems (no marker, dead channel, ...). */
export function issueFindings(issues = []) {
  return issues.map(i => ({ id: `aq-${i.code.toLowerCase()}`, severity: i.severity === 'error' ? 'error' : 'warning', title: i.message, meaning: '', action: '' }));
}

/** Informational findings quoting manufacturer figures from the profile for comparison. */
export function profileSpecNotes(profile) {
  const keys = /thd|snr|noise|freq_resp|crosstalk|dynamic/;
  return (profile?.specs || []).filter(s => keys.test(s.key)).map(s => ({
    id: `aq-spec-${s.key}`, severity: 'info', title: `Manufacturer figure: ${s.label || s.key} = ${s.value}${s.unit ? ` ${s.unit}` : ''}`,
    meaning: `For comparison only (${s.confidence === 'confirmed' ? 'confirmed' : 'unverified'}; ${s.source || 'no source'}). DeckChek measures through your recording interface, so its own floor limits the result.`, action: '',
  }));
}
