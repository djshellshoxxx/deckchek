import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { runAudio } from '../app/ui/devices/audio-runner.js';
import { SAFETY_COPY } from '../app/audio-out.js';
import { CaptureBusyError, parseWav } from '../app/ui/audio-io.js';
import { exportStimulus } from '../app/audio-quality.js';
import { completePlan } from '../app/devices/test-plan.js';
import fs from 'node:fs';

// The runner uses injected audio I/O and the production DOM builders. This fixture models only the DOM
// operations those builders need (as in midi-runner-lifecycle.test.mjs); the callbacks fired below are the
// runner's own event handlers.
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.dataset = {}; this.className = ''; this.attributes = {}; }
  setAttribute(key, value) { this.attributes[key] = value; if (key === 'id') this.id = value; if (key === 'value') this.value = value; if (key === 'disabled') this.disabled = true; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html || ''; }
  set value(value) { this.selectedValue = value; }
  get value() { return this.selectedValue ?? ''; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  removeEventListener(name, callback) { this.listeners[name] = (this.listeners[name] || []).filter(fn => fn !== callback); }
  dispatchEvent() { return true; }
  remove() {}
  async fire(name, extra = {}) { for (const callback of this.listeners[name] || []) await callback({ target: this, currentTarget: this, ...extra }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const match = el => selector.startsWith('#') ? el.id === selector.slice(1) : el.tagName === selector.toUpperCase();
    return this.children.flatMap(child => [...(match(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  get text() { return [this.textContent || '', this.html || '', ...this.children.map(c => c.text)].join(' '); }
  get classList() { return { add() {}, remove() {}, toggle() {} }; }
  focus() { this.focusRequests = (this.focusRequests || 0) + 1; }
}
const previous = { document: globalThis.document, Node: globalThis.Node };
let toastHost = null;
globalThis.Node = Element;
globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => Object.assign(new Element('#text'), { textContent: text }), getElementById: id => (id === 'toasts' ? toastHost : null) };
after(() => Object.assign(globalThis, previous));

const SR = 48000;
// Diagnostic opt-in only: retain references after completed analyses, then hash/serialize
// once in the final hook. No numerical helper is called by this observation path.
const audioContextPath = process.env.DECKCHEK_AUDIO_CONTEXT_PATH;
const completedAudioContexts = [];
const turn = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { for (let i = 0; i < 6; i++) await turn(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

/** A clean device: the capture is the played buffer at the play level, delayed by 211 samples. */
function recording(buffer, levelDbfs, { silent = false } = {}) {
  const amp = silent ? 0 : 10 ** (levelDbfs / 20);
  const mk = s => { const o = new Float32Array(s.length + 211 + 2 * SR); for (let i = 0; i < s.length; i++) o[i + 211] = s[i] * amp; return o; };
  return { left: mk(buffer.left), right: mk(buffer.right), sampleRate: SR };
}

/**
 * Injected audio I/O. `plan` controls each step per attempt: play(n) / stopCapture(n) may return a
 * promise to hold the step; waitPlay(n, options) runs inside the playback wait; startError(n) rejects
 * the capture start of attempt n.
 */
function io(plan = {}) {
  const calls = { play: [], stop: [], stopAll: 0, starts: 0, cancels: 0, captureStops: 0, downloads: [], waits: [] };
  let recorded = null, options = null, attempt = 0;
  const audioOut = {
    supported: true,
    async listOutputs() { return [{ name: 'USB Out', isDefault: true }]; },
    async playBuffer(buffer, opts, extra) {
      calls.play.push({ buffer, opts, extra });
      recorded = recording(buffer, opts.levelDbfs, { silent: plan.silent?.(attempt) });
      return plan.play ? plan.play(attempt) : { handle: 7 };
    },
    async stop(h) { calls.stop.push(h); },
    async stopAll() { calls.stopAll++; return 1; },
  };
  const startCapture = async opts => {
    attempt = ++calls.starts; options = opts;
    const error = plan.startError?.(attempt);
    if (error) throw error;
    return {
      info: { sampleRate: SR, leaseId: attempt, deviceName: 'Interface' },
      async stop() {
        calls.captureStops++; const held = plan.stopCapture?.(attempt); if (held) await held;
        return { audio: recorded, deviceName: 'Interface', streamErrors: [], quality: {
          framesCaptured: recorded.left.length, overrunSamples: 0, clippedSamplesL: 0, clippedSamplesR: 0,
          streamErrors: 0, streamErrorMessages: [], truncated: false, callbackCount: 1, maxCallbackGapMs: 1, pairs: [],
        } };
      },
      async cancel() { calls.cancels++; },
    };
  };
  const wait = async ms => { calls.waits.push(ms); if (ms > 1000 && plan.waitPlay) await plan.waitPlay(attempt, options); };
  return {
    calls, audioOut, startCapture, wait,
    observeCompletedCapture: () => ({ audio: recorded, options, attempt }),
    listInputs: async () => ({ devices: [{ name: 'Interface', isDefault: true }] }),
    liveAvailable: () => true,
    download: (name, data, type) => calls.downloads.push({ name, data, type }),
  };
}
function mount(deps = io(), test = { id: 'aq', method: 'audio:quality', title: 'Output quality', steps: ['Connect the output to the interface input.'] }) {
  const host = new Element('div'), finished = [];
  const runner = runAudio(host, { test, profile: { model: 'Test', specs: [] }, finish: result => {
    finished.push(result);
    if (audioContextPath) completedAudioContexts.push({
      mountKey: finished, test, result, playback: deps.calls.play.slice(),
      capture: deps.observeCompletedCapture(),
      calls: { starts: deps.calls.starts, plays: deps.calls.play.length, saved: finished.length,
        stops: deps.calls.stop.slice(), stopAll: deps.calls.stopAll, captureStops: deps.calls.captureStops,
        cancels: deps.calls.cancels, waits: deps.calls.waits.slice() },
    });
  }, ...deps });
  const click = async id => { const el = host.querySelector(`#${id}`); assert.ok(el, `#${id} is rendered`); await el.fire('click'); };
  return { host, runner, finished, calls: deps.calls, click };
}

test('setup and measuring keep the safety copy visible; the level field never goes above -12 dBFS', async () => {
  const hold = deferred();
  const m = mount(io({ waitPlay: () => hold.promise })); await settle();
  assert.match(m.host.text, new RegExp(SAFETY_COPY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const level = m.host.querySelector('#aq-level');
  for (const typed of ['0', '6', 'loud', '-30']) { level.value = typed; await level.fire('change'); }
  assert.equal(level.value, '-30');
  level.value = '3'; await level.fire('change');
  assert.equal(level.value, '-12');
  const running = m.click('aq-run'); await settle();
  assert.ok(m.host.querySelector('#aq-stop'), 'measuring view');
  assert.equal(m.host.querySelector('#aq-stop').focusRequests, 1, 'focus follows the replacement view, so Escape reaches the runner');
  assert.ok(m.host.text.includes(SAFETY_COPY), 'the safety copy stays visible while the signal plays');
  assert.equal(m.calls.play[0].opts.levelDbfs, -12);
  hold.resolve(); await running; await settle();
  m.runner.dispose();
});

test('keyboard shortcuts start from the panel, preserve form controls, and Escape cancels only this run', async () => {
  const hold = deferred(), m = mount(io({ waitPlay: () => hold.promise })); await settle();
  const prevented = [];
  const key = (key, extra = {}) => m.host.fire('keydown', { key, preventDefault: () => prevented.push(key), ...extra });
  await key('Enter', { target: m.host.querySelector('#aq-level') });
  await key('Enter', { target: m.host.querySelector('#aq-run') });
  await key('Enter', { repeat: true });
  await key('Enter', { ctrlKey: true });
  assert.equal(m.calls.starts, 0, 'editing or default button activation must not trigger a second run');
  const running = key('Enter'); await settle();
  assert.equal(m.calls.starts, 1);
  assert.equal(m.calls.play.length, 1);
  const progress = m.host.querySelector('#aq-progress');
  assert.ok(progress, 'the current test stage is visible while measuring');
  assert.equal(Number(progress.value), 1, 'recording preparation completed, playback is current');
  assert.match(progress.attributes['aria-valuetext'], /Stage 2 of 3/);
  await key('Enter'); await settle();
  assert.equal(m.calls.starts, 1, 'Enter cannot start a concurrent measurement');
  await key('Escape'); await settle();
  assert.deepEqual(m.calls.stop, [7]);
  assert.equal(m.calls.stopAll, 0);
  assert.equal(m.calls.cancels, 1);
  assert.deepEqual(m.finished, []);
  assert.deepEqual(prevented, ['Enter', 'Escape']);
  assert.equal(m.host.querySelector('#aq-progress'), null);
  assert.equal(m.host.querySelector('#aq-run').focusRequests, 1, 'Stop returns focus to the new Run button');
  hold.resolve(); await running; await settle();
  m.runner.dispose();
  await key('Enter'); await settle();
  assert.equal(m.calls.starts, 1, 'dispose removes the keyboard listener');
});

test('progress reserves the final stage until analysis completes and disappears with results', async () => {
  const stop = deferred(), m = mount(io({ stopCapture: () => stop.promise })); await settle();
  const running = m.click('aq-run'); await settle();
  const progress = m.host.querySelector('#aq-progress');
  assert.ok(progress);
  assert.equal(Number(progress.value), 2, 'the pending analysis is not represented as complete');
  assert.match(progress.attributes['aria-valuetext'], /Stage 3 of 3/);
  stop.resolve(); await running; await settle();
  assert.equal(m.host.querySelector('#aq-progress'), null);
  assert.equal(m.finished.length, 1);
  assert.equal(m.host.querySelector('section').focusRequests, 1, 'the result summary receives focus');
  m.runner.dispose();
});

test('bug 1: a capture that cannot start plays nothing, saves nothing, and Try again then records and saves once', async () => {
  const m = mount(io({ startError: n => (n === 1 ? new CaptureBusyError({ holder: 'live-monitor' }) : null) })); await settle();
  await m.click('aq-run'); await settle();
  assert.equal(m.calls.play.length, 0, 'nothing plays when the input cannot be recorded');
  assert.deepEqual(m.finished, []);
  assert.match(m.host.text, /Input is busy/);
  assert.match(m.host.text, /Live monitor is using the audio input/);
  assert.match(m.host.text, /Nothing was saved for this attempt/);
  assert.match(m.host.querySelector('#aq-run').innerHTML, /Try again/);
  assert.equal(m.host.querySelector('#aq-run').focusRequests, 1, 'a failed attempt focuses Try again');
  await m.click('aq-run'); await settle();
  assert.equal(m.calls.play.length, 1);
  assert.equal(m.finished.length, 1, 'the retry is saved once');
  // Serialize only already-returned evidence after the actual retry analysis. This does not
  // rerun a numerical helper or change the fixture, lifecycle, threshold or asserted status.
  assert.equal(m.finished[0].status, 'pass', `${m.finished[0].detail}\n[AQ-RETRY-CONTEXT] ${JSON.stringify({
    result: m.finished[0],
    playback: m.calls.play.map(({ buffer, opts, extra }) => ({
      sampleRate: buffer.sampleRate, framesLeft: buffer.left.length, framesRight: buffer.right.length,
      options: opts, output: extra,
    })),
    calls: { starts: m.calls.starts, plays: m.calls.play.length, saved: m.finished.length,
      stops: m.calls.stop, stopAll: m.calls.stopAll, captureStops: m.calls.captureStops, cancels: m.calls.cancels,
      waits: m.calls.waits },
  }, (_, value) => typeof value === 'number' && !Number.isFinite(value) ? { nonFiniteNumber: String(value) } : value)}`);
  assert.equal(m.finished[0].extra.captureIntegrity.source, 'live');
  assert.equal(m.finished[0].extra.captureIntegrity.state, 'observed');
  assert.ok(m.finished[0].measurements.length > 0);
  assert.equal(m.calls.stopAll, 0);
  m.runner.dispose();
});

test('bug 1: a preempt during playback stops this run\'s voice and saves nothing', async () => {
  const m = mount(io({ waitPlay: (n, o) => (n === 1 ? o.onPreempted() : null) })); await settle();
  await m.click('aq-run'); await settle();
  assert.deepEqual(m.calls.stop, [7]);
  assert.equal(m.calls.stopAll, 0);
  assert.equal(m.calls.cancels, 1);
  assert.deepEqual(m.finished, []);
  assert.match(m.host.text, /Capture stopped/);
  m.runner.dispose();
});

test('bug 2: dispose with nothing running never stops other screens\' playback', async () => {
  const m = mount(); await settle();
  m.runner.dispose(); await settle();
  assert.equal(m.calls.stopAll, 0);
  assert.deepEqual(m.calls.stop, []);
});

test('bug 2: dispose during playback stops only the runner\'s own handle and cancels its own capture', async () => {
  const hold = deferred();
  const m = mount(io({ waitPlay: () => hold.promise })); await settle();
  const running = m.click('aq-run'); await settle();
  const view = m.host.text;
  m.runner.dispose(); await settle();
  assert.deepEqual(m.calls.stop, [7], 'its own voice');
  assert.equal(m.calls.stopAll, 0, 'never every voice');
  assert.equal(m.calls.cancels, 1, 'its own capture');
  hold.resolve(); await running; await settle();
  assert.equal(m.calls.captureStops, 0);
  assert.deepEqual(m.finished, []);
  assert.equal(m.host.text, view, 'nothing renders after dispose');
});

test('bug 4: a playBuffer that resolves after dispose has its late handle stopped; a handle-less one stops nothing', async () => {
  for (const [late, expected] of [[{ handle: 9 }, [9]], [{}, []], [null, []]]) {
    const played = deferred();
    const m = mount(io({ play: () => played.promise })); await settle();
    const running = m.click('aq-run'); await settle();
    assert.equal(m.calls.play.length, 1);
    m.runner.dispose(); await settle();
    assert.deepEqual(m.calls.stop, []);
    played.resolve(late); await running; await settle();
    assert.deepEqual(m.calls.stop, expected, JSON.stringify(late));
    assert.equal(m.calls.stopAll, 0);
    assert.deepEqual(m.finished, []);
  }
});

test('bug 3: a capture result that arrives after dispose never renders or saves', async () => {
  const stopped = deferred();
  const m = mount(io({ stopCapture: () => stopped.promise })); await settle();
  const running = m.click('aq-run'); await settle();
  assert.equal(m.calls.captureStops, 1, 'analysing: waiting for the recording');
  const view = m.host.text;
  m.runner.dispose();
  stopped.resolve(); await running; await settle();
  assert.deepEqual(m.finished, []);
  assert.doesNotMatch(m.host.text, /Output quality · (PASS|FAIL|REVIEW)/);
  assert.equal(m.host.text, view);
});

test('bug 3: Stop supersedes a run; its late completion is discarded and the next run saves once', async () => {
  const hold = deferred();
  const m = mount(io({ waitPlay: n => (n === 1 ? hold.promise : null) })); await settle();
  const running = m.click('aq-run'); await settle();
  await m.click('aq-stop'); await settle();
  assert.deepEqual(m.calls.stop, [7]); assert.equal(m.calls.stopAll, 0); assert.equal(m.calls.cancels, 1);
  assert.match(m.host.text, /nothing was saved/);
  hold.resolve(); await running; await settle();
  assert.deepEqual(m.finished, []);
  await m.click('aq-run'); await settle();
  assert.equal(m.finished.length, 1);
  assert.match(m.host.text, /Output quality · PASS/);
  m.runner.dispose();
});

test('bug 6: an attempt without measurements is shown but not saved, and Run again works', async () => {
  const m = mount(io({ silent: n => n === 1 })); await settle();
  await m.click('aq-run'); await settle();
  assert.deepEqual(m.finished, [], 'NO_SIGNAL has nothing to save');
  assert.match(m.host.text, /Nothing was saved for this attempt/);
  assert.match(m.host.text, /The capture is silent/);
  await m.click('aq-again'); await settle();
  await m.click('aq-run'); await settle();
  assert.equal(m.finished.length, 1);
  assert.equal(m.finished[0].criterion, 'audio-quality');
  assert.equal(m.finished[0].extra.thresholds.length, 9);
  m.runner.dispose();
});

test('bug 5: the saved test signal WAV peaks at -12 dBFS', async () => {
  const deps = io(); const m = mount(deps); await settle();
  await m.click('aq-wav');
  const [file] = m.calls.downloads;
  assert.equal(file.type, 'audio/wav');
  const wav = parseWav(file.data.buffer.slice(file.data.byteOffset, file.data.byteOffset + file.data.byteLength));
  let peak = 0; for (const v of wav.left) peak = Math.max(peak, Math.abs(v)); for (const v of wav.right) peak = Math.max(peak, Math.abs(v));
  const db = 20 * Math.log10(peak);
  assert.ok(db <= -12 + 0.01 && db > -12.1, `${db} dBFS`);
  m.runner.dispose();
});

test('native capture faults are displayed and saved as REVIEW with their original quality evidence', async () => {
  const deps = io(), start = deps.startCapture;
  deps.startCapture = async options => {
    const session = await start(options);
    return { ...session, stop: async () => {
      const cap = await session.stop();
      return { ...cap, quality: { ...cap.quality, overrunSamples: 1024 }, streamErrors: ['Device disconnected'] };
    } };
  };
  const m = mount(deps); await settle();
  await m.click('aq-run'); await settle();
  assert.equal(m.finished.length, 1);
  assert.equal(m.finished[0].status, 'unknown');
  assert.equal(m.finished[0].extra.captureQuality.overrunSamples, 1024);
  assert.deepEqual(m.finished[0].extra.streamErrors, ['Device disconnected']);
  assert.equal(m.finished[0].extra.captureIntegrity.state, 'incomplete');
  assert.match(m.host.text, /Output quality · REVIEW/);
  assert.match(m.host.text, /capture faults prevent a device verdict/);
  m.runner.dispose();
});

function fileDeps(plan) {
  const deps = io();
  const st = exportStimulus({ sampleRate: SR });
  const good = { left: new Float32Array(st.left.length + 3 * SR), right: new Float32Array(st.left.length + 3 * SR), sampleRate: SR };
  good.left.set(st.left, 500); good.right.set(st.right, 500);
  return { ...deps, good, pickFile: async () => plan.pick(), decodeAudioFile: file => plan.decode(file, good) };
}

test('stereo response plots expose opposite channel errors instead of displaying a flat average', async () => {
  const segment = exportStimulus().meta.segments.find(s => s.name === 'resp' && s.hz === 10000);
  const deps = fileDeps({ pick: () => ({ name: 'stereo-response.wav' }), decode: async (_, good) => {
    for (let i = segment.start + 500; i < segment.end + 500; i++) {
      good.left[i] *= 10 ** (3 / 20);
      good.right[i] *= 10 ** (-3 / 20);
    }
    return good;
  } });
  const m = mount(deps); await settle();
  await m.click('aq-file'); await settle();
  assert.equal(m.finished[0].status, 'fail');
  assert.match(m.host.text, /Left channel: level relative to 1 kHz/);
  assert.match(m.host.text, /Right channel: level relative to 1 kHz/);
  assert.match(m.host.text, /10k Hz: L \+3\.00 dB \/ R −3\.00 dB/);
  m.runner.dispose();
});

test('bug 3: a file decode that completes after dispose or after a newer pick never renders, toasts or saves', async () => {
  toastHost = new Element('div'); // error toasts only from here on
  // completes after dispose: success and failure
  for (const outcome of ['resolve', 'reject']) {
    const decoded = deferred();
    const deps = fileDeps({ pick: () => ({ name: 'late.wav' }), decode: () => decoded.promise });
    const m = mount(deps); await settle();
    const picking = m.click('aq-file'); await settle();
    const view = m.host.text;
    m.runner.dispose();
    if (outcome === 'resolve') decoded.resolve(deps.good); else decoded.reject(new Error('corrupt file'));
    await picking; await settle();
    assert.deepEqual(m.finished, [], outcome);
    assert.equal(m.host.text, view, outcome);
    assert.equal(toastHost.children.length, 0, `${outcome}: no toast after dispose`);
  }
  // superseded by a newer pick: only the newer file renders and saves
  const first = deferred();
  const names = ['a.wav', 'b.wav'];
  const deps = fileDeps({ pick: () => ({ name: names.shift() }), decode: (file, good) => (file.name === 'a.wav' ? first.promise : good) });
  const m = mount(deps); await settle();
  const a = m.click('aq-file'); await settle();
  await m.click('aq-file'); await settle();
  assert.equal(m.finished.length, 1);
  assert.equal(m.finished[0].extra.source, 'b.wav');
  assert.equal(m.finished[0].status, 'pass', m.finished[0].detail);
  assert.equal(m.finished[0].extra.captureIntegrity.source, 'file');
  assert.equal(m.finished[0].extra.captureIntegrity.state, 'unobserved');
  const view = m.host.text;
  first.resolve(deps.good); await a; await settle();
  assert.equal(m.finished.length, 1, 'the superseded decode is not saved');
  assert.equal(m.host.text, view);
  // a current decode failure is reported
  const broken = fileDeps({ pick: () => ({ name: 'bad.wav' }), decode: async () => { throw new Error('corrupt file'); } });
  const b = mount(broken); await settle();
  await b.click('aq-file'); await settle();
  assert.equal(toastHost.children.length, 1);
  assert.match(toastHost.children[0].text, /corrupt file/);
  assert.deepEqual(b.finished, []);
  m.runner.dispose(); b.runner.dispose();
});

test('browser preview: no live run, but the WAV and file analysis stay available', async () => {
  const deps = { ...io(), liveAvailable: () => false };
  const m = mount(deps); await settle();
  assert.equal(m.host.querySelector('#aq-run').disabled, true);
  assert.match(m.host.text, /need the DeckChek desktop app/);
  assert.ok(m.host.text.includes(SAFETY_COPY));
  await m.host.querySelector('#aq-run').fire('click'); await settle();
  assert.equal(deps.calls.starts, 0);
  assert.ok(m.host.querySelector('#aq-file') && m.host.querySelector('#aq-wav'));
  m.runner.dispose();
});

test('the generated audio:quality plan test runs in this runner at its -12 dBFS level and shows its condition', async () => {
  const load = id => JSON.parse(fs.readFileSync(new URL(`../app/devices/profiles/${id}.json`, import.meta.url), 'utf8'));
  for (const id of ['pioneer-djm-a9', 'korg-nanokontrol2']) {
    const planned = completePlan(load(id)).tests.find(t => t.method === 'audio:quality');
    const m = mount(io(), planned); await settle();
    if (planned.params.condition) assert.ok(m.host.text.includes(planned.params.condition), `${id}: condition shown`);
    await m.click('aq-run'); await settle();
    assert.equal(m.calls.play[0].opts.levelDbfs, -12, id);
    assert.equal(m.finished.length, 1, id);
    m.runner.dispose();
  }
});

test('FS-34 conditional test: Skip records a reason and starts nothing; an unconditional test has no Skip', async () => {
  const deps = io(), skipped = [];
  const host = new Element('div');
  const runner = runAudio(host, { test: { id: 'auto-audio-quality', method: 'audio:quality', title: 'Output audio quality', steps: ['a', 'b'], params: { levelDbfs: -12, condition: 'Only when the unit has its own audio output.' } }, profile: { model: 'Test', specs: [] }, finish: () => assert.fail('nothing is measured'), skip: reason => skipped.push(reason), ...deps });
  await settle();
  await host.querySelector('#aq-skip').fire('click');
  assert.equal(skipped.length, 1);
  assert.match(skipped[0], /no audio output/);
  assert.equal(deps.calls.starts, 0); assert.equal(deps.calls.play.length, 0);
  runner.dispose();

  const plain = mount(); await settle();
  assert.equal(plain.host.querySelector('#aq-skip'), null);
  plain.runner.dispose();
});

after(async () => {
  if (!audioContextPath) return;
  const { serializeAudioContexts } = await import('../tools/diagnostics/audio-context-serialize.mjs');
  const observed = serializeAudioContexts(completedAudioContexts);
  fs.writeFileSync(audioContextPath, `${JSON.stringify(observed, (_, value) =>
    typeof value === 'number' && !Number.isFinite(value) ? { nonFiniteNumber: String(value) } : value, 2)}\n`, { flag: 'wx' });
});
