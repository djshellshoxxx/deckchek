import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { installServiceDom, settle, deferred } from './fixtures/service-screen-dom.mjs';
import { guidedCapture } from './fixtures/stylus-guided.mjs';

const document = installServiceDom({ after });
const { createStylusScreen } = await import('../app/ui/screens/stylus.js');
const { registerScreens, go } = await import('../app/ui/shell.js');
const { active, store, workspace } = await import('../app/ui/state.js');
const { ACTIVE_CARTRIDGE_KEY, takeHandoff } = await import('../app/ui/crosslinks.js');

async function mount(t, overrides = {}) {
  window.__TAURI__ = { core: { invoke: async () => [] } };
  const assets = [{ id: 'a', productId: 'p', nickname: 'Cartridge A' }, { id: 'b', productId: 'p', nickname: 'Cartridge B' }];
  const setups = [{ id: 'setup-a', name: 'Setup A', components: [{ assetId: 'a' }] }, { id: 'setup-b', name: 'Setup B', components: [{ assetId: 'b' }] }];
  t.mock.method(store, 'list', async entity => entity === 'asset' ? assets : entity === 'product' ? [{ id: 'p', category: 'cartridge', model: 'Reference cartridge' }] : entity === 'setup' ? setups : []);
  const writes = [], benchmarks = [], sessions = [], starts = [], intervals = new Map(); let next = 0, timerId = 0, time = Date.parse('2026-11-18T01:00:00Z');
  t.mock.method(store, 'saveRun', async run => { writes.push(structuredClone(run)); if (overrides.saveRun) await overrides.saveRun(run, writes.length); return { id: run.id }; });
  const api = { native: true, baseline: async () => null, alertList: async () => [], ratedLifeGet: async () => null,
    benchmarkList: async id => benchmarks.filter(row => row.assetId === id), benchmarkSave: async row => {
      if (overrides.benchmarkSave) await overrides.benchmarkSave(row);
      benchmarks.push({ ...structuredClone(row), id: `benchmark-${benchmarks.length}`, createdAt: '2026-11-18T08:00:00Z' }); return { id: benchmarks.at(-1).id };
    }, ...(overrides.api || {}) };
  const usage = { list: async () => [] };
  const benchmarkIo = { liveAvailable: () => true, createPairPicker: () => ({ el: document.createElement('div') }), currentPairs: () => [1], deviceName: () => 'Input A', profileFor: () => null,
    now: () => time, clock: () => time, timers: { setInterval: fn => { intervals.set(++timerId, fn); return timerId; }, clearInterval: id => intervals.delete(id) },
    capture: async args => {
      starts.push(args); if (overrides.capture) return overrides.capture(args, starts.length);
      const result = guidedCapture(['tone', 'left', 'right'][next++ % 3]);
      const session = { info: result.captureInfo, stopped: false, cancels: 0, elapsedSec: 0, elapsed: () => session.elapsedSec,
        stop: async () => { session.stopped = true; return result; }, cancel: async () => { session.cancels++; session.stopped = true; } };
      sessions.push(session); return session;
    }, ...(overrides.io || {}) };
  active.screen?.api?.onHide?.(); active.screen = null; document.getElementById('screen-stylus')?.remove();
  const section = document.createElement('section'); section.id = 'screen-stylus'; section.hidden = true; document.getElementById('main').append(section);
  localStorage.setItem(ACTIVE_CARTRIDGE_KEY, 'a'); takeHandoff('stylus'); workspace.runs = [];
  let screen;
  registerScreens([{ id: 'other', title: 'Other', icon: 'info', create: () => ({}) }, { id: 'stylus', title: 'Stylus wear', icon: 'cartridge', create: node => (screen = createStylusScreen(node, { api, usage, benchmarkIo })) }]);
  go('stylus'); await settle();
  const byId = id => section.querySelector(`#${id}`);
  t.after(() => { go('other'); section.hidden = true; });
  return { section, byId, api, screen, writes, benchmarks, starts, sessions, intervals,
    select(id) { byId('sty-asset').value = id; byId('sty-asset').dispatch('change'); },
    async open() { byId('sty-tab-benchmark').dispatch('click'); await settle(); },
    async begin(values = {}) {
      for (const [id, value] of Object.entries({ record: 'Reference LP', side: 'A', force: '2.5', vta: 'Height 2', chain: 'Deck > Input A', setup: byId('sty-asset').value === 'a' ? 'setup-a' : 'setup-b', ...values })) byId(`sty-guided-${id}`).value = value;
      byId('sty-guided-config').dispatch('submit'); await settle();
    },
    async start() { byId('sty-guided-record-step').dispatch('click'); await settle(); },
    async tick(seconds = 10) { time += seconds * 1000; if (sessions.length) sessions.at(-1).elapsedSec += seconds; for (const fn of [...intervals.values()]) fn(); await settle(); },
    async capture() { await this.start(); await this.tick(); },
    async complete() { for (let i = 0; i < 3; i++) await this.capture(); },
  };
}

test('real cached screen captures and persists original asset/setup through the normal History path', async t => {
  const f = await mount(t); await f.open(); await f.begin(); f.byId('sty-b-thd').value = '9.1';
  await f.start(); const cancel = f.byId('sty-guided-cancel'); cancel.focus(); await f.tick(1);
  assert.equal(f.byId('sty-guided-cancel'), cancel, 'progress ticks keep the same control'); assert.equal(document.activeElement, cancel);
  await f.tick(9); await f.capture(); await f.capture();
  assert.equal(f.byId('sty-b-thd').value, '9.1'); assert.equal(document.activeElement.id, 'sty-guided-save');
  assert.equal(f.writes.length, 3); assert.equal(f.benchmarks.length, 0);
  assert.ok(f.writes.every(run => run.assetId === 'a' && run.setupId === 'setup-a'));
  assert.ok(workspace.runs.every(run => run.evidence.stylusBenchmark && run.quality.framesCaptured > 0));
  f.byId('sty-guided-save').dispatch('click'); await settle();
  assert.equal(f.benchmarks.length, 1); assert.equal(f.benchmarks[0].assetId, 'a'); assert.equal(f.benchmarks[0].sessionId, f.writes[0].id); assert.equal(f.benchmarks[0].valid, true);
});

test('B focuses guided preparation without starting input; unrelated setups cannot be selected for the original asset', async t => {
  const f = await mount(t); document.dispatch('keydown', { key: 'b', target: document.body }); await settle();
  assert.equal(document.activeElement.id, 'sty-guided-record'); assert.equal(f.starts.length, 0);
  assert.deepEqual(f.byId('sty-guided-setup').querySelectorAll('option').map(option => option.value), ['', 'setup-a']);
  await f.begin({ setup: 'setup-b' }); assert.match(f.byId('sty-guided-error').textContent, /does not include this cartridge/); assert.equal(f.starts.length, 0);
  await f.begin(); assert.equal(document.activeElement.id, 'sty-guided-record-step'); assert.equal(f.starts.length, 0);
});

for (const outcome of ['resolve', 'reject']) test(`old asset load ${outcome} cannot replace the selected guide or its capture identity`, async t => {
  const f = await mount(t), pending = deferred(); f.api.benchmarkList = id => id === 'a' ? pending.promise : Promise.resolve([]);
  const old = f.screen.reload(); await settle(); f.select('b'); await settle(); await f.open();
  assert.match(f.byId('sty-guided').textContent, /Record Cartridge B:/);
  if (outcome === 'resolve') pending.resolve([]); else pending.reject(new Error('Old asset failure'));
  await old; await settle(); assert.equal(f.byId('sty-asset').value, 'b'); assert.match(f.byId('sty-guided').textContent, /Record Cartridge B:/); assert.ok(!f.section.textContent.includes('Old asset failure'));
  await f.begin(); await f.capture(); assert.equal(f.writes[0].assetId, 'b'); assert.equal(f.writes[0].setupId, 'setup-b');
});

test('a pending load cannot recreate a disposed guide after navigation', async t => {
  const f = await mount(t), pending = deferred(); f.api.benchmarkList = () => pending.promise;
  const loading = f.screen.reload(); await settle(); go('other'); pending.resolve([]); await loading; await settle();
  assert.equal(f.section.hidden, true); assert.equal(f.starts.length, 0);
  f.api.benchmarkList = async () => []; go('stylus'); await settle(); await f.open(); assert.ok(f.byId('sty-guided-config'));
});

test('navigation cancels a late native start exactly once and repeated capture clicks acquire only one session', async t => {
  const pending = deferred(); let cancelled = 0, stopped = 0;
  const f = await mount(t, { capture: () => pending.promise }); await f.open(); await f.begin();
  const record = f.byId('sty-guided-record-step'); record.dispatch('click'); record.dispatch('click'); await settle(); assert.equal(f.starts.length, 1);
  go('other'); const result = guidedCapture('tone'); pending.resolve({ info: result.captureInfo, cancel: async () => { cancelled++; }, stop: async () => { stopped++; return result; } }); await settle();
  assert.equal(cancelled, 1); assert.equal(stopped, 0); assert.equal(f.writes.length, 0); assert.equal(f.benchmarks.length, 0);
});

for (const outcome of ['resolve', 'reject']) test(`asset change ignores late native-start ${outcome}`, async t => {
  const pending = deferred(); let cancelled = 0;
  const f = await mount(t, { capture: () => pending.promise }); await f.open(); await f.begin(); await f.start(); f.select('b'); await settle();
  if (outcome === 'resolve') pending.resolve({ info: guidedCapture('tone').captureInfo, cancel: async () => { cancelled++; } }); else pending.reject(new Error('Old native failure'));
  await settle(); assert.equal(f.byId('sty-asset').value, 'b'); assert.match(f.byId('sty-guided').textContent, /Record Cartridge B:/); assert.ok(!f.section.textContent.includes('Old native failure'));
  assert.equal(cancelled, outcome === 'resolve' ? 1 : 0); assert.equal(f.writes.length, 0);
});

test('changing tabs and Escape each release their own active capture and clear progress timers', async t => {
  const f = await mount(t); await f.open(); await f.begin(); await f.start(); f.byId('sty-tab-overview').dispatch('click'); await settle();
  assert.equal(f.sessions[0].cancels, 1); assert.equal(f.intervals.size, 0);
  await f.open(); await f.begin(); await f.start(); assert.equal(f.screen.onEscape(), true); await settle();
  assert.equal(f.sessions[1].cancels, 1); assert.equal(f.intervals.size, 0); assert.equal(f.writes.length, 0);
});

test('a dispatched benchmark save keeps original ownership after another asset is selected', async t => {
  const pending = deferred(), f = await mount(t, { benchmarkSave: () => pending.promise }); await f.open(); await f.begin(); await f.complete();
  f.byId('sty-guided-save').dispatch('click'); await settle(); f.select('b'); await settle(); pending.resolve(); await settle();
  assert.equal(f.benchmarks.length, 1); assert.equal(f.benchmarks[0].assetId, 'a'); assert.equal(f.benchmarks[0].setupId, 'setup-a');
  assert.equal(f.byId('sty-asset').value, 'b'); assert.match(f.byId('sty-guided').textContent, /Record Cartridge B:/); assert.ok(f.writes.every(run => run.assetId === 'a'));
});

test('late source-run save failure cannot attach a partial benchmark or its error to the next asset', async t => {
  const pending = deferred(), f = await mount(t, { saveRun: () => pending.promise }); await f.open(); await f.begin(); await f.capture();
  assert.equal(f.writes.length, 1); f.select('b'); await settle(); pending.reject(new Error('Original storage failed')); await settle();
  assert.equal(f.writes[0].assetId, 'a'); assert.equal(f.writes[0].setupId, 'setup-a'); assert.equal(f.benchmarks.length, 0);
  assert.match(f.byId('sty-guided').textContent, /Record Cartridge B:/); assert.ok(!f.section.textContent.includes('Original storage failed'));
});

test('legacy operator confirmation is explicit in the real review and saved evidence', async t => {
  const legacy = { id: 'legacy', assetId: 'a', hoursAt: 0, thdPercent: .2, separationDb: 40, valid: true, detail: {}, createdAt: '2026-11-01T00:00:00Z' };
  const f = await mount(t, { api: { benchmarkList: async () => [legacy] } }); await f.open();
  assert.equal(f.byId('sty-guided-same').checked, undefined); f.byId('sty-guided-same').checked = true; await f.begin(); await f.complete();
  assert.match(f.byId('sty-guided-comparison').textContent, /Historical device, input rate and calibration observations are unavailable/);
  f.byId('sty-guided-save').dispatch('click'); await settle(); assert.equal(f.benchmarks[0].valid, true); assert.equal(f.benchmarks[0].detail.conditionEvidence, 'operator-confirmed-legacy-baseline'); assert.deepEqual(legacy.detail, {});
});
