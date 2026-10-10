// FS-07 smoke: external-link interception, confirm dialog, blocked toast, copy, desktop invoke routing.
import { tauriMock, watchConsole } from './core.mjs';

export default async function run({ browser, base, check }) {
  const errors = [];

  // ----- browser mode -----
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript(() => { window.__opened = []; window.open = (...a) => { window.__opened.push(a); return null; }; });
  const page = await context.newPage();
  errors.push(...watchConsole(page, 'links-browser'));
  await page.goto(base);
  await page.waitForSelector('.rail-item');
  await page.waitForFunction(() => document.querySelector('#toasts') && typeof window.open === 'function');
  await page.waitForTimeout(400); // interceptor is installed by a dynamic import
  const opened = () => page.evaluate(() => window.__opened.map(a => a.slice(0, 3)));
  const settle = () => page.waitForTimeout(650); // > 500 ms debounce
  const add = async (href, id) => { await page.evaluate(([h, i]) => { const a = document.createElement('a'); a.href = h; a.id = i; a.textContent = i; a.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;background:#fff;color:#000;padding:4px'; document.querySelectorAll('[id^="smk-"]').forEach(x => x.remove()); document.body.append(a); }, [href, id]); };

  await add('https://github.com/circuitdriftlabs', 'smk-ok');
  await page.click('#smk-ok');
  const o1 = await opened();
  check('links: allowlisted https link opens with noopener, no dialog', o1.length === 1 && o1[0][0] === 'https://github.com/circuitdriftlabs' && o1[0][2] === 'noopener,noreferrer' && !(await page.locator('dialog.link-confirm[open]').count()));
  check('links: webview did not navigate', page.url().startsWith(base));

  await settle();
  await add('https://example.org/some/path?q=1', 'smk-ask');
  await page.click('#smk-ask');
  await page.waitForSelector('dialog.link-confirm[open]');
  const dlgText = await page.locator('dialog.link-confirm').innerText();
  check('links: non-allowlisted shows host and full URL', /example\.org/.test(dlgText) && /https:\/\/example\.org\/some\/path\?q=1/.test(dlgText) && /hasn.t verified/.test(dlgText));
  check('links: Cancel has default focus', (await page.evaluate(() => document.activeElement?.textContent)) === 'Cancel');
  check('links: dialog is named and described', await page.evaluate(() => { const d = document.querySelector('dialog.link-confirm'); return !!document.getElementById(d.getAttribute('aria-labelledby')) && !!document.getElementById(d.getAttribute('aria-describedby')); }));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.link-confirm'));
  check('links: Esc/Cancel opens nothing', (await opened()).length === 1);

  await settle();
  await page.click('#smk-ask');
  await page.waitForSelector('dialog.link-confirm[open]');
  await page.click('dialog.link-confirm button[value="copy"]');
  await page.waitForFunction(() => !document.querySelector('dialog.link-confirm'));
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  check('links: Copy link puts the URL on the clipboard', clip === 'https://example.org/some/path?q=1', String(clip));

  await settle();
  await page.click('#smk-ask');
  await page.waitForSelector('dialog.link-confirm[open]');
  await page.click('dialog.link-confirm button[value="open"]');
  await page.waitForFunction(() => !document.querySelector('dialog.link-confirm'));
  check('links: Open requires an explicit click and then opens', (await opened()).length === 2);

  await settle();
  await page.click('#smk-ask');
  await page.waitForSelector('dialog.link-confirm[open]');
  await page.check('dialog.link-confirm input[type="checkbox"]');
  await page.click('dialog.link-confirm button[value="open"]');
  await page.waitForFunction(() => !document.querySelector('dialog.link-confirm'));
  await settle();
  await page.click('#smk-ask');
  await page.waitForTimeout(200);
  check('links: "Always allow" skips the dialog for the rest of the session', !(await page.locator('dialog.link-confirm').count()) && (await opened()).length === 4);

  await settle();
  await add('http://github.com/insecure', 'smk-http');
  await page.click('#smk-http');
  await page.waitForSelector('.toast');
  check('links: http link is blocked with a toast', /Blocked unsafe link/.test(await page.locator('#toasts').innerText()) && (await opened()).length === 4);

  await settle();
  await add('https://github.com/ctrl', 'smk-ctrl');
  await page.click('#smk-ctrl', { modifiers: ['Control'] });
  await settle();
  await page.click('#smk-ctrl', { button: 'middle' });
  const o3 = await opened();
  check('links: Ctrl+click and middle-click use the same path', o3.length === 6 && o3.slice(4).every(a => a[0] === 'https://github.com/ctrl'));

  await page.evaluate(() => { window.__before = window.__opened.length; });
  await settle();
  await page.evaluate(() => window.open('https://github.com/via-window-open'));
  await page.waitForTimeout(150);
  const viaWin = await page.evaluate(() => window.__opened.at(-1)?.[0]);
  check('links: window.open is routed through the same handler', viaWin === 'https://github.com/via-window-open');
  await page.close();
  await context.close();

  // ----- desktop mode (mocked invoke) -----
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await dctx.addInitScript(tauriMock);
  await dctx.addInitScript(() => {
    const real = window.__TAURI__.core.invoke;
    window.__calls = [];
    window.__mode = 'ok';
    window.__TAURI__.core.invoke = async (cmd, args) => {
      if (cmd !== 'open_external_url') return real(cmd, args);
      window.__calls.push(args);
      if (window.__mode === 'fail') return { opened: false, reason: 'error', host: 'github.com', allowlisted: true };
      const allow = /^https:\/\/github\.com\//.test(args.url);
      if (allow || args.confirmed) return { opened: true, host: new URL(args.url).hostname, allowlisted: allow };
      return { opened: false, reason: 'needs_confirm', host: new URL(args.url).hostname, allowlisted: false };
    };
  });
  const dpage = await dctx.newPage();
  errors.push(...watchConsole(dpage, 'links-desktop'));
  await dpage.goto(base);
  await dpage.waitForSelector('.rail-item');
  await dpage.waitForTimeout(500);
  const dadd = async (href, id) => dpage.evaluate(([h, i]) => { const a = document.createElement('a'); a.href = h; a.id = i; a.textContent = i; a.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;background:#fff;color:#000;padding:4px'; document.querySelectorAll('[id^="smk-"]').forEach(x => x.remove()); document.body.append(a); }, [href, id]);
  const calls = () => dpage.evaluate(() => window.__calls);

  await dadd('https://github.com/x', 'smk-d1');
  await dpage.click('#smk-d1');
  await dpage.waitForTimeout(150);
  const c1 = await calls();
  check('links(desktop): allowlisted link calls open_external_url once, unconfirmed', c1.length === 1 && c1[0].confirmed === false && c1[0].url === 'https://github.com/x');

  await dpage.waitForTimeout(650);
  await dadd('https://example.org/x', 'smk-d2');
  await dpage.click('#smk-d2');
  await dpage.waitForSelector('dialog.link-confirm[open]');
  await dpage.click('dialog.link-confirm button[value="open"]');
  await dpage.waitForFunction(() => !document.querySelector('dialog.link-confirm'));
  const c2 = await calls();
  check('links(desktop): non-allowlisted asks first, then re-invokes with confirmed:true', c2.length === 3 && c2[1].confirmed === false && c2[2].confirmed === true);

  await dpage.waitForTimeout(650);
  await dpage.evaluate(() => { window.__mode = 'fail'; });
  await dadd('https://github.com/fails', 'smk-d3');
  await dpage.click('#smk-d3');
  await dpage.waitForSelector('.toast');
  const dclip = await dpage.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  check('links(desktop): opener failure copies the link and says so', /link copied/.test(await dpage.locator('#toasts').innerText()) && dclip === 'https://github.com/fails', String(dclip));

  await dpage.waitForTimeout(650);
  const before = (await calls()).length;
  await dadd('file:///c:/windows/system32/calc.exe', 'smk-d4');
  await dpage.click('#smk-d4');
  await dpage.waitForTimeout(200);
  check('links(desktop): file: link is blocked before reaching Rust', (await calls()).length === before && /Blocked unsafe link/.test(await dpage.locator('#toasts').innerText()));
  await dctx.close();
  return errors;
}
