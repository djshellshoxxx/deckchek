// Regression tests for audit findings (AUD-NN). Each test is named after its finding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const directives = (csp) => new Map(csp.split(';').map(s => s.trim()).filter(Boolean).map(d => {
  const [name, ...values] = d.split(/\s+/);
  return [name, values.join(' ')];
}));

test("regression: AUD-11 CSP sets base-uri, form-action, object-src and frame-ancestors to 'none'", () => {
  const csp = directives(JSON.parse(read('src-tauri/tauri.conf.json')).app.security.csp);
  for (const name of ['base-uri', 'form-action', 'object-src', 'frame-ancestors']) {
    assert.equal(csp.get(name), "'none'", name);
  }
  // the existing script policy is unchanged: no inline script, no eval
  assert.equal(csp.get('script-src'), "'self'");
  assert.equal(csp.get('default-src'), "'self'");
});

test('regression: AUD-11 ui-smoke serves the same CSP as tauri.conf.json', () => {
  const conf = JSON.parse(read('src-tauri/tauri.conf.json')).app.security.csp;
  const m = /^const CSP = "([^"]+)";$/m.exec(read('tools/ui-smoke.mjs'));
  assert.ok(m, 'CSP constant found in tools/ui-smoke.mjs');
  assert.equal(m[1], conf);
});
