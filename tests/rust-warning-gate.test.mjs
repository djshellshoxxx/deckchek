import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectRustBuild } from '../tools/check-rust-warnings.mjs';

const manifest = path.resolve('src-tauri/Cargo.toml');
const app = { id: 'path+file:///work/src-tauri#deckchek@0.1.0', manifest_path: manifest };
const dependency = { id: 'path+file:///work/vendor/glib#glib@0.18.5', manifest_path: path.resolve('vendor/glib/Cargo.toml') };
const metadata = { version: 1, packages: [app] };
const diagnostic = (pkg, level = 'warning', message = 'test diagnostic') => ({ reason: 'compiler-message', package_id: pkg.id, manifest_path: pkg.manifest_path, message: { level, message, rendered: `${level}: ${message}\n` } });
const artifact = (pkg = app, kind = ['lib']) => ({ reason: 'compiler-artifact', package_id: pkg.id, manifest_path: pkg.manifest_path, target: { kind }, fresh: true });
const finished = success => ({ reason: 'build-finished', success });
const lines = records => records.map(record => JSON.stringify(record)).join('\n') + '\n';
const inspect = records => inspectRustBuild(metadata, lines(records), manifest);

test('app compiler warnings fail even when the build succeeds and dependencies also warn', () => {
  for (const prefix of [[], [diagnostic(dependency)]]) {
    const result = inspect([...prefix, diagnostic(app), artifact(), finished(true)]);
    assert.equal(result.ok, false); assert.equal(result.appWarnings.length, 1);
  }
});

test('dependency diagnostics remain attributed and visible without becoming app warnings', () => {
  const sameName = { ...dependency, id: 'path+file:///work/vendor/other#deckchek@0.1.0' };
  const result = inspect([diagnostic(dependency), diagnostic(sameName), artifact(), finished(true)]);
  assert.equal(result.ok, true); assert.equal(result.appWarnings.length, 0);
  assert.deepEqual(result.dependencyWarnings.map(item => item.packageId), [dependency.id, sameName.id]);
});

test('any compiler error or unsuccessful build fails regardless of warning attribution', () => {
  for (const pkg of [app, dependency]) assert.equal(inspect([diagnostic(pkg, 'error'), artifact(), finished(true)]).ok, false);
  assert.equal(inspect([artifact(), finished(false)]).ok, false);
});

test('empty, incomplete, duplicate-finish and build-script-only logs cannot qualify an app build', () => {
  for (const records of [[], [artifact()], [finished(true)], [artifact(app, ['custom-build']), finished(true)], [artifact(), finished(true), finished(true)], [finished(true), artifact()]]) {
    assert.equal(inspect(records).ok, false);
  }
});

test('malformed logs and conflicting package identities fail closed', () => {
  const clean = lines([artifact(), finished(true)]);
  for (const text of ['warning: unstructured output\n', '{broken json}\n', 'null\n']) assert.equal(inspectRustBuild(metadata, text + clean, manifest).ok, false);
  for (const kind of [[], [null], [''], [' '], ['lib', null]]) assert.equal(inspect([artifact(app, kind), finished(true)]).ok, false);
  for (const alter of [
    item => { delete item.package_id; },
    item => { item.package_id = dependency.id; },
    item => { item.manifest_path = dependency.manifest_path; },
    item => { item.message.level = 'unrecognized'; },
  ]) {
    const item = diagnostic(app); alter(item);
    assert.equal(inspect([item, artifact(), finished(true)]).ok, false);
  }
});

test('metadata must resolve one exact app manifest rather than select by display name', () => {
  for (const packages of [[], [dependency], [app, app], [{ ...app, id: '' }]]) assert.throws(() => inspectRustBuild({ packages }, '', manifest), /exactly one app package/);
});

test('CLI preserves dependency diagnostics and returns nonzero for an app warning', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deckchek-rust-gate-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const meta = path.join(directory, 'metadata.json'), output = path.join(directory, 'messages.jsonl');
  fs.writeFileSync(meta, JSON.stringify(metadata));
  const tool = fileURLToPath(new URL('../tools/check-rust-warnings.mjs', import.meta.url));
  for (const [pkg, expected] of [[dependency, 0], [app, 1]]) {
    fs.writeFileSync(output, lines([diagnostic(pkg, 'warning', 'preserved marker'), artifact(), finished(true)]));
    const result = spawnSync(process.execPath, [tool, manifest, meta, output], { encoding: 'utf8' });
    assert.equal(result.status, expected, result.stderr);
    assert.match(result.stderr, /preserved marker/);
    assert.match(result.stdout, /Rust build:/);
  }
});
