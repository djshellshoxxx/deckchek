import { h, download } from '../dom.js';
import { createNativeCatalogArchive, nativeCatalogText, MAX_NATIVE_CATALOG_BYTES, NATIVE_CATALOG_TABLES } from '../../native-catalog-archive.js';

const message = error => String(error?.message ?? error ?? 'Catalog operation failed.').slice(0, 500);
const label = value => String(value).slice(0, 160);

/** An already dispatched import owns its unchanged raw text through hide/show and
 * a lost acknowledgement. Reads/previews/downloads have separate retiring owners. */
export function createNativeCatalogArchivePanel(host, {
  archive = createNativeCatalogArchive(), saveFile = download, acquireBusy = () => () => {},
} = {}) {
  let active = true, disposed = false, externalBusy = false, generation = 0, exportGeneration = 0, listGeneration = 0;
  let selected = null, preview = null, pending = null, importing = null, exporting = null;
  let phase = 'idle', error = null, result = null, exportNotice = null, setupNotice = null;
  let setups = [], selectedSetups = new Set(), listing = false;
  const visible = () => active && !disposed;
  const available = () => visible() && !externalBusy && !importing && !exporting;
  const readingFile = () => phase === 'reading' || phase === 'previewing';
  const owns = owner => visible() && !externalBusy && selected === owner && owner.generation === generation;
  const setupBox = h('div', { id: 'native-catalog-setups' });
  const refreshButton = h('button', { id: 'native-catalog-refresh', type: 'button', class: 'btn btn-ghost', text: 'Refresh saved setups', onclick: () => { if (available()) void refreshSetups(); } });
  const exportButton = h('button', { id: 'native-catalog-export', type: 'button', class: 'btn btn-secondary', text: 'Export selected setups', onclick: exportFile });
  const fileInput = h('input', { id: 'native-catalog-file', type: 'file', accept: '.json,application/json', onchange: chooseFile });
  const importButton = h('button', { id: 'native-catalog-import', type: 'button', class: 'btn btn-primary', text: 'Add missing catalog records', onclick: () => {
    if (!available() || phase !== 'preview' || !preview?.canImport || typeof selected?.text !== 'string') return;
    pending = Object.freeze({ text: selected.text, fileName: selected.fileName });
    void importPending(pending);
  } });
  const previewBox = h('div', { id: 'native-catalog-preview' });
  const status = h('div', { id: 'native-catalog-status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const retries = h('div', { class: 'data-actions' });
  host.replaceChildren(
    h('h2', { class: 'card-title', text: 'Native setup catalog file' }),
    h('p', { text: 'Transfer selected saved setups, every component, and their referenced manufacturers, products, assets, settings snapshots, venues, booths, deck positions and support descriptions. Hidden assets and their saved fields are included.' }),
    h('p', { class: 'field-help', text: 'This selective file excludes unrelated locations, product specifications, diagnostic history, maintenance, Devices profile bindings, learned MIDI maps, calibration, photos and app settings. Use a full backup to replace the complete native database. Each file is limited to 32 MiB and 10,000 included records.' }),
    h('fieldset', {}, h('legend', { text: 'Saved setups to export' }), setupBox),
    h('div', { class: 'data-actions' }, exportButton, refreshButton),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'native-catalog-file', text: 'Choose a native setup catalog file to preview' }), fileInput),
    previewBox, h('div', { class: 'data-actions' }, importButton), status, retries,
    h('p', { class: 'field-help', text: 'Import adds missing records in one transaction. Conflicting saved values block the whole import. Existing rows remain unchanged. Manufacturer and product dependencies may keep local timestamps only when every other saved field matches; the preview lists these separately.' }),
    h('p', { class: 'field-help', text: 'If confirmation is interrupted, retry the unchanged selected file to check the saved result. After a reload, select that same file again. Device-library startup can subsequently update product metadata; this file does not transfer profile associations or qualify physical equipment.' }),
  );

  function render() {
    if (!visible()) return;
    const busy = externalBusy || Boolean(importing) || Boolean(exporting);
    fileInput.disabled = busy; importButton.disabled = busy || phase !== 'preview' || !preview?.canImport;
    const known = new Set(setups.map(row => row.id));
    exportButton.disabled = busy || listing || readingFile() || !selectedSetups.size || [...selectedSetups].some(id => !known.has(id));
    refreshButton.disabled = busy || listing;
    setupBox.replaceChildren();
    if (listing) setupBox.append(h('p', { text: 'Reading saved setups…' }));
    if (!listing && !setups.length) setupBox.append(h('p', { text: 'No saved setups are available to export.' }));
    const choices = [...setups, ...[...selectedSetups].filter(id => !known.has(id)).map(id => ({ id, name: 'Unavailable saved setup', unavailable: true }))];
    choices.forEach((row, index) => {
      const choice = h('input', { type: 'checkbox', id: `native-catalog-setup-${index}`, value: row.id, checked: selectedSetups.has(row.id), disabled: busy || listing });
      choice.addEventListener('change', () => {
        if (!available() || listing) return;
        if (choice.checked && !row.unavailable) selectedSetups.add(row.id); else selectedSetups.delete(row.id);
        exportGeneration++; exportNotice = null; render();
      });
      setupBox.append(h('label', { for: choice.id }, choice, h('span', { text: `${label(row.name || '(unnamed setup)')} (${label(row.id)})${row.unavailable ? ' — choose an available setup' : ''}` })));
    });
    previewBox.replaceChildren();
    if (selected) previewBox.append(h('p', { text: `Selected file: ${selected.fileName}` }));
    if (preview) {
      previewBox.append(h('p', { text: `File contains ${preview.counts.total} records: ${NATIVE_CATALOG_TABLES.map(name => `${preview.counts.tables[name]} ${name.replaceAll('_', ' ')}`).join(', ')}.` }),
        h('p', { text: `New records: ${preview.toImport}. Exact records already present: ${preview.alreadyPresent}. Matching dependencies keeping local timestamps: ${preview.reusedDependencies}. Conflicts: ${preview.conflictCount}.` }));
      if (preview.dependencyReuses.length) previewBox.append(h('ul', {}, ...preview.dependencyReuses.map(item => h('li', { text: `${item.table}: ${item.id}; file created/updated: ${item.sourceCreatedAt} / ${item.sourceUpdatedAt}; retained local created/updated: ${item.destinationCreatedAt} / ${item.destinationUpdatedAt}.` }))));
      if (preview.conflictCount) previewBox.append(h('p', { role: 'alert', text: 'Conflicts block this entire import. No existing records will be changed.' }));
      for (const item of [...preview.conflicts, ...preview.warnings]) previewBox.append(h('p', { text: `${item.table}: ${item.id} — ${item.reason}` }));
      if (preview.warningCount) previewBox.append(h('p', { text: `${preview.warningCount} saved context warnings. Recorded nullable context is retained without inferring locations.` }));
      if (preview.conflictCount > 100 || preview.warningCount > 100 || preview.reusedDependencies > 100) previewBox.append(h('p', { text: 'Showing the first 100 details in each category. All conflicts still block import; long diagnostic values are excerpts.' }));
    }
    status.replaceChildren();
    if (externalBusy) status.append(h('p', { text: 'Another Data operation is in progress. Catalog controls will return when it finishes.' }));
    if (phase === 'reading') status.append(h('p', { text: 'Reading the selected native catalog file…' }));
    if (phase === 'previewing') status.append(h('p', { text: 'Checking the complete file against the current native catalog…' }));
    if (importing) status.append(h('p', { text: `Importing ${importing.fileName}. This transaction continues if you leave the screen.` }));
    if (exporting) status.append(h('p', { text: 'Reading the complete selected setup graph…' }));
    if (result) status.append(h('p', { text: `Import complete. Added ${result.inserted} records; ${result.alreadyPresent} exact records and ${result.reusedDependencies} matching dependencies were already present. Local dependency timestamps were retained.` }));
    if (error) status.append(h('p', { role: 'alert', text: error }));
    if (setupNotice) status.append(h('p', { role: 'alert', text: setupNotice }));
    if (exportNotice) status.append(h('p', { role: exportNotice.error ? 'alert' : 'status', text: exportNotice.text }));
    retries.replaceChildren();
    if (pending && !importing) {
      const owner = pending;
      retries.append(h('button', { id: 'native-catalog-retry', type: 'button', class: 'btn btn-secondary', text: 'Retry this unchanged file', disabled: busy,
        onclick: () => { if (available() && pending === owner) void importPending(owner); } }));
    } else if (phase === 'preview-error' && typeof selected?.text === 'string') {
      const owner = selected;
      retries.append(h('button', { id: 'native-catalog-retry', type: 'button', class: 'btn btn-secondary', text: 'Retry preview', disabled: busy,
        onclick: () => { if (available() && owns(owner) && phase === 'preview-error') void previewSelection(owner); } }));
    }
  }
  async function refreshSetups() {
    if (!available()) return;
    const mine = ++listGeneration; listing = true; setupNotice = null; render();
    try {
      const rows = await archive.listSetups();
      if (!visible() || externalBusy || mine !== listGeneration) return;
      setups = rows;
    } catch (caught) {
      if (!visible() || externalBusy || mine !== listGeneration) return;
      setupNotice = `Could not list saved setups: ${message(caught)}`;
    } finally { if (mine === listGeneration) { listing = false; render(); } }
  }
  async function previewSelection(owner) {
    if (!owns(owner) || importing || exporting) return;
    phase = 'previewing'; preview = null; error = null; render();
    try {
      const next = await archive.preview(owner.text);
      if (!owns(owner)) return;
      preview = next; phase = 'preview'; render();
    } catch (caught) {
      if (!owns(owner)) return;
      phase = 'preview-error'; error = `Could not preview this catalog: ${message(caught)} No records were imported.`; render();
    }
  }
  async function chooseFile() {
    if (!available()) return;
    const file = fileInput.files?.[0]; fileInput.value = '';
    const owner = { generation: ++generation, fileName: label(file?.name || 'Native catalog file'), text: null };
    selected = file ? owner : null; preview = null; pending = null; error = null; result = null; exportNotice = null;
    phase = file ? 'reading' : 'idle'; render();
    if (!file) return;
    try {
      if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_NATIVE_CATALOG_BYTES) throw new Error('Choose a native catalog file no larger than 32 MiB.');
      const bytes = await file.arrayBuffer();
      if (!owns(owner)) return;
      if (!(bytes instanceof ArrayBuffer) || bytes.byteLength > MAX_NATIVE_CATALOG_BYTES) throw new Error('The native catalog file exceeds 32 MiB or cannot be read as bytes.');
      // Retain a BOM as an actual code point; do not silently rewrite the file.
      owner.text = nativeCatalogText(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
      await previewSelection(owner);
    } catch (caught) {
      if (!owns(owner)) return;
      phase = 'file-error'; error = `Could not read this catalog: ${message(caught)} No records were imported.`; render();
    }
  }
  async function importPending(owner) {
    if (!available() || pending !== owner) return;
    const release = acquireBusy(); if (typeof release !== 'function') return;
    importing = owner; phase = 'importing'; error = null; result = null; exportNotice = null; render();
    try {
      const imported = await archive.importArchive(owner.text);
      if (disposed || importing !== owner) return;
      result = imported; pending = null; phase = 'complete';
    } catch (caught) {
      if (disposed || importing !== owner) return;
      if (caught.code === 'NATIVE_CATALOG_CONFLICT' && caught.preview) {
        preview = caught.preview; pending = null; phase = 'preview'; error = 'Import blocked by conflicts with the current catalog. No records were written.';
      } else { phase = 'import-error'; error = `Could not confirm the import outcome: ${message(caught)} Retry this unchanged file to check the saved result.`; }
    } finally {
      if (importing === owner) importing = null;
      release(); render();
      if (visible() && !externalBusy && phase === 'complete') void refreshSetups();
    }
  }
  async function exportFile() {
    if (!available() || listing || readingFile() || !selectedSetups.size || [...selectedSetups].some(id => !setups.some(row => row.id === id))) return;
    const release = acquireBusy(); if (typeof release !== 'function') return;
    const owner = { generation: ++exportGeneration, ids: [...selectedSetups] };
    exporting = owner; exportNotice = null; render();
    try {
      const exported = await archive.exportArchive(owner.ids);
      if (!visible() || externalBusy || owner.generation !== exportGeneration) return;
      const text = nativeCatalogText(exported.text);
      await saveFile('deckchek-native-setup-catalog.json', text, 'application/json');
      if (!visible() || externalBusy || owner.generation !== exportGeneration) return;
      exportNotice = { error: false, text: `Download started: ${exported.counts.total} complete selected catalog records.` };
    } catch (caught) {
      if (!visible() || externalBusy || owner.generation !== exportGeneration) return;
      exportNotice = { error: true, text: `Could not export selected setups: ${message(caught)} No incomplete file was downloaded.` };
    } finally {
      if (exporting === owner) exporting = null;
      release();
      if (visible() && !externalBusy && phase === 'paused-preview') resume(); else render();
    }
  }
  function retireReads() {
    generation++; listGeneration++; exportGeneration++; listing = false;
    if (!importing && phase === 'reading') { selected = null; preview = null; phase = 'idle'; }
    else if (!importing && ['previewing', 'preview'].includes(phase)) { preview = null; phase = 'paused-preview'; }
  }
  function resume() {
    if (selected) selected = { ...selected, generation };
    render();
    if (!externalBusy && !importing && !exporting) {
      void refreshSetups();
      if (phase === 'paused-preview' && typeof selected?.text === 'string') void previewSelection(selected);
    }
  }
  render(); void refreshSetups();
  return {
    setActive(value) {
      if (disposed || active === Boolean(value)) return;
      active = Boolean(value);
      if (!active) retireReads(); else resume();
    },
    setExternalBusy(value) {
      if (disposed || externalBusy === Boolean(value)) return;
      externalBusy = Boolean(value);
      if (externalBusy) { retireReads(); render(); } else if (visible()) resume();
    },
    dispose() { if (disposed) return; disposed = true; active = false; retireReads(); },
  };
}
