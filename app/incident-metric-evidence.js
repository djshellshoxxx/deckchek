// SPEC-05 §20: one explicitly selected, existing live-monitor observation.
// No capture, frame queue, PCM, persistence fallback or inferred venue identity.
import { normalizeIncidentDraft, validateSavedIncident } from './venue-incidents.js';
import { TIMECODE_FORMATS } from './timecode.js';

export const METRIC_METHOD = 'live-monitor-latest-frame-v1';
export const MAX_METRIC_SUBMISSION_BYTES = 32 * 1024;
export const MAX_METRIC_SUMMARIES = 300;
export const METRIC_FIELDS = Object.freeze([
  ['levelDb', 'Level', 'dBFS'], ['snrDb', 'SNR', 'dB'], ['carrierHz', 'Carrier', 'Hz'],
  ['speedPct', 'Speed deviation', '%'], ['phaseDeg', 'Phase', '°'], ['jitterDeg', 'Phase jitter', '°'],
  ['balanceDb', 'L/R balance', 'dB'], ['driftDeg', 'Quadrature error', '°'],
  ['humDb', 'Hum (floor-corrected)', 'dBFS'], ['humFloorDb', 'Hum local floor', 'dBFS'], ['mainsHz', 'Mains bin', 'Hz'],
].map(([key, label, unit]) => Object.freeze({ key, label, unit })));
const numericKeys = METRIC_FIELDS.map(field => field.key);
const metricKeys = [...numericKeys, 'dropouts', 'locked', 'motion', 'direction', 'state'];
const evidenceKeys = ['schemaVersion', 'method', 'incidentId', 'pressAt', 'association', 'source', 'timing', 'configuration', 'metrics', 'unavailable', 'loss'];
const summaryKeys = evidenceKeys.filter(key => key !== 'configuration');
const savedKeys = ['origin', 'recordedAt'];
// These are the existing monitor v1 setting limits, not new detector criteria.
const thresholdRanges = {
  snrDropDb: [1, 40], snrDropSec: [0.5, 60], snrFloorDb: [0, 40], snrFloorSec: [0.25, 60], healthySnrDb: [0, 60],
  dropoutDb: [6, 60], dropoutCount: [1, 50], dropoutSpanSec: [1, 120], maxDropoutSec: [0.04, 5],
  humRiseDb: [1, 40], humSec: [0.5, 60], humMinDbfs: [-140, 0], humAboveFloorDb: [0, 40],
  phaseRateDegPerSec: [0.5, 90], phaseJitterDeg: [1, 90], phaseSec: [0.5, 60],
  presenceDb: [-90, -20], idleInfoSec: [1, 600], minBaselineSec: [1, 60],
};
const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? globalThis.__TAURI__?.core?.invoke ?? null;

export class MetricEvidenceError extends Error {
  constructor(code, message) { super(message); this.name = 'MetricEvidenceError'; this.code = code; }
}
const invalid = message => { throw new MetricEvidenceError('METRIC_EVIDENCE_INVALID', message); };
const unavailable = () => { throw new MetricEvidenceError('METRIC_EVIDENCE_UNAVAILABLE', 'The selected live-monitor source is unavailable. Choose its current generation or turn off the attachment to record without a reading.'); };
function object(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
      || keys.some(key => !Object.hasOwn(value, key))) invalid(`${name} must contain exactly its supported fields`);
}
function text(value, name, max, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value.trim() || [...value].length > max || /[\u0000-\u001f\u007f]/.test(value)
      || Array.from(value, c => c.codePointAt(0)).some(code => code >= 0xd800 && code <= 0xdfff)) invalid(`${name} must contain 1–${max} valid characters`);
  return value;
}
function identifier(value, name, nullable = false) {
  const result = text(value, name, 128, nullable);
  if (result !== null && result.trim() !== result) invalid(`${name} must not have surrounding whitespace`);
  return result;
}
function timestamp(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid(`${name} must be a valid UTC timestamp with milliseconds`);
  return value;
}
function finite(value, name, { nullable = false, min = -Infinity, max = Infinity, integer = false } = {}) {
  if (nullable && value === null) return null;
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) invalid(`${name} is not a valid ${integer ? 'bounded count' : 'finite value'}`);
  return value;
}
const count = (value, name, nullable = false) => finite(value, name, { nullable, min: 0, max: Number.MAX_SAFE_INTEGER, integer: true });
function choice(value, values, name) { if (!values.includes(value)) invalid(`${name} is unsupported`); return value; }
function sourceInput(value) {
  object(value, ['generation', 'deck', 'deviceName', 'firstChannel', 'secondChannel', 'format', 'sessionId'], 'Metric source');
  const firstChannel = finite(value.firstChannel, 'First channel', { min: 1, max: 65535, integer: true });
  if (firstChannel % 2 !== 1 || value.secondChannel !== firstChannel + 1) invalid('The input pair must contain consecutive channels starting with an odd channel');
  return { generation: identifier(value.generation, 'Stream generation'), deck: choice(value.deck, ['A', 'B', 'C', 'D'], 'Deck'),
    deviceName: text(value.deviceName, 'Device label', 200, true), firstChannel, secondChannel: value.secondChannel,
    format: choice(value.format, TIMECODE_FORMATS.map(format => format.name), 'Timecode format'), sessionId: identifier(value.sessionId, 'Monitor session ID', true) };
}
function timingInput(value) {
  object(value, ['basis', 'observedAt', 'sampleTimeSeconds', 'ageMs'], 'Observation timing');
  if (value.basis !== 'host-callback-observation') invalid('Unsupported observation time basis');
  return { basis: value.basis, observedAt: timestamp(value.observedAt, 'Observation time'),
    sampleTimeSeconds: finite(value.sampleTimeSeconds, 'Frame sample clock', { nullable: true, min: 0 }),
    ageMs: finite(value.ageMs, 'Observed age', { nullable: true, min: 0 }) };
}
function configurationInput(value) {
  object(value, ['settingsVersion', 'sampleRateHz', 'hopMs', 'analysisWindowSeconds', 'baselineSeconds', 'nominalRpm', 'thresholds', 'cooldownSec'], 'Monitor configuration');
  if (value.settingsVersion !== 1 || value.analysisWindowSeconds !== 0.5 || value.baselineSeconds !== 60 || value.nominalRpm !== 33.333333) invalid('Unsupported monitor method configuration');
  object(value.thresholds, Object.keys(thresholdRanges), 'Monitor thresholds');
  const thresholds = Object.fromEntries(Object.entries(thresholdRanges).map(([key, [min, max]]) => [key, finite(value.thresholds[key], key, { min, max })]));
  return { settingsVersion: 1, sampleRateHz: finite(value.sampleRateHz, 'Observed sample rate', { integer: true, min: 4000, max: 384000 }),
    hopMs: finite(value.hopMs, 'Monitor hop', { min: 50, max: 1000 }), analysisWindowSeconds: 0.5, baselineSeconds: 60, nominalRpm: 33.333333,
    thresholds, cooldownSec: finite(value.cooldownSec, 'Alert cooldown', { min: 0, max: 3600 }) };
}
function metricsInput(value, unavailableFields) {
  object(value, metricKeys, 'Metric values');
  const metrics = Object.fromEntries(numericKeys.map(key => [key, finite(value[key], key, { nullable: true })]));
  if (metrics.mainsHz !== null && ![50, 60].includes(metrics.mainsHz)) invalid('Mains bin must be 50 Hz, 60 Hz or unavailable');
  if (typeof value.locked !== 'boolean') invalid('Lock must be a boolean');
  Object.assign(metrics, { dropouts: count(value.dropouts, 'Dropout count'), locked: value.locked,
    motion: choice(value.motion, ['play', 'cue', 'idle'], 'Motion'), direction: choice(value.direction, ['forward', 'reverse', 'unknown'], 'Direction'),
    state: choice(value.state, ['ok', 'watch', 'fault', 'idle', 'nosignal'], 'Monitor state') });
  const expected = numericKeys.filter(key => metrics[key] === null || (metrics.mainsHz === null && ['humDb', 'humFloorDb'].includes(key)));
  if (!Array.isArray(unavailableFields) || unavailableFields.length !== expected.length || expected.some((key, index) => unavailableFields[index] !== key)) invalid('Unavailable metric fields must exactly describe null values and unobserved hum placeholders');
  return { metrics, unavailable: expected };
}
function lossInput(value) {
  const keys = ['reportedDroppedBlocks', 'monitorDroppedBlocks', 'logEventsDropped'];
  object(value, keys, 'Loss counters');
  return Object.fromEntries(keys.map(key => [key, count(value[key], key, true)]));
}
function evidenceInput(value, incident, summary = false) {
  if (value.schemaVersion !== 1 || value.method !== METRIC_METHOD || value.association !== 'operator-selected') invalid('Unsupported metric evidence schema, method or association');
  const incidentId = identifier(value.incidentId, 'Evidence incident ID'), pressAt = timestamp(value.pressAt, 'Press time');
  if (incident && (incidentId !== incident.id || pressAt !== incident.occurredAt)) invalid('The metric evidence does not match the incident press');
  return { schemaVersion: 1, method: METRIC_METHOD, incidentId, pressAt, association: 'operator-selected',
    source: sourceInput(value.source), timing: timingInput(value.timing),
    ...(!summary ? { configuration: configurationInput(value.configuration) } : {}),
    ...metricsInput(value.metrics, value.unavailable), loss: lossInput(value.loss) };
}

/** Strict saved-input validation. Sanitizing is confined to copyMonitorObservation. */
export function validateMetricEvidence(value, incident) {
  const input = normalizeIncidentDraft(incident);
  object(value, evidenceKeys, 'Metric evidence');
  const evidence = evidenceInput(value, input);
  if (new TextEncoder().encode(JSON.stringify({ input, evidence })).byteLength > MAX_METRIC_SUBMISSION_BYTES) invalid('The complete incident and metric submission exceeds 32 KiB');
  return evidence;
}

/** Copy the fixed existing fields before exposing a frame to external callbacks. */
export function copyMonitorObservation(frame, { source, observedAt, configuration, loss }) {
  const metrics = Object.fromEntries(numericKeys.map(key => [key, Number.isFinite(frame[key]) ? frame[key] : null]));
  Object.assign(metrics, { dropouts: frame.dropouts, locked: frame.locked, motion: frame.motion, direction: frame.direction, state: frame.state });
  return { source: structuredClone(source), timing: { basis: 'host-callback-observation', observedAt,
    sampleTimeSeconds: Number.isFinite(frame.t) && frame.t >= 0 ? frame.t : null, ageMs: null },
    configuration: structuredClone(configuration), metrics,
    unavailable: numericKeys.filter(key => metrics[key] === null || (metrics.mainsHz === null && ['humDb', 'humFloorDb'].includes(key))),
    loss: Object.fromEntries(['reportedDroppedBlocks', 'monitorDroppedBlocks', 'logEventsDropped'].map(key =>
      [key, Number.isSafeInteger(loss[key]) && loss[key] >= 0 ? loss[key] : null])) };
}
export function createMetricEvidence(observation, incident, ageMs) {
  return validateMetricEvidence({ schemaVersion: 1, method: METRIC_METHOD, incidentId: incident.id, pressAt: incident.occurredAt,
    association: 'operator-selected', ...observation, timing: { ...observation.timing, ageMs } }, incident);
}

let registeredMonitor = null;
/** Only an already-created monitor is registered. No factory or capture action. */
export function registerMetricMonitor(controller) {
  registeredMonitor = controller;
  return () => { if (registeredMonitor === controller) registeredMonitor = null; };
}
export const liveMonitorMetricSources = Object.freeze({
  list: () => registeredMonitor?.metricSources() ?? [],
  snapshot(selector, incident) { if (!registeredMonitor) unavailable(); return registeredMonitor.metricSnapshot(selector, incident); },
});

function savedEvidence(value, incident, summary = false) {
  object(value, [...(summary ? summaryKeys : evidenceKeys), ...savedKeys], 'Saved metric evidence');
  if (value.origin !== 'operator-attached') invalid('Saved metric evidence must be operator-attached');
  const input = evidenceInput(value, incident, summary);
  const recordedAt = timestamp(value.recordedAt, 'Evidence saved time');
  if (recordedAt !== incident.recordedAt) invalid('The saved metric evidence and parent must have the same atomic save time');
  return { ...input, origin: 'operator-attached', recordedAt };
}
export function metricEvidenceSummary(value) {
  const result = Object.fromEntries([...summaryKeys, ...savedKeys].map(key => [key, value[key]]));
  return structuredClone(result);
}
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function pairResult(value, expected, summary = false) {
  object(value, ['incident', 'evidence'], 'Saved incident and evidence');
  const incident = validateSavedIncident(value.incident);
  if (expected && !same(incident, expected)) invalid('The saved parent changed or does not match the requested incident');
  return { incident, evidence: value.evidence === null ? null : savedEvidence(value.evidence, incident, summary) };
}
function errorOf(error) {
  if (error instanceof MetricEvidenceError) return error;
  const message = typeof error === 'string' ? error : error?.message || String(error);
  const match = /^(METRIC_EVIDENCE_[A-Z_]+):\s*([\s\S]*)$/.exec(message);
  return new MetricEvidenceError(match?.[1] || 'METRIC_EVIDENCE_ERROR', match?.[2] || message);
}

/** Native-only, separate commands. Ordinary v1 incident/browser stores stay intact. */
export function createIncidentMetricStore({ invoke } = {}) {
  const bridge = () => invoke === undefined ? nativeInvoke() : invoke;
  const call = async (command, args) => {
    const fn = bridge();
    if (!fn) throw new MetricEvidenceError('METRIC_EVIDENCE_UNSUPPORTED', 'Saved live-monitor snapshots require the desktop app');
    return fn(command, args);
  };
  return {
    get native() { return Boolean(bridge()); },
    async save(draft, rawEvidence) {
      try {
        // Copies are complete before invoking or awaiting the native bridge.
        const input = normalizeIncidentDraft(draft), evidence = validateMetricEvidence(rawEvidence, input);
        const result = pairResult(await call('venue_incident_save_with_metric_evidence', { input, evidence }));
        const returnedDraft = normalizeIncidentDraft(Object.fromEntries(Object.keys(input).map(key => [key, result.incident[key]])));
        const returnedEvidence = result.evidence && evidenceInput(result.evidence, returnedDraft);
        if (!same(returnedDraft, input) || !same(returnedEvidence, evidence)) invalid('The saved pair does not match the frozen submission');
        return result;
      } catch (error) { throw errorOf(error); }
    },
    async get(expectedIncident) {
      try {
        const expected = validateSavedIncident(expectedIncident);
        return pairResult(await call('venue_incident_metric_evidence_get', { incidentId: expected.id }), expected);
      } catch (error) { throw errorOf(error); }
    },
    async summaries(expectedIncidents) {
      try {
        if (!Array.isArray(expectedIncidents) || expectedIncidents.length > MAX_METRIC_SUMMARIES) invalid('Snapshot summaries are limited to 300 selected incidents');
        const expected = expectedIncidents.map(validateSavedIncident);
        if (new Set(expected.map(row => row.id)).size !== expected.length) invalid('Snapshot summary incident IDs must be unique');
        const result = await call('venue_incident_metric_evidence_summaries', { incidentIds: expected.map(row => row.id) });
        if (!Array.isArray(result) || result.length !== expected.length) invalid('Snapshot summaries have a missing or unexpected result count');
        return result.map((pair, index) => pairResult(pair, expected[index], true));
      } catch (error) { throw errorOf(error); }
    },
  };
}
