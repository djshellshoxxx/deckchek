// FS-12 guided capture over generated input and production analysis. This checks
// browser controls and evidence flow, not physical cartridge/audio qualification.
import { watchConsole } from './core.mjs';

export default async function run({ browser, base, check }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage(), errors = watchConsole(page, 'stylus-benchmark');
  try {
    await page.goto(base); await page.waitForSelector('.rail-item');
    await page.evaluate(async () => {
      const { mountGuidedBenchmark } = await import('./ui/workflows/stylus-benchmark.js');
      const host = document.createElement('div'); host.id = 'stylus-benchmark-smoke';
      host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--bg,#fff);padding:24px';
      document.body.append(host);
      const s = window.__stylusBenchmark = { captures: [], runs: [], benchmarks: [], mode: 'normal', callbacks: 0 };
      s.panel = mountGuidedBenchmark(host, {
        asset: { id: 'stylus-smoke', name: 'Reference cartridge' }, hoursAt: 42,
        api: { benchmarkSave: async result => { s.benchmarks.push(result); return { id: `bench-${s.benchmarks.length}` }; } },
        onSaved: () => { s.callbacks++; },
        io: {
          liveAvailable: () => true, createPairPicker: () => ({ el: null }), currentPairs: () => [1], deviceName: () => 'Reference input',
          listSetups: async () => [{ id: 'reference-setup', name: 'Reference chain' }], profileFor: () => null,
          capture: async options => {
            const index = s.runs.length % 3, seconds = options.maxSeconds - 5, sampleRate = 8000;
            const n = seconds * sampleRate, left = new Float32Array(n), right = new Float32Array(n);
            for (let i = 0; i < n; i++) {
              const tone = 0.2 * Math.sin(2 * Math.PI * 1000 * i / sampleRate), harmonic = 0.002 * Math.sin(2 * Math.PI * 2000 * i / sampleRate);
              left[i] = index === 2 ? tone / 100 : tone + harmonic;
              right[i] = index === 1 ? tone / 100 : tone + harmonic;
            }
            const c = { elapsed: 0, cancelled: false, stopped: false, mode: s.mode, options }; s.captures.push(c);
            return {
              get stopped() { return c.stopped; }, elapsed: () => c.elapsed,
              cancel: async () => { c.cancelled = true; c.stopped = true; },
              stop: async () => {
                c.stopped = true;
                return {
                  audio: { left, right, sampleRate, channels: 2, durationSec: seconds, pairs: [{ pair: { first: 1, second: 2, mono: false } }] },
                  quality: { framesCaptured: n, overrunSamples: c.mode === 'fault' ? 64 : 0, streamErrors: 0, clippedSamplesL: 0, clippedSamplesR: 0, callbackCount: 100, maxCallbackGapMs: 10, truncated: false, streamErrorMessages: [] },
                  deviceName: 'Reference input', streamErrors: [],
                };
              },
            };
          },
          persist: async run => { s.runs.push(run); return { ok: true }; },
        },
      });
    });
    const prepare = async () => {
      for (const [id, value] of [['record', '1 kHz reference record'], ['side', 'A'], ['force', '2.5'], ['vta', 'Height 2'], ['chain', 'Turntable > phono preamp > Reference input, gain 0 dB']]) await page.fill(`#sty-guided-${id}`, value);
      await page.selectOption('#sty-guided-setup', 'reference-setup');
      await page.click('#sty-guided-start');
      await page.waitForSelector('#sty-guided-record-step');
    };
    const complete = async () => {
      for (let i = 0; i < 3; i++) {
        await page.click('#sty-guided-record-step');
        await page.waitForFunction(() => /Recording\./.test(document.querySelector('#stylus-benchmark-smoke')?.textContent || ''));
        await page.evaluate(() => { window.__stylusBenchmark.captures.at(-1).elapsed = 10; });
        if (i < 2) await page.waitForSelector('#sty-guided-record-step'); else await page.waitForSelector('#sty-guided-save');
      }
    };
    await prepare();
    check('stylus guided: preparation focuses the first capture with ordered instructions', await page.evaluate(() => document.activeElement?.id === 'sty-guided-record-step' && /Step 1 of 3: Stereo 1 kHz tone/.test(document.querySelector('#sty-guided-status').textContent)));
    await complete();
    check('stylus guided: production measurements reach explicit review without automatic benchmark save', await page.evaluate(() => window.__stylusBenchmark.runs.length === 3 && window.__stylusBenchmark.benchmarks.length === 0 && document.activeElement?.id === 'sty-guided-save'));
    await page.click('#sty-guided-save'); await page.waitForFunction(() => window.__stylusBenchmark.benchmarks.length === 1);
    check('stylus guided: saved benchmark preserves asset, setup, captures and measured values', await page.evaluate(() => {
      const b = window.__stylusBenchmark.benchmarks[0];
      return b.valid && b.assetId === 'stylus-smoke' && b.setupId === 'reference-setup' && b.hoursAt === 42 && b.detail.runs.length === 3 && b.detail.steps.every(r => r.context.deviceName === 'Reference input' && r.context.sampleRate === 8000 && r.quality.overrunSamples === 0) && Math.abs(b.thdPercent - 1) < 0.02 && Math.abs(b.separationDb - 40) < 0.02;
    }));
    check('stylus guided: selected setup reaches each source diagnostic run', await page.evaluate(() => window.__stylusBenchmark.runs.every(run => run.setupId === 'reference-setup' && run.assetId === 'stylus-smoke')));

    await page.click('#sty-guided-again'); await prepare(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Recording\./.test(document.querySelector('#stylus-benchmark-smoke')?.textContent || ''));
    check('stylus guided: capture exposes progress and focuses its cancellation control', await page.evaluate(() => document.activeElement?.id === 'sty-guided-cancel' && document.querySelector('#sty-guided-progress')?.max === 10));
    await page.keyboard.press('Escape');
    check('stylus guided: Escape cancels only its current capture and saves no partial benchmark', await page.evaluate(() => window.__stylusBenchmark.captures.at(-1).cancelled && window.__stylusBenchmark.runs.length === 3 && window.__stylusBenchmark.benchmarks.length === 1 && /cancelled/.test(document.querySelector('#sty-guided-status').textContent)));

    await page.click('#sty-guided-again'); await page.evaluate(() => { window.__stylusBenchmark.mode = 'fault'; }); await prepare(); await complete();
    check('stylus guided: gap evidence is visible and the review requires an excluded save', /Save excluded benchmark/.test(await page.locator('#sty-guided-save').innerText()) && /dropped samples/.test(await page.locator('#stylus-benchmark-smoke').innerText()));
    await page.click('#sty-guided-save'); await page.waitForFunction(() => window.__stylusBenchmark.benchmarks.length === 2);
    check('stylus guided: excluded capture retains raw quality counters', await page.evaluate(() => {
      const b = window.__stylusBenchmark.benchmarks[1];
      return !b.valid && b.detail.steps.every(step => step.quality.overrunSamples === 64) && b.detail.issues.length > 0 && window.__stylusBenchmark.callbacks === 2;
    }));
  } finally {
    await page.evaluate(() => window.__stylusBenchmark?.panel?.dispose()).catch(() => {});
    await context.close();
  }
  return errors;
}
