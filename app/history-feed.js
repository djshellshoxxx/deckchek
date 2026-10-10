// History feed (M6 cross-links): maps the run lists of the M6 features (hum hunter, latency, scratch test, wear map,
// pre-gig) onto one row shape so History can show them beside diagnostic runs and filter by type. Pure and DOM-free;
// the Tauri commands are injected so tests and the browser preview can run without a backend.
//
// Row: { id, type, rawId, title, startedAt, status, score, meta, screen, feature }
//   id     "<type>:<rawId>", unique in the list (diagnostic runs keep their plain id)
//   status pass | warn | fail | review | info  (same vocabulary as the chip component)

export const RUN_TYPES = Object.freeze([
  { id: 'diagnostic', label: 'Diagnostics' },
  { id: 'hum', label: 'Hum hunter', screen: 'hum', feature: 'humHunter' },
  { id: 'latency', label: 'Latency', screen: 'latency', feature: 'latencyTuner' },
  { id: 'scratch', label: 'Scratch test', screen: 'scratch', feature: 'scratchTest' },
  { id: 'wearmap', label: 'Wear map', screen: 'vinylscan', feature: 'wearMap' },
  { id: 'pregig', label: 'Pre-gig check', screen: 'pregig', feature: 'pregig' },
]);

export const typeInfo = id => RUN_TYPES.find(t => t.id === id) || null;
export const typeLabel = id => typeInfo(id)?.label || 'Run';

const fin = Number.isFinite;
const text = v => (typeof v === 'string' ? v.trim() : '');
const round = (v, d = 1) => (fin(v) ? Number(v.toFixed(d)) : null);
const iso = v => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

const PREGIG_STATUS = { green: 'pass', amber: 'warn', red: 'fail', incomplete: 'warn', cancelled: 'info' };
const PREGIG_WORD = { green: 'Ready', amber: 'Amber', red: 'Not ready', incomplete: 'Incomplete', cancelled: 'Cancelled' };
const WEAR_STATUS = { keep: 'pass', watch: 'review', other_side: 'warn', replace: 'fail', incomplete: 'info' };
const WEAR_WORD = { keep: 'Keep', watch: 'Watch', other_side: 'Use other side', replace: 'Replace', incomplete: 'Incomplete' };

const row = (type, rawId, fields) => ({ id: `${type}:${rawId}`, type, rawId: String(rawId), score: null, status: 'info', meta: '', ...fields, screen: typeInfo(type).screen, feature: typeInfo(type).feature });

export function mapHumRun(r) {
  if (!r?.id || !iso(r.createdAt)) return null;
  const parts = [r.mainsHz ? `${r.mainsHz} Hz mains` : null, fin(r.stepCount) ? `${r.stepCount} step${r.stepCount === 1 ? '' : 's'}` : null, r.onset ? 'feedback onset found' : null].filter(Boolean);
  return row('hum', r.id, { title: r.kind === 'feedback' ? 'Booth feedback' : 'Hum hunt', startedAt: r.createdAt, status: 'info', meta: [text(r.verdict), ...parts].filter(Boolean).join(' · ') });
}

export function mapLatencyRun(r) {
  if (!r?.id || !iso(r.createdAt)) return null;
  const stress = r.kind === 'stress';
  const verdict = text(r.verdict).toLowerCase();
  const status = stress ? (verdict === 'pass' ? 'pass' : verdict === 'fail' ? 'fail' : 'info') : 'info';
  const parts = [text(r.deviceName), fin(r.sampleRateHz) ? `${r.sampleRateHz} Hz` : null, fin(r.bufferFrames) ? `${r.bufferFrames} frames` : null,
    fin(r.measuredMs) ? `${round(r.measuredMs, 1)} ms measured` : null, fin(r.xruns) ? `${r.xruns} xrun${r.xruns === 1 ? '' : 's'}` : null, !stress ? null : verdict || null].filter(Boolean);
  return row('latency', r.id, { title: stress ? 'Buffer stress run' : 'Round-trip latency', startedAt: r.createdAt, status, meta: parts.join(' · ') });
}

export function mapScratchRun(r) {
  if (!r?.id || !iso(r.createdAt)) return null;
  const score = fin(r.score) ? Math.round(r.score) : null;
  const status = !r.completed ? 'info' : score === null ? 'info' : score >= 85 ? 'pass' : score >= 70 ? 'review' : score >= 50 ? 'warn' : 'fail';
  const parts = [text(r.format), fin(r.bpm) ? `${round(r.bpm, 0)} BPM` : null, fin(r.lockLosses) ? `${r.lockLosses} lock loss${r.lockLosses === 1 ? '' : 'es'}` : null, r.completed ? null : 'not completed'].filter(Boolean);
  return row('scratch', r.id, { title: 'Scratch stress test', startedAt: r.createdAt, status, score, meta: parts.join(' · ') });
}

export function mapWearScan(r) {
  if (!r?.id || !iso(r.createdAt)) return null;
  const parts = [WEAR_WORD[r.verdict] || null, text(r.format), fin(r.coverage) ? `${Math.round(r.coverage * 100)} % covered` : null, fin(r.binCount) ? `${r.binCount} bins` : null].filter(Boolean);
  return row('wearmap', r.id, { title: 'Control-vinyl wear map', startedAt: r.createdAt, status: WEAR_STATUS[r.verdict] || 'info', score: fin(r.score) ? Math.round(r.score * (r.score <= 1 ? 100 : 1)) : null, meta: parts.join(' · ') });
}

export function mapPregigRun(r) {
  if (!r?.id || !iso(r.startedAt)) return null;
  const name = text(r.notes).replace(/^Preset: /, '');
  const parts = [PREGIG_WORD[r.verdict] || null, fin(r.failCount) ? `${r.failCount} failed` : null, fin(r.warnCount) ? `${r.warnCount} warning${r.warnCount === 1 ? '' : 's'}` : null].filter(Boolean);
  return row('pregig', r.id, { title: name ? `Pre-gig check: ${name}` : 'Pre-gig check', startedAt: r.startedAt, status: PREGIG_STATUS[r.verdict] || 'info', meta: parts.join(' · ') });
}

const SOURCES = [
  { type: 'hum', cmd: 'hum_run_list', args: limit => ({ filter: { limit } }), map: mapHumRun },
  { type: 'latency', cmd: 'latency_run_list', args: limit => ({ filter: { limit } }), map: mapLatencyRun },
  { type: 'scratch', cmd: 'scratch_list', args: limit => ({ filter: { limit } }), map: mapScratchRun },
  { type: 'wearmap', cmd: 'wearmap_list', args: limit => ({ limit }), map: mapWearScan },
  { type: 'pregig', cmd: 'pregig_list_runs', args: limit => ({ limit }), map: mapPregigRun },
];

/**
 * Loads every feature list through `invoke`. Each source fails on its own: a missing command or database error
 * leaves that type empty and is reported in `errors`, never rejecting the whole load. Without `invoke`
 * (browser preview) there is nothing to load.
 * @returns {Promise<{rows: object[], errors: {type: string, message: string}[]}>}
 */
export async function loadFeatureRuns(invoke, { limit = 100, only = null } = {}) {
  if (typeof invoke !== 'function') return { rows: [], errors: [] };
  const errors = [];
  const lists = await Promise.all(SOURCES.filter(s => !only || only.includes(s.type)).map(async s => {
    try {
      const rows = await invoke(s.cmd, s.args(limit));
      return (Array.isArray(rows) ? rows : []).map(s.map).filter(Boolean);
    } catch (error) {
      errors.push({ type: s.type, message: String(error?.message ?? error) });
      return [];
    }
  }));
  return { rows: lists.flat().sort(byNewest), errors };
}

export const byNewest = (a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0);

/** Diagnostic run summaries (listRuns) in feed shape, so the list can be merged and filtered uniformly. */
export function diagnosticRow(r) {
  return { id: r.id, type: 'diagnostic', rawId: String(r.id), title: r.test || r.sessionType || 'Diagnostic', startedAt: r.startedAt, status: null, score: r.score ?? null, meta: '', screen: null, feature: null };
}

/** Merge diagnostics and feature rows (newest first) and apply the type filter ('' / 'all' = everything). */
export function mergeFeed(diagnostics, features, type = 'all') {
  const all = [...(diagnostics || []).map(diagnosticRow), ...(features || [])].sort(byNewest);
  return !type || type === 'all' ? all : all.filter(r => r.type === type);
}

/** Per-type counts for the filter control; types with no rows are still listed so the filter is predictable. */
export function typeCounts(diagnostics, features) {
  const counts = Object.fromEntries(RUN_TYPES.map(t => [t.id, 0]));
  counts.diagnostic = (diagnostics || []).length;
  for (const r of features || []) if (r.type in counts) counts[r.type] += 1;
  return counts;
}
