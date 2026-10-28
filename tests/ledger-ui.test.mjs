// FS-33 UI helpers and the I/O bridge, without a DOM: step-1 row text, the publish guide (AC-6), the browser-mode
// history (AC-7 revision counter) and the exact command names and argument shapes sent to Rust (contract).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), raw: m }; };
globalThis.localStorage = mem();
const { gearRowText, publishSteps, PUBLISH_COPY, RETRACT_NOTE, SERVICE_JOB_NOTE, initialSelection, selectAllIds, heldNote, exportNote, LEFTOVER_NOTE } = await import('../app/ui/screens/ledger.js');
const { createLedgerApi, LOCAL_KEY } = await import('../app/ledger/api.js');
const { LEDGER_EXTS } = await import('../app/ledger/build.js');
const CONTRACT = JSON.parse(readFileSync(new URL('./contracts/ledger.json', import.meta.url), 'utf8'));

test('step 1 rows: title, model and status in words (never colour alone)', () => {
  const t = gearRowText({ asset: { id: 'a', nickname: 'Left deck', retiredDate: '2026-01-01' }, manufacturer: 'Technics', model: 'SL-1200MK4', photos: 0, certificates: 2, service: 1 });
  assert.deepEqual(t, { title: 'Left deck', model: 'Technics SL-1200MK4', status: ['no photos', '2 certificates', '1 service entry', 'retired'] });
  assert.equal(gearRowText({ asset: { id: 'b' }, manufacturer: '', model: 'Xone:23C', photos: 3, certificates: 0, service: 0 }).title, 'Xone:23C');
});

test('regression: units used in service jobs carry a visible note and start unselected (history, Select all), the user can still tick them', () => {
  const rows = [
    { asset: { id: 'own' }, model: 'A', usedInServiceJobs: false },
    { asset: { id: 'bench' }, model: 'B', usedInServiceJobs: true },
    { asset: { id: 'self' }, model: 'C', usedInServiceJobs: true },
  ];
  assert.equal(SERVICE_JOB_NOTE, 'Used in service jobs — check it is your own gear before including it');
  assert.equal(gearRowText(rows[1]).note, SERVICE_JOB_NOTE);
  assert.equal(gearRowText(rows[0]).note, undefined);
  // re-opening after an export that included them: only the unflagged units are ticked again, the rest are reported
  assert.deepEqual(initialSelection(rows, ['own', 'bench', 'gone']), { ids: ['own'], held: ['bench'] });
  assert.deepEqual(initialSelection(rows, []), { ids: [], held: [] });
  assert.deepEqual(selectAllIds(rows), ['own']);
  assert.match(heldNote(2), /^2 units used in service jobs were left unticked/);
  assert.match(heldNote(1), /^1 unit used in service jobs was left unticked/);
});

test('regression: the post-export note says stale files from earlier exports were removed (and only claims it when Rust pruned)', () => {
  assert.match(exportNote({ revision: 4, mode: 'folder', path: '/x/ledger', removed: 3 }), /^Revision 4 recorded\. 3 photos or certificate files from earlier exports that are not in this one were removed\.$/);
  assert.match(exportNote({ revision: 4, mode: 'folder', path: '/x/ledger', removed: 1 }), /1 photo or certificate file from earlier exports that is not in this one was removed/);
  assert.match(exportNote({ revision: 4, mode: 'folder', path: '/x/ledger', removed: 0 }), /stale files from earlier exports were removed|no stale files/i);
  assert.equal(exportNote({ revision: 2, mode: 'folder', path: '/x/ledger' }), `Revision 2 recorded. ${LEFTOVER_NOTE}`, 'an older backend that does not prune: the old warning');
  assert.equal(exportNote({ revision: 2, mode: 'single', path: '/x/l.html' }), 'Revision 2 recorded.');
});

test('contract: ledger_write_folder, ledger_next_revision and ledger_customer_units match tests/contracts/ledger.json', async () => {
  for (const k of ['ledger_write_folder', 'ledger_next_revision', 'ledger_customer_units']) assert.equal(CONTRACT[k]?.command, k, `${k} has a contract entry`);
  const calls = [];
  const invoke = async (cmd, args) => {
    calls.push([cmd, args ?? {}]);
    if (cmd in CONTRACT) return structuredClone(CONTRACT[cmd].response);
    if (cmd === 'maintenance_list' || cmd === 'certificate_list') return [];
    throw new Error(`unexpected ${cmd}`);
  };
  const catalog = { list: async kind => (kind === 'asset' ? [{ id: 'fs33-a' }, { id: CONTRACT.ledger_customer_units.response[0] }] : []) };
  const api = createLedgerApi({ invoke, storage: mem(), catalog, photos: { list: async () => [] } });
  assert.equal(await api.nextRevision(), CONTRACT.ledger_next_revision.response);
  assert.deepEqual(calls.find(c => c[0] === 'ledger_next_revision')[1], CONTRACT.ledger_next_revision.request);
  const gear = await api.listGear();
  assert.deepEqual(calls.find(c => c[0] === 'ledger_customer_units')[1], CONTRACT.ledger_customer_units.request);
  assert.deepEqual(gear.rows.filter(r => r.usedInServiceJobs).map(r => r.asset.id), CONTRACT.ledger_customer_units.response);
  const req = CONTRACT.ledger_write_folder.request;
  const r = await api.writeFolder(req.files, { api: { dialog: { open: async () => req.dir }, core: { invoke } } });
  assert.deepEqual(calls.at(-1), ['ledger_write_folder', req]);
  assert.deepEqual(r, { cancelled: false, ...CONTRACT.ledger_write_folder.response });
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
  // the folder write goes through ledger_write_folder (Rust applies LEDGER_EXTS itself) ...
  const files = [{ relPath: 'ledger/index.html', text: '<p>x</p>' }];
  const ledgerInvoke = async (cmd, args) => { calls.push([cmd, args]); if (cmd === 'ledger_write_folder') return { written: args.files.length, removed: 0, path: args.dir }; return invoke(cmd, args); };
  const r0 = await api.writeFolder(files, { api: { dialog: { open: async () => '/home/dj/Ledger' }, core: { invoke: ledgerInvoke } } });
  assert.deepEqual(r0, { cancelled: false, path: '/home/dj/Ledger', written: 1, removed: 0 });
  assert.deepEqual(calls.at(-1), ['ledger_write_folder', { dir: '/home/dj/Ledger', files }]);
  // ... and only a backend without that command (the UI smoke mock) falls back to userfiles_write_folder
  const oldInvoke = async (cmd, args) => { if (cmd === 'ledger_write_folder') throw `unknown command ${cmd}`; return invoke(cmd, args); };
  const fake = { dialog: { open: async () => '/home/dj/Ledger' }, core: { invoke: oldInvoke } };
  const r = await api.writeFolder(files, { api: fake });
  assert.deepEqual(r, { cancelled: false, path: '/home/dj/Ledger', written: 1 });
  assert.deepEqual(calls.at(-1)[1].allowedExts, [...LEDGER_EXTS]);
});
