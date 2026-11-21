import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { installNativeCatalogDom, settle } from './fixtures/native-catalog-archive-dom.mjs';
import { MAX_PRESET_BYTES } from '../app/pre-gig.js';
import { LIMITS as MEDIA_LIMITS } from '../app/media-library.js';
import { readTextFile } from '../app/text-file.js';

const document = installNativeCatalogDom({ after });
const { createPregigScreen } = await import('../app/ui/screens/pregig.js');
const { createMediaScreen } = await import('../app/ui/screens/media.js');
const { media } = await import('../app/ui/media-picker.js');
const encoder = new TextEncoder();
const preset = { v: 1, name: 'Café \ufffd rig', audioDevice: 'Interface', sampleRate: 48000, decks: [{ id: 'A', input: [0, 1], format: 'Traktor Scratch MK2' }] };
const medium = { schemaVersion: 1, version: 1, name: 'Café \ufffd disc', kind: 'test_record', confidence: 'unverified', tracks: [{ key: 'a', purpose: 'speed_tone', frequencyHz: 3150 }] };

function file(value, { size, bytes, error } = {}) {
  const contents = bytes || encoder.encode(JSON.stringify(value));
  const reads = { text: 0, bytes: 0 };
  return { name: 'profile.json', size: size ?? contents.length, reads,
    async text() { reads.text++; if (error) throw error; return new TextDecoder().decode(contents); },
    async arrayBuffer() { reads.bytes++; if (error) throw error; return contents.slice().buffer; },
  };
}

function malformedNameBytes(value) {
  const [prefix, suffix] = JSON.stringify({ ...value, name: 'MARKER' }).split('MARKER');
  return new Uint8Array([...encoder.encode(prefix), 0xc3, 0x28, ...encoder.encode(suffix)]);
}

async function mountPreset(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = document.createElement('section'); document.body.append(host);
  const writes = [];
  const api = { listPresets: async () => [], upsertPreset: async value => { writes.push(structuredClone(value)); return { ...value, id: 'new-preset' }; } };
  const screen = createPregigScreen(host, { api, nativeInvoke: null });
  await settle();
  host.querySelector('#pg-tab-presets').dispatch('click');
  t.after(() => { screen.dispose(); host.remove(); });
  return { host, writes };
}
async function choosePreset(host, selected) {
  const button = host.querySelector('#pg-import');
  const pending = button.listeners.click[0].callback({ target: button, currentTarget: button });
  const picker = document.body.children.find(node => node.tagName === 'INPUT' && node.type === 'file');
  assert.ok(picker, 'the real preset handler opens a file picker');
  picker.files = [selected]; picker.dispatch('change');
  await pending; await settle();
}

test('pre-gig refuses an oversized selected preset before reading or saving', async t => {
  const f = await mountPreset(t), selected = file(preset, { size: MAX_PRESET_BYTES + 1 });
  await choosePreset(f.host, selected);
  assert.deepEqual(selected.reads, { text: 0, bytes: 0 });
  assert.equal(f.writes.length, 0);
  assert.match(f.host.querySelector('#pg-notice').textContent, /256|large|limit/i);
});

test('pre-gig catches file read errors and preserves the existing preset collection', async t => {
  const f = await mountPreset(t), selected = file(preset, { error: new Error('Permission denied') });
  await assert.doesNotReject(choosePreset(f.host, selected));
  assert.equal(f.writes.length, 0);
  assert.match(f.host.querySelector('#pg-notice').textContent, /Permission denied/);
});

test('pre-gig rejects mismatched read lengths before parsing or saving', async t => {
  const f = await mountPreset(t), selected = file(preset, { size: 1 });
  await choosePreset(f.host, selected);
  assert.equal(f.writes.length, 0);
  assert.match(f.host.querySelector('#pg-notice').textContent, /size|length|complete/i);
});

test('pre-gig consumes one strict UTF-8 snapshot while retaining valid Unicode presets', async t => {
  const f = await mountPreset(t), selected = file(preset);
  await choosePreset(f.host, selected);
  assert.deepEqual(selected.reads, { text: 0, bytes: 1 });
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].name, preset.name);
  assert.match(f.host.querySelector('#pg-notice').textContent, /Imported/);
});

test('pre-gig rejects malformed UTF-8 without saving a replacement-decoded preset', async t => {
  const f = await mountPreset(t), selected = file(null, { bytes: malformedNameBytes(preset) });
  await choosePreset(f.host, selected);
  assert.equal(f.writes.length, 0);
  assert.match(f.host.querySelector('#pg-notice').textContent, /UTF-8/i);
});

function mountMedia(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = document.createElement('section'); document.body.append(host);
  const previous = { ...media }, writes = [];
  Object.assign(media, { ready: true, entries: [], error: null, store: {
    saveCustom: async profile => { writes.push(structuredClone(profile)); return { ok: true, id: profile.id }; },
    list: async () => [],
  } });
  createMediaScreen(host);
  t.after(() => { host.remove(); Object.assign(media, previous); });
  return { host, writes };
}
async function chooseMedia(host, selected) {
  const input = host.querySelector('#media-import-file'); input.files = [selected];
  await input.listeners.change[0].callback({ target: input, currentTarget: input });
  await settle();
}

test('media import rejects malformed UTF-8 instead of storing replacement text', async t => {
  const f = mountMedia(t);
  const selected = file(null, { bytes: malformedNameBytes(medium) });
  await chooseMedia(f.host, selected);
  assert.equal(f.writes.length, 0);
  assert.match(f.host.querySelector('#media-import-errors').textContent, /UTF-8/i);
});

test('media import rejects invalid declared sizes before reading', async t => {
  const f = mountMedia(t);
  for (const size of [undefined, null, -1, 1.5, NaN, Infinity, '42', MEDIA_LIMITS.maxJsonBytes + 1]) {
    const selected = file(medium); selected.size = size;
    await chooseMedia(f.host, selected);
    assert.deepEqual(selected.reads, { text: 0, bytes: 0 });
    assert.equal(f.writes.length, 0);
  }
});

test('media import rejects mismatched read lengths and preserves normal one-read imports', async t => {
  const f = mountMedia(t), mismatched = file(medium, { size: 1 });
  await chooseMedia(f.host, mismatched); assert.equal(f.writes.length, 0);
  const selected = file(medium);
  await chooseMedia(f.host, selected);
  assert.deepEqual(selected.reads, { text: 0, bytes: 1 });
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].name, medium.name);
});

test('media import reports byte-read failures without storing a profile', async t => {
  const f = mountMedia(t), selected = file(medium, { error: new Error('File became unreadable') });
  await assert.doesNotReject(chooseMedia(f.host, selected));
  assert.equal(f.writes.length, 0);
  assert.match(f.host.querySelector('#media-import-errors').textContent, /unreadable/);
});

test('bounded text reads preserve UTF-8 BOM compatibility and measure the byte boundary', async () => {
  const text = JSON.stringify(preset);
  const selected = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), text], { type: 'application/json' });
  assert.ok(selected.size > text.length);
  assert.equal(await readTextFile(selected, { maxBytes: selected.size }), text);
  await assert.rejects(readTextFile(selected, { maxBytes: selected.size - 1 }), /larger/);
});

test('bounded text reads reject incomplete reads and non-buffer results before decoding', async () => {
  const selected = file(preset);
  for (const result of [null, undefined, JSON.stringify(preset), encoder.encode(JSON.stringify(preset)), new ArrayBuffer(selected.size - 1)]) {
    selected.arrayBuffer = async () => result;
    await assert.rejects(readTextFile(selected, { maxBytes: MAX_PRESET_BYTES }), /read completely|byte length/i);
  }
});
