// Pure route registry/parser shared by the shell and its contract tests.
export const SCREENS = Object.freeze({
  speed: { title: 'Speed', load: () => import('../screens/speed.js') },
  strobe: { title: 'Strobe', load: () => import('../screens/strobe.js') },
  vibration: { title: 'Vibration', load: () => import('../screens/vibration.js') },
  spl: { title: 'Sound level', load: () => import('../screens/spl.js') },
  results: { title: 'Results', load: () => import('../screens/results.js') },
});

export function parseHash(hash) {
  const [name, id] = String(hash || '').replace(/^#\/?/, '').split('/');
  return { name: Object.hasOwn(SCREENS, name) ? name : 'speed', id: id || null };
}
