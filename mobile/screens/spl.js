// SPL screen: an indicative sound level. Always labelled uncalibrated (+/- 10 dB) until a single-point calibration.
import { el, fmt, announce, measurementTable, stateBox } from '../lib/ui.js';
import { startMic, captureSeconds, micSupported, MIC_MESSAGES, MicError } from '../lib/audio.js';
import { keepAwake } from '../lib/motion.js';
import { splMeasurements, levelDbfs, calibrationOffset, ASSUMED_OFFSET_DB, UNCERTAINTY_DB } from '../lib/spl.js';
import { addResult, getSettings, setSettings } from '../lib/store.js';

export const MEASURE_SEC = 5;

export default function mount(root, ctx) {
  const st = { running: false, abort: null, lastDbfs: null, lastWeighting: null };
  const settings = getSettings();
  const weighting = el('select', { id: 'spl-weighting', 'aria-label': 'Weighting' }, el('option', { value: 'A', text: 'A-weighted (dBA)' }), el('option', { value: 'C', text: 'C-weighted (dBC)' }));
  weighting.value = settings.splWeighting === 'C' ? 'C' : 'A';
  const banner = el('p', { class: 'state state-warn', id: 'spl-banner', role: 'note' });
  const start = el('button', { type: 'button', class: 'btn btn-primary btn-big', id: 'spl-start', text: `Measure ${MEASURE_SEC} s` });
  const level = el('meter', { id: 'spl-level', min: '0', max: '1', value: '0', 'aria-label': 'Input level' });
  const status = el('div', { id: 'spl-status', 'aria-live': 'polite' });
  const result = el('div', { id: 'spl-result' });
  const refInput = el('input', { id: 'spl-ref', type: 'number', inputmode: 'decimal', min: '30', max: '140', step: '0.1', placeholder: 'e.g. 94', 'aria-describedby': 'spl-cal-help' });
  const calBtn = el('button', { type: 'button', class: 'btn btn-secondary', id: 'spl-cal', text: 'Calibrate to this reference', disabled: true });
  const calNote = el('p', { id: 'spl-cal-help', class: 'small' });
  const say = (kind, title, message) => { status.replaceChildren(stateBox(kind, title, message)); announce(`${title} ${message || ''}`); };

  function paintBanner() {
    const s = getSettings();
    banner.textContent = s.splOffsetDb == null ? `Uncalibrated, ± ${UNCERTAINTY_DB} dB. A phone microphone and its gain are not a sound level meter.` : 'Single-point calibration, about ± 3 dB at best. The microphone response is still unknown.';
    calNote.textContent = s.splOffsetDb == null ? `Until you calibrate, the level assumes ${ASSUMED_OFFSET_DB} dB at full scale.` : `Calibration offset ${fmt(s.splOffsetDb, 1)} dB is stored on this phone.`;
  }

  async function run() {
    st.running = true; st.abort = new AbortController();
    start.textContent = 'Stop'; result.replaceChildren();
    let release = () => {};
    try {
      say('loading', 'Waiting for the microphone.', 'Allow it when asked.');
      const mic = await startMic();
      release = await keepAwake();
      say('loading', 'Measuring...', `${MEASURE_SEC} seconds.`);
      const samples = await captureSeconds(MEASURE_SEC, { signal: st.abort.signal, onChunk: block => { let p = 0; for (let i = 0; i < block.length; i++) p = Math.max(p, Math.abs(block[i])); level.value = Math.min(1, p); } });
      mic.stop();
      const kind = weighting.value;
      setSettings({ splWeighting: kind });
      const s = getSettings();
      const calibrated = s.splOffsetDb != null;
      const measurements = splMeasurements(samples, mic.sampleRate, { weighting: kind, offsetDb: calibrated ? s.splOffsetDb : ASSUMED_OFFSET_DB, calibrated });
      st.lastDbfs = measurements.find(m => m.metricId === 'spl.levelDbfs').value; st.lastWeighting = kind;
      calBtn.disabled = false;
      const main = measurements[0];
      const saved = addResult({
        kind: 'spl', title: `Sound level ${fmt(main.value, 0)} ${main.unit} (indicative)`, measurements,
        device: { userAgent: navigator.userAgent, sampleRate: mic.sampleRate, micFlags: mic.flags.applied },
        assetHint: { nickname: s.assetNickname, serial: s.assetSerial }, notes: calibrated ? 'single-point calibration' : 'uncalibrated',
      });
      say('success', 'Done.', 'Saved in Results.');
      result.replaceChildren(el('section', { class: 'card', 'aria-labelledby': 'spl-result-h' },
        el('h2', { id: 'spl-result-h', text: 'Result' }),
        el('p', { class: 'readout num', id: 'spl-value', text: `${fmt(main.value, 0)} ${main.unit}` }),
        el('p', { class: 'hint', text: `± ${fmt(main.uncertainty, 0)} dB. Indicative only.` }),
        measurementTable(measurements, { caption: 'Sound level measurements' }),
        el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn btn-secondary', id: 'spl-export', text: 'Export...', onclick: () => ctx.openResult(saved.id) }))));
    } catch (error) {
      if (error?.name === 'AbortError') say('empty', 'Stopped.', 'Tap Measure to try again.');
      else if (error instanceof MicError) say('error', error.kind === 'unsupported' ? 'Not supported.' : 'Microphone problem.', error.message);
      else say('error', 'Could not measure.', error?.message || String(error));
    } finally {
      release(); st.running = false; start.textContent = `Measure ${MEASURE_SEC} s`; level.value = 0;
    }
  }

  calBtn.addEventListener('click', () => {
    const ref = Number(refInput.value);
    if (!(ref >= 30 && ref <= 140) || st.lastDbfs == null) { say('error', 'Enter the reference level.', 'Type what a real meter or calibrator shows (30 to 140 dB), after measuring the same sound here.'); return; }
    setSettings({ splOffsetDb: calibrationOffset(ref, st.lastDbfs) });
    paintBanner();
    say('success', 'Calibrated.', 'The next measurement uses this offset.');
  });

  start.addEventListener('click', () => { if (st.running) st.abort.abort(); else run(); });
  root.replaceChildren(
    el('h1', { text: 'Sound level' }),
    el('p', { class: 'lede', text: 'A rough sound level from the phone microphone.' }),
    banner,
    el('div', { class: 'field-row' }, el('label', { for: 'spl-weighting', text: 'Weighting' }), weighting),
    el('div', { class: 'row' }, start, level), status, result,
    el('section', { class: 'card', 'aria-labelledby': 'spl-cal-h' },
      el('h2', { id: 'spl-cal-h', text: 'Calibrate (optional)' }),
      el('p', { class: 'small', text: 'Measure a sound once, read the same sound on a real meter or calibrator, type that reading, and tap the button.' }),
      el('div', { class: 'field-row' }, el('label', { for: 'spl-ref', text: 'Reference reading (dB)' }), refInput),
      el('div', { class: 'row' }, calBtn,
        el('button', { type: 'button', class: 'btn btn-secondary', id: 'spl-cal-clear', text: 'Clear calibration', onclick: () => { setSettings({ splOffsetDb: null }); paintBanner(); announce('Calibration cleared.'); } })),
      calNote));
  paintBanner();
  if (!micSupported()) say('error', 'Not supported.', MIC_MESSAGES.unsupported);
  else say('empty', 'Ready.', 'Put the phone where you want to measure and tap Measure.');
  return () => { st.abort?.abort(); };
}
