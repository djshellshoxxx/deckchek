// Shared toolbar: internal overlap can exist without document overflow.
// Real browser layout with a modeled native boundary; no hardware qualification.
import path from 'node:path';
import { watchConsole, tauriMock, setViewport } from './core.mjs';

const LONG_INPUT = 'USB audio interface with a long descriptive input device name';
function nativeInputs(name) {
  const original = window.__TAURI__.core.invoke;
  window.__TAURI__.core.invoke = (command, args) => command === 'list_native_audio_inputs'
    ? Promise.resolve([{ name, isDefault: true, maxChannels: 2, defaultChannels: 2 }])
    : original(command, args);
}

async function toolbarGeometry(page) {
  return page.evaluate(() => {
    const ids = ['device-select', 'device-refresh', 'rate-select', 'cal-chip',
      'theme-toggle', 'inspector-toggle', 'helpBtn', 'cdlOptionsBtn'];
    const bounds = element => {
      const r = element.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const header = bounds(document.querySelector('.topbar'));
    const contains = (outer, inner) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 &&
      inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
    const missing = ids.filter(id => !document.getElementById(id));
    const controls = ids.filter(id => !missing.includes(id)).map(id => ({ id, el: document.getElementById(id) }));
    const boxes = controls.map(({ id, el }) => ({ id, ...bounds(el) }));
    const small = boxes.filter(r => r.width < 24 || r.height < 24).map(r => r.id);
    const outside = boxes.filter(r => !contains(header, r) || r.right > innerWidth + 1 || r.left < 0).map(r => r.id);
    const covered = controls.filter(({ el }) => {
      const r = bounds(el), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !hit || (hit !== el && !el.contains(hit));
    }).map(r => r.id);
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push([a.id, b.id]);
    }
    const chip = document.querySelector('#cal-chip .chip'), chipButton = document.getElementById('cal-chip');
    return { missing, small, outside, covered, overlaps,
      chipContained: Boolean(chip && chipButton && contains(bounds(chipButton), bounds(chip))),
      mainBelowHeader: document.getElementById('main').getBoundingClientRect().top >= header.bottom - 1,
      noDocumentOverflow: document.documentElement.scrollWidth <= innerWidth + 1, boxes, header };
  });
}

async function quickSetupGeometry(page) {
  return page.evaluate(() => {
    const main = document.getElementById('main'), screen = document.getElementById('screen-quick');
    if (!main || !screen || screen.hidden) return { ready: false };
    const visible = node => {
      if (!node || !node.getClientRects().length) return false;
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'
        && style.visibility !== 'collapse' && Number(style.opacity) > 0;
    };
    const visibleMatches = selector => [...screen.querySelectorAll(selector)].filter(visible);
    const mainRect = main.getBoundingClientRect(), left = mainRect.left + main.clientLeft, right = left + main.clientWidth;
    const targets = [screen, ...screen.querySelectorAll('.screen-head, .screen-title, .lede, .segmented, .stepper, .step, .setup-grid, .setup-main, .setup-side, .card, .source-choices, .source, .source-text, .drop-label, .field-grid, .field-inline, .step-footer, .btn, .wiring-node')]
      .filter(visible);
    const name = node => node.id || node.className;
    const outside = targets.filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.left < left - 1 || rect.right > right + 1;
    }).map(name);
    const overflow = targets.filter(node => node.scrollWidth > node.clientWidth + 1).map(name);
    const selected = visibleMatches('.step-setup .source[aria-checked="true"]');
    const file = screen.querySelector('#quick-file'), duration = screen.querySelector('#quick-duration');
    return { ready: true, outside, overflow,
      noMainOverflow: main.scrollWidth <= main.clientWidth + 1,
      noScreenOverflow: screen.scrollWidth <= screen.clientWidth + 1,
      sources: visibleMatches('.step-setup .source').length,
      steps: visibleMatches('.stepper .step').length,
      actions: visibleMatches('#quick-analyze, #quick-to-capture').length,
      selectedSource: selected.length === 1 ? selected[0].dataset.source : null,
      fileControl: Boolean(file && file.type === 'file' && !file.disabled && visible(screen.querySelector('label[for="quick-file"]'))),
      liveControl: Boolean(visible(duration) && !duration.disabled && duration.options.length),
      paneWidth: main.clientWidth, screenWidth: screen.clientWidth };
  });
}

const quickFits = (value, source) => value.ready && value.sources === 2 && value.steps === 3 && value.actions === 1
  && value.selectedSource === source && (source === 'file' ? value.fileControl : value.liveControl)
  && value.noMainOverflow && value.noScreenOverflow && !value.outside.length && !value.overflow.length;

export default async function run({ browser, base, check, SHOTS }) {
  const errors = [];
  for (const mode of ['browser', 'native-model']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    try {
      if (mode === 'native-model') await context.addInitScript({
        content: `(${tauriMock.toString()})();\n(${nativeInputs.toString()})(${JSON.stringify(LONG_INPUT)});`,
      });
      const page = await context.newPage(); errors.push(watchConsole(page, `toolbar-${mode}`));
      await page.goto(base);
      await page.waitForSelector('#cdlOptionsBtn');
      await page.waitForSelector('#cal-chip .chip');
      await page.waitForFunction(() => document.getElementById('device-select').options.length > 0);
      if (mode === 'native-model') await page.selectOption('#device-select', LONG_INPUT);
      for (const width of [320, 420, 800, 1440]) {
        await setViewport(page, { width, height: 900 });
        if (mode === 'native-model') await page.click('#screen-quick .source[data-source="live"]');
        await page.evaluate(() => document.getElementById('main').scrollTo({ top: 0, behavior: 'instant' }));
        const geometry = await toolbarGeometry(page);
        check(`toolbar ${mode}: controls remain visible, separate and usable at ${width}px`,
          !geometry.missing.length && !geometry.small.length && !geometry.outside.length &&
          !geometry.covered.length && !geometry.overlaps.length && geometry.chipContained &&
          geometry.mainBelowHeader && geometry.noDocumentOverflow, JSON.stringify(geometry));
        check(`toolbar ${mode}: input and rate keep accessible names at ${width}px`,
          await page.getByRole('combobox', { name: 'Input device', exact: true }).count() === 1 &&
          await page.getByRole('combobox', { name: 'Sample rate', exact: true }).count() === 1);
        if (width === 420 || width === 1440) await page.screenshot({
          path: path.join(SHOTS, `shell-toolbar-${mode}-${width}.png`), fullPage: false,
        });
        const quick = await quickSetupGeometry(page);
        check(`quick setup ${mode}: content fits the actual main pane at ${width}px`, quickFits(quick, mode === 'native-model' ? 'live' : 'file'), JSON.stringify(quick));
        if (width === 320 || width === 420) await page.screenshot({ path: path.join(SHOTS, `quick-setup-${mode}-${width}-top.png`) });
        const primary = page.locator('#quick-analyze, #quick-to-capture');
        await primary.scrollIntoViewIfNeeded();
        const reachable = await primary.evaluate(button => {
          const r = button.getBoundingClientRect(), pane = document.getElementById('main').getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return r.width >= 24 && r.height >= 24 && r.left >= pane.left - 1 && r.right <= pane.right + 1
            && r.top >= pane.top - 1 && r.bottom <= pane.bottom + 1 && Boolean(hit && (hit === button || button.contains(hit)));
        });
        check(`quick setup ${mode}: primary action remains reachable after vertical scrolling at ${width}px`, reachable);
        if (width === 320 || width === 420) await page.screenshot({ path: path.join(SHOTS, `quick-setup-${mode}-${width}-action.png`) });
        if (mode === 'native-model' && width === 420) {
          await page.locator('#screen-quick .source[data-source="live"]').focus();
          await page.keyboard.press('ArrowRight');
          const fileChoice = page.locator('#screen-quick .source[data-source="file"]');
          const changed = await quickSetupGeometry(page);
          check('quick setup: keyboard source change keeps focus and fitting file controls at 420px',
            await fileChoice.getAttribute('aria-checked') === 'true'
            && await fileChoice.evaluate(node => node === document.activeElement) && quickFits(changed, 'file'), JSON.stringify(changed));
        }
      }
    } finally { await context.close(); }
  }
  return errors.flat();
}
