// FS-33 §9 leak-grep test (CI): seeded serials, customer names, nicknames, full paths, EXIF/GPS, user names, venue and
// price values must not appear in ANY exported file (HTML, ledger.json, photos decoded as bytes, certificate files)
// unless the user explicitly ticked the field that carries them (spec §2 AC-2, §7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLedger } from '../app/ledger/build.js';
import { makeRules, FIELD_KEYS } from '../app/ledger/privacy.js';
import { seededState, exportedText, SEEDS } from './ledger-fixtures.mjs';

const OPTS = { revision: 1, generatedAt: '2026-10-28T10:00:00.000Z' };
const ALL = { items: ['asset-1', 'asset-2'] };
// Never exported, whatever is ticked. (Customer names only reach the files through free text the user ticked.)
const ALWAYS_SECRET = ['winPath', 'posixPath', 'username', 'gps', 'exif', 'venue', 'price'];

function leaks(text, keys) {
  return keys.filter(k => text.includes(SEEDS[k]));
}

async function exportAll(rules, mode = 'folder') {
  const r = await buildLedger(seededState(), ALL, rules, { ...OPTS, mode });
  return { r, text: exportedText(r.files) };
}

test('leak-grep: Public and Insurance defaults leak no seeded private value in folder or single-file mode', async () => {
  for (const preset of ['public', 'insurance']) {
    for (const mode of ['folder', 'single']) {
      const { text } = await exportAll(makeRules(preset), mode);
      assert.deepEqual(leaks(text, [...ALWAYS_SECRET, 'customer', 'serial', 'notes', 'serviceText']), [], `${preset}/${mode}`);
      if (preset === 'public') assert.deepEqual(leaks(text, ['nickname']), [], `${preset}/${mode}: nickname hidden by default`);
    }
  }
});

test('leak-grep: single-file mode decodes embedded photos too (no EXIF/GPS/comment bytes inside data URIs)', async () => {
  const { r } = await exportAll(makeRules('private'), 'single');
  const html = r.files[0].text;
  const blobs = [...html.matchAll(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/g)].map(m => Buffer.from(m[1], 'base64').toString('latin1')).join('\n');
  assert.ok(blobs.length > 0);
  for (const k of ['gps', 'exif', 'username']) assert.ok(!blobs.includes(SEEDS[k]), k);
});

test('leak-grep: even with every field ticked, paths, user names, EXIF/GPS, venue and price never leak', async () => {
  const rules = makeRules('private');
  for (const k of FIELD_KEYS) rules.fields[k] = true;
  const { text } = await exportAll(rules);
  assert.deepEqual(leaks(text, ALWAYS_SECRET), []);
  // the explicitly ticked values do appear: the test would be meaningless if nothing was exported
  assert.deepEqual(leaks(text, ['serial', 'nickname', 'notes']).sort(), ['nickname', 'notes', 'serial']);
  assert.ok(text.includes('invoice 4471'), 'service descriptions appear once ticked');
});

test('leak-grep: free-text service descriptions carry customer names, so they are excluded unless ticked', async () => {
  const rules = makeRules('private');
  rules.fields.serviceNotes = false;
  const { text } = await exportAll(rules);
  assert.deepEqual(leaks(text, ['serviceText', 'customer']), []);
  assert.ok(text.includes('Part replaced'), 'service dates and types still appear');
});

test('leak-grep: each private field appears only when its own toggle (or per-item override) is on', async () => {
  const cases = [
    { key: 'nickname', seed: 'nickname' },
    { key: 'notes', seed: 'notes' },
    { key: 'serviceNotes', seed: 'serviceText', also: { service: true } },
  ];
  for (const c of cases) {
    const off = makeRules('public');
    Object.assign(off.fields, c.also || {});
    off.fields[c.key] = false;
    assert.deepEqual(leaks((await exportAll(off)).text, [c.seed]), [], `${c.key} off`);
    const on = makeRules('public');
    Object.assign(on.fields, c.also || {});
    on.fields[c.key] = true;
    assert.deepEqual(leaks((await exportAll(on)).text, [c.seed]), [c.seed], `${c.key} on`);
    const perItem = makeRules('public');
    Object.assign(perItem.fields, c.also || {});
    perItem.items['asset-1'] = { fields: { [c.key]: true } };
    assert.deepEqual(leaks((await exportAll(perItem)).text, [c.seed]), [c.seed], `${c.key} per-item override`);
  }
  const masked = makeRules('public'); masked.serialMode = 'masked';
  const t = (await exportAll(masked)).text;
  assert.ok(!t.includes(SEEDS.serial) && t.includes('****9902'), 'masked serial shows only the last 4');
  const full = makeRules('public'); full.items['asset-1'] = { serialMode: 'full' };
  assert.ok((await exportAll(full)).text.includes(SEEDS.serial), 'full serial only with an explicit per-item choice');
});

test('leak-grep: certificates (which hold the full serial and tester name) appear only when ticked', async () => {
  const off = (await exportAll(makeRules('insurance'))).text;
  assert.ok(!off.includes('Alex Tester') && !off.includes('1caa4be5aff4cb0e'), 'no certificate data by default');
  const rules = makeRules('insurance'); rules.fields.certificates = true;
  const on = (await exportAll(rules)).text;
  assert.ok(on.includes('Alex Tester'), 'certificate embedded unchanged once ticked');
  assert.deepEqual(leaks(on, ['winPath', 'posixPath']), [], 'certificate file paths stored by FS-20 are never exported');
});

test('leak-grep: no internal ids, local paths or owner name unless typed', async () => {
  const { text } = await exportAll(makeRules('private'));
  for (const s of ['asset-1', 'asset-2', 'ph1', 'ph2', 'cert-1', 'm1', 'm2']) assert.ok(!new RegExp(`["/]${s}["/.]`).test(text), s);
  assert.ok(!/displayName/.test(text));
});
