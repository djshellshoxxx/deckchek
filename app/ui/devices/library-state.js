// Shared device-library state for the UI: loaded profiles, their catalog
// products (after sync), the user's units (assets) and saved test results.

import { loadProfiles } from '../../devices/library.js';
import { store, emit } from '../state.js';
import { mediaRefFromParams } from '../media-picker.js';

export const lib = {
  ready: false, loading: false, error: null, syncError: null,
  profiles: [], problems: [], warnings: {},
  products: new Map(), // profileId -> productId
  assets: [], results: [],
};

let loading = null;

/** Load profiles and sync them into the catalog once per session (idempotent; safe to call repeatedly). */
export function ensureLibrary({ force = false } = {}) {
  if (loading && !force) return loading;
  lib.loading = true;
  loading = (async () => {
    try {
      const { profiles, problems, warnings } = await loadProfiles();
      lib.profiles = profiles; lib.problems = problems; lib.warnings = warnings;
      try {
        const synced = await store.syncDeviceProfiles(profiles);
        lib.products = new Map(synced.map(s => [s.profileId, s.productId]));
        lib.syncError = null;
        const created = synced.filter(s => s.assetId).length;
        if (created) emit('catalog');
        lib.created = created;
      } catch (error) {
        lib.syncError = String(error?.message || error);
      }
      await refreshUnits();
      lib.error = null;
    } catch (error) {
      lib.error = String(error?.message || error);
    } finally {
      lib.loading = false;
      lib.ready = true;
      emit('devices');
    }
    return lib;
  })();
  return loading;
}

/** Reload assets and results (after edits or a saved result). */
export async function refreshUnits() {
  try { lib.assets = await store.list('asset'); } catch { lib.assets = []; }
  try { lib.results = await store.listDeviceTestResults(null); } catch { lib.results = []; }
}

export const profileById = id => lib.profiles.find(p => p.id === id) || null;
export function unitsFor(profileId) {
  const productId = lib.products.get(profileId);
  return productId ? lib.assets.filter(a => a.productId === productId) : [];
}
export const resultsFor = assetId => lib.results.filter(r => r.assetId === assetId);

/** Save a device test result and refresh caches; returns the stored row. `params` are the workflow's collected form values (carry the chosen test medium). */
export async function saveResult({ profile, test, assetId, status, detail, sessionId = null, params = null }) {
  if (!assetId) throw new Error('No unit selected for this device.');
  const row = await store.saveDeviceTestResult({ assetId, profileId: profile.id, testId: test.id, sessionId, status, detail, ...mediaRefFromParams(params) });
  lib.results = [row, ...lib.results.filter(r => r.id !== row.id)];
  emit('device-results', row);
  return row;
}

export async function addUnit(profile) {
  const productId = lib.products.get(profile.id);
  if (!productId) throw new Error('This device is not in the catalog yet (database sync failed).');
  const n = unitsFor(profile.id).length + 1;
  const asset = await store.upsert('asset', { productId, nickname: `My ${profile.model}${n > 1 ? ` (${n})` : ''}`, notes: 'Added from the DeckChek device library.' });
  lib.assets = [...lib.assets, asset];
  emit('catalog');
  return asset;
}
