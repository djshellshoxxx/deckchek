// Printable PDF reports for the M6 results and the venue report (FS-03 DoD "all report types").
// Kinds: latency (FS-11), stylus (FS-12), wearMap (FS-13), scratch (FS-14), hum (FS-15) and venue (FS-15 AC-7).
// Each kind has a pure `...PrintData(...)` function (screen state -> plain data) and a builder that renders it with
// ctx.esc, so the HTML is unit-testable in Node. Status is always printed as a word, never colour alone.
// The only DOM here is pdfButton(), which screens place in their header.
import { INCIDENT_TYPES } from '../../venue-incidents.js';
import { SUPPORT_HISTORY_LIMIT, observationIssues } from '../../support-isolation.js';

const num = (v, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? String(Number(v.toFixed(d))) : '—');
const when = iso => { const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const MAX_ROWS = 300;
const VENUE_RUN_LIMIT = 50;

function table(esc, head, rows, { numeric = [] } = {}) {
  if (!rows.length) return '';
  const body = rows.slice(0, MAX_ROWS).map(r => `<tr>${r.map((c, i) => `<td${numeric.includes(i) ? ' class="dc-num"' : ''}>${esc(c ?? '')}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>${rows.length > MAX_ROWS ? `<p class="dc-note">${rows.length - MAX_ROWS} more rows not shown.</p>` : ''}`;
}
const facts = (esc, pairs) => {
  const rows = pairs.filter(([, v]) => v != null && v !== '');
  return rows.length ? `<table><tbody>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>` : '';
};
const para = (esc, text, cls = '') => (text ? `<p${cls ? ` class="${cls}"` : ''}>${esc(text)}</p>` : '');

// ------------------------------------------------------------------ latency (FS-11)

export const latencyPrintable = Object.freeze({
  fileKind: 'Latency',
  title: 'DeckChek latency and buffer report',
  device: d => d?.device?.output || d?.device?.input || 'Audio interface',
  summary: d => [
    ['Input', d?.device?.input], ['Output', d?.device?.output], ['Sample rate', d?.device?.sampleRate ? `${d.device.sampleRate} Hz` : null],
    ['Round trip', d?.roundTrip ? `${num(d.roundTrip.latencyMs, 2)} ms ± ${num(d.roundTrip.expandedUncertaintyMs, 2)} ms (k=2)` : null],
  ],
  build: (d = {}, { esc }) => {
    const rt = d.roundTrip;
    const parts = [para(esc, d.scope || 'Measured on Windows audio (WASAPI), not ASIO.', 'dc-note'), para(esc, d.note, 'dc-note')];
    if (rt) {
      parts.push('<h2>Round-trip latency</h2>', facts(esc, [['Mean latency', `${num(rt.latencyMs, 2)} ms`], ['Spread (std)', `${num(rt.stdMs, 2)} ms`], ['Expanded uncertainty (k=2)', `${num(rt.expandedUncertaintyMs, 2)} ms`],
        ['Accepted runs', rt.acceptedRuns], ['Reported by Windows', rt.reportedMs != null ? `${num(rt.reportedMs, 2)} ms` : null], ['Extra over reported', rt.overheadMs != null ? `${num(rt.overheadMs, 2)} ms` : null]]));
    }
    if (d.bufferTest) {
      parts.push('<h2>Buffer stress test</h2>', para(esc, `Outcome: ${d.bufferTest.branch || 'unknown'}${Number.isFinite(d.bufferTest.loadPct) ? `. Test load ${d.bufferTest.loadPct} %.` : '.'}`),
        table(esc, ['Requested (samples)', 'Ran at (samples)', 'Result', 'Dropouts', 'Longest gap (ms)'],
          (d.bufferTest.rows || []).map(r => [r.requested, r.effectiveFrames, Array.isArray(r.verdicts) ? r.verdicts.join(', ') : r.verdicts, r.xruns, num(r.maxGapMs, 1)]), { numeric: [0, 1, 3, 4] }));
    }
    if (d.typedAsioBufferFrames) parts.push(para(esc, `ASIO buffer typed by you: ${d.typedAsioBufferFrames.frames} samples (${d.typedAsioBufferFrames.label}).`));
    if ((d.recommendations || []).length) {
      parts.push('<h2>Recommended buffer per DJ program</h2>', table(esc, ['Program', 'Samples', 'About (ms)', 'Basis', 'What to set'],
        d.recommendations.map(r => [r.software, r.frames ?? '—', num(r.ms, 1), r.basis, r.text]), { numeric: [1, 2] }),
      para(esc, 'DeckChek never changes your DJ software. Set the value yourself and play 10 minutes with your real library before trusting it.', 'dc-note'));
    }
    if ((d.windowsChecklist || []).length) parts.push('<h2>Windows tuning checklist</h2>', table(esc, ['Item', 'Status', 'Detail'], d.windowsChecklist.map(i => [i.id, i.status, i.detail])));
    return parts.join('');
  },
});
export const latencyPrintData = payload => (payload && (payload.roundTrip || payload.bufferTest || payload.windowsChecklist) ? payload : null);

// ------------------------------------------------------------------ stylus (FS-12)

/** Plain data for the stylus report from the screen's loadAssetState() result. Null without an asset. */
export function stylusPrintData(d, { projectionText = '' } = {}) {
  if (!d?.asset) return null;
  return {
    name: d.asset.name || 'Cartridge', hours: d.hours, ratedHours: d.life?.ratedHours, ratedGeneric: Boolean(d.rated?.generic), pct: d.life?.pct, lifeLabel: d.life?.label || d.life?.status || '',
    projection: projectionText, baseline: d.baseline || null,
    alerts: (d.alerts || []).map(a => ({ severity: a.severity, message: a.message, snoozed: Boolean(a.snoozed) })),
    benchmarks: (d.rows || []).filter(b => b.valid).map(b => ({ createdAt: b.createdAt, hoursAt: b.hoursAt, thdPercent: b.thdPercent, separationDb: b.separationDb, tcSnrDb: b.tcSnrDb, tcPhaseErrorDeg: b.tcPhaseErrorDeg, tcDropouts: b.tcDropouts })),
  };
}
const SEVERITY_WORD = { red: 'Replace', amber: 'Inspect', info: 'Check' };
export const stylusPrintable = Object.freeze({
  fileKind: 'Stylus',
  title: d => `Stylus wear — ${d?.name || 'cartridge'}`,
  device: d => d?.name || '',
  summary: d => [['Hours since install', Number.isFinite(d?.hours) ? `${num(d.hours, 1)} h` : null], ['Rated life', Number.isFinite(d?.ratedHours) ? `${num(d.ratedHours, 0)} h${d.ratedGeneric ? ' (generic estimate)' : ''}` : null],
    ['Life used', Number.isFinite(d?.pct) ? `${Math.round(d.pct)} % (${d.lifeLabel})` : null], ['Replace around', d?.projection || null]],
  charts: d => {
    const pts = key => (d?.benchmarks || []).filter(b => Number.isFinite(b.hoursAt) && Number.isFinite(b[key])).map(b => [b.hoursAt, b[key]]);
    const out = [];
    if (pts('tcSnrDb').length >= 2) out.push({ title: 'Timecode SNR by stylus hours', xLabel: 'Hours', yLabel: 'dB', series: [{ label: 'SNR', points: pts('tcSnrDb') }] });
    if (pts('thdPercent').length >= 2) out.push({ title: 'Distortion (THD) by stylus hours', xLabel: 'Hours', yLabel: '%', series: [{ label: 'THD', points: pts('thdPercent') }] });
    return out;
  },
  build: (d = {}, { esc }) => {
    const alerts = (d.alerts || []).length
      ? `<h2>Alerts</h2><ul>${d.alerts.map(a => `<li><strong>${esc(SEVERITY_WORD[a.severity] || 'Check')}</strong>: ${esc(a.message)}${a.snoozed ? ' (snoozed)' : ''}</li>`).join('')}</ul>`
      : '<h2>Alerts</h2><p>No alerts. Hours are within the rated life and no benchmark has crossed a limit.</p>';
    const bench = (d.benchmarks || []).length
      ? `<h2>Benchmarks</h2>${table(esc, ['Date', 'Hours', 'THD %', 'Separation dB', 'SNR dB', 'Phase error °', 'Dropouts'], d.benchmarks.map(b => [when(b.createdAt), num(b.hoursAt, 1), num(b.thdPercent, 2), num(b.separationDb, 1), num(b.tcSnrDb, 1), num(b.tcPhaseErrorDeg, 1), num(b.tcDropouts, 0)]), { numeric: [1, 2, 3, 4, 5, 6] })}`
      : '<h2>Benchmarks</h2><p>No benchmarks recorded yet.</p>';
    return `${para(esc, 'Hours are a guide, not proof of wear: the benchmarks show what the stylus actually does.', 'dc-note')}${alerts}${bench}`;
  },
});

// ------------------------------------------------------------------ control-vinyl wear map (FS-13)

/** Plain data from wearmap.js scanView() plus the copy's title. */
export function wearMapPrintData(view, { copyTitle = '' } = {}) {
  if (!view) return null;
  return {
    copyTitle, sideLabel: view.sideLabel || '', format: view.format || '', createdAt: view.createdAt || '', verdict: view.verdict, label: view.label, headline: view.headline, message: view.message,
    coverage: view.coverage, partial: Boolean(view.partial), stylusNote: view.stylusNote || null, binSec: view.binSec, stats: view.stats || {},
    worst: (view.worst || []).map(w => ({ time: w.time, class: w.class, snrDb: w.snrDb, phaseErrDeg: w.phaseErrDeg, dropouts: w.dropouts })),
    snr: (view.bins || []).filter(b => Number.isFinite(b.tSec) && Number.isFinite(b.snrDb)).map(b => [b.tSec, b.snrDb]),
  };
}
export const wearMapPrintable = Object.freeze({
  fileKind: 'WearMap',
  title: d => `Control vinyl wear map${d?.copyTitle ? ` — ${d.copyTitle}` : ''}${d?.sideLabel ? `, side ${d.sideLabel}` : ''}`,
  device: d => d?.copyTitle || '',
  summary: d => [['Verdict', d?.label], ['Format', d?.format], ['Scanned', d?.createdAt ? when(d.createdAt) : null], ['Coverage', Number.isFinite(d?.coverage) ? `${Math.round(d.coverage * 100)} %${d.partial ? ' (partial)' : ''}` : null]],
  charts: d => (d?.snr?.length >= 2 ? [{ title: 'Timecode SNR along the side', xLabel: 'Seconds into the side', yLabel: 'SNR (dB)', series: [{ label: 'SNR per bin', points: d.snr }] }] : []),
  build: (d = {}, { esc }) => {
    const s = d.stats || {};
    return `<h2>${esc(d.headline || d.label || 'Wear map')}</h2>${para(esc, d.message)}${para(esc, d.stylusNote, 'dc-note')}
${facts(esc, [['Good bins', Number.isFinite(s.goodPct) ? `${num(s.goodPct, 1)} %` : null], ['Degraded bins', Number.isFinite(s.degradedPct) ? `${num(s.degradedPct, 1)} %` : null], ['Bad bins', Number.isFinite(s.badPct) ? `${num(s.badPct, 1)} %` : null],
      ['Dropouts', s.dropouts], ['Bin length', Number.isFinite(d.binSec) ? `${d.binSec} s` : null]])}
${(d.worst || []).length ? `<h2>Worst stretches</h2>${table(esc, ['At', 'Class', 'SNR (dB)', 'Phase error (°)', 'Dropouts'], d.worst.map(w => [w.time, w.class, num(w.snrDb, 1), num(w.phaseErrDeg, 1), w.dropouts]), { numeric: [2, 3, 4] })}` : ''}`;
  },
});

// ------------------------------------------------------------------ scratch (FS-14)

/** Plain data from the scratch screen's result view (viewOfResult / viewOfRun) and its meta line. */
export function scratchPrintData(view, { meta = '', createdAt = '' } = {}) {
  if (!view) return null;
  return {
    meta, createdAt, score: view.score, completed: Boolean(view.completed), summary: view.summary || '', format: view.format, bpm: view.bpm, stats: view.stats || {},
    safety: view.safety ? { level: view.safety.level, text: view.safety.message || view.safety.text || view.safety.copy || '' } : null,
    components: Object.entries(view.components || {}).map(([k, c]) => ({ id: k, points: c?.points, max: c?.max, value: c?.value, unit: c?.unit })),
    patterns: (view.patterns || []).map(p => ({ label: p.label, present: p.present !== false, lockLosses: p.lockLosses, longestLossMs: p.longestLossMs, directionErrors: p.directionErrors, skips: p.skips, score: p.score })),
    events: (view.events || []).slice(0, MAX_ROWS).map(e => ({ kind: e.kind, pattern: e.pattern, tMs: e.tMs, durationMs: e.durationMs })),
  };
}
export const scratchPrintable = Object.freeze({
  fileKind: 'Scratch',
  title: 'DeckChek scratch stress test report',
  device: d => d?.meta || '',
  summary: d => [['Score', Number.isFinite(d?.score) ? `${Math.round(d.score)} / 100` : 'Not scored'], ['Run', d?.completed ? 'Complete' : 'Partial'], ['Format', d?.format], ['Tempo', d?.bpm ? `${d.bpm} BPM` : null], ['Date', d?.createdAt ? when(d.createdAt) : null]],
  build: (d = {}, { esc }) => {
    const s = d.stats || {};
    return `${para(esc, d.summary)}${d.safety?.text ? para(esc, `${d.safety.level === 'stop' ? 'Stop: ' : d.safety.level === 'warn' ? 'Caution: ' : ''}${d.safety.text}`, 'dc-note') : ''}
${facts(esc, [['Lock losses', s.lockLosses], ['Longest loss', Number.isFinite(s.longestLossMs) ? `${num(s.longestLossMs, 0)} ms` : null], ['Median recovery', Number.isFinite(s.medianRecoveryMs) ? `${num(s.medianRecoveryMs, 0)} ms` : null],
      ['Direction errors', s.directionErrors], ['Needle skips', s.skips], ['Reversals', s.reversals]])}
${(d.components || []).length ? `<h2>Score components</h2>${table(esc, ['Component', 'Points', 'Of', 'Value', 'Unit'], d.components.map(c => [c.id, num(c.points, 1), num(c.max, 0), num(c.value, 2), c.unit || '']), { numeric: [1, 2, 3] })}` : ''}
${(d.patterns || []).length ? `<h2>Patterns</h2>${table(esc, ['Pattern', 'Done', 'Lock losses', 'Longest loss (ms)', 'Direction errors', 'Skips', 'Score'], d.patterns.map(p => [p.label, p.present ? 'Yes' : 'Not completed', p.lockLosses ?? '—', num(p.longestLossMs, 0), p.directionErrors ?? '—', p.skips ?? '—', num(p.score, 0)]), { numeric: [2, 3, 4, 5, 6] })}` : ''}
${(d.events || []).length ? `<h2>Events</h2>${table(esc, ['Pattern', 'Event', 'At (s)', 'Duration (ms)'], d.events.map(e => [e.pattern, e.kind, num(e.tMs / 1000, 2), num(e.durationMs, 0)]), { numeric: [2, 3] })}` : ''}
${para(esc, 'Needle-skip thresholds are untested defaults; treat skip counts as a guide.', 'dc-note')}`;
  },
});

// ------------------------------------------------------------------ hum and feedback (FS-15)

/** Plain data from a hum_run_get result. */
export function humPrintData(run, { venueName = '' } = {}) {
  if (!run) return null;
  return {
    id: run.id, kind: run.kind, verdict: run.verdict || '', createdAt: run.createdAt || '', mainsHz: run.mainsHz ?? null, venueName,
    causes: (run.causes || []).map(c => ({ label: c.label, confidence: c.confidence })),
    steps: (run.steps || []).map(s => ({ label: s.label, skipped: Boolean(s.skipped), totalDbfs: s.totalDbfs, deltaDb: s.deltaDb, levelDbfs: s.levelDbfs, peakHz: s.peakHz, onset: Boolean(s.onset) })),
  };
}
function humRunHtml(r, esc, heading = 'h2') {
  const fb = r.kind === 'feedback';
  const steps = (r.steps || []).length
    ? table(esc, ['Step', fb ? 'Output (dBFS)' : 'Total hum (dBFS)', fb ? 'Peak' : 'Change (dB)', 'Note'],
      r.steps.map(s => [s.label, s.skipped ? 'Skipped' : num(fb ? s.levelDbfs : s.totalDbfs, 1), s.skipped ? '' : fb ? (Number.isFinite(s.peakHz) ? `${num(s.peakHz, 1)} Hz` : '—') : num(s.deltaDb, 1), s.onset ? 'Onset' : '']), { numeric: [1] })
    : '';
  const causes = (r.causes || []).length ? `<h3>Likely causes</h3><ol>${r.causes.map(c => `<li>${esc(c.label)}${Number.isFinite(c.confidence) ? ` (${Math.round(c.confidence * 100)} %)` : ''}</li>`).join('')}</ol>` : '';
  return `<${heading}>${esc(fb ? 'Booth feedback test' : 'Hum isolation')}${r.createdAt ? `, ${esc(when(r.createdAt))}` : ''}</${heading}>${para(esc, r.verdict)}${r.mainsHz ? para(esc, `Mains frequency ${r.mainsHz} Hz.`) : ''}${causes}${steps}`;
}
export const humPrintable = Object.freeze({
  fileKind: 'Hum',
  title: d => (d?.kind === 'feedback' ? 'DeckChek booth feedback report' : 'DeckChek hum isolation report'),
  device: d => d?.venueName || '',
  summary: d => [['Venue', d?.venueName], ['Run', d?.kind === 'feedback' ? 'Feedback test' : 'Hum isolation'], ['Date', d?.createdAt ? when(d.createdAt) : null], ['Result', d?.verdict]],
  build: (d = {}, { esc }) => humRunHtml(d, esc, 'h2'),
});

// ------------------------------------------------------------------ venue report (FS-15 AC-7)

/** Plain data: catalog, measured runs and a separately identified operator incident history. */
export function venuePrintData({ venue, setups = [], supports = null, humRuns = [], incidents = null, isolation = null, assetName = id => id } = {}) {
  if (!venue) return null;
  return {
    name: venue.name || 'Venue', details: [['Type', venue.venueType], ['City', venue.city], ['Country', venue.country], ['Notes', venue.notes]].filter(([, v]) => v),
    supportsLoaded: Array.isArray(supports),
    setups: setups.filter(s => s.venueId === venue.id).map(s => ({ name: s.name, profile: s.profile || '',
      supportConfigurationId: s.supportConfigurationId ?? null,
      support: structuredClone(supports?.find(row => row.id === s.supportConfigurationId) ?? null),
      components: (s.components || []).map(c => `${c.role || 'component'}${c.position ? ` (${c.position})` : ''}: ${assetName(c.assetId)}`) })),
    humRuns: humRuns.map(r => humPrintData(r, { venueName: venue.name })).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, VENUE_RUN_LIMIT),
    incidents, isolation: isolation == null ? null : structuredClone(isolation),
  };
}
function currentSupportHtml(setup, loaded, esc) {
  const heading = '<h4>Current support description</h4>';
  if (!loaded) return `${heading}<p>Support descriptions were not loaded for this report.</p>`;
  if (!setup.supportConfigurationId) return `${heading}<p>No support description is currently assigned to this setup.</p>`;
  if (!setup.support) return `${heading}<p>The assigned support record is unavailable.</p>`;
  const support = setup.support;
  return `${heading}${para(esc, 'Current operator-described catalog context; this does not establish the support used for historical measurements.', 'dc-note')}${facts(esc, [
    ['Name', support.name], ['Description', support.description], ['Approximate mass (operator entry)', support.approximateMassKg == null ? null : `${num(support.approximateMassKg, 3)} kg`],
    ['Coupled state (operator description)', support.coupledState], ['Notes', support.notes],
  ])}`;
}
function incidentHistoryHtml(history, esc) {
  const heading = '<h2>Operator-reported incidents</h2>';
  if (!history) return `${heading}<p>Incident history was not loaded for this report.</p>`;
  if (history.total === 0) return `${heading}<p>No incidents recorded for this venue. This does not establish an incident-free session.</p>`;
  const rows = history.items.slice(0, MAX_ROWS);
  const omitted = history.total > rows.length;
  return `${heading}${para(esc, `Showing ${rows.length} of ${history.total} recorded incidents (newest first; report limit ${MAX_ROWS}).${omitted ? ' The older records remain stored.' : ''}`, 'dc-note')}
${para(esc, 'Each entry is an operator report, not a sensor detection or diagnosis. Names are the selected context saved at the press; timestamps distinguish occurrence from persistence. Times below are UTC.', 'dc-note')}
${table(esc, ['Occurred (UTC)', 'Incident', 'Selected venue', 'Selected setup', 'Notes', 'Saved (UTC)'], rows.map(row => [
    row.occurredAt, INCIDENT_TYPES.find(type => type.id === row.kind)?.label || row.kind, row.context?.venue?.name || '', row.context?.setup?.name || 'No setup assigned', row.note || '', row.recordedAt,
  ]))}`;
}
function supportObservationHtml(row, esc) {
  const { context, capture, analysis, calibration } = row;
  const issues = observationIssues(row), conditions = context.conditions;
  const profile = calibration.profile && typeof calibration.profile === 'object' ? calibration.profile : null;
  const components = Array.isArray(context.setup.components) ? context.setup.components.map(component => component
    ? `${component.role ?? 'Unknown role'}: asset ${component.assetId ?? 'unavailable'}; component ${component.id ?? 'unavailable'}; position ${component.position ?? 'not recorded'}; settings snapshot ${component.settingsSnapshotId ?? 'not recorded'}` : 'Unavailable component').join(' | ') : 'Unavailable';
  return `<h4>${esc(`${row.stage}: ${context.support.name}`)}</h4>${facts(esc, [
    ['Observation', row.id], ['Capture observed (UTC)', `${row.capturedAt} → ${row.finishedAt}`], ['Saved (UTC)', row.recordedAt],
    ['Historical selected venue / setup', `${context.venue.name} / ${context.setup.name}`], ['Selected support', context.support.name],
    ['Support description', context.support.description], ['Support structure (original text)', context.support.structureJson], ['Support notes', context.support.notes],
    ['Approximate support mass (operator)', context.support.approximateMassKg == null ? 'Not recorded' : `${num(context.support.approximateMassKg, 3)} kg`],
    ['Coupled state (operator description)', context.support.coupledState ?? 'Not recorded'], ['Support position binding', context.support.deckPositionId ?? 'Reusable / unassigned'],
    ['Original setup / booth / deck position IDs', `${context.setup.id} / ${context.setup.boothId ?? 'unassigned'} / ${context.setup.deckPositionId ?? 'unassigned'}`],
    ['Original catalog support assignment', context.setup.supportConfigurationId ?? 'Unassigned; the selected physical support is recorded separately'],
    ['Original component and settings associations', components || 'No components recorded'],
    ['Physical route (operator)', conditions.route], ['Gain / filters (operator)', conditions.gainSettings], ['Procedure / source (operator)', `${conditions.procedure} / ${conditions.source}`],
    ['Placement (operator)', conditions.placement], ['PA state / level (operator)', `${conditions.paState} / ${conditions.paLevel}`],
    ['Reported input / pair', `${capture.deviceName ?? 'Unavailable'} / ${capture.pair?.label ?? 'Unavailable'}`],
    ['Actual reported sample rate', `${num(capture.sampleRate, 0)} Hz`], ['Captured duration', `${num(capture.framesL / capture.sampleRate, 3)} s (${capture.framesL} frames)`],
    ['Analyzed interval', analysis ? `[0, ${analysis.analyzedFrames}) samples; ${num(analysis.analyzedFrames / analysis.sampleRate, 3)} s; ${analysis.omittedFrames} captured frames outside the analysis` : 'Unavailable'],
    ['Method', analysis ? `${analysis.method}; 20–200 Hz; periodic Hann ${analysis.fftSize}; hop ${analysis.hop}; ${analysis.segments} complete windows; linear mean PSD` : row.analysisError],
    ['L / R / mean channel power', analysis ? `${num(analysis.levelDbfsL, 3)} / ${num(analysis.levelDbfsR, 3)} / ${num(analysis.levelDbfsPair, 3)} dBFS RMS` : 'Unavailable'],
    ['Calibration context', `${calibration.state}; corrections not applied`], ['Calibration source key', calibration.sourceKey ?? 'Unavailable'],
    ['Profile identity / rate / version', profile ? `${profile.deviceName ?? 'unavailable'} / ${profile.sampleRate ?? 'unavailable'} Hz / ${profile.version ?? 'unavailable'}` : 'No usable profile supplied'],
    ['Profile created (original value)', profile?.createdAt ?? 'Not recorded'],
    ['Recorded profile gain L / R (not applied)', profile?.gainDb ? `${num(profile.gainDb.left, 3)} / ${num(profile.gainDb.right, 3)} dB` : 'Unavailable'],
    ['Recorded profile clock (not applied)', profile?.clockPpm == null ? 'Unavailable' : `${num(profile.clockPpm, 3)} ppm`],
    ['Calibration limitations', calibration.reasons.join('; ') || 'Uncertainty remains unknown; no physical calibration is applied'],
    ['Changed or unreadable calibration evidence', profile?.atStart || typeof calibration.profile === 'string' ? JSON.stringify(calibration.profile) : null],
    ['Quality / eligibility', issues.length ? issues.join('; ') : 'Supplied capture evidence meets this method’s checks'],
    ['Original retained frames / dropped input samples', `${capture.quality?.framesCaptured ?? 'unavailable'} / ${capture.quality?.overrunSamples ?? 'unavailable'}`],
    ['Original clipped samples L / R', `${capture.quality?.clippedSamplesL ?? 'unavailable'} / ${capture.quality?.clippedSamplesR ?? 'unavailable'}`],
    ['Stream errors (total; latest messages)', `${capture.quality?.streamErrors ?? 'unavailable'}; ${Array.isArray(capture.quality?.streamErrorMessages) ? capture.quality.streamErrorMessages.join('; ') || 'none reported' : 'messages unavailable'}`],
    ['Capture truncated', capture.quality?.truncated === false ? 'No' : capture.quality?.truncated === true ? 'Yes' : 'Unavailable'],
    ['Observed maximum callback gap (not a dropout threshold)', `${num(capture.quality?.maxCallbackGapMs, 3)} ms`],
  ])}`;
}
function supportHistoryHtml(history, esc) {
  const heading = '<h2>Historical support A/B observations</h2>';
  if (!history) return `${heading}<p>Support A/B history was not loaded for this report.</p>`;
  const note = para(esc, 'Passive 20–200 Hz digital observations. PA, procedure and physical context are operator declarations. Measurement uncertainty is unknown; these results do not establish physical isolation efficiency or a precision-based ranking. No raw audio is archived.', 'dc-note');
  const scope = para(esc, `Showing ${history.observations.length} of ${history.observationTotal} original observations and ${history.comparisons.length} of ${history.comparisonTotal} comparisons (newest first; each report limit ${history.limit}). Older records remain stored.`, 'dc-note');
  const comparisons = history.comparisons.map(row => `<h3>Support comparison ${esc(row.id)}</h3>${facts(esc, [
    ['A → B supports (historical)', `${row.observationA.context.support.name} → ${row.observationB.context.support.name}`],
    ['Original observations', `${row.observationAId} → ${row.observationBId}`], ['Comparability', row.result.status === 'operator_reported_comparable' ? 'Operator reports matching conditions; acquisition and method checks passed' : 'Not comparable'],
    ['Change B − A (L / R / mean channel power)', `${num(row.result.deltaDb.left, 3)} / ${num(row.result.deltaDb.right, 3)} / ${num(row.result.deltaDb.pair, 3)} dB`],
    ['Direction', 'Negative means lower recorded LF power in B; positive means higher'], ['Rejection reasons', row.result.reasons.join('; ')],
  ])}${supportObservationHtml(row.observationA, esc)}${supportObservationHtml(row.observationB, esc)}`).join('');
  return `${heading}${note}${scope}${comparisons}${history.observations.length ? `<h3>Retained original observations</h3>${history.observations.map(row => supportObservationHtml(row, esc)).join('')}` : '<p>No support A/B observations are saved for this venue.</p>'}`;
}
export const venuePrintable = Object.freeze({
  fileKind: 'Venue',
  title: d => `Venue report — ${d?.name || 'venue'}`,
  device: d => d?.name || '',
  summary: d => [['Setups', (d?.setups || []).length], ['Hum and feedback runs', (d?.humRuns || []).length], ...(d?.details || []).slice(0, 3)],
  build: (d = {}, { esc }) => {
    const setups = (d.setups || []).length
      ? `<h2>Setups at this venue</h2>${d.setups.map(s => `<h3>${esc(s.name)}${s.profile ? ` (${esc(s.profile)})` : ''}</h3>${s.components.length ? `<ul>${s.components.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p>No components recorded.</p>'}${currentSupportHtml(s, d.supportsLoaded, esc)}`).join('')}`
      : '<h2>Setups at this venue</h2><p>No setups are linked to this venue.</p>';
    const runs = (d.humRuns || []).length
      ? `<h2>Hum and feedback history</h2>${d.humRuns.map(r => humRunHtml(r, esc, 'h3')).join('')}`
      : '<h2>Hum and feedback history</h2><p>No hum or feedback runs are saved for this venue.</p>';
    const historyScope = para(esc, `This report includes up to ${VENUE_RUN_LIMIT} saved hum and feedback runs for this venue, newest first. Older saved records remain stored.`, 'dc-note');
    return `${facts(esc, d.details || [])}${setups}${historyScope}${runs}${incidentHistoryHtml(d.incidents, esc)}${supportHistoryHtml(d.isolation, esc)}`;
  },
});

/**
 * Each measured run is fetched in full, with at most 50 runs. Read failures or missing details abort report preparation.
 * Incident and support reads also propagate errors. Legacy callers without those records disclose them as unloaded.
 */
export async function gatherVenueReport({ catalog, humStore, incidentStore, isolationStore, venueId }) {
  const venue = (await catalog.list('venue')).find(v => v.id === venueId);
  if (!venue) return null;
  const [setups, assets, summaries, incidents, supports, isolation] = await Promise.all([catalog.list('setup'), catalog.list('asset'), humStore.list({ venueId, limit: VENUE_RUN_LIMIT }),
    incidentStore ? incidentStore.list({ venueId, limit: MAX_ROWS }) : Promise.resolve(null), catalog.list('supportConfiguration'),
    isolationStore ? isolationStore.list({ venueId, limit: SUPPORT_HISTORY_LIMIT }) : Promise.resolve(null)]);
  if (isolationStore && (!isolation || !Array.isArray(isolation.observations) || !Array.isArray(isolation.comparisons))) throw new Error('Support A/B history returned invalid records.');
  if (supports != null && !Array.isArray(supports)) throw new Error('Support catalog returned invalid records.');
  if (!Array.isArray(summaries)) throw new Error('Hum and feedback history returned invalid records.');
  const runs = await Promise.all(summaries.slice(0, VENUE_RUN_LIMIT).map(async summary => {
    const run = await humStore.get(summary.id);
    if (!run) throw new Error(`Saved hum/feedback run ${summary.id} is unavailable; the report was not generated.`);
    return run;
  }));
  const name = id => assets.find(a => a.id === id)?.nickname || 'Unknown asset';
  return venuePrintData({ venue, setups, supports, humRuns: runs, incidents, isolation, assetName: name });
}

// ------------------------------------------------------------------ registration + button

export const M6_KINDS = Object.freeze({
  latency: latencyPrintable, stylus: stylusPrintable, wearMap: wearMapPrintable, scratch: scratchPrintable, hum: humPrintable, venue: venuePrintable,
});

/** Registers one kind (idempotent). Resolves to the report-pdf module. */
export async function ensureM6Kind(kind) {
  const def = M6_KINDS[kind];
  if (!def) throw new Error(`Unknown report kind "${kind}".`);
  const mod = await import('../../report-pdf.js');
  if (!mod.getPrintableKind(kind)) mod.registerPrintableKind(kind, def);
  return mod;
}

/**
 * Export PDF button for a screen header. `getData()` returns the kind's data (sync or async) or null when there is nothing
 * to print yet. Follows features.pdfExport live. Errors and progress come from persistence.exportPdfWithFeedback.
 */
export function pdfButton(h, { id, kind, getData, label = 'Export PDF', icon = '' }) {
  const btn = h('button', { type: 'button', class: 'btn btn-secondary', id, 'data-pdf-kind': kind, html: `${icon}<span>${label}</span>` });
  btn.addEventListener('click', async () => {
    const [{ exportPdfWithFeedback }, { toast }] = await Promise.all([import('../persistence.js'), import('../live.js')]);
    let data = null;
    try { data = await getData(); } catch (error) { toast(`Could not prepare the report: ${error?.message || error}`, { type: 'error' }); return; }
    if (!data) { toast('Nothing to export yet. Finish a result first.', { type: 'info' }); return; }
    await ensureM6Kind(kind);
    await exportPdfWithFeedback(kind, data, { button: btn });
  });
  Promise.all([import('../persistence.js'), import('../../features.js')]).then(([p, f]) => {
    const sync = () => { btn.hidden = !p.pdfExportEnabled(); };
    sync(); f.onFeatureChange(sync);
  }).catch(() => {});
  return btn;
}
