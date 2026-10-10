import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialWizardState, reduceWizard, stepsFor, summarize, migrateWizardState, serializeWizardState, sanitizeAnswers,
  resumeDecision, startupDecision, levelVerdict, toneLevelDbfs, calibrationDefault, currentStepId, stepAnnouncement,
  STEP_IDS, RESUME_MAX_AGE_DAYS, DEFAULT_SAMPLE_RATE,
} from '../app/setup-wizard-model.js';

const WIN = { systemHealth: true };
const WEB = { systemHealth: false };
const T0 = '2026-10-01T10:00:00.000Z';
const run = (state, env, ...actions) => actions.reduce((s, a) => reduceWizard(s, { env, now: T0, ...a }), state);

test('step list: seven steps on Windows, health dropped elsewhere (AC-7)', () => {
  assert.deepEqual(stepsFor(WIN), STEP_IDS);
  assert.equal(stepsFor(WIN).length, 7);
  assert.deepEqual(stepsFor(WEB), ['welcome', 'interface', 'levels', 'calibration', 'gear', 'summary']);
  assert.deepEqual(stepsFor(), stepsFor(WEB));
  assert.deepEqual(stepsFor({ systemHealth: 'yes' }), stepsFor(WEB), 'only a literal true enables health');
});

test('start, next, back and the bounds', () => {
  let s = run(initialWizardState(), WIN, { type: 'start' });
  assert.equal(s.status, 'in_progress');
  assert.equal(s.step, 1);
  s = run(s, WIN, { type: 'back' });
  assert.equal(s.step, 1, 'back stops at 1');
  s = run(s, WIN, { type: 'next' }, { type: 'next' });
  assert.equal(s.step, 3);
  assert.equal(currentStepId(s, WIN), 'levels');
  s = run(s, WIN, { type: 'back' });
  assert.equal(s.step, 2);
  for (let i = 0; i < 20; i++) s = run(s, WIN, { type: 'next' });
  assert.equal(s.step, 7, 'next stops on the last step');
  assert.equal(s.status, 'in_progress');
  s = run(s, WEB, { type: 'goto', step: 99 });
  assert.equal(s.step, 6, 'goto clamps to the env step count');
  assert.equal(run(s, WIN, { type: 'goto', step: -3 }).step, 1);
  assert.equal(run(s, WIN, { type: 'goto', step: NaN }), s);
});

test('skip semantics: skipping a step records it and advances; the summary cannot be skipped', () => {
  let s = run(initialWizardState(), WIN, { type: 'start' }, { type: 'next' }, { type: 'next' });
  s = run(s, WIN, { type: 'skipStep' }); // levels
  assert.equal(s.step, 4);
  assert.deepEqual(s.answers.skippedSteps, ['levels']);
  s = run(s, WIN, { type: 'back' }, { type: 'next' }); // coming back and pressing Next completes the step
  assert.deepEqual(s.answers.skippedSteps, []);
  s = run(s, WIN, { type: 'goto', step: 7 });
  const before = s;
  assert.equal(run(s, WIN, { type: 'skipStep' }), before);
  // Esc / Skip setup keeps the answers and marks skipped (AC-1)
  s = run(initialWizardState(), WIN, { type: 'start' }, { type: 'answer', patch: { inputDevice: 'Traktor Audio 8 DJ' } }, { type: 'skipWizard' });
  assert.equal(s.status, 'skipped');
  assert.equal(s.answers.inputDevice, 'Traktor Audio 8 DJ');
  // actions that need an active wizard are ignored once skipped
  assert.equal(run(s, WIN, { type: 'next' }), s);
  assert.equal(run(s, WIN, { type: 'answer', patch: { inputDevice: 'x' } }), s);
});

test('answers are merged, sanitized and bounded', () => {
  let s = run(initialWizardState(), WIN, { type: 'start' });
  s = run(s, WIN, { type: 'answer', patch: { inputDevice: 'Interface', sampleRate: 96000, ownedProductIds: ['b', 'a', 'a', ' ', 42, ' c '], bogus: 1 } });
  assert.equal(s.answers.sampleRate, 96000);
  assert.deepEqual(s.answers.ownedProductIds, ['a', 'b', 'c']);
  assert.equal('bogus' in s.answers, false);
  s = run(s, WIN, { type: 'answer', patch: { sampleRate: 12345, calibration: 'maybe', levelCheck: { peakDbfs: -12.4, verdict: 'ok' }, health: { errors: 0, warnings: 2 } } });
  assert.equal(s.answers.sampleRate, 96000, 'invalid rate keeps the previous value');
  assert.equal(s.answers.calibration, null);
  assert.deepEqual(s.answers.levelCheck, { peakDbfs: -12.4, verdict: 'ok' });
  assert.deepEqual(s.answers.health, { errors: 0, warnings: 2 });
  assert.equal(s.answers.inputDevice, 'Interface', 'untouched answers survive a patch');
  assert.equal(sanitizeAnswers({ levelCheck: { peakDbfs: NaN, verdict: "ok" }, health: { errors: -1, warnings: 0 } }).levelCheck, null);
  assert.equal(sanitizeAnswers('x').sampleRate, DEFAULT_SAMPLE_RATE);
  assert.equal(sanitizeAnswers({ inputDevice: 'x'.repeat(500) }).inputDevice.length, 200);
  assert.equal(sanitizeAnswers({ ownedProductIds: Array.from({ length: 900 }, (_, i) => `p${i}`) }).ownedProductIds.length, 500);
  assert.equal(run(s, WIN, { type: 'answer', patch: 'oops' }), s);
});

test('resume after step N restores step and answers (AC-2)', () => {
  let s = run(initialWizardState(), WIN, { type: 'start' }, { type: 'answer', patch: { inputDevice: 'Rig', sampleRate: 44100 } }, { type: 'next' }, { type: 'next' });
  const saved = JSON.parse(JSON.stringify({ ...serializeWizardState(s), version: 1, updatedAt: s.updatedAt }));
  const loaded = migrateWizardState(saved);
  assert.equal(loaded.step, 3);
  assert.equal(loaded.answers.inputDevice, 'Rig');
  const resumed = run(loaded, WIN, { type: 'resume' });
  assert.equal(resumed.step, 3);
  assert.equal(resumed.answers.sampleRate, 44100);
  assert.equal(stepAnnouncement(resumed, WIN), 'Step 3 of 7: Test tone and levels');
  // resume on a non in_progress state is a no-op
  const done = run(s, WIN, { type: 'finish' });
  assert.equal(run(done, WIN, { type: 'resume' }), done);
});

test('re-run keeps prefilled answers, restarts at step 1 and clears the skip marks (AC-8)', () => {
  let s = run(initialWizardState(), WIN, { type: 'start' }, { type: 'answer', patch: { inputDevice: 'Rig', ownedProductIds: ['x'] } }, { type: 'skipStep' }, { type: 'finish' });
  assert.equal(s.status, 'completed');
  assert.ok(s.completedAt);
  s = run(s, WIN, { type: 'start' });
  assert.equal(s.status, 'in_progress');
  assert.equal(s.step, 1);
  assert.equal(s.completedAt, null);
  assert.equal(s.answers.inputDevice, 'Rig');
  assert.deepEqual(s.answers.ownedProductIds, ['x']);
  assert.deepEqual(s.answers.skippedSteps, []);
});

test('finish completes only an active wizard', () => {
  assert.equal(run(initialWizardState(), WIN, { type: 'finish' }).status, 'none');
  const s = run(initialWizardState(), WEB, { type: 'start' }, { type: 'finish' });
  assert.equal(s.status, 'completed');
  assert.equal(s.step, 6);
  assert.equal(s.completedAt, T0);
  assert.equal(run(s, WEB, { type: 'skipWizard' }).status, 'completed', 'a completed wizard cannot be marked skipped');
});

test('migrateWizardState never throws and resets what it cannot trust', () => {
  const fresh = initialWizardState();
  for (const bad of [undefined, null, 5, 'x', [], {}, { status: 'weird' }, { version: 2, status: 'completed', step: 7 }, { version: -1, status: 'skipped' }, { version: 1.5, status: 'skipped' }, { status: 'none' }]) {
    assert.deepEqual(migrateWizardState(bad), fresh, JSON.stringify(bad));
  }
  const hostile = { get status() { throw new Error('boom'); } };
  assert.deepEqual(migrateWizardState(hostile), fresh);
  const ok = migrateWizardState({ version: 1, status: 'in_progress', step: 99, answers: { inputDevice: 3 }, completedAt: 'nope', updatedAt: T0, extra: 1 });
  assert.equal(ok.step, 1, 'out-of-range step falls back to 1');
  assert.equal(ok.answers.inputDevice, '');
  assert.equal(ok.completedAt, null);
  assert.equal(ok.updatedAt, T0);
  assert.equal('extra' in ok, false);
  // a version-less record (older shape) is accepted and upgraded
  assert.equal(migrateWizardState({ status: 'skipped', step: 2 }).status, 'skipped');
  assert.deepEqual(serializeWizardState(ok), { status: 'in_progress', step: 1, answers: ok.answers });
  assert.equal(serializeWizardState(initialWizardState()).status, 'in_progress');
  // reducer survives garbage too
  assert.equal(reduceWizard(fresh, null), fresh);
  assert.equal(reduceWizard(fresh, { type: 'nope' }), fresh);
});

test('summarize copes with missing answers and per-env rows', () => {
  const empty = summarize(initialWizardState(), WIN);
  assert.deepEqual(empty.rows.map(r => r.id), ['input', 'output', 'sampleRate', 'levels', 'calibration', 'gear', 'health']);
  assert.equal(empty.rows[0].value, 'Not chosen');
  assert.equal(empty.rows[2].value, '48 kHz');
  assert.equal(empty.rows.at(-1).value, 'Not scanned');
  assert.ok(empty.text.startsWith('DeckChek setup summary\nInput: Not chosen'));
  assert.equal(summarize(initialWizardState(), WEB).rows.some(r => r.id === 'health'), false);
  const full = summarize({ status: 'completed', step: 7, answers: {
    inputDevice: 'Traktor Audio 8 DJ', outputDevice: 'Main out', sampleRate: 96000, levelCheck: { peakDbfs: -12.4, verdict: 'ok' },
    calibration: 'existing', ownedProductIds: ['a'], health: { errors: 1, warnings: 2 }, skippedSteps: ['levels'] } }, WIN);
  const by = Object.fromEntries(full.rows.map(r => [r.id, r.value]));
  assert.deepEqual(by, {
    input: 'Traktor Audio 8 DJ', output: 'Main out', sampleRate: '96 kHz', levels: 'OK (peak -12.4 dBFS)', calibration: 'Already calibrated',
    gear: '1 product', health: '1 error, 2 warnings',
  });
  assert.deepEqual(full.skippedSteps, ['levels']);
  assert.equal(summarize(null, null).rows.length, 6);
});

test('resume window is 30 days (AC-2)', () => {
  const s = { version: 1, status: 'in_progress', step: 3, answers: {}, updatedAt: T0 };
  const t0 = Date.parse(T0), day = 86_400_000;
  assert.equal(RESUME_MAX_AGE_DAYS, 30);
  assert.equal(resumeDecision(s, t0 + 30 * day), 'restore');
  assert.equal(resumeDecision(s, t0 + 30 * day + 1), 'restart');
  assert.equal(resumeDecision(s, new Date(t0 + day)), 'restore');
  assert.equal(resumeDecision({ ...s, updatedAt: null }, t0), 'restart');
  assert.equal(resumeDecision({ ...s, status: 'skipped' }, t0), 'none');
  assert.equal(resumeDecision(null, t0), 'none');
});

test('startup decision: fresh, upgrade install, resumable, finished, flag off (AC-1, AC-2, AC-10)', () => {
  const now = Date.parse(T0);
  assert.equal(startupDecision({ stored: null, hasUserData: false, now }).action, 'open');
  const up = startupDecision({ stored: null, hasUserData: true, now });
  assert.equal(up.action, 'auto-complete');
  assert.equal(up.state.status, 'completed');
  assert.equal(up.state.answers.autoCompleted, true);
  assert.equal(up.state.completedAt, T0);
  assert.deepEqual(serializeWizardState(up.state).status, 'completed');
  // an upgrade install can still re-run: start clears autoCompleted
  const rerun = reduceWizard(up.state, { type: 'start', env: WIN });
  assert.equal(rerun.status, 'in_progress');
  assert.equal('autoCompleted' in rerun.answers, false);
  const mid = { version: 1, status: 'in_progress', step: 3, answers: {}, updatedAt: T0 };
  assert.equal(startupDecision({ stored: mid, now: now + 1000 }).action, 'resume-banner');
  assert.equal(startupDecision({ stored: mid, now: now + 31 * 86_400_000 }).action, 'restart-banner');
  for (const status of ['skipped', 'completed']) assert.equal(startupDecision({ stored: { version: 1, status, step: 2 }, hasUserData: true, now }).action, 'none');
  assert.equal(startupDecision({ stored: null, enabled: false, now }).action, 'none');
  assert.equal(startupDecision({ stored: { version: 9, status: 'completed' }, now }).action, 'open', 'future version is treated as unseen');
  // dismissing the banner marks the wizard skipped, so it does not return
  assert.equal(reduceWizard(migrateWizardState(mid), { type: 'skipWizard', now: T0 }).status, 'skipped');
});

test('level verdict table (spec §6)', () => {
  const lin = db => 10 ** (db / 20);
  const v = (peakDb, rmsL = peakDb - 3, rmsR = peakDb - 3) => levelVerdict({ peakLeft: lin(peakDb), peakRight: lin(peakDb), rmsLeft: lin(rmsL), rmsRight: lin(rmsR) });
  assert.equal(v(-0.5).verdict, 'clip');
  assert.equal(v(-1).verdict, 'clip', '-1 dBFS is the clip threshold, inclusive');
  assert.equal(v(-1.01).verdict, 'ok');
  assert.equal(v(-12.4).verdict, 'ok');
  assert.equal(v(-12.4).text, 'Input peaks at −12.4 dBFS, good.');
  assert.equal(v(-39.9).verdict, 'ok');
  assert.equal(v(-40.1).verdict, 'low');
  assert.match(v(-45).text, /Raise the interface gain or check the phono\/line switch/);
  assert.equal(levelVerdict({}).verdict, 'low', 'silence is low');
  assert.equal(levelVerdict({}).peakDbfs, -Infinity);
  assert.equal(levelVerdict({ peakLeft: 1, peakRight: 0.1 }).verdict, 'clip', 'either channel can clip');
  // imbalance: strictly more than 3 dB
  assert.equal(v(-12, -15, -18.1).imbalance, true);
  assert.equal(v(-12, -15, -17.9).imbalance, false);
  assert.equal(v(-12, -15, -18.1).verdict, 'ok', 'imbalance is a warning, not a verdict');
  assert.match(v(-12, -15, -20).text, /differ by more than 3 dB/);
  assert.equal(levelVerdict({ peakLeft: 0.2, peakRight: 0.2, rmsLeft: 0.1, rmsRight: 0 }).imbalance, false, 'a dead channel has no measurable ratio');
});

test('test tone is capped at -12 dBFS and defaults to -20 (AC-4)', () => {
  assert.equal(toneLevelDbfs(undefined), -20);
  assert.equal(toneLevelDbfs(NaN), -20);
  assert.equal(toneLevelDbfs('loud'), -20);
  assert.equal(toneLevelDbfs(-30), -30);
  assert.equal(toneLevelDbfs(-12), -12);
  assert.equal(toneLevelDbfs(-6), -12);
  assert.equal(toneLevelDbfs(0), -12);
  assert.equal(toneLevelDbfs(Infinity), -20);
});

test('calibration default (AC-5) and announcements', () => {
  assert.equal(calibrationDefault(true), 'existing');
  assert.equal(calibrationDefault(false), null);
  assert.equal(stepAnnouncement({ step: 1 }, WEB), 'Step 1 of 6: Welcome');
  assert.equal(stepAnnouncement({ step: 6, status: 'in_progress' }, WEB), 'Step 6 of 6: Summary');
  assert.equal(stepAnnouncement({ version: 1, status: 'in_progress', step: 7 }, WEB), 'Step 6 of 6: Summary', 'a Windows step number clamps in browser mode');
});
