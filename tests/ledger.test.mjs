// FS-33 gear ledger: model, privacy, template, page verification script, files. (Leak-grep: ledger-leak.test.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildLedger, previewHtml, ledgerItemId, ledgerPhoto, certificateEntry, compareWithPrevious, LedgerError, LEDGER_EXTS, SINGLE_FILE_MAX_BYTES } from '../app/ledger/build.js';
import { renderLedgerHtml, PAGE_FUNCTIONS, PAGE_SCRIPT, LEDGER_CSP, INTEGRITY_NOTE, embedJson, esc } from '../app/ledger/template.js';
import { canonicalJson, sha256Hex, sha256HexSync, stableJsonText, ledgerItemsSha256 } from '../app/ledger/hash.js';
import {
  PRESETS, FIELD_KEYS, makeRules, normalizeRules, effectiveRules, applyPrivacy, maskSerial, scrubText, stripJpegMetadata, privacySummary, matchesPreset, purchaseMonth,
} from '../app/ledger/privacy.js';
import { inspectJpeg } from '../app/photo-store.js';
import { seededState, tinyJpeg, jpegWithMetadata, CERT_FILE } from './ledger-fixtures.mjs';

const V = JSON.parse(readFileSync(new URL('./fixtures/canonical-vectors.json', import.meta.url), 'utf8'));
const OPTS = { revision: 3, generatedAt: '2026-10-28T10:00:00.000Z' };
const ALL = { items: ['asset-1', 'asset-2'] };
const { lpCanonical, lpSha256, lpDigestHex, lpVerifyCertificate, lpDescribe } = PAGE_FUNCTIONS;

// ---------------------------------------------------------------- hashing

test('canonical JSON is deterministic and the page copy matches the FS-00 vectors byte for byte', async () => {
  const a = { b: [1, 'x', { d: null, c: true }], a: '0.5' }, b = { a: '0.5', b: [1, 'x', { c: true, d: null }] };
  assert.equal(canonicalJson(a), canonicalJson(b));
  for (const v of V.vectors) {
    const value = JSON.parse(v.inputJson);
    assert.equal(lpCanonical(value), v.canonical, v.name);
    assert.equal(await lpDigestHex(lpCanonical(value)), v.sha256, v.name);
  }
  for (const r of V.rejectJson) assert.throws(() => lpCanonical(JSON.parse(r.json)), r.name);
});

test('SHA-256 vectors: empty string, "abc", 1 MB, in the shared module and the inlined page copy', async () => {
  const E = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  assert.equal(await sha256Hex(''), E);
  assert.equal(await sha256Hex('abc'), ABC);
  assert.equal(lpSha256(new TextEncoder().encode('')), E);
  assert.equal(lpSha256(new TextEncoder().encode('abc')), ABC);
  const big = new Uint8Array(1 << 20).map((_, i) => (i * 31) & 255);
  assert.equal(lpSha256(big), createHash('sha256').update(big).digest('hex'));
  for (const n of [55, 56, 63, 64, 65, 119, 120]) {
    const s = 'x'.repeat(n);
    assert.equal(lpSha256(new TextEncoder().encode(s)), sha256HexSync(s), `padding boundary ${n}`);
  }
});

test('ledgerSha256 covers the canonical items and ledger.json is stable, sorted and diffable (AC-7)', async () => {
  const r = await buildLedger(seededState(), ALL, makeRules('public'), OPTS);
  assert.equal(r.ledger.ledgerSha256, await sha256Hex(canonicalJson(r.ledger.items)));
  assert.equal(r.ledger.ledgerSha256, await ledgerItemsSha256(r.ledger.items));
  assert.deepEqual(JSON.parse(r.jsonText), r.ledger);
  assert.equal(r.jsonText, stableJsonText(JSON.parse(r.jsonText)));
  const keys = Object.keys(JSON.parse(r.jsonText));
  assert.deepEqual(keys, [...keys].sort());
  // re-export after one change: the revision counts up and only the changed lines differ
  const s2 = seededState();
  s2.assets[1].condition = 'worn';
  const r2 = await buildLedger(s2, ALL, makeRules('public'), { ...OPTS, revision: 4 });
  const a = r.jsonText.split('\n'), b = r2.jsonText.split('\n');
  assert.equal(a.length, b.length);
  const diff = a.map((l, i) => (l === b[i] ? null : [l, b[i]])).filter(Boolean);
  assert.deepEqual(diff.map(([l]) => l.trim().split(':')[0]).sort(), ['"condition"', '"ledgerSha256"', '"revision"']);
  assert.equal(r2.ledger.revision, 4);
  assert.deepEqual(compareWithPrevious({ revision: 3, ledgerSha256: r.ledger.ledgerSha256, selection: { items: ['asset-1'] } }, r2.ledger, ALL.items),
    { first: false, previousRevision: 3, revision: 4, changed: true, added: 1, removed: 0 });
  assert.equal(compareWithPrevious(null, r2.ledger, ALL.items).first, true);
  // building twice gives identical bytes
  const again = await buildLedger(seededState(), ALL, makeRules('public'), OPTS);
  assert.equal(again.jsonText, r.jsonText);
  assert.equal(again.html, r.html);
});

// ---------------------------------------------------------------- privacy

test('AC-2 privacy presets: snapshot of what each preset includes', async () => {
  const snap = {};
  for (const name of Object.keys(PRESETS)) {
    const r = await buildLedger(seededState(), ALL, makeRules(name), OPTS);
    const it = r.ledger.items.find(i => i.model === 'SL-1200MK4');
    snap[name] = { serialMode: it.serialMode, serial: it.serial ?? null, keys: Object.keys(it).sort() };
  }
  assert.deepEqual(snap, {
    public: { serialMode: 'hidden', serial: null, keys: ['category', 'condition', 'firmware', 'id', 'manufacturer', 'model', 'photos', 'publicNotes', 'serialMode', 'service'] },
    insurance: { serialMode: 'masked', serial: '****9902', keys: ['category', 'condition', 'firmware', 'id', 'manufacturer', 'model', 'nickname', 'photos', 'publicNotes', 'purchaseDate', 'serial', 'serialMode', 'service'] },
    private: { serialMode: 'full', serial: 'SN-SEEDED-7731-9902', keys: ['category', 'condition', 'firmware', 'id', 'manufacturer', 'model', 'nickname', 'photos', 'publicNotes', 'purchaseDate', 'serial', 'serialMode', 'service'] },
  });
  for (const name of Object.keys(PRESETS)) assert.equal(PRESETS[name].fields.notes, false, `${name}: private notes are excluded unless ticked`);
  assert.equal(PRESETS.public.fields.certificates, false);
  assert.equal(PRESETS.insurance.fields.certificates, false);
  const pub = await buildLedger(seededState(), ALL, makeRules('public'), OPTS);
  assert.deepEqual(pub.ledger.privacy.excluded.slice(0, 3), ['price', 'location', 'venue']);
  assert.ok(pub.ledger.privacy.excluded.includes('notes'));
});

test('AC-2 serial masking keeps the last 4 characters, never the whole of a short serial', () => {
  assert.equal(maskSerial('SN-0001234', 'masked'), '****1234');
  assert.equal(maskSerial('SN-0001234', 'full'), 'SN-0001234');
  assert.equal(maskSerial('SN-0001234', 'hidden'), null);
  assert.equal(maskSerial('SN-0001234', 'bogus'), null);
  assert.equal(maskSerial('ABC12', 'masked'), '****12');
  assert.equal(maskSerial('1234', 'masked'), '****34');
  assert.equal(maskSerial('7', 'masked'), '****');
  assert.equal(maskSerial('', 'full'), null);
  assert.equal(maskSerial(null, 'full'), null);
});

test('per-item overrides beat the global toggles; untrusted rules are normalised to known keys', () => {
  const r = normalizeRules({ preset: 'public', serialMode: 'masked', fields: { nickname: 'yes', certificates: true, evil: true }, items: { 'asset-1': { include: true, serialMode: 'full', fields: { nickname: true, bogus: 1 } }, '': { include: false } }, ownerName: '  DJ\u0007 Example\n ' });
  assert.equal(r.preset, 'public');
  assert.equal(r.fields.nickname, false, 'non-boolean ignored');
  assert.equal(r.fields.certificates, true);
  assert.equal('evil' in r.fields, false);
  assert.deepEqual(r.items, { 'asset-1': { include: true, serialMode: 'full', fields: { nickname: true } } });
  assert.equal(r.ownerName, 'DJ Example');
  assert.deepEqual(effectiveRules(r, 'asset-1').serialMode, 'full');
  assert.equal(effectiveRules(r, 'asset-1').fields.nickname, true);
  assert.equal(effectiveRules(r, 'other').fields.nickname, false);
  assert.equal(effectiveRules(r, 'other').serialMode, 'masked');
  assert.deepEqual(normalizeRules(null), makeRules('public'), 'missing rules fall back to Public');
  assert.equal(normalizeRules({ preset: 'nope' }).preset, 'public');
  assert.ok(matchesPreset(makeRules('insurance')));
  assert.ok(!matchesPreset({ ...makeRules('insurance'), serialMode: 'full' }));
  assert.deepEqual(Object.keys(makeRules('private').fields), FIELD_KEYS);
});

test('applyPrivacy is a whitelist: unknown record fields never pass through', () => {
  const out = applyPrivacy({ assetId: 'x', manufacturer: 'Rane', model: 'Twelve MK2', nickname: 'N', serialNumber: '12345678', notes: 'secret', venueName: 'Club', price: 999, location: 'home', productId: 'p' }, makeRules('private'));
  assert.deepEqual(Object.keys(out).sort(), ['manufacturer', 'model', 'nickname', 'serial', 'serialMode']);
  assert.equal(purchaseMonth('2023-05-14T00:00:00Z'), '2023-05');
  assert.equal(purchaseMonth('2023-13'), null);
  assert.equal(purchaseMonth('May 2023'), null);
});

test('scrubText removes paths (with the user names in them) and control characters', () => {
  assert.equal(scrubText('see C:\\Users\\sheldon\\x.jpg now'), 'see [path removed] now');
  assert.equal(scrubText('see /home/sheldon/Pictures/a.jpg'), 'see [path removed]');
  assert.equal(scrubText('(~/Desktop/a.jpg)'), '([path removed])');
  assert.equal(scrubText('\\\\nas\\share\\deck.jpg'), '[path removed]');
  assert.equal(scrubText('file:///Users/sheldon/a.jpg'), '[path removed]');
  assert.equal(scrubText('33/45 rpm and 1/2 inch'), '33/45 rpm and 1/2 inch', 'fractions are not paths');
  assert.equal(scrubText('a\u0000b\u0007c\u2028d'), 'abcd');
  assert.equal(scrubText('x'.repeat(50), 10), `${'x'.repeat(9)}…`);
  assert.equal(scrubText(42), '');
});

// ---------------------------------------------------------------- photos (AC-5)

test('AC-5 photos: metadata segments (EXIF/GPS, ICC, comments, JFIF) are stripped and the result is a valid JPEG', async () => {
  const src = jpegWithMetadata();
  const out = stripJpegMetadata(src);
  const latin = Buffer.from(out).toString('latin1');
  for (const s of ['Exif', 'GPS', 'sheldon', 'ICC_PROFILE', 'JFIF']) assert.ok(!latin.includes(s), s);
  assert.deepEqual(inspectJpeg(out), { width: 4, height: 3 });
  assert.deepEqual([...out.slice(-2)], [0xff, 0xd9]);
  assert.throws(() => stripJpegMetadata(Uint8Array.from([1, 2, 3, 4])), /not a JPEG/);
  assert.throws(() => stripJpegMetadata(src.slice(0, 30)), /truncated|corrupt/);
  const withTrailer = Uint8Array.from([...tinyJpeg(), ...Buffer.from('trailing secret')]);
  assert.ok(!Buffer.from(stripJpegMetadata(withTrailer)).toString('latin1').includes('secret'), 'data after EOI is dropped');
});

test('AC-5 photos: oversize stored photos are re-encoded through the injected encoder or skipped as partial', async () => {
  const big = tinyJpeg(2400, 1200);
  assert.match((await ledgerPhoto(big)).skip, /long edge/);
  const fixed = await ledgerPhoto(big, { reencode: async () => tinyJpeg(1600, 800) });
  assert.equal(fixed.width, 1600);
  assert.match((await ledgerPhoto(new Uint8Array(0))).skip, /could not be read/);
  const s = seededState();
  s.photos['asset-2'][0].bytes = Uint8Array.from([1, 2, 3]);
  const r = await buildLedger(s, ALL, makeRules('public'), OPTS);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].what, 'photo');
  const it = r.ledger.items.find(i => i.model === 'SL-1200MK4');
  assert.equal(it.photos.length, 2);
  assert.equal(it.photos[1].alt, 'Tonearm close-up');
  assert.match(it.photos[0].alt, /photo 1$/, 'generated alt text when the caption is only a path');
  assert.equal(r.summary.altGenerated, 1);
  for (const p of it.photos) assert.match(p.path, /^assets\/a[0-9a-f]{10}\/p\d\.jpg$/);
  const f = r.files.find(x => x.relPath === `ledger/${it.photos[0].path}`);
  assert.equal(it.photos[0].sha256, await sha256Hex(Buffer.from(f.base64, 'base64')));
});

// ---------------------------------------------------------------- template and escaping

test('HTML escapes every user string (<script>, quotes) and the data block cannot close its script tag', async () => {
  const s = seededState();
  s.assets[0].nickname = '<script>alert("x")</script> \'q\' & "dq"';
  s.assets[0].condition = '</script><img src=x onerror=alert(1)>';
  s.photos['asset-1'][1].altText = '"><svg onload=alert(2)>';
  const r = await buildLedger(s, ALL, makeRules('private'), OPTS);
  const html = r.html;
  assert.ok(!html.includes('<script>alert'), 'nickname escaped');
  assert.ok(!html.includes('<img src=x'), 'condition escaped');
  assert.ok(!html.includes('<svg onload'), 'alt escaped');
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
  assert.equal((html.match(/<script/g) || []).length, 2, 'exactly the data block and the verification script');
  assert.equal((html.match(/<\/script>/g) || []).length, 2);
  const block = html.slice(html.indexOf('id="ledger-data">') + 17, html.indexOf('</script>', html.indexOf('id="ledger-data">')));
  assert.deepEqual(JSON.parse(block), r.ledger);
  assert.ok(!embedJson({ a: '</script>\u2028' }).includes('<'));
  assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  assert.ok(!PAGE_SCRIPT.toLowerCase().includes('</script'), 'the inline script cannot end the tag early');
});

test('AC-3 the page is self-contained: CSP blocks network, no external URLs, inline CSS and script, semantic structure', async () => {
  const r = await buildLedger(seededState(), ALL, makeRules('private'), OPTS);
  const html = r.html;
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${LEDGER_CSP}">`));
  assert.match(LEDGER_CSP, /default-src 'none'/);
  assert.ok(!/(src|href)="(https?:|\/\/)/i.test(html), 'no remote src/href');
  assert.ok(!/<link\b/i.test(html), 'no external stylesheets');
  assert.ok(!/@import|url\(/i.test(html.slice(html.indexOf('<style>'), html.indexOf('</style>'))), 'no CSS fetches');
  assert.ok(!/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|import\(/.test(PAGE_SCRIPT), 'the script makes no requests');
  assert.match(html, /<html lang="en">/);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  assert.equal((html.match(/<article class="item"/g) || []).length, 2);
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /@media print/);
  assert.ok(html.includes(esc(INTEGRITY_NOTE)), 'integrity-not-authenticity copy (spec §6)');
  assert.match(INTEGRITY_NOTE, /not proof/);
  for (const m of html.matchAll(/<img [^>]*>/g)) assert.match(m[0], /alt="[^"]+"/, 'every image has alt text');
  assert.match(previewHtml(r, 'dark'), /<html lang="en" class="theme-dark">/);
  assert.ok(!previewHtml(r, 'light').includes('lpMain'), 'the sandboxed preview carries no script');
  assert.ok(previewHtml(r, 'light').includes('data:image/jpeg;base64,'));
  // unsafe photo sources are dropped
  const bad = renderLedgerHtml({ ...r.ledger, items: [{ ...r.ledger.items[0], photos: [{ path: 'x', alt: 'a', width: 1, height: 1 }] }] }, { photoSrc: () => 'https://evil.example/x.jpg' });
  assert.ok(!bad.includes('evil.example'));
});

test('AC-1 folder export file list: ledger/index.html, ledger.json, assets/*.jpg, certificate files; extensions allowed', async () => {
  const r = await buildLedger(seededState(), ALL, makeRules('private'), OPTS);
  const paths = r.files.map(f => f.relPath);
  assert.equal(paths[0], 'ledger/index.html');
  assert.equal(paths[1], 'ledger/ledger.json');
  assert.equal(paths.filter(p => /^ledger\/assets\/a[0-9a-f]{10}\/p\d+\.jpg$/.test(p)).length, 3);
  assert.equal(paths.filter(p => /^ledger\/certificates\/c-[0-9a-f]{12}\.deckchek-cert\.json$/.test(p)).length, 1);
  for (const f of r.files) {
    assert.ok(LEDGER_EXTS.includes(f.relPath.split('.').pop()), f.relPath);
    assert.ok(!f.relPath.includes('..') && !f.relPath.startsWith('/') && !/[\\:]/.test(f.relPath), f.relPath);
    assert.ok((f.text == null) !== (f.base64 == null), 'exactly one of text or base64');
  }
  assert.deepEqual([...LEDGER_EXTS], ['html', 'json', 'jpg'], 'no script or stylesheet files');
  assert.equal(ledgerItemId('asset-1'), ledgerItemId('asset-1'));
  assert.ok(!paths.some(p => p.includes('asset-1')), 'file names come from opaque ids, not asset ids');
});

test('single-file mode embeds photos as data URIs and refuses more than 5 MB of photos', async () => {
  const r = await buildLedger(seededState(), ALL, makeRules('public'), { ...OPTS, mode: 'single' });
  assert.deepEqual(r.files.map(f => f.relPath), ['index.html']);
  assert.equal((r.html.match(/src="data:image\/jpeg;base64,/g) || []).length, 3);
  assert.ok(!r.html.includes('src="assets/'));
  const s = seededState();
  // three ~1.5 MB photos (padding as large DQT segments) = more than 5 MB once base64-encoded
  const pad = i => Array.from({ length: 24 }, () => [0xff, 0xdb, 0xff, 0xff, ...new Array(0xfffd).fill(i)]).flat();
  s.photos['asset-1'] = [1, 2, 3].map(i => ({ altText: `p${i}`, bytes: tinyJpeg(1600, 1200, pad(i), i) }));
  const folder = await buildLedger(s, ALL, makeRules('public'), OPTS);
  assert.ok(folder.photoBytes * 4 / 3 > SINGLE_FILE_MAX_BYTES);
  assert.equal(folder.singleFileOk, false);
  await assert.rejects(buildLedger(s, ALL, makeRules('public'), { ...OPTS, mode: 'single' }), e => e instanceof LedgerError && e.code === 'single_file_too_large');
});

test('empty selection, excluded items and unknown ids are errors, not empty ledgers', async () => {
  await assert.rejects(buildLedger(seededState(), { items: [] }, makeRules('public'), OPTS), e => e.code === 'empty');
  await assert.rejects(buildLedger(seededState(), { items: ['nope'] }, makeRules('public'), OPTS), e => e.code === 'empty');
  const rules = makeRules('public');
  rules.items['asset-1'] = { include: false };
  const r = await buildLedger(seededState(), ALL, rules, OPTS);
  assert.deepEqual(r.ledger.items.map(i => i.model), ['PLX-CRSS12']);
});

// ---------------------------------------------------------------- schema

test('ledger.json v1 schema: required keys and value types', async () => {
  const r = await buildLedger(seededState(), ALL, makeRules('private'), OPTS);
  const L = JSON.parse(r.jsonText);
  assert.equal(L.format, 'deckchek-ledger');
  assert.equal(L.version, 1);
  assert.equal(L.revision, 3);
  assert.equal(L.generatedAt, '2026-10-28T10:00:00.000Z');
  assert.match(L.ledgerSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(L.privacy).sort(), ['excluded', 'included', 'preset', 'serialMode']);
  assert.equal(L.owner, undefined, 'no owner block unless a display name was typed');
  for (const it of L.items) {
    assert.match(it.id, /^a[0-9a-f]{10}$/);
    assert.ok(['hidden', 'masked', 'full'].includes(it.serialMode));
    for (const p of it.photos || []) { assert.deepEqual(Object.keys(p).sort(), ['alt', 'height', 'path', 'sha256', 'width']); assert.ok(Number.isInteger(p.width)); }
    for (const s of it.service || []) { assert.match(s.at, /^\d{4}-\d{2}-\d{2}$/); assert.equal(typeof s.type, 'string'); }
    for (const c of it.certificates || []) assert.deepEqual(Object.keys(c).sort(), ['fingerprint', 'id', 'issuedAt', 'kind', 'sha256', 'signed', 'toolVersion', 'validUntil', 'verdict']);
  }
  assert.doesNotThrow(() => canonicalJson(L), 'everything is canonical-JSON safe (integers and strings only)');
  const owned = await buildLedger(seededState(), ALL, { ...makeRules('public'), ownerName: 'DJ Example' }, OPTS);
  assert.deepEqual(owned.ledger.owner, { displayName: 'DJ Example' });
});

// ---------------------------------------------------------------- certificates (AC-4)

test('AC-4 certificates are embedded unchanged (never re-signed) and stay verifiable', async () => {
  const r = await buildLedger(seededState(), ALL, makeRules('private'), OPTS);
  const c = r.ledger.items.find(i => i.model === 'PLX-CRSS12').certificates[0];
  assert.deepEqual(c.signed, JSON.parse(CERT_FILE));
  assert.equal(c.sha256, JSON.parse(CERT_FILE).integrity.contentHash);
  const file = r.files.find(f => f.relPath.endsWith('.deckchek-cert.json'));
  assert.deepEqual(JSON.parse(file.text), JSON.parse(CERT_FILE));
  const { verifyCertificateText } = await import('../app/certificate.js');
  const rep = await verifyCertificateText(file.text, { now: Date.parse('2026-10-28T00:00:00Z') });
  assert.notEqual(rep.status, 'modified', 'the FS-20 verifier still accepts the exported file');
  assert.equal(rep.contentHash, c.sha256);
});

test('AC-4 page script: good certificate matches, tampered one shows mismatch, drafts and junk are invalid', async () => {
  const good = JSON.parse(CERT_FILE);
  const ok = await lpVerifyCertificate(good, good.integrity.contentHash);
  assert.equal(ok.status, 'match');
  assert.equal(ok.listed, true);
  assert.ok(ok.signature === true || ok.signature === null, `signature ${ok.signature}`);
  assert.match(lpDescribe(ok), /^✓ Match/);
  if (ok.signature === null) assert.match(lpDescribe(ok), /signature not checked by this browser/);
  const bad = structuredClone(good);
  bad.payload.verdict = 'fail';
  const mm = await lpVerifyCertificate(bad, good.integrity.contentHash);
  assert.equal(mm.status, 'mismatch');
  assert.match(lpDescribe(mm), /^✗ Mismatch/);
  const forged = structuredClone(good);
  forged.integrity.signature = Buffer.alloc(64, 1).toString('base64');
  const fr = await lpVerifyCertificate(forged);
  assert.ok(fr.signature === false || fr.signature === null);
  const draft = structuredClone(good); delete draft.integrity;
  assert.equal((await lpVerifyCertificate(draft)).status, 'invalid');
  assert.equal((await lpVerifyCertificate({ format: 'deckchek-certificate', version: 9 })).status, 'invalid');
  assert.equal((await lpVerifyCertificate('nope')).status, 'invalid');
  assert.match(lpDescribe(await lpVerifyCertificate({ ...good }, 'f'.repeat(64))), /differs from the one listed/);
});

test('tampered or unsigned stored certificates are left out of the ledger with a reason', async () => {
  const bad = JSON.parse(CERT_FILE); bad.payload.verdict = 'fail';
  assert.match((await certificateEntry({ fileJson: JSON.stringify(bad) })).skip, /no longer matches/);
  const draft = JSON.parse(CERT_FILE); delete draft.integrity;
  assert.match((await certificateEntry({ fileJson: JSON.stringify(draft) })).skip, /drafts/);
  assert.match((await certificateEntry({ fileJson: '{' })).skip, /not valid JSON/);
  assert.match((await certificateEntry({})).skip, /no file/);
  const s = seededState(); s.certificates['asset-2'][0].fileJson = JSON.stringify(bad);
  const r = await buildLedger(s, ALL, makeRules('private'), OPTS);
  assert.equal(r.ledger.items.find(i => i.model === 'PLX-CRSS12').certificates, undefined);
  assert.equal(r.skipped[0].what, 'certificate');
});

test('privacy summary lists every field with counts, photos, certificates and warnings', async () => {
  const rules = makeRules('private');
  const r = await buildLedger(seededState(), ALL, rules, OPTS);
  const s = privacySummary(r.ledger, rules);
  assert.equal(s.items, 2);
  assert.equal(s.photos, 3);
  assert.equal(s.certificates, 1);
  assert.equal(s.fields.find(f => f.key === 'serial').detail, '2 full, 0 masked, 0 hidden');
  assert.equal(s.fields.find(f => f.key === 'notes').items, 0);
  assert.ok(s.warnings.some(w => /full serial number, the tester name/.test(w)));
  assert.deepEqual(s.never.map(n => n.key), ['price', 'location', 'paths', 'exif']);
  const pub = privacySummary((await buildLedger(seededState(), ALL, makeRules('public'), OPTS)).ledger, makeRules('public'));
  assert.equal(pub.certificates, 0);
  assert.deepEqual(pub.warnings, []);
});
