// Lightweight inline-SVG plots (theme-aware via CSS classes). Each returns markup.

import { esc, formatNumber } from './dom.js';

const W = 640, H = 230, PAD = { l: 56, r: 14, t: 26, b: 30 };

function scale(domain, range) {
  const [d0, d1] = domain, [r0, r1] = range, k = (r1 - r0) / ((d1 - d0) || 1);
  return v => r0 + (v - d0) * k;
}
function extent(values, padFrac = .08, minSpan = 1e-9) {
  const v = values.filter(Number.isFinite);
  if (!v.length) return [0, 1];
  let lo = Math.min(...v), hi = Math.max(...v);
  if (hi - lo < minSpan) { const mid = (lo + hi) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const span = hi - lo || 1;
  return [lo - span * padFrac, hi + span * padFrac];
}
function ticks([a, b], n = 5) {
  const step = (b - a) / (n - 1);
  return Array.from({ length: n }, (_, i) => a + i * step);
}

function frame({ x, y, xLabel, yLabel, xDomain, yDomain, title }) {
  const xt = ticks(xDomain), yt = ticks(yDomain);
  return `<title>${esc(title)}</title>
  ${yt.map(v => `<line class="plot-grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/><text class="plot-tick" x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end">${formatNumber(v, { digits: Math.abs(yDomain[1] - yDomain[0]) < 1 ? 3 : 1 })}</text>`).join('')}
  ${xt.map(v => `<text class="plot-tick" x="${x(v)}" y="${H - PAD.b + 16}" text-anchor="middle">${formatNumber(v, { digits: 1 })}</text>`).join('')}
  <line class="plot-axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${H - PAD.b}" y2="${H - PAD.b}"/>
  <text class="plot-label" x="${W - PAD.r}" y="${H - 2}" text-anchor="end">${esc(xLabel)}</text>
  <text class="plot-label" x="4" y="10">${esc(yLabel)}</text>`;
}

function svg(inner, label, { width = W, height = H } = {}) {
  return `<svg class="plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

/** Line plot of {t, v} points. */
export function linePlot(points, { title, xLabel = 'time (s)', yLabel = '', zeroLine = false, marker = null, dots = false, minSpan = 1e-9 } = {}) {
  if (!points?.length) return '<p class="muted">No data.</p>';
  const xDomain = extent(points.map(p => p.t), 0), yDomain = extent(points.map(p => p.v).concat(zeroLine ? [0] : []), .08, minSpan);
  const x = scale(xDomain, [PAD.l, W - PAD.r]), y = scale(yDomain, [H - PAD.b, PAD.t]);
  const d = points.filter(p => Number.isFinite(p.v)).map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  return svg(`${frame({ x, y, xLabel, yLabel, xDomain, yDomain, title })}
    ${zeroLine ? `<line class="plot-ref" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(0)}" y2="${y(0)}"/>` : ''}
    ${marker != null ? `<line class="plot-marker" x1="${x(marker)}" x2="${x(marker)}" y1="${PAD.t}" y2="${H - PAD.b}"/><text class="plot-tick" x="${x(marker) + 4}" y="${PAD.t + 10}">marker</text>` : ''}
    <path class="plot-line" d="${d}"/>
    ${dots ? points.map(p => `<circle class="plot-dot" cx="${x(p.t)}" cy="${y(p.v)}" r="3.5"/>`).join('') : ''}`, title);
}

/** Stereo min/max envelope overview (L above axis colour, R dashed). */
export function envelopePlot(env, { title = 'Signal overview' } = {}) {
  if (!env?.left?.length) return '<p class="muted">No data.</p>';
  const n = env.left.length, dur = env.durationSec || n;
  const x = scale([0, n - 1], [PAD.l, W - PAD.r]);
  const lane = (data, top, bottom) => {
    const y = scale([-1, 1], [bottom, top]);
    const upper = data.map(([, hi], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(hi).toFixed(1)}`).join('');
    const lower = data.map((_, k) => { const i = n - 1 - k; return `L${x(i).toFixed(1)},${y(data[i][0]).toFixed(1)}`; }).join('');
    return `<path d="${upper}${lower}Z"/>`;
  };
  const mid = PAD.t + (H - PAD.t - PAD.b) / 2;
  return svg(`<title>${esc(title)}</title>
    <g class="plot-env plot-env-l">${lane(env.left, PAD.t, mid - 4)}</g>
    <g class="plot-env plot-env-r">${lane(env.right, mid + 4, H - PAD.b)}</g>
    <text class="plot-label" x="6" y="${PAD.t + 20}">L</text><text class="plot-label" x="6" y="${mid + 24}">R</text>
    <line class="plot-axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${H - PAD.b}" y2="${H - PAD.b}"/>
    ${ticks([0, dur]).map(v => `<text class="plot-tick" x="${scale([0, dur], [PAD.l, W - PAD.r])(v)}" y="${H - PAD.b + 16}" text-anchor="middle">${formatNumber(v, { digits: 1 })}</text>`).join('')}
    <text class="plot-label" x="${W - PAD.r}" y="${H - 2}" text-anchor="end">time (s)</text>`, `${title}: stereo waveform envelope over ${formatNumber(dur, { digits: 1 })} seconds`);
}

/** X/Y scope (Lissajous) for DVS timecode. */
export function scopePlot(points, { title = 'Timecode scope (L × R)' } = {}) {
  if (!points?.length) return '<p class="muted">No data.</p>';
  const S = 260, c = S / 2, m = Math.max(1e-6, ...points.map(([l, r]) => Math.max(Math.abs(l), Math.abs(r))));
  const k = (c - 14) / m;
  const d = points.map(([l, r], i) => `${i ? 'L' : 'M'}${(c + l * k).toFixed(1)},${(c - r * k).toFixed(1)}`).join('');
  return svg(`<title>${esc(title)}</title><circle class="plot-grid" cx="${c}" cy="${c}" r="${c - 14}" fill="none"/>
    <line class="plot-grid" x1="${c}" x2="${c}" y1="8" y2="${S - 8}"/><line class="plot-grid" y1="${c}" y2="${c}" x1="8" x2="${S - 8}"/>
    <path class="plot-line plot-thin" d="${d}"/><text class="plot-label" x="${S - 10}" y="${c - 6}" text-anchor="end">L</text><text class="plot-label" x="${c + 6}" y="16">R</text>`,
  `${title}: ${points.length} points`, { width: S, height: S });
}

/** Event map: vertical ticks at normalized side positions; previous scan drawn below for comparison. */
export function eventMapPlot(events, { previous = null, title = 'Transient event map' } = {}) {
  const rows = previous ? 2 : 1, rowH = 46, Hh = 30 + rows * rowH;
  const x = scale([0, 1], [PAD.l, W - PAD.r]);
  const row = (list, i, label) => `<text class="plot-label" x="6" y="${24 + i * rowH + rowH / 2}">${esc(label)}</text>
    <rect class="plot-band" x="${PAD.l}" y="${12 + i * rowH}" width="${W - PAD.l - PAD.r}" height="${rowH - 10}" rx="4"/>
    ${list.map(e => `<line class="plot-event" x1="${x(e.normalizedPosition ?? 0)}" x2="${x(e.normalizedPosition ?? 0)}" y1="${16 + i * rowH}" y2="${8 + (i + 1) * rowH - 6}"/>`).join('')}`;
  return svg(`<title>${esc(title)}</title>${row(events || [], 0, 'This')}${previous ? row(previous, 1, 'Prev') : ''}
    ${[0, .25, .5, .75, 1].map(v => `<text class="plot-tick" x="${x(v)}" y="${Hh - 4}" text-anchor="middle">${Math.round(v * 100)}%</text>`).join('')}`,
  `${title}: ${(events || []).length} candidates${previous ? `, previous scan ${previous.length}` : ''}`, { height: Hh });
}

/** Frequency-response deltas from calibration. */
export function responsePlot(response, { title = 'Loopback response' } = {}) {
  const pts = (response || []).filter(p => Number.isFinite(p.deltaDb)).map(p => ({ t: Math.log10(p.hz), v: p.deltaDb }));
  if (!pts.length) return '<p class="muted">No response data.</p>';
  return linePlot(pts, { title, xLabel: 'log₁₀ frequency (Hz)', yLabel: 'Δ dB', zeroLine: true, dots: true, minSpan: 1 });
}
