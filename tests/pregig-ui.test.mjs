// FS-10 UI view model + controller (no DOM): honest wording for steps that could not be measured, verdict banner,
// fix buttons, re-run merging, comparison, gear filtering, and the run controller against fake dependencies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rollUp, buildPlan, createPregigApi } from '../app/pre-gig.js';
import {
  describeStep, pairUnavailableDecks, verdictView, fixButtons, evidenceRows, rerunTargets, mergeRerun, compareView, stepLabel,
  profilesForPreset, runMatchesPreset, runNotes, durationText, estimateText, createPregigController, PAIR_UNAVAILABLE_TEXT,
} from '../app/ui/workflows/pregig.js';

const r = (stepId, state, extra = {}) => ({ stepId, kind: stepId.split(':')[0], deck: stepId.split(':')[1] || null, label: stepId, required: true, manual: false, state, summary: `${stepId} ${state}`, evidence: {}, fix: [], reason: null, ...extra });
const makeRun = results => { const rollup = rollUp(results); return { results, rollup, verdict: rollup.verdict, durationMs: 1000, manualMs: 0, withinBudget: true, startedAt: '2026-10-10T20:00:00.000Z', finishedAt: '2026-10-10T20:00:01.000Z', presetName: 'Rig' }; };
const deckBSkipped = [r('timecode:B', 'skipped', { reason: 'input-pair', summary: 'Deck B: Input pair 3-4 is not available on Interface: it has 2 input channels (pairs 1-2).' }), r('signal:B', 'skipped', { reason: 'input-pair' })];

test('describeStep: an input pair the interface lacks reads as "no such input", not a failure', () => {
  const v = describeStep({ state: 'skipped', result: deckBSkipped[0] });
  assert.equal(v.word, 'No such input');
  assert.equal(v.headline, PAIR_UNAVAILABLE_TEXT);
  assert.equal(v.tone, 'info');
  assert.ok(v.notMeasured);
  assert.match(v.detail, /pair 3-4/);
});

test('describeStep: every engine state has a word and a tone; live states are not chips', () => {
  assert.equal(describeStep({ state: 'pass', result: r('audio', 'pass') }).word, 'Pass');
  assert.equal(describeStep({ state: 'error', result: r('audio', 'error') }).tone, 'warn');
  assert.equal(describeStep({ state: 'fail', result: r('audio', 'fail') }).tone, 'fail');
  assert.equal(describeStep({ state: 'unsupported', result: r('midi', 'unsupported') }).word, 'Desktop only');
  assert.equal(describeStep({ state: 'skipped', result: r('timecode:A', 'skipped', { reason: 'blocked' }) }).word, 'Blocked');
  assert.equal(describeStep({ state: 'running' }).kind, 'live');
  assert.equal(describeStep(undefined).word, 'Waiting');
});

test('verdictView: only deck B unmeasured gives an amber "Not fully checked" that says why', () => {
  const run = makeRun([r('audio', 'pass'), r('timecode:A', 'pass'), r('signal:A', 'pass'), ...deckBSkipped]);
  const v = verdictView(run);
  assert.equal(run.verdict, 'incomplete');
  assert.equal(v.level, 'amber');
  assert.equal(v.title, 'Not fully checked');
  assert.match(v.copy, /inputs for deck B are not on this audio interface/);
  assert.deepEqual(pairUnavailableDecks(run.results), ['B']);
});

test('verdictView: red stays red and still notes deck B; green copy is the engine copy', () => {
  const red = verdictView(makeRun([r('audio', 'fail'), ...deckBSkipped]));
  assert.equal(red.level, 'red'); assert.equal(red.title, 'Not ready');
  assert.equal(red.notices.length, 1);
  const green = verdictView(makeRun([r('audio', 'pass'), r('timecode:A', 'pass')]));
  assert.equal(green.title, 'Ready to play'); assert.match(green.copy, /^Ready to play\. 2 of 2/);
});

test('fixButtons: keeps actions, dedupes, info entries have no action', () => {
  const res = r('audio', 'fail', { fix: [{ label: 'Try', text: 'a', action: { kind: 'retry' } }, { label: 'Try', text: 'a', action: { kind: 'retry' } }, { label: 'Read', text: 'b' }, { label: 'Go', text: 'c', action: { kind: 'navigate', to: 'dvs' } }, { label: 'Stop', text: 'd', action: { kind: 'preempt', holder: 'live-monitor' } }] });
  const b = fixButtons(res);
  assert.deepEqual(b.map(x => x.kind), ['retry', 'info', 'navigate', 'preempt']);
  assert.equal(b[2].to, 'dvs'); assert.equal(b[3].holder, 'live-monitor');
});

test('evidenceRows: labels, units, nesting, empties dropped', () => {
  const rows = evidenceRows({ snrDb: 31.2, phaseErrDeg: 4, format: { name: 'Traktor Scratch MK2' }, hum: { mainsHz: 50, marginDb: 60 }, missing: [], found: null, running: true });
  const get = l => rows.find(x => x.label === l)?.value;
  assert.equal(get('Signal to noise'), '31.2 dB'); assert.equal(get('Phase error'), '4°');
  assert.equal(get('Timecode format'), 'Traktor Scratch MK2'); assert.equal(get('Mains hum'), '50 Hz'); assert.equal(get('Running'), 'Yes');
  assert.equal(rows.length, 6);
});

test('rerunTargets and mergeRerun: only the chosen steps change and the verdict is recomputed', () => {
  const run = makeRun([r('audio', 'pass'), r('timecode:A', 'fail'), r('signal:A', 'warn'), r('headphones', 'skipped', { reason: 'user' }), ...deckBSkipped]);
  assert.deepEqual(rerunTargets(run), ['timecode:A', 'signal:A']);
  const partial = { results: [r('timecode:A', 'pass'), r('signal:A', 'pass'), r('audio', 'fail')], durationMs: 400, manualMs: 0, withinBudget: true, finishedAt: 'later' };
  const merged = mergeRerun(run, partial, ['timecode:A', 'signal:A']);
  assert.equal(merged.results.find(x => x.stepId === 'audio').state, 'pass'); // not in ids: untouched
  assert.equal(merged.results.find(x => x.stepId === 'timecode:A').state, 'pass');
  assert.equal(merged.verdict, 'incomplete');
  assert.equal(merged.durationMs, 1400);
});

test('compareView: trends and headline', () => {
  const c = compareView({ verdictFrom: 'green', verdictTo: 'red', changed: [{ stepId: 'timecode:A', from: 'pass', to: 'fail', trend: 'worse' }], added: [], removed: ['midi'], unchanged: 3 }, stepLabel);
  assert.equal(c.lines[0].text, 'Timecode, deck A: Pass to Fail (worse)');
  assert.equal(c.headline, '1 check changed.'); assert.deepEqual(c.removed, ['MIDI gear']);
  assert.equal(compareView({ verdictFrom: 'green', verdictTo: 'green', changed: [], added: [], removed: [], unchanged: 5 }).headline, 'Nothing changed since the last check.');
});

test('profilesForPreset: judges only the rig, not every profile in the library', () => {
  const all = [{ id: 'a', model: 'Traktor Audio 8 DJ' }, { id: 'ddj', model: 'DDJ-S8', drivers: [{ deviceNamePatterns: ['DDJ-S8'] }] }, { id: 'mx', model: 'Allen & Heath Xone:23C' }, { id: 'tt', model: 'SL-1200MK4' }];
  const preset = { audioDevice: 'Traktor Audio 8 DJ', mixer: 'Allen & Heath Xone:23C', profileIds: { turntables: ['tt'] } };
  assert.deepEqual(profilesForPreset(preset, all).map(p => p.id), ['a', 'mx', 'tt']);
});

test('runMatchesPreset: built-ins match by notes, saved presets by id', () => {
  const builtin = { id: 'builtin-x', name: 'Rig', builtin: true };
  assert.ok(runMatchesPreset({ presetId: null, notes: runNotes(builtin) }, builtin));
  assert.ok(!runMatchesPreset({ presetId: null, notes: 'Preset: Other' }, builtin));
  assert.ok(runMatchesPreset({ presetId: 'p1', notes: null }, { id: 'p1', name: 'Mine' }));
});

test('time text', () => {
  assert.equal(durationText(5400), '5 s'); assert.equal(durationText(125000), '2 min 05 s');
  const plan = buildPlan({ decks: [{ id: 'A' }], software: 'X', midi: [] });
  assert.match(estimateText(plan), /^About \d+ s, plus the headphone check$/);
});

// ---- controller against fake dependencies
const preset = { id: 'builtin-t', builtin: true, name: 'Rig', audioDevice: 'Interface One', sampleRate: 48000, software: '', decks: [{ id: 'A', input: [2, 3], format: 'Serato CV02.5' }], midi: [] };
function fakeApi() {
  const runs = [];
  return { runs, async saveRun(run) { const id = `run-${runs.length + 1}`; runs.unshift({ ...run, id, stepCount: run.steps.length, failCount: 0, warnCount: 0 }); return { id }; },
    async listRuns() { return runs.map(({ steps, ...x }) => x); }, async getRun(id) { const x = runs.find(q => q.id === id); const { steps, ...run } = x; return { run, steps }; } };
}

test('controller: full run keeps deck input-pair skip honest, saves once, compares on the second run', async () => {
  const api = fakeApi();
  const deps = { listInputs: async () => [{ name: 'Interface One' }], captureDeck: async () => { throw new Error('Input pair 3-4 is not available on Interface One: it has 2 input channels (pairs 1-2).'); } };
  const ctl = createPregigController({ api, deps, appVersion: () => '0.0.6', now: () => 0 });
  const seen = [];
  ctl.subscribe(s => seen.push(s.phase));
  const prompts = [];
  ctl.subscribe(s => { if (s.prompt && !prompts.includes(s.prompt)) { prompts.push(s.prompt); queueMicrotask(() => ctl.answer('yes')); } });
  const run1 = await ctl.start(preset);
  assert.equal(ctl.state.phase, 'done');
  assert.equal(run1.results.find(x => x.stepId === 'timecode:A').reason, 'input-pair');
  assert.equal(run1.verdict, 'incomplete');
  assert.equal(api.runs.length, 1); assert.equal(api.runs[0].notes, 'Preset: Rig'); assert.equal(api.runs[0].appVersion, '0.0.6');
  assert.equal(ctl.state.compare, null);
  await ctl.start(preset);
  assert.equal(api.runs.length, 2);
  assert.match(ctl.state.compare.headline, /Nothing changed/);
  assert.ok(seen.includes('running'));
});

test('controller: cancel keeps partial results as cancelled; rerun merges and saves a new run', async () => {
  const api = fakeApi();
  let release;
  const gate = new Promise(res => { release = res; });
  const deps = { listInputs: async () => { await gate; return [{ name: 'Interface One' }]; } };
  const ctl = createPregigController({ api, deps });
  const started = ctl.start(preset);
  await Promise.resolve();
  assert.equal(ctl.cancel(), true);
  release();
  const run = await started;
  assert.equal(run.verdict, 'cancelled');
  assert.equal(ctl.cancel(), false);
  ctl.subscribe(s => { if (s.prompt) queueMicrotask(() => ctl.answer('skip')); });
  const merged = await ctl.rerun(['audio']);
  assert.equal(merged.results.find(x => x.stepId === 'audio').state, 'pass');
  assert.equal(api.runs.length, 2);
});

test('controller: failed browser persistence retains the completed result and retry never repeats the check', async () => {
  const records = new Map(); let denied = true, writes = 0, checks = 0, nextId = 0;
  const api = createPregigApi({ invoke: null, newId: () => `retry-${++nextId}`, storage: {
    getItem: key => records.get(key) ?? null,
    setItem(key, value) { writes++; if (denied) throw new Error('private storage details'); records.set(key, value); },
  } });
  const ctl = createPregigController({ api, deps: { listInputs: async () => { checks++; return []; } }, now: () => 0 });
  const result = await ctl.start(preset), snapshot = structuredClone(result);
  assert.equal(ctl.state.phase, 'done'); assert.equal(ctl.state.saved, null); assert.equal(ctl.state.saving, false);
  assert.match(ctl.state.error, /could not be saved/); assert.doesNotMatch(ctl.state.error, /private/);
  assert.equal(writes, 1); assert.equal(records.size, 0);
  denied = false;
  const saved = await ctl.retrySave();
  assert.equal(saved.id, 'retry-2'); assert.equal(ctl.state.error, null);
  assert.equal(ctl.state.run, result); assert.deepEqual(result, snapshot); assert.equal(checks, 1);
  assert.equal((await api.listRuns()).length, 1); assert.equal(writes, 2);
  assert.equal(await ctl.retrySave(), saved); assert.equal(writes, 2);
});

test('controller: overlapping save retries share one write and cannot be replaced by a new run or reset', async () => {
  let attempts = 0, release;
  const waiting = new Promise(resolve => { release = resolve; });
  const api = { listRuns: async () => [], async saveRun() { attempts++; if (attempts === 1) throw new Error('Unavailable'); return waiting; } };
  const ctl = createPregigController({ api, deps: { listInputs: async () => [] }, now: () => 0 });
  const result = await ctl.start(preset);
  const first = ctl.retrySave(), second = ctl.retrySave();
  assert.equal(first, second); assert.equal(ctl.state.saving, true);
  assert.equal(await ctl.start(preset), null); assert.equal(await ctl.rerun(['audio']), null);
  ctl.reset(); assert.equal(ctl.state.run, result); assert.equal(ctl.state.phase, 'done');
  await new Promise(resolve => setImmediate(resolve)); assert.equal(attempts, 2);
  release({ id: 'confirmed' }); await Promise.all([first, second]);
  assert.equal(ctl.state.saved.id, 'confirmed'); assert.equal(ctl.state.saving, false); assert.equal(attempts, 2);
});

test('controller: unavailable history does not become an empty baseline or a successful save', async () => {
  let unavailable = true, writes = 0, checks = 0;
  const api = { async listRuns() { if (unavailable) throw new Error('History unavailable'); return []; }, async saveRun() { writes++; return { id: 'recovered' }; } };
  const ctl = createPregigController({ api, deps: { listInputs: async () => { checks++; return []; } }, now: () => 0 });
  const result = await ctl.start(preset);
  assert.equal(writes, 0); assert.equal(ctl.state.saved, null); assert.equal(ctl.state.compare, null);
  assert.match(ctl.state.error, /History unavailable/); assert.equal(ctl.state.run, result);
  unavailable = false; await ctl.retrySave();
  assert.equal(writes, 1); assert.equal(checks, 1); assert.equal(ctl.state.run, result); assert.equal(ctl.state.saved.id, 'recovered');
});

test('controller: a failed save after rerun cannot retain the previous result success marker', async () => {
  const api = fakeApi(); let denied = false, checks = 0;
  const originalSave = api.saveRun;
  api.saveRun = async run => { if (denied) throw new Error('Write unavailable'); return originalSave(run); };
  const ctl = createPregigController({ api, deps: { listInputs: async () => { checks++; return []; } }, now: () => 0 });
  const first = await ctl.start(preset); assert.equal(ctl.state.saved.id, 'run-1');
  denied = true;
  const updated = await ctl.rerun(['audio']);
  assert.notEqual(updated, first); assert.equal(ctl.state.run, updated); assert.equal(ctl.state.saved, null);
  assert.match(ctl.state.error, /Write unavailable/); assert.equal(api.runs.length, 1);
  denied = false; await ctl.retrySave();
  assert.equal(ctl.state.saved.id, 'run-2'); assert.equal(ctl.state.run, updated); assert.equal(checks, 2); assert.equal(api.runs.length, 2);
});
