// Shared device-library state for the UI: loaded profiles, their catalog
// products (after sync), the user's units (assets) and saved test results.

import { loadProfiles } from '../../devices/library.js';
import { completePlan } from '../../devices/test-plan.js';
import { store, emit } from '../state.js';
import { mediaRefFromParams } from '../media-picker.js';

export const lib = {
  ready: false, loading: false, error: null, syncError: null,
  profiles: [], problems: [], warnings: {},
  products: new Map(), // profileId -> productId
  assets: [], results: [],
};

let loading = null;
let cacheSequence = 0, publishedSequence = 0;

// Acknowledged local writes own newer cache state than any read already in flight.
const markCacheMutation = () => { publishedSequence = ++cacheSequence; };

/** Load profiles and sync them into the catalog once per session (idempotent; safe to call repeatedly). */
export function ensureLibrary({ force = false } = {}) {
  if (loading && !force) return loading;
  lib.loading = true;
  loading = (async () => {
    try {
      const { profiles, problems, warnings } = await loadProfiles();
      // SPEC-34: screens see the completed plan (baseline tests for uncovered capabilities);
      // the catalog sync keeps receiving the researched profiles unchanged.
      lib.profiles = profiles.map(completePlan); lib.problems = problems; lib.warnings = warnings;
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

/** Reload one complete snapshot; return whether this request published it. */
export async function refreshUnits({ isCurrent = () => true } = {}) {
  const request = ++cacheSequence;
  const canPublish = () => request >= publishedSequence && isCurrent();
  let assets, results;
  try { assets = await store.list('asset'); } catch { assets = []; }
  if (!canPublish()) return false;
  try { results = await store.listDeviceTestResults(null); } catch { results = []; }
  if (!canPublish()) return false;
  // A newer completed read or acknowledged write owns the shared cache. A retired read that never
  // published must not discard an independently current default consumer.
  lib.assets = assets;
  lib.results = results;
  publishedSequence = request;
  return true;
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
  markCacheMutation();
  emit('device-results', row);
  return row;
}

export async function addUnit(profile) {
  const productId = lib.products.get(profile.id);
  if (!productId) throw new Error('This device is not in the catalog yet (database sync failed).');
  const n = unitsFor(profile.id).length + 1;
  const asset = await store.upsert('asset', { productId, nickname: `My ${profile.model}${n > 1 ? ` (${n})` : ''}`, notes: 'Added from the DeckChek device library.' });
  lib.assets = [...lib.assets, asset];
  markCacheMutation();
  emit('catalog');
  return asset;
}

/** Cache an acknowledged profile assignment; persistence and validation belong to its caller. */
export function cacheAssignedUnit(result) {
  lib.assets = lib.assets.map(row => row.id === result.assetId ? { ...row, productId: result.productId, updatedAt: result.updatedAt } : row);
  markCacheMutation();
}
