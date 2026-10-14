// Motion sensor and screen wake lock (FS-30 §6, §7). iOS needs DeviceMotionEvent.requestPermission() from a user
// gesture; Android Chrome needs a secure context and a visible page; both cap sensors near 60 Hz.
import { estimateRate } from './vibration.js';

export const MOTION_MESSAGES = {
  unsupported: 'This browser has no motion sensor. Try Chrome on Android or Safari on iPhone.',
  denied: 'Motion access was denied. On iPhone: Settings > Safari > Motion & Orientation Access, switch it on, then reload this page and try again.',
  'no-events': 'The sensor sent no readings. Keep this page open and in front, make sure motion access is allowed, then try again.',
};

export const motionSupported = () => typeof globalThis.DeviceMotionEvent !== 'undefined';

/** 'granted' | 'not-required' | 'denied' | 'unsupported'. Call from a tap. */
export async function requestMotionPermission() {
  const D = globalThis.DeviceMotionEvent;
  if (!D) return 'unsupported';
  if (typeof D.requestPermission === 'function') {
    try { return (await D.requestPermission()) === 'granted' ? 'granted' : 'denied'; } catch { return 'denied'; }
  }
  return 'not-required';
}

/**
 * Record `sec` seconds of acceleration. Resolves {status: 'ok'|'no-events', samples:[{t (s), x, y, z}], rateHz}.
 * `onSample(sample, count)` is called for each reading; `signal` ends early (AbortError).
 */
export function recordMotion(sec, { onSample, signal } = {}) {
  return new Promise((resolve, reject) => {
    const samples = [];
    const handler = e => {
      const a = e.acceleration && e.acceleration.x != null ? e.acceleration : e.accelerationIncludingGravity;
      if (!a || a.x == null) return;
      const s = { t: (e.timeStamp || performance.now()) / 1000, x: a.x, y: a.y ?? 0, z: a.z ?? 0 };
      samples.push(s);
      try { onSample?.(s, samples.length); } catch { /* display only */ }
    };
    const finish = () => {
      globalThis.removeEventListener('devicemotion', handler);
      clearTimeout(timer); clearTimeout(probe);
      signal?.removeEventListener('abort', abort);
      if (!samples.length) return resolve({ status: 'no-events', samples, rateHz: null });
      resolve({ status: 'ok', samples, rateHz: estimateRate(samples) });
    };
    const abort = () => {
      globalThis.removeEventListener('devicemotion', handler);
      clearTimeout(timer); clearTimeout(probe);
      reject(Object.assign(new Error('Recording stopped'), { name: 'AbortError' }));
    };
    globalThis.addEventListener('devicemotion', handler);
    const timer = setTimeout(finish, sec * 1000);
    const probe = setTimeout(() => { if (!samples.length) finish(); }, 2000); // nothing after 2 s: the sensor is not delivering
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  });
}

/** Keep the screen on while measuring. Returns release(); a no-op where Wake Lock is missing. */
export async function keepAwake() {
  try {
    const lock = await navigator.wakeLock?.request('screen');
    return () => { try { lock?.release(); } catch { /* released */ } };
  } catch { return () => {}; }
}
export const wakeLockSupported = () => Boolean(globalThis.navigator?.wakeLock);
