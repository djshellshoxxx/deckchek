// audio:quality runner (SPEC-35): Setup (output, input, level) → Measure → Results.
// Also offers the stimulus as a WAV and analysis of a recording the user made elsewhere.
//
// Lifecycle and ownership: every action (Run, Analyse a recording, Stop, Run again) takes a new
// generation, and every await re-checks it, so a late capture, analysis or file decode from a
// disposed runner or a superseded action never renders, toasts or calls ctx.finish. A live run is
// cancelled through its AbortSignal: that stops only the playback handle this run started and cancels
// only the capture session it started (see app/devices/audio-session.js); out.stopAll() is never used.
// Only a valid analysis (with measurements) is passed to ctx.finish and saved.
//
// ctx: {test, profile, finish(result), skip(reason)?} plus optional injected I/O for tests: audioOut, startCapture
// (startLiveSession-compatible), listInputs, liveAvailable, pickFile, decodeAudioFile, download, wait.

import { h, esc, formatNumber, download as saveDownload, pickFile as chooseFile } from '../dom.js';
import { icon, chip } from '../icons.js';
import { audioOut as defaultOut, SAFETY_COPY, ABS_MAX_DBFS } from '../../audio-out.js';
import { listInputDevices, startLiveSession, classifyCaptureError, liveAvailable as nativeCapture, decodeAudioFile as decodeFile } from '../audio-io.js';
import { runWithCapture, confirmCaptureBusy } from '../capture-busy.js';
import { createPairPicker, currentPairs } from '../pair-picker.js';
import { settings, findProfile } from '../state.js';
import { encodeWav16 } from '../../advanced.js';
import { exportStimulus, analyzeAudioQuality, safePlayLevel, MIN_PLAY_LEVEL_DBFS } from '../../audio-quality.js';
import { runQualitySession, qualityResult } from '../../devices/audio-session.js';
import { linePlot } from '../plots.js';
import { stepsCard, readoutGrid, findingList } from './runners.js';
import { announce, toast } from '../live.js';

/** A recording made outside DeckChek may start this long before the test signal. */
export const FILE_MAX_LAG_SEC = 10;
const PHASE_TEXT = { recording: 'Starting the recording…', playing: 'Playing the test signal. Do not touch the unit…', analysing: 'Analysing…' };
const PHASE_INDEX = { recording: 0, playing: 1, analysing: 2 };
const HIDDEN_READOUTS = ['aq_noise_unweighted_dbfs', 'aq_thdn_db', 'aq_clock_offset_ppm', 'aq_latency_ms'];
const cancelledError = () => Object.assign(new Error('The measurement was stopped.'), { code: 'cancelled', cancelled: true });

/** Default capture: a live session (owner-scoped stop/cancel), with "Stop <holder> and continue" when the input is busy. */
function liveCapture({ signal, ...opts }) {
  const start = () => (signal?.aborted ? Promise.reject(cancelledError()) : startLiveSession(opts));
  // A busy dialog answered after the run was cancelled must not stop the other feature's capture.
  const confirm = async (busy, o) => (await confirmCaptureBusy(busy, o)) && !signal?.aborted;
  return runWithCapture(start, { action: 'run the output quality test', confirm });
}

/** Title and message for a failed live run. */
function failureCopy(error) {
  if (error?.name === 'AudioSessionError') {
    const titles = { preempted: 'Capture stopped', 'capture-lost': 'The recording stopped early', unsupported: 'Needs the desktop app' };
    return { title: titles[error.code] || 'Measurement stopped', message: error.message };
  }
  if (error?.name === 'AudioOutError') return { title: 'Playback failed', message: error.message || String(error) };
  const c = classifyCaptureError(error);
  return { title: c.title || 'Measurement failed', message: c.message || String(error?.message || error) };
}

export function runAudio(host, ctx) {
  const { test, profile } = ctx;
  const io = {
    out: ctx.audioOut || defaultOut,
    startCapture: ctx.startCapture || liveCapture,
    listInputs: ctx.listInputs || listInputDevices,
    liveAvailable: ctx.liveAvailable || nativeCapture,
    pickFile: ctx.pickFile || chooseFile,
    decodeAudioFile: ctx.decodeAudioFile || decodeFile,
    download: ctx.download || saveDownload,
    wait: ctx.wait,
  };
  const st = { outputs: [], inputs: [], output: '', input: settings.deviceName || '', level: safePlayLevel(test.params?.levelDbfs) };
  let disposed = false, generation = 0, run = null, status = null, progress = null, pair = null, view = 'loading';
  const current = gen => !disposed && gen === generation;
  const cancelRun = () => { const r = run; run = null; r?.abort.abort(); };
  /** Start a new action: the running measurement (if any) is cancelled and older completions go stale. */
  const begin = () => { cancelRun(); return ++generation; };
  const setStatus = (gen, text) => { if (current(gen) && status) status.textContent = text; };
  const setPhase = (gen, phase) => {
    setStatus(gen, PHASE_TEXT[phase] || '');
    if (current(gen) && progress && Object.hasOwn(PHASE_INDEX, phase)) {
      progress.value = PHASE_INDEX[phase];
      progress.setAttribute('aria-valuetext', `Stage ${PHASE_INDEX[phase] + 1} of 3: ${PHASE_TEXT[phase]}`);
    }
  };
  const dropPairPicker = () => { pair?.el?.dispatchEvent?.(new Event('pair-picker-dispose')); pair = null; };

  const panel = h('div', { class: 'dev-audio-panel', tabindex: 0, 'aria-label': 'Output quality test panel' });
  panel.append(h('p', { class: 'muted small', role: 'status', text: 'Looking for audio outputs and inputs…' }));
  host.replaceChildren(h('div', { class: 'dev-run-grid' }, h('div', { class: 'dev-run-main' }, panel), h('aside', { class: 'dev-run-side', 'aria-label': 'Test instructions' }, stepsCard(test, { extra: [['Test signal', '≈13 s: silence, 1 kHz tone, level steps, 11 sine steps, crosstalk'], ['Maximum level', '−12 dBFS'], ...(test.params?.condition ? [['When to run it', String(test.params.condition)]] : [])] }))));

  const native = () => Boolean(io.out.supported && io.liveAvailable());
  const safety = () => h('p', { class: 'hint', 'data-safety': '', html: `${icon('warn', { size: 16 })}<span>${esc(SAFETY_COPY)}</span>` });

  async function load() {
    let outputs = [], inputs = [];
    try { outputs = io.out.supported ? (await io.out.listOutputs()) || [] : []; } catch { outputs = []; }
    if (disposed) return;
    try { inputs = (await io.listInputs())?.devices || []; } catch { inputs = []; }
    if (disposed) return;
    st.outputs = outputs; st.inputs = inputs;
    if (!outputs.some(o => o.name === st.output)) st.output = (outputs.find(o => o.isDefault) || outputs[0])?.name || '';
    if (!inputs.some(d => d.name === st.input)) st.input = (inputs.find(d => d.isDefault) || inputs[0])?.name || '';
    setup();
  }

  function field(id, label, control, help = '') {
    return h('label', { class: 'field', for: id }, h('span', { class: 'field-label', text: label }), control, help ? h('span', { class: 'field-help', text: help }) : null);
  }
  function select(id, items, value, onChange) {
    const sel = h('select', { id });
    items.forEach(n => sel.append(h('option', { value: n, text: n, selected: n === value ? true : null })));
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  /** Setup view. `error`: the last attempt's failure; `note`: a neutral message (e.g. after Stop). */
  function setup({ error = null, note = '', focus = false } = {}) {
    view = 'setup'; progress = null;
    dropPairPicker();
    const live = native();
    const card = h('section', { class: 'card', 'aria-labelledby': 'aq-setup-title' });
    card.append(h('h2', { class: 'card-title', id: 'aq-setup-title', text: 'Output quality test' }), safety());
    if (!live) card.append(h('div', { class: 'banner banner-warn', role: 'status', html: `${chip('warn', 'DESKTOP APP')}<div class="banner-text"><strong>Playing and recording need the DeckChek desktop app</strong><span>You can still save the test signal as a WAV, play it through the device yourself, record the output, and analyse that recording below.</span></div>` }));
    else {
      const grid = h('div', { class: 'field-grid' });
      const calibrationHint = h('p', { class: 'hint' });
      const describeCalibration = () => {
        const cal = findProfile(st.input, settings.sampleRate);
        calibrationHint.innerHTML = `${icon('info', { size: 16 })}<span>${cal ? `Loopback calibration selected for ${esc(cal.deviceName || 'this input')} at ${esc(cal.sampleRate)} Hz (chain THD+N ${esc(formatNumber(cal.thdnPercent ?? NaN, { digits: 3 }))} %). It is applied only if the recorded input and sample rate match.` : 'No loopback calibration for this input: distortion and noise figures include your recording chain. Calibrate on the Calibration screen for the best result.'}</span>`;
      };
      const level = h('input', { id: 'aq-level', type: 'number', min: MIN_PLAY_LEVEL_DBFS, max: ABS_MAX_DBFS, step: 1, value: String(st.level) });
      level.addEventListener('change', e => { st.level = safePlayLevel(e.target.value); e.target.value = String(st.level); });
      grid.append(
        field('aq-out', 'Play the test signal through', select('aq-out', st.outputs.map(o => o.name), st.output, v => { st.output = v; }), 'The audio output that feeds the device under test (its USB sound card, or your interface).'),
        field('aq-in', 'Record the result from', select('aq-in', st.inputs.map(d => d.name), st.input, v => { st.input = v; pair?.refresh?.(); describeCalibration(); }), 'The input the device’s output cable is plugged into.'),
        field('aq-level', 'Peak level (dBFS)', level, 'Never above −12. The tone steps run 8, 28 and 0 dB below this peak.'));
      pair = createPairPicker({ id: 'aq-pair', deviceName: () => st.input });
      if (pair.el) grid.append(pair.el);
      describeCalibration();
      card.append(grid, calibrationHint);
    }
    const banner = h('div', { class: 'aq-banner' });
    if (error) {
      const c = failureCopy(error);
      banner.append(h('div', { class: 'banner banner-fail', role: 'alert', html: `${chip('fail')}<div class="banner-text"><strong>${esc(c.title)}</strong><span>${esc(c.message)} Nothing was saved for this attempt.</span></div>` }));
    }
    status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite', text: note });
    const runBtn = h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'aq-run', disabled: !live || !st.output || !st.input || null, html: `${icon(error ? 'refresh' : 'play', { size: 20 })}<span>${error ? 'Try again' : 'Run the test'}</span>`, onclick: measure });
    const saveWav = h('button', { type: 'button', class: 'btn btn-secondary', id: 'aq-wav', html: `${icon('download', { size: 18 })}<span>Save test signal (WAV)</span>`, onclick: saveStimulus });
    const analyse = h('button', { type: 'button', class: 'btn btn-secondary', id: 'aq-file', html: `${icon('wave', { size: 18 })}<span>Analyse a recording…</span>`, onclick: analyseFile });
    // FS-34 conditional test: a unit without its own audio output records a skip instead of staying "not run".
    const skip = test.params?.condition && typeof ctx.skip === 'function'
      ? h('button', { type: 'button', class: 'btn btn-ghost', id: 'aq-skip', text: 'Skip: no audio output', onclick: () => { if (disposed || run) return; begin(); ctx.skip('The unit has no audio output of its own, so the output quality test does not apply.'); } })
      : null;
    card.append(status, h('p', { class: 'muted small', text: 'Press Enter from the test panel to run, or Esc to stop a measurement.' }), h('div', { class: 'step-footer' }, skip, saveWav, analyse, runBtn));
    panel.replaceChildren(banner, card);
    if (focus) runBtn.focus();
  }

  function measuring(gen) {
    view = 'measuring';
    const card = h('section', { class: 'card', 'aria-labelledby': 'aq-run-title' });
    status = h('p', { class: 'capture-state', role: 'status', 'aria-live': 'polite', text: PHASE_TEXT.recording });
    progress = h('progress', { id: 'aq-progress', max: 3, value: 0, 'aria-label': 'Output quality test stages completed', 'aria-valuetext': `Stage 1 of 3: ${PHASE_TEXT.recording}` });
    const stop = h('button', { type: 'button', class: 'btn btn-secondary', id: 'aq-stop', html: `${icon('stop', { size: 18 })}<span>Stop</span>`, onclick: () => { if (current(gen)) stopMeasurement(); } });
    card.append(h('h2', { class: 'card-title', id: 'aq-run-title', text: 'Measuring output quality' }), safety(),
      h('p', { class: 'muted small', text: `${st.output} → ${st.input} · peak ${formatNumber(st.level, { digits: 0 })} dBFS` }), status, progress, h('div', { class: 'step-footer' }, stop));
    dropPairPicker();
    panel.replaceChildren(card);
    stop.focus();
  }

  async function measure() {
    if (run || disposed || !native() || !st.output || !st.input) return;
    const gen = begin();
    const abort = new AbortController();
    run = { gen, abort };
    const cal = findProfile(st.input, settings.sampleRate);
    measuring(gen);
    let result = null, failure = null;
    try {
      result = await runQualitySession({
        out: io.out, startCapture: io.startCapture, outputDevice: st.output, inputDevice: st.input, pairs: currentPairs(st.input),
        playLevelDbfs: st.level, sampleRate: 48000, calibrationProfile: cal, profile,
        signal: abort.signal, ...(io.wait ? { wait: io.wait } : {}),
        onPhase: p => setPhase(gen, p),
      });
    } catch (error) { failure = error; }
    if (run?.gen === gen) run = null;
    if (!current(gen)) return; // disposed, stopped or superseded: the result is discarded unseen
    if (failure) { setup({ error: failure, focus: true }); announce(`Output quality test failed. ${failureCopy(failure).message}`); return; }
    showResults(result, { source: 'live' });
  }

  function stopMeasurement() {
    begin(); // cancels the run: its own voice and capture only
    setup({ note: 'Stopped. The test signal was stopped and nothing was saved.', focus: true });
    announce('Output quality test stopped');
  }

  function saveStimulus() {
    const s = exportStimulus({ sampleRate: 48000, levelDbfs: ABS_MAX_DBFS });
    io.download('deckchek-audio-quality-test.wav', encodeWav16({ left: s.left, right: s.right, sampleRate: s.sampleRate }), 'audio/wav');
    toast('Saved. The file peaks at −12 dBFS. Play it from a player at a safe volume, record the device output as a stereo WAV, then analyse it here.', { type: 'info' });
  }

  async function analyseFile() {
    if (run || disposed) return;
    const gen = begin();
    let file = null;
    try { file = await io.pickFile('audio/*,.wav,.flac,.mp3'); } catch { file = null; }
    if (!current(gen) || !file) return;
    setStatus(gen, 'Reading the recording…');
    let result;
    try {
      const audio = await io.decodeAudioFile(file);
      if (!current(gen)) return;
      setStatus(gen, 'Analysing…');
      const meta = exportStimulus({ sampleRate: audio.sampleRate, levelDbfs: ABS_MAX_DBFS }).meta; // the saved WAV peaks at -12 dBFS
      const analysis = analyzeAudioQuality({ left: audio.left, right: audio.right, sampleRate: audio.sampleRate }, meta, { maxLagSec: FILE_MAX_LAG_SEC });
      result = qualityResult(analysis, { profile, extra: { source: file.name, playLevelDbfs: meta.playLevelDbfs, sampleRate: audio.sampleRate, captureIntegrity: { source: 'file', state: 'unobserved', reasons: ['Original recording continuity is not observable from an imported waveform.'] } } });
    } catch (error) {
      if (!current(gen)) return;
      setStatus(gen, '');
      toast(`Could not analyse the recording: ${error?.message || error}`, { type: 'error' });
      return;
    }
    if (!current(gen)) return;
    showResults(result, { source: file.name });
  }

  function showResults(r, { source }) {
    dropPairPicker();
    view = 'results'; status = null; progress = null;
    const word = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'REVIEW';
    const head = h('section', { class: 'card', tabindex: -1, 'aria-labelledby': 'aq-res-title' });
    head.innerHTML = `<div class="card-head"><h2 class="card-title" id="aq-res-title">Output quality · ${esc(word)}</h2><span class="muted small">${esc(source === 'live' ? `${r.extra.outputDevice} → ${r.extra.inputDevice}` : source)}</span></div><p>${esc(r.detail)}</p>`;
    const cards = [head];
    const saved = r.measurements.length > 0;
    if (saved) {
      head.append(readoutGrid(r.measurements.filter(m => !HIDDEN_READOUTS.includes(m.metricId))));
      const plots = h('section', { class: 'card', 'aria-labelledby': 'aq-plot-title' });
      const signed = value => `${value > 0 ? '+' : ''}${formatNumber(value, { digits: 2 })} dB`;
      const figures = [['Left channel', 'devLeftDb'], ['Right channel', 'devRightDb']].map(([label, key]) => `<figure>${linePlot(r.analysis.response.map(p => ({ t: Math.log10(p.hz), v: p[key] })), { title: `${label}: level relative to 1 kHz`, xLabel: 'log10 frequency (Hz): 1.3 = 20 Hz, 4.3 = 20 kHz', yLabel: 'dB', zeroLine: true, dots: true, minSpan: 2 })}<figcaption>${esc(label)}</figcaption></figure>`).join('');
      plots.innerHTML = `<h2 class="card-title" id="aq-plot-title">Frequency response</h2>${figures}<p class="muted small">${esc(r.analysis.response.map(p => `${p.hz >= 1000 ? p.hz / 1000 + 'k' : p.hz} Hz: L ${signed(p.devLeftDb)} / R ${signed(p.devRightDb)}`).join('  ·  '))}</p>`;
      cards.push(plots);
    }
    cards.push(h('section', { class: 'card', 'aria-labelledby': 'aq-find-title' }, h('h2', { class: 'card-title', id: 'aq-find-title', text: `Findings (${r.findings.length})` }), findingList(r.findings)));
    cards.push(h('div', { class: 'step-footer' }, h('span', { class: 'muted small', text: saved ? 'The result is saved to this unit.' : 'Nothing was saved for this attempt.' }),
      h('button', { type: 'button', class: 'btn btn-secondary', id: 'aq-again', html: `${icon('refresh', { size: 18 })}<span>Run again</span>`, onclick: () => { begin(); setup({ focus: true }); } })));
    panel.replaceChildren(...cards);
    head.focus();
    announce(`Output quality ${word}. ${r.detail}`);
    if (saved) ctx.finish({ status: r.status, detail: r.detail, criterion: 'audio-quality', measurements: r.measurements, findings: r.findings, extra: r.extra });
  }

  const onKey = async event => {
    if (disposed || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Escape' && run) { event.preventDefault(); stopMeasurement(); return; }
    const target = event.target;
    if (event.key === 'Enter' && view === 'setup' && !run && native() && st.output && st.input &&
      !target?.isContentEditable && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(target?.tagName)) {
      event.preventDefault();
      await measure();
    }
  };
  host.addEventListener('keydown', onKey);
  load();
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      cancelRun();
      dropPairPicker();
      progress = null;
      host.removeEventListener('keydown', onKey);
    },
  };
}
