import { h, download } from '../dom.js';
import {
  createCatalogArchive, parseCatalogArchive, serializeCatalogArchive, MAX_CATALOG_ARCHIVE_BYTES,
} from '../../catalog-archive.js';

const message = error => error?.message || String(error);
const countText = counts => `${counts.manufacturer} manufacturers, ${counts.product} products, ${counts.asset} assets, ${counts.setup} setups, ${counts.venue} venues, ${counts.supportConfiguration} support descriptions and ${counts.components} setup components`;

/** File reads and previews belong to their selection. An import already sent to
 * storage retains its original copied file until its outcome is confirmed. */
export function createCatalogArchivePanel(host, { archive = createCatalogArchive(), saveFile = download } = {}) {
  let active = true, disposed = false, generation = 0, exportGeneration = 0;
  let selected = null, preview = null, pending = null, importing = null;
  let phase = 'idle', error = null, result = null, exporting = false, exportNotice = null;
  const visible = () => active && !disposed;
  const owns = owner => visible() && selected === owner && owner.generation === generation;
  const fileInput = h('input', { id: 'catalog-archive-file', type: 'file', accept: '.json,application/json', onchange: chooseFile });
  const exportButton = h('button', { id: 'catalog-archive-export', type: 'button', class: 'btn btn-secondary', text: 'Export Equipment catalog', onclick: exportFile });
  const importButton = h('button', { id: 'catalog-archive-import', type: 'button', class: 'btn btn-primary', text: 'Import this catalog', onclick: () => {
    if (!visible() || exporting || importing || phase !== 'preview' || !preview?.canImport || !selected?.archive) return;
    pending = { archive: structuredClone(selected.archive), fileName: selected.fileName };
    void importPending(pending);
  } });
  const previewBox = h('div', { id: 'catalog-archive-preview' });
  const status = h('div', { id: 'catalog-archive-status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const retries = h('div', { class: 'data-actions' });
  host.replaceChildren(
    h('h2', { class: 'card-title', text: 'Browser Equipment catalog file' }),
    h('p', { text: 'Transfer manufacturers, products, assets, setups, venues and support descriptions. This includes retained retired assets, setup components and saved catalog metadata. Import adds missing records while preserving their original IDs and fields.' }),
    h('p', { class: 'field-help', text: 'This file is separate from workspace JSON and venue-history files. It does not transfer device-library profile bindings, saved test results, learned MIDI maps, calibration or photos. Files and saved catalogs are limited to 32 MiB and 10,000 records including setup components; larger operations fail without omitting data.' }),
    h('div', { class: 'data-actions' }, exportButton),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'catalog-archive-file', text: 'Choose an Equipment catalog file to preview' }), fileInput),
    previewBox, h('div', { class: 'data-actions' }, importButton), status, retries,
    h('p', { class: 'field-help', text: 'Conflicting IDs block the whole import. Existing records are never replaced or deleted. If confirmation is interrupted, retry the unchanged file to check the saved result. After a full reload, select that file again.' }),
    h('p', { class: 'field-help', text: 'Saved booth, deck-position and asset-settings references retain their IDs, but their records cannot be verified or restored in browser mode. The preview lists these references and any saved support-position mismatch.' }),
    h('p', { class: 'field-help', text: 'Imported assets can appear in Equipment before they are associated with a Devices profile. Existing device-library bindings stay in place. Device-library synchronization can update matching product descriptions when the app starts; a later import reports conflicts with changed records.' }),
  );

  function render() {
    if (!visible()) return;
    fileInput.disabled = Boolean(importing) || exporting;
    exportButton.disabled = Boolean(importing) || exporting;
    importButton.disabled = Boolean(importing) || exporting || phase !== 'preview' || !preview?.canImport;
    previewBox.replaceChildren();
    if (selected) previewBox.append(h('p', { text: `Selected file: ${selected.fileName}` }));
    if (preview) {
      previewBox.append(h('p', { text: `Catalog contains ${countText(preview.counts)} (${preview.counts.total} records).` }),
        h('p', { text: `Exact records already present: ${preview.alreadyPresent}. New records: ${preview.toImport}. Conflicts: ${preview.conflicts.length}.` }),
        h('p', { text: `Opaque catalog metadata fields: ${preview.metadata.total}. Already present: ${preview.metadata.alreadyPresent}. New fields: ${preview.metadata.toImport}.` }));
      const references = preview.references;
      previewBox.append(h('p', { text: `${references.counts.total} distinct saved reference IDs cannot be verified in browser mode: ${references.counts.booth} booth, ${references.counts.deckPosition} deck position and ${references.counts.settingsSnapshot} asset settings snapshot. Their IDs will be retained.` }));
      if (references.occurrences.length) {
        previewBox.append(h('ul', {}, ...references.occurrences.slice(0, 20).map(item => h('li', { text: `${item.path}: ${item.id}` }))));
        if (references.occurrences.length > 20) previewBox.append(h('p', { text: `Showing 20 of ${references.occurrences.length} reference occurrences. All saved IDs are retained.` }));
      }
      if (preview.legacyBindings.length) {
        previewBox.append(h('p', { text: `${preview.legacyBindings.length} saved support-position mismatches will be preserved for review.` }),
          h('ul', {}, ...preview.legacyBindings.slice(0, 20).map(item => h('li', { text: `Setup ${item.setupId}: position ${item.setupDeckPositionId ?? '(none)'}; support ${item.supportId}: saved position at ${item.supportDeckPositionPath}.` }))));
        if (preview.legacyBindings.length > 20) previewBox.append(h('p', { text: `Showing 20 of ${preview.legacyBindings.length} saved mismatches.` }));
      }
      if (preview.conflicts.length) {
        previewBox.append(h('p', { role: 'alert', text: 'Conflicting saved values block this entire import. The current catalog stays unchanged.' }),
          h('ul', {}, ...preview.conflicts.slice(0, 20).map(item => h('li', { text: `${item.kind}: ${item.id} — ${item.reason}` }))));
        if (preview.conflicts.length > 20) previewBox.append(h('p', { text: `Showing 20 of ${preview.conflicts.length} conflicts. All conflicts block import.` }));
      }
    }
    status.replaceChildren();
    if (phase === 'reading') status.append(h('p', { text: 'Reading the selected catalog file…' }));
    if (phase === 'previewing') status.append(h('p', { text: 'Validating the complete file and current catalog…' }));
    if (importing) status.append(h('p', { text: `Importing ${importing.fileName}. This import continues if you leave the screen.` }));
    if (exporting) status.append(h('p', { text: 'Reading all retained Equipment catalog records…' }));
    if (result) status.append(h('p', { text: `Import complete. Added ${result.completed} records; ${result.alreadyPresent} exact records were already present. Added ${result.metadataAdded} opaque metadata fields; ${result.metadataAlreadyPresent} were already present.` }));
    if (error) status.append(h('p', { role: 'alert', text: error }));
    if (exportNotice) status.append(h('p', { role: exportNotice.error ? 'alert' : 'status', text: exportNotice.text }));
    retries.replaceChildren();
    if (pending && !importing) {
      const owner = pending;
      retries.append(h('button', { id: 'catalog-archive-retry', type: 'button', class: 'btn btn-secondary', text: 'Retry this unchanged catalog', disabled: exporting,
        onclick: () => { if (visible() && pending === owner && !importing && !exporting) void importPending(owner); } }));
    } else if (phase === 'preview-error' && selected?.archive) {
      const owner = selected;
      retries.append(h('button', { id: 'catalog-archive-retry', type: 'button', class: 'btn btn-secondary', text: 'Retry preview', disabled: exporting,
        onclick: () => { if (owns(owner) && !importing && !exporting) void previewSelection(owner); } }));
    }
  }

  async function previewSelection(owner) {
    if (!owns(owner)) return;
    phase = 'previewing'; preview = null; error = null; render();
    try {
      const result = await archive.preview(structuredClone(owner.archive));
      if (!owns(owner)) return;
      preview = structuredClone(result); phase = 'preview'; render();
    } catch (caught) {
      if (!owns(owner)) return;
      phase = 'preview-error'; error = `Could not preview this catalog: ${message(caught)} No records were imported.`; render();
    }
  }
  async function chooseFile() {
    if (!visible() || importing || exporting) return;
    const file = fileInput.files?.[0]; fileInput.value = '';
    const owner = { generation: ++generation, fileName: file?.name || 'Catalog file', archive: null };
    selected = file ? owner : null; preview = null; pending = null; error = null; result = null; exportNotice = null;
    phase = file ? 'reading' : 'idle'; render();
    if (!file) return;
    try {
      if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_CATALOG_ARCHIVE_BYTES) throw new Error('Choose a catalog file no larger than 32 MiB.');
      const text = await file.text();
      if (!owns(owner)) return;
      owner.archive = parseCatalogArchive(text); await previewSelection(owner);
    } catch (caught) {
      if (!owns(owner)) return;
      phase = 'file-error'; error = `Could not read this catalog: ${message(caught)} No records were imported.`; render();
    }
  }
  async function importPending(owner) {
    if (!visible() || pending !== owner || importing || exporting) return;
    importing = owner; phase = 'importing'; error = null; result = null; exportNotice = null; render();
    try {
      const imported = await archive.importArchive(structuredClone(owner.archive));
      if (disposed || importing !== owner) return;
      result = structuredClone(imported); importing = null; pending = null; phase = 'complete'; render();
    } catch (caught) {
      if (disposed || importing !== owner) return;
      importing = null;
      if (caught.code === 'CATALOG_CONFLICT' && caught.preview) {
        preview = structuredClone(caught.preview); pending = null; phase = 'preview';
        error = 'Import blocked by conflicts with the current catalog. No records were written.';
      } else {
        phase = 'import-error'; error = `Could not confirm the import outcome: ${message(caught)} Retry this unchanged catalog to check the saved result.`;
      }
      render();
    }
  }
  async function exportFile() {
    if (!visible() || importing || exporting) return;
    const mine = ++exportGeneration; exporting = true; exportNotice = null; render();
    try {
      const exported = await archive.exportArchive();
      if (!visible() || mine !== exportGeneration) return;
      const text = serializeCatalogArchive(exported);
      await saveFile('deckchek-catalog.json', text, 'application/json');
      if (!visible() || mine !== exportGeneration) return;
      exportNotice = { error: false, text: 'Catalog download started. All retained catalog records, components and opaque catalog metadata are included.' };
    } catch (caught) {
      if (!visible() || mine !== exportGeneration) return;
      exportNotice = { error: true, text: `Could not export the catalog: ${message(caught)} No incomplete file was downloaded.` };
    } finally { if (mine === exportGeneration) { exporting = false; render(); } }
  }
  render();
  return {
    setActive(value) {
      if (disposed) return;
      const next = Boolean(value);
      if (active === next) return;
      active = next;
      if (!active) {
        generation++; exportGeneration++; exporting = false;
        if (!importing && phase === 'reading') { selected = null; preview = null; phase = 'idle'; }
        else if (!importing && phase === 'previewing') phase = 'paused-preview';
        return;
      }
      if (selected) selected = { ...selected, generation };
      render();
      if (phase === 'paused-preview' && selected?.archive) void previewSelection(selected);
    },
    dispose() { if (disposed) return; active = false; disposed = true; generation++; exportGeneration++; },
  };
}
