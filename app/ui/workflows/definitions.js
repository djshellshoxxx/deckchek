// Declarative workflow definitions: modes (tests), setup parameters,
// checklists, wiring hints and the key readouts shown first in results.

const SPEED_MODES = ['Speed & pitch', 'Pitch map', 'Quartz lock', 'Warm-up speed'];

export const PARAMS = [
  { id: 'referenceHz', label: 'Reference tone', unit: 'Hz', type: 'number', value: 1000, min: 20, max: 20000, step: .1, modes: [...SPEED_MODES, 'Channel & cartridge', 'Channel separation'], help: 'Frequency printed on the test-record track (often 1 kHz or 3.15 kHz).' },
  { id: 'nominalRpm', label: 'Nominal speed', type: 'select', value: '33.333333', options: [['33.333333', '33⅓ RPM'], ['45', '45 RPM'], ['78', '78 RPM']], modes: SPEED_MODES },
  { id: 'pitchPosition', label: 'Pitch control position', unit: '%', type: 'number', value: 0, min: -100, max: 100, step: .1, modes: ['Pitch map'], help: 'Where the pitch fader is set for this point.' },
  { id: 'pitchDirection', label: 'Travel direction', type: 'select', value: 'up', options: [['up', 'Up / increasing'], ['down', 'Down / decreasing'], ['unknown', 'Single point']], modes: ['Pitch map'] },
  { id: 'quartzMode', label: 'Quartz state', type: 'select', value: 'locked', options: [['locked', 'Quartz/reset engaged'], ['free', 'Fader centred, lock off']], modes: ['Quartz lock'], help: 'Repeat both states several times — DeckChek accumulates mean error and repeatability.' },
  { id: 'warmupElapsed', label: 'Elapsed since cold start', unit: 'min', type: 'number', value: 0, min: 0, max: 120, step: .5, modes: ['Warm-up speed'], help: 'Use the same track and route for every checkpoint.' },
  { id: 'stopSec', label: 'Brake marker', unit: 's', type: 'number', value: 3, min: 0, step: .01, modes: ['Startup & brake'], help: 'Time in the recording where you pressed stop/brake.' },
  { id: 'separationActive', label: 'Isolated test-track channel', type: 'select', value: 'left', options: [['left', 'Left only'], ['right', 'Right only']], modes: ['Channel separation'], help: 'Record both the left-only and right-only tracks to get azimuth evidence.' },
  { id: 'recordTitle', label: 'Record title', type: 'text', value: '', modes: ['Vinyl side scan'], help: 'Used to match repeat scans of the same side.' },
  { id: 'sideLabel', label: 'Side', type: 'text', value: 'A', modes: ['Vinyl side scan'] },
];

const WIRING_TT = [['Turntable', 'phono / line out'], ['Preamp', 'RIAA if phono'], ['Interface', 'line in, stereo']];
const WIRING_MIXER = [['Source', 'deck / player'], ['Mixer', 'REC or booth out'], ['Interface', 'line in, stereo']];

export const WORKFLOWS = [
  {
    id: 'quick', title: 'Quick Check', short: 'Quick', icon: 'quick', seconds: 10,
    blurb: 'Fast signal-health check: levels, balance, polarity, hum, clipping and dropouts.',
    modes: [
      { test: 'Stereo balance', label: 'Signal health', desc: 'Levels, balance, correlation, DC, clipping, dropouts.' },
      { test: 'Ground & hum isolation', label: 'Ground & hum', desc: 'Mains-family hum and noise-floor evidence.' },
      { test: 'Vibration check', label: 'Vibration', desc: 'Low-frequency energy, feedback and booth resonance.' },
    ],
    needs: ['Any music or a test tone playing', 'Stereo line-level connection', 'Input peaks between −18 and −3 dBFS'],
    wiring: WIRING_MIXER,
    key: {
      'Stereo balance': ['channel_balance_db', 'left_level_dbfs', 'right_level_dbfs', 'correlation', 'clipped_samples', 'dropout_count'],
      'Ground & hum isolation': ['left_hum_dbfs', 'right_hum_dbfs', 'channel_balance_db', 'clipped_samples', 'left_level_dbfs', 'right_level_dbfs'],
      'Vibration check': ['low_frequency_energy_dbfs', 'left_level_dbfs', 'right_level_dbfs', 'dropout_count'],
    },
  },
  {
    id: 'speed', title: 'Speed & Pitch', short: 'Speed', icon: 'speed', seconds: 20,
    blurb: 'Platter speed, wow & flutter proxy, pitch-fader mapping, quartz lock, warm-up drift and start/brake timing.',
    modes: [
      { test: 'Speed & pitch', label: 'Speed & stability', desc: 'Mean speed error and short-term variation.' },
      { test: 'Pitch map', label: 'Pitch map', desc: 'One point per capture — build a map across fader positions.' },
      { test: 'Quartz lock', label: 'Quartz lock', desc: 'Free-centre vs quartz/reset repeatability.' },
      { test: 'Warm-up speed', label: 'Warm-up', desc: 'Speed checkpoints from cold start.' },
      { test: 'Startup & brake', label: 'Start & brake', desc: 'Envelope rise/fall timing around a brake marker.' },
    ],
    needs: ['Test record with a steady reference tone', 'Deck at operating temperature (except warm-up)', 'Pitch fader at the position you are testing'],
    wiring: WIRING_TT,
    key: {
      'Speed & pitch': ['pitch_percent', 'rpm', 'wow_flutter_rms_percent', 'speed_drift_percent', 'peak_speed_deviation_percent', 'speed_modulation_1x_percent'],
      'Pitch map': ['measured_pitch_percent', 'pitch_position', 'pitch_map_max_error', 'pitch_map_hysteresis', 'pitch_map_slope', 'pitch_map_nonlinearity'],
      'Quartz lock': ['quartz_speed_error_percent', 'quartz_rpm', 'quartz_lock_mean_error_percent', 'quartz_lock_repeat_std_percent', 'center_to_lock_delta_percent'],
      'Warm-up speed': ['warmup_speed_error_percent', 'warmup_rpm', 'warmup_elapsed_min', 'warmup_drift_percent_per_min', 'warmup_trend_r2'],
      'Startup & brake': ['startup_envelope_90_sec', 'brake_envelope_10_sec', 'transition_stop_marker_sec'],
    },
  },
  {
    id: 'cartridge', title: 'Cartridge', short: 'Cartridge', icon: 'cartridge', seconds: 10,
    blurb: 'Reference-tone distortion per channel and isolated-track channel separation with azimuth evidence.',
    modes: [
      { test: 'Channel & cartridge', label: 'Distortion (THD)', desc: 'Harmonic distortion of a clean reference tone.' },
      { test: 'Channel separation', label: 'Channel separation', desc: 'Crosstalk from a left-only or right-only track.' },
    ],
    needs: ['Clean stylus, correct tracking force', 'Test record with reference / isolated-channel tracks', 'Gain set well below clipping'],
    wiring: WIRING_TT,
    key: {
      'Channel & cartridge': ['left_thd_percent', 'right_thd_percent', 'channel_balance_db', 'clipped_samples'],
      'Channel separation': ['channel_separation_db', 'azimuth_separation_asymmetry_db', 'channel_balance_db'],
    },
  },
  {
    id: 'dvs', title: 'DVS Timecode', short: 'DVS', icon: 'dvs', seconds: 15,
    blurb: 'Generic control-signal integrity: scope shape, balance, gaps, hum and clipping.',
    modes: [{ test: 'DVS signal', label: 'Timecode integrity', desc: 'Works with any sine-pair control vinyl; vendor decoding is not used.' }],
    needs: ['Control vinyl playing at normal speed', 'DVS interface input in Phono/Line as appropriate', 'Needle on an unworn region for a baseline'],
    wiring: [['Turntable', 'control vinyl'], ['DVS interface', 'thru / input'], ['Interface', 'line in, stereo']],
    key: { 'DVS signal': ['dvs_integrity_score', 'dvs_scope_circularity', 'dvs_missing_windows', 'channel_balance_db', 'dvs_ellipse_axis_ratio', 'dvs_ellipse_rotation_deg'] },
  },
  {
    id: 'vinyl', title: 'Vinyl Scan', short: 'Vinyl', icon: 'vinyl', seconds: 60,
    blurb: 'Full-side condition scan: transient map, rumble, hum, recurring events and repeat-scan comparison.',
    modes: [{ test: 'Vinyl side scan', label: 'Side scan', desc: 'Scan again after cleaning to separate dust from damage.' }],
    needs: ['Whole side recorded (file recommended for full sides)', 'Same deck and cartridge for repeat scans', 'Record title and side filled in'],
    wiring: WIRING_TT,
    key: { 'Vinyl side scan': ['vinyl_condition_score', 'vinyl_transients_per_min', 'vinyl_event_count', 'vinyl_rumble_dbfs', 'repeat_scan_persistent_events', 'repeat_scan_new_events'] },
  },
];

export const paramsForTest = test => PARAMS.filter(p => p.modes.includes(test));
