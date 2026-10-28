// Gear ledger screen (FS-33 §3): 1 Select gear, 2 Privacy (presets + per-field/per-item matrix, owner name, public
// notes), 3 Preview (sandboxed iframe, light/dark, "What will be public" summary), 4 Export (folder or single file)
// with the "How to publish" guide. Engine: app/ledger/ (pure); I/O: app/ledger/api.js. Flag: features.gearLedger.
// Keyboard: Ctrl+E opens the export step (and exports when already there), Esc cancels back to step 1, Tab follows
// the wizard. Browser mode: single-file download only; the folder export needs the desktop app.

import { h, isNative } from '../dom.js';
import { icon } from '../icons.js';
import { toast, announce } from '../live.js';
import { go } from '../shell.js';
import { takeHandoff } from '../crosslinks.js';
import { createLedgerApi } from '../../ledger/api.js';
import { buildLedger, previewHtml, compareWithPrevious, LEDGER_DIR, SINGLE_FILE_MAX_BYTES } from '../../ledger/build.js';
import { FIELDS, PRESETS, PRESET_LABELS, SERIAL_MODES, makeRules, normalizeRules, matchesPreset, effectiveRules, MAX_OWNER_CHARS } from '../../ledger/privacy.js';
import { preparePhoto } from '../../photo-store.js';

const STEPS = [['select', 'Select gear'], ['privacy', 'Privacy'], ['preview', 'Preview'], ['export', 'Export']];
const SERIAL_LABEL = { hidden: 'Hidden', masked: 'Masked (last 4)', full: 'Full' };
const friendly = e => (typeof e === 'string' ? e : e?.message || 'Something went wrong.');

/** Pure: the step-1 label and status words for one gear row (status is words, never colour alone). */
export function gearRowText(row) {
  const a = row.asset;
  const model = [row.manufacturer, row.model].filter(Boolean).join(' ');
  const status = [
    row.photos ? `${row.photos} photo${row.photos === 1 ? '' : 's'}` : 'no photos',
    row.certificates ? `${row.certificates} certificate${row.certificates === 1 ? '' : 's'}` : null,
    row.service ? `${row.service} service entr${row.service === 1 ? 'y' : 'ies'}` : null,
    a.retiredDate ? 'retired' : null,
  ].filter(Boolean);
  return { title: a.nickname || model || 'Unit', model, status };
}

/** Pure: the numbered GitHub Pages guide (AC-6). `folder` is the exported folder's name. */
export function publishSteps(folder = LEDGER_DIR) {
  return [
    'On github.com, create a new repository (public, if you want the ledger to be public).',
    `Upload the contents of the exported "${folder}" folder (index.html, ledger.json and the assets and certificates folders) with "Add file > Upload files", or push them with git.`,
    'Open Settings > Pages, choose "Deploy from a branch", pick the branch (main) and the root folder, and save.',
    'Wait for the Pages build, then open the address GitHub shows. Check that only the fields in the privacy summary are visible.',
  ];
}
export const PUBLISH_COPY = 'Create a repository, upload the exported folder (or push it), then Settings > Pages > Deploy from branch. DeckChek never uploads for you. Check the privacy summary below before making it public.';
export const RETRACT_NOTE = 'Deleting the ledger from your computer does not remove copies you already published or shared.';

export function createLedgerScreen(section, { api = createLedgerApi(), reencode = async bytes => (await preparePhoto(bytes)).bytes } = {}) {
  const native = isNative() && api.native;
  const st = { step: 'select', loading: true, loadError: null, gear: null, selected: new Set(), rules: makeRules('public'), result: null, resultKey: null,
    theme: 'light', busy: false, history: [], done: null, exportError: null, mode: 'folder', progress: '' };
  section.innerHTML = '';
  const title = h('h1', { tabindex: '-1', text: 'Gear ledger' });
  section.append(
    h('header', { class: 'screen-head' }, h('div', { class: 'screen-title' }, h('span', { class: 'screen-icon', html: icon('file', { size: 24 }) }),
      h('div', {}, title, h('p', { class: 'lede', text: 'A static, shareable record of your gear for resale, insurance or a venue rider: photos, service history and signed test certificates, with privacy controls. Nothing is uploaded; you publish it yourself.' })))),
    h('ol', { class: 'stepper ledger-stepper', id: 'ledger-stepper', 'aria-label': 'Ledger steps' }),
    h('div', { id: 'ledger-status', class: 'ledger-status', role: 'status', 'aria-live': 'polite' }),
    h('div', { id: 'ledger-body', class: 'ledger-body' }));
  const q = s => section.querySelector(s);
  const status = text => { q('#ledger-status').textContent = text; };

  function renderStepper() {
    const idx = STEPS.findIndex(([id]) => id === st.step);
    q('#ledger-stepper').replaceChildren(...STEPS.map(([id, label], i) => {
      const state = i === idx ? 'current' : i < idx ? 'done' : 'upcoming';
      const b = h('button', { type: 'button', class: `step step-${state}`, 'data-step': id, 'aria-current': state === 'current' ? 'step' : null, 'aria-disabled': state === 'upcoming' ? 'true' : null, tabindex: state === 'upcoming' ? '-1' : null },
        h('span', { class: 'step-num', html: state === 'done' ? icon('check', { size: 16 }) : String(i + 1) }), h('span', { class: 'step-label', text: label }));
      if (state === 'done') b.addEventListener('click', () => setStep(id));
      return h('li', {}, b);
    }));
  }

  function setStep(step, { focus = true } = {}) {
    st.step = step;
    if (step !== 'export') { st.done = null; st.exportError = null; }
    if (step === 'select' || step === 'privacy') st.buildError = null;
    render();
    if (focus) q('#ledger-body h2')?.focus();
    if (step === 'preview') ensureBuilt();
  }

  function render() {
    renderStepper();
    const body = q('#ledger-body');
    if (st.loading) { body.replaceChildren(h('div', { class: 'empty', html: '<span class="spinner" aria-hidden="true"></span><h2 tabindex="-1">Loading your gear…</h2>' })); return; }
    if (st.loadError) { body.replaceChildren(h('div', { class: 'empty', id: 'ledger-error', html: `${icon('fail', { size: 40 })}<h2 tabindex="-1">Could not load your gear</h2>` }, h('p', { text: st.loadError }), h('button', { type: 'button', class: 'btn btn-secondary', text: 'Try again', onclick: load }))); return; }
    if (!st.gear?.rows.length) {
      body.replaceChildren(h('div', { class: 'empty', id: 'ledger-empty', html: `${icon('equipment', { size: 40 })}<h2 tabindex="-1">Add equipment first</h2><p>The ledger lists the units you own. Add them in Equipment (or let the device library create them), then come back.</p>` },
        h('button', { type: 'button', class: 'btn btn-primary', text: 'Open Equipment', onclick: () => go('equipment', { focus: true }) })));
      return;
    }
    body.replaceChildren(({ select: selectStep, privacy: privacyStep, preview: previewStep, export: exportStep })[st.step]());
  }

  // ---------------------------------------------------------------- step 1
  function selectStep() {
    const rows = st.gear.rows;
    const list = h('ul', { class: 'ledger-gear', id: 'ledger-gear' }, ...rows.map(r => {
      const t = gearRowText(r);
      const id = `lg-${r.asset.id}`.replace(/[^A-Za-z0-9_-]/g, '_');
      const box = h('input', { type: 'checkbox', id, 'data-asset': r.asset.id, checked: st.selected.has(r.asset.id) });
      box.addEventListener('change', () => { if (box.checked) st.selected.add(r.asset.id); else st.selected.delete(r.asset.id); st.result = null; count.textContent = countText(); });
      return h('li', {}, box, h('label', { for: id }, h('span', { class: 'ledger-gear-title', text: t.title }), t.model && t.model !== t.title ? h('span', { class: 'muted', text: ` — ${t.model}` }) : null,
        h('span', { class: 'ledger-gear-status small muted', text: t.status.join(' · ') })));
    }));
    const countText = () => `${st.selected.size} of ${rows.length} selected`;
    const count = h('p', { class: 'muted small', id: 'ledger-count', 'aria-live': 'polite', text: countText() });
    const all = on => () => { for (const r of rows) on ? st.selected.add(r.asset.id) : st.selected.delete(r.asset.id); st.result = null; render(); };
    const last = st.history[0];
    const err = h('p', { class: 'form-error', id: 'ledger-select-error', role: 'alert' });
    return h('section', { class: 'card', 'aria-labelledby': 'ledger-h-select' },
      h('h2', { class: 'card-title', id: 'ledger-h-select', tabindex: '-1', text: '1. Select gear' }),
      last ? h('p', { class: 'muted small', id: 'ledger-last', text: `Last export: revision ${last.revision} on ${String(last.createdAt).slice(0, 10)}. The next export becomes revision ${last.revision + 1}.` }) : null,
      h('fieldset', { class: 'ledger-fieldset' }, h('legend', { text: 'Units in the ledger' }),
        h('div', { class: 'action-bar' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Select all', onclick: all(true) }), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Select none', onclick: all(false) })),
        list, count),
      err,
      h('div', { class: 'action-bar' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'ledger-next-privacy', text: 'Next: privacy', onclick: () => {
        if (!st.selected.size) { err.textContent = 'Pick at least one unit.'; q(`#ledger-gear input`)?.focus(); return; }
        setStep('privacy');
      } })));
  }

  // ---------------------------------------------------------------- step 2
  function selectedRows() { return st.gear.rows.filter(r => st.selected.has(r.asset.id)); }
  function changed() { st.result = null; if (!matchesPreset(st.rules) && st.rules.preset !== 'custom') st.rules.preset = 'custom'; }

  function privacyStep() {
    const rows = selectedRows();
    const presets = h('fieldset', { class: 'ledger-presets', id: 'ledger-presets' }, h('legend', { text: 'Preset' }),
      ...Object.keys(PRESETS).map(name => {
        const id = `ledger-preset-${name}`;
        const r = h('input', { type: 'radio', name: 'ledger-preset', id, value: name, checked: st.rules.preset === name });
        r.addEventListener('change', () => { const owner = st.rules.ownerName; st.rules = { ...makeRules(name), ownerName: owner }; st.result = null; render(); q(`#${id}`)?.focus(); announce(`${PRESET_LABELS[name]} preset`); });
        return h('label', { class: 'ledger-radio', for: id }, r, h('span', { text: PRESET_LABELS[name] }));
      }),
      st.rules.preset === 'custom' ? h('span', { class: 'chip chip-info', id: 'ledger-custom', text: 'Custom' }) : null);
    const serial = h('select', { id: 'ledger-serial' }, ...SERIAL_MODES.map(m => h('option', { value: m, text: SERIAL_LABEL[m] })));
    serial.value = st.rules.serialMode;
    serial.addEventListener('change', () => { st.rules.serialMode = serial.value; changed(); render(); q('#ledger-serial')?.focus(); });
    const owner = h('input', { type: 'text', id: 'ledger-owner', maxlength: String(MAX_OWNER_CHARS), autocomplete: 'off', value: st.rules.ownerName || '' });
    owner.addEventListener('change', () => { st.rules.ownerName = owner.value; st.result = null; });

    // matrix: rows = items, columns = fields; the header row sets the field for every item
    const head = h('tr', {}, h('th', { scope: 'col', text: 'Unit' }), h('th', { scope: 'col', text: 'Include' }), h('th', { scope: 'col', text: 'Serial' }),
      ...FIELDS.map(f => {
        const box = h('input', { type: 'checkbox', 'data-field': f.key, 'aria-label': `${f.label}: all units`, checked: st.rules.fields[f.key] });
        box.addEventListener('change', () => {
          st.rules.fields[f.key] = box.checked;
          for (const o of Object.values(st.rules.items)) if (o.fields) delete o.fields[f.key];
          changed(); render(); q(`#ledger-matrix thead input[data-field="${f.key}"]`)?.focus();
        });
        return h('th', { scope: 'col' }, h('span', { class: 'ledger-col', text: f.label, title: f.hint || '' }), box);
      }));
    const bodyRows = rows.map(r => {
      const id = r.asset.id, t = gearRowText(r), eff = effectiveRules(st.rules, id), o = (st.rules.items[id] ??= {});
      const inc = h('input', { type: 'checkbox', 'data-include': id, 'aria-label': `Include ${t.title}`, checked: o.include !== false });
      inc.addEventListener('change', () => { o.include = inc.checked; st.result = null; });
      const ser = h('select', { 'data-serial': id, 'aria-label': `Serial number for ${t.title}` }, ...SERIAL_MODES.map(m => h('option', { value: m, text: SERIAL_LABEL[m] })));
      ser.value = eff.serialMode;
      ser.addEventListener('change', () => { if (ser.value === st.rules.serialMode) delete o.serialMode; else o.serialMode = ser.value; changed(); });
      return h('tr', {}, h('th', { scope: 'row', text: t.title }), h('td', {}, inc), h('td', {}, ser), ...FIELDS.map(f => {
        const box = h('input', { type: 'checkbox', 'data-item-field': `${id}|${f.key}`, 'aria-label': `${f.label} for ${t.title}`, checked: eff.fields[f.key] });
        box.addEventListener('change', () => { o.fields ??= {}; if (box.checked === st.rules.fields[f.key]) delete o.fields[f.key]; else o.fields[f.key] = box.checked; changed(); });
        return h('td', {}, box);
      }));
    });
    const notes = rows.map(r => {
      const t = gearRowText(r), id = `ledger-note-${r.asset.id}`.replace(/[^A-Za-z0-9_-]/g, '_');
      const ta = h('textarea', { id, rows: '2', maxlength: '2000', 'data-note': r.asset.id });
      ta.value = r.asset.publicNotes || '';
      ta.addEventListener('change', async () => {
        try { const saved = await api.setPublicNote(r.asset.id, ta.value); r.asset.publicNotes = saved.publicNotes; st.result = null; status(`Public note saved for ${t.title}.`); }
        catch (e) { status(`Could not save the note: ${friendly(e)}`); }
      });
      return h('div', { class: 'field' }, h('label', { class: 'field-label', for: id, text: `Public note: ${t.title}` }), ta);
    });
    return h('section', { class: 'card', 'aria-labelledby': 'ledger-h-privacy' },
      h('h2', { class: 'card-title', id: 'ledger-h-privacy', tabindex: '-1', text: '2. Privacy' }),
      h('p', { class: 'muted', text: 'Choose what the ledger shows. Public hides serial numbers and nicknames; Insurance masks serials to the last 4 characters. Prices, venues, file paths and photo metadata (EXIF, GPS) are never exported. Private notes stay out unless you tick them.' }),
      presets,
      h('div', { class: 'field-grid' },
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'ledger-serial', text: 'Serial numbers (all units)' }), serial),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'ledger-owner', text: 'Owner name on the page (optional)' }), owner)),
      h('div', { class: 'table-wrap ledger-matrix-wrap' }, h('table', { class: 'ledger-matrix', id: 'ledger-matrix' }, h('caption', { class: 'sr-only', text: 'Fields per unit' }), h('thead', {}, head), h('tbody', {}, ...bodyRows))),
      h('details', { class: 'ledger-notes' }, h('summary', { text: 'Public notes (written for this ledger)' }), ...notes),
      h('div', { class: 'action-bar' },
        h('button', { type: 'button', class: 'btn btn-secondary', text: 'Back', onclick: () => setStep('select') }),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'ledger-next-preview', text: 'Next: preview', onclick: () => setStep('preview') })));
  }

  // ---------------------------------------------------------------- build (shared by preview and export)
  const key = () => JSON.stringify([[...st.selected].sort(), normalizeRules(st.rules), st.gear?.rows.map(r => r.asset.publicNotes)]);
  async function build({ mode = 'folder', revision } = {}) {
    const ids = [...st.selected];
    const state = await api.loadState(st.gear, ids, { onProgress: p => { st.progress = p.total ? `Processing photos and certificates: ${p.done} of ${p.total} units` : ''; const el = q('#ledger-progress'); if (el) el.textContent = st.progress; } });
    const result = await buildLedger(state, { items: ids }, st.rules, { revision: revision ?? await api.nextRevision(), mode, reencode });
    for (const p of state.problems) result.skipped.push({ item: st.gear.rows.find(r => r.asset.id === p.assetId)?.asset.nickname || 'Unit', what: p.what, reason: p.reason });
    return result;
  }
  async function ensureBuilt() {
    if (st.result && st.resultKey === key()) return st.result;
    if (st.busy) return null;
    st.busy = true; st.buildError = null; render();
    try { st.result = await build(); st.resultKey = key(); }
    catch (e) { st.result = null; st.buildError = friendly(e); }
    finally { st.busy = false; }
    if (st.step === 'preview' || st.step === 'export') { render(); status(st.buildError ? `Preview failed: ${st.buildError}` : 'Preview ready.'); }
    return st.result;
  }

  function summaryCard(result) {
    const s = result.summary;
    const lines = s.fields.filter(f => f.items).map(f => h('li', { text: `${f.label}: ${f.items} of ${s.items} units${f.detail ? ` (${f.detail})` : ''}` }));
    return h('section', { class: 'ledger-summary', id: 'ledger-summary', 'aria-labelledby': 'ledger-h-summary' },
      h('h3', { id: 'ledger-h-summary', text: 'What will be public' }),
      h('ul', {}, h('li', { text: `${s.items} unit${s.items === 1 ? '' : 's'}, ${s.photos} photo${s.photos === 1 ? '' : 's'}, ${s.certificates} certificate${s.certificates === 1 ? '' : 's'}` }), ...lines,
        s.owner ? h('li', { text: `Owner name: ${s.owner}` }) : null),
      h('p', { class: 'small muted', text: `Never included: ${s.never.map(n => n.label.toLowerCase()).join(', ')}.` }),
      s.warnings.length ? h('ul', { class: 'ledger-warnings', id: 'ledger-warnings' }, ...s.warnings.map(w => h('li', { html: `${icon('warn', { size: 16 })} ` }, h('span', { text: w })))) : null,
      s.altGenerated ? h('p', { class: 'ledger-warn', id: 'ledger-alt-warning', html: `${icon('warn', { size: 16 })} ` }, h('span', { text: `${s.altGenerated} photo${s.altGenerated === 1 ? ' has' : 's have'} no description; generated alt text ("<unit>, photo N") is used. Add a caption in Equipment for better descriptions.` })) : null,
      result.skipped.length ? h('div', { id: 'ledger-partial', class: 'ledger-warn' }, h('p', { html: `${icon('warn', { size: 16 })} <b>Partial:</b> some things were left out.` }),
        h('ul', {}, ...result.skipped.map(x => h('li', { text: `${x.item}: ${x.what} — ${x.reason}` })))) : null);
  }

  // ---------------------------------------------------------------- step 3
  function previewStep() {
    const card = h('section', { class: 'card', 'aria-labelledby': 'ledger-h-preview' }, h('h2', { class: 'card-title', id: 'ledger-h-preview', tabindex: '-1', text: '3. Preview' }));
    if (st.busy || (!st.result && !st.buildError)) { card.append(h('p', { id: 'ledger-progress', 'aria-live': 'polite', text: st.progress || 'Building the ledger…' })); return card; }
    if (st.buildError) {
      card.append(h('p', { class: 'form-error', id: 'ledger-build-error', role: 'alert', text: st.buildError }), h('div', { class: 'action-bar' }, h('button', { type: 'button', class: 'btn btn-secondary', text: 'Back', onclick: () => setStep('privacy') })));
      return card;
    }
    const themes = h('div', { class: 'ledger-theme', role: 'group', 'aria-label': 'Preview theme' }, ...['light', 'dark'].map(t => h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-theme-choice': t, 'aria-pressed': String(st.theme === t), text: t === 'light' ? 'Light' : 'Dark',
      onclick: () => { st.theme = t; render(); q(`[data-theme-choice="${t}"]`)?.focus(); } })));
    const frame = h('iframe', { class: 'ledger-preview', id: 'ledger-preview', title: 'Ledger preview', sandbox: '', referrerpolicy: 'no-referrer' });
    frame.srcdoc = previewHtml(st.result, st.theme);
    card.append(summaryCard(st.result), themes, frame,
      h('p', { class: 'small muted', text: 'The preview runs no scripts; the exported page adds the certificate check buttons.' }),
      h('div', { class: 'action-bar' },
        h('button', { type: 'button', class: 'btn btn-secondary', text: 'Back', onclick: () => setStep('privacy') }),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'ledger-next-export', text: 'Next: export', onclick: () => setStep('export') })));
    return card;
  }

  // ---------------------------------------------------------------- step 4
  function exportStep() {
    const card = h('section', { class: 'card', 'aria-labelledby': 'ledger-h-export' }, h('h2', { class: 'card-title', id: 'ledger-h-export', tabindex: '-1', text: '4. Export' }));
    if (!st.result) {
      if (st.buildError) {
        card.append(h('p', { class: 'form-error', id: 'ledger-build-error', role: 'alert', text: st.buildError }),
          h('div', { class: 'action-bar' }, h('button', { type: 'button', class: 'btn btn-secondary', text: 'Back', onclick: () => { st.buildError = null; setStep('privacy'); } })));
        return card;
      }
      card.append(h('p', { id: 'ledger-progress', 'aria-live': 'polite', text: st.progress || 'Building the ledger…' }));
      if (!st.busy) queueMicrotask(ensureBuilt);
      return card;
    }
    const singleOk = st.result.singleFileOk;
    if (!native) st.mode = 'single';
    if (!singleOk && st.mode === 'single' && native) st.mode = 'folder';
    const modes = h('fieldset', { class: 'ledger-modes' }, h('legend', { text: 'Format' }),
      h('label', { class: 'ledger-radio', for: 'ledger-mode-folder' }, h('input', { type: 'radio', name: 'ledger-mode', id: 'ledger-mode-folder', value: 'folder', checked: st.mode === 'folder', disabled: !native }),
        h('span', { text: native ? `Folder (recommended): ${LEDGER_DIR}/index.html, ledger.json, assets/ and certificates/` : 'Folder: needs the DeckChek desktop app' })),
      h('label', { class: 'ledger-radio', for: 'ledger-mode-single' }, h('input', { type: 'radio', name: 'ledger-mode', id: 'ledger-mode-single', value: 'single', checked: st.mode === 'single', disabled: !singleOk }),
        h('span', { text: singleOk ? 'Single HTML file with photos inside' : `Single file: not available, photos exceed ${SINGLE_FILE_MAX_BYTES / 1048576} MB` })));
    modes.addEventListener('change', e => { if (e.target.name === 'ledger-mode') st.mode = e.target.value; });
    const cmp = compareWithPrevious(st.history[0] || null, { ...st.result.ledger, revision: (st.history[0]?.revision ?? 0) + 1 }, [...st.selected]);
    const outcome = h('div', { id: 'ledger-outcome', role: 'status', 'aria-live': 'polite' });
    if (st.done) {
      outcome.append(h('p', { class: 'ledger-ok', id: 'ledger-success', html: `${icon('pass', { size: 18 })} ` }, h('span', { text: st.done.path ? `Saved to ${st.done.path}. Open index.html in a browser to check it.` : 'Downloaded deckchek-gear-ledger.html. Open it in a browser to check it.' })),
        h('p', { class: 'small muted', text: `Revision ${st.done.revision} recorded.${st.done.path ? ' Files from earlier exports in that folder are replaced; delete photos you removed from the ledger by hand.' : ''}` }));
    }
    if (st.exportError) outcome.append(h('p', { class: 'form-error', id: 'ledger-export-error', role: 'alert', text: st.exportError }));
    card.append(
      h('p', { class: 'muted', id: 'ledger-revision', text: cmp.first ? 'This will be revision 1.' : `This will be revision ${cmp.revision} (last: ${cmp.previousRevision}). ${cmp.changed ? 'The content changed since then' : 'The content is the same as last time'}${cmp.added || cmp.removed ? `: ${cmp.added} unit(s) added, ${cmp.removed} removed` : ''}. ledger.json is written with sorted keys, so two exports compare line by line.` }),
      modes,
      h('div', { class: 'action-bar' },
        h('button', { type: 'button', class: 'btn btn-secondary', text: 'Back', onclick: () => setStep('preview') }),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'ledger-export', disabled: st.busy || (!native && !singleOk), html: `${icon('download', { size: 16 })}<span>${st.busy ? 'Exporting…' : 'Export…'}</span>`, onclick: doExport })),
      outcome,
      h('section', { class: 'ledger-publish', id: 'ledger-publish', 'aria-labelledby': 'ledger-h-publish' },
        h('h3', { id: 'ledger-h-publish', text: 'How to publish (GitHub Pages)' }),
        h('p', { text: PUBLISH_COPY }),
        h('ol', { id: 'ledger-publish-steps' }, ...publishSteps(st.mode === 'single' ? 'deckchek-gear-ledger.html' : LEDGER_DIR).map(s => h('li', { text: s }))),
        h('p', { class: 'small muted', text: `${RETRACT_NOTE} DeckChek never asks for GitHub credentials.` })),
      summaryCard(st.result));
    return card;
  }

  async function doExport() {
    if (st.busy) return;
    st.busy = true; st.done = null; st.exportError = null;
    render();
    status('Exporting the ledger…');
    try {
      const revision = await api.nextRevision();
      const result = await build({ mode: st.mode, revision });
      const out = st.mode === 'single' ? await api.saveSingle(result.html) : await api.writeFolder(result.files);
      if (out.cancelled) { status('Export cancelled.'); return; }
      const row = await api.recordExport({ revision, selection: { items: [...st.selected].sort(), mode: st.mode }, privacy: normalizeRules(st.rules), ledgerSha256: result.ledger.ledgerSha256 });
      st.history = [row, ...st.history];
      st.result = result; st.resultKey = key();
      const path = out.path ? `${out.path.replace(/[\\/]+$/, '')}${out.path.includes('\\') && !out.path.includes('/') ? '\\' : '/'}${st.mode === 'single' ? '' : LEDGER_DIR}` : null;
      st.done = { path: st.mode === 'single' ? out.path : path, revision: row.revision };
      toast(`Ledger revision ${row.revision} saved.`, { type: 'success' });
      status(`Ledger revision ${row.revision} saved.`);
    } catch (e) {
      st.exportError = `Export failed: ${friendly(e)}`;
      status(st.exportError);
    } finally {
      st.busy = false;
      if (st.step === 'export') { render(); q(st.done ? '#ledger-success' : '#ledger-export')?.focus?.(); }
    }
  }

  async function load() {
    st.loading = true; st.loadError = null; render();
    try {
      const [gear, history] = await Promise.all([api.listGear(), api.listExports(5).catch(() => [])]);
      st.gear = gear; st.history = history;
      const last = history[0];
      if (last && !st.selected.size) {
        const ids = new Set(gear.rows.map(r => r.asset.id));
        for (const id of last.selection?.items || []) if (ids.has(id)) st.selected.add(id);
        st.rules = normalizeRules(last.privacy);
      }
    } catch (e) { st.loadError = friendly(e); }
    st.loading = false;
    applyHandoff();
    render();
  }
  let handoff = null;
  function applyHandoff() {
    if (!handoff || !st.gear) return;
    if (handoff.assetId && st.gear.rows.some(r => r.asset.id === handoff.assetId)) { st.selected.add(handoff.assetId); st.result = null; }
    handoff = null;
  }

  render();
  let loaded = false;
  return {
    onShow: () => {
      handoff = takeHandoff('ledger');
      // Reload the gear list while on step 1 (the device library may have added units since); keep the wizard otherwise.
      if (!loaded || (st.step === 'select' && !st.busy)) { loaded = true; load(); } else { applyHandoff(); render(); }
    },
    onExport: () => {
      if (!st.gear?.rows.length || st.busy) return;
      if (!st.selected.size) { setStep('select'); status('Pick at least one unit to export.'); return; }
      if (st.step === 'export' && st.result) doExport(); else setStep('export');
    },
    onEscape: () => {
      if (st.busy || st.step === 'select') return false;
      setStep('select');
      status('Ledger export cancelled.');
      announce('Ledger export cancelled');
      return true;
    },
  };
}

/** Rail entry (flag gearLedger). */
export function ledgerScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-ledger')) main.append(h('section', { class: 'screen', id: 'screen-ledger', hidden: true }));
  return [{ id: 'ledger', title: 'Gear ledger', short: 'Ledger', icon: 'file', feature: 'gearLedger', create: createLedgerScreen }];
}
