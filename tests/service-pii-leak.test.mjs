// FS-22 §7 privacy: customer PII (name, phone, email) stays local and is excluded from every other export.
// Seeds PII values and checks the workspace export and diagnostics bundle paths (browser side; the desktop bundle is
// covered by the Rust test service::tests::customer_pii_never_reaches_the_diagnostics_bundle), plus a source scan that
// no module other than service.rs reads the customer table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { serializeWorkspaceJson } from '../app/export.js';
import { buildBrowserBundleParts } from '../app/browser-bundle.js';
import { createServiceApi } from '../app/service-api.js';
import { newUnitNickname, listPrefsForSettings, jobSheetPrintData, buildComparison } from '../app/service.js';
import { ensureJobSheetKind } from '../app/report-kinds/jobsheet.js';

const PII = { name: 'Zebedee Quixotic-Pii', phone: '+44 7700 900123', email: 'zebedee.pii@example.org' };
const NEEDLES = [PII.name, 'Zebedee', PII.phone, '900123', PII.email];
const assertNoPii = (text, where) => { for (const n of NEEDLES) assert.ok(!String(text).includes(n), `${where} leaks "${n}"`); };

/** In-memory stand-in for the Rust commands, recording what the UI sends where. */
function fakeBackend() {
  const db = { customers: [], jobs: [], assets: [] };
  const invoke = async (cmd, args) => {
    if (cmd === 'job_create') {
      const c = { id: 'c1', ...args.input.customer };
      db.customers.push(c);
      const asset = args.input.newUnit ? { id: 'a-new', nickname: args.input.newUnit.nickname, serialNumber: args.input.newUnit.serialNumber, productId: args.input.newUnit.productId } : null;
      if (asset) db.assets.push(asset);
      const job = { id: 'j1', jobNumber: 'J-2026-0001', status: 'intake', customerId: c.id, assetId: asset?.id, reportedFault: args.input.reportedFault, accessories: args.input.accessories || [], openedAt: '2026-10-10T10:00:00Z', updatedAt: '2026-10-10T10:00:00Z' };
      db.jobs.push(job);
      return job;
    }
    throw new Error(`unexpected ${cmd}`);
  };
  return { db, invoke };
}

test('PII: a job with a new unit puts no customer data into the equipment that the workspace export carries', async () => {
  const { db, invoke } = fakeBackend();
  const api = createServiceApi(invoke);
  const job = await api.create({ customer: PII, newUnit: { productId: 'p1', nickname: newUnitNickname('SL-1200MK4', 'GH8KA001'), serialNumber: 'GH8KA001' }, reportedFault: 'Pitch drifts' });
  assert.equal(db.customers[0].name, PII.name, 'the customer is stored by the service backend only');
  const run = { id: 'r1', test: 'speed', createdAt: '2026-10-10T10:00:00Z', measurements: [{ metricId: 'speed_error_pct', value: 0.4, unit: '%' }], findings: [], assetId: job.assetId };
  const json = serializeWorkspaceJson({ equipment: db.assets, runs: [run] });
  assertNoPii(json, 'workspace export');
  assert.equal(JSON.parse(json).version, 1, 'workspace JSON stays version 1');
});

test('PII: the browser diagnostics bundle (settings + runs) carries no customer data, even unredacted', async () => {
  const settings = { theme: 'dark', serviceList: listPrefsForSettings({ status: 'open', q: PII.name, customer: PII }), serviceCurrency: '£' };
  const runs = [{ id: 'r1', test: 'speed', createdAt: '2026-10-10T10:00:00Z', score: 80, measurements: [], findings: [] }];
  for (const redact of [true, false]) {
    const { files, summaryText } = await buildBrowserBundleParts({ appVersion: '0.0.7', settings, runs, runCount: 5, redact, system: { locale: 'en-GB' }, now: new Date('2026-10-12T00:00:00Z') });
    for (const f of files) assertNoPii(new TextDecoder().decode(f.data), `bundle ${f.name} (redact=${redact})`);
    assertNoPii(summaryText, 'bundle summary');
  }
});

test('PII: the printed job sheet and its suggested file name omit the customer unless asked', async () => {
  const mod = await ensureJobSheetKind();
  const detail = { job: { id: 'j1', jobNumber: 'J-2026-0001', status: 'ready', reportedFault: 'Hum', accessories: [] }, customer: { id: 'c1', ...PII }, asset: { nickname: 'SL-1200MK4' }, log: [], photos: [], results: [], statusLog: [] };
  const built = mod.composePrintable('jobSheet', jobSheetPrintData(detail, buildComparison({}), {}), { css: '' });
  assertNoPii(built.html, 'job sheet');
  assertNoPii(built.fileName, 'job sheet file name');
  const opted = mod.composePrintable('jobSheet', jobSheetPrintData(detail, buildComparison({}), { includeCustomer: true }), { css: '' });
  assert.ok(opted.html.includes(PII.name), 'printed when explicitly included');
});

test('PII: no Rust module other than service.rs reads the customer table, and no other JS module calls customer commands', () => {
  const root = new URL('..', import.meta.url).pathname;
  const rustDir = join(root, 'src-tauri/src');
  for (const f of readdirSync(rustDir).filter(n => n.endsWith('.rs') && !['service.rs', 'migration_m7_tests.rs'].includes(n))) {
    const src = readFileSync(join(rustDir, f), 'utf8');
    assert.doesNotMatch(src, /\b(FROM|JOIN|INTO)\s+customer\b/i, `${f} touches the customer table`);
  }
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? (d.name === 'vendor' ? [] : walk(join(dir, d.name))) : d.name.endsWith('.js') ? [join(dir, d.name)] : []));
  const allowed = ['service-api.js'];
  for (const f of walk(join(root, 'app'))) {
    if (allowed.some(a => f.endsWith(a))) continue;
    assert.doesNotMatch(readFileSync(f, 'utf8'), /['"](customer_list|customer_update|customer_delete|job_get)['"]/, `${f} calls a customer-bearing command directly`);
  }
});
