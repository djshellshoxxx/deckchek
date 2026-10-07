// Device test dispatch: maps a profile test's `method` onto a DeckChek engine,
// prefills workflow parameters, turns engine output into a saved result and
// builds the per-asset device report. Pure module (no DOM).

import { WORKFLOWS, paramsForTest } from '../ui/workflows/definitions.js';
import { evaluatePass } from '../device-checks.js';
import { parseMethod, groupTestsByCategory, latestResults, progressFor, specSummary, CATEGORY_LABELS } from './library.js';

const norm = s => String(s || '').trim().toLowerCase();

/**
 * Decide how a test runs.
 * Returns {runner:'workflow', workflowId, mode} | {runner:'timecode'} | {runner:'midi', kind}
 * | {runner:'driver'} | {runner:'software'} | {runner:'manual'} | {runner:'unsupported', reason}.
 */
export function dispatchFor(test, workflows = WORKFLOWS) {
  const { engine, mode } = parseMethod(test?.method);
  const wf = workflows.find(w => w.id === engine);
  if (wf) {
    const m = wf.modes.find(x => norm(x.test) === norm(mode) || norm(x.label) === norm(mode)) || (wf.modes.length === 1 && !mode ? wf.modes[0] : null);
    if (!m) return { runner: 'unsupported', reason: `${wf.title} has no "${mode}" test.` };
    return { runner: 'workflow', workflowId: wf.id, mode: m.test, modeLabel: m.label, workflowTitle: wf.title };
  }
  switch (engine) {
    case 'timecode': return mode === 'format-check' ? { runner: 'timecode' } : { runner: 'unsupported', reason: `Unknown timecode test "${mode}".` };
    case 'midi': return ['coverage', 'fader', 'jog', 'button', 'led', 'latency'].includes(mode) ? { runner: 'midi', kind: mode } : { runner: 'unsupported', reason: `Unknown MIDI test "${mode}".` };
    case 'driver': return { runner: 'driver' };
    case 'software': return { runner: 'software' };
    case 'manual': return { runner: 'manual' };
    default: return { runner: 'unsupported', reason: `Unknown method "${test?.method}".` };
  }
}

/** Short human label for a method, e.g. "Guided · Signal health", "MIDI · Fader". */
export function methodLabel(test) {
  const d = dispatchFor(test);
  switch (d.runner) {
    case 'workflow': return `${d.workflowTitle} · ${d.modeLabel}`;
    case 'timecode': return 'Timecode check';
    case 'midi': return `MIDI · ${d.kind[0].toUpperCase()}${d.kind.slice(1)}`;
    case 'driver': return 'Driver scan';
    case 'software': return 'Software log scan';
    case 'manual': return 'Checklist';
    default: return 'Not runnable';
  }
}

const fmtParam = v => Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
const PARAM_LABELS = { nominalRpm: 'Nominal speed (RPM)', pitchPosition: 'Pitch position (%)', mode: 'Input mode', sweep: 'Sweep', referenceHz: 'Reference tone (Hz)', software: 'Software', format: 'Timecode format', controlId: 'Control', controlIds: 'Controls', groups: 'Control groups', pitchPositions: 'Pitch positions to capture', input: 'Input', inputs: 'Inputs', output: 'Output', outputs: 'Outputs', channel: 'Channel', condition: 'Applies', loopback: 'Loopback', usb: 'Via USB', asio: 'ASIO', path: 'Signal path', source: 'Source', range: 'Pitch range (±%)', durationMin: 'Duration (min)', note: 'Note', perChannel: 'Per channel', focus: 'Focus' };

/**
 * Workflow setup values for a test: `values` keyed by workflow param id (strings, as the
 * setup form expects) and `notes` [[label, value]] for params the workflow has no field for.
 */
export function workflowPrefill(test, mode) {
  const fields = paramsForTest(mode);
  const values = {}, notes = [];
  const params = test?.params || {};
  for (const [key, raw] of Object.entries(params)) {
    if (raw == null || raw === '' || key === 'pitchPositions') continue;
    const f = fields.find(x => x.id === key);
    if (!f) { notes.push([PARAM_LABELS[key] || key, fmtParam(raw)]); continue; }
    if (f.type !== 'select') { values[key] = String(raw); continue; }
    const opt = f.options.find(([v]) => v === String(raw)) || f.options.find(([v]) => Number.isFinite(Number(v)) && Math.abs(Number(v) - Number(raw)) < 1e-3);
    if (opt) values[key] = opt[0]; else notes.push([f.label, fmtParam(raw)]);
  }
  const positions = params.pitchPositions;
  if (Array.isArray(positions) && positions.length) {
    if (fields.some(x => x.id === 'pitchPosition') && values.pitchPosition == null) values.pitchPosition = String(positions[0]);
    notes.push([PARAM_LABELS.pitchPositions, `${positions.join(', ')} % — one capture per position`]);
  }
  return { values, notes };
}

const SEV_RANK = { error: 3, critical: 3, fail: 3, warning: 2, warn: 2, review: 1, info: 0, informational: 0, ok: -1 };

/**
 * Result status for a completed test. With a pass criterion: evaluatePass. Without one the engine's own
 * verdict decides (verdictStatus 'pass'|'fail'|...), else findings: any error → fail, warnings → unknown, none → pass.
 */
export function evaluateOutcome(test, { measurements = [], findings = [], verdictStatus = null } = {}) {
  if (test?.pass) {
    const r = evaluatePass(test.pass, measurements);
    return { status: r.status, detail: r.detail, criterion: 'profile' };
  }
  if (verdictStatus === 'pass') return { status: 'pass', detail: 'No pass threshold in the profile; the analysis verdict was PASS.', criterion: 'verdict' };
  if (verdictStatus === 'fail') return { status: 'fail', detail: 'No pass threshold in the profile; the analysis verdict was FAIL.', criterion: 'verdict' };
  if (verdictStatus) return { status: 'unknown', detail: `No pass threshold in the profile; the analysis verdict was ${String(verdictStatus).toUpperCase()} — review the findings.`, criterion: 'verdict' };
  const worst = Math.max(-1, ...findings.map(f => SEV_RANK[f.severity] ?? 0));
  if (worst >= 3) return { status: 'fail', detail: 'No pass threshold in the profile; at least one finding is an error.', criterion: 'findings' };
  if (worst >= 1) return { status: 'unknown', detail: 'No pass threshold in the profile; findings need review.', criterion: 'findings' };
  return { status: 'pass', detail: 'No pass threshold in the profile; no problems were found.', criterion: 'findings' };
}

/** Compact, JSON-safe record of a completed test for device_test_result.detail. */
export function buildResultDetail({ test, outcome, measurements = [], findings = [], extra = {} }) {
  return {
    method: test?.method, title: test?.title, summary: outcome?.detail || '', criterion: outcome?.criterion || null, pass: test?.pass || null,
    measurements: measurements.filter(m => m && m.metricId).map(m => ({ metricId: m.metricId, label: m.label || m.metricId, value: Number.isFinite(m.value) ? m.value : m.value ?? null, unit: m.unit || '' })),
    findings: findings.map(f => ({ id: f.id || f.code || null, severity: f.severity || 'info', title: f.title, meaning: f.meaning || f.detail || '', action: f.action || (f.isolationTests || []).join('; ') || '' })),
    ...extra,
  };
}

/** Manual checklist outcome: answers[i] in 'ok'|'problem'|'na'. */
export function evaluateChecklist(steps = [], answers = []) {
  const problems = steps.map((s, i) => ({ step: s, i })).filter(x => answers[x.i] === 'problem');
  const answered = answers.filter(Boolean).length;
  if (answered < steps.length) return { status: null, detail: `${steps.length - answered} item(s) still unanswered.`, problems };
  if (problems.length) return { status: 'fail', detail: `${problems.length} problem${problems.length > 1 ? 's' : ''} found: ${problems.map(p => p.step).join(' / ')}`, problems };
  if (answers.every(a => a === 'na')) return { status: 'skipped', detail: 'Every item was marked not applicable.', problems };
  return { status: 'pass', detail: `All ${answers.filter(a => a === 'ok').length} applicable item(s) OK.`, problems };
}

// ---------- MIDI maps ----------
const hasMessage = c => { const m = c?.message; return !!m?.kind && (m.kind === 'pitchbend' || m.number != null); };

/** Profile map merged with the asset's learned map (learned controls win by id). */
export function effectiveMidiMap(profileMidi, learned) {
  const base = profileMidi || { mapSource: 'learn', complete: false, controls: [] };
  const mapped = (base.controls || []).filter(hasMessage);
  const learnedControls = (learned?.controls || []).filter(hasMessage);
  if (!learnedControls.length) return mapped.length ? { ...base, controls: mapped, placeholders: (base.controls || []).filter(c => !hasMessage(c)) } : { ...base, mapSource: 'learn', controls: [], placeholders: base.controls || [] };
  const byId = new Map(mapped.map(c => [c.id, c]));
  for (const c of learnedControls) { const known = (base.controls || []).find(b => b.id === c.id); byId.set(c.id, { ...known, ...c, group: c.group || known?.group || 'Learned' }); }
  return { ...base, mapSource: 'learned', complete: false, learnedAt: learned.updatedAt || null, controls: [...byId.values()], placeholders: (base.controls || []).filter(c => !byId.has(c.id) && !hasMessage(c)) };
}

/** Best-guess control type for a discovered message. */
export function inferControlType(d) {
  if (d.kind === 'note') return 'button';
  if (d.kind === 'pitchbend') return 'fader';
  if (d.kind === 'cc') {
    const span = (d.max ?? 0) - (d.min ?? 0);
    const relLike = d.count >= 6 && ((d.min >= 1 && d.max <= 127 && (d.min <= 8 || d.max >= 120) && span > 60 && d.distinct != null && d.distinct <= 12) || (d.min >= 56 && d.max <= 72 && span > 0));
    if (relLike) return 'jog';
    if (span <= 1 || (d.distinct != null && d.distinct <= 2 && (d.max === 127 || d.max === 1))) return 'button';
    return 'knob';
  }
  return 'button';
}

export const learnKey = d => `${d.kind}:${d.channel}:${d.number}`;
const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * Turn learn-mode discoveries plus user labels into map controls.
 * labels: {[learnKey]: {label, controlId?, group?, type?, led?}}; unlabelled discoveries are dropped.
 */
export function learnedControls(discovered = [], labels = {}) {
  const used = new Set();
  const out = [];
  for (const d of discovered) {
    const l = labels[learnKey(d)];
    if (!l || !(l.label || l.controlId)) continue;
    let id = l.controlId || slugify(l.label) || `ctl_${d.kind}_${d.channel}_${d.number}`;
    while (used.has(id)) id = `${id}_2`;
    used.add(id);
    const kind = d.kind === 'note' ? 'note' : d.kind === 'pitchbend' ? 'pitchbend' : 'cc';
    out.push({ id, label: l.label || id, group: l.group || null, type: l.type || inferControlType(d), message: { kind, channel: d.channel, number: kind === 'pitchbend' ? 0 : d.number, msbNumber: null, lsbNumber: null }, range: [d.min, d.max], led: !!l.led, notes: 'Learned on this unit with DeckChek.' });
  }
  return out;
}

/** Input port that matches the profile's MIDI port patterns (case-insensitive substring), else null. */
export function pickMidiPort(ports = [], profile) {
  const pats = (profile?.connectivity?.midi?.portNamePatterns || []).map(norm).filter(Boolean);
  const names = ports.map(p => (typeof p === 'string' ? p : p?.name)).filter(Boolean);
  return names.find(n => pats.some(p => norm(n).includes(p))) || null;
}

/** Plain-English verdict lines for MIDI analyses. */
export function midiFindings(kind, a = {}) {
  const f = [];
  const F = (id, severity, title, meaning, action) => f.push({ id, severity, title, meaning, action });
  if (kind === 'coverage' && a.mode === 'map') {
    const unseen = (a.controls || []).filter(c => !c.seen);
    if (unseen.length) F('midi-unseen', 'warning', `${unseen.length} control${unseen.length > 1 ? 's' : ''} never sent MIDI`, `Not seen: ${unseen.slice(0, 12).map(c => c.label || c.id).join(', ')}${unseen.length > 12 ? '…' : ''}. A control that never reports is either not exercised or has a dead switch, pot or ribbon.`, 'Move each listed control again firmly; if it still does not light up, clean or replace the part.');
    if ((a.unexpected || []).length) F('midi-unexpected', 'info', `${a.unexpected.length} unexpected message${a.unexpected.length > 1 ? 's' : ''}`, 'Messages that are not in the map — usually controls missing from the map, sometimes a noisy pot sending values on its own.', 'Use learn mode to label them, or check for a control that moves on its own.');
  }
  if (kind === 'fader' && a.measurements?.length) {
    if (a.monotonicPercent < 95) F('fader-monotonic', a.monotonicPercent < 85 ? 'error' : 'warning', `Travel is only ${a.monotonicPercent}% smooth`, 'Values jump backwards while you move in one direction — a classic sign of a dirty or worn track.', 'Clean with contact cleaner suitable for faders/pots, or replace the fader.');
    if (a.jitterReversals > 3) F('fader-jitter', 'warning', `${a.jitterReversals} jitter reversals`, 'The value flickers by a step or two, which makes levels or tempo wander.', 'Clean the control; if jitter stays, replace it.');
    if (a.segments < 2) F('fader-single', 'info', 'Only one sweep recorded', 'Monotonicity is more reliable with several full sweeps each way.', 'Repeat with three slow end-to-end sweeps.');
  }
  if (kind === 'jog') {
    if (a.directionErrors > 0) F('jog-direction', a.directionErrors > 5 ? 'error' : 'warning', `${a.directionErrors} tick${a.directionErrors > 1 ? 's' : ''} counted in the wrong direction`, 'The encoder occasionally reports the opposite direction, which causes stutter when scratching or nudging.', 'Clean the optical encoder/sensor area; check for a loose jog wheel.');
    if (a.perRev?.length === 2 && a.perRev[0].ticks && Math.abs(a.perRev[0].ticks - a.perRev[1].ticks) / Math.max(a.perRev[0].ticks, a.perRev[1].ticks) > .05) F('jog-asym', 'warning', 'Clockwise and counter-clockwise counts differ by more than 5%', 'Missing ticks in one direction suggest a dirty or failing encoder.', 'Repeat slowly; if the gap persists, service the jog encoder.');
  }
  if (kind === 'button') {
    if (a.stuck?.length) F('button-stuck', 'error', `${a.stuck.length} button${a.stuck.length > 1 ? 's' : ''} still reported as held`, 'A switch that never releases keeps triggering its function.', 'Press and release it again; clean or replace the switch.');
    if (a.bounces > 0) F('button-bounce', a.bounces > 3 ? 'warning' : 'info', `${a.bounces} bounce event${a.bounces > 1 ? 's' : ''}`, 'One press produced several on/off messages within 5 ms — worn switches double-trigger.', 'Note which buttons bounce and replace their tact switches.');
  }
  if (kind === 'latency' && Number.isFinite(a.jitterMs)) {
    if (a.jitterMs > 4) F('midi-jitter', 'warning', `Timing jitter ${a.jitterMs.toFixed(2)} ms`, 'Uneven message spacing makes jog and scratch response feel rough. USB hubs and power-saving are common causes.', 'Plug directly into the PC, disable USB selective suspend, and close heavy background apps.');
  }
  return f;
}

// ---------- report ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS_WORD = { pass: 'PASS', fail: 'FAIL', unknown: 'REVIEW', skipped: 'SKIPPED' };
const fmtVal = v => typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(Math.abs(v) >= 100 ? 1 : 3)) : v == null ? '—' : String(v);

/** Self-contained HTML report for one asset of a device. */
export function buildDeviceReportHtml({ profile, asset = null, results = [], generatedAt = new Date().toISOString(), appVersion = '' }) {
  const latest = latestResults(results.filter(r => r.profileId === profile.id));
  const prog = progressFor(profile, results);
  const spec = specSummary(profile);
  const groups = groupTestsByCategory(profile).map(g => `<h3>${esc(g.label)}</h3><table><thead><tr><th>Test</th><th>Status</th><th>Run</th><th>Result</th></tr></thead><tbody>${g.tests.map(t => {
    const r = latest.get(t.id);
    const d = r?.detail || {};
    const ms = (d.measurements || []).map(m => `${esc(m.label)}: <b>${esc(fmtVal(m.value))}</b> ${esc(m.unit)}`).join('<br>');
    const fs = (d.findings || []).filter(f => f.severity !== 'ok').map(f => `<li><b>${esc(f.title)}</b>${f.meaning ? ` — ${esc(f.meaning)}` : ''}${f.action ? ` <i>${esc(f.action)}</i>` : ''}</li>`).join('');
    const notes = d.notes ? `<p>Notes: ${esc(d.notes)}</p>` : '';
    return `<tr><td><b>${esc(t.title)}</b><br><small>${esc(methodLabel(t))} · ${esc(t.severity || '')}</small></td><td class="s s-${esc(r?.status || 'none')}">${esc(r ? STATUS_WORD[r.status] || r.status : 'NOT RUN')}</td><td>${r ? esc(new Date(r.createdAt).toLocaleString()) : '—'}</td><td>${r ? `<p>${esc(d.summary || '')}</p>${ms ? `<p>${ms}</p>` : ''}${fs ? `<ul>${fs}</ul>` : ''}${notes}` : ''}</td></tr>`;
  }).join('')}</tbody></table>`).join('');
  const unverified = (profile.specs || []).filter(s => s.confidence !== 'confirmed');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(`DeckChek device report — ${profile.manufacturer} ${profile.model}`)}</title>
<style>body{font-family:system-ui,sans-serif;margin:32px;color:#14171c;max-width:1100px}h1{margin:0 0 4px}table{border-collapse:collapse;width:100%;margin:6px 0 18px}th,td{border-bottom:1px solid #d9dde3;padding:6px 8px;text-align:left;vertical-align:top;font-size:14px}small{color:#5f6775}.s{font-weight:700;white-space:nowrap}.s-pass{color:#0b7a55}.s-fail{color:#b3261e}.s-unknown{color:#6b3fd0}.s-skipped,.s-none{color:#5f6775}.note{border-left:4px solid #8a5a00;background:#fbefd0;padding:10px 14px;margin:12px 0}.sum span{display:inline-block;margin-right:18px}</style></head><body>
<h1>${esc(profile.manufacturer)} ${esc(profile.model)}</h1>
<p><b>Unit:</b> ${esc(asset?.nickname || 'Unassigned')}${asset?.serialNumber ? ` · S/N ${esc(asset.serialNumber)}` : ''} · <b>Category:</b> ${esc(CATEGORY_LABELS[profile.category] || profile.category)} · <b>Generated:</b> ${esc(generatedAt)}${appVersion ? ` · DeckChek ${esc(appVersion)}` : ''}</p>
<p class="sum"><span><b>${prog.passed}</b> passed</span><span><b>${prog.failed}</b> failed</span><span><b>${prog.unknown}</b> to review</span><span><b>${prog.skipped}</b> skipped</span><span><b>${prog.untested}</b> not run</span><span>of ${prog.total} tests</span></p>
${profile.identityNotes ? `<div class="note"><b>Identity:</b> ${esc(profile.identityNotes)}</div>` : ''}
${spec.hasUnverified ? `<div class="note"><b>Unverified specifications.</b> ${spec.unverified} of ${spec.total} specs${spec.unverifiedFormats ? ` and ${spec.unverifiedFormats} timecode format(s)` : ''} in this profile could not be confirmed against manufacturer documents. Pass thresholds marked "DeckChek test definition" are DeckChek's own criteria, not manufacturer specifications. Treat results that depend on unverified values as indicative only.</div>` : ''}
<h2>Test results</h2>${groups}
${unverified.length ? `<h2>Unverified specs</h2><table><thead><tr><th>Spec</th><th>Value</th><th>Source</th><th>Notes</th></tr></thead><tbody>${unverified.map(s => `<tr><td>${esc(s.label || s.key)}</td><td>${esc(fmtVal(s.value))} ${esc(s.unit || '')}</td><td>${esc(s.source || '—')}</td><td>${esc(s.notes || '')}</td></tr>`).join('')}</tbody></table>` : ''}
<p><small>DeckChek measurements are evidence records. Findings may have several possible causes and should be confirmed with repeatable tests.</small></p></body></html>`;
}
