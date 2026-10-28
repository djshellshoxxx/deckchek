// Product-scoped maintenance policy editor. Values are user choices, never
// manufacturer intervals inferred from a device name or research profile.
import { h } from './dom.js';
import { confirmDialog } from './shell.js';

const field = (text, input) => h('label', { class: 'field' }, h('span', { class: 'field-label', text }), input);
const option = (value, text) => h('option', { value, text });
const cssEsc = value => (globalThis.CSS?.escape ? globalThis.CSS.escape(String(value)) : String(value).replace(/[^\w-]/g, c => `\\${c}`));
const EDITOR = '#fleet-template-form select[name="existing"]';

export function fleetTemplatePanel({ view, selectedAsset, api, act, confirm = confirmDialog }) {
  const templates = view.templates ?? [], products = view.products ?? [];
  const panel = h('section', { class: 'card', id: 'fleet-templates' }), form = h('form', { id: 'fleet-template-form' });
  const existing = h('select', { name: 'existing' }, option('', 'New template'), ...templates.map(t => option(t.id, t.title))),
    product = h('select', { name: 'product', required: true }, ...products.map(p => option(p.id, p.model))),
    title = h('input', { name: 'title', required: true, maxlength: 200 }),
    basis = h('select', { name: 'basis' }, option('days', 'Calendar days'), option('hours', 'Tracked hours')),
    interval = h('input', { name: 'interval', type: 'number', min: 1, max: 1000000, required: true, value: 90 }),
    warning = h('input', { name: 'warning', type: 'number', min: 0, max: 1000000, required: true, value: 14 }),
    save = h('button', { type: 'submit', class: 'btn btn-primary', text: 'Save template' });
  existing.addEventListener('change', () => {
    const template = templates.find(t => t.id === existing.value);
    title.value = template?.title ?? ''; product.value = template?.productId ?? products[0]?.id ?? '';
    product.disabled = Boolean(template);
    basis.value = template?.basis ?? 'days'; interval.value = template?.intervalValue ?? 90; warning.value = template?.warnBefore ?? 14;
  });
  form.append(h('div', { class: 'field-grid' }, field('Edit template', existing), field('Product', product), field('Title', title), field('Basis', basis), field('Every', interval), field('Warn before', warning)), save);
  form.addEventListener('submit', event => {
    event.preventDefault();
    // `act` disables the button while saving and ignores re-entry, so a double submit saves once.
    act(() => api.saveTemplate({ id: existing.value || null, productId: product.value, title: title.value, basis: basis.value, intervalValue: Number(interval.value), warnBefore: Number(warning.value) }),
      { done: `Reminder template “${title.value}” saved.`, control: save });
  });
  const applyButton = template => {
    const apply = h('button', { type: 'button', class: 'btn btn-secondary', text: 'Apply to selected asset', 'data-apply-template': template.id, disabled: !selectedAsset || selectedAsset.productId !== template.productId,
      onclick: () => act(() => api.applyTemplate(template.id, selectedAsset.assetId), { done: `${template.title} applied to ${selectedAsset.nickname}.`, control: apply }) });
    return apply;
  };
  // Delete one reminder or template (both are reminder_delete). Confirm first; Cancel returns focus to the button
  // (confirmDialog does that). After a delete, focus moves to the neighbouring Delete button, else the editor.
  const deleteButton = (item, siblings, { label, title, body, done }) => {
    const index = siblings.indexOf(item), next = siblings[index + 1] ?? siblings[index - 1];
    const remove = h('button', { type: 'button', class: 'btn btn-secondary', text: 'Delete', 'data-delete-reminder': item.id, 'aria-label': label,
      onclick: async () => {
        if (!(await confirm({ title, body, confirmLabel: 'Delete' }))) return;
        act(() => api.deleteReminder(item.id), { done, control: remove, fallback: next ? `[data-delete-reminder="${cssEsc(next.id)}"]` : EDITOR });
      } });
    return remove;
  };
  const assetReminders = selectedAsset?.reminders ?? [];
  const assetList = selectedAsset && assetReminders.length
    ? h('div', { id: 'fleet-asset-reminders' }, h('h3', { text: `Reminders on ${selectedAsset.nickname}` }),
      h('ul', {}, ...assetReminders.map(reminder => h('li', {}, h('span', { text: `${reminder.title} · ${reminder.intervalValue} ${reminder.basis} ` }),
        deleteButton(reminder, assetReminders, { label: `Delete reminder ${reminder.title} from ${selectedAsset.nickname}`, title: 'Delete reminder?',
          body: `“${reminder.title}” is removed from ${selectedAsset.nickname}. Maintenance already logged against it is kept. This cannot be undone.`,
          done: `Reminder “${reminder.title}” deleted from ${selectedAsset.nickname}.` })))))
    : null;
  panel.append(...[h('h2', { text: 'Reminder templates' }), h('p', { text: 'Create your own intervals for a product, then apply them to a matching selected asset. These are maintenance choices, not manufacturer-certified intervals. Reapplying a template updates its reminder without adding a duplicate.' }), form,
    h('ul', {}, ...templates.map(template => h('li', {}, h('span', { text: `${products.find(p => p.id === template.productId)?.model ?? template.productId}: ${template.title} · ${template.intervalValue} ${template.basis}` }),
      applyButton(template),
      deleteButton(template, templates, { label: `Delete template ${template.title}`, title: 'Delete reminder template?',
        body: `The template “${template.title}” is deleted. Reminders already applied to assets stay; delete them per asset if you no longer want them. This cannot be undone.`,
        done: `Reminder template “${template.title}” deleted.` })))),
    assetList].filter(Boolean));
  return panel;
}
