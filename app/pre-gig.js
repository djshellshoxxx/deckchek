// FS-10 Pre-gig check ("Ready to play"): step plan, per-step pass/amber/red rules, verdict roll-up,
// preset model, run diff, evidence collection from a capture, a cancellable orchestrator and the
// run/preset store bridge. It composes existing engines (timecode.js analyzeTimecode, hum.js,
// system-check.js, device-checks.js) and adds only orchestration and rules. No DOM access.
//
// Every rule below is a tunable default in PREGIG_THRESHOLDS. The hum thresholds in particular are
// UNKNOWN until measured on real rigs (FS-10 §6 step 4). Every red/amber result carries a plain-English
// fix-it entry {label, text, action?}; actions only open settings, navigate or retry, nothing is applied silently.
import {dbfs, rms} from './core.js';
import {analyzeTimecode, findFormat} from './timecode.js';
import {humMeasure, removeTone} from './hum.js';
import {interpretSystemScan, createSystemBridge} from './system-check.js';
import {evaluateDriverCheck, evaluateSoftwareCheck} from './device-checks.js';
import {preemptCapture} from './capture.js';
import {toTimecodeFormat} from './media-library.js';

export const PRESET_VERSION = 1;
export const MAX_PRESET_BYTES = 256 * 1024;
export const PREGIG_BUDGET_MS = 120000;
export const PREGIG_HOLDER = 'pre-gig';

/** Tunable defaults (FS-10 §6). Boundaries are inclusive on the "good" side: SNR 25 passes, 24.9 warns. */
export const PREGIG_THRESHOLDS = Object.freeze({
  system: Object.freeze({eventDays: 3}),
  timecode: Object.freeze({
    captureSec: 5,
    snrPassDb: 25, snrWarnDb: 20,            // SNR >= pass: pass; >= warn: amber; below: red
    balancePassDb: 1.5, balanceWarnDb: 3,     // |L/R balance|
    phasePassDeg: 10, phaseWarnDeg: 20,       // deviation of the L/R phase from 90 deg
    dropoutsPass: 0, dropoutsWarn: 1,         // 20 ms level dropouts in the capture
    speedPassPct: 1, speedFailPct: 5          // carrier speed error; beyond speedFailPct means the wrong format
  }),
  signal: Object.freeze({
    minLevelDbfs: -50,                        // each channel must reach this level
    humWarnMarginDb: 40, humFailMarginDb: 25, // carrier level minus hum level: <= warn is amber, <= fail is red
    humDetectAboveFloorDb: 6,                 // hum must stand this far above the noise floor to count
    needleUpSec: 3
  }),
  software: Object.freeze({crashFailHours: 1, crashWarnHours: 24})
});

// ---------------------------------------------------------------- helpers
const finite = Number.isFinite;
const num = v => (v == null ? NaN : Number(v));
const r2 = v => (finite(v) ? Math.round(v * 100) / 100 : null);
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
/** Loose device/port name match: case-, space- and punctuation-insensitive, either name may contain the other. */
export function namesMatch(actual, wanted) {
  const a = norm(actual), b = norm(wanted);
  return b.length >= 3 && a.length >= 3 && (a.includes(b) || b.includes(a));
}
const RANK = {fail: 0, error: 1, warn: 2, skipped: 3, unsupported: 4, pass: 5};
const worst = states => states.reduce((w, s) => (RANK[s] < RANK[w] ? s : w), 'pass');
export const STEP_STATES = Object.freeze(['pass', 'warn', 'fail', 'skipped', 'unsupported', 'error']);

const FIX = {
  retry: {label: 'Try again', text: 'Fix the problem above, then run this check again.', action: {kind: 'retry'}},
  clean: {label: 'Clean stylus and control vinyl', text: 'Clean stylus and control vinyl, check phono/line switch', action: {kind: 'navigate', to: 'dvs'}},
  sound: {label: 'Open Sound settings', text: 'Open Windows Sound settings and check the interface is listed and set to the right sample rate.', action: {kind: 'settings', target: 'ms-settings:sound'}}
};

// ---------------------------------------------------------------- steps and plan
/** Step catalogue. `budgetMs` is the typical time per step (per deck for deck steps); manual steps are excluded from the 120 s budget. */
export const PREGIG_STEPS = Object.freeze([
  {kind: 'system', label: 'System health', budgetMs: 15000, required: false, parallel: true, needs: []},
  {kind: 'audio', label: 'Audio interface', budgetMs: 3000, required: true, parallel: true, needs: []},
  {kind: 'midi', label: 'MIDI gear', budgetMs: 2000, required: false, parallel: true, needs: []},
  {kind: 'software', label: 'DJ software', budgetMs: 3000, required: false, parallel: true, needs: []},
  {kind: 'timecode', label: 'Timecode', perDeck: true, budgetMs: 10000, required: true, parallel: false, needs: ['audio']},
  {kind: 'signal', label: 'Mixer signal and hum', perDeck: true, budgetMs: 4000, required: true, parallel: false, needs: ['audio']},
  {kind: 'headphones', label: 'Headphone cue', manual: true, budgetMs: 0, required: false, parallel: false, needs: ['audio']}
]);
const STEP_BY_KIND = Object.fromEntries(PREGIG_STEPS.map(s => [s.kind, s]));
export const stepKind = id => String(id).split(':')[0];
export const stepDeck = id => (String(id).includes(':') ? String(id).split(':')[1] : null);

/** Ordered plan for a preset. `skip` lists step ids the user unticked; `only` restricts to ids (re-run failed steps). */
export function buildPlan(preset, {skip = [], only = null} = {}) {
  const decks = (preset?.decks || []).map(d => d.id);
  const hasMidi = (preset?.midi || []).length > 0, hasSoftware = !!String(preset?.software || '').trim();
  const out = [];
  const add = (def, deck = null) => {
    const id = deck ? `${def.kind}:${deck}` : def.kind;
    const needs = def.needs.slice();
    out.push({
      id, kind: def.kind, deck, label: deck ? `${def.label}, deck ${deck}` : def.label, required: def.required, manual: !!def.manual,
      parallel: def.parallel, needs, budgetMs: def.budgetMs, enabled: !skip.includes(id) && (!only || only.includes(id))
    });
  };
  add(STEP_BY_KIND.system); add(STEP_BY_KIND.audio);
  if (hasMidi) add(STEP_BY_KIND.midi);
  if (hasSoftware) add(STEP_BY_KIND.software);
  for (const d of decks) { add(STEP_BY_KIND.timecode, d); add(STEP_BY_KIND.signal, d); }
  add(STEP_BY_KIND.headphones);
  return out;
}

/** Typical automatic time of the enabled steps (ms); manual steps are excluded (FS-10 AC-1). */
export function estimateBudgetMs(plan) {
  return plan.filter(s => s.enabled && !s.manual).reduce((t, s) => t + s.budgetMs, 0);
}

// ---------------------------------------------------------------- per-step evaluation
function result(step, state, summary, {evidence = {}, fix = [], reason = null} = {}) {
  return {stepId: step.id, kind: step.kind, deck: step.deck, label: step.label, required: step.required, manual: step.manual, state, summary, evidence, fix, reason};
}
const skipped = (step, reason, summary, fix = []) => result(step, 'skipped', summary, {reason, fix});
const SKIP_TEXT = {
  blocked: 'Skipped: the audio interface check failed.', cancelled: 'Cancelled before this step ran.', user: 'Skipped at your request.',
  'no-evidence': 'Skipped: nothing was measured, so DeckChek will not guess.', 'needs-desktop': 'Skipped: this check needs the DeckChek desktop app on Windows.'
};
function skippedFor(step, reason) {
  return skipped(step, reason, SKIP_TEXT[reason] || `Skipped (${reason}).`, reason === 'needs-desktop' ? [{label: 'Open the desktop app', text: 'Run the pre-gig check in the DeckChek desktop app on the DJ computer.'}] : []);
}

/** Evaluate one step from its evidence. Missing evidence is `skipped`, never `pass` (FS-10 §6). */
export function evaluateStep(stepId, evidence, preset, {thresholds = PREGIG_THRESHOLDS} = {}) {
  const kind = stepKind(stepId), def = STEP_BY_KIND[kind];
  if (!def) throw new RangeError(`Unknown pre-gig step: ${stepId}`);
  const deck = stepDeck(stepId);
  if (def.perDeck && !deck) throw new RangeError(`Step ${kind} needs a deck (${kind}:A)`);
  const step = {id: String(stepId), kind, deck, label: deck ? `${def.label}, deck ${deck}` : def.label, required: def.required, manual: !!def.manual};
  const ev = evidence;
  if (ev == null) return skippedFor(step, 'no-evidence');
  if (ev.skippedReason) return skippedFor(step, ev.skippedReason);
  if (ev.error) return result(step, 'error', `Check could not run: ${ev.error.message || ev.error}`, {fix: [FIX.retry]});
  if (ev.unsupported) return def.required ? skippedFor(step, 'needs-desktop') : result(step, 'unsupported', 'Not available here: this check runs in the Windows desktop app.', {reason: 'unsupported'});
  switch (kind) {
    case 'system': return evalSystem(step, ev, thresholds);
    case 'audio': return evalAudio(step, ev, preset);
    case 'timecode': return evalTimecode(step, ev, thresholds);
    case 'signal': return evalSignal(step, ev, thresholds);
    case 'headphones': return evalHeadphones(step, ev);
    case 'midi': return evalMidi(step, ev, preset);
    default: return evalSoftware(step, ev, preset, thresholds);
  }
}

const DEVICE_AREA_SKIP = new Set(['drv-generic-usb-audio', 'drv-old', 'asio-generic', 'asio-multiple', 'drv-ok']);
function evalSystem(step, ev, T) {
  const scans = [ev.drivers, ev.events].filter(s => s && s.supported !== false);
  if (!scans.length) return result(step, 'unsupported', 'Not available here: System Health scans run in the Windows desktop app.', {reason: 'unsupported'});
  const profiles = ev.profiles || [];
  const patterns = profiles.flatMap(p => (p.drivers || []).flatMap(d => d.deviceNamePatterns || [])).map(p => String(p).toLowerCase());
  const all = interpretSystemScan({drivers: ev.drivers || null, events: ev.events || null, logs: null}, {now: ev.now ?? Date.now()});
  const about = f => { const t = [f.title, ...(f.evidence || [])].join(' ').toLowerCase(); return patterns.some(p => t.includes(p)); };
  const found = all.filter(f => (f.severity === 'error' || f.severity === 'warning') &&
    (f.area === 'events' || (f.area === 'drivers' && !DEVICE_AREA_SKIP.has(f.id) && about(f))));
  if (ev.drivers && ev.drivers.supported !== false) {
    for (const p of profiles) for (const f of evaluateDriverCheck(p, ev.drivers).findings) {
      if (f.severity === 'error' || f.severity === 'warning') found.push({...f, area: 'drivers', title: `${p.model || p.id}: ${f.title}`});
    }
  }
  const seen = new Set(), list = found.filter(f => !seen.has(f.id) && seen.add(f.id)).sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1));
  const evidence = {findings: list.map(f => ({id: f.id, severity: f.severity, title: f.title})), eventDays: T.system.eventDays};
  if (!list.length) return result(step, 'pass', 'No driver or Windows event-log problems found for your gear.', {evidence});
  const state = list.some(f => f.severity === 'error') ? 'fail' : 'warn';
  const more = list.length > 1 ? ` (and ${plural(list.length - 1, 'other problem')})` : '';
  return result(step, state, `${list[0].title}${more}`, {evidence, fix: list.slice(0, 3).map(f => ({label: f.title, text: f.action}))});
}

function evalAudio(step, ev, preset) {
  if (ev.available === false) return skippedFor(step, 'needs-desktop');
  const devices = ev.devices || [], wanted = preset?.audioDevice || '';
  const hit = devices.find(d => namesMatch(d.name, wanted));
  const evidence = {wanted, found: hit ? hit.name : null, deviceCount: devices.length, sampleRate: finite(num(ev.sampleRate)) ? Number(ev.sampleRate) : null, expectedRate: preset?.sampleRate ?? null};
  if (!hit) {
    return result(step, 'fail', `Audio interface not found: ${wanted}.`, {evidence, fix: [
      {label: 'Check the connection', text: 'Plug the interface into a USB port, switch it on and wait 10 seconds. If it is still missing, try another cable or port, then run the check again.', action: {kind: 'retry'}},
      FIX.sound]});
  }
  if (evidence.sampleRate && preset?.sampleRate && evidence.sampleRate !== preset.sampleRate) {
    return result(step, 'warn', `${hit.name} runs at ${evidence.sampleRate} Hz but this setup expects ${preset.sampleRate} Hz.`, {evidence, fix: [
      {label: 'Set the sample rate', text: `Set ${hit.name} to ${preset.sampleRate} Hz in Windows Sound settings or the interface's control panel, and use the same rate in your DJ software.`, action: {kind: 'settings', target: 'ms-settings:sound'}}]});
  }
  return result(step, 'pass', `${hit.name} is connected${evidence.sampleRate ? ` at ${evidence.sampleRate} Hz` : ''}.`, {evidence});
}

/** Zero-based input channels [a, b] -> "1-2" (1-based, as interfaces label them). */
export const pairLabel = input => `${input[0] + 1}-${input[1] + 1}`;
/** First channel (1-based) of a deck's stereo input pair, or null when its two inputs are not an aligned pair (1-2, 3-4, ...). */
export function deckPairFirst(input) {
  return Array.isArray(input) && input[0] % 2 === 0 && input[1] === input[0] + 1 ? input[0] + 1 : null;
}

/** Capture-level problems shared by the two capture steps. Returns a result or null. */
function captureProblem(step, ev) {
  if (ev.inputPairUnavailable) {
    const label = pairLabel(ev.inputPairUnavailable.input);
    return skipped(step, 'input-pair', ev.inputPairUnavailable.message || `Deck ${step.deck} uses inputs ${label}, which this audio interface does not offer.`,
      [{label: 'Choose the input pair', text: `Pick the inputs deck ${step.deck} is plugged into in the Inputs box above the Start button (for example 1-2 or 3-4), or edit the preset. The interface lists the pairs it offers.`, action: {kind: 'retry'}}]);
  }
  const ce = ev.captureError;
  if (!ce) return null;
  if (ce.code === 'CAPTURE_BUSY') {
    return skipped(step, 'capture-busy', `Another DeckChek feature (${ce.holder || 'a capture'}) is using the audio input.`,
      [{label: `Stop ${ce.holder || 'it'} and continue`, text: 'Stop the other capture, then continue the pre-gig check.', action: {kind: 'preempt', holder: ce.holder || null}}]);
  }
  const msg = String(ce.message || ce);
  const sw = ev.softwareRunning && ev.audioPresent;
  if (/busy|exclusive|in use|already/i.test(msg)) {
    const name = ev.software || 'your DJ software';
    return result(step, sw ? 'warn' : 'fail', `DeckChek cannot share the audio device while ${name} holds it.`, {
      evidence: {captureError: msg}, fix: [{label: `Close ${name} or use its output`, text: `Close ${name} for this check, or judge this deck from inside ${name}. DeckChek cannot share an exclusive ASIO device.`, action: {kind: 'retry'}}]});
  }
  return result(step, 'error', `Check could not run: ${msg}`, {fix: [FIX.retry]});
}

function evalTimecode(step, ev, T) {
  const bad = captureProblem(step, ev);
  if (bad) return bad;
  const a = ev.analysis, t = T.timecode, name = `Deck ${step.deck}`;
  if (!a) return skippedFor(step, 'no-evidence');
  if (a.error) return result(step, 'error', `Check could not run: ${a.error}`, {fix: [FIX.retry]});
  const evidence = {format: a.format?.name ?? null, carrierHz: r2(a.carrierHz), snrDb: r2(a.snrDb), balanceDb: r2(a.balanceDb), phaseErrDeg: r2(a.phaseErrDeg), dropouts: a.dropouts ?? null, speedErrPct: r2(a.speedErrPct)};
  if (a.noSignal) {
    return result(step, 'fail', `No timecode is reaching the software on ${name.toLowerCase()}.`, {evidence, fix: [
      {label: 'Check the needle and cables', text: 'Put the needle on the control vinyl and let it play. Check the phono/line switch, that the RCA cables are pushed in, and that the right input is selected.', action: {kind: 'retry'}}, FIX.clean]});
  }
  const issues = [];
  const add = (state, text, fix) => issues.push({state, text, fix});
  const snr = num(a.snrDb), bal = Math.abs(num(a.balanceDb)), ph = num(a.phaseErrDeg), sp = Math.abs(num(a.speedErrPct)), dr = num(a.dropouts);
  if (!finite(snr) || snr < t.snrWarnDb) add('fail', `timecode is very noisy (SNR ${finite(snr) ? snr.toFixed(1) : '?'} dB, needs ${t.snrPassDb}+)`, FIX.clean);
  else if (snr < t.snrPassDb) add('warn', `timecode is a bit noisy (SNR ${snr.toFixed(1)} dB, needs ${t.snrPassDb}+)`, FIX.clean);
  if (finite(bal)) {
    const fix = {label: 'Swap the channels', text: 'Swap the left and right cables at the mixer. If the weak side follows the cartridge, inspect the stylus, cartridge and headshell leads; if it stays, check the cable and input.'};
    if (bal > t.balanceWarnDb) add('fail', `left and right levels differ by ${bal.toFixed(1)} dB`, fix);
    else if (bal > t.balancePassDb) add('warn', `left and right levels differ by ${bal.toFixed(1)} dB`, fix);
  }
  if (finite(ph)) {
    const fix = {label: 'Check cartridge alignment', text: 'Check the cartridge is seated square in the headshell and the headshell leads are tight, then swap cables to see if the fault follows a channel.'};
    if (ph > t.phaseWarnDeg) add('fail', `channel phase is off by ${ph.toFixed(0)} degrees`, fix);
    else if (ph > t.phasePassDeg) add('warn', `channel phase is off by ${ph.toFixed(0)} degrees`, fix);
  }
  if (finite(dr)) {
    const fix = {label: 'Look for skips and dust', text: 'Clean the record and stylus, look for scratches on the vinyl, and wiggle-test the cables while it plays.'};
    if (dr > t.dropoutsWarn) add('fail', `${plural(dr, 'dropout')} in the signal`, fix);
    else if (dr > t.dropoutsPass) add('warn', `${plural(dr, 'dropout')} in the signal`, fix);
  }
  if (finite(sp)) {
    if (sp > t.speedFailPct) add('fail', `carrier speed is ${sp.toFixed(1)}% off, which usually means the wrong timecode format`, {label: 'Check the vinyl type', text: `Check the control vinyl really is ${a.format?.name || 'the expected format'}. If it is another type, change the format in your DJ software and in this preset.`});
    else if (sp > t.speedPassPct) add('warn', `speed is ${sp.toFixed(1)}% off nominal`, {label: 'Set pitch to zero', text: 'Set the pitch fader to 0%, make sure the deck is at 33 1/3 rpm, and run the check again.'});
  }
  if (a.format?.confidence === 'unverified') add('warn', `the ${a.format.name} format is unverified`, {label: 'Treat the result with care', text: 'DeckChek has not independently confirmed this timecode format, so judge the numbers together with how the deck behaves in your software.'});
  if (!issues.length) return result(step, 'pass', `${name} timecode is clean (SNR ${snr.toFixed(1)} dB, phase error ${ph.toFixed(0)} degrees).`, {evidence});
  issues.sort((x, y) => RANK[x.state] - RANK[y.state]);
  const fixes = [], seen = new Set();
  for (const i of issues) if (!seen.has(i.fix.label)) { seen.add(i.fix.label); fixes.push(i.fix); }
  const head = issues[0].text[0].toUpperCase() + issues[0].text.slice(1);
  return result(step, worst(issues.map(i => i.state)), `${name}: ${head}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}.`, {evidence, fix: fixes});
}

function evalSignal(step, ev, T) {
  const bad = captureProblem(step, ev);
  if (bad) return bad;
  const s = ev.signal, t = T.signal, name = `Deck ${step.deck}`;
  if (!s) return skippedFor(step, 'no-evidence');
  const L = num(s.leftDbfs), R = num(s.rightDbfs);
  const evidence = {leftDbfs: r2(L), rightDbfs: r2(R), carrierDbfs: r2(num(s.carrierDbfs)), hum: s.hum ? {mainsHz: s.hum.mainsHz, totalDbfs: r2(s.hum.totalDbfs), humToFloorDb: r2(s.hum.humToFloorDb), marginDb: r2(s.hum.marginDb), measuredOn: s.hum.measuredOn} : null};
  const lowL = !(L >= t.minLevelDbfs), lowR = !(R >= t.minLevelDbfs);
  if (lowL || lowR) {
    const which = lowL && lowR ? 'both channels' : lowL ? 'the left channel' : 'the right channel';
    return result(step, 'fail', `${name}: no signal on ${which} (needs ${t.minLevelDbfs} dBFS or louder).`, {evidence, fix: [
      {label: 'Check the cable', text: `Check the RCA cable for ${which} from the turntable to the mixer or interface is pushed in, and that the phono/line switch matches the input.`, action: {kind: 'retry'}},
      {label: 'Check the mixer channel', text: `Make sure the mixer channel${s.mixerChannel ? ` (${s.mixerChannel})` : ''} is set to this deck's input and the needle is on the vinyl.`}]});
  }
  const groundFix = {label: 'Fix the hum', text: 'Check the turntable ground wire is screwed to the mixer or interface ground post, and keep power cables away from the signal cables.'};
  if (!s.hum) {
    return result(step, 'warn', `${name}: signal is present on both channels, but hum could not be measured${s.humError ? ` (${s.humError})` : ''}.`, {evidence, fix: [{label: 'Run it again', text: 'Let the record play for the full capture and run the check again.', action: {kind: 'retry'}}]});
  }
  const margin = num(s.hum.marginDb);
  if (finite(s.hum.humToFloorDb) && s.hum.humToFloorDb < t.humDetectAboveFloorDb) {
    return result(step, 'pass', `${name}: signal is present on both channels and no mains hum stands out.`, {evidence});
  }
  if (margin <= t.humFailMarginDb) return result(step, 'fail', `${name}: ${s.hum.mainsHz} Hz hum is only ${margin.toFixed(0)} dB below the timecode.`, {evidence, fix: [groundFix]});
  if (margin <= t.humWarnMarginDb) return result(step, 'warn', `${name}: ${s.hum.mainsHz} Hz hum is ${margin.toFixed(0)} dB below the timecode, which is closer than it should be.`, {evidence, fix: [groundFix]});
  return result(step, 'pass', `${name}: signal is present on both channels and hum is ${margin.toFixed(0)} dB below the timecode.`, {evidence});
}

function evalHeadphones(step, ev) {
  const a = String(ev.answer || '').toLowerCase();
  if (a === 'yes') return result(step, 'pass', 'You heard the cue clearly in both ears.', {evidence: {answer: 'yes'}});
  if (a === 'no') {
    return result(step, 'fail', 'You could not hear the cue clearly in both ears.', {evidence: {answer: 'no'}, fix: [
      {label: 'Check the cue path', text: 'Check the headphone plug is fully in, the cue (PFL) button is on for the channel, the headphone volume is up and the cue mix is not set to one side.', action: {kind: 'retry'}}]});
  }
  return skipped(step, 'user', 'You skipped the headphone check.');
}

function evalMidi(step, ev, preset) {
  if (ev.available === false) return result(step, 'unsupported', 'Not available here: MIDI ports could not be read.', {reason: 'unsupported'});
  const ports = [...(ev.inputs || []), ...(ev.outputs || [])].map(p => p.name);
  const wanted = (preset?.midi || []).map(m => (typeof m === 'string' ? {name: m, required: false} : {name: m.name, required: !!m.required}));
  const missing = wanted.filter(w => !ports.some(p => namesMatch(p, w.name)));
  const evidence = {wanted: wanted.map(w => w.name), missing: missing.map(m => m.name), portCount: ports.length};
  if (!missing.length) return result(step, 'pass', `${plural(wanted.length, 'MIDI device')} found.`, {evidence});
  const hard = missing.filter(m => m.required);
  const names = missing.map(m => m.name).join(', ');
  return result(step, hard.length ? 'fail' : 'warn', `MIDI device not found: ${names}.`, {evidence, fix: [
    {label: 'Reconnect the MIDI device', text: `Plug in and power on ${names}, check its USB cable, then run the check again. Other programs holding the MIDI port can hide it, so close them too.`, action: {kind: 'retry'}}]});
}

function evalSoftware(step, ev, preset, T) {
  const procs = ev.processes && ev.processes.supported !== false ? ev.processes : null;
  const logs = ev.logs && ev.logs.supported !== false ? ev.logs : null;
  if (!procs && !logs) return result(step, 'unsupported', 'Not available here: DJ software checks run in the Windows desktop app.', {reason: 'unsupported'});
  const want = preset?.software || '';
  const running = procs ? !!(procs.apps || []).find(a => a.running && namesMatch(a.app, want)) : null;
  const evidence = {software: want, running, crashAgeHours: null};
  const fixes = [];
  let state = 'pass', text = `${want} looks healthy.`;
  if (logs) {
    const app = (logs.apps || []).find(a => namesMatch(a.app, want));
    if (!app || !app.installed) return result(step, 'warn', `${want} was not found on this computer.`, {evidence, fix: [{label: 'Install or select the software', text: `Install ${want}, or pick the correct DJ software in this preset.`}]});
    const nowMs = ev.now ?? Date.now();
    if (preset?.expectedCrashFree !== false) {
      const ages = (app.files || []).filter(f => f.kind === 'crashDump' || f.kind === 'crashReport').map(f => (nowMs - Date.parse(f.modified)) / 3600000);
      const known = ages.filter(finite).map(a => Math.max(0, a));
      if (known.length) evidence.crashAgeHours = r2(Math.min(...known));
      if (known.length && Math.min(...known) <= T.software.crashFailHours) { state = 'fail'; text = `${want} crashed within the last hour.`; }
      else if (known.length && Math.min(...known) <= T.software.crashWarnHours) { state = 'warn'; text = `${want} crashed in the last 24 hours.`; }
      else if (ages.length > known.length) { state = 'warn'; text = `${want} has a crash record of unknown age.`; }
      if (state !== 'pass') fixes.push({label: 'Find the cause of the crash', text: 'Update the audio driver and the DJ software, and check whether a plug-in or a USB device is involved before you play.'});
    }
    if (state === 'pass') {
      const old = evaluateSoftwareCheck(ev.profile || null, want, logs).findings.find(f => f.id === 'software-old');
      if (old) { state = 'warn'; text = old.title; fixes.push({label: 'Update the software', text: old.action}); }
    }
  }
  if (state === 'pass' && procs && preset?.expectSoftwareRunning !== false && !running) {
    state = 'warn'; text = `${want} is not running yet.`;
    fixes.push({label: `Start ${want}`, text: `Open ${want}, load a track on each deck, then run the check again.`, action: {kind: 'retry'}});
  }
  if (state === 'pass' && running) text = `${want} is running and shows no recent crashes.`;
  return result(step, state, text, {evidence, fix: fixes});
}

// ---------------------------------------------------------------- roll-up
/**
 * Verdict from step results (FS-10 AC-2, AC-5). Any fail is RED; otherwise any warning or crashed
 * check is AMBER; otherwise a skipped required step (or nothing measured at all) is `incomplete`, shown
 * as amber; `unsupported` steps are excluded and mark the check `partial`.
 */
export function rollUp(results, {cancelled = false} = {}) {
  const list = results || [];
  const counted = list.filter(r => r.state !== 'unsupported');
  const n = s => counted.filter(r => r.state === s).length;
  const counts = {pass: n('pass'), warn: n('warn'), fail: n('fail'), error: n('error'), skipped: n('skipped'), unsupported: list.length - counted.length};
  const skippedRequired = counted.filter(r => r.state === 'skipped' && r.required);
  const partial = counts.unsupported > 0, measured = counts.pass + counts.warn + counts.fail + counts.error;
  let verdict;
  if (cancelled) verdict = 'cancelled';
  else if (counts.fail) verdict = 'red';
  else if (counts.warn || counts.error) verdict = 'amber';
  else if (skippedRequired.length || !measured) verdict = 'incomplete';
  else verdict = 'green';
  const order = r => (r.state === 'fail' ? 0 : r.state === 'error' ? 1 : r.state === 'warn' ? 2 : 3);
  const top = counted.filter(r => r.state === 'fail' || r.state === 'warn' || r.state === 'error' || (r.state === 'skipped' && r.required))
    .map((r, i) => ({r, i})).sort((a, b) => order(a.r) - order(b.r) || a.i - b.i).map(x => x.r).slice(0, 3);
  const level = verdict === 'green' ? 'green' : verdict === 'red' ? 'red' : 'amber';
  return {verdict, level, partial, incomplete: skippedRequired.length > 0 || (!measured && !cancelled), counts, top, copy: verdictCopy({verdict, counts, partial, top, total: counted.length})};
}

/** Banner sentence for a roll-up (FS-10 §3 key copy). */
export function verdictCopy({verdict, counts, partial, top, total}) {
  const tail = partial ? ' Partial check: some checks only run in the Windows desktop app.' : '';
  if (verdict === 'cancelled') return `Cancelled. ${plural(counts.pass + counts.warn + counts.fail + counts.error, 'check')} finished first.`;
  if (verdict === 'green') return `Ready to play. ${counts.pass} of ${total} checks passed.${tail}`;
  if (verdict === 'red') return `Not ready: ${top[0]?.summary || 'a check failed.'}${tail}`;
  if (verdict === 'amber') return `Playable, with ${plural(counts.warn + counts.error + counts.skipped, 'thing')} to look at.${tail}`;
  return `Incomplete: ${plural(counts.skipped, 'check')} did not run, so DeckChek cannot say you are ready.${tail}`;
}

// ---------------------------------------------------------------- run comparison
/** Compare two runs (or step arrays): which steps changed state, and whether each got better or worse. */
export function diffRuns(a, b) {
  const steps = r => (Array.isArray(r) ? r : r?.results || r?.steps || []);
  const A = new Map(steps(a).map(s => [s.stepId, s])), B = new Map(steps(b).map(s => [s.stepId, s]));
  const changed = [], added = [], removed = [];
  let unchanged = 0;
  for (const [id, to] of B) {
    const from = A.get(id);
    if (!from) { added.push(id); continue; }
    if (from.state === to.state) { unchanged++; continue; }
    changed.push({stepId: id, from: from.state, to: to.state, trend: RANK[to.state] > RANK[from.state] ? 'better' : 'worse', summaryFrom: from.summary, summaryTo: to.summary});
  }
  for (const id of A.keys()) if (!B.has(id)) removed.push(id);
  return {verdictFrom: a?.verdict ?? null, verdictTo: b?.verdict ?? null, changed, added, removed, unchanged};
}

// ---------------------------------------------------------------- presets
const RATES = [44100, 48000, 88200, 96000, 192000];
const DECK_IDS = ['A', 'B', 'C', 'D'];

/** v1 is current; unknown higher versions are kept read-only with a notice (FS-10 §5). */
export function migratePreset(p) {
  if (!isObj(p)) return {preset: null, readOnly: false, notice: 'Not a preset.'};
  const v = Number(p.v ?? 1);
  if (!Number.isInteger(v) || v < 1) return {preset: null, readOnly: false, notice: 'Preset has no valid version.'};
  if (v > PRESET_VERSION) return {preset: p, readOnly: true, notice: `This preset was made by a newer DeckChek (version ${v}). It is shown read-only.`};
  return {preset: {...p, v: PRESET_VERSION}, readOnly: false, notice: null};
}

/** Check a preset. `knownProfileIds` (optional Set/array) also verifies gear profile references. */
export function validatePreset(p, {knownProfileIds = null, formats = undefined} = {}) {
  const errors = [], warnings = [];
  const m = migratePreset(p);
  if (!m.preset) return {ok: false, errors: [{field: 'preset', message: m.notice}], warnings, readOnly: false, preset: null};
  if (m.readOnly) return {ok: true, errors, warnings: [{field: 'v', message: m.notice}], readOnly: true, preset: m.preset};
  const q = m.preset, err = (field, message) => errors.push({field, message});
  const name = String(q.name ?? '').trim();
  if (!name || name.length > 100) err('name', 'Give the preset a name of 1 to 100 characters.');
  if (!String(q.audioDevice ?? '').trim()) err('audioDevice', 'Name the audio interface the decks are plugged into.');
  if (q.software != null && typeof q.software !== 'string') err('software', 'Software must be a name such as "Traktor Pro".');
  if (!RATES.includes(Number(q.sampleRate))) err('sampleRate', `Sample rate must be one of ${RATES.join(', ')} Hz.`);
  if (!Array.isArray(q.decks) || !q.decks.length || q.decks.length > 4) err('decks', 'A preset needs 1 to 4 decks.');
  else {
    const seen = new Set();
    q.decks.forEach((d, i) => {
      const f = `decks[${i}]`;
      if (!d || !DECK_IDS.includes(d.id)) err(`${f}.id`, 'Deck id must be A, B, C or D.');
      else if (seen.has(d.id)) err(`${f}.id`, `Deck ${d.id} is listed twice.`);
      else seen.add(d.id);
      if (!Array.isArray(d?.input) || d.input.length !== 2 || !d.input.every(n => Number.isInteger(n) && n >= 0 && n < 64) || d.input[0] === d.input[1]) err(`${f}.input`, 'Input must be two different channel numbers, for example [0, 1].');
      const fmt = d?.format && (formats ? findFormat(d.format, formats) : findFormat(d.format));
      if (!d?.format) err(`${f}.format`, 'Choose the timecode format of the control vinyl.');
      else if (!fmt) err(`${f}.format`, `Unknown timecode format "${d.format}".`);
      else if (fmt.confidence === 'unverified') warnings.push({field: `${f}.format`, message: `${fmt.name} is unverified; the check will warn "format unverified".`});
    });
    const used = q.decks.flatMap(d => d?.input || []);
    if (new Set(used).size !== used.length) err('decks', 'Two decks use the same input channel.');
  }
  if (q.midi != null) {
    if (!Array.isArray(q.midi) || !q.midi.every(x => (typeof x === 'string' && x.trim()) || (isObj(x) && String(x.name || '').trim()))) err('midi', 'MIDI devices must be names (or {name, required}).');
  }
  if (q.profileIds != null) {
    if (!isObj(q.profileIds)) err('profileIds', 'profileIds must be an object.');
    else if (knownProfileIds) {
      const known = knownProfileIds instanceof Set ? knownProfileIds : new Set(knownProfileIds);
      for (const [k, v] of Object.entries(q.profileIds)) for (const id of [].concat(v)) if (!known.has(id)) err(`profileIds.${k}`, `Unknown gear profile "${id}".`);
    }
  }
  return {ok: !errors.length, errors, warnings, readOnly: false, preset: q};
}

/** Parse imported preset JSON: rejects over 256 kB and anything that fails validation. */
export function parsePresetJson(text, opts = {}) {
  const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(String(text)).length : String(text).length;
  if (bytes > MAX_PRESET_BYTES) return {ok: false, errors: [{field: 'file', message: 'That file is larger than 256 kB, so it is not a preset.'}], warnings: [], preset: null};
  let data;
  try { data = JSON.parse(text); } catch { return {ok: false, errors: [{field: 'file', message: 'That file is not valid JSON.'}], warnings: [], preset: null}; }
  return validatePreset(data, opts);
}
export const exportPresetJson = preset => JSON.stringify({...preset}, null, 2);
export function duplicatePreset(preset, {id, name} = {}) {
  const {id: _drop, builtin: _b, ...rest} = preset;
  return {...rest, ...(id ? {id} : {}), name: name || `${preset.name} (copy)`};
}

/**
 * Timecode format name for a media-library entry (app/media-library.js): resolved through TIMECODE_FORMATS, falling
 * back to the profile's own formatName. `media` is a list of library entries ({id, profile}), a Map or an id->entry object.
 * Returns '' for an unknown id or a medium that is not a timecode disc.
 */
export function formatForMedia(mediaId, media) {
  if (!mediaId) return '';
  const entry = media instanceof Map ? media.get(mediaId) : Array.isArray(media) ? media.find(e => e?.id === mediaId) : media?.[mediaId];
  return toTimecodeFormat(entry)?.name || (entry?.profile ?? entry)?.timecode?.formatName || '';
}

/**
 * Build a preset from chosen gear (FS-10 AC-8 "from the current Equipment selection").
 * @param {{turntables?:string[], mixer?:string, interface?:string, controller?:string, media?:string, software?:string, decks?:number}} sel profile ids
 * @param {Object<string,object>|Map} profiles id -> device profile
 * @param {{media?: Array|Map|object}} [opts] media-library entries; `sel.media` is a media-library id and sets the deck format
 */
export function presetFromEquipment(sel, profiles, {media = []} = {}) {
  const get = id => (profiles instanceof Map ? profiles.get(id) : profiles?.[id]) || null;
  const audioSource = [sel.interface, sel.controller, sel.mixer].map(get).find(p => p?.drivers?.some(d => (d.deviceNamePatterns || []).length)) || get(sel.interface) || get(sel.controller) || get(sel.mixer);
  const audioDevice = audioSource?.drivers?.find(d => (d.deviceNamePatterns || []).length)?.deviceNamePatterns[0] || audioSource?.model || '';
  const format = formatForMedia(sel.media, media);
  const software = sel.software || [audioSource, get(sel.mixer), get(sel.controller)].filter(Boolean).flatMap(p => p.software || []).sort((a, b) => (b.role === 'dvs') - (a.role === 'dvs'))[0]?.name || '';
  const count = Math.min(4, Math.max(1, sel.decks || (sel.turntables || []).length || 2));
  const decks = Array.from({length: count}, (_, i) => ({id: DECK_IDS[i], input: [i * 2, i * 2 + 1], format, mixerChannel: String(i + 1)}));
  const label = [get(sel.turntables?.[0])?.model, audioSource?.model, software].filter(Boolean).join('+');
  const profileIds = {};
  if (sel.turntables?.length) profileIds.turntables = [...sel.turntables];
  for (const k of ['mixer', 'interface', 'controller']) if (sel[k]) profileIds[k] = sel[k];
  if (sel.media && get(sel.media)) profileIds.media = sel.media; // legacy gear-library media profile, if one exists
  return {v: PRESET_VERSION, name: label || 'My rig', software, audioDevice, sampleRate: 48000, decks, mixer: get(sel.mixer)?.model || '', midi: [], expectedCrashFree: true, profileIds, ...(sel.media ? {mediaId: sel.media} : {})};
}

/** Load the built-in presets; each is validated and bad ones are reported, never thrown. */
export async function loadBuiltinPresets(fetchJson = async url => { const r = await fetch(url, {cache: 'no-store'}); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }, {base = new URL('./pregig-presets.json', import.meta.url).href, knownProfileIds = null} = {}) {
  const presets = [], problems = [];
  try {
    const file = await fetchJson(base);
    for (const p of file?.presets || []) {
      const v = validatePreset(p, {knownProfileIds});
      if (v.ok) presets.push({...v.preset, id: p.id, builtin: true}); else problems.push({id: p?.id ?? null, errors: v.errors});
    }
  } catch (e) { problems.push({id: null, errors: [{field: 'file', message: String(e?.message || e)}]}); }
  return {presets, problems};
}

// ---------------------------------------------------------------- evidence from a capture
/** Plain numbers from an analyzeTimecode result (what `evaluateStep('timecode:X')` consumes). */
export function summarizeTimecode(analysis) {
  if (!analysis || analysis.error) return {error: analysis?.error || 'No analysis', format: analysis?.format ? {name: analysis.format.name, confidence: analysis.format.confidence} : null};
  const m = id => num(analysis.measurements.find(x => x.metricId === id)?.value);
  const snrDb = m('tc_snr_db');
  return {
    format: {name: analysis.format.name, confidence: analysis.format.confidence},
    carrierHz: m('tc_carrier_hz'), snrDb, balanceDb: m('tc_balance_db'), phaseErrDeg: m('tc_phase_error_deg'),
    speedErrPct: m('tc_speed_error_percent'), dropouts: m('tc_dropouts'),
    noSignal: analysis.findings.some(f => f.id === 'tc-no-signal') || !finite(snrDb)
  };
}

function humOf(samples, sampleRate, carrierPeakDbfs, measuredOn) {
  try {
    const h = humMeasure(samples, sampleRate, {mains: 'auto'});
    return {hum: {mainsHz: h.mainsHz, totalDbfs: h.totalDbfs, humToFloorDb: h.humToFloorDb, marginDb: carrierPeakDbfs - h.totalDbfs, measuredOn}};
  } catch (e) { return {humError: e.message}; }
}

/**
 * Analyse one deck capture for both deck steps. Hum is measured on each channel after fitting out the
 * timecode carrier (or, with `needleUp`, on the needle-lifted segment) and the worse channel counts.
 * @param {{left:ArrayLike<number>,right:ArrayLike<number>,sampleRate:number}} capture
 * @param {{format:string, formats?:object[], needleUp?:object}} o
 * @returns {{analysis:object, signal:object}} evidence for `timecode:X` and `signal:X`
 */
export function analyzeDeckCapture(capture, {format, formats, needleUp = null} = {}) {
  const analysis = analyzeTimecode(capture, {format, ...(formats ? {formats} : {})});
  const tc = summarizeTimecode(analysis);
  const sr = capture.sampleRate, ch = {left: capture.left, right: capture.right};
  const level = x => dbfs(rms(x));
  const peak = x => dbfs(rms(x) * Math.SQRT2);
  const signal = {leftDbfs: level(ch.left), rightDbfs: level(ch.right), carrierDbfs: Math.max(peak(ch.left), peak(ch.right))};
  if (!tc.error && !tc.noSignal && signal.leftDbfs > -90) {
    const picks = [];
    for (const side of ['left', 'right']) {
      let src = null;
      if (needleUp) src = needleUp[side];
      else if (finite(tc.carrierHz)) { try { src = removeTone(ch[side], sr, tc.carrierHz); } catch { src = null; } }
      if (!src) continue;
      const h = humOf(src, needleUp ? needleUp.sampleRate || sr : sr, peak(ch[side]), needleUp ? 'needle-up' : 'carrier-removed');
      picks.push(h);
    }
    const ok = picks.filter(p => p.hum);
    if (ok.length) Object.assign(signal, {hum: ok.reduce((w, p) => (p.hum.marginDb < w.hum.marginDb ? p : w)).hum});
    else if (picks[0]?.humError) signal.humError = picks[0].humError;
  }
  return {analysis: tc, signal};
}

// ---------------------------------------------------------------- orchestrator
const isoOf = ms => new Date(ms).toISOString();
const bridgeNames = d => (d.inputs || d.devices || []).map(x => (typeof x === 'string' ? {name: x} : x));

/**
 * Run the enabled steps of a plan. Parallel steps (system, audio, midi, software) run together first;
 * deck steps follow one deck at a time with a single capture shared by `timecode:X` and `signal:X`.
 * `deps` are injected (see createNativeDeps): listInputs, scans {drivers, events, logs}, processes, midiPorts,
 * captureDeck({deck, deckDef, preset, pair, seconds, needleUp, signal}) (`pair` = first channel, 1-based), askHeadphones, askNeedleUp, confirmPreempt, preempt.
 * Esc/abort: remaining steps become `skipped (cancelled)` and the verdict is `cancelled`. Time spent waiting for
 * the user (manual steps) is reported as manualMs and excluded from durationMs.
 */
export async function runPregig({preset, deps = {}, signal = null, onStep = () => {}, now = () => Date.now(), skip = [], only = null, thresholds = PREGIG_THRESHOLDS, profiles = []} = {}) {
  const plan = buildPlan(preset, {skip, only});
  const results = new Map(), startedMs = now();
  let manualMs = 0;
  const aborted = () => signal?.aborted === true;
  const manual = async fn => { const t = now(); try { return await fn(); } finally { manualMs += now() - t; } };
  const finish = (step, r) => { results.set(step.id, r); onStep({stepId: step.id, state: r.state, result: r, done: results.size, total: plan.length}); };
  const deckEvidence = new Map();
  const softwareRunning = () => results.get('software')?.evidence?.running === true;

  async function captureOnce(step) {
    const deckDef = preset.decks.find(d => d.id === step.deck), key = step.deck;
    if (deckEvidence.has(key)) return deckEvidence.get(key);
    const p = (async () => {
      if (!deps.captureDeck) return {unsupported: true};
      const pair = deckPairFirst(deckDef.input);
      if (pair == null) return {inputPairUnavailable: {input: deckDef.input, message: `Deck ${step.deck} uses inputs ${pairLabel(deckDef.input)}, which are not a stereo pair. Stereo pairs are 1-2, 3-4, 5-6 and so on.`}};
      const base = {deck: step.deck, deckDef, preset, signal, pair};
      const evBase = {software: preset.software, softwareRunning: softwareRunning(), audioPresent: results.get('audio')?.state === 'pass' || results.get('audio')?.state === 'warn'};
      let cap;
      try {
        try { cap = await deps.captureDeck({...base, seconds: thresholds.timecode.captureSec}); }
        catch (e) {
          if (e?.code === 'CAPTURE_BUSY' && deps.confirmPreempt && await manual(() => deps.confirmPreempt(e))) {
            await deps.preempt?.(); cap = await deps.captureDeck({...base, seconds: thresholds.timecode.captureSec});
          } else throw e;
        }
      } catch (e) {
        const message = String(e?.message || e);
        // The native side names the pairs the interface does offer ("Input pair 3-4 is not available on ...").
        if (!e?.code && /^Input pair \d+-\d+ is not available/.test(message)) return {...evBase, inputPairUnavailable: {input: deckDef.input, message: `Deck ${step.deck}: ${message}`}};
        return {...evBase, captureError: e?.code ? {code: e.code, holder: e.holder ?? null, message: e.message} : {message}};
      }
      let needleUp = null;
      if (preset.requireNeedleUpHum && deps.askNeedleUp) {
        const ok = await manual(() => deps.askNeedleUp(step.deck));
        if (ok) { try { needleUp = await deps.captureDeck({...base, seconds: thresholds.signal.needleUpSec, needleUp: true}); } catch { needleUp = null; } }
      }
      const a = analyzeDeckCapture(cap, {format: deckDef.format, needleUp});
      return {...evBase, analysis: a.analysis, signal: {...a.signal, mixerChannel: deckDef.mixerChannel}};
    })();
    deckEvidence.set(key, p);
    return p;
  }

  const collectors = {
    async system() {
      if (!deps.scans) return {unsupported: true};
      const [drivers, events] = await Promise.all([deps.scans.drivers?.(), deps.scans.events?.({days: thresholds.system.eventDays})]);
      return {drivers, events, profiles, now: now()};
    },
    async audio() {
      if (!deps.listInputs) return {available: false};
      const devices = await deps.listInputs();
      if (!devices) return {available: false};
      return {available: true, devices: bridgeNames({devices}), sampleRate: deps.defaultRate ? await deps.defaultRate(preset.audioDevice) : null};
    },
    async midi() {
      if (!deps.midiPorts) return {available: false};
      const p = await deps.midiPorts();
      return p ? {available: true, inputs: p.inputs || [], outputs: p.outputs || []} : {available: false};
    },
    async software() {
      if (!deps.processes && !deps.scans?.logs) return {unsupported: true};
      const [processes, logs] = await Promise.all([deps.processes?.(), deps.scans?.logs?.()]);
      const profile = profiles.find(p => (p.software || []).some(s => namesMatch(s.name, preset.software))) || null;
      return {processes, logs, profile, now: now()};
    },
    timecode: step => captureOnce(step),
    signal: step => captureOnce(step),
    async headphones() {
      if (!deps.askHeadphones) return {skippedReason: 'no-evidence'};
      return {answer: await manual(() => deps.askHeadphones())};
    }
  };

  async function runStep(step) {
    if (aborted()) return finish(step, skippedFor(step, 'cancelled'));
    if (!step.enabled) return finish(step, skippedFor(step, 'user'));
    const blocker = step.needs.map(id => results.get(id)).find(r => r && r.state === 'fail');
    if (blocker) return finish(step, skippedFor(step, 'blocked'));
    onStep({stepId: step.id, state: 'running', result: null, done: results.size, total: plan.length});
    let ev;
    try { ev = await collectors[step.kind](step); } catch (e) { ev = {error: {message: String(e?.message || e)}}; }
    finish(step, evaluateStep(step.id, ev, preset, {thresholds}));
  }

  await Promise.all(plan.filter(s => s.parallel).map(runStep));
  for (const step of plan.filter(s => !s.parallel)) await runStep(step);

  const ordered = plan.map(s => results.get(s.id));
  const endMs = now(), cancelled = aborted();
  const rollup = rollUp(ordered, {cancelled});
  const durationMs = Math.max(0, endMs - startedMs - manualMs);
  return {presetId: preset.id ?? null, presetName: preset.name, startedAt: isoOf(startedMs), finishedAt: isoOf(endMs), durationMs, manualMs, cancelled, results: ordered, rollup, verdict: rollup.verdict, withinBudget: durationMs <= PREGIG_BUDGET_MS};
}

/** Real dependencies from the Tauri `invoke` (or none: every check then reports it needs the desktop app). */
export function createNativeDeps(invoke, {sleep = (ms, sig) => new Promise(res => { const t = setTimeout(res, ms); sig?.addEventListener?.('abort', () => { clearTimeout(t); res(); }, {once: true}); })} = {}) {
  if (typeof invoke !== 'function') return {};
  const bridge = createSystemBridge(invoke);
  const toF32 = a => (a instanceof Float32Array ? a : Float32Array.from(a || []));
  return {
    listInputs: () => invoke('list_native_audio_inputs'),
    scans: {drivers: () => bridge.scanDrivers(), events: o => bridge.scanEvents(o), logs: () => bridge.scanDjLogs()},
    processes: () => invoke('pregig_processes'),
    midiPorts: () => invoke('midi_list_ports'),
    async captureDeck({preset, pair = 1, seconds, signal}) {
      const names = await invoke('list_native_audio_inputs');
      const device = (names || []).find(d => namesMatch(d.name, preset.audioDevice))?.name ?? null;
      // Deck B on inputs 3-4 captures pair 3; the default pair 1-2 keeps the old argument shape.
      const info = await invoke('start_live_capture', {deviceName: device, maxSeconds: seconds + 2, holder: PREGIG_HOLDER, ...(pair > 1 ? {pairs: [pair]} : {})});
      let done;
      // Stop names our own lease: if another feature took the input meanwhile this rejects
      // ("stopped because another DeckChek feature ...") instead of stopping its capture.
      try { await sleep(seconds * 1000, signal); } finally { done = await invoke('stop_live_capture', {leaseId: info?.leaseId}); }
      const p = done.payload;
      return {left: toF32(p.left), right: toF32(p.right), sampleRate: p.sampleRate, deviceName: p.deviceName};
    },
    // "Stop … and continue" goes through the shared preempt, so a session started on this page
    // (e.g. Quick Check) is stopped by its own controller and its owner is told.
    preempt: () => preemptCapture({tauri: {core: {invoke}}})
  };
}

// ---------------------------------------------------------------- persistence
const REDACT = /[A-Za-z]:\\Users\\[^\\\s"']+/g;
/** Replace Windows user-profile paths with %USERPROFILE% in every string (FS-10 §7). */
export function redactPaths(v) {
  if (typeof v === 'string') return v.replace(REDACT, '%USERPROFILE%');
  if (Array.isArray(v)) return v.map(redactPaths);
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactPaths(x)]));
  return v;
}

/** Payload for `pregig_save_run` from a finished `runPregig` result. */
export function toRunInput(run, {appVersion = '0.0.0', sessionId = null, venueId = null, notes = null} = {}) {
  const dbState = s => (STEP_STATES.includes(s) ? s : 'error');
  return {
    presetId: run.presetId && !String(run.presetId).startsWith('builtin-') ? run.presetId : null,
    sessionId, venueId, startedAt: run.startedAt, finishedAt: run.finishedAt, verdict: run.verdict, durationMs: Math.round(run.durationMs), appVersion, notes,
    steps: run.results.map(r => ({stepId: r.stepId, deck: r.deck, state: dbState(r.state), summary: redactPaths(r.summary).slice(0, 500), evidence: redactPaths({...r.evidence, ...(r.reason ? {reason: r.reason} : {})}), fix: redactPaths(r.fix)}))
  };
}

const LS_RUNS = 'deckchek.pregig.runs.v1', LS_PRESETS = 'deckchek.pregig.presets.v1', LS_MAX = 100;
/** Run and preset store: native commands in the app, localStorage in the browser. */
export function createPregigApi({invoke = globalThis.window?.__TAURI__?.core?.invoke, storage = globalThis.localStorage ?? null, now = () => new Date().toISOString(), newId = () => globalThis.crypto?.randomUUID?.() ?? `pg-${Date.now()}-${Math.random().toString(16).slice(2)}`} = {}) {
  if (typeof invoke === 'function') {
    return {native: true,
      saveRun: run => invoke('pregig_save_run', {run}),
      listRuns: (presetId = null, limit = null) => invoke('pregig_list_runs', {presetId, limit}),
      getRun: id => invoke('pregig_get_run', {id}),
      listPresets: () => invoke('pregig_preset_list'),
      upsertPreset: preset => invoke('pregig_preset_upsert', {preset}),
      deletePreset: id => invoke('pregig_preset_delete', {id})};
  }
  const read = key => { try { const v = JSON.parse(storage?.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const write = (key, list) => { try { storage?.setItem(key, JSON.stringify(list)); } catch { /* storage unavailable: nothing to do */ } };
  const summary = r => { const {steps, ...run} = r; return {...run, stepCount: steps.length, failCount: steps.filter(s => s.state === 'fail' || s.state === 'error').length, warnCount: steps.filter(s => s.state === 'warn').length}; };
  return {native: false,
    async saveRun(run) { const id = newId(); write(LS_RUNS, [{...run, id}, ...read(LS_RUNS)].slice(0, LS_MAX)); return {id}; },
    async listRuns(presetId = null, limit = null) { return read(LS_RUNS).filter(r => presetId == null || r.presetId === presetId).slice(0, limit || LS_MAX).map(summary); },
    async getRun(id) {
      const r = read(LS_RUNS).find(x => x.id === id);
      return r ? {run: summary(r), steps: r.steps.map((s, i) => ({id: `${id}-${i}`, runId: id, ...s}))} : null;
    },
    async listPresets() { return read(LS_PRESETS).sort((a, b) => a.name.localeCompare(b.name)); },
    async upsertPreset(preset) {
      const list = read(LS_PRESETS), t = now(), i = preset.id ? list.findIndex(p => p.id === preset.id) : -1;
      const row = {id: preset.id || newId(), name: preset.name.trim(), builtin: false, setupId: preset.setupId ?? null, json: preset.json, createdAt: i >= 0 ? list[i].createdAt : t, updatedAt: t};
      if (i >= 0) list[i] = row; else list.push(row);
      write(LS_PRESETS, list); return row;
    },
    async deletePreset(id) { const l = read(LS_PRESETS), k = l.filter(p => p.id !== id); write(LS_PRESETS, k); return k.length !== l.length; }};
}
