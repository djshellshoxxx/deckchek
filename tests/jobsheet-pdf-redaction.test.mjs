import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureJobSheetKind, JOB_SHEET_KIND } from '../app/report-kinds/jobsheet.js';
import { jobSheetPrintData, renderJobSheetHtml } from '../app/service.js';

const { composePrintable, readPdfSettings } = await ensureJobSheetKind();
const NOW = new Date('2026-11-19T12:00:00Z');
const SERIAL = 'UNIT-SERIAL-2042';
const detail = () => ({
  job: { id: 'job-7', jobNumber: 'J-2026-0007', status: 'ready', reportedFault: 'Pitch drift',
    accessories: ['Dust cover'], arrivalCondition: 'Good', resolution: 'Adjusted pitch',
    openedAt: '2026-11-18T12:00:00Z', updatedAt: '2026-11-19T12:00:00Z', closedAt: null },
  asset: { id: 'unit-7', nickname: 'Bench turntable', serialNumber: SERIAL },
  customer: { id: 'customer-7', name: 'Example Workshop', phone: '555-0107', email: 'workshop@example.test' },
  log: [{ id: 'part-7', kind: 'part', description: 'Replacement knob', quantity: 2, unitCost: 12.5, at: '2026-11-19T11:00:00Z' }],
  photos: [{ caption: 'Intake condition', stage: 'intake' }],
});
const compose = (data, options = {}) => composePrintable(JOB_SHEET_KIND, data, { now: NOW, css: '', ...options });
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test('job-sheet PDF redacts the structured serial when the shared PDF setting is enabled', () => {
  const source = freeze(detail()), before = structuredClone(source);
  const data = freeze(jobSheetPrintData(source, null));
  const normal = compose(data);
  const redacted = compose(data, readPdfSettings({ pdf: { redactSerials: true } }));
  assert.ok(normal.html.includes(SERIAL));
  assert.ok(!redacted.html.includes(SERIAL), 'the structured serial must not survive in the redacted printable');
  assert.ok(redacted.html.includes('[redacted]'));
  assert.equal(redacted.title, normal.title);
  assert.equal(redacted.device, normal.device);
  assert.equal(redacted.fileName, normal.fileName);
  assert.deepEqual(source, before);
  assert.equal(data.detail, source, 'the source record keeps its identity');
});

test('job-sheet PDF keeps explicit customer and cost choices independent of serial redaction', () => {
  const source = detail();
  const included = compose(jobSheetPrintData(source, null, { includeCustomer: true, includeCosts: true, currency: '$' }), { redactSerials: true });
  for (const value of ['Example Workshop', '555-0107', 'workshop@example.test', '$12.50', '$25.00', '[redacted]']) assert.ok(included.html.includes(value), value);
  assert.ok(!included.html.includes(SERIAL));
  const excluded = compose(jobSheetPrintData(source, null), { redactSerials: true });
  for (const value of ['Example Workshop', '555-0107', 'workshop@example.test', '12.50', '25.00']) assert.ok(!excluded.html.includes(value), value);
  assert.equal(source.asset.serialNumber, SERIAL);
});

test('default and explicitly unredacted PDF and direct HTML retain the existing serial', () => {
  const source = detail(), data = jobSheetPrintData(source, null);
  assert.equal(compose(data).html, compose(data, { redactSerials: false }).html);
  assert.ok(compose(data).html.includes(SERIAL));
  assert.ok(renderJobSheetHtml(source, null).includes(SERIAL));
  assert.ok(compose(data, { redactSerials: 'true' }).html.includes(SERIAL), 'the existing strict Boolean PDF option remains');
});

test('redaction does not invent a serial for absent assets or empty serial fields', () => {
  for (const asset of [null, undefined, { nickname: 'Bench unit' }, { nickname: 'Bench unit', serialNumber: null }, { nickname: 'Bench unit', serialNumber: '' }]) {
    const source = freeze({ ...detail(), asset });
    const built = compose(jobSheetPrintData(source, null), { redactSerials: true });
    assert.ok(!built.html.includes('[redacted]'));
    assert.ok(!built.html.includes('<th scope="row">Serial number</th>'));
  }
});
