// FS-21 phase 2 (JS side): metric whitelist shared with Rust, anonymous export selection, the PII leak test seeded with
// private values, the pack bridge, and the pure helpers of the Compare screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPack, validatePack, createPackStore, createMetricRegistry, exportRowsFromUnitValues } from '../app/pack.js';
import { createPackApi, exportRow, CONTRIBUTOR_KEY } from '../app/pack-api.js';

globalThis.localStorage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const { indexUnits, specFor, specSentence } = await import('../app/ui/screens/compare.js');
const { compareToSpec } = await import('../app/population.js');

const table = JSON.parse(fs.readFileSync(new URL('../app/population-metrics.json', import.meta.url), 'utf8'));
const registry = createMetricRegistry(table);
const PII = ['SN-998877', "Sam's Deck", 'C:\\Users\\sam\\gig.wav', 'booth-pc.local', 'Club Neon', 'sam@example.com', 'asset-uuid-1234', 'session-uuid-5678'];

test('the shipped metric whitelist is well formed and every entry validates a pack row', () => {
  assert.ok(Object.keys(table.metrics).length >= 10);
  for (const [metric, def] of Object.entries(table.metrics)) {
    assert.match(metric, /^[a-z0-9._:-]{1,64}$/, metric);
    assert.ok(def.unit && def.plausible.length === 2 && def.plausible[0] <= def.plausible[1], metric);
    assert.ok([true, false, null].includes(def.higherIsBetter), metric);
    assert.ok(Array.isArray(def.specKeys), metric);
    if (def.specKeys.length) assert.ok(def.specLimit === 'max' || def.specLimit === 'min', `${metric} needs a spec direction`);
    const mid = (def.plausible[0] + def.plausible[1]) / 2;
    const pack = buildPack({ rows: [{ product: 'p', metric, method: { key: metric, version: 1 }, value: mid, unit: def.unit }], appVersion: '0.0.8', packId: 'pk', contributor: 'ct', createdMonth: '2026-10' }, { metricRegistry: registry });
    assert.equal(validatePack(pack, { metricRegistry: registry }).ok, true, metric);
  }
});

test('the registry refuses unknown metrics, wrong units, out-of-range values and tolerates colons in product keys', () => {
  const row = { product: 'vendor:model-1', metric: 'channel_separation_db', method: { key: 'channel_separation_db', version: 1 }, value: 31.5, unit: 'dB' };
  const pack = rows => ({ format: 'deckchek-pack', version: 1, packId: 'pk', createdMonth: '2026-10', appVersion: '0.0.8', contributor: 'ct', rows });
  assert.equal(validatePack(pack([row]), { metricRegistry: registry }).ok, true);
  for (const bad of [{ ...row, metric: 'serial_number' }, { ...row, unit: 'dBFS' }, { ...row, value: 121 }, { ...row, value: -0.5 }, { ...row, metric: '__proto__' }, { ...row, metric: 'constructor' }]) {
    assert.equal(validatePack(pack([bad]), { metricRegistry: registry }).ok, false, JSON.stringify(bad));
  }
});

test('AC-4 leak test: private values seeded in every place a source record might carry them never reach the pack', () => {
  const source = {
    product: 'pioneer-plx-crss12', metric: 'wow_flutter_rms_percent', method: { key: 'wow_flutter_rms_percent', version: 1, note: PII[1] }, value: 0.12345, unit: '%',
    serial: PII[0], nickname: PII[1], path: PII[2], hostname: PII[3], venue: PII[4], email: PII[5], assetId: PII[6], sessionId: PII[7], notes: `free text ${PII[1]}`, createdAt: '2026-10-15T10:00:00Z',
  };
  const pack = buildPack({ rows: [source], appVersion: '0.0.8', packId: 'pack-leak', contributor: 'random-token', createdMonth: '2026-10' }, { metricRegistry: registry });
  const text = JSON.stringify(pack);
  for (const secret of PII) assert.equal(text.includes(secret), false, `${secret} leaked`);
  for (const field of ['serial', 'nickname', 'path', 'hostname', 'venue', 'email', 'assetId', 'sessionId', 'notes', 'createdAt', 'note']) assert.equal(text.includes(`"${field}"`), false, field);
  assert.deepEqual(Object.keys(pack).sort(), ['appVersion', 'contributor', 'createdMonth', 'format', 'packId', 'rows', 'version']);
  assert.match(pack.createdMonth, /^\d{4}-\d{2}$/, 'no day, no time');
  assert.deepEqual(Object.keys(pack.rows[0]).sort(), ['method', 'metric', 'product', 'unit', 'value']);
  assert.equal(pack.rows[0].value, 0.123, 'three significant figures');
});

test('AC-4 leak test: the whole selection pipeline from local unit values to the native request', () => {
  const unitValues = [
    { assetId: PII[6], nickname: PII[1], productKey: 'pioneer-plx-crss12', metric: 'wow_flutter_rms_percent', methodKey: 'wow_flutter_rms_percent', methodVersion: 1, unit: '%', value: 0.12, at: '2026-10-15T10:00:00Z', serial: PII[0], path: PII[2] },
    { assetId: 'a-2', nickname: PII[4], productKey: 'pioneer-plx-crss12', metric: 'wow_flutter_rms_percent', methodKey: 'wow_flutter_rms_percent', methodVersion: 1, unit: '%', value: 0.18, at: '2026-10-10T10:00:00Z', hostname: PII[3] },
  ];
  const { rows } = exportRowsFromUnitValues(unitValues, table);
  assert.equal(rows.length, 1, 'two units of one model are one voice');
  assert.equal(rows[0].value, 0.15, 'the median of the units');
  assert.equal(rows[0].units, 2, 'the count stays local');
  const wire = rows.map(exportRow);
  assert.deepEqual(Object.keys(wire[0]).sort(), ['method', 'metric', 'product', 'unit', 'value']);
  for (const secret of PII) assert.equal(JSON.stringify(wire).includes(secret), false, secret);
  for (const secret of PII) assert.equal(JSON.stringify(rows).includes(secret), false, `${secret} survives even in the local cell`);
});

test('a private value used as an identifier is refused by the charset rule', () => {
  for (const product of [PII[1], PII[2], PII[4], PII[5], 'Pioneer PLX']) {
    assert.throws(() => buildPack({ rows: [{ product, metric: 'dropout_count', method: { key: 'dropout_count', version: 1 }, value: 1, unit: 'regions' }], appVersion: '0.0.8', packId: 'pk', contributor: 'ct', createdMonth: '2026-10' }, { metricRegistry: registry }), /invalid identifier/, product);
  }
});

test('export cells: latest value per unit, median per model, skipped reasons, deterministic order', () => {
  const v = (assetId, metric, value, at, extra = {}) => ({ assetId, nickname: assetId, productKey: 'plx', metric, methodKey: metric, methodVersion: 1, unit: table.metrics[metric]?.unit ?? 'x', value, at, ...extra });
  const input = [
    v('a', 'wow_flutter_rms_percent', 0.30, '2026-10-01'), v('a', 'wow_flutter_rms_percent', 0.10, '2026-10-09'), v('b', 'wow_flutter_rms_percent', 0.20, '2026-10-05'), v('c', 'wow_flutter_rms_percent', 0.40, '2026-10-05'),
    v('a', 'channel_separation_db', 30, '2026-10-09'), v('a', 'dropout_count', 2, '2026-10-09', { unit: 'dB' }), v('a', 'serial_number', 5, '2026-10-09'), v('a', 'left_hum_dbfs', 5, '2026-10-09'), v('a', 'left_thd_percent', NaN, '2026-10-09'),
    v('a', 'wow_flutter_rms_percent', 0.5, '2026-10-09', { methodVersion: 2 }),
  ];
  const out = exportRowsFromUnitValues(input, table);
  assert.deepEqual(out.rows.map(r => [r.metric, r.method.version, r.value, r.units]), [['channel_separation_db', 1, 30, 1], ['wow_flutter_rms_percent', 1, 0.2, 3], ['wow_flutter_rms_percent', 2, 0.5, 1]]);
  assert.deepEqual(out.skipped.map(s => s.reason).sort(), ['metric is not shareable', 'unit differs from the metric definition', 'value is outside the plausible range', 'value is outside the plausible range'].sort());
  assert.deepEqual(exportRowsFromUnitValues(input, table), out, 'same input twice');
  assert.deepEqual(exportRowsFromUnitValues(input.slice().reverse(), table), out, 'any input order');
  assert.deepEqual(exportRowsFromUnitValues([], table), { rows: [], skipped: [] });
  assert.deepEqual(exportRowsFromUnitValues(null, null), { rows: [], skipped: [] });
});

test('AC-8 memory store with the real whitelist is idempotent and a second pack cannot double count an observation', () => {
  const store = createPackStore({ metricRegistry: registry });
  const rows = [{ product: 'plx', metric: 'wow_flutter_rms_percent', method: { key: 'wow_flutter_rms_percent', version: 1 }, value: 0.15, unit: '%' }];
  const pack = buildPack({ rows, appVersion: '0.0.8', packId: 'one', contributor: 'shop', createdMonth: '2026-10' }, { metricRegistry: registry });
  assert.deepEqual(store.import(pack), { packId: 'one', accepted: 1, duplicate: false });
  assert.deepEqual(store.import(pack), { packId: 'one', accepted: 0, duplicate: true });
  const again = buildPack({ rows, appVersion: '0.0.8', packId: 'two', contributor: 'shop', createdMonth: '2026-11' }, { metricRegistry: registry });
  assert.equal(store.import(again).accepted, 0);
  assert.equal(store.query({ product: 'plx', metric: 'wow_flutter_rms_percent', methodKey: 'wow_flutter_rms_percent' }).rows.length, 1);
  store.remove('one'); store.remove('two');
  assert.equal(store.query({ product: 'plx', metric: 'wow_flutter_rms_percent', methodKey: 'wow_flutter_rms_percent' }).rows.length, 0, 'AC-9 rows disappear with their packs');
});

test('pack bridge: browser mode rejects, contributor token is stored and resettable, save sends whitelisted rows only', async () => {
  const none = createPackApi({ api: null, appState: stateStub() });
  assert.equal(none.native, false);
  await assert.rejects(() => none.list(), /desktop app/);
  await assert.rejects(() => none.unitValues(), /desktop app/);
  await assert.rejects(() => none.savePack([{}]), /save dialog/);

  const calls = [];
  const state = stateStub();
  const api = createPackApi({
    api: { core: { invoke: async (cmd, args) => { calls.push([cmd, args]); return cmd === 'pack_export' ? { packId: args.selection.packId, rows: args.selection.rows.length, bytes: 1, sha256: 'x', path: args.path } : []; } },
      dialog: { save: async () => '/tmp/x.deckchek-pack', open: async () => ['/tmp/in.deckchek-pack'] } },
    appState: state, fetchJson: async () => table,
  });
  const token = await api.contributor();
  assert.match(token, /^[a-z0-9._:-]{8,64}$/);
  assert.equal(await api.contributor(), token, 'stable between calls');
  const fresh = await api.contributor({ reset: true });
  assert.notEqual(fresh, token);
  assert.equal(state.data.get(CONTRIBUTOR_KEY), fresh);
  state.data.set(CONTRIBUTOR_KEY, 'Not A Token!');
  assert.notEqual(await api.contributor(), 'Not A Token!', 'a malformed stored token is replaced');

  const cell = { product: 'plx', metric: 'wow_flutter_rms_percent', method: { key: 'wow_flutter_rms_percent', version: 1 }, value: 0.15, unit: '%', units: 4, nickname: PII[1] };
  const preview = await api.buildPreview([cell], { appVersion: '0.0.8' });
  assert.deepEqual(Object.keys(preview.rows[0]).sort(), ['method', 'metric', 'product', 'unit', 'value']);
  assert.equal(JSON.stringify(preview).includes(PII[1]), false);
  const saved = await api.savePack([cell], { packId: preview.packId, createdMonth: preview.createdMonth, contributor: preview.contributor });
  const [cmd, args] = calls.at(-1);
  assert.equal(cmd, 'pack_export');
  assert.deepEqual(Object.keys(args.selection.rows[0]).sort(), ['method', 'metric', 'product', 'unit', 'value']);
  assert.deepEqual(Object.keys(args.selection).sort(), ['contributor', 'createdMonth', 'packId', 'rows']);
  assert.equal(saved.rows, 1);
  assert.equal(await api.pickPack(), '/tmp/in.deckchek-pack');
  await api.import('/tmp/in.deckchek-pack', 'Shop');
  assert.deepEqual(calls.at(-1), ['pack_import', { path: '/tmp/in.deckchek-pack', sourceLabel: 'Shop' }]);
  await api.query('plx', 'm', 'k');
  assert.deepEqual(calls.at(-1), ['population_query', { productId: 'plx', metricId: 'm', methodKey: 'k' }]);
  await assert.rejects(() => createPackApi({ api: { core: { invoke: async () => [] }, dialog: { save: async () => null } }, appState: stateStub(), fetchJson: async () => table }).savePack([cell]).then(r => { assert.deepEqual(r, { cancelled: true }); throw new Error('cancelled'); }), /cancelled/);
});

// Exact binary ties (a median of two half-dB readings, an integer count of 1005) are where two rounding rules disagree.
// Shared with the Rust regression test `regression_round_sig3_ties_match_the_js_preview` in src-tauri/src/pack.rs.
const TIES = [[31.25, 31.3], [1.125, 1.13], [-62.25, -62.3], [100.5, 101], [1005, 1010], [10.25, 10.3], [12.25, 12.3]];
const TIE_METRIC = { 31.25: 'channel_separation_db', 1.125: 'wow_flutter_rms_percent', '-62.25': 'left_hum_dbfs', 100.5: 'dropout_count', 1005: 'dropout_count', 10.25: 'channel_separation_db', 12.25: 'channel_separation_db' };

test('regression: FS-21 the saved pack carries exactly the rows the preview showed, even on exact rounding ties', async () => {
  const calls = [];
  const api = createPackApi({
    api: { core: { invoke: async (cmd, args) => { calls.push([cmd, args]); return { packId: args.selection.packId, rows: args.selection.rows.length, bytes: 1, sha256: 'x', path: args.path }; } },
      dialog: { save: async () => '/tmp/x.deckchek-pack' } },
    appState: stateStub(), fetchJson: async () => table,
  });
  const cells = TIES.map(([raw]) => { const metric = TIE_METRIC[raw]; return { product: 'plx', metric, method: { key: metric, version: 1 }, value: raw, unit: table.metrics[metric].unit, units: 2 }; });
  const preview = await api.buildPreview(cells, { appVersion: '0.0.8' });
  assert.deepEqual(preview.rows.map(r => r.value), TIES.map(([, want]) => want), 'preview rounds half away from zero (toPrecision)');
  await api.savePack(cells, { packId: preview.packId, createdMonth: preview.createdMonth, contributor: preview.contributor });
  const [, args] = calls.at(-1);
  assert.deepEqual(args.selection.rows, preview.rows, 'Rust receives the previewed rows, already rounded');
  // Rust round_sig3 is idempotent on these (asserted in the Rust test), so the written file equals the preview.
  assert.deepEqual({ ...preview, appVersion: undefined }, { format: 'deckchek-pack', version: 1, packId: args.selection.packId, createdMonth: args.selection.createdMonth, appVersion: undefined, contributor: args.selection.contributor, rows: args.selection.rows });
});

function stateStub() {
  const data = new Map();
  return { data, get: async k => (data.has(k) ? { value: data.get(k) } : null), set: async (k, v) => { data.set(k, v); } };
}

test('compare screen helpers: unit index, spec lookup and the spec sentence', () => {
  const rows = [
    { assetId: 'b', nickname: 'Deck 2', productKey: 'plx', metric: 'wow_flutter_rms_percent' }, { assetId: 'a', nickname: 'Deck 1', productKey: 'plx', metric: 'wow_flutter_rms_percent' },
    { assetId: 'a', nickname: 'Deck 1', productKey: 'plx', metric: 'channel_separation_db' },
  ];
  const idx = indexUnits(rows);
  assert.deepEqual([...idx.keys()].sort(), ['a', 'b']);
  assert.deepEqual([...idx.get('a').metrics].sort(), ['channel_separation_db', 'wow_flutter_rms_percent']);
  assert.equal(indexUnits(null).size, 0);
  const profile = { specs: [{ key: 'snr', value: 65 }, { key: 'wow_flutter', value: 0.15, unit: '% WRMS' }] };
  assert.equal(specFor(profile, table.metrics.wow_flutter_rms_percent).value, 0.15);
  assert.equal(specFor(profile, table.metrics.dropout_count), null);
  assert.equal(specFor(null, table.metrics.wow_flutter_rms_percent), null);
  const inside = compareToSpec({ value: 0.12, unit: '%' }, profile.specs[1], { limit: 'max' });
  assert.equal(specSentence(inside, 'Wow and flutter'), 'Wow and flutter: 0.12 % against a published maximum of 0.15 %. Inside the limit with 0.03 % to spare.');
  const outside = compareToSpec({ value: 0.2, unit: '%' }, profile.specs[1], { limit: 'max' });
  assert.match(specSentence(outside, 'Wow and flutter'), /Outside the limit by 0\.05 %\.$/);
  assert.equal(specSentence(compareToSpec({ value: 1, unit: '%' }, null, { limit: 'max' }), 'x'), 'No published spec for this metric.');
});
