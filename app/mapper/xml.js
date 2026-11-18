// Minimal, non-validating XML reader and writer for the MIDI mapper studio (FS-32 §4, §7). Zero dependencies and
// no DOM, so it runs the same in Node tests, the browser and the WebView.
//
// Imported files are untrusted. The reader therefore:
//  - refuses input over a byte cap before looking at it,
//  - refuses any <!DOCTYPE …> or <!ENTITY …> declaration outright (no DTD, no external or internal entities, so no
//    XXE and no entity expansion), and any named entity other than the five predefined ones,
//  - caps element count, attribute count per element, nesting depth and name length,
//  - never throws: parseXml returns {ok:false, error:{code, message, line, column}}.
// The writer escapes every text and attribute value and drops characters XML 1.0 cannot carry (C0 controls other
// than tab/LF/CR, lone surrogates, U+FFFE/U+FFFF), so generated files are always well-formed.

export const XML_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxElements: 200_000,
  maxAttributes: 64,
  maxDepth: 64,
  maxNameLength: 128,
});

class XmlError extends Error {
  constructor(code, message, line = null, column = null) { super(message); this.code = code; this.line = line; this.column = column; }
}

const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[-A-Za-z0-9_.:]/;
const PREDEFINED = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** UTF-8 byte length without allocating an encoded copy. */
export function utf8Length(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

const isXmlChar = cp => cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);

/** Drop every character XML 1.0 cannot represent (also lone surrogates). */
export function stripInvalidXmlChars(value) {
  const s = String(value ?? '');
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0xd800 && cp <= 0xdfff) continue; // lone surrogate (paired ones arrive as one code point)
    if (isXmlChar(cp)) out += ch;
  }
  return out;
}

/** Text content: & < > escaped (so "]]>" can never appear literally), invalid characters dropped. */
export function escapeText(value) {
  return stripInvalidXmlChars(value).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/** Attribute value (double-quoted): also escapes quotes and whitespace that attribute normalisation would eat. */
export function escapeAttr(value) {
  return stripInvalidXmlChars(value).replace(/[&<>"'\t\n\r]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;', '\t': '&#9;', '\n': '&#10;', '\r': '&#13;' }[c]));
}

function assertName(name) {
  if (!/^[A-Za-z_][-A-Za-z0-9_.]*$/.test(name) || name.length > XML_LIMITS.maxNameLength) throw new Error(`Invalid XML name: ${String(name).slice(0, 40)}`);
}

/**
 * Serialise a tree of {name, attrs?, children?, text?} nodes. Attribute order follows insertion order of `attrs`
 * (entries whose value is null/undefined are skipped). Children may be nodes or strings (text). Pretty-printed with
 * two-space indentation; text-only elements stay on one line.
 */
export function writeXml(root, { declaration = true } = {}) {
  const lines = [];
  if (declaration) lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  const emit = (node, depth) => {
    const pad = '  '.repeat(depth);
    if (typeof node === 'string') { lines.push(pad + escapeText(node)); return; }
    if (node && node.comment != null) { lines.push(`${pad}<!-- ${stripInvalidXmlChars(node.comment).replace(/--+/g, '-').replace(/-$/, '- ')} -->`); return; }
    assertName(node.name);
    let open = `<${node.name}`;
    for (const [k, v] of Object.entries(node.attrs || {})) {
      if (v == null) continue;
      assertName(k);
      open += ` ${k}="${escapeAttr(v)}"`;
    }
    const kids = (node.children || []).filter(c => c != null);
    if (node.text != null && !kids.length) { lines.push(`${pad}${open}>${escapeText(node.text)}</${node.name}>`); return; }
    if (!kids.length) { lines.push(`${pad}${open}/>`); return; }
    lines.push(`${pad}${open}>`);
    for (const c of kids) emit(c, depth + 1);
    lines.push(`${pad}</${node.name}>`);
  };
  emit(root, 0);
  return lines.join('\n') + '\n';
}

/** Element helper for writeXml. */
export const el = (name, attrs = {}, ...children) => ({ name, attrs, children: children.flat().filter(c => c != null) });
/** Text-only element helper. */
export const tx = (name, text, attrs = {}) => ({ name, attrs, text: String(text ?? '') });

// ------------------------------------------------------------------------------------------------ reader

/**
 * Parse untrusted XML text. Returns {ok:true, root} where nodes are {name, attrs (null-prototype object), children,
 * text, line, column}, or {ok:false, error:{code, message, line, column}}. Codes: XML_TOO_LARGE, XML_DTD_FORBIDDEN,
 * XML_ENTITY, XML_LIMIT, XML_SYNTAX, XML_EMPTY.
 */
export function parseXml(input, limits = {}) {
  const L = { ...XML_LIMITS, ...limits };
  try {
    if (typeof input !== 'string') throw new XmlError('XML_SYNTAX', 'The file is not text.');
    if (input.length > L.maxBytes || utf8Length(input) > L.maxBytes) throw new XmlError('XML_TOO_LARGE', `The file is larger than ${Math.round(L.maxBytes / 1024 / 1024)} MB.`);
    const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    // Refuse declarations before parsing anything (also inside comments: a crafted file gains nothing from them).
    if (/<!DOCTYPE/i.test(text)) throw new XmlError('XML_DTD_FORBIDDEN', 'The file contains a DOCTYPE declaration, which DeckChek does not accept.', ...lineCol(text, text.search(/<!DOCTYPE/i)));
    if (/<!ENTITY/i.test(text)) throw new XmlError('XML_DTD_FORBIDDEN', 'The file declares entities, which DeckChek does not accept.', ...lineCol(text, text.search(/<!ENTITY/i)));
    return { ok: true, root: new Reader(text, L).document() };
  } catch (e) {
    if (e instanceof XmlError) return { ok: false, error: { code: e.code, message: e.message, line: e.line, column: e.column } };
    return { ok: false, error: { code: 'XML_SYNTAX', message: 'The file could not be read as XML.', line: null, column: null } };
  }
}

function lineCol(text, pos) {
  let line = 1, col = 1;
  for (let i = 0; i < pos && i < text.length; i++) { if (text.charCodeAt(i) === 10) { line++; col = 1; } else col++; }
  return [line, col];
}

class Reader {
  constructor(text, limits) { this.s = text; this.i = 0; this.L = limits; this.count = 0; this.cPos = 0; this.cLine = 1; this.cCol = 1; }
  /** Line/column of `pos`; incremental for the (monotonic) element positions so large files stay linear. */
  lc(pos) {
    if (pos < this.cPos) { this.cPos = 0; this.cLine = 1; this.cCol = 1; }
    for (let k = this.cPos; k < pos && k < this.s.length; k++) { if (this.s.charCodeAt(k) === 10) { this.cLine++; this.cCol = 1; } else this.cCol++; }
    this.cPos = Math.max(this.cPos, Math.min(pos, this.s.length));
    return [this.cLine, this.cCol];
  }
  fail(code, message, at = this.i) { const [l, c] = lineCol(this.s, at); throw new XmlError(code, `${message} (line ${l}, column ${c})`, l, c); }
  startsWith(t) { return this.s.startsWith(t, this.i); }
  skipWs() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  until(t, what) {
    const j = this.s.indexOf(t, this.i);
    if (j < 0) this.fail('XML_SYNTAX', `Unterminated ${what}`);
    const out = this.s.slice(this.i, j);
    this.i = j + t.length;
    return out;
  }
  name() {
    const start = this.i;
    if (!NAME_START.test(this.s[this.i] || '')) this.fail('XML_SYNTAX', 'Expected a name');
    this.i++;
    while (this.i < this.s.length && NAME_CHAR.test(this.s[this.i])) this.i++;
    if (this.i - start > this.L.maxNameLength) this.fail('XML_LIMIT', 'A name is too long', start);
    return this.s.slice(start, this.i);
  }
  decode(raw, at) {
    if (raw.indexOf('&') < 0) return raw;
    return raw.replace(/&([^;\s&<]{0,12});?/g, (m, ref) => {
      if (!m.endsWith(';')) this.fail('XML_SYNTAX', 'A bare "&" must be written as &amp;', at);
      if (ref[0] === '#') {
        const cp = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
        if (!/^#(x[0-9a-fA-F]{1,6}|X[0-9a-fA-F]{1,6}|[0-9]{1,7})$/.test(ref) || !Number.isFinite(cp) || !isXmlChar(cp)) this.fail('XML_SYNTAX', `Invalid character reference &${ref};`, at);
        return String.fromCodePoint(cp);
      }
      if (Object.hasOwn(PREDEFINED, ref)) return PREDEFINED[ref];
      this.fail('XML_ENTITY', `Unknown entity &${ref}; (only the five XML entities are accepted)`, at);
      return '';
    });
  }
  misc() {
    // comments, processing instructions and whitespace between top-level nodes
    for (;;) {
      this.skipWs();
      if (this.startsWith('<!--')) { this.i += 4; this.until('-->', 'comment'); continue; }
      if (this.startsWith('<?')) { this.i += 2; this.until('?>', 'processing instruction'); continue; }
      return;
    }
  }
  document() {
    this.misc();
    if (this.i >= this.s.length) throw new XmlError('XML_EMPTY', 'The file is empty.', 1, 1);
    if (this.s[this.i] !== '<') this.fail('XML_SYNTAX', 'Text before the root element');
    const root = this.element(0);
    this.misc();
    if (this.i < this.s.length) this.fail('XML_SYNTAX', 'Content after the root element');
    return root;
  }
  element(depth) {
    if (depth >= this.L.maxDepth) this.fail('XML_LIMIT', `Elements are nested more than ${this.L.maxDepth} deep`);
    if (++this.count > this.L.maxElements) this.fail('XML_LIMIT', `The file has more than ${this.L.maxElements} elements`);
    const at = this.i;
    this.i++; // '<'
    const name = this.name();
    const [line, column] = this.lc(at);
    const attrs = Object.create(null);
    let nAttrs = 0;
    for (;;) {
      const before = this.i;
      this.skipWs();
      if (this.startsWith('/>')) { this.i += 2; return { name, attrs, children: [], text: '', line, column }; }
      if (this.s[this.i] === '>') { this.i++; break; }
      if (this.i === before) this.fail('XML_SYNTAX', `Expected whitespace or ">" in <${name}>`);
      const aAt = this.i;
      const an = this.name();
      this.skipWs();
      if (this.s[this.i] !== '=') this.fail('XML_SYNTAX', `Attribute ${an} has no value`);
      this.i++;
      this.skipWs();
      const q = this.s[this.i];
      if (q !== '"' && q !== "'") this.fail('XML_SYNTAX', `Attribute ${an} must be quoted`);
      this.i++;
      const raw = this.until(q, 'attribute value');
      if (raw.includes('<')) this.fail('XML_SYNTAX', `Attribute ${an} contains "<"`, aAt);
      if (an in attrs) this.fail('XML_SYNTAX', `Attribute ${an} appears twice`, aAt);
      if (++nAttrs > this.L.maxAttributes) this.fail('XML_LIMIT', `<${name}> has more than ${this.L.maxAttributes} attributes`, aAt);
      attrs[an] = this.decode(raw, aAt).replace(/[\t\n]/g, ' ');
    }
    const children = [];
    let text = '';
    for (;;) {
      if (this.i >= this.s.length) this.fail('XML_SYNTAX', `<${name}> is not closed`, at);
      if (this.startsWith('</')) {
        const endAt = this.i;
        this.i += 2;
        const end = this.name();
        this.skipWs();
        if (this.s[this.i] !== '>') this.fail('XML_SYNTAX', `Malformed end tag </${end}>`);
        this.i++;
        if (end !== name) this.fail('XML_SYNTAX', `</${end}> does not close <${name}>`, endAt);
        return { name, attrs, children, text, line, column };
      }
      if (this.startsWith('<!--')) { this.i += 4; this.until('-->', 'comment'); continue; }
      if (this.startsWith('<![CDATA[')) { this.i += 9; text += this.until(']]>', 'CDATA section'); continue; }
      if (this.startsWith('<?')) { this.i += 2; this.until('?>', 'processing instruction'); continue; }
      if (this.startsWith('<!')) this.fail('XML_DTD_FORBIDDEN', 'Markup declarations are not accepted');
      if (this.s[this.i] === '<') { children.push(this.element(depth + 1)); continue; }
      const tAt = this.i;
      const j = this.s.indexOf('<', this.i);
      const raw = this.s.slice(this.i, j < 0 ? this.s.length : j);
      this.i += raw.length;
      if (raw.includes(']]>')) this.fail('XML_SYNTAX', '"]]>" is not allowed in text', tAt);
      text += this.decode(raw, tAt);
    }
  }
}

// ------------------------------------------------------------------------------------------------ tree helpers

/** Children with a given element name (case-insensitive when `ci`). */
export function kids(node, name, { ci = false } = {}) {
  if (!node) return [];
  const want = ci ? name.toLowerCase() : name;
  return node.children.filter(c => (ci ? c.name.toLowerCase() : c.name) === want);
}
export const kid = (node, name, opts) => kids(node, name, opts)[0] || null;
/** Trimmed text of a child element, or null. */
export function childText(node, name, opts) { const c = kid(node, name, opts); return c ? c.text.trim() : null; }
