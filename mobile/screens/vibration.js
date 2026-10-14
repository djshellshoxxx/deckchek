// Vibration screen (AC-4, AC-7): 20 s of accelerometer on the plinth, then RMS, dominant frequency and a spectrum.
import { el, svgEl, fmt, announce, measurementTable, stateBox } from '../lib/ui.js';
import { requestMotionPermission, recordMotion, keepAwake, motionSupported, MOTION_MESSAGES } from '../lib/motion.js';
import { vibrationMetrics, vibrationMeasurements, vibrationBand, MIN_RATE_HZ } from '../lib/vibration.js';
import { addResult, getSettings } from '../lib/store.js';

export const RECORD_SEC = 20;

export function spectrumSvg(spectrum, dominantHz) {
  const W = 320, H = 120, pad = 6;
  const max = Math.max(1e-9, ...spectrum.map(p => p.amp));
  const x = hz => pad + (hz - spectrum[0].hz) / Math.max(1e-9, spectrum.at(-1).hz - spectrum[0].hz) * (W - 2 * pad);
  const y = a => H - pad - (a / max) * (H - 2 * pad);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'spectrum', 'aria-label': `Vibration spectrum from ${spectrum[0].hz} to ${spectrum.at(-1).hz} hertz, strongest near ${fmt(dominantHz, 1)} hertz` });
  svg.append(svgEl('polyline', { points: spectrum.map(p => `${x(p.hz).toFixed(1)},${y(p.amp).toFixed(1)}`).join(' '), class: 'spectrum-line', fill: 'none' }));
  svg.append(svgEl('line', { x1: x(dominantHz).toFixed(1), x2: x(dominantHz).toFixed(1), y1: pad, y2: H - pad, class: 'spectrum-peak' }));
  return svg;
}

export default function mount(root, ctx) {
  const st = { running: false, abort: null };
  const start = el('button', { type: 'button', class: 'btn btn-primary btn-big', id: 'vib-start', text: 'Start 20 s recording' });
  const progress = el('progress', { id: 'vib-progress', max: String(RECORD_SEC), value: '0', hidden: true, 'aria-label': 'Recording progress' });
  const left = el('p', { class: 'readout', id: 'vib-left', 'aria-live': 'off', text: '' });
  const status = el('div', { id: 'vib-status', 'aria-live': 'polite' });
  const result = el('div', { id: 'vib-result' });
  const say = (kind, title, message) => { status.replaceChildren(stateBox(kind, title, message)); announce(`${title} ${message || ''}`); };

  async function run() {
    st.running = true; st.abort = new AbortController();
    start.textContent = 'Stop'; progress.hidden = false; progress.value = 0; result.replaceChildren();
    let release = () => {};
    try {
      const perm = await requestMotionPermission(); // inside the tap, as iOS requires
      if (perm === 'unsupported') { say('error', 'Not supported.', MOTION_MESSAGES.unsupported); return; }
      if (perm === 'denied') { say('error', 'Motion access denied.', MOTION_MESSAGES.denied); return; }
      release = await keepAwake();
      say('loading', 'Recording...', 'Keep the phone still and the page open.');
      const t0 = performance.now();
      const timer = setInterval(() => { const s = (performance.now() - t0) / 1000; progress.value = Math.min(RECORD_SEC, s); left.textContent = `${Math.max(0, Math.ceil(RECORD_SEC - s))} s left`; }, 250);
      let rec;
      try { rec = await recordMotion(RECORD_SEC, { signal: st.abort.signal }); } finally { clearInterval(timer); }
      if (rec.status === 'no-events') { say('error', 'No sensor readings.', MOTION_MESSAGES['no-events']); return; }
      const m = vibrationMetrics(rec.samples, { rateHz: rec.rateHz });
      if (m.status === 'too-slow') { say('error', 'Sensor too slow.', `This phone sends about ${fmt(m.rateHz, 0)} readings a second here; at least ${MIN_RATE_HZ} are needed. Try Chrome on Android, or another phone.`); return; }
      if (m.status !== 'ok') { say('error', 'Not enough data.', 'Record the full 20 seconds without leaving the page.'); return; }
      const measurements = vibrationMeasurements(m);
      const settings = getSettings();
      const saved = addResult({
        kind: 'vibration', title: `Vibration, ${fmt(m.rmsMs2, 4)} m/s2`, measurements,
        device: { userAgent: navigator.userAgent, sampleRate: Math.round(m.rateHz), micFlags: {} },
        assetHint: { nickname: settings.assetNickname, serial: settings.assetSerial }, notes: '',
      });
      const band = vibrationBand(m.rmsMs2);
      say('success', 'Done.', 'Saved in Results.');
      result.replaceChildren(el('section', { class: 'card', 'aria-labelledby': 'vib-result-h' },
        el('h2', { id: 'vib-result-h', text: 'Result' }),
        el('dl', { class: 'big-readings' },
          el('div', {}, el('dt', { text: 'RMS' }), el('dd', { class: 'num', text: `${fmt(m.rmsMs2, 4)} m/s2` })),
          el('div', {}, el('dt', { text: 'Strongest at' }), el('dd', { class: 'num', text: `${fmt(m.dominantHz, 1)} Hz` })),
          el('div', {}, el('dt', { text: 'Level' }), el('dd', { id: 'vib-band', text: band }))),
        spectrumSvg(m.spectrum, m.dominantHz),
        el('p', { class: 'hint', text: `Sensor rate about ${fmt(m.rateHz, 0)} Hz, so nothing above ${fmt(m.nyquistHz, 0)} Hz is visible. The level word is relative: record again after changing isolation feet and compare the RMS. For rumble in the usual sense, use the desktop app.` }),
        measurementTable(measurements, { caption: 'Vibration measurements' }),
        el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn btn-secondary', id: 'vib-export', text: 'Export...', onclick: () => ctx.openResult(saved.id) }))));
    } catch (error) {
      if (error?.name === 'AbortError') say('empty', 'Stopped.', 'Tap Start to try again.');
      else say('error', 'Could not record.', error?.message || String(error));
    } finally {
      release(); st.running = false; start.textContent = 'Start 20 s recording'; progress.hidden = true; left.textContent = '';
    }
  }

  start.addEventListener('click', () => { if (st.running) st.abort.abort(); else run(); });
  root.replaceChildren(
    el('h1', { text: 'Vibration' }),
    el('p', { class: 'lede', text: 'Place the phone flat on the plinth, away from the tone arm, then record 20 seconds with the platter spinning and the stylus up.' }),
    el('div', { class: 'row' }, start, left), progress, status, result);
  if (!motionSupported()) say('error', 'Not supported.', MOTION_MESSAGES.unsupported);
  else say('empty', 'Ready.', 'Tap Start. On iPhone you will be asked to allow motion access.');
  return () => { st.abort?.abort(); };
}
