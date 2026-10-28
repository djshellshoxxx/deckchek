import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tagCoreVersion, checkRelease } from '../tools/check-release-version.mjs';

test('release tag core version parsing', () => {
  assert.equal(tagCoreVersion('v0.1.0-beta.1'), '0.1.0');
  assert.equal(tagCoreVersion('v1.2.3'), '1.2.3');
  assert.equal(tagCoreVersion('v0.07-beta'), null);
  assert.equal(tagCoreVersion('0.1.0'), null);
});

test('release tag must match tauri.conf.json and Cargo.toml', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relver-'));
  fs.mkdirSync(path.join(root, 'src-tauri'));
  fs.writeFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), JSON.stringify({ version: '0.1.0' }));
  fs.writeFileSync(path.join(root, 'src-tauri', 'Cargo.toml'), '[package]\nname = "x"\nversion = "0.1.0"\n');
  assert.equal(checkRelease('v0.1.0-beta.1', root).ok, true);
  assert.equal(checkRelease('v0.1.1', root).ok, false);
});
