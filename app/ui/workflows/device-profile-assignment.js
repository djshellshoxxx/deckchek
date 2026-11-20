import { h } from '../dom.js';

/** Explicit, view-owned assignment of a saved unit to the displayed device. */
export function createDeviceProfileAssignment(host, { profile, productId, assets, assign, onAssigned, onCancel }) {
  let active = true, saving = false;
  const candidates = structuredClone(assets.filter(asset => !asset.isDeleted && asset.productId !== productId));
  const select = h('select', { id: 'profile-unit', required: true },
    h('option', { value: '', text: 'Choose a saved unit…' }),
    ...candidates.map(asset => h('option', { value: asset.id, text: `${asset.nickname}${asset.serialNumber ? ` · ${asset.serialNumber}` : ''}` })));
  const confirmed = h('input', { type: 'checkbox', id: 'profile-unit-confirm' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary', disabled: true, text: 'Use this device profile' });
  const cancel = h('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel', onclick: () => {
    if (!active || saving) return;
    active = false; onCancel?.();
  } });
  const status = h('p', { role: 'status', id: 'profile-unit-status' });
  const form = h('form', {},
    h('h2', { class: 'card-title', text: 'Use an existing unit' }),
    h('p', { text: `Choose the unit that matches ${profile.manufacturer} ${profile.model}. Its product association will change; its saved results and learned MIDI maps keep their original profile identity.` }),
    h('label', { for: 'profile-unit', text: 'Saved unit' }), select,
    h('label', { for: 'profile-unit-confirm' }, confirmed, ' I checked the model and revision on this unit.'),
    status, h('div', { class: 'actions' }, submit, cancel));
  host.replaceChildren(form);
  const current = () => active && host.isConnected && !host.hidden;
  const selected = () => candidates.find(asset => asset.id === select.value);
  const update = () => { submit.disabled = saving || !selected() || !confirmed.checked || !productId; };
  select.addEventListener('change', () => { confirmed.checked = false; status.textContent = ''; update(); });
  confirmed.addEventListener('change', update);
  if (!candidates.length) status.textContent = 'There are no other saved units. Add your equipment or import a catalog first.';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!current() || saving || !confirmed.checked || !selected() || !productId) return;
    const asset = selected();
    const request = { assetId: asset.id, profileId: profile.id, productId, expectedProductId: asset.productId ?? null };
    saving = true; select.disabled = true; confirmed.disabled = true; cancel.disabled = true; update();
    status.textContent = 'Saving the device profile…';
    try {
      const result = await assign(request);
      if (!current()) return;
      active = false;
      onAssigned?.(result, asset);
    } catch (error) {
      if (current()) status.textContent = `Could not assign the unit: ${error?.message || error}`;
    } finally {
      saving = false;
      if (current()) { select.disabled = false; confirmed.disabled = false; cancel.disabled = false; update(); }
    }
  });
  select.focus();
  return { dispose() { active = false; } };
}
