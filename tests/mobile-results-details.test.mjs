import test from 'node:test';
import assert from 'node:assert/strict';
import mountResults from '../mobile/screens/results.js';
import { getResult, getSettings } from '../mobile/lib/store.js';
import { parsePhoneRun } from '../app/phone-run.js';
import { qrImages } from '../mobile/lib/qr.js';
import { toQrFrames } from '../mobile/lib/export.js';
import { installServiceDom, settle } from './fixtures/service-screen-dom.mjs';

const RUN = {
  id: 'stored-result', kind: 'speed', title: 'Saved speed result', createdAt: '2026-11-21T00:00:00.000Z',
  device: { userAgent: 'Fixture phone', sampleRate: 48000, micFlags: { echoCancellation: false } },
  assetHint: { nickname: 'Saved deck', serial: 'SAVED-01' }, notes: '',
  measurements: [{ metricId: 'speed.pitchPercent', value: 0.1, unit: '%', uncertainty: 0.05 }],
};

function mount(t, { assetNickname = 'Initial deck', assetSerial = 'INITIAL-01' } = {}) {
  const document = installServiceDom(t), downloads = [], copies = [], shares = [], blobs = new Map();
  localStorage.setItem('deckchek.mobile.v1', JSON.stringify({ results: [RUN], settings: { assetNickname, assetSerial, redactUserAgent: false } }));
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    canShare: () => true, share: async value => { shares.push(value); },
    clipboard: { writeText: async value => { copies.push(value); } },
  } });
  t.after(() => {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator); else delete globalThis.navigator;
  });
  const createUrl = URL.createObjectURL;
  t.mock.method(URL, 'createObjectURL', blob => { const url = createUrl(blob); blobs.set(url, blob); return url; });
  const createElement = document.createElement;
  t.mock.method(document, 'createElement', function (tag) {
    const node = createElement.call(this, tag);
    if (tag === 'a') node.click = () => { downloads.push({ name: node.download, blob: blobs.get(node.href) }); };
    return node;
  });
  const root = document.createElement('main'); document.body.append(root);
  const unmount = mountResults(root, { route: { id: RUN.id } });
  t.after(() => { unmount(); root.remove(); });
  const q = selector => root.querySelector(selector);
  const text = () => q('#export-text').textContent;
  return { root, document, q, text, downloads, copies, shares,
    edit: (selector, value, event = 'input') => { const field = q(selector); field.focus(); field.value = value; field.dispatch(event); return field; },
  };
}

test('Mobile edited export details reach text, file, share and clipboard with the same current checksum', async t => {
  const f = mount(t), original = structuredClone(getResult(RUN.id));
  const before = f.text();
  f.edit('#set-nick', '  Latest deck  ');
  const serial = f.edit('#set-serial', 'NEW-02');
  const current = f.text(), parsed = parsePhoneRun(current);
  assert.notEqual(current, before);
  assert.equal(parsed.ok, true, parsed.errors.join('; ')); assert.equal(parsed.hashOk, true);
  assert.deepEqual(parsed.run.assetHint, { nickname: 'Latest deck', serial: 'NEW-02' });
  assert.equal(getSettings().assetNickname, 'Latest deck');
  assert.equal(f.document.activeElement, serial, 'updating the panel preserves the editor focus');
  assert.equal(serial.isConnected, true, 'the focused editor remains attached');
  assert.equal(f.q('#set-serial'), serial, 'the live editor keeps its identity');
  const save = f.q('#export-file'); serial.dispatch('change');
  assert.equal(f.q('#export-file'), save, 'a redundant blur/change preserves the pending action target');
  f.q('#export-copy').dispatch('click'); f.q('#export-share').dispatch('click'); save.dispatch('click'); await settle();
  assert.deepEqual(f.copies, [current]);
  assert.equal(f.shares.length, 1); assert.equal(await f.shares[0].files[0].text(), current);
  assert.equal(f.downloads.length, 1); assert.equal(await f.downloads[0].blob.text(), current);
  assert.match(f.downloads[0].name, /\.deckchek-mobile\.json$/);
  assert.deepEqual(getResult(RUN.id), original, 'export edits do not rewrite the saved measurement');
});

test('Mobile explicit blanks omit saved hints and editing retires the visible QR until it is regenerated', t => {
  const f = mount(t), original = structuredClone(getResult(RUN.id));
  f.q('#export-qr').dispatch('click');
  const oldQr = f.q('#qr-img').src;
  f.edit('#set-serial', '');
  assert.equal(f.q('#qr-img'), null, 'the old QR is no longer displayed');
  assert.equal(JSON.parse(f.text()).assetHint.serial, null, 'blank does not revive the saved serial');
  f.edit('#set-nick', '');
  const redact = f.q('#set-redact'); redact.checked = true; redact.dispatch('change');
  const current = f.text(), parsed = parsePhoneRun(current);
  assert.equal(parsed.ok, true, parsed.errors.join('; ')); assert.equal(parsed.hashOk, true);
  assert.deepEqual(parsed.run.assetHint, { nickname: null, serial: null });
  assert.equal(parsed.run.device.userAgent, null);
  assert.doesNotMatch(current, /SAVED-01|Saved deck|Fixture phone/);
  f.q('#export-qr').dispatch('click');
  assert.notEqual(f.q('#qr-img').src, oldQr);
  assert.equal(f.q('#qr-img').src, qrImages(toQrFrames(current))[0].uri);
  assert.deepEqual(getResult(RUN.id), original);
});

test('Mobile blank visible export fields are authoritative and change-only edits also refresh the panel', t => {
  const f = mount(t, { assetNickname: '', assetSerial: '' });
  assert.deepEqual(JSON.parse(f.text()).assetHint, { nickname: null, serial: null });
  f.edit('#set-nick', 'Changed detail', 'change');
  assert.equal(JSON.parse(f.text()).assetHint.nickname, 'Changed detail');
  assert.equal(JSON.parse(f.text()).assetHint.serial, null);
  assert.equal(getResult(RUN.id).assetHint.serial, 'SAVED-01');
});

test('Mobile current export details and redaction survive denied preference writes over readable old settings', async t => {
  const f = mount(t), original = structuredClone(getResult(RUN.id));
  const persisted = localStorage.getItem('deckchek.mobile.v1');
  t.mock.method(localStorage, 'setItem', () => { throw new Error('Preference write unavailable'); });
  f.q('#export-qr').dispatch('click');
  f.edit('#set-nick', 'Current deck');
  const serial = f.edit('#set-serial', '');
  const redact = f.q('#set-redact'); redact.checked = true; redact.dispatch('change');
  const current = f.text(), parsed = parsePhoneRun(current);
  assert.equal(parsed.ok, true, parsed.errors.join('; ')); assert.equal(parsed.hashOk, true);
  assert.deepEqual(parsed.run.assetHint, { nickname: 'Current deck', serial: null });
  assert.equal(parsed.run.device.userAgent, null);
  assert.doesNotMatch(current, /INITIAL-01|SAVED-01|Fixture phone/);
  assert.equal(localStorage.getItem('deckchek.mobile.v1'), persisted, 'the old record is still readable');
  assert.equal(getSettings().assetNickname, 'Initial deck', 'the storage read really returns stale preferences');
  assert.equal(f.q('#qr-img'), null, 'an old visible QR is retired');
  assert.equal(f.q('#set-serial'), serial); assert.equal(serial.isConnected, true);
  const save = f.q('#export-file'); serial.dispatch('change');
  assert.equal(f.q('#export-file'), save, 'redundant change uses the editor state even after failed persistence');
  f.q('#export-copy').dispatch('click'); f.q('#export-share').dispatch('click'); save.dispatch('click'); await settle();
  assert.deepEqual(f.copies, [current]);
  assert.equal(await f.shares[0].files[0].text(), current);
  assert.equal(await f.downloads[0].blob.text(), current);
  f.q('#export-qr').dispatch('click');
  assert.equal(f.q('#qr-img').src, qrImages(toQrFrames(current))[0].uri);
  assert.deepEqual(getResult(RUN.id), original, 'failed preference persistence does not rewrite the saved result');
});
