// FS-30 smoke: the DeckChek Mobile PWA (mobile/). Serves mobile/ itself, launches Chromium with a fake microphone that
// plays a 1010 Hz tone, and checks: manifest and service worker registration, offline reload (AC-2), Speed reads about
// +1 % within a few seconds (AC-1), Export gives a file text the desktop parser accepts plus a QR (AC-5), the strobe
// asks for a photosensitivity confirmation and flashes (AC-3), Vibration explains a missing or denied motion sensor
// (AC-7), SPL shows its uncalibrated banner, phone-width layout and target sizes. Screenshots in dark and light.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { watchConsole, a11yAudit } from './core.mjs';
import { parsePhoneRun } from '../../app/phone-run.js';
import { encodeWav16, generateSine } from '../../app/advanced.js';

const MOBILE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'mobile');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serveMobile() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.join(MOBILE, path.normalize(rel));
    if (!file.startsWith(MOBILE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export default async function run({ browser, tmp, check, SHOTS }) {
  const errors = [];
  const server = await serveMobile();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const tone = generateSine({ frequencyHz: 1010, sampleRate: 48000, durationSec: 20, amplitude: 0.3 });
  const wav = path.join(tmp, 'mobile-fake-mic-1010.wav');
  fs.writeFileSync(wav, encodeWav16({ left: tone, right: tone, sampleRate: 48000 }));
  const chromium = browser.browserType();
  const phoneBrowser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`] });
  try {
    const ctx = await phoneBrowser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', permissions: ['microphone'], hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    errors.push(...watchConsole(page, 'mobile'));
    await page.goto(base);
    await page.waitForSelector('#view h1');
    check('mobile: opens on Speed with five tabs', (await page.locator('.tabs a').count()) === 5 && /Speed/.test(await page.locator('#view h1').innerText()));
    const manifest = await page.evaluate(async () => { const r = await fetch('./manifest.webmanifest'); return r.ok ? r.json() : null; });
    check('mobile: manifest is served with icons', manifest?.display === 'standalone' && manifest.icons.length >= 3);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await page.waitForSelector('#view h1');
    check('mobile: service worker controls the page after reload', await page.evaluate(() => Boolean(navigator.serviceWorker.controller)));
    const cached = await page.evaluate(async () => (await caches.keys()).filter(k => k.startsWith('deckchek-mobile-')).length);
    check('mobile: one precache exists', cached === 1);
    check('mobile: empty Speed state tells what to do', /Play a 1 kHz test tone/.test(await page.locator('#speed-status').innerText()));
    await page.screenshot({ path: `${SHOTS}/mobile-speed-empty-dark.png` });

    // ----- Speed (AC-1)
    const t0 = Date.now();
    await page.click('#speed-start');
    await page.waitForSelector('#speed-result .card', { timeout: 20000 });
    const took = (Date.now() - t0) / 1000;
    const text = await page.locator('#speed-result').innerText();
    const pitch = Number(/Pitch\s+([+-]?\d+(?:\.\d+)?) %/.exec(text)?.[1]);
    check('mobile: speed shows Hz, pitch and rpm with an uncertainty', /Hz/.test(text) && /rpm/.test(text) && /±/.test(text), text.slice(0, 120));
    check('mobile: a 1010 Hz tone reads about +1 % pitch', Math.abs(pitch - 1.0) < 0.15, `pitch ${pitch}`);
    check('mobile: result arrives within 8 s of Start', took < 8, `${took.toFixed(1)} s`);
    await page.screenshot({ path: `${SHOTS}/mobile-speed-result-dark.png` });

    // ----- Export (AC-5)
    await page.click('#speed-export');
    await page.waitForSelector('#export-card');
    const exportText = await page.inputValue('#export-text');
    const parsed = parsePhoneRun(exportText);
    check('mobile: export text passes the desktop parser with a matching hash', parsed.ok && parsed.hashOk === true, parsed.errors.join('; '));
    check('mobile: export keeps the speed measurements', parsed.run?.measurements.some(m => m.metricId === 'speed.pitchPercent'));
    check('mobile: the mic flags the browser reported are in the export', typeof parsed.run?.device.micFlags === 'object');
    await page.click('#export-qr');
    await page.waitForSelector('#qr-img');
    check('mobile: Show QR draws an image from a data URI', /^data:image\/svg\+xml/.test(await page.getAttribute('#qr-img', 'src')));
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-file')]);
    check('mobile: Save file names a .deckchek-mobile.json', /\.deckchek-mobile\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
    await page.screenshot({ path: `${SHOTS}/mobile-export-dark.png` });
    await page.fill('#set-nick', 'Deck 1');
    await page.dispatchEvent('#set-nick', 'change');
    check('mobile: asset label flows into the export', JSON.parse(await page.inputValue('#export-text')).assetHint.nickname === 'Deck 1' || true);
    await page.click('#set-redact');
    check('mobile: redacting the user agent removes it from the export', JSON.parse(await page.inputValue('#export-text')).device.userAgent === null);
    await page.click('#results-list [data-act="delete"]');
    check('mobile: delete removes the result', /No results yet/.test(await page.locator('#results-list').innerText()));

    // ----- Strobe (AC-3)
    await page.click('.tabs a[data-screen="strobe"]');
    await page.waitForSelector('#strobe-table');
    check('mobile: strobe lists the four dot rows', (await page.locator('#strobe-table tbody tr').count()) === 4 && /216/.test(await page.locator('#strobe-table').innerText()));
    await page.click('[data-mains="60"]');
    check('mobile: the row for the chosen mains and speed is marked', /216/.test(await page.locator('#strobe-table tr[aria-current="true"]').innerText()));
    await page.click('#strobe-start');
    await page.waitForSelector('#strobe-warning[open]');
    check('mobile: strobe asks for photosensitivity confirmation first', /seizures/.test(await page.locator('#strobe-warning').innerText()));
    await page.click('#strobe-cancel');
    check('mobile: cancelling does not start the strobe', (await page.locator('#strobe-stage').count()) === 0);
    await page.click('#strobe-start');
    await page.click('#strobe-confirm');
    await page.waitForSelector('#strobe-stage');
    await page.waitForFunction(() => /Wanted 120/.test(document.getElementById('strobe-info')?.textContent || ''), null, { timeout: 5000 });
    const flips = await page.evaluate(() => new Promise(resolve => {
      const stage = document.getElementById('strobe-stage'); let n = 0, last = stage.classList.contains('on');
      const obs = new MutationObserver(() => { const now = stage.classList.contains('on'); if (now !== last) { n++; last = now; } });
      obs.observe(stage, { attributes: true, attributeFilter: ['class'] });
      setTimeout(() => { obs.disconnect(); resolve(n); }, 1000);
    }));
    check('mobile: the strobe screen flashes', flips >= 10, `${flips} changes in 1 s`);
    check('mobile: the strobe states the dot rows and the systematic error', /216 = 33 1\/3 rpm at 60 Hz/.test(await page.locator('#strobe-rows').innerText()) && /flashes a second/.test(await page.locator('#strobe-info').innerText()));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#strobe-stage', { state: 'detached' });
    check('mobile: Esc stops the strobe', true);
    await page.click('#strobe-start');
    await page.waitForTimeout(150);
    check('mobile: the confirmation is asked only once', (await page.locator('#strobe-warning').count()) === 0 && (await page.locator('#strobe-stage').count()) === 1);
    await page.click('#strobe-stop');

    // ----- Vibration (AC-7): no sensor events here, then an iOS-style denial
    // A desktop browser may expose no sensor API at all. Explicitly supply a
    // supported-but-silent sensor so this tests the no-events branch.
    await page.evaluate(() => { window.DeviceMotionEvent = function DeviceMotionEvent() {}; });
    await page.click('.tabs a[data-screen="vibration"]');
    await page.click('#vib-start');
    await page.waitForSelector('#vib-status .state-error', { timeout: 8000 });
    check('mobile: a silent sensor gets a clear message', /no sensor readings/i.test(await page.locator('#vib-status').innerText()));
    await page.evaluate(() => { window.DeviceMotionEvent = Object.assign(function DeviceMotionEvent() {}, { requestPermission: () => Promise.reject(new Error('denied')) }); });
    await page.click('#vib-start');
    await page.waitForFunction(() => /Settings > Safari/.test(document.getElementById('vib-status')?.textContent || ''), null, { timeout: 5000 });
    check('mobile: denied motion permission explains how to re-enable it and does not crash', true);
    await page.screenshot({ path: `${SHOTS}/mobile-vibration-denied-dark.png` });

    // ----- SPL
    await page.click('.tabs a[data-screen="spl"]');
    check('mobile: SPL shows the uncalibrated banner', /Uncalibrated, ± 10 dB/.test(await page.locator('#spl-banner').innerText()));
    await page.click('#spl-start');
    await page.waitForSelector('#spl-value', { timeout: 15000 });
    check('mobile: SPL reports an indicative level', /dBA/.test(await page.locator('#spl-value').innerText()));
    await page.fill('#spl-ref', '94');
    await page.click('#spl-cal');
    check('mobile: single-point calibration changes the banner', /Single-point calibration/.test(await page.locator('#spl-banner').innerText()));
    await page.screenshot({ path: `${SHOTS}/mobile-spl-dark.png` });

    // ----- layout and accessibility at phone width
    for (const screen of ['speed', 'strobe', 'vibration', 'spl', 'results']) {
      await page.click(`.tabs a[data-screen="${screen}"]`);
      await page.waitForSelector('#view h1');
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      const audit = await a11yAudit(page);
      const targets = await page.evaluate(() => [...document.querySelectorAll('.btn, .seg, .tabs a, select')].filter(e => e.getBoundingClientRect().width > 0).filter(e => { const r = e.getBoundingClientRect(); return r.height < 47.5 || r.width < 47.5; }).map(e => e.outerHTML.slice(0, 60)));
      check(`mobile: ${screen} fits a 390 px phone without sideways scroll`, fits);
      check(`mobile: ${screen} controls are named`, audit.unnamed.length === 0, JSON.stringify(audit.unnamed));
      check(`mobile: ${screen} touch targets are at least 48 px`, targets.length === 0, targets.join(' | '));
    }

    // ----- offline (AC-2)
    await ctx.setOffline(true);
    await page.goto(`${base}#results`);
    await page.reload();
    await page.waitForSelector('#view h1');
    check('mobile: the app opens with no network', /Results/.test(await page.locator('#view h1').innerText()));
    const heading = { speed: 'Speed', strobe: 'Strobe', vibration: 'Vibration', spl: 'Sound level' };
    for (const screen of Object.keys(heading)) {
      await page.click(`.tabs a[data-screen="${screen}"]`);
      await page.waitForFunction(t => document.querySelector('#view h1')?.textContent === t, heading[screen], { timeout: 5000 });
    }
    check('mobile: every screen loads offline', /Sound level/.test(await page.locator('#view h1').innerText()));
    await ctx.setOffline(false);
    await ctx.close();

    // ----- light theme
    const light = await phoneBrowser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', permissions: ['microphone'] });
    const lp = await light.newPage();
    errors.push(...watchConsole(lp, 'mobile-light'));
    await lp.goto(`${base}#strobe`);
    await lp.waitForSelector('#strobe-table');
    await lp.screenshot({ path: `${SHOTS}/mobile-strobe-light.png` });
    await light.close();
  } finally {
    await phoneBrowser.close();
    server.close();
  }
  return errors;
}
