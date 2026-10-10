// Vinyl Scan screen, Control vinyl part (FS-13 wear map). Setup -> Capture -> Result for one side of a
// control-vinyl copy: the circular groove heat-map and the linear timeline fill in live, the result leads with
// the keep / watch / use other side / replace recommendation, compares with the previous scan of the same side
// and keeps every bin reachable by keyboard with its raw numbers in the details panel.
// Numbers come from app/wear-map.js; scan plumbing and view models from ui/workflows/wearmap.js; drawing
// from ui/plots-groove.js. Flag: features.wearMap. Browser mode scans a recording; live capture needs the app.

import { h, esc, isNative, isTyping, formatDate } from '../dom.js';
import { icon, chip } from '../icons.js';
import { pdfButton, wearMapPrintData } from '../workflows/m6-reports.js';
import { announce, toast } from '../live.js';
import { confirmDialog, showInspector, setInspector, setCaptureStatus } from '../shell.js';
import { settings, store, on } from '../state.js';
import { decodeAudioFile, startStreamSession, liveAvailable, classifyCaptureError } from '../audio-io.js';
import { runWithCapture } from '../capture-busy.js';
import { binsToArcs, binLabel, formatTime, classifyBin, METRICS, WEAR_DEFAULTS, DEFAULT_GEOMETRY, VERDICT_LABELS } from '../../wear-map.js';
import { findFormat } from '../../timecode.js';
import { takeHandoff } from '../crosslinks.js';
import { benchmarkVerdict, createStylusApi } from '../../stylus-wear.js';
import { grooveMapSvg, timelineSvg, legendGradient, METRIC_INFO } from '../plots-groove.js';
import {
  createRecordsApi, createWearMapApi, scanFormats, defaultSides, sideLength, copyName, scanAudio, startLiveScan, progressModel,
  verdictContext, finishScan, scanView, drawGeometry, drawTurns, compareModel, recommendation, binDetails, listStylusAssets,
  saveDraft, loadDraft, clearDraft, loadPrefs, savePrefs,
} from '../workflows/wearmap.js';

const METRIC_LABEL = { snr: 'SNR', phase: 'Phase error', dropouts: 'Dropouts' };
const TONE_CHIP = { pass: 'pass', warn: 'warn', fail: 'fail', review: 'review' };
const CHECKLIST = [
  'Clean the record and the stylus first.',
  'Use the same stylus for every scan you want to compare.',
  'Select the matching timecode format and set the phono/line switch to phono.',
  'Drop the needle at the very start of the side and let it play to the run-out.',
];
const parseTime = text => {
  const m = String(text || '').trim().match(/^(\d{1,3})(?::([0-5]?\d))?$/);
  return m ? Number(m[1]) * (m[2] === undefined ? 1 : 60) + (m[2] === undefined ? 0 : Number(m[2])) : null;
};
const theme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
const pctText = v => (Number.isFinite(v) ? `${v >= 10 || v === 0 ? Math.round(v) : v.toFixed(1)} %` : '—');
const friendly = e => (typeof e === 'string' ? e : e?.message || 'Something went wrong.');
const safeStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function createVinylScanScreen(section, { records = createRecordsApi(), api = createWearMapApi(), stylusApi = null } = {}) {
  const storage = safeStorage();
  const prefs = loadPrefs(storage);
  const st = {
    view: 'loading', copies: [], copyId: null, sideId: null, scans: [], details: new Map(),
    form: null, formError: '', source: liveAvailable() ? 'live' : 'file', file: null, fileError: '',
    setup: { format: null, binSec: WEAR_DEFAULTS.binSec, sideText: '', stylusId: '', cleaned: false },
    stylus: [], run: null, live: null, current: null, prev: null, compare: null, compareOn: false,
    metric: METRICS.includes(prefs.metric) ? prefs.metric : 'snr', showTable: Boolean(prefs.showTable), selected: null, draft: null, error: null, saveError: null,
  };
  let uid = 0;
  const nextId = () => `wm${++uid}`;

  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('vinyl', { size: 24 })}</span><div><h1 tabindex="-1">Control vinyl wear map</h1>
      <p class="lede">Play a whole side of your control vinyl while DeckChek listens. It maps timecode quality around the groove, compares with earlier scans and tells you whether to keep the side, flip the record or replace it.</p></div></div>
      <div class="wm-pickers" id="wm-pickers"></div></header>
    <div id="wm-status" class="wm-status" aria-live="polite"></div>
    <div id="wm-body" class="wm-body"></div>`;
  const q = s => section.querySelector(s);
  const body = q('#wm-body'), status = q('#wm-status'), pickers = q('#wm-pickers');
  q('.screen-head').append(pdfButton(h, { id: 'wm-export-pdf', kind: 'wearMap', icon: icon('download', { size: 18 }),
    getData: () => wearMapPrintData(st.current, { copyTitle: st.copies.find(c => c.id === st.copyId)?.title || '' }) }));

  // ------------------------------------------------------------------ data
  const copy = () => st.copies.find(c => c.id === st.copyId) || null;
  const side = () => copy()?.sides.find(s => s.id === st.sideId) || null;
  const scansOfSide = id => st.scans.filter(s => s.recordSideId === id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  async function loadCopies() {
    st.error = null;
    try {
      st.copies = (await records.list()).filter(c => !c.retired);
      if (!st.copies.some(c => c.id === st.copyId)) st.copyId = st.copies[0]?.id ?? null;
      const c = copy();
      if (c && !c.sides.some(s => s.id === st.sideId)) st.sideId = c.sides[0]?.id ?? null;
      await loadScans();
    } catch (e) { st.error = friendly(e); st.copies = []; }
  }
  async function loadScans() {
    const c = copy();
    if (!c) { st.scans = []; return; }
    const lists = await Promise.all(c.sides.map(s => api.list({ recordSideId: s.id }).catch(() => [])));
    st.scans = lists.flat();
  }
  async function detail(id) {
    if (st.details.has(id)) return st.details.get(id);
    const d = await api.get(id);
    const v = d ? scanView(d, { metric: st.metric }) : null;
    if (v) st.details.set(id, v);
    return v;
  }
  async function loadStylus() {
    if (!isNative()) return;
    try { st.stylus = await listStylusAssets(store); } catch { st.stylus = []; }
  }
  async function stylusRed(assetId) {
    if (!assetId) return false;
    try { const a = stylusApi || createStylusApi(); return a.native ? benchmarkVerdict(await a.benchmarkList(assetId)).alerts.length > 0 : false; } catch { return false; }
  }

  async function load() {
    if (st.run) { render(); return; }
    st.view = 'loading'; render();
    await Promise.all([loadCopies(), loadStylus()]);
    st.draft = loadDraft(storage);
    st.view = st.error ? 'error' : st.copies.length ? (st.current ? 'result' : 'setup') : 'empty';
    resetSetup();
    render();
  }

  function resetSetup() {
    const c = copy(), s = side();
    const fmt = findFormat(c?.format || '') || scanFormats()[0];
    st.setup.format = fmt?.name ?? null;
    const len = s ? sideLength(s, fmt) : null;
    st.setup.sideText = Number.isFinite(len) ? formatTime(len) : '';
  }

  // ------------------------------------------------------------------ status line
  function setStatus(text, kind = 'info', actions = []) {
    status.replaceChildren();
    if (!text) return;
    status.append(h('div', { class: `banner banner-${kind === 'error' ? 'fail' : kind === 'warn' ? 'warn' : 'info'} wm-banner`, role: kind === 'error' ? 'alert' : null },
      h('span', { class: 'wm-banner-icon', html: icon(kind === 'error' ? 'fail' : kind === 'warn' ? 'warn' : 'info', { size: 20 }) }),
      h('span', { class: 'banner-text', text }), actions.length ? h('div', { class: 'banner-actions' }, ...actions) : null));
    if (kind === 'error') announce(text, { assertive: true });
  }
  function draftBanner() {
    const d = st.draft;
    if (!d || st.run) return;
    const c = st.copies.find(x => x.sides.some(s => s.id === d.recordSideId));
    const s = c?.sides.find(x => x.id === d.recordSideId);
    if (!s) { clearDraft(storage); st.draft = null; return; }
    const at = new Date(d.savedAt);
    setStatus(`An unsaved scan of ${copyName(c)}, side ${s.sideLabel} was recovered (${formatTime(d.result.elapsedSec)} captured at ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}).`, 'warn', [
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', id: 'wm-draft-save', text: 'Save partial scan', onclick: () => saveDraftScan(c, s, d) }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'wm-draft-discard', text: 'Discard', onclick: () => { clearDraft(storage); st.draft = null; setStatus(''); } }),
    ]);
  }

  // ------------------------------------------------------------------ pickers (copy + side)
  function renderPickers() {
    pickers.replaceChildren();
    const c = copy();
    if (!st.copies.length || st.view === 'form') return;
    const busy = Boolean(st.run);
    const sel = h('select', { id: 'wm-copy', disabled: busy, onchange: async e => { st.copyId = e.target.value; st.sideId = copy()?.sides[0]?.id ?? null; st.current = null; st.compareOn = false; st.details.clear(); await loadScans(); resetSetup(); st.view = 'setup'; render(); } },
      ...st.copies.map(x => h('option', { value: x.id, text: copyName(x), selected: x.id === st.copyId ? true : null })));
    const sides = h('div', { class: 'segmented wm-sides', role: 'radiogroup' },
      ...(c?.sides || []).map(s => h('button', {
        type: 'button', class: 'seg', role: 'radio', 'aria-checked': String(s.id === st.sideId), tabindex: s.id === st.sideId ? '0' : '-1', disabled: busy, 'data-side': s.sideLabel,
        text: `Side ${s.sideLabel}`, onclick: () => selectSide(s.id),
        onkeydown: e => {
          const list = c.sides, i = list.findIndex(x => x.id === st.sideId);
          const k = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
          if (!k) return;
          e.preventDefault(); selectSide(list[(i + k + list.length) % list.length].id, { focus: true });
        },
      })));
    pickers.append(
      h('div', { class: 'field wm-copy-field' }, h('label', { class: 'field-label', for: 'wm-copy', text: 'Record' }), sel),
      h('div', { class: 'field' }, h('span', { class: 'field-label', id: 'wm-side-label', text: 'Side' }), sides),
      h('div', { class: 'wm-picker-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon', id: 'wm-edit-copy', 'aria-label': 'Edit this record', 'data-tooltip': 'Edit record', disabled: busy, html: icon('edit', { size: 18 }), onclick: () => openForm(c) }),
        h('button', { type: 'button', class: 'btn btn-secondary', id: 'wm-add-copy', disabled: busy, html: `${icon('plus', { size: 16 })}<span>Add record</span>`, onclick: () => openForm(null) })));
    sides.setAttribute('aria-labelledby', 'wm-side-label');
  }
  async function selectSide(id, { focus = false } = {}) {
    if (st.run) return;
    st.sideId = id; st.current = null; st.prev = null; st.compare = null; st.compareOn = false; st.selected = null;
    resetSetup();
    const latest = scansOfSide(id)[0];
    if (latest) await openScan(latest.id, { quiet: true });
    else { st.view = 'setup'; render(); }
    if (focus) pickers.querySelector('.wm-sides [aria-checked="true"]')?.focus();
  }

  // ------------------------------------------------------------------ render
  function render() {
    renderPickers();
    body.replaceChildren();
    body.dataset.view = st.view;
    if (st.view !== 'result' && st.view !== 'capture') showInspector({ title: 'Wear map', body: aboutPanel(), open: false });
    ({ loading: () => body.append(h('p', { class: 'muted wm-loading', text: 'Loading control vinyl…' })), error: renderError, empty: renderEmpty, form: renderForm, setup: renderSetup, capture: renderCapture, result: renderResult })[st.view]?.();
    if (st.view === 'setup' || st.view === 'result') draftBanner();
  }

  function aboutPanel() {
    return h('div', { class: 'wm-inspect' },
      h('p', { text: 'Each bin is a stretch of the side (2 s by default). DeckChek reads the timecode carrier in it and classes it:' }),
      h('table', { class: 'mini wm-inspect-table' }, h('tbody', {},
        h('tr', {}, h('th', { scope: 'row', html: chip('pass', 'Good', { size: 12 }) }), h('td', { text: 'SNR ≥ 25 dB, phase error ≤ 10°, no dropouts' })),
        h('tr', {}, h('th', { scope: 'row', html: chip('warn', 'Degraded', { size: 12 }) }), h('td', { text: 'SNR 15–25 dB, phase error 10–25° or 1 dropout' })),
        h('tr', {}, h('th', { scope: 'row', html: chip('fail', 'Bad', { size: 12 }) }), h('td', { text: 'SNR < 15 dB, phase error > 25° or 2+ dropouts' })),
        h('tr', {}, h('th', { scope: 'row', html: chip('info', 'Interrupted', { size: 12 }) }), h('td', { text: 'Paused, needle lifted or skipped, speed changed: not counted' })))),
      h('p', { class: 'field-help', text: 'Thresholds are starting values that still need calibrating against real lock loss in DJ software.' }));
  }

  function renderError() {
    body.append(h('div', { class: 'banner banner-fail', role: 'alert' }, h('span', { class: 'banner-text', text: `Could not load control vinyl: ${st.error}` }),
      h('div', { class: 'banner-actions' }, h('button', { type: 'button', class: 'btn btn-secondary', text: 'Try again', onclick: load }))));
  }

  function renderEmpty() {
    body.append(h('div', { class: 'empty card wm-empty', id: 'wm-empty' },
      h('span', { class: 'empty-icon', html: icon('vinyl', { size: 40 }) }),
      h('h2', { text: 'No control vinyl registered' }),
      h('p', { text: 'Add the control vinyl you play (for example a Serato CV02.5 or Traktor MK2 record) to scan its sides and track wear over time.' }),
      h('button', { type: 'button', class: 'btn btn-primary', id: 'wm-add-first', html: `${icon('plus', { size: 16 })}<span>Add control vinyl</span>`, onclick: () => openForm(null) }),
      !liveAvailable() ? h('p', { class: 'field-help', text: 'Browser preview: records and scans are kept in this browser only, and scans come from recordings of a side.' }) : null));
  }

  // ----- add / edit record
  function openForm(c) {
    const fmt = findFormat(c?.format || '') || scanFormats()[0];
    st.form = c ? { id: c.id, title: c.title, format: c.format, nickname: c.nickname || '', sides: c.sides.map(s => ({ ...s })) }
      : { id: null, title: fmt.name, format: fmt.name, nickname: '', sides: defaultSides(fmt), titleTouched: false };
    st.formError = ''; st.formReturn = st.view; st.view = 'form'; render();
    q('#wm-f-title')?.focus();
  }
  function renderForm() {
    const f = st.form, editing = Boolean(f.id);
    const err = h('p', { class: 'form-error', id: 'wm-f-error', role: 'alert', text: st.formError });
    const fmtSel = h('select', { id: 'wm-f-format', name: 'format' }, ...scanFormats().map(x => h('option', { value: x.name, text: `${x.name} (${x.carrierHz} Hz)`, selected: x.name === f.format ? true : null })));
    const sidesBox = h('div', { class: 'wm-f-sides' });
    const drawSides = () => {
      sidesBox.replaceChildren(h('div', { class: 'wm-f-side-head', 'aria-hidden': 'true' }, h('span', { text: 'Side' }), h('span', { text: 'Length (m:ss)' }), h('span', { text: 'Speed' })),
        ...f.sides.map((s, i) => h('div', { class: 'wm-f-side', 'data-i': String(i) },
          h('input', { type: 'text', name: 'sideLabel', value: s.sideLabel, 'aria-label': `Side ${i + 1} label`, maxlength: '16' }),
          h('input', { type: 'text', name: 'length', value: Number.isFinite(s.expectedDurationSec) ? formatTime(s.expectedDurationSec) : '', placeholder: 'unknown', 'aria-label': `Side ${i + 1} length in minutes and seconds`, inputmode: 'numeric' }),
          h('select', { name: 'rpm', 'aria-label': `Side ${i + 1} speed` }, h('option', { value: '33.333333', text: '33⅓ rpm', selected: Math.abs((s.nominalRpm || 33.333333) - 33.333333) < 0.01 ? true : null }), h('option', { value: '45', text: '45 rpm', selected: Math.abs((s.nominalRpm || 0) - 45) < 0.01 ? true : null })))));
    };
    drawSides();
    fmtSel.addEventListener('change', () => {
      const fmt = findFormat(fmtSel.value);
      if (!editing) { f.sides = defaultSides(fmt); drawSides(); }
      const title = form.querySelector('#wm-f-title');
      if (!f.titleTouched && !editing) title.value = fmt.name;
      f.format = fmt.name;
    });
    const form = h('form', { class: 'card wm-form', id: 'wm-form', novalidate: true },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title', text: editing ? 'Edit control vinyl' : 'Add control vinyl' })),
      h('div', { class: 'field-grid' },
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'wm-f-format', text: 'Timecode format' }), fmtSel, h('span', { class: 'field-help', text: 'Side lengths are filled in from the format’s code length; change them if your pressing differs.' })),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'wm-f-title', text: 'Name' }), h('input', { type: 'text', id: 'wm-f-title', name: 'title', value: f.title, maxlength: '120', required: true, oninput: () => { f.titleTouched = true; } })),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'wm-f-nick', text: 'Nickname (optional)' }), h('input', { type: 'text', id: 'wm-f-nick', name: 'nickname', value: f.nickname, maxlength: '120', placeholder: 'e.g. Deck 1, blue sleeve' }))),
      h('fieldset', { class: 'wm-fieldset' }, h('legend', { class: 'field-label', text: 'Sides' }), sidesBox,
        editing ? h('p', { class: 'field-help', text: 'Sides with scans cannot be removed.' }) : null),
      err,
      h('div', { class: 'form-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', id: 'wm-f-cancel', text: 'Cancel', onclick: closeForm }),
        h('button', { type: 'submit', class: 'btn btn-primary', id: 'wm-f-save', text: editing ? 'Save changes' : 'Add record' })));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      try {
      const sides = [...form.querySelectorAll('.wm-f-side')].map((row, i) => {
        const len = row.querySelector('[name=length]').value.trim();
        const sec = len ? parseTime(len) : null;
        if (len && !Number.isFinite(sec)) throw Object.assign(new Error(`Side ${i + 1}: write the length as minutes:seconds, e.g. 11:52.`), { field: row.querySelector('[name=length]') });
        return { id: f.sides[i].id ?? null, sideLabel: row.querySelector('[name=sideLabel]').value, nominalRpm: Number(row.querySelector('[name=rpm]').value), expectedDurationSec: sec };
      });
        const saved = await records.save({ id: f.id, title: form.querySelector('#wm-f-title').value, format: fmtSel.value, nickname: form.querySelector('#wm-f-nick').value, cleaningState: copy()?.cleaningState ?? null, retired: false, sides });
        st.form = null; st.copyId = saved.id; st.sideId = saved.sides.find(s => s.id === st.sideId)?.id ?? saved.sides[0]?.id ?? null;
        await loadCopies(); resetSetup();
        st.view = st.current && st.formReturn === 'result' ? 'result' : 'setup';
        render();
        toast(editing ? 'Record updated.' : `${copyName(saved)} added.`, { type: 'success', timeout: 3000 });
        section.querySelector('h1')?.focus();
      } catch (error) {
        st.formError = friendly(error); err.textContent = st.formError;
        (error.field || form.querySelector('#wm-f-title'))?.focus();
      }
    });
    body.append(form);
  }
  function closeForm() { st.form = null; st.view = st.copies.length ? (st.formReturn === 'result' && st.current ? 'result' : 'setup') : 'empty'; render(); section.querySelector('h1')?.focus(); }

  // ----- setup
  function historyCard() {
    const c = copy(), s = side();
    const list = s ? scansOfSide(s.id) : [];
    const card = h('section', { class: 'card wm-history', 'aria-labelledby': 'wm-hist-title' }, h('h2', { class: 'card-title', id: 'wm-hist-title', text: `History · side ${s?.sideLabel ?? ''}` }));
    if (!list.length) card.append(h('p', { class: 'muted', text: 'No scans of this side yet. The first scan becomes the reference for later comparisons.' }));
    else {
      card.append(h('ul', { class: 'wm-hist-list', role: 'list' }, ...list.map(sc => {
        const tone = recommendation({ verdict: sc.verdict, coverage: sc.coverage }).tone;
        const cur = st.current?.id === sc.id;
        return h('li', {}, h('button', { type: 'button', class: `wm-hist-item${cur ? ' is-current' : ''}`, 'aria-current': cur ? 'true' : null, 'data-scan': sc.id, onclick: () => openScan(sc.id) },
          h('span', { class: 'wm-hist-chip', html: chip(TONE_CHIP[tone], VERDICT_LABELS[sc.verdict] || sc.verdict, { size: 14 }) }),
          h('span', { class: 'wm-hist-main' }, h('strong', { class: 'num', text: formatDate(sc.createdAt) }),
            h('span', { class: 'muted small num', text: `${Math.round((sc.coverage || 0) * 100)} % of side · ${pctText(sc.summary?.badPct)} bad${sc.summary?.cleaned ? ' · cleaned' : ''}` })),
          h('span', { class: 'wm-hist-go', html: icon('chevronRight', { size: 16 }) })));
      })));
    }
    const others = (c?.sides || []).filter(x => x.id !== s?.id);
    if (others.length) {
      card.append(h('h3', { class: 'wm-sub', text: 'Other sides' }), h('ul', { class: 'wm-other-list', role: 'list' }, ...others.map(o => {
        const latest = scansOfSide(o.id)[0];
        const tone = latest ? recommendation({ verdict: latest.verdict, coverage: latest.coverage }).tone : null;
        return h('li', { class: 'wm-other' }, h('span', { text: `Side ${o.sideLabel}` }),
          latest ? h('span', { html: chip(TONE_CHIP[tone], VERDICT_LABELS[latest.verdict], { size: 14 }) }) : h('span', { class: 'muted small', text: 'not scanned' }),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: latest ? 'Open' : 'Scan', onclick: () => selectSide(o.id) }));
      })));
    }
    return card;
  }

  function renderSetup() {
    const c = copy(), s = side();
    if (!c || !s) { renderEmpty(); return; }
    const fmtSel = h('select', { id: 'wm-format', onchange: e => { st.setup.format = e.target.value; } }, ...scanFormats().map(x => h('option', { value: x.name, text: `${x.name} (${x.carrierHz} Hz)`, selected: x.name === st.setup.format ? true : null })));
    const binSel = h('select', { id: 'wm-bin', onchange: e => { st.setup.binSec = Number(e.target.value); } }, ...[1, 2, 3, 4, 5].map(v => h('option', { value: String(v), text: `${v} s${v === 2 ? ' (default)' : ''}`, selected: v === st.setup.binSec ? true : null })));
    const lenIn = h('input', { type: 'text', id: 'wm-length', value: st.setup.sideText, placeholder: 'unknown', inputmode: 'numeric', 'aria-describedby': 'wm-length-help', oninput: e => { st.setup.sideText = e.target.value; } });
    const stylusSel = st.stylus.length ? h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'wm-stylus', text: 'Stylus (optional)' }),
      h('select', { id: 'wm-stylus', onchange: e => { st.setup.stylusId = e.target.value; } }, h('option', { value: '', text: 'Not recorded' }), ...st.stylus.map(a => h('option', { value: a.id, text: a.name, selected: a.id === st.setup.stylusId ? true : null }))),
      h('span', { class: 'field-help', text: 'If its latest benchmark shows wear, the verdict says so and never asks you to replace the record on this scan alone.' })) : null;
    const cleaned = h('label', { class: 'wm-check' }, h('input', { type: 'checkbox', id: 'wm-cleaned', checked: st.setup.cleaned ? true : null, onchange: e => { st.setup.cleaned = e.target.checked; } }), h('span', { text: 'Record and stylus were cleaned before this scan' }));

    const live = liveAvailable();
    const srcBtn = (id, title, text, ico, disabled) => h('button', {
      type: 'button', class: 'source', role: 'radio', id: `wm-src-${id}`, 'aria-checked': String(st.source === id), 'aria-disabled': disabled ? 'true' : null,
      onclick: () => { if (disabled) { toast('Live capture needs the DeckChek desktop app. Scan a recording instead.', { type: 'info', timeout: 4000 }); return; } st.source = id; render(); },
    }, h('span', { class: 'source-icon', html: icon(ico, { size: 22 }) }), h('span', { class: 'source-text' }, h('strong', { text: title }), h('span', { text })), disabled ? h('span', { class: 'badge', text: 'Desktop app' }) : null);
    const drop = h('div', { class: `drop${st.file ? ' has-file' : ''}`, id: 'wm-drop' },
      h('input', { type: 'file', class: 'drop-input', id: 'wm-file', accept: '.wav,.wave,.flac,.mp3,.aif,.aiff,audio/*', 'aria-describedby': 'wm-file-help', onchange: e => { st.file = e.target.files?.[0] || null; st.fileError = ''; render(); q('#wm-file')?.focus(); } }),
      h('label', { class: 'drop-label', for: 'wm-file' }, h('span', { html: icon(st.file ? 'check' : 'upload', { size: 28 }) }),
        h('span', { class: 'drop-title', text: st.file ? st.file.name : 'Choose a recording of the side' }),
        h('span', { id: 'wm-file-help', text: st.file ? `${(st.file.size / 1048576).toFixed(1)} MB · press Start scan` : 'Stereo WAV, FLAC or MP3 of the whole side, recorded from the needle drop.' })));

    body.append(h('div', { class: 'wm-setup' },
      h('div', { class: 'wm-setup-main' },
        h('section', { class: 'card', 'aria-labelledby': 'wm-setup-title' },
          h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'wm-setup-title', text: `Scan side ${s.sideLabel} of ${copyName(c)}` }),
            c.cleaningState ? h('span', { class: 'muted small', text: `Copy: ${c.cleaningState}` }) : null),
          h('div', { class: 'field-grid' },
            h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'wm-format', text: 'Timecode format' }), fmtSel),
            h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'wm-length', text: 'Side length (m:ss)' }), lenIn, h('span', { class: 'field-help', id: 'wm-length-help', text: 'From the format’s code length; leave empty if unknown.' })),
            h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'wm-bin', text: 'Bin size' }), binSel, h('span', { class: 'field-help', text: 'One map segment per bin. Shorter bins locate damage more precisely.' })),
            stylusSel),
          cleaned),
        h('section', { class: 'card', 'aria-labelledby': 'wm-src-title' },
          h('h2', { class: 'card-title', id: 'wm-src-title', text: 'Source' }),
          h('div', { class: 'source-choices', role: 'radiogroup', 'aria-labelledby': 'wm-src-title' },
            srcBtn('live', 'Live input', live ? `Play the side now · ${settings.deviceName || 'default input'}` : 'Needs the desktop app', 'mic', !live),
            srcBtn('file', 'Recording', 'Scan a recording of the whole side', 'file', false)),
          st.source === 'file' ? drop : h('p', { class: 'hint' }, h('span', { html: icon('info', { size: 16 }) }), h('span', { text: 'Start the scan, then drop the needle at the start of the side. A long scan is saved every 30 s, so nothing is lost if the app closes.' })),
          st.fileError ? h('p', { class: 'form-error', role: 'alert', text: st.fileError }) : null,
          h('div', { class: 'step-footer' }, h('span', { class: 'muted small', html: 'Press <kbd>Space</kbd> to start' }),
            h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'wm-start', 'data-space-ok': '1', disabled: st.source === 'file' && !st.file ? true : null, html: `${icon(st.source === 'live' ? 'record' : 'play', { size: 18 })}<span>Start scan</span>`, onclick: start })))),
      h('div', { class: 'wm-setup-side' },
        h('section', { class: 'card card-quiet', 'aria-labelledby': 'wm-check-title' }, h('h2', { class: 'card-title', id: 'wm-check-title', text: 'Before you scan' }),
          h('ul', { class: 'checklist' }, ...CHECKLIST.map(t => h('li', {}, h('span', { html: icon('check', { size: 16 }) }), h('span', { text: t }))))),
        historyCard())));
  }

  // ----- capture
  function startSetupValues() {
    const fmt = findFormat(st.setup.format);
    const raw = st.setup.sideText.trim();
    const sideSec = raw ? parseTime(raw) : null;
    if (raw && !Number.isFinite(sideSec)) throw new Error('Write the side length as minutes:seconds, e.g. 11:52, or leave it empty.');
    return { fmt, sideSec, binSec: st.setup.binSec, nominalRpm: side()?.nominalRpm || 33.333333 };
  }

  async function start() {
    if (st.run || st.view !== 'setup') return;
    let cfg;
    try { cfg = startSetupValues(); } catch (e) { setStatus(friendly(e), 'error'); q('#wm-length')?.focus(); return; }
    const c = copy(), s = side();
    st.live = { copy: c, side: s, ...cfg, bins: [], elapsedSec: 0, startedAt: Date.now(), source: st.source, totalSec: null };
    st.selected = null;
    const onBin = (bin, { updated }) => {
      if (!st.live) return;
      const b = { ...bin, reasons: [...(bin.reasons || [])] };
      if (updated) { const k = st.live.bins.findIndex(x => x.idx === b.idx); if (k >= 0) st.live.bins[k] = b; }
      else st.live.bins.push(b);
      scheduleCapture();
    };
    const onProgress = p => { if (!st.live) return; st.live.elapsedSec = p.elapsedSec; if (p.totalSec) st.live.totalSec = p.totalSec; scheduleCapture(); };
    const onAutosave = snapshot => saveDraft(storage, { recordSideId: s.id, format: cfg.fmt.name, binSec: cfg.binSec, sideSec: cfg.sideSec, result: snapshot });
    setStatus('');
    if (st.source === 'file') {
      if (!st.file) { st.fileError = 'Choose a recording first.'; render(); return; }
      let audio;
      try { audio = await decodeAudioFile(st.file); } catch (e) { st.fileError = friendly(e); render(); return; }
      const ctrl = new AbortController();
      st.run = { kind: 'file', ctrl };
      st.live.totalSec = audio.left.length / audio.sampleRate;
      st.view = 'capture'; render(); q('#wm-stop')?.focus();
      announce(`Scanning ${st.file.name}.`);
      try {
        const { result, cancelled } = await scanAudio(audio, { format: cfg.fmt, binSec: cfg.binSec, nominalRpm: cfg.nominalRpm, onBin, onProgress, signal: ctrl.signal });
        if (st.run?.discard) { endRun(); return; }
        endRun();
        st.file = null;
        await finish(result, { partialNote: cancelled });
      } catch (e) { endRun(); st.view = 'setup'; render(); setStatus(`Scan failed: ${friendly(e)}`, 'error'); }
      return;
    }
    // live
    st.run = { kind: 'live', starting: true };
    st.view = 'capture'; render();
    try {
      const session = await startLiveScan({
        startStreamSession: o => runWithCapture(() => startStreamSession(o), { action: 'start the wear-map scan' }),
        deviceName: settings.deviceName || null, sampleRate: Number(settings.sampleRate) || null,
        format: cfg.fmt, binSec: cfg.binSec, nominalRpm: cfg.nominalRpm, onBin, onProgress, onAutosave,
        onEnd: ev => { if (ev.reason !== 'stopped' && st.run?.kind === 'live' && !st.run.stopping) stop({ reason: ev.reason }); },
      });
      st.run = { kind: 'live', session };
      setCaptureStatus('Wear map: scanning', 'recording');
      render(); q('#wm-stop')?.focus();
      announce('Scanning. Drop the needle at the start of the side.');
    } catch (e) {
      st.run = null; st.live = null; st.view = 'setup'; render();
      if (e?.cancelled) return;
      const info = classifyCaptureError(e);
      setStatus(`${info.title}. ${info.message}`, 'error');
    }
  }

  let raf = 0;
  function scheduleCapture() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; if (st.view === 'capture') updateCapture(); });
  }
  function endRun() { st.run = null; setCaptureStatus('Idle'); }

  async function stop({ reason = 'stopped' } = {}) {
    if (!st.run || st.run.stopping) return;
    if (st.run.kind === 'file') { st.run.ctrl.abort(); return; }
    if (st.run.starting) return;
    st.run.stopping = true;
    let result = null;
    try { result = await st.run.session.stop(); } catch (e) { result = st.run.session.snapshot?.() ?? null; setStatus(`Capture ended with an error: ${friendly(e)}`, 'warn'); }
    const err = st.run.session.error;
    endRun();
    if (reason === 'preempted') toast('Another check took over the audio input, so the scan stopped. The part scanned so far is kept.', { type: 'warn', timeout: 7000 });
    else if (reason === 'deviceLost') toast('The audio input disconnected, so the scan stopped. The part scanned so far is kept.', { type: 'warn', timeout: 7000 });
    if (err) setStatus(`Some audio could not be analysed: ${friendly(err)}`, 'warn');
    await finish(result, { partialNote: reason !== 'stopped' });
  }
  async function cancel() {
    if (!st.run) return;
    const run = st.run;
    if (run.kind === 'file') { run.discard = true; run.ctrl.abort(); }
    else if (!run.starting) { run.stopping = true; try { await run.session.session.stop(); } catch { /* already stopped */ } endRun(); }
    else return;
    clearDraft(storage); st.draft = null; st.live = null;
    st.view = 'setup'; render();
    toast('Scan cancelled. Nothing was saved.', { type: 'info', timeout: 3500 });
    q('#wm-start')?.focus();
  }

  function captureLive() {
    const L = st.live;
    const durationSec = Math.max(L.sideSec || 0, L.totalSec || 0, L.elapsedSec || 0, 30);
    const geom = { ...DEFAULT_GEOMETRY, turns: drawTurns(durationSec, L.binSec), durationSec };
    const bins = L.bins.map(b => ({ ...b, cls: b.cls || classifyBin(b), title: binLabel(b, st.metric) }));
    return { geom, bins };
  }
  function renderCapture() {
    const L = st.live;
    const fileRun = L.source === 'file';
    body.append(h('div', { class: 'wm-capture' },
      h('section', { class: 'card wm-map-card', 'aria-labelledby': 'wm-cap-title' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'wm-cap-title', text: `Scanning side ${L.side.sideLabel} · ${L.fmt.name}` }), h('span', { class: 'wm-rec', html: `<span class="rec-dot" aria-hidden="true"></span>${fileRun ? 'Reading recording' : 'Listening'}` })),
        h('div', { class: 'wm-map wm-map-live', id: 'wm-live-map' })),
      h('section', { class: 'card wm-cap-side', 'aria-labelledby': 'wm-prog-title' },
        h('h2', { class: 'sr-only', id: 'wm-prog-title', text: 'Progress' }),
        h('div', { class: 'timer num', id: 'wm-timer' }),
        h('div', { class: 'progress', role: 'progressbar', id: 'wm-progress', 'aria-label': 'Share of the side scanned', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span', {})),
        h('dl', { class: 'wm-facts', id: 'wm-cap-facts' }),
        h('div', { class: 'wm-counts', id: 'wm-counts' }),
        h('div', { id: 'wm-cap-warn' }),
        h('div', { class: 'capture-buttons' },
          h('button', { type: 'button', class: 'btn btn-primary', id: 'wm-stop', 'data-space-ok': '1', html: `${icon('stop', { size: 18 })}<span>${fileRun ? 'Stop here' : 'Stop and save'}</span><kbd>Space</kbd>`, onclick: () => stop() }),
          h('button', { type: 'button', class: 'btn btn-ghost', id: 'wm-cancel', html: `<span>Cancel</span><kbd>Esc</kbd>`, onclick: cancel })),
        h('p', { class: 'field-help', text: fileRun ? 'Stopping keeps what was read so far as a partial scan.' : 'Stop at the run-out, or earlier for a partial scan. Pausing or lifting the needle marks those bins as interrupted; they never count against the record.' })),
      h('section', { class: 'card wm-tl-card' }, h('h2', { class: 'card-title', text: 'Timeline' }), h('div', { class: 'wm-tl', id: 'wm-live-tl' }))));
    updateCapture();
  }
  function updateCapture() {
    const L = st.live;
    if (!L) return;
    const { geom, bins } = captureLive();
    const sideSec = L.sideSec || L.totalSec || null;
    const p = progressModel({ elapsedSec: L.elapsedSec, sideSec, bins });
    const arcs = binsToArcs(bins, geom, st.metric).map((a, k) => ({ ...a, title: bins[k].title }));
    const mapEl = q('#wm-live-map'), tlEl = q('#wm-live-tl');
    if (mapEl) mapEl.innerHTML = grooveMapSvg(arcs, { geom, metric: st.metric, theme: theme(), headSec: L.elapsedSec, id: 'wmlive', skips: bins.flatMap(b => b.skips || []), label: { title: `Side ${L.side.sideLabel}`, sub: p.pct != null ? `${p.pct} %` : formatTime(L.elapsedSec), foot: L.fmt.name }, ariaLabel: `Live groove map, ${bins.length} bins scanned` });
    if (tlEl) tlEl.innerHTML = timelineSvg(bins, { metric: st.metric, theme: theme(), durationSec: geom.durationSec, headSec: L.elapsedSec, id: 'wmlivetl', skips: bins.flatMap(b => b.skips || []), ariaLabel: 'Live timeline' });
    const timer = q('#wm-timer');
    if (timer) timer.innerHTML = `${esc(p.elapsedText)}${p.sideText ? `<span class="timer-of"> / ${esc(p.sideText)}</span>` : ''}`;
    const bar = q('#wm-progress');
    if (bar) { bar.firstChild.style.width = `${p.pct ?? 0}%`; if (p.pct != null) { bar.setAttribute('aria-valuenow', String(p.pct)); bar.setAttribute('aria-valuetext', `${p.pct} % of the side by time`); } }
    const facts = q('#wm-cap-facts');
    if (facts) facts.replaceChildren(
      h('dt', { text: 'By time' }), h('dd', { class: 'num', text: p.pct != null ? `${p.pct} %` : 'side length unknown' }),
      h('dt', { text: 'Groove position' }), h('dd', { class: 'num', text: p.positionMm != null ? `${p.positionMm} mm from centre` : '—' }),
      h('dt', { text: 'Bins' }), h('dd', { class: 'num', text: String(p.bins) }),
      h('dt', { text: 'Latest SNR' }), h('dd', { class: 'num', text: p.lastSnrDb != null ? `${p.lastSnrDb} dB` : '—' }));
    const counts = q('#wm-counts');
    if (counts) counts.innerHTML = [['pass', 'Good', p.counts.good], ['warn', 'Degraded', p.counts.degraded], ['fail', 'Bad', p.counts.bad], ['info', 'Interrupted', p.counts.interrupted]]
      .map(([s, l, n]) => `<span class="wm-count">${chip(s, `${l} ${n}`, { size: 14 })}</span>`).join('');
    const lastBin = bins.at(-1);
    if (lastBin) showInspector({ title: `Latest bin · ${lastBin.idx}`, body: h('div', { class: 'wm-inspect' }, h('table', { class: 'mini wm-inspect-table' }, h('tbody', {}, ...binDetails(lastBin).map(([k, val]) => h('tr', {}, h('th', { scope: 'row', text: k }), h('td', { class: 'num', text: val })))))), open: false });
    const warn = q('#wm-cap-warn');
    if (warn) {
      const text = p.lockWarning ? 'No timecode lock on most of the side so far. Check the format selection and the phono/line switch.' : p.overrun ? 'Past the expected side length. Stop at the run-out.' : '';
      if (warn.dataset.text !== text) { warn.dataset.text = text; warn.replaceChildren(); if (text) { warn.append(h('div', { class: 'banner banner-warn', role: 'alert' }, h('span', { class: 'banner-text', text }))); } }
    }
  }

  // ----- finish and save
  async function finish(result, { partialNote = false } = {}) {
    const L = st.live;
    st.live = null;
    if (!result || !result.bins.length) {
      st.view = 'setup'; render();
      setStatus('Nothing was scanned: the capture ended before the first bin was complete.', 'warn');
      clearDraft(storage); return;
    }
    const s = L.side, c = L.copy;
    const ctx = verdictContext(st.scans, { sideId: s.id, sideIds: c.sides.map(x => x.id) });
    const red = await stylusRed(st.setup.stylusId);
    const fin = finishScan(result, { side: s, format: L.fmt, sideSec: L.sideSec, stylusAssetId: st.setup.stylusId || null, stylusRed: red, cleaned: st.setup.cleaned, context: ctx });
    st.view = 'result';
    st.saveError = null;
    let saved = null;
    try { saved = await api.save(fin.record); } catch (e) { st.saveError = friendly(e); }
    const rec = { ...fin.record, id: saved?.id ?? null, createdAt: saved?.createdAt ?? new Date().toISOString() };
    st.current = scanView({ record: rec, verdict: fin.verdict, result }, { metric: st.metric });
    st.pendingRecord = saved ? null : fin.record;
    if (saved) { clearDraft(storage); st.draft = null; st.details.set(saved.id, st.current); await loadScans(); }
    await pickPrev();
    render();
    if (st.saveError) setStatus(`The scan could not be saved: ${st.saveError}`, 'error', [h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'wm-retry-save', text: 'Try again', onclick: retrySave })]);
    else if (partialNote) setStatus(`Partial scan saved: ${Math.round((rec.coverage || 0) * 100)} % of the side.`, 'info');
    q('#wm-verdict')?.focus();
    announce(`${st.current.label}. ${st.current.message}`);
  }
  async function retrySave() {
    if (!st.pendingRecord) return;
    try {
      const saved = await api.save(st.pendingRecord);
      st.current = { ...st.current, id: saved.id, createdAt: saved.createdAt };
      st.pendingRecord = null; st.saveError = null; clearDraft(storage); st.draft = null;
      await loadScans(); setStatus('Scan saved.', 'info'); render();
    } catch (e) { setStatus(`The scan could not be saved: ${friendly(e)}`, 'error', [h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Try again', onclick: retrySave })]); }
  }
  async function saveDraftScan(c, s, d) {
    st.copyId = c.id; st.sideId = s.id;
    await loadScans();
    st.live = { copy: c, side: s, fmt: findFormat(d.format), sideSec: d.sideSec ?? null, binSec: d.binSec };
    await finish(d.result, { partialNote: true });
  }

  async function openScan(id, { quiet = false } = {}) {
    try {
      const v = await detail(id);
      if (!v) { setStatus('That scan no longer exists.', 'warn'); await loadScans(); render(); return; }
      st.current = v; st.selected = null; st.compareOn = false; st.compare = null;
      await pickPrev();
      st.view = 'result'; render();
      if (!quiet) q('#wm-verdict')?.focus();
    } catch (e) { setStatus(`Could not open the scan: ${friendly(e)}`, 'error'); }
  }
  async function pickPrev() {
    st.prev = null; st.compare = null;
    const cur = st.current;
    if (!cur) return;
    const sideScans = scansOfSide(st.sideId).filter(s => s.id !== cur.id && String(s.createdAt) < String(cur.createdAt ?? '9'));
    const prevMeta = sideScans.find(s => s.verdict !== 'incomplete') || sideScans[0];
    if (!prevMeta) return;
    try { st.prev = await detail(prevMeta.id); } catch { st.prev = null; }
    if (st.prev) { try { st.compare = compareModel(st.prev, cur); } catch { st.compare = null; } }
  }

  // ----- result
  function otherSidesState() {
    return (copy()?.sides || []).filter(s => s.id !== st.sideId).map(s => ({ sideLabel: s.sideLabel, id: s.id, latest: scansOfSide(s.id)[0] || null }));
  }
  function renderResult() {
    const v = st.current;
    if (!v) { st.view = 'setup'; renderSetup(); return; }
    const rec = recommendation(v, { otherSides: otherSidesState() });
    const others = otherSidesState();
    const flipSide = rec.flipTo ? others.find(o => o.sideLabel === rec.flipTo) : null;
    const scanSide = rec.scanOther ? others.find(o => o.sideLabel === rec.scanOther) : null;
    const date = v.createdAt ? formatDate(v.createdAt) : 'just now';
    const verdictEl = h('section', { class: `verdict verdict-${rec.tone} wm-verdict`, id: 'wm-verdict', tabindex: '-1', 'aria-labelledby': 'wm-verdict-head' },
      h('div', { class: 'verdict-main' },
        h('span', { class: 'verdict-chip', html: chip(TONE_CHIP[rec.tone], v.label, { size: 16 }) }),
        h('div', {},
          h('h2', { class: 'verdict-headline', id: 'wm-verdict-head', text: v.headline }),
          h('p', { class: 'verdict-action', id: 'wm-message', text: v.message.replace(v.headline, '').trim() }),
          h('p', { class: 'wm-reco', id: 'wm-reco' }, h('strong', { text: 'What to do: ' }), rec.action),
          h('p', { class: 'verdict-meta muted num', text: `Scanned ${date} · ${v.format} · ${v.binSec} s bins${v.cleaned ? ' · cleaned first' : ''}` }))),
      h('div', { class: 'verdict-side' },
        h('div', { class: 'score' }, h('span', { class: 'score-num num', text: Number.isFinite(v.score) ? String(Math.round(v.score)) : '—' }), h('span', { class: 'score-unit', text: '/100' })),
        h('span', { class: 'muted small num', text: v.coverageBasis === 'elapsed' ? 'side length unknown' : `${Math.round((v.coverage || 0) * 100)} % of side scanned` })),
      h('div', { class: 'verdict-note wm-actions' },
        flipSide ? h('button', { type: 'button', class: 'btn btn-primary', id: 'wm-flip', html: `${icon('refresh', { size: 16 })}<span>Open side ${esc(flipSide.sideLabel)}</span>`, onclick: () => selectSide(flipSide.id) }) : null,
        scanSide ? h('button', { type: 'button', class: 'btn btn-secondary', id: 'wm-scan-other', html: `${icon('record', { size: 16 })}<span>Scan side ${esc(scanSide.sideLabel)}</span>`, onclick: async () => { await selectSide(scanSide.id); st.view = 'setup'; render(); } }) : null,
        h('button', { type: 'button', class: 'btn btn-secondary', id: 'wm-rescan', html: `${icon('refresh', { size: 16 })}<span>${v.verdict === 'keep' ? 'Scan again' : 'Re-scan after cleaning'}</span>`, onclick: () => { st.setup.cleaned = v.verdict !== 'keep'; st.view = 'setup'; render(); q('#wm-start')?.focus(); } }),
        v.id ? h('button', { type: 'button', class: 'btn btn-ghost btn-danger-ghost', id: 'wm-delete', html: `${icon('trash', { size: 16 })}<span>Delete scan</span>`, onclick: deleteScan }) : null));

    const toolbar = h('div', { class: 'wm-toolbar' },
      h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Colour by (M)', id: 'wm-metric' }, ...METRICS.map(m => h('button', {
        type: 'button', class: 'seg', role: 'radio', 'aria-checked': String(st.metric === m), tabindex: st.metric === m ? '0' : '-1', 'data-metric': m, text: METRIC_LABEL[m],
        onclick: () => setMetric(m),
        onkeydown: e => { const i = METRICS.indexOf(st.metric), k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!k) return; e.preventDefault(); setMetric(METRICS[(i + k + METRICS.length) % METRICS.length]); q(`#wm-metric [data-metric="${st.metric}"]`)?.focus(); },
      }))),
      h('label', { class: `wm-switch${st.prev ? '' : ' is-disabled'}` },
        h('input', { type: 'checkbox', role: 'switch', id: 'wm-compare', checked: st.compareOn ? true : null, disabled: st.prev ? null : true, onchange: e => toggleCompare(e.target.checked) }),
        h('span', { text: st.prev ? `Compare with ${formatDate(st.prev.createdAt)}` : 'No earlier scan to compare' }), st.prev ? h('kbd', { text: 'C' }) : null),
      h('label', { class: 'wm-switch' }, h('input', { type: 'checkbox', role: 'switch', id: 'wm-table-toggle', checked: st.showTable ? true : null, onchange: e => { st.showTable = e.target.checked; savePrefs(storage, { metric: st.metric, showTable: st.showTable }); render(); } }), h('span', { text: 'Data table' })));

    const compareOn = st.compareOn && st.compare;
    const deltas = compareOn && st.compare.mode === 'bin' ? st.compare.deltas : null;
    const geom = drawGeometry(v);
    const arcs = binsToArcs(v.bins, geom, st.metric).map((a, k) => ({ ...a, title: `${binLabel(v.bins[k], st.metric)}${deltas?.get(a.idx)?.newBad ? ' (new bad bin)' : ` (${v.bins[k].cls})`}` }));
    const worst = v.worst.map(w => w.idx);
    const label = { title: `Side ${v.sideLabel ?? side()?.sideLabel ?? ''}`, sub: v.label, foot: v.format };
    const help = 'Arrow keys move bin by bin, Up and Down move one turn, Home and End jump to the ends, Enter opens the details.';
    const mapWrap = h('div', { class: 'wm-map', id: 'wm-map', tabindex: '0', role: 'group', 'aria-roledescription': 'groove map', 'aria-label': `Groove map of side ${label.title.replace('Side ', '')}, ${v.bins.length} bins, coloured by ${METRIC_LABEL[st.metric]}${deltas ? ' change' : ''}`, 'aria-describedby': 'wm-map-help', 'data-nav': 'map' });
    const drawMap = () => { mapWrap.innerHTML = grooveMapSvg(arcs, { geom, metric: st.metric, theme: theme(), deltas, selected: st.selected, worst, skips: v.skips, label, id: nextId(), ariaLabel: 'Groove map' }); };
    const tlWrap = h('div', { class: 'wm-tl', id: 'wm-tl', tabindex: '0', role: 'group', 'aria-roledescription': 'timeline', 'aria-label': `Timeline of ${METRIC_LABEL[st.metric]} over the side`, 'aria-describedby': 'wm-map-help', 'data-nav': 'timeline' });
    const prevLine = compareOn && st.compare.prevLine ? st.compare.prevLine.map(p => ({ ...p, value: p.interrupted ? null : st.metric === 'snr' ? p.snrDb : st.metric === 'phase' ? p.phaseErrDeg : p.dropouts })) : null;
    const tlBins = v.bins.map(b => ({ ...b, title: `${binLabel(b, st.metric)} (${b.cls})` }));
    const drawTl = () => { tlWrap.innerHTML = timelineSvg(tlBins, { metric: st.metric, theme: theme(), durationSec: geom.durationSec, deltas, selected: st.selected, worst, skips: v.skips, prev: st.metric === 'dropouts' ? null : prevLine, id: nextId(), ariaLabel: 'Timeline' }); };
    drawMap(); drawTl();
    // selection changes redraw only the plots, the table highlight and the details panel
    st.redrawSelection = () => {
      drawMap(); drawTl();
      body.querySelectorAll('#wm-table tr.is-selected').forEach(r => r.classList.remove('is-selected'));
      body.querySelector(`#wm-table tr[data-row="${st.selected}"]`)?.classList.add('is-selected');
      updateInspector();
    };
    for (const el of [mapWrap, tlWrap]) {
      el.addEventListener('click', e => { const t = e.target.closest('[data-idx]'); if (t) { select(Number(t.dataset.idx), { from: el.dataset.nav, open: true }); } });
      el.addEventListener('keydown', navKey);
    }

    const compareText = compareOn ? h('p', { class: 'wm-compare-text', id: 'wm-compare-text', role: 'status' }, h('span', { html: icon('compare', { size: 16 }) }), h('span', { text: st.compare.text })) : null;

    body.append(verdictEl, toolbar, compareText || '',
      h('div', { class: 'wm-result-grid' },
        h('section', { class: 'card wm-map-card', 'aria-labelledby': 'wm-map-title' },
          h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'wm-map-title', text: 'Groove map' }), h('span', { class: 'muted small', text: 'Outer edge = start of the side' })),
          mapWrap, h('p', { class: 'field-help', id: 'wm-map-help', text: help }), legend(deltas)),
        h('div', { class: 'wm-result-side' }, worstCard(v, deltas), statsCard(v), st.compare?.mode === 'region' && compareOn ? regionCard() : null, historyCard())),
      h('section', { class: 'card wm-tl-card', 'aria-labelledby': 'wm-tl-title' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'wm-tl-title', text: 'Timeline' }), compareOn && prevLine && st.metric !== 'dropouts' ? h('span', { class: 'wm-tl-key small muted' }, h('span', { class: 'wm-key-line' }), 'this scan', h('span', { class: 'wm-key-line wm-key-dash' }), 'earlier scan') : null),
        tlWrap),
      st.showTable ? tableCard(v, deltas) : '');
    updateInspector();
  }

  function legend(deltas) {
    const info = METRIC_INFO[st.metric];
    const lo = deltas ? 'Worse' : `${st.metric === 'dropouts' ? `${info.hi}+` : info.worseUp ? `${info.hi}+ ${info.unit}` : `≤ ${info.lo} ${info.unit}`}`;
    const hi = deltas ? 'Better' : `${st.metric === 'dropouts' ? '0' : info.worseUp ? `0 ${info.unit}` : `${info.hi}+ ${info.unit}`}`;
    const sw = cls => h('span', { class: `wm-swatch ${cls}`, 'aria-hidden': 'true' });
    return h('div', { class: 'wm-legend', id: 'wm-legend' },
      h('div', { class: 'wm-ramp' }, h('span', { class: 'wm-ramp-end num', text: lo }), h('span', { class: 'wm-ramp-bar', 'aria-hidden': 'true', style: `background:${legendGradient({ theme: theme(), delta: Boolean(deltas) })}` }), h('span', { class: 'wm-ramp-end num', text: hi })),
      h('ul', { class: 'wm-keys', role: 'list' },
        h('li', {}, sw('wm-sw-bad'), deltas ? 'New bad bin' : 'Bad bin (hatched)'),
        h('li', {}, sw('wm-sw-int'), deltas ? 'Not compared' : 'Interrupted, not counted'),
        h('li', {}, sw('wm-sw-track'), 'Not scanned'),
        h('li', {}, sw('wm-sw-pin'), 'Worst bins 1–3'),
        h('li', {}, sw('wm-sw-skip'), 'Needle skip')),
      deltas ? h('p', { class: 'field-help', text: `Change in ${METRIC_LABEL[st.metric]} versus the earlier scan; grey = within noise (under 3 dB for SNR).` }) : null);
  }

  function worstCard(v, deltas) {
    const card = h('section', { class: 'card wm-worst', 'aria-labelledby': 'wm-worst-title' }, h('h2', { class: 'card-title', id: 'wm-worst-title', text: 'Worst stretches' }));
    if (!v.worst.length) { card.append(h('p', { class: 'muted', text: 'No usable bins.' })); return card; }
    card.append(h('ol', { class: 'wm-worst-list', role: 'list' }, ...v.worst.map((w, k) => {
      const d = deltas?.get(w.idx);
      return h('li', {}, h('button', { type: 'button', class: 'wm-worst-item', 'data-worst': String(k + 1), 'aria-label': `Worst ${k + 1}: ${w.time}, ${w.class}, SNR ${Number.isFinite(w.snrDb) ? Math.round(w.snrDb) : 'unknown'} dB, ${w.dropouts} dropouts. Show on map.`, onclick: () => select(w.idx, { open: true, focusMap: true }) },
        h('span', { class: 'wm-pin-num', text: String(k + 1) }),
        h('span', { class: 'wm-worst-main' }, h('strong', { class: 'num', text: w.time }), h('span', { class: 'muted small num', text: `${Number.isFinite(w.snrDb) ? `${w.snrDb.toFixed(1)} dB SNR` : 'no SNR'} · ${w.dropouts} dropout${w.dropouts === 1 ? '' : 's'} · ${Number.isFinite(w.phaseErrDeg) ? `${Math.round(w.phaseErrDeg)}°` : '—'}${d?.newBad ? ' · new' : ''}` })),
        h('span', { html: chip(w.class === 'bad' ? 'fail' : w.class === 'degraded' ? 'warn' : 'pass', w.class, { size: 12 }) })));
    })));
    if (v.skips.length) card.append(h('p', { class: 'wm-skips small', id: 'wm-skips' }, h('strong', { text: `Needle skip${v.skips.length === 1 ? '' : 's'}: ` }), v.skips.slice(0, 8).map(s => formatTime(s.tSec)).join(', '), v.skips.length > 8 ? ` and ${v.skips.length - 8} more` : '', '. Those bins are not counted.'));
    return card;
  }
  function statsCard(v) {
    const s = v.stats || {};
    const row = (k, val) => h('div', { class: 'wm-tile' }, h('dt', { text: k }), h('dd', { class: 'num', text: val }));
    return h('section', { class: 'card wm-stats', 'aria-labelledby': 'wm-stats-title' }, h('h2', { class: 'card-title', id: 'wm-stats-title', text: 'Side summary' }),
      h('div', { class: 'wm-share', role: 'img', 'aria-label': `Good ${pctText(s.goodPct)}, degraded ${pctText(s.degradedPct)}, bad ${pctText(s.badPct)} of counted bins` },
        ...[['good', s.goodPct], ['degraded', s.degradedPct], ['bad', s.badPct]].map(([k, p]) => h('span', { class: `wm-share-${k}`, style: `flex-grow:${Math.max(0, p || 0)}` }))),
      h('dl', { class: 'wm-tiles' },
        row('Good', pctText(s.goodPct)), row('Degraded', pctText(s.degradedPct)), row('Bad', pctText(s.badPct)),
        row('Dropouts', String(s.dropouts ?? 0)), row('Counted bins', String(s.validBins ?? '—')), row('Interrupted', String(s.interruptedBins ?? 0))),
      v.stylusNote ? h('p', { class: 'hint hint-warn' }, h('span', { html: icon('warn', { size: 16 }) }), h('span', { text: v.stylusNote })) : null);
  }
  function regionCard() {
    const rows = st.compare.regions;
    return h('section', { class: 'card', 'aria-labelledby': 'wm-reg-title' }, h('h2', { class: 'card-title', id: 'wm-reg-title', text: 'By region' }),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data wm-region-table' },
        h('thead', {}, h('tr', {}, ...['Region', 'Bad now', 'Change', 'SNR change'].map(t => h('th', { scope: 'col', text: t })))),
        h('tbody', {}, ...rows.map(r => h('tr', {}, h('th', { scope: 'row', class: 'num', text: `${formatTime(r.fromSec)}–${formatTime(r.toSec)}` }), h('td', { class: 'num', text: pctText(r.badPct) }),
          h('td', { class: 'num', text: Number.isFinite(r.badPctDelta) ? `${r.badPctDelta > 0 ? '+' : ''}${r.badPctDelta.toFixed(1)} pts` : '—' }),
          h('td', { class: 'num', text: Number.isFinite(r.snrDelta) ? `${r.snrDelta > 0 ? '+' : ''}${r.snrDelta.toFixed(1)} dB${r.withinNoise ? ' (noise)' : ''}` : '—' })))))));
  }
  function tableCard(v, deltas) {
    const cols = ['Bin', 'Time', 'Class', 'SNR (dB)', 'Phase err (deg)', 'Dropouts', 'Level (dBFS)', deltas ? 'SNR change' : 'Notes'];
    return h('section', { class: 'card wm-table-card', 'aria-labelledby': 'wm-table-title' },
      h('h2', { class: 'card-title', id: 'wm-table-title', text: 'All bins' }),
      h('div', { class: 'table-wrap wm-table-wrap' }, h('table', { class: 'data wm-table', id: 'wm-table' },
        h('caption', { class: 'sr-only', text: `${v.bins.length} bins of the scan; the same data as the groove map and timeline.` }),
        h('thead', {}, h('tr', {}, ...cols.map(c => h('th', { scope: 'col', class: /\(|Dropouts|change/.test(c) ? 'r' : null, text: c })))),
        h('tbody', {}, ...v.bins.map(b => {
          const d = deltas?.get(b.idx);
          const f = (x, k = 1) => (Number.isFinite(x) ? x.toFixed(k) : '—');
          const dv = d && !d.excluded && Number.isFinite(d.snrDelta) ? Number(d.snrDelta.toFixed(1)) || 0 : null;
          const note = deltas ? (dv != null ? `${dv > 0 ? '+' : ''}${dv.toFixed(1)}${d.newBad ? ' new bad' : ''}` : '—')
            : [b.cls === 'interrupted' ? 'not counted' : '', b.skips?.length ? 'skip' : ''].filter(Boolean).join(', ');
          return h('tr', { 'data-row': String(b.idx), class: b.idx === st.selected ? 'is-selected' : null },
            h('th', { scope: 'row' }, h('button', { type: 'button', class: 'link wm-row-btn', text: String(b.idx), 'aria-label': `Show bin ${b.idx} on the map`, onclick: () => select(b.idx, { open: true, focusMap: true }) })),
            h('td', { class: 'num', text: formatTime(b.tSec) }), h('td', { text: b.cls }), h('td', { class: 'num r', text: f(b.snrDb) }), h('td', { class: 'num r', text: f(b.phaseErrDeg) }),
            h('td', { class: 'num r', text: String(b.dropouts || 0) }), h('td', { class: 'num r', text: f(b.levelDbfs) }), h('td', { class: deltas ? 'num r' : null, text: note }));
        })))));
  }

  // ----- selection, inspector, keys
  function select(idx, { from = null, open = false, focusMap = false } = {}) {
    const v = st.current;
    if (!v) return;
    const b = v.bins.find(x => x.idx === idx);
    if (!b) return;
    st.selected = idx;
    const focusId = focusMap ? 'wm-map' : from === 'timeline' ? 'wm-tl' : from === 'map' ? 'wm-map' : document.activeElement?.id;
    if (st.view === 'result' && st.redrawSelection && q('#wm-map')) st.redrawSelection(); else render();
    if (focusId) q(`#${focusId}`)?.focus();
    const d = st.compareOn ? st.compare?.deltas?.get(idx) : null;
    announce(`${binLabel(b, st.metric)}, ${b.cls}${d?.newBad ? ', new bad bin' : ''}`);
    if (open) setInspector(true);
  }
  function updateInspector() {
    const v = st.current;
    if (!v) return;
    const b = v.bins.find(x => x.idx === st.selected) || v.bins.find(x => x.idx === v.worst[0]?.idx);
    if (!b) return;
    const d = st.compareOn ? st.compare?.deltas?.get(b.idx) : null;
    const box = h('div', { class: 'wm-inspect' },
      h('p', { class: 'wm-inspect-head' }, h('span', { html: chip(b.cls === 'bad' ? 'fail' : b.cls === 'degraded' ? 'warn' : b.cls === 'good' ? 'pass' : 'info', b.cls, { size: 14 }) }), h('strong', { class: 'num', text: ` Bin ${b.idx} · ${formatTime(b.tSec)}` })),
      st.selected == null ? h('p', { class: 'muted small', text: 'Worst bin shown. Select any bin on the map or timeline.' }) : null,
      h('table', { class: 'mini wm-inspect-table' }, h('tbody', {}, ...binDetails(b, { delta: d }).map(([k, val]) => h('tr', {}, h('th', { scope: 'row', text: k }), h('td', { class: 'num', text: val }))))),
      h('p', { class: 'field-help', text: 'Wear scans keep per-bin numbers only, not the audio, so there is no scope snippet to replay for this bin.' }));
    showInspector({ title: `Bin ${b.idx}`, body: box, open: false });
  }
  function navKey(e) {
    const v = st.current;
    if (!v || !v.bins.length) return;
    const idxs = v.bins.map(b => b.idx);
    let i = idxs.indexOf(st.selected);
    const perTurn = Math.max(1, Math.round(v.bins.length / Math.max(1, (drawGeometry(v).turns * Math.min(1, (v.bins.at(-1).tSec + v.binSec) / drawGeometry(v).durationSec)))));
    const map = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: e.currentTarget.dataset.nav === 'map' ? perTurn : 1, ArrowUp: e.currentTarget.dataset.nav === 'map' ? -perTurn : -1, PageDown: 10, PageUp: -10 };
    let next = null;
    if (e.key in map) next = i < 0 ? 0 : Math.min(idxs.length - 1, Math.max(0, i + map[e.key]));
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = idxs.length - 1;
    else if (e.key === 'Enter') { e.preventDefault(); if (i < 0) select(idxs[0], { from: e.currentTarget.dataset.nav }); setInspector(true); return; }
    if (next == null) return;
    e.preventDefault();
    select(idxs[next], { from: e.currentTarget.dataset.nav });
  }
  function setMetric(m) {
    st.metric = m; savePrefs(storage, { metric: m, showTable: st.showTable });
    if (st.view === 'result') { const keep = document.activeElement?.id; render(); if (keep) q(`#${keep}`)?.focus(); }
    else if (st.view === 'capture') updateCapture();
    announce(`Colour by ${METRIC_LABEL[m]}`);
  }
  function toggleCompare(on) {
    if (!st.prev || !st.compare) { announce('No earlier scan of this side to compare with.'); return; }
    st.compareOn = on;
    const keep = document.activeElement?.id;
    render();
    if (keep) q(`#${keep}`)?.focus();
    announce(on ? st.compare.text : 'Comparison off.');
  }
  async function deleteScan() {
    const v = st.current;
    if (!v?.id) return;
    if (!(await confirmDialog({ title: 'Delete this scan?', body: `The ${formatDate(v.createdAt)} scan of side ${v.sideLabel ?? ''} and its ${v.bins.length} bins are removed. Other scans stay.`, confirmLabel: 'Delete scan' }))) { q('#wm-delete')?.focus(); return; }
    try {
      await api.delete(v.id);
      st.details.delete(v.id); st.current = null; st.compareOn = false;
      await loadScans();
      const latest = scansOfSide(st.sideId)[0];
      if (latest) await openScan(latest.id); else { st.view = 'setup'; render(); }
      toast('Scan deleted.', { type: 'success', timeout: 3000 });
    } catch (e) { setStatus(`Could not delete the scan: ${friendly(e)}`, 'error'); }
  }

  const onKey = e => {
    if (section.hidden || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]') || isTyping(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === 'm' && (st.view === 'result' || st.view === 'capture')) { e.preventDefault(); setMetric(METRICS[(METRICS.indexOf(st.metric) + 1) % METRICS.length]); }
    else if (k === 'c' && st.view === 'result') { e.preventDefault(); toggleCompare(!st.compareOn); }
  };
  document.addEventListener('keydown', onKey);
  // redraw in the new theme (the ramps differ per theme)
  new MutationObserver(() => { if (!section.hidden && (st.view === 'result' || st.view === 'capture')) { if (st.view === 'result') render(); else updateCapture(); } })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  on('settings', ({ key } = {}) => { if (key === 'deviceName' && st.view === 'setup' && !section.hidden) render(); });

  render();
  return {
    onShow() {
      const hand = takeHandoff('vinylscan'); // deep link from Equipment: scan with this cartridge
      if (hand?.stylusId) st.setup.stylusId = hand.stylusId;
      if (!st.run) load().then(() => { if (hand?.stylusId && st.view === 'result') { st.view = 'setup'; render(); } });
    },
    onHide() { /* a running scan keeps going; the status bar shows it */ },
    onSpace() {
      if (st.view === 'setup') { start(); return true; }
      if (st.view === 'capture') { stop(); return true; }
      return false;
    },
    onEscape() {
      if (st.view === 'capture') { cancel(); return true; }
      if (st.view === 'form') { closeForm(); return true; }
      if (st.view === 'result' && st.compareOn) { toggleCompare(false); return true; }
      if (st.view === 'result' && st.selected != null) { st.selected = null; st.redrawSelection?.(); q('#wm-map')?.focus(); return true; }
      return false;
    },
    reload: load,
  };
}

/** Rail entry (FS-13): the screen exists while features.wearMap is on. */
export function vinylScanScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-vinylscan')) main.append(h('section', { class: 'screen', id: 'screen-vinylscan', hidden: true }));
  return [{ id: 'vinylscan', title: 'Control vinyl', short: 'Wear map', icon: 'vinyl', feature: 'wearMap', create: createVinylScanScreen }];
}

