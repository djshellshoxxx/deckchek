import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeReleaseChecksums } from '../tools/release-checksums.mjs';

test('release checksums match flat download names and remain repeatable', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'deckchek-checksums-'));
  try {
    await fs.mkdir(path.join(root, 'linux')); await fs.mkdir(path.join(root, 'windows'));
    await fs.writeFile(path.join(root, 'linux', 'linux-x64.deb'), 'linux');
    await fs.writeFile(path.join(root, 'windows', 'windows-x64.exe'), 'windows');
    assert.equal(await writeReleaseChecksums(root), 2);
    const manifest = await fs.readFile(path.join(root, 'SHA256SUMS'), 'utf8');
    assert.equal(manifest, ['linux', 'windows'].map(platform => `${createHash('sha256').update(platform).digest('hex')}  ${platform}-x64.${platform === 'linux' ? 'deb' : 'exe'}\n`).join(''));
    await writeReleaseChecksums(root);
    assert.equal(await fs.readFile(path.join(root, 'SHA256SUMS'), 'utf8'), manifest);
    await fs.writeFile(path.join(root, 'windows', 'linux-x64.deb'), 'collision');
    await assert.rejects(writeReleaseChecksums(root), /Duplicate/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
