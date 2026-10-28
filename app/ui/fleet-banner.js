// FS-23 start-up reminder banner (AC-6). Installed from the [FS-23] anchor in ui/shell.js. Non-blocking
// (role="status", never steals focus), lists at most five items then "and N more", adds a count badge to the
// Fleet rail entry, and "Dismiss for 1 day" snoozes the listed reminders without deleting them.
// Desktop only (the reminders live in the database); the flag and the `fleet.startupBanner` setting gate it.

import { h } from './dom.js';
import { icon } from './icons.js';
import { settings } from './state.js';
import { go } from './shell.js';
import { toast, announce } from './live.js';
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

/** Where focus goes when a focused banner control disappears: the visible screen's heading, else <main>. */
function focusFallback(main) {
  const target = main?.querySelector('.screen:not([hidden]) h1') ?? main;
  if (!target) return;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus();
}

export async function installFleetBanner({ api = createFleetApi(), host = () => document.getElementById('main') } = {}) {
  if (installed) return;
  installed = true;
  let generation = 0;
  // Removes every banner copy and says whether one of them held keyboard focus.
  const removeBanners = () => {
    let hadFocus = false;
    for (const node of document.querySelectorAll('[id="fleet-reminder-banner"]')) { hadFocus ||= node.contains(document.activeElement); node.remove(); }
    return hadFocus;
  };
  async function refresh() {
    // Several fleet-changed events can overlap: only the newest refresh may render, and it replaces
    // whatever banner is present at that moment, so there is never more than one.
    const mine = ++generation;
    if (removeBanners()) focusFallback(host());
    badgeCount = 0;
    paintBadge();
    if (!api.native || !isEnabled('fleet') || settings.fleet?.startupBanner === false) return;
    try {
      const view = await api.overview({ staleDays: settings.fleet?.staleDays ?? 90 });
      if (mine !== generation) return;
      const summary = bannerSummary(view.rows);
      if (!summary.total) return;
      const dismiss = h('button', { type: 'button', class: 'btn btn-secondary', id: 'fleet-banner-dismiss', text: 'Dismiss for 1 day', onclick: async () => {
        if (dismiss.disabled) return;
        dismiss.disabled = true; dismiss.setAttribute('aria-busy', 'true');
        const ids = [...new Set(summary.ids)];
        try {
          const until = new Date(Date.now() + DAY_MS).toISOString();
          await Promise.all(ids.map(id => api.snooze(id, until)));
          // The banner and this button are about to be removed: keep keyboard users inside the app.
          if (dismiss.contains(document.activeElement) || document.activeElement === document.body) focusFallback(host());
          announce(`${ids.length} maintenance reminder${ids.length === 1 ? '' : 's'} snoozed for 1 day.`);
          await refresh();
        } catch (error) {
          dismiss.disabled = false; dismiss.removeAttribute('aria-busy');
          toast(`Could not snooze reminders: ${error?.message || error}`, { type: 'error' });
        }
      } });
      const banner = h('section', { id: 'fleet-reminder-banner', role: 'status', class: 'card fleet-banner', 'aria-label': 'Maintenance reminders' },
        h('p', { class: 'fleet-banner-text' }, summary.text, ' ', h('button', { type: 'button', class: 'btn btn-link', id: 'fleet-banner-review', text: 'Review', onclick: () => go('fleet', { focus: true }) })),
        h('ul', { class: 'fleet-banner-list' }, ...summary.items.map(r => h('li', {}, h('span', { 'aria-hidden': 'true', html: icon(REMINDER_META[r.state]?.status ?? 'info', { size: 14 }) }), h('span', { text: `${r.assetName} · ${describeReminder(r)}` })))),
        summary.more ? h('p', { class: 'fleet-banner-more', text: `and ${summary.more} more` }) : null,
        h('div', { class: 'fleet-banner-actions' }, dismiss));
      removeBanners();
      badgeCount = summary.total;
      host()?.prepend(banner);
      paintBadge();
    } catch (error) { if (mine === generation) console.warn('Maintenance reminders unavailable:', error?.message || error); }
  }
  onFeatureChange(({ name } = {}) => { if (name === 'fleet') refresh(); else setTimeout(paintBadge, 0); });
  globalThis.addEventListener('deckchek:fleet-changed', refresh);
  await refresh();
}

/** Test hook: forget the one-time install (browser-module singletons). */
export function resetFleetBannerForTest() { installed = false; badgeCount = 0; }
