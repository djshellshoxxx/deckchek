import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { joinPath } from '../app/certificate-api.js';

test('certificate paths retain directory spelling and separator selection', () => {
  for (const [directory, expected] of [
    [null, '/receipt.json'],
    [undefined, '/receipt.json'],
    ['', '/receipt.json'],
    ['/', '/receipt.json'],
    ['////', '/receipt.json'],
    ['\\\\', '\\receipt.json'],
    ['C:\\', 'C:\\receipt.json'],
    ['C:\\Users\\Ann\\Certs\\\\', 'C:\\Users\\Ann\\Certs\\receipt.json'],
    ['\\\\server\\share\\', '\\\\server\\share\\receipt.json'],
    ['C:\\folder///', 'C:\\folder/receipt.json'],
    ['/folder\\\\', '/folder/receipt.json'],
    ['/音楽/Certs/', '/音楽/Certs/receipt.json'],
    ['/a//b', '/a//b/receipt.json'],
  ]) assert.equal(joinPath(directory, 'receipt.json'), expected);
});

test('long separator runs cannot stall certificate path construction', () => {
  // Isolate the formerly quadratic operation so a regression fails within a
  // generous limit instead of blocking the entire test runner synchronously.
  const probe = [
    "import assert from 'node:assert/strict';",
    'const { joinPath } = await import(process.argv[1]);',
    "for (const separator of ['/', String.fromCharCode(92)]) {",
    "  const directory = separator.repeat(250000) + 'folder';",
    "  const expected = directory + separator + 'receipt.json';",
    "  assert.equal(joinPath(directory, 'receipt.json'), expected);",
    "  assert.equal(joinPath(directory + separator.repeat(250000), 'receipt.json'), expected);",
    '}',
  ].join('\n');
  const result = spawnSync(process.execPath, [
    '--input-type=module', '--eval', probe,
    new URL('../app/certificate-api.js', import.meta.url).href,
  ], { encoding: 'utf8', timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
