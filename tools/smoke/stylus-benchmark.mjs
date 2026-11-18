// FS-12 through the real cached screen, capture adapter and History persistence.
// Only native IPC is injected. Generated input establishes software behavior,
// not physical cartridge/interface repeatability or an archive of raw samples.
import { watchConsole, tauriMock } from './core.mjs';
import { stylusMock } from './stylus.mjs';

function guidedCaptureMock() {
  const core = window.__TAURI__.core, base = core.invoke, originalListen = window.__TAURI__.event.listen;
  const listeners = new Map();
  const state = window.__guided = { stage: 'tone', fault: false, deferStart: false, releaseStart: null,
    starts: [], stops: [], outputCalls: [], lease: 0, running: false, elapsed: 0 };
  const sampleRate = 22050, pair = { label: '1-2', first: 1, second: 2, mono: false };
  window.__TAURI__.event.listen = async (name, callback) => {
    if (name !== 'capture-levels' && name !== 'capture-preempted') return originalListen(name, callback);
    const set = listeners.get(name) || new Set(); set.add(callback); listeners.set(name, set); return () => set.delete(callback);
  };
  state.advance = seconds => {
    state.elapsed = seconds;
    for (const callback of listeners.get('capture-levels') || []) callback({ payload: { elapsedSec: seconds, overrunSamples: state.fault ? 8 : 0, peakL: .25, peakR: .25, rmsL: .17, rmsR: .17, clipL: false, clipR: false } });
  };
  core.invoke = async (command, args = {}) => {
    if (['audio_play_tone', 'audio_play_buffer'].includes(command) || /audio_out_|play_audio|start_audio_output/.test(command)) state.outputCalls.push(command);
    if (command === 'catalog_list' && args.entity === 'setup') return [
      { id: 'guided-setup', name: 'Guided cartridge setup', components: [{ assetId: 'a-conc', role: 'cartridge' }] },
      { id: 'unrelated-setup', name: 'Other cartridge', components: [{ assetId: 'other', role: 'cartridge' }] },
    ];
    if (command === 'list_native_audio_inputs') return [{ name: 'Guided input', isDefault: true, maxChannels: 2, defaultChannels: 2, pairs: [pair] }];
    if (command === 'start_live_capture') {
      if (state.running) throw new Error('The input is already held.');
      state.running = true; state.elapsed = 0; state.lease++;
      state.starts.push({ ...args, leaseId: state.lease });
      const info = { deviceName: 'Guided input', sampleRate, channels: 2, pairs: [pair], maxSeconds: args.maxSeconds, leaseId: state.lease };
      if (state.deferStart) return new Promise(resolve => { state.releaseStart = () => { state.deferStart = false; resolve(info); }; });
      return info;
    }
    if (command === 'live_capture_status') return { running: state.running, elapsedSec: state.elapsed };
    if (command === 'stop_live_capture') {
      if (args.leaseId !== state.lease) throw new Error('Wrong capture lease.');
      state.stops.push(args.leaseId); state.running = false;
      const left = [], right = [], n = sampleRate * 10;
      for (let i = 0; i < n; i++) {
        const phase = 2 * Math.PI * 1000 * i / sampleRate, tone = .25 * Math.sin(phase);
        left.push(state.stage === 'right' ? tone / 100 : tone + (state.stage === 'tone' ? .0005 * Math.sin(phase * 3) : 0));
        right.push(state.stage === 'left' ? tone / 10 : tone + (state.stage === 'tone' ? .00075 * Math.sin(phase * 3) : 0));
      }
      const messages = state.fault ? ['Injected input loss'] : [];
      return { payload: { left, right, sampleRate, channels: 2, pairs: [pair], deviceName: 'Guided input', streamErrors: messages },
        quality: { framesCaptured: n, overrunSamples: state.fault ? 8 : 0, clippedSamplesL: 0, clippedSamplesR: 0, streamErrors: state.fault ? 1 : 0,
          streamErrorMessages: messages, truncated: false, callbackCount: 500, maxCallbackGapMs: 10 } };
    }
    if (command === 'stylus_benchmark_save') {
      const value = args.result, ranges = { thdPercent: [0, 1000], separationDb: [-60, 140], tcSnrDb: [-60, 140], tcPhaseErrorDeg: [0, 360], tcDropouts: [0, 1000000] };
      if (new TextEncoder().encode(JSON.stringify(value.detail)).byteLength > 65536) throw new Error('detail is limited to 65536 bytes');
      if (!Object.keys(ranges).some(key => Number.isFinite(value[key]))) throw new Error('benchmark has no metrics');
      for (const [key, [lo, hi]] of Object.entries(ranges)) if (value[key] != null && (!Number.isFinite(value[key]) || value[key] < lo || value[key] > hi)) throw new Error(`${key} is outside the native storage range`);
    }
    return base(command, args);
  };
}

export default async function run({ browser, base, check, SHOTS }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(tauriMock); await context.addInitScript(stylusMock); await context.addInitScript(guidedCaptureMock);
  await context.addInitScript(() => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ deviceName: 'Guided input', features: { stylusWear: true } })); });
  const page = await context.newPage(), errors = watchConsole(page, 'stylus-benchmark');
  try {
    await page.goto(base); await page.waitForSelector('.rail-item[data-screen="stylus"]'); await page.click('.rail-item[data-screen="stylus"]');
    await page.waitForSelector('#sty-summary'); await page.keyboard.press('b'); await page.waitForSelector('#sty-guided-config');
    check('stylus guided: B opens preparation and focuses the record without opening input', await page.evaluate(() => document.activeElement?.id === 'sty-guided-record' && window.__guided.starts.length === 0));
    const prepare = async () => {
      await page.waitForSelector('#sty-guided-config');
      await page.waitForSelector('#sty-guided-setup option[value="guided-setup"]', { state: 'attached' });
      for (const [id, value] of Object.entries({ record: 'Reference record', side: 'A tracks 1–3', force: '3', vta: 'Arm height 2 mm', chain: 'Phono stage > Guided input; gain 0 dB; room 20 C' })) await page.fill(`#sty-guided-${id}`, value);
      await page.selectOption('#sty-guided-setup', 'guided-setup'); await page.check('#sty-guided-same');
      await page.click('#sty-guided-start'); await page.waitForSelector('#sty-guided-record-step');
    };
    check('stylus guided: saved setup options contain the original cartridge only', await page.locator('#sty-guided-setup option[value="unrelated-setup"]').count() === 0);
    await prepare();
    check('stylus guided: preparation focuses the first bounded capture', await page.evaluate(() => document.activeElement?.id === 'sty-guided-record-step' && /Step 1 of 3/.test(document.querySelector('#sty-guided-status').textContent)));

    await page.evaluate(() => { window.__guided.deferStart = true; }); await page.click('#sty-guided-record-step');
    await page.waitForFunction(() => typeof window.__guided.releaseStart === 'function'); await page.keyboard.press('Escape');
    await page.evaluate(() => window.__guided.releaseStart()); await page.waitForFunction(() => window.__guided.stops.length === 1);
    check('stylus guided: Escape releases a late native lease once without saving', await page.evaluate(() => window.__guided.stops[0] === window.__guided.starts[0].leaseId && window.__sty.bench.length === 0 && window.__mockDb.runs.length === 0 && document.activeElement?.id === 'sty-guided-again'));

    await page.click('#sty-guided-again'); await prepare(); await page.click('#sty-guided-record-step'); await page.waitForSelector('#sty-guided-progress');
    await page.click('#sty-tab-overview'); await page.waitForFunction(() => window.__guided.stops.length === 2);
    check('stylus guided: changing the actual screen tab releases its capture without a partial save', await page.evaluate(() => !window.__guided.running && window.__mockDb.runs.length === 0 && window.__sty.bench.length === 0));
    await page.click('#sty-tab-benchmark'); await prepare();

    const captureAll = async () => {
      for (const [index, stage] of ['tone', 'left', 'right'].entries()) {
        await page.evaluate(value => { window.__guided.stage = value; }, stage); await page.click('#sty-guided-record-step');
        await page.waitForSelector('#sty-guided-progress');
        await page.evaluate(() => { window.__guided.cancelNode = document.querySelector('#sty-guided-cancel'); window.__guided.advance(1); });
        await page.waitForFunction(() => Number(document.querySelector('#sty-guided-progress')?.value) >= 1);
        if (index === 0) check('stylus guided: native elapsed updates preserve the focused Cancel element', await page.evaluate(() => document.activeElement === window.__guided.cancelNode && document.querySelector('#sty-guided-cancel') === window.__guided.cancelNode));
        await page.evaluate(() => window.__guided.advance(10));
        await page.waitForSelector(index < 2 ? '#sty-guided-record-step' : '#sty-guided-save');
      }
    };
    await page.fill('#sty-b-thd', '9.1'); await captureAll();
    check('stylus guided: production values reach review while manual entry and explicit save remain intact', await page.evaluate(() => {
      const values = [...document.querySelectorAll('#sty-guided dd')].map(node => node.textContent);
      return values.includes('0.25 %') && values.includes('20 dB') && document.querySelector('#sty-b-thd').value === '9.1' && window.__mockDb.runs.length === 3 && window.__sty.bench.length === 0 && document.activeElement?.id === 'sty-guided-save';
    }));
    await page.screenshot({ path: `${SHOTS}/stylus-guided-review-dark.png` }); await page.click('#sty-guided-save');
    await page.waitForFunction(() => window.__sty.bench.length === 1);
    check('stylus guided: explicit benchmark save preserves native observations and original run/setup links', await page.evaluate(() => {
      const row = window.__sty.bench[0];
      return row.valid && row.assetId === 'a-conc' && row.setupId === 'guided-setup' && row.tcSnrDb === undefined && row.detail.steps.length === 3 &&
        row.detail.steps.every(step => step.captureInfo.deviceName === 'Guided input' && step.context.sampleRate === 22050 && step.context.calibrationObservation.state === 'uncalibrated' && step.quality.framesCaptured === 220500 && window.__mockDb.runs.some(run => run.id === step.runId && run.assetId === row.assetId && run.setupId === row.setupId)) &&
        window.__guided.starts.every(start => start.maxSeconds === 15) && window.__guided.outputCalls.length === 0 && new Set(window.__guided.stops).size === window.__guided.stops.length;
    }));

    await prepare(); await page.evaluate(() => { window.__guided.fault = true; }); await captureAll();
    check('stylus guided: raw fault evidence makes the save explicitly excluded', await page.evaluate(() => /Save excluded benchmark/.test(document.querySelector('#sty-guided-save').textContent) && /dropped samples/.test(document.querySelector('#sty-guided').textContent)));
    await page.setViewportSize({ width: 720, height: 1000 }); await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.locator('#sty-guided').screenshot({ path: `${SHOTS}/stylus-guided-review-light.png` });
    check('stylus guided: narrow review retains labelled actions inside the viewport', await page.evaluate(() => {
      const panel = document.querySelector('#sty-guided'); return panel.getBoundingClientRect().width <= innerWidth && [...panel.querySelectorAll('button')].every(button => button.textContent.trim());
    }));
    await page.click('#sty-guided-save'); await page.waitForFunction(() => window.__sty.bench.length === 2);
    check('stylus guided: excluded evidence retains observed loss counters and stream messages', await page.evaluate(() => {
      const row = window.__sty.bench[1]; return row.valid === false && row.detail.steps.every(step => step.quality.overrunSamples === 8 && step.quality.streamErrors === 1 && step.streamErrors[0] === 'Injected input loss');
    }));
  } finally { await context.close(); }
  return errors;
}
