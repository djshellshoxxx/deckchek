// FS-13 smoke: Control vinyl wear map. Flag off = hidden. Browser mode: empty state, add a record, scan two
// recordings of a side (a fresh one, then a worn one with dropouts, a noisy stretch and a needle skip), the
// verdict with worst bins, metric switch (M), compare toggle (C), keyboard bin navigation announcing
// "Bin N, m:ss, SNR x dB", inspector, data table, Esc, delete. Desktop mode: in-memory wearmap_* commands and a
// mocked stream capture deliver live timecode blocks; the map fills in, Space stops and the scan is saved;
// Esc cancels a second scan. Screenshots in dark and light.
import fs from 'node:fs';
import path from 'node:path';
import { tauriMock, watchConsole, a11yAudit } from './core.mjs';
import { encodeWav16 } from '../../app/advanced.js';
import { quadratureTimecode, whiteNoise } from '../../tests/fixtures/signals.mjs';

const FLAG_ON = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { wearMap: true }, inspector: true })); };
const SR = 22050;

function sideWav(dir, name, { worn = false, seed = 1 } = {}) {
  const seconds = 60;
  const sig = quadratureTimecode({ carrierHz: 1000, seconds, sampleRate: SR, snrDb: 34, amplitudeDbfs: -8, seed,
    dropouts: [[0, 0.4], ...(worn ? [[20.3, 20.36], [21.1, 21.15], [22.7, 22.76], [23.2, 23.25], [44.5, 44.55]] : [])],
    phaseJumps: worn ? [{ atSec: 41.3, deg: 110 }] : [] });
  if (worn) { // a noisy, worn stretch 30-36 s
    const n = whiteNoise(6 * SR, 10 ** (-27 / 20), seed + 7);
    for (let i = 0; i < n.length; i++) { const k = 30 * SR + i; sig.left[k] += n[i]; sig.right[k] += n[(i * 7) % n.length]; }
  }
  const file = path.join(dir, name);
  fs.writeFileSync(file, encodeWav16({ left: sig.left, right: sig.right, sampleRate: SR }));
  return file;
}

/** Desktop: in-memory wearmap_* commands, stream capture over a mocked Channel with 1 kHz quadrature blocks. */
function wearMock() {
  const core = window.__TAURI__.core, base = core.invoke;
  const wm = { records: [], scans: [], calls: [] };
  window.__wm = wm;
  let n = 0; const id = p => `${p}-${++n}`;
  let stream = null, lease = null;
  const sr = 16000;
  const encode = (seq, frames, final, t0) => {
    const buf = new ArrayBuffer(48 + frames * 8), v = new DataView(buf);
    [0x44, 0x43, 0x53, 0x42].forEach((b, i) => v.setUint8(i, b));
    v.setUint16(4, 1, true); v.setUint16(6, final ? 1 : 0, true); v.setUint32(8, seq, true); v.setUint32(12, sr, true); v.setUint32(16, frames, true);
    v.setFloat64(40, (seq + 1) * frames, true);
    for (let i = 0; i < frames; i++) {
      const t = t0 + i / sr, drop = (t > 9.2 && t < 9.26) || (t > 13.4 && t < 13.45) || (t > 13.7 && t < 13.75), ph = 2 * Math.PI * 1000 * t;
      const a = drop ? 0 : 0.35, noise = (Math.random() - 0.5) * 0.004;
      v.setFloat32(48 + i * 4, a * Math.sin(ph) + noise, true); v.setFloat32(48 + frames * 4 + i * 4, a * Math.cos(ph) + noise, true);
    }
    return buf;
  };
  class Channel { constructor() { this.onmessage = () => {}; } }
  core.Channel = Channel;
  const endStream = () => {
    if (!stream) return null;
    clearInterval(stream.timer);
    stream.channel.onmessage(encode(stream.seq++, 0, true, 0));
    const s = stream; stream = null; lease = null;
    return { streamId: s.id, ended: 'stopped', blocksSent: s.seq, lastSeq: s.seq - 1, droppedBlocks: 0, framesCaptured: (s.seq - 1) * sr, overrunSamples: 0, streamErrors: 0, streamErrorMessages: [] };
  };
  core.invoke = async (cmd, args = {}) => {
    if (cmd.startsWith('wearmap_') || /stream|lease/.test(cmd)) wm.calls.push(cmd);
    switch (cmd) {
      case 'wearmap_records_list': return wm.records.map(r => structuredClone(r));
      case 'wearmap_record_save': {
        const r = args.record;
        const prev = wm.records.find(x => x.id === r.id);
        const sides = (prev?.sides || []).slice();
        for (const s of r.sides) { if (s.id) Object.assign(sides.find(x => x.id === s.id), s); else sides.push({ ...s, id: id('side') }); }
        const saved = { id: prev?.id || id('copy'), releaseId: prev?.releaseId || id('rel'), title: r.title.trim(), format: r.format, nickname: r.nickname?.trim() || null, cleaningState: r.cleaningState, retired: false, sides };
        wm.records = prev ? wm.records.map(x => (x.id === saved.id ? saved : x)) : [...wm.records, saved];
        return saved;
      }
      case 'wearmap_save': { const s = { ...args.scan, id: id('scan'), createdAt: new Date(Date.now() + n * 1000).toISOString() }; wm.scans.push(s); const { bins, ...rest } = s; return { ...rest, binCount: bins.length }; }
      case 'wearmap_list': return wm.scans.filter(s => !args.recordSideId || s.recordSideId === args.recordSideId).map(({ bins, ...rest }) => ({ ...rest, binCount: bins.length })).reverse();
      case 'wearmap_get': { const s = wm.scans.find(x => x.id === args.id); return s ? structuredClone(s) : null; }
      case 'wearmap_delete': { const k = wm.scans.length; wm.scans = wm.scans.filter(x => x.id !== args.id); return k !== wm.scans.length; }
      case 'capture_lease_status': return lease ? { held: true, ...lease } : { held: false };
      case 'capture_preempt': { endStream(); return { stopped: null }; }
      case 'start_stream_capture': {
        if (lease) throw { code: 'CAPTURE_BUSY', message: 'busy', ...lease };
        lease = { leaseId: 1, holder: args.holder, since: Date.now() };
        stream = { id: 1, channel: args.channel, seq: 0 };
        stream.timer = setInterval(() => { if (stream) { const s = stream.seq++; stream.channel.onmessage(encode(s, sr, false, s)); } }, 70);
        return { streamId: 1, holder: args.holder, deviceName: 'Focusrite USB (In 1/2)', sampleRate: sr, channels: 2, blockMs: 1000, blockFrames: sr };
      }
      case 'stream_capture_ack': return null;
      case 'stop_stream_capture': { const s = endStream(); if (!s) throw 'No stream capture is running.'; return s; }
      default: return base(cmd, args);
    }
  };
}

export default async function run({ browser, base, tmp, check, SHOTS }) {
  const errors = [];
  const shot = async (page, name) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
    // the whole screen (main scrolls inside the shell), for reviewing the full layout
    const h = await page.evaluate(() => document.getElementById('main').scrollHeight + 96);
    const vp = page.viewportSize();
    if (h > vp.height) { await page.setViewportSize({ width: vp.width, height: Math.min(h, 4000) }); await page.waitForTimeout(150); await page.screenshot({ path: `${SHOTS}/${name}-full.png` }); await page.setViewportSize(vp); }
  };
  const fresh = sideWav(tmp, 'cv-side-a-fresh.wav', { seed: 3 });
  const worn = sideWav(tmp, 'cv-side-a-worn.wav', { worn: true, seed: 5 });

  // ----- flag off -----
  const off = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const po = await off.newPage();
  errors.push(...watchConsole(po, 'wearmap-off'));
  await po.goto(base);
  await po.waitForSelector('.rail-item');
  check('wearmap: flag off hides the Control vinyl screen', (await po.locator('.rail-item[data-screen="vinylscan"]').count()) === 0);
  await off.close();

  // ----- browser mode -----
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await ctx.addInitScript(FLAG_ON);
  const page = await ctx.newPage();
  errors.push(...watchConsole(page, 'wearmap-browser'));
  await page.goto(base);
  await page.click('.rail-item[data-screen="vinylscan"]');
  await page.waitForSelector('#wm-empty');
  check('wearmap: empty state says no control vinyl is registered', /No control vinyl registered/.test(await page.locator('#wm-empty').innerText()));
  await page.click('#wm-add-first');
  await page.selectOption('#wm-f-format', 'Serato CV02.5');
  check('wearmap: sides come from the format side table', (await page.locator('.wm-f-side').count()) === 2 && (await page.locator('.wm-f-side [name=length]').first().inputValue()) === '11:52');
  await page.fill('#wm-f-nick', 'Deck 1');
  await page.locator('.wm-f-side [name=length]').first().fill('abc');
  await page.click('#wm-f-save');
  check('wearmap: bad side length is reported in the form', /minutes:seconds/.test(await page.locator('#wm-f-error').innerText()));
  await page.locator('.wm-f-side [name=length]').first().fill('1:00');
  await page.click('#wm-f-save');
  await page.waitForSelector('#wm-start');
  check('wearmap: record added and setup shown', /Serato CV02\.5 · Deck 1/.test(await page.locator('#wm-copy option:checked').innerText()));
  check('wearmap: live source is marked desktop-only in the browser', (await page.getAttribute('#wm-src-live', 'aria-disabled')) === 'true' && (await page.getAttribute('#wm-src-file', 'aria-checked')) === 'true');
  check('wearmap: start is disabled until a recording is chosen', await page.locator('#wm-start').isDisabled());
  await shot(page, 'wearmap-setup-dark');

  // first (fresh) scan
  await page.setInputFiles('#wm-file', fresh);
  await page.click('#wm-start');
  await page.waitForSelector('#wm-verdict', { timeout: 60000 });
  check('wearmap: fresh side gets Keep', /keep/i.test(await page.locator('#wm-verdict .verdict-chip').innerText()));
  check('wearmap: map draws one arc per bin', (await page.locator('#wm-map .gm-bin').count()) === 30);
  // second (worn) scan of the same side
  await page.click('#wm-rescan');
  await page.setInputFiles('#wm-file', worn);
  await page.locator('#wm-file').focus();
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Space');
  await page.waitForSelector('#wm-live-map, #wm-verdict', { timeout: 10000 });
  await page.waitForSelector('#wm-verdict', { timeout: 60000 });
  const verdictText = await page.locator('#wm-verdict').innerText();
  check('wearmap: worn side verdict is not Keep and names the dropouts', !/keep/i.test(await page.locator('#wm-verdict .verdict-chip').innerText()) && /dropouts? between/.test(verdictText), verdictText.split('\n').slice(0, 3).join(' / '));
  check('wearmap: recommendation line present', /What to do/.test(await page.locator('#wm-reco').innerText()));
  check('wearmap: three worst bins listed with timestamps', (await page.locator('.wm-worst-item').count()) === 3 && /\d:\d\d/.test(await page.locator('.wm-worst-item').first().innerText()));
  check('wearmap: worst bins are pinned on the map', (await page.locator('#wm-map .gm-pin').count()) === 3);
  check('wearmap: bad bins are hatched (not colour alone)', (await page.locator('#wm-map .gm-bad').count()) >= 1 && (await page.locator('#wm-map .gm-tex').count()) >= 1);
  check('wearmap: needle skip is found and marked', (await page.locator('#wm-map .gm-skip').count()) === 1 && /0:41/.test(await page.locator('#wm-skips').innerText()));
  check('wearmap: needle drop bin is drawn as interrupted', (await page.locator('#wm-map .gm-neutral').count()) >= 1);
  check('wearmap: history lists both scans', (await page.locator('.wm-hist-item').count()) === 2);
  await page.evaluate(() => { document.getElementById('main').scrollTop = 0; });
  await shot(page, 'wearmap-result-dark');

  // keyboard: bins announce, inspector shows raw numbers
  await page.locator('#wm-map').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  const said = await page.locator('#sr-polite').innerText();
  check('wearmap: arrow keys move bin by bin and announce "Bin 1, 0:02, SNR …"', /^Bin 1, 0:02, SNR \d+ dB/.test(said), said);
  check('wearmap: focus stays on the map and the bin is outlined', await page.evaluate(() => document.activeElement?.id === 'wm-map') && (await page.locator('#wm-map .gm-sel').count()) === 1);
  check('wearmap: details panel shows the bin numbers', /SNR/.test(await page.locator('#inspector-body').innerText()) && /Bin 1/.test(await page.locator('#inspector-title').innerText()));
  check('wearmap: inspector shows a waveform snippet of the bin (AC-7)', (await page.locator('#inspector-body svg.wm-scope polygon').count()) === 2);
  await page.keyboard.press('End');
  check('wearmap: End jumps to the last bin', /Bin 29/.test(await page.locator('#inspector-title').innerText()));
  await page.locator('.wm-worst-item').first().click();
  check('wearmap: worst-bin button selects that bin', (await page.locator('#wm-map .gm-sel').count()) === 1);
  await page.locator('#wm-map').focus();
  await page.keyboard.press('Escape');
  check('wearmap: Esc clears the selection', (await page.locator('#wm-map .gm-sel').count()) === 0);

  // metric switch (M) and compare (C)
  await page.keyboard.press('m');
  check('wearmap: M switches the metric to phase error', (await page.getAttribute('#wm-metric [data-metric="phase"]', 'aria-checked')) === 'true');
  await page.keyboard.press('m'); await page.keyboard.press('m');
  check('wearmap: M cycles back to SNR', (await page.getAttribute('#wm-metric [data-metric="snr"]', 'aria-checked')) === 'true');
  check('wearmap: compare toggle offers the earlier scan', !(await page.locator('#wm-compare').isDisabled()));
  await page.keyboard.press('c');
  await page.waitForSelector('#wm-compare-text');
  const cmp = await page.locator('#wm-compare-text').innerText();
  check('wearmap: compare shows new bad bins and new dropouts vs the previous scan', /new bad bins?/.test(cmp) && /new dropouts?/.test(cmp) && /lined up by needle drop/.test(cmp), cmp);
  check('wearmap: compare marks new bad bins on the map', (await page.locator('#wm-map .gm-newbad').count()) >= 1);
  check('wearmap: timeline draws the earlier scan as a dashed line', (await page.locator('#wm-tl .tl-prev').count()) === 1);
  await shot(page, 'wearmap-compare-dark');
  await page.keyboard.press('Escape');
  check('wearmap: Esc turns compare off', (await page.locator('#wm-compare-text').count()) === 0);

  // data table
  await page.click('#wm-table-toggle');
  check('wearmap: data table lists every bin', (await page.locator('#wm-table tbody tr').count()) === 30);
  await page.locator('#wm-table tbody tr').nth(11).locator('button').click();
  check('wearmap: table row jumps to the bin on the map', /Bin 11/.test(await page.locator('#inspector-title').innerText()) && await page.evaluate(() => document.activeElement?.id === 'wm-map'));
  await page.click('#wm-table-toggle');
  const audit = await a11yAudit(page);
  check('wearmap: a11y names and target sizes', !audit.unnamed.length && !audit.small.length, [...audit.unnamed, ...audit.small].slice(0, 3).join(' | '));

  // light theme
  await page.click('#theme-toggle');
  await page.evaluate(() => { document.getElementById('main').scrollTop = 0; });
  check('wearmap: map redraws for the light theme', (await page.getAttribute('#wm-map svg', 'data-theme')) === 'light');
  await shot(page, 'wearmap-result-light');
  await page.keyboard.press('c');
  await page.waitForSelector('#wm-compare-text');
  await shot(page, 'wearmap-compare-light');
  await page.keyboard.press('c');
  await page.locator('.wm-hist-item').nth(1).click();
  await page.waitForSelector('.wm-hist-item.is-current');
  check('wearmap: history opens an earlier scan', /keep/i.test(await page.locator('#wm-verdict .verdict-chip').innerText()));
  await page.click('#wm-rescan');
  await page.waitForSelector('#wm-start');
  await page.evaluate(() => { document.getElementById('main').scrollTop = 0; });
  await shot(page, 'wearmap-setup-light');
  // delete the newest scan
  await page.locator('.wm-hist-item').first().click();
  await page.waitForSelector('#wm-delete');
  await page.click('#wm-delete');
  await page.click('#confirm-ok');
  await page.waitForFunction(() => document.querySelectorAll('.wm-hist-item').length === 1);
  check('wearmap: delete removes the scan', true);
  await page.click('#theme-toggle');
  await ctx.close();

  // ----- desktop mode: live stream -----
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await dctx.addInitScript(tauriMock); await dctx.addInitScript(wearMock); await dctx.addInitScript(FLAG_ON);
  const pd = await dctx.newPage();
  errors.push(...watchConsole(pd, 'wearmap-desktop'));
  await pd.goto(base);
  await pd.click('.rail-item[data-screen="vinylscan"]');
  await pd.waitForSelector('#wm-add-first');
  await pd.click('#wm-add-first');
  await pd.selectOption('#wm-f-format', 'Serato CV02.5');
  await pd.locator('.wm-f-side [name=length]').first().fill('0:40');
  await pd.click('#wm-f-save');
  await pd.waitForSelector('#wm-start');
  check('wearmap desktop: record saved through wearmap_record_save', await pd.evaluate(() => window.__wm.calls.includes('wearmap_record_save') && window.__wm.records.length === 1));
  check('wearmap desktop: live input is the default source', (await pd.getAttribute('#wm-src-live', 'aria-checked')) === 'true');
  await pd.click('#wm-start');
  await pd.waitForSelector('#wm-live-map');
  await pd.waitForFunction(() => document.querySelectorAll('#wm-live-map .gm-bin').length >= 8, null, { timeout: 15000 });
  check('wearmap desktop: the map fills in live', true);
  check('wearmap desktop: progress by time and position', /%/.test(await pd.locator('#wm-cap-facts').innerText()) && /mm from centre/.test(await pd.locator('#wm-cap-facts').innerText()));
  check('wearmap desktop: status bar shows the scan', /Wear map/.test(await pd.locator('#status-capture').innerText()));
  await shot(pd, 'wearmap-capture-dark');
  await pd.evaluate(() => document.activeElement.blur());
  await pd.keyboard.press('Space');
  await pd.waitForSelector('#wm-verdict', { timeout: 15000 });
  const saved = await pd.evaluate(() => window.__wm.scans[0]);
  check('wearmap desktop: Space stops and saves through wearmap_save', saved && saved.bins.length >= 8 && saved.recordSideId.startsWith('side-'));
  check('wearmap desktop: partial scan reports coverage', /% of side scanned/.test(await pd.locator('#wm-verdict').innerText()));
  check('wearmap desktop: capture released', await pd.evaluate(() => window.__wm.calls.includes('stop_stream_capture')) && /Idle/.test(await pd.locator('#status-capture').innerText()));
  // Esc cancels a running scan without saving
  await pd.click('#wm-rescan');
  await pd.waitForSelector('#wm-start');
  await pd.click('#wm-start');
  await pd.waitForFunction(() => document.querySelectorAll('#wm-live-map .gm-bin').length >= 2, null, { timeout: 15000 });
  await pd.keyboard.press('Escape');
  await pd.waitForSelector('#wm-start');
  check('wearmap desktop: Esc cancels the scan and saves nothing', await pd.evaluate(() => window.__wm.scans.length === 1));
  await pd.click('#theme-toggle');
  await pd.click('#wm-start');
  await pd.waitForFunction(() => document.querySelectorAll('#wm-live-map .gm-bin').length >= 6, null, { timeout: 15000 });
  await shot(pd, 'wearmap-capture-light');
  await pd.click('#wm-cancel');
  await pd.click('#theme-toggle');
  await dctx.close();
  return errors;
}
