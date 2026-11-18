import test from 'node:test';
import assert from 'node:assert/strict';
import { startMic, stopMic, captureSeconds } from '../mobile/lib/audio.js';
import mountSpeed from '../mobile/screens/speed.js';
import mountSpl from '../mobile/screens/spl.js';
import { listResults } from '../mobile/lib/store.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const turn = () => new Promise(resolve => setImmediate(resolve));

function environment(t, { permission, wake, setupError = false, worklet } = {}) {
  const nodes = new Map(), contexts = [], streams = [], records = new Map();
  const requests = { mic: 0, wake: 0 };
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.value = ''; this.textContent = ''; }
    setAttribute(key, value) { this[key] = value; if (key === 'id') nodes.set(value, this); }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    append(child) { this.children.push(child); if (this.tag === 'select' && this.children.length === 1) this.value = child.value; }
    replaceChildren(...children) { this.children = children; }
    click() { this.listeners.click?.(); }
  }
  const audioNode = () => ({ gain: {}, disconnects: 0, connect(next) { return next; }, disconnect() { this.disconnects++; } });
  class Context {
    constructor() { this.sampleRate = 1000; this.destination = {}; this.closes = 0; contexts.push(this); if (worklet) this.audioWorklet = { addModule: () => worklet.promise }; }
    async resume() {}
    createMediaStreamSource() { this.source = audioNode(); return this.source; }
    createScriptProcessor() { if (setupError) throw new Error('capture graph failed'); this.processor = audioNode(); return this.processor; }
    createGain() { return audioNode(); }
    async close() { this.closes++; }
  }
  const makeStream = () => {
    const track = { stops: 0, stop() { this.stops++; }, getSettings: () => ({}) };
    const stream = { track, getTracks: () => [track], getAudioTracks: () => [track] };
    streams.push(stream); return stream;
  };
  const globals = {
    Node: Element,
    document: { createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }), getElementById: id => nodes.get(id) },
    navigator: {
      userAgent: 'mic lifecycle test',
      mediaDevices: { getUserMedia() { requests.mic++; return permission ? permission.promise : Promise.resolve(makeStream()); } },
      wakeLock: { request() { requests.wake++; return wake ? wake.promise : Promise.resolve({ release() {} }); } },
    },
    AudioContext: Context,
    webkitAudioContext: undefined,
    AudioWorkletNode: class { constructor() { throw new Error('unexpected late worklet node'); } },
    localStorage: { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) },
  };
  records.set('deckchek.mobile.v1', JSON.stringify({ results: [], settings: {} }));
  const saved = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  t.after(() => {
    stopMic();
    for (const [key, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  return { nodes, contexts, streams, requests, makeStream, root: new Element('main') };
}

for (const [screen, mount] of [['speed', mountSpeed], ['spl', mountSpl]]) {
  for (const action of ['stop', 'navigate']) {
    test(`${screen}: ${action} during capture stops the owned track/context and releases its graph`, async t => {
      const env = environment(t);
      const unmount = mount(env.root, {});
      env.nodes.get(`${screen}-start`).click(); await turn();
      assert.equal(env.contexts.length, 1);
      assert.equal(typeof env.contexts[0].processor.onaudioprocess, 'function');
      if (action === 'navigate') unmount(); else env.nodes.get(`${screen}-start`).click();
      await turn();
      assert.equal(env.streams[0].track.stops, 1);
      assert.equal(env.contexts[0].closes, 1);
      assert.equal(env.contexts[0].processor.onaudioprocess, null);
      assert.equal(env.contexts[0].source.disconnects, 1);
      assert.equal(listResults().length, 0);
    });
  }

  test(`${screen}: capture setup errors release the microphone`, async t => {
    const env = environment(t, { setupError: true });
    mount(env.root, {});
    env.nodes.get(`${screen}-start`).click(); await turn();
    assert.equal(env.streams[0].track.stops, 1);
    assert.equal(env.contexts[0].closes, 1);
    assert.equal(listResults().length, 0);
  });

  for (const action of ['stop', 'navigate']) {
  test(`${screen}: ${action} during permission stops the late stream without starting capture or wake lock`, async t => {
    const permission = deferred();
    const env = environment(t, { permission });
    const unmount = mount(env.root, {});
    env.nodes.get(`${screen}-start`).click();
    if (action === 'navigate') unmount(); else env.nodes.get(`${screen}-start`).click();
    const stream = env.makeStream(); permission.resolve(stream); await turn();
    assert.equal(stream.track.stops, 1);
    assert.equal(env.contexts.length, 0);
    assert.equal(env.requests.wake, 0);
    assert.equal(listResults().length, 0);
  });

  test(`${screen}: ${action} during wake-lock acquisition stops mic immediately and releases the late lock`, async t => {
    const wake = deferred(); let releases = 0;
    const env = environment(t, { wake });
    const unmount = mount(env.root, {});
    env.nodes.get(`${screen}-start`).click(); await turn();
    assert.equal(env.requests.wake, 1);
    if (action === 'navigate') unmount(); else env.nodes.get(`${screen}-start`).click();
    assert.equal(env.streams[0].track.stops, 1);
    assert.equal(env.contexts[0].closes, 1);
    wake.resolve({ release() { releases++; } }); await turn();
    assert.equal(releases, 1);
    assert.equal(env.contexts[0].processor, undefined);
    assert.equal(listResults().length, 0);
  });
  }

  test(`${screen}: successful capture releases the track/context and saves one result`, async t => {
    const env = environment(t);
    mount(env.root, {});
    env.nodes.get(`${screen}-start`).click(); await turn();
    const samples = Float32Array.from({ length: 5000 }, (_, i) => 0.2 * Math.sin(2 * Math.PI * 100 * i / 1000));
    env.contexts[0].processor.onaudioprocess({ inputBuffer: { getChannelData: () => samples } });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(env.streams[0].track.stops, 1);
    assert.equal(env.contexts[0].closes, 1);
    assert.equal(listResults().length, 1);
  });
}

test('late older permission cannot replace or stop a newer microphone session', { timeout: 1000 }, async t => {
  const permission = deferred();
  const env = environment(t, { permission });
  const older = startMic();
  const rejected = assert.rejects(older, { name: 'AbortError' });
  const newerStream = env.makeStream();
  navigator.mediaDevices.getUserMedia = async () => newerStream;
  const newer = await startMic();
  await rejected;
  const olderStream = env.makeStream(); permission.resolve(olderStream); await turn();
  assert.equal(olderStream.track.stops, 1);
  assert.equal(newerStream.track.stops, 0);
  assert.equal(env.contexts.length, 1);
  stopMic();
  assert.equal(newerStream.track.stops, 1, 'newer session remains current');
  assert.equal(newer.ctx.closes, 1);
});

test('an older screen finally cannot stop the new screen microphone after its wake lock resolves', async t => {
  const wake = deferred(); let releases = 0;
  const env = environment(t, { wake });
  const oldUnmount = mountSpeed(env.root, {});
  env.nodes.get('speed-start').click(); await turn();
  oldUnmount();
  navigator.wakeLock.request = async () => ({ release() {} });
  const newUnmount = mountSpl(env.root, {});
  env.nodes.get('spl-start').click(); await turn();
  wake.resolve({ release() { releases++; } }); await turn();
  assert.equal(releases, 1);
  assert.equal(env.streams[0].track.stops, 1);
  assert.equal(env.streams[1].track.stops, 0);
  assert.equal(env.contexts[1].closes, 0);
  assert.equal(typeof env.contexts[1].processor.onaudioprocess, 'function');
  newUnmount(); await turn();
  assert.equal(env.streams[1].track.stops, 1);
});

test('capture abort during pending worklet setup rejects promptly and never attaches a late graph', { timeout: 1000 }, async t => {
  const worklet = deferred();
  const env = environment(t, { worklet });
  const abort = new AbortController();
  const mic = await startMic({ signal: abort.signal });
  const captured = captureSeconds(1, { mic, signal: abort.signal });
  const rejected = assert.rejects(captured, { name: 'AbortError' });
  abort.abort();
  await rejected;
  worklet.resolve(); await turn();
  assert.equal(env.streams[0].track.stops, 1);
  assert.equal(mic.ctx.closes, 1);
  assert.equal(mic.ctx.processor, undefined);
});

test('a replacement microphone aborts and releases the older capture graph', async t => {
  const env = environment(t);
  const older = await startMic();
  const capture = captureSeconds(1, { mic: older });
  const rejected = assert.rejects(capture, { name: 'AbortError' });
  await turn();
  const newer = await startMic();
  await rejected;
  assert.equal(older.ctx.processor.onaudioprocess, null);
  assert.equal(older.ctx.source.disconnects, 1);
  older.stop();
  assert.equal(env.streams[0].track.stops, 1);
  assert.equal(older.ctx.closes, 1);
  assert.equal(env.streams[1].track.stops, 0);
  assert.equal(newer.ctx.closes, 0);
});
