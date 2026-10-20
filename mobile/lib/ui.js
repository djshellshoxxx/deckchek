// Small DOM helpers. Text only: nothing here sets innerHTML, so measured or imported strings can never become markup.

/** Create an element. attrs: class, text, on<event> listeners, any other attribute (false/null skipped, true = empty). */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

/** Number for display: fixed decimals, no trailing noise. */
export const fmt = (v, d = 2) => (Number.isFinite(v) ? String(Number(v.toFixed(d))) : '-');

/** Say something to screen readers (the #live region in index.html). */
export function announce(message) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => { live.textContent = message; }, 30);
}

/** Measurements as a table: label, value + unit, uncertainty. */
export function measurementTable(measurements, { caption = 'Measurements' } = {}) {
  return el('table', { class: 'm-table' },
    el('caption', { class: 'sr-only', text: caption }),
    el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: 'Measurement' }), el('th', { scope: 'col', text: 'Value' }), el('th', { scope: 'col', text: 'Uncertainty' }))),
    el('tbody', {}, ...measurements.map(m => el('tr', {},
      el('th', { scope: 'row', text: m.label || m.metricId }),
      el('td', { class: 'num', text: `${fmt(m.value, 3)}${m.unit ? ` ${m.unit}` : ''}` }),
      el('td', { class: 'num', text: m.uncertainty == null ? '-' : `± ${fmt(m.uncertainty, 3)}` })))));
}

/** Save text as a file through a temporary link. */
export function downloadText(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** A state box: title + message, role=status so screen readers hear changes. */
export function stateBox(kind, title, message) {
  return el('div', { class: `state state-${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    el('strong', { text: title }), message ? el('span', { text: ` ${message}` }) : null);
}
