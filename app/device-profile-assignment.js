// Explicit unit-to-profile assignment. Catalog import never guesses this link.
const fields = ['assetId', 'profileId', 'productId', 'expectedProductId'];
const encoder = new TextEncoder();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.length > 0 && encoder.encode(value).length <= 4096;

export function profileAssignmentRequest(value) {
  if (!object(value) || Object.keys(value).length !== fields.length
    || fields.some(key => !Object.hasOwn(value, key))
    || !['assetId', 'profileId', 'productId'].every(key => id(value[key]))
    || !(value.expectedProductId === null || id(value.expectedProductId))) {
    throw new Error('Choose a saved unit and device profile before assigning.');
  }
  return Object.fromEntries(fields.map(key => [key, value[key]]));
}

/** Mutates only the selected asset's product and update time after all checks. */
export function assignDeviceProfileLocal(state, input, now = new Date().toISOString()) {
  const request = profileAssignmentRequest(input);
  const { assetId, profileId, productId, expectedProductId } = request;
  if (!object(state.deviceProfiles) || !Object.hasOwn(state.deviceProfiles, profileId)
    || state.deviceProfiles[profileId]?.productId !== productId
    || !state.catalog.product.some(row => row.id === productId)) {
    throw new Error('The device profile changed or is unavailable. Reopen the device page.');
  }
  const asset = state.catalog.asset.find(row => row.id === assetId);
  if (!asset || asset.isDeleted) throw new Error('The selected unit is unavailable. Refresh the equipment list.');
  const current = asset.productId ?? null;
  if (current !== null && !id(current)) throw new Error('The saved unit has an invalid product association.');
  // A lost acknowledgement can be retried without changing the record again.
  if (current === productId) return { assetId, profileId, productId, changed: false, updatedAt: asset.updatedAt ?? null };
  if (current !== expectedProductId) throw new Error('The unit product changed. Refresh and confirm the unit again.');
  asset.productId = productId;
  asset.updatedAt = now;
  return { assetId, profileId, productId, changed: true, updatedAt: now };
}
