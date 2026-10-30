// Workspace import -> History -> actual result/inspector rendering, deliberately without CSP.
// Harmless marker buttons prove encoding itself prevents markup and handlers; production policy is unchanged.
import { watchConsole } from './core.mjs';

export default async function run({ browser, base, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = watchConsole(page, 'workspace-boundary');
  try {
    await page.route(base, async route => {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      delete headers['content-security-policy'];
      await route.fulfill({ response, headers });
    });
    const response = await page.goto(base);
    await page.waitForSelector('.rail-item[data-screen="history"]');
    check('workspace boundary: document intentionally has no CSP', !response.headers()['content-security-policy'] && await page.locator('meta[http-equiv="Content-Security-Policy"]').count() === 0);
    const marker = name => `<button data-workspace-marker="${name}" onclick="document.documentElement.dataset.boundaryExecuted='yes'">Audit marker</button>`;
    const id = `legacy / r">${marker('id')}<span data-tail=" & B`;
    const kMarker = marker('k');
    const measurement = uncertainty => ({ metricId: 'rpm', label: 'Imported speed', value: 33.3, unit: 'RPM', origin: 'measured', confidence: .9, qualityFlags: [], uncertainty });
    const runs = [{
      id, test: 'Workspace boundary hostile fields', createdAt: '2026-10-28T12:00:00Z', score: 90,
      measurements: [measurement({ expanded: .02, k: kMarker, unit: 'RPM', components: { clock: .01, invalid: marker('component') } })],
      findings: [{ code: 'review', title: 'Imported finding', detail: 'Recorded evidence remains available.', severity: 'review', confidence: .8, supportedBy: ['rpm'], contradictedBy: [], isolationTests: [] }],
      calibration: { applied: true }, evidence: {},
    }, {
      id: 'legacy / "A" & B', test: 'Workspace boundary valid fields', createdAt: '2026-10-27T12:00:00Z', score: 100,
      measurements: [measurement({ standard: .01, expanded: .02, k: 2, unit: 'RPM', components: { clock: .01 } }), { ...measurement(.03), metricId: 'scalar_uncertainty', label: 'Scalar uncertainty' }],
      findings: [], calibration: { applied: true }, evidence: {},
    }];
    await page.click('.rail-item[data-screen="history"]');
    const chooser = page.waitForEvent('filechooser');
    await page.click('#ws-import');
    await (await chooser).setFiles({ name: 'workspace-boundary.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, equipment: [], runs })) });
    await page.locator('#hist-rows .run-main').filter({ hasText: runs[0].test }).click();
    await page.waitForSelector('#hist-detail .results');
    check('workspace boundary: imported ID is retained as one DOM attribute', await page.evaluate(id => !!document.getElementById(`verdict-${id}`) && !!document.getElementById(`finding-${id}-0`), id));
    check('workspace boundary: hostile IDs create no markup', await page.locator('[data-workspace-marker]').count() === 0);
    await page.locator('#hist-detail .readout[data-metric="rpm"]').click();
    check('workspace boundary: imported malformed uncertainty creates no markup or invented factor', await page.locator('[data-workspace-marker]').count() === 0 && !/k=|~95%/.test(await page.locator('#inspector-body').textContent()));
    check('workspace boundary: import keeps valid uncertainty evidence and removes malformed fields', await page.evaluate(async id => {
      const { localRun } = await import('/ui/state.js');
      const m = localRun(id).measurements[0];
      return m.value === 33.3 && m.uncertainty.expanded === .02 && !Object.hasOwn(m.uncertainty, 'k') && m.uncertainty.components.clock === .01 && !Object.hasOwn(m.uncertainty.components, 'invalid');
    }, id));

    // Old locally persisted runs may predate import sanitisation; the renderer must independently be safe.
    await page.evaluate(async ({ id, kMarker }) => {
      const { localRun } = await import('/ui/state.js');
      localRun(id).measurements[0].uncertainty = { expanded: .02, k: kMarker, unit: 'RPM' };
    }, { id, kMarker });
    await page.locator('#hist-detail .readout[data-metric="rpm"]').click();
    check('workspace boundary: legacy malformed uncertainty also creates no markup', await page.locator('[data-workspace-marker]').count() === 0);
    await page.locator('[data-workspace-marker]').evaluateAll(elements => elements.forEach(el => el.click()));
    check('workspace boundary: no marker handler can run without CSP', await page.evaluate(() => document.documentElement.dataset.boundaryExecuted !== 'yes'));

    await page.locator('#hist-rows .run-main').filter({ hasText: runs[1].test }).click();
    await page.locator('#hist-detail .readout[data-metric="rpm"]').click();
    check('workspace boundary: valid imported identity, coverage factor and budget survive', await page.evaluate(id => !!document.getElementById(`verdict-${id}`), runs[1].id) && /k=2, ~95%/.test(await page.locator('#inspector-body').textContent()) && /clock/.test(await page.locator('#inspector-body').textContent()));
    await page.locator('#hist-detail .readout[data-metric="scalar_uncertainty"]').click();
    check('workspace boundary: scalar uncertainty stays visible without guessed coverage', /± 0.030/.test(await page.locator('#inspector-body').textContent()) && !/k=|~95%/.test(await page.locator('#inspector-body').textContent()));
  } finally { await context.close(); }
  return errors;
}
