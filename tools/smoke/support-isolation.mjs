// FS-15 passive support A/B browser flow. Generated PCM tests the production
// capture adapter, panel, evidence model, reload and Equipment report. The
// command mock uses the real browser store; it is not native or hardware proof.
import { tauriMock, watchConsole, setViewport } from './core.mjs';

export function supportIsolationMock() {
  const core = window.__TAURI__.core, base = core.invoke;
  const sampleRate = 4096, frames = 30 * sampleRate, deviceName = 'Generated LF input';
  const pair = { first: 1, second: 2, mono: false, label: '1-2' };
  const mock = window.__supportMock = { calls: [], captures: [], active: null, amplitude: .5, complete: true, nextLease: 1 };
  const catalog = window.__mockDb.catalog;
  catalog.venue.push({ id: 'support-smoke-venue', name: 'Support observation venue', venueType: 'studio' });
  catalog.supportConfiguration.push(
    { id: 'support-smoke-a', name: 'Original paver <img src=x>', description: 'Support A', structureJson: '[{"material":"stone"}]', approximateMassKg: 8.5, coupledState: 'Rigid contact', deckPositionId: null, notes: 'Original A notes' },
    { id: 'support-smoke-b', name: 'Resilient support B', description: 'Support B', structureJson: '[{"material":"elastomer"}]', approximateMassKg: 2, coupledState: 'Resilient contact', deckPositionId: null, notes: 'Original B notes' },
  );
  catalog.setup.push({ id: 'support-smoke-setup', name: 'Support observation setup', venueId: 'support-smoke-venue', boothId: null,
    deckPositionId: null, supportConfigurationId: 'support-smoke-a', components: [] });
  let storePromise;
  const store = () => storePromise ??= Promise.all([import('./support-isolation.js'), import('./catalog-store.js')])
    .then(([model, catalogModule]) => model.createSupportIsolationStore({ invoke: null, storage: localStorage, catalog: catalogModule.createCatalogStore() }));
  const quality = n => ({ framesCaptured: n, overrunSamples: 0, clippedSamplesL: 0, clippedSamplesR: 0,
    streamErrors: 0, streamErrorMessages: [], truncated: false, callbackCount: n ? 240 : 0, maxCallbackGapMs: n ? 125 : 0,
    pairs: [{ first: 1, clippedSamplesL: 0, clippedSamplesR: 0 }] });
  core.invoke = async (command, args = {}) => {
    mock.calls.push(command);
    switch (command) {
      case 'list_native_audio_inputs': return [{ name: deviceName, isDefault: true, maxChannels: 2, defaultChannels: 2, pairs: [pair] }];
      case 'start_live_capture': {
        if (mock.active) throw new Error('Capture already running');
        if (args.deviceName !== deviceName || args.pairs?.length !== 1 || args.pairs[0] !== 1 || args.maxSeconds !== 35) throw new Error('Unexpected support capture request');
        const info = { deviceName, sampleRate, channels: 2, pairs: [pair], maxSeconds: args.maxSeconds, leaseId: mock.nextLease++ };
        mock.active = { info, amplitude: mock.amplitude }; mock.captures.push(structuredClone(mock.active));
        return structuredClone(info);
      }
      case 'live_capture_status': return { running: Boolean(mock.active), elapsedSec: mock.complete ? 30 : 0, quality: quality(mock.active && mock.complete ? frames : 0) };
      case 'stop_live_capture': {
        const session = mock.active;
        if (!session || args.leaseId !== session.info.leaseId) throw new Error('Capture lease mismatch');
        mock.active = null;
        const left = Array.from({ length: frames }, (_, n) => Math.fround(session.amplitude * Math.sin(2 * Math.PI * 63 * n / sampleRate)));
        return { payload: { deviceName, sampleRate, channels: 2, pairs: [pair], left, right: left.slice(), streamErrors: [] }, quality: quality(frames) };
      }
      case 'support_isolation_observation_save': return (await store()).saveObservation(args.input);
      case 'support_isolation_observation_get': return (await store()).getObservation(args.id);
      case 'support_isolation_comparison_save': return (await store()).saveComparison(args.input);
      case 'support_isolation_list': return (await store()).list(args.filter);
      case 'hum_run_list': return [];
      case 'venue_incident_list': return { items: [], total: 0, limit: args.filter?.limit ?? 100, hasMore: false };
      default: return base(command, args);
    }
  };
}

function installSupportPrintSpy() {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { configurable: true, get() {
    const frame = descriptor.get.call(this);
    if (frame && this.classList.contains('dc-print-frame') && !frame.__supportPrintSpy) {
      frame.__supportPrintSpy = true; frame.print = () => { window.__supportReportHtml = frame.document.body.innerHTML; };
    }
    return frame;
  } });
}

export default async function run({ browser, base, check, SHOTS }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(tauriMock); await context.addInitScript(supportIsolationMock);
  await context.addInitScript(() => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { humHunter: true } })); });
  const page = await context.newPage(), errors = watchConsole(page, 'support-isolation');
  const open = async () => {
    await page.waitForSelector('.rail-item[data-screen="hum"]'); await page.click('.rail-item[data-screen="hum"]');
    await page.click('#hum-tab-support');
    // A closed select's options need not be visible. selectOption below still
    // waits for the select itself to be actionable after its choices are loaded.
    await page.waitForSelector('#support-ab-venue option[value="support-smoke-venue"]', { state: 'attached' });
  };
  await page.goto(base); await open();
  await page.selectOption('#support-ab-venue', 'support-smoke-venue'); await page.selectOption('#support-ab-setup', 'support-smoke-setup');
  await page.selectOption('#support-ab-a', 'support-smoke-a'); await page.selectOption('#support-ab-b', 'support-smoke-b');
  await page.selectOption('#support-ab-device', 'Generated LF input'); await page.selectOption('#support-ab-pair', '1');
  for (const [field, value] of Object.entries({ route: 'Deck → phono preamp → input 1/2', gainSettings: 'Gain fixed; EQ flat; filter off',
    procedure: 'Stationary stylus on the same stationary record; platter stopped', source: 'Same silent record groove',
    placement: 'Deck and monitors at marked positions', paLevel: 'Off' })) await page.fill(`#support-ab-${field}`, value);
  await page.selectOption('#support-ab-paState', 'off'); await page.check('#support-ab-stationary');
  await page.click('#support-ab-record');
  await page.waitForFunction(() => /Saved observation A/.test(document.querySelector('#support-ab-status')?.textContent || ''), null, { timeout: 15000 });
  check('support A/B: A saves through the production capture adapter and requires a fresh stationary confirmation',
    await page.locator('#support-ab-record').isEnabled() && !await page.locator('#support-ab-stationary').isChecked()
    && await page.evaluate(() => window.__supportMock.captures.length === 1 && window.__supportMock.active === null));

  await page.evaluate(() => { window.__supportMock.amplitude = .25; });
  await page.check('#support-ab-stationary'); await page.click('#support-ab-record');
  await page.waitForFunction(() => /Saved observation B/.test(document.querySelector('#support-ab-status')?.textContent || ''), null, { timeout: 15000 });
  check('support A/B: both captures retain their own support while the setup assignment stays unchanged',
    !await page.locator('#support-ab-confirm').isChecked() && await page.evaluate(async () => {
      const history = await (await import('./support-isolation.js')).createSupportIsolationStore().list({ venueId: 'support-smoke-venue' });
      return history.observationTotal === 2 && history.comparisonTotal === 0
        && history.observations.find(row => row.stage === 'A').context.support.id === 'support-smoke-a'
        && history.observations.find(row => row.stage === 'B').context.support.id === 'support-smoke-b'
        && window.__mockDb.catalog.setup.find(row => row.id === 'support-smoke-setup').supportConfigurationId === 'support-smoke-a';
    }));
  await page.check('#support-ab-confirm'); await page.click('#support-ab-compare');
  await page.waitForFunction(() => /Saved change B/.test(document.querySelector('#support-ab-status')?.textContent || ''));
  check('support A/B: a scaled generated signal yields the expected change with unknown uncertainty and no retained PCM', await page.evaluate(async () => {
    const history = await (await import('./support-isolation.js')).createSupportIsolationStore().list({ venueId: 'support-smoke-venue' });
    const result = history.comparisons[0]?.result;
    return history.comparisonTotal === 1 && result.status === 'operator_reported_comparable'
      && Math.abs(result.deltaDb.pair + 6.020599913279626) < 1e-9 && result.uncertainty.standard === null
      && history.observations.every(row => row.rawAudioRetained === false && row.analysis.analyzedFrames === 122880
        && row.analysis.capturedFrames === 122880 && row.analysis.method === 'support-lf-welch-ms-v1')
      && !window.__supportMock.calls.some(command => ['audio_play_tone', 'audio_play_buffer'].includes(command));
  }));
  await page.screenshot({ path: `${SHOTS}/support-isolation-comparison.png` });

  // A running capture stays cancellable; leaving cannot save its returned buffers.
  await page.click('#support-ab-new'); await page.check('#support-ab-stationary');
  await page.evaluate(() => { window.__supportMock.complete = false; }); await page.click('#support-ab-record');
  await page.waitForFunction(() => window.__supportMock.active !== null);
  await page.click('.rail-item[data-screen="equipment"]'); await page.waitForFunction(() => window.__supportMock.active === null);
  check('support A/B: navigation releases only the acquired lease and retains the two earlier observations', await page.evaluate(async () => {
    const history = await (await import('./support-isolation.js')).createSupportIsolationStore().list({ venueId: 'support-smoke-venue' });
    return history.observationTotal === 2 && history.comparisonTotal === 1 && window.__supportMock.captures.length === 3;
  }));

  await page.reload(); await open(); await page.selectOption('#support-ab-venue', 'support-smoke-venue');
  await page.waitForFunction(() => /2 of 2 observations and 1 of 1 comparisons/.test(document.querySelector('#support-ab-history')?.textContent || ''));
  check('support A/B: reload shows retained observations, comparison direction and the unresolved uncertainty',
    /B − A/.test(await page.locator('#support-ab-history').innerText()) && /uncertainty unknown/.test(await page.locator('#support-ab-history').innerText()));
  await setViewport(page, { width: 390, height: 800 });
  check('support A/B: controls and history fit the phone viewport', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await setViewport(page, { width: 1280, height: 900 });
  await page.evaluate(() => { window.__mockDb.catalog.supportConfiguration.find(row => row.id === 'support-smoke-a').name = 'Current renamed support'; });
  await page.evaluate(installSupportPrintSpy); await page.click('.rail-item[data-screen="equipment"]'); await page.click('#eq-tab-venue');
  await page.locator('#eq-rows .record-main', { hasText: 'Support observation venue' }).click(); await page.click('#eq-venue-pdf');
  await page.waitForFunction(() => typeof window.__supportReportHtml === 'string');
  const html = await page.evaluate(() => window.__supportReportHtml);
  check('support A/B: Equipment report separates current descriptions from escaped historical comparison evidence',
    /Current renamed support/.test(html) && /Original paver &lt;img/.test(html) && !/<img\b[^>]*\bsrc\s*=\s*["']?x(?=[\s"'>])/i.test(html)
    && /Historical support A\/B observations/.test(html) && /support-lf-welch-ms-v1/.test(html)
    && /B − A/.test(html) && /uncertainty is unknown/.test(html) && /No raw audio is archived/.test(html));
  await context.close(); return errors;
}
