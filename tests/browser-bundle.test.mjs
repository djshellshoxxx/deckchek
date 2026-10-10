import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrowserBundleParts, buildBrowserBundleZip, summarizeRuns, sha256Hex } from '../app/browser-bundle.js';
import { crc32 } from '../app/zip-writer.js';

const runs = [
  { id: 'r1', test: 'speed', createdAt: '2026-10-10T10:00:00Z', score: 91.5, findings: [{ title: 'Wow low' }, { code: 'x' }], evidence: { left: new Array(5000).fill(0.1) }, measurements: [1, 2] },
  { id: 'r2', test: 'dvs', createdAt: '2026-10-09T10:00:00Z', score: NaN, findings: [] },
];
const text = (parts, n) => new TextDecoder().decode(parts.files.find(f => f.name === n).data);

test('summarizeRuns drops evidence, clamps count, keeps titles', () => {
  const s = summarizeRuns(runs, 10);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0].findings, ['Wow low', 'x']);
  assert.equal(s[1].score, null);
  assert.equal(JSON.stringify(s).includes('evidence'), false);
  assert.equal(summarizeRuns(runs, 0).length, 1);
  assert.equal(summarizeRuns(null, 3).length, 0);
});

test('bundle parts: manifest first, hashes match, no logs, partial notes', async () => {
  const r = await buildBrowserBundleParts({ appVersion: '0.0.5', settings: { theme: 'dark' }, runs, runCount: 1, system: { locale: 'en-GB' }, now: new Date('2026-10-10T12:00:00Z') });
  assert.equal(r.files[0].name, 'manifest.json');
  assert.deepEqual(r.files.map(f => f.name), ['manifest.json', 'summary.txt', 'system.json', 'settings.json', 'runs-summary.json']);
  assert.equal(r.files.some(f => f.name.startsWith('logs/')), false);
  const m = JSON.parse(text(r, 'manifest.json'));
  assert.equal(m.bundleVersion, 1);
  for (const p of m.parts) {
    const f = r.files.find(x => x.name === p.name);
    assert.equal(p.sha256, await sha256Hex(f.data));
    assert.equal(p.bytes, f.data.length);
  }
  assert.equal(JSON.parse(text(r, 'runs-summary.json')).runs.length, 1);
  assert.ok(r.parts.some(p => p.name === 'system-health.json' && p.status === 'skipped'));
  assert.ok(r.parts.some(p => p.name === 'logs/' && p.status === 'skipped'));
});

test('redaction applies to every text part (seeded values)', async () => {
  const ctx = { user: 'alice', profile: 'C:\\Users\\alice', host: 'ALICE-PC', serials: ['SN12345678'] };
  const r = await buildBrowserBundleParts({
    appVersion: '0.0.5', redact: true, redactCtx: ctx,
    settings: { path: 'C:\\Users\\alice\\Music\\x.wav', note: 'host ALICE-PC owner alice@example.com', serial: 'SN12345678' },
    runs: [{ id: 'r', test: 'alice test', findings: [{ title: 'Serial SN12345678 noisy' }] }],
    system: { os: { name: 'windows' } }, systemHealth: { status: 'warn', titles: ['Driver on ALICE-PC'] },
  });
  const all = r.files.map(f => new TextDecoder().decode(f.data)).join('\n');
  for (const secret of ['alice', 'ALICE-PC', 'SN12345678', 'example.com']) assert.equal(all.toLowerCase().includes(secret.toLowerCase()), false, secret);
  assert.ok(r.files.some(f => f.name === 'system-health.json'));
});

test('zip output has matching central directory count', async () => {
  const r = await buildBrowserBundleZip({ appVersion: '0.0.5', settings: {}, runs: [] });
  const v = new DataView(r.zip.buffer, r.zip.byteOffset, r.zip.byteLength);
  assert.equal(v.getUint16(r.zip.length - 22 + 10, true), r.files.length);
  assert.equal(crc32(r.files[0].data) > 0, true);
});
