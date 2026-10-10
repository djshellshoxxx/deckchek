// Guided workflow screen: Setup → Capture → Results.
// One instance per workflow definition (Quick Check, Speed & Pitch, ...).

import { h, esc, formatDuration, formatNumber, isNative, toDb } from '../dom.js';
import { icon, chip } from '../icons.js';
import { paramsForTest } from './definitions.js';
import { settings, store, workspace, findProfile, on, active } from '../state.js';
import { decodeAudioFile, startLiveSession, classifyCaptureError, liveAvailable } from '../audio-io.js';
import { createPairPicker, currentPairs } from '../pair-picker.js';
import { createStereoMeter, levelBus } from '../meters.js';
import { buildRun } from '../analysis.js';
import { persistRun, saveRunAsBaseline, saveRepeatScanAlignment, exportRunHtml, exportRunCsv, runPdfActions } from '../persistence.js';
import { renderResults, qualityPanel } from '../results.js';
import { announce, toast } from '../live.js';
import { go, setCaptureStatus, currentDeviceName, showInspector } from '../shell.js';
import { relatedCard, stylusHealthCard } from '../crosslinks.js';

const STEPS = [['setup', 'Setup'], ['capture', 'Capture'], ['results', 'Results']];
const instances = new Map(); // workflow id -> WorkflowScreen (for device tests)

/** The live workflow screen for an id (created by shell.go). */
export const workflowInstance = id => instances.get(id) || null;
const DURATIONS = [5, 10, 20, 30, 60, 120, 300];

export function createWorkflowScreen(def) {
  return section => new WorkflowScreen(def, section).api();
}

class WorkflowScreen {
  constructor(def, section) {
    this.def = def;
    this.section = section;
    this.mode = def.modes[0].test;
    this.step = 'setup';
    this.source = liveAvailable() ? 'live' : 'file';
    this.file = null;
    this.params = {};
    this.session = null;
    this.captured = null;
    this.run = null;
    this.deviceTest = null;
    instances.set(def.id, this);
    this.render();
    on('catalog', () => this.populateEquipment());
  }

  api() {
    return {
      onShow: () => { this.populateEquipment(); this.showTips(); this.refreshCrossLinks(); },
      onHide: () => {},
      onSpace: () => this.step === 'capture' && liveAvailable() ? (this.toggleCapture(), true) : false,
      onEscape: () => {
        if (this.session) { this.cancelCapture(); return true; }
        if (this.step === 'capture') { this.setStep('setup'); return true; }
        return false;
      },
      onExport: () => this.run ? exportRunHtml(this.run) : toast('Run an analysis first — then Ctrl+E exports its report.'),
      onSave: () => { saveRunAsBaseline(this.run); },
      onEnter: () => {
        if (this.step === 'setup' && this.primaryBtn && !this.primaryBtn.disabled) { this.primaryBtn.click(); return true; }
        return false;
      },
    };
  }

  // ---------- layout ----------
  render() {
    const d = this.def;
    this.section.innerHTML = '';
    const header = h('header', { class: 'screen-head' });
    header.innerHTML = `<div class="screen-title"><span class="screen-icon">${icon(d.icon, { size: 24 })}</span><div><h1 tabindex="-1">${esc(d.title)}</h1><p class="lede">${esc(d.blurb)}</p></div></div>`;
    this.section.append(header);
    if (d.modes.length > 1) {
      const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': `${d.title} test` });
      d.modes.forEach(m => {
        const b = h('button', { type: 'button', role: 'radio', class: 'seg', 'aria-checked': String(m.test === this.mode), 'data-tooltip': m.desc, tabindex: m.test === this.mode ? '0' : '-1', text: m.label });
        b.addEventListener('click', () => this.setMode(m.test));
        group.append(b);
      });
      group.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const i = d.modes.findIndex(m => m.test === this.mode), n = d.modes.length;
        const next = d.modes[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? n - 1 : 1)) % n];
        this.setMode(next.test);
        group.querySelector('[aria-checked="true"]')?.focus();
      });
      this.modeGroup = group;
      header.append(group);
    }
    this.deviceSlot = h('div', { class: 'device-run-slot' });
    this.section.append(this.deviceSlot);
    this.stepper = h('ol', { class: 'stepper', 'aria-label': 'Progress' });
    this.section.append(this.stepper);
    this.banner = h('div', { class: 'banner-slot' });
    this.section.append(this.banner);
    this.panels = {};
    for (const [id] of STEPS) { this.panels[id] = h('div', { class: `step-panel step-${id}`, hidden: true }); this.section.append(this.panels[id]); }
    this.renderSetup();
    this.renderCapture();
    this.setStep('setup', { quiet: true });
  }

  setMode(test) {
    if (this.session) { toast('Stop the capture before changing the test.', { type: 'warn' }); return; }
    this.mode = test;
    this.modeGroup?.querySelectorAll('[role="radio"]').forEach(b => { const on = b.textContent === this.def.modes.find(m => m.test === test).label; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    this.renderSetup();
    this.run = null;
    this.setStep('setup', { quiet: true });
    this.showTips();
  }

  renderStepper() {
    const idx = STEPS.findIndex(([id]) => id === this.step);
    this.stepper.replaceChildren(...STEPS.map(([id, label], i) => {
      const done = i < idx || (id === 'capture' && this.step === 'results' && this.source === 'file');
      const skipped = id === 'capture' && this.source === 'file' && this.step === 'results';
      const state = i === idx ? 'current' : i < idx ? 'done' : 'upcoming';
      const reachable = i < idx && !(id === 'capture' && this.source === 'file');
      const b = h('button', { type: 'button', class: `step step-${state}`, 'aria-current': state === 'current' ? 'step' : null, 'aria-disabled': reachable || state === 'current' ? null : 'true', tabindex: reachable ? null : '-1' },
        h('span', { class: 'step-num', html: done && !skipped ? icon('check', { size: 16 }) : String(i + 1) }),
        h('span', { class: 'step-label', text: skipped ? `${label} (file)` : label }));
      if (reachable) b.addEventListener('click', () => this.setStep(id));
      return h('li', {}, b);
    }));
  }

  setStep(step, { quiet = false } = {}) {
    this.step = step;
    for (const [id] of STEPS) this.panels[id].hidden = id !== step;
    this.renderStepper();
    if (!quiet) {
      const n = STEPS.findIndex(([id]) => id === step) + 1;
      announce(`Step ${n} of 3: ${STEPS[n - 1][1]}`);
      const focusTarget = step === 'results' ? this.panels.results.querySelector('.verdict') : this.panels[step].querySelector('h2');
      const main = document.getElementById('main');
      if (main) main.scrollTop = 0;
      focusTarget?.setAttribute('tabindex', '-1');
      focusTarget?.focus({ preventScroll: true });
    }
  }

  // ---------- setup ----------
  renderSetup() {
    const d = this.def, p = this.panels.setup;
    p.innerHTML = '';
    const left = h('div', { class: 'setup-main' });
    const right = h('aside', { class: 'setup-side', 'aria-label': 'Preparation' });

    // Source choice
    const live = liveAvailable();
    const srcCard = h('section', { class: 'card', 'aria-labelledby': `${d.id}-src` });
    srcCard.innerHTML = `<h2 id="${d.id}-src" class="card-title">1 · Choose a source</h2>`;
    const choices = h('div', { class: 'source-choices', role: 'radiogroup', 'aria-label': 'Audio source' });
    const mk = (id, title, sub, ic, disabled) => {
      const b = h('button', { type: 'button', role: 'radio', class: 'source', 'aria-checked': String(this.source === id), 'aria-disabled': disabled ? 'true' : null, 'data-source': id, tabindex: this.source === id ? '0' : '-1' });
      b.innerHTML = `<span class="source-icon">${icon(ic, { size: 26 })}</span><span class="source-text"><strong>${esc(title)}</strong><span>${esc(sub)}</span></span>${disabled ? '<span class="badge">DESKTOP APP</span>' : ''}`;
      b.addEventListener('click', () => { if (disabled) { toast('Live capture is available in the DeckChek desktop app. Load a recorded file to analyse it here.', { type: 'info' }); return; } this.source = id; this.renderSetup(); });
      return b;
    };
    choices.append(
      mk('live', 'Live capture', live ? `From ${currentDeviceName()} · meters, clip latch, quality counters` : 'Available in the desktop app', 'mic', !live),
      mk('file', 'Load audio file', 'WAV, AIFF, FLAC or MP3 recorded from this chain', 'file', false));
    choices.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const next = this.source === 'live' ? 'file' : 'live';
      if (next === 'live' && !live) return;
      this.source = next;
      this.renderSetup();
      this.panels.setup.querySelector(`.source[data-source="${next}"]`)?.focus();
    });
    srcCard.append(choices);
    if (this.source === 'file') srcCard.append(this.fileDrop());
    else {
      const dur = h('label', { class: 'field field-inline' }, h('span', { class: 'field-label', text: 'Capture length' }));
      const sel = h('select', { id: `${d.id}-duration` });
      DURATIONS.forEach(s => sel.append(h('option', { value: s, text: s >= 60 ? `${s / 60} min` : `${s} s`, selected: s === (this.seconds || d.seconds) ? true : null })));
      sel.addEventListener('change', () => { this.seconds = Number(sel.value); });
      dur.append(sel);
      srcCard.append(dur);
    }
    left.append(srcCard);

    // Parameters
    const fields = paramsForTest(this.mode);
    const pCard = h('section', { class: 'card', 'aria-labelledby': `${d.id}-params` });
    pCard.innerHTML = `<h2 id="${d.id}-params" class="card-title">2 · Test settings</h2>`;
    const grid = h('div', { class: 'field-grid' });
    grid.append(this.equipmentField());
    fields.forEach(f => grid.append(this.paramField(f)));
    pCard.append(grid);
    const modeDesc = d.modes.find(m => m.test === this.mode)?.desc;
    if (modeDesc) pCard.append(h('p', { class: 'hint', html: `${icon('info', { size: 16 })}<span>${esc(modeDesc)}</span>` }));
    left.append(pCard);

    // Primary action
    const footer = h('div', { class: 'step-footer' });
    const primary = this.source === 'file'
      ? h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: `${d.id}-analyze`, disabled: !this.file, 'data-tooltip': 'Analyse the selected file (Enter)', html: `${icon('wave', { size: 20 })}<span>Analyze file</span>` })
      : h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: `${d.id}-to-capture`, html: `<span>Continue to capture</span>${icon('arrowRight', { size: 20 })}` });
    primary.addEventListener('click', () => this.source === 'file' ? this.analyzeFile() : this.setStep('capture'));
    this.primaryBtn = primary;
    footer.append(h('span', { class: 'muted small', text: this.source === 'file' ? (this.file ? `Ready: ${this.file.name}` : 'Choose a file to continue.') : 'Next: watch the meters and start recording.' }), primary);
    left.append(footer);

    // Side: checklist + wiring (device tests lead with the profile's own steps)
    right.innerHTML = `${this.deviceTest ? deviceStepsMarkup(this.deviceTest) : ''}
      <section class="card card-quiet" aria-labelledby="${d.id}-needs"><h2 id="${d.id}-needs" class="card-title">What you need</h2>
        <ul class="checklist">${d.needs.map(n => `<li>${icon('check', { size: 16 })}<span>${esc(n)}</span></li>`).join('')}</ul></section>
      <section class="card card-quiet" aria-labelledby="${d.id}-wiring"><h2 id="${d.id}-wiring" class="card-title">Wiring</h2>
        <ol class="wiring wiring-vertical">${d.wiring.map(([a, b], i) => `<li><span class="wiring-step num">${i + 1}</span><span class="wiring-node"><strong>${esc(a)}</strong><span>${esc(b)}</span></span></li>`).join('')}</ol>
        <p class="hint hint-warn">${icon('warn', { size: 16 })}<span>Never connect a speaker or amplifier output to the interface. Keep monitors low while testing.</span></p></section>`;
    this.xlinkSlot = h('div', { class: 'xlink-slot' });
    right.append(this.xlinkSlot);
    this.refreshCrossLinks();
    p.append(h('div', { class: 'setup-grid' }, left, right));
  }

  /** M6 cross-links: Quick Check suggests the pre-gig check, latency and shows stylus health; DVS suggests the scratch test and wear map. */
  crossLinkCards() {
    const id = this.def.id;
    return [id === 'quick' ? stylusHealthCard() : null, relatedCard(id)].filter(Boolean);
  }
  refreshCrossLinks() {
    this.xlinkSlot?.replaceChildren(...this.crossLinkCards());
  }

  fileDrop() {
    const id = `${this.def.id}-file`;
    const wrap = h('div', { class: `drop ${this.file ? 'has-file' : ''}` });
    const input = h('input', { type: 'file', id, class: 'drop-input', accept: 'audio/*,.wav,.aiff,.aif,.flac,.mp3' });
    wrap.innerHTML = `<label for="${id}" class="drop-label">${icon(this.file ? 'file' : 'upload', { size: 28 })}<span class="drop-title">${this.file ? esc(this.file.name) : 'Drop an audio file here or browse'}</span><span class="muted small">${this.file ? `${formatNumber(this.file.size / 1048576, { digits: 1 })} MB · choose another to replace` : 'Stereo recordings give the most evidence'}</span></label>`;
    wrap.prepend(input);
    input.addEventListener('change', () => { if (input.files?.[0]) this.setFile(input.files[0]); });
    wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.classList.add('dragging'); });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('dragging'));
    wrap.addEventListener('drop', e => { e.preventDefault(); wrap.classList.remove('dragging'); const f = e.dataTransfer?.files?.[0]; if (f) this.setFile(f); });
    return wrap;
  }

  setFile(file) {
    this.file = file;
    this.renderSetup();
    this.primaryBtn?.focus();
    announce(`Selected ${file.name}. Press Analyze file.`);
  }

  equipmentField() {
    const id = `${this.def.id}-equipment`;
    const wrap = h('div', { class: 'field' }, h('label', { class: 'field-label', for: id, text: 'Equipment under test' }));
    this.equipSelect = h('select', { id, 'data-param': 'device' });
    this.equipSelect.append(h('option', { value: '', text: 'Unassigned' }));
    this.equipSelect.addEventListener('change', () => { this.equipmentId = this.equipSelect.value; });
    const manage = h('button', { type: 'button', class: 'btn btn-ghost btn-sm field-action', html: `${icon('equipment', { size: 16 })}<span>Manage equipment</span>`, onclick: () => go('equipment') });
    wrap.append(this.equipSelect, h('div', { class: 'field-help-row' }, h('span', { class: 'field-help', text: 'Results are tracked per asset.' }), manage));
    this.populateEquipment();
    return wrap;
  }

  async populateEquipment() {
    if (!this.equipSelect) return;
    try {
      const assets = await store.list('asset');
      const current = this.equipmentId || '';
      this.equipSelect.replaceChildren(h('option', { value: '', text: 'Unassigned' }), ...assets.map(a => h('option', { value: a.id, text: a.nickname || a.serialNumber || a.id })));
      this.equipSelect.value = assets.some(a => a.id === current) ? current : '';
      this.assets = assets;
    } catch { /* keep Unassigned */ }
  }

  paramField(f) {
    const key = `${this.mode}:${f.id}`;
    const value = this.params[key] ?? f.value;
    const label = h('label', { class: 'field' }, h('span', { class: 'field-label', text: f.unit ? `${f.label} (${f.unit})` : f.label }));
    let input;
    if (f.type === 'select') {
      input = h('select', { 'data-param': f.id });
      f.options.forEach(([v, t]) => input.append(h('option', { value: v, text: t, selected: String(v) === String(value) ? true : null })));
    } else {
      input = h('input', { type: f.type, 'data-param': f.id, value, min: f.min, max: f.max, step: f.step, inputmode: f.type === 'number' ? 'decimal' : null });
    }
    input.addEventListener('input', () => { this.params[key] = input.value; });
    input.addEventListener('change', () => { this.params[key] = input.value; });
    label.append(input);
    if (f.help) label.append(h('span', { class: 'field-help', text: f.help }));
    return label;
  }

  collectParams() {
    const out = {};
    paramsForTest(this.mode).forEach(f => { out[f.id] = this.params[`${this.mode}:${f.id}`] ?? f.value; });
    return out;
  }

  // ---------- capture ----------
  renderCapture() {
    const p = this.panels.capture, d = this.def;
    p.innerHTML = '';
    if (!liveAvailable()) {
      p.append(emptyState({ icon: 'mic', title: 'Live capture runs in the desktop app', text: 'This browser preview cannot open audio inputs. Record the signal with any recorder and load the file, or install DeckChek for Windows.', action: { label: 'Load a file instead', run: () => { this.source = 'file'; this.renderSetup(); this.setStep('setup'); } } }));
      return;
    }
    const meterCard = h('section', { class: 'card meter-card', 'aria-labelledby': `${d.id}-meter-title` });
    meterCard.innerHTML = `<div class="card-head"><h2 id="${d.id}-meter-title" class="card-title">Input level</h2><span class="muted small">Aim for peaks between −18 and −3 dBFS</span></div>`;
    const meterHost = h('div', { class: 'meter-host' });
    meterCard.append(meterHost);
    this.meter = createStereoMeter(meterHost, { variant: 'large', label: `${d.title} input level` });
    const ctrl = h('section', { class: 'card capture-ctrl', 'aria-labelledby': `${d.id}-cap-title` });
    ctrl.innerHTML = `<h2 id="${d.id}-cap-title" class="card-title">Recording</h2>
      <div class="timer num" aria-live="off"><span class="timer-val">00:00.0</span><span class="timer-of muted"> / <span class="timer-target">${formatDuration(this.seconds || d.seconds)}</span></span></div>
      <div class="progress" aria-hidden="true"><span></span></div>
      <div class="level-status" aria-live="off"><span class="level-chip">${chip('info', 'WAITING', { size: 14 })}</span><span class="level-text muted">Level guidance appears once audio arrives.</span></div>
      <p class="capture-state muted" role="status">Ready. Press Start or Space.</p>`;
    this.startBtn = h('button', { type: 'button', class: 'btn btn-record btn-xl', 'data-space-ok': 'true', 'data-tooltip': 'Start / stop capture (Space)', html: `${icon('record', { size: 22 })}<span>Start capture</span><kbd>Space</kbd>` });
    this.startBtn.addEventListener('click', () => this.toggleCapture());
    const cancel = h('button', { type: 'button', class: 'btn btn-secondary', 'data-tooltip': 'Cancel capture and return to setup (Esc)', html: `<span>Back to setup</span><kbd>Esc</kbd>` });
    cancel.addEventListener('click', () => this.session ? this.cancelCapture() : this.setStep('setup'));
    this.cancelBtn = cancel;
    this.pairPicker = createPairPicker({ id: `${d.id}-pair` });
    ctrl.append(...(this.pairPicker.el ? [this.pairPicker.el] : []), h('div', { class: 'capture-buttons' }, this.startBtn, cancel));
    this.afterCapture = h('div', { class: 'after-capture', hidden: true });
    p.append(h('div', { class: 'capture-grid' }, meterCard, ctrl), this.afterCapture);
  }

  toggleCapture() { return this.session ? this.stopCapture() : this.startCapture(); }

  async startCapture() {
    if (this.session || this.starting) return;
    this.starting = true;
    this.clearBanner();
    this.afterCapture.hidden = true;
    this.captured = null;
    this.meter?.clearClips();
    const target = this.seconds || this.def.seconds;
    const state = this.panels.capture.querySelector('.capture-state');
    state.textContent = 'Opening input…';
    let quietSince = performance.now(), loudSeen = false, warnedQuiet = false;
    try {
      this.session = await startLiveSession({
        deviceName: settings.deviceName || null, maxSeconds: target + 5, pairs: currentPairs(),
        onLevels: lv => {
          const pk = Math.max(lv.peakL || 0, lv.peakR || 0);
          this.updateLevelStatus(toDb(pk), lv.clipL || lv.clipR);
          if (toDb(pk) > -60) { loudSeen = true; quietSince = performance.now(); if (warnedQuiet) { this.clearBanner(); warnedQuiet = false; } }
        },
        onStatus: st => {
          if (!this.session) return;
          if (st.running === false) this.deviceLost('The input stopped delivering audio (device unplugged or driver reset).');
          else if (st.sinceLastLevelsMs > 3000) this.showBanner({ status: 'warn', title: 'No level updates for 3 s', text: 'The device may have been disconnected. Stop to keep what was recorded so far.', actions: [['Stop & keep data', () => this.stopCapture()]] });
        },
      });
      this.captureStartMs = Date.now(); // real capture span for hours proposals (FS-12 AC-2)
    } catch (error) {
      this.starting = false;
      this.session = null;
      state.textContent = 'Capture did not start.';
      this.showCaptureError(error);
      return;
    }
    this.starting = false;
    this.startedAt = performance.now();
    this.startBtn.classList.add('recording');
    this.startBtn.innerHTML = `${icon('stop', { size: 22 })}<span>Stop capture</span><kbd>Space</kbd>`;
    this.cancelBtn.innerHTML = `<span>Cancel</span><kbd>Esc</kbd>`;
    state.textContent = `Recording from ${this.session.info?.deviceName || currentDeviceName()} at ${this.session.info?.sampleRate || '—'} Hz.`;
    setCaptureStatus(`Recording · ${this.def.title}`, 'recording');
    announce('Capture started');
    const val = this.panels.capture.querySelector('.timer-val'), bar = this.panels.capture.querySelector('.progress span');
    this.tick = setInterval(() => {
      if (!this.session) return;
      const t = this.session.elapsed();
      val.textContent = formatDuration(t);
      bar.style.width = `${Math.min(100, t / target * 100)}%`;
      if (!loudSeen && !warnedQuiet && performance.now() - quietSince > 5000) {
        warnedQuiet = true;
        this.showBanner({ status: 'warn', title: `No signal on ${currentDeviceName()} for 5 s`, text: 'Check the cable from the mixer REC/booth output, that the source is playing, and that the correct input is selected.', actions: [['Choose input', () => document.getElementById('device-select')?.focus()], ['Stop', () => this.stopCapture()]] });
      }
      if (t >= target) this.stopCapture();
    }, 100);
  }

  /** Gain-staging guidance from the recent peak (throttled to ~4 Hz). */
  updateLevelStatus(db, clipped) {
    const now = performance.now();
    this.levelWin = (this.levelWin || []).filter(x => now - x.t < 1500);
    this.levelWin.push({ t: now, db, clipped });
    if (now - (this.levelShownAt || 0) < 250) return;
    this.levelShownAt = now;
    const peakDb = Math.max(...this.levelWin.map(x => x.db)), clip = this.levelWin.some(x => x.clipped) || peakDb >= -0.1;
    const [status, word, text] = clip ? ['fail', 'CLIPPING', 'Reduce input gain — clipped audio corrupts every measurement.']
      : peakDb > -3 ? ['warn', 'HOT', 'Peaks above −3 dBFS. Lower the gain slightly for headroom.']
      : peakDb >= -18 ? ['pass', 'GOOD', 'Peaks sit in the −18 to −3 dBFS window.']
      : peakDb >= -45 ? ['review', 'LOW', 'Raise the input gain for a better signal-to-noise ratio.']
      : ['warn', 'NO SIGNAL', 'Nothing above −45 dBFS. Check the source and routing.'];
    const box = this.panels.capture.querySelector('.level-status');
    if (!box || box.dataset.state === word) return;
    box.dataset.state = word;
    box.querySelector('.level-chip').innerHTML = chip(status, word, { size: 14 });
    box.querySelector('.level-text').textContent = text;
  }

  resetCaptureUi() {
    clearInterval(this.tick);
    this.startBtn.classList.remove('recording');
    this.startBtn.innerHTML = `${icon('record', { size: 22 })}<span>Start capture</span><kbd>Space</kbd>`;
    this.cancelBtn.innerHTML = `<span>Back to setup</span><kbd>Esc</kbd>`;
    setCaptureStatus('Idle');
  }

  async stopCapture({ reason = null } = {}) {
    const session = this.session;
    if (!session || this.stopping) return;
    this.stopping = true;
    const state = this.panels.capture.querySelector('.capture-state');
    state.textContent = 'Finishing capture…';
    try {
      const result = await session.stop();
      this.captureEndMs = Date.now();
      this.session = null;
      this.resetCaptureUi();
      if (!result.audio.left.length) throw new Error('The capture returned no samples. Check that the input is delivering audio.');
      this.captured = result;
      state.textContent = `${reason ? `${reason} ` : ''}Captured ${formatNumber(result.audio.durationSec, { digits: 1 })} s at ${result.audio.sampleRate} Hz.`;
      announce(`Capture stopped. ${formatNumber(result.audio.durationSec, { digits: 1 })} seconds recorded.`);
      this.showAfterCapture(result);
    } catch (error) {
      this.session = null;
      this.resetCaptureUi();
      state.textContent = 'Capture failed.';
      this.showCaptureError(error);
    } finally { this.stopping = false; }
  }

  async deviceLost(message) {
    if (!this.session) return;
    this.showBanner({ status: 'fail', title: 'Input lost during capture', text: `${message} Partial data has been kept.`, actions: [['Choose input', () => document.getElementById('device-select')?.focus()]], assertive: true });
    await this.stopCapture({ reason: 'Stopped early — partial data kept.' });
  }

  async cancelCapture() {
    const s = this.session;
    this.session = null;
    this.resetCaptureUi();
    await s?.cancel();
    levelBus.reset();
    this.panels.capture.querySelector('.capture-state').textContent = 'Capture cancelled. Nothing was saved.';
    announce('Capture cancelled. Nothing was saved.');
  }

  showAfterCapture(result) {
    const box = this.afterCapture;
    box.hidden = false;
    box.replaceChildren();
    if (result.quality) box.append(qualityPanel(result.quality));
    const analyze = h('button', { type: 'button', class: 'btn btn-primary btn-lg', html: `${icon('wave', { size: 20 })}<span>Analyze capture</span>` });
    analyze.addEventListener('click', () => this.analyze(result.audio, `Live capture · ${result.deviceName}`, { quality: result.quality, streamErrors: result.streamErrors, deviceName: result.deviceName }));
    const again = h('button', { type: 'button', class: 'btn btn-secondary', html: `${icon('refresh', { size: 18 })}<span>Discard & recapture</span>` });
    again.addEventListener('click', () => { box.hidden = true; this.captured = null; this.startCapture(); });
    box.append(h('div', { class: 'step-footer' }, h('span', { class: 'muted small', text: 'Review the counters, then analyse. Nothing is saved until analysis completes.' }), again, analyze));
    analyze.focus();
  }

  showCaptureError(error) {
    const c = classifyCaptureError(error);
    const actions = [['Retry', () => this.startCapture()], ['Choose input', () => document.getElementById('device-select')?.focus()], ['Copy diagnostics', () => copyDiagnostics(c)], ['Load a file instead', () => { this.source = 'file'; this.renderSetup(); this.setStep('setup'); }]];
    this.showBanner({ status: 'fail', title: c.title, text: c.message, actions, assertive: true, detail: c.raw });
  }

  showBanner({ status = 'fail', title, text, actions = [], detail = null }) {
    const el = h('div', { class: `banner banner-${status}`, role: status === 'fail' ? 'alert' : 'status' });
    el.innerHTML = `${chip(status)}<div class="banner-text"><strong>${esc(title)}</strong><span>${esc(text)}</span>${detail ? `<span class="mono small muted">${esc(detail)}</span>` : ''}</div>`;
    const bar = h('div', { class: 'banner-actions' });
    actions.forEach(([label, run]) => bar.append(h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: label, onclick: run })));
    bar.append(h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Dismiss message', html: icon('x', { size: 16 }), onclick: () => this.clearBanner() }));
    el.append(bar);
    this.banner.replaceChildren(el);
  }
  clearBanner() { this.banner.replaceChildren(); }

  // ---------- analysis ----------
  async analyzeFile() {
    if (!this.file) { toast('Choose an audio file first.', { type: 'warn' }); return; }
    const btn = this.primaryBtn;
    btn.disabled = true; btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>Analyzing…</span>`;
    this.clearBanner();
    try {
      const audio = await decodeAudioFile(this.file);
      await this.analyze(audio, this.file.name, {});
    } catch (error) {
      this.showBanner({ status: 'fail', title: 'Analysis failed', text: String(error?.message || error), actions: [['Choose another file', () => this.panels.setup.querySelector('.drop-input')?.click()]] });
    } finally {
      if (btn.isConnected) { btn.disabled = !this.file; btn.innerHTML = `${icon('wave', { size: 20 })}<span>Analyze file</span>`; }
    }
  }

  /** {kind, startedAt, endedAt} for a live capture of this screen; a file analysis has no real span (analysis.js approximates it). */
  captureSpan(source, quality) {
    const live = Boolean(quality) || /^live capture/i.test(String(source || ''));
    if (!live) return { kind: 'file' };
    if (!Number.isFinite(this.captureStartMs) || !Number.isFinite(this.captureEndMs) || this.captureEndMs < this.captureStartMs) return { kind: 'live' };
    return { kind: 'live', startedAt: new Date(this.captureStartMs).toISOString(), endedAt: new Date(this.captureEndMs).toISOString() };
  }

  async analyze(audio, source, { quality = null, streamErrors = [], deviceName = null } = {}) {
    await new Promise(r => setTimeout(r, 30)); // let the busy state paint
    const asset = this.assets?.find(a => a.id === this.equipSelect?.value) || null;
    const devName = deviceName || currentDeviceName();
    const run = buildRun({
      test: this.mode, workflowId: this.def.id, audio, params: this.collectParams(), source,
      device: asset ? { id: asset.id, name: asset.nickname } : null, prior: workspace.runs, quality, streamErrors,
      profile: findProfile(devName, audio.sampleRate), deviceName: devName, capture: this.captureSpan(source, quality),
    });
    this.run = run;
    const saved = await persistRun(run);
    if (run.repeatScan) {
      try { await saveRepeatScanAlignment(run); toast(`Repeat scan aligned with the previous scan: ${run.repeatScan.persistent} persistent, ${run.repeatScan.newEvents} new, ${run.repeatScan.resolved} gone.`, { type: 'success' }); }
      catch (error) { toast(`Scan comparison shown, but the alignment record was not saved: ${error?.message || error}`, { type: 'warn' }); }
    }
    this.showResults(run);
    if (this.deviceTest) await this.completeDeviceTest(run, saved);
    if (!saved.ok) toast(`Saved locally only — history database write failed: ${saved.error}`, { type: 'error' });
    else toast(`${run.test} saved to History · ${run.measurements.length} measurements, ${run.findings.length} findings.`, { type: 'success' });
  }

  showResults(run) {
    const p = this.panels.results;
    p.replaceChildren(renderResults(run, {
      keyMetrics: this.def.key[run.test] || [],
      actions: [
        { label: 'Export report', icon: 'download', primary: true, shortcut: 'Ctrl+E', onClick: () => exportRunHtml(run) },
        { label: 'CSV', icon: 'download', onClick: () => exportRunCsv(run) },
        ...runPdfActions(run),
        { label: 'New test', icon: 'refresh', onClick: () => { this.run = null; this.setStep('setup'); } },
        { label: 'Open in History', icon: 'history', onClick: () => { active.historyFocus = run.id; go('history'); } },
        ...(this.deviceTest ? [{ label: this.deviceTest.backLabel || 'Back to device', icon: 'arrowRight', onClick: () => this.leaveDeviceTest('back') }] : []),
      ],
    }));
    const xl = this.crossLinkCards();
    if (xl.length) p.append(h('div', { class: 'xlink-slot xlink-slot-results' }, ...xl));
    this.setStep('results');
    const v = this.panels.results.querySelector('.verdict');
    announce(`${v?.querySelector('.chip')?.textContent || ''}. ${v?.querySelector('.verdict-headline')?.textContent || ''} Score ${run.score} of 100.`);
  }

  // ---------- device tests (opened from the Devices screen) ----------
  /** ctx: {deviceName, unitName, testTitle, mode, values, notes, steps, equipment, why, assetId, queueText, backLabel, onComplete(run, saved), onBack(), onCancel()} */
  beginDeviceTest(ctx) {
    if (this.session) { toast('Stop the current capture before starting a device test.', { type: 'warn' }); return false; }
    this.deviceTest = ctx;
    for (const [k, v] of Object.entries(ctx.values || {})) this.params[`${ctx.mode}:${k}`] = v;
    this.equipmentId = ctx.assetId || '';
    this.run = null;
    this.setMode(ctx.mode);
    this.renderDeviceBanner();
    return true;
  }

  renderDeviceBanner(result = null) {
    const dt = this.deviceTest;
    if (!dt) { this.deviceSlot.replaceChildren(); return; }
    const status = result ? { pass: 'pass', fail: 'fail', unknown: 'review', skipped: 'info' }[result.status] || 'info' : null;
    const el = h('div', { class: `banner banner-device${result ? ` banner-device-${status}` : ''}`, role: 'status', id: 'device-test-banner' });
    el.innerHTML = `${result ? chip(status, result.status === 'unknown' ? 'REVIEW' : null) : `<span class="banner-device-icon">${icon('devices', { size: 22 })}</span>`}
      <div class="banner-text"><strong>Running ${esc(dt.unitName || dt.deviceName)} · ${esc(dt.testTitle)}</strong>
      <span>${result ? `Saved to the ${esc(dt.deviceName)} test plan — ${esc(result.detail || '')}` : `${dt.queueText ? `${esc(dt.queueText)} · ` : ''}Settings are prefilled from the device profile; the result is saved to this unit's test plan.`}</span></div>`;
    const bar = h('div', { class: 'banner-actions' });
    bar.append(h('button', { type: 'button', class: `btn ${result ? 'btn-primary' : 'btn-secondary'} btn-sm`, id: 'device-test-back', text: result ? (dt.backLabel || 'Back to device') : 'Back to device', onclick: () => this.leaveDeviceTest(result ? 'back' : 'pause') }));
    if (!result) bar.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Cancel device test', onclick: () => this.leaveDeviceTest('cancel') }));
    el.append(bar);
    this.deviceSlot.replaceChildren(el);
  }

  async completeDeviceTest(run, saved) {
    const dt = this.deviceTest;
    try {
      const result = await dt.onComplete(run, saved);
      dt.done = true;
      this.renderDeviceBanner(result);
    } catch (error) {
      toast(`The run was saved, but the device test result was not: ${error?.message || error}`, { type: 'error' });
    }
  }

  leaveDeviceTest(how) {
    const dt = this.deviceTest;
    if (!dt) return;
    if (how !== 'pause') { this.deviceTest = null; this.renderDeviceBanner(); this.renderSetup(); }
    if (how === 'cancel') dt.onCancel?.(); else dt.onBack?.(how);
  }

  showTips() {
    const d = this.def, m = d.modes.find(x => x.test === this.mode);
    const body = h('div', { class: 'inspect' });
    body.innerHTML = `<p>${esc(d.blurb)}</p><h3>${esc(m.label)}</h3><p>${esc(m.desc)}</p>
      <h3>Shortcuts</h3><dl class="kv shortcuts"><dt><kbd>Space</kbd></dt><dd>Start / stop capture</dd><dt><kbd>Esc</kbd></dt><dd>Cancel capture</dd><dt><kbd>Ctrl</kbd>+<kbd>E</kbd></dt><dd>Export report</dd><dt><kbd>I</kbd></dt><dd>Toggle this panel</dd></dl>
      <p class="muted small">Select any reading in the results to see its definition, uncertainty budget and linked findings here.</p>`;
    showInspectorQuiet(`${d.title} guide`, body);
  }
}

function showInspectorQuiet(title, body) {
  document.getElementById('inspector-title').textContent = title;
  document.getElementById('inspector-body').replaceChildren(body);
}

function deviceStepsMarkup(dt) {
  return `<section class="card card-device" aria-labelledby="device-steps-title"><h2 id="device-steps-title" class="card-title">${icon('devices', { size: 18 })}<span>${esc(dt.deviceName)} test steps</span></h2>
    <ol class="dev-steplist">${(dt.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    ${(dt.equipment || []).length ? `<h3 class="dev-sub">You need</h3><ul class="checklist">${dt.equipment.map(e => `<li>${icon('check', { size: 16 })}<span>${esc(e)}</span></li>`).join('')}</ul>` : ''}
    ${(dt.notes || []).length ? `<h3 class="dev-sub">From the profile</h3><dl class="kv">${dt.notes.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}</section>`;
}

export function emptyState({ icon: ic, title, text, action = null }) {
  const el = h('div', { class: 'empty' });
  el.innerHTML = `<span class="empty-icon">${icon(ic, { size: 48 })}</span><h2>${esc(title)}</h2><p>${esc(text)}</p>`;
  if (action) el.append(h('button', { type: 'button', class: 'btn btn-primary', text: action.label, onclick: action.run }));
  return el;
}

async function copyDiagnostics(c) {
  const text = JSON.stringify({ app: 'DeckChek', native: isNative(), device: settings.deviceName || 'default', sampleRate: settings.sampleRate, error: c.raw, kind: c.kind, at: new Date().toISOString(), userAgent: navigator.userAgent }, null, 2);
  try { await navigator.clipboard.writeText(text); toast('Diagnostics copied to the clipboard.', { type: 'success' }); }
  catch { toast('Clipboard unavailable. Diagnostics: ' + c.raw, { type: 'warn', timeout: 10000 }); }
}

export { showInspector };
