// Pre-gig result as a printable PDF report (FS-03 kind "pregig"). No DOM: report-pdf.js turns the HTML into a PDF
// through WebView2, or into a print dialog in the browser. Every string is escaped with ctx.esc, and every status is
// printed as a word (Pass, Warning, Fail, ...) so a black-and-white print reads the same as the screen.

import { describeStep, verdictView, evidenceRows, durationText, fixButtons } from './pregig.js';

export const PREGIG_KIND = 'pregig';
const pad = n => String(n).padStart(2, '0');
const when = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const PROBLEM = new Set(['fail', 'error', 'warn']);
const ORDER = { fail: 0, error: 1, warn: 2 };

/** The data object exportPdf('pregig', data) takes, from a finished run of the pre-gig controller. */
export function pregigPrintData(run, { device = '' } = {}) {
  const v = verdictView(run);
  return {
    presetName: run.presetName || '', device, startedAt: run.startedAt || '', durationMs: run.durationMs ?? null, manualMs: run.manualMs ?? 0,
    verdict: run.verdict || v.verdict, title: v.title, copy: v.copy, notices: v.notices,
    results: (run.results || []).map(({ stepId, label, state, reason, required, summary, evidence, fix }) => ({ stepId, label, state, reason, required, summary, evidence, fix })),
  };
}

const wordOf = r => describeStep({ state: r.state, result: r }).word;

export const pregigPrintable = Object.freeze({
  fileKind: 'PreGig',
  title: d => (d?.presetName ? `Pre-gig check: ${d.presetName}` : 'Pre-gig check'),
  device: d => d?.device || 'Whole rig',
  summary: d => [
    ['Result', d?.title || d?.verdict],
    ['Started', d?.startedAt ? when(d.startedAt) : null],
    ['Took', Number.isFinite(d?.durationMs) ? durationText(d.durationMs) : null],
    ['Checks', `${(d?.results || []).length} (${(d?.results || []).filter(r => PROBLEM.has(r.state)).length} with problems)`],
  ],
  build: (d = {}, { esc }) => {
    const results = d.results || [];
    const problems = results.filter(r => PROBLEM.has(r.state)).sort((a, b) => ORDER[a.state] - ORDER[b.state]);
    const head = `<h2>${esc(d.title || 'Pre-gig check')}</h2><p>${esc(d.copy || '')}</p>${(d.notices || []).map(n => `<p class="dc-note">${esc(n)}</p>`).join('')}`;
    const fixes = problems.length
      ? `<h2>${problems.length === 1 ? 'Fix this first' : `Fix these ${problems.length}, in this order`}</h2><ol>${problems.map(r => {
        const buttons = fixButtons(r).filter(b => b.text);
        return `<li><strong>${esc(r.label)}</strong> (${esc(wordOf(r))}): ${esc(r.summary)}${buttons.length ? `<ul>${buttons.map(b => `<li>${esc(b.label)}: ${esc(b.text)}</li>`).join('')}</ul>` : ''}</li>`;
      }).join('')}</ol>`
      : '<h2>Nothing to fix</h2><p>No check reported a problem.</p>';
    const table = `<h2>All checks</h2><table><thead><tr><th>Check</th><th>Result</th><th>What was found</th></tr></thead><tbody>${results.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(wordOf(r))}</td><td>${esc(r.summary)}</td></tr>`).join('')}</tbody></table>`;
    const detail = results.map(r => ({ r, rows: evidenceRows(r.evidence) })).filter(x => x.rows.length)
      .map(({ r, rows }) => `<h3>${esc(r.label)}</h3><table><tbody>${rows.map(x => `<tr><th>${esc(x.label)}</th><td>${esc(x.value)}</td></tr>`).join('')}</tbody></table>`).join('');
    return `${head}${fixes}${table}${detail ? `<h2>Measurements</h2>${detail}` : ''}`;
  },
});

let registered = false;
/** Registers the "pregig" printable kind once (idempotent). Resolves to the report-pdf module. */
export async function ensurePregigPrintable() {
  const mod = await import('../../report-pdf.js');
  if (!registered && !mod.getPrintableKind(PREGIG_KIND)) mod.registerPrintableKind(PREGIG_KIND, pregigPrintable);
  registered = true;
  return mod;
}
