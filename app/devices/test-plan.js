// Device test completeness (SPEC-34): capability model, baseline plan, metric registry and audit.
// Pure module (no DOM, no I/O). The Devices screen applies `completePlan` after loading profiles,
// so every consumer of the library sees the full plan; the raw profiles are what gets synced.
// Ported from PR9 (a4d844b) with an explicit "conditional" audio-output capability: most profiles
// do not record their USB output channel count, so category alone must not invent an audio test
// for a MIDI-only controller. MIDI transport facts are distinct from conditional planning:
// a map or learn scaffold alone does not establish USB or DIN support.
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

// Categories whose units always carry an audio output path (a mixer or interface without one is not a product).
const AUDIO_OUT_CATEGORIES = ['mixer', 'audio-interface'];

/**
 * Whether the unit has an audio output DeckChek can measure: true, false or 'conditional'.
 * Explicit profile data wins: `connectivity.audio: null` means "no built-in audio interface" and
 * a numeric `usbChannelsOut` is a researched count. Only an unknown count on a controller is
 * conditional (all-in-one controllers usually have a sound card; pure MIDI surfaces do not).
 */
export function audioOutCapability(profile) {
  const c = profile?.connectivity || {};
  if (Object.hasOwn(c, 'audio') && c.audio === null) return false;
  const out = c.audio?.usbChannelsOut;
  if (Number.isFinite(out)) return out > 0 || AUDIO_OUT_CATEGORIES.includes(profile?.category);
  if (AUDIO_OUT_CATEGORIES.includes(profile?.category)) return true;
  return profile?.category === 'controller' ? 'conditional' : false;
}

/** What the device can do, derived from its profile (SPEC-34 §3). */
export function capabilitiesOf(profile) {
  const c = profile?.connectivity || {};
  const midiBlock = !!(profile?.midi || c.midi);
  const usbMidi = typeof c.midi?.usbMidi === 'boolean' ? c.midi.usbMidi : null;
  const dinMidi = typeof c.midi?.din === 'boolean' ? c.midi.din : null;
  const midi = usbMidi === true || dinMidi === true ? true
    : usbMidi === false && dinMidi === false ? false : midiBlock ? 'conditional' : null;
  return {
    physical: true,
    midi,
    usbMidi,
    dinMidi,
    midiMap: !!profile?.midi,
    audioOut: audioOutCapability(profile),
    audioIn: (c.audio?.usbChannelsIn || 0) > 0,
    driver: (profile?.drivers || []).length > 0,
    software: (profile?.software || []).length > 0,
    timecode: !!profile?.timecode,
    gmSource: profile?.midi?.generalMidi === true,
  };
}

/** capability -> method that must exist in the plan. */
export const REQUIRED_METHOD = Object.freeze({
  physical: 'manual:inspection', driver: 'driver:check', software: 'software:check', midi: 'midi:conformance',
  midiMap: 'midi:coverage', midiTiming: 'midi:latency', audioOut: 'audio:quality', gmSource: 'midi:gm',
});

/** Capabilities a plan must cover (any truthy value, including 'conditional'). */
export const requiredCapabilities = profile => {
  const caps = capabilitiesOf(profile);
  // A map scaffold determines which methods apply, not whether the transport is established.
  const mappedMidi = caps.midiMap ? caps.midi : false;
  return { ...caps, midiMap: mappedMidi, midiTiming: mappedMidi };
};

const plainMethod = t => String(t?.method || '').trim();
const model = p => `${p.manufacturer} ${p.model}`.trim();
const SRC = 'DeckChek test definition';
const AUDIO_CONDITION = 'Only when the unit has its own audio output (built-in sound card or master out). Skip it for a MIDI-only controller.';
const MIDI_CONDITION = "Only when the unit's documentation confirms MIDI output and a supported connection to a host input. Skip if that capability or connection is not established.";

/** Shared connection guidance. A DIN fact does not establish the direction of a device port. */
export function midiPrerequisites(profile) {
  const caps = capabilitiesOf(profile);
  const transport = caps.usbMidi === true ? 'usb' : caps.dinMidi === true ? 'din' : 'unknown';
  return {
    transport,
    connection: transport === 'usb'
      ? `Connect ${model(profile)} directly to a USB port on the computer and close software that holds its MIDI port.`
      : transport === 'din'
        ? `If ${model(profile)} has a documented DIN OUT, connect it to a MIDI interface IN; use the interface's host MIDI input.`
        : `Check ${model(profile)}'s documented MIDI capability and connection first; connect a documented device MIDI output to a supported host input.`,
    input: 'Select the host MIDI input that receives messages from this unit, then exercise controls documented or configured to send MIDI.',
    output: 'Select an output only when the unit has a documented receiving connection. Otherwise leave the output unselected and listen only.',
    timing: transport === 'usb' ? 'Use a direct USB port, not a hub.' : 'Use the documented MIDI connection and an available continuous MIDI control.',
  };
}

function midiParams(profile, capability, conformance = false) {
  const params = capability === 'conditional' ? { condition: MIDI_CONDITION } : {};
  if (conformance && midiPrerequisites(profile).transport !== 'usb') params.outputSelection = 'explicit';
  return params;
}

const BUILDERS = {
  physical: () => ({ id: 'auto-physical-inspection', category: 'mechanical', title: 'Physical inspection', why: 'Catches worn, loose, sticky or damaged parts before any measurement is trusted.', method: 'manual:inspection', params: {}, severity: 'minor',
    steps: ['Connectors and ports are tight, straight and free of corrosion or debris.', 'Faders and knobs move smoothly end to end with no scratching, sticking or play.', 'Jog wheels, platters and encoders turn smoothly and quietly.', 'Buttons, pads and switches click cleanly and return fully.', 'Display, meters and LEDs are even, with no dead or flickering segments.', 'Case, feet and cables have no cracks, loose screws or frayed insulation.'], equipment: [], pass: null, software: null }),
  driver: p => ({ id: 'auto-driver', category: 'driver', title: 'Driver present and healthy', why: 'A missing, unsigned or errored driver is the commonest cause of a device that is not seen or has glitchy audio.', method: 'driver:check', params: {}, severity: 'major',
    steps: [`Connect ${model(p)} directly to the computer with its own cable and power it on.`, 'Run the scan; it matches Device Manager and ASIO entries against the driver names in this profile.'], equipment: [], pass: { metricId: 'driver_present', op: 'equals', value: 1, unit: 'bool', source: SRC }, software: null }),
  software: p => ({ id: 'auto-software', category: 'software', title: 'DJ software log scan', why: 'Crash dumps and error lines in the DJ software logs point at driver, USB or audio problems.', method: 'software:check', params: { software: p.software?.[0]?.name || null }, severity: 'minor',
    steps: ['Close the DJ software so its logs are complete.', 'Run the scan; DeckChek looks at the last 90 days of logs and crash dumps.'], equipment: [], pass: { metricId: 'software_crashes_90d', op: '<=', value: 0, unit: 'count', source: SRC }, software: p.software?.[0]?.name || null }),
  midi: (p, cap) => ({ id: 'auto-midi-conformance', category: 'midi', title: 'MIDI conformance', why: 'Checks valid MIDI 1.0 messages, SysEx and note pairing; an optional Identity Request can add identification evidence.', method: 'midi:conformance', params: midiParams(p, cap, true), severity: 'major',
    steps: [midiPrerequisites(p).connection, midiPrerequisites(p).input, midiPrerequisites(p).output, 'When an output is selected, DeckChek sends an optional universal Identity Request. A reply is not required for passive stream validation.', 'Exercise the available MIDI controls for about 15 seconds.', 'Release everything, then finish the test; the stream is checked message by message.'], equipment: [], pass: null, software: null }),
  midiMap: (p, cap) => ({ id: 'auto-midi-coverage', category: 'midi', title: 'Control coverage', why: 'Checks the controls documented or configured to send MIDI. Learn mode discovers messages and does not prove that every hardware control is mapped.', method: 'midi:coverage', params: midiParams(p, cap), severity: 'major',
    steps: [midiPrerequisites(p).connection, midiPrerequisites(p).input, 'Exercise each documented or configured MIDI control at least once.', 'Finish the test and review the mapped controls or messages discovered in learn mode.'], equipment: [], pass: { metricId: 'midi_controls_seen_percent', op: '>=', value: 100, unit: '%', source: SRC }, software: null }),
  midiTiming: (p, cap) => ({ id: 'auto-midi-timing', category: 'latency', title: 'MIDI timing jitter', why: 'Measures how evenly messages arrive while an available continuous MIDI control is moved.', method: 'midi:latency', params: midiParams(p, cap), severity: 'minor',
    steps: [midiPrerequisites(p).connection, midiPrerequisites(p).input, 'Move an available continuous MIDI control, such as a knob, fader or wheel, at a steady speed for about 10 seconds.', 'Finish the test.'], equipment: [], pass: { metricId: 'midi_jitter_ms', op: '<=', value: 4, unit: 'ms', source: SRC }, software: null }),
  audioOut: (p, cap) => ({ id: 'auto-audio-quality', category: 'audio', title: 'Output audio quality', why: 'Measures what the unit actually delivers: level, distortion, noise, frequency response, channel separation, balance, polarity and dropouts.', method: 'audio:quality', params: cap === 'conditional' ? { levelDbfs: -12, condition: AUDIO_CONDITION } : { levelDbfs: -12 }, severity: cap === 'conditional' ? 'minor' : 'major',
    steps: [`Connect ${model(p)}’s main output to the line inputs of a recording interface (inputs 1–2) with good cables, or use its own USB audio loop-back if it has one.`, 'Set the unit’s master and channel levels to unity (0 dB marks), and set EQ, filter, FX, limiter and sampler to neutral or off.', 'Turn monitors and headphones down; DeckChek never plays louder than −12 dBFS.', 'Choose the output device that carries the test signal and the recording input. Calibrate the interface loopback first on the Calibration screen for the best result.', 'Run the test (about 13 seconds) and do not touch the unit.'], equipment: ['Recording interface with line inputs', '2 audio cables (RCA, TRS or XLR to suit)'], pass: null, software: null }),
  gmSource: p => ({ id: 'auto-general-midi', category: 'midi', title: 'General MIDI sound check', why: 'Confirms the built-in General MIDI sound source answers GM System On, programs, the drum map, controllers and 24-voice polyphony.', method: 'midi:gm', params: {}, severity: 'minor',
    steps: [`Connect ${model(p)} by USB and select its MIDI output port.`, 'Turn the unit’s audio output up to a comfortable level.', 'DeckChek plays ten short sound checks; answer Yes, No or N/A for each.'], equipment: [], pass: { metricId: 'midi_gm_ok_percent', op: '>=', value: 100, unit: '%', source: SRC }, software: null }),
};

/** Add baseline tests for capabilities without one. Hand-written tests always win. Returns a new profile. */
export function completePlan(profile) {
  if (!profile || !Array.isArray(profile.tests)) return profile;
  const caps = requiredCapabilities(profile);
  const have = new Set(profile.tests.map(plainMethod));
  const ids = new Set(profile.tests.map(t => t?.id));
  const added = [];
  for (const [cap, method] of Object.entries(REQUIRED_METHOD)) {
    if (!caps[cap] || have.has(method)) continue;
    const t = BUILDERS[cap](profile, caps[cap]);
    let id = t.id; while (ids.has(id)) id += '-x';
    ids.add(id);
    added.push({ ...t, id, auto: true });
  }
  return { ...profile, tests: added.length ? [...profile.tests, ...added] : profile.tests, autoTests: added.length };
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
  const caps = requiredCapabilities(profile);
  const covered = {};
  for (const [cap, method] of Object.entries(REQUIRED_METHOD)) {
    if (!caps[cap]) continue;
    covered[cap] = methods.has(method);
    if (!covered[cap]) gap('uncovered-capability', `${cap}: no ${method} test`);
  }
  return { gaps, covered, capabilities: caps };
}

/** Coverage matrix over many profiles: rows of {id, model, category, total, hand, auto, gapsBefore, gaps, covered, capabilities}. */
export function coverageMatrix(profiles) {
  return profiles.map(raw => {
    const done = completePlan(raw);
    const before = auditProfile(raw), after = auditProfile(done);
    return { id: raw.id, model: `${raw.manufacturer} ${raw.model}`, category: raw.category, total: done.tests.length, hand: raw.tests.length, auto: done.autoTests || 0, gapsBefore: before.gaps.filter(g => g.code === 'uncovered-capability').length, gaps: after.gaps, covered: after.covered, capabilities: after.capabilities };
  });
}

export const isAutoTest = t => t?.auto === true;
export { parseMethod };
