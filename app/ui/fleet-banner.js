// FS-23 start-up reminder banner (AC-6). Installed from the [FS-23] anchor in ui/shell.js. Non-blocking
// (role="status", never steals focus), lists at most five items then "and N more", adds a count badge to the
// Fleet rail entry, and "Dismiss for 1 day" snoozes the listed reminders without deleting them.
// Desktop only (the reminders live in the database); the flag and the `fleet.startupBanner` setting gate it.

import { h } from './dom.js';
import { icon } from './icons.js';
import { settings } from './state.js';
import { go } from './shell.js';
import { toast } from './live.js';
import { isEnabled, onFeatureChange } from '../features.js';
import { createFleetApi } from '../fleet-api.js';
import { bannerSummary, describeReminder, REMINDER_META } from '../fleet.js';

const DAY_MS = 86400000;
let installed = false;
let badgeCount = 0;

function paintBadge() {
  const item = document.querySelector('.rail-item[data-screen="fleet"]');
  item?.querySelector('[data-fleet-badge]')?.remove();
  if (!item || !badgeCount || !isEnabled('fleet')) return;
  item.append(h('span', { class: 'fleet-rail-badge', 'data-fleet-badge': true, role: 'img', 'aria-label': `${badgeCount} maintenance items need attention`, title: `${badgeCount} maintenance items need attention`, text: String(badgeCount) }));
}

export async function installFleetBanner({ api = createFleetApi(), host = () => document.getElementById('main') } = {}) {
  if (installed) return;
  installed = true;
  async function refresh() {
    document.getElementById('fleet-reminder-banner')?.remove();
    badgeCount = 0;
    paintBadge();
    if (!api.native || !isEnabled('fleet') || settings.fleet?.startupBanner === false) return;
    try {
      const view = await api.overview({ staleDays: settings.fleet?.staleDays ?? 90 });
      const summary = bannerSummary(view.rows);
      if (!summary.total) return;
      badgeCount = summary.total;
      const dismiss = h('button', { type: 'button', class: 'btn btn-secondary', id: 'fleet-banner-dismiss', text: 'Dismiss for 1 day', onclick: async () => {
        try {
          const until = new Date(Date.now() + DAY_MS).toISOString();
          await Promise.all([...new Set(summary.ids)].map(id => api.snooze(id, until)));
          await refresh();
        } catch (error) { toast(`Could not snooze reminders: ${error?.message || error}`, { type: 'error' }); }
      } });
      const banner = h('section', { id: 'fleet-reminder-banner', role: 'status', class: 'card fleet-banner', 'aria-label': 'Maintenance reminders' },
        h('p', { class: 'fleet-banner-text' }, summary.text, ' ', h('button', { type: 'button', class: 'btn btn-link', id: 'fleet-banner-review', text: 'Review', onclick: () => go('fleet', { focus: true }) })),
        h('ul', { class: 'fleet-banner-list' }, ...summary.items.map(r => h('li', {}, h('span', { 'aria-hidden': 'true', html: icon(REMINDER_META[r.state]?.status ?? 'info', { size: 14 }) }), ` ${r.assetName} · ${describeReminder(r)}`))),
        summary.more ? h('p', { class: 'fleet-banner-more', text: `and ${summary.more} more` }) : null,
        h('div', { class: 'fleet-banner-actions' }, dismiss));
      host()?.prepend(banner);
      paintBadge();
    } catch (error) { console.warn('Maintenance reminders unavailable:', error?.message || error); }
  }
  onFeatureChange(({ name } = {}) => { if (name === 'fleet') refresh(); else setTimeout(paintBadge, 0); });
  globalThis.addEventListener('deckchek:fleet-changed', refresh);
  await refresh();
}

/** Test hook: forget the one-time install (browser-module singletons). */
export function resetFleetBannerForTest() { installed = false; badgeCount = 0; }
