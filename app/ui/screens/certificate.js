// Used-gear certificate screen (FS-20 §3): readiness card, identity form with photos, HTML preview, "Sign and export"
// (JSON sidecar + PDF, HTML fallback), unsigned DRAFT export when tests are missing, and this unit's certificate history.
// Engine: app/certificate.js (pure); Rust bridge: app/certificate-api.js. Flag: features.certificates (rail entries only
// while on). Browser mode: signing needs the desktop key store, so creation shows an explicit unsupported state;
// the Verify screen works in both modes.

import { h, esc, isNative, isTyping } from '../dom.js';
import { icon } from '../icons.js';
import { toast, announce } from '../live.js';
import { go, confirmDialog } from '../shell.js';
import { settings, setSetting, calibrationStatus, store, localRun } from '../state.js';
import { navigateTo, takeHandoff } from '../crosslinks.js';
import { savedActions, pdfExportEnabled } from '../persistence.js';
import { isEnabled } from '../../features.js';
import { lib, ensureLibrary, refreshUnits, profileById, unitsFor, resultsFor } from '../devices/library-state.js';
import {
  readiness, buildCertificatePayload, assembleCertificateFile, renderCertificateBody, renderCertificateHtml, certificateBaseName,
  VALIDITY_DAYS, DEFAULT_VALID_DAYS, LIMITS, VERDICT_LABEL, VERDICT_ICON, CertificateError,
  certificatePlan, latestByTest, calibrationFor, certificateVerdict, validatePayload, toDecimal,
} from '../../certificate.js';
import { createCertificateApi, exportCertificateFiles } from '../../certificate-api.js';
import { preparePhoto, sniffImageType, bytesToBase64, createPhotoStore } from '../../photo-store.js';
import { saveTextFile } from '../../userfiles.js';
import { createVerifyScreen } from './verify.js';

const friendly = e => (typeof e === 'string' ? e : e?.message || 'Something went wrong.');
const PROTECTION_TEXT = { dpapi: 'Key protected by Windows (DPAPI) for your user account.', 'file-user-only': 'Key stored in a file only your user account can read.', file: 'Windows could not protect the key; it is stored as a plain file in your app data folder.' };

/** Pure: options for the unit picker, one per (profile with tests, unit). */
export function unitOptions(profiles, unitsOf) {
  return profiles.filter(p => (p.tests || []).length).flatMap(p => unitsOf(p.id).map(a => ({ value: `${p.id}::${a.id}`, profileId: p.id, assetId: a.id, label: `${a.nickname} — ${p.manufacturer} ${p.model}` })));
}

/** Pure: photo pre-checks before decoding (spec §3: png/jpg, max 5 MB each, up to 6). -> error text or null */
export function photoProblem(bytes, size, count) {
  if (count >= LIMITS.maxPhotos) return `At most ${LIMITS.maxPhotos} photos.`;
  if (size > LIMITS.maxPhotoSourceBytes) return `That photo is ${(size / 1048576).toFixed(1)} MB; the limit is 5 MB.`;
  const type = sniffImageType(bytes);
  if (type !== 'jpeg' && type !== 'png') return 'Only PNG or JPEG photos can be attached.';
  return null;
}

// ---------- AC-6: calibration as recorded when each measurement was taken ----------
const flagCalibrated = m => (typeof m?.calibrated === 'boolean' ? m.calibrated
  : !Array.isArray(m?.qualityFlags) ? null : m.qualityFlags.includes('calibrated') ? true : m.qualityFlags.includes('uncalibrated') ? false : null);

/**
 * Pure (AC-6): the calibration a stored measurement was taken with, as a profile-like {createdAt, deviceName, sampleRate,
 * valid} for calibrationFor(), or null (taken uncalibrated, or nothing recorded: the certificate prints 'Uncalibrated').
 * Sources: the measurement's own flag, then the run it came from (`run`: the workspace run or get_run), whose
 * `calibration.profileCreatedAt` dates the profile. The profile active now (`current`) only supplies the reference for a
 * measurement recorded as calibrated when its run kept no date and that profile already existed when it was measured;
 * it never turns a measurement without a recorded calibration into a calibrated one.
 */
export function recordedCalibration(m, result, run = null, current = null) {
  const runM = (Array.isArray(run?.measurements) ? run.measurements : []).find(x => x?.metricId === m?.metricId) || null;
  const rec = [result?.detail?.calibration, run?.calibration].find(c => c && typeof c === 'object') || null;
  let calibrated = flagCalibrated(m) ?? flagCalibrated(runM);
  if (calibrated == null && typeof rec?.applied === 'boolean') calibrated = rec.applied;
  if (calibrated !== true) return null;
  const at = Date.parse(rec?.profileCreatedAt);
  if (Number.isFinite(at)) return { createdAt: new Date(at).toISOString(), deviceName: String(rec.deviceName || ''), sampleRate: rec.sampleRate ?? run?.sampleRate ?? '', valid: true };
  const measuredAt = Date.parse(result?.createdAt), since = Date.parse(current?.createdAt);
  return current && current.valid !== false && Number.isFinite(since) && Number.isFinite(measuredAt) && since <= measuredAt ? current : null;
}

const latestForPlan = (plan, results) => latestByTest((results || []).filter(r => !r?.profileId || r.profileId === plan.profileId));
const runIdOf = r => [r?.detail?.runId, r?.sessionId].find(id => typeof id === 'string' && id) || null;

/** Pure (AC-6): ids of the persisted runs behind the latest result of each plan test that has measurements. */
export function calibrationRunIds(profile, results) {
  const plan = certificatePlan(profile), latest = latestForPlan(plan, results);
  const ids = plan.tests.map(t => latest.get(t.id)).filter(r => Array.isArray(r?.detail?.measurements) && r.detail.measurements.length).map(runIdOf).filter(Boolean);
  return [...new Set(ids)].slice(0, LIMITS.maxResults);
}

/**
 * Pure (AC-6): buildCertificatePayload() with each measurement's calibration state taken from what was recorded when
 * it was measured (recordedCalibration), not from the profile active at certificate time. `runs`: run id -> run.
 */
export function buildPayloadAsMeasured(args, { runs = new Map(), current = null } = {}) {
  const plan = certificatePlan(args.profile), latest = latestForPlan(plan, args.results);
  const source = plan.tests.flatMap(t => {
    const r = latest.get(t.id), run = runs.get(runIdOf(r)) || null;
    return (Array.isArray(r?.detail?.measurements) ? r.detail.measurements : []).filter(m => m?.metricId && toDecimal(m.value) != null)
      .map(m => ({ m: { ...m, testId: t.id }, cal: recordedCalibration(m, r, run, current) }));
  });
  // Built with no profile, every calibratable measurement starts 'uncalibrated'; the recorded state then replaces it.
  const payload = buildCertificatePayload({ ...args, measurements: source.map(s => s.m), calibration: null });
  const aligned = payload.measurements.every((pm, i) => source[i] && String(source[i].m.metricId).startsWith(pm.metricId));
  if (!aligned) return payload;
  const now = (args.now instanceof Date ? args.now : new Date(args.now ?? Date.now())).getTime();
  const measurements = payload.measurements.map((pm, i) => ({ ...pm, calibration: calibrationFor(source[i].m, source[i].cal, { now, intervalMonths: args.intervalMonths }) }));
  const out = { ...payload, measurements, verdict: certificateVerdict(payload.results, measurements) };
  const v = validatePayload(out);
  if (!v.ok) throw new CertificateError('schema', v.errors[0]);
  return out;
}

/** The runs behind the certificate's results: the local workspace copy (full calibration record) or the stored run. */
async function loadCalibrationRuns(profile, results) {
  const runs = new Map();
  await Promise.all(calibrationRunIds(profile, results).map(async id => {
    let run = localRun(id);
    if (!run) { try { run = await store.getRun(id); } catch { run = null; } }
    if (run) runs.set(id, run);
  }));
  return runs;
}

export function createCertificateScreen(section, { api = createCertificateApi(), photoStore = createPhotoStore(), dialog = globalThis.window?.__TAURI__?.dialog } = {}) {
  const native = isNative() && api.native;
  const st = { key: null, identity: null, identityError: null, photos: [], busy: false, history: [], validDays: DEFAULT_VALID_DAYS, form: null };
  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('file', { size: 24 })}</span><div><h1 tabindex="-1">Certificates</h1>
      <p class="lede">A dated, tamper-evident test certificate for a unit you sell: every test in its plan, measured values with uncertainty and calibration state, photos, a SHA-256 content hash and an Ed25519 signature.</p></div></div>
      <div class="head-actions"><button type="button" class="btn btn-secondary" id="cert-go-verify">${icon('check', { size: 16 })}<span>Verify a certificate</span></button></div></header>
    <div id="cert-status" class="cert-status" role="status" aria-live="polite"></div>
    <div id="cert-body"></div>`;
  const q = s => section.querySelector(s);
  const status = q('#cert-status'), body = q('#cert-body');
  q('#cert-go-verify').addEventListener('click', () => go('verify', { focus: true }));
  const say = (text, { assertive = false } = {}) => { status.textContent = text; if (assertive) announce(text, { assertive }); };

  const selection = () => {
    const [profileId, assetId] = String(st.key || '').split('::');
    const profile = profileById(profileId), asset = lib.assets.find(a => a.id === assetId) || null;
    return profile && asset ? { profile, asset } : null;
  };

  function render() {
    if (!native) {
      body.replaceChildren(h('div', { class: 'empty', id: 'cert-unsupported', html: `${icon('info', { size: 40 })}<h2>Signing needs the desktop app</h2><p>Certificates are signed with a key kept in the DeckChek desktop app's key store, so they cannot be created in this browser preview. You can still check a certificate file.</p>` },
        h('button', { type: 'button', class: 'btn btn-primary', text: 'Verify a certificate', onclick: () => go('verify', { focus: true }) })));
      return;
    }
    if (!lib.ready) { body.replaceChildren(h('div', { class: 'empty', html: '<span class="spinner" aria-hidden="true"></span><h2>Loading your device library…</h2>' })); return; }
    const opts = unitOptions(lib.profiles, unitsFor);
    if (!opts.length) { body.replaceChildren(h('div', { class: 'empty', id: 'cert-empty', html: `${icon('devices', { size: 40 })}<h2>No certificates yet</h2><p>Add your unit in Devices and run its test plan; the certificate is made from those results.</p>` }, h('button', { type: 'button', class: 'btn btn-primary', text: 'Open Devices', onclick: () => go('devices', { focus: true }) }))); return; }
    if (!opts.some(o => o.value === st.key)) st.key = opts[0].value;
    const picker = h('select', { id: 'cert-unit' }, ...opts.map(o => h('option', { value: o.value, text: o.label })));
    picker.value = st.key;
    picker.addEventListener('change', () => { st.key = picker.value; st.photos = []; render(); q('#cert-unit')?.focus(); loadHistory(); });
    const sel = selection();
    const ready = readiness(sel.profile, resultsFor(sel.asset.id), { now: Date.now() });
    body.replaceChildren(
      h('div', { class: 'field cert-picker' }, h('label', { class: 'field-label', for: 'cert-unit', text: 'Unit' }), picker),
      readinessCard(sel, ready), identityCard(), formCard(sel, ready), h('section', { class: 'card', id: 'cert-preview-card', hidden: true }), historyCard());
    renderHistory();
  }

  function readinessCard({ profile, asset }, ready) {
    const card = h('section', { class: 'card cert-ready', id: 'cert-readiness', 'aria-labelledby': 'cert-ready-h' });
    const head = h('h2', { id: 'cert-ready-h', text: `${profile.manufacturer} ${profile.model} test plan` });
    const count = h('p', { class: 'cert-count', id: 'cert-count', html: `<b class="num">${ready.done}</b> of <b class="num">${ready.total}</b> required tests done${ready.ready ? ` — ${icon('pass', { size: 16 })} ready to certify` : ''}` });
    card.append(head, count);
    if (ready.missing.length) {
      card.append(h('p', { id: 'cert-missing-h', text: 'Missing results (run these first):' }),
        h('ul', { id: 'cert-missing', class: 'cert-list' }, ...ready.missing.slice(0, 50).map(m => h('li', { text: m.title }))),
        ready.missing.length > 50 ? h('p', { text: `…and ${ready.missing.length - 50} more.` }) : '');
    }
    if (ready.stale.length) {
      card.append(h('p', { text: 'Results older than 24 hours (consider re-running):' }),
        h('ul', { class: 'cert-list', id: 'cert-stale' }, ...ready.stale.slice(0, 50).map(s => h('li', {}, h('span', { text: `${s.title} — ${String(s.createdAt).slice(0, 10)} ` }), h('span', { class: 'badge', text: 'Re-run' })))));
    }
    card.append(h('div', { class: 'action-bar' }, h('button', { type: 'button', class: 'btn btn-secondary', text: 'Open tests in Devices', onclick: () => navigateTo('devices', { assetId: asset.id }) })));
    return card;
  }

  function identityCard() {
    const card = h('section', { class: 'card cert-identity', id: 'cert-identity', 'aria-label': 'Signing identity' });
    if (st.identityError) {
      card.append(h('p', { class: 'cert-warn', html: `${icon('warn', { size: 16 })} <span>${esc(st.identityError)}</span>` }),
        h('button', { type: 'button', class: 'btn btn-secondary', id: 'cert-new-identity', text: 'Create new identity', onclick: newIdentity }));
    } else if (st.identity) {
      card.append(h('p', {}, h('span', { text: 'Your signing key fingerprint: ' }), h('b', { class: 'cert-fp', id: 'cert-fp', text: st.identity.fingerprint.replace(/(.{4})(?=.)/g, '$1 ') })),
        h('p', { class: st.identity.protection === 'file' ? 'cert-warn' : 'muted small', text: PROTECTION_TEXT[st.identity.protection] || '' }),
        h('p', { class: 'muted small', text: 'Give buyers this fingerprint another way (message, shop page) so they can compare it with the certificate.' }));
    } else card.append(h('p', { class: 'muted', text: 'Loading signing identity…' }));
    return card;
  }

  async function newIdentity() {
    const ok = await confirmDialog({ title: 'Create a new signing identity?', body: 'A new key replaces the current one. Certificates you already issued still verify (each carries its public key), but buyers who noted your old fingerprint will see a different one on new certificates.', confirmLabel: 'Create new identity', danger: true });
    if (!ok) return;
    try { st.identity = await api.newIdentity(); st.identityError = null; say('New signing identity created.'); }
    catch (e) { st.identityError = friendly(e); }
    q('#cert-identity')?.replaceWith(identityCard());
  }

  function formCard(sel, ready) {
    const form = h('form', { class: 'card cert-form', id: 'cert-form', novalidate: true, 'aria-label': 'Certificate details' });
    const field = (label, input, hint = '') => h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }), input, hint ? h('span', { class: 'field-hint small muted', text: hint }) : '');
    // Typed values live in st.form (for this unit), so a re-render on onShow does not discard them.
    const key = st.key, typed = st.form?.key === key ? st.form : null;
    const model = h('input', { id: 'cert-model', value: `${sel.profile.manufacturer} ${sel.profile.model}`, readonly: true });
    const serial = h('input', { id: 'cert-serial', name: 'serial', required: true, maxlength: LIMITS.maxText, autocomplete: 'off', value: typed?.serial ?? (sel.asset.serialNumber || '') });
    const firmware = h('input', { id: 'cert-firmware', name: 'firmware', maxlength: LIMITS.maxText, value: typed?.firmware ?? (sel.asset.firmware || '') });
    const tester = h('input', { id: 'cert-tester', name: 'tester', required: true, maxlength: LIMITS.maxText, value: typed?.tester ?? (settings.certTester || '') });
    const notes = h('textarea', { id: 'cert-notes', name: 'notes', maxlength: LIMITS.maxLongText, rows: 3 });
    notes.value = typed?.notes ?? '';
    const validity = h('select', { id: 'cert-valid' }, ...VALIDITY_DAYS.map(d => h('option', { value: String(d), text: `${d} days` })));
    validity.value = String(st.validDays);
    validity.addEventListener('change', () => { st.validDays = Number(validity.value); });
    const photoInput = h('input', { type: 'file', id: 'cert-photo-input', accept: 'image/png,image/jpeg', multiple: true, class: 'sr-only', tabindex: '-1' });
    const photoBtn = h('button', { type: 'button', class: 'btn btn-secondary', id: 'cert-add-photo', text: 'Add photos', onclick: () => photoInput.click() });
    const photoList = h('ul', { class: 'cert-photos', id: 'cert-photo-list', 'aria-label': 'Attached photos' });
    const paintPhotos = () => photoList.replaceChildren(...st.photos.map((p, i) => h('li', {}, h('img', { src: `data:image/jpeg;base64,${p.dataB64}`, alt: `Photo ${i + 1}: ${p.name}` }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Remove', 'aria-label': `Remove photo ${p.name}`, onclick: () => { st.photos.splice(i, 1); paintPhotos(); } }))));
    paintPhotos();
    photoInput.addEventListener('change', async () => {
      const files = [...photoInput.files];
      photoInput.value = '';
      for (const f of files) {
        try {
          const head = new Uint8Array(await f.slice(0, 16).arrayBuffer());
          const problem = photoProblem(head, f.size, st.photos.length);
          if (problem) { say(problem, { assertive: true }); continue; }
          say(`Processing photo ${f.name}…`);
          const prepared = await preparePhoto(f);
          st.photos.push({ name: f.name.replace(/\.[^.]+$/, '') + '.jpg', sha256: prepared.sha256, dataB64: bytesToBase64(prepared.bytes), bytes: prepared.bytes });
          paintPhotos(); say(`${st.photos.length} photo${st.photos.length === 1 ? '' : 's'} attached.`);
        } catch (e) { say(`Could not use that photo: ${friendly(e)}`, { assertive: true }); }
      }
    });
    const err = h('p', { class: 'cert-error', id: 'cert-form-error', role: 'alert' });
    const sign = h('button', { type: 'submit', class: 'btn btn-primary', id: 'cert-sign', disabled: !ready.ready, 'aria-describedby': ready.ready ? null : 'cert-missing-h' }, h('span', { text: 'Sign and export' }));
    const draft = h('button', { type: 'button', class: 'btn btn-secondary', id: 'cert-draft', text: 'Export draft', hidden: ready.ready, onclick: () => run('draft') });
    const preview = h('button', { type: 'button', class: 'btn btn-secondary', id: 'cert-preview', text: 'Preview', onclick: () => run('preview') });
    form.append(h('h2', { text: 'Unit and tester' }),
      h('div', { class: 'field-grid' }, field('Model', model), field('Serial number (required)', serial), field('Firmware', firmware), field('Tester name (required)', tester), field('Valid for', validity)),
      field('Notes', notes, 'Shown on the certificate. Avoid personal details.'),
      h('div', { class: 'cert-photo-row' }, photoBtn, photoInput, h('span', { class: 'small muted', text: `Up to ${LIMITS.maxPhotos} PNG/JPEG photos, 5 MB each; downscaled to 1600 px, EXIF and GPS removed.` })), photoList,
      err, h('div', { class: 'action-bar' }, preview, draft, sign),
      ready.ready ? '' : h('p', { class: 'small muted', text: 'Signing is blocked until every required test has a result. A draft is watermarked DRAFT and unsigned.' }));
    form.addEventListener('submit', e => { e.preventDefault(); if (ready.ready) run('sign'); });
    form.addEventListener('input', () => { st.form = { key, serial: serial.value, firmware: firmware.value, tester: tester.value, notes: notes.value }; });

    const collect = () => {
      err.textContent = '';
      if (!serial.value.trim()) { err.textContent = 'Enter the serial number printed on the unit.'; serial.focus(); return null; }
      if (!tester.value.trim()) { err.textContent = 'Enter the tester name.'; tester.focus(); return null; }
      setSetting('certTester', tester.value.trim());
      return { serial: serial.value, firmware: firmware.value, tester: tester.value, notes: notes.value };
    };
    async function run(kind) {
      if (st.busy) return;
      const f = collect();
      if (!f) return;
      const cur = selection();
      const cal = calibrationStatus();
      const results = resultsFor(cur.asset.id);
      let payload;
      try {
        const deckchekVersion = await (globalThis.window?.__TAURI__?.app?.getVersion?.() ?? Promise.resolve('')).catch(() => '');
        const runs = await loadCalibrationRuns(cur.profile, results);
        // AC-6: calibration as recorded with each measurement; the profile active now is only a dated fallback.
        payload = buildPayloadAsMeasured({ asset: cur.asset, profile: cur.profile, results,
          ...f, photos: st.photos, validDays: st.validDays, now: new Date(), deckchekVersion: deckchekVersion || '' }, { runs, current: cal.state === 'calibrated' ? cal.profile : null });
      } catch (e) { err.textContent = e instanceof CertificateError ? `Cannot build the certificate: ${e.message}` : friendly(e); return; }
      if (kind === 'preview') return showPreview(payload);
      if (kind === 'draft') return exportDraft(payload);
      return signAndExport(cur, payload);
    }
    return form;
  }

  function showPreview(payload, file = null) {
    const card = q('#cert-preview-card');
    const draft = !file;
    card.hidden = false;
    card.replaceChildren(h('h2', { tabindex: '-1', id: 'cert-preview-h', text: draft ? 'Preview (unsigned)' : 'Signed certificate' }), h('div', { class: 'cert-preview', html: renderCertificateBody(file || { payload }, { draft }) }));
    card.querySelector('h2').focus();
  }

  async function exportDraft(payload) {
    try {
      const r = await saveTextFile({ suggestedName: `${certificateBaseName(payload)}-DRAFT`, ext: 'html', content: renderCertificateHtml(assembleCertificateFile(payload), { draft: true }) });
      if (!r.cancelled) toast('Draft certificate saved. It is unsigned and marked DRAFT.', { type: 'success', actions: savedActions(r.path) });
    } catch (e) { say(`Could not save the draft: ${friendly(e)}`, { assertive: true }); }
  }

  async function signAndExport({ profile, asset }, payload) {
    const btn = q('#cert-sign');
    st.busy = true; if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    try {
      const chosen = await dialog?.open?.({ directory: true, multiple: false, title: 'Choose a folder for the certificate' });
      const dir = Array.isArray(chosen) ? chosen[0] : chosen;
      if (!dir) { say('Export cancelled.'); return; }
      say('Signing…');
      const sign = await api.sign(payload);
      const file = assembleCertificateFile(payload, sign);
      let pdfHtml = null;
      if (pdfExportEnabled()) {
        const [{ composePrintable, loadPrintCss, readPdfSettings }] = await Promise.all([import('../../report-pdf.js'), import('../../report-kinds/certificate.js')]);
        const css = await loadPrintCss().catch(() => null);
        pdfHtml = composePrintable('certificate', { file }, { ...readPdfSettings(settings), css, appVersion: payload.deckchekVersion }).html;
      }
      say('Writing files…');
      const out = await exportCertificateFiles({ api, dir, file, pdfHtml });
      const stored = await api.store({ assetId: asset.id, profileId: profile.id, fileJson: JSON.stringify(file), pdfPath: out.pdfPath, jsonPath: out.jsonPath });
      for (const p of st.photos) {
        try { await photoStore.attach({ ownerKind: 'certificate', ownerId: stored.id, bytes: p.bytes, caption: p.name }); } catch { /* the photo is embedded in the certificate; the gallery link is optional */ }
      }
      showPreview(payload, file);
      const verdict = payload.verdict;
      const msg = `Certificate signed: ${VERDICT_LABEL[verdict]}. ${out.pdfPath ? 'PDF and' : 'HTML (the PDF could not be created) and'} .deckchek-cert.json saved.`;
      say(msg, { assertive: true });
      toast(out.pdfError ? `${msg} PDF error: ${out.pdfError.message}` : msg, { type: out.pdfError ? 'warn' : 'success', timeout: 10000, actions: savedActions(out.pdfPath || out.htmlPath || out.jsonPath) });
      await loadHistory();
    } catch (e) {
      const code = e?.code;
      if (code === 'key_corrupt') { st.identityError = friendly(e); q('#cert-identity')?.replaceWith(identityCard()); }
      say(`The certificate was not created: ${friendly(e)}`, { assertive: true });
    } finally {
      st.busy = false; if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
    }
  }

  function historyCard() { return h('section', { class: 'card', id: 'cert-history', 'aria-labelledby': 'cert-history-h' }, h('h2', { id: 'cert-history-h', text: 'Certificates for this unit' }), h('div', { id: 'cert-history-list' })); }
  function renderHistory() {
    const host = q('#cert-history-list');
    if (!host) return;
    if (!st.history.length) { host.replaceChildren(h('p', { class: 'muted', text: 'No certificates yet for this unit.' })); return; }
    host.replaceChildren(h('ul', { class: 'cert-list' }, ...st.history.map(c => h('li', { class: 'cert-history-row' },
      h('span', { class: 'cert-verdict', 'data-verdict': c.verdict, text: `${VERDICT_ICON[c.verdict] || ''} ${VERDICT_LABEL[c.verdict] || c.verdict}` }),
      h('span', { text: ` · ${String(c.issuedAt).slice(0, 10)} · serial ${c.serialNumber} · hash ${c.contentHash.slice(0, 12)}… · valid until ${String(c.validUntil).slice(0, 10)} ` }),
      ...(c.jsonPath ? savedActions(c.jsonPath).slice(1).map(a => h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Reveal file', onclick: a.run })) : [])))));
  }
  async function loadHistory() {
    const sel = selection();
    if (!native || !sel) return;
    try { st.history = await api.list(sel.asset.id); } catch { st.history = []; }
    renderHistory();
  }
  async function loadIdentity() {
    try { st.identity = await api.identity(); st.identityError = null; }
    catch (e) { st.identityError = e?.code === 'key_corrupt' ? `${friendly(e)}.` : `Signing identity unavailable: ${friendly(e)}`; }
    q('#cert-identity')?.replaceWith(identityCard());
  }

  render();
  return {
    onShow: async () => {
      const handoff = takeHandoff('certificate');
      if (native) {
        await ensureLibrary(); await refreshUnits();
        if (handoff?.profileId && handoff?.assetId) st.key = `${handoff.profileId}::${handoff.assetId}`;
      }
      render();
      if (native) { loadIdentity(); loadHistory(); }
    },
    onEscape: () => { const card = q('#cert-preview-card'); if (card && !card.hidden) { card.hidden = true; q('#cert-sign, #cert-preview')?.focus(); return true; } return false; },
  };
}

let shortcutInstalled = false;
/** Rail entries (flag `certificates`) and the Ctrl+Shift+V shortcut to the Verify screen. */
export function certificateScreenDefs() {
  const main = document.getElementById('main');
  for (const id of ['certificate', 'verify']) if (main && !document.getElementById(`screen-${id}`)) main.append(h('section', { class: 'screen', id: `screen-${id}`, hidden: true }));
  if (!shortcutInstalled) {
    shortcutInstalled = true;
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.key.toLowerCase() !== 'v' || isTyping(e.target) || !isEnabled('certificates') || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      go('verify', { focus: true });
    });
  }
  return [
    { id: 'certificate', title: 'Certificates', short: 'Certify', icon: 'file', feature: 'certificates', create: createCertificateScreen },
    { id: 'verify', title: 'Verify certificate', short: 'Verify', icon: 'check', feature: 'certificates', create: createVerifyScreen },
  ];
}
