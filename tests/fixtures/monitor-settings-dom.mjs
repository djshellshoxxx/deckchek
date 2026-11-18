// Exercise real monitor builders, cached shell navigation and native app-state calls.
// DOM events deliberately ignore returned promises, matching browser dispatch.
import { Element, installServiceDom } from './service-screen-dom.mjs';
export { deferred, settle } from './service-screen-dom.mjs';

class MonitorElement extends Element {
  constructor(tag, document) { super(tag, document); this.style = {}; }
  get childElementCount() { return this.children.filter(child => child.tagName !== '#TEXT').length; }
  get lastElementChild() { return this.children.filter(child => child.tagName !== '#TEXT').at(-1) || null; }
  click() { if (!this.disabled) this.dispatch('click'); }
}

export function installMonitorDom(t) {
  const document = installServiceDom(t);
  document.createElement = function (tag) { return new MonitorElement(tag, this); };
  document.createElementNS = (_namespace, tag) => document.createElement(tag);
  const capture = document.createElement('div'); capture.id = 'status-capture';
  document.body.append(capture);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  globalThis.requestAnimationFrame = callback => setImmediate(callback);
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'requestAnimationFrame', previous);
    else delete globalThis.requestAnimationFrame;
  });
  return document;
}

function finalBlock() {
  const data = new ArrayBuffer(48), view = new DataView(data);
  [0x44, 0x43, 0x53, 0x42].forEach((byte, index) => view.setUint8(index, byte));
  view.setUint16(4, 1, true); view.setUint16(6, 1, true); view.setUint32(12, 48000, true);
  return data;
}

export function nativeMonitorSettings({ read, write, prune, initial = null }) {
  let saved = structuredClone(initial), stream = null, streamId = 0;
  const calls = [];
  const invoke = async (command, args = {}) => {
    calls.push({ command, args: command === 'start_stream_capture' ? { holder: args.holder } : structuredClone(args) });
    switch (command) {
      case 'app_state_get': return read.promise;
      case 'app_state_set':
        if (write) await write.promise;
        saved = structuredClone(args.value);
        return null;
      case 'monitor_prune': return prune ? prune.promise : { deleted: 2 };
      case 'list_native_audio_inputs': return [{ name: 'Monitor test input', isDefault: true, maxChannels: 2 }];
      case 'monitor_session_list': return [];
      case 'monitor_session_start': return { id: '00000000-0000-4000-8000-000000000031' };
      case 'monitor_set_tray_state': return { supported: true, state: args.state };
      case 'monitor_log_append': return { eventsStored: args.events.length, eventsDropped: 0, minutesStored: args.minutes.length };
      case 'monitor_session_end': return null;
      case 'start_stream_capture':
        stream = { streamId: ++streamId, channel: args.channel, lost: false };
        return { streamId, holder: args.holder, deviceName: 'Monitor test input', sampleRate: 48000, pairs: [{ first: 1, second: 2, label: '1-2', mono: false }] };
      case 'stop_stream_capture': {
        const ended = stream;
        stream = null;
        if (!ended) throw new Error('No stream capture is running');
        if (!ended.lost) ended.channel.onmessage(finalBlock());
        return { streamId: ended.streamId, ended: ended.lost ? 'deviceLost' : 'stopped' };
      }
      default: throw new Error(`Unexpected monitor command: ${command}`);
    }
  };
  return {
    api: { core: { invoke, Channel: class { onmessage = null; } } },
    of: command => calls.filter(call => call.command === command).map(call => call.args),
    get saved() { return structuredClone(saved); },
    loseDevice() {
      if (!stream) throw new Error('Start monitoring before losing the device');
      stream.lost = true;
      stream.channel.onmessage(finalBlock());
    },
  };
}
