// Strobe screen (AC-3): the four-row dot table for the chosen mains, and an on-screen strobe that pulses at the
// nearest rate the display can make. Flashing: a photosensitivity confirmation is mandatory before the first run.
import { el, announce, stateBox } from '../lib/ui.js';
import { MAINS, RPMS, dotsTable, flickerHz, strobePlan, refreshFromTimestamps, describePlan } from '../lib/strobe.js';
import { getSettings, setSettings } from '../lib/store.js';

export default function mount(root) {
  const st = { mains: 50, rpmId: '33', raf: 0, stage: null };
  const mainsBtns = MAINS.map(m => el('button', { type: 'button', class: 'seg', 'data-mains': m, 'aria-pressed': String(m === st.mains), text: `${m} Hz mains`, onclick: () => { st.mains = m; refresh(); } }));
  const rpmBtns = RPMS.map(r => el('button', { type: 'button', class: 'seg', 'data-rpm': r.id, 'aria-pressed': String(r.id === st.rpmId), text: `${r.label} rpm`, onclick: () => { st.rpmId = r.id; refresh(); } }));
  const table = el('table', { class: 'm-table', id: 'strobe-table' });
  const note = el('p', { id: 'strobe-note', 'aria-live': 'polite' });
  const start = el('button', { type: 'button', class: 'btn btn-primary btn-big', id: 'strobe-start', text: 'Start strobe', onclick: begin });

  function refresh() {
    for (const b of mainsBtns) b.setAttribute('aria-pressed', String(Number(b.dataset.mains) === st.mains));
    for (const b of rpmBtns) b.setAttribute('aria-pressed', String(b.dataset.rpm === st.rpmId));
    const rows = dotsTable();
    table.replaceChildren(
      el('caption', { class: 'sr-only', text: 'Strobe dots per revolution for each mains frequency and speed' }),
      el('thead', {}, el('tr', {}, ...['Mains', 'Speed', 'Dots'].map(t => el('th', { scope: 'col', text: t })))),
      el('tbody', {}, ...rows.map(r => {
        const sel = r.mains === st.mains && r.rpmId === st.rpmId;
        return el('tr', { class: sel ? 'sel' : null, 'aria-current': sel ? 'true' : null },
          el('th', { scope: 'row', text: `${r.mains} Hz` }), el('td', { text: `${r.rpmLabel} rpm` }), el('td', { class: 'num', text: `${r.dots}${r.exact ? '' : ' (about)'}` }));
      })));
    const sel = rows.find(r => r.mains === st.mains && r.rpmId === st.rpmId);
    note.textContent = `Lamp flicker ${flickerHz(st.mains)} Hz. The ${sel.dots}-dot row looks still at ${sel.rpmLabel} rpm.${sel.exact ? '' : ' That count is not a whole number, so 45 rpm at 50 Hz is only approximate.'}`;
  }

  function confirmDialog() {
    return new Promise(resolve => {
      const dlg = el('dialog', { class: 'dialog', id: 'strobe-warning', 'aria-labelledby': 'strobe-warning-h' },
        el('h2', { id: 'strobe-warning-h', text: 'Flashing light warning' }),
        el('p', { text: 'The strobe flashes the whole screen many times a second. It can trigger seizures in people with photosensitive epilepsy and can be uncomfortable for anyone. Do not use it if you or anyone nearby may be affected. Stop at any time by tapping the screen.' }),
        el('p', { class: 'small', text: 'LED lighting and 120 Hz phone screens can make a strobe disc look still at the wrong speed (aliasing).' }),
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'btn btn-primary', id: 'strobe-confirm', text: 'I understand, start', onclick: () => { dlg.close('yes'); } }),
          el('button', { type: 'button', class: 'btn btn-secondary', id: 'strobe-cancel', text: 'Cancel', onclick: () => dlg.close('no') })));
      dlg.addEventListener('close', () => { const ok = dlg.returnValue === 'yes'; dlg.remove(); resolve(ok); });
      document.body.append(dlg);
      dlg.showModal();
    });
  }

  async function begin() {
    if (st.stage) return;
    if (!getSettings().strobeAck) {
      if (!(await confirmDialog())) return;
      setSettings({ strobeAck: true });
    }
    const wanted = flickerHz(st.mains);
    const stage = el('div', { class: 'strobe-stage', id: 'strobe-stage', role: 'dialog', 'aria-label': 'Strobe running. Tap anywhere to stop.' },
      el('button', { type: 'button', class: 'btn btn-secondary strobe-stop', id: 'strobe-stop', text: 'Stop' }),
      el('p', { class: 'strobe-info', id: 'strobe-info', text: 'Measuring the screen refresh rate...' }),
      el('p', { class: 'strobe-info', id: 'strobe-rows', text: `Dot rows: ${dotsTable().map(r => `${r.dots} = ${r.rpmLabel} rpm at ${r.mains} Hz`).join('; ')}.` }));
    st.stage = stage;
    document.body.append(stage);
    const stop = () => { cancelAnimationFrame(st.raf); stage.remove(); st.stage = null; document.removeEventListener('keydown', onKey); announce('Strobe stopped.'); start.focus(); };
    const onKey = e => { if (e.key === 'Escape') stop(); };
    stage.addEventListener('click', stop);
    document.addEventListener('keydown', onKey);
    const stamps = [];
    let plan = null, frame = 0;
    const tick = t => {
      if (!st.stage) return;
      if (!plan) {
        stamps.push(t);
        if (stamps.length >= 40) {
          const hz = refreshFromTimestamps(stamps) || 60;
          plan = strobePlan(wanted, hz);
          stage.querySelector('#strobe-info').textContent = `${describePlan(plan, wanted)} Screen refresh ${hz.toFixed(1)} Hz. Tap to stop.`;
          announce(`Strobe running. ${describePlan(plan, wanted)}`);
        }
      } else {
        stage.classList.toggle('on', frame % plan.n === 0);
        frame++;
      }
      st.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame(tick);
    stage.querySelector('#strobe-stop').focus();
  }

  root.replaceChildren(
    el('h1', { text: 'Strobe' }),
    el('p', { class: 'lede', text: 'Check platter speed by eye with a strobe disc under mains light, or with the phone screen as the strobe.' }),
    stateBox('warn', 'Flashing light.', 'LED mains lighting and 120 Hz phone screens can alias, so a disc can look still at the wrong speed. Brightness: set the screen to full and turn auto-brightness off.'),
    el('div', { class: 'row', role: 'group', 'aria-label': 'Mains frequency' }, ...mainsBtns),
    el('div', { class: 'row', role: 'group', 'aria-label': 'Record speed' }, ...rpmBtns),
    table, note,
    el('p', { class: 'small', text: 'Under a lamp on mains, find the row on your platter that matches the mains and speed: its dots stand still when the speed is right. Without usable lamp light, put the phone screen beside the platter and start the strobe.' }),
    el('p', { class: 'small', id: 'strobe-motion', text: 'The strobe ignores the reduced-motion setting on purpose: flashing is its whole job, which is why it needs your confirmation first.' }),
    start);
  refresh();
  return () => { cancelAnimationFrame(st.raf); st.stage?.remove(); st.stage = null; };
}
