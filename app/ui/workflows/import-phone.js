// Import phone results (FS-30, flag features.phoneImport): paste or open a DeckChek Mobile export (JSON, or QR
// text with one frame per line), see what it holds and whether its hash matches, pick the asset it belongs to
// and add it to History as a run with origin "phone". Parsing and validation live in app/phone-run.js; this file
// is the controller (pure view-model helpers, unit-tested) and the screen. Imported text is only ever shown with
// textContent, never as markup.

import { h, pickFile } from '../dom.js';
import { icon, chip } from '../icons.js';
import { announce, toast } from '../live.js';
import { go } from '../shell.js';
import { store, workspace } from '../state.js';
import { persistRun } from '../persistence.js';
import { parsePhoneRun, phoneRunToHistoryRun, describeDevice, MAX_BYTES } from '../../phone-run.js';

export { parsePhoneRun };

/** Hash state as a word plus a tone (never colour alone). */
export function hashStatus(parsed) {
  if (!parsed?.ok) return null;
  if (parsed.hashOk === true) return { tone: 'pass', word: 'Hash matches', detail: 'The file is exactly as the phone exported it.' };
  if (parsed.hashOk === false) return { tone: 'warn', word: 'Hash differs', detail: 'The file was changed or damaged after export. Check the numbers before importing.' };
  return { tone: 'review', word: 'No hash', detail: 'The export carries no hash, so damage cannot be detected.' };
}

const fmt = v => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6))));

/** Rows for the preview table: [label, value + unit, uncertainty, confidence]. */
export function previewRows(run) {
  return (run?.measurements || []).map(m => [
    m.label || m.metricId, `${fmt(m.value)}${m.unit ? ` ${m.unit}` : ''}`,
    m.uncertainty == null ? '—' : `± ${fmt(m.uncertainty)}`, m.confidence == null ? '—' : `${Math.round(m.confidence * 100)} %`,
  ]);
}

const norm = s => String(s ?? '').trim().toLowerCase();

/** Asset to preselect: serial match first, then exact nickname, else null (the person chooses). */
export function suggestAsset(assets, hint) {
  const list = Array.isArray(assets) ? assets : [];
  const serial = norm(hint?.serial), nick = norm(hint?.nickname);
  if (serial) { const a = list.find(x => norm(x.serialNumber ?? x.serial) === serial); if (a) return a.id; }
  if (nick) { const a = list.find(x => norm(x.nickname) === nick); if (a) return a.id; }
  return null;
}

const when = iso => { const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return Number.isNaN(d.getTime()) ? String(iso) : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

export function createPhoneImportScreen(section) {
  const st = { parsed: null, assets: [], busy: false, imported: null, pendingAsset: undefined };
  const text = h('textarea', { id: 'pi-text', class: 'pi-text', rows: '8', spellcheck: 'false', autocomplete: 'off', 'aria-describedby': 'pi-help',
    placeholder: '{"format":"deckchek-mobile", …}   or   DCKM1/1/3/…  (one QR frame per line)' });
  const status = h('div', { id: 'pi-status', class: 'pi-status', role: 'status', 'aria-live': 'polite' });
  const preview = h('div', { id: 'pi-preview' });

  const setStatus = (message, tone = 'info') => { status.replaceChildren(); if (message) status.append(h('p', { class: `hint hint-${tone}`, text: message })); };

  async function loadAssets() {
    try { st.assets = (await store.list('asset')).filter(a => !a.isDeleted); } catch { st.assets = []; }
  }

  function read() {
    st.imported = null;
    st.parsed = parsePhoneRun(text.value);
    if (!st.parsed.ok) { setStatus(st.parsed.errors.join(' '), 'warn'); announce('Could not read the result.'); renderPreview(); return; }
    setStatus('');
    announce(`Result read: ${st.parsed.run.measurements.length} measurements.`);
    renderPreview();
  }

  async function chooseFile() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    if (file.size > MAX_BYTES) { setStatus('That file is larger than 1 MB, so DeckChek will not read it.', 'warn'); return; }
    text.value = await file.text();
    read();
  }

  async function addToHistory(assetId) {
    if (st.busy || !st.parsed?.ok) return;
    st.busy = true; renderPreview();
    try {
      const run = phoneRunToHistoryRun(st.parsed, { assetId: assetId || null });
      const replaced = workspace.runs.some(r => r.id === run.id);
      const res = await persistRun(run);
      st.imported = { id: run.id, replaced, ok: res.ok, error: res.error };
      if (res.ok) toast(replaced ? 'Phone results updated in History.' : 'Phone results added to History.', { type: 'success' });
      else toast(`Kept in this window only; the database save failed: ${res.error}`, { type: 'warn' });
      announce('Phone results added to History.');
    } catch (error) {
      setStatus(`Could not add the result: ${error?.message || error}`, 'warn');
    } finally { st.busy = false; renderPreview(); }
  }

  function renderPreview() {
    preview.replaceChildren();
    const p = st.parsed;
    if (!p) { preview.append(h('p', { class: 'muted', text: 'Nothing read yet. On your phone choose Export in DeckChek Mobile, then paste the text here or open the .deckchek-mobile.json file.' })); return; }
    if (!p.ok) return;
    const hs = hashStatus(p);
    const run = p.run;
    const select = h('select', { id: 'pi-asset', 'aria-label': 'Asset these results belong to' }, h('option', { value: '', text: 'No asset (keep it unassigned)' }),
      ...st.assets.map(a => h('option', { value: a.id, text: a.nickname || a.id })));
    select.value = st.pendingAsset ?? suggestAsset(st.assets, run.assetHint) ?? '';
    select.addEventListener('change', () => { st.pendingAsset = select.value; });
    const hint = run.assetHint.nickname || run.assetHint.serial;
    preview.append(h('div', { class: 'card pi-card' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title', text: 'What the phone sent' }),
        h('span', { class: 'pi-hash', 'data-hash': String(p.hashOk), html: chip(hs.tone, hs.word) })),
      h('p', { class: 'muted', text: hs.detail }),
      ...p.warnings.filter(w => w !== hs.detail).map(w => h('p', { class: 'hint hint-warn', text: w })),
      h('dl', { class: 'pi-facts' },
        h('dt', { text: 'Measured' }), h('dd', { text: when(run.createdAt) }),
        h('dt', { text: 'Phone' }), h('dd', { text: describeDevice(run) }),
        h('dt', { text: 'App' }), h('dd', { text: run.app || '—' }),
        hint ? [h('dt', { text: 'Asset hint' }), h('dd', { text: [run.assetHint.nickname, run.assetHint.serial].filter(Boolean).join(' · ') })] : null,
        run.notes ? [h('dt', { text: 'Notes' }), h('dd', { text: run.notes })] : null),
      h('table', { class: 'pi-table' }, h('caption', { class: 'sr-only', text: 'Measurements in this result' }),
        h('thead', {}, h('tr', {}, ...['Measurement', 'Value', 'Uncertainty', 'Confidence'].map(t => h('th', { scope: 'col', text: t })))),
        h('tbody', {}, ...previewRows(run).map(r => h('tr', {}, ...r.map((c, i) => h(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row', text: c } : { class: 'pi-num', text: c })))))),
      h('p', { class: 'hint', text: 'Phone microphones are not calibrated. These numbers are kept as phone results and are never combined with a desktop calibration profile.' }),
      h('div', { class: 'pi-actions' },
        h('label', { for: 'pi-asset', class: 'field-label', text: 'Add to the history of' }), select,
        h('button', { type: 'button', class: 'btn btn-primary', id: 'pi-import', disabled: st.busy, text: st.busy ? 'Adding…' : 'Add to History', onclick: () => addToHistory(select.value) }))));
    if (st.imported) {
      preview.append(h('div', { class: 'card pi-done', id: 'pi-done' },
        h('p', { text: st.imported.ok ? (st.imported.replaced ? 'Updated the earlier import of this result in History.' : 'Added to History as a phone result.') : `Kept in this window only (${st.imported.error}).` }),
        h('button', { type: 'button', class: 'btn btn-secondary', text: 'Open History', onclick: () => go('history', { focus: true }) })));
    }
  }

  section.replaceChildren(
    h('header', { class: 'screen-head' }, h('div', { class: 'screen-title' }, h('span', { class: 'screen-icon', html: icon('upload', { size: 24 }) }),
      h('div', {}, h('h1', { tabindex: '-1', text: 'Import phone results' }),
        h('p', { class: 'lede', text: 'Bring a speed, strobe, vibration or sound-level result from DeckChek Mobile into History. Nothing is sent anywhere: you paste or open the file yourself.' })))),
    h('div', { class: 'card pi-card' },
      h('label', { for: 'pi-text', class: 'field-label', text: 'Result text' }), text,
      h('p', { id: 'pi-help', class: 'muted small', text: 'Paste the JSON, or the text of the QR code (for a result in several QR codes, one frame per line, any order). Up to 1 MB.' }),
      h('div', { class: 'pi-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', id: 'pi-read', text: 'Read result', onclick: read }),
        h('button', { type: 'button', class: 'btn btn-secondary', id: 'pi-file', onclick: chooseFile }, h('span', { html: icon('file', { size: 18 }) }), h('span', { text: 'Open file…' })),
        h('button', { type: 'button', class: 'btn btn-secondary', id: 'pi-clear', text: 'Clear', onclick: () => { text.value = ''; st.parsed = null; st.imported = null; st.pendingAsset = undefined; setStatus(''); renderPreview(); text.focus(); } })),
      status),
    preview);
  renderPreview();
  loadAssets().then(() => { if (st.parsed?.ok) renderPreview(); });
  return { onShow: () => { loadAssets().then(() => { if (st.parsed?.ok) renderPreview(); }); }, onEscape: () => false };
}

export function phoneImportScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-phoneimport')) main.append(h('section', { class: 'screen', id: 'screen-phoneimport', hidden: true }));
  return [{ id: 'phoneimport', title: 'Import phone results', short: 'Phone', icon: 'upload', feature: 'phoneImport', create: createPhoneImportScreen }];
}

