// Results screen (AC-5): saved results on this phone, with Export (file, share sheet, copy) and Show QR, plus the
// few settings that go into an export (asset label, user-agent redaction). Nothing leaves the phone by itself.
import { el, announce, downloadText, stateBox } from '../lib/ui.js';
import { listResults, getResult, deleteResult, getSettings, setSettings } from '../lib/store.js';
import { exportRun, toQrFrames, fileName } from '../lib/export.js';
import { qrImages } from '../lib/qr.js';

const when = iso => { const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

export default function mount(root, ctx) {
  const st = { openId: ctx.route?.id || null, qrIndex: 0 };
  const list = el('ul', { class: 'result-list', id: 'results-list' });
  const panel = el('div', { id: 'export-panel' });
  const settingsCard = el('section', { class: 'card', 'aria-labelledby': 'set-h' });

  function exportText(run) {
    const s = getSettings();
    return exportRun({ ...run, assetHint: { nickname: s.assetNickname || run.assetHint?.nickname, serial: s.assetSerial || run.assetHint?.serial } }, { redactUserAgent: s.redactUserAgent });
  }

  function renderPanel() {
    panel.replaceChildren();
    const run = st.openId && getResult(st.openId);
    if (!run) return;
    let text;
    try { text = exportText(run); } catch (error) { panel.append(stateBox('error', 'Cannot export this result.', error?.message || String(error))); return; }
    const file = new File([text], fileName(run), { type: 'application/json' });
    const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
    const qrBox = el('div', { id: 'qr-box', hidden: true });
    const showQr = () => {
      const frames = toQrFrames(text);
      const imgs = qrImages(frames);
      const draw = () => {
        const cur = imgs[st.qrIndex];
        qrBox.replaceChildren(
          el('img', { class: 'qr', id: 'qr-img', src: cur.uri, alt: frames.length > 1 ? `QR code ${st.qrIndex + 1} of ${frames.length}` : 'QR code of the result', width: '280', height: '280' }),
          frames.length > 1 ? el('div', { class: 'row' },
            el('button', { type: 'button', class: 'btn btn-secondary', id: 'qr-prev', text: 'Previous', disabled: st.qrIndex === 0, onclick: () => { st.qrIndex--; draw(); } }),
            el('span', { id: 'qr-count', 'aria-live': 'polite', text: `${cur.label}` }),
            el('button', { type: 'button', class: 'btn btn-secondary', id: 'qr-next', text: 'Next', disabled: st.qrIndex === frames.length - 1, onclick: () => { st.qrIndex++; draw(); } })) : null,
          el('p', { class: 'small', text: frames.length > 1 ? `This result needs ${frames.length} QR codes. Scan them one after another; DeckChek on the desktop takes the scanned text, one frame per line, in any order.` : 'Scan with any QR reader and paste the text into DeckChek on the desktop: Import phone results.' }));
      };
      st.qrIndex = 0; draw(); qrBox.hidden = false; announce(frames.length > 1 ? `${frames.length} QR codes ready.` : 'QR code ready.');
    };
    panel.append(el('section', { class: 'card', id: 'export-card', 'aria-labelledby': 'export-h' },
      el('h2', { id: 'export-h', text: `Export: ${run.title}` }),
      el('p', { class: 'small', text: 'The export is a text file with a checksum. It is not signed: the checksum only catches accidents. Nothing is sent anywhere.' }),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn btn-primary', id: 'export-file', text: 'Save file', onclick: () => { downloadText(file.name, text); announce(`Saved ${file.name}.`); } }),
        canShare ? el('button', { type: 'button', class: 'btn btn-secondary', id: 'export-share', text: 'Share...', onclick: async () => { try { await navigator.share({ files: [file], title: 'DeckChek result' }); } catch { /* cancelled */ } } }) : null,
        el('button', { type: 'button', class: 'btn btn-secondary', id: 'export-copy', text: 'Copy text', onclick: async () => { try { await navigator.clipboard.writeText(text); announce('Copied.'); } catch { announce('Copy is blocked here. Select the text below instead.'); } } }),
        el('button', { type: 'button', class: 'btn btn-secondary', id: 'export-qr', text: 'Show QR', onclick: showQr })),
      qrBox,
      el('label', { for: 'export-text', class: 'small', text: 'Export text' }),
      el('textarea', { id: 'export-text', readonly: true, rows: '6', spellcheck: 'false', text })));
  }

  function renderList() {
    const runs = listResults();
    list.replaceChildren();
    if (!runs.length) { list.append(el('li', {}, stateBox('empty', 'No results yet.', 'Measure something on Speed, Vibration or Sound level and it appears here.'))); return; }
    for (const r of runs) {
      list.append(el('li', { class: 'card result-item', 'data-id': r.id },
        el('div', {}, el('strong', { text: r.title }), el('span', { class: 'small', text: ` ${when(r.createdAt)}` })),
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'btn btn-secondary', text: 'Export', 'data-act': 'export', onclick: () => { st.openId = r.id; renderPanel(); panel.scrollIntoView?.({ block: 'start' }); announce('Export options shown.'); } }),
          el('button', { type: 'button', class: 'btn btn-secondary', text: 'Delete', 'data-act': 'delete', onclick: () => { deleteResult(r.id); if (st.openId === r.id) st.openId = null; renderList(); renderPanel(); announce('Result deleted.'); } }))));
    }
  }

  function renderSettings() {
    const s = getSettings();
    const nick = el('input', { id: 'set-nick', type: 'text', maxlength: '120', value: s.assetNickname || '', placeholder: 'e.g. SL-1200MK4 #1' });
    const serial = el('input', { id: 'set-serial', type: 'text', maxlength: '80', value: s.assetSerial || '' });
    const redact = el('input', { id: 'set-redact', type: 'checkbox' });
    redact.checked = Boolean(s.redactUserAgent);
    nick.addEventListener('change', () => setSettings({ assetNickname: nick.value.trim() }));
    serial.addEventListener('change', () => setSettings({ assetSerial: serial.value.trim() }));
    redact.addEventListener('change', () => { setSettings({ redactUserAgent: redact.checked }); renderPanel(); });
    settingsCard.replaceChildren(
      el('h2', { id: 'set-h', text: 'Export details' }),
      el('p', { class: 'small', text: 'Helps the desktop app pick the right asset. Both are optional and stay on this phone until you export.' }),
      el('div', { class: 'field-row' }, el('label', { for: 'set-nick', text: 'Turntable name' }), nick, el('label', { for: 'set-serial', text: 'Serial number' }), serial),
      el('label', { class: 'check', for: 'set-redact' }, redact, el('span', { text: 'Leave my browser and phone model out of exports' })));
  }

  root.replaceChildren(el('h1', { text: 'Results' }), list, panel, settingsCard);
  renderList(); renderPanel(); renderSettings();
  return () => {};
}
