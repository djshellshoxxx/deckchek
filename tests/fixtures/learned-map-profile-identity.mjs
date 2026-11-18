// Real isolated browser catalog, including a saved map that survives an asset Product change.
import assert from 'node:assert/strict';
import { createCatalogStore, CATALOG_STORAGE_KEY } from '../../app/catalog-store.js';

export const ASSET_ID = '00000000-0000-4000-8000-0000000000aa';
export const A = { id: 'profile-a', manufacturer: 'Probe', model: 'Controller A', category: 'controller', tests: [], midi: { mapSource: 'learn', controls: [] } };
export const B = {
  id: 'profile-b', manufacturer: 'Probe', model: 'Controller B', category: 'controller', tests: [],
  midi: { mapSource: 'published', controls: [
    { id: 'play', label: 'Current Play', type: 'button', group: 'Current', message: { kind: 'note', channel: 1, number: 42 } },
    { id: 'current-only', label: 'Current level', type: 'fader', group: 'Current', message: { kind: 'cc', channel: 1, number: 7 } },
  ] },
};
export const STORED_MAP = {
  mapSource: 'learned', complete: false, port: 'Original controller', preservedExtension: { note: 'Keep the original saved map exactly', values: [0, null, ''] },
  controls: [
    { id: 'play', label: 'Old Play', type: 'button', group: 'Old', message: { kind: 'note', channel: 1, number: 11 } },
    { id: 'old-only', label: 'Old-only control', type: 'knob', group: 'Old', message: { kind: 'cc', channel: 1, number: 13 } },
  ],
};

export async function seed({ identity = 'different', profile = B } = {}) {
  const records = new Map();
  const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, String(value)) };
  const catalog = createCatalogStore({ invoke: null, storage });
  const profiles = [structuredClone(A), structuredClone(profile)];
  const synced = await catalog.syncDeviceProfiles(profiles, { createAssets: false });
  const products = new Map(synced.map(row => [row.profileId, row.productId]));
  const initialProfile = identity === 'different' ? A : profile;
  let asset = await catalog.upsert('asset', { id: ASSET_ID, productId: products.get(initialProfile.id), nickname: 'Reassigned controller' });
  const profileId = identity === 'different' ? A.id : identity === 'same' ? profile.id : identity === 'null' ? null : undefined;
  await catalog.saveMidiMap(asset.id, profileId, structuredClone(STORED_MAP));
  const beforeProductEdit = JSON.stringify(await catalog.getMidiMap(asset.id));
  if (identity === 'different') asset = await catalog.upsert('asset', { ...asset, productId: products.get(profile.id) });
  assert.equal(JSON.stringify(await catalog.getMidiMap(asset.id)), beforeProductEdit, 'changing an asset product preserves the saved map');
  const row = await catalog.getMidiMap(asset.id);
  const beforeBytes = storage.getItem(CATALOG_STORAGE_KEY), beforeRow = JSON.stringify(row);
  const assertPreserved = () => {
    assert.equal(storage.getItem(CATALOG_STORAGE_KEY), beforeBytes, 'automatic consumption must preserve every saved catalog byte');
    assert.equal(JSON.stringify(row), beforeRow, 'automatic consumption must not mutate the input saved-map record');
  };
  return { catalog, storage, profiles, products, profile: structuredClone(profile), asset, row, beforeBytes, beforeRow, assertPreserved };
}
