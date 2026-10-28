// FS-31 live monitor session controller (app/monitor.js createMonitorController) with an injected stream, Tauri
// invoke and timers, plus the pure helpers of the screen, the log viewer and the History feed row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quadratureTimecode } from './fixtures/signals.mjs';
import { createMonitorController, HOLDER, DEVICE_BUSY_COPY } from '../app/monitor.js';
import { mapMonitorSession, RUN_TYPES } from '../app/history-feed.js';

globalThis.localStorage ??= (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const { sparklinePath, deckView } = await import('../app/ui/screens/monitor.js');
const { formatClock, sessionMeta, sessionWorst, logFileStem, sessionDurationSec } = await import('../app/ui/live-monitor-log.js');

const SR = 48000, HOP = SR / 4;
const tick = () => new Promise(r => setTimeout(r, 0));

/** A fake stream: push(sig) delivers 250 ms blocks for each pair synchronously; end(reason) ends it. */
function fakeStreams() {
  const opened = [];
  let fail = null;
  const start = async args => {
    if (fail) { const f = fail; fail = null; throw f; }
    const s = { args, stopped: false, info: { streamId: opened.length + 1, holder: args.holder, deviceName: 'Traktor Audio 8 DJ', sampleRate: SR }, async stop() { s.stopped = true; return { ended: 'stopped' }; } };
    s.push = (...sigs) => {
      const n = sigs[0].left.length;
      for (let o = 0; o + HOP <= n; o += HOP) {
        args.onBlock({ seq: o / HOP, sampleRate: SR, frames: HOP, quality: { droppedBlocks: 0 }, pairs: sigs.map(sg => ({ left: sg.left.subarray(o, o + HOP), right: sg.right.subarray(o, o + HOP) })) });
      }
    };
    s.end = reason => args.onEnd({ reason });
    opened.push(s);
    return s;
  };
  return { start, opened, failNext(e) { fail = e; } };
}

function fakeInvoke() {
  const calls = [];
  const fn = async (cmd, args) => {
    calls.push([cmd, structuredClone(args)]);
    if (cmd === 'monitor_session_start') return { id: '00000000-0000-4000-8000-000000000031', startedAt: '2026-10-28T21:00:00.000Z' };
    if (cmd === 'monitor_set_tray_state') return { supported: true, state: args.state, tooltip: `DeckChek live monitor: ${args.state}` };
    if (cmd === 'monitor_log_append') return { eventsStored: args.events.length, eventsDropped: 0, minutesStored: args.minutes.length };
    return null;
  };
  fn.calls = calls;
  fn.of = cmd => calls.filter(c => c[0] === cmd).map(c => c[1]);
  return fn;
}

function fakeTimers() {
  const pending = [];
  return {
    setTimeout(fn, ms) { const t = { fn, ms }; pending.push(t); return t; },
    clearTimeout(t) { const i = pending.indexOf(t); if (i >= 0) pending.splice(i, 1); },
    setInterval() { return 1; }, clearInterval() {},
    async runAll() { while (pending.length) { const t = pending.shift(); await t.fn(); } },
    get size() { return pending.length; },
  };
}

const tc = (seconds, snrDb, seed = 1, extra = {}) => quadratureTimecode({ carrierHz: 2500, sampleRate: SR, seconds, snrDb, seed, ...extra });
const CFG = { deviceName: 'Traktor Audio 8 DJ', decks: [{ deck: 'A', pair: '1-2' }, { deck: 'B', pair: '3-4' }], format: 'Traktor Scratch MK2' };

test('AC-1/AC-2/AC-7 session: stream under the live-monitor lease, alerts toast once, tray follows, log saved on stop', async () => {
  const streams = fakeStreams(), invoke = fakeInvoke(), timers = fakeTimers();
  const toasts = [], states = [], trays = [];
  let t = 1_000_000;
  const c = createMonitorController({ startStream: streams.start, invoke, timers, now: () => t, onAlert: (a, o) => toasts.push([a.message, o.toast, a.severity]), onState: s => states.push(s), onTray: tr => trays.push(tr.state) });
  const r = await c.start(CFG);
  assert.equal(r.ok, true);
  assert.equal(c.state, 'running');
  const s = streams.opened[0];
  assert.equal(s.args.holder, HOLDER);
  assert.deepEqual(s.args.pairs, [1, 3]);
  assert.equal(s.args.blockMs, 250);
  assert.deepEqual(invoke.of('monitor_session_start')[0].input.config.decks, [{ deck: 'A', first: 1 }, { deck: 'B', first: 3 }]);
  assert.equal(invoke.of('monitor_session_start')[0].input.format, 'Traktor Scratch MK2');
  assert.deepEqual(trays, ['ok']);
  // AC-1: healthy -> ok, per-deck frames
  s.push(tc(20, 32, 1), tc(20, 32, 2));
  assert.equal(c.deck('A').frame.state, 'ok');
  assert.equal(c.deck('B').frame.state, 'ok');
  assert.ok(c.deck('A').spark.length >= 19);
  // AC-2: deck A degrades by ~8 dB for 6 s -> one warning toast, tray watch
  s.push(tc(6, 24, 3), tc(6, 32, 4));
  assert.deepEqual(toasts.map(x => x[0]), ['Deck A: timecode SNR dropped 8 dB']);
  assert.equal(toasts[0][1], true);
  await tick();
  assert.deepEqual(trays, ['ok', 'watch']);
  // muted: still logged, no toast
  c.mute(30);
  assert.equal(c.muted, true);
  s.push(tc(3, 32, 5), tc(3, 9, 6));
  const crit = toasts.find(x => x[2] === 'critical');
  assert.ok(crit && crit[1] === false && /^Deck B/.test(crit[0]), JSON.stringify(toasts));
  await tick();
  assert.equal(trays.at(-1), 'fault');
  assert.ok(c.events.list().some(e => e.severity === 'critical'));
  // AC-7: stop flushes events + minutes and closes the session with a summary; tray off
  t += 29_000;
  const summary = await c.stop();
  assert.equal(c.state, 'idle');
  assert.equal(s.stopped, true);
  const appended = invoke.of('monitor_log_append');
  const ev = appended.flatMap(a => a.events);
  assert.deepEqual(ev.map(e => e.kind).sort(), ['snrDrop', 'snrFloor']);
  assert.ok(ev.every(e => e.tMs >= 0 && typeof e.message === 'string'));
  assert.ok(appended.flatMap(a => a.minutes).length >= 2, 'minute rows for both decks');
  const end = invoke.of('monitor_session_end')[0];
  assert.equal(end.sessionId, '00000000-0000-4000-8000-000000000031');
  assert.equal(end.summary.worst, 'critical');
  assert.equal(end.summary.durationSec, 29);
  assert.equal(summary.decks.length, 2);
  assert.equal(trays.at(-1), 'off');
  assert.ok(states.includes('starting') && states.includes('stopping'));
});

test('AC-5 an input held exclusively by DJ software is an explicit not-available state, nothing opened', async () => {
  const streams = fakeStreams(), invoke = fakeInvoke();
  const states = [];
  const c = createMonitorController({ startStream: streams.start, invoke, timers: fakeTimers(), onState: (s, i) => states.push([s, i]) });
  streams.failNext(new Error('Failed to build input stream: The device is in use exclusively by another application (AUDCLNT_E_DEVICE_IN_USE)'));
  const r = await c.start({ ...CFG, decks: [{ deck: 'A', pair: 1 }] });
  assert.equal(r.ok, false);
  assert.equal(c.state, 'device-busy');
  assert.equal(states.at(-1)[1].message, DEVICE_BUSY_COPY);
  assert.deepEqual(invoke.calls, [], 'no session row, no tray when nothing started');
  // another DeckChek feature holds the lease and the user cancelled the capture-busy dialog
  streams.failNext(Object.assign(new Error('busy'), { code: 'CAPTURE_BUSY', holder: 'wear-map', cancelled: true }));
  await c.start({ ...CFG, decks: [{ deck: 'A', pair: 1 }] });
  assert.equal(c.state, 'capture-busy');
  assert.equal(states.at(-1)[1].holder, 'wear-map');
  // and the same controller starts once the input is free
  assert.equal((await c.start({ ...CFG, decks: [{ deck: 'A', pair: 1 }] })).ok, true);
  await c.stop();
});

test('device lost: critical event, tray fault, retry every 5 s until the device is back', async () => {
  const streams = fakeStreams(), invoke = fakeInvoke(), timers = fakeTimers();
  const c = createMonitorController({ startStream: streams.start, invoke, timers });
  await c.start({ ...CFG, decks: [{ deck: 'A', pair: 1 }] });
  streams.opened[0].end('deviceLost');
  assert.equal(c.state, 'retrying');
  assert.equal(c.events.list().at(-1).kind, 'deviceLost');
  assert.equal(c.events.list().at(-1).severity, 'critical');
  assert.equal(c.tray.state, 'fault');
  streams.failNext(new Error('No input device found'));
  // the first retry fails (still unplugged) and schedules the next one, which succeeds
  await timers.runAll();
  assert.equal(c.state, 'running');
  assert.equal(streams.opened.length, 2);
  assert.equal(c.events.list().at(-1).kind, 'deviceRestored');
  await c.stop();
  assert.equal(streams.opened[1].stopped, true);
});

test('preempted by another DeckChek feature ("Stop and continue"): session closed, explicit state', async () => {
  const streams = fakeStreams(), invoke = fakeInvoke();
  const c = createMonitorController({ startStream: streams.start, invoke, timers: fakeTimers() });
  await c.start({ ...CFG, decks: [{ deck: 'A', pair: 1 }] });
  streams.opened[0].end('preempted');
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(c.state, 'preempted');
  assert.equal(invoke.of('monitor_session_end')[0].summary.endReason, 'preempted');
  assert.equal(c.tray.state, 'off');
});

test('browser mode (no invoke) runs without a log or tray; invalid config is refused', async () => {
  const streams = fakeStreams();
  const c = createMonitorController({ startStream: streams.start, invoke: null, timers: fakeTimers() });
  assert.equal((await c.start({ decks: [], format: 'Serato CV02.5' })).ok, false);
  assert.equal(c.state, 'error');
  assert.equal((await c.start({ decks: [{ pair: 1 }], format: 'Traktor Scratch MK2' })).ok, true);
  streams.opened[0].push(tc(2, 30));
  assert.equal(c.tray.supported, false);
  assert.ok((await c.stop()).decks.length === 1);
  assert.equal(await c.stop(), null, 'stopping twice is a no-op');
});

test('log failures never stop monitoring; the in-memory event log is capped', async () => {
  const streams = fakeStreams();
  const invoke = async cmd => { if (cmd === 'monitor_session_start') return { id: '00000000-0000-4000-8000-000000000031' }; if (cmd === 'monitor_log_append') throw new Error('disk full'); return { supported: true }; };
  const c = createMonitorController({ startStream: streams.start, invoke, timers: fakeTimers(), onAlert: () => { throw new Error('UI bug'); } });
  await c.start({ ...CFG, decks: [{ deck: 'A', pair: 1 }] });
  streams.opened[0].push(tc(20, 32));
  streams.opened[0].push(tc(8, 9, 3));
  assert.equal(c.state, 'running');
  for (let i = 0; i < 700; i++) c.events.add({ kind: 'x', severity: 'info', tMs: i });
  assert.equal(c.events.size, 500);
  const sum = await c.stop();
  assert.ok(sum.eventsDropped >= 1, 'failed appends are counted as dropped');
});

test('screen helpers: sparkline path, deck card view, log formatting, History row', () => {
  assert.equal(sparklinePath([]), '');
  assert.equal(sparklinePath([45, NaN, 0, 0], { width: 30, height: 10 }), 'M0.0 0.0 M20.0 10.0 L30.0 10.0');
  const v = deckView({ state: 'nosignal', motion: 'idle', levelDb: -240, snrDb: NaN, humDb: -140, dropouts: 0 }, { deck: 'B' });
  assert.equal(v.note, 'No signal on Deck B: vinyl stopped or lifted?');
  assert.equal(v.metrics.find(m => m.key === 'level').value, 'silent');
  const p = deckView({ state: 'ok', motion: 'play', locked: true, direction: 'forward', levelDb: -9, snrDb: 30.04, snrBaselineDb: 30, driftDeg: 0.4, speedPct: 0.01, humDb: -70, mainsHz: 50, dropouts: 0 });
  assert.equal(p.metrics.find(m => m.key === 'snr').value, '30.0 dB');
  assert.equal(p.metrics.find(m => m.key === 'lock').value, 'Locked, forward');
  assert.equal(deckView(null).state, 'waiting');
  assert.equal(formatClock(61_000), '1:01');
  assert.equal(formatClock(3_725_000), '1:02:05');
  const row = { id: 'x', startedAt: '2026-10-28T21:00:00.000Z', endedAt: '2026-10-28T23:00:00.000Z', format: 'Traktor Scratch MK2', deviceName: 'Traktor Audio 8 DJ', criticalCount: 1, warningCount: 2 };
  assert.equal(sessionDurationSec(row), 7200);
  assert.equal(sessionMeta(row), 'Traktor Scratch MK2 · Traktor Audio 8 DJ · 2:00:00 · 1 critical · 2 warnings');
  assert.equal(sessionWorst(row), 'critical');
  assert.equal(logFileStem(row), 'deckchek-live-monitor-20261028-2100');
  const hist = mapMonitorSession({ ...row, summary: { durationSec: 7200 } });
  assert.equal(hist.id, 'monitor:x');
  assert.equal(hist.status, 'fail');
  assert.equal(hist.screen, 'monitor');
  assert.equal(hist.feature, 'liveMonitor');
  assert.match(hist.meta, /2 h 0 min · 1 critical · 2 warnings/);
  assert.equal(mapMonitorSession({ id: 'y', startedAt: 'bad' }), null);
  assert.equal(mapMonitorSession({ id: 'z', startedAt: row.startedAt, endedAt: row.endedAt }).status, 'pass');
  assert.ok(RUN_TYPES.some(t => t.id === 'monitor' && t.feature === 'liveMonitor'));
});
