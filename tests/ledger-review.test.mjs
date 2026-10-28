// FS-33 review fixes (regressions) in the ledger engine: privacy rules, path scrubbing, certificates under the
// Photos toggle, the single-file size, service labels. The desktop bridge fixes are in ledger-review-bridge.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLedger, LedgerError, SINGLE_FILE_MAX_BYTES } from '../app/ledger/build.js';
import { makeRules, normalizeRules, effectiveRules, scrubText, privacySummary, PATH_PLACEHOLDER, FIELDS } from '../app/ledger/privacy.js';
import { seededState, exportedText, CERT_FILE } from './ledger-fixtures.mjs';

const OPTS = { revision: 3, generatedAt: '2026-10-28T10:00:00.000Z' };
const ALL = { items: ['asset-1', 'asset-2'] };
const CERT = JSON.parse(CERT_FILE);
const CERT_PHOTO_NAME = CERT.payload.unit.photos[0].name;
const CERT_DEVICE = CERT.payload.measurements.find(m => m.calibration?.refId).calibration.refId.split('|')[0];

// ---------------------------------------------------------------- privacy rules

test('regression: per-item overrides beyond 500 stale empty entries still apply at build time', async () => {
  const rules = makeRules('private');
  for (let i = 0; i < 520; i++) rules.items[`stale-${i}`] = {};
  rules.items['asset-1'] = { serialMode: 'hidden', fields: { photos: false } };
  const n = normalizeRules(rules);
  assert.deepEqual(n.items['asset-1'], { serialMode: 'hidden', fields: { photos: false } }, 'empty entries do not use up the cap');
  assert.equal(effectiveRules(n, 'asset-1').serialMode, 'hidden');
  const r = await buildLedger(seededState(), ALL, rules, OPTS);
  const it = r.ledger.items.find(i => i.model === 'SL-1200MK4');
  assert.equal(it.serial, undefined);
  assert.equal(it.serialMode, 'hidden');
  assert.equal(it.photos, undefined);
  // non-empty overrides for units outside the selection never push a selected unit's override out either
  const many = makeRules('private');
  for (let i = 0; i < 600; i++) many.items[`other-${i}`] = { serialMode: 'full' };
  many.items['asset-1'] = { serialMode: 'hidden' };
  const r2 = await buildLedger(seededState(), ALL, many, OPTS);
  assert.equal(r2.ledger.items.find(i => i.model === 'SL-1200MK4').serial, undefined);
});

// ---------------------------------------------------------------- scrubText

test('regression: scrubText removes quoted and bracketed POSIX and home paths', () => {
  assert.equal(scrubText('see "/Users/sheldon/Gear/x.jpg"'), `see "${PATH_PLACEHOLDER}"`);
  assert.equal(scrubText("see '/home/sheldon/a/b.txt'"), `see '${PATH_PLACEHOLDER}'`);
  assert.equal(scrubText('see [/home/sheldon/a/b]'), `see [${PATH_PLACEHOLDER}]`);
  assert.equal(scrubText('"~/Docs/x"'), `"${PATH_PLACEHOLDER}"`);
  assert.equal(scrubText('Receipt:"/Users/sheldon/x.pdf"'), `Receipt:"${PATH_PLACEHOLDER}"`);
  assert.equal(scrubText('path</Users/jane/a.jpg>'), `path<${PATH_PLACEHOLDER}>`);
  assert.equal(scrubText('x {/home/a/b}'), `x {${PATH_PLACEHOLDER}}`);
  assert.equal(scrubText('x "C:\\Users\\jo\\a.wav"'), `x "${PATH_PLACEHOLDER}"`);
  for (const s of ['see "/Users/sheldon/Gear/x.jpg"', "'/home/sheldon/a'", '[~/Music/a]']) assert.ok(!/sheldon|Music/.test(scrubText(s)), s);
});

test('regression: scrubText keeps web URLs intact and only removes file:// URLs or URLs with a user path', () => {
  assert.equal(scrubText('Manual: https://www.technics.com/global/support'), 'Manual: https://www.technics.com/global/support');
  assert.equal(scrubText('See (http://example.com/a/b?x=1#y).'), 'See (http://example.com/a/b?x=1#y).');
  assert.equal(scrubText('path:/home/bob/x'), `path:${PATH_PLACEHOLDER}`);
  assert.equal(scrubText('Open file:///Users/sheldon/a.jpg now'), `Open ${PATH_PLACEHOLDER} now`);
  assert.equal(scrubText('http://localhost/Users/sheldon/x.jpg'), PATH_PLACEHOLDER);
  assert.equal(scrubText('https://nas.local/home/sheldon/deck.jpg'), PATH_PLACEHOLDER);
  assert.equal(scrubText('33/45 rpm and 1/2 inch'), '33/45 rpm and 1/2 inch');
});

// ---------------------------------------------------------------- certificates and the Photos toggle

test('regression: a certificate with photos is left out (with a reason) when Photos is off for that item', async () => {
  assert.ok(CERT.payload.unit.photos.length > 0, 'fixture certificate carries a photo');
  const rules = makeRules('private');
  rules.items['asset-2'] = { fields: { photos: false } };
  const r = await buildLedger(seededState(), ALL, rules, OPTS);
  const it = r.ledger.items.find(i => i.model === 'PLX-CRSS12');
  assert.equal(it.certificates, undefined);
  assert.equal(it.photos, undefined);
  assert.ok(r.skipped.some(s => s.what === 'certificate' && /Photos is off/.test(s.reason)), JSON.stringify(r.skipped));
  const text = exportedText(r.files);
  assert.ok(!text.includes(CERT.payload.unit.photos[0].dataB64.slice(0, 40)), 'no certificate photo bytes');
  assert.ok(!text.includes(CERT_PHOTO_NAME), 'no certificate photo file name');
  assert.ok(!r.files.some(f => f.relPath.includes('certificates/')));
  // a certificate without photos stays verifiable and included under the same rules
  const noPhotos = structuredClone(CERT);
  noPhotos.payload.unit.photos = [];
  const { canonicalJson, sha256Hex } = await import('../app/ledger/hash.js');
  noPhotos.integrity.contentHash = await sha256Hex(canonicalJson(noPhotos.payload));
  const s = seededState(); s.certificates['asset-2'][0].fileJson = JSON.stringify(noPhotos);
  const r2 = await buildLedger(s, ALL, rules, OPTS);
  assert.equal(r2.ledger.items.find(i => i.model === 'PLX-CRSS12').certificates.length, 1);
});

test('regression: the summary counts certificate photos and names their file names and the device labels', async () => {
  const rules = makeRules('private');
  const r = await buildLedger(seededState(), ALL, rules, OPTS);
  const s = privacySummary(r.ledger, rules);
  assert.equal(s.certificatePhotos, 1);
  assert.equal(s.photos, 4, '3 ledger photos + 1 certificate photo');
  const w = s.warnings.find(x => /signed certificate/.test(x));
  assert.match(w, /full serial number, the tester name/);
  assert.ok(w.includes(CERT_PHOTO_NAME), w);
  assert.ok(w.includes(CERT_DEVICE), w);
  assert.match(w, /1 photo/);
  const hint = FIELDS.find(f => f.key === 'certificates').hint;
  assert.match(hint, /photo/i);
  assert.match(hint, /file names/);
  assert.match(hint, /device/);
});

// ---------------------------------------------------------------- single file

test('regression: the single-file 5 MB cap counts certificate JSON and never points to a missing certificate file', async () => {
  const big = structuredClone(CERT);
  // ~5.4 MB of certificate photos (one photo, valid base64), re-hashed so it stays a valid stored certificate
  big.payload.unit.photos = [{ ...big.payload.unit.photos[0], dataB64: 'A'.repeat(5.4 * 1024 * 1024) }];
  const { canonicalJson, sha256Hex } = await import('../app/ledger/hash.js');
  big.integrity.contentHash = await sha256Hex(canonicalJson(big.payload));
  const s = seededState(); s.certificates['asset-2'][0].fileJson = JSON.stringify(big);
  const folder = await buildLedger(s, ALL, makeRules('private'), OPTS);
  assert.ok(folder.photoBytes * 4 / 3 < SINGLE_FILE_MAX_BYTES, 'the ledger photos alone are small');
  assert.equal(folder.singleFileOk, false);
  await assert.rejects(buildLedger(s, ALL, makeRules('private'), { ...OPTS, mode: 'single' }), e => e instanceof LedgerError && e.code === 'single_file_too_large' && /certificate/.test(e.message));
  // a certificate over the inline limit in a single file: no mention of a certificate file that is not there
  const mid = structuredClone(CERT);
  mid.payload.unit.photos = [{ ...mid.payload.unit.photos[0], dataB64: 'A'.repeat(300 * 1024) }];
  mid.integrity.contentHash = await sha256Hex(canonicalJson(mid.payload));
  const s2 = seededState(); s2.certificates['asset-2'][0].fileJson = JSON.stringify(mid);
  const single = await buildLedger(s2, ALL, makeRules('private'), { ...OPTS, mode: 'single' });
  assert.ok(!/use the certificate file/.test(single.html));
  assert.match(single.html, /too large to show here/);
  const folder2 = await buildLedger(s2, ALL, makeRules('private'), OPTS);
  assert.match(folder2.html, /use the certificate file/);
});

// ---------------------------------------------------------------- service labels

test('regression: stylus replacements are labelled "Stylus replaced", not "Other maintenance"', async () => {
  const s = seededState();
  s.service['asset-2'] = [{ eventType: 'stylus_replaced', eventAt: '2026-03-01T12:00:00.000Z', description: '' }];
  const r = await buildLedger(s, ALL, makeRules('public'), OPTS);
  assert.deepEqual(r.ledger.items.find(i => i.model === 'PLX-CRSS12').service, [{ at: '2026-03-01', type: 'Stylus replaced' }]);
});
