import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS, relatedLinks, equipmentLinks, pregigCrossFixes, withCrossFixes, pickActiveAsset, stylusCardModel, isSettingsTarget, SETTINGS_TARGETS } from '../app/crosslinks.js';
import { mapHumRun, mapLatencyRun, mapScratchRun, mapWearScan, mapPregigRun, loadFeatureRuns, mergeFeed, typeCounts, RUN_TYPES } from '../app/history-feed.js';
import { pregigPrintable, pregigPrintData } from '../app/ui/workflows/pregig-report.js';
import { lifeStatus, stylusAlerts } from '../app/stylus-wear.js';

const all = () => true, none = () => false;
const only = (...flags) => f => flags.includes(f);

test('related links follow the feature flags', () => {
  assert.deepEqual(relatedLinks('quick', all).map(l => l.id), ['pregig', 'latency', 'hum']);
  assert.deepEqual(relatedLinks('dvs', all).map(l => l.id), ['scratch', 'vinylscan']);
  assert.deepEqual(relatedLinks('calibration', all).map(l => l.id), ['latency']);
  assert.deepEqual(relatedLinks('quick', only('latencyTuner')).map(l => l.id), ['latency']);
  assert.deepEqual(relatedLinks('quick', none), []);
  assert.deepEqual(relatedLinks('history', all), []);
  for (const t of Object.values(TARGETS)) assert.ok(t.label && t.feature && t.icon, t.id);
});

test('equipment links depend on the product category and hand over the asset', () => {
  const asset = { id: 'a1' };
  const cart = equipmentLinks(asset, 'cartridge', all);
  assert.deepEqual(cart.map(l => l.id), ['stylus', 'vinylscan']);
  assert.deepEqual(cart[0].params, { assetId: 'a1' });
  assert.deepEqual(cart[1].params, { stylusId: 'a1' });
  assert.deepEqual(equipmentLinks(asset, 'stylus', only('wearMap')).map(l => l.id), ['vinylscan']);
  assert.deepEqual(equipmentLinks(asset, 'dvs_media', all).map(l => l.id), ['vinylscan']);
  assert.deepEqual(equipmentLinks(asset, 'audio_interface', all).map(l => l.id), ['latency']);
  assert.deepEqual(equipmentLinks(asset, 'turntable', all), []);
  assert.deepEqual(equipmentLinks({}, 'cartridge', all), []);
  assert.deepEqual(equipmentLinks(asset, 'cartridge', none), []);
});

test('pre-gig cross fixes: only for problems, only for features that are on, no duplicates', () => {
  assert.deepEqual(pregigCrossFixes('signal:A', 'pass', all), []);
  assert.deepEqual(pregigCrossFixes('signal:A', 'skipped', all), []);
  assert.deepEqual(pregigCrossFixes('signal:A', 'fail', all).map(f => f.to), ['hum']);
  assert.deepEqual(pregigCrossFixes('timecode:B', 'warn', all).map(f => f.to || f.target), ['stylus', 'latency', 'ms-settings:powersleep']);
  assert.deepEqual(pregigCrossFixes('timecode:B', 'warn', none), [{ label: 'Open power settings', text: pregigCrossFixes('timecode:A', 'warn', all).at(-1).text, kind: 'settings', target: 'ms-settings:powersleep' }]);
  assert.ok(pregigCrossFixes('audio', 'error', all).some(f => f.target === 'ms-settings:privacy-microphone'));
  const engine = [{ kind: 'navigate', to: 'stylus', label: 'x' }, { kind: 'settings', target: 'ms-settings:powersleep' }];
  const merged = withCrossFixes(engine, 'timecode:A', 'fail', all);
  assert.equal(merged.filter(b => b.to === 'stylus').length, 1);
  assert.equal(merged.filter(b => b.target === 'ms-settings:powersleep').length, 1);
});

test('every settings target the UI can ask for is on the fixed list', () => {
  assert.deepEqual([...SETTINGS_TARGETS], ['ms-settings:sound', 'ms-settings:powersleep', 'ms-settings:privacy-microphone']);
  for (const stepKind of ['audio', 'timecode', 'signal', 'system', 'midi', 'software', 'headphones']) {
    for (const f of pregigCrossFixes(stepKind, 'fail', all)) if (f.kind === 'settings') assert.ok(isSettingsTarget(f.target), f.target);
  }
  for (const bad of ['ms-settings:network', 'ms-settings:sound?x=1', 'MS-SETTINGS:SOUND', 'calc.exe', '', null, undefined]) assert.equal(isSettingsTarget(bad), false);
});

test('active cartridge: preferred, else most recently used, else first', () => {
  const a = [{ id: 'a', lastUsedMs: 5 }, { id: 'b', lastUsedMs: 9 }, { id: 'c', lastUsedMs: 0 }];
  assert.equal(pickActiveAsset(a, 'c').id, 'c');
  assert.equal(pickActiveAsset(a, 'gone').id, 'b');
  assert.equal(pickActiveAsset(a).id, 'b');
  assert.equal(pickActiveAsset([{ id: 'x' }, { id: 'y' }]).id, 'x');
  assert.equal(pickActiveAsset([]), null);
});

test('stylus card model: wear percent, status and the next alert', () => {
  const state = hours => {
    const life = lifeStatus(hours, 500);
    return { life, alerts: stylusAlerts({ hours, ratedHours: 500 }), projection: null };
  };
  const ok = stylusCardModel(state(100), 'Concorde');
  assert.equal(ok.pct, 20); assert.equal(ok.tone, 'pass'); assert.equal(ok.nextAlert, null); assert.equal(ok.hoursText, '100 of 500 h');
  const amber = stylusCardModel(state(410), 'Concorde');
  assert.equal(amber.pct, 82); assert.equal(amber.tone, 'warn');
  assert.deepEqual(amber.nextAlert, { kind: 'alert', severity: 'amber', text: '82 % of rated life used' });
  const red = stylusCardModel(state(520));
  assert.equal(red.tone, 'fail'); assert.equal(red.nextAlert.severity, 'red');
  const snoozed = stylusCardModel({ ...state(410), alerts: [{ kind: 'life', severity: 'amber', message: 'm', snoozed: true }], projection: { date: Date.UTC(2027, 2, 5) } });
  assert.deepEqual(snoozed.nextAlert, { kind: 'projection', severity: 'info', text: 'Replace around 2027-03 at current use' });
  assert.equal(stylusCardModel(null), null);
  assert.equal(stylusCardModel(state(2)).hoursText, '2.0 of 500 h');
});

const T = '2026-10-09T12:00:00.000Z';

test('history rows map every feature run onto one shape', () => {
  const hum = mapHumRun({ id: 'h', kind: 'hum', mainsHz: 50, verdict: 'Hum dropped', createdAt: T, stepCount: 1, onset: true });
  assert.deepEqual([hum.id, hum.type, hum.screen, hum.feature, hum.status], ['hum:h', 'hum', 'hum', 'humHunter', 'info']);
  assert.match(hum.meta, /50 Hz mains · 1 step · feedback onset found/);
  const lat = mapLatencyRun({ id: 'l', kind: 'stress', deviceName: 'X', sampleRateHz: 48000, bufferFrames: 64, xruns: 0, verdict: 'pass', createdAt: T });
  assert.equal(lat.status, 'pass'); assert.match(lat.meta, /X · 48000 Hz · 64 frames · 0 xruns · pass/);
  assert.equal(mapLatencyRun({ id: 'l', kind: 'roundtrip', measuredMs: 9.44, createdAt: T }).title, 'Round-trip latency');
  assert.equal(mapScratchRun({ id: 's', completed: true, score: 90, createdAt: T }).status, 'pass');
  assert.equal(mapScratchRun({ id: 's', completed: false, score: 90, createdAt: T }).status, 'info');
  assert.equal(mapScratchRun({ id: 's', completed: true, score: 40, createdAt: T }).status, 'fail');
  const wear = mapWearScan({ id: 'w', verdict: 'replace', coverage: 0.5, binCount: 10, createdAt: T });
  assert.equal(wear.status, 'fail'); assert.match(wear.meta, /Replace · 50 % covered · 10 bins/);
  const pg = mapPregigRun({ id: 'p', verdict: 'green', startedAt: T, notes: 'Preset: Club', failCount: 0, warnCount: 1 });
  assert.deepEqual([pg.status, pg.title], ['pass', 'Pre-gig check: Club']);
  for (const [fn, row] of [[mapHumRun, {}], [mapHumRun, { id: 'x', createdAt: 'nonsense' }], [mapPregigRun, { id: 'x' }], [mapWearScan, null]]) assert.equal(fn(row), null);
});

test('loadFeatureRuns isolates failures and survives a missing backend', async () => {
  assert.deepEqual(await loadFeatureRuns(null), { rows: [], errors: [] });
  const calls = [];
  const invoke = async (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === 'scratch_list') throw new Error('SCRATCH_DB');
    if (cmd === 'hum_run_list') return [{ id: 'h', createdAt: '2026-10-01T00:00:00Z' }];
    if (cmd === 'latency_run_list') return [{ id: 'l', createdAt: '2026-10-02T00:00:00Z' }, { id: 'bad' }];
    return cmd === 'pregig_list_runs' ? 'not an array' : [];
  };
  const res = await loadFeatureRuns(invoke, { limit: 7 });
  assert.deepEqual(res.rows.map(r => r.id), ['latency:l', 'hum:h']);
  assert.deepEqual(res.errors, [{ type: 'scratch', message: 'SCRATCH_DB' }]);
  assert.deepEqual(calls.map(c => c[0]).sort(), ['hum_run_list', 'latency_run_list', 'pregig_list_runs', 'scratch_list', 'wearmap_list']);
  assert.deepEqual(calls.find(c => c[0] === 'wearmap_list')[1], { limit: 7 });
  assert.deepEqual(calls.find(c => c[0] === 'hum_run_list')[1], { filter: { limit: 7 } });
  assert.deepEqual((await loadFeatureRuns(invoke, { only: ['hum'] })).rows.map(r => r.id), ['hum:h']);
});

test('merge and filter the feed by type, newest first', () => {
  const diag = [{ id: 'd1', test: 'Speed', startedAt: '2026-10-03T00:00:00Z', score: 90 }, { id: 'd0', test: 'Old', startedAt: '2026-09-01T00:00:00Z' }];
  const feat = [mapHumRun({ id: 'h', createdAt: '2026-10-05T00:00:00Z' }), mapLatencyRun({ id: 'l', createdAt: '2026-10-01T00:00:00Z' })];
  assert.deepEqual(mergeFeed(diag, feat).map(r => r.id), ['hum:h', 'd1', 'latency:l', 'd0']);
  assert.deepEqual(mergeFeed(diag, feat, 'diagnostic').map(r => r.id), ['d1', 'd0']);
  assert.deepEqual(mergeFeed(diag, feat, 'latency').map(r => r.id), ['latency:l']);
  assert.deepEqual(mergeFeed(diag, feat, 'scratch'), []);
  assert.deepEqual(typeCounts(diag, feat), { diagnostic: 2, hum: 1, latency: 1, scratch: 0, wearmap: 0, pregig: 0 });
  assert.deepEqual(RUN_TYPES.map(t => t.id), Object.keys(typeCounts([], [])));
});

test('pre-gig PDF: words not colours, everything escaped', () => {
  const run = {
    presetName: 'Club <b>booth</b>', startedAt: '2026-10-09T20:00:00', durationMs: 61000, verdict: 'red',
    results: [
      { stepId: 'audio', label: 'Audio interface', state: 'pass', summary: 'Found it.', evidence: { sampleRate: 48000 } },
      { stepId: 'timecode:A', label: 'Timecode, deck A', state: 'fail', summary: 'Weak <script>x</script> signal', evidence: { snrDb: 12.5 }, fix: [{ label: 'Clean', text: 'Clean the stylus', action: { kind: 'retry' } }] },
      { stepId: 'timecode:B', label: 'Timecode, deck B', state: 'skipped', reason: 'input-pair', summary: 'Needs multichannel capture', required: true },
    ],
  };
  const data = pregigPrintData(run, { device: 'Audio 8' });
  assert.equal(data.title, 'Not ready');
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = pregigPrintable.build(data, { esc });
  assert.ok(!/<script/i.test(html) && !/<b>booth/.test(html));
  assert.match(html, /Fix this first/); assert.match(html, /Timecode, deck A<\/strong> \(Fail\)/); assert.match(html, /Clean the stylus/);
  assert.match(html, /<td>Pass<\/td>/); assert.match(html, /Coming next/); assert.match(html, /Signal to noise/);
  assert.equal(pregigPrintable.title(data), 'Pre-gig check: Club <b>booth</b>'); // the title is escaped by report-pdf.js
  assert.deepEqual(pregigPrintable.summary(data).find(r => r[0] === 'Checks'), ['Checks', '3 (1 with problems)']);
  assert.match(pregigPrintable.build({ results: [{ stepId: 'audio', label: 'A', state: 'pass', summary: 's' }] }, { esc }), /Nothing to fix/);
});
