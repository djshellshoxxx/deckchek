// BUG-02 (docs/audit/2026-10-bug-hunt.md): a capture stop names the lease it owns, so one feature
// can never stop or save another feature's capture; pre-gig preempts through the shared preempt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startLiveSession, classifyCaptureError } from '../app/ui/audio-io.js';
import { createNativeDeps, PREGIG_HOLDER } from '../app/pre-gig.js';

const CANCELLED = 'The capture was stopped because another DeckChek feature needed the audio input.';

/**
 * Model of capture.rs for the live path: ONE live session slot and one lease. `stop_live_capture`
 * requires the caller's lease id and refuses any other session (CAPTURE_CANCELLED);
 * `capture_preempt` stops the current holder, discards its audio and emits `capture-preempted`.
 */
function rustModel() {
  let nextId = 1, session = null;
  const listeners = new Map();
  const emit = (name, payload) => (listeners.get(name) || []).forEach(fn => fn({ payload }));
  const busy = () => ({ code: 'CAPTURE_BUSY', message: `The audio input is busy: "${session.holder}" is already running.`, holder: session.holder, since: 1, kind: 'live', leaseId: session.leaseId });
  const handlers = {
    list_native_audio_inputs: () => [{ name: 'Deck A input' }],
    start_live_capture: ({ holder }) => {
      if (session) throw busy();
      session = { leaseId: nextId++, holder: holder || 'live-capture' };
      return { deviceName: 'Deck A input', sampleRate: 48000, channels: 2, maxSeconds: 5, leaseId: session.leaseId, pairs: [] };
    },
    stop_live_capture: ({ leaseId }) => {
      if (leaseId == null) throw 'missing required key leaseId';
      if (!session || session.leaseId !== leaseId) throw CANCELLED;
      const s = session; session = null;
      // the payload records whose capture this was, so the test can see who got the audio
      return { payload: { deviceName: `audio of ${s.holder}`, sampleRate: 48000, channels: 2, left: [0], right: [0], streamErrors: [] }, quality: {} };
    },
    live_capture_status: () => ({ running: Boolean(session), elapsedSec: 0, quality: {} }),
    capture_lease_status: () => (session ? { held: true, leaseId: session.leaseId, holder: session.holder, kind: 'live' } : { held: false }),
    capture_preempt: () => {
      const stopped = session ? { leaseId: session.leaseId, holder: session.holder, kind: 'live' } : null;
      session = null;
      if (stopped) emit('capture-preempted', stopped);
      return { stopped };
    },
  };
  const invoke = async (cmd, args = {}) => {
    if (!handlers[cmd]) throw `unknown command ${cmd}`;
    return handlers[cmd](args);
  };
  const listen = async (name, fn) => {
    listeners.set(name, [...(listeners.get(name) || []), fn]);
    return () => listeners.set(name, (listeners.get(name) || []).filter(f => f !== fn));
  };
  return { invoke, listen, get session() { return session; } };
}

async function withModel(fn) {
  const rust = rustModel();
  globalThis.window = { __TAURI__: { core: { invoke: rust.invoke }, event: { listen: rust.listen } } };
  try { await fn(rust); } finally { delete globalThis.window; }
}

test('BUG-02: after pre-gig preempts a live session, that session\'s stop() must not stop pre-gig\'s capture', async () => {
  await withModel(async rust => {
    // 1. Quick Check (flow.js) is recording through startLiveSession.
    let told = 0;
    const quick = await startLiveSession({ maxSeconds: 30, onPreempted: () => { told++; } });
    // 2. The user runs Pre-gig; its deck check hits CAPTURE_BUSY and the user picks "Stop … and continue".
    let quickResult = null;
    const deps = createNativeDeps(rust.invoke, {
      // 3. While pre-gig records, Quick Check's 100 ms tick reaches its target and calls stop().
      sleep: async () => { quickResult = await quick.stop(); },
    });
    await deps.preempt();
    assert.equal(told, 1, 'Quick Check was told it was preempted');
    const deck = await deps.captureDeck({ preset: { audioDevice: 'Deck A input' }, seconds: 1 }).catch(e => ({ error: String(e) }));

    assert.notEqual(quickResult?.deviceName, `audio of ${PREGIG_HOLDER}`, 'Quick Check received pre-gig\'s audio as its own recording');
    assert.equal(quickResult.deviceName, 'audio of live-capture', 'it keeps what it recorded before the preempt');
    assert.equal(quickResult.preempted, true);
    assert.equal(deck.error, undefined, `pre-gig lost its capture: ${deck.error}`);
    assert.equal(rust.session, null);
  });
});

test('BUG-02: a session stopped natively by another feature rejects its stop() and leaves the new capture running', async () => {
  await withModel(async rust => {
    let told = 0;
    const quick = await startLiveSession({ maxSeconds: 30, onPreempted: () => { told++; } });
    await new Promise(r => setTimeout(r, 0)); // let the event subscription settle
    await rust.invoke('capture_preempt'); // e.g. a window that does not know this page's controller
    assert.equal(told, 1, 'the capture-preempted event reached the owner');
    const other = await rust.invoke('start_live_capture', { holder: 'hum-hunter' });
    await assert.rejects(quick.stop(), e => classifyCaptureError(e).kind === 'preempted');
    assert.equal(rust.session?.leaseId, other.leaseId, 'the new holder keeps the input');
    const own = await rust.invoke('stop_live_capture', { leaseId: other.leaseId });
    assert.equal(own.payload.deviceName, 'audio of hum-hunter');
  });
});

test('BUG-02: pre-gig\'s stop names its lease, so a stale stop cannot take another capture', async () => {
  await withModel(async rust => {
    const deps = createNativeDeps(rust.invoke, {
      // Another feature preempts pre-gig and starts its own capture mid-check.
      sleep: async () => { await rust.invoke('capture_preempt'); await rust.invoke('start_live_capture', { holder: 'wear-map' }); },
    });
    await assert.rejects(deps.captureDeck({ preset: { audioDevice: 'Deck A input' }, seconds: 1 }), /another DeckChek feature/);
    assert.equal(rust.session?.holder, 'wear-map', 'the wear map keeps recording');
  });
});
