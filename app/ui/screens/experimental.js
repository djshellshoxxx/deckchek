// Options > Advanced > Experimental features: one switch per flag in the registry.
// Not registered as a rail screen; the Options menu opens it (anchor in shell.js).

import { h } from '../dom.js';
import { FEATURES, isEnabled, setEnabled } from '../../features.js';
import { announce } from '../live.js';

export function createExperimentalScreen(section) {
  const list = h('ul', { class: 'experimental-list', role: 'list' });
  for (const [name, meta] of Object.entries(FEATURES)) {
    const id = `feature-${name}`;
    const box = h('input', { type: 'checkbox', id, 'data-feature': name });
    box.checked = isEnabled(name);
    box.addEventListener('change', () => {
      setEnabled(name, box.checked);
      announce(`${meta.label} ${box.checked ? 'on' : 'off'}. Takes effect after reopening the screen.`);
    });
    list.append(h('li', {},
      h('label', { for: id }, box, h('strong', { text: ` ${meta.label}` })),
      h('p', { class: 'muted', text: `${meta.description} (${meta.spec}, ${meta.milestone})` })));
  }
  section.replaceChildren(
    h('h1', { tabindex: '-1', text: 'Experimental features' }),
    h('p', { class: 'muted', text: 'Switches hide or show features that are still being proven. Your data is never touched.' }),
    list);
  return {};
}
