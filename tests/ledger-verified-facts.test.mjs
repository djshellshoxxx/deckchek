import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { renderLedgerHtml } from '../app/ledger/template.js';
import { canonicalJson } from '../app/canonical-json.js';
import { CERT_FILE } from './ledger-fixtures.mjs';

const goodCertificate = () => JSON.parse(CERT_FILE);
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = async (_algorithm, bytes) => Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer;
const hashOnlyCrypto = { subtle: { digest } };
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

function rehash(file) {
  file.integrity.contentHash = hash(canonicalJson(file.payload));
  return file;
}

// Execute the script extracted from the actual exported HTML. Only the DOM boundary
// is substituted; hashing, certificate verification and both click handlers are real.
function exportedPage(file = goodCertificate(), { crypto = webcrypto, summary = {} } = {}) {
  const certificate = {
    id: 'c-fixture', kind: 'deckchek-certificate', verdict: file.payload.verdict,
    issuedAt: file.payload.issuedAt, fingerprint: file.integrity.fingerprint,
    sha256: file.integrity.contentHash, signed: file, ...summary,
  };
  const items = [{ id: 'unit', model: 'Fixture unit', certificates: [certificate] }];
  const ledger = { format: 'deckchek-ledger', version: 1, items, ledgerSha256: hash(canonicalJson(items)) };
  const html = renderLedgerHtml(ledger);
  const data = html.match(/<script type="application\/json" id="ledger-data">([\s\S]*?)<\/script>/)[1];
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  const element = (id, attrs = {}) => {
    const listeners = new Map(), waiters = [];
    let text = '';
    const el = {
      hidden: true, value: '',
      get textContent() { return text; },
      set textContent(value) {
        text = String(value);
        for (let i = waiters.length - 1; i >= 0; i--) {
          if (waiters[i].predicate(text)) waiters.splice(i, 1)[0].resolve(text);
        }
      },
      set innerHTML(_value) { throw new Error('Verification facts must be rendered as text'); },
      getAttribute: name => attrs[name],
      addEventListener: (name, callback) => listeners.set(name, callback),
      click: () => listeners.get('click')(),
      waitFor(predicate) {
        return predicate(text) ? Promise.resolve(text) : new Promise(resolve => waiters.push({ predicate, resolve }));
      },
    };
    elements.set(id, el);
    return el;
  };
  for (const id of ['ledger-data', 'version-warning', 'ledger-check', 'paste-section', 'paste-input', 'paste-check', 'paste-result', 'vr-0-0']) element(id);
  elements.get('ledger-data').textContent = data;
  const verify = element('verify', { 'data-verify': '0:0', 'aria-controls': 'vr-0-0' });
  const document = { getElementById: id => elements.get(id), querySelectorAll: () => [verify] };
  const context = { document, crypto, TextEncoder, TextDecoder, atob };
  runInNewContext(script, context);
  return {
    context, verify, el: id => elements.get(id),
    async verifiedText() {
      verify.click();
      return elements.get('vr-0-0').waitFor(text => text !== 'Checking…');
    },
    paste(value) { elements.get('paste-input').value = value; elements.get('paste-check').click(); },
    pastedText() { return elements.get('paste-result').waitFor(text => text !== 'Checking…'); },
  };
}

test('inline Verify reports certificate facts from the checked payload, not editable ledger summaries', async () => {
  const file = goodCertificate();
  const page = exportedPage(file, { summary: { verdict: 'fail', issuedAt: '2099-01-01', fingerprint: 'ffffffffffffffff' } });
  const text = await page.verifiedText();
  assert.match(text, /^✓ Match/);
  assert.match(text, /signature checks out/);
  assert.match(text, /Certificate content \(hash checked\)/);
  assert.ok(text.includes('Verdict: pass'));
  assert.ok(text.includes(`Tester: ${file.payload.tester}`));
  assert.ok(text.includes(`Serial: ${file.payload.unit.serial}`));
  assert.ok(text.includes(`Issued: ${file.payload.issuedAt}`));
  assert.ok(text.includes(`Key fingerprint (certificate signature block): ${file.integrity.fingerprint}`));
  assert.ok(!text.includes('2099-01-01'));
  assert.ok(!text.includes('ffffffffffffffff'));
  assert.ok(!text.includes('Verdict: fail'));
});

test('inline verification keeps unavailable and invalid signatures explicit beside hash-checked facts', async () => {
  const unavailable = await exportedPage(goodCertificate(), { crypto: hashOnlyCrypto }).verifiedText();
  assert.match(unavailable, /signature not checked by this browser/);
  assert.match(unavailable, /Certificate content \(hash checked\)/);
  assert.ok(!/authenticated|verified identity/i.test(unavailable));

  const forged = goodCertificate();
  forged.integrity.signature = Buffer.alloc(64, 1).toString('base64');
  const invalid = await exportedPage(forged).verifiedText();
  assert.match(invalid, /^✗ The hash matches, but the signature does not match/);
  assert.match(invalid, /Tester: Alex Tester/);
  assert.ok(!/signature checks out|verified identity|authenticated/i.test(invalid));
});

test('mismatched and unsigned pasted content never acquires checked certificate facts', async () => {
  const page = exportedPage();
  const tampered = goodCertificate();
  tampered.payload.tester = 'Tampered tester';
  page.paste(JSON.stringify(tampered));
  const mismatch = await page.pastedText();
  assert.match(mismatch, /^✗ Mismatch/);
  assert.ok(!mismatch.includes('Certificate content (hash checked)'));
  assert.ok(!mismatch.includes('Tampered tester'));
  delete tampered.integrity;
  page.paste(JSON.stringify(tampered));
  const draft = await page.pastedText();
  assert.match(draft, /^✗ Cannot check/);
  assert.ok(!draft.includes('Certificate content (hash checked)'));
});

test('pasted listing status follows the checked certificate content', async () => {
  const page = exportedPage(goodCertificate(), { crypto: hashOnlyCrypto });
  const other = goodCertificate();
  other.payload.tester = 'Another certificate tester';
  rehash(other);
  page.paste(JSON.stringify(other));
  const unlisted = await page.pastedText();
  assert.ok(unlisted.includes('Tester: Another certificate tester'));
  assert.ok(unlisted.includes('This certificate is not listed in this ledger.'));
  page.paste(CERT_FILE);
  const listed = await page.pastedText();
  assert.ok(listed.includes('Tester: Alex Tester'));
  assert.ok(listed.includes('This certificate is listed in this ledger.'));
  assert.ok(!listed.includes('This certificate is not listed'));
});

test('checked facts are bounded strings and malicious markup is written only as text', async () => {
  const file = goodCertificate();
  file.payload.tester = '😀'.repeat(201);
  file.payload.unit.serial = '<img src=x onerror="throw 1">';
  file.payload.verdict = null;
  file.payload.issuedAt = { privateNote: 'Do not stringify this object' };
  rehash(file);
  const text = await exportedPage(file, { crypto: hashOnlyCrypto }).verifiedText();
  assert.ok(text.includes('Tester: ' + '😀'.repeat(200) + '…'));
  assert.ok(!text.includes('😀'.repeat(201)));
  assert.ok(text.includes('Serial: <img src=x onerror="throw 1">'));
  assert.ok(text.includes('Verdict: unavailable'));
  assert.ok(text.includes('Issued: unavailable'));
  assert.ok(!text.includes('Do not stringify this object'));
  assert.ok(!text.includes('[object Object]'));
});

test('async certificate verification snapshots the checked payload and integrity primitives', async () => {
  const file = goodCertificate(), expected = structuredClone(file);
  const blocked = canonicalJson(file.payload), entered = deferred(), release = deferred();
  const crypto = { subtle: { async digest(algorithm, bytes) {
    if (new TextDecoder().decode(bytes) === blocked) { entered.resolve(); await release.promise; }
    return digest(algorithm, bytes);
  } } };
  const page = exportedPage(file, { crypto });
  const pending = page.context.lpVerifyCertificate(file, file.integrity.contentHash);
  await entered.promise;
  file.payload.tester = 'Changed during hash';
  file.payload.unit.serial = 'Changed serial';
  file.integrity.contentHash = '0'.repeat(64);
  file.integrity.fingerprint = 'f'.repeat(16);
  file.integrity.publicKey = 'invalid';
  file.integrity.signature = 'invalid';
  release.resolve();
  const result = await pending;
  const text = page.context.lpDescribe(result);
  assert.equal(result.status, 'match');
  assert.equal(result.hash, expected.integrity.contentHash);
  assert.equal(result.signature, null);
  assert.equal(result.listed, true);
  assert.ok(text.includes(expected.payload.tester));
  assert.ok(text.includes(expected.payload.unit.serial));
  assert.ok(text.includes(expected.integrity.fingerprint));
  assert.ok(!text.includes('Changed during hash'));
  assert.ok(!text.includes('Changed serial'));
});

for (const replacement of ['certificate', 'invalid JSON', 'empty']) {
  test(`an older pasted verification cannot replace a newer ${replacement} result`, async () => {
    const oldFile = goodCertificate();
    oldFile.payload.tester = 'Older checked tester';
    rehash(oldFile);
    const blocked = canonicalJson(oldFile.payload), entered = deferred(), release = deferred(), resumed = deferred();
    const crypto = { subtle: { async digest(algorithm, bytes) {
      if (new TextDecoder().decode(bytes) === blocked) {
        entered.resolve(); await release.promise;
        const value = await digest(algorithm, bytes);
        resumed.resolve(); return value;
      }
      return digest(algorithm, bytes);
    } } };
    const page = exportedPage(goodCertificate(), { crypto });
    page.paste(JSON.stringify(oldFile));
    await entered.promise;
    if (replacement === 'certificate') page.paste(CERT_FILE);
    else page.paste(replacement === 'empty' ? '' : '{broken');
    const newerText = await page.pastedText();
    if (replacement === 'certificate') assert.ok(newerText.includes('Tester: Alex Tester'));
    else assert.match(newerText, replacement === 'empty' ? /Paste the certificate JSON first/ : /not valid JSON/);
    release.resolve();
    await resumed.promise;
    // This controlled hash-only boundary uses promise jobs, so one event-loop
    // turn drains the complete old verification without a timing budget.
    await new Promise(setImmediate);
    assert.equal(page.el('paste-result').textContent, newerText);
  });
}
