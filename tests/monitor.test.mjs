// FS-31 live monitor engine (app/monitor.js) on the seeded synthetic signals of tests/fixtures/signals.mjs:
// quadrature timecode per format (incl. phaseSign -1 and left-primary formats), injected noise, dropouts, mains
// hum, pitch sweeps, silence; alarm hysteresis, cooldown, bounded helpers, settings and config validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quadratureTimecode, humMix } from './fixtures/signals.mjs';
import { TIMECODE_FORMATS, findFormat, directionSign } from '../app/timecode.js';
import {
  createMonitor, createRing, createEventLog, median, normalizeSettings, validateConfig, classifyStartError, trayStateFor,
  sessionSummary, exportLog, kindLabel, DEFAULT_SETTINGS, DEFAULT_THRESHOLDS, DEVICE_BUSY_COPY, WORKAROUNDS, DECK_STATE, HOLDER,
} from '../app/monitor.js';

const SR = 48000;
const HOP = SR / 4; // 250 ms

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

function addHum(sig, fromSec, dbfs, mainsHz = 50) {
  const h = humMix({ mainsHz, harmonics: [{ n: 1, dbfs }, { n: 3, dbfs: dbfs - 6 }], seconds: sig.left.length / SR, sampleRate: SR, seed: 5 });
  for (let i = Math.round(fromSec * SR); i < sig.left.length; i++) { sig.left[i] += h.samples[i]; sig.right[i] += h.samples[i]; }
  return sig;
}

/** Stream a signal through a monitor hop by hop; returns {monitor, frames, alerts}. */
function stream(sig, fmtName, { hop = HOP, monitor, ...opts } = {}) {
  const m = monitor || createMonitor({ format: fmtName, deck: 'A', ...opts });
  const frames = [];
  for (let o = 0; o < sig.left.length; o += hop) frames.push(m.push(sig.left.subarray(o, o + hop), sig.right.subarray(o, o + hop), sig.sampleRate ?? SR));
  return { monitor: m, frames, alerts: frames.flatMap(f => m.alerts(f)) };
}

const serious = alerts => alerts.filter(a => a.severity !== 'info');

test('AC-1 healthy Serato 1 kHz and Traktor MK2 2.5 kHz: no alerts, state ok, per-deck SNR, level and drift', () => {
  for (const name of ['Serato CV02.5', 'Traktor Scratch MK2']) {
    const { frames, alerts } = stream(tc(name, { seconds: 20, snrDb: 30, seed: 3 }), name);
    assert.deepEqual(alerts, [], name);
    const last = frames.at(-1);
    assert.equal(last.state, 'ok', name);
    assert.equal(last.motion, 'play', name);
    assert.equal(last.locked, true, name);
    assert.ok(Math.abs(last.snrDb - 30) <= 1.5, `${name} SNR ${last.snrDb} within +-1.5 dB of 30`);
    assert.ok(Math.abs(last.levelDb - -9) < 0.5, `${name} level ${last.levelDb} (a -6 dBFS peak tone is -9 dBFS RMS)`);
    assert.ok(Math.abs(last.driftDeg) < 2, `${name} drift ${last.driftDeg}`);
    assert.ok(Math.abs(last.speedPct) < 0.1, `${name} speed ${last.speedPct}`);
    assert.equal(trayStateFor(frames.slice(-1).map(f => f.state)), 'ok');
  }
});

test('AC-1 every built-in format reads forward at 33 1/3 (phaseSign -1 and left-primary formats included)', () => {
  const seen = new Set();
  for (const f of TIMECODE_FORMATS) {
    if (seen.has(`${f.carrierHz}/${directionSign(f)}/${f.primary}`)) continue;
    seen.add(`${f.carrierHz}/${directionSign(f)}/${f.primary}`);
    const { frames, alerts } = stream(tc(f.name, { seconds: 4 }), f.name);
    const last = frames.at(-1);
    assert.equal(last.direction, 'forward', f.name);
    assert.equal(last.motion, 'play', f.name);
    assert.ok(Math.abs(last.carrierHz / f.carrierHz - 1) < 0.001, `${f.name} carrier ${last.carrierHz}`);
    assert.deepEqual(serious(alerts), [], f.name);
  }
  // the same samples read as reverse when played backwards (velocity -1): not "play", so no alarms either
  const back = stream(tc('Traktor Scratch MK1', { seconds: 4, velocityProfile: -1 }), 'Traktor Scratch MK1').frames.at(-1);
  assert.equal(back.direction, 'reverse');
  assert.equal(back.motion, 'cue');
  // a phaseSign -1 recording analysed as a +1 format reads reverse (the switch matters)
  const swapped = stream(tc('MixVibes DVS V2', { seconds: 3 }), 'Serato CV02.5', {}).frames.at(-1);
  assert.notEqual(swapped.direction, 'forward');
});

test('SNR estimate tracks the injected noise within the +-1.5 dB uncertainty (12-35 dB)', () => {
  for (const snr of [12, 15, 20, 25, 30, 35]) {
    const { frames } = stream(tc('Serato CV02.5', { seconds: 3, snrDb: snr, seed: snr }), 'Serato CV02.5');
    const v = frames.at(-1).snrDb;
    assert.ok(Math.abs(v - snr) <= 1.5, `snr ${snr}: measured ${v}`);
  }
});

test('AC-2 SNR more than 6 dB below the 60 s baseline for 5 s raises one amber alert "Deck A: timecode SNR dropped N dB"', () => {
  const sig = concat(tc('Serato CV02.5', { seconds: 20, snrDb: 32, seed: 1 }), tc('Serato CV02.5', { seconds: 10, snrDb: 24, seed: 2 }));
  const { frames, alerts } = stream(sig, 'Serato CV02.5');
  assert.equal(alerts.length, 1);
  const a = alerts[0];
  assert.equal(a.kind, 'snrDrop');
  assert.equal(a.severity, 'warning');
  assert.match(a.message, /^Deck A: timecode SNR dropped \d+ dB$/);
  assert.ok(Math.abs(Number(/dropped (\d+)/.exec(a.message)[1]) - 8) <= 1, a.message);
  assert.ok(a.t >= 25 && a.t <= 25.75, `raised after 5 s below baseline, at ${a.t}`);
  assert.ok(Math.abs(a.baseline - 32) <= 1.5 && Math.abs(a.value - 24) <= 1.5);
  assert.equal(frames.at(-1).state, 'watch');
  assert.equal(trayStateFor(['ok', frames.at(-1).state]), 'watch');
  // 4 s below the baseline is not enough
  const short = concat(tc('Serato CV02.5', { seconds: 20, snrDb: 32, seed: 1 }), tc('Serato CV02.5', { seconds: 4, snrDb: 24, seed: 2 }), tc('Serato CV02.5', { seconds: 8, snrDb: 32, seed: 4 }));
  assert.deepEqual(stream(short, 'Serato CV02.5').alerts, []);
});

test('AC-2 cooldown: the same alert is not repeated within 60 s, and is after it; hysteresis clears after 2N frames', () => {
  const good = s => tc('Serato CV02.5', { seconds: s, snrDb: 32, seed: 11 + s });
  const bad = s => tc('Serato CV02.5', { seconds: s, snrDb: 24, seed: 21 + s });
  const sig = concat(good(20), bad(7), good(12), bad(7), good(40), bad(7));
  const { frames, alerts } = stream(sig, 'Serato CV02.5');
  const drops = alerts.filter(a => a.kind === 'snrDrop');
  assert.equal(drops.length, 2, drops.map(a => a.t).join());
  assert.ok(drops[1].t - drops[0].t >= 60);
  // cleared (state ok) during the good stretch after the first episode, i.e. after 2N = 10 s of good frames
  const okAt = frames.find(f => f.t > 28 && f.state === 'ok');
  assert.ok(okAt && okAt.t >= 27 + 10 - 0.5 && okAt.t <= 27 + 10.75, `cleared at ${okAt?.t}`);
});

test('AC-3 SNR under 12 dB for 2 s is critical (red); dropouts >= 3 in 10 s are critical', () => {
  const low = stream(concat(tc('Traktor Scratch MK2', { seconds: 15, snrDb: 30 }), tc('Traktor Scratch MK2', { seconds: 4, snrDb: 9, seed: 8 })), 'Traktor Scratch MK2');
  const floor = low.alerts.find(a => a.kind === 'snrFloor');
  assert.ok(floor, 'snrFloor raised');
  assert.equal(floor.severity, 'critical');
  assert.ok(floor.t >= 17 && floor.t <= 17.75, `after 2 s, at ${floor.t}`);
  assert.equal(low.frames.at(-1).state, 'fault');
  assert.equal(trayStateFor(['ok', 'watch', 'fault']), 'fault');

  const drops = stream(tc('Serato CV02.5', { seconds: 20, snrDb: 30, dropouts: [[12, 12.06], [13.1, 13.18], [14.5, 14.56]] }), 'Serato CV02.5');
  const crit = drops.alerts.filter(a => a.kind === 'dropouts');
  assert.equal(crit.length, 1);
  assert.equal(crit[0].severity, 'critical');
  assert.match(crit[0].message, /^Deck A: 3 timecode dropouts in 10 s$/);
  assert.equal(drops.monitor.summary().dropouts, 3);
  // two dropouts are not enough; three spread over more than 10 s neither
  assert.deepEqual(serious(stream(tc('Serato CV02.5', { seconds: 20, snrDb: 30, dropouts: [[12, 12.06], [13.1, 13.18]] }), 'Serato CV02.5').alerts), []);
  assert.deepEqual(serious(stream(tc('Serato CV02.5', { seconds: 40, snrDb: 30, dropouts: [[12, 12.06], [18, 18.06], [24, 24.06]] }), 'Serato CV02.5').alerts), []);
  // a 1-window (20 ms) gap is below dropoutMetrics' minWindows=2
  assert.equal(stream(tc('Serato CV02.5', { seconds: 16, snrDb: 30, dropouts: [[12.0, 12.015]] }), 'Serato CV02.5').monitor.summary().dropouts, 0);
});

test('AC-4 50/60 Hz hum rising over 10 dB above its baseline warns with likely cause "ground loop/cable"', () => {
  for (const mains of [50, 60]) {
    const { alerts, frames } = stream(addHum(tc('Serato CV02.5', { seconds: 30, snrDb: 30 }), 15, -50, mains), 'Serato CV02.5');
    const hum = alerts.filter(a => a.kind === 'hum');
    assert.equal(hum.length, 1, `${mains} Hz`);
    assert.equal(hum[0].severity, 'warning');
    assert.equal(hum[0].cause, 'ground loop/cable');
    assert.match(hum[0].message, new RegExp(`${mains} Hz hum rose \\d+ dB\\. Likely cause: ground loop/cable`));
    assert.ok(hum[0].t >= 20 && hum[0].t <= 21, `after 5 s at ${hum[0].t}`);
    assert.equal(frames.at(-1).mainsHz, mains);
  }
  // a smaller rise (hum 6 dB above the floor) does not warn, and broadband noise rising is not hum
  assert.deepEqual(stream(concat(tc('Serato CV02.5', { seconds: 20, snrDb: 32 }), tc('Serato CV02.5', { seconds: 10, snrDb: 18, seed: 3 })), 'Serato CV02.5').alerts.filter(a => a.kind === 'hum'), []);
});

test('pitch fader sweep (+8 % over 2 s) gives no drift or phase alert and is tracked as play', () => {
  const v = t => (t < 10 ? 1 : t < 12 ? 1 + 0.04 * (t - 10) : t < 20 ? 1.08 : t < 24 ? 1.08 - 0.04 * (t - 20) : 0.92);
  const { frames, alerts } = stream(tc('Serato CV02.5', { seconds: 30, snrDb: 30, velocityProfile: v }), 'Serato CV02.5');
  assert.deepEqual(serious(alerts), []);
  assert.ok(frames.every(f => f.t < 1 || f.motion === 'play'), 'sweeps stay "play"');
  assert.ok(Math.abs(frames.at(-1).speedPct - -8) < 0.2, `speed ${frames.at(-1).speedPct}`);
});

test('phase jitter (wobbling L/R relation at steady speed) raises the phase warning', () => {
  const sig = tc('Serato CV02.5', { seconds: 30, snrDb: 30 });
  // from 15 s, modulate the right channel's phase by +-40 deg at 3 Hz (an intermittent cartridge/cable)
  const f = 1000;
  for (let i = 15 * SR; i < sig.left.length; i++) {
    const t = i / SR, ph = 2 * Math.PI * f * t, d = (40 * Math.PI / 180) * Math.sin(2 * Math.PI * 3 * t);
    sig.right[i] = 0.5 * Math.sin(ph + Math.PI / 2 + d);
  }
  const phase = stream(sig, 'Serato CV02.5').alerts.filter(a => a.kind === 'phase');
  assert.equal(phase.length, 1);
  assert.equal(phase[0].severity, 'warning');
});

test('silence is idle, not a fault; after 10 s it is the "No signal on Deck B" info, never an alarm', () => {
  const sig = concat(tc('Serato CV02.5', { seconds: 12 }), { left: new Float32Array(SR * 15), right: new Float32Array(SR * 15), sampleRate: SR });
  const { frames, alerts } = stream(sig, 'Serato CV02.5', { deck: 'B' });
  assert.deepEqual(serious(alerts), []);
  const info = alerts.filter(a => a.kind === 'noSignal');
  assert.equal(info.length, 1);
  assert.equal(info[0].severity, 'info');
  assert.equal(info[0].message, 'No signal on Deck B: vinyl stopped or lifted?');
  assert.ok(info[0].t >= 22 && info[0].t <= 22.75);
  assert.equal(frames.find(f => f.t > 13 && f.t < 20).state, 'idle');
  assert.equal(frames.at(-1).state, 'nosignal');
  assert.equal(frames.at(-1).motion, 'idle');
});

test('hysteresis: N consecutive frames to raise, a single good frame resets the count', () => {
  const m = createMonitor({ format: 'Serato CV02.5', thresholds: { snrFloorSec: 2 } });
  const good = tc('Serato CV02.5', { seconds: 12, snrDb: 30 });
  stream(good, null, { monitor: m });
  // alternate 1.5 s bad / 0.5 s good: never 2 s in a row below the floor
  const parts = [];
  for (let k = 0; k < 6; k++) parts.push(tc('Serato CV02.5', { seconds: 1.5, snrDb: 9, seed: 40 + k }), tc('Serato CV02.5', { seconds: 0.5, snrDb: 30, seed: 50 + k }));
  assert.deepEqual(stream(concat(...parts), null, { monitor: m }).alerts.filter(a => a.kind === 'snrFloor'), []);
});

test('results do not depend on the block size the stream arrives in', () => {
  const sig = tc('Traktor Scratch MK2', { seconds: 6, snrDb: 25 });
  const a = stream(sig, 'Traktor Scratch MK2', { hop: HOP }).frames.at(-1);
  const b = stream(sig, 'Traktor Scratch MK2', { hop: 4801 }).frames.at(-1);
  assert.ok(Math.abs(a.snrDb - b.snrDb) < 0.5 && Math.abs(a.carrierHz - b.carrierHz) < 0.5 && Math.abs(a.phaseDeg - b.phaseDeg) < 1);
});

test('sample-rate change restarts the analysis but not the session clock; reset() clears state; bad rates throw', () => {
  const m = createMonitor({ format: 'Serato CV02.5' });
  stream(tc('Serato CV02.5', { seconds: 3 }), null, { monitor: m });
  const s44 = quadratureTimecode({ carrierHz: 1000, sampleRate: 44100, seconds: 2, snrDb: 30 });
  const f = stream(s44, null, { monitor: m, hop: 11025 }).frames.at(-1);
  // FS-31 review: the clock carries on at the new rate (it restarted at 0 before, overwriting minute rows)
  assert.ok(Math.abs(f.t - 5) < 0.01, `clock continues at the new rate: ${f.t}`);
  assert.ok(Math.abs(f.carrierHz - 1000) < 1);
  m.reset();
  assert.equal(m.summary().frames, 0);
  assert.equal(m.t, 0, 'reset() restarts the clock');
  assert.throws(() => m.push(new Float32Array(10), new Float32Array(10), 0), /Sample rate/);
  assert.throws(() => createMonitor({ format: 'Nope' }), /Unknown timecode format/);
});

test('per-minute summaries roll over each minute (AC-7 data)', () => {
  const { frames, monitor } = stream(tc('Serato CV02.5', { seconds: 125, snrDb: 28, dropouts: [[70, 70.06]] }), 'Serato CV02.5');
  const minutes = frames.map(f => f.minute).filter(Boolean);
  assert.deepEqual(minutes.map(m => m.minute), [0, 1]);
  assert.equal(minutes[0].deck, 'A');
  assert.ok(Math.abs(minutes[0].snrDbMean - 28) < 1.5 && minutes[0].snrDbMin <= minutes[0].snrDbMean);
  assert.equal(minutes[1].dropouts, 1);
  assert.equal(minutes[0].dropouts, 0);
  const last = monitor.flushMinute();
  assert.equal(last.minute, 2);
  assert.equal(monitor.flushMinute(), null);
});

test('AC-5 start errors: exclusive/in-use gives DEVICE_BUSY with the plain explanation and three workarounds', () => {
  for (const msg of ['The device is being used exclusively by another application', 'AUDCLNT_E_DEVICE_IN_USE (0x8889000A)', 'Device busy']) {
    const c = classifyStartError(new Error(msg));
    assert.equal(c.code, 'DEVICE_BUSY', msg);
    assert.equal(c.state, 'device-busy');
  }
  assert.match(DEVICE_BUSY_COPY, /^Another program is using this audio device exclusively/);
  assert.equal(WORKAROUNDS.length, 3);
  assert.match(WORKAROUNDS[0], /multi-client or has a shared\/WDM mode/);
  assert.match(WORKAROUNDS[1], /thru\/aux output into a spare input/);
  assert.match(WORKAROUNDS[2], /split the deck's cable/);
  assert.deepEqual(classifyStartError({ code: 'CAPTURE_BUSY', holder: 'wear-map' }), { state: 'capture-busy', code: 'CAPTURE_BUSY', holder: 'wear-map' });
  assert.equal(classifyStartError('Native audio capture is only available in the DeckChek desktop app.').state, 'unsupported');
  assert.equal(classifyStartError('No input device found').code, 'NO_DEVICE');
  assert.equal(classifyStartError('Unsupported sample format').code, 'FORMAT_UNSUPPORTED');
  assert.equal(classifyStartError('Input pair 9-10 is not available on X: it has 8 input channels (pairs 1-2).').code, 'PAIR');
  assert.equal(classifyStartError(undefined).state, 'error');
  assert.equal(HOLDER, 'live-monitor');
});

test('config validation: decks, pairs, format and hop', () => {
  const ok = validateConfig({ deviceName: 'Traktor Audio 8 DJ', decks: [{ deck: 'A', pair: '1-2' }, { deck: 'B', pair: { first: 3 } }], format: 'Traktor Scratch MK2' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.config.decks, [{ deck: 'A', first: 1 }, { deck: 'B', first: 3 }]);
  assert.equal(ok.config.format, 'Traktor Scratch MK2');
  assert.match(validateConfig({ decks: [], format: 'Serato CV02.5' }).errors.join(), /at least one deck/);
  assert.match(validateConfig({ decks: [{ pair: '1-2' }], format: 'x' }).errors.join(), /timecode format/);
  assert.match(validateConfig({ decks: [{ pair: '1-2' }, { pair: 1 }], format: 'Serato CV02.5' }).errors.join(), /same input pair/);
  assert.match(validateConfig({ decks: [{ pair: '2-3' }], format: 'Serato CV02.5' }).errors.join(), /not valid/);
  assert.match(validateConfig({ decks: [1, 3, 5, 7, 9].map(p => ({ pair: p })), format: 'Serato CV02.5' }).errors.join(), /At most 4/);
  assert.match(validateConfig({ decks: [{ pair: 1 }], format: 'Serato CV02.5', hopMs: 5 }).errors.join(), /Hop/);
  assert.equal(validateConfig({ deviceName: 'x'.repeat(500), decks: [{ pair: 1 }], format: 'Serato CV02.5' }).config.deviceName.length, 200);
});

test('settings (app_state "monitor", version 1) are validated and clamped', () => {
  assert.deepEqual(normalizeSettings(null), { ...DEFAULT_SETTINGS, thresholds: { ...DEFAULT_THRESHOLDS } });
  const s = normalizeSettings({ version: 7, retentionDays: 99999, cooldownSec: -5, toastsEnabled: false, sound: 'yes', thresholds: { snrDropDb: 1000, snrFloorDb: 'x', evil: 1 }, extra: true });
  assert.equal(s.version, 1);
  assert.equal(s.retentionDays, 3650);
  assert.equal(s.cooldownSec, 0);
  assert.equal(s.toastsEnabled, false);
  assert.equal(s.sound, false, 'sound is off unless explicitly true');
  assert.equal(s.thresholds.snrDropDb, 40);
  assert.equal(s.thresholds.snrFloorDb, 12);
  assert.ok(!('evil' in s.thresholds) && !('extra' in s));
});

test('bounded helpers: ring, capped event log, median', () => {
  const r = createRing(3);
  [1, 2, 3, 4].forEach(v => r.push(v));
  assert.deepEqual(Array.from(r.values()), [2, 3, 4]);
  assert.equal(r.at(0), 4);
  assert.equal(r.size, 3);
  const log = createEventLog(2);
  log.add({ a: 1 }); log.add({ a: 2 }); log.add({ a: 3 });
  assert.deepEqual(log.list(), [{ a: 2 }, { a: 3 }]);
  assert.equal(log.dropped, 1);
  assert.equal(median([3, NaN, 1, 2]), 2);
  assert.ok(Number.isNaN(median([])));
});

test('session summary, log export shape, labels and deck state chips (text + icon, not colour only)', () => {
  const s = sessionSummary([{ deck: 'A', alerts: { info: 1, warning: 2, critical: 0 } }, { deck: 'B', alerts: { info: 0, warning: 0, critical: 1 } }], { durationSec: 7200.4, droppedBlocks: 2 });
  assert.equal(s.worst, 'critical');
  assert.deepEqual(s.alerts, { info: 1, warning: 2, critical: 1 });
  assert.equal(s.durationSec, 7200);
  assert.deepEqual(exportLog({ session: { id: 's' }, events: [1], minutes: null }), { version: 1, session: { id: 's' }, events: [1], minutes: [] });
  assert.equal(kindLabel('snrDrop'), 'SNR drop');
  for (const st of ['ok', 'watch', 'fault', 'idle', 'nosignal']) assert.ok(DECK_STATE[st].label && DECK_STATE[st].icon, st);
  assert.equal(trayStateFor([], false), 'off');
});
