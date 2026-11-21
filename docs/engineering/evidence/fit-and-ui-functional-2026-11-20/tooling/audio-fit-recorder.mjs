// Disposable-copy diagnostic only. Production source never imports this module.
// Snapshots contain no waveform samples and invoke no audio-analysis functions.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';

const directory = process.env.DECKCHEK_AUDIO_FIT_TRACE_DIR;
const enabled = typeof directory === 'string' && isAbsolute(directory);
const MAX_RECORDS = 8192;
const MAX_BYTES = 8 * 1024 * 1024;
const ids = new WeakMap();
const records = [];
const errors = [];
let nextId = 0, nextAnalysis = 0, nextSequence = 0, bytes = 0, dropped = 0;
let truncated = false;

function id(value) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return null;
  if (!ids.has(value)) ids.set(value, ++nextId);
  return ids.get(value);
}

function scalar(value) {
  if (typeof value === 'number') {
    const binary = Buffer.allocUnsafe(8);
    binary.writeDoubleBE(value);
    return { decimal: Object.is(value, -0) ? '-0' : String(value), ieee754be: binary.toString('hex') };
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  return { unavailableType: typeof value };
}

const scalars = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, scalar(value)]));

function fitSnapshot(fit) {
  if (fit == null) return null;
  return { objectId: id(fit), ...scalars({ amplitude: fit.amplitude, phase: fit.phase, dc: fit.dc, residualRms: fit.residualRms }) };
}

function arraySnapshot(samples) {
  if (samples == null) return null;
  return {
    objectId: id(samples), bufferId: id(samples.buffer), type: samples.constructor.name,
    length: samples.length, byteOffset: samples.byteOffset, byteLength: samples.byteLength,
    sha256: createHash('sha256').update(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)).digest('hex'),
  };
}

function append(analysis, phase, payload) {
  if (truncated) { dropped++; return; }
  const serialized = JSON.stringify({ sequence: ++nextSequence, analysis, phase, ...payload });
  const length = Buffer.byteLength(serialized);
  if (records.length >= MAX_RECORDS || bytes + length > MAX_BYTES) {
    truncated = true; dropped++; return;
  }
  // Only strings are retained: later writes to fits, channels or arrays cannot rewrite a prior record.
  records.push(serialized);
  bytes += length;
}

function failed(error) {
  if (errors.length < 16) errors.push(`${error?.name ?? 'Error'}: ${String(error?.message ?? error).slice(0, 512)}`);
}

export function audioFitTraceBegin(captured, meta, options) {
  if (!enabled || truncated) return null;
  const analysis = ++nextAnalysis;
  try {
    append(analysis, 'validated-entry', {
      capturedObjectId: id(captured), metaObjectId: id(meta),
      input: { left: arraySnapshot(captured.left), right: arraySnapshot(captured.right) },
      values: scalars({ sampleRate: meta.sampleRate, capturedSampleRate: captured.sampleRate,
        playLevelDbfs: meta.playLevelDbfs, markerStart: meta.markerStart, markerLength: meta.markerLength,
        totalSamples: meta.totalSamples, trimSec: options.trimSec, maxLagSec: options.maxLagSec,
        calibrated: options.calibrated, chainFloorThdnPercent: options.chainFloor?.thdnPercent }),
    });
  } catch (error) { failed(error); }
  return analysis;
}

export function audioFitTraceStage(analysis, phase, channel, samples, fit, values = {}, relatedFits = {}) {
  if (!enabled || analysis == null || truncated) return;
  try {
    // Fit/scalar reads precede hashing. These are sequential observations, not an atomic machine snapshot.
    const observedFit = fitSnapshot(fit);
    const observedValues = scalars(values);
    const observedRelated = Object.fromEntries(Object.entries(relatedFits).map(([key, value]) => [key, fitSnapshot(value)]));
    const input = arraySnapshot(samples);
    append(analysis, phase, { channel, fit: observedFit, values: observedValues, relatedFits: observedRelated, input });
  } catch (error) { failed(error); }
}

export function audioFitTraceReadout(analysis, phase, out, per, ref1k = null, values = {}, captured = null) {
  if (!enabled || analysis == null || truncated) return;
  try {
    const channels = Object.fromEntries(Object.entries(per).map(([channel, item]) => [channel, {
      fit: fitSnapshot(item.fit),
      values: scalars({ gainDb: item.gainDb, gainLow: item.gainLow, gainHigh: item.gainHigh,
        thdn: item.thdn, thd: item.thd, snr: item.snr, phaseDeg: item.phaseDeg,
        dc: item.dc, noiseA: item.noiseA, noiseU: item.noiseU, dropouts: item.dropouts, clip: item.clip }),
    }]));
    append(analysis, phase, {
      channels, reference: ref1k == null ? null : scalars(ref1k),
      values: scalars({ valid: out.valid, clockPpm: out.clockPpm, lagSamples: out.lagSamples, ...values }),
      measurements: out.measurements.map(item => ({ metricId: item.metricId, value: scalar(item.value) })),
      response: out.response.map(item => scalars({ hz: item.hz, devDb: item.devDb, devLeftDb: item.devLeftDb, devRightDb: item.devRightDb })),
      issues: out.issues.map(item => ({ code: item.code, severity: item.severity })),
      input: captured == null ? null : { left: arraySnapshot(captured.left), right: arraySnapshot(captured.right) },
    });
  } catch (error) { failed(error); }
}

if (enabled) process.on('exit', exitCode => {
  const label = basename(process.argv[1] ?? 'unknown-test').replace(/[^A-Za-z0-9._-]/g, '_');
  const header = {
    schema: 'deckchek.audio-fit-observation.v1',
    sourceCommit: process.env.DECKCHEK_AUDIO_FIT_SOURCE_COMMIT ?? null,
    sourceTree: process.env.DECKCHEK_AUDIO_FIT_SOURCE_TREE ?? null,
    transformedAudioQualitySha256: process.env.DECKCHEK_AUDIO_FIT_SOURCE_SHA256 ?? null,
    testFile: process.argv[1] ?? null, cwd: process.cwd(), pid: process.pid,
    argv: process.argv, execArgv: process.execArgv, execPath: process.execPath,
    nodeVersion: process.version, nodeOptions: process.env.NODE_OPTIONS ?? null, exitCode,
    recordCount: records.length, serializedRecordBytes: bytes, eligibleAnalysisCount: nextAnalysis,
    limits: { maxRecords: MAX_RECORDS, maxRecordBytes: MAX_BYTES }, truncated, dropped, errors,
    limitations: [
      'Entry observations begin after the original input/finite-value guards. Earlier rejected calls have no trace; entry-only calls can return through original silent/marker/length guards.',
      'A SHA-256 digest identifies bytes only at the observed time. It does not establish continuous immutability between observations.',
      'Fit/scalar snapshots are serialized immediately into immutable strings. Fit fields are read before slice hashing; those operations are sequential, not atomic.',
      'Object and backing-buffer IDs use WeakMaps and are local to this process. Originals receive no added properties and are not frozen or cloned for analysis.',
      'Later readouts observe fundamental fits and existing output values. Low/high fit objects are observed after their calls; their input slice identities are not observed.',
      'Imports, weak identities, synchronous hashing, snapshot allocation, extra field reads, object escape and retained JSON strings change execution context and can affect timing/allocation/optimization.',
      'The existing finish-aggregate comparator separately retains actual fixture references until its after hook. This trace does not strengthen that comparator\'s delayed input claims.',
      'No extra fit/analyzer call, numerical arithmetic edit, engine flag, threshold/assertion/skip change or waveform output is introduced.',
      'An instrumented pass or changed failure does not qualify the untouched production tree or establish an engine, solver, aliasing or mutation cause.',
    ],
  };
  const serialized = `${JSON.stringify(header).slice(0, -1)},"records":[${records.join(',')}] }\n`;
  try {
    writeFileSync(join(directory, `${label}.${process.pid}.json`), serialized, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    process.stderr.write(`Audio fit observation output failed: ${String(error?.message ?? error).slice(0, 512)}\n`);
  }
});
