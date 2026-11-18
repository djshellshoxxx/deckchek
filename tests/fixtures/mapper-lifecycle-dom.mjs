// Minimal DOM for the mapper's real callbacks and cached shell navigation. Events intentionally
// ignore callback return values, as browser DOM events do; native mapper writes use a deferred bridge.
import { createMapperScreen } from '../../app/ui/screens/mapper.js';
import { go, registerScreens } from '../../app/ui/shell.js';
import { active } from '../../app/ui/state.js';
import * as midi from '../../app/midi.js';

let midiMessageListener = null;

class Element {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.attributes = {}; this.dataset = {}; this.listeners = {};
    this.className = ''; this.parentNode = null; this._text = '';
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key.startsWith('data-')) this.dataset[key.slice(5)] = String(value);
    else if (['hidden', 'disabled', 'checked', 'selected'].includes(key)) this[key] = true;
    else this[key] = String(value);
  }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; if (['hidden', 'disabled', 'checked'].includes(key)) this[key] = false; }
  append(...nodes) {
    for (let node of nodes) {
      if (!(node instanceof Element)) node = this.ownerDocument.createTextNode(String(node));
      node.remove(); node.parentNode = this; this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = []; this._text = ''; this.append(...nodes);
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  set textContent(value) { this.replaceChildren(); this._text = String(value ?? ''); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(value) { this.replaceChildren(); this._html = value; } // trusted decorative icons only
  set value(value) { this._value = String(value); }
  get value() { return this._value ?? this.children.find(child => child.selected)?.value ?? this.children.find(child => child.tagName === 'OPTION')?.value ?? ''; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  dispatch(name, init = {}) {
    const event = { target: this, currentTarget: this, preventDefault() {}, ...init };
    for (const callback of this.listeners[name] || []) callback(event);
  }
  click() { if (!this.disabled) this.dispatch('click'); }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
    return this.tagName === selector.toUpperCase();
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  get classList() {
    return { toggle: (name, force) => {
      const classes = new Set(this.className.split(' ').filter(Boolean));
      if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name);
      this.className = [...classes].join(' ');
    } };
  }
  focus() { if (!this.disabled && this.ownerDocument.body.contains(this)) this.ownerDocument.activeElement = this; }
}

export const turn = () => new Promise(resolve => setImmediate(resolve));
export const settle = async () => { await turn(); await turn(); };
export const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

export function nativeMappings({ rows = [], beforeSave = async () => {}, ports = [], beforeMidiOpen = async () => {}, openPorts = [] } = {}) {
  const saved = new Map(rows.map(row => [row.id, structuredClone(row)]));
  const saves = [];
  const midiOpens = [], midiCloses = [], opened = new Map(openPorts.map(p => [p.id, p]));
  let nextId = rows.length + 1;
  const invoke = async (command, args) => {
    if (command === 'midi_list_ports') return { inputs: structuredClone(ports), outputs: [] };
    if (command === 'midi_status') return { openInputs: [...opened.values()].map(p => p.name), openInputIds: [...opened.keys()], dropped: 0 };
    if (command === 'midi_open_input') {
      midiOpens.push(structuredClone(args)); await beforeMidiOpen(args);
      const matches = ports.filter(p => args.id != null ? p.id === args.id : p.name === args.name);
      if (matches.length !== 1) throw new Error('MIDI input selection is unavailable or ambiguous');
      opened.set(matches[0].id, matches[0]); return;
    }
    if (command === 'midi_close_input') {
      midiCloses.push(structuredClone(args));
      for (const [id, p] of opened) if (args.id != null ? id === args.id : p.name === args.name) opened.delete(id);
      return;
    }
    if (command === 'midi_close_all') { opened.clear(); return; }
    if (command === 'mapper_model_list') return [...saved.values()].map(({ model, ...row }) => ({ ...row, controlCount: model.controls.length }));
    if (command === 'mapper_model_get') return structuredClone(saved.get(args.id) ?? null);
    if (command === 'mapper_model_save') {
      const input = structuredClone(args.input);
      saves.push(input);
      await beforeSave(input, saves.length);
      const id = input.id ?? `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
      const row = { ...input, id };
      saved.set(id, row);
      return structuredClone(row);
    }
    throw new Error(`Unexpected native command: ${command}`);
  };
  return { invoke, saved, saves, ports, midiOpens, midiCloses, opened, emitMidi: message => midiMessageListener?.({ payload: message }) };
}

export async function mountMapper(t, native = nativeMappings()) {
  const document = {
    createElement(tag) { return new Element(tag, this); },
    createTextNode(text) { const node = this.createElement('#text'); node.textContent = text; return node; },
    getElementById(id) { return this.body.querySelector(`#${id}`); },
    querySelector(selector) { return this.body.querySelector(selector); },
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
    addEventListener(...args) { this.body.addEventListener(...args); },
  };
  document.body = document.createElement('body'); document.activeElement = document.body;
  const element = (tag, id) => { const node = document.createElement(tag); node.setAttribute('id', id); return node; };
  const main = element('main', 'main'), section = element('section', 'screen-mapper'), other = element('section', 'screen-other');
  section.hidden = true; other.hidden = true;
  main.append(section, other); document.body.append(element('nav', 'rail-list'), main);
  const globals = {
    document, Node: Element, CSS: { escape: value => String(value) },
    window: { __TAURI__: { core: { invoke: native.invoke }, event: { listen: async (_, listener) => { midiMessageListener = listener; return () => { midiMessageListener = null; }; } } } },
    fetch: async () => ({ ok: true, json: async () => ({ profiles: [] }) }),
  };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  active.screen = null;
  registerScreens([
    { id: 'mapper', title: 'MIDI mapper', icon: 'keyboard', create: createMapperScreen },
    { id: 'other', title: 'Other', icon: 'info', create: () => ({}) },
  ]);
  go('mapper');
  await settle();
  t.after(async () => {
    go('other'); active.screen = null;
    await midi.closeAll();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const byId = id => section.querySelector(`#${id}`);
  return {
    native, section, byId, navigate: go,
    click: id => { const node = byId(id); if (!node) throw new Error(`Missing mapper control: ${id}`); node.click(); },
    rename: name => { const input = byId('mp-name'); input.value = name; input.dispatch('change'); },
    status: () => byId('mp-status').textContent,
  };
}
