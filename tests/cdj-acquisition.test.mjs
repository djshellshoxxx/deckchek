import test from 'node:test';
import assert from 'node:assert/strict';
import { runCdjAcquisition, CDJ_ACQUISITION_SCHEMA, CdjAcquisitionError } from '../app/player/acquisition.js';
import { deserializeCdjEvidenceRecord, serializeCdjEvidenceRecord, CDJ_QUALITY_FLAGS } from '../app/player/evidence-record.js';
import { payloadToAudio } from '../app/ui/audio-io.js';

const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const ids = () => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
};
const times = () => {
  const values = ['2026-11-21T03:00:00.000Z', '2026-11-21T03:00:00.100Z', '2026-11-21T03:00:02.300Z'];
  return () => values.shift();
};

function fixture({ payload = {}, quality = {}, startError = null, startGate = null, stopGate = null, waitHook = null, info = {}, cap = {}, lease = { owner: null } } = {}) {
  const native = {
    deviceName: 'Observed input', sampleRate: 44100, channels: 4,
    pairs: [{ first: 3, second: 4, mono: false, label: '3-4' }],
    left: Array(441).fill(0.1), right: Array(441).fill(0.2), streamErrors: [], ...payload,
  };
  const audio = payloadToAudio(native);
  const result = {
    audio, deviceName: 'fallback must not become observed', streamErrors: native.streamErrors || [],
    quality: quality == null ? null : { framesCaptured: audio.left.length, overrunSamples: 0,
      clippedSamplesL: 0, clippedSamplesR: 0, streamErrors: 0, streamErrorMessages: [],
      truncated: false, callbackCount: 2, maxCallbackGapMs: 4,
      pairs: [{ first: 3, label: '3-4', clippedSamplesL: 0, clippedSamplesR: 0 }], ...quality }, ...cap,
  };
  const calls = { start: [], stop: 0, cancel: 0, waits: [], phases: [] };
  const owner = {};
  const session = {
    info: { leaseId: 7, maxSeconds: 7, deviceName: 'start-only label', sampleRate: 48000, ...info },
    async stop() { calls.stop++; if (stopGate) await stopGate.promise; if (lease.owner === owner) lease.owner = null; return result; },
    async cancel() { calls.cancel++; if (lease.owner === owner) lease.owner = null; },
  };
  const startCapture = async options => {
    calls.start.push(options);
    if (startError) throw startError;
    if (startGate) await startGate.promise;
    if (lease.owner != null) throw Object.assign(new Error('The input is busy.'), { code: 'CAPTURE_BUSY' });
    lease.owner = owner;
    return session;
  };
  const wait = async (ms, opts) => { calls.waits.push(ms); if (waitHook) await waitHook(calls.start[0], opts); };
  const run = options => runCdjAcquisition({ startCapture, durationSeconds: 2, deviceName: 'Observed input', pairs: [3],
    wait, now: times(), createId: ids(), onPhase: p => calls.phases.push(p), ...options });
  return { native, audio, result, session, calls, lease, run, startCapture };
}

test('acquisition owns one capture and binds nominal observations rather than requested or caller metadata', async () => {
  const f = fixture();
  const operator = {
    runId: 'operator-run', observedAt: '2000-01-01T00:00:00Z', asset: { assetId: 'player-1', model: 'Example player' },
    source: { referenceId: 'operator-reference', referenceFrequencyHz: 1000 },
    processing: { keylock: 'disabled', fx: 'disabled' }, pitch: { displayedPercent: 2 },
    capture: { sampleRateHz: 192000, deviceName: 'Operator label', backend: 'claimed driver', gainDb: 12,
      elapsedSeconds: 99, selectedPairs: ['1-2'], rawEvidenceRefs: ['not-retained'] },
    analysis: { measuredFrequencyHz: 1020, method: 'claimed result' },
    quality: { flags: Object.fromEntries(CDJ_QUALITY_FLAGS.map(k => [k, true])) },
  };
  const { acquisition: a, record, audio } = await f.run({ deviceName: 'Requested input', operator });
  assert.deepEqual(f.calls.phases, ['starting', 'recording', 'stopping', 'complete']);
  assert.deepEqual([f.calls.stop, f.calls.cancel, f.lease.owner], [1, 0, null]);
  assert.deepEqual(f.calls.waits, [2000]);
  assert.equal(f.calls.start[0].maxSeconds, 7);
  assert.equal(a.schemaVersion, CDJ_ACQUISITION_SCHEMA);
  assert.equal(a.runId, '00000000-0000-4000-8000-000000000001');
  assert.equal(a.captureId, '00000000-0000-4000-8000-000000000002');
  assert.equal(a.nativeLeaseId, 7);
  assert.equal(record.runId, a.runId);
  assert.equal(record.observedAt, a.hostTimes.completedAt);
  assert.equal(a.requested.deviceName, 'Requested input');
  assert.deepEqual(a.requested.pairs, [3]);
  assert.equal(a.requested.durationSeconds, 2);
  assert.equal(a.hostTimes.elapsedSeconds, 2.3);
  assert.equal(a.observed.sampleDurationSeconds, 0.01);
  assert.equal(a.observed.nominalSampleRateHz, 44100);
  assert.equal(a.observed.measuredSampleRateHz, null);
  assert.equal(a.observed.deviceName, 'Observed input');
  assert.deepEqual(a.observed.selectedPairs, [{ first: 3, second: 4, mono: false, label: '3-4' }]);
  assert.ok(a.continuity.reasons.includes('requested_device_differs'));
  assert.deepEqual(record.capture, { sampleRateHz: 44100, deviceName: 'Observed input', backend: null,
    selectedPairs: ['3-4'], gainDb: null, routing: null, elapsedSeconds: 0.01, rawEvidenceRefs: [] });
  assert.equal(record.asset.assetId, 'player-1');
  assert.equal(record.processing.keylock, 'disabled', 'retained as an operator assertion');
  assert.equal(record.analysis.measuredFrequencyHz, null, 'the acquisition does not analyse the signal');
  assert.ok(Object.values(record.quality.flags).every(v => v === null));
  assert.equal(record.qualification.status, 'unverified');
  assert.equal(record.qualification.eligibleForReport, false);
  assert.equal(record.qualification.measurement, null);
  assert.deepEqual(a.rawEvidenceRefs, []);
  assert.equal(a.retention, 'ephemeral_audio_only');
  assert.equal(audio, f.audio);
  assert.equal(a.observed.backend, null);
  assert.equal(a.observed.firstSampleAt, null);
  assert.equal(a.observed.timebaseCalibration, null);
  assert.equal(a.observed.primaryPairMode, 'stereo');
  for (const key of ['sourceType', 'gainStagingNotes', 'phonoLineStatus', 'externalRiaa']) assert.equal(a.observed[key], null);
  assert.equal(a.observed.sampleRateBasis, 'native_nominal_configuration');
  assert.deepEqual(deserializeCdjEvidenceRecord(serializeCdjEvidenceRecord(record)), record);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'versioned acquisition metadata travels separately from the v1 record');
});

test('metadata is frozen and detached from request, native metadata, counters and ephemeral sample mutations', async () => {
  const pending = deferred(), requestPairs = [3], operator = { asset: { model: 'Original model' } };
  const f = fixture({ waitHook: () => pending.promise });
  const run = f.run({ pairs: requestPairs, operator });
  await turn();
  requestPairs[0] = 1; operator.asset.model = 'Changed later';
  pending.resolve();
  const r = await run;
  const before = JSON.stringify({ acquisition: r.acquisition, record: r.record });
  f.audio.nativeFields.pairs.value[0].first = 1;
  f.result.quality.callbackCount = 99;
  f.result.quality.pairs[0].clippedSamplesL = 17;
  f.audio.left[0] = 0.9;
  assert.equal(JSON.stringify({ acquisition: r.acquisition, record: r.record }), before);
  assert.equal(r.record.asset.model, 'Original model');
  assert.deepEqual(r.acquisition.requested.pairs, [3]);
  assert.throws(() => { r.acquisition.observed.selectedPairs[0].first = 1; }, TypeError);
  assert.throws(() => { r.record.capture.sampleRateHz = 48000; }, TypeError);
  assert.ok(!Object.isFrozen(r.audio.left), 'sample buffers stay separately ephemeral');
});

test('complete native observations remain unverified even when continuity counters are observed', async () => {
  const { acquisition, record } = await fixture().run();
  assert.equal(acquisition.continuity.state, 'observed');
  assert.deepEqual(acquisition.continuity.reasons, []);
  assert.equal(acquisition.quality.framesCaptured, 441);
  assert.equal(acquisition.streamErrors.available, true);
  assert.equal(record.qualification.eligibleForReport, false);
});

test('compatibility defaults and absent nativeFields never become observed capture provenance', async () => {
  const f = fixture({ payload: { sampleRate: undefined, channels: undefined, deviceName: undefined,
    pairs: undefined, right: undefined, streamErrors: undefined }, quality: null });
  const { acquisition: a, record } = await f.run();
  assert.equal(f.audio.sampleRate, 48000, 'existing bridge compatibility fallback');
  assert.equal(f.audio.channels, 2);
  assert.deepEqual(f.audio.right, f.audio.left);
  assert.equal(a.observed.nominalSampleRateHz, null);
  assert.equal(a.observed.deviceName, null);
  assert.equal(a.observed.channelCount, null);
  assert.equal(a.observed.selectedPairs, null);
  assert.equal(a.observed.primarySamples.right.observedCount, null);
  assert.equal(a.observed.sampleDurationSeconds, null);
  assert.equal(a.continuity.state, 'unavailable');
  assert.equal(a.quality.framesCaptured, null);
  assert.equal(a.streamErrors.available, false);
  assert.deepEqual(record.capture.selectedPairs, []);
  const noNative = fixture(); delete noNative.audio.nativeFields;
  assert.equal((await noNative.run()).acquisition.observed.nominalSampleRateHz, null);
});

test('pair routing and unequal channel lengths are explicit; only the primary pair has sample provenance', async () => {
  const differing = fixture({ payload: { right: Array(400).fill(0.1) } });
  const d = (await differing.run()).acquisition;
  assert.equal(d.observed.sampleDurationSeconds, null);
  assert.ok(d.continuity.reasons.includes('primary_channel_lengths_differ'));
  const multi = fixture({ payload: { channels: 6, pairs: [{ first: 3, second: 4, mono: false }, { first: 5, second: 6, mono: false }] } });
  const m = (await multi.run()).acquisition;
  assert.equal(m.observed.selectedPairs.length, 2);
  assert.equal(m.observed.sampleScope, 'first_selected_pair_only');
  assert.ok(m.continuity.reasons.includes('unexpected_multiple_pairs'));
  assert.equal(m.continuity.state, 'unavailable');
  assert.equal(m.observed.primaryPairMode, null);
  const invalid = fixture({ payload: { channels: 2 } });
  assert.equal((await invalid.run()).acquisition.observed.selectedPairs, null, 'pair outside observed channel range');
  const interiorMono = fixture({ payload: { channels: 3, pairs: [{ first: 1, second: 1, mono: true }] } });
  assert.equal((await interiorMono.run()).acquisition.observed.selectedPairs, null, 'mono belongs only to the final odd channel');
  const finalMono = fixture({ payload: { channels: 3, pairs: [{ first: 3, second: 3, mono: true }] } });
  assert.equal((await finalMono.run()).acquisition.observed.primaryPairMode, 'mono');
  const changed = fixture(); changed.audio.pairs[0].pair = { first: 1, second: 2, mono: false };
  assert.ok((await changed.run()).acquisition.continuity.reasons.includes('primary_pair_descriptor_mismatch'));
});

test('capture fault counters and bounded diagnostic text remain visible without a player verdict', async () => {
  const f = fixture({ payload: { streamErrors: ['Device disconnected'] }, quality: {
    overrunSamples: 12, streamErrors: 25, clippedSamplesL: 2, truncated: true,
    streamErrorMessages: Array.from({ length: 22 }, (_, i) => i === 0 ? 'x'.repeat(1100) : `Reported error ${i}`),
  } });
  const { acquisition: a, record } = await f.run();
  assert.equal(a.continuity.state, 'incomplete');
  assert.equal(a.quality.overrunSamples, 12);
  assert.equal(a.quality.streamErrorMessages.receivedCount, 22);
  assert.equal(a.quality.streamErrorMessages.messages.length, 20);
  assert.equal(a.quality.streamErrorMessages.omittedCount, 2);
  assert.equal(a.quality.streamErrorMessages.shortenedCount, 1);
  assert.equal(a.quality.streamErrorMessages.messages[0].length, 1000);
  assert.equal(a.quality.errorMessagesOmittedByNative, 3);
  assert.deepEqual(a.streamErrors.messages, ['Device disconnected']);
  assert.ok(a.continuity.reasons.includes('clipping_reported'));
  assert.ok(a.continuity.reasons.includes('capture_capacity_reached'));
  assert.equal(record.qualification.measurement, null);
  assert.ok(record.quality.flags.capturePathVerified == null);
});

test('incomplete or inconsistent counters stay unavailable or incomplete rather than zero-loss', async () => {
  for (const quality of [null, { overrunSamples: undefined }, { callbackCount: 0 }, { streamErrorMessages: undefined }]) {
    assert.equal((await fixture({ quality }).run()).acquisition.continuity.state, 'unavailable');
  }
  const mismatch = (await fixture({ quality: { framesCaptured: 400 } }).run()).acquisition;
  assert.equal(mismatch.continuity.state, 'incomplete');
  assert.ok(mismatch.continuity.reasons.includes('captured_frame_count_mismatch'));
});

test('invalid requests, providers and identities are rejected before capture starts', async () => {
  for (const options of [
    { durationSeconds: 0 }, { durationSeconds: 31 }, { durationSeconds: NaN },
    { pairs: [1, 3] }, { pairs: [3, 3] }, { deviceName: '' },
    { createId: () => 'not-a-uuid' }, { createId: () => '00000000-0000-4000-8000-000000000001' },
    { now: () => 'not-a-time' }, { operator: { asset: { model: 7 } } },
  ]) {
    const f = fixture(); await assert.rejects(f.run(options)); assert.equal(f.calls.start.length, 0);
  }
  await assert.rejects(runCdjAcquisition(), e => e instanceof CdjAcquisitionError && e.code === 'unsupported');
});

test('pre-aborted acquisition opens nothing', async () => {
  const ac = new AbortController(); ac.abort(); const f = fixture();
  await assert.rejects(f.run({ signal: ac.signal }), e => e.code === 'cancelled');
  assert.deepEqual([f.calls.start.length, f.calls.stop, f.calls.cancel], [0, 0, 0]);
});

test('cancellation releases a capture whose start resolves late, without returning a record', async () => {
  const gate = deferred(), ac = new AbortController(), f = fixture({ startGate: gate });
  const run = f.run({ signal: ac.signal }); await turn(); ac.abort();
  await assert.rejects(run, e => e.code === 'cancelled');
  assert.equal(f.calls.cancel, 0);
  gate.resolve(); await turn();
  assert.deepEqual([f.calls.cancel, f.calls.stop, f.lease.owner], [1, 0, null]);
});

test('cancellation, preemption and unexpected capture loss discard the current run and cancel only its session', async () => {
  for (const code of ['cancelled', 'preempted', 'capture-lost']) {
    const ac = new AbortController();
    const f = fixture({ waitHook: opts => { if (code === 'cancelled') ac.abort(); else if (code === 'preempted') opts.onPreempted(); else opts.onStatus({ running: false }); } });
    await assert.rejects(f.run({ signal: ac.signal }), e => e instanceof CdjAcquisitionError && e.code === code);
    assert.deepEqual([f.calls.stop, f.calls.cancel, f.lease.owner], [0, 1, null]);
  }
});

test('busy or failed starts leave another capture owner untouched', async () => {
  const other = {}, lease = { owner: other }, busy = fixture({ lease });
  await assert.rejects(busy.run(), e => e.code === 'CAPTURE_BUSY');
  assert.equal(lease.owner, other);
  assert.deepEqual([busy.calls.stop, busy.calls.cancel], [0, 0]);
  const error = new Error('Input unavailable'), failed = fixture({ startError: error });
  await assert.rejects(failed.run(), e => e === error);
  assert.equal(failed.calls.cancel, 0);
});

test('wait, phase, clock and reduced-capacity failures release only the owned capture', async () => {
  const error = new Error('Observer failed');
  for (const options of [
    { wait: async () => { throw error; } },
    { onPhase: p => { if (p === 'recording') throw error; } },
    { now: (() => { let n = 0; return () => ++n === 1 ? '2026-11-21T03:00:00Z' : 'invalid'; })() },
  ]) {
    const f = fixture(); await assert.rejects(f.run(options));
    assert.deepEqual([f.calls.stop, f.calls.cancel, f.lease.owner], [0, 1, null]);
  }
  const limited = fixture({ info: { maxSeconds: 1 } });
  await assert.rejects(limited.run(), e => e.code === 'capture-capacity');
  assert.equal(limited.calls.cancel, 1);
});

test('a pending stop cannot return a completed record after cancellation or preemption', async () => {
  for (const preempt of [false, true]) {
    const gate = deferred(), ac = new AbortController(), f = fixture({ stopGate: gate });
    const run = f.run({ signal: ac.signal }); await turn();
    assert.equal(f.calls.stop, 1);
    if (preempt) f.calls.start[0].onPreempted(); else ac.abort();
    await assert.rejects(run, e => e.code === (preempt ? 'preempted' : 'cancelled'));
    assert.equal(f.calls.cancel, 1);
    gate.resolve(); await turn();
    assert.equal(f.lease.owner, null);
  }
});

test('normal stop status is not unexpected loss; preempted returned audio is discarded', async () => {
  const good = fixture();
  const stop = good.session.stop;
  good.session.stop = async () => { good.calls.start[0].onStatus({ running: false }); return stop(); };
  assert.equal((await good.run()).record.qualification.status, 'unverified');
  const preempted = fixture({ cap: { preempted: true } });
  await assert.rejects(preempted.run(), e => e.code === 'preempted');
  assert.equal(preempted.calls.stop, 1);
});

test('default duration timer is cleared on cancellation and abort listeners are detached', async () => {
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  const active = new Set(), ac = new AbortController(), listeners = new Set();
  const signal = { get aborted() { return ac.signal.aborted; },
    addEventListener(type, listener, opts) { listeners.add(listener); ac.signal.addEventListener(type, listener, opts); },
    removeEventListener(type, listener) { listeners.delete(listener); ac.signal.removeEventListener(type, listener); } };
  globalThis.setTimeout = (callback, ms, ...args) => { const handle = realSet(callback, ms, ...args); active.add(handle); return handle; };
  globalThis.clearTimeout = handle => { active.delete(handle); return realClear(handle); };
  try {
    const f = fixture();
    const run = f.run({ signal, wait: undefined }); await turn();
    assert.equal(active.size, 1);
    ac.abort(); await assert.rejects(run, e => e.code === 'cancelled');
    assert.equal(active.size, 0);
    assert.equal(listeners.size, 0);
    assert.equal(f.calls.cancel, 1);
  } finally { for (const handle of active) realClear(handle); globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
});

test('completed metadata survives a backwards host clock without claiming negative sample duration', async () => {
  const values = ['2026-11-21T03:00:02Z', '2026-11-21T03:00:02Z', '2026-11-21T03:00:01Z'];
  const r = await fixture().run({ now: () => values.shift() });
  assert.equal(r.acquisition.hostTimes.elapsedSeconds, null);
  assert.equal(r.acquisition.observed.sampleDurationSeconds, 0.01);
  assert.equal(r.acquisition.observed.firstSampleAt, null);
});
