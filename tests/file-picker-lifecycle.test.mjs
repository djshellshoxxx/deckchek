import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { installNativeCatalogDom, settle } from './fixtures/native-catalog-archive-dom.mjs';
const document = installNativeCatalogDom({ after });
const { pickFile } = await import('../app/ui/dom.js');
const picker = () => document.body.children.find(node => node.tagName === 'INPUT' && node.type === 'file');
test('file-picker cancel resolves once and releases its temporary input', async t => {
  let settled = false, value = 'pending';
  const operation = pickFile('.json').then(result => { settled = true; value = result; });
  const input = picker(); assert.ok(input); t.after(() => input.remove()); input.dispatch('cancel'); await settle();
  assert.equal(settled, true); assert.equal(value, null); assert.equal(input.isConnected, false);
  input.files = [{ name: 'obsolete.json' }]; input.dispatch('change'); await operation; assert.equal(value, null);
});
test('file-picker selection returns the exact selected object and removes the input', async () => {
  const operation = pickFile('.json'), input = picker(), selected = { name: 'chosen.json' };
  input.files = [selected]; input.dispatch('change'); assert.equal(await operation, selected); assert.equal(input.isConnected, false); input.dispatch('cancel');
});
test('file-picker click failure rejects and removes the temporary input', async t => {
  const create = document.createElement.bind(document);
  t.mock.method(document, 'createElement', tag => { const node = create(tag); if (tag === 'input') node.click = () => { throw new Error('Picker could not open'); }; return node; });
  await assert.rejects(pickFile('.json'), /Picker could not open/); assert.equal(Boolean(picker()), false);
});
