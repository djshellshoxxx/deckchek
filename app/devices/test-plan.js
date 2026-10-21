// Device test completeness (SPEC-34): capability model, baseline plan, metric registry and audit.
// Pure module (no DOM, no I/O). `completePlan` is applied by loadProfiles so every consumer sees the full plan.
import { dispatchFor } from './dispatch.js';
import { parseMethod } from './library.js';

const AQ_IDS = ['aq_gain_db', 'aq_thdn_percent', 'aq_thdn_db', 'aq_thd_percent', 'aq_noise_floor_dbfs', 'aq_noise_unweighted_dbfs', 'aq_snr_db', 'aq_dc_offset_percent', 'aq_hum_db', 'aq_balance_db', 'aq_polarity_inverted', 'aq_separation_db', 'aq_response_flatness_db', 'aq_response_low_db', 'aq_response_high_db', 'aq_linearity_db', 'aq_clipping_samples', 'aq_dropouts', 'aq_clock_offset_ppm', 'aq_latency_ms'];

/** Metric ids each non-workflow method emits (pass.metricId must come from here). */
export const METRICS_BY_METHOD = Object.freeze({
  'timecode:format-check': ['tc_carrier_hz', 'tc_speed_error_percent', 'tc_phase_deg', 'tc_phase_error_deg', 'tc_balance_db', 'tc_snr_db', 'tc_dropouts'],
  'midi:coverage': ['midi_controls_seen_percent', 'midi_unexpected_messages', 'midi_controls_discovered'],
  'midi:fader': ['midi_fader_min', 'midi_fader_max', 'midi_fader_monotonic_percent', 'midi_fader_jitter_lsb', 'midi_fader_resolution_bits'],
  'midi:jog': ['midi_jog_ticks_per_rev', 'midi_jog_direction_errors'],
  'midi:button': ['midi_button_bounce_count', 'midi_button_stuck'],
  'midi:led': ['midi_led_ok_percent'],
  'midi:latency': ['midi_jitter_ms'],
  'midi:conformance': ['midi_invalid_messages', 'midi_sysex_malformed', 'midi_stuck_notes', 'midi_orphan_note_offs', 'midi_unpaired_14bit', 'midi_channels_used', 'midi_message_count', 'midi_active_sensing_gap_ms', 'midi_clock_jitter_percent', 'midi_identity_reply'],
  'midi:gm': ['midi_gm_ok_percent', 'midi_gm_steps_na'],
  'audio:quality': AQ_IDS,
  'driver:check': ['driver_present', 'driver_signed', 'driver_status_ok', 'asio_registered'],
  'software:check': ['software_installed', 'software_crashes_90d', 'software_log_errors'],
  'manual:inspection': [],
});

const AUDIO_CATEGORIES = ['controller', 'mixer', 'audio-interface'];

/** What the device can do, derived from its profile (SPEC-34 §3). */
export function capabilitiesOf(profile) {
  const c = profile?.connectivity || {};
  const midiBlock = !!(profile?.midi || c.midi);
  return {
    physical: true,
    usbMidi: midiBlock,
    midiMap: !!profile?.midi,
    audioOut: AUDIO_CATEGORIES.includes(profile?.category) || (c.audio?.usbChannelsOut || 0) > 0,
    audioIn: (c.audio?.usbChannelsIn || 0) > 0,
    driver: (profile?.drivers || []).length > 0,
    software: (profile?.software || []).length > 0,
    timecode: !!profile?.timecode,
    gmSource: profile?.midi?.generalMidi === true,
  };
}

/** capability -> method that must exist in the plan. */
export const REQUIRED_METHOD = Object.freeze({
  physical: 'manual:inspection', driver: 'driver:check', software: 'software:check', usbMidi: 'midi:conformance',
  midiMap: 'midi:coverage', midiTiming: 'midi:latency', audioOut: 'audio:quality', gmSource: 'midi:gm',
});

const requiredCaps = caps => ({ ...caps, midiTiming: caps.usbMidi && caps.midiMap });

const plainMethod = t => String(t?.method || '').trim();
const slug = s => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
const model = p => `${p.manufacturer} ${p.model}`.trim();
const SRC = 'DeckChek test definition';

const BUILDERS = {
  physical: p => ({ id: 'auto-physical-inspection', category: 'mechanical', title: 'Physical inspection', why: 'Catches worn, loose, sticky or damaged parts before any measurement is trusted.', method: 'manual:inspection', params: {}, severity: 'minor',
    steps: ['Connectors and ports are tight, straight and free of corrosion or debris.', 'Faders and knobs move smoothly end to end with no scratching, sticking or play.', 'Jog wheels, platters and encoders turn smoothly and quietly.', 'Buttons, pads and switches click cleanly and return fully.', 'Display, meters and LEDs are even, with no dead or flickering segments.', 'Case, feet and cables have no cracks, loose screws or frayed insulation.'], equipment: [], pass: null, software: null }),
  driver: p => ({ id: 'auto-driver', category: 'driver', title: 'Driver present and healthy', why: 'A missing, unsigned or errored driver is the commonest cause of a device that is not seen or has glitchy audio.', method: 'driver:check', params: {}, severity: 'major',
    steps: [`Connect ${model(p)} directly to the computer with its own cable and power it on.`, 'Run the scan; it matches Device Manager and ASIO entries against the driver names in this profile.'], equipment: [], pass: { metricId: 'driver_present', op: 'equals', value: 1, unit: 'bool', source: SRC }, software: null }),
  software: p => ({ id: 'auto-software', category: 'software', title: 'DJ software log scan', why: 'Crash dumps and error lines in the DJ software logs point at driver, USB or audio problems.', method: 'software:check', params: { software: p.software?.[0]?.name || null }, severity: 'minor',
    steps: ['Close the DJ software so its logs are complete.', 'Run the scan; DeckChek looks at the last 90 days of logs and crash dumps.'], equipment: [], pass: { metricId: 'software_crashes_90d', op: '<=', value: 0, unit: 'count', source: SRC }, software: p.software?.[0]?.name || null }),
  usbMidi: p => ({ id: 'auto-midi-conformance', category: 'midi', title: 'MIDI conformance', why: 'Checks the device speaks valid MIDI 1.0: well-formed messages and SysEx, no stuck or orphan notes, and an answer to the universal Identity Request.', method: 'midi:conformance', params: {}, severity: 'major',
    steps: [`Connect ${model(p)} by USB and close any DJ software that holds its MIDI port.`, 'Select its MIDI input (and output) port.', 'DeckChek sends a universal Identity Request, then records for about 15 seconds.', 'Press every kind of control: buttons, pads, faders, knobs, jogs. Hold one pad for a second.', 'Finish the test; the stream is checked message by message.'], equipment: [], pass: null, software: null }),
  midiMap: p => ({ id: 'auto-midi-coverage', category: 'midi', title: 'Control coverage', why: 'Every control should send MIDI; a control that never reports has a dead switch, pot or sensor.', method: 'midi:coverage', params: {}, severity: 'major',
    steps: ['Connect the unit by USB and select its MIDI port.', 'Move every knob, fader, button, pad, encoder and wheel at least once.', 'Finish the test and review the controls that stayed silent.'], equipment: [], pass: { metricId: 'midi_controls_seen_percent', op: '>=', value: 100, unit: '%', source: SRC }, software: null }),
  midiTiming: p => ({ id: 'auto-midi-timing', category: 'latency', title: 'MIDI timing jitter', why: 'Uneven message spacing makes jog and scratch response rough.', method: 'midi:latency', params: {}, severity: 'minor',
    steps: ['Connect the unit directly to a USB port on the computer, not through a hub.', 'Turn a jog wheel or sweep a fader at a steady speed for about 10 seconds.', 'Finish the test.'], equipment: [], pass: { metricId: 'midi_jitter_ms', op: '<=', value: 4, unit: 'ms', source: SRC }, software: null }),
  audioOut: p => ({ id: 'auto-audio-quality', category: 'audio', title: 'Output audio quality', why: 'Measures what the unit actually delivers: level, distortion, noise, frequency response, channel separation, balance, polarity and dropouts.', method: 'audio:quality', params: { levelDbfs: -12 }, severity: 'major',
    steps: [`Connect ${model(p)}’s main output to the line inputs of a recording interface (inputs 1–2) with good cables, or use its own USB audio loop-back if it has one.`, 'Set the unit’s master and channel levels to unity (0 dB marks), and set EQ, filter, FX, limiter and sampler to neutral or off.', 'Turn monitors and headphones down; DeckChek never plays louder than −12 dBFS.', 'Choose the output device that carries the test signal and the recording input. Calibrate the interface loopback first on the Calibration screen for the best result.', 'Run the test (about 13 seconds) and do not touch the unit.'], equipment: ['Recording interface with line inputs', '2 audio cables (RCA, TRS or XLR to suit)'], pass: null, software: null }),
  gmSource: p => ({ id: 'auto-general-midi', category: 'midi', title: 'General MIDI sound check', why: 'Confirms the built-in General MIDI sound source answers GM System On, programs, the drum map, controllers and 24-voice polyphony.', method: 'midi:gm', params: {}, severity: 'minor',
    steps: [`Connect ${model(p)} by USB and select its MIDI output port.`, 'Turn the unit’s audio output up to a comfortable level.', 'DeckChek plays ten short sound checks; answer Yes or No for each.'], equipment: [], pass: { metricId: 'midi_gm_ok_percent', op: '>=', value: 100, unit: '%', source: SRC }, software: null }),
};

/** Add baseline tests for capabilities without one. Hand-written tests always win. Returns a new profile. */
export function completePlan(profile) {
  if (!profile || !Array.isArray(profile.tests)) return profile;
  const caps = requiredCaps(capabilitiesOf(profile));
  const have = new Set(profile.tests.map(plainMethod));
  const ids = new Set(profile.tests.map(t => t.id));
  const added = [];
  for (const [cap, method] of Object.entries(REQUIRED_METHOD)) {
    if (!caps[cap] || have.has(method)) continue;
    const t = BUILDERS[cap](profile);
    let id = t.id; while (ids.has(id)) id += '-x';
    ids.add(id);
    added.push({ ...t, id, auto: true });
  }
  return added.length ? { ...profile, tests: [...profile.tests, ...added], autoTests: added.length } : { ...profile, autoTests: 0 };
}

/** Gaps that stop a profile from being fully testable. */
export function auditProfile(profile) {
  const gaps = [];
  const gap = (code, message, testId = null) => gaps.push({ code, message, testId });
  const seen = new Set();
  for (const t of profile?.tests || []) {
    if (seen.has(t.id)) gap('duplicate-id', `duplicate test id ${t.id}`, t.id); seen.add(t.id);
    const d = dispatchFor(t);
    if (d.runner === 'unsupported') gap('no-runner', `${t.id}: ${d.reason}`, t.id);
    if (!Array.isArray(t.steps) || !t.steps.length) gap('no-steps', `${t.id}: no steps`, t.id);
    if (t.pass && d.runner !== 'workflow') {
      const ok = METRICS_BY_METHOD[plainMethod(t)];
      if (!ok || !ok.includes(t.pass.metricId)) gap('unknown-metric', `${t.id}: ${plainMethod(t)} does not emit ${t.pass.metricId}`, t.id);
    }
  }
  const methods = new Set((profile?.tests || []).map(plainMethod));
  const caps = requiredCaps(capabilitiesOf(profile));
  const covered = {};
  for (const [cap, method] of Object.entries(REQUIRED_METHOD)) {
    if (!caps[cap]) continue;
    covered[cap] = methods.has(method);
    if (!covered[cap]) gap('uncovered-capability', `${cap}: no ${method} test`);
  }
  return { gaps, covered, capabilities: caps };
}

/** Coverage matrix over many profiles: rows of {id, model, total, auto, gapsBefore, gapsAfter, covered}. */
export function coverageMatrix(profiles) {
  return profiles.map(raw => {
    const done = completePlan(raw);
    const before = auditProfile(raw), after = auditProfile(done);
    return { id: raw.id, model: `${raw.manufacturer} ${raw.model}`, category: raw.category, total: done.tests.length, hand: raw.tests.length, auto: done.autoTests || 0, gapsBefore: before.gaps.filter(g => g.code === 'uncovered-capability').length, gaps: after.gaps, covered: after.covered };
  });
}

export const isAutoTest = t => t?.auto === true;
export { parseMethod };
