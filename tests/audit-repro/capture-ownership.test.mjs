// Failing reproductions from docs/audit/2026-10-bug-hunt.md (capture ownership).
// Skipped by default so the suite stays green; run them with
//   AUDIT_REPRO=1 node --test tests/audit-repro/
// and delete the `skip` option of a test once its bug is fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startLiveSession } from '../../app/ui/audio-io.js';
import { createNativeDeps, PREGIG_HOLDER } from '../../app/pre-gig.js';

const skip = id => (process.env.AUDIT_REPRO ? false : id);

/**
 * Faithful model of capture.rs for the live path: ONE live session slot and one lease.
 * `stop_live_capture` takes no lease id and stops whatever session is in the slot
 * (capture.rs stop_blocking), and `capture_preempt` stops the current holder and
 * discards its audio (capture.rs preempt_blocking).
 */
function rustModel() {
  let nextId = 1, session = null;
  const busy = () => ({ code: 'CAPTURE_BUSY', message: `The audio input is busy: "${session.holder}" is already running.`, holder: session.holder, since: 1, kind: 'live', leaseId: session.leaseId });
  const handlers = {
    list_native_audio_inputs: () => [{ name: 'Deck A input' }],
    start_live_capture: ({ holder }) => {
      if (session) throw busy();
      session = { leaseId: nextId++, holder: holder || 'live-capture' };
      return { deviceName: 'Deck A input', sampleRate: 48000, channels: 2, maxSeconds: 5, leaseId: session.leaseId, pairs: [] };
    },
    stop_live_capture: () => {
      if (!session) throw 'No live capture is running.';
      const s = session; session = null;
      // the payload records whose capture this was, so the test can see who got the audio
      return { payload: { deviceName: `audio of ${s.holder}`, sampleRate: 48000, channels: 2, left: [0], right: [0], streamErrors: [] }, quality: {} };
    },
    live_capture_status: () => ({ running: Boolean(session), elapsedSec: 0, quality: {} }),
    capture_lease_status: () => (session ? { held: true, leaseId: session.leaseId, holder: session.holder, kind: 'live' } : { held: false }),
    capture_preempt: () => { const stopped = session; session = null; return { stopped }; },
  };
  const invoke = async (cmd, args = {}) => {
    if (!handlers[cmd]) throw `unknown command ${cmd}`;
    return handlers[cmd](args);
  };
  return { invoke, get session() { return session; } };
}

test('BUG-02: after pre-gig natively preempts a live session, that session\'s stop() must not stop pre-gig\'s capture', { skip: skip('BUG-02: stop_live_capture has no lease id; pre-gig preempts natively') }, async () => {
  const rust = rustModel();
  globalThis.window = { __TAURI__: { core: { invoke: rust.invoke }, event: { listen: async () => () => {} } } };
  try {
    // 1. Quick Check (flow.js) is recording through startLiveSession.
    const quick = await startLiveSession({ maxSeconds: 30 });
    // 2. The user runs Pre-gig; its deck check hits CAPTURE_BUSY and the user picks
    //    "Stop … and continue": pre-gig calls capture_preempt directly (pre-gig.js createNativeDeps.preempt).
    let quickResult = null;
    const deps = createNativeDeps(rust.invoke, {
      // 3. While pre-gig records, Quick Check's 100 ms tick reaches its target and calls stop().
      sleep: async () => { quickResult = await quick.stop(); },
    });
    await deps.preempt();
    const deck = await deps.captureDeck({ preset: { audioDevice: 'Deck A input' }, seconds: 1 }).catch(e => ({ error: String(e) }));

    assert.notEqual(quickResult?.deviceName, `audio of ${PREGIG_HOLDER}`, 'Quick Check received pre-gig\'s audio as its own recording');
    assert.equal(deck.error, undefined, `pre-gig lost its capture: ${deck.error}`);
  } finally {
    delete globalThis.window;
  }
});
