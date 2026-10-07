// Results view: verdict first, then key readouts (± uncertainty, calibrated
// badge), findings with confidence/alternatives/isolation tests, then raw
// evidence plots and the full measurement table.

import { h, esc, formatNumber, formatDate } from './dom.js';
import { icon, chip } from './icons.js';
import { METRIC_INFO, metricStatus, verdictFor, SEV_STATUS } from './metrics.js';
import { linePlot, envelopePlot, scopePlot, eventMapPlot } from './plots.js';
import { showInspector } from './shell.js';
import { localRun } from './state.js';

const pct = v => `${Math.round((v ?? 0) * 100)}%`;
const unitText = u => (u === 'ratio' || u === 'code' || !u) ? '' : u;

export function uncertaintyText(m) {
  const u = m?.uncertainty;
  const value = typeof u === 'number' ? u : u?.expanded;
  if (!Number.isFinite(value)) return null;
  return `± ${formatNumber(value, { digits: value < .01 ? 4 : value < 1 ? 3 : 2 })}`;
}

function calBadge(m) {
  if (m.calibrated) return '<span class="badge badge-cal" title="Interface calibration applied">CAL</span>';
  if (!(m.qualityFlags || []).includes('uncalibrated')) return '';
  return '<span class="badge badge-uncal" title="No applicable calibration profile — default uncertainty components">UNCAL</span>';
}

/** Inspector content for one measurement. */
export function metricDetails(m, run) {
  const info = METRIC_INFO[m.metricId] || {};
  const status = metricStatus(m);
  const u = m.uncertainty && typeof m.uncertainty === 'object' ? m.uncertainty : null;
  const related = (run?.findings || []).filter(f => (f.supportedBy || []).includes(m.metricId) || (f.contradictedBy || []).includes(m.metricId));
  return h('div', { class: 'inspect', html: `
    <p class="inspect-id mono">${esc(m.metricId)}</p>
    <div class="inspect-value"><span class="num">${esc(formatNumber(m.value))}</span><span class="unit">${esc(unitText(m.unit))}</span></div>
    <div class="inspect-chips">${status ? chip(status) : ''} ${calBadge(m)}</div>
    <dl class="kv">
      ${info.target ? `<dt>Guide band</dt><dd>${esc(info.target)}</dd>` : ''}
      <dt>Uncertainty</dt><dd>${u ? `${esc(uncertaintyText(m))} ${esc(unitText(u.unit))} (k=${u.k}, ~95%)` : 'Not modelled for this metric'}</dd>
      ${m.rawValue != null ? `<dt>Raw (uncorrected)</dt><dd class="num">${esc(formatNumber(m.rawValue))}</dd>` : ''}
      <dt>Confidence</dt><dd>${pct(m.confidence)}</dd>
      <dt>Origin</dt><dd>${esc(m.origin || 'measured')}</dd>
      ${(m.qualityFlags || []).length ? `<dt>Flags</dt><dd>${m.qualityFlags.map(f => `<span class="tag">${esc(f)}</span>`).join(' ')}</dd>` : ''}
    </dl>
    ${info.why ? `<h3>Why it matters</h3><p>${esc(info.why)}</p>` : ''}
    ${info.fix ? `<h3>What to try</h3><p>${esc(info.fix)}</p>` : ''}
    ${u?.components ? `<h3>Uncertainty budget</h3><table class="mini"><tbody>${Object.entries(u.components).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td class="num">${esc(formatNumber(v, { digits: 4 }))}</td></tr>`).join('')}</tbody></table>` : ''}
    ${related.length ? `<h3>Linked findings</h3><ul class="plain">${related.map(f => `<li>${chip(SEV_STATUS[f.severity] || 'info', null, { size: 14 })} ${esc(f.title)} <span class="muted">(${(f.contradictedBy || []).includes(m.metricId) ? 'contradicts' : 'supports'})</span></li>`).join('')}</ul>` : ''}
    <p class="muted small">Guide bands are DeckChek heuristics for triage, not published standards.</p>` });
}

function readoutCard(m, run) {
  const status = metricStatus(m);
  const info = METRIC_INFO[m.metricId] || {};
  const u = uncertaintyText(m);
  const card = h('button', { type: 'button', class: `readout ${status ? `readout-${status}` : ''}`, 'data-metric': m.metricId, 'aria-label': `${m.label}: ${formatNumber(m.value)} ${unitText(m.unit)}${u ? ` ${u}` : ''}. ${status ? `Status ${status}.` : ''} Show details.` });
  card.innerHTML = `
    <span class="readout-label">${esc(m.label)}</span>
    <span class="readout-value"><span class="num">${esc(formatNumber(m.value))}</span><span class="unit">${esc(unitText(m.unit))}</span></span>
    <span class="readout-unc num">${u ? esc(u) : '± —'} ${calBadge(m)}</span>
    <span class="readout-foot">${status ? chip(status, null, { size: 14 }) : ''}<span class="readout-target">${info.target ? `${status ? 'target' : 'Guide:'} ${esc(info.target)}` : status ? '' : 'No guide band — see details'}</span></span>`;
  card.addEventListener('click', () => showInspector({ title: m.label, body: metricDetails(m, run) }));
  return card;
}

function findingCard(f, run, index) {
  const status = SEV_STATUS[f.severity] || 'info';
  const label = id => run.measurements.find(m => m.metricId === id)?.label || id;
  const links = (ids, kind) => (ids || []).map(id => `<button type="button" class="link-chip ${kind}" data-metric="${esc(id)}">${icon(kind === 'supports' ? 'check' : 'x', { size: 12 })}${esc(label(id))}</button>`).join('');
  const el = h('article', { class: `finding finding-${status}`, 'aria-labelledby': `finding-${run.id}-${index}` });
  el.innerHTML = `
    <header class="finding-head">${chip(status)}<h3 id="finding-${run.id}-${index}">${esc(f.title)}</h3>
      <span class="confidence" title="Confidence"><span class="conf-bar"><span style="width:${pct(f.confidence)}"></span></span><span class="num">${pct(f.confidence)}</span><span class="sr-only"> confidence</span></span></header>
    <p>${esc(f.detail)}</p>
    <div class="finding-grid">
      ${(f.alternatives || f.possibleCauses || []).length ? `<div><h4>Possible causes</h4><ul>${(f.alternatives || f.possibleCauses).map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
      ${(f.isolationTests || []).length ? `<div><h4>Isolation tests</h4><ol>${f.isolationTests.map(c => `<li>${esc(c)}</li>`).join('')}</ol></div>` : ''}
    </div>
    ${(f.supportedBy?.length || f.contradictedBy?.length) ? `<div class="evidence-links"><span class="muted small">Evidence</span>${links(f.supportedBy, 'supports')}${links(f.contradictedBy, 'contradicts')}</div>` : ''}`;
  el.querySelectorAll('[data-metric]').forEach(b => b.addEventListener('click', () => {
    const m = run.measurements.find(x => x.metricId === b.dataset.metric);
    if (m) showInspector({ title: m.label, body: metricDetails(m, run) });
  }));
  return el;
}

function evidenceSection(run) {
  const ev = run.evidence || localRun(run.id)?.evidence || {};
  const blocks = [];
  if (ev.speedTrace?.length) blocks.push(['Speed deviation over time', linePlot(ev.speedTrace, { title: 'Speed deviation', yLabel: 'deviation %', zeroLine: true, minSpan: .05 }), true]);
  if (ev.pitchPoints?.length) blocks.push(['Pitch map', linePlot(ev.pitchPoints.map(p => ({ t: p.position, v: p.measuredPercent })).sort((a, b) => a.t - b.t), { title: 'Pitch map', xLabel: 'control position %', yLabel: 'measured %', zeroLine: true, dots: true, minSpan: 1 }), true]);
  if (ev.trendPoints?.length) blocks.push(['Warm-up trend', linePlot(ev.trendPoints.sort((a, b) => a.t - b.t), { title: 'Warm-up speed error', xLabel: 'elapsed (min)', yLabel: 'error %', zeroLine: true, dots: true, minSpan: .05 }), true]);
  if (ev.levelTrace?.points?.length) blocks.push(['Signal envelope', linePlot(ev.levelTrace.points, { title: 'Normalized level', yLabel: 'level', marker: ev.levelTrace.markerSec, minSpan: 1 }), true]);
  if (ev.lissajous?.length) blocks.push(['Timecode scope', `<div class="scope-wrap">${scopePlot(ev.lissajous)}</div>`, true]);
  if (run.eventMap?.length || run.test === 'Vinyl side scan') {
    const prev = run.repeatScan ? localRun(run.repeatScan.previousId)?.eventMap : null;
    blocks.push(['Transient event map', eventMapPlot(run.eventMap || [], { previous: prev }), true]);
  }
  if (ev.envelope?.left?.length) blocks.push(['Signal overview', envelopePlot(ev.envelope), !blocks.length]);
  const section = h('section', { class: 'results-section', 'aria-labelledby': `ev-${run.id}` }, h('h2', { id: `ev-${run.id}`, class: 'section-title', text: 'Evidence' }));
  blocks.forEach(([title, markup, open], i) => {
    const det = h('details', { class: 'evidence', open: i === 0 && open ? true : null });
    det.append(h('summary', {}, h('span', { html: icon('chevronRight', { size: 16 }) }), h('span', { text: title })), h('div', { class: 'evidence-body', html: markup }));
    section.append(det);
  });
  const table = h('details', { class: 'evidence' });
  table.append(h('summary', {}, h('span', { html: icon('chevronRight', { size: 16 }) }), h('span', { text: `All measurements (${run.measurements.length})` })));
  const wrap = h('div', { class: 'table-wrap' });
  wrap.innerHTML = `<table class="data"><thead><tr><th scope="col">Metric</th><th scope="col" class="r">Value</th><th scope="col">Unit</th><th scope="col" class="r">± (k=2)</th><th scope="col">Cal.</th><th scope="col" class="r">Conf.</th><th scope="col">Origin</th></tr></thead><tbody>${run.measurements.map(m => `<tr data-metric="${esc(m.metricId)}" tabindex="0"><th scope="row"><span>${esc(m.label)}</span><span class="mono muted small">${esc(m.metricId)}</span></th><td class="r num">${esc(formatNumber(m.value))}</td><td>${esc(m.unit)}</td><td class="r num">${esc(uncertaintyText(m) || '—')}</td><td>${calBadge(m) || '—'}</td><td class="r num">${pct(m.confidence)}</td><td>${esc(m.origin || '')}</td></tr>`).join('')}</tbody></table>`;
  wrap.querySelectorAll('tr[data-metric]').forEach(tr => {
    const open = () => { const m = run.measurements.find(x => x.metricId === tr.dataset.metric); if (m) showInspector({ title: m.label, body: metricDetails(m, run) }); };
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  });
  table.append(wrap);
  section.append(table);
  return section;
}

/** Build the results view. actions: [{label, icon, primary, onClick, shortcut}] */
export function renderResults(run, { keyMetrics = [], actions = [] } = {}) {
  const verdict = verdictFor(run);
  const root = h('div', { class: 'results' });
  const cal = run.calibration;
  const verdictCard = h('section', { class: `verdict verdict-${verdict.status}`, 'aria-labelledby': `verdict-${run.id}`, tabindex: '-1' });
  verdictCard.innerHTML = `
    <div class="verdict-main">
      <div class="verdict-chip">${chip(verdict.status, null, { size: 20 })}</div>
      <div>
        <h2 id="verdict-${run.id}" class="verdict-headline">${esc(verdict.headline)}</h2>
        <p class="verdict-action"><strong>Recommended:</strong> ${esc(verdict.action)}</p>
        <p class="verdict-meta muted">${esc(run.device || 'Unassigned')} · ${esc(formatDate(run.createdAt))} · ${esc(run.sourceFile || '')} · ${esc(run.sampleRate)} Hz</p>
      </div>
    </div>
    <div class="verdict-side">
      <div class="score"><span class="score-num num">${esc(run.score ?? '—')}</span><span class="score-unit">/100</span></div>
      <span class="badge ${cal?.applied ? 'badge-cal' : 'badge-uncal'}">${cal?.applied ? 'CALIBRATED' : 'UNCALIBRATED'}</span>
    </div>`;
  if (!cal?.applied) verdictCard.append(h('p', { class: 'verdict-note small muted', text: `Readings use default uncertainty components (${(cal?.reasons || ['no profile']).join(', ')}). Run Calibration for corrected values and tighter ± bands.` }));
  root.append(verdictCard);

  if (actions.length) {
    const bar = h('div', { class: 'action-bar', role: 'toolbar', 'aria-label': 'Result actions' });
    actions.forEach(a => bar.append(h('button', { type: 'button', class: `btn ${a.primary ? 'btn-primary' : 'btn-secondary'}`, 'data-tooltip': a.shortcut ? `${a.label} (${a.shortcut})` : null, onclick: a.onClick, html: `${icon(a.icon, { size: 18 })}<span>${esc(a.label)}</span>${a.shortcut ? `<kbd>${esc(a.shortcut)}</kbd>` : ''}` })));
    root.append(bar);
  }

  const keys = keyMetrics.map(id => run.measurements.find(m => m.metricId === id)).filter(Boolean);
  const readouts = h('section', { class: 'results-section', 'aria-labelledby': `ro-${run.id}` }, h('h2', { id: `ro-${run.id}`, class: 'section-title', text: 'Key readings' }));
  const grid = h('div', { class: 'readouts' });
  (keys.length ? keys : run.measurements.slice(0, 6)).forEach(m => grid.append(readoutCard(m, run)));
  readouts.append(grid);
  root.append(readouts);

  const findings = h('section', { class: 'results-section', 'aria-labelledby': `fd-${run.id}` }, h('h2', { id: `fd-${run.id}`, class: 'section-title', text: `Findings (${verdict.findings.length})` }));
  if (!verdict.findings.length) findings.append(h('div', { class: 'empty-inline', html: `${icon('pass', { size: 20 })}<span>No findings. Every check stayed inside its guide band.</span>` }));
  verdict.findings.forEach((f, i) => findings.append(findingCard(f, run, i)));
  root.append(findings);

  if (run.quality) root.append(qualityPanel(run.quality));
  root.append(evidenceSection(run));
  return root;
}

/** Capture-quality counters (shown after a live capture). */
export function qualityPanel(q) {
  const items = [
    ['Frames captured', q.framesCaptured, q.framesCaptured > 0 ? 'pass' : 'fail'],
    ['Overrun samples', q.overrunSamples, q.overrunSamples ? 'warn' : 'pass'],
    ['Clipped L / R', `${q.clippedSamplesL ?? 0} / ${q.clippedSamplesR ?? 0}`, (q.clippedSamplesL || q.clippedSamplesR) ? 'fail' : 'pass'],
    ['Stream errors', q.streamErrors, q.streamErrors ? 'warn' : 'pass'],
    ['Callbacks', q.callbackCount, 'info'],
    ['Max callback gap', `${formatNumber(q.maxCallbackGapMs ?? 0, { digits: 1 })} ms`, (q.maxCallbackGapMs ?? 0) > 100 ? 'review' : 'pass'],
    ['Truncated', q.truncated ? 'Yes' : 'No', q.truncated ? 'review' : 'pass'],
  ];
  const el = h('section', { class: 'results-section quality', 'aria-label': 'Capture quality' });
  el.innerHTML = `<h2 class="section-title">Capture quality</h2><div class="quality-grid">${items.map(([k, v, s]) => `<div class="quality-item"><span class="muted small">${esc(k)}</span><span class="num quality-val">${esc(v ?? '—')}</span>${chip(s, null, { size: 12 })}</div>`).join('')}</div>
  ${(q.streamErrorMessages || []).length ? `<p class="small muted">Stream messages: ${esc(q.streamErrorMessages.join('; '))}</p>` : ''}`;
  return el;
}
