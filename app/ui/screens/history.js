// History: saved runs (listRuns/getRun), run detail with measurements and
// hypotheses (support/contradiction links), report re-export, A/B compare,
// workspace JSON import/export.

import { h, esc, formatNumber, formatDate, pickFile } from '../dom.js';
import { icon, chip } from '../icons.js';
import { store, localRun, on, active } from '../state.js';
import { verdictFor, metricLabel } from '../metrics.js';
import { saveRunAsBaseline, exportRunHtml, exportRunCsv, exportRunJson, compareTwo, exportComparisonHtml, exportWorkspace, importWorkspace } from '../persistence.js';
import { renderResults } from '../results.js';
import { WORKFLOWS } from '../workflows/definitions.js';
import { toast, announce } from '../live.js';
import { go } from '../shell.js';
import { describeMediaRef, decodeChoice, PARAM_ID } from '../media-picker.js';

const keyMetricsFor = test => WORKFLOWS.flatMap(w => w.key[test] || []);

/** Normalize native get_run output or fallback output into a run-like record. */
function normalizeRun(raw, summary) {
  if (!raw) return null;
  const local = localRun(raw.id);
  if (local) return local; // full record incl. evidence and labels
    const measurements = (raw.measurements || []).map(m => ({
    metricId: m.metricId, label: m.label && m.label !== m.metricId ? m.label : metricLabel(m.metricId), value: m.value ?? m.text, unit: m.unit || '', origin: m.origin,
    confidence: m.confidence, uncertainty: m.uncertainty, qualityFlags: m.qualityFlags || [], calibrated: (m.qualityFlags || []).includes('calibrated'),
  }));
  const stripRun = id => String(id).replace(`${raw.id}:`, '');
  const findings = (raw.hypotheses || []).map(f => {
    const supports = f.supportedBy || (f.support || []).flatMap(s => (s.measurementIds || []).map(stripRun));
    const contradicts = f.contradictedBy || (f.contradictions || []).flatMap(s => (s.measurementIds || []).map(stripRun));
    const [title, ...rest] = String(f.title ?? f.summary ?? '').split(': ');
    return {
      code: f.code || f.key, title: f.title || title, detail: f.detail ?? rest.join(': '), severity: f.severity === 'info' ? 'informational' : f.severity,
      confidence: f.confidence, possibleCauses: f.possibleCauses || f.alternatives || [], alternatives: f.alternatives || f.possibleCauses || [],
      isolationTests: f.isolationTests || [], supportedBy: supports, contradictedBy: contradicts, status: f.status,
    };
  });
  const cfg = raw.config || {};
  return {
    id: raw.id, test: raw.test || summary?.test || cfg.test || 'Diagnostic', createdAt: raw.startedAt || raw.createdAt || summary?.startedAt,
    score: raw.score ?? summary?.score ?? null, measurements, findings, device: cfg.deviceId || raw.device || '—',
    sourceFile: cfg.sourceFile || raw.sourceFile, sampleRate: cfg.sampleRate || raw.sampleRate, channels: cfg.channels || raw.channels,
    calibration: { applied: measurements.some(m => m.calibrated), reasons: ['see measurement flags'] }, evidence: {}, eventMap: [],
  };
}

export function createHistoryScreen(section) {
  const state = { runs: [], filter: '', selected: null, compare: new Set(), view: 'detail' };
  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('history', { size: 24 })}</span><div><h1 tabindex="-1">History</h1>
      <p class="lede">Every saved run with its measurements and hypotheses. Re-export reports or compare two runs side by side.</p></div></div>
      <div class="head-actions"><button type="button" class="btn btn-secondary" id="ws-import">${icon('upload', { size: 18 })}<span>Import workspace</span></button><button type="button" class="btn btn-secondary" id="ws-export">${icon('download', { size: 18 })}<span>Export workspace</span></button></div></header>
    <div class="hist-layout">
      <section class="card hist-list" aria-labelledby="hist-runs">
        <div class="card-head"><h2 id="hist-runs" class="card-title">Runs</h2><span class="muted small" id="hist-count"></span></div>
        <div class="toolbar"><search class="search"><label for="hist-search" class="sr-only">Filter runs</label>${icon('search', { size: 18 })}<input id="hist-search" type="search" placeholder="Filter by test, device or finding…" autocomplete="off"></search></div>
        <div class="compare-bar" id="compare-bar" aria-live="polite"></div>
        <div id="hist-rows"></div>
      </section>
      <section class="hist-detail" id="hist-detail" aria-live="polite" aria-label="Run detail"></section>
    </div>`;
  const $ = s => section.querySelector(s);

  async function load() {
    try { state.runs = await store.listRuns(200); }
    catch (error) { state.runs = []; toast(`Could not load history: ${error?.message || error}`, { type: 'error', action: { label: 'Retry', run: load } }); }
    renderList();
    const focus = active.historyFocus; active.historyFocus = null;
    if (focus) openRun(focus);
    else if (!state.selected) renderDetailEmpty();
  }

  function renderList() {
    const q = state.filter.trim().toLowerCase();
    const rows = state.runs.filter(r => {
      if (!q) return true;
      const l = localRun(r.id);
      return `${r.test} ${r.sessionType} ${l?.device || ''} ${(l?.findings || []).map(f => f.title).join(' ')}`.toLowerCase().includes(q);
    });
    $('#hist-count').textContent = `${rows.length} of ${state.runs.length}`;
    renderCompareBar();
    const host = $('#hist-rows');
    if (!state.runs.length) {
      host.innerHTML = `<div class="empty">${icon('history', { size: 48 })}<h2>No saved runs yet</h2><p>Run Quick Check or any workflow — every analysis is saved here automatically.</p><button type="button" class="btn btn-primary" data-go>${icon('quick', { size: 18 })}<span>Run Quick Check</span></button></div>`;
      host.querySelector('[data-go]').addEventListener('click', () => go('quick'));
      return;
    }
    if (!rows.length) { host.innerHTML = `<div class="empty empty-sm">${icon('search', { size: 32 })}<p>No runs match “${esc(state.filter)}”.</p></div>`; return; }
    const list = h('ul', { class: 'run-list', role: 'list' });
    rows.forEach(r => {
      const l = localRun(r.id);
      const v = l ? verdictFor(l) : { status: r.score == null ? 'info' : r.score >= 85 ? 'pass' : r.score >= 70 ? 'review' : r.score >= 50 ? 'warn' : 'fail' };
      const li = h('li', { class: `run ${state.selected?.id === r.id ? 'selected' : ''}` });
      const cb = h('input', { type: 'checkbox', class: 'run-check', 'aria-label': `Select ${r.test} ${formatDate(r.startedAt)} for comparison`, checked: state.compare.has(r.id) ? true : null });
      cb.addEventListener('change', () => toggleCompare(r.id, cb));
      const open = h('button', { type: 'button', class: 'run-main', 'aria-current': state.selected?.id === r.id ? 'true' : null });
      open.innerHTML = `<span class="run-top">${chip(v.status, null, { size: 14 })}<strong>${esc(r.test || r.sessionType)}</strong><span class="run-score num">${r.score == null ? '—' : esc(Math.round(r.score))}</span></span>
        <span class="muted small">${esc(formatDate(r.startedAt))}${l?.device ? ` · ${esc(l.device)}` : ''} · ${esc(r.measurementCount)} measurements · ${esc(r.hypothesisCount)} findings</span>`;
      open.addEventListener('click', () => openRun(r.id));
      li.append(cb, open);
      list.append(li);
    });
    host.replaceChildren(list);
  }

  function toggleCompare(id, cb) {
    if (cb.checked) {
      if (state.compare.size >= 2) { const first = [...state.compare][0]; state.compare.delete(first); }
      state.compare.add(id);
    } else state.compare.delete(id);
    renderList();
  }

  function renderCompareBar() {
    const bar = $('#compare-bar'), n = state.compare.size;
    bar.replaceChildren();
    if (!n) { bar.innerHTML = `<span class="muted small">${icon('compare', { size: 16 })} Tick two runs to compare them (A/B).</span>`; return; }
    const btn = h('button', { type: 'button', class: 'btn btn-primary btn-sm', disabled: n < 2 ? true : null, html: `${icon('compare', { size: 16 })}<span>Compare ${n}/2</span>` });
    btn.addEventListener('click', compare);
    const clear = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Clear', onclick: () => { state.compare.clear(); renderList(); } });
    bar.append(h('span', { class: 'small', text: n < 2 ? 'Select one more run.' : 'Ready to compare.' }), clear, btn);
  }

  async function fetchRun(id) {
    const summary = state.runs.find(r => r.id === id);
    const local = localRun(id);
    if (local) return local;
    const run = normalizeRun(await store.getRun(id), summary);
    if (run && run.device && run.device !== '—') {
      try {
        const assets = await store.list('asset');
        const a = assets.find(x => x.id === run.device);
        if (a) run.device = a.nickname || a.name || run.device;
      } catch { /* keep id */ }
    }
    return run;
  }

  async function openRun(id) {
    try {
      const run = await fetchRun(id);
      if (!run) { toast('That run could not be found.', { type: 'warn' }); return; }
      state.selected = run; state.view = 'detail';
      renderList(); renderDetail(run);
    } catch (error) { toast(`Could not open run: ${error?.message || error}`, { type: 'error' }); }
  }

  function renderDetailEmpty() {
    $('#hist-detail').innerHTML = `<div class="card"><div class="empty">${icon('file', { size: 48 })}<h2>Select a run</h2><p>Pick a run on the left to see its verdict, readings, hypotheses and evidence links.</p></div></div>`;
  }

  function renderDetail(run) {
    const host = $('#hist-detail');
    const view = renderResults(run, {
      keyMetrics: keyMetricsFor(run.test),
      actions: [
        { label: 'Export report', icon: 'download', primary: true, shortcut: 'Ctrl+E', onClick: () => exportRunHtml(run) },
        { label: 'CSV', icon: 'download', onClick: () => exportRunCsv(run) },
        { label: 'JSON', icon: 'download', onClick: () => exportRunJson(run) },
      ],
    });
    host.replaceChildren(view);
    showTestMedium(run, view);
    announce(`Showing ${run.test} from ${formatDate(run.createdAt)}`);
  }

  /** FS-06 AC-6: the test medium used, from the saved device result (by session) or the run's own form values. */
  async function showTestMedium(run, view) {
    try {
      let ref = null;
      const fromResult = (await store.listDeviceTestResults(null)).find(r => r.sessionId === run.id && r.mediaId);
      if (fromResult) ref = { mediaId: fromResult.mediaId, mediaTrackKey: fromResult.mediaTrackKey };
      else { const c = decodeChoice(run.params?.[PARAM_ID]); if (c.mediaId) ref = { mediaId: c.mediaId, mediaTrackKey: c.trackKey }; }
      const text = await describeMediaRef(ref);
      if (!text || state.selected !== run) return;
      view.prepend(h('p', { class: 'hist-medium small', 'data-test-medium': '', text: `Test medium: ${text}` }));
    } catch { /* optional detail */ }
  }

  async function compare() {
    const [aId, bId] = [...state.compare];
    try {
      const [a, b] = await Promise.all([fetchRun(aId), fetchRun(bId)]);
      const [older, newer] = String(a.createdAt) <= String(b.createdAt) ? [a, b] : [b, a];
      const deltas = compareTwo(older, newer);
      state.view = 'compare';
      const host = $('#hist-detail');
      const card = h('section', { class: 'card compare', 'aria-labelledby': 'cmp-title' });
      const va = verdictFor(older), vb = verdictFor(newer);
      card.innerHTML = `<div class="card-head"><h2 id="cmp-title" class="card-title">A/B comparison</h2><span class="muted small">Δ = B − A · identical metric ids and units only</span></div>
        <div class="ab-heads">${[['A', older, va], ['B', newer, vb]].map(([tag, r, v]) => `<div class="ab"><span class="ab-tag">${tag}</span><div class="ab-text"><strong>${esc(r.test)}</strong><span class="muted small">${esc(formatDate(r.createdAt))}</span><span class="muted small">${esc(r.device || 'Unassigned')}</span></div><div class="ab-side"><span class="num ab-score">${esc(r.score ?? '—')}</span>${chip(v.status, null, { size: 12 })}</div></div>`).join('')}</div>
        ${deltas.length ? `<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Metric</th><th scope="col" class="r">A</th><th scope="col" class="r">B</th><th scope="col" class="r">Δ</th><th scope="col">Unit</th></tr></thead><tbody>
        ${deltas.map(d => `<tr><th scope="row">${esc(d.label || d.metricId)}</th><td class="r num">${esc(formatNumber(d.a))}</td><td class="r num">${esc(formatNumber(d.b))}</td><td class="r num delta ${d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : ''}">${d.delta > 0 ? '+' : ''}${esc(formatNumber(d.delta))}</td><td>${esc(d.unit)}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty empty-sm">${icon('compare', { size: 32 })}<p>These runs share no numeric metrics with the same id and unit.</p></div>`}`;
      const actions = h('div', { class: 'action-bar' },
        h('button', { type: 'button', class: 'btn btn-primary', disabled: deltas.length ? null : true, html: `${icon('download', { size: 18 })}<span>Export comparison</span>`, onclick: () => exportComparisonHtml(older, newer) }),
        h('button', { type: 'button', class: 'btn btn-secondary', text: 'Back to run', onclick: () => state.selected ? renderDetail(state.selected) : renderDetailEmpty() }));
      card.append(actions);
      host.replaceChildren(card);
      card.querySelector('h2').setAttribute('tabindex', '-1');
      card.querySelector('h2').focus();
    } catch (error) { toast(`Comparison failed: ${error?.message || error}`, { type: 'error' }); }
  }

  $('#hist-search').addEventListener('input', e => { state.filter = e.target.value; renderList(); });
  $('#ws-export').addEventListener('click', () => { exportWorkspace(); toast('Workspace exported.', { type: 'success' }); });
  $('#ws-import').addEventListener('click', async () => {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    try { const d = await importWorkspace(file); toast(`Imported ${d.runs.length} run(s).`, { type: 'success' }); load(); }
    catch (error) { toast(`Import failed: ${error?.message || error}`, { type: 'error' }); }
  });
  on('history', () => { if (!section.hidden) load(); });

  return {
    onShow: () => {
      load();
      document.getElementById('inspector-title').textContent = 'About history';
      document.getElementById('inspector-body').innerHTML = `<div class="inspect"><p>Runs are saved automatically after analysis${store.native ? ' to the local DeckChek database' : ' in this browser'}.</p><h3>Evidence links</h3><p>Each finding lists the measurements that <strong>support</strong> it and any that <strong>contradict</strong> it. Select one to inspect it.</p><h3>A/B compare</h3><p>Tick two runs. Only metrics with identical ids and units are compared.</p></div>`;
    },
    onSave: () => { saveRunAsBaseline(state.selected); },
    onExport: () => state.selected ? exportRunHtml(state.selected) : toast('Select a run first — then Ctrl+E exports its report.'),
    onEscape: () => { if (state.compare.size) { state.compare.clear(); renderList(); return true; } return false; },
  };
}

