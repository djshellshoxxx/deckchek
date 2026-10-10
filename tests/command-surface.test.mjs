// GAP-15: every command registered in lib.rs is invoked from app/, and every invoked name is registered.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = fs.readFileSync(path.join(root, 'src-tauri/src/lib.rs'), 'utf8');
const block = lib.slice(lib.indexOf('generate_handler!['), lib.indexOf('])', lib.indexOf('generate_handler![')));
const registered = new Set([...block.replace(/\/\/.*$/gm, '').matchAll(/(?:\w+)::(\w+)/g)].map(m => m[1]));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const source = walk(path.join(root, 'app')).map(f => fs.readFileSync(f, 'utf8')).join('\n');
const invoked = new Set([...source.matchAll(/['"`]([a-z][a-z0-9]*(?:_[a-z0-9]+)+)['"`]/g)].map(m => m[1]).filter(n => registered.has(n)));

test('every registered command is called from app/ (no dead command surface)', () => {
  const unused = [...registered].filter(n => !invoked.has(n)).sort();
  assert.deepEqual(unused, [], `registered in lib.rs but never referenced from app/: ${unused.join(', ')}`);
});

test('the removed runtime_status command stays removed', () => {
  assert.ok(!registered.has('runtime_status'));
  assert.ok(!fs.readFileSync(path.join(root, 'src-tauri/src/commands.rs'), 'utf8').includes('runtime_status'));
});
