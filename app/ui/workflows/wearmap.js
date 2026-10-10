// FS-13 wear-map workflow: control-vinyl copies and sides (desktop commands or a localStorage fallback),
// scanning a side live (FS-00 streaming capture) or from a recording, draft autosave, turning a scanner
// result into a saved scan with its verdict context, and the models the screen renders (progress, compare,
// recommendation, inspector rows). Everything numeric comes from app/wear-map.js; this file holds no DOM.

import {
  createScanner, startWearScan, verdict, scanCoverage, toScanRecord, sideDurationSec, classifyBin, binLabel, compareScans,
  worstBins, formatTime, createWearMapApi, FLAGS, DEFAULT_GEOMETRY, DEFAULT_TURNS, WEAR_DEFAULTS, VERDICT_LABELS, NOISE_DB,
} from '../../wear-map.js';
import { TIMECODE_FORMATS, findFormat } from '../../timecode.js';

export const RECORDS_KEY = 'deckchek.wearmap.records.v1';
export const DRAFT_KEY = 'deckchek.wearmap.draft.v1';
export const PREFS_KEY = 'deckchek.wearmap.prefs.v1';
export const HOLDER = 'wear-map';
export const AUTOSAVE_SEC = 30;

const fin = Number.isFinite;
const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? null;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const round = (x, d = 1) => (fin(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

/** Formats a control vinyl can carry: quadrature formats with a known carrier, vinyl sides first. */
export function scanFormats(formats = TIMECODE_FORMATS) {
  return formats.filter(f => fin(f.carrierHz));
}

/** Default sides for a new copy of `format` from the xwax side table (FS-06), or A/B with unknown length. */
export function defaultSides(format, { formats = TIMECODE_FORMATS } = {}) {
  const f = typeof format === 'string' ? findFormat(format, formats) : format;
  const rpm = f?.atRpm || 33.333333;
  const sides = (f?.sides || []).filter(s => !/cd/i.test(s.label));
  if (!sides.length) return [{ id: null, sideLabel: 'A', nominalRpm: rpm, expectedDurationSec: null }, { id: null, sideLabel: 'B', nominalRpm: rpm, expectedDurationSec: null }];
  return sides.map(s => ({ id: null, sideLabel: s.label, nominalRpm: rpm, expectedDurationSec: fin(s.durationSec) ? round(s.durationSec, 1) : null }));
}

/** Side length used for coverage and drawing: the side's own figure, else the format table, else null (unknown). */
export function sideLength(side, format, { formats = TIMECODE_FORMATS } = {}) {
  if (fin(side?.expectedDurationSec) && side.expectedDurationSec > 0) return side.expectedDurationSec;
  return sideDurationSec(format, side?.sideLabel, { formats, nominalRpm: side?.nominalRpm || 33.333333 });
}

/** Display name of a copy: "Serato CV02.5 · Deck 1". */
export const copyName = c => [c?.title, c?.nickname].filter(Boolean).join(' · ') || 'Control vinyl';

// ------------------------------------------------------------------ records store

function validateRecord(r) {
  const t = String(r?.title ?? '').trim(), f = String(r?.format ?? '').trim();
  if (!t || t.length > 120) throw new Error('Give the record a name (up to 120 characters).');
  if (!f || f.length > 80) throw new Error('Choose the timecode format.');
  if (String(r.nickname ?? '').trim().length > 120) throw new Error('The nickname is limited to 120 characters.');
  const sides = r.sides || [];
  if (!sides.length || sides.length > 4) throw new Error('A record has 1 to 4 sides.');
  const seen = new Set();
  for (const s of sides) {
    const l = String(s.sideLabel ?? '').trim();
    if (!l || l.length > 16) throw new Error('Each side needs a label (up to 16 characters).');
    if (seen.has(l.toLowerCase())) throw new Error(`Side ${l} appears twice.`);
    seen.add(l.toLowerCase());
    if (s.nominalRpm != null && !(fin(s.nominalRpm) && s.nominalRpm >= 1 && s.nominalRpm <= 100)) throw new Error('Speed must be between 1 and 100 rpm.');
    if (s.expectedDurationSec != null && !(fin(s.expectedDurationSec) && s.expectedDurationSec >= 1 && s.expectedDurationSec <= 7200)) throw new Error('Side length must be between 1 s and 2 h.');
  }
  return r;
}

/** Control-vinyl copies: Tauri wearmap_records_list / wearmap_record_save, or localStorage in browser mode. */
export function createRecordsApi({ invoke = nativeInvoke(), storage = globalThis.localStorage ?? null } = {}) {
  if (invoke) {
    return {
      native: true,
      list: async () => invoke('wearmap_records_list'),
      save: async record => invoke('wearmap_record_save', { record: validateRecord(record) }),
    };
  }
  const read = () => { try { const v = JSON.parse(storage?.getItem(RECORDS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const write = list => { try { storage?.setItem(RECORDS_KEY, JSON.stringify(list)); } catch { /* blocked storage: kept for this page only */ } };
  return {
    native: false,
    async list() { return read(); },
    async save(record) {
      validateRecord(record);
      const list = read();
      const prev = record.id ? list.find(c => c.id === record.id) : null;
      if (record.id && !prev) throw new Error(`Unknown control-vinyl copy '${record.id}'.`);
      const sides = [...(prev?.sides || [])];
      for (const s of record.sides) {
        const clean = { sideLabel: s.sideLabel.trim(), nominalRpm: s.nominalRpm ?? null, expectedDurationSec: s.expectedDurationSec ?? null };
        if (s.id) { const k = sides.findIndex(x => x.id === s.id); if (k < 0) throw new Error(`Side '${s.id}' does not belong to this copy.`); sides[k] = { ...sides[k], ...clean }; }
        else sides.push({ id: newId(), ...clean });
      }
      if (new Set(sides.map(s => s.sideLabel.toLowerCase())).size !== sides.length) throw new Error('Side labels must be unique within a copy.');
      const saved = { id: prev?.id || newId(), releaseId: prev?.releaseId || newId(), title: record.title.trim(), format: record.format.trim(),
        nickname: String(record.nickname ?? '').trim() || null, cleaningState: String(record.cleaningState ?? '').trim() || null, retired: Boolean(record.retired), sides };
      write(prev ? list.map(c => (c.id === saved.id ? saved : c)) : [...list, saved]);
      return saved;
    },
  };
}

// ------------------------------------------------------------------ drafts and prefs (per viewer, best effort)

/** Scope snippets are a live-session picture only: never written to the draft. */
const withoutScopes = draft => (draft?.result?.bins ? { ...draft, result: { ...draft.result, bins: draft.result.bins.map(({ scope, ...b }) => b) } } : draft);
export function saveDraft(storage, draft) { try { storage?.setItem(DRAFT_KEY, JSON.stringify({ ...withoutScopes(draft), savedAt: new Date().toISOString() })); return true; } catch { return false; } }

/** Inspector picture of one bin: min/max peak envelope of both channels (null when the bin has no snippet). */
export function scopeSvg(scope, { width = 240, height = 72 } = {}) {
  if (!scope?.cols || !Array.isArray(scope.l) || !Array.isArray(scope.r)) return null;
  const lane = (vals, y0, hh, cls) => {
    const mid = y0 + hh / 2, px = v => (mid - (v / 127) * (hh / 2)).toFixed(1);
    const up = [], down = [];
    for (let c = 0; c < scope.cols; c++) { const x = ((c + 0.5) * width / scope.cols).toFixed(1); up.push(`${x},${px(vals[2 * c + 1])}`); down.push(`${x},${px(vals[2 * c])}`); }
    return `<polygon class="${cls}" points="${up.join(' ')} ${down.reverse().join(' ')}"/>`;
  };
  const half = height / 2;
  return `<svg class="wm-scope" viewBox="0 0 ${width} ${height}" role="img" aria-label="Waveform of this bin: left channel on top, right channel below, one column per ${scope.cols}th of the bin">${lane(scope.l, 0, half - 2, 'wm-scope-l')}${lane(scope.r, half + 2, half - 2, 'wm-scope-r')}</svg>`;
}
export function loadDraft(storage) {
  try {
    const d = JSON.parse(storage?.getItem(DRAFT_KEY) || 'null');
    return d && Array.isArray(d.result?.bins) && d.recordSideId && d.format ? d : null;
  } catch { return null; }
}
export function clearDraft(storage) { try { storage?.removeItem(DRAFT_KEY); } catch { /* ignore */ } }
export function loadPrefs(storage) { try { return { metric: 'snr', showTable: false, ...(JSON.parse(storage?.getItem(PREFS_KEY) || '{}') || {}) }; } catch { return { metric: 'snr', showTable: false }; } }
export function savePrefs(storage, prefs) { try { storage?.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } }

// ------------------------------------------------------------------ scanning

/**
 * Scan a decoded recording ({left,right,sampleRate}) in 1 s slices, yielding to the UI between slices so the
 * map fills in and Cancel works. `signal.aborted` stops early and returns the partial result.
 */
export async function scanAudio(audio, { format, binSec = WEAR_DEFAULTS.binSec, nominalRpm, onBin = null, onProgress = null, signal = null, yieldEvery = 2, pause = () => new Promise(r => setTimeout(r, 0)) } = {}) {
  const sr = audio.sampleRate, s = createScanner({ format, sampleRate: sr, binSec, nominalRpm, onBin });
  const n = Math.min(audio.left.length, audio.right.length), step = sr;
  let k = 0;
  for (let i = 0; i < n; i += step) {
    if (signal?.aborted) break;
    s.push(audio.left.subarray(i, i + step), audio.right.subarray(i, i + step));
    try { onProgress?.({ elapsedSec: s.elapsedSec, bins: s.bins.length, totalSec: n / sr }); } catch { /* owner callback */ }
    if (++k % yieldEvery === 0) await pause();
  }
  return { result: s.finish(), cancelled: Boolean(signal?.aborted) };
}

/** Live scan through the FS-00 stream; startStreamSession is injected (wrapped in runWithCapture by the screen). */
export function startLiveScan({ startStreamSession, deviceName = null, sampleRate = null, format, binSec, nominalRpm, onBin, onProgress, onAutosave, onEnd }) {
  return startWearScan({ startStreamSession, holder: HOLDER, deviceName, sampleRate, blockMs: 1000, format, binSec, nominalRpm, autosaveSec: AUTOSAVE_SEC, onBin, onProgress, onAutosave, onEnd });
}

/** Live progress: share of the side by time, groove position (mm from centre) and running class counts. */
export function progressModel({ elapsedSec = 0, sideSec = null, bins = [], geometry = DEFAULT_GEOMETRY } = {}) {
  const counts = { good: 0, degraded: 0, bad: 0, interrupted: 0 };
  for (const b of bins) counts[b.cls || classifyBin(b)]++;
  const frac = fin(sideSec) && sideSec > 0 ? Math.min(1, elapsedSec / sideSec) : null;
  const posMm = frac == null ? null : geometry.outerMm - (geometry.outerMm - geometry.innerMm) * frac;
  const noLock = bins.filter(b => (b.reasons || []).some(r => r === 'no-lock' || r === 'wrong-speed')).length;
  const last = [...bins].reverse().find(b => fin(b.snrDb));
  return {
    elapsedSec, elapsedText: formatTime(elapsedSec), sideText: fin(sideSec) ? formatTime(sideSec) : null,
    pct: frac == null ? null : Math.round(frac * 100), positionMm: round(posMm, 0), counts, bins: bins.length,
    lastSnrDb: last ? round(last.snrDb, 1) : null,
    lockWarning: bins.length >= 5 && noLock / bins.length > WEAR_DEFAULTS.lockLostErrorPct / 100,
    overrun: fin(sideSec) && elapsedSec > sideSec * 1.05,
  };
}

// ------------------------------------------------------------------ saved scans and verdict context

/** badPct of a scan summary (for history / other-side context). */
const badPctOf = s => (fin(s?.summary?.badPct) ? s.summary.badPct : null);

/**
 * Verdict context from the stored scans of one copy: `history` = earlier scans of this side (oldest first)
 * and `otherSide` = the latest scan of another side of the same copy.
 */
export function verdictContext(scans, { sideId, sideIds = [], excludeId = null } = {}) {
  const own = scans.filter(s => s.recordSideId === sideId && s.id !== excludeId && s.verdict !== 'incomplete')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const other = scans.filter(s => s.recordSideId !== sideId && sideIds.includes(s.recordSideId) && s.verdict !== 'incomplete')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
  return { history: own.map(badPctOf).filter(fin), otherSide: other ? badPctOf(other) : null, otherSideScan: other };
}

/** Verdict + wearmap_save record for a finished scanner result. */
export function finishScan(result, { side, format, sideSec = null, stylusAssetId = null, stylusRed = false, cleaned = false, context = {}, geometry = DEFAULT_GEOMETRY } = {}) {
  const cov = scanCoverage(result, { sideDurationSec: sideSec });
  const v = verdict(result.bins, { history: context.history || [], otherSide: context.otherSide ?? null, stylusRed, coverage: fin(sideSec) ? cov.coverage : null, sideLabel: side?.sideLabel ?? null });
  const record = toScanRecord(result, v, { recordSideId: side.id, sideLabel: side.sideLabel, sideDurationSec: sideSec, coverage: cov.coverage, coverageBasis: cov.basis, stylusAssetId, geometry });
  record.summary.cleaned = Boolean(cleaned);
  record.summary.stylusRed = Boolean(stylusRed);
  record.summary.format = format?.name ?? result.format;
  return { verdict: v, record, coverage: cov };
}

/**
 * The view model of a scan, fresh or loaded: bins with durSec, class and label; skips; worst bins; the
 * verdict as saved (loaded) or computed (fresh). `scan` is a wearmap_get detail or a {record, verdict, result}
 * triple (fresh: the scanner bins keep their reasons and carrier for the inspector).
 */
export function scanView(scan, { metric = 'snr' } = {}) {
  const rec = scan.record || scan, sum = rec.summary || {}, binSec = rec.binSec || WEAR_DEFAULTS.binSec;
  const skips = (sum.skips || []).filter(s => fin(s.tSec));
  const bins = (scan.result?.bins || rec.bins || []).map((b, k, all) => {
    const next = all[k + 1];
    const durSec = fin(b.durSec) ? b.durSec : next ? Math.min(binSec, Math.max(0, next.tSec - b.tSec)) : binSec;
    const out = { ...b, durSec };
    out.cls = classifyBin(out);
    out.skips = skips.filter(s => s.tSec >= b.tSec && s.tSec < b.tSec + durSec);
    out.title = `${binLabel(out, metric)} (${out.cls})`;
    return out;
  });
  const v = scan.verdict && typeof scan.verdict === 'object' ? scan.verdict : null;
  const verdictKey = v?.verdict ?? rec.verdict;
  return {
    id: rec.id ?? null, createdAt: rec.createdAt ?? null, format: rec.format, binSec, bins, skips,
    verdict: verdictKey, label: VERDICT_LABELS[verdictKey] || verdictKey,
    headline: v?.headline ?? HEADLINES[verdictKey], message: v?.message ?? sum.message ?? '', score: v?.score ?? rec.score ?? null,
    coverage: rec.coverage, coverageBasis: sum.coverageBasis ?? 'side', partial: fin(rec.coverage) && rec.coverage < 0.98 && sum.coverageBasis !== 'elapsed',
    sideSec: sum.sideDurationSec ?? null, sideLabel: sum.sideLabel ?? null, stylusNote: v?.stylusNote ?? sum.stylusNote ?? null,
    stats: v?.stats ?? { goodPct: sum.goodPct, degradedPct: sum.degradedPct, badPct: sum.badPct, dropouts: sum.dropouts, validBins: sum.validBins, interruptedBins: sum.interruptedBins, lowSnrPct: sum.lowSnrPct },
    worst: worstBins(bins), cleaned: Boolean(sum.cleaned), elapsedSec: sum.elapsedSec ?? null,
    compareSource: { bins, binSec, summary: sum, envelope: sum.envelope, fromNeedleDrop: sum.fromNeedleDrop, needleDropSec: sum.needleDropSec },
    geometry: { ...DEFAULT_GEOMETRY, ...(rec.geometry || {}) },
  };
}
const HEADLINES = { keep: 'Keep using this side.', watch: 'Watch this side.', other_side: 'Use the other side.', replace: 'Replace this record.', incomplete: 'Scan incomplete.' };

/** Visual spiral turns: about 50 bins per turn (a 20 min side at 2 s bins gets DEFAULT_TURNS), at least 3. */
export function drawTurns(durationSec, binSec = WEAR_DEFAULTS.binSec) {
  const bins = fin(durationSec) && durationSec > 0 ? durationSec / binSec : 0;
  return Math.min(DEFAULT_TURNS, Math.max(3, Math.round(bins / 50)));
}

/** Drawing geometry for a view: the whole side when its length is known, else the scanned length. */
export function drawGeometry(view) {
  const end = Math.max(1, ...view.bins.map(b => b.tSec + (b.durSec || 0)));
  const durationSec = fin(view.sideSec) && view.sideSec >= end ? view.sideSec : end;
  return { ...view.geometry, turns: drawTurns(durationSec, view.binSec), durationSec };
}

/**
 * Compare the current view with an earlier one of the same side: bin deltas (snr, phase, dropouts, new bad)
 * keyed by current idx when aligned, else region rows. Returns the summary sentence too.
 */
export function compareModel(prevView, curView) {
  const c = compareScans(prevView.compareSource, curView.compareSource);
  const date = prevView.createdAt ? String(prevView.createdAt).slice(0, 10) : 'the previous scan';
  if (c.mode === 'region') {
    const conf = fin(c.alignment.confidence) ? c.alignment.confidence.toFixed(2) : 'n/a';
    return { mode: 'region', regions: c.regions, deltas: null, alignment: c.alignment, prevLine: null,
      text: `Compared with ${date} by region: the scans could not be lined up (match ${conf}, needs 0.60), so each tenth of the side is compared instead.` };
  }
  const prevByIdx = new Map(prevView.bins.map(b => [b.idx, b]));
  const deltas = new Map();
  for (const d of c.deltas) {
    const p = prevByIdx.get(d.prevIdx), cur = curView.bins.find(b => b.idx === d.idx);
    const phaseDelta = !d.excluded && fin(p?.phaseErrDeg) && fin(cur?.phaseErrDeg) ? cur.phaseErrDeg - p.phaseErrDeg : null;
    deltas.set(d.idx, { ...d, phaseDelta });
  }
  const s = c.summary, off = c.alignment.offsetSec || 0;
  const m1 = fin(s.medianSnrDelta) ? Math.round(s.medianSnrDelta * 10) / 10 || 0 : null;
  const med = m1 == null ? 'n/a' : `${m1 > 0 ? '+' : ''}${m1.toFixed(1)} dB`;
  const parts = [`${s.newBad} new bad bin${s.newBad === 1 ? '' : 's'}`, `${s.newDropouts} new dropout${s.newDropouts === 1 ? '' : 's'}`, `median SNR change ${med}${s.withinNoise ? ` (within noise, under ${NOISE_DB} dB)` : ''}`];
  const how = c.alignment.method === 'needle-drop' ? 'lined up by needle drop' : `lined up by level envelope, offset ${off.toFixed(1)} s, match ${c.alignment.confidence.toFixed(2)}`;
  return {
    mode: 'bin', deltas, alignment: c.alignment, summary: s,
    prevLine: prevView.bins.map(b => ({ tSec: b.tSec - off, durSec: b.durSec, idx: b.idx, snrDb: b.snrDb, phaseErrDeg: b.phaseErrDeg, dropouts: b.dropouts, interrupted: b.cls === 'interrupted' })),
    text: `Compared with ${date} (${how}): ${parts.join(', ')}.`,
  };
}

/**
 * Plain recommendation from the verdict: tone for the banner, the next action and a flip / scan-other-side
 * suggestion. `otherSides` are the copy's other sides with their latest verdict (or null if never scanned).
 */
export function recommendation(view, { otherSides = [] } = {}) {
  const tone = { keep: 'pass', watch: 'warn', other_side: 'warn', replace: 'fail', incomplete: 'review' }[view.verdict] || 'review';
  const unscanned = otherSides.find(s => !s.latest);
  const clean = otherSides.find(s => s.latest && ['keep', 'watch'].includes(s.latest.verdict));
  let action, flipTo = null, scanOther = null;
  switch (view.verdict) {
    case 'keep': action = 'No action needed. Scan again in a few weeks to track wear.'; break;
    case 'watch': action = 'Keep using it, but rescan soon and keep a spare ready.'; if (unscanned) scanOther = unscanned.sideLabel; break;
    case 'other_side': flipTo = clean?.sideLabel ?? otherSides[0]?.sideLabel ?? null; action = `Flip the record${flipTo ? ` to side ${flipTo}` : ''} for your sets; this side has bad stretches.`; break;
    case 'replace': action = 'Replace this control vinyl before your next gig.'; if (unscanned) { scanOther = unscanned.sideLabel; action += ` Scanning side ${unscanned.sideLabel} first shows whether flipping buys time.`; } break;
    default: action = view.coverage < WEAR_DEFAULTS.minCoverage ? 'Scan more of the side to get a verdict.' : 'Check the format selection and phono/line switch, then scan again.';
  }
  if (view.stylusNote) action += ' Check the stylus before replacing the record.';
  return { tone, action, flipTo, scanOther };
}

const REASON_TEXT = {
  'stream-gap': 'audio blocks were lost', silence: 'silence (paused or needle lifted)', 'needle-drop': 'needle drop', 'needle-lift': 'needle lifted',
  short: 'too little audio', reverse: 'played backwards', 'speed-shift': 'speed changed', 'wrong-speed': 'wrong speed or format', 'no-lock': 'no timecode lock',
  clip: 'input clipped', skip: 'needle skip',
};

/** Inspector rows for one bin (raw numbers, FS-13 AC-7). `delta` adds the change versus the compared scan. */
export function binDetails(bin, { delta = null } = {}) {
  const f = (v, d = 1, u = '') => (fin(v) ? `${(Number(v.toFixed(d)) || 0).toFixed(d)}${u ? ` ${u}` : ''}` : '—');
  const signed = (v, d, u) => (fin(v) && Number(v.toFixed(d)) > 0 ? '+' : '') + f(v, d, u);
  const reasons = bin.reasons?.length ? bin.reasons.map(r => REASON_TEXT[r] || r)
    : [bin.flags & FLAGS.interrupted ? 'interrupted' : null, bin.flags & FLAGS.speedShift ? REASON_TEXT['speed-shift'] : null, bin.flags & FLAGS.clip ? REASON_TEXT.clip : null].filter(Boolean);
  const rows = [
    ['Time', `${formatTime(bin.tSec)} – ${formatTime(bin.tSec + (bin.durSec || 0))}`],
    ['Class', bin.cls],
    ['SNR', f(bin.snrDb, 1, 'dB')],
    ['Phase error', f(bin.phaseErrDeg, 1, 'deg')],
    ['Dropouts', String(bin.dropouts || 0)],
    ['Level', f(bin.levelDbfs, 1, 'dBFS')],
    ['L/R balance', f(bin.balanceDb, 2, 'dB')],
  ];
  if (fin(bin.carrierHz)) rows.push(['Carrier', f(bin.carrierHz, 1, 'Hz')]);
  if (reasons.length) rows.push(['Flags', reasons.join(', ')]);
  if (bin.skips?.length) rows.push(['Needle skip', bin.skips.map(s => `${formatTime(s.tSec)} (${Math.round(s.deg)} deg)`).join(', ')]);
  if (delta) {
    if (delta.excluded) rows.push(['Change', 'not compared (interrupted or no matching bin)']);
    else {
      rows.push(['SNR change', `${signed(delta.snrDelta, 1, 'dB')}${delta.withinNoise ? ' (within noise)' : ''}`]);
      rows.push(['New dropouts', String(delta.newDropouts)]);
      if (delta.newBad) rows.push(['Note', 'New bad bin (was good)']);
    }
  }
  return rows;
}

/** Stylus assets (cartridge / stylus products) for the stylus-control picker. */
export async function listStylusAssets(store) {
  const [assets, products] = await Promise.all([store.list('asset'), store.list('product')]);
  const byId = new Map(products.map(p => [p.id, p]));
  return assets.filter(a => !a.isDeleted && ['cartridge', 'stylus'].includes(byId.get(a.productId)?.category))
    .map(a => ({ id: a.id, name: a.nickname || byId.get(a.productId)?.model || 'Cartridge' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export { createWearMapApi };
