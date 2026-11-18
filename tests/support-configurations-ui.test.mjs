import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installServiceDom, settle, deferred } from './fixtures/service-screen-dom.mjs';
import { createCatalogStore, emptyState } from '../app/catalog-store.js';

const document = installServiceDom({ after });
window.addEventListener = () => {};
window.removeEventListener = () => {};
// Add only the native form APIs used by Equipment to the shared small DOM fixture.
const createElement = document.createElement.bind(document);
document.createElement = tag => {
  const element = createElement(tag);
  if (tag === 'form') Object.defineProperty(element, 'elements', { get: () => Object.fromEntries(element.querySelectorAll('[name]').map(input => [input.name, input])) });
  if (tag === 'textarea') Object.defineProperty(element, 'value', { get() { return this._value ?? this.textContent; }, set(value) { this._value = String(value); } });
  return element;
};
const { createEquipmentScreen } = await import('../app/ui/screens/equipment.js');
const { gatherVenueReport, venuePrintable } = await import('../app/ui/workflows/m6-reports.js');
const { esc } = await import('../app/ui/dom.js');
const fixture = JSON.parse(fs.readFileSync(new URL('./contracts/support-configurations.json', import.meta.url), 'utf8'));
const key = 'deckchek.catalog.v1';

function durableCatalog() {
  const bytes = new Map();
  const storage = { getItem: key => bytes.get(key) ?? null, setItem: (key, value) => bytes.set(key, value) };
  const data = emptyState();
  data.catalog.supportConfiguration = [structuredClone(fixture.legacy), { ...fixture.input, id: 'support-global', deckPositionId: null, structureJson: '[]' }, { ...fixture.legacy, id: 'support-other', deckPositionId: 'position-other', name: 'Other booth support' }];
  data.catalog.setup = [structuredClone(fixture.setup), { ...fixture.setup, id: 'setup-b', name: 'Second rig', components: [] }];
  data.catalog.venue = [{ id: 'venue-a', name: 'Club A' }, { id: 'venue-b', name: 'Club B' }];
  data.catalog.asset = [{ id: 'asset-a', nickname: 'Left turntable' }, { id: 'asset-b', nickname: 'Replacement turntable' }];
  storage.setItem(key, JSON.stringify(data));
  return { storage, store: createCatalogStore({ invoke: null, storage }) };
}

function mount(t, options = {}) {
  const durable = durableCatalog(), store = options.store ?? durable.store;
  const host = document.createElement('section'); document.body.append(host);
  const screen = createEquipmentScreen(host, { store });
  t.after(() => { screen.onHide?.(); host.remove(); });
  return { host, screen, store, storage: durable.storage,
    choose(entity) { const tab = host.querySelector(`#eq-tab-${entity}`); assert.ok(tab, `tab ${entity}`); tab.dispatch('click'); },
    add() { host.querySelector('#eq-add').dispatch('click'); },
    open(name) { const button = host.querySelectorAll('.record-main').find(button => button.textContent.includes(name)); assert.ok(button, `record ${name}`); button.dispatch('click'); },
    field(name) { const input = host.querySelector('#eq-editor').querySelector(`[name="${name}"]`); assert.ok(input, `field ${name}`); return input; },
    submit() { host.querySelector('#eq-editor').querySelector('form').dispatch('submit'); },
    editor() { return host.querySelector('#eq-editor'); },
  };
}

test('production Equipment handlers save a reusable support, assign it, reload it and print current descriptive context', async t => {
  const s = mount(t); await settle(); s.choose('supportConfiguration'); s.add();
  s.field('name').value = 'Paver <img src=x onerror=alert(1)>';
  s.field('description').value = 'Isolation feet → paver → booth';
  s.field('approximateMassKg').value = '8.5'; s.field('coupledState').value = 'Operator-described decoupled'; s.field('notes').value = 'Recheck placement';
  s.submit(); await settle();
  const fresh = createCatalogStore({ invoke: null, storage: s.storage });
  const support = (await fresh.list('supportConfiguration')).find(row => row.name.startsWith('Paver <'));
  assert.ok(support); assert.equal(support.deckPositionId, null); assert.equal(support.structureJson, '[]');
  assert.equal(support.approximateMassKg, 8.5); assert.equal(Object.hasOwn(support, 'createdAt'), false);
  assert.equal(s.host.querySelectorAll('img').length, 0);
  assert.ok(!s.host.querySelectorAll('button').some(button => button.getAttribute('aria-label')?.startsWith('Delete ')), 'no support-delete UI');
  assert.match(s.host.textContent, /workspace JSON.*does not include.*support|support.*not included.*workspace JSON/i);
  s.choose('setup'); s.open('Club rig'); s.field('supportConfigurationId').value = support.id; s.submit(); await settle();
  const setup = (await fresh.list('setup')).find(row => row.id === 'setup-a');
  assert.equal(setup.supportConfigurationId, support.id);
  assert.equal(setup.boothId, fixture.setup.boothId); assert.equal(setup.deckPositionId, fixture.setup.deckPositionId);
  assert.equal(setup.components[0].settingsSnapshotId, 'settings-a');
  const report = await gatherVenueReport({ catalog: fresh, humStore: { list: async () => [] }, venueId: 'venue-a' });
  const html = venuePrintable.build(report, { esc });
  assert.match(html, /Current support description/); assert.match(html, /8\.5 kg/); assert.match(html, /&lt;img/); assert.ok(!html.includes('<img'));
});

test('ordinary setup and legacy support edits preserve hidden context and raw structure', async t => {
  const s = mount(t); await settle(); s.choose('setup'); s.open('Club rig');
  const options = s.field('supportConfigurationId').children.map(option => option.value);
  assert.ok(options.includes('support-legacy')); assert.ok(options.includes('support-global')); assert.ok(!options.includes('support-other'));
  s.field('name').value = 'Renamed club rig'; s.submit(); await settle();
  const saved = (await s.store.list('setup')).find(row => row.id === 'setup-a');
  for (const field of ['boothId', 'deckPositionId', 'supportConfigurationId']) assert.equal(saved[field], fixture.setup[field], field);
  assert.deepEqual(saved.components, fixture.setup.components);
  s.choose('supportConfiguration'); s.open('Isolation platform'); s.field('description').value = 'Rechecked description'; s.submit(); await settle();
  const support = (await s.store.list('supportConfiguration')).find(row => row.id === 'support-legacy');
  assert.equal(support.structureJson, fixture.legacy.structureJson); assert.equal(support.deckPositionId, fixture.legacy.deckPositionId);
});

test('support catalog read errors remain visible, block affected saves and can be retried', async t => {
  const durable = durableCatalog(); let fail = true;
  const s = mount(t, { store: { ...durable.store, list: entity => entity === 'supportConfiguration' && fail ? Promise.reject(new Error('Support storage unreadable')) : durable.store.list(entity) } });
  await settle(); s.choose('supportConfiguration');
  assert.match(s.host.textContent, /Support storage unreadable/); assert.ok(!s.host.textContent.includes('No support descriptions yet'));
  assert.equal(s.host.querySelector('#eq-add').disabled, true);
  s.choose('setup'); s.open('Club rig'); assert.equal(s.editor().querySelector('[type="submit"]').disabled, true);
  fail = false; const retry = s.host.querySelector('#eq-support-retry'); assert.ok(retry); retry.dispatch('click'); await settle();
  assert.ok(!s.host.textContent.includes('Support storage unreadable')); assert.equal(s.editor().querySelector('[type="submit"]').disabled, false);
});

test('a quota failure is an error and does not persist a pretend support', async t => {
  const s = mount(t); await settle(); s.choose('supportConfiguration'); s.add(); s.field('name').value = 'Unsaved support';
  const before = s.storage.getItem(key); s.storage.setItem = () => { throw new Error('Quota exceeded'); };
  s.submit(); await settle(); assert.match(s.editor().textContent, /Could not save.*Quota exceeded/);
  assert.equal(s.storage.getItem(key), before); assert.equal(s.editor().querySelector('[type="submit"]').disabled, false);
});

test('pending saves keep their original draft and cannot replace a newer entity or record, on success or error', async t => {
  for (const outcome of ['success', 'failure']) for (const target of ['supportConfiguration', 'setup']) {
    const durable = durableCatalog(), gate = deferred(), calls = [];
    const s = mount(t, { store: { ...durable.store, upsert: async (entity, record) => { calls.push({ entity, record }); await gate.promise; return durable.store.upsert(entity, record); } } });
    await settle(); s.choose('setup'); s.open('Club rig'); s.field('name').value = 'Original draft'; s.submit(); s.submit();
    s.field('name').value = 'Changed after submit';
    assert.equal(calls.length, 1); assert.equal(calls[0].entity, 'setup'); assert.equal(calls[0].record.name, 'Original draft');
    assert.equal(calls[0].record.components[0].settingsSnapshotId, 'settings-a');
    s.choose(target); if (target === 'setup') s.open('Second rig'); else s.add();
    s.field('name').value = 'Newer unsaved form';
    if (outcome === 'success') gate.resolve(); else gate.reject(new Error('Old save failed'));
    await settle(); assert.equal(s.field('name').value, 'Newer unsaved form'); assert.ok(!s.editor().textContent.includes('Old save failed'));
  }
});

test('late initial loads and hidden-screen callbacks cannot replace a newer form', async t => {
  const durable = durableCatalog(), first = deferred(); let supportLoads = 0;
  const s = mount(t, { store: { ...durable.store, list: entity => entity === 'supportConfiguration' && ++supportLoads === 1 ? first.promise : durable.store.list(entity) } });
  s.screen.onShow(); await settle(); s.choose('supportConfiguration'); s.add(); s.field('name').value = 'New form';
  first.resolve([{ ...fixture.input, name: 'Old load' }]); await settle();
  assert.equal(s.field('name').value, 'New form'); assert.ok(!s.host.textContent.includes('Old load'));
  const gate = deferred(), other = mount(t, { store: { ...durable.store, upsert: () => gate.promise } });
  await settle(); other.choose('supportConfiguration'); other.add(); other.field('name').value = 'Hidden form'; other.submit();
  other.screen.onHide(); const before = other.host.textContent; gate.reject(new Error('Late hidden save')); await settle();
  assert.equal(other.host.textContent, before);
});

test('a persisted save followed by a list failure is disclosed as saved and a retry updates the same support', async t => {
  const durable = durableCatalog(); let failReload = false;
  const store = { ...durable.store,
    upsert: async (entity, record) => { const saved = await durable.store.upsert(entity, record); failReload = true; return saved; },
    list: entity => entity === 'supportConfiguration' && failReload ? Promise.reject(new Error('Reload unavailable')) : durable.store.list(entity),
  };
  const s = mount(t, { store }); await settle(); s.choose('supportConfiguration'); s.add(); s.field('name').value = 'Saved once'; s.submit(); await settle();
  assert.match(s.editor().textContent, /Saved.*could not.*refresh|Saved.*refresh.*failed/i); assert.match(s.editor().textContent, /Reload unavailable/);
  s.field('name').value = 'Same saved support'; s.submit(); await settle();
  const rows = await durable.store.list('supportConfiguration'); assert.equal(rows.filter(row => /Saved once|Same saved support/.test(row.name)).length, 1);
  assert.ok(rows.some(row => row.name === 'Same saved support'));
});

test('a late save reload cannot overwrite a newer form, even when that reload fails', async t => {
  for (const fail of [false, true]) {
    const durable = durableCatalog(), reload = deferred(); let loadingSaved = false;
    const store = { ...durable.store,
      upsert: async (entity, record) => { const saved = await durable.store.upsert(entity, record); loadingSaved = true; return saved; },
      list: entity => entity === 'supportConfiguration' && loadingSaved ? reload.promise : durable.store.list(entity),
    };
    const s = mount(t, { store }); await settle(); s.choose('supportConfiguration'); s.add(); s.field('name').value = 'Committed support'; s.submit(); await settle();
    s.choose('setup'); s.open('Second rig'); s.field('name').value = 'Newer setup draft';
    if (fail) reload.reject(new Error('Stale refresh failed')); else reload.resolve(await durable.store.list('supportConfiguration'));
    await settle(); assert.equal(s.field('name').value, 'Newer setup draft'); assert.ok(!s.editor().textContent.includes('Stale refresh failed'));
  }
});

test('a support save completed while hidden can be reopened and retried without creating a second description', async t => {
  const durable = durableCatalog(), response = deferred(); let first = true;
  const store = { ...durable.store, upsert: async (entity, record) => {
    const saved = await durable.store.upsert(entity, record);
    if (first) { first = false; await response.promise; }
    return saved;
  } };
  const s = mount(t, { store }); await settle(); s.choose('supportConfiguration'); s.add(); s.field('name').value = 'One description'; s.submit();
  s.screen.onHide(); response.resolve(); await settle(); s.screen.onShow(); await settle();
  assert.equal(s.editor().querySelector('[type="submit"]').disabled, false);
  s.field('name').value = 'Same description renamed'; s.submit(); await settle();
  const rows = await durable.store.list('supportConfiguration');
  assert.equal(rows.filter(row => /One description|Same description renamed/.test(row.name)).length, 1);
});

test('support correction: changing a component asset clears only its old settings association', async t => {
  const s = mount(t); await settle(); s.choose('setup'); s.open('Club rig');
  s.field('assetId').value = 'asset-b'; s.submit(); await settle();
  const saved = (await s.store.list('setup')).find(row => row.id === 'setup-a');
  assert.deepEqual(saved.components, [{ ...fixture.setup.components[0], assetId: 'asset-b', settingsSnapshotId: null }]);
  for (const field of ['venueId', 'boothId', 'deckPositionId', 'supportConfigurationId', 'notes']) assert.equal(saved[field], fixture.setup[field], field);
});

test('support correction: bound setup venue changes fail visibly without changing stored context', async t => {
  for (const venue of ['venue-b', '']) {
    const s = mount(t); await settle(); s.choose('setup'); s.open('Club rig');
    const before = s.storage.getItem(key); s.field('venueId').value = venue; s.submit(); await settle();
    assert.match(s.editor().textContent, /venue.*(booth|position|bound)/i); assert.equal(s.storage.getItem(key), before);
    assert.equal(s.field('venueId').value, venue, 'the rejected draft is not silently relocated or cleared');
  }
});

test('support correction: a reusable unbound setup can still change venue and retain its settings snapshot', async t => {
  const durable = durableCatalog(), state = JSON.parse(durable.storage.getItem(key));
  Object.assign(state.catalog.setup[0], { boothId: null, deckPositionId: null, supportConfigurationId: 'support-global' });
  durable.storage.setItem(key, JSON.stringify(state));
  const s = mount(t, { store: durable.store }); await settle(); s.choose('setup'); s.open('Club rig');
  s.field('venueId').value = 'venue-b'; s.submit(); await settle();
  const saved = (await durable.store.list('setup')).find(row => row.id === 'setup-a');
  assert.equal(saved.venueId, 'venue-b'); assert.equal(saved.boothId, null); assert.equal(saved.deckPositionId, null);
  assert.equal(saved.supportConfigurationId, 'support-global'); assert.equal(saved.components[0].settingsSnapshotId, 'settings-a');
});
