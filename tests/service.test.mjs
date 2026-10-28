// FS-22 service worksheets: pure engine (app/service.js), the job-sheet printable kind and the IPC bridge.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUSES, STATUS_LABELS, canTransition, nextStatuses, isReadOnly, effectiveLog, jobTotals, latestPerMetric, compareBeforeAfter,
  testStatusChanges, comparisonCompleteness, buildComparison, directionHints, stepperState, stepIndex, newUnitNickname,
  nicknameMentionsCustomer, listPrefsForSettings, jobSheetModel, renderJobSheetHtml, jobSheetPrintData, deleteConfirmed, isJobNumber,
  SHEET_DISCLAIMER,
} from '../app/service.js';
import { jobSheetPrintable, ensureJobSheetKind, JOB_SHEET_KIND } from '../app/report-kinds/jobsheet.js';
import { createServiceApi, onJobStatusChanged, STATUS_EVENT } from '../app/service-api.js';

const ALLOWED = new Set([
  'intake>diagnosing', 'intake>cancelled', 'diagnosing>awaiting_parts', 'diagnosing>repairing', 'diagnosing>ready', 'diagnosing>cancelled',
  'awaiting_parts>repairing', 'awaiting_parts>cancelled', 'repairing>testing', 'repairing>awaiting_parts', 'testing>ready', 'testing>repairing', 'ready>collected',
]);

test('AC-6 transition table is exhaustive (valid and invalid) and matches the Rust table', () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      assert.equal(canTransition(from, to), ALLOWED.has(`${from}>${to}`), `${from} -> ${to}`);
      assert.equal(canTransition(from, to, { reopen: true }), ['collected', 'cancelled'].includes(from) && to === 'diagnosing', `reopen ${from} -> ${to}`);
    }
  }
  assert.equal(canTransition('intake', 'bogus'), false);
  assert.equal(canTransition('bogus', 'intake'), false);
  assert.deepEqual(nextStatuses('collected'), []);
  assert.deepEqual(nextStatuses('cancelled', { reopen: true }), ['diagnosing']);
  assert.ok(isReadOnly('cancelled') && isReadOnly('collected') && !isReadOnly('ready'));
  assert.deepEqual(Object.values(STATUS_LABELS), ['Intake', 'Diagnosing', 'Awaiting parts', 'Repairing', 'Testing', 'Ready', 'Collected', 'Cancelled']);
});

test('AC-7 delete needs the exact job number; job numbers have the J-<year>-<seq> shape', () => {
  const job = { jobNumber: 'J-2026-0001' };
  assert.equal(deleteConfirmed(job, 'J-2026-0001'), true);
  assert.equal(deleteConfirmed(job, '  J-2026-0001 '), true);
  assert.equal(deleteConfirmed(job, 'j-2026-0001'), false);
  assert.equal(deleteConfirmed(job, ''), false);
  assert.equal(deleteConfirmed({}, ''), false);
  assert.ok(isJobNumber('J-2026-0001') && isJobNumber('J-2027-10000'));
  assert.ok(!isJobNumber('J-26-1') && !isJobNumber('X-2026-0001'));
});

const L = (id, kind, extra = {}) => ({ id, kind, description: id, at: `2026-10-10T10:00:${String(id.length).padStart(2, '0')}.000Z`, ...extra });

test('AC-3 totals are informational: labour hours and parts cost with amendments superseding originals', () => {
  const log = [
    L('p1', 'part', { quantity: 2, unitCost: 12.5 }),
    L('p2', 'part', { quantity: 1 }), // unpriced
    L('l1', 'labour', { minutes: 30 }),
    L('l2', 'labour', { minutes: 15 }),
    L('l2b', 'labour', { minutes: 45, amendsId: 'l2' }), // correction replaces 15 min
    L('n1', 'note'),
    L('n1b', 'note', { amendsId: 'n1' }),
  ];
  const t = jobTotals(log);
  assert.equal(t.labourMinutes, 75);
  assert.equal(t.labourHours, 1.25);
  assert.equal(t.partsCost, 25);
  assert.equal(t.partCount, 2);
  assert.equal(t.unpricedParts, 1);
  assert.equal(t.notes, 1);
  const eff = effectiveLog(log);
  assert.equal(eff.find(e => e.id === 'n1').superseded, true);
  assert.equal(eff.find(e => e.id === 'n1').amendedBy, 'n1b');
  assert.equal(eff.find(e => e.id === 'n1b').amendment, true);
  assert.equal(eff.length, log.length, 'append-only: originals are kept');
  assert.deepEqual(jobTotals([]), { labourMinutes: 0, labourHours: 0, partsCost: 0, partCount: 0, unpricedParts: 0, labourEntries: 0, notes: 0 });
});

const V = (metricKey, value, extra = {}) => ({ metricKey, value, unit: 'dB', uncertainty: 0.1, methodKey: metricKey, methodVersion: 1, at: '2026-10-10T10:00:00Z', ...extra });

test('AC-4 comparison: greater, lesser, equal within uncertainty, missing and incomparable metrics', () => {
  const before = [V('separation_db', 20), V('noise_db', -60), V('balance_db', 0.5), V('only_before', 1), V('ver', 1), V('units', 1)];
  const after = [V('separation_db', 25), V('noise_db', -50), V('balance_db', 0.6), V('only_after', 2), V('ver', 2, { methodVersion: 2 }), V('units', 1, { unit: '%' })];
  const rows = compareBeforeAfter(before, after, { higherIsBetter: { separation_db: true, noise_db: false } });
  const by = k => rows.find(r => r.metricKey === k);
  assert.equal(by('separation_db').status, 'improved');
  assert.equal(by('separation_db').delta, 5);
  assert.equal(by('noise_db').status, 'worse', 'lower is better and it rose by 10 dB');
  assert.equal(by('balance_db').status, 'unchanged', '|0.1| <= 2 * RSS(0.1, 0.1)');
  assert.equal(by('only_before').status, 'missingAfter');
  assert.equal(by('only_after').status, 'missingBefore');
  assert.equal(by('ver').status, 'notComparable');
  assert.match(by('ver').reason, /method versions/);
  assert.equal(by('units').status, 'notComparable');
  assert.match(by('units').reason, /Units differ/);
});

test('AC-4 combined uncertainty is root-sum-square and the verdict uses k = 2', () => {
  const [r] = compareBeforeAfter([V('x', 10, { uncertainty: 0.3 })], [V('x', 11, { uncertainty: 0.4 })], { higherIsBetter: true });
  assert.ok(Math.abs(r.uncertainty - 0.5) < 1e-12, 'sqrt(0.3^2 + 0.4^2) = 0.5');
  assert.equal(r.status, 'unchanged', '|1.0| <= 2 * 0.5');
  const [r2] = compareBeforeAfter([V('x', 10, { uncertainty: 0.3 })], [V('x', 11.01, { uncertainty: 0.4 })], { higherIsBetter: true });
  assert.equal(r2.status, 'improved');
  assert.equal(r2.assumed, false);
});

test('AC-4 unknown uncertainty defaults to 5 % of the spec span and is marked assumed', () => {
  const [r] = compareBeforeAfter([V('speed', 0.4, { uncertainty: null })], [V('speed', 0.05, { uncertainty: null })], { bands: { speed: { lo: -0.2, hi: 0.2 } } });
  assert.equal(r.assumed, true);
  assert.ok(Math.abs(r.uncertainty - Math.hypot(0.02, 0.02)) < 1e-12, '5 % of the 0.4 span on both sides');
  assert.equal(r.status, 'improved', 'no direction known: closer to the band is better');
  assert.equal(r.passChange, 'fixed');
  // no span at all: 5 % of the reading, still assumed
  const [s] = compareBeforeAfter([V('y', 100, { uncertainty: null })], [V('y', 100.5, { uncertainty: null })]);
  assert.equal(s.assumed, true);
  assert.equal(s.status, 'unchanged');
  const [c] = compareBeforeAfter([V('y', 100, { uncertainty: 0 })], [V('y', 120, { uncertainty: 0 })]);
  assert.equal(c.status, 'changed', 'significant but no direction and no band');
});

test('comparison pairs the latest valid value per phase and puts fail -> pass first', () => {
  const m = latestPerMetric([V('a', 1, { at: '2026-10-10T10:00:00Z' }), V('a', 2, { at: '2026-10-11T10:00:00Z' }), V('a', NaN, { at: '2026-10-12T10:00:00Z' }), V('a', 3, { at: '2026-10-09T10:00:00Z' })]);
  assert.equal(m.get('a').value, 2);
  const rows = compareBeforeAfter([V('a_ok', 1), V('z_fix', 5)], [V('a_ok', 1), V('z_fix', 0.1)], { bands: { z_fix: { lo: null, hi: 1 } } });
  assert.deepEqual(rows.map(r => r.metricKey), ['z_fix', 'a_ok']);
  assert.equal(rows[0].passChange, 'fixed');
});

test('test status headline: fail -> pass first, then pass -> fail', () => {
  const t = (phase, testId, status, at = '2026-10-10T10:00:00Z', title = testId) => ({ phase, testId, status, at, title });
  const out = testStatusChanges([t('before', 'b', 'pass'), t('after', 'b', 'fail'), t('before', 'a', 'fail'), t('after', 'a', 'fail', '2026-10-11T10:00:00Z'), t('after', 'a', 'pass', '2026-10-12T10:00:00Z'), t('after', 'c', 'pass')]);
  assert.deepEqual(out.map(o => [o.testId, o.change]), [['a', 'fixed'], ['b', 'regressed']]);
});

test('partial state: "Compare is incomplete, 3 of 8 metrics have no after value"', () => {
  const before = Array.from({ length: 8 }, (_, i) => V(`m${i}`, i));
  const after = before.slice(0, 5).map(v => ({ ...v }));
  const c = comparisonCompleteness(compareBeforeAfter(before, after));
  assert.equal(c.state, 'partial');
  assert.equal(c.message, 'Compare is incomplete, 3 of 8 metrics have no after value');
  assert.equal(comparisonCompleteness(compareBeforeAfter(before, before)).state, 'complete');
  assert.equal(comparisonCompleteness([]).state, 'empty');
  assert.equal(comparisonCompleteness(compareBeforeAfter([V('a', 1)], [])).message, 'Compare is incomplete, 1 of 1 metric has no after value');
});

test('buildComparison reads the job_comparison payload with its method registry (mutual compat)', () => {
  const data = {
    values: [{ ...V('k', 1, { methodVersion: 1 }), phase: 'before' }, { ...V('k', 5, { methodVersion: 2 }), phase: 'after' }],
    tests: [{ phase: 'before', testId: 't', status: 'fail', at: '2026-10-10T10:00:00Z', title: 'Balance' }, { phase: 'after', testId: 't', status: 'pass', at: '2026-10-12T10:00:00Z', title: 'Balance' }],
    methods: [{ key: 'k', version: 1, parametersJson: '{"compat":[2]}' }, { key: 'k', version: 2, parametersJson: '{"compat":[1]}' }],
  };
  const c = buildComparison(data, { higherIsBetter: { k: true } });
  assert.equal(c.rows[0].status, 'improved', 'v1 and v2 list each other as compatible');
  assert.deepEqual(c.headline.map(h => [h.kind, h.change]), [['test', 'fixed']]);
  const one = buildComparison({ ...data, methods: [data.methods[0]] });
  assert.equal(one.rows[0].status, 'notComparable', 'one-sided compat is not enough');
  assert.equal(buildComparison({}).completeness.state, 'empty');
});

test('direction hints come from the device profile pass criteria', () => {
  const h = directionHints({ tests: [{ pass: { metricId: 'wow', op: '<=', value: 0.1 } }, { pass: { metricId: 'snr', op: '>=', value: 60 } }, { pass: { metricId: 'speed', op: 'abs<=', value: 0.2 } }, { pass: { metricId: 'x', op: 'equals', value: 1 } }, { pass: null }] });
  assert.deepEqual(h.higherIsBetter, { wow: false, snr: true });
  assert.deepEqual(h.bands.speed, { lo: -0.2, hi: 0.2 });
  assert.deepEqual(h.bands.wow, { lo: null, hi: 0.1 });
  assert.equal(h.bands.x, undefined);
});

test('stepper: Intake > Before > Work > After > Sheet with done / blocked / current', () => {
  const job = { id: 'j', jobNumber: 'J-2026-0001', status: 'intake', reportedFault: 'Hum' };
  let s = stepperState({ job, results: [], log: [] });
  assert.deepEqual(s.map(x => x.id), ['intake', 'before', 'work', 'after', 'sheet']);
  assert.deepEqual(s.map(x => x.state), ['done', 'todo', 'todo', 'blocked', 'todo']);
  assert.equal(s.find(x => x.current).id, 'before');
  s = stepperState({ job: { ...job, status: 'testing' }, results: [{ phase: 'before' }, { phase: 'after' }], log: [L('n', 'note')] }, { completeness: { state: 'partial', message: 'Compare is incomplete, 1 of 2 metrics have no after value' } });
  assert.equal(s.find(x => x.id === 'after').state, 'todo', 'partial comparison keeps After open');
  assert.match(s.find(x => x.id === 'after').reason, /incomplete/);
  s = stepperState({ job: { ...job, status: 'ready' }, results: [{ phase: 'before' }, { phase: 'after' }], log: [L('n', 'note')] }, { completeness: { state: 'complete' } });
  assert.ok(s.every(x => x.state === 'done'));
  assert.equal(s.find(x => x.current).id, 'sheet');
  s = stepperState({ job: { ...job, status: 'cancelled' }, results: [], log: [] });
  assert.equal(s.find(x => x.id === 'before').state, 'blocked');
  assert.equal(stepIndex('intake', -1), 0);
  assert.equal(stepIndex('work', 1), 3);
  assert.equal(stepIndex('sheet', 1), 4);
});

test('privacy helpers: unit names never carry the customer, settings keep only the status filter', () => {
  assert.equal(newUnitNickname('SL-1200MK4', 'GH8KA001'), 'SL-1200MK4 · GH8KA001');
  assert.equal(newUnitNickname('', ''), 'Service unit');
  assert.equal(nicknameMentionsCustomer('Jo Bloggs deck', 'jo bloggs'), true);
  assert.equal(nicknameMentionsCustomer('Technics', 'Al'), false, 'very short names are not matched');
  assert.deepEqual(listPrefsForSettings({ status: 'open', q: 'Jo Bloggs', customer: 'x' }), { status: 'open' });
  assert.deepEqual(listPrefsForSettings({ status: 'nonsense' }), { status: 'all' });
});

const detail = (over = {}) => ({
  job: { id: 'j1', jobNumber: 'J-2026-0007', status: 'ready', reportedFault: 'Pitch <b>drifts</b>\n+0.4 %', accessories: ['Dust cover', '<script>x</script>'], arrivalCondition: 'Scuffed "lid"', resolution: 'Trimmer & cap', openedAt: '2026-10-10T10:00:00Z', updatedAt: '2026-10-12T10:00:00Z', closedAt: null, ...over.job },
  customer: { id: 'c', name: 'Zebedee <Pii>', phone: '+44 7700 900123', email: 'zeb@example.org' },
  asset: { id: 'a', nickname: 'SL-1200MK4', serialNumber: 'GH8KA001', profileId: 'technics-sl-1200mk4' },
  log: [L('p1', 'part', { description: 'Fader <img src=x onerror=alert(1)>', quantity: 2, unitCost: 12.5 }), L('l1', 'labour', { description: 'Clean', minutes: 45 }), L('n1', 'note', { description: 'first' }), L('n1b', 'note', { description: 'second', amendsId: 'n1' })],
  photos: [{ caption: 'Lid <scratch>', stage: 'intake' }],
  results: [], statusLog: [],
  ...over.rest,
});
const cmp = buildComparison({ values: [{ ...V('balance_db', 1.8), phase: 'before', label: 'Balance <dB>' }, { ...V('balance_db', 0.2), phase: 'after', label: 'Balance <dB>' }], tests: [] }, { higherIsBetter: { balance_db: false } });

test('AC-5 job sheet has fault, before/after table, work log, signature line and the disclaimer; no prices by default', () => {
  const html = renderJobSheetHtml(detail(), cmp, {});
  assert.match(html, /Job J-2026-0007/);
  assert.match(html, /Reported fault/);
  assert.match(html, /Before and after/);
  assert.match(html, /<caption>Measured values before and after/);
  assert.match(html, /<caption>Parts<\/caption>/);
  assert.match(html, /<caption>Labour<\/caption>/);
  assert.match(html, /Technician signature: _+/);
  assert.ok(html.includes(SHEET_DISCLAIMER));
  assert.equal(SHEET_DISCLAIMER, 'Measurements are indicative bench results, not a warranty.');
  assert.doesNotMatch(html, /Unit cost|Line total|12\.50|25\.00/, 'no prices unless Include costs is ticked');
  assert.match(html, /informational, not an invoice/);
  assert.match(html, /\(amended, see later entry\)/);
  assert.doesNotMatch(html, /Draft/);
  const costs = renderJobSheetHtml(detail(), cmp, { includeCosts: true, currency: '£' });
  assert.match(costs, /£12\.50/);
  assert.match(costs, /£25\.00/);
  assert.match(renderJobSheetHtml(detail({ job: { status: 'repairing' } }), cmp, {}), /Draft:/);
});

test('job sheet includes customer details only when "Include customer details" is ticked', () => {
  const off = renderJobSheetHtml(detail(), cmp, {});
  for (const pii of ['Zebedee', '7700 900123', 'zeb@example.org']) assert.ok(!off.includes(pii), pii);
  assert.equal(jobSheetModel(detail(), cmp, {}).customer, null);
  const on = renderJobSheetHtml(detail(), cmp, { includeCustomer: true });
  assert.ok(on.includes('Zebedee &lt;Pii&gt;') && on.includes('+44 7700 900123') && on.includes('zeb@example.org'));
});

test('every free-text value is HTML-escaped in the sheet', () => {
  const html = renderJobSheetHtml(detail(), cmp, { includeCustomer: true, includeCosts: true, currency: '<i>' });
  for (const raw of ['<b>drifts</b>', '<script>', '<img', '<Pii>', '<scratch>', '<dB>', '"lid"', '<i>']) assert.ok(!html.includes(raw), `unescaped ${raw}`);
  assert.ok(html.includes('Pitch &lt;b&gt;drifts&lt;/b&gt;<br>+0.4 %'), 'newlines become <br> after escaping');
  assert.ok(html.includes('Trimmer &amp; cap'));
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;'));
});

test('jobSheet printable kind composes through FS-03 with escaping, title and no customer in the file name', async () => {
  const mod = await ensureJobSheetKind();
  await ensureJobSheetKind(); // idempotent
  assert.ok(mod.printableKinds().includes(JOB_SHEET_KIND));
  const built = mod.composePrintable(JOB_SHEET_KIND, jobSheetPrintData(detail(), cmp, {}), { css: '', now: new Date('2026-10-12T12:00:00Z') });
  assert.equal(built.title, 'Job sheet J-2026-0007');
  assert.match(built.fileName, /JobSheet/);
  assert.ok(!built.fileName.includes('Zebedee'));
  assert.ok(!built.html.includes('Zebedee'));
  assert.match(built.html, /dc-signatures/);
  assert.doesNotMatch(built.html, /<script>x/);
  assert.equal(jobSheetPrintable.fileKind, 'JobSheet');
});

test('bridge passes exactly the Rust argument names and turns errors into messages', async () => {
  const calls = [];
  const api = createServiceApi(async (cmd, args) => { calls.push([cmd, args]); if (cmd === 'job_delete') throw 'type the job number J-2026-0001 to delete this job'; return { ok: true }; });
  await api.create({ reportedFault: 'x' });
  await api.list({ status: 'open' });
  await api.setStatus('j', 'ready', { expected: 'testing', note: 'n' });
  await api.addLog('j', 'note', { description: 'x' });
  await api.linkResults('j', 'before', { deviceTestResultIds: ['d'] });
  await api.attachPhoto('j', { bytesB64: 'AA==', stage: 'intake' });
  await api.comparison('j');
  await assert.rejects(api.remove('j', 'nope'), /type the job number/);
  assert.deepEqual(calls.map(c => c[0]), ['job_create', 'job_list', 'job_set_status', 'job_add_log', 'job_link_results', 'job_attach_photo', 'job_comparison', 'job_delete']);
  assert.deepEqual(calls[2][1], { id: 'j', to: 'ready', expected: 'testing', note: 'n', reopen: false });
  assert.deepEqual(calls[4][1], { id: 'j', phase: 'before', links: { sessionIds: [], deviceTestResultIds: ['d'] } });
  await assert.rejects(createServiceApi(null).get('j'), /desktop app/);
  const seen = [];
  let handler = null;
  const off = await onJobStatusChanged(p => seen.push(p), { event: { listen: async (name, cb) => { assert.equal(name, STATUS_EVENT); handler = cb; return () => {}; } } });
  handler({ payload: { id: 'j', from: 'testing', to: 'ready' } });
  assert.deepEqual(seen, [{ id: 'j', from: 'testing', to: 'ready' }]);
  assert.equal(typeof off, 'function');
  assert.equal(typeof (await onJobStatusChanged(() => {}, {})), 'function', 'no-op in the browser');
});
