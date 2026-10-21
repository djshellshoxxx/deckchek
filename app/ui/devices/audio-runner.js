// audio:quality runner (SPEC-35): Setup (output, input, level) → Measure → Results.
// Also offers the stimulus as a WAV and analysis of a recording the user made elsewhere.

import { h, esc, formatNumber, download, pickFile } from '../dom.js';
import { icon, chip } from '../icons.js';
import { audioOut as defaultOut, SAFETY_COPY } from '../../audio-out.js';
import { listInputDevices, captureClip, classifyCaptureError, liveAvailable, decodeAudioFile } from '../audio-io.js';
import { currentPairs } from '../pair-picker.js';
import { settings, findProfile } from '../state.js';
import { encodeWav16 } from '../../advanced.js';
import { buildStimulus, analyzeAudioQuality, evaluateAudioQuality, issueFindings, profileSpecNotes } from '../../audio-quality.js';
import { runQualitySession } from '../../devices/audio-session.js';
import { linePlot } from '../plots.js';
import { stepsCard, readoutGrid, findingList } from './runners.js';
import { announce, toast } from '../live.js';

export function runAudio(host, ctx) {
  const { test, profile } = ctx;
  const out = ctx.audioOut || defaultOut;
  const capture = ctx.capture || captureClip;
  const st = { outputs: [], inputs: [], output: '', input: settings.deviceName || '', level: Number(test.params?.levelDbfs) || -12, busy: false };
  const panel = h('div', { class: 'dev-audio-panel' });
  host.replaceChildren(h('div', { class: 'dev-run-grid' }, h('div', { class: 'dev-run-main' }, panel), h('aside', { class: 'dev-run-side', 'aria-label': 'Test instructions' }, stepsCard(test, { extra: [['Test signal', '≈13 s: noise, 1 kHz tone, level steps, 11 sine steps, crosstalk'], ['Maximum level', '−12 dBFS']] }))));

  async function load() {
    try { st.outputs = out.supported ? await out.listOutputs() : []; } catch { st.outputs = []; }
    try { st.inputs = (await listInputDevices()).devices || []; } catch { st.inputs = []; }
    const def = st.outputs.find(o => o.isDefault) || st.outputs[0];
    st.output ||= def?.name || '';
    st.input ||= (st.inputs.find(d => d.isDefault) || st.inputs[0])?.name || '';
    setup();
  }

  function field(id, label, control, help = '') {
    return h('label', { class: 'field', for: id }, h('span', { class: 'field-label', text: label }), control, help ? h('span', { class: 'field-help', text: help }) : null);
  }
  const select = (id, items, value, onChange) => {
    const sel = h('select', { id });
    items.forEach(n => sel.append(h('option', { value: n, text: n, selected: n === value ? true : null })));
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  };

  function setup() {
    const native = out.supported && liveAvailable();
    const card = h('section', { class: 'card', 'aria-labelledby': 'aq-setup-title' });
    card.append(h('h2', { class: 'card-title', id: 'aq-setup-title', text: 'Output quality test' }), h('p', { class: 'hint', html: `${icon('warn', { size: 16 })}<span>${esc(SAFETY_COPY)}</span>` }));
    if (!native) card.append(h('div', { class: 'banner banner-warn', role: 'status', html: `${chip('warn', 'DESKTOP APP')}<div class="banner-text"><strong>Playing and recording need the DeckChek desktop app</strong><span>You can still save the test signal as a WAV, play it through the device yourself, record the output, and analyse that recording below.</span></div>` }));
    else {
      const grid = h('div', { class: 'field-grid' });
      grid.append(
        field('aq-out', 'Play the test signal through', select('aq-out', st.outputs.map(o => o.name), st.output, v => { st.output = v; }), 'The audio output that feeds the device under test (its USB sound card, or your interface).'),
        field('aq-in', 'Record the result from', select('aq-in', st.inputs.map(d => d.name), st.input, v => { st.input = v; }), 'The input the device’s output cable is plugged into.'),
        field('aq-level', 'Peak level (dBFS)', h('input', { id: 'aq-level', type: 'number', min: -60, max: -12, step: 1, value: String(st.level), onchange: e => { st.level = Math.min(-12, Math.max(-60, Number(e.target.value) || -12)); e.target.value = String(st.level); } }), 'Never above −12. The tone steps run 8, 28 and 0 dB relative to this peak.'));
      card.append(grid);
      const cal = findProfile(st.input, settings.sampleRate);
      card.append(h('p', { class: 'hint', html: `${icon('info', { size: 16 })}<span>${cal ? `Using the loopback calibration for ${esc(cal.deviceName || 'this input')} (chain THD+N ${esc(formatNumber(cal.thdnPercent ?? NaN, { digits: 3 }))} %).` : 'No loopback calibration for this input: distortion and noise figures include your recording chain. Calibrate on the Calibration screen for the best result.'}</span>` }));
    }
    const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
    const run = h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'aq-run', disabled: !native || !st.output || !st.input || null, html: `${icon('play', { size: 20 })}<span>Run the test</span>` });
    run.addEventListener('click', async () => {
      if (st.busy) return;
      st.busy = true; run.disabled = true; run.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Measuring…</span>';
      const cal2 = findProfile(st.input, settings.sampleRate);
      try {
        const r = await runQualitySession({ out, capture, outputDevice: st.output, inputDevice: st.input, pairs: currentPairs(st.input), playLevelDbfs: st.level, sampleRate: 48000, chainFloor: cal2?.thdnPercent > 0 ? { thdnPercent: cal2.thdnPercent } : null, calibrated: !!cal2, profile,
          onPhase: p => { status.textContent = { recording: 'Recording…', playing: 'Playing the test signal — do not touch the unit…', analysing: 'Analysing…' }[p] || ''; } });
        showResults(r, { source: 'live' });
      } catch (error) {
        const c = classifyCaptureError(error);
        status.textContent = '';
        panel.prepend(h('div', { class: 'banner banner-fail', role: 'alert', html: `${chip('fail')}<div class="banner-text"><strong>${esc(error?.code === 'unsupported' || error?.name === 'AudioOutError' ? 'Playback failed' : c.title || 'Measurement failed')}</strong><span>${esc(error?.message || c.message || error)}</span></div>` }));
        run.disabled = false; run.innerHTML = `${icon('refresh', { size: 20 })}<span>Try again</span>`;
      } finally { st.busy = false; }
    });
    const saveWav = h('button', { type: 'button', class: 'btn btn-secondary', id: 'aq-wav', html: `${icon('download', { size: 18 })}<span>Save test signal (WAV)</span>`, onclick: () => {
      const s = buildStimulus({ sampleRate: 48000, playLevelDbfs: 0 });
      download('deckchek-audio-quality-test.wav', encodeWav16({ left: s.left, right: s.right, sampleRate: 48000 }), 'audio/wav');
      toast('Saved. Play it from a player at a safe volume, record the device output as a stereo WAV, then analyse it here.', { type: 'info' });
    } });
    const analyse = h('button', { type: 'button', class: 'btn btn-secondary', id: 'aq-file', html: `${icon('wave', { size: 18 })}<span>Analyse a recording…</span>`, onclick: async () => {
      const file = await pickFile('audio/*,.wav,.flac,.mp3');
      if (!file) return;
      status.textContent = 'Reading the recording…';
      try {
        const audio = await decodeAudioFile(file);
        const meta = buildStimulus({ sampleRate: audio.sampleRate, playLevelDbfs: 0 }).meta;
        const analysis = analyzeAudioQuality({ left: audio.left, right: audio.right, sampleRate: audio.sampleRate }, meta, {});
        showResults(finalise(analysis, { source: file.name, playLevelDbfs: 0 }), { source: file.name });
      } catch (error) { status.textContent = ''; toast(`Could not analyse the recording: ${error?.message || error}`, { type: 'error' }); }
    } });
    card.append(status, h('div', { class: 'step-footer' }, saveWav, analyse, run));
    panel.replaceChildren(card);
  }

  function finalise(analysis, extra) {
    if (!analysis.valid) return { analysis, evaluation: null, measurements: [], findings: issueFindings(analysis.issues), status: 'unknown', detail: analysis.issues[0]?.message || 'The recording could not be analysed.', extra: { issues: analysis.issues, ...extra } };
    const evaluation = evaluateAudioQuality(analysis.measurements);
    return { analysis, evaluation, measurements: analysis.measurements, findings: [...evaluation.findings, ...issueFindings(analysis.issues), ...profileSpecNotes(profile)], status: evaluation.status, detail: evaluation.detail, extra: { response: analysis.response, separation: analysis.separation, thresholds: evaluation.results.map(r => ({ id: r.threshold.id, status: r.status, detail: r.detail })), ...extra } };
  }

  function showResults(r, { source }) {
    const head = h('section', { class: 'card', 'aria-labelledby': 'aq-res-title' });
    head.innerHTML = `<div class="card-head"><h2 class="card-title" id="aq-res-title">Output quality · ${esc(r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'REVIEW')}</h2><span class="muted small">${esc(source === 'live' ? `${r.extra.outputDevice} → ${r.extra.inputDevice}` : source)}</span></div><p>${esc(r.detail)}</p>`;
    const cards = [head];
    if (r.measurements.length) {
      head.append(readoutGrid(r.measurements.filter(m => !['aq_noise_unweighted_dbfs', 'aq_thdn_db', 'aq_clock_offset_ppm', 'aq_latency_ms'].includes(m.metricId))));
      const resp = r.analysis.response.map(p => ({ t: Math.log10(p.hz), v: p.devDb }));
      const plots = h('section', { class: 'card', 'aria-labelledby': 'aq-plot-title' });
      plots.innerHTML = `<h2 class="card-title" id="aq-plot-title">Frequency response</h2><figure>${linePlot(resp, { title: 'Level relative to 1 kHz', xLabel: 'log10 frequency (Hz): 1.3 = 20 Hz, 4.3 = 20 kHz', yLabel: 'dB', zeroLine: true, dots: true, minSpan: 2 })}<figcaption class="muted small">${esc(r.analysis.response.map(p => `${p.hz >= 1000 ? p.hz / 1000 + 'k' : p.hz}: ${p.devDb > 0 ? '+' : ''}${formatNumber(p.devDb, { digits: 2 })}`).join('  ·  '))}</figcaption></figure>`;
      cards.push(plots);
    }
    cards.push(h('section', { class: 'card', 'aria-labelledby': 'aq-find-title' }, h('h2', { class: 'card-title', id: 'aq-find-title', text: `Findings (${r.findings.length})` }), findingList(r.findings)));
    cards.push(h('div', { class: 'step-footer' }, h('span', { class: 'muted small', text: r.status === 'unknown' && !r.measurements.length ? 'Nothing was saved for this attempt.' : 'Result saved to this unit.' }), h('button', { type: 'button', class: 'btn btn-secondary', id: 'aq-again', html: `${icon('refresh', { size: 18 })}<span>Run again</span>`, onclick: setup })));
    panel.replaceChildren(...cards);
    announce(`Output quality ${r.status}. ${r.detail}`);
    if (r.measurements.length) ctx.finish({ status: r.status, detail: r.detail, criterion: 'audio-quality', measurements: r.measurements, findings: r.findings, extra: r.extra });
  }

  load();
  return { dispose() { out.stopAll?.().catch(() => {}); } };
}
