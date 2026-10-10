// Support dialog (FS-02): crash prompt, "Create diagnostics bundle", Report on GitHub.
// Desktop: Rust builds and writes the zip (diagnostics_* commands). Browser mode: settings and a
// workspace summary are zipped in JS and downloaded; no logs exist there. Nothing is ever uploaded.

import { h, download, isNative } from '../dom.js';
import { icon } from '../icons.js';
import { toast, announce } from '../live.js';
import { settings, workspace, active } from '../state.js';
import { installClientErrorHooks, buildIssueUrl, ISSUE_REPO } from '../../diagnostics-bundle.js';
import { buildBrowserBundleZip, buildBrowserBundleParts } from '../../browser-bundle.js';
import { openExternal, linkConfirmDialog, revealAppPath } from '../../external-links.js';

const tauri = () => globalThis.window?.__TAURI__ ?? globalThis.__TAURI__ ?? null;
const RUN_COUNT = 10;

export const sizeText = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b || 0} B`);
const pad = n => String(n).padStart(2, '0');

/** deckchek-diagnostics-YYYYMMDD-HHmm.zip (local time). */
export function bundleFileName(d = new Date()) {
  return `deckchek-diagnostics-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.zip`;
}

/** Values only the webview knows, merged by Rust into system.json / settings.json / system-health.json. */
export function buildClientContext({ systemHealth, nav = globalThis.navigator, uiSettings = settings } = {}) {
  const ua = String(nav?.userAgent ?? '');
  const webview2Version = /Edg\/([\d.]+)/.exec(ua)?.[1];
  const system = {
    ...(webview2Version ? { webview2Version } : {}),
    ...(nav?.language ? { locale: String(nav.language) } : {}),
    ...(Number.isFinite(nav?.deviceMemory) ? { memoryMb: Math.round(nav.deviceMemory * 1024) } : {}),
    ...(nav?.userAgentData?.platform ? { platform: String(nav.userAgentData.platform) } : {}),
  };
  const ctx = { system, settings: { ...uiSettings } };
  if (systemHealth) ctx.systemHealth = systemHealth;
  return ctx;
}

async function collectSystemHealth() {
  const { createSystemBridge, interpretSystemScan, summarizeFindings } = await import('../../system-check.js');
  const bridge = createSystemBridge();
  if (!bridge.isAvailable()) return null;
  const [drivers, events, logs] = await Promise.allSettled([bridge.scanDrivers(), bridge.scanEvents({ days: 14 }), bridge.scanDjLogs()]);
  const val = r => (r.status === 'fulfilled' ? r.value : null);
  const findings = interpretSystemScan({ drivers: val(drivers), events: val(events), logs: val(logs) });
  return { summary: summarizeFindings(findings), findings: findings.map(f => ({ id: f.id, severity: f.severity, title: f.title })) };
}

const isTyping = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) && el.type !== 'checkbox';

let openDialog = null;

/**
 * Opens the diagnostics dialog. deps (all optional, for tests): { invoke, save, native, collectHealth, now }.
 * Resolves when closed.
 */
export function openDiagnosticsDialog(deps = {}) {
  if (openDialog) return openDialog.done;
  const api = tauri();
  const invoke = deps.invoke ?? api?.core?.invoke;
  const native = deps.native ?? typeof invoke === 'function';
  const save = deps.save ?? api?.dialog?.save;
  const trigger = document.activeElement;
  const st = { redact: true, runs: false, health: false, phase: 'preview', parts: [], summary: '', seq: 0, result: null, error: null, busy: false };

  const uid = `diag-${Date.now().toString(36)}`;
  const body = h('div', { class: 'diag-body' });
  const dlg = h('dialog', { class: 'diag-dialog', 'aria-labelledby': `${uid}-t`, 'aria-describedby': `${uid}-d` },
    h('div', { class: 'dialog-form' },
      h('h2', { id: `${uid}-t`, text: deps.crash ? 'DeckChek closed unexpectedly' : 'Create diagnostics bundle' }),
      h('p', { id: `${uid}-d`, text: deps.crash
        ? 'DeckChek closed unexpectedly. A diagnostics bundle helps us fix it. It contains no audio and nothing is sent automatically.'
        : 'A diagnostics bundle helps us fix problems. It contains no audio and nothing is sent automatically.' }),
      body));
  document.body.append(dlg);

  let resolveDone;
  const done = new Promise(r => { resolveDone = r; });
  openDialog = { done };

  const close = () => { if (dlg.open) dlg.close(); };
  dlg.addEventListener('close', () => {
    dlg.remove();
    openDialog = null;
    if (trigger?.isConnected) trigger.focus();
    resolveDone(st.result);
  }, { once: true });
  dlg.addEventListener('cancel', e => { if (st.busy) e.preventDefault(); }); // Esc while zipping does nothing
  dlg.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || st.phase !== 'preview' || st.busy) return;
    if (e.target.closest?.('button, summary, a') || isTyping(e.target)) return;
    e.preventDefault();
    create();
  });

  const opts = () => ({ redact: st.redact, runCount: st.runs ? RUN_COUNT : 1 });

  async function context() {
    let systemHealth;
    if (st.health && native) {
      try { systemHealth = await (deps.collectHealth ?? collectSystemHealth)(); } catch { systemHealth = undefined; }
    }
    return buildClientContext({ systemHealth });
  }

  async function refreshPreview() {
    const seq = ++st.seq;
    try {
      let r;
      if (native) r = await invoke('diagnostics_preview', { opts: { ...opts(), context: await context() } });
      else r = await buildBrowserBundleParts({ appVersion: await appVersion(), settings, runs: workspace.runs, runCount: opts().runCount, redact: st.redact, system: buildClientContext().system });
      if (seq !== st.seq) return;
      st.parts = r.parts ?? [];
      st.summary = r.summaryText ?? '';
      st.error = null;
    } catch (e) {
      if (seq !== st.seq) return;
      st.parts = []; st.summary = '';
      st.error = { text: 'Couldn’t prepare the preview.', retry: refreshPreview };
    }
    if (st.phase === 'preview') render();
  }

  async function appVersion() {
    try { return (await api?.app?.getVersion?.()) ?? 'browser'; } catch { return 'browser'; }
  }

  async function create() {
    if (st.busy) return;
    st.busy = true; st.phase = 'working'; st.error = null; st.progress = 'Collecting logs…';
    render();
    try {
      const name = bundleFileName(deps.now?.() ?? new Date());
      if (native) {
        const dest = await save?.({ defaultPath: name, filters: [{ name: 'Zip archive', extensions: ['zip'] }] });
        if (!dest) { st.busy = false; st.phase = 'preview'; render(); return; } // cancelled: silent
        st.progress = 'Zipping…'; render();
        const r = await invoke('diagnostics_create_bundle', { destPath: dest, opts: { ...opts(), context: await context() } });
        st.result = { path: r.path, sizeBytes: r.sizeBytes, parts: r.parts ?? [], browser: false };
      } else {
        st.progress = 'Zipping…'; render();
        const r = await buildBrowserBundleZip({ appVersion: await appVersion(), settings, runs: workspace.runs, runCount: opts().runCount, redact: st.redact, system: buildClientContext().system, now: deps.now?.() });
        download(name, new Blob([r.zip], { type: 'application/zip' }), 'application/zip');
        st.result = { path: null, fileName: name, sizeBytes: r.zip.length, parts: r.parts, browser: true };
      }
      st.parts = st.result.parts.length ? st.result.parts : st.parts;
      st.phase = 'done';
      announce(`Diagnostics bundle saved, ${sizeText(st.result.sizeBytes)}.`);
    } catch (e) {
      st.phase = 'preview';
      st.error = { text: `Couldn’t write the bundle${e?.message ? `: ${String(e.message).slice(0, 200)}` : ''}.`, retry: create };
    }
    st.busy = false;
    render();
    focusFirst();
  }

  async function report() {
    const url = buildIssueUrl(st.summary, ISSUE_REPO);
    if (!url) return;
    await openExternal(url, { toast, confirm: linkConfirmDialog });
  }

  const copyText = async text => {
    try { await globalThis.navigator.clipboard.writeText(text); toast('Copied.', { type: 'success', timeout: 2500 }); }
    catch { toast(text, { type: 'info', timeout: 12000 }); }
  };

  function partRow(p) {
    const label = p.status === 'ok' ? sizeText(p.sizeBytes) : p.status === 'skipped' ? 'Not included' : 'Error';
    return h('li', { class: `diag-part diag-${p.status}` },
      h('span', { class: 'mono', text: p.name }),
      h('span', { class: 'small muted', text: p.note && p.status !== 'ok' ? `${label} — ${p.note}` : label }));
  }

  function renderPreview() {
    const skipped = st.parts.filter(p => p.status !== 'ok');
    const toggles = h('div', { class: 'diag-toggles' },
      toggle('Redact personal info (recommended)', st.redact, v => { st.redact = v; refreshPreview(); }, 'diag-redact'),
      toggle(`Include last ${RUN_COUNT} runs summary`, st.runs, v => { st.runs = v; refreshPreview(); }, 'diag-runs'),
      native ? toggle('Include a System Health scan (takes a few seconds)', st.health, v => { st.health = v; refreshPreview(); }, 'diag-health') : null);
    body.replaceChildren(
      h('p', { class: 'small muted', text: 'Redaction is best effort — look through the summary below before sharing.' }),
      st.parts.length ? h('ul', { class: 'diag-parts', 'aria-label': 'Included files' }, st.parts.map(partRow)) : h('p', { class: 'muted', text: 'Preparing preview…', role: 'status' }),
      native ? null : h('p', { class: 'small muted', text: 'Browser mode: the bundle holds your settings and a workspace summary only. Logs are kept by the desktop app.' }),
      skipped.length ? h('p', { class: 'small', text: `Not included: ${skipped.map(p => (p.note ? `${p.name} (${p.note})` : p.name)).join(', ')}` }) : null,
      toggles,
      h('details', { class: 'diag-summary' }, h('summary', { text: 'View summary text' }), h('pre', { class: 'mono small', tabindex: '0', text: st.summary || '…' })),
      st.error ? errorBox() : null,
      actions(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel', onclick: close }),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'diag-create', text: 'Create bundle', onclick: create })));
  }

  const toggle = (label, value, on, id) => h('label', { class: 'diag-toggle small' },
    h('input', { type: 'checkbox', id, checked: value ? true : null, onchange: e => on(e.target.checked) }), ` ${label}`);
  const errorBox = () => h('p', { class: 'diag-error', role: 'alert' }, st.error.text, ' ',
    h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Retry', onclick: () => { st.error.retry(); } }));
  const actions = (...btns) => h('div', { class: 'dialog-actions' }, btns);

  function renderWorking() {
    body.replaceChildren(
      h('div', { class: 'diag-progress', role: 'progressbar', 'aria-label': 'Creating diagnostics bundle', 'aria-valuetext': st.progress },
        h('span', { 'aria-hidden': 'true', html: icon('refresh', { size: 18 }) }), h('span', { text: ` ${st.progress}` })));
  }

  function renderDone() {
    const r = st.result;
    const skipped = (r.parts || []).filter(p => p.status !== 'ok');
    const canReport = Boolean(buildIssueUrl(st.summary, ISSUE_REPO));
    body.replaceChildren(
      h('p', { class: 'diag-saved', role: 'status' }, icon('pass', { size: 18 }), ` ${r.browser ? `Downloaded ${r.fileName}` : `Saved to ${r.path}`} (${sizeText(r.sizeBytes)})`),
      skipped.length ? h('p', { class: 'small', text: `Not included: ${skipped.map(p => (p.note ? `${p.name} (${p.note})` : p.name)).join(', ')}` }) : null,
      canReport ? h('p', { class: 'small muted', text: 'Report on GitHub opens a new issue with a text summary only. Drag the zip into the issue yourself — it is never uploaded for you.' }) : null,
      actions(
        !r.browser ? h('button', { type: 'button', class: 'btn btn-secondary', text: 'Show in folder', onclick: () => revealAppPath(r.path, { toast }) }) : null,
        !r.browser ? h('button', { type: 'button', class: 'btn btn-secondary', text: 'Copy path', onclick: () => copyText(r.path) }) : null,
        canReport ? h('button', { type: 'button', class: 'btn btn-secondary', id: 'diag-report', text: 'Report on GitHub', onclick: report }) : null,
        h('button', { type: 'button', class: 'btn btn-primary', text: 'Done', onclick: close })));
  }

  function render() {
    const had = document.activeElement?.id;
    (st.phase === 'working' ? renderWorking : st.phase === 'done' ? renderDone : renderPreview)();
    // Re-rendering drops focus to <body>; put it back on the same control (or the primary action).
    if (dlg.open && !dlg.contains(document.activeElement)) (had && dlg.querySelector(`#${had}`) ? dlg.querySelector(`#${had}`) : dlg.querySelector('.dialog-actions .btn-primary') ?? dlg).focus();
  }
  const focusFirst = () => (dlg.querySelector('#diag-create') ?? dlg.querySelector('.dialog-actions .btn-primary'))?.focus();

  render();
  dlg.showModal();
  focusFirst();
  refreshPreview();
  return done;
}

/** Startup crash prompt. Resolves 'create' | 'dismiss'. The crash marker is acknowledged either way. */
export function showCrashPrompt(deps = {}) {
  const invoke = deps.invoke ?? tauri()?.core?.invoke;
  const trigger = document.activeElement;
  const dlg = h('dialog', { class: 'diag-dialog diag-crash', 'aria-labelledby': 'diag-crash-t', 'aria-describedby': 'diag-crash-d' },
    h('form', { method: 'dialog', class: 'dialog-form' },
      h('h2', { id: 'diag-crash-t', text: 'DeckChek closed unexpectedly' }),
      h('p', { id: 'diag-crash-d', text: 'DeckChek closed unexpectedly. A diagnostics bundle helps us fix it. It contains no audio and nothing is sent automatically.' }),
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'submit', class: 'btn btn-ghost', value: 'dismiss', text: 'Dismiss' }),
        h('button', { type: 'submit', class: 'btn btn-primary', value: 'create', id: 'diag-crash-create', text: 'Create diagnostics bundle' }))));
  document.body.append(dlg);
  return new Promise(resolve => {
    dlg.addEventListener('close', async () => {
      const choice = dlg.returnValue === 'create' ? 'create' : 'dismiss';
      dlg.remove();
      if (trigger?.isConnected) trigger.focus();
      try { await invoke?.('diagnostics_ack_crash'); } catch { /* marker clears on next clean exit anyway */ }
      if (choice === 'create') await openDiagnosticsDialog({ ...deps, crash: true });
      resolve(choice);
    }, { once: true });
    dlg.showModal();
    dlg.querySelector('#diag-crash-create')?.focus();
  });
}

let started = false;
/** Called once from app.js: error hooks, Ctrl+Shift+D, the `deckchek:diagnostics` event and the crash check. */
export function initDiagnostics(deps = {}) {
  if (started) return;
  started = true;
  const invoke = deps.invoke ?? tauri()?.core?.invoke;
  if (typeof invoke === 'function') installClientErrorHooks(invoke, { screen: () => active.screen?.id });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (!document.querySelector('dialog[open]')) openDiagnosticsDialog();
    }
  });
  globalThis.addEventListener('deckchek:diagnostics', () => { if (!document.querySelector('dialog[open]')) openDiagnosticsDialog(); });
  if (typeof invoke === 'function') {
    Promise.resolve().then(() => invoke('diagnostics_status')).then(s => { if (s?.crashedLastRun) showCrashPrompt({ invoke }); }).catch(() => {});
  }
}
