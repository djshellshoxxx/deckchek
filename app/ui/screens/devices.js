// Devices: the user's gear library. Grid of researched device profiles with
// per-unit progress, a device page (identity, documents, connectivity, specs,
// MIDI map, test plan) and the test runners. Results go to device_test_result.

import { h, esc, formatDate, download, slug, isNative } from '../dom.js';
import { icon, chip } from '../icons.js';
import { settings, setSetting, on, store } from '../state.js';
import { toast, announce } from '../live.js';
import { exportPdfWithFeedback, pdfExportEnabled } from '../persistence.js';
import { onFeatureChange } from '../../features.js';
import { go, showInspector } from '../shell.js';
import { verdictFor } from '../metrics.js';
import { workflowInstance } from '../workflows/flow.js';
import { CATEGORY_LABELS, groupTestsByCategory, specSummary, progressFor, latestResults, imageUrl, documentLinks } from '../../devices/library.js';
import { dispatchFor, methodLabel, workflowPrefill, evaluateOutcome, buildResultDetail, effectiveMidiMap, buildDeviceReportHtml } from '../../devices/dispatch.js';
import { lib, ensureLibrary, refreshUnits, profileById, unitsFor, resultsFor, saveResult, addUnit } from '../devices/library-state.js';
import { describeMediaRef } from '../media-picker.js';
import { runManual, runDriver, runSoftware, passText } from '../devices/runners.js';
import { runTimecode } from '../devices/timecode-runner.js';
import { runMidi } from '../devices/midi-runner.js';

const RESULT_CHIP = { pass: ['pass', 'PASS'], fail: ['fail', 'FAIL'], unknown: ['review', 'REVIEW'], skipped: ['info', 'SKIPPED'] };
export function statusChip(status, { size = 14 } = {}) {
  if (!status) return `<span class="chip chip-none">${icon('minus', { size })}<span>NOT RUN</span></span>`;
  const [s, label] = RESULT_CHIP[status] || ['info', String(status).toUpperCase()];
  return chip(s, label, { size });
}
const SEVERITY_LABEL = { critical: 'Critical', major: 'Major', minor: 'Minor' };
const msgText = m => !m?.kind ? '—' : `${m.kind === 'note' ? 'Note' : m.kind === 'cc14' ? 'CC 14-bit' : m.kind === 'pitchbend' ? 'Pitch bend' : m.kind.toUpperCase()}${m.kind === 'pitchbend' ? '' : ` ${m.number ?? m.msbNumber ?? '?'}`} · ch ${m.channel ?? '—'}`;

/** Open a document link in the system browser (Tauri opener/shell when present); otherwise copy it. */
async function openExternal(url, event) {
  const t = globalThis.window?.__TAURI__;
  const opener = t?.opener?.openUrl || t?.opener?.open || t?.shell?.open;
  if (opener) { event?.preventDefault(); try { await opener(url); return; } catch { /* fall through to copy */ } }
  if (!isNative() && !opener) return; // browser: let the link open in a new tab
  event?.preventDefault();
  try { await navigator.clipboard.writeText(url); toast('Link copied — paste it into your web browser.', { type: 'success' }); }
  catch { toast(`Open this link in your browser: ${url}`, { type: 'info', timeout: 12000 }); }
}

export function createDevicesScreen(section) {
  const st = { view: 'grid', profileId: null, filter: 'all', search: '', queue: null, runner: null, runTestId: null, units: { ...(settings.deviceUnits || {}) } };
  const $ = sel => section.querySelector(sel);

  const unitFor = profile => {
    const units = unitsFor(profile.id);
    return units.find(a => a.id === st.units[profile.id]) || units[0] || null;
  };
  const selectUnit = (profile, id) => { st.units[profile.id] = id; setSetting('deviceUnits', st.units); };

  function render() {
    disposeRunner();
    if (st.view === 'detail' && profileById(st.profileId)) renderDetail(profileById(st.profileId));
    else { st.view = 'grid'; renderGrid(); }
  }
  function disposeRunner() { try { st.runner?.dispose?.(); } catch { /* ignore */ } st.runner = null; }

  // ---------- grid ----------
  function renderGrid() {
    section.innerHTML = `
      <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('devices', { size: 24 })}</span><div><h1 tabindex="-1">Devices</h1>
        <p class="lede">Your gear, each with a researched profile and a test plan. Pick a device to see its specs, documents and tests, then run them on your own unit.</p></div></div>
        <div class="head-actions dev-head-stats" id="dev-stats"></div></header>
      <div class="dev-alerts" id="dev-alerts"></div>
      <div class="toolbar dev-toolbar"><div class="segmented" role="radiogroup" aria-label="Category" id="dev-filter"></div>
        <search class="search"><label for="dev-search" class="sr-only">Search devices</label>${icon('search', { size: 18 })}<input id="dev-search" type="search" autocomplete="off" placeholder="Search devices…"></search></div>
      <ul class="dev-grid" id="dev-grid" role="list" aria-label="Device library"></ul>`;
    alerts($('#dev-alerts'));
    if (!lib.ready) { $('#dev-grid').replaceWith(h('div', { class: 'empty', html: `<span class="spinner" aria-hidden="true"></span><h2>Loading your device library…</h2>` })); return; }
    if (!lib.profiles.length) { $('#dev-grid').replaceWith(h('div', { class: 'empty', html: `${icon('devices', { size: 48 })}<h2>No device profiles found</h2><p>app/devices/index.json lists no profiles.</p>` })); return; }
    const cats = ['all', ...new Set(lib.profiles.map(p => p.category))];
    const filter = $('#dev-filter');
    cats.forEach(c => {
      const b = h('button', { type: 'button', role: 'radio', class: 'seg', 'aria-checked': String(st.filter === c), tabindex: st.filter === c ? '0' : '-1', text: c === 'all' ? `All (${lib.profiles.length})` : CATEGORY_LABELS[c] || c });
      b.addEventListener('click', () => { st.filter = c; renderGrid(); $('#dev-filter [aria-checked="true"]')?.focus(); });
      filter.append(b);
    });
    filter.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const i = cats.indexOf(st.filter);
      st.filter = cats[(i + (e.key === 'ArrowLeft' ? cats.length - 1 : 1)) % cats.length];
      renderGrid(); $('#dev-filter [aria-checked="true"]')?.focus();
    });
    const search = $('#dev-search');
    search.value = st.search;
    search.addEventListener('input', () => { st.search = search.value; fillGrid(); });
    fillGrid();
    const totals = lib.profiles.reduce((t, p) => { const u = unitFor(p); const pr = progressFor(p, u ? resultsFor(u.id) : []); t.tests += pr.total; t.passed += pr.passed; t.failed += pr.failed; return t; }, { tests: 0, passed: 0, failed: 0 });
    $('#dev-stats').innerHTML = `<dl class="dev-stats"><div><dt>Devices</dt><dd class="num">${lib.profiles.length}</dd></div><div><dt>Tests</dt><dd class="num">${totals.tests}</dd></div><div><dt>Passed</dt><dd class="num dev-ok${totals.passed ? ' has' : ''}">${totals.passed}</dd></div><div><dt>Failed</dt><dd class="num dev-bad${totals.failed ? ' has' : ''}">${totals.failed}</dd></div></dl>`;
  }

  function fillGrid() {
    const grid = $('#dev-grid');
    if (!grid) return;
    const q = st.search.trim().toLowerCase();
    const list = lib.profiles.filter(p => (st.filter === 'all' || p.category === st.filter) && (!q || `${p.manufacturer} ${p.model} ${(p.aliases || []).join(' ')} ${p.category}`.toLowerCase().includes(q)));
    if (!list.length) { grid.replaceChildren(h('li', { class: 'empty empty-sm', html: `${icon('search', { size: 32 })}<h2>No matches</h2><p>No device matches “${esc(st.search)}”.</p>` })); return; }
    grid.replaceChildren(...list.map(card));
  }

  function progressBar(pr, { label = true } = {}) {
    const pct = n => (pr.total ? (100 * n / pr.total).toFixed(2) : 0);
    const text = `${pr.passed} passed · ${pr.failed} failed${pr.unknown ? ` · ${pr.unknown} to review` : ''} · ${pr.untested} not run`;
    return `<div class="dev-progress" role="img" aria-label="${esc(`${text}, of ${pr.total} tests`)}"><span class="dev-p-pass" style="width:${pct(pr.passed)}%"></span><span class="dev-p-fail" style="width:${pct(pr.failed)}%"></span><span class="dev-p-review" style="width:${pct(pr.unknown)}%"></span><span class="dev-p-skip" style="width:${pct(pr.skipped)}%"></span></div>${label ? `<span class="dev-progress-text small"><span class="num">${pr.done}/${pr.total}</span> run · ${esc(text.replace(` · ${pr.untested} not run`, ''))}</span>` : ''}`;
  }

  function card(p) {
    const unit = unitFor(p), pr = progressFor(p, unit ? resultsFor(unit.id) : []), spec = specSummary(p);
    const img = imageUrl(p);
    const li = h('li', { class: 'dev-card', 'data-device': p.id });
    const btn = h('button', { type: 'button', class: 'dev-card-main', 'aria-label': `${p.manufacturer} ${p.model}, ${CATEGORY_LABELS[p.category] || p.category}, ${pr.total} tests, ${pr.passed} passed, ${pr.failed} failed${spec.hasUnverified ? ', has unverified specs' : ''}` });
    btn.innerHTML = `<span class="dev-thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy" draggable="false">` : icon('devices', { size: 48 })}</span>
      <span class="dev-card-body">
        <span class="dev-mfr">${esc(p.manufacturer)}</span>
        <span class="dev-model">${esc(p.model)}</span>
        <span class="dev-tags"><span class="dev-cat">${esc(CATEGORY_LABELS[p.category] || p.category)}</span><span class="dev-count num">${pr.total} tests</span>${spec.hasUnverified ? `<span class="badge badge-unverified" title="Some specs could not be confirmed against manufacturer documents">${icon('warn', { size: 12 })}UNVERIFIED SPECS</span>` : '<span class="badge badge-verified">SPECS CONFIRMED</span>'}</span>
        ${progressBar(pr)}
        <span class="dev-unit small muted">${unit ? `${icon('equipment', { size: 14 })}<span>${esc(unit.nickname)}${unitsFor(p.id).length > 1 ? ` +${unitsFor(p.id).length - 1}` : ''}</span>` : '<span>No unit in Equipment</span>'}</span>
      </span>`;
    btn.addEventListener('click', () => openDevice(p.id));
    li.append(btn);
    return li;
  }

  function alerts(host) {
    if (!host) return;
    const items = [];
    if (lib.error) items.push(['fail', 'Device library could not load', lib.error]);
    if (lib.syncError) items.push(['warn', 'Devices are not saved to the database', `Sync failed: ${lib.syncError}. Tests can run but results cannot be saved until this is fixed.`]);
    for (const p of lib.problems || []) items.push(['warn', `Profile “${p.id}” was skipped`, p.errors.slice(0, 3).join('; ')]);
    host.replaceChildren(...items.map(([s, t, d]) => h('div', { class: `banner banner-${s}`, role: s === 'fail' ? 'alert' : 'status', html: `${chip(s)}<div class="banner-text"><strong>${esc(t)}</strong><span>${esc(d)}</span></div>` })));
  }

  function openDevice(id, { focus = true } = {}) {
    st.view = 'detail'; st.profileId = id;
    render();
    document.getElementById('main').scrollTop = 0;
    if (focus) $('h1')?.focus();
    announce(`${profileById(id)?.model} device page`);
  }

  // ---------- detail ----------
  function renderDetail(p) {
    const units = unitsFor(p.id), unit = unitFor(p);
    const results = unit ? resultsFor(unit.id) : [];
    const pr = progressFor(p, results), spec = specSummary(p), latest = latestResults(results.filter(r => r.profileId === p.id));
    const img = imageUrl(p);
    section.innerHTML = `
      <nav class="dev-crumbs" aria-label="Breadcrumb"><button type="button" class="btn btn-ghost btn-sm" id="dev-back">${icon('chevronLeft', { size: 18 })}<span>All devices</span></button></nav>
      <header class="screen-head dev-detail-head">
        <div class="screen-title"><span class="dev-head-thumb">${img ? `<img src="${esc(img)}" alt="">` : icon('devices', { size: 32 })}</span><div>
          <span class="dev-mfr">${esc(p.manufacturer)}</span><h1 tabindex="-1">${esc(p.model)}</h1>
          <p class="dev-head-tags"><span class="dev-cat">${esc(CATEGORY_LABELS[p.category] || p.category)}</span>${(p.aliases || []).length ? `<span class="muted small">also: ${esc(p.aliases.join(', '))}</span>` : ''}${spec.hasUnverified ? `<span class="badge badge-unverified">${icon('warn', { size: 12 })}${spec.unverified} UNVERIFIED SPEC${spec.unverified === 1 ? '' : 'S'}</span>` : '<span class="badge badge-verified">SPECS CONFIRMED</span>'}${spec.midiLearn ? '<span class="badge">MIDI LEARN MODE</span>' : ''}</p></div></div>
        <div class="head-actions dev-unit-bar" id="dev-unit-bar"></div>
      </header>
      ${p.identityNotes ? `<aside class="dev-identity" aria-label="Identity note">${icon('alert', { size: 22 })}<div><strong>Check your unit's identity</strong><p>${esc(p.identityNotes)}</p></div></aside>` : ''}
      <section class="card dev-summary" aria-label="Progress for this unit">
        <div class="dev-summary-text"><p>${esc(p.summary)}</p></div>
        <div class="dev-summary-progress"><div class="dev-summary-counts">
          <span>${statusChip('pass')}<b class="num">${pr.passed}</b></span><span>${statusChip('fail')}<b class="num">${pr.failed}</b></span><span>${statusChip('unknown')}<b class="num">${pr.unknown}</b></span><span>${statusChip(null)}<b class="num">${pr.untested}</b></span></div>
          ${progressBar(pr, { label: false })}</div>
      </section>
      <div class="dev-detail-grid">
        <div class="dev-detail-main"><section aria-labelledby="dev-plan-title"><div class="section-head"><h2 class="section-title" id="dev-plan-title">Test plan</h2><span class="muted small">${pr.total} tests in ${groupTestsByCategory(p).length} groups${unit ? ` · results for ${esc(unit.nickname)}` : ''}</span></div><div id="dev-plan"></div></section></div>
        <aside class="dev-detail-side" aria-label="Device reference">
          <section class="card card-quiet" aria-labelledby="dev-docs-title"><h2 class="card-title" id="dev-docs-title">Documents</h2><div id="dev-docs"></div></section>
          <section class="card card-quiet" aria-labelledby="dev-conn-title"><h2 class="card-title" id="dev-conn-title">Connectivity</h2><div id="dev-conn"></div></section>
          ${p.image ? `<p class="muted small dev-credit">Image: ${esc(p.image.kind || '')} — ${esc(p.image.source || '')}${p.image.license ? ` (${esc(p.image.license)})` : ''}</p>` : ''}
        </aside>
      </div>
      <section class="card" aria-labelledby="dev-specs-title"><div class="card-head"><h2 class="card-title" id="dev-specs-title">Specifications</h2><span class="muted small">${spec.confirmed} confirmed · ${spec.unverified} unverified</span></div><div id="dev-specs"></div></section>
      <section class="card" aria-labelledby="dev-midi-title"><div class="card-head"><h2 class="card-title" id="dev-midi-title">MIDI map</h2><span class="muted small" id="dev-midi-sub"></span></div><div id="dev-midi"></div></section>`;
    $('#dev-back').addEventListener('click', () => { st.view = 'grid'; render(); $('h1')?.focus(); });
    unitBar(p, units, unit);
    plan(p, unit, latest);
    docs(p);
    connectivity(p);
    specsTable(p);
    midiMap(p, unit);
  }

  function unitBar(p, units, unit) {
    const bar = $('#dev-unit-bar');
    if (units.length > 1) {
      const sel = h('select', { id: 'dev-unit', 'aria-label': 'Unit' }, ...units.map(a => h('option', { value: a.id, text: `${a.nickname}${a.serialNumber ? ` · ${a.serialNumber}` : ''}`, selected: a.id === unit?.id ? true : null })));
      sel.addEventListener('change', () => { selectUnit(p, sel.value); render(); });
      bar.append(h('label', { class: 'topfield', for: 'dev-unit' }, h('span', { class: 'topfield-label', text: 'Unit' }), sel));
    } else if (unit) bar.append(h('span', { class: 'dev-unit-name', html: `${icon('equipment', { size: 16 })}<span>${esc(unit.nickname)}${unit.serialNumber ? ` <span class="muted">· S/N ${esc(unit.serialNumber)}</span>` : ''}</span>` }));
    bar.append(
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'dev-add-unit', html: `${icon('plus', { size: 16 })}<span>Add unit</span>`, 'data-tooltip': 'Add another unit of this model', onclick: async () => { try { const a = await addUnit(p); selectUnit(p, a.id); toast(`Added “${a.nickname}”. Rename it and add its serial number in Equipment.`, { type: 'success' }); render(); } catch (error) { toast(String(error?.message || error), { type: 'error' }); } } }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', html: `${icon('edit', { size: 16 })}<span>Rename / serial</span>`, 'data-tooltip': 'Edit this unit in Equipment', onclick: () => go('equipment') }),
      h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'dev-export', disabled: !unit || null, html: `${icon('download', { size: 16 })}<span>Export report</span>`, 'data-tooltip': 'Device report as HTML (Ctrl+E)', onclick: () => exportReport(p) }),
      h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'dev-export-pdf', hidden: pdfExportEnabled() ? null : true, disabled: !unit || null, html: `${icon('download', { size: 16 })}<span>Export PDF</span>`, 'data-tooltip': 'Device report as PDF', onclick: e => exportPdf(p, e.currentTarget) }));
  }

  function plan(p, unit, latest) {
    const host = $('#dev-plan');
    if (!unit) host.append(h('div', { class: 'banner banner-warn', role: 'status', html: `${chip('warn')}<div class="banner-text"><strong>No unit to test</strong><span>Results are saved per unit. Add a unit to run tests.</span></div>` }));
    for (const g of groupTestsByCategory(p)) {
      const done = g.tests.filter(t => latest.get(t.id)).length;
      const card = h('section', { class: 'card dev-group', 'data-category': g.category, 'aria-labelledby': `dev-g-${g.category}` });
      const head = h('div', { class: 'dev-group-head' }, h('h3', { id: `dev-g-${g.category}`, html: `${esc(g.label)} <span class="muted small num">${done}/${g.tests.length} run</span>` }));
      if (g.tests.length > 1) head.append(h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-run-category': g.category, disabled: !unit || null, html: `${icon('play', { size: 14 })}<span>Run all ${g.tests.length}</span>`, onclick: () => startQueue(p, g) }));
      const ul = h('ul', { class: 'dev-tests', role: 'list' });
      for (const t of g.tests) {
        const r = latest.get(t.id);
        const d = dispatchFor(t);
        const li = h('li', { class: `dev-test ${r ? `dev-test-${r.status}` : ''}`, 'data-test': t.id });
        li.innerHTML = `<span class="dev-test-status">${statusChip(r?.status)}</span>`;
        const info = h('button', { type: 'button', class: 'dev-test-main', 'aria-label': `${t.title}. ${r ? `Last result ${r.status}` : 'Not run yet'}. Show details.` });
        info.innerHTML = `<strong>${esc(t.title)}</strong><span class="muted small">${esc(methodLabel(t))} · ${esc(SEVERITY_LABEL[t.severity] || t.severity || '')}${r ? ` · ${esc(formatDate(r.createdAt))}` : ''}${t.pass ? '' : d.runner === 'manual' || (d.runner === 'midi' && d.kind === 'led') ? ' · your judgement' : ' · judged by analysis'}</span>`;
        info.addEventListener('click', () => testDetails(p, t, unit));
        const run = h('button', { type: 'button', class: `btn ${r ? 'btn-ghost' : 'btn-secondary'} btn-sm dev-run-btn`, 'data-run-test': t.id, disabled: !unit || d.runner === 'unsupported' || null, 'aria-label': `${r ? 'Run again' : 'Run'}: ${t.title}`, html: `${icon(r ? 'refresh' : 'play', { size: 14 })}<span>${r ? 'Re-run' : 'Run'}</span>` });
        run.addEventListener('click', () => runTest(p, t));
        li.append(info, run);
        ul.append(li);
      }
      card.append(head, ul);
      host.append(card);
    }
  }

  function testDetails(p, t, unit) {
    const history = unit ? resultsFor(unit.id).filter(r => r.profileId === p.id && r.testId === t.id) : [];
    const body = h('div', { class: 'inspect' });
    const last = history[0];
    body.innerHTML = `<div class="inspect-chips">${statusChip(last?.status)}<span class="small">${esc(methodLabel(t))}</span></div>
      <p>${esc(t.why || '')}</p>
      <h3>Steps</h3><ol class="dev-steplist">${(t.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      ${(t.equipment || []).length ? `<h3>Equipment</h3><p>${esc(t.equipment.join(', '))}</p>` : ''}
      <h3>Pass criterion</h3><p>${t.pass ? esc(passText(t)) : 'None in the profile — judged from the analysis verdict or your answers.'}</p>
      ${last ? `<h3>Last result</h3><p>${esc(last.detail?.summary || '')}</p>${last.mediaId ? '<p class="small" data-media-used>Test medium: <span class="media-used"></span></p>' : ''}${(last.detail?.measurements || []).length ? `<table class="mini"><tbody>${last.detail.measurements.map(m => `<tr><th scope="row">${esc(m.label)}</th><td class="num">${esc(typeof m.value === 'number' ? +m.value.toFixed(3) : m.value ?? '—')} ${esc(m.unit === 'bool' ? '' : m.unit)}</td></tr>`).join('')}</tbody></table>` : ''}${last.detail?.notes ? `<p><strong>Notes:</strong> ${esc(last.detail.notes)}</p>` : ''}` : ''}
      ${history.length > 1 ? `<h3>History</h3><ul class="dev-history">${history.slice(0, 8).map(r => `<li>${statusChip(r.status, { size: 12 })}<span class="small">${esc(formatDate(r.createdAt))}</span>${r.mediaId ? `<span class="small muted media-used" data-media-id="${esc(r.mediaId)}" data-track-key="${esc(r.mediaTrackKey || '')}"></span>` : ''}</li>`).join('')}</ul>` : ''}
      <p class="inspect-id mono">${esc(t.id)}</p>`;
    // Test medium used (FS-06 AC-6): resolved asynchronously so the library can load first.
    body.querySelectorAll('.dev-history .media-used').forEach(el => {
      describeMediaRef({ mediaId: el.dataset.mediaId, mediaTrackKey: el.dataset.trackKey || null }).then(t => { if (t) el.textContent = ` · ${t}`; });
    });
    const lastHolder = body.querySelector('[data-media-used] .media-used');
    if (lastHolder && last) describeMediaRef(last).then(t => { lastHolder.textContent = t || ''; });
    const run = h('button', { type: 'button', class: 'btn btn-primary', disabled: !unit || null, html: `${icon('play', { size: 16 })}<span>${last ? 'Run again' : 'Run test'}</span>`, onclick: () => runTest(p, t) });
    body.append(run);
    showInspector({ title: t.title, body });
  }

  function docs(p) {
    const host = $('#dev-docs');
    const { links, missing } = documentLinks(p);
    const ul = h('ul', { class: 'dev-docs', role: 'list' });
    for (const d of links) {
      const a = h('a', { href: d.url, class: 'dev-doc-link', html: `${icon('external', { size: 16 })}<span>${esc(d.title || d.url)}</span>` });
      a.addEventListener('click', e => openExternal(d.url, e));
      const copy = h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': `Copy link: ${d.title}`, 'data-tooltip': 'Copy link', html: icon('copy', { size: 16 }), onclick: async () => { try { await navigator.clipboard.writeText(d.url); toast('Link copied.', { type: 'success', timeout: 2500 }); } catch { toast(d.url, { timeout: 12000 }); } } });
      ul.append(h('li', {}, h('div', { class: 'dev-doc-row' }, a, copy), h('span', { class: 'dev-doc-url mono small', title: d.url, text: d.url.replace(/^https?:\/\//, '') }), d.notes ? h('span', { class: 'muted small', text: `${d.type ? `${d.type.replace(/-/g, ' ')} · ` : ''}${d.notes}` }) : null));
    }
    if (!links.length) host.append(h('p', { class: 'muted small', text: 'No public documents were found for this device.' }));
    host.append(ul);
    if (missing.length) host.append(h('p', { class: 'muted small dev-docs-missing', text: `Not found publicly: ${missing.map(d => d.title).join(', ')}.` }));
  }

  function connectivity(p) {
    const c = p.connectivity || {}, rows = [];
    if (c.usb?.present) rows.push(['USB', [c.usb.classCompliant ? 'class-compliant' : 'needs vendor driver', c.usb.vendorId && `VID ${c.usb.vendorId}`, (c.usb.productIds || []).length && `PID ${c.usb.productIds.join(', ')}`].filter(Boolean).join(' · '), c.usb.notes]);
    else rows.push(['USB', 'None', null]);
    if (c.midi) rows.push(['MIDI', [c.midi.usbMidi && 'USB MIDI', c.midi.din && 'DIN MIDI'].filter(Boolean).join(' + ') || '—', (c.midi.portNamePatterns || []).length ? `Port names: ${c.midi.portNamePatterns.join(', ')}` : null]);
    if (c.audio) rows.push(['USB audio', [c.audio.usbChannelsIn != null && `${c.audio.usbChannelsIn} in`, c.audio.usbChannelsOut != null && `${c.audio.usbChannelsOut} out`, (c.audio.sampleRatesHz || []).length && c.audio.sampleRatesHz.map(r => `${r / 1000} kHz`).join('/'), c.audio.bitDepth && `${c.audio.bitDepth}-bit`].filter(Boolean).join(' · ') || 'unknown', null]);
    if ((c.analog || []).length) rows.push(['Analog', c.analog.join(' · '), null]);
    for (const d of p.drivers || []) rows.push(['Driver', `${d.name}${d.required ? ' (required)' : ''}`, [d.asioName && `ASIO: ${d.asioName}`, d.latestKnownVersion && `latest known ${d.latestKnownVersion}`, d.notes].filter(Boolean).join(' · ') || null]);
    for (const s of p.software || []) rows.push(['Software', `${s.name}${s.role ? ` · ${s.role}` : ''}`, [s.minVersion && `min ${s.minVersion}`, s.notes].filter(Boolean).join(' · ') || null]);
    $('#dev-conn').innerHTML = `<dl class="dev-kv">${rows.map(([k, v, n]) => `<dt>${esc(k)}</dt><dd>${esc(v)}${n ? `<span class="muted small">${esc(n)}</span>` : ''}</dd>`).join('')}</dl>`;
  }

  function specsTable(p) {
    const host = $('#dev-specs');
    if (!(p.specs || []).length) { host.innerHTML = '<p class="muted">No specifications recorded.</p>'; return; }
    const unv = specSummary(p).unverified;
    host.innerHTML = `${unv ? `<p class="hint hint-warn">${icon('warn', { size: 16 })}<span>${unv} spec${unv === 1 ? ' is' : 's are'} <strong>unverified</strong> — not confirmed against a manufacturer document. Tests that rely on them are indicative only.</span></p>` : ''}
      <div class="table-wrap"><table class="data dev-spec-table"><thead><tr><th scope="col">Spec</th><th scope="col" class="r">Value</th><th scope="col">Status</th><th scope="col">Source</th></tr></thead><tbody>
      ${p.specs.map(s => `<tr data-spec="${esc(s.key)}"><th scope="row"><span>${esc(s.label || s.key)}</span>${s.notes ? `<span class="muted small">${esc(s.notes)}</span>` : ''}</th>
        <td class="r num">${esc(s.value ?? '—')} ${esc(s.unit || '')}${s.tolerance != null ? `<span class="muted small"> ±${esc(s.tolerance)}</span>` : ''}</td>
        <td>${s.confidence === 'confirmed' ? chip('pass', 'CONFIRMED', { size: 12 }) : chip('warn', 'UNVERIFIED', { size: 12 })}</td>
        <td class="small dev-src">${/^https?:/.test(s.source || '') ? `<span class="mono">${esc(s.source.replace(/^https?:\/\//, ''))}</span>` : esc(s.source || '—')}</td></tr>`).join('')}
      </tbody></table></div>
      ${(p.timecode?.formats || []).length ? `<h3 class="dev-sub">Timecode formats</h3><ul class="dev-formats">${p.timecode.formats.map(f => `<li><strong>${esc(f.name)}</strong> <span class="num">${esc(f.carrierHz)} Hz @ ${esc(f.atRpm)} rpm</span> ${f.confidence === 'confirmed' ? chip('pass', 'CONFIRMED', { size: 12 }) : chip('warn', 'UNVERIFIED', { size: 12 })}${f.notes ? `<span class="muted small">${esc(f.notes)}</span>` : ''}</li>`).join('')}</ul>` : ''}`;
  }

  async function midiMap(p, unit) {
    const host = $('#dev-midi'), sub = $('#dev-midi-sub');
    if (!p.midi && !p.tests.some(t => String(t.method).startsWith('midi:'))) { host.innerHTML = '<p class="muted">This device does not send MIDI.</p>'; return; }
    let learned = null;
    try { learned = unit ? await store.getMidiMap(unit.id) : null; } catch { /* none */ }
    if (!host.isConnected) return;
    const eff = effectiveMidiMap(p.midi, learned?.map);
    const source = p.midi?.mapSource;
    sub.textContent = eff.mapSource === 'learned' ? `Learned on ${unit?.nickname || 'this unit'}${learned?.updatedAt ? ` · ${formatDate(learned.updatedAt)}` : ''}` : /^https?:/.test(source || '') ? 'From the published MIDI message list' : 'Learn mode';
    const parts = [];
    if (eff.mapSource === 'learn') parts.push(`<div class="dev-learn-explain">${icon('keyboard', { size: 28 })}<div><strong>No public MIDI message list — DeckChek learns it from your unit.</strong><p>Run <em>MIDI coverage</em>, move every control, name the messages that appear and press <em>Save learned map</em>. The map is stored with this unit and later fader, jog, button and LED tests use it.</p></div></div>`);
    if (eff.controls.length) {
      const groups = {};
      for (const c of eff.controls) (groups[c.group || 'Ungrouped'] ||= []).push(c);
      parts.push(`<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Control</th><th scope="col">Type</th><th scope="col">Message</th><th scope="col">LED</th></tr></thead><tbody>${Object.entries(groups).map(([g, cs]) => `<tr class="dev-map-group"><th scope="rowgroup" colspan="4">${esc(g)}</th></tr>${cs.map(c => `<tr><th scope="row">${esc(c.label || c.id)}</th><td>${esc(c.type || '')}</td><td class="num">${esc(msgText(c.message))}</td><td>${c.led ? 'Yes' : ''}</td></tr>`).join('')}`).join('')}</tbody></table></div>`);
    }
    if ((eff.placeholders || []).length) parts.push(`<h3 class="dev-sub">Expected controls not yet mapped (${eff.placeholders.length})</h3><p class="dev-placeholders">${eff.placeholders.map(c => `<span class="tag">${esc(c.label || c.id)}</span>`).join('')}</p>`);
    if (!p.midi) parts.push('<p class="muted small">The profile has no MIDI section; MIDI tests start in learn mode.</p>');
    host.innerHTML = parts.join('');
  }

  // ---------- running tests ----------
  function startQueue(p, group) {
    const unit = unitFor(p);
    if (!unit) return;
    st.queue = { profileId: p.id, assetId: unit.id, category: group.label, testIds: group.tests.map(t => t.id), index: 0 };
    announce(`Running ${group.tests.length} ${group.label} tests`);
    runTest(p, group.tests[0], { fromQueue: true });
  }
  const queueText = () => st.queue ? `Test ${st.queue.index + 1} of ${st.queue.testIds.length} · ${st.queue.category}` : '';
  const hasNext = () => st.queue && st.queue.index + 1 < st.queue.testIds.length;

  function advanceQueue() {
    const q = st.queue;
    if (!q) return false;
    q.index++;
    const p = profileById(q.profileId);
    if (q.index >= q.testIds.length || !p) { st.queue = null; toast(`${q.category}: all ${q.testIds.length} tests done.`, { type: 'success' }); openDevice(q.profileId); return true; }
    runTest(p, p.tests.find(t => t.id === q.testIds[q.index]), { fromQueue: true });
    return true;
  }
  function stopQueue() { const id = st.queue?.profileId; st.queue = null; if (id) openDevice(id); }

  function runTest(p, test, { fromQueue = false } = {}) {
    if (!fromQueue) st.queue = null;
    const unit = unitFor(p);
    if (!unit) { toast('Add a unit for this device first.', { type: 'warn' }); return; }
    const d = dispatchFor(test);
    if (d.runner === 'unsupported') { toast(d.reason, { type: 'warn' }); return; }
    if (d.runner === 'workflow') { startWorkflow(p, test, unit, d); return; }
    st.view = 'run'; st.profileId = p.id; st.runTestId = test.id;
    renderRunner(p, test, unit, d);
  }

  function startWorkflow(p, test, unit, d) {
    const pf = workflowPrefill(test, d.mode);
    go(d.workflowId);
    const wf = workflowInstance(d.workflowId);
    if (!wf) { toast('Could not open the workflow.', { type: 'error' }); return; }
    wf.beginDeviceTest({
      deviceName: `${p.manufacturer} ${p.model}`, unitName: unit.nickname, testTitle: test.title, mode: d.mode, values: pf.values, notes: pf.notes,
      steps: test.steps, equipment: test.equipment, why: test.why, assetId: unit.id, queueText: queueText(), backLabel: hasNext() ? 'Next test' : 'Back to device',
      onComplete: async (run, saved) => {
        const v = verdictFor(run);
        const outcome = evaluateOutcome(test, { measurements: run.measurements, findings: run.findings, verdictStatus: v.status });
        const findings = (run.findings || []).map(f => ({ id: f.code, severity: f.severity, title: f.title, meaning: f.detail, action: (f.isolationTests || []).join('; ') }));
        await saveResult({ profile: p, test, assetId: unit.id, status: outcome.status, sessionId: saved?.ok ? run.id : null, params: run.params,
          detail: buildResultDetail({ test, outcome, measurements: run.measurements, findings, extra: { runId: run.id, workflow: run.workflow, mode: run.test, score: run.score ?? null, verdict: v.status, source: run.sourceFile || null, savedToHistory: !!saved?.ok } }) });
        return outcome;
      },
      onBack: how => { go('devices'); if (how === 'back' && st.queue) advanceQueue(); else openDevice(p.id); },
      onCancel: () => { st.queue = null; go('devices'); openDevice(p.id); },
    });
  }

  async function renderRunner(p, test, unit, d) {
    disposeRunner();
    const cat = groupTestsByCategory(p).find(g => g.tests.includes(test));
    section.innerHTML = `
      <nav class="dev-crumbs" aria-label="Breadcrumb"><button type="button" class="btn btn-ghost btn-sm" id="dev-run-back">${icon('chevronLeft', { size: 18 })}<span>${esc(p.model)}</span></button></nav>
      <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon(d.runner === 'midi' ? 'keyboard' : d.runner === 'timecode' ? 'dvs' : d.runner === 'manual' ? 'check' : 'system', { size: 24 })}</span><div>
        <span class="dev-mfr">${esc(p.manufacturer)} ${esc(p.model)} · ${esc(unit.nickname)}</span><h1 tabindex="-1">${esc(test.title)}</h1>
        <p class="dev-head-tags"><span class="dev-cat">${esc(cat?.label || test.category)}</span><span class="badge">${esc(methodLabel(test).toUpperCase())}</span><span class="badge">${esc((SEVERITY_LABEL[test.severity] || '').toUpperCase())}</span></p></div></div></header>
      <div class="banner banner-device" role="status" id="dev-run-banner"><span class="banner-device-icon">${icon('devices', { size: 22 })}</span><div class="banner-text"><strong>Running ${esc(p.model)} · ${esc(test.title)}</strong><span>${st.queue ? `${esc(queueText())} · ` : ''}The result is saved to ${esc(unit.nickname)}.</span></div><div class="banner-actions" id="dev-run-actions"></div></div>
      <div id="dev-run-result" aria-live="polite"></div>
      <div id="dev-runner"></div>`;
    $('#dev-run-back').addEventListener('click', () => { st.queue = null; openDevice(p.id); });
    const actions = $('#dev-run-actions');
    if (st.queue) {
      actions.append(h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'dev-run-skip', text: 'Skip test', onclick: () => ctx.skip('Skipped during a category run.') }),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Stop run', onclick: stopQueue }));
    }
    const host = $('#dev-runner');
    const ctx = {
      profile: p, test, asset: unit, kind: d.kind,
      finish: async ({ status, detail, criterion, measurements = [], findings = [], extra = {} }) => {
        if (!status) return;
        const outcome = { status, detail, criterion };
        try {
          const row = await saveResult({ profile: p, test, assetId: unit.id, status, detail: buildResultDetail({ test, outcome, measurements, findings, extra }) });
          showRunResult(p, test, row);
        } catch (error) { toast(`Result not saved: ${error?.message || error}`, { type: 'error' }); }
      },
      skip: async (reason) => {
        try { await saveResult({ profile: p, test, assetId: unit.id, status: 'skipped', detail: buildResultDetail({ test, outcome: { status: 'skipped', detail: reason || 'Skipped.' } }) }); } catch (error) { toast(`Could not record the skip: ${error?.message || error}`, { type: 'warn' }); }
        if (!advanceQueue()) openDevice(p.id);
      },
      saveLearned: map => store.saveMidiMap(unit.id, p.id, map),
    };
    if (d.runner === 'midi') { try { ctx.learned = await store.getMidiMap(unit.id); } catch { ctx.learned = null; } }
    if (!host.isConnected) return;
    const runner = { manual: runManual, driver: runDriver, software: runSoftware, timecode: runTimecode, midi: runMidi }[d.runner];
    st.runner = runner(host, ctx) || null;
    document.getElementById('main').scrollTop = 0;
    $('h1')?.focus();
  }

  function showRunResult(p, test, row) {
    const slot = $('#dev-run-result');
    if (!slot) return;
    const [s, word] = RESULT_CHIP[row.status] || ['info', row.status];
    const el = h('div', { class: `banner banner-result banner-result-${s}`, role: 'status' });
    el.innerHTML = `${chip(s, word, { size: 18 })}<div class="banner-text"><strong>Saved: ${esc(word)}</strong><span>${esc(row.detail?.summary || '')}</span></div>`;
    const bar = h('div', { class: 'banner-actions' });
    if (hasNext()) bar.append(h('button', { type: 'button', class: 'btn btn-primary btn-sm', id: 'dev-run-next', html: `<span>Next test</span>${icon('arrowRight', { size: 16 })}`, onclick: () => advanceQueue() }));
    else bar.append(h('button', { type: 'button', class: 'btn btn-primary btn-sm', id: 'dev-run-done', text: 'Back to device', onclick: () => { st.queue = null; openDevice(p.id); } }));
    bar.append(h('button', { type: 'button', class: 'btn btn-secondary btn-sm', html: `${icon('refresh', { size: 16 })}<span>Run again</span>`, onclick: () => runTest(p, test, { fromQueue: !!st.queue }) }));
    el.append(bar);
    slot.replaceChildren(el);
    $('#dev-run-actions')?.replaceChildren();
    announce(`Result saved: ${word}. ${row.detail?.summary || ''}`);
  }

  function exportPdf(p, button) {
    const unit = unitFor(p);
    if (!unit) { toast('Add a unit first.', { type: 'warn' }); return; }
    const args = { profile: p, asset: unit, results: resultsFor(unit.id) };
    return exportPdfWithFeedback('device', args, { button, htmlFallback: () => download(`deckchek-device-${slug(p.model)}-${slug(unit.nickname)}.html`, buildDeviceReportHtml(args), 'text/html') });
  }

  function exportReport(p) {
    const unit = unitFor(p);
    if (!unit) { toast('Add a unit first.', { type: 'warn' }); return; }
    const html = buildDeviceReportHtml({ profile: p, asset: unit, results: resultsFor(unit.id) });
    download(`deckchek-device-${slug(p.model)}-${slug(unit.nickname)}.html`, html, 'text/html');
    toast('Device report exported.', { type: 'success', timeout: 3000 });
  }

  // ---------- events ----------
  onFeatureChange(({ name }) => { if (name === 'pdfExport') for (const b of section.querySelectorAll('#dev-export-pdf')) b.hidden = !pdfExportEnabled(); });
  on('devices', () => { if (st.view !== 'run' && !section.hidden) render(); });
  on('device-results', () => { if (st.view === 'grid' && !section.hidden) renderGrid(); });
  on('catalog', async () => { await refreshUnits(); if (st.view !== 'run' && !section.hidden) render(); });

  if (lib.ready) render(); else renderGrid();
  ensureLibrary();

  return {
    onShow: () => { if (st.view !== 'run') { refreshUnits().then(() => { if (st.view !== 'run') render(); }); } showGuide(); },
    onHide: () => {},
    onEscape: () => {
      if (st.view === 'run') { st.queue = null; openDevice(st.profileId); return true; }
      if (st.view === 'detail') { st.view = 'grid'; render(); return true; }
      return false;
    },
    onExport: () => { const p = profileById(st.profileId); if (st.view !== 'grid' && p) exportReport(p); else toast('Open a device, then Ctrl+E exports its report.'); },
  };
}

function showGuide() {
  const body = h('div', { class: 'inspect' });
  body.innerHTML = `<p>Every device in your library has a test plan built from its researched profile. Results are saved per unit, so you can track each deck or mixer separately.</p>
    <h3>Statuses</h3><dl class="kv"><dt>${statusChip('pass', { size: 12 })}</dt><dd>Met the pass criterion</dd><dt>${statusChip('fail', { size: 12 })}</dt><dd>Failed the criterion or a problem was found</dd><dt>${statusChip('unknown', { size: 12 })}</dt><dd>Needs your judgement</dd><dt>${statusChip(null, { size: 12 })}</dt><dd>Not run on this unit yet</dd></dl>
    <h3>Unverified specs</h3><p>Some profile values could not be confirmed against manufacturer documents. They are marked UNVERIFIED and results that depend on them are indicative only.</p>
    <p class="muted small">Select a test to see its steps, pass criterion and history here.</p>`;
  document.getElementById('inspector-title').textContent = 'Devices guide';
  document.getElementById('inspector-body').replaceChildren(body);
}
