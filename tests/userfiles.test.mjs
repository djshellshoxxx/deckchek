import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveTextFile, sanitizeFileStem, normalizeExt } from '../app/userfiles.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('sanitizeFileStem matches the Rust rules', () => {
  assert.equal(sanitizeFileStem('Rane Twelve/MK2: test?'), 'Rane Twelve_MK2_ test_');
  assert.equal(sanitizeFileStem('CON'), 'CON_');
  assert.equal(sanitizeFileStem('nul.report'), 'nul.report_');
  assert.equal(sanitizeFileStem('name. '), 'name');
  assert.equal(sanitizeFileStem(''), '_');
  assert.equal(sanitizeFileStem('...'), '_');
  assert.equal(sanitizeFileStem('a'.repeat(200)).length, 80);
});

test('normalizeExt accepts dotted/uppercase and rejects junk', () => {
  assert.equal(normalizeExt('.CSV'), 'csv');
  assert.throws(() => normalizeExt('../x'));
  assert.throws(() => normalizeExt(''));
});

test('desktop: dialog then userfiles_write_text with exact argument names', async () => {
  const calls = [];
  const api = {
    dialog: { save: async opts => { calls.push(['save', opts]); return 'C:\\Users\\dj\\report.csv'; } },
    core: { invoke: async (cmd, args) => { calls.push([cmd, args]); return { path: args.path, bytes: 4 }; } },
  };
  const r = await saveTextFile({ suggestedName: 'my/report.csv', content: 'a,b\n', ext: 'csv', api });
  assert.deepEqual(r, { cancelled: false, path: 'C:\\Users\\dj\\report.csv', bytes: 4 });
  assert.equal(calls[0][1].defaultPath, 'my_report.csv');
  assert.deepEqual(calls[0][1].filters, [{ name: 'CSV', extensions: ['csv'] }]);
  assert.deepEqual(calls[1], ['userfiles_write_text', { path: 'C:\\Users\\dj\\report.csv', content: 'a,b\n', allowedExt: 'csv' }]);
});

test('desktop: cancelled dialog does not write', async () => {
  let invoked = false;
  const api = { dialog: { save: async () => null }, core: { invoke: async () => { invoked = true; } } };
  assert.deepEqual(await saveTextFile({ suggestedName: 'x', content: 'y', ext: 'json', api }), { cancelled: true });
  assert.equal(invoked, false);
});

test('desktop: Rust validation error propagates', async () => {
  const api = { dialog: { save: async () => 'C:\\CON.csv' }, core: { invoke: async () => { throw { code: 'reserved_name', message: 'reserved file name' }; } } };
  await assert.rejects(saveTextFile({ content: 'x', ext: 'csv', api }), e => e.code === 'reserved_name');
});

test('browser mode: Blob download via anchor', async () => {
  const clicked = [];
  const a = { click() { clicked.push({ href: this.href, download: this.download }); }, remove() {} };
  const doc = { createElement: t => { assert.equal(t, 'a'); return a; }, body: { appendChild() {} } };
  const r = await saveTextFile({ suggestedName: 'notes', content: 'héllo', ext: 'txt', api: null, doc });
  assert.deepEqual(r, { cancelled: false, path: null, bytes: 6 });
  assert.equal(clicked[0].download, 'notes.txt');
  assert.match(clicked[0].href, /^blob:/);
});

test('capability file only uses known identifiers and no opener wildcard', () => {
  const cap = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/capabilities/default.json'), 'utf8'));
  assert.equal(cap.identifier, 'default');
  assert.deepEqual(cap.windows, ['main']);
  const ids = cap.permissions.map(p => (typeof p === 'string' ? p : p.identifier));
  for (const required of ['core:default', 'dialog:allow-save', 'dialog:allow-open']) assert.ok(ids.includes(required), required);
  assert.ok(!ids.some(i => i.startsWith('opener:allow-open-url') || i === 'opener:default'));
  assert.ok(!ids.some(i => i === 'dialog:default' || i.includes('*')));
});

test('lib.rs registers plugins and userfiles commands inside FS-00 anchors', () => {
  const lib = fs.readFileSync(path.join(root, 'src-tauri/src/lib.rs'), 'utf8');
  assert.match(lib, /mod userfiles;/);
  assert.match(lib, /userfiles::userfiles_write_text/);
  assert.match(lib, /userfiles::userfiles_write_folder/);
  assert.match(lib, /tauri_plugin_dialog::init\(\)/);
  assert.match(lib, /tauri_plugin_opener::init\(\)/);
});
