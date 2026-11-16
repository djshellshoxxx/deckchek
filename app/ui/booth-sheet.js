// FS-23 printable sheet. All data passes through the shared report escaper.
import { registerPrintableKind, getPrintableKind } from '../report-pdf.js';

export function renderBoothSheetHtml({ booth, rows }, { esc }) {
  const body = rows.map(row => `<tr><td>${esc(row.position || 'Unplaced')}</td><td>${esc(row.nickname)}<br>${esc(row.productName || '')}</td><td>${esc(row.serialNumber || '—')}</td><td>${esc(row.lastTestedAt?.slice(0, 10) || 'Never tested')}</td><td>${esc(row.health)}</td><td>${esc(row.reminders.map(r => r.dueAt || (r.dueInHours == null ? 'Unknown' : `${r.dueInHours.toFixed(1)} h remaining`)).join('; ') || 'No reminders')}</td></tr>`).join('');
  return `<style>@media print{.booth-notes{min-height:40mm;border:1px solid #000}table{font-size:9pt}}</style><h2>${esc(booth.name)}</h2><table><thead><tr>${['Position', 'Asset', 'Serial', 'Last tested', 'Health', 'Next due'].map(text => `<th>${esc(text)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table><h2>Notes</h2><div class="booth-notes"><p>________________________________________________</p><p>________________________________________________</p></div><p>Tracked hours are estimates. Test results describe the recorded checks, not a guarantee of future reliability.</p>`;
}

export function registerBoothSheet() {
  if (!getPrintableKind('boothSheet')) registerPrintableKind('boothSheet', { title: data => `Booth sheet — ${data.booth.name}`, fileKind: 'BoothSheet', build: renderBoothSheetHtml });
}
