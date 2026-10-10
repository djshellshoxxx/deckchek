//! Capped native audio output (FS-00 §4.9, AC-6).
//!
//! The first Rust output path. Every sample DeckChek plays through cpal goes
//! through [`Renderer::render_safe`], which applies, in order:
//!
//! 1. sanitising (non-finite source samples become 0),
//! 2. a per-sample gain that only ever moves along a linear ramp
//!    (level changes >= [`MIN_RAMP_MS`], stop fade [`STOP_FADE_MS`]),
//! 3. a per-sample limiter at `cap = min(callCap, ABS_MAX_DBFS)` (FS-00 §6.3),
//! 4. a final hard clamp at [`ABS_MAX_AMP`] (-12 dBFS) on the whole block.
//!
//! None of this can be configured from JS: the IPC types carry a level and an
//! optional cap, and both are clamped here. Only one voice plays at a time (a
//! new play request fades out and closes the previous one first), so two
//! DeckChek streams can never sum above the cap at the device. That holds
//! across engines too: the global engine and the FS-11 latency tuner's engine
//! share one [`OutputGroup`], whose single voice slot and kill switch make a
//! play on either engine silence the other's voice first, and make window
//! close, exit and panics silence both.
//!
//! Stop paths, all of which end in silence:
//! * `audio_stop` / `audio_stop_all`: 20 ms linear fade, then the stream is
//!   closed (or hard-muted if the callback stalls, see [`STOP_WAIT`]);
//! * main-window close and `RunEvent::Exit`/`ExitRequested`: [`on_run_event`];
//! * any panic in the process: [`install_panic_guard`] latches a kill switch
//!   that every callback reads lock-free (output becomes 0 within
//!   [`CONTROL_POLL_FRAMES`] frames); output stays disabled until restart;
//! * a panic inside the audio callback: caught, block zeroed, voice faulted;
//! * a device/stream error: callback outputs 0, the watchdog closes the stream;
//! * 60 s without a level change on a continuous voice (tone or looped
//!   buffer): the watchdog fades it out ([`INACTIVITY_MUTE_SECS`]).
//!
//! The DSP (`Renderer`, generators) and the voice state machine (`Engine`)
//! are device-independent and unit-tested on rendered buffers; the cpal
//! backend is a thin adapter whose device tests are `#[ignore]`d.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    panic::{catch_unwind, AssertUnwindSafe},
    sync::{
        atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicU8, Ordering::SeqCst},
        mpsc, Arc, Mutex, MutexGuard, Once, OnceLock,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

// ------------------------------------------------------------------ constants

/// Absolute output ceiling. Not configurable.
pub const ABS_MAX_DBFS: f32 = -12.0;
/// Linear amplitude of [`ABS_MAX_DBFS`] (10^(-12/20) = 0.2511886431...),
/// rounded *down* so the constant never exceeds the true cap.
pub const ABS_MAX_AMP: f32 = 0.251_188_6;
/// Levels at or below this are exact silence (gain 0).
pub const SILENCE_DBFS: f32 = -120.0;
pub const MIN_RAMP_MS: f32 = 10.0;
pub const MAX_RAMP_MS: f32 = 5000.0;
pub const DEFAULT_RAMP_MS: f32 = 50.0;
/// Fade used by every stop path (FS-15: "fade 20 ms"; AC-6: silence <= 50 ms).
pub const STOP_FADE_MS: f32 = 20.0;
/// Continuous voices without a level change for this long are faded out.
pub const INACTIVITY_MUTE_SECS: u64 = 60;
/// Longest buffer accepted by `audio_play_buffer` (120 s at 48 kHz).
pub const MAX_BUFFER_FRAMES: usize = 48_000 * 120;
pub const MIN_BUFFER_RATE: u32 = 8_000;
pub const MAX_BUFFER_RATE: u32 = 384_000;
pub const MIN_TONE_HZ: f64 = 10.0;
pub const MAX_TONE_HZ: f64 = 20_000.0;
/// Generators never go above this fraction of the device rate (aliasing).
const MAX_TONE_NYQUIST_FRACTION: f64 = 0.45;
/// The renderer re-reads its control block every this many frames.
pub const CONTROL_POLL_FRAMES: usize = 32;
/// Longest a stop waits for the fade before hard-muting and closing anyway.
pub const STOP_WAIT: Duration = Duration::from_millis(150);
const OPEN_TIMEOUT: Duration = Duration::from_secs(10);
const WATCHDOG_INTERVAL: Duration = Duration::from_millis(200);
const RECENT_ENDED: usize = 16;
/// Target RMS of the noise generator before gain: crest factor ~4 (12 dB), so
/// `levelDbfs` is the nominal peak; rarer excursions are clipped by the limiter.
const NOISE_RMS: f64 = 0.25;
const MAIN_WINDOW_LABEL: &str = "main";

// ------------------------------------------------------------- level helpers

/// dBFS to linear amplitude; non-finite or <= [`SILENCE_DBFS`] gives 0.
pub fn db_to_amp(db: f32) -> f32 {
    if db.is_nan() || db <= SILENCE_DBFS {
        0.0
    } else if db == f32::INFINITY {
        f32::INFINITY
    } else {
        10f32.powf(db / 20.0)
    }
}

/// The cap a voice actually uses: `min(callCap, ABS_MAX_DBFS)`, defaulting to
/// the absolute cap. NaN (never produced by JSON) is treated as silence.
pub fn effective_cap_dbfs(call_cap: Option<f32>) -> f32 {
    match call_cap {
        None => ABS_MAX_DBFS,
        Some(c) if c.is_nan() => SILENCE_DBFS,
        Some(c) => c.clamp(SILENCE_DBFS, ABS_MAX_DBFS),
    }
}

/// Linear limiter threshold for a cap in dBFS, never above [`ABS_MAX_AMP`].
pub fn cap_amp(cap_dbfs: f32) -> f32 {
    db_to_amp(cap_dbfs).min(ABS_MAX_AMP)
}

/// Clamp a requested level to `[SILENCE_DBFS, cap]`. NaN is an error.
pub fn clamp_level_dbfs(level: f32, cap_dbfs: f32) -> Result<f32, String> {
    if level.is_nan() {
        return Err("AUDIO_OUT_INVALID: levelDbfs must be a number".into());
    }
    Ok(level.min(effective_cap_dbfs(Some(cap_dbfs))).max(SILENCE_DBFS))
}

/// Ramp duration in ms, never below [`MIN_RAMP_MS`].
pub fn clamp_ramp_ms(ms: Option<f32>) -> f32 {
    match ms {
        Some(v) if v.is_finite() => v.clamp(MIN_RAMP_MS, MAX_RAMP_MS),
        _ => DEFAULT_RAMP_MS,
    }
}

/// Number of samples a ramp of `ms` lasts at `rate` (at least 1).
pub fn ramp_samples(ms: f32, rate: u32) -> u32 {
    ((ms as f64 * rate as f64 / 1000.0).round() as u32).max(1)
}

// --------------------------------------------------------------- generators

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ToneType {
    Sine,
    Pinkband,
    Chirp,
}

/// Direct-form-I biquad (f64 state).
#[derive(Debug, Clone, Default)]
pub struct Biquad {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}

impl Biquad {
    /// RBJ band-pass with 0 dB peak gain.
    fn bandpass(fc: f64, q: f64, fs: f64) -> Self {
        let w0 = 2.0 * std::f64::consts::PI * fc / fs;
        let alpha = w0.sin() / (2.0 * q);
        let a0 = 1.0 + alpha;
        Self {
            b0: alpha / a0,
            b1: 0.0,
            b2: -alpha / a0,
            a1: -2.0 * w0.cos() / a0,
            a2: (1.0 - alpha) / a0,
            ..Self::default()
        }
    }

    fn run(&mut self, x: f64) -> f64 {
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}

/// Deterministic xorshift64* white noise in [-1, 1).
#[derive(Debug, Clone)]
pub struct Noise(u64);

impl Noise {
    fn next(&mut self) -> f64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        let v = x.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 11; // 53 bits
        v as f64 / (1u64 << 52) as f64 - 1.0
    }
}

/// Per-stage Q of the two cascaded band-passes so the cascade's -3 dB width is
/// one third of an octave: Q(1/3 oct) = 4.318, cascade narrows by
/// sqrt(sqrt(2) - 1) = 0.6436, so each stage uses 4.318 * 0.6436.
const THIRD_OCTAVE_STAGE_Q: f64 = 4.318 * 0.6436;

pub enum Source {
    Sine { phase: f64, step: f64 },
    PinkBand { noise: Noise, stages: [Biquad; 2], scale: f64 },
    Chirp { phase: f64, f0: f64, ratio_ln: f64, n: u64, t: u64, fs: f64 },
    Buffer { left: Vec<f32>, right: Vec<f32>, pos: f64, step: f64, looped: bool },
    #[cfg(test)]
    Test(Box<dyn FnMut() -> Option<(f32, f32)> + Send>),
}

fn nyquist_clamp(hz: f64, fs: f64) -> f64 {
    hz.clamp(MIN_TONE_HZ, (fs * MAX_TONE_NYQUIST_FRACTION).min(MAX_TONE_HZ))
}

impl Source {
    pub fn sine(freq_hz: f64, fs: u32) -> Self {
        let fs = fs as f64;
        Source::Sine { phase: 0.0, step: nyquist_clamp(freq_hz, fs) / fs }
    }

    /// One-third-octave noise band centred on `freq_hz`, scaled so its RMS is
    /// [`NOISE_RMS`] (nominal peak 1.0). Within a third of an octave the pink
    /// (-3 dB/oct) tilt is < 0.5 dB, so band-passed white noise is used.
    pub fn pink_band(freq_hz: f64, fs: u32, seed: u64) -> Self {
        let fs = fs as f64;
        let fc = nyquist_clamp(freq_hz, fs);
        let mut noise = Noise(seed | 1);
        let mut stages = [
            Biquad::bandpass(fc, THIRD_OCTAVE_STAGE_Q, fs),
            Biquad::bandpass(fc, THIRD_OCTAVE_STAGE_Q, fs),
        ];
        // Warm the filters up for 1 s and measure the RMS to calibrate.
        let n = fs as usize;
        let mut sum = 0.0;
        for _ in 0..n {
            let a = stages[0].run(noise.next());
            let y = stages[1].run(a);
            sum += y * y;
        }
        let rms = (sum / n as f64).sqrt();
        let scale = if rms > 1e-12 { NOISE_RMS / rms } else { 0.0 };
        Source::PinkBand { noise, stages, scale }
    }

    /// Exponential sweep `f0 -> f1` over `duration_sec`, repeated with
    /// continuous phase.
    pub fn chirp(f0: f64, f1: f64, duration_sec: f64, fs: u32) -> Self {
        let fsf = fs as f64;
        let f0 = nyquist_clamp(f0, fsf);
        let f1 = nyquist_clamp(f1, fsf);
        let n = ((duration_sec.clamp(0.05, 60.0)) * fsf).round().max(1.0) as u64;
        Source::Chirp { phase: 0.0, f0, ratio_ln: (f1 / f0).ln(), n, t: 0, fs: fsf }
    }

    /// A stereo buffer at `buffer_rate`, linearly resampled to `device_rate`.
    /// An empty `right` duplicates `left`.
    pub fn buffer(left: Vec<f32>, right: Vec<f32>, buffer_rate: u32, device_rate: u32, looped: bool) -> Self {
        let right = if right.is_empty() { left.clone() } else { right };
        Source::Buffer { left, right, pos: 0.0, step: buffer_rate as f64 / device_rate.max(1) as f64, looped }
    }

    /// Next stereo frame at nominal full scale; `None` once a one-shot buffer ends.
    pub fn next(&mut self) -> Option<(f32, f32)> {
        use std::f64::consts::TAU;
        match self {
            Source::Sine { phase, step } => {
                let v = (TAU * *phase).sin() as f32;
                *phase = (*phase + *step).fract();
                Some((v, v))
            }
            Source::PinkBand { noise, stages, scale } => {
                let a = stages[0].run(noise.next());
                let y = (stages[1].run(a) * *scale) as f32;
                Some((y, y))
            }
            Source::Chirp { phase, f0, ratio_ln, n, t, fs } => {
                let v = (TAU * *phase).sin() as f32;
                let f = *f0 * (*ratio_ln * (*t as f64 / *n as f64)).exp();
                *phase = (*phase + f / *fs).fract();
                *t += 1;
                if *t >= *n {
                    *t = 0;
                }
                Some((v, v))
            }
            Source::Buffer { left, right, pos, step, looped } => {
                let len = left.len().min(right.len());
                if len == 0 {
                    return None;
                }
                if *pos >= len as f64 {
                    if !*looped {
                        return None;
                    }
                    *pos %= len as f64;
                }
                let i = *pos as usize;
                let frac = (*pos - i as f64) as f32;
                let j = if i + 1 < len { i + 1 } else if *looped { 0 } else { i };
                let l = left[i] + (left[j] - left[i]) * frac;
                let r = right[i] + (right[j] - right[i]) * frac;
                *pos += *step;
                Some((l, r))
            }
            #[cfg(test)]
            Source::Test(f) => f(),
        }
    }
}

// ----------------------------------------------------------- voice control

/// Why the renderer must output silence right now (no fade).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Fault {
    Clear = 0,
    Device = 1,
    RenderPanic = 2,
    HardMute = 3,
}

/// Lock-free control block shared by the engine (writer) and the audio
/// callback (reader). The callback never locks anything.
#[derive(Debug, Default)]
pub struct VoiceControl {
    level_bits: AtomicU32,
    level_seq: AtomicU64,
    stop: AtomicBool,
    silent: AtomicBool,
    finished: AtomicBool,
    /// Silenced by a play on another engine of its [`OutputGroup`].
    replaced: AtomicBool,
    fault: AtomicU8,
    message: Mutex<Option<String>>,
}

impl VoiceControl {
    fn new(level_dbfs: f32) -> Self {
        let c = Self::default();
        c.level_bits.store(level_dbfs.to_bits(), SeqCst);
        c
    }

    fn set_level(&self, level_dbfs: f32) {
        self.level_bits.store(level_dbfs.to_bits(), SeqCst);
        self.level_seq.fetch_add(1, SeqCst);
    }

    fn request_stop(&self) {
        self.stop.store(true, SeqCst);
    }

    /// Marks the voice faulted; the renderer outputs 0 from its next poll.
    /// Called from cpal's error callback (not the data callback).
    pub fn report_fault(&self, fault: Fault, message: impl Into<String>) {
        let _ = self.fault.compare_exchange(Fault::Clear as u8, fault as u8, SeqCst, SeqCst);
        if let Ok(mut m) = self.message.lock() {
            m.get_or_insert_with(|| message.into());
        }
    }

    pub fn fault(&self) -> Fault {
        match self.fault.load(SeqCst) {
            1 => Fault::Device,
            2 => Fault::RenderPanic,
            3 => Fault::HardMute,
            _ => Fault::Clear,
        }
    }

    pub fn is_silent(&self) -> bool {
        self.silent.load(SeqCst)
    }

    fn message(&self) -> Option<String> {
        self.message.lock().ok().and_then(|m| m.clone())
    }
}

// ----------------------------------------------------------------- renderer

/// Per-voice DSP: source -> linear gain ramp -> limiter -> hard cap.
pub struct Renderer {
    source: Source,
    ctl: Arc<VoiceControl>,
    kill: Arc<AtomicBool>,
    cap_amp: f32,
    ramp_len: u32,
    stop_len: u32,
    gain: f32,
    target: f32,
    ramp_from: f32,
    ramp_total: u32,
    ramp_left: u32,
    seen_seq: u64,
    stopping: bool,
    done: bool,
}

impl Renderer {
    /// `level_dbfs`/`cap_dbfs` are clamped again here; the voice starts at
    /// gain 0 and ramps up over `ramp_ms` (>= [`MIN_RAMP_MS`]).
    pub fn new(
        source: Source,
        ctl: Arc<VoiceControl>,
        kill: Arc<AtomicBool>,
        rate: u32,
        cap_dbfs: f32,
        ramp_ms: f32,
    ) -> Self {
        let cap_amp = cap_amp(effective_cap_dbfs(Some(cap_dbfs)));
        let mut r = Self {
            source,
            cap_amp,
            ramp_len: ramp_samples(clamp_ramp_ms(Some(ramp_ms)), rate),
            stop_len: ramp_samples(STOP_FADE_MS, rate),
            gain: 0.0,
            target: 0.0,
            ramp_from: 0.0,
            ramp_total: 1,
            ramp_left: 0,
            seen_seq: ctl.level_seq.load(SeqCst),
            stopping: false,
            done: false,
            ctl,
            kill,
        };
        let level = f32::from_bits(r.ctl.level_bits.load(SeqCst));
        r.ramp_to(db_to_amp(level).min(cap_amp), r.ramp_len);
        r
    }

    fn ramp_to(&mut self, target: f32, len: u32) {
        self.target = target;
        self.ramp_from = self.gain;
        self.ramp_total = len.max(1);
        self.ramp_left = self.ramp_total;
    }

    fn go_silent(&mut self) {
        self.gain = 0.0;
        self.target = 0.0;
        self.ramp_left = 0;
        self.done = true;
        self.ctl.silent.store(true, SeqCst);
    }

    fn poll(&mut self) {
        if self.done {
            return;
        }
        if self.kill.load(SeqCst) || self.ctl.fault.load(SeqCst) != Fault::Clear as u8 {
            self.go_silent();
            return;
        }
        if self.ctl.stop.load(SeqCst) {
            if !self.stopping {
                self.stopping = true;
                self.ramp_to(0.0, self.stop_len);
            }
            return;
        }
        let seq = self.ctl.level_seq.load(SeqCst);
        if seq != self.seen_seq {
            self.seen_seq = seq;
            let level = f32::from_bits(self.ctl.level_bits.load(SeqCst));
            self.ramp_to(db_to_amp(level).min(self.cap_amp), self.ramp_len);
        }
    }

    /// Renders interleaved frames into `out`. Channel 0 = left, 1 = right,
    /// others silent; a mono device gets (l + r) / 2.
    pub fn render(&mut self, out: &mut [f32], channels: usize) {
        if channels == 0 {
            out.fill(0.0);
            return;
        }
        for (i, frame) in out.chunks_mut(channels).enumerate() {
            if i % CONTROL_POLL_FRAMES == 0 {
                self.poll();
            }
            if self.done {
                frame.fill(0.0);
                continue;
            }
            let (l, r) = match self.source.next() {
                Some(v) => v,
                None => {
                    self.ctl.finished.store(true, SeqCst);
                    self.go_silent();
                    frame.fill(0.0);
                    continue;
                }
            };
            if self.ramp_left > 0 {
                self.ramp_left -= 1;
                // Computed from the ramp start (no accumulated rounding).
                let k = (self.ramp_total - self.ramp_left) as f32 / self.ramp_total as f32;
                self.gain = self.ramp_from + (self.target - self.ramp_from) * k;
            }
            let (g, cap) = (self.gain, self.cap_amp);
            let lim = |x: f32| -> f32 {
                let x = if x.is_finite() { x } else { 0.0 };
                let y = x * g;
                if y.is_finite() {
                    y.clamp(-cap, cap)
                } else {
                    0.0
                }
            };
            let (l, r) = (lim(l), lim(r));
            if channels == 1 {
                frame[0] = 0.5 * (l + r);
            } else {
                frame[0] = l;
                frame[1] = r;
                frame[2..].fill(0.0);
            }
            if self.stopping && self.ramp_left == 0 {
                self.go_silent();
            }
        }
    }

    /// What the audio callback calls: [`Self::render`] behind `catch_unwind`
    /// (a panic zeroes the block and faults the voice), followed by the final
    /// hard clamp at [`ABS_MAX_AMP`].
    pub fn render_safe(&mut self, out: &mut [f32], channels: usize) {
        if catch_unwind(AssertUnwindSafe(|| self.render(out, channels))).is_err() {
            out.fill(0.0);
            self.ctl.report_fault(Fault::RenderPanic, "panic in the audio output callback");
            self.go_silent();
        }
        hard_cap(out);
    }
}

/// The absolute ceiling, applied to every sample after the limiter.
pub fn hard_cap(out: &mut [f32]) {
    for s in out.iter_mut() {
        *s = if s.is_finite() { s.clamp(-ABS_MAX_AMP, ABS_MAX_AMP) } else { 0.0 };
    }
}

// ------------------------------------------------------------- IPC types

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BufferInput {
    pub sample_rate: u32,
    pub left: Vec<f32>,
    #[serde(default)]
    pub right: Vec<f32>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BufferOpts {
    pub level_dbfs: f32,
    #[serde(default)]
    pub cap_dbfs: Option<f32>,
    #[serde(default, rename = "loop")]
    pub looped: bool,
    #[serde(default)]
    pub ramp_ms: Option<f32>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToneSpec {
    #[serde(rename = "type")]
    pub kind: ToneType,
    #[serde(default)]
    pub freq_hz: Option<f64>,
    /// Chirp end frequency (default 20 kHz, limited to 0.45 x device rate).
    #[serde(default)]
    pub end_hz: Option<f64>,
    /// Chirp sweep duration (default 2 s, 0.05..60 s).
    #[serde(default)]
    pub duration_sec: Option<f64>,
    pub level_dbfs: f32,
    #[serde(default)]
    pub cap_dbfs: Option<f32>,
    #[serde(default)]
    pub ramp_ms: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputInfo {
    pub name: String,
    pub is_default: bool,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub device_name: String,
    pub sample_rate: u32,
    pub channels: u16,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayInfo {
    pub handle: u64,
    pub device_name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub level_dbfs: f32,
    pub cap_dbfs: f32,
    pub ramp_ms: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelResult {
    pub handle: u64,
    pub level_dbfs: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EndReason {
    Stopped,
    Replaced,
    Finished,
    Inactivity,
    DeviceError,
    RenderFault,
    WindowClosed,
    AppExit,
    Disabled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndedVoice {
    pub handle: u64,
    pub reason: EndReason,
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveVoice {
    pub handle: u64,
    pub kind: String,
    pub device_name: String,
    pub sample_rate: u32,
    pub level_dbfs: f32,
    pub cap_dbfs: f32,
    pub stopping: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutStatus {
    pub abs_max_dbfs: f32,
    pub disabled: bool,
    pub active: Option<ActiveVoice>,
    pub recent: Vec<EndedVoice>,
}

/// A validated play request.
#[derive(Debug, Clone)]
pub enum PlayRequest {
    Tone(ToneSpec),
    Buffer(BufferInput, BufferOpts),
}

impl PlayRequest {
    fn level_cap_ramp(&self) -> (f32, Option<f32>, Option<f32>) {
        match self {
            PlayRequest::Tone(s) => (s.level_dbfs, s.cap_dbfs, s.ramp_ms),
            PlayRequest::Buffer(_, o) => (o.level_dbfs, o.cap_dbfs, o.ramp_ms),
        }
    }

    fn kind(&self) -> String {
        match self {
            PlayRequest::Tone(s) => match s.kind {
                ToneType::Sine => "sine",
                ToneType::Pinkband => "pinkband",
                ToneType::Chirp => "chirp",
            }
            .to_string(),
            PlayRequest::Buffer(_, o) => if o.looped { "bufferLoop" } else { "buffer" }.to_string(),
        }
    }

    /// Tones and looped buffers are continuous and subject to the inactivity mute.
    fn continuous(&self) -> bool {
        match self {
            PlayRequest::Tone(_) => true,
            PlayRequest::Buffer(_, o) => o.looped,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        let (level, cap, ramp) = self.level_cap_ramp();
        let bad = |m: &str| Err(format!("AUDIO_OUT_INVALID: {m}"));
        if level.is_nan() {
            return bad("levelDbfs must be a number");
        }
        if cap.is_some_and(|c| c.is_nan()) || ramp.is_some_and(|r| r.is_nan()) {
            return bad("capDbfs and rampMs must be numbers");
        }
        match self {
            PlayRequest::Tone(s) => {
                for (name, v) in [("freqHz", s.freq_hz), ("endHz", s.end_hz)] {
                    if let Some(hz) = v {
                        if !(MIN_TONE_HZ..=MAX_TONE_HZ).contains(&hz) {
                            return bad(&format!("{name} must be between {MIN_TONE_HZ} and {MAX_TONE_HZ} Hz"));
                        }
                    }
                }
                if s.duration_sec.is_some_and(|d| !(0.05..=60.0).contains(&d)) {
                    return bad("durationSec must be between 0.05 and 60 s");
                }
            }
            PlayRequest::Buffer(b, _) => {
                if !(MIN_BUFFER_RATE..=MAX_BUFFER_RATE).contains(&b.sample_rate) {
                    return bad("sampleRate must be between 8000 and 384000 Hz");
                }
                if b.left.is_empty() {
                    return bad("buffer is empty");
                }
                if !b.right.is_empty() && b.right.len() != b.left.len() {
                    return bad("left and right must have the same length");
                }
                let max = (MAX_BUFFER_FRAMES as u64 * b.sample_rate as u64 / 48_000) as usize;
                if b.left.len() > max {
                    return bad("buffer is longer than 120 s");
                }
            }
        }
        Ok(())
    }

    /// Builds the source for a device running at `rate`.
    fn into_source(self, rate: u32, seed: u64) -> Source {
        match self {
            PlayRequest::Tone(s) => match s.kind {
                ToneType::Sine => Source::sine(s.freq_hz.unwrap_or(1000.0), rate),
                ToneType::Pinkband => Source::pink_band(s.freq_hz.unwrap_or(1000.0), rate, seed),
                ToneType::Chirp => Source::chirp(
                    s.freq_hz.unwrap_or(20.0),
                    s.end_hz.unwrap_or(MAX_TONE_HZ),
                    s.duration_sec.unwrap_or(2.0),
                    rate,
                ),
            },
            PlayRequest::Buffer(b, o) => Source::buffer(b.left, b.right, b.sample_rate, rate, o.looped),
        }
    }
}

// ------------------------------------------------------------------ engine

/// Builds the renderer once the backend knows the device rate and channels.
pub type MakeRenderer = Box<dyn FnOnce(u32, u16) -> Result<Renderer, String> + Send>;

/// An open output stream. `close` must stop the device callback before it
/// returns (cpal: drop the stream).
pub trait Playing: Send {
    fn close(self: Box<Self>);
}

/// Opens output streams. The engine never touches cpal directly.
pub trait Backend: Send + Sync {
    fn open(
        &self,
        device: Option<String>,
        ctl: Arc<VoiceControl>,
        make: MakeRenderer,
    ) -> Result<(StreamInfo, Box<dyn Playing>), String>;
}

struct Voice {
    handle: u64,
    kind: String,
    info: StreamInfo,
    ctl: Arc<VoiceControl>,
    playing: Box<dyn Playing>,
    cap_dbfs: f32,
    level_dbfs: f32,
    continuous: bool,
    last_activity_ms: u64,
}

/// Fades `ctl` out from outside its engine (no engine lock), hard-muting it
/// if the renderer does not report silence within [`STOP_WAIT`]. Its engine
/// reaps the voice as `Replaced` on its next tick.
fn silence_voice(ctl: &VoiceControl) {
    ctl.replaced.store(true, SeqCst);
    ctl.request_stop();
    let deadline = Instant::now() + STOP_WAIT;
    while !ctl.is_silent() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(1));
    }
    if !ctl.is_silent() {
        ctl.fault.compare_exchange(Fault::Clear as u8, Fault::HardMute as u8, SeqCst, SeqCst).ok();
    }
}

/// Engines that drive the same speakers: one kill switch and one audible
/// voice for all of them, so the -12 dBFS cap holds for their sum (BUG-04).
pub struct OutputGroup {
    kill: Arc<AtomicBool>,
    /// (engine id, control) of the voice allowed to sound.
    voice: Mutex<Option<(u64, Arc<VoiceControl>)>>,
}

impl OutputGroup {
    pub fn new() -> Arc<Self> {
        Arc::new(Self { kill: Arc::new(AtomicBool::new(false)), voice: Mutex::new(None) })
    }

    /// Lock-free emergency silence for every member engine. Latched.
    pub fn kill_all(&self) {
        self.kill.store(true, SeqCst);
    }

    #[cfg(test)]
    pub(crate) fn is_killed(&self) -> bool {
        self.kill.load(SeqCst)
    }

    /// Makes `ctl` the group's voice, silencing another engine's voice first.
    /// Called before the new stream opens, so two plays racing on two engines
    /// still end with only the later one audible.
    fn claim(&self, engine: u64, ctl: &Arc<VoiceControl>) {
        let previous = lock(&self.voice).replace((engine, ctl.clone()));
        if let Some((owner, other)) = previous {
            if owner != engine && !Arc::ptr_eq(&other, ctl) {
                silence_voice(&other);
            }
        }
    }

    /// Forgets `ctl` once its voice has ended.
    fn release(&self, ctl: &Arc<VoiceControl>) {
        let mut slot = lock(&self.voice);
        if slot.as_ref().is_some_and(|(_, c)| Arc::ptr_eq(c, ctl)) {
            *slot = None;
        }
    }

    /// Fades out whichever member engine's voice is sounding (window close,
    /// exit). Never waits on an engine lock.
    pub fn silence_all(&self) {
        let current = lock(&self.voice).take();
        if let Some((_, ctl)) = current {
            silence_voice(&ctl);
        }
    }
}

static NEXT_ENGINE_ID: AtomicU64 = AtomicU64::new(1);

/// Voice state machine: at most one voice, every exit path ends in silence.
pub struct Engine {
    id: u64,
    group: Option<Arc<OutputGroup>>,
    backend: Box<dyn Backend>,
    kill: Arc<AtomicBool>,
    active: Mutex<Option<Voice>>,
    /// Bumped by every play and stop-all; an open that finishes under an older
    /// generation is discarded.
    generation: AtomicU64,
    recent: Mutex<VecDeque<EndedVoice>>,
    next_handle: AtomicU64,
    clock: Box<dyn Fn() -> u64 + Send + Sync>,
}

/// Locks ignoring poisoning: stop paths must never fail because some other
/// thread panicked while holding the lock.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl Engine {
    pub fn new(backend: Box<dyn Backend>) -> Self {
        let epoch = Instant::now();
        Self::with_clock(backend, Box::new(move || epoch.elapsed().as_millis() as u64))
    }

    /// An engine that shares `group`'s voice slot and kill switch.
    pub fn grouped(backend: Box<dyn Backend>, group: Arc<OutputGroup>) -> Self {
        Self::new(backend).in_group(group)
    }

    fn in_group(mut self, group: Arc<OutputGroup>) -> Self {
        self.kill = group.kill.clone();
        self.group = Some(group);
        self
    }

    pub fn with_clock(backend: Box<dyn Backend>, clock: Box<dyn Fn() -> u64 + Send + Sync>) -> Self {
        Self {
            id: NEXT_ENGINE_ID.fetch_add(1, SeqCst),
            group: None,
            backend,
            kill: Arc::new(AtomicBool::new(false)),
            active: Mutex::new(None),
            generation: AtomicU64::new(0),
            recent: Mutex::new(VecDeque::new()),
            next_handle: AtomicU64::new(1),
            clock,
        }
    }

    /// Lock-free emergency silence: every renderer of this engine outputs 0
    /// from its next poll, and further play requests are refused. Latched.
    pub fn kill_all(&self) {
        self.kill.store(true, SeqCst);
    }

    pub fn is_disabled(&self) -> bool {
        self.kill.load(SeqCst)
    }

    /// Starts a voice, fading out and closing any current one first.
    pub fn play(&self, device: Option<String>, req: PlayRequest) -> Result<PlayInfo, String> {
        req.validate()?;
        if self.is_disabled() {
            return Err("AUDIO_OUT_DISABLED: audio output was disabled after an internal error; restart DeckChek".into());
        }
        let (level, cap, ramp) = req.level_cap_ramp();
        let cap_dbfs = effective_cap_dbfs(cap);
        let level_dbfs = clamp_level_dbfs(level, cap_dbfs)?;
        let ramp_ms = clamp_ramp_ms(ramp);
        let kind = req.kind();
        let continuous = req.continuous();

        let mut slot = lock(&self.active);
        if let Some(old) = slot.take() {
            self.teardown(old, EndReason::Replaced);
        }
        // The device open (up to OPEN_TIMEOUT) runs without the engine lock, so
        // Esc / audio_stop_all never waits on a hanging driver. A stop or a newer
        // play meanwhile bumps `generation`, and this open then closes its own
        // stream instead of installing it.
        let generation = self.generation.fetch_add(1, SeqCst) + 1;
        drop(slot);
        let handle = self.next_handle.fetch_add(1, SeqCst);
        let ctl = Arc::new(VoiceControl::new(level_dbfs));
        let kill = self.kill.clone();
        let rctl = ctl.clone();
        let make: MakeRenderer = Box::new(move |rate, _channels| {
            let source = req.into_source(rate, handle.wrapping_mul(0x9E37_79B9_7F4A_7C15));
            Ok(Renderer::new(source, rctl, kill, rate, cap_dbfs, ramp_ms))
        });
        if let Some(g) = &self.group {
            g.claim(self.id, &ctl);
        }
        let opened = self.backend.open(device, ctl.clone(), make);
        let (info, playing) = match opened {
            Ok(v) => v,
            Err(e) => {
                self.release_from_group(&ctl);
                return Err(e);
            }
        };
        let mut slot = lock(&self.active);
        if self.is_disabled() {
            // A panic raced the open: never leave a stream running.
            playing.close();
            self.release_from_group(&ctl);
            return Err("AUDIO_OUT_DISABLED: audio output was disabled after an internal error; restart DeckChek".into());
        }
        if self.generation.load(SeqCst) != generation {
            // Stopped (Esc, window close) or replaced while the device opened.
            ctl.request_stop();
            playing.close();
            self.release_from_group(&ctl);
            return Err("AUDIO_OUT_STOPPED: output was stopped while the device was opening".into());
        }
        if let Some(old) = slot.take() {
            self.teardown(old, EndReason::Replaced); // defensive: every install bumps the generation
        }
        let out = PlayInfo {
            handle,
            device_name: info.device_name.clone(),
            sample_rate: info.sample_rate,
            channels: info.channels,
            level_dbfs,
            cap_dbfs,
            ramp_ms,
        };
        *slot = Some(Voice {
            handle,
            kind,
            info,
            ctl,
            playing,
            cap_dbfs,
            level_dbfs,
            continuous,
            last_activity_ms: (self.clock)(),
        });
        Ok(out)
    }

    /// Ramps the voice to a new level, clamped to its cap. Counts as activity.
    pub fn set_level(&self, handle: u64, level_dbfs: f32) -> Result<LevelResult, String> {
        let mut slot = lock(&self.active);
        match slot.as_mut() {
            Some(v) if v.handle == handle && !v.ctl.stop.load(SeqCst) => {
                let level = clamp_level_dbfs(level_dbfs, v.cap_dbfs)?;
                v.level_dbfs = level;
                v.last_activity_ms = (self.clock)();
                v.ctl.set_level(level);
                Ok(LevelResult { handle, level_dbfs: level })
            }
            _ => {
                let why = self
                    .ended_reason(handle)
                    .map(|r| format!(" ({})", serde_json::to_string(&r).unwrap_or_default().trim_matches('"')))
                    .unwrap_or_default();
                Err(format!("AUDIO_OUT_NOT_PLAYING: audio handle {handle} is not playing{why}"))
            }
        }
    }

    /// Fades out and closes `handle`. Idempotent: unknown or ended handles are Ok.
    pub fn stop(&self, handle: u64) {
        let mut slot = lock(&self.active);
        if slot.as_ref().is_some_and(|v| v.handle == handle) {
            if let Some(v) = slot.take() {
                self.teardown(v, EndReason::Stopped);
            }
        }
    }

    /// Fades out and closes whatever is playing. Returns how many voices stopped.
    pub fn stop_all(&self, reason: EndReason) -> u32 {
        self.generation.fetch_add(1, SeqCst);
        match lock(&self.active).take() {
            Some(v) => {
                self.teardown(v, reason);
                1
            }
            None => 0,
        }
    }

    /// Shutdown variant that never blocks on the engine lock for long: a play
    /// that is mid-open is discarded (generation bump); if the lock stays busy
    /// it falls back to the lock-free kill switch.
    pub fn stop_all_for_exit(&self, reason: EndReason) {
        self.generation.fetch_add(1, SeqCst);
        let deadline = Instant::now() + STOP_WAIT;
        loop {
            if let Ok(mut slot) = self.active.try_lock() {
                if let Some(v) = slot.take() {
                    self.teardown(v, reason);
                }
                return;
            }
            if Instant::now() >= deadline {
                self.kill_all();
                return;
            }
            thread::sleep(Duration::from_millis(2));
        }
    }

    fn release_from_group(&self, ctl: &Arc<VoiceControl>) {
        if let Some(g) = &self.group {
            g.release(ctl);
        }
    }

    /// Requests the fade, waits for the renderer to report silence (bounded by
    /// [`STOP_WAIT`]; a stalled callback is hard-muted), then closes the stream.
    fn teardown(&self, v: Voice, reason: EndReason) {
        self.release_from_group(&v.ctl);
        v.ctl.request_stop();
        let deadline = Instant::now() + STOP_WAIT;
        while !v.ctl.is_silent() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(1));
        }
        if !v.ctl.is_silent() {
            v.ctl.fault.compare_exchange(Fault::Clear as u8, Fault::HardMute as u8, SeqCst, SeqCst).ok();
        }
        v.playing.close();
        let reason = match v.ctl.fault() {
            Fault::Device => EndReason::DeviceError,
            Fault::RenderPanic => EndReason::RenderFault,
            _ => reason,
        };
        let mut recent = lock(&self.recent);
        if recent.len() >= RECENT_ENDED {
            recent.pop_front();
        }
        recent.push_back(EndedVoice { handle: v.handle, reason, message: v.ctl.message() });
    }

    /// Watchdog step: reaps faulted, finished, disabled and inactive voices.
    pub fn tick(&self) {
        let Ok(mut slot) = self.active.try_lock() else { return };
        let Some(v) = slot.as_ref() else { return };
        let reason = if self.is_disabled() {
            Some(EndReason::Disabled)
        } else if v.ctl.replaced.load(SeqCst) {
            Some(EndReason::Replaced)
        } else if v.ctl.fault() != Fault::Clear {
            Some(EndReason::DeviceError) // refined from the fault in teardown
        } else if v.ctl.finished.load(SeqCst) && v.ctl.is_silent() {
            Some(EndReason::Finished)
        } else if v.continuous
            && (self.clock)().saturating_sub(v.last_activity_ms) >= INACTIVITY_MUTE_SECS * 1000
        {
            Some(EndReason::Inactivity)
        } else {
            None
        };
        if let Some(reason) = reason {
            if let Some(v) = slot.take() {
                self.teardown(v, reason);
            }
        }
    }

    pub fn ended_reason(&self, handle: u64) -> Option<EndReason> {
        lock(&self.recent).iter().rev().find(|e| e.handle == handle).map(|e| e.reason)
    }

    /// Blocks until `handle` has ended (e.g. a one-shot buffer finished) or
    /// `timeout` passes. Used by Rust callers such as FS-11 duplex latency.
    #[allow(dead_code)] // Rust API for FS-11 duplex latency (M6); exercised by tests
    pub fn wait_until_ended(&self, handle: u64, timeout: Duration) -> Option<EndReason> {
        let deadline = Instant::now() + timeout;
        loop {
            self.tick();
            if let Some(r) = self.ended_reason(handle) {
                return Some(r);
            }
            if Instant::now() >= deadline {
                return None;
            }
            thread::sleep(Duration::from_millis(5));
        }
    }

    pub fn status(&self) -> AudioOutStatus {
        let active = lock(&self.active).as_ref().map(|v| ActiveVoice {
            handle: v.handle,
            kind: v.kind.clone(),
            device_name: v.info.device_name.clone(),
            sample_rate: v.info.sample_rate,
            level_dbfs: v.level_dbfs,
            cap_dbfs: v.cap_dbfs,
            stopping: v.ctl.stop.load(SeqCst),
        });
        AudioOutStatus {
            abs_max_dbfs: ABS_MAX_DBFS,
            disabled: self.is_disabled(),
            active,
            recent: lock(&self.recent).iter().cloned().collect(),
        }
    }
}

// ------------------------------------------------------------ cpal backend

pub struct CpalBackend;

struct CpalPlaying {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Playing for CpalPlaying {
    fn close(mut self: Box<Self>) {
        self.stop.store(true, SeqCst);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

fn choose_output(device_name: Option<&str>) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    if let Some(target) = device_name {
        for device in host.output_devices().map_err(|e| e.to_string())? {
            if device.name().ok().as_deref() == Some(target) {
                return Ok(device);
            }
        }
        return Err(format!("AUDIO_OUT_DEVICE: audio output not found: {target}"));
    }
    host.default_output_device()
        .ok_or_else(|| "AUDIO_OUT_DEVICE: no default audio output is available".to_string())
}

fn build_output<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    mut renderer: Renderer,
    ctl: Arc<VoiceControl>,
) -> Result<cpal::Stream, String>
where
    T: cpal::SizedSample + cpal::FromSample<f32> + Send + 'static,
{
    let channels = config.channels as usize;
    let mut scratch = vec![0.0f32; 4096 * channels];
    device
        .build_output_stream(
            config,
            move |data: &mut [T], _| {
                if scratch.len() < data.len() {
                    scratch.resize(data.len(), 0.0); // rare: device grew its buffer
                }
                let buf = &mut scratch[..data.len()];
                renderer.render_safe(buf, channels);
                for (o, s) in data.iter_mut().zip(buf.iter()) {
                    *o = T::from_sample(*s);
                }
            },
            move |e| ctl.report_fault(Fault::Device, e.to_string()),
            None,
        )
        .map_err(|e| format!("AUDIO_OUT_DEVICE: {e}"))
}

fn output_thread_main(
    device_name: Option<String>,
    ctl: Arc<VoiceControl>,
    make: MakeRenderer,
    stop: Arc<AtomicBool>,
    ready: mpsc::Sender<Result<StreamInfo, String>>,
) {
    let setup = || -> Result<(cpal::Stream, StreamInfo), String> {
        let device = choose_output(device_name.as_deref())?;
        let name = device.name().unwrap_or_else(|_| "Unnamed audio output".to_string());
        let supported = device.default_output_config().map_err(|e| format!("AUDIO_OUT_DEVICE: {e}"))?;
        let format = supported.sample_format();
        let config: cpal::StreamConfig = supported.into();
        if config.channels == 0 {
            return Err("AUDIO_OUT_DEVICE: output device reported zero channels".into());
        }
        let renderer = make(config.sample_rate.0, config.channels)?;
        let c = ctl.clone();
        let stream = match format {
            cpal::SampleFormat::F32 => build_output::<f32>(&device, &config, renderer, c),
            cpal::SampleFormat::I16 => build_output::<i16>(&device, &config, renderer, c),
            cpal::SampleFormat::U16 => build_output::<u16>(&device, &config, renderer, c),
            cpal::SampleFormat::I32 => build_output::<i32>(&device, &config, renderer, c),
            other => Err(format!("AUDIO_OUT_DEVICE: output sample format {other:?} is not supported")),
        }?;
        Ok((stream, StreamInfo { device_name: name, sample_rate: config.sample_rate.0, channels: config.channels }))
    };
    match setup() {
        Ok((stream, info)) => {
            // Report before playing: if the caller already timed out, the
            // stream is dropped without ever starting.
            if ready.send(Ok(info)).is_err() {
                return;
            }
            if let Err(e) = stream.play() {
                ctl.report_fault(Fault::Device, format!("could not start the output stream: {e}"));
            }
            while !stop.load(SeqCst) {
                thread::sleep(Duration::from_millis(5));
            }
            let _ = stream.pause();
            drop(stream);
        }
        Err(e) => {
            let _ = ready.send(Err(e));
        }
    }
}

impl Backend for CpalBackend {
    fn open(
        &self,
        device: Option<String>,
        ctl: Arc<VoiceControl>,
        make: MakeRenderer,
    ) -> Result<(StreamInfo, Box<dyn Playing>), String> {
        let (tx, rx) = mpsc::channel();
        let stop = Arc::new(AtomicBool::new(false));
        let thread = {
            let stop = stop.clone();
            thread::Builder::new()
                .name("deckchek-audio-out".into())
                .spawn(move || output_thread_main(device, ctl, make, stop, tx))
                .map_err(|e| e.to_string())?
        };
        match rx.recv_timeout(OPEN_TIMEOUT) {
            Ok(Ok(info)) => Ok((info, Box::new(CpalPlaying { stop, thread: Some(thread) }))),
            Ok(Err(e)) => {
                let _ = thread.join();
                Err(e)
            }
            Err(_) => {
                stop.store(true, SeqCst);
                Err("AUDIO_OUT_DEVICE: timed out opening the audio output".into())
            }
        }
    }
}

// ------------------------------------------------------- global + lifecycle

static ENGINE: OnceLock<Engine> = OnceLock::new();
static GROUP: OnceLock<Arc<OutputGroup>> = OnceLock::new();

/// The group of every engine that plays on the user's speakers: the global
/// engine and the latency tuner's engine.
pub fn output_group() -> &'static Arc<OutputGroup> {
    GROUP.get_or_init(OutputGroup::new)
}

/// Lock-free, allocation-free: silences every DeckChek output engine. The
/// first thing any panic hook does (BUG-03).
pub fn emergency_silence() {
    if let Some(g) = GROUP.get() {
        g.kill_all();
    }
    if let Some(e) = ENGINE.get() {
        e.kill_all();
    }
}

/// The process-wide engine (cpal backend) with its watchdog thread.
pub fn global() -> &'static Engine {
    ENGINE.get_or_init(|| {
        let _ = thread::Builder::new().name("deckchek-audio-watchdog".into()).spawn(|| loop {
            thread::sleep(WATCHDOG_INTERVAL);
            if let Some(e) = ENGINE.get() {
                e.tick();
            }
        });
        Engine::grouped(Box::new(CpalBackend), output_group().clone())
    })
}

/// Installs a chained panic hook that latches the global kill switch, so a
/// panic anywhere in the process silences output within one poll interval.
/// Lock-free and allocation-free on the hot path. Safe to call twice.
pub fn install_panic_guard() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let prev = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            emergency_silence();
            prev(info);
        }));
    });
}

/// Which run events must silence output.
pub fn stop_reason_for(event: &tauri::RunEvent) -> Option<EndReason> {
    use tauri::{RunEvent, WindowEvent};
    match event {
        RunEvent::Exit | RunEvent::ExitRequested { .. } => Some(EndReason::AppExit),
        RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed, .. }
            if label == MAIN_WINDOW_LABEL =>
        {
            Some(EndReason::WindowClosed)
        }
        _ => None,
    }
}

/// `App::run` hook: main-window close and app exit stop all output, on every
/// engine of the output group (the latency tuner's included).
pub fn on_run_event(event: &tauri::RunEvent) {
    if let Some(reason) = stop_reason_for(event) {
        if let Some(engine) = ENGINE.get() {
            engine.stop_all_for_exit(reason);
        }
        if let Some(group) = GROUP.get() {
            group.silence_all();
        }
    }
}

// ----------------------------------------------------------------- commands

#[tauri::command]
pub fn list_native_audio_outputs() -> Result<Vec<AudioOutputInfo>, String> {
    let host = cpal::default_host();
    let default_name = host.default_output_device().and_then(|d| d.name().ok());
    let mut out = Vec::new();
    for device in host.output_devices().map_err(|e| e.to_string())? {
        let name = device.name().unwrap_or_else(|_| "Unnamed audio output".to_string());
        let cfg = device.default_output_config().ok();
        out.push(AudioOutputInfo {
            is_default: default_name.as_deref() == Some(name.as_str()),
            sample_rate: cfg.as_ref().map(|c| c.sample_rate().0),
            channels: cfg.as_ref().map(|c| c.channels()),
            name,
        });
    }
    Ok(out)
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn audio_play_buffer(device: Option<String>, buffer: BufferInput, opts: BufferOpts) -> Result<PlayInfo, String> {
    blocking(move || global().play(device, PlayRequest::Buffer(buffer, opts))).await
}

#[tauri::command]
pub async fn audio_play_tone(device: Option<String>, spec: ToneSpec) -> Result<PlayInfo, String> {
    blocking(move || global().play(device, PlayRequest::Tone(spec))).await
}

#[tauri::command]
pub async fn audio_set_level(handle: u64, level_dbfs: f32) -> Result<LevelResult, String> {
    blocking(move || global().set_level(handle, level_dbfs)).await
}

#[tauri::command]
pub async fn audio_stop(handle: u64) -> Result<(), String> {
    blocking(move || {
        global().stop(handle);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn audio_stop_all() -> Result<u32, String> {
    blocking(|| Ok(global().stop_all(EndReason::Stopped))).await
}

#[tauri::command]
pub fn audio_out_status() -> AudioOutStatus {
    match ENGINE.get() {
        Some(e) => e.status(),
        None => AudioOutStatus { abs_max_dbfs: ABS_MAX_DBFS, disabled: false, active: None, recent: Vec::new() },
    }
}

// -------------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    const FS: u32 = 48_000;

    fn ms(n: f32) -> usize {
        (n * FS as f32 / 1000.0).round() as usize
    }

    /// Tiny seeded PRNG for property tests.
    struct Rng(u64);
    impl Rng {
        fn u(&mut self) -> f64 {
            self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (self.0 >> 11) as f64 / (1u64 << 53) as f64
        }
        fn range(&mut self, a: f64, b: f64) -> f64 {
            a + (b - a) * self.u()
        }
    }

    fn renderer(source: Source, level: f32, cap: f32, ramp_ms: f32) -> (Renderer, Arc<VoiceControl>, Arc<AtomicBool>) {
        let ctl = Arc::new(VoiceControl::new(clamp_level_dbfs(level, effective_cap_dbfs(Some(cap))).unwrap()));
        let kill = Arc::new(AtomicBool::new(false));
        let r = Renderer::new(source, ctl.clone(), kill.clone(), FS, cap, ramp_ms);
        (r, ctl, kill)
    }

    fn dc(v: f32) -> Source {
        Source::Test(Box::new(move || Some((v, v))))
    }

    fn render_frames(r: &mut Renderer, frames: usize, channels: usize, block: usize) -> Vec<f32> {
        let mut out = vec![0.0; frames * channels];
        for chunk in out.chunks_mut(block * channels) {
            r.render_safe(chunk, channels);
        }
        out
    }

    fn left(out: &[f32], channels: usize) -> Vec<f32> {
        out.chunks(channels).map(|f| f[0]).collect()
    }

    // ---- constants and helpers

    #[test]
    fn abs_cap_constant_is_at_or_below_minus_12_dbfs() {
        let db = 20.0 * (ABS_MAX_AMP as f64).log10();
        assert!(db <= -12.0, "{db}");
        assert!(db > -12.0001, "{db}");
        assert_eq!(ABS_MAX_DBFS, -12.0);
    }

    #[test]
    fn effective_cap_never_exceeds_abs_max() {
        assert_eq!(effective_cap_dbfs(None), -12.0);
        assert_eq!(effective_cap_dbfs(Some(6.0)), -12.0);
        assert_eq!(effective_cap_dbfs(Some(f32::INFINITY)), -12.0);
        assert_eq!(effective_cap_dbfs(Some(-12.0)), -12.0);
        assert_eq!(effective_cap_dbfs(Some(-30.0)), -30.0);
        assert_eq!(effective_cap_dbfs(Some(-500.0)), SILENCE_DBFS);
        assert_eq!(effective_cap_dbfs(Some(f32::NAN)), SILENCE_DBFS);
        assert_eq!(cap_amp(0.0), ABS_MAX_AMP);
        assert_eq!(cap_amp(SILENCE_DBFS), 0.0);
    }

    #[test]
    fn level_clamps_to_cap_and_rejects_nan() {
        assert_eq!(clamp_level_dbfs(0.0, -30.0).unwrap(), -30.0);
        assert_eq!(clamp_level_dbfs(-29.9, -30.0).unwrap(), -30.0);
        assert_eq!(clamp_level_dbfs(-30.1, -30.0).unwrap(), -30.1);
        assert_eq!(clamp_level_dbfs(10.0, 0.0).unwrap(), -12.0);
        assert_eq!(clamp_level_dbfs(f32::NEG_INFINITY, -12.0).unwrap(), SILENCE_DBFS);
        assert_eq!(clamp_level_dbfs(f32::INFINITY, -20.0).unwrap(), -20.0);
        assert!(clamp_level_dbfs(f32::NAN, -12.0).unwrap_err().starts_with("AUDIO_OUT_INVALID"));
    }

    #[test]
    fn db_to_amp_values() {
        assert!((db_to_amp(-6.0206) - 0.5).abs() < 1e-4);
        assert_eq!(db_to_amp(SILENCE_DBFS), 0.0);
        assert_eq!(db_to_amp(f32::NAN), 0.0);
        assert_eq!(db_to_amp(f32::NEG_INFINITY), 0.0);
    }

    #[test]
    fn ramps_are_never_shorter_than_10_ms() {
        for v in [None, Some(0.0), Some(-5.0), Some(9.99), Some(f32::NAN), Some(f32::INFINITY)] {
            let r = clamp_ramp_ms(v);
            assert!(r >= MIN_RAMP_MS, "{v:?} -> {r}");
            assert!(ramp_samples(r, FS) >= 480);
        }
        assert_eq!(clamp_ramp_ms(Some(10.0)), 10.0);
        assert_eq!(clamp_ramp_ms(Some(10.1)), 10.1);
        assert_eq!(clamp_ramp_ms(Some(1e9)), MAX_RAMP_MS);
    }

    // ---- limiter / cap (AC-6)

    #[test]
    fn property_no_sample_ever_exceeds_the_caps() {
        // 200 seeded cases of adversarial sources, levels, caps, mid-stream
        // level changes, block sizes and channel counts.
        for seed in 0..200u64 {
            let mut rng = Rng(seed * 7919 + 1);
            let cap = rng.range(-150.0, 40.0) as f32;
            let level = rng.range(-200.0, 100.0) as f32;
            let channels = 1 + (rng.u() * 8.0) as usize;
            let block = 1 + (rng.u() * 2048.0) as usize;
            let mode = seed % 5;
            let mut src_rng = Rng(seed ^ 0xDEAD_BEEF);
            let source = Source::Test(Box::new(move || {
                let mut x = || match mode {
                    0 => src_rng.range(-1e6, 1e6) as f32,
                    1 => [f32::NAN, f32::INFINITY, f32::NEG_INFINITY, 1e30, -1e30][(src_rng.u() * 5.0) as usize],
                    2 => if src_rng.u() < 0.5 { 1.0 } else { -1.0 },
                    3 => f32::MAX,
                    _ => src_rng.range(-1.0, 1.0) as f32,
                };
                Some((x(), x()))
            }));
            let (mut r, ctl, _) = renderer(source, level, cap, rng.range(-10.0, 200.0) as f32);
            let limit = cap_amp(effective_cap_dbfs(Some(cap)));
            for _ in 0..6 {
                let out = render_frames(&mut r, 3000, channels, block);
                for s in &out {
                    assert!(s.is_finite(), "seed {seed}: non-finite");
                    assert!(s.abs() <= limit, "seed {seed}: {s} > call cap {limit}");
                    assert!(s.abs() <= ABS_MAX_AMP, "seed {seed}: {s} > abs cap");
                }
                // Hostile level changes: they are clamped to the voice cap.
                let lv = rng.range(-300.0, 300.0) as f32;
                ctl.set_level(clamp_level_dbfs(lv, effective_cap_dbfs(Some(cap))).unwrap());
                // Even a raw, unclamped write to the control block is capped.
                if rng.u() < 0.3 {
                    ctl.level_bits.store(500.0f32.to_bits(), SeqCst);
                    ctl.level_seq.fetch_add(1, SeqCst);
                }
            }
        }
    }

    #[test]
    fn full_scale_input_is_limited_to_the_per_call_cap() {
        let (mut r, _, _) = renderer(dc(1.0), -12.0, -30.0, 10.0);
        let out = render_frames(&mut r, ms(100.0), 2, 256);
        let peak = out.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        assert!((peak - db_to_amp(-30.0)).abs() < 1e-6, "{peak}");
    }

    #[test]
    fn hard_cap_clamps_and_zeroes_non_finite() {
        let mut b = [1.0, -1.0, f32::NAN, f32::INFINITY, 0.1];
        hard_cap(&mut b);
        assert_eq!(b, [ABS_MAX_AMP, -ABS_MAX_AMP, 0.0, 0.0, 0.1]);
    }

    // ---- ramps

    fn assert_ramp(out: &[f32], from: f32, to: f32, min_len: usize) {
        let max_step = (to - from).abs() / min_len as f32 + 1e-6;
        let mut prev = from;
        for (i, &s) in out.iter().enumerate() {
            assert!((s - prev).abs() <= max_step, "step {} at {i} > {max_step}", (s - prev).abs());
            prev = s;
        }
    }

    #[test]
    fn start_ramps_up_over_at_least_10_ms_even_if_0_requested() {
        let (mut r, _, _) = renderer(dc(1.0), -12.0, -12.0, 0.0);
        let out = left(&render_frames(&mut r, ms(30.0), 2, 128), 2);
        let target = db_to_amp(-12.0).min(ABS_MAX_AMP);
        assert_ramp(&out, 0.0, target, ms(10.0));
        assert!(out[ms(10.0) - 2] < target);
        assert!((out[ms(10.0) + 1] - target).abs() < 1e-6);
    }

    #[test]
    fn set_level_ramps_linearly_over_the_ramp_time() {
        let (mut r, ctl, _) = renderer(dc(1.0), -20.0, -12.0, 25.0);
        render_frames(&mut r, ms(50.0), 1, 480);
        ctl.set_level(-40.0);
        let out = render_frames(&mut r, ms(60.0), 1, 480);
        let (a, b) = (db_to_amp(-20.0), db_to_amp(-40.0));
        assert_ramp(&out, a, b, ms(25.0));
        assert!((out[ms(25.0) + 40] - b).abs() < 1e-6);
        // Back up to the cap: also ramped.
        ctl.set_level(-12.0);
        let out = render_frames(&mut r, ms(60.0), 1, 480);
        assert_ramp(&out, b, ABS_MAX_AMP, ms(25.0));
    }

    // ---- stop (AC-6: silence within 50 ms)

    #[test]
    fn stop_reaches_exact_silence_within_50_ms_for_any_block_size() {
        for (block, channels) in [(16, 2), (64, 1), (480, 2), (512, 6), (4096, 2)] {
            let (mut r, ctl, _) = renderer(Source::sine(1000.0, FS), -12.0, -12.0, 10.0);
            render_frames(&mut r, ms(100.0), channels, block);
            ctl.request_stop();
            let out = render_frames(&mut r, ms(200.0), channels, block);
            let l = left(&out, channels);
            assert!(l[..ms(5.0)].iter().any(|s| s.abs() > 0.05), "fade starts from signal");
            assert!(out[ms(50.0) * channels..].iter().all(|&s| s == 0.0), "block {block}: not silent after 50 ms");
            assert!(ctl.is_silent());
            // Gradual: |gain step| <= cap / fade length.
            let envelope_step = ABS_MAX_AMP / ms(STOP_FADE_MS) as f32;
            let mut ramp = Renderer::new(dc(1.0), Arc::new(VoiceControl::new(-12.0)), Arc::new(AtomicBool::new(false)), FS, -12.0, 10.0);
            render_frames(&mut ramp, ms(20.0), 1, block);
            ramp.ctl.request_stop();
            assert_ramp(&render_frames(&mut ramp, ms(60.0), 1, block), ABS_MAX_AMP, 0.0, (ABS_MAX_AMP / envelope_step) as usize);
        }
    }

    #[test]
    fn kill_switch_silences_within_one_poll_interval() {
        let (mut r, _, kill) = renderer(Source::sine(440.0, FS), -12.0, -12.0, 10.0);
        render_frames(&mut r, ms(50.0), 2, 256);
        kill.store(true, SeqCst);
        let out = render_frames(&mut r, 1000, 2, 1000);
        assert!(out.iter().all(|&s| s == 0.0));
    }

    #[test]
    fn device_fault_silences_the_renderer() {
        let (mut r, ctl, _) = renderer(Source::sine(440.0, FS), -12.0, -12.0, 10.0);
        render_frames(&mut r, ms(50.0), 2, 256);
        ctl.report_fault(Fault::Device, "device unplugged");
        let out = render_frames(&mut r, 512, 2, 512);
        assert!(out.iter().all(|&s| s == 0.0));
        assert_eq!(ctl.fault(), Fault::Device);
        assert_eq!(ctl.message().as_deref(), Some("device unplugged"));
    }

    #[test]
    fn panic_in_render_is_caught_and_silences() {
        let mut n = 0;
        let source = Source::Test(Box::new(move || {
            n += 1;
            if n > 1000 {
                panic!("generator bug");
            }
            Some((1.0, 1.0))
        }));
        let (mut r, ctl, _) = renderer(source, -12.0, -12.0, 10.0);
        let mut out = vec![0.0; 4096];
        r.render_safe(&mut out, 2);
        assert!(out.iter().all(|&s| s == 0.0), "panicking block zeroed");
        r.render_safe(&mut out, 2);
        assert!(out.iter().all(|&s| s == 0.0));
        assert_eq!(ctl.fault(), Fault::RenderPanic);
    }

    #[test]
    fn channel_layouts() {
        let src = Source::Test(Box::new(|| Some((1.0, -1.0))));
        let (mut r, _, _) = renderer(src, -12.0, -12.0, 10.0);
        let out = render_frames(&mut r, ms(20.0), 4, 960);
        let last = &out[out.len() - 4..];
        assert_eq!(last, &[ABS_MAX_AMP, -ABS_MAX_AMP, 0.0, 0.0]);
        let src = Source::Test(Box::new(|| Some((1.0, 0.0))));
        let (mut r, _, _) = renderer(src, -12.0, -12.0, 10.0);
        let out = render_frames(&mut r, ms(20.0), 1, 960);
        assert!((out[out.len() - 1] - 0.5 * ABS_MAX_AMP).abs() < 1e-6);
        let (mut r, _, _) = renderer(dc(1.0), -12.0, -12.0, 10.0);
        let mut none: [f32; 0] = [];
        r.render_safe(&mut none, 0);
    }

    // ---- generators

    fn raw(src: &mut Source, n: usize) -> Vec<f32> {
        (0..n).map(|_| src.next().unwrap().0).collect()
    }

    fn crossings(x: &[f32]) -> usize {
        x.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count()
    }

    /// Mean power of DFT bins in [f_lo, f_hi] (1 Hz bins for n = FS).
    fn band_power(x: &[f32], f_lo: usize, f_hi: usize) -> f64 {
        let n = x.len() as f64;
        let mut acc = 0.0;
        for k in f_lo..=f_hi {
            let w = 2.0 * std::f64::consts::PI * k as f64 / n;
            let (mut re, mut im) = (0.0, 0.0);
            for (i, &v) in x.iter().enumerate() {
                re += v as f64 * (w * i as f64).cos();
                im -= v as f64 * (w * i as f64).sin();
            }
            acc += re * re + im * im;
        }
        acc / (f_hi - f_lo + 1) as f64
    }

    #[test]
    fn sine_has_unit_peak_and_the_requested_frequency() {
        let x = raw(&mut Source::sine(1000.0, FS), FS as usize);
        let peak = x.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        assert!((peak - 1.0).abs() < 1e-3);
        assert!((crossings(&x) as i64 - 1000).abs() <= 1);
        // Above 0.45 fs is limited (no aliasing).
        let x = raw(&mut Source::sine(30_000.0, 44_100), 44_100);
        assert!((crossings(&x) as f64 - 19_845.0).abs() <= 2.0);
    }

    #[test]
    fn pink_band_is_a_third_octave_band_at_nominal_rms() {
        let x = raw(&mut Source::pink_band(1000.0, FS, 42), FS as usize);
        let rms = (x.iter().map(|v| (*v as f64).powi(2)).sum::<f64>() / x.len() as f64).sqrt();
        assert!((rms - NOISE_RMS).abs() < 0.03, "rms {rms}");
        let centre = band_power(&x, 950, 1050);
        let octave_up = band_power(&x, 1950, 2050);
        let octave_down = band_power(&x, 480, 520);
        assert!(10.0 * (centre / octave_up).log10() > 15.0);
        assert!(10.0 * (centre / octave_down).log10() > 15.0);
        // Deterministic per seed.
        assert_eq!(raw(&mut Source::pink_band(100.0, FS, 7), 64), raw(&mut Source::pink_band(100.0, FS, 7), 64));
    }

    #[test]
    fn chirp_sweeps_up_and_repeats() {
        let mut s = Source::chirp(100.0, 4000.0, 1.0, FS);
        let x = raw(&mut s, FS as usize);
        let first = crossings(&x[..4800]);
        let last = crossings(&x[FS as usize - 4800..]);
        assert!(first < 30 && last > 300, "{first} {last}");
        let again = raw(&mut s, 4800);
        assert!(crossings(&again) < 30, "sweep restarts");
    }

    #[test]
    fn buffer_is_resampled_and_ends_or_loops() {
        let left: Vec<f32> = (0..441).map(|i| i as f32 / 441.0).collect();
        let mut s = Source::buffer(left.clone(), vec![], 44_100, 48_000, false);
        let mut n = 0;
        while let Some((l, r)) = s.next() {
            assert_eq!(l, r, "mono duplicates");
            n += 1;
        }
        assert!((n as i64 - 480).abs() <= 1, "10 ms at 48 kHz: {n}");
        let mut s = Source::buffer(vec![0.1, 0.2], vec![0.3, 0.4], 48_000, 48_000, true);
        let got: Vec<_> = (0..5).map(|_| s.next().unwrap()).collect();
        assert_eq!(got, vec![(0.1, 0.3), (0.2, 0.4), (0.1, 0.3), (0.2, 0.4), (0.1, 0.3)]);
    }

    #[test]
    fn one_shot_buffer_end_marks_finished_and_silent() {
        let src = Source::buffer(vec![1.0; 1000], vec![], FS, FS, false);
        let (mut r, ctl, _) = renderer(src, -12.0, -12.0, 10.0);
        let out = render_frames(&mut r, 2000, 2, 256);
        assert!(out[2000..].iter().all(|&s| s == 0.0));
        assert!(ctl.finished.load(SeqCst) && ctl.is_silent());
    }

    // ---- request validation and IPC contract

    fn tone(level: f32) -> PlayRequest {
        PlayRequest::Tone(ToneSpec {
            kind: ToneType::Sine,
            freq_hz: Some(1000.0),
            end_hz: None,
            duration_sec: None,
            level_dbfs: level,
            cap_dbfs: None,
            ramp_ms: None,
        })
    }

    #[test]
    fn validation_rejects_bad_requests() {
        assert!(tone(-30.0).validate().is_ok());
        assert!(tone(f32::NAN).validate().is_err());
        let mut t = ToneSpec { freq_hz: Some(5.0), ..match tone(-30.0) { PlayRequest::Tone(s) => s, _ => unreachable!() } };
        assert!(PlayRequest::Tone(t.clone()).validate().is_err());
        t.freq_hz = Some(25_000.0);
        assert!(PlayRequest::Tone(t.clone()).validate().is_err());
        t.freq_hz = None;
        t.duration_sec = Some(0.0);
        assert!(PlayRequest::Tone(t).validate().is_err());
        let opts = BufferOpts { level_dbfs: -20.0, cap_dbfs: None, looped: false, ramp_ms: None };
        let buf = |rate, l: usize, r: usize| PlayRequest::Buffer(BufferInput { sample_rate: rate, left: vec![0.0; l], right: vec![0.0; r] }, opts.clone());
        assert!(buf(48_000, 10, 0).validate().is_ok());
        assert!(buf(48_000, 10, 10).validate().is_ok());
        assert!(buf(48_000, 0, 0).validate().is_err());
        assert!(buf(48_000, 10, 9).validate().is_err());
        assert!(buf(1_000, 10, 0).validate().is_err());
        assert!(buf(48_000, MAX_BUFFER_FRAMES + 1, 0).validate().is_err());
    }

    fn contract() -> serde_json::Value {
        let raw = std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/audio_out.json")).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    #[test]
    fn contract_examples_round_trip_through_the_real_types() {
        let c = contract();
        assert_eq!(c["absMaxDbfs"].as_f64().unwrap() as f32, ABS_MAX_DBFS);
        let cmd = |name: &str| c["commands"][name].clone();
        let roundtrip = |v: &serde_json::Value, f: &dyn Fn(&serde_json::Value) -> serde_json::Value| {
            assert_eq!(&f(v), v);
        };
        let out = cmd("list_native_audio_outputs")["response"].clone();
        roundtrip(&out, &|v| serde_json::to_value(serde_json::from_value::<Vec<AudioOutputInfo>>(v.clone()).unwrap()).unwrap());

        let t = cmd("audio_play_tone");
        let spec: ToneSpec = serde_json::from_value(t["request"]["spec"].clone()).unwrap();
        assert_eq!(spec.kind, ToneType::Pinkband);
        assert!(PlayRequest::Tone(spec).validate().is_ok());
        roundtrip(&t["response"], &|v| serde_json::to_value(serde_json::from_value::<PlayInfo>(v.clone()).unwrap()).unwrap());

        let b = cmd("audio_play_buffer");
        let buffer: BufferInput = serde_json::from_value(b["request"]["buffer"].clone()).unwrap();
        let opts: BufferOpts = serde_json::from_value(b["request"]["opts"].clone()).unwrap();
        assert!(opts.looped);
        assert!(PlayRequest::Buffer(buffer, opts).validate().is_ok());
        roundtrip(&b["response"], &|v| serde_json::to_value(serde_json::from_value::<PlayInfo>(v.clone()).unwrap()).unwrap());

        let l = cmd("audio_set_level");
        assert!(l["request"]["handle"].is_u64() && l["request"]["levelDbfs"].is_number());
        roundtrip(&l["response"], &|v| serde_json::to_value(serde_json::from_value::<LevelResult>(v.clone()).unwrap()).unwrap());
        roundtrip(&cmd("audio_out_status")["response"], &|v| {
            serde_json::to_value(serde_json::from_value::<AudioOutStatus>(v.clone()).unwrap()).unwrap()
        });
    }

    // ---- engine state machine with a fake backend

    #[derive(Default)]
    struct FakeLog {
        events: Mutex<Vec<String>>,
        renderers: Mutex<Vec<(u64, Renderer, Arc<VoiceControl>)>>,
        opened: AtomicUsize,
    }

    struct FakeBackend {
        log: Arc<FakeLog>,
        fail: bool,
    }

    struct FakePlaying {
        log: Arc<FakeLog>,
        id: u64,
    }

    impl Playing for FakePlaying {
        fn close(self: Box<Self>) {
            self.log.events.lock().unwrap().push(format!("close {}", self.id));
            self.log.renderers.lock().unwrap().retain(|(id, _, _)| *id != self.id);
        }
    }

    impl Backend for FakeBackend {
        fn open(&self, _device: Option<String>, ctl: Arc<VoiceControl>, make: MakeRenderer) -> Result<(StreamInfo, Box<dyn Playing>), String> {
            if self.fail {
                return Err("AUDIO_OUT_DEVICE: no default audio output is available".into());
            }
            let id = self.log.opened.fetch_add(1, SeqCst) as u64 + 1;
            let r = make(FS, 2)?;
            self.log.events.lock().unwrap().push(format!("open {id}"));
            self.log.renderers.lock().unwrap().push((id, r, ctl));
            Ok((StreamInfo { device_name: "Fake".into(), sample_rate: FS, channels: 2 }, Box::new(FakePlaying { log: self.log.clone(), id })))
        }
    }

    /// Engine whose fake "device" is pumped by a background thread, so
    /// blocking teardown sees the fade complete like on real hardware.
    struct Rig {
        engine: Arc<Engine>,
        log: Arc<FakeLog>,
        clock: Arc<AtomicU64>,
        pump_on: Arc<AtomicBool>,
        captured: Arc<Mutex<Vec<f32>>>,
        quit: Arc<AtomicBool>,
    }

    impl Drop for Rig {
        fn drop(&mut self) {
            self.quit.store(true, SeqCst);
        }
    }

    fn rig() -> Rig {
        rig_with(None)
    }

    fn rig_with(group: Option<Arc<OutputGroup>>) -> Rig {
        let log = Arc::new(FakeLog::default());
        let clock = Arc::new(AtomicU64::new(0));
        let c = clock.clone();
        let mut engine = Engine::with_clock(Box::new(FakeBackend { log: log.clone(), fail: false }), Box::new(move || c.load(SeqCst)));
        if let Some(g) = group {
            engine = engine.in_group(g);
        }
        let engine = Arc::new(engine);
        let pump_on = Arc::new(AtomicBool::new(true));
        let captured = Arc::new(Mutex::new(Vec::new()));
        let quit = Arc::new(AtomicBool::new(false));
        {
            let (log, pump_on, captured, quit) = (log.clone(), pump_on.clone(), captured.clone(), quit.clone());
            thread::spawn(move || {
                let mut buf = vec![0.0f32; 128 * 2];
                while !quit.load(SeqCst) {
                    if pump_on.load(SeqCst) {
                        let mut rs = log.renderers.lock().unwrap();
                        for (_, r, _) in rs.iter_mut() {
                            r.render_safe(&mut buf, 2);
                            captured.lock().unwrap().extend_from_slice(&buf);
                        }
                    }
                    thread::sleep(Duration::from_micros(300));
                }
            });
        }
        Rig { engine, log, clock, pump_on, captured, quit }
    }

    fn events(r: &Rig) -> Vec<String> {
        r.log.events.lock().unwrap().clone()
    }

    #[test]
    fn engine_play_stop_is_idempotent_and_records_reason() {
        let r = rig();
        let info = r.engine.play(None, tone(0.0)).unwrap();
        assert_eq!(info.level_dbfs, -12.0, "level clamped to the abs cap");
        assert_eq!(info.cap_dbfs, -12.0);
        assert!(info.ramp_ms >= MIN_RAMP_MS);
        assert!(r.engine.status().active.is_some());
        r.engine.stop(info.handle);
        r.engine.stop(info.handle);
        r.engine.stop(9999);
        assert_eq!(events(&r), vec!["open 1", "close 1"]);
        assert_eq!(r.engine.ended_reason(info.handle), Some(EndReason::Stopped));
        assert!(r.engine.status().active.is_none());
        let err = r.engine.set_level(info.handle, -20.0).unwrap_err();
        assert!(err.starts_with("AUDIO_OUT_NOT_PLAYING") && err.contains("stopped"), "{err}");
    }

    #[test]
    fn engine_stop_fades_to_silence_before_closing() {
        let r = rig();
        let info = r.engine.play(None, tone(-12.0)).unwrap();
        thread::sleep(Duration::from_millis(30));
        r.captured.lock().unwrap().clear();
        r.engine.stop(info.handle);
        let cap = r.captured.lock().unwrap().clone();
        assert!(!cap.is_empty());
        // Frames rendered after the stop request until the last non-zero sample.
        let last_sound = cap.iter().rposition(|&s| s != 0.0).map_or(0, |i| i / 2);
        assert!(last_sound <= ms(50.0), "silence reached within 50 ms of samples: {last_sound}");
        assert!(cap[cap.len() - 2..].iter().all(|&s| s == 0.0));
    }

    #[test]
    fn engine_set_level_is_clamped_to_the_call_cap() {
        let r = rig();
        let mut req = tone(-40.0);
        if let PlayRequest::Tone(s) = &mut req {
            s.cap_dbfs = Some(-30.0);
        }
        let info = r.engine.play(None, req).unwrap();
        assert_eq!(info.cap_dbfs, -30.0);
        assert_eq!(r.engine.set_level(info.handle, 0.0).unwrap().level_dbfs, -30.0);
        assert_eq!(r.engine.set_level(info.handle, -50.0).unwrap().level_dbfs, -50.0);
        assert!(r.engine.set_level(info.handle, f32::NAN).is_err());
        r.engine.set_level(info.handle, 100.0).unwrap();
        thread::sleep(Duration::from_millis(120));
        let peak = r.captured.lock().unwrap().iter().fold(0.0f32, |m, s| m.max(s.abs()));
        assert!(peak <= db_to_amp(-30.0) && peak > 0.0, "{peak}");
    }

    #[test]
    fn new_play_replaces_the_previous_voice_after_closing_it() {
        let r = rig();
        let a = r.engine.play(None, tone(-30.0)).unwrap();
        let b = r.engine.play(None, tone(-30.0)).unwrap();
        assert_ne!(a.handle, b.handle);
        assert_eq!(events(&r), vec!["open 1", "close 1", "open 2"]);
        assert_eq!(r.engine.ended_reason(a.handle), Some(EndReason::Replaced));
        assert_eq!(r.engine.stop_all(EndReason::Stopped), 1);
        assert_eq!(r.engine.stop_all(EndReason::Stopped), 0);
    }

    #[test]
    fn window_close_and_exit_stop_output() {
        for reason in [EndReason::WindowClosed, EndReason::AppExit] {
            let r = rig();
            let a = r.engine.play(None, tone(-20.0)).unwrap();
            r.engine.stop_all_for_exit(reason);
            assert_eq!(r.engine.ended_reason(a.handle), Some(reason));
            assert_eq!(events(&r), vec!["open 1", "close 1"]);
        }
        assert_eq!(stop_reason_for(&tauri::RunEvent::Exit), Some(EndReason::AppExit));
        assert_eq!(stop_reason_for(&tauri::RunEvent::Ready), None);
    }

    #[test]
    fn exit_falls_back_to_the_kill_switch_when_the_engine_is_busy() {
        let r = rig();
        let _a = r.engine.play(None, tone(-20.0)).unwrap();
        let guard = r.engine.active.lock().unwrap();
        let t0 = Instant::now();
        r.engine.stop_all_for_exit(EndReason::AppExit);
        assert!(t0.elapsed() < Duration::from_millis(400));
        assert!(r.engine.is_disabled());
        drop(guard);
        thread::sleep(Duration::from_millis(20));
        r.captured.lock().unwrap().clear();
        thread::sleep(Duration::from_millis(20));
        assert!(r.captured.lock().unwrap().iter().all(|&s| s == 0.0));
    }

    #[test]
    fn kill_all_silences_and_refuses_new_playback() {
        let r = rig();
        let a = r.engine.play(None, tone(-12.0)).unwrap();
        r.engine.kill_all();
        thread::sleep(Duration::from_millis(20));
        r.captured.lock().unwrap().clear();
        thread::sleep(Duration::from_millis(20));
        assert!(r.captured.lock().unwrap().iter().all(|&s| s == 0.0));
        assert!(r.engine.play(None, tone(-30.0)).unwrap_err().starts_with("AUDIO_OUT_DISABLED"));
        r.engine.tick();
        assert_eq!(r.engine.ended_reason(a.handle), Some(EndReason::Disabled));
        assert!(r.engine.status().disabled);
    }

    #[test]
    fn device_error_is_reaped_by_the_watchdog() {
        let r = rig();
        let a = r.engine.play(None, tone(-20.0)).unwrap();
        let ctl = r.log.renderers.lock().unwrap()[0].2.clone();
        ctl.report_fault(Fault::Device, "The device was unplugged");
        r.engine.tick();
        assert_eq!(events(&r), vec!["open 1", "close 1"]);
        let st = r.engine.status();
        assert_eq!(st.recent[0].reason, EndReason::DeviceError);
        assert_eq!(st.recent[0].message.as_deref(), Some("The device was unplugged"));
        assert!(r.engine.set_level(a.handle, -30.0).unwrap_err().contains("deviceError"));
        // Not latched: a new voice can start after a device error.
        assert!(r.engine.play(None, tone(-30.0)).is_ok());
    }

    #[test]
    fn stalled_device_is_hard_muted_and_closed_within_the_stop_wait() {
        let r = rig();
        let a = r.engine.play(None, tone(-20.0)).unwrap();
        r.pump_on.store(false, SeqCst);
        let ctl = r.log.renderers.lock().unwrap()[0].2.clone();
        let t0 = Instant::now();
        r.engine.stop(a.handle);
        assert!(t0.elapsed() < STOP_WAIT + Duration::from_millis(100));
        assert_eq!(ctl.fault(), Fault::HardMute);
        assert_eq!(events(&r), vec!["open 1", "close 1"]);
    }

    #[test]
    fn inactivity_mutes_continuous_voices_after_60_s() {
        let r = rig();
        let a = r.engine.play(None, tone(-30.0)).unwrap();
        r.clock.store(59_000, SeqCst);
        r.engine.tick();
        assert!(r.engine.status().active.is_some());
        r.engine.set_level(a.handle, -31.0).unwrap(); // activity resets the timer
        r.clock.store(118_000, SeqCst);
        r.engine.tick();
        assert!(r.engine.status().active.is_some());
        r.clock.store(119_000, SeqCst);
        r.engine.tick();
        assert_eq!(r.engine.ended_reason(a.handle), Some(EndReason::Inactivity));

        // One-shot buffers are exempt from the inactivity mute, then finish.
        let opts = BufferOpts { level_dbfs: -20.0, cap_dbfs: None, looped: false, ramp_ms: None };
        let b = r.engine.play(None, PlayRequest::Buffer(BufferInput { sample_rate: FS, left: vec![0.5; 4800], right: vec![] }, opts)).unwrap();
        r.clock.store(500_000, SeqCst);
        r.engine.tick();
        let reason = r.engine.wait_until_ended(b.handle, Duration::from_secs(2));
        assert_eq!(reason, Some(EndReason::Finished));

        // Looped buffers are continuous.
        let opts = BufferOpts { level_dbfs: -20.0, cap_dbfs: None, looped: true, ramp_ms: None };
        let c = r.engine.play(None, PlayRequest::Buffer(BufferInput { sample_rate: FS, left: vec![0.5; 480], right: vec![] }, opts)).unwrap();
        r.clock.store(561_000, SeqCst);
        r.engine.tick();
        assert_eq!(r.engine.ended_reason(c.handle), Some(EndReason::Inactivity));
    }

    #[test]
    fn invalid_requests_and_open_failures_leave_no_voice() {
        let r = rig();
        assert!(r.engine.play(None, tone(f32::NAN)).is_err());
        assert!(events(&r).is_empty());
        let e = Engine::new(Box::new(FakeBackend { log: Arc::new(FakeLog::default()), fail: true }));
        assert!(e.play(None, tone(-30.0)).unwrap_err().starts_with("AUDIO_OUT_DEVICE"));
        assert!(e.status().active.is_none());
    }

    /// Every renderer of the rig is silent (its next block is all zeros).
    fn all_silent(r: &Rig) -> bool {
        r.log.renderers.lock().unwrap().iter().all(|(_, _, ctl)| ctl.is_silent())
    }

    fn sounding(r: &Rig) -> bool {
        let mut buf = vec![0.0f32; 256];
        r.log.renderers.lock().unwrap().iter_mut().any(|(_, rend, _)| {
            rend.render_safe(&mut buf, 2);
            buf.iter().any(|x| *x != 0.0)
        })
    }

    /// BUG-04: two engines of one output group never sound together, so their
    /// sum stays under the -12 dBFS cap; the replaced voice ends as `Replaced`.
    #[test]
    fn engines_in_one_group_never_play_at_once() {
        let g = OutputGroup::new();
        let (a, b) = (rig_with(Some(g.clone())), rig_with(Some(g.clone())));
        let solo = rig();
        let ha = a.engine.play(None, tone(-12.0)).unwrap();
        let hs = solo.engine.play(None, tone(-12.0)).unwrap();
        thread::sleep(Duration::from_millis(30));
        assert!(sounding(&a));
        let hb = b.engine.play(None, tone(-12.0)).unwrap();
        assert!(all_silent(&a), "the other engine's voice is silent before the new one opens");
        assert!(sounding(&b));
        assert!(!all_silent(&solo), "engines outside the group are not touched");
        a.engine.tick();
        assert_eq!(a.engine.ended_reason(ha.handle), Some(EndReason::Replaced));
        assert!(a.engine.status().active.is_none());
        // and back: a new play on `a` silences `b`
        let ha2 = a.engine.play(None, tone(-20.0)).unwrap();
        assert!(all_silent(&b));
        b.engine.tick();
        assert_eq!(b.engine.ended_reason(hb.handle), Some(EndReason::Replaced));
        // an ordinary stop releases the group slot: a later play elsewhere waits on nothing
        a.engine.stop(ha2.handle);
        let t = Instant::now();
        b.engine.play(None, tone(-20.0)).unwrap();
        assert!(t.elapsed() < STOP_WAIT, "no fade wait for a voice that already ended");
        solo.engine.stop(hs.handle);
    }

    /// BUG-04: window close / exit silence every engine of the group, and
    /// the kill switch is shared.
    #[test]
    fn group_silence_and_kill_cover_every_member_engine() {
        let g = OutputGroup::new();
        let (a, b) = (rig_with(Some(g.clone())), rig_with(Some(g.clone())));
        let hb = b.engine.play(None, tone(-12.0)).unwrap();
        thread::sleep(Duration::from_millis(20));
        g.silence_all(); // what on_run_event does for the tuner's engine
        assert!(all_silent(&b));
        b.engine.tick();
        assert_eq!(b.engine.ended_reason(hb.handle), Some(EndReason::Replaced));
        b.engine.play(None, tone(-12.0)).unwrap();
        g.kill_all(); // what the panic guard does
        assert!(a.engine.is_disabled() && b.engine.is_disabled());
        assert!(a.engine.play(None, tone(-30.0)).unwrap_err().starts_with("AUDIO_OUT_DISABLED"));
        assert!(wait_for(Duration::from_secs(1), || all_silent(&b)));
    }

    fn wait_for(timeout: Duration, mut cond: impl FnMut() -> bool) -> bool {
        let end = Instant::now() + timeout;
        while Instant::now() < end {
            if cond() {
                return true;
            }
            thread::sleep(Duration::from_millis(2));
        }
        cond()
    }

    /// Backend whose open hangs (a misbehaving driver) until released.
    struct SlowBackend {
        inner: FakeBackend,
        release: Mutex<mpsc::Receiver<()>>,
    }

    impl Backend for SlowBackend {
        fn open(&self, device: Option<String>, ctl: Arc<VoiceControl>, make: MakeRenderer) -> Result<(StreamInfo, Box<dyn Playing>), String> {
            let _ = self.release.lock().unwrap().recv();
            self.inner.open(device, ctl, make)
        }
    }

    /// Suspected S1 (confirmed): Esc / audio_stop_all used to wait for a
    /// hanging device open (up to 10 s) because play held the engine lock.
    /// Now stop returns at once and the late stream is closed, never installed.
    #[test]
    fn stop_all_does_not_wait_for_a_hanging_open_and_wins_over_it() {
        let log = Arc::new(FakeLog::default());
        let (release, rx) = mpsc::channel();
        let engine = Arc::new(Engine::new(Box::new(SlowBackend { inner: FakeBackend { log: log.clone(), fail: false }, release: Mutex::new(rx) })));
        let player = {
            let engine = engine.clone();
            thread::spawn(move || engine.play(None, tone(-30.0)))
        };
        thread::sleep(Duration::from_millis(50)); // the play is inside the open now
        let t = Instant::now();
        assert_eq!(engine.stop_all(EndReason::Stopped), 0);
        assert!(t.elapsed() < Duration::from_millis(100), "stop waited {:?}", t.elapsed());
        release.send(()).unwrap();
        let err = player.join().unwrap().unwrap_err();
        assert!(err.starts_with("AUDIO_OUT_STOPPED"), "{err}");
        assert!(engine.status().active.is_none());
        assert_eq!(log.events.lock().unwrap().clone(), vec!["open 1", "close 1"], "the late stream is closed");
        // a later play works normally
        release.send(()).unwrap();
        let ok = engine.play(None, tone(-30.0)).unwrap();
        assert_eq!(engine.status().active.unwrap().handle, ok.handle);
    }

    #[test]
    fn panic_guard_latches_the_global_kill_switch() {
        let engine = global();
        install_panic_guard();
        install_panic_guard(); // idempotent
        let _ = thread::spawn(|| panic!("simulated crash elsewhere in the app")).join();
        assert!(engine.is_disabled());
        assert!(engine.play(None, tone(-30.0)).unwrap_err().starts_with("AUDIO_OUT_DISABLED"));
        assert!(audio_out_status().disabled);
    }

    // ---- real devices (not available on CI runners)

    #[test]
    #[ignore = "needs a real audio output device; GitHub Windows/Linux runners have none. Run with --ignored on a PC with speakers turned down."]
    fn device_plays_quiet_tone_and_stops() {
        let outs = list_native_audio_outputs().unwrap();
        assert!(!outs.is_empty(), "no output devices");
        let engine = Engine::new(Box::new(CpalBackend));
        let info = engine.play(None, tone(-60.0)).unwrap();
        assert!(info.sample_rate > 0);
        thread::sleep(Duration::from_millis(300));
        engine.set_level(info.handle, -55.0).unwrap();
        thread::sleep(Duration::from_millis(100));
        let t0 = Instant::now();
        engine.stop(info.handle);
        assert!(t0.elapsed() < Duration::from_millis(200));
        assert_eq!(engine.ended_reason(info.handle), Some(EndReason::Stopped));
    }

    #[test]
    #[ignore = "needs a real audio output device; GitHub Windows/Linux runners have none."]
    fn device_unknown_name_is_reported() {
        let engine = Engine::new(Box::new(CpalBackend));
        let err = engine.play(Some("No Such Output 123".into()), tone(-60.0)).unwrap_err();
        assert!(err.starts_with("AUDIO_OUT_DEVICE"), "{err}");
    }
}
