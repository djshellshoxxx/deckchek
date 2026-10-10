// timecode:format-check runner: Setup (format, speed, source) → Capture
// (live or file) → Results (carrier, speed, phase, balance, SNR, dropouts,
// plain-English findings, X/Y scope and phase-over-time plots).

import { h, esc, formatNumber, formatDuration } from '../dom.js';
import { icon, chip } from '../icons.js';
import { analyzeTimecode, mergeFormats, findFormat } from '../../timecode.js';
import { evaluateOutcome } from '../../devices/dispatch.js';
import { decodeAudioFile, startLiveSession, liveAvailable, classifyCaptureError } from '../audio-io.js';
import { createPairPicker, currentPairs } from '../pair-picker.js';
import { createStereoMeter } from '../meters.js';
import { scopePlot, linePlot } from '../plots.js';
import { settings } from '../state.js';
import { stepsCard, readoutGrid, findingList } from './runners.js';
import { announce, toast } from '../live.js';

const RPMS = [['33.333333', '33⅓ RPM'], ['45', '45 RPM']];
const STEPS = [['setup', 'Setup'], ['capture', 'Capture'], ['results', 'Results']];

export function runTimecode(host, ctx) {
  const { test, profile } = ctx;
  const formats = mergeFormats(profile.timecode?.formats || []);
  const st = {
    step: 'setup', source: liveAvailable() ? 'live' : 'file', file: null, seconds: 10, session: null,
    format: (findFormat(test.params?.format, formats) || formats[0]).name,
    rpm: Math.abs(Number(test.params?.nominalRpm) - 45) < .01 ? '45' : '33.333333',
  };
  const stepper = h('ol', { class: 'stepper', 'aria-label': 'Progress' });
  const panel = h('div', { class: 'dev-tc-panel' });
  const side = stepsCard(test, { extra: [['Format', test.params?.format || '—'], ['Nominal speed', `${formatNumber(Number(test.params?.nominalRpm) || 33.333, { digits: 2 })} RPM`]] });
  host.replaceChildren(stepper, h('div', { class: 'dev-run-grid' }, h('div', { class: 'dev-run-main' }, panel), h('aside', { class: 'dev-run-side', 'aria-label': 'Test instructions' }, side)));

  function renderStepper() {
    const idx = STEPS.findIndex(([id]) => id === st.step);
    stepper.replaceChildren(...STEPS.map(([id, label], i) => h('li', {}, h('span', { class: `step step-${i === idx ? 'current' : i < idx ? 'done' : 'upcoming'}`, 'aria-current': i === idx ? 'step' : null },
      h('span', { class: 'step-num', html: i < idx ? icon('check', { size: 16 }) : String(i + 1) }), h('span', { class: 'step-label', text: label })))));
  }
  function go(step) { st.step = step; renderStepper(); ({ setup, capture, results: () => {} })[step]?.(); }

  function setup() {
    const fmt = formats.find(f => f.name === st.format);
    const card = h('section', { class: 'card', 'aria-labelledby': 'tc-setup-title' });
    card.append(h('h2', { class: 'card-title', id: 'tc-setup-title', text: 'Timecode settings' }));
    const grid = h('div', { class: 'field-grid' });
    const fSel = h('select', { id: 'tc-format' });
    formats.forEach(f => fSel.append(h('option', { value: f.name, text: `${f.name} · ${formatNumber(f.carrierHz, { digits: 0 })} Hz${f.confidence === 'confirmed' ? '' : ' (unverified)'}`, selected: f.name === st.format ? true : null })));
    fSel.addEventListener('change', () => { st.format = fSel.value; setup(); });
    const rSel = h('select', { id: 'tc-rpm' });
    RPMS.forEach(([v, t]) => rSel.append(h('option', { value: v, text: t, selected: v === st.rpm ? true : null })));
    rSel.addEventListener('change', () => { st.rpm = rSel.value; });
    grid.append(h('label', { class: 'field', for: 'tc-format' }, h('span', { class: 'field-label', text: 'Timecode format' }), fSel, h('span', { class: 'field-help', text: fmt?.notes || '' })),
      h('label', { class: 'field', for: 'tc-rpm' }, h('span', { class: 'field-label', text: 'Platter speed' }), rSel, h('span', { class: 'field-help', text: 'Pitch at 0 %, quartz/reset engaged if the deck has it.' })));
    card.append(grid);
    if (fmt && fmt.confidence !== 'confirmed') card.append(h('p', { class: 'hint hint-warn', html: `${icon('warn', { size: 16 })}<span>The carrier frequency for ${esc(fmt.name)} is not confirmed by public documentation. Speed error may read wrong; phase, balance, SNR and dropouts are still valid.</span>` }));

    const src = h('section', { class: 'card', 'aria-labelledby': 'tc-src-title' });
    src.append(h('h2', { class: 'card-title', id: 'tc-src-title', text: 'Source' }));
    const choices = h('div', { class: 'source-choices', role: 'radiogroup', 'aria-label': 'Audio source' });
    const live = liveAvailable();
    for (const [id, title, sub, ic] of [['live', 'Live capture', live ? `From ${settings.deviceName || 'the default input'}` : 'Available in the desktop app', 'mic'], ['file', 'Load a recording', 'Stereo WAV/FLAC/MP3 of the control signal', 'file']]) {
      const disabled = id === 'live' && !live;
      const b = h('button', { type: 'button', role: 'radio', class: 'source', 'aria-checked': String(st.source === id), 'aria-disabled': disabled ? 'true' : null, 'data-source': id, tabindex: st.source === id ? '0' : '-1', html: `<span class="source-icon">${icon(ic, { size: 26 })}</span><span class="source-text"><strong>${esc(title)}</strong><span>${esc(sub)}</span></span>${disabled ? '<span class="badge">DESKTOP APP</span>' : ''}` });
      b.addEventListener('click', () => { if (disabled) { toast('Live capture runs in the DeckChek desktop app. Load a recording instead.'); return; } st.source = id; setup(); });
      choices.append(b);
    }
    src.append(choices);
    let primary;
    if (st.source === 'file') {
      const input = h('input', { type: 'file', id: 'tc-file', class: 'drop-input', accept: 'audio/*,.wav,.aiff,.aif,.flac,.mp3' });
      const drop = h('div', { class: `drop ${st.file ? 'has-file' : ''}` }, input, h('label', { for: 'tc-file', class: 'drop-label', html: `${icon(st.file ? 'file' : 'upload', { size: 28 })}<span class="drop-title">${st.file ? esc(st.file.name) : 'Drop a recording here or browse'}</span><span class="muted small">Record the deck's output while the control vinyl plays at normal speed</span>` }));
      input.addEventListener('change', () => { if (input.files?.[0]) { st.file = input.files[0]; setup(); } });
      drop.addEventListener('dragover', e => { e.preventDefault(); });
      drop.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) { st.file = f; setup(); } });
      src.append(drop);
      primary = h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'tc-analyze', disabled: !st.file, html: `${icon('wave', { size: 20 })}<span>Analyze recording</span>` });
      primary.addEventListener('click', analyzeFile);
    } else {
      const dur = h('select', { id: 'tc-duration' });
      [5, 10, 20, 30].forEach(s => dur.append(h('option', { value: s, text: `${s} s`, selected: s === st.seconds ? true : null })));
      dur.addEventListener('change', () => { st.seconds = Number(dur.value); });
      src.append(h('label', { class: 'field field-inline', for: 'tc-duration' }, h('span', { class: 'field-label', text: 'Capture length' }), dur));
      const pair = createPairPicker({ id: 'tc-pair' });
      if (pair.el) src.append(pair.el);
      primary = h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'tc-to-capture', html: `<span>Continue to capture</span>${icon('arrowRight', { size: 20 })}` });
      primary.addEventListener('click', () => go('capture'));
    }
    panel.replaceChildren(card, src, h('div', { class: 'step-footer' }, h('span', { class: 'muted small', text: 'Needle on the control vinyl, playing forward at normal speed.' }), primary));
  }

  function capture() {
    const card = h('section', { class: 'card', 'aria-labelledby': 'tc-cap-title' });
    card.append(h('h2', { class: 'card-title', id: 'tc-cap-title', text: 'Capture timecode' }));
    const meterHost = h('div', { class: 'meter-host' });
    card.append(meterHost);
    createStereoMeter(meterHost, { variant: 'large', label: 'Timecode input level' });
    const timer = h('div', { class: 'timer num', html: `<span class="timer-val">00:00.0</span><span class="timer-of muted"> / ${formatDuration(st.seconds)}</span>` });
    const state = h('p', { class: 'capture-state muted', role: 'status', text: 'Ready. Start the record, then press Start.' });
    const start = h('button', { type: 'button', class: 'btn btn-record btn-xl', html: `${icon('record', { size: 22 })}<span>Start capture</span>` });
    const back = h('button', { type: 'button', class: 'btn btn-secondary', text: 'Back to setup', onclick: async () => { await st.session?.cancel(); st.session = null; go('setup'); } });
    let tick = null;
    start.addEventListener('click', async () => {
      if (st.session) { stop(); return; }
      try {
        st.session = await startLiveSession({ deviceName: settings.deviceName || null, maxSeconds: st.seconds + 5, pairs: currentPairs() });
      } catch (error) { const c = classifyCaptureError(error); state.textContent = `${c.title}: ${c.message}`; return; }
      start.classList.add('recording'); start.innerHTML = `${icon('stop', { size: 22 })}<span>Stop capture</span>`;
      state.textContent = 'Recording…'; announce('Capture started');
      tick = setInterval(() => { const t = st.session?.elapsed() || 0; timer.querySelector('.timer-val').textContent = formatDuration(t); if (t >= st.seconds) stop(); }, 100);
    });
    async function stop() {
      clearInterval(tick);
      const s = st.session; st.session = null;
      if (!s) return;
      state.textContent = 'Finishing…';
      try { const r = await s.stop(); analyze(r.audio, `Live capture · ${r.deviceName}`); }
      catch (error) { state.textContent = `Capture failed: ${error?.message || error}`; start.classList.remove('recording'); start.innerHTML = `${icon('record', { size: 22 })}<span>Start capture</span>`; }
    }
    card.append(timer, state, h('div', { class: 'capture-buttons' }, start, back));
    panel.replaceChildren(card);
  }

  async function analyzeFile() {
    const btn = panel.querySelector('#tc-analyze');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Analyzing…</span>'; }
    try { analyze(await decodeAudioFile(st.file), st.file.name); }
    catch (error) {
      panel.prepend(h('div', { class: 'banner banner-fail', role: 'alert', html: `${chip('fail')}<div class="banner-text"><strong>Could not read the recording</strong><span>${esc(error?.message || error)}</span></div>` }));
      if (btn) { btn.disabled = false; btn.innerHTML = `${icon('wave', { size: 20 })}<span>Analyze recording</span>`; }
    }
  }

  function analyze(audio, sourceName) {
    const res = analyzeTimecode(audio, { format: st.format, nominalRpm: Number(st.rpm), formats });
    if (res.error) {
      panel.replaceChildren(h('div', { class: 'banner banner-fail', role: 'alert', html: `${chip('fail')}<div class="banner-text"><strong>Timecode analysis failed</strong><span>${esc(res.error)}</span></div>` }), h('div', { class: 'step-footer' }, h('button', { type: 'button', class: 'btn btn-secondary', text: 'Back to setup', onclick: () => go('setup') })));
      return;
    }
    const outcome = evaluateOutcome(test, { measurements: res.measurements, findings: res.findings });
    st.step = 'results'; renderStepper();
    const n = Math.min(audio.left.length, Math.round(audio.sampleRate * .05));
    const off = Math.max(0, Math.floor(audio.left.length / 2) - n);
    const pts = []; for (let i = 0; i < n; i += 2) pts.push([audio.left[off + i], audio.right[off + i]]);
    const ok = res.trace.filter(t => !t.dropout);
    const phase = ok.map(t => ({ t: t.tSec, v: t.phaseDeg }));
    const speed = ok.map(t => ({ t: t.tSec, v: (t.carrierHz / res.expectedCarrierHz - 1) * 100 }));
    const head = h('section', { class: 'card dev-tc-head' });
    head.innerHTML = `<div class="card-head"><h2 class="card-title">${esc(res.format.name)} · ${esc(formatNumber(res.expectedCarrierHz, { digits: 0 }))} Hz expected</h2><span class="muted small">${esc(sourceName)} · direction: ${esc(res.direction)}</span></div>`;
    head.append(readoutGrid(res.measurements));
    const plots = h('section', { class: 'card', 'aria-labelledby': 'tc-plot-title' });
    plots.innerHTML = `<h2 class="card-title" id="tc-plot-title">Signal evidence</h2>
      <div class="dev-tc-plots"><figure class="scope-wrap">${scopePlot(pts, { title: 'X/Y scope (L × R) — a clean ring means good quadrature' })}<figcaption class="muted small">A round ring = healthy 90° phase. An ellipse or line = phase or channel fault; a fuzzy ring = noise.</figcaption></figure>
      <figure>${linePlot(phase, { title: 'L/R phase over time', yLabel: 'phase (deg)', zeroLine: true, minSpan: 20 })}<figcaption class="muted small">Should sit steadily near ±90°.</figcaption></figure>
      <figure>${linePlot(speed, { title: 'Speed error over time', yLabel: 'speed error (%)', zeroLine: true, minSpan: .2 })}<figcaption class="muted small">Wobble here is platter speed variation.</figcaption></figure></div>`;
    const fCard = h('section', { class: 'card', 'aria-labelledby': 'tc-find-title' }, h('h2', { class: 'card-title', id: 'tc-find-title', text: `Findings (${res.findings.length})` }), findingList(res.findings.length ? res.findings : [{ id: 'tc-ok', severity: 'ok', title: 'Timecode signal looks healthy', meaning: 'Carrier, phase, balance, noise and continuity are all inside their guide bands.', action: 'No action needed. Save this as a baseline by re-running after maintenance.' }]));
    panel.replaceChildren(head, plots, fCard, h('div', { class: 'step-footer' }, h('span', { class: 'muted small', text: 'Result saved to this unit.' }), h('button', { type: 'button', class: 'btn btn-secondary', html: `${icon('refresh', { size: 18 })}<span>Run again</span>`, onclick: () => go('setup') })));
    ctx.finish({ status: outcome.status, detail: outcome.detail, criterion: outcome.criterion, measurements: res.measurements, findings: res.findings, extra: { format: res.format.name, nominalRpm: Number(st.rpm), source: sourceName, direction: res.direction } });
  }

  go('setup');
  return { dispose: () => { st.session?.cancel(); } };
}
