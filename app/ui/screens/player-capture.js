// SPEC-10 / CDJ-04: provisional, input-only capture preview. Uses the existing
// acquisition owner; metadata stays separate from ephemeral waveform buffers.
import { h, isNative, download } from '../dom.js';
import { icon } from '../icons.js';
import { settings, on } from '../state.js';
import { showInspector } from '../shell.js';
import { startLiveSession } from '../audio-io.js';
import { createPairPicker, currentPairs } from '../pair-picker.js';
import { runCdjAcquisition, CDJ_MAX_CAPTURE_SECONDS } from '../../player/acquisition.js';
import { inspectPlayerReferenceFile } from '../../player/reference-file.js';
import { preparePlayerAudioExport } from '../../player/audio-export.js';

const REASONS = Object.freeze({
  buffer_overruns_reported: 'The input reported dropped samples.',
  stream_errors_reported: 'The input reported stream errors.',
  capture_capacity_reached: 'The capture reached its buffer capacity.',
  clipping_reported: 'Clipping was reported. Lower the input gain before another capture.',
  captured_frame_count_mismatch: 'The reported frame count differs from the returned audio.',
  device_observation_unavailable: 'The actual input device was not reported.',
  requested_device_differs: 'The reported device differs from the requested device.',
  nominal_rate_observation_unavailable: 'The input sample rate was not reported.',
  channel_count_observation_unavailable: 'The channel count was not reported.',
  pair_observation_unavailable: 'The captured input pair was not reported.',
  unexpected_multiple_pairs: 'The input reported more than one captured pair.',
  primary_pair_descriptor_mismatch: 'The returned audio and pair description disagree.',
  requested_pair_differs: 'The captured pair differs from the requested pair.',
  primary_sample_observation_unavailable: 'The captured sample counts could not be verified.',
  primary_channel_lengths_differ: 'The two captured channels have different lengths.',
  capture_counters_unavailable: 'Some input counters were not reported.',
});
const textOrNull = field => field.value.trim() || null;
const shown = value => value == null ? 'Unknown' : String(value);
const processing = value => ({ unknown: 'Unknown', enabled: 'On', disabled: 'Off' })[value] || 'Unknown';

/** Dependencies have production defaults; tests may model capture, native availability and local download. */
export function createPlayerCaptureScreen(section, {
  acquire = runCdjAcquisition, startCapture = startLiveSession, native = isNative,
  save = download, pairPicker = createPairPicker, selectPairs = currentPairs,
  inspectReference = inspectPlayerReferenceFile, prepareAudioExport = preparePlayerAudioExport,
} = {}) {
  let current = null, last = null, visible = true, disposed = false;
  let referenceTask = null, selectedReference = null;
  const fields = {};
  function input(name, label, attrs = {}) {
    const el = h('input', { id: `pc-${name}`, type: 'text', maxlength: 240, ...attrs });
    fields[name] = el;
    return h('div', { class: 'field' }, h('label', { class: 'field-label', for: `pc-${name}`, text: label }), el);
  }
  function select(name, label, options) {
    const el = h('select', { id: `pc-${name}` }, options.map(([value, label]) => h('option', { value, text: label })));
    fields[name] = el;
    return h('div', { class: 'field' }, h('label', { class: 'field-label', for: `pc-${name}`, text: label }), el);
  }
  const pair = pairPicker({ id: 'pc-input-pair' });
  const device = h('p', { id: 'pc-device', class: 'field-static' });
  const status = h('p', { id: 'pc-status', class: 'pc-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const result = h('section', { id: 'pc-result', class: 'card pc-result', hidden: true, 'aria-labelledby': 'pc-result-title' });
  const start = h('button', { id: 'pc-start', type: 'button', class: 'btn btn-primary', text: 'Start capture', onclick: () => begin() });
  const cancel = h('button', { id: 'pc-cancel', type: 'button', class: 'btn btn-secondary', text: 'Cancel capture', onclick: () => abort() });
  const clear = h('button', { id: 'pc-clear', type: 'button', class: 'btn btn-ghost', text: 'Clear details', onclick: () => { if (!disposed && visible && !current && last) { discard(); setStatus('Capture details cleared.'); } } });
  const exportButton = h('button', { id: 'pc-export', type: 'button', class: 'btn btn-secondary', text: 'Export capture details', onclick: () => exportDetails() });
  const exportAudioButton = h('button', { id: 'pc-export-audio', type: 'button', class: 'btn btn-secondary', text: 'Export capture audio', onclick: () => exportAudio() });
  const referenceFile = h('input', { id: 'pc-reference-file', type: 'file', accept: 'audio/*,.wav,.aiff,.aif,.flac,.mp3',
    'aria-describedby': 'pc-reference-help pc-reference-status', onchange: event => {
      const file = event.target.files?.[0] || null;
      event.target.value = ''; // also relinquish a picker result delivered after hide/disposal
      return chooseReference(file);
    } });
  const referenceStatus = h('p', { id: 'pc-reference-status', class: 'hint pc-reference-status', role: 'status', 'aria-live': 'polite',
    text: 'No reference file selected. You can still record a capture.' });
  const referenceClear = h('button', { id: 'pc-reference-clear', type: 'button', class: 'btn btn-secondary', text: 'Clear reference file',
    onclick: () => { if (!disposed && visible && !current) cancelReference(); } });
  const setup = h('fieldset', { class: 'pc-fields field-grid' },
    h('legend', { class: 'card-title', text: 'Capture setup' }),
    h('div', { class: 'field' }, h('span', { class: 'field-label', text: 'Input selected in the top bar' }), device),
    pair.el,
    input('duration', 'Duration (seconds)', { type: 'number', min: 1, max: CDJ_MAX_CAPTURE_SECONDS, step: 1, value: 5 }),
    h('div', { class: 'field' },
      input('keep-audio', 'Keep captured audio for local export', { type: 'checkbox', 'aria-describedby': 'pc-audio-export-help' }),
      h('p', { id: 'pc-audio-export-help', class: 'hint', text: 'Off by default. Hold up to 18 MiB of captured samples for a local ZIP export. Clear, a new capture or leaving this screen discards the retained audio. Reference-file audio is not included.' })),
    input('manufacturer', 'Manufacturer (optional)'),
    input('model', 'Player model (optional)'),
    input('firmware', 'Firmware (optional)'),
    select('medium', 'Source medium', [['', 'Unknown'], ['audio_cd', 'Audio CD'], ['cd_r', 'CD-R'], ['usb', 'USB'], ['sd', 'SD'], ['other', 'Other']]),
    input('reference', 'Reference track label (optional)'),
    h('div', { class: 'field pc-reference' },
      h('label', { class: 'field-label', for: 'pc-reference-file', text: 'Reference file (optional, up to 32 MiB)' }),
      referenceFile,
      h('p', { id: 'pc-reference-help', class: 'hint', text: 'The SHA-256 identifies this file’s bytes. It does not verify its audio content or what the player is playing. The file is read locally and is not saved or uploaded.' }),
      referenceStatus, referenceClear),
    input('pitch', 'Displayed pitch (%) — optional', { type: 'number', step: 'any' }),
    select('keylock', 'Key Lock / Master Tempo', [['unknown', 'Unknown'], ['disabled', 'Off'], ['enabled', 'On']]),
    select('fx', 'Player effects', [['unknown', 'Unknown'], ['disabled', 'Off'], ['enabled', 'On']]));
  const unsupported = h('p', { class: 'banner banner-info', hidden: Boolean(native()), text: 'Live capture requires the DeckChek desktop app. You can prepare reference-file details here.' });
  section.replaceChildren(
    h('header', { class: 'screen-head' }, h('div', { class: 'screen-title' },
      h('span', { class: 'screen-icon', html: icon('plug', { size: 24 }) }),
      h('div', {}, h('h1', { tabindex: '-1', text: 'Player capture' }), h('p', { class: 'lede', text: 'Record a short input check from your CDJ or media player.' })))),
    h('p', { class: 'banner banner-info', text: 'Capture preview: this records input details. Pitch accuracy is not measured, and these provisional details are not added to History or diagnostic reports.' }),
    unsupported,
    h('section', { class: 'card pc-setup' },
      h('p', { class: 'hint', text: 'Connect the player’s line output to a line input, leave headroom, and play the reference track. For a later pitch check, turn Key Lock / Master Tempo and effects off. The fields below record what you enter; they do not verify the player’s settings.' }),
      setup,
      h('div', { class: 'pc-actions' }, start, cancel), status),
    result,
    h('div', { class: 'pc-actions' }, exportButton, exportAudioButton, clear),
    h('p', { class: 'hint', text: 'Export capture details saves metadata only, including entered settings, device names, any driver messages and the selected reference filename and hash. If enabled before capture, Export capture audio saves normalized samples and those details in a ZIP. Nothing is uploaded. Leaving this screen clears retained details, audio and reference selection.' }));

  function setStatus(message) { status.textContent = message; }
  function update() {
    if (disposed) return;
    setup.disabled = Boolean(current);
    start.disabled = Boolean(current || referenceTask) || !native() || !visible;
    referenceFile.disabled = Boolean(current || referenceTask);
    referenceClear.disabled = Boolean(current) || (!selectedReference && !referenceTask) || Boolean(referenceTask?.controller.signal.aborted);
    cancel.disabled = !current || current.controller.signal.aborted;
    clear.disabled = Boolean(current) || !last;
    exportButton.disabled = Boolean(current) || !last || !visible;
    exportAudioButton.disabled = Boolean(current) || !last?.audioExport || !visible;
    if (!current) device.textContent = settings.deviceName || 'System default input';
  }
  function discard() { last = null; result.replaceChildren(); result.hidden = true; update(); }
  function abort() {
    if (!current) return;
    current.controller.abort();
    discard();
    if (visible && !disposed) setStatus('Capture cancelled. Waiting for the input to close.');
    update();
  }
  const active = request => current === request && !request.controller.signal.aborted && visible && !disposed;
  const referenceActive = request => referenceTask === request && !request.controller.signal.aborted && visible && !disposed;

  function cancelReference() {
    referenceTask?.controller.abort();
    selectedReference = null;
    referenceFile.value = '';
    discard();
    referenceStatus.textContent = referenceTask ? 'Reference selection cancelled. Waiting for the local read to finish.' : 'No reference file selected. You can still record a capture.';
    update();
  }

  async function chooseReference(file) {
    if (disposed || !visible || current || referenceTask) return;
    selectedReference = null;
    referenceFile.value = ''; // retain no File in the input after taking the local snapshot
    discard();
    if (!file) { cancelReference(); return; }
    const request = { controller: new AbortController() };
    referenceTask = request; update();
    referenceStatus.textContent = 'Computing the selected file’s SHA-256…';
    try {
      const descriptor = await inspectReference(file, { signal: request.controller.signal });
      if (!referenceActive(request)) return;
      selectedReference = descriptor;
      referenceStatus.textContent = `${descriptor.fileName} · ${descriptor.byteLength.toLocaleString()} bytes · SHA-256 ${descriptor.sha256}`;
    } catch (error) {
      if (referenceActive(request)) referenceStatus.textContent = `Reference file could not be read: ${error?.message || String(error)}`;
    } finally {
      if (referenceTask === request) {
        referenceTask = null;
        if (!disposed && request.controller.signal.aborted) referenceStatus.textContent = 'No reference file selected. You can still record a capture.';
        update();
      }
    }
  }

  function renderDetails() {
    const { acquisition: a, record: r } = last;
    const observed = a.observed;
    const rows = [
      ['Requested input', a.requested.deviceName || 'System default input'],
      ['Reported input', shown(observed.deviceName)],
      ['Requested pair', a.requested.pairs?.map(first => `Starts at input ${first}`).join(', ') || 'Default pair'],
      ['Reported pair', observed.selectedPairs?.map(p => p.mono ? `${p.label} (mono)` : p.label).join(', ') || 'Unknown'],
      ['Requested duration', `${a.requested.durationSeconds} seconds`],
      ['Audio length', observed.sampleDurationSeconds == null ? 'Unknown' : `${observed.sampleDurationSeconds.toFixed(3)} seconds (frames / nominal rate)`],
      ['Nominal sample rate', observed.nominalSampleRateHz == null ? 'Unknown' : `${observed.nominalSampleRateHz} Hz`],
      ['Measured sample rate', 'Not measured'],
      ['Input backend', shown(observed.backend)],
      ['Input gain', 'Unknown'],
      ['Clipped samples (left / right)', `${shown(a.quality.clippedSamplesL)} / ${shown(a.quality.clippedSamplesR)}`],
      ['Dropped samples reported', shown(a.quality.overrunSamples)],
      ['Stream errors reported', shown(a.quality.streamErrors)],
      ['Entered player model', shown(r.asset.model)],
      ['Reference track label', shown(r.source.referenceId)],
      ['Selected reference file', last.selectedReference?.fileName || 'Not selected'],
      ['Selected-file SHA-256', last.selectedReference?.sha256 || 'Not available'],
      ['Played reference identity', 'Not verified'],
      ['Captured audio export', last.audioExport ? 'Ready in memory; not yet saved' : last.audioExportError ? `Unavailable: ${last.audioExportError}` : 'Not retained'],
      ['Entered displayed pitch', r.pitch.displayedPercent == null ? 'Unknown' : `${r.pitch.displayedPercent}%`],
      ['Entered Key Lock / effects', `${processing(r.processing.keylock)} / ${processing(r.processing.fx)}`],
    ];
    const state = ({ observed: 'Input counters recorded', incomplete: 'Capture incomplete', unavailable: 'Capture evidence unavailable' })[a.continuity.state] || 'Capture evidence unavailable';
    result.replaceChildren(
      h('h2', { id: 'pc-result-title', class: 'card-title', text: 'Provisional capture details' }),
      h('p', { class: 'pc-summary', text: `${state}. These counters do not verify hardware continuity or qualify a pitch measurement.` }),
      h('dl', { class: 'pc-facts' }, rows.map(([label, value]) => h('div', {}, h('dt', { text: label }), h('dd', { text: value })))),
      a.continuity.reasons.length ? h('ul', { class: 'pc-reasons' }, a.continuity.reasons.map(reason => h('li', { text: REASONS[reason] || 'Some capture details are unavailable.' }))) : null);
    result.hidden = false;
  }

  async function begin() {
    if (disposed || !visible || current || referenceTask) return;
    if (!native()) { setStatus('Live capture requires the DeckChek desktop app.'); return; }
    const durationSeconds = Number(fields.duration.value);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > CDJ_MAX_CAPTURE_SECONDS) {
      setStatus(`Choose a duration from 1 to ${CDJ_MAX_CAPTURE_SECONDS} seconds.`); return;
    }
    const pitchText = fields.pitch.value.trim();
    const displayedPercent = pitchText ? Number(pitchText) : null;
    if (displayedPercent != null && !Number.isFinite(displayedPercent)) { setStatus('Enter a finite displayed pitch or leave it blank.'); return; }
    const request = { controller: new AbortController() };
    // Snapshot operator assertions and shared input selection before any await.
    const deviceName = settings.deviceName || null;
    const referenceSnapshot = selectedReference;
    const keepAudio = Boolean(fields['keep-audio'].checked);
    const operator = {
      asset: { manufacturer: textOrNull(fields.manufacturer), model: textOrNull(fields.model), firmware: textOrNull(fields.firmware) },
      source: { medium: fields.medium.value || null, referenceId: textOrNull(fields.reference) || referenceSnapshot?.fileName || null,
        referenceHashSha256: referenceSnapshot?.sha256 || null },
      processing: { keylock: fields.keylock.value, fx: fields.fx.value },
      pitch: { displayedPercent },
    };
    discard(); current = request; update();
    setStatus('Opening the input…');
    try {
      const selected = selectPairs(deviceName);
      const pairs = Array.isArray(selected) ? [...selected] : selected;
      const captured = await acquire({ startCapture, durationSeconds, deviceName, pairs, operator,
        signal: request.controller.signal,
        onPhase: phase => {
          if (!active(request)) return;
          const message = { starting: 'Opening the input…', recording: `Recording for ${durationSeconds} seconds…`, stopping: 'Finishing the capture…', complete: 'Preparing capture details…' }[phase];
          if (message) setStatus(message);
        },
      });
      if (!active(request)) return;
      let audioExport = null, audioExportError = null;
      if (keepAudio) {
        setStatus('Preparing the local audio export…');
        try {
          audioExport = await prepareAudioExport(captured, { selectedReference: referenceSnapshot, signal: request.controller.signal });
        } catch (error) {
          if (!active(request)) return;
          audioExportError = String(error?.message || error).slice(0, 300);
        }
      }
      if (!active(request)) return;
      // Retain only the optional bounded archive, never mutable capture arrays.
      last = { acquisition: captured.acquisition, record: captured.record, selectedReference: referenceSnapshot, audioExport, audioExportError };
      renderDetails();
      setStatus(audioExport ? 'Capture details and audio export are ready in memory. Audio has not been saved.' :
        audioExportError ? 'Capture details are ready. Audio export is unavailable; see the capture details.' : 'Capture details are ready. Audio has not been saved.');
    } catch (error) {
      if (active(request)) { discard(); setStatus(`Capture could not finish: ${error?.message || String(error)}`); }
    } finally {
      if (current === request) {
        current = null;
        if (!disposed && visible && request.controller.signal.aborted) setStatus('Capture cancelled. No details were retained.');
        update();
      }
    }
  }

  function exportDetails() {
    if (disposed || !visible || current || !last) return;
    try {
      save(`deckchek-player-capture-${last.acquisition.runId}.json`, JSON.stringify({ acquisition: last.acquisition, record: last.record, selectedReference: last.selectedReference }, null, 2), 'application/json');
      setStatus('Capture details exported. The file contains metadata only.');
    } catch (error) { setStatus(`Export could not finish: ${error?.message || String(error)}`); }
  }
  function exportAudio() {
    if (disposed || !visible || current || !last?.audioExport) return;
    try {
      const archive = last.audioExport;
      save(archive.fileName, new Uint8Array(archive.bytes), 'application/zip');
      setStatus('Audio ZIP download requested. The capture remains provisional and is held in memory until cleared.');
    } catch (error) { setStatus(`Audio export could not finish: ${String(error?.message || error).slice(0, 300)}`); }
  }
  const offSettings = on('settings', ({ key } = {}) => { if (key === 'deviceName') update(); });
  update();
  return {
    onShow() { if (disposed) return; visible = true; showPlayerGuide(); update(); pair.refresh(); },
    onHide() { visible = false; abort(); discard(); cancelReference(); setStatus(''); },
    onEscape() { if (current) { abort(); return true; } if (referenceTask) { cancelReference(); return true; } return false; },
    onExport: exportDetails,
    dispose() {
      if (disposed) return;
      visible = false; abort(); discard(); cancelReference(); disposed = true; offSettings();
      pair.el?.dispatchEvent(new Event('pair-picker-dispose'));
    },
  };
}

function showPlayerGuide() {
  showInspector({ title: 'Player capture guide', open: false,
    body: h('div', { class: 'inspect' },
      h('p', { text: 'Capture one input pair for 1–30 seconds in the desktop app. These provisional details do not measure pitch accuracy or create a History run or diagnostic report.' }),
      h('h3', { text: 'Reference identity' }),
      h('p', { text: 'An optional reference file is read locally to identify its exact bytes with SHA-256. This does not verify audio content or what the player is playing. The file is not saved or uploaded.' }),
      h('h3', { text: 'Export and reset' }),
      h('p', { text: 'Export capture details saves metadata, including entered settings, the selected file name and hash, device names and any driver messages. To export audio too, enable Keep captured audio before starting. Up to 18 MiB of normalized samples can be held in memory for a local ZIP with format details and SHA-256 checksums. These hashes do not authenticate the capture or qualify a measurement; reference-file audio is not included. Clear, a new capture or leaving this screen discards retained details and audio. Cancel prevents a pending export from appearing.' }),
      h('h3', { text: 'Shortcuts' }),
      h('dl', { class: 'kv' },
        h('dt', { text: 'Esc' }), h('dd', { text: 'Cancel the active capture or reference-file read' }),
        h('dt', { text: 'Ctrl+E' }), h('dd', { text: 'Export completed capture details' }),
        h('dt', { text: 'I' }), h('dd', { text: 'Toggle this guide' }))) });
}

export function playerCaptureScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-player-capture')) main.append(h('section', { class: 'screen', id: 'screen-player-capture', hidden: true }));
  return [{ id: 'player-capture', title: 'Player capture', short: 'Player', icon: 'plug', feature: 'playerCapture', create: createPlayerCaptureScreen }];
}
