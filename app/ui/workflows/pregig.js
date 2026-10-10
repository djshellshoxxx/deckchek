// Pre-gig check controller and view model (FS-10). No DOM: the screen (ui/screens/pregig.js) renders what this
// module describes. The engine (pre-gig.js) decides pass/warn/fail; this file only decides how to say it:
// per-step status words, the verdict banner, honest "not measured" states (a deck whose input pair the audio
// interface does not offer is "no such input", never a failure), fix-it buttons, re-run merging and run comparison.

import {
  namesMatch, buildPlan, estimateBudgetMs, runPregig, rollUp, diffRuns, toRunInput, stepKind, stepDeck, PREGIG_STEPS,
} from '../../pre-gig.js';

export const PAIR_UNAVAILABLE_TEXT = 'This audio interface does not offer those inputs';

// ---------------------------------------------------------------- per-step presentation
const WORDS = {
  pass: 'Pass', warn: 'Warning', fail: 'Fail', error: 'Could not run', skipped: 'Skipped', unsupported: 'Desktop only', pending: 'Waiting', running: 'Checking',
};
const SKIP_WORDS = {
  'input-pair': 'No such input', blocked: 'Blocked', cancelled: 'Cancelled', user: 'Skipped', 'capture-busy': 'Input busy', 'needs-desktop': 'Desktop only', 'no-evidence': 'Not measured',
};
/** Chip tone for the shared status chip: pass | warn | fail | review | info. */
const TONE = { pass: 'pass', warn: 'warn', fail: 'fail', error: 'warn', unsupported: 'info', skipped: 'review' };
const SKIP_TONE = { 'input-pair': 'info', 'needs-desktop': 'info', user: 'review' };

/**
 * How one checklist row looks. `entry` is {state, result?} where state is pending | running | an engine state.
 * Returns {state, word, tone, kind, headline, detail, notMeasured}: `headline` is the one-line summary,
 * `detail` a second line (the engine's own wording when we replace it), `kind` is 'live' for pending/running.
 */
export function describeStep(entry) {
  const state = entry?.state || 'pending', r = entry?.result || null;
  if (state === 'pending' || state === 'running') return { state, word: WORDS[state], tone: 'live', kind: 'live', headline: '', detail: '', notMeasured: false };
  const reason = r?.reason || null;
  if (state === 'skipped') {
    const word = SKIP_WORDS[reason] || WORDS.skipped;
    const tone = SKIP_TONE[reason] || TONE.skipped;
    if (reason === 'input-pair') return { state, word, tone, kind: 'static', headline: PAIR_UNAVAILABLE_TEXT, detail: r.summary, notMeasured: true };
    return { state, word, tone, kind: 'static', headline: r?.summary || 'Skipped.', detail: '', notMeasured: true };
  }
  if (state === 'unsupported') return { state, word: WORDS.unsupported, tone: 'info', kind: 'static', headline: r?.summary || 'Runs in the Windows desktop app.', detail: '', notMeasured: true };
  return { state, word: WORDS[state] || state, tone: TONE[state] || 'info', kind: 'static', headline: r?.summary || '', detail: '', notMeasured: false };
}

/** Decks whose capture steps were skipped because their input pair is not on the interface: ['B']. */
export function pairUnavailableDecks(results) {
  const decks = [];
  for (const r of results || []) if (r.state === 'skipped' && r.reason === 'input-pair' && r.deck && !decks.includes(r.deck)) decks.push(r.deck);
  return decks;
}

// ---------------------------------------------------------------- verdict
const TITLES = { green: 'Ready to play', amber: 'Playable, with things to look at', red: 'Not ready', incomplete: 'Not fully checked', cancelled: 'Cancelled' };
const deckList = decks => (decks.length === 1 ? `deck ${decks[0]}` : `decks ${decks.join(' and ')}`);

/**
 * Banner content for a finished run: {level, tone, title, copy, notices, fixFirst}.
 * `level` is green | amber | red (incomplete shows as amber, cancelled as neutral).
 */
export function verdictView(run) {
  const roll = run?.rollup || rollUp(run?.results || [], { cancelled: !!run?.cancelled });
  const verdict = run?.verdict || roll.verdict;
  const decks = pairUnavailableDecks(run?.results);
  const notices = [];
  if (decks.length) notices.push(`${deckList(decks)[0].toUpperCase() + deckList(decks).slice(1)}: ${PAIR_UNAVAILABLE_TEXT}. It was not measured.`);
  let copy = roll.copy;
  const skippedRequired = (run?.results || []).filter(r => r.state === 'skipped' && r.required);
  if (verdict === 'incomplete' && skippedRequired.length && skippedRequired.every(r => r.reason === 'input-pair')) {
    copy = `Everything DeckChek could measure is fine, but the inputs for ${deckList(decks)} are not on this audio interface, so ${decks.length === 1 ? 'it was' : 'they were'} not checked. Choose the right input pair above, or check ${decks.length === 1 ? 'it' : 'them'} another way before you play.`;
    notices.length = 0; // the sentence above already says it
  }
  const tone = verdict === 'green' ? 'pass' : verdict === 'red' ? 'fail' : verdict === 'cancelled' ? 'info' : 'warn';
  return { level: roll.level, verdict, tone, title: TITLES[verdict] || 'Result', copy, notices, fixFirst: roll.top || [] };
}

// ---------------------------------------------------------------- fix-it buttons
/** Buttons for a step result: [{label, text, kind, ...action}], deduplicated. kind: info | retry | navigate | settings | preempt. */
export function fixButtons(result) {
  const out = [], seen = new Set();
  for (const f of result?.fix || []) {
    const key = `${f.label}|${f.action?.kind || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: f.label, text: f.text, kind: f.action?.kind || 'info', to: f.action?.to || null, target: f.action?.target || null, holder: f.action?.holder ?? null });
  }
  return out;
}

// ---------------------------------------------------------------- evidence table
const EVIDENCE_LABEL = {
  snrDb: ['Signal to noise', 'dB'], balanceDb: ['Left/right balance', 'dB'], phaseErrDeg: ['Phase error', '°'], speedErrPct: ['Speed error', '%'], carrierHz: ['Carrier', 'Hz'],
  dropouts: ['Dropouts', ''], format: ['Timecode format', ''], leftDbfs: ['Left level', 'dBFS'], rightDbfs: ['Right level', 'dBFS'], carrierDbfs: ['Carrier peak', 'dBFS'],
  mainsHz: ['Mains hum', 'Hz'], totalDbfs: ['Hum level', 'dBFS'], humToFloorDb: ['Hum above noise floor', 'dB'], marginDb: ['Hum below carrier', 'dB'], measuredOn: ['Measured on', ''],
  wanted: ['Expected', ''], found: ['Found', ''], deviceCount: ['Inputs listed', ''], sampleRate: ['Sample rate', 'Hz'], expectedRate: ['Expected rate', 'Hz'],
  software: ['Software', ''], running: ['Running', ''], crashAgeHours: ['Last crash', 'h ago'], eventDays: ['Event log window', 'days'], missing: ['Missing', ''], portCount: ['MIDI ports', ''], answer: ['Your answer', ''],
};
const titleCase = k => k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

/** Flatten a step's evidence into [{label, value}] for the details table (one level of nesting, arrays joined). */
export function evidenceRows(evidence) {
  const rows = [];
  const add = (key, v) => {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
    const [label, unit] = EVIDENCE_LABEL[key] || [titleCase(key), ''];
    const text = Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? (x.title || x.name || JSON.stringify(x)) : String(x))).join(', ')
      : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
    rows.push({ label, value: unit && !Array.isArray(v) && typeof v !== 'boolean' ? `${text} ${unit}`.replace(/ ([°%])$/, '$1') : text });
  };
  for (const [k, v] of Object.entries(evidence || {})) {
    if (k === 'format' && v && typeof v === 'object') add(k, v.name);
    else if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v)) add(k2, v2);
    else add(k, v);
  }
  return rows;
}

// ---------------------------------------------------------------- re-run helpers
const RERUNNABLE_SKIPS = new Set(['blocked', 'cancelled', 'capture-busy', 'no-evidence']);
/** Step ids worth re-running: failures, warnings, crashes and skips that a retry could change. */
export function rerunTargets(run) {
  return (run?.results || []).filter(r => r.state === 'fail' || r.state === 'warn' || r.state === 'error' || (r.state === 'skipped' && RERUNNABLE_SKIPS.has(r.reason))).map(r => r.stepId);
}

/** Replace the results for `ids` in `run` with those from `partial` and recompute the verdict. */
export function mergeRerun(run, partial, ids) {
  const fresh = new Map((partial?.results || []).filter(r => ids.includes(r.stepId)).map(r => [r.stepId, r]));
  const results = run.results.map(r => fresh.get(r.stepId) || r);
  const rollup = rollUp(results, { cancelled: !!partial?.cancelled });
  return {
    ...run, results, rollup, verdict: rollup.verdict, cancelled: !!partial?.cancelled, finishedAt: partial?.finishedAt || run.finishedAt,
    durationMs: (run.durationMs || 0) + (partial?.durationMs || 0), manualMs: (run.manualMs || 0) + (partial?.manualMs || 0), withinBudget: run.withinBudget && (partial?.withinBudget ?? true),
  };
}

// ---------------------------------------------------------------- comparison
const TREND_TEXT = { better: 'better', worse: 'worse' };
/** Human lines for diffRuns output: [{stepId, label, from, to, trend, text}] plus a headline. */
export function compareView(diff, labelOf = id => id) {
  const word = s => WORDS[s] || s;
  const lines = diff.changed.map(c => ({ stepId: c.stepId, label: labelOf(c.stepId), from: word(c.from), to: word(c.to), trend: c.trend, text: `${labelOf(c.stepId)}: ${word(c.from)} to ${word(c.to)} (${TREND_TEXT[c.trend]})` }));
  const same = diff.verdictFrom && diff.verdictFrom === diff.verdictTo;
  let headline;
  if (!lines.length && !diff.added.length && !diff.removed.length) headline = 'Nothing changed since the last check.';
  else headline = `${lines.length} ${lines.length === 1 ? 'check' : 'checks'} changed${same ? ', same overall result' : ''}.`;
  return { headline, lines, added: diff.added.map(labelOf), removed: diff.removed.map(labelOf), unchanged: diff.unchanged, verdictFrom: diff.verdictFrom, verdictTo: diff.verdictTo };
}

/** "Deck A timecode" style label for a step id, from the catalogue. */
export function stepLabel(id) {
  const def = PREGIG_STEPS.find(s => s.kind === stepKind(id));
  const deck = stepDeck(id);
  return deck ? `${def?.label || id}, deck ${deck}` : (def?.label || id);
}

export const runNotes = preset => `Preset: ${preset.name}`;
/** Does a saved run summary belong to `preset`? Built-ins are saved without a preset id, so they match by notes. */
export function runMatchesPreset(run, preset) {
  if (!preset) return false;
  if (run.presetId && run.presetId === preset.id) return true;
  return run.notes === runNotes(preset);
}

export function durationText(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

/** "About 55 s, plus the headphone check" for the enabled steps of a plan. */
export function estimateText(plan) {
  const ms = estimateBudgetMs(plan), manual = plan.some(s => s.enabled && s.manual);
  return `About ${durationText(Math.ceil(ms / 5000) * 5000)}${manual ? ', plus the headphone check' : ''}`;
}

// ---------------------------------------------------------------- gear profiles
/**
 * The device profiles that belong to this rig: those the preset names in profileIds, plus any whose model or
 * driver name matches the preset's interface or mixer. The system and software steps judge only these, so an
 * unplugged controller you do not use today cannot turn the check red.
 */
export function profilesForPreset(preset, all = []) {
  const ids = new Set(Object.values(preset?.profileIds || {}).flat());
  const wanted = [preset?.audioDevice, preset?.mixer].filter(Boolean);
  return (all || []).filter(p => ids.has(p.id) || wanted.some(w => namesMatch(p.model, w) || (p.drivers || []).some(d => (d.deviceNamePatterns || []).some(x => namesMatch(x, w)))));
}

// ---------------------------------------------------------------- controller
/**
 * Run state for one screen. `deps` are the engine dependencies (createNativeDeps(invoke) or {}); `ui` supplies
 * confirmPreempt(error) -> Promise<boolean>. Call `subscribe(fn)`; every change re-sends the state object.
 */
export function createPregigController({ api, deps = {}, ui = {}, profiles = () => [], appVersion = '0.0.0', now = () => Date.now() } = {}) {
  const listeners = new Set();
  const st = { phase: 'idle', preset: null, plan: [], steps: new Map(), run: null, abort: null, prompt: null, startedMs: 0, saved: null, error: null, previous: null, compare: null, rerunning: null };
  const emit = () => listeners.forEach(fn => fn(st));
  const closePrompt = value => { const p = st.prompt; if (p) { st.prompt = null; p.resolve(value); } };

  const runDeps = () => ({
    ...deps,
    askHeadphones: () => new Promise(resolve => { st.prompt = { kind: 'headphones', resolve }; emit(); }),
    askNeedleUp: deck => new Promise(resolve => { st.prompt = { kind: 'needleUp', deck, resolve }; emit(); }),
    confirmPreempt: ui.confirmPreempt,
  });

  async function execute(preset, { skip = [], only = null } = {}) {
    const controller = new AbortController();
    st.abort = controller;
    try {
      return await runPregig({
        preset, deps: runDeps(), signal: controller.signal, skip, only, profiles: profilesForPreset(preset, profiles()), now,
        onStep: ({ stepId, state, result }) => { st.steps.set(stepId, { state, result }); emit(); },
      });
    } finally { st.abort = null; closePrompt('skip'); }
  }

  async function finishAndSave(run, preset) {
    st.run = run; st.phase = 'done'; st.compare = null;
    try {
      const input = toRunInput(run, { appVersion: typeof appVersion === 'function' ? await appVersion() : appVersion, notes: runNotes(preset) });
      st.previous = await findPrevious(preset);
      st.saved = await api.saveRun(input);
      st.error = null;
    } catch (e) { st.saved = null; st.error = `The result could not be saved to history: ${e?.message || e}`; }
    if (st.previous) st.compare = compareView(diffRuns({ verdict: st.previous.run.verdict, steps: st.previous.steps }, run), stepLabel);
    emit();
  }

  async function findPrevious(preset) {
    const runs = await api.listRuns(preset.builtin ? null : preset.id, 50);
    const hit = (runs || []).find(r => runMatchesPreset(r, preset) && r.verdict !== 'cancelled');
    return hit ? api.getRun(hit.id) : null;
  }

  return {
    state: st,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    isRunning: () => st.phase === 'running',
    /** Start a full run. `skip` = step ids the user unticked. */
    async start(preset, { skip = [] } = {}) {
      if (st.phase === 'running') return null;
      st.preset = preset; st.plan = buildPlan(preset, { skip }); st.run = null; st.saved = null; st.error = null; st.compare = null; st.previous = null;
      st.steps = new Map(st.plan.map(s => [s.id, { state: s.enabled ? 'pending' : 'skipped', result: s.enabled ? null : undefined }]));
      st.phase = 'running'; st.startedMs = now(); emit();
      let run;
      try { run = await execute(preset, { skip }); } catch (e) { st.phase = 'idle'; st.error = `The check could not start: ${e?.message || e}`; emit(); return null; }
      await finishAndSave(run, preset);
      return run;
    },
    /** Esc / Cancel: remaining steps become skipped (cancelled) and partial results are kept. */
    cancel() { if (st.phase !== 'running') return false; st.abort?.abort(); closePrompt('skip'); emit(); return true; },
    /** Re-run some steps and merge them into the current result. */
    async rerun(ids, { preempt = false } = {}) {
      if (st.phase === 'running' || !st.run || !ids.length) return null;
      st.phase = 'running'; st.rerunning = ids; st.startedMs = now();
      for (const id of ids) st.steps.set(id, { state: 'pending', result: null });
      emit();
      let partial;
      try {
        if (preempt) await deps.preempt?.();
        partial = await execute(st.preset, { only: ids });
      } catch (e) { st.phase = 'done'; st.rerunning = null; st.error = `The re-run failed: ${e?.message || e}`; emit(); return null; }
      st.rerunning = null;
      const merged = mergeRerun(st.run, partial, ids);
      for (const r of merged.results) st.steps.set(r.stepId, { state: r.state, result: r });
      await finishAndSave(merged, st.preset);
      return merged;
    },
    /** Answer the manual prompt: headphones 'yes' | 'no' | 'skip'; needle-up true | false. */
    answer(value) { closePrompt(value); emit(); },
    reset() { if (st.phase === 'running') return; st.phase = 'idle'; st.run = null; st.steps = new Map(); st.saved = null; st.compare = null; st.error = null; emit(); },
    async compareWith(detail) {
      if (!st.run || !detail) return null;
      st.compare = compareView(diffRuns({ verdict: detail.run.verdict, steps: detail.steps }, st.run), stepLabel);
      emit(); return st.compare;
    },
  };
}
