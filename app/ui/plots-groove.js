// FS-13 groove plots: the circular groove heat-map (bins as arcs along a spiral from the outer edge to the
// run-out) and the linear timeline (metric trace over a heat strip), both as inline SVG strings so they work
// in the browser preview, print and tests alike. Separate from plots.js on purpose (FS-13 §4).
//
// Colour is never the only signal: bad bins carry a hatch, interrupted bins a dot texture and neutral fill,
// the three worst bins numbered pins, needle skips a diamond, and every bin a <title> plus a keyboard path in
// the screen. Colours come from the theme ramps below, each validated for lightness order in tests.

import { esc } from './dom.js';
import { QUALITY_COLOR_RAMP, CLASS_THRESHOLDS, formatTime, metricQuality } from '../wear-map.js';

/** Sequential quality ramps per theme, q = 0 worst ... 1 best. Light = the engine's cividis ramp; dark lifts
 *  the dark end so the worst bins stay visible on a dark surface (same hues, lightness still rises with q). */
export const RAMPS = Object.freeze({
  light: QUALITY_COLOR_RAMP,
  dark: Object.freeze([
    Object.freeze({ q: 0, color: '#4a6fb5' }), Object.freeze({ q: 0.25, color: '#66789d' }), Object.freeze({ q: 0.5, color: '#8f8c84' }),
    Object.freeze({ q: 0.75, color: '#c6b67c' }), Object.freeze({ q: 1, color: '#fee838' }),
  ]),
});

/** Diverging ramps for scan-to-scan change: worse (warm) - neutral (within noise) - better (cool). */
export const DIVERGING = Object.freeze({
  light: Object.freeze({ worse: '#b3471d', mid: '#c4c8ce', better: '#1f5fae' }),
  dark: Object.freeze({ worse: '#ff8a5c', mid: '#4d5560', better: '#6aa7ff' }),
});

/** Change of a metric (in its "worse" direction) that saturates the diverging scale. */
export const DELTA_FULL_SCALE = Object.freeze({ snr: 10, phase: 15, dropouts: 3 });

const fin = Number.isFinite;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const hex = s => [1, 3, 5].map(k => parseInt(s.slice(k, k + 2), 16));
const toHex = c => '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const mix = (a, b, f) => toHex(hex(a).map((v, k) => v + (hex(b)[k] - v) * f));
const n1 = v => (Math.round(v * 100) / 100).toString();

/** Colour for quality q on a ramp (piecewise linear in sRGB, like qualityColor). */
export function rampColor(q, ramp = RAMPS.light) {
  if (!fin(q)) return null;
  const x = clamp(q, 0, 1);
  let i = 0;
  while (i < ramp.length - 2 && x > ramp[i + 1].q) i++;
  const a = ramp[i], b = ramp[i + 1];
  return mix(a.color, b.color, (x - a.q) / (b.q - a.q));
}

/** Colour for a change d where positive = worse; |d| >= full saturates; |d| < noise is the neutral midpoint. */
export function deltaColor(d, { full = DELTA_FULL_SCALE.snr, noise = 0, theme = 'light' } = {}) {
  if (!fin(d)) return null;
  const p = DIVERGING[theme] || DIVERGING.light;
  if (Math.abs(d) < noise) return p.mid;
  const f = clamp(Math.abs(d) / full, 0, 1);
  return mix(p.mid, d > 0 ? p.worse : p.better, 0.25 + 0.75 * f);
}

/** WCAG relative luminance of a #rrggbb colour (used by tests to check ramp order). */
export function luminance(color) {
  const [r, g, b] = hex(color).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Value range shown on the legend and timeline for each metric, plus the class thresholds as guides. */
export const METRIC_INFO = Object.freeze({
  snr: Object.freeze({ label: 'SNR', unit: 'dB', lo: CLASS_THRESHOLDS.badSnrDb - 5, hi: CLASS_THRESHOLDS.goodSnrDb + 5, axis: [0, 45], guides: [[CLASS_THRESHOLDS.goodSnrDb, 'good'], [CLASS_THRESHOLDS.badSnrDb, 'bad']], worseUp: false, digits: 1 }),
  phase: Object.freeze({ label: 'Phase error', unit: 'deg', lo: 0, hi: CLASS_THRESHOLDS.badPhaseErrDeg + 15, axis: [0, 45], guides: [[CLASS_THRESHOLDS.goodPhaseErrDeg, 'good'], [CLASS_THRESHOLDS.badPhaseErrDeg, 'bad']], worseUp: true, digits: 1 }),
  dropouts: Object.freeze({ label: 'Dropouts', unit: '', lo: 0, hi: CLASS_THRESHOLDS.badDropouts + 1, axis: [0, 4], guides: [[1, ''], [CLASS_THRESHOLDS.badDropouts, 'bad']], worseUp: true, digits: 0 }),
});

// ------------------------------------------------------------------ geometry

/** Point on the record: angle in radians (0 at 12 o'clock, clockwise), radius in mm; SVG y grows downwards. */
export const polar = (a, r) => [r * Math.sin(a), -r * Math.cos(a)];

/**
 * SVG path for one bin's band: outer edge from a0 to a1, inner edge back, split into <= 30 deg arcs so the
 * radius change along the spiral is followed and no single arc command spans more than half a turn.
 */
export function arcBandPath(arc, { fill = 0.84 } = {}) {
  const half = (arc.width * fill) / 2, span = Math.max(arc.a1 - arc.a0, 1e-4);
  const n = Math.max(1, Math.ceil(span / (Math.PI / 6)));
  const at = (k, side) => { const f = k / n, a = arc.a0 + span * f, r = arc.r0 + (arc.r1 - arc.r0) * f + side * half; return [a, r]; };
  const pt = ([a, r]) => polar(a, r).map(n1).join(' ');
  let d = `M${pt(at(0, 1))}`;
  for (let k = 1; k <= n; k++) { const [, r] = at(k, 1); d += `A${n1(r)} ${n1(r)} 0 0 1 ${pt(at(k, 1))}`; }
  d += `L${pt(at(n, -1))}`;
  for (let k = n - 1; k >= 0; k--) { const [, r] = at(k, -1); d += `A${n1(r)} ${n1(r)} 0 0 0 ${pt(at(k, -1))}`; }
  return `${d}Z`;
}

/** Angle and radius of a time on the drawing spiral (same model as binsToArcs). */
export function spiralAt(tSec, { outerMm, innerMm, turns, durationSec }) {
  const f = clamp(tSec / durationSec, 0, 1);
  return { a: 2 * Math.PI * turns * f, r: outerMm - (outerMm - innerMm) * f };
}

/** Polyline along the spiral centre line from t0 to t1 (the groove track under the bins). */
export function spiralPath(geom, t0 = 0, t1 = geom.durationSec, stepDeg = 3) {
  const a0 = spiralAt(t0, geom).a, a1 = spiralAt(t1, geom).a;
  const n = Math.max(2, Math.ceil((a1 - a0) / (stepDeg * Math.PI / 180)));
  const pts = [];
  for (let k = 0; k <= n; k++) { const t = t0 + (t1 - t0) * k / n, { a, r } = spiralAt(t, geom); pts.push(polar(a, r).map(n1).join(' ')); }
  return `M${pts.join('L')}`;
}

function patterns(id, theme) {
  const ink = theme === 'dark' ? '#e8eaed' : '#14171c';
  return `<defs>
    <pattern id="${id}-hatch" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)"><rect width="1" height="3" fill="#000" opacity=".62"/><rect x="1" width=".55" height="3" fill="#fff" opacity=".55"/></pattern>
    <pattern id="${id}-dots" patternUnits="userSpaceOnUse" width="2.2" height="2.2"><circle cx="1.1" cy="1.1" r=".45" fill="${ink}" opacity=".55"/></pattern>
    <pattern id="${id}-thatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="2" height="6" fill="#000" opacity=".62"/><rect x="2" width="1.1" height="6" fill="#fff" opacity=".55"/></pattern>
    <pattern id="${id}-tdots" patternUnits="userSpaceOnUse" width="5" height="5"><circle cx="2.5" cy="2.5" r="1" fill="${ink}" opacity=".5"/></pattern>
  </defs>`.replace(/\s*\n\s*/g, '');
}

/** Fill for one bin given the view: metric colour, or the scan-to-scan change when `deltas` is given. */
export function binFill(bin, { metric = 'snr', theme = 'light', delta = null } = {}) {
  if (delta) {
    if (delta.excluded) return null;
    const full = DELTA_FULL_SCALE[metric] ?? 10;
    const worse = metric === 'snr' ? -delta.snrDelta : metric === 'phase' ? delta.phaseDelta : delta.dropoutDelta;
    return deltaColor(worse, { full, noise: metric === 'snr' ? 3 : metric === 'phase' ? 3 : 0.5, theme });
  }
  if (bin.interrupted || bin.cls === 'interrupted') return null;
  const q = fin(bin.q) ? bin.q : metricQuality(bin, metric).q;
  return rampColor(q, RAMPS[theme] || RAMPS.light);
}

// ------------------------------------------------------------------ groove map

/**
 * Circular groove heat-map as an SVG string.
 * @param {Array} arcs from binsToArcs (one per bin, same order as the bins).
 * @param {object} o
 * @param {{outerMm,innerMm,turns,durationSec}} o.geom drawing geometry (durationSec = whole side).
 * @param {string} [o.metric] 'snr' | 'phase' | 'dropouts'
 * @param {'light'|'dark'} [o.theme]
 * @param {Map<number,object>} [o.deltas] idx -> BinDelta (compare view), each with snrDelta/phaseDelta/dropoutDelta.
 * @param {number|null} [o.selected] focused bin idx.
 * @param {number[]} [o.worst] idx of the worst bins, drawn as numbered pins.
 * @param {Array<{tSec:number}>} [o.skips]
 * @param {number|null} [o.headSec] live capture head (a needle marker), or null.
 * @param {{title:string, sub?:string, foot?:string}} [o.label] centre-label text.
 * @param {string} [o.id] unique prefix for pattern ids.
 * @param {string} [o.ariaLabel]
 */
export function grooveMapSvg(arcs, { geom, metric = 'snr', theme = 'light', deltas = null, selected = null, worst = [], skips = [], headSec = null, label = null, id = 'gm', ariaLabel = 'Groove map' } = {}) {
  const g = geom, R = g.outerMm + 6, P = id;
  const parts = [`<svg class="gm" viewBox="${-R} ${-R} ${2 * R} ${2 * R}" role="group" aria-label="${esc(ariaLabel)}" data-theme="${theme}">`, patterns(P, theme)];
  // record, track and label
  parts.push(`<circle class="gm-disc" r="${n1(g.outerMm + 3.5)}"/>`);
  parts.push(`<path class="gm-track" d="${spiralPath(g)}" stroke-width="${n1(((g.outerMm - g.innerMm) / g.turns) * 0.84)}"/>`);
  const byIdx = new Map();
  for (const arc of arcs) {
    byIdx.set(arc.idx, arc);
    const d = arcBandPath(arc);
    const delta = deltas ? deltas.get(arc.idx) || { excluded: true } : null;
    const fill = binFill(arc, { metric, theme, delta });
    const neutral = fill == null;
    const cls = `gm-bin${neutral ? ' gm-neutral' : ''}${arc.hatch && !deltas ? ' gm-bad' : ''}${delta?.newBad ? ' gm-newbad' : ''}`;
    parts.push(`<path class="${cls}" data-idx="${arc.idx}" d="${d}"${neutral ? '' : ` fill="${fill}"`}><title>${esc(arc.title || `Bin ${arc.idx}, ${formatTime(arc.tSec)}`)}</title></path>`);
    if (neutral) parts.push(`<path class="gm-tex" d="${d}" fill="url(#${P}-dots)"/>`);
    else if ((deltas ? delta?.newBad : arc.hatch)) parts.push(`<path class="gm-tex" d="${d}" fill="url(#${P}-hatch)"/>`);
  }
  // centre label
  const lr = g.innerMm - 4;
  parts.push(`<circle class="gm-label" r="${n1(lr)}"/><circle class="gm-label-ring" r="${n1(lr - 5)}"/><circle class="gm-spindle" r="3.6"/>`);
  if (label) {
    parts.push(`<text class="gm-label-title" y="-10" text-anchor="middle">${esc(label.title)}</text>`);
    if (label.sub) parts.push(`<text class="gm-label-sub" y="16" text-anchor="middle">${esc(label.sub)}</text>`);
    if (label.foot) parts.push(`<text class="gm-label-foot" y="28" text-anchor="middle">${esc(label.foot)}</text>`);
  }
  // skips, worst pins, live head, selection
  for (const s of skips) {
    const { a, r } = spiralAt(s.tSec, g), [x, y] = polar(a, r);
    parts.push(`<path class="gm-skip" d="M${n1(x)} ${n1(y - 4)}L${n1(x + 4)} ${n1(y)}L${n1(x)} ${n1(y + 4)}L${n1(x - 4)} ${n1(y)}Z"><title>Needle skip at ${esc(formatTime(s.tSec))}</title></path>`);
  }
  worst.forEach((idx, k) => {
    const arc = byIdx.get(idx);
    if (!arc) return;
    const [x, y] = polar((arc.a0 + arc.a1) / 2, (arc.r0 + arc.r1) / 2);
    parts.push(`<g class="gm-pin" data-idx="${idx}"><circle cx="${n1(x)}" cy="${n1(y)}" r="5.4"/><text x="${n1(x)}" y="${n1(y + 2.3)}" text-anchor="middle">${k + 1}</text></g>`);
  });
  if (fin(headSec)) {
    const { a, r } = spiralAt(headSec, g), [x0, y0] = polar(a, r + 6), [x1, y1] = polar(a, r - 6);
    parts.push(`<line class="gm-head" x1="${n1(x0)}" y1="${n1(y0)}" x2="${n1(x1)}" y2="${n1(y1)}"/><circle class="gm-head-dot" cx="${n1(polar(a, r)[0])}" cy="${n1(polar(a, r)[1])}" r="2.2"/>`);
  }
  if (selected != null && byIdx.has(selected)) {
    const d = arcBandPath(byIdx.get(selected), { fill: 1.05 });
    parts.push(`<path class="gm-sel-halo" d="${d}"/><path class="gm-sel" d="${d}"/>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

// ------------------------------------------------------------------ timeline

const TL = Object.freeze({ W: 1000, H: 240, l: 46, r: 14, t: 26, plotB: 152, stripT: 166, stripB: 192, axisY: 210 });

function niceStep(span, target = 8) {
  const raw = span / target, mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
}
/** Time ticks in whole minutes where possible (m:ss labels). */
export function timeTicks(durationSec, target = 8) {
  const steps = [5, 10, 15, 30, 60, 120, 180, 300, 600, 900, 1200];
  const step = steps.find(s => durationSec / s <= target) || 1800;
  const out = [];
  for (let t = 0; t <= durationSec + 1e-9; t += step) out.push(t);
  return out;
}

/**
 * Linear timeline: the metric per bin as a line (gaps at interrupted bins) with the class guides, an optional
 * earlier scan as a dashed line, and a heat strip with the same colours and textures as the map.
 * @param {Array} bins current scan bins (with cls from classifyBin).
 * @param {object} o
 * @param {Array} [o.prevBins] earlier scan's bins already shifted onto this scan's time axis ({tSec,value}).
 */
export function timelineSvg(bins, { metric = 'snr', theme = 'light', durationSec = null, deltas = null, selected = null, worst = [], skips = [], prev = null, headSec = null, id = 'tl', ariaLabel = 'Timeline' } = {}) {
  const info = METRIC_INFO[metric] || METRIC_INFO.snr;
  const end = Math.max(1, durationSec || 0, ...bins.map(b => b.tSec + (b.durSec || 0)));
  const sx = t => TL.l + (t / end) * (TL.W - TL.l - TL.r);
  const val = b => (metric === 'snr' ? b.snrDb : metric === 'phase' ? b.phaseErrDeg : (b.dropouts || 0));
  const top = Math.max(0, ...bins.map(b => (b.cls === 'interrupted' ? 0 : val(b))).filter(fin), ...(prev || []).map(p => p.value).filter(fin));
  const [y0, y1] = metric === 'dropouts' ? [0, Math.max(info.axis[1], top)] : [info.axis[0], Math.max(info.axis[1], Math.ceil(top / 10) * 10)];
  const sy = v => TL.plotB - ((clamp(v, y0, y1) - y0) / (y1 - y0)) * (TL.plotB - TL.t);
  const P = id, parts = [`<svg class="tl" viewBox="0 0 ${TL.W} ${TL.H}" role="group" aria-label="${esc(ariaLabel)}" preserveAspectRatio="xMidYMid meet">`, patterns(P, theme)];
  // y grid + guides
  const step = niceStep(y1 - y0, 4);
  for (let v = y0; v <= y1 + 1e-9; v += step) parts.push(`<line class="tl-grid" x1="${TL.l}" x2="${TL.W - TL.r}" y1="${n1(sy(v))}" y2="${n1(sy(v))}"/><text class="tl-tick" x="${TL.l - 6}" y="${n1(sy(v) + 4)}" text-anchor="end">${n1(v)}</text>`);
  if (!deltas) for (const [v, name] of info.guides) {
    if (!name) continue;
    parts.push(`<line class="tl-guide tl-guide-${name}" x1="${TL.l}" x2="${TL.W - TL.r}" y1="${n1(sy(v))}" y2="${n1(sy(v))}"/><text class="tl-guide-label" x="${TL.W - TL.r - 4}" y="${n1(sy(v) - 4)}" text-anchor="end">${name === 'good' ? 'Good' : 'Bad'} ${info.worseUp ? (name === 'good' ? '≤' : '>') : (name === 'good' ? '≥' : '<')} ${v}${info.unit ? ` ${info.unit}` : ''}</text>`);
  }
  parts.push(`<text class="tl-axis-label" x="4" y="12">${esc(info.label)}${info.unit ? ` (${info.unit})` : ''}</text>`);
  // previous scan
  const line = (pts, cls) => {
    let d = '', pen = false;
    for (const p of pts) { if (p == null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${n1(sx(p.t))} ${n1(sy(p.v))}`; pen = true; }
    return d ? `<path class="${cls}" d="${d}"/>` : '';
  };
  if (prev?.length) parts.push(line(prev.map(p => (fin(p.value) ? { t: p.tSec + (p.durSec || 0) / 2, v: p.value } : null)), 'tl-prev'));
  if (metric === 'dropouts') {
    for (const b of bins) if (b.cls !== 'interrupted' && (b.dropouts || 0) > 0) parts.push(`<rect class="tl-bar" x="${n1(sx(b.tSec))}" y="${n1(sy(b.dropouts))}" width="${n1(Math.max(1.5, sx(b.tSec + (b.durSec || 0)) - sx(b.tSec) - 0.5))}" height="${n1(TL.plotB - sy(b.dropouts))}"/>`);
  } else {
    parts.push(line(bins.map(b => (b.cls === 'interrupted' || !fin(val(b)) ? null : { t: b.tSec + (b.durSec || 0) / 2, v: val(b) })), 'tl-line'));
  }
  parts.push(`<line class="tl-axis" x1="${TL.l}" x2="${TL.W - TL.r}" y1="${TL.plotB}" y2="${TL.plotB}"/>`);
  // heat strip
  parts.push(`<rect class="tl-strip-bg" x="${TL.l}" y="${TL.stripT}" width="${TL.W - TL.l - TL.r}" height="${TL.stripB - TL.stripT}"/>`);
  for (const b of bins) {
    const x = sx(b.tSec), w = Math.max(0.8, sx(b.tSec + (b.durSec || 0)) - x);
    const delta = deltas ? deltas.get(b.idx) || { excluded: true } : null;
    const fill = binFill(b, { metric, theme, delta });
    const geo = `x="${n1(x)}" y="${TL.stripT}" width="${n1(w)}" height="${TL.stripB - TL.stripT}"`;
    parts.push(`<rect class="tl-bin${fill == null ? ' tl-neutral' : ''}" data-idx="${b.idx}" ${geo}${fill == null ? '' : ` fill="${fill}"`}><title>${esc(b.title || `Bin ${b.idx}, ${formatTime(b.tSec)}`)}</title></rect>`);
    if (fill == null) parts.push(`<rect class="tl-tex" ${geo} fill="url(#${P}-tdots)"/>`);
    else if (deltas ? delta?.newBad : b.cls === 'bad') parts.push(`<rect class="tl-tex" ${geo} fill="url(#${P}-thatch)"/>`);
  }
  // skips and worst pins above the strip
  for (const s of skips) { const x = sx(s.tSec); parts.push(`<path class="tl-skip" d="M${n1(x)} ${TL.stripT - 9}l4 4l-4 4l-4 -4z"><title>Needle skip at ${esc(formatTime(s.tSec))}</title></path>`); }
  worst.forEach((idx, k) => {
    const b = bins.find(x => x.idx === idx);
    if (!b) return;
    const x = sx(b.tSec + (b.durSec || 0) / 2);
    parts.push(`<g class="tl-pin" data-idx="${idx}"><circle cx="${n1(x)}" cy="${TL.stripB + 9}" r="7"/><text x="${n1(x)}" y="${TL.stripB + 13}" text-anchor="middle">${k + 1}</text></g>`);
  });
  // time axis
  for (const t of timeTicks(end)) parts.push(`<text class="tl-tick" x="${n1(sx(t))}" y="${TL.axisY + 18}" text-anchor="middle">${formatTime(t)}</text>`);
  if (fin(headSec)) parts.push(`<line class="tl-head" x1="${n1(sx(headSec))}" x2="${n1(sx(headSec))}" y1="${TL.t}" y2="${TL.stripB}"/>`);
  const sel = bins.find(b => b.idx === selected);
  if (sel) {
    const x = sx(sel.tSec), w = Math.max(2, sx(sel.tSec + (sel.durSec || 0)) - x);
    parts.push(`<rect class="tl-sel-band" x="${n1(x)}" y="${TL.t}" width="${n1(w)}" height="${TL.stripB - TL.t}"/><rect class="tl-sel" x="${n1(x - 1)}" y="${TL.stripT - 2}" width="${n1(w + 2)}" height="${TL.stripB - TL.stripT + 4}"/>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

/** Legend gradient stops for the current view (CSS linear-gradient string, worst on the left). */
export function legendGradient({ theme = 'light', delta = false } = {}) {
  if (delta) { const p = DIVERGING[theme] || DIVERGING.light; return `linear-gradient(90deg, ${p.worse}, ${p.mid} 50%, ${p.better})`; }
  const ramp = RAMPS[theme] || RAMPS.light;
  return `linear-gradient(90deg, ${ramp.map(s => `${s.color} ${Math.round(s.q * 100)}%`).join(', ')})`;
}

/** Spec names (FS-13 §4): render into a container element. */
export function drawGrooveMap(container, arcs, opts) { container.innerHTML = grooveMapSvg(arcs, opts); return container.firstElementChild; }
export function drawTimeline(container, bins, opts) { container.innerHTML = timelineSvg(bins, opts); return container.firstElementChild; }
