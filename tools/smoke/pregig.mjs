// FS-10 smoke: Pre-gig check. Flag off = hidden; browser mode = honest "needs the desktop app" run; desktop mode with an
// in-memory implementation of the pregig_* commands and a synthetic quadrature timecode capture covers: one-button Start,
// the live checklist, the manual headphone prompt, the honest deck B "coming next" state (input pair 3-4 cannot be captured
// yet, so it is neither a failure nor a pass), a RED verdict with fix-it buttons, single-step re-run and the merged verdict,
// comparison with the previous run, history + compare, Esc cancel, the preset editor, orchestration overhead, and both themes.
import { watchConsole, tauriMock, a11yAudit, setViewport } from './core.mjs';

const FLAG_ON = () => { localStorage.setItem('deckchek.ui.v1', JSON.stringify({ features: { pregig: true } })); };

// Desktop mode: tauriMock plus the pregig commands, a good-rig fixture and a quadrature capture. `window.__pg` steers it.
export function pregigMock() {
  const core = window.__TAURI__.core; const base = core.invoke;
  const pg = { rightMuted: false, listDelayMs: 0, runs: [], presets: [], calls: [], midi: ['XONE:23C'], crash: false };
  window.__pg = pg;
  // Shrink the 5 s capture wait so the smoke run is quick (other timers are left alone).
  const realSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...rest) => realSetTimeout(fn, ms === 5000 || ms === 3000 ? 60 : ms, ...rest);
  const sr = 48000;
  let n = 0; const id = p => `${p}-${++n}`;
  const quadrature = (seconds, hz) => {
    const len = Math.floor(seconds * sr), l = new Array(len), r = new Array(len);
    for (let i = 0; i < len; i++) { const ph = 2 * Math.PI * hz * i / sr; l[i] = .4 * Math.sin(ph); r[i] = pg.rightMuted ? 0 : .4 * Math.cos(ph); }
    return { l, r };
  };
  let capturing = false;
  core.invoke = async (cmd, args = {}) => {
    if (cmd === 'list_native_audio_inputs') { if (pg.listDelayMs) await new Promise(res => realSetTimeout(res, pg.listDelayMs)); return [{ name: 'Traktor Audio 8 DJ (In 1/2)', isDefault: true }]; }
    if (cmd === 'start_live_capture') { pg.calls.push(cmd); capturing = true; return { deviceName: 'Traktor Audio 8 DJ', sampleRate: sr, channels: 2, maxSeconds: 8 }; }
    if (cmd === 'stop_live_capture') {
      capturing = false; const { l, r } = quadrature(5, 2500);
      return { payload: { deviceName: 'Traktor Audio 8 DJ', sampleRate: sr, channels: 2, left: l, right: r, streamErrors: [] }, quality: { framesCaptured: l.length, overrunSamples: 0 } };
    }
    if (cmd === 'midi_list_ports') return { inputs: pg.midi.map((name, index) => ({ index, name })), outputs: [] };
    if (cmd === 'pregig_processes') return { supported: true, scannedAt: new Date().toISOString(), apps: [{ app: 'Traktor Pro', running: true, exe: 'Traktor.exe', pid: 4242, version: null }] };
    if (cmd === 'system_scan_drivers') return { supported: true, scannedAt: new Date().toISOString(), errors: [], drivers: [{ deviceName: 'Traktor Audio 8 DJ', deviceClass: 'MEDIA', manufacturer: 'Native Instruments', driverProvider: 'Native Instruments', driverVersion: '5.0.0.0', driverDate: '2026-01-10T00:00:00Z', infName: 'oem9.inf', hardwareId: 'USB\\VID_17CC&PID_1210', status: 'OK', isSigned: true, signer: 'Native Instruments', problemCode: 0, present: true },
      { deviceName: 'XONE:23C USB', deviceClass: 'MEDIA', manufacturer: 'Allen & Heath', driverProvider: 'Allen & Heath', driverVersion: '2.9.95.2', driverDate: '2025-06-10T00:00:00Z', infName: 'oem10.inf', hardwareId: 'USB\\VID_22F0&PID_0008', status: 'OK', isSigned: true, signer: 'Allen & Heath', problemCode: 0, present: true }],
      asioDrivers: [{ name: 'XONE:23C USB ASIO driver', clsid: '{9C5E8E3B-0000-4A5F-9F3A-000000000011}', dllPath: 'C:\\Program Files\\AH\\x23c.dll', dllExists: true, signatureStatus: 'Valid', signer: 'Allen & Heath' },
        { name: 'Traktor Audio 8 DJ ASIO Driver', clsid: '{9C5E8E3B-0000-4A5F-9F3A-000000000012}', dllPath: 'C:\\Program Files\\NI\\a8.dll', dllExists: true, signatureStatus: 'Valid', signer: 'Native Instruments' }] };
    if (cmd === 'system_scan_events') return { supported: true, scannedAt: new Date().toISOString(), days: args.days, errors: [], events: [] };
    if (cmd === 'system_scan_dj_logs') {
      return { supported: true, scannedAt: new Date().toISOString(), errors: [], apps: [{ app: 'Traktor Pro', exeNames: ['Traktor.exe'], installed: true, locations: [], files: pg.crash ? [{ path: 'C:\\Users\\dj\\Crash\\Traktor.dmp', kind: 'crashDump', modified: new Date(Date.now() - 1800e3).toISOString(), sizeBytes: 1000, matches: [], tail: [] }] : [] }] };
    }
    if (cmd.startsWith('pregig_')) {
      pg.calls.push(cmd);
      if (cmd === 'pregig_save_run') { const row = { id: id('run'), ...args.run, stepCount: args.run.steps.length, failCount: args.run.steps.filter(s => s.state === 'fail' || s.state === 'error').length, warnCount: args.run.steps.filter(s => s.state === 'warn').length }; pg.runs.unshift(row); return { id: row.id }; }
      if (cmd === 'pregig_list_runs') return pg.runs.filter(r => args.presetId == null || r.presetId === args.presetId).slice(0, args.limit || 50).map(({ steps, ...r }) => r);
      if (cmd === 'pregig_get_run') { const r = pg.runs.find(x => x.id === args.id); if (!r) return null; const { steps, ...run } = r; return { run, steps: steps.map((s, i) => ({ id: `${r.id}-${i}`, runId: r.id, ...s })) }; }
      if (cmd === 'pregig_preset_list') return pg.presets;
      if (cmd === 'pregig_preset_upsert') { const p = args.preset; const row = { id: p.id || id('preset'), name: p.name, builtin: false, setupId: null, json: p.json, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; pg.presets = [...pg.presets.filter(x => x.id !== row.id), row]; return row; }
      if (cmd === 'pregig_preset_delete') { const had = pg.presets.length; pg.presets = pg.presets.filter(x => x.id !== args.id); return had !== pg.presets.length; }
    }
    return base(cmd, args);
  };
}

const TRAKTOR = 'builtin-technics-audio8-traktor-mk2';

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  const shot = async (page, name) => { await page.waitForTimeout(200); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const open = async (ctx, label) => {
    const page = await ctx.newPage();
    errors.push(...watchConsole(page, label));
    await page.goto(base);
    await page.waitForSelector('.rail-item[data-screen="pregig"]');
    await page.click('.rail-item[data-screen="pregig"]');
    await page.waitForSelector('#pg-start');
    return page;
  };
  const finish = page => page.waitForSelector('#pg-verdict', { timeout: 20000 });
  const textOf = (page, sel) => page.locator(sel).first().innerText();

  // ----- flag off -----
  const off = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const po = await off.newPage();
  errors.push(...watchConsole(po, 'pregig-off'));
  await po.goto(base);
  await po.waitForSelector('.rail-item');
  check('pregig: flag off hides the Pre-gig check screen', (await po.locator('.rail-item[data-screen="pregig"]').count()) === 0);
  await off.close();

  // ----- browser mode: an honest, partial run -----
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await bctx.addInitScript(FLAG_ON);
  const pb = await open(bctx, 'pregig-browser');
  check('pregig: browser mode says most checks need the desktop app', /desktop app/i.test(await textOf(pb, '#pg-browser-note')));
  check('pregig: three built-in rigs listed', (await pb.locator('#pg-preset option').count()) === 3);
  await pb.click('#pg-start');
  await pb.waitForSelector('.pg-prompt');
  await pb.keyboard.press('s');
  await finish(pb);
  const bv = await pb.locator('#pg-verdict').getAttribute('data-verdict');
  check('pregig: browser run is incomplete, never green', bv === 'incomplete' || bv === 'red', bv);
  check('pregig: browser run keeps a saved history entry', await pb.evaluate(() => JSON.parse(localStorage.getItem('deckchek.pregig.runs.v1') || '[]').length === 1));
  await bctx.close();

  // ----- desktop mode -----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(tauriMock); await ctx.addInitScript(pregigMock); await ctx.addInitScript(FLAG_ON);
  const page = await open(ctx, 'pregig-desktop');
  check('pregig: no browser-preview note on desktop', (await page.locator('#pg-browser-note').count()) === 0);
  check('pregig: idle screen lists the steps to run', (await page.locator('#pg-checklist input[type=checkbox]').count()) >= 7);
  check('pregig: Start button is large (>= 44 px)', (await page.locator('#pg-start').boundingBox()).height >= 44);
  check('pregig: estimate shown before starting', /About .*s/.test(await textOf(page, '#pg-estimate')));
  await shot(page, 'pregig-idle-dark');
  const idleAudit = await a11yAudit(page);
  check('pregig: a11y names + target sizes (idle)', !idleAudit.unnamed.length && !idleAudit.small.length, [...idleAudit.unnamed, ...idleAudit.small].slice(0, 3).join(' | '));

  // Run 1: good rig, deck A fine, deck B on inputs 3-4.
  const t0 = Date.now();
  await page.keyboard.press('Control+g');
  await page.waitForSelector('#pg-cancel');
  check('pregig: Ctrl+G starts and shows a live checklist with Cancel', await page.locator('#pg-checklist .pg-row').count() >= 7);
  await page.waitForSelector('.pg-prompt', { timeout: 20000 });
  check('pregig: manual headphone prompt appears inline', /Do you hear it clearly/.test(await textOf(page, '.pg-prompt')));
  await shot(page, 'pregig-running-dark');
  await page.keyboard.press('y');
  await finish(page);
  const orchestrationMs = Date.now() - t0;
  const v1 = page.locator('#pg-verdict');
  check('pregig: deck B on inputs 3-4 gives an incomplete (not red, not green) verdict', (await v1.getAttribute('data-verdict')) === 'incomplete' && (await v1.getAttribute('data-level')) === 'amber', await v1.getAttribute('data-verdict'));
  const rowB = page.locator('.pg-row[data-step="timecode:B"]');
  check('pregig: deck B timecode row says "Coming next"', /Coming next/i.test(await rowB.innerText()) && /multichannel capture/i.test(await rowB.innerText()));
  check('pregig: deck B rows are skipped, never failed', (await page.locator('.pg-row[data-step$=":B"][data-state="fail"]').count()) === 0 && (await rowB.getAttribute('data-state')) === 'skipped' && (await rowB.getAttribute('data-reason')) === 'input-pair');
  check('pregig: verdict explains deck B was not measured', /deck B/i.test(await textOf(page, '#pg-verdict')) && /coming next/i.test(await textOf(page, '#pg-verdict')));
  check('pregig: deck A timecode and signal pass', (await page.locator('.pg-row[data-step="timecode:A"]').getAttribute('data-state')) === 'pass' && (await page.locator('.pg-row[data-step="signal:A"]').getAttribute('data-state')) === 'pass',
    `${await page.locator('.pg-row[data-step="timecode:A"]').innerText()} || ${await page.locator('.pg-row[data-step="signal:A"]').innerText()}`);
  check('pregig: audio, MIDI, software and system rows pass', (await page.locator('.pg-row[data-state="pass"]').count()) >= 5, await page.locator('.pg-row').evaluateAll(rs => rs.map(r => `${r.dataset.step}:${r.dataset.state}`).join(',')));
  check('pregig: orchestration with mocked captures stays under 5 s plus waits', orchestrationMs < 8000, `${orchestrationMs} ms`);
  check('pregig: run saved to history', (await page.evaluate(() => window.__pg.runs.length)) === 1);
  check('pregig: first run has no comparison yet', (await page.locator('#pg-compare').count()) === 0);
  check('pregig: verdict announced in the live region', (await page.locator('#pg-verdict').getAttribute('aria-live')) === 'polite');
  await shot(page, 'pregig-incomplete-dark');
  await page.locator('.pg-row[data-step="timecode:A"] button:has-text("Details")').click();
  check('pregig: details show measured evidence', /Signal to noise/.test(await textOf(page, '.pg-row[data-step="timecode:A"] .pg-evidence')));
  const doneAudit = await a11yAudit(page);
  check('pregig: a11y names + target sizes (result)', !doneAudit.unnamed.length && !doneAudit.small.length, [...doneAudit.unnamed, ...doneAudit.small].slice(0, 3).join(' | '));

  // Run 2: right channel unplugged -> RED with fix-it buttons.
  await page.evaluate(() => { window.__pg.rightMuted = true; });
  await page.click('#pg-run-again');
  await page.waitForSelector('.pg-prompt', { timeout: 20000 });
  await page.click('.pg-prompt [data-answer="skip"]');
  await page.waitForFunction(() => document.querySelector('#pg-verdict')?.dataset.verdict === 'red', null, { timeout: 20000 });
  check('pregig: muted right channel gives RED "Not ready"', /Not ready/.test(await textOf(page, '#pg-verdict')));
  check('pregig: fix-first list names the problem decks with fix text', await page.locator('#pg-fixfirst .pg-fixitem').count() >= 2 && /cable|RCA|needle/i.test(await textOf(page, '#pg-fixfirst')));
  check('pregig: fix-it actions are real buttons', (await page.locator('#pg-fixfirst button[data-fix]').count()) >= 1);
  check('pregig: comparison with the previous run shows changed steps getting worse', (await page.locator('#pg-compare [data-trend="worse"]').count()) >= 2);
  await shot(page, 'pregig-red-dark');

  // Fix the cable, re-run one step with the fix button.
  await page.evaluate(() => { window.__pg.rightMuted = false; });
  await page.locator('.pg-row[data-step="signal:A"] [data-rerun]').click();
  await page.waitForFunction(() => document.querySelector('.pg-row[data-step="signal:A"]')?.dataset.state === 'pass', null, { timeout: 20000 });
  check('pregig: re-running one step updates only that step', (await page.locator('.pg-row[data-step="timecode:A"]').getAttribute('data-state')) === 'fail' && (await page.locator('.pg-row[data-step="signal:A"]').getAttribute('data-state')) === 'pass');
  await page.click('#pg-rerun-failed');
  await page.waitForFunction(() => document.querySelector('#pg-verdict')?.dataset.verdict === 'incomplete', null, { timeout: 20000 });
  check('pregig: re-run of problem steps merges into a new verdict', (await page.locator('.pg-row[data-step="timecode:A"]').getAttribute('data-state')) === 'pass');
  check('pregig: re-runs are saved to history', (await page.evaluate(() => window.__pg.runs.length)) >= 4);

  // History + compare.
  await page.click('#pg-tab-history');
  await page.waitForSelector('#pg-history .pg-hist');
  const histCount = await page.locator('#pg-history .pg-hist').count();
  check('pregig: history lists every run with a verdict chip', histCount >= 4 && (await page.locator('#pg-history .pg-hist .chip').count()) === histCount);
  await page.locator('#pg-history .pg-hist').nth(2).locator('[data-act="compare"]').click();
  await page.waitForSelector('#pg-compare');
  check('pregig: history compare shows what changed vs the latest', /changed|Nothing changed/.test(await textOf(page, '#pg-compare')));
  await page.locator('#pg-history .pg-hist').first().locator('[data-act="details"]').click();
  check('pregig: history details list steps with the deck B note', /Needs multichannel|input pair/i.test(await textOf(page, '#pg-history .pg-hist-steps')));
  await shot(page, 'pregig-history-dark');

  // Esc cancels a running check; partial results are kept.
  await page.click('#pg-tab-check');
  await page.evaluate(() => { window.__pg.listDelayMs = 800; });
  await page.click('#pg-back');
  await page.click('#pg-start');
  await page.waitForSelector('#pg-cancel');
  await page.keyboard.press('Escape');
  await finish(page);
  check('pregig: Esc cancels and keeps partial results', (await page.locator('#pg-verdict').getAttribute('data-verdict')) === 'cancelled' && /Cancelled/.test(await textOf(page, '#pg-verdict')));
  await page.evaluate(() => { window.__pg.listDelayMs = 0; });

  // Crash in the last hour -> software red (a failure unrelated to captures).
  await page.evaluate(() => { window.__pg.crash = true; });
  await page.click('#pg-back');
  await page.click('#pg-start');
  await page.waitForSelector('.pg-prompt', { timeout: 20000 });
  await page.keyboard.press('n');
  await finish(page);
  check('pregig: headphone "No" is a failure with a cue-path fix', (await page.locator('.pg-row[data-step="headphones"]').getAttribute('data-state')) === 'fail' && /cue|headphone/i.test(await textOf(page, '#pg-fixfirst')));
  check('pregig: software crash within the hour is a failure', (await page.locator('.pg-row[data-step="software"]').getAttribute('data-state')) === 'fail');
  await page.evaluate(() => { window.__pg.crash = false; });

  // Presets: create, list, duplicate, delete.
  await page.click('#pg-tab-presets');
  await page.click('#pg-new');
  await page.waitForSelector('dialog.pg-dialog[open]');
  await page.click('dialog.pg-dialog [data-action="save"]');
  check('pregig: preset editor validates before saving', /name|audio interface/i.test(await textOf(page, '.pg-form-errors')));
  await page.fill('#pg-f-name', 'Smoke rig');
  await page.fill('#pg-f-device', 'Smoke Interface');
  await page.fill('#pg-f-software', 'Serato DJ Pro');
  await page.click('dialog.pg-dialog [data-action="save"]');
  await page.waitForSelector('.pg-preset[data-preset] >> text=Smoke rig');
  check('pregig: saved preset is listed as Yours', (await page.locator('.pg-preset:has-text("Smoke rig") .pg-preset-tag').innerText()) === 'Yours' && (await page.evaluate(() => window.__pg.presets.length)) === 1);
  await page.locator('.pg-preset:has-text("Smoke rig") [data-act="duplicate"]').click();
  await page.waitForSelector('.pg-preset:has-text("Smoke rig (copy)")');
  await page.locator('.pg-preset:has-text("(copy)") [data-act="delete"]').click();
  await page.click('#confirm-ok');
  await page.waitForFunction(() => document.querySelectorAll('.pg-preset').length === 4);
  check('pregig: duplicate then delete leaves the original', (await page.evaluate(() => window.__pg.presets.length)) === 1);
  await page.locator(`.pg-preset[data-preset="${TRAKTOR}"] [data-act="edit"]`).click();
  await page.waitForSelector('dialog.pg-dialog[open]');
  check('pregig: editing a built-in preset edits a copy', /copy/i.test(await textOf(page, 'dialog.pg-dialog h2')));
  await page.keyboard.press('Escape');

  // Light theme screenshots.
  await page.click('#pg-tab-check');
  await page.evaluate(() => { window.__pg.rightMuted = true; });
  await page.click('#theme-toggle');
  await page.click('#pg-back').catch(() => {});
  await page.click('#pg-start');
  await page.waitForSelector('.pg-prompt', { timeout: 20000 });
  await page.keyboard.press('y');
  await finish(page);
  await shot(page, 'pregig-red-light');
  await page.evaluate(() => { window.__pg.rightMuted = false; });
  await page.click('#pg-run-again');
  await page.waitForSelector('.pg-prompt', { timeout: 20000 });
  await page.keyboard.press('y');
  await page.waitForFunction(() => document.querySelector('#pg-verdict')?.dataset.verdict === 'incomplete', null, { timeout: 20000 });
  await shot(page, 'pregig-incomplete-light');
  await page.click('#pg-back');
  await shot(page, 'pregig-idle-light');
  // narrow window
  await setViewport(page, { width: 420, height: 900 });
  check('pregig: no horizontal scroll at phone width', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot(page, 'pregig-narrow-light');
  await ctx.close();
  return errors;
}
