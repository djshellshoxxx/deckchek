// System Health: Windows audio drivers, Windows event logs and DJ-software
// logs, interpreted into plain-English findings (see ../../system-check.js).

import { h, esc, formatDate, download } from '../dom.js';
import { icon, chip } from '../icons.js';
import { toast, announce } from '../live.js';
import { exportPdfWithFeedback, pdfExportEnabled } from '../persistence.js';
import { onFeatureChange } from '../../features.js';
import { createSystemBridge, interpretSystemScan, summarizeFindings, buildSystemReportHtml, parseDriverDate } from '../../system-check.js';

const SEV_CHIP = { error: ['fail', 'ERROR'], warning: ['warn', 'WARNING'], info: ['info', 'INFO'], ok: ['pass', 'OK'] };
const AREAS = [
  { id: 'drivers', label: 'Audio drivers', scan: 'scanDrivers', icon: 'plug' },
  { id: 'events', label: 'Windows event logs', scan: 'scanEvents', icon: 'alert' },
  { id: 'djLogs', label: 'DJ software logs', scan: 'scanDjLogs', icon: 'file' },
];
const DATA_KEY = { drivers: 'drivers', events: 'events', djLogs: 'logs' };

const ago = ms => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const hr = Math.round(m / 60);
  return `${hr} hour${hr === 1 ? '' : 's'} ago`;
};
const shortDate = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso ?? '—') : d.toLocaleDateString(undefined, { dateStyle: 'medium' }); };
const sizeText = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b || 0} B`);

export function createSystemScreen(section) {
  const bridge = createSystemBridge();
  const state = {
    days: 14, unsupported: !bridge.isAvailable(), started: false,
    areas: { drivers: { status: 'idle' }, events: { status: 'idle' }, djLogs: { status: 'idle' } }, // status: idle|loading|done|error
    scannedAt: null, timer: null,
  };

  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('system', { size: 24 })}</span><div><h1 tabindex="-1">System Health</h1>
      <p class="lede">Checks your Windows audio drivers, the Windows event logs and your DJ software’s own logs, then tells you in plain English what it found and what to do about it.</p></div></div>
      <div class="head-actions"><button type="button" class="btn btn-secondary" id="sys-export" disabled>${icon('download', { size: 18 })}<span>Export report</span></button>
      <button type="button" class="btn btn-secondary" id="sys-export-pdf" disabled${pdfExportEnabled() ? '' : ' hidden'}>${icon('download', { size: 18 })}<span>Export PDF</span></button>
      <button type="button" class="btn btn-primary" id="sys-run">${icon('refresh', { size: 18 })}<span>Run full scan</span></button></div></header>
    <p class="sys-status muted small" id="sys-status" role="status" aria-live="polite"></p>
    <div id="sys-body" class="sys-body"></div>`;
  const $ = s => section.querySelector(s);
  const body = $('#sys-body');

  // ---------- data ----------
  const data = () => Object.fromEntries(AREAS.map(a => [DATA_KEY[a.id], state.areas[a.id].status === 'done' ? state.areas[a.id].data : null]));
  const unsupportedByBackend = () => AREAS.every(a => state.areas[a.id].status === 'done' && state.areas[a.id].data?.supported === false);
  const anyBusy = () => AREAS.some(a => state.areas[a.id].status === 'loading');
  const findings = () => interpretSystemScan(data());

  async function scanArea(id) {
    const area = AREAS.find(a => a.id === id);
    state.areas[id] = { status: 'loading' };
    render();
    try {
      const payload = await (id === 'events' ? bridge.scanEvents({ days: state.days }) : bridge[area.scan]());
      state.areas[id] = { status: 'done', data: payload };
      state.scannedAt = payload?.scannedAt ? new Date(payload.scannedAt).getTime() || Date.now() : Date.now();
    } catch (error) {
      state.areas[id] = { status: 'error', error: String(error?.message || error) };
    }
    render();
  }

  async function runAll() {
    if (anyBusy()) return;
    state.started = true;
    await Promise.all(AREAS.map(a => scanArea(a.id)));
    const f = findings(), s = summarizeFindings(f);
    const failed = AREAS.filter(a => state.areas[a.id].status === 'error').length;
    announce(failed === AREAS.length ? 'System Health scan failed.' : `System Health scan complete. ${s.headline}`, { assertive: s.status === 'fail' });
    if (failed && failed < AREAS.length) toast(`${failed} of 3 scans failed. Use the Retry button in that section.`, { type: 'warn' });
  }

  // ---------- rendering ----------
  function renderStatus() {
    const el = $('#sys-status');
    const done = AREAS.filter(a => ['done', 'error'].includes(state.areas[a.id].status)).length;
    if (anyBusy()) el.textContent = `Scanning… ${done} of 3 areas finished`;
    else if (state.scannedAt) el.textContent = `Last scan ${ago(Date.now() - state.scannedAt)} · ${formatDate(new Date(state.scannedAt).toISOString())}`;
    else el.textContent = '';
    $('#sys-run').disabled = anyBusy() || state.unsupported;
    $('#sys-export').disabled = anyBusy() || !state.scannedAt || unsupportedByBackend();
    $('#sys-export-pdf').disabled = $('#sys-export').disabled;
    $('#sys-run').querySelector('span').textContent = state.scannedAt ? 'Run full scan again' : 'Run full scan';
  }

  function render() {
    renderStatus();
    if (state.unsupported || unsupportedByBackend()) { body.replaceChildren(unsupportedCard()); return; }
    if (!state.started) { body.replaceChildren(introCard()); return; }
    const frag = document.createDocumentFragment();
    frag.append(verdictCard());
    const all = findings();
    AREAS.forEach(a => frag.append(areaSection(a, all.filter(f => f.area === a.id))));
    // Preserve open <details> across re-renders
    const open = new Set([...body.querySelectorAll('details[open][data-key]')].map(d => d.dataset.key));
    frag.querySelectorAll('details[data-key]').forEach(d => { if (open.has(d.dataset.key)) d.open = true; });
    const focusId = document.activeElement?.id;
    body.replaceChildren(frag);
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  }

  function unsupportedCard() {
    const el = h('div', { class: 'card' });
    el.innerHTML = `<div class="empty" id="sys-unsupported">${icon('system', { size: 48 })}<h2>System Health scans run in the Windows desktop app</h2>
      <p>This check reads Windows drivers, the Windows event log and DJ-program log files, so it needs the DeckChek desktop app on Windows. You are viewing the browser preview or a non-Windows system, so nothing was scanned.</p>
      <p class="small">Install DeckChek on the Windows computer you use for DJing, open System Health and press <strong>Run full scan</strong>.</p></div>`;
    return el;
  }

  function introCard() {
    const el = h('div', { class: 'card' });
    el.innerHTML = `<div class="empty">${icon('system', { size: 48 })}<h2>Check your audio setup</h2>
      <p>One scan looks at installed audio and ASIO drivers (are they signed and working?), audio and USB errors in the Windows System log, DJ-program crashes in the Application log, and the log files from Serato, Traktor, rekordbox and others.</p>
      <button type="button" class="btn btn-primary" id="sys-intro-run">${icon('play', { size: 18 })}<span>Run full scan</span></button></div>`;
    el.querySelector('button').addEventListener('click', runAll);
    return el;
  }

  function verdictCard() {
    const loading = anyBusy();
    const all = findings();
    const sum = summarizeFindings(all);
    const el = h('section', { class: `verdict verdict-${loading ? 'info' : sum.status}`, 'aria-label': 'System Health verdict', id: 'sys-verdict' });
    const counts = sum.counts;
    const pill = (sev, n) => `<span class="sys-count">${chip(SEV_CHIP[sev][0], `${n} ${SEV_CHIP[sev][1].toLowerCase()}`, { size: 14 })}</span>`;
    if (loading) {
      el.innerHTML = `<div class="verdict-main"><div class="verdict-chip">${chip('info', 'SCANNING')}</div><div><p class="verdict-headline">Scanning your system…</p><p class="muted verdict-action">Results appear below as each area finishes.</p></div></div>`;
      return el;
    }
    const label = { pass: 'HEALTHY', warn: 'CHECK', fail: 'PROBLEMS', info: 'INFO' }[sum.status];
    el.innerHTML = `<div class="verdict-main"><div class="verdict-chip">${chip(sum.status, label)}</div><div><p class="verdict-headline" id="sys-headline">${esc(sum.headline)}</p>
      <div class="sys-counts">${pill('error', counts.error)}${pill('warning', counts.warning)}${pill('info', counts.info)}${pill('ok', counts.ok)}</div></div></div>`;
    return el;
  }

  function areaSection(area, items) {
    const st = state.areas[area.id];
    const sec = h('section', { class: 'card sys-area', 'aria-labelledby': `sys-h-${area.id}`, id: `sys-area-${area.id}` });
    const head = h('div', { class: 'card-head' });
    head.innerHTML = `<h2 id="sys-h-${area.id}" class="card-title">${icon(area.icon, { size: 18 })}<span>${area.label}</span></h2>`;
    const tools = h('div', { class: 'sys-tools' });
    if (area.id === 'events') {
      const sel = h('select', { id: 'sys-days', 'aria-label': 'Event log period' });
      [7, 14, 30, 90].forEach(d => sel.append(h('option', { value: d, text: `Last ${d} days`, selected: d === state.days ? true : null })));
      sel.value = String(state.days);
      sel.addEventListener('change', () => { state.days = Number(sel.value); scanArea('events'); });
      tools.append(sel);
    }
    const busy = st.status === 'loading';
    tools.append(h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: `sys-rescan-${area.id}`, disabled: busy ? true : null, 'aria-label': `Rescan ${area.label}`, onclick: () => scanArea(area.id),
      html: `${busy ? '<span class="spinner" aria-hidden="true"></span>' : icon('refresh', { size: 16 })}<span>${busy ? 'Scanning…' : 'Rescan'}</span>` }));
    head.append(tools);
    sec.append(head);
    if (st.status === 'loading') { sec.append(h('div', { class: 'empty-inline', html: '<span class="spinner" aria-hidden="true"></span><span>Scanning…</span>' })); sec.setAttribute('aria-busy', 'true'); return sec; }
    if (st.status === 'error') {
      sec.append(h('div', { class: 'banner banner-fail', role: 'alert', html: `${icon('fail', { size: 20 })}<div class="banner-text"><strong>This scan failed.</strong><span>${esc(st.error)}</span></div>` }, h('div', { class: 'banner-actions' }, h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => scanArea(area.id), text: 'Retry' }))));
      return sec;
    }
    if (st.status !== 'done') return sec;
    if (area.id === 'drivers') sec.append(...driverTables(st.data));
    if (area.id === 'djLogs') sec.append(...djAppCards(st.data, items));
    else sec.append(findingList(items));
    return sec;
  }

  // ---------- findings ----------
  function findingList(items) {
    const list = h('div', { class: 'sys-findings', role: 'list' });
    items.forEach(f => list.append(findingEl(f)));
    return list;
  }

  function findingEl(f) {
    const [status, label] = SEV_CHIP[f.severity] || SEV_CHIP.info;
    const el = h('article', { class: `finding sys-finding finding-${status === 'pass' ? 'ok' : status}`, role: 'listitem', 'data-severity': f.severity, 'data-id': f.id });
    el.innerHTML = `<div class="finding-head">${chip(status, label)}<h3>${esc(f.title)}</h3>${f.when ? `<span class="muted small">${esc(shortDate(f.when))}</span>` : ''}</div>
      <div class="finding-grid"><div><p class="section-title">What this means</p><p>${esc(f.meaning)}</p></div><div><p class="section-title">What to do</p><p>${esc(f.action)}</p></div></div>`;
    if (f.evidence?.length) {
      const d = h('details', { class: 'sys-details', 'data-key': `ev-${f.id}` });
      d.innerHTML = `<summary>${icon('chevronRight', { size: 16 })}<span>Evidence (${f.evidence.length})</span></summary><ul class="sys-evidence mono small">${f.evidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;
      el.append(d);
    }
    if (f.events?.length) {
      const d = h('details', { class: 'sys-details', 'data-key': `raw-${f.id}` });
      d.innerHTML = `<summary>${icon('chevronRight', { size: 16 })}<span>Raw events (${f.events.length}${f.count > f.events.length ? ` of ${f.count}` : ''})</span></summary>
        <div class="table-wrap" tabindex="0" role="region" aria-label="Raw events for ${esc(f.title)}"><table class="data"><thead><tr><th scope="col">Time</th><th scope="col">Log</th><th scope="col">Source</th><th scope="col">ID</th><th scope="col">Level</th><th scope="col">Message</th></tr></thead>
        <tbody>${f.events.map(e => `<tr><td class="num">${esc(formatDate(e.timeCreated))}</td><td>${esc(e.log)}</td><td>${esc(e.provider)}</td><td class="num">${esc(e.eventId)}</td><td>${esc(e.level)}</td><td class="sys-msg">${esc(e.message)}</td></tr>`).join('')}</tbody></table></div>`;
      el.append(d);
    }
    return el;
  }

  // ---------- drivers ----------
  function driverTables(scan) {
    const out = [];
    const drivers = [...(scan.drivers || [])].sort((a, b) => (Number(!!b.problemCode) - Number(!!a.problemCode)) || String(a.deviceName).localeCompare(String(b.deviceName)));
    const signed = d => (d.isSigned === true ? chip('pass', 'Signed', { size: 14 }) : d.isSigned === false ? chip('warn', 'Unsigned', { size: 14 }) : chip('info', 'Unknown', { size: 14 }));
    const status = d => {
      if (d.present === false) return chip('info', 'Not connected', { size: 14 });
      if (d.problemCode) return chip('fail', `Error · code ${esc(d.problemCode)}`, { size: 14 });
      if (d.status === 'OK') return chip('pass', 'Working', { size: 14 });
      if (d.status === 'Error') return chip('fail', 'Error', { size: 14 });
      if (d.status === 'Degraded') return chip('warn', 'Degraded', { size: 14 });
      return chip('info', 'Unknown', { size: 14 });
    };
    out.push(h('h3', { class: 'sys-sub', text: `Installed audio drivers (${drivers.length})` }));
    if (!drivers.length) out.push(h('p', { class: 'muted', text: 'No audio-related devices were reported.' }));
    else {
      const wrap = h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Installed audio drivers' });
      wrap.innerHTML = `<table class="data sys-table" id="sys-driver-table"><thead><tr><th scope="col">Device</th><th scope="col">Class</th><th scope="col">Provider</th><th scope="col">Version / date</th><th scope="col">Signed</th><th scope="col">Status</th></tr></thead>
        <tbody>${drivers.map(d => { const dt = parseDriverDate(d.driverDate); return `<tr class="${d.present === false ? 'sys-dim' : ''}"><th scope="row">${esc(d.deviceName)}<span class="muted small mono">${esc(d.manufacturer || '')}</span></th><td>${esc(d.deviceClass || '—')}</td><td>${esc(d.driverProvider || '—')}</td>
          <td class="num">${esc(d.driverVersion || '—')}<span class="muted small">${dt ? esc(shortDate(dt.toISOString())) : '—'}</span></td><td>${signed(d)}</td><td>${status(d)}</td></tr>`; }).join('')}</tbody></table>`;
      out.push(wrap);
    }
    const asio = scan.asioDrivers || [];
    out.push(h('h3', { class: 'sys-sub', text: `ASIO drivers (${asio.length})` }));
    if (!asio.length) out.push(h('p', { class: 'muted', text: 'No ASIO drivers are registered. DJ software will use Windows (WASAPI) audio, which has higher latency.' }));
    else {
      const wrap = h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'ASIO drivers' });
      const sig = a => (!a.signatureStatus ? chip('info', 'Unknown', { size: 14 }) : a.signatureStatus === 'Valid' ? chip('pass', 'Valid', { size: 14 }) : chip(a.signatureStatus === 'HashMismatch' ? 'fail' : 'warn', esc(a.signatureStatus === 'NotSigned' ? 'Unsigned' : a.signatureStatus), { size: 14 }));
      wrap.innerHTML = `<table class="data sys-table" id="sys-asio-table"><thead><tr><th scope="col">Name</th><th scope="col">DLL</th><th scope="col">File</th><th scope="col">Signature</th></tr></thead>
        <tbody>${asio.map(a => `<tr><th scope="row">${esc(a.name)}<span class="muted small mono">${esc(a.clsid || '')}</span></th><td class="mono small sys-path">${esc(a.dllPath || '—')}</td><td>${a.dllExists ? chip('pass', 'Found', { size: 14 }) : chip('warn', 'Missing', { size: 14 })}</td><td>${sig(a)}</td></tr>`).join('')}</tbody></table>`;
      out.push(wrap);
    }
    out.push(h('h3', { class: 'sys-sub', text: 'What we found' }));
    return out;
  }

  // ---------- DJ software ----------
  function djAppCards(scan, items) {
    const out = [];
    const apps = (scan.apps || []);
    const installed = apps.filter(a => a.installed);
    const missing = apps.filter(a => !a.installed).map(a => a.app);
    const named = new Set(installed.map(a => a.app));
    installed.forEach(app => out.push(appCard(app, items.filter(f => f.app === app.app))));
    const other = items.filter(f => !f.app || !named.has(f.app));
    if (other.length) out.push(findingList(other));
    if (missing.length) out.push(h('p', { class: 'muted small', text: `Not detected: ${missing.join(', ')}.` }));
    return out;
  }

  function appCard(app, items) {
    const files = app.files || [];
    const crashes = files.filter(f => f.kind !== 'log').sort((a, b) => new Date(b.modified) - new Date(a.modified));
    const logs = files.filter(f => f.kind === 'log');
    const el = h('article', { class: 'sys-app', 'aria-label': app.app, 'data-app': app.app });
    el.innerHTML = `<div class="sys-app-head"><h3>${esc(app.app)}</h3>${chip('pass', 'Installed', { size: 14 })}
      <dl class="sys-facts"><div><dt>Crash records</dt><dd class="num">${crashes.length}</dd></div><div><dt>Last crash</dt><dd>${crashes.length ? esc(shortDate(crashes[0].modified)) : 'None'}</dd></div><div><dt>Log files</dt><dd class="num">${logs.length}</dd></div></dl></div>`;
    el.append(findingList(items));
    const matchedTotal = files.reduce((n, f) => n + (f.matches?.length || 0), 0);
    const d = h('details', { class: 'sys-details', 'data-key': `app-${app.app}` });
    d.innerHTML = `<summary>${icon('chevronRight', { size: 16 })}<span>Files, matched lines and log tail (${files.length} file${files.length === 1 ? '' : 's'}, ${matchedTotal} matched line${matchedTotal === 1 ? '' : 's'})</span></summary>`;
    const inner = h('div', { class: 'sys-app-detail' });
    const locs = app.locations || [];
    if (locs.length) inner.append(h('div', { html: `<p class="section-title">Locations checked</p><ul class="sys-evidence mono small">${locs.map(l => `<li>${esc(l.path)} ${l.exists ? '' : '<span class="muted">(not found)</span>'}</li>`).join('')}</ul>` }));
    if (!files.length) inner.append(h('p', { class: 'muted', text: 'No log or crash files were found in the last 90 days.' }));
    files.forEach(f => {
      const box = h('div', { class: 'sys-file' });
      box.innerHTML = `<p class="mono small sys-path"><strong>${esc(f.kind)}</strong> · ${esc(f.path)}</p><p class="muted small">Modified ${esc(formatDate(f.modified))} · ${esc(sizeText(f.sizeBytes))}</p>`;
      if (f.matches?.length) box.insertAdjacentHTML('beforeend', `<ul class="sys-lines mono small">${f.matches.map(m => `<li><span class="sys-sev sys-sev-${esc(m.severity)}">${esc(m.severity)}</span> <span class="muted">L${esc(m.lineNo)}</span> ${esc(m.line)}</li>`).join('')}</ul>`);
      if (f.tail?.length) box.insertAdjacentHTML('beforeend', `<p class="section-title">Last ${f.tail.length} lines</p><pre class="sys-tail mono small" tabindex="0" aria-label="Log tail of ${esc(f.path)}">${esc(f.tail.join('\n'))}</pre>`);
      inner.append(box);
    });
    d.append(inner);
    el.append(d);
    return el;
  }

  // ---------- export ----------
  function reportArgs() {
    const all = findings();
    return { findings: all, summary: summarizeFindings(all), generatedAt: new Date().toISOString(), drivers: state.areas.drivers.status === 'done' ? state.areas.drivers.data : null };
  }
  function exportReport() {
    if (!state.scannedAt || unsupportedByBackend()) { toast('Run a scan first, then export the report.', { type: 'warn' }); return; }
    const html = buildSystemReportHtml(reportArgs());
    download(`deckchek-system-health-${new Date().toISOString().slice(0, 10)}.html`, html, 'text/html');
    toast('System Health report exported.', { type: 'success', timeout: 3000 });
  }

  $('#sys-run').addEventListener('click', runAll);
  $('#sys-export').addEventListener('click', exportReport);
  function exportPdf() {
    if (!state.scannedAt || unsupportedByBackend()) { toast('Run a scan first, then export the report.', { type: 'warn' }); return; }
    const args = reportArgs();
    return exportPdfWithFeedback('systemHealth', args, { button: $('#sys-export-pdf'), htmlFallback: () => download(`deckchek-system-health-${new Date().toISOString().slice(0, 10)}.html`, buildSystemReportHtml(args), 'text/html') });
  }
  $('#sys-export-pdf').addEventListener('click', exportPdf);
  onFeatureChange(({ name }) => { if (name === 'pdfExport') $('#sys-export-pdf').hidden = !pdfExportEnabled(); });
  render();

  return {
    onShow() {
      document.getElementById('inspector-title').textContent = 'About System Health';
      document.getElementById('inspector-body').innerHTML = `<div class="inspect"><p>Reads Windows' own records about your audio setup. Nothing is changed on your computer.</p><h3>Drivers</h3><p>Every audio and DJ-hardware driver, whether it is digitally signed, and whether Windows reports the device as working (Device Manager problem codes).</p><h3>Event logs</h3><p>Audio, USB and driver errors from the System log, and crashes or freezes of DJ programs from the Application log, for the last 14 days.</p><h3>DJ software logs</h3><p>Log files and crash reports written by Serato, Traktor, rekordbox, VirtualDJ, Mixxx, djay and Engine DJ.</p><h3>Reading the results</h3><p>Each finding says what it means and what to do. Errors usually explain crashes, dropouts or missing devices; warnings are worth fixing before a gig.</p></div>`;
      state.unsupported = !bridge.isAvailable();
      if (!state.started && !state.unsupported) runAll(); else render();
      clearInterval(state.timer);
      state.timer = setInterval(renderStatus, 30000);
    },
    onHide() { clearInterval(state.timer); },
    onExport: exportReport,
  };
}
