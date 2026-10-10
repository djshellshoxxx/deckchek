import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  migrateLife, findLifeEntry, resolveRatedHours, replacementBaseline, hoursSinceInstall, lifeStatus,
  usageRatePerDay, projectReplaceDate, proposeFromDvsSessions, proposeFromLogs, regress, tTwoSidedP, tCritical,
  benchmarkVerdict, benchmarkBaseline, crossesLimit, projectThresholdDate, snoozeUntil, isSnoozed, stylusAlerts,
  createStylusApi, DEGRADATION,
} from '../app/stylus-wear.js';
import { totalHours, HOUR_MS } from '../app/usage-hours.js';

const T0 = Date.parse('2026-01-01T10:00:00.000Z');
const iso = h => new Date(T0 + h * HOUR_MS).toISOString();
const e = (id, startH, hours, source = 'manual', extra = {}) => ({ id, startedAt: iso(startH), hours, source, ...extra });
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const life = migrateLife(JSON.parse(readFileSync(new URL('../app/devices/stylus-life.json', import.meta.url), 'utf8')));

// ---- catalogue provenance
test('stylus-life.json: every hours figure cites a source or is marked unverified; unknown has no hours', () => {
  const raw = JSON.parse(readFileSync(new URL('../app/devices/stylus-life.json', import.meta.url), 'utf8'));
  assert.equal(raw.version, 1);
  for (const x of raw.entries) {
    assert.ok(['vendor-general', 'forum', 'retailer', 'unknown'].includes(x.confidence), x.model);
    assert.equal(x.verified, false, `${x.model}: nothing in the catalogue is verified`);
    if (x.ratedHours !== null) assert.ok(x.source || /unverified/i.test(x.notes), `${x.model}: hours need a source or an unverified note`);
    if (x.confidence === 'unknown') assert.equal(x.ratedHours, null, x.model);
    if (x.source) assert.match(x.source, /^https:\/\//);
  }
  assert.throws(() => migrateLife({ version: 1, entries: [{ model: 'X', ratedHours: 900 }] }), /no source/);
  assert.throws(() => migrateLife({ version: 2, entries: [] }), /version/);
  assert.throws(() => migrateLife({ entries: [{ model: 'X', ratedHours: -1 }] }), /ratedHours/);
});

test('rated life: asset value > catalogue > 500 fallback; Shure M44-7 is unknown so falls back', () => {
  assert.deepEqual(resolveRatedHours({ assetRatedHours: 750, catalogue: life, modelText: 'Ortofon Concorde' }).source, 'asset');
  const o = resolveRatedHours({ catalogue: life, modelText: 'Ortofon Concorde Pro S' });
  assert.equal(o.source, 'catalogue'); assert.equal(o.generic, false);
  const s = resolveRatedHours({ catalogue: life, modelText: 'Shure M44-7' });
  assert.equal(s.hours, 500); assert.equal(s.generic, true); assert.equal(s.source, 'fallback');
  assert.equal(findLifeEntry(life, 'Shure M44-7').confidence, 'unknown');
  const none = resolveRatedHours({ catalogue: life, modelText: 'Mystery brand' });
  assert.equal(none.hours, 500); assert.equal(none.generic, true);
  assert.equal(resolveRatedHours({ assetRatedHours: 0, catalogue: null, modelText: '' }).hours, 500);
});

// ---- hours (AC-1, AC-3, AC-7), shared engine
test('AC-1: manual 2.5 h raises total by 2.5', () => {
  const before = [e('a', 0, 1)];
  const after = [...before, e('b', 5, 2.5)];
  near(hoursSinceInstall(after) - hoursSinceInstall(before), 2.5);
});

test('AC-3: overlapping sources are not double counted; priority manual > djlog > deckchek', () => {
  const ledger = [e('d', 0, 2, 'deckchek'), e('l', 1, 2, 'djlog'), e('m', 2, 2, 'manual')];
  near(hoursSinceInstall(ledger), 4); // 0..4 h union
  near(totalHours(ledger), 4);
  const unconfirmed = [...ledger, e('p', 10, 1, 'djlog', { confirmed: 0 })];
  near(hoursSinceInstall(unconfirmed), 4); // proposals do not count until confirmed
});

test('AC-7: replacement resets the baseline but keeps history', () => {
  const ledger = [e('a', 0, 3), e('b', 10, 2), e('c', 20, 1)];
  const events = [{ eventType: 'stylus_replaced', eventAt: iso(9) }, { eventType: 'cleaned', eventAt: iso(15) }];
  assert.equal(replacementBaseline(events), iso(9));
  near(hoursSinceInstall(ledger, events), 3);
  near(hoursSinceInstall(ledger, []), 6);
  assert.equal(ledger.length, 3);
  const later = [...events, { event_type: 'stylus_replaced', event_at: iso(19) }];
  assert.equal(replacementBaseline(later), iso(19));
  near(hoursSinceInstall(ledger, later), 1);
  assert.equal(replacementBaseline([]), null);
  assert.equal(replacementBaseline(null), null);
});

test('AC-2: 40 min DVS session proposes 0.67 h as unconfirmed deckchek', () => {
  const s = [{ id: 's1', startedAt: '2026-10-10T20:00:00.000Z', endedAt: '2026-10-10T20:40:00.000Z' }];
  const p = proposeFromDvsSessions(s, 'asset-1');
  assert.equal(p.length, 1);
  assert.equal(p[0].source, 'deckchek'); assert.equal(p[0].confirmed, 0);
  assert.equal(Math.round(p[0].hours * 100) / 100, 0.67);
  assert.equal(p[0].sessionId, 's1');
  // already in the ledger -> not proposed again; > 12 h is capped
  assert.equal(proposeFromDvsSessions(s, 'asset-1', { existing: [{ sessionId: 's1' }] }).length, 0);
  const long = proposeFromDvsSessions([{ id: 'x', startedAt: iso(0), endedAt: iso(20) }], 'a');
  assert.equal(long[0].hours, 12); assert.equal(long[0].capped, true);
});

test('AC-3: log spans become djlog proposals without a session id; known starts are skipped', () => {
  const spans = [
    { app: 'Serato DJ Pro', start: '2026-10-10T20:00:00Z', end: '2026-10-10T22:30:00Z', source: 'log' },
    { app: 'Mixxx', start: '2026-10-11T20:00:00Z', end: '2026-10-11T20:00:20Z', source: 'log' },
  ];
  const p = proposeFromLogs(spans, 'asset-1');
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].source, p[0].hours, p[0].sessionId, p[0].confirmed, p[0].note], ['djlog', 2.5, null, 0, 'Serato DJ Pro']);
  const existing = [{ source: 'djlog', startedAt: '2026-10-10T20:00:00.000Z', hours: 2.5 }];
  assert.equal(proposeFromLogs(spans, 'asset-1', { existing }).length, 0);
  assert.deepEqual(proposeFromLogs(null, 'a'), []);
  // overlap with a manual entry resolves by priority: manual 1 h inside the 2.5 h log span -> still 2.5 h
  near(totalHours([e('m', 0, 1), { id: 'l', startedAt: '2026-01-01T10:00:00.000Z', hours: 2.5, source: 'djlog' }]), 2.5);
});

// ---- lifeStatus (AC-5)
test('AC-5: lifeStatus thresholds at 79.9 / 80 / 100 %', () => {
  assert.equal(lifeStatus(79.9, 100).status, 'ok');
  assert.equal(lifeStatus(80, 100).status, 'amber');
  assert.equal(lifeStatus(99.9, 100).status, 'amber');
  assert.equal(lifeStatus(100, 100).status, 'red');
  assert.equal(lifeStatus(479.99, 600).status, 'ok');
  assert.equal(lifeStatus(480, 600).status, 'amber');
  assert.equal(lifeStatus(600, 600).status, 'red');
  assert.equal(lifeStatus(410, 600).pctRounded, 68);
  assert.equal(lifeStatus(0, 600).status, 'ok');
  assert.equal(lifeStatus(-5, 600).hours, 0);
  assert.equal(lifeStatus(10, null).ratedHours, 500);
  assert.equal(lifeStatus(70, 100, { amberPct: 70 }).status, 'amber');
  assert.equal(lifeStatus(120, 100).label, 'Replace or inspect');
});

// ---- projection
test('projection: trailing 30-day rate; zero usage gives no date; due gives now', () => {
  const now = T0 + 100 * 24 * HOUR_MS;
  const ledger = [e('old', 0, 10)];
  const p0 = projectReplaceDate(ledger, 100, { now });
  assert.equal(p0.date, null); assert.equal(p0.reason, 'no-recent-use'); near(p0.remaining, 90);
  // 30 h in the last 30 days = 1 h/day
  const recent = [...ledger, { id: 'r', startedAt: new Date(now - 30 * 24 * HOUR_MS).toISOString(), hours: 12, source: 'manual' }, { id: 'r2', startedAt: new Date(now - 12 * 24 * HOUR_MS).toISOString(), hours: 12, source: 'manual' }, { id: 'r3', startedAt: new Date(now - 2 * 24 * HOUR_MS).toISOString(), hours: 6, source: 'manual' }];
  near(usageRatePerDay(recent, { now }), 1);
  const p = projectReplaceDate(recent, 100, { now });
  assert.equal(p.reason, 'projected');
  near(p.remaining, 60);
  assert.equal(p.date, new Date(now + 60 * 24 * HOUR_MS).toISOString());
  assert.equal(projectReplaceDate(recent, 40, { now }).reason, 'due');
  // replacement mid-window shortens the rate window to the baseline
  const ev = [{ eventType: 'stylus_replaced', eventAt: new Date(now - 10 * 24 * HOUR_MS).toISOString() }];
  near(usageRatePerDay(recent, { now, since: replacementBaseline(ev) }), 0.6);
});

// ---- regression (AC-4)
test('AC-4: regression recovers exact slope; CI and p behave; fewer than 3 points says so', () => {
  const pts = [0, 50, 100, 150, 200].map(h => ({ x: h, y: 0.5 + 0.004 * h }));
  const r = regress(pts);
  assert.ok(r.enough);
  near(r.slope, 0.004, 1e-12); near(r.intercept, 0.5, 1e-9); near(r.slopePer100h, 0.4, 1e-10); near(r.r2, 1, 1e-12);
  assert.equal(r.p, 0);
  assert.ok(r.ci95Per100h[0] <= r.slopePer100h && r.slopePer100h <= r.ci95Per100h[1]);
  assert.equal(regress(pts.slice(0, 2)).enough, false);
  assert.equal(regress(pts.slice(0, 2)).message, 'Need 3 benchmarks for a trend');
  assert.equal(regress([]).n, 0);
  assert.equal(regress([{ x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 3 }]).enough, false);
  assert.equal(regress([{ hours: 0, value: 1 }, { hours: 1, value: 2 }, { hours: 2, value: 3 }, { x: NaN, y: 1 }]).n, 3);
});

test('regression against a known textbook dataset (slope, SE, CI, p)', () => {
  // x=1..5, y=2,4,5,4,5 : slope 0.6, intercept 2.2, SSres 2.4, df 3, se = sqrt(0.8/10)=0.28284, t=2.1213, p ~ 0.1240, t95(3)=3.1824
  const r = regress([[1, 2], [2, 4], [3, 5], [4, 4], [5, 5]].map(([x, y]) => ({ x, y })));
  near(r.slope, 0.6, 1e-12); near(r.intercept, 2.2, 1e-12); near(r.r2, 0.6, 1e-12);
  near(r.se, 0.282842712, 1e-8);
  near(r.p, 0.1240, 5e-4);
  const half = 3.182446 * 0.282842712;
  near(r.ci95Per100h[0], (0.6 - half) * 100, 1e-2);
  near(tCritical(3), 3.182446, 1e-4); near(tCritical(10), 2.228139, 1e-4); near(tCritical(30), 2.042272, 1e-4);
  near(tTwoSidedP(0, 5), 1, 1e-12); near(tTwoSidedP(2.570582, 5), 0.05, 1e-4);
});

test('regression: noisy slope has a CI that contains the truth (seeded)', () => {
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5;
  const pts = Array.from({ length: 12 }, (_, i) => ({ x: i * 20, y: 40 - 0.01 * i * 20 + rnd() * 0.4 }));
  const r = regress(pts);
  assert.ok(r.ci95Per100h[0] < -1 && r.ci95Per100h[1] > -1, JSON.stringify(r.ci95Per100h));
  assert.ok(r.p < 0.001);
});

// ---- benchmark verdicts (AC-6)
const B = (hoursAt, o = {}) => ({ id: `b${hoursAt}`, hoursAt, valid: 1, thdPercent: 0.5, separationDb: 30, tcSnrDb: 30, tcPhaseErrorDeg: 5, tcDropouts: 0, createdAt: iso(hoursAt), ...o });
const clean = [B(0), B(20), B(40)];

test('boundaries: degradation limits are strict (at limit is fine, just beyond crosses)', () => {
  assert.equal(crossesLimit('thdPercent', 3, 2), false);   // +1.0 pp exactly (2x would be 4)
  assert.equal(crossesLimit('thdPercent', 3.01, 2), true);
  assert.equal(crossesLimit('thdPercent', 0.2, 0.1), false);   // exactly 2x
  assert.equal(crossesLimit('thdPercent', 0.2001, 0.1), true);
  assert.equal(crossesLimit('separationDb', 27, 30), false);   // -3.0 dB
  assert.equal(crossesLimit('separationDb', 26.99, 30), true);
  assert.equal(crossesLimit('tcSnrDb', 24, 30), false);        // -6.0
  assert.equal(crossesLimit('tcSnrDb', 23.9, 30), true);
  assert.equal(crossesLimit('tcPhaseErrorDeg', 13, 5), false); // +8
  assert.equal(crossesLimit('tcPhaseErrorDeg', 13.1, 5), true);
  assert.equal(crossesLimit('thdPercent', null, 0.5), false);
});

test('AC-6: single noisy benchmark never alerts; two consecutive crossings do', () => {
  assert.equal(benchmarkVerdict([...clean, B(60, { separationDb: 20 })]).alerts.length, 0);
  const two = benchmarkVerdict([...clean, B(60, { separationDb: 20 }), B(80, { separationDb: 21 })]);
  assert.equal(two.alerts.length, 1);
  assert.equal(two.alerts[0].metric, 'separationDb');
  assert.equal(two.alerts[0].reason, 'consecutive');
  assert.match(two.alerts[0].message, /Inspect the stylus/);
  // a recovered second point breaks the consecutive rule
  assert.equal(benchmarkVerdict([...clean, B(60, { separationDb: 20 }), B(80, { separationDb: 30 })]).alerts.length, 0);
});

test('verdict: baseline is the median of the first two valid benchmarks; invalid are excluded', () => {
  const h = [B(0, { thdPercent: 0.4 }), B(10, { thdPercent: 0.6 }), B(20, { thdPercent: 0.5 })];
  near(benchmarkBaseline(h).thdPercent, 0.5);
  const withInvalid = [B(-5, { valid: 0, thdPercent: 9 }), ...h];
  near(benchmarkBaseline(withInvalid).thdPercent, 0.5);
  // an invalid bad point alone cannot alert even twice
  const v = benchmarkVerdict([...h, B(30, { valid: 0, thdPercent: 9 }), B(40, { valid: false, thdPercent: 9 })]);
  assert.equal(v.alerts.length, 0); assert.equal(v.validCount, 3);
});

test('verdict: each metric has its own direction; snake_case rows accepted', () => {
  const rows = [B(0), B(20), B(40)];
  const bad = { thdPercent: 2.0, tcSnrDb: 10, tcPhaseErrorDeg: 20 };
  const v = benchmarkVerdict([...rows, B(60, bad), B(80, bad)]);
  assert.deepEqual(v.alerts.map(a => a.metric).sort(), ['tcPhaseErrorDeg', 'tcSnrDb', 'thdPercent']);
  const snake = [...rows, B(60, bad), B(80, bad)].map(b => ({ id: b.id, hours_at: b.hoursAt, valid: 1, thd_percent: b.thdPercent, separation_db: b.separationDb, tc_snr_db: b.tcSnrDb, tc_phase_error_deg: b.tcPhaseErrorDeg, tc_dropouts: b.tcDropouts }));
  assert.equal(benchmarkVerdict(snake).alerts.length, 3);
});

test('verdict: dropouts on a previously clean side alert after two consecutive', () => {
  const v = benchmarkVerdict([...clean, B(60, { tcDropouts: 2 }), B(80, { tcDropouts: 1 })]);
  assert.ok(v.alerts.some(a => a.metric === 'tcDropouts'));
  assert.ok(!benchmarkVerdict([...clean, B(60, { tcDropouts: 2 })]).alerts.some(a => a.metric === 'tcDropouts'));
  assert.ok(!benchmarkVerdict([B(0, { tcDropouts: 3 }), B(20, { tcDropouts: 3 }), B(40, { tcDropouts: 3 }), B(60, { tcDropouts: 4 }), B(80, { tcDropouts: 4 })]).alerts.some(a => a.metric === 'tcDropouts'));
});

test('verdict: significant worsening slope plus a crossed latest point alerts; flat noise does not', () => {
  const drift = [30, 30, 29.5, 28.5, 26.5].map((s, i) => B(i * 20, { separationDb: s }));
  const v = benchmarkVerdict(drift);
  const a = v.alerts.find(x => x.metric === 'separationDb');
  assert.ok(a && a.reason === 'trend', JSON.stringify(v.alerts));
  const noise = [30, 29.8, 30.2, 29.9, 30.1].map((s, i) => B(i * 20, { separationDb: s }));
  assert.equal(benchmarkVerdict(noise).alerts.length, 0);
  // improving trend never alerts
  const better = [0, 20, 40, 60, 80].map((h, i) => B(h, { separationDb: 30 + i * 2 }));
  assert.equal(benchmarkVerdict(better).alerts.length, 0);
});

test('verdict: big improvement flags a suspected stylus replacement', () => {
  const v = benchmarkVerdict([B(0), B(20), B(40, { separationDb: 22 }), B(60, { separationDb: 30 })]);
  assert.equal(v.replacementSuspected, true);
  assert.equal(benchmarkVerdict(clean).replacementSuspected, false);
  assert.equal(benchmarkVerdict([]).alerts.length, 0);
});

test('projectThresholdDate: line meets limit at the fitted hours, at the usage rate', () => {
  const rows = [0, 20, 40, 60].map((h, i) => B(h, { separationDb: 30 - 0.05 * h }));
  const fit = benchmarkVerdict(rows).fits.separationDb;
  const base = benchmarkBaseline(rows).separationDb; // median(30, 29) = 29.5 -> limit 26.5
  const now = T0;
  const r = projectThresholdDate(fit, 'separationDb', base, { hoursNow: 60, ratePerDay: 2, now });
  near(r.hoursAtLimit, (26.5 - 30) / -0.05, 1e-6); // 70 h
  assert.equal(r.date, new Date(now + (10 / 2) * 24 * HOUR_MS).toISOString());
  assert.equal(projectThresholdDate(fit, 'separationDb', base, { hoursNow: 60, ratePerDay: 0, now }).date, null);
  const flat = benchmarkVerdict([0, 20, 40].map(h => B(h))).fits.separationDb;
  assert.equal(projectThresholdDate(flat, 'separationDb', 30, { hoursNow: 40, ratePerDay: 1, now }).date, null);
});

// ---- alerts and snooze (AC-5, AC-8)
test('AC-8: snooze lasts 30 days and is per kind', () => {
  const now = T0;
  const until = snoozeUntil(now);
  assert.equal(until, new Date(now + 30 * 24 * HOUR_MS).toISOString());
  assert.equal(isSnoozed({ snoozedUntil: until }, now), true);
  assert.equal(isSnoozed({ snoozed_until: until }, now + 30 * 24 * HOUR_MS), false);
  assert.equal(isSnoozed({}, now), false);
  const alerts = stylusAlerts({ hours: 85, ratedHours: 100, snoozes: [{ kind: 'life', snoozedUntil: until }], now });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, 'amber'); assert.equal(alerts[0].snoozed, true);
  assert.equal(stylusAlerts({ hours: 85, ratedHours: 100, snoozes: [{ kind: 'life', snoozedUntil: until }], now: now + 31 * 24 * HOUR_MS })[0].snoozed, false);
});

test('AC-5/6: alerts combine life and benchmark regardless of hours', () => {
  const h = [...clean, B(60, { thdPercent: 3 }), B(80, { thdPercent: 3 })];
  const a = stylusAlerts({ hours: 10, ratedHours: 600, history: h });
  assert.deepEqual(a.map(x => x.kind), ['bench:thdPercent']);
  assert.equal(stylusAlerts({ hours: 600, ratedHours: 600 })[0].severity, 'red');
  assert.equal(stylusAlerts({ hours: 10, ratedHours: 600 }).length, 0);
});

// ---- bridge
test('bridge: exact command names and arguments; browser mode rejects', async () => {
  const calls = [];
  const api = createStylusApi({ invoke: async (c, a) => { calls.push([c, a]); return {}; } });
  await api.benchmarkSave({ assetId: 'a', hoursAt: 12, thdPercent: 0.4 });
  await api.benchmarkList('a');
  await api.alertSnooze('a', 'life', '2026-11-09T00:00:00.000Z');
  await api.baseline('a');
  await api.djSessionSpans();
  assert.deepEqual(calls.map(c => c[0]), ['stylus_benchmark_save', 'stylus_benchmark_list', 'stylus_alert_snooze', 'stylus_baseline', 'dj_session_spans']);
  assert.deepEqual(calls[2][1], { assetId: 'a', kind: 'life', until: '2026-11-09T00:00:00.000Z' });
  await assert.rejects(() => api.benchmarkSave({ assetId: '', hoursAt: 1 }), /assetId/);
  await assert.rejects(() => api.benchmarkSave({ assetId: 'a', hoursAt: -1 }), /hoursAt/);
  const off = createStylusApi({ invoke: null });
  assert.equal(off.native, false);
  await assert.rejects(() => off.benchmarkList('a'), /desktop app/);
});

test('DEGRADATION defaults match FS-12 §6', () => {
  assert.deepEqual({ ...DEGRADATION }, { thdPointsOverBaseline: 1, thdRatio: 2, separationDropDb: 3, snrDropDb: 6, phaseRiseDeg: 8, slopeP: 0.1 });
});
