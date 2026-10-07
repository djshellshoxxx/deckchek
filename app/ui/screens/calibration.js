// Calibration: loopback wizard (play stimulus via WebAudio while capturing),
// recorded-file import, profile display, save per device + sample rate.

import { h, esc, formatNumber, formatDate, download, pickFile } from '../dom.js';
import { icon, chip } from '../icons.js';
import { loopbackStimulus, analyzeLoopback, serializeProfile, deserializeProfile, isProfileApplicable, profileInapplicableReasons } from '../../calibration.js';
import { encodeWav16 } from '../../advanced.js';
import { generateSine } from '../../advanced.js';
import { settings, saveProfile, listProfiles, deleteProfile, on } from '../state.js';
import { startLiveSession, playStereo, decodeAudioFile, classifyCaptureError, liveAvailable } from '../audio-io.js';
import { createStereoMeter } from '../meters.js';
import { linePlot, responsePlot } from '../plots.js';
import { announce, toast } from '../live.js';
import { confirmDialog, currentDeviceName, setCaptureStatus } from '../shell.js';
import { emptyState } from '../workflows/flow.js';

const ISSUE_STATUS = { error: 'fail', warning: 'warn' };

export function createCalibrationScreen(section) {
  const state = { profile: null, running: false, level: -20, duration: 2, playback: null, session: null };

  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('calibration', { size: 24 })}</span><div><h1 tabindex="-1">Calibration</h1>
      <p class="lede">Measure your interface with a loopback cable so results can be corrected for gain, channel mismatch and clock error — and carry honest ± uncertainty.</p></div></div></header>
    <div class="banner-slot" aria-live="assertive"></div>
    <div class="cal-grid">
      <div class="cal-main">
        <section class="card" aria-labelledby="cal-prep"><h2 id="cal-prep" class="card-title">1 · Patch the loopback</h2>
          <ol class="wiring wiring-loop"><li><span class="wiring-node"><strong>Interface OUT L/R</strong><span>line output</span></span><span class="wiring-arrow">${icon('arrowRight', { size: 16 })}</span></li><li><span class="wiring-node"><strong>Cable</strong><span>L→L, R→R</span></span><span class="wiring-arrow">${icon('arrowRight', { size: 16 })}</span></li><li><span class="wiring-node"><strong>Interface IN L/R</strong><span>line input</span></span></li></ol>
          <p class="hint hint-warn">${icon('warn', { size: 16 })}<span>Turn monitors and headphones down — the stimulus includes a chirp and a 10 kHz step. Set the system output to the same interface.</span></p>
          <div class="field-grid">
            <label class="field"><span class="field-label">Stimulus level (dBFS)</span><select id="cal-level"><option value="-26">−26</option><option value="-20" selected>−20 (recommended)</option><option value="-12">−12</option></select></label>
            <label class="field"><span class="field-label">Tone duration</span><select id="cal-duration"><option value="2" selected>2 s</option><option value="4">4 s</option><option value="8">8 s</option></select></label>
            <div class="field"><span class="field-label">Profile target</span><span class="field-static" id="cal-target"></span></div>
          </div>
        </section>
        <section class="card" aria-labelledby="cal-run"><h2 id="cal-run" class="card-title">2 · Run the loopback</h2>
          <div class="cal-run-grid"><div class="meter-host meter-host-sm" id="cal-meter"></div>
            <div class="cal-run-ctrl"><p class="capture-state muted" role="status" id="cal-state"></p>
              <div class="capture-buttons"><button type="button" class="btn btn-primary btn-lg" id="cal-start" data-space-ok="true">${icon('play', { size: 20 })}<span>Run loopback</span><kbd>Space</kbd></button></div>
              <div class="alt-actions"><span class="muted small">Or use a recording:</span>
                <button type="button" class="btn btn-secondary btn-sm" id="cal-download">${icon('download', { size: 16 })}<span>Stimulus WAV</span></button>
                <button type="button" class="btn btn-secondary btn-sm" id="cal-import">${icon('upload', { size: 16 })}<span>Import recorded loopback</span></button></div>
              <p class="muted small">For a recording: play the stimulus WAV out of the interface while recording its input, trim so the file starts within 0.5 s of the stimulus, then import it.</p>
            </div></div>
        </section>
        <section class="card" aria-labelledby="cal-prof" id="cal-profile-card"><h2 id="cal-prof" class="card-title">3 · Profile</h2><div id="cal-profile"></div></section>
      </div>
      <aside class="cal-side" aria-label="Saved profiles and tools">
        <section class="card card-quiet" aria-labelledby="cal-saved"><div class="card-head"><h2 id="cal-saved" class="card-title">Saved profiles</h2><button type="button" class="btn btn-ghost btn-sm" id="cal-load-json">${icon('upload', { size: 16 })}<span>Import JSON</span></button></div><div id="cal-list"></div></section>
        <section class="card card-quiet stack" aria-labelledby="cal-tools"><h2 id="cal-tools" class="card-title">Reference tools</h2>
          <p class="small muted">Play this through the chain under test (or burn it to a test medium) for Speed &amp; Pitch and Quick Check.</p>
          <button type="button" class="btn btn-secondary" id="generate-tone">${icon('download', { size: 18 })}<span>1 kHz reference WAV</span></button>
          <p class="small muted">10 s · stereo · 48 kHz · −9.1 dBFS peak</p></section>
      </aside>
    </div>`;

  const $ = s => section.querySelector(s);
  const banner = $('.banner-slot');
  const meter = liveAvailable() ? createStereoMeter($('#cal-meter'), { variant: 'large', label: 'Loopback input level' }) : null;
  if (!meter) $('#cal-meter').append(emptyState({ icon: 'mic', title: 'Desktop app required', text: 'Live loopback needs native capture. Import a recorded loopback file instead.' }));

  function target() { return { deviceName: currentDeviceName(), sampleRate: settings.sampleRate }; }
  function renderTarget() {
    const t = target();
    $('#cal-target').textContent = `${t.deviceName} @ ${t.sampleRate} Hz`;
    $('#cal-state').textContent = liveAvailable() ? `Ready. DeckChek will capture from ${t.deviceName} and play on the default output.` : 'Live loopback is available in the desktop app.';
    const start = $('#cal-start');
    start.disabled = !liveAvailable();
  }
  function stimulus(sampleRate = settings.sampleRate) {
    return loopbackStimulus({ sampleRate, durationSec: Number($('#cal-duration').value), levelDbfs: Number($('#cal-level').value) });
  }

  function showError(title, text) {
    const el = h('div', { class: 'banner banner-fail', role: 'alert' });
    el.innerHTML = `${chip('fail')}<div class="banner-text"><strong>${esc(title)}</strong><span>${esc(text)}</span></div>`;
    el.append(h('div', { class: 'banner-actions' }, h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Dismiss message', html: icon('x', { size: 16 }), onclick: () => banner.replaceChildren() })));
    banner.replaceChildren(el);
  }

  async function runLoopback() {
    if (state.running) return;
    if (!liveAvailable()) { toast('Live loopback needs the desktop app. Use Import recorded loopback instead.', { type: 'info' }); return; }
    state.running = true; banner.replaceChildren();
    const btn = $('#cal-start'), st = $('#cal-state');
    btn.disabled = true; btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>Running…</span>`;
    meter?.clearClips();
    try {
      st.textContent = 'Opening input…';
      const stim = stimulus();
      const lenSec = stim.meta.totalSamples / stim.meta.sampleRate;
      state.session = await startLiveSession({ deviceName: settings.deviceName || null, maxSeconds: lenSec + 4 });
      const capRate = state.session.info?.sampleRate;
      let stimUse = stim;
      if (capRate && capRate !== stim.meta.sampleRate) { stimUse = stimulus(capRate); toast(`Input runs at ${capRate} Hz; stimulus regenerated to match.`, { type: 'info' }); }
      setCaptureStatus('Calibrating · loopback', 'recording');
      await new Promise(r => setTimeout(r, 300));
      st.textContent = 'Playing stimulus — keep the cable connected…';
      announce('Playing calibration stimulus');
      state.playback = await playStereo(stimUse);
      await Promise.race([state.playback.done, new Promise(r => setTimeout(r, (lenSec + 2) * 1000))]);
      await new Promise(r => setTimeout(r, 400));
      st.textContent = 'Analyzing…';
      const result = await state.session.stop();
      state.session = null;
      const profile = analyzeLoopback(result.audio, stimUse.meta, { deviceName: target().deviceName });
      showProfile(profile, result.audio.sampleRate);
      st.textContent = profile.valid ? 'Loopback analysed. Review and save the profile.' : 'Loopback analysed with problems — see the issues below.';
    } catch (error) {
      const c = classifyCaptureError(error);
      showError(c.title, c.message);
      st.textContent = 'Loopback did not complete.';
      try { await state.session?.cancel(); } catch { /* ignore */ }
      state.session = null;
    } finally {
      state.playback?.stop(); state.playback = null; state.running = false;
      setCaptureStatus('Idle');
      btn.disabled = !liveAvailable(); btn.innerHTML = `${icon('play', { size: 20 })}<span>Run loopback</span><kbd>Space</kbd>`;
    }
  }

  async function importRecording() {
    const file = await pickFile('audio/*,.wav,.aiff,.aif,.flac');
    if (!file) return;
    banner.replaceChildren();
    try {
      const audio = await decodeAudioFile(file);
      const stim = stimulus(audio.sampleRate);
      const profile = analyzeLoopback(audio, stim.meta, { deviceName: target().deviceName });
      showProfile(profile, audio.sampleRate);
      toast(`Analysed ${file.name}.`, { type: profile.valid ? 'success' : 'warn' });
    } catch (error) { showError('Could not analyse the recording', String(error?.message || error)); }
  }

  function readout(label, value, unit, u, digits = 2) {
    return `<div class="readout readout-static"><span class="readout-label">${esc(label)}</span><span class="readout-value"><span class="num">${value == null ? '—' : esc(formatNumber(value, { digits }))}</span><span class="unit">${esc(unit)}</span></span><span class="readout-unc num">${Number.isFinite(u) ? `± ${esc(formatNumber(u * 2, { digits: digits + 1 }))} (k=2)` : '± —'}</span></div>`;
  }

  function showProfile(profile, sampleRate) {
    state.profile = profile;
    const box = $('#cal-profile'), u = profile.uncertainty || {};
    const status = profile.valid ? (profile.issues.length ? 'warn' : 'pass') : 'fail';
    box.innerHTML = `
      <div class="verdict verdict-${status} verdict-compact" tabindex="-1"><div class="verdict-main"><div class="verdict-chip">${chip(status, profile.valid ? (profile.issues.length ? 'USABLE' : 'VALID') : 'INVALID')}</div><div>
        <h3 class="verdict-headline">${profile.valid ? `Profile ready for ${esc(profile.deviceName)} @ ${esc(sampleRate)} Hz` : 'Profile cannot be used'}</h3>
        <p class="muted small">${esc(formatDate(profile.createdAt))}</p></div></div></div>
      ${profile.issues.length ? `<ul class="issues">${profile.issues.map(i => `<li>${chip(ISSUE_STATUS[i.severity] || 'review', null, { size: 14 })}<span><strong class="mono small">${esc(i.code)}</strong> ${esc(i.message)}</span></li>`).join('')}</ul>` : ''}
      <div class="readouts readouts-compact">
        ${readout('Gain L', profile.gainDb?.left, 'dB', u.gainDb)}${readout('Gain R', profile.gainDb?.right, 'dB', u.gainDb)}
        ${readout('L/R mismatch', profile.mismatchDb, 'dB', u.mismatchDb, 3)}${readout('Noise floor', profile.noiseFloorDbfs, 'dBFS', u.noiseFloorDb, 1)}
        ${readout('Latency', profile.latencyMs, 'ms', u.latencyMs, 2)}${readout('Clock error', profile.clockPpm, 'ppm', u.clockPpm, 1)}
        ${readout('THD+N', profile.thdnPercent, '%', u.thdnPercent, 3)}
      </div>
      ${profile.response?.length > 1 ? `<details class="evidence" open><summary>${icon('chevronRight', { size: 16 })}<span>Response deltas</span></summary><div class="evidence-body">${responsePlot(profile.response)}</div></details>` : ''}
      ${(profile.notes || []).map(n => `<p class="hint">${icon('info', { size: 16 })}<span>${esc(n)}</span></p>`).join('')}`;
    const actions = h('div', { class: 'action-bar' });
    const save = h('button', { type: 'button', class: 'btn btn-primary', disabled: !profile.valid, html: `${icon('check', { size: 18 })}<span>Save for ${esc(target().deviceName)} @ ${esc(sampleRate)} Hz</span>` });
    save.addEventListener('click', () => {
      const p = { ...profile, sampleRate };
      saveProfile(p, target().deviceName);
      toast('Calibration profile saved. New results will be corrected.', { type: 'success' });
      renderList();
    });
    const exp = h('button', { type: 'button', class: 'btn btn-secondary', html: `${icon('download', { size: 18 })}<span>Export JSON</span>` });
    exp.addEventListener('click', () => download(`deckchek-calibration-${Date.now()}.json`, serializeProfile(profile), 'application/json'));
    actions.append(save, exp);
    box.append(actions);
    box.querySelector('.verdict')?.focus();
    announce(profile.valid ? 'Calibration profile ready to save.' : 'Calibration failed. See issues.');
  }

  function renderList() {
    const list = $('#cal-list'), items = listProfiles(), t = target();
    if (!items.length) { list.innerHTML = `<div class="empty empty-sm">${icon('calibration', { size: 32 })}<p>No profiles yet. Run a loopback to create one.</p></div>`; return; }
    list.replaceChildren(...items.map(({ key, profile }) => {
      const applicable = isProfileApplicable(profile, t);
      const reasons = profileInapplicableReasons(profile, t);
      const row = h('div', { class: 'profile-row' });
      row.innerHTML = `<div><strong>${esc(profile.deviceName || 'default')}</strong><span class="muted small">${esc(profile.sampleRate)} Hz · ${esc(formatDate(profile.createdAt))}</span>${applicable ? chip('pass', 'ACTIVE', { size: 12 }) : `<span class="muted small">${esc(reasons.join(', '))}</span>`}</div>`;
      const view = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'View', onclick: () => showProfile(profile, profile.sampleRate) });
      const del = h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-danger-ghost', 'aria-label': `Delete profile for ${profile.deviceName} at ${profile.sampleRate} Hz`, html: icon('trash', { size: 16 }) });
      del.addEventListener('click', async () => {
        if (await confirmDialog({ title: 'Delete calibration profile?', body: `Results for ${profile.deviceName} @ ${profile.sampleRate} Hz will be uncalibrated until you run a new loopback.` })) { deleteProfile(key); renderList(); toast('Profile deleted.'); }
      });
      row.append(h('div', { class: 'row-actions' }, view, del));
      return row;
    }));
  }

  $('#cal-start').addEventListener('click', runLoopback);
  $('#cal-import').addEventListener('click', importRecording);
  $('#cal-download').addEventListener('click', () => {
    const s = stimulus();
    download(`deckchek-loopback-stimulus-${s.meta.sampleRate}.wav`, new Blob([encodeWav16({ left: s.left, right: s.right, sampleRate: s.meta.sampleRate })], { type: 'audio/wav' }));
  });
  $('#cal-load-json').addEventListener('click', async () => {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    try { const p = deserializeProfile(await file.text()); showProfile(p, p.sampleRate); toast('Profile imported — review it, then save.', { type: 'success' }); }
    catch (error) { showError('Invalid calibration profile', String(error?.message || error)); }
  });
  $('#generate-tone').addEventListener('click', () => {
    const tone = generateSine({ frequencyHz: 1000, sampleRate: 48000, durationSec: 10, amplitude: .35 });
    download('deckchek-1000hz-reference-10s.wav', new Blob([encodeWav16({ left: tone, right: tone, sampleRate: 48000 })], { type: 'audio/wav' }));
    toast('Generated 10 s stereo 1 kHz reference WAV.', { type: 'success' });
  });
  on('calibration', () => { renderTarget(); renderList(); });
  on('settings', ({ key }) => { if (key === 'deviceName' || key === 'sampleRate') renderTarget(); });
  renderTarget();
  renderList();
  $('#cal-profile').append(emptyState({ icon: 'calibration', title: 'No profile analysed yet', text: 'Run the loopback or import a recording to see gain, mismatch, noise floor, latency and clock error.' }));

  return {
    onSpace: () => { if (liveAvailable()) { runLoopback(); return true; } return false; },
    onEscape: () => { if (state.running) { state.playback?.stop(); return true; } return false; },
    onExport: () => state.profile ? download(`deckchek-calibration-${Date.now()}.json`, serializeProfile(state.profile), 'application/json') : toast('Analyse a loopback first — then Ctrl+E exports the profile.'),
    onShow: () => {
      document.getElementById('inspector-title').textContent = 'About calibration';
      document.getElementById('inspector-body').innerHTML = `<div class="inspect"><p>A loopback measures the interface itself: per-channel gain, L/R mismatch, noise floor, latency and playback/capture clock error.</p><h3>How it is used</h3><p>When a profile matches the selected input and sample rate, level, balance, speed and frequency readings are corrected and their ± uncertainty uses the measured components. Otherwise results are marked <span class="badge badge-uncal">UNCAL</span> with default components.</p><h3>Clock note</h3><p>Loopback shares one clock, so ppm reflects the path, not absolute timebase accuracy.</p></div>`;
    },
  };
}
