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
      }
    } finally { await context.close(); }
  }
  return errors.flat();
}
