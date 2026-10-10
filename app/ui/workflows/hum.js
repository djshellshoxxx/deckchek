// Hum and feedback screen (FS-15): the guided hum hunter (live hum meter, A-G isolation steps with a 5 s measurement
// each, deltas, ranked causes), the booth feedback test (feedback.js) and the saved runs. All numbers come from
// app/hum.js and app/hum-tree.js; this file is layout, forms, the capture hookup and inline charts.
//
// Flags: features.humHunter (rail entry) and features.feedbackStep (the Feedback test tab).
// Desktop only for measuring (it needs the native input); the Runs tab also works from browser storage.
// Venue context: the app has no venue detail screen, so runs are saved with an optional venue and listed on the Runs tab
// grouped under that venue's name.

import { h, esc, isNative, formatDate } from '../dom.js';
import { icon, chip } from '../icons.js';
import { announce, toast } from '../live.js';
import { confirmDialog } from '../shell.js';
import { store as catalog } from '../state.js';
import { isEnabled } from '../../features.js';
import {
  HUM_STEPS, STEP_MEASURE_SEC, MAINS_CONFIDENCE_MIN, liveHumReading, measureStep, stepResult, analyzeSteps, rankCauses, verdict, humRunInput,
  createHumRunStore,
} from '../../hum-tree.js';
import { openMonoInput, loadInputs, createFeedbackPanel, fmtDbfs } from './feedback.js';

export const HUM_HOLDER = 'hum-hunter';
const LIVE_WINDOW_SEC = 1;
const TABS = [['hum', 'Hum hunter'], ['feedback', 'Feedback test'], ['runs', 'Runs']];

const fmt1 = v => (Number.isFinite(v) ? v.toFixed(1).replace('-', '−') : '—');
export const fmtDb = v => (Number.isFinite(v) ? `${v.toFixed(1).replace('-', '−')} dB` : '—');
export const fmtSigned = v => (Number.isFinite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} dB` : '—');

// ------------------------------------------------------------------ pure helpers (unit tested)

/**
 * Timeline rows for the result and the live step list. Bars show each measured step's total hum level on one shared
 * scale (floor of the quietest step to the loudest hum), so bar length compares steps; the numbers are always printed.
 */
export function timelineModel(results, { currentIdx = -1 } = {}) {
  const steps = analyzeSteps((results || []).filter(Boolean));
  const measured = steps.filter(s => !s.skipped && Number.isFinite(s.totalDbfs));
  const lo = measured.length ? Math.min(...measured.map(s => Math.min(s.totalDbfs, s.floorDbfs ?? s.totalDbfs))) - 3 : -100;
  const hi = measured.length ? Math.max(...measured.map(s => s.totalDbfs)) + 3 : -20;
  const byId = new Map(steps.map(s => [s.stepId, s]));
  return HUM_STEPS.map((def, i) => {
    const s = byId.get(def.id);
    const base = { stepId: def.id, code: def.code, label: def.label, optional: def.optional, probe: def.probe, current: i === currentIdx };
    if (!s) return { ...base, state: 'pending', pct: 0 };
    if (s.skipped) return { ...base, state: 'skipped', pct: 0, note: s.note ?? null };
    return {
      ...base, state: 'measured', pct: Math.max(2, Math.min(100, ((s.totalDbfs - lo) / (hi - lo)) * 100)),
      totalDbfs: s.totalDbfs, floorDbfs: s.floorDbfs, humToFloorDb: s.humToFloorDb, mainsHz: s.mainsHz,
      deltaDb: s.deltaDb, deltaClass: s.deltaClass, message: s.message, spansSkipped: s.spansSkipped, note: s.note ?? null,
    };
  });
}

/** Chip tone and words for a delta class (never colour alone). */
export function deltaChip(row) {
  if (row.state !== 'measured' || row.deltaClass === 'unknown' || row.deltaDb === null) return null;
  const sign = fmtSigned(row.deltaDb);
  switch (row.deltaClass) {
    case 'drop': return { status: 'pass', text: `${sign} · drop` };
    case 'rise': return { status: 'warn', text: `${sign} · rise` };
    case 'noChange': return { status: 'info', text: `${sign} · no change` };
    default: return { status: 'none', text: sign };
  }
}

/** Quality failures of a step measurement, in words the user can act on. Null when the measurement is usable. */
export function qualityProblem(quality) {
  switch (quality?.status) {
    case 'noSignal': return 'No input signal. Check the input device and channel, and that the mixer output is connected, then measure again.';
    case 'clipping': return 'The input is clipping, so the level would be wrong. Lower the input gain and measure again.';
    case 'short': return 'Less than 5 seconds of audio arrived. Measure again.';
    default: return null;
  }
}

/** The live hum reading as display rows (AC-1): fundamental, harmonics 2-6, total and total versus the floor. */
export function liveRows(reading) {
  if (!reading) return null;
  const family = r => ({ mainsHz: r.mainsHz, fundamentalDbfs: r.fundamentalDbfs, totalDbfs: r.totalDbfs, humToFloorDb: r.humToFloorDb, harmonics: r.displayHarmonics.map(x => ({ n: x.n, hz: x.hz, dbfs: x.dbfs })) });
  return { primary: family(reading), alternate: reading.mainsIndeterminate && reading.alternate ? family(reading.alternate) : null, indeterminate: reading.mainsIndeterminate };
}

/** 0-100 position of a hum-to-floor figure on the live meter (0 dB .. 60 dB). */
export const meterPct = db => (Number.isFinite(db) ? Math.max(0, Math.min(100, (db / 60) * 100)) : 0);

const confidenceWord = c => (c >= .7 ? 'High' : c >= .45 ? 'Medium' : 'Low');

// ------------------------------------------------------------------ screen

export function createHumScreen(section, { store = createHumRunStore(), openInput = openMonoInput, feedbackOptions = {} } = {}) {
  const native = () => isNative();
  const st = {
    tab: 'hum', venues: [],
    hum: { view: 'setup', settings: { input: '', channel: 'left', mains: 'auto', venueId: '' }, inputs: [], loaded: false, session: null,
      results: [], idx: 0, measuring: null, tail: [], tailLen: 0, live: null, autoMains: null, mainsSel: 'auto', message: null, saved: null, error: null, measured: null },
    feedback: null, runs: { list: null, error: null, open: null, detail: null },
  };

  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('wave', { size: 24 })}</span><div><h1 tabindex="-1">Hum and feedback</h1>
      <p class="lede">Find where hum comes in by connecting things one at a time, and find the level where the booth monitors start to howl, without ever going near a dangerous volume.</p></div></div></header>
    <div class="tabs" role="tablist" aria-label="Hum and feedback sections" id="hum-tabs"></div>
    <div id="hum-panel" class="hum-panel" role="tabpanel" tabindex="-1"></div>`;
  const q = s => section.querySelector(s);
  const panel = q('#hum-panel'), tabs = q('#hum-tabs');
  const hum = st.hum;

  const visibleTabs = () => TABS.filter(([id]) => id !== 'feedback' || isEnabled('feedbackStep'));

  // ----- tabs -----
  function renderTabs() {
    const list = visibleTabs();
    if (!list.some(([id]) => id === st.tab)) st.tab = 'hum';
    tabs.replaceChildren(...list.map(([id, label]) => h('button', {
      type: 'button', class: 'tab', role: 'tab', id: `hum-tab-${id}`, 'aria-selected': String(st.tab === id), 'aria-controls': 'hum-panel', tabindex: st.tab === id ? '0' : '-1', 'data-tab': id,
      text: label, onclick: () => selectTab(id),
      onkeydown: e => {
        const i = list.findIndex(([t]) => t === st.tab);
        const next = e.key === 'ArrowRight' ? (i + 1) % list.length : e.key === 'ArrowLeft' ? (i - 1 + list.length) % list.length : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : -1;
        if (next < 0) return;
        e.preventDefault(); selectTab(list[next][0], { focusTab: true });
      },
    })));
    panel.setAttribute('aria-labelledby', `hum-tab-${st.tab}`);
  }
  function selectTab(id, { focusTab = false } = {}) {
    if (id === st.tab) return;
    leaveTab();
    st.tab = id; renderTabs(); renderPanel();
    if (focusTab) q(`#hum-tab-${id}`)?.focus();
  }
  /** Anything that can make sound or hold the input is shut down before the tab changes. */
  function leaveTab() {
    disposeFeedback();
    if (st.tab === 'hum' && hum.view === 'steps') { closeCapture(); hum.view = 'setup'; hum.measuring = null; }
  }
  function disposeFeedback() { if (st.feedback) { st.feedback.dispose(); st.feedback = null; } }

  function renderPanel() {
    disposeFeedback();
    panel.replaceChildren();
    if (st.tab === 'hum') renderHum();
    else if (st.tab === 'feedback') {
      const host = h('div', { class: 'fb-host', id: 'fb-host' });
      panel.append(host);
      st.feedback = createFeedbackPanel(host, { store, venues: venueList, ...feedbackOptions });
    } else renderRuns();
  }

  const venueList = async () => { try { return (await catalog.list('venue')).map(v => ({ id: v.id, name: v.name })); } catch { return []; } };
  const venueName = id => st.venues.find(v => v.id === id)?.name || '';

  // ================================================================ hum hunter
  const effectiveMains = () => (hum.mainsSel !== 'auto' ? Number(hum.mainsSel) : hum.autoMains ?? 'auto');

  async function loadHumLists() {
    const [inputs, venues] = await Promise.all([loadInputs(), venueList()]);
    hum.inputs = inputs; st.venues = venues; hum.loaded = true;
  }

  function closeCapture() {
    const s = hum.session; hum.session = null;
    if (s) s.stop().catch(() => {});
    hum.tail = []; hum.tailLen = 0;
  }

  function renderHum() {
    if (hum.view === 'setup') return renderHumSetup();
    if (hum.view === 'steps') return renderHumSteps();
    return renderHumResult();
  }

  function renderHumSetup() {
    panel.replaceChildren();
    if (!hum.loaded) { panel.append(h('p', { class: 'muted', text: 'Looking for audio inputs…' })); loadHumLists().then(() => { if (st.tab === 'hum' && hum.view === 'setup') renderHumSetup(); }); return; }
    const form = h('form', { class: 'card hum-form', id: 'hum-form', novalidate: true });
    const sel = (id, label, children, help) => h('div', { class: 'field' }, h('label', { class: 'field-label', for: id, text: label }), h('select', { id }, ...children), help ? h('span', { class: 'field-help', text: help }) : null);
    form.append(
      h('h2', { class: 'card-title', text: 'Find the hum' }),
      h('p', {}, 'Plug the mixer output you listen to into a computer input. DeckChek measures the 50 or 60 Hz mains hum and its harmonics at each step while you connect the rig one piece at a time, then tells you which connection brought the hum in.'),
      h('div', { class: 'field-grid' },
        sel('hum-input', 'Input', [h('option', { value: '', text: 'System default' }), ...hum.inputs.map(d => h('option', { value: d.name, text: d.name + (d.isDefault ? ' (default)' : ''), selected: d.name === hum.settings.input ? true : null }))], 'The mixer’s record or master output into a computer input.'),
        sel('hum-channel', 'Input channel', [['left', 'Left'], ['right', 'Right'], ['both', 'Both (average)']].map(([v, t]) => h('option', { value: v, text: t, selected: hum.settings.channel === v ? true : null }))),
        sel('hum-mains', 'Mains frequency', [['auto', 'Auto-detect'], ['50', '50 Hz'], ['60', '60 Hz']].map(([v, t]) => h('option', { value: v, text: t, selected: hum.settings.mains === v ? true : null })), '50 Hz in Europe and much of the world, 60 Hz in North America.'),
        st.venues.length ? sel('hum-venue', 'Save to venue (optional)', [h('option', { value: '', text: 'No venue' }), ...st.venues.map(v => h('option', { value: v.id, text: v.name, selected: v.id === hum.settings.venueId ? true : null }))]) : null),
      h('div', { class: 'banner banner-info hum-safe' }, h('span', { class: 'banner-icon', html: icon('info', { size: 20 }) }), h('div', { class: 'banner-text' },
        h('strong', { text: 'About ground lifts' }), h('span', { text: 'Only use an audio ground-lift switch on a mixer or DI box, as its manual describes. Never lift, cut or tape over the mains safety earth, and never open mains wiring.' }))),
      native() ? null : h('p', { class: 'form-error', id: 'hum-unsupported', role: 'alert', text: 'Live hum measurement needs the desktop app. The browser preview cannot read the audio input; you can still read saved runs.' }),
      h('p', { class: 'form-error', id: 'hum-error', role: 'alert', text: hum.error || '' }),
      h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn btn-primary btn-lg', id: 'hum-start', disabled: !native() ? true : null, text: 'Start with step A' })));
    form.addEventListener('submit', e => { e.preventDefault(); startHum(); });
    panel.append(form);
  }

  async function startHum() {
    const s = hum.settings;
    s.input = q('#hum-input').value; s.channel = q('#hum-channel').value; s.mains = q('#hum-mains').value; s.venueId = q('#hum-venue')?.value || '';
    Object.assign(hum, { results: [], idx: 0, measuring: null, live: null, autoMains: s.mains === 'auto' ? null : Number(s.mains), mainsSel: s.mains, message: null, saved: null, error: null, measured: null, tail: [], tailLen: 0 });
    try {
      hum.session = await openInput({
        holder: HUM_HOLDER, deviceName: s.input || null, channel: s.channel, blockMs: 500, action: 'start the hum hunter',
        onSamples: onHumSamples,
        onEnd: ({ reason }) => { if (reason !== 'stopped' && hum.view === 'steps') { hum.session = null; hum.measuring = null; hum.message = { tone: 'fail', text: `The audio input stopped (${reason}). Step measurements so far are kept. Finish now, or go back and start again.` }; if (st.tab === 'hum') renderHumSteps(); } },
      });
    } catch (e) {
      hum.error = e?.cancelled ? 'Not started: another feature is using the audio input.' : (e?.message || String(e));
      renderHumSetup(); return;
    }
    hum.view = 'steps';
    renderHumSteps();
    announce('Hum hunter started. Step A: mixer alone.');
  }

  function onHumSamples({ samples, sampleRate }) {
    if (hum.view !== 'steps') return;
    hum.rate = sampleRate;
    // live meter window
    hum.tail.push(samples); hum.tailLen += samples.length;
    while (hum.tail.length > 1 && hum.tailLen - hum.tail[0].length >= sampleRate * LIVE_WINDOW_SEC) hum.tailLen -= hum.tail.shift().length;
    if (hum.tailLen >= sampleRate * LIVE_WINDOW_SEC * .9) {
      try {
        const win = concat(hum.tail, hum.tailLen);
        const live = liveHumReading(win, sampleRate, { mains: effectiveMains() });
        hum.live = live;
        if (hum.mainsSel === 'auto' && hum.autoMains === null && !live.mainsIndeterminate && live.humToFloorDb >= 10) hum.autoMains = live.mainsHz;
        paintLive();
      } catch { /* window too short for two mains cycles: keep the last reading */ }
    }
    // 5 s step measurement
    const m = hum.measuring;
    if (m) {
      m.chunks.push(samples); m.got += samples.length; m.need = Math.round(STEP_MEASURE_SEC * sampleRate);
      paintProgress();
      if (m.got >= m.need) finishMeasure(sampleRate);
    }
  }

  function concat(chunks, total) {
    const out = new Float32Array(total); let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  function startMeasure() {
    if (hum.measuring || !hum.session) return;
    hum.message = null;
    hum.measuring = { chunks: [], got: 0, need: Math.round(STEP_MEASURE_SEC * (hum.rate || 48000)) };
    renderHumSteps();
    announce(`Measuring ${STEP_MEASURE_SEC} seconds. Keep the rig as it is.`);
  }

  function finishMeasure(sampleRate) {
    const m = hum.measuring; hum.measuring = null;
    const all = concat(m.chunks, m.got);
    const win = all.subarray(all.length - Math.min(all.length, Math.round(STEP_MEASURE_SEC * sampleRate)));
    const def = HUM_STEPS[hum.idx];
    let res;
    try { res = measureStep(win, sampleRate, { mains: effectiveMains() }); }
    catch (e) { hum.message = { tone: 'fail', text: `Could not measure this step: ${e.message}` }; renderHumSteps(); return; }
    const problem = qualityProblem(res.quality);
    if (problem) { hum.message = { tone: res.quality.status === 'short' ? 'warn' : 'fail', text: problem }; renderHumSteps(); announce(problem, { assertive: true }); return; }
    hum.results[hum.idx] = stepResult(def.id, res.measurement, { note: null });
    hum.measured = res.quality;
    const row = timelineModel(compact()).find(r => r.stepId === def.id);
    hum.message = { tone: row.deltaClass === 'drop' ? 'pass' : row.deltaClass === 'rise' ? 'warn' : 'info', text: row.message || `Hum ${fmtDb(row.totalDbfs).replace(' dB', ' dBFS')}, ${fmt1(row.humToFloorDb)} dB above the floor.` };
    renderHumSteps();
    announce(`Step ${def.code} measured. ${hum.message.text}`);
  }

  const compact = () => hum.results.filter(Boolean);
  const stepDone = i => Boolean(hum.results[i]);

  function skipStep() {
    if (hum.measuring) return;
    const def = HUM_STEPS[hum.idx];
    hum.results[hum.idx] = stepResult(def.id, null, { skipped: true });
    hum.message = { tone: 'info', text: `Step ${def.code} skipped. Deltas will compare across it, with lower confidence.` };
    nextStep();
  }

  function nextStep() {
    if (hum.measuring) return;
    if (hum.idx >= HUM_STEPS.length - 1) { finishHum(); return; }
    hum.idx++; hum.message = hum.results[hum.idx - 1]?.skipped ? hum.message : null; hum.measured = null;
    renderHumSteps();
    const def = HUM_STEPS[hum.idx];
    announce(`Step ${def.code}: ${def.label}. ${def.instruction}`);
  }
  function prevStep() {
    if (hum.measuring || hum.idx === 0) return;
    hum.idx--; hum.message = null; renderHumSteps();
  }

  async function finishHum() {
    hum.measuring = null; closeCapture();
    hum.view = 'result'; hum.saved = null;
    renderHumResult();
    const results = compact();
    if (!results.some(r => !r.skipped)) return;
    try {
      hum.saved = await store.save(humRunInput(results, { venueId: hum.settings.venueId || null, mainsHz: effectiveMains() === 'auto' ? null : effectiveMains() }));
    } catch (e) { hum.saved = { error: e?.message || String(e) }; toast(`Could not save the hum run: ${hum.saved.error}`, { type: 'error' }); }
    if (st.tab === 'hum' && hum.view === 'result') paintSaved();
  }

  // ----- steps view -----
  function renderHumSteps() {
    if (st.tab !== 'hum') return;
    const def = HUM_STEPS[hum.idx], done = stepDone(hum.idx), skipped = hum.results[hum.idx]?.skipped;
    const measuring = Boolean(hum.measuring);
    panel.replaceChildren();
    const wrap = h('div', { class: 'hum-steps', id: 'hum-steps' });

    // live meter
    const live = h('section', { class: 'card hum-live', 'aria-labelledby': 'hum-live-h' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'hum-live-h', text: 'Live hum' }),
        h('label', { class: 'hum-mains-pick' }, h('span', { class: 'field-label', text: 'Mains' }),
          h('select', { id: 'hum-mains-sel', 'aria-label': 'Mains frequency', onchange: e => { hum.mainsSel = e.target.value; hum.autoMains = e.target.value === 'auto' ? null : Number(e.target.value); paintLive(); } },
            ...[['auto', 'Auto'], ['50', '50 Hz'], ['60', '60 Hz']].map(([v, t]) => h('option', { value: v, text: t, selected: hum.mainsSel === v ? true : null }))))),
      h('div', { id: 'hum-live-body' }));
    // current step
    const cur = h('section', { class: 'card hum-current', 'aria-labelledby': 'hum-cur-h', id: 'hum-current' },
      h('div', { class: 'hum-step-head' },
        h('span', { class: 'hum-code', 'aria-hidden': 'true', text: def.code }),
        h('div', {}, h('div', { class: 'fb-kicker', text: `Step ${hum.idx + 1} of ${HUM_STEPS.length}${def.optional ? ' · optional' : ''}${def.probe ? ' · extra check' : ''}` }),
          h('h2', { class: 'card-title', id: 'hum-cur-h', text: def.label }))),
      h('p', { class: 'hum-instruction', id: 'hum-instruction', text: def.instruction }),
      measuring ? h('div', { class: 'hum-progress', id: 'hum-progress' }, h('div', { class: 'progress', role: 'progressbar', 'aria-label': `Measuring ${STEP_MEASURE_SEC} seconds`, 'aria-valuemin': '0', 'aria-valuemax': String(STEP_MEASURE_SEC), 'aria-valuenow': '0' }, h('span', { id: 'hum-progress-fill' })), h('p', { class: 'muted', id: 'hum-progress-text', text: `Measuring… 0 of ${STEP_MEASURE_SEC} s. Do not touch anything.` })) : null,
      hum.message ? h('div', { class: `banner banner-${hum.message.tone === 'fail' ? 'fail' : hum.message.tone === 'warn' ? 'warn' : 'info'} hum-msg`, id: 'hum-msg', role: hum.message.tone === 'fail' ? 'alert' : 'status' }, h('span', { class: 'banner-text', text: hum.message.text })) : null,
      h('div', { class: 'hum-actions' },
        !done ? h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'hum-measure', disabled: measuring || !hum.session ? true : null, 'aria-keyshortcuts': 'Space', onclick: startMeasure }, h('span', { text: `Measure ${STEP_MEASURE_SEC} s` }), ' ', h('kbd', { text: 'Space' }))
          : h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'hum-next', 'aria-keyshortcuts': 'Space', onclick: nextStep }, h('span', { text: hum.idx >= HUM_STEPS.length - 1 ? 'See the result' : 'Next step' }), ' ', h('kbd', { text: 'Space' })),
        done && !skipped ? h('button', { type: 'button', class: 'btn btn-secondary', id: 'hum-remeasure', onclick: () => { hum.results[hum.idx] = undefined; hum.message = null; startMeasure(); } }, 'Measure again') : null,
        !done ? h('button', { type: 'button', class: 'btn btn-secondary', id: 'hum-skip', disabled: measuring ? true : null, 'aria-keyshortcuts': 'S', onclick: skipStep }, h('span', { text: 'Skip' }), ' ', h('kbd', { text: 'S' })) : null,
        h('button', { type: 'button', class: 'btn btn-ghost', id: 'hum-back', disabled: measuring || hum.idx === 0 ? true : null, onclick: prevStep }, 'Previous step'),
        h('button', { type: 'button', class: 'btn btn-ghost', id: 'hum-finish', disabled: measuring || !compact().some(r => !r.skipped) ? true : null, onclick: finishHum }, 'Finish now')));
    // timeline
    const tl = h('section', { class: 'card hum-timeline', 'aria-labelledby': 'hum-tl-h' }, h('h2', { class: 'card-title', id: 'hum-tl-h', text: 'Hum at each step' }), timelineList(timelineModel(compact(), { currentIdx: hum.idx })));
    wrap.append(live, cur, tl);
    panel.append(wrap);
    paintLive();
    if (!measuring) q(done ? '#hum-next' : '#hum-measure')?.focus({ preventScroll: true });
  }

  function paintProgress() {
    const m = hum.measuring;
    if (!m) return;
    const s = Math.min(STEP_MEASURE_SEC, (m.got / m.need) * STEP_MEASURE_SEC);
    const fill = q('#hum-progress-fill');
    if (fill) fill.style.width = `${(s / STEP_MEASURE_SEC) * 100}%`;
    q('#hum-progress .progress')?.setAttribute('aria-valuenow', s.toFixed(1));
    const t = q('#hum-progress-text');
    if (t) t.textContent = `Measuring… ${s.toFixed(1)} of ${STEP_MEASURE_SEC} s. Do not touch anything.`;
  }

  function paintLive() {
    const body = q('#hum-live-body');
    if (!body) return;
    const rows = liveRows(hum.live);
    if (!rows) { body.replaceChildren(h('p', { class: 'muted', id: 'hum-live-wait', text: hum.session ? 'Listening… the first reading appears in about a second.' : 'No input is open.' })); return; }
    const block = (fam, extra = '') => h('div', { class: `hum-family${extra}` },
      h('div', { class: 'hum-big' }, h('span', { class: 'hum-big-num', id: extra ? null : 'hum-live-total', text: fmtDb(fam.humToFloorDb) }), h('span', { class: 'muted', text: ` above the noise floor · ${fam.mainsHz} Hz family` })),
      h('div', { class: 'hum-meter', role: 'meter', 'aria-label': `Hum above the floor, ${fam.mainsHz} hertz family`, 'aria-valuemin': '0', 'aria-valuemax': '60', 'aria-valuenow': String(Math.max(0, Math.round(fam.humToFloorDb))), 'aria-valuetext': fmtDb(fam.humToFloorDb) }, h('span', { class: 'hum-meter-fill', style: `width:${meterPct(fam.humToFloorDb)}%` })),
      h('dl', { class: 'hum-harm' },
        h('div', {}, h('dt', { text: `${fam.mainsHz} Hz` }), h('dd', { text: fmtDbfs(fam.fundamentalDbfs, 1) })),
        ...fam.harmonics.map(x => h('div', {}, h('dt', { text: `${x.hz.toFixed(0)} Hz (${x.n}×)` }), h('dd', { text: fmtDbfs(x.dbfs, 1) }))),
        h('div', {}, h('dt', { text: 'Total hum' }), h('dd', { text: fmtDbfs(fam.totalDbfs, 1) }))));
    body.replaceChildren(...[block(rows.primary), rows.alternate ? h('p', { class: 'hum-indet', text: 'The mains frequency is unclear (a generator or battery power can look like this). Both families are shown.' }) : null, rows.alternate ? block(rows.alternate, ' hum-alt') : null].filter(Boolean));
  }

  function timelineList(rows) {
    const list = h('ol', { class: 'hum-tl', id: 'hum-tl' });
    for (const r of rows) {
      const dc = deltaChip(r);
      const li = h('li', { class: `hum-tl-row hum-tl-${r.state}${r.current ? ' hum-tl-current' : ''}`, 'aria-current': r.current ? 'step' : null });
      li.append(h('span', { class: 'hum-code hum-code-sm', 'aria-hidden': 'true', text: r.code }), h('span', { class: 'hum-tl-label', text: r.label }));
      if (r.state === 'measured') {
        li.append(...[h('span', { class: 'hum-tl-bar', role: 'img', 'aria-label': `${r.label}: ${fmtDbfs(r.totalDbfs, 1)} total hum` }, h('span', { class: 'hum-tl-fill', style: `width:${r.pct}%` })),
          h('span', { class: 'hum-tl-val', text: fmtDbfs(r.totalDbfs, 1) }),
          h('span', { class: 'hum-tl-delta' }, dc ? h('span', { html: dc.status === 'none' ? `<span class="chip chip-none">${esc(dc.text)}</span>` : chip(dc.status, dc.text) }) : null),
          r.message ? h('span', { class: 'hum-tl-msg', text: r.message + (r.spansSkipped ? ' (compared across a skipped step)' : '') }) : null].filter(Boolean));
      } else li.append(h('span', { class: 'hum-tl-state muted', text: r.state === 'skipped' ? 'Skipped' : 'Not measured yet' }));
      list.append(li);
    }
    return list;
  }

  // ----- result view -----
  function renderHumResult() {
    panel.replaceChildren();
    const results = compact();
    const wrap = h('div', { class: 'hum-result', id: 'hum-result' });
    const measuredAny = results.some(r => !r.skipped);
    if (!measuredAny) {
      wrap.append(h('div', { class: 'empty card' }, h('span', { class: 'empty-icon', html: icon('wave', { size: 36 }) }), h('h2', { text: 'Nothing was measured' }), h('p', { text: 'Every step was skipped, so there is nothing to compare. Start again and measure at least two steps.' }),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'hum-again', text: 'Start again', onclick: backToSetup }, '')));
      panel.append(wrap); return;
    }
    const causes = rankCauses(results);
    const skippedN = results.filter(r => r.skipped).length;
    wrap.append(h('section', { class: 'card hum-verdict', 'aria-labelledby': 'hum-verdict-h' },
      h('h2', { class: 'card-title', id: 'hum-verdict-h', text: 'Result' }),
      h('p', { class: 'hum-verdict-text', id: 'hum-verdict', text: verdict(results, causes) }),
      skippedN ? h('p', { class: 'muted', text: `${skippedN} step${skippedN > 1 ? 's were' : ' was'} skipped, so conclusions that span them are less certain.` }) : null,
      h('p', { class: 'muted', id: 'hum-saved', role: 'status' })));
    wrap.append(h('section', { class: 'card hum-causes', 'aria-labelledby': 'hum-causes-h' },
      h('h2', { class: 'card-title', id: 'hum-causes-h', text: 'Likely causes' }),
      causes.length
        ? h('ol', { class: 'hum-cause-list', id: 'hum-causes' }, ...causes.map((c, i) => h('li', { class: 'hum-cause' },
          h('div', { class: 'hum-cause-head' }, h('strong', { text: `${i + 1}. ${c.label}` }), h('span', { html: chip(c.confidence >= .7 ? 'pass' : c.confidence >= .45 ? 'info' : 'none', `${confidenceWord(c.confidence)} · ${Math.round(c.confidence * 100)} %`) })),
          h('p', { class: 'hum-evidence', text: c.evidence }),
          h('p', { class: 'hum-next-action' }, h('strong', { text: 'Try: ' }), c.nextAction))))
        : h('p', { text: 'No significant mains hum was measured, so there is no cause to rank.' })));
    wrap.append(h('section', { class: 'card hum-timeline', 'aria-labelledby': 'hum-tl-h' }, h('h2', { class: 'card-title', id: 'hum-tl-h', text: 'Hum at each step' }), timelineList(timelineModel(results))));
    wrap.append(h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn-secondary', id: 'hum-runs-link', text: 'Open saved runs', onclick: () => selectTab('runs') }), h('button', { type: 'button', class: 'btn btn-primary', id: 'hum-again', text: 'Run again', onclick: backToSetup })));
    panel.append(wrap);
    paintSaved();
    q('#hum-again')?.focus({ preventScroll: true });
  }
  function paintSaved() {
    const el = q('#hum-saved');
    if (el) el.textContent = hum.saved?.error ? `Not saved: ${hum.saved.error}` : hum.saved?.id ? `Saved${hum.settings.venueId ? ` to ${venueName(hum.settings.venueId) || 'the venue'}` : ''}. Find it on the Runs tab.` : '';
  }
  function backToSetup() { hum.view = 'setup'; hum.results = []; renderHumSetup(); q('#hum-start')?.focus({ preventScroll: true }); }

  // ================================================================ runs
  async function loadRuns() {
    st.runs.error = null;
    try { st.venues = await venueList(); st.runs.list = await store.list({ limit: 100 }); }
    catch (e) { st.runs.error = e?.message || String(e); st.runs.list = []; }
    if (st.tab === 'runs') renderRuns();
  }

  function renderRuns() {
    panel.replaceChildren();
    if (st.runs.list === null) { panel.append(h('p', { class: 'muted', text: 'Loading runs…' })); loadRuns(); return; }
    if (st.runs.error) { panel.append(h('div', { class: 'banner banner-fail', role: 'alert' }, h('span', { class: 'banner-text', text: `Could not load runs: ${st.runs.error}` }), h('div', { class: 'banner-actions' }, h('button', { type: 'button', class: 'btn btn-secondary', text: 'Try again', onclick: () => { st.runs.list = null; renderRuns(); } })))); return; }
    if (!st.runs.list.length) { panel.append(h('div', { class: 'empty card', id: 'hum-runs-empty' }, h('span', { class: 'empty-icon', html: icon('history', { size: 36 }) }), h('h2', { text: 'No hum or feedback runs yet' }), h('p', { text: 'Finish a hum hunt or a feedback test and it is saved here, with the venue if you picked one.' }))); return; }
    const wrap = h('div', { class: 'hum-runs' });
    const groups = new Map();
    for (const r of st.runs.list) { const key = r.venueId ? venueName(r.venueId) || 'Unknown venue' : 'No venue'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r); }
    for (const [name, rows] of groups) {
      const sec = h('section', { class: 'card hum-run-group', 'aria-label': `Runs: ${name}` }, h('div', { class: 'card-head' }, h('h2', { class: 'card-title', text: name }), h('span', { class: 'muted small', text: `${rows.length} run${rows.length > 1 ? 's' : ''}` })));
      const list = h('ul', { class: 'hum-run-list' });
      for (const r of rows) {
        const open = st.runs.open === r.id;
        const li = h('li', { class: 'hum-run', 'data-run': r.id });
        li.append(h('button', { type: 'button', class: 'hum-run-main', 'aria-expanded': String(open), onclick: () => toggleRun(r.id) },
          h('span', { html: chip(r.kind === 'feedback' ? (r.onset ? 'warn' : 'info') : 'info', r.kind === 'feedback' ? 'Feedback' : 'Hum') }),
          h('span', { class: 'hum-run-verdict', text: r.verdict || '(no verdict)' }),
          h('span', { class: 'muted small', text: `${formatDate(r.createdAt)} · ${r.stepCount ?? ''} steps${r.mainsHz ? ` · ${r.mainsHz} Hz` : ''}` })));
        if (open) li.append(runDetail(r));
        list.append(li);
      }
      sec.append(list); wrap.append(sec);
    }
    panel.append(wrap);
  }

  async function toggleRun(id) {
    if (st.runs.open === id) { st.runs.open = null; st.runs.detail = null; renderRuns(); return; }
    st.runs.open = id; st.runs.detail = null; renderRuns();
    try { st.runs.detail = await store.get(id); } catch (e) { toast(`Could not open the run: ${e?.message || e}`, { type: 'error' }); }
    renderRuns();
  }

  function runDetail(r) {
    const d = st.runs.detail;
    const box = h('div', { class: 'hum-run-detail' });
    if (!d || d.id !== r.id) { box.append(h('p', { class: 'muted', text: 'Loading…' })); return box; }
    if (d.causes?.length) box.append(h('h3', { class: 'fb-sub', text: 'Likely causes' }), h('ol', { class: 'hum-cause-list' }, ...d.causes.map(c => h('li', {}, h('strong', { text: c.label }), ` · ${Math.round(c.confidence * 100)} %`, h('br'), h('span', { class: 'muted', text: c.nextAction })))));
    const fb = d.kind === 'feedback';
    box.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data hum-run-steps' }, h('caption', { class: 'sr-only', text: `${fb ? 'Feedback' : 'Hum'} steps` }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Step' }), h('th', { scope: 'col', class: 'r', text: fb ? 'Output' : 'Total hum' }), h('th', { scope: 'col', class: 'r', text: fb ? 'Peak' : 'Delta' }), h('th', { scope: 'col', text: 'Note' }))),
      h('tbody', {}, ...d.steps.map(s => h('tr', {}, h('td', { text: s.label }),
        h('td', { class: 'r', text: s.skipped ? 'Skipped' : fmtDbfs(fb ? s.levelDbfs : s.totalDbfs, 1) }),
        h('td', { class: 'r', text: s.skipped ? '' : fb ? (Number.isFinite(s.peakHz) ? `${s.peakHz.toFixed(1)} Hz` : '—') : (Number.isFinite(s.deltaDb) ? fmtSigned(s.deltaDb) : '—') }),
        h('td', { html: s.onset ? chip('warn', 'Onset') : '' })))))),
    h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn-danger-ghost', 'data-delete': r.id, onclick: () => deleteRun(r) }, h('span', { html: icon('trash', { size: 16 }) }), ' Delete run')));
    return box;
  }

  async function deleteRun(r) {
    if (!(await confirmDialog({ title: 'Delete this run?', body: 'The measurements of this run are removed from this computer.', confirmLabel: 'Delete run' }))) return;
    try { await store.delete(r.id); st.runs.open = null; st.runs.detail = null; st.runs.list = null; toast('Run deleted.'); renderRuns(); }
    catch (e) { toast(`Could not delete the run: ${e?.message || e}`, { type: 'error' }); }
  }

  // ================================================================ keyboard + lifecycle
  const typing = t => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  function onKey(e) {
    if (section.hidden || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]') || typing(e.target)) return;
    if (st.tab !== 'hum' || hum.view !== 'steps') return;
    if (e.key.toLowerCase() === 's') { e.preventDefault(); skipStep(); }
  }
  document.addEventListener('keydown', onKey);

  /** Everything that holds the input or can make sound stops here: navigation, flag off, window close. */
  function shutdown() {
    disposeFeedback();
    hum.measuring = null;
    if (hum.view === 'steps') { closeCapture(); hum.view = 'setup'; }
  }
  window.addEventListener('pagehide', shutdown);

  renderTabs();
  renderPanel();
  return {
    onShow() { if (st.tab === 'runs') { st.runs.list = null; renderRuns(); } else if (st.tab === 'feedback' && !st.feedback) renderPanel(); else if (st.tab === 'hum' && hum.view === 'setup') { hum.loaded = false; renderHumSetup(); } renderTabs(); },
    onHide: shutdown,
    onSpace() {
      if (st.tab !== 'hum' || hum.view !== 'steps' || hum.measuring) return false;
      if (stepDone(hum.idx)) nextStep(); else startMeasure();
      return true;
    },
    onEscape() {
      if (st.feedback?.isRunning()) { st.feedback.stop('key'); return true; }
      if (hum.measuring) { hum.measuring = null; hum.message = { tone: 'info', text: 'Measurement cancelled.' }; renderHumSteps(); return true; }
      return false;
    },
    reload: () => { st.runs.list = null; if (st.tab === 'runs') renderRuns(); },
  };
}

/** Rail entry for the app shell; follows features.humHunter live. */
export function humScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-hum')) main.append(h('section', { class: 'screen', id: 'screen-hum', hidden: true }));
  return [{ id: 'hum', title: 'Hum and feedback', short: 'Hum', icon: 'wave', feature: 'humHunter', create: createHumScreen }];
}
