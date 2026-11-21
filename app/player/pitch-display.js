// CDJ-04: provisional reference-tone/display comparison, deliberately isolated
// from capture, UI, model identity, hardware validation, and report persistence.
const REQUIRED_QUALITY = Object.freeze([
  ['referenceIdentityVerified', 'reference_identity_unverified'],
  ['clippingExcluded', 'clipping_not_excluded'],
  ['durationAdequate', 'duration_unverified'],
  ['toneStable', 'tone_stability_unverified'],
  ['processingDisabled', 'processing_state_unverified'],
  ['capturePathVerified', 'capture_path_unverified'],
]);

/**
 * Compare a user-entered CDJ pitch-display reading with a verified tone ratio.
 * All quality and uncertainty inputs are evidence supplied by the caller; this
 * helper does not detect clipping, validate a tone or calibrate capture clocks.
 * Missing/negative evidence suppresses metrics rather than returning a verdict.
 */
export function assessCdjPitchDisplay({
  referenceFrequencyHz,
  measuredFrequencyHz,
  displayedPercent,
  supportedRangePercent,
  quality,
  expandedUncertaintyPercentagePoints,
  uncertaintyMethod,
} = {}) {
  const exclusions = [];
  if (!Number.isFinite(referenceFrequencyHz) || referenceFrequencyHz <= 0 ||
      !Number.isFinite(measuredFrequencyHz) || measuredFrequencyHz <= 0) {
    exclusions.push('invalid_reference_or_measured_frequency');
  }
  if (!Number.isFinite(displayedPercent)) exclusions.push('invalid_displayed_percent');
  const range = supportedRangePercent;
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) {
    exclusions.push('supported_pitch_range_unverified');
  } else if (Number.isFinite(displayedPercent) && (displayedPercent < range.min || displayedPercent > range.max)) {
    exclusions.push('display_outside_supported_range');
  }
  for (const [flag, reason] of REQUIRED_QUALITY) {
    if (quality?.[flag] !== true) exclusions.push(reason);
  }
  if (!Number.isFinite(expandedUncertaintyPercentagePoints) || expandedUncertaintyPercentagePoints <= 0 ||
      typeof uncertaintyMethod !== 'string' || !uncertaintyMethod.trim()) {
    exclusions.push('measurement_uncertainty_unverified');
  }
  // Do not derive metrics from caller values already rejected by the input checks.
  if (exclusions.length) return { eligibleForReport: false, exclusions, measurement: null };
  const frequencyRatio = measuredFrequencyHz / referenceFrequencyHz;
  const speedPercent = 100 * (frequencyRatio - 1);
  if (!Number.isFinite(frequencyRatio) || frequencyRatio <= 0 || !Number.isFinite(speedPercent)) {
    return { eligibleForReport: false, exclusions: ['invalid_frequency_ratio'], measurement: null };
  }
  const displayErrorPercentagePoints = speedPercent - displayedPercent;
  if (!Number.isFinite(displayErrorPercentagePoints)) {
    return { eligibleForReport: false, exclusions: ['invalid_display_error'], measurement: null };
  }
  return {
    eligibleForReport: true,
    exclusions: [],
    measurement: {
      method: 'reference_frequency_ratio_v1',
      referenceFrequencyHz,
      measuredFrequencyHz,
      displayedPercent,
      supportedRangePercent: { min: range.min, max: range.max },
      measuredSpeedPercent: speedPercent,
      displayErrorPercentagePoints,
      expandedUncertaintyPercentagePoints,
      uncertaintyMethod: uncertaintyMethod.trim(),
    },
  };
}
