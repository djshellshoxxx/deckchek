// Compare screen (FS-21): "your unit against the published spec, your other units and a reference population".
// Phase 1 (flag `population`) is fully offline: Spec and My units tabs. Phase 2 (flag `packs`) adds the Population tab and
// the Data sharing card (anonymous .deckchek-pack export and import). Statistics live in population.js, pack rules in
// pack.js and pack.rs; this file is layout, forms and inline SVG. Desktop only: the values come from the local database.

import { h, esc, isNative, isTyping, storageGet, storageSet } from '../dom.js';
import { icon, chip } from '../icons.js';
import { announce, toast } from '../live.js';
import { isEnabled, onFeatureChange } from '../../features.js';
import { ensureLibrary, profileById } from '../devices/library-state.js';
import { takeHandoff, navigateTo } from '../crosslinks.js';
import { createPackApi } from '../../pack-api.js';
import { exportRowsFromUnitValues } from '../../pack.js';
import { metricLabel } from '../metrics.js';
import {
  compareMetricToSpec, latestPerAsset, compareToSiblings, historyDelta, populationComparison, describeComparison, stripPlot,
  ordinal, N_MIN_PERCENTILE, N_MIN_MEDIAN,
} from '../../population.js';

const EXPORTED_KEY = 'deckchek.packs.exported.v1';
const TABS = [['spec', 'Spec'], ['units', 'My units'], ['population', 'Population']];
const friendly = e => (typeof e === 'string' ? e : e?.message || 'Something went wrong.');
const fmt = (v, d = 3) => (Number.isFinite(v) ? String(Number(Number(v).toPrecision(d))) : '—');
const when = iso => String(iso ?? '').slice(0, 10) || '—';
const getVersion = async () => { try { return (await window.__TAURI__?.app?.getVersion?.()) || '0.0.0'; } catch { return '0.0.0'; } };

/** Entry point for other screens (result-row Compare chip, device detail "How does my unit rank?"). */
export function openCompare(params = null) { navigateTo('compare', params); }

/**
 * Spec section 3 shortcut: "C opens Compare on a focused result row". A row opts in by carrying
 * data-compare-asset="<asset id>" and data-compare-metric="<metric key>"; the keydown handler installed by
 * compareScreenDefs() reads them from the focused element or its closest ancestor. -> {assetId, metric} | null
 */
export function compareShortcutParams(event) {
  if (!event || (event.key !== 'c' && event.key !== 'C') || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return null;
  const target = event.target;
  if (typeof target?.closest !== 'function' || isTyping(target)) return null;
  const row = target.closest('[data-compare-asset][data-compare-metric]');
  if (!row) return null;
  const assetId = row.getAttribute('data-compare-asset'), metric = row.getAttribute('data-compare-metric');
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(assetId ?? '') || !/^[a-z0-9._:-]{1,64}$/.test(metric ?? '')) return null;
  return { assetId, metric };
}

// ------------------------------------------------------------------ pure helpers (unit tested)

/** Rows the Rust importer can return at most (pack.rs MAX_ROWS); population_query sets `truncated` beyond it. */
const POPULATION_ROW_CAP = 100000;
/** Model/metric rows the import preview renders before summarising the rest. */
export const PREVIEW_ROW_CAP = 50;

/** The import preview's (product, metric) counts, capped so a hostile pack cannot build a huge table. */
export function capPreview(counts, limit = PREVIEW_ROW_CAP) {
  const list = Array.isArray(counts) ? counts : [];
  return { shown: list.slice(0, limit), more: Math.max(0, list.length - limit) };
}

/** Visible notice when population_query hit its row cap, or null. */
export function truncationNotice(result) {
  if (!result?.truncated) return null;
  return `Only the first ${POPULATION_ROW_CAP.toLocaleString('en')} reference rows were read, so some contributors may be missing from this comparison. Remove packs you do not need and compare again.`;
}

/** Visible notice when population_unit_values left values out to stay under its row cap, or null. */
export function unitsTruncationNotice(values) {
  if (values?.truncated !== true) return null;
  return 'You have more stored results than DeckChek loads at once, so some older results are left out. Each unit keeps its most recent results; older history may be missing here.';
}

/**
 * Population comparison for the screen. The method registry (analysis_method rows: key, version, parameters_json with
 * `compat`) comes with the population query as `methods`, so AC-7's mutual-compat rule applies on this path too.
 */
export function comparePopulation(result, measurement, def, seed) {
  const methods = Array.isArray(result?.methods) ? result.methods : [];
  const registry = methods.filter(m => m && typeof m.key === 'string' && Number.isSafeInteger(m.version))
    .map(m => ({ key: m.key, version: m.version, parameters_json: m.parametersJson ?? m.parameters_json ?? '{}' }));
  const higher = def?.higherIsBetter;
  return populationComparison(Array.isArray(result?.rows) ? result.rows : [], measurement, { higherIsBetter: typeof higher === 'boolean' ? higher : undefined, registry, seed });
}

/** Group the Rust unit rows into {assets: Map(assetId -> {nickname, productKey, metrics: Set})}. */
export function indexUnits(rows) {
  const assets = new Map();
  for (const r of rows ?? []) {
    if (!assets.has(r.assetId)) assets.set(r.assetId, { assetId: r.assetId, nickname: r.nickname, productKey: r.productKey, metrics: new Set() });
    assets.get(r.assetId).metrics.add(r.metric);
  }
  return assets;
}

/** The profile spec entry that belongs to a metric, if any. */
export function specFor(profile, def) {
  const keys = def?.specKeys ?? [];
  return (profile?.specs ?? []).find(s => keys.includes(s.key)) ?? null;
}

/** Plain-language result of compareToSpec for the Spec tab. */
export function specSentence(result, label) {
  if (result.status !== 'ok') return result.reason;
  const unit = result.unit ? ` ${result.unit}` : '';
  const kind = result.limit === 'max' ? 'maximum' : 'minimum';
  const margin = `${fmt(Math.abs(result.margin))}${unit}`;
  return `${label}: ${fmt(result.value)}${unit} against a published ${kind} of ${fmt(result.specValue)}${unit}. ${result.within ? `Inside the limit with ${margin} to spare.` : `Outside the limit by ${margin}.`}`;
}

// ------------------------------------------------------------------ screen

export function createCompareScreen(section, { api = createPackApi() } = {}) {
  const native = isNative() && api.native;
  const st = { tab: 'spec', units: [], table: null, packs: [], assetId: null, metric: null, loading: false, error: null, pop: null, popKey: '', skipped: null, unitsTruncated: null };
  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('compare', { size: 24 })}</span><div><h1 tabindex="-1">Compare</h1>
      <p class="lede">How a unit's measurement compares with its published spec, your other units of the same model, and, if you import packs, other people's units. A percentile never decides pass or fail: the spec limit does.</p></div></div></header>
    <div id="cmp-status" class="cmp-status"></div>
    <p id="cmp-pop-live" class="sr-only" aria-live="polite" aria-atomic="true"></p>
    <div class="cmp-pickers" id="cmp-pickers">
      <div class="field"><label class="field-label" for="cmp-asset">Unit</label><select id="cmp-asset"></select></div>
      <div class="field"><label class="field-label" for="cmp-metric">Metric</label><select id="cmp-metric"></select></div>
    </div>
    <div class="tabs" role="tablist" aria-label="Comparison views" id="cmp-tabs"></div>
    <div id="cmp-panel" class="cmp-panel" role="tabpanel" tabindex="-1"></div>
    <div id="cmp-share"></div>`;
  const q = s => section.querySelector(s);
  const panel = q('#cmp-panel'), tabs = q('#cmp-tabs'), assetSel = q('#cmp-asset'), metricSel = q('#cmp-metric'), status = q('#cmp-status'), share = q('#cmp-share');

  const packsOn = () => isEnabled('packs');
  const visibleTabs = () => TABS.filter(([id]) => id !== 'population' || packsOn());
  // One announcement channel: the visible banner is not a live region; announce() speaks it once (assertive for errors).
  const setStatus = (text, kind = 'info', rows = []) => {
    status.replaceChildren();
    if (!text) return;
    status.append(h('div', { class: `banner banner-${kind === 'error' ? 'fail' : kind === 'warn' ? 'warn' : 'info'}`, 'data-kind': kind },
      h('span', { class: 'banner-text', text }),
      rows.length ? h('ul', { class: 'cmp-reasons' }, ...rows.map(r => h('li', { text: `Row ${r.row}: ${r.reason}` }))) : null));
    announce(text, { assertive: kind === 'error' });
  };
  // The population result arrives asynchronously into a freshly built card, so it is spoken through this persistent
  // region (separate from the status channel, so an "Imported …" message is not overwritten).
  const popLive = q('#cmp-pop-live');
  let popLiveTimer = null;
  const speakPopulation = text => {
    popLive.textContent = '';
    clearTimeout(popLiveTimer);
    popLiveTimer = setTimeout(() => { popLive.textContent = text; }, 60);
  };
  /** After a re-render, put focus on the first of `selectors` that exists (so it never falls back to <body>). */
  const focusFirst = (...selectors) => { for (const s of selectors) { const el = s && section.querySelector(s); if (el) { el.focus(); return el; } } return null; };

  // ----- data -----
  const defOf = metric => st.table?.metrics?.[metric] ?? null;
  const assets = () => [...indexUnits(st.units).values()].sort((a, b) => a.nickname.localeCompare(b.nickname) || a.assetId.localeCompare(b.assetId));
  const metricsOf = assetId => [...(indexUnits(st.units).get(assetId)?.metrics ?? [])].sort((a, b) => metricLabel(a).localeCompare(metricLabel(b)));
  function selection() {
    const asset = indexUnits(st.units).get(st.assetId);
    if (!asset || !st.metric) return null;
    const history = st.units.filter(r => r.assetId === asset.assetId && r.metric === st.metric).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const latest = history.at(-1);
    if (!latest) return null;
    const siblings = latestPerAsset(st.units.filter(r => r.productKey === asset.productKey && r.metric === st.metric));
    return { asset, history, latest, siblings, def: defOf(st.metric), profile: profileById(asset.productKey) };
  }

  async function load() {
    if (!native) { render(); return; }
    st.loading = true; st.error = null; render();
    try {
      await ensureLibrary();
      st.table = await api.metricTable();
      const values = await api.unitValues();
      st.units = values.rows; st.skipped = { unit: values.skippedUnit, unattributed: values.skippedUnattributed };
      st.unitsTruncated = unitsTruncationNotice(values);
      st.packs = packsOn() ? await api.list() : [];
      const list = assets();
      if (!list.some(a => a.assetId === st.assetId)) st.assetId = list[0]?.assetId ?? null;
      if (!metricsOf(st.assetId).includes(st.metric)) st.metric = metricsOf(st.assetId)[0] ?? null;
      st.pop = null; st.popKey = '';
    } catch (e) { st.error = friendly(e); }
    st.loading = false;
    render();
  }

  // ----- rendering -----
  function renderTabs() {
    const list = visibleTabs();
    if (!list.some(([id]) => id === st.tab)) st.tab = 'spec';
    tabs.replaceChildren(...list.map(([id, label]) => h('button', {
      type: 'button', class: 'tab', role: 'tab', id: `cmp-tab-${id}`, 'aria-selected': String(st.tab === id), 'aria-controls': 'cmp-panel', tabindex: st.tab === id ? '0' : '-1', 'data-tab': id, text: label,
      onclick: () => selectTab(id, { focusTab: true }), // the buttons are rebuilt; keep focus on the activated tab
      onkeydown: e => {
        const i = list.findIndex(([t]) => t === st.tab);
        const next = e.key === 'ArrowRight' ? (i + 1) % list.length : e.key === 'ArrowLeft' ? (i - 1 + list.length) % list.length : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : -1;
        if (next < 0) return;
        e.preventDefault(); selectTab(list[next][0], { focusTab: true });
      },
    })));
    panel.setAttribute('aria-labelledby', `cmp-tab-${st.tab}`);
  }
  function selectTab(id, { focusTab = false } = {}) {
    st.tab = id; renderTabs(); renderPanel();
    if (focusTab) q(`#cmp-tab-${id}`)?.focus();
  }

  function render() {
    const list = native ? assets() : [];
    assetSel.replaceChildren(...list.map(a => h('option', { value: a.assetId, text: a.nickname, selected: a.assetId === st.assetId ? true : null })));
    metricSel.replaceChildren(...metricsOf(st.assetId).map(m => h('option', { value: m, text: defOf(m)?.label ?? metricLabel(m), selected: m === st.metric ? true : null })));
    const ready = native && !st.loading && !st.error && list.length > 0;
    q('#cmp-pickers').hidden = !ready; tabs.hidden = !ready;
    renderTabs(); renderPanel(); renderShare();
  }

  function empty(title, body, id, actions = []) {
    return h('div', { class: 'empty card', id }, h('span', { class: 'empty-icon', html: icon('compare', { size: 36 }) }), h('h2', { text: title }), h('p', { text: body }), actions.length ? h('div', { class: 'cmp-actions' }, ...actions) : null);
  }

  function renderPanel() {
    panel.replaceChildren();
    if (!native) { panel.append(empty('Compare needs the desktop app', 'Measured values are stored in DeckChek’s local database, which the browser preview does not have. Open the desktop app to compare a unit.', 'cmp-unsupported')); return; }
    if (st.loading) { panel.append(h('p', { class: 'muted', text: 'Loading…' })); return; }
    if (st.error) { panel.append(h('div', { class: 'banner banner-fail', role: 'alert' }, h('span', { class: 'banner-text', text: `Could not load measurements: ${st.error}` }), h('div', { class: 'banner-actions' }, h('button', { type: 'button', class: 'btn btn-secondary', text: 'Try again', onclick: () => load() })))); return; }
    const sel = selection();
    if (!sel) { panel.append(empty('No comparable results yet', 'Run a test on one of your units from Devices or Quick Check. Only measured results without quality warnings that DeckChek can tie to exactly one unit appear here.', 'cmp-empty')); return; }
    ({ spec: renderSpec, units: renderUnits, population: renderPopulation })[st.tab](sel);
  }

  // ----- Spec (AC-1) -----
  function renderSpec(sel) {
    const label = sel.def?.label ?? metricLabel(st.metric);
    const measurement = { value: sel.latest.value, unit: sel.latest.unit };
    const spec = specFor(sel.profile, sel.def);
    const result = compareMetricToSpec(measurement, spec, sel.def); // only a spec that measures the same quantity gets a verdict
    const card = h('section', { class: 'card cmp-card', id: 'cmp-spec', 'aria-label': 'Against the published spec' }, h('h2', { class: 'card-title', text: 'Against the published spec' }));
    card.append(h('p', { id: 'cmp-spec-text', text: specSentence(result, label) }));
    if (result.status === 'ok') {
      card.append(h('p', { class: 'cmp-verdict', html: chip(result.within ? 'pass' : 'fail', result.within ? 'INSIDE SPEC' : 'OUTSIDE SPEC') }), specBar(result, label));
      if (result.confidence === 'unverified') card.append(h('p', { class: 'muted', text: 'This spec figure is unverified in the device library, so treat the margin as a guide.' }));
    }
    if (spec?.source && /^https?:/.test(spec.source)) card.append(h('p', { class: 'muted', text: `Source: ${spec.source.replace(/^https?:\/\//, '').slice(0, 80)}` }));
    card.append(h('p', { class: 'muted', text: `Measured ${when(sel.latest.at)}. The method is ${sel.latest.methodKey} version ${sel.latest.methodVersion}.` }));
    panel.append(card);
  }

  /** Bar with the spec limit as a vertical line and the value as a diamond; the numbers are also in the text above. */
  function specBar(r, label) {
    const lo = Math.min(r.value, r.specValue), hi = Math.max(r.value, r.specValue);
    const span = hi - lo || Math.abs(hi) || 1;
    const a = lo - span * 0.5, b = hi + span * 0.5;
    const x = v => 20 + ((v - a) / (b - a)) * 520;
    const good = r.limit === 'max' ? [20, x(r.specValue)] : [x(r.specValue), 540];
    const m = x(r.value);
    return h('div', { class: 'cmp-bar-wrap', html: `<svg class="cmp-bar" viewBox="0 0 560 70" role="img" aria-label="${esc(label)}: value ${fmt(r.value)}, spec limit ${fmt(r.specValue)}, margin ${fmt(r.margin)}">
      <rect x="20" y="28" width="520" height="14" class="cmp-bar-track"/><rect x="${good[0]}" y="28" width="${Math.max(0, good[1] - good[0])}" height="14" class="cmp-bar-good"/>
      <line x1="${x(r.specValue)}" y1="16" x2="${x(r.specValue)}" y2="54" class="cmp-limit"/><text x="${x(r.specValue)}" y="12" text-anchor="middle" class="cmp-svg-label">limit ${fmt(r.specValue)}</text>
      <path d="M${m} 20 l8 15 -8 15 -8 -15z" class="cmp-marker ${r.within ? 'cmp-in' : 'cmp-out'}"/><text x="${m}" y="66" text-anchor="middle" class="cmp-svg-label">you ${fmt(r.value)}</text></svg>` });
  }

  // ----- My units (AC-2, AC-3) -----
  function renderUnits(sel) {
    const higher = sel.def?.higherIsBetter;
    const dir = typeof higher === 'boolean' ? higher : undefined;
    const sib = compareToSiblings(sel.siblings, sel.asset.assetId, { higherIsBetter: dir });
    const card = h('section', { class: 'card cmp-card', id: 'cmp-units', 'aria-label': 'Your other units of this model' }, h('h2', { class: 'card-title', text: 'Your other units of this model' }));
    if (st.unitsTruncated) card.append(h('div', { class: 'banner banner-warn', id: 'cmp-units-truncated' }, h('span', { class: 'banner-text', text: st.unitsTruncated })));
    if (sib.status === 'single') card.append(h('p', { id: 'cmp-sib-text', text: 'This is your only unit of this model with a result for this metric.' }));
    else {
      card.append(h('p', { id: 'cmp-sib-text', text: sib.rank ? `${sel.asset.nickname} ranks ${ordinal(sib.rank)} of ${sib.of} of your units (${higher ? 'higher' : 'lower'} is better).` : `${sib.of} of your units have a result. This metric has no ranking direction, so they are listed by value.` }));
      const body = h('tbody');
      sib.rows.forEach(u => body.append(h('tr', { class: u.self ? 'cmp-self' : null, 'aria-current': u.self ? 'true' : null }, h('td', { text: u.nickname + (u.self ? ' (this unit)' : '') }), h('td', { class: 'r', text: `${fmt(u.value)} ${u.unit}` }), h('td', { text: when(u.at) }))));
      card.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data cmp-table', id: 'cmp-sib-table' }, h('caption', { class: 'sr-only', text: 'Latest value of each unit' }),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Unit' }), h('th', { scope: 'col', class: 'r', text: 'Latest' }), h('th', { scope: 'col', text: 'Date' }))), body)));
    }
    panel.append(card);
    const hist = historyDelta(sel.history, { higherIsBetter: dir });
    const hcard = h('section', { class: 'card cmp-card', id: 'cmp-history', 'aria-label': 'This unit over time' }, h('h2', { class: 'card-title', text: 'This unit over time' }));
    if (hist.status !== 'ok') hcard.append(h('p', { id: 'cmp-hist-text', text: 'Only one run so far. A trend needs at least two.' }));
    else {
      const word = { better: 'better', worse: 'worse', same: 'the same', changed: 'different' }[hist.verdict];
      hcard.append(h('p', { id: 'cmp-hist-text', text: `Latest ${fmt(hist.latest)} ${sel.latest.unit} is ${fmt(Math.abs(hist.delta))} ${sel.latest.unit} ${hist.delta > 0 ? 'above' : hist.delta < 0 ? 'below' : 'equal to'} your median of ${hist.n - 1} earlier run${hist.n - 1 === 1 ? '' : 's'} (${fmt(hist.median)}), which is ${word}.` }), sparkline(sel.history));
    }
    panel.append(hcard);
  }

  function sparkline(history) {
    const vs = history.map(r => r.value), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
    const pt = (v, i) => [8 + (history.length === 1 ? 0 : (i / (history.length - 1)) * 304), 6 + (1 - (v - lo) / span) * 40];
    const pts = vs.map(pt);
    return h('div', { class: 'cmp-spark', html: `<svg viewBox="0 0 320 52" role="img" aria-label="Values over ${history.length} runs, from ${fmt(vs[0])} to ${fmt(vs.at(-1))}"><polyline points="${pts.map(p => p.join(',')).join(' ')}" class="cmp-spark-line"/>${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 4 : 2.5}" class="cmp-dot"/>`).join('')}</svg>` });
  }

  // ----- Population (AC-6, AC-7) -----
  async function ensurePopulation(sel) {
    const method = { key: sel.latest.methodKey, version: sel.latest.methodVersion };
    const key = `${sel.asset.productKey}|${st.metric}|${method.key}|${method.version}|${sel.latest.value}|${st.packs.map(p => p.id).join(',')}`;
    if (st.popKey === key && st.pop) return st.pop;
    const result = await api.query(sel.asset.productKey, st.metric, method.key);
    const measurement = { metric: st.metric, method, value: sel.latest.value, unit: sel.latest.unit };
    st.pop = { result, measurement, comparison: comparePopulation(result, measurement, sel.def, key) };
    st.popKey = key;
    return st.pop;
  }

  async function renderPopulation(sel) {
    const card = h('section', { class: 'card cmp-card', id: 'cmp-population', 'aria-label': 'Against the reference population' }, h('h2', { class: 'card-title', text: 'Against the reference population' }));
    panel.append(card);
    if (!st.packs.length) {
      card.append(h('p', { id: 'cmp-pop-empty', text: 'Import a pack to see how your unit compares.' }), h('div', { class: 'cmp-actions' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'cmp-import-inline', text: 'Import a pack', onclick: importPack })));
      return;
    }
    card.append(h('p', { class: 'muted', text: 'Loading…' }));
    let pop;
    try { pop = await ensurePopulation(sel); } catch (e) { card.replaceChildren(h('h2', { class: 'card-title', text: 'Against the reference population' }), h('p', { class: 'form-error', role: 'alert', text: `Could not read the reference population: ${friendly(e)}` })); return; }
    if (st.tab !== 'population' || panel.querySelector('#cmp-population') !== card) return; // the user moved on
    const c = pop.comparison;
    const text = describeComparison(c, pop.measurement);
    card.replaceChildren(h('h2', { class: 'card-title', text: 'Against the reference population' }),
      h('p', { id: 'cmp-pop-text', text }));
    const truncated = truncationNotice(pop.result);
    if (truncated) card.append(h('div', { class: 'banner banner-warn', id: 'cmp-pop-truncated' }, h('span', { class: 'banner-text', text: truncated })));
    speakPopulation(truncated ? `${text} ${truncated}` : text);
    if (c.status === 'insufficient') card.append(h('p', { class: 'cmp-verdict', html: chip('info', 'NOT ENOUGH DATA') }));
    const geometry = stripPlot(c, pop.measurement.value);
    if (geometry) card.append(stripSvg(geometry, c, pop.measurement, text));
    const notes = [];
    if (c.excluded) notes.push(`${c.excluded} row${c.excluded === 1 ? '' : 's'} from other method versions or units were not compared.`);
    if (c.contributors >= N_MIN_MEDIAN && c.contributors < N_MIN_PERCENTILE) notes.push(`A median is shown from ${N_MIN_MEDIAN} contributors; a percentile needs ${N_MIN_PERCENTILE}.`);
    if (c.contributors > 0 && c.contributors < N_MIN_MEDIAN) notes.push(`Below ${N_MIN_MEDIAN} contributors only individual dots are shown.`);
    notes.push(c.caveat, `Method: ${pop.measurement.method.key} version ${pop.measurement.method.version}. ${st.packs.length} imported pack${st.packs.length === 1 ? '' : 's'}.`);
    card.append(h('ul', { class: 'cmp-notes muted' }, ...notes.map(n => h('li', { text: n }))));
    const rows = c.dots.slice().sort((a, b) => a.value - b.value);
    if (rows.length) {
      const body = h('tbody');
      rows.slice(0, 200).forEach((d, i) => body.append(h('tr', {}, h('td', { class: 'r', text: String(i + 1) }), h('td', { class: 'r', text: `${fmt(d.value)} ${pop.measurement.unit}` }), h('td', { text: d.outlier ? 'Outlier (left out of the band)' : 'Used' }))));
      card.append(h('details', { class: 'cmp-details' }, h('summary', { text: 'Show data table' }), h('div', { class: 'table-wrap' }, h('table', { class: 'data cmp-table', id: 'cmp-pop-table' }, h('caption', { class: 'sr-only', text: 'One value per contributor' }),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: 'r', text: '#' }), h('th', { scope: 'col', class: 'r', text: 'Value' }), h('th', { scope: 'col', text: 'In summary' }))), body))));
    }
  }

  function stripSvg(g, c, measurement, text) {
    // P10-P90 only once a percentile is allowed (20 contributors); from 8 contributors a median line alone (spec section 6).
    const band = g.band ? `<rect x="${g.band.p10}" y="26" width="${Math.max(1, g.band.p90 - g.band.p10)}" height="38" class="cmp-band"/><line x1="${g.band.p50}" y1="22" x2="${g.band.p50}" y2="68" class="cmp-median"/>
      <text x="${g.band.p10}" y="80" class="cmp-svg-label" text-anchor="middle">P10</text><text x="${g.band.p50}" y="80" class="cmp-svg-label" text-anchor="middle">P50</text><text x="${g.band.p90}" y="80" class="cmp-svg-label" text-anchor="middle">P90</text>`
      : g.median !== null ? `<line x1="${g.median}" y1="22" x2="${g.median}" y2="68" class="cmp-median"/><text x="${g.median}" y="80" class="cmp-svg-label" text-anchor="middle">median</text>` : '';
    const dots = g.dots.map((d, i) => `<circle cx="${d.x}" cy="${45 + ((i * 7) % 5 - 2) * 6}" r="3.5" class="${d.outlier ? 'cmp-dot-out' : 'cmp-dot'}"/>`).join('');
    const mark = g.marker === null ? '' : `<path d="M${g.marker} 4 l7 13 h-14z" class="cmp-marker"/><text x="${g.marker}" y="2" class="cmp-svg-label cmp-you" text-anchor="middle">you</text>`;
    return h('div', { class: 'cmp-strip-wrap', html: `<svg class="cmp-strip" id="cmp-strip" viewBox="-10 -10 580 100" role="img" aria-label="${esc(text)}">${band}${dots}${mark}</svg>` });
  }

  // ----- Data sharing (AC-4, AC-5, AC-8, AC-9) -----
  function renderShare() {
    share.replaceChildren();
    if (!native || !packsOn()) return;
    const card = h('section', { class: 'card cmp-card cmp-share', id: 'cmp-sharing', 'aria-label': 'Data sharing' }, h('h2', { class: 'card-title', text: 'Data sharing' }),
      h('p', { text: 'Packs contain only model, metric values and method versions. No serial numbers, names, dates or locations. Sharing is always manual and previewed first; nothing is sent over the network.' }),
      h('div', { class: 'cmp-actions' },
        h('button', { type: 'button', class: 'btn btn-secondary', id: 'cmp-export', html: `${icon('download', { size: 18 })} Share results anonymously…`, onclick: exportPack }),
        h('button', { type: 'button', class: 'btn btn-secondary', id: 'cmp-import', html: `${icon('upload', { size: 18 })} Import a pack…`, onclick: importPack }),
        h('button', { type: 'button', class: 'btn btn-ghost', id: 'cmp-reset-token', text: 'Reset my contributor token', onclick: resetToken })));
    if (st.packs.length) {
      const body = h('tbody');
      st.packs.forEach(p => body.append(h('tr', { 'data-pack': p.id }, h('td', { text: p.sourceLabel || p.id }), h('td', { class: 'r', text: String(p.rowCount) }), h('td', { text: when(p.importedAt) }),
        h('td', {}, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-remove': '', 'aria-label': `Remove pack ${p.sourceLabel || p.id}`, text: 'Remove', onclick: () => removePack(p) })))));
      card.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data cmp-table', id: 'cmp-packs' }, h('caption', { class: 'sr-only', text: 'Imported packs' }),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Pack' }), h('th', { scope: 'col', class: 'r', text: 'Rows' }), h('th', { scope: 'col', text: 'Imported' }), h('th', { scope: 'col', text: 'Actions' }))), body)));
    } else card.append(h('p', { class: 'muted', id: 'cmp-no-packs', text: 'No packs imported.' }));
    share.append(card);
  }

  function modal(build) {
    return new Promise(resolve => {
      const trigger = document.activeElement;
      const dlg = h('dialog', { class: 'data-dialog cmp-dialog' });
      const finish = value => { if (dlg.open) dlg.close(); resolve(value); };
      build(dlg, finish);
      dlg.addEventListener('close', () => { dlg.remove(); if (trigger?.isConnected) trigger.focus(); resolve(null); }, { once: true });
      dlg.addEventListener('cancel', () => resolve(null));
      document.body.append(dlg);
      dlg.showModal();
      dlg.querySelector('[data-initial]')?.focus();
    });
  }

  async function exportPack() {
    let cells;
    try { cells = exportRowsFromUnitValues(st.units, st.table ?? await api.metricTable()); } catch (e) { setStatus(`Could not prepare the export: ${friendly(e)}`, 'error'); return; }
    if (!cells.rows.length) { setStatus('There are no results that can be shared yet. Run a test on one of your units first.', 'warn'); return; }
    const appVersion = await getVersion();
    const first = !storageGet(EXPORTED_KEY, false); // first-time users start with nothing ticked
    const picked = new Set(first ? [] : cells.rows.keys());
    const meta = {};
    const saved = await modal((dlg, finish) => {
      dlg.setAttribute('aria-labelledby', 'cmp-exp-title');
      const list = h('div', { class: 'cmp-cells', role: 'group', 'aria-label': 'Results to share' });
      const pre = h('pre', { class: 'cmp-json', id: 'cmp-json', tabindex: '0', 'aria-label': 'Pack preview' });
      const err = h('p', { class: 'form-error', id: 'cmp-exp-error', role: 'alert' });
      const save = h('button', { type: 'button', class: 'btn btn-primary', id: 'cmp-exp-save', text: 'Save pack…' });
      const selected = () => cells.rows.filter((_, i) => picked.has(i));
      async function refresh() {
        const rows = selected();
        save.disabled = rows.length === 0; err.textContent = '';
        if (!rows.length) { pre.textContent = 'Nothing selected.'; return; }
        try {
          const pack = await api.buildPreview(rows, { appVersion, packId: meta.packId, createdMonth: meta.createdMonth });
          meta.packId = pack.packId; meta.createdMonth = pack.createdMonth; meta.contributor = pack.contributor;
          pre.textContent = JSON.stringify(pack, null, 2);
        } catch (e) { pre.textContent = ''; err.textContent = friendly(e); save.disabled = true; }
      }
      cells.rows.forEach((r, i) => {
        const id = `cmp-cell-${i}`;
        const box = h('input', { type: 'checkbox', id, checked: picked.has(i) ? true : null, onchange: () => { if (box.checked) picked.add(i); else picked.delete(i); refresh(); } });
        list.append(h('label', { class: 'cmp-cell', for: id }, box, h('span', { text: `${r.product}: ${defOf(r.metric)?.label ?? r.metric} ${fmt(r.value)} ${r.unit}${r.units > 1 ? ` (median of ${r.units} units)` : ''}` })));
      });
      save.addEventListener('click', async () => {
        save.disabled = true;
        try { finish(await api.savePack(selected(), { packId: meta.packId, createdMonth: meta.createdMonth, contributor: meta.contributor })); }
        catch (e) { err.textContent = friendly(e); if (e?.rows?.length) err.textContent += ` ${e.rows.map(r => `Row ${r.row}: ${r.reason}.`).join(' ')}`; save.disabled = false; }
      });
      dlg.append(h('div', { class: 'dialog-form' }, h('h2', { id: 'cmp-exp-title', text: 'Share results anonymously' }),
        h('p', { text: 'Choose what goes into the pack. Values are rounded to three significant figures. Several units of one model are combined into their median, so you count as one contributor.' }),
        st.unitsTruncated ? h('div', { class: 'banner banner-warn', id: 'cmp-exp-truncated' }, h('span', { class: 'banner-text', text: st.unitsTruncated })) : null,
        list, h('h3', { text: 'Exactly what the file contains' }), pre, err,
        h('div', { class: 'dialog-actions' }, h('button', { type: 'button', class: 'btn btn-secondary', 'data-initial': '', text: 'Cancel', onclick: () => finish(null) }), save)));
      refresh();
    });
    if (!saved) return;
    if (saved.cancelled) { setStatus('Export cancelled. Nothing was saved.'); return; }
    storageSet(EXPORTED_KEY, true);
    setStatus(`Saved ${saved.rows} result${saved.rows === 1 ? '' : 's'} (${saved.bytes} bytes, SHA-256 ${saved.sha256.slice(0, 12)}…).`);
    toast('Pack saved.', { type: 'success' });
  }

  async function importPack() {
    const triggerId = document.activeElement?.id || null;
    let path, preview;
    try {
      path = await api.pickPack();
      if (!path) return;
      preview = await api.preview(path);
    } catch (e) { setStatus(friendly(e), 'error', e?.rows ?? []); return; }
    const ok = await modal((dlg, finish) => {
      dlg.setAttribute('aria-labelledby', 'cmp-imp-title');
      const body = h('tbody');
      const { shown, more } = capPreview(preview.counts); // a hostile pack can name thousands of models: render a bounded table
      shown.forEach(c => body.append(h('tr', {}, h('td', { text: c.product }), h('td', { text: defOf(c.metric)?.label ?? c.metric }), h('td', { class: 'r', text: String(c.rows) }))));
      if (more) body.append(h('tr', { id: 'cmp-imp-more' }, h('td', { colspan: '3', class: 'muted', text: `…and ${more.toLocaleString('en')} more model/metric pair${more === 1 ? '' : 's'}.` })));
      const label = h('input', { type: 'text', id: 'cmp-imp-label', maxlength: '64', autocomplete: 'off' });
      dlg.append(h('div', { class: 'dialog-form' }, h('h2', { id: 'cmp-imp-title', text: 'Import a pack' }),
        h('p', { text: preview.alreadyImported ? 'This pack is already imported, so importing it again changes nothing.' : `${preview.rows} result${preview.rows === 1 ? '' : 's'} from pack ${preview.packId}, created ${preview.createdMonth} with DeckChek ${preview.appVersion}. Nothing is added until you confirm.` }),
        h('div', { class: 'table-wrap cmp-imp-wrap' }, h('table', { class: 'data cmp-table', id: 'cmp-imp-table' }, h('caption', { class: 'sr-only', text: 'Contents of the pack' }),
          h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Model' }), h('th', { scope: 'col', text: 'Metric' }), h('th', { scope: 'col', class: 'r', text: 'Rows' }))), body)),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'cmp-imp-label', text: 'Label for this pack (optional, stays on this computer)' }), label),
        h('div', { class: 'dialog-actions' }, h('button', { type: 'button', class: 'btn btn-secondary', 'data-initial': '', text: 'Cancel', onclick: () => finish(null) }),
          h('button', { type: 'button', class: 'btn btn-primary', id: 'cmp-imp-confirm', text: 'Import', onclick: () => finish({ label: label.value.trim() || null }) }))));
    });
    if (!ok) { setStatus('Import cancelled. Nothing was added.'); return; }
    try {
      const r = await api.import(path, ok.label);
      setStatus(r.duplicate ? 'That pack was already imported. Nothing changed.'
        : r.rejected.length ? `Imported ${r.accepted} result${r.accepted === 1 ? '' : 's'}; ${r.rejected.length} skipped.` : `Imported ${r.accepted} result${r.accepted === 1 ? '' : 's'}.`, r.rejected.length ? 'warn' : 'info', r.rejected);
      await load();
      // load() rebuilt the card that held the trigger; the inline button is gone once a pack exists
      focusFirst(triggerId && `#${CSS.escape(triggerId)}`, '#cmp-import');
    } catch (e) { setStatus(friendly(e), 'error', e?.rows ?? []); }
  }

  async function removePack(p) {
    const index = st.packs.findIndex(x => x.id === p.id);
    try {
      const r = await api.remove(p.id);
      setStatus(r.removed ? `Removed ${p.sourceLabel || p.id}. Percentiles were recomputed.` : 'That pack was already gone.');
      await load();
      // focus the Remove button now in the same row (the next pack), else the previous one, else Import
      const buttons = [...section.querySelectorAll('#cmp-packs [data-remove]')];
      const next = buttons[Math.min(Math.max(index, 0), buttons.length - 1)];
      if (next) next.focus(); else focusFirst('#cmp-import');
    } catch (e) { setStatus(friendly(e), 'error'); }
  }
  async function resetToken() {
    try { await api.contributor({ reset: true }); setStatus('Contributor token reset. Packs you export from now on cannot be linked to earlier ones.'); }
    catch (e) { setStatus(friendly(e), 'error'); }
  }

  // ----- events -----
  assetSel.addEventListener('change', () => { st.assetId = assetSel.value; if (!metricsOf(st.assetId).includes(st.metric)) st.metric = metricsOf(st.assetId)[0] ?? null; st.pop = null; render(); });
  metricSel.addEventListener('change', () => { st.metric = metricSel.value; st.pop = null; renderPanel(); });
  const offFlag = onFeatureChange(({ name }) => { if (name === 'packs' || name === 'population') load(); });

  render();
  return {
    onShow() {
      const hand = takeHandoff('compare'); // a deep link names the unit and metric to open
      if (hand?.assetId) { st.assetId = hand.assetId; if (hand.metric) st.metric = hand.metric; st.tab = 'spec'; }
      load();
    },
    onHide() { /* keep state */ },
    onEscape() { return false; },
    reload: load,
    destroy() { offFlag?.(); },
  };
}

let shortcutInstalled = false;

/** Rail entry for the app shell; it follows features.population live. Also installs the "C" shortcut (spec section 3). */
export function compareScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-compare')) main.append(h('section', { class: 'screen', id: 'screen-compare', hidden: true }));
  if (!shortcutInstalled) {
    shortcutInstalled = true;
    document.addEventListener('keydown', event => {
      if (!isEnabled('population')) return;
      const params = compareShortcutParams(event);
      if (!params) return;
      event.preventDefault();
      openCompare(params);
    });
  }
  return [{ id: 'compare', title: 'Compare', short: 'Compare', icon: 'compare', feature: 'population', create: createCompareScreen }];
}
