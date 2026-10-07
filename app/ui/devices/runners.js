// Device test runners for checklist, driver and software checks, plus the
// shared building blocks (step lists, readouts, findings) used by the
// timecode and MIDI runners. A runner renders into `host` and calls
// ctx.finish({status, detail, measurements, findings, extra}) when done.

import { h, esc, formatNumber } from '../dom.js';
import { icon, chip } from '../icons.js';
import { evaluateDriverCheck, evaluateSoftwareCheck } from '../../device-checks.js';
import { createSystemBridge } from '../../system-check.js';
import { evaluateOutcome, evaluateChecklist } from '../../devices/dispatch.js';

export const FINDING_STATUS = { error: 'fail', critical: 'fail', warning: 'warn', review: 'review', info: 'info', informational: 'info', ok: 'pass' };

/** Numbered steps + equipment card (the test's own instructions). */
export function stepsCard(test, { title = 'Steps', extra = [], showSteps = true } = {}) {
  const card = h('section', { class: 'card card-quiet dev-steps' });
  card.innerHTML = `<h2 class="card-title">${esc(title)}</h2>
    ${showSteps ? `<ol class="dev-steplist">${(test.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : '<p class="muted small">The checklist items are the steps for this test.</p>'}
    ${(test.equipment || []).length ? `<h3 class="dev-sub">You need</h3><ul class="checklist">${test.equipment.map(e => `<li>${icon('check', { size: 16 })}<span>${esc(e)}</span></li>`).join('')}</ul>` : ''}
    ${extra.length ? `<h3 class="dev-sub">Test settings</h3><dl class="kv">${extra.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
    ${test.why ? `<p class="hint">${icon('info', { size: 16 })}<span><strong>Why:</strong> ${esc(test.why)}</span></p>` : ''}
    ${passText(test) ? `<p class="hint">${icon('pass', { size: 16 })}<span><strong>Pass when:</strong> ${esc(passText(test))}</span></p>` : ''}`;
  return card;
}

const OP_TEXT = { 'abs<=': '|x| ≤', '<=': '≤', '>=': '≥', equals: '=', between: 'between', 'all-seen': 'all seen ≥' };
export function passText(test) {
  const p = test?.pass;
  if (!p) return '';
  const v = p.op === 'between' ? `${p.value} and ${p.value2}` : p.value;
  return `${p.metricId} ${OP_TEXT[p.op] || p.op} ${v}${p.unit && p.unit !== 'bool' ? ` ${p.unit}` : ''}${p.source ? ` — ${p.source}` : ''}`;
}

export function readoutGrid(measurements = []) {
  const grid = h('div', { class: 'readouts readouts-compact' });
  for (const m of measurements) {
    const v = m.unit === 'bool' ? (m.value == null ? '—' : m.value ? 'Yes' : 'No') : formatNumber(m.value, { digits: Number.isInteger(m.value) ? null : 2 });
    grid.append(h('div', { class: 'readout readout-static', 'data-metric': m.metricId, html: `<span class="readout-label">${esc(m.label || m.metricId)}</span><span class="readout-value"><span class="num">${esc(v)}</span><span class="unit">${esc(m.unit === 'bool' ? '' : m.unit || '')}</span></span>` }));
  }
  return grid;
}

export function findingList(findings = []) {
  const wrap = h('div', { class: 'dev-findings' });
  if (!findings.length) { wrap.append(h('div', { class: 'empty-inline', html: `${icon('pass', { size: 20 })}<span>No findings.</span>` })); return wrap; }
  for (const f of findings) {
    const st = FINDING_STATUS[f.severity] || 'info';
    const el = h('article', { class: `finding finding-${st === 'pass' ? 'ok' : st}`, 'data-id': f.id || '' });
    el.innerHTML = `<div class="finding-head">${chip(st)}<h3>${esc(f.title)}</h3></div>
      ${f.meaning ? `<div class="finding-grid"><div><h4>What this means</h4><p>${esc(f.meaning)}</p></div>${f.action ? `<div><h4>What to do</h4><p>${esc(f.action)}</p></div>` : ''}</div>` : ''}
      ${(f.evidence || []).length ? `<p class="small muted mono">${f.evidence.map(esc).join('<br>')}</p>` : ''}`;
    wrap.append(el);
  }
  return wrap;
}

function layout(host, test, main, { extra = [], showSteps = true } = {}) {
  host.replaceChildren(h('div', { class: 'dev-run-grid' }, h('div', { class: 'dev-run-main' }, ...main), h('aside', { class: 'dev-run-side', 'aria-label': 'Test instructions' }, stepsCard(test, { extra, title: showSteps ? 'Steps' : 'About this check', showSteps }))));
}

// ---------- manual:inspection ----------
const ANSWERS = [['ok', 'OK', 'pass'], ['problem', 'Problem', 'fail'], ['na', 'N/A', 'info']];

export function runManual(host, ctx) {
  const { test } = ctx;
  const answers = new Array(test.steps.length).fill(null);
  const card = h('section', { class: 'card', 'aria-labelledby': 'dev-check-title' });
  card.append(h('h2', { class: 'card-title', id: 'dev-check-title', text: 'Inspection checklist' }), h('p', { class: 'muted small', text: 'Check each item on the unit and mark it OK, Problem or N/A (not applicable). Add notes for anything you find.' }));
  const list = h('ol', { class: 'dev-checklist', role: 'list' });
  test.steps.forEach((step, i) => {
    const group = h('div', { class: 'segmented dev-answer', role: 'radiogroup', 'aria-label': `Item ${i + 1}: ${step}` });
    ANSWERS.forEach(([val, label, st]) => {
      const b = h('button', { type: 'button', role: 'radio', class: `seg seg-${st}`, 'aria-checked': 'false', 'data-answer': val, tabindex: val === 'ok' ? '0' : '-1', text: label });
      b.addEventListener('click', () => { answers[i] = val; group.querySelectorAll('[role=radio]').forEach(x => { const on = x === b; x.setAttribute('aria-checked', String(on)); x.tabIndex = on ? 0 : -1; }); li.dataset.answer = val; update(); });
      group.append(b);
    });
    group.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const btns = [...group.querySelectorAll('[role=radio]')], cur = btns.indexOf(document.activeElement);
      const next = btns[(cur + (e.key === 'ArrowLeft' ? btns.length - 1 : 1)) % btns.length];
      next.focus(); next.click();
    });
    const li = h('li', { class: 'dev-check-item' }, h('span', { class: 'dev-check-num num', text: String(i + 1) }), h('span', { class: 'dev-check-text', text: step }), group);
    list.append(li);
  });
  const notesId = `dev-notes-${test.id}`;
  const notes = h('textarea', { id: notesId, rows: 3, placeholder: 'What did you find? (optional)' });
  const notesField = h('label', { class: 'field dev-notes', for: notesId }, h('span', { class: 'field-label', text: 'Notes' }), notes);
  const status = h('p', { class: 'muted small', role: 'status' });
  const save = h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'dev-check-save', disabled: true, html: `${icon('check', { size: 20 })}<span>Save result</span>` });
  function update() {
    const r = evaluateChecklist(test.steps, answers);
    save.disabled = r.status == null;
    status.textContent = r.status == null ? r.detail : `Result: ${r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'SKIPPED'} — ${r.detail}`;
  }
  save.addEventListener('click', () => {
    const r = evaluateChecklist(test.steps, answers);
    const findings = r.problems.map(p => ({ id: `check-${p.i + 1}`, severity: 'warning', title: `Problem: ${p.step}`, meaning: 'Marked as a problem during inspection.', action: notes.value.trim() || 'Inspect, clean or service this part.' }));
    ctx.finish({ status: r.status, detail: r.detail, findings, extra: { checklist: test.steps.map((s, i) => ({ item: s, answer: answers[i] })), notes: notes.value.trim() || null } });
  });
  update();
  card.append(list, notesField, h('div', { class: 'step-footer' }, status, save));
  layout(host, test, [card], { showSteps: false });
}

// ---------- driver:check / software:check ----------
function scanRunner(host, ctx, { kind }) {
  const { test, profile } = ctx;
  const bridge = ctx.systemBridge || createSystemBridge();
  const available = bridge.isAvailable();
  const card = h('section', { class: 'card', 'aria-labelledby': 'dev-scan-title' });
  const label = kind === 'driver' ? 'Windows driver scan' : `${test.params?.software || test.software || profile.software?.[0]?.name || 'DJ software'} log scan`;
  card.innerHTML = `<div class="card-head"><h2 class="card-title" id="dev-scan-title">${esc(label)}</h2></div>
    <p class="muted">${kind === 'driver'
      ? `Matches Device Manager and ASIO entries against ${esc((profile.drivers || []).flatMap(d => d.deviceNamePatterns || []).map(p => `“${p}”`).join(', ') || 'the profile')}.`
      : 'Looks for the program, crash dumps and error lines in its logs from the last 90 days.'}</p>`;
  const out = h('div', { class: 'dev-scan-out', 'aria-live': 'polite' });
  const run = h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'dev-scan-run', html: `${icon('search', { size: 20 })}<span>${kind === 'driver' ? 'Run driver scan' : 'Run log scan'}</span>` });
  const skip = h('button', { type: 'button', class: 'btn btn-secondary', text: 'Skip test', onclick: () => ctx.skip('Scan not available on this computer.') });
  if (!available) out.append(h('div', { class: 'banner banner-warn', role: 'status', html: `${chip('warn', 'DESKTOP APP')}<div class="banner-text"><strong>System scans run in the DeckChek Windows app</strong><span>This browser preview cannot read Device Manager or log folders. Run the test in the desktop app, or skip it for now.</span></div>` }));
  run.disabled = !available;
  run.addEventListener('click', async () => {
    run.disabled = true; run.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Scanning…</span>';
    try {
      const scan = kind === 'driver' ? await bridge.scanDrivers() : await bridge.scanDjLogs();
      const res = kind === 'driver' ? evaluateDriverCheck(profile, scan) : evaluateSoftwareCheck(profile, test.params?.software || test.software, scan);
      if (scan?.supported === false) {
        out.replaceChildren(findingList(res.findings));
        run.disabled = false; run.innerHTML = `${icon('refresh', { size: 20 })}<span>Scan again</span>`;
        return;
      }
      const outcome = evaluateOutcome(test, { measurements: res.measurements, findings: res.findings });
      out.replaceChildren(h('h3', { class: 'section-title', text: 'Readings' }), readoutGrid(res.measurements), h('h3', { class: 'section-title', text: 'Findings' }), findingList(res.findings));
      ctx.finish({ status: outcome.status, detail: outcome.detail, criterion: outcome.criterion, measurements: res.measurements, findings: res.findings, extra: { scannedAt: scan?.scannedAt || null } });
    } catch (error) {
      out.replaceChildren(h('div', { class: 'banner banner-fail', role: 'alert', html: `${chip('fail')}<div class="banner-text"><strong>Scan failed</strong><span>${esc(error?.message || error)}</span></div>` }));
      run.disabled = false; run.innerHTML = `${icon('refresh', { size: 20 })}<span>Try again</span>`;
    }
  });
  card.append(out, h('div', { class: 'step-footer' }, h('span', { class: 'muted small', text: available ? 'The result is saved to this unit as soon as the scan finishes.' : 'Nothing is saved until a scan runs.' }), skip, run));
  layout(host, test, [card]);
}

export const runDriver = (host, ctx) => scanRunner(host, ctx, { kind: 'driver' });
export const runSoftware = (host, ctx) => scanRunner(host, ctx, { kind: 'software' });
