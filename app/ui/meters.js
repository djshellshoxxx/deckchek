// Stereo level meters: canvas bars with instant attack, ~20 dB/s release,
// 1.5 s peak hold, narrower RMS bar and latching clip indicators.
// Levels arrive through `levelBus` so every visible meter shows the same input.

import { h, toDb, formatNumber } from './dom.js';
import { icon } from './icons.js';
import { announce } from './live.js';

const FLOOR = -60, RELEASE_DB_PER_SEC = 20, HOLD_MS = 1500, SEGMENT_DB = 3;
const TICKS = [0, -3, -6, -12, -18, -24, -36, -48, -60];
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const subscribers = new Set();
let lastLevels = null;
export const levelBus = {
  subscribe(fn) { subscribers.add(fn); if (lastLevels) fn(lastLevels); return () => subscribers.delete(fn); },
  publish(levels) { lastLevels = levels; subscribers.forEach(fn => fn(levels)); },
  reset() { lastLevels = null; subscribers.forEach(fn => fn(null)); },
};

const allMeters = new Set();
export function clearAllClips() { allMeters.forEach(m => m.clearClips()); }

function cssVar(el, name) { return getComputedStyle(el).getPropertyValue(name).trim() || '#888'; }
const clampDb = db => Math.max(FLOOR, Math.min(0, Number.isFinite(db) ? db : FLOOR));

class Channel {
  constructor(label) { this.label = label; this.reset(); }
  reset() { this.peak = FLOOR; this.rms = FLOOR; this.hold = FLOOR; this.holdAt = 0; this.clip = false; this.target = FLOOR; this.rmsTarget = FLOOR; }
  feed(peakAmp, rmsAmp, clipped, now) {
    const p = clampDb(toDb(peakAmp)), r = clampDb(toDb(rmsAmp));
    this.target = p; this.rmsTarget = r; this.rawPeakDb = toDb(peakAmp);
    if (p >= this.peak) this.peak = p;           // instant attack
    if (r >= this.rms) this.rms = r;
    if (p >= this.hold) { this.hold = p; this.holdAt = now; }
    if (clipped || p >= -0.1) this.clip = true;  // latch
  }
  step(dt, now) {
    const fall = RELEASE_DB_PER_SEC * dt;
    this.peak = Math.max(this.target, this.peak - fall);
    this.rms = Math.max(this.rmsTarget, this.rms - fall);
    if (now - this.holdAt > HOLD_MS) this.hold = Math.max(this.peak, this.hold - fall);
  }
  idle() { return this.peak <= FLOOR + .01 && this.hold <= FLOOR + .01; }
}

/**
 * Create a stereo meter inside `container`.
 * variant: 'large' (vertical, capture step) or 'strip' (horizontal, footer).
 */
export function createStereoMeter(container, { variant = 'large', label = 'Input level' } = {}) {
  const channels = [new Channel('L'), new Channel('R')];
  const vertical = variant === 'large';
  const root = h('div', { class: `meter meter-${variant}`, role: 'group', 'aria-label': label });
  const canvas = h('canvas', { class: 'meter-canvas', 'aria-hidden': 'true' });
  const readouts = [], clips = [], aria = [];
  const header = h('div', { class: 'meter-head' });
  channels.forEach((ch, i) => {
    const name = i ? 'Right' : 'Left';
    const clip = h('button', { type: 'button', class: 'clip-lamp', 'aria-pressed': 'false', 'data-tooltip': `${name} clip indicator — click or Ctrl+Shift+C to clear`, 'aria-label': `${name} channel clip indicator, not clipped` },
      h('span', { html: icon('warn', { size: 14 }) }), h('span', { text: 'CLIP' }));
    clip.addEventListener('click', () => { ch.clip = false; sync(true); });
    const readout = h('span', { class: 'meter-readout num', text: '−∞' });
    const meterEl = h('div', { class: 'meter-channel', role: 'meter', 'aria-label': `${name} peak level`, 'aria-valuemin': FLOOR, 'aria-valuemax': 0, 'aria-valuenow': FLOOR, 'aria-valuetext': `${name} peak below −60 dBFS` },
      h('span', { class: 'meter-ch', text: ch.label }), readout);
    clips.push(clip); readouts.push(readout); aria.push(meterEl);
    header.append(h('div', { class: 'meter-col' }, clip, meterEl));
  });
  const scale = h('div', { class: 'meter-scale', 'aria-hidden': 'true' },
    ...TICKS.map(t => h('span', { style: vertical ? `top:${(t / FLOOR) * 100}%` : `left:${(1 - t / FLOOR) * 100}%`, text: t === 0 ? '0' : String(t).replace('-', '−') })));
  const body = h('div', { class: 'meter-body' }, canvas, scale);
  root.append(header, body);
  container.append(root);

  let raf = 0, last = performance.now(), lastText = 0, lastAria = 0, lastData = 0, colors = null, announcedClip = false;
  const readColors = () => { colors = { low: cssVar(root, '--meter-low'), mid: cssVar(root, '--meter-mid'), hi: cssVar(root, '--meter-hi'), off: cssVar(root, '--meter-off'), hold: cssVar(root, '--text'), rms: cssVar(root, '--meter-rms') }; };

  function resize() {
    const r = body.getBoundingClientRect(), dpr = globalThis.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
    draw();
  }
  const ro = new ResizeObserver(resize); ro.observe(body);

  function segColor(db) { return db > -6 ? colors.hi : db > -18 ? colors.mid : colors.low; }
  function draw() {
    if (!colors) readColors();
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const W = canvas.width, H = canvas.height, dpr = globalThis.devicePixelRatio || 1, gap = 2 * dpr;
    ctx.clearRect(0, 0, W, H);
    const nSeg = Math.round(-FLOOR / SEGMENT_DB);
    channels.forEach((ch, c) => {
      const lane = vertical ? { x: c * W / 2 + gap * 2, y: 0, w: W / 2 - gap * 4, h: H } : { x: 0, y: c * H / 2 + gap, w: W, h: H / 2 - gap * 2 };
      for (let s = 0; s < nSeg; s++) {
        const lo = FLOOR + s * SEGMENT_DB, lit = ch.peak > lo + .01;
        ctx.globalAlpha = lit ? 1 : .14;
        ctx.fillStyle = lit ? segColor(lo + SEGMENT_DB) : colors.off;
        if (vertical) { const sh = H / nSeg; ctx.fillRect(lane.x, H - (s + 1) * sh + gap / 2, lane.w, sh - gap); }
        else { const sw = W / nSeg; ctx.fillRect(s * sw + gap / 2, lane.y, sw - gap, lane.h); }
      }
      ctx.globalAlpha = 1;
      const frac = db => (clampDb(db) - FLOOR) / -FLOOR;
      // RMS: narrow inner bar
      ctx.fillStyle = colors.rms;
      if (ch.rms > FLOOR) {
        if (vertical) { const w = lane.w * .28; ctx.fillRect(lane.x + (lane.w - w) / 2, H * (1 - frac(ch.rms)), w, H * frac(ch.rms)); }
        else { const hh = lane.h * .3; ctx.fillRect(0, lane.y + (lane.h - hh) / 2, W * frac(ch.rms), hh); }
      }
      // Peak-hold line
      if (ch.hold > FLOOR + .5) {
        ctx.fillStyle = colors.hold;
        if (vertical) ctx.fillRect(lane.x, H * (1 - frac(ch.hold)) - dpr, lane.w, 2 * dpr);
        else ctx.fillRect(W * frac(ch.hold) - dpr, lane.y, 2 * dpr, lane.h);
      }
    });
  }

  function sync(force = false) {
    const now = performance.now();
    if (force || now - lastText > 100) {
      lastText = now;
      channels.forEach((ch, i) => { readouts[i].textContent = ch.hold <= FLOOR + .01 ? '−∞' : formatNumber(ch.hold, { digits: 1 }); });
    }
    channels.forEach((ch, i) => {
      const was = clips[i].classList.contains('latched');
      if (was !== ch.clip) {
        clips[i].classList.toggle('latched', ch.clip);
        clips[i].setAttribute('aria-pressed', String(ch.clip));
        clips[i].setAttribute('aria-label', `${i ? 'Right' : 'Left'} channel clip indicator, ${ch.clip ? 'clipped — activate to clear' : 'not clipped'}`);
      }
    });
    const anyClip = channels.some(c => c.clip);
    if (anyClip && !announcedClip && variant === 'large') announce('Clipping detected on input. Reduce gain and clear the clip indicator.');
    announcedClip = anyClip;
    if (force || now - lastAria > 500) {
      lastAria = now;
      channels.forEach((ch, i) => {
        aria[i].setAttribute('aria-valuenow', String(Math.round(clampDb(ch.peak) * 10) / 10));
        aria[i].setAttribute('aria-valuetext', ch.peak <= FLOOR + .01 ? `${i ? 'Right' : 'Left'} peak below −60 dBFS` : `${i ? 'Right' : 'Left'} peak ${formatNumber(ch.peak, { digits: 1 })} dBFS`);
      });
    }
  }

  function frame(now) {
    const dt = Math.min(.2, (now - last) / 1000); last = now;
    channels.forEach(ch => ch.step(reducedMotion() ? dt : dt, now));
    draw(); sync();
    const stale = now - lastData > 2500;
    if (stale && channels.every(ch => ch.idle())) { raf = 0; return; }
    if (stale) channels.forEach(ch => { ch.target = FLOOR; ch.rmsTarget = FLOOR; });
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  const unsubscribe = levelBus.subscribe(levels => {
    if (!levels) { channels.forEach(ch => ch.reset()); draw(); sync(true); return; }
    const now = performance.now(); lastData = now;
    channels[0].feed(levels.peakL, levels.rmsL, levels.clipL, now);
    channels[1].feed(levels.peakR, levels.rmsR, levels.clipR, now);
    wake();
  });

  const api = {
    root,
    clearClips() { channels.forEach(ch => { ch.clip = false; }); announcedClip = false; sync(true); },
    hasClip() { return channels.some(ch => ch.clip); },
    refreshTheme() { readColors(); draw(); },
    reset() { channels.forEach(ch => ch.reset()); draw(); sync(true); },
    destroy() { unsubscribe(); ro.disconnect(); cancelAnimationFrame(raf); allMeters.delete(api); root.remove(); },
  };
  allMeters.add(api);
  return api;
}

export function refreshMeterThemes() { allMeters.forEach(m => m.refreshTheme()); }
