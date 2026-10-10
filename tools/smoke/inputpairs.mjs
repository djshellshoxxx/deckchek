// GAP-02 / GAP-08 smoke: the input-pair picker wherever a capture is set up (Quick Check, wear map, scratch, latency, hum,
// calibration), remembered per input, and the scratch test's shared "Stop and continue" flow when another feature holds the input.
import { watchConsole, tauriMock, setViewport } from './core.mjs';

const FLAGS = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { scratchTest: true, wearMap: true, latencyTuner: true, humHunter: true } })); };

// An 8-input and a 2-input interface, a record of every capture start, and a lease another feature can hold.
function pairsMock() {
  const core = window.__TAURI__.core, base = core.invoke;
  const st = { starts: [], busy: null, preempts: 0 };
  window.__ip = st;
  core.invoke = async (cmd, args = {}) => {
    if (cmd === 'list_native_audio_inputs') return [{ name: 'Focusrite USB (In 1/2)', isDefault: true, maxChannels: 2, defaultChannels: 2 }, { name: 'Rane SEVENTY-TWO MKII', isDefault: false, maxChannels: 8, defaultChannels: 8 }];
    if (cmd === 'wearmap_records_list') return [{ id: 'rec-1', releaseId: 'rel-1', title: 'Serato CV02.5 copy', format: 'Serato CV02.5', nickname: 'Booth copy', cleaningState: 'clean', retired: false, sides: [{ id: 'side-1', sideLabel: 'A', lengthSec: 712 }, { id: 'side-2', sideLabel: 'B', lengthSec: 712 }] }];
    if (cmd === 'wearmap_list') return [];
    if (cmd === 'capture_lease_status') return st.busy ? { held: true, leaseId: 77, ...st.busy, deviceName: null, kind: 'stream' } : { held: false, leaseId: null, holder: null, deviceName: null, since: null, kind: null };
    if (cmd === 'capture_preempt') { st.preempts++; st.busy = null; return { stopped: null }; }
    if (cmd === 'start_live_capture') {
      if (st.busy) throw { code: 'CAPTURE_BUSY', message: `The audio input is busy: "${st.busy.holder}" is already running.`, ...st.busy };
      st.starts.push({ cmd, pairs: args.pairs ?? null, device: args.deviceName ?? null });
    }
    return base(cmd, args);
  };
}

export default async function run({ browser, base, check }) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(tauriMock); await ctx.addInitScript(pairsMock); await ctx.addInitScript(FLAGS);
  const page = await ctx.newPage();
  errors.push(...watchConsole(page, 'inputpairs'));
  await page.goto(base);
  await page.waitForSelector('.rail-item');
  const opts = sel => page.locator(`${sel} option`).evaluateAll(os => os.map(o => o.textContent));
  const go = async id => { await page.click(`.rail-item[data-screen="${id}"]`); };

  // Rane (8 inputs) is the chosen input.
  await page.selectOption('#device-select', 'Rane SEVENTY-TWO MKII');

  // ----- scratch -----
  await go('scratch');
  await page.waitForSelector('#sc-pair');
  check('pairs: scratch setup offers the Rane pairs, default 1-2', (await opts('#sc-pair')).join() === '1-2,3-4,5-6,7-8' && (await page.locator('#sc-pair option:checked').innerText()) === '1-2');
  await page.selectOption('#sc-pair', '3');
  check('pairs: the choice is remembered per input', await page.evaluate(() => JSON.parse(localStorage.getItem('deckchek.inputPairs.v1') || '{}')['rane seventy-two mkii'] === 3));
  await page.check('#sc-vol');
  await page.click('#sc-start');
  await page.waitForFunction(() => window.__ip.starts.length === 1);
  check('pairs: the scratch baseline captures pair 3-4', await page.evaluate(() => JSON.stringify(window.__ip.starts[0].pairs) === '[3]'), await page.evaluate(() => JSON.stringify(window.__ip.starts)));
  await page.click('#sc-cancel');
  await page.waitForSelector('#sc-start');

  // ----- scratch: shared capture-busy flow (GAP-08) -----
  await page.evaluate(() => { window.__ip.busy = { holder: 'wear-map', since: Date.now() - 90000 }; });
  await page.check('#sc-vol').catch(() => {});
  await page.click('#sc-start');
  await page.waitForSelector('dialog.capture-busy[open]');
  const body = await page.locator('dialog.capture-busy').innerText();
  check('capture-busy: scratch asks before taking the input from the wear map', /Wear map is using the audio input\. Stop it and run the scratch test\?/.test(body), body.replace(/\s+/g, ' '));
  check('capture-busy: Cancel is focused (the safer action)', await page.evaluate(() => document.activeElement?.dataset.action === 'cancel'));
  await page.click('dialog.capture-busy [data-action="cancel"]');
  await page.waitForSelector('dialog.capture-busy', { state: 'detached' });
  check('capture-busy: Cancel leaves scratch on its setup, no error, holder untouched', (await page.locator('#sc-start').count()) === 1 && (await page.locator('.banner-fail').count()) === 0 && await page.evaluate(() => window.__ip.preempts === 0 && window.__ip.busy !== null));
  await page.click('#sc-start');
  await page.waitForSelector('dialog.capture-busy[open]');
  await page.click('dialog.capture-busy [data-action="stop"]');
  await page.waitForFunction(() => window.__ip.starts.length === 2);
  check('capture-busy: "Stop and continue" stops the holder and starts the baseline on the chosen pair', await page.evaluate(() => window.__ip.preempts === 1 && JSON.stringify(window.__ip.starts[1].pairs) === '[3]'));
  await page.click('#sc-cancel');
  await page.waitForSelector('#sc-start');

  // ----- another input has its own memory; the stereo interface has one pair -----
  await page.selectOption('#device-select', 'Focusrite USB (In 1/2)');
  check('pairs: a stereo interface shows a single pair and the box is disabled', (await opts('#sc-pair')).join() === '1-2' && await page.locator('#sc-pair').isDisabled());
  await page.selectOption('#device-select', 'Rane SEVENTY-TWO MKII');
  check('pairs: back on the Rane the remembered 3-4 returns', (await page.locator('#sc-pair option:checked').innerText()) === '3-4');

  // ----- wear map -----
  await go('vinylscan');
  await page.waitForSelector('#wm-start');
  await page.click('#wm-src-live');
  await page.waitForSelector('#wm-pair');
  check('pairs: wear map shows the deck input pair for live scans', (await page.locator('#wm-pair option:checked').innerText()) === '3-4' && (await opts('#wm-pair')).length === 4);

  // ----- latency -----
  await go('latency');
  await page.waitForSelector('#lat-pair');
  check('pairs: latency measure tab has an input pair box that follows its own input', (await opts('#lat-pair')).length >= 1);

  // ----- hum -----
  await go('hum');
  await page.waitForSelector('#hum-pair');
  await page.selectOption('#hum-input', 'Rane SEVENTY-TWO MKII');
  check('pairs: hum hunter offers the pairs of the chosen input', (await opts('#hum-pair')).length === 4);

  // ----- Quick Check live capture + calibration -----
  await go('quick');
  await page.click('#screen-quick .source[data-source="live"]');
  const next = page.locator('#screen-quick button:has-text("Continue")');
  if (await next.count()) await next.first().click();
  await page.waitForSelector('#screen-quick select[id$="-pair"]', { timeout: 8000 });
  check('pairs: Quick Check capture panel has the pair box', (await page.locator('#screen-quick select[id$="-pair"] option').count()) === 4);
  await go('calibration');
  await page.waitForSelector('#cal-pair');
  check('pairs: calibration has a loopback input pair box', (await opts('#cal-pair')).length === 4);

  // ----- layout -----
  await go('scratch');
  await setViewport(page, { width: 420, height: 900 });
  check('pairs: no horizontal scroll at phone width with the pair box', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await ctx.close();
  return errors;
}
