#!/usr/bin/env node
// Verify the registry snapshot, official fix and bounded compiler syntax patch.
// --metadata additionally asks Cargo to prove the selected source in all roots.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CRATE = 'vendor/glib-0.18.5';
const ARCHIVE_SHA256 = '233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5';
const ORIGINAL_INVENTORY_SHA256 = 'd59db0cd23975279aa057124dd43c47d26ba742df34e9dbfba0e72099d71e217';
const PATCH_SHA256 = '8eb6674027f126bdfac118d8644308d390c511e1cf88cf2857794c93a72a2e6f';
const PATCHED_SHA256 = 'a0f5ee8acb8faa089bcdfbc9a57372609fce7654026ccef7d9a224d05a654ccc';
const COMPATIBILITY_PATCH_SHA256 = '8390ef53a31b12b0e3ab0b026461593bbd9208c2a295a50d72907c9d041c00b9';
const COMPATIBILITY_METADATA_SHA256 = '114dbb775fa199f17482b3bf106cf54b6654ef8a55ee4e914b3f1c9564118d6e';
const FIX_COMMIT = 'b5a4071e439bef2b5eea76c3aa25e5ae84839e34';
export const CARGO_ROOTS = ['src-tauri', 'src-tauri/fuzz', 'tools/glib-backport-regression'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(file, 'utf8');

// This digest-anchored artifact contains only same-path, textual unified hunks.
// Reconstruct each original file without executing an external patch program.
function compatibilityHunks(patch) {
  assert.ok(patch.endsWith('\n'), 'Compatibility patch must end with a newline');
  const lines = patch.slice(0, -1).split('\n'), files = new Map();
  let cursor = 0, removed = 0, added = 0;
  while (cursor < lines.length) {
    const header = /^--- a\/(.+)$/.exec(lines[cursor++]);
    assert.ok(header, 'Invalid compatibility patch file header');
    const relative = header[1];
    assert.equal(lines[cursor++], '+++ b/' + relative, 'Compatibility patch must preserve each file path');
    assert.ok(!files.has(relative), 'Duplicate compatibility patch file');
    const hunks = [];
    while (cursor < lines.length && lines[cursor].startsWith('@@ ')) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@$/.exec(lines[cursor++]);
      assert.ok(match, 'Invalid compatibility patch hunk');
      const oldCount = Number(match[2] ?? 1), newCount = Number(match[4] ?? 1);
      const original = [], patched = [];
      while (original.length < oldCount || patched.length < newCount) {
        const line = lines[cursor++];
        assert.ok(line && [' ', '-', '+'].includes(line[0]), 'Invalid compatibility patch line');
        if (line[0] !== '+') original.push(line.slice(1));
        if (line[0] !== '-') patched.push(line.slice(1));
        if (line[0] === '-') removed++;
        if (line[0] === '+') added++;
        assert.ok(original.length <= oldCount && patched.length <= newCount, 'Compatibility patch hunk count mismatch');
      }
      hunks.push({ oldStart: Number(match[1]) - 1, newStart: Number(match[3]) - 1, original, patched });
    }
    assert.ok(hunks.length, 'Compatibility patch file has no changes');
    files.set(relative, hunks);
  }
  assert.equal(files.size, 12, 'Compatibility patch must touch exactly 12 files');
  assert.equal(removed, 34, 'Compatibility patch must replace exactly 34 lines');
  assert.equal(added, 34, 'Compatibility patch must replace exactly 34 lines');
  return files;
}

function reverseCompatibilityHunks(text, hunks) {
  const lines = text.split('\n'), original = [];
  let cursor = 0;
  for (const hunk of hunks) {
    assert.ok(hunk.newStart >= cursor, 'Compatibility hunks must not overlap');
    original.push(...lines.slice(cursor, hunk.newStart));
    assert.equal(original.length, hunk.oldStart, 'Compatibility original line offset mismatch');
    assert.deepEqual(lines.slice(hunk.newStart, hunk.newStart + hunk.patched.length), hunk.patched, 'Compatibility source hunk mismatch');
    original.push(...hunk.original);
    cursor = hunk.newStart + hunk.patched.length;
  }
  return [...original, ...lines.slice(cursor)].join('\n');
}

function filesUnder(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix + entry.name;
    assert.ok(!entry.isSymbolicLink(), `Unexpected symlink in vendored source: ${relative}`);
    if (entry.isDirectory()) return filesUnder(path.join(directory, entry.name), `${relative}/`);
    assert.ok(entry.isFile(), `Unexpected non-file in vendored source: ${relative}`);
    return [relative];
  }).sort();
}

// Cargo's committed lockfiles use one normalized [[package]] block per package.
function lockPackages(file) {
  return read(file).split(/^\[\[package\]\]\s*$/m).slice(1).map(block => {
    const field = name => block.match(new RegExp(`^${name} = "([^"]+)"$`, 'm'))?.[1] || null;
    return { name: field('name'), version: field('version'), source: field('source'), checksum: field('checksum') };
  });
}

export function verifyGlibBackport(root = ROOT) {
  const provenance = JSON.parse(read(path.join(root, 'vendor/glib-0.18.5.provenance.json')));
  assert.equal(provenance.schemaVersion, 2);
  assert.equal(provenance.name, 'glib');
  assert.equal(provenance.version, '0.18.5', 'Do not disguise the actual upstream package version');
  assert.equal(provenance.license, 'MIT');
  assert.equal(provenance.archive.sha256, ARCHIVE_SHA256);
  assert.equal(provenance.archive.url, 'https://static.crates.io/crates/glib/glib-0.18.5.crate');
  assert.equal(provenance.archive.bytes, 267679);
  assert.equal(provenance.archiveSourceCommit, '42b9caf98e03ded086362d9653ca58fe94dc8658');
  assert.equal(provenance.upstreamFixCommit, FIX_COMMIT);
  assert.equal(provenance.upstreamFixUrl, `https://github.com/gtk-rs/gtk-rs-core/commit/${FIX_COMMIT}`);
  assert.equal(provenance.advisory, 'RUSTSEC-2024-0429');
  assert.equal(provenance.originalFileCount, 121);
  assert.equal(sha256(JSON.stringify(provenance.originalFiles)), ORIGINAL_INVENTORY_SHA256, 'Original registry file inventory changed');
  assert.equal(provenance.patchFile, 'glib-0.18.5.patch');
  assert.equal(provenance.patchSha256, PATCH_SHA256);
  assert.equal(sha256(fs.readFileSync(path.join(root, 'vendor', provenance.patchFile))), PATCH_SHA256, 'Approved patch changed');
  assert.equal(provenance.patchedFile, 'src/variant_iter.rs');
  assert.equal(provenance.patchedSha256, PATCHED_SHA256);

  const compatibility = provenance.compatibilityPatch;
  assert.ok(compatibility, 'Compiler compatibility provenance is missing');
  assert.equal(sha256(JSON.stringify(compatibility)), COMPATIBILITY_METADATA_SHA256, 'Approved compatibility metadata changed');
  assert.equal(compatibility.patchFile, 'glib-0.18.5.rust-1.100.patch');
  assert.equal(compatibility.patchSha256, COMPATIBILITY_PATCH_SHA256);
  const compatibilityBytes = fs.readFileSync(path.join(root, 'vendor', compatibility.patchFile));
  assert.equal(sha256(compatibilityBytes), COMPATIBILITY_PATCH_SHA256, 'Approved compatibility patch changed');
  const hunksByFile = compatibilityHunks(compatibilityBytes.toString('utf8'));
  assert.deepEqual([...hunksByFile.keys()].sort(), Object.keys(compatibility.patchedFiles).sort(), 'Compatibility patch file inventory changed');
  assert.ok(!hunksByFile.has(provenance.patchedFile), 'Compiler compatibility patch must remain separate from the official iterator fix');

  const directory = path.join(root, CRATE), inventory = Object.keys(provenance.originalFiles).sort();
  assert.equal(inventory.length, 121);
  assert.deepEqual(filesUnder(directory), inventory, 'Vendored source inventory differs from the registry archive');
  for (const relative of inventory) {
    const bytes = fs.readFileSync(path.join(directory, relative));
    if (hunksByFile.has(relative)) {
      assert.equal(sha256(bytes), compatibility.patchedFiles[relative], 'Unapproved compatibility source change: ' + relative);
      const original = reverseCompatibilityHunks(bytes.toString('utf8'), hunksByFile.get(relative));
      assert.equal(sha256(original), provenance.originalFiles[relative], 'Compatibility source differs beyond the approved compiler suggestions: ' + relative);
      continue;
    }
    if (relative !== provenance.patchedFile) {
      assert.equal(sha256(bytes), provenance.originalFiles[relative], `Unapproved vendor change: ${relative}`);
      continue;
    }
    assert.equal(sha256(bytes), PATCHED_SHA256, 'Patched iterator source changed');
    let original = bytes.toString('utf8');
    for (const [fixed, old] of [
      ['let mut p: *mut libc::c_char = std::ptr::null_mut();', 'let p: *mut libc::c_char = std::ptr::null_mut();'],
      ['                &mut p,', '                &p,'],
    ]) {
      assert.equal(original.split(fixed).length - 1, 1, 'The approved backport must change exactly one out-argument');
      original = original.replace(fixed, old);
    }
    assert.equal(sha256(original), provenance.originalFiles[relative], 'Iterator differs from the original beyond the official two-line fix');
  }

  const locks = [];
  for (const cargoRoot of CARGO_ROOTS) {
    const manifest = path.join(root, cargoRoot, 'Cargo.toml');
    const section = read(manifest).split(/^\[patch\.crates-io\]\s*$/m)[1]?.split(/^\[/m)[0];
    const patchPath = section?.match(/^glib = \{ path = "([^"]+)" \}$/m)?.[1];
    assert.ok(patchPath, `${cargoRoot} must declare the reviewed GLib patch`);
    assert.equal(fs.realpathSync(path.resolve(path.dirname(manifest), patchPath)), fs.realpathSync(directory), `${cargoRoot} selects a different vendor directory`);
    const packages = lockPackages(path.join(root, cargoRoot, 'Cargo.lock'));
    assert.deepEqual(packages.filter(p => p.name === 'glib'), [{ name: 'glib', version: '0.18.5', source: null, checksum: null }], `${cargoRoot} must lock exactly the local GLib 0.18.5`);
    locks.push(packages);
  }
  const appPackages = new Set(locks[0].map(pkg => JSON.stringify(pkg)));
  const harnessManifest = read(path.join(root, CARGO_ROOTS[2], 'Cargo.toml'));
  const testDependencies = harnessManifest.split(/^\[dev-dependencies\]\s*$/m)[1]?.split(/^\[/m)[0];
  assert.ok(/^glib = "=0\.18\.5"$/m.test(testDependencies || ''), 'Regression GLib must be an exact test-only dev-dependency');
  const runtimeDependencies = harnessManifest.split(/^\[dependencies\]\s*$/m)[1]?.split(/^\[/m)[0];
  assert.ok(!/^glib\s*=/m.test(runtimeDependencies || ''), 'Regression GLib must not be an unused runtime dependency');
  for (const pkg of locks[2].filter(pkg => pkg.name !== 'deckchek-glib-backport-regression')) {
    assert.ok(appPackages.has(JSON.stringify(pkg)), `Regression dependency diverges from application lock: ${pkg.name} ${pkg.version}`);
  }
  return { provenance, files: inventory.length, compatibilityFiles: hunksByFile.size, cargoRoots: CARGO_ROOTS.slice() };
}

export function verifyGlibSelection(metadata, root = ROOT) {
  const selected = metadata.packages.filter(pkg => pkg.name === 'glib');
  assert.equal(selected.length, 1, 'Cargo must select one GLib package');
  const pkg = selected[0];
  assert.equal(pkg.version, '0.18.5');
  assert.equal(pkg.source, null, 'Cargo selected a registry/git GLib instead of the backport');
  assert.equal(fs.realpathSync(pkg.manifest_path), fs.realpathSync(path.join(root, CRATE, 'Cargo.toml')), 'Cargo selected a different GLib manifest');
  const nodes = new Map(metadata.resolve.nodes.map(node => [node.id, node]));
  const seen = new Set(), pending = [metadata.resolve.root];
  while (pending.length) {
    const id = pending.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    assert.ok(nodes.has(id), `Cargo resolution is incomplete for ${id}`);
    pending.push(...nodes.get(id).deps.map(dependency => dependency.pkg));
  }
  assert.ok(seen.has(pkg.id), 'The patched package is not reachable from this Cargo root');
  return { name: pkg.name, version: pkg.version, manifest: pkg.manifest_path };
}

export function verifyGlibCargoRoots(root = ROOT) {
  return CARGO_ROOTS.map(cargoRoot => {
    const output = execFileSync('cargo', ['metadata', '--locked', '--format-version', '1', '--manifest-path', path.join(root, cargoRoot, 'Cargo.toml'), '--filter-platform', 'x86_64-unknown-linux-gnu'], {
      maxBuffer: 128 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
    });
    return { root: cargoRoot, ...verifyGlibSelection(JSON.parse(output), root) };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyGlibBackport();
    console.log(`Verified ${result.files} original registry files, the official two-line GLib backport and 34 compiler syntax edits in ${result.compatibilityFiles} files.`);
    if (process.argv.includes('--metadata')) for (const selection of verifyGlibCargoRoots()) console.log(JSON.stringify(selection));
    console.log('RUSTSEC-2024-0429 remains a version-based advisory for 0.18.5. Local remediation also requires the optimized actual-crate and native CI gates; no advisory ignore is applied.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
