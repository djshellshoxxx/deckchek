// CDJ-04 provisional evidence envelope. This is an offline JSON contract, NOT a
// capture verifier, production persistence adapter or hardware qualification.
// In particular, operator-supplied flags/references never confer report eligibility.
export const CDJ_EVIDENCE_SCHEMA = 'deckchek.cdj04.evidence.v1';
export const CDJ_QUALITY_FLAGS = Object.freeze([
  'referenceIdentityVerified', 'clippingExcluded', 'durationAdequate',
  'toneStable', 'processingDisabled', 'capturePathVerified',
]);

const ownObject = (value, label) => {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
};
const text = (value, label, max = 240) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new TypeError(`${label} must be text`);
  const s = value.trim();
  if (!s) return null;
  if (s.length > max || /[\u0000-\u001f\u007f]/u.test(s)) throw new RangeError(`${label} is invalid or too long`);
  return s;
};
const number = (value, label, { min = -Infinity, max = Infinity, integer = false } = {}) => {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new RangeError(`${label} must be a finite${integer ? ' integer' : ''} number in range`);
  }
  return value;
};
const refs = (value, label) => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 32) throw new RangeError(`${label} must be a bounded array`);
  return value.map((entry, i) => {
    const ref = text(entry, `${label}[${i}]`, 240);
    if (!ref) throw new TypeError(`${label}[${i}] must not be blank`);
    return ref;
  });
};
const state = (value, label) => {
  if (value == null) return 'unknown';
  if (!['unknown', 'enabled', 'disabled'].includes(value)) throw new RangeError(`${label} must be unknown, enabled or disabled`);
  return value;
};
const range = value => {
  if (value == null) return null;
  const r = ownObject(value, 'pitch.supportedRangePercent');
  const min = number(r.min, 'pitch.supportedRangePercent.min');
  const max = number(r.max, 'pitch.supportedRangePercent.max');
  if (min == null || max == null || min > max) throw new RangeError('pitch.supportedRangePercent must have ordered finite bounds');
  return { min, max };
};
const hash = value => {
  const s = text(value, 'source.referenceHashSha256', 64);
  if (s && !/^[a-f\d]{64}$/iu.test(s)) throw new RangeError('source.referenceHashSha256 must be a SHA-256 hex digest');
  return s?.toLowerCase() ?? null;
};
const observedAt = value => {
  const s = text(value, 'observedAt', 35);
  if (s && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(s) ||
    !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 19) !== s.slice(0, 19))) {
    throw new RangeError('observedAt must be a valid UTC ISO timestamp');
  }
  return s;
};

/**
 * Normalize a pending CDJ evidence record, preserving unknown fields explicitly.
 * No verification of external audio, hash, hardware, clock or method is performed.
 * Even a completely populated, operator-asserted envelope remains UNVERIFIED.
 */
export function createCdjEvidenceRecord(input = {}) {
  const i = ownObject(input, 'evidence record');
  const a = ownObject(i.asset, 'asset');
  const s = ownObject(i.source, 'source');
  const c = ownObject(i.capture, 'capture');
  const p = ownObject(i.processing, 'processing');
  const pitch = ownObject(i.pitch, 'pitch');
  const m = ownObject(i.analysis, 'analysis');
  const uncertainty = ownObject(m.uncertainty, 'analysis.uncertainty');
  const q = ownObject(i.quality, 'quality');
  const flags = ownObject(q.flags, 'quality.flags');
  const normalized = {
    schemaVersion: CDJ_EVIDENCE_SCHEMA,
    runId: text(i.runId, 'runId', 128),
    observedAt: observedAt(i.observedAt),
    asset: {
      assetId: text(a.assetId, 'asset.assetId', 128),
      manufacturer: text(a.manufacturer, 'asset.manufacturer'),
      model: text(a.model, 'asset.model'),
      firmware: text(a.firmware, 'asset.firmware'),
    },
    source: {
      medium: text(s.medium, 'source.medium'),
      referenceId: text(s.referenceId, 'source.referenceId'),
      referenceHashSha256: hash(s.referenceHashSha256),
      referenceVersion: text(s.referenceVersion, 'source.referenceVersion'),
      referenceFrequencyHz: number(s.referenceFrequencyHz, 'source.referenceFrequencyHz', { min: Number.MIN_VALUE }),
    },
    capture: {
      sampleRateHz: number(c.sampleRateHz, 'capture.sampleRateHz', { min: 1, integer: true }),
      deviceName: text(c.deviceName, 'capture.deviceName'),
      backend: text(c.backend, 'capture.backend'),
      selectedPairs: refs(c.selectedPairs, 'capture.selectedPairs'),
      gainDb: number(c.gainDb, 'capture.gainDb'),
      routing: text(c.routing, 'capture.routing', 500),
      elapsedSeconds: number(c.elapsedSeconds, 'capture.elapsedSeconds', { min: 0 }),
      rawEvidenceRefs: refs(c.rawEvidenceRefs, 'capture.rawEvidenceRefs'),
    },
    processing: {
      keylock: state(p.keylock, 'processing.keylock'),
      fx: state(p.fx, 'processing.fx'),
      evidenceRefs: refs(p.evidenceRefs, 'processing.evidenceRefs'),
    },
    pitch: {
      displayedPercent: number(pitch.displayedPercent, 'pitch.displayedPercent'),
      supportedRangePercent: range(pitch.supportedRangePercent),
    },
    analysis: {
      measuredFrequencyHz: number(m.measuredFrequencyHz, 'analysis.measuredFrequencyHz', { min: Number.MIN_VALUE }),
      method: text(m.method, 'analysis.method'),
      methodVersion: text(m.methodVersion, 'analysis.methodVersion'),
      units: { frequency: 'Hz', speed: 'percent', displayDifference: 'percentage_points' },
      uncertainty: {
        expandedPercentagePoints: number(uncertainty.expandedPercentagePoints, 'analysis.uncertainty.expandedPercentagePoints', { min: Number.MIN_VALUE }),
        method: text(uncertainty.method, 'analysis.uncertainty.method'),
        evidenceRefs: refs(uncertainty.evidenceRefs, 'analysis.uncertainty.evidenceRefs'),
      },
    },
    quality: {
      origin: 'caller_supplied_not_verified',
      flags: Object.fromEntries(CDJ_QUALITY_FLAGS.map(k => {
        if (flags[k] != null && typeof flags[k] !== 'boolean') throw new TypeError(`quality.flags.${k} must be boolean or null`);
        return [k, flags[k] ?? null];
      })),
      evidenceRefs: refs(q.evidenceRefs, 'quality.evidenceRefs'),
    },
  };
  const missing = [];
  const needs = [
    ['run_id_unknown', normalized.runId], ['asset_id_unknown', normalized.asset.assetId],
    ['model_unknown', normalized.asset.model], ['firmware_unknown', normalized.asset.firmware && normalized.asset.firmware.toLowerCase() !== 'unknown'],
    ['reference_identity_unknown', normalized.source.referenceId],
    ['reference_hash_unknown', normalized.source.referenceHashSha256],
    ['reference_version_unknown', normalized.source.referenceVersion],
    ['source_medium_unknown', normalized.source.medium],
    ['capture_backend_unknown', normalized.capture.backend],
    ['capture_device_unknown', normalized.capture.deviceName],
    ['capture_routing_unknown', normalized.capture.routing],
    ['processing_unknown', normalized.processing.keylock !== 'unknown' && normalized.processing.fx !== 'unknown'],
    ['analysis_method_unknown', normalized.analysis.method],
    ['uncertainty_method_unknown', normalized.analysis.uncertainty.method],
  ];
  for (const [reason, value] of needs) if (!value) missing.push(reason);
  normalized.qualification = {
    status: 'unverified',
    eligibleForReport: false,
    measurement: null,
    reasons: ['capture_reference_and_method_not_independently_validated', ...missing],
  };
  return normalized;
}

/** JSON transport only; does not write SQLite or register a report. */
export function serializeCdjEvidenceRecord(record) {
  if (record?.schemaVersion !== CDJ_EVIDENCE_SCHEMA) throw new RangeError('unsupported CDJ evidence schema');
  return JSON.stringify(createCdjEvidenceRecord(record));
}

/** Rebuild derived/qualification fields: serialized claims cannot grant eligibility. */
export function deserializeCdjEvidenceRecord(json) {
  if (typeof json !== 'string' || json.length > 131072) throw new RangeError('invalid CDJ evidence JSON length');
  const parsed = JSON.parse(json);
  if (parsed?.schemaVersion !== CDJ_EVIDENCE_SCHEMA) throw new RangeError('unsupported CDJ evidence schema');
  return createCdjEvidenceRecord(parsed);
}
