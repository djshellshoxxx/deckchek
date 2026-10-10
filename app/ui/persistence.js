// Run persistence (local working set + catalog-store / SQLite), repeat-scan
// alignment, report exports and workspace import/export.

import { buildHtmlReport, compareRuns, normalizeMeasurement } from '../core.js';
import { measurementsToCsv, parseWorkspaceJson, serializeWorkspaceJson } from '../export.js';
import { store, workspace, saveWorkspace, emit, settings } from './state.js';
import { isEnabled } from '../features.js';
import { download, slug, isNative } from './dom.js';
import { toast } from './live.js';

/** Shape a run for save_diagnostic_run (numeric uncertainty, finite values only). */
export function toPersistRun(run) {
  const measurements = (run.measurements || []).filter(m => typeof m.value === 'number' && Number.isFinite(m.value)).map(m => ({
    metricId: m.metricId, label: m.label ?? null, value: m.value, unit: m.unit ?? '', origin: m.origin || 'measured',
    confidence: Number.isFinite(m.confidence) ? m.confidence : null,
    uncertainty: typeof m.uncertainty === 'number' ? m.uncertainty : Number.isFinite(m.uncertainty?.expanded) ? m.uncertainty.expanded : null,
    qualityFlags: m.qualityFlags || [],
  }));
  const findings = (run.findings || []).map(f => ({
    code: f.code, title: f.title, detail: f.detail || '', severity: f.severity || 'review',
    confidence: Number.isFinite(f.confidence) ? f.confidence : null,
    possibleCauses: f.possibleCauses || [], isolationTests: f.isolationTests || [], alternatives: f.alternatives || f.possibleCauses || [],
    supportedBy: f.supportedBy || [], contradictedBy: f.contradictedBy || [],
  }));
  return {
    id: run.id, deviceId: run.deviceId ?? null, test: run.test, createdAt: run.createdAt, sourceFile: run.sourceFile ?? null,
    sampleRate: run.sampleRate ?? null, channels: run.channels ?? null, measurements, findings,
    score: Number.isFinite(run.score) ? run.score : null, sessionType: run.sessionType || run.workflow || 'diagnostic', workflow: run.workflow || null,
  };
}

/** Save locally first (autosave), then to the catalog store. Returns {native, error}. */
export async function persistRun(run) {
  workspace.runs = [run, ...workspace.runs.filter(r => r.id !== run.id)];
  saveWorkspace();
  try {
    await store.saveRun(toPersistRun(run));
    emit('history');
    return { ok: true };
  } catch (error) {
    emit('history');
    return { ok: false, error: String(error?.message || error) };
  }
}

/** Ctrl+S: confirm the run is saved and mark it as the baseline for its test (one baseline per test). */
export async function saveRunAsBaseline(run) {
  if (!run) { toast('Nothing to save yet — run an analysis first.', { type: 'info' }); return false; }
  for (const r of workspace.runs) if (r.id !== run.id && r.test === run.test && r.baseline) delete r.baseline;
  run.baseline = true;
  const res = await persistRun(run);
  toast(res.ok ? `Saved. This ${run.test} run is now your baseline.` : `Saved locally as baseline; database save failed: ${res.error}`, { type: res.ok ? 'success' : 'warn' });
  return res.ok;
}

/** Record a repeat-scan alignment between this vinyl scan and the previous one. */
export async function saveRepeatScanAlignment(run) {
  const rs = run.repeatScan;
  if (!rs) return null;
  const confidence = Math.max(0, Math.min(1, rs.persistent / Math.max(1, Math.min(rs.beforeCount, rs.afterCount)) || 0));
  const scan = (id, samples, score) => ({
    sessionId: id, recordTitle: run.params?.recordTitle || 'Untitled record', sideLabel: run.params?.sideLabel || 'A',
    startSample: 0, endSample: Math.max(1, Math.round(samples || 1)), conditionScore: Number.isFinite(score) ? score : null,
  });
  const score = run.measurements.find(m => m.metricId === 'vinyl_condition_score')?.value;
  return store.saveScanAlignment({
    scanA: scan(rs.previousId, rs.previousSamples, rs.previousScore), scanB: scan(run.id, run.totalSamples, score),
    method: 'normalized_event_map_v1', offsetSamples: 0, confidence,
    counts: { persistent: rs.persistent, new: rs.newEvents, missing: rs.resolved },
  });
}

// ---------- reports ----------
function reportNotes(run) {
  const cal = run.calibration;
  const calText = cal?.applied ? `Calibrated with profile from ${cal.profileCreatedAt}.` : `Uncalibrated (${(cal?.reasons || ['no profile']).join(', ')}).`;
  return `Source: ${run.sourceFile || 'unknown'}; ${run.sampleRate || '—'} Hz; ${run.channels || '—'} channel(s). ${calText} Uncertainty values are expanded (k=2).`;
}
function reportMeasurements(run) {
  return (run.measurements || []).map(m => ({ ...m, label: m.label || m.metricId, uncertainty: typeof m.uncertainty === 'object' && m.uncertainty ? m.uncertainty.expanded : m.uncertainty }));
}
export function exportRunHtml(run) {
  const html = buildHtmlReport({ title: `DeckChek — ${run.test}`, device: run.device || '', createdAt: run.createdAt, measurements: reportMeasurements(run), findings: run.findings || [], notes: reportNotes(run) });
  download(`deckchek-${slug(run.test)}-${run.id}.html`, html, 'text/html');
}
// ---------- PDF (FS-03) ----------
/** Export PDF is offered only while features.pdfExport is on. */
export const pdfExportEnabled = () => isEnabled('pdfExport');

const PDF_LABEL = { run: 'Report', device: 'Device report', systemHealth: 'System Health report' };

/**
 * Exports a PDF through report-pdf.js with progress and error feedback. The native save dialog
 * and the print-dialog fallback are handled there; this only reports the outcome.
 * `htmlFallback` (optional) is offered on a failure as "Export HTML instead".
 * Never throws. Returns the exportPdf result, or {error} / {busy:true}.
 */
export async function exportPdfWithFeedback(kind, data, { htmlFallback = null, button = null } = {}) {
  const label = PDF_LABEL[kind] || 'Report';
  if (!pdfExportEnabled()) return { disabled: true };
  if (button?.disabled) return { busy: true };
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  const endProgress = toast(`Creating PDF… ${label.toLowerCase()}`, { type: 'info', timeout: 0 });
  try {
    const { exportPdf, readPdfSettings } = await import('../report-pdf.js');
    const res = await exportPdf(kind, data, readPdfSettings(settings));
    endProgress();
    if (res.cancelled) return res;
    if (res.fallback) {
      toast(res.reason === 'error' ? `Couldn't create the PDF directly (${res.error?.message || 'unknown error'}). The print dialog is open: choose “Save as PDF”.` : 'The print dialog is open: choose “Save as PDF” to create the PDF.', { type: res.reason === 'error' ? 'warn' : 'info', timeout: 8000 });
    } else {
      toast(`${label} saved as PDF${res.pages ? ` · ${res.pages} page${res.pages === 1 ? '' : 's'}` : ''}.`, { type: 'success', timeout: 5000 });
    }
    if (res.warnings?.length) toast(res.warnings.map(w => w.message).join(' '), { type: 'warn', timeout: 8000 });
    return res;
  } catch (error) {
    endProgress();
    const message = error?.code === 'busy' ? 'A PDF is already being created. Wait for it to finish.'
      : `The PDF could not be created: ${error?.message || error}${error?.retryable ? ' You can try again.' : ''}`;
    toast(message, { type: 'error', ...(htmlFallback ? { action: { label: 'Export HTML instead', run: htmlFallback } } : {}) });
    return { error };
  } finally {
    if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
  }
}

function runPdfData(run) {
  const score = Number.isFinite(run.score) ? run.score : run.measurements?.find(m => m.metricId === 'score')?.value;
  return {
    title: `DeckChek — ${run.test}`, device: run.device || '', createdAt: run.createdAt, measurements: reportMeasurements(run),
    findings: run.findings || [], notes: reportNotes(run), ...(Number.isFinite(score) ? { score } : {}),
  };
}
export function exportRunPdf(run, opts = {}) {
  return exportPdfWithFeedback('run', runPdfData(run), { htmlFallback: () => exportRunHtml(run), ...opts });
}
/** Result-panel action for a run, or [] while the flag is off. */
export function runPdfActions(run) {
  return pdfExportEnabled() ? [{ label: 'Export PDF', icon: 'download', onClick: () => exportRunPdf(run) }] : [];
}

export function exportRunCsv(run) {
  download(`deckchek-${slug(run.test)}-${run.id}.csv`, measurementsToCsv(reportMeasurements(run)), 'text/csv');
}
export function exportRunJson(run) {
  download(`deckchek-${slug(run.test)}-${run.id}.json`, JSON.stringify(run, null, 2), 'application/json');
}

/** A/B deltas (B − A) for identical metric ids and units. */
export function compareTwo(a, b) { return compareRuns(a, b); }
export function exportComparisonHtml(a, b) {
  const deltas = compareRuns(a, b);
  const measurements = deltas.map(d => normalizeMeasurement({ metricId: `delta_${d.metricId}`, label: `Δ ${d.label || d.metricId}`, value: d.delta, unit: d.unit, origin: 'inferred', confidence: 1 }));
  const html = buildHtmlReport({ title: `DeckChek Comparison — ${a.test || ''} vs ${b.test || ''}`, device: `${a.device || 'A'} → ${b.device || 'B'}`, measurements, findings: [], notes: `A: ${a.createdAt}. B: ${b.createdAt}. Only identical metric IDs and units are compared; Δ = B − A.` });
  download(`deckchek-comparison-${slug(a.test)}.html`, html, 'text/html');
}

// ---------- workspace ----------
export function exportWorkspace() {
  download('deckchek-workspace.json', serializeWorkspaceJson({ equipment: workspace.equipment, runs: workspace.runs }), 'application/json');
}
export async function importWorkspace(file) {
  const data = parseWorkspaceJson(await file.text());
  workspace.equipment = data.equipment;
  workspace.runs = data.runs;
  saveWorkspace();
  if (!isNative()) for (const run of data.runs.slice(0, 250)) { try { await store.saveRun(toPersistRun(run)); } catch { /* keep going */ } }
  emit('history');
  return data;
}

/** Browser mode: make sure older local runs also appear in the catalog store history. */
export async function migrateLocalRuns() {
  if (isNative() || !workspace.runs.length) return;
  const known = new Set((await store.listRuns(500)).map(r => r.id));
  for (const run of workspace.runs) if (!known.has(run.id)) { try { await store.saveRun(toPersistRun(run)); } catch { /* ignore */ } }
}
