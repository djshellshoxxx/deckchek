// FS-31 smoke: Live monitor screen. Flag off = hidden; browser mode = explicit "needs the desktop app"; desktop mode
// with a mocked streaming capture (two decks of 1 kHz quadrature timecode over a mocked Tauri Channel, about 8x real
// time) and in-memory monitor_* / tray commands covers: empty state + H-31 hardware note, start under the
// "live-monitor" lease, OK chips (AC-1), the SNR-drop toast as role=status and Watch chip (AC-2), dropouts as a
// critical role=alert toast and Fault chip (AC-3), the event list, tray states, Ctrl+Shift+M stop and the saved
// session log + History row (AC-7), the device-busy copy with three workarounds (AC-5), the shared capture-busy
// dialog with Esc = cancel, and no console errors.
import { tauriMock, watchConsole, a11yAudit } from './core.mjs';

const FLAG_ON = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { liveMonitor: true } })); };

/** Desktop mock: stream capture (lease-aware), monitor_* log commands, tray, app_state. `window.__mon` drives it. */
function monitorMock() {
  const core = window.__TAURI__.core, base = core.invoke;
  const sr = 16000, frames = 4000; // 250 ms blocks
  const mon = { snrA: 32, dropB: false, busyText: null, leaseHolder: null, tray: [], calls: [], sessions: [], events: [], minutes: [] };
  window.__mon = mon;
  let stream = null, lease = null, nextLease = 1;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const gauss = () => { let u = 0; while (u < 1e-9) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const phase = [0, 0];
  let tSec = 0;
  const encode = (seq, n, final) => {
    const pairs = 2, buf = new ArrayBuffer(48 + n * 8 * pairs), v = new DataView(buf);
    [0x44, 0x43, 0x53, 0x42].forEach((b, i) => v.setUint8(i, b));
    v.setUint16(4, 2, true); v.setUint16(6, final ? 1 : 0, true); v.setUint32(8, seq, true); v.setUint32(12, sr, true); v.setUint32(16, n, true);
    v.setUint32(28, pairs, true); v.setFloat64(40, (seq + 1) * n, true);
    for (let p = 0; p < pairs; p++) {
      const snr = p === 0 ? mon.snrA : 32, A = 0.5, sigma = A / Math.SQRT2 / Math.pow(10, snr / 20), base0 = 48 + p * n * 8;
      for (let i = 0; i < n; i++) {
        const t = tSec + i / sr;
        const drop = p === 1 && mon.dropB && (t % 0.8) < 0.06;
        const ph = phase[p] + 2 * Math.PI * 1000 * i / sr;
        v.setFloat32(base0 + i * 4, drop ? 0 : A * Math.sin(ph) + sigma * gauss(), true);
        v.setFloat32(base0 + n * 4 + i * 4, drop ? 0 : A * Math.cos(ph) + sigma * gauss(), true);
      }
      phase[p] = (phase[p] + 2 * Math.PI * 1000 * n / sr) % (2 * Math.PI);
    }
    tSec += n / sr;
    return buf;
  };
  class Channel { constructor() { this.onmessage = () => {}; } }
  core.Channel = Channel;
  const endStream = () => {
    if (!stream) return null;
    clearInterval(stream.timer);
    stream.channel.onmessage(encode(stream.seq++, 0, true));
    const s = stream; stream = null; lease = null;
    return { streamId: s.id, ended: 'stopped', blocksSent: s.seq, lastSeq: s.seq - 1, droppedBlocks: 0, framesCaptured: s.seq * frames, overrunSamples: 0, streamErrors: 0, streamErrorMessages: [] };
  };
  // device loss: the native stream ends by itself and the reap reports 'deviceLost'
  mon.lose = () => { if (!stream) return; clearInterval(stream.timer); stream.lost = true; stream.channel.onmessage(encode(stream.seq++, 0, true)); };
  mon.prune = [];
  let n = 0; const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  core.invoke = async (cmd, args = {}) => {
    if (/stream|lease|preempt|monitor_|app_state/.test(cmd)) mon.calls.push(cmd);
    switch (cmd) {
      case 'list_native_audio_inputs': return [{ name: 'Traktor Audio 8 DJ', isDefault: true, maxChannels: 8, defaultChannels: 8 }];
      case 'capture_lease_status': return lease ? { held: true, ...lease } : mon.leaseHolder ? { held: true, leaseId: 99, holder: mon.leaseHolder, deviceName: null, since: Date.now() - 120000, kind: 'external' } : { held: false, leaseId: null, holder: null, deviceName: null, since: null, kind: null };
      case 'capture_preempt': { const stopped = lease; endStream(); mon.leaseHolder = null; return { stopped }; }
      case 'start_stream_capture': {
        if (mon.busyText) throw mon.busyText;
        if (lease || mon.leaseHolder) { const l = lease || { leaseId: 99, holder: mon.leaseHolder, since: Date.now() - 120000, kind: 'external', deviceName: null }; throw { code: 'CAPTURE_BUSY', message: `The audio input is busy: "${l.holder}" is already running.`, ...l }; }
        lease = { leaseId: nextLease++, holder: args.holder, deviceName: 'Traktor Audio 8 DJ', since: Date.now(), kind: 'stream' };
        mon.holder = args.holder; mon.pairs = args.pairs; mon.blockMs = args.blockMs;
        stream = { id: lease.leaseId, channel: args.channel, seq: 0 };
        stream.timer = setInterval(() => { if (stream) stream.channel.onmessage(encode(stream.seq++, frames, false)); }, 30);
        return { streamId: lease.leaseId, holder: args.holder, deviceName: 'Traktor Audio 8 DJ', sampleRate: sr, channels: 8, blockMs: 250, blockFrames: frames, pairs: [{ label: '1-2', first: 1, second: 2, mono: false }, { label: '3-4', first: 3, second: 4, mono: false }] };
      }
      case 'stream_capture_ack': return null;
      case 'stop_stream_capture': {
        if (stream?.lost) { const id = stream.id; stream = null; lease = null; return { streamId: id, ended: 'deviceLost', blocksSent: 0, lastSeq: 0, droppedBlocks: 0, framesCaptured: 0, overrunSamples: 0, streamErrors: 0, streamErrorMessages: [] }; }
        const s = endStream(); if (!s) throw 'No stream capture is running.'; return s;
      }
      case 'monitor_session_start': { const row = { id: uuid(), startedAt: new Date().toISOString(), endedAt: null, ...args.input, summary: null, eventCount: 0, warningCount: 0, criticalCount: 0, minuteCount: 0 }; mon.sessions.unshift(row); return { id: row.id, startedAt: row.startedAt }; }
      case 'monitor_log_append': {
        const s = mon.sessions.find(x => x.id === args.sessionId);
        if (!s || s.endedAt) throw 'monitor session has ended';
        for (const e of args.events) { mon.events.push({ id: uuid(), sessionId: s.id, ...e }); s.eventCount++; if (e.severity === 'warning') s.warningCount++; if (e.severity === 'critical') s.criticalCount++; }
        for (const m of args.minutes) { mon.minutes.push({ sessionId: s.id, ...m }); s.minuteCount++; }
        return { eventsStored: args.events.length, eventsDropped: 0, minutesStored: args.minutes.length };
      }
      case 'monitor_session_end': { const s = mon.sessions.find(x => x.id === args.sessionId); s.endedAt = new Date().toISOString(); s.summary = args.summary; return null; }
      case 'monitor_session_list': return mon.sessions.map(s => ({ ...s }));
      case 'monitor_session_get': { const s = mon.sessions.find(x => x.id === args.id); return s ? { version: 1, session: { ...s }, events: mon.events.filter(e => e.sessionId === s.id), minutes: mon.minutes.filter(m => m.sessionId === s.id) } : null; }
      case 'monitor_session_delete': { const before = mon.sessions.length; mon.sessions = mon.sessions.filter(s => s.id !== args.id); return mon.sessions.length < before; }
      case 'monitor_prune': mon.prune.push(args.retentionDays); return { deleted: 0, retentionDays: args.retentionDays, closed: 0 };
      case 'monitor_set_tray_state': mon.tray.push(args.state); return { supported: false, state: args.state, tooltip: `DeckChek live monitor: ${args.state}` };
      case 'app_state_get': return null;
      case 'app_state_set': return null;
      case 'hum_run_list': case 'latency_run_list': case 'scratch_list': case 'wearmap_list': case 'pregig_list_runs': return [];
      default: return base(cmd, args);
    }
  };
}

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  const shot = async (page, name) => { await page.waitForTimeout(150); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

  // ----- flag off -----
  const off = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const po = await off.newPage();
  errors.push(...watchConsole(po, 'monitor-off'));
  await po.goto(base);
  await po.waitForSelector('.rail-item');
  check('monitor: flag off hides the Live monitor screen', (await po.locator('.rail-item[data-screen="monitor"]').count()) === 0);
  await po.keyboard.press('Control+Shift+M');
  check('monitor: flag off makes Ctrl+Shift+M inert', !(await po.locator('#screen-monitor:not([hidden])').count()));
  await off.close();

  // ----- browser mode -----
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await bctx.addInitScript(FLAG_ON);
  const pb = await bctx.newPage();
  errors.push(...watchConsole(pb, 'monitor-browser'));
  await pb.goto(base);
  await pb.click('.rail-item[data-screen="monitor"]');
  await pb.waitForSelector('#mon-unsupported');
  check('monitor: browser mode states it needs the desktop app', /needs the desktop app/i.test(await pb.locator('#mon-unsupported').innerText()));
  await bctx.close();

  // ----- desktop: main flow -----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(tauriMock); await ctx.addInitScript(monitorMock); await ctx.addInitScript(FLAG_ON);
  const page = await ctx.newPage();
  errors.push(...watchConsole(page, 'monitor-desktop'));
  await page.goto(base);
  await page.click('.rail-item[data-screen="monitor"]');
  await page.waitForSelector('#mon-setup');
  check('monitor: empty state asks for an input pair per deck and a format', /Pick an input pair per deck and a timecode format/.test(await page.locator('#mon-empty').innerText()));
  check('monitor: UI labels the WASAPI-next-to-DJ-software question as unverified (H-31)', /not verified.*H-31/s.test(await page.locator('#mon-hw-note').innerText()));
  await page.waitForFunction(() => document.querySelectorAll('#mon-pair-a option').length >= 4, null, { timeout: 5000 }).catch(() => {});
  await page.check('#mon-use-b');
  await page.selectOption('#mon-pair-b', { label: '3-4' }).catch(() => {});
  await page.selectOption('#mon-format', 'Serato CV02.5');
  await shot(page, 'monitor-setup');
  await page.click('#mon-start');
  await page.waitForSelector('.mon-deck[data-deck="A"][data-state="ok"]', { timeout: 8000 });
  await page.waitForSelector('.mon-deck[data-deck="B"][data-state="ok"]', { timeout: 8000 });
  const st = await page.evaluate(() => ({ holder: window.__mon.holder, pairs: window.__mon.pairs, blockMs: window.__mon.blockMs }));
  check('monitor: streams under the live-monitor capture lease with both deck pairs in 250 ms hops', st.holder === 'live-monitor' && JSON.stringify(st.pairs) === '[1,3]' && st.blockMs === 250, JSON.stringify(st));
  check('AC-1 monitor: healthy timecode shows OK chips (text, not colour only) and SNR/level/drift per deck',
    (await page.locator('.mon-deck[data-deck="A"] .mon-chip').innerText()).trim().toUpperCase() === 'OK'
    && /dB/.test(await page.locator('.mon-deck[data-deck="A"] dd[data-metric="snr"]').innerText())
    && /dBFS/.test(await page.locator('.mon-deck[data-deck="A"] dd[data-metric="level"]').innerText())
    && /drift/.test(await page.locator('.mon-deck[data-deck="A"] dd[data-metric="lock"]').innerText()));
  check('monitor: Start became Stop while running', await page.isVisible('#mon-stop') && !(await page.isVisible('#mon-start')));
  await page.waitForTimeout(1600); // >= 10 s of play at ~8x: the SNR baseline is established
  await shot(page, 'monitor-running');

  // AC-2: deck A SNR drops ~8 dB
  await page.evaluate(() => { window.__mon.snrA = 24; });
  const warnToast = page.locator('#toasts .toast', { hasText: /Deck A: timecode SNR dropped \d+ dB/ });
  await warnToast.first().waitFor({ timeout: 8000 });
  check('AC-2 monitor: SNR drop toasts "Deck A: timecode SNR dropped N dB" as role=status', (await warnToast.first().getAttribute('role')) === 'status');
  await page.waitForSelector('.mon-deck[data-deck="A"][data-state="watch"]', { timeout: 4000 });
  check('AC-2 monitor: deck A chip reads Watch', (await page.locator('.mon-deck[data-deck="A"] .mon-chip').innerText()).trim().toUpperCase() === 'WATCH');
  await page.waitForTimeout(1200);
  check('AC-2 monitor: the toast appears once (cooldown)', (await page.locator('#toasts .toast', { hasText: /Deck A: timecode SNR dropped/ }).count()) === 1);

  // AC-3: dropouts on deck B -> critical
  await page.evaluate(() => { window.__mon.dropB = true; });
  const critToast = page.locator('#toasts .toast', { hasText: /Deck B: \d+ timecode dropouts in 10 s/ });
  await critToast.first().waitFor({ timeout: 10000 });
  check('AC-3 monitor: dropouts give a critical toast with role=alert', (await critToast.first().getAttribute('role')) === 'alert');
  await page.waitForSelector('.mon-deck[data-deck="B"][data-state="fault"]', { timeout: 4000 });
  check('AC-3 monitor: deck B chip reads Fault and the window badge shows Fault', (await page.locator('.mon-deck[data-deck="B"] .mon-chip').innerText()).trim().toUpperCase() === 'FAULT'
    && /Fault/i.test(await page.locator('#mon-badge').innerText()));
  check('monitor: event list records both alerts', (await page.locator('.mon-events .mon-event[data-kind="snrDrop"]').count()) >= 1 && (await page.locator('.mon-events .mon-event[data-kind="dropouts"][data-severity="critical"]').count()) >= 1);
  const tray = await page.evaluate(() => window.__mon.tray.slice());
  check('monitor: tray state follows ok -> watch -> fault', tray[0] === 'ok' && tray.includes('watch') && tray.includes('fault'), tray.join(','));
  check('monitor: unsupported tray falls back to the window badge text', /tray not available/i.test(await page.locator('#mon-badge').innerText()));
  const audit = await a11yAudit(page);
  check('monitor: running screen controls are named and >= 24 px', !audit.unnamed.length && !audit.small.length, [...audit.unnamed, ...audit.small].slice(0, 3).join(' | '));
  await shot(page, 'monitor-fault');

  // Ctrl+Shift+M stops; the session log is saved and viewable (AC-7)
  await page.click('#screen-monitor h1');
  await page.keyboard.press('Control+Shift+M');
  await page.waitForSelector('#mon-start:not([hidden])', { timeout: 5000 });
  const saved = await page.evaluate(() => ({ calls: window.__mon.calls.slice(), s: window.__mon.sessions[0], ev: window.__mon.events.length, tray: window.__mon.tray.at(-1) }));
  check('AC-7 monitor: stop closes the session with a summary, events flushed, tray off', saved.s?.endedAt && saved.s.summary?.worst === 'critical' && saved.ev >= 2 && saved.calls.includes('monitor_session_end') && saved.tray === 'off', JSON.stringify({ worst: saved.s?.summary?.worst, ev: saved.ev, tray: saved.tray }));
  await page.waitForSelector('.mon-log[data-session]', { timeout: 4000 });
  await page.click('.mon-log [data-log-view]');
  await page.waitForSelector('.mon-log-detail .mon-event');
  check('AC-7 monitor: the saved log lists every event', (await page.locator('.mon-log-detail .mon-event').count()) === saved.ev);
  await shot(page, 'monitor-log');
  // History lists the session (flag on)
  await page.click('.rail-item[data-screen="history"]');
  await page.waitForSelector('[data-run-type="monitor"]', { timeout: 5000 }).catch(() => {});
  check('AC-7 monitor: History lists the live monitor session', (await page.locator('[data-run-type="monitor"]').count()) >= 1);

  // AC-5: input held exclusively by DJ software
  await page.click('.rail-item[data-screen="monitor"]');
  await page.evaluate(() => { window.__mon.busyText = 'Failed to open the input: the device is being used exclusively by another application (AUDCLNT_E_DEVICE_IN_USE).'; });
  await page.click('#mon-start');
  await page.waitForSelector('#mon-banner[data-kind="fail"]');
  const busy = await page.locator('#mon-banner').innerText();
  check('AC-5 monitor: exclusive device shows the plain explanation and three workarounds, not a generic error',
    /Another program is using this audio device exclusively/.test(busy) && (await page.locator('#mon-banner .mon-workarounds li').count()) === 3 && /split the deck's cable/.test(busy) && /not available/i.test(busy));
  check('monitor: device-busy is a stopped state, Start is offered again', await page.isVisible('#mon-start'));
  await shot(page, 'monitor-device-busy');

  // shared capture-busy dialog: another DeckChek feature holds the lease; Esc cancels
  await page.evaluate(() => { window.__mon.busyText = null; window.__mon.leaseHolder = 'wear-map'; });
  await page.click('#mon-start');
  await page.waitForSelector('dialog.capture-busy[open]');
  check('monitor: shared capture-busy dialog names the holder', /Wear map is using the audio input/.test(await page.locator('dialog.capture-busy').innerText()));
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.capture-busy', { state: 'detached' });
  await page.waitForSelector('#mon-banner');
  check('monitor: Esc cancels and the screen says it did not start', /did not start/i.test(await page.locator('#mon-banner').innerText()) && await page.isVisible('#mon-start'));
  // Stop and continue preempts the holder and starts
  await page.click('#mon-start');
  await page.waitForSelector('dialog.capture-busy[open]');
  await page.click('dialog.capture-busy [data-action="stop"]');
  await page.waitForSelector('#mon-stop:not([hidden])', { timeout: 5000 });
  check('monitor: "Stop and continue" takes the input over and monitors', await page.evaluate(() => window.__mon.calls.includes('capture_preempt')));
  await page.click('#mon-stop');
  await page.waitForSelector('#mon-start:not([hidden])', { timeout: 5000 });
  await ctx.close();

  // ----- regressions (FS-31 review) -----
  const rctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await rctx.addInitScript(tauriMock); await rctx.addInitScript(monitorMock); await rctx.addInitScript(FLAG_ON);
  const pr = await rctx.newPage();
  errors.push(...watchConsole(pr, 'monitor-regressions'));
  await pr.goto(base);
  await pr.click('.rail-item[data-screen="monitor"]');
  await pr.waitForSelector('#mon-setup');
  await pr.waitForFunction(() => document.querySelectorAll('#mon-pair-a option').length >= 4, null, { timeout: 5000 }).catch(() => {});
  const active = () => pr.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || '');

  // retention: an empty or out-of-range field never saves and never prunes
  await pr.click('.mon-settings summary');
  await pr.waitForFunction(() => document.getElementById('mon-retention').value === '90', null, { timeout: 3000 }).catch(() => {});
  const setsBefore = await pr.evaluate(() => window.__mon.calls.filter(c => c === 'app_state_set').length);
  for (const bad of ['', '0', '99999']) {
    await pr.fill('#mon-retention', bad);
    await pr.click('#mon-settings-save');
    await pr.waitForTimeout(200);
    const r = await pr.evaluate(() => ({ prune: window.__mon.prune.slice(), sets: window.__mon.calls.filter(c => c === 'app_state_set').length, msg: document.getElementById('mon-retention-msg')?.textContent || '', invalid: document.getElementById('mon-retention').getAttribute('aria-invalid') }));
    check(`regression: retention "${bad}" is refused with a message, nothing saved or pruned`, !r.prune.length && r.sets === setsBefore && /whole number of days/i.test(r.msg) && r.invalid === 'true', JSON.stringify(r));
  }
  await pr.fill('#mon-retention', '30');
  await pr.click('#mon-settings-save');
  await pr.waitForFunction(() => window.__mon.prune.length > 0, null, { timeout: 3000 }).catch(() => {});
  const okSave = await pr.evaluate(() => ({ prune: window.__mon.prune.slice(), invalid: document.getElementById('mon-retention').getAttribute('aria-invalid') }));
  check('regression: a valid retention saves and prunes with that value', JSON.stringify(okSave.prune) === '[30]' && okSave.invalid !== 'true', JSON.stringify(okSave));

  // Start/Stop keep keyboard focus on the visible counterpart
  await pr.focus('#mon-start');
  await pr.keyboard.press('Enter');
  await pr.waitForSelector('.mon-deck[data-deck="A"][data-state="ok"]', { timeout: 8000 });
  check('regression: activating Start moves focus to Stop, not <body>', (await active()) === 'mon-stop', await active());

  // live regions only change when the state changes
  await pr.waitForTimeout(2000);
  const mutations = await pr.evaluate(() => new Promise(resolve => {
    let n = 0;
    const targets = [document.getElementById('mon-badge'), ...document.querySelectorAll('#screen-monitor [aria-live], #screen-monitor [role="status"]')].filter(el => el && !el.closest('.mon-events-wrap, .mon-logs-card, .mon-settings'));
    const mo = new MutationObserver(list => { n += list.length; });
    for (const el of new Set(targets)) mo.observe(el, { childList: true, characterData: true, subtree: true });
    setTimeout(() => { mo.disconnect(); resolve({ n, count: targets.length }); }, 1500);
  }));
  check('regression: steady OK monitoring does not rewrite the live badge or deck status notes', mutations.n === 0, JSON.stringify(mutations));

  // device lost (retrying): badge and chips must not say OK
  await pr.evaluate(() => window.__mon.lose());
  await pr.waitForSelector('#mon-banner', { timeout: 4000 });
  await pr.waitForTimeout(300);
  const lost = await pr.evaluate(() => ({ badge: document.getElementById('mon-badge').innerText, chip: document.querySelector('.mon-deck[data-deck="A"] .mon-chip').innerText, snr: document.querySelector('.mon-deck[data-deck="A"] dd[data-metric="snr"]')?.innerText || '', banner: document.getElementById('mon-banner').innerText }));
  check('regression: device lost shows "Device lost" on the badge and deck chip, not OK, with no frozen SNR', /Device lost/i.test(lost.badge) && !/Monitor: OK/i.test(lost.badge) && /Device lost/i.test(lost.chip) && !/dB/.test(lost.snr), JSON.stringify(lost));

  // Stop keeps focus (on Start)
  await pr.focus('#mon-stop');
  await pr.keyboard.press('Enter');
  await pr.waitForSelector('#mon-start:not([hidden])', { timeout: 5000 });
  await pr.waitForFunction(() => window.__mon.sessions[0]?.endedAt, null, { timeout: 4000 }).catch(() => {});
  check('regression: activating Stop moves focus to Start, not <body>', (await active()) === 'mon-start', await active());
  const hadLost = await pr.locator('.mon-events .mon-event[data-kind="deviceLost"]').count();

  // a new session starts with an empty live event list
  await pr.focus('#mon-start');
  await pr.keyboard.press('Enter');
  await pr.waitForSelector('.mon-deck[data-deck="A"][data-state="ok"]', { timeout: 8000 });
  check('regression: a new session clears the previous session\'s live events', hadLost >= 1 && (await pr.locator('.mon-events .mon-event[data-kind="deviceLost"]').count()) === 0, String(hadLost));

  // flag switched off while monitoring: the session is stopped and closed
  const endsBefore = await pr.evaluate(() => window.__mon.calls.filter(c => c === 'monitor_session_end').length);
  await pr.evaluate(async () => { (await import('./features.js')).setEnabled('liveMonitor', false); });
  await pr.waitForFunction(n => window.__mon.calls.filter(c => c === 'monitor_session_end').length > n, endsBefore, { timeout: 4000 }).catch(() => {});
  const offState = await pr.evaluate(() => ({ ends: window.__mon.calls.filter(c => c === 'monitor_session_end').length, tray: window.__mon.tray.at(-1), open: window.__mon.sessions.filter(s => !s.endedAt).length }));
  check('regression: turning the liveMonitor flag off while running stops monitoring and closes the session', offState.ends > endsBefore && offState.tray === 'off' && offState.open === 0, JSON.stringify(offState));
  await pr.evaluate(async () => { (await import('./features.js')).setEnabled('liveMonitor', true); });

  // deleting a session log keeps focus in the list, then on the heading when the list is empty
  await pr.click('.rail-item[data-screen="monitor"]');
  await pr.click('#mon-logs-refresh');
  await pr.waitForFunction(() => document.querySelectorAll('.mon-log [data-log-delete]').length >= 2, null, { timeout: 4000 }).catch(() => {});
  const nLogs = await pr.locator('.mon-log [data-log-delete]').count();
  await pr.focus('.mon-log [data-log-delete]');
  await pr.keyboard.press('Enter');
  await pr.waitForSelector('#confirm-dialog[open]');
  await pr.click('#confirm-ok');
  await pr.waitForFunction(n => document.querySelectorAll('.mon-log [data-log-delete]').length === n - 1, nLogs, { timeout: 4000 }).catch(() => {});
  await pr.waitForTimeout(100);
  const afterDel = await pr.evaluate(() => ({ attr: document.activeElement?.hasAttribute('data-log-delete'), rows: document.querySelectorAll('.mon-log').length }));
  check('regression: deleting a session log moves focus to the next log\'s Delete button', nLogs >= 2 && afterDel.rows === nLogs - 1 && afterDel.attr === true, JSON.stringify({ nLogs, ...afterDel }));
  while (await pr.locator('.mon-log [data-log-delete]').count()) {
    const left = await pr.locator('.mon-log [data-log-delete]').count();
    await pr.focus('.mon-log [data-log-delete]');
    await pr.keyboard.press('Enter');
    await pr.waitForSelector('#confirm-dialog[open]');
    await pr.click('#confirm-ok');
    await pr.waitForFunction(n => document.querySelectorAll('.mon-log [data-log-delete]').length === n - 1, left, { timeout: 4000 });
  }
  await pr.waitForTimeout(100);
  check('regression: deleting the last session log moves focus to the Session logs heading', (await active()) === 'mon-logs-title', await active());
  await rctx.close();
  return errors;
}
