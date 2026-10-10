// FS-00 §4.7 smoke: streaming capture bridge over a mocked Tauri Channel, and the shared
// capture-busy dialog ("<holder> is using the audio input. Stop it and run this check?").
import path from 'node:path';
import { tauriMock, watchConsole } from './core.mjs';

/** Adds the lease + stream commands (modelled on capture.rs) on top of the core mock. */
function captureMock() {
  const base = window.__TAURI__.core.invoke;
  let lease = null, nextId = 1, stream = null;
  window.__cap = { calls: [], acks: [] };
  const header = 48;
  const encode = (seq, frames, final) => {
    const buf = new ArrayBuffer(header + frames * 8), v = new DataView(buf);
    [0x44, 0x43, 0x53, 0x42].forEach((b, i) => v.setUint8(i, b));
    v.setUint16(4, 1, true); v.setUint16(6, final ? 1 : 0, true); v.setUint32(8, seq, true);
    v.setUint32(12, 1000, true); v.setUint32(16, frames, true); v.setFloat64(40, (seq + 1) * frames, true);
    for (let i = 0; i < frames; i++) { v.setFloat32(header + i * 4, Math.sin(i / 3) * 0.5, true); v.setFloat32(header + frames * 4 + i * 4, Math.cos(i / 3) * 0.5, true); }
    return buf;
  };
  const busy = () => { throw { code: 'CAPTURE_BUSY', message: `The audio input is busy: "${lease.holder}" is already running.`, ...lease }; };
  const endStream = () => {
    if (!stream) return null;
    clearInterval(stream.timer);
    stream.channel.onmessage(encode(stream.seq++, 0, true));
    const s = stream; stream = null; lease = null;
    return { streamId: s.id, ended: 'stopped', blocksSent: s.seq, lastSeq: s.seq - 1, droppedBlocks: 0, framesCaptured: (s.seq - 1) * 20, overrunSamples: 0, streamErrors: 0, streamErrorMessages: [] };
  };
  class Channel { constructor() { this.onmessage = () => {}; } }
  window.__TAURI__.core.Channel = Channel;
  window.__TAURI__.core.invoke = async (cmd, args = {}) => {
    window.__cap.calls.push(cmd);
    switch (cmd) {
      case 'capture_lease_status': return lease ? { held: true, ...lease } : { held: false, leaseId: null, holder: null, deviceName: null, since: null, kind: null };
      case 'capture_preempt': { const stopped = lease; if (stream) endStream(); else if (lease?.kind === 'live') await base('stop_live_capture', {}); lease = null; return { stopped }; }
      case 'start_stream_capture': {
        if (lease) busy();
        lease = { leaseId: nextId++, holder: args.holder || 'stream-capture', deviceName: null, since: Date.now() - 4 * 60_000, kind: 'stream' };
        stream = { id: lease.leaseId, channel: args.channel, seq: 0 };
        stream.timer = setInterval(() => stream && stream.channel.onmessage(encode(stream.seq++, 20, false)), 40);
        return { streamId: lease.leaseId, holder: lease.holder, deviceName: 'Focusrite USB (In 1/2)', sampleRate: 1000, channels: 2, blockMs: args.blockMs, blockFrames: 20 };
      }
      case 'stream_capture_ack': window.__cap.acks.push(args.seq); return null;
      case 'stop_stream_capture': { const s = endStream(); if (!s) throw 'No stream capture is running.'; return s; }
      case 'start_live_capture': {
        if (lease) busy();
        const info = await base(cmd, args);
        lease = { leaseId: nextId++, holder: 'live-capture', deviceName: null, since: Date.now(), kind: 'live' };
        return { ...info, leaseId: lease.leaseId };
      }
      case 'stop_live_capture': lease = null; return base(cmd, args);
      default: return base(cmd, args);
    }
  };
}

export default async function run({ browser, base, check, SHOTS }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(tauriMock);
  await context.addInitScript(captureMock);
  const page = await context.newPage();
  const errors = watchConsole(page, 'capture-busy');
  await page.goto(base);
  await page.waitForSelector('.rail-item');

  // ----- streaming bridge -----
  await page.evaluate(async () => {
    const audio = await import('./ui/audio-io.js');
    window.__blocks = [];
    window.__streamEnd = null;
    window.__stream = await audio.startStreamSession({ holder: 'live-monitor', blockMs: 20, onBlock: b => { window.__blocks.push([b.seq, b.frames, b.left.length]); }, onEnd: e => { window.__streamEnd = e.reason; } });
  });
  await page.waitForFunction(() => window.__blocks.length >= 3, null, { timeout: 5000 });
  check('capture: stream blocks arrive in order over the Channel', await page.evaluate(() => window.__blocks.slice(0, 3).every((b, i) => b[0] === i && b[1] === 20 && b[2] === 20)));
  check('capture: each stream block is acknowledged', await page.waitForFunction(() => window.__cap.acks.length >= 3 && window.__cap.acks.slice(0, 3).join() === '0,1,2', null, { timeout: 2000 }).then(() => true, () => false));

  // ----- capture-busy dialog: Esc cancels -----
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'smk-capture'; b.textContent = 'Run check';
    b.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999';
    b.addEventListener('click', async () => {
      const audio = await import('./ui/audio-io.js');
      const { runWithCapture } = await import('./ui/capture-busy.js');
      window.__res = null;
      runWithCapture(() => audio.startLiveSession({ maxSeconds: 5 }), { action: 'run this check' })
        .then(live => { window.__live = live; window.__res = { ok: true }; }, e => { window.__res = { ok: false, cancelled: !!e.cancelled, holder: e.holder }; });
    });
    document.body.append(b);
  });
  await page.click('#smk-capture');
  await page.waitForSelector('dialog.capture-busy[open]');
  const text = await page.locator('dialog.capture-busy').innerText();
  check('capture-busy: names the holder and offers Stop and continue', /Live monitor is using the audio input\. Stop it and run this check\?/.test(text) && /Stop and continue/.test(text) && /running for 4 min/.test(text), text.replace(/\s+/g, ' ').slice(0, 160));
  check('capture-busy: Cancel has default focus', (await page.evaluate(() => document.activeElement?.dataset.action)) === 'cancel');
  check('capture-busy: dialog is named and described', await page.evaluate(() => { const d = document.querySelector('dialog.capture-busy'); return !!document.getElementById(d.getAttribute('aria-labelledby'))?.textContent && !!document.getElementById(d.getAttribute('aria-describedby'))?.textContent; }));
  await page.screenshot({ path: path.join(SHOTS, 'capture-busy-dialog.png') });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__res && !document.querySelector('dialog.capture-busy'));
  check('capture-busy: Esc cancels and leaves the holder running', await page.evaluate(async () => window.__res.cancelled === true && window.__res.holder === 'live-monitor' && !window.__stream.ended && (await window.__TAURI__.core.invoke('capture_lease_status')).holder === 'live-monitor'));
  check('capture-busy: focus returns to the trigger', (await page.evaluate(() => document.activeElement?.id)) === 'smk-capture');

  // ----- Stop and continue -----
  await page.click('#smk-capture');
  await page.waitForSelector('dialog.capture-busy[open]');
  await page.click('dialog.capture-busy button[data-action="stop"]');
  await page.waitForFunction(() => window.__res, null, { timeout: 5000 });
  check('capture-busy: Stop and continue stops the holder, then starts the check', await page.evaluate(async () => window.__res.ok === true && window.__stream.ended && window.__streamEnd === 'preempted' && (await window.__TAURI__.core.invoke('capture_lease_status')).holder === 'live-capture'));
  check('capture-busy: never two captures at once', await page.evaluate(() => { const c = window.__cap.calls; const stop = c.lastIndexOf('stop_stream_capture'), start = c.lastIndexOf('start_live_capture'); return stop >= 0 && stop < start; }));
  await page.evaluate(() => window.__live.stop());
  check('capture: input released after the check stops', await page.evaluate(async () => (await window.__TAURI__.core.invoke('capture_lease_status')).held === false));

  await context.close();
  return errors;
}
