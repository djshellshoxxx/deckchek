// Scratch stress test guided flow (FS-14 AC-1, AC-7): the run controller behind the screen.
// setup -> baseline (3 s needle-down gate, AC-8) -> guided protocol (count-in, 20 s perform, 5 s rest per
// pattern, metronome clicks to the chosen output) -> analysis -> saved run. DOM-free: capture, audio,
// clock, timers and the run store are injected so the state machine is unit-testable.
// Esc / abort() silences the metronome first (synchronously, before any await), well inside 100 ms.

import {
  PROTOCOL_V1, SCRATCH_DEFAULTS, protocolTimeline, metronomeSchedule, createMetronome, clampMetronomeDbfs,
  baselineCheck, analyzeScratch, instantVelocity, toRunRecord, createScratchApi,
} from '../../scratch.js';
import { startLiveSession } from '../audio-io.js';

/** Skip thresholds have not been calibrated on a sacrificial record yet (FS-14 §6, §9). Flip when they are. */
export const SKIP_CALIBRATION = Object.freeze({
  calibrated: false,
  label: 'Uncalibrated',
  note: 'Needle-skip thresholds are untested defaults: they have not been calibrated on a sacrificial record yet. Treat a skip as a prompt to check tracking force, not as a measurement.',
});

export const BASELINE_SEC = 3;
export const METRONOME_LEAD_SEC = 0.6;      // first count-in click this long after Begin, so the clock is warm
export const TAIL_SEC = 0.4;                // capture kept after the last rest ends
export const BPM_RANGE = Object.freeze({ min: 60, max: 160, default: PROTOCOL_V1.bpm });

const finite = Number.isFinite;

/** Where the protocol is at `posSec` after the first count-in click (pure; drives the guided display). */
export function phaseAt(bpm, posSec, protocol = PROTOCOL_V1) {
  const tl = protocolTimeline(bpm, { protocol }), beat = tl.beatSec;
  if (!(posSec >= 0)) return { phase: 'lead', index: 0, pattern: tl.patterns[0], untilSec: -posSec, beat: -protocol.countInBeats, beatFrac: 0, overall: 0, totalSec: tl.totalSec };
  const overall = Math.min(1, posSec / tl.totalSec);
  for (let i = 0; i < tl.patterns.length; i++) {
    const p = tl.patterns[i];
    if (posSec >= p.restEnd - 1e-9) continue;
    if (posSec < p.performStart) { const b = (posSec - p.countInStart) / beat; return { phase: 'countin', index: i, pattern: p, untilSec: p.performStart - posSec, beat: Math.floor(b) - protocol.countInBeats, beatFrac: b - Math.floor(b), overall, totalSec: tl.totalSec }; }
    if (posSec < p.performEnd) { const b = (posSec - p.performStart) / beat; return { phase: 'perform', index: i, pattern: p, untilSec: p.performEnd - posSec, beat: Math.floor(b), beatFrac: b - Math.floor(b), overall, totalSec: tl.totalSec }; }
    return { phase: 'rest', index: i, pattern: p, untilSec: p.restEnd - posSec, beat: -1, beatFrac: 0, overall, totalSec: tl.totalSec };
  }
  const last = tl.patterns.at(-1);
  return { phase: 'done', index: tl.patterns.length - 1, pattern: last, untilSec: 0, beat: -1, beatFrac: 0, overall: 1, totalSec: tl.totalSec };
}

/** Min/max envelope of a velocity trace in at most `maxPoints` points, so short spikes survive. */
export function downsampleTrace(trace, maxPoints = 1200) {
  const n = trace.t.length;
  if (n <= maxPoints) return { t: Array.from(trace.t), v: Array.from(trace.v, x => (finite(x) ? x : 0)) };
  const buckets = Math.floor(maxPoints / 2), size = n / buckets, t = [], v = [];
  for (let b = 0; b < buckets; b++) {
    const a = Math.floor(b * size), e = Math.min(n, Math.floor((b + 1) * size));
    let lo = a, hi = a;
    for (let k = a; k < e; k++) { if (trace.v[k] < trace.v[lo]) lo = k; if (trace.v[k] > trace.v[hi]) hi = k; }
    for (const k of lo < hi ? [lo, hi] : [hi, lo]) { t.push(trace.t[k]); v.push(finite(trace.v[k]) ? trace.v[k] : 0); }
  }
  return { t, v };
}

/** Carrier level (dBFS, quieter channel RMS) from a capture-levels event. */
export function levelDbFromLevels(levels) {
  const r = Math.min(Number(levels?.rmsL), Number(levels?.rmsR));
  return finite(r) && r > 0 ? 20 * Math.log10(r) : -Infinity;
}

/** Live lock indicator: the engine's own level-drop rule (baseline - dropDb). */
export function liveLock(levelDb, baselineLevelDb) {
  if (!finite(baselineLevelDb)) return 'unknown';
  return levelDb >= baselineLevelDb - SCRATCH_DEFAULTS.dropDb ? 'ok' : 'low';
}

/**
 * @param {object} deps all optional: capture(opts)->session, createAudioContext(), api, perf(), timers, onChange(state),
 *   analyze, makeMetronome.
 */
export function createScratchRunner({
  capture = startLiveSession,
  createAudioContext = () => { const C = globalThis.AudioContext || globalThis.webkitAudioContext; if (!C) throw new Error('Web Audio is unavailable, so the metronome cannot play.'); return new C(); },
  api = createScratchApi(),
  perf = () => globalThis.performance.now(),
  timers = globalThis,
  onChange = () => {},
  analyze = analyzeScratch,
  makeMetronome = createMetronome,
  protocol = PROTOCOL_V1,
} = {}) {
  const state = {
    phase: 'setup',              // setup | baseline | baseline-failed | ready | running | analyzing | done | error
    config: null, baseline: null, progress: null, live: { levelDb: -Infinity, lock: 'unknown' },
    muted: false, aborted: false, result: null, plot: null, saved: null, saveError: null, error: null, mutedAtMs: null, abortAtMs: null,
  };
  let cap = null, ctx = null, metro = null, tick = null, wait = null, clickZeroPerf = 0, startSec = 0, finishing = false, gen = 0;
  const emit = () => { try { onChange(state); } catch (e) { console.error('scratch onChange failed', e); } };
  const set = (patch) => { Object.assign(state, patch); emit(); };
  const clearTimers = () => { if (tick !== null) { timers.clearInterval(tick); tick = null; } if (wait !== null) { timers.clearTimeout(wait); wait = null; } };
  const liveHandler = levels => {
    const levelDb = levelDbFromLevels(levels);
    state.live = { levelDb, lock: liveLock(levelDb, state.baseline?.levelDb) };
  };
  const closeCtx = () => { try { ctx?.close?.()?.catch?.(() => {}); } catch { /* already closed */ } ctx = null; };
  const fail = (error) => { clearTimers(); closeCtx(); cap = null; set({ phase: 'error', error: error?.message || String(error) }); };

  async function runBaseline(config) {
    if (state.phase === 'baseline' || state.phase === 'running') return state;
    const mine = ++gen;
    set({ phase: 'baseline', config: { ...config, levelDbfs: clampMetronomeDbfs(config.levelDbfs) }, baseline: null, result: null, plot: null, saved: null, saveError: null, error: null, aborted: false, progress: { baselineSec: 0 } });
    try {
      cap = await capture({ deviceName: config.deviceName || null, maxSeconds: BASELINE_SEC + 8, onLevels: liveHandler });
      const started = perf();
      await new Promise(resolve => { const step = () => { const el = (perf() - started) / 1000; state.progress = { baselineSec: Math.min(BASELINE_SEC, el) }; emit(); if (el >= BASELINE_SEC) { wait = null; resolve(); } else wait = timers.setTimeout(step, 100); }; wait = timers.setTimeout(step, 100); });
      if (mine !== gen) return state;
      const current = cap; cap = null;
      const { audio } = await current.stop();
      const check = baselineCheck(audio, { format: config.format });
      set({ phase: check.ok ? 'ready' : 'baseline-failed', baseline: check });
    } catch (error) { if (mine === gen) fail(error); }
    return state;
  }

  async function cancelBaseline() {
    gen++; clearTimers();
    const current = cap; cap = null;
    try { await current?.cancel?.(); } catch { /* discarded */ }
    set({ phase: 'setup', baseline: null, progress: null });
  }

  async function begin() {
    if (state.phase !== 'ready') return state;
    const cfg = state.config, bpm = cfg.bpm, mine = ++gen;
    try {
      ctx = createAudioContext();
      await ctx.resume?.();
      if (cfg.sinkId && typeof ctx.setSinkId === 'function') { try { await ctx.setSinkId(cfg.sinkId); } catch { /* default output */ } }
      metro = makeMetronome({ audioContext: ctx, levelDbfs: cfg.levelDbfs, timers });
      metro.setMuted(false);
      const total = protocolTimeline(bpm, { protocol }).totalSec;
      cap = await capture({ deviceName: cfg.deviceName || null, maxSeconds: Math.ceil(total + METRONOME_LEAD_SEC + TAIL_SEC + 5), onLevels: liveHandler });
      if (mine !== gen) { await cap?.cancel?.(); return state; }
      const capStart = perf();
      metro.start(metronomeSchedule(bpm, null, { protocol }), { leadSec: METRONOME_LEAD_SEC });
      clickZeroPerf = perf() + METRONOME_LEAD_SEC * 1000;
      startSec = (clickZeroPerf - capStart) / 1000;
      set({ phase: 'running', muted: false, progress: phaseAt(bpm, -METRONOME_LEAD_SEC, protocol) });
      tick = timers.setInterval(onTick, 50);
    } catch (error) { fail(error); }
    return state;
  }

  function onTick() {
    if (state.phase !== 'running') return;
    const pos = (perf() - clickZeroPerf) / 1000, p = phaseAt(state.config.bpm, pos, protocol);
    state.progress = p; emit();
    if (pos >= p.totalSec + TAIL_SEC) finish(false);
  }

  /** Esc: the metronome is silenced synchronously before anything async happens (AC-7). */
  function abort() {
    if (state.phase === 'baseline') { cancelBaseline(); return true; }
    if (state.phase !== 'running' || finishing) return false;
    state.abortAtMs = perf();
    metro?.stop();
    state.mutedAtMs = perf();
    finish(true);
    return true;
  }

  function toggleMute() {
    if (state.phase !== 'running' || !metro) return state.muted;
    metro.setMuted(!state.muted);
    set({ muted: metro.muted });
    return state.muted;
  }

  async function finish(aborted) {
    if (finishing) return;
    finishing = true;
    clearTimers();
    try { metro?.stop(); } catch { /* already stopped */ }
    set({ phase: 'analyzing', aborted });
    try {
      const current = cap; cap = null;
      const { audio, streamErrors = [] } = await current.stop();
      closeCtx();
      await new Promise(resolve => timers.setTimeout(resolve, 0)); // let the "Analysing" state paint first
      const cfg = state.config;
      const result = analyze(audio, { format: cfg.format, bpm: cfg.bpm, protocol, startSec, baseline: state.baseline });
      if (streamErrors.length) result.warnings = [...(result.warnings || []), `The audio stream reported ${streamErrors.length} error(s) during the run.`];
      let plot = null;
      if (result.patterns.length) {
        try { plot = { ...downsampleTrace(instantVelocity(audio, { format: cfg.format })), startSec }; } catch { plot = null; }
        try { state.saved = await api.save(toRunRecord(result, cfg)); } catch (e) { state.saveError = e?.message || String(e); }
      }
      set({ phase: 'done', result, plot, aborted });
    } catch (error) { fail(error); }
    finally { finishing = false; }
  }

  function reset() { gen++; clearTimers(); closeCtx(); cap = null; set({ phase: 'setup', baseline: null, result: null, plot: null, saved: null, saveError: null, error: null, progress: null, aborted: false, muted: false }); }

  return { state, runBaseline, begin, abort, toggleMute, reset, get busy() { return ['baseline', 'running', 'analyzing'].includes(state.phase); }, get startSec() { return startSec; } };
}
