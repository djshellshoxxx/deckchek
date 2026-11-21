import test from 'node:test';
import assert from 'node:assert/strict';
import { createSystemBridge, interpretSystemScan, summarizeFindings, systemScanCoverage, buildSystemReportHtml } from '../app/system-check.js';
import { composePrintable } from '../app/report-pdf.js';

const NOW = new Date('2026-11-21T14:00:00Z');
const payload = extra => ({ supported: true, scannedAt: NOW.toISOString(), errors: [], ...extra });
const clean = () => ({ drivers: payload({ drivers: [], asioDrivers: [] }), events: payload({ days: 14, events: [] }), logs: payload({ apps: [] }) });
const analyze = (scans, options) => {
  const findings = interpretSystemScan(scans, { now: NOW.getTime() });
  const coverage = systemScanCoverage(scans, options);
  return { findings, coverage, summary: summarizeFindings(findings, coverage) };
};

test('System Health native responses must be objects instead of silently becoming unsupported scans', async () => {
  for (const response of [null, undefined, [], false, 'incomplete']) {
    const bridge = createSystemBridge(async () => response);
    for (const method of ['scanDrivers', 'scanEvents', 'scanDjLogs']) {
      await assert.rejects(bridge[method]({}), /invalid response/);
    }
  }
});

test('System Health all-clear requires three completed scan areas and preserves benign information', () => {
  const scans = clean();
  scans.drivers.asioDrivers = [{ name: 'ASIO4ALL', dllExists: true, signatureStatus: 'Valid' }];
  const { findings, coverage, summary } = analyze(scans);
  assert.equal(summary.status, 'pass'); assert.equal(coverage.complete, true);
  assert.equal(coverage.completed, 3); assert.equal(summary.counts.ok, 3); assert.equal(summary.counts.info, 1);
  assert.deepEqual(coverage.areas.map(a => a.state), ['complete', 'complete', 'complete']);
  assert.equal(summarizeFindings(findings).status, 'pass', 'source-derived coverage survives the findings-only consumer');
});

for (const [area, key] of [['drivers', 'drivers'], ['events', 'events'], ['djLogs', 'logs']]) {
  test(`System Health incomplete ${area} collection cannot produce an area or system all-clear`, () => {
    const scans = clean(); scans[key].errors.push('A requested source could not be read.');
    const { findings, coverage, summary } = analyze(scans);
    assert.equal(summary.status, 'warn'); assert.match(summary.headline, /incomplete/i);
    assert.equal(coverage.completed, 2); assert.equal(coverage.counts.partial, 1);
    assert.ok(findings.some(f => f.area === area && f.id.endsWith('-scan-errors')));
    assert.ok(!findings.some(f => f.area === area && f.severity === 'ok'));
    assert.equal(summarizeFindings(findings).status, 'warn');
  });
}

test('System Health retains a real fault and its severity when another area is incomplete', () => {
  const scans = clean();
  scans.drivers.drivers.push({ deviceName: 'Test interface', problemCode: 43, present: true, status: 'Error' });
  scans.events.errors.push('One event source was unavailable.');
  const { findings, coverage, summary } = analyze(scans);
  assert.equal(summary.status, 'fail'); assert.equal(summary.counts.error, 1);
  assert.match(summary.headline, /1 problem/); assert.equal(coverage.counts.partial, 1);
  assert.ok(findings.some(f => f.id.endsWith('code-43') && f.severity === 'error'));
  assert.match(buildSystemReportHtml({ findings, coverage }), /2 of 3 scan areas complete/);
});

test('System Health mixed supported and unavailable areas remains incomplete', () => {
  const scans = clean(); scans.events.supported = false;
  const { findings, coverage, summary } = analyze(scans);
  assert.equal(summary.status, 'warn'); assert.equal(coverage.counts.unsupported, 1);
  assert.equal(coverage.completed, 2); assert.ok(findings.some(f => f.id === 'events-scan-unsupported'));
  assert.equal(summarizeFindings(findings).status, 'warn');
});

test('System Health all unsupported scans remain informational with no checked areas', () => {
  const scans = clean(); for (const scan of Object.values(scans)) scan.supported = false;
  const { findings, coverage, summary } = analyze(scans);
  assert.equal(findings.length, 1); assert.equal(summary.status, 'info');
  assert.equal(coverage.completed, 0); assert.equal(coverage.counts.unsupported, 3);
  assert.equal(summarizeFindings(findings).coverage.counts.unsupported, 3);
  const subset = summarizeFindings(interpretSystemScan({ drivers: scans.drivers }));
  assert.equal(subset.coverage.counts.unsupported, 1); assert.equal(subset.coverage.counts.unscanned, 2);
});

test('System Health a rejected command stays failed even when the other two scans are clean', () => {
  const scans = clean(); scans.events = null;
  const { findings, coverage, summary } = analyze(scans, { states: { events: 'error' } });
  assert.equal(summary.status, 'warn'); assert.equal(summary.counts.error, 0);
  assert.equal(coverage.counts.failed, 1); assert.equal(coverage.completed, 2);
  assert.equal(findings.some(f => f.area === 'events'), false);
  assert.match(buildSystemReportHtml({ findings, coverage }), /Windows event logs<\/th><td>Failed/);
});

test('System Health three rejected commands cannot become an empty successful scan', () => {
  const { findings, coverage, summary } = analyze({}, { states: { drivers: 'error', events: 'error', djLogs: 'error' } });
  assert.deepEqual(findings, []); assert.equal(summary.status, 'warn');
  assert.equal(coverage.counts.failed, 3); assert.equal(coverage.completed, 0);
  assert.match(summary.headline, /incomplete/); assert.doesNotMatch(summary.headline, /No problems/);
});

test('System Health distinguishes missing coverage from a pending replacement scan', () => {
  const scans = clean(); scans.events = null;
  const missing = analyze(scans);
  assert.equal(missing.coverage.counts.unscanned, 1); assert.equal(missing.summary.status, 'warn');
  const pending = analyze(scans, { states: { events: 'loading' } });
  assert.equal(pending.coverage.counts.pending, 1); assert.equal(pending.coverage.counts.unscanned, 0);
  assert.equal(pending.summary.status, 'warn'); assert.equal(pending.coverage.completed, 2);
});

test('System Health incomplete response shape cannot certify collection completion', () => {
  for (const replacement of [
    { ...clean().events, events: undefined },
    { ...clean().events, errors: undefined },
    { ...clean().events, supported: 'yes' },
  ]) {
    const scans = clean(); scans.events = replacement;
    const { findings, coverage, summary } = analyze(scans);
    assert.equal(coverage.completed, 2); assert.equal(summary.status, 'warn');
    assert.ok(!findings.some(f => f.area === 'events' && f.severity === 'ok'));
  }
});

test('System Health driver-only setup explicitly declares its narrower scan coverage', () => {
  const scans = { drivers: clean().drivers };
  const { findings, coverage, summary } = analyze(scans, { areas: ['drivers'] });
  assert.equal(coverage.total, 1); assert.equal(coverage.completed, 1); assert.equal(summary.status, 'pass');
  assert.doesNotMatch(summary.headline, /event-log|DJ-software/);
  assert.equal(summarizeFindings(findings).status, 'warn', 'a driver-only result does not establish full System Health');
  scans.drivers.errors.push('Driver enumeration was partial.');
  assert.equal(analyze(scans, { areas: ['drivers'] }).summary.status, 'warn');
});

test('System Health serialized findings preserve coverage instead of relying on ok and info counts', () => {
  const full = analyze(clean());
  assert.equal(summarizeFindings(JSON.parse(JSON.stringify(full.findings))).status, 'pass');
  assert.equal(summarizeFindings([{ severity: 'ok' }, { severity: 'info' }]).status, 'warn');
  const scans = clean(); scans.logs.errors.push('Log enumeration was partial.');
  const partial = analyze(scans);
  assert.equal(summarizeFindings(JSON.parse(JSON.stringify(partial.findings))).status, 'warn');
});

test('System Health HTML and real PDF composition retain the same missing area and recompute stale summaries', () => {
  const scans = clean(); scans.events = null;
  const { findings, coverage } = analyze(scans, { states: { events: 'error' } });
  const args = { findings, coverage, generatedAt: NOW.toISOString(),
    summary: { status: 'pass', headline: 'Obsolete all-clear text', counts: { error: 0, warning: 0, info: 0, ok: 3 } } };
  const html = buildSystemReportHtml(args), pdf = composePrintable('systemHealth', args, { now: NOW });
  for (const output of [html, pdf.html]) {
    assert.match(output, /System Health scan is incomplete/);
    assert.match(output, /2 of 3 scan areas complete; 1 failed/);
    assert.match(output, /Windows event logs<\/th><td>Failed/);
    assert.doesNotMatch(output, /Obsolete all-clear text/);
  }
  assert.match(pdf.html, /<dt>Scan coverage<\/dt>/);
});
