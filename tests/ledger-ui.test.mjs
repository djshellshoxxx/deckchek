// FS-33 UI helpers and the I/O bridge, without a DOM: step-1 row text, the publish guide (AC-6), the browser-mode
// history (AC-7 revision counter) and the exact command names and argument shapes sent to Rust (contract).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), raw: m }; };
globalThis.localStorage = mem();
const { gearRowText, publishSteps, PUBLISH_COPY, RETRACT_NOTE } = await import('../app/ui/screens/ledger.js');
const { createLedgerApi, LOCAL_KEY } = await import('../app/ledger/api.js');
const { LEDGER_EXTS } = await import('../app/ledger/build.js');
const CONTRACT = JSON.parse(readFileSync(new URL('./contracts/ledger.json', import.meta.url), 'utf8'));

test('step 1 rows: title, model and status in words (never colour alone)', () => {
  const t = gearRowText({ asset: { id: 'a', nickname: 'Left deck', retiredDate: '2026-01-01' }, manufacturer: 'Technics', model: 'SL-1200MK4', photos: 0, certificates: 2, service: 1 });
  assert.deepEqual(t, { title: 'Left deck', model: 'Technics SL-1200MK4', status: ['no photos', '2 certificates', '1 service entry', 'retired'] });
  assert.equal(gearRowText({ asset: { id: 'b' }, manufacturer: '', model: 'Xone:23C', photos: 3, certificates: 0, service: 0 }).title, 'Xone:23C');
});

test('AC-6 publish help: numbered GitHub Pages steps naming the exact folder, no credentials, retract note', () => {
  const steps = publishSteps('ledger');
  assert.equal(steps.length, 4);
  assert.match(steps[1], /"ledger" folder/);
  assert.match(steps[2], /Settings > Pages/);
  assert.match(steps[2], /Deploy from a branch/);
  assert.ok(!steps.join(' ').match(/password|token|sign in|log in/i), 'the guide never asks for credentials');
  assert.equal(PUBLISH_COPY, 'Create a repository, upload the exported folder (or push it), then Settings > Pages > Deploy from branch. DeckChek never uploads for you. Check the privacy summary below before making it public.');
  assert.match(RETRACT_NOTE, /does not remove copies you already published/);
});

test('AC-7 browser mode: revisions count up by one, a stale revision is refused, history survives reload', async () => {
  const storage = mem();
  const api = createLedgerApi({ invoke: null, storage, catalog: { list: async () => [] }, photos: { list: async () => [] }, now: () => '2026-10-28T10:00:00.000Z' });
  assert.equal(api.native, false);
  assert.equal(await api.nextRevision(), 1);
  const rec = rev => ({ revision: rev, selection: { items: ['a'] }, privacy: { preset: 'public' }, ledgerSha256: 'ab'.repeat(32) });
  assert.equal((await api.recordExport(rec(1))).revision, 1);
  await assert.rejects(api.recordExport(rec(1)), /LEDGER_REVISION/);
  await assert.rejects(api.recordExport(rec(3)), /LEDGER_REVISION/);
  assert.equal((await api.recordExport(rec(2))).revision, 2);
  const again = createLedgerApi({ invoke: null, storage, catalog: { list: async () => [] }, photos: { list: async () => [] } });
  assert.deepEqual((await again.listExports()).map(e => e.revision), [2, 1]);
  assert.equal(await again.nextRevision(), 3);
  await again.setPublicNote('a', '  Serviced 2025  ');
  assert.deepEqual(await again.publicNotes(), { a: 'Serviced 2025' });
  await again.setPublicNote('a', '');
  assert.deepEqual(await again.publicNotes(), {});
  storage.setItem(LOCAL_KEY, '{broken');
  assert.deepEqual(await again.listExports(), [], 'corrupt local history reads as empty, never throws');
});

test('desktop bridge sends exactly the contract field names (camelCase) and the ledger extension list', async () => {
  const calls = [];
  const invoke = async (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === 'ledger_export_list') return [];
    if (cmd === 'ledger_public_notes') return CONTRACT.ledger_public_notes.response;
    if (cmd === 'ledger_public_note_set') return CONTRACT.ledger_public_note_set.response;
    if (cmd === 'ledger_export_record') return CONTRACT.ledger_export_record.response;
    if (cmd === 'userfiles_write_folder') return { written: args.files.length, path: args.dir };
    throw new Error(cmd);
  };
  const api = createLedgerApi({ invoke, storage: mem(), catalog: { list: async () => [] }, photos: { list: async () => [] } });
  assert.equal(api.native, true);
  await api.recordExport(CONTRACT.ledger_export_record.request.record);
  await api.setPublicNote('fs33-a', 'All original.');
  assert.deepEqual(await api.publicNotes(), { 'fs33-a': 'All original.' });
  await api.listExports(5);
  assert.deepEqual(calls.find(c => c[0] === 'ledger_export_record')[1], CONTRACT.ledger_export_record.request);
  assert.deepEqual(calls.find(c => c[0] === 'ledger_public_note_set')[1], CONTRACT.ledger_public_note_set.request);
  assert.deepEqual(calls.find(c => c[0] === 'ledger_export_list')[1], CONTRACT.ledger_export_list.request);
  const fake = { dialog: { open: async () => '/home/dj/Ledger' }, core: { invoke } };
  const r = await api.writeFolder([{ relPath: 'ledger/index.html', text: '<p>x</p>' }], { api: fake });
  assert.deepEqual(r, { cancelled: false, path: '/home/dj/Ledger', written: 1 });
  assert.deepEqual(calls.at(-1)[1].allowedExts, [...LEDGER_EXTS]);
});
