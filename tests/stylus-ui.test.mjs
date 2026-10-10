import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const { ringGeometry, summaryLine, railBadgeLevel, benchmarkFromRuns, chartModel, monthOf, fmtHours, loadThresholds } = await import('../app/ui/screens/stylus.js');
const { regress, normalizeBenchmark, METRICS } = await import('../app/stylus-wear.js');

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('ringGeometry: arc fills proportionally, stops at 100 %, flags use past rated life', () => {
  const g = ringGeometry(25, 50);
  near(g.circumference, 2 * Math.PI * 50);
  near(g.dash, g.circumference / 4);
  near(g.dash + g.gap, g.circumference);
  assert.equal(ringGeometry(100).over, false);
  const over = ringGeometry(140);
  near(over.dash, over.circumference);
  assert.equal(over.over, true);
  assert.equal(ringGeometry(-5).dash, 0);
  assert.equal(ringGeometry(NaN).dash, 0);
});

test('summaryLine: the FS-12 copy and its fallbacks', () => {
  assert.equal(summaryLine({ name: 'Concorde Pro S', hours: 410, ratedHours: 600, pct: 68.3, projection: { date: '2027-03-14T00:00:00.000Z', reason: 'projected' } }),
    'Concorde Pro S: about 410 of 600 h (68 %). Replace around 2027-03 at current use.');
  assert.match(summaryLine({ name: 'X', hours: 700, ratedHours: 600, pct: 116.7, projection: { date: '2026-10-01T00:00:00.000Z', reason: 'due' } }), /Replace or inspect now/);
  assert.match(summaryLine({ name: 'X', hours: 12, ratedHours: 500, pct: 2.4, projection: { date: null, reason: 'no-recent-use' } }), /No recent use/);
  assert.equal(monthOf('not a date'), '');
  assert.equal(fmtHours(2.5), '2.5');
  assert.equal(fmtHours(410.4), '410');
});

test('railBadgeLevel: red outranks amber, snoozed alerts do not count', () => {
  assert.equal(railBadgeLevel([{ severity: 'amber' }, { severity: 'red' }]), 'red');
  assert.equal(railBadgeLevel([{ severity: 'amber' }]), 'amber');
  assert.equal(railBadgeLevel([{ severity: 'red', snoozed: true }, { severity: 'amber', snoozed: true }]), null);
  assert.equal(railBadgeLevel([{ severity: 'info' }]), null);
  assert.equal(railBadgeLevel([]), null);
  assert.equal(railBadgeLevel(undefined), null);
});

test('benchmarkFromRuns: THD is the L/R mean, newest run per metric wins, dropouts only from DVS runs', () => {
  const m = (metricId, value) => ({ metricId, value });
  const runs = [
    { id: 'new-cart', test: 'Channel & cartridge', measurements: [m('left_thd_percent', 0.4), m('right_thd_percent', 0.6)] },
    { id: 'sep', test: 'Channel separation', measurements: [m('channel_separation_db', 27.5)] },
    { id: 'dvs', test: 'DVS signal', measurements: [m('dropout_count', 2)] },
    { id: 'old-cart', test: 'Channel & cartridge', measurements: [m('left_thd_percent', 9), m('right_thd_percent', 9)] },
    { id: 'speed', test: 'Speed', measurements: [m('dropout_count', 7)] },
  ];
  const f = benchmarkFromRuns(runs);
  near(f.thdPercent, 0.5); assert.equal(f.thdRun, 'new-cart');
  assert.equal(f.separationDb, 27.5);
  assert.equal(f.tcDropouts, 2); assert.equal(f.dropoutRun, 'dvs');
  assert.deepEqual(benchmarkFromRuns([{ id: 'x', measurements: [m('left_thd_percent', 1)] }]), {}, 'one channel alone is not a THD figure');
  assert.deepEqual(benchmarkFromRuns(null), {});
  assert.deepEqual(benchmarkFromRuns([{ id: 'n', test: 'DVS signal', measurements: [{ metricId: 'dropout_count', value: NaN }] }]), {});
});

const rows = [
  { id: 'a', hoursAt: 0, valid: true, thdPercent: 0.4, separationDb: 28 },
  { id: 'b', hoursAt: 50, valid: true, thdPercent: 0.7, separationDb: 26 },
  { id: 'c', hoursAt: 100, valid: true, thdPercent: 1.0, separationDb: 24 },
  { id: 'x', hoursAt: 75, valid: false, thdPercent: 3, separationDb: 10 },
].map(r => normalizeBenchmark(r));

test('chartModel: points map into the plot box, the fit line follows the regression, invalid points are kept but flagged', () => {
  const fit = regress(rows.filter(r => r.valid).map(r => ({ x: r.hoursAt, y: r.thdPercent })));
  const m = chartModel('thdPercent', rows, { fit, baseline: 0.4 });
  assert.equal(m.pts.length, 4);
  assert.equal(m.pts.filter(p => !p.valid).length, 1);
  // x and y scales are monotone: later hours to the right, higher THD higher up (smaller cy)
  const [p0, p1, p2] = m.pts.filter(p => p.valid);
  assert.ok(p0.cx < p1.cx && p1.cx < p2.cx);
  assert.ok(p0.cy > p1.cy && p1.cy > p2.cy);
  // the line passes through the fitted values at the points' x positions
  const t = (p0.cx - m.line.x1) / (m.line.x2 - m.line.x1);
  near(m.line.y1 + t * (m.line.y2 - m.line.y1), m.sy(fit.intercept + fit.slope * 0), 1e-6);
  // THD limit = baseline + 1 point (and 2x baseline is 0.8, the lower of the two limits is the one that matters)
  assert.ok(m.limit && Math.abs(m.sy(m.limit.value) - m.limit.y) < 1e-9);
  assert.ok(m.limit.bandTop < m.limit.y || m.limit.bandBottom > m.limit.y);
});

test('chartModel: "worse = up" shades above the limit, "worse = down" shades below it', () => {
  const up = chartModel('thdPercent', rows, { baseline: 0.4 });
  assert.equal(METRICS.thdPercent.worse, 'up');
  assert.ok(up.limit.bandBottom === up.limit.y && up.limit.bandTop < up.limit.y);
  const down = chartModel('separationDb', rows, { baseline: 28 });
  assert.equal(METRICS.separationDb.worse, 'down');
  assert.ok(down.limit.bandTop === down.limit.y && down.limit.bandBottom > down.limit.y);
});

test('chartModel: no data -> null; a single point and a flat series still get a finite box', () => {
  assert.equal(chartModel('tcSnrDb', rows), null);
  const one = chartModel('thdPercent', [normalizeBenchmark({ id: 'o', hoursAt: 10, valid: true, thdPercent: 0.5 })]);
  assert.ok(one.pts.every(p => Number.isFinite(p.cx) && Number.isFinite(p.cy)));
  assert.equal(one.line, null);
  const flat = chartModel('thdPercent', [0, 10, 20].map((h, i) => normalizeBenchmark({ id: `f${i}`, hoursAt: h, valid: true, thdPercent: 0.5 })));
  assert.ok(flat.pts.every(p => Number.isFinite(p.cy)));
});

test('loadThresholds: defaults 80 / 100, stored values used only when sane', () => {
  assert.deepEqual(loadThresholds(), { amberPct: 80, redPct: 100 });
  localStorage.setItem('deckchek.stylus.thresholds.v1', JSON.stringify({ amberPct: 70, redPct: 90 }));
  assert.deepEqual(loadThresholds(), { amberPct: 70, redPct: 90 });
  localStorage.setItem('deckchek.stylus.thresholds.v1', JSON.stringify({ amberPct: 95, redPct: 90 }));
  assert.deepEqual(loadThresholds(), { amberPct: 80, redPct: 100 });
});
