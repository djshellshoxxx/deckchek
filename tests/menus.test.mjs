import test from 'node:test';
import assert from 'node:assert/strict';
import { supportMenuModel, SUPPORT_LINKS, MANUFACTURER_LINKS, DIAGNOSTICS_EVENT } from '../app/ui/menus.js';
import { classifyUrl } from '../app/external-links.js';

test('support entries: Options and Help both dispatch the diagnostics event', () => {
  const m = supportMenuModel();
  assert.equal(DIAGNOSTICS_EVENT, 'deckchek:diagnostics');
  assert.ok(m.options.some(e => e.kind === 'event' && e.event === DIAGNOSTICS_EVENT));
  assert.ok(m.help.some(e => e.kind === 'event' && e.event === DIAGNOSTICS_EVENT));
});

test('every support and manufacturer link is https on the FS-07 allowlist', () => {
  assert.ok(SUPPORT_LINKS.some(l => /\/issues$/.test(l.url)) && SUPPORT_LINKS.some(l => /\/releases$/.test(l.url)));
  for (const l of [...SUPPORT_LINKS, ...MANUFACTURER_LINKS]) {
    const c = classifyUrl(l.url);
    assert.ok(c.ok && c.allowlisted, l.url);
  }
});
