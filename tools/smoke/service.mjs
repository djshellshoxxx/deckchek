// FS-22 smoke: Service worksheets. Flag off = hidden; browser mode = "needs the desktop app"; desktop mode with an
// in-memory implementation of the job_* / customer_* commands covers the empty state, Ctrl+J new job (AC-1), Esc,
// status changes (AC-6), the stepper (ordered list, aria-current, Alt+Left/Right), pre-repair tests through the device
// test runner in job mode (AC-2), parts / labour / notes with Ctrl+Enter and amendments (AC-3), post-repair tests and the
// before/after comparison with the partial state (AC-4), the job sheet export to HTML with escaping, costs and customer
// details only when ticked (AC-5), cancel = read-only and delete by typing the job number (AC-7), and no console errors.
import fs from 'node:fs';
import { watchConsole, tauriMock, a11yAudit } from './core.mjs';

const FLAG_ON = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { service: true } })); };

// Desktop mode: tauriMock plus job_* / customer_* commands. `window.__svc` exposes state for the test.
export function serviceMock() {
  const core = window.__TAURI__.core; const base = core.invoke;
  const svc = { customers: [], jobs: [], log: [], statusLog: [], results: [], photos: [], extraValues: {}, calls: [] };
  window.__svc = svc;
  let n = 0; const id = p => `${p}-${++n}`;
  const now = () => new Date(Date.now() + n).toISOString();
  const NEXT = { intake: ['diagnosing', 'cancelled'], diagnosing: ['awaiting_parts', 'repairing', 'ready', 'cancelled'], awaiting_parts: ['repairing', 'cancelled'], repairing: ['testing', 'awaiting_parts'], testing: ['ready', 'repairing'], ready: ['collected'], collected: [], cancelled: [] };
  const terminal = s => s === 'collected' || s === 'cancelled';
  const job = jid => { const j = svc.jobs.find(x => x.id === jid); if (!j) throw `unknown job '${jid}'`; return j; };
  const editable = jid => { const j = job(jid); if (terminal(j.status)) throw `job ${j.jobNumber} is ${j.status} and read-only; reopen it to make changes`; return j; };
  const dtr = rid => (window.__mockDb.deviceResults || []).find(r => r.id === rid);
  const detail = jid => {
    const j = job(jid);
    const asset = (window.__mockDb.catalog.asset || []).find(a => a.id === j.assetId);
    return {
      job: { ...j, readOnly: terminal(j.status) },
      customer: svc.customers.find(c => c.id === j.customerId) || null,
      asset: asset ? { id: asset.id, nickname: asset.nickname, serialNumber: asset.serialNumber || null, productId: asset.productId || null, profileId: String(asset.productId || '').replace(/^prod-/, '') || null, isDeleted: false } : null,
      statusLog: svc.statusLog.filter(s => s.jobId === jid), log: svc.log.filter(l => l.jobId === jid),
      results: svc.results.filter(r => r.jobId === jid).map(r => { const d = r.deviceTestResultId ? dtr(r.deviceTestResultId) : null; return { ...r, testId: d?.testId || null, status: d?.status || 'completed', at: d?.createdAt || now() }; }),
      photos: svc.photos.filter(p => p.jobId === jid), allowedNext: terminal(j.status) ? ['diagnosing'] : NEXT[j.status],
    };
  };
  core.invoke = async (cmd, args = {}) => {
    if (!cmd.startsWith('job_') && !cmd.startsWith('customer_') && cmd !== 'photo_read' && cmd !== 'photo_unlink') return base(cmd, args);
    svc.calls.push(cmd);
    if (cmd === 'job_list') {
      const q = (args.query?.q || '').toLowerCase(), st = args.query?.status;
      const rows = svc.jobs.filter(j => (!st || j.status === st || (st === 'open' && !terminal(j.status))) && (!q || j.jobNumber.toLowerCase().includes(q) || (svc.customers.find(c => c.id === j.customerId)?.name || '').toLowerCase().includes(q)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(j => ({ ...j, readOnly: terminal(j.status), customerName: svc.customers.find(c => c.id === j.customerId)?.name || null, assetName: (window.__mockDb.catalog.asset || []).find(a => a.id === j.assetId)?.nickname || null, serialNumber: null }));
      return { jobs: rows, total: rows.length };
    }
    if (cmd === 'job_create') {
      const i = args.input;
      if (!i.reportedFault?.trim()) throw 'reportedFault is required';
      let customerId = i.customerId;
      if (i.customer) { customerId = id('c'); svc.customers.push({ id: customerId, jobCount: 1, createdAt: now(), ...i.customer }); }
      let assetId = i.assetId;
      if (i.newUnit) { assetId = id('a'); window.__mockDb.catalog.asset.push({ id: assetId, nickname: i.newUnit.nickname, productId: i.newUnit.productId, serialNumber: i.newUnit.serialNumber }); }
      const t = now();
      const j = { id: id('j'), jobNumber: `J-2026-${String(svc.jobs.length + 1).padStart(4, '0')}`, customerId, assetId, status: 'intake', reportedFault: i.reportedFault.trim(), accessories: i.accessories || [], arrivalCondition: i.arrivalCondition || null, resolution: null, openedAt: t, updatedAt: t, closedAt: null };
      svc.jobs.push(j); svc.statusLog.push({ id: id('s'), jobId: j.id, fromStatus: null, toStatus: 'intake', note: null, at: t });
      return { ...j, readOnly: false };
    }
    if (cmd === 'job_get') return detail(args.id);
    if (cmd === 'job_update_fields') { const j = editable(args.id); Object.assign(j, { reportedFault: args.patch.reportedFault ?? j.reportedFault, arrivalCondition: args.patch.arrivalCondition ?? j.arrivalCondition, resolution: args.patch.resolution ?? j.resolution, updatedAt: now() }); return j; }
    if (cmd === 'job_set_status') {
      const j = job(args.id);
      const from = args.expected || j.status;
      const ok = args.reopen ? terminal(from) && args.to === 'diagnosing' : !terminal(from) && NEXT[from].includes(args.to);
      if (!ok) throw `a job cannot move from ${from} to ${args.to}`;
      if (j.status !== from) throw `job ${j.jobNumber} changed meanwhile (it is now ${j.status}); reload and try again`;
      j.status = args.to; j.updatedAt = now(); j.closedAt = terminal(args.to) ? j.updatedAt : null;
      svc.statusLog.push({ id: id('s'), jobId: j.id, fromStatus: from, toStatus: args.to, note: args.reopen ? 'Reopened' : args.note, at: j.updatedAt });
      return { ...j, readOnly: terminal(j.status) };
    }
    if (cmd === 'job_add_log') {
      editable(args.id);
      const e = { id: id('l'), jobId: args.id, kind: args.kind, description: args.payload.description, quantity: args.payload.quantity ?? null, minutes: args.payload.minutes ?? null, unitCost: args.payload.unitCost ?? null, amendsId: args.payload.amendsId || null, at: now() };
      svc.log.push(e); job(args.id).updatedAt = e.at; return e;
    }
    if (cmd === 'job_link_results') {
      editable(args.id);
      let linked = 0;
      for (const d of args.links.deviceTestResultIds || []) { if (!svc.results.some(r => r.jobId === args.id && r.phase === args.phase && r.deviceTestResultId === d)) { svc.results.push({ id: id('r'), jobId: args.id, phase: args.phase, sessionId: null, deviceTestResultId: d }); linked++; } }
      for (const s of args.links.sessionIds || []) { svc.results.push({ id: id('r'), jobId: args.id, phase: args.phase, sessionId: s, deviceTestResultId: null }); linked++; }
      return { linked, alreadyLinked: 0 };
    }
    if (cmd === 'job_comparison') {
      const tests = svc.results.filter(r => r.jobId === args.id && r.deviceTestResultId).map(r => { const d = dtr(r.deviceTestResultId); return { phase: r.phase, testId: d.testId, title: d.detail?.title || d.testId, status: d.status, at: d.createdAt }; });
      return { jobId: args.id, values: svc.extraValues[args.id] || [], tests, methods: [] };
    }
    if (cmd === 'job_attach_photo') { editable(args.id); const p = { linkId: id('pl'), photoId: id('p'), jobId: args.id, caption: args.input.caption, stage: args.input.stage }; svc.photos.push(p); return { photoId: p.photoId, linkId: p.linkId, sha256: 'x', deduplicated: false }; }
    if (cmd === 'job_delete') { const j = job(args.id); if (args.confirm.trim() !== j.jobNumber) throw `type the job number ${j.jobNumber} to delete this job`; svc.jobs = svc.jobs.filter(x => x.id !== j.id); return null; }
    if (cmd === 'customer_list') return svc.customers.filter(c => !args.q || c.name.toLowerCase().includes(String(args.q).toLowerCase()));
    if (cmd === 'customer_update') { const c = svc.customers.find(x => x.id === args.id); Object.assign(c, args.patch); return c; }
    if (cmd === 'customer_delete') { const k = svc.jobs.filter(j => j.customerId === args.id).length; if (k) throw `this customer has ${k} job${k === 1 ? '' : 's'}; a customer with jobs cannot be deleted`; svc.customers = svc.customers.filter(c => c.id !== args.id); return null; }
    if (cmd === 'photo_read') return '/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==';
    if (cmd === 'photo_unlink') { svc.photos = svc.photos.filter(p => p.linkId !== args.linkId); return { unlinked: true, fileDeleted: false }; }
    throw `unknown command ${cmd}`;
  };
}

async function answerChecklist(page, answers) {
  await page.waitForSelector('.dev-checklist');
  const items = page.locator('.dev-check-item');
  const count = await items.count();
  for (let i = 0; i < count; i++) await items.nth(i).locator(`[data-answer="${answers[i] || 'ok'}"]`).click();
  await page.click('#dev-check-save');
  await page.waitForSelector('#dev-run-result .banner-result');
}

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  const shot = async (page, name) => { await page.waitForTimeout(150); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

  // ----- flag off -----
  const off = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await off.addInitScript(tauriMock); await off.addInitScript(serviceMock);
  const po = await off.newPage();
  errors.push(watchConsole(po, 'service-off'));
  await po.goto(base);
  await po.waitForSelector('.rail-item');
  check('service: flag off hides the Service screen', (await po.locator('.rail-item[data-screen="service"]').count()) === 0);
  await po.keyboard.press('Control+j');
  await po.waitForTimeout(200);
  check('service: Ctrl+J does nothing while the flag is off', (await po.locator('#svc-new-form').count()) === 0);
  await off.close();

  // ----- browser mode -----
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await bctx.addInitScript(FLAG_ON);
  const pb = await bctx.newPage();
  errors.push(watchConsole(pb, 'service-browser'));
  await pb.goto(base);
  await pb.waitForSelector('.rail-item[data-screen="service"]');
  await pb.click('.rail-item[data-screen="service"]');
  await pb.waitForSelector('#svc-unsupported');
  check('service: browser mode says it needs the desktop app', /need the desktop app/i.test(await pb.locator('#svc-unsupported').innerText()));
  await bctx.close();

  // ----- desktop flow -----
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true });
  await ctx.addInitScript(tauriMock); await ctx.addInitScript(serviceMock); await ctx.addInitScript(FLAG_ON);
  const page = await ctx.newPage();
  errors.push(watchConsole(page, 'service'));
  await page.goto(base);
  await page.waitForSelector('.rail-item[data-screen="service"]');
  await page.click('.rail-item[data-screen="service"]');
  await page.waitForSelector('#svc-empty');
  check('service: empty state invites the first job', /No jobs yet\. Create your first job/.test(await page.locator('#svc-empty').innerText()));
  await shot(page, 'service-empty-dark');

  // Ctrl+J, Esc
  await page.locator('#main').focus().catch(() => {});
  await page.keyboard.press('Control+j');
  await page.waitForSelector('#svc-new-form');
  check('service: Ctrl+J opens the new-job form with the name field focused', await page.evaluate(() => document.activeElement?.id === 'svc-cust-name'));
  await page.locator('#main').focus().catch(() => {});
  await page.keyboard.press('Escape');
  await page.waitForSelector('#svc-empty');
  check('service: Esc leaves the form for the list', (await page.locator('#svc-new-form').count()) === 0);

  // AC-1 create
  await page.keyboard.press('Control+j');
  await page.waitForSelector('#svc-new-form');
  await page.click('#svc-new-save');
  check('service: missing customer name is reported inline', /customer’s name/.test(await page.locator('#svc-new-error').innerText()));
  await page.fill('#svc-cust-name', 'Zebedee <Pii>');
  await page.fill('#svc-cust-phone', '+44 7700 900123');
  await page.fill('#svc-cust-email', 'zeb@example.org');
  await page.waitForSelector('#svc-unit option[value="asset-pioneer-djm-a9"]', { state: 'attached' });
  await page.selectOption('#svc-unit', 'asset-pioneer-djm-a9');
  await page.fill('#svc-fault', 'Channel 2 fader crackles <b>loud</b>');
  await page.check('#svc-acc-0');
  await page.fill('#svc-condition', 'Light scuffs');
  await shot(page, 'service-new-dark');
  await page.click('#svc-new-save');
  await page.waitForSelector('#svc-job-title');
  check('service: AC-1 job created in Intake with a human job number', /Job J-2026-0001/.test(await page.locator('#svc-job-title').innerText()) && /Intake/.test(await page.locator('#svc-job-status').innerText()));
  const created = await page.evaluate(() => window.__svc.jobs[0]);
  check('service: AC-1 intake stored fault, accessories and unit', created.reportedFault.includes('<b>loud</b>') && created.accessories[0] === 'Power cable' && created.assetId === 'asset-pioneer-djm-a9');
  check('service: a new job opens on its first open step (Before)', (await page.locator('#svc-panel-title').innerText()) === 'Before');
  await page.click('[data-step="intake"]');
  await page.waitForSelector('#svc-fault-text');
  check('service: fault text is shown as text, not markup', await page.locator('#svc-fault-text').innerText().then(t => t.includes('<b>loud</b>')));

  // stepper
  check('service: stepper is an ordered list with aria-current="step"', (await page.locator('ol#svc-stepper > li').count()) === 5 && (await page.locator('#svc-stepper [aria-current="step"]').count()) === 1);
  check('service: step states are words (not colour only)', /Done/.test(await page.locator('[data-step="intake"]').innerText()) && /Blocked/.test(await page.locator('[data-step="after"]').innerText()));

  // AC-6 statuses
  check('service: only allowed transitions are offered from Intake', (await page.locator('[data-status-to]').evaluateAll(b => b.map(x => x.dataset.statusTo)).then(a => a.join(','))) === 'diagnosing,cancelled');
  await page.click('[data-status-to="diagnosing"]');
  await page.waitForFunction(() => /Diagnosing/.test(document.getElementById('svc-job-status')?.innerText || ''));
  check('service: AC-6 status change is logged with the previous status', await page.evaluate(() => window.__svc.statusLog.at(-1).fromStatus === 'intake' && window.__svc.statusLog.at(-1).toStatus === 'diagnosing'));

  // Alt+Right / Alt+Left
  await page.locator('[data-step="intake"]').focus();
  await page.keyboard.press('Alt+ArrowRight');
  await page.waitForSelector('[data-step="before"][aria-current="step"]');
  check('service: Alt+Right moves to the next step', (await page.locator('#svc-panel-title').innerText()) === 'Before');
  await page.keyboard.press('Alt+ArrowLeft');
  await page.waitForSelector('[data-step="intake"][aria-current="step"]');
  check('service: Alt+Left moves back', (await page.locator('#svc-panel-title').innerText()) === 'Intake');
  await page.keyboard.press('Alt+ArrowRight');
  await page.waitForSelector('#svc-plan-before');

  // AC-2 pre-repair tests in job mode
  await page.check('[data-plan-test="djma9-knobs"]');
  await page.click('#svc-run-before');
  await page.waitForSelector('#dev-job-badge');
  check('service: the device runner shows the job in job mode', /Service job J-2026-0001 · Before tests/.test(await page.locator('#dev-job-badge').innerText()));
  await answerChecklist(page, ['ok', 'problem', 'ok']);
  await shot(page, 'service-job-mode-dark');
  await page.click('#dev-run-done');
  await page.waitForSelector('#svc-results-before');
  check('service: AC-2 result linked as before and the job reopens on Before', (await page.evaluate(() => window.__svc.results.filter(r => r.phase === 'before').length)) === 1 && /FAIL/.test(await page.locator('#svc-results-before').innerText()));

  // AC-3 work log
  await page.click('[data-step="work"]');
  await page.waitForSelector('#svc-part-name');
  await page.fill('#svc-part-name', 'Crossfader <Innofader>');
  await page.fill('#svc-part-qty', '2');
  await page.fill('#svc-part-cost', '12.5');
  await page.click('#svc-part-add');
  await page.waitForFunction(() => /Innofader/.test(document.getElementById('svc-parts')?.innerText || ''));
  await page.fill('#svc-labour-desc', 'Clean and lube');
  await page.fill('#svc-labour-min', '30');
  await page.click('#svc-labour-add');
  await page.waitForFunction(() => /Labour 0\.5 h/.test(document.getElementById('svc-totals')?.innerText || ''));
  await page.fill('#svc-note', 'Ch2 fader replaced');
  await page.locator('#svc-note').press('Control+Enter');
  await page.waitForSelector('#svc-notes [data-note]');
  check('service: AC-3 totals are informational (labour hours, parts cost, not an invoice)', /Labour 0\.5 h · 1 part · parts 25\.00\. Informational totals, not an invoice\./.test(await page.locator('#svc-totals').innerText()));
  check('service: Ctrl+Enter saves a note', await page.evaluate(() => window.__svc.log.some(l => l.kind === 'note' && l.description === 'Ch2 fader replaced')));
  await page.click('[data-amend]');
  await page.fill('#svc-note', 'Ch2 and ch3 faders replaced');
  await page.click('#svc-note-save');
  await page.waitForFunction(() => /amended, see later entry/.test(document.getElementById('svc-notes')?.innerText || ''));
  check('service: an edited note is a new entry marked amended; the original is kept', await page.evaluate(() => window.__svc.log.filter(l => l.kind === 'note').length === 2 && !!window.__svc.log.find(l => l.amendsId)));
  await shot(page, 'service-work-dark');

  // statuses to testing
  for (const s of ['repairing', 'testing']) {
    await page.click(`[data-status-to="${s}"]`);
    await page.waitForFunction(st => new RegExp(st, 'i').test(document.getElementById('svc-job-status')?.innerText || ''), s);
  }

  // AC-4 after tests + comparison (partial state from injected measurement values)
  await page.evaluate(() => {
    const v = (phase, k, value) => ({ phase, metricKey: k, label: k, value, unit: 'dB', uncertainty: 0.1, methodKey: k, methodVersion: 1, at: '2026-10-10T10:00:00Z', source: 'session' });
    const before = Array.from({ length: 8 }, (_, i) => v('before', `m${i}`, i));
    const after = before.slice(0, 5).map(x => ({ ...x, phase: 'after', value: x.value + 0.05 }));
    window.__svc.extraValues[window.__svc.jobs[0].id] = [...before, ...after];
  });
  await page.click('[data-step="after"]');
  await page.waitForSelector('#svc-plan-after');
  check('service: after plan preselects the tests run before', await page.locator('[data-plan-test="djma9-knobs"]').isChecked());
  await page.click('#svc-run-after');
  await answerChecklist(page, ['ok', 'ok', 'ok']);
  await page.click('#dev-run-done');
  await page.waitForSelector('#svc-compare-tests');
  check('service: AC-4 test headline shows Fail → Pass', /Fail → Pass.*Knobs/is.test(await page.locator('#svc-headline').innerText()));
  check('service: partial state "Compare is incomplete, 3 of 8 metrics have no after value"', /Compare is incomplete, 3 of 8 metrics have no after value/.test(await page.locator('#svc-partial').innerText()));
  check('service: comparison table has a caption and unchanged-within-uncertainty rows', (await page.locator('#svc-compare-table caption').count()) === 1 && /Unchanged within uncertainty/i.test(await page.locator('#svc-compare-table').innerText()));
  await shot(page, 'service-compare-dark');

  // ready, AC-5 sheet
  await page.click('[data-status-to="ready"]');
  await page.waitForFunction(() => /Ready/.test(document.getElementById('svc-job-status')?.innerText || ''));
  await page.click('[data-step="sheet"]');
  await page.waitForSelector('#svc-sheet-preview');
  const prev = () => page.locator('#svc-sheet-preview').innerText();
  check('service: AC-5 sheet shows fault, before/after, work log, signature line and the disclaimer', await prev().then(t => /Reported fault/.test(t) && /Before and after/.test(t) && /Parts/.test(t) && /Technician signature/.test(t) && /Measurements are indicative bench results, not a warranty\./.test(t)));
  check('service: AC-5 no prices and no customer by default', await prev().then(t => !/Unit cost/.test(t) && !/Zebedee/.test(t)));
  await page.check('#svc-sheet-costs');
  check('service: Include costs adds prices', /25\.00/.test(await prev()));
  await page.check('#svc-sheet-customer');
  check('service: Include customer details adds the customer', /Zebedee <Pii>/.test(await prev()));
  await page.uncheck('#svc-sheet-customer');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#svc-sheet-html')]);
  const html = fs.readFileSync(await dl.path(), 'utf8');
  check('service: sheet exports to HTML with escaped free text', /job-sheet-J-2026-0001\.html$/.test(dl.suggestedFilename()) && html.includes('&lt;b&gt;loud&lt;/b&gt;') && !html.includes('<b>loud</b>') && html.includes('Crossfader &lt;Innofader&gt;'));
  check('service: exported sheet carries no customer details when not ticked', !html.includes('Zebedee') && !html.includes('7700'));
  const audit = await a11yAudit(page);
  check('service: a11y names and target sizes on the sheet step', !audit.unnamed.length, [...audit.unnamed].slice(0, 3).join(' | '));
  await shot(page, 'service-sheet-dark');

  // AC-7 cancel = read-only, delete by job number
  await page.locator('#main').focus().catch(() => {});
  await page.keyboard.press('Escape');
  await page.waitForSelector('#svc-jobs');
  check('service: list shows the job with a status word', /J-2026-0001/.test(await page.locator('#svc-jobs').innerText()) && /Ready/.test(await page.locator('#svc-jobs').innerText()));
  await page.keyboard.press('Control+j');
  await page.waitForSelector('#svc-new-form');
  await page.fill('#svc-cust-name', 'Second Customer');
  await page.waitForSelector('#svc-unit option[value="asset-pioneer-djm-a9"]', { state: 'attached' });
  await page.selectOption('#svc-unit', 'asset-pioneer-djm-a9');
  await page.fill('#svc-fault', 'No power');
  await page.click('#svc-new-save');
  await page.waitForSelector('#svc-job-title');
  await page.click('[data-status-to="cancelled"]');
  await page.click('#confirm-ok');
  await page.waitForSelector('#svc-readonly');
  check('service: AC-7 a cancelled job is read-only and offers Reopen', /read-only/.test(await page.locator('#svc-readonly').innerText()) && (await page.locator('[data-status-to="diagnosing"]').innerText()) === 'Reopen');
  await page.click('[data-step="work"]');
  check('service: AC-7 read-only job hides the work forms', (await page.locator('#svc-part-name').count()) === 0);
  await page.click('#svc-delete');
  await page.waitForSelector('#svc-delete-dialog[open]');
  await page.fill('#svc-del-confirm', 'J-2026-0002');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#svc-delete-dialog', { state: 'detached' });
  check('service: Esc in the delete dialog keeps the job even with the number typed', (await page.evaluate(() => window.__svc.jobs.length)) === 2);
  await page.click('#svc-delete');
  await page.waitForSelector('#svc-delete-dialog[open]');
  check('service: deleting a customer\'s only job offers to erase their details (ticked)', await page.locator('#svc-del-customer').isChecked());
  await page.fill('#svc-del-confirm', 'J-2026-0001');
  check('service: AC-7 delete stays disabled until the job number is typed', await page.locator('#svc-del-ok').isDisabled());
  await page.fill('#svc-del-confirm', 'J-2026-0002');
  await page.click('#svc-del-ok');
  await page.waitForSelector('#svc-jobs');
  check('service: AC-7 job deleted after typing its number', (await page.evaluate(() => window.__svc.jobs.length)) === 1);
  check('service: the customer of the deleted job is erased; the other customer stays', await page.evaluate(() => window.__svc.customers.map(c => c.name).join('|')) === 'Zebedee <Pii>');

  // filter chips + search
  await page.click('[data-filter="cancelled"]');
  await page.waitForSelector('#svc-empty');
  check('service: status filter chips filter the list', /No jobs match/.test(await page.locator('#svc-empty').innerText()));
  await page.click('[data-filter="all"]');
  await page.waitForSelector('#svc-jobs');
  const stored = await page.evaluate(() => localStorage.getItem('deckchek.ui.v1'));
  check('service: only the status filter is kept in UI settings (no customer data)', /"serviceList":\{"status":"all"\}/.test(stored) && !/Zebedee|7700|zeb@/.test(stored));
  await shot(page, 'service-list-dark');
  await ctx.close();

  return errors.flat();
}
