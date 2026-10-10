// FS-11 DVS latency and buffer tuner: pure logic plus an injectable bridge.
//
// Scope (FS-11 §7): DeckChek measures its own WASAPI path (cpal default host).
// The DJ software's ASIO session is never measured: every measured value is
// labelled SCOPE_LABEL, and ASIO buffers only appear when the user types them
// (labelled "typed, not measured").
//
// Buffer behaviour is detected at run time (the owner's WASAPI spike,
// docs/testing/results/spike-wasapi-buffers.md, has not run). Rust reports per
// run and direction whether a Fixed request was honoured / adjusted /
// hostChosen / unavailable; classifyBufferBehaviour() turns a sweep into the
// spike's decision-tree outcome, and the sweep and recommendation adapt:
//   A 'honoured'    -> stress table requested vs actual, smallest passing size + one step;
//   B 'partial'     -> achieved size is the truth, duplicates folded, clamped rows marked
//                      "host-chosen period" and excluded (AC-3), floor/granularity reported;
//   C 'ignored'     -> sweep replaced by one host-chosen row, no smallest-safe claim, the
//                      user types the ASIO panel buffer for recommendBuffer();
//   D 'unavailable' -> "duplex via WASAPI unavailable", ASIO panel value typed for "reported".

import { markerSignal, detectMarkerLag, combineStandardUncertainties } from './calibration.js';
import { repeatabilityMetrics } from './diagnostics.js';

// ---------- tunables (FS-11 §6; each has boundary tests) ----------
export const SCOPE_LABEL = 'WASAPI round trip';
export const TYPED_LABEL = 'ASIO buffer (typed, not measured)';
export const STRESS_SIZES = Object.freeze([1024, 512, 256, 128, 64]);
export const STEP_SECONDS = 30;
export const LOAD_LEVELS = Object.freeze([0, 50, 80]);
export const DEFAULT_LOAD_PCT = 50;
export const VERY_SAFE_LOAD_PCT = 80;
export const XRUN_GAP_FACTOR = 1.5;
export const IDLE_FLOOR_MARGIN_MS = 2;
export const MIN_STRENGTH = 0.3;
export const MIN_ACCEPTED_RUNS = 3;
export const REPEATS = 5;
export const SPACING_SEC = 1;
export const LEAD_SEC = 0.5;
export const TAIL_SEC = 0.5;
export const DEFAULT_LEVEL_DBFS = -20;
export const MIN_LEVEL_DBFS = -60;
export const MAX_LEVEL_DBFS = -12; // audio_out absolute cap (FS-00 §4.9)
export const OVERHEAD_FLAG_MS = 1;      // AC-2: flagged when overhead > 1 ms plus tolerance
export const OVERHEAD_TOLERANCE_MS = 1; // -> 2 ms, as FS-11 §6
export const CONSECUTIVE_FAILS_STOP = 2;
export const DPC_WARN_PCT = 5;
export const JITTER_WARN_MS = 2;
export const BACKGROUND_CPU_WARN_PCT = 10;
export const MIN_PROCESSOR_STATE_PASS = 100;
export const ADVISORY_ROUND_TRIP_MS = 10; // FS-11 §6: advisory only, not a hard threshold

export const HINTS_VERSION = 1;
/** Setting names per DJ program (FS-11 §6). `confidence` says how far each line is verified. */
export const SOFTWARE_BUFFER_HINTS = Object.freeze({
  serato: Object.freeze({
    name: 'Serato DJ Pro', setting: 'USB Buffer Size', path: 'Setup > Audio > USB Buffer Size',
    start: 'Serato suggests starting at 5 ms.', panel: 'On Windows, "Launch Driver Panel" sets the ASIO buffer.',
    confidence: 'snippet', source: 'https://support.serato.com/hc/en-us/articles/202536960-What-settings-should-I-use-for-buffer-size-in-both-applications',
  }),
  traktor: Object.freeze({
    name: 'Traktor Pro', setting: 'Latency', path: 'Preferences > Audio Setup > Latency (ms), or the ASIO control panel',
    start: 'The Traktor Play manual says to keep buffers under 256 to 512 samples.', panel: 'Traktor Pro 4 wording is not verified.',
    confidence: 'unverified', source: 'https://docs.native-instruments.com/online-guides/traktor-play-user-guide/en/preferences',
  }),
  rekordbox: Object.freeze({
    name: 'rekordbox', setting: 'Buffer Size', path: 'Preferences > Audio > Buffer Size (not verified)',
    start: '', panel: 'Check the rekordbox DVS setup guide for the exact name.',
    confidence: 'unverified', source: 'https://cdn.rekordbox.com/files/20260709200752/rekordbox7.2.16_dvs_setup_guide_EN.pdf',
  }),
});
export const SOFTWARE_IDS = Object.freeze(Object.keys(SOFTWARE_BUFFER_HINTS));

const num = v => typeof v === 'number' && Number.isFinite(v);
const round = (v, d = 2) => (num(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

export function framesToMs(frames, sampleRate) {
  return num(frames) && num(sampleRate) && sampleRate > 0 ? (frames * 1000) / sampleRate : null;
}

export function clampLevelDbfs(levelDbfs) {
  const v = Number(levelDbfs);
  if (!Number.isFinite(v)) return DEFAULT_LEVEL_DBFS;
  return Math.min(MAX_LEVEL_DBFS, Math.max(MIN_LEVEL_DBFS, v));
}

// ---------- round trip ----------

/**
 * Loopback stimulus: `repeats` unit-peak marker chirps (calibration.js markerSignal,
 * 2 to 8 kHz, 10 ms) every `spacingSec`. The level is applied by audio_out at
 * playback (meta.levelDbfs, clamped to -60..-12 dBFS), so the played peak equals it.
 */
export function chirpStimulus(sampleRate, { repeats = REPEATS, spacingSec = SPACING_SEC, leadSec = LEAD_SEC, tailSec = TAIL_SEC, levelDbfs = DEFAULT_LEVEL_DBFS } = {}) {
  if (!num(sampleRate) || sampleRate < 8000) throw new RangeError('sampleRate must be at least 8000 Hz');
  const n = Math.max(1, Math.min(20, Math.round(repeats)));
  if (!num(spacingSec) || spacingSec < 0.6) throw new RangeError('spacingSec must be at least 0.6 s (search window 0.5 s)');
  const marker = markerSignal(sampleRate, 1);
  const lead = Math.round(leadSec * sampleRate), spacing = Math.round(spacingSec * sampleRate);
  const markerStarts = Array.from({ length: n }, (_, k) => lead + k * spacing);
  const total = markerStarts[n - 1] + marker.length + Math.round(tailSec * sampleRate);
  const left = new Float32Array(total);
  for (const s of markerStarts) left.set(marker, s);
  return {
    left, right: Float32Array.from(left),
    meta: { sampleRate, markerStarts, markerLength: marker.length, repeats: n, spacingSec, levelDbfs: clampLevelDbfs(levelDbfs), totalSamples: total },
  };
}

/**
 * Mean, standard deviation and expanded uncertainty (k=2) of repeated round trips.
 * Standard uncertainty combines quantisation 1/(fs*sqrt(12)), the run std and the
 * duplex alignment spread (uniform, spread/sqrt(12)).
 */
export function summarizeRuns(values, { sampleRate = 48000, alignmentSpreadFrames = 0, k = 2 } = {}) {
  const r = repeatabilityMetrics((values || []).filter(num));
  const quantMs = 1000 / (sampleRate * Math.sqrt(12));
  const alignMs = num(alignmentSpreadFrames) && alignmentSpreadFrames > 0 ? (alignmentSpreadFrames * 1000) / sampleRate / Math.sqrt(12) : 0;
  if (!r.count) return { count: 0, meanMs: NaN, stdMs: NaN, quantMs, alignMs, standardMs: NaN, expandedMs: NaN };
  const standardMs = combineStandardUncertainties([quantMs, r.stdDev, alignMs]);
  return { count: r.count, meanMs: r.mean, stdMs: r.stdDev, quantMs, alignMs, standardMs, expandedMs: k * standardMs };
}

/**
 * Round trip from a duplex capture. `alignment` is the Rust duplex alignment
 * ({frames, minFrames, maxFrames}): the input frame at which output frame 0 was
 * handed to the output stream. Each marker is searched from its expected index;
 * runs with correlation strength < MIN_STRENGTH are rejected (FS-11 §6).
 */
export function measureRoundTrip(captured, meta, { alignment = null, channel = 'auto', minStrength = MIN_STRENGTH, maxLagSec = 0.5 } = {}) {
  const fs = captured?.sampleRate;
  if (!num(fs) || !meta?.markerStarts?.length) throw new RangeError('captured.sampleRate and meta.markerStarts are required');
  const ratio = fs / meta.sampleRate;
  const marker = markerSignal(fs, 1);
  const align = num(alignment?.frames) ? alignment.frames : 0;
  const spread = num(alignment?.maxFrames) && num(alignment?.minFrames) ? alignment.maxFrames - alignment.minFrames : 0;
  const chans = channel === 'left' ? ['left'] : channel === 'right' ? ['right'] : ['left', 'right'];
  const guard = 16;
  const runs = meta.markerStarts.map((start, index) => {
    const expected = align + start * ratio;
    const from = Math.max(0, Math.floor(expected) - guard);
    let best = { lag: null, strength: 0, channel: null };
    for (const ch of chans) {
      const data = captured[ch];
      if (!data?.length) continue;
      const d = detectMarkerLag(data, marker, fs, { maxLagSec, startSample: from });
      if (d.lag !== null && d.strength > best.strength) best = { ...d, channel: ch };
    }
    const latencySamples = best.lag === null ? null : from + best.lag - expected;
    const accepted = latencySamples !== null && best.strength >= minStrength && latencySamples > -guard / 2;
    return { index, latencySamples, latencyMs: framesToMs(latencySamples, fs), strength: best.strength, channel: best.channel, accepted };
  });
  const ok = runs.filter(r => r.accepted);
  const s = summarizeRuns(ok.map(r => r.latencyMs), { sampleRate: fs, alignmentSpreadFrames: spread });
  const meanSamples = ok.length ? ok.reduce((a, r) => a + r.latencySamples, 0) / ok.length : NaN;
  return {
    scope: SCOPE_LABEL,
    runs,
    acceptedRuns: ok.length,
    latencyMs: s.meanMs,
    latencySamples: meanSamples,
    peakStrength: Math.max(0, ...runs.map(r => r.strength || 0)),
    stdMs: s.stdMs,
    uncertaintyMs: s.expandedMs,
    standardUncertaintyMs: s.standardMs,
    ok: ok.length >= Math.min(MIN_ACCEPTED_RUNS, runs.length),
    noLoopback: ok.length === 0,
  };
}

/**
 * AC-2: reported = (Bin + Bout)/fs against the measured round trip. On WASAPI the
 * "reported" buffers are the periods the host actually ran. `typedPanelFrames`
 * (the user's ASIO panel value) is shown next to it, never mixed into it.
 */
export function reportedVsMeasured(reportedFrames, sampleRate, measuredMs, { expandedMs = 0, typedPanelFrames = null } = {}) {
  const bin = reportedFrames?.in, bout = reportedFrames?.out;
  const reportedMs = num(bin) && num(bout) ? framesToMs(bin + bout, sampleRate) : null;
  const overheadMs = reportedMs !== null && num(measuredMs) ? measuredMs - reportedMs : null;
  const u = num(expandedMs) ? expandedMs : 0;
  let flag = null;
  if (overheadMs !== null) {
    if (overheadMs > OVERHEAD_FLAG_MS + OVERHEAD_TOLERANCE_MS + u) flag = 'high';
    else if (overheadMs < -u) flag = 'negative';
  }
  const typed = num(typedPanelFrames) && typedPanelFrames > 0
    ? { frames: typedPanelFrames, ms: framesToMs(typedPanelFrames, sampleRate), label: TYPED_LABEL } : null;
  return {
    scope: SCOPE_LABEL, reportedMs, measuredMs: num(measuredMs) ? measuredMs : null, overheadMs, flag,
    overheadLabel: 'driver/USB overhead',
    note: flag === 'high' ? 'More than 2 ms above the buffers: driver safety offset, converters or USB.'
      : flag === 'negative' ? 'Measured below the buffer total: the driver misreports its buffers.' : null,
    advisory: num(measuredMs) && measuredMs > ADVISORY_ROUND_TRIP_MS ? `Above about ${ADVISORY_ROUND_TRIP_MS} ms; scratch DJs usually prefer less (advisory).` : null,
    typedPanel: typed,
  };
}

// ---------- stress ----------

/** Cross-cutting spike note: idle p99 gap + margin becomes the xrun floor for the load run. */
export function idleGapFloorMs(idleResult, { marginMs = IDLE_FLOOR_MARGIN_MS } = {}) {
  const p99 = idleResult?.p99GapMs;
  return num(p99) ? p99 + marginMs : null;
}

function periodMsOf(result) {
  const p = [result?.input?.actualPeriodMs, result?.output?.actualPeriodMs].filter(num);
  return p.length ? Math.max(...p) : null;
}

/**
 * FS-11 AC-4/§6: pass when the step completed with 0 xruns, 0 overruns, no stream
 * errors and max callback gap < max(1.5 x actual period, floor). Any xrun fails,
 * at idle as well as under load.
 */
export function evaluateStressStep(result, loadPct = 0, { floorMs = null } = {}) {
  void loadPct; // same rule at every load (AC-4); kept for the spec signature
  if (!result || result.ended !== 'completed') return 'fail';
  if ((result.xruns ?? 0) > 0 || (result.overruns ?? 0) > 0 || (result.streamErrors?.length ?? 0) > 0) return 'fail';
  const period = periodMsOf(result);
  if (period === null) return 'fail';
  const base = XRUN_GAP_FACTOR * period;
  const limit = num(floorMs) && floorMs > base ? floorMs : base;
  return num(result.maxGapMs) && result.maxGapMs >= limit ? 'fail' : 'pass';
}

/** Sizes to test: those outside a known device range are skipped (FS-11 §3/§7). */
export function planStressSweep(bufferInfo, { sizes = STRESS_SIZES } = {}) {
  const ranges = [bufferInfo?.input, bufferInfo?.output].filter(r => r?.known);
  return [...sizes].sort((a, b) => b - a).map(requested => {
    const out = ranges.find(r => (num(r.minFrames) && requested < r.minFrames) || (num(r.maxFrames) && requested > r.maxFrames));
    return out ? { requested, status: 'skipped', reason: 'Not supported by driver (skipped)' } : { requested, status: 'planned', reason: null };
  });
}

const OUTCOME_RANK = { honoured: 0, partial: 1, unknown: 2, ignored: 3, unavailable: 4 };
export const OUTCOME_NOTES = Object.freeze({
  honoured: 'The host ran every requested buffer size.',
  partial: 'The host changed some sizes; only sizes it really ran are compared.',
  ignored: 'The host chooses its own period (WASAPI shared mode). A buffer sweep is not possible here; type the ASIO buffer you use in your DJ software.',
  unavailable: 'Duplex via WASAPI unavailable on this device. Set the buffer in the vendor ASIO panel and type it here.',
  unknown: 'More sizes are needed to tell how the host treats buffer requests.',
});
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

function directionOutcome(steps, dir) {
  const rows = steps.map(s => ({ requested: s.requested ?? null, ...(s[dir] || {}) }));
  const usable = rows.filter(r => r.mode && r.mode !== 'unavailable');
  if (!rows.length) return { outcome: 'unknown' };
  if (!usable.length) return { outcome: 'unavailable', reason: rows[0]?.modeReason ?? null };
  const fixed = usable.filter(r => r.requested !== null);
  const honoured = fixed.filter(r => r.mode === 'honoured');
  const adjusted = fixed.filter(r => r.mode === 'adjusted');
  const rejected = fixed.filter(r => r.mode === 'hostChosen');
  const actuals = [...new Set(usable.map(r => r.actualFrames).filter(num))];
  if (!fixed.length || rejected.length === fixed.length) {
    return { outcome: 'ignored', reason: fixed.length ? 'fixedRejected' : 'defaultRequested', hostPeriodFrames: actuals.length === 1 ? actuals[0] : null };
  }
  if (!adjusted.length && !rejected.length) return { outcome: 'honoured' };
  const distinctRequests = new Set(fixed.map(r => r.requested)).size;
  const fixedActuals = [...new Set(fixed.map(r => r.actualFrames).filter(num))];
  if (!honoured.length && fixedActuals.length === 1) {
    // One host period for every request: C. A single adjusted size cannot tell B from C yet.
    return distinctRequests >= 2 ? { outcome: 'ignored', reason: 'samePeriod', hostPeriodFrames: fixedActuals[0] } : { outcome: 'unknown', reason: 'needsSecondSize', hostPeriodFrames: fixedActuals[0] };
  }
  const minActual = Math.min(...fixedActuals);
  const floorFrames = fixed.some(r => r.requested < minActual) ? minActual : null;
  const rounded = adjusted.filter(r => r.actualFrames !== floorFrames).map(r => r.actualFrames);
  const granularityFrames = rounded.length >= 2 ? rounded.reduce(gcd) : null;
  return { outcome: 'partial', floorFrames, granularityFrames: granularityFrames > 1 ? granularityFrames : null };
}

/**
 * Decision-tree outcome of a sweep (spike doc A-D), per direction and overall (the
 * more restrictive). `steps` are stress_run results.
 */
export function classifyBufferBehaviour(steps = []) {
  const valid = steps.filter(Boolean);
  const input = directionOutcome(valid, 'input'), output = directionOutcome(valid, 'output');
  const worst = OUTCOME_RANK[input.outcome] >= OUTCOME_RANK[output.outcome] ? input : output;
  const differ = valid.some(s => num(s.input?.actualFrames) && num(s.output?.actualFrames) && s.input.actualFrames !== s.output.actualFrames);
  const note = OUTCOME_NOTES[worst.outcome];
  return {
    outcome: worst.outcome,
    input, output,
    floorFrames: input.floorFrames ?? output.floorFrames ?? null,
    granularityFrames: input.granularityFrames ?? output.granularityFrames ?? null,
    hostPeriodFrames: worst.hostPeriodFrames ?? null,
    inOutDiffer: differ,
    claimsSweep: worst.outcome === 'honoured' || worst.outcome === 'partial',
    note,
  };
}

/**
 * Table rows from steps (each {requested, idle, load, verdicts:{<load>:'pass'|'fail'}}).
 * Achieved size is the truth: effectiveFrames = larger actual of the two directions.
 * Rows that resolve to the same period are folded (duplicateOf); clamped or
 * fallback rows are "host-chosen period" and never eligible (AC-3).
 */
export function stressRows(steps, classification = classifyBufferBehaviour(steps.map(s => s.idle))) {
  const claims = classification?.claimsSweep;
  const rows = steps.map(s => {
    const r = s.idle || s.load || {};
    const a = [r.input?.actualFrames, r.output?.actualFrames].filter(num);
    const effectiveFrames = a.length ? Math.max(...a) : null;
    const modes = [r.input?.mode, r.output?.mode].filter(m => m && m !== 'unavailable');
    return {
      requested: s.requested ?? null, actualIn: r.input?.actualFrames ?? null, actualOut: r.output?.actualFrames ?? null, effectiveFrames,
      sampleRate: r.input?.sampleRate ?? r.output?.sampleRate ?? null,
      modes, verdicts: { ...(s.verdicts || {}) }, maxGapMs: (s.load || r).maxGapMs ?? null, xruns: (s.load || r).xruns ?? null,
      hostChosen: s.requested === null || modes.includes('hostChosen'), duplicateOf: null, eligible: false, label: '',
    };
  });
  const groups = new Map();
  for (const row of rows) {
    if (row.effectiveFrames === null) continue;
    if (!groups.has(row.effectiveFrames)) groups.set(row.effectiveFrames, []);
    groups.get(row.effectiveFrames).push(row);
  }
  for (const [frames, group] of groups) {
    const exact = group.find(r => r.requested === frames && !r.hostChosen);
    const keep = exact || group[0];
    for (const r of group) {
      if (r !== keep) r.duplicateOf = keep.requested;
      // A size reached by several requests without being asked for is the host's floor (clamp).
      if (!exact && group.length > 1) r.hostChosen = true;
    }
  }
  const floor = classification?.floorFrames;
  for (const r of rows) {
    // A request below the host's floor that came back at the floor was clamped, not honoured.
    if (num(floor) && r.effectiveFrames === floor && num(r.requested) && r.requested < floor) r.hostChosen = true;
    r.eligible = Boolean(claims && r.effectiveFrames !== null && !r.hostChosen && r.duplicateOf === null);
    r.label = r.effectiveFrames === null ? 'Not run'
      : r.hostChosen ? 'host-chosen period'
        : r.duplicateOf !== null ? `same period as ${r.duplicateOf}`
          : r.requested === r.effectiveFrames ? `${r.effectiveFrames} frames` : `${r.effectiveFrames} frames (requested ${r.requested})`;
  }
  return rows;
}

function settingText(software, frames, sampleRate) {
  const h = SOFTWARE_BUFFER_HINTS[software];
  if (!h) return '';
  const ms = round(framesToMs(frames, sampleRate), 1);
  const base = `Set ${h.name} ${h.setting} to the ASIO panel value of ${frames}${ms !== null ? ` (about ${ms} ms)` : ''} to start.`;
  return [base, h.start, h.panel].filter(Boolean).join(' ');
}

/**
 * FS-11 AC-4: smallest passing buffer at the chosen load plus one step of headroom,
 * per software. Only sweeps the host really ran (A/B) can claim a smallest safe
 * buffer. Otherwise (C/D) the result is built from the typed ASIO panel value and
 * says so; nothing is presented as measured ASIO latency.
 */
export function recommendBuffer(rows, sampleRate, software, { outcome = 'honoured', typedPanelFrames = null, loadPct = DEFAULT_LOAD_PCT } = {}) {
  if (!SOFTWARE_BUFFER_HINTS[software]) throw new RangeError(`software must be one of ${SOFTWARE_IDS.join(', ')}`);
  const hint = SOFTWARE_BUFFER_HINTS[software];
  const typed = num(typedPanelFrames) && typedPanelFrames > 0 ? Math.round(typedPanelFrames) : null;
  const sweep = outcome === 'honoured' || outcome === 'partial';
  if (!sweep) {
    return {
      software, basis: typed ? 'typed' : 'none', claimsSmallestSafe: false, needsTypedBuffer: typed === null,
      frames: typed, ms: typed ? framesToMs(typed, sampleRate) : null, headroomFrames: null, verySafe: false,
      label: typed ? TYPED_LABEL : null,
      settingText: typed ? `${settingText(software, typed, sampleRate)} DeckChek could not test buffer sizes on this path, so verify in ${hint.name} for 10 minutes.`
        : `DeckChek cannot test buffer sizes on this path. Type the ASIO buffer you use in ${hint.name}.`,
      hintsVersion: HINTS_VERSION,
    };
  }
  const eligible = (rows || []).filter(r => r.eligible).sort((a, b) => a.effectiveFrames - b.effectiveFrames);
  // smallest size that passes together with every larger eligible size
  let smallest = null;
  for (let i = eligible.length - 1; i >= 0; i--) {
    if (eligible[i].verdicts?.[loadPct] === 'pass') smallest = i;
    else break;
  }
  if (smallest === null) {
    return {
      software, basis: 'none', claimsSmallestSafe: false, needsTypedBuffer: false, frames: null, ms: null, headroomFrames: null, verySafe: false, label: null,
      settingText: 'No tested buffer passed. Increase the buffer in your DJ software and work through the Windows checklist.', hintsVersion: HINTS_VERSION,
    };
  }
  const pick = eligible[Math.min(smallest + 1, eligible.length - 1)];
  const frames = pick.effectiveFrames, ms = framesToMs(frames, sampleRate);
  const khz = round(sampleRate / 1000, 1);
  return {
    software, basis: 'measured', claimsSmallestSafe: true, needsTypedBuffer: false,
    frames, ms, smallestPassingFrames: eligible[smallest].effectiveFrames, headroomFrames: frames - eligible[smallest].effectiveFrames,
    verySafe: pick.verdicts?.[VERY_SAFE_LOAD_PCT] === 'pass',
    label: `${SCOPE_LABEL} stress test`,
    settingText: `Lowest safe setting: ${frames} samples (about ${round(ms, 1)} ms at ${khz} kHz). ${settingText(software, frames, sampleRate)} Test load is a proxy; verify in your software for 10 minutes.`,
    hintsVersion: HINTS_VERSION,
  };
}

// ---------- Windows checklist (AC-6) ----------

const HIGH_PERF_GUIDS = new Set(['8c5e7fda-e8bf-4a96-9a85-cd73a8a2b7a0', 'e9a42b02-d5df-448d-aa00-03f14749eb61']);

/** Read-only checklist items: pass / review / unknown, with the inspect command and the manual path. */
export function windowsChecklist(raw) {
  if (!raw?.supported) return [];
  const item = (id, label, status, detail, inspect, change) => ({ id, label, status, detail, inspect, change });
  const plan = raw.activePlan;
  const items = [];
  items.push(item('powerPlan', 'Power plan',
    !plan ? 'unknown' : HIGH_PERF_GUIDS.has(plan.guid) || /high performance|ultimate|dj/i.test(plan.name || '') ? 'pass' : 'review',
    plan ? `Active plan: ${plan.name || plan.guid}` : 'Could not read the active plan.',
    'powercfg /getactivescheme', 'Control Panel > Power Options > choose High performance (or your vendor\'s DJ plan).'));
  const usb = raw.usbSelectiveSuspend || {};
  items.push(item('usbSelectiveSuspend', 'USB selective suspend',
    !num(usb.ac) ? 'unknown' : usb.ac === 0 && (!num(usb.dc) || usb.dc === 0) ? 'pass' : 'review',
    num(usb.ac) ? `Plugged in: ${usb.ac === 0 ? 'disabled' : 'enabled'}${num(usb.dc) ? `; on battery: ${usb.dc === 0 ? 'disabled' : 'enabled'}` : ''}` : 'Not reported.',
    'powercfg /query SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226',
    'Power Options > Change plan settings > Change advanced power settings > USB settings > USB selective suspend setting > Disabled.'));
  const mps = raw.minProcessorState || {};
  items.push(item('minProcessorState', 'Minimum processor state',
    !num(mps.ac) ? 'unknown' : mps.ac >= MIN_PROCESSOR_STATE_PASS ? 'pass' : 'review',
    num(mps.ac) ? `Plugged in: ${mps.ac} %` : 'Not reported.',
    'powercfg /query SCHEME_CURRENT SUB_PROCESSOR', 'Advanced power settings > Processor power management > Minimum processor state.'));
  const cores = raw.minCores || {};
  items.push(item('coreParking', 'Core parking (minimum cores)',
    !num(cores.ac) ? 'unknown' : cores.ac >= 100 ? 'pass' : 'review',
    num(cores.ac) ? `Plugged in: ${cores.ac} % of cores unparked. Its effect on current Windows is debated.` : 'Hidden or not reported on this system.',
    'powercfg /query SCHEME_CURRENT SUB_PROCESSOR', 'Only reachable with vendor tools or powercfg; review, do not force.'));
  const wifiUp = (raw.wifi || []).filter(w => /^up$/i.test(w.status || ''));
  items.push(item('wifi', 'Wi-Fi', wifiUp.length ? 'review' : 'pass',
    wifiUp.length ? `Connected: ${wifiUp.map(w => w.name).join(', ')}. Consider Airplane mode during the set.` : 'No Wi-Fi adapter connected.',
    'Get-NetAdapter -Physical', 'Settings > Network & internet > Airplane mode.'));
  const btOn = (raw.bluetooth || []).filter(b => /^ok$/i.test(b.status || ''));
  items.push(item('bluetooth', 'Bluetooth', btOn.length ? 'review' : 'pass',
    btOn.length ? 'Bluetooth is on. Consider Airplane mode during the set.' : 'No active Bluetooth device.',
    'Get-PnpDevice -Class Bluetooth', 'Settings > Bluetooth & devices.'));
  items.push(item('power', 'Power source', raw.onBattery === true ? 'review' : raw.onBattery === false ? 'pass' : 'unknown',
    raw.onBattery === true ? 'Running on battery: plug in; laptops throttle and run warmer on battery.' : raw.onBattery === false ? 'On mains power.' : 'Not reported.',
    'Get-CimInstance Win32_Battery', 'Plug in the charger.'));
  const dpc = raw.dpcProxy || {};
  items.push(item('dpc', 'DPC / interrupt time (proxy)',
    !num(dpc.dpcPct) ? 'unknown' : dpc.dpcPct > DPC_WARN_PCT ? 'review' : 'pass',
    num(dpc.dpcPct) ? `DPC ${round(dpc.dpcPct)} %, interrupt ${round(dpc.interruptPct)} % over ${dpc.samples} s. A proxy only: LatencyMon names the driver.` : 'Counters not available.',
    'Get-Counter "\\Processor Information(_Total)\\% DPC Time"', 'Run LatencyMon for 10 to 30 minutes to find the driver.'));
  const j = raw.timerJitter;
  items.push(item('timerJitter', 'Timer wake-up jitter',
    !num(j?.p99Ms) ? 'unknown' : j.p99Ms > JITTER_WARN_MS ? 'review' : 'pass',
    num(j?.p99Ms) ? `1 ms sleeps woke up to ${round(j.p99Ms)} ms late (p99).` : 'Not measured.',
    'DeckChek timer test (1 ms sleeps)', 'Close background apps; update chipset and network drivers.'));
  const busy = (raw.backgroundApps || []).filter(a => num(a.cpuPct) && a.cpuPct > BACKGROUND_CPU_WARN_PCT);
  items.push(item('backgroundApps', 'Background apps',
    !raw.backgroundApps ? 'unknown' : busy.length ? 'review' : 'pass',
    busy.length ? `Busy: ${busy.map(a => `${a.exe} ${round(a.cpuPct, 1)} %`).join(', ')}` : 'No app above 10 % CPU.',
    'tasklist; Get-Counter "\\Process(*)\\% Processor Time"', 'Close or pause these apps before the set.'));
  return items;
}

// ---------- persistence inputs ----------

export function roundTripRunInput({ deviceName, hostApi = null, sampleRate, bufferFrames = null, analysis, comparison = null, classification = null, sessionId = null, setupId = null, typedPanelFrames = null }) {
  return {
    sessionId, setupId, deviceName, hostApi, sampleRateHz: sampleRate, kind: 'roundtrip', bufferFrames,
    cpuLoadPct: null, measuredMs: num(analysis?.latencyMs) ? round(analysis.latencyMs, 4) : null,
    stdMs: num(analysis?.stdMs) ? round(analysis.stdMs, 4) : null, expandedUMs: num(analysis?.uncertaintyMs) ? round(analysis.uncertaintyMs, 4) : null,
    reportedMs: num(comparison?.reportedMs) ? round(comparison.reportedMs, 4) : null, xruns: null, maxGapMs: null,
    verdict: num(analysis?.latencyMs) ? `${SCOPE_LABEL} ${round(analysis.latencyMs)} ms` : 'No loopback signal detected',
    detail: {
      scope: SCOPE_LABEL, outcome: classification?.outcome ?? null, runs: (analysis?.runs || []).map(r => ({ ms: round(r.latencyMs, 4), strength: round(r.strength, 3), accepted: r.accepted })),
      overheadMs: round(comparison?.overheadMs, 4), flag: comparison?.flag ?? null,
      typedPanel: num(typedPanelFrames) ? { frames: typedPanelFrames, label: TYPED_LABEL } : null,
    },
  };
}

export function stressRunInput({ deviceName, hostApi = null, sampleRate, result, loadPct, verdict, classification = null, sessionId = null, setupId = null }) {
  return {
    sessionId, setupId, deviceName, hostApi, sampleRateHz: sampleRate, kind: 'stress', bufferFrames: result?.requested ?? null, cpuLoadPct: loadPct,
    measuredMs: null, stdMs: null, expandedUMs: null, reportedMs: null, xruns: result?.xruns ?? null, maxGapMs: num(result?.maxGapMs) ? result.maxGapMs : null, verdict,
    detail: {
      scope: SCOPE_LABEL, bufferMode: result?.bufferMode ?? null, duplex: result?.duplex ?? null, actual: result?.actual ?? null, outcome: classification?.outcome ?? null,
      input: { mode: result?.input?.mode, modeReason: result?.input?.modeReason, actualFrames: result?.input?.actualFrames ?? null, fixedError: result?.input?.fixedError ?? null },
      output: { mode: result?.output?.mode, modeReason: result?.output?.modeReason, actualFrames: result?.output?.actualFrames ?? null, fixedError: result?.output?.fixedError ?? null },
      ended: result?.ended ?? null,
    },
  };
}

// ---------- bridge ----------

export class LatencyError extends Error {
  constructor(code, message, detail = null) { super(message); this.name = 'LatencyError'; this.code = code; this.detail = detail; }
}

function toLatencyError(e) {
  if (e instanceof LatencyError) return e;
  if (e && typeof e === 'object' && e.code === 'CAPTURE_BUSY') return new LatencyError('CAPTURE_BUSY', e.message || 'The audio input is busy.', e);
  const text = String(e?.message ?? e ?? 'Unknown error');
  const m = /^([A-Z][A-Z0-9_]+): (.*)$/s.exec(text);
  return m ? new LatencyError(m[1], m[2]) : new LatencyError('LATENCY_ERROR', text);
}

function nativeInvoke() {
  const t = globalThis.__TAURI__;
  return t?.core?.invoke ? (cmd, args) => t.core.invoke(cmd, args) : null;
}

/**
 * Bridge to the Rust tuner. `invoke` defaults to the Tauri bridge; pass `invoke: null`
 * for browser mode (supported = false; every call rejects with code 'unsupported').
 */
export function createLatencyTuner({ invoke } = {}) {
  const bridge = () => (invoke === undefined ? nativeInvoke() : invoke);
  const call = async (cmd, args) => {
    const fn = bridge();
    if (!fn) throw new LatencyError('unsupported', 'The latency tuner needs the DeckChek desktop app.');
    try { return await fn(cmd, args); } catch (e) { throw toLatencyError(e); }
  };
  return {
    get supported() { return Boolean(bridge()); },
    bufferInfo({ deviceName = null, outDevice = null } = {}) { return call('audio_device_buffer_info', { deviceName, outDevice }); },
    stress({ deviceName = null, outDevice = null, bufferFrames = null, seconds = STEP_SECONDS, cpuLoadPct = 0, gapFloorMs = null, sampleRate = null, step = null } = {}) {
      return call('stress_run', { deviceName, outDevice, bufferFrames, seconds, cpuLoadPct, gapFloorMs, sampleRate, step });
    },
    /** Plays the chirp stimulus through audio_out and returns the raw result plus the analysis. */
    async measure({ deviceName = null, outDevice = null, bufferFrames = null, sampleRate = 48000, levelDbfs = DEFAULT_LEVEL_DBFS, repeats = REPEATS, step = null, typedPanelFrames = null } = {}) {
      const stim = chirpStimulus(sampleRate, { repeats, levelDbfs });
      const result = await call('latency_play_and_capture', {
        deviceName, outDevice, stimulus: { sampleRate, left: Array.from(stim.left), right: [] }, bufferFrames, levelDbfs: stim.meta.levelDbfs, step,
      });
      if (!result?.captured) return { result, analysis: null, comparison: null };
      const analysis = measureRoundTrip(result.captured, stim.meta, { alignment: result.alignment });
      const comparison = reportedVsMeasured(result.reportedBufferFrames, result.captured.sampleRate, analysis.latencyMs, { expandedMs: analysis.uncertaintyMs, typedPanelFrames });
      return { result, analysis, comparison };
    },
    abort() { return bridge() ? call('latency_abort', {}) : Promise.resolve(); },
    scan({ dpcSeconds = 10 } = {}) { return call('windows_tuning_scan', { dpcSeconds }); },
    saveRun(input) { return call('latency_run_save', { input }); },
    listRuns(filter = {}) { return call('latency_run_list', { filter }); },
    deleteRun(id) { return call('latency_run_delete', { id }); },
    saveRecommendation(input) { return call('buffer_recommendation_save', { input }); },
    latestRecommendations(deviceName) { return call('buffer_recommendation_latest', { deviceName }); },
  };
}

/**
 * Stress sweep that adapts to the detected spike outcome: large to small, idle
 * then load per size (the idle p99 gap feeds the load step's xrun floor), stop
 * after CONSECUTIVE_FAILS_STOP fails at the chosen load. When the host turns out
 * to ignore or refuse Fixed (C) the sweep stops and one host-chosen row
 * (bufferFrames null) is run instead; when duplex is unavailable (D) it stops.
 */
export async function runStressSweep({ tuner, deviceName = null, outDevice = null, bufferInfo = null, sizes = STRESS_SIZES, loadPct = DEFAULT_LOAD_PCT, seconds = STEP_SECONDS, isAborted = () => false, onStep = () => {} } = {}) {
  const plan = planStressSweep(bufferInfo, { sizes });
  const steps = [];
  let fails = 0, aborted = false, stopReason = null;
  const runStep = async requested => {
    const idle = await tuner.stress({ deviceName, outDevice, bufferFrames: requested, seconds, cpuLoadPct: 0, step: steps.length });
    const floorMs = idleGapFloorMs(idle);
    const verdicts = { 0: evaluateStressStep(idle, 0) };
    let load = null;
    if (loadPct > 0 && idle.ended === 'completed' && idle.duplex !== 'none') {
      load = await tuner.stress({ deviceName, outDevice, bufferFrames: requested, seconds, cpuLoadPct: loadPct, gapFloorMs: floorMs, step: steps.length });
      verdicts[loadPct] = evaluateStressStep(load, loadPct, { floorMs });
    }
    const step = { requested, idle, load, floorMs, verdicts };
    steps.push(step);
    onStep(step, steps);
    return step;
  };
  for (const p of plan.filter(x => x.status === 'planned')) {
    if (isAborted()) { aborted = true; break; }
    const step = await runStep(p.requested);
    if ([step.idle, step.load].some(r => r?.ended === 'aborted')) { aborted = true; break; }
    if (step.idle.duplex !== 'full') { stopReason = 'duplexUnavailable'; break; }
    const c = classifyBufferBehaviour(steps.map(s => s.idle));
    if (c.outcome === 'ignored') { stopReason = 'hostChosenPeriod'; break; }
    const v = step.verdicts[loadPct] ?? step.verdicts[0];
    fails = v === 'fail' ? fails + 1 : 0;
    if (fails >= CONSECUTIVE_FAILS_STOP) { stopReason = 'consecutiveFails'; break; }
  }
  let classification = classifyBufferBehaviour(steps.map(s => s.idle));
  if (stopReason === 'hostChosenPeriod' && !aborted && !isAborted()) {
    // C: replace the sweep by one row at the host's own period.
    const swept = steps.splice(0);
    await runStep(null);
    classification = { ...classifyBufferBehaviour(swept.map(s => s.idle)), sweptSteps: swept.length };
  }
  if (stopReason === 'duplexUnavailable') classification = { ...classification, outcome: 'unavailable', claimsSweep: false, note: OUTCOME_NOTES.unavailable };
  const rows = stressRows(steps, classification);
  return { plan, steps, rows, classification, aborted, stopReason, loadPct };
}
