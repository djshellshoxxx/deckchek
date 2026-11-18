// FS-31 review regressions (app/monitor.js engine + controller, app/history-feed.js): each test reproduces one
// confirmed review finding and names it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quadratureTimecode } from './fixtures/signals.mjs';
import { findFormat, directionSign } from '../app/timecode.js';
import { createMonitor, createMonitorController, trayStateFor, classifyStartError, sanitizeLabel } from '../app/monitor.js';
import { mapMonitorSession } from '../app/history-feed.js';

const SR = 48000;

function tc(fmtName, opts = {}) {
  const f = findFormat(fmtName);
  return quadratureTimecode({ carrierHz: f.carrierHz, phaseSign: directionSign(f), sampleRate: SR, snrDb: 35, ...opts });
}

function concat(...sigs) {
  const n = sigs.reduce((a, s) => a + s.left.length, 0);
  const left = new Float32Array(n), right = new Float32Array(n);
  let o = 0;
  for (const s of sigs) { left.set(s.left, o); right.set(s.right, o); o += s.left.length; }
  return { left, right, sampleRate: sigs[0].sampleRate };
}

const silence = (seconds, sampleRate = SR) => ({ left: new Float32Array(Math.round(seconds * sampleRate)), right: new Float32Array(Math.round(seconds * sampleRate)), sampleRate });

function stream(sig, monitor) {
  const hop = Math.round((sig.sampleRate ?? SR) / 4);
  const frames = [];
  for (let o = 0; o < sig.left.length; o += hop) frames.push(monitor.push(sig.left.subarray(o, o + hop), sig.right.subarray(o, o + hop), sig.sampleRate ?? SR));
  return { frames, alerts: frames.flatMap(f => monitor.alerts(f)) };
}

// ---------------------------------------------------------------- AC-3 floor alarm below 6 dB

test('regression: AC-3 floor alarm fires when SNR collapses below 6 dB (5, 3, 0 dB) with the carrier at speed; tray fault', () => {
  for (const name of ['Serato CV02.5', 'Traktor Scratch MK2']) {
    for (const snr of [5, 3, 0]) {
      const m = createMonitor({ format: name });
      const { frames, alerts } = stream(concat(tc(name, { seconds: 15, snrDb: 30, seed: 1 }), tc(name, { seconds: 10, snrDb: snr, seed: 8 })), m);
      const floor = alerts.find(a => a.kind === 'snrFloor');
      assert.ok(floor, `${name} ${snr} dB: snrFloor raised (alerts: ${alerts.map(a => a.kind).join() || 'none'})`);
      assert.equal(floor.severity, 'critical');
      assert.ok(floor.t >= 17 && floor.t <= 18, `${name} ${snr} dB: raised after 2 s, at ${floor.t}`);
      const last = frames.at(-1);
      assert.equal(last.state, 'fault', `${name} ${snr} dB: last frame state`);
      assert.equal(trayStateFor(frames.slice(-1).map(f => f.state)), 'fault');
    }
  }
});

test('regression: AC-3 controller turns the tray to fault when one deck collapses to 3 dB SNR', async () => {
  const name = 'Traktor Scratch MK2';
  let onBlock = null;
  const startStream = async args => { onBlock = args.onBlock; return { info: { deviceName: 'X', sampleRate: SR }, async stop() {} }; };
  const trays = [];
  const invoke = async (cmd, args) => (cmd === 'monitor_session_start' ? { id: '00000000-0000-4000-8000-000000000031' } : cmd === 'monitor_set_tray_state' ? (trays.push(args.state), { supported: true }) : { eventsDropped: 0 });
  const c = createMonitorController({ startStream, invoke, timers: { setTimeout() {}, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {} } });
  assert.equal((await c.start({ decks: [{ deck: 'A', pair: 1 }], format: name })).ok, true);
  const sig = concat(tc(name, { seconds: 15, snrDb: 30, seed: 1 }), tc(name, { seconds: 10, snrDb: 3, seed: 8 }));
  for (let o = 0; o < sig.left.length; o += SR / 4) onBlock({ sampleRate: SR, frames: SR / 4, quality: { droppedBlocks: 0 }, pairs: [{ left: sig.left.subarray(o, o + SR / 4), right: sig.right.subarray(o, o + SR / 4) }] });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(c.tray.state, 'fault');
  assert.equal(trays.at(-1), 'fault');
  assert.ok(c.events.list().some(e => e.kind === 'snrFloor' && e.severity === 'critical'));
  await c.stop();
});

test('regression: AC-3 floor rule below the lock gate still ignores long scratches (smeared carrier reads as low SNR)', () => {
  for (const name of ['Serato CV02.5', 'Traktor Scratch MK2', 'Traktor Scratch MK1', 'MixVibes DVS V2']) {
    for (const hz of [0.4, 0.7, 1, 2, 3]) {
      const v = t => (t < 15 ? 1 : 1.2 * Math.sin(2 * Math.PI * hz * (t - 15)));
      const sig = tc(name, { seconds: 27, snrDb: 35, velocityProfile: v, seed: 3 });
      for (let i = 0; i < sig.left.length; i++) { const k = Math.min(1.5, Math.abs(v(i / SR))); sig.left[i] *= k; sig.right[i] *= k; }
      const { alerts } = stream(sig, createMonitor({ format: name }));
      assert.deepEqual(alerts.filter(a => a.severity !== 'info').map(a => `${a.t.toFixed(1)} ${a.message}`), [], `${name} scratch at ${hz} Hz`);
    }
  }
});

// ---------------------------------------------------------------- fault latched while idle

test('regression: a fault raised during play does not stay latched while the vinyl is stopped or lifted', () => {
  const m = createMonitor({ format: 'Serato CV02.5', deck: 'A' });
  const { frames, alerts } = stream(concat(tc('Serato CV02.5', { seconds: 15, snrDb: 30 }), tc('Serato CV02.5', { seconds: 4, snrDb: 9, seed: 8 }), silence(60)), m);
  assert.ok(alerts.some(a => a.kind === 'snrFloor'), 'the fault was raised during play');
  const idle = frames.filter(f => f.t >= 21);
  assert.ok(idle.every(f => f.motion === 'idle'), 'silence is idle');
  assert.deepEqual([...new Set(idle.map(f => f.state))].sort(), ['idle', 'nosignal'], 'idle, then the no-signal info state; never fault');
  assert.equal(frames.at(-1).state, 'nosignal');
  assert.equal(trayStateFor([frames.at(-1).state]), 'ok');
  assert.deepEqual(m.activeKinds(), [], 'play-only rules are cleared while lifted');
  // a healthy record afterwards is OK at once (no stale fault waiting for 2N frames)
  const back = stream(tc('Serato CV02.5', { seconds: 3, snrDb: 30, seed: 9 }), m).frames;
  assert.equal(back.at(-1).state, 'ok');
});

// ---------------------------------------------------------------- one monotonic session clock

test('regression: a sample-rate change keeps the session clock, minute indexes and totals (no restart at t=0)', () => {
  const m = createMonitor({ format: 'Serato CV02.5' });
  const a = stream(tc('Serato CV02.5', { seconds: 70, snrDb: 30 }), m);
  const s44 = quadratureTimecode({ carrierHz: 1000, sampleRate: 44100, seconds: 70, snrDb: 30, seed: 3 });
  const b = stream(s44, m);
  const frames = [...a.frames, ...b.frames];
  for (let i = 1; i < frames.length; i++) assert.ok(frames[i].t > frames[i - 1].t, `clock moves forward at frame ${i}: ${frames[i - 1].t} -> ${frames[i].t}`);
  assert.ok(Math.abs(frames.at(-1).t - 140) < 0.3, `t continues across the rate change: ${frames.at(-1).t}`);
  const minutes = [...frames.map(f => f.minute).filter(Boolean), m.flushMinute()];
  assert.deepEqual(minutes.map(x => x.minute), [0, 1, 2], 'each minute index once, in order');
  assert.equal(m.summary().frames, frames.length, 'totals cover the whole session');
  assert.ok(Math.abs(b.frames.at(-1).carrierHz - 1000) < 1, 'analysis works at the new rate');
});

function rateStreams(rates) {
  const opened = [];
  const start = async args => {
    const sampleRate = rates[Math.min(opened.length, rates.length - 1)];
    const s = { args, sampleRate, info: { deviceName: 'Traktor Audio 8 DJ', sampleRate }, async stop() { s.stopped = true; } };
    s.push = sig => {
      const hop = Math.round(sampleRate / 4);
      for (let o = 0; o + hop <= sig.left.length; o += hop) args.onBlock({ sampleRate, frames: hop, quality: { droppedBlocks: 0 }, pairs: [{ left: sig.left.subarray(o, o + hop), right: sig.right.subarray(o, o + hop) }] });
    };
    s.end = reason => args.onEnd({ reason });
    opened.push(s);
    return s;
  };
  return { start, opened };
}

function recordingInvoke() {
  const calls = [];
  const fn = async (cmd, args) => {
    calls.push([cmd, structuredClone(args)]);
    if (cmd === 'monitor_session_start') return { id: '00000000-0000-4000-8000-000000000031' };
    if (cmd === 'monitor_set_tray_state') return { supported: true };
    if (cmd === 'monitor_log_append') return { eventsStored: args.events.length, eventsDropped: 0, minutesStored: args.minutes.length };
    return null;
  };
  fn.of = cmd => calls.filter(c => c[0] === cmd).map(c => c[1]);
  return fn;
}

function manualTimers() {
  const pending = [];
  return {
    setTimeout(fn, ms) { const t = { fn, ms }; pending.push(t); return t; },
    clearTimeout(t) { const i = pending.indexOf(t); if (i >= 0) pending.splice(i, 1); },
    setInterval() { return 1; }, clearInterval() {},
    async runAll() { while (pending.length) await pending.shift().fn(); },
  };
}

for (const rates of [[48000, 48000], [48000, 44100]]) {
  test(`regression: reconnect (${rates.join(' -> ')} Hz) keeps one time base: device events and later alerts in order, minute indexes never repeat`, async () => {
    const streams = rateStreams(rates), invoke = recordingInvoke(), timers = manualTimers();
    let now = 5_000_000;
    const c = createMonitorController({ startStream: streams.start, invoke, timers, now: () => now });
    assert.equal((await c.start({ decks: [{ deck: 'A', pair: 1 }], format: 'Serato CV02.5' })).ok, true);
    streams.opened[0].push(tc('Serato CV02.5', { seconds: 70, snrDb: 30 }));
    now += 70_000;
    streams.opened[0].end('deviceLost');
    now += 120_000; // two minutes without the interface
    await timers.runAll();
    assert.equal(c.state, 'running');
    const r2 = rates[1];
    const f = findFormat('Serato CV02.5');
    const mk = (seconds, snrDb, seed) => quadratureTimecode({ carrierHz: f.carrierHz, sampleRate: r2, seconds, snrDb, seed });
    streams.opened[1].push(concat(mk(15, 30, 4), mk(4, 9, 5)));
    now += 19_000;
    await c.stop();
    const events = invoke.of('monitor_log_append').flatMap(a => a.events);
    const lost = events.find(e => e.kind === 'deviceLost'), back = events.find(e => e.kind === 'deviceRestored'), floor = events.find(e => e.kind === 'snrFloor');
    assert.ok(lost && back && floor, events.map(e => e.kind).join());
    assert.ok(lost.tMs <= back.tMs, `lost ${lost.tMs} <= back ${back.tMs}`);
    assert.ok(back.tMs - lost.tMs >= 115_000, 'the outage shows on the session clock');
    assert.ok(floor.tMs > back.tMs, `the post-reconnect alert (${floor.tMs}) sorts after "device back" (${back.tMs})`);
    const sorted = [...events].sort((a, b) => a.tMs - b.tMs).map(e => e.kind);
    assert.deepEqual(sorted.filter(k => ['deviceLost', 'deviceRestored', 'snrFloor'].includes(k)), ['deviceLost', 'deviceRestored', 'snrFloor']);
    const minutes = invoke.of('monitor_log_append').flatMap(a => a.minutes);
    const keys = minutes.map(m => `${m.deck}:${m.minute}`);
    assert.equal(new Set(keys).size, keys.length, `no minute index is sent twice: ${keys.join()}`);
    assert.ok(minutes.some(m => m.minute === 0) && minutes.some(m => m.minute >= 3), `minutes after the gap are labelled after it: ${keys.join()}`);
    const sum = invoke.of('monitor_session_end')[0].summary;
    assert.ok(sum.decks[0].frames >= (70 + 19) * 4 - 2, `summary covers both stretches: ${sum.decks[0].frames} frames`);
  });
}

// ---------------------------------------------------------------- start-error classification

test('regression: start-error classification ignores device-name text (Centauri, Busy, In Use, Exclusive)', () => {
  for (const nm of ['Centauri USB', 'Busy Box DJ', 'Mixer In Use Edition', 'Exclusive Tauri Desktop App']) {
    assert.equal(classifyStartError(new Error(`Audio input not found: ${nm}`)).code, 'NO_DEVICE', nm);
    assert.equal(classifyStartError(`Input pair 3-4 is not available on ${nm}: it has 2 input channels (pairs 1-2).`).code, 'PAIR', nm);
    // free-form errors quoting the selected device name are matched without it
    assert.equal(classifyStartError(new Error(`${nm}: device disconnected`), { deviceName: nm }).code, 'NO_DEVICE', nm);
  }
  // the real busy / unsupported messages still classify as before
  assert.equal(classifyStartError('AUDCLNT_E_DEVICE_IN_USE (0x8889000A)', { deviceName: 'Centauri USB' }).code, 'DEVICE_BUSY');
  assert.equal(classifyStartError('Native audio capture is only available in the DeckChek desktop app.').state, 'unsupported');
});

test('regression: the controller passes the selected device name to the start-error classifier', async () => {
  const startStream = async () => { throw new Error('Centauri USB: no such device'); };
  const c = createMonitorController({ startStream, invoke: null, timers: manualTimers() });
  const r = await c.start({ deviceName: 'Centauri USB', decks: [{ deck: 'A', pair: 1 }], format: 'Serato CV02.5' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'NO_DEVICE');
  assert.equal(c.state, 'error');
});

// ---------------------------------------------------------------- History duration

test("regression: History duration never shows '1 h 60 min' near an hour boundary", () => {
  const row = sec => mapMonitorSession({ id: 'x', startedAt: '2026-10-28T21:00:00.000Z', endedAt: '2026-10-28T23:00:00.000Z', summary: { durationSec: sec } }).meta;
  assert.match(row(7170), /^2 h 0 min/);
  assert.match(row(7199.9), /^2 h 0 min/);
  assert.match(row(3590), /^1 h 0 min/);
  assert.match(row(3600 + 29), /^1 h 0 min/);
  assert.match(row(3600 + 31), /^1 h 1 min/);
  assert.match(row(5400), /^1 h 30 min/);
  assert.match(row(1500), /^25 min/);
  assert.match(row(10), /^1 min/);
  for (let s = 0; s < 6 * 3600; s += 7) assert.doesNotMatch(row(s), /\b60 min/, `sec ${s}`);
});

// ---------------------------------------------------------------- device-name labels

test('regression: an unsanitised device name from the stream never stops the session log from being saved', async () => {
  const hostile = `Bad\u0007Name\twith\nnewline${'x'.repeat(300)}\u0085`;
  const startStream = async () => ({ info: { deviceName: hostile, sampleRate: SR }, async stop() {} });
  const invoke = recordingInvoke();
  const c = createMonitorController({ startStream, invoke, timers: manualTimers() });
  const r = await c.start({ decks: [{ deck: 'A', pair: 1 }], format: 'Serato CV02.5' });
  assert.equal(r.ok, true);
  const sent = invoke.of('monitor_session_start')[0].input.deviceName;
  assert.ok(!/\p{Cc}/u.test(sent), JSON.stringify(sent));
  assert.ok(sent.length <= 200 && sent.startsWith('Bad Name with newline'), JSON.stringify(sent));
  assert.equal(c.info.persisted, true);
  assert.equal(sanitizeLabel('  \u0000 '), null);
  assert.equal(sanitizeLabel(null), null);
  assert.equal(sanitizeLabel('Traktor Audio 8 DJ'), 'Traktor Audio 8 DJ');
  await c.stop();
});

// ---------------------------------------------------------------- stop during the session_start await

test('regression: stopping during the session_start await leaves no open session row, no flush interval and the tray off', async () => {
  let resolveStart;
  const calls = [];
  const invoke = async (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === 'monitor_session_start') return new Promise(r => { resolveStart = r; });
    if (cmd === 'monitor_set_tray_state') return { supported: true };
    return null;
  };
  const intervals = new Set();
  let nextId = 1;
  const timers = { setTimeout() { return 0; }, clearTimeout() {}, setInterval() { const id = nextId++; intervals.add(id); return id; }, clearInterval(id) { intervals.delete(id); } };
  const startStream = async () => ({ info: { deviceName: 'X', sampleRate: SR }, async stop() {} });
  const c = createMonitorController({ startStream, invoke, timers });
  const started = c.start({ decks: [{ deck: 'A', pair: 1 }], format: 'Serato CV02.5' });
  for (let i = 0; i < 20 && !resolveStart; i++) await new Promise(r => setTimeout(r, 0));
  assert.ok(resolveStart, 'session_start is in flight');
  const stopped = c.stop();
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
  resolveStart({ id: '00000000-0000-4000-8000-0000000000aa' });
  const r = await started;
  await stopped;
  assert.equal(r.ok, false);
  assert.equal(c.state, 'idle');
  const ends = calls.filter(x => x[0] === 'monitor_session_end');
  assert.equal(ends.length, 1, 'the row created by the late session_start is closed');
  assert.equal(ends[0][1].sessionId, '00000000-0000-4000-8000-0000000000aa');
  assert.equal(intervals.size, 0, 'no flush interval left running');
  const trays = calls.filter(x => x[0] === 'monitor_set_tray_state').map(x => x[1].state);
  assert.equal(trays.at(-1), 'off', `tray calls: ${trays.join()}`);
  assert.equal(c.tray.state, 'off');
});

// ---------------------------------------------------------------- running session deleted / end failed

test('regression: when the session log cannot be closed the idle state reports persisted=false', async () => {
  const states = [];
  const invoke = async cmd => {
    if (cmd === 'monitor_session_start') return { id: '00000000-0000-4000-8000-000000000031' };
    if (cmd === 'monitor_set_tray_state') return { supported: true };
    if (cmd === 'monitor_session_end') throw new Error('unknown monitor session');
    if (cmd === 'monitor_log_append') throw new Error('unknown monitor session');
    return null;
  };
  const startStream = async () => ({ info: { deviceName: 'X', sampleRate: SR }, async stop() {} });
  const c = createMonitorController({ startStream, invoke, timers: manualTimers(), onState: (s, i) => states.push([s, i]) });
  await c.start({ decks: [{ deck: 'A', pair: 1 }], format: 'Serato CV02.5' });
  await c.stop();
  const [s, info] = states.at(-1);
  assert.equal(s, 'idle');
  assert.equal(info.persisted, false);
  // and a normal stop reports persisted=true
  const ok = createMonitorController({ startStream, invoke: recordingInvoke(), timers: manualTimers(), onState: (st, i) => states.push([st, i]) });
  await ok.start({ decks: [{ deck: 'A', pair: 1 }], format: 'Serato CV02.5' });
  await ok.stop();
  assert.equal(states.at(-1)[1].persisted, true);
});
