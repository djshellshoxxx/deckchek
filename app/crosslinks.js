// Cross-links between the M6 features (hum hunter, latency, stylus wear, wear map, scratch test, pre-gig):
// which screen suggests which, when a link is shown, and the models behind the stylus health card.
// Pure and DOM-free (the flags are passed in), so the rules are unit-tested in Node; ui/crosslinks.js renders them.

/** Everything a link can point at. `feature` is the flag that must be on for the rail entry (and so the link) to exist. */
export const TARGETS = Object.freeze({
  pregig: { id: 'pregig', feature: 'pregig', label: 'Pre-gig check', text: 'Check the whole rig before you play.', icon: 'pass' },
  latency: { id: 'latency', feature: 'latencyTuner', label: 'Latency & buffer', text: 'Measure round-trip latency and find a safe buffer size.', icon: 'plug' },
  stylus: { id: 'stylus', feature: 'stylusWear', label: 'Stylus wear', text: 'See hours, benchmarks and the replacement estimate.', icon: 'cartridge' },
  vinylscan: { id: 'vinylscan', feature: 'wearMap', label: 'Wear map', text: 'Map timecode quality around the groove of a control record.', icon: 'vinyl' },
  scratch: { id: 'scratch', feature: 'scratchTest', label: 'Scratch stress test', text: 'See how the timecode holds up under real scratching.', icon: 'wave' },
  hum: { id: 'hum', feature: 'humHunter', label: 'Hum hunter', text: 'Track down hum and ground loops step by step.', icon: 'wave' },
});

/** Screen -> suggested next steps, in order. Keys are screen ids. */
export const RELATED = Object.freeze({
  quick: ['pregig', 'latency', 'hum'],
  dvs: ['scratch', 'vinylscan'],
  calibration: ['latency'],
});

const BLURB = Object.freeze({
  'quick>pregig': 'Ready to play? Run the full pre-gig check on your whole rig.',
  'quick>latency': 'Measure how much delay your interface adds, and pick a buffer size.',
  'quick>hum': 'Hearing a hum or buzz? Track down where it comes from.',
  'dvs>scratch': 'Stress the timecode with scratching and see where it loses lock.',
  'dvs>vinylscan': 'Map where on the record the timecode quality drops.',
  'calibration>latency': 'Calibration covers levels. Measure round-trip latency next.',
});

/** Links to show on `from`, limited to features that are on. `enabled(flag) -> boolean`. */
export function relatedLinks(from, enabled) {
  return (RELATED[from] || []).map(id => TARGETS[id]).filter(t => t && enabled(t.feature)).map(t => ({ ...t, text: BLURB[`${from}>${t.id}`] || t.text }));
}

const CARTRIDGE_CATEGORIES = new Set(['cartridge', 'stylus']);
const DVS_CATEGORIES = new Set(['dvs_media']);
const INTERFACE_CATEGORIES = new Set(['audio_interface', 'dvs_interface']);

/**
 * Links for an Equipment asset, by its product category. Each link may carry a hand-over `params` object that
 * the target screen reads (see ui/crosslinks.js takeHandoff): the asset to select there.
 */
export function equipmentLinks(asset, category, enabled) {
  if (!asset?.id) return [];
  const ids = CARTRIDGE_CATEGORIES.has(category) ? ['stylus', 'vinylscan'] : DVS_CATEGORIES.has(category) ? ['vinylscan'] : INTERFACE_CATEGORIES.has(category) ? ['latency'] : [];
  const params = id => (id === 'stylus' ? { assetId: asset.id } : id === 'vinylscan' ? { stylusId: asset.id } : null);
  return ids.map(id => TARGETS[id]).filter(t => enabled(t.feature)).map(t => ({
    ...t,
    label: t.id === 'stylus' ? 'Open stylus wear' : t.id === 'vinylscan' ? 'Open wear map' : t.label,
    params: params(t.id),
  }));
}

/**
 * Extra fix actions the Pre-gig screen adds beside the engine's own, by step kind and state. Returned in the shape
 * pre-gig fixButtons() produces ({label, text, kind: 'navigate', to}) so the screen renders them the same way.
 */
export function pregigCrossFixes(stepId, state, enabled) {
  if (state !== 'warn' && state !== 'fail' && state !== 'error') return [];
  const kind = String(stepId).split(':')[0];
  const out = [];
  if (kind === 'signal' && enabled(TARGETS.hum.feature)) out.push({ label: 'Hunt the hum', text: 'Walk through the hum hunter to find which cable, ground or power source it comes from.', kind: 'navigate', to: 'hum' });
  if (kind === 'timecode' && enabled(TARGETS.stylus.feature)) out.push({ label: 'Check the stylus', text: 'A worn stylus lowers timecode quality. Look at its hours and benchmark trend.', kind: 'navigate', to: 'stylus' });
  if ((kind === 'audio' || kind === 'timecode') && enabled(TARGETS.latency.feature)) out.push({ label: 'Check latency and buffer', text: 'Dropouts and clicks often come from a buffer that is too small. Measure and pick a safer size.', kind: 'navigate', to: 'latency' });
  // Windows Settings pages (opened through the fixed allowlist in links.rs; see SETTINGS_TARGETS).
  if (kind === 'audio') {
    out.push({ label: 'Open microphone privacy settings', text: 'If Windows blocks audio input, allow desktop apps to use the microphone.', kind: 'settings', target: 'ms-settings:privacy-microphone' });
  }
  if (kind === 'audio' || kind === 'timecode') {
    out.push({ label: 'Open power settings', text: 'Set the power mode to Best performance so USB audio is not put to sleep.', kind: 'settings', target: 'ms-settings:powersleep' });
  }
  return out;
}

/** Fix buttons plus the cross-link extras, without repeating a target the engine already offers. */
export function withCrossFixes(buttons, stepId, state, enabled) {
  const have = new Set(buttons.map(b => `${b.kind}|${b.to || b.target || ''}`));
  return [...buttons, ...pregigCrossFixes(stepId, state, enabled).filter(f => !have.has(`${f.kind}|${f.to || f.target || ''}`))];
}

/** The only Windows Settings pages the app asks Rust to open (Rust enforces the same list). */
export const SETTINGS_TARGETS = Object.freeze(['ms-settings:sound', 'ms-settings:powersleep', 'ms-settings:privacy-microphone']);
export const isSettingsTarget = t => SETTINGS_TARGETS.includes(t);

// ---------------------------------------------------------------- stylus health card

const SEVERITY_RANK = { red: 0, amber: 1, info: 2 };

/**
 * The cartridge the card should describe: the one the user last opened on the Stylus screen if it still exists,
 * otherwise the one with the most recent usage entry, otherwise the first.
 * @param {{id:string, lastUsedMs?:number}[]} assets
 */
export function pickActiveAsset(assets, preferredId = null) {
  if (!assets?.length) return null;
  const preferred = assets.find(a => a.id === preferredId);
  if (preferred) return preferred;
  return [...assets].sort((a, b) => (b.lastUsedMs || 0) - (a.lastUsedMs || 0))[0];
}

const monthOf = ms => { const d = new Date(ms); return Number.isNaN(d.getTime()) ? '' : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

/**
 * View model for the health card from loadAssetState() output: wear %, status word and the next alert.
 * `nextAlert` is the most severe alert that is not snoozed, else the projected replacement month, else null.
 */
export function stylusCardModel(state, name = 'Cartridge') {
  if (!state?.life) return null;
  const { life, alerts = [], projection = null } = state;
  const live = alerts.filter(a => !a.snoozed).sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3));
  let next = null;
  if (live[0]) next = { kind: 'alert', severity: live[0].severity, text: live[0].message };
  else if (projection?.date) next = { kind: 'projection', severity: 'info', text: `Replace around ${monthOf(projection.date)} at current use` };
  const hours = life.hours;
  return {
    name, pct: Math.round(life.pct), status: life.status, label: life.label,
    hoursText: `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} of ${Math.round(life.ratedHours)} h`,
    tone: life.status === 'red' ? 'fail' : life.status === 'amber' ? 'warn' : 'pass',
    nextAlert: next,
  };
}
