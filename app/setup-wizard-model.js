// First-run setup wizard model (FS-01 §4, §6): pure state machine, no DOM and no storage.
// The UI layer persists `serializeWizardState(state)` through the wizard_state_* commands (or the
// app_state fallback) and feeds `env` describing the runtime.

export const WIZARD_VERSION = 1;
export const STATUSES = Object.freeze(['none', 'in_progress', 'skipped', 'completed']);
export const SAMPLE_RATES = Object.freeze([44100, 48000, 96000]);
export const DEFAULT_SAMPLE_RATE = 48000;
export const RESUME_MAX_AGE_DAYS = 30;
export const TONE_DEFAULT_DBFS = -20;
export const TONE_MAX_DBFS = -12; // hard UI cap (FS-00 ABS_MAX_DBFS)
export const LEVEL_CLIP_DBFS = -1;
export const LEVEL_LOW_DBFS = -40;
export const LEVEL_IMBALANCE_DB = 3;
export const MAX_OWNED = 500;

export const STEP_IDS = Object.freeze(['welcome', 'interface', 'levels', 'calibration', 'gear', 'health', 'summary']);
export const STEP_TITLES = Object.freeze({
  welcome: 'Welcome', interface: 'Interface and I/O', levels: 'Test tone and levels', calibration: 'Loopback calibration',
  gear: 'Your gear', health: 'System Health quick scan', summary: 'Summary',
});
const DAY_MS = 86_400_000;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isoOrNull = v => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const finite = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Step ids for a runtime. `env.systemHealth` false (browser / non-Windows) drops the health step (AC-7). */
export function stepsFor(env) {
  return STEP_IDS.filter(id => id !== 'health' || env?.systemHealth === true);
}

export const CALIBRATION_VALUES = Object.freeze(['skipped', 'done', 'existing']);
export const LEVEL_VERDICTS = Object.freeze(['ok', 'low', 'clip']);

export function emptyAnswers() {
  return {
    inputDevice: '', outputDevice: '', sampleRate: DEFAULT_SAMPLE_RATE, levelCheck: null,
    calibration: null, ownedProductIds: [], health: null, skippedSteps: [],
  };
}

/**
 * Whitelist and type-check answers; unknown keys are dropped so stored state cannot grow without bound.
 * Only keys present in `raw` are applied; an invalid value keeps the one from `base` (explicit null clears
 * levelCheck, calibration and health).
 */
export function sanitizeAnswers(raw, steps = STEP_IDS, base = emptyAnswers()) {
  const out = { ...emptyAnswers(), ...structuredClone(base) };
  if (!isObj(raw)) return out;
  const has = k => Object.hasOwn(raw, k);
  if (has('inputDevice') && typeof raw.inputDevice === 'string') out.inputDevice = str(raw.inputDevice);
  if (has('outputDevice') && typeof raw.outputDevice === 'string') out.outputDevice = str(raw.outputDevice);
  if (has('sampleRate') && SAMPLE_RATES.includes(raw.sampleRate)) out.sampleRate = raw.sampleRate;
  if (has('levelCheck')) {
    if (raw.levelCheck === null) out.levelCheck = null;
    else if (isObj(raw.levelCheck)) {
      const peakDbfs = finite(raw.levelCheck.peakDbfs);
      if (peakDbfs !== null && LEVEL_VERDICTS.includes(raw.levelCheck.verdict)) out.levelCheck = { peakDbfs, verdict: raw.levelCheck.verdict };
    }
  }
  if (has('calibration') && (raw.calibration === null || CALIBRATION_VALUES.includes(raw.calibration))) out.calibration = raw.calibration;
  if (has('ownedProductIds') && Array.isArray(raw.ownedProductIds)) {
    const seen = new Set();
    for (const id of raw.ownedProductIds) {
      if (typeof id === 'string' && id.trim() && id.length <= 128) seen.add(id.trim());
      if (seen.size >= MAX_OWNED) break;
    }
    out.ownedProductIds = [...seen].sort();
  }
  if (has('health')) {
    if (raw.health === null) out.health = null;
    else if (isObj(raw.health)) {
      const errors = finite(raw.health.errors), warnings = finite(raw.health.warnings);
      if (errors !== null && warnings !== null && errors >= 0 && warnings >= 0) out.health = { errors: Math.floor(errors), warnings: Math.floor(warnings) };
    }
  }
  if (has('skippedSteps') && Array.isArray(raw.skippedSteps)) out.skippedSteps = [...new Set(raw.skippedSteps.filter(x => steps.includes(x)))];
  if (has('autoCompleted')) { if (raw.autoCompleted === true) out.autoCompleted = true; else delete out.autoCompleted; }
  return out;
}

export function initialWizardState() {
  return { version: WIZARD_VERSION, status: 'none', step: 1, answers: emptyAnswers(), completedAt: null, updatedAt: null };
}

/**
 * Upgrade whatever was stored to the current shape. Never throws: unusable input or a version newer than
 * this build understands resets to `none`. Accepts both the wizard_state_get shape and the raw app_state value.
 */
export function migrateWizardState(raw) {
  try {
    if (!isObj(raw)) return initialWizardState();
    const version = raw.version === undefined ? WIZARD_VERSION : raw.version;
    if (!Number.isInteger(version) || version < 0 || version > WIZARD_VERSION) return initialWizardState();
    const status = STATUSES.includes(raw.status) ? raw.status : 'none';
    if (status === 'none') return initialWizardState();
    const step = Number.isInteger(raw.step) && raw.step >= 1 && raw.step <= STEP_IDS.length ? raw.step : 1;
    return {
      version: WIZARD_VERSION, status, step, answers: sanitizeAnswers(raw.answers),
      completedAt: isoOrNull(raw.completedAt), updatedAt: isoOrNull(raw.updatedAt),
    };
  } catch { return initialWizardState(); }
}

/** The payload for wizard_state_save. */
export function serializeWizardState(state) {
  const s = migrateWizardState(state);
  return { status: s.status === 'none' ? 'in_progress' : s.status, step: s.step, answers: s.answers };
}

const stamp = now => (now instanceof Date ? now.toISOString() : typeof now === 'string' ? now : new Date(now ?? Date.now()).toISOString());

function clampStep(step, count) { return Math.min(Math.max(Math.trunc(step) || 1, 1), count); }

/** Current step id for a state under a given env (the stored number is clamped into the list). */
export function currentStepId(state, env) {
  const steps = stepsFor(env);
  return steps[clampStep(state.step, steps.length) - 1];
}

function withSkipped(answers, id, skipped) {
  const rest = answers.skippedSteps.filter(s => s !== id);
  return { ...answers, skippedSteps: skipped ? [...rest, id] : rest };
}

/**
 * Pure transition. Actions (all optional fields in brackets):
 *  start {env, [now]}      begin from step 1, keeping any prefilled answers (also "Run setup again", AC-8)
 *  resume {env, [now]}     continue an in_progress state at its stored step (AC-2)
 *  answer {patch}          merge answers (sanitized; skippedSteps is managed by next/skipStep only)
 *  next {env}              advance; the last step does not advance (use finish)
 *  back {env}              go back one step (not below 1)
 *  skipStep {env}          mark the current step skipped and advance (never skips past the last step)
 *  goto {step, env}        jump to a 1-based step, clamped (used by "Open Calibration screen" return)
 *  skipWizard {[now]}      Esc / "Skip setup" or banner "Dismiss": status=skipped, answers kept
 *  finish {[now]}          status=completed
 * Unknown actions and malformed payloads return the state unchanged; this never throws.
 */
export function reduceWizard(state, action) {
  try {
    const s = migrateWizardState(state);
    if (!isObj(action)) return state;
    const env = isObj(action.env) ? action.env : {};
    const steps = stepsFor(env);
    const at = () => stamp(action.now);
    const moveTo = (step, answers = s.answers) => ({ ...s, status: 'in_progress', step: clampStep(step, steps.length), answers, completedAt: null, updatedAt: at() });
    switch (action.type) {
      case 'start': {
        const answers = { ...s.answers, skippedSteps: [] };
        delete answers.autoCompleted;
        return { ...s, status: 'in_progress', step: 1, answers, completedAt: null, updatedAt: at() };
      }
      case 'resume':
        return s.status === 'in_progress' ? moveTo(s.step) : state;
      case 'answer': {
        if (!isObj(action.patch) || (s.status !== 'in_progress')) return state;
        const { skippedSteps: _s, autoCompleted: _a, ...patch } = action.patch;
        return { ...s, answers: sanitizeAnswers(patch, STEP_IDS, s.answers), updatedAt: at() };
      }
      case 'next':
        if (s.status !== 'in_progress') return state;
        return moveTo(Math.min(s.step + 1, steps.length), withSkipped(s.answers, steps[clampStep(s.step, steps.length) - 1], false));
      case 'back':
        if (s.status !== 'in_progress') return state;
        return moveTo(s.step - 1);
      case 'skipStep': {
        if (s.status !== 'in_progress') return state;
        const idx = clampStep(s.step, steps.length);
        if (idx >= steps.length) return state; // the summary cannot be skipped
        return moveTo(idx + 1, withSkipped(s.answers, steps[idx - 1], true));
      }
      case 'goto':
        if (s.status !== 'in_progress' || !Number.isFinite(action.step)) return state;
        return moveTo(action.step);
      case 'skipWizard':
        return s.status === 'completed' ? state : { ...s, status: 'skipped', completedAt: null, updatedAt: at() };
      case 'finish':
        if (s.status !== 'in_progress') return state;
        return { ...s, status: 'completed', step: steps.length, completedAt: at(), updatedAt: at() };
      default:
        return state;
    }
  } catch { return state; }
}

/** `restore` when an in_progress state is recent enough, `restart` when it is stale, else `none`. */
export function resumeDecision(state, now = Date.now()) {
  const s = migrateWizardState(state);
  if (s.status !== 'in_progress') return 'none';
  const t = s.updatedAt ? Date.parse(s.updatedAt) : NaN;
  const ts = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(t) || !Number.isFinite(ts)) return 'restart';
  return ts - t <= RESUME_MAX_AGE_DAYS * DAY_MS ? 'restore' : 'restart';
}

/**
 * What to do when the app starts (AC-1, AC-2, AC-10).
 * `stored` is the saved state (any shape), `hasUserData` whether the DB holds a run or an asset, `enabled` the
 * `features.setupWizard` flag. Returns {action: 'none'|'open'|'resume-banner'|'restart-banner'|'auto-complete', state}.
 */
export function startupDecision({ stored, hasUserData = false, enabled = true, now = Date.now() } = {}) {
  const s = migrateWizardState(stored);
  if (!enabled) return { action: 'none', state: s };
  if (s.status === 'none') {
    if (hasUserData) {
      const at = stamp(now);
      return { action: 'auto-complete', state: { ...s, status: 'completed', step: STEP_IDS.length, answers: { ...s.answers, autoCompleted: true }, completedAt: at, updatedAt: at } };
    }
    return { action: 'open', state: s };
  }
  if (s.status === 'in_progress') return { action: resumeDecision(s, now) === 'restore' ? 'resume-banner' : 'restart-banner', state: s };
  return { action: 'none', state: s };
}

/** Level verdict from a 3 s window of per-channel peak/RMS linear amplitudes (0..1). */
export function levelVerdict({ peakLeft = 0, peakRight = 0, rmsLeft = 0, rmsRight = 0 } = {}) {
  const db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  const peak = Math.max(peakLeft, peakRight);
  const peakDbfs = db(peak);
  const rl = db(rmsLeft), rr = db(rmsRight);
  const imbalanceDb = Number.isFinite(rl) && Number.isFinite(rr) ? Math.abs(rl - rr) : null;
  const imbalance = imbalanceDb !== null && imbalanceDb > LEVEL_IMBALANCE_DB;
  let verdict = 'ok';
  if (peakDbfs >= LEVEL_CLIP_DBFS) verdict = 'clip';
  else if (peakDbfs < LEVEL_LOW_DBFS) verdict = 'low';
  const rounded = Number.isFinite(peakDbfs) ? Math.round(peakDbfs * 10) / 10 : -Infinity;
  const text = {
    clip: `Input peaks at ${fmt(rounded)} dBFS and is clipping. Lower the interface gain.`,
    low: `Input peaks at ${fmt(rounded)} dBFS, which is low. Raise the interface gain or check the phono/line switch.`,
    ok: `Input peaks at ${fmt(rounded)} dBFS, good.`,
  }[verdict];
  return { verdict, peakDbfs: rounded, imbalance, imbalanceDb: imbalanceDb === null ? null : Math.round(imbalanceDb * 10) / 10, text: imbalance ? `${text} Left and right differ by more than ${LEVEL_IMBALANCE_DB} dB.` : text };
}
const fmt = n => (Number.isFinite(n) ? n.toFixed(1).replace('-', '−') : '−∞');

/** Tone level the UI may play: default -20 dBFS, never above -12 dBFS, non-numbers fall back to the default. */
export function toneLevelDbfs(requested) {
  const n = finite(requested);
  return n === null ? TONE_DEFAULT_DBFS : Math.min(n, TONE_MAX_DBFS);
}

/** Pick the calibration default from a profile-applicability result (AC-5): existing profile defaults to Skip. */
export function calibrationDefault(profileApplicable) {
  return profileApplicable ? 'existing' : null;
}

/** Summary table rows for the last step and the "Copy summary" button; tolerates missing answers. */
export function summarize(state, env) {
  const s = migrateWizardState(state);
  const a = s.answers;
  const steps = stepsFor(env ?? {});
  const skipped = id => a.skippedSteps.includes(id);
  const calibrationText = a.calibration === 'done' ? 'Calibrated' : a.calibration === 'existing' ? 'Already calibrated' : 'Not calibrated (results will show wider uncertainty)';
  const rows = [
    { id: 'input', label: 'Input', value: a.inputDevice || 'Not chosen' },
    { id: 'output', label: 'Output', value: a.outputDevice || 'System default' },
    { id: 'sampleRate', label: 'Sample rate', value: `${a.sampleRate / 1000} kHz` },
    { id: 'levels', label: 'Input level', value: a.levelCheck ? `${a.levelCheck.verdict === 'ok' ? 'OK' : a.levelCheck.verdict === 'clip' ? 'Clipping' : 'Low'} (peak ${a.levelCheck.peakDbfs} dBFS)` : skipped('levels') ? 'Skipped' : 'Not checked' },
    { id: 'calibration', label: 'Calibration', value: calibrationText },
    { id: 'gear', label: 'Owned gear', value: a.ownedProductIds.length ? `${a.ownedProductIds.length} product${a.ownedProductIds.length === 1 ? '' : 's'}` : 'None selected' },
  ];
  if (steps.includes('health')) {
    rows.push({ id: 'health', label: 'System Health', value: a.health ? `${a.health.errors} error${a.health.errors === 1 ? '' : 's'}, ${a.health.warnings} warning${a.health.warnings === 1 ? '' : 's'}` : 'Not scanned' });
  }
  return { rows, text: ['DeckChek setup summary', ...rows.map(r => `${r.label}: ${r.value}`)].join('\n'), skippedSteps: [...a.skippedSteps] };
}

/** Announcement for the aria-live region on a step change. */
export function stepAnnouncement(state, env) {
  const steps = stepsFor(env);
  const idx = clampStep(migrateWizardState(state).step, steps.length);
  return `Step ${idx} of ${steps.length}: ${STEP_TITLES[steps[idx - 1]]}`;
}
