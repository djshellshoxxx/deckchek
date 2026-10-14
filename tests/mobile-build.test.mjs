import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMobile, SHARED, precacheCandidates } from '../tools/build-mobile.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobile = path.join(root, 'mobile');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')])).sort();
}
const ownFiles = () => walk(mobile).filter(f => !f.startsWith('vendor/'));
const ownJs = () => ownFiles().filter(f => f.endsWith('.js'));

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d); else fs.copyFileSync(s, d);
  }
}

test('vendored engines are byte-identical copies of app/ and the sw stamp is current (build --check)', () => {
  assert.deepEqual(buildMobile({ check: true }), []);
  for (const f of SHARED) assert.equal(read(`mobile/vendor/${path.basename(f)}`), read(`app/${f}`), f);
  assert.match(read('mobile/vendor/VERSION'), /core\.js/);
});

test('--check notices a drifted vendor copy and a stale precache stamp; writing repairs them', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-mobile-'));
  try {
    copyTree(path.join(root, 'app'), path.join(tmp, 'app'));
    copyTree(mobile, path.join(tmp, 'mobile'));
    assert.deepEqual(buildMobile({ root: tmp, check: true }), []);
    fs.appendFileSync(path.join(tmp, 'app', 'core.js'), '\n// drift\n');
    const drift = buildMobile({ root: tmp, check: true });
    assert.ok(drift.includes('vendor/core.js'), drift.join(','));
    assert.ok(drift.includes('vendor/VERSION'));
    assert.ok(drift.includes('sw.js'), 'the cache name changes with any file');
    buildMobile({ root: tmp });
    assert.deepEqual(buildMobile({ root: tmp, check: true }), []);
    fs.writeFileSync(path.join(tmp, 'mobile', 'styles.css'), `${fs.readFileSync(path.join(tmp, 'mobile', 'styles.css'), 'utf8')}\n/* edit */`);
    assert.deepEqual(buildMobile({ root: tmp, check: true }), ['sw.js']);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('service worker precaches every file of the app and nothing else (AC-2)', () => {
  const sw = read('mobile/sw.js');
  const list = JSON.parse(/const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)[1]);
  const expected = precacheCandidates(walk(mobile)).map(f => `./${f}`);
  for (const f of expected) assert.ok(list.includes(f), `${f} missing from the precache`);
  assert.ok(list.includes('./') && list.includes('./index.html'));
  for (const f of list) if (f !== './') assert.ok(fs.existsSync(path.join(mobile, f)), `${f} does not exist`);
  assert.match(sw, /skip-waiting/);
  assert.equal(/self\.skipWaiting\(\)/.test(sw.split("addEventListener('install'")[1].split("addEventListener('activate'")[0]), false, 'no automatic skipWaiting on install');
  assert.match(sw, /url\.origin !== self\.location\.origin/);
});

test('manifest is installable: name, scope, standalone, 192 and 512 PNG icons that exist and have those sizes', () => {
  const m = JSON.parse(read('mobile/manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.name && m.short_name && m.start_url && m.scope);
  const sizes = new Set(m.icons.map(i => i.sizes));
  assert.ok(sizes.has('192x192') && sizes.has('512x512'));
  assert.ok(m.icons.some(i => i.purpose === 'maskable'));
  for (const icon of m.icons) {
    const buf = fs.readFileSync(path.join(mobile, icon.src));
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', icon.src);
    const [w] = icon.sizes.split('x').map(Number);
    assert.equal(buf.readUInt32BE(16), w, icon.src);
    assert.equal(buf.readUInt32BE(20), w, icon.src);
  }
  const html = read('mobile/index.html');
  assert.match(html, /rel="manifest"/);
  assert.match(html, /name="viewport"/);
});

test('page contract: strict CSP, no inline script or style, no remote assets, no unsafe sinks', () => {
  const html = read('mobile/index.html');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /style-src 'self'(;|$)/);
  assert.match(csp, /img-src 'self' data: blob:/);
  assert.equal(/unsafe-/.test(csp), false);
  assert.equal(/<script(?![^>]*\bsrc=)/.test(html), false, 'no inline script');
  assert.equal(/<style|style="/.test(html), false, 'no inline style');
  assert.equal(/\son[a-z]+="/.test(html), false, 'no inline handlers');
  for (const f of ownFiles().filter(f => /\.(js|html|css|webmanifest)$/.test(f))) {
    const src = read(`mobile/${f}`);
    assert.equal(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), false, `${f}: remote URL`);
  }
  for (const f of ownJs()) {
    const src = read(`mobile/${f}`).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/.test(src), false, `${f}: unsafe sink`);
    assert.equal(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(src.replace(/\/\/.*$/gm, '')) && f !== 'sw.js', false, `${f}: network call`);
  }
});

test('every relative import in mobile/ resolves to a shipped file, and the engines come from vendor/', () => {
  const files = new Set(walk(mobile));
  for (const f of walk(mobile).filter(x => x.endsWith('.js'))) {
    const src = read(`mobile/${f}`);
    for (const m of src.matchAll(/(?:from\s+|import\()\s*['"](\.[^'"]+)['"]/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
      assert.ok(files.has(target), `${f} imports ${m[1]} which is not shipped`);
    }
  }
  for (const f of ownJs()) assert.equal(/\.\.\/\.\.\/app\//.test(read(`mobile/${f}`)), false, `${f} reaches into app/ directly`);
  assert.match(read('mobile/lib/speed.js'), /\.\.\/vendor\/core\.js/);
});

test('the Pages workflow can only be started by hand and never deploys by default (hosting is undecided)', () => {
  const y = read('.github/workflows/pages-mobile.yml');
  const on = /^on:\n([\s\S]*?)\n\S/m.exec(y)[1];
  assert.match(on, /^\s{2}workflow_dispatch:/m);
  for (const trigger of ['push', 'pull_request', 'schedule', 'release', 'workflow_run', 'repository_dispatch']) assert.equal(new RegExp(`^\\s{2}${trigger}:`, 'm').test(on), false, trigger);
  assert.match(y, /deploy:\n\s+description:[^\n]*\n\s+type: boolean\n\s+default: false/);
  assert.match(y, /if: \$\{\{ inputs\.deploy \}\}/);
  assert.match(y, /node tools\/build-mobile\.mjs --check/);
});

test('five screens, a photosensitivity confirmation before the strobe, and a persistent SPL banner', () => {
  const html = read('mobile/index.html');
  for (const s of ['speed', 'strobe', 'vibration', 'spl', 'results']) assert.match(html, new RegExp(`data-screen="${s}"`));
  const strobe = read('mobile/screens/strobe.js');
  assert.match(strobe, /strobeAck/);
  assert.match(strobe, /seizures/);
  assert.match(strobe, /showModal/);
  assert.match(read('mobile/screens/spl.js'), /Uncalibrated, ±/);
});
