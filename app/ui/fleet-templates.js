// Product-scoped maintenance policy editor. Values are user choices, never
// manufacturer intervals inferred from a device name or research profile.
import { h } from './dom.js';

const field = (text, input) => h('label', { class: 'field' }, h('span', { class: 'field-label', text }), input);
const option = (value, text) => h('option', { value, text });

export function fleetTemplatePanel({ view, selectedAsset, api, act }) {
  const templates = view.templates ?? [], products = view.products ?? [];
  const panel = h('section', { class: 'card', id: 'fleet-templates' }), form = h('form');
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
  form.addEventListener('submit', async event => {
    event.preventDefault(); save.disabled = true;
    try { await act(() => api.saveTemplate({ id: existing.value || null, productId: product.value, title: title.value, basis: basis.value, intervalValue: Number(interval.value), warnBefore: Number(warning.value) })); }
    finally { save.disabled = false; }
  });
  panel.append(h('h2', { text: 'Reminder templates' }), h('p', { text: 'Create your own intervals for a product, then apply them to a matching selected asset. These are maintenance choices, not manufacturer-certified intervals. Reapplying a template updates its reminder without adding a duplicate.' }), form,
    h('ul', {}, ...templates.map(template => h('li', {}, h('span', { text: `${products.find(p => p.id === template.productId)?.model ?? template.productId}: ${template.title} · ${template.intervalValue} ${template.basis}` }),
      h('button', { type: 'button', class: 'btn btn-secondary', text: 'Apply to selected asset', disabled: !selectedAsset || selectedAsset.productId !== template.productId,
        onclick: () => act(() => api.applyTemplate(template.id, selectedAsset.assetId)) })))));
  return panel;
}
