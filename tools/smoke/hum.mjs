// FS-15 smoke: Hum hunter and booth feedback test. Flag off = hidden; browser mode = needs the desktop app;
// desktop mode with a mocked 48 kHz stream capture, native audio output and hum_run_* store covers the guided hum
// flow (live meter, 5 s steps, deltas, ranked causes, save), the feedback safety UI (checklist gate, STOP first tab
// stop, Esc/Space, level/cap readouts, automatic howl abort, output stop on navigation and window close) and both themes.
import { watchConsole, tauriMock } from './core.mjs';

const FLAGS_ON = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { humHunter: true, feedbackStep: true } })); };
const HUM_ONLY = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { humHunter: true } })); };

function humMock() {
  const core = window.__TAURI__.core; const base = core.invoke;
  const FS = 48000, BLOCK = 24000;
  // signal model, edited by the test through window.__sig
  const sig = window.__sig = { hum: 0.0003, harmonics: [1, .5, .3], mains: 50, noise: 1e-4, clip: false, silent: false, howl: false, howlHz: 63 };
  const aud = window.__aud = { calls: [], active: new Set(), levels: [], stops: [], specs: [] };
  const runs = window.__runs = [];
  let n = 0, nextHandle = 1, stream = null;
  class Channel { constructor() { this.onmessage = () => {}; } }
  core.Channel = Channel;
  const encode = (seq, frames, final, left) => {
    const buf = new ArrayBuffer(48 + frames * 8), v = new DataView(buf);
    [0x44, 0x43, 0x53, 0x42].forEach((b, i) => v.setUint8(i, b));
    v.setUint16(4, 1, true); v.setUint16(6, final ? 1 : 0, true); v.setUint32(8, seq, true); v.setUint32(12, FS, true); v.setUint32(16, frames, true);
    v.setFloat64(40, (seq + 1) * frames, true);
    for (let i = 0; i < frames; i++) { v.setFloat32(48 + i * 4, left[i], true); v.setFloat32(48 + frames * 4 + i * 4, left[i], true); }
    return buf;
  };
  const makeBlock = () => {
    const out = new Float32Array(BLOCK);
    for (let i = 0; i < BLOCK; i++, n++) {
      let x = (Math.random() - .5) * 2 * sig.noise;
      if (!sig.silent) {
        sig.harmonics.forEach((a, k) => { x += sig.hum * a * Math.sin(2 * Math.PI * sig.mains * (k + 1) * n / FS); });
        if (sig.howl) { sig.t0 ??= n; x += Math.min(.8, .002 * 2.6 ** ((n - sig.t0) / FS)) * Math.sin(2 * Math.PI * sig.howlHz * n / FS); }
      }
      out[i] = sig.clip ? Math.max(-1, Math.min(1, x * 400)) : x;
    }
    return out;
  };
  const end = () => {
    if (!stream) return null;
    clearInterval(stream.timer);
    stream.channel.onmessage(encode(stream.seq++, 0, true, new Float32Array(0)));
    const s = stream; stream = null;
    return { streamId: s.id, ended: 'stopped', blocksSent: s.seq, lastSeq: s.seq - 1, droppedBlocks: 0, framesCaptured: 0, overrunSamples: 0, streamErrors: 0, streamErrorMessages: [] };
  };
  window.__endStream = end;
  window.__stopFeed = () => { if (stream) clearInterval(stream.timer); };
  core.invoke = async (cmd, args = {}) => {
    aud.calls.push(cmd);
    switch (cmd) {
      case 'catalog_list': { const rows = await base(cmd, args); return args.entity === 'venue' ? [{ id: 'v-neon', name: 'Club Neon' }, ...rows] : rows; }
      case 'start_stream_capture':
        if (stream) throw { code: 'CAPTURE_BUSY', message: 'busy', holder: 'x' };
        stream = { id: 1, channel: args.channel, seq: 0 };
        stream.timer = setInterval(() => { if (stream) stream.channel.onmessage(encode(stream.seq++, BLOCK, false, makeBlock())); }, 100);
        return { streamId: 1, holder: args.holder, deviceName: 'Focusrite USB (In 1/2)', sampleRate: FS, channels: 2, blockMs: 500, blockFrames: BLOCK };
      case 'stream_capture_ack': return null;
      case 'stop_stream_capture': { const s = end(); if (!s) throw 'No stream capture is running.'; return s; }
      case 'list_native_audio_outputs': return window.__noOutputs ? [] : [{ name: 'Focusrite USB (Out 3/4)', isDefault: true, sampleRate: 48000, channels: 2 }];
      case 'audio_play_tone': { const h = nextHandle++; aud.active.add(h); aud.specs.push(args.spec); aud.levels.push(args.spec.levelDbfs); return { handle: h, sampleRate: 48000, channels: 2, deviceName: 'mock' }; }
      case 'audio_set_level': aud.levels.push(args.levelDbfs); return { levelDbfs: args.levelDbfs, clamped: false };
      case 'audio_stop': aud.active.delete(args.handle); aud.stops.push(performance.now()); return null;
      case 'audio_stop_all': aud.active.clear(); aud.stops.push(performance.now()); return 0;
      case 'audio_out_status': return { absMaxDbfs: -12, disabled: false, active: null, recent: [] };
      case 'hum_run_save': { const run = { id: `hr-${runs.length + 1}`, createdAt: new Date().toISOString(), ...args.input, steps: args.input.steps.map((s, i) => ({ idx: i, ...s })) }; runs.push(run); return run; }
      case 'hum_run_list': return runs.map(({ steps, causes, ...r }) => ({ ...r, stepCount: steps.length, onset: steps.some(s => s.onset) })).reverse();
      case 'hum_run_get': return runs.find(r => r.id === args.id) ?? null;
      case 'hum_run_delete': { const i = runs.findIndex(r => r.id === args.id); if (i >= 0) runs.splice(i, 1); return i >= 0; }
      default: return base(cmd, args);
    }
  };
}

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  const shot = async (page, name) => { await page.waitForTimeout(250); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const theme = (page, t) => page.evaluate(x => { document.documentElement.dataset.theme = x; }, t);

  // ----- flag off -----
  const off = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const po = await off.newPage();
  errors.push(...watchConsole(po, 'hum-off'));
  await po.goto(base); await po.waitForSelector('.rail-item');
  check('hum: flag off hides the Hum screen', (await po.locator('.rail-item[data-screen="hum"]').count()) === 0);
  await off.close();

  // ----- browser mode -----
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await bctx.addInitScript(FLAGS_ON);
  const pb = await bctx.newPage();
  errors.push(...watchConsole(pb, 'hum-browser'));
  await pb.goto(base); await pb.waitForSelector('.rail-item[data-screen="hum"]');
  await pb.click('.rail-item[data-screen="hum"]');
  await pb.waitForSelector('#hum-unsupported');
  check('hum: browser mode says live measurement needs the desktop app and disables Start', /desktop app/i.test(await pb.locator('#hum-unsupported').innerText()) && await pb.locator('#hum-start').isDisabled());
  await pb.click('#hum-tab-feedback');
  await pb.waitForSelector('#fb-unsupported');
  check('feedback: browser mode disables the test with an explanation', /desktop app/i.test(await pb.locator('#fb-unsupported').innerText()));
  await pb.click('#hum-tab-runs');
  await pb.waitForSelector('#hum-runs-empty');
  check('hum: runs tab has an empty state', true);
  await bctx.close();

  // ----- desktop: feedback tab is separately flagged -----
  const hctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await hctx.addInitScript(tauriMock); await hctx.addInitScript(humMock); await hctx.addInitScript(HUM_ONLY);
  const ph = await hctx.newPage();
  errors.push(...watchConsole(ph, 'hum-only'));
  await ph.goto(base); await ph.waitForSelector('.rail-item[data-screen="hum"]');
  await ph.click('.rail-item[data-screen="hum"]'); await ph.waitForSelector('#hum-form');
  check('feedback: tab hidden while features.feedbackStep is off', (await ph.locator('#hum-tab-feedback').count()) === 0);
  await hctx.close();

  // ----- desktop: guided hum flow -----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(tauriMock); await ctx.addInitScript(humMock); await ctx.addInitScript(FLAGS_ON);
  const page = await ctx.newPage();
  errors.push(...watchConsole(page, 'hum'));
  await page.goto(base); await page.waitForSelector('.rail-item[data-screen="hum"]');
  await page.click('.rail-item[data-screen="hum"]');
  await page.waitForSelector('#hum-form');
  check('hum: setup shows the ground-lift safety note', /never lift, cut or tape over the mains safety earth/i.test(await page.locator('.hum-safe').innerText()));
  await shot(page, 'hum-setup-dark');
  await page.click('#hum-start');
  await page.waitForSelector('#hum-steps');
  await page.waitForSelector('#hum-live-total', { timeout: 8000 });
  check('hum: live meter shows hum above the floor and the 50 Hz family', /50 Hz family/.test(await page.locator('#hum-live-body').innerText()) && (await page.locator('.hum-harm dt').count()) >= 6);
  check('hum: step A is shown first with its instruction', /Unplug everything/.test(await page.locator('#hum-instruction').innerText()));

  const measure = async (amp, { key = 'Space' } = {}) => {
    await page.evaluate(a => { window.__sig.hum = a; }, amp);
    await page.waitForTimeout(1300);   // the 1 s live window now holds the new level
    await page.keyboard.press(key);
    await page.waitForSelector('#hum-next', { timeout: 15000 });
  };
  await measure(0.0003);                 // A: mixer alone, almost clean
  // A2 (gain down, optional extra check): skip with S
  await page.click('#hum-next');
  check('hum: probe step A2 is offered as an optional extra check', /extra check/i.test(await page.locator('.hum-step-head').innerText()));
  await page.keyboard.press('s');
  await page.waitForSelector('#hum-measure');
  check('hum: S skips a step and moves on', /Deck cables/.test(await page.locator('#hum-cur-h').innerText()));
  await measure(0.02);                   // B: deck cables, ground wire open -> loud hum
  check('hum: a rise of at least 6 dB says the connection introduces hum', /introduces hum/i.test(await page.locator('#hum-msg').innerText()));
  await shot(page, 'hum-steps-dark');
  await page.keyboard.press('Space');    // next
  await page.waitForSelector('#hum-measure');
  await measure(0.0015);                 // C: ground wire connected -> about 22 dB drop
  check('hum: a drop of at least 6 dB says the source is downstream of the connection', /downstream of this connection/i.test(await page.locator('#hum-msg').innerText()));
  check('hum: timeline row carries the delta in words and a number', /drop/i.test(await page.locator('.hum-tl-row').nth(3).innerText()) && /dB/.test(await page.locator('.hum-tl-row').nth(3).innerText()));
  await page.keyboard.press('Space');
  for (let i = 0; i < 4; i++) { await page.waitForSelector('#hum-skip'); await page.click('#hum-skip'); }   // D, E, F, G
  await page.waitForSelector('#hum-result');
  const verdictText = await page.locator('#hum-verdict').innerText();
  check('hum: verdict names the open turntable ground wire (spec copy)', /turntable ground wire was open/i.test(verdictText), verdictText);
  const causes = await page.locator('.hum-cause').count();
  check('hum: result ranks causes with confidence and a next action', causes >= 1 && /Try:/.test(await page.locator('.hum-cause').first().innerText()) && /%/.test(await page.locator('.hum-cause').first().innerText()));
  check('hum: skipped steps are noted as lowering certainty', /skipped/i.test(await page.locator('.hum-verdict').innerText()));
  await page.waitForFunction(() => document.querySelector('#hum-saved')?.textContent.includes('Saved'), null, { timeout: 5000 });
  check('hum: the run is saved once with kind hum', await page.evaluate(() => window.__runs.length === 1 && window.__runs[0].kind === 'hum' && window.__runs[0].steps.length >= 5));
  check('hum: input is released after the result', await page.evaluate(() => window.__aud.calls.includes('stop_stream_capture')));
  await shot(page, 'hum-result-dark');
  await theme(page, 'light'); await shot(page, 'hum-result-light');
  await theme(page, 'dark');

  // runs tab
  await page.click('#hum-tab-runs');
  await page.waitForSelector('.hum-run');
  check('runs: the saved hum run is listed with its verdict', /turntable ground wire was open/i.test(await page.locator('.hum-run').first().innerText()));
  await page.click('.hum-run-main');
  await page.waitForSelector('.hum-run-steps');
  check('runs: opening a run shows its steps', (await page.locator('.hum-run-steps tbody tr').count()) >= 5);

  // clipping and no-signal are explained and not recorded
  await page.click('#hum-tab-hum'); await page.waitForSelector('#hum-again'); await page.click('#hum-again');
  await page.waitForSelector('#hum-start'); await page.click('#hum-start'); await page.waitForSelector('#hum-measure');
  await page.evaluate(() => { window.__sig.clip = true; window.__sig.hum = .02; });
  await page.waitForTimeout(500); await page.keyboard.press('Space');
  await page.waitForSelector('#hum-msg', { timeout: 15000 });
  check('hum: clipping input is refused with advice', /clipping/i.test(await page.locator('#hum-msg').innerText()) && (await page.locator('#hum-next').count()) === 0);
  await page.evaluate(() => { window.__sig.clip = false; window.__sig.silent = true; window.__sig.noise = 0; });
  await page.waitForTimeout(500); await page.click('#hum-measure');
  await page.waitForFunction(() => /No input signal/.test(document.querySelector('#hum-msg')?.textContent || ''), null, { timeout: 15000 });
  check('hum: digital silence is explained and not recorded', true);
  // leaving the screen closes the input
  await page.evaluate(() => { window.__aud.calls.length = 0; });
  await page.click('.rail-item[data-screen="history"]');
  await page.waitForFunction(() => window.__aud.calls.includes('stop_stream_capture'));
  check('hum: navigating away closes the audio input', true);
  await page.evaluate(() => { window.__sig.silent = false; window.__sig.noise = 1e-4; });

  // ----- feedback test -----
  await page.click('.rail-item[data-screen="hum"]');
  await page.click('#hum-tab-feedback');
  await page.waitForSelector('#fb-form');
  check('feedback: safety banner is above the setup form', /never plays louder than -12 dBFS/.test(await page.locator('.fb-safety').innerText()));
  check('feedback: plan states start level, step and cap', /Starts at −60 dBFS.*3 dB.*never goes above −30 dBFS/.test(await page.locator('#fb-plan').innerText()), await page.locator('#fb-plan').innerText());
  check('feedback: Start is disabled until every safety box is ticked', await page.locator('#fb-start').isDisabled());
  const boxes = page.locator('.fb-check');
  await boxes.nth(0).check(); await boxes.nth(1).check();
  check('feedback: two of three boxes are not enough', await page.locator('#fb-start').isDisabled());
  await boxes.nth(2).check();
  check('feedback: all boxes enable Start', await page.locator('#fb-start').isEnabled());
  await page.fill('#fb-cap', '-6');
  check('feedback: a cap above the hard limit is lowered and says so', /lowered to the −12 dBFS hard limit/.test(await page.locator('#fb-plan').innerText()));
  await page.fill('#fb-cap', '-30');
  await shot(page, 'feedback-setup-dark');
  await theme(page, 'light'); await shot(page, 'feedback-setup-light'); await theme(page, 'dark');

  await page.click('#fb-start');
  await page.waitForSelector('#fb-run');
  await page.waitForFunction(() => document.querySelector('#fb-state')?.textContent.includes('Output playing'));
  check('feedback: first output level is -60 dBFS', await page.evaluate(() => window.__aud.levels[0] === -60) && /−60 dBFS/.test(await page.locator('#fb-level').innerText()));
  check('feedback: cap and hard limit are on screen while playing', /Cap −30 dBFS.*hard limit −12 dBFS/.test(await page.locator('#fb-capline').innerText()));
  check('feedback: STOP is the first focusable element of the run view', await page.evaluate(() => document.querySelector('#fb-run').querySelector('button,[href],input,select,[tabindex]:not([tabindex="-1"])').id === 'fb-stop'));
  check('feedback: STOP is at least 44 px tall', (await page.locator('#fb-stop').boundingBox()).height >= 44);
  check('feedback: raising is blocked until the room has settled', await page.locator('#fb-raise').isDisabled() && /available in/.test(await page.locator('#fb-dwell').innerText()));
  await page.waitForFunction(() => !document.querySelector('#fb-raise').disabled, null, { timeout: 8000 });
  await page.click('#fb-raise');
  await page.waitForFunction(() => /−57 dBFS/.test(document.querySelector('#fb-level').textContent));
  check('feedback: one confirmed step raises by exactly 3 dB', await page.evaluate(() => window.__aud.levels.at(-1) === -57));
  check('feedback: the level is never raised without a click', await page.evaluate(() => window.__aud.levels.length === 2));
  await page.waitForTimeout(1500);
  check('feedback: live input readout and canvas are present', /Strongest input peak/.test(await page.locator('#fb-peak').innerText()) && (await page.locator('#fb-canvas').count()) === 1);
  await shot(page, 'feedback-run-dark');
  await theme(page, 'light'); await shot(page, 'feedback-run-light'); await theme(page, 'dark');

  // Space stops at once, even though it is also the "next" key in the hum flow
  const t0 = Date.now();
  await page.keyboard.press('Space');
  await page.waitForSelector('#fb-result', { timeout: 5000 });
  check('feedback: Space stops the output', await page.evaluate(() => window.__aud.active.size === 0) && Date.now() - t0 < 2000);
  check('feedback: stop is confirmed in words', /Output is silent/.test(await page.locator('.fb-result .banner').innerText()) && /Stop confirmed in \d+ ms/.test(await page.locator('.fb-result .banner').innerText()));
  await page.waitForFunction(() => document.querySelector('#fb-saved')?.textContent.includes('Saved'), null, { timeout: 5000 });
  check('feedback: a stopped run with steps is saved as kind feedback', await page.evaluate(() => window.__runs.at(-1).kind === 'feedback' && window.__runs.at(-1).steps.every(s => s.levelDbfs <= -12)));

  // Esc stops too
  await page.click('#fb-again'); await page.waitForSelector('#fb-form');
  for (const i of [0, 1, 2]) await page.locator('.fb-check').nth(i).check();
  await page.click('#fb-start'); await page.waitForSelector('#fb-stop');
  await page.waitForFunction(() => window.__aud.active.size === 1);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#fb-result');
  check('feedback: Esc stops the output', await page.evaluate(() => window.__aud.active.size === 0));

  // automatic abort on howl
  await page.click('#fb-again'); await page.waitForSelector('#fb-form');
  for (const i of [0, 1, 2]) await page.locator('.fb-check').nth(i).check();
  await page.click('#fb-start'); await page.waitForSelector('#fb-stop');
  await page.waitForFunction(() => window.__aud.active.size === 1);
  await page.waitForFunction(() => !document.querySelector('#fb-raise').disabled, null, { timeout: 8000 });
  await page.click('#fb-raise');
  await page.evaluate(() => { window.__sig.hum = 0; window.__sig.howl = true; });
  await page.waitForSelector('#fb-result', { timeout: 20000 });
  const banner = await page.locator('.fb-result .banner').innerText();
  check('feedback: a howl stops the output automatically and says so', /Feedback detected: output stopped automatically/.test(banner) && /6\d(\.\d)? Hz/.test(banner), banner.replace(/\n/g, ' '));
  check('feedback: output is silent after the automatic abort', await page.evaluate(() => window.__aud.active.size === 0));
  check('feedback: result shows onset frequency, level, loop gain margin and guidance', /Feedback onset/i.test(await page.locator('.fb-facts').innerText()) && /Loop gain margin/i.test(await page.locator('.fb-facts').innerText()) && (await page.locator('.fb-guidance li').count()) >= 3);
  await shot(page, 'feedback-result-dark');
  await theme(page, 'light'); await shot(page, 'feedback-result-light'); await theme(page, 'dark');
  check('feedback: onset is saved on the run', await page.evaluate(() => window.__runs.at(-1).steps.some(s => s.onset)));
  await page.evaluate(() => { window.__sig.howl = false; window.__sig.t0 = undefined; });

  // clipping input aborts
  await page.click('#fb-again'); await page.waitForSelector('#fb-form');
  for (const i of [0, 1, 2]) await page.locator('.fb-check').nth(i).check();
  await page.click('#fb-start'); await page.waitForSelector('#fb-stop');
  await page.waitForFunction(() => window.__aud.active.size === 1);
  await page.evaluate(() => { window.__sig.clip = true; window.__sig.hum = .02; });
  await page.waitForSelector('#fb-result', { timeout: 10000 });
  check('feedback: clipping input mutes automatically with advice', /Input is clipping: output stopped automatically/.test(await page.locator('.fb-result .banner').innerText()) && await page.evaluate(() => window.__aud.active.size === 0));
  await page.evaluate(() => { window.__sig.clip = false; window.__sig.hum = 0; });

  // lost input: the feed stops, the watchdog mutes
  await page.click('#fb-again'); await page.waitForSelector('#fb-form');
  for (const i of [0, 1, 2]) await page.locator('.fb-check').nth(i).check();
  await page.click('#fb-start'); await page.waitForSelector('#fb-stop');
  await page.waitForFunction(() => window.__aud.active.size === 1);
  await page.evaluate(() => window.__stopFeed());
  await page.waitForSelector('#fb-result', { timeout: 10000 });
  check('feedback: no input for a second mutes automatically', /No input signal: output stopped automatically/.test(await page.locator('.fb-result .banner').innerText()) && await page.evaluate(() => window.__aud.active.size === 0));

  // navigation stops the output
  await page.click('#fb-again'); await page.waitForSelector('#fb-form');
  for (const i of [0, 1, 2]) await page.locator('.fb-check').nth(i).check();
  await page.click('#fb-start'); await page.waitForSelector('#fb-stop');
  await page.waitForFunction(() => window.__aud.active.size === 1);
  await page.click('.rail-item[data-screen="history"]');
  await page.waitForFunction(() => window.__aud.active.size === 0, null, { timeout: 3000 });
  check('feedback: leaving the screen stops the output', true);
  await page.click('.rail-item[data-screen="hum"]');
  await page.waitForSelector('#fb-form');
  check('feedback: returning shows a fresh setup, nothing playing', await page.evaluate(() => window.__aud.active.size === 0));

  // switching tab stops the output
  for (const i of [0, 1, 2]) await page.locator('.fb-check').nth(i).check();
  await page.click('#fb-start'); await page.waitForSelector('#fb-stop');
  await page.waitForFunction(() => window.__aud.active.size === 1);
  await page.click('#hum-tab-runs');
  await page.waitForFunction(() => window.__aud.active.size === 0, null, { timeout: 3000 });
  check('feedback: switching to another tab stops the output', true);

  // closing the window stops the output
  await page.click('#hum-tab-feedback'); await page.waitForSelector('#fb-form');
  for (const i of [0, 1, 2]) await page.locator('.fb-check').nth(i).check();
  await page.click('#fb-start'); await page.waitForSelector('#fb-stop');
  await page.waitForFunction(() => window.__aud.active.size === 1);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForFunction(() => window.__aud.active.size === 0, null, { timeout: 3000 });
  check('feedback: closing the window stops the output', true);

  // phone width
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(200);
  check('hum: no horizontal page scroll at phone width', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot(page, 'feedback-phone-dark');
  await ctx.close();

  // ----- no output device -----
  const nctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await nctx.addInitScript(tauriMock); await nctx.addInitScript(humMock); await nctx.addInitScript(FLAGS_ON);
  await nctx.addInitScript(() => { window.__noOutputs = true; });
  const pn = await nctx.newPage();
  errors.push(...watchConsole(pn, 'hum-nooutput'));
  await pn.goto(base); await pn.waitForSelector('.rail-item[data-screen="hum"]');
  await pn.click('.rail-item[data-screen="hum"]'); await pn.click('#hum-tab-feedback');
  await pn.waitForSelector('#fb-no-output');
  check('feedback: with no output device the test is disabled and hum still works', /hum hunter works with an input only/i.test(await pn.locator('#fb-no-output').innerText()));
  await nctx.close();
  return errors;
}
