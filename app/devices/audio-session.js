// Orchestrates one output-quality measurement (SPEC-35): record first, play the stimulus,
// analyse. Dependencies are injected so the whole sequence is testable without hardware.
import { buildStimulus, analyzeAudioQuality, evaluateAudioQuality, issueFindings, profileSpecNotes } from '../audio-quality.js';

export class AudioSessionError extends Error {
  constructor(code, message) { super(message); this.name = 'AudioSessionError'; this.code = code; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * deps: {out: audio-out bridge, capture: async ({deviceName, durationSec, pairs, holder}) => {audio:{left,right,sampleRate}}}
 * Returns {analysis, evaluation, measurements, findings, status, detail, extra}.
 */
export async function runQualitySession({ out, capture, outputDevice = null, inputDevice = null, pairs = null, playLevelDbfs = -12, sampleRate = 48000, chainFloor = null, calibrated = false, profile = null, onPhase = () => {}, leadMs = 400, wait = sleep } = {}) {
  if (!out?.supported) throw new AudioSessionError('unsupported', 'The output-quality test needs the DeckChek desktop app.');
  const stim = buildStimulus({ sampleRate, playLevelDbfs });
  const level = Math.min(playLevelDbfs, -12);
  const total = stim.meta.durationSec;
  onPhase('recording');
  const recording = capture({ deviceName: inputDevice, durationSec: total + 2, pairs, holder: 'device-audio-quality' });
  recording.catch(() => {}); // surfaced by the await below
  let handle = null;
  try {
    await wait(leadMs);
    onPhase('playing');
    const info = await out.playBuffer({ sampleRate, left: stim.left, right: stim.right }, { levelDbfs: level, loop: false }, { device: outputDevice });
    handle = info?.handle ?? info?.id ?? null;
    await wait(Math.round(total * 1000) + 300);
  } catch (error) {
    await out.stop(handle).catch(() => {});
    throw error; // the clip ends on its own timer; its rejection is already swallowed above
  }
  await out.stop(handle).catch(() => {});
  onPhase('analysing');
  const cap = await recording;
  const audio = cap?.audio || cap;
  const meta = buildStimulus({ sampleRate: audio.sampleRate || sampleRate, playLevelDbfs: level }).meta;
  const analysis = analyzeAudioQuality({ left: audio.left, right: audio.right, sampleRate: audio.sampleRate || sampleRate }, meta, { chainFloor, calibrated });
  if (!analysis.valid) {
    const findings = issueFindings(analysis.issues);
    return { analysis, evaluation: null, measurements: [], findings, status: 'unknown', detail: analysis.issues[0]?.message || 'The recording could not be analysed.', extra: { issues: analysis.issues, outputDevice, inputDevice } };
  }
  const evaluation = evaluateAudioQuality(analysis.measurements);
  const findings = [...evaluation.findings, ...issueFindings(analysis.issues), ...(profile ? profileSpecNotes(profile) : [])];
  return {
    analysis, evaluation, measurements: analysis.measurements, findings, status: evaluation.status, detail: evaluation.detail,
    extra: { response: analysis.response, separation: analysis.separation, outputDevice, inputDevice, playLevelDbfs: level, sampleRate: audio.sampleRate || sampleRate, calibrated, thresholds: evaluation.results.map(r => ({ id: r.threshold.id, status: r.status, detail: r.detail })) },
  };
}
