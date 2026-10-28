// Service job workflow panels (FS-22): the new-job intake form and the four step panels of a job
// (Intake details and photos, Before/After tests through the device test runner in job mode, Work log, Sheet).
// The screen shell, list and stepper live in ui/screens/service.js; numbers and rules in ../../service.js.
// Every user string goes through textContent (h(..., {text})) or esc(); customer details are shown on screen
// (they stay local) and reach the printed sheet only when "Include customer details" is ticked.

import { h, esc, isNative } from '../dom.js';
import { icon, chip } from '../icons.js';
import { toast, announce } from '../live.js';
import { settings, setSetting, emit } from '../state.js';
import { isEnabled } from '../../features.js';
import { lib, ensureLibrary, refreshUnits, profileById } from '../devices/library-state.js';
import { dispatchFor } from '../../devices/dispatch.js';
import { groupTestsByCategory } from '../../devices/library.js';
import {
  LIMITS, PHOTO_LIMIT, PHOTO_STAGES, statusLabel, effectiveLog, jobTotals, newUnitNickname, nicknameMentionsCustomer,
  renderJobSheetHtml, jobSheetPrintData, fmtNum, fmtQty, fmtSigned, fmtMoney, when, ROW_STATUS_TEXT, CHANGE_TEXT,
} from '../../service.js';

export const ACCESSORY_CHOICES = Object.freeze(['Power cable', 'Dust cover', 'Slipmat', 'Headshell / cartridge', 'Counterweight', '45 rpm adapter', 'USB cable', 'Manual', 'Flight case']);
const RESULT_WORD = { pass: 'PASS', fail: 'FAIL', unknown: 'REVIEW', skipped: 'SKIPPED', completed: 'SAVED' };
const RESULT_CHIP = { pass: 'pass', fail: 'fail', unknown: 'review', skipped: 'info', completed: 'info' };
const ROW_CHIP = { improved: 'pass', worse: 'fail', unchanged: 'info', changed: 'review', notComparable: 'warn', missingAfter: 'warn', missingBefore: 'info' };
const friendly = e => (typeof e === 'string' ? e : e?.message || 'Something went wrong.');
const clip = (s, n) => String(s ?? '').slice(0, n);

/** Field with a visible label. `control` is an element; `help` optional. */
function field(label, control, { help = '', required = false } = {}) {
  const id = control.id || `svc-f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  const wrap = h('div', { class: 'field svc-field' }, h('label', { for: id }, label, required ? h('span', { class: 'svc-req', 'aria-hidden': 'true', text: ' *' }) : null), control);
  if (help) { const hid = `${id}-help`; control.setAttribute('aria-describedby', hid); wrap.append(h('p', { class: 'field-help', id: hid, text: help })); }
  return wrap;
}
const input = (attrs = {}) => h('input', { type: 'text', autocomplete: 'off', ...attrs });
const textarea = (attrs = {}) => h('textarea', { rows: 3, ...attrs });
const errorBox = id => h('p', { class: 'svc-error', id, role: 'alert', hidden: true });
function showError(box, msg) { box.textContent = msg || ''; box.hidden = !msg; if (msg) announce(msg, { assertive: true }); }

/**
 * True when a field under `root` holds input that has not been saved: changed text, chosen files and, with `choices`,
 * changed checkboxes, radios and selects. Fields marked data-svc-no-dirty (saved as they change) are ignored.
 */
export function hasUnsavedInput(root, { choices = false } = {}) {
  for (const el of root.querySelectorAll('input, textarea, select')) {
    if (el.disabled || el.hasAttribute('data-svc-no-dirty')) continue;
    if (el.tagName === 'SELECT') {
      if (choices && el.selectedIndex !== Math.max(0, [...el.options].findIndex(o => o.defaultSelected))) return true;
      continue;
    }
    const type = (el.type || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') { if (choices && el.checked !== el.defaultChecked) return true; continue; }
    if (type === 'file') { if (el.files?.length) return true; continue; }
    if (['button', 'submit', 'reset', 'hidden', 'range'].includes(type)) continue;
    if (el.value !== el.defaultValue) return true;
  }
  return false;
}

export function resultChip(status) {
  return chip(RESULT_CHIP[status] || 'info', RESULT_WORD[status] || String(status || '').toUpperCase(), { size: 14 });
}

// ------------------------------------------------------------------ new job (intake form)

/**
 * Renders the new-job form into `host`. preset: {assetId}. Resolves nothing; calls onCreated(job) after the job and its
 * photos are saved, onCancel() on Cancel. Returns {submit, focus}.
 */
export function renderIntakeForm(host, { api, preset = {}, onCreated, onCancel }) {
  const err = errorBox('svc-new-error');
  const form = h('form', { class: 'card svc-form', id: 'svc-new-form', novalidate: true, 'aria-labelledby': 'svc-new-title' });
  form.append(h('h2', { class: 'card-title', id: 'svc-new-title', text: 'New job' }), h('p', { class: 'muted small', text: 'Customer details stay on this computer. They are printed on the job sheet only when you choose to include them.' }));

  // customer
  const custMode = { value: 'new' };
  const name = input({ id: 'svc-cust-name', maxlength: LIMITS.name, required: true, autocomplete: 'off' });
  const phone = input({ id: 'svc-cust-phone', type: 'tel', maxlength: LIMITS.phone, autocomplete: 'off' });
  const email = input({ id: 'svc-cust-email', type: 'email', maxlength: LIMITS.email, autocomplete: 'off' });
  const custSearch = input({ id: 'svc-cust-search', type: 'search', maxlength: LIMITS.query, placeholder: 'Name, phone or email' });
  const custSelect = h('select', { id: 'svc-cust-existing' }, h('option', { value: '', text: 'Type to search customers' }));
  const newCust = h('div', { class: 'svc-grid' }, field('Customer name', name, { required: true }), field('Phone', phone), field('Email', email));
  const oldCust = h('div', { class: 'svc-grid', hidden: true }, field('Find customer', custSearch), field('Customer', custSelect));
  const modeNew = h('input', { type: 'radio', name: 'svc-cust-mode', id: 'svc-cust-mode-new', value: 'new', checked: true });
  const modeOld = h('input', { type: 'radio', name: 'svc-cust-mode', id: 'svc-cust-mode-old', value: 'existing' });
  const setMode = v => { custMode.value = v; newCust.hidden = v !== 'new'; oldCust.hidden = v === 'new'; };
  modeNew.addEventListener('change', () => setMode('new'));
  modeOld.addEventListener('change', () => { setMode('existing'); loadCustomers(); });
  let searchTimer = null;
  custSearch.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadCustomers, 200); });
  async function loadCustomers() {
    try {
      const rows = await api.customers(custSearch.value.trim() || null, 50);
      custSelect.replaceChildren(h('option', { value: '', text: rows.length ? 'Choose a customer' : 'No customers found' }), ...rows.map(c => h('option', { value: c.id, text: `${c.name}${c.phone ? ` · ${c.phone}` : ''}` })));
    } catch (e) { showError(err, `Could not load customers: ${friendly(e)}`); }
  }
  form.append(h('fieldset', { class: 'svc-fieldset' }, h('legend', { text: 'Customer' }),
    h('div', { class: 'svc-radios', role: 'radiogroup', 'aria-label': 'Customer' }, h('label', { class: 'svc-radio' }, modeNew, ' New customer'), h('label', { class: 'svc-radio' }, modeOld, ' Existing customer')),
    newCust, oldCust));

  // unit
  const unitSelect = h('select', { id: 'svc-unit', required: true });
  const profileSelect = h('select', { id: 'svc-unit-profile' });
  const serial = input({ id: 'svc-unit-serial', maxlength: LIMITS.serial });
  const nickname = input({ id: 'svc-unit-nickname', maxlength: LIMITS.nickname });
  const newUnit = h('div', { class: 'svc-grid', hidden: true }, field('Model', profileSelect, { help: 'Units with a device profile get its test plan; others use the Quick diagnostic.' }), field('Serial number', serial), field('Unit name', nickname, { help: 'Shown in Equipment and exports: do not use the customer’s name.' }));
  const unitInfo = h('p', { class: 'muted small', id: 'svc-unit-info' });
  let nickTouched = false;
  nickname.addEventListener('input', () => { nickTouched = true; });
  const autoNick = () => { if (!nickTouched) nickname.value = newUnitNickname(profileById(profileSelect.value)?.model || 'Service unit', serial.value); };
  profileSelect.addEventListener('change', autoNick);
  serial.addEventListener('input', autoNick);
  function fillUnits() {
    const assets = (lib.assets || []).filter(a => !a.isDeleted);
    unitSelect.replaceChildren(h('option', { value: '', text: 'Choose a unit' }), ...assets.map(a => h('option', { value: a.id, text: `${a.nickname}${a.serialNumber ? ` · S/N ${a.serialNumber}` : ''}`, selected: a.id === preset.assetId ? true : null })), h('option', { value: '__new', text: 'New unit…' }));
    profileSelect.replaceChildren(h('option', { value: '', text: 'Other (no device profile)' }), ...lib.profiles.map(p => h('option', { value: p.id, text: `${p.manufacturer} ${p.model}` })));
    syncUnit();
  }
  function syncUnit() {
    newUnit.hidden = unitSelect.value !== '__new';
    const a = (lib.assets || []).find(x => x.id === unitSelect.value);
    unitInfo.textContent = a ? (a.serialNumber ? `Serial number ${a.serialNumber}` : 'No serial number recorded for this unit.') : '';
    if (!newUnit.hidden) autoNick();
  }
  unitSelect.addEventListener('change', syncUnit);
  form.append(h('fieldset', { class: 'svc-fieldset' }, h('legend', { text: 'Unit' }), field('Unit', unitSelect, { required: true }), unitInfo, newUnit));
  ensureLibrary().then(refreshUnits).then(fillUnits).catch(() => fillUnits());
  fillUnits();

  // fault, accessories, condition, photos
  const fault = textarea({ id: 'svc-fault', maxlength: LIMITS.fault, rows: 4, required: true });
  const accBoxes = ACCESSORY_CHOICES.map((a, i) => h('label', { class: 'svc-check' }, h('input', { type: 'checkbox', value: a, id: `svc-acc-${i}` }), ` ${a}`));
  const accOther = input({ id: 'svc-acc-other', maxlength: LIMITS.accessory, placeholder: 'Other item' });
  const condition = textarea({ id: 'svc-condition', maxlength: LIMITS.condition });
  const photos = h('input', { type: 'file', id: 'svc-photos', accept: 'image/jpeg,image/png,image/webp', multiple: true });
  const photoCaption = input({ id: 'svc-photo-caption', maxlength: 200, placeholder: 'Caption for these photos' });
  form.append(
    field('Reported fault', fault, { required: true }),
    h('fieldset', { class: 'svc-fieldset' }, h('legend', { text: 'Accessories received' }), h('div', { class: 'svc-checks' }, ...accBoxes), field('Other accessory', accOther)),
    field('Condition on arrival', condition),
    h('fieldset', { class: 'svc-fieldset' }, h('legend', { text: `Photos (up to ${PHOTO_LIMIT})` }), field('Photos', photos, { help: 'Photos are re-encoded on this computer, which removes location (GPS) and other metadata.' }), field('Caption', photoCaption)),
    err,
    h('div', { class: 'svc-actions' },
      h('button', { type: 'submit', class: 'btn btn-primary', id: 'svc-new-save', html: `${icon('check', { size: 16 })}<span>Save job</span>` }),
      h('button', { type: 'button', class: 'btn btn-ghost', id: 'svc-new-cancel', text: 'Cancel', onclick: () => onCancel?.() })));

  let busy = false;
  async function submit() {
    if (busy) return;
    showError(err, '');
    const accessories = [...accBoxes.map(l => l.querySelector('input')).filter(b => b.checked).map(b => b.value), ...(accOther.value.trim() ? [accOther.value.trim()] : [])];
    const payload = { reportedFault: fault.value.trim(), accessories, arrivalCondition: condition.value.trim() || null };
    if (custMode.value === 'new') {
      if (!name.value.trim()) { showError(err, 'Enter the customer’s name.'); name.focus(); return; }
      payload.customer = { name: name.value.trim(), phone: phone.value.trim() || null, email: email.value.trim() || null };
    } else {
      if (!custSelect.value) { showError(err, 'Choose an existing customer.'); custSearch.focus(); return; }
      payload.customerId = custSelect.value;
    }
    if (!unitSelect.value) { showError(err, 'Choose the unit, or New unit.'); unitSelect.focus(); return; }
    if (unitSelect.value === '__new') {
      const nick = nickname.value.trim() || newUnitNickname(profileById(profileSelect.value)?.model, serial.value);
      if (payload.customer && nicknameMentionsCustomer(nick, payload.customer.name)) { showError(err, 'The unit name must not contain the customer’s name (unit names appear in exports).'); nickname.focus(); return; }
      payload.newUnit = { productId: profileSelect.value ? lib.products.get(profileSelect.value) || null : null, nickname: nick, serialNumber: serial.value.trim() || null };
    } else payload.assetId = unitSelect.value;
    if (!payload.reportedFault) { showError(err, 'Describe the reported fault.'); fault.focus(); return; }
    const files = [...(photos.files || [])];
    if (files.length > PHOTO_LIMIT) { showError(err, `Choose at most ${PHOTO_LIMIT} photos.`); photos.focus(); return; }
    busy = true;
    const save = form.querySelector('#svc-new-save');
    save.disabled = true; save.setAttribute('aria-busy', 'true');
    try {
      const job = await api.create(payload);
      if (payload.newUnit) { emit('catalog'); refreshUnits().catch(() => {}); }
      const failed = await attachFiles(api, job.id, files, { caption: photoCaption.value.trim(), stage: 'intake' });
      if (failed) toast(`${failed} photo${failed === 1 ? '' : 's'} could not be added. Add them again from the Intake step.`, { type: 'warn' });
      announce(`Job ${job.jobNumber} created`);
      onCreated?.(job);
    } catch (e) {
      showError(err, `The job was not saved: ${friendly(e)}`);
    } finally {
      busy = false; save.disabled = false; save.removeAttribute('aria-busy');
    }
  }
  form.addEventListener('submit', e => { e.preventDefault(); submit(); });
  host.replaceChildren(form);
  return { submit, focus: () => (custMode.value === 'new' ? name : custSearch).focus(), isDirty: () => hasUnsavedInput(form, { choices: true }) };
}

/** Prepares (re-encodes, strips metadata) and attaches files; resolves to the number that failed. */
export async function attachFiles(api, jobId, files, { caption = '', stage = 'intake' } = {}) {
  if (!files.length) return 0;
  const { preparePhoto, bytesToBase64 } = await import('../../photo-store.js');
  let failed = 0;
  for (const f of files.slice(0, PHOTO_LIMIT)) {
    try {
      const p = await preparePhoto(f);
      await api.attachPhoto(jobId, { bytesB64: bytesToBase64(p.bytes), caption: clip(caption, 200) || null, stage });
    } catch (e) { failed++; console.warn('Photo not attached:', friendly(e)); }
  }
  return failed;
}

// ------------------------------------------------------------------ step: intake (details, customer, photos)

export function renderIntakeStep(host, ctx) {
  const { detail, api, readOnly } = ctx;
  const job = detail.job, cust = detail.customer, asset = detail.asset;
  const wrap = h('div', { class: 'svc-step-body' });
  const err = errorBox('svc-intake-error');
  const dl = (rows) => h('dl', { class: 'svc-kv' }, ...rows.filter(([, v]) => v != null && v !== '').flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));

  const custCard = h('section', { class: 'card svc-card', 'aria-labelledby': 'svc-cust-title' }, h('h3', { class: 'card-title', id: 'svc-cust-title', text: 'Customer' }),
    cust ? dl([['Name', cust.name], ['Phone', cust.phone], ['Email', cust.email], ['Notes', cust.notes]]) : h('p', { class: 'muted', text: 'No customer recorded.' }),
    h('p', { class: 'muted small', id: 'svc-cust-privacy', text: 'Kept on this computer. Included in DeckChek backups, so store your backups privately. Excluded from workspace exports, packs, ledgers and diagnostics bundles.' }));
  if (cust) {
    const edit = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'svc-cust-edit', html: `${icon('edit', { size: 14 })}<span>Edit customer</span>` });
    edit.addEventListener('click', () => {
      const n = input({ id: 'svc-ce-name', maxlength: LIMITS.name, value: cust.name }), p = input({ id: 'svc-ce-phone', type: 'tel', maxlength: LIMITS.phone, value: cust.phone || '' }), m = input({ id: 'svc-ce-email', type: 'email', maxlength: LIMITS.email, value: cust.email || '' });
      const f = h('form', { class: 'svc-inline-form' }, h('div', { class: 'svc-grid' }, field('Name', n, { required: true }), field('Phone', p), field('Email', m)),
        h('div', { class: 'svc-actions' }, h('button', { type: 'submit', class: 'btn btn-primary btn-sm', text: 'Save customer' }), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Cancel', onclick: () => f.replaceWith(edit) })));
      f.addEventListener('submit', async e => {
        e.preventDefault();
        try { await api.updateCustomer(cust.id, { name: n.value, phone: p.value, email: m.value }); toast('Customer updated.', { type: 'success', timeout: 2500 }); ctx.reload(); }
        catch (x) { showError(err, `Customer not saved: ${friendly(x)}`); }
      });
      edit.replaceWith(f); n.focus();
    });
    custCard.append(edit);
  }

  const unitCard = h('section', { class: 'card svc-card', 'aria-labelledby': 'svc-unit-title' }, h('h3', { class: 'card-title', id: 'svc-unit-title', text: 'Unit' }),
    asset ? dl([['Unit', asset.nickname], ['Serial number', asset.serialNumber], ['Device profile', asset.profileId ? (profileById(asset.profileId) ? `${profileById(asset.profileId).manufacturer} ${profileById(asset.profileId).model}` : asset.profileId) : 'None (Quick diagnostic only)'], ['Removed from Equipment', asset.isDeleted ? 'Yes (the job stays readable)' : null]]) : h('p', { class: 'muted', text: 'No unit.' }));

  const jobCard = h('section', { class: 'card svc-card', 'aria-labelledby': 'svc-jobd-title' }, h('h3', { class: 'card-title', id: 'svc-jobd-title', text: 'Fault and arrival' }));
  const faultP = h('p', { class: 'svc-pre', id: 'svc-fault-text', text: job.reportedFault });
  jobCard.append(h('h4', { text: 'Reported fault' }), faultP,
    h('h4', { text: 'Accessories received' }), job.accessories?.length ? h('ul', { class: 'svc-tags' }, ...job.accessories.map(a => h('li', { class: 'tag', text: a }))) : h('p', { class: 'muted', text: 'None recorded.' }),
    h('h4', { text: 'Condition on arrival' }), h('p', { class: 'svc-pre', text: job.arrivalCondition || '—' }),
    h('h4', { text: 'Resolution' }), h('p', { class: 'svc-pre', id: 'svc-resolution-text', text: job.resolution || '—' }));
  if (!readOnly) {
    const edit = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'svc-fields-edit', html: `${icon('edit', { size: 14 })}<span>Edit</span>` });
    edit.addEventListener('click', () => {
      // defaultValue = the saved text, so Esc only asks before discarding real changes (hasUnsavedInput)
      const f1 = textarea({ id: 'svc-e-fault', maxlength: LIMITS.fault, rows: 4 }); f1.defaultValue = job.reportedFault;
      const f2 = textarea({ id: 'svc-e-condition', maxlength: LIMITS.condition }); f2.defaultValue = job.arrivalCondition || '';
      const f3 = textarea({ id: 'svc-e-resolution', maxlength: LIMITS.resolution }); f3.defaultValue = job.resolution || '';
      const f = h('form', { class: 'svc-inline-form' }, field('Reported fault', f1, { required: true }), field('Condition on arrival', f2), field('Resolution', f3, { help: 'What was done and why. Printed on the job sheet.' }),
        h('div', { class: 'svc-actions' }, h('button', { type: 'submit', class: 'btn btn-primary btn-sm', id: 'svc-e-save', text: 'Save' }), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Cancel', onclick: () => ctx.reload() })));
      f.addEventListener('submit', async e => {
        e.preventDefault();
        try { await api.updateFields(job.id, { reportedFault: f1.value, arrivalCondition: f2.value, resolution: f3.value }); toast('Job details saved.', { type: 'success', timeout: 2500 }); ctx.reload(); }
        catch (x) { showError(err, `Not saved: ${friendly(x)}`); }
      });
      jobCard.append(f); edit.remove(); f1.focus();
    });
    jobCard.append(edit);
  }

  wrap.append(h('div', { class: 'svc-cards' }, custCard, unitCard), jobCard, photosCard(ctx, err), statusHistory(detail), err);
  host.replaceChildren(wrap);
}

function photosCard(ctx, err) {
  const { detail, api, readOnly } = ctx;
  const card = h('section', { class: 'card svc-card', 'aria-labelledby': 'svc-photos-title' }, h('h3', { class: 'card-title', id: 'svc-photos-title', text: `Photos (${detail.photos.length} of ${PHOTO_LIMIT})` }));
  const grid = h('ul', { class: 'svc-photos', role: 'list' });
  for (const p of detail.photos) {
    const img = h('img', { alt: p.caption || `Photo, ${p.stage || 'intake'}`, loading: 'lazy', width: 160, height: 120 });
    api.photoRead(p.photoId).then(b64 => { img.src = `data:image/jpeg;base64,${b64}`; }).catch(() => { img.alt = 'Photo file missing'; });
    const li = h('li', { class: 'svc-photo' }, img, h('span', { class: 'small', text: `${p.caption || 'No caption'} · ${p.stage || 'intake'}` }));
    if (!readOnly) li.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': `Remove photo ${p.caption || ''}`.trim(), text: 'Remove', onclick: async () => { try { await api.photoUnlink(p.linkId); ctx.reload(); } catch (e) { showError(err, friendly(e)); } } }));
    grid.append(li);
  }
  card.append(detail.photos.length ? grid : h('p', { class: 'muted', text: 'No photos yet.' }));
  if (!readOnly && detail.photos.length < PHOTO_LIMIT) {
    const file = h('input', { type: 'file', id: 'svc-add-photo', accept: 'image/jpeg,image/png,image/webp', multiple: true });
    const cap = input({ id: 'svc-add-photo-caption', maxlength: 200 });
    const stage = h('select', { id: 'svc-add-photo-stage' }, ...PHOTO_STAGES.map(s => h('option', { value: s, text: s[0].toUpperCase() + s.slice(1) })));
    const add = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'svc-add-photo-btn', text: 'Add photos' });
    add.addEventListener('click', async () => {
      const files = [...(file.files || [])];
      if (!files.length) { showError(err, 'Choose a photo first.'); return; }
      if (files.length + detail.photos.length > PHOTO_LIMIT) { showError(err, `A job can have at most ${PHOTO_LIMIT} photos.`); return; }
      // Focus goes back to "Add photos" in the re-rendered card (or, at the photo limit, the newest photo): disabling the
      // button during the attach drops focus to <body>, so the mark is fixed rather than taken from document.activeElement.
      add.disabled = true;
      add.setAttribute('aria-busy', 'true');
      const failed = await attachFiles(api, detail.job.id, files, { caption: cap.value.trim(), stage: stage.value });
      add.disabled = false;
      add.removeAttribute('aria-busy');
      if (failed) showError(err, `${failed} photo${failed === 1 ? '' : 's'} could not be added (not an image, larger than 8 MB, or the limit was reached).`);
      await ctx.reload({ mark: { sel: '#svc-add-photo-btn', caret: null }, fallback: '.svc-photos > li:last-child button', quiet: true });
      if (failed < files.length) announce(`${files.length - failed} photo${files.length - failed === 1 ? '' : 's'} added.`);
    });
    card.append(h('div', { class: 'svc-grid' }, field('Photo files', file, { help: 'Re-encoded on this computer; GPS and other metadata are removed.' }), field('Caption', cap), field('Stage', stage)), add);
  }
  return card;
}

function statusHistory(detail) {
  return h('section', { class: 'card card-quiet svc-card', 'aria-labelledby': 'svc-hist-title' }, h('h3', { class: 'card-title', id: 'svc-hist-title', text: 'Status history' }),
    h('ol', { class: 'svc-history' }, ...detail.statusLog.map(s => h('li', {}, h('span', { class: 'num small', text: when(s.at) }), ' ', h('strong', { text: statusLabel(s.toStatus) }), s.fromStatus ? h('span', { class: 'muted small', text: ` from ${statusLabel(s.fromStatus)}` }) : null, s.note ? h('span', { class: 'small', text: ` · ${s.note}` }) : null))));
}

// ------------------------------------------------------------------ step: before / after tests

export function renderTestsStep(host, ctx, phase) {
  const { detail, readOnly, api } = ctx;
  const wrap = h('div', { class: 'svc-step-body' });
  const title = phase === 'before' ? 'Pre-repair tests' : 'Post-repair tests';
  const linked = detail.results.filter(r => r.phase === phase);
  const profile = detail.asset?.profileId ? profileById(detail.asset.profileId) : null;
  const err = errorBox(`svc-${phase}-error`);
  wrap.append(h('p', { class: 'lede', text: phase === 'before' ? 'Measure the unit as it arrived. Results are saved to the unit and linked to this job as “before”.' : 'Measure again after the repair. Results are linked as “after” and compared with the before values.' }));

  if (!profile) {
    wrap.append(h('div', { class: 'banner banner-info', role: 'status', id: 'svc-unsupported-unit', html: `${chip('info')}<div class="banner-text"><strong>This unit has no device profile</strong><span>There is no test plan for it. Use the Quick diagnostic for free-form measurements, then link the saved run here.</span></div>` }));
  } else if (!readOnly) {
    const picked = new Set(phase === 'after' ? detail.results.filter(r => r.phase === 'before' && r.testId).map(r => r.testId) : []);
    const groups = groupTestsByCategory(profile);
    const fs = h('fieldset', { class: 'svc-fieldset svc-plan', id: `svc-plan-${phase}` }, h('legend', { text: `Test plan subset · ${profile.manufacturer} ${profile.model}` }));
    for (const g of groups) {
      const runnable = g.tests.filter(t => dispatchFor(t).runner !== 'unsupported');
      if (!runnable.length) continue;
      fs.append(h('h4', { text: g.label }), h('div', { class: 'svc-checks' }, ...runnable.map(t => h('label', { class: 'svc-check' }, h('input', { type: 'checkbox', value: t.id, 'data-plan-test': t.id, checked: picked.has(t.id) ? true : null }), ` ${t.title}`))));
    }
    const count = () => fs.querySelectorAll('input:checked').length;
    const run = h('button', { type: 'button', class: 'btn btn-primary', id: `svc-run-${phase}`, html: `${icon('play', { size: 16 })}<span>Run selected tests</span>` });
    const all = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Select all', onclick: () => { fs.querySelectorAll('input').forEach(b => { b.checked = true; }); sync(); } });
    const sync = () => { const n = count(); run.disabled = !n; run.querySelector('span').textContent = n ? `Run ${n} selected test${n === 1 ? '' : 's'}` : 'Select tests to run'; };
    fs.addEventListener('change', sync);
    run.addEventListener('click', async () => {
      const testIds = [...fs.querySelectorAll('input:checked')].map(b => b.value);
      try {
        const { beginDeviceJobRun } = await import('../screens/devices.js');
        beginDeviceJobRun({ jobId: detail.job.id, jobNumber: detail.job.jobNumber, phase, profileId: profile.id, assetId: detail.asset.id, testIds,
          link: row => api.linkResults(detail.job.id, phase, { deviceTestResultIds: [row.id] }),
          onDone: () => ctx.returnTo(phase) });
      } catch (e) { showError(err, `Could not start the tests: ${friendly(e)}`); }
    });
    sync();
    wrap.append(fs, h('div', { class: 'svc-actions' }, run, all));
  }
  if (!readOnly) wrap.append(linkRunCard(ctx, phase, err));

  const table = h('table', { class: 'data svc-table', id: `svc-results-${phase}` }, h('caption', { text: `${title}: results linked to this job` }),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Test' }), h('th', { scope: 'col', text: 'Result' }), h('th', { scope: 'col', text: 'When' }))),
    h('tbody', {}, ...linked.map(r => {
      const t = profile?.tests?.find(x => x.id === r.testId);
      return h('tr', {}, h('th', { scope: 'row', text: t?.title || r.testId || (r.sessionId ? 'Saved run' : 'Result') }), h('td', { html: resultChip(r.status) }), h('td', { class: 'num', text: when(r.at) }));
    })));
  wrap.append(linked.length ? h('div', { class: 'table-wrap' }, table) : h('p', { class: 'muted', id: `svc-no-results-${phase}`, text: `No ${phase} results yet.` }));
  if (phase === 'after') wrap.append(comparisonBlock(ctx.comparison));
  wrap.append(err);
  host.replaceChildren(wrap);
}

function linkRunCard(ctx, phase, err) {
  const sel = h('select', { id: `svc-link-run-${phase}` }, h('option', { value: '', text: 'Loading saved runs…' }));
  const btn = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: `svc-link-run-btn-${phase}`, text: `Link as ${phase}` });
  const quick = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Open Quick diagnostic', onclick: () => import('../shell.js').then(m => m.go('quick', { focus: true })) });
  (isNative() ? globalThis.window.__TAURI__.core.invoke('list_runs', { limit: 30 }) : Promise.resolve([])).then(runs => {
    sel.replaceChildren(h('option', { value: '', text: runs?.length ? 'Choose a saved run' : 'No saved runs' }), ...(runs || []).map(r => h('option', { value: r.id, text: `${when(r.startedAt)} · ${r.test || r.sessionType || 'run'}` })));
  }).catch(() => sel.replaceChildren(h('option', { value: '', text: 'Saved runs unavailable' })));
  btn.addEventListener('click', async () => {
    if (!sel.value) { showError(err, 'Choose a saved run to link.'); return; }
    try { await ctx.api.linkResults(ctx.detail.job.id, phase, { sessionIds: [sel.value] }); toast(`Run linked as ${phase}.`, { type: 'success', timeout: 2500 }); ctx.reload(); }
    catch (e) { showError(err, `Not linked: ${friendly(e)}`); }
  });
  return h('details', { class: 'card card-quiet svc-card' }, h('summary', { text: 'Link a saved run (Quick diagnostic or workflow)' }), h('div', { class: 'svc-actions' }, field('Saved run', sel), btn, quick));
}

/** Before/after table with the partial-state banner (AC-4). */
export function comparisonBlock(cmp) {
  const box = h('section', { class: 'svc-compare', 'aria-labelledby': 'svc-cmp-title', id: 'svc-compare' }, h('h3', { id: 'svc-cmp-title', text: 'Before and after' }));
  // Not a live region: the block is rebuilt on every render, so the screen announces the outcome (comparisonSummary).
  const live = h('div', { id: 'svc-compare-status' });
  box.append(live);
  if (!cmp) { live.append(h('p', { class: 'muted', text: 'Loading the comparison…' })); return box; }
  if (cmp.headline.length) box.append(h('ul', { class: 'svc-headline', id: 'svc-headline' }, ...cmp.headline.map(x => h('li', { html: `${chip(x.change === 'fixed' ? 'pass' : 'fail', CHANGE_TEXT[x.change], { size: 14 })} <span>${esc(x.title)}</span>` }))));
  if (cmp.completeness.state === 'partial') live.append(h('div', { class: 'banner banner-warn', role: 'status', id: 'svc-partial', html: `${chip('warn')}<div class="banner-text"><strong>${esc(cmp.completeness.message)}</strong><span>Run the missing after tests for a complete comparison.</span></div>` }));
  else if (cmp.completeness.state === 'empty') live.append(h('p', { class: 'muted', text: 'No measured values are linked yet.' }));
  if (cmp.rows.length) {
    box.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data svc-table', id: 'svc-compare-table' }, h('caption', { text: 'Measured values: change judged at k = 2 (an asterisk marks an assumed uncertainty)' }),
      h('thead', {}, h('tr', {}, ...['Metric', 'Before', 'After', 'Change', 'Result'].map(t => h('th', { scope: 'col', text: t })))),
      // Keyed by the row's (test, metric) key: one metric key can appear under several tests (two faders).
      h('tbody', {}, ...cmp.rows.map(r => h('tr', { 'data-key': String(r.key ?? '').replace(/\u0000/g, ':'), 'data-metric': r.metricKey, 'data-status': r.status },
        h('th', { scope: 'row', text: `${r.label}${r.unit ? ` (${r.unit})` : ''}` }), h('td', { class: 'num', text: fmtNum(r.before) }), h('td', { class: 'num', text: fmtNum(r.after) }),
        h('td', { class: 'num', text: `${fmtSigned(r.delta)}${Number.isFinite(r.uncertainty) ? ` ± ${fmtNum(2 * r.uncertainty)}${r.assumed ? '*' : ''}` : ''}` }),
        h('td', { html: `${chip(ROW_CHIP[r.status] || 'info', ROW_STATUS_TEXT[r.status] || r.status, { size: 14 })}${r.reason && (r.status === 'notComparable' || r.ambiguous) ? `<span class="small muted"> ${esc(r.reason)}</span>` : ''}` })))))));
  }
  if (cmp.tests.length) {
    box.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data svc-table', id: 'svc-compare-tests' }, h('caption', { text: 'Test results before and after' }),
      h('thead', {}, h('tr', {}, ...['Test', 'Before', 'After'].map(t => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, ...cmp.tests.map(t => h('tr', {}, h('th', { scope: 'row', text: t.title }), h('td', { html: resultChip(t.before) }), h('td', { html: resultChip(t.after) })))))));
  }
  return box;
}

// ------------------------------------------------------------------ step: work log

export function renderWorkStep(host, ctx) {
  const { detail, api, readOnly } = ctx;
  const id = detail.job.id;
  const log = effectiveLog(detail.log);
  const totals = jobTotals(detail.log);
  const err = errorBox('svc-work-error');
  const currency = clip(settings.serviceCurrency || '', 4);
  const wrap = h('div', { class: 'svc-step-body' });
  wrap.append(h('p', { class: 'svc-totals', id: 'svc-totals', text: `Labour ${fmtNum(totals.labourHours, 2)} h · ${totals.partCount} part${totals.partCount === 1 ? '' : 's'}${totals.partCount ? ` · parts ${fmtMoney(totals.partsCost, currency)}${totals.unpricedParts ? ` (${totals.unpricedParts} without a price)` : ''}` : ''}. Informational totals, not an invoice.` }));
  if (readOnly) wrap.append(h('div', { class: 'banner banner-info', role: 'status', html: `${chip('info')}<div class="banner-text"><strong>This job is ${esc(statusLabel(detail.job.status).toLowerCase())} and read-only</strong><span>Reopen it to add work.</span></div>` }));
  const mark = e => (e.superseded ? ' (amended, see later entry)' : e.amendment ? ' (amended)' : '');
  // One entry at a time: a double click, a held Enter or a held Ctrl+Enter must not save the same entry twice (the log
  // is append-only, so a duplicate could not be removed). Busy until the reload has replaced the forms.
  let busy = false;
  const add = async (kind, payload, after) => {
    if (busy) return;
    busy = true;
    const mark = ctx.focusMark?.(), focused = document.activeElement; // before the buttons are disabled
    const buttons = [...wrap.querySelectorAll('#svc-part-add, #svc-labour-add, #svc-note-save')];
    buttons.forEach(b => { b.disabled = true; b.setAttribute('aria-busy', 'true'); });
    try {
      await api.addLog(id, kind, payload);
      after?.();
      await ctx.reload({ mark });
      const totalsNow = document.getElementById('svc-totals')?.textContent || '';
      announce(`${kind === 'part' ? 'Part' : kind === 'labour' ? 'Labour' : 'Note'} added. ${totalsNow}`.trim());
    } catch (e) { showError(err, `Not added: ${friendly(e)}`); }
    finally {
      busy = false;
      buttons.forEach(b => { b.disabled = false; b.removeAttribute('aria-busy'); });
      if (focused?.isConnected && document.activeElement === document.body) focused.focus();
    }
  };

  // parts
  const parts = log.filter(e => e.kind === 'part');
  wrap.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data svc-table', id: 'svc-parts' }, h('caption', { text: 'Parts' }),
    h('thead', {}, h('tr', {}, ...['Part', 'Qty', 'Unit cost', 'Added'].map(t => h('th', { scope: 'col', text: t })))),
    h('tbody', {}, ...(parts.length ? parts.map(e => h('tr', { class: e.superseded ? 'svc-superseded' : '' }, h('td', { text: `${e.description}${mark(e)}` }), h('td', { class: 'num', text: fmtQty(Number.isFinite(e.quantity) ? e.quantity : 1) }), h('td', { class: 'num', text: fmtMoney(e.unitCost, currency) }), h('td', { class: 'num', text: when(e.at) })))
      : [h('tr', {}, h('td', { colspan: 4, class: 'muted', text: 'No parts.' }))])))));
  if (!readOnly) {
    const n = input({ id: 'svc-part-name', maxlength: LIMITS.description }), q = input({ id: 'svc-part-qty', type: 'number', min: '0.01', step: 'any', max: String(LIMITS.quantity), value: '1', inputmode: 'decimal' }), c = input({ id: 'svc-part-cost', type: 'number', min: '0', step: '0.01', max: String(LIMITS.unitCost), inputmode: 'decimal' });
    const f = h('form', { class: 'svc-inline-form svc-row-form', 'aria-label': 'Add a part' }, field('Part', n, { required: true }), field('Qty', q), field(`Unit cost${currency ? ` (${currency})` : ''} (optional)`, c), h('button', { type: 'submit', class: 'btn btn-secondary btn-sm', id: 'svc-part-add', text: 'Add part' }));
    f.addEventListener('submit', e => {
      e.preventDefault();
      const qty = Number(q.value || 1), cost = c.value === '' ? null : Number(c.value);
      if (!n.value.trim()) { showError(err, 'Enter the part name.'); n.focus(); return; }
      if (!(qty > 0) || qty > LIMITS.quantity) { showError(err, `Quantity must be above 0 and at most ${LIMITS.quantity}.`); q.focus(); return; }
      if (cost != null && !(cost >= 0 && cost <= LIMITS.unitCost)) { showError(err, 'Unit cost must be 0 or more.'); c.focus(); return; }
      add('part', { description: n.value.trim(), quantity: qty, unitCost: cost });
    });
    wrap.append(f);
  }

  // labour
  const labour = log.filter(e => e.kind === 'labour');
  wrap.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data svc-table', id: 'svc-labour' }, h('caption', { text: 'Labour' }),
    h('thead', {}, h('tr', {}, ...['Work', 'Minutes', 'Added'].map(t => h('th', { scope: 'col', text: t })))),
    h('tbody', {}, ...(labour.length ? labour.map(e => h('tr', { class: e.superseded ? 'svc-superseded' : '' }, h('td', { text: `${e.description}${mark(e)}` }), h('td', { class: 'num', text: fmtNum(e.minutes, 0) }), h('td', { class: 'num', text: when(e.at) })))
      : [h('tr', {}, h('td', { colspan: 3, class: 'muted', text: 'No labour.' }))])))));
  if (!readOnly) {
    const d = input({ id: 'svc-labour-desc', maxlength: LIMITS.description }), m = input({ id: 'svc-labour-min', type: 'number', min: '1', max: String(LIMITS.minutes), step: '1', inputmode: 'numeric' });
    const f = h('form', { class: 'svc-inline-form svc-row-form', 'aria-label': 'Add labour' }, field('Work done', d, { required: true }), field('Minutes', m, { required: true }), h('button', { type: 'submit', class: 'btn btn-secondary btn-sm', id: 'svc-labour-add', text: 'Add labour' }));
    f.addEventListener('submit', e => {
      e.preventDefault();
      const min = Number(m.value);
      if (!d.value.trim()) { showError(err, 'Describe the work.'); d.focus(); return; }
      if (!Number.isInteger(min) || min < 1 || min > LIMITS.minutes) { showError(err, `Minutes must be a whole number from 1 to ${LIMITS.minutes}.`); m.focus(); return; }
      add('labour', { description: d.value.trim(), minutes: min });
    });
    wrap.append(f);
  }

  // notes (append-only; an edit is a new entry marked amended)
  const notes = log.filter(e => e.kind === 'note');
  const list = h('ol', { class: 'svc-notes', id: 'svc-notes', 'aria-label': 'Notes' });
  let amending = null;
  const ta = textarea({ id: 'svc-note', maxlength: LIMITS.note, rows: 3 });
  const amendLabel = h('p', { class: 'small muted', id: 'svc-amend-label', hidden: true });
  for (const e of notes) {
    const li = h('li', { class: e.superseded ? 'svc-superseded' : '', 'data-note': e.id }, h('span', { class: 'num small', text: when(e.at) }), ' ', h('span', { class: 'svc-pre', text: e.description }), e.superseded ? h('em', { class: 'small', text: ' amended, see later entry' }) : e.amendment ? h('em', { class: 'small', text: ' amended' }) : null);
    if (!readOnly && !e.superseded) li.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-amend': e.id, text: 'Amend', 'aria-label': `Amend note from ${when(e.at)}`, onclick: () => { amending = e.id; ta.value = e.description; amendLabel.hidden = false; amendLabel.textContent = `Amending the note from ${when(e.at)}. The original is kept.`; ta.focus(); } }));
    list.append(li);
  }
  wrap.append(h('h3', { text: 'Notes' }), notes.length ? list : h('p', { class: 'muted', text: 'No notes yet.' }));
  if (!readOnly) {
    const save = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'svc-note-save', html: '<span>Save note</span><kbd>Ctrl+Enter</kbd>' });
    const submit = () => {
      if (!ta.value.trim()) { showError(err, 'Write the note first.'); ta.focus(); return; }
      add('note', { description: ta.value.trim(), amendsId: amending }, () => { amending = null; });
    };
    save.addEventListener('click', submit);
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); if (!e.repeat) submit(); } });
    wrap.append(field('New note', ta, { help: 'Notes are timestamped and cannot be edited; Amend adds a corrected entry. Ctrl+Enter saves.' }), amendLabel, h('div', { class: 'svc-actions' }, save));
  }
  wrap.append(err);
  host.replaceChildren(wrap);
}

// ------------------------------------------------------------------ step: sheet

export function renderSheetStep(host, ctx) {
  const { detail } = ctx;
  const err = errorBox('svc-sheet-error');
  const costs = h('input', { type: 'checkbox', id: 'svc-sheet-costs' });
  const customer = h('input', { type: 'checkbox', id: 'svc-sheet-customer' });
  const currency = input({ id: 'svc-sheet-currency', maxlength: 4, value: clip(settings.serviceCurrency || '', 4), size: 4, 'data-svc-no-dirty': true });
  const preview = h('div', { class: 'svc-sheet-preview', id: 'svc-sheet-preview', role: 'region', 'aria-label': 'Job sheet preview', tabindex: '0' });
  const saved = h('p', { class: 'small', id: 'svc-sheet-saved', 'aria-live': 'polite' });
  const opts = () => ({ includeCosts: costs.checked, includeCustomer: customer.checked, currency: clip(currency.value.trim(), 4) });
  const draw = () => { preview.innerHTML = renderJobSheetHtml(detail, ctx.comparison, opts(), esc); };
  costs.addEventListener('change', draw); customer.addEventListener('change', draw);
  currency.addEventListener('change', () => { setSetting('serviceCurrency', clip(currency.value.trim(), 4)); draw(); });
  const data = () => jobSheetPrintData(detail, ctx.comparison, opts());
  async function exportHtml() {
    showError(err, '');
    try {
      const [{ ensureJobSheetKind }, { saveTextFile }] = await Promise.all([import('../../report-kinds/jobsheet.js'), import('../../userfiles.js')]);
      const mod = await ensureJobSheetKind();
      const { html } = mod.composePrintable('jobSheet', data(), { css: await mod.loadPrintCss().catch(() => null) });
      const r = await saveTextFile({ suggestedName: `job-sheet-${detail.job.jobNumber}`, content: html, ext: 'html' });
      if (r.cancelled) return;
      saved.textContent = r.path ? `Saved to ${r.path}` : 'Job sheet downloaded.';
      toast('Job sheet exported as HTML.', { type: 'success', timeout: 3000 });
    } catch (e) {
      showError(err, `The job sheet was not saved: ${friendly(e)}`);
      toast(`The job sheet was not saved: ${friendly(e)}`, { type: 'error', action: { label: 'Retry', run: exportHtml } });
    }
  }
  const htmlBtn = h('button', { type: 'button', class: 'btn btn-secondary', id: 'svc-sheet-html', html: `${icon('download', { size: 16 })}<span>Export HTML</span>`, onclick: exportHtml });
  const pdfBtn = h('button', { type: 'button', class: 'btn btn-primary', id: 'svc-sheet-pdf', html: `${icon('download', { size: 16 })}<span>Export PDF</span>` });
  pdfBtn.addEventListener('click', async () => {
    const [{ ensureJobSheetKind }, { exportPdfWithFeedback }] = await Promise.all([import('../../report-kinds/jobsheet.js'), import('../persistence.js')]);
    await ensureJobSheetKind();
    await exportPdfWithFeedback('jobSheet', data(), { button: pdfBtn, htmlFallback: exportHtml });
  });
  pdfBtn.hidden = !isEnabled('pdfExport');
  host.replaceChildren(h('div', { class: 'svc-step-body' },
    detail.job.status === 'ready' || detail.job.status === 'collected' ? null : h('div', { class: 'banner banner-info', role: 'status', html: `${chip('info')}<div class="banner-text"><strong>Draft sheet</strong><span>The job is ${esc(statusLabel(detail.job.status))}; the sheet is final once it is Ready.</span></div>` }),
    h('fieldset', { class: 'svc-fieldset' }, h('legend', { text: 'Sheet options' }),
      h('label', { class: 'svc-check' }, costs, ' Include costs'), h('label', { class: 'svc-check' }, customer, ' Include customer details'), field('Currency symbol', currency)),
    h('div', { class: 'svc-actions' }, pdfBtn, htmlBtn), saved, err, preview));
  draw();
}
