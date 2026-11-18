// Data & backup screen (FS-08): back up now, restore from a file (with an explicit confirmation that
// lists what is replaced and that a safety backup is taken first), automatic backups, and the browser
// workspace import. Browser mode has distinct workspace, venue-history and catalog files.

import { h, isNative, pickFile } from '../dom.js';
import { icon } from '../icons.js';
import { announce, toast } from '../live.js';
import { exportSettingsBlob, importSettingsBlob } from '../state.js';
import { exportWorkspace, importWorkspace } from '../persistence.js';
import { revealAppPath } from '../../external-links.js';
import { parseWorkspaceJson } from '../../export.js';
import { createVenueHistoryArchivePanel } from '../workflows/venue-history-archive.js';
import { createCatalogArchivePanel } from '../workflows/catalog-archive.js';
import { createNativeCatalogArchivePanel } from '../workflows/native-catalog-archive.js';
import {
  backupApi, BACKUP_EXT, DEFAULT_KEEP, MAX_KEEP, PROGRESS_EVENT, suggestBackupName, describeBackup, describeRestoreResult,
  progressPercent, formatBytes, workspaceToImportPayload,
} from '../../backup.js';

const MODE_LABEL = { off: 'Off', daily: 'Daily', weekly: 'Weekly', onExit: 'On exit' };
const KIND_LABEL = { manual: 'Manual', auto: 'Automatic', pre_restore: 'Safety (before restore)' };
const tauri = () => globalThis.window?.__TAURI__ ?? globalThis.__TAURI__ ?? null;
const pad = n => String(n).padStart(2, '0');
const when = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso ?? '') : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** Friendly text for a Rust BackupError ({code, message}) or any thrown value. */
export function friendlyBackupError(error) {
  const code = error?.code;
  if (code === 'capture_running') return 'A capture is running, so DeckChek cannot restore right now. Stop the capture, then try again. Nothing was changed.';
  if (code === 'unsupported') return error.message;
  if (code === 'not_confirmed') return 'Tick the box to confirm that you want to replace your current data.';
  if (code === 'too_new' || code === 'format_too_new') return error.message || 'This backup was made by a newer DeckChek. Update the app to restore it.';
  const message = typeof error === 'string' ? error : error?.message;
  return message || 'Something went wrong. Nothing was changed.';
}

/** What a restore replaces, as plain lines for the confirmation dialog. */
export function replacementLines(inspect) {
  const c = { runs: 0, assets: 0, profiles: 0, midiMaps: 0, ...(inspect?.manifest?.counts || {}) };
  const n = (v, one, many = `${one}s`) => `${v} ${v === 1 ? one : many}`;
  return [
    'Everything in your current database: test runs, equipment and asset records, MIDI maps.',
    'Calibration profiles and app settings stored on this computer.',
    `They will be replaced by the backup: ${n(c.runs, 'run')}, ${n(c.assets, 'asset')}, ${n(c.profiles, 'calibration profile')}, ${n(c.midiMaps, 'MIDI map')}.`,
  ];
}

export function createDataScreen(section, { archiveOptions = {}, catalogArchiveOptions = {}, nativeCatalogArchiveOptions = {} } = {}) {
  const native = isNative() && backupApi.supported;
  const st = { busy: false, entries: [], schedule: null };
  let active = true, disposed = false, refreshGeneration = 0, visibilityGeneration = 0, busyOwner = null, nativeCatalogPanel = null;
  let workspaceChooser = null;
  const modals = new Set();
  const visible = () => active && !disposed;
  const current = generation => visible() && generation === visibilityGeneration;
  function acquireBusy(source) {
    if (!visible() || st.busy) return null;
    const owner = { source }; busyOwner = owner; st.busy = true;
    nativeCatalogPanel?.setExternalBusy(source !== 'native-catalog'); render();
    return () => {
      if (busyOwner !== owner) return;
      busyOwner = null; st.busy = false; nativeCatalogPanel?.setExternalBusy(false); render();
    };
  }

  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('download', { size: 24 })}</span><div><h1 tabindex="-1">Data &amp; backup</h1>
      <p class="lede">Keep a copy of your runs, equipment, calibration and settings. Backups are not encrypted and contain device serial numbers and notes, so store them somewhere you trust.</p></div></div></header>
    <div id="data-status" class="data-status" role="status" aria-live="polite"></div>
    <div class="data-grid" id="data-grid"></div>`;
  const q = s => section.querySelector(s);
  const grid = q('#data-grid');
  const status = q('#data-status');
  const archiveHost = native ? null : h('section', { class: 'card data-wide', id: 'data-venue-history' });
  const archivePanel = archiveHost ? createVenueHistoryArchivePanel(archiveHost, archiveOptions) : null;
  const catalogHost = native ? null : h('section', { class: 'card data-wide', id: 'data-catalog-archive' });
  const catalogPanel = catalogHost ? createCatalogArchivePanel(catalogHost, catalogArchiveOptions) : null;
  const nativeCatalogHost = native ? h('section', { class: 'card data-wide', id: 'data-native-catalog-archive' }) : null;
  nativeCatalogPanel = nativeCatalogHost ? createNativeCatalogArchivePanel(nativeCatalogHost, {
    ...nativeCatalogArchiveOptions, acquireBusy: () => acquireBusy('native-catalog'),
  }) : null;

  const setStatus = (text, kind = 'info') => {
    if (!visible()) return;
    status.replaceChildren();
    if (!text) return;
    status.append(h('div', { class: `banner banner-${kind === 'error' ? 'fail' : kind === 'warn' ? 'warn' : 'info'}`, role: kind === 'error' ? 'alert' : null },
      h('span', { class: 'banner-text', text })));
    announce(text, { assertive: kind === 'error' });
  };

  function progressBar() {
    const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': 'Backup progress' }, h('span', {}));
    const label = h('span', { class: 'field-help', text: 'Backing up… 0%' });
    const box = h('div', { class: 'data-progress' }, bar, label);
    return {
      box,
      set(pct) { bar.setAttribute('aria-valuenow', String(pct)); bar.firstElementChild.style.width = `${pct}%`; label.textContent = `Backing up… ${pct}%`; },
    };
  }

  // ----- workspace JSON (works in browser and desktop) -----
  function pickWorkspaceFile() {
    return new Promise((resolve, reject) => {
      const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
      let settled = false;
      const finish = file => { if (cleanup()) resolve(file); };
      const changed = () => finish(input.files?.[0] || null);
      const cancelled = () => finish(null);
      const owner = { retire: cancelled };
      function cleanup() {
        if (settled) return false;
        settled = true;
        input.removeEventListener('change', changed); input.removeEventListener('cancel', cancelled); input.remove();
        if (workspaceChooser === owner) workspaceChooser = null;
        return true;
      }
      workspaceChooser = owner;
      input.addEventListener('change', changed); input.addEventListener('cancel', cancelled);
      try { document.body.append(input); input.click(); }
      catch (error) { if (cleanup()) reject(error); }
    });
  }

  async function onImportWorkspace() {
    if (!visible() || st.busy) return;
    const release = native ? acquireBusy('workspace') : () => {};
    if (!release) return;
    const generation = visibilityGeneration;
    try {
      const file = await (native ? pickWorkspaceFile() : pickFile('.json,application/json'));
      if (!file || !current(generation)) return;
      const text = await file.text();
      if (!current(generation)) return;
      const parsed = parseWorkspaceJson(text);
      if (!native) {
        const d = await importWorkspace(file);
        setStatus(`Imported ${d.runs.length} run(s) and ${d.equipment.length} equipment item(s) from the workspace file.`, 'success');
        return;
      }
      const payload = workspaceToImportPayload(parsed);
      const ok = await workspaceDialog(payload);
      if (!ok || !current(generation)) return;
      const r = await backupApi.importWorkspace(payload);
      setStatus(`Imported ${r.runsImported} run(s) and ${r.equipmentImported} equipment item(s). Skipped ${r.runsSkipped} run(s) already in DeckChek${r.runsInvalid ? ` and ${r.runsInvalid} invalid run(s)` : ''}.`, 'success');
      if (visible()) toast('Browser workspace imported.', { type: 'success' });
    } catch (error) {
      setStatus(`Could not import the workspace: ${friendlyBackupError(error)}`, 'error');
    } finally { release(); }
  }

  function modal(build) {
    if (!visible()) return Promise.resolve(null);
    return new Promise(resolve => {
      const trigger = document.activeElement;
      const dlg = h('dialog', { class: 'data-dialog' });
      const owner = { pending: false, retired: false, finished: false };
      const finish = value => {
        if (owner.finished) return;
        owner.finished = true; modals.delete(owner); resolve(value);
        if (dlg.open) dlg.close(); dlg.remove();
        if (visible() && trigger?.isConnected) trigger.focus();
      };
      owner.retire = () => { owner.retired = true; dlg.remove(); if (!owner.pending) finish(null); };
      modals.add(owner);
      build(dlg, finish, owner);
      dlg.addEventListener('close', () => { if (!owner.pending) finish(null); }, { once: true });
      dlg.addEventListener('cancel', event => { if (owner.pending) event.preventDefault(); else finish(null); });
      document.body.append(dlg);
      dlg.showModal();
      dlg.querySelector('[data-initial]')?.focus(); // safe action first
    });
  }

  function workspaceDialog(payload) {
    return modal((dlg, finish) => {
      const cancel = h('button', { type: 'button', class: 'btn btn-secondary', 'data-initial': '', text: 'Cancel', onclick: () => finish(false) });
      dlg.setAttribute('aria-labelledby', 'ws-title');
      dlg.append(h('div', { class: 'dialog-form' },
        h('h2', { id: 'ws-title', text: 'Import browser workspace' }),
        h('p', { text: `This file holds ${payload.runs.length} run(s) and ${payload.equipment.length} equipment item(s). They are added to your data; runs already in DeckChek are skipped. Nothing is replaced.` }),
        h('div', { class: 'dialog-actions' }, cancel, h('button', { type: 'button', class: 'btn btn-primary', text: 'Import', onclick: () => finish(true) }))));
    });
  }

  // ----- back up -----
  async function onBackup() {
    const release = acquireBusy('backup'); if (!release) return;
    const generation = visibilityGeneration;
    const dialog = tauri()?.dialog?.save;
    let unlisten = null;
    try {
      if (!dialog) { setStatus('The save dialog is not available.', 'error'); return; }
      const dest = await dialog({ defaultPath: suggestBackupName(), filters: [{ name: 'DeckChek backup', extensions: [BACKUP_EXT] }] });
      if (!dest || !current(generation)) return;
      setStatus('');
      const bar = progressBar(); q('#data-progress-slot')?.replaceChildren(bar.box);
      try { unlisten = await tauri()?.event?.listen?.(PROGRESS_EVENT, e => { if (visible()) bar.set(progressPercent(e.payload)); }); } catch { /* progress is optional */ }
      if (!current(generation)) return;
      const r = await backupApi.create({ destPath: dest, kind: 'manual', settings: exportSettingsBlob() });
      const warnings = Array.isArray(r.warnings) ? r.warnings.filter(w => typeof w === 'string') : [];
      setStatus(`Backup saved: ${formatBytes(r.bytes)}, ${r.counts.runs} run(s).${warnings.length ? ` Warnings: ${warnings.join(' ')}` : ''}`, warnings.length ? 'warn' : 'success');
      if (visible()) toast(warnings.length ? 'Backup saved with warnings. Review the details before relying on it.' : 'Backup saved.', { type: warnings.length ? 'warn' : 'success' });
    } catch (error) {
      setStatus(`Backup failed: ${friendlyBackupError(error)}`, 'error');
    } finally { if (typeof unlisten === 'function') unlisten(); release(); if (visible()) await refresh(); }
  }

  // ----- restore -----
  async function onRestoreFile() {
    const release = acquireBusy('restore'); if (!release) return;
    const generation = visibilityGeneration;
    try {
      const open = tauri()?.dialog?.open;
      if (!open) { setStatus('The open dialog is not available.', 'error'); return; }
      let path = await open({ multiple: false, filters: [{ name: 'DeckChek backup', extensions: [BACKUP_EXT] }] });
      if (Array.isArray(path)) path = path[0];
      if (path && current(generation)) await startRestore(path, true);
    } catch (e) { setStatus(friendlyBackupError(e), 'error'); }
    finally { if (!st.reloading) release(); }
  }

  async function startRestore(path, alreadyOwned = false) {
    const release = alreadyOwned ? () => {} : acquireBusy('restore'); if (!release || !visible()) return;
    const generation = visibilityGeneration;
    try {
      let inspect;
      try { inspect = await backupApi.inspect(path); } catch (error) { setStatus(`Could not read that file: ${friendlyBackupError(error)}`, 'error'); return; }
      if (!current(generation)) return;
      const info = describeBackup(inspect);
      if (!info.canRestore) { setStatus(`${info.title}. ${info.error}`, 'error'); return; }
      const confirmed = await restoreDialog(path, inspect, info);
      if (confirmed) await finishRestore(confirmed);
    } finally { if (!st.reloading) release(); }
  }

  /** Resolves {result} after a successful restore, or null when cancelled. Errors stay inside the dialog. */
  function restoreDialog(path, inspect, info) {
    return modal((dlg, finish, owner) => {
      dlg.setAttribute('aria-labelledby', 'restore-title');
      dlg.setAttribute('aria-describedby', 'restore-body');
      const check = h('input', { type: 'checkbox', id: 'restore-ack' });
      const err = h('div', { id: 'restore-error', class: 'data-dialog-error', role: 'alert' });
      const ok = h('button', { type: 'button', class: 'btn btn-danger', id: 'restore-confirm', text: 'Replace current data', disabled: true });
      const cancel = h('button', { type: 'button', class: 'btn btn-secondary', id: 'restore-cancel', 'data-initial': '', text: 'Cancel', onclick: () => { if (!owner.pending) finish(null); } });
      check.addEventListener('change', () => { ok.disabled = owner.pending || !check.checked; });
      ok.addEventListener('click', async () => {
        if (owner.pending || owner.retired || owner.finished || !visible() || !check.checked) return;
        owner.pending = true;
        err.textContent = ''; ok.disabled = true; cancel.disabled = true; check.disabled = true; ok.textContent = 'Restoring…';
        try {
          const result = await backupApi.restore(path, { confirm: true, settings: exportSettingsBlob() });
          owner.pending = false;
          finish({ result });
        } catch (error) {
          owner.pending = false;
          if (owner.retired || disposed) { finish(null); return; }
          err.textContent = friendlyBackupError(error);
          ok.textContent = 'Replace current data'; cancel.disabled = false; check.disabled = false; ok.disabled = !check.checked;
          cancel.focus();
        }
      });
      dlg.append(h('div', { class: 'dialog-form' },
        h('h2', { id: 'restore-title', text: 'Restore from backup?' }),
        h('div', { id: 'restore-body', class: 'data-restore-body' },
          h('p', { class: 'data-restore-file', text: `${info.title}: ${path.split(/[\\/]/).pop()}` }),
          h('ul', { class: 'data-list' }, ...info.lines.map(l => h('li', { text: l }))),
          h('p', { class: 'data-restore-head', text: 'This will replace:' }),
          h('ul', { class: 'data-list', id: 'restore-replaces' }, ...replacementLines(inspect).map(l => h('li', { text: l }))),
          h('p', { class: 'data-safety', id: 'restore-safety' }, h('span', { html: icon('info', { size: 16 }) }),
            h('span', { text: ' Before anything is replaced, DeckChek saves your current data as a safety backup in the backups folder. If the restore fails, your current data is left untouched. DeckChek reloads when the restore is done.' }))),
        h('label', { class: 'data-ack', for: 'restore-ack' }, check, h('span', { text: 'I understand this replaces my current data' })),
        err,
        h('div', { class: 'dialog-actions' }, cancel, ok)));
    });
  }

  async function finishRestore({ result }) {
    const applied = importSettingsBlob({ settings: result.settings, calibrationProfiles: result.calibrationProfiles });
    const text = describeRestoreResult(result);
    setStatus(applied.skipped ? `${text} ${applied.skipped} calibration profile(s) could not be restored.` : text, 'success');
    toast('Restore complete. Reloading…', { type: 'success' });
    st.busy = true; st.reloading = true; nativeCatalogPanel?.setExternalBusy(true); render();
    setTimeout(() => globalThis.location?.reload(), 1800);
  }

  // ----- schedule -----
  async function saveSchedule() {
    if (!visible() || st.busy) return;
    const mode = q('#data-mode').value;
    const keep = Number(q('#data-keep').value);
    const release = acquireBusy('schedule'); if (!release) return;
    try {
      st.schedule = await backupApi.setSettings({ mode, keep });
      setStatus(`Automatic backups: ${MODE_LABEL[st.schedule.mode]}, keeping the last ${st.schedule.keep}.`, 'success');
      await refresh();
    } catch (error) {
      setStatus(`Could not save the schedule: ${error?.message || friendlyBackupError(error)}`, 'error');
    } finally { release(); }
  }

  // ----- render -----
  async function refresh() {
    if (!visible()) return;
    const mine = ++refreshGeneration;
    if (native) {
      let entries, schedule;
      try { entries = await backupApi.list(); } catch { entries = []; }
      if (!visible() || mine !== refreshGeneration) return;
      try { schedule = await backupApi.getSettings(); } catch { schedule = st.schedule ?? { mode: 'off', keep: DEFAULT_KEEP }; }
      if (!visible() || mine !== refreshGeneration) return;
      st.entries = entries; st.schedule = schedule;
    }
    render();
  }

  function render() {
    if (!visible()) return;
    grid.replaceChildren();
    if (!native) {
      grid.append(h('section', { class: 'card', id: 'data-browser' },
        h('h2', { class: 'card-title', text: 'Workspace file' }),
        h('p', { class: 'field-help', id: 'data-unsupported', text: 'Backup files need the DeckChek desktop app. In the browser, export your workspace to a JSON file and import it again on another computer.' }),
        h('div', { class: 'data-actions' },
          h('button', { type: 'button', class: 'btn btn-secondary', id: 'data-export-json', onclick: () => { exportWorkspace(); setStatus('Workspace exported as deckchek-workspace.json.', 'success'); } }, h('span', { html: icon('download', { size: 18 }) }), h('span', { text: 'Export workspace (JSON)' })),
          h('button', { type: 'button', class: 'btn btn-secondary', id: 'data-import-json', onclick: onImportWorkspace }, h('span', { html: icon('upload', { size: 18 }) }), h('span', { text: 'Import workspace (JSON)' })))));
      grid.append(archiveHost, catalogHost);
      return;
    }
    const disabled = st.busy;
    const latest = st.entries[0];
    grid.append(
      h('section', { class: 'card', id: 'data-backup' },
        h('h2', { class: 'card-title', text: 'Back up and restore' }),
        h('p', { class: 'data-last', id: 'data-last', text: latest ? `Last backup: ${when(latest.createdAt)}, ${formatBytes(latest.bytes)}.` : 'No backups yet. Create one before updating DeckChek.' }),
        h('div', { class: 'data-actions' },
          h('button', { type: 'button', class: 'btn btn-primary', id: 'data-backup-now', disabled, onclick: onBackup }, h('span', { html: icon('download', { size: 18 }) }), h('span', { text: 'Back up now' })),
          h('button', { type: 'button', class: 'btn btn-secondary', id: 'data-restore', disabled, onclick: onRestoreFile }, h('span', { html: icon('upload', { size: 18 }) }), h('span', { text: 'Restore from file…' })),
          h('button', { type: 'button', class: 'btn btn-secondary', id: 'data-import-json', disabled, onclick: onImportWorkspace }, h('span', { text: 'Import browser workspace…' }))),
        h('div', { id: 'data-progress-slot' })),
      h('section', { class: 'card', id: 'data-auto' },
        h('h2', { class: 'card-title', text: 'Automatic backups' }),
        h('div', { class: 'field-grid' },
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'data-mode', text: 'Schedule' }),
            h('select', { id: 'data-mode', disabled }, ...Object.entries(MODE_LABEL).map(([v, t]) => h('option', { value: v, text: t, selected: st.schedule?.mode === v })))),
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'data-keep', text: 'Keep the last' }),
            h('input', { type: 'number', id: 'data-keep', disabled, min: '1', max: String(MAX_KEEP), step: '1', value: String(st.schedule?.keep ?? DEFAULT_KEEP) }),
            h('span', { class: 'field-help', text: 'Older automatic backups are deleted. Manual backups are never deleted.' }))),
        h('div', { class: 'data-actions' }, h('button', { type: 'button', class: 'btn btn-secondary', id: 'data-save-schedule', disabled, onclick: saveSchedule, text: 'Save schedule' }))),
      h('section', { class: 'card data-wide', id: 'data-list-card' },
        h('h2', { class: 'card-title', text: 'Backups on this computer' }),
        st.entries.length
          ? h('ul', { class: 'data-backups', id: 'data-backups' }, ...st.entries.map(e => h('li', { class: 'data-backup-row' },
            h('div', { class: 'data-backup-main' }, h('strong', { text: e.name }), h('span', { class: 'field-help', text: `${KIND_LABEL[e.kind] || e.kind} · ${when(e.createdAt)} · ${formatBytes(e.bytes)}` })),
            h('div', { class: 'data-actions' },
              h('button', { type: 'button', class: 'btn btn-secondary btn-sm', disabled, 'aria-label': `Restore ${e.name}`, onclick: () => startRestore(e.path), text: 'Restore…' }),
              h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': `Show ${e.name} in folder`, onclick: () => revealAppPath(e.path, { toast }), text: 'Show in folder' })))))
          : h('p', { class: 'field-help', id: 'data-empty', text: 'No backups yet. Create one before updating DeckChek.' })));
    grid.append(nativeCatalogHost);
  }

  render();
  refresh();
  return {
    onShow: () => { if (disposed || active) return; active = true; render(); if (native) void refresh(); archivePanel?.setActive(true); catalogPanel?.setActive(true); nativeCatalogPanel?.setActive(true); },
    onHide: () => { if (!active || disposed) return; active = false; refreshGeneration++; visibilityGeneration++; workspaceChooser?.retire(); for (const owner of [...modals]) owner.retire(); archivePanel?.setActive(false); catalogPanel?.setActive(false); nativeCatalogPanel?.setActive(false); },
    dispose: () => { if (disposed) return; disposed = true; active = false; refreshGeneration++; visibilityGeneration++; workspaceChooser?.retire(); for (const owner of [...modals]) owner.retire(); archivePanel?.dispose(); catalogPanel?.dispose(); nativeCatalogPanel?.dispose(); },
  };
}

export function dataScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-data')) main.append(h('section', { class: 'screen', id: 'screen-data', hidden: true }));
  return [{ id: 'data', title: 'Data & backup', short: 'Data', icon: 'download', feature: 'backup', create: createDataScreen }];
}
