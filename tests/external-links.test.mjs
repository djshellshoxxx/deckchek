import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWLIST, classifyUrl, hostAllowed, openExternal, resetLinkState, sessionAllowedHosts,
  interceptTarget, installLinkInterceptor, openAppPath, revealAppPath,
} from '../app/external-links.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

beforeEach(() => resetLinkState());

let clock = 0;
const tick = () => (clock += 1000); // beyond the 500 ms debounce
function rig({ native = true, invokeImpl, choice = 'cancel', copyOk = true } = {}) {
  const log = { invoke: [], toasts: [], copied: [], opened: [], confirms: [] };
  return {
    log,
    deps: {
      native,
      now: tick,
      invoke: native ? async (cmd, args) => { log.invoke.push([cmd, args]); return invokeImpl(cmd, args); } : undefined,
      toast: (m, o) => log.toasts.push([m, o]),
      copy: async t => { log.copied.push(t); return copyOk; },
      confirm: async d => { log.confirms.push(d); return choice; },
      windowOpen: (...a) => { log.opened.push(a); return null; },
    },
  };
}

test('bundled allowlist JSON matches the JS mirror', () => {
  const json = JSON.parse(read('src-tauri/resources/link-allowlist.json'));
  assert.deepEqual(JSON.parse(JSON.stringify(ALLOWLIST)), json);
  for (const d of ['pioneerdj.com', 'alphatheta.com', 'rekordbox.com', 'serato.com', 'rane.com', 'native-instruments.com', 'allen-heath.com', 'technics.com', 'panasonic.com', 'mixxx.org', 'github.com']) {
    assert.ok(json.hosts.includes(d) && json.allowSubdomains.includes('*.' + d), d);
  }
});

test('classifyUrl matrix (FS-07 §8)', () => {
  const ok = classifyUrl('https://github.com/x');
  assert.ok(ok.ok && ok.allowlisted && ok.host === 'github.com');
  assert.equal(classifyUrl('http://github.com').reason, 'blocked_scheme');
  assert.equal(classifyUrl('javascript:alert(1)').reason, 'blocked_scheme');
  assert.equal(classifyUrl('file:///c:/').reason, 'blocked_scheme');
  assert.equal(classifyUrl('data:text/html,<b>').reason, 'blocked_scheme');
  assert.equal(classifyUrl('mailto:a@b.c').reason, 'blocked_scheme');
  for (const bad of ['', 'not a url', 'https://', 'https://exa mple.com', 'https://github.com/\u0007', 'https://github.com/\nx', '//github.com', null, undefined, 42]) {
    assert.equal(classifyUrl(bad).reason, 'invalid', String(bad));
  }
  assert.equal(classifyUrl('https://github.com/' + 'a'.repeat(3000)).reason, 'invalid');
  for (const ask of ['https://evilgithub.com', 'https://github.com.evil.tld', 'https://user:pw@github.com', 'https://user@github.com', 'https://github.com:8443/x', 'https://127.0.0.1/', 'https://[::1]/']) {
    const c = classifyUrl(ask);
    assert.ok(c.ok && !c.allowlisted, ask);
  }
  assert.ok(classifyUrl('https://user:pw@github.com').hasUserinfo);
});

test('classifyUrl normalises case, trailing dot and explicit 443', () => {
  const c = classifyUrl('HTTPS://GitHub.COM./Foo');
  assert.ok(c.allowlisted);
  assert.equal(c.host, 'github.com');
  assert.ok(classifyUrl('https://github.com:443/').allowlisted);
  assert.ok(classifyUrl('https://support.serato.com/hc').allowlisted);
  assert.ok(!classifyUrl('https://notserato.com/').allowlisted);
});

test('IDN lookalike is non-allowlisted and reported as punycode', () => {
  const c = classifyUrl('https://github\u0430.com/');
  assert.ok(c.ok && !c.allowlisted);
  assert.ok(c.punycodeHost.startsWith('xn--'), c.punycodeHost);
  const direct = classifyUrl('https://xn--githb-3bd.com/');
  assert.ok(direct.ok && !direct.allowlisted);
});

test('unknown allowlist version matches nothing', () => {
  assert.equal(hostAllowed('github.com', { version: 2, hosts: ['github.com'] }), false);
  assert.equal(classifyUrl('https://github.com/', { version: 9, hosts: ['github.com'] }).allowlisted, false);
});

test('AC-1 desktop: allowlisted link opens with no dialog', async () => {
  const { deps, log } = rig({ invokeImpl: async () => ({ opened: true, host: 'github.com', allowlisted: true }) });
  const r = await openExternal('https://github.com/x', deps);
  assert.equal(r.opened, true);
  assert.deepEqual(log.invoke, [['open_external_url', { url: 'https://github.com/x', confirmed: false }]]);
  assert.equal(log.confirms.length, 0);
  assert.equal(log.toasts.length, 0);
});

test('AC-2 desktop: non-allowlisted asks; Cancel does nothing; Open confirms; Copy copies', async () => {
  const impl = async (_c, a) => a.confirmed ? { opened: true, host: 'example.org' } : { opened: false, reason: 'needs_confirm', host: 'example.org' };
  let t = rig({ invokeImpl: impl, choice: 'cancel' });
  assert.equal((await openExternal('https://example.org/p', t.deps)).reason, 'cancelled');
  assert.equal(t.log.invoke.length, 1);
  assert.deepEqual(t.log.confirms[0], { url: 'https://example.org/p', host: 'example.org', punycodeHost: 'example.org', hasUserinfo: false, port: '' });

  t = rig({ invokeImpl: impl, choice: 'open' });
  assert.equal((await openExternal('https://example.org/p', t.deps)).opened, true);
  assert.deepEqual(t.log.invoke.map(i => i[1].confirmed), [false, true]);

  t = rig({ invokeImpl: impl, choice: 'copy' });
  assert.equal((await openExternal('https://example.org/p', t.deps)).reason, 'copied');
  assert.deepEqual(t.log.copied, ['https://example.org/p']);
  assert.equal(t.log.invoke.length, 1);
});

test('"Always allow" is session-only and skips the dialog next time', async () => {
  const impl = async (_c, a) => a.confirmed ? { opened: true, host: 'example.org' } : { opened: false, reason: 'needs_confirm', host: 'example.org' };
  const t = rig({ invokeImpl: impl, choice: 'always' });
  await openExternal('https://example.org/a', t.deps);
  assert.deepEqual(sessionAllowedHosts(), ['example.org']);
  await openExternal('https://example.org/b', t.deps);
  assert.equal(t.log.confirms.length, 1);
  assert.equal(t.log.invoke.at(-1)[1].confirmed, true);
  resetLinkState();
  assert.deepEqual(sessionAllowedHosts(), []);
});

test('AC-3: unsafe links never reach invoke; toast offers copy', async () => {
  for (const bad of ['http://github.com', 'javascript:alert(1)', 'file:///c:/x', 'data:text/html,x', 'garbage', 'https://u:p@']) {
    const t = rig({ invokeImpl: async () => { throw new Error('must not be called'); } });
    const r = await openExternal(bad, t.deps);
    assert.equal(r.opened, false, bad);
    assert.equal(t.log.invoke.length, 0, bad);
    assert.equal(t.log.toasts[0][0], 'Blocked unsafe link');
    t.log.toasts[0][1].action.run();
    await Promise.resolve();
    assert.deepEqual(t.log.copied, [bad]);
  }
});

test('AC-4: opener failure copies the link and says so', async () => {
  for (const impl of [async () => ({ opened: false, reason: 'error', host: 'github.com' }), async () => { throw new Error('plugin missing'); }]) {
    const t = rig({ invokeImpl: impl });
    const r = await openExternal('https://github.com/x', t.deps);
    assert.equal(r.opened, false);
    assert.deepEqual(t.log.copied, ['https://github.com/x']);
    assert.match(t.log.toasts[0][0], /Couldn.t open your browser — link copied/);
  }
});

test('AC-4: clipboard failure still shows the URL', async () => {
  const t = rig({ invokeImpl: async () => ({ opened: false, reason: 'error' }), copyOk: false });
  await openExternal('https://github.com/x', t.deps);
  assert.match(t.log.toasts[0][0], /https:\/\/github\.com\/x/);
});

test('AC-5 browser mode: same validation, then noopener window', async () => {
  let t = rig({ native: false });
  assert.equal((await openExternal('https://github.com/x', t.deps)).opened, true);
  assert.deepEqual(t.log.opened, [['https://github.com/x', '_blank', 'noopener,noreferrer']]);
  assert.equal(t.log.confirms.length, 0);

  t = rig({ native: false, choice: 'open' });
  await openExternal('https://example.org/', t.deps);
  assert.equal(t.log.confirms.length, 1);
  assert.equal(t.log.opened.length, 1);

  t = rig({ native: false, choice: 'cancel' });
  await openExternal('https://example.org/', t.deps);
  assert.equal(t.log.opened.length, 0);

  t = rig({ native: false });
  await openExternal('http://github.com/', t.deps);
  assert.equal(t.log.opened.length, 0);
  assert.equal(t.log.toasts[0][0], 'Blocked unsafe link');
});

test('rapid repeat opens are debounced for 500 ms', async () => {
  const t = rig({ invokeImpl: async () => ({ opened: true, host: 'github.com' }) });
  let now = 10_000;
  t.deps.now = () => now;
  assert.equal((await openExternal('https://github.com/a', t.deps)).opened, true);
  now += 100;
  assert.equal((await openExternal('https://github.com/b', t.deps)).reason, 'debounced');
  now += 600;
  assert.equal((await openExternal('https://github.com/b', t.deps)).opened, true);
  assert.equal(t.log.invoke.length, 2);
});

test('AC-8 helpers pass paths to Rust and explain refusals', async () => {
  const calls = [];
  const toasts = [];
  const invoke = async (cmd, args) => { calls.push([cmd, args]); return args.path === '/ok' ? { opened: true } : { opened: false, reason: 'not_app_path' }; };
  assert.equal((await openAppPath('/ok', { invoke, toast: (...a) => toasts.push(a) })).opened, true);
  assert.equal((await revealAppPath('/etc/passwd', { invoke, toast: (...a) => toasts.push(a) })).reason, 'not_app_path');
  assert.deepEqual(calls.map(c => c[0]), ['open_path', 'reveal_path']);
  assert.equal(toasts.length, 1);
  assert.equal((await openAppPath('/x', { invoke: null, toast: () => {} })).reason, 'unsupported');
});

// ---------- interceptor (AC-6) ----------
function fakeAnchor(href, attrs = {}) {
  const a = { closest: sel => (sel === 'a[href]' ? a : null), hasAttribute: n => n === 'href' ? href != null : n in attrs, getAttribute: () => href };
  return a;
}

test('interceptTarget leaves in-app links alone and captures the rest', () => {
  const base = 'http://app.test/index.html', origin = 'http://app.test';
  assert.equal(interceptTarget(fakeAnchor('#section'), base, origin), null);
  assert.equal(interceptTarget(fakeAnchor(''), base, origin), null);
  assert.equal(interceptTarget(fakeAnchor('x.html'), base, origin), null);
  assert.equal(interceptTarget(fakeAnchor('blob:http://app.test/1'), base, origin), null);
  assert.equal(interceptTarget(fakeAnchor('https://github.com/x', { download: '' }), base, origin), null);
  assert.equal(interceptTarget(fakeAnchor('https://github.com/x'), base, origin), 'https://github.com/x');
  assert.equal(interceptTarget(fakeAnchor('javascript:alert(1)'), base, origin), 'javascript:alert(1)');
  assert.equal(interceptTarget(fakeAnchor('mailto:a@b.c'), base, origin), 'mailto:a@b.c');
  assert.equal(interceptTarget(fakeAnchor('https://[bad'), base, origin), 'https://[bad');
});

test('installLinkInterceptor: click, ctrl+click and middle-click share one path; window.open is routed', async () => {
  const listeners = {};
  const rootEl = { addEventListener: (t, f, cap) => { listeners[t] = [f, cap]; }, removeEventListener: (t) => { delete listeners[t]; } };
  const savedLoc = globalThis.location, savedOpen = globalThis.open;
  globalThis.location = { origin: 'http://app.test', href: 'http://app.test/' };
  const t = rig({ invokeImpl: async () => ({ opened: true, host: 'github.com' }) });
  try {
    const off = installLinkInterceptor(rootEl, t.deps);
    assert.equal(listeners.click[1], true, 'capture phase');
    assert.ok(listeners.auxclick);
    const ev = (type, button, ctrlKey, href) => {
      const e = { type, button, ctrlKey, target: fakeAnchor(href), prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
      return e;
    };
    const fire = async e => { listeners[e.type][0](e); await new Promise(r => setImmediate(r)); return e; };

    let e = await fire(ev('click', 0, false, 'https://github.com/a'));
    assert.ok(e.prevented && e.stopped);
    e = await fire(ev('click', 0, true, 'https://github.com/b'));
    assert.ok(e.prevented);
    e = await fire(ev('auxclick', 1, false, 'https://github.com/c'));
    assert.ok(e.prevented);
    e = await fire(ev('auxclick', 2, false, 'https://github.com/d'));
    assert.ok(!e.prevented, 'right-click is not a navigation');
    e = await fire(ev('click', 0, false, '#top'));
    assert.ok(!e.prevented);
    assert.equal(t.log.invoke.length, 3);
    assert.deepEqual(t.log.invoke.map(i => i[1].url), ['https://github.com/a', 'https://github.com/b', 'https://github.com/c']);

    assert.equal(globalThis.open('https://github.com/z'), null);
    await new Promise(r => setImmediate(r));
    assert.equal(t.log.invoke.length, 4);
    off();
    assert.equal(globalThis.open, savedOpen);
    assert.equal(listeners.click, undefined);
  } finally {
    globalThis.location = savedLoc;
    globalThis.open = savedOpen;
  }
});

// ---------- repo-wide guards ----------
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out); else if (/\.(js|mjs|html)$/.test(f.name)) out.push(p);
  }
  return out;
}

// Call sites predating FS-07 that the integration job must convert to externalLink(); the list may only shrink.
const PENDING_RAW_LINKS = ['app/ui/screens/devices.js'];
const RAW = [/\bwindow\s*\.\s*open\s*\(/, /target\s*=\s*["']?_blank/, /target\s*:\s*['"]_blank/, /\.target\s*=\s*['"]_blank/, /setAttribute\(\s*['"]target['"]/];

test('guard: no raw window.open or target=_blank in app/ (known pending sites listed)', () => {
  const offenders = [];
  for (const file of walk(path.join(root, 'app'))) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const src = fs.readFileSync(file, 'utf8');
    if (RAW.some(re => re.test(src))) offenders.push(rel);
  }
  assert.deepEqual(offenders.sort(), PENDING_RAW_LINKS.slice().sort(),
    'raw external-link patterns must only appear in the pending list; remove entries from PENDING_RAW_LINKS once converted to externalLink()');
});

test('guard: capabilities grant no opener open-url permission', () => {
  const caps = JSON.parse(read('src-tauri/capabilities/default.json'));
  const ids = caps.permissions.map(p => (typeof p === 'string' ? p : p.identifier));
  assert.ok(!ids.some(i => /^opener:/.test(i)), `no opener permissions expected, got ${ids}`);
  assert.ok(!/allow-open-url/.test(read('src-tauri/capabilities/default.json')));
});

test('guard: CSP is unchanged and has no connect-src/frame-src', () => {
  const csp = JSON.parse(read('src-tauri/tauri.conf.json')).app.security.csp;
  assert.ok(!/connect-src|frame-src/.test(csp));
  assert.match(csp, /^default-src 'self'/);
});

test('guard: Rust commands are registered and the navigation guard is installed', () => {
  const lib = read('src-tauri/src/lib.rs');
  assert.match(lib, /links::open_external_url, links::open_path, links::reveal_path/);
  assert.match(lib, /plugin\(links::navigation_guard\(\)\)/);
  assert.match(lib, /^mod links;$/m);
});
