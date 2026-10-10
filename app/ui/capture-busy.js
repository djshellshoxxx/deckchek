// Shared capture-busy dialog (FS-00 §3, AC-5): when a feature asks for the audio input while another
// feature holds the capture lease, offer "Stop <holder> and continue" instead of opening a second stream.
//
//   const session = await runWithCapture(() => startStreamSession({ holder: 'wear-map', onBlock }), { action: 'start the wear map' });
//
// runWithCapture resolves start()'s result; when the user cancels it rejects with the CaptureBusyError
// (error.cancelled === true) so callers can simply return.

import { h } from './dom.js';
import { captureHolderLabel, isCaptureBusy, normalizeCaptureError, preemptCapture } from './audio-io.js';

function sinceText(since, now = Date.now()) {
  if (!Number.isFinite(since) || since <= 0) return '';
  const sec = Math.max(0, Math.round((now - since) / 1000));
  if (sec < 60) return 'It started a moment ago.';
  const min = Math.round(sec / 60);
  if (min < 60) return `It has been running for ${min} min.`;
  const d = new Date(since);
  return `It has been running since ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}.`;
}

/** Dialog copy for a CAPTURE_BUSY error: {title, body, detail, confirmLabel, cancelLabel}. */
export function captureBusyCopy(busy, { action = 'run this check', now = Date.now() } = {}) {
  const who = captureHolderLabel(busy?.holder);
  return {
    title: 'Audio input in use',
    body: `${who} is using the audio input. Stop it and ${action}?`,
    detail: sinceText(busy?.since, now),
    confirmLabel: 'Stop and continue',
    cancelLabel: 'Cancel',
  };
}

let openDialog = null;

/** Ask whether to stop the current holder. Resolves true for "Stop and continue", false for Cancel/Esc. */
export function confirmCaptureBusy(busy, { action } = {}) {
  openDialog?.(false);
  const copy = captureBusyCopy(busy, { action });
  return new Promise(resolve => {
    const trigger = document.activeElement;
    const dlg = h('dialog', { class: 'capture-busy', 'aria-labelledby': 'capture-busy-title', 'aria-describedby': 'capture-busy-body' });
    let settled = false;
    const settle = value => {
      if (settled) return;
      settled = true;
      openDialog = null;
      if (dlg.open) dlg.close();
      dlg.remove();
      if (trigger?.isConnected) trigger.focus();
      resolve(value);
    };
    const cancel = h('button', { type: 'button', class: 'btn btn-secondary', 'data-action': 'cancel', text: copy.cancelLabel, onclick: () => settle(false) });
    const stop = h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'stop', text: copy.confirmLabel, onclick: () => settle(true) });
    dlg.append(h('div', { class: 'dialog-form' },
      h('h2', { id: 'capture-busy-title', text: copy.title }),
      h('p', { id: 'capture-busy-body', text: copy.body }),
      copy.detail ? h('p', { class: 'capture-busy-since', text: copy.detail }) : null,
      h('div', { class: 'dialog-actions' }, stop, cancel)));
    dlg.addEventListener('cancel', event => { event.preventDefault(); settle(false); });
    dlg.addEventListener('close', () => settle(false));
    document.body.append(dlg);
    dlg.showModal();
    cancel.focus(); // stopping someone else's capture is the riskier action
    openDialog = settle;
  });
}

/**
 * Run start(); on CAPTURE_BUSY ask the user, stop the holder and retry once.
 * confirm/preempt are injectable for tests.
 */
export async function runWithCapture(start, { action, confirm = confirmCaptureBusy, preempt = preemptCapture } = {}) {
  try {
    return await start();
  } catch (raw) {
    const error = normalizeCaptureError(raw);
    if (!isCaptureBusy(error)) throw error;
    if (!(await confirm(error, { action }))) {
      error.cancelled = true;
      throw error;
    }
    await preempt();
    try {
      return await start();
    } catch (again) {
      throw normalizeCaptureError(again);
    }
  }
}
