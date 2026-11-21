import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerCaptureScreen } from '../app/ui/screens/player-capture.js';
import { runCdjAcquisition } from '../app/player/acquisition.js';
import { inspectPlayerReferenceFile } from '../app/player/reference-file.js';
import { payloadToAudio } from '../app/ui/audio-io.js';
import { cachedInputDevices, setInputDevices } from '../app/ui/pair-picker.js';
import { settings, setSetting, active } from '../app/ui/state.js';
import { configureFeatures, setEnabled } from '../app/features.js';
import { registerScreens, go } from '../app/ui/shell.js';
import { installServiceDom, settle, deferred } from './fixtures/service-screen-dom.mjs';

// Real screen handlers and acquisition controller; modeled DOM and native
// capture boundary. This is neither a browser-layout nor a hardware test.
function installDom(t) {
  const document = installServiceDom(t), create = document.createElement.bind(document);
  document.createElement = tag => {
    const el = create(tag);
    el.toggleAttribute = function (name, force) {
      const on = force === undefined ? !this.hasAttribute(name) : Boolean(force);
      if (on) this.setAttribute(name, ''); else this.removeAttribute(name);
      return on;
    };
    el.dispatchEvent = function (event) {
      const sent = this.dispatch(event.type, { detail: event.detail });
      if (sent.defaultPrevented) event.preventDefault();
      return !sent.defaultPrevented;
    };
    return el;
  };
  document.removeEventListener = (...args) => document.body.removeEventListener(...args);
  const events = create('window-events');
  window.addEventListener = (...args) => events.addEventListener(...args);
  window.removeEventListener = (...args) => events.removeEventListener(...args);
  window.dispatchEvent = event => events.dispatch(event.type);
  return document;
}

function captureFixture({ payload = {}, quality = {}, startGate = null, waitGate = null, stopGate = null, startError = null } = {}) {
  const native = { deviceName: 'Observed input', sampleRate: 44100, channels: 4,
    pairs: [{ first: 3, second: 4, mono: false, label: '3-4' }],
    left: Array(441).fill(0.1), right: Array(441).fill(0.2), streamErrors: [], ...payload };
  const audio = payloadToAudio(native);
  const result = { audio, quality: quality == null ? null : {
    framesCaptured: 441, overrunSamples: 0, clippedSamplesL: 0, clippedSamplesR: 0,
    streamErrors: 0, streamErrorMessages: [], truncated: false, callbackCount: 2,
    maxCallbackGapMs: 4, pairs: [{ first: 3, clippedSamplesL: 0, clippedSamplesR: 0 }], ...quality } };
  const calls = { start: [], stop: 0, cancel: 0, requests: [], waits: [] };
  const session = { info: { leaseId: 7, maxSeconds: 35 },
    async stop() { calls.stop++; if (stopGate) await stopGate.promise; return result; },
    async cancel() { calls.cancel++; } };
  const startCapture = async options => {
    calls.start.push(options);
    if (startError) throw startError;
    if (startGate) await startGate.promise;
    return session;
  };
  let id = 0, tick = 0;
  const acquire = options => {
    calls.requests.push(options);
    return runCdjAcquisition({ ...options,
      wait: async ms => { calls.waits.push(ms); if (waitGate) await waitGate.promise; },
      now: () => new Date(Date.UTC(2026, 10, 21, 6) + 100 * tick++).toISOString(),
      createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}` });
  };
  return { audio, result, calls, session, startCapture, acquire };
}

function mount(t, { fixture = captureFixture(), native = true, acquire = fixture.acquire, pairs = [3], shell = false, inspectReference } = {}) {
  const document = installDom(t), previousDevice = settings.deviceName;
  settings.deviceName = 'Requested input';
  const saved = [], pairEvents = [];
  const pairPicker = ({ id }) => {
    const el = document.createElement('div'), input = document.createElement('select');
    input.id = id; el.append(input);
    el.addEventListener('pair-picker-dispose', () => pairEvents.push('dispose'));
    return { el, refresh() { pairEvents.push('refresh'); }, value: () => pairs?.[0] ?? 1 };
  };
  const section = document.createElement('section'); section.id = 'screen-pc-test';
  document.getElementById('main').append(section);
  const api = createPlayerCaptureScreen(section, { acquire, startCapture: fixture.startCapture,
    native: () => native, pairPicker, selectPairs: () => pairs, inspectReference,
    save: (filename, contents, type) => saved.push({ filename, contents, type, value: JSON.parse(contents) }) });
  if (shell) {
    configureFeatures({ storage: globalThis.localStorage });
    setEnabled('playerCapture', true);
    active.screen = null;
    registerScreens([
      { id: 'other', title: 'Other', icon: 'info', create: () => ({}) },
      { id: 'pc-test', title: 'Player capture', icon: 'plug', feature: 'playerCapture', create: () => api },
    ]);
    go('pc-test');
  } else api.onShow();
  t.after(() => {
    api.dispose(); section.remove(); settings.deviceName = previousDevice;
    if (shell) { active.screen = null; configureFeatures(); }
  });
  const byId = id => section.querySelector(`#${id}`);
  return { ...fixture, section, api, byId, saved, pairEvents,
    set(id, value) { byId(id).value = value; },
    async choose(file) {
      const input = byId('pc-reference-file');
      input.files = file ? [file] : []; input.value = file ? 'selected-file' : '';
      input.dispatch('change');
      assert.equal(input.value, '', 'each delivered picker value is cleared immediately, including refused events');
      await settle();
    },
    async click(id) { byId(id).dispatch('click'); await settle(); } };
}

test('browser preview keeps capture unavailable even if the disabled handler is invoked', async t => {
  const f = mount(t, { native: false });
  assert.equal(f.byId('pc-start').disabled, true);
  await f.click('pc-start');
  assert.deepEqual(f.calls.requests, []);
  assert.deepEqual(f.calls.start, []);
  assert.match(f.section.textContent, /desktop/i);
  f.api.onExport();
  assert.deepEqual(f.saved, []);
});

test('invalid duration is refused before acquisition, while the configured duration reaches the real controller', async t => {
  const f = mount(t);
  for (const value of ['', '0', '-1', '31', 'NaN', 'Infinity']) {
    f.set('pc-duration', value);
    await f.click('pc-start');
    assert.equal(f.calls.requests.length, 0, value);
    assert.equal(f.calls.start.length, 0, value);
    assert.equal(f.byId('pc-export').disabled, true);
  }
  f.set('pc-duration', '2');
  await f.click('pc-start');
  assert.equal(f.calls.start.length, 1);
  assert.deepEqual(f.calls.waits, [2000]);
  assert.equal(f.calls.start[0].maxSeconds, 7);
});

test('real screen captures operator assertions and exports only provisional metadata with actual observations', async t => {
  const f = mount(t);
  for (const [id, value] of Object.entries({ 'pc-duration': '2', 'pc-manufacturer': 'Fixture maker',
    'pc-model': 'Fixture player', 'pc-firmware': '1.2', 'pc-medium': 'usb',
    'pc-reference': 'Known track', 'pc-pitch': '2.5', 'pc-keylock': 'disabled', 'pc-fx': 'unknown' })) f.set(id, value);
  await f.click('pc-start');
  assert.deepEqual([f.calls.stop, f.calls.cancel], [1, 0]);
  assert.equal(f.byId('pc-export').disabled, false);
  assert.match(f.byId('pc-result').textContent, /Requested input/);
  assert.match(f.byId('pc-result').textContent, /Observed input/);
  assert.match(f.byId('pc-result').textContent, /44,?100/);
  assert.match(f.byId('pc-result').textContent, /unverified|provisional/i);
  await f.click('pc-export');
  assert.equal(f.saved.length, 1);
  const { value, filename, type } = f.saved[0];
  assert.equal(type, 'application/json');
  assert.match(filename, /\.json$/);
  assert.deepEqual(Object.keys(value).sort(), ['acquisition', 'record', 'selectedReference']);
  assert.equal(value.selectedReference, null);
  const { acquisition: a, record } = value;
  assert.equal(a.requested.deviceName, 'Requested input');
  assert.deepEqual(a.requested.pairs, [3]);
  assert.equal(a.requested.durationSeconds, 2);
  assert.equal(a.observed.deviceName, 'Observed input');
  assert.equal(a.observed.nominalSampleRateHz, 44100);
  assert.equal(a.observed.measuredSampleRateHz, null);
  assert.equal(a.observed.sampleDurationSeconds, 0.01);
  assert.equal(a.retention, 'ephemeral_audio_only');
  assert.deepEqual(a.rawEvidenceRefs, []);
  assert.equal(record.asset.model, 'Fixture player');
  assert.equal(record.asset.firmware, '1.2');
  assert.equal(record.source.referenceId, 'Known track');
  assert.equal(record.source.referenceHashSha256, null);
  assert.equal(record.source.medium, 'usb');
  assert.equal(record.pitch.displayedPercent, 2.5);
  assert.equal(record.processing.keylock, 'disabled');
  assert.equal(record.processing.fx, 'unknown');
  assert.equal(record.analysis.measuredFrequencyHz, null);
  assert.equal(record.qualification.status, 'unverified');
  assert.equal(record.qualification.eligibleForReport, false);
  assert.equal(record.qualification.measurement, null);
  assert.deepEqual(record.capture.rawEvidenceRefs, []);
  assert.equal(value.audio, undefined);
  assert.equal(globalThis.localStorage.getItem('deckchek.workspace.v1'), null);
});

test('compatibility defaults remain unknown rather than appearing as observed device, rate or duration', async t => {
  const fixture = captureFixture({ payload: { deviceName: undefined, sampleRate: undefined, channels: undefined,
    pairs: undefined, right: undefined, streamErrors: undefined }, quality: null });
  const f = mount(t, { fixture });
  await f.click('pc-start'); await f.click('pc-export');
  const a = f.saved[0].value.acquisition;
  assert.equal(a.observed.deviceName, null);
  assert.equal(a.observed.nominalSampleRateHz, null);
  assert.equal(a.observed.sampleDurationSeconds, null);
  assert.equal(a.quality.overrunSamples, null);
  assert.match(f.byId('pc-result').textContent, /unknown|unavailable/i);
  assert.doesNotMatch(f.byId('pc-result').textContent, /48,?000/);
});

test('capture faults stay visible in metadata and never grant a qualified measurement', async t => {
  const f = mount(t, { fixture: captureFixture({ quality: { overrunSamples: 12, clippedSamplesL: 2, streamErrors: 1,
    streamErrorMessages: ['Input stopped'] }, payload: { streamErrors: ['Input stopped'] } }) });
  await f.click('pc-start'); await f.click('pc-export');
  const { acquisition, record } = f.saved[0].value;
  assert.equal(acquisition.continuity.state, 'incomplete');
  assert.equal(acquisition.quality.overrunSamples, 12);
  assert.equal(acquisition.quality.clippedSamplesL, 2);
  assert.ok(acquisition.continuity.reasons.includes('stream_errors_reported'));
  assert.match(f.byId('pc-result').textContent, /incomplete|interrupted/i);
  assert.equal(record.qualification.eligibleForReport, false);
  assert.equal(record.qualification.measurement, null);
});

test('request snapshots keep original input, pair and operator values when controls change during capture', async t => {
  const waitGate = deferred(), pairs = [3], f = mount(t, { fixture: captureFixture({ waitGate }), pairs });
  f.set('pc-model', 'Original model');
  await f.click('pc-start');
  assert.equal(f.calls.start.length, 1);
  setSetting('deviceName', 'Changed input'); pairs[0] = 1; f.set('pc-model', 'Changed model');
  waitGate.resolve(); await settle(); await f.click('pc-export');
  const { acquisition, record } = f.saved[0].value;
  assert.equal(acquisition.requested.deviceName, 'Requested input');
  assert.deepEqual(acquisition.requested.pairs, [3]);
  assert.equal(record.asset.model, 'Original model');
});

test('cancel during recording releases its session and makes export unavailable', async t => {
  const waitGate = deferred(), f = mount(t, { fixture: captureFixture({ waitGate }) });
  await f.click('pc-start');
  assert.equal(f.calls.start.length, 1);
  await f.click('pc-cancel');
  assert.equal(f.calls.cancel, 1);
  assert.equal(f.byId('pc-export').disabled, true);
  f.api.onExport(); assert.deepEqual(f.saved, []);
  waitGate.resolve(); await settle();
  assert.equal(f.calls.stop, 0);
  assert.equal(f.byId('pc-export').disabled, true);
});

test('route hide cancels a late-starting capture and the late session is released without result', async t => {
  const startGate = deferred(), f = mount(t, { fixture: captureFixture({ startGate }), shell: true });
  await f.click('pc-start');
  go('other'); await settle();
  assert.equal(f.calls.requests[0].signal.aborted, true);
  startGate.resolve(); await settle();
  assert.deepEqual([f.calls.stop, f.calls.cancel], [0, 1]);
  go('pc-test'); await settle(); f.api.onExport();
  assert.deepEqual(f.saved, []);
  assert.equal(f.byId('pc-export').disabled, true);
});

test('disabling the feature through the real shell aborts recording and hides the screen', async t => {
  const waitGate = deferred(), f = mount(t, { fixture: captureFixture({ waitGate }), shell: true });
  await f.click('pc-start');
  setEnabled('playerCapture', false); await settle();
  assert.equal(active.screen.def.id, 'other');
  assert.equal(f.section.hidden, true);
  assert.equal(f.calls.requests[0].signal.aborted, true);
  assert.equal(f.calls.cancel, 1);
  waitGate.resolve(); await settle(); f.api.onExport();
  assert.deepEqual(f.saved, []);
});

test('hide and show cannot publish or export a result delivered after its view was invalidated', async t => {
  const delivery = deferred(), fixture = captureFixture();
  const f = mount(t, { fixture, acquire: async options => {
    const result = await fixture.acquire(options); await delivery.promise; return result;
  } });
  await f.click('pc-start'); assert.equal(f.calls.stop, 1);
  f.api.onHide(); f.api.onShow();
  const status = f.byId('pc-status').textContent;
  f.calls.requests[0].onPhase('recording');
  assert.equal(f.byId('pc-status').textContent, status, 'an obsolete phase cannot repaint the new view');
  delivery.resolve(); await settle();
  assert.equal(f.byId('pc-export').disabled, true);
  f.api.onExport(); assert.deepEqual(f.saved, []);
});

for (const [name, end] of [['preemption', options => options.onPreempted()],
  ['input loss', options => options.onStatus({ running: false })]]) {
  test(`${name} exits the real acquisition without publishing a result`, async t => {
    const waitGate = deferred(), f = mount(t, { fixture: captureFixture({ waitGate }) });
    await f.click('pc-start'); end(f.calls.start[0]); await settle();
    assert.equal(f.calls.cancel, 1);
    assert.equal(f.byId('pc-export').disabled, true);
    f.api.onExport(); assert.deepEqual(f.saved, []);
    waitGate.resolve(); await settle();
  });
}

test('input-open failure displays a local error and does not preempt another capture', async t => {
  const error = Object.assign(new Error('Input is busy in another feature.'), { code: 'CAPTURE_BUSY' });
  const f = mount(t, { fixture: captureFixture({ startError: error }) });
  await f.click('pc-start');
  assert.equal(f.calls.start.length, 1);
  assert.deepEqual([f.calls.stop, f.calls.cancel], [0, 0]);
  assert.match(f.byId('pc-status').textContent, /busy/i);
  assert.equal(f.byId('pc-export').disabled, true);
});

test('clear discards finished metadata and a disposed screen cannot capture or export', async t => {
  const f = mount(t);
  await f.click('pc-start'); assert.equal(f.byId('pc-export').disabled, false);
  await f.click('pc-clear'); f.api.onExport();
  assert.deepEqual(f.saved, []);
  assert.equal(f.byId('pc-export').disabled, true);
  f.api.dispose();
  f.api.onShow(); await f.click('pc-start');
  assert.equal(f.calls.start.length, 1, 'a disposed screen cannot start another capture');
});

test('dispose during recording cancels and releases the owned input', async t => {
  const waitGate = deferred(), f = mount(t, { fixture: captureFixture({ waitGate }) });
  await f.click('pc-start'); f.api.dispose(); await settle();
  assert.equal(f.calls.cancel, 1);
  assert.equal(f.calls.requests[0].signal.aborted, true);
  waitGate.resolve(); await settle(); f.api.onExport();
  assert.deepEqual(f.saved, []);
});

test('production native detection and shared pair picker feed the selected input pair into acquisition', async t => {
  const document = installDom(t), fixture = captureFixture();
  const previousDevice = settings.deviceName, previousInputs = cachedInputDevices();
  const invoked = [];
  window.__TAURI__ = { core: { invoke: async command => { invoked.push(command); throw new Error('No device-list IPC expected after the shared cache is seeded.'); } } };
  settings.deviceName = 'Requested input';
  setInputDevices([{ name: 'Requested input', isDefault: true, maxChannels: 4,
    pairs: [{ first: 1, second: 2, mono: false, label: '1-2' }, { first: 3, second: 4, mono: false, label: '3-4' }] }]);
  const section = document.createElement('section'); document.getElementById('main').append(section);
  const saved = [];
  const api = createPlayerCaptureScreen(section, { acquire: fixture.acquire, startCapture: fixture.startCapture,
    save: (_name, contents) => saved.push(JSON.parse(contents)) });
  t.after(() => { api.dispose(); section.remove(); settings.deviceName = previousDevice; setInputDevices(previousInputs); });
  api.onShow(); await settle();
  const pair = section.querySelector('#pc-input-pair');
  assert.equal(pair.disabled, false);
  pair.value = '3'; pair.dispatch('change');
  section.querySelector('#pc-start').dispatch('click'); await settle(); api.onExport();
  assert.deepEqual(fixture.calls.start[0].pairs, [3]);
  assert.deepEqual(saved[0].acquisition.requested.pairs, [3]);
  assert.deepEqual(saved[0].acquisition.observed.selectedPairs, [{ first: 3, second: 4, mono: false, label: '3-4' }]);
  assert.deepEqual(invoked, []);
});

const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const referenceFile = (contents = 'abc', name = 'Reference tone.wav') => new File([contents], name, { type: 'audio/wav' });
async function referenceReady(f) {
  const until = Date.now() + 2000;
  while (f.byId('pc-reference-file').disabled && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.byId('pc-reference-file').disabled, false, 'the reference read settled');
  await settle();
}

test('browser preview uses the default file inspector while native capture remains unavailable', async t => {
  const f = mount(t, { native: false });
  await f.choose(referenceFile()); await referenceReady(f);
  assert.match(f.byId('pc-reference-status').textContent, new RegExp(ABC));
  assert.match(f.byId('pc-reference-status').textContent, /Reference tone\.wav/);
  assert.equal(f.byId('pc-start').disabled, true);
  await f.click('pc-start');
  assert.deepEqual(f.calls.requests, []);
  assert.deepEqual(f.calls.start, []);
  f.api.onExport(); assert.deepEqual(f.saved, []);
  assert.equal(globalThis.localStorage.getItem('deckchek.workspace.v1'), null);
});

for (const [label, expected] of [['', 'Reference tone.wav'], ['Known test track', 'Known test track']]) {
  test(`selected-file metadata snapshots into capture with ${label ? 'the entered label' : 'a filename fallback'}`, async t => {
    const f = mount(t);
    f.set('pc-reference', label);
    await f.choose(referenceFile()); await referenceReady(f);
    await f.click('pc-start'); await f.click('pc-export');
    const value = f.saved[0].value;
    assert.deepEqual(Object.keys(value).sort(), ['acquisition', 'record', 'selectedReference']);
    assert.equal(value.selectedReference.fileName, 'Reference tone.wav');
    assert.equal(value.selectedReference.sha256, ABC);
    assert.equal(value.selectedReference.byteLength, 3);
    assert.equal(value.selectedReference.hashBasis, 'selected_file_bytes');
    assert.equal(value.selectedReference.playbackIdentity, 'unverified');
    assert.equal(value.selectedReference.bytesRetained, false);
    assert.equal(value.record.source.referenceId, expected);
    assert.equal(value.record.source.referenceHashSha256, ABC);
    assert.equal(value.record.source.referenceFrequencyHz, null);
    assert.equal(value.record.qualification.status, 'unverified');
    assert.equal(value.record.qualification.eligibleForReport, false);
    assert.equal(value.record.qualification.measurement, null);
    assert.deepEqual(value.record.capture.rawEvidenceRefs, []);
    assert.equal(Object.hasOwn(value, 'audio'), false);
    assert.ok(Object.values(value.selectedReference).every(item => item === null || typeof item !== 'object'));
    assert.match(f.byId('pc-result').textContent, /Played reference identityNot verified/);
    assert.equal(globalThis.localStorage.getItem('deckchek.workspace.v1'), null);
  });
}

test('pending reference read blocks capture and additional picker deliveries until the first read settles', async t => {
  const gate = deferred(), calls = [];
  const f = mount(t, { inspectReference: async (file, options) => {
    calls.push({ file, options }); await gate.promise; return inspectPlayerReferenceFile(file, options);
  } });
  await f.choose(referenceFile());
  assert.equal(f.byId('pc-start').disabled, true);
  assert.equal(f.byId('pc-reference-file').disabled, true);
  await f.click('pc-start'); await f.choose(referenceFile('abd', 'Second.wav'));
  assert.equal(calls.length, 1);
  assert.equal(f.calls.requests.length, 0);
  await f.click('pc-reference-clear');
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(f.byId('pc-reference-file').disabled, true, 'logical cancellation does not start another read');
  await f.choose(referenceFile('abd', 'Third.wav')); await f.click('pc-start');
  assert.equal(calls.length, 1); assert.equal(f.calls.requests.length, 0);
  gate.resolve(); await referenceReady(f);
  assert.doesNotMatch(f.byId('pc-reference-status').textContent, new RegExp(ABC));
  await f.click('pc-start'); await f.click('pc-export');
  assert.equal(f.saved[0].value.selectedReference, null);
  assert.equal(f.saved[0].value.record.source.referenceHashSha256, null);
});

for (const lifecycle of ['clear', 'escape', 'hide/show', 'shell navigation', 'feature disable', 'dispose']) {
  test(`${lifecycle} rejects a late reference descriptor and cannot export it`, async t => {
    const gate = deferred(), calls = [];
    const shell = ['shell navigation', 'feature disable'].includes(lifecycle);
    const f = mount(t, { shell, inspectReference: (file, options) => {
      const pending = (async () => {
        const metadata = await inspectPlayerReferenceFile(file); // model a provider that finishes after cancellation
        await gate.promise; return metadata;
      })();
      calls.push({ file, options, pending });
      return pending;
    } });
    await f.choose(referenceFile());
    if (lifecycle === 'clear') await f.click('pc-reference-clear');
    else if (lifecycle === 'escape') assert.equal(f.api.onEscape(), true);
    else if (lifecycle === 'hide/show') { f.api.onHide(); f.api.onShow(); }
    else if (lifecycle === 'shell navigation') { go('other'); await settle(); go('pc-test'); }
    else if (lifecycle === 'feature disable') { setEnabled('playerCapture', false); await settle(); setEnabled('playerCapture', true); go('pc-test'); }
    else { f.api.dispose(); f.api.onShow(); }
    assert.equal(calls[0].options.signal.aborted, true);
    await f.choose(referenceFile('abd', 'Stale picker.wav'));
    assert.equal(calls.length, 1);
    gate.resolve(); await calls[0].pending; await settle();
    assert.doesNotMatch(f.byId('pc-reference-status').textContent, /Reference tone\.wav|ba7816bf/);
    assert.equal(f.byId('pc-export').disabled, true);
    f.api.onExport(); assert.deepEqual(f.saved, []);
    assert.equal(f.calls.requests.length, 0);
  });
}

test('inactive picker deliveries clear their input without reading a File', async t => {
  let inspections = 0;
  const f = mount(t, { inspectReference: async file => { inspections++; return inspectPlayerReferenceFile(file); } });
  f.api.onHide(); await f.choose(referenceFile());
  assert.equal(inspections, 0);
  f.api.onShow(); f.api.dispose(); await f.choose(referenceFile());
  assert.equal(inspections, 0);
  f.api.onExport(); assert.deepEqual(f.saved, []);
});

test('capture uses its selected reference snapshot and refuses picker or clear handlers while busy', async t => {
  const waitGate = deferred(), inspections = [];
  const f = mount(t, { fixture: captureFixture({ waitGate }), inspectReference: async file => {
    inspections.push(file.name); return inspectPlayerReferenceFile(file);
  } });
  f.set('pc-reference', 'Original label');
  await f.choose(referenceFile()); await referenceReady(f);
  await f.click('pc-start');
  assert.equal(f.byId('pc-reference-file').disabled, true);
  f.set('pc-reference', 'Changed label');
  await f.choose(referenceFile('abd', 'Different.wav')); await f.click('pc-reference-clear');
  assert.deepEqual(inspections, ['Reference tone.wav']);
  waitGate.resolve(); await settle(); await f.click('pc-export');
  const value = f.saved[0].value;
  assert.equal(value.selectedReference.fileName, 'Reference tone.wav');
  assert.equal(value.selectedReference.sha256, ABC);
  assert.equal(value.record.source.referenceId, 'Original label');
  assert.equal(value.record.source.referenceHashSha256, ABC);
});

test('new or cleared selection discards prior capture details, and failed reads leave no old reference', async t => {
  const f = mount(t);
  await f.choose(referenceFile()); await referenceReady(f);
  await f.click('pc-start'); assert.equal(f.byId('pc-export').disabled, false);
  await f.choose({ size: 3, name: 'Unavailable.wav', async arrayBuffer() { throw new Error('File no longer available'); } });
  await referenceReady(f);
  assert.match(f.byId('pc-reference-status').textContent, /could not be read.*File no longer available/);
  assert.equal(f.byId('pc-result').hidden, true);
  f.api.onExport(); assert.deepEqual(f.saved, []);
  await f.click('pc-start'); await f.click('pc-export');
  assert.equal(f.saved[0].value.selectedReference, null);
  assert.equal(f.saved[0].value.record.source.referenceHashSha256, null);
  await f.choose(referenceFile()); await referenceReady(f);
  await f.click('pc-start');
  await f.click('pc-reference-clear');
  assert.equal(f.byId('pc-export').disabled, true);
  assert.equal(f.byId('pc-result').hidden, true);
  assert.match(f.byId('pc-reference-status').textContent, /No reference file selected/);
});

test('leaving after a completed reference selection clears it before another capture', async t => {
  const f = mount(t);
  await f.choose(referenceFile()); await referenceReady(f);
  f.api.onHide(); f.api.onShow();
  await f.click('pc-start'); await f.click('pc-export');
  assert.equal(f.saved[0].value.selectedReference, null);
  assert.equal(f.saved[0].value.record.source.referenceHashSha256, null);
  assert.equal(f.byId('pc-reference-file').value, '');
});
