// FS-23 printable booth sheet (AC-9): one page per booth with its positions, assets, serials, last tested date,
// health, next due item and a blank notes box. Registered with FS-03 as the printable kind `boothSheet`
// (file kind `BoothSheet`). Every user string goes through the report escaper; the venue city is never printed.
import { registerPrintableKind, getPrintableKind } from '../report-pdf.js';
import { HEALTH_META, describeReminder, nextDueReminder } from '../fleet.js';

const COLUMNS = ['Position', 'Asset', 'Serial', 'Last tested', 'Health', 'Next due'];

/**
 * @param {{booth:{name:string}, rows:object[], positions?:{id:string,name:string}[]}} data
 *   rows are the booth's fleet rows; positions (optional) adds empty positions as "Empty" lines.
 */
export function renderBoothSheetHtml({ booth, rows = [], positions = [] }, { esc }) {
  const byPosition = new Map();
  for (const row of rows) {
    const key = row.deckPositionId ?? row.position ?? '';
    if (!byPosition.has(key)) byPosition.set(key, []);
    byPosition.get(key).push(row);
  }
  const lines = [];
  for (const p of positions) lines.push({ position: p.name, assets: byPosition.get(p.id) ?? [] });
  const listed = new Set(positions.map(p => p.id));
  for (const [key, assets] of byPosition) if (!listed.has(key)) lines.push({ position: assets[0]?.position || 'Unplaced', assets });
  lines.sort((a, b) => String(a.position).localeCompare(String(b.position)));
  const next = row => {
    const reminder = nextDueReminder(row.reminders ?? []);
    return reminder ? describeReminder(reminder) : 'No reminders';
  };
  const assetRow = (position, row) => `<tr><td>${esc(position)}</td><td>${esc(row.nickname)}${row.productName ? `<br>${esc(row.productName)}` : ''}</td><td>${esc(row.serialNumber || '—')}</td><td>${esc(row.lastTestedAt?.slice(0, 10) || 'Never tested')}</td><td data-health="${esc(row.health)}">${esc(HEALTH_META[row.health]?.label ?? row.health)}</td><td>${esc(next(row))}</td></tr>`;
  const body = lines.flatMap(line => line.assets.length
    ? line.assets.map(row => assetRow(line.position, row))
    : [`<tr><td>${esc(line.position)}</td><td colspan="5">Empty</td></tr>`]).join('');
  return `<style>table.booth-table{width:100%;border-collapse:collapse}table.booth-table th,table.booth-table td{border:1px solid #000;padding:3px 6px;text-align:left;vertical-align:top}@media print{.booth-notes{min-height:40mm;border:1px solid #000;padding:4px}table{font-size:9pt}}</style>`
    + `<h2>${esc(booth.name)}</h2><table class="booth-table"><thead><tr>${COLUMNS.map(text => `<th>${esc(text)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`
    + `<h2>Notes</h2><div class="booth-notes"><p>________________________________________________</p><p>________________________________________________</p></div>`
    + `<p>Tracked hours are estimates. Test results describe the recorded checks, not a guarantee of future reliability.</p>`;
}

export function registerBoothSheet() {
  if (!getPrintableKind('boothSheet')) registerPrintableKind('boothSheet', { title: data => `Booth sheet — ${data.booth.name}`, fileKind: 'BoothSheet', build: renderBoothSheetHtml });
}
