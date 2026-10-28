// AUD-08: the WebView's own context menu on a link offers "Open link in new window", which skips
// the FS-07 URL policy. The interceptor suppresses that menu on links that leave the app only;
// plain text, in-app links and everything else keep the default menu (copy still works).
import test from 'node:test';
import assert from 'node:assert/strict';
import { installLinkInterceptor, resetLinkState } from '../app/external-links.js';

function fakeAnchor(href, attrs = {}) {
  const a = { closest: sel => (sel === 'a[href]' ? a : null), hasAttribute: n => (n === 'href' ? href != null : n in attrs), getAttribute: () => href };
  return a;
}
const fakeText = () => ({ closest: () => null });

test('regression AUD-08: context menu on an external link is suppressed, elsewhere it is kept', async () => {
  resetLinkState();
  const listeners = {};
  const rootEl = { addEventListener: (t, f, cap) => { listeners[t] = [f, cap]; }, removeEventListener: t => { delete listeners[t]; } };
  const savedLoc = globalThis.location, savedOpen = globalThis.open;
  globalThis.location = { origin: 'http://app.test', href: 'http://app.test/' };
  const invoked = [];
  try {
    const off = installLinkInterceptor(rootEl, { native: true, invoke: async (...a) => { invoked.push(a); return { opened: true }; } });
    assert.ok(listeners.contextmenu, 'contextmenu listener installed');
    assert.equal(listeners.contextmenu[1], true, 'capture phase, like click');
    const fire = target => {
      const e = { type: 'contextmenu', button: 2, target, prevented: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
      listeners.contextmenu[0](e);
      return e;
    };
    for (const href of ['https://github.com/x', 'https://example.org/', 'http://evil.test/', 'javascript:alert(1)', 'file:///C:/x']) {
      assert.ok(fire(fakeAnchor(href)).prevented, `menu suppressed on ${href}`);
    }
    assert.ok(!fire(fakeText()).prevented, 'plain text keeps the menu (copy)');
    assert.ok(!fire(fakeAnchor('#top')).prevented, 'same-document link keeps the menu');
    assert.ok(!fire(fakeAnchor('report.html')).prevented, 'in-app link keeps the menu');
    assert.ok(!fire(fakeAnchor('https://github.com/x', { download: '' })).prevented, 'download link keeps the menu');
    assert.ok(!fire(null).prevented, 'no target is ignored');
    await new Promise(r => setImmediate(r));
    assert.equal(invoked.length, 0, 'a right-click never opens anything');
    off();
    assert.equal(listeners.contextmenu, undefined, 'uninstall removes the listener');
  } finally {
    globalThis.location = savedLoc;
    globalThis.open = savedOpen;
  }
});
