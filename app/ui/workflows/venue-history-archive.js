import { h, download } from '../dom.js';
import {
  createVenueHistoryArchive, parseVenueHistoryArchive, serializeVenueHistoryArchive, MAX_ARCHIVE_BYTES,
} from '../../venue-history-archive.js';

const message = error => error?.message || String(error);
const countText = counts => `${counts.incidents} incident${counts.incidents === 1 ? '' : 's'}, ${counts.supportObservations} support observation${counts.supportObservations === 1 ? '' : 's'} and ${counts.supportComparisons} comparison${counts.supportComparisons === 1 ? '' : 's'}`;

/** File reads/previews belong to their selection. A dispatched append-only
 * import keeps its original file even when the screen is hidden. */
export function createVenueHistoryArchivePanel(host, {
  archive = createVenueHistoryArchive(), saveFile = download,
} = {}) {
  let active = true, disposed = false, generation = 0, exportGeneration = 0;
  let selected = null, preview = null, pending = null, importOwner = null;
  let phase = 'idle', error = null, result = null, exporting = false, exportNotice = null;
  const visible = () => active && !disposed;
  const ownsSelection = owner => visible() && selected === owner && owner.generation === generation;
  const fileInput = h('input', { type: 'file', id: 'venue-history-file', accept: '.json,application/json', onchange: chooseFile });
  const exportButton = h('button', { type: 'button', id: 'venue-history-export', class: 'btn btn-secondary', text: 'Export all venue history', onclick: exportFile });
  const importButton = h('button', { type: 'button', id: 'venue-history-import', class: 'btn btn-primary', text: 'Import this archive', onclick: () => {
    if (!visible() || exporting || importOwner || phase !== 'preview' || !preview?.canImport || !selected?.archive) return;
    pending = { archive: structuredClone(selected.archive), fileName: selected.fileName };
    void importPending(pending);
  } });
  const previewBox = h('div', { id: 'venue-history-preview' });
  const status = h('div', { id: 'venue-history-status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const retries = h('div', { class: 'data-actions' });
  host.replaceChildren(
    h('h2', { class: 'card-title', text: 'Browser venue history file' }),
    h('p', { text: 'Export every retained manual incident, original support observation and comparison. Import adds missing records and keeps exact matches, preserving historical IDs, times, names and evidence.' }),
    h('p', { class: 'field-help', text: 'This is a separate archive from workspace JSON. Editable venues, setups, support descriptions and other workspace data are not included. Files are limited to 32 MiB and 10,000 records; larger exports fail without omitting records.' }),
    h('div', { class: 'data-actions' }, exportButton),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'venue-history-file', text: 'Choose a venue-history archive to preview' }), fileInput),
    previewBox, h('div', { class: 'data-actions' }, importButton), status, retries,
    h('p', { class: 'field-help', text: 'Import adds records one at a time. If storage fills or a write fails, completed records remain. Reimport the unchanged file to check and resume; saved records are never overwritten or deleted.' }),
    h('p', { class: 'field-help', text: 'Imported history is visible in Hum and feedback with all venues selected. Venue reports require a matching current venue ID; this archive does not recreate the current catalog.' }),
    h('p', { class: 'field-help', text: 'Validation checks file structure and comparison consistency. It does not authenticate who recorded the evidence or qualify physical measurements.' }),
  );

  function render() {
    if (!visible()) return;
    fileInput.disabled = Boolean(importOwner) || exporting;
    exportButton.disabled = Boolean(importOwner) || exporting;
    importButton.disabled = Boolean(importOwner) || exporting || phase !== 'preview' || !preview?.canImport;
    previewBox.replaceChildren();
    if (selected) previewBox.append(h('p', { text: `Selected file: ${selected.fileName}` }));
    if (preview) {
      previewBox.append(h('p', { text: `Archive contains ${countText(preview.counts)} (${preview.counts.total} records).` }),
        h('p', { text: `Exact records already present: ${preview.alreadyPresent}. New records: ${preview.toImport}. Conflicts: ${preview.conflicts.length}.` }));
      if (preview.conflicts.length) {
        previewBox.append(h('p', { role: 'alert', text: 'Conflicting IDs block this import. Existing records stay unchanged.' }),
          h('ul', {}, ...preview.conflicts.slice(0, 20).map(row => h('li', { text: `${row.kind}: ${row.id} — ${row.reason}` }))));
        if (preview.conflicts.length > 20) previewBox.append(h('p', { text: `Showing 20 of ${preview.conflicts.length} conflicts. All conflicts block import.` }));
      }
    }
    status.replaceChildren();
    if (phase === 'reading') status.append(h('p', { role: 'status', text: 'Reading the selected archive…' }));
    if (phase === 'previewing') status.append(h('p', { role: 'status', text: 'Validating the archive and current history…' }));
    if (importOwner) status.append(h('p', { role: 'status', text: `Importing ${importOwner.fileName}. This import continues if you leave the screen.` }));
    if (exporting) status.append(h('p', { role: 'status', text: 'Reading all retained venue history for export…' }));
    if (result) status.append(h('p', { role: result.status === 'partial' ? 'alert' : 'status', text: result.status === 'complete'
      ? `Import complete. Added ${result.completed} records; ${result.alreadyPresent} exact records were already present. Remaining 0.`
      : `Import stopped. Added ${result.completed} records; ${result.alreadyPresent} exact records were already present; ${result.remaining} remain unconfirmed. ${result.failure.message}` }));
    if (error) status.append(h('p', { role: 'alert', text: error }));
    if (exportNotice) status.append(h('p', { role: exportNotice.error ? 'alert' : 'status', text: exportNotice.text }));
    retries.replaceChildren();
    if (pending && !importOwner) {
      const owner = pending;
      retries.append(h('button', { type: 'button', id: 'venue-history-retry', class: 'btn btn-secondary', text: 'Retry this unchanged archive', disabled: exporting,
        onclick: () => { if (visible() && pending === owner && !importOwner && !exporting) void importPending(owner); } }));
    } else if (phase === 'preview-error' && selected?.archive) {
      const owner = selected;
      retries.append(h('button', { type: 'button', id: 'venue-history-retry', class: 'btn btn-secondary', text: 'Retry preview', disabled: exporting,
        onclick: () => { if (ownsSelection(owner) && !importOwner && !exporting) void previewSelection(owner); } }));
    }
  }

  async function previewSelection(owner) {
    if (!ownsSelection(owner)) return;
    phase = 'previewing'; preview = null; error = null; render();
    try {
      const value = await archive.preview(structuredClone(owner.archive));
      if (!ownsSelection(owner)) return;
      preview = structuredClone(value); phase = 'preview'; render();
    } catch (caught) {
      if (!ownsSelection(owner)) return;
      phase = 'preview-error'; error = `Could not preview this archive: ${message(caught)}. No records were imported.`; render();
    }
  }
  async function chooseFile() {
    if (!visible() || importOwner || exporting) return;
    const file = fileInput.files?.[0];
    fileInput.value = '';
    const owner = { generation: ++generation, fileName: file?.name || 'Archive file', archive: null };
    selected = file ? owner : null; preview = null; pending = null; result = null; error = null; exportNotice = null;
    phase = file ? 'reading' : 'idle'; render();
    if (!file) return;
    try {
      if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_ARCHIVE_BYTES) throw new Error('Choose an archive no larger than 32 MiB');
      const text = await file.text();
      if (!ownsSelection(owner)) return;
      owner.archive = parseVenueHistoryArchive(text);
      await previewSelection(owner);
    } catch (caught) {
      if (!ownsSelection(owner)) return;
      phase = 'file-error'; error = `Could not read this archive: ${message(caught)}. No records were imported.`; render();
    }
  }
  async function importPending(owner) {
    if (!visible() || pending !== owner || importOwner || exporting) return;
    importOwner = owner; phase = 'importing'; error = null; result = null; exportNotice = null; render();
    try {
      const imported = await archive.importArchive(structuredClone(owner.archive));
      if (disposed || importOwner !== owner) return;
      result = structuredClone(imported); importOwner = null;
      if (result.status === 'complete') { pending = null; phase = 'complete'; }
      else phase = 'partial';
      render();
    } catch (caught) {
      if (disposed || importOwner !== owner) return;
      importOwner = null;
      if (caught.code === 'ARCHIVE_CONFLICT' && caught.preview) {
        preview = structuredClone(caught.preview); pending = null; phase = 'preview';
        error = 'Import blocked by conflicts with saved history. No records were written.';
      } else {
        phase = 'import-error';
        error = `Could not confirm the import outcome: ${message(caught)}. Existing and completed records were kept. Retry this unchanged archive to check and resume.`;
      }
      render();
    }
  }
  async function exportFile() {
    if (!visible() || importOwner || exporting) return;
    const mine = ++exportGeneration; exporting = true; exportNotice = null; render();
    try {
      const value = await archive.exportArchive();
      if (!visible() || mine !== exportGeneration) return;
      const text = serializeVenueHistoryArchive(value);
      await saveFile('deckchek-venue-history.json', text, 'application/json');
      if (!visible() || mine !== exportGeneration) return;
      exportNotice = { error: false, text: `Archive download started: ${countText({ incidents: value.incidents.length, supportObservations: value.supportObservations.length, supportComparisons: value.supportComparisons.length })}. All retained records are included.` };
    } catch (caught) {
      if (!visible() || mine !== exportGeneration) return;
      exportNotice = { error: true, text: `Could not export venue history: ${message(caught)}. No incomplete archive was downloaded.` };
    } finally {
      if (mine === exportGeneration) { exporting = false; render(); }
    }
  }
  render();
  return {
    setActive(value) {
      if (disposed) return;
      active = Boolean(value);
      if (!active) {
        generation++; exportGeneration++; exporting = false;
        if (!importOwner && phase === 'reading') { selected = null; preview = null; phase = 'idle'; }
        else if (!importOwner && phase === 'previewing') phase = 'paused-preview';
        return;
      }
      if (selected) selected = { ...selected, generation };
      render();
      if (phase === 'paused-preview' && selected?.archive) void previewSelection(selected);
    },
    dispose() { if (disposed) return; active = false; disposed = true; generation++; exportGeneration++; },
  };
}
