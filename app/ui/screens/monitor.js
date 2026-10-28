// FS-31 Live monitor screen: pick an input pair per deck and a timecode format, start monitoring, watch per-deck
// status chips (text + icon shape, never colour only), SNR sparkline, level, lock/drift and hum, the live event
// list and the saved session logs. Analysis runs in app/monitor.js on the FS-00 §4.7 streaming capture, holding the
// capture lease as "live-monitor": another feature asking for the input gets the shared capture-busy dialog, and
// this screen uses the same dialog when something else holds it. An input held exclusively by DJ software is
// shown as an explicit "not available" state with the three workarounds, never a hang.
//
// Global (installed from the shell's [FS-31] init anchor, active only while the flag is on): Ctrl+Shift+M
// starts/stops monitoring; the tray menu (src-tauri/src/tray.rs) sends `monitor://tray` {action}.

import { h, isNative, storageGet, storageSet } from '../dom.js';
import { icon } from '../icons.js';
import { announce, toast } from '../live.js';
import { settings, on } from '../state.js';
import { go, confirmDialog, setCaptureStatus } from '../shell.js';
import { isEnabled, onFeatureChange } from '../../features.js';
import { appState } from '../../app-state.js';
import { TIMECODE_FORMATS } from '../../timecode.js';
import { startStreamSession, captureHolderLabel } from '../audio-io.js';
import { runWithCapture } from '../capture-busy.js';
import { createPairPicker } from '../pair-picker.js';
import {
  createMonitorController, normalizeSettings, trayStateFor, DECK_STATE, DEVICE_BUSY_COPY, WORKAROUNDS, SETTINGS_KEY, MAX_RETENTION_DAYS,
} from '../../monitor.js';
import { createEventList, createLogViewer } from '../live-monitor-log.js';

const PREFS_KEY = 'deckchek.monitor.v1';
const FLAG = 'liveMonitor';
const MUTE_MIN = 30;
const HW_NOTE = 'Sharing an input with Serato or Traktor (WASAPI shared mode next to DJ software) is not verified on real hardware yet: it is hardware test H-31. If the input is busy, use a spare input pair, the DJ software\'s thru/aux output, or a split cable.';
const LOST = Object.freeze({ label: 'Device lost', chip: 'fail', icon: 'fail' });
const OVERALL = { off: { label: 'Off', chip: 'info', icon: 'info' }, ok: DECK_STATE.ok, watch: DECK_STATE.watch, fault: DECK_STATE.fault, lost: LOST };
const chipFor = state => (state === 'lost' ? LOST : DECK_STATE[state] || DECK_STATE.waiting);

const tauri = () => (isNative() ? window.__TAURI__ : null);
const invoke = (cmd, args) => tauri().core.invoke(cmd, args);
const fmt1 = v => (Number.isFinite(v) ? v.toFixed(1).replace('-', '−') : '—');

let ctrl = null;            // one controller per page: the monitor keeps running while other screens are shown
let view = null;            // the screen's render hooks, when created
let monitorSettings = normalizeSettings(null);

function controller() {
  if (ctrl) return ctrl;
  ctrl = createMonitorController({
    startStream: args => runWithCapture(() => startStreamSession(args), { action: 'start the live monitor' }),
    invoke: isNative() ? invoke : null,
    settings: monitorSettings,
    onFrame: () => view?.scheduleRender(),
    onAlert: (alert, { toast: show }) => {
      view?.addEvent(alert);
      if (!show) return;
      // critical: role=alert (error toast without the support "Details"); warning/info: role=status
      if (alert.severity === 'critical') toast(alert.message, { type: 'error', details: false });
      else toast(alert.message, { type: alert.severity === 'warning' ? 'warn' : 'info', timeout: 8000 });
    },
    onState: (state, info) => view?.onState(state, info),
    onTray: tray => view?.onTray(tray),
  });
  return ctrl;
}

async function loadSettings() {
  try { monitorSettings = normalizeSettings((await appState.get(SETTINGS_KEY))?.value); } catch { monitorSettings = normalizeSettings(null); }
  ctrl?.setSettings(monitorSettings);
  return monitorSettings;
}

function prefs() { const p = storageGet(PREFS_KEY, {}) || {}; return { format: typeof p.format === 'string' ? p.format : TIMECODE_FORMATS[0].name, deckB: p.deckB === true }; }

/** Start with the screen's choices (or the last config when the screen was never opened). */
async function startMonitoring(config) {
  const c = controller();
  const cfg = config || view?.readConfig() || c.lastConfig;
  if (!cfg) { go('monitor', { focus: true }); return null; }
  return c.start(cfg);
}

const isActive = c => Boolean(c) && (c.running || c.state === 'starting');

/** Stop a running monitor (allowed whatever the flag says); start one only while the flag is on. */
async function toggleMonitoring() {
  if (isActive(ctrl)) { await ctrl.stop(); announce('Live monitor stopped'); return; }
  if (!isEnabled(FLAG)) return;
  if (!isNative()) go('monitor', { focus: true });
  else await startMonitoring();
}

let shellInstalled = false;
/**
 * Shell start-up hook ([FS-31] init): Ctrl+Shift+M and the tray menu actions. Nothing starts while the flag is off;
 * switching the flag off while monitoring stops the session cleanly (its screen and controls disappear with it).
 */
export function installMonitorShell() {
  if (shellInstalled) return;
  shellInstalled = true;
  onFeatureChange(({ name, enabled }) => {
    if (name !== FLAG || enabled || !isActive(ctrl)) return;
    ctrl.stop().then(() => announce('Live monitor stopped: the feature was switched off')).catch(() => { /* stop never rejects */ });
  });
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.key.toLowerCase() !== 'm' || !isEnabled(FLAG)) return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    toggleMonitoring();
  });
  const t = tauri();
  if (t?.event?.listen) {
    Promise.resolve(t.event.listen('monitor://tray', ev => {
      const action = ev?.payload?.action;
      // stop and quit always work on a running monitor; only starting is gated on the flag (in toggleMonitoring)
      if (action === 'toggle') toggleMonitoring();
      else if (action === 'mute') { if (isActive(ctrl)) { ctrl.mute(MUTE_MIN); view?.renderControls(); } }
      else if (action === 'quit') ctrl?.stop('quit');
    })).catch(() => { /* tray events are optional */ });
  }
}

/** Sparkline of the last 5 min of SNR (min per second); NaN gaps break the line. */
export function sparklinePath(values, { width = 240, height = 48, lo = 0, hi = 45 } = {}) {
  const n = values.length;
  if (!n) return '';
  const x = i => (n === 1 ? width : (i / (n - 1)) * width);
  const y = v => height - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * height;
  let d = '', pen = false;
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  });
  return d.trim();
}

/**
 * Deck card text for a frame (pure, tested): {state, chip, metrics:[{label, value}], note}. `deviceLost` (the
 * controller is retrying): state 'lost' with no live values, never the frozen last frame.
 */
export function deckView(frame, { pairLabel = '', deck = 'A', deviceLost = false } = {}) {
  if (deviceLost) {
    const metrics = [['snr', 'SNR'], ['level', 'Level'], ['lock', 'Lock / drift'], ['hum', 'Hum'], ['dropouts', 'Dropouts (10 s)']].map(([key, label]) => ({ key, label, value: '—', sub: '' }));
    return { state: 'lost', metrics, note: `Deck ${deck}: audio device lost, waiting for it to come back.`, pairLabel };
  }
  if (!frame) return { state: 'waiting', metrics: [], note: 'Waiting for audio…' };
  const st = frame.state;
  const lock = frame.motion === 'idle' ? 'No signal' : frame.locked ? `Locked, ${frame.direction === 'forward' ? 'forward' : frame.direction === 'reverse' ? 'reverse' : 'direction unknown'}` : 'Not locked';
  const metrics = [
    { key: 'snr', label: 'SNR', value: Number.isFinite(frame.snrDb) && frame.motion !== 'idle' ? `${fmt1(frame.snrDb)} dB` : '—', sub: Number.isFinite(frame.snrBaselineDb) ? `baseline ${fmt1(frame.snrBaselineDb)} dB` : 'baseline after 10 s of play' },
    { key: 'level', label: 'Level', value: Number.isFinite(frame.levelDb) && frame.levelDb > -200 ? `${fmt1(frame.levelDb)} dBFS` : 'silent', sub: '' },
    { key: 'lock', label: 'Lock / drift', value: lock, sub: frame.motion === 'play' ? `drift ${fmt1(frame.driftDeg)}°, speed ${fmt1(frame.speedPct)} %` : frame.motion === 'cue' ? 'cueing or scratching: alarms paused' : '' },
    { key: 'hum', label: 'Hum', value: Number.isFinite(frame.humDb) && frame.humDb > -130 ? `${fmt1(frame.humDb)} dBFS` : 'none', sub: frame.mainsHz ? `${frame.mainsHz} Hz family` : '' },
    { key: 'dropouts', label: 'Dropouts (10 s)', value: String(frame.dropouts ?? 0), sub: '' },
  ];
  const note = st === 'nosignal' ? `No signal on Deck ${deck}: vinyl stopped or lifted?` : st === 'idle' ? 'Idle: no signal (not an alarm).' : '';
  return { state: st, metrics, note, pairLabel };
}

/**
 * Parse the retention field: a whole number of days in [1, MAX_RETENTION_DAYS], else null. An empty field is null,
 * never 0 (Number('') === 0 would clamp to 1 day and prune almost every saved log).
 */
export function parseRetentionDays(raw) {
  const t = String(raw ?? '').trim();
  if (!/^\d{1,5}$/.test(t)) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 && n <= MAX_RETENTION_DAYS ? n : null;
}

function levelPct(db) { return Number.isFinite(db) ? Math.max(0, Math.min(100, (db + 60) / 60 * 100)) : 0; }

export function createMonitorScreen(section) {
  const native = isNative();
  const p = prefs();
  section.innerHTML = '';
  const badge = h('span', { class: 'mon-badge', id: 'mon-badge' });
  // the visual badge is redrawn only on change; the screen-reader status is announced only once it has settled
  const badgeLive = h('span', { class: 'sr-only', id: 'mon-badge-live', role: 'status', 'aria-live': 'polite' });
  const head = h('header', { class: 'screen-head' },
    h('div', { class: 'screen-title' }, h('span', { class: 'screen-icon', html: icon('dvs', { size: 24 }) }),
      h('div', {}, h('h1', { tabindex: '-1' }, 'Live monitor ', h('span', { class: 'chip chip-review mon-exp', text: 'Experimental' })),
        h('p', { class: 'lede', text: 'Watches the timecode coming off your decks while Serato or Traktor runs, and warns early when the signal degrades: SNR drop, dropouts, phase trouble or hum.' }))),
    badge, badgeLive);
  const status = h('div', { class: 'mon-status', id: 'mon-status' });
  section.append(head, status);

  if (!native) {
    section.append(h('section', { class: 'card empty', id: 'mon-unsupported' },
      h('span', { class: 'empty-icon', html: icon('plug', { size: 32 }) }),
      h('h2', { text: 'Live monitor needs the desktop app' }),
      h('p', { text: 'This browser preview cannot open audio inputs, so nothing can be monitored here. Run the DeckChek desktop app to monitor your decks live.' })));
    badge.innerHTML = '';
    return { onShow() {}, onHide() {} };
  }

  const c = controller();
  // ----- setup -----
  const format = h('select', { id: 'mon-format', 'aria-label': 'Timecode format' }, ...TIMECODE_FORMATS.map(f => h('option', { value: f.name, text: `${f.name} (${f.carrierHz / 1000} kHz)` })));
  format.value = TIMECODE_FORMATS.some(f => f.name === p.format) ? p.format : TIMECODE_FORMATS[0].name;
  format.addEventListener('change', () => storageSet(PREFS_KEY, { ...prefs(), format: format.value }));
  const pickA = createPairPicker({ id: 'mon-pair-a', label: 'Deck A input pair', slot: 'monitor-a', fallback: 1 });
  const pickB = createPairPicker({ id: 'mon-pair-b', label: 'Deck B input pair', slot: 'monitor-b', fallback: 3 });
  const useB = h('input', { type: 'checkbox', id: 'mon-use-b' });
  useB.checked = p.deckB;
  const deckBWrap = h('div', { class: 'mon-deckb' }, pickB.el);
  const syncB = () => { deckBWrap.hidden = !useB.checked; storageSet(PREFS_KEY, { ...prefs(), deckB: useB.checked }); };
  useB.addEventListener('change', syncB);
  const deviceLine = h('p', { class: 'small muted mon-device' });
  const drawDevice = () => { deviceLine.textContent = `Input: ${settings.deviceName || 'the default input'} (change it in the top bar).`; };
  drawDevice();
  on('settings', ({ key }) => { if (key === 'deviceName') { drawDevice(); pickA.refresh(); pickB.refresh(); } });
  const startBtn = h('button', { type: 'button', class: 'btn btn-primary', id: 'mon-start', 'aria-keyshortcuts': 'Control+Shift+M', onclick: () => { if (startBtn.getAttribute('aria-disabled') !== 'true') startMonitoring(); } },
    h('span', { html: icon('play', { size: 18 }) }), h('span', { text: 'Start monitoring' }), h('kbd', { text: 'Ctrl+Shift+M' }));
  const stopBtn = h('button', { type: 'button', class: 'btn btn-danger', id: 'mon-stop', 'aria-keyshortcuts': 'Control+Shift+M', onclick: async () => { await c.stop(); announce('Live monitor stopped'); } },
    h('span', { html: icon('stop', { size: 18 }) }), h('span', { text: 'Stop monitoring' }));
  const muteBtn = h('button', { type: 'button', class: 'btn btn-ghost', id: 'mon-mute', 'aria-pressed': 'false', onclick: () => { if (c.muted) c.unmute(); else c.mute(MUTE_MIN); renderControls(); announce(c.muted ? `Toasts muted for ${MUTE_MIN} minutes` : 'Toasts on'); } });
  const setup = h('section', { class: 'card mon-setup', id: 'mon-setup', 'aria-labelledby': 'mon-setup-title' },
    h('h2', { class: 'card-title', id: 'mon-setup-title', text: 'Inputs and format' }),
    h('p', { class: 'mon-empty', id: 'mon-empty', text: 'Pick an input pair per deck and a timecode format.' }),
    deviceLine,
    h('div', { class: 'mon-fields' },
      pickA.el,
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'mon-format', text: 'Timecode format' }), format),
      h('label', { class: 'mon-check', for: 'mon-use-b' }, useB, h('span', { text: 'Also monitor deck B' })),
      deckBWrap),
    h('p', { class: 'small mon-hw-note', id: 'mon-hw-note' }, h('span', { html: icon('info', { size: 16 }) }), h('span', { text: HW_NOTE })),
    h('div', { class: 'mon-actions' }, startBtn, stopBtn, muteBtn));
  syncB();

  // ----- decks, events, logs, settings -----
  const decksEl = h('div', { class: 'mon-decks', id: 'mon-decks' });
  const events = createEventList();
  const eventsCard = h('section', { class: 'card', 'aria-labelledby': 'mon-events-title' }, h('h2', { class: 'card-title', id: 'mon-events-title', text: 'Events' }), events.el);
  const logs = createLogViewer({
    api: { list: limit => invoke('monitor_session_list', { limit }), get: id => invoke('monitor_session_get', { id }), remove: id => invoke('monitor_session_delete', { id }) },
    confirm: opts => confirmDialog({ ...opts, confirmLabel: 'Delete' }),
  });
  const retentionMsg = h('p', { class: 'small mon-field-error', id: 'mon-retention-msg', role: 'alert' });
  const retention = h('input', { type: 'number', id: 'mon-retention', min: '1', max: String(MAX_RETENTION_DAYS), step: '1', inputmode: 'numeric', required: true, 'aria-describedby': 'mon-retention-msg', value: String(monitorSettings.retentionDays) });
  const retentionValid = ok => {
    if (ok) { retention.removeAttribute('aria-invalid'); retentionMsg.textContent = ''; return; }
    retention.setAttribute('aria-invalid', 'true');
    retentionMsg.textContent = `Enter a whole number of days from 1 to ${MAX_RETENTION_DAYS}. Nothing was saved; logs are still kept for ${monitorSettings.retentionDays} days.`;
  };
  retention.addEventListener('input', () => { if (retention.hasAttribute('aria-invalid') && parseRetentionDays(retention.value) != null) retentionValid(true); });
  const toastsOn = h('input', { type: 'checkbox', id: 'mon-toasts' });
  toastsOn.checked = monitorSettings.toastsEnabled;
  const settingsMsg = h('p', { class: 'small muted', role: 'status', 'aria-live': 'polite' });
  const settingsCard = h('details', { class: 'card mon-settings' },
    h('summary', { text: 'Monitor settings' }),
    h('form', { class: 'mon-settings-form', novalidate: true, onsubmit: async e => {
      e.preventDefault();
      // validate before anything is saved: an empty, fractional or out-of-range field keeps the previous value
      const days = retention.validity?.badInput ? null : parseRetentionDays(retention.value);
      const next = days == null ? null : normalizeSettings({ ...monitorSettings, retentionDays: days, toastsEnabled: toastsOn.checked });
      if (!next || next.retentionDays !== days) { retentionValid(false); settingsMsg.textContent = ''; retention.focus(); return; }
      retentionValid(true);
      try {
        await appState.set(SETTINGS_KEY, next);
        monitorSettings = next; c.setSettings(next);
        retention.value = String(next.retentionDays);
        // prune only with a value that passed validation unchanged (never an implausible 0/1-day fallback)
        const r = await invoke('monitor_prune', { retentionDays: days });
        settingsMsg.textContent = `Saved. Logs are kept for ${next.retentionDays} days${r?.deleted ? `; ${r.deleted} older log${r.deleted === 1 ? '' : 's'} removed` : ''}.`;
        logs.refresh();
      } catch (error) { settingsMsg.textContent = `Settings could not be saved: ${String(error?.message ?? error)}`; }
    } },
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'mon-retention', text: 'Keep session logs for (days)' }), retention, retentionMsg),
    h('label', { class: 'mon-check', for: 'mon-toasts' }, toastsOn, h('span', { text: 'Show toasts for alerts (the event list always records them)' })),
    h('p', { class: 'small muted', text: 'Alarm thresholds are tunable defaults (SNR 6 dB under its 60 s baseline for 5 s; under 12 dB for 2 s; 3 dropouts in 10 s; hum 10 dB over baseline). Sound alerts are off.' }),
    h('div', { class: 'mon-actions' }, h('button', { type: 'submit', class: 'btn btn-secondary', id: 'mon-settings-save', text: 'Save settings' })), settingsMsg));
  section.append(setup, decksEl, eventsCard, logs.el, settingsCard);

  // ----- rendering -----
  let raf = 0;
  const cards = new Map();
  function deckCard(id) {
    if (cards.has(id)) return cards.get(id);
    const chipEl = h('span', { class: 'mon-chip' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 240 48'); svg.setAttribute('class', 'mon-spark'); svg.setAttribute('role', 'img'); svg.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'mon-spark-line');
    svg.append(path);
    const meterFill = h('span', { class: 'mon-meter-fill' });
    const meter = h('span', { class: 'mon-meter', role: 'meter', 'aria-label': `Deck ${id} level`, 'aria-valuemin': '-60', 'aria-valuemax': '0' }, meterFill);
    const dl = h('dl', { class: 'mon-metrics' });
    const note = h('p', { class: 'small mon-note', role: 'status' });
    const el = h('article', { class: 'card mon-deck', 'data-deck': id, 'aria-labelledby': `mon-deck-${id}` },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: `mon-deck-${id}`, text: `Deck ${id}` }), chipEl),
      dl, meter,
      h('div', { class: 'mon-spark-wrap' }, h('span', { class: 'small muted', text: 'SNR, last 5 min' }), svg),
      note);
    const card = { el, chipEl, dl, meterFill, meter, svg, path, note, last: '' };
    cards.set(id, card);
    decksEl.append(el);
    return card;
  }

  function render() {
    raf = 0;
    const ids = c.deckIds();
    for (const [id, card] of cards) if (!ids.includes(id)) { card.el.remove(); cards.delete(id); }
    const states = [];
    const lost = c.state === 'retrying';
    for (const id of ids) {
      const d = c.deck(id);
      const card = deckCard(id);
      const v = deckView(d.frame, { deck: id, deviceLost: lost });
      states.push(v.state);
      const st = chipFor(v.state);
      const key = `${v.state}`;
      if (card.last !== key) {
        card.chipEl.innerHTML = `<span class="chip chip-${st.chip}" data-state="${v.state}">${icon(st.icon, { size: 14 })}<span>${st.label}</span></span>`;
        card.el.dataset.state = v.state;
        card.last = key;
      }
      card.dl.replaceChildren(...v.metrics.flatMap(m => [h('dt', { text: m.label }), h('dd', { 'data-metric': m.key }, h('span', { class: 'mon-val', text: m.value }), m.sub ? h('span', { class: 'small muted', text: m.sub }) : null)]));
      const lvl = lost ? NaN : d.frame?.levelDb;
      card.meterFill.style.width = `${levelPct(lvl)}%`;
      card.meter.setAttribute('aria-valuenow', String(Number.isFinite(lvl) ? Math.max(-60, Math.round(lvl)) : -60));
      card.meter.setAttribute('aria-valuetext', Number.isFinite(lvl) && lvl > -200 ? `${fmt1(lvl)} dBFS` : 'silent');
      card.path.setAttribute('d', sparklinePath(d.spark));
      const finite = d.spark.filter(Number.isFinite);
      card.svg.setAttribute('aria-label', finite.length ? `Deck ${id} SNR over the last ${Math.ceil(d.spark.length / 60)} min: lowest ${fmt1(Math.min(...finite))} dB, latest ${fmt1(finite.at(-1))} dB` : `Deck ${id} SNR: no play yet`);
      if (card.note.textContent !== v.note) card.note.textContent = v.note;
    }
    drawBadge(lost ? 'lost' : c.running ? trayStateFor(states) : 'off');
  }
  const scheduleRender = () => { if (!raf) raf = requestAnimationFrame(render); };

  let trayInfo = { state: 'off', supported: null };
  let badgeKey = '', liveTimer = 0, liveText = '';
  const ANNOUNCE_SETTLE_MS = 1500;
  function announceBadge(text) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { if (text !== liveText) { liveText = text; badgeLive.textContent = text; } }, ANNOUNCE_SETTLE_MS);
  }
  function drawBadge(overall) {
    const o = OVERALL[overall] || OVERALL.off;
    const trayText = trayInfo.supported === false && c.running ? ' · tray not available here, status shown in this window' : '';
    const key = `${overall}|${trayInfo.supported}|${trayText}`;
    if (key === badgeKey) return; // unchanged: leave the DOM (and screen readers) alone
    badgeKey = key;
    announceBadge(overall === 'off' && !liveText ? '' : `Live monitor: ${o.label}`);
    badge.innerHTML = `<span class="chip chip-${o.chip}" data-overall="${overall}">${icon(o.icon, { size: 14 })}<span>Monitor: ${o.label}</span></span>`;
    badge.title = `Live monitor: ${o.label}${trayText}`;
    badge.dataset.tray = trayInfo.supported === false ? 'unsupported' : trayInfo.supported ? 'tray' : 'unknown';
    const note = badge.querySelector('.mon-tray-note') || h('span', { class: 'small muted mon-tray-note' });
    note.textContent = trayText ? 'Tray not available here: status shows in this window.' : '';
    badge.append(note);
  }

  function renderControls() {
    const running = c.running, busy = c.state === 'starting' || c.state === 'stopping';
    const focused = [startBtn, stopBtn, muteBtn].find(b => b === document.activeElement) || null;
    startBtn.hidden = running || c.state === 'starting';
    stopBtn.hidden = !(running || c.state === 'starting');
    // aria-disabled, not disabled: a disabled button cannot hold the focus moved onto it while stopping
    startBtn.setAttribute('aria-disabled', String(busy));
    for (const el of [format, useB, pickA.el?.querySelector('select'), pickB.el?.querySelector('select')]) if (el) el.disabled = running || busy;
    muteBtn.hidden = !running;
    muteBtn.setAttribute('aria-pressed', String(c.muted));
    muteBtn.textContent = c.muted ? 'Unmute toasts' : `Mute toasts ${MUTE_MIN} min`;
    setup.querySelector('#mon-empty').hidden = running;
    decksEl.hidden = !c.deckIds().length;
    // the focused control was just hidden: keep keyboard focus on its visible counterpart, not <body>
    if (focused?.hidden) (startBtn.hidden ? stopBtn : startBtn).focus();
  }

  function banner(kind, title, body, extra = null) {
    status.replaceChildren(h('div', { class: `banner banner-${kind}`, role: kind === 'fail' ? 'alert' : 'status', id: 'mon-banner', 'data-kind': kind },
      h('span', { html: icon(kind === 'fail' ? 'fail' : kind === 'warn' ? 'warn' : 'info', { size: 20 }) }),
      h('div', { class: 'banner-text' }, h('strong', { text: title }), body ? h('span', { text: body }) : null, extra)));
  }

  function onState(state, info) {
    renderControls();
    setCaptureStatus(state === 'running' ? 'Live monitor running' : state === 'retrying' ? 'Live monitor: device lost' : 'Idle', state === 'running' ? 'recording' : 'idle');
    switch (state) {
      case 'starting': events.set(c.events.list()); banner('info', 'Opening the audio stream…', 'Live monitor asks for the input politely: if another DeckChek feature holds it, you are asked first.'); break;
      case 'running': status.replaceChildren(); if (!info.persisted) banner('info', 'Monitoring', 'The session log could not be opened, so this session is not saved. Alerts still show here.'); announce('Live monitor running'); break;
      case 'retrying': banner('warn', 'Audio device lost', info.message); break;
      case 'device-busy':
        banner('fail', 'The input is held by another program', DEVICE_BUSY_COPY,
          h('div', {}, h('ol', { class: 'mon-workarounds' }, ...WORKAROUNDS.map(w => h('li', { text: w }))),
            h('p', { class: 'small', text: 'Live monitor is not available on this input right now. Whether shared mode works next to your DJ software is not verified yet (hardware test H-31).' })));
        break;
      case 'capture-busy': banner('warn', 'Live monitor did not start', info.holder ? `${captureHolderLabel(info.holder)} is using the audio input. Start the monitor again when it has finished.` : (info.message || 'Another DeckChek feature is using the audio input.')); break;
      case 'preempted': banner('info', 'Live monitor stopped', info.message); break;
      case 'unsupported': banner('fail', 'Live monitor is not available', 'It needs the DeckChek desktop app.'); break;
      case 'error': banner('fail', 'Live monitor is not available', info.message || 'The stream could not be opened.'); break;
      case 'idle':
        status.replaceChildren();
        if (info.summary && info.persisted) {
          banner('info', 'Session saved', `${info.summary.alerts?.critical || 0} critical, ${info.summary.alerts?.warning || 0} warning events. The log is listed under Session logs and in History.`);
          logs.refresh();
        } else if (info.summary) {
          // FS-31 review: never claim a log was saved when monitor_session_end failed or no row was opened.
          banner('warn', 'Session not saved', `${info.summary.alerts?.critical || 0} critical, ${info.summary.alerts?.warning || 0} warning events were shown, but the session log could not be saved.`);
        }
        break;
      default: break;
    }
    if (['preempted', 'capture-busy', 'device-busy', 'error', 'unsupported'].includes(state)) logs.refresh();
    scheduleRender();
  }

  function readConfig() {
    const decks = [{ deck: 'A', pair: pickA.value() }];
    if (useB.checked) decks.push({ deck: 'B', pair: pickB.value() });
    return { deviceName: settings.deviceName || null, decks, format: format.value, hopMs: 250 };
  }

  view = {
    scheduleRender, renderControls, onState, readConfig,
    addEvent: a => events.add(a),
    onTray: t => { trayInfo = t; scheduleRender(); },
  };
  events.set(c.events.list());
  renderControls();
  render();
  loadSettings().then(s => { retention.value = String(s.retentionDays); toastsOn.checked = s.toastsEnabled; });
  logs.refresh();

  return {
    onShow() { renderControls(); scheduleRender(); },
    onHide() { /* the monitor keeps running in the background */ },
    onEscape() { return false; },
    onSpace() { return false; },
  };
}

export function monitorScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-monitor')) main.append(h('section', { class: 'screen', id: 'screen-monitor', hidden: true }));
  return [{ id: 'monitor', title: 'Live monitor', short: 'Monitor', icon: 'dvs', feature: FLAG, create: createMonitorScreen }];
}

