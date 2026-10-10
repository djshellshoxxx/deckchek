// FS-14 smoke: Scratch stress test. Flag off = hidden; browser preview = disabled with the desktop-app message;
// desktop (mocked capture + store) = safety/setup, baseline refusal and pass, guided run with metronome mute (M) and
// silent Esc abort (AC-7), partial result labelled, full result with uncalibrated skip labels, history, compare.
// The page clock is faked (page.clock) so the 90 s protocol runs in seconds; AudioParam ramps are spied on.
import { watchConsole, tauriMock, a11yAudit } from './core.mjs';

const FLAG_ON = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { scratchTest: true } })); };

// Desktop: tauriMock plus scratch_* in memory and a synthetic quadrature capture whose length follows the (fake) clock.
function scratchMock() {
  const runs = [], calls = [];
  window.__scratchCalls = calls; window.__ramps = [];
  const core = window.__TAURI__.core, base = core.invoke;
  let started = 0, stops = 0;
  const sr = 24000;
  const synth = (secs, { dead = false, still = false } = {}) => {
    const n = Math.floor(secs * sr), L = new Float32Array(n), R = new Float32Array(n), bpm = window.__scratchBpm || 120, beat = 60 / bpm, lead = .6;
    let phi = 0, seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - .5;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let v = 1;
      if (!still) for (let p = 0; p < 3; p++) { const a = lead + 2 * 0 + (p * 27) + 4 * beat; if (t >= a && t < a + 20) v = 1.8 * Math.sin(2 * Math.PI * (t - a) / beat); }
      L[i] = .4 * Math.sin(phi) + .002 * rnd(); R[i] = dead ? 0 : .4 * Math.sin(phi + Math.PI / 2) + .002 * rnd();
      phi += 2 * Math.PI * 1000 * v / sr;
    }
    return { left: L, right: R };
  };
  core.invoke = async (cmd, args) => {
    if (cmd === 'start_live_capture') { started = performance.now(); return base(cmd, args); }
    if (cmd === 'stop_live_capture') {
      await base(cmd, args);
      const secs = Math.max(1, (performance.now() - started) / 1000), i = stops++;
      const baseline = secs < 5, dead = baseline && window.__deadNext === true;
      if (dead) window.__deadNext = false;
      const sig = synth(secs, { dead, still: baseline });
      return { payload: { deviceName: 'Focusrite USB (In 1/2)', sampleRate: sr, channels: 2, left: sig.left, right: sig.right, streamErrors: [] }, quality: {} };
    }
    if (!cmd.startsWith('scratch_')) return base(cmd, args);
    calls.push(cmd);
    if (cmd === 'scratch_save') { const r = { ...args.run, id: `r${runs.length + 1}`, createdAt: new Date(Date.UTC(2026, 9, 10, 12, runs.length)).toISOString(), completed: args.run.completed !== false, events: args.run.events || [] }; runs.unshift(r); const { events, ...s } = r; return { ...s, eventCount: events.length }; }
    if (cmd === 'scratch_list') return runs.filter(r => args.filter?.protocolVersion == null || r.protocolVersion === args.filter.protocolVersion).map(({ events, ...s }) => ({ ...s, eventCount: events.length }));
    if (cmd === 'scratch_get') { const r = runs.find(x => x.id === args.id); if (!r) return null; const { events, ...s } = r; return { run: { ...s, eventCount: events.length }, events: events.map((e, i) => ({ id: `${r.id}-${i}`, runId: r.id, detail: {}, ...e })) }; }
    if (cmd === 'scratch_delete') { const k = runs.findIndex(x => x.id === args.id); if (k >= 0) runs.splice(k, 1); return k >= 0; }
    throw `unknown command ${cmd}`;
  };
  // spy on gain ramps: how far ahead of the audio clock does the metronome go silent?
  const Ctx = window.AudioContext;
  window.AudioContext = class extends Ctx { constructor(...a) { super(...a); window.__ctx = this; } };
  const orig = AudioParam.prototype.linearRampToValueAtTime;
  AudioParam.prototype.linearRampToValueAtTime = function (v, t) { window.__ramps.push({ v, ahead: t - (window.__ctx?.currentTime ?? 0) }); return orig.call(this, v, t); };
}

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  const shot = async (page, name) => { await page.waitForTimeout(200); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const theme = async (page, t) => { await page.evaluate(x => { document.documentElement.dataset.theme = x; }, t); };

  // ---- flag off ----
  const offCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const off = await offCtx.newPage();
  errors.push(...watchConsole(off, 'scratch-off'));
  await off.goto(base); await off.waitForSelector('.rail-item');
  check('scratch: flag off hides the rail entry', (await off.locator('.rail-item[data-screen="scratch"]').count()) === 0);
  await offCtx.close();

  // ---- browser preview (no live capture) ----
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await bctx.addInitScript(FLAG_ON);
  const bp = await bctx.newPage();
  errors.push(...watchConsole(bp, 'scratch-browser'));
  await bp.goto(base); await bp.waitForSelector('.rail-item[data-screen="scratch"]');
  await bp.click('.rail-item[data-screen="scratch"]');
  await bp.waitForSelector('#screen-scratch:not([hidden]) #sc-start');
  const setupText = await bp.locator('#screen-scratch').innerText();
  check('scratch: safety copy names the spare control vinyl', /Use a spare control vinyl, not your best one\.\s+Heavy scratching wears the groove\./.test(setupText));
  check('scratch: skip thresholds labelled uncalibrated in setup', /Uncalibrated/.test(setupText) && /untested default thresholds/.test(setupText));
  check('scratch: browser preview disables the test with the desktop-app message', (await bp.locator('#sc-start').isDisabled()) && /Live capture needs the desktop app/.test(setupText));
  await bp.click('#sc-tab-history');
  await bp.waitForSelector('#sc-panel .empty');
  check('scratch: empty history state', /No scratch runs yet/.test(await bp.locator('#sc-panel').innerText()));
  await bp.click('#sc-tab-compare');
  await bp.waitForSelector('#sc-panel .empty');
  check('scratch: empty compare state', /Not enough runs to compare/.test(await bp.locator('#sc-panel').innerText()));
  await bp.click('#sc-tab-test');
  const audit = await a11yAudit(bp);
  check('scratch: setup has no unnamed or tiny controls', audit.unnamed.length === 0 && audit.small.length === 0, JSON.stringify(audit).slice(0, 200));
  await shot(bp, 'scratch-setup-browser-dark');
  await bctx.close();

  // ---- desktop (mocked capture, fake page clock) ----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await ctx.addInitScript(FLAG_ON);
  await ctx.addInitScript(tauriMock);
  const page = await ctx.newPage();
  errors.push(...watchConsole(page, 'scratch'));
  await page.clock.install();
  await page.goto(base);
  await page.waitForSelector('.rail-item[data-screen="scratch"]');
  await page.evaluate(scratchMock);
  await page.evaluate(async () => {
    const inv = window.__TAURI__.core.invoke;
    await inv('catalog_upsert', { entity: 'product', record: { id: 'p-cart', model: 'Concorde Club', category: 'cartridge' } });
    await inv('catalog_upsert', { entity: 'asset', record: { id: 'a-cart1', productId: 'p-cart', nickname: 'Deck 1 Club' } });
    await inv('catalog_upsert', { entity: 'asset', record: { id: 'a-cart2', productId: 'p-cart', nickname: 'Deck 2 Club' } });
    window.__scratchBpm = 120;
  });
  const runFor = ms => page.clock.runFor(ms);
  const wait = async (sel, label) => { try { await page.waitForSelector(sel, { timeout: 8000 }); } catch (e) { console.log(`WAIT FAILED ${label || sel}: ${(await page.locator('#sc-panel').innerText()).slice(0, 300)}`); throw e; } };
  const until = async (selector, { step = 1000, max = 140 } = {}) => {
    for (let i = 0; i < max; i++) { if (await page.locator(selector).count()) return true; await runFor(step); await page.waitForTimeout(20); }
    return false;
  };

  await page.click('.rail-item[data-screen="scratch"]');
  await page.waitForSelector('#sc-start:not([disabled])');
  check('scratch: desktop setup offers the cartridges from Equipment', (await page.locator('#sc-cart option').count()) === 3);
  await page.selectOption('#sc-cart', 'a-cart1');
  await page.fill('#sc-bpm', '120'); await page.fill('#sc-force', '2.5');
  await page.click('#sc-start');
  check('scratch: starting without the volume confirmation is refused', /Confirm the headphone and monitor volume is low/.test(await page.locator('#sc-problems').innerText()) && (await page.locator('#sc-bl-h').count()) === 0);
  await shot(page, 'scratch-setup-desktop-dark');
  await page.check('#sc-vol');

  // baseline refusal (AC-8): dead channel
  await page.click('#sc-start');
  await page.waitForSelector('#sc-bl-h');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#sc-start');
  check('scratch: Esc during the baseline returns to setup', true);
  await page.evaluate(() => { window.__deadNext = true; });
  await page.click('#sc-start');
  await page.waitForSelector('#sc-bl-h');
  await runFor(3600);
  await page.waitForSelector('.banner-fail h2');
  const failText = await page.locator('#sc-panel').innerText();
  check('scratch: weak baseline refuses to start and shows fix actions', /baseline check failed/.test(failText) && /What to try/.test(failText) && (await page.locator('.scratch-fix li').count()) >= 1, failText.slice(0, 160));
  await shot(page, 'scratch-baseline-failed-dark');
  await page.click('#sc-retry');
  await page.waitForSelector('#sc-bl-h');
  await runFor(3600);
  await page.waitForSelector('#sc-begin');
  check('scratch: clean baseline unlocks the guided patterns', /Baseline OK/.test(await page.locator('#sc-panel').innerText()));

  // guided run: first pattern, mute, abort
  await page.click('#sc-begin');
  await page.waitForSelector('#sc-run-h');
  await runFor(700);
  check('scratch: count-in starts with the metronome on', /Count-in/.test(await page.locator('#sc-phase').innerText()) && (await page.getAttribute('.scratch-run', 'data-metronome')) === 'on');
  await runFor(2200);
  const live = await page.evaluate(() => ({ name: document.querySelector('#sc-run-h').textContent, phase: document.querySelector('#sc-phase').textContent, beats: document.querySelectorAll('#sc-beats li').length, on: document.querySelectorAll('#sc-beats li.on').length, diagram: !!document.querySelector('.scratch-diagram'), step: document.querySelector('#sc-run-step').textContent }));
  check('scratch: guided view shows pattern, phase, beat grid and diagram', live.name === 'Baby scratch' && /Perform now/.test(live.phase) && live.beats === 4 && live.on === 1 && live.diagram && /Pattern 1 of 3/.test(live.step), JSON.stringify(live));
  await shot(page, 'scratch-run-dark');
  await theme(page, 'light'); await shot(page, 'scratch-run-light'); await theme(page, 'dark');
  await page.keyboard.press('m');
  check('scratch: M mutes the click', (await page.getAttribute('.scratch-run', 'data-metronome')) === 'muted' && /muted/.test(await page.locator('#sc-metro').innerText()));
  await page.keyboard.press('m');
  check('scratch: M again turns the click back on', (await page.getAttribute('.scratch-run', 'data-metronome')) === 'on');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await runFor(300);
  check('scratch: reduced motion hides the moving playhead but keeps the beat highlight', (await page.locator('#sc-playhead').isHidden()) && (await page.locator('#sc-beats li.on').count()) === 1);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await runFor(26000); // finish pattern 1 and rest, enter pattern 2 count-in
  await page.evaluate(() => { window.__ramps.length = 0; });
  await page.keyboard.press('Escape');
  const silence = await page.evaluate(() => ({ ramps: window.__ramps.slice(), state: document.querySelector('.scratch-run')?.dataset.metronome }));
  check('scratch: Esc ramps the metronome gain to silence within 100 ms and shows it stopped (AC-7)', silence.ramps.some(r => r.v === 0 && r.ahead <= 0.1) && silence.state === 'stopped', JSON.stringify(silence));
  check('scratch: abort calls finish immediately (analysing state)', /Aborted\. Click silenced\./.test(await page.locator('#sc-panel').innerText()));
  check('scratch: partial result appears', await until('#sc-result .verdict', { step: 200, max: 40 }));
  const partial = await page.locator('#sc-result').innerText();
  
  check('scratch: aborted run is scored from completed patterns and labelled partial', /Partial run/.test(partial) && /Run aborted: scored from the completed patterns only/.test(partial) && (await page.locator('.scratch-patterns tbody tr', { hasText: 'Not completed' }).count()) === 2, partial.slice(0, 200));
  check('scratch: partial run is saved', /Saved to History/.test(await page.locator('#sc-saved').innerText()));

  // full run
  await page.click('#sc-again');
  await wait('#sc-start');
  await page.click('#sc-start');
  await wait('#sc-bl-h');
  await runFor(3600);
  await wait('#sc-begin');
  await page.keyboard.press('Enter');
  await wait('#sc-run-h');
  check('scratch: guided run finishes and shows a result', await until('#sc-result .verdict', { step: 1000, max: 160 }));
  const full = await page.locator('#sc-result').innerText();
  check('scratch: full result has a numeric score, three pattern rows and no partial label', /Scratch tracking score \d+ \/ 100/.test(full) && (await page.locator('.scratch-patterns tbody tr').count()) === 3 && !/Partial run/.test(full), full.slice(0, 160));
  check('scratch: result shows components, the velocity timeline and an event table alternative', (await page.locator('#sc-comp-h').count()) === 1 && (await page.locator('.scratch-timeline').count()) === 1 && (await page.locator('.scratch-vel').count()) === 1 && (await page.locator('.scratch-events table').count()) === 1);
  check('scratch: skip rows carry the uncalibrated label', (await page.locator('#sc-result .scratch-uncal').count()) >= 2);
  const ra = await a11yAudit(page);
  check('scratch: result view has no unnamed or tiny controls', ra.unnamed.length === 0 && ra.small.length === 0, JSON.stringify(ra).slice(0, 200));
  await shot(page, 'scratch-results-dark');
  await page.locator('.scratch-timeline').scrollIntoViewIfNeeded(); await shot(page, 'scratch-timeline-dark');
  await theme(page, 'light'); await shot(page, 'scratch-results-light'); await theme(page, 'dark');

  // history and compare
  await page.click('#sc-tab-history');
  await page.waitForSelector('.scratch-history tbody tr');
  check('scratch: history lists both runs with cartridge, score and partial label', (await page.locator('.scratch-history tbody tr').count()) === 2 && /Deck 1 Club/.test(await page.locator('.scratch-history').innerText()) && /Partial/.test(await page.locator('.scratch-history').innerText()));
  await shot(page, 'scratch-history-dark');
  await page.click('.scratch-history [data-open]');
  await page.waitForSelector('#sc-result .verdict');
  check('scratch: opening a stored run shows its components and events', (await page.locator('#sc-comp-h').count()) === 1 && (await page.locator('.scratch-timeline').count()) === 1);
  await page.click('#sc-back');
  await page.waitForSelector('.scratch-history tbody tr');
  await page.evaluate(async () => {
    const inv = window.__TAURI__.core.invoke;
    const rec = (asset, score) => inv('scratch_save', { run: { cartridgeAssetId: asset, format: 'Serato CV02.5', bpm: 120, protocolVersion: 1, completed: true, score, components: {}, lockLosses: 1, skips: 0, events: [] } });
    await rec('a-cart2', 71); await rec('a-cart2', 73); await rec('a-cart1', 84);
  });
  await page.click('#sc-tab-compare');
  await page.waitForSelector('#sc-cmp-h');
  const cmp = await page.locator('#sc-panel').innerText();
  check('scratch: compare shows mean, spread and the noise verdict', /mean score/i.test(cmp) && /B minus A/.test(cmp) && /within run-to-run noise|larger than run-to-run noise|at least two repeats/.test(cmp), cmp.slice(0, 200));
  await shot(page, 'scratch-compare-dark');

  // delete
  await page.click('#sc-tab-history');
  await page.waitForSelector('.scratch-history tbody tr');
  const before = await page.locator('.scratch-history tbody tr').count();
  await page.locator('.scratch-history [data-del]').first().click();
  await page.click('#confirm-ok');
  await page.waitForFunction(n => document.querySelectorAll('.scratch-history tbody tr').length === n - 1, before);
  check('scratch: delete removes a run after confirmation', true);

  await ctx.close();
  return errors;
}
