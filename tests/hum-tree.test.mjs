import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HUM_STEPS, HUM_STEPS_VERSION, CAUSES, DROP_DB, RISE_DB, NO_CHANGE_DB, HUM_PRESENT_DB, SKIPPED_FACTOR, DROP_MESSAGE, RISE_MESSAGE,
  stepById, stepResult, deltaDb, classifyDelta, analyzeSteps, rankCauses, verdict, measureStep, liveHumReading, humRunInput,
  createHumRunStore, toHumRunError, HumRunError, STORAGE_KEY,
} from '../app/hum-tree.js';
import { humMix, whiteNoise } from './fixtures/signals.mjs';

const CONTRACT = JSON.parse(readFileSync(new URL('./contracts/humrun.json', import.meta.url), 'utf8'));

/** A humMeasure-shaped result with a given total (all in the fundamental unless harmonics given). */
function m(totalDbfs, { floorDbfs = -110, harmonics, mainsHz = 50 } = {}) {
  const hs = harmonics ?? [{ n: 1, dbfs: totalDbfs }];
  const p = hs.reduce((s, h) => s + 10 ** (h.dbfs / 10), 0);
  const tot = harmonics ? 10 * Math.log10(p) : totalDbfs;
  return { mainsHz, fundamentalDbfs: hs[0].dbfs, harmonics: hs.map(h => ({ n: h.n, hz: h.n * mainsHz, dbfs: h.dbfs })), totalDbfs: tot, floorDbfs, humToFloorDb: tot - floorDbfs, oddEvenRatio: 1, uncertaintyDb: 0.1 };
}
const S = (id, total, o) => stepResult(id, total === null ? null : m(total, o), { skipped: total === null });

test('HUM_STEPS v1: unique ids, codes A-G, ground lift never the mains earth', () => {
  assert.equal(HUM_STEPS_VERSION, 'v1');
  assert.equal(new Set(HUM_STEPS.map(s => s.id)).size, HUM_STEPS.length);
  for (const c of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) assert.ok(HUM_STEPS.some(s => s.code === c), c);
  assert.match(stepById('ground_lift').instruction, /Never lift.*mains safety earth/);
  assert.ok(Object.isFrozen(HUM_STEPS) && Object.isFrozen(HUM_STEPS[0]));
  assert.equal(stepById('nope'), null);
  assert.throws(() => stepResult('nope', m(-60)), RangeError);
});

test('deltaDb is total(cur) - total(prev), null when skipped or unmeasured', () => {
  assert.ok(Math.abs(deltaDb(S('deck_cables', -57.4), S('tt_ground', -75.4)) + 18) < 1e-9);
  assert.equal(deltaDb(S('deck_cables', null), S('tt_ground', -60)), null);
  assert.equal(deltaDb(null, S('tt_ground', -60)), null);
});

test('classifyDelta boundaries at the tunable thresholds', () => {
  assert.deepEqual([DROP_DB, RISE_DB, NO_CHANGE_DB], [6, 6, 1]);
  assert.equal(classifyDelta(-6), 'drop');
  assert.equal(classifyDelta(-6.01), 'drop');
  assert.equal(classifyDelta(-5.99), 'minor');
  assert.equal(classifyDelta(6), 'rise');
  assert.equal(classifyDelta(6.01), 'rise');
  assert.equal(classifyDelta(5.99), 'minor');
  assert.equal(classifyDelta(0.99), 'noChange');
  assert.equal(classifyDelta(-0.99), 'noChange');
  assert.equal(classifyDelta(1), 'minor');
  assert.equal(classifyDelta(1.5, { uncertaintyDb: 2 }), 'noChange', 'below the measurement uncertainty is no change');
  assert.equal(classifyDelta(null), 'unknown');
  assert.equal(classifyDelta(NaN), 'unknown');
});

test('two steps at the floor are "no change" whatever the delta', () => {
  const a = S('mixer_alone', -105), b = S('deck_cables', -113);
  assert.equal(classifyDelta(deltaDb(a, b), { prev: a, cur: b }), 'noChange');
  // boundary of HUM_PRESENT_DB: exactly at the threshold counts as present
  const p = S('mixer_alone', -110 + HUM_PRESENT_DB), q = S('deck_cables', -110 + HUM_PRESENT_DB - 8);
  assert.equal(classifyDelta(deltaDb(p, q), { prev: p, cur: q }), 'drop');
  const p2 = S('mixer_alone', -110 + HUM_PRESENT_DB - 0.01);
  assert.equal(classifyDelta(deltaDb(p2, q), { prev: p2, cur: q }), 'noChange');
});

test('analyzeSteps: AC-2 drop message, probe steps are never the reference, skipped steps are spanned', () => {
  const steps = analyzeSteps([S('mixer_alone', -60), S('gain_zero', -90), S('deck_cables', -59), S('tt_ground', null), S('laptop_usb', -80)]);
  assert.equal(steps[1].deltaClass, 'drop');
  assert.equal(steps[1].refStepId, 'mixer_alone');
  assert.equal(steps[2].refStepId, 'mixer_alone', 'gain_zero is a probe');
  assert.equal(steps[2].deltaClass, 'minor');
  assert.equal(steps[3].deltaDb, null);
  assert.equal(steps[3].deltaClass, 'unknown');
  assert.equal(steps[4].refStepId, 'deck_cables');
  assert.equal(steps[4].spansSkipped, true);
  assert.equal(steps[4].message, DROP_MESSAGE);
  assert.equal(analyzeSteps([S('mixer_alone', -110), S('deck_cables', -50)])[1].message, RISE_MESSAGE);
  assert.deepEqual(analyzeSteps([]), []);
});

test('rankCauses: hum drop at the ground-wire step -> turntable ground cause, with the FS-15 copy', () => {
  const r = [S('mixer_alone', -108), S('deck_cables', -57.4), S('tt_ground', -75.4), S('laptop_usb', -75.2), S('laptop_charger', -75.6)];
  const causes = rankCauses(r);
  assert.equal(causes[0].id, 'tt_ground_missing');
  assert.ok(causes[0].confidence >= 0.7 && causes[0].confidence <= 0.95);
  for (const c of causes) {
    assert.ok(c.label && c.nextAction && c.evidence, c.id);
    assert.ok(c.confidence >= 0 && c.confidence <= 1);
  }
  assert.equal(verdict(r), 'Hum dropped 18 dB when the turntable ground was connected. The turntable ground wire was open.');
});

test('rankCauses: charger, USB, other gear and ground-lift steps', () => {
  const base = [S('mixer_alone', -108), S('deck_cables', -100), S('tt_ground', -101)];
  const charger = rankCauses([...base, S('laptop_usb', -100), S('laptop_charger', -70)]);
  assert.equal(charger[0].id, 'charger_ground');
  assert.match(verdict([...base, S('laptop_usb', -100), S('laptop_charger', -70)]), /^Hum rose 30 dB when the laptop charger/);
  const usb = rankCauses([...base, S('laptop_usb', -72), S('laptop_charger', -71)]);
  assert.equal(usb[0].id, 'usb_laptop_ground');
  const other = rankCauses([...base, S('laptop_usb', -100), S('laptop_charger', -100), S('other_gear', -80)]);
  assert.equal(other[0].id, 'other_gear');
  const lift = rankCauses([...base, S('laptop_usb', -60), S('laptop_charger', -60), S('other_gear', -60), S('ground_lift', -95)]);
  assert.ok(lift.some(c => c.id === 'ground_loop'));
  assert.ok(lift.some(c => c.id === 'usb_laptop_ground'));
});

test('rankCauses: ground wire raising hum is a turntable-mixer ground loop', () => {
  const causes = rankCauses([S('mixer_alone', -108), S('deck_cables', -95), S('tt_ground', -70)]);
  assert.equal(causes[0].id, 'ground_loop_tt_mixer');
});

test('rankCauses: hum from the deck cables that grounding does not fix -> contact / cable pickup', () => {
  const causes = rankCauses([S('mixer_alone', -108), S('deck_cables', -60), S('tt_ground', -60.5)]);
  assert.equal(causes[0].id, 'tt_ground_contact');
  assert.ok(causes.some(c => c.id === 'unbalanced_cable_pickup'));
  assert.ok(causes.some(c => c.id === 'ground_loop_tt_mixer'), 'fundamental-only hum also suggests a loop');
  // without step C the ground wire is suspected with lower confidence
  const noC = rankCauses([S('mixer_alone', -108), S('deck_cables', -60), S('tt_ground', null)]);
  assert.equal(noC[0].id, 'tt_ground_missing');
  assert.ok(noC[0].confidence < 0.6);
});

test('rankCauses: hum with nothing connected points at the mixer; gain probe refines it', () => {
  const unchanged = rankCauses([S('mixer_alone', -70), S('gain_zero', -70.3), S('deck_cables', -70)]);
  assert.equal(unchanged[0].id, 'mixer_internal');
  assert.equal(unchanged[0].confidence, 0.7);
  assert.match(unchanged[0].evidence, /after the gain stage/);
  const follows = rankCauses([S('mixer_alone', -70), S('gain_zero', -100), S('deck_cables', -70)]);
  assert.equal(follows.find(c => c.id === 'mixer_internal').confidence, 0.5);
});

test('rankCauses: buzz rich in high harmonics suggests dimmer / switch-mode interference', () => {
  const buzz = [{ n: 1, dbfs: -70 }, { n: 3, dbfs: -66 }, { n: 5, dbfs: -64 }, { n: 7, dbfs: -65 }];
  const causes = rankCauses([S('mixer_alone', -108), stepResult('deck_cables', m(0, { harmonics: buzz })), stepResult('tt_ground', m(0, { harmonics: buzz }))]);
  assert.ok(causes.some(c => c.id === 'dimmer_interference'));
  const hum = [{ n: 1, dbfs: -60 }, { n: 2, dbfs: -70 }];
  assert.ok(!rankCauses([S('mixer_alone', -108), stepResult('deck_cables', m(0, { harmonics: hum }))]).some(c => c.id === 'dimmer_interference'));
});

test('rankCauses: no hum -> empty list; unexplained hum -> "source not isolated"', () => {
  const quiet = [S('mixer_alone', -112), S('deck_cables', -111), S('tt_ground', -112)];
  assert.deepEqual(rankCauses(quiet), []);
  assert.equal(verdict(quiet), 'No significant mains hum was measured.');
  assert.equal(verdict([S('mixer_alone', null)]), 'No steps were measured.');
  const flat = rankCauses([S('mixer_alone', -108), S('deck_cables', -104), S('tt_ground', -100), S('laptop_usb', -97)]);
  assert.deepEqual(flat.map(c => c.id), ['unexplained']);
});

test('rankCauses: evidence spanning a skipped step loses confidence (partial run)', () => {
  const full = rankCauses([S('mixer_alone', -108), S('deck_cables', -100), S('tt_ground', -101), S('laptop_usb', -100), S('laptop_charger', -70)]);
  const partial = rankCauses([S('mixer_alone', -108), S('deck_cables', -100), S('tt_ground', -101), S('laptop_usb', null), S('laptop_charger', -70)]);
  const c1 = full.find(c => c.id === 'charger_ground').confidence, c2 = partial.find(c => c.id === 'charger_ground').confidence;
  assert.ok(Math.abs(c2 - Math.round(c1 * SKIPPED_FACTOR * 100) / 100) <= 0.011, `${c1} -> ${c2}`);
  for (const id of Object.keys(CAUSES)) assert.ok(CAUSES[id].label && CAUSES[id].nextAction, id);
});

test('measureStep: 5 s synthetic step within 0.3 dB; quality states', () => {
  const sig = humMix({ mainsHz: 50, harmonics: [{ n: 1, dbfs: -50 }, { n: 2, dbfs: -60 }, { n: 3, dbfs: -62 }], seconds: 5, noiseDbfs: -100, seed: 3 });
  const { measurement, quality } = measureStep(sig.samples, sig.sampleRate);
  assert.equal(quality.status, 'ok');
  assert.equal(measurement.mainsHz, 50);
  assert.ok(Math.abs(measurement.totalDbfs - sig.truth.totalDbfs) < 0.3, `${measurement.totalDbfs} vs ${sig.truth.totalDbfs}`);
  assert.ok(Math.abs(measurement.windowSec - 5) < 0.05);
  assert.equal(measureStep(new Float32Array(48000), 48000).quality.status, 'noSignal');
  assert.equal(measureStep(new Float32Array(48000), 48000).measurement, null);
  assert.equal(measureStep([], 48000).quality.status, 'noSignal');
  const short = humMix({ harmonics: [{ n: 1, dbfs: -50 }], seconds: 2 });
  assert.equal(measureStep(short.samples, 48000).quality.status, 'short');
  const loud = humMix({ harmonics: [{ n: 1, dbfs: 0 }], seconds: 5 });
  assert.equal(measureStep(loud.samples, 48000).quality.status, 'clipping');
});

test('measureStep -> stepResult -> rankCauses end to end on synthetic hum (ground wire fixes it)', () => {
  const run = (dbfs, seed) => {
    const s = dbfs === null ? whiteNoise(48000 * 5, 1e-5, seed) : humMix({ harmonics: [{ n: 1, dbfs }, { n: 2, dbfs: dbfs - 8 }], seconds: 5, noiseDbfs: -100, seed }).samples;
    return measureStep(s, 48000, { mains: 50 }).measurement;
  };
  const r = [stepResult('mixer_alone', run(null, 1)), stepResult('deck_cables', run(-55, 2)), stepResult('tt_ground', run(-73, 3))];
  const steps = analyzeSteps(r);
  assert.equal(steps[2].deltaClass, 'drop');
  assert.ok(Math.abs(steps[2].deltaDb + 18) < 0.3, String(steps[2].deltaDb));
  assert.equal(rankCauses(r)[0].id, 'tt_ground_missing');
});

test('liveHumReading (AC-1): fundamental, harmonics 2-6, total vs floor; indeterminate mains shows both', () => {
  const sig = humMix({ mainsHz: 60, harmonics: [{ n: 1, dbfs: -50 }, { n: 2, dbfs: -58 }, { n: 3, dbfs: -60 }, { n: 7, dbfs: -70 }], seconds: 1, noiseDbfs: -100 });
  const r = liveHumReading(sig.samples, 48000);
  assert.equal(r.mainsHz, 60);
  assert.equal(r.mainsIndeterminate, false);
  assert.deepEqual(r.displayHarmonics.map(h => h.n), [2, 3, 4, 5, 6]);
  assert.ok(Math.abs(r.fundamentalDbfs + 50) < 0.3);
  assert.ok(r.humToFloorDb > 30);
  const noise = liveHumReading(whiteNoise(48000, 1e-3, 9), 48000);
  assert.equal(noise.mainsIndeterminate, true);
  assert.ok(noise.alternate && noise.alternate.mainsHz !== noise.mainsHz);
  assert.throws(() => liveHumReading(new Float32Array(100), 48000), RangeError);
});

test('humRunInput matches the hum_run_save contract request', () => {
  const r = [S('mixer_alone', -91.8), S('deck_cables', -57.4), S('tt_ground', -75.4), S('laptop_usb', null)];
  const input = humRunInput(r, { venueId: 'venue-1' });
  const expect = CONTRACT.commands.hum_run_save.request.input;
  assert.deepEqual(Object.keys(input), Object.keys(expect));
  assert.equal(input.kind, 'hum');
  assert.equal(input.mainsHz, 50);
  assert.equal(input.causes[0].id, 'tt_ground_missing');
  assert.deepEqual(Object.keys(input.causes[0]), Object.keys(expect.causes[0]));
  assert.deepEqual(Object.keys(input.steps[1]), Object.keys(expect.steps[1]));
  assert.deepEqual(input.steps[3], { stepId: 'laptop_usb', label: stepById('laptop_usb').label, skipped: true, note: null });
  assert.equal(input.steps[2].deltaDb, -18);
  assert.equal(input.steps[0].deltaDb, null);
});

function fakeInvoke(replies = {}) {
  const calls = [];
  const invoke = async (name, args) => {
    calls.push([name, args]);
    const r = replies[name];
    if (r instanceof Error || typeof r === 'string') throw r;
    return r === undefined ? CONTRACT.commands[name]?.response ?? null : r;
  };
  return { calls, invoke };
}

test('store bridge passes exactly the contract argument names', async () => {
  const f = fakeInvoke({ hum_run_get: CONTRACT.commands.hum_run_save.response });
  const store = createHumRunStore({ invoke: f.invoke });
  assert.equal(store.native, true);
  const saved = await store.save(CONTRACT.commands.hum_run_save.request.input);
  assert.equal(saved.id, CONTRACT.commands.hum_run_save.response.id);
  await store.list({ venueId: 'venue-1', limit: 20 });
  await store.get('8f0c2a7e-3a59-4c1b-9d2e-6b9f4d1e2a10');
  assert.equal(await store.delete('8f0c2a7e-3a59-4c1b-9d2e-6b9f4d1e2a10'), true);
  assert.deepEqual(f.calls.map(c => c[0]), ['hum_run_save', 'hum_run_list', 'hum_run_get', 'hum_run_delete']);
  assert.deepEqual(f.calls[0][1], CONTRACT.commands.hum_run_save.request);
  assert.deepEqual(f.calls[1][1], CONTRACT.commands.hum_run_list.request);
  assert.deepEqual(f.calls[2][1], CONTRACT.commands.hum_run_get.request);
  assert.deepEqual(f.calls[3][1], CONTRACT.commands.hum_run_delete.request);
});

test('store maps Rust error strings to coded errors', async () => {
  const store = createHumRunStore({ invoke: fakeInvoke({ hum_run_save: 'HUMRUN_INVALID: kind must be one of hum, feedback' }).invoke });
  await assert.rejects(store.save({}), e => e instanceof HumRunError && e.code === 'HUMRUN_INVALID');
  assert.equal(toHumRunError(new Error('boom')).code, 'HUMRUN_ERROR');
});

test('store browser fallback keeps the Rust shapes in localStorage', async () => {
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  let n = 0;
  const store = createHumRunStore({ invoke: null, storage, now: () => `2026-10-10T20:00:0${n}.000Z`, newId: () => `id-${++n}` });
  assert.equal(store.native, false);
  const saved = await store.save(CONTRACT.commands.hum_run_save.request.input);
  const expect = { ...CONTRACT.commands.hum_run_save.response, id: 'id-1', createdAt: '2026-10-10T20:00:01.000Z' };
  assert.deepEqual(saved, expect);
  await store.save({ ...CONTRACT.commands.hum_run_save_feedback.request.input, venueId: 'venue-2' });
  const list = await store.list({ venueId: 'venue-1' });
  assert.deepEqual(Object.keys(list[0]), Object.keys(CONTRACT.commands.hum_run_list.response[0]));
  assert.equal(list.length, 1);
  assert.equal((await store.list({ kind: 'feedback' }))[0].onset, true);
  assert.equal((await store.list()).length, 2);
  assert.deepEqual(await store.get('id-1'), expect);
  assert.equal(await store.get('nope'), null);
  assert.equal(await store.delete('id-1'), true);
  assert.equal(await store.delete('id-1'), false);
  assert.ok(mem.has(STORAGE_KEY));
  await assert.rejects(store.save({ kind: 'x', steps: [] }), e => e.code === 'HUMRUN_INVALID');
  mem.set(STORAGE_KEY, 'not json');
  assert.deepEqual(await store.list(), []);
});
