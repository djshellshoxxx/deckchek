// SPEC-10 / CDJ-04: provisional, input-only capture preview. Uses the existing
// acquisition owner; metadata stays separate from ephemeral waveform buffers.
import { h, isNative, download } from '../dom.js';
import { icon } from '../icons.js';
import { settings, on } from '../state.js';
import { startLiveSession } from '../audio-io.js';
import { createPairPicker, currentPairs } from '../pair-picker.js';
import { runCdjAcquisition, CDJ_MAX_CAPTURE_SECONDS } from '../../player/acquisition.js';

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
} = {}) {
  let current = null, last = null, visible = true, disposed = false;
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
  const setup = h('fieldset', { class: 'pc-fields field-grid' },
    h('legend', { class: 'card-title', text: 'Capture setup' }),
    h('div', { class: 'field' }, h('span', { class: 'field-label', text: 'Input selected in the top bar' }), device),
    pair.el,
    input('duration', 'Duration (seconds)', { type: 'number', min: 1, max: CDJ_MAX_CAPTURE_SECONDS, step: 1, value: 5 }),
    input('manufacturer', 'Manufacturer (optional)'),
    input('model', 'Player model (optional)'),
    input('firmware', 'Firmware (optional)'),
    select('medium', 'Source medium', [['', 'Unknown'], ['audio_cd', 'Audio CD'], ['cd_r', 'CD-R'], ['usb', 'USB'], ['sd', 'SD'], ['other', 'Other']]),
    input('reference', 'Reference track or file name (optional)'),
    input('pitch', 'Displayed pitch (%) — optional', { type: 'number', step: 'any' }),
    select('keylock', 'Key Lock / Master Tempo', [['unknown', 'Unknown'], ['disabled', 'Off'], ['enabled', 'On']]),
    select('fx', 'Player effects', [['unknown', 'Unknown'], ['disabled', 'Off'], ['enabled', 'On']]));
  const unsupported = h('p', { class: 'banner banner-info', hidden: Boolean(native()), text: 'Live capture requires the DeckChek desktop app. The browser preview shows setup guidance only.' });
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
    h('div', { class: 'pc-actions' }, exportButton, clear),
    h('p', { class: 'hint', text: 'The export contains capture details and entered settings, including device names and any driver messages. Audio is not saved or exported. Leaving this screen clears the details.' }));

  function setStatus(message) { status.textContent = message; }
  function update() {
    if (disposed) return;
    setup.disabled = Boolean(current);
    start.disabled = Boolean(current) || !native() || !visible;
    cancel.disabled = !current || current.controller.signal.aborted;
    clear.disabled = Boolean(current) || !last;
    exportButton.disabled = Boolean(current) || !last || !visible;
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
    if (disposed || !visible || current) return;
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
    const operator = {
      asset: { manufacturer: textOrNull(fields.manufacturer), model: textOrNull(fields.model), firmware: textOrNull(fields.firmware) },
      source: { medium: fields.medium.value || null, referenceId: textOrNull(fields.reference) },
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
      // Deliberately retain no reference to captured.audio or the full return object.
      last = { acquisition: captured.acquisition, record: captured.record };
      renderDetails();
      setStatus('Capture details are ready. Audio has not been saved.');
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
      save(`deckchek-player-capture-${last.acquisition.runId}.json`, JSON.stringify({ acquisition: last.acquisition, record: last.record }, null, 2), 'application/json');
      setStatus('Capture details exported. The file contains metadata only.');
    } catch (error) { setStatus(`Export could not finish: ${error?.message || String(error)}`); }
  }
  const offSettings = on('settings', ({ key } = {}) => { if (key === 'deviceName') update(); });
  update();
  return {
    onShow() { if (disposed) return; visible = true; update(); pair.refresh(); },
    onHide() { visible = false; abort(); discard(); setStatus(''); },
    onEscape() { if (!current) return false; abort(); return true; },
    onExport: exportDetails,
    dispose() {
      if (disposed) return;
      visible = false; abort(); discard(); disposed = true; offSettings();
      pair.el?.dispatchEvent(new Event('pair-picker-dispose'));
    },
  };
}

export function playerCaptureScreenDefs() {
  const main = document.getElementById('main');
  if (main && !document.getElementById('screen-player-capture')) main.append(h('section', { class: 'screen', id: 'screen-player-capture', hidden: true }));
  return [{ id: 'player-capture', title: 'Player capture', short: 'Player', icon: 'plug', feature: 'playerCapture', create: createPlayerCaptureScreen }];
}
