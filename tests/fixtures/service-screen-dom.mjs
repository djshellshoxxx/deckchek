// Small DOM fixture for the service screen and the real shell/live-region builders.
// Events dispatch synchronously and deliberately ignore returned promises, as DOM events do.
const VOID_TAGS = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR']);

export class Element {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.attributes = {}; this.dataset = {}; this.listeners = {};
    this.className = ''; this.parentNode = null; this._text = ''; this.defaultValue = '';
    this.checked = false; this.defaultChecked = false; this.selected = false; this.defaultSelected = false;
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === 'class') this.className = String(value);
    else if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    else if (key === 'value') { this.defaultValue = String(value); if (!this._dirtyValue) this._value = String(value); }
    else if (key === 'checked') { this.checked = true; this.defaultChecked = true; }
    else if (key === 'selected') { this.selected = true; this.defaultSelected = true; }
    else if (['hidden', 'disabled', 'open'].includes(key)) this[key] = true;
    else this[key] = String(value);
  }
  getAttribute(key) { return this.attributes[key] ?? null; }
  hasAttribute(key) { return Object.hasOwn(this.attributes, key); }
  removeAttribute(key) { delete this.attributes[key]; if (['hidden', 'disabled', 'checked', 'open'].includes(key)) this[key] = false; }
  append(...nodes) {
    for (let node of nodes) {
      if (!(node instanceof Element)) node = this.ownerDocument.createTextNode(String(node));
      node.remove(); node.parentNode = this; this.children.push(node);
    }
  }
  prepend(...nodes) { const old = [...this.children]; this.replaceChildren(...nodes, ...old); }
  replaceWith(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    const children = [...parent.children], index = children.indexOf(this);
    parent.replaceChildren(...children.slice(0, index), ...nodes, ...children.slice(index + 1));
  }
  replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this._text = ''; if (this.tagName === 'SELECT') delete this._value; this.append(...nodes); }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  get isConnected() { return this.ownerDocument.body?.contains(this) || false; }
  get firstElementChild() { return this.children.find(child => child.tagName !== '#TEXT') || null; }
  set textContent(value) { this.replaceChildren(); this._text = String(value ?? ''); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  // Only trusted markup supplied by production builders is parsed here. Layout and HTML validation
  // remain the browser smoke suite's responsibility; these tests need element identity and ownership.
  set innerHTML(value) {
    this.replaceChildren();
    const stack = [this];
    for (const token of String(value).match(/<[^>]*>|[^<]+/g) || []) {
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (token.startsWith('<')) {
        const match = token.match(/^<([\w-]+)([\s\S]*?)\/?\s*>$/);
        if (!match) continue;
        const node = this.ownerDocument.createElement(match[1]);
        for (const attr of match[2].matchAll(/([^\s=]+)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)'|\s*=\s*([^\s]+))?/g)) node.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
        stack.at(-1).append(node);
        if (!VOID_TAGS.has(node.tagName) && !token.endsWith('/>')) stack.push(node);
      } else stack.at(-1).append(this.ownerDocument.createTextNode(token));
    }
  }
  set value(value) { this._value = String(value); this._dirtyValue = true; }
  get value() { return this._value ?? this.children.find(child => child.selected)?.value ?? this.children.find(child => child.tagName === 'OPTION')?.value ?? ''; }
  get options() { return this.children.filter(child => child.tagName === 'OPTION'); }
  get selectedIndex() { return this.options.findIndex(option => option.value === this.value); }
  addEventListener(name, callback, options = {}) { (this.listeners[name] ||= []).push({ callback, options }); }
  removeEventListener(name, callback) { this.listeners[name] = (this.listeners[name] || []).filter(listener => listener.callback !== callback); }
  dispatch(name, init = {}) {
    const event = { target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...init };
    for (const { callback, options } of [...(this.listeners[name] || [])]) {
      if (options.signal?.aborted) continue;
      if (options.once) this.removeEventListener(name, callback);
      callback(event);
    }
    return event;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(value => value.trim());
    const matches = node => selectors.some(sel => {
      const attr = sel.match(/^(.*?)\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (attr) return (!attr[1] || node.tagName === attr[1].toUpperCase()) && node.hasAttribute(attr[2]) && (attr[3] === undefined || node.getAttribute(attr[2]) === attr[3]);
      if (sel.startsWith('#')) return node.id === sel.slice(1);
      if (sel.startsWith('.')) return node.className.split(' ').includes(sel.slice(1));
      return node.tagName === sel.toUpperCase();
    });
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  focus() {
    for (let node = this; node; node = node.parentNode) if (node.hidden) return;
    if (this.isConnected) this.ownerDocument.activeElement = this;
  }
  showModal() { this.setAttribute('open', ''); }
  close(value = '') { this.returnValue = value; this.removeAttribute('open'); this.dispatch('close'); }
}

export function installServiceDom(t) {
  const document = {
    createElement(tag) { return new Element(tag, this); },
    createTextNode(text) { const node = this.createElement('#text'); node.textContent = text; return node; },
    getElementById(id) { return this.body.querySelector(`#${id}`); },
    querySelector(selector) { return this.body.querySelector(selector); },
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
    addEventListener(...args) { this.body.addEventListener(...args); },
    dispatch(...args) { return this.body.dispatch(...args); },
  };
  document.body = document.createElement('body');
  document.body.innerHTML = '<div id="rail-list"></div><main id="main"><section id="screen-other"><h1>Other</h1></section></main><div id="inspector-title"></div><div id="inspector-body"></div><div id="toasts"></div><div id="sr-polite"></div><div id="sr-assertive"></div>';
  document.activeElement = document.body;
  const records = new Map();
  const globals = {
    document, Node: Element, CSS: { escape: value => String(value) },
    localStorage: { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, String(value)) },
    fetch: async () => ({ ok: true, json: async () => ({ profiles: [] }) }),
    window: {},
  };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  t.after(() => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  return document;
}

export const turn = () => new Promise(resolve => setImmediate(resolve));
export const settle = async () => { await turn(); await turn(); await turn(); };
export const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
