// Booth feedback step test panel (FS-15 AC-4..AC-7). Layout and safety messaging only: the level plan, limiter,
// howl detector and abort rules live in app/feedback.js, and the hard -12 dBFS cap in src-tauri/src/audio_out.rs.
//
// What this file adds on top of the engine:
//  - the safety facts are always on screen while sound can play: current output level, the cap, the hard limit;
//  - a big STOP button that is the first tab stop of the run view, with Esc and Space as capture-phase keys
//    (they work even over a dialog) and "raise" is a separate, deliberate action (button or R);
//  - plain-language messages for every automatic abort (howl, clipping, no input, inactivity, output error);
//  - output is stopped on every exit: leaving the screen or tab, closing the window, losing the input stream.
//
// Also exports the small shared input helper used by the hum steps (hum.js), so there is one capture path.

import { h, storageGet, storageSet, isNative } from '../dom.js';
import { icon, chip } from '../icons.js';
import { announce, toast } from '../live.js';
import { listInputDevices, startStreamSession } from '../audio-io.js';
import { runWithCapture } from '../capture-busy.js';
import { audioOut, ABS_MAX_DBFS, SAFETY_COPY } from '../../audio-out.js';
import {
  createFeedbackTest, stepPlan, welchSpectrum, feedbackRunInput, START_DBFS, STEP_DB, DEFAULT_CAP_DBFS, MIN_START_DBFS, MIN_STEP_DB, MAX_STEP_DB,
  MIN_STEP_DWELL_MS, INACTIVITY_MS, NO_INPUT_MS,
} from '../../feedback.js';

export const FEEDBACK_HOLDER = 'feedback-test';
const PREF_KEY = 'deckchek.feedback.prefs.v1';
const SPEC_BAND = [20, 400];
const SPEC_COLUMNS = 90;
const SPEC_DB_RANGE = [-100, -20];
const CHECKLIST = [
  ['fb-chk-vol', 'Master and booth volume are turned down.'],
  ['fb-chk-near', 'I am standing next to the controls and can reach the volume.'],
  ['fb-chk-cap', 'I know DeckChek only limits its own level; the mixer gain and the PA can still make it louder.'],
];

// ------------------------------------------------------------------ pure helpers (unit tested)

export const fmtDbfs = (v, digits = null) => {
  if (!Number.isFinite(v)) return '—';
  const d = digits ?? (Number.isInteger(v) ? 0 : 1);
  return `${v.toFixed(d).replace('-', '−')} dBFS`;
};
export const fmtHz = v => (Number.isFinite(v) ? `${v.toFixed(v < 100 ? 1 : 0)} Hz` : '—');

/** Mono signal from a stereo stream block: 'left' | 'right' | 'both' (average). */
export function monoFrom(block, channel = 'left') {
  const { left, right } = block;
  if (channel === 'right') return right;
  if (channel !== 'both') return left;
  const out = new Float32Array(left.length);
  for (let i = 0; i < out.length; i++) out[i] = (left[i] + right[i]) / 2;
  return out;
}

/** Level bar geometry: start..cap on a 0-100 scale, where the current output sits and how many steps there are. */
export function levelBar(plan, levelDbfs) {
  const levels = plan?.levels ?? [];
  const min = levels[0] ?? START_DBFS, max = plan?.capDbfs ?? DEFAULT_CAP_DBFS;
  const span = max - min;
  const pct = !Number.isFinite(levelDbfs) ? 0 : span <= 0 ? 100 : Math.max(0, Math.min(100, ((levelDbfs - min) / span) * 100));
  const idx = levels.findIndex(l => l === levelDbfs);
  return { minDbfs: min, maxDbfs: max, pct, stepIndex: idx < 0 ? null : idx, stepCount: levels.length, atCap: idx >= 0 && idx === levels.length - 1 };
}

/** Plain-language outcome for each way a run ends. `auto` = the app stopped the sound without a user action. */
export function abortCopy(reason, { onset = null, error = null, captureLost = null } = {}) {
  switch (reason) {
    case 'howl': {
      const where = onset ? ` at ${fmtHz(onset.freqHz)} on step ${onset.stepIndex + 1} (${fmtDbfs(onset.levelDbfs)})` : '';
      return { tone: 'warn', auto: true, title: 'Feedback detected: output stopped automatically', text: `A howl started${where}. DeckChek ramped its output to silence for you.` };
    }
    case 'inputClipping':
      return { tone: 'fail', auto: true, title: 'Input is clipping: output stopped automatically', text: 'The input hit full scale, so the test cannot judge feedback. Lower the input gain on the mixer or interface, then run it again.' };
    case 'noInput':
      return captureLost
        ? { tone: 'fail', auto: true, title: 'Input lost: output stopped automatically', text: `The audio input stopped (${captureLost}). Output was muted because the test cannot hear the room. Check the cable or interface and start again.` }
        : { tone: 'fail', auto: true, title: 'No input signal: output stopped automatically', text: `No audio arrived from the input for over ${NO_INPUT_MS / 1000} second. Output was muted. Check the input device and cable, then start again.` };
    case 'inactivity':
      return { tone: 'warn', auto: true, title: 'No action for 60 s: output stopped automatically', text: 'DeckChek mutes itself when nobody has touched the test for a minute. Start again when you are back at the controls.' };
    case 'outputError':
    case 'startError':
      return { tone: 'fail', auto: true, title: 'Output problem: stop requested', text: `${error?.message ? `${error.message} ` : ''}DeckChek asked the output to stop. If you can still hear the tone, turn down your monitors now.` };
    case 'disposed':
      return { tone: 'info', auto: false, title: 'Test closed', text: 'The screen was closed, so the output was stopped.' };
    case 'finished':
      return { tone: 'pass', auto: false, title: 'Test finished', text: 'Output is silent.' };
    default:
      return { tone: 'info', auto: false, title: 'Stopped', text: captureLost ? `Output stopped (${captureLost}).` : 'You stopped the test. Output is silent.' };
  }
}

/** Plan sentence shown before starting. `cap` is what the engine will really use. */
export function planSummary({ startDbfs = START_DBFS, stepDb = STEP_DB, capDbfs = DEFAULT_CAP_DBFS } = {}) {
  const plan = stepPlan({ startDbfs, stepDb, capDbfs });
  const lowered = Number.isFinite(capDbfs) && capDbfs > ABS_MAX_DBFS;
  return {
    plan,
    lowered,
    text: `Starts at ${fmtDbfs(plan.startDbfs)}, rises ${stepDb} dB each time you confirm, and never goes above ${fmtDbfs(plan.capDbfs)} (${plan.levels.length} steps).${lowered ? ` Your cap is lowered to the ${fmtDbfs(ABS_MAX_DBFS)} hard limit.` : ''}`,
  };
}

/** Pick `columns` log-spaced points of a Welch spectrum between lo and hi Hz, as dB values. */
export function spectrogramColumn(spectrum, [lo, hi] = SPEC_BAND, columns = SPEC_COLUMNS) {
  const out = new Float32Array(columns);
  for (let c = 0; c < columns; c++) {
    const f0 = lo * (hi / lo) ** (c / columns), f1 = lo * (hi / lo) ** ((c + 1) / columns);
    const k0 = Math.max(1, Math.floor(f0 / spectrum.binHz)), k1 = Math.min(spectrum.db.length - 1, Math.max(k0, Math.ceil(f1 / spectrum.binHz)));
    let best = -Infinity;
    for (let k = k0; k <= k1; k++) if (spectrum.db[k] > best) best = spectrum.db[k];
    out[c] = best;
  }
  return out;
}

// ------------------------------------------------------------------ shared input

/**
 * Open the mono input for the hum steps and the feedback test through the one capture path (stream session,
 * capture lease, "Stop it and run this check?" dialog when something else holds the input).
 * onSamples({samples, sampleRate, block}) gets the chosen channel; onEnd({reason}) fires if the stream ends.
 */
export function openMonoInput({ holder, deviceName = null, channel = 'left', blockMs = 250, onSamples, onEnd, action = 'run this check' } = {}) {
  return runWithCapture(() => startStreamSession({
    holder, deviceName: deviceName || null, blockMs,
    onBlock: block => onSamples?.({ samples: monoFrom(block, channel), sampleRate: block.sampleRate, block }),
    onEnd: info => onEnd?.(info),
  }), { action });
}

export async function loadInputs() {
  try { return (await listInputDevices()).devices; } catch { return []; }
}

// ------------------------------------------------------------------ panel

const livePanels = new Set();
let exitHooked = false;
function hookExit() {
  if (exitHooked || typeof window === 'undefined') return;
  exitHooked = true;
  const mute = () => { for (const p of livePanels) p.muteNow(); };
  window.addEventListener('pagehide', mute);
  window.addEventListener('beforeunload', mute);
}

/**
 * The feedback test panel. `host` is the tab body. Options: store (hum run store), venues() -> [{id,name}],
 * audio (audio-out bridge), openInput (injectable for tests).
 * Returns { dispose(), muteNow(), isRunning(), stop() }.
 */
export function createFeedbackPanel(host, { store, venues = async () => [], audio = audioOut, openInput = openMonoInput, now = () => Date.now() } = {}) {
  const prefs = { tone: 'sine', freqHz: 63, capDbfs: DEFAULT_CAP_DBFS, stepDb: STEP_DB, channel: 'left', input: '', output: '', venueId: '', ...(storageGet(PREF_KEY, {}) || {}) };
  const ui = { view: 'setup', test: null, session: null, plan: null, settings: null, result: null, saved: null, captureLost: null, lastAction: 0, stepStartedAt: 0, timer: null, cols: [], specAcc: [], specSamples: 0, specRate: 48000, inputs: [], outputs: [], venues: [], loaded: false, error: null, stopMs: null, stopAt: 0 };
  hookExit();

  const q = s => host.querySelector(s);
  const running = () => Boolean(ui.test) && ['starting', 'running'].includes(ui.test.state);
  const active = () => Boolean(ui.test) && !['stopped', 'done', 'error'].includes(ui.test.state);

  // ----- lifecycle -----
  async function loadLists() {
    const [inputs, outputs, vs] = await Promise.all([
      loadInputs(),
      audio.supported ? audio.listOutputs().catch(() => []) : [],
      Promise.resolve().then(() => venues()).catch(() => []),
    ]);
    ui.inputs = inputs; ui.outputs = outputs; ui.venues = vs; ui.loaded = true;
  }

  function closeInput() {
    const s = ui.session; ui.session = null;
    if (s) s.stop().catch(() => {});
  }
  function stopTimer() { if (ui.timer) { clearInterval(ui.timer); ui.timer = null; } }

  /** Synchronous, idempotent, safe from any exit path: output silenced first, then the input closed. */
  function muteNow() {
    const t = ui.test;
    if (t && active()) { try { t.dispose(); } catch { /* the engine never throws on abort */ } }
    if (t && t.handle !== null && t.handle !== undefined) { try { audio.stop(t.handle).catch(() => {}); } catch { /* idempotent */ } }
    else if (t && active()) { try { audio.stopAll().catch(() => {}); } catch { /* idempotent */ } }
    stopTimer(); closeInput();
  }

  function dispose() {
    document.removeEventListener('keydown', onKey, true);
    livePanels.delete(api);
    muteNow();
  }

  async function stop(why = 'user') {
    const t = ui.test;
    if (!t || !active()) return;
    ui.lastAction = now();
    await t.stop();   // state flips and the UI updates synchronously; output fades in Rust (20 ms)
    if (why === 'key') announce('Stopped. Output is silent.', { assertive: true });
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (running() && (e.key === 'Escape' || e.key === ' ' || e.code === 'Space')) {
      e.preventDefault(); e.stopPropagation();
      stop('key');
      return;
    }
    if (running() && (e.key === 'r' || e.key === 'R') && !host.closest('[hidden]') && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '')) {
      e.preventDefault(); raise();
    }
  }
  document.addEventListener('keydown', onKey, true);

  // ----- start -----
  function readSettings() {
    const freq = Number(q('#fb-freq').value), cap = Number(q('#fb-cap').value), step = Number(q('#fb-step').value);
    return {
      tone: q('#fb-tone').value === 'pinkband' ? 'pinkband' : 'sine',
      freqHz: Math.min(250, Math.max(20, Number.isFinite(freq) ? freq : 63)),
      capDbfs: Number.isFinite(cap) ? cap : DEFAULT_CAP_DBFS,
      stepDb: Math.min(MAX_STEP_DB, Math.max(MIN_STEP_DB, Number.isFinite(step) ? step : STEP_DB)),
      channel: q('#fb-channel').value, input: q('#fb-input').value, output: q('#fb-output').value, venueId: q('#fb-venue')?.value || '',
    };
  }

  async function start() {
    const s = readSettings();
    Object.assign(prefs, s); storageSet(PREF_KEY, prefs);
    let plan;
    try { plan = stepPlan({ startDbfs: START_DBFS, stepDb: s.stepDb, capDbfs: Math.max(MIN_START_DBFS, s.capDbfs) }); }
    catch (e) { ui.error = e.message; renderSetup(); return; }
    ui.settings = s; ui.plan = plan; ui.result = null; ui.saved = null; ui.captureLost = null; ui.error = null; ui.stopMs = null; ui.stopAt = 0;
    ui.cols = []; ui.specAcc = []; ui.specSamples = 0;
    const test = createFeedbackTest({
      audio, plan, tone: { type: s.tone, freqHz: s.freqHz }, device: s.output || null,
      onChange: snap => onChange(snap),
    });
    ui.test = test;
    ui.view = 'run';
    renderRun(test.snapshot());
    q('#fb-stop')?.focus();
    // input first: no sound may play while nobody is listening
    try {
      ui.session = await openInput({
        holder: FEEDBACK_HOLDER, deviceName: s.input || null, channel: s.channel, blockMs: 250, action: 'run the feedback test',
        onSamples: ({ samples, sampleRate }) => { test.pushInput({ samples, sampleRate }); display(samples, sampleRate); },
        onEnd: ({ reason }) => { if (reason !== 'stopped' && active()) { ui.captureLost = reason; test.stop(); } },
      });
    } catch (e) {
      ui.test = null; ui.view = 'setup'; ui.error = e?.cancelled ? 'The test was not started: another feature is using the audio input.' : (e?.message || String(e));
      renderSetup();
      return;
    }
    if (ui.test !== test || test.state !== 'idle') { closeInput(); return; }   // stopped while the input was opening
    const snap = await test.start();
    if (snap.state === 'error') { closeInput(); return; }
    ui.lastAction = ui.stepStartedAt = now();
    ui.timer = setInterval(tick, 250);
    renderRun(test.snapshot());
    announce(`Feedback test started at ${fmtDbfs(snap.levelDbfs)}. Press Escape or Space to stop.`);
  }

  function raise() {
    const t = ui.test;
    if (!t || !running()) return;
    const r = t.nextStep();
    if (r.ok) {
      ui.lastAction = ui.stepStartedAt = now();
      announce(`Output raised to ${fmtDbfs(r.levelDbfs)}`);
    } else if (r.reason === 'atCap') {
      setNote('Already at the cap. Finish the test, or stop and raise the cap in setup (never above −12 dBFS).');
    } else if (r.reason === 'dwell') {
      setNote(`Wait ${Math.ceil(r.waitMs / 1000)} s so the room can settle before the next step.`);
    }
    renderRun(t.snapshot());
  }

  function setNote(text) { const n = q('#fb-note'); if (n) n.textContent = text; }

  function tick() {
    if (!ui.test || !running()) return;
    renderCountdowns();
  }

  function onChange(snap) {
    if (snap.state === 'stopping' && !ui.stopAt) ui.stopAt = now();   // when the mute was requested, for "stop confirmed in N ms"
    if (!host.isConnected) return;
    if (ui.view === 'run') renderRun(snap);
    if (['stopped', 'done', 'error'].includes(snap.state)) finishRun();
  }

  async function finishRun() {
    const t = ui.test;
    if (!t || ui.view === 'result') return;
    stopTimer(); closeInput();
    ui.stopMs = ui.stopAt ? now() - ui.stopAt : null;
    const res = t.result();
    ui.result = res;
    ui.view = 'result';
    renderResult();
    const copy = abortCopy(res.reason, { onset: res.onset, error: res.error, captureLost: ui.captureLost });
    announce(`${copy.title}. ${copy.text}`, { assertive: copy.auto });
    if (res.steps.length && !res.error?.code?.startsWith?.('AUDIO_OUT')) {
      try {
        ui.saved = await store.save(feedbackRunInput(res, { venueId: ui.settings.venueId || null }));
        renderSaved();
      } catch (e) { ui.saved = { error: e?.message || String(e) }; renderSaved(); toast(`Could not save the feedback run: ${ui.saved.error}`, { type: 'error' }); }
    }
  }

  // ----- display feed (spectrogram) -----
  function display(samples, sampleRate) {
    if (ui.view !== 'run' || !samples?.length) return;
    ui.specAcc.push(samples); ui.specSamples += samples.length; ui.specRate = sampleRate;
    if (ui.specSamples < sampleRate) return;
    const win = new Float32Array(ui.specSamples); let off = 0;
    for (const a of ui.specAcc) { win.set(a, off); off += a.length; }
    ui.specAcc = []; ui.specSamples = 0;
    try { ui.cols.push(spectrogramColumn(welchSpectrum(win, sampleRate))); } catch { return; }
    if (ui.cols.length > 120) ui.cols.shift();
    drawSpectrogram();
  }

  function drawSpectrogram() {
    const canvas = q('#fb-canvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const cs = getComputedStyle(canvas);
    const bg = cs.getPropertyValue('--sunken').trim() || '#121418', fg = cs.getPropertyValue('--accent').trim() || '#5AA9FF', hot = cs.getPropertyValue('--warn').trim() || '#F5B731';
    const W = canvas.width, H = canvas.height, cw = W / 120, rh = H / SPEC_COLUMNS;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const [lo, hi] = SPEC_DB_RANGE;
    ui.cols.forEach((col, x) => {
      for (let c = 0; c < col.length; c++) {
        const v = Math.max(0, Math.min(1, (col[c] - lo) / (hi - lo)));
        if (v < .04) continue;
        ctx.globalAlpha = Math.min(1, .15 + v);
        ctx.fillStyle = v > .8 ? hot : fg;
        ctx.fillRect(x * cw, H - (c + 1) * rh, Math.ceil(cw), Math.ceil(rh));
      }
    });
    ctx.globalAlpha = 1;
  }

  // ----- rendering -----
  const optionList = (items, value, firstLabel) => [h('option', { value: '', text: firstLabel }), ...items.map(d => h('option', { value: d.name ?? d.id, text: d.name + (d.isDefault ? ' (default)' : ''), selected: (d.name ?? d.id) === value ? true : null }))];

  function renderSetup() {
    host.replaceChildren();
    if (!ui.loaded) { host.append(h('p', { class: 'muted', text: 'Looking for audio devices…' })); return; }
    if (!isNative() || !audio.supported) {
      host.append(h('div', { class: 'empty card', id: 'fb-unsupported' }, h('span', { class: 'empty-icon', html: icon('alert', { size: 36 }) }), h('h2', { text: 'The feedback test needs the desktop app' }), h('p', { text: 'It plays a very quiet tone through a native audio output with a hard level limit, which the browser preview does not have. The hum hunter works with an input only.' })));
      return;
    }
    if (!ui.outputs.length) {
      host.append(h('div', { class: 'empty card', id: 'fb-no-output' }, h('span', { class: 'empty-icon', html: icon('alert', { size: 36 }) }), h('h2', { text: 'No audio output found' }), h('p', { text: 'The feedback test is disabled because DeckChek cannot find an output to play through. Connect an interface or the mixer’s USB audio and reopen this tab. The hum hunter works with an input only.' })));
      return;
    }
    const safety = h('section', { class: 'banner banner-warn fb-safety', 'aria-labelledby': 'fb-safety-h' },
      h('span', { class: 'banner-icon', html: icon('warn', { size: 22 }) }),
      h('div', { class: 'banner-text' },
        h('strong', { id: 'fb-safety-h', text: 'Safety: this test makes sound' }),
        h('span', { text: `${SAFETY_COPY} It starts near silent (${fmtDbfs(START_DBFS)}) and only rises when you confirm each step. It stops by itself on feedback, clipping, a lost input or a minute of inactivity. Take headphones off your ears.` })));
    const sel = (id, label, children, help) => h('div', { class: 'field' }, h('label', { class: 'field-label', for: id, text: label }), h('select', { id }, ...children), help ? h('span', { class: 'field-help', text: help }) : null);
    const num = (id, label, value, attrs, help) => h('div', { class: 'field' }, h('label', { class: 'field-label', for: id, text: label }), h('input', { id, type: 'number', value: String(value), ...attrs, 'aria-describedby': help ? `${id}-help` : null }), help ? h('span', { class: 'field-help', id: `${id}-help`, text: help }) : null);
    const form = h('form', { class: 'card fb-form', id: 'fb-form', novalidate: true });
    form.append(
      h('h2', { class: 'card-title', text: 'Set up the feedback test' }),
      h('div', { class: 'field-grid' },
        sel('fb-output', 'Output (computer to a mixer channel)', optionList(ui.outputs, prefs.output, 'System default'), 'Play into a spare mixer channel. Keep its fader down until you are ready.'),
        sel('fb-input', 'Input (booth mic or mixer record out)', optionList(ui.inputs, prefs.input, 'System default'), 'DeckChek listens here to hear feedback building up.'),
        sel('fb-channel', 'Input channel', [['left', 'Left'], ['right', 'Right'], ['both', 'Both (average)']].map(([v, t]) => h('option', { value: v, text: t, selected: prefs.channel === v ? true : null }))),
        sel('fb-tone', 'Test sound', [['sine', 'Sine tone'], ['pinkband', 'Pink noise band']].map(([v, t]) => h('option', { value: v, text: t, selected: prefs.tone === v ? true : null }))),
        num('fb-freq', 'Frequency (Hz)', prefs.freqHz, { min: 20, max: 250, step: 1 }, 'Low-frequency booth rumble is usually 40-120 Hz.'),
        num('fb-cap', 'Output cap (dBFS)', prefs.capDbfs, { min: MIN_START_DBFS, max: ABS_MAX_DBFS, step: 1 }, `Default ${DEFAULT_CAP_DBFS}. DeckChek never plays above ${ABS_MAX_DBFS} dBFS.`),
        sel('fb-step', 'Step size', [1, 2, 3, 4, 5, 6].map(v => h('option', { value: String(v), text: `${v} dB`, selected: prefs.stepDb === v ? true : null }))),
        ui.venues.length ? sel('fb-venue', 'Save to venue (optional)', [h('option', { value: '', text: 'No venue' }), ...ui.venues.map(v => h('option', { value: v.id, text: v.name, selected: v.id === prefs.venueId ? true : null }))]) : null),
      h('p', { class: 'fb-plan', id: 'fb-plan', 'aria-live': 'polite' }),
      h('fieldset', { class: 'fb-checks' }, h('legend', { class: 'field-label', text: 'Before you start (confirm each time)' }),
        ...CHECKLIST.map(([id, text]) => h('label', { class: 'check', for: id }, h('input', { type: 'checkbox', id, class: 'fb-check' }), h('span', { text })))),
      h('p', { class: 'form-error', id: 'fb-error', role: 'alert', text: ui.error || '' }),
      h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn btn-primary btn-lg', id: 'fb-start', disabled: true, text: 'Start at the quietest level' })));
    host.append(safety, form);
    const refresh = () => {
      const s = readSettings();
      let ok = true;
      try { q('#fb-plan').textContent = planSummary({ startDbfs: START_DBFS, stepDb: s.stepDb, capDbfs: Math.max(MIN_START_DBFS, s.capDbfs) }).text; }
      catch (e) { q('#fb-plan').textContent = e.message; ok = false; }
      const checked = [...host.querySelectorAll('.fb-check')].every(c => c.checked);
      q('#fb-start').disabled = !(ok && checked);
      q('#fb-start').setAttribute('aria-describedby', checked ? '' : 'fb-plan');
    };
    form.addEventListener('input', refresh); form.addEventListener('change', refresh);
    form.addEventListener('submit', e => { e.preventDefault(); if (!q('#fb-start').disabled) start(); });
    refresh();
  }

  function stateChip(snap) {
    if (snap.state === 'running' || snap.state === 'starting') return chip('fail', 'Output playing');
    if (snap.state === 'stopping') return chip('warn', 'Muting…');
    return chip('pass', 'Output silent');
  }

  function renderRun(snap) {
    if (!q('#fb-run')) buildRun();
    const bar = levelBar(ui.plan, snap.levelDbfs);
    q('#fb-state').innerHTML = stateChip(snap);
    q('#fb-level').textContent = Number.isFinite(snap.levelDbfs) ? fmtDbfs(snap.levelDbfs) : '—';
    q('#fb-capline').textContent = `Cap ${fmtDbfs(snap.capDbfs)} · hard limit ${fmtDbfs(ABS_MAX_DBFS)}`;
    const meter = q('#fb-bar');
    meter.setAttribute('aria-valuemin', String(bar.minDbfs)); meter.setAttribute('aria-valuemax', String(bar.maxDbfs));
    meter.setAttribute('aria-valuenow', String(snap.levelDbfs ?? bar.minDbfs));
    meter.setAttribute('aria-valuetext', `${fmtDbfs(snap.levelDbfs)}, cap ${fmtDbfs(snap.capDbfs)}`);
    q('#fb-fill').style.width = `${bar.pct}%`;
    q('#fb-bar-min').textContent = fmtDbfs(bar.minDbfs); q('#fb-bar-max').textContent = `cap ${fmtDbfs(bar.maxDbfs)}`;
    q('#fb-stepline').textContent = bar.stepIndex === null ? '' : `Step ${bar.stepIndex + 1} of ${bar.stepCount}`;
    const next = ui.plan.levels[(snap.stepIndex ?? 0) + 1];
    const raiseBtn = q('#fb-raise');
    const live = snap.state === 'running';
    raiseBtn.dataset.next = next ?? '';
    raiseBtn.firstElementChild.textContent = next === undefined ? `At the cap (${fmtDbfs(snap.capDbfs)})` : `Raise to ${fmtDbfs(next)}`;
    q('#fb-finish').disabled = !live;
    renderCountdowns(snap);
    const f = snap.lastFrame;
    q('#fb-peak').textContent = f && Number.isFinite(f.peakHz)
      ? `Strongest input peak: ${fmtHz(f.peakHz)} at ${fmtDbfs(f.peakDb)}, ${f.peakToMedianDb.toFixed(0)} dB above the band median${f.narrow ? ' (narrow)' : ''}.`
      : 'Waiting for the first full second of input…';
    const banner = q('#fb-banner');
    if (['stopping', 'stopped', 'done', 'error'].includes(snap.state)) {
      const copy = abortCopy(snap.reason, { onset: snap.onset, error: snap.error, captureLost: ui.captureLost });
      banner.className = `banner banner-${copy.tone === 'pass' ? 'info' : copy.tone === 'info' ? 'info' : copy.tone === 'fail' ? 'fail' : 'warn'} fb-banner`;
      banner.replaceChildren(h('div', { class: 'banner-text' }, h('strong', { text: copy.title }), h('span', { text: copy.text })));
    } else { banner.className = 'fb-banner'; banner.replaceChildren(); }
  }

  function renderCountdowns(snap = ui.test?.snapshot()) {
    if (!snap) return;
    const dwell = Math.max(0, MIN_STEP_DWELL_MS - (now() - ui.stepStartedAt));
    const atCap = q('#fb-raise')?.dataset.next === '';
    const raiseBtn = q('#fb-raise');
    if (!raiseBtn) return;
    raiseBtn.disabled = snap.state !== 'running' || atCap || dwell > 0;
    q('#fb-dwell').textContent = snap.state === 'running' && !atCap && dwell > 0 ? `Next step available in ${Math.ceil(dwell / 1000)} s` : '';
    const left = Math.max(0, INACTIVITY_MS - (now() - ui.lastAction));
    q('#fb-idle').textContent = snap.state === 'running' ? `Auto-mute in ${Math.ceil(left / 1000)} s without action` : '';
    q('#fb-idle').classList.toggle('fb-idle-soon', left < 15000);
  }

  function buildRun() {
    host.replaceChildren();
    // STOP comes first in the DOM so it is the first tab stop of the run view
    const stop = h('button', { type: 'button', class: 'btn btn-danger fb-stop', id: 'fb-stop', 'aria-keyshortcuts': 'Escape Space', onclick: () => stop_() },
      h('span', { class: 'fb-stop-ico', html: icon('stop', { size: 28 }) }), h('span', { class: 'fb-stop-word', text: 'STOP' }),
      h('span', { class: 'fb-stop-keys', html: '<kbd>Esc</kbd> <kbd>Space</kbd>' }));
    const wrap = h('div', { class: 'fb-run', id: 'fb-run' },
      h('div', { class: 'fb-stop-row' }, stop, h('div', { class: 'fb-state', id: 'fb-state', role: 'status', 'aria-live': 'polite' })),
      h('div', { id: 'fb-banner', class: 'fb-banner', role: 'alert' }),
      h('section', { class: 'card fb-levelcard', 'aria-labelledby': 'fb-level-h' },
        h('h2', { class: 'sr-only', id: 'fb-level-h', text: 'Output level' }),
        h('div', { class: 'fb-levelrow' },
          h('div', {}, h('div', { class: 'fb-kicker', text: 'Current output' }), h('div', { class: 'fb-level', id: 'fb-level', text: '—' })),
          h('div', { class: 'fb-limits' }, h('div', { id: 'fb-capline' }), h('div', { id: 'fb-stepline', class: 'muted' }))),
        h('div', { class: 'fb-bar', id: 'fb-bar', role: 'meter', 'aria-label': 'Output level against the cap' }, h('span', { class: 'fb-fill', id: 'fb-fill' }), h('span', { class: 'fb-capmark', 'aria-hidden': 'true' })),
        h('div', { class: 'fb-bar-scale muted' }, h('span', { id: 'fb-bar-min' }), h('span', { id: 'fb-bar-max' })),
        h('div', { class: 'fb-actions' },
          h('button', { type: 'button', class: 'btn btn-secondary btn-lg', id: 'fb-raise', 'aria-keyshortcuts': 'R', disabled: true, onclick: raise }, h('span', { text: 'Raise' }), ' ', h('kbd', { text: 'R' })),
          h('button', { type: 'button', class: 'btn btn-ghost', id: 'fb-finish', onclick: () => { ui.lastAction = now(); ui.test?.finish(); } }, 'Finish: no feedback heard'),
          h('button', { type: 'button', class: 'btn btn-ghost', id: 'fb-here', onclick: () => { ui.test?.touch(); ui.lastAction = now(); renderCountdowns(); announce('Timer reset'); } }, 'I am still here')),
        h('p', { class: 'fb-dwell muted', id: 'fb-dwell', 'aria-live': 'off' }),
        h('p', { class: 'fb-idle muted', id: 'fb-idle', 'aria-live': 'off' }),
        h('p', { class: 'fb-note', id: 'fb-note', role: 'status' })),
      h('section', { class: 'card fb-spec', 'aria-labelledby': 'fb-spec-h' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'fb-spec-h', text: 'What the input hears' }), h('span', { class: 'muted small', text: '20-400 Hz, newest on the right' })),
        h('canvas', { id: 'fb-canvas', width: '480', height: '160', role: 'img', 'aria-label': 'Spectrogram of the input from 20 to 400 hertz. The readout below gives the same information as text.' }),
        h('p', { class: 'fb-peak', id: 'fb-peak', 'aria-live': 'off' })));
    host.append(wrap);
    drawSpectrogram();
  }
  function stop_() { stop('button'); }

  function renderResult() {
    const res = ui.result, copy = abortCopy(res.reason, { onset: res.onset, error: res.error, captureLost: ui.captureLost });
    host.replaceChildren();
    const wrap = h('div', { class: 'fb-result', id: 'fb-result' });
    wrap.append(h('div', { class: `banner banner-${copy.tone === 'fail' ? 'fail' : copy.tone === 'warn' ? 'warn' : 'info'}`, role: 'status' },
      h('div', { class: 'banner-text' }, h('strong', { text: copy.title }), h('span', { text: copy.text })), h('div', { class: 'banner-actions', html: chip('pass', 'Output silent') })));
    if (ui.stopMs !== null) wrap.lastChild.querySelector('.banner-text').append(h('span', { class: 'muted', text: `Stop confirmed in ${ui.stopMs} ms.` }));
    const sum = h('section', { class: 'card fb-sum', 'aria-labelledby': 'fb-sum-h' }, h('h2', { class: 'card-title', id: 'fb-sum-h', text: 'Result' }));
    if (res.onset) {
      sum.append(h('dl', { class: 'fb-facts' },
        fact('Feedback onset', `${fmtHz(res.onset.freqHz)} at step ${res.onset.stepIndex + 1}`),
        fact('Output level at onset', fmtDbfs(res.onset.levelDbfs)),
        fact('Growth rate', Number.isFinite(res.onset.growthDbPerS) ? `${res.onset.growthDbPerS.toFixed(1)} dB per second` : '—'),
        fact('Loop gain margin', res.loopGainMarginDb === null ? 'No stable step before onset' : `${res.loopGainMarginDb} dB (last stable step ${fmtDbfs(res.lastStableLevelDbfs)})`)));
      if (res.guidance.length) sum.append(h('h3', { class: 'fb-sub', text: 'What to try' }), h('ul', { class: 'fb-guidance' }, ...res.guidance.map(g => h('li', { text: g }))), h('p', { class: 'muted', text: 'This is advice from the onset frequency, not a measurement of your room.' }));
    } else if (res.reason === 'finished') {
      sum.append(h('p', { text: `No feedback heard up to ${fmtDbfs(res.steps.at(-1)?.levelDbfs ?? res.levels[0])}. The mixer gain and PA level are still not checked: DeckChek only controlled its own level.` }));
    } else {
      sum.append(h('p', { text: 'The test ended before feedback appeared, so there is no onset to report.' }));
    }
    if (res.steps.length) {
      const body = h('tbody', {}, ...res.steps.map(s => h('tr', { class: res.onset && s.index === res.onset.stepIndex ? 'fb-onset-row' : null },
        h('td', { text: String(s.index + 1) }), h('td', { class: 'r', text: fmtDbfs(s.levelDbfs) }), h('td', { class: 'r', text: Number.isFinite(s.totalDb) ? fmtDbfs(s.totalDb) : '—' }), h('td', { class: 'r', text: fmtHz(s.peakHz) }),
        h('td', { html: res.onset && s.index === res.onset.stepIndex ? chip('warn', 'Onset') : '' }))));
      sum.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data fb-steps' }, h('caption', { class: 'sr-only', text: 'Feedback test steps' }),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Step' }), h('th', { scope: 'col', class: 'r', text: 'Output' }), h('th', { scope: 'col', class: 'r', text: 'Input level' }), h('th', { scope: 'col', class: 'r', text: 'Peak' }), h('th', { scope: 'col', text: 'Note' }))), body)));
    }
    sum.append(h('p', { class: 'muted', id: 'fb-saved', role: 'status' }), h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'fb-again', text: 'Back to setup', onclick: () => { ui.view = 'setup'; ui.test = null; renderSetup(); q('#fb-start')?.focus(); } })));
    wrap.append(sum);
    host.append(wrap);
    renderSaved();
    q('#fb-again')?.focus();
  }
  const fact = (k, v) => h('div', {}, h('dt', { text: k }), h('dd', { text: v }));
  function renderSaved() {
    const el = q('#fb-saved');
    if (!el) return;
    el.textContent = ui.saved?.error ? `Not saved: ${ui.saved.error}` : ui.saved?.id ? 'Saved to your hum and feedback runs.' : '';
  }

  // ----- init -----
  async function init() {
    renderSetup();
    await loadLists();
    if (ui.view === 'setup' && host.isConnected) renderSetup();
  }
  const api = { dispose, muteNow, isRunning: running, stop, init, get view() { return ui.view; } };
  livePanels.add(api);
  init();
  return api;
}
