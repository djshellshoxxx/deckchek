// FS-35 browser behaviour over injected I/O. These generated waveforms exercise the production
// runner and analysis; they do not qualify a physical audio interface or device.
import { watchConsole } from './core.mjs';

export default async function run({ browser, base, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = watchConsole(page, 'audio-quality');
  try {
    await page.goto(base);
    await page.waitForSelector('.rail-item');
    await page.evaluate(async () => {
      const { runAudio } = await import('./ui/devices/audio-runner.js');
      const { exportStimulus } = await import('./audio-quality.js');
      const host = document.createElement('div');
      host.id = 'quality-smoke';
      host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--bg,#fff);padding:24px';
      document.body.append(host);
      const state = window.__qualitySmoke = { mode: 'hold', calls: { starts: 0, plays: [], stops: [], cancels: 0, stopAll: 0 }, results: [], releaseWait: null };
      let audio = null;
      state.runner = runAudio(host, {
        test: { id: 'smoke-quality', method: 'audio:quality', title: 'Output quality', steps: ['Use the injected test connection.'] },
        profile: { model: 'Simulated device', specs: [] },
        audioOut: {
          supported: true,
          listOutputs: async () => [{ name: 'Smoke output', isDefault: true }],
          playBuffer: async (buffer, options) => {
            const gain = 10 ** (options.levelDbfs / 20), handle = 100 + state.calls.starts;
            audio = { left: buffer.left.map(v => v * gain), right: buffer.right.map(v => v * gain), sampleRate: buffer.sampleRate };
            state.calls.plays.push({ handle, levelDbfs: options.levelDbfs, capDbfs: options.capDbfs });
            return { handle };
          },
          stop: async handle => { state.calls.stops.push(handle); },
          stopAll: async () => { state.calls.stopAll++; },
        },
        liveAvailable: () => true,
        listInputs: async () => ({ devices: [{ name: 'Smoke input', isDefault: true }] }),
        startCapture: async () => {
          state.calls.starts++;
          return {
            info: { deviceName: 'Smoke input', sampleRate: 48000 },
            cancel: async () => { state.calls.cancels++; },
            stop: async () => ({ audio, deviceName: 'Smoke input', streamErrors: state.mode === 'fault' ? ['Simulated input stream error'] : [], quality: {
              framesCaptured: audio.left.length, overrunSamples: state.mode === 'fault' ? 1024 : 0,
              clippedSamplesL: 0, clippedSamplesR: 0, streamErrors: 0, streamErrorMessages: [],
              truncated: false, callbackCount: 1, maxCallbackGapMs: 1, pairs: [],
            } }),
          };
        },
        wait: async ms => {
          if (ms > 1000 && state.mode === 'hold') await new Promise(resolve => { state.releaseWait = resolve; });
        },
        pickFile: async () => ({ name: 'opposite-response.wav' }),
        decodeAudioFile: async () => {
          const captured = exportStimulus();
          const segment = captured.meta.segments.find(s => s.name === 'resp' && s.hz === 10000);
          for (let i = segment.start; i < segment.end; i++) {
            captured.left[i] *= 10 ** (3 / 20);
            captured.right[i] *= 10 ** (-3 / 20);
          }
          return captured;
        },
        finish: result => state.results.push(result),
      });
    });

    await page.click('#quality-smoke #aq-run');
    await page.waitForFunction(() => window.__qualitySmoke.calls.plays.length === 1);
    check('audio quality: Run focuses Stop and shows bounded playback progress', await page.evaluate(() => document.activeElement?.id === 'aq-stop' && document.querySelector('#aq-progress')?.value === 1 && /Stage 2 of 3/.test(document.querySelector('#aq-progress')?.getAttribute('aria-valuetext'))));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__qualitySmoke.calls.cancels === 1);
    check('audio quality: Escape stops only its own voice and restores Run focus', await page.evaluate(() => {
      const s = window.__qualitySmoke;
      return document.activeElement?.id === 'aq-run' && s.calls.stops.join() === '101' && s.calls.stopAll === 0 && s.results.length === 0 && !document.querySelector('#aq-progress');
    }));
    await page.evaluate(() => window.__qualitySmoke.releaseWait?.());

    await page.locator('#quality-smoke .dev-audio-panel').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__qualitySmoke.calls.plays.length === 2);
    check('audio quality: panel Enter starts one run and focuses Stop', await page.evaluate(() => window.__qualitySmoke.calls.starts === 2 && document.activeElement?.id === 'aq-stop'));
    await page.click('#quality-smoke #aq-stop');
    await page.waitForFunction(() => window.__qualitySmoke.calls.cancels === 2);
    check('audio quality: Stop keeps cancelled attempts unsaved', await page.evaluate(() => window.__qualitySmoke.results.length === 0 && window.__qualitySmoke.calls.stops.join() === '101,102' && window.__qualitySmoke.calls.stopAll === 0));
    await page.evaluate(() => { window.__qualitySmoke.releaseWait?.(); window.__qualitySmoke.mode = 'clean'; });

    await page.click('#quality-smoke #aq-run');
    await page.waitForFunction(() => window.__qualitySmoke.results.length === 1);
    check('audio quality: complete evidence retains PASS, analysis revision and output cap', await page.evaluate(() => {
      const s = window.__qualitySmoke, result = s.results[0];
      return result.status === 'pass' && result.extra.analysisVersion === 2 && result.extra.captureIntegrity.source === 'live' && result.extra.captureIntegrity.state === 'observed' &&
        s.calls.plays.every(p => p.levelDbfs <= -12 && p.capDbfs === -12) && !document.querySelector('#aq-progress') && document.activeElement?.getAttribute('aria-labelledby') === 'aq-res-title';
    }));

    await page.click('#quality-smoke #aq-again');
    await page.evaluate(() => { window.__qualitySmoke.mode = 'fault'; });
    await page.click('#quality-smoke #aq-run');
    await page.waitForFunction(() => window.__qualitySmoke.results.length === 2);
    check('audio quality: capture faults remain REVIEW with their raw evidence', await page.evaluate(() => {
      const r = window.__qualitySmoke.results[1];
      return r.status === 'unknown' && r.extra.captureIntegrity.state === 'incomplete' && r.extra.captureQuality.overrunSamples === 1024 && r.extra.streamErrors[0] === 'Simulated input stream error' && /Output quality · REVIEW/.test(document.querySelector('#quality-smoke').textContent);
    }));

    await page.click('#quality-smoke #aq-again');
    await page.click('#quality-smoke #aq-file');
    await page.waitForFunction(() => window.__qualitySmoke.results.length === 3);
    check('audio quality: opposite channel response errors fail with explicit file provenance', await page.evaluate(() => {
      const r = window.__qualitySmoke.results[2], text = document.querySelector('#quality-smoke').textContent;
      return r.status === 'fail' && r.extra.source === 'opposite-response.wav' && r.extra.analysisVersion === 2 && r.extra.captureIntegrity.source === 'file' && r.extra.captureIntegrity.state === 'unobserved' &&
        /Left channel/.test(text) && /Right channel/.test(text) && /10k Hz: L \+3\.00 dB \/ R −3\.00 dB/.test(text);
    }));
  } finally {
    await page.evaluate(() => window.__qualitySmoke?.runner?.dispose()).catch(() => {});
    await context.close();
  }
  return errors;
}
