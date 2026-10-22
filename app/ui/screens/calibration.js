// Calibration: loopback wizard (play stimulus via WebAudio while capturing),
// recorded-file import, profile display, save per device + sample rate.

import { h, esc, formatNumber, formatDate, download, pickFile } from '../dom.js';
import { icon, chip } from '../icons.js';
import { loopbackStimulus, analyzeLoopback, serializeProfile, deserializeProfile, isProfileApplicable, profileInapplicableReasons } from '../../calibration.js';
import { encodeWav16 } from '../../advanced.js';
import { generateSine } from '../../advanced.js';
import { settings, saveProfile, listProfiles, deleteProfile, on } from '../state.js';
import { createPairPicker, currentPairs } from '../pair-picker.js';
import { startLiveSession, playStereo, listOutputDevices, decodeAudioFile, classifyCaptureError, liveAvailable } from '../audio-io.js';
import { createStereoMeter } from '../meters.js';
import { linePlot, responsePlot } from '../plots.js';
import { announce, toast } from '../live.js';
import { confirmDialog, currentDeviceName, setCaptureStatus } from '../shell.js';
import { emptyState } from '../workflows/flow.js';
import { relatedCard } from '../crosslinks.js';
import { audioOut, ABS_MAX_DBFS, SAFETY_COPY } from '../../audio-out.js';
import { TEST_TONES, AMBIENCE_PRESETS, ambientLoop, toneRequest, toneBuffer, encodePcmWav } from '../../test-signals.js';

const ISSUE_STATUS = { error: 'fail', warning: 'warn' };

/**
 * `embedded` (setup wizard, FS-01): no screen header and no saved-profiles side panel, single column, and the returned
 * api also offers isRunning() and dispose() so the host can stop a loopback when its dialog closes.
 * `sinkId` preselects the output device.
 */
export function createCalibrationScreen(section, { embedded = false, sinkId = '' } = {}) {
  const state = { profile: null, running: false, level: -20, duration: 2, playback: null, session: null, testHandle: null, testTimer: null, heartbeat: null, testGeneration: 0 };

  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('calibration', { size: 24 })}</span><div><h1 tabindex="-1">Calibration</h1>
      <p class="lede">Measure your interface with a loopback cable so results can be corrected for gain, channel mismatch and clock error — and carry honest ± uncertainty.</p></div></div></header>
    <div class="banner-slot"></div>
    <div class="xlink-slot" id="cal-xlinks"></div>
    <div class="cal-grid">
      <div class="cal-main">
        <section class="card" aria-labelledby="cal-prep"><h2 id="cal-prep" class="card-title">1 · Patch the loopback</h2>
          <ol class="wiring wiring-loop"><li><span class="wiring-node"><strong>Interface OUT L/R</strong><span>line output</span></span><span class="wiring-arrow">${icon('arrowRight', { size: 16 })}</span></li><li><span class="wiring-node"><strong>Cable</strong><span>L→L, R→R</span></span><span class="wiring-arrow">${icon('arrowRight', { size: 16 })}</span></li><li><span class="wiring-node"><strong>Interface IN L/R</strong><span>line input</span></span></li></ol>
          <p class="hint hint-warn">${icon('warn', { size: 16 })}<span>Turn monitors and headphones down — the stimulus includes a chirp and a 10 kHz step. Choose the interface as the output device below (or set it as the system output).</span></p>
          <div class="field-grid">
            <label class="field"><span class="field-label">Stimulus level (dBFS)</span><select id="cal-level"><option value="-26">−26</option><option value="-20" selected>−20 (recommended)</option><option value="-12">−12</option></select></label>
            <label class="field"><span class="field-label">Tone duration</span><select id="cal-duration"><option value="2" selected>2 s</option><option value="4">4 s</option><option value="8">8 s</option></select></label>
            <label class="field" id="cal-out-field" hidden><span class="field-label">Output device</span><select id="cal-output"><option value="">System default output</option></select></label>
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
              <p class="muted small">For a recording: play the stimulus WAV out of the interface while recording its input, trim so the file starts within 10 s of the stimulus, then import it.</p>
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
        <section class="card card-quiet stack" aria-labelledby="cal-signal-title">
          <h2 id="cal-signal-title" class="card-title">Speaker &amp; PA test signals</h2>
          <p class="small muted">Low-level tones, bass sweeps, routing checks and original synthetic ambience for testing an audio chain or keeping a quiet sound bed during setup. Start with the system gain low.</p>
          <p class="hint hint-warn" id="sig-safety">${icon('warn', { size: 16 })}<span>${SAFETY_COPY} The device, amplifier and venue master controls can still make a capped digital signal loud.</span></p>
          <label class="field"><span class="field-label">Output device</span><select id="sig-output"><option value="">System default output</option></select></label>
          <label class="field"><span class="field-label">Test tone</span><select id="sig-tone">${TEST_TONES.map(t => `<option value="${esc(t.id)}">${esc(t.label)} · ${esc(t.group)}</option>`).join('')}</select></label>
          <label class="field"><span class="field-label">Tone level</span><select id="sig-level"><option value="-36">−36 dBFS · very low</option><option value="-30" selected>−30 dBFS · recommended</option><option value="-24">−24 dBFS</option><option value="-18">−18 dBFS</option><option value="-12">−12 dBFS · maximum</option></select></label>
          <div class="capture-buttons"><button type="button" class="btn btn-primary" id="sig-play-tone" disabled>${icon('play', { size: 16 })}<span>Play selected tone</span></button><button type="button" class="btn btn-secondary" id="sig-stop" disabled>${icon('stop', { size: 16 })}<span>Stop output</span></button></div>
          <label class="field"><span class="field-label">Ambient loop</span><select id="sig-ambience">${AMBIENCE_PRESETS.map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('')}</select><span class="field-help" id="sig-ambience-desc"></span></label>
          <button type="button" class="btn btn-secondary" id="sig-play-ambience" disabled>${icon('play', { size: 16 })}<span>Play ambience at −36 dBFS</span></button>
          <p class="small muted" role="status" id="sig-status">Native signal playback is available in the DeckChek desktop app. Continuous output stops when you leave Calibration.</p>
          <div class="field-grid"><label class="field"><span class="field-label">WAV sample rate</span><select id="sig-rate"><option value="44100">44.1 kHz</option><option value="48000" selected>48 kHz</option><option value="96000">96 kHz</option></select></label>
            <label class="field"><span class="field-label">PCM bit depth</span><select id="sig-bits"><option value="16">16-bit</option><option value="24" selected>24-bit</option><option value="32">32-bit</option></select></label></div>
          <button type="button" class="btn btn-secondary" id="sig-download-wav">${icon('download', { size: 16 })}<span>Download 1 kHz WAV test file</span></button>
          <p class="small muted" id="sig-format-note">Stereo uncompressed PCM · bitrate = sample rate × bit depth × 2 channels. Captured-file analysis reports file format; endpoint bit depth depends on its driver and is not inferred here.</p>
        </section>
      </aside>
    </div>`;

  const $ = s => section.querySelector(s);
  if (embedded) {
    section.classList.add('cal-embedded');
    $('.screen-head').hidden = true;
    $('.cal-side').hidden = true;
  }
  const banner = $('.banner-slot');
  const calPair = createPairPicker({ id: 'cal-pair', label: 'Loopback input pair' });
  if (calPair.el) $('#cal-out-field').after(calPair.el);
  const meter = liveAvailable() ? createStereoMeter($('#cal-meter'), { variant: 'large', label: 'Loopback input level' }) : null;
  if (!meter) $('#cal-meter').append(emptyState({ icon: 'mic', title: 'Desktop app required', text: 'Live loopback needs native capture. Import a recorded loopback file instead.' }));

  function target() { return { deviceName: currentDeviceName(), sampleRate: settings.sampleRate }; }
  function renderTarget() {
    const t = target();
    $('#cal-target').textContent = `${t.deviceName} @ ${t.sampleRate} Hz`;
    $('#cal-state').textContent = liveAvailable() ? `Ready. DeckChek will capture from ${t.deviceName} and play on ${$('#cal-output').selectedOptions[0]?.textContent || 'the default output'}.` : 'Live loopback is available in the desktop app.';
    const start = $('#cal-start');
    start.disabled = !liveAvailable();
  }
  async function populateOutputs() {
    const field = $('#cal-out-field'), sel = $('#cal-output');
    const outs = await listOutputDevices();
    field.hidden = outs.length === 0;
    if (!outs.length) return;
    const prev = sel.value;
    sel.replaceChildren(h('option', { value: '', text: 'System default output' }), ...outs.filter(o => o.id !== 'default').map(o => h('option', { value: o.id, text: o.label })));
    const want = prev || (embedded ? sinkId : '');
    sel.value = [...sel.options].some(o => o.value === want) ? want : '';
    renderTarget();
  }
  async function populateTestOutputs() {
    const select = $('#sig-output');
    if (!audioOut.supported) {
      $('#sig-status').textContent = 'Native signal playback is available in the DeckChek desktop app.';
      $('#sig-play-tone').disabled = true;
      $('#sig-play-ambience').disabled = true;
      return;
    }
    try {
      const outputs = await audioOut.listOutputs();
      const previous = select.value;
      select.replaceChildren(h('option', { value: '', text: 'System default output' }), ...(outputs || []).map(d => h('option', { value: d.name, text: `${d.name}${d.sampleRate ? ` · ${d.sampleRate} Hz` : ''}${d.channels ? ` · ${d.channels} ch` : ''}` })));
      select.value = [...select.options].some(option => option.value === previous) ? previous : '';
      $('#sig-play-tone').disabled = outputs.length === 0;
      $('#sig-play-ambience').disabled = outputs.length === 0;
      $('#sig-status').textContent = outputs.length ? `Detected ${outputs.length} native output${outputs.length === 1 ? '' : 's'}. Reported default format information is shown when the driver exposes it.` : 'No native audio outputs were found.';
    } catch (error) {
      $('#sig-play-tone').disabled = true;
      $('#sig-play-ambience').disabled = true;
      $('#sig-status').textContent = `Could not list audio outputs: ${String(error?.message || error)}`;
    }
  }
  async function stopTestSignal(message = 'Output stopped.') {
    state.testGeneration++;
    clearTimeout(state.testTimer); state.testTimer = null;
    clearInterval(state.heartbeat); state.heartbeat = null;
    const handle = state.testHandle; state.testHandle = null;
    $('#sig-stop').disabled = true;
    if (handle != null) {
      try { await audioOut.stop(handle); }
      catch (error) { try { await audioOut.stopAll(); } catch { /* the native exit guard also silences on app close */ } message = `Stop requested; check output if sound continues. ${String(error?.message || error)}`; }
    }
    if (message !== null) $('#sig-status').textContent = message;
  }
  async function startTestSignal(kind) {
    if (!audioOut.supported) { $('#sig-status').textContent = 'Native signal playback requires the DeckChek desktop app.'; return; }
    await stopTestSignal('Starting selected signal…');
    const generation = state.testGeneration;
    const device = $('#sig-output').value || null;
    const level = Number($('#sig-level').value);
    try {
      let play;
      let duration = 0;
      if (kind === 'ambience') {
        const preset = AMBIENCE_PRESETS.find(item => item.id === $('#sig-ambience').value);
        const loop = ambientLoop(preset.id);
        play = await audioOut.playBuffer(loop, { levelDbfs: -36, capDbfs: ABS_MAX_DBFS, loop: true, rampMs: 60 }, { device });
        state.heartbeat = setInterval(async () => {
          if (state.testHandle == null) return;
          try { await audioOut.setLevel(state.testHandle, -36, { capDbfs: ABS_MAX_DBFS }); }
          catch (error) { await stopTestSignal(`Ambient loop stopped after an output error: ${String(error?.message || error)}`); }
        }, 45_000);
        $('#sig-status').textContent = `${preset.label} playing at −36 dBFS. Click Stop output or leave Calibration to stop it.`;
      } else {
        const spec = toneRequest($('#sig-tone').value, level);
        duration = spec.durationSec;
        if (spec.channel) {
          const buffer = toneBuffer(spec);
          play = await audioOut.playBuffer(buffer, { levelDbfs: spec.levelDbfs, capDbfs: ABS_MAX_DBFS, loop: false, rampMs: 30 }, { device });
        } else {
          play = await audioOut.playTone(spec, { device });
        }
        $('#sig-status').textContent = `${spec.label} playing at ${spec.levelDbfs} dBFS. It will stop automatically in ${duration} s.`;
        state.testTimer = setTimeout(() => { stopTestSignal('Test tone finished; output is silent.'); }, duration * 1000 + 350);
      }
      if (generation !== state.testGeneration) { await audioOut.stop(play.handle); return; }
      state.testHandle = play.handle;
      $('#sig-stop').disabled = false;
    } catch (error) {
      await stopTestSignal(`Signal could not play: ${String(error?.message || error)}`);
    }
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
      state.session = await startLiveSession({ deviceName: settings.deviceName || null, maxSeconds: lenSec + 4, pairs: currentPairs() });
      const capRate = state.session.info?.sampleRate;
      let stimUse = stim;
      if (capRate && capRate !== stim.meta.sampleRate) { stimUse = stimulus(capRate); toast(`Input runs at ${capRate} Hz; stimulus regenerated to match.`, { type: 'info' }); }
      setCaptureStatus('Calibrating · loopback', 'recording');
      await new Promise(r => setTimeout(r, 300));
      st.textContent = 'Playing stimulus — keep the cable connected…';
      announce('Playing calibration stimulus');
      state.playback = await playStereo(stimUse, { sinkId: $('#cal-output').value });
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
      const profile = analyzeLoopback(audio, stim.meta, { deviceName: target().deviceName, maxLagSec: 10 });
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
  $('#sig-play-tone').addEventListener('click', () => startTestSignal('tone'));
  $('#sig-play-ambience').addEventListener('click', () => startTestSignal('ambience'));
  $('#sig-stop').addEventListener('click', () => stopTestSignal());
  $('#sig-ambience').addEventListener('change', () => {
    const preset = AMBIENCE_PRESETS.find(item => item.id === $('#sig-ambience').value);
    $('#sig-ambience-desc').textContent = preset?.description || '';
  });
  $('#sig-download-wav').addEventListener('click', () => {
    const sampleRate = Number($('#sig-rate').value), bits = Number($('#sig-bits').value);
    const amplitude = 10 ** (-20 / 20), tone = generateSine({ frequencyHz: 1000, sampleRate, durationSec: 5, amplitude });
    const wav = encodePcmWav({ left: tone, right: tone, sampleRate, bits });
    const bitrate = sampleRate * bits * 2;
    download(`deckchek-1khz-${sampleRate}-${bits}bit-${bitrate}bps.wav`, new Blob([wav], { type: 'audio/wav' }));
    toast(`Generated stereo PCM: ${sampleRate} Hz, ${bits}-bit, ${bitrate.toLocaleString()} bit/s.`, { type: 'success' });
  });
  on('calibration', () => { renderTarget(); renderList(); });
  on('settings', ({ key }) => { if (key === 'deviceName' || key === 'sampleRate') renderTarget(); });
  renderTarget();
  $('#sig-ambience-desc').textContent = AMBIENCE_PRESETS[0].description;
  populateTestOutputs();
  $('#cal-output').addEventListener('change', renderTarget);
  renderList();
  $('#cal-profile').append(emptyState({ icon: 'calibration', title: 'No profile analysed yet', text: 'Run the loopback or import a recording to see gain, mismatch, noise floor, latency and clock error.' }));

  if (embedded) populateOutputs();

  return {
    isRunning: () => state.running,
    /** Stop playback and discard an in-flight capture (host dialog closing or the user leaving the step). */
    dispose: async () => {
      await stopTestSignal(state.testHandle != null ? 'Output stopped because Calibration closed.' : null);
      state.playback?.stop();
      const session = state.session; state.session = null;
      try { await session?.cancel(); } catch { /* already stopped */ }
    },
    onHide: () => { stopTestSignal('Output stopped because you left Calibration.'); },
    onSpace: () => { if (liveAvailable()) { runLoopback(); return true; } return false; },
    onEscape: () => { if (state.running) { state.playback?.stop(); return true; } return false; },
    onExport: () => state.profile ? download(`deckchek-calibration-${Date.now()}.json`, serializeProfile(state.profile), 'application/json') : toast('Analyse a loopback first — then Ctrl+E exports the profile.'),
    onShow: () => {
      populateOutputs();
      if (!embedded) { const slot = $('#cal-xlinks'), card = relatedCard('calibration', { title: 'After calibration' }); if (slot) slot.replaceChildren(...(card ? [card] : [])); } // Latency link while features.latencyTuner is on
      document.getElementById('inspector-title').textContent = 'About calibration';
      document.getElementById('inspector-body').innerHTML = `<div class="inspect"><p>A loopback measures the interface itself: per-channel gain, L/R mismatch, noise floor, latency and playback/capture clock error.</p><h3>How it is used</h3><p>When a profile matches the selected input and sample rate, level, balance, speed and frequency readings are corrected and their ± uncertainty uses the measured components. Otherwise results are marked <span class="badge badge-uncal">UNCAL</span> with default components.</p><h3>Clock note</h3><p>Loopback shares one clock, so ppm reflects the path, not absolute timebase accuracy.</p></div>`;
    },
  };
}
