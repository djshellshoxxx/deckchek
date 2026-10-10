// FS-13 UI modules: groove plots (theme ramps, arc geometry, SVG marks and escaping) and the wear-map workflow
// (records store and bridge, side lengths, verdict context, saved-scan views, compare, recommendation,
// progress, drafts, recording scans).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quadratureTimecode } from './fixtures/signals.mjs';
import { binsToArcs, FLAGS, DEFAULT_GEOMETRY, createScanner, verdict } from '../app/wear-map.js';
import {
  RAMPS, DIVERGING, rampColor, deltaColor, luminance, arcBandPath, spiralAt, spiralPath, grooveMapSvg, timelineSvg, timeTicks, legendGradient, binFill, polar,
} from '../app/ui/plots-groove.js';
import {
  createRecordsApi, defaultSides, sideLength, scanFormats, verdictContext, finishScan, scanView, drawGeometry, drawTurns, compareModel, recommendation,
  progressModel, binDetails, saveDraft, loadDraft, clearDraft, scanAudio, copyName, RECORDS_KEY,
} from '../app/ui/workflows/wearmap.js';

const CONTRACT = JSON.parse(readFileSync(new URL('./contracts/wearmap.json', import.meta.url), 'utf8'));
function memStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; }
const bin = (idx, o = {}) => ({ idx, tSec: idx * 2, durSec: 2, snrDb: 32, phaseErrDeg: 2, balanceDb: 0, levelDbfs: -20, dropouts: 0, flags: 0, ...o });

// ------------------------------------------------------------------ plots

test('theme ramps are sequential: luminance rises monotonically from worst to best in both themes', () => {
  for (const theme of ['light', 'dark']) {
    let prev = -1;
    for (let q = 0; q <= 1.0001; q += 0.05) {
      const L = luminance(rampColor(q, RAMPS[theme]));
      assert.ok(L > prev, `${theme} q=${q.toFixed(2)}`);
      prev = L;
    }
  }
  // the dark ramp keeps the worst bins visible on the dark disc (contrast >= 3:1 against #0b0c0f)
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  assert.ok(contrast(luminance(RAMPS.dark[0].color), luminance('#0b0c0f')) >= 3);
  assert.equal(rampColor(null), null);
  assert.equal(rampColor(0, RAMPS.light), RAMPS.light[0].color);
  assert.equal(rampColor(1, RAMPS.light), RAMPS.light.at(-1).color);
});

test('diverging delta colours: neutral inside noise, warm for worse, cool for better, saturating at full scale', () => {
  assert.equal(deltaColor(2, { noise: 3 }), DIVERGING.light.mid);
  assert.equal(deltaColor(-10, { full: 10 }), DIVERGING.light.better);
  assert.equal(deltaColor(10, { full: 10, theme: 'dark' }), DIVERGING.dark.worse);
  assert.equal(deltaColor(40, { full: 10 }), deltaColor(10, { full: 10 }));
  assert.notEqual(deltaColor(5, { full: 10 }), deltaColor(10, { full: 10 }));
  assert.equal(deltaColor(NaN), null);
  // SNR drop of 8 dB is "worse"; within-noise change is grey; excluded bins have no fill
  assert.equal(binFill(bin(0), { metric: 'snr', delta: { snrDelta: -8 } }), deltaColor(8, { full: 10, noise: 3 }));
  assert.equal(binFill(bin(0), { metric: 'snr', delta: { snrDelta: 1 } }), DIVERGING.light.mid);
  assert.equal(binFill(bin(0), { delta: { excluded: true } }), null);
  assert.equal(binFill({ ...bin(0), cls: 'interrupted' }), null);
  assert.match(legendGradient({ theme: 'dark' }), /#4a6fb5 0%.*#fee838 100%/);
  assert.match(legendGradient({ delta: true }), new RegExp(DIVERGING.light.worse));
});

test('arc bands follow the spiral and split into <= 30 deg arcs', () => {
  const arc = { a0: 0, a1: Math.PI, r0: 140, r1: 138, width: 7 };
  const d = arcBandPath(arc);
  assert.equal((d.match(/A/g) || []).length, 12, 'six outer + six inner arc commands for 180 deg');
  assert.match(d, /^M0 -142\.94/, 'starts at 12 o\'clock on the outer edge');
  assert.ok(d.endsWith('Z'));
  const g = { outerMm: 146, innerMm: 58, turns: 12, durationSec: 600 };
  assert.deepEqual(spiralAt(0, g), { a: 0, r: 146 });
  assert.equal(spiralAt(600, g).r, 58);
  assert.ok(Math.abs(spiralAt(300, g).a - 12 * Math.PI) < 1e-9);
  const [x, y] = polar(Math.PI / 2, 10);
  assert.ok(Math.abs(x - 10) < 1e-9 && Math.abs(y) < 1e-9, 'clockwise: 3 o\'clock is +x');
  assert.ok(spiralPath(g).split('L').length > 1000);
});

test('groove map SVG: one path per bin, hatching on bad, texture on interrupted, pins, skip, selection, escaped labels', () => {
  const bins = [bin(0, { flags: FLAGS.interrupted }), bin(1), bin(2, { snrDb: 10 }), bin(3, { dropouts: 1 }), bin(4)];
  const geom = { ...DEFAULT_GEOMETRY, turns: 3, durationSec: 20 };
  const arcs = binsToArcs(bins, geom, 'snr');
  const svg = grooveMapSvg(arcs, { geom, worst: [2, 3], selected: 1, skips: [{ tSec: 5 }], label: { title: 'Side <A>', sub: 'Watch' }, id: 't1', theme: 'dark' });
  assert.equal((svg.match(/class="gm-bin/g) || []).length, 5);
  assert.equal((svg.match(/gm-bad/g) || []).length, 1);
  assert.equal((svg.match(/gm-neutral/g) || []).length, 1);
  assert.equal((svg.match(/url\(#t1-hatch\)/g) || []).length, 1);
  assert.equal((svg.match(/url\(#t1-dots\)/g) || []).length, 1);
  assert.equal((svg.match(/class="gm-pin"/g) || []).length, 2);
  assert.equal((svg.match(/class="gm-skip"/g) || []).length, 1);
  assert.equal((svg.match(/class="gm-sel"/g) || []).length, 1);
  assert.ok(svg.includes('Side &lt;A&gt;') && !svg.includes('Side <A>'));
  assert.ok(svg.includes(`fill="${rampColor(arcs[1].q, RAMPS.dark)}"`), 'dark ramp used in dark theme');
  // compare view: new bad bins hatched instead of bad ones
  const deltas = new Map([[1, { snrDelta: -6, newBad: true }], [2, { snrDelta: 0.5 }]]);
  const cmp = grooveMapSvg(arcs, { geom, deltas, id: 't2' });
  assert.equal((cmp.match(/gm-newbad/g) || []).length, 1);
  assert.equal((cmp.match(/gm-neutral/g) || []).length, 3, 'interrupted and unmatched bins are neutral');
});

test('timeline SVG: line breaks at interrupted bins, guides, strip cells, previous scan, time ticks', () => {
  const bins = [bin(0), bin(1), { ...bin(2, { flags: FLAGS.interrupted }), cls: 'interrupted' }, bin(3), bin(4, { snrDb: 12 })].map(b => ({ cls: 'good', ...b }));
  bins[4].cls = 'bad';
  const svg = timelineSvg(bins, { durationSec: 10, prev: [{ tSec: 0, durSec: 2, value: 30 }, { tSec: 2, durSec: 2, value: 31 }], id: 'tl1', selected: 3, skips: [{ tSec: 3 }], worst: [4] });
  const line = svg.match(/class="tl-line" d="([^"]+)"/)[1];
  assert.equal((line.match(/M/g) || []).length, 2, 'gap at the interrupted bin');
  assert.equal((svg.match(/class="tl-bin/g) || []).length, 5);
  assert.match(svg, /Good ≥ 25 dB/);
  assert.match(svg, /Bad &lt; 15 dB|Bad < 15 dB/);
  assert.equal((svg.match(/class="tl-prev"/g) || []).length, 1);
  assert.equal((svg.match(/class="tl-sel"/g) || []).length, 1);
  assert.equal((svg.match(/url\(#tl1-thatch\)/g) || []).length, 1);
  assert.equal((svg.match(/url\(#tl1-tdots\)/g) || []).length, 1);
  assert.deepEqual(timeTicks(712).slice(0, 3), [0, 120, 240]);
  assert.deepEqual(timeTicks(60), [0, 10, 20, 30, 40, 50, 60]);
  // values above the default axis extend it instead of clipping
  const hi = timelineSvg([{ ...bin(0, { snrDb: 52 }), cls: 'good' }], { durationSec: 2 });
  assert.match(hi, />60</);
});

// ------------------------------------------------------------------ workflow

test('default sides and side lengths come from the format side table', () => {
  const s = defaultSides('Serato CV02.5');
  assert.deepEqual(s.map(x => x.sideLabel), ['A', 'B']);
  assert.equal(s[0].expectedDurationSec, 712);
  assert.equal(Math.round(defaultSides('Traktor Scratch MK2')[1].expectedDurationSec / 6) / 10, 17.3);
  assert.deepEqual(defaultSides('Final Scratch').map(x => x.expectedDurationSec), [null, null]);
  assert.equal(sideLength({ sideLabel: 'A', expectedDurationSec: 600 }, 'Serato CV02.5'), 600, 'user override wins');
  assert.equal(Math.round(sideLength({ sideLabel: 'B' }, 'Serato CV02.5')), 922);
  assert.equal(Math.round(sideLength({ sideLabel: 'A', nominalRpm: 45 }, 'Serato CV02.5')), Math.round(712 * 33.333333 / 45));
  assert.equal(sideLength({ sideLabel: 'A' }, 'Final Scratch'), null);
  assert.ok(scanFormats().every(f => Number.isFinite(f.carrierHz)));
  assert.equal(copyName({ title: 'Serato CV02.5', nickname: 'Deck 1' }), 'Serato CV02.5 · Deck 1');
});

test('records bridge sends the contract argument names', async () => {
  const calls = [];
  const invoke = async (cmd, args) => { calls.push([cmd, args]); return CONTRACT[cmd].response; };
  const api = createRecordsApi({ invoke });
  assert.equal(api.native, true);
  assert.deepEqual(await api.list(), CONTRACT.wearmap_records_list.response);
  assert.deepEqual(await api.save(CONTRACT.wearmap_record_save.request.record), CONTRACT.wearmap_record_save.response);
  assert.deepEqual(calls, [['wearmap_records_list', undefined], ['wearmap_record_save', CONTRACT.wearmap_record_save.request]]);
  await assert.rejects(api.save({ ...CONTRACT.wearmap_record_save.request.record, title: ' ' }), /name/);
});

test('browser records store: create, update sides, validation, same shape as the command', async () => {
  const storage = memStorage();
  const api = createRecordsApi({ invoke: null, storage });
  const a = await api.save({ title: 'Serato CV02.5', format: 'Serato CV02.5', nickname: ' Deck 1 ', sides: defaultSides('Serato CV02.5') });
  assert.deepEqual(Object.keys(a).sort(), Object.keys(CONTRACT.wearmap_records_list.response[0]).sort());
  assert.equal(a.nickname, 'Deck 1');
  assert.equal(a.sides.length, 2);
  const b = await api.save({ id: a.id, title: 'CV', format: 'Serato CV02.5', sides: [{ id: a.sides[0].id, sideLabel: 'A', expectedDurationSec: 700 }, { sideLabel: 'C' }] });
  assert.equal(b.id, a.id);
  assert.deepEqual(b.sides.map(s => [s.sideLabel, s.expectedDurationSec]), [['A', 700], ['B', 922], ['C', null]]);
  assert.equal((await api.list()).length, 1);
  await assert.rejects(api.save({ id: a.id, title: 'CV', format: 'x', sides: [{ sideLabel: 'b' }] }), /unique/);
  await assert.rejects(api.save({ id: 'nope', title: 'CV', format: 'x', sides: [{ sideLabel: 'A' }] }), /Unknown/);
  await assert.rejects(api.save({ title: 'CV', format: 'x', sides: [] }), /1 to 4 sides/);
  await assert.rejects(api.save({ title: 'CV', format: 'x', sides: [{ sideLabel: 'A' }, { sideLabel: ' a' }] }), /twice/);
  await assert.rejects(api.save({ title: 'CV', format: 'x', sides: [{ sideLabel: 'A', expectedDurationSec: 0 }] }), /length/);
  storage.setItem(RECORDS_KEY, '{oops');
  assert.deepEqual(await api.list(), [], 'corrupt storage reads as empty');
});

test('verdict context: earlier scans of this side oldest first, latest other side', () => {
  const scans = [
    { id: '1', recordSideId: 'a', createdAt: '2026-01-01', verdict: 'keep', summary: { badPct: 0 } },
    { id: '2', recordSideId: 'a', createdAt: '2026-03-01', verdict: 'watch', summary: { badPct: 2 } },
    { id: '3', recordSideId: 'a', createdAt: '2026-02-01', verdict: 'watch', summary: { badPct: 1 } },
    { id: '4', recordSideId: 'b', createdAt: '2026-02-01', verdict: 'keep', summary: { badPct: 0.5 } },
    { id: '5', recordSideId: 'b', createdAt: '2026-04-01', verdict: 'incomplete', summary: { badPct: 50 } },
    { id: '6', recordSideId: 'x', createdAt: '2026-05-01', verdict: 'replace', summary: { badPct: 30 } },
  ];
  const c = verdictContext(scans, { sideId: 'a', sideIds: ['a', 'b'] });
  assert.deepEqual(c.history, [0, 1, 2]);
  assert.equal(c.otherSide, 0.5, 'incomplete scans and other copies are ignored');
  assert.deepEqual(verdictContext(scans, { sideId: 'a', sideIds: ['a'], excludeId: '2' }).history, [0, 1]);
});

function scanResult(o = {}) {
  const sig = quadratureTimecode({ carrierHz: 1000, seconds: 12, sampleRate: 16000, snrDb: 35, seed: 3, ...o });
  const s = createScanner({ format: 'Serato CV02.5', sampleRate: 16000 });
  s.push(sig.left, sig.right);
  return s.finish();
}

test('finishScan builds the verdict with context and a valid record; scanView restores bins from saved rows', () => {
  const result = scanResult({ dropouts: [[0, 0.3], [5.1, 5.15], [5.6, 5.65]], phaseJumps: [{ atSec: 8.7, deg: 100 }] });
  const side = { id: 'side-a', sideLabel: 'A' };
  const fin = finishScan(result, { side, format: { name: 'Serato CV02.5' }, sideSec: 24, cleaned: true, context: { history: [0], otherSide: 0 }, stylusRed: true });
  assert.equal(fin.record.coverage, Math.round((fin.coverage.validSec / 24) * 1e6) / 1e6);
  assert.equal(fin.record.summary.cleaned, true);
  assert.equal(fin.record.summary.stylusRed, true);
  assert.match(fin.verdict.message, /Scanned \d+ % of the side/);
  assert.ok(fin.verdict.stylusNote);
  // fresh view (scanner bins with reasons) and saved view (stored rows) agree on classes and skips
  const fresh = scanView({ record: { ...fin.record, id: 's1', createdAt: '2026-10-10T10:00:00Z' }, verdict: fin.verdict, result });
  const saved = scanView({ ...fin.record, id: 's1', createdAt: '2026-10-10T10:00:00Z', verdict: fin.record.verdict, score: fin.record.score });
  assert.deepEqual(saved.bins.map(b => b.cls), fresh.bins.map(b => b.cls));
  assert.deepEqual(saved.bins.map(b => b.durSec), fresh.bins.map(b => b.durSec));
  assert.equal(saved.skips.length, 1);
  assert.equal(saved.bins[4].skips.length, 1, 'the skip lands in bin 4 (8-10 s)');
  assert.equal(saved.verdict, fresh.verdict);
  assert.equal(saved.message, fresh.message);
  assert.deepEqual(saved.worst, fresh.worst);
  assert.equal(saved.partial, true);
  assert.ok(fresh.bins[0].reasons.includes('needle-drop'));
  const det = Object.fromEntries(binDetails(fresh.bins[4]));
  assert.match(det['Needle skip'], /0:08/);
  assert.match(det.Flags, /needle skip/);
  assert.equal(Object.fromEntries(binDetails(saved.bins[0])).Flags, 'interrupted', 'saved rows keep the flag, not the reason');
  // geometry: the whole side when known, turns scale with bins
  assert.deepEqual([drawGeometry(saved).durationSec, drawGeometry(saved).turns], [24, 3]);
  assert.equal(drawTurns(1200, 2), 12);
  assert.equal(drawTurns(712, 2), 7);
});

test('compareModel: bin deltas when aligned by needle drop, text with new bad bins and dropouts; region fallback', () => {
  const side = { id: 'side-a', sideLabel: 'A' };
  const mk = (o, at) => { const r = scanResult(o); const f = finishScan(r, { side, format: { name: 'Serato CV02.5' }, sideSec: 12 }); return scanView({ ...f.record, id: at, createdAt: at }); };
  const before = mk({ dropouts: [[0, 0.3]], seed: 1 }, '2026-01-01T00:00:00Z');
  const after = mk({ dropouts: [[0, 0.3], [5.1, 5.15], [5.6, 5.65]], seed: 2 }, '2026-02-01T00:00:00Z');
  const c = compareModel(before, after);
  assert.equal(c.mode, 'bin');
  assert.equal(c.alignment.method, 'needle-drop');
  assert.equal(c.deltas.get(2).newBad, true);
  assert.match(c.text, /^Compared with 2026-01-01 \(lined up by needle drop\): 1 new bad bin, 2 new dropouts, median SNR change [+-]?0\.\d dB \(within noise/);
  assert.ok(!/-0\.0/.test(c.text));
  assert.equal(c.prevLine.length, before.bins.length);
  // no shared needle drop and too short to correlate: region comparison
  const a = scanView({ ...after, bins: after.bins, summary: {} , binSec: 2, verdict: 'keep', coverage: 1 });
  const b = scanView({ ...before, bins: before.bins, summary: {}, binSec: 2, verdict: 'keep', coverage: 1 });
  const r = compareModel(b, a);
  assert.equal(r.mode, 'region');
  assert.match(r.text, /by region/);
});

test('recommendation: tone, action and flip / scan-other-side suggestions per verdict', () => {
  const other = [{ sideLabel: 'B', latest: null }];
  assert.equal(recommendation({ verdict: 'keep' }).tone, 'pass');
  assert.deepEqual(recommendation({ verdict: 'watch' }, { otherSides: other }).scanOther, 'B');
  const flip = recommendation({ verdict: 'other_side' }, { otherSides: [{ sideLabel: 'B', latest: { verdict: 'keep' } }] });
  assert.equal(flip.flipTo, 'B');
  assert.match(flip.action, /Flip the record to side B/);
  const rep = recommendation({ verdict: 'replace' }, { otherSides: other });
  assert.equal(rep.tone, 'fail');
  assert.match(rep.action, /Scanning side B first/);
  assert.match(recommendation({ verdict: 'replace', stylusNote: 'x' }).action, /stylus/);
  assert.match(recommendation({ verdict: 'incomplete', coverage: 0.01 }).action, /Scan more/);
  assert.match(recommendation({ verdict: 'incomplete', coverage: 0.5 }).action, /format/);
});

test('progress model: time share, groove position, counts and lock warning', () => {
  const bins = [bin(0, { cls: 'good' }), bin(1, { cls: 'bad' }), bin(2, { cls: 'interrupted', reasons: ['no-lock'] })];
  const p = progressModel({ elapsedSec: 356, sideSec: 712, bins, geometry: DEFAULT_GEOMETRY });
  assert.equal(p.pct, 50);
  assert.equal(p.positionMm, 102);
  assert.deepEqual(p.counts, { good: 1, degraded: 0, bad: 1, interrupted: 1 });
  assert.equal(p.sideText, '11:52');
  assert.equal(p.lockWarning, false, 'needs at least 5 bins');
  const lost = Array.from({ length: 6 }, (_, i) => bin(i, { cls: 'interrupted', reasons: ['no-lock'] }));
  assert.equal(progressModel({ elapsedSec: 12, bins: lost }).lockWarning, true);
  assert.equal(progressModel({ elapsedSec: 12, bins: lost }).pct, null, 'unknown side length');
  assert.equal(progressModel({ elapsedSec: 800, sideSec: 712 }).overrun, true);
});

test('drafts round-trip and survive blocked storage', () => {
  const s = memStorage();
  assert.ok(saveDraft(s, { recordSideId: 'a', format: 'Serato CV02.5', result: { bins: [bin(0)], elapsedSec: 2 } }));
  const d = loadDraft(s);
  assert.equal(d.recordSideId, 'a');
  assert.ok(d.savedAt);
  clearDraft(s);
  assert.equal(loadDraft(s), null);
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(saveDraft(blocked, { recordSideId: 'a' }), false);
  assert.equal(loadDraft(blocked), null);
  clearDraft(blocked);
  s.setItem('deckchek.wearmap.draft.v1', JSON.stringify({ recordSideId: 'a' }));
  assert.equal(loadDraft(s), null, 'incomplete drafts are ignored');
});

test('scanAudio scans a recording in slices, reports progress and stops early on abort', async () => {
  const sig = quadratureTimecode({ carrierHz: 1000, seconds: 10, sampleRate: 16000, snrDb: 35, seed: 9 });
  const seen = [];
  const full = await scanAudio(sig, { format: 'Serato CV02.5', onProgress: p => seen.push(p.elapsedSec), pause: async () => {} });
  assert.equal(full.result.bins.length, 5);
  assert.equal(full.cancelled, false);
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(verdict(full.result.bins).verdict, 'keep');
  const ctrl = new AbortController();
  const part = await scanAudio(sig, { format: 'Serato CV02.5', signal: ctrl.signal, yieldEvery: 1, pause: async () => { if (seen.length++ > 13) ctrl.abort(); } });
  assert.equal(part.cancelled, true);
  assert.ok(part.result.bins.length < 5 && part.result.bins.length >= 1);
});
