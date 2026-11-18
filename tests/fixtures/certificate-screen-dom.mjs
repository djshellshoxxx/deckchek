// Certificate screens use the real DOM builders and cached shell navigation. Keep event
// dispatch synchronous: browser events ignore callback promises, so these tests do too.
import { Element, installServiceDom } from './service-screen-dom.mjs';
export { deferred, settle } from './service-screen-dom.mjs';

class CertificateElement extends Element {
  replaceWith(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    parent.replaceChildren(...parent.children.flatMap(child => child === this ? nodes : [child]));
  }
  click() { if (!this.disabled) this.dispatch('click'); }
  get classList() {
    const toggle = (name, force) => {
      const classes = new Set(this.className.split(' ').filter(Boolean));
      const add = force ?? !classes.has(name);
      if (add) classes.add(name); else classes.delete(name);
      this.className = [...classes].join(' ');
      return add;
    };
    return { add: name => toggle(name, true), remove: name => toggle(name, false), toggle, contains: name => this.className.split(' ').includes(name) };
  }
  showModal() { this.open = true; }
}

export function installCertificateDom(t) {
  const document = installServiceDom(t);
  document.createElement = function (tag) { return new CertificateElement(tag, this); };
  const dialog = document.createElement('dialog');
  dialog.id = 'confirm-dialog';
  dialog.innerHTML = '<h2 id="confirm-title"></h2><p id="confirm-body"></p><button id="confirm-ok"></button><button id="confirm-cancel"></button>';
  document.body.append(dialog);
  return document;
}
