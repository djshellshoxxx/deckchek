// Options > Experimental features: one switch per wired flag in the registry, a "Reset to defaults"
// button and an "Experimental" chip on every flag that ships off. Opened as a dialog from the Options
// menu (ui/menus.js). Toggles take effect live: the rail follows flag changes without a reload.

import { h } from '../dom.js';
import { FEATURES, isEnabled, setEnabled, resetFeatures, onFeatureChange } from '../../features.js';
import { announce } from '../live.js';

/** Flags the panel lists: those with code behind them. */
export const panelFlags = () => Object.entries(FEATURES).filter(([, meta]) => meta.wired !== false);

export function createExperimentalScreen(section) {
  const list = h('ul', { class: 'experimental-list', role: 'list' });
  const boxes = new Map();
  for (const [name, meta] of panelFlags()) {
    const id = `feature-${name}`;
    const box = h('input', { type: 'checkbox', id, 'data-feature': name });
    box.checked = isEnabled(name);
    boxes.set(name, box);
    box.addEventListener('change', () => {
      setEnabled(name, box.checked);
      announce(`${meta.label} ${box.checked ? 'on' : 'off'}.`);
    });
    list.append(h('li', { class: 'experimental-item' },
      h('label', { for: id }, box, h('strong', { text: ` ${meta.label}` }),
        meta.default === false ? h('span', { class: 'chip chip-info experimental-chip', text: 'Experimental' }) : null),
      h('p', { class: 'muted', text: `${meta.description} (${meta.spec}, ${meta.milestone})` })));
  }
  const sync = () => { for (const [name, box] of boxes) box.checked = isEnabled(name); };
  const reset = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-feature-reset': '', text: 'Reset to defaults', onclick: () => { resetFeatures(); sync(); announce('Experimental features reset to defaults.'); } });
  section.replaceChildren(
    h('h1', { tabindex: '-1', text: 'Experimental features' }),
    h('p', { class: 'muted', text: 'Switches hide or show features that are still being proven. Your data is never touched.' }),
    list, h('div', { class: 'dialog-actions' }, reset));
  return { sync, dispose: onFeatureChange(sync) };
}

let current = null;
/** Opens the panel in a modal dialog. Resolves when it closes. */
export function openExperimentalDialog() {
  if (current) return current;
  const trigger = document.activeElement;
  const body = h('div', { class: 'experimental-panel' });
  const dlg = h('dialog', { class: 'diag-dialog experimental-dialog', 'aria-label': 'Experimental features' },
    h('div', { class: 'dialog-form' }, body, h('div', { class: 'dialog-actions' }, h('button', { type: 'button', class: 'btn btn-primary', 'data-experimental-close': '', text: 'Done', onclick: () => dlg.close() }))));
  document.body.append(dlg);
  const api = createExperimentalScreen(body);
  current = new Promise(resolve => dlg.addEventListener('close', () => {
    api.dispose();
    dlg.remove();
    current = null;
    if (trigger?.isConnected) trigger.focus();
    resolve();
  }, { once: true }));
  dlg.showModal();
  body.querySelector('h1')?.focus();
  return current;
}
