// Speed screen (AC-1): record a reference tone for a few seconds and show Hz, pitch % and RPM with an uncertainty.
import { el, fmt, announce, measurementTable, stateBox } from '../lib/ui.js';
import { startMic, captureSeconds, micSupported, MIC_MESSAGES, MicError } from '../lib/audio.js';
import { measureSpeed, speedStatus, liveEstimate, FORMATS, REFERENCES, MIN_SNR_DB } from '../lib/speed.js';
import { keepAwake } from '../lib/motion.js';
import { addResult, getSettings } from '../lib/store.js';

export const CAPTURE_SEC = 4;

export default function mount(root, ctx) {
  const st = { running: false, abort: null, disposed: false };
  const format = el('select', { id: 'speed-format', 'aria-label': 'Record speed' }, ...FORMATS.map(f => el('option', { value: f.id, text: f.label })));
  const ref = el('select', { id: 'speed-ref', 'aria-label': 'Reference tone' }, ...REFERENCES.map(r => el('option', { value: r.hz, text: r.label })));
  const start = el('button', { type: 'button', class: 'btn btn-primary btn-big', id: 'speed-start', text: 'Start' });
  const live = el('p', { class: 'readout', id: 'speed-live', 'aria-live': 'off', text: '- Hz' });
  const level = el('meter', { id: 'speed-level', min: '0', max: '1', value: '0', 'aria-label': 'Input level' });
  const progress = el('progress', { id: 'speed-progress', max: String(CAPTURE_SEC), value: '0', hidden: true, 'aria-label': 'Recording progress' });
  const status = el('div', { id: 'speed-status', 'aria-live': 'polite' });
  const result = el('div', { id: 'speed-result' });

  const say = (kind, title, message) => { status.replaceChildren(stateBox(kind, title, message)); announce(`${title} ${message || ''}`); };
  const empty = () => say('empty', 'Play a 1 kHz test tone and tap Start.', 'Hold the phone close to the speaker or cartridge.');

  async function run() {
    st.running = true;
    const abort = new AbortController(); st.abort = abort;
    start.textContent = 'Stop'; progress.hidden = false; progress.value = 0; result.replaceChildren();
    const nominal = FORMATS.find(f => f.id === format.value).rpm, referenceHz = Number(ref.value);
    let mic, release = () => {};
    try {
      say('loading', 'Waiting for the microphone.', 'Allow it when asked.');
      mic = await startMic({ signal: abort.signal });
      release = await keepAwake();
      if (abort.signal.aborted || mic.signal.aborted) throw new DOMException('Capture stopped', 'AbortError');
      const kept = [];
      say('loading', 'Listening...', `${CAPTURE_SEC} seconds.`);
      const samples = await captureSeconds(CAPTURE_SEC, {
        mic, signal: abort.signal,
        onChunk: (block, total) => {
          let peak = 0; for (let i = 0; i < block.length; i++) peak = Math.max(peak, Math.abs(block[i]));
          level.value = Math.min(1, peak);
          progress.value = Math.min(CAPTURE_SEC, total / mic.sampleRate);
          kept.push(block);
          if (kept.length % 6 === 0) {
            const tail = new Float32Array(Math.ceil(mic.sampleRate * 0.5));
            let at = tail.length;
            for (let i = kept.length - 1; i >= 0 && at > 0; i--) { const b = kept[i], n = Math.min(b.length, at); tail.set(b.subarray(b.length - n), at - n); at -= n; }
            const est = liveEstimate(tail, mic.sampleRate, { referenceHz, nominalRpm: nominal });
            if (est) live.textContent = `${fmt(est.hz, 1)} Hz`;
          }
        },
      });
      if (abort.signal.aborted || mic.signal.aborted) throw new DOMException('Capture stopped', 'AbortError');
      mic.stop();
      say('loading', 'Working out the speed...', '');
      await new Promise(r => setTimeout(r, 30)); // let the message paint before the synchronous analysis
      if (abort.signal.aborted) throw new DOMException('Capture stopped', 'AbortError');
      const measurements = measureSpeed(samples, mic.sampleRate, { referenceHz, nominalRpm: nominal });
      const state = speedStatus(measurements);
      const settings = getSettings();
      const run = addResult({
        kind: 'speed', title: `Speed ${FORMATS.find(f => f.id === format.value).label}, ${REFERENCES.find(r => r.hz === referenceHz).label}`, measurements,
        device: { userAgent: navigator.userAgent, sampleRate: mic.sampleRate, micFlags: mic.flags.applied },
        assetHint: { nickname: settings.assetNickname, serial: settings.assetSerial }, notes: '',
      });
      renderResult(run, measurements, state, mic.flags);
    } catch (error) {
      if (st.disposed) return;
      if (error?.name === 'AbortError') say('empty', 'Stopped.', 'Tap Start to try again.');
      else if (error instanceof MicError) say('error', error.kind === 'unsupported' ? 'Not supported.' : 'Microphone problem.', error.message);
      else say('error', 'Could not measure.', error?.message || String(error));
    } finally {
      mic?.stop(); release();
      if (!st.disposed && st.abort === abort) { st.running = false; st.abort = null; start.textContent = 'Start'; progress.hidden = true; level.value = 0; }
    }
  }

  function renderResult(run, measurements, state, flags) {
    const by = id => measurements.find(m => m.metricId === id);
    const rpm = by('speed.rpm'), pitch = by('speed.pitchPercent'), hz = by('speed.measuredHz');
    if (state === 'none') { say('error', 'No tone found.', 'Check the test record is playing and the phone is close to the sound.'); return; }
    if (state === 'weak') say('partial', 'Weak tone, move the phone closer.', `The tone is only ${fmt(by('speed.snrDb').value, 0)} dB above the noise (needs ${MIN_SNR_DB} dB), so treat these numbers with care.`);
    else say('success', 'Done.', 'Saved in Results.');
    const notes = [];
    if (flags.ignored.length) notes.push(`This browser left audio processing on (${flags.ignored.join(', ')}), which can bend the reading.`);
    if (flags.unknown.length === 3) notes.push('This browser does not say whether it honoured the raw-audio request.');
    result.replaceChildren(el('section', { class: 'card', 'aria-labelledby': 'speed-result-h' },
      el('h2', { id: 'speed-result-h', text: 'Result' }),
      el('dl', { class: 'big-readings' },
        el('div', {}, el('dt', { text: 'Measured' }), el('dd', { class: 'num', text: `${fmt(hz.value, 1)} Hz` })),
        el('div', {}, el('dt', { text: 'Pitch' }), el('dd', { class: 'num', text: `${pitch.value > 0 ? '+' : ''}${fmt(pitch.value, 2)} %` }), el('dd', { class: 'small', text: `± ${fmt(pitch.uncertainty, 2)} %` })),
        el('div', {}, el('dt', { text: 'Speed' }), el('dd', { class: 'num', text: `${fmt(rpm.value, 2)} rpm` }), el('dd', { class: 'small', text: `± ${fmt(rpm.uncertainty, 3)} rpm` }))),
      ...notes.map(n => el('p', { class: 'hint', text: n })),
      measurementTable(measurements, { caption: 'Speed measurements' }),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn btn-secondary', id: 'speed-export', text: 'Export...', onclick: () => ctx.openResult(run.id) }))));
  }

  start.addEventListener('click', () => { if (st.running) st.abort.abort(); else run(); });
  root.replaceChildren(
    el('h1', { text: 'Speed' }),
    el('p', { class: 'lede', text: 'Measures platter speed from a test-tone record, using the phone microphone.' }),
    el('div', { class: 'field-row' },
      el('label', { for: 'speed-format', text: 'Record speed' }), format,
      el('label', { for: 'speed-ref', text: 'Reference tone' }), ref),
    el('div', { class: 'row' }, start, level, live), progress, status, result);
  if (!micSupported()) say('error', 'Not supported.', MIC_MESSAGES.unsupported);
  else empty();
  return () => { st.disposed = true; st.abort?.abort(); };
}
