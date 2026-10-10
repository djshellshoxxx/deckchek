// Cross-links between the M6 features (DOM side): "Related tools" cards, the Quick Check stylus health card,
// deep-link hand-over between screens and the Windows Settings opener. Rules and models live in ../crosslinks.js.

import { h, isNative, storageGet } from './dom.js';
import { icon, chip } from './icons.js';
import { toast } from './live.js';
import { go } from './shell.js';
import { isEnabled } from '../features.js';
import { relatedLinks, equipmentLinks, stylusCardModel, pickActiveAsset, isSettingsTarget } from '../crosslinks.js';

export const ACTIVE_CARTRIDGE_KEY = 'deckchek.stylus.asset.v1';

// ---------- hand-over ----------
// A deep link may name something on the target screen (a cartridge, a stylus). The sender parks it here and the target
// reads it once in onShow(); a value nobody reads is replaced by the next link instead of piling up.
const pending = new Map();
export function takeHandoff(screenId) {
  const value = pending.get(screenId) ?? null;
  pending.delete(screenId);
  return value;
}
/** Navigate to a screen, optionally handing it parameters. Follows the shell's `go()` (a disabled feature falls back to the first screen). */
export function navigateTo(screenId, params = null) {
  if (params) pending.set(screenId, params); else pending.delete(screenId);
  go(screenId, { focus: true });
}

// ---------- link buttons ----------
export function linkButton(link, { size = 'btn-sm', variant = 'btn-secondary' } = {}) {
  return h('button', { type: 'button', class: `btn ${variant} ${size} xlink`, 'data-xlink': link.id, onclick: () => navigateTo(link.id, link.params || null) },
    h('span', { 'aria-hidden': 'true', html: icon(link.icon || 'arrowRight', { size: 16 }) }), h('span', { text: link.label }));
}

function card(title, links, { id, extra = null } = {}) {
  return h('section', { class: 'card xlink-card', 'data-xlink-card': id, 'aria-label': title },
    h('h2', { class: 'card-title', text: title }),
    h('ul', { class: 'xlink-list' }, ...links.map(l => h('li', { class: 'xlink-item' }, linkButton(l), h('span', { class: 'muted small xlink-text', text: l.text })))),
    extra);
}

/** "Related tools" card for screen `from` (quick, dvs, calibration), or null when no linked feature is on. */
export function relatedCard(from, { title = 'Next steps' } = {}) {
  const links = relatedLinks(from, isEnabled);
  return links.length ? card(title, links, { id: from }) : null;
}

/** Buttons for an Equipment asset (cartridge -> stylus + wear map, DVS media -> wear map, interface -> latency), or null. */
export function equipmentLinkRow(asset, category) {
  const links = equipmentLinks(asset, category, isEnabled);
  if (!links.length) return null;
  return h('div', { class: 'xlink-row', role: 'group', 'aria-label': 'Related tools', 'data-xlink-card': 'equipment' }, ...links.map(l => linkButton(l)));
}

// ---------- stylus health card ----------
/**
 * Loads the active cartridge's wear state (same code path as the Stylus screen). Resolves to
 * {model} | {empty: 'no-cartridge'} | {empty: 'desktop'} | {error}. Never rejects.
 */
export async function loadStylusHealth() {
  if (!isNative()) return { empty: 'desktop' };
  try {
    const m = await import('./screens/stylus.js');
    const [{ createStylusApi }, { createUsageApi }] = await Promise.all([import('../stylus-wear.js'), import('../usage-hours.js')]);
    const assets = await m.listStylusAssets();
    if (!assets.length) return { empty: 'no-cartridge' };
    const api = createStylusApi(), usage = createUsageApi();
    const withUse = await Promise.all(assets.map(async a => {
      const entries = await usage.list(a.id).catch(() => []);
      return { ...a, lastUsedMs: Math.max(0, ...entries.map(e => Date.parse(e.startedAt) || 0)) };
    }));
    const asset = pickActiveAsset(withUse, storageGet(ACTIVE_CARTRIDGE_KEY, null));
    const state = await m.loadAssetState(asset, { api, usage, catalogue: await m.loadCatalogue() });
    return { model: stylusCardModel(state, asset.name), assetId: asset.id };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

/** Quick Check card: the active cartridge's wear and next alert, with a link to the Stylus screen. Null while the flag is off. */
export function stylusHealthCard({ loader = loadStylusHealth } = {}) {
  if (!isEnabled('stylusWear')) return null;
  const body = h('div', { class: 'xlink-health', 'aria-live': 'polite' }, h('p', { class: 'muted small', text: 'Loading cartridge wear…' }));
  const el = h('section', { class: 'card xlink-card xlink-stylus', 'data-xlink-card': 'stylus-health', 'aria-label': 'Stylus health' }, h('h2', { class: 'card-title', text: 'Stylus health' }), body);
  loader().then(res => {
    if (!el.isConnected && !body.isConnected) return;
    body.replaceChildren(...renderHealth(res));
  });
  return el;
}

function renderHealth(res) {
  const open = assetId => h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-xlink': 'stylus', onclick: () => navigateTo('stylus', assetId ? { assetId } : null) },
    h('span', { 'aria-hidden': 'true', html: icon('cartridge', { size: 16 }) }), h('span', { text: 'Open stylus wear' }));
  if (res.model) {
    const m = res.model;
    const next = m.nextAlert;
    const wrap = document.createElement('span');
    wrap.innerHTML = chip(m.tone, `${m.pct} % worn`, { size: 14 });
    return [
      h('p', { class: 'xlink-health-head' }, wrap.firstElementChild, h('strong', { class: 'xlink-health-name', text: m.name })),
      h('p', { class: 'small', 'data-health': 'hours', text: `${m.hoursText} of rated life used. ${m.label}.` }),
      h('p', { class: `small ${next?.severity === 'red' ? 'xlink-next-red' : ''}`, 'data-health': 'next', text: next ? `Next: ${next.text}` : 'No alerts. Nothing to do right now.' }),
      open(res.assetId)];
  }
  const text = res.empty === 'no-cartridge' ? 'No cartridge in Equipment yet. Add one to track its hours and wear.'
    : res.empty === 'desktop' ? 'Stylus wear is tracked in the DeckChek desktop app.'
      : `Cartridge wear could not be loaded: ${res.error || 'unknown error'}`;
  return [h('p', { class: 'small', 'data-health': res.error ? 'error' : 'empty', text }), res.empty === 'no-cartridge' || res.error ? open(null) : null];
}

// ---------- Windows Settings ----------
/**
 * Opens one of the fixed Windows Settings pages through the `open_external_url` command (Rust re-checks the exact list).
 * When that is not possible (browser preview, non-Windows, refusal) the shortcut is copied for Win+R instead.
 * Returns 'opened' | 'copied' | 'shown'.
 */
export async function openWindowsSettings(target, { invoke = isNative() ? window.__TAURI__.core.invoke : null, clipboard = globalThis.navigator?.clipboard } = {}) {
  if (!isSettingsTarget(target)) return 'shown';
  if (invoke) {
    try {
      const r = await invoke('open_external_url', { url: target, confirmed: false });
      if (r?.opened) return 'opened';
    } catch { /* fall through to the copy fallback */ }
  }
  try {
    await clipboard.writeText(target);
    toast(`Copied "${target}". Press Win+R, paste it and press Enter to open Windows Settings.`, { type: 'info', timeout: 8000 });
    return 'copied';
  } catch {
    toast(`Press Win+R and type ${target} to open Windows Settings.`, { type: 'info', timeout: 8000 });
    return 'shown';
  }
}
