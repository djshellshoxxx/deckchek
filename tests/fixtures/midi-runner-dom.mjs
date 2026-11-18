// Minimal DOM + injected MIDI bridge for driving app/ui/devices/midi-runner.js under node:test.
// It models only the DOM operations the production builders use (same approach as
// tests/midi-runner-lifecycle.test.mjs); event handlers are the runner's real callbacks.
import { after } from 'node:test';
import { runMidi } from '../../app/ui/devices/midi-runner.js';

export class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.dataset = {}; this.className = ''; this.attributes = {}; }
  setAttribute(key, value) { this.attributes[key] = value; if (key === 'id') this.id = value; if (key === 'value') this.value = value; if (key === 'disabled') this.disabled = true; }
  getAttribute(key) { return this.attributes[key] ?? null; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html || ''; }
  set value(value) { this.selectedValue = value; }
  get value() { return this.selectedValue ?? this.children.find(c => c.tagName === 'OPTION' && Object.hasOwn(c.attributes, 'selected'))?.value ?? this.children.find(c => c.tagName === 'OPTION')?.value ?? ''; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  async fire(name) { for (const callback of this.listeners[name] || []) await callback({ target: this, currentTarget: this }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const match = el => selector.startsWith('#') ? el.id === selector.slice(1) : selector.startsWith('.') ? el.className.split(' ').includes(selector.slice(1)) : el.tagName === selector.toUpperCase();
    return this.children.flatMap(child => [...(match(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  /** Every descendant for which `pred` holds (attribute lookups the selector subset cannot express). */
  findAll(pred) { return this.children.flatMap(child => [...(pred(child) ? [child] : []), ...child.findAll(pred)]); }
  get tBodies() { return this.children.filter(child => child.tagName === 'TBODY'); }
  get classList() { return { add() {}, remove() {}, toggle() {} }; }
  focus() {}
}

export function installDom() {
  const previous = { document: globalThis.document, Node: globalThis.Node };
  globalThis.Node = Element;
  globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => Object.assign(new Element('#text'), { textContent: text }), getElementById: () => null };
  after(() => Object.assign(globalThis, previous));
}

export const turn = () => new Promise(resolve => setImmediate(resolve));
export const settle = async () => { await turn(); await turn(); await turn(); };
export const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

/** Injected bridge; `send`/`status` hooks may return a promise to hold a call open. */
export function bridge({ open = async () => {}, close = async () => {}, send = async () => {}, status = async () => ({ dropped: 0, openInputs: ['A', 'B'] }), listPorts = async () => ({ inputs: [{ name: 'A' }, { name: 'B' }], outputs: [{ name: 'A' }, { name: 'B' }] }) } = {}) {
  const listeners = new Set();
  const midi = {
    opens: [], closes: [], sends: [], statusCalls: 0, listeners,
    backend: () => 'tauri', isAvailable: () => true, listPorts,
    async open(port) { midi.opens.push(port); await open(port, midi.opens.length); },
    async close(port) { midi.closes.push(port); await close(port, midi.closes.length); },
    async send(port, bytes) { midi.sends.push({ port, bytes: Array.from(bytes) }); await send(port, bytes, midi.sends.length); },
    async status() { midi.statusCalls++; return status(midi.statusCalls); },
    onMessage(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    emit(bytes, timestampUs = 100000, port = 'A') { for (const listener of [...listeners]) listener({ bytes, timestampUs, port }); },
  };
  return midi;
}

/** Mount runMidi for one test kind; returns helpers to click, switch ports and read saved results. */
export function mount({ kind, profile = { model: 'Test unit', midi: { mapSource: 'published', controls: [] } }, midi = bridge(), test = {} } = {}) {
  const host = new Element('div'), finished = [], skipped = [];
  const runner = runMidi(host, { test: { method: `midi:${kind}`, steps: [], ...test }, profile, kind, midi, finish: result => finished.push(result), skip: reason => skipped.push(reason) });
  const byId = id => host.querySelector(`#${id}`);
  return {
    host, runner, midi, finished, skipped, byId,
    click: id => byId(id).fire('click'),
    select: async port => { const select = byId('midi-port'); select.value = port; return select.fire('change'); },
  };
}
