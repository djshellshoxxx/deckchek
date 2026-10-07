// Device library: load researched device profiles (docs/DEVICE-PROFILE-SCHEMA.md),
// validate them, group their test plans and summarise spec confidence and
// per-asset progress. Pure module (no DOM); fetch is injectable for tests.

export const CATEGORIES = ['turntable', 'controller', 'mixer', 'audio-interface', 'timecode-media', 'software'];
export const CATEGORY_LABELS = {
  turntable: 'Turntable', controller: 'Controller', mixer: 'Mixer', 'audio-interface': 'Audio interface',
  'timecode-media': 'Timecode media', software: 'Software',
};
export const TEST_CATEGORIES = ['driver', 'usb', 'software', 'audio', 'mixer', 'timecode', 'dvs', 'midi', 'pitch', 'speed', 'cartridge', 'latency', 'mechanical', 'safety'];
export const TEST_CATEGORY_LABELS = {
  driver: 'Driver', usb: 'USB', software: 'Software', audio: 'Audio', mixer: 'Mixer', timecode: 'Timecode', dvs: 'DVS',
  midi: 'MIDI controls', pitch: 'Pitch', speed: 'Speed', cartridge: 'Cartridge', latency: 'Latency', mechanical: 'Mechanical', safety: 'Safety & hum',
};
export const PASS_OPS = ['abs<=', '<=', '>=', 'between', 'equals', 'all-seen'];
export const SEVERITIES = ['critical', 'major', 'minor'];
/** Engines a test method can name, as `<engine>:<mode>`. */
export const METHOD_ENGINES = ['quick', 'speed', 'cartridge', 'dvs', 'vinyl', 'timecode', 'midi', 'driver', 'software', 'manual'];
export const MIDI_KINDS = ['coverage', 'fader', 'jog', 'button', 'led', 'latency'];

/** Split "speed:Pitch map" into {engine:'speed', mode:'Pitch map'}. */
export function parseMethod(method) {
  const s = String(method || '');
  const i = s.indexOf(':');
  if (i < 0) return { engine: s.trim(), mode: '' };
  return { engine: s.slice(0, i).trim(), mode: s.slice(i + 1).trim() };
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

/** Validate a profile against the schema contract. Errors make it unusable; warnings are shown but tolerated. */
export function validateProfile(p) {
  const errors = [], warnings = [];
  if (!isObj(p)) return { ok: false, errors: ['profile is not an object'], warnings };
  if (p.schemaVersion !== 1) errors.push(`unsupported schemaVersion ${p.schemaVersion}`);
  if (typeof p.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) errors.push('id must be kebab-case');
  for (const k of ['manufacturer', 'model', 'summary']) if (typeof p[k] !== 'string' || !p[k].trim()) errors.push(`${k} is required`);
  if (!CATEGORIES.includes(p.category)) errors.push(`unknown category "${p.category}"`);
  if (p.image != null && (!isObj(p.image) || typeof p.image.file !== 'string')) errors.push('image.file is required when image is set');
  if (!Array.isArray(p.documents)) warnings.push('documents missing');
  if (!Array.isArray(p.specs)) errors.push('specs must be an array');
  else p.specs.forEach((s, i) => {
    if (!s?.key) errors.push(`specs[${i}].key is required`);
    if (!['confirmed', 'unverified'].includes(s?.confidence)) warnings.push(`spec ${s?.key || i}: confidence should be confirmed|unverified`);
    if (!s?.source) warnings.push(`spec ${s?.key || i}: no source`);
  });
  if (!Array.isArray(p.tests) || !p.tests.length) errors.push('tests must be a non-empty array');
  else {
    const seen = new Set();
    p.tests.forEach((t, i) => {
      const where = `test ${t?.id || i}`;
      if (!t?.id) errors.push(`tests[${i}].id is required`);
      else if (seen.has(t.id)) errors.push(`duplicate test id ${t.id}`);
      else seen.add(t.id);
      if (!t?.title) errors.push(`${where}: title is required`);
      const { engine, mode } = parseMethod(t?.method);
      if (!METHOD_ENGINES.includes(engine)) errors.push(`${where}: unknown method "${t?.method}"`);
      else if (engine === 'midi' && !MIDI_KINDS.includes(mode)) errors.push(`${where}: unknown MIDI test "${mode}"`);
      if (!TEST_CATEGORIES.includes(t?.category)) warnings.push(`${where}: unknown category "${t?.category}"`);
      if (!Array.isArray(t?.steps) || !t.steps.length) warnings.push(`${where}: no steps`);
      if (t?.pass != null) {
        if (!PASS_OPS.includes(t.pass.op)) errors.push(`${where}: unknown pass op "${t.pass.op}"`);
        if (!t.pass.metricId) errors.push(`${where}: pass.metricId is required`);
      }
      if (t?.severity && !SEVERITIES.includes(t.severity)) warnings.push(`${where}: unknown severity "${t.severity}"`);
    });
  }
  if (p.midi != null && !Array.isArray(p.midi.controls)) errors.push('midi.controls must be an array');
  return { ok: errors.length === 0, errors, warnings };
}

/** Load index.json then every profile it lists. Invalid profiles are reported, not thrown. */
export async function loadProfiles({ base = './devices/', fetchJson = defaultFetchJson } = {}) {
  const index = await fetchJson(`${base}index.json`);
  const ids = Array.isArray(index?.profiles) ? index.profiles : [];
  const profiles = [], problems = [];
  await Promise.all(ids.map(async (id, order) => {
    try {
      const p = await fetchJson(`${base}profiles/${id}.json`);
      const v = validateProfile(p);
      if (p?.id !== id) v.errors.push(`file ${id}.json declares id "${p?.id}"`);
      if (v.errors.length) problems.push({ id, errors: v.errors, warnings: v.warnings });
      else profiles.push({ order, profile: p, warnings: v.warnings });
    } catch (error) {
      problems.push({ id, errors: [`could not load: ${error?.message || error}`], warnings: [] });
    }
  }));
  profiles.sort((a, b) => a.order - b.order);
  return { profiles: profiles.map(x => x.profile), warnings: Object.fromEntries(profiles.map(x => [x.profile.id, x.warnings])), problems };
}

async function defaultFetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** Tests grouped by category in a stable, workflow-friendly order. */
export function groupTestsByCategory(profile) {
  const groups = new Map();
  for (const t of profile?.tests || []) {
    const c = t.category || 'other';
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(t);
  }
  const rank = c => { const i = TEST_CATEGORIES.indexOf(c); return i < 0 ? 99 : i; };
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([category, tests]) => ({ category, label: TEST_CATEGORY_LABELS[category] || category, tests }));
}

/** Spec confidence summary: how much of the profile is backed by manufacturer documents. */
export function specSummary(profile) {
  const specs = profile?.specs || [];
  const confirmed = specs.filter(s => s.confidence === 'confirmed').length;
  const formats = profile?.timecode?.formats || [];
  const unverifiedFormats = formats.filter(f => f.confidence !== 'confirmed').length;
  const midiLearn = !!profile?.midi && (profile.midi.mapSource === 'learn' || !(profile.midi.controls || []).some(c => c.message?.kind));
  return {
    total: specs.length, confirmed, unverified: specs.length - confirmed, unverifiedFormats, midiLearn,
    hasUnverified: specs.length - confirmed > 0 || unverifiedFormats > 0,
  };
}

/** Latest result per test id (results may be in any order). */
export function latestResults(results = []) {
  const out = new Map();
  for (const r of results) {
    const prev = out.get(r.testId);
    if (!prev || String(r.createdAt) > String(prev.createdAt)) out.set(r.testId, r);
  }
  return out;
}

/** Progress for one asset's results against a profile's test plan. */
export function progressFor(profile, results = []) {
  const latest = latestResults(results.filter(r => !r.profileId || r.profileId === profile.id));
  const p = { total: 0, passed: 0, failed: 0, unknown: 0, skipped: 0, untested: 0 };
  for (const t of profile?.tests || []) {
    p.total++;
    const s = latest.get(t.id)?.status;
    if (s === 'pass') p.passed++;
    else if (s === 'fail') p.failed++;
    else if (s === 'unknown') p.unknown++;
    else if (s === 'skipped') p.skipped++;
    else p.untested++;
  }
  p.done = p.total - p.untested;
  return p;
}

export function imageUrl(profile, base = './devices/images/') {
  return profile?.image?.file ? `${base}${profile.image.file}` : null;
}

/** Usable document links (http/https only); placeholders without a URL are returned separately. */
export function documentLinks(profile) {
  const docs = profile?.documents || [];
  return {
    links: docs.filter(d => /^https?:\/\//i.test(d?.url || '')),
    missing: docs.filter(d => !/^https?:\/\//i.test(d?.url || '')),
  };
}
