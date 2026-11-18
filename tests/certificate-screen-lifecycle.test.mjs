import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, installCertificateDom, settle } from './fixtures/certificate-screen-dom.mjs';

const document = installCertificateDom({ after });
const { certificateScreenDefs, createCertificateScreen } = await import('../app/ui/screens/certificate.js');
const { registerScreens, go } = await import('../app/ui/shell.js');
const { takeHandoff } = await import('../app/ui/crosslinks.js');
const { active, settings, store } = await import('../app/ui/state.js');
const { bindSettings } = await import('../app/features.js');
const { lib, ensureLibrary } = await import('../app/ui/devices/library-state.js');
bindSettings(settings);
certificateScreenDefs();
await ensureLibrary();

const profile = { id: 'p1', manufacturer: 'Acme', model: 'Deck', version: 1, tests: [{ id: 't1', title: 'Controls', method: 'manual:check' }] };
const assets = ['a', 'b'].map(id => ({ id, productId: 'product1', nickname: `Deck ${id}`, serialNumber: `SERIAL-${id}` }));
const identity = fingerprint => ({ fingerprint, protection: 'file-user-only' });
const historyRow = serial => ({ id: `cert-${serial}`, serialNumber: serial, verdict: 'pass', issuedAt: '2026-11-01T10:00:00Z', validUntil: '2026-12-01T10:00:00Z', contentHash: 'a'.repeat(64) });

async function mount(t, overrides = {}) {
  window.__TAURI__ = { core: { invoke: async () => [] } };
  t.mock.method(store, 'list', async () => assets);
  t.mock.method(store, 'listDeviceTestResults', async () => []);
  Object.assign(lib, { ready: true, profiles: [profile], products: new Map([['p1', 'product1']]), assets, results: [] });
  settings.features = { certificates: true };
  active.screen = null;
  takeHandoff('certificate');
  const section = document.getElementById('screen-certificate');
  section.replaceChildren(); section.hidden = true;
  const calls = [];
  const api = { native: true, identity: async () => identity('a'.repeat(16)), list: async assetId => { calls.push(assetId); return [historyRow(`HISTORY-${assetId}`)]; }, ...overrides };
  registerScreens([
    { id: 'other', title: 'Other', icon: 'info', create: () => ({}) },
    { id: 'certificate', title: 'Certificates', icon: 'file', create: node => createCertificateScreen(node, { api }) },
  ]);
  go('certificate');
  await settle();
  const byId = id => section.querySelector(`#${id}`);
  return {
    section, calls, byId, navigate: go,
    select(assetId) { const picker = byId('cert-unit'); picker.value = `p1::${assetId}`; picker.dispatch('change'); },
    history: () => byId('cert-history-list').textContent,
  };
}

for (const outcome of ['resolve', 'reject']) {
  test(`a late history ${outcome} for a previous unit preserves the selected unit's history`, async t => {
    const pending = deferred();
    const screen = await mount(t, { list: assetId => assetId === 'a' ? pending.promise : Promise.resolve([historyRow('HISTORY-b')]) });
    screen.select('b'); await settle();
    assert.match(screen.history(), /HISTORY-b/);
    if (outcome === 'resolve') pending.resolve([historyRow('HISTORY-a')]);
    else pending.reject(new Error('Previous unit history unavailable'));
    await settle();
    assert.equal(screen.byId('cert-unit').value, 'p1::b');
    assert.match(screen.history(), /HISTORY-b/);
    assert.doesNotMatch(screen.history(), /HISTORY-a/);
  });
}

test('selecting a unit clears history belonging to the previous unit while loading', async t => {
  const pending = deferred();
  const screen = await mount(t, { list: assetId => assetId === 'b' ? pending.promise : Promise.resolve([historyRow('HISTORY-a')]) });
  assert.match(screen.history(), /HISTORY-a/);
  screen.select('b');
  assert.doesNotMatch(screen.history(), /HISTORY-a/);
  pending.resolve([historyRow('HISTORY-b')]); await settle();
  assert.match(screen.history(), /HISTORY-b/);
});

test('returning to a unit keeps its newer history request when its first request finishes last', async t => {
  const pending = deferred();
  let calls = 0;
  const screen = await mount(t, { list: assetId => assetId === 'a' && ++calls === 1 ? pending.promise : Promise.resolve([historyRow(`CURRENT-${assetId}`)]) });
  screen.select('b'); screen.select('a'); await settle();
  assert.match(screen.history(), /CURRENT-a/);
  pending.resolve([historyRow('OUTDATED-a')]); await settle();
  assert.match(screen.history(), /CURRENT-a/);
  assert.doesNotMatch(screen.history(), /OUTDATED-a/);
});

test('a hidden cached certificate screen may retain history for the same selected unit', async t => {
  const pending = deferred();
  const screen = await mount(t, { list: () => pending.promise });
  screen.navigate('other');
  assert.equal(screen.section.hidden, true);
  pending.resolve([historyRow('HISTORY-a')]); await settle();
  assert.match(screen.history(), /HISTORY-a/);
  screen.navigate('certificate'); await settle();
  assert.match(screen.history(), /HISTORY-a/);
});

for (const outcome of ['resolve', 'reject']) {
  test(`a pending identity refresh ${outcome} cannot replace a newly created signing identity`, async t => {
    const pending = deferred();
    let reads = 0, creates = 0;
    const screen = await mount(t, {
      identity: () => ++reads === 1 ? Promise.reject(Object.assign(new Error('Stored signing key is corrupt'), { code: 'key_corrupt' })) : pending.promise,
      newIdentity: async () => { creates++; return identity('b'.repeat(16)); },
    });
    assert.ok(screen.byId('cert-new-identity'));
    screen.navigate('other'); screen.navigate('certificate'); await settle();
    assert.equal(reads, 2, 'the older identity refresh is in flight');
    screen.byId('cert-new-identity').click();
    const dialog = document.getElementById('confirm-dialog');
    assert.equal(dialog.open, true);
    dialog.returnValue = 'confirm'; dialog.open = false; dialog.dispatch('close'); await settle();
    assert.equal(creates, 1);
    assert.equal(screen.byId('cert-fp')?.textContent, 'bbbb bbbb bbbb bbbb');
    if (outcome === 'resolve') pending.resolve(identity('a'.repeat(16)));
    else pending.reject(new Error('Old identity read failed'));
    await settle();
    assert.equal(screen.byId('cert-fp')?.textContent, 'bbbb bbbb bbbb bbbb');
    assert.equal(screen.byId('cert-new-identity'), null);
  });
}
