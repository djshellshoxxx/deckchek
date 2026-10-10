// Latency & buffer screen (FS-11): measure the WASAPI round trip through a patch cable, stress-test buffer sizes,
// recommend a safe buffer per DJ program (with that program's own setting names) and walk the Windows tuning
// checklist. All numbers come from ../../latency.js (pure) and the Rust tuner; this file is layout and flow.
//
// Scope honesty is part of the UI: every measured value is a WASAPI (Windows audio) figure, never ASIO. ASIO
// buffers appear only when the user types them, labelled "ASIO buffer (typed, not measured)".
// Flag: features.latencyTuner. Desktop only (the audio streams live in Rust); browser mode shows the guidance
// and an explanatory unsupported state.

import { h, esc, isNative, download } from '../dom.js';
import { icon, chip } from '../icons.js';
import { pdfButton, latencyPrintData } from '../workflows/m6-reports.js';
import { announce, toast } from '../live.js';
import { listInputDevices, preemptCapture, isCaptureBusy } from '../audio-io.js';
import { confirmCaptureBusy } from '../capture-busy.js';
import {
  createLatencyTuner, runStressSweep, planStressSweep, stressRows, classifyBufferBehaviour, recommendBuffer, windowsChecklist,
  roundTripRunInput, stressRunInput, framesToMs, SOFTWARE_BUFFER_HINTS, SOFTWARE_IDS, SCOPE_LABEL, TYPED_LABEL, STRESS_SIZES,
  LOAD_LEVELS, DEFAULT_LOAD_PCT, STEP_SECONDS, REPEATS, DEFAULT_LEVEL_DBFS, MAX_LEVEL_DBFS, MIN_STRENGTH, MIN_ACCEPTED_RUNS,
  ADVISORY_ROUND_TRIP_MS, DPC_WARN_PCT, HINTS_VERSION,
} from '../../latency.js';

const TABS = [['measure', '1  Measure'], ['buffer', '2  Buffer test'], ['advice', '3  Recommendation'], ['windows', '4  Windows tuning']];
const SAMPLE_RATES = [44100, 48000, 96000];
const QUICK_SECONDS = 10;
const LEVEL_MIN_UI = -40;

/** What each detected WASAPI buffer branch means, in words a DJ can act on (spike decision tree A to D). */
export const BRANCHES = Object.freeze({
  honoured: { letter: 'A', status: 'pass', title: 'Honoured', text: 'Windows ran every buffer size we asked for, so the table compares real sizes and DeckChek can name the smallest safe one.' },
  partial: { letter: 'B', status: 'review', title: 'Partly honoured', text: 'Windows changed some of the sizes we asked for. Only sizes it really ran are compared; changed rows are marked "host-chosen period" and left out of the recommendation.' },
  ignored: { letter: 'C', status: 'warn', title: 'Ignored', text: 'Windows audio (shared mode) picks its own buffer whatever we ask, so there is no buffer sweep here and DeckChek cannot name a smallest safe size. Type the ASIO buffer you use in your DJ software and verify it there.' },
  unavailable: { letter: 'D', status: 'fail', title: 'Streams failed to open', text: 'This device could not be opened for input and output together through Windows audio. This usually means another program, or the interface\'s ASIO driver, holds it. Close your DJ software, or set the buffer in the interface\'s ASIO control panel and type it below.' },
  unknown: { letter: '?', status: 'info', title: 'Not decided yet', text: 'More buffer sizes are needed before DeckChek can tell how Windows treats buffer requests.' },
});

const FIX_COMMAND = Object.freeze({
  powerPlan: 'control powercfg.cpl', usbSelectiveSuspend: 'control powercfg.cpl', minProcessorState: 'control powercfg.cpl',
  wifi: 'ms-settings:network-airplanemode', bluetooth: 'ms-settings:bluetooth', timerJitter: 'taskmgr', backgroundApps: 'taskmgr',
});
const STATUS_ORDER = { review: 0, unknown: 1, pass: 2 };
const END_TEXT = {
  aborted: ['Stopped', 'The run was stopped before it finished.'],
  clipped: ['The loopback clipped', 'The returning signal was too loud, so the output was stopped. Lower the test level, and make sure the cable goes into a LINE input, not PHONO.'],
  preempted: ['Another feature took the input', 'Another DeckChek feature started using the audio input, so this run was stopped.'],
  deviceLost: ['The audio device went away', 'The interface was unplugged or reset during the run. Reconnect it and try again.'],
  timeout: ['The run took too long', 'The audio device stopped responding. Close other audio programs and try again.'],
  noStreams: ['The device could not be opened', 'Windows would not open this interface for input and output. Close your DJ software and any other audio program that may hold it, then try again.'],
};

const num = v => typeof v === 'number' && Number.isFinite(v);
const fmtMs = v => (num(v) ? `${(Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1)).replace('-', '−')} ms` : '—');
const fmtNum = (v, d = 0) => (num(v) ? v.toFixed(d).replace('-', '−') : '—');
const friendly = e => (typeof e === 'string' ? e : e?.message || 'Something went wrong.');

// ------------------------------------------------------------------ pure helpers (unit tested)

/** Input device name -> best output device: same interface name before the "(In 1/2)" part, else the default. */
export function matchOutput(inputName, outputs) {
  const base = n => String(n || '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
  const b = base(inputName);
  const same = b && outputs.find(o => base(o.name) === b);
  return (same || outputs.find(o => o.isDefault) || outputs[0] || {}).name || '';
}

/** Plain-language description of a round-trip attempt: kind, headline, body and fix list. */
export function describeMeasure(res) {
  const { analysis, result } = res || {};
  if (!result) return { kind: 'error', title: 'No result', body: 'The measurement returned nothing.', fixes: [] };
  const end = result.ended;
  if (end && end !== 'completed' && END_TEXT[end]) return { kind: end === 'aborted' ? 'aborted' : 'error', title: END_TEXT[end][0], body: END_TEXT[end][1], fixes: [] };
  if (!result.captured || (result.duplex && result.duplex !== 'full')) {
    return { kind: 'unavailable', title: 'Round trip not possible on this path', body: BRANCHES.unavailable.text, fixes: [] };
  }
  if (!analysis || analysis.noLoopback) {
    return {
      kind: 'none', title: 'No chirp came back', body: 'DeckChek played the chirps but heard none of them on the input.',
      fixes: [
        'Check the patch cable goes from an interface OUTPUT to an interface INPUT, and that both ends are pushed in.',
        'Use a LINE input. A PHONO input would not hear a line-level chirp properly.',
        'If a mixer sits between them, set its channel to LINE, fader up, and the channel on the output you cabled.',
        'Make sure the input device and the output device above are the same interface.',
      ],
    };
  }
  if (!analysis.ok) {
    return {
      kind: 'weak', title: 'Unreliable result', body: `Only ${analysis.acceptedRuns} of ${analysis.runs.length} chirps were heard clearly (at least ${MIN_ACCEPTED_RUNS} are needed), so the number below is a guess.`,
      fixes: ['Raise the test level a little, or lower any input gain.', 'Remove noise sources near the cable and run the measurement again.'],
    };
  }
  return { kind: 'ok', title: 'Round trip measured', body: '', fixes: [] };
}

/** Rows of the buffer-test table: the plan, merged with the steps that have run. */
export function sweepTable(plan, sweep, { busy = false, loadPct = DEFAULT_LOAD_PCT, sampleRate = 48000 } = {}) {
  const rows = sweep?.rows || [];
  const verdictOf = (row, pct) => row.verdicts?.[pct] ?? null;
  const done = r => {
    const same = r.actualIn === r.actualOut || r.actualOut === null || r.actualIn === null;
    const frames = r.effectiveFrames;
    return {
      key: String(r.requested), status: 'done', requested: r.requested,
      ranAt: frames === null ? 'Did not run' : same ? `${frames} frames (${fmtMs(framesToMs(frames, r.sampleRate || sampleRate))})` : `in ${r.actualIn} / out ${r.actualOut} frames`,
      idle: verdictOf(r, 0), load: loadPct > 0 ? verdictOf(r, loadPct) : null, xruns: r.xruns, maxGapMs: r.maxGapMs,
      note: r.label, eligible: r.eligible, hostChosen: r.hostChosen,
    };
  };
  const hostOnly = rows.some(r => r.requested === null);
  if (hostOnly) return rows.map(done).map(r => ({ ...r, requested: null, note: 'host-chosen period' }));
  const byReq = new Map(rows.map(r => [r.requested, r]));
  const out = (plan || []).map(p => {
    if (p.status === 'skipped') return { key: String(p.requested), status: 'skipped', requested: p.requested, note: p.reason };
    const r = byReq.get(p.requested);
    if (r) return done(r);
    return { key: String(p.requested), status: busy ? 'waiting' : 'notrun', requested: p.requested, note: busy ? 'Waiting' : sweep?.stopReason === 'consecutiveFails' ? 'Not run (stopped after two failures in a row)' : 'Not run' };
  });
  return out;
}

/** Recommendation cards for every supported DJ program. */
export function adviceFor(sweep, sampleRate, typedFrames) {
  const outcome = sweep?.classification?.outcome ?? 'ignored';
  return SOFTWARE_IDS.map(id => recommendBuffer(sweep?.rows || [], sampleRate, id, {
    outcome: sweep ? outcome : 'ignored', typedPanelFrames: typedFrames, loadPct: sweep?.loadPct ?? DEFAULT_LOAD_PCT,
  }));
}

/** Seconds a sweep is expected to take. */
export function estimateSeconds(plan, loadPct, seconds) {
  return (plan || []).filter(p => p.status === 'planned').length * seconds * (loadPct > 0 ? 2 : 1);
}

export function exportPayload(st) {
  return {
    app: 'DeckChek', kind: 'latency-buffer', hintsVersion: HINTS_VERSION, scope: SCOPE_LABEL, exportedAt: new Date().toISOString(),
    note: 'Measured values are WASAPI (Windows audio), not ASIO. ASIO buffers are typed by the user and not measured.',
    device: { input: st.inputName || null, output: st.outName || null, sampleRate: st.rate },
    roundTrip: st.measure?.analysis ? {
      latencyMs: st.measure.analysis.latencyMs, stdMs: st.measure.analysis.stdMs, expandedUncertaintyMs: st.measure.analysis.uncertaintyMs, k: 2,
      acceptedRuns: st.measure.analysis.acceptedRuns, reportedMs: st.measure.comparison?.reportedMs ?? null, overheadMs: st.measure.comparison?.overheadMs ?? null,
    } : null,
    bufferTest: st.sweep ? {
      branch: st.sweep.classification?.outcome, loadPct: st.sweep.loadPct, rows: st.sweep.rows.map(r => ({ requested: r.requested, effectiveFrames: r.effectiveFrames, verdicts: r.verdicts, xruns: r.xruns, maxGapMs: r.maxGapMs, eligible: r.eligible, label: r.label })),
    } : null,
    typedAsioBufferFrames: num(st.typedFrames) ? { frames: st.typedFrames, label: TYPED_LABEL } : null,
    recommendations: st.sweep || num(st.typedFrames) ? adviceFor(st.sweep, st.rate, st.typedFrames).map(a => ({ software: a.software, frames: a.frames, ms: a.ms, basis: a.basis, text: a.settingText })) : [],
    windowsChecklist: st.scan?.supported ? windowsChecklist(st.scan).map(i => ({ id: i.id, status: i.status, detail: i.detail })) : null,
  };
}

// ------------------------------------------------------------------ screen

export function createLatencyScreen(section) {
  const native = isNative();
  const tuner = createLatencyTuner({ invoke: native ? undefined : null });
  const st = {
    tab: 'measure', inputs: [], outputs: [], inputName: '', outName: '', rate: 48000, level: DEFAULT_LEVEL_DBFS, ack: false,
    busy: null, aborted: false, status: { text: '', kind: 'info' }, progress: null,
    measure: null, measureError: null, bufferInfo: null, loadPct: DEFAULT_LOAD_PCT, seconds: STEP_SECONDS, sweep: null, sweepError: null, liveSteps: [],
    typedFrames: null, guideOpen: true, scan: null, scanError: null, saved: [], devicesLoaded: false,
  };

  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('plug', { size: 24 })}</span><div><h1 tabindex="-1">Latency &amp; buffer</h1>
      <p class="lede">Find out how long audio takes to go through your interface, which buffer size is safe for your DJ software, and what to change in Windows if it crackles.</p></div></div></header>
    <section class="banner banner-device lat-scope" id="lat-scope" aria-labelledby="lat-scope-title">
      <span class="banner-device-icon">${icon('info', { size: 22 })}</span>
      <div class="banner-text"><strong id="lat-scope-title">These measurements are WASAPI (Windows audio), not ASIO.</strong>
        <span>Serato, Traktor and rekordbox normally use your interface’s ASIO driver. DeckChek measures Windows audio, so treat every figure as a close guide and a stability test, not as the number your DJ software will show. Always confirm a buffer in your DJ software for 10 minutes.</span>
        <details class="lat-why"><summary>Why not ASIO?</summary>
          <p>ASIO skips the Windows mixer and often runs smaller buffers, so the real latency in your DJ software is usually lower than the round trip here. DeckChek cannot open ASIO drivers (Steinberg’s licence does not allow redistributing its SDK). Where an ASIO figure appears, you typed it in, and it is labelled “${esc(TYPED_LABEL)}”.</p></details></div>
    </section>
    <p class="banner banner-fail lat-unsupported" id="lat-unsupported" ${native ? 'hidden' : ''}>${icon('info', { size: 18 })}<span class="banner-text"><strong>Needs the desktop app.</strong><span>Audio streams run in the DeckChek Windows app. You can read the setup guidance here, but nothing can be measured in the browser preview.</span></span></p>
    <div class="tabs" role="tablist" aria-label="Latency and buffer steps" id="lat-tabs"></div>
    <p class="lat-status" id="lat-status" role="status" aria-live="polite"></p>
    <div id="lat-progress-slot"></div>
    <div id="lat-panel" role="tabpanel" tabindex="-1" class="lat-panel"></div>`;
  const q = s => section.querySelector(s);
  q('.screen-head').append(pdfButton(h, { id: 'lat-export-pdf', kind: 'latency', icon: icon('download', { size: 18 }), getData: () => latencyPrintData(exportPayload(st)) }));
  const panel = q('#lat-panel');

  // ---------- helpers ----------
  const setStatus = (text, kind = 'info', { say = false } = {}) => {
    st.status = { text, kind };
    const el = q('#lat-status');
    el.textContent = text; el.dataset.kind = kind;
    if (say && text) announce(text);
  };
  const setBusy = on => {
    st.busy = on || null;
    section.toggleAttribute('data-busy', Boolean(on));
    if (!on) { st.progress = null; paintProgress(); }
  };
  function paintProgress() {
    const slot = q('#lat-progress-slot');
    if (!st.busy || !st.progress) { slot.replaceChildren(); return; }
    const p = st.progress;
    slot.replaceChildren(h('div', { class: 'lat-progress' },
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': p.label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(p.pct)) }, h('span', { style: `width:${Math.max(2, p.pct).toFixed(0)}%` })),
      h('span', { class: 'muted small', text: p.detail || p.label })));
  }
  function setProgress(label, pct, detail) { st.progress = { label, pct, detail }; paintProgress(); }

  // ---------- data ----------
  async function loadDevices() {
    if (!native || st.devicesLoaded) return;
    st.devicesLoaded = true;
    try { st.inputs = (await listInputDevices()).devices; } catch { st.inputs = []; }
    try { st.outputs = (await window.__TAURI__.core.invoke('list_native_audio_outputs')) || []; } catch { st.outputs = []; }
    if (!st.inputName) st.inputName = (st.inputs.find(d => d.isDefault) || st.inputs[0] || {}).id || '';
    if (!st.outName) st.outName = matchOutput(st.inputName, st.outputs);
    renderPanel();
  }
  async function loadBufferInfo() {
    if (!native) return;
    try { st.bufferInfo = await tuner.bufferInfo({ deviceName: st.inputName || null, outDevice: st.outName || null }); } catch { st.bufferInfo = null; }
    if (st.tab === 'buffer' && !st.busy) renderPanel();
  }
  async function loadSaved() {
    if (!native || !st.inputName) return;
    try { st.saved = await tuner.latestRecommendations(st.inputName); } catch { st.saved = []; }
  }

  // ---------- tabs ----------
  function renderTabs() {
    q('#lat-tabs').replaceChildren(...TABS.map(([id, label]) => {
      const sel = st.tab === id;
      const t = h('button', { type: 'button', role: 'tab', id: `lat-tab-${id}`, class: 'tab', 'aria-selected': String(sel), 'aria-controls': 'lat-panel', tabindex: sel ? '0' : '-1', text: label.replace('  ', ' ') });
      t.addEventListener('click', () => selectTab(id));
      return t;
    }));
    panel.setAttribute('aria-labelledby', `lat-tab-${st.tab}`);
  }
  q('#lat-tabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = TABS.findIndex(([id]) => id === st.tab);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowLeft' ? TABS.length - 1 : 1)) % TABS.length;
    selectTab(TABS[n][0]); q('#lat-tabs [aria-selected="true"]')?.focus();
  });
  function selectTab(id) {
    if (st.busy && id !== st.tab) { toast('A run is in progress. Press Esc to stop it first.', { type: 'warn' }); return; }
    st.tab = id; renderTabs();
    if (!st.busy) setStatus('');
    if (id === 'buffer') loadBufferInfo();
    if (id === 'advice') loadSaved().then(() => { if (st.tab === 'advice') renderPanel(); });
    renderPanel();
  }

  function renderPanel() {
    ({ measure: renderMeasure, buffer: renderBuffer, advice: renderAdvice, windows: renderWindows })[st.tab]();
  }

  // ---------- shared fragments ----------
  const disabledAttr = () => (native && !st.busy ? '' : 'disabled');
  const optionList = (items, value, label) => items.map(d => `<option value="${esc(d.name ?? d.id)}"${(d.name ?? d.id) === value ? ' selected' : ''}>${esc(label(d))}</option>`).join('');
  const branchCard = (c, { compact = false } = {}) => {
    const b = BRANCHES[c?.outcome] || BRANCHES.unknown;
    const extra = [];
    if (c?.outcome === 'partial') {
      if (c.floorFrames) extra.push(`Smallest buffer Windows will run: ${c.floorFrames} frames (${fmtMs(framesToMs(c.floorFrames, st.rate))}).`);
      if (c.granularityFrames) extra.push(`It rounds to steps of ${c.granularityFrames} frames.`);
    }
    if (c?.outcome === 'ignored' && c.hostPeriodFrames) extra.push(`Its own period: ${c.hostPeriodFrames} frames (${fmtMs(framesToMs(c.hostPeriodFrames, st.rate))}).`);
    if (c?.inOutDiffer) extra.push('Input and output run different periods; the larger one counts.');
    return `<div class="lat-branch lat-branch-${b.status}" id="lat-branch" role="group" aria-label="Detected buffer behaviour">
      <div class="lat-branch-head"><span class="lat-branch-letter" aria-hidden="true">${b.letter}</span><div><span class="lat-kicker">Detected on this computer</span><strong>${esc(b.title)}</strong></div>${chip(b.status, b.status === 'pass' ? 'Full sweep' : b.status === 'review' ? 'Partial sweep' : b.status === 'warn' ? 'No sweep' : b.status === 'fail' ? 'Cannot test' : 'Pending')}</div>
      ${compact ? '' : `<p>${esc(b.text)}</p>`}${extra.length ? `<p class="muted small">${esc(extra.join(' '))}</p>` : ''}</div>`;
  };

  // ---------- tab 1: measure ----------
  function loopbackGuide() {
    return `<details class="card lat-guide" id="lat-guide" ${st.guideOpen ? 'open' : ''}>
      <summary><h2 class="card-title" id="lat-guide-title">Connect a patch cable</h2><span class="muted small lat-guide-hint">${st.guideOpen ? 'Hide' : 'Show the setup steps'}</span></summary>
      <p class="muted">The round trip needs the sound to leave the interface and come straight back in. One short cable does that.</p>
      <ol class="wiring wiring-loop" aria-label="Signal path">
        <li><span class="wiring-node"><strong>Interface OUTPUT</strong><span>line out, left and right</span></span><span class="wiring-arrow">${icon('arrowRight', { size: 16 })}</span></li>
        <li><span class="wiring-node"><strong>Patch cable</strong><span>RCA to RCA, or 6.35 mm to 6.35 mm</span></span><span class="wiring-arrow">${icon('arrowRight', { size: 16 })}</span></li>
        <li><span class="wiring-node"><strong>Interface INPUT</strong><span>line in, same interface</span></span></li>
      </ol>
      <ol class="lat-steps">
        <li><strong>Pick a spare pair.</strong> Use one output pair and one input pair that you are not using for anything else (on a Traktor Audio 8 DJ: for example Out A to In B).</li>
        <li><strong>Cable out to in.</strong> Left to left, right to right. Both ends fully pushed in.</li>
        <li><strong>Set the input to LINE.</strong> Never use a PHONO input: it adds heavy gain and would distort the chirp. If the interface has a LINE/PHONO or LINE/MIC switch, set LINE.</li>
        <li><strong>Going through a mixer?</strong> Cable from the interface output to a mixer line channel, then the mixer’s record or master output to the interface input. Set that channel to LINE, fader up, EQs flat.</li>
        <li><strong>Turn monitors and headphones down.</strong> The test plays a loud chirp (default ${DEFAULT_LEVEL_DBFS} dBFS, never above ${MAX_LEVEL_DBFS} dBFS).</li>
        <li><strong>No cable?</strong> You can still run the <button type="button" class="link" data-go="buffer">Buffer test</button>; it does not need one.</li>
      </ol></details>`;
  }

  function measureResultHtml() {
    const m = st.measure;
    if (st.measureError) return `<section class="card lat-result lat-result-error" role="alert"><h2 class="card-title">${icon('fail', { size: 18 })} Could not measure</h2><p>${esc(st.measureError)}</p></section>`;
    if (!m) return `<section class="card card-quiet lat-result lat-empty"><p class="muted">No measurement yet. Connect the cable, tick the volume box and press <strong>Measure latency</strong>.</p></section>`;
    const d = describeMeasure(m);
    if (d.kind !== 'ok') {
      const tone = d.kind === 'aborted' ? 'info' : d.kind === 'weak' ? 'warn' : 'fail';
      return `<section class="card lat-result lat-result-${tone}" role="status"><h2 class="card-title">${icon(tone === 'info' ? 'info' : tone === 'warn' ? 'warn' : 'fail', { size: 18 })} ${esc(d.title)}</h2>
        <p>${esc(d.body)}</p>${d.fixes.length ? `<ul class="lat-fixes">${d.fixes.map(f => `<li>${icon('check', { size: 16 })}<span>${esc(f)}</span></li>`).join('')}</ul>` : ''}
        ${d.kind === 'none' ? `<div class="form-actions lat-actions"><button type="button" class="btn btn-secondary" data-go="buffer">Skip the cable: stress test only</button></div>` : ''}
        ${d.kind === 'weak' ? lat_runs(m.analysis) : ''}</section>`;
    }
    const a = m.analysis, c = m.comparison;
    const hostPeriods = m.result.reportedBufferFrames || {};
    return `<section class="card lat-result lat-result-ok" role="status" aria-live="polite">
      <div class="card-head"><h2 class="card-title">Round-trip latency</h2><span class="badge badge-uncal" title="Measured through Windows audio, not through your DJ software's ASIO driver">${esc(SCOPE_LABEL)}</span></div>
      <div class="lat-hero"><span class="lat-big num" id="lat-big">${esc(fmtMs(a.latencyMs))}</span><span class="lat-pm num">± ${esc(fmtMs(a.uncertaintyMs))} <span class="muted small">(k=2)</span></span></div>
      <p class="muted">Mean of ${a.acceptedRuns} of ${a.runs.length} chirps · standard deviation ${esc(fmtMs(a.stdMs))} · about ${fmtNum(a.latencySamples)} samples at ${fmtNum(m.result.captured.sampleRate / 1000, 1)} kHz.</p>
      ${c?.advisory ? `<p class="hint hint-warn">${icon('warn', { size: 16 })}<span>${esc(c.advisory)} This is advice, not a limit: your DJ software’s ASIO path is usually lower.</span></p>` : `<p class="hint">${icon('info', { size: 16 })}<span>Scratch DJs usually like under about ${ADVISORY_ROUND_TRIP_MS} ms round trip (advice, not a hard limit).</span></p>`}
      <h3 class="lat-h3">Reported by Windows vs measured</h3>
      <div class="table-wrap"><table class="data lat-table"><caption class="sr-only">Reported buffers against measured round trip</caption><thead><tr><th scope="col">Item</th><th scope="col" class="r">Value</th></tr></thead><tbody>
        <tr><th scope="row">Buffers Windows ran (in ${fmtNum(hostPeriodsIn(hostPeriods))} + out ${fmtNum(hostPeriods.out)} frames)</th><td class="r num">${esc(fmtMs(c?.reportedMs))}</td></tr>
        <tr><th scope="row">Measured round trip</th><td class="r num">${esc(fmtMs(c?.measuredMs))}</td></tr>
        <tr><th scope="row">Difference (driver / USB overhead)</th><td class="r num">${esc(fmtMs(c?.overheadMs))} ${c?.flag ? chip(c.flag === 'high' ? 'warn' : 'review', c.flag === 'high' ? 'High' : 'Odd') : c?.overheadMs != null ? chip('pass', 'Normal') : ''}</td></tr>
      </tbody></table></div>
      ${c?.note ? `<p class="hint hint-warn">${icon('warn', { size: 16 })}<span>${esc(c.note)}</span></p>` : ''}
      <p class="muted small">On Windows audio the “reported” figure is the buffer periods Windows actually ran. Your ASIO panel value is separate: type it on the <button type="button" class="link" data-go="advice">Recommendation</button> tab.</p>
      <details class="lat-runs"><summary>Show all ${a.runs.length} chirps</summary>${lat_runs(a)}</details></section>`;
  }
  function hostPeriodsIn(p) { return p.in; }
  function lat_runs(a) {
    return `<div class="table-wrap"><table class="data lat-table"><caption class="sr-only">Each chirp</caption><thead><tr><th scope="col">Chirp</th><th scope="col" class="r">Delay</th><th scope="col" class="r">Match strength</th><th scope="col">Used?</th></tr></thead><tbody>
      ${a.runs.map(r => `<tr><th scope="row">${r.index + 1}</th><td class="r num">${esc(fmtMs(r.latencyMs))}</td><td class="r num">${fmtNum(r.strength, 2)}</td><td>${r.accepted ? chip('pass', 'Used') : chip('review', `Skipped (below ${MIN_STRENGTH})`)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderMeasure() {
    const mismatch = st.inputName && st.outName && st.outputs.length && matchOutput(st.inputName, st.outputs) !== st.outName;
    panel.innerHTML = `<div class="lat-measure">
      ${loopbackGuide()}
      <section class="card lat-setup" aria-labelledby="lat-setup-title"><h2 class="card-title" id="lat-setup-title">Choose the interface</h2>
        <div class="field-grid">
          <label class="field"><span class="field-label">Input device</span><select id="lat-in" ${disabledAttr()}>${st.inputs.length ? optionList(st.inputs, st.inputName, d => d.name + (d.isDefault ? ' (default)' : '')) : '<option value="">System default</option>'}</select></label>
          <label class="field"><span class="field-label">Output device</span><select id="lat-out" ${disabledAttr()}>${st.outputs.length ? optionList(st.outputs, st.outName, d => d.name + (d.isDefault ? ' (default)' : '')) : '<option value="">System default</option>'}</select></label>
          <label class="field"><span class="field-label">Sample rate</span><select id="lat-rate" ${disabledAttr()}>${SAMPLE_RATES.map(r => `<option value="${r}"${r === st.rate ? ' selected' : ''}>${r / 1000} kHz</option>`).join('')}</select></label>
          <label class="field"><span class="field-label">Test level <output id="lat-level-out" class="num">${st.level} dBFS</output></span><input type="range" id="lat-level" min="${LEVEL_MIN_UI}" max="${MAX_LEVEL_DBFS}" step="1" value="${st.level}" ${disabledAttr()} aria-describedby="lat-level-help"><span class="field-help" id="lat-level-help">Default ${DEFAULT_LEVEL_DBFS} dBFS. DeckChek never plays above ${MAX_LEVEL_DBFS} dBFS.</span></label>
        </div>
        ${mismatch ? `<p class="hint hint-warn">${icon('warn', { size: 16 })}<span>Input and output look like different devices. The cable only closes the loop on one interface, and two devices run on separate clocks.</span></p>` : ''}
        <label class="lat-ack"><input type="checkbox" id="lat-ack" ${st.ack ? 'checked' : ''} ${disabledAttr()}> <span>I turned the monitors and headphones down. The test plays loud chirps.</span></label>
        <div class="form-actions lat-actions">
          <button type="button" class="btn btn-primary btn-lg" id="lat-measure" ${native && st.ack && !st.busy ? '' : 'disabled'}>${icon('play', { size: 18 })} Measure latency <kbd>Enter</kbd></button>
          <button type="button" class="btn btn-secondary" id="lat-stop" ${st.busy ? '' : 'disabled'}>${icon('stop', { size: 18 })} Stop <kbd>Esc</kbd></button>
        </div>
        <p class="muted small">${REPEATS} chirps, one second apart. Takes about ${Math.round(REPEATS + 2)} seconds.</p>
      </section>
      <div id="lat-measure-result">${measureResultHtml()}</div></div>`;
    bindCommon();
    q('#lat-guide').addEventListener('toggle', e => { st.guideOpen = e.target.open; q('.lat-guide-hint').textContent = st.guideOpen ? 'Hide' : 'Show the setup steps'; });
    const inSel = q('#lat-in'), outSel = q('#lat-out');
    inSel.addEventListener('change', () => { st.inputName = inSel.value; st.outName = matchOutput(st.inputName, st.outputs) || st.outName; st.bufferInfo = null; renderPanel(); });
    outSel.addEventListener('change', () => { st.outName = outSel.value; st.bufferInfo = null; renderPanel(); });
    q('#lat-rate').addEventListener('change', e => { st.rate = Number(e.target.value); });
    q('#lat-level').addEventListener('input', e => { st.level = Number(e.target.value); q('#lat-level-out').textContent = `${st.level} dBFS`; });
    q('#lat-ack').addEventListener('change', e => { st.ack = e.target.checked; q('#lat-measure').disabled = !(native && st.ack && !st.busy); });
    q('#lat-measure').addEventListener('click', startMeasure);
    q('#lat-stop').addEventListener('click', abortRun);
  }

  function bindCommon() {
    panel.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => selectTab(b.dataset.go)));
  }

  // ---------- running (shared) ----------
  /** Run `fn`; on CAPTURE_BUSY offer "Stop <holder> and continue" and retry once. */
  async function withCapture(fn, action) {
    for (let attempt = 0; ; attempt++) {
      try { return await fn(); } catch (e) {
        if (!(isCaptureBusy(e) || e?.code === 'CAPTURE_BUSY') || attempt > 0) throw e;
        const go = await confirmCaptureBusy(e.detail || e, { action }).catch(() => false);
        if (!go) { const c = new Error('Cancelled.'); c.cancelled = true; throw c; }
        await preemptCapture();
      }
    }
  }
  async function abortRun() {
    if (!st.busy) return false;
    st.aborted = true;
    setStatus('Stopping…', 'info', { say: true });
    try { await tuner.abort(); } catch { /* the run ends on its own */ }
    return true;
  }

  async function startMeasure() {
    if (st.busy || !native || !st.ack) return;
    st.aborted = false; st.measureError = null; st.measure = null; setBusy('measure');
    setProgress('Measuring round trip', 8, 'Playing chirps and listening on the input…');
    setStatus('Measuring: playing chirps through the cable…', 'info', { say: true });
    renderPanel();
    try {
      const res = await withCapture(() => tuner.measure({ deviceName: st.inputName || null, outDevice: st.outName || null, sampleRate: st.rate, levelDbfs: st.level, typedPanelFrames: st.typedFrames }), 'measure latency');
      st.measure = res;
      const d = describeMeasure(res);
      if (d.kind === 'ok') {
        st.guideOpen = false;
        setStatus(`Round trip ${fmtMs(res.analysis.latencyMs)} (${SCOPE_LABEL}).`, 'pass', { say: true });
        tuner.saveRun(roundTripRunInput({ deviceName: res.result.input?.deviceName || st.inputName || 'System default', hostApi: res.result.hostApi, sampleRate: res.result.captured.sampleRate, analysis: res.analysis, comparison: res.comparison, typedPanelFrames: st.typedFrames })).catch(() => toast('The result could not be saved to history.', { type: 'warn' }));
      } else setStatus(d.title + '.', d.kind === 'aborted' ? 'info' : 'warn', { say: true });
    } catch (e) {
      if (e?.cancelled) setStatus('Cancelled.', 'info');
      else { st.measureError = friendly(e); setStatus('Measurement failed.', 'fail', { say: true }); }
    } finally {
      setBusy(null);
      if (st.tab === 'measure') { renderPanel(); q('#lat-measure-result')?.scrollIntoView({ block: 'nearest' }); }
    }
  }

  // ---------- tab 2: buffer test ----------
  function renderBuffer() {
    const plan = planStressSweep(st.bufferInfo, { sizes: STRESS_SIZES });
    const est = estimateSeconds(plan, st.loadPct, st.seconds);
    const range = r => (r?.known ? `${r.minFrames}–${r.maxFrames} frames` : 'not reported');
    const model = sweepTable(plan, st.sweep ? { ...st.sweep, rows: st.sweep.rows } : liveSweep(), { busy: Boolean(st.busy), loadPct: st.sweep?.loadPct ?? st.loadPct, sampleRate: st.rate });
    const cls = (st.sweep || liveSweep())?.classification;
    panel.innerHTML = `<div class="lat-buffer">
      <section class="card" aria-labelledby="lat-buf-title"><h2 class="card-title" id="lat-buf-title">Find the smallest safe buffer</h2>
        <p>DeckChek opens your interface for input and output at each buffer size, largest to smallest, first idle and then with your CPU busy, and counts glitches (xruns) and the longest gap between audio callbacks. No cable is needed.</p>
        <div class="field-grid">
          <label class="field"><span class="field-label">CPU load while testing</span><select id="lat-load" ${disabledAttr()}>${LOAD_LEVELS.map(l => `<option value="${l}"${l === st.loadPct ? ' selected' : ''}>${l === 0 ? 'None (idle only)' : l === DEFAULT_LOAD_PCT ? '50 % (simulates DJ software)' : `${l} % (heavy)`}</option>`).join('')}</select><span class="field-help">The load is a stand-in for your DJ software. Verify the final buffer there.</span></label>
          <label class="field"><span class="field-label">Time per step</span><select id="lat-secs" ${disabledAttr()}><option value="${STEP_SECONDS}"${st.seconds === STEP_SECONDS ? ' selected' : ''}>${STEP_SECONDS} s (recommended)</option><option value="${QUICK_SECONDS}"${st.seconds === QUICK_SECONDS ? ' selected' : ''}>${QUICK_SECONDS} s (quick, less reliable)</option></select><span class="field-help">Windows reports: input ${esc(range(st.bufferInfo?.input))}, output ${esc(range(st.bufferInfo?.output))}.</span></label>
        </div>
        <p class="muted" id="lat-estimate">This test takes about ${Math.max(1, Math.round(est / 60))} minute${Math.round(est / 60) === 1 ? '' : 's'} (${plan.filter(p => p.status === 'planned').length} sizes). It stops early after two failures in a row.</p>
        <div class="form-actions lat-actions">
          <button type="button" class="btn btn-primary btn-lg" id="lat-sweep" ${native && !st.busy ? '' : 'disabled'}>${icon('play', { size: 18 })} Start buffer test <kbd>Enter</kbd></button>
          <button type="button" class="btn btn-secondary" id="lat-stop" ${st.busy ? '' : 'disabled'}>${icon('stop', { size: 18 })} Stop <kbd>Esc</kbd></button>
        </div>
        ${st.sweepError ? `<p class="form-error" role="alert">${esc(st.sweepError)}</p>` : ''}</section>
      ${cls && (st.sweep || st.liveSteps.length > 1) ? branchCard(cls) : ''}
      <section class="card" aria-labelledby="lat-tbl-title"><h2 class="card-title" id="lat-tbl-title">Results by buffer size</h2>
        <div class="table-wrap" id="lat-sweep-table">${sweepTableHtml(model)}</div></section>
      ${st.sweep ? `<div class="form-actions lat-actions"><button type="button" class="btn btn-secondary" data-go="advice">See the recommendation ${icon('arrowRight', { size: 16 })}</button></div>` : ''}</div>`;
    bindCommon();
    q('#lat-load').addEventListener('change', e => { st.loadPct = Number(e.target.value); renderPanel(); });
    q('#lat-secs').addEventListener('change', e => { st.seconds = Number(e.target.value); renderPanel(); });
    q('#lat-sweep').addEventListener('click', startSweep);
    q('#lat-stop').addEventListener('click', abortRun);
  }

  function liveSweep() {
    if (!st.liveSteps.length) return null;
    const classification = classifyBufferBehaviour(st.liveSteps.map(s => s.idle));
    return { rows: stressRows(st.liveSteps, classification), classification, loadPct: st.loadPct };
  }

  function sweepTableHtml(model) {
    const loadHead = (st.sweep?.loadPct ?? st.loadPct) > 0 ? `${st.sweep?.loadPct ?? st.loadPct} % load` : 'Load';
    const v = x => (x === 'pass' ? chip('pass', 'Pass') : x === 'fail' ? chip('fail', 'Fail') : '<span class="muted">—</span>');
    return `<table class="data lat-table lat-sweep"><caption class="sr-only">Buffer test results, largest buffer first</caption><thead><tr>
      <th scope="col">Asked for</th><th scope="col">Windows ran</th><th scope="col">Idle</th><th scope="col">${esc(loadHead)}</th><th scope="col" class="r">Glitches</th><th scope="col" class="r">Longest gap</th><th scope="col">Note</th></tr></thead><tbody>
      ${model.map(r => r.status === 'done' ? `<tr class="${r.eligible ? '' : 'lat-dim'}"><th scope="row">${r.requested === null ? 'Host default' : `${r.requested} frames`}</th><td class="num">${esc(r.ranAt)}</td><td>${v(r.idle)}</td><td>${v(r.load)}</td><td class="r num">${fmtNum(r.xruns)}</td><td class="r num">${esc(fmtMs(r.maxGapMs))}</td><td>${r.hostChosen ? `<span class="lat-note-warn">${icon('warn', { size: 14 })} host-chosen period</span> <span class="muted small">(not compared)</span>` : r.note && r.note !== `${r.requested} frames` ? esc(r.note) : ''}</td></tr>`
    : `<tr class="lat-dim"><th scope="row">${r.requested} frames</th><td colspan="5" class="muted">${r.status === 'waiting' ? '<span class="spinner lat-spin" aria-hidden="true"></span> ' : ''}${esc(r.note)}</td><td></td></tr>`).join('')}
      ${model.length ? '' : '<tr><td colspan="7" class="muted">Press Start buffer test to fill this table.</td></tr>'}</tbody></table>`;
  }

  async function startSweep() {
    if (st.busy || !native) return;
    st.aborted = false; st.sweep = null; st.sweepError = null; st.liveSteps = []; setBusy('stress');
    const plan = planStressSweep(st.bufferInfo, { sizes: STRESS_SIZES });
    const total = Math.max(1, plan.filter(p => p.status === 'planned').length);
    setProgress('Buffer test', 2, 'Starting…');
    setStatus('Buffer test running. Press Esc to stop.', 'info', { say: true });
    renderPanel();
    try {
      const sweep = await withCapture(() => runStressSweep({
        tuner, deviceName: st.inputName || null, outDevice: st.outName || null, bufferInfo: st.bufferInfo, loadPct: st.loadPct, seconds: st.seconds,
        isAborted: () => st.aborted,
        onStep: (step, steps) => {
          st.liveSteps = steps.slice();
          setProgress('Buffer test', Math.min(98, (steps.length / total) * 100), `${steps.length} of ${total} sizes done`);
          const live = liveSweep();
          const el = q('#lat-sweep-table');
          if (el && live) el.innerHTML = sweepTableHtml(sweepTable(plan, live, { busy: true, loadPct: st.loadPct, sampleRate: st.rate }));
        },
      }), 'run the buffer test');
      st.sweep = sweep;
      const out = sweep.classification.outcome;
      setStatus(sweep.aborted ? 'Buffer test stopped. Partial results are shown.' : `Buffer test done. Windows behaviour: ${BRANCHES[out]?.title || out}.`, sweep.aborted ? 'warn' : 'pass', { say: true });
      persistSweep(sweep);
    } catch (e) {
      if (e?.cancelled) setStatus('Cancelled.', 'info');
      else { st.sweepError = friendly(e); setStatus('Buffer test failed.', 'fail', { say: true }); }
    } finally { setBusy(null); if (st.tab === 'buffer') renderPanel(); }
  }

  function persistSweep(sweep) {
    const deviceName = sweep.steps[0]?.idle?.input?.deviceName || st.inputName || 'System default';
    const hostApi = sweep.steps[0]?.idle?.hostApi || null;
    const jobs = [];
    for (const s of sweep.steps) {
      for (const [r, pct] of [[s.idle, 0], [s.load, sweep.loadPct]]) {
        if (!r) continue;
        jobs.push(tuner.saveRun(stressRunInput({ deviceName, hostApi, sampleRate: st.rate, result: r, loadPct: pct, verdict: s.verdicts[pct] ?? 'fail', classification: sweep.classification })));
      }
    }
    for (const a of adviceFor(sweep, st.rate, null)) {
      if (a.claimsSmallestSafe) jobs.push(tuner.saveRecommendation({ deviceName, software: a.software, frames: a.frames, ms: a.ms, basedOnRunId: null }));
    }
    Promise.all(jobs).catch(() => toast('Some results could not be saved to history.', { type: 'warn' }));
  }

  // ---------- tab 3: recommendation ----------
  function adviceCard(a) {
    const hint = SOFTWARE_BUFFER_HINTS[a.software];
    const verified = hint.confidence === 'snippet';
    const headline = a.frames ? `${a.frames} samples · about ${fmtMs(a.ms)}` : a.needsTypedBuffer ? 'Type your ASIO buffer to continue' : 'No tested buffer passed';
    const basis = a.basis === 'measured' ? `Measured on ${SCOPE_LABEL}` : a.basis === 'typed' ? TYPED_LABEL : 'Not available';
    return `<article class="card lat-advice" aria-labelledby="lat-adv-${a.software}">
      <div class="card-head"><h3 class="card-title" id="lat-adv-${a.software}">${esc(hint.name)}</h3>${verified ? chip('pass', 'Setting name checked') : chip('review', 'Setting name not verified')}</div>
      <dl class="lat-kv"><div><dt>Setting</dt><dd><strong>${esc(hint.setting)}</strong></dd></div><div><dt>Where</dt><dd>${esc(hint.path)}</dd></div></dl>
      <p class="lat-rec num"><strong>${esc(headline)}</strong>${a.verySafe ? ` ${chip('pass', 'Very safe at 80 % load')}` : ''}</p>
      <p class="muted small">${esc(basis)}${a.claimsSmallestSafe ? ` · smallest passing size ${a.smallestPassingFrames}, one step of headroom added` : ''}</p>
      <p>${esc(a.settingText)}</p>
      <p class="muted small">${hint.start && !a.settingText.includes(hint.start) ? esc(hint.start) + ' ' : ''}Source: ${externalLink(hint.source)}</p></article>`;
  }
  function externalLink(url) { return `<a href="${esc(url)}" class="external-link" rel="noopener noreferrer" data-external>${esc(url.replace(/^https?:\/\//, '').slice(0, 56))}…<span class="sr-only"> (opens in your browser)</span></a>`; }

  function renderAdvice() {
    const cards = adviceFor(st.sweep, st.rate, st.typedFrames);
    const cls = st.sweep?.classification;
    panel.innerHTML = `<div class="lat-advice-wrap">
      ${cls ? branchCard(cls, { compact: true }) : `<p class="hint">${icon('info', { size: 16 })}<span>No buffer test yet. Run it on the <button type="button" class="link" data-go="buffer">Buffer test</button> tab, or type the ASIO buffer you use below to get setting-by-setting advice.</span></p>`}
      <section class="card" aria-labelledby="lat-typed-title"><h2 class="card-title" id="lat-typed-title">Your ASIO buffer (optional)</h2>
        <p class="muted">If you know the buffer your DJ software uses, type it here in samples. It is shown as “${esc(TYPED_LABEL)}” and never mixed into the measured numbers.</p>
        <label class="field lat-typed"><span class="field-label">Buffer in samples</span><input type="number" id="lat-typed" min="16" max="8192" step="1" inputmode="numeric" placeholder="e.g. 256" value="${st.typedFrames ?? ''}" ${native ? '' : 'disabled'}><span class="field-help" id="lat-typed-err" role="alert"></span></label></section>
      <div class="lat-advice-grid">${cards.map(adviceCard).join('')}</div>
      <p class="hint hint-warn">${icon('warn', { size: 16 })}<span>DeckChek never changes your DJ software’s settings. Set the value yourself, then play for 10 minutes with your real library and effects before trusting it. The test load is a stand-in for your software.</span></p>
      ${st.saved.length ? `<section class="card card-quiet"><h3 class="card-title">Last saved for this interface</h3><ul class="lat-saved">${st.saved.map(s => `<li><strong>${esc(SOFTWARE_BUFFER_HINTS[s.software]?.name || s.software)}</strong>: ${s.frames} samples (${esc(fmtMs(s.ms))}) <span class="muted small">${esc(String(s.createdAt || '').slice(0, 10))}</span></li>`).join('')}</ul></section>` : ''}</div>`;
    bindCommon();
    const typed = q('#lat-typed');
    typed.addEventListener('change', () => {
      const v = typed.value.trim() === '' ? null : Number(typed.value);
      if (v !== null && !(Number.isInteger(v) && v >= 16 && v <= 8192)) { q('#lat-typed-err').textContent = 'Enter a whole number of samples between 16 and 8192.'; return; }
      st.typedFrames = v; renderPanel(); q('#lat-typed')?.focus();
    });
  }

  // ---------- tab 4: Windows tuning ----------
  function renderWindows() {
    const supported = st.scan ? st.scan.supported : null;
    const items = st.scan?.supported ? windowsChecklist(st.scan).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) : [];
    const count = s => items.filter(i => i.status === s).length;
    panel.innerHTML = `<div class="lat-win">
      <section class="card" aria-labelledby="lat-win-title"><h2 class="card-title" id="lat-win-title">Windows tuning checklist</h2>
        <p>Dropouts are often Windows power settings or a busy driver rather than the buffer. DeckChek reads your settings and flags what to review. <strong>It never changes anything.</strong> Each item shows the command to check it and where to change it.</p>
        <div class="form-actions lat-actions"><button type="button" class="btn btn-primary btn-lg" id="lat-scan" ${native && !st.busy ? '' : 'disabled'}>${icon('refresh', { size: 18 })} ${st.scan ? 'Scan again' : 'Scan this PC'}</button>
          <button type="button" class="btn btn-secondary" id="lat-stop" ${st.busy ? '' : 'disabled'}>${icon('stop', { size: 18 })} Stop <kbd>Esc</kbd></button></div>
        <p class="muted small">The scan takes about 12 seconds: it samples interrupt and DPC time while it reads your power plan and devices.</p>
        ${st.scanError ? `<p class="form-error" role="alert">${esc(st.scanError)}</p>` : ''}</section>
      ${supported === false ? `<p class="banner banner-device banner-device-info" id="lat-win-unsupported">${icon('info', { size: 18 })}<span class="banner-text"><strong>Windows desktop app only.</strong><span>This checklist reads Windows power and driver settings, so it is hidden on other systems. The Measure and Buffer test tabs still work.</span></span></p>`
        : !st.scan ? `<section class="card card-quiet lat-empty"><p class="muted">${native ? 'No scan yet. Press Scan this PC.' : 'The scan needs the DeckChek desktop app on Windows.'}</p></section>`
          : `<section class="card" aria-labelledby="lat-items-title"><div class="card-head"><h2 class="card-title" id="lat-items-title">Results</h2><p class="muted" id="lat-win-summary">${count('pass')} pass · ${count('review')} to review · ${count('unknown')} unknown</p></div>
            <ul class="lat-checks">${items.map(checkItem).join('')}</ul>
            <p class="muted small">DPC warning level is ${DPC_WARN_PCT} % of CPU time. These are proxies: LatencyMon (a free tool from Resplendence) names the driver responsible if you run it for 10 to 30 minutes.</p></section>`}
      ${supported ? busyAppsCard() : ''}</div>`;
    panel.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copyText(b.dataset.copy, b.dataset.what)));
    q('#lat-scan').addEventListener('click', startScan);
    q('#lat-stop').addEventListener('click', abortRun);
  }
  function checkItem(i) {
    const fix = FIX_COMMAND[i.id];
    const status = i.status === 'unknown' ? chip('info', 'Unknown') : chip(i.status, i.status === 'pass' ? 'Pass' : 'Review');
    return `<li class="lat-check lat-check-${i.status}" data-item="${esc(i.id)}"><div class="lat-check-head">${status}<strong>${esc(i.label)}</strong></div>
      <p>${esc(i.detail)}</p>
      <details><summary>How to check and fix</summary>
        <dl class="lat-how">
          <div><dt>Check it yourself</dt><dd><code>${esc(i.inspect)}</code> <button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(i.inspect)}" data-what="Check command" aria-label="Copy the check command for ${esc(i.label)}">${icon('copy', { size: 14 })} Copy</button></dd></div>
          <div><dt>Change it</dt><dd>${esc(i.change)}</dd></div>
          ${fix ? `<div><dt>Shortcut</dt><dd>Press <kbd>Win</kbd>+<kbd>R</kbd>, paste <code>${esc(fix)}</code>, press Enter. <button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(fix)}" data-what="Shortcut" aria-label="Copy the shortcut for ${esc(i.label)}">${icon('copy', { size: 14 })} Copy</button></dd></div>` : ''}
        </dl></details></li>`;
  }
  async function copyText(text, what) {
    try { await navigator.clipboard.writeText(text); toast(`${what || 'Text'} copied.`, { type: 'success', timeout: 2500 }); } catch { toast('Copy failed. Select the text and copy it by hand.', { type: 'warn' }); }
  }
  /** Which programs use the CPU right now, and which DJ programs run (processes.rs top_cpu / dj_processes). Best effort. */
  async function loadBusyApps() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke !== 'function') return null;
    const [cpu, dj] = await Promise.allSettled([invoke('top_cpu', { n: 5 }), invoke('dj_processes')]);
    const top = cpu.status === 'fulfilled' && Array.isArray(cpu.value) ? cpu.value : null;
    const apps = dj.status === 'fulfilled' && dj.value?.supported ? dj.value.apps.filter(a => a.running).map(a => a.app) : [];
    return top || apps.length ? { top: top || [], djApps: apps } : null;
  }
  function busyAppsCard() {
    const b = st.busyApps;
    if (!b) return '';
    return `<section class="card" id="lat-busy" aria-labelledby="lat-busy-title"><h2 class="card-title" id="lat-busy-title">What is using the CPU</h2>
      ${b.djApps.length ? `<p>DJ programs running: <strong>${esc(b.djApps.join(', '))}</strong>.</p>` : '<p class="muted">No DJ program was running during the scan.</p>'}
      ${b.top.length ? `<table class="data"><caption class="sr-only">Programs using the most CPU right now</caption><thead><tr><th scope="col">Program</th><th scope="col" class="r">CPU</th></tr></thead><tbody>${b.top.map(c => `<tr><td>${esc(c.exe)}</td><td class="r num">${fmtNum(c.cpuPct, 1)} %</td></tr>`).join('')}</tbody></table>
      <p class="muted small">A browser, antivirus scan or cloud sync near the top is a common cause of crackles. Close it and test again.</p>` : ''}</section>`;
  }
  async function startScan() {
    if (st.busy || !native) return;
    st.aborted = false; st.scanError = null; setBusy('scan');
    setProgress('Scanning Windows settings', 15, 'Sampling DPC time…');
    setStatus('Scanning Windows settings…', 'info', { say: true });
    renderPanel();
    try {
      st.scan = await tuner.scan({ dpcSeconds: 10 });
      st.busyApps = null;
      if (st.scan.supported) st.busyApps = await loadBusyApps();
      setStatus(st.scan.supported ? 'Scan complete.' : 'The checklist is only available on Windows.', st.scan.supported ? 'pass' : 'info', { say: true });
    } catch (e) { st.scanError = friendly(e); setStatus('Scan failed.', 'fail', { say: true }); } finally { setBusy(null); if (st.tab === 'windows') renderPanel(); }
  }

  // ---------- progress events (Rust latency://progress) ----------
  let unlisten = null;
  try {
    const ev = window.__TAURI__?.event;
    if (native && ev?.listen) {
      ev.listen('latency://progress', e => {
        const p = e?.payload;
        if (!st.busy || !p) return;
        const cur = st.progress || { pct: 5, label: 'Working' };
        const frames = num(p.frames) ? `${p.frames} frames, ` : '';
        st.progress = { ...cur, detail: `${p.phase}: ${frames}${fmtNum(p.elapsedSec, 0)} s` };
        paintProgress();
      }).then(u => { unlisten = u; }).catch(() => {});
    }
  } catch { /* progress text is optional */ }

  // ---------- keyboard ----------
  const onKey = e => {
    if (section.hidden || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.key !== 'Enter') return;
    const t = e.target;
    if (t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'SUMMARY' || t.getAttribute?.('role') === 'tab' || (t.tagName === 'INPUT' && t.type === 'number'))) return;
    if (st.busy) return;
    if (st.tab === 'measure' && st.ack) { e.preventDefault(); startMeasure(); }
    else if (st.tab === 'buffer') { e.preventDefault(); startSweep(); }
    else if (st.tab === 'windows') { e.preventDefault(); startScan(); }
  };
  document.addEventListener('keydown', onKey);

  renderTabs();
  renderPanel();
  loadDevices();

  return {
    onShow() { loadDevices(); },
    onHide() { /* keep results; a run keeps going */ },
    onEscape() { if (!st.busy) return false; abortRun(); return true; },
    onExport() {
      if (!st.measure && !st.sweep && !st.scan) { toast('Nothing to export yet. Run a measurement first.'); return; }
      download(`deckchek-latency-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportPayload(st), null, 2), 'application/json');
      toast('Exported the latency results.', { type: 'success', timeout: 3000 });
    },
    dispose() { document.removeEventListener('keydown', onKey); if (typeof unlisten === 'function') unlisten(); },
  };
}

/** Rail entry for the app shell; shown only while features.latencyTuner is on. */
export function latencyScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-latency')) main.append(h('section', { class: 'screen', id: 'screen-latency', hidden: true }));
  return [{ id: 'latency', title: 'Latency & buffer', short: 'Latency', icon: 'plug', feature: 'latencyTuner', create: createLatencyScreen }];
}
