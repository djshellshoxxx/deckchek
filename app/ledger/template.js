// Gear ledger static page (FS-33 §4 template, §6 verification, §7 output safety). Pure: returns strings.
//   renderLedgerHtml(ledger, opts)  one self-contained index.html: semantic HTML rendered up front (readable with
//                                   scripts off), inline CSS (light/dark via prefers-color-scheme, print sheet), the
//                                   ledger JSON in a non-executing data block and a small inline verification script.
//   PAGE_SCRIPT                     the inline script text, built from the lp* functions below (also exported so the
//                                   unit tests run exactly the code the page runs: canonical JSON, pure-JS SHA-256,
//                                   certificate check, Ed25519 where the browser supports it).
// Every user string goes through esc(); no remote fonts, images, scripts or links; CSP blocks all network access.

export const LEDGER_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
export const INTEGRITY_NOTE = 'These SHA-256 hashes are an integrity check: they show whether this page\'s data or a certificate was changed after it was exported or signed. A hash is not proof of who made the ledger or that the facts in it are true. Signed certificates add an Ed25519 signature, but the signing key belongs to the tester and is not tied to an identity: compare its fingerprint with one you got from the seller another way.';
export const MAX_INLINE_CERT_CHARS = 200 * 1024;

const VERDICT = { pass: '✓ Certified pass', pass_uncalibrated: '! Pass (uncalibrated)', review: '? Needs review', fail: '✗ Fail' };
const SERIAL_NOTE = { hidden: 'Not shown', masked: 'Masked' };

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** JSON for a <script type="application/json"> block: no "</script", no U+2028/2029 surprises. */
export const embedJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export const itemTitle = it => it?.nickname || [it?.manufacturer, it?.model].filter(Boolean).join(' ') || 'Unit';
const fmtDate = s => (typeof s === 'string' ? s.slice(0, 10) : '');
const SAFE_SRC = /^(assets\/[a-z0-9]+\/p\d{1,3}\.jpg|data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2})$/;
const SAFE_HREF = /^certificates\/c-[0-9a-f]{12}\.deckchek-cert\.json$/;

// ---------------------------------------------------------------- page script (self-contained functions)
// Each lp* function is embedded with Function.prototype.toString, so it must not reference anything outside the lp*
// set and must not contain a closing script tag sequence.

function lpLoneSurrogate(s) {
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { var n = s.charCodeAt(i + 1); if (n >= 0xdc00 && n <= 0xdfff) { i++; continue; } return true; }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

function lpCanonical(v, depth) {
  depth = depth || 0;
  if (depth > 64) throw new Error('nesting too deep');
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') { if (lpLoneSurrogate(v)) throw new Error('lone surrogate'); return JSON.stringify(v); }
  if (typeof v === 'number') { if (!Number.isSafeInteger(v)) throw new Error('only safe integers are allowed'); return String(v === 0 ? 0 : v); }
  if (Array.isArray(v)) return '[' + v.map(function (x) { return lpCanonical(x, depth + 1); }).join(',') + ']';
  if (typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(function (k) {
      if (lpLoneSurrogate(k)) throw new Error('lone surrogate');
      return JSON.stringify(k) + ':' + lpCanonical(v[k], depth + 1);
    }).join(',') + '}';
  }
  throw new Error('not JSON');
}

function lpHex(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  return s;
}

function lpSha256(data) {
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var len = data.length, total = ((len + 9 + 63) >> 6) << 6, p = new Uint8Array(total), w = new Array(64), i, j;
  p.set(data); p[len] = 0x80;
  var bits = len * 8, hi = Math.floor(bits / 0x100000000);
  for (i = 0; i < 4; i++) { p[total - 1 - i] = (bits >>> (8 * i)) & 0xff; p[total - 5 - i] = (hi >>> (8 * i)) & 0xff; }
  for (var off = 0; off < total; off += 64) {
    for (i = 0; i < 16; i++) w[i] = (p[off + 4 * i] << 24) | (p[off + 4 * i + 1] << 16) | (p[off + 4 * i + 2] << 8) | p[off + 4 * i + 3];
    for (i = 16; i < 64; i++) {
      var x = w[i - 15], y = w[i - 2];
      var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3), s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (j = 0; j < 64; j++) {
      var t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[j] + w[j]) | 0;
      var t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  var out = new Uint8Array(32);
  for (i = 0; i < 8; i++) { out[4 * i] = H[i] >>> 24; out[4 * i + 1] = (H[i] >>> 16) & 0xff; out[4 * i + 2] = (H[i] >>> 8) & 0xff; out[4 * i + 3] = H[i] & 0xff; }
  return lpHex(out);
}

async function lpDigestHex(input) {
  var bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  var subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (subtle && subtle.digest) {
    try { return lpHex(new Uint8Array(await subtle.digest('SHA-256', bytes))); } catch (e) { /* no secure context: pure JS below */ }
  }
  return lpSha256(bytes);
}

function lpB64(s, n) {
  if (typeof s !== 'string' || s.length > 128 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  try { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.length === n ? out : null; } catch (e) { return null; }
}

async function lpVerifyEd25519(integrity) {
  var pk = lpB64(integrity.publicKey, 32), sig = lpB64(integrity.signature, 64);
  if (!pk || !sig) return false;
  if ((await lpDigestHex(pk)).slice(0, 16) !== integrity.fingerprint) return false;
  var subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle || !subtle.importKey) return null;
  var key;
  try { key = await subtle.importKey('raw', pk, { name: 'Ed25519' }, false, ['verify']); } catch (e) { return null; }
  var digest = new Uint8Array(integrity.contentHash.match(/../g).map(function (x) { return parseInt(x, 16); }));
  try { return await subtle.verify({ name: 'Ed25519' }, key, sig, digest); } catch (e) { return null; }
}

/** -> {status:'match'|'mismatch'|'invalid', hash, signature:true|false|null, listed:true|false|null, reason} */
async function lpVerifyCertificate(file, listedSha) {
  var r = { status: 'invalid', hash: null, signature: null, listed: null, reason: '' };
  if (!file || typeof file !== 'object' || file.format !== 'deckchek-certificate') { r.reason = 'This is not a DeckChek certificate.'; return r; }
  if (file.version !== 1) { r.reason = 'This certificate was made by a newer DeckChek (version ' + String(file.version).slice(0, 10) + ').'; return r; }
  var i = file.integrity;
  if (!i || typeof i !== 'object' || typeof i.contentHash !== 'string' || !/^[0-9a-f]{64}$/.test(i.contentHash)) { r.reason = 'The certificate has no signature block (unsigned draft).'; return r; }
  try { r.hash = await lpDigestHex(lpCanonical(file.payload)); } catch (e) { r.reason = 'The certificate content cannot be checked: ' + e.message + '.'; return r; }
  if (typeof listedSha === 'string') r.listed = listedSha === i.contentHash;
  if (r.hash !== i.contentHash) { r.status = 'mismatch'; r.reason = 'content hash mismatch'; return r; }
  r.status = 'match';
  r.signature = await lpVerifyEd25519(i);
  return r;
}

function lpDescribe(r) {
  if (r.status === 'invalid') return '✗ Cannot check: ' + r.reason;
  if (r.status === 'mismatch') return '✗ Mismatch: the recomputed SHA-256 (' + r.hash.slice(0, 16) + '…) differs from the one the certificate declares. It was changed after signing.';
  var s = '✓ Match: the recomputed SHA-256 equals the certificate\'s content hash (' + r.hash.slice(0, 16) + '…). ';
  if (r.signature === true) s += 'The Ed25519 signature checks out with the public key in the certificate; compare its fingerprint with the seller\'s.';
  else if (r.signature === null) s += 'Hash checked, signature not checked by this browser. Open the certificate file in DeckChek to check the signature.';
  else s = '✗ The hash matches, but the signature does not match the public key in the certificate.';
  if (r.listed === false) s += ' Warning: this hash differs from the one listed in the ledger.';
  return s;
}

function lpMain(doc) {
  var el = function (id) { return doc.getElementById(id); };
  var data;
  try { data = JSON.parse(el('ledger-data').textContent); } catch (e) { return; }
  if (!data || data.format !== 'deckchek-ledger' || typeof data.version !== 'number' || data.version !== 1) {
    var warn = el('version-warning');
    warn.textContent = 'This ledger was generated by a newer DeckChek (format version ' + String(data && data.version).slice(0, 10) + '). The checks on this page are switched off; open it with an up-to-date DeckChek.';
    warn.hidden = false;
    return;
  }
  var items = Array.isArray(data.items) ? data.items : [];
  var check = el('ledger-check');
  check.textContent = 'Checking…';
  Promise.resolve().then(function () { return lpDigestHex(lpCanonical(items)); }).then(function (h) {
    check.textContent = h === data.ledgerSha256 ? '✓ The ledger data on this page matches this hash.' : '✗ The ledger data on this page does not match this hash: it was changed after export.';
  }, function () { check.textContent = '✗ The ledger data could not be checked.'; });
  var buttons = doc.querySelectorAll('button[data-verify]');
  for (var b = 0; b < buttons.length; b++) {
    (function (btn) {
      btn.hidden = false;
      btn.addEventListener('click', function () {
        var parts = String(btn.getAttribute('data-verify')).split(':'), it = items[Number(parts[0])], cert = it && it.certificates && it.certificates[Number(parts[1])];
        var out = el(btn.getAttribute('aria-controls'));
        if (!cert) { out.textContent = '✗ Certificate not found in the ledger data.'; return; }
        out.textContent = 'Checking…';
        lpVerifyCertificate(cert.signed, cert.sha256).then(function (r) { out.textContent = lpDescribe(r); }, function () { out.textContent = '✗ The certificate could not be checked.'; });
      });
    })(buttons[b]);
  }
  var paste = el('paste-section');
  paste.hidden = false;
  el('paste-check').addEventListener('click', function () {
    var out = el('paste-result'), text = el('paste-input').value;
    if (!text.trim()) { out.textContent = 'Paste the certificate JSON first.'; return; }
    if (text.length > 20000000) { out.textContent = '✗ That text is larger than 20 MB.'; return; }
    var file;
    try { file = JSON.parse(text); } catch (e) { out.textContent = '✗ That is not valid JSON.'; return; }
    out.textContent = 'Checking…';
    lpVerifyCertificate(file).then(function (r) {
      var listed = false, h = file && file.integrity && file.integrity.contentHash;
      for (var x = 0; x < items.length; x++) for (var y = 0; y < ((items[x] && items[x].certificates) || []).length; y++) if (items[x].certificates[y].sha256 === h) listed = true;
      out.textContent = lpDescribe(r) + (r.status === 'match' ? (listed ? ' This certificate is listed in this ledger.' : ' This certificate is not listed in this ledger.') : '');
    }, function () { out.textContent = '✗ The certificate could not be checked.'; });
  });
}

export const PAGE_FUNCTIONS = Object.freeze({ lpLoneSurrogate, lpCanonical, lpHex, lpSha256, lpDigestHex, lpB64, lpVerifyEd25519, lpVerifyCertificate, lpDescribe, lpMain });
export const PAGE_SCRIPT = `"use strict";\n${Object.values(PAGE_FUNCTIONS).map(f => f.toString()).join('\n')}\nlpMain(document);\n`;

// ---------------------------------------------------------------- CSS

export const LEDGER_CSS = `:root{--bg:#ffffff;--fg:#15181d;--muted:#4a5260;--line:#c4cad3;--card:#f5f7fa;--accent:#0b5cad;--ok:#0f6b2f;--bad:#a31515;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root:not(.theme-light){--bg:#121418;--fg:#eceff3;--muted:#b4bcc8;--line:#3b424d;--card:#1c2026;--accent:#7cb8ff;--ok:#6fd38f;--bad:#ff8a8a}}
:root.theme-dark{--bg:#121418;--fg:#eceff3;--muted:#b4bcc8;--line:#3b424d;--card:#1c2026;--accent:#7cb8ff;--ok:#6fd38f;--bad:#ff8a8a}
*{box-sizing:border-box}html{background:var(--bg);color:var(--fg)}
body{margin:0 auto;max-width:72rem;padding:1.5rem 1rem 3rem;font:1rem/1.55 system-ui,"Segoe UI",Roboto,Arial,sans-serif;background:var(--bg);color:var(--fg)}
a{color:var(--accent)}a:focus-visible,button:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.skip{position:absolute;left:-999px}.skip:focus{left:1rem;top:1rem;background:var(--bg);padding:.5rem;z-index:1}
h1{font-size:2rem;margin:0 0 .25rem}h2{font-size:1.45rem;margin:0 0 .5rem}h3{font-size:1.1rem;margin:1.25rem 0 .5rem}
.lede,.muted{color:var(--muted)}code{font:.9em ui-monospace,Consolas,monospace;overflow-wrap:anywhere}
nav ul{display:flex;flex-wrap:wrap;gap:.25rem 1rem;padding:0;list-style:none}
.item{border:1px solid var(--line);border-radius:10px;padding:1.25rem;margin:1.25rem 0;background:var(--card);break-inside:avoid-page}
dl.facts{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem;margin:0}dl.facts dt{font-weight:600}dl.facts dd{margin:0}
.photos{display:flex;flex-wrap:wrap;gap:.75rem;list-style:none;padding:0;margin:0}.photos figure{margin:0;max-width:16rem}
.photos img{display:block;max-width:100%;height:auto;border:1px solid var(--line);border-radius:6px}.photos figcaption{font-size:.875rem;color:var(--muted)}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.3rem .5rem;border-bottom:1px solid var(--line);vertical-align:top}
.cert{border-top:1px solid var(--line);padding:.75rem 0}.cert:first-of-type{border-top:0}
button{font:inherit;min-height:2.25rem;min-width:2.25rem;padding:.35rem .9rem;border-radius:6px;border:1px solid var(--accent);background:var(--bg);color:var(--accent);cursor:pointer}
.result{font-weight:600;min-height:1.5em;margin:.5rem 0 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:24rem;overflow:auto;font-size:.8rem}
textarea{width:100%;min-height:8rem;font:.85rem ui-monospace,Consolas,monospace;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:.5rem}
.warning{border:2px solid var(--bad);padding:.75rem;border-radius:8px;font-weight:600}
footer{margin-top:2rem;color:var(--muted);font-size:.875rem}
@media (max-width:40rem){dl.facts{grid-template-columns:1fr}dl.facts dt{margin-top:.4rem}}
@media print{:root{--bg:#fff;--fg:#000;--muted:#333;--line:#999;--card:#fff;--accent:#000}nav,button,#paste-section,.skip,noscript{display:none!important}
.item{break-inside:avoid;border-color:#999}a{color:#000;text-decoration:none}details{display:block}details>summary{display:none}body{max-width:none;padding:0}}`;

// ---------------------------------------------------------------- HTML

function facts(it) {
  const rows = [['Manufacturer', it.manufacturer], ['Model', it.model], ['Category', it.category]];
  if (it.nickname) rows.unshift(['Nickname', it.nickname]);
  rows.push(['Serial number', it.serial || SERIAL_NOTE[it.serialMode] || 'Not shown']);
  rows.push(['Purchased', it.purchaseDate], ['Condition', it.condition], ['Firmware', it.firmware]);
  return `<dl class="facts">${rows.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

function photosHtml(it, idx, photoSrc) {
  if (!it.photos?.length) return '';
  const lis = it.photos.map((p, n) => {
    const src = String(photoSrc(p, it, n) ?? '');
    if (!SAFE_SRC.test(src)) return '';
    return `<li><figure><img src="${esc(src)}" alt="${esc(p.alt)}" width="${Number(p.width) | 0}" height="${Number(p.height) | 0}" loading="lazy" decoding="async"><figcaption>${esc(p.alt)}</figcaption></figure></li>`;
  }).join('');
  return `<section aria-labelledby="ph-${idx}"><h3 id="ph-${idx}">Photos</h3><ul class="photos">${lis}</ul></section>`;
}

function serviceHtml(it, idx) {
  if (!it.service?.length) return '';
  const desc = it.service.some(s => s.description);
  return `<section aria-labelledby="sv-${idx}"><h3 id="sv-${idx}">Service history</h3><table><thead><tr><th scope="col">Date</th><th scope="col">Work</th>${desc ? '<th scope="col">Description</th>' : ''}</tr></thead><tbody>${
    it.service.map(s => `<tr><td>${esc(s.at)}</td><td>${esc(s.type)}</td>${desc ? `<td>${esc(s.description || '')}</td>` : ''}</tr>`).join('')}</tbody></table></section>`;
}

function certsHtml(it, idx, { certLinks }) {
  if (!it.certificates?.length) return '';
  const blocks = it.certificates.map((c, n) => {
    const p = c.signed?.payload || {}, rid = `vr-${idx}-${n}`;
    const json = JSON.stringify(c.signed, null, 2);
    const href = certLinks ? `certificates/${c.id}.deckchek-cert.json` : '';
    return `<div class="cert"><p><strong>${esc(VERDICT[c.verdict] || c.verdict || 'Certificate')}</strong> · ${esc(c.kind === 'deckchek-certificate' ? 'Used-gear test certificate' : c.kind)}</p>
<dl class="facts"><dt>Issued</dt><dd>${esc(fmtDate(c.issuedAt))}</dd><dt>Valid until</dt><dd>${esc(fmtDate(c.validUntil))}</dd><dt>Tester</dt><dd>${esc(p.tester || '')}</dd>
<dt>Key fingerprint</dt><dd><code>${esc(c.fingerprint || '')}</code></dd><dt>Content SHA-256</dt><dd><code>${esc(c.sha256)}</code></dd><dt>Made with</dt><dd>DeckChek ${esc(c.toolVersion || '')}</dd></dl>
<p><button type="button" data-verify="${idx}:${n}" aria-controls="${rid}" hidden>Verify certificate</button>${SAFE_HREF.test(href) ? ` <a href="${esc(href)}" download>Certificate file (JSON)</a>` : ''}</p>
<p class="result" id="${rid}" role="status" aria-live="polite"></p>
${json.length <= MAX_INLINE_CERT_CHARS ? `<details><summary>Certificate JSON</summary><pre>${esc(json)}</pre></details>` : '<p class="muted">The certificate JSON is too large to show here; use the certificate file.</p>'}</div>`;
  }).join('');
  return `<section aria-labelledby="ct-${idx}"><h3 id="ct-${idx}">Test certificates</h3>${blocks}</section>`;
}

/**
 * The ledger page. `photoSrc(photo, item, n)` -> 'assets/<id>/pN.jpg' (folder) or a data:image/jpeg URI (single file,
 * preview); anything else is dropped. `theme` 'auto' (exports) or 'light'/'dark' (in-app preview). `certLinks` adds a
 * link to each certificate's own JSON file (folder mode only). `script: false` leaves out the verification script (the
 * in-app preview runs in a sandbox without scripts, so it would only be blocked there).
 */
export function renderLedgerHtml(ledger, { photoSrc = p => p.path, theme = 'auto', certLinks = false, script = true } = {}) {
  const items = Array.isArray(ledger?.items) ? ledger.items : [];
  const owner = ledger?.owner?.displayName;
  const title = owner ? `Gear ledger of ${owner}` : 'Gear ledger';
  const cls = theme === 'light' || theme === 'dark' ? ` class="theme-${theme}"` : '';
  const nav = items.length > 1 ? `<nav aria-label="Items"><ul>${items.map(it => `<li><a href="#item-${esc(it.id)}">${esc(itemTitle(it))}</a></li>`).join('')}</ul></nav>` : '';
  const body = items.map((it, i) => `<article class="item" id="item-${esc(it.id)}" aria-labelledby="h-${i}"><h2 id="h-${i}">${esc(itemTitle(it))}</h2>
${facts(it)}${it.publicNotes ? `<h3>Note</h3><p>${esc(it.publicNotes).replace(/\n/g, '<br>')}</p>` : ''}${it.notes ? `<h3>Owner notes</h3><p>${esc(it.notes).replace(/\n/g, '<br>')}</p>` : ''}
${photosHtml(it, i, photoSrc)}${serviceHtml(it, i)}${certsHtml(it, i, { certLinks })}</article>`).join('\n');
  return `<!doctype html>
<html lang="en"${cls}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${LEDGER_CSP}">
<meta name="referrer" content="no-referrer">
<meta name="generator" content="DeckChek gear ledger v${Number(ledger?.version) | 0}">
<title>${esc(title)}</title>
<style>${LEDGER_CSS}</style>
</head>
<body>
<a class="skip" href="#main">Skip to the ledger</a>
<header><h1>${esc(title)}</h1>
<p class="lede">Revision ${Number(ledger?.revision) | 0} · generated ${esc(fmtDate(ledger?.generatedAt))} · ${items.length} item${items.length === 1 ? '' : 's'}</p>${nav}</header>
<main id="main">
<p id="version-warning" class="warning" role="alert" hidden></p>
${body || '<p>This ledger has no items.</p>'}
<section id="paste-section" aria-labelledby="h-paste" hidden><h2 id="h-paste">Check a certificate</h2>
<p>Paste the JSON of a DeckChek certificate to recompute its SHA-256 here, in your browser. Nothing is sent anywhere.</p>
<label for="paste-input">Certificate JSON</label><textarea id="paste-input" spellcheck="false" autocomplete="off"></textarea>
<p><button type="button" id="paste-check">Check pasted certificate</button></p><p class="result" id="paste-result" role="status" aria-live="polite"></p></section>
<section id="integrity" aria-labelledby="h-integrity"><h2 id="h-integrity">About the hashes</h2><p>${esc(INTEGRITY_NOTE)}</p>
<p>Ledger SHA-256: <code>${esc(ledger?.ledgerSha256 || '')}</code></p><p class="result" id="ledger-check" role="status" aria-live="polite"></p></section>
</main>
<footer><p>Made with DeckChek. A static page: no tracking, no external requests. It is a record kept by the owner; serial numbers may be masked or hidden on purpose.</p>
<noscript><p>Certificate checks need scripts; everything else on this page works without them.</p></noscript></footer>
<script type="application/json" id="ledger-data">${embedJson(ledger)}</script>
${script ? `<script>${PAGE_SCRIPT}</script>\n` : ''}</body>
</html>
`;
}
