// Stylus wear screen (FS-12): per-cartridge wear page with a life gauge, the hours ledger (manual, DJ-log
// proposals), benchmark entry, trend charts with regression and limit bands, and settings. Everything
// numeric comes from stylus-wear.js / usage-hours.js; this file is layout, forms and inline-SVG charts.
// Flag: features.stylusWear (rail entry only while it is on). Desktop only: the hours ledger and benchmarks
// live in the database, so browser mode shows an explanatory "unsupported" state.

import { h, esc, formatDate, isNative, storageGet, storageSet, externalLink } from '../dom.js';
import { icon, chip } from '../icons.js';
import { announce, toast } from '../live.js';
import { go, confirmDialog } from '../shell.js';
import { store } from '../state.js';
import { isEnabled, onFeatureChange } from '../../features.js';
import {
  createStylusApi, migrateLife, resolveRatedHours, replacementBaseline, hoursSinceInstall, lifeStatus, projectReplaceDate,
  usageRatePerDay, proposeFromLogs, regress, validBenchmarks, benchmarkBaseline, benchmarkVerdict, normalizeBenchmark,
  limitValue, stylusAlerts, timecodeBenchmarkFromRuns, snoozeUntil, METRICS, DEFAULT_THRESHOLDS, SNOOZE_DAYS, MIN_TREND_POINTS, GENERIC_RATED_HOURS,
} from '../../stylus-wear.js';
import { createUsageApi, MAX_ENTRY_HOURS, totalHours } from '../../usage-hours.js';
import { takeHandoff, ACTIVE_CARTRIDGE_KEY } from '../crosslinks.js';

const THRESHOLD_KEY = 'deckchek.stylus.thresholds.v1';
const TABS = [['overview', 'Overview'], ['hours', 'Hours'], ['benchmark', 'Benchmark'], ['trends', 'Trends'], ['settings', 'Settings']];
const SOURCE_LABEL = { manual: 'Manual', djlog: 'DJ log', deckchek: 'DeckChek', import: 'Import' };
const SEVERITY_CHIP = { red: 'fail', amber: 'warn', info: 'info' };
const CONFIDENCE_LABEL = { 'vendor-general': 'Vendor, general', forum: 'Forum evidence', retailer: 'Retailer claim', unknown: 'Unknown' };
const CHART_METRICS = ['thdPercent', 'separationDb', 'tcSnrDb', 'tcPhaseErrorDeg'];
const METRIC_DIGITS = { thdPercent: 2, separationDb: 1, tcSnrDb: 1, tcPhaseErrorDeg: 1 };

const pad = n => String(n).padStart(2, '0');
const fmt = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)).toString() : '—');
export const monthOf = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
const localInput = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const whenText = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso ?? '') : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** Hours for headline use: one decimal below 10 h so a new stylus does not read as a rounded 2 h. */
export const fmtHours = v => (Number.isFinite(v) && v < 10 ? fmt(v, 1) : fmt(v, 0));
const friendly = e => (typeof e === 'string' ? e : e?.message || 'Something went wrong.');

// ------------------------------------------------------------------ pure helpers (unit tested)

/** Gauge ring geometry. The arc fills to 100 % and stops there; `over` marks use past the rated life. */
export function ringGeometry(pct, r = 54) {
  const circumference = 2 * Math.PI * r;
  const p = Number.isFinite(pct) ? Math.max(0, pct) : 0;
  const filled = Math.min(p, 100) / 100;
  return { r, circumference, dash: filled * circumference, gap: circumference - filled * circumference, over: p > 100 };
}

/** "Concorde Pro S: about 410 of 600 h (68 %). Replace around 2027-03 at current use." */
export function summaryLine({ name, hours, ratedHours, pct, projection }) {
  const base = `${name}: about ${fmtHours(hours)} of ${fmt(ratedHours, 0)} h (${Math.round(pct)} %).`;
  if (projection?.reason === 'due') return `${base} Replace or inspect now.`;
  if (projection?.date) return `${base} Replace around ${monthOf(projection.date)} at current use.`;
  return `${base} No recent use, so no replace date can be projected.`;
}

/** Highest-severity alert level that is not snoozed: 'red' | 'amber' | null (for the rail badge). */
export function railBadgeLevel(alerts) {
  const live = (alerts || []).filter(a => !a.snoozed);
  if (live.some(a => a.severity === 'red')) return 'red';
  if (live.some(a => a.severity === 'amber')) return 'amber';
  return null;
}

/** Take benchmark values from Cartridge / Channel separation / dropout measurements of saved runs. */
export function benchmarkFromRuns(runs) {
  const out = {};
  const get = (run, id) => (run?.measurements || []).find(m => m.metricId === id && Number.isFinite(m.value))?.value;
  for (const run of runs || []) {
    if (!run) continue;
    const l = get(run, 'left_thd_percent'), r = get(run, 'right_thd_percent');
    if (out.thdPercent === undefined && l !== undefined && r !== undefined) { out.thdPercent = (l + r) / 2; out.thdRun = run.id; }
    const s = get(run, 'channel_separation_db');
    if (out.separationDb === undefined && s !== undefined) { out.separationDb = s; out.separationRun = run.id; }
    const d = get(run, 'dropout_count');
    if (out.tcDropouts === undefined && d !== undefined && /dvs/i.test(run.test || run.sessionType || '')) { out.tcDropouts = d; out.dropoutRun = run.id; }
  }
  return out;
}

function niceTicks(lo, hi, count = 5) {
  const span = hi - lo || 1;
  const raw = span / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const first = Math.ceil(lo / step - 1e-9) * step;
  const out = [];
  for (let v = first; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

const CH = { W: 360, H: 216, l: 44, r: 12, t: 18, b: 38 };

/**
 * Geometry for one small-multiple chart. `rows` are normalised benchmarks; invalid ones are drawn hollow and
 * excluded from the fit. The limit band is the region beyond the degradation limit versus the baseline.
 */
export function chartModel(metric, rows, { fit = null, baseline = null } = {}) {
  const info = METRICS[metric];
  const pts = rows.filter(b => Number.isFinite(b[metric]) && Number.isFinite(b.hoursAt)).map(b => ({ id: b.id, x: b.hoursAt, y: b[metric], valid: b.valid, createdAt: b.createdAt }));
  if (!pts.length) return null;
  const limit = baseline !== null && baseline !== undefined ? limitValue(metric, baseline) : null;
  const xs = pts.map(p => p.x);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x1 - x0 < 1) { x0 -= 0.5; x1 += 0.5; }
  const xPad = (x1 - x0) * 0.06;
  x0 = Math.max(0, x0 - xPad); x1 += xPad;
  const ys = pts.map(p => p.y);
  if (Number.isFinite(limit)) ys.push(limit);
  if (fit?.enough) { ys.push(fit.intercept + fit.slope * x0, fit.intercept + fit.slope * x1); }
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y1 - y0 < 1e-6) { y0 -= 0.5; y1 += 0.5; }
  const yPad = (y1 - y0) * 0.1;
  y0 -= yPad; y1 += yPad;
  const sx = v => CH.l + ((v - x0) / (x1 - x0)) * (CH.W - CH.l - CH.r);
  const sy = v => CH.H - CH.b - ((v - y0) / (y1 - y0)) * (CH.H - CH.t - CH.b);
  const clampY = v => Math.min(CH.H - CH.b, Math.max(CH.t, sy(v)));
  const worseUp = info.worse === 'up';
  return {
    metric, info, sx, sy,
    pts: pts.map(p => ({ ...p, cx: sx(p.x), cy: sy(p.y) })),
    xTicks: niceTicks(x0, x1, 5).filter(v => v >= x0 && v <= x1),
    yTicks: niceTicks(y0, y1, 5).filter(v => v >= y0 && v <= y1),
    line: fit?.enough ? { x1: sx(x0), y1: clampY(fit.intercept + fit.slope * x0), x2: sx(x1), y2: clampY(fit.intercept + fit.slope * x1) } : null,
    limit: Number.isFinite(limit) && limit >= y0 && limit <= y1
      ? { value: limit, y: sy(limit), bandTop: worseUp ? CH.t : sy(limit), bandBottom: worseUp ? sy(limit) : CH.H - CH.b }
      : null,
  };
}

function chartSvg(model, title) {
  const { info, metric } = model;
  const d = METRIC_DIGITS[metric];
  const grid = model.yTicks.map(v => `<line class="sty-grid" x1="${CH.l}" x2="${CH.W - CH.r}" y1="${model.sy(v).toFixed(1)}" y2="${model.sy(v).toFixed(1)}"/><text class="sty-tick" x="${CH.l - 6}" y="${(model.sy(v) + 4).toFixed(1)}" text-anchor="end">${fmt(v, d)}</text>`).join('');
  const xt = model.xTicks.map(v => `<text class="sty-tick" x="${model.sx(v).toFixed(1)}" y="${CH.H - CH.b + 16}" text-anchor="middle">${fmt(v, 0)}</text>`).join('');
  const band = model.limit
    ? `<rect class="sty-band" x="${CH.l}" y="${model.limit.bandTop.toFixed(1)}" width="${CH.W - CH.l - CH.r}" height="${Math.max(0, model.limit.bandBottom - model.limit.bandTop).toFixed(1)}"/>
       <line class="sty-limit" x1="${CH.l}" x2="${CH.W - CH.r}" y1="${model.limit.y.toFixed(1)}" y2="${model.limit.y.toFixed(1)}"/>
       <text class="sty-limit-label" x="${CH.W - CH.r - 4}" y="${(model.limit.y + (info.worse === 'up' ? 13 : -5)).toFixed(1)}" text-anchor="end">Limit ${fmt(model.limit.value, d)} ${esc(info.unit)}</text>`
    : '';
  const line = model.line ? `<line class="sty-fit" x1="${model.line.x1.toFixed(1)}" y1="${model.line.y1.toFixed(1)}" x2="${model.line.x2.toFixed(1)}" y2="${model.line.y2.toFixed(1)}"/>` : '';
  const dots = model.pts.map((p, i) => `<g class="sty-point${p.valid ? '' : ' sty-point-invalid'}" tabindex="0" role="button" data-point="${esc(p.id ?? i)}" aria-label="${esc(`${info.label} ${fmt(p.y, d)} ${info.unit} at ${fmt(p.x, 1)} hours${p.valid ? '' : ' (excluded from the trend)'}`)}">
      <circle class="sty-hit" cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="14"/>${p.valid
    ? `<circle class="sty-dot" cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="5"/>`
    : `<rect class="sty-dot-x" x="${(p.cx - 5).toFixed(1)}" y="${(p.cy - 5).toFixed(1)}" width="10" height="10" transform="rotate(45 ${p.cx.toFixed(1)} ${p.cy.toFixed(1)})"/>`}</g>`).join('');
  return `<svg class="sty-chart" viewBox="0 0 ${CH.W} ${CH.H}" role="img" aria-label="${esc(title)}" preserveAspectRatio="xMidYMid meet">
    <title>${esc(title)}</title>${band}${grid}
    <line class="sty-axis" x1="${CH.l}" x2="${CH.W - CH.r}" y1="${CH.H - CH.b}" y2="${CH.H - CH.b}"/>${xt}
    <text class="sty-axis-label" x="${(CH.l + CH.W - CH.r) / 2}" y="${CH.H - 6}" text-anchor="middle">Hours at benchmark</text>
    <text class="sty-axis-label" x="4" y="12">${esc(info.unit)}</text>${line}${dots}</svg>`;
}

// ------------------------------------------------------------------ catalogue + thresholds

let lifeCatalogue;
export async function loadCatalogue() {
  if (lifeCatalogue !== undefined) return lifeCatalogue;
  try {
    const res = await fetch(new URL('../../devices/stylus-life.json', import.meta.url), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    lifeCatalogue = migrateLife(await res.json());
  } catch { lifeCatalogue = null; }
  return lifeCatalogue;
}

export function loadThresholds() {
  const t = storageGet(THRESHOLD_KEY, null);
  const amber = Number(t?.amberPct), red = Number(t?.redPct);
  return amber > 0 && red > amber && red <= 500 ? { amberPct: amber, redPct: red } : { ...DEFAULT_THRESHOLDS };
}

const CATEGORIES = new Set(['cartridge', 'stylus']);

/** Cartridge / stylus assets, newest first by name. Falls back to assets whose nickname mentions a cartridge. */
export async function listStylusAssets() {
  const [assets, products] = await Promise.all([store.list('asset'), store.list('product')]);
  const byId = new Map(products.map(p => [p.id, p]));
  const modelOf = a => { const p = byId.get(a.productId); return p ? [p.model, p.variant].filter(Boolean).join(' ') : ''; };
  return assets
    .filter(a => !a.isDeleted && CATEGORIES.has(byId.get(a.productId)?.category))
    .map(a => ({ id: a.id, name: a.nickname || modelOf(a) || 'Cartridge', modelText: `${modelOf(a)} ${a.nickname || ''}`.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Everything the page needs for one asset. */
export async function loadAssetState(asset, { api, usage, catalogue }) {
  const [entries, baseline, benchmarks, snoozes, assetRated] = await Promise.all([
    usage.list(asset.id), api.baseline(asset.id), api.benchmarkList(asset.id), api.alertList(asset.id), api.ratedLifeGet(asset.id),
  ]);
  const events = baseline ? [{ eventType: 'stylus_replaced', eventAt: baseline }] : [];
  const rated = resolveRatedHours({ assetRatedHours: assetRated, catalogue, modelText: asset.modelText });
  const thresholds = loadThresholds();
  const hours = hoursSinceInstall(entries, events);
  const life = lifeStatus(hours, rated.hours, thresholds);
  const projection = projectReplaceDate(entries, rated.hours, { events });
  const rows = benchmarks.map(normalizeBenchmark);
  const verdict = benchmarkVerdict(benchmarks);
  const alerts = stylusAlerts({ hours, ratedHours: rated.hours, history: benchmarks, snoozes, thresholds });
  return { asset, entries, baseline, events, benchmarks, rows, snoozes, rated, assetRated, hours, life, projection, verdict, alerts, thresholds, ratePerDay: usageRatePerDay(entries, { since: baseline }) };
}

// ------------------------------------------------------------------ rail badge

let badgeState = { level: null };
function paintRailBadge() {
  const item = document.querySelector('.rail-item[data-screen="stylus"]');
  if (!item) return;
  item.querySelector('.rail-badge')?.remove();
  if (!badgeState.level) return;
  const label = badgeState.level === 'red' ? 'Stylus: replace or inspect' : 'Stylus: nearing rated life';
  item.append(h('span', { class: `rail-badge rail-badge-${badgeState.level}`, role: 'img', 'aria-label': label, title: label, text: '!' }));
}
async function refreshRailBadge(ctx = {}) {
  try {
    const api = ctx.api || createStylusApi(), usage = ctx.usage || createUsageApi();
    if (!api.native) return;
    const catalogue = await loadCatalogue();
    let level = null;
    for (const a of await listStylusAssets()) {
      const st = await loadAssetState(a, { api, usage, catalogue });
      const l = railBadgeLevel(st.alerts);
      if (l === 'red') { level = 'red'; break; }
      if (l === 'amber') level = 'amber';
    }
    badgeState = { level };
    paintRailBadge();
  } catch { /* the badge is a convenience; the page shows the real error */ }
}

// ------------------------------------------------------------------ screen

export function createStylusScreen(section, { api = createStylusApi(), usage = createUsageApi() } = {}) {
  const native = isNative() && api.native;
  const st = { assets: [], assetId: null, data: null, tab: 'overview', loading: false, error: null, proposals: null, proposalNote: '', pointId: null, showTable: {}, hoursError: '', benchError: '', benchFill: null };

  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('cartridge', { size: 24 })}</span><div><h1 tabindex="-1">Stylus wear</h1>
      <p class="lede">Hours on each cartridge, benchmark trends and a replacement estimate. Hours are a guide, not proof of wear: the benchmarks show what the stylus actually does.</p></div></div>
      <div class="sty-picker field"><label class="field-label" for="sty-asset">Cartridge</label><select id="sty-asset"></select></div></header>
    <div id="sty-status" class="sty-status" role="status" aria-live="polite"></div>
    <div class="tabs" role="tablist" aria-label="Stylus wear sections" id="sty-tabs"></div>
    <div id="sty-panel" class="sty-panel" role="tabpanel" tabindex="-1"></div>`;
  const q = s => section.querySelector(s);
  const panel = q('#sty-panel'), tabs = q('#sty-tabs'), picker = q('#sty-asset'), status = q('#sty-status');

  const setStatus = (text, kind = 'info') => {
    status.replaceChildren();
    if (!text) return;
    status.append(h('div', { class: `banner banner-${kind === 'error' ? 'fail' : kind === 'warn' ? 'warn' : 'info'}`, role: kind === 'error' ? 'alert' : null }, h('span', { class: 'banner-text', text })));
    announce(text, { assertive: kind === 'error' });
  };

  // ----- data -----
  async function load({ keepTab = true } = {}) {
    if (!native) { render(); return; }
    st.loading = true; st.error = null; render();
    try {
      const catalogue = await loadCatalogue();
      st.assets = await listStylusAssets();
      if (!st.assetId) st.assetId = storageGet(ACTIVE_CARTRIDGE_KEY, null);
      if (!st.assets.some(a => a.id === st.assetId)) st.assetId = st.assets[0]?.id ?? null;
      if (st.assetId) storageSet(ACTIVE_CARTRIDGE_KEY, st.assetId);
      st.data = st.assetId ? await loadAssetState(st.assets.find(a => a.id === st.assetId), { api, usage, catalogue }) : null;
      if (!keepTab) st.tab = 'overview';
      badgeState = { level: st.data ? badgeLevelWith(st.data) : badgeState.level };
      paintRailBadge();
    } catch (e) { st.error = friendly(e); st.data = null; }
    st.loading = false;
    render();
  }
  const badgeLevelWith = d => railBadgeLevel(d.alerts) ?? badgeState.level;

  async function act(fn, okText) {
    try { await fn(); if (okText) { setStatus(okText, 'info'); } await load(); refreshRailBadge({ api, usage }); }
    catch (e) { setStatus(friendly(e), 'error'); }
  }

  // ----- rendering -----
  function renderTabs() {
    tabs.replaceChildren(...TABS.map(([id, label]) => h('button', {
      type: 'button', class: 'tab', role: 'tab', id: `sty-tab-${id}`, 'aria-selected': String(st.tab === id), 'aria-controls': 'sty-panel', tabindex: st.tab === id ? '0' : '-1', 'data-tab': id,
      text: label, onclick: () => selectTab(id),
      onkeydown: e => {
        const i = TABS.findIndex(([t]) => t === st.tab);
        const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
        if (next < 0) return;
        e.preventDefault(); selectTab(TABS[next][0], { focusTab: true });
      },
    })));
    panel.setAttribute('aria-labelledby', `sty-tab-${st.tab}`);
  }
  function selectTab(id, { focusTab = false } = {}) {
    st.tab = id; renderTabs(); renderPanel();
    if (focusTab) q(`#sty-tab-${id}`)?.focus();
  }

  function render() {
    picker.replaceChildren(...st.assets.map(a => h('option', { value: a.id, text: a.name, selected: a.id === st.assetId ? true : null })));
    q('.sty-picker').hidden = !(native && st.assets.length > 1);
    renderTabs();
    renderPanel();
  }

  function emptyBlock(title, body, actions = []) {
    return h('div', { class: 'empty card' }, h('span', { class: 'empty-icon', html: icon('cartridge', { size: 36 }) }), h('h2', { text: title }), h('p', { text: body }), actions.length ? h('div', { class: 'sty-actions' }, ...actions) : null);
  }

  function renderPanel() {
    panel.replaceChildren();
    q('#sty-tabs').hidden = !(native && st.data);
    if (!native) {
      panel.append(emptyBlock('Stylus wear needs the desktop app', 'Hours and benchmarks are stored in DeckChek’s local database, which the browser preview does not have. Open the desktop app to track a cartridge.'));
      panel.firstChild.id = 'sty-unsupported';
      return;
    }
    if (st.loading && !st.data) { panel.append(h('p', { class: 'muted', text: 'Loading…' })); return; }
    if (st.error) {
      panel.append(h('div', { class: 'banner banner-fail', role: 'alert' }, h('span', { class: 'banner-text', text: `Could not load stylus data: ${st.error}` }), h('div', { class: 'banner-actions' }, h('button', { type: 'button', class: 'btn btn-secondary', text: 'Try again', onclick: () => load() }))));
      return;
    }
    if (!st.data) {
      panel.append(emptyBlock('Add your cartridge to start tracking', 'Add a cartridge or stylus in Equipment, then come back here to log hours and run benchmarks.', [h('button', { type: 'button', class: 'btn btn-primary', id: 'sty-go-equipment', text: 'Open Equipment', onclick: () => go('equipment', { focus: true }) })]));
      return;
    }
    ({ overview: renderOverview, hours: renderHours, benchmark: renderBenchmark, trends: renderTrends, settings: renderSettings })[st.tab](st.data);
  }

  // ----- overview -----
  function gaugeSvg(d) {
    const g = ringGeometry(d.life.pct);
    const tone = d.life.status === 'red' ? 'fail' : d.life.status === 'amber' ? 'warn' : 'pass';
    return `<svg class="sty-gauge" viewBox="0 0 140 140" role="img" aria-label="${esc(`${fmtHours(d.hours)} of ${fmt(d.life.ratedHours, 0)} hours, ${Math.round(d.life.pct)} percent of rated life`)}">
      <circle class="sty-ring-track" cx="70" cy="70" r="${g.r}"/>
      <circle class="sty-ring sty-ring-${tone}" cx="70" cy="70" r="${g.r}" stroke-dasharray="${g.dash.toFixed(2)} ${g.gap.toFixed(2)}" transform="rotate(-90 70 70)"/>
      <text class="sty-gauge-num" x="70" y="68" text-anchor="middle">${esc(fmtHours(d.hours))}</text>
      <text class="sty-gauge-unit" x="70" y="86" text-anchor="middle">of ${esc(fmt(d.life.ratedHours, 0))} h</text>
      <text class="sty-gauge-pct" x="70" y="104" text-anchor="middle">${Math.round(d.life.pct)} %</text></svg>`;
  }

  function renderOverview(d) {
    const lastBench = validBenchmarks(d.benchmarks).at(-1);
    const tone = d.life.status === 'red' ? 'fail' : d.life.status === 'amber' ? 'warn' : 'pass';
    const proj = d.projection;
    const projText = proj.reason === 'due' ? 'Due now' : proj.date ? monthOf(proj.date) : 'Not enough recent use';
    const wrap = h('div', { class: 'sty-overview' });
    const gauge = h('section', { class: 'card sty-gauge-card', 'aria-label': 'Life used' });
    gauge.append(h('div', { class: 'sty-gauge-wrap', html: gaugeSvg(d) }));
    const dl = h('dl', { class: 'sty-facts' });
    const fact = (k, v, id) => { dl.append(h('div', {}, h('dt', { text: k }), h('dd', { id, text: v }))); };
    fact('Hours since install', `${fmt(d.hours, 1)} h`, 'sty-hours-total');
    fact('Rated life', `${fmt(d.life.ratedHours, 0)} h${d.rated.generic ? ' (generic estimate)' : ''}`);
    fact('Used', `${Math.round(d.life.pct)} %`);
    fact('Replace around', projText, 'sty-projection');
    fact('Last benchmark', lastBench ? `${formatDate(lastBench.createdAt)} · ${fmt(lastBench.hoursAt, 0)} h` : 'None yet');
    gauge.append(h('div', { class: 'sty-gauge-side' },
      h('div', { class: 'sty-chip', html: chip(tone, d.life.label, { size: 16 }) }), dl,
      h('p', { class: 'sty-summary', id: 'sty-summary', text: summaryLine({ name: d.asset.name, hours: d.hours, ratedHours: d.life.ratedHours, pct: d.life.pct, projection: proj }) })));
    wrap.append(gauge);
    if (d.rated.generic) wrap.append(h('p', { class: 'banner banner-info sty-note' }, h('span', { class: 'banner-text', text: `Rated life unknown - using generic ${GENERIC_RATED_HOURS} h DJ estimate. Set your own figure in Settings.` })));
    wrap.append(alertsCard(d));
    wrap.append(h('div', { class: 'sty-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', id: 'sty-add-hours', 'aria-keyshortcuts': 'A', html: `${icon('plus', { size: 18 })}<span>Add hours <kbd>A</kbd></span>`, onclick: () => selectTab('hours') }),
      h('button', { type: 'button', class: 'btn btn-secondary', id: 'sty-run-benchmark', 'aria-keyshortcuts': 'B', html: `${icon('cartridge', { size: 18 })}<span>Benchmark <kbd>B</kbd></span>`, onclick: () => selectTab('benchmark') }),
      h('button', { type: 'button', class: 'btn btn-secondary', id: 'sty-replaced', text: 'I replaced the stylus', onclick: markReplaced })));
    panel.append(wrap);
  }

  function alertsCard(d) {
    const card = h('section', { class: 'card sty-alerts', 'aria-label': 'Alerts' }, h('div', { class: 'card-head' }, h('h2', { class: 'card-title', text: 'Alerts' })));
    if (!d.alerts.length) { card.append(h('p', { class: 'muted', id: 'sty-no-alerts', text: 'No alerts. Hours are within the rated life and no benchmark has crossed a limit.' })); return card; }
    const list = h('ul', { class: 'sty-alert-list' });
    for (const a of d.alerts) {
      const snooze = d.snoozes.filter(s => s.kind === a.kind).sort((x, y) => String(y.snoozedUntil).localeCompare(String(x.snoozedUntil)))[0];
      const row = h('li', { class: `sty-alert${a.snoozed ? ' sty-alert-snoozed' : ''}`, 'data-kind': a.kind },
        h('span', { class: 'sty-alert-chip', html: chip(SEVERITY_CHIP[a.severity] || 'info', a.severity === 'red' ? 'Replace' : a.severity === 'amber' ? 'Inspect' : 'Check', { size: 14 }) }),
        h('span', { class: 'sty-alert-msg', text: a.kind === 'life' && a.severity === 'red' ? `Replace or inspect: ${fmt(d.life.pct, 0)} % of rated life used.` : a.message }));
      if (a.snoozed) row.append(h('span', { class: 'muted sty-alert-until', text: `Snoozed until ${formatDate(snooze?.snoozedUntil)}` }));
      else row.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-snooze': a.kind, text: `Snooze ${SNOOZE_DAYS} days`, onclick: () => act(() => api.alertSnooze(d.asset.id, a.kind, snoozeUntil()), `Alert snoozed for ${SNOOZE_DAYS} days.`) }));
      if (a.kind === 'bench:jump') row.append(h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Mark as replaced', onclick: markReplaced }));
      list.append(row);
    }
    card.append(list);
    return card;
  }

  async function markReplaced() {
    const d = st.data; if (!d) return;
    const ok = await confirmDialog({ title: 'Mark stylus as replaced?', body: 'Hours counting restarts from now and the benchmark baseline resets. Your hours and benchmark history stay on record.', confirmLabel: 'Mark replaced', danger: false });
    if (!ok) return;
    await act(() => api.replace(d.asset.id, new Date().toISOString(), null), 'Marked as replaced. Hours start again from zero.');
  }

  // ----- hours -----
  function renderHours(d) {
    const form = h('form', { class: 'card sty-form', id: 'sty-hours-form', novalidate: true });
    const when = h('input', { type: 'datetime-local', id: 'sty-when', value: localInput(Date.now()), required: true });
    const hours = h('input', { type: 'number', id: 'sty-hours', min: '0.01', max: String(MAX_ENTRY_HOURS), step: '0.01', inputmode: 'decimal', placeholder: 'e.g. 2.5', required: true, 'aria-describedby': 'sty-hours-help sty-hours-error' });
    const note = h('input', { type: 'text', id: 'sty-note', maxlength: '200', placeholder: 'Optional' });
    const err = h('p', { class: 'form-error', id: 'sty-hours-error', role: 'alert', text: st.hoursError });
    form.append(h('h2', { class: 'card-title', text: 'Add hours' }),
      h('div', { class: 'field-grid' },
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'sty-when', text: 'Started' }), when),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'sty-hours', text: 'Hours played' }), hours, h('span', { class: 'field-help', id: 'sty-hours-help', text: `Between 0 and ${MAX_ENTRY_HOURS} per entry.` })),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'sty-note', text: 'Note' }), note)),
      err,
      h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn btn-primary', id: 'sty-hours-add', text: 'Add hours' })));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const n = Number(hours.value), at = new Date(when.value);
      let msg = '';
      if (!hours.value.trim() || !Number.isFinite(n) || n <= 0 || n > MAX_ENTRY_HOURS) msg = `Enter hours above 0 and at most ${MAX_ENTRY_HOURS}.`;
      else if (Number.isNaN(at.getTime())) msg = 'Enter when this session started.';
      if (msg) { st.hoursError = msg; err.textContent = msg; hours.setAttribute('aria-invalid', 'true'); hours.focus(); return; }
      st.hoursError = '';
      try {
        await usage.add({ assetId: d.asset.id, kind: 'play', startedAt: at.toISOString(), hours: n, source: 'manual', note: note.value.trim() || null, confirmed: true });
        setStatus(`Added ${fmt(n, 2)} h.`, 'info');
        await load(); refreshRailBadge({ api, usage });
        q('#sty-hours')?.focus();
      } catch (e2) { st.hoursError = friendly(e2); err.textContent = st.hoursError; }
    });
    const wrap = h('div', { class: 'sty-hours' }, form);

    // proposed hours from DJ software logs
    const prop = h('section', { class: 'card', 'aria-label': 'Proposed hours' }, h('div', { class: 'card-head' }, h('h2', { class: 'card-title', text: 'Proposed from DJ software' }),
      h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'sty-find', text: 'Find sessions', onclick: () => findProposals(d) })));
    if (st.proposals === null) prop.append(h('p', { class: 'muted', text: 'DeckChek can read when Serato, Traktor, rekordbox or VirtualDJ ran and propose hours. Nothing counts until you confirm it. Only timestamps are read.' }));
    else if (!st.proposals.length) prop.append(h('p', { class: 'muted', id: 'sty-no-proposals', text: st.proposalNote || 'No new sessions found.' }));
    else {
      const ul = h('ul', { class: 'sty-proposals', id: 'sty-proposals' });
      st.proposals.forEach((p, i) => {
        const input = h('input', { type: 'number', min: '0.01', max: String(MAX_ENTRY_HOURS), step: '0.01', value: String(Number(p.hours.toFixed(2))), 'aria-label': `Hours for the ${p.note || 'DJ'} session on ${whenText(p.startedAt)}`, class: 'sty-prop-hours' });
        ul.append(h('li', { class: 'sty-proposal' },
          h('span', { class: 'sty-prop-main' }, h('strong', { text: p.note || (p.source === 'djlog' ? 'DJ software' : 'DeckChek capture') }), h('span', { class: 'muted', text: ` ${whenText(p.startedAt)}${p.capped ? ' (capped)' : ''}` })),
          input,
          h('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-confirm': String(i), text: 'Confirm', onclick: async () => {
            const n = Number(input.value);
            if (!Number.isFinite(n) || n <= 0 || n > MAX_ENTRY_HOURS) { input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
            st.proposals = st.proposals.filter((_, j) => j !== i);
            await act(() => usage.add({ assetId: d.asset.id, kind: 'play', startedAt: p.startedAt, hours: n, source: p.source || 'djlog', sessionId: p.sessionId ?? null, note: p.note ?? null, confirmed: true }), `Confirmed ${fmt(n, 2)} h from ${p.note || (p.source === 'djlog' ? 'DJ software' : 'a DeckChek capture')}.`);
          } }),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Dismiss', onclick: () => { st.proposals = st.proposals.filter((_, j) => j !== i); renderPanel(); } })));
      });
      prop.append(ul);
    }
    wrap.append(prop);

    // ledger
    const ledger = h('section', { class: 'card', 'aria-label': 'Hours ledger' }, h('div', { class: 'card-head' }, h('h2', { class: 'card-title', text: 'Hours ledger' }),
      h('span', { class: 'muted', text: `${fmt(totalHours(d.entries), 2)} h confirmed in total · ${fmt(d.hours, 2)} h since install` })));
    const rows = [...d.entries].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    if (!rows.length) ledger.append(h('p', { class: 'muted', id: 'sty-no-hours', text: 'No hours yet. Add what you remember, newest sessions matter most.' }));
    else {
      const baseMs = d.baseline ? Date.parse(d.baseline) : -Infinity;
      const body = h('tbody');
      for (const e of rows) {
        const before = Date.parse(e.startedAt) < baseMs;
        body.append(h('tr', { 'data-entry': e.id },
          h('td', { text: whenText(e.startedAt) }), h('td', { class: 'r', text: fmt(e.hours, 2) }),
          h('td', { text: SOURCE_LABEL[e.source] || e.source }),
          h('td', { text: e.confirmed === false || e.confirmed === 0 ? 'Proposed' : before ? 'Before replacement' : 'Counts' }),
          h('td', { text: e.note || '' }),
          h('td', { class: 'r' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-danger-ghost', 'aria-label': `Delete ${fmt(e.hours, 2)} hours from ${whenText(e.startedAt)}`, html: icon('trash', { size: 16 }), onclick: async () => {
            if (await confirmDialog({ title: 'Delete this entry?', body: `${fmt(e.hours, 2)} h from ${whenText(e.startedAt)} will be removed from the ledger.`, confirmLabel: 'Delete' })) await act(() => usage.delete(e.id), 'Entry deleted.');
          } }))));
      }
      ledger.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data sty-table', id: 'sty-ledger' }, h('caption', { class: 'sr-only', text: 'Hours ledger' }),
        h('thead', {}, h('tr', {}, ...['Started', 'Hours', 'Source', 'Status', 'Note', ''].map((t, i) => h('th', { scope: 'col', class: i === 1 || i === 5 ? 'r' : '', text: t })))), body)));
    }
    wrap.append(ledger);
    panel.append(wrap);
  }

  async function findProposals(d) {
    try {
      // DeckChek's own live captures (real spans, AC-2) first, then DJ software logs (AC-3, best effort).
      const captured = await api.captureProposals(d.asset.id, { since: d.baseline, existing: d.entries }).catch(() => []);
      const spans = await api.djSessionSpans().catch(() => []);
      st.proposals = [...captured, ...proposeFromLogs(spans, d.asset.id, { existing: d.entries })];
      st.proposalNote = captured.length || spans?.length ? 'No new sessions found: everything DeckChek captured or the logs show is already in the ledger or too short.' : 'No DeckChek captures or DJ software sessions were found.';
      announce(st.proposals.length ? `${st.proposals.length} proposed session(s)` : st.proposalNote);
    } catch (e) { st.proposals = []; st.proposalNote = `Could not read DJ software logs: ${friendly(e)}`; }
    renderPanel();
    q('#sty-proposals button, #sty-find')?.focus();
  }

  // ----- benchmark -----
  function renderBenchmark(d) {
    const wrap = h('div', { class: 'sty-bench' });
    const f = st.benchFill || {};
    const field = (id, label, opts = {}) => h('div', { class: 'field' }, h('label', { class: 'field-label', for: id, text: label }),
      h('input', { type: 'number', id, step: opts.step || 'any', min: opts.min ?? null, value: opts.value ?? '', inputmode: 'decimal', 'aria-describedby': opts.help ? `${id}-help` : null }), opts.help ? h('span', { class: 'field-help', id: `${id}-help`, text: opts.help }) : null);
    const form = h('form', { class: 'card sty-form', id: 'sty-bench-form', novalidate: true });
    const valid = h('input', { type: 'checkbox', id: 'sty-bench-valid', checked: true });
    const err = h('p', { class: 'form-error', id: 'sty-bench-error', role: 'alert', text: st.benchError });
    form.append(
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title', text: 'Record a benchmark' }),
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'sty-fill', text: 'Fill from latest runs', onclick: () => fillFromRuns(d) })),
      h('p', { class: 'muted', text: 'Play the 1 kHz and isolated-channel tracks, run the Cartridge and Channel separation tests, then bring the results here. Use the same record, side, tracking force, VTA and calibration each time, or the comparison means little.' }),
      h('div', { class: 'field-grid' },
        field('sty-b-hours', 'Hours at benchmark', { value: Number(d.hours.toFixed(2)), min: '0', help: 'Defaults to hours since install.' }),
        field('sty-b-thd', 'THD (%)', { value: f.thdPercent !== undefined ? Number(f.thdPercent.toFixed(3)) : '', min: '0' }),
        field('sty-b-sep', 'Channel separation (dB)', { value: f.separationDb !== undefined ? Number(f.separationDb.toFixed(2)) : '' }),
        field('sty-b-snr', 'Timecode SNR (dB)', { value: f.tcSnrDb !== undefined ? Number(f.tcSnrDb.toFixed(1)) : '', help: 'Optional. Needs a DVS interface and control vinyl.' }),
        field('sty-b-phase', 'Timecode phase error (deg)', { value: f.tcPhaseErrorDeg !== undefined ? Number(f.tcPhaseErrorDeg.toFixed(1)) : '', min: '0', help: 'Optional.' }),
        field('sty-b-drop', 'Timecode dropouts', { step: '1', min: '0', value: f.tcDropouts ?? '', help: 'Optional.' })),
      h('label', { class: 'sty-check', for: 'sty-bench-valid' }, valid, h('span', { text: 'Same conditions as the first benchmark (record, side, tracking force, VTA, interface, calibration)' })),
      err,
      h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn btn-primary', id: 'sty-bench-save', text: 'Save benchmark' })));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const num = id => { const v = q(id).value.trim(); return v === '' ? null : Number(v); };
      const res = { assetId: d.asset.id, hoursAt: num('#sty-b-hours'), thdPercent: num('#sty-b-thd'), separationDb: num('#sty-b-sep'), tcSnrDb: num('#sty-b-snr'), tcPhaseErrorDeg: num('#sty-b-phase'), tcDropouts: num('#sty-b-drop'), valid: valid.checked };
      const values = [res.thdPercent, res.separationDb, res.tcSnrDb, res.tcPhaseErrorDeg, res.tcDropouts];
      let msg = '';
      if (!Number.isFinite(res.hoursAt) || res.hoursAt < 0) msg = 'Enter the hours at this benchmark (0 or more).';
      else if (values.every(v => v === null)) msg = 'Enter at least one measured value.';
      else if (values.some(v => v !== null && !Number.isFinite(v))) msg = 'Measured values must be numbers.';
      else if ((res.thdPercent !== null && res.thdPercent < 0) || (res.tcDropouts !== null && (res.tcDropouts < 0 || !Number.isInteger(res.tcDropouts)))) msg = 'THD cannot be negative and dropouts must be a whole number.';
      if (msg) { st.benchError = msg; err.textContent = msg; return; }
      if (res.tcDropouts !== null) res.tcDropouts = Math.round(res.tcDropouts);
      res.detail = { source: st.benchFill ? 'runs' : 'manual', runs: st.benchFill ? [st.benchFill.thdRun, st.benchFill.separationRun, st.benchFill.dropoutRun, st.benchFill.tcRun].filter(Boolean) : [] };
      st.benchError = '';
      try {
        await api.benchmarkSave(res);
        st.benchFill = null;
        setStatus(res.valid ? 'Benchmark saved.' : 'Benchmark saved, but it is excluded from the trend because the conditions differ.', 'info');
        await load(); refreshRailBadge({ api, usage });
      } catch (e2) { st.benchError = friendly(e2); err.textContent = st.benchError; }
    });
    wrap.append(form);

    const hist = h('section', { class: 'card', 'aria-label': 'Benchmarks' }, h('div', { class: 'card-head' }, h('h2', { class: 'card-title', text: 'Benchmarks' })));
    if (!d.rows.length) hist.append(h('p', { class: 'muted', id: 'sty-no-bench', text: 'No benchmarks yet. Record at least three, ideally a week or more apart, to see a trend.' }));
    else {
      const body = h('tbody');
      [...d.rows].sort((a, b) => b.hoursAt - a.hoursAt).forEach(b => body.append(h('tr', {},
        h('td', { text: formatDate(b.createdAt) }), h('td', { class: 'r', text: fmt(b.hoursAt, 1) }), h('td', { class: 'r', text: fmt(b.thdPercent, 2) }), h('td', { class: 'r', text: fmt(b.separationDb, 1) }),
        h('td', { class: 'r', text: fmt(b.tcSnrDb, 1) }), h('td', { class: 'r', text: fmt(b.tcPhaseErrorDeg, 1) }), h('td', { class: 'r', text: b.tcDropouts === null ? '—' : String(b.tcDropouts) }), h('td', { text: b.valid ? 'Used' : 'Excluded' }))));
      hist.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data sty-table', id: 'sty-bench-table' }, h('caption', { class: 'sr-only', text: 'Benchmark history' }),
        h('thead', {}, h('tr', {}, ...['Date', 'Hours', 'THD %', 'Sep. dB', 'SNR dB', 'Phase °', 'Dropouts', 'In trend'].map((t, i) => h('th', { scope: 'col', class: i > 0 && i < 7 ? 'r' : '', text: t })))), body)));
    }
    wrap.append(hist);
    panel.append(wrap);
  }

  async function fillFromRuns(d) {
    try {
      const summaries = (await store.listRuns(40)).filter(r => /cartridge|separation|dvs/i.test(r.test || r.sessionType || ''));
      const runs = [];
      for (const s of summaries.slice(0, 12)) { const run = await store.getRun(s.id); if (run) runs.push({ ...run, test: run.test || s.test }); }
      const fill = { ...benchmarkFromRuns(runs), ...timecodeBenchmarkFromRuns(runs) }; // tcDropouts: the timecode run's own count wins
      if (fill.thdPercent === undefined && fill.separationDb === undefined && fill.tcDropouts === undefined && fill.tcSnrDb === undefined) { setStatus('No Cartridge, Channel separation or DVS runs with these measurements were found. Run the tests first, or type the values in.', 'warn'); return; }
      st.benchFill = fill; st.benchError = '';
      setStatus('Filled from your latest runs. Check the values, then save.', 'info');
      renderPanel(); q('#sty-b-thd')?.focus();
    } catch (e) { setStatus(`Could not read your runs: ${friendly(e)}`, 'error'); }
  }

  // ----- trends -----
  function renderTrends(d) {
    const wrap = h('div', { class: 'sty-trends' });
    const usable = validBenchmarks(d.benchmarks);
    if (!d.rows.length) { wrap.append(emptyBlock('No benchmarks yet', 'Record a benchmark to start the trend charts.', [h('button', { type: 'button', class: 'btn btn-primary', text: 'Record a benchmark', onclick: () => selectTab('benchmark') })])); panel.append(wrap); return; }
    if (usable.length < MIN_TREND_POINTS) wrap.append(h('p', { class: 'banner banner-info sty-note', id: 'sty-need-trend' }, h('span', { class: 'banner-text', text: `Need ${MIN_TREND_POINTS} benchmarks for a trend (${usable.length} valid so far).` })));
    const grid = h('div', { class: 'sty-chart-grid' });
    const hidden = [];
    const base = benchmarkBaseline(d.benchmarks);
    for (const metric of CHART_METRICS) {
      const info = METRICS[metric];
      const fit = d.verdict.fits[metric] || regress(usable.filter(b => Number.isFinite(b[metric])).map(b => ({ x: b.hoursAt, y: b[metric] })));
      const model = chartModel(metric, d.rows, { fit, baseline: base[metric] });
      if (!model) { hidden.push(info.label); continue; }
      const dg = METRIC_DIGITS[metric];
      const title = `${info.label} against hours`;
      const fitText = fit.enough
        ? `Trend ${fit.slopePer100h >= 0 ? '+' : '−'}${fmt(Math.abs(fit.slopePer100h), dg + 1)} ${info.unit} per 100 h · R² ${fmt(fit.r2, 2)} · ${fit.n} points`
        : fit.message;
      const fig = h('figure', { class: 'card sty-fig', 'data-metric': metric });
      fig.append(h('figcaption', { class: 'sty-fig-head' }, h('strong', { text: info.label }), h('span', { class: 'muted', text: ` ${info.unit} · ${info.worse === 'up' ? 'higher is worse' : 'lower is worse'}` })),
        h('div', { class: 'sty-chart-wrap', html: chartSvg(model, title) }),
        h('p', { class: 'sty-fit-text', text: fitText }),
        h('p', { class: 'sty-legend muted', html: `<span class="sty-leg"><span class="sty-key sty-key-dot"></span>valid</span><span class="sty-leg"><span class="sty-key sty-key-x"></span>excluded</span><span class="sty-leg"><span class="sty-key sty-key-fit"></span>trend</span><span class="sty-leg"><span class="sty-key sty-key-band"></span>beyond limit</span>${base[metric] !== null && base[metric] !== undefined ? `<span class="sty-leg">baseline ${esc(fmt(base[metric], dg))} ${esc(info.unit)}</span>` : ''}` }));
      const key = metric;
      const tableOn = !!st.showTable[key];
      const tbl = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-pressed': String(tableOn), 'data-table-toggle': metric, text: tableOn ? 'Hide data table' : 'Show data table', onclick: () => { st.showTable[key] = !tableOn; renderPanel(); q(`[data-table-toggle="${metric}"]`)?.focus(); } });
      fig.append(tbl);
      if (tableOn) {
        const body = h('tbody');
        model.pts.forEach(p => body.append(h('tr', {}, h('td', { class: 'r', text: fmt(p.x, 1) }), h('td', { class: 'r', text: `${fmt(p.y, dg)} ${info.unit}` }), h('td', { text: p.valid ? 'Used' : 'Excluded' }))));
        fig.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data sty-table sty-data-table' }, h('caption', { class: 'sr-only', text: `${info.label} data` }), h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: 'r', text: 'Hours' }), h('th', { scope: 'col', class: 'r', text: 'Value' }), h('th', { scope: 'col', text: 'In trend' }))), body)));
      }
      grid.append(fig);
    }
    wrap.append(grid);
    if (hidden.length) wrap.append(h('p', { class: 'muted', id: 'sty-hidden-metrics', text: `Not shown (no data yet): ${hidden.join(', ')}. Timecode metrics need a DVS interface and control vinyl.` }));
    const detail = h('section', { class: 'card sty-point-detail', id: 'sty-point-detail', 'aria-live': 'polite', 'aria-label': 'Selected benchmark' });
    detail.append(h('p', { class: 'muted', text: 'Select a point to see its benchmark.' }));
    wrap.append(detail);
    wrap.addEventListener('click', e => { const g = e.target.closest?.('[data-point]'); if (g) showPoint(g.dataset.point, d, detail); });
    wrap.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-point]')) { e.preventDefault(); showPoint(e.target.dataset.point, d, detail); } });
    panel.append(wrap);
    if (st.pointId) showPoint(st.pointId, d, detail);
  }

  function showPoint(id, d, detail) {
    const b = d.rows.find(r => String(r.id) === String(id));
    if (!b) return;
    st.pointId = id;
    const raw = d.benchmarks.find(r => String(r.id) === String(id)) || {};
    const sessionId = raw.sessionId ?? raw.session_id ?? null;
    detail.replaceChildren(h('h3', { class: 'card-title', text: `Benchmark on ${formatDate(b.createdAt)} at ${fmt(b.hoursAt, 1)} h` }),
      h('p', { text: [`THD ${fmt(b.thdPercent, 2)} %`, `separation ${fmt(b.separationDb, 1)} dB`, b.tcSnrDb !== null ? `timecode SNR ${fmt(b.tcSnrDb, 1)} dB` : null, b.tcPhaseErrorDeg !== null ? `phase error ${fmt(b.tcPhaseErrorDeg, 1)}°` : null, b.tcDropouts !== null ? `${b.tcDropouts} dropouts` : null].filter(Boolean).join(' · ') + (b.valid ? '' : ' · excluded from the trend') }),
      sessionId ? h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Open History', onclick: () => go('history', { focus: true }) }) : h('p', { class: 'muted', text: 'This benchmark was entered by hand, so there is no run to open.' }));
    announce(`Selected benchmark at ${fmt(b.hoursAt, 1)} hours`);
  }

  // ----- settings -----
  function renderSettings(d) {
    const wrap = h('div', { class: 'sty-settings' });
    const life = h('form', { class: 'card sty-form', id: 'sty-life-form', novalidate: true });
    const rated = h('input', { type: 'number', id: 'sty-rated', min: '1', max: '100000', step: '1', value: d.assetRated ?? '', placeholder: String(d.rated.source === 'asset' ? '' : d.rated.hours), 'aria-describedby': 'sty-rated-help sty-rated-error' });
    const rerr = h('p', { class: 'form-error', id: 'sty-rated-error', role: 'alert' });
    life.append(h('h2', { class: 'card-title', text: 'Rated life' }),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'sty-rated', text: 'Rated life for this stylus (hours)' }), rated,
        h('span', { class: 'field-help', id: 'sty-rated-help', text: 'Leave empty to use the catalogue figure, or the generic 500 h estimate when the model is unknown.' })),
      h('div', { class: 'sty-source', id: 'sty-rated-source' }, ratedSourceNode(d)),
      rerr, h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn btn-primary', text: 'Save rated life' })));
    life.addEventListener('submit', async e => {
      e.preventDefault();
      const v = rated.value.trim();
      const n = v === '' ? null : Number(v);
      if (n !== null && (!Number.isFinite(n) || n <= 0 || n > 100000)) { rerr.textContent = 'Enter hours above 0, or leave empty.'; rated.setAttribute('aria-invalid', 'true'); return; }
      await act(() => api.ratedLifeSet(d.asset.id, n), n === null ? 'Using the catalogue figure again.' : `Rated life set to ${fmt(n, 0)} h.`);
    });
    wrap.append(life);

    const thr = h('form', { class: 'card sty-form', id: 'sty-thr-form', novalidate: true });
    const amber = h('input', { type: 'number', id: 'sty-amber', min: '1', max: '500', step: '1', value: String(d.thresholds.amberPct) });
    const red = h('input', { type: 'number', id: 'sty-red', min: '1', max: '500', step: '1', value: String(d.thresholds.redPct) });
    const terr = h('p', { class: 'form-error', id: 'sty-thr-error', role: 'alert' });
    thr.append(h('h2', { class: 'card-title', text: 'Alert thresholds' }),
      h('div', { class: 'field-grid' },
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'sty-amber', text: 'Amber at (% of rated life)' }), amber),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'sty-red', text: 'Red at (% of rated life)' }), red)),
      h('p', { class: 'field-help', text: 'Defaults: amber at 80 %, red at 100 %. These are on this computer only.' }), terr,
      h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn-ghost', id: 'sty-thr-reset', text: 'Reset', onclick: () => { storageSet(THRESHOLD_KEY, { ...DEFAULT_THRESHOLDS }); load(); } }), h('button', { type: 'submit', class: 'btn btn-primary', text: 'Save thresholds' })));
    thr.addEventListener('submit', e => {
      e.preventDefault();
      const a = Number(amber.value), r = Number(red.value);
      if (!(a > 0 && r > a && r <= 500)) { terr.textContent = 'Amber must be above 0 and below red; red can be at most 500.'; return; }
      storageSet(THRESHOLD_KEY, { amberPct: a, redPct: r });
      setStatus('Thresholds saved.', 'info'); load(); refreshRailBadge({ api, usage });
    });
    wrap.append(thr);
    wrap.append(h('section', { class: 'card' }, h('h2', { class: 'card-title', text: 'New stylus' }), h('p', { class: 'muted', text: 'Fitted a new stylus? Marking it resets the hours counter and the benchmark baseline. History stays.' }),
      h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn-secondary', id: 'sty-replaced-2', text: 'I replaced the stylus', onclick: markReplaced }))));
    panel.append(wrap);
  }

  function ratedSourceNode(d) {
    const r = d.rated;
    const box = h('div', {});
    if (r.source === 'asset') { box.append(h('p', { text: `Using your figure: ${fmt(r.hours, 0)} h.` })); return box; }
    if (r.source === 'catalogue' && r.entry) {
      box.append(h('p', {}, h('strong', { text: `${r.entry.model}: ${fmt(r.hours, 0)} h` }), ` · ${CONFIDENCE_LABEL[r.entry.confidence] || r.entry.confidence}${r.entry.verified === false ? ' · unverified' : ''}`));
      if (r.entry.source && /^https?:/.test(r.entry.source)) box.append(h('p', { class: 'muted' }, 'Source: ', externalLink(r.entry.source, r.entry.source.replace(/^https?:\/\//, '').slice(0, 60))));
      return box;
    }
    box.append(h('p', { text: `Rated life unknown - using generic ${fmt(r.hours, 0)} h DJ estimate.` }));
    return box;
  }

  // ----- events -----
  picker.addEventListener('change', () => { st.assetId = picker.value; storageSet(ACTIVE_CARTRIDGE_KEY, st.assetId); st.proposals = null; st.pointId = null; st.benchFill = null; load(); });
  const onKey = e => {
    if (section.hidden || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (!st.data) return;
    const k = e.key.toLowerCase();
    if (k === 'a') { e.preventDefault(); selectTab('hours'); q('#sty-hours')?.focus(); }
    else if (k === 'b') { e.preventDefault(); selectTab('benchmark'); q('#sty-b-thd')?.focus(); }
  };
  document.addEventListener('keydown', onKey);

  render();
  return {
    onShow() {
      const hand = takeHandoff('stylus'); // a deep link (Equipment asset) names the cartridge to open
      if (hand?.assetId) { st.assetId = hand.assetId; st.tab = 'overview'; st.proposals = null; st.pointId = null; st.benchFill = null; }
      load();
    },
    onHide() { /* keep state */ },
    onEscape() {
      if (st.pointId) { st.pointId = null; renderPanel(); return true; }
      if (st.proposals) { st.proposals = null; renderPanel(); return true; }
      return false;
    },
    reload: load,
  };
}

/** Rail entry for the app shell; the rail entry follows features.stylusWear live. */
export function stylusScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-stylus')) main.append(h('section', { class: 'screen', id: 'screen-stylus', hidden: true }));
  if (isNative()) {
    setTimeout(() => { if (isEnabled('stylusWear')) refreshRailBadge(); }, 2500); // after the database and device library have been initialised
    onFeatureChange(() => setTimeout(() => { if (isEnabled('stylusWear') && !badgeState.level) refreshRailBadge(); else paintRailBadge(); }, 0));
  }
  return [{ id: 'stylus', title: 'Stylus wear', short: 'Stylus', icon: 'cartridge', feature: 'stylusWear', create: createStylusScreen }];
}
