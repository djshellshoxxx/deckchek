// DeckChek Mobile shell: hash router for the five screens, service-worker registration and the update prompt.
import { announce } from './lib/ui.js';

const SCREENS = {
  speed: { title: 'Speed', load: () => import('./screens/speed.js') },
  strobe: { title: 'Strobe', load: () => import('./screens/strobe.js') },
  vibration: { title: 'Vibration', load: () => import('./screens/vibration.js') },
  spl: { title: 'Sound level', load: () => import('./screens/spl.js') },
  results: { title: 'Results', load: () => import('./screens/results.js') },
};

let cleanup = null;
let token = 0;

export function parseHash(hash) {
  const [name, id] = String(hash || '').replace(/^#\/?/, '').split('/');
  return { name: name in SCREENS ? name : 'speed', id: id || null };
}

async function render() {
  const route = parseHash(location.hash);
  const mine = ++token;
  const view = document.getElementById('view');
  const mod = await SCREENS[route.name].load();
  if (mine !== token) return; // a newer navigation won
  try { cleanup?.(); } catch { /* old screen already gone */ }
  document.title = `${SCREENS[route.name].title} - DeckChek Mobile`;
  for (const a of document.querySelectorAll('.tabs a')) {
    if (a.dataset.screen === route.name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  cleanup = mod.default(view, { route, openResult: id => { location.hash = `#results/${id}`; } }) || null;
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  announce(`${SCREENS[route.name].title} screen`);
}

function showUpdate(registration) {
  const bar = document.getElementById('update');
  if (!bar || !registration.waiting) return;
  bar.hidden = false;
  document.getElementById('update-now').onclick = () => registration.waiting?.postMessage({ type: 'skip-waiting' });
  document.getElementById('update-later').onclick = () => { bar.hidden = true; };
}

async function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(registration); });
    });
    // Reload once after an update the person accepted. The very first install also fires controllerchange (clients.claim), which needs no reload.
    let reloaded = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  } catch (error) { console.warn('Offline support unavailable:', error); }
}

window.addEventListener('hashchange', render);
render();
registerWorker();
