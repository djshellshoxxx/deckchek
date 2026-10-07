// App shell: navigation rail, top bar (device, rate, calibration chip, theme,
// help), inspector drawer, status bar, dialogs and global keyboard shortcuts.

import { $, $$, h, esc, isTyping, isNative } from './dom.js';
import { icon, chip } from './icons.js';
import { settings, setSetting, on, emit, active, calibrationStatus } from './state.js';
import { listInputDevices } from './audio-io.js';
import { createStereoMeter, clearAllClips, refreshMeterThemes } from './meters.js';
import { announce, toast } from './live.js';

const screens = new Map();   // id -> {def, section, api}
let order = [];

// ---------- theme ----------
export function applyTheme(theme = settings.theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  const btn = $('#theme-toggle');
  if (btn) {
    const light = theme === 'light';
    btn.innerHTML = icon(light ? 'moon' : 'sun');
    btn.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
    btn.dataset.tooltip = `${light ? 'Dark' : 'Light'} theme (Ctrl+Shift+T)`;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'light' ? '#F5F6F8' : '#0E1013';
  requestAnimationFrame(refreshMeterThemes);
}
export function toggleTheme() {
  setSetting('theme', settings.theme === 'light' ? 'dark' : 'light');
  applyTheme();
  announce(`${settings.theme === 'light' ? 'Light' : 'Dark'} theme`);
}

// ---------- navigation ----------
export function registerScreens(defs) {
  order = defs.map(d => d.id);
  const rail = $('#rail-list');
  defs.forEach((def, i) => {
    const section = $(`#screen-${def.id}`);
    screens.set(def.id, { def, section, api: null });
    rail.append(h('li', {},
      h('button', { type: 'button', class: 'rail-item', 'data-screen': def.id, 'data-tooltip': `${def.title} (Ctrl+${i + 1})`, 'aria-label': def.title, onclick: () => go(def.id) },
        h('span', { class: 'rail-icon', html: icon(def.icon, { size: 22 }) }), h('span', { class: 'rail-label', 'aria-hidden': 'true', text: def.short || def.title }))));
  });
}

export function go(id, { focus = false } = {}) {
  const entry = screens.get(id) || screens.get(order[0]);
  if (!entry) return;
  const previous = active.screen;
  if (previous && previous !== entry) { previous.api?.onHide?.(); previous.section.hidden = true; }
  if (!entry.api) entry.api = entry.def.create(entry.section) || {};
  entry.section.hidden = false;
  active.screen = entry;
  $$('.rail-item').forEach(b => { if (b.dataset.screen === entry.def.id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  document.title = `${entry.def.title} · DeckChek`;
  setSetting('screen', entry.def.id);
  entry.api.onShow?.();
  if (previous !== entry) {
    $('#main').scrollTop = 0;
    if (focus) entry.section.querySelector('h1')?.focus();
    announce(`${entry.def.title} screen`);
  }
}

// ---------- inspector (docked aside / overlay drawer) ----------
const inspector = { lastTrigger: null };
const isNarrow = () => globalThis.innerWidth < 1280;

export function showInspector({ title = 'Details', body = '', open = true } = {}) {
  $('#inspector-title').textContent = title;
  const target = $('#inspector-body');
  target.replaceChildren();
  if (typeof body === 'string') target.innerHTML = body; else if (body) target.append(body);
  if (open) setInspector(true);
}

export function setInspector(open, { remember = true } = {}) {
  const aside = $('#inspector'), app = $('#app');
  const wasOpen = aside.classList.contains('open'), overlay = isNarrow();
  if (open && !wasOpen && overlay) inspector.lastTrigger = document.activeElement;
  aside.classList.toggle('open', open);
  aside.classList.toggle('overlay', overlay && open);
  app.classList.toggle('inspector-open', open && !overlay);
  $('#scrim').hidden = !(open && overlay);
  $$('.rail, .topbar, main, .statusbar').forEach(el => { el.inert = open && overlay; });
  aside.inert = !open;
  $('#inspector-toggle')?.setAttribute('aria-expanded', String(open));
  if (!overlay && remember) setSetting('inspector', open);
  if (open && overlay) $('#inspector-close')?.focus();
  if (!open && wasOpen && inspector.lastTrigger?.isConnected) { inspector.lastTrigger.focus(); }
  if (!open) inspector.lastTrigger = null;
}
export const inspectorOpen = () => $('#inspector').classList.contains('open');
function inspectorIsOverlay() { return $('#inspector').classList.contains('overlay'); }

function trapFocus(event, container) {
  if (event.key !== 'Tab') return;
  const items = $$('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', container).filter(el => !el.disabled && el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

// ---------- confirm dialog ----------
export function confirmDialog({ title, body, confirmLabel = 'Delete', danger = true }) {
  const dlg = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  const ok = $('#confirm-ok');
  ok.textContent = confirmLabel;
  ok.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
  const trigger = document.activeElement;
  return new Promise(resolve => {
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'confirm'); if (trigger?.isConnected) trigger.focus(); }, { once: true });
    dlg.returnValue = '';
    dlg.showModal();
    $('#confirm-cancel').focus(); // destructive: focus the safe action
  });
}

// ---------- top bar ----------
async function populateDevices() {
  const select = $('#device-select');
  try {
    const { backend, devices } = await listInputDevices();
    select.replaceChildren();
    if (backend === 'browser') {
      select.append(h('option', { value: '', text: 'Browser preview · files only' }));
      select.disabled = true;
      select.dataset.tooltip = 'Live inputs are listed in the DeckChek desktop app. In the browser you can analyse audio files.';
    } else if (!devices.length) {
      select.append(h('option', { value: '', text: 'No input devices found' }));
      toast('No audio inputs were found. Connect your interface, then use Refresh devices.', { type: 'warn', action: { label: 'Refresh', run: populateDevices } });
    } else {
      select.disabled = false;
      select.append(h('option', { value: '', text: 'System default input' }));
      devices.forEach(d => select.append(h('option', { value: d.name, text: `${d.name}${d.isDefault ? ' (default)' : ''}` })));
      if (settings.deviceName && !devices.some(d => d.name === settings.deviceName)) {
        toast(`“${settings.deviceName}” is not connected. Using the system default input.`, { type: 'warn' });
        setSetting('deviceName', '');
      }
      select.value = settings.deviceName || '';
    }
  } catch (error) {
    select.replaceChildren(h('option', { value: '', text: 'Device list unavailable' }));
    toast(`Could not list audio inputs: ${error?.message || error}`, { type: 'error', action: { label: 'Retry', run: populateDevices } });
  }
}
export const refreshDevices = populateDevices;
export const currentDeviceName = () => settings.deviceName || (isNative() ? 'System default' : 'File import');

function renderCalChip() {
  const st = calibrationStatus(currentDeviceName(), settings.sampleRate);
  const btn = $('#cal-chip');
  const map = { calibrated: ['pass', 'Calibrated'], mismatch: ['warn', 'Cal. mismatch'], none: ['review', 'Uncalibrated'] };
  const [status, label] = map[st.state];
  btn.innerHTML = chip(status, label, { size: 14 });
  btn.setAttribute('aria-label', `Calibration: ${label}${st.reasons.length && st.state !== 'calibrated' ? ` (${st.reasons.join(', ')})` : ''}. Open calibration.`);
  btn.dataset.tooltip = st.state === 'calibrated' ? `Profile from ${new Date(st.profile.createdAt).toLocaleDateString()} applies to ${currentDeviceName()} @ ${settings.sampleRate} Hz` : `No applicable profile for ${currentDeviceName()} @ ${settings.sampleRate} Hz — results show default uncertainty`;
}

// ---------- status bar ----------
export function setCaptureStatus(text, state = 'idle') {
  const el = $('#status-capture');
  el.className = `status-capture status-${state}`;
  el.innerHTML = `${state === 'recording' ? '<span class="rec-dot" aria-hidden="true"></span>' : ''}<span>${esc(text)}</span>`;
}

// ---------- shortcuts ----------
function onKeydown(event) {
  const key = event.key, ctrl = event.ctrlKey || event.metaKey;
  const screen = active.screen?.api || {};
  const modalOpen = document.querySelector('dialog[open]');
  if (modalOpen) return; // native dialog handles Esc + focus trap
  if (inspectorIsOverlay() && inspectorOpen()) {
    if (key === 'Escape') { event.preventDefault(); setInspector(false); return; }
    trapFocus(event, $('#inspector'));
    return;
  }
  if (ctrl && event.shiftKey && key.toLowerCase() === 't') { event.preventDefault(); toggleTheme(); return; }
  if (ctrl && event.shiftKey && key.toLowerCase() === 'c') { event.preventDefault(); clearAllClips(); announce('Clip indicators cleared'); return; }
  if ((ctrl || event.altKey) && /^[1-8]$/.test(key)) { event.preventDefault(); go(order[Number(key) - 1], { focus: true }); return; }
  if (ctrl && key.toLowerCase() === 'e') { event.preventDefault(); if (screen.onExport) screen.onExport(); else toast('Nothing to export on this screen yet.'); return; }
  if (ctrl && key.toLowerCase() === 's' && screen.onSave) { event.preventDefault(); screen.onSave(); return; }
  if (key === 'Escape') { if (screen.onEscape?.()) event.preventDefault(); else if (inspectorOpen() && isNarrow()) setInspector(false); return; }
  if (key === 'F1') { event.preventDefault(); $('#helpBtn')?.click(); return; }
  if (isTyping(event.target) || ctrl || event.altKey) return;
  if (key === ' ' && screen.onSpace) {
    if (event.target?.tagName === 'BUTTON' && !event.target.dataset.spaceOk) return; // let buttons activate natively
    if (screen.onSpace()) event.preventDefault();
    return;
  }
  if (key === '?') { event.preventDefault(); $('#helpBtn')?.click(); return; }
  if (key.toLowerCase() === 'i') { event.preventDefault(); setInspector(!inspectorOpen()); }
}

// ---------- init ----------
export function initShell(defs) {
  applyTheme();
  registerScreens(defs);
  $('#theme-toggle').addEventListener('click', toggleTheme);
  $('#inspector-toggle').addEventListener('click', () => setInspector(!inspectorOpen()));
  $('#inspector-close').addEventListener('click', () => setInspector(false));
  $('#scrim').addEventListener('click', () => setInspector(false));
  $('#cal-chip').addEventListener('click', () => go('calibration', { focus: true }));
  $('#device-select').addEventListener('change', e => { setSetting('deviceName', e.target.value); renderCalChip(); });
  const rate = $('#rate-select');
  rate.value = String(settings.sampleRate);
  rate.addEventListener('change', e => { setSetting('sampleRate', Number(e.target.value)); renderCalChip(); });
  $('#device-refresh').addEventListener('click', async () => { await populateDevices(); toast('Device list refreshed.', { type: 'success', timeout: 2500 }); });
  document.addEventListener('keydown', onKeydown);
  on('calibration', renderCalChip);
  on('settings', ({ key }) => { if (key === 'deviceName') $('#status-device').textContent = currentDeviceName(); });
  createStereoMeter($('#status-meter'), { variant: 'strip', label: 'Input level (status bar)' });
  $('#status-device').textContent = currentDeviceName();
  $('#status-runtime').innerHTML = isNative() ? `${icon('plug', { size: 14 })}<span>Desktop · native capture</span>` : `${icon('file', { size: 14 })}<span>Browser preview · file analysis</span>`;
  setCaptureStatus('Idle');
  renderCalChip();
  populateDevices();
  const initialOpen = !isNarrow() && settings.inspector !== false;
  setInspector(initialOpen, { remember: false });
  let wasNarrow = isNarrow();
  globalThis.addEventListener('resize', () => {
    const narrow = isNarrow();
    if (narrow !== wasNarrow) { wasNarrow = narrow; setInspector(!narrow && settings.inspector !== false, { remember: false }); }
  });
  globalThis.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => refreshMeterThemes());
  emit('shell-ready');
}
