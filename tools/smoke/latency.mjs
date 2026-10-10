// FS-11 smoke: Latency & buffer screen. Flag off = hidden; browser mode = guidance plus "needs the desktop app";
// desktop mode with an in-memory implementation of the tuner commands covers: the WASAPI-not-ASIO scope notice,
// the patch-cable guide, the volume gate, the round trip (synthetic delay) with reported-vs-measured, the
// no-loopback state with a stress-only escape (AC-5), the buffer sweep in the honoured branch (A) and the
// ignored branch (C, typed ASIO buffer), per-software recommendations, the Windows checklist with fix actions,
// Esc aborting a run (AC-7), keyboard use and both themes.
import { watchConsole, tauriMock, a11yAudit } from './core.mjs';

const FLAG_ON = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { latencyTuner: true } })); };

// Desktop mode: tauriMock plus the latency commands. `window.__lat` exposes scenario switches and the call log.
function latencyMock() {
  const core = window.__TAURI__.core; const base = core.invoke;
  const lat = { calls: [], loop: true, delaySamples: 336, branch: 'honoured', slowMs: 40, aborted: false, windows: true, runs: [], recs: [] };
  window.__lat = lat;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const dir = (requested, actual, mode, reason) => ({ direction: 'x', opened: true, deviceName: 'Traktor Audio 8 DJ', sampleRate: 48000, channels: 2, requestedFrames: requested, bufferRequest: 'fixed', mode, modeReason: reason, actualFrames: actual, actualPeriodMs: actual / 48, streamErrors: [] });
  core.invoke = async (cmd, args = {}) => {
    if (cmd === 'list_native_audio_outputs') return [{ name: 'Speakers (Realtek Audio)', isDefault: true, sampleRate: 48000, channels: 2 }, { name: 'Focusrite USB (Out 1/2)', isDefault: false, sampleRate: 48000, channels: 2 }];
    if (!/^(audio_device_buffer_info|latency_|stress_run|windows_tuning_scan|buffer_recommendation_)/.test(cmd)) return base(cmd, args);
    lat.calls.push(cmd);
    if (cmd === 'audio_device_buffer_info') return { deviceName: 'Focusrite USB (In 1/2)', outputDeviceName: 'Speakers (Realtek Audio)', hostApi: 'WASAPI', sampleRate: 48000, input: { minFrames: 32, maxFrames: 4096, default: null, known: true }, output: { minFrames: 32, maxFrames: 4096, default: null, known: true }, supportsFixed: true, errors: [] };
    if (cmd === 'latency_abort') { lat.aborted = true; return null; }
    if (cmd === 'latency_play_and_capture') {
      await sleep(lat.slowMs);
      const src = args.stimulus.left, n = src.length, d = lat.delaySamples, left = new Array(n).fill(0);
      if (lat.loop) for (let i = 0; i + d < n; i++) left[i + d] = src[i] * 0.4;
      return { captured: { sampleRate: 48000, left, right: left }, quality: {}, reportedBufferFrames: { in: 128, out: 128 }, alignment: { frames: 0, minFrames: 0, maxFrames: 0, pairs: 20 }, outputSampleRate: 48000, outputLevelDbfs: args.levelDbfs, bufferMode: 'hostChosen', duplex: 'full', input: dir(null, 128, 'hostChosen', 'defaultRequested'), output: dir(null, 128, 'hostChosen', 'defaultRequested'), ended: 'completed', hostApi: 'WASAPI', scope: 'WASAPI round trip' };
    }
    if (cmd === 'stress_run') {
      const slow = window.__lat.slowStress ?? lat.slowMs;
      lat.aborted = false;
      const end = Date.now() + slow;
      while (Date.now() < end) { await sleep(20); if (lat.aborted) break; }
      const req = args.bufferFrames;
      const aborted = lat.aborted;
      let actual, mode, reason;
      if (lat.branch === 'ignored') { actual = 480; mode = 'hostChosen'; reason = 'fixedRejected'; } else { actual = req ?? 480; mode = req === null ? 'hostChosen' : 'honoured'; reason = req === null ? 'defaultRequested' : 'matched'; }
      const bad = lat.branch === 'honoured' && req !== null && req <= 64 && args.cpuLoadPct > 0;
      const mk = d => ({ ...dir(req, actual, mode, reason), direction: d });
      return { requested: req, actual, callbacks: 3000, xruns: bad ? 4 : 0, maxGapMs: bad ? 9 : actual / 48 * 1.1, p99GapMs: actual / 48, overruns: 0, streamErrors: [], bufferMode: mode, duplex: 'full', input: mk('input'), output: mk('output'), cpuLoadPct: args.cpuLoadPct, loadThreads: 2, loadStopMs: 3, seconds: args.seconds, ended: aborted ? 'aborted' : 'completed', hostApi: 'WASAPI' };
    }
    if (cmd === 'windows_tuning_scan') {
      await sleep(lat.slowMs);
      if (!lat.windows) return { supported: false, usbSelectiveSuspend: {}, minProcessorState: {}, minCores: {}, wifi: [], bluetooth: [], dpcProxy: { samples: 0 }, errors: [] };
      return { supported: true, activePlan: { name: 'Balanced', guid: '381b4222-f694-41f0-9685-ff5bb260df2e' }, usbSelectiveSuspend: { ac: 1, dc: 1 }, minProcessorState: { ac: 100, dc: 5 }, minCores: { ac: 100, dc: 100 }, wifi: [{ name: 'Wi-Fi', status: 'Up' }], bluetooth: [], timerResolutionMs: null, timerJitter: { samples: 200, meanMs: 0.3, p99Ms: 1.1, maxMs: 2 }, dpcProxy: { dpcPct: 1.2, interruptPct: 0.4, samples: 10 }, onBattery: false, backgroundApps: [{ exe: 'chrome.exe', cpuPct: 14.2 }], errors: [] };
    }
    if (cmd === 'latency_run_save') { const row = { id: `r-${lat.runs.length}`, ...args.input }; lat.runs.push(row); return row; }
    if (cmd === 'latency_run_list') return lat.runs;
    if (cmd === 'latency_run_delete') return true;
    if (cmd === 'buffer_recommendation_save') { lat.recs.push({ id: `b-${lat.recs.length}`, createdAt: new Date().toISOString(), ...args.input }); return lat.recs.at(-1); }
    if (cmd === 'buffer_recommendation_latest') return lat.recs.filter(r => r.deviceName === args.deviceName);
    return null;
  };
}

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  const shot = async (page, name) => { await page.waitForTimeout(200); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const text = (page, sel) => page.locator(sel).innerText();

  // ----- flag off -----
  const off = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const po = await off.newPage();
  errors.push(...watchConsole(po, 'latency-off'));
  await po.goto(base);
  await po.waitForSelector('.rail-item');
  check('latency: flag off hides the Latency screen', (await po.locator('.rail-item[data-screen="latency"]').count()) === 0);
  await off.close();

  // ----- browser mode -----
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await bctx.addInitScript(FLAG_ON);
  const pb = await bctx.newPage();
  errors.push(...watchConsole(pb, 'latency-browser'));
  await pb.goto(base);
  await pb.waitForSelector('.rail-item[data-screen="latency"]');
  await pb.click('.rail-item[data-screen="latency"]');
  await pb.waitForSelector('#lat-unsupported:not([hidden])');
  check('latency: browser mode says it needs the desktop app', /Needs the desktop app/.test(await text(pb, '#lat-unsupported')));
  check('latency: browser mode still explains the cable setup', /PHONO/.test(await text(pb, '.lat-guide')));
  check('latency: browser mode cannot start a measurement', await pb.locator('#lat-measure').isDisabled());
  await bctx.close();

  // ----- desktop -----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await ctx.addInitScript(tauriMock); await ctx.addInitScript(latencyMock); await ctx.addInitScript(FLAG_ON);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const page = await ctx.newPage();
  errors.push(...watchConsole(page, 'latency'));
  await page.goto(base);
  await page.waitForSelector('.rail-item[data-screen="latency"]');
  await page.click('.rail-item[data-screen="latency"]');
  await page.waitForSelector('#lat-measure');
  check('latency: opens with the screen title', /Latency & buffer/.test(await text(page, '#screen-latency h1')));

  // scope honesty is on screen before anything runs
  const scope = await text(page, '#lat-scope');
  check('latency: states plainly that measurements are WASAPI, not ASIO', /WASAPI \(Windows audio\), not ASIO/.test(scope), scope.slice(0, 120));
  check('latency: explains why ASIO is not measured', /Steinberg/.test(await page.locator('#lat-scope').innerHTML()));
  check('latency: patch cable guide is shown with output, cable and input', /Interface OUTPUT/.test(await text(page, '.lat-guide')) && /Patch cable/.test(await text(page, '.lat-guide')) && /Interface INPUT/.test(await text(page, '.lat-guide')));
  check('latency: guide warns against PHONO inputs and loud output', /Never use a PHONO input/.test(await text(page, '.lat-guide')) && /Turn monitors and headphones down/.test(await text(page, '.lat-guide')));
  await page.waitForFunction(() => document.querySelector('#lat-in')?.options.length >= 1 && document.querySelector('#lat-out')?.options.length >= 2);
  check('latency: input and output pickers are filled from the desktop app', (await page.locator('#lat-out option').count()) === 2);
  check('latency: Measure is disabled until the volume box is ticked', await page.locator('#lat-measure').isDisabled());
  await shot(page, 'latency-measure-empty-dark');

  // round trip
  await page.check('#lat-ack');
  check('latency: ticking the volume box enables Measure', await page.locator('#lat-measure').isEnabled());
  await page.click('#lat-measure');
  await page.waitForSelector('#lat-big');
  const big = await text(page, '#lat-big');
  check('latency: round trip shows the measured delay (336 samples = 7.00 ms)', /^7\.0\d ms$/.test(big), big);
  const res = await text(page, '#lat-measure-result');
  check('latency: result is labelled WASAPI round trip', /WASAPI round trip/.test(res));
  check('latency: result shows uncertainty with k=2 and run count', /±/.test(res) && /k=2/.test(res) && /5 of 5 chirps/.test(res));
  check('latency: reported vs measured table shows buffers and overhead', /Buffers Windows ran \(in 128 \+ out 128 frames\)/.test(res) && /5\.33 ms/.test(res) && /driver \/ USB overhead/.test(res));
  check('latency: result is saved to history', await page.evaluate(() => window.__lat.runs.some(r => r.kind === 'roundtrip' && Math.abs(r.measuredMs - 7) < 0.1 && r.detail.scope === 'WASAPI round trip')));
  await shot(page, 'latency-measure-result-dark');

  // no loopback -> AC-5 escape
  await page.evaluate(() => { window.__lat.loop = false; });
  await page.click('#lat-measure');
  await page.waitForSelector('.lat-result-fail');
  check('latency: no cable says no chirp came back with fixes', /No chirp came back/.test(await text(page, '#lat-measure-result')) && (await page.locator('.lat-fixes li').count()) >= 3);
  await shot(page, 'latency-measure-nocable-dark');
  await page.click('#lat-measure-result [data-go="buffer"]');
  await page.waitForSelector('#lat-sweep');
  check('latency: AC-5 stress-only path leads to the buffer test', /Find the smallest safe buffer/.test(await text(page, '#lat-panel')));
  check('latency: buffer test says no cable is needed', /No cable is needed/.test(await text(page, '#lat-panel')));
  await page.evaluate(() => { window.__lat.loop = true; });

  // buffer sweep, branch A
  await page.selectOption('#lat-secs', '10');
  await page.click('#lat-sweep');
  await page.waitForSelector('#lat-stop:not([disabled])');
  check('latency: a running sweep exposes a progressbar', (await page.locator('[role="progressbar"]').count()) === 1);
  await page.waitForSelector('#lat-branch', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('#lat-sweep:not([disabled])'), null, { timeout: 30000 });
  check('latency: honoured branch is detected and labelled A', /Honoured/i.test(await text(page, '#lat-branch')) && /Detected on this computer/i.test(await text(page, '#lat-branch')));
  const rowsA = await page.locator('.lat-sweep tbody tr').count();
  check('latency: sweep table lists every size, large to small', rowsA === 5 && /1024 frames/.test(await text(page, '.lat-sweep tbody tr:first-child')), String(rowsA));
  check('latency: failing size shows Fail with a word, not colour alone', /Fail/i.test(await text(page, '.lat-sweep tbody tr:has-text("64 frames")')));
  check('latency: sweep results are persisted', await page.evaluate(() => window.__lat.runs.filter(r => r.kind === 'stress').length >= 8 && window.__lat.recs.length === 3));
  await shot(page, 'latency-buffer-honoured-dark');

  // recommendations
  await page.click('#lat-tab-advice');
  await page.waitForSelector('.lat-advice');
  const advice = await text(page, '.lat-advice-grid');
  check('latency: one recommendation per DJ program', (await page.locator('.lat-advice').count()) === 3);
  check('latency: Serato card uses its own setting name and path', /USB Buffer Size/.test(advice) && /Setup > Audio > USB Buffer Size/.test(advice));
  check('latency: Traktor card uses Latency (ms)', /Preferences > Audio Setup > Latency \(ms\)/.test(advice));
  check('latency: rekordbox card says its setting name is not verified', /Buffer Size/.test(advice) && /Setting name not verified/i.test(await text(page, '.lat-advice:has(#lat-adv-rekordbox)')));
  check('latency: recommended buffer has one step of headroom (256 after 128 passes)', /256 samples/.test(advice) && /Lowest safe setting: 256 samples/.test(advice), advice.slice(0, 200));
  await shot(page, 'latency-advice-dark');

  // branch C (ignored)
  await page.evaluate(() => { window.__lat.branch = 'ignored'; });
  await page.click('#lat-tab-buffer');
  await page.click('#lat-sweep');
  await page.waitForSelector('#lat-stop:not([disabled])');
  await page.waitForFunction(() => document.querySelector('#lat-sweep:not([disabled])'), null, { timeout: 30000 });
  check('latency: ignored branch is detected and explained (C)', /Ignored/i.test(await text(page, '#lat-branch')) && /Type the ASIO buffer/.test(await text(page, '#lat-branch')));
  check('latency: ignored branch shows one host-chosen row only', (await page.locator('.lat-sweep tbody tr').count()) === 1 && /host-chosen period/.test(await text(page, '.lat-sweep')));
  await shot(page, 'latency-buffer-ignored-dark');
  await page.click('#lat-tab-advice');
  check('latency: ignored branch asks for a typed ASIO buffer instead of a smallest-safe claim', /Type your ASIO buffer/.test(await text(page, '.lat-advice-grid')) && !/Lowest safe setting/.test(await text(page, '.lat-advice-grid')));
  await page.fill('#lat-typed', '256');
  await page.press('#lat-typed', 'Tab');
  await page.waitForSelector('.lat-advice:has-text("256 samples")');
  check('latency: typed buffer is labelled typed, not measured', /ASIO buffer \(typed, not measured\)/.test(await text(page, '.lat-advice-grid')));
  await page.fill('#lat-typed', '5');
  await page.press('#lat-typed', 'Tab');
  check('latency: an invalid typed buffer is rejected inline', /whole number of samples/.test(await text(page, '#lat-typed-err')));
  await shot(page, 'latency-advice-typed-dark');

  // windows checklist
  await page.click('#lat-tab-windows');
  await page.click('#lat-scan');
  await page.waitForSelector('.lat-checks');
  const win = await text(page, '.lat-checks');
  check('latency: checklist shows Pass / Review / Unknown with words', /Review/i.test(win) && /Pass/i.test(win));
  check('latency: power plan Balanced is flagged for review', /Balanced/.test(await text(page, '.lat-check[data-item="powerPlan"]')) && /Review/i.test(await text(page, '.lat-check[data-item="powerPlan"]')));
  check('latency: review items come first', await page.evaluate(() => document.querySelector('.lat-check').classList.contains('lat-check-review')));
  check('latency: summary counts the results', /\d+ pass · \d+ to review/.test(await text(page, '#lat-win-summary')));
  await page.locator('.lat-check[data-item="powerPlan"] summary').click();
  const how = await text(page, '.lat-check[data-item="powerPlan"] .lat-how');
  check('latency: fix action shows the inspect command, the manual path and a Win+R shortcut', /powercfg \/getactivescheme/.test(how) && /Control Panel > Power Options/.test(how) && /control powercfg\.cpl/.test(how));
  await page.click('.lat-check[data-item="powerPlan"] [data-what="Shortcut"]');
  await page.waitForFunction(() => /Shortcut copied/.test(document.getElementById('toasts')?.innerText || ''));
  check('latency: checklist says DeckChek never changes settings', /never changes anything/.test(await text(page, '#lat-panel')));
  await shot(page, 'latency-windows-dark');

  // non-Windows
  await page.evaluate(() => { window.__lat.windows = false; });
  await page.click('#lat-scan');
  await page.waitForSelector('#lat-win-unsupported');
  check('latency: non-Windows hides the checklist with a note', /Windows desktop app only/.test(await text(page, '#lat-win-unsupported')) && (await page.locator('.lat-checks').count()) === 0);
  await page.evaluate(() => { window.__lat.windows = true; });

  // Esc aborts a sweep (AC-7)
  await page.evaluate(() => { window.__lat.branch = 'honoured'; window.__lat.slowStress = 3000; });
  await page.click('#lat-tab-buffer');
  await page.selectOption('#lat-secs', '10');
  await page.click('#lat-sweep');
  await page.waitForSelector('#lat-stop:not([disabled])');
  await page.waitForTimeout(150);
  await page.evaluate(() => document.getElementById('main').focus());
  const t0 = Date.now();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#lat-sweep:not([disabled])'), null, { timeout: 10000 });
  check('latency: AC-7 Esc stops the run quickly and calls the abort command', Date.now() - t0 < 4000 && (await page.evaluate(() => window.__lat.calls.includes('latency_abort'))));
  check('latency: an aborted sweep says partial results are shown', /stopped/i.test(await text(page, '#lat-status')));
  await page.evaluate(() => { window.__lat.slowStress = 40; });

  // tab keyboard + a11y
  await page.focus('#lat-tab-buffer');
  await page.keyboard.press('ArrowRight');
  check('latency: arrow keys move between tabs', await page.evaluate(() => document.activeElement?.id === 'lat-tab-advice'));
  for (const tab of ['measure', 'buffer', 'advice', 'windows']) {
    await page.click(`#lat-tab-${tab}`);
    const audit = await a11yAudit(page);
    check(`latency: a11y names + target sizes (${tab})`, !audit.unnamed.length && !audit.small.length, [...audit.unnamed, ...audit.small].slice(0, 3).join(' | '));
  }

  // export
  await page.click('#lat-tab-measure');
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.keyboard.press('Control+e');
  const file = await dl;
  check('latency: Ctrl+E exports a JSON file', Boolean(file) && /deckchek-latency-.*\.json$/.test(file.suggestedFilename()));

  // light theme + narrow
  await page.click('#theme-toggle');
  await page.click('#lat-tab-measure');
  await shot(page, 'latency-measure-result-light');
  await page.click('#lat-tab-buffer');
  await shot(page, 'latency-buffer-light');
  await page.click('#lat-tab-advice');
  await shot(page, 'latency-advice-light');
  await page.click('#lat-tab-windows');
  await page.click('#lat-scan');
  await page.waitForSelector('.lat-checks');
  await shot(page, 'latency-windows-light');
  await page.setViewportSize({ width: 760, height: 900 });
  await page.click('#lat-tab-measure');
  await shot(page, 'latency-measure-narrow-light');
  check('latency: no horizontal overflow at 760 px', await page.evaluate(() => { const m = document.getElementById('main'); return m.scrollWidth <= m.clientWidth + 1; }));
  await ctx.close();
  return errors;
}
