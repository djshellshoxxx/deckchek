// Bridge to the native live-capture commands (Tauri). No DOM access here.

function tauri() {
  return (typeof window !== 'undefined' && window.__TAURI__) || null;
}

function requireTauri() {
  const t = tauri();
  if (!t || !t.core || typeof t.core.invoke !== 'function') {
    throw new Error('Native audio capture is only available in the DeckChek desktop app.');
  }
  return t;
}

export function isNativeAvailable() {
  const t = tauri();
  return Boolean(t && t.core && typeof t.core.invoke === 'function');
}

export async function listInputs() {
  if (!isNativeAvailable()) return null;
  return tauri().core.invoke('list_native_audio_inputs');
}

export async function startLive({ deviceName = null, maxSeconds = 60 } = {}) {
  return requireTauri().core.invoke('start_live_capture', { deviceName, maxSeconds });
}

export async function stopLive() {
  return requireTauri().core.invoke('stop_live_capture');
}

export async function status() {
  if (!isNativeAvailable()) return null;
  return tauri().core.invoke('live_capture_status');
}

// Subscribes to "capture-levels" events; returns a synchronous unsubscribe function.
export function onLevels(callback) {
  const t = requireTauri();
  if (!t.event || typeof t.event.listen !== 'function') {
    throw new Error('Tauri event API is unavailable.');
  }
  let unlisten = null;
  let cancelled = false;
  t.event
    .listen('capture-levels', (event) => callback(event.payload))
    .then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
  return () => {
    cancelled = true;
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  };
}
