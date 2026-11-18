// Production controller/provider/panel/bridge with generated PCM and in-memory
// native command responses. This is a UI smoke, not SQLite or device evidence.
import { tauriMock, watchConsole, a11yAudit } from './core.mjs';

function incidentMock() {
  const core = window.__TAURI__.core, base = core.invoke;
  const mock = window.__incidentMetricSmoke = { calls: [], pairs: {}, manual: [], submissions: [], lostAck: true, download: null, starts: 0, stops: 0 };
  window.__mockDb.catalog.venue.push({ id: 'metric-venue', name: 'Snapshot venue' });
  window.__mockDb.catalog.setup.push({ id: 'metric-setup', name: 'Selected deck', venueId: 'metric-venue', components: [] });
  window.__TAURI__.dialog = { save: async () => '/tmp/incident-metric-evidence.json' };
  core.invoke = async (command, args = {}) => {
    mock.calls.push(command);
    if (command === 'venue_incident_save') {
      const saved = { ...structuredClone(args.input), origin: 'operator', recordedAt: new Date().toISOString() };
      mock.manual.push(saved); return saved;
    }
    if (command === 'venue_incident_save_with_metric_evidence') {
      mock.submissions.push(structuredClone(args));
      let pair = mock.pairs[args.input.id];
      if (!pair) {
        const recordedAt = new Date().toISOString();
        pair = { incident: { ...structuredClone(args.input), origin: 'operator', recordedAt }, evidence: { ...structuredClone(args.evidence), origin: 'operator-attached', recordedAt } };
        mock.pairs[args.input.id] = pair;
      }
      if (mock.lostAck) { mock.lostAck = false; throw 'Lost snapshot acknowledgement'; }
      return structuredClone(pair);
    }
    if (command === 'venue_incident_page' || command === 'venue_incident_list') {
      const filter = args.filter || {}, limit = filter.limit || 100;
      const rows = [...mock.manual, ...Object.values(mock.pairs).map(pair => pair.incident)]
        .filter(row => !filter.venueId || row.venueId === filter.venueId)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
      return { items: structuredClone(rows.slice(0, limit)), total: rows.length, limit, hasMore: rows.length > limit, ...(command.endsWith('_page') ? { nextCursor: null } : {}) };
    }
    if (command === 'venue_incident_metric_evidence_get') {
      const pair = mock.pairs[args.incidentId];
      return pair ? structuredClone(pair) : { incident: structuredClone(mock.manual.find(row => row.id === args.incidentId)), evidence: null };
    }
    if (command === 'venue_incident_metric_evidence_summaries') {
      const { metricEvidenceSummary } = await import('./incident-metric-evidence.js');
      return args.incidentIds.map(id => {
        const pair = mock.pairs[id];
        return pair ? { incident: structuredClone(pair.incident), evidence: metricEvidenceSummary(pair.evidence) }
          : { incident: structuredClone(mock.manual.find(row => row.id === id)), evidence: null };
      });
    }
    if (command === 'userfiles_write_text') { mock.download = args.content; return { path: args.path, bytes: new TextEncoder().encode(args.content).length }; }
    if (command === 'hum_run_list') return [];
    return base(command, args);
  };
}

export default async function run({ browser, base, check, SHOTS }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.addInitScript(tauriMock); await context.addInitScript(incidentMock);
  await context.addInitScript(() => localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { humHunter: true } })));
  const page = await context.newPage(), errors = watchConsole(page, 'incident-metric-evidence');
  try {
    await page.goto(base); await page.click('.rail-item[data-screen="hum"]'); await page.click('#hum-tab-incidents');
    await page.selectOption('#incident-venue', 'metric-venue'); await page.selectOption('#incident-setup', 'metric-setup');
    check('incident snapshot: attachment defaults off', !(await page.isChecked('#incident-metric-attach')));
    await page.click('[data-incident-kind="other"]'); await page.waitForFunction(() => window.__incidentMetricSmoke.manual.length === 1);
    check('incident snapshot: ordinary press uses only v1 save', await page.evaluate(() => window.__incidentMetricSmoke.submissions.length === 0));
    await page.evaluate(async () => {
      const { createMonitorController } = await import('./monitor.js');
      const { registerMetricMonitor } = await import('./incident-metric-evidence.js');
      const mock = window.__incidentMetricSmoke; let onBlock;
      mock.controller = createMonitorController({ startStream: async args => {
        mock.starts++; onBlock = args.onBlock;
        return { info: { deviceName: 'Generated input <img src=x>', sampleRate: 48000 }, async stop() { mock.stops++; } };
      } });
      registerMetricMonitor(mock.controller);
      await mock.controller.start({ deviceName: 'Generated input <img src=x>', decks: [{ deck: 'A', pair: 1 }], format: 'Traktor Scratch MK2' });
      const left = new Float32Array(12000), right = new Float32Array(12000);
      for (let i = 0; i < left.length; i++) { const phase = 2 * Math.PI * 2500 * i / 48000; left[i] = 0.5 * Math.sin(phase); right[i] = 0.5 * Math.cos(phase); }
      onBlock({ sampleRate: 48000, frames: left.length, pairs: [{ left, right }], quality: { droppedBlocks: 2 } });
    });
    await page.check('#incident-metric-attach');
    const option = await page.locator('#incident-metric-source option').nth(1).getAttribute('value');
    await page.selectOption('#incident-metric-source', option); await page.fill('#incident-note', 'Original <img src=x>');
    await page.click('[data-incident-kind="hum"]'); await page.waitForSelector('#incident-save-retry');
    check('incident snapshot: attachment action did not open or stop capture', await page.evaluate(() => window.__incidentMetricSmoke.starts === 1 && window.__incidentMetricSmoke.stops === 0));
    await page.evaluate(() => window.__incidentMetricSmoke.controller.stop());
    await page.fill('#incident-note', 'Later note'); await page.click('#incident-save-retry');
    await page.waitForFunction(() => document.querySelector('#incident-save-status').textContent.includes('snapshot was saved'));
    check('incident snapshot: lost acknowledgement retries the original pair after source retirement', await page.evaluate(() => {
      const submissions = window.__incidentMetricSmoke.submissions;
      return submissions.length === 2 && JSON.stringify(submissions[0]) === JSON.stringify(submissions[1]) && Object.keys(window.__incidentMetricSmoke.pairs).length === 1;
    }));
    const id = await page.evaluate(() => Object.keys(window.__incidentMetricSmoke.pairs)[0]);
    await page.click(`[data-incident-metric-detail="${id}"]`); await page.waitForSelector('#incident-metric-download');
    const detail = await page.locator('#incident-metric-detail').innerText();
    check('incident snapshot: saved detail discloses source, receipt age and unavailable hum', /host-callback-observation/.test(detail) && /unavailable/.test(detail) && /Generated input <img src=x>/.test(detail));
    check('incident snapshot: device and note labels are escaped', await page.locator('#incident-metric-detail img, #incident-history img').count() === 0);
    await page.click('#incident-metric-download'); await page.waitForFunction(() => window.__incidentMetricSmoke.download !== null);
    check('incident snapshot: complete saved pair JSON keeps original press and source', await page.evaluate(() => {
      const mock = window.__incidentMetricSmoke, pair = JSON.parse(mock.download), original = mock.submissions[0];
      return pair.incident.id === original.input.id && pair.incident.note === original.input.note && pair.evidence.source.generation === original.evidence.source.generation && pair.evidence.timing.ageMs === original.evidence.timing.ageMs;
    }));
    const audit = await a11yAudit(page);
    check('incident snapshot: visible controls have accessible names and usable targets', !audit.unnamed.length && !audit.small.length, [...audit.unnamed, ...audit.small].slice(0, 3).join(' | '));
    await page.screenshot({ path: `${SHOTS}/incident-metric-evidence.png`, fullPage: true });
  } finally { await context.close(); }
  return errors;
}
