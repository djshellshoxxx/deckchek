// Scratch stress test screen (FS-14): guided test (setup, baseline gate, metronome-led patterns, results),
// run history and cartridge comparison. The state machine lives in ../workflows/scratch.js.
// Flag: features.scratchTest (the rail entry exists only while it is on). Skip thresholds are labelled
// uncalibrated everywhere a skip is shown.

import { h, esc, formatNumber, isTyping } from '../dom.js';
import { icon } from '../icons.js';
import { announce, toast } from '../live.js';
import { confirmDialog } from '../shell.js';
import { settings, store, active } from '../state.js';
import { listOutputDevices, outputSelectionSupported, liveAvailable } from '../audio-io.js';
import { TIMECODE_FORMATS } from '../../timecode.js';
import { PROTOCOL_V1, SCRATCH_DEFAULTS, createScratchApi, summarizeScratch, skipSafety, compareScores, groupScratchRuns, protocolTimeline } from '../../scratch.js';
import { attachFormatPicker } from '../media-picker.js';
import { createRecordsApi } from '../workflows/wearmap.js';
import { pdfButton, scratchPrintData } from '../workflows/m6-reports.js';
import { createPairPicker, currentPairs } from '../pair-picker.js';
import { createScratchRunner, SKIP_CALIBRATION, BPM_RANGE, METRONOME_LEAD_SEC } from '../workflows/scratch.js';

const COMPONENT_LABEL = { continuity: 'Lock continuity', recovery: 'Recovery time', direction: 'Direction accuracy', stability: 'Signal stability', skips: 'Needle skips' };
const COMPONENT_UNIT = { '%': '%', ms: 'ms', 'errors/reversal': '/ reversal', dB: 'dB', count: '' };
const KIND_LABEL = { reversal: 'Reversal', lock_loss: 'Lock lost', direction_error: 'Direction error', skip: 'Needle skip', recovery: 'Recovered' };
const TABS = [['test', 'Test'], ['history', 'History'], ['compare', 'Compare']];
const PATTERN_HINT = {
  baby: 'Push forward, pull back, once per beat.',
  transform: 'Open and close the fader on every 8th note while moving the record.',
  chirp: 'One sharp forward stab on each half note, then let the platter come back.',
};
const reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const num = (v, d = 0) => (Number.isFinite(v) ? formatNumber(v, { digits: d }) : '—');
const clock = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const dateText = iso => { try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return String(iso); } };
const patternLabel = id => PROTOCOL_V1.patterns.find(p => p.id === id)?.label || id;
const skipBadge = () => `<span class="badge badge-uncal scratch-uncal" title="${esc(SKIP_CALIBRATION.note)}">${icon('warn', { size: 12 })}${esc(SKIP_CALIBRATION.label)}</span>`;
const skipNote = () => `<p class="hint hint-warn scratch-skip-note">${icon('warn', { size: 16 })}<span>${esc(SKIP_CALIBRATION.note)}</span></p>`;

/** One bar of the ideal velocity shape for each pattern (schematic, not a measurement). */
function patternDiagram(id) {
  const W = 400, H = 110, mid = H / 2, amp = 38, pts = [];
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const x = i / N * 4;                 // beats
    let v;
    if (id === 'baby') v = Math.sin(2 * Math.PI * x);
    else if (id === 'transform') v = Math.floor(x * 2) % 2 === 0 ? 1 : 0;
    else v = Math.sin(Math.PI * (x % 2)) ** 2 * (x % 2 < 1 ? 1 : -.45);
    pts.push(`${(i / N * W).toFixed(1)},${(mid - v * amp).toFixed(1)}`);
  }
  const grid = [0, 1, 2, 3, 4].map(b => `<line class="plot-grid" x1="${b * W / 4}" x2="${b * W / 4}" y1="6" y2="${H - 6}"/>`).join('');
  return `<svg class="scratch-diagram" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${patternLabel(id)}: ${PROTOCOL_V1.patterns.find(p => p.id === id)?.beats}. One bar of platter velocity, forward above the line.`)}">${grid}<line class="plot-ref" x1="0" x2="${W}" y1="${mid}" y2="${mid}"/><polyline class="plot-line" points="${pts.join(' ')}"/></svg>`;
}

/** Velocity-over-time plot with pattern bands and event markers. `plot` may be null (history): markers only. */
export function timelinePlot({ plot, events, patterns, totalSec, startSec }) {
  const W = 760, H = 250, L = 46, R = 12, T = 28, B = 30, span = Math.max(1, totalSec);
  const x = t => L + (t / span) * (W - L - R);
  const lim = plot ? Math.max(1.5, Math.min(6, Math.ceil(Math.max(...plot.v.map(Math.abs), 0) * 2) / 2)) : 2;
  const y = v => T + (1 - (v + lim) / (2 * lim)) * (H - T - B);
  const bands = patterns.map(p => `<rect class="scratch-band" x="${x(p.performStart).toFixed(1)}" y="${T}" width="${(x(p.performEnd) - x(p.performStart)).toFixed(1)}" height="${H - T - B}"/><text class="plot-label" x="${x(p.performStart) + 6}" y="${T - 8}">${esc(p.label)}</text>`).join('');
  const yTicks = [-lim, -lim / 2, 0, lim / 2, lim].map(v => `<line class="plot-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="plot-tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${num(v, 1)}</text>`).join('');
  const step = span > 60 ? 15 : 10;
  const xTicks = Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => i * step).map(t => `<text class="plot-tick" x="${x(t)}" y="${H - 10}" text-anchor="middle">${clock(t)}</text>`).join('');
  const line = plot ? `<polyline class="plot-line plot-thin scratch-vel" points="${plot.t.map((t, i) => `${x(t).toFixed(1)},${y(Math.max(-lim, Math.min(lim, plot.v[i]))).toFixed(1)}`).join(' ')}"/>` : '';
  const marks = events.filter(e => e.kind !== 'recovery' && e.kind !== 'reversal').map(e => {
    const t = e.tMs / 1000;
    const cls = e.kind === 'skip' ? 'scratch-mark-skip' : e.kind === 'lock_loss' ? 'scratch-mark-loss' : e.kind === 'direction_error' ? 'scratch-mark-dir' : 'scratch-mark-rev';
    return `<line class="scratch-mark ${cls}" x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${T}" y2="${H - B}"><title>${esc(`${KIND_LABEL[e.kind]} at ${clock(t)}`)}</title></line>`;
  }).join('');
  const nSkip = events.filter(e => e.kind === 'skip').length, nLoss = events.filter(e => e.kind === 'lock_loss').length;
  const desc = `Platter velocity over ${clock(span)}. ${nLoss} lock losses and ${nSkip} needle skips marked; the event table below lists every marker.${plot ? '' : ' Velocity trace is only kept for the run just completed.'}`;
  return `<svg class="plot scratch-timeline" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}"><title>${esc(desc)}</title>${bands}${yTicks}${xTicks}${line}${marks}<text class="plot-label" x="${W - R}" y="${H - 1}" text-anchor="end">time (min:s)</text><text class="plot-label" x="4" y="18">speed ×</text></svg>
  <ul class="scratch-legend" aria-label="Marker legend"><li><i class="sw sw-loss"></i>Lock lost</li><li><i class="sw sw-dir"></i>Direction error</li><li><i class="sw sw-skip"></i>Needle skip ${skipBadge()}</li></ul>`;
}

/** Group stored events by pattern into per-pattern rows (history view; live results already have patterns). */
function patternsFromEvents(events) {
  return PROTOCOL_V1.patterns.map(p => {
    const e = events.filter(x => x.pattern === p.id);
    const losses = e.filter(x => x.kind === 'lock_loss');
    return { id: p.id, label: p.label, present: e.length > 0, reversals: e.filter(x => x.kind === 'reversal').length, lockLosses: losses.length,
      longestLossMs: losses.length ? Math.max(...losses.map(x => x.durationMs || 0)) : 0, directionErrors: e.filter(x => x.kind === 'direction_error').length,
      skips: e.filter(x => x.kind === 'skip').length, score: null };
  });
}

/** View model shared by a fresh result and a stored run. */
function viewOfResult(r, plot, startSec) {
  return {
    score: r.score, components: r.components, completed: r.completed, summary: r.summary, safety: r.safety, events: r.events, plot, startSec, bpm: r.bpm, format: r.format,
    patterns: PROTOCOL_V1.patterns.map(def => { const p = r.patterns.find(x => x.id === def.id); return p ? { id: p.id, label: p.label, present: true, reversals: p.reversals.length, lockLosses: p.lockLosses.length, longestLossMs: Math.max(0, ...p.lockLosses.map(l => l.durationMs)),
      directionErrors: p.directionErrors.length, skips: p.skips.length, score: p.score } : { id: def.id, label: def.label, present: false }; }),
    stats: { lockLosses: r.lockLosses, longestLossMs: r.longestLossMs, medianRecoveryMs: r.medianRecoveryMs, directionErrors: r.directionErrors, skips: r.skips, reversals: r.reversals, peakVelocity: r.peakVelocity },
    warnings: r.warnings || [],
  };
}
function viewOfRun(run, events) {
  const pats = events.filter(e => e.kind === 'skip').map(e => ({ skips: [{ tSec: e.tMs / 1000 }] }));
  const r = { lockLosses: run.lockLosses || 0, longestLossMs: run.longestLossMs || 0, medianRecoveryMs: run.medianRecoveryMs, directionErrors: run.directionErrors || 0, skips: run.skips || 0, completed: run.completed, patterns: pats };
  return {
    score: run.score, components: run.components || {}, completed: run.completed, summary: summarizeScratch(r), safety: skipSafety(run.skips || 0), events, plot: null, startSec: METRONOME_LEAD_SEC, bpm: run.bpm, format: run.format,
    patterns: patternsFromEvents(events), stats: { lockLosses: run.lockLosses, longestLossMs: run.longestLossMs, medianRecoveryMs: run.medianRecoveryMs, directionErrors: run.directionErrors, skips: run.skips, reversals: run.reversals, peakVelocity: run.peakVelocity }, warnings: [],
  };
}

/** Result body: score card, copy, safety, components, per-pattern table, timeline, event table. */
export function renderResultView(host, v, { meta = '' } = {}) {
  const partial = !v.completed;
  const unscored = !Number.isFinite(v.score);
  const tl = protocolTimeline(v.bpm || PROTOCOL_V1.bpm, { startSec: v.startSec || 0 });
  const totalSec = Math.max(tl.totalSec + (v.startSec || 0), ...v.events.map(e => e.tMs / 1000 + 1));
  const bands = tl.patterns.map(p => ({ label: p.label, performStart: p.performStart, performEnd: p.performEnd }));
  const sev = v.safety?.level === 'stop' ? 'fail' : v.safety?.level === 'warn' ? 'warn' : '';
  const comps = Object.entries(v.components || {});
  const cell = (n, d = 0, unit = '') => (Number.isFinite(n) ? `${formatNumber(n, { digits: d })}${unit}` : '—');
  host.innerHTML = `
    <section class="verdict ${unscored ? 'verdict-warn' : v.score >= 80 ? 'verdict-pass' : v.score >= 60 ? 'verdict-review' : 'verdict-warn'}" tabindex="-1" aria-labelledby="sc-score-h">
      <div class="verdict-main"><div>
        <h2 class="verdict-headline" id="sc-score-h">${unscored ? 'Not scored' : `Scratch tracking score <span class="num">${num(v.score, 0)}</span> / 100`}</h2>
        <p class="verdict-action">${esc(unscored ? 'Not enough was completed to score. A pattern counts once its full 20 s performance window has been captured.' : v.summary)}</p>
        <p class="verdict-meta muted">${esc(meta || `${v.format} · ${v.bpm} BPM · protocol v${PROTOCOL_V1.v}`)}${partial && !unscored ? ' · <span class="badge badge-uncal">Partial run</span>' : ''}</p>
      </div></div>
      <div class="verdict-side"><span class="muted small">Scores compare only within protocol v${PROTOCOL_V1.v}</span></div>
      ${partial && !unscored ? '<p class="verdict-note small muted">Run aborted: scored from the completed patterns only. A partial score is not comparable with a full run.</p>' : ''}
    </section>
    ${v.safety?.message ? `<div class="banner banner-${sev}" role="alert">${icon(sev === 'fail' ? 'fail' : 'warn', { size: 22 })}<div class="banner-text"><strong>${esc(v.safety.message)}</strong>${skipNote()}</div></div>` : ''}
    ${v.warnings.length ? `<p class="hint hint-warn">${icon('warn', { size: 16 })}<span>${esc(v.warnings.join(' '))}</span></p>` : ''}
    <div class="scratch-grid">
      <section class="card" aria-labelledby="sc-comp-h"><h3 class="card-title" id="sc-comp-h">Score components</h3>
        <div class="table-wrap"><table class="data"><caption class="sr-only">Score components with measured value and points</caption>
          <thead><tr><th scope="col">Component</th><th scope="col" class="r">Measured</th><th scope="col" class="r">Points</th></tr></thead>
          <tbody>${comps.map(([k, c]) => `<tr><th scope="row">${esc(COMPONENT_LABEL[k] || k)}${k === 'skips' ? ` ${skipBadge()}` : ''}</th><td class="r num">${Number.isFinite(c.value) ? `${cell(c.value, c.unit === 'errors/reversal' ? 2 : c.unit === '%' ? 1 : 0)} ${esc(COMPONENT_UNIT[c.unit] ?? c.unit ?? '')}` : c.unit === 'ms' ? 'no lock losses' : '—'}</td><td class="r num">${cell(c.points, 1)} / ${c.max}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No components</td></tr>'}</tbody></table></div>
        <p class="small muted">Metronome adherence is not scored. Weights are tunable defaults; a needle skip caps the total at 60.</p></section>
      <section class="card" aria-labelledby="sc-stat-h"><h3 class="card-title" id="sc-stat-h">Tracking events</h3>
        <dl class="scratch-stats">
          <div><dt>Lock lost</dt><dd class="num">${cell(v.stats.lockLosses)}</dd></div>
          <div><dt>Longest loss</dt><dd class="num">${cell(v.stats.longestLossMs, 0, ' ms')}</dd></div>
          <div><dt>Median recovery</dt><dd class="num">${cell(v.stats.medianRecoveryMs, 0, ' ms')}</dd></div>
          <div><dt>Direction errors</dt><dd class="num">${cell(v.stats.directionErrors)}</dd></div>
          <div><dt>Reversals</dt><dd class="num">${cell(v.stats.reversals)}</dd></div>
          <div><dt>Needle skips ${skipBadge()}</dt><dd class="num">${cell(v.stats.skips)}</dd></div>
          <div><dt>Peak speed</dt><dd class="num">${cell(Math.abs(v.stats.peakVelocity), 2, '×')}</dd></div>
        </dl></section>
    </div>
    <section class="card" aria-labelledby="sc-pat-h"><h3 class="card-title" id="sc-pat-h">Per pattern</h3>
      <div class="table-wrap"><table class="data scratch-patterns"><caption class="sr-only">Results for each scratch pattern</caption>
        <thead><tr><th scope="col">Pattern</th><th scope="col" class="r">Reversals</th><th scope="col" class="r">Lock lost</th><th scope="col" class="r">Longest loss</th><th scope="col" class="r">Direction errors</th><th scope="col" class="r">Skips</th><th scope="col" class="r">Score</th></tr></thead>
        <tbody>${v.patterns.map(p => p.present ? `<tr><th scope="row">${esc(p.label)}</th><td class="r num">${p.reversals}</td><td class="r num">${p.lockLosses}</td><td class="r num">${p.lockLosses ? `${num(p.longestLossMs)} ms` : '—'}</td><td class="r num">${p.directionErrors}</td><td class="r num">${p.skips}</td><td class="r num">${cell(p.score, 0)}</td></tr>`
          : `<tr><th scope="row">${esc(p.label)}</th><td colspan="6" class="muted">Not completed</td></tr>`).join('')}</tbody></table></div></section>
    <section class="card" aria-labelledby="sc-tl-h"><h3 class="card-title" id="sc-tl-h">Velocity timeline</h3>${timelinePlot({ plot: v.plot, events: v.events, patterns: bands, totalSec, startSec: v.startSec })}
      <details class="scratch-events"><summary>Event table (${v.events.filter(e => e.kind !== 'reversal').length} events, ${v.events.filter(e => e.kind === 'reversal').length} reversals)</summary>
        <div class="table-wrap"><table class="data"><caption class="sr-only">Every detected event with time and duration</caption><thead><tr><th scope="col">Time</th><th scope="col">Pattern</th><th scope="col">Event</th><th scope="col" class="r">Duration</th></tr></thead>
        <tbody>${v.events.length ? [...v.events].sort((a, b) => a.tMs - b.tMs).map(e => `<tr><td class="num">${clock(e.tMs / 1000)}.${String(Math.round(e.tMs % 1000)).padStart(3, '0')}</td><td>${esc(patternLabel(e.pattern))}</td><td>${esc(KIND_LABEL[e.kind] || e.kind)}${e.kind === 'skip' ? ` ${skipBadge()}` : ''}</td><td class="r num">${Number.isFinite(e.durationMs) ? `${num(e.durationMs, 1)} ms` : '—'}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">No events detected.</td></tr>'}</tbody></table></div></details></section>`;
}

export function createScratchScreen(section) {
  const api = createScratchApi();
  const st = { tab: 'test', runs: null, detail: null, cartridges: [], setups: [], sides: [], outputs: [], form: { setupId: '', recordSideId: '', format: TIMECODE_FORMATS.find(f => /CV02/.test(f.name))?.name || TIMECODE_FORMATS[0].name, bpm: BPM_RANGE.default, cartridgeAssetId: '', trackingForceG: '', tonearmNote: '', levelDbfs: SCRATCH_DEFAULTS.metronomeDbfs, sinkId: '', volumeAck: false }, cmp: { a: '', b: '' } };
  let runner = null, lastPhase = null;
  const live = liveAvailable();

  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('wave', { size: 24 })}</span><div><h1 tabindex="-1">Scratch stress test</h1>
      <p class="lede">Perform baby scratches, transforms and chirps in time with a metronome while DeckChek follows the timecode, then see where lock was lost, how fast it recovered and whether the needle skipped.</p></div></div></header>
    <div class="tabs" role="tablist" aria-label="Scratch test views" id="sc-tabs"></div>
    <div id="sc-panel" role="tabpanel" tabindex="-1" class="scratch-panel"></div>`;
  const q = s => section.querySelector(s);
  q('.screen-head').append(pdfButton(h, { id: 'sc-export-pdf', kind: 'scratch', icon: icon('download', { size: 18 }), getData: () => (st.printable ? scratchPrintData(st.printable.view, st.printable) : null) }));
  const panel = q('#sc-panel');

  // ---------- tabs ----------
  function renderTabs() {
    q('#sc-tabs').replaceChildren(...TABS.map(([id, label]) => {
      const sel = st.tab === id;
      const t = h('button', { type: 'button', role: 'tab', id: `sc-tab-${id}`, class: 'tab', 'aria-selected': String(sel), 'aria-controls': 'sc-panel', tabindex: sel ? '0' : '-1', text: label });
      t.addEventListener('click', () => selectTab(id));
      return t;
    }));
    panel.setAttribute('aria-labelledby', `sc-tab-${st.tab}`);
  }
  q('#sc-tabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = TABS.findIndex(([id]) => id === st.tab);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowLeft' ? TABS.length - 1 : 1)) % TABS.length;
    selectTab(TABS[n][0]); q('#sc-tabs [aria-selected="true"]')?.focus();
  });
  function selectTab(id) {
    if (runner?.busy && id !== 'test') { toast('Finish or abort the running test first (Esc).', { type: 'warn' }); return; }
    st.tab = id; st.detail = null; renderTabs(); renderPanel();
  }
  function renderPanel() {
    if (st.tab === 'test') renderPhase(true);
    else if (st.tab === 'history') renderHistory();
    else renderCompare();
  }

  // ---------- data ----------
  async function loadCartridges() {
    try {
      const [assets, products] = await Promise.all([store.list('asset'), store.list('product')]);
      const cart = new Set(products.filter(p => p.category === 'cartridge' || p.category === 'stylus').map(p => p.id));
      const name = id => products.find(p => p.id === id);
      st.cartridges = assets.filter(a => cart.has(a.productId)).map(a => ({ id: a.id, label: a.nickname || [name(a.productId)?.model].filter(Boolean).join(' ') || 'Cartridge' }));
    } catch { st.cartridges = []; }
  }
  async function loadSetupsAndSides() {
    try { st.setups = (await store.list('setup')).map(u => ({ id: u.id, label: u.name || 'Setup' })); } catch { st.setups = []; }
    try {
      const copies = await (st.recordsApi ||= createRecordsApi()).list();
      st.sides = copies.filter(c => !c.retired).flatMap(c => (c.sides || []).map(sd => ({ id: sd.id, label: `${c.title || 'Control vinyl'}${c.nickname ? ` (${c.nickname})` : ''} · side ${sd.sideLabel}` })));
    } catch { st.sides = []; }
  }
  const setupLabel = id => st.setups.find(u => u.id === id)?.label || 'Unknown setup';
  const sideLabel = id => st.sides.find(u => u.id === id)?.label || 'Unknown control vinyl';
  const linkText = o => `${o.setupId ? ` · ${setupLabel(o.setupId)}` : ''}${o.recordSideId ? ` · ${sideLabel(o.recordSideId)}` : ''}`;
  const cartridgeLabel = id => (id ? st.cartridges.find(c => c.id === id)?.label || 'Unknown cartridge' : 'Not recorded');
  async function loadRuns() {
    try { st.runs = await api.list({ protocolVersion: PROTOCOL_V1.v }); st.runsError = null; } catch (error) { st.runs = []; st.runsError = error?.message || String(error); }
  }

  // ---------- test tab ----------
  const ensureRunner = () => runner ||= createScratchRunner({ api, onChange: onRunnerChange });

  function onRunnerChange(state) {
    if (st.tab !== 'test') return;
    if (state.phase !== lastPhase) { renderPhase(); return; }
    if (state.phase === 'running') updateRunning(state); else if (state.phase === 'baseline') updateBaseline(state);
  }

  function renderPhase(force = false) {
    const state = runner?.state;
    const phase = state?.phase || 'setup';
    if (!force && phase === lastPhase) return;
    lastPhase = phase;
    panel.dataset.phase = phase;
    if (phase === 'setup') renderSetup();
    else if (phase === 'baseline') renderBaseline(state);
    else if (phase === 'baseline-failed') renderBaselineFailed(state);
    else if (phase === 'ready') renderReady(state);
    else if (phase === 'running') renderRunning(state);
    else if (phase === 'analyzing') renderAnalyzing();
    else if (phase === 'done') renderDone(state);
    else if (phase === 'error') renderError(state);
    const focusable = phase === 'done' ? panel.querySelector('.verdict') : panel.querySelector('h2');
    if (focusable) { focusable.setAttribute('tabindex', '-1'); if (!force) focusable.focus({ preventScroll: true }); }
  }

  function formValues() {
    const f = st.form;
    return { format: f.format, bpm: Number(f.bpm), deviceName: settings.deviceName || null, pairs: currentPairs(), levelDbfs: Number(f.levelDbfs), sinkId: f.sinkId,
      cartridgeAssetId: f.cartridgeAssetId || null, setupId: f.setupId || null, recordSideId: f.recordSideId || null, trackingForceG: f.trackingForceG === '' ? null : Number(f.trackingForceG), tonearmNote: f.tonearmNote.trim() || null };
  }
  function validateForm() {
    const f = st.form, problems = [];
    if (!(Number(f.bpm) >= BPM_RANGE.min && Number(f.bpm) <= BPM_RANGE.max)) problems.push(`BPM must be between ${BPM_RANGE.min} and ${BPM_RANGE.max}.`);
    if (f.trackingForceG !== '' && !(Number(f.trackingForceG) > 0 && Number(f.trackingForceG) < 10)) problems.push('Tracking force must be between 0 and 10 g.');
    if (!f.volumeAck) problems.push('Confirm the headphone and monitor volume is low.');
    return problems;
  }

  function safetyBlock() {
    return `<div class="banner banner-warn scratch-safety" role="note">${icon('warn', { size: 22 })}<div class="banner-text"><strong>Use a spare control vinyl, not your best one.</strong>
      <span>Heavy scratching wears the groove. Keep the needle on the record, keep headphone and monitor volume low, and stop if the needle skips (3 skips ends the advice to continue).</span></div></div>`;
  }

  function renderSetup() {
    const f = st.form, total = protocolTimeline(Number(f.bpm) || BPM_RANGE.default).totalSec;
    const outputs = st.outputs;
    panel.innerHTML = `
      ${safetyBlock()}
      ${live ? '' : `<div class="banner banner-fail" role="alert">${icon('fail', { size: 22 })}<div class="banner-text"><strong>Live capture needs the desktop app.</strong><span>The scratch test records the control vinyl while you perform, so it cannot run in this browser preview. History and comparison still work.</span></div></div>`}
      <div class="scratch-grid scratch-setup">
        <section class="card" aria-labelledby="sc-setup-h"><h2 class="card-title" id="sc-setup-h">1 · Setup</h2>
          <div class="field-grid">
            <div class="field"><label class="field-label" for="sc-format">Timecode format</label><select id="sc-format">${TIMECODE_FORMATS.map(t => `<option${t.name === f.format ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
            <div class="field"><label class="field-label" for="sc-bpm">Tempo (BPM)</label><input id="sc-bpm" type="number" inputmode="decimal" min="${BPM_RANGE.min}" max="${BPM_RANGE.max}" step="1" value="${esc(f.bpm)}" aria-describedby="sc-bpm-h"><span class="field-help" id="sc-bpm-h">Default ${BPM_RANGE.default}. Compare runs only at the same tempo.</span></div>
            <div class="field"><label class="field-label" for="sc-cart">Cartridge</label><select id="sc-cart"><option value="">Not recorded</option>${st.cartridges.map(c => `<option value="${esc(c.id)}"${c.id === f.cartridgeAssetId ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select><span class="field-help">Cartridges come from Equipment; add one there to compare cartridges.</span></div>
            <div class="field"><label class="field-label" for="sc-setup">Setup</label><select id="sc-setup"><option value="">Not recorded</option>${st.setups.map(c => `<option value="${esc(c.id)}"${c.id === f.setupId ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select><span class="field-help">Setups come from Equipment; pick one to compare setups.</span></div>
            <div class="field"><label class="field-label" for="sc-side">Control vinyl copy and side</label><select id="sc-side"><option value="">Not recorded</option>${st.sides.map(c => `<option value="${esc(c.id)}"${c.id === f.recordSideId ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select><span class="field-help">Copies come from the Control vinyl screen; pick one to compare copies of the same disc.</span></div>
            <div class="field"><label class="field-label" for="sc-force">Tracking force (g, optional)</label><input id="sc-force" type="number" inputmode="decimal" min="0" max="10" step="0.1" value="${esc(f.trackingForceG)}"></div>
            <div class="field field-wide"><label class="field-label" for="sc-note">Setup note (optional)</label><input id="sc-note" type="text" maxlength="200" value="${esc(f.tonearmNote)}" placeholder="Mixer, software, tonearm height…"></div>
          </div></section>
        <section class="card" aria-labelledby="sc-met-h"><h2 class="card-title" id="sc-met-h">Metronome</h2>
          <div class="field-grid">
            <div class="field"><label class="field-label" for="sc-out">Output</label><select id="sc-out"${outputs.length ? '' : ' disabled'}>${outputs.length ? `<option value="">System default</option>${outputs.map(o => `<option value="${esc(o.id)}"${o.id === f.sinkId ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}` : '<option>System default</option>'}</select>
              <span class="field-help">${outputSelectionSupported() ? 'Send the click to your headphones or monitors, not the DJ mixer.' : 'Output choice is not available here; the click plays on the system default output.'}</span></div>
            <div class="field"><label class="field-label" for="sc-level">Click level <span class="num" id="sc-level-v">${esc(f.levelDbfs)} dBFS</span></label><input id="sc-level" type="range" min="${SCRATCH_DEFAULTS.metronomeMinDbfs}" max="${SCRATCH_DEFAULTS.metronomeMaxDbfs}" step="1" value="${esc(f.levelDbfs)}"><span class="field-help">Default ${SCRATCH_DEFAULTS.metronomeDbfs} dBFS, hard maximum ${SCRATCH_DEFAULTS.metronomeMaxDbfs} dBFS.</span></div>
          </div>
          <label class="data-ack scratch-ack"><input type="checkbox" id="sc-vol"${f.volumeAck ? ' checked' : ''}><span>I have turned the headphone and monitor volume down.</span></label>
        </section>
      </div>
      <section class="card card-quiet" aria-labelledby="sc-proto-h"><h2 class="card-title" id="sc-proto-h">Protocol v${PROTOCOL_V1.v} · about ${Math.ceil(total / 5) * 5} s</h2>
        <ol class="scratch-proto">${PROTOCOL_V1.patterns.map(p => `<li><strong>${esc(p.label)}</strong><span class="muted small">${esc(PATTERN_HINT[p.id])} ${PROTOCOL_V1.countInBeats}-beat count-in, ${PROTOCOL_V1.performSec} s performed, ${PROTOCOL_V1.restSec} s rest.</span></li>`).join('')}</ol>
        <p class="small muted">DJ software should be closed, or it may hold the audio input. First the platter is checked for 3 seconds of steady playback (needle down, 33⅓ rpm, no scratching). ${skipBadge()} Needle-skip detection uses untested default thresholds.</p></section>
      <div id="sc-problems" class="small" aria-live="polite"></div>
      <div class="step-footer"><span class="muted small">Shortcuts: <kbd>Enter</kbd> next · <kbd>M</kbd> mute click · <kbd>Esc</kbd> abort</span>
        <button type="button" class="btn btn-primary btn-lg" id="sc-start"${live ? '' : ' disabled aria-disabled="true"'}>${icon('play', { size: 18 })}<span>Check baseline</span></button></div>`;
    const bind = (id, key, conv = v => v) => q(id).addEventListener('input', e => { f[key] = conv(e.target.value); });
    if (q('#sc-format')) attachFormatPicker(q('#sc-format'));
    bind('#sc-format', 'format'); bind('#sc-bpm', 'bpm'); bind('#sc-cart', 'cartridgeAssetId'); bind('#sc-setup', 'setupId'); bind('#sc-side', 'recordSideId'); bind('#sc-force', 'trackingForceG'); bind('#sc-note', 'tonearmNote'); bind('#sc-out', 'sinkId');
    q('#sc-level').addEventListener('input', e => { f.levelDbfs = Number(e.target.value); q('#sc-level-v').textContent = `${f.levelDbfs} dBFS`; });
    q('#sc-vol').addEventListener('change', e => { f.volumeAck = e.target.checked; });
    q('#sc-start').addEventListener('click', startBaseline);
    const pair = createPairPicker({ id: 'sc-pair', label: 'Input pair' });
    if (pair.el) q('#sc-note').closest('.field').before(pair.el);
  }

  function startBaseline() {
    const problems = validateForm();
    q('#sc-problems') && (q('#sc-problems').innerHTML = problems.map(p => `<p class="hint hint-warn">${icon('warn', { size: 16 })}<span>${esc(p)}</span></p>`).join(''));
    if (problems.length) { announce(problems[0], { assertive: true }); return false; }
    if (!live) return false;
    ensureRunner().runBaseline(formValues());
    return true;
  }

  function renderBaseline() {
    panel.innerHTML = `<section class="card scratch-center" aria-labelledby="sc-bl-h"><h2 class="card-title" id="sc-bl-h">2 · Baseline</h2>
      <p>Needle down, platter running at normal speed, no scratching. Hold steady for 3 seconds.</p>
      <div class="progress" role="progressbar" aria-label="Baseline progress" aria-valuemin="0" aria-valuemax="3" aria-valuenow="0"><span id="sc-bl-bar"></span></div>
      <p class="muted small"><span class="spinner" aria-hidden="true"></span> Measuring carrier signal-to-noise…</p>
      <button type="button" class="btn btn-secondary" id="sc-cancel">Cancel <kbd>Esc</kbd></button></section>`;
    q('#sc-cancel').addEventListener('click', () => runner.abort());
  }
  function updateBaseline(state) {
    const s = state.progress?.baselineSec || 0;
    const bar = q('#sc-bl-bar'); if (bar) bar.style.width = `${Math.min(100, s / 3 * 100)}%`;
    q('[role="progressbar"]')?.setAttribute('aria-valuenow', s.toFixed(1));
  }

  function renderBaselineFailed(state) {
    const b = state.baseline;
    panel.innerHTML = `<div class="banner banner-fail" role="alert">${icon('fail', { size: 22 })}<div class="banner-text"><h2 class="card-title">The test did not start: baseline check failed</h2>
      <span>The scratch test needs a clean timecode signal first (carrier SNR of at least ${SCRATCH_DEFAULTS.baselineMinSnrDb} dB, platter running forward at normal speed). ${b.reasons.some(r => r.id === 'low-snr') && Number.isFinite(b.snrDb) ? `Measured ${num(b.snrDb, 1)} dB.` : ''}</span></div></div>
      <section class="card" aria-labelledby="sc-fix-h"><h3 class="card-title" id="sc-fix-h">What to try</h3><ul class="scratch-fix">${b.reasons.map(r => `<li><strong>${esc(r.title)}</strong><span class="muted">${esc(r.action)}</span></li>`).join('')}</ul></section>
      <div class="step-footer"><button type="button" class="btn btn-secondary" id="sc-back">Back to setup</button><button type="button" class="btn btn-primary" id="sc-retry">${icon('refresh', { size: 18 })}<span>Re-check baseline</span></button></div>`;
    q('#sc-back').addEventListener('click', () => runner.reset());
    q('#sc-retry').addEventListener('click', () => runner.runBaseline(runner.state.config));
  }

  function renderReady(state) {
    const b = state.baseline;
    panel.innerHTML = `<div class="banner banner-device" role="status">${icon('pass', { size: 22 })}<div class="banner-text"><h2 class="card-title">Baseline OK</h2>
      <span>Carrier SNR ${num(b.snrDb, 1)} dB at ${num(Math.abs(b.speedErrorPercent), 1)}% from nominal speed. Ready for the first pattern.</span></div></div>
      <section class="card" aria-labelledby="sc-go-h"><h2 class="card-title" id="sc-go-h">3 · Guided patterns</h2>
        <p>When you start, the metronome counts in ${PROTOCOL_V1.countInBeats} beats, then you perform each pattern for ${PROTOCOL_V1.performSec} seconds and rest for ${PROTOCOL_V1.restSec}. Start with the platter running and the needle down; hold the record still during the count-in and the rest.</p>
        <ul class="scratch-proto">${PROTOCOL_V1.patterns.map(p => `<li><strong>${esc(p.label)}</strong><span class="muted small">${esc(PATTERN_HINT[p.id])}</span></li>`).join('')}</ul></section>
      <div class="step-footer"><button type="button" class="btn btn-secondary" id="sc-back">Back to setup</button><button type="button" class="btn btn-primary btn-lg" id="sc-begin">${icon('play', { size: 18 })}<span>Start patterns</span><kbd>Enter</kbd></button></div>`;
    q('#sc-back').addEventListener('click', () => runner.reset());
    q('#sc-begin').addEventListener('click', () => runner.begin());
    q('#sc-begin').focus();
  }

  function renderRunning(state) {
    const bpm = state.config.bpm;
    panel.innerHTML = `
      <section class="card scratch-run" aria-labelledby="sc-run-h" data-metronome="${state.muted ? 'muted' : 'on'}">
        <div class="scratch-run-head"><div><p class="muted small" id="sc-run-step"></p><h2 class="scratch-pattern-name" id="sc-run-h" tabindex="-1"></h2></div>
          <div class="scratch-phase"><span class="scratch-phase-label" id="sc-phase"></span><span class="scratch-count num" id="sc-count" aria-hidden="true"></span></div></div>
        <div class="scratch-stage">
          <div class="scratch-diagram-wrap" id="sc-diagram"></div>
          <div class="scratch-playhead" id="sc-playhead" aria-hidden="true"></div>
        </div>
        <ol class="scratch-beats" id="sc-beats" aria-hidden="true">${[1, 2, 3, 4].map(n => `<li data-beat="${n - 1}"><span>${n}</span></li>`).join('')}</ol>
        <p class="small muted" id="sc-hint"></p>
        <div class="progress" role="progressbar" aria-label="Protocol progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="sc-run-bar"></span></div>
        <div class="scratch-run-foot">
          <ol class="scratch-pills" aria-label="Pattern progress">${PROTOCOL_V1.patterns.map(p => `<li data-id="${p.id}" class="pill">${esc(p.label)}</li>`).join('')}</ol>
          <div class="scratch-level"><span class="muted small">Carrier level</span><span class="chip" id="sc-lock"></span><span class="num small muted" id="sc-level"></span></div>
          <span class="scratch-metro small" id="sc-metro"></span>
        </div>
      </section>
      <div class="step-footer"><span class="muted small">${bpm} BPM · <kbd>M</kbd> mute click · <kbd>Esc</kbd> abort and score completed patterns</span>
        <button type="button" class="btn btn-secondary" id="sc-mute" aria-pressed="false">Mute click <kbd>M</kbd></button>
        <button type="button" class="btn btn-danger" id="sc-abort">${icon('stop', { size: 18 })}<span>Abort</span><kbd>Esc</kbd></button></div>`;
    q('#sc-mute').addEventListener('click', toggleMute);
    q('#sc-abort').addEventListener('click', () => runner.abort());
    section.dataset.diagram = '';
    updateRunning(state);
  }

  function updateRunning(state) {
    const p = state.progress; if (!p) return;
    const host = q('#sc-diagram'); if (!host) return;
    const id = p.pattern.id;
    if (section.dataset.diagram !== id) { host.innerHTML = patternDiagram(id); section.dataset.diagram = id; q('#sc-hint').textContent = PATTERN_HINT[id]; }
    q('#sc-run-h').textContent = p.phase === 'lead' ? 'Get ready' : p.pattern.label;
    q('#sc-run-step').textContent = `Pattern ${p.index + 1} of ${PROTOCOL_V1.patterns.length}`;
    const phaseText = p.phase === 'lead' ? 'Starting…' : p.phase === 'countin' ? 'Count-in: hold still' : p.phase === 'perform' ? 'Perform now' : p.phase === 'rest' ? 'Rest: hold still' : 'Finishing…';
    const label = q('#sc-phase');
    if (label.textContent !== phaseText) { label.textContent = phaseText; announce(`${phaseText}, ${p.pattern.label}`); }
    label.dataset.phase = p.phase;
    q('#sc-count').textContent = p.phase === 'countin' ? String(p.beat + PROTOCOL_V1.countInBeats + 1) : p.phase === 'perform' || p.phase === 'rest' ? `${Math.ceil(p.untilSec)} s` : '';
    const barBeat = p.phase === 'countin' ? p.beat + PROTOCOL_V1.countInBeats : p.phase === 'perform' ? ((p.beat % 4) + 4) % 4 : -1;
    const frac = barBeat >= 0 ? (barBeat + p.beatFrac) / 4 : 0;
    const ph = q('#sc-playhead'); ph.style.setProperty('--f', frac.toFixed(4)); ph.hidden = barBeat < 0 || reducedMotion();
    section.querySelectorAll('#sc-beats li').forEach(li => li.classList.toggle('on', Number(li.dataset.beat) === barBeat));
    section.querySelectorAll('.scratch-pills li').forEach((li, i) => { li.dataset.state = i < p.index ? 'done' : i === p.index ? 'now' : 'next'; });
    q('#sc-run-bar').style.width = `${(p.overall * 100).toFixed(1)}%`;
    q('[aria-label="Protocol progress"]').setAttribute('aria-valuenow', String(Math.round(p.overall * 100)));
    const lock = q('#sc-lock'), lv = state.live;
    lock.className = `chip chip-${lv.lock === 'ok' ? 'pass' : lv.lock === 'low' ? 'warn' : 'info'}`;
    lock.textContent = lv.lock === 'ok' ? 'Signal good' : lv.lock === 'low' ? 'Signal low' : 'Waiting';
    q('#sc-level').textContent = Number.isFinite(lv.levelDb) ? `${num(lv.levelDb, 0)} dBFS` : '';
    const metro = state.muted ? 'muted' : 'on';
    section.querySelector('.scratch-run').dataset.metronome = metro;
    q('#sc-metro').textContent = state.muted ? 'Click muted' : 'Click on';
    const mute = q('#sc-mute'); mute.setAttribute('aria-pressed', String(state.muted));
  }

  function toggleMute() {
    if (!runner?.state || runner.state.phase !== 'running') return;
    const muted = runner.toggleMute();
    announce(muted ? 'Metronome muted' : 'Metronome on');
    updateRunning(runner.state);
  }

  function renderAnalyzing() {
    const aborted = runner.state.aborted;
    panel.innerHTML = `<section class="card scratch-center scratch-run" data-metronome="stopped" aria-labelledby="sc-an-h"><h2 class="card-title" id="sc-an-h">${aborted ? 'Aborted. Click silenced.' : 'Done. Analysing…'}</h2>
      <p class="muted"><span class="spinner" aria-hidden="true"></span> Measuring velocity, lock and needle skips from the recording. Nothing leaves this computer and no audio is kept.</p></section>`;
  }

  function renderDone(state) {
    const r = state.result;
    panel.innerHTML = `<div id="sc-result"></div>
      <p class="small muted" id="sc-saved">${state.saved ? `<span class="scratch-saved">${icon('check', { size: 14 })} Saved to History.</span>` : r.patterns.length ? esc(state.saveError ? `Not saved: ${state.saveError}` : '') : 'Nothing saved: no pattern was completed.'}</p>
      <div class="step-footer"><button type="button" class="btn btn-secondary" id="sc-hist">Open history</button><button type="button" class="btn btn-primary" id="sc-again">${icon('refresh', { size: 18 })}<span>Run again</span></button></div>`;
    { const view = viewOfResult(r, state.plot, state.plot?.startSec ?? 0), opts = { meta: `${cartridgeLabel(state.config.cartridgeAssetId)}${linkText(state.config)} · ${r.format} · ${r.bpm} BPM · protocol v${PROTOCOL_V1.v}` }; st.printable = { view, meta: opts.meta, createdAt: new Date().toISOString() }; renderResultView(q('#sc-result'), view, opts); }
    q('#sc-hist').addEventListener('click', () => { runner.reset(); selectTab('history'); });
    q('#sc-again').addEventListener('click', () => runner.reset());
    announce(r.patterns.length ? `Result: score ${Math.round(r.score)} out of 100. ${r.summary}` : 'Not enough was completed to score.', { assertive: true });
  }

  function renderError(state) {
    panel.innerHTML = `<div class="banner banner-fail" role="alert">${icon('fail', { size: 22 })}<div class="banner-text"><h2 class="card-title">The test stopped</h2><span>${esc(state.error)}</span><span class="muted">The metronome was silenced. Check the input and output devices and try again.</span></div></div>
      <div class="step-footer"><button type="button" class="btn btn-primary" id="sc-back">Back to setup</button></div>`;
    q('#sc-back').addEventListener('click', () => runner.reset());
  }

  // ---------- history ----------
  async function renderHistory() {
    panel.innerHTML = '<p class="muted"><span class="spinner" aria-hidden="true"></span> Loading runs…</p>';
    await Promise.all([loadRuns(), loadCartridges(), loadSetupsAndSides()]);
    if (st.tab !== 'history') return;
    if (st.detail) return renderDetail();
    if (st.runsError) { panel.innerHTML = `<div class="banner banner-fail" role="alert">${icon('fail', { size: 22 })}<div class="banner-text"><strong>Could not load scratch runs.</strong><span>${esc(st.runsError)}</span></div></div>`; return; }
    if (!st.runs.length) { panel.innerHTML = `<div class="empty">${icon('wave', { size: 48 })}<h2>No scratch runs yet</h2><p>Run the guided test and the result is saved here, so you can compare cartridges and control vinyl over time.</p><button type="button" class="btn btn-primary" id="sc-go">Start a test</button></div>`; q('#sc-go').addEventListener('click', () => selectTab('test')); return; }
    panel.innerHTML = `<div class="table-wrap"><table class="data scratch-history"><caption class="sr-only">Saved scratch test runs, newest first</caption>
      <thead><tr><th scope="col">Date</th><th scope="col">Cartridge</th><th scope="col">Format</th><th scope="col" class="r">BPM</th><th scope="col" class="r">Score</th><th scope="col" class="r">Lock lost</th><th scope="col" class="r">Skips</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${st.runs.map(r => `<tr data-id="${esc(r.id)}"><th scope="row"><button type="button" class="btn btn-ghost btn-sm" data-open="${esc(r.id)}">${esc(dateText(r.createdAt))}</button>${r.completed ? '' : ' <span class="badge badge-uncal">Partial</span>'}</th>
        <td>${esc(cartridgeLabel(r.cartridgeAssetId))}</td><td>${esc(r.format)}</td><td class="r num">${num(r.bpm)}</td><td class="r num"><strong>${num(r.score)}</strong></td><td class="r num">${num(r.lockLosses)}</td><td class="r num">${num(r.skips)}${r.skips ? ` ${skipBadge()}` : ''}</td>
        <td class="r"><button type="button" class="btn btn-ghost btn-sm" data-del="${esc(r.id)}" aria-label="Delete run from ${esc(dateText(r.createdAt))}">${icon('trash', { size: 16 })}</button></td></tr>`).join('')}</tbody></table></div>`;
    panel.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openRun(b.dataset.open)));
    panel.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => deleteRun(b.dataset.del)));
  }
  async function openRun(id) {
    try { const d = await api.get(id); if (!d) throw new Error('This run no longer exists.'); st.detail = d; renderDetail(); }
    catch (error) { toast(`Could not open the run: ${error?.message || error}`, { type: 'error' }); }
  }
  function renderDetail() {
    const { run, events } = st.detail;
    panel.innerHTML = `<div class="toolbar"><button type="button" class="btn btn-secondary" id="sc-back">${icon('chevronLeft', { size: 18 })}<span>All runs</span></button>
      <span class="muted small">${esc(dateText(run.createdAt))}</span></div><div id="sc-result"></div>
      <p class="small muted">${run.trackingForceG ? `Tracking force ${num(run.trackingForceG, 1)} g. ` : ''}${esc(run.tonearmNote || '')} The velocity trace is kept only for the run just completed.</p>`;
    { const view = viewOfRun(run, events), opts = { meta: `${cartridgeLabel(run.cartridgeAssetId)}${linkText(run)} · ${run.format} · ${run.bpm} BPM · protocol v${run.protocolVersion}` }; st.printable = { view, meta: opts.meta, createdAt: run.createdAt }; renderResultView(q('#sc-result'), view, opts); }
    q('#sc-back').addEventListener('click', () => { st.detail = null; renderHistory(); });
    q('#sc-back').focus();
  }
  async function deleteRun(id) {
    const ok = await confirmDialog({ title: 'Delete this scratch run?', body: 'The run and its events are removed from History. This cannot be undone.', confirmLabel: 'Delete run' });
    if (!ok) return;
    try { await api.delete(id); toast('Scratch run deleted.', { type: 'success', timeout: 2500 }); await renderHistory(); } catch (error) { toast(`Could not delete: ${error?.message || error}`, { type: 'error' }); }
  }

  // ---------- compare ----------
  async function renderCompare() {
    panel.innerHTML = '<p class="muted"><span class="spinner" aria-hidden="true"></span> Loading runs…</p>';
    await Promise.all([loadRuns(), loadCartridges(), loadSetupsAndSides()]);
    if (st.tab !== 'compare') return;
    const list = groupScratchRuns(st.runs || [], { cartridge: cartridgeLabel, setup: setupLabel, side: sideLabel });
    const groups = new Map(list.map(g => [g.key, g]));

    if (list.length < 2) { panel.innerHTML = `<div class="empty">${icon('compare', { size: 48 })}<h2>Not enough runs to compare</h2><p>Complete full runs for two different setups (for example two cartridges, two setups or two copies of the control vinyl, same format and tempo). Three repeats of each give a fair comparison. Partial runs are left out.</p></div>`; return; }
    if (!groups.has(st.cmp.a)) st.cmp.a = list[0].key;
    if (!groups.has(st.cmp.b) || st.cmp.b === st.cmp.a) st.cmp.b = list.find(g => g.key !== st.cmp.a).key;
    const A = groups.get(st.cmp.a), B = groups.get(st.cmp.b), c = compareScores(A.scores, B.scores);
    const opt = sel => list.map(g => `<option value="${esc(g.key)}"${g.key === sel ? ' selected' : ''}>${esc(g.label)}</option>`).join('');
    panel.innerHTML = `<div class="field-grid scratch-cmp-fields"><div class="field"><label class="field-label" for="sc-a">Setup A</label><select id="sc-a">${opt(st.cmp.a)}</select></div><div class="field"><label class="field-label" for="sc-b">Setup B</label><select id="sc-b">${opt(st.cmp.b)}</select></div></div>
      <section class="card" aria-labelledby="sc-cmp-h"><h2 class="card-title" id="sc-cmp-h">Score comparison</h2>
        <div class="table-wrap"><table class="data"><caption class="sr-only">Score statistics for the two selected setups</caption><thead><tr><th scope="col">Setup</th><th scope="col" class="r">Runs</th><th scope="col" class="r">Mean score</th><th scope="col" class="r">Std dev</th></tr></thead>
          <tbody><tr><th scope="row">A · ${esc(A.label)}</th><td class="r num">${c.a.count}</td><td class="r num">${num(c.a.mean, 1)}</td><td class="r num">${num(c.a.stdDev, 1)}</td></tr><tr><th scope="row">B · ${esc(B.label)}</th><td class="r num">${c.b.count}</td><td class="r num">${num(c.b.mean, 1)}</td><td class="r num">${num(c.b.stdDev, 1)}</td></tr></tbody></table></div>
        <p class="verdict-action" role="status"><strong>B minus A: <span class="num">${c.delta >= 0 ? '+' : ''}${num(c.delta, 1)}</span> points.</strong> ${esc(c.note)}</p>
        <p class="small muted">A difference smaller than twice the run-to-run standard deviation is treated as noise. Compare only runs of the same protocol version, format and tempo.</p></section>`;
    q('#sc-a').addEventListener('change', e => { st.cmp.a = e.target.value; renderCompare(); });
    q('#sc-b').addEventListener('change', e => { st.cmp.b = e.target.value; renderCompare(); });
  }

  // ---------- keyboard ----------
  const onKey = e => {
    if (active.screen?.def.id !== 'scratch') return;
    if (!runner) { if (e.key === 'Enter' && st.tab === 'test' && !e.ctrlKey && !document.querySelector('dialog[open]') && !['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'SUMMARY'].includes(e.target?.tagName)) { e.preventDefault(); startBaseline(); } return; }
    if (e.key === 'Escape' && runner.busy && runner.state.phase !== 'analyzing') { if (runner.abort()) { e.preventDefault(); } return; }
    if (e.key === 'Enter' && st.tab === 'test' && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('dialog[open]') && !['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'SUMMARY'].includes(e.target?.tagName)) {
      const phase = runner.state.phase;
      if (phase === 'ready') { e.preventDefault(); runner.begin(); } else if (phase === 'setup') { e.preventDefault(); startBaseline(); }
      return;
    }
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target) && runner.state.phase === 'running') { e.preventDefault(); toggleMute(); }
  };
  document.addEventListener('keydown', onKey, true); // capture phase: Esc silences the click before anything else runs

  renderTabs();
  Promise.all([loadCartridges(), loadSetupsAndSides(), listOutputDevices().then(o => { st.outputs = o; }).catch(() => {})]).then(() => { if (st.tab === 'test' && (!runner || runner.state.phase === 'setup')) renderPhase(true); });
  renderPhase(true);

  return {
    onShow() { if (st.tab === 'test' && !runner?.busy) renderPhase(true); else if (st.tab !== 'test') renderPanel(); },
    onHide() { if (runner?.busy && runner.state.phase !== 'analyzing') runner.abort(); },
    onEscape() { return runner?.busy ? runner.abort() : false; },
  };
}

export function scratchScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-scratch')) main.append(h('section', { class: 'screen', id: 'screen-scratch', hidden: true }));
  return [{ id: 'scratch', title: 'Scratch stress test', short: 'Scratch', icon: 'wave', feature: 'scratchTest', create: createScratchScreen }];
}
