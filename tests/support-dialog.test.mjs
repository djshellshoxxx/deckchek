import test from 'node:test';
import assert from 'node:assert/strict';
import { bundleFileName, buildClientContext, sizeText } from '../app/ui/screens/support-dialog.js';

test('bundleFileName is deckchek-diagnostics-YYYYMMDD-HHmm.zip in local time', () => {
  assert.equal(bundleFileName(new Date(2026, 0, 5, 9, 7)), 'deckchek-diagnostics-20260105-0907.zip');
});

test('buildClientContext picks WebView2 version, locale and settings; omits systemHealth when absent', () => {
  const c = buildClientContext({ nav: { userAgent: 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91', language: 'en-GB' }, uiSettings: { theme: 'dark' } });
  assert.deepEqual(c, { system: { webview2Version: '120.0.2210.91', locale: 'en-GB' }, settings: { theme: 'dark' } });
  const h = buildClientContext({ nav: {}, uiSettings: {}, systemHealth: { summary: { status: 'pass' } } });
  assert.deepEqual(h.systemHealth, { summary: { status: 'pass' } });
  assert.deepEqual(h.system, {});
});

test('sizeText', () => {
  assert.equal(sizeText(0), '0 B');
  assert.equal(sizeText(2048), '2 KB');
  assert.equal(sizeText(1572864), '1.5 MB');
});
