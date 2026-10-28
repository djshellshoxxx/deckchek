// "Verify certificate" screen (FS-20 §3, AC-3/4/5). A keyboard-operable drop zone (button) takes a
// `.deckchek-cert.json`, a DeckChek `.html` certificate or a `.pdf`. Files are untrusted: size is checked before
// reading, PDFs are never parsed (v1 PDFs carry only the printed hash and QR), and verification never throws.
// Desktop: Rust `certificate_extract_json` / `certificate_verify` (Ed25519 verify_strict). Browser preview: the JS
// engine with WebCrypto Ed25519 when available, else the hash is checked and the status says the signature could not be.

import { h, esc, isNative } from '../dom.js';
import { icon } from '../icons.js';
import { announce } from '../live.js';
import {
  verifyCertificateText, webCryptoVerify, extractJsonFromHtml, parseStrictJson, diffPayload, verifyBadge,
  LIMITS, VERDICT_LABEL, DISCLAIMER, CertificateError,
} from '../../certificate.js';
import { createCertificateApi } from '../../certificate-api.js';

const PDF_TEXT = 'This PDF has no DeckChek data attached. A DeckChek PDF carries only the printed content hash and QR code; ask the seller for the .deckchek-cert.json file that came with it and open that here.';
const friendly = e => (typeof e === 'string' ? e : e?.message || 'Could not read file.');
const extOf = name => (/\.([a-z0-9]+)$/i.exec(String(name || ''))?.[1] || '').toLowerCase();

/** Pure: what to do with a picked file before reading it. -> {kind:'json'|'html'|'pdf'|'reject', reason?} */
export function classifyFile(name, size) {
  const ext = extOf(name);
  if (ext === 'pdf') return { kind: 'pdf' };
  if (ext === 'json') return size > LIMITS.maxJsonBytes ? { kind: 'reject', reason: 'The file is larger than a DeckChek certificate can be (20 MB).' } : { kind: 'json' };
  if (ext === 'html' || ext === 'htm') return size > LIMITS.maxHtmlBytes ? { kind: 'reject', reason: 'The file is larger than a DeckChek certificate can be (48 MB).' } : { kind: 'html' };
  return { kind: 'reject', reason: 'Choose a .deckchek-cert.json, DeckChek .html or .pdf certificate file.' };
}

const HASH_RE = /^[0-9a-f]{64}$/;

/**
 * Pure: the stored certificate a checked file came from, or null. Matched only on a content hash: the verified hash of
 * a VALID file, or the hash written in a MODIFIED file (the signed original's hash when only the payload was edited).
 * Never on the fingerprint, issue time or serial of a file whose signature did not verify: anyone can copy those
 * (FS-20 review). A match only ever shows this install's own record next to the file.
 */
export function findStoredOriginal(rows, rep) {
  const hash = rep?.status === 'valid' ? rep.contentHash : rep?.status === 'modified' ? rep.declaredHash : null;
  if (!Array.isArray(rows) || typeof hash !== 'string' || !HASH_RE.test(hash)) return null;
  return rows.find(r => r?.contentHash === hash) || null;
}

export function createVerifyScreen(section, { api = createCertificateApi(), dialog = globalThis.window?.__TAURI__?.dialog, events = globalThis.window?.__TAURI__?.event } = {}) {
  const native = isNative() && api.native;
  section.innerHTML = `
    <header class="screen-head"><div class="screen-title"><span class="screen-icon">${icon('check', { size: 24 })}</span><div><h1 tabindex="-1">Verify certificate</h1>
      <p class="lede">Check that a DeckChek used-gear certificate has not been changed since it was signed. Everything happens on this computer; nothing is sent anywhere.</p></div></div></header>
    <section class="card">
      <button type="button" class="cert-drop" id="verify-drop" aria-describedby="verify-drop-hint">${icon('upload', { size: 28 })}<span class="cert-drop-title">Choose or drop a certificate file</span>
        <span class="small muted" id="verify-drop-hint">.deckchek-cert.json, DeckChek .html or .pdf · Ctrl+Shift+V opens this screen</span></button>
      <input type="file" id="verify-file" class="sr-only" tabindex="-1" accept=".json,.html,.htm,.pdf,application/json,text/html,application/pdf">
    </section>
    <div id="verify-status" role="status" aria-live="polite" class="cert-status"></div>
    <section id="verify-result" class="card cert-result" hidden aria-labelledby="verify-result-h"></section>
    <p class="small muted cert-disclaimer">${esc(DISCLAIMER)}</p>`;
  const q = s => section.querySelector(s);
  const drop = q('#verify-drop'), input = q('#verify-file'), status = q('#verify-status'), result = q('#verify-result');
  let token = 0, unlisten = null, listening = false;

  // Each pick takes a token when it starts; only the latest pick may change the result (an earlier, slower file is dropped).
  const showMessage = (title, text, kind, my = ++token) => {
    if (my !== token) return;
    result.hidden = false;
    result.replaceChildren(h('h2', { id: 'verify-result-h', tabindex: '-1', text: title }), h('p', { class: `cert-msg cert-msg-${kind}`, id: 'verify-message', text }));
    status.textContent = `${title}. ${text}`;
    result.querySelector('h2').focus();
  };

  async function verifyJson(json, sourceName, my = ++token) {
    if (my !== token) return;
    status.textContent = 'Checking…';
    let rep;
    if (native) {
      try { rep = await api.verify(json); } catch (e) { rep = { status: 'unverifiable', reasons: [friendly(e)] }; }
    } else {
      rep = await verifyCertificateText(json, { verifySignature: webCryptoVerify });
    }
    let payload = rep.payload || null, diff = [];
    if (!payload && rep.status !== 'unverifiable') { try { payload = parseStrictJson(json).payload; } catch { payload = null; } }
    if (native && rep.status === 'modified' && payload) diff = await diffAgainstStored(rep, payload);
    if (my !== token) return;
    render(rep, payload, diff, sourceName);
  }

  async function diffAgainstStored(rep, payload) {
    try {
      const match = findStoredOriginal(await api.list(null), rep);
      if (!match) return [];
      const rec = await api.get(match.id);
      return diffPayload(parseStrictJson(rec.fileJson).payload, payload);
    } catch { return []; }
  }

  function render(rep, payload, diff, sourceName) {
    const badge = verifyBadge(rep);
    const dl = h('dl', { class: 'cert-meta' });
    const row = (k, v) => { if (v != null && v !== '') dl.append(h('dt', { text: k }), h('dd', { text: String(v) })); };
    row('File', sourceName);
    row('Model', rep.model); row('Serial', rep.serial); row('Signer (tester)', rep.tester);
    row('Verdict on the certificate', rep.verdict ? VERDICT_LABEL[rep.verdict] || rep.verdict : null);
    row('Issued', rep.issuedAt ? `${String(rep.issuedAt).replace('T', ' ').slice(0, 16)} UTC` : null);
    row('Valid until', rep.validUntil ? String(rep.validUntil).slice(0, 10) : null);
    row('Content hash', rep.contentHash);
    if (rep.declaredHash && rep.declaredHash !== rep.contentHash) row('Hash written in the file', rep.declaredHash);
    result.hidden = false;
    result.replaceChildren(
      h('h2', { id: 'verify-result-h', tabindex: '-1', class: 'sr-only', text: `Result: ${badge.label}${badge.expired ? ', expired' : ''}` }),
      h('div', { class: 'cert-badges' },
        h('span', { class: 'cert-badge', id: 'verify-badge', 'data-status': badge.status }, h('span', { 'aria-hidden': 'true', class: 'cert-badge-icon', text: badge.icon }), h('span', { text: badge.label })),
        badge.expired ? h('span', { class: 'cert-badge cert-badge-expired', id: 'verify-expired', 'data-status': 'expired' }, h('span', { 'aria-hidden': 'true', class: 'cert-badge-icon', text: '⏱' }), h('span', { text: 'EXPIRED' })) : ''),
      rep.fingerprint ? h('p', {}, h('span', { text: 'Signer key fingerprint: ' }), h('b', { class: 'cert-fp', id: 'verify-fp', text: String(rep.fingerprint).replace(/(.{4})(?=.)/g, '$1 ') }),
        // Only a verified file may claim this install as its issuer: the fingerprint in a MODIFIED file is unchecked.
        h('span', { class: 'small muted', text: rep.status === 'valid' && rep.issuedByThisInstall === true ? ' (issued by this DeckChek install)' : ' — compare it with the fingerprint the seller gave you separately.' })) : '',
      h('ul', { class: 'cert-reasons', id: 'verify-reasons' }, ...(rep.reasons || []).map(r => h('li', { text: r }))),
      diff.length ? h('div', { id: 'verify-diff' }, h('h3', { text: 'Changed since this install signed it' }), h('ul', { class: 'cert-list' }, ...diff.map(p => h('li', { text: p })))) : '',
      dl,
      payload && rep.status === 'valid' && payload.unit?.photos?.length ? h('p', { class: 'small muted', text: `${payload.unit.photos.length} photo(s) embedded in the signed data.` }) : '');
    const text = `${badge.label}${badge.expired ? ', EXPIRED' : ''}. ${(rep.reasons || []).join('. ')}`;
    status.textContent = text;
    announce(`Certificate ${text}`, { assertive: rep.status !== 'valid' });
    result.querySelector('h2').focus();
  }

  async function handleFile(file) {
    const my = ++token;
    const c = classifyFile(file?.name, file?.size ?? 0);
    if (c.kind === 'pdf') return showMessage('PDF without certificate data', PDF_TEXT, 'unsupported', my);
    if (c.kind === 'reject') return showMessage('Could not read file', c.reason, 'error', my);
    let text;
    try { text = await file.text(); } catch { return showMessage('Could not read file', 'The file could not be read.', 'error', my); }
    if (c.kind === 'html') {
      try { text = extractJsonFromHtml(text); } catch (e) { return showMessage('Could not read file', e instanceof CertificateError ? `This HTML file has no DeckChek certificate data (${e.message}).` : friendly(e), 'error', my); }
    }
    return verifyJson(text, file.name, my);
  }

  async function handlePath(path) {
    const my = ++token;
    const name = String(path).split(/[\\/]/).pop();
    if (extOf(name) === 'pdf') return showMessage('PDF without certificate data', PDF_TEXT, 'unsupported', my);
    let json;
    try { json = await api.extract(path); }
    catch (e) {
      if (e?.code === 'pdf_has_no_attachment') return showMessage('PDF without certificate data', PDF_TEXT, 'unsupported', my);
      return showMessage('Could not read file', friendly(e), 'error', my);
    }
    return verifyJson(json, name, my);
  }

  async function pick() {
    if (native && dialog?.open) {
      const chosen = await dialog.open({ multiple: false, directory: false, title: 'Choose a certificate', filters: [{ name: 'DeckChek certificate', extensions: ['json', 'html', 'htm', 'pdf'] }] });
      const path = Array.isArray(chosen) ? chosen[0] : chosen;
      if (path) await handlePath(path);
      return;
    }
    input.click();
  }

  drop.addEventListener('click', () => { pick().catch(e => showMessage('Could not read file', friendly(e), 'error')); });
  input.addEventListener('change', () => { const f = input.files?.[0]; input.value = ''; if (f) handleFile(f); });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); const f = e.dataTransfer?.files?.[0]; if (f) handleFile(f); });

  return {
    onShow: () => {
      // Desktop: the webview does not receive dropped files (Tauri handles OS drops), so listen for its drop event while visible.
      if (native && events?.listen && !listening) {
        listening = true;
        Promise.resolve(events.listen('tauri://drag-drop', e => { const p = e?.payload?.paths?.[0]; if (p) handlePath(p); })).then(u => { if (listening) unlisten = u; else u?.(); }).catch(() => { listening = false; /* drops unavailable: the picker still works */ });
      }
    },
    onHide: () => { try { unlisten?.(); } catch { /* ignore */ } unlisten = null; listening = false; },
    onEscape: () => { if (result.hidden) return false; result.hidden = true; status.textContent = ''; token++; drop.focus(); return true; },
  };
}
