import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyGlibBackport, verifyGlibSelection, CARGO_ROOTS } from '../tools/verify-glib-backport.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deckchek-glib-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'vendor'), path.join(directory, 'vendor'), { recursive: true });
  for (const cargoRoot of CARGO_ROOTS) {
    fs.mkdirSync(path.join(directory, cargoRoot), { recursive: true });
    for (const file of ['Cargo.toml', 'Cargo.lock']) fs.copyFileSync(path.join(ROOT, cargoRoot, file), path.join(directory, cargoRoot, file));
  }
  return directory;
}

test('GLib backport preserves the complete registry inventory and all exact dependency roots', () => {
  const result = verifyGlibBackport();
  assert.equal(result.files, 121);
  assert.equal(result.provenance.version, '0.18.5');
  assert.equal(result.provenance.advisory, 'RUSTSEC-2024-0429');
  assert.equal(result.compatibilityFiles, 12);
  assert.deepEqual(result.provenance.compatibilityPatch.diagnostics, { unused_parens: 3, mismatched_lifetime_syntaxes: 31 });
  assert.equal(result.cargoRoots.length, 3);
});

test('source-integrity gate rejects an unapproved file change and a reverted unsafe out-pointer', t => {
  const directory = fixture(t), source = path.join(directory, 'vendor/glib-0.18.5/src/lib.rs');
  const original = fs.readFileSync(source); fs.appendFileSync(source, '\n// accidental edit\n');
  assert.throws(() => verifyGlibBackport(directory), /Unapproved vendor change/);
  fs.writeFileSync(source, original);
  const iterator = path.join(directory, 'vendor/glib-0.18.5/src/variant_iter.rs');
  fs.writeFileSync(iterator, fs.readFileSync(iterator, 'utf8').replace('                &mut p,', '                &p,'));
  assert.throws(() => verifyGlibBackport(directory), /Patched iterator source changed/);
});

test('source-integrity gate rejects missing, extra and symlinked package files', t => {
  const directory = fixture(t), crate = path.join(directory, 'vendor/glib-0.18.5');
  const extra = path.join(crate, 'extra.rs'); fs.writeFileSync(extra, '');
  assert.throws(() => verifyGlibBackport(directory), /inventory differs/); fs.unlinkSync(extra);
  fs.symlinkSync('LICENSE', extra);
  assert.throws(() => verifyGlibBackport(directory), /Unexpected symlink/); fs.unlinkSync(extra);
  fs.unlinkSync(path.join(crate, 'LICENSE'));
  assert.throws(() => verifyGlibBackport(directory), /inventory differs/);
});

test('the original inventory cannot be rewritten to approve a different source snapshot', t => {
  const directory = fixture(t), file = path.join(directory, 'vendor/glib-0.18.5.provenance.json');
  const provenance = JSON.parse(fs.readFileSync(file, 'utf8'));
  provenance.originalFiles.LICENSE = '0'.repeat(64); fs.writeFileSync(file, JSON.stringify(provenance));
  assert.throws(() => verifyGlibBackport(directory), /Original registry file inventory changed/);
});

test('compiler compatibility changes must remain exact, including in otherwise approved files', t => {
  const directory = fixture(t);
  for (const [relative, change] of [
    ['src/object.rs', source => source.replace("InterfaceRef<'_, T>", 'InterfaceRef<T>')],
    ['src/value_array.rs', source => source.replace('let func_obj: &mut dyn FnMut(&Value, &Value) -> Ordering', 'let func_obj: &mut (dyn FnMut(&Value, &Value) -> Ordering)')],
    ['src/variant.rs', source => source + '\n// unreviewed adjacent change\n'],
  ]) {
    const file = path.join(directory, 'vendor/glib-0.18.5', relative), original = fs.readFileSync(file, 'utf8');
    const changed = change(original);
    assert.notEqual(changed, original);
    fs.writeFileSync(file, changed);
    assert.throws(() => verifyGlibBackport(directory), /Unapproved compatibility source change/);
    fs.writeFileSync(file, original);
  }
});

test('compatibility metadata cannot bless a different source or expanded patch', t => {
  const directory = fixture(t), file = path.join(directory, 'vendor/glib-0.18.5.provenance.json');
  const original = fs.readFileSync(file, 'utf8'), provenance = JSON.parse(original);
  const relative = 'src/object.rs', source = path.join(directory, 'vendor/glib-0.18.5', relative);
  fs.appendFileSync(source, '\n// changed alongside forged provenance\n');
  provenance.compatibilityPatch.patchedFiles[relative] = createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  fs.writeFileSync(file, JSON.stringify(provenance));
  assert.throws(() => verifyGlibBackport(directory), /Approved compatibility metadata changed/);

  const expanded = JSON.parse(original);
  expanded.compatibilityPatch.patchedFiles['src/lib.rs'] = expanded.originalFiles['src/lib.rs'];
  fs.writeFileSync(file, JSON.stringify(expanded));
  assert.throws(() => verifyGlibBackport(directory), /Approved compatibility metadata changed/);
});

test('official security and compiler compatibility patch artifacts remain independently anchored', t => {
  const directory = fixture(t);
  for (const [relative, expected] of [
    ['glib-0.18.5.patch', /Approved patch changed/],
    ['glib-0.18.5.rust-1.100.patch', /Approved compatibility patch changed/],
  ]) {
    const file = path.join(directory, 'vendor', relative), original = fs.readFileSync(file);
    fs.appendFileSync(file, '\n');
    assert.throws(() => verifyGlibBackport(directory), expected);
    fs.writeFileSync(file, original);
  }
  fs.unlinkSync(path.join(directory, 'vendor/glib-0.18.5.rust-1.100.patch'));
  assert.throws(() => verifyGlibBackport(directory), /ENOENT/);
});

test('the actual-crate regression keeps GLib as a test-only exact dependency', t => {
  const directory = fixture(t), file = path.join(directory, 'tools/glib-backport-regression/Cargo.toml');
  const manifest = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, manifest.replace('[dev-dependencies]', '[dependencies]'));
  assert.throws(() => verifyGlibBackport(directory), /exact test-only dev-dependency/);
  fs.writeFileSync(file, manifest + '\n[dependencies]\nglib = "=0.18.5"\n');
  assert.throws(() => verifyGlibBackport(directory), /must not be an unused runtime dependency/);
});

test('each independently locked root must select the patched source and harness versions must match', t => {
  const directory = fixture(t);
  for (const cargoRoot of CARGO_ROOTS) {
    const file = path.join(directory, cargoRoot, 'Cargo.lock'), lock = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, lock.replace('name = "glib"\nversion = "0.18.5"', 'name = "glib"\nversion = "0.18.5"\nsource = "registry+https://github.com/rust-lang/crates.io-index"'));
    assert.throws(() => verifyGlibBackport(directory), /must lock exactly/); fs.writeFileSync(file, lock);
  }
  const harness = path.join(directory, CARGO_ROOTS[2], 'Cargo.lock');
  fs.appendFileSync(harness, '\n[[package]]\nname = "unreviewed-dependency"\nversion = "1.0.0"\n');
  assert.throws(() => verifyGlibBackport(directory), /Regression dependency diverges/);
});

test('metadata proof rejects wrong, duplicate and unreachable GLib packages', () => {
  const pkg = { id: 'selected-glib', name: 'glib', version: '0.18.5', source: null, manifest_path: path.join(ROOT, 'vendor/glib-0.18.5/Cargo.toml') };
  const metadata = { packages: [pkg], resolve: { root: 'app', nodes: [{ id: 'app', deps: [{ pkg: pkg.id }] }, { id: pkg.id, deps: [] }] } };
  assert.equal(verifyGlibSelection(metadata).version, '0.18.5');
  for (const alter of [
    m => { m.packages[0].source = 'registry+https://github.com/rust-lang/crates.io-index'; },
    m => { m.packages[0].version = '0.20.0'; },
    m => { m.packages[0].manifest_path = path.join(ROOT, 'src-tauri/Cargo.toml'); },
    m => { m.packages.push({ ...pkg, id: 'unpatched-glib' }); },
    m => { m.resolve.nodes[0].deps = []; },
  ]) {
    const bad = structuredClone(metadata); alter(bad); assert.throws(() => verifyGlibSelection(bad));
  }
});
