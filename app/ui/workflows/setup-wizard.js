// First-run setup wizard (FS-01): a modal, skippable, resumable dialog that selects the interface and sample rate,
// checks levels with a test tone, optionally calibrates, records the user's gear and runs a System Health quick scan.
// The state machine is app/setup-wizard-model.js (pure); this file is the DOM, audio and persistence glue.
//
// Safety rule (FS-01 §7): the test tone and the level-check capture must stop on Back/Next/Skip, Esc, dialog close,
// errors, tab hide and page hide. Everything that can make sound or hold the input is released by `teardownStep()`
// and again by the dialog `close` handler; `stopTone()` is idempotent and also hooked to visibilitychange/pagehide.

import { h, esc, storageGet, storageSet, isNative, formatDate } from '../dom.js';
import { icon, chip } from '../icons.js';
import { settings, setSetting, on, emit, store, workspace, calibrationStatus } from '../state.js';
import { listInputDevices, listOutputDevices, outputSelectionSupported, classifyCaptureError, startLiveSession } from '../audio-io.js';
import { createStereoMeter } from '../meters.js';
import { announce, toast } from '../live.js';
import { confirmDialog, go } from '../shell.js';
import { createCalibrationScreen } from '../screens/calibration.js';
import { ensureLibrary, lib, refreshUnits, unitsFor } from '../devices/library-state.js';
import { CATEGORIES, CATEGORY_LABELS, imageUrl } from '../../devices/library.js';
import { createSystemBridge, interpretSystemScan, summarizeFindings, UNSUPPORTED_NOTE } from '../../system-check.js';
import { generateSine } from '../../advanced.js';
import { isEnabled } from '../../features.js';
import { wizardAutomationBypass } from '../../catalog-store.js';
import {
  SAMPLE_RATES, TONE_DEFAULT_DBFS, stepsFor, STEP_TITLES, initialWizardState, migrateWizardState, serializeWizardState,
  reduceWizard, startupDecision, levelVerdict, toneLevelDbfs, summarize, stepAnnouncement, currentStepId, calibrationDefault,
} from '../../setup-wizard-model.js';

const LS_KEY = 'deckchek.wizard.v1';
const STYLE_HREF = new URL('../../styles/wizard.css', import.meta.url).href;
const SHORT = { welcome: 'Welcome', interface: 'Audio', levels: 'Levels', calibration: 'Calibrate', gear: 'Gear', health: 'Health', summary: 'Summary' };
const LEVEL_WINDOW_MS = 3000;
const LISTEN_MAX_SECONDS = 20;
const TONE_MAX_SECONDS = 30;
const RATE_LABEL = { 44100: '44.1 kHz', 48000: '48 kHz', 96000: '96 kHz' };

const tauriInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? null;
const errText = e => String(e?.message || e);

// ---------------------------------------------------------------- environment and persistence
/** What this runtime can do; drives stepsFor(). System Health needs the Windows desktop app (AC-7). */
export function wizardEnv() {
  return { systemHealth: isNative() && /windows/i.test(globalThis.navigator?.userAgent || '') };
}

export async function loadWizardState() {
  try {
    const invoke = tauriInvoke();
    if (invoke) return migrateWizardState(await invoke('wizard_state_get'));
    return migrateWizardState(storageGet(LS_KEY, null));
  } catch { return initialWizardState(); }
}

async function saveWizardState(state) {
  const invoke = tauriInvoke();
  if (invoke) { await invoke('wizard_state_save', { state: serializeWizardState(state) }); return; }
  const s = migrateWizardState(state);
  if (!storageSet(LS_KEY, { ...s, status: s.status === 'none' ? 'in_progress' : s.status })) throw new Error('browser storage is unavailable');
}

/** FS-01 §4: true when a fresh install should open the wizard (flag on, nothing saved, no user data yet). */
export function shouldAutoStartWizard(state, { hasUserData = false, enabled = true } = {}) {
  return startupDecision({ stored: state, hasUserData, enabled }).action === 'open';
}

let stylesReady = null;
function ensureStyles() {
  stylesReady ??= new Promise(resolve => {
    if (document.querySelector('link[data-wizard-css]')) { resolve(); return; }
    const link = h('link', { rel: 'stylesheet', href: STYLE_HREF, 'data-wizard-css': '' });
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true }); // the dialog still works unstyled
    document.head.append(link);
  });
  return stylesReady;
}

// ---------------------------------------------------------------- test tone (must always stop)
let tone = null;
let toneGen = 0;
const FADE = Float32Array.from({ length: 33 }, (_, i) => 0.5 - 0.5 * Math.cos(Math.PI * i / 32)); // raised cosine 0 -> 1
const FADE_SECONDS = 0.01;

/**
 * Play a looped 1 kHz tone at the default -20 dBFS (never above -12 dBFS) with 10 ms raised-cosine fades.
 * Resolves to null when stopTone() ran while the audio context was still starting.
 */
export async function startTone({ sinkId = '', levelDbfs = TONE_DEFAULT_DBFS, maxSeconds = TONE_MAX_SECONDS, onEnd = null } = {}) {
  stopTone();
  const gen = toneGen;
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) throw new Error('Web Audio playback is unavailable in this runtime.');
  const amp = 10 ** (toneLevelDbfs(levelDbfs) / 20);
  const ctx = new Ctx();
  const discard = () => { try { ctx.close?.().catch?.(() => {}); } catch { /* already closed */ } };
  try {
    if (sinkId && typeof ctx.setSinkId === 'function') { try { await ctx.setSinkId(sinkId); } catch { /* default output */ } }
    await ctx.resume?.();
    if (gen !== toneGen) { discard(); return null; }
    const rate = ctx.sampleRate;
    const sine = generateSine({ frequencyHz: 1000, sampleRate: rate, durationSec: 1, amplitude: 1 }); // whole cycles: loops cleanly
    const buffer = ctx.createBuffer(2, sine.length, rate);
    buffer.copyToChannel(sine, 0); buffer.copyToChannel(sine, 1);
    const src = ctx.createBufferSource();
    src.buffer = buffer; src.loop = true;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.setValueCurveAtTime(FADE.map(v => v * amp), now, FADE_SECONDS);
    src.connect(gain); gain.connect(ctx.destination);
    src.start();
    const t = { ctx, src, gain, amp, stopped: false, timer: null, onEnd };
    t.timer = setTimeout(() => { if (tone === t) stopTone(); }, maxSeconds * 1000);
    tone = t;
    return { stop: stopTone };
  } catch (error) { discard(); throw error; }
}

export function toneActive() { return Boolean(tone && !tone.stopped); }

/** Idempotent. Fades out over 10 ms, then stops the source and closes the context (belt and braces). */
export function stopTone() {
  toneGen++;
  const t = tone;
  tone = null;
  if (!t || t.stopped) return;
  t.stopped = true;
  clearTimeout(t.timer);
  const { ctx, src, gain, amp } = t;
  const release = () => { try { src.stop(); } catch { /* already stopped */ } try { src.disconnect(); } catch { /* ignore */ } try { ctx.close?.().catch?.(() => {}); } catch { /* ignore */ } };
  try {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueCurveAtTime(FADE.map(v => (1 - v) * amp), now, FADE_SECONDS);
    src.stop(now + FADE_SECONDS + 0.005);
    src.onended = release;
  } catch { release(); return; }
  setTimeout(release, 60);
  try { t.onEnd?.(); } catch { /* UI already gone */ }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopTone(); });
  globalThis.addEventListener?.('pagehide', () => stopTone());
}

// ---------------------------------------------------------------- the dialog
let current = null;

/**
 * Open the wizard. `resume` continues an in-progress state at its stored step (AC-2); otherwise it starts at step 1
 * with the current settings and any saved answers prefilled (AC-8). Resolves with the final state when it closes.
 */
export async function openSetupWizard({ resume = false, state = null } = {}) {
  if (current) { current.focus(); return current.closed; }
  await ensureStyles();
  const env = wizardEnv();
  const stored = state ?? await loadWizardState();
  const firstRun = stored.status !== 'completed';
  let st = resume && stored.status === 'in_progress' ? reduceWizard(stored, { type: 'resume', env }) : reduceWizard(stored, { type: 'start', env });
  if (!(resume && stored.status === 'in_progress')) {
    st = reduceWizard(st, { type: 'answer', patch: { inputDevice: settings.deviceName || st.answers.inputDevice || '', sampleRate: SAMPLE_RATES.includes(settings.sampleRate) ? settings.sampleRate : st.answers.sampleRate } });
  }

  const dlg = h('dialog', { class: 'wizard', 'aria-labelledby': 'wiz-title' });
  dlg.innerHTML = `
    <div class="wiz-shell">
      <header class="wiz-head">
        <div class="wiz-title-row">
          <svg class="wiz-mark" width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" class="brand-bg"/><circle cx="17" cy="17" r="9.5" class="brand-ring"/><circle cx="17" cy="17" r="2.6" class="brand-dot"/><path d="M17 7.5a9.5 9.5 0 0 1 9.5 9.5" class="brand-arc"/></svg>
          <div><h2 id="wiz-title">Set up DeckChek</h2><p class="wiz-count muted" id="wiz-count"></p></div>
          <button type="button" class="btn btn-ghost btn-sm" id="wiz-skip-all" data-tooltip="Close setup; pick it up again from Options (Esc)">Skip setup</button>
        </div>
        <ol class="stepper wiz-stepper" id="wiz-stepper" role="list" aria-label="Setup steps"></ol>
      </header>
      <div class="wiz-body" id="wiz-body"></div>
      <footer class="wiz-foot">
        <button type="button" class="btn btn-ghost" id="wiz-back">${icon('chevronLeft', { size: 18 })}<span>Back</span></button>
        <span class="wiz-foot-note muted small" id="wiz-note">Progress is saved as you go.</span>
        <button type="button" class="btn btn-secondary" id="wiz-skip-step">Skip step</button>
        <button type="button" class="btn btn-primary btn-lg" id="wiz-next"><span>Next</span></button>
      </footer>
    </div>`;
  document.body.append(dlg);
  const q = s => dlg.querySelector(s);
  const body = q('#wiz-body');

  // ----- bookkeeping
  let io = { status: 'loading' };
  let renderToken = 0;
  let cleanups = [];
  let busy = false;
  let leaving = false;
  let gearSeeded = false;
  let saveChain = Promise.resolve();
  let resolveClosed;
  const closed = new Promise(r => { resolveClosed = r; });
  const answers = () => st.answers;
  const stepId = () => currentStepId(st, env);
  const stepIndex = () => stepsFor(env).indexOf(stepId()) + 1;
  const addCleanup = fn => { cleanups.push(fn); };

  function persist() {
    const snapshot = st;
    saveChain = saveChain.then(() => saveWizardState(snapshot)).catch(error => {
      toast(`Could not save your setup progress: ${errText(error)}`, { type: 'error' });
    });
    return saveChain;
  }
  function dispatch(action) {
    const prev = st;
    st = reduceWizard(st, { ...action, env });
    if (st !== prev) persist();
    if (action.type !== 'answer') renderAll();
  }
  const patch = p => dispatch({ type: 'answer', patch: p });

  function teardownStep() {
    stopTone();
    const fns = cleanups; cleanups = [];
    for (const fn of fns) { try { fn(); } catch { /* best effort */ } }
  }

  // ----- chrome
  function renderChrome() {
    const steps = stepsFor(env), idx = stepIndex(), id = stepId();
    q('#wiz-count').textContent = `Step ${idx} of ${steps.length}`;
    const list = q('#wiz-stepper');
    list.replaceChildren(...steps.map((sid, i) => {
      const n = i + 1, state = n < idx ? 'done' : n === idx ? 'current' : 'todo';
      const label = h('span', { class: 'step-label', text: SHORT[sid] });
      const num = h('span', { class: 'step-num', 'aria-hidden': 'true', html: state === 'done' ? icon('check', { size: 14 }) : String(n) });
      const el = state === 'done'
        ? h('button', { type: 'button', class: 'step step-done', 'aria-label': `Go back to step ${n}: ${STEP_TITLES[sid]}`, onclick: () => { if (!busy) dispatch({ type: 'goto', step: n }); } }, num, label)
        : h('span', { class: `step ${state === 'current' ? 'step-current' : 'step-todo'}`, 'aria-current': state === 'current' ? 'step' : null, 'aria-disabled': state === 'todo' ? 'true' : null }, num, label,
          h('span', { class: 'sr-only', text: state === 'current' ? ` (current step: ${STEP_TITLES[sid]})` : ` (${STEP_TITLES[sid]}, not reached yet)` }));
      return h('li', {}, el);
    }));
    q('#wiz-back').hidden = idx === 1;
    q('#wiz-skip-step').hidden = idx === 1 || idx === steps.length;
    const next = q('#wiz-next');
    next.querySelector('span').textContent = id === 'welcome' ? 'Start' : id === 'summary' ? 'Finish' : 'Next';
    next.disabled = false;
    q('#wiz-skip-all').hidden = id === 'summary';
  }
  function setNext({ label = null, disabled = null } = {}) {
    const next = q('#wiz-next');
    if (label) next.querySelector('span').textContent = label;
    if (disabled !== null) next.disabled = disabled;
  }
  function setBusy(on_) {
    busy = on_;
    for (const sel of ['#wiz-back', '#wiz-skip-step', '#wiz-next']) q(sel).disabled = on_;
  }
  const heading = (title, lede = '') => `<h3 class="wiz-step-title" id="wiz-step-title" tabindex="-1">${esc(title)}</h3>${lede ? `<p class="wiz-lede">${lede}</p>` : ''}`;
  const banner = (kind, title, text, actions = '') => `<div class="banner banner-${kind}" role="alert">${chip(kind === 'fail' ? 'fail' : 'warn')}<div class="banner-text"><strong>${esc(title)}</strong><span>${esc(text)}</span></div>${actions ? `<div class="banner-actions">${actions}</div>` : ''}</div>`;

  function renderAll() {
    teardownStep();
    const token = ++renderToken;
    renderChrome();
    const id = stepId();
    body.replaceChildren();
    body.scrollTop = 0;
    const ctx = { token, alive: () => token === renderToken && dlg.open };
    const fn = { welcome: stepWelcome, interface: stepInterface, levels: stepLevels, calibration: stepCalibration, gear: stepGear, health: stepHealth, summary: stepSummary }[id];
    fn(ctx);
    announce(stepAnnouncement(st, env));
    body.querySelector('#wiz-step-title')?.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- step 1: welcome
  function stepWelcome() {
    const rerun = !firstRun;
    body.innerHTML = `${heading('Let’s get DeckChek ready', 'This takes about 5 minutes. Every step can be skipped, and you can pick it up again later from Options.')}
      <ul class="wiz-checks">
        <li>${icon('plug', { size: 20 })}<span><strong>Your audio interface</strong> Pick the input, output and sample rate.</span></li>
        <li>${icon('wave', { size: 20 })}<span><strong>Test tone and levels</strong> Check that signal arrives at a healthy level.</span></li>
        <li>${icon('calibration', { size: 20 })}<span><strong>Loopback calibration</strong> Optional. It makes results more precise.</span></li>
        <li>${icon('equipment', { size: 20 })}<span><strong>Your gear</strong> Tick the decks, mixers and interfaces you own.</span></li>
        ${env.systemHealth ? `<li>${icon('system', { size: 20 })}<span><strong>System Health</strong> A quick scan of your audio drivers.</span></li>` : ''}
      </ul>
      <p class="hint">${icon('info', { size: 16 })}<span>Everything stays on this computer. DeckChek makes no network calls and never asks for serial numbers here.</span></p>
      ${rerun ? `<p class="hint">${icon('refresh', { size: 16 })}<span>You have been through setup before. Your current choices are filled in, and nothing is deleted if you change them.</span></p>` : ''}`;
  }

  // ---------------------------------------------------------------- step 2: interface and I/O
  async function loadIo(ctx) {
    io = { status: 'loading' };
    renderIo(ctx);
    try {
      const [inputs, outputs] = await Promise.all([listInputDevices(), listOutputDevices()]);
      if (!ctx.alive()) return;
      io = inputs.backend === 'browser' ? { status: 'browser', devices: [], outputs }
        : inputs.devices.length ? { status: 'ready', devices: inputs.devices, outputs } : { status: 'empty', devices: [], outputs };
    } catch (error) {
      if (!ctx.alive()) return;
      io = { status: 'error', error: classifyCaptureError(error) };
    }
    renderIo(ctx);
  }

  function continueWithoutAudio() {
    // Skip the interface, level and calibration steps in one go; the answers keep whatever was chosen so far.
    dispatch({ type: 'skipStep' }); dispatch({ type: 'skipStep' }); dispatch({ type: 'skipStep' });
  }

  function calStatusHtml(deviceName, rate) {
    const status = calibrationStatus(deviceName, rate);
    const label = status.state === 'calibrated' ? chip('pass', 'Calibrated') : status.state === 'mismatch' ? chip('warn', 'Cal. mismatch') : chip('review', 'Uncalibrated');
    const text = status.state === 'calibrated' ? `A profile from ${esc(formatDate(status.profile.createdAt))} applies to ${esc(deviceName)} at ${esc(RATE_LABEL[rate] || rate)}.`
      : status.state === 'mismatch' ? `A profile exists for this device but not for these settings (${esc(status.reasons.join(', '))}).`
        : 'No calibration profile for this input and rate yet. Results will show wider uncertainty until you calibrate.';
    return `${label}<span>${text}</span>`;
  }

  function renderIo(ctx) {
    if (!ctx.alive() || stepId() !== 'interface') return;
    const a = answers();
    const head = heading('Choose your interface', 'DeckChek listens to one input. Pick the interface your decks or mixer plug into, and the sample rate your DJ software uses.');
    if (io.status === 'loading') {
      body.innerHTML = `${head}<div class="wiz-skeleton" aria-hidden="true"><span></span><span></span><span></span></div><p class="sr-only" role="status">Looking for audio devices…</p>`;
      setNext({ disabled: true });
      return;
    }
    setNext({ disabled: false });
    if (io.status === 'empty' || io.status === 'error') {
      const title = io.status === 'empty' ? 'No audio inputs found' : io.error.title;
      const text = io.status === 'empty' ? 'Plug in your interface, install its driver, then choose Refresh.' : io.error.message;
      body.innerHTML = `${head}${banner('fail', title, text, `<button type="button" class="btn btn-secondary btn-sm" id="wiz-refresh">${icon('refresh', { size: 16 })}<span>Refresh</span></button><button type="button" class="btn btn-ghost btn-sm" id="wiz-nosound">Continue without audio</button>`)}
        <div class="wiz-fields">${rateField(a.sampleRate)}</div>`;
      body.querySelector('#wiz-refresh').addEventListener('click', () => loadIo(ctx));
      body.querySelector('#wiz-nosound').addEventListener('click', () => { applyIoSettings(); continueWithoutAudio(); });
      body.querySelector('#wiz-rate').addEventListener('change', e => patch({ sampleRate: Number(e.target.value) }));
      announce(title, { assertive: true });
      return;
    }
    const browser = io.status === 'browser';
    const names = io.devices.map(d => d.name);
    const missing = a.inputDevice && !names.includes(a.inputDevice);
    const inputOptions = browser ? '<option value="">Browser preview (files only)</option>'
      : `<option value="">System default input</option>${io.devices.map(d => `<option value="${esc(d.name)}"${d.name === a.inputDevice ? ' selected' : ''}>${esc(d.name)}${d.isDefault ? ' (default)' : ''}</option>`).join('')}${missing ? `<option value="${esc(a.inputDevice)}" selected>${esc(a.inputDevice)} (not found)</option>` : ''}`;
    const canOut = outputSelectionSupported() && io.outputs.length > 0;
    const outOptions = `<option value="">System default output</option>${io.outputs.filter(o => o.id !== 'default').map(o => `<option value="${esc(o.id)}"${o.id === a.outputDevice ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}`;
    body.innerHTML = `${head}
      ${browser ? `<p class="hint">${icon('info', { size: 16 })}<span>This is the browser preview. Live input needs the DeckChek desktop app; here you can analyse audio files. The level and calibration steps can be skipped.</span></p>` : ''}
      <div class="wiz-fields">
        <label class="field"><span class="field-label">Input</span><select id="wiz-input"${browser ? ' disabled' : ''}>${inputOptions}</select>
          ${missing ? `<span class="field-help wiz-warn">${icon('warn', { size: 14 })} “${esc(a.inputDevice)}” is not connected. Reconnect it and Refresh, or choose another input.</span>` : '<span class="field-help">The interface the turntable or mixer feeds.</span>'}</label>
        <label class="field"><span class="field-label">Output</span><select id="wiz-output"${canOut ? '' : ' disabled'}>${canOut ? outOptions : '<option value="">System default output</option>'}</select>
          <span class="field-help">${canOut ? 'Used for the test tone and calibration.' : 'This runtime plays through the system default output.'}</span></label>
        ${rateField(a.sampleRate)}
      </div>
      <div class="wiz-cal-status" id="wiz-cal-status" role="status"></div>
      <div class="wiz-inline-actions"><button type="button" class="btn btn-secondary btn-sm" id="wiz-refresh">${icon('refresh', { size: 16 })}<span>Refresh devices</span></button></div>`;
    const updateCal = () => {
      const name = answers().inputDevice || (isNative() ? 'System default' : 'File import');
      body.querySelector('#wiz-cal-status').innerHTML = calStatusHtml(name, answers().sampleRate);
    };
    updateCal();
    body.querySelector('#wiz-input').addEventListener('change', e => { patch({ inputDevice: e.target.value }); updateCal(); });
    body.querySelector('#wiz-output').addEventListener('change', e => patch({ outputDevice: e.target.value }));
    body.querySelector('#wiz-rate').addEventListener('change', e => { patch({ sampleRate: Number(e.target.value) }); updateCal(); });
    body.querySelector('#wiz-refresh').addEventListener('click', () => { loadIo(ctx); toast('Device list refreshed.', { type: 'success', timeout: 2000 }); });
  }
  const rateField = rate => `<label class="field"><span class="field-label">Sample rate</span><select id="wiz-rate">${SAMPLE_RATES.map(r => `<option value="${r}"${r === rate ? ' selected' : ''}>${RATE_LABEL[r]}</option>`).join('')}</select><span class="field-help">Match the rate your DJ software or driver panel uses (48 kHz is typical).</span></label>`;

  /** AC-3: save the choice to the app settings and keep the top bar in step. */
  function applyIoSettings() {
    const a = answers();
    if (io.status === 'ready') {
      const present = io.devices.some(d => d.name === a.inputDevice);
      setSetting('deviceName', present ? a.inputDevice : '');
    }
    setSetting('sampleRate', a.sampleRate);
    const ds = document.getElementById('device-select');
    if (ds && [...ds.options].some(o => o.value === settings.deviceName)) ds.value = settings.deviceName;
    const rs = document.getElementById('rate-select');
    if (rs) rs.value = String(a.sampleRate);
  }

  function stepInterface(ctx) {
    loadIo(ctx);
  }

  // ---------------------------------------------------------------- step 3: test tone and levels
  function stepLevels(ctx) {
    const live = isNative();
    const a = answers();
    body.innerHTML = `${heading('Test tone and levels', 'Play the test tone through your system and watch the input meter. Aim for a peak between −18 and −3 dBFS.')}
      <p class="hint hint-warn">${icon('warn', { size: 16 })}<span><strong>Lower your monitors and headphones first.</strong> The tone is 1 kHz at −20 dBFS and stops the moment you leave this step.</span></p>
      <div class="wiz-levels">
        <div class="wiz-meter" id="wiz-meter" ${live ? '' : 'hidden'}></div>
        <div class="wiz-levels-side">
          <div class="wiz-actions-row">
            <button type="button" class="btn btn-secondary btn-lg" id="wiz-tone" aria-pressed="false" data-space-ok="true">${icon('play', { size: 18 })}<span>Play test tone</span></button>
            <button type="button" class="btn btn-primary btn-lg" id="wiz-check"${live ? '' : ' disabled'}>${icon('wave', { size: 18 })}<span>Check levels</span></button>
          </div>
          <p class="muted small" id="wiz-listen" role="status"></p>
          <div id="wiz-level-error"></div>
          <div id="wiz-verdict" class="wiz-verdict" role="status" aria-live="polite"></div>
        </div>
      </div>
      ${live ? '' : `<p class="hint">${icon('info', { size: 16 })}<span>Live metering needs the DeckChek desktop app. You can still play the tone to check your speakers, then skip this step.</span></p>`}`;
    const toneBtn = body.querySelector('#wiz-tone'), listen = body.querySelector('#wiz-listen');
    const verdictEl = body.querySelector('#wiz-verdict'), errEl = body.querySelector('#wiz-level-error');
    const setToneUi = playing => {
      toneBtn.setAttribute('aria-pressed', String(playing));
      toneBtn.innerHTML = `${icon(playing ? 'stop' : 'play', { size: 18 })}<span>${playing ? 'Stop test tone' : 'Play test tone'}</span>`;
    };
    const showVerdict = v => {
      const status = v.verdict === 'ok' ? 'pass' : v.verdict === 'low' ? 'warn' : 'fail';
      const label = v.verdict === 'ok' ? 'OK' : v.verdict === 'low' ? 'LOW' : 'CLIPPING';
      verdictEl.innerHTML = `<div class="verdict verdict-compact verdict-${status}"><div class="verdict-main"><div class="verdict-chip">${chip(status, label)}</div><div><p class="verdict-headline">${esc(v.text)}</p>${v.imbalance ? `<p class="muted small">${chip('warn', 'L/R', { size: 14 })} Left and right differ by ${esc(v.imbalanceDb)} dB.</p>` : ''}</div></div></div>`;
    };
    if (a.levelCheck) {
      const old = levelVerdict({ peakLeft: 10 ** (a.levelCheck.peakDbfs / 20) });
      showVerdict({ ...old, verdict: a.levelCheck.verdict, text: `Last check: input peaked at ${old.peakDbfs.toFixed(1).replace('-', '−')} dBFS (${a.levelCheck.verdict === 'ok' ? 'good' : a.levelCheck.verdict}).` });
    }

    let toneBusy = false;
    async function toggleTone() {
      if (toneBusy) return;
      if (toneActive()) { stopTone(); setToneUi(false); announce('Test tone stopped'); return; }
      toneBusy = true;
      try {
        const handle = await startTone({ sinkId: answers().outputDevice, onEnd: () => { if (ctx.alive()) setToneUi(false); } });
        if (handle && ctx.alive()) { setToneUi(true); announce('Test tone playing at minus 20 dBFS'); } else stopTone();
      } catch (error) {
        stopTone(); setToneUi(false);
        errEl.innerHTML = banner('fail', 'The test tone could not play', `${errText(error)} Check your output device and try again.`);
      } finally { toneBusy = false; }
    }
    toneBtn.addEventListener('click', toggleTone);
    const onKey = e => {
      if (e.key === ' ' && !e.defaultPrevented && !e.target.closest?.('button,select,input,textarea,a,summary')) { e.preventDefault(); toggleTone(); }
    };
    dlg.addEventListener('keydown', onKey);
    addCleanup(() => { dlg.removeEventListener('keydown', onKey); });

    if (!live) return;
    const meter = createStereoMeter(body.querySelector('#wiz-meter'), { variant: 'large', label: 'Input level (setup)' });
    addCleanup(() => meter.destroy());
    let session = null, win = null, winTimer = null, opening = null;
    addCleanup(() => { clearTimeout(winTimer); const s = session; session = null; s?.cancel?.().catch?.(() => {}); });
    const collect = levels => {
      if (!win) return;
      win.peakL = Math.max(win.peakL, levels.peakL || 0); win.peakR = Math.max(win.peakR, levels.peakR || 0);
      win.sumL += (levels.rmsL || 0) ** 2; win.sumR += (levels.rmsR || 0) ** 2; win.n++;
    };
    async function ensureSession() {
      if (session) return true;
      opening ??= (async () => {
        try {
          errEl.replaceChildren();
          listen.textContent = 'Opening the input…';
          session = await startLiveSession({
            deviceName: answers().inputDevice || null, maxSeconds: LISTEN_MAX_SECONDS, onLevels: collect,
            onStatus: s => { if (!s.running && session && ctx.alive()) { session = null; listen.textContent = `Stopped listening after ${LISTEN_MAX_SECONDS} s. Choose Check levels to listen again.`; } },
          });
          if (!ctx.alive()) { const s = session; session = null; s?.cancel(); return false; }
          listen.textContent = `Listening on ${session.info?.deviceName || answers().inputDevice || 'the default input'}.`;
          return true;
        } catch (error) {
          stopTone(); setToneUi(false);
          const c = classifyCaptureError(error);
          errEl.innerHTML = banner('fail', c.title, c.message, `<button type="button" class="btn btn-secondary btn-sm" id="wiz-retry">Retry</button>`);
          errEl.querySelector('#wiz-retry').addEventListener('click', () => checkBtn.click());
          listen.textContent = '';
          announce(c.title, { assertive: true });
          return false;
        } finally { opening = null; }
      })();
      return opening;
    }
    const checkBtn = body.querySelector('#wiz-check');
    checkBtn.addEventListener('click', async () => {
      checkBtn.disabled = true;
      try {
        if (!(await ensureSession())) return;
        meter.clearClips();
        win = { peakL: 0, peakR: 0, sumL: 0, sumR: 0, n: 0 };
        listen.textContent = 'Measuring for 3 seconds…';
        await new Promise(resolve => { winTimer = setTimeout(resolve, LEVEL_WINDOW_MS); });
        if (!ctx.alive() || !win) return;
        const w = win; win = null;
        const v = levelVerdict({ peakLeft: w.peakL, peakRight: w.peakR, rmsLeft: w.n ? Math.sqrt(w.sumL / w.n) : 0, rmsRight: w.n ? Math.sqrt(w.sumR / w.n) : 0 });
        showVerdict(v);
        patch({ levelCheck: { peakDbfs: Math.max(v.peakDbfs, -120), verdict: v.verdict } });
        listen.textContent = session ? `Listening on ${session.info?.deviceName || 'the input'}.` : '';
        announce(v.text);
      } finally { if (ctx.alive()) checkBtn.disabled = false; }
    });
  }

  // ---------------------------------------------------------------- step 4: loopback calibration
  function stepCalibration(ctx) {
    const device = settings.deviceName || (isNative() ? 'System default' : 'File import');
    const status = () => calibrationStatus(device, settings.sampleRate);
    const existing = status().state === 'calibrated';
    if (existing && answers().calibration !== 'done') patch({ calibration: calibrationDefault(true) });
    body.innerHTML = `${heading('Loopback calibration', 'A loopback cable lets DeckChek measure your interface (gain, channel match, noise and clock) so readings carry honest ± uncertainty.')}
      <div id="wiz-cal-state" class="wiz-cal-banner" role="status"></div>
      <div id="wiz-cal-intro">
        <ol class="wiring wiring-loop"><li><span class="wiring-node"><strong>Interface OUT L/R</strong><span>line output</span></span><span class="wiring-arrow">${icon('arrowRight', { size: 16 })}</span></li><li><span class="wiring-node"><strong>Cable</strong><span>L→L, R→R</span></span><span class="wiring-arrow">${icon('arrowRight', { size: 16 })}</span></li><li><span class="wiring-node"><strong>Interface IN L/R</strong><span>line input</span></span></li></ol>
        <p class="muted">You can calibrate later. Until then, results show wider uncertainty and an UNCAL badge.</p>
        <div class="wiz-actions-row">
          <button type="button" class="btn btn-primary" id="wiz-cal-run">${icon('calibration', { size: 18 })}<span>${existing ? 'Calibrate again' : 'Run calibration'}</span></button>
          <button type="button" class="btn btn-secondary" id="wiz-cal-open">Open Calibration screen</button>
        </div>
      </div>
      <div id="wiz-cal-host"></div>`;
    const stateEl = body.querySelector('#wiz-cal-state');
    const paint = () => {
      const s = status();
      stateEl.innerHTML = s.state === 'calibrated'
        ? `${chip('pass', answers().calibration === 'done' ? 'Calibrated' : 'Already calibrated')}<span>A profile from ${esc(formatDate(s.profile.createdAt))} applies to ${esc(device)} at ${esc(RATE_LABEL[settings.sampleRate] || settings.sampleRate)}. You can skip this step.</span>`
        : `${chip('review', 'Uncalibrated')}<span>No profile for ${esc(device)} at ${esc(RATE_LABEL[settings.sampleRate] || settings.sampleRate)}.</span>`;
    };
    paint();
    let screen = null;
    const unsub = on('calibration', () => {
      if (!ctx.alive()) return;
      if (status().state === 'calibrated' && answers().calibration !== 'done') patch({ calibration: 'done' });
      paint();
    });
    addCleanup(unsub);
    addCleanup(() => { const s = screen; screen = null; s?.dispose?.(); });
    body.querySelector('#wiz-cal-run').addEventListener('click', () => {
      const host = body.querySelector('#wiz-cal-host');
      body.querySelector('#wiz-cal-intro').hidden = true;
      const section = h('section', { class: 'wiz-cal-embed' });
      host.replaceChildren(section);
      screen = createCalibrationScreen(section, { embedded: true, sinkId: answers().outputDevice });
      section.querySelector('#cal-start')?.focus({ preventScroll: true });
      body.scrollTop = 0;
    });
    body.querySelector('#wiz-cal-open').addEventListener('click', () => {
      leaving = true;
      persist().then(() => { dlg.close(); go('calibration', { focus: true }); });
    });
    // Next/Skip must not strand a running loopback
    hooks.calibration = {
      beforeNext: async () => { if (screen?.isRunning?.()) { toast('The loopback is still running. Wait for it to finish, or press Esc in the Calibration area to stop it.', { type: 'warn' }); return false; } return true; },
    };
  }

  // ---------------------------------------------------------------- step 5: your gear
  function stepGear(ctx) {
    body.innerHTML = `${heading('Your gear', 'Tick what you own. DeckChek creates a “My …” unit for each one so test results have somewhere to live. Add custom gear later in Equipment.')}
      <div class="wiz-gear-tools"><label class="field wiz-search"><span class="field-label">Search</span><span class="wiz-search-box">${icon('search', { size: 16 })}<input type="search" id="wiz-gear-search" placeholder="Filter by name or maker" autocomplete="off"></span></label><p class="muted small" id="wiz-gear-count" role="status"></p></div>
      <div id="wiz-gear-list" class="wiz-gear-list"><div class="wiz-skeleton" aria-hidden="true"><span></span><span></span><span></span></div></div>`;
    ensureLibrary().then(() => {
      if (!ctx.alive()) return;
      const listEl = body.querySelector('#wiz-gear-list');
      if (lib.error && !lib.profiles.length) {
        listEl.innerHTML = banner('fail', 'The device library could not be loaded', lib.error, `<button type="button" class="btn btn-secondary btn-sm" id="wiz-lib-retry">Retry</button>`);
        listEl.querySelector('#wiz-lib-retry').addEventListener('click', () => { ensureLibrary({ force: true }).then(() => { if (ctx.alive()) stepGear(ctx); }); });
        return;
      }
      if (!gearSeeded) {
        gearSeeded = true;
        const have = lib.profiles.filter(p => unitsFor(p.id).length).map(p => p.id);
        if (have.length) patch({ ownedProductIds: [...new Set([...answers().ownedProductIds, ...have])] });
      }
      const owned = new Set(answers().ownedProductIds);
      const cats = CATEGORIES.filter(c => lib.profiles.some(p => p.category === c));
      listEl.replaceChildren(...cats.map(cat => {
        const group = h('section', { class: 'wiz-gear-group', 'aria-labelledby': `wiz-cat-${cat}` }, h('h4', { id: `wiz-cat-${cat}`, text: CATEGORY_LABELS[cat] || cat }));
        const grid = h('div', { class: 'wiz-gear-grid' });
        for (const p of lib.profiles.filter(x => x.category === cat)) {
          const img = imageUrl(p);
          const input = h('input', { type: 'checkbox', 'data-id': p.id, checked: owned.has(p.id) ? true : null });
          const card = h('label', { class: 'wiz-gear', 'data-search': `${p.manufacturer} ${p.model}`.toLowerCase() },
            input,
            h('span', { class: 'wiz-gear-thumb', html: img ? `<img src="${esc(img)}" alt="" loading="lazy">` : icon('devices', { size: 28 }) }),
            h('span', { class: 'wiz-gear-text' }, h('strong', { text: p.model }), h('span', { class: 'muted small', text: p.manufacturer }), h('span', { class: 'wiz-gear-own', text: 'I own this' })));
          input.addEventListener('change', () => {
            const next = new Set(answers().ownedProductIds);
            if (input.checked) next.add(p.id); else next.delete(p.id);
            patch({ ownedProductIds: [...next] });
            count();
          });
          grid.append(card);
        }
        group.append(grid);
        return group;
      }));
      const count = () => { const n = answers().ownedProductIds.length; body.querySelector('#wiz-gear-count').textContent = `${n} selected`; };
      count();
      body.querySelector('#wiz-gear-search').addEventListener('input', e => {
        const needle = e.target.value.trim().toLowerCase();
        let shown = 0;
        listEl.querySelectorAll('.wiz-gear').forEach(el => { const hit = !needle || el.dataset.search.includes(needle); el.hidden = !hit; if (hit) shown++; });
        listEl.querySelectorAll('.wiz-gear-group').forEach(g => { g.hidden = ![...g.querySelectorAll('.wiz-gear')].some(el => !el.hidden); });
        announce(`${shown} product${shown === 1 ? '' : 's'} shown`);
      });
    });
  }

  // ---------------------------------------------------------------- step 6: System Health quick scan
  function stepHealth(ctx) {
    body.innerHTML = `${heading('System Health quick scan', 'A fast look at your Windows audio drivers. The full scan also reads event logs and your DJ software’s logs.')}<div id="wiz-health"><div class="wiz-skeleton" aria-hidden="true"><span></span><span></span></div></div>`;
    const host = body.querySelector('#wiz-health');
    const bridge = createSystemBridge();
    let unsupported = false;
    const run = async () => {
      host.innerHTML = '<div class="wiz-skeleton" aria-hidden="true"><span></span><span></span></div><p class="sr-only" role="status">Scanning drivers…</p>';
      setNext({ disabled: false });
      try {
        const payload = await bridge.scanDrivers();
        if (!ctx.alive()) return;
        if (payload?.supported === false) {
          unsupported = true;
          host.innerHTML = `<p class="hint">${icon('info', { size: 16 })}<span>${esc(UNSUPPORTED_NOTE)}. This step is skipped.</span></p>`;
          return;
        }
        const findings = interpretSystemScan({ drivers: payload });
        const sum = summarizeFindings(findings);
        patch({ health: { errors: sum.counts.error, warnings: sum.counts.warning } });
        const top = findings.filter(f => f.severity === 'error' || f.severity === 'warning').slice(0, 3);
        const SEV = { error: 'fail', warning: 'warn' };
        host.innerHTML = `<div class="verdict verdict-compact verdict-${sum.status}"><div class="verdict-main"><div class="verdict-chip">${chip(sum.status, sum.status === 'pass' ? 'CLEAR' : sum.status === 'fail' ? 'PROBLEMS' : sum.status === 'warn' ? 'CHECK' : 'INFO')}</div><div><p class="verdict-headline">${esc(sum.headline)}</p><p class="muted small">${sum.counts.error} error${sum.counts.error === 1 ? '' : 's'}, ${sum.counts.warning} warning${sum.counts.warning === 1 ? '' : 's'}</p></div></div></div>
          ${top.length ? `<ul class="issues wiz-findings">${top.map(f => `<li>${chip(SEV[f.severity], null, { size: 14 })}<span><strong>${esc(f.title)}</strong> ${esc(f.meaning || '')}</span></li>`).join('')}</ul>` : ''}
          ${(payload?.errors || []).length ? `<details class="evidence"><summary>${icon('chevronRight', { size: 16 })}<span>Scan notes (${payload.errors.length})</span></summary><div class="evidence-body"><ul>${payload.errors.slice(0, 8).map(e => `<li class="small">${esc(e)}</li>`).join('')}</ul></div></details>` : ''}
          <div class="wiz-actions-row"><button type="button" class="btn btn-secondary btn-sm" id="wiz-full-scan">Full scan in System Health</button></div>`;
        host.querySelector('#wiz-full-scan').addEventListener('click', () => { leaving = true; persist().then(() => { dlg.close(); go('system', { focus: true }); }); });
      } catch (error) {
        if (!ctx.alive()) return;
        host.innerHTML = banner('fail', 'The quick scan could not finish', errText(error), `<button type="button" class="btn btn-secondary btn-sm" id="wiz-health-retry">Retry</button>`);
        host.querySelector('#wiz-health-retry').addEventListener('click', run);
      }
    };
    hooks.health = { skipOnNext: () => unsupported };
    run();
  }

  // ---------------------------------------------------------------- step 7: summary
  function stepSummary() {
    const sum = summarize(st, env);
    if (answers().outputDevice) { // the stored value is an opaque sink id; show a name instead
      const row = sum.rows.find(r => r.id === 'output');
      row.value = io.outputs?.find(o => o.id === answers().outputDevice)?.label || 'Selected output device';
      sum.text = ['DeckChek setup summary', ...sum.rows.map(r => `${r.label}: ${r.value}`)].join('\n');
    }
    body.innerHTML = `${heading('All set', 'Here is what you chose. Finish saves your gear and takes you to Quick Check.')}
      <table class="wiz-summary"><caption class="sr-only">Setup summary</caption><tbody>${sum.rows.map(r => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.value)}</td></tr>`).join('')}</tbody></table>
      ${sum.skippedSteps.length ? `<p class="muted small">Skipped: ${sum.skippedSteps.map(s => esc(STEP_TITLES[s] || s)).join(', ')}. You can run setup again from Options.</p>` : ''}
      <div class="wiz-actions-row"><button type="button" class="btn btn-secondary" id="wiz-copy">${icon('copy', { size: 18 })}<span>Copy summary</span></button></div>`;
    body.querySelector('#wiz-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(sum.text); toast('Summary copied.', { type: 'success', timeout: 2500 }); }
      catch { toast('Could not copy. Select the table text instead.', { type: 'warn' }); }
    });
  }

  // ---------------------------------------------------------------- navigation
  const hooks = {};
  async function goNext() {
    if (busy) return;
    const id = stepId();
    setBusy(true);
    try {
      const hook = hooks[id];
      if (hook?.beforeNext && (await hook.beforeNext()) === false) return;
      if (id === 'interface') applyIoSettings();
      if (id === 'summary') { await finish(); return; }
      if (hook?.skipOnNext?.()) { delete hooks[id]; dispatch({ type: 'skipStep' }); return; }
      delete hooks[id];
      dispatch({ type: 'next' });
    } finally { if (dlg.open) setBusy(false); }
  }

  function skipStep() {
    if (busy) return;
    const id = stepId();
    if (id === 'calibration' && answers().calibration !== 'existing' && answers().calibration !== 'done') patch({ calibration: 'skipped' });
    if (id === 'interface') applyIoSettings();
    delete hooks[id];
    dispatch({ type: 'skipStep' });
  }

  async function finish() {
    try {
      applyIoSettings();
      if (!answers().skippedSteps.includes('gear')) {
        await ensureLibrary();
        const known = new Set(lib.profiles.map(p => p.id));
        const ids = answers().ownedProductIds.filter(id => known.has(id));
        if (lib.products.size || !ids.length) {
          await store.applyGear(ids, { retire: firstRun });
          await refreshUnits();
          emit('catalog'); emit('devices');
        }
      }
    } catch (error) {
      toast(`Could not save your gear: ${errText(error)}`, { type: 'error' });
      return;
    }
    dispatch({ type: 'finish' });
    await saveChain;
    leaving = true;
    dlg.close();
    go('quick', { focus: true });
    toast('Setup complete. DeckChek is ready.', { type: 'success' });
  }

  async function requestSkipWizard() {
    if (stepIndex() > 2) {
      const ok = await confirmDialog({ title: 'Skip setup?', body: 'Your choices so far are saved. You can finish later from the banner or from Options > Run setup again.', confirmLabel: 'Skip setup', danger: false });
      if (!ok) return;
    }
    if (!dlg.open) return;
    dispatch({ type: 'skipWizard' });
    leaving = true;
    dlg.close();
  }

  q('#wiz-next').addEventListener('click', goNext);
  q('#wiz-back').addEventListener('click', () => { if (!busy) { delete hooks[stepId()]; dispatch({ type: 'back' }); } });
  q('#wiz-skip-step').addEventListener('click', skipStep);
  q('#wiz-skip-all').addEventListener('click', requestSkipWizard);
  dlg.addEventListener('cancel', e => { e.preventDefault(); requestSkipWizard(); });
  dlg.addEventListener('keydown', e => {
    if (e.defaultPrevented) return;
    if (e.key === 'ArrowLeft' && e.altKey) { e.preventDefault(); q('#wiz-back').click(); return; }
    if (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.target.closest?.('button,a,textarea,select,summary,[contenteditable],input:not([type="checkbox"])')) {
      e.preventDefault(); q('#wiz-next').click();
    }
  });

  dlg.addEventListener('close', () => {
    teardownStep();
    // Closed some other way (a second Esc the browser would not let us cancel): treat it as "skip setup".
    if (!leaving && st.status === 'in_progress') { st = reduceWizard(st, { type: 'skipWizard', env }); persist(); }
    saveChain.finally(() => { dlg.remove(); });
    current = null;
    resolveClosed(st);
  }, { once: true });

  current = { focus: () => dlg.querySelector('#wiz-step-title')?.focus(), closed };
  persist();
  dlg.showModal();
  renderAll();
  return closed;
}

// ---------------------------------------------------------------- startup, banner and Options entry
let bannerEl = null;
function removeBanner() { bannerEl?.remove(); bannerEl = null; }

async function showStartBanner(kind, state) {
  await ensureStyles();
  removeBanner();
  const env = wizardEnv();
  const n = stepsFor(env).length, idx = Math.min(Math.max(state.step, 1), n);
  const text = kind === 'resume' ? `Resume setup (step ${idx} of ${n})` : 'Setup was left unfinished a while ago';
  const sub = kind === 'resume' ? 'Pick up where you left off. Your answers are kept.' : 'Start again to check your interface and gear.';
  const el = h('section', { class: 'wiz-banner', 'aria-label': 'Setup' },
    h('span', { class: 'wiz-banner-icon', html: icon('calibration', { size: 22 }) }),
    h('div', { class: 'wiz-banner-text' }, h('strong', { text }), h('span', { class: 'muted', text: sub })),
    h('div', { class: 'banner-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', text: kind === 'resume' ? 'Resume' : 'Start again', onclick: () => { removeBanner(); openSetupWizard({ resume: kind === 'resume' }); } }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Dismiss', onclick: async () => { removeBanner(); await saveWizardState(reduceWizard(state, { type: 'skipWizard', env })).catch(() => {}); announce('Setup dismissed. Run it again from Options.'); } })));
  document.getElementById('main')?.prepend(el);
  bannerEl = el;
}

function installOptionsEntry() {
  document.addEventListener('click', event => {
    if (!event.target.closest?.('#cdlOptionsBtn')) return;
    setTimeout(() => {
      const dialog = document.getElementById('cdlOptionsDialog');
      const target = dialog?.querySelector('.cdl-help-body');
      if (!target || target.querySelector('[data-wizard-entry]')) return;
      const box = h('fieldset', { 'data-wizard-entry': '' },
        h('legend', { text: 'Setup' }),
        h('p', { text: 'Walk through interface, levels, calibration and gear again. Nothing is deleted.' }),
        h('button', { type: 'button', class: 'btn btn-secondary', text: 'Run setup again', onclick: () => { dialog.close(); removeBanner(); openSetupWizard(); } }));
      target.append(box);
    }, 0);
  });
}

/** Called once from the shell: Options entry, then the first-run / resume decision (AC-1, AC-2, AC-10). */
export async function installSetupWizard() {
  if (!isEnabled('setupWizard')) return;
  installOptionsEntry();
  if (wizardAutomationBypass()) return; // browser automation of other smoke suites: no modal on a fresh profile
  const stored = await loadWizardState();
  const hasUserData = (await store.hasUserData()) || workspace.runs.length > 0;
  const decision = startupDecision({ stored, hasUserData, enabled: true });
  if (decision.action === 'auto-complete') await saveWizardState(decision.state).catch(() => {});
  else if (decision.action === 'open') await openSetupWizard({ state: decision.state });
  else if (decision.action === 'resume-banner') await showStartBanner('resume', decision.state);
  else if (decision.action === 'restart-banner') await showStartBanner('restart', decision.state);
}
