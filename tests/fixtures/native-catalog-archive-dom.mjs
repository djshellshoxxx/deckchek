import { Element, installServiceDom } from './service-screen-dom.mjs';
export { deferred, settle } from './service-screen-dom.mjs';

export function installNativeCatalogDom(t) {
  const document = installServiceDom(t);
  const createElement = document.createElement;
  document.createElement = function (tag) {
    const node = createElement.call(this, tag);
    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FIELDSET'].includes(node.tagName)) node.disabled = false;
    if (node.tagName === 'INPUT') node.checked = false;
    return node;
  };
  const oldShow = Element.prototype.showModal, oldClose = Element.prototype.close, oldClick = Element.prototype.click;
  Element.prototype.showModal = function () { this.open = true; this.setAttribute('open', ''); };
  Element.prototype.close = function () { this.open = false; this.removeAttribute('open'); queueMicrotask(() => this.dispatch('close')); };
  Element.prototype.click = function () { if (!this.disabled) this.dispatch('click'); };
  t.after(() => {
    if (oldShow) Element.prototype.showModal = oldShow; else delete Element.prototype.showModal;
    if (oldClose) Element.prototype.close = oldClose; else delete Element.prototype.close;
    if (oldClick) Element.prototype.click = oldClick; else delete Element.prototype.click;
  });
  return document;
}
