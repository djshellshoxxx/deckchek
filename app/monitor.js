// FS-31 Timecode doctor live monitor: pure streaming analysis engine. No DOM, no Tauri.
//
// One monitor per deck (one stereo input pair). The UI feeds it the hops of the FS-00 §4.7 streaming capture
// (250 ms stereo f32 blocks) through push(left, right, sampleRate) and gets one frame per hop:
//   {deck, t, levelDb, snrDb, driftDeg, humDb, dropouts, locked, carrierHz, speedPct, phaseDeg, jitterDeg,
//    balanceDb, direction, motion, state, alerts, minute}
//
// Method (FS-31 §6), all on fixed-size typed-array rings so memory is flat for multi-hour sessions:
// - The stream is cut into 20 ms sub-blocks (the dropoutMetrics window). Each sub-block gets: RMS per channel,
//   the carrier frequency from hysteresis zero crossings on the primary channel (interpolated first..last
//   rising crossing), and the complex carrier amplitude of both channels at that frequency (one rotating
//   phasor, i.e. a single-bin DFT). Carrier power vs residual (total minus carrier) gives a per-sub-block SNR;
//   the frame SNR is the median over the 0.5 s window, so partial sub-blocks at a dropout edge do not count.
//   The single bin of a 20 ms block is about +-50 Hz wide: the "carrier band" of the spec.
// - L/R phase = angle of sum(Z_R conj Z_L): right minus left, the analyzeTimecode convention; direction via
//   app/timecode.js directionFromPhase / directionSign (handles phaseSign -1 and left-primary formats).
//   driftDeg = |phase| - 90 (quadrature error); jitterDeg = circular std of the sub-block phase differences.
// - Hum: Hann-windowed Goertzel at 50/60 Hz and harmonics 2-5 (as humMetrics in app/core.js) on a decimated
//   mono ring, minus the local noise floor from bins between the harmonics. humMetrics itself is not used
//   because its rectangular window leaks the timecode carrier into the mains bins.
// - Dropouts: dropoutMetrics rules (20 ms windows, 24 dB below the 75th-percentile level, at least 2 windows)
//   applied incrementally, counted only when the deck was playing steadily before the gap and the carrier
//   comes back at the same speed (a hand stop, cue or backspin changes the speed, a dust skip does not).
// Alarm rules (FS-31 §6, tunable defaults, not sourced) are evaluated only on "play" frames (locked, forward,
// steady speed). The SNR floor also accepts a coherent continuation of a recently healthy carrier when noise
// defeats zero-crossing tracking; cueing, scratching and backspins otherwise freeze the counters. Hysteresis:
// raise after N consecutive frames, clear after 2N; cooldown per (deck, kind) 60 s.

import { dbfs } from './core.js';
import { TIMECODE_FORMATS, findFormat, directionFromPhase } from './timecode.js';

export const MONITOR_SETTINGS_VERSION = 1;
export const SETTINGS_KEY = 'monitor'; // app_state key (FS-00 §4.5)
export const HOLDER = 'live-monitor';  // capture lease holder (FS-00 §4.7)
export const MAX_DECKS = 4;
export const DECKS = Object.freeze(['A', 'B', 'C', 'D']);
export const SUB_BLOCK_SEC = 0.02;
const IDLE_CLEAR_SEC = 1; // idle this long clears the play-only rules (a lift or a stop, not a dust gap)

/**
 * Tunable defaults (FS-31 §6). healthySnrDb matches the analyzeTimecode 'tc-snr' error cut (15 dB) and
 * presenceDb the diagnostics presenceThresholdDb (-55 dBFS), so the monitor agrees with the offline checks.
 */
export const DEFAULT_THRESHOLDS = Object.freeze({
  snrDropDb: 6, snrDropSec: 5, snrFloorDb: 12, snrFloorSec: 2, healthySnrDb: 15,
  dropoutDb: 24, dropoutCount: 3, dropoutSpanSec: 10, maxDropoutSec: 1,
  humRiseDb: 10, humSec: 5, humMinDbfs: -80, humAboveFloorDb: 6,
  phaseRateDegPerSec: 5, phaseJitterDeg: 15, phaseSec: 5,
  presenceDb: -55, idleInfoSec: 10, minBaselineSec: 10,
});
const THRESHOLD_RANGES = {
  snrDropDb: [1, 40], snrDropSec: [0.5, 60], snrFloorDb: [0, 40], snrFloorSec: [0.25, 60], healthySnrDb: [0, 60],
  dropoutDb: [6, 60], dropoutCount: [1, 50], dropoutSpanSec: [1, 120], maxDropoutSec: [0.04, 5],
  humRiseDb: [1, 40], humSec: [0.5, 60], humMinDbfs: [-140, 0], humAboveFloorDb: [0, 40],
  phaseRateDegPerSec: [0.5, 90], phaseJitterDeg: [1, 90], phaseSec: [0.5, 60],
  presenceDb: [-90, -20], idleInfoSec: [1, 600], minBaselineSec: [1, 60],
};
export const DEFAULT_SETTINGS = Object.freeze({
  version: MONITOR_SETTINGS_VERSION, thresholds: DEFAULT_THRESHOLDS, cooldownSec: 60, toastsEnabled: true, sound: false, retentionDays: 90,
});
export const MAX_RETENTION_DAYS = 3650;

const clampNum = (v, [lo, hi], d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);

/** Validate the `monitor` app_state value (version 1); unknown keys dropped, numbers clamped, defaults filled. */
export function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const t = r.thresholds && typeof r.thresholds === 'object' ? r.thresholds : {};
  const thresholds = {};
  for (const [k, d] of Object.entries(DEFAULT_THRESHOLDS)) thresholds[k] = clampNum(t[k], THRESHOLD_RANGES[k], d);
  return {
    version: MONITOR_SETTINGS_VERSION,
    thresholds,
    cooldownSec: clampNum(r.cooldownSec, [0, 3600], 60),
    toastsEnabled: r.toastsEnabled !== false,
    sound: r.sound === true,
    retentionDays: Math.round(clampNum(r.retentionDays, [1, MAX_RETENTION_DAYS], 90)),
  };
}

// ---------------------------------------------------------------- small bounded helpers

/** Fixed-capacity numeric ring (Float64Array). values() returns oldest..newest. */
export function createRing(capacity) {
  const cap = Math.max(1, Math.floor(capacity));
  const buf = new Float64Array(cap);
  let n = 0, head = 0;
  return {
    capacity: cap,
    push(v) { buf[head] = v; head = (head + 1) % cap; if (n < cap) n++; },
    get size() { return n; },
    /** i = 0 is the newest value. */
    at(i) { return i < n ? buf[(head - 1 - i + cap * 2) % cap] : NaN; },
    values(out) { const o = out && out.length >= n ? out : new Float64Array(n); for (let i = 0; i < n; i++) o[i] = buf[(head - n + i + cap) % cap]; return n === o.length ? o : o.subarray(0, n); },
    clear() { n = 0; head = 0; },
  };
}

/** Median of the finite values of a typed array or array (copies; for small rings only). */
export function median(values) {
  const v = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1) + 0.5)));
  return sorted[i];
}

/** Capped in-memory event log (newest last). Older entries are dropped and counted. */
export function createEventLog(cap = 500) {
  const max = Math.max(1, Math.floor(cap));
  let items = [], dropped = 0;
  return {
    add(ev) { items.push(ev); if (items.length > max) { const extra = items.length - max; items = items.slice(extra); dropped += extra; } return ev; },
    list() { return items.slice(); },
    get size() { return items.length; },
    get dropped() { return dropped; },
    clear() { items = []; dropped = 0; },
  };
}

// ---------------------------------------------------------------- engine

const TAU = 2 * Math.PI;
const DEG = 180 / Math.PI;
// Carrier-evidence discriminator, not an alarm threshold: both channels must retain phase coherence over a full
// window at the last healthy forward frequency. Unrelated noise and moving/scratched carriers do not qualify.
const REFERENCE_COHERENCE = 0.9;

function resolveFormat(format) {
  const fmt = typeof format === 'string' ? findFormat(format, TIMECODE_FORMATS) : format;
  if (!fmt || !Number.isFinite(fmt.carrierHz) || fmt.carrierHz <= 0) throw new Error(`Unknown timecode format: ${typeof format === 'string' ? format : fmt?.name ?? 'none'}`);
  return fmt;
}

/** Hann-windowed Goertzel amplitude (peak, linear) of `x` at `hz`. */
function goertzelHann(x, n, sr, hz) {
  const w = TAU * hz / sr, coeff = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const s0 = x[i] + coeff * s1 - s2; s2 = s1; s1 = s0; }
  const p = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return 4 * Math.sqrt(Math.max(p, 0)) / n; // sum(hann) = n/2, real tone peak A gives |Z| = A n/4
}

/** Butterworth (Q = 1/sqrt 2) high- or low-pass biquad, RBJ cookbook form: [b0, b1, b2, a1, a2] normalised by a0. */
function biquad(type, f0, sr) {
  const w = TAU * f0 / sr, cw = Math.cos(w), alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b = type === 'hp' ? [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2] : [(1 - cw) / 2, 1 - cw, (1 - cw) / 2];
  return Float64Array.from([b[0] / a0, b[1] / a0, b[2] / a0, -2 * cw / a0, (1 - alpha) / a0]);
}

const KIND_LABEL = { snrDrop: 'SNR drop', snrFloor: 'SNR below floor', dropouts: 'Dropouts', phase: 'Phase irregular', hum: 'Hum rise', noSignal: 'No signal', deviceLost: 'Audio device lost', deviceRestored: 'Audio device back' };
export const kindLabel = kind => KIND_LABEL[kind] || String(kind || 'Event');

/**
 * Create a per-deck streaming monitor.
 * @param {object} o
 * @param {string|object} o.format timecode format name or object (app/timecode.js TIMECODE_FORMATS).
 * @param {string} [o.deck='A']
 * @param {number} [o.hopMs=250] nominal hop (the caller's block size); used for frame-count hysteresis.
 * @param {number} [o.windowSec=0.5] analysis window.
 * @param {number} [o.baselineSec=60] SNR / hum baseline span.
 * @param {number} [o.nominalRpm=33.333333]
 * @param {object} [o.thresholds] overrides of DEFAULT_THRESHOLDS.
 * @param {number} [o.cooldownSec=60]
 */
export function createMonitor({ format, deck = 'A', hopMs = 250, windowSec = 0.5, baselineSec = 60, nominalRpm = 33.333333, thresholds = {}, cooldownSec = 60 } = {}) {
  const fmt = resolveFormat(format);
  const th = { ...normalizeSettings({ thresholds: { ...DEFAULT_THRESHOLDS, ...thresholds } }).thresholds };
  const hop = Math.min(2000, Math.max(20, Number(hopMs) || 250)) / 1000;
  const win = Math.min(2, Math.max(0.1, Number(windowSec) || 0.5));
  const baseSec = Math.min(600, Math.max(5, Number(baselineSec) || 60));
  const expectedHz = fmt.carrierHz * nominalRpm / (fmt.atRpm || 33.333333);
  const primaryLeft = fmt.primary === 'left';
  const frames = sec => Math.max(1, Math.round(sec / hop));
  const N = { snrDrop: frames(th.snrDropSec), snrFloor: frames(th.snrFloorSec), hum: frames(th.humSec), phase: frames(th.phaseSec) };
  const cooldownMs = Math.max(0, Number(cooldownSec) || 0) * 1000;

  // ---- per-sample-rate state (allocated once per rate) ----
  let sr = 0, S = 0, W = 0, D = 1, humN = 0;
  let carryL, carryR, carryN = 0;
  let fL, fR, fFreq, fSnr, fAmpL, fAmpR, fCrossRe, fCrossIm, fLevel, fMs, fHead = 0, fCount = 0, F = 0;
  let refLRe, refLIm, refRRe, refRIm;
  let referenceHz = NaN, referencePhase = 0, referenceCount = 0, referenceMisses = 0;
  let humRing, humPos = 0, humFill = 0, decAcc = 0, decCnt = 0, humBuf, hann;
  const DROP_REF = 100; // 2 s of 20 ms levels for the 75th-percentile reference
  const dropRef = createRing(DROP_REF);
  const scratch = new Float64Array(Math.max(DROP_REF, 512));

  // ---- session clock and tracking ----
  // t = base + samples / sr is the monitor's one session clock (seconds). It never goes back: a change of sample
  // rate folds the samples so far into `base`, and resume() moves it forward across a device outage, so alert
  // times and minute indexes stay monotonic for the whole session (FS-31 review: one time base, no repeated
  // minute rows).
  let samples = 0;          // samples consumed (per channel) at the current rate
  let base = 0;             // seconds before the current rate's first sample
  const clockSec = () => base + (sr ? samples / sr : 0);
  let zcArmed = false, zcPrev = 0, bpMs = 0;
  const bq = new Float64Array(4); // band filter state (HP z1, z2, LP z1, z2)
  let HP = null, LP = null;
  let lastFreq = NaN;       // last valid sub-block carrier frequency
  let prevCarrier = NaN;    // last frame carrier
  let lastMotion = 'idle';
  let dropThr = -Infinity;  // level threshold in dB for the dropout detector
  let run = 0, runPreFreq = NaN, runPreMotion = 'idle', pendingDrop = null;
  const dropTimes = [];     // sample times (s) of counted dropouts, pruned to the span
  const snrBase = createRing(frames(baseSec)), humBase = createRing(frames(baseSec));
  const phaseHist = createRing(frames(th.phaseSec));
  let humDb = -140, humFloorDb = -140, humMainsHz = null, hopCounter = 0;
  let idleSince = null, idleInfoRaised = false;
  const rules = {};
  const lastRaise = new Map();
  let minuteAcc = null, totals = null;
  let alertSeq = 0;

  function allocate(rate) {
    sr = rate;
    S = Math.max(8, Math.round(sr * SUB_BLOCK_SEC));
    W = Math.max(2, Math.round(win / SUB_BLOCK_SEC));
    F = Math.max(W, DROP_REF);
    carryL = new Float32Array(S); carryR = new Float32Array(S); carryN = 0;
    const mk = () => new Float64Array(F);
    fL = mk(); fR = mk(); fFreq = mk(); fSnr = mk(); fAmpL = mk(); fAmpR = mk(); fCrossRe = mk(); fCrossIm = mk(); fLevel = mk(); fMs = mk();
    refLRe = mk(); refLIm = mk(); refRRe = mk(); refRIm = mk();
    fHead = 0; fCount = 0;
    D = Math.max(1, Math.floor(sr / 12000));
    humN = Math.max(64, Math.round(win * sr / D));
    humRing = new Float32Array(humN); humBuf = new Float32Array(humN); humPos = 0; humFill = 0; decAcc = 0; decCnt = 0;
    hann = new Float32Array(humN);
    for (let i = 0; i < humN; i++) hann[i] = 0.5 - 0.5 * Math.cos(TAU * i / (humN - 1));
    HP = biquad('hp', Math.min(expectedHz * 0.35, sr * 0.2), sr);
    LP = biquad('lp', Math.min(expectedHz * 1.8, sr * 0.45), sr);
  }

  /** Signal tracking only (filters, rings, baselines, rules): a new or reopened stream. The session clock, totals,
   * the open minute, cooldowns and alert ids carry on. */
  function resetSignal() {
    zcArmed = false; zcPrev = 0; bpMs = 0; bq.fill(0); lastFreq = NaN; prevCarrier = NaN; lastMotion = 'idle';
    referenceHz = NaN; referencePhase = 0; referenceCount = 0; referenceMisses = 0;
    dropThr = -Infinity; run = 0; runPreFreq = NaN; runPreMotion = 'idle'; pendingDrop = null; dropTimes.length = 0;
    dropRef.clear(); snrBase.clear(); humBase.clear(); phaseHist.clear();
    humDb = -140; humFloorDb = -140; humMainsHz = null; hopCounter = 0; idleSince = null; idleInfoRaised = false;
    for (const k of ['snrDrop', 'snrFloor', 'dropouts', 'phase', 'hum']) rules[k] = { on: 0, off: 0, active: false };
    carryN = 0; fHead = 0; fCount = 0; humPos = 0; humFill = 0; decAcc = 0; decCnt = 0;
  }

  /** Full restart (reset()): clock back to 0, totals cleared. */
  function resetTracking() {
    resetSignal();
    samples = 0; base = 0;
    lastRaise.clear(); minuteAcc = null; alertSeq = 0;
    totals = { frames: 0, playFrames: 0, snrSum: 0, snrN: 0, snrMin: Infinity, humMax: -Infinity, driftMax: 0, dropouts: 0, alerts: { info: 0, warning: 0, critical: 0 } };
  }
  resetTracking();

  /** Play-only rules (SNR drop/floor, phase): cleared when the vinyl is stopped or lifted. */
  function clearPlayRules() {
    for (const k of ['snrDrop', 'snrFloor', 'phase']) rules[k] = { on: 0, off: 0, active: false };
  }

  // ---- one 20 ms sub-block ----
  function subBlock(L, R, o) {
    let sl = 0, sr2 = 0;
    for (let i = 0; i < S; i++) { const a = L[o + i], b = R[o + i]; sl += a * a; sr2 += b * b; }
    const msL = sl / S, msR = sr2 / S;
    const P = primaryLeft ? L : R;
    // zero crossings on the band-limited primary channel (0.35x..1.8x the nominal carrier: about 12 dB less
    // broadband noise, so the count stays right down to the 12 dB fault floor); the SNR uses the raw samples
    const hyst = 0.3 * Math.sqrt(bpMs);
    let cnt = 0, tFirst = 0, tLast = 0, prev = zcPrev, armed = zcArmed, bsum = 0;
    let h1 = bq[0], h2 = bq[1], l1 = bq[2], l2 = bq[3];
    for (let i = 0; i < S; i++) {
      const u = P[o + i];
      const yh = HP[0] * u + h1; h1 = HP[1] * u - HP[3] * yh + h2; h2 = HP[2] * u - HP[4] * yh;
      const x = LP[0] * yh + l1; l1 = LP[1] * yh - LP[3] * x + l2; l2 = LP[2] * yh - LP[4] * x;
      bsum += x * x;
      if (x < -hyst) armed = true;
      else if (armed && prev < 0 && x >= 0) {
        const t = i - 1 + prev / (prev - x);
        if (!cnt) tFirst = t;
        tLast = t; cnt++; armed = false;
      }
      prev = x;
    }
    zcPrev = prev; zcArmed = armed; bpMs = bsum / S;
    bq[0] = Number.isFinite(h1) ? h1 : 0; bq[1] = Number.isFinite(h2) ? h2 : 0; bq[2] = Number.isFinite(l1) ? l1 : 0; bq[3] = Number.isFinite(l2) ? l2 : 0;
    let f = cnt >= 3 && tLast > tFirst ? (cnt - 1) * sr / (tLast - tFirst) : NaN;
    if (!(f > 20 && f < sr / 2)) f = NaN;
    if (Number.isFinite(f)) lastFreq = f;
    const fd = Number.isFinite(f) ? f : Number.isFinite(lastFreq) ? lastFreq : expectedHz;
    // single-bin DFT at fd with a rotating phasor (renormalised per block)
    const w = TAU * fd / sr, cw = Math.cos(w), sw = Math.sin(w);
    let c = 1, s = 0, lr = 0, li = 0, rr = 0, ri = 0;
    for (let i = 0; i < S; i++) {
      const a = L[o + i], b = R[o + i];
      lr += a * c; li -= a * s; rr += b * c; ri -= b * s;
      const nc = c * cw - s * sw; s = s * cw + c * sw; c = nc;
    }
    const k = 2 / S;
    const aL = Math.hypot(lr, li) * k, aR = Math.hypot(rr, ri) * k;
    const car = (aL * aL + aR * aR) / 2, tot = msL + msR;
    const res = Math.max(tot - car, tot * 1e-7, 1e-30);
    const idx = fHead;
    if (Number.isFinite(referenceHz)) {
      // One fixed-frequency bin, phase-aligned across sub-blocks. Its full-window sum distinguishes a carrier
      // continuing under noise from the low apparent SNR caused by a changing scratch/cue frequency.
      const rw = TAU * referenceHz / sr, rcw = Math.cos(rw), rsw = Math.sin(rw);
      let c = Math.cos(referencePhase), s = Math.sin(referencePhase), lr = 0, li = 0, rr = 0, ri = 0;
      for (let i = 0; i < S; i++) {
        const a = L[o + i], b = R[o + i];
        lr += a * c; li -= a * s; rr += b * c; ri -= b * s;
        const nc = c * rcw - s * rsw; s = s * rcw + c * rsw; c = nc;
      }
      refLRe[idx] = lr; refLIm[idx] = li; refRRe[idx] = rr; refRIm[idx] = ri;
      referencePhase = (referencePhase + rw * S) % TAU;
      referenceCount = Math.min(W, referenceCount + 1);
    }
    fL[idx] = msL; fR[idx] = msR; fFreq[idx] = f; fAmpL[idx] = aL; fAmpR[idx] = aR;
    fSnr[idx] = car > 0 ? 10 * Math.log10(car / res) : -60;
    // Z_R * conj(Z_L): angle = right minus left
    fCrossRe[idx] = rr * lr + ri * li; fCrossIm[idx] = ri * lr - rr * li;
    const lev = 10 * Math.log10(Math.max(Math.min(msL, msR), 1e-24));
    fLevel[idx] = lev; fMs[idx] = Math.max(msL, msR);
    fHead = (fHead + 1) % F; if (fCount < F) fCount++;
    samples += S;
    dropoutStep(lev, f);
    dropRef.push(lev);
  }

  // ---- incremental dropout detector (dropoutMetrics rules) ----
  function dropoutStep(lev, f) {
    if (lev < dropThr) {
      if (!run) { runPreFreq = lastFreqBefore(); runPreMotion = lastMotion; }
      run++;
      return;
    }
    if (run) {
      const len = run * S / sr;
      if (run >= 2 && len <= th.maxDropoutSec && runPreMotion === 'play' && Number.isFinite(runPreFreq)) {
        pendingDrop = { t: clockSec(), preFreq: runPreFreq, wait: 0, seen: 0 };
      }
      run = 0;
    }
    // Confirm on the second block with a carrier again (the first holds the edge and the band filter's
    // transient): same speed as before the gap = a dropout, not a stop, cue or backspin.
    if (pendingDrop) {
      if (Number.isFinite(f) && ++pendingDrop.seen >= 2) {
        if (Math.abs(f / pendingDrop.preFreq - 1) < 0.03) { dropTimes.push(pendingDrop.t); totals.dropouts++; }
        pendingDrop = null;
      } else if (++pendingDrop.wait > 5) pendingDrop = null;
    }
  }
  function lastFreqBefore() {
    // median of the valid frequencies 2..6 blocks back (block 0 is the gap's first block, block 1 holds its edge)
    const v = [];
    for (let i = 2; i < Math.min(fCount, 7); i++) { const x = fFreq[(fHead - 1 - i + F * 2) % F]; if (Number.isFinite(x)) v.push(x); }
    return v.length ? median(v) : NaN;
  }

  function feedHum(L, R, n) {
    for (let i = 0; i < n; i++) {
      decAcc += (L[i] + R[i]) * 0.5; decCnt++;
      if (decCnt === D) { humRing[humPos] = decAcc / D; humPos = (humPos + 1) % humN; if (humFill < humN) humFill++; decAcc = 0; decCnt = 0; }
    }
  }

  function measureHum() {
    if (humFill < humN) return;
    for (let i = 0; i < humN; i++) humBuf[i] = humRing[(humPos + i) % humN] * hann[i];
    const rate = sr / D;
    const a50 = goertzelHann(humBuf, humN, rate, 50), a60 = goertzelHann(humBuf, humN, rate, 60);
    const mains = a60 >= a50 ? 60 : 50;
    let p = Math.max(a50, a60) ** 2, floor = 0, fn = 0;
    for (let k = 2; k <= 5; k++) p += goertzelHann(humBuf, humN, rate, mains * k) ** 2;
    for (const k of [1.5, 2.5, 3.5, 4.5]) { floor += goertzelHann(humBuf, humN, rate, mains * k) ** 2; fn++; }
    const floorPerBin = floor / fn;
    humFloorDb = 10 * Math.log10(Math.max(floorPerBin * 5, 1e-14));
    humDb = 10 * Math.log10(Math.max(p - floorPerBin * 5, 1e-14));
    humMainsHz = mains;
  }

  // ---- rules ----
  function ruleStep(kind, cond, n) {
    const r = rules[kind];
    if (cond) { r.on++; r.off = 0; if (!r.active && r.on >= n) { r.active = true; return 'raise'; } }
    else { r.off++; r.on = 0; if (r.active && r.off >= 2 * n) { r.active = false; return 'clear'; } }
    return null;
  }

  function makeAlert(kind, severity, message, t, extra = {}) {
    alertSeq++;
    return { id: `${deck}-${kind}-${alertSeq}`, deck, kind, severity, message, t, tMs: Math.round(t * 1000), ...extra };
  }

  function emit(out, alert) {
    const key = `${deck}:${alert.kind}`;
    const last = lastRaise.get(key);
    if (last != null && alert.tMs - last < cooldownMs) return;
    lastRaise.set(key, alert.tMs);
    totals.alerts[alert.severity] = (totals.alerts[alert.severity] || 0) + 1;
    out.push(alert);
  }

  // ---- window analysis ----
  function analyse() {
    const n = Math.min(W, fCount);
    const lv = [], fr = [], sn = [];
    let msSum = 0;
    for (let i = 0; i < n; i++) { const j = (fHead - 1 - i + F * 2) % F; msSum += fMs[j]; }
    const levelDb = n ? 10 * Math.log10(Math.max(msSum / n, 1e-24)) : -240;
    let ampL = 0, ampR = 0, cre = 0, cim = 0, ure = 0, uim = 0, used = 0;
    for (let i = 0; i < n; i++) {
      const j = (fHead - 1 - i + F * 2) % F;
      lv.push(fLevel[j]);
    }
    lv.sort((a, b) => a - b);
    const medLev = quantile(lv, 0.5);
    for (let i = 0; i < n; i++) {
      const j = (fHead - 1 - i + F * 2) % F;
      if (fLevel[j] < th.presenceDb || fLevel[j] < medLev - 6 || !Number.isFinite(fFreq[j])) continue;
      used++;
      fr.push(fFreq[j]); sn.push(fSnr[j]);
      ampL += fAmpL[j]; ampR += fAmpR[j];
      cre += fCrossRe[j]; cim += fCrossIm[j];
      const m = Math.hypot(fCrossRe[j], fCrossIm[j]);
      if (m > 0) { ure += fCrossRe[j] / m; uim += fCrossIm[j] / m; }
    }
    fr.sort((a, b) => a - b); sn.sort((a, b) => a - b);
    const carrierHz = quantile(fr, 0.5);
    const spread = fr.length >= 3 ? (quantile(fr, 0.75) - quantile(fr, 0.25)) / carrierHz : Infinity;
    let snrDb = sn.length ? quantile(sn, 0.5) : NaN;
    const phaseDeg = used ? Math.atan2(cim, cre) * DEG : NaN;
    const Rbar = used ? Math.hypot(ure, uim) / used : 0;
    const jitterDeg = used ? Math.sqrt(Math.max(0, -2 * Math.log(Math.max(Rbar, 1e-12)))) * DEG : NaN;
    const balanceDb = used ? 20 * Math.log10(Math.max(ampL, 1e-12) / Math.max(ampR, 1e-12)) : NaN;
    const speedPct = Number.isFinite(carrierHz) ? (carrierHz / expectedHz - 1) * 100 : NaN;
    const presentFrac = n ? used / n : 0;
    const direction = directionFromPhase(phaseDeg, fmt);
    const present = presentFrac >= 0.5 && Number.isFinite(carrierHz) && carrierHz > expectedHz * 0.4 && carrierHz < expectedHz * 1.6;
    const locked = present && snrDb >= 6;
    const frameSteady = !Number.isFinite(prevCarrier) || Math.abs(carrierHz / prevCarrier - 1) < 0.02;
    const steady = spread < 0.015 && frameSteady;
    const motion = levelDb < th.presenceDb ? 'idle' : locked && direction === 'forward' && steady && Math.abs(speedPct) <= 50 ? 'play' : 'cue';
    // "play" without the 6 dB lock gate: the carrier is there, forward, at a steady speed (frequency spread under
    // 1.5 %) within the play range, but too noisy to lock. Broadband noise leaves the zero-crossing frequency steady
    // (spread < 1 % down to 0 dB SNR) while cueing and scratching smear it (spread 25-45 %), so this is a collapsed
    // signal on a playing deck, not a gesture. The SNR floor rule is evaluated on these frames too, so the worst
    // degradation is not mistaken for cueing (FS-31 AC-3).
    let atSpeed = motion !== 'idle' && present && direction === 'forward' && steady && Math.abs(speedPct) <= 50;
    // A mixed healthy/noisy window can still report a high median SNR while its crossings lose steadiness.
    // Discard on observed clean reverse or idle immediately; other motion must fail the coherent window first.
    if (motion === 'idle' || (locked && direction === 'reverse' && jitterDeg < th.phaseJitterDeg)) {
      referenceHz = NaN; referenceCount = 0; referenceMisses = 0;
    } else if (motion === 'play' && snrDb >= th.healthySnrDb) {
      referenceHz = carrierHz; referencePhase = 0; referenceCount = 0; referenceMisses = 0;
    } else if ((!atSpeed || snrDb < 6) && referenceCount >= W && Number.isFinite(referenceHz)) {
      let lr = 0, li = 0, rr = 0, ri = 0, la = 0, ra = 0, total = 0;
      for (let i = 0; i < W; i++) {
        const j = (fHead - 1 - i + F * 2) % F;
        lr += refLRe[j]; li += refLIm[j]; rr += refRRe[j]; ri += refRIm[j];
        la += Math.hypot(refLRe[j], refLIm[j]); ra += Math.hypot(refRRe[j], refRIm[j]);
        total += fL[j] + fR[j];
      }
      const coherent = la > 0 && ra > 0 && Math.min(Math.hypot(lr, li) / la, Math.hypot(rr, ri) / ra) >= REFERENCE_COHERENCE;
      const phase = Math.atan2(ri * lr - rr * li, rr * lr + ri * li) * DEG;
      if (coherent && directionFromPhase(phase, fmt) === 'forward') {
        const power = 2 * (lr * lr + li * li + rr * rr + ri * ri) / (W * S) ** 2;
        total /= W;
        snrDb = 10 * Math.log10(Math.max(power, 1e-30) / Math.max(total - power, total * 1e-7, 1e-30));
        atSpeed = true; referenceMisses = 0;
      } else if (!atSpeed && ++referenceMisses >= frames(win)) {
        referenceHz = NaN; referenceCount = 0; referenceMisses = 0;
      }
    } else if (atSpeed) referenceMisses = 0;
    prevCarrier = carrierHz;
    return { levelDb, snrDb, carrierHz, speedPct, phaseDeg, jitterDeg, balanceDb, direction, locked, atSpeed, motion, driftDeg: Number.isFinite(phaseDeg) ? Math.abs(phaseDeg) - 90 : NaN };
  }

  function phaseRate() {
    // least-squares slope of driftDeg over the recent play frames, in deg/s
    const k = phaseHist.size;
    if (k < Math.max(4, N.phase)) return 0;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < k; i++) { const x = i * hop, y = phaseHist.at(k - 1 - i); sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const den = k * sxx - sx * sx;
    return den > 0 ? (k * sxy - sx * sy) / den : 0;
  }

  function minuteStep(frame, t) {
    const minute = Math.floor(t / 60);
    let done = null;
    if (minuteAcc && minuteAcc.minute !== minute) { done = finishMinute(); }
    if (!minuteAcc) minuteAcc = { minute, snrMin: Infinity, snrSum: 0, snrN: 0, humMax: -Infinity, driftMax: 0, drop0: totals.dropouts };
    if (frame.motion === 'play' && Number.isFinite(frame.snrDb)) { minuteAcc.snrMin = Math.min(minuteAcc.snrMin, frame.snrDb); minuteAcc.snrSum += frame.snrDb; minuteAcc.snrN++; }
    if (Number.isFinite(frame.humDb)) minuteAcc.humMax = Math.max(minuteAcc.humMax, frame.humDb);
    if (frame.motion === 'play' && Number.isFinite(frame.driftDeg)) minuteAcc.driftMax = Math.max(minuteAcc.driftMax, Math.abs(frame.driftDeg));
    return done;
  }
  function finishMinute() {
    if (!minuteAcc) return null;
    const m = minuteAcc;
    minuteAcc = null;
    const r1 = v => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
    return { minute: m.minute, deck, snrDbMin: r1(m.snrMin), snrDbMean: m.snrN ? r1(m.snrSum / m.snrN) : null, humDbMax: r1(m.humMax), driftDegMax: r1(m.driftMax), dropouts: totals.dropouts - m.drop0 };
  }

  /**
   * Feed one hop of stereo samples. Returns the frame for the window ending at the hop's last sample.
   * Blocks of any length work; a change of sample rate restarts the signal analysis but not the session clock,
   * the open minute or the totals.
   */
  function push(left, right, sampleRate) {
    const rate = Math.round(Number(sampleRate));
    if (!(rate >= 4000 && rate <= 384000)) throw new Error('Sample rate must be between 4000 and 384000 Hz.');
    if (rate !== sr) { base = clockSec(); samples = 0; allocate(rate); resetSignal(); }
    const n = Math.min(left?.length || 0, right?.length || 0);
    let o = 0;
    if (carryN) {
      const take = Math.min(S - carryN, n);
      carryL.set(left.subarray ? left.subarray(0, take) : left.slice(0, take), carryN);
      carryR.set(right.subarray ? right.subarray(0, take) : right.slice(0, take), carryN);
      carryN += take; o = take;
      if (carryN === S) { subBlock(carryL, carryR, 0); carryN = 0; }
    }
    for (; o + S <= n; o += S) subBlock(left, right, o);
    if (o < n) { carryL.set(left.subarray ? left.subarray(o, n) : left.slice(o, n), 0); carryR.set(right.subarray ? right.subarray(o, n) : right.slice(o, n), 0); carryN = n - o; }
    feedHum(left, right, n);
    // dropout threshold for the next hop: 75th percentile of the last 2 s of 20 ms levels minus dropDb
    const refVals = dropRef.values(scratch);
    const sorted = Array.from(refVals).sort((a, b) => a - b);
    const ref = quantile(sorted, 0.75);
    dropThr = Number.isFinite(ref) && ref > th.presenceDb ? ref - th.dropoutDb : -Infinity;
    if (hopCounter++ % 2 === 0) measureHum();
    const t = clockSec();
    const a = analyse();
    lastMotion = a.motion;
    while (dropTimes.length && dropTimes[0] < t - th.dropoutSpanSec) dropTimes.shift();
    const frame = { deck, t, ...a, humDb, humFloorDb, mainsHz: humMainsHz, dropouts: dropTimes.length, alerts: [], state: 'ok', minute: null };
    totals.frames++;
    const out = frame.alerts;
    const play = a.motion === 'play';
    const fmtDb = v => Math.round(v);

    // SNR baseline: median of healthy play frames while no SNR rule is pending
    const snrBaseline = snrBase.size >= frames(th.minBaselineSec) ? median(snrBase.values()) : NaN;
    const floorCond = Number.isFinite(a.snrDb) && a.snrDb < th.snrFloorDb;
    if (play || a.atSpeed) {
      const r2 = ruleStep('snrFloor', floorCond, N.snrFloor);
      if (r2 === 'raise') emit(out, makeAlert('snrFloor', 'critical', `Deck ${deck}: timecode SNR is ${fmtDb(a.snrDb)} dB, below the ${th.snrFloorDb} dB floor`, t, { value: a.snrDb, baseline: th.snrFloorDb }));
    }
    if (play) {
      const dropCond = Number.isFinite(snrBaseline) && a.snrDb < snrBaseline - th.snrDropDb;
      const r1 = ruleStep('snrDrop', dropCond, N.snrDrop);
      if (r1 === 'raise') emit(out, makeAlert('snrDrop', 'warning', `Deck ${deck}: timecode SNR dropped ${fmtDb(snrBaseline - a.snrDb)} dB`, t, { value: a.snrDb, baseline: snrBaseline }));
      if (!dropCond && !floorCond && !rules.snrDrop.active && !rules.snrFloor.active && rules.snrDrop.on === 0 && a.snrDb >= th.healthySnrDb) snrBase.push(a.snrDb);
      // phase: only while the speed is steady (play implies steady)
      phaseHist.push(a.driftDeg);
      const rate = phaseRate();
      frame.driftRateDegPerSec = rate;
      const r3 = ruleStep('phase', Math.abs(rate) > th.phaseRateDegPerSec || a.jitterDeg > th.phaseJitterDeg, N.phase);
      if (r3 === 'raise') emit(out, makeAlert('phase', 'warning', `Deck ${deck}: timecode phase is unsteady (${a.jitterDeg > th.phaseJitterDeg ? `jitter ${fmtDb(a.jitterDeg)} deg` : `drift ${rate.toFixed(1)} deg/s`})`, t, { value: a.jitterDeg > th.phaseJitterDeg ? a.jitterDeg : rate, baseline: a.jitterDeg > th.phaseJitterDeg ? th.phaseJitterDeg : th.phaseRateDegPerSec }));
      totals.playFrames++;
      if (Number.isFinite(a.snrDb)) { totals.snrSum += a.snrDb; totals.snrN++; totals.snrMin = Math.min(totals.snrMin, a.snrDb); }
      if (Number.isFinite(a.driftDeg)) totals.driftMax = Math.max(totals.driftMax, Math.abs(a.driftDeg));
    } else if (a.motion === 'cue') {
      phaseHist.clear(); // a speed change breaks the phase history
    }
    frame.snrBaselineDb = snrBaseline;

    // dropouts: critical at >= dropoutCount in dropoutSpanSec (counting already requires steady play around the gap)
    const r4 = ruleStep('dropouts', dropTimes.length >= th.dropoutCount, 1);
    if (r4 === 'raise') emit(out, makeAlert('dropouts', 'critical', `Deck ${deck}: ${dropTimes.length} timecode dropouts in ${th.dropoutSpanSec} s`, t, { value: dropTimes.length, baseline: th.dropoutCount }));

    // hum: rise over its baseline, clearly above the local noise floor (any motion state)
    const humBaseline = humBase.size >= frames(th.minBaselineSec) ? median(humBase.values()) : NaN;
    const humCond = Number.isFinite(humBaseline) && humDb > humBaseline + th.humRiseDb && humDb > th.humMinDbfs && humDb > humFloorDb + th.humAboveFloorDb;
    const r5 = ruleStep('hum', humCond, N.hum);
    if (r5 === 'raise') emit(out, makeAlert('hum', 'warning', `Deck ${deck}: ${humMainsHz} Hz hum rose ${fmtDb(humDb - humBaseline)} dB. Likely cause: ground loop/cable`, t, { value: humDb, baseline: humBaseline, cause: 'ground loop/cable' }));
    if (!humCond && !rules.hum.active && rules.hum.on === 0) humBase.push(humDb);
    frame.humBaselineDb = humBaseline;
    if (Number.isFinite(humDb)) totals.humMax = Math.max(totals.humMax, humDb);

    // idle / lifted: info after idleInfoSec of silence-by-design, never an alarm
    if (a.motion === 'idle') {
      if (idleSince == null) idleSince = t;
      // stopped or lifted for a second: a fault raised during play is over, not latched through the pause
      if (t - idleSince >= IDLE_CLEAR_SEC) clearPlayRules();
      if (!idleInfoRaised && t - idleSince >= th.idleInfoSec) {
        idleInfoRaised = true;
        emit(out, makeAlert('noSignal', 'info', `No signal on Deck ${deck}: vinyl stopped or lifted?`, t, { value: a.levelDb, baseline: th.presenceDb }));
      }
    } else { idleSince = null; idleInfoRaised = false; }
    frame.idleSec = idleSince == null ? 0 : t - idleSince;

    frame.state = deckState(frame);
    frame.minute = minuteStep(frame, t);
    return frame;
  }

  function deckState(frame) {
    // stopped or lifted vinyl is idle, not a fault (FS-31 §6): the play-only rules do not colour an idle deck
    const idle = frame.motion === 'idle';
    if (rules.dropouts.active || (!idle && rules.snrFloor.active)) return 'fault';
    if (rules.hum.active || (!idle && (rules.snrDrop.active || rules.phase.active))) return 'watch';
    if (idle) return frame.idleSec >= th.idleInfoSec ? 'nosignal' : 'idle';
    return 'ok';
  }

  return {
    deck,
    format: fmt,
    expectedHz,
    push,
    /** Alerts raised by `frame` (cooldown already applied). */
    alerts(frame) { return Array.isArray(frame?.alerts) ? frame.alerts : []; },
    /** Close the current minute (session end): returns its summary row or null. */
    flushMinute() { return finishMinute(); },
    /** Active rule kinds, for the UI. */
    activeKinds() { return Object.entries(rules).filter(([, r]) => r.active).map(([k]) => k); },
    summary() {
      const r1 = v => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
      return { deck, format: fmt.name, frames: totals.frames, playFrames: totals.playFrames, snrDbMean: totals.snrN ? r1(totals.snrSum / totals.snrN) : null, snrDbMin: r1(totals.snrMin), humDbMax: r1(totals.humMax), driftDegMax: r1(totals.driftMax), dropouts: totals.dropouts, alerts: { ...totals.alerts } };
    },
    /** Restart the analysis (keeps the format and thresholds). */
    reset() { resetTracking(); },
    /** Session clock in seconds (monotonic for the monitor's life, see resume()). */
    get t() { return clockSec(); },
    /**
     * The stream was reopened after an outage: restart the signal tracking and move the session clock forward to
     * `tSec` (the controller's session time) if it is behind, so later alerts and minutes sort after the gap.
     */
    resume(tSec) {
      const target = Number(tSec);
      if (Number.isFinite(target) && target > clockSec()) base += target - clockSec();
      resetSignal();
    },
    thresholds: th,
  };
}

// ---------------------------------------------------------------- session helpers (pure)

/** Tray / window badge state from the deck frames: 'off' | 'ok' | 'watch' | 'fault'. */
export function trayStateFor(states, running = true) {
  if (!running) return 'off';
  const list = Array.isArray(states) ? states : [];
  if (list.includes('fault')) return 'fault';
  if (list.includes('watch')) return 'watch';
  return 'ok';
}

/** Chip text + icon for a deck state: colour is never the only signal (FS-31 §3). */
export const DECK_STATE = Object.freeze({
  ok: { label: 'OK', chip: 'pass', icon: 'pass' },
  watch: { label: 'Watch', chip: 'warn', icon: 'warn' },
  fault: { label: 'Fault', chip: 'fail', icon: 'fail' },
  idle: { label: 'Idle', chip: 'info', icon: 'info' },
  nosignal: { label: 'No signal', chip: 'info', icon: 'info' },
  waiting: { label: 'Waiting', chip: 'review', icon: 'review' },
});

const NO_DEVICE_ERROR = Object.freeze({ state: 'error', code: 'NO_DEVICE', message: 'The selected input is not connected. Reconnect the interface or pick another input, then start again.' });

export const DEVICE_BUSY_COPY = 'Another program is using this audio device exclusively. DeckChek can monitor without interrupting it if:';
export const WORKAROUNDS = Object.freeze([
  'your interface driver is multi-client or has a shared/WDM mode,',
  'you use the DJ software\'s thru/aux output into a spare input, or',
  'you split the deck\'s cable to a spare input pair.',
]);

/**
 * Map a start failure to a monitor state. code 'CAPTURE_BUSY' (another DeckChek feature holds the capture lease)
 * is 'capture-busy'; an OS-level exclusive/in-use refusal is 'device-busy' (FS-31 AC-5 copy); everything else
 * degrades to an explicit not-available state, never a hang.
 * Native errors quote the device name ("Audio input not found: <name>", "Input pair 3-4 is not available on
 * <name>: ..."), so those prefixes are matched first, and `deviceName` (the selected input) is removed from the
 * text before the keyword patterns run: a device called "Centauri" or "Busy Box" never picks the wrong branch.
 */
export function classifyStartError(error, { deviceName = null } = {}) {
  if (error && error.code === 'CAPTURE_BUSY') return { state: 'capture-busy', code: 'CAPTURE_BUSY', holder: error.holder ?? null };
  const text = String(error?.message ?? error ?? '');
  const lower = text.toLowerCase();
  if (/(^|: )input pair \d+-\d+ is not available on /.test(lower)) return { state: 'error', code: 'PAIR', message: text };
  if (/(^|: )audio input not found:/.test(lower)) return NO_DEVICE_ERROR;
  const name = typeof deviceName === 'string' ? deviceName.trim().toLowerCase() : '';
  const t = name.length >= 2 ? lower.split(name).join(' ') : lower;
  if (/desktop app|tauri/.test(t)) return { state: 'unsupported', code: 'UNSUPPORTED', message: 'Live monitor needs the DeckChek desktop app.' };
  if (/exclusive|in use|being used|busy|audclnt_e_device_in_use|0x8889000a|device_busy/.test(t)) return { state: 'device-busy', code: 'DEVICE_BUSY', message: DEVICE_BUSY_COPY };
  if (/^input pair|pairs? (start|are given)|is selected twice|not available on/.test(t)) return { state: 'error', code: 'PAIR', message: text };
  if (/not found|no (default )?input|no device|no such device|unplugged|disconnected/.test(t)) return NO_DEVICE_ERROR;
  if (/format|sample rate|unsupported/.test(t)) return { state: 'error', code: 'FORMAT_UNSUPPORTED', message: 'The device rejected the stream format. Pick another sample rate in the interface control panel, then start again.' };
  if (/permission|denied|not allowed/.test(t)) return { state: 'error', code: 'PERMISSION', message: 'Windows blocked access to the input. Allow desktop apps to use the microphone in Settings > Privacy, then start again.' };
  return { state: 'error', code: 'STREAM', message: 'The audio stream could not be opened. Check the device and driver, then start again.' };
}

/**
 * A device or host label for the session log: control characters (C0/C1) become spaces, runs of spaces collapse,
 * trimmed and cut to `max` characters; empty is null. Only the stored label is cleaned; the stream keeps the exact
 * OS name it needs to open the device.
 */
export function sanitizeLabel(value, max = 200) {
  if (value == null) return null;
  const s = Array.from(String(value).replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim();
  return s || null;
}

/** Validate a start configuration. Returns {ok, errors, config} with decks normalised to [{deck, pair}]. */
export function validateConfig({ deviceName = null, decks = [], format, hopMs = 250 } = {}) {
  const errors = [];
  const fmt = typeof format === 'string' ? TIMECODE_FORMATS.find(f => f.name.toLowerCase() === format.trim().toLowerCase()) : null; // exact name only
  if (!fmt) errors.push('Pick a timecode format.');
  const list = Array.isArray(decks) ? decks.filter(d => d && d.pair != null && d.pair !== '') : [];
  if (!list.length) errors.push('Pick an input pair for at least one deck.');
  if (list.length > MAX_DECKS) errors.push(`At most ${MAX_DECKS} decks can be monitored.`);
  const seen = new Set();
  const out = list.slice(0, MAX_DECKS).map((d, i) => {
    const first = typeof d.pair === 'object' ? Number(d.pair.first) : Number(String(d.pair).split('-')[0]);
    if (!Number.isInteger(first) || first < 1 || first % 2 === 0) errors.push(`Deck ${DECKS[i]}: input pair is not valid.`);
    else if (seen.has(first)) errors.push(`Deck ${DECKS[i]} uses the same input pair as another deck.`);
    seen.add(first);
    return { deck: DECKS.includes(d.deck) ? d.deck : DECKS[i], first };
  });
  const hop = Number(hopMs);
  if (!(hop >= 50 && hop <= 1000)) errors.push('Hop must be 50-1000 ms.');
  const name = deviceName == null || deviceName === '' ? null : String(deviceName).slice(0, 200);
  return { ok: errors.length === 0, errors, config: { deviceName: name, decks: out, format: fmt?.name ?? null, hopMs: hop } };
}

/** Session summary JSON (stored in monitor_session.summary_json). */
export function sessionSummary(deckSummaries, { durationSec = 0, droppedBlocks = 0, eventsDropped = 0, endReason = 'stopped' } = {}) {
  const decks = (deckSummaries || []).filter(Boolean);
  const alerts = { info: 0, warning: 0, critical: 0 };
  for (const d of decks) for (const k of Object.keys(alerts)) alerts[k] += d.alerts?.[k] || 0;
  const worst = alerts.critical ? 'critical' : alerts.warning ? 'warning' : 'ok';
  return { version: 1, durationSec: Math.round(durationSec), endReason, worst, alerts, droppedBlocks, eventsDropped, decks };
}

/** Log export shape (FS-31 §5): {version:1, session, events, minutes}. */
export function exportLog(log) {
  return { version: 1, session: log?.session ?? null, events: Array.isArray(log?.events) ? log.events : [], minutes: Array.isArray(log?.minutes) ? log.minutes : [] };
}

// ---------------------------------------------------------------- session controller (no DOM; dependencies injected)

const FLUSH_MS = 10_000;
const RETRY_MS = 5_000;
const MAX_PENDING_EVENTS = 1000;
const SPARK_POINTS = 300; // 5 min of SNR at one point per second

/**
 * Runs one live-monitor session: stream -> per-deck monitors -> alerts, tray state and the session log.
 * Never blocks: native calls are awaited off the block path, and every failure degrades to an explicit state.
 * @param {object} d
 * @param {(args:object)=>Promise<{info, stop():Promise}>} d.startStream startStreamSession-compatible (holder, deviceName,
 *   blockMs, pairs, onBlock, onEnd); the UI wraps it in the shared capture-busy dialog.
 * @param {(cmd:string, args?:object)=>Promise<any>} [d.invoke] Tauri invoke; null = no log and no tray (browser mode).
 * @param {(frames:object[])=>void} [d.onFrame] latest frame per deck, once per block.
 * @param {(alert:object, opts:{toast:boolean})=>void} [d.onAlert]
 * @param {(state:string, info:object)=>void} [d.onState]
 * @param {(tray:{state:string, supported:boolean})=>void} [d.onTray]
 * @param {object} [d.settings] normalizeSettings() value.
 * @param {()=>number} [d.now]
 * @param {{setTimeout:Function, clearTimeout:Function, setInterval:Function, clearInterval:Function}} [d.timers]
 */
export function createMonitorController({ startStream, invoke = null, onFrame = () => {}, onAlert = () => {}, onState = () => {}, onTray = () => {}, settings = DEFAULT_SETTINGS, now = () => Date.now(), timers = globalThis } = {}) {
  let cfg = normalizeSettings(settings);
  let state = 'idle', info = {}, config = null, lastConfig = null;
  let stream = null, monitors = [], sessionId = null, startedAt = 0;
  let pendingEvents = [], pendingMinutes = [], eventsDropped = 0, flushing = null, flushTimer = null, retryTimer = null;
  let trayState = 'off', traySupported = null, mutedUntil = 0, droppedBlocks = 0, epoch = 0;
  const events = createEventLog(500);
  const decks = new Map(); // deck -> {frame, spark, sparkAcc}
  const perf = { blocks: 0, busyMs: 0, worstMs: 0 };
  const clock = () => (globalThis.performance?.now?.() ?? Date.now());

  const setState = (s, extra = {}) => { state = s; info = { ...extra }; try { onState(s, info); } catch { /* UI callback */ } };

  async function setTray(next) {
    if (next === trayState && traySupported !== null) return;
    trayState = next;
    if (invoke) {
      try { traySupported = Boolean((await invoke('monitor_set_tray_state', { state: next }))?.supported); } catch { traySupported = false; }
    } else traySupported = false;
    try { onTray({ state: next, supported: traySupported }); } catch { /* UI callback */ }
  }

  function record(alert, { toast = true } = {}) {
    events.add(alert);
    if (pendingEvents.length >= MAX_PENDING_EVENTS) { pendingEvents.shift(); eventsDropped++; }
    const r2 = v => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
    pendingEvents.push({ tMs: Math.max(0, Math.round(alert.tMs ?? 0)), deck: alert.deck ?? null, kind: alert.kind, severity: alert.severity, value: r2(alert.value), baseline: r2(alert.baseline), message: String(alert.message || '').slice(0, 300) });
    const show = toast && cfg.toastsEnabled && now() >= mutedUntil;
    try { onAlert(alert, { toast: show }); } catch { /* UI callback */ }
    if (pendingEvents.length >= 50) flush();
  }

  async function flush() {
    if (!sessionId || !invoke) { pendingEvents = []; pendingMinutes = []; return; }
    if (flushing) return flushing;
    const ev = pendingEvents.splice(0, 500), mins = pendingMinutes.splice(0, 240);
    if (!ev.length && !mins.length) return;
    const id = sessionId;
    flushing = (async () => {
      try {
        const r = await invoke('monitor_log_append', { sessionId: id, events: ev, minutes: mins });
        eventsDropped += r?.eventsDropped || 0;
      } catch { eventsDropped += ev.length; /* the live view keeps working; the log is best effort */ }
      finally { flushing = null; }
    })();
    await flushing;
    if (pendingEvents.length || pendingMinutes.length) await flush();
  }

  function onBlock(block, myEpoch) {
    if (myEpoch !== epoch) return;
    const t0 = clock();
    droppedBlocks = Math.max(droppedBlocks, block.quality?.droppedBlocks || 0);
    const frames = [];
    const pairs = Array.isArray(block.pairs) && block.pairs.length ? block.pairs : [{ left: block.left, right: block.right }];
    monitors.forEach((m, i) => {
      const p = pairs[i];
      if (!p || !block.frames && !p.left?.length) return;
      const frame = m.push(p.left, p.right, block.sampleRate);
      frames.push(frame);
      const d = decks.get(m.deck);
      d.frame = frame;
      d.sparkAcc.push(frame.motion === 'play' && Number.isFinite(frame.snrDb) ? frame.snrDb : NaN);
      if (d.sparkAcc.length >= Math.max(1, Math.round(1000 / config.hopMs))) {
        const v = d.sparkAcc.filter(Number.isFinite);
        d.spark.push(v.length ? Math.min(...v) : NaN);
        d.sparkAcc = [];
      }
      for (const a of m.alerts(frame)) record(a);
      if (frame.minute) pendingMinutes.push(frame.minute);
    });
    if (!frames.length) return;
    const next = trayStateFor(frames.map(f => f.state));
    if (next !== trayState) setTray(next);
    const dt = clock() - t0;
    perf.blocks++; perf.busyMs += dt; perf.worstMs = Math.max(perf.worstMs, dt);
    try { onFrame(frames); } catch { /* UI callback */ }
  }

  function openStream(myEpoch) {
    return startStream({
      holder: HOLDER, deviceName: config.deviceName, blockMs: config.hopMs, pairs: config.decks.map(d => d.first),
      onBlock: b => onBlock(b, myEpoch),
      onEnd: e => onStreamEnd(e, myEpoch),
    });
  }

  const elapsedMs = () => Math.max(0, now() - startedAt);
  // One session time base for every logged row: wall time since start, never behind the deck monitors' clocks
  // (which only advance while audio arrives). Device events use it, and resume() moves the monitors up to it.
  const sessionMs = () => Math.max(elapsedMs(), ...monitors.map(m => Math.ceil(m.t * 1000)));
  const runInfo = () => ({ sessionId, deviceName: info.deviceName ?? config?.deviceName ?? null, sampleRate: info.sampleRate ?? null, persisted: Boolean(sessionId) });

  function onStreamEnd(e, myEpoch) {
    if (myEpoch !== epoch || state === 'stopping' || state === 'idle') return;
    stream = null;
    if (e?.reason === 'preempted') {
      finish('preempted', { message: 'Live monitor stopped: another DeckChek feature needed the audio input.' });
      return;
    }
    // deviceLost / sinkClosed: say it once, retry every 5 s until the device is back or the user stops
    const t = sessionMs();
    record({ id: `dev-lost-${t}`, deck: null, kind: 'deviceLost', severity: 'critical', message: 'Audio device lost. Retrying every 5 s.', t: t / 1000, tMs: t });
    setTray('fault');
    setState('retrying', { ...runInfo(), message: 'Audio device lost. Retrying every 5 s: reconnect the interface, or stop the monitor.' });
    scheduleRetry(myEpoch);
  }

  function scheduleRetry(myEpoch) {
    timers.clearTimeout?.(retryTimer);
    retryTimer = timers.setTimeout(async () => {
      if (myEpoch !== epoch || state !== 'retrying') return;
      try {
        const s = await openStream(myEpoch);
        if (myEpoch !== epoch) { try { await s?.stop?.(); } catch { /* raced with stop */ } return; }
        stream = s;
        const t = sessionMs();
        for (const m of monitors) m.resume(t / 1000); // later alerts and minutes sort after the outage
        record({ id: `dev-back-${t}`, deck: null, kind: 'deviceRestored', severity: 'info', message: 'Audio device is back. Monitoring again.', t: t / 1000, tMs: t });
        setState('running', runInfo());
      } catch (error) {
        if (myEpoch !== epoch) return;
        if (classifyStartError(error, { deviceName: config?.deviceName }).state === 'capture-busy') finish('capture-busy', { message: 'Live monitor stopped: another DeckChek feature is using the audio input.' });
        else scheduleRetry(myEpoch);
      }
    }, RETRY_MS);
  }

  async function finish(endReason, extra = {}) {
    epoch++;
    timers.clearTimeout?.(retryTimer); retryTimer = null;
    if (flushTimer != null) timers.clearInterval?.(flushTimer);
    flushTimer = null;
    const s = stream; stream = null;
    if (s) { try { await s.stop(); } catch { /* already ended */ } }
    for (const m of monitors) { const last = m.flushMinute(); if (last) pendingMinutes.push(last); }
    await flush();
    const summary = sessionSummary(monitors.map(m => m.summary()), { durationSec: elapsedMs() / 1000, droppedBlocks, eventsDropped, endReason });
    let persisted = false;
    if (sessionId && invoke) { try { await invoke('monitor_session_end', { sessionId, summary }); persisted = true; } catch { /* best effort: reported as persisted=false */ } }
    const closed = sessionId;
    sessionId = null;
    await setTray('off');
    setState(endReason === 'stopped' || endReason === 'quit' ? 'idle' : endReason, { ...extra, summary, sessionId: closed, persisted });
    return summary;
  }

  return {
    get state() { return state; },
    get info() { return info; },
    get config() { return config; },
    get lastConfig() { return lastConfig; },
    get running() { return state === 'running' || state === 'retrying'; },
    get muted() { return now() < mutedUntil; },
    get tray() { return { state: trayState, supported: Boolean(traySupported) }; },
    events,
    perf: () => ({ ...perf, meanMs: perf.blocks ? perf.busyMs / perf.blocks : 0 }),
    deck(id) { const d = decks.get(id); return d ? { frame: d.frame, spark: Array.from(d.spark.values()) } : null; },
    deckIds: () => [...decks.keys()],
    setSettings(s) { cfg = normalizeSettings(s); },
    mute(minutes = 30) { mutedUntil = now() + minutes * 60_000; return mutedUntil; },
    unmute() { mutedUntil = 0; },
    /** Start monitoring. Resolves {ok, state, ...}; never rejects. */
    async start(raw) {
      if (state === 'running' || state === 'starting' || state === 'retrying' || state === 'stopping') return { ok: false, state, error: 'busy' };
      const v = validateConfig(raw);
      if (!v.ok) { setState('error', { code: 'CONFIG', message: v.errors.join(' ') }); return { ok: false, state, errors: v.errors }; }
      config = v.config; lastConfig = v.config;
      const myEpoch = ++epoch;
      monitors = config.decks.map(d => createMonitor({ format: config.format, deck: d.deck, hopMs: config.hopMs, thresholds: cfg.thresholds, cooldownSec: cfg.cooldownSec }));
      decks.clear();
      for (const m of monitors) decks.set(m.deck, { frame: null, spark: createRing(SPARK_POINTS), sparkAcc: [] });
      events.clear(); pendingEvents = []; pendingMinutes = []; eventsDropped = 0; droppedBlocks = 0;
      perf.blocks = 0; perf.busyMs = 0; perf.worstMs = 0;
      setState('starting', {});
      let s;
      try {
        s = await openStream(myEpoch);
      } catch (error) {
        if (myEpoch !== epoch) return { ok: false, state };
        const c = classifyStartError(error, { deviceName: config.deviceName });
        monitors = []; decks.clear(); // nothing runs: no deck cards
        setState(c.state, { ...c, cancelled: Boolean(error?.cancelled) });
        return { ok: false, state, error: c };
      }
      if (myEpoch !== epoch) { try { await s?.stop(); } catch { /* raced with stop */ } return { ok: false, state }; }
      stream = s;
      startedAt = now();
      const si = s?.info || {};
      // the OS name is untrusted text: only a cleaned label is shown and stored (an odd name must not refuse the row)
      const label = sanitizeLabel(si.deviceName ?? config.deviceName);
      info = { deviceName: label, sampleRate: si.sampleRate ?? null };
      if (invoke) {
        let id = null;
        const sr = Number.isFinite(si.sampleRate) && si.sampleRate >= 4000 && si.sampleRate <= 384000 ? Math.round(si.sampleRate) : null;
        try {
          const r = await invoke('monitor_session_start', { input: { deviceName: label, hostApi: null, sampleRate: sr, format: config.format, config: { decks: config.decks, hopMs: config.hopMs, format: config.format }, assetId: null } });
          id = r?.id ?? null;
        } catch { id = null; }
        if (myEpoch !== epoch) {
          // stopped while the row was being created: finish() already ran without it, so close it here
          if (id) { try { await invoke('monitor_session_end', { sessionId: id, summary: sessionSummary(monitors.map(m => m.summary()), { durationSec: elapsedMs() / 1000, endReason: 'stopped' }) }); } catch { /* best effort */ } }
          return { ok: false, state };
        }
        sessionId = id;
      }
      if (flushTimer != null) timers.clearInterval?.(flushTimer);
      flushTimer = timers.setInterval ? timers.setInterval(() => { flush(); }, FLUSH_MS) : null;
      await setTray('ok');
      if (myEpoch !== epoch) return { ok: false, state };
      setState('running', runInfo());
      return { ok: true, state, sessionId };
    },
    /** Stop monitoring and close the session log. */
    async stop(reason = 'stopped') {
      if (!(state === 'running' || state === 'retrying' || state === 'starting')) return null;
      setState('stopping', {});
      return finish(reason === 'quit' ? 'quit' : 'stopped');
    },
    /** Flush pending log rows now. */
    flush,
  };
}
