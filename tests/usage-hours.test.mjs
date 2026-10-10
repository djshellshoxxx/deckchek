import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  mergeIntervals, totalHours, proposeFromSessions, createUsageApi, SOURCE_PRIORITY, HOUR_MS,
} from '../app/usage-hours.js';

const T0 = Date.parse('2026-01-01T10:00:00.000Z');
const iso = h => new Date(T0 + h * HOUR_MS).toISOString();
const e = (id, startH, hours, source = 'deckchek', extra = {}) => ({ id, startedAt: iso(startH), hours, source, ...extra });
const spans = list => list.map(s => [s.id, (s.startMs - T0) / HOUR_MS, (s.endMs - T0) / HOUR_MS, s.source]);

test('priority order is manual > djlog > deckchek > import', () => {
  assert.ok(SOURCE_PRIORITY.manual > SOURCE_PRIORITY.djlog);
  assert.ok(SOURCE_PRIORITY.djlog > SOURCE_PRIORITY.deckchek);
  assert.ok(SOURCE_PRIORITY.deckchek > SOURCE_PRIORITY.import);
});

test('disjoint entries pass through sorted by start', () => {
  const m = mergeIntervals([e('b', 5, 1), e('a', 0, 2)]);
  assert.deepEqual(spans(m), [['a', 0, 2, 'deckchek'], ['b', 5, 6, 'deckchek']]);
});

test('higher priority removes overlapping lower-priority time', () => {
  // import 0-4, manual 1-2 -> import keeps 0-1 and 2-4
  const m = mergeIntervals([e('imp', 0, 4, 'import'), e('man', 1, 1, 'manual')]);
  assert.deepEqual(spans(m), [['imp', 0, 1, 'import'], ['man', 1, 2, 'manual'], ['imp', 2, 4, 'import']]);
  assert.equal(totalHours([e('imp', 0, 4, 'import'), e('man', 1, 1, 'manual')]), 4);
});

test('partial overlap trims the lower-priority span only', () => {
  const m = mergeIntervals([e('dk', 0, 3, 'deckchek'), e('log', 2, 3, 'djlog')]);
  assert.deepEqual(spans(m), [['dk', 0, 2, 'deckchek'], ['log', 2, 5, 'djlog']]);
});

test('full containment of a lower-priority entry removes it', () => {
  const m = mergeIntervals([e('dk', 1, 1, 'deckchek'), e('man', 0, 3, 'manual')]);
  assert.deepEqual(spans(m), [['man', 0, 3, 'manual']]);
});

test('same-source overlaps are unioned, never double counted', () => {
  assert.equal(totalHours([e('a', 0, 3), e('b', 2, 3)]), 5);
  assert.equal(totalHours([e('a', 0, 3), e('b', 0, 3), e('c', 1, 1)]), 3);
});

test('adjacent segments of the same entry are coalesced', () => {
  const m = mergeIntervals([e('a', 0, 4, 'import'), e('x', 1, 1, 'import')]);
  assert.deepEqual(spans(m), [['a', 0, 4, 'import']]);
});

test('three-way priority chain', () => {
  const list = [e('imp', 0, 6, 'import'), e('dk', 1, 4, 'deckchek'), e('log', 2, 2, 'djlog'), e('man', 3, 0.5, 'manual')];
  assert.deepEqual(spans(mergeIntervals(list)), [
    ['imp', 0, 1, 'import'], ['dk', 1, 2, 'deckchek'], ['log', 2, 3, 'djlog'], ['man', 3, 3.5, 'manual'],
    ['log', 3.5, 4, 'djlog'], ['dk', 4, 5, 'deckchek'], ['imp', 5, 6, 'import'],
  ]);
  assert.equal(totalHours(list), 6);
});

test('input order does not matter', () => {
  const list = [e('imp', 0, 6, 'import'), e('dk', 1, 4, 'deckchek'), e('log', 2, 2, 'djlog'), e('man', 3, 0.5, 'manual'), e('z', 20, 1, 'import')];
  const a = spans(mergeIntervals(list));
  for (let i = 0; i < 20; i++) {
    const shuffled = [...list].sort((x, y) => (Math.sin(i * 7 + x.id.charCodeAt(0)) - Math.sin(i * 7 + y.id.charCodeAt(0))));
    assert.deepEqual(spans(mergeIntervals(shuffled)), a);
  }
});

test('the ledger is not mutated and invalid entries are ignored', () => {
  const list = [e('ok', 0, 1), { id: 'nan', startedAt: iso(0), hours: NaN, source: 'manual' }, { id: 'bad', startedAt: 'nope', hours: 1, source: 'manual' },
    { id: 'neg', startedAt: iso(0), hours: -1, source: 'manual' }, { id: 'zero', startedAt: iso(0), hours: 0, source: 'manual' },
    { id: 'src', startedAt: iso(0), hours: 1, source: 'wat' }, { id: 'big', startedAt: iso(0), hours: 25, source: 'manual' }, null, 7];
  const copy = JSON.parse(JSON.stringify(list));
  assert.equal(totalHours(list), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(list)), copy);
});

test('unconfirmed proposals are excluded unless asked for; snake_case rows work', () => {
  const rows = [e('a', 0, 2), { id: 'p', started_at: iso(10), hours: 3, source: 'deckchek', confirmed: 0 }];
  assert.equal(totalHours(rows), 2);
  assert.equal(totalHours(rows, { includeUnconfirmed: true }), 5);
  assert.equal(totalHours([{ id: 'q', started_at: iso(0), hours: 1.5, source: 'manual', confirmed: 1 }]), 1.5);
});

test('since clips an entry that straddles the boundary; until too', () => {
  const list = [e('a', 0, 4)];
  assert.equal(totalHours(list, { since: iso(1) }), 3);
  assert.equal(totalHours(list, { since: iso(4) }), 0);
  assert.equal(totalHours(list, { since: iso(5) }), 0);
  assert.equal(totalHours(list, { since: iso(-2) }), 4);
  assert.equal(totalHours(list, { since: iso(1), until: iso(3) }), 2);
  assert.equal(totalHours(list, { since: new Date(T0 + HOUR_MS) }), 3);
  assert.equal(totalHours(list, { since: 'garbage' }), 4);
});

test('since is applied after priority resolution (a baseline never resurrects trimmed time)', () => {
  const list = [e('imp', 0, 4, 'import'), e('man', 2, 2, 'manual')];
  assert.equal(totalHours(list, { since: iso(3) }), 1);
});

test('kind filter', () => {
  const list = [e('p', 0, 2, 'deckchek', { kind: 'play' }), e('b', 5, 1, 'manual', { kind: 'bench' })];
  assert.equal(totalHours(list), 3);
  assert.equal(totalHours(list, { kind: 'play' }), 2);
  assert.equal(totalHours(list, { kind: 'bench' }), 1);
});

test('minute-level precision has no float drift over many entries', () => {
  const list = [];
  for (let i = 0; i < 1000; i++) list.push(e('m' + i, i * 2, 0.1));
  assert.ok(Math.abs(totalHours(list) - 100) < 1e-6);
});

test('proposeFromSessions: durations, cap, ids, ordering', () => {
  const sessions = [
    { id: 's2', startedAt: iso(30), endedAt: iso(32.5) },
    { id: 's1', startedAt: iso(0), endedAt: iso(20) },
    { id: 'open', startedAt: iso(50) },
    { id: 'rev', startedAt: iso(60), endedAt: iso(59) },
    { id: 'tiny', startedAt: iso(70), endedAt: new Date(T0 + 70 * HOUR_MS + 20_000).toISOString() },
    { id: 'bad', startedAt: 'x', endedAt: 'y' },
  ];
  const p = proposeFromSessions(sessions, 'asset-1');
  assert.deepEqual(p.map(x => [x.sessionId, x.hours, x.capped]), [['s1', 12, true], ['s2', 2.5, false]]);
  for (const x of p) {
    assert.equal(x.assetId, 'asset-1');
    assert.equal(x.source, 'deckchek');
    assert.equal(x.kind, 'play');
    assert.equal(x.confirmed, 0);
  }
  assert.deepEqual(proposeFromSessions(sessions, 'a', { capHours: 3 }).map(x => x.hours), [3, 2.5]);
  assert.equal(proposeFromSessions(sessions, 'a', { capHours: 100 })[0].hours, 20);
  assert.equal(proposeFromSessions(sessions, 'a', { capHours: 100 }).every(x => x.hours <= 24), true);
  assert.equal(proposeFromSessions([{ id: 'long', startedAt: iso(0), endedAt: iso(40) }], 'a', { capHours: 100 })[0].hours, 24);
});

test('proposeFromSessions: asset filter, snake_case, source, dedupe against existing', () => {
  const sessions = [
    { id: 'a', started_at: iso(0), ended_at: iso(1), assetIds: ['x'] },
    { id: 'b', started_at: iso(2), ended_at: iso(3), assetIds: ['y'] },
    { id: 'c', started_at: iso(4), ended_at: iso(5), source: 'djlog' },
    { id: 'd', started_at: iso(6), ended_at: iso(7) },
  ];
  const p = proposeFromSessions(sessions, 'x', { existing: [{ sessionId: 'd' }, { session_id: 'zzz' }] });
  assert.deepEqual(p.map(s => [s.sessionId, s.source]), [['a', 'deckchek'], ['c', 'djlog']]);
});

test('bridge passes exactly the Rust command and argument names', async () => {
  const calls = [];
  const invoke = async (cmd, args) => { calls.push([cmd, args]); return cmd === 'usage_list' ? [] : cmd === 'usage_delete' ? true : { id: 'u1' }; };
  const api = createUsageApi({ invoke });
  assert.equal(api.native, true);
  await api.add({ assetId: 'a1', startedAt: iso(0), hours: 2, source: 'manual' });
  await api.list('a1', { since: iso(1) });
  await api.list('a1');
  assert.equal(await api.delete('u1'), true);
  await api.confirm('u1');
  assert.deepEqual(calls.map(c => c[0]), ['usage_add', 'usage_list', 'usage_list', 'usage_delete', 'usage_confirm']);
  assert.deepEqual(calls[0][1], { input: { assetId: 'a1', startedAt: iso(0), hours: 2, source: 'manual' } });
  assert.deepEqual(calls[1][1], { assetId: 'a1', since: iso(1) });
  assert.deepEqual(calls[2][1], { assetId: 'a1', since: null });
  assert.deepEqual(calls[3][1], { id: 'u1' });
  await assert.rejects(api.add({ assetId: 'a1', startedAt: iso(0), hours: 30, source: 'manual' }), /hours/);
  await assert.rejects(api.add({ assetId: 'a1', startedAt: iso(0), hours: 1, source: 'nope' }), /source/);
  assert.equal(calls.length, 5);
});

test('bridge without Tauri reports unsupported instead of pretending', async () => {
  const api = createUsageApi({ invoke: null });
  assert.equal(api.native, false);
  await assert.rejects(api.list('a'), /desktop app/);
});

test('contract example matches the bridge', async () => {
  const c = JSON.parse(readFileSync(new URL('./contracts/usage.json', import.meta.url), 'utf8'));
  const calls = [];
  const api = createUsageApi({ invoke: async (cmd, args) => { calls.push([cmd, args]); return c.usage_add.response; } });
  await api.add(c.usage_add.request.input);
  assert.deepEqual(calls[0], ['usage_add', c.usage_add.request]);
});
