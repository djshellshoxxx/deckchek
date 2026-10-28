// Release assets are flattened by GitHub. Hash those actual download names,
// rejecting collisions rather than producing an unusable nested-path manifest.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function writeReleaseChecksums(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Release assets must not be symbolic links');
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && entry.name !== 'SHA256SUMS') files.push(file);
    }
  }
  await visit(root);
  if (!files.length) throw new Error('No release assets to hash');
  files.sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'en'));
  const seen = new Set(), lines = [];
  for (const file of files) {
    const name = path.basename(file);
    if (seen.has(name)) throw new Error(`Duplicate release download name: ${name}`);
    if (/[\r\n\\]/.test(name)) throw new Error('Release download name is not safe for a checksum manifest');
    seen.add(name);
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(file)) digest.update(chunk);
    lines.push(`${digest.digest('hex')}  ${name}`);
  }
  await fs.writeFile(path.join(root, 'SHA256SUMS'), lines.join('\n') + '\n');
  return files.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node tools/release-checksums.mjs <artifact directory>');
  console.log(`Checksummed ${await writeReleaseChecksums(process.argv[2])} release downloads.`);
}
