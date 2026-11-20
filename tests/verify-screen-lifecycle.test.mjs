import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, installCertificateDom, settle } from './fixtures/certificate-screen-dom.mjs';

const document = installCertificateDom({ after });
window.__TAURI__ = { core: { invoke: async () => [] } };
const { createVerifyScreen } = await import('../app/ui/screens/verify.js');
const { registerScreens, go } = await import('../app/ui/shell.js');
const { active } = await import('../app/ui/state.js');
const section = document.createElement('section'); section.id = 'screen-verify';
document.getElementById('main').append(section);

const report = serial => ({ status: 'valid', reasons: [], serial, contentHash: 'a'.repeat(64) });
const rawJson = '{ "payload": { "unit": { "serial": "RAW-SERIAL" } } }\n';

const rawBytes = new TextEncoder().encode(rawJson);

function pendingListeners() {
  const rows = [];
  return {
    rows,
    listen(_name, callback) {
      const pending = deferred();
      const row = { pending, callback, removed: 0 };
      rows.push(row);
      return pending.promise;
    },
    resolve(index) { const row = rows[index]; row.pending.resolve(() => { row.removed++; }); },
    drop(index, path) { rows[index].callback({ payload: { paths: [path] } }); },
  };
}

function mount({ events, dialog, ...overrides } = {}) {
  const extracted = [], verified = [];
  const api = {
    native: true,
    extract: async path => { extracted.push(path); return rawJson; },
    verify: async text => { verified.push(text); return report('CURRENT'); },
    ...overrides,
  };
  active.screen = null;
  section.replaceChildren(); section.hidden = true;
  registerScreens([
    { id: 'other', title: 'Other', icon: 'info', create: () => ({}) },
    { id: 'verify', title: 'Verify certificate', icon: 'check', create: node => createVerifyScreen(node, { api, events, dialog }) },
  ]);
  go('verify');
  const byId = id => section.querySelector(`#${id}`);
  return {
    extracted, verified, section, byId, navigate: go,
    file(file) { const input = byId('verify-file'); input.files = [file]; input.dispatch('change'); },
  };
}

test('out-of-order listener registration leaves no native drop listener after hiding Verify', async () => {
  const events = pendingListeners(), screen = mount({ events });
  screen.navigate('other'); screen.navigate('verify');
  assert.equal(events.rows.length, 2);
  events.resolve(1); await settle();
  events.resolve(0); await settle();
  screen.navigate('other');
  for (let i = 0; i < events.rows.length; i++) if (!events.rows[i].removed) events.drop(i, '/tmp/drop-for-other-screen.json');
  await settle();
  assert.equal(screen.section.hidden, true);
  assert.equal(active.screen.def.id, 'other');
  assert.deepEqual(screen.extracted, [], 'a new drop on another screen must not start certificate verification');
  assert.deepEqual(events.rows.map(row => row.removed), [1, 1], 'both registrations must release their own listener');
});

test('a failed superseded listener registration does not clear the current subscription', async () => {
  const events = pendingListeners(), screen = mount({ events });
  screen.navigate('other'); screen.navigate('verify');
  events.resolve(1); await settle();
  events.rows[0].pending.reject(new Error('Earlier listener registration failed')); await settle();
  screen.navigate('verify'); // The cached shell calls onShow even when already on this screen.
  assert.equal(events.rows.length, 2, 'the current live subscription must not be replaced by a duplicate');
  events.drop(1, '/tmp/current.json'); await settle();
  assert.deepEqual(screen.extracted, ['/tmp/current.json']);
  screen.navigate('other');
  assert.equal(events.rows[1].removed, 1);
});

for (const next of ['hidden', 'shown again']) {
  test(`a queued callback from an earlier listener cannot start verification when ${next}`, async () => {
    const events = pendingListeners(), screen = mount({ events });
    screen.navigate('other');
    if (next === 'shown again') screen.navigate('verify');
    // Native event delivery can already be queued before the asynchronous registration returns its cleanup.
    events.drop(0, '/tmp/obsolete-listener.json'); await settle();
    for (let i = 0; i < events.rows.length; i++) events.resolve(i);
    await settle();
    assert.deepEqual(screen.extracted, [], 'the obsolete listener must not accept a new file');
    if (next === 'shown again') {
      events.drop(1, '/tmp/current-listener.json'); await settle();
      assert.deepEqual(screen.extracted, ['/tmp/current-listener.json']);
    }
    screen.navigate('other');
  });
}

for (const phase of ['file read', 'native extraction', 'verification']) {
  for (const outcome of ['resolve', 'reject']) {
    test(`an older ${phase} ${outcome} preserves the newer file selection`, async () => {
      const pending = deferred();
      const seen = [];
      const screen = mount({
        ...(phase === 'native extraction' ? { dialog: { open: async () => '/tmp/older.json' }, extract: () => pending.promise } : {}),
        verify: text => { seen.push(text); return phase === 'verification' ? pending.promise : Promise.resolve(report('OLDER')); },
      });
      if (phase === 'native extraction') screen.byId('verify-drop').click();
      else screen.file({ name: 'older.json', size: rawBytes.length, arrayBuffer: () => phase === 'file read' ? pending.promise : Promise.resolve(rawBytes.slice().buffer) });
      await settle();
      screen.file({ name: 'newer.pdf', size: 4, arrayBuffer: () => { throw new Error('PDFs must not be read'); } });
      if (outcome === 'resolve') pending.resolve(phase === 'verification' ? report('OLDER') : phase === 'file read' ? rawBytes.slice().buffer : rawJson);
      else pending.reject(new Error('Earlier file operation failed'));
      await settle();
      assert.match(screen.byId('verify-message').textContent, /no DeckChek data attached/);
      assert.equal(screen.byId('verify-badge'), null);
      assert.deepEqual(seen, phase === 'verification' ? [rawJson] : [], 'superseded reads must not verify, and current verification receives exact raw text');
    });
  }
}

test('verification already started for the selected file may finish while the cached screen is hidden', async () => {
  const pending = deferred();
  const screen = mount({ verify: () => pending.promise });
  screen.file({ name: 'selected.json', size: rawBytes.length, arrayBuffer: async () => rawBytes.slice().buffer });
  await settle();
  screen.navigate('other');
  pending.resolve(report('SELECTED')); await settle();
  assert.equal(screen.section.hidden, true);
  assert.match(screen.byId('verify-result').textContent, /SELECTED/);
  screen.navigate('verify');
  assert.match(screen.byId('verify-result').textContent, /SELECTED/);
});
