// MIDI device tests: coverage (with learn mode), fader, jog, button, LED and
// timing jitter. Port picker auto-selects the profile's port; every panel has
// a clear state when no MIDI port or device is present.

import { h, esc, formatNumber } from '../dom.js';
import { icon, chip } from '../icons.js';
import * as midiBridge from '../../midi.js';
import { parseMessage, matchControl, createCoverageSession, analyzeFader, analyzeJog, analyzeButton, analyzeTiming, buildLedSequence } from '../../midi-tests.js';
import { analyzeStream, conformanceFindings, parseIdentityReply, IDENTITY_REQUEST, gmSteps, gmCleanup, evaluateGm } from '../../midi-conformance.js';
import { evaluateOutcome, effectiveMidiMap, learnedControls, learnKey, inferControlType, pickMidiPort, midiFindings } from '../../devices/dispatch.js';
import { linePlot } from '../plots.js';
import { stepsCard, readoutGrid, findingList } from './runners.js';
import { announce, toast } from '../live.js';

const TYPES = ['button', 'pad', 'fader', 'knob', 'encoder', 'jog', 'jog-touch', 'switch', 'touch-strip', 'platter'];
const nowUs = () => Math.round(performance.now() * 1000);
const msgLabel = d => `${d.kind === 'note' ? 'Note' : d.kind === 'pitchbend' ? 'Pitch bend' : 'CC'}${d.kind === 'pitchbend' ? '' : ` ${d.number}`} · ch ${d.channel}`;
const keyOf = msg => `${msg.kind === 'note-on' || msg.kind === 'note-off' ? 'note' : msg.kind}:${msg.channel}:${msg.number}`;

/** Control ids the profile's tests refer to, with readable labels (for learn-mode suggestions). */
function suggestedControls(profile, eff) {
  const out = new Map();
  for (const c of eff.placeholders || []) out.set(c.id, { id: c.id, label: c.label || c.id, type: c.type, group: c.group });
  for (const t of profile.tests || []) {
    const ids = [t.params?.controlId, ...(t.params?.controlIds || [])].filter(Boolean);
    for (const id of ids) if (!out.has(id) && !eff.controls.some(c => c.id === id)) out.set(id, { id, label: String(t.title).split(':')[0].trim() || id, type: t.method === 'midi:jog' ? 'jog' : t.method === 'midi:fader' ? 'fader' : 'button' });
  }
  return [...out.values()];
}

export function runMidi(host, ctx) {
  const { test, profile, kind } = ctx;
  const midi = ctx.midi || midiBridge;
  let eff = effectiveMidiMap(profile.midi, ctx.learned?.map);
  const st = { port: null, outPort: null, opened: null, inputs: [], outputs: [], unsub: null, panel: null };

  const portCard = h('section', { class: 'card dev-midi-ports', 'aria-labelledby': 'midi-port-title' });
  const body = h('div', { class: 'dev-midi-body' });
  const mapNote = h('p', { class: 'hint' });
  host.replaceChildren(h('div', { class: 'dev-run-grid' }, h('div', { class: 'dev-run-main' }, portCard, body), h('aside', { class: 'dev-run-side', 'aria-label': 'Test instructions' }, stepsCard(test, { extra: params(test) }), mapNote)));
  renderMapNote();

  function params(t) {
    const out = [];
    if (t.params?.controlId) out.push(['Control', t.params.controlId]);
    if (t.params?.controlIds?.length) out.push(['Controls', t.params.controlIds.join(', ')]);
    if (t.params?.groups?.length) out.push(['Groups', t.params.groups.join(', ')]);
    return out;
  }
  function renderMapNote() {
    mapNote.innerHTML = eff.mapSource === 'learn'
      ? `${icon('info', { size: 16 })}<span><strong>Learn mode.</strong> No public MIDI list for this device, and no map learned on this unit yet. Run the MIDI coverage test to label the controls and save a map; fader, jog and LED tests then use it.</span>`
      : `${icon('info', { size: 16 })}<span><strong>${eff.mapSource === 'learned' ? 'Learned map' : 'Published map'}:</strong> ${eff.controls.length} control${eff.controls.length === 1 ? '' : 's'}${eff.mapSource === 'learned' ? ' learned on this unit' : ''}.</span>`;
  }

  // ---------- ports ----------
  async function refreshPorts() {
    portCard.innerHTML = `<div class="card-head"><h2 class="card-title" id="midi-port-title">MIDI connection</h2><span class="muted small">${esc(midi.backend() === 'tauri' ? 'Desktop MIDI' : midi.backend() === 'webmidi' ? 'Web MIDI' : 'MIDI unavailable')}</span></div>`;
    if (!midi.isAvailable()) {
      portCard.append(h('div', { class: 'empty empty-sm', html: `${icon('plug', { size: 32 })}<h2>MIDI is not available here</h2><p>Run this test in the DeckChek desktop app (or a browser with Web MIDI) with ${esc(profile.model)} connected by USB.</p>` }));
      body.replaceChildren();
      return;
    }
    let ports;
    try { ports = await midi.listPorts(); }
    catch (error) { portCard.append(h('div', { class: 'banner banner-fail', role: 'alert', html: `${chip('fail')}<div class="banner-text"><strong>Could not list MIDI ports</strong><span>${esc(error?.message || error)}</span></div>` })); return; }
    st.inputs = (ports?.inputs || []).map(p => p.name);
    st.outputs = (ports?.outputs || []).map(p => p.name);
    if (!st.inputs.length) {
      const empty = h('div', { class: 'empty empty-sm', id: 'midi-empty' });
      empty.innerHTML = `${icon('plug', { size: 32 })}<h2>No MIDI device found</h2><p>Connect ${esc(profile.model)} by USB, power it on, wait a few seconds, then refresh. Close DJ software that may hold the port exclusively.</p>`;
      empty.append(h('button', { type: 'button', class: 'btn btn-primary', id: 'midi-refresh', html: `${icon('refresh', { size: 18 })}<span>Refresh</span>`, onclick: refreshPorts }));
      portCard.append(empty);
      body.replaceChildren();
      return;
    }
    const auto = pickMidiPort(st.inputs, profile);
    st.port ||= auto || st.inputs[0];
    if (!st.inputs.includes(st.port)) st.port = auto || st.inputs[0];
    st.outPort = pickMidiPort(st.outputs, profile) || st.outputs.find(n => n === st.port) || st.outputs[0] || null;
    const sel = h('select', { id: 'midi-port' });
    st.inputs.forEach(n => sel.append(h('option', { value: n, text: `${n}${n === auto ? ' (matches profile)' : ''}`, selected: n === st.port ? true : null })));
    sel.addEventListener('change', async () => { st.port = sel.value; await connect(); });
    const row = h('div', { class: 'dev-port-row' },
      h('label', { class: 'field', for: 'midi-port' }, h('span', { class: 'field-label', text: 'Input port' }), sel),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Refresh MIDI ports', 'data-tooltip': 'Refresh MIDI ports', html: icon('refresh', { size: 18 }), onclick: refreshPorts }));
    portCard.append(row);
    if (!auto) portCard.append(h('p', { class: 'hint hint-warn', html: `${icon('warn', { size: 16 })}<span>No port name matches ${esc((profile.connectivity?.midi?.portNamePatterns || []).map(p => `“${p}”`).join(', ') || 'this device')}. Pick the port for your ${esc(profile.model)}.</span>` }));
    st.status = h('p', { class: 'muted small dev-port-status', role: 'status' });
    portCard.append(st.status);
    await connect();
  }

  async function connect() {
    if (st.opened && st.opened !== st.port) { try { await midi.close(st.opened); } catch { /* ignore */ } st.opened = null; }
    try { await midi.open(st.port); st.opened = st.port; st.status.innerHTML = `${chip('pass', 'CONNECTED', { size: 14 })} <span>Listening on ${esc(st.port)}.</span>`; }
    catch (error) { st.status.innerHTML = `${chip('fail', 'NOT CONNECTED', { size: 14 })} <span>${esc(error?.message || error)}</span>`; return; }
    st.unsub?.();
    st.unsub = midi.onMessage(raw => { if (raw.port && raw.port !== st.port) return; const msg = parseMessage(raw.bytes); if (!st.panel?.wantsRaw && (msg.kind === 'clock' || msg.kind === 'other')) return; st.panel?.onMessage(msg, { tUs: Number.isFinite(raw.timestampUs) ? raw.timestampUs : nowUs(), rUs: nowUs(), raw: raw.bytes }); });
    st.panel?.dispose?.();
    st.panel = PANELS[kind]();
  }

  const finishBtn = (label, onClick) => h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'midi-finish', html: `${icon('check', { size: 20 })}<span>${esc(label)}</span>`, onclick: onClick });
  function complete(measurements, findings, extra = {}, override = null) {
    const outcome = override || evaluateOutcome(test, { measurements, findings });
    const btn = body.querySelector('#midi-finish');
    if (btn) { btn.disabled = true; btn.innerHTML = `${icon('check', { size: 20 })}<span>Saved</span>`; }
    ctx.finish({ status: outcome.status, detail: outcome.detail, criterion: outcome.criterion, measurements, findings, extra: { port: st.port, map: eff.mapSource, ...extra } });
  }
  function resultBlock(measurements, findings) {
    return h('div', { class: 'dev-midi-result' }, h('h3', { class: 'section-title', text: 'Readings' }), readoutGrid(measurements), h('h3', { class: 'section-title', text: 'Findings' }), findingList(findings.length ? findings : [{ id: 'midi-ok', severity: 'ok', title: 'No problems found', meaning: 'Every check stayed inside its guide band.', action: '' }]));
  }
  const throttle = (fn, ms = 120) => { let t = 0, timer = null; return () => { const n = performance.now(); if (n - t >= ms) { t = n; fn(); } else if (!timer) timer = setTimeout(() => { timer = null; t = performance.now(); fn(); }, ms); }; };

  /** Lock onto the target control: mapped by id, else the first continuous control that moves. */
  function targetPicker(card, { want = 'continuous', controlId = test.params?.controlId } = {}) {
    const mapped = controlId ? eff.controls.find(c => c.id === controlId) : null;
    const info = h('p', { class: 'dev-target muted', role: 'status' });
    const pair = {};
    const tgt = { key: null, bits: 7, control: mapped };
    if (mapped) { tgt.bits = ['cc14', 'pitchbend'].includes(mapped.message.kind) ? 14 : 7; info.innerHTML = `${chip('info', 'MAPPED', { size: 14 })} <span>Watching <strong>${esc(mapped.label || mapped.id)}</strong> (${esc(msgLabel(mapped.message))}).</span>`; }
    else info.innerHTML = `${chip('review', 'WAITING', { size: 14 })} <span>Move the ${esc(controlId ? controlId.replace(/_/g, ' ') : 'control')} now — DeckChek locks onto the first ${want === 'continuous' ? 'fader, knob or wheel' : 'control'} that moves.</span>`;
    const reset = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Pick a different control', hidden: true });
    reset.addEventListener('click', () => { tgt.key = null; reset.hidden = true; info.innerHTML = `${chip('review', 'WAITING', { size: 14 })} <span>Move the control you want to test.</span>`; tgt.onReset?.(); });
    card.append(h('div', { class: 'dev-target-row' }, info, reset));
    tgt.value = (msg) => {
      if (tgt.control) { const hit = matchControl({ controls: [tgt.control] }, msg, pair); if (!hit || hit.complete === false) return null; return hit.value14 ?? hit.value; }
      const k = keyOf(msg);
      if (!tgt.key) {
        if (want === 'continuous' && !['cc', 'pitchbend'].includes(msg.kind)) return null;
        tgt.key = k; tgt.bits = msg.kind === 'pitchbend' ? 14 : 7;
        info.innerHTML = `${chip('pass', 'LOCKED', { size: 14 })} <span>Using ${esc(msgLabel({ kind: msg.kind, channel: msg.channel, number: msg.number }))}.</span>`;
        reset.hidden = false;
      }
      if (k !== tgt.key) return null;
      return msg.kind === 'pitchbend' ? msg.value14 : msg.value;
    };
    return tgt;
  }

  // ---------- panels ----------
  const PANELS = {
    coverage() {
      const session = createCoverageSession(eff);
      const card = h('section', { class: 'card', 'aria-labelledby': 'cov-title' });
      const learn = eff.mapSource === 'learn' || !eff.controls.length;
      card.append(h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'cov-title', text: learn ? 'Learn this unit’s controls' : 'Control coverage' }), h('span', { class: 'muted small dev-count', 'aria-live': 'off', text: '0 messages' })));
      card.append(h('p', { class: 'muted small', text: learn ? 'Move every knob, fader, pad, button and wheel once. Each new control appears below — give it a name (and a profile control where one fits), then Save learned map so later tests can use it.' : 'Move every control once. Tiles light up as each control reports; anything left dark never sent MIDI.' }));
      const grid = h('div', { class: learn ? 'dev-learn' : 'dev-cov-grid' });
      card.append(grid);
      const labels = {}, rows = new Map(), tiles = new Map();
      const suggestions = suggestedControls(profile, eff);
      if (!learn) {
        const groups = {};
        for (const c of eff.controls) (groups[c.group || 'Ungrouped'] ||= []).push(c);
        for (const [g, cs] of Object.entries(groups)) {
          const sec = h('div', { class: 'dev-cov-group' }, h('h3', { class: 'dev-sub', text: g }));
          const ul = h('ul', { class: 'dev-tiles', role: 'list' });
          cs.forEach(c => { const li = h('li', { class: 'dev-tile', 'data-control': c.id, html: `<span class="dev-tile-label">${esc(c.label || c.id)}</span><span class="dev-tile-meta num">${esc(msgLabel(c.message))}</span>` }); tiles.set(c.id, li); ul.append(li); });
          sec.append(ul); grid.append(sec);
        }
      } else {
        grid.append(h('div', { class: 'empty-inline dev-learn-empty', html: `${icon('keyboard', { size: 20 })}<span>Waiting for the first control… move anything on the ${esc(profile.model)}.</span>` }));
      }
      const saveMap = h('button', { type: 'button', class: 'btn btn-secondary', id: 'midi-save-map', disabled: true, html: `${icon('download', { size: 18 })}<span>Save learned map</span>`, hidden: !learn });
      saveMap.addEventListener('click', async () => {
        const rep = session.report();
        const fresh = learnedControls(rep.discovered || [], labels);
        if (!fresh.length) { toast('Name at least one control first.', { type: 'warn' }); return; }
        const keep = (ctx.learned?.map?.controls || []).filter(c => !fresh.some(f => f.id === c.id || (f.message.kind === c.message?.kind && f.message.channel === c.message?.channel && f.message.number === c.message?.number)));
        const map = { mapSource: 'learned', complete: false, port: st.port, controls: [...keep, ...fresh] };
        try {
          const saved = await ctx.saveLearned(map);
          ctx.learned = saved; eff = effectiveMidiMap(profile.midi, map); renderMapNote();
          toast(`Saved ${map.controls.length} learned control${map.controls.length > 1 ? 's' : ''} for this unit.`, { type: 'success' });
          announce('Learned map saved');
        } catch (error) { toast(`Could not save the learned map: ${error?.message || error}`, { type: 'error' }); }
      });
      const update = throttle(() => {
        const rep = session.report({ groups: test.params?.groups?.length && !learn ? test.params.groups.filter(g => eff.controls.some(c => c.group === g)) : undefined });
        card.querySelector('.dev-count').textContent = `${rep.totalMessages} messages${learn ? ` · ${rep.discovered.length} controls found` : ` · ${formatNumber(rep.percentSeen)}% seen`}`;
        if (!learn) { for (const r of rep.controls) { const t = tiles.get(r.id); if (t) { t.classList.toggle('seen', r.seen); t.querySelector('.dev-tile-meta').textContent = r.seen ? `${r.count}× · ${r.min}–${r.max}` : msgLabel(eff.controls.find(c => c.id === r.id).message); } } return; }
        for (const d of rep.discovered) {
          const k = learnKey(d);
          let row = rows.get(k);
          if (!row) {
            grid.querySelector('.dev-learn-empty')?.remove();
            const idx = rows.size + 1;
            const name = h('input', { type: 'text', id: `learn-name-${idx}`, placeholder: 'Name, e.g. Play deck 1', autocomplete: 'off' });
            const pick = h('select', { id: `learn-ctl-${idx}`, 'aria-label': `Profile control for ${msgLabel(d)}` }, h('option', { value: '', text: '— custom —' }), ...suggestions.map(s => h('option', { value: s.id, text: s.label })));
            const type = h('select', { id: `learn-type-${idx}`, 'aria-label': `Control type for ${msgLabel(d)}` }, ...TYPES.map(t => h('option', { value: t, text: t, selected: t === inferControlType(d) ? true : null })));
            const led = h('input', { type: 'checkbox', id: `learn-led-${idx}` });
            const sync = () => { labels[k] = { label: name.value.trim() || suggestions.find(s => s.id === pick.value)?.label || '', controlId: pick.value || null, type: type.value, led: led.checked }; saveMap.disabled = !Object.values(labels).some(l => l.label || l.controlId); };
            pick.addEventListener('change', () => { const s = suggestions.find(x => x.id === pick.value); if (s && !name.value) name.value = s.label; if (s?.type && TYPES.includes(s.type)) type.value = s.type; sync(); });
            [name, type, led].forEach(el => el.addEventListener('input', sync));
            row = h('li', { class: 'dev-learn-row', 'data-key': k },
              h('span', { class: 'dev-learn-msg' }, h('strong', { class: 'num', text: msgLabel(d) }), h('span', { class: 'muted small num dev-learn-stats' })),
              h('label', { class: 'sr-only', for: name.id, text: `Name for ${msgLabel(d)}` }), name, pick, type,
              h('label', { class: 'dev-led', for: led.id }, led, h('span', { text: 'LED' })));
            rows.set(k, row);
            grid.append(row);
          }
          row.querySelector('.dev-learn-stats').textContent = `${d.count}× · ${d.min}–${d.max}`;
          row.classList.add('pulse'); setTimeout(() => row.classList.remove('pulse'), 250);
        }
      });
      const done = finishBtn('Finish test', () => {
        const rep = session.report({ groups: !learn && test.params?.groups?.length ? test.params.groups.filter(g => eff.controls.some(c => c.group === g)) : undefined });
        const findings = learn ? [{ id: 'midi-learn', severity: 'info', title: `${rep.discovered.length} distinct control${rep.discovered.length === 1 ? '' : 's'} discovered`, meaning: 'Learn mode lists what the unit sends; it cannot tell which controls are missing until a map is saved.', action: 'Name the controls and Save learned map, then run coverage again to check every control.' }] : midiFindings('coverage', rep);
        const override = learn ? { status: 'unknown', detail: `Learn mode: ${rep.discovered.length} controls discovered. Save a learned map and re-run to measure coverage.`, criterion: 'learn' } : null;
        card.append(resultBlock(rep.measurements, findings));
        complete(rep.measurements, findings, { mode: rep.mode, discovered: rep.discovered?.length ?? null, unseen: (rep.controls || []).filter(c => !c.seen).map(c => c.id) }, override);
      });
      card.append(h('div', { class: 'step-footer' }, h('span', { class: 'muted small', text: learn ? 'You can save the map any time; Finish records this run.' : '' }), saveMap, done));
      body.replaceChildren(card);
      return { onMessage: (msg, t) => { session.ingest(msg, t.tUs); update(); } };
    },

    fader() {
      const card = h('section', { class: 'card', 'aria-labelledby': 'fader-title' });
      card.append(h('h2', { class: 'card-title', id: 'fader-title', text: 'Fader / knob sweep' }));
      const tgt = targetPicker(card);
      const samples = [];
      const live = h('div', { class: 'dev-live-plot', html: '<p class="muted">The graph draws as you move the control. Sweep slowly end to end three times, pause in the middle, then Finish.</p>' });
      const stats = h('p', { class: 'num dev-live-stats', 'aria-live': 'off' });
      tgt.onReset = () => { samples.length = 0; };
      const draw = throttle(() => {
        const t0 = samples[0]?.rUs || 0;
        live.innerHTML = linePlot(samples.slice(-600).map(s => ({ t: (s.rUs - t0) / 1e6, v: s.value })), { title: 'Control value over time', yLabel: tgt.bits === 14 ? 'value (14-bit)' : 'value (0–127)', minSpan: 4 });
        const v = samples.map(s => s.value);
        stats.textContent = `${samples.length} samples · now ${v.at(-1)} · min ${Math.min(...v)} · max ${Math.max(...v)}`;
      }, 100);
      card.append(live, stats, h('div', { class: 'step-footer' }, h('span', { class: 'muted small', text: 'Needs at least two samples.' }), finishBtn('Finish test', () => {
        const a = analyzeFader(samples, { bits: tgt.bits });
        if (!a.measurements.length) { toast('No movement recorded yet — move the control first.', { type: 'warn' }); return; }
        const findings = midiFindings('fader', a);
        card.append(resultBlock(a.measurements, findings));
        complete(a.measurements, findings, { samples: samples.length, bits: tgt.bits });
      })));
      body.replaceChildren(card);
      return { onMessage: (msg, t) => { const v = tgt.value(msg); if (v == null) return; samples.push({ tUs: t.tUs, rUs: t.rUs, value: v }); draw(); } };
    },

    jog() {
      const card = h('section', { class: 'card', 'aria-labelledby': 'jog-title' });
      card.append(h('h2', { class: 'card-title', id: 'jog-title', text: 'Jog wheel revolution count' }));
      const tgt = targetPicker(card);
      const enc = h('select', { id: 'jog-encoding' }, ...[['relative-two-complement', 'Relative (1 = right, 127 = left)'], ['relative-offset64', 'Relative (64 = still)'], ['absolute', 'Absolute position']].map(([v, t]) => h('option', { value: v, text: t })));
      const samples = [], revs = [];
      let net = 0, prev = null, open = null;
      const counter = h('div', { class: 'dev-jog-counter num', 'aria-live': 'polite', text: '0' });
      const revList = h('ul', { class: 'dev-rev-list', role: 'list' });
      const mark = (dir) => {
        const b = h('button', { type: 'button', class: 'btn btn-secondary btn-lg', id: `jog-mark-${dir > 0 ? 'cw' : 'ccw'}`, text: dir > 0 ? 'Start one turn clockwise ↻' : 'Start one turn counter-clockwise ↺' });
        b.addEventListener('click', () => {
          if (!open) { open = { dir, startUs: nowUs(), startNet: net, btn: b }; b.textContent = 'Done — mark end of turn'; b.classList.add('btn-primary'); return; }
          if (open.btn !== b) { toast('Finish the turn you started first.', { type: 'warn' }); return; }
          const r = { startUs: open.startUs, endUs: nowUs(), direction: dir, ticks: Math.abs(net - open.startNet) };
          revs.push(r); open = null; b.classList.remove('btn-primary'); b.textContent = dir > 0 ? 'Start one turn clockwise ↻' : 'Start one turn counter-clockwise ↺';
          revList.append(h('li', { text: `${dir > 0 ? '↻ clockwise' : '↺ counter-clockwise'}: ${r.ticks} ticks` }));
          announce(`${r.ticks} ticks counted`);
        });
        return b;
      };
      tgt.onReset = () => { samples.length = 0; net = 0; prev = null; counter.textContent = '0'; };
      card.append(h('div', { class: 'dev-jog' }, h('div', {}, h('span', { class: 'field-label', text: 'Net ticks' }), counter, h('span', { class: 'muted small', text: 'Turn right to count up, left to count down.' })),
        h('div', { class: 'dev-jog-marks' }, mark(1), mark(-1), revList)),
        h('label', { class: 'field field-inline', for: 'jog-encoding' }, h('span', { class: 'field-label', text: 'Encoding' }), enc));
      card.append(h('div', { class: 'step-footer' }, h('span', { class: 'muted small', text: 'Mark one slow turn each way for ticks per revolution.' }), finishBtn('Finish test', () => {
        const a = analyzeJog(samples, { encoding: enc.value, revolutions: revs.map(({ startUs, endUs, direction }) => ({ startUs, endUs, direction })), bits: tgt.bits });
        const findings = midiFindings('jog', a);
        card.append(resultBlock(a.measurements, findings));
        complete(a.measurements, findings, { encoding: enc.value, revolutions: revs.map(r => ({ direction: r.direction, ticks: r.ticks })) });
      })));
      body.replaceChildren(card);
      return { onMessage: (msg, t) => {
        const v = tgt.value(msg); if (v == null) return;
        samples.push({ tUs: t.rUs, value: v });
        const e = enc.value;
        const d = e === 'relative-two-complement' ? (v < 64 ? v : v - 128) : e === 'relative-offset64' ? v - 64 : prev == null ? 0 : ((v - prev + 192) % 128) - 64;
        prev = v; net += d; counter.textContent = String(net);
      } };
    },

    button() {
      const card = h('section', { class: 'card', 'aria-labelledby': 'btn-title' });
      card.append(h('h2', { class: 'card-title', id: 'btn-title', text: 'Button bounce and stuck check' }), h('p', { class: 'muted small', text: 'Press each button or pad once firmly and once lightly. Hold one for 3 seconds. Rows flag double triggers (bounce) and buttons still held at the end.' }));
      const ids = test.params?.controlIds?.length ? new Set(test.params.controlIds) : null;
      const scoped = { controls: eff.controls.filter(c => !ids || ids.has(c.id)) };
      const pair = {}, events = [], per = new Map();
      let lastT = 0, lastR = 0;
      const table = h('table', { class: 'data dev-btn-table' }, h('thead', { html: '<tr><th scope="col">Control</th><th scope="col" class="r">Presses</th><th scope="col" class="r">Bounces</th><th scope="col">State</th></tr>' }), h('tbody'));
      const empty = h('div', { class: 'empty-inline', html: `${icon('keyboard', { size: 20 })}<span>Waiting for a button press…</span>` });
      const draw = throttle(() => {
        const a = analyzeButton(events);
        empty.hidden = per.size > 0;
        table.tBodies[0].replaceChildren(...[...per.entries()].map(([id, p]) => h('tr', { 'data-control': id }, h('th', { scope: 'row', text: p.label }), h('td', { class: 'r num', text: String(p.presses) }), h('td', { class: 'r num', text: String(a.perControl[id]?.bounces || 0) }), h('td', { html: a.perControl[id]?.pressed ? chip('warn', 'HELD', { size: 14 }) : chip('pass', 'RELEASED', { size: 14 }) }))));
      });
      card.append(empty, h('div', { class: 'table-wrap' }, table), h('div', { class: 'step-footer' }, h('span', { class: 'muted small', text: 'Release every button before finishing.' }), finishBtn('Finish test', () => {
        const endUs = lastT + (nowUs() - lastR);
        const a = analyzeButton(events, { endUs, stuckAfterSec: 2 });
        const findings = midiFindings('button', a);
        card.append(resultBlock(a.measurements, findings));
        complete(a.measurements, findings, { buttons: per.size, stuck: a.stuck });
      })));
      body.replaceChildren(card);
      return { onMessage: (msg, t) => {
        let id, label, pressed;
        if (scoped.controls.length) { const hit = matchControl(scoped, msg, pair); if (!hit) return; id = hit.control.id; label = hit.control.label || id; pressed = hit.pressed ?? hit.value > 0; }
        else if (msg.kind === 'note-on' || msg.kind === 'note-off' || (msg.kind === 'cc' && (msg.value === 0 || msg.value === 127))) { id = keyOf(msg); label = msgLabel({ kind: msg.kind === 'cc' ? 'cc' : 'note', channel: msg.channel, number: msg.number }); pressed = msg.kind === 'note-on' || (msg.kind === 'cc' && msg.value > 0); }
        else return;
        lastT = t.tUs; lastR = t.rUs;
        events.push({ tUs: t.tUs, pressed, controlId: id });
        const p = per.get(id) || { label, presses: 0 };
        if (pressed) p.presses++;
        per.set(id, p);
        draw();
      } };
    },

    led() {
      const card = h('section', { class: 'card', 'aria-labelledby': 'led-title' });
      card.append(h('h2', { class: 'card-title', id: 'led-title', text: 'LED check' }));
      const seq = buildLedSequence(eff, test.params?.controlIds);
      const steps = []; for (let i = 0; i < seq.length; i += 2) steps.push({ on: seq[i], off: seq[i + 1] });
      if (!steps.length) {
        card.append(h('div', { class: 'empty empty-sm', html: `${icon('info', { size: 32 })}<h2>No LED messages known for this unit</h2><p>${eff.mapSource === 'learn' ? 'This device has no public MIDI list. Run the MIDI coverage test, name the lit buttons and tick “LED”, then Save learned map.' : 'The map has no controls marked as having an LED.'} You can also check LEDs by eye with your DJ software.</p>` }),
          h('div', { class: 'step-footer' }, h('button', { type: 'button', class: 'btn btn-secondary', text: 'Skip test', onclick: () => ctx.skip('No LED messages known for this unit.') })));
        body.replaceChildren(card);
        return { onMessage() {} };
      }
      if (!st.outPort) card.append(h('p', { class: 'hint hint-warn', html: `${icon('warn', { size: 16 })}<span>No MIDI output port found — LEDs cannot be driven. Connect the device and refresh.</span>` }));
      const answers = [];
      let i = 0;
      const stage = h('div', { class: 'dev-led-stage', 'aria-live': 'polite' });
      async function send(bytes) { try { await midi.send(st.outPort, bytes); } catch (error) { toast(`Could not send to ${st.outPort}: ${error?.message || error}`, { type: 'error' }); } }
      async function show() {
        if (i >= steps.length) {
          const ok = answers.filter(a => a.lit).length;
          const pct = Math.round(100 * ok / answers.length);
          const measurements = [{ metricId: 'midi_led_ok_percent', label: 'LEDs confirmed lit', value: pct, unit: '%' }];
          const bad = answers.filter(a => !a.lit);
          const findings = bad.length ? [{ id: 'led-dead', severity: 'warning', title: `${bad.length} LED${bad.length > 1 ? 's' : ''} did not light`, meaning: `Not lit: ${bad.map(b => b.label).join(', ')}. A dead LED hides cue, loop or pad state.`, action: 'Re-run to confirm, then have the LED or its driver chip serviced.' }] : [];
          stage.replaceChildren(resultBlock(measurements, findings));
          complete(measurements, findings, { answers }, test.pass ? null : bad.length ? { status: 'fail', detail: `${bad.length} of ${answers.length} LEDs did not light.`, criterion: 'user' } : { status: 'pass', detail: `All ${answers.length} LEDs lit.`, criterion: 'user' });
          return;
        }
        const s = steps[i];
        await send(s.on.bytes);
        const label = s.on.label.replace(/ ON$/, '');
        stage.replaceChildren(h('p', { class: 'dev-led-q', html: `<span class="muted small">LED ${i + 1} of ${steps.length}</span><strong>Is <em>${esc(label)}</em> lit now?</strong>` }),
          h('div', { class: 'dev-led-answers' },
            h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'led-yes', html: `${icon('check', { size: 20 })}<span>Yes, it lit</span>`, onclick: () => answer(true, label, s) }),
            h('button', { type: 'button', class: 'btn btn-secondary btn-lg', id: 'led-no', html: `${icon('x', { size: 20 })}<span>No</span>`, onclick: () => answer(false, label, s) })));
        stage.querySelector('#led-yes').focus();
      }
      async function answer(lit, label, s) { answers.push({ controlId: s.on.controlId, label, lit }); await send(s.off.bytes); i++; show(); }
      card.append(h('p', { class: 'muted small', text: `DeckChek lights ${steps.length} LED${steps.length > 1 ? 's' : ''} one at a time. Look at the unit and answer for each.` }), stage);
      body.replaceChildren(card);
      show();
      return { onMessage() {}, dispose() { if (i < steps.length && st.outPort) send(steps[i].off.bytes); } };
    },

    latency() {
      const card = h('section', { class: 'card', 'aria-labelledby': 'lat-title' });
      card.append(h('h2', { class: 'card-title', id: 'lat-title', text: 'MIDI timing jitter' }), h('p', { class: 'muted small', text: 'Spin the jog wheel (or sweep a fader) at a steady speed for about 10 seconds. DeckChek measures how evenly the messages arrive.' }));
      const tgt = targetPicker(card, { controlId: test.params?.controlId });
      const stamps = [];
      const stats = h('p', { class: 'num dev-live-stats', 'aria-live': 'off', text: '0 messages' });
      tgt.onReset = () => { stamps.length = 0; };
      const draw = throttle(() => { const a = analyzeTiming(stamps); stats.textContent = `${stamps.length} messages${a.jitterMs != null ? ` · jitter ${formatNumber(a.jitterMs, { digits: 2 })} ms · ${formatNumber(a.ratePerSec, { digits: 0 })} msg/s` : ''}`; }, 250);
      card.append(stats, h('div', { class: 'step-footer' }, h('span', { class: 'muted small', text: 'Use a direct USB port, not a hub.' }), finishBtn('Finish test', () => {
        const a = analyzeTiming(stamps);
        if (!a.measurements.length) { toast('Not enough messages yet — keep the control moving.', { type: 'warn' }); return; }
        const findings = midiFindings('latency', a);
        card.append(resultBlock(a.measurements, findings));
        complete(a.measurements, findings, { messages: a.count, ratePerSec: a.ratePerSec, meanIntervalMs: a.meanIntervalMs });
      })));
      body.replaceChildren(card);
      return { onMessage: (msg, t) => { if (tgt.value(msg) == null) return; stamps.push(t.tUs); draw(); } };
    },

    conformance() {
      const card = h('section', { class: 'card', 'aria-labelledby': 'conf-title' });
      card.append(h('h2', { class: 'card-title', id: 'conf-title', text: 'MIDI conformance' }), h('p', { class: 'muted small', text: 'DeckChek asks the device to identify itself, then checks every message it sends while you use the controls: well-formed bytes, SysEx, notes that never release, and Active Sensing / Clock timing.' }));
      const events = [];
      let lastT = 0, lastR = 0, identity = { status: st.outPort ? 'pending' : 'no-port', info: null };
      const idLine = h('p', { class: 'dev-target', role: 'status' });
      const stats = h('p', { class: 'num dev-live-stats', 'aria-live': 'off', text: '0 messages' });
      const showId = () => {
        idLine.innerHTML = identity.status === 'ok' ? `${chip('pass', 'IDENTIFIED', { size: 14 })} <span>Manufacturer id <strong class="num">${esc(identity.info.manufacturerHex)}</strong> · family ${identity.info.family} · model ${identity.info.member} · version ${esc(identity.info.versionText)}</span>`
          : identity.status === 'none' ? `${chip('review', 'NO ANSWER', { size: 14 })} <span>No reply to the Identity Request within 1.5 s. Many DJ controllers do not implement it.</span>`
          : identity.status === 'no-port' ? `${chip('info', 'SKIPPED', { size: 14 })} <span>No MIDI output port was found, so the Identity Request was not sent.</span>`
          : `${chip('review', 'ASKING', { size: 14 })} <span>Sending the Identity Request…</span>`;
      };
      const probe = async () => {
        if (!st.outPort) { identity = { status: 'no-port', info: null }; showId(); return; }
        identity = { status: 'pending', info: null }; showId();
        try { await midi.send(st.outPort, IDENTITY_REQUEST); } catch (error) { identity = { status: 'none', info: null }; showId(); toast(`Could not send to ${st.outPort}: ${error?.message || error}`, { type: 'warn' }); return; }
        await new Promise(r => setTimeout(r, 1500));
        if (identity.status === 'pending') identity = { status: 'none', info: null };
        showId();
      };
      const draw = throttle(() => { const a = analyzeStream(events); stats.textContent = `${a.total} messages · ${a.invalid.length + a.sysexBad.length} invalid · channels ${a.channels.join(', ') || '—'}`; });
      card.append(idLine, stats, h('div', { class: 'step-footer' }, h('span', { class: 'muted small', text: 'Use every kind of control for about 15 seconds, hold one pad for a second, then finish.' }),
        h('button', { type: 'button', class: 'btn btn-ghost', text: 'Ask again', onclick: probe }),
        finishBtn('Finish test', () => {
          const endUs = lastT + (nowUs() - lastR);
          const a = analyzeStream(events, { endUs });
          const measurements = [...a.measurements, { metricId: 'midi_identity_reply', label: 'Identity Reply received', value: identity.status === 'ok' ? 1 : 0, unit: 'bool', qualityFlags: identity.status === 'no-port' ? ['no-output-port'] : [] }];
          const findings = conformanceFindings(a, identity);
          if (identity.status === 'ok') findings.push({ id: 'midi-identified', severity: 'info', title: `Device identified (manufacturer id ${identity.info.manufacturerHex})`, meaning: `Family ${identity.info.family}, model ${identity.info.member}, version ${identity.info.versionText}. Look the manufacturer id up in the MIDI Association SysEx ID list.`, action: '' });
          const bad = a.invalid.length + a.sysexBad.length + a.stuck.length;
          const override = !a.total ? { status: 'unknown', detail: 'No MIDI messages were received, so nothing could be checked.', criterion: 'conformance' }
            : bad ? { status: 'fail', detail: `${a.invalid.length} invalid, ${a.sysexBad.length} malformed SysEx and ${a.stuck.length} stuck note(s) in ${a.total} messages.`, criterion: 'conformance' }
            : a.orphans ? { status: 'unknown', detail: `${a.total} messages are well formed, but ${a.orphans} note-off(s) had no note-on — review.`, criterion: 'conformance' }
            : { status: 'pass', detail: `All ${a.total} messages are valid MIDI; no stuck notes.`, criterion: 'conformance' };
          card.append(resultBlock(measurements, findings));
          complete(measurements, findings, { kinds: a.kinds, channels: a.channels, identity: identity.info, identityStatus: identity.status, clock: a.clock, sensing: a.sensing }, override);
        })));
      body.replaceChildren(card);
      showId(); probe();
      return { wantsRaw: true, onMessage: (msg, t) => {
        const bytes = Array.from(t.raw || []);
        if (!bytes.length) return;
        const reply = identity.status === 'pending' ? parseIdentityReply(bytes) : null;
        if (reply) { identity = { status: 'ok', info: reply }; showId(); }
        events.push({ tUs: t.tUs, bytes }); lastT = t.tUs; lastR = t.rUs; draw();
      } };
    },

    gm() {
      const card = h('section', { class: 'card', 'aria-labelledby': 'gm-title' });
      card.append(h('h2', { class: 'card-title', id: 'gm-title', text: 'General MIDI sound check' }), h('p', { class: 'muted small', text: 'For devices with a built-in General MIDI sound source. DeckChek sends GM System On, then ten short musical checks. Turn the unit’s output up a little, listen, and answer for each.' }));
      if (!st.outPort) {
        card.append(h('div', { class: 'empty empty-sm', html: `${icon('plug', { size: 32 })}<h2>No MIDI output port</h2><p>The test needs to send notes to the device. Connect it and refresh the ports, or skip this test if it has no General MIDI sound source.</p>` }),
          h('div', { class: 'step-footer' }, h('button', { type: 'button', class: 'btn btn-secondary', text: 'Skip test', onclick: () => ctx.skip('No MIDI output port, or the device has no General MIDI sound source.') })));
        body.replaceChildren(card);
        return { onMessage() {} };
      }
      const steps = gmSteps(), answers = {};
      let token = 0, playing = false;
      const send = async bytes => { try { await midi.send(st.outPort, bytes); } catch (error) { toast(`Could not send to ${st.outPort}: ${error?.message || error}`, { type: 'error' }); throw error; } };
      const silence = async () => { token++; for (const b of gmCleanup()) { try { await midi.send(st.outPort, b); } catch { /* port gone */ } } };
      const list = h('ol', { class: 'dev-gm-list' });
      const status = h('p', { class: 'muted small', role: 'status' });
      const save = finishBtn('Save result', () => {
        const r = evaluateGm(answers, steps);
        card.append(resultBlock(r.measurements, r.findings));
        complete(r.measurements, r.findings, { answers }, { status: r.status, detail: r.detail, criterion: 'user' });
      });
      save.disabled = true;
      const refresh = () => { const r = evaluateGm(answers, steps); save.disabled = r.status == null; status.textContent = r.status == null ? r.detail : `Result: ${r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'SKIPPED'} — ${r.detail}`; };
      steps.forEach((s, i) => {
        const li = h('li', { class: 'dev-gm-step', 'data-step': s.id });
        const playBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: `gm-play-${s.id}`, html: `${icon('play', { size: 14 })}<span>Play</span>` });
        const group = h('div', { class: 'segmented dev-answer', role: 'radiogroup', 'aria-label': `Step ${i + 1}: ${s.question}` });
        for (const [val, label, tone] of [['yes', 'Yes', 'pass'], ['no', 'No', 'fail'], ['na', 'N/A', 'info']]) {
          const b = h('button', { type: 'button', role: 'radio', class: `seg seg-${tone}`, 'aria-checked': 'false', 'data-answer': val, text: label });
          b.addEventListener('click', () => { answers[s.id] = val; group.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', String(x === b))); refresh(); });
          group.append(b);
        }
        playBtn.addEventListener('click', async () => {
          if (playing) { await silence(); playing = false; return; }
          playing = true; const mine = ++token;
          const orig = playBtn.innerHTML; playBtn.innerHTML = `${icon('stop', { size: 14 })}<span>Stop</span>`;
          try { for (const msg of s.messages) { if (token !== mine) break; await send(msg.bytes); if (msg.delayMs) await new Promise(r => setTimeout(r, msg.delayMs)); } }
          catch { /* reported by send */ }
          finally { if (token === mine) { for (let c = 1; c <= 16; c++) { try { await midi.send(st.outPort, [0xb0 | (c - 1), 123, 0]); } catch { break; } } } playing = false; playBtn.innerHTML = orig; }
        });
        li.append(h('div', { class: 'dev-gm-head' }, h('strong', { text: `${i + 1}. ${s.title}` }), playBtn), h('p', { class: 'muted small', text: s.question }), group);
        list.append(li);
      });
      card.append(list, h('div', { class: 'step-footer' }, status, h('button', { type: 'button', class: 'btn btn-ghost', text: 'Silence everything', onclick: () => { silence(); playing = false; } }), save));
      body.replaceChildren(card);
      return { onMessage() {}, dispose() { silence(); } };
    },
  };

  refreshPorts();
  return {
    dispose() {
      st.panel?.dispose?.();
      st.unsub?.();
      if (st.opened) midi.close(st.opened).catch(() => {});
    },
  };
}
