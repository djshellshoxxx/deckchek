import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ISSUE_REPO, redactText, redactValue, buildIssueUrl, buildSummaryText, capClientError,
  createRateLimiter, installClientErrorHooks, sanitizeLogText,
} from '../app/diagnostics-bundle.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vectors = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/redaction-vectors.json'), 'utf8'));

for (const v of vectors) {
  test(`redaction vector: ${v.name}`, () => {
    assert.equal(redactText(v.input, v.ctx), v.expected);
    assert.equal(redactText(v.expected, v.ctx), v.expected, 'idempotent on its own output');
  });
}

test('redaction: Windows usernames in paths, %USERNAME% value, machine name, emails, serials (AC-6)', () => {
  const ctx = { user: 'JohnDoe', profile: 'C:\\Users\\JohnDoe', host: 'GIGBOX-7', serials: ['A1B2C3D4E5'] };
  const text = [
    'profile=C:\\Users\\JohnDoe\\AppData\\Local\\x',
    'short=c:\\users\\johndo~1\\y',
    'unc=\\\\GIGBOX-7\\c$\\Users\\JohnDoe',
    'USERNAME=JohnDoe COMPUTERNAME=gigbox-7',
    'mail john.doe@mail.example.org',
    'asset serial A1B2C3D4E5 and S/N: QQ99887766',
  ].join('\n');
  const out = redactText(text, ctx);
  for (const secret of ['johndoe', 'gigbox-7', 'johndo~1', 'john.doe@', 'a1b2c3d4e5', 'qq99887766']) {
    assert.ok(!out.toLowerCase().includes(secret), `leaked ${secret}: ${out}`);
  }
});

test('redactValue walks nested JSON and keeps it valid', () => {
  const ctx = { user: 'zed99', profile: '', host: '', serials: [] };
  const v = { a: ['C:\\Users\\zed99\\x', { serial_number: 'ZZ12345678', n: 4, ok: true }], 'zed99': null };
  const out = redactValue(v, ctx);
  assert.deepEqual(out, { a: ['C:\\Users\\<user>\\x', { serial_number: '<serial>', n: 4, ok: true }], '<user>': null });
  JSON.parse(JSON.stringify(out));
});

// Seeded fuzz / property test: random noise with seeded secrets inserted in random casing.
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test('fuzz: no seeded secret survives, output is idempotent, plain text is untouched', () => {
  const rnd = lcg(Number(process.env.FUZZ_SEED ?? 0xdec4c3));
  const pick = a => a[Math.floor(rnd() * a.length)];
  const randCase = s => Array.from(s).map(c => (rnd() < 0.5 ? c.toUpperCase() : c.toLowerCase())).join('');
  const noise = ['', ' ', '\n', '\\', '/', '"', "'", ':', 'abc', 'Users', '<', '>', '@', '.', '-', '_', '😀', 'é', 'serial', 'S/N', '{', '}', 'COM3', '1234', 'x\ty'];
  const ctx = { user: 'zqxjordan', profile: 'C:\\Users\\zqxjordan', host: 'zqxhost-77', serials: ['zqx00ab9917', 'ZQXSN-424242'] };
  const secrets = [
    () => randCase(ctx.user),
    () => `C:\\Users\\${randCase(ctx.user)}\\AppData`,
    () => `${pick(['c', 'D', 'E'])}:${pick(['\\', '/', '\\\\'])}Users${pick(['\\', '/', '\\\\'])}zqx${Math.floor(rnd() * 1e6)}name${pick(['\\', '/', ' ', '"'])}`,
    () => randCase(ctx.host),
    () => randCase(ctx.serials[Math.floor(rnd() * 2)]),
    () => `zqx${Math.floor(rnd() * 1e5)}@${pick(['example.com', 'mail.example.co.uk'])}`,
    () => `${pick(['serial', 'Serial Number', 'S/N', 'serial_number'])}${pick([': ', '=', ' ', '":"'])}ZQ${Math.floor(rnd() * 1e8)}`,
  ];
  for (let n = 0; n < 1500; n++) {
    const parts = [];
    const used = [];
    for (let k = 0; k < 1 + Math.floor(rnd() * 8); k++) {
      if (rnd() < 0.5) parts.push(pick(noise));
      else { const s = pick(secrets)(); used.push(s); parts.push(s); }
    }
    const input = parts.join(pick([' ', '\n', ' | ']));
    const out = redactText(input, ctx);
    const low = out.toLowerCase();
    for (const lit of [ctx.user, ctx.host, ...ctx.serials]) assert.ok(!low.includes(lit.toLowerCase()), `leaked ${lit} in ${JSON.stringify(out)} from ${JSON.stringify(input)}`);
    assert.ok(!/zqx\d+@/i.test(out), `email left: ${out}`);
    assert.ok(!/users[\\/]+zqx/i.test(out), `profile name left: ${out}`);
    assert.ok(!/(?:serial|s\/n)[^A-Za-z0-9<]*zq\d{6,}/i.test(out), `serial left: ${out}`);
    assert.equal(redactText(out, ctx), out, `not idempotent for ${JSON.stringify(input)}`);
  }
  // Text with nothing sensitive is returned unchanged.
  for (let n = 0; n < 300; n++) {
    const s = Array.from({ length: 12 }, () => pick(['The', 'deck', 'capture', 'ok', '12.5 dB', 'Rane', 'MK2', '-3', 'C:\\Program Files\\DeckChek', 'wow & flutter'])).join(' ');
    assert.equal(redactText(s, ctx), s);
  }
});

test('buildIssueUrl: fixed host, encoding, body < 6000 chars, URL cap, unset repo hides button', () => {
  assert.equal(ISSUE_REPO, 'djshellshoxxx/deckchek');
  const u = new URL(buildIssueUrl('a & b #1\nline é 😀', ISSUE_REPO, { title: 'T&C?' }));
  assert.equal(u.origin, 'https://github.com');
  assert.equal(u.pathname, '/djshellshoxxx/deckchek/issues/new');
  assert.equal(u.searchParams.get('title'), 'T&C?');
  assert.ok(u.searchParams.get('body').startsWith('a & b #1\nline é 😀'));
  assert.match(u.searchParams.get('body'), /drag the diagnostics zip/);
  const big = new URL(buildIssueUrl('x'.repeat(50000)));
  assert.ok(Array.from(big.searchParams.get('body')).length < 6000);
  const heavy = buildIssueUrl('é😀&'.repeat(5000));
  assert.ok(heavy.length <= 8000);
  assert.equal(buildIssueUrl('s', ''), null);
  assert.equal(buildIssueUrl('s', 'evil.com/x/../..?a'), null);
  assert.equal(buildIssueUrl('s', 'a/b/c'), null);
});

test('buildSummaryText redacts and never mentions audio payloads', () => {
  const t = buildSummaryText({ appVersion: '0.0.5', os: 'windows', arch: 'x86_64', crashedLastRun: true, lastPanic: 'boom at C:\\Users\\mia\\src\\x.rs:1:1', notIncluded: ['System Health (scan unsupported)'] });
  assert.match(t, /Previous run closed unexpectedly: yes/);
  assert.match(t, /C:\\Users\\<user>\\src/);
  assert.match(t, /Not included: System Health/);
  assert.ok(t.length < 6000);
});

test('capClientError sanitizes control characters and caps lengths', () => {
  const e = capClientError({ kind: 'weird', message: 'a\nb\x00c' + 'z'.repeat(5000), source: 's', line: '12', col: 'x', stack: 'l1\nl2' });
  assert.equal(e.kind, 'error');
  assert.ok(!/[\x00-\x1f]/.test(e.message));
  assert.ok(Array.from(e.message).length <= 1501);
  assert.equal(e.line, 12);
  assert.equal(e.col, null);
  assert.equal(e.stack, 'l1 | l2');
  assert.equal(sanitizeLogText('a\r\nb', 10), 'a |  | b');
  assert.ok(JSON.stringify(e).length < 4096);
});

test('rate limiter allows 20 per minute then recovers (AC-2)', () => {
  let t = 0;
  const l = createRateLimiter(20, 60000, () => t);
  const results = Array.from({ length: 25 }, () => l.allow());
  assert.equal(results.filter(Boolean).length, 20);
  t = 59999; assert.equal(l.allow(), false);
  t = 60000; assert.equal(l.allow(), true);
});

test('installClientErrorHooks forwards errors and rejections, limited, and can be disposed', async () => {
  const listeners = {};
  const target = { addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener: (n) => { delete listeners[n]; } };
  const calls = [];
  const off = installClientErrorHooks(async (cmd, args) => { calls.push([cmd, args]); }, { target, screen: () => 'quick', limiter: createRateLimiter(2, 1000, () => 0) });
  listeners.error({ message: 'boom', filename: 'app.js', lineno: 3, colno: 4, error: { stack: 'S' } });
  listeners.unhandledrejection({ reason: new Error('nope') });
  listeners.error({ message: 'third is dropped' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'log_client_error');
  assert.deepEqual(calls[0][1].entry, { kind: 'error', message: 'boom', source: 'app.js', line: 3, col: 4, stack: 'S', screen: 'quick' });
  assert.equal(calls[1][1].entry.kind, 'unhandledrejection');
  assert.equal(calls[1][1].entry.message, 'nope');
  off();
  assert.deepEqual(Object.keys(listeners), []);
  // a throwing invoke never propagates
  const off2 = installClientErrorHooks(() => { throw new Error('x'); }, { target });
  assert.doesNotThrow(() => listeners.error({ message: 'm' }));
  off2();
});
