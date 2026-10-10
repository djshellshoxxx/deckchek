// M6 data fixes: real capture spans on runs (FS-12 AC-2 hours proposals), timecode metrics as run measurements
// (stylus benchmark auto-fill), the browser twin of list_capture_sessions, and the bounded-capture lease wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRun, captureTiming, persistCaptureFields, timecodeRunResult } from '../app/ui/analysis.js';
import { createCatalogStore, captureSessionsLocal, summarizeRun } from '../app/catalog-store.js';
import { proposeFromCaptureSessions, timecodeBenchmarkFromRuns, createStylusApi } from '../app/stylus-wear.js';
import { quadratureTimecode } from './fixtures/signals.mjs';

const CONTRACT = JSON.parse(readFileSync(new URL('./contracts/capture-sessions.json', import.meta.url), 'utf8'));
const SR = 48000;
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const val = (run, id) => run.measurements.find(m => m.metricId === id)?.value;
function audioOf(sig) {
  return { ...sig, channels: 2, durationSec: sig.left.length / sig.sampleRate };
}

// ---------------------------------------------------------------- capture timing
test('captureTiming: live run spans the audio and ends at createdAt; explicit spans win', () => {
  const live = captureTiming({ source: 'Live capture · Audio 8 DJ', durationSec: 15, createdAt: '2026-10-10T20:00:15.000Z' });
  assert.deepEqual(live, { kind: 'live', startedAt: '2026-10-10T20:00:00.000Z', endedAt: '2026-10-10T20:00:15.000Z', durationSec: 15, approximate: true });
  assert.equal(captureTiming({ quality: { overrunSamples: 0 }, source: 'x', durationSec: 1, createdAt: '2026-10-10T20:00:00.000Z' }).kind, 'live');
  const file = captureTiming({ source: 'side-a.wav', durationSec: 90.5, createdAt: '2026-10-10T21:00:00.000Z' });
  assert.deepEqual([file.kind, file.startedAt, file.durationSec], ['file', '2026-10-10T20:58:29.500Z', 90.5]);
  const exact = captureTiming({ capture: { kind: 'live', startedAt: '2026-10-10T20:00:00.000Z', endedAt: '2026-10-10T20:40:00.000Z' }, durationSec: 1, createdAt: '2026-10-10T20:41:00.000Z' });
  assert.deepEqual(exact, { kind: 'live', startedAt: '2026-10-10T20:00:00.000Z', endedAt: '2026-10-10T20:40:00.000Z', durationSec: 2400, approximate: false });
  // start only: ends one audio-length later; bad timestamps and absurd lengths fall back safely
  assert.equal(captureTiming({ capture: { startedAt: '2026-10-10T20:00:00.000Z' }, durationSec: 60, createdAt: '2026-10-10T21:00:00.000Z' }).endedAt, '2026-10-10T20:01:00.000Z');
  const junk = captureTiming({ capture: { kind: 'stream', startedAt: 'yesterday', endedAt: 5 }, durationSec: -3, createdAt: '2026-10-10T21:00:00.000Z' });
  assert.deepEqual([junk.kind, junk.startedAt, junk.endedAt, junk.durationSec], ['file', '2026-10-10T21:00:00.000Z', '2026-10-10T21:00:00.000Z', 0]);
  const huge = captureTiming({ durationSec: 1e9, createdAt: '2026-10-10T21:00:00.000Z' });
  assert.equal(huge.durationSec, 86400);
  const reversed = captureTiming({ capture: { startedAt: '2026-10-10T22:00:00.000Z', endedAt: '2026-10-10T21:00:00.000Z' }, durationSec: 10 });
  assert.equal(reversed.startedAt, '2026-10-10T20:59:50.000Z');
});

test('buildRun records the capture span and persistCaptureFields shapes the save payload', () => {
  const sig = audioOf(quadratureTimecode({ carrierHz: 1000, seconds: 1, snrDb: 40 }));
  const run = buildRun({ test: 'DVS signal', workflowId: 'dvs', audio: sig, source: 'Live capture · Audio 8 DJ', device: { id: 'asset-1', name: 'Deck' }, quality: { overrunSamples: 0, streamErrors: 0, maxCallbackGapMs: 3 } });
  assert.equal(run.captureKind, 'live');
  assert.equal(run.endedAt, run.createdAt);
  assert.equal(Date.parse(run.endedAt) - Date.parse(run.startedAt), 1000);
  assert.deepEqual(persistCaptureFields(run), { startedAt: run.startedAt, endedAt: run.endedAt, durationSec: 1, captureKind: 'live', assetId: 'asset-1' });
  const file = buildRun({ test: 'DVS signal', workflowId: 'dvs', audio: sig, source: 'take.wav' });
  assert.equal(persistCaptureFields(file).captureKind, 'file');
  assert.equal(persistCaptureFields(file).assetId, null);
  assert.deepEqual(persistCaptureFields({ id: 'old', createdAt: '2026-01-01' }), {}, 'runs from older builds keep their payload');
  assert.deepEqual(persistCaptureFields(null), {});
  // the payload keys match the save_diagnostic_run contract
  const keys = Object.keys(persistCaptureFields(run)).sort();
  for (const k of keys) assert.ok(k in CONTRACT.save_diagnostic_run.request.run, k);
});

// ---------------------------------------------------------------- AC-2 end to end (JS side)
test('AC-2: a 40-minute live DVS capture becomes one unconfirmed 0.67 h deckchek proposal', async () => {
  const calls = [];
  const api = createStylusApi({ invoke: async (cmd, args) => { calls.push([cmd, args]); return CONTRACT.list_capture_sessions.response; } });
  const props = await api.captureProposals('asset-1', { since: '2026-10-01T00:00:00.000Z' });
  assert.deepEqual(calls, [['list_capture_sessions', CONTRACT.list_capture_sessions.request]]);
  assert.equal(props.length, 1);
  assert.deepEqual({ ...props[0] }, { assetId: 'asset-1', kind: 'play', startedAt: '2026-10-10T20:00:00.000Z', hours: 0.6667, source: 'deckchek', sessionId: 'run-dvs-40', capped: false, confirmed: 0 });
  assert.equal(Math.round(props[0].hours * 100) / 100, 0.67);
  // already in the ledger -> not proposed again
  assert.equal((await api.captureProposals('asset-1', { existing: [{ sessionId: 'run-dvs-40' }] })).length, 0);
  assert.deepEqual((await api.captureSessions('asset-1'))[0].id, 'run-dvs-40');
  await assert.rejects(() => createStylusApi({ invoke: null }).captureProposals('a'), /desktop app/);
});

test('proposeFromCaptureSessions counts live captures only', () => {
  const row = (id, kind, mins, extra = {}) => ({ id, kind, startedAt: '2026-10-10T20:00:00.000Z', endedAt: new Date(Date.parse('2026-10-10T20:00:00.000Z') + mins * 60000).toISOString(), assetId: 'sty', ...extra });
  const out = proposeFromCaptureSessions([row('a', 'live', 40), row('b', 'file', 40), row('c', null, 40), row('d', 'live', 0.5), row('e', 'live', 30, { assetId: 'other' }), row('f', 'live', 30, { assetId: null, setupId: 's1' })], 'sty');
  assert.deepEqual(out.map(p => [p.sessionId, p.hours]), [['a', 0.6667], ['f', 0.5]]);
  assert.deepEqual(proposeFromCaptureSessions(null, 'sty'), []);
  const capped = proposeFromCaptureSessions([row('long', 'live', 20 * 60)], 'sty', { capHours: 8 });
  assert.equal(capped[0].capped, true);
});

// ---------------------------------------------------------------- browser twin of list_capture_sessions
test('captureSessionsLocal mirrors list_capture_sessions and the store routes to the command', async () => {
  const runs = [
    { id: 'z', test: 'DVS signal', sessionType: 'dvs', startedAt: '2026-10-10T20:00:00.000Z', endedAt: '2026-10-10T20:40:00.000Z', durationSec: 2400, captureKind: 'live', assetId: 'asset-1' },
    { id: 'old', test: 'T', createdAt: '2026-10-09T00:00:00Z' },
    { id: 'y', test: 'Speed & pitch', startedAt: '2026-09-01T00:00:00.000Z', endedAt: '2026-09-01T00:00:10.000Z', captureKind: 'file', deviceId: 'asset-1' },
    { id: 'x', startedAt: '2026-10-11T00:00:00.000Z', endedAt: '2026-10-11T00:01:00.000Z', captureKind: 'live', assetId: 'deck' },
  ];
  const got = captureSessionsLocal(runs, { since: CONTRACT.list_capture_sessions.request.since, assetId: 'asset-1' });
  assert.deepEqual(got, CONTRACT.list_capture_sessions.response.map(r => ({ ...r, id: 'z' })));
  assert.deepEqual(captureSessionsLocal(runs).map(r => r.id), ['y', 'z', 'x']);
  assert.equal(captureSessionsLocal(runs)[0].durationSec, 10);
  assert.deepEqual(captureSessionsLocal(runs, { limit: 1 }).map(r => r.id), ['y']);
  assert.throws(() => captureSessionsLocal(runs, { since: 'last week' }), /since/);
  assert.deepEqual(summarizeRun(runs[0]).startedAt, '2026-10-10T20:00:00.000Z');
  assert.deepEqual([summarizeRun(runs[1]).startedAt, summarizeRun(runs[1]).endedAt], ['2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z']);

  const calls = [];
  const native = createCatalogStore({ invoke: async (c, a) => { calls.push([c, a]); return []; }, storage: memStorage() });
  await native.listCaptureSessions({ since: '2026-10-01T00:00:00.000Z', assetId: 'asset-1' });
  assert.deepEqual(calls, [['list_capture_sessions', CONTRACT.list_capture_sessions.request]]);
  const local = createCatalogStore({ invoke: null, storage: memStorage() });
  await local.saveRun(runs[0]);
  await local.saveRun(runs[1]);
  assert.deepEqual((await local.listCaptureSessions({ assetId: 'asset-1' })).map(r => r.id), ['z']);
});

// ---------------------------------------------------------------- timecode metrics as run measurements
test('DVS signal runs carry the analyzeTimecode metrics as ordinary measurements', () => {
  const sig = audioOf(quadratureTimecode({ carrierHz: 1000, seconds: 2, snrDb: 35, seed: 4 }));
  const run = buildRun({ test: 'DVS signal', workflowId: 'dvs', audio: sig, source: 'Live capture · X', quality: { overrunSamples: 0, streamErrors: 0, maxCallbackGapMs: 2 } });
  for (const id of ['tc_carrier_hz', 'tc_speed_error_percent', 'tc_phase_deg', 'tc_phase_error_deg', 'tc_balance_db', 'tc_snr_db', 'tc_dropouts', 'tc_direction_code']) {
    assert.ok(Number.isFinite(val(run, id)), id);
  }
  assert.ok(Math.abs(val(run, 'tc_snr_db') - 35) < 3, String(val(run, 'tc_snr_db')));
  assert.ok(val(run, 'tc_phase_error_deg') < 2);
  assert.equal(val(run, 'tc_dropouts'), 0);
  assert.equal(val(run, 'tc_direction_code'), 1);
  assert.equal(run.measurements.find(m => m.metricId === 'tc_snr_db').confidence, 0.7, 'format inferred from the carrier');
  assert.equal(run.evidence.timecode.inferred, true);
  assert.equal(run.evidence.timecode.format, 'Serato CV02.5');
  assert.ok(run.evidence.timecode.ambiguous.includes('rekordbox RB-VS1'));
  // the stylus benchmark auto-fills from it
  assert.deepEqual(timecodeBenchmarkFromRuns([run]), { tcSnrDb: val(run, 'tc_snr_db'), tcRun: run.id, tcPhaseErrorDeg: val(run, 'tc_phase_error_deg'), tcDropouts: 0 });
});

test('named format, findings with evidence links, reverse play and non-timecode audio', () => {
  // Traktor MK1 forward: right leads (SWITCH_PRIMARY + SWITCH_PHASE cancel); noisy -> SNR finding
  const noisy = audioOf(quadratureTimecode({ carrierHz: 2000, seconds: 2, snrDb: 12, seed: 9 }));
  const r = timecodeRunResult(noisy, { timecodeFormat: 'Traktor Scratch MK1' });
  assert.equal(r.inferred, false);
  assert.equal(r.direction, 'forward');
  assert.equal(r.measurements.find(m => m.metricId === 'tc_snr_db').confidence, 0.85);
  const snr = r.findings.find(f => f.code === 'TC_SNR');
  assert.ok(snr && ['warning', 'review'].includes(snr.severity) && snr.isolationTests.length === 1 && snr.possibleCauses.length);
  const run = buildRun({ test: 'DVS signal', workflowId: 'dvs', audio: noisy, source: 'f.wav', params: { timecodeFormat: 'Traktor Scratch MK1' } });
  assert.deepEqual(run.findings.find(f => f.code === 'TC_SNR').supportedBy, ['tc_snr_db']);
  // reverse play is a review finding with the direction code
  const rev = timecodeRunResult(audioOf(quadratureTimecode({ carrierHz: 1000, seconds: 1, snrDb: 40, velocityProfile: -1 })), { formatName: 'Serato CV02.5' });
  assert.equal(rev.measurements.find(m => m.metricId === 'tc_direction_code').value, -1);
  assert.ok(rev.findings.some(f => f.code === 'TC_REVERSE'));
  // a 440 Hz tone is not timecode: no tc_* metrics on the run
  const n = SR, l = new Float32Array(n), rr = new Float32Array(n);
  for (let i = 0; i < n; i++) { l[i] = .4 * Math.sin(2 * Math.PI * 440 * i / SR); rr[i] = .4 * Math.cos(2 * Math.PI * 440 * i / SR); }
  const tone = { left: l, right: rr, sampleRate: SR, channels: 2, durationSec: 1 };
  assert.equal(timecodeRunResult(tone, {}), null);
  assert.ok(!buildRun({ test: 'DVS signal', workflowId: 'dvs', audio: tone, source: 'x.wav' }).measurements.some(m => m.metricId.startsWith('tc_')));
  assert.ok(!buildRun({ test: 'Vibration check', workflowId: 'tt', audio: tone, source: 'x.wav' }).measurements.some(m => m.metricId.startsWith('tc_')));
});

test('timecodeBenchmarkFromRuns takes all three values from the newest timecode run', () => {
  const m = (metricId, value) => ({ metricId, value });
  const runs = [
    { id: 'cart', measurements: [m('left_thd_percent', .5)] },
    { id: 'new', measurements: [m('tc_snr_db', 30.5), m('tc_phase_error_deg', 3.25), m('tc_dropouts', 1.6)] },
    { id: 'older', measurements: [m('tc_snr_db', 40), m('tc_phase_error_deg', 1), m('tc_dropouts', 0)] },
  ];
  assert.deepEqual(timecodeBenchmarkFromRuns(runs), { tcSnrDb: 30.5, tcRun: 'new', tcPhaseErrorDeg: 3.25, tcDropouts: 2 });
  assert.deepEqual(timecodeBenchmarkFromRuns([{ id: 'p', measurements: [m('tc_snr_db', 20), m('tc_phase_error_deg', NaN)] }]), { tcSnrDb: 20, tcRun: 'p' });
  assert.deepEqual(timecodeBenchmarkFromRuns([runs[0]]), {});
  assert.deepEqual(timecodeBenchmarkFromRuns(null), {});
});

// ---------------------------------------------------------------- capture lease (merged in capture-pairs)
test('capture_native_audio runs inside the bounded capture lease', () => {
  const src = readFileSync(new URL('../src-tauri/src/audio.rs', import.meta.url), 'utf8');
  const start = src.indexOf('pub async fn capture_native_audio(');
  assert.ok(start > 0, 'command exists');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  assert.match(body, /with_bounded_lease\(&state, holder\.as_deref\(\), lease_device, \|cancel\| \{\s*capture_blocking\(/, 'the whole capture runs inside the lease');
  assert.match(body, /holder: Option<String>/);
  // the lease helper itself is covered by capture.rs bounded_capture_holds_the_lease_and_is_preemptible
  assert.match(readFileSync(new URL('../src-tauri/src/capture.rs', import.meta.url), 'utf8'), /fn bounded_capture_holds_the_lease_and_is_preemptible\(\)/);
});
