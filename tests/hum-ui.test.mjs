import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const fb = await import('../app/ui/workflows/feedback.js');
const hum = await import('../app/ui/workflows/hum.js');
const { stepPlan } = await import('../app/feedback.js');
const { stepResult } = await import('../app/hum-tree.js');

const harm = db => [{ n: 1, hz: 50, dbfs: db }, { n: 2, hz: 100, dbfs: db - 6 }];
const meas = (id, total, floor = -100) => stepResult(id, { mainsHz: 50, fundamentalDbfs: total, harmonics: harm(total), totalDbfs: total, floorDbfs: floor, humToFloorDb: total - floor, oddEvenRatio: 1 });

test('fmtDbfs and fmtHz use a real minus sign and sensible digits', () => {
  assert.equal(fb.fmtDbfs(-57), '−57 dBFS');
  assert.equal(fb.fmtDbfs(-57.25), '−57.3 dBFS');
  assert.equal(fb.fmtDbfs(NaN), '—');
  assert.equal(fb.fmtHz(62.94), '62.9 Hz');
  assert.equal(fb.fmtHz(120.4), '120 Hz');
});

test('monoFrom picks a channel or averages both', () => {
  const block = { left: Float32Array.of(1, 0, .5), right: Float32Array.of(0, 1, .5) };
  assert.deepEqual([...fb.monoFrom(block, 'left')], [1, 0, .5]);
  assert.deepEqual([...fb.monoFrom(block, 'right')], [0, 1, .5]);
  assert.deepEqual([...fb.monoFrom(block, 'both')], [.5, .5, .5]);
});

test('levelBar: position between start and cap, never outside 0..100', () => {
  const plan = stepPlan();
  assert.equal(plan.levels.length, 11);
  const first = fb.levelBar(plan, -60);
  assert.equal(first.pct, 0); assert.equal(first.stepIndex, 0); assert.equal(first.atCap, false);
  const mid = fb.levelBar(plan, -45); assert.equal(mid.pct, 50); assert.equal(mid.stepIndex, 5);
  const top = fb.levelBar(plan, -30); assert.equal(top.pct, 100); assert.equal(top.atCap, true);
  assert.equal(fb.levelBar(plan, -10).pct, 100);
  assert.equal(fb.levelBar(plan, null).pct, 0);
  assert.equal(fb.levelBar(stepPlan({ startDbfs: -30, capDbfs: -30 }), -30).pct, 100);
});

test('planSummary: states start, step, cap, and that a cap above -12 is lowered', () => {
  const a = fb.planSummary({ startDbfs: -60, stepDb: 3, capDbfs: -30 });
  assert.match(a.text, /Starts at −60 dBFS, rises 3 dB each time you confirm, and never goes above −30 dBFS \(11 steps\)\./);
  assert.equal(a.lowered, false);
  const b = fb.planSummary({ capDbfs: -3 });
  assert.equal(b.plan.capDbfs, -12); assert.equal(b.lowered, true);
  assert.match(b.text, /lowered to the −12 dBFS hard limit/);
  assert.ok(Math.max(...b.plan.levels) <= -12);
  assert.throws(() => fb.planSummary({ stepDb: 9 }));
});

test('abortCopy: every way a run ends has words, and the automatic ones say so', () => {
  const onset = { freqHz: 62.9, stepIndex: 6, levelDbfs: -42 };
  const howl = fb.abortCopy('howl', { onset });
  assert.equal(howl.auto, true); assert.match(howl.title, /stopped automatically/); assert.match(howl.text, /62\.9 Hz on step 7 \(−42 dBFS\)/);
  for (const r of ['inputClipping', 'noInput', 'inactivity', 'outputError', 'startError']) assert.equal(fb.abortCopy(r).auto, true, r);
  assert.match(fb.abortCopy('inputClipping').text, /Lower the input gain/);
  assert.match(fb.abortCopy('inactivity').title, /60 s/);
  assert.match(fb.abortCopy('noInput', { captureLost: 'deviceLost' }).text, /deviceLost/);
  assert.match(fb.abortCopy('outputError', { error: { message: 'device gone' } }).text, /device gone.*turn down your monitors/);
  assert.equal(fb.abortCopy('user').auto, false); assert.match(fb.abortCopy('user').text, /Output is silent/);
  assert.equal(fb.abortCopy('finished').tone, 'pass');
  assert.equal(fb.abortCopy('disposed').auto, false);
});

test('spectrogramColumn: log-spaced maxima, the tone lands in the right column', () => {
  const binHz = 5.86, db = new Float64Array(2048).fill(-120);
  db[Math.round(63 / binHz)] = -30;
  const col = fb.spectrogramColumn({ binHz, db }, [20, 400], 60);
  assert.equal(col.length, 60);
  const peak = col.indexOf(Math.max(...col));
  const hz = 20 * (400 / 20) ** ((peak + .5) / 60);
  assert.ok(Math.abs(hz - 63) < 8, `peak column centred at ${hz} Hz`);
});

test('timelineModel: one row per step, deltas against the reference, skipped and pending states', () => {
  const rows = hum.timelineModel([
    meas('mixer_alone', -80, -100), stepResult('gain_zero', null, { skipped: true }), meas('deck_cables', -50), meas('tt_ground', -72),
  ], { currentIdx: 4 });
  assert.equal(rows.length, 8);
  assert.equal(rows[0].state, 'measured'); assert.equal(rows[0].deltaDb, null);
  assert.equal(rows[1].state, 'skipped');
  assert.equal(rows[2].deltaClass, 'rise'); assert.ok(Math.abs(rows[2].deltaDb - 30) < 1e-9);
  assert.equal(rows[3].deltaClass, 'drop'); assert.ok(Math.abs(rows[3].deltaDb + 22) < 1e-9); assert.match(rows[3].message, /downstream of this connection/);
  assert.equal(rows[4].state, 'pending'); assert.equal(rows[4].current, true);
  assert.ok(rows.filter(r => r.state === 'measured').every(r => r.pct >= 2 && r.pct <= 100));
  assert.ok(rows[2].pct > rows[3].pct && rows[3].pct > rows[0].pct, 'louder hum draws a longer bar');
  assert.equal(hum.timelineModel([]).every(r => r.state === 'pending'), true);
});

test('deltaChip: words and numbers, never colour alone', () => {
  const rows = hum.timelineModel([meas('mixer_alone', -80), meas('deck_cables', -50), meas('tt_ground', -72)]);
  assert.deepEqual(hum.deltaChip(rows[0]), null);
  assert.deepEqual(hum.deltaChip(rows[2]), { status: 'warn', text: '+30.0 dB · rise' });
  assert.deepEqual(hum.deltaChip(rows[3]), { status: 'pass', text: '−22.0 dB · drop' });
  assert.equal(hum.deltaChip({ state: 'pending' }), null);
});

test('qualityProblem: unusable measurements are explained, good ones pass', () => {
  assert.match(hum.qualityProblem({ status: 'noSignal' }), /No input signal/);
  assert.match(hum.qualityProblem({ status: 'clipping' }), /Lower the input gain/);
  assert.match(hum.qualityProblem({ status: 'short' }), /5 seconds/);
  assert.equal(hum.qualityProblem({ status: 'ok' }), null);
});

test('liveRows: harmonics 2-6 plus both families when the mains frequency is unclear', () => {
  const fam = (hz, h2) => ({ mainsHz: hz, fundamentalDbfs: -50, totalDbfs: -48, humToFloorDb: 30, displayHarmonics: [{ n: 2, hz: hz * 2, dbfs: h2 }] });
  const clear = hum.liveRows({ ...fam(50, -60), mainsIndeterminate: false });
  assert.equal(clear.alternate, null); assert.equal(clear.primary.harmonics.length, 1);
  const vague = hum.liveRows({ ...fam(50, -60), mainsIndeterminate: true, alternate: fam(60, -62) });
  assert.equal(vague.alternate.mainsHz, 60); assert.equal(vague.indeterminate, true);
  assert.equal(hum.liveRows(null), null);
});

test('meterPct and the dB formatters', () => {
  assert.equal(hum.meterPct(30), 50); assert.equal(hum.meterPct(-5), 0); assert.equal(hum.meterPct(90), 100); assert.equal(hum.meterPct(NaN), 0);
  assert.equal(hum.fmtSigned(-22), '−22.0 dB'); assert.equal(hum.fmtSigned(3.14), '+3.1 dB'); assert.equal(hum.fmtDb(NaN), '—');
});
