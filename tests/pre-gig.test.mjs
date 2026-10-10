// FS-10 pre-gig check: every step rule at its boundaries (pass / amber / red + a plain-English fix),
// verdict roll-up, plan, presets, run diff, synthetic-signal evidence, orchestrator and store bridge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { quadratureTimecode, humMix } from './fixtures/signals.mjs';
import {
  PREGIG_STEPS, PREGIG_THRESHOLDS, buildPlan, estimateBudgetMs, evaluateStep, rollUp, diffRuns, validatePreset, parsePresetJson,
  migratePreset, duplicatePreset, exportPresetJson, presetFromEquipment, formatForMedia, deckPairFirst, pairLabel, loadBuiltinPresets, analyzeDeckCapture, summarizeTimecode,
  runPregig, createNativeDeps, toRunInput, redactPaths, createPregigApi, namesMatch, stepKind, stepDeck, MAX_PRESET_BYTES,
} from '../app/pre-gig.js';
import { analyzeTimecode } from '../app/timecode.js';

const PRESETS = JSON.parse(readFileSync(new URL('../app/pregig-presets.json', import.meta.url), 'utf8'));
const PRESET = { ...PRESETS.presets[0] };
const PROFILE_DIR = new URL('../app/devices/profiles/', import.meta.url);
const PROFILES = Object.fromEntries(readdirSync(PROFILE_DIR).filter(f => f.endsWith('.json')).map(f => { const p = JSON.parse(readFileSync(new URL(f, PROFILE_DIR), 'utf8')); return [p.id, p]; }));
const CONTRACT = JSON.parse(readFileSync(new URL('./contracts/pregig.json', import.meta.url), 'utf8'));
const T = PREGIG_THRESHOLDS;

const tc = (over = {}) => ({ analysis: { format: { name: 'Traktor Scratch MK2', confidence: 'confirmed' }, carrierHz: 2500, snrDb: 31, balanceDb: 0.2, phaseErrDeg: 2, dropouts: 0, speedErrPct: 0.1, noSignal: false, ...over } });
const ev = (over) => evaluateStep('timecode:A', tc(over), PRESET);
const hasFix = r => r.fix.length > 0 && r.fix.every(f => f.label && f.text);

// ---------------------------------------------------------------- timecode rule boundaries
test('timecode: clean deck passes with no fix needed', () => {
  const r = ev();
  assert.equal(r.state, 'pass');
  assert.match(r.summary, /Deck A timecode is clean/);
});

test('timecode SNR: 25 passes, 24.9 amber, 20 amber, 19.9 red (AC-3 action and DVS link)', () => {
  assert.equal(ev({ snrDb: 25 }).state, 'pass');
  for (const [snr, state] of [[24.9, 'warn'], [20, 'warn'], [19.9, 'fail']]) {
    const r = ev({ snrDb: snr });
    assert.equal(r.state, state, `SNR ${snr}`);
    const clean = r.fix.find(f => f.text === 'Clean stylus and control vinyl, check phono/line switch');
    assert.ok(clean, 'AC-3 action text');
    assert.deepEqual(clean.action, { kind: 'navigate', to: 'dvs' });
  }
});

test('timecode balance: 1.5 passes, 1.6 amber, 3 amber, 3.1 red, sign does not matter', () => {
  for (const [b, state] of [[1.5, 'pass'], [-1.5, 'pass'], [1.6, 'warn'], [-3, 'warn'], [3.1, 'fail'], [-3.1, 'fail']]) {
    const r = ev({ balanceDb: b });
    assert.equal(r.state, state, `balance ${b}`);
    if (state !== 'pass') assert.ok(r.fix.some(f => /Swap the left and right cables/.test(f.text)));
  }
});

test('timecode phase error: 10 passes, 10.1 amber, 20 amber, 20.1 red', () => {
  for (const [p, state] of [[10, 'pass'], [10.1, 'warn'], [20, 'warn'], [20.1, 'fail']]) {
    const r = ev({ phaseErrDeg: p });
    assert.equal(r.state, state, `phase ${p}`);
    if (state !== 'pass') assert.ok(r.fix.some(f => /cartridge/.test(f.text)));
  }
});

test('timecode dropouts: 0 passes, 1 amber, 2 red', () => {
  for (const [d, state] of [[0, 'pass'], [1, 'warn'], [2, 'fail']]) {
    const r = ev({ dropouts: d });
    assert.equal(r.state, state, `dropouts ${d}`);
    if (state !== 'pass') assert.ok(r.fix.some(f => /Clean the record and stylus/.test(f.text)));
  }
});

test('timecode speed: 1% passes, 1.1% amber (pitch), 5% amber, 5.1% red means wrong format', () => {
  for (const [s, state] of [[1, 'pass'], [-1, 'pass'], [1.1, 'warn'], [-5, 'warn'], [5.1, 'fail'], [-12, 'fail']]) {
    assert.equal(ev({ speedErrPct: s }).state, state, `speed ${s}`);
  }
  const wrong = ev({ speedErrPct: 8 });
  assert.match(wrong.summary, /wrong timecode format/);
  assert.match(wrong.fix[0].text, /Traktor Scratch MK2/);
  assert.match(ev({ speedErrPct: 2 }).fix[0].text, /pitch fader to 0%/);
});

test('timecode: worst metric wins, every issue gets one fix, unverified format warns', () => {
  const r = ev({ snrDb: 22, balanceDb: 4, dropouts: 1 });
  assert.equal(r.state, 'fail');
  assert.match(r.summary, /\(\+2 more\)/);
  assert.equal(new Set(r.fix.map(f => f.label)).size, r.fix.length);
  const u = ev({ format: { name: 'Final Scratch', confidence: 'unverified' } });
  assert.equal(u.state, 'warn');
  assert.match(u.summary, /unverified/);
  assert.ok(hasFix(u));
});

test('timecode: no signal is red with needle, switch and cable advice; missing evidence is skipped, errors are amber-level error', () => {
  const r = ev({ noSignal: true, snrDb: NaN });
  assert.equal(r.state, 'fail');
  assert.match(r.fix[0].text, /needle on the control vinyl/);
  assert.match(r.fix[0].text, /phono\/line switch/);
  assert.equal(evaluateStep('timecode:A', null, PRESET).state, 'skipped');
  assert.equal(evaluateStep('timecode:A', {}, PRESET).state, 'skipped');
  const e = evaluateStep('timecode:A', { analysis: { error: 'Recording too short for timecode analysis.' } }, PRESET);
  assert.equal(e.state, 'error');
  assert.match(e.summary, /^Check could not run:/);
  assert.ok(hasFix(e));
});

test('timecode: capture problems become actions, not crashes', () => {
  const busy = evaluateStep('timecode:A', { captureError: { code: 'CAPTURE_BUSY', holder: 'live-monitor' } }, PRESET);
  assert.equal(busy.state, 'skipped');
  assert.equal(busy.fix[0].label, 'Stop live-monitor and continue');
  assert.equal(busy.fix[0].action.kind, 'preempt');
  const asio = { captureError: { message: 'The audio device is busy' }, software: 'Traktor Pro' };
  assert.equal(evaluateStep('timecode:A', asio, PRESET).state, 'fail');
  assert.equal(evaluateStep('timecode:A', { ...asio, softwareRunning: true, audioPresent: true }, PRESET).state, 'warn');
  assert.match(evaluateStep('timecode:A', asio, PRESET).fix[0].text, /cannot share an exclusive ASIO device/);
  const pair = evaluateStep('timecode:B', { inputPairUnavailable: { input: [2, 3] } }, PRESET);
  assert.equal(pair.state, 'skipped');
  assert.equal(pair.reason, 'input-pair');
  assert.match(pair.summary, /inputs 3-4/);
  assert.equal(evaluateStep('timecode:A', { captureError: { message: 'stream broke' } }, PRESET).state, 'error');
});

// ---------------------------------------------------------------- signal and hum
const sig = (over = {}) => ({ signal: { leftDbfs: -9, rightDbfs: -9, carrierDbfs: -6, mixerChannel: '1', hum: { mainsHz: 50, totalDbfs: -60, humToFloorDb: 20, marginDb: 54, measuredOn: 'carrier-removed' }, ...over } });
const sv = over => evaluateStep('signal:A', sig(over), PRESET);

test('signal level: -50 dBFS passes, -50.1 on either channel is red and names the channel', () => {
  assert.equal(sv({ leftDbfs: -50, rightDbfs: -50 }).state, 'pass');
  const l = sv({ leftDbfs: -50.1 });
  assert.equal(l.state, 'fail');
  assert.match(l.summary, /left channel/);
  assert.match(sv({ rightDbfs: -80 }).summary, /right channel/);
  assert.match(sv({ leftDbfs: -90, rightDbfs: -90 }).summary, /both channels/);
  assert.match(l.fix[0].text, /RCA cable for the left channel/);
  assert.ok(hasFix(l));
});

test('hum: 40 dB below the carrier is amber, 25 dB is red, above 40 passes; hum below the floor margin is ignored', () => {
  const m = marginDb => sv({ hum: { mainsHz: 50, totalDbfs: -6 - marginDb, humToFloorDb: 30, marginDb, measuredOn: 'carrier-removed' } });
  for (const [margin, state] of [[40.1, 'pass'], [40, 'warn'], [25.1, 'warn'], [25, 'fail'], [10, 'fail']]) assert.equal(m(margin).state, state, `margin ${margin}`);
  assert.match(m(30).fix[0].text, /ground wire/);
  assert.match(m(30).summary, /50 Hz hum/);
  const buried = sv({ hum: { mainsHz: 50, totalDbfs: -30, humToFloorDb: 5.9, marginDb: 10, measuredOn: 'carrier-removed' } });
  assert.equal(buried.state, 'pass');
  assert.equal(sv({ hum: { mainsHz: 60, totalDbfs: -30, humToFloorDb: 6, marginDb: 10, measuredOn: 'needle-up' } }).state, 'fail');
});

test('hum that could not be measured is amber with a retry, never a silent pass', () => {
  const r = sv({ hum: null, humError: 'window is shorter than two mains cycles' });
  assert.equal(r.state, 'warn');
  assert.match(r.summary, /hum could not be measured/);
  assert.equal(r.fix[0].action.kind, 'retry');
  assert.equal(evaluateStep('signal:A', null, PRESET).state, 'skipped');
});

// ---------------------------------------------------------------- audio, midi, headphones, software, system
test('audio: missing interface is red with connection and Sound-settings actions; sample-rate mismatch is amber', () => {
  const dev = [{ name: 'Speakers' }, { name: 'Traktor Audio 8 DJ Input' }];
  assert.equal(evaluateStep('audio', { available: true, devices: dev, sampleRate: 48000 }, PRESET).state, 'pass');
  assert.equal(evaluateStep('audio', { available: true, devices: dev }, PRESET).state, 'pass', 'unknown rate is not a warning');
  const missing = evaluateStep('audio', { available: true, devices: [{ name: 'Speakers' }] }, PRESET);
  assert.equal(missing.state, 'fail');
  assert.match(missing.summary, /Traktor Audio 8 DJ/);
  assert.deepEqual(missing.fix.map(f => f.action.kind), ['retry', 'settings']);
  const rate = evaluateStep('audio', { available: true, devices: dev, sampleRate: 44100 }, PRESET);
  assert.equal(rate.state, 'warn');
  assert.match(rate.summary, /44100 Hz.*48000 Hz/);
  assert.equal(rate.fix[0].action.target, 'ms-settings:sound');
  assert.equal(evaluateStep('audio', { available: false }, PRESET).state, 'skipped');
});

test('midi: present passes, optional missing is amber, required missing is red, no backend is unsupported', () => {
  const preset = { ...PRESET, midi: [{ name: 'XONE:23C', required: false }, 'Launchpad'] };
  const ports = { available: true, inputs: [{ index: 0, name: 'XONE:23C' }, { name: 'Launchpad Mini' }], outputs: [] };
  assert.equal(evaluateStep('midi', ports, preset).state, 'pass');
  assert.equal(evaluateStep('midi', { ...ports, inputs: [{ name: 'Launchpad Mini' }] }, preset).state, 'warn');
  const req = { ...preset, midi: [{ name: 'XONE:23C', required: true }] };
  const red = evaluateStep('midi', { available: true, inputs: [], outputs: [] }, req);
  assert.equal(red.state, 'fail');
  assert.match(red.summary, /XONE:23C/);
  assert.ok(hasFix(red));
  assert.equal(evaluateStep('midi', { available: false }, preset).state, 'unsupported');
  assert.equal(evaluateStep('midi', { available: true, inputs: [{ name: 'allen&heath xone:23c' }], outputs: [] }, { ...PRESET, midi: ['Allen&Heath Xone:23C'] }).state, 'pass', 'case and punctuation insensitive');
});

test('headphones: yes passes, no is red with cue advice, skip or none is skipped', () => {
  assert.equal(evaluateStep('headphones', { answer: 'yes' }, PRESET).state, 'pass');
  const no = evaluateStep('headphones', { answer: 'no' }, PRESET);
  assert.equal(no.state, 'fail');
  assert.match(no.fix[0].text, /cue \(PFL\) button/);
  assert.equal(evaluateStep('headphones', { answer: 'skip' }, PRESET).state, 'skipped');
  assert.equal(evaluateStep('headphones', {}, PRESET).state, 'skipped');
  assert.equal(evaluateStep('headphones', { answer: 'skip' }, PRESET).required, false);
});

const NOW = Date.parse('2026-10-10T18:00:00Z');
const hoursAgo = h => new Date(NOW - h * 3600000).toISOString();
const logs = (files, installed = true) => ({ supported: true, apps: [{ app: 'Traktor Pro', installed, version: '4.0', files }] });
const procs = running => ({ supported: true, apps: [{ app: 'Traktor Pro', running, exe: 'Traktor.exe', pid: running ? 1 : null }] });
const sw = (over = {}) => evaluateStep('software', { processes: procs(true), logs: logs([]), now: NOW, ...over }, PRESET);

test('software: crash within 1 h red, within 24 h amber, older passes; boundaries inclusive', () => {
  const crash = h => logs([{ kind: 'crashDump', modified: hoursAgo(h), path: 'C:\\Users\\sheldon\\x.dmp' }]);
  assert.equal(sw().state, 'pass');
  assert.equal(sw({ logs: crash(1) }).state, 'fail');
  assert.equal(sw({ logs: crash(1.01) }).state, 'warn');
  assert.equal(sw({ logs: crash(24) }).state, 'warn');
  assert.equal(sw({ logs: crash(24.01) }).state, 'pass');
  assert.equal(sw({ logs: crash(24.01) }).evidence.crashAgeHours, 24.01);
  const fail = sw({ logs: crash(0.5) });
  assert.match(fail.summary, /crashed within the last hour/);
  assert.ok(hasFix(fail));
  assert.ok(!JSON.stringify(fail).includes('sheldon'), 'no file paths leak into the result');
  assert.equal(sw({ logs: logs([{ kind: 'crashReport', modified: 'garbage' }]) }).state, 'warn');
  assert.equal(evaluateStep('software', { processes: procs(true), logs: crash(0.5), now: NOW }, { ...PRESET, expectedCrashFree: false }).state, 'pass');
});

test('software: not installed and not running are amber with actions; no backend is unsupported', () => {
  assert.equal(sw({ logs: logs([], false) }).state, 'warn');
  const idle = sw({ processes: procs(false) });
  assert.equal(idle.state, 'warn');
  assert.match(idle.fix[0].text, /Open Traktor Pro/);
  assert.equal(evaluateStep('software', { processes: procs(false), logs: logs([]), now: NOW }, { ...PRESET, expectSoftwareRunning: false }).state, 'pass');
  assert.equal(evaluateStep('software', { processes: { supported: false, apps: [] }, logs: { supported: false } }, PRESET).state, 'unsupported');
  assert.equal(evaluateStep('software', { processes: procs(true), logs: { supported: false } }, PRESET).state, 'pass', 'process scan alone is enough');
});

test('system: driver and event findings filtered to the preset gear, warnings amber, errors red, unsupported excluded', () => {
  const profiles = [PROFILES['traktor-audio-8-dj']];
  const drv = (over = {}) => ({ supported: true, scannedAt: '2026-10-10T18:00:00Z', drivers: [{ deviceName: 'Traktor Audio 8 DJ', hardwareId: 'USB\\VID_17CC', present: true, status: 'OK', problemCode: 0, isSigned: true, driverVersion: '3.1.0', ...over }], asioDrivers: [{ name: 'Traktor Audio 8 DJ ASIO Driver', dllExists: true }], errors: [] });
  const run = d => evaluateStep('system', { drivers: d, events: { supported: true, days: 3, events: [], errors: [] }, profiles, now: NOW }, PRESET);
  assert.equal(run(drv()).state, 'pass');
  const prob = run(drv({ status: 'Error', problemCode: 10 }));
  assert.equal(prob.state, 'fail');
  assert.ok(hasFix(prob));
  const unsigned = run(drv({ isSigned: false }));
  assert.equal(unsigned.state, 'warn');
  const none = evaluateStep('system', { drivers: { supported: true, scannedAt: 'x', drivers: [], asioDrivers: [], errors: [] }, profiles, now: NOW }, PRESET);
  assert.equal(none.state, 'fail', 'required driver missing for the preset interface');
  assert.match(none.summary, /Driver not found/);
  const evt = evaluateStep('system', { drivers: drv(), events: { supported: true, days: 3, errors: [], events: [{ provider: 'Application Error', eventId: 1000, level: 'Error', time: '2026-10-10T17:00:00Z', message: 'Faulting application name: Traktor.exe, faulting module: x.dll', source: 'Application' }] }, profiles, now: NOW }, PRESET);
  assert.notEqual(evt.state, 'pass');
  assert.equal(evaluateStep('system', { drivers: { supported: false }, events: { supported: false } }, PRESET).state, 'unsupported');
  assert.equal(evaluateStep('system', { unsupported: true }, PRESET).state, 'unsupported');
  assert.equal(evaluateStep('system', null, PRESET).state, 'skipped');
});

test('evidence errors become "Check could not run" with a retry for every kind', () => {
  for (const id of ['system', 'audio', 'midi', 'software', 'headphones', 'timecode:A', 'signal:A']) {
    const r = evaluateStep(id, { error: new Error('boom') }, PRESET);
    assert.equal(r.state, 'error', id);
    assert.equal(r.summary, 'Check could not run: boom', id);
    assert.ok(hasFix(r), id);
  }
  assert.throws(() => evaluateStep('nope', {}, PRESET), /Unknown pre-gig step/);
  assert.throws(() => evaluateStep('timecode', {}, PRESET), /needs a deck/);
});

test('every red or amber result carries a fix with a label and plain-English text', () => {
  const cases = [
    ['audio', { available: true, devices: [] }], ['audio', { available: true, devices: [{ name: 'Traktor Audio 8 DJ' }], sampleRate: 96000 }],
    ['midi', { available: true, inputs: [], outputs: [] }], ['headphones', { answer: 'no' }],
    ['software', { processes: procs(false), logs: logs([], true), now: NOW }], ['software', { processes: procs(true), logs: logs([], false), now: NOW }],
    ['timecode:A', tc({ noSignal: true })], ['timecode:A', tc({ snrDb: 22 })], ['timecode:A', tc({ snrDb: 10, phaseErrDeg: 40, balanceDb: 9, dropouts: 9, speedErrPct: 9 })],
    ['signal:A', sig({ leftDbfs: -70 })], ['signal:A', sig({ hum: null })], ['signal:A', sig({ hum: { mainsHz: 50, totalDbfs: -10, humToFloorDb: 30, marginDb: 4 } })],
  ];
  for (const [id, e] of cases) {
    const r = evaluateStep(id, e, PRESET);
    assert.ok(['warn', 'fail'].includes(r.state), `${id} ${JSON.stringify(e).slice(0, 60)} -> ${r.state}`);
    assert.ok(hasFix(r), `${id} has a fix`);
    assert.ok(r.summary.length > 10 && r.summary.length <= 500);
  }
});

// ---------------------------------------------------------------- roll-up
const R = (state, o = {}) => ({ stepId: o.id || state, kind: 'x', state, summary: `${state} summary`, required: !!o.required, fix: [] });

test('rollUp matrix (AC-2): fail is red, warn or error is amber, skipped required is incomplete, else green', () => {
  const v = (...rs) => rollUp(rs).verdict;
  assert.equal(v(R('pass'), R('pass')), 'green');
  assert.equal(v(R('pass'), R('warn')), 'amber');
  assert.equal(v(R('pass'), R('error')), 'amber');
  assert.equal(v(R('pass'), R('fail')), 'red');
  assert.equal(v(R('warn'), R('fail'), R('skipped', { required: true })), 'red');
  assert.equal(v(R('pass'), R('skipped', { required: true })), 'incomplete');
  assert.equal(v(R('warn'), R('skipped', { required: true })), 'amber');
  assert.equal(v(R('pass'), R('skipped')), 'green', 'an optional skipped step is fine');
  assert.equal(v(R('skipped', { required: true })), 'incomplete');
  assert.equal(v(), 'incomplete', 'nothing measured is never green');
  assert.equal(v(R('skipped'), R('skipped')), 'incomplete');
  const inc = rollUp([R('pass'), R('skipped', { required: true })]);
  assert.equal(inc.level, 'amber');
  assert.equal(inc.incomplete, true);
  assert.equal(rollUp([R('pass'), R('pass')], { cancelled: true }).verdict, 'cancelled');
});

test('rollUp: unsupported steps are excluded from the verdict and mark the check partial (AC-5)', () => {
  const r = rollUp([R('pass'), R('unsupported'), R('unsupported')]);
  assert.equal(r.verdict, 'green');
  assert.equal(r.partial, true);
  assert.equal(r.counts.unsupported, 2);
  assert.match(r.copy, /Ready to play\. 1 of 1 checks passed\. Partial check/);
  assert.equal(rollUp([R('unsupported')]).verdict, 'incomplete');
  assert.equal(rollUp([R('pass')]).partial, false);
});

test('rollUp: top problems sorted red, amber, then skipped required; copy matches the spec wording', () => {
  const r = rollUp([R('warn', { id: 'a' }), R('fail', { id: 'b' }), R('pass'), R('error', { id: 'c' }), R('warn', { id: 'd' }), R('skipped', { id: 'e', required: true })]);
  assert.deepEqual(r.top.map(x => x.stepId), ['b', 'c', 'a']);
  assert.equal(r.copy, 'Not ready: fail summary');
  assert.equal(rollUp([R('pass'), R('pass'), R('pass')]).copy, 'Ready to play. 3 of 3 checks passed.');
  assert.equal(rollUp([R('pass'), R('warn'), R('warn')]).copy, 'Playable, with 2 things to look at.');
  assert.equal(rollUp([R('pass'), R('warn')]).copy, 'Playable, with 1 thing to look at.');
  assert.match(rollUp([R('pass'), R('skipped', { required: true })]).copy, /^Incomplete: 1 check did not run/);
});

// ---------------------------------------------------------------- plan
test('buildPlan orders parallel steps first, then per-deck steps, then the headphone cue', () => {
  const plan = buildPlan(PRESET);
  assert.deepEqual(plan.map(s => s.id), ['system', 'audio', 'midi', 'software', 'timecode:A', 'signal:A', 'timecode:B', 'signal:B', 'headphones']);
  assert.ok(plan.every(s => s.enabled));
  assert.deepEqual(plan.filter(s => s.parallel).map(s => s.id), ['system', 'audio', 'midi', 'software']);
  assert.deepEqual(plan.find(s => s.id === 'signal:B').needs, ['audio']);
  assert.equal(plan.find(s => s.id === 'headphones').manual, true);
  assert.equal(plan.find(s => s.id === 'timecode:B').label, 'Timecode, deck B');
  assert.equal(PREGIG_STEPS.length, 7);
});

test('buildPlan honours skip and only, drops MIDI and software when the preset has none, and stays inside the 120 s budget', () => {
  const p = buildPlan({ ...PRESET, midi: [], software: '' }, { skip: ['system'] });
  assert.ok(!p.some(s => s.kind === 'midi' || s.kind === 'software'));
  assert.equal(p.find(s => s.id === 'system').enabled, false);
  const redo = buildPlan(PRESET, { only: ['timecode:B'] });
  assert.deepEqual(redo.filter(s => s.enabled).map(s => s.id), ['timecode:B']);
  const full = estimateBudgetMs(buildPlan(PRESET));
  assert.ok(full <= 120000, `2-deck estimate ${full} ms`);
  assert.equal(estimateBudgetMs(buildPlan(PRESET, { skip: ['system'] })), full - 15000);
  assert.equal(stepKind('timecode:A'), 'timecode');
  assert.equal(stepDeck('timecode:A'), 'A');
  assert.equal(stepDeck('audio'), null);
});

// ---------------------------------------------------------------- presets
test('built-in presets validate and reference the owner\'s real gear profile ids and known formats', () => {
  assert.equal(PRESETS.presets.length, 3);
  assert.deepEqual(PRESETS.presets.map(p => p.name), ['Technics+Audio8+Traktor MK2', 'CRSS12+DJM-A9+rekordbox', 'Twelve MK2+Serato']);
  const known = new Set(Object.keys(PROFILES));
  for (const p of PRESETS.presets) {
    const v = validatePreset(p, { knownProfileIds: known });
    assert.deepEqual(v.errors, [], p.name);
    assert.ok(Object.keys(p.profileIds).length >= 2, `${p.name} names its gear`);
  }
  const all = PRESETS.presets.flatMap(p => Object.values(p.profileIds).flat());
  for (const id of ['technics-sl-1200mk4', 'allen-heath-xone-23', 'traktor-audio-8-dj', 'traktor-scratch-timecode', 'pioneer-plx-crss12', 'pioneer-djm-a9', 'rane-twelve-mk2', 'serato-control-vinyl-cv025']) assert.ok(all.includes(id), id);
  assert.equal(PRESETS.presets[2].decks[0].format, 'Serato CV02.5');
  assert.equal(PRESETS.presets[0].decks[0].format, 'Traktor Scratch MK2');
});

test('built-in presets load through loadBuiltinPresets and bad ones are reported', async () => {
  const ok = await loadBuiltinPresets(async () => PRESETS, { base: 'x', knownProfileIds: Object.keys(PROFILES) });
  assert.equal(ok.presets.length, 3);
  assert.ok(ok.presets.every(p => p.builtin && p.id.startsWith('builtin-')));
  assert.deepEqual(ok.problems, []);
  const bad = await loadBuiltinPresets(async () => ({ presets: [{ id: 'x', v: 1, name: 'Bad' }, ...PRESETS.presets] }), { base: 'x' });
  assert.equal(bad.presets.length, 3);
  assert.equal(bad.problems[0].id, 'x');
  const down = await loadBuiltinPresets(async () => { throw new Error('offline'); }, { base: 'x' });
  assert.equal(down.presets.length, 0);
  assert.match(down.problems[0].errors[0].message, /offline/);
});

test('validatePreset: bad deck ids, duplicates, inputs, formats, rates, MIDI and gear references', () => {
  const bad = (f) => validatePreset(f({ ...PRESET, decks: PRESET.decks.map(d => ({ ...d })) })).errors.map(e => e.field);
  assert.deepEqual(validatePreset(PRESET).errors, []);
  assert.ok(bad(p => { p.name = ' '; return p; }).includes('name'));
  assert.ok(bad(p => { p.audioDevice = ''; return p; }).includes('audioDevice'));
  assert.ok(bad(p => { p.sampleRate = 12345; return p; }).includes('sampleRate'));
  assert.ok(bad(p => { p.decks = []; return p; }).includes('decks'));
  assert.ok(bad(p => { p.decks = ['A', 'B', 'C', 'D', 'A'].map((id, i) => ({ id, input: [i * 2, i * 2 + 1], format: 'Serato CV02.5' })); return p; }).includes('decks'));
  assert.ok(bad(p => { p.decks[0].id = 'Z'; return p; }).includes('decks[0].id'));
  assert.ok(bad(p => { p.decks[1].id = 'A'; return p; }).includes('decks[1].id'));
  assert.ok(bad(p => { p.decks[0].input = [0, 0]; return p; }).includes('decks[0].input'));
  assert.ok(bad(p => { p.decks[0].input = [0]; return p; }).includes('decks[0].input'));
  assert.ok(bad(p => { p.decks[1].input = [0, 1]; return p; }).includes('decks'), 'two decks on one input pair');
  assert.ok(bad(p => { p.decks[0].format = 'Not A Format'; return p; }).includes('decks[0].format'));
  assert.ok(bad(p => { delete p.decks[0].format; return p; }).includes('decks[0].format'));
  assert.ok(bad(p => { p.midi = [42]; return p; }).includes('midi'));
  const gear = validatePreset({ ...PRESET, profileIds: { mixer: 'no-such-mixer', turntables: ['technics-sl-1200mk4'] } }, { knownProfileIds: Object.keys(PROFILES) });
  assert.deepEqual(gear.errors.map(e => e.field), ['profileIds.mixer']);
  assert.equal(validatePreset(null).ok, false);
  assert.equal(validatePreset({ ...PRESET, v: 0 }).ok, false);
  const rek = validatePreset({ ...PRESET, decks: [{ id: 'A', input: [0, 1], format: 'Final Scratch' }] });
  assert.equal(rek.ok, true);
  assert.match(rek.warnings[0].message, /unverified/);
});

test('presets: newer versions are read-only, import rejects >256 kB and junk, export/duplicate round-trip (AC-8)', () => {
  const future = validatePreset({ ...PRESET, v: 7 });
  assert.equal(future.readOnly, true);
  assert.equal(future.ok, true);
  assert.match(migratePreset({ ...PRESET, v: 7 }).notice, /newer DeckChek/);
  assert.equal(migratePreset({ ...PRESET }).readOnly, false);
  assert.equal(migratePreset({ ...PRESET, v: undefined }).preset.v, 1);
  assert.equal(parsePresetJson('{nope').ok, false);
  assert.match(parsePresetJson('{nope').errors[0].message, /not valid JSON/);
  const huge = JSON.stringify({ ...PRESET, pad: 'x'.repeat(MAX_PRESET_BYTES) });
  assert.match(parsePresetJson(huge).errors[0].message, /larger than 256 kB/);
  assert.equal(parsePresetJson(JSON.stringify([1, 2])).ok, false);
  const round = parsePresetJson(exportPresetJson(PRESET));
  assert.equal(round.ok, true);
  assert.deepEqual(round.preset.decks, PRESET.decks);
  const dup = duplicatePreset({ ...PRESET, builtin: true }, { id: 'u1' });
  assert.equal(dup.id, 'u1');
  assert.equal(dup.name, 'Technics+Audio8+Traktor MK2 (copy)');
  assert.ok(!('builtin' in dup));
  assert.ok(!('id' in duplicatePreset(PRESET)));
});

const MEDIA = [
  { id: 'traktor-scratch-mk2', name: 'Traktor Scratch MK2', kind: 'timecode', profile: { id: 'traktor-scratch-mk2', kind: 'timecode', timecode: { formatName: 'Traktor Scratch MK2' } } },
  { id: 'serato-cv025', name: 'Serato CV02.5', kind: 'timecode', profile: { id: 'serato-cv025', kind: 'timecode', timecode: { formatName: 'Serato CV02.5' } } },
  { id: 'generic-1khz-0db', name: 'Generic 1 kHz', kind: 'tone_file', profile: { id: 'generic-1khz-0db', kind: 'tone_file' } },
];

test('presetFromEquipment builds a valid preset from real profiles; deck B defaults to inputs 3-4 and the format comes from the media library', () => {
  const p = presetFromEquipment({ turntables: ['technics-sl-1200mk4', 'technics-sl-1200mk4'], interface: 'traktor-audio-8-dj', mixer: 'allen-heath-xone-23', media: 'traktor-scratch-mk2' }, PROFILES, { media: MEDIA });
  assert.equal(p.audioDevice, 'Audio 8 DJ');
  assert.equal(p.software, 'Traktor Pro');
  assert.equal(p.decks.length, 2);
  assert.deepEqual(p.decks.map(d => d.input), [[0, 1], [2, 3]]);
  assert.equal(p.decks[0].format, 'Traktor Scratch MK2');
  assert.equal(p.mediaId, 'traktor-scratch-mk2');
  assert.deepEqual(p.profileIds, { turntables: ['technics-sl-1200mk4', 'technics-sl-1200mk4'], mixer: 'allen-heath-xone-23', interface: 'traktor-audio-8-dj' });
  assert.deepEqual(validatePreset(p, { knownProfileIds: Object.keys(PROFILES) }).errors, []);
  const c = presetFromEquipment({ controller: 'rane-twelve-mk2', media: 'serato-cv025' }, new Map(Object.entries(PROFILES)), { media: new Map(MEDIA.map(m => [m.id, m])) });
  assert.equal(c.decks[0].format, 'Serato CV02.5');
  assert.equal(c.software, 'Serato DJ Pro');
  assert.equal(presetFromEquipment({}, {}).name, 'My rig');
  assert.equal(presetFromEquipment({ media: 'nope' }, {}, { media: MEDIA }).decks[0].format, '');
});

test('formatForMedia resolves timecode media only, from the library, in any container shape', () => {
  assert.equal(formatForMedia('serato-cv025', MEDIA), 'Serato CV02.5');
  assert.equal(formatForMedia('serato-cv025', Object.fromEntries(MEDIA.map(m => [m.id, m]))), 'Serato CV02.5');
  assert.equal(formatForMedia('generic-1khz-0db', MEDIA), '');
  assert.equal(formatForMedia('', MEDIA), '');
  assert.equal(formatForMedia('serato-cv025', []), '');
});

test('the built-in rigs on a multi-pair interface put deck A on 1-2 and deck B on 3-4 (Traktor Audio 8 DJ)', () => {
  const file = JSON.parse(readFileSync(new URL('../app/pregig-presets.json', import.meta.url), 'utf8'));
  const audio8 = file.presets.find(p => p.audioDevice === 'Traktor Audio 8 DJ');
  assert.deepEqual(audio8.decks.map(d => [d.id, deckPairFirst(d.input)]), [['A', 1], ['B', 3]]);
});

test('namesMatch is forgiving but refuses tiny fragments', () => {
  assert.ok(namesMatch('Traktor Audio 8 DJ Input 1/2', 'traktor audio 8 dj'));
  assert.ok(namesMatch('XONE:23C', 'Allen&Heath Xone:23C'));
  assert.ok(!namesMatch('Speakers', 'Traktor Audio 8 DJ'));
  assert.ok(!namesMatch('DJ', 'DJ'));
  assert.ok(!namesMatch('', 'abc'));
});

// ---------------------------------------------------------------- diff
test('diffRuns lists which steps changed and whether they improved (AC-6)', () => {
  const a = { verdict: 'amber', results: [{ stepId: 'audio', state: 'pass' }, { stepId: 'timecode:A', state: 'warn', summary: 'noisy' }, { stepId: 'midi', state: 'fail' }, { stepId: 'old', state: 'pass' }] };
  const b = { verdict: 'green', results: [{ stepId: 'audio', state: 'pass' }, { stepId: 'timecode:A', state: 'pass', summary: 'clean' }, { stepId: 'midi', state: 'pass' }, { stepId: 'new', state: 'warn' }] };
  const d = diffRuns(a, b);
  assert.deepEqual(d.changed.map(c => [c.stepId, c.from, c.to, c.trend]), [['timecode:A', 'warn', 'pass', 'better'], ['midi', 'fail', 'pass', 'better']]);
  assert.deepEqual([d.added, d.removed, d.unchanged, d.verdictFrom, d.verdictTo], [['new'], ['old'], 1, 'amber', 'green']);
  assert.equal(diffRuns(b, a).changed[0].trend, 'worse');
  assert.deepEqual(diffRuns([], []).changed, []);
  assert.equal(diffRuns(a.results, b.results).changed.length, 2, 'accepts bare step arrays');
});

// ---------------------------------------------------------------- synthetic signals through the real engines
const SR = 48000;
const withHum = (s, hum) => { for (let i = 0; i < s.left.length; i++) { s.left[i] += hum.samples[i]; s.right[i] += hum.samples[i]; } return s; };
const mk = (o = {}) => quadratureTimecode({ carrierHz: 2500, seconds: 5, sampleRate: SR, snrDb: 40, seed: 3, ...o });
const humFor = (mains, base) => humMix({ mainsHz: mains, harmonics: [{ n: 1, dbfs: base }, { n: 2, dbfs: base - 6 }, { n: 3, dbfs: base - 3 }], seconds: 5, sampleRate: SR, seed: 2 });
const deckStates = capture => {
  const e = analyzeDeckCapture(capture, { format: 'Traktor Scratch MK2' });
  return { tc: evaluateStep('timecode:A', e, PRESET), sg: evaluateStep('signal:A', e, PRESET), e };
};

test('synthetic Traktor MK2 timecode from the generator passes both deck steps', () => {
  const { tc: t, sg, e } = deckStates(mk());
  assert.equal(t.state, 'pass', t.summary);
  assert.equal(sg.state, 'pass', sg.summary);
  assert.ok(e.signal.leftDbfs > -50 && e.signal.rightDbfs > -50);
});

test('synthetic: noisy carrier is amber then red as the SNR falls (real analyzeTimecode)', () => {
  const warn = deckStates(mk({ snrDb: 22 }));
  assert.equal(warn.tc.state, 'warn', warn.tc.summary);
  assert.ok(warn.tc.fix.some(f => /Clean stylus and control vinyl/.test(f.text)));
  const fail = deckStates(mk({ snrDb: 12 }));
  assert.equal(fail.tc.state, 'fail', fail.tc.summary);
});

test('synthetic: one muted channel is red, naming the channel; silence is a no-signal red', () => {
  const s = mk();
  s.right.fill(0);
  const r = deckStates(s);
  assert.equal(r.sg.state, 'fail');
  assert.match(r.sg.summary, /right channel/);
  assert.equal(r.tc.state, 'fail');
  const silent = deckStates({ left: new Float32Array(SR * 5), right: new Float32Array(SR * 5), sampleRate: SR });
  assert.equal(silent.tc.state, 'fail');
  assert.match(silent.tc.summary, /No timecode is reaching/);
  assert.equal(silent.sg.state, 'fail');
});

test('synthetic: dropouts and a wrong-format record are caught', () => {
  const d = deckStates(mk({ dropouts: [[1, 1.2], [3, 3.2], [4, 4.1]] }));
  assert.equal(d.tc.state, 'fail', d.tc.summary);
  assert.match(d.tc.summary, /dropout/);
  const wrongFormat = deckStates(mk({ carrierHz: 1000 }));
  assert.equal(wrongFormat.tc.state, 'fail', wrongFormat.tc.summary);
  assert.match(wrongFormat.tc.summary, /wrong timecode format|noisy|No timecode/);
});

test('synthetic hum: 50 Hz and 60 Hz families are detected and graded against the carrier', () => {
  const grade = (mains, base) => { const x = deckStates(withHum(mk(), humFor(mains, base))); return { state: x.sg.state, hum: x.e.signal.hum, summary: x.sg.summary }; };
  const clean = deckStates(mk());
  assert.equal(clean.sg.state, 'pass');
  const quiet = grade(50, -75);
  assert.equal(quiet.state, 'pass');
  const amber50 = grade(50, -40);
  assert.equal(amber50.hum.mainsHz, 50);
  assert.equal(amber50.state, 'warn', amber50.summary);
  assert.match(amber50.summary, /50 Hz hum/);
  const amber60 = grade(60, -40);
  assert.equal(amber60.hum.mainsHz, 60);
  assert.equal(amber60.state, 'warn', amber60.summary);
  const red = grade(50, -30);
  assert.equal(red.state, 'fail', red.summary);
  assert.equal(red.hum.measuredOn, 'carrier-removed');
});

test('synthetic needle-up hum is measured on the lifted segment', () => {
  const up = humMix({ mainsHz: 50, harmonics: [{ n: 1, dbfs: -35 }], seconds: 3, sampleRate: SR, seed: 5 });
  const e = analyzeDeckCapture(mk(), { format: 'Traktor Scratch MK2', needleUp: { left: up.samples, right: up.samples, sampleRate: SR } });
  assert.equal(e.signal.hum.measuredOn, 'needle-up');
  assert.equal(evaluateStep('signal:A', e, PRESET).state, 'warn');
});

test('summarizeTimecode exposes plain numbers and handles failures', () => {
  const a = analyzeTimecode(mk(), { format: 'Traktor Scratch MK2' });
  const s = summarizeTimecode(a);
  assert.ok(s.snrDb > 25 && s.dropouts === 0 && s.noSignal === false);
  assert.equal(s.format.name, 'Traktor Scratch MK2');
  assert.equal(summarizeTimecode(analyzeTimecode(mk(), { format: 'Nope' })).error.includes('Unknown timecode format'), true);
  assert.equal(summarizeTimecode(null).error, 'No analysis');
});

// ---------------------------------------------------------------- orchestrator
const goodCapture = () => { const c = mk(); return { left: c.left, right: c.right, sampleRate: SR }; };
function deps(over = {}) {
  const calls = [];
  const d = {
    calls,
    listInputs: async () => { calls.push('listInputs'); return [{ name: 'Traktor Audio 8 DJ', isDefault: false }]; },
    scans: { drivers: async () => ({ supported: false }), events: async () => ({ supported: false }), logs: async () => ({ supported: false }) },
    processes: async () => ({ supported: false, apps: [] }),
    midiPorts: async () => ({ inputs: [{ index: 0, name: 'XONE:23C' }], outputs: [] }),
    captureDeck: async o => { calls.push(`capture:${o.deck}`); return goodCapture(); },
    askHeadphones: async () => { calls.push('headphones'); return 'yes'; },
    ...over,
  };
  return d;
}

test('runPregig: an all-ready rig produces a green verdict with every automatic step passing (AC-1)', async () => {
  let clock = 1_000_000;
  const now = () => (clock += 10);
  const seen = [];
  const preset = { ...PRESET, decks: [PRESET.decks[0]] };
  const run = await runPregig({ preset, deps: deps(), now, onStep: e => seen.push(`${e.stepId}:${e.state}`) });
  assert.equal(run.verdict, 'green', run.rollup.copy);
  assert.equal(run.cancelled, false);
  const byId = Object.fromEntries(run.results.map(r => [r.stepId, r.state]));
  assert.deepEqual(byId, { system: 'unsupported', audio: 'pass', midi: 'pass', software: 'unsupported', 'timecode:A': 'pass', 'signal:A': 'pass', headphones: 'pass' });
  assert.ok(seen.indexOf('timecode:A:running') < seen.indexOf('timecode:A:pass'));
  assert.equal(run.rollup.partial, true, 'unsupported system and software steps make it a partial check');
  assert.match(run.startedAt, /^\d{4}-\d\d-\d\dT/);
});

test('runPregig: deck B captures input pair 3-4 and deck A pair 1-2, so a two-deck rig can be green', async () => {
  const pairs = [];
  const d = deps({ captureDeck: async o => { pairs.push([o.deck, o.pair]); return goodCapture(); } });
  const run = await runPregig({ preset: PRESET, deps: d });
  assert.deepEqual(pairs, [['A', 1], ['B', 3]]);
  assert.equal(run.results.find(r => r.stepId === 'timecode:B').state, 'pass');
  assert.equal(run.results.find(r => r.stepId === 'signal:B').state, 'pass');
  assert.equal(run.verdict, 'green', run.rollup.copy);
});

test('runPregig: a pair the interface does not offer is reported as no such input, not a failure', async () => {
  const d = deps({ captureDeck: async o => { if (o.pair === 3) throw new Error('Input pair 3-4 is not available on Interface: it has 2 input channels (pairs 1-2).'); return goodCapture(); } });
  const run = await runPregig({ preset: PRESET, deps: d });
  const b = run.results.find(r => r.stepId === 'timecode:B');
  assert.equal(b.state, 'skipped');
  assert.equal(b.reason, 'input-pair');
  assert.match(b.summary, /Deck B: Input pair 3-4 is not available/);
  assert.equal(run.verdict, 'incomplete');
  // misaligned inputs (2-3) are not a stereo pair and never reach the capture
  const odd = { ...PRESET, decks: [PRESET.decks[0], { ...PRESET.decks[1], input: [1, 2] }] };
  let called = 0;
  const run2 = await runPregig({ preset: odd, deps: deps({ captureDeck: async () => { called++; return goodCapture(); } }) });
  assert.equal(called, 1);
  assert.match(run2.results.find(r => r.stepId === 'timecode:B').summary, /inputs 2-3, which are not a stereo pair/);
});

test('deckPairFirst maps zero-based deck inputs to the 1-based first channel of a stereo pair', () => {
  assert.equal(deckPairFirst([0, 1]), 1);
  assert.equal(deckPairFirst([2, 3]), 3);
  assert.equal(deckPairFirst([6, 7]), 7);
  assert.equal(deckPairFirst([1, 2]), null);
  assert.equal(deckPairFirst([0, 2]), null);
  assert.equal(pairLabel([2, 3]), '3-4');
});

test('runPregig: audio interface missing is red, signal steps are skipped (blocked) and nothing is captured (AC-4)', async () => {
  const d = deps({ listInputs: async () => [{ name: 'Speakers' }] });
  const run = await runPregig({ preset: PRESET, deps: d });
  assert.equal(run.verdict, 'red');
  assert.match(run.rollup.copy, /^Not ready: Audio interface not found/);
  for (const id of ['timecode:A', 'signal:A', 'timecode:B', 'signal:B', 'headphones']) {
    const r = run.results.find(x => x.stepId === id);
    assert.equal(r.state, 'skipped', id);
    assert.equal(r.reason, 'blocked', id);
  }
  assert.ok(!d.calls.some(c => c.startsWith('capture')), 'no capture attempted');
  assert.ok(run.durationMs < 15000);
});

test('runPregig: a thrown step is an error row, the verdict is amber and the other steps still run', async () => {
  const d = deps({ midiPorts: async () => { throw new Error('MIDI service stopped'); } });
  const run = await runPregig({ preset: { ...PRESET, decks: [PRESET.decks[0]] }, deps: d });
  const midi = run.results.find(r => r.stepId === 'midi');
  assert.equal(midi.state, 'error');
  assert.equal(midi.summary, 'Check could not run: MIDI service stopped');
  assert.equal(run.verdict, 'amber');
  assert.equal(run.results.find(r => r.stepId === 'timecode:A').state, 'pass');
});

test('runPregig: Esc cancels, finished steps are kept and the rest are skipped (cancelled) (AC-7)', async () => {
  const ac = new AbortController();
  const d = deps({ captureDeck: async o => { ac.abort(); return goodCapture(); } });
  const run = await runPregig({ preset: PRESET, deps: d, signal: ac.signal });
  assert.equal(run.cancelled, true);
  assert.equal(run.verdict, 'cancelled');
  assert.equal(run.results.find(r => r.stepId === 'audio').state, 'pass');
  assert.equal(run.results.find(r => r.stepId === 'timecode:A').state, 'pass', 'the step in flight finishes');
  const later = run.results.filter(r => ['timecode:B', 'signal:B', 'headphones'].includes(r.stepId));
  assert.ok(later.every(r => r.state === 'skipped' && r.reason === 'cancelled'));
  assert.ok(!d.calls.includes('headphones'));
  const pre = new AbortController(); pre.abort();
  const none = await runPregig({ preset: PRESET, deps: deps(), signal: pre.signal });
  assert.ok(none.results.every(r => r.reason === 'cancelled'));
});

test('runPregig: manual time is reported separately and excluded from the duration', async () => {
  let t = 0;
  const now = () => t;
  const d = deps({ askHeadphones: async () => { t += 30000; return 'yes'; } });
  const run = await runPregig({ preset: { ...PRESET, decks: [PRESET.decks[0]] }, deps: d, now });
  assert.equal(run.manualMs, 30000);
  assert.equal(run.durationMs, 0);
  assert.equal(run.withinBudget, true);
});

test('runPregig: orchestration overhead with instant mocked captures stays far below 5 s', async () => {
  const fast = { left: new Float32Array(4800).fill(0.1), right: new Float32Array(4800).fill(0.1), sampleRate: SR };
  const t0 = Date.now();
  await runPregig({ preset: { ...PRESET, decks: [PRESET.decks[0]] }, deps: deps({ captureDeck: async () => fast }) });
  assert.ok(Date.now() - t0 < 5000);
});

test('runPregig: CAPTURE_BUSY offers to stop the other capture, retries once and records the choice', async () => {
  let n = 0, preempted = 0;
  const d = deps({
    captureDeck: async () => { if (n++ === 0) throw Object.assign(new Error('busy'), { code: 'CAPTURE_BUSY', holder: 'live-monitor' }); return goodCapture(); },
    confirmPreempt: async () => true, preempt: async () => { preempted++; },
  });
  const run = await runPregig({ preset: { ...PRESET, decks: [PRESET.decks[0]] }, deps: d });
  assert.equal(preempted, 1);
  assert.equal(run.results.find(r => r.stepId === 'timecode:A').state, 'pass');
  const declined = deps({ captureDeck: async () => { throw Object.assign(new Error('busy'), { code: 'CAPTURE_BUSY', holder: 'live-monitor' }); }, confirmPreempt: async () => false });
  const run2 = await runPregig({ preset: { ...PRESET, decks: [PRESET.decks[0]] }, deps: declined });
  assert.equal(run2.results.find(r => r.stepId === 'timecode:A').fix[0].action.kind, 'preempt');
  assert.equal(run2.verdict, 'incomplete');
});

test('runPregig: one capture feeds both deck steps; only/skip re-run just the chosen steps', async () => {
  const d = deps();
  await runPregig({ preset: { ...PRESET, decks: [PRESET.decks[0]] }, deps: d });
  assert.equal(d.calls.filter(c => c === 'capture:A').length, 1);
  const d2 = deps();
  const redo = await runPregig({ preset: { ...PRESET, decks: [PRESET.decks[0]] }, deps: d2, only: ['audio'] });
  assert.equal(redo.results.find(r => r.stepId === 'audio').state, 'pass');
  assert.equal(redo.results.find(r => r.stepId === 'headphones').reason, 'user');
  assert.ok(!d2.calls.some(c => c.startsWith('capture')));
});

test('runPregig: needle-up hum asks the user, captures the lifted segment and grades it', async () => {
  const lifted = humMix({ mainsHz: 50, harmonics: [{ n: 1, dbfs: -30 }], seconds: 3, sampleRate: SR, seed: 5 });
  const asked = [];
  const d = deps({
    captureDeck: async o => (o.needleUp ? { left: lifted.samples, right: lifted.samples, sampleRate: SR } : goodCapture()),
    askNeedleUp: async deck => { asked.push(deck); return true; },
  });
  const run = await runPregig({ preset: { ...PRESET, decks: [PRESET.decks[0]], requireNeedleUpHum: true }, deps: d });
  assert.deepEqual(asked, ['A']);
  const s = run.results.find(r => r.stepId === 'signal:A');
  assert.equal(s.state, 'fail');
  assert.equal(s.evidence.hum.measuredOn, 'needle-up');
});

test('runPregig: no desktop backend leaves required steps skipped and the verdict incomplete (AC-5)', async () => {
  const run = await runPregig({ preset: PRESET, deps: {} });
  assert.equal(run.verdict, 'incomplete');
  assert.equal(run.results.find(r => r.stepId === 'audio').reason, 'needs-desktop');
  assert.equal(run.results.find(r => r.stepId === 'system').state, 'unsupported');
  assert.equal(run.rollup.partial, true);
  assert.match(run.rollup.copy, /Partial check/);
});

test('createNativeDeps drives the Tauri commands with the pre-gig capture holder and captures the deck input pair', async () => {
  const log = [];
  const invoke = async (cmd, args) => {
    log.push([cmd, args]);
    if (cmd === 'list_native_audio_inputs') return [{ name: 'Traktor Audio 8 DJ ASIO', isDefault: false }];
    if (cmd === 'stop_live_capture') return { payload: { left: [0.1, 0.2], right: [0.3, 0.4], sampleRate: 48000, deviceName: 'x', streamErrors: [] }, quality: {} };
    return {};
  };
  const nd = createNativeDeps(invoke, { sleep: async () => {} });
  const cap = await nd.captureDeck({ preset: PRESET, seconds: 5 });
  assert.ok(cap.left instanceof Float32Array);
  assert.deepEqual(log.filter(l => l[0] === 'start_live_capture')[0][1], { deviceName: 'Traktor Audio 8 DJ ASIO', maxSeconds: 7, holder: 'pre-gig' });
  await nd.captureDeck({ preset: PRESET, pair: 3, seconds: 5 });
  assert.deepEqual(log.filter(l => l[0] === 'start_live_capture')[1][1], { deviceName: 'Traktor Audio 8 DJ ASIO', maxSeconds: 7, holder: 'pre-gig', pairs: [3] });
  await nd.processes();
  await nd.midiPorts();
  assert.deepEqual(log.slice(-2).map(l => l[0]), ['pregig_processes', 'midi_list_ports']);
  assert.deepEqual(createNativeDeps(undefined), {});
});

// ---------------------------------------------------------------- persistence
test('toRunInput maps a run to the pregig_save_run contract, redacting Windows user paths', async () => {
  const run = await runPregig({ preset: { ...PRESET, decks: [PRESET.decks[0]] }, deps: deps() });
  run.results[0].evidence = { note: 'C:\\Users\\sheldon\\AppData\\x.dmp and D:\\Users\\bob\\y' };
  const input = toRunInput(run, { appVersion: '0.0.6' });
  assert.equal(input.presetId, null, 'built-in presets are not database rows');
  assert.equal(input.verdict, run.verdict);
  assert.equal(input.appVersion, '0.0.6');
  assert.ok(input.steps.every(s => ['pass', 'warn', 'fail', 'skipped', 'unsupported', 'error'].includes(s.state)));
  assert.ok(!JSON.stringify(input).includes('sheldon') && !JSON.stringify(input).includes('bob'));
  assert.match(JSON.stringify(input.steps[0].evidence), /%USERPROFILE%/);
  assert.equal(toRunInput({ ...run, presetId: 'user-1' }).presetId, 'user-1');
  assert.deepEqual(redactPaths({ a: ['C:\\Users\\x\\y'], n: 3 }), { a: ['%USERPROFILE%\\y'], n: 3 });
  const keys = Object.keys(CONTRACT.pregig_save_run.request.run).sort();
  assert.deepEqual(Object.keys(input).sort(), keys);
  assert.deepEqual(Object.keys(input.steps[0]).sort(), Object.keys(CONTRACT.pregig_save_run.request.run.steps[0]).sort());
});

test('createPregigApi (native) sends exactly the contract argument names', async () => {
  const calls = [];
  const api = createPregigApi({ invoke: async (cmd, args) => { calls.push([cmd, args]); return null; } });
  assert.equal(api.native, true);
  await api.saveRun(CONTRACT.pregig_save_run.request.run);
  await api.listRuns('preset-contract', 10);
  await api.getRun(CONTRACT.pregig_get_run.request.id);
  await api.listPresets();
  await api.upsertPreset(CONTRACT.pregig_preset_upsert.request.preset);
  await api.deletePreset('preset-contract');
  assert.deepEqual(calls.map(c => c[0]), ['pregig_save_run', 'pregig_list_runs', 'pregig_get_run', 'pregig_preset_list', 'pregig_preset_upsert', 'pregig_preset_delete']);
  assert.deepEqual(calls[1][1], CONTRACT.pregig_list_runs.request);
  assert.deepEqual(calls[2][1], CONTRACT.pregig_get_run.request);
  assert.deepEqual(calls[4][1], CONTRACT.pregig_preset_upsert.request);
  assert.deepEqual(calls[5][1], CONTRACT.pregig_preset_delete.request);
  assert.deepEqual(Object.keys(calls[0][1]), ['run']);
});

test('createPregigApi (browser) stores runs and presets locally with the same shapes', async () => {
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  let n = 0;
  const api = createPregigApi({ invoke: null, storage, newId: () => `id-${++n}`, now: () => '2026-10-10T18:00:00.000Z' });
  assert.equal(api.native, false);
  const a = await api.saveRun({ ...CONTRACT.pregig_save_run.request.run, presetId: 'p1' });
  await api.saveRun({ ...CONTRACT.pregig_save_run.request.run, presetId: 'p2' });
  const list = await api.listRuns('p1');
  assert.deepEqual(list.map(r => r.id), [a.id]);
  assert.deepEqual([list[0].stepCount, list[0].failCount, list[0].warnCount], [2, 0, 1]);
  assert.equal((await api.listRuns()).length, 2);
  const detail = await api.getRun(a.id);
  assert.equal(detail.steps.length, 2);
  assert.equal(await api.getRun('missing'), null);
  const p = await api.upsertPreset({ name: ' Rig ', json: PRESET });
  assert.equal(p.name, 'Rig');
  const edited = await api.upsertPreset({ id: p.id, name: 'Rig 2', json: PRESET });
  assert.equal(edited.createdAt, p.createdAt);
  assert.equal((await api.listPresets()).length, 1);
  assert.equal(await api.deletePreset(p.id), true);
  assert.equal(await api.deletePreset(p.id), false);
  const broken = createPregigApi({ invoke: null, storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } });
  assert.deepEqual(await broken.listRuns(), []);
  await broken.saveRun(CONTRACT.pregig_save_run.request.run);
});

test('contract examples are real step results shapes (states the database accepts)', () => {
  for (const s of CONTRACT.pregig_save_run.request.run.steps) assert.ok(['pass', 'warn', 'fail', 'skipped', 'unsupported', 'error'].includes(s.state));
  assert.deepEqual(Object.keys(CONTRACT.pregig_processes.response.apps[0]).sort(), ['app', 'exe', 'pid', 'running', 'version']);
});
