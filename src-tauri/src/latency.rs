//! FS-11 DVS latency and buffer tuner: device buffer facts, the duplex round
//! trip, buffer stress runs, the Windows tuning scan and the tuner's records
//! (`0007_latency_tuner.sql`).
//!
//! Scope (FS-11 §7): everything here runs on cpal's default host, which is
//! WASAPI shared mode on Windows. Nothing here measures the DJ software's ASIO
//! session; results are a "WASAPI round trip". ASIO values exist only when the
//! user types them (stored as such by `app/latency.js`).
//!
//! Buffer-size behaviour is detected at run time, never assumed: the owner's
//! WASAPI spike (`docs/testing/results/spike-wasapi-buffers.md`) has not run
//! yet. Each direction of every run requests `BufferSize::Fixed(n)` and reports
//! one [`BufferMode`]:
//! * `honoured`: the median callback size equals the request (spike outcome A);
//! * `adjusted`: the stream opened but runs another size. Rounded or clamped
//!   (B) or the same size for every request (C) is decided across the sweep by
//!   `app/latency.js classifyBufferBehaviour`;
//! * `hostChosen`: Fixed was refused (`BuildStreamError`) and the run fell back
//!   to `BufferSize::Default`, or Default was requested (C);
//! * `unavailable`: the direction did not open or never called back (D).
//!
//! A run never fails just because a direction is unavailable: it returns the
//! per-direction report so the UI can say "duplex via WASAPI unavailable".
//!
//! Output (the chirp stimulus, and the stress run's silence) goes through the
//! FS-00 `audio_out` engine and renderer (absolute -12 dBFS cap, ramps, kill
//! switch); only the backend differs, so it can request a fixed buffer. Input
//! runs under the FS-00 capture lease (holder `latency-tuner`) with capture.rs's
//! ring writer and counters. Device access sits behind [`StreamFactory`] so the
//! whole run logic is tested against a synthetic duplex device.

use std::{
    sync::{
        atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering::Relaxed},
        mpsc, Arc, Mutex, MutexGuard, Once, OnceLock,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use rtrb::{Consumer, RingBuffer};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::audio_out::{self, BufferInput, BufferOpts, EndReason, Engine, Fault, MakeRenderer, PlayRequest, Playing, VoiceControl};
use crate::capture::{self, Accumulator, CaptureError, CaptureLease, CaptureQuality, LeaseKind, LiveCaptureState, Shared};
use crate::db::{database_path, new_id, now_iso, open_database};

// ------------------------------------------------------------------ constants

/// Capture-lease holder for every tuner run (FS-00 §4.7).
pub const HOLDER: &str = "latency-tuner";
/// Smallest and largest buffer request accepted (frames).
pub const MIN_BUFFER_FRAMES: u32 = 16;
pub const MAX_BUFFER_FRAMES: u32 = 8192;
/// Stress step length bounds (FS-11 AC-3 uses 30 s).
pub const MIN_STEP_SECONDS: f64 = 0.2;
pub const MAX_STEP_SECONDS: f64 = 30.0;
/// Hard ceiling for any single run (FS-11 §7: 40 s per step).
pub const HARD_TIMEOUT: Duration = Duration::from_secs(40);
/// Gap-based xrun: a callback gap longer than this many actual periods (tunable, FS-11 §6).
pub const XRUN_GAP_FACTOR: f64 = 1.5;
/// Callback gaps ignored at stream start (prefill bursts; tunable).
pub const WARMUP_GAPS: usize = 4;
/// Default and quietest stimulus level; the loudest is the audio_out cap (-12 dBFS).
pub const DEFAULT_LEVEL_DBFS: f32 = -20.0;
pub const MIN_LEVEL_DBFS: f32 = -60.0;
/// Longest stimulus accepted for the round trip.
pub const MAX_STIMULUS_SECONDS: f64 = 30.0;
/// Capture kept after the stimulus ends, so the last marker's echo is recorded.
pub const DEFAULT_TAIL_SECONDS: f64 = 0.6;
/// Callback statistics capacity assumes callbacks of at least this many frames.
const MIN_EXPECTED_CALLBACK_FRAMES: f64 = 32.0;
const MAX_PROBE_ENTRIES: usize = 1 << 20;
const MAX_ALIGN_PAIRS: usize = 16_384;
const LOOP_SLEEP: Duration = Duration::from_millis(5);
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
const OPEN_TIMEOUT: Duration = Duration::from_secs(10);
/// How long a one-sided round trip waits to learn the open side's period.
const PROBE_ONLY_WAIT: Duration = Duration::from_millis(500);

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

// ---------------------------------------------------------- callback probe

/// Lock-free, allocation-free record of every callback's frame count and the
/// gap since the previous callback. One writer (the stream's callback).
pub struct Probe {
    frames: Box<[AtomicU32]>,
    gaps_us: Box<[AtomicU32]>,
    count: AtomicU64,
    last_us: AtomicU64,
    delivered: AtomicU64,
    origin: Instant,
}

impl Probe {
    pub fn with_capacity(cap: usize) -> Self {
        let cap = cap.min(MAX_PROBE_ENTRIES);
        Self {
            frames: (0..cap).map(|_| AtomicU32::new(0)).collect(),
            gaps_us: (0..cap).map(|_| AtomicU32::new(0)).collect(),
            count: AtomicU64::new(0),
            last_us: AtomicU64::new(0),
            delivered: AtomicU64::new(0),
            origin: Instant::now(),
        }
    }

    /// Entries needed for `seconds` of callbacks at up to `rate` Hz.
    pub fn capacity_for(seconds: f64, rate: u32) -> usize {
        let s = if seconds.is_finite() { seconds.max(0.0) } else { 0.0 };
        ((s + 2.0) * rate as f64 / MIN_EXPECTED_CALLBACK_FRAMES) as usize + 256
    }

    /// Called from the audio callback.
    pub fn record(&self, frames: usize) {
        self.record_at(frames, self.origin.elapsed().as_micros() as u64);
    }

    pub fn record_at(&self, frames: usize, now_us: u64) {
        let n = self.count.fetch_add(1, Relaxed) as usize;
        let gap = if n == 0 { 0 } else { now_us.saturating_sub(self.last_us.load(Relaxed)) };
        self.last_us.store(now_us, Relaxed);
        if n < self.frames.len() {
            self.frames[n].store(frames.min(u32::MAX as usize) as u32, Relaxed);
            self.gaps_us[n].store(gap.min(u32::MAX as u64) as u32, Relaxed);
        }
        self.delivered.fetch_add(frames as u64, Relaxed);
    }

    pub fn callbacks(&self) -> u64 {
        self.count.load(Relaxed)
    }

    /// Frames delivered (input) or rendered (output) so far.
    pub fn delivered(&self) -> u64 {
        self.delivered.load(Relaxed)
    }

    /// Recorded frame counts and the gaps between consecutive callbacks.
    pub fn snapshot(&self) -> (Vec<u32>, Vec<u32>) {
        let n = (self.callbacks() as usize).min(self.frames.len());
        let frames = self.frames[..n].iter().map(|a| a.load(Relaxed)).collect();
        let gaps = self.gaps_us[..n].iter().skip(1).map(|a| a.load(Relaxed)).collect();
        (frames, gaps)
    }
}

// ------------------------------------------------------------ statistics

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallbackStats {
    pub callbacks: u64,
    /// Median callback size = the period the host actually runs.
    pub actual_frames: Option<u32>,
    pub actual_frames_min: Option<u32>,
    pub actual_frames_max: Option<u32>,
    pub actual_period_ms: Option<f64>,
    pub gap_ms_median: Option<f64>,
    pub gap_ms_p99: Option<f64>,
    pub gap_ms_max: Option<f64>,
    pub gap_xruns: u64,
    pub xrun_threshold_ms: Option<f64>,
}

/// Nearest-rank percentile of a sorted slice (`p` in 0..=1).
pub fn percentile(sorted: &[u32], p: f64) -> Option<u32> {
    if sorted.is_empty() {
        return None;
    }
    let idx = (((sorted.len() - 1) as f64) * p.clamp(0.0, 1.0)).round() as usize;
    Some(sorted[idx])
}

/// Gap above which a callback counts as an xrun: `XRUN_GAP_FACTOR` x period,
/// raised to `floor_ms` (idle p99 + margin, from `app/latency.js`) when that is
/// larger, so a host that always delivers in bursts is not failed at idle.
pub fn xrun_threshold_ms(period_ms: f64, floor_ms: Option<f64>) -> f64 {
    let base = XRUN_GAP_FACTOR * period_ms;
    match floor_ms {
        Some(f) if f.is_finite() && f > base => f,
        _ => base,
    }
}

pub fn callback_stats(frames: &[u32], gaps_us: &[u32], callbacks: u64, rate: u32, floor_ms: Option<f64>) -> CallbackStats {
    let mut f = frames.to_vec();
    f.sort_unstable();
    let gaps: Vec<u32> = gaps_us.iter().skip(WARMUP_GAPS.min(gaps_us.len().saturating_sub(1))).copied().collect();
    let mut g = gaps.clone();
    g.sort_unstable();
    let actual = percentile(&f, 0.5);
    let period_ms = actual.filter(|_| rate > 0).map(|a| a as f64 * 1000.0 / rate as f64);
    let threshold = period_ms.map(|p| xrun_threshold_ms(p, floor_ms));
    let gap_xruns = threshold.map(|t| g.iter().filter(|&&x| x as f64 / 1000.0 > t).count() as u64).unwrap_or(0);
    let ms = |v: Option<u32>| v.map(|x| x as f64 / 1000.0);
    CallbackStats {
        callbacks,
        actual_frames: actual,
        actual_frames_min: f.first().copied(),
        actual_frames_max: f.last().copied(),
        actual_period_ms: period_ms,
        gap_ms_median: ms(percentile(&g, 0.5)),
        gap_ms_p99: ms(percentile(&g, 0.99)),
        gap_ms_max: ms(g.last().copied()),
        gap_xruns,
        xrun_threshold_ms: threshold,
    }
}

// ------------------------------------------------------- buffer behaviour

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BufferMode {
    Honoured,
    Adjusted,
    HostChosen,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ModeReason {
    /// Median callback size equals the request.
    Matched,
    /// Fixed accepted, but the host runs another size.
    Differs,
    /// Fixed refused by the host; the run used the host's own period.
    FixedRejected,
    /// The caller asked for the host's period.
    DefaultRequested,
    /// Neither Fixed nor Default opened.
    OpenFailed,
    /// Opened but no callback arrived.
    NoCallbacks,
}

/// Per-direction decision (see module docs).
pub fn classify_direction(requested: Option<u32>, fixed_rejected: bool, opened: bool, actual: Option<u32>) -> (BufferMode, ModeReason) {
    if !opened {
        return (BufferMode::Unavailable, ModeReason::OpenFailed);
    }
    let Some(actual) = actual else { return (BufferMode::Unavailable, ModeReason::NoCallbacks) };
    match requested {
        None => (BufferMode::HostChosen, ModeReason::DefaultRequested),
        Some(_) if fixed_rejected => (BufferMode::HostChosen, ModeReason::FixedRejected),
        Some(r) if r == actual => (BufferMode::Honoured, ModeReason::Matched),
        Some(_) => (BufferMode::Adjusted, ModeReason::Differs),
    }
}

/// Mode of a duplex run: the less trustworthy of the opened directions.
pub fn combined_mode(a: BufferMode, b: BufferMode) -> BufferMode {
    let rank = |m: BufferMode| match m {
        BufferMode::Honoured => 0,
        BufferMode::Adjusted => 1,
        BufferMode::HostChosen => 2,
        BufferMode::Unavailable => 3,
    };
    match (a, b) {
        (BufferMode::Unavailable, x) | (x, BufferMode::Unavailable) => x,
        _ if rank(a) >= rank(b) => a,
        _ => b,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Duplex {
    Full,
    InputOnly,
    OutputOnly,
    #[serde(rename = "none")]
    Neither,
}

pub fn duplex_of(input: BufferMode, output: BufferMode) -> Duplex {
    match (input != BufferMode::Unavailable, output != BufferMode::Unavailable) {
        (true, true) => Duplex::Full,
        (true, false) => Duplex::InputOnly,
        (false, true) => Duplex::OutputOnly,
        (false, false) => Duplex::Neither,
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectionReport {
    pub direction: String,
    pub opened: bool,
    pub device_name: Option<String>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub requested_frames: Option<u32>,
    /// What finally ran: "fixed" or "default".
    pub buffer_request: String,
    pub mode: BufferMode,
    pub mode_reason: ModeReason,
    /// The host's refusal of `BufferSize::Fixed` (the run then used Default).
    pub fixed_error: Option<String>,
    pub open_error: Option<String>,
    #[serde(flatten)]
    pub stats: CallbackStats,
    pub stream_errors: Vec<String>,
}

/// How one direction was opened.
#[derive(Debug, Clone, Default)]
pub struct OpenNotes {
    pub meta: Option<StreamMeta>,
    pub ran_fixed: bool,
    pub fixed_error: Option<String>,
    pub open_error: Option<String>,
}

fn direction_report(dir: &str, requested: Option<u32>, notes: &OpenNotes, probe: &Probe, shared: &Shared, floor_ms: Option<f64>) -> DirectionReport {
    let opened = notes.meta.is_some();
    let rate = notes.meta.as_ref().map(|m| m.sample_rate).unwrap_or(0);
    let (frames, gaps) = probe.snapshot();
    let stats = if opened { callback_stats(&frames, &gaps, probe.callbacks(), rate, floor_ms) } else { CallbackStats::default() };
    let (mode, mode_reason) = classify_direction(requested, notes.fixed_error.is_some(), opened, stats.actual_frames);
    DirectionReport {
        direction: dir.to_string(),
        opened,
        device_name: notes.meta.as_ref().map(|m| m.device_name.clone()),
        sample_rate: notes.meta.as_ref().map(|m| m.sample_rate),
        channels: notes.meta.as_ref().map(|m| m.channels),
        requested_frames: requested,
        buffer_request: if notes.ran_fixed { "fixed" } else { "default" }.to_string(),
        mode,
        mode_reason,
        fixed_error: notes.fixed_error.clone(),
        open_error: notes.open_error.clone(),
        stats,
        stream_errors: shared.snapshot().stream_error_messages,
    }
}

// ------------------------------------------------------- duplex alignment

/// Pairs (output frames rendered, input frames delivered) sampled at the
/// start of each output callback. In a duplex driver both counters advance
/// together, so `delivered - rendered` (in input frames) is the offset between
/// the two streams' frame indexes; with it a marker's capture index converts
/// to a software-to-software round trip.
pub struct AlignRecorder {
    input: Arc<Probe>,
    out: Box<[AtomicU64]>,
    inp: Box<[AtomicU64]>,
    n: AtomicUsize,
}

impl AlignRecorder {
    pub fn new(input: Arc<Probe>) -> Self {
        Self {
            input,
            out: (0..MAX_ALIGN_PAIRS).map(|_| AtomicU64::new(0)).collect(),
            inp: (0..MAX_ALIGN_PAIRS).map(|_| AtomicU64::new(0)).collect(),
            n: AtomicUsize::new(0),
        }
    }

    /// Called from the output callback before it renders.
    pub fn record(&self, rendered: u64) {
        let delivered = self.input.delivered();
        if delivered == 0 {
            return; // input not running yet: no relation to record
        }
        let i = self.n.fetch_add(1, Relaxed);
        if i < self.out.len() {
            self.out[i].store(rendered, Relaxed);
            self.inp[i].store(delivered, Relaxed);
        }
    }

    pub fn pairs(&self) -> Vec<(u64, u64)> {
        let n = self.n.load(Relaxed).min(self.out.len());
        (0..n).map(|i| (self.out[i].load(Relaxed), self.inp[i].load(Relaxed))).collect()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Alignment {
    /// Input frame index at which output frame 0 was handed to the output stream.
    pub frames: f64,
    pub min_frames: f64,
    pub max_frames: f64,
    pub pairs: usize,
}

/// Median of `delivered - rendered * in_rate / out_rate` over all pairs.
pub fn alignment_from_pairs(pairs: &[(u64, u64)], in_rate: u32, out_rate: u32) -> Option<Alignment> {
    if pairs.is_empty() || in_rate == 0 || out_rate == 0 {
        return None;
    }
    let k = in_rate as f64 / out_rate as f64;
    let mut v: Vec<f64> = pairs.iter().map(|&(o, i)| i as f64 - o as f64 * k).collect();
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mid = v.len() / 2;
    let median = if v.len() % 2 == 1 { v[mid] } else { 0.5 * (v[mid - 1] + v[mid]) };
    Some(Alignment { frames: median, min_frames: v[0], max_frames: v[v.len() - 1], pairs: v.len() })
}

// ------------------------------------------------------------- CPU load

/// Load threads for `pct` % of `logical` cores, capped at logical cores - 1 (FS-11 §7).
pub fn load_thread_count(logical: usize, pct: u32) -> usize {
    let n = (logical as f64 * pct.min(100) as f64 / 100.0).round() as usize;
    n.min(logical.saturating_sub(1))
}

/// Busy-loop threads at below-normal priority; stopped and joined on drop, so
/// every exit path (end, Esc, error, panic unwinding) ends the load.
pub struct LoadGuard {
    stop: Arc<AtomicBool>,
    threads: Vec<JoinHandle<()>>,
}

#[cfg(windows)]
fn lower_thread_priority() {
    // kernel32 is always linked on Windows; THREAD_PRIORITY_BELOW_NORMAL = -1.
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentThread() -> isize;
        fn SetThreadPriority(thread: isize, priority: i32) -> i32;
    }
    // SAFETY: GetCurrentThread returns a pseudo handle for the calling thread
    // that needs no closing; SetThreadPriority only reads it.
    unsafe {
        SetThreadPriority(GetCurrentThread(), -1);
    }
}

#[cfg(not(windows))]
fn lower_thread_priority() {}

impl LoadGuard {
    pub fn start(pct: u32) -> Self {
        let logical = thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
        Self::with_threads(load_thread_count(logical, pct))
    }

    pub fn with_threads(n: usize) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let threads = (0..n)
            .filter_map(|i| {
                let stop = stop.clone();
                thread::Builder::new()
                    .name(format!("deckchek-latency-load-{i}"))
                    .spawn(move || {
                        lower_thread_priority();
                        let mut x: u64 = 0x9E37_79B9_7F4A_7C15 ^ i as u64;
                        while !stop.load(Relaxed) {
                            for _ in 0..2_000 {
                                x = x.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
                            }
                            std::hint::black_box(x);
                        }
                    })
                    .ok()
            })
            .collect();
        Self { stop, threads }
    }

    pub fn threads(&self) -> usize {
        self.threads.len()
    }

    /// Stops and joins every thread; returns how long that took.
    pub fn stop(mut self) -> Duration {
        let t = Instant::now();
        self.halt();
        t.elapsed()
    }

    fn halt(&mut self) {
        self.stop.store(true, Relaxed);
        for t in self.threads.drain(..) {
            let _ = t.join();
        }
    }
}

impl Drop for LoadGuard {
    fn drop(&mut self) {
        self.halt();
    }
}

// --------------------------------------------------------- stream factory

pub type InputCb = Box<dyn FnMut(&[f32], usize) + Send>;
pub type OutputCb = Box<dyn FnMut(&mut [f32], usize) + Send>;
/// `(message, fatal)`; fatal = the device went away.
pub type ErrCb = Arc<dyn Fn(String, bool) + Send + Sync>;
/// Builds the input callback once the stream knows its rate and channels.
pub type MakeInput = Box<dyn FnOnce(u32, u16) -> InputCb + Send>;
pub type MakeOutput = Box<dyn FnOnce(u32, u16) -> Result<OutputCb, String> + Send>;

#[derive(Debug, Clone, PartialEq)]
pub struct StreamMeta {
    pub device_name: String,
    pub sample_rate: u32,
    pub channels: u16,
}

/// Keeps a stream alive on its own thread; `close` (or drop) stops it.
pub struct StreamHandle {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl StreamHandle {
    pub fn new(stop: Arc<AtomicBool>, thread: JoinHandle<()>) -> Self {
        Self { stop, thread: Some(thread) }
    }

    pub fn close(mut self) {
        self.halt();
    }

    fn halt(&mut self) {
        self.stop.store(true, Relaxed);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

impl Drop for StreamHandle {
    fn drop(&mut self) {
        self.halt();
    }
}

impl Playing for StreamHandle {
    fn close(self: Box<Self>) {
        (*self).close();
    }
}

/// Opens one direction. `buffer` None = host default, Some(n) = `BufferSize::Fixed(n)`.
/// `make` is called before Ok is returned. One attempt per call: the caller
/// falls back from Fixed to Default.
pub trait StreamFactory: Send + Sync {
    fn open_input(&self, device: Option<&str>, rate: Option<u32>, buffer: Option<u32>, make: MakeInput, on_error: ErrCb) -> Result<(StreamMeta, StreamHandle), String>;
    fn open_output(&self, device: Option<&str>, rate: Option<u32>, buffer: Option<u32>, make: MakeOutput, on_error: ErrCb) -> Result<(StreamMeta, StreamHandle), String>;
}

// ---------------------------------------------------- output via audio_out

#[derive(Default, Clone)]
struct OutPlan {
    rate: Option<u32>,
    buffer: Option<u32>,
    probe: Option<Arc<Probe>>,
    shared: Option<Arc<Shared>>,
    align: Option<Arc<AlignRecorder>>,
    meta: Option<StreamMeta>,
}

/// `audio_out::Backend` that opens through a [`StreamFactory`] with the planned
/// buffer request. The renderer (cap, ramps, kill switch) is audio_out's.
struct TunerBackend {
    factory: Arc<dyn StreamFactory>,
    plan: Arc<Mutex<OutPlan>>,
}

impl audio_out::Backend for TunerBackend {
    fn open(&self, device: Option<String>, ctl: Arc<VoiceControl>, make: MakeRenderer) -> Result<(audio_out::StreamInfo, Box<dyn Playing>), String> {
        let plan = lock(&self.plan).clone();
        let probe = plan.probe.clone().unwrap_or_else(|| Arc::new(Probe::with_capacity(0)));
        let shared = plan.shared.clone().unwrap_or_default();
        let align = plan.align.clone();
        let make_out: MakeOutput = Box::new(move |rate, channels| {
            let mut renderer = make(rate, channels)?;
            let mut rendered: u64 = 0;
            Ok(Box::new(move |out: &mut [f32], ch: usize| {
                let frames = out.len() / ch.max(1);
                probe.record(frames);
                if let Some(a) = &align {
                    a.record(rendered);
                }
                renderer.render_safe(out, ch);
                rendered += frames as u64;
            }))
        });
        let (ctl_e, shared_e) = (ctl.clone(), shared.clone());
        let on_error: ErrCb = Arc::new(move |msg: String, _fatal: bool| {
            ctl_e.report_fault(Fault::Device, msg.clone());
            shared_e.record_error(msg);
        });
        let (meta, handle) = self.factory.open_output(device.as_deref(), plan.rate, plan.buffer, make_out, on_error)?;
        lock(&self.plan).meta = Some(meta.clone());
        Ok((
            audio_out::StreamInfo { device_name: meta.device_name, sample_rate: meta.sample_rate, channels: meta.channels },
            Box::new(handle),
        ))
    }
}

// ------------------------------------------------------------------ tuner

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RunEnd {
    Completed,
    Aborted,
    /// Another feature took the capture lease ("Stop <holder> and continue").
    Preempted,
    DeviceLost,
    /// Loopback clipped: output stopped at once (FS-11 §7).
    Clipped,
    Timeout,
    /// Neither direction opened (or the round trip lacked one).
    NoStreams,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub phase: String,
    pub step: Option<u32>,
    pub frames: Option<u32>,
    pub elapsed_sec: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StressRequest {
    pub device_name: Option<String>,
    pub out_device: Option<String>,
    /// None = the host's own period (spike outcome C: one "host-chosen" row).
    pub buffer_frames: Option<u32>,
    pub seconds: f64,
    pub cpu_load_pct: u32,
    /// Idle p99 + margin from the idle step, raises the xrun gap threshold.
    pub gap_floor_ms: Option<f64>,
    pub sample_rate: Option<u32>,
    pub step: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StressResult {
    pub requested: Option<u32>,
    /// Actual period in frames (input median, else output median).
    pub actual: Option<u32>,
    pub callbacks: u64,
    /// Gap xruns over both directions.
    pub xruns: u64,
    pub max_gap_ms: Option<f64>,
    pub p99_gap_ms: Option<f64>,
    /// Input samples dropped because the ring was full.
    pub overruns: u64,
    pub stream_errors: Vec<String>,
    pub buffer_mode: BufferMode,
    pub duplex: Duplex,
    pub input: DirectionReport,
    pub output: DirectionReport,
    pub cpu_load_pct: u32,
    pub load_threads: usize,
    pub load_stop_ms: f64,
    pub seconds: f64,
    pub ended: RunEnd,
    pub host_api: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundTripRequest {
    pub device_name: Option<String>,
    pub out_device: Option<String>,
    pub stimulus: BufferInput,
    pub buffer_frames: Option<u32>,
    pub level_dbfs: Option<f32>,
    pub tail_sec: Option<f64>,
    pub step: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Captured {
    pub sample_rate: u32,
    pub left: Vec<f32>,
    pub right: Vec<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportedFrames {
    #[serde(rename = "in")]
    pub input: Option<u32>,
    pub out: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundTripResult {
    /// None when duplex is not available (spike outcome D) or the run ended early.
    pub captured: Option<Captured>,
    pub quality: CaptureQuality,
    /// Actual periods the host ran (WASAPI has no driver-reported latency).
    pub reported_buffer_frames: ReportedFrames,
    pub alignment: Option<Alignment>,
    pub output_sample_rate: Option<u32>,
    pub output_level_dbfs: Option<f32>,
    pub buffer_mode: BufferMode,
    pub duplex: Duplex,
    pub input: DirectionReport,
    pub output: DirectionReport,
    pub ended: RunEnd,
    pub host_api: String,
    /// Always "WASAPI round trip" on Windows: the DJ software's ASIO path is never measured.
    pub scope: String,
}

fn clamp_seconds(s: f64) -> f64 {
    if s.is_finite() {
        s.clamp(MIN_STEP_SECONDS, MAX_STEP_SECONDS)
    } else {
        MIN_STEP_SECONDS
    }
}

fn invalid(msg: impl std::fmt::Display) -> CaptureError {
    CaptureError::Message(format!("LATENCY_INVALID: {msg}"))
}

pub fn validate_buffer(frames: Option<u32>) -> Result<(), CaptureError> {
    match frames {
        Some(n) if !(MIN_BUFFER_FRAMES..=MAX_BUFFER_FRAMES).contains(&n) => {
            Err(invalid(format!("bufferFrames must be between {MIN_BUFFER_FRAMES} and {MAX_BUFFER_FRAMES}")))
        }
        _ => Ok(()),
    }
}

pub fn scope_label(host_api: &str) -> String {
    if host_api.eq_ignore_ascii_case("wasapi") {
        "WASAPI round trip".to_string()
    } else {
        format!("{host_api} round trip")
    }
}

/// Releases the capture lease on every exit path.
struct LeaseGuard<'a> {
    lease: &'a CaptureLease,
    id: u64,
}

impl<'a> LeaseGuard<'a> {
    fn acquire(lease: &'a CaptureLease, device: Option<String>) -> Result<Self, CaptureError> {
        let g = lease.acquire(HOLDER, device, LeaseKind::External)?;
        Ok(Self { lease, id: g.lease_id })
    }

    fn still_held(&self) -> bool {
        self.lease.current().is_some_and(|g| g.lease_id == self.id)
    }
}

impl Drop for LeaseGuard<'_> {
    fn drop(&mut self) {
        self.lease.release(self.id);
    }
}

struct RunningGuard<'a>(&'a AtomicBool);

impl Drop for RunningGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Relaxed);
    }
}

struct InputSide {
    handle: StreamHandle,
    consumer: Consumer<f32>,
}

/// The tuner: one run at a time, each run under the capture lease.
pub struct Tuner {
    factory: Arc<dyn StreamFactory>,
    plan: Arc<Mutex<OutPlan>>,
    engine: Engine,
    running: AtomicBool,
    abort_gen: AtomicU64,
    host_api: String,
}

impl Tuner {
    pub fn new(factory: Arc<dyn StreamFactory>, host_api: impl Into<String>) -> Self {
        let plan = Arc::new(Mutex::new(OutPlan::default()));
        let engine = Engine::new(Box::new(TunerBackend { factory: factory.clone(), plan: plan.clone() }));
        Self { factory, plan, engine, running: AtomicBool::new(false), abort_gen: AtomicU64::new(0), host_api: host_api.into() }
    }

    /// Esc (FS-11 AC-7): the running step ends at its next poll (<= 5 ms), the
    /// output fades out now, load threads are joined as the step unwinds.
    pub fn abort(&self) {
        self.abort_gen.fetch_add(1, Relaxed);
        self.engine.stop_all(EndReason::Stopped);
    }

    /// Lock-free emergency silence (panic hook). Latched.
    pub fn kill(&self) {
        self.engine.kill_all();
    }

    fn begin(&self) -> Result<RunningGuard<'_>, CaptureError> {
        if self.running.swap(true, Relaxed) {
            return Err(CaptureError::Message("LATENCY_BUSY: a latency or stress run is already in progress".into()));
        }
        Ok(RunningGuard(&self.running))
    }

    /// Opens the input, trying Fixed first and falling back to Default.
    fn open_input(&self, device: Option<&str>, rate: Option<u32>, requested: Option<u32>, probe: &Arc<Probe>, shared: &Arc<Shared>) -> (Option<InputSide>, OpenNotes) {
        let mut notes = OpenNotes::default();
        let attempt = |buffer: Option<u32>| -> Result<(StreamMeta, InputSide), String> {
            let (tx, rx) = mpsc::channel::<Consumer<f32>>();
            let (probe, shared_cb) = (probe.clone(), shared.clone());
            let make: MakeInput = Box::new(move |rate, channels| {
                let (mut producer, consumer) = RingBuffer::<f32>::new((rate.max(8000) as usize) * (channels.max(1) as usize) * 2);
                let _ = tx.send(consumer);
                let origin = Instant::now();
                Box::new(move |data: &[f32], ch: usize| {
                    shared_cb.record_callback(origin.elapsed().as_micros() as u64);
                    let dropped = capture::push_frames(&mut producer, data, ch, |v| v);
                    shared_cb.record_overrun(dropped);
                    probe.record(data.len() / ch.max(1));
                })
            });
            let shared_e = shared.clone();
            let on_error: ErrCb = Arc::new(move |msg: String, fatal: bool| if fatal { shared_e.record_fatal(msg) } else { shared_e.record_error(msg) });
            let (meta, handle) = self.factory.open_input(device, rate, buffer, make, on_error)?;
            let consumer = rx.try_recv().map_err(|_| "input stream opened without a capture ring".to_string())?;
            Ok((meta, InputSide { handle, consumer }))
        };
        let first = attempt(requested);
        let result = match (first, requested) {
            (Ok(v), _) => {
                notes.ran_fixed = requested.is_some();
                Ok(v)
            }
            (Err(e), Some(_)) => {
                notes.fixed_error = Some(e);
                attempt(None)
            }
            (Err(e), None) => Err(e),
        };
        match result {
            Ok((meta, side)) => {
                notes.meta = Some(meta);
                (Some(side), notes)
            }
            Err(e) => {
                // Both attempts failed: the Fixed refusal says nothing on its own.
                notes.open_error = Some(e);
                (None, notes)
            }
        }
    }

    /// Plays through the audio_out engine, trying Fixed first, then Default.
    fn play(&self, device: Option<String>, rate: Option<u32>, requested: Option<u32>, req: PlayRequest, probe: &Arc<Probe>, shared: &Arc<Shared>, align: Option<Arc<AlignRecorder>>) -> (Option<u64>, OpenNotes) {
        let mut notes = OpenNotes::default();
        let attempt = |buffer: Option<u32>| -> Result<u64, String> {
            *lock(&self.plan) = OutPlan { rate, buffer, probe: Some(probe.clone()), shared: Some(shared.clone()), align: align.clone(), meta: None };
            self.engine.play(device.clone(), req.clone()).map(|info| info.handle)
        };
        let first = attempt(requested);
        let result = match (first, requested) {
            (Ok(h), _) => {
                notes.ran_fixed = requested.is_some();
                Ok(h)
            }
            (Err(e), Some(_)) if !e.starts_with("AUDIO_OUT_INVALID") && !e.starts_with("AUDIO_OUT_DISABLED") => {
                notes.fixed_error = Some(e);
                attempt(None)
            }
            (Err(e), _) => Err(e),
        };
        match result {
            Ok(h) => {
                notes.meta = lock(&self.plan).meta.clone();
                (Some(h), notes)
            }
            Err(e) => {
                notes.open_error = Some(e);
                (None, notes)
            }
        }
    }

    pub fn stress(&self, lease: &CaptureLease, r: &StressRequest, progress: &dyn Fn(&Progress)) -> Result<StressResult, CaptureError> {
        validate_buffer(r.buffer_frames)?;
        let seconds = clamp_seconds(r.seconds);
        let load_pct = r.cpu_load_pct.min(100);
        let _running = self.begin()?;
        let gen = self.abort_gen.load(Relaxed);
        let lease = LeaseGuard::acquire(lease, r.device_name.clone())?;

        let cap = Probe::capacity_for(seconds, 96_000);
        let (in_probe, out_probe) = (Arc::new(Probe::with_capacity(cap)), Arc::new(Probe::with_capacity(cap)));
        let (in_shared, out_shared) = (Arc::new(Shared::default()), Arc::new(Shared::default()));

        let (input, in_notes) = self.open_input(r.device_name.as_deref(), r.sample_rate, r.buffer_frames, &in_probe, &in_shared);
        let out_rate = in_notes.meta.as_ref().map(|m| m.sample_rate).or(r.sample_rate);
        let silence_rate = out_rate.unwrap_or(48_000);
        let silence = PlayRequest::Buffer(
            BufferInput { sample_rate: silence_rate, left: vec![0.0; silence_rate as usize], right: vec![] },
            BufferOpts { level_dbfs: audio_out::SILENCE_DBFS, cap_dbfs: None, looped: true, ramp_ms: None },
        );
        let (handle, out_notes) = self.play(r.out_device.clone(), out_rate, r.buffer_frames, silence, &out_probe, &out_shared, None);

        let mut input = input;
        let any = input.is_some() || handle.is_some();
        let load = any.then(|| LoadGuard::start(load_pct));
        let load_threads = load.as_ref().map(|l| l.threads()).unwrap_or(0);
        let started = Instant::now();
        let mut last_progress: Option<Instant> = None;
        let frames_hint = r.buffer_frames;
        let ended = if !any {
            RunEnd::NoStreams
        } else {
            loop {
                if let Some(side) = input.as_mut() {
                    let n = side.consumer.slots();
                    if let Ok(chunk) = side.consumer.read_chunk(n) {
                        chunk.commit_all();
                    }
                }
                self.engine.tick();
                let elapsed = started.elapsed();
                if self.abort_gen.load(Relaxed) != gen {
                    break RunEnd::Aborted;
                }
                if !lease.still_held() {
                    break RunEnd::Preempted;
                }
                if in_shared.is_fatal() {
                    break RunEnd::DeviceLost;
                }
                if elapsed.as_secs_f64() >= seconds {
                    break RunEnd::Completed;
                }
                if elapsed >= HARD_TIMEOUT {
                    break RunEnd::Timeout;
                }
                if last_progress.is_none_or(|t| t.elapsed() >= PROGRESS_INTERVAL) {
                    last_progress = Some(Instant::now());
                    progress(&Progress { phase: "stress".into(), step: r.step, frames: frames_hint, elapsed_sec: elapsed.as_secs_f64() });
                }
                thread::sleep(LOOP_SLEEP);
            }
        };
        let load_stop_ms = load.map(|l| l.stop().as_secs_f64() * 1000.0).unwrap_or(0.0);
        if let Some(h) = handle {
            self.engine.stop(h);
        }
        if let Some(side) = input.take() {
            side.handle.close();
        }
        drop(lease);

        let inp = direction_report("input", r.buffer_frames, &in_notes, &in_probe, &in_shared, r.gap_floor_ms);
        let out = direction_report("output", r.buffer_frames, &out_notes, &out_probe, &out_shared, r.gap_floor_ms);
        let in_q = in_shared.snapshot();
        let mut stream_errors = in_q.stream_error_messages.clone();
        stream_errors.extend(out.stream_errors.iter().cloned());
        let max_opt = |a: Option<f64>, b: Option<f64>| match (a, b) {
            (Some(x), Some(y)) => Some(x.max(y)),
            (x, y) => x.or(y),
        };
        Ok(StressResult {
            requested: r.buffer_frames,
            actual: inp.stats.actual_frames.or(out.stats.actual_frames),
            callbacks: inp.stats.callbacks + out.stats.callbacks,
            xruns: inp.stats.gap_xruns + out.stats.gap_xruns,
            max_gap_ms: max_opt(inp.stats.gap_ms_max, out.stats.gap_ms_max),
            p99_gap_ms: max_opt(inp.stats.gap_ms_p99, out.stats.gap_ms_p99),
            overruns: in_q.overrun_samples,
            stream_errors,
            buffer_mode: combined_mode(inp.mode, out.mode),
            duplex: duplex_of(inp.mode, out.mode),
            input: inp,
            output: out,
            cpu_load_pct: load_pct,
            load_threads,
            load_stop_ms,
            seconds,
            ended,
            host_api: self.host_api.clone(),
        })
    }

    pub fn round_trip(&self, lease: &CaptureLease, r: &RoundTripRequest, progress: &dyn Fn(&Progress)) -> Result<RoundTripResult, CaptureError> {
        validate_buffer(r.buffer_frames)?;
        let stim = &r.stimulus;
        if !(audio_out::MIN_BUFFER_RATE..=audio_out::MAX_BUFFER_RATE).contains(&stim.sample_rate) {
            return Err(invalid("stimulus sampleRate must be between 8000 and 384000 Hz"));
        }
        let stim_secs = stim.left.len() as f64 / stim.sample_rate as f64;
        if stim.left.is_empty() || stim_secs > MAX_STIMULUS_SECONDS {
            return Err(invalid(format!("stimulus must be 1 sample to {MAX_STIMULUS_SECONDS} s long")));
        }
        if !stim.right.is_empty() && stim.right.len() != stim.left.len() {
            return Err(invalid("stimulus left and right must have the same length"));
        }
        let level = r.level_dbfs.unwrap_or(DEFAULT_LEVEL_DBFS);
        if !level.is_finite() {
            return Err(invalid("levelDbfs must be a number"));
        }
        let level = level.clamp(MIN_LEVEL_DBFS, audio_out::ABS_MAX_DBFS);
        let tail = r.tail_sec.filter(|t| t.is_finite()).unwrap_or(DEFAULT_TAIL_SECONDS).clamp(0.1, 3.0);
        let _running = self.begin()?;
        let gen = self.abort_gen.load(Relaxed);
        let lease = LeaseGuard::acquire(lease, r.device_name.clone())?;

        let run_secs = stim_secs + tail + 1.0;
        let cap = Probe::capacity_for(run_secs, 96_000);
        let (in_probe, out_probe) = (Arc::new(Probe::with_capacity(cap)), Arc::new(Probe::with_capacity(cap)));
        let (in_shared, out_shared) = (Arc::new(Shared::default()), Arc::new(Shared::default()));
        let (input, in_notes) = self.open_input(r.device_name.as_deref(), Some(stim.sample_rate), r.buffer_frames, &in_probe, &in_shared);

        let mut handle = None;
        let mut out_notes = OpenNotes::default();
        let align = Arc::new(AlignRecorder::new(in_probe.clone()));
        let mut acc = None;
        let mut input = input;
        if let Some(meta) = &in_notes.meta {
            acc = Some(Accumulator::new((meta.sample_rate as f64 * (run_secs + 1.0)).ceil() as usize));
            let req = PlayRequest::Buffer(
                stim.clone(),
                BufferOpts { level_dbfs: level, cap_dbfs: None, looped: false, ramp_ms: Some(audio_out::MIN_RAMP_MS) },
            );
            let (h, notes) = self.play(r.out_device.clone(), Some(meta.sample_rate), r.buffer_frames, req, &out_probe, &out_shared, Some(align.clone()));
            handle = h;
            out_notes = notes;
        } else {
            out_notes.open_error = Some("not attempted: the input did not open".into());
        }

        let started = Instant::now();
        let hard = Duration::from_secs_f64(run_secs + 5.0).min(HARD_TIMEOUT);
        let mut last_progress: Option<Instant> = None;
        let mut finished_at: Option<Instant> = None;
        let ended = match (input.as_mut(), handle) {
            (Some(side), Some(h)) => {
                let acc = acc.as_mut().expect("accumulator exists when the input opened");
                let channels = in_notes.meta.as_ref().map(|m| m.channels as usize).unwrap_or(2);
                loop {
                    acc.drain(&mut side.consumer, channels);
                    self.engine.tick();
                    if acc.clipped_l + acc.clipped_r > 0 {
                        self.engine.stop(h);
                        break RunEnd::Clipped;
                    }
                    if self.abort_gen.load(Relaxed) != gen {
                        break RunEnd::Aborted;
                    }
                    if !lease.still_held() {
                        break RunEnd::Preempted;
                    }
                    if in_shared.is_fatal() {
                        break RunEnd::DeviceLost;
                    }
                    match self.engine.ended_reason(h) {
                        Some(EndReason::Finished) => {
                            let t = *finished_at.get_or_insert_with(Instant::now);
                            if t.elapsed().as_secs_f64() >= tail {
                                break RunEnd::Completed;
                            }
                        }
                        Some(EndReason::DeviceError) | Some(EndReason::RenderFault) | Some(EndReason::Disabled) => break RunEnd::DeviceLost,
                        Some(_) => break RunEnd::Aborted,
                        None => {}
                    }
                    if started.elapsed() >= hard {
                        break RunEnd::Timeout;
                    }
                    if last_progress.is_none_or(|t| t.elapsed() >= PROGRESS_INTERVAL) {
                        last_progress = Some(Instant::now());
                        progress(&Progress { phase: "roundtrip".into(), step: r.step, frames: r.buffer_frames, elapsed_sec: started.elapsed().as_secs_f64() });
                    }
                    thread::sleep(LOOP_SLEEP);
                }
            }
            (Some(_), None) => {
                // Duplex unavailable (spike outcome D): still learn the input's
                // period, so the report says what the open side runs.
                let t = Instant::now();
                while in_probe.callbacks() < 3 && t.elapsed() < PROBE_ONLY_WAIT && self.abort_gen.load(Relaxed) == gen {
                    thread::sleep(LOOP_SLEEP);
                }
                RunEnd::NoStreams
            }
            _ => RunEnd::NoStreams,
        };
        if let Some(h) = handle {
            self.engine.stop(h);
        }
        if let Some(mut side) = input.take() {
            let channels = in_notes.meta.as_ref().map(|m| m.channels as usize).unwrap_or(2);
            side.handle.close();
            if let Some(acc) = acc.as_mut() {
                acc.drain(&mut side.consumer, channels);
            }
        }
        drop(lease);

        let inp = direction_report("input", r.buffer_frames, &in_notes, &in_probe, &in_shared, None);
        let out = direction_report("output", r.buffer_frames, &out_notes, &out_probe, &out_shared, None);
        if let Some(acc) = &acc {
            acc.publish(&in_shared);
        }
        let quality = in_shared.snapshot();
        let in_rate = in_notes.meta.as_ref().map(|m| m.sample_rate);
        let out_rate = out_notes.meta.as_ref().map(|m| m.sample_rate);
        let alignment = match (in_rate, out_rate) {
            (Some(i), Some(o)) => alignment_from_pairs(&align.pairs(), i, o),
            _ => None,
        };
        let captured = match (ended, acc, in_rate) {
            (RunEnd::Completed, Some(acc), Some(rate)) => Some(Captured { sample_rate: rate, left: acc.left, right: acc.right }),
            _ => None,
        };
        Ok(RoundTripResult {
            captured,
            quality,
            reported_buffer_frames: ReportedFrames { input: inp.stats.actual_frames, out: out.stats.actual_frames },
            alignment,
            output_sample_rate: out_rate,
            output_level_dbfs: out_rate.map(|_| level),
            buffer_mode: combined_mode(inp.mode, out.mode),
            duplex: duplex_of(inp.mode, out.mode),
            input: inp,
            output: out,
            ended,
            scope: scope_label(&self.host_api),
            host_api: self.host_api.clone(),
        })
    }
}

// ------------------------------------------------------------ cpal factory

/// cpal default host (WASAPI shared mode on Windows). Each stream lives on its
/// own thread because `cpal::Stream` is not `Send` on every platform.
pub struct CpalFactory;

fn find_device(input: bool, name: Option<&str>) -> Result<cpal::Device, String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let host = cpal::default_host();
    let label = if input { "input" } else { "output" };
    if let Some(target) = name {
        let devices: Vec<cpal::Device> = if input {
            host.input_devices().map_err(|e| e.to_string())?.collect()
        } else {
            host.output_devices().map_err(|e| e.to_string())?.collect()
        };
        return devices
            .into_iter()
            .find(|d| d.name().ok().as_deref() == Some(target))
            .ok_or_else(|| format!("Audio {label} not found: {target}"));
    }
    let d = if input { host.default_input_device() } else { host.default_output_device() };
    d.ok_or_else(|| format!("No default audio {label} is available."))
}

/// Default config, or the closest one supporting `rate`.
fn pick_config(device: &cpal::Device, input: bool, rate: Option<u32>) -> Result<cpal::SupportedStreamConfig, String> {
    use cpal::traits::DeviceTrait;
    use cpal::SampleFormat;
    let default = if input { device.default_input_config() } else { device.default_output_config() }.map_err(|e| e.to_string())?;
    let Some(rate) = rate else { return Ok(default) };
    if default.sample_rate().0 == rate {
        return Ok(default);
    }
    let usable = |f: SampleFormat| matches!(f, SampleFormat::F32 | SampleFormat::I16 | SampleFormat::U16 | SampleFormat::I32);
    let ranges: Vec<cpal::SupportedStreamConfigRange> = if input {
        device.supported_input_configs().map_err(|e| e.to_string())?.collect()
    } else {
        device.supported_output_configs().map_err(|e| e.to_string())?.collect()
    };
    let mut best: Option<(u8, cpal::SupportedStreamConfigRange)> = None;
    for range in ranges {
        if range.min_sample_rate().0 > rate || range.max_sample_rate().0 < rate || !usable(range.sample_format()) || range.channels() == 0 {
            continue;
        }
        let score = 2 * (range.channels() == default.channels()) as u8 + (range.sample_format() == default.sample_format()) as u8;
        if best.as_ref().is_none_or(|(s, _)| score > *s) {
            best = Some((score, range));
        }
    }
    // The rate is a preference: fall back to the default rate rather than fail.
    Ok(best.map(|(_, r)| r.with_sample_rate(cpal::SampleRate(rate))).unwrap_or(default))
}

fn stream_config(supported: &cpal::SupportedStreamConfig, buffer: Option<u32>) -> cpal::StreamConfig {
    let mut c: cpal::StreamConfig = supported.config();
    c.buffer_size = match buffer {
        Some(n) => cpal::BufferSize::Fixed(n),
        None => cpal::BufferSize::Default,
    };
    c
}

fn err_fn(on_error: ErrCb) -> impl FnMut(cpal::StreamError) + Send + 'static {
    move |e| {
        let fatal = matches!(e, cpal::StreamError::DeviceNotAvailable);
        on_error(e.to_string(), fatal)
    }
}

fn build_input<T: cpal::SizedSample + Send + 'static>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    mut cb: InputCb,
    on_error: ErrCb,
    convert: fn(T) -> f32,
) -> Result<cpal::Stream, String> {
    use cpal::traits::DeviceTrait;
    let channels = config.channels as usize;
    let mut scratch: Vec<f32> = Vec::with_capacity(8192 * channels.max(1));
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                if scratch.capacity() < data.len() {
                    scratch.reserve(data.len() - scratch.len()); // rare: device grew its buffer
                }
                scratch.clear();
                scratch.extend(data.iter().map(|&v| convert(v)));
                cb(&scratch, channels);
            },
            err_fn(on_error),
            None,
        )
        .map_err(|e| e.to_string())
}

fn build_output<T: cpal::SizedSample + cpal::FromSample<f32> + Send + 'static>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    mut cb: OutputCb,
    on_error: ErrCb,
) -> Result<cpal::Stream, String> {
    use cpal::traits::DeviceTrait;
    let channels = config.channels as usize;
    let mut scratch = vec![0.0f32; 8192 * channels.max(1)];
    device
        .build_output_stream(
            config,
            move |data: &mut [T], _| {
                if scratch.len() < data.len() {
                    scratch.resize(data.len(), 0.0);
                }
                let buf = &mut scratch[..data.len()];
                cb(buf, channels);
                // Converting never raises a level: the renderer has already capped it.
                for (o, s) in data.iter_mut().zip(buf.iter()) {
                    *o = T::from_sample(*s);
                }
            },
            err_fn(on_error),
            None,
        )
        .map_err(|e| e.to_string())
}

/// Runs `build` on a dedicated thread that keeps the stream alive until the
/// handle is closed.
fn spawn_stream(name: &str, build: impl FnOnce() -> Result<(cpal::Stream, StreamMeta), String> + Send + 'static) -> Result<(StreamMeta, StreamHandle), String> {
    use cpal::traits::StreamTrait;
    let (tx, rx) = mpsc::channel();
    let stop = Arc::new(AtomicBool::new(false));
    let stop_t = stop.clone();
    let thread = thread::Builder::new()
        .name(name.into())
        .spawn(move || match build() {
            Ok((stream, meta)) => {
                if let Err(e) = stream.play() {
                    let _ = tx.send(Err(format!("could not start the stream: {e}")));
                    return;
                }
                if tx.send(Ok(meta)).is_err() {
                    return;
                }
                while !stop_t.load(Relaxed) {
                    thread::sleep(Duration::from_millis(5));
                }
                let _ = stream.pause();
                drop(stream);
            }
            Err(e) => {
                let _ = tx.send(Err(e));
            }
        })
        .map_err(|e| e.to_string())?;
    match rx.recv_timeout(OPEN_TIMEOUT) {
        Ok(Ok(meta)) => Ok((meta, StreamHandle::new(stop, thread))),
        Ok(Err(e)) => {
            let _ = thread.join();
            Err(e)
        }
        Err(_) => {
            stop.store(true, Relaxed);
            Err("Timed out opening the audio stream.".into())
        }
    }
}

impl StreamFactory for CpalFactory {
    fn open_input(&self, device: Option<&str>, rate: Option<u32>, buffer: Option<u32>, make: MakeInput, on_error: ErrCb) -> Result<(StreamMeta, StreamHandle), String> {
        let name = device.map(str::to_string);
        spawn_stream("deckchek-latency-in", move || {
            use cpal::traits::DeviceTrait;
            use cpal::SampleFormat;
            let dev = find_device(true, name.as_deref())?;
            let device_name = dev.name().unwrap_or_else(|_| "Unnamed audio input".into());
            let supported = pick_config(&dev, true, rate)?;
            let config = stream_config(&supported, buffer);
            if config.channels == 0 {
                return Err("Input device reported zero channels.".into());
            }
            let cb = make(config.sample_rate.0, config.channels);
            let stream = match supported.sample_format() {
                SampleFormat::F32 => build_input::<f32>(&dev, &config, cb, on_error, |v| v),
                SampleFormat::I16 => build_input::<i16>(&dev, &config, cb, on_error, crate::audio::sample_i16),
                SampleFormat::U16 => build_input::<u16>(&dev, &config, cb, on_error, crate::audio::sample_u16),
                SampleFormat::I32 => build_input::<i32>(&dev, &config, cb, on_error, |v| v as f32 / 2_147_483_648.0),
                other => Err(format!("Input sample format {other:?} is not supported.")),
            }?;
            Ok((stream, StreamMeta { device_name, sample_rate: config.sample_rate.0, channels: config.channels }))
        })
    }

    fn open_output(&self, device: Option<&str>, rate: Option<u32>, buffer: Option<u32>, make: MakeOutput, on_error: ErrCb) -> Result<(StreamMeta, StreamHandle), String> {
        let name = device.map(str::to_string);
        spawn_stream("deckchek-latency-out", move || {
            use cpal::traits::DeviceTrait;
            use cpal::SampleFormat;
            let dev = find_device(false, name.as_deref())?;
            let device_name = dev.name().unwrap_or_else(|_| "Unnamed audio output".into());
            let supported = pick_config(&dev, false, rate)?;
            let config = stream_config(&supported, buffer);
            if config.channels == 0 {
                return Err("Output device reported zero channels.".into());
            }
            let cb = make(config.sample_rate.0, config.channels)?;
            let stream = match supported.sample_format() {
                SampleFormat::F32 => build_output::<f32>(&dev, &config, cb, on_error),
                SampleFormat::I16 => build_output::<i16>(&dev, &config, cb, on_error),
                SampleFormat::U16 => build_output::<u16>(&dev, &config, cb, on_error),
                SampleFormat::I32 => build_output::<i32>(&dev, &config, cb, on_error),
                other => Err(format!("Output sample format {other:?} is not supported.")),
            }?;
            Ok((stream, StreamMeta { device_name, sample_rate: config.sample_rate.0, channels: config.channels }))
        })
    }
}

// ------------------------------------------------------ device buffer info

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BufferRange {
    pub min_frames: Option<u32>,
    pub max_frames: Option<u32>,
    /// cpal does not expose the default period before a stream runs.
    pub default: Option<u32>,
    /// False when the host reports `SupportedBufferSize::Unknown`.
    pub known: bool,
}

pub fn buffer_range(b: &cpal::SupportedBufferSize) -> BufferRange {
    match b {
        cpal::SupportedBufferSize::Range { min, max } => BufferRange { min_frames: Some(*min), max_frames: Some(*max), default: None, known: true },
        cpal::SupportedBufferSize::Unknown => BufferRange { min_frames: None, max_frames: None, default: None, known: false },
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceBufferInfo {
    pub device_name: Option<String>,
    pub output_device_name: Option<String>,
    pub host_api: String,
    pub sample_rate: Option<u32>,
    pub input: Option<BufferRange>,
    pub output: Option<BufferRange>,
    /// The host reports a buffer range, so a Fixed request is worth trying.
    /// Whether it is honoured is only known after a run (`BufferMode`).
    pub supports_fixed: bool,
    pub errors: Vec<String>,
}

fn device_buffer_info(device_name: Option<String>, out_device: Option<String>) -> DeviceBufferInfo {
    use cpal::traits::DeviceTrait;
    let host = cpal::default_host();
    let mut errors = Vec::new();
    let mut info = DeviceBufferInfo {
        device_name: None,
        output_device_name: None,
        host_api: host.id().name().to_string(),
        sample_rate: None,
        input: None,
        output: None,
        supports_fixed: false,
        errors: vec![],
    };
    match find_device(true, device_name.as_deref()).and_then(|d| d.default_input_config().map(|c| (d, c)).map_err(|e| e.to_string())) {
        Ok((d, c)) => {
            info.device_name = d.name().ok();
            info.sample_rate = Some(c.sample_rate().0);
            info.input = Some(buffer_range(c.buffer_size()));
        }
        Err(e) => errors.push(format!("input: {e}")),
    }
    let out_name = out_device.or(device_name);
    match find_device(false, out_name.as_deref()).and_then(|d| d.default_output_config().map(|c| (d, c)).map_err(|e| e.to_string())) {
        Ok((d, c)) => {
            info.output_device_name = d.name().ok();
            info.sample_rate = info.sample_rate.or(Some(c.sample_rate().0));
            info.output = Some(buffer_range(c.buffer_size()));
        }
        Err(e) => errors.push(format!("output: {e}")),
    }
    info.supports_fixed = info.input.iter().chain(info.output.iter()).any(|r| r.known);
    info.errors = errors;
    info
}

// --------------------------------------------------- global tuner + hooks

static TUNER: OnceLock<Tuner> = OnceLock::new();

pub fn global() -> &'static Tuner {
    TUNER.get_or_init(|| Tuner::new(Arc::new(CpalFactory), cpal::default_host().id().name()))
}

/// Chained panic hook: a panic anywhere silences the tuner's output (its own
/// audio_out engine) within one renderer poll. Safe to call twice.
pub fn install_panic_guard() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let prev = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            if let Some(t) = TUNER.get() {
                t.kill();
            }
            prev(info);
        }));
    });
}

fn emitter(app: AppHandle) -> impl Fn(&Progress) {
    move |p: &Progress| {
        let _ = app.emit("latency://progress", p);
    }
}

// ------------------------------------------------------ Windows tuning scan

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcDc {
    pub ac: Option<u32>,
    pub dc: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivePlan {
    pub name: String,
    pub guid: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedStatus {
    pub name: String,
    pub status: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DpcProxy {
    pub dpc_pct: Option<f64>,
    pub interrupt_pct: Option<f64>,
    pub samples: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JitterStats {
    pub samples: usize,
    pub mean_ms: f64,
    pub p99_ms: f64,
    pub max_ms: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TuningScan {
    pub supported: bool,
    pub active_plan: Option<ActivePlan>,
    pub usb_selective_suspend: AcDc,
    pub min_processor_state: AcDc,
    pub min_cores: AcDc,
    pub wifi: Vec<NamedStatus>,
    pub bluetooth: Vec<NamedStatus>,
    /// `NtQueryTimerResolution` is not called (FS-11 §6); see `timerJitter`.
    pub timer_resolution_ms: Option<f64>,
    pub timer_jitter: Option<JitterStats>,
    pub dpc_proxy: DpcProxy,
    pub on_battery: Option<bool>,
    pub background_apps: Vec<crate::processes::CpuUse>,
    pub errors: Vec<String>,
}

#[cfg_attr(not(windows), allow(dead_code))]
pub const USB_SUBGROUP: &str = "2a737441-1930-4402-8d77-b2bebba308a3";
#[cfg_attr(not(windows), allow(dead_code))]
pub const USB_SELECTIVE_SUSPEND: &str = "48e6b7a6-50f5-4782-a5d4-53bb8f07e226";
#[cfg_attr(not(windows), allow(dead_code))]
const MAX_NAMED: usize = 20;

#[cfg_attr(not(windows), allow(dead_code))]
fn is_guid(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    parts.len() == 5
        && parts.iter().zip([8, 4, 4, 4, 12]).all(|(p, n)| p.len() == n && p.chars().all(|c| c.is_ascii_hexdigit()))
}

#[cfg_attr(not(windows), allow(dead_code))]
fn find_guid(line: &str) -> Option<String> {
    line.split(|c: char| c.is_whitespace() || c == ':' || c == '(' || c == ')').find(|t| is_guid(t)).map(|t| t.to_ascii_lowercase())
}

#[cfg_attr(not(windows), allow(dead_code))]
/// `powercfg /getactivescheme` in any locale: the GUID and the name in the last parentheses.
pub fn parse_active_scheme(text: &str) -> Option<ActivePlan> {
    for line in text.lines() {
        if let Some(guid) = find_guid(line) {
            let name = match (line.rfind('('), line.rfind(')')) {
                (Some(a), Some(b)) if b > a => line[a + 1..b].trim().to_string(),
                _ => String::new(),
            };
            return Some(ActivePlan { name, guid });
        }
    }
    None
}

#[cfg_attr(not(windows), allow(dead_code))]
fn hex_value(line: &str) -> Option<u32> {
    let t = line.split_whitespace().last()?;
    let h = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X"))?;
    u32::from_str_radix(h, 16).ok()
}

#[cfg_attr(not(windows), allow(dead_code))]
/// AC/DC values of one setting in `powercfg /query` output, located by its
/// GUID or alias token (e.g. `PROCTHROTTLEMIN`). Locale-independent: a setting
/// block starts at a line holding a GUID, and its current AC and DC indexes are
/// the last two hex values in the block.
pub fn parse_powercfg_setting(text: &str, key: &str) -> AcDc {
    let key = key.to_ascii_lowercase();
    let mut blocks: Vec<Vec<&str>> = Vec::new();
    for line in text.lines() {
        if find_guid(line).is_some() || blocks.is_empty() {
            blocks.push(Vec::new());
        }
        if let Some(b) = blocks.last_mut() {
            b.push(line);
        }
    }
    let has_key = |b: &Vec<&str>| {
        b.iter().any(|l| l.split(|c: char| c.is_whitespace() || c == ':' || c == '(' || c == ')').any(|t| t.eq_ignore_ascii_case(&key)))
    };
    let Some(block) = blocks.iter().find(|b| has_key(b)) else { return AcDc::default() };
    let hex: Vec<u32> = block.iter().filter_map(|l| hex_value(l)).collect();
    if hex.len() < 2 {
        return AcDc::default();
    }
    AcDc { ac: Some(hex[hex.len() - 2]), dc: Some(hex[hex.len() - 1]) }
}

#[cfg_attr(not(windows), allow(dead_code))]
fn parse_number(s: &str) -> Option<f64> {
    let t = s.trim();
    let t = if t.contains(',') && !t.contains('.') { t.replace(',', ".") } else { t.to_string() };
    t.parse::<f64>().ok().filter(|v| v.is_finite())
}

#[cfg_attr(not(windows), allow(dead_code))]
/// Win32_Battery.BatteryStatus -> on battery? (1 discharging, 4 low, 5 critical).
pub fn battery_on_battery(status: &str) -> Option<bool> {
    match status.trim() {
        "none" => Some(false),
        "1" | "4" | "5" => Some(true),
        "2" | "3" | "6" | "7" | "8" | "9" | "11" => Some(false),
        _ => None,
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PsFacts {
    pub wifi: Vec<NamedStatus>,
    pub bluetooth: Vec<NamedStatus>,
    pub on_battery: Option<bool>,
    pub dpc: DpcProxy,
}

#[cfg_attr(not(windows), allow(dead_code))]
/// Tab-separated sections printed by the fixed scan script.
pub fn parse_ps_facts(text: &str) -> PsFacts {
    let mut f = PsFacts::default();
    let (mut dpc_sum, mut int_sum, mut n) = (0.0, 0.0, 0u32);
    for line in text.lines() {
        let cols: Vec<&str> = line.trim_end_matches('\r').split('\t').collect();
        match cols.as_slice() {
            ["WIFI", name, status] if f.wifi.len() < MAX_NAMED => f.wifi.push(NamedStatus { name: name.trim().into(), status: status.trim().into() }),
            ["BT", name, status] if f.bluetooth.len() < MAX_NAMED => f.bluetooth.push(NamedStatus { name: name.trim().into(), status: status.trim().into() }),
            ["BATTERY", s] => {
                let v = battery_on_battery(s);
                f.on_battery = match (f.on_battery, v) {
                    (Some(true), _) | (_, Some(true)) => Some(true),
                    (a, b) => b.or(a),
                };
            }
            ["DPC", d, i] => {
                if let (Some(d), Some(i)) = (parse_number(d), parse_number(i)) {
                    dpc_sum += d;
                    int_sum += i;
                    n += 1;
                }
            }
            _ => {}
        }
    }
    if n > 0 {
        let r = |v: f64| (v / n as f64 * 100.0).round() / 100.0;
        f.dpc = DpcProxy { dpc_pct: Some(r(dpc_sum)), interrupt_pct: Some(r(int_sum)), samples: n };
    }
    f
}

#[cfg_attr(not(windows), allow(dead_code))]
/// Wake-up error statistics of `requested_ms` sleeps.
pub fn jitter_stats(wake_errors_ms: &[f64]) -> Option<JitterStats> {
    let mut v: Vec<f64> = wake_errors_ms.iter().copied().filter(|x| x.is_finite()).map(|x| x.max(0.0)).collect();
    if v.is_empty() {
        return None;
    }
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = (((v.len() - 1) as f64) * 0.99).round() as usize;
    Some(JitterStats { samples: v.len(), mean_ms: v.iter().sum::<f64>() / v.len() as f64, p99_ms: v[idx], max_ms: v[v.len() - 1] })
}

#[cfg_attr(not(windows), allow(dead_code))]
/// FS-11 §6 timer-jitter test: `n` 1 ms sleeps, wake error each.
pub fn measure_timer_jitter(n: usize) -> Option<JitterStats> {
    let target = Duration::from_millis(1);
    let errs: Vec<f64> = (0..n)
        .map(|_| {
            let t = Instant::now();
            thread::sleep(target);
            (t.elapsed().as_secs_f64() - target.as_secs_f64()) * 1000.0
        })
        .collect();
    jitter_stats(&errs)
}

#[cfg(windows)]
fn scan_blocking(dpc_seconds: u32) -> TuningScan {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let run = |exe: &str, args: &[&str], secs: u64| {
        let mut cmd = Command::new(exe);
        cmd.args(args);
        cmd.creation_flags(CREATE_NO_WINDOW);
        crate::system_check::run_with_timeout(cmd, Duration::from_secs(secs))
    };
    let mut s = TuningScan { supported: true, ..Default::default() };
    match run("powercfg.exe", &["/getactivescheme"], 15) {
        Ok(t) => s.active_plan = parse_active_scheme(&t),
        Err(e) => s.errors.push(format!("powercfg /getactivescheme: {e}")),
    }
    match run("powercfg.exe", &["/query", "SCHEME_CURRENT", USB_SUBGROUP, USB_SELECTIVE_SUSPEND], 15) {
        Ok(t) => s.usb_selective_suspend = parse_powercfg_setting(&t, USB_SELECTIVE_SUSPEND),
        Err(e) => s.errors.push(format!("powercfg USB selective suspend: {e}")),
    }
    match run("powercfg.exe", &["/query", "SCHEME_CURRENT", "SUB_PROCESSOR"], 15) {
        Ok(t) => {
            s.min_processor_state = parse_powercfg_setting(&t, "PROCTHROTTLEMIN");
            s.min_cores = parse_powercfg_setting(&t, "CPMINCORES");
        }
        Err(e) => s.errors.push(format!("powercfg SUB_PROCESSOR: {e}")),
    }
    // Fixed script; the only interpolated value is a clamped integer.
    let script = format!(
        "$ErrorActionPreference='SilentlyContinue'; $inv=[cultureinfo]::InvariantCulture; \
         Get-NetAdapter -Physical | Where-Object {{ $_.PhysicalMediaType -match '802\\.11|Wireless' -or $_.InterfaceDescription -match 'Wi-?Fi|Wireless|WLAN|802\\.11' }} | ForEach-Object {{ \"WIFI`t\" + ($_.Name -replace \"`t\",' ') + \"`t\" + $_.Status }}; \
         Get-PnpDevice -Class Bluetooth -PresentOnly | Where-Object {{ $_.FriendlyName }} | ForEach-Object {{ \"BT`t\" + ($_.FriendlyName -replace \"`t\",' ') + \"`t\" + $_.Status }}; \
         $b = @(Get-CimInstance -ClassName Win32_Battery); if ($b.Count -gt 0) {{ foreach ($x in $b) {{ \"BATTERY`t\" + $x.BatteryStatus }} }} else {{ \"BATTERY`tnone\" }}; \
         $sets = Get-Counter -Counter '\\Processor Information(_Total)\\% DPC Time','\\Processor Information(_Total)\\% Interrupt Time' -SampleInterval 1 -MaxSamples {n}; \
         foreach ($set in $sets) {{ $d=$null; $i=$null; foreach ($c in $set.CounterSamples) {{ if ($c.Path -like '*dpc time') {{ $d=$c.CookedValue }} elseif ($c.Path -like '*interrupt time') {{ $i=$c.CookedValue }} }}; if ($d -ne $null -and $i -ne $null) {{ \"DPC`t\" + ([double]$d).ToString($inv) + \"`t\" + ([double]$i).ToString($inv) }} }}",
        n = dpc_seconds
    );
    match run("powershell.exe", &["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script], 20 + dpc_seconds as u64) {
        Ok(t) => {
            let f = parse_ps_facts(&t);
            s.wifi = f.wifi;
            s.bluetooth = f.bluetooth;
            s.on_battery = f.on_battery;
            s.dpc_proxy = f.dpc;
            if s.dpc_proxy.samples == 0 {
                s.errors.push("DPC counters unavailable (non-English counter names or no access).".into());
            }
        }
        Err(e) => s.errors.push(format!("PowerShell scan: {e}")),
    }
    s.timer_jitter = measure_timer_jitter(200);
    s
}

#[cfg(not(windows))]
fn scan_blocking(_dpc_seconds: u32) -> TuningScan {
    TuningScan { supported: false, ..Default::default() }
}

// ------------------------------------------------------------ persistence

pub const KINDS: &[&str] = &["roundtrip", "stress"];
pub const SOFTWARE: &[&str] = &["serato", "traktor", "rekordbox"];
pub const MAX_DETAIL_BYTES: usize = 64 * 1024;
pub const MAX_NAME_CHARS: usize = 200;
pub const MAX_VERDICT_CHARS: usize = 1000;
pub const DEFAULT_LIST_LIMIT: u32 = 50;
pub const MAX_LIST_LIMIT: u32 = 500;

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatencyRunInput {
    pub session_id: Option<String>,
    pub setup_id: Option<String>,
    pub device_name: String,
    pub host_api: Option<String>,
    pub sample_rate_hz: i64,
    pub kind: String,
    pub buffer_frames: Option<i64>,
    pub cpu_load_pct: Option<i64>,
    pub measured_ms: Option<f64>,
    pub std_ms: Option<f64>,
    pub expanded_u_ms: Option<f64>,
    pub reported_ms: Option<f64>,
    pub xruns: Option<i64>,
    pub max_gap_ms: Option<f64>,
    pub verdict: Option<String>,
    pub detail: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatencyRun {
    pub id: String,
    pub session_id: Option<String>,
    pub setup_id: Option<String>,
    pub device_name: String,
    pub host_api: Option<String>,
    pub sample_rate_hz: i64,
    pub kind: String,
    pub buffer_frames: Option<i64>,
    pub cpu_load_pct: Option<i64>,
    pub measured_ms: Option<f64>,
    pub std_ms: Option<f64>,
    pub expanded_u_ms: Option<f64>,
    pub reported_ms: Option<f64>,
    pub xruns: Option<i64>,
    pub max_gap_ms: Option<f64>,
    pub verdict: Option<String>,
    pub detail: Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatencyRunFilter {
    pub device_name: Option<String>,
    pub kind: Option<String>,
    pub session_id: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationInput {
    pub device_name: String,
    pub software: String,
    pub frames: i64,
    pub ms: f64,
    pub based_on_run_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recommendation {
    pub id: String,
    pub device_name: String,
    pub software: String,
    pub frames: i64,
    pub ms: f64,
    pub based_on_run_id: Option<String>,
    pub created_at: String,
}

fn bad(msg: impl std::fmt::Display) -> String {
    format!("LATENCY_INVALID: {msg}")
}

fn db_err(e: rusqlite::Error) -> String {
    format!("LATENCY_DB: {e}")
}

fn clean(v: &Option<String>) -> Option<String> {
    v.as_ref().map(|t| t.trim().to_string()).filter(|t| !t.is_empty())
}

fn check_num(name: &str, v: Option<f64>, lo: f64, hi: f64) -> Result<(), String> {
    match v {
        Some(x) if !x.is_finite() || x < lo || x > hi => Err(bad(format!("{name} must be a finite number between {lo} and {hi}"))),
        _ => Ok(()),
    }
}

fn check_int(name: &str, v: Option<i64>, lo: i64, hi: i64) -> Result<(), String> {
    match v {
        Some(x) if x < lo || x > hi => Err(bad(format!("{name} must be between {lo} and {hi}"))),
        _ => Ok(()),
    }
}

fn check_name(name: &str, v: &str) -> Result<(), String> {
    let t = v.trim();
    if t.is_empty() || t.chars().count() > MAX_NAME_CHARS {
        return Err(bad(format!("{name} must be 1-{MAX_NAME_CHARS} characters")));
    }
    Ok(())
}

pub fn validate_run(i: &LatencyRunInput) -> Result<String, String> {
    if !KINDS.contains(&i.kind.as_str()) {
        return Err(bad(format!("kind must be one of {}", KINDS.join(", "))));
    }
    check_name("deviceName", &i.device_name)?;
    if let Some(h) = &i.host_api {
        if h.chars().count() > 40 {
            return Err(bad("hostApi is limited to 40 characters"));
        }
    }
    check_int("sampleRateHz", Some(i.sample_rate_hz), 8_000, 384_000)?;
    check_int("bufferFrames", i.buffer_frames, 1, 65_536)?;
    check_int("cpuLoadPct", i.cpu_load_pct, 0, 100)?;
    check_int("xruns", i.xruns, 0, i64::MAX)?;
    check_num("measuredMs", i.measured_ms, -1000.0, 10_000.0)?;
    check_num("stdMs", i.std_ms, 0.0, 10_000.0)?;
    check_num("expandedUMs", i.expanded_u_ms, 0.0, 10_000.0)?;
    check_num("reportedMs", i.reported_ms, 0.0, 10_000.0)?;
    check_num("maxGapMs", i.max_gap_ms, 0.0, 600_000.0)?;
    if i.verdict.as_ref().is_some_and(|v| v.chars().count() > MAX_VERDICT_CHARS) {
        return Err(bad(format!("verdict is limited to {MAX_VERDICT_CHARS} characters")));
    }
    let detail = match &i.detail {
        None | Some(Value::Null) => "{}".to_string(),
        Some(v @ Value::Object(_)) => serde_json::to_string(v).map_err(bad)?,
        Some(_) => return Err(bad("detail must be an object")),
    };
    if detail.len() > MAX_DETAIL_BYTES {
        return Err(bad(format!("detail is limited to {MAX_DETAIL_BYTES} bytes")));
    }
    Ok(detail)
}

fn exists(conn: &Connection, table: &str, id: &str) -> Result<bool, String> {
    // `table` is one of the literals used below, never user input.
    conn.query_row(&format!("SELECT 1 FROM {table} WHERE id = ?1"), [id], |_| Ok(())).optional().map(|o| o.is_some()).map_err(db_err)
}

const RUN_COLS: &str = "id, session_id, setup_id, device_name, host_api, sample_rate_hz, kind, buffer_frames, cpu_load_pct, measured_ms, std_ms, \
                        expanded_u_ms, reported_ms, xruns, max_gap_ms, verdict, detail_json, created_at";

fn run_row(r: &rusqlite::Row) -> rusqlite::Result<LatencyRun> {
    Ok(LatencyRun {
        id: r.get(0)?,
        session_id: r.get(1)?,
        setup_id: r.get(2)?,
        device_name: r.get(3)?,
        host_api: r.get(4)?,
        sample_rate_hz: r.get(5)?,
        kind: r.get(6)?,
        buffer_frames: r.get(7)?,
        cpu_load_pct: r.get(8)?,
        measured_ms: r.get(9)?,
        std_ms: r.get(10)?,
        expanded_u_ms: r.get(11)?,
        reported_ms: r.get(12)?,
        xruns: r.get(13)?,
        max_gap_ms: r.get(14)?,
        verdict: r.get(15)?,
        detail: serde_json::from_str(&r.get::<_, String>(16)?).unwrap_or_else(|_| Value::Object(Default::default())),
        created_at: r.get(17)?,
    })
}

pub fn save_run(conn: &Connection, i: &LatencyRunInput) -> Result<LatencyRun, String> {
    let detail = validate_run(i)?;
    let (session_id, setup_id) = (clean(&i.session_id), clean(&i.setup_id));
    for (table, id) in [("session", &session_id), ("setup", &setup_id)] {
        if let Some(id) = id {
            if !exists(conn, table, id)? {
                return Err(format!("LATENCY_NOT_FOUND: unknown {table} '{id}'"));
            }
        }
    }
    let id = new_id();
    let now = now_iso(conn)?;
    conn.execute(
        &format!("INSERT INTO latency_run ({RUN_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)"),
        params![
            id,
            session_id,
            setup_id,
            i.device_name.trim(),
            clean(&i.host_api),
            i.sample_rate_hz,
            i.kind,
            i.buffer_frames,
            i.cpu_load_pct,
            i.measured_ms,
            i.std_ms,
            i.expanded_u_ms,
            i.reported_ms,
            i.xruns,
            i.max_gap_ms,
            clean(&i.verdict),
            detail,
            now
        ],
    )
    .map_err(db_err)?;
    get_run(conn, &id)?.ok_or_else(|| format!("LATENCY_DB: run '{id}' vanished after insert"))
}

pub fn get_run(conn: &Connection, id: &str) -> Result<Option<LatencyRun>, String> {
    conn.query_row(&format!("SELECT {RUN_COLS} FROM latency_run WHERE id = ?1"), [id], run_row).optional().map_err(db_err)
}

/// Newest first; filters combine with AND.
pub fn list_runs(conn: &Connection, f: &LatencyRunFilter) -> Result<Vec<LatencyRun>, String> {
    if let Some(k) = &f.kind {
        if !KINDS.contains(&k.as_str()) {
            return Err(bad(format!("kind must be one of {}", KINDS.join(", "))));
        }
    }
    let limit = f.limit.unwrap_or(DEFAULT_LIST_LIMIT).clamp(1, MAX_LIST_LIMIT);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {RUN_COLS} FROM latency_run WHERE (?1 IS NULL OR device_name = ?1) AND (?2 IS NULL OR kind = ?2) AND (?3 IS NULL OR session_id = ?3)
             ORDER BY created_at DESC, id LIMIT ?4"
        ))
        .map_err(db_err)?;
    let rows = stmt.query_map(params![clean(&f.device_name), f.kind, clean(&f.session_id), limit], run_row).map_err(db_err)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(db_err)
}

pub fn delete_run(conn: &Connection, id: &str) -> Result<bool, String> {
    conn.execute("DELETE FROM latency_run WHERE id = ?1", [id]).map(|n| n > 0).map_err(db_err)
}

pub fn save_recommendation(conn: &Connection, i: &RecommendationInput) -> Result<Recommendation, String> {
    check_name("deviceName", &i.device_name)?;
    if !SOFTWARE.contains(&i.software.as_str()) {
        return Err(bad(format!("software must be one of {}", SOFTWARE.join(", "))));
    }
    check_int("frames", Some(i.frames), 1, 65_536)?;
    check_num("ms", Some(i.ms), 0.0, 10_000.0)?;
    let based = clean(&i.based_on_run_id);
    if let Some(r) = &based {
        if !exists(conn, "latency_run", r)? {
            return Err(format!("LATENCY_NOT_FOUND: unknown latency_run '{r}'"));
        }
    }
    let id = new_id();
    let now = now_iso(conn)?;
    conn.execute(
        "INSERT INTO buffer_recommendation (id, device_name, software, frames, ms, based_on_run_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, i.device_name.trim(), i.software, i.frames, i.ms, based, now],
    )
    .map_err(db_err)?;
    Ok(Recommendation { id, device_name: i.device_name.trim().into(), software: i.software.clone(), frames: i.frames, ms: i.ms, based_on_run_id: based, created_at: now })
}

/// Latest recommendation per software for a device.
pub fn latest_recommendations(conn: &Connection, device_name: &str) -> Result<Vec<Recommendation>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, device_name, software, frames, ms, based_on_run_id, created_at FROM buffer_recommendation r
             WHERE device_name = ?1 AND id = (SELECT id FROM buffer_recommendation q WHERE q.device_name = r.device_name AND q.software = r.software
                                              ORDER BY created_at DESC, id LIMIT 1)
             ORDER BY software",
        )
        .map_err(db_err)?;
    let rows = stmt
        .query_map([device_name.trim()], |r| {
            Ok(Recommendation {
                id: r.get(0)?,
                device_name: r.get(1)?,
                software: r.get(2)?,
                frames: r.get(3)?,
                ms: r.get(4)?,
                based_on_run_id: r.get(5)?,
                created_at: r.get(6)?,
            })
        })
        .map_err(db_err)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(db_err)
}

// ---------------------------------------------------------------- commands

async fn blocking<T: Send + 'static, E: Send + 'static + From<String>>(f: impl FnOnce() -> Result<T, E> + Send + 'static) -> Result<T, E> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| E::from(e.to_string()))?
}

#[tauri::command]
pub async fn audio_device_buffer_info(device_name: Option<String>, out_device: Option<String>) -> Result<DeviceBufferInfo, String> {
    blocking(move || Ok(device_buffer_info(device_name, out_device))).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn latency_play_and_capture(
    app: AppHandle,
    state: State<'_, LiveCaptureState>,
    device_name: Option<String>,
    out_device: Option<String>,
    stimulus: BufferInput,
    buffer_frames: Option<u32>,
    level_dbfs: Option<f32>,
    step: Option<u32>,
) -> Result<RoundTripResult, CaptureError> {
    let lease = state.lease.clone();
    let req = RoundTripRequest { device_name, out_device, stimulus, buffer_frames, level_dbfs, tail_sec: None, step };
    blocking(move || {
        // One DeckChek voice at a time: whatever audio_out plays is faded out first.
        audio_out::global().stop_all(EndReason::Replaced);
        global().round_trip(&lease, &req, &emitter(app))
    })
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn stress_run(
    app: AppHandle,
    state: State<'_, LiveCaptureState>,
    device_name: Option<String>,
    out_device: Option<String>,
    buffer_frames: Option<u32>,
    seconds: f64,
    cpu_load_pct: u32,
    gap_floor_ms: Option<f64>,
    sample_rate: Option<u32>,
    step: Option<u32>,
) -> Result<StressResult, CaptureError> {
    let lease = state.lease.clone();
    let req = StressRequest { device_name, out_device, buffer_frames, seconds, cpu_load_pct, gap_floor_ms, sample_rate, step };
    blocking(move || {
        audio_out::global().stop_all(EndReason::Replaced);
        global().stress(&lease, &req, &emitter(app))
    })
    .await
}

/// Esc: ends the running step, silences the output, stops the load threads.
#[tauri::command]
pub fn latency_abort() {
    if let Some(t) = TUNER.get() {
        t.abort();
    }
}

#[tauri::command]
pub async fn windows_tuning_scan(dpc_seconds: Option<u32>) -> Result<TuningScan, String> {
    let secs = dpc_seconds.unwrap_or(10).clamp(1, 30);
    let mut scan = blocking(move || Ok::<_, String>(scan_blocking(secs))).await?;
    if scan.supported {
        match crate::processes::top_cpu(Some(5)).await {
            Ok(apps) => scan.background_apps = apps,
            Err(e) => scan.errors.push(format!("top CPU: {e}")),
        }
    }
    Ok(scan)
}

#[tauri::command]
pub fn latency_run_save(app: AppHandle, input: LatencyRunInput) -> Result<LatencyRun, String> {
    let conn = open_database(&database_path(&app)?)?;
    save_run(&conn, &input)
}

#[tauri::command]
pub fn latency_run_list(app: AppHandle, filter: Option<LatencyRunFilter>) -> Result<Vec<LatencyRun>, String> {
    let conn = open_database(&database_path(&app)?)?;
    list_runs(&conn, &filter.unwrap_or_default())
}

#[tauri::command]
pub fn latency_run_delete(app: AppHandle, id: String) -> Result<bool, String> {
    let conn = open_database(&database_path(&app)?)?;
    delete_run(&conn, &id)
}

#[tauri::command]
pub fn buffer_recommendation_save(app: AppHandle, input: RecommendationInput) -> Result<Recommendation, String> {
    let conn = open_database(&database_path(&app)?)?;
    save_recommendation(&conn, &input)
}

#[tauri::command]
pub fn buffer_recommendation_latest(app: AppHandle, device_name: String) -> Result<Vec<Recommendation>, String> {
    let conn = open_database(&database_path(&app)?)?;
    latest_recommendations(&conn, &device_name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ------------------------------------------------- synthetic duplex device

    /// How the fake host treats a buffer request (one per spike outcome).
    #[derive(Clone, Copy, Debug)]
    enum Policy {
        /// A: runs exactly the request.
        Honour,
        /// B: clamps to a floor ("anything under 480 returns 480").
        Floor(u32),
        /// B: rounds up to a granularity.
        Granular(u32),
        /// C: runs its own period whatever is requested.
        Ignore(u32),
        /// C: `BuildStreamError` for every Fixed request; Default runs this period.
        RejectFixed(u32),
        /// D: the direction cannot be opened.
        Fail,
        /// D: opens but never calls back.
        Silent,
    }

    impl Policy {
        fn period(self, req: Option<u32>) -> Result<Option<u32>, String> {
            match (self, req) {
                (Policy::Fail, _) => Err("device unavailable (fake)".into()),
                (Policy::Silent, _) => Ok(None),
                (Policy::RejectFixed(_), Some(_)) => Err("The requested stream configuration is not supported by the device. (fake)".into()),
                (Policy::RejectFixed(p), None) | (Policy::Ignore(p), _) => Ok(Some(p)),
                (_, None) => Ok(Some(480)),
                (Policy::Honour, Some(n)) => Ok(Some(n)),
                (Policy::Floor(f), Some(n)) => Ok(Some(n.max(f))),
                (Policy::Granular(g), Some(n)) => Ok(Some(n.div_ceil(g) * g)),
            }
        }
    }

    const RATE: u32 = 48_000;

    struct Slot<C> {
        period: u32,
        cb: C,
        stop: Arc<AtomicBool>,
        next: u64,
    }

    #[derive(Default)]
    struct Dev {
        t: u64,
        input: Option<Slot<InputCb>>,
        output: Option<Slot<OutputCb>>,
        /// Output left channel by device time.
        played: Vec<f32>,
        stall: Option<(u64, Duration)>,
    }

    /// One device clock drives both directions, like a duplex driver: output
    /// written at tick t plays at t + Pout; input at tick t delivers device times
    /// [t - Pin, t); the analog loop adds `loop_frames` and `loop_gain`. Every
    /// stream's callbacks sit on multiples of its period.
    struct Fake {
        input: Policy,
        output: Policy,
        dev: Arc<Mutex<Dev>>,
        quit: Arc<AtomicBool>,
        clock: Option<JoinHandle<()>>,
    }

    impl Fake {
        fn new(input: Policy, output: Policy) -> Arc<Self> {
            Self::with(input, output, 37, 1.0, 0.25)
        }

        fn with(input: Policy, output: Policy, loop_frames: u64, loop_gain: f32, speed: f64) -> Arc<Self> {
            let dev = Arc::new(Mutex::new(Dev::default()));
            let quit = Arc::new(AtomicBool::new(false));
            let clock = {
                let (dev, quit) = (dev.clone(), quit.clone());
                thread::spawn(move || {
                    while !quit.load(Relaxed) {
                        let mut d = lock(&dev);
                        if d.input.as_ref().is_some_and(|s| s.stop.load(Relaxed)) {
                            d.input = None;
                        }
                        if d.output.as_ref().is_some_and(|s| s.stop.load(Relaxed)) {
                            d.output = None;
                        }
                        let next = [d.input.as_ref().map(|s| s.next), d.output.as_ref().map(|s| s.next)].into_iter().flatten().min();
                        let Some(next) = next else {
                            drop(d);
                            thread::sleep(Duration::from_millis(1));
                            continue;
                        };
                        let dt = next.saturating_sub(d.t);
                        d.t = next;
                        let t = next;
                        let stall = match d.stall {
                            Some((at, dur)) if t >= at => {
                                d.stall = None;
                                Some(dur)
                            }
                            _ => None,
                        };
                        if let Some(mut s) = d.output.take() {
                            if s.next == t {
                                let p = s.period as usize;
                                let mut buf = vec![0.0f32; p * 2];
                                (s.cb)(&mut buf, 2);
                                let end = (t as usize) + 2 * p;
                                if d.played.len() < end {
                                    d.played.resize(end, 0.0);
                                }
                                for i in 0..p {
                                    d.played[t as usize + p + i] = buf[2 * i];
                                }
                                s.next += s.period as u64;
                            }
                            d.output = Some(s);
                        }
                        if let Some(mut s) = d.input.take() {
                            if s.next == t {
                                let p = s.period as u64;
                                let mut data = Vec::with_capacity(p as usize * 2);
                                for tau in t - p..t {
                                    let v = tau.checked_sub(loop_frames).and_then(|x| d.played.get(x as usize).copied()).unwrap_or(0.0) * loop_gain;
                                    data.push(v);
                                    data.push(v);
                                }
                                (s.cb)(&data, 2);
                                s.next += p;
                            }
                            d.input = Some(s);
                        }
                        drop(d);
                        if let Some(extra) = stall {
                            thread::sleep(extra);
                        }
                        thread::sleep(Duration::from_secs_f64(dt as f64 / RATE as f64 * speed));
                    }
                })
            };
            Arc::new(Self { input, output, dev, quit, clock: Some(clock) })
        }

        fn stall_at(&self, frames: u64, dur: Duration) {
            lock(&self.dev).stall = Some((frames, dur));
        }

        fn handle() -> (Arc<AtomicBool>, StreamHandle) {
            let stop = Arc::new(AtomicBool::new(false));
            let s2 = stop.clone();
            let t = thread::spawn(move || {
                while !s2.load(Relaxed) {
                    thread::sleep(Duration::from_millis(1));
                }
            });
            (stop.clone(), StreamHandle::new(stop, t))
        }

        fn first_due(t: u64, p: u32) -> u64 {
            (t / p as u64 + 1) * p as u64
        }
    }

    impl Drop for Fake {
        fn drop(&mut self) {
            self.quit.store(true, Relaxed);
            if let Some(c) = self.clock.take() {
                let _ = c.join();
            }
        }
    }

    impl StreamFactory for Fake {
        fn open_input(&self, _device: Option<&str>, _rate: Option<u32>, buffer: Option<u32>, make: MakeInput, _on_error: ErrCb) -> Result<(StreamMeta, StreamHandle), String> {
            let period = self.input.period(buffer)?;
            let cb = make(RATE, 2);
            let (stop, handle) = Self::handle();
            if let Some(p) = period {
                let mut d = lock(&self.dev);
                let next = Self::first_due(d.t, p);
                d.input = Some(Slot { period: p, cb, stop, next });
            }
            Ok((StreamMeta { device_name: "Fake In".into(), sample_rate: RATE, channels: 2 }, handle))
        }

        fn open_output(&self, _device: Option<&str>, _rate: Option<u32>, buffer: Option<u32>, make: MakeOutput, _on_error: ErrCb) -> Result<(StreamMeta, StreamHandle), String> {
            let period = self.output.period(buffer)?;
            let cb = make(RATE, 2)?;
            let (stop, handle) = Self::handle();
            if let Some(p) = period {
                let mut d = lock(&self.dev);
                let next = Self::first_due(d.t, p);
                d.output = Some(Slot { period: p, cb, stop, next });
            }
            Ok((StreamMeta { device_name: "Fake Out".into(), sample_rate: RATE, channels: 2 }, handle))
        }
    }

    fn tuner(f: &Arc<Fake>) -> Tuner {
        Tuner::new(f.clone(), "WASAPI")
    }

    fn stress_req(frames: Option<u32>, seconds: f64, load: u32) -> StressRequest {
        StressRequest { buffer_frames: frames, seconds, cpu_load_pct: load, ..Default::default() }
    }

    fn no_progress(_: &Progress) {}

    fn impulse_stimulus(at: usize, len: usize, value: f32) -> BufferInput {
        let mut left = vec![0.0f32; len];
        left[at] = value;
        BufferInput { sample_rate: RATE, left, right: vec![] }
    }

    fn rt_req(stim: BufferInput, frames: Option<u32>, level: Option<f32>) -> RoundTripRequest {
        RoundTripRequest { device_name: None, out_device: None, stimulus: stim, buffer_frames: frames, level_dbfs: level, tail_sec: Some(0.1), step: None }
    }

    fn peak_index(v: &[f32]) -> (usize, f32) {
        v.iter().enumerate().fold((0, 0.0f32), |(bi, bv), (i, &x)| if x.abs() > bv { (i, x.abs()) } else { (bi, bv) })
    }

    // ------------------------------------------------------- pure functions

    #[test]
    fn percentile_is_nearest_rank() {
        assert_eq!(percentile(&[], 0.5), None);
        assert_eq!(percentile(&[7], 0.99), Some(7));
        let v: Vec<u32> = (1..=101).collect();
        assert_eq!(percentile(&v, 0.5), Some(51));
        assert_eq!(percentile(&v, 0.99), Some(100));
        assert_eq!(percentile(&v, 1.0), Some(101));
    }

    #[test]
    fn xrun_threshold_is_one_and_a_half_periods_unless_the_idle_floor_is_higher() {
        assert_eq!(xrun_threshold_ms(10.0, None), 15.0);
        assert_eq!(xrun_threshold_ms(10.0, Some(12.0)), 15.0);
        assert_eq!(xrun_threshold_ms(10.0, Some(22.5)), 22.5);
        assert_eq!(xrun_threshold_ms(10.0, Some(f64::NAN)), 15.0);
    }

    #[test]
    fn gap_xruns_count_only_gaps_strictly_above_the_threshold_after_warmup() {
        // 480 frames at 48 kHz = 10 ms; threshold 15 ms.
        let frames = vec![480u32; 20];
        let mut gaps = vec![10_000u32; 19];
        gaps[0] = 90_000; // warm-up burst, ignored
        gaps[10] = 15_000; // exactly 1.5 x: not an xrun
        gaps[11] = 15_001; // just above: xrun
        let s = callback_stats(&frames, &gaps, 20, RATE, None);
        assert_eq!(s.actual_frames, Some(480));
        assert_eq!(s.actual_period_ms, Some(10.0));
        assert_eq!(s.gap_xruns, 1);
        assert_eq!(s.xrun_threshold_ms, Some(15.0));
        assert_eq!(s.gap_ms_max, Some(15.001));
        // the idle floor lifts the threshold above the burst
        assert_eq!(callback_stats(&frames, &gaps, 20, RATE, Some(16.0)).gap_xruns, 0);
        assert_eq!(callback_stats(&[], &[], 0, RATE, None), CallbackStats::default());
    }

    #[test]
    fn median_frames_is_the_actual_period_even_with_irregular_packets() {
        let frames = [441u32, 480, 480, 480, 528, 480, 432];
        let s = callback_stats(&frames, &[], 7, RATE, None);
        assert_eq!((s.actual_frames, s.actual_frames_min, s.actual_frames_max), (Some(480), Some(432), Some(528)));
    }

    #[test]
    fn classify_direction_covers_every_spike_outcome() {
        use BufferMode::*;
        use ModeReason::*;
        assert_eq!(classify_direction(Some(256), false, true, Some(256)), (Honoured, Matched));
        assert_eq!(classify_direction(Some(256), false, true, Some(480)), (Adjusted, Differs));
        assert_eq!(classify_direction(Some(256), true, true, Some(480)), (HostChosen, FixedRejected));
        assert_eq!(classify_direction(None, false, true, Some(480)), (HostChosen, DefaultRequested));
        assert_eq!(classify_direction(Some(256), true, false, None), (Unavailable, OpenFailed));
        assert_eq!(classify_direction(Some(256), false, true, None), (Unavailable, NoCallbacks));
    }

    #[test]
    fn combined_mode_takes_the_less_trustworthy_open_direction() {
        use BufferMode::*;
        assert_eq!(combined_mode(Honoured, Honoured), Honoured);
        assert_eq!(combined_mode(Honoured, Adjusted), Adjusted);
        assert_eq!(combined_mode(HostChosen, Adjusted), HostChosen);
        assert_eq!(combined_mode(Unavailable, Honoured), Honoured);
        assert_eq!(combined_mode(Unavailable, Unavailable), Unavailable);
        assert_eq!(duplex_of(Honoured, Unavailable), Duplex::InputOnly);
        assert_eq!(duplex_of(Unavailable, HostChosen), Duplex::OutputOnly);
        assert_eq!(duplex_of(Unavailable, Unavailable), Duplex::Neither);
        assert_eq!(serde_json::to_value(Duplex::Neither).unwrap(), json!("none"));
        assert_eq!(serde_json::to_value(BufferMode::HostChosen).unwrap(), json!("hostChosen"));
    }

    #[test]
    fn alignment_is_the_median_offset_in_input_frames() {
        assert_eq!(alignment_from_pairs(&[], RATE, RATE), None);
        let a = alignment_from_pairs(&[(0, 1000), (256, 1256), (512, 1512), (768, 1800)], RATE, RATE).unwrap();
        assert_eq!((a.frames, a.min_frames, a.max_frames, a.pairs), (1000.0, 1000.0, 1032.0, 4));
        // output at 96 kHz, input at 48 kHz: rendered frames count half
        let b = alignment_from_pairs(&[(0, 500), (960, 980), (1920, 1460)], RATE, 96_000).unwrap();
        assert_eq!(b.frames, 500.0);
    }

    #[test]
    fn load_threads_follow_the_percentage_and_keep_one_core_free() {
        assert_eq!(load_thread_count(8, 0), 0);
        assert_eq!(load_thread_count(8, 50), 4);
        assert_eq!(load_thread_count(8, 80), 6);
        assert_eq!(load_thread_count(8, 100), 7);
        assert_eq!(load_thread_count(8, 250), 7);
        assert_eq!(load_thread_count(1, 100), 0);
        assert_eq!(load_thread_count(3, 50), 2);
    }

    #[test]
    fn load_guard_joins_every_thread_within_a_second() {
        let g = LoadGuard::with_threads(2);
        assert_eq!(g.threads(), 2);
        thread::sleep(Duration::from_millis(30));
        assert!(g.stop() < Duration::from_secs(1));
        let t = Instant::now();
        drop(LoadGuard::with_threads(2));
        assert!(t.elapsed() < Duration::from_secs(1), "drop joins too");
    }

    #[test]
    fn buffer_range_maps_cpal_ranges() {
        assert_eq!(
            buffer_range(&cpal::SupportedBufferSize::Range { min: 64, max: 4096 }),
            BufferRange { min_frames: Some(64), max_frames: Some(4096), default: None, known: true }
        );
        assert!(!buffer_range(&cpal::SupportedBufferSize::Unknown).known);
    }

    #[test]
    fn scope_is_always_named_after_the_host() {
        assert_eq!(scope_label("WASAPI"), "WASAPI round trip");
        assert_eq!(scope_label("ALSA"), "ALSA round trip");
    }

    // ----------------------------------------------------------- scan parsers

    fn fixture(name: &str) -> String {
        std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/latency").join(name)).unwrap()
    }

    #[test]
    fn active_scheme_parses_in_english_and_german() {
        assert_eq!(parse_active_scheme(&fixture("powercfg-active-en.txt")), Some(ActivePlan { name: "Balanced".into(), guid: "381b4222-f694-41f0-9685-ff5bb260df2e".into() }));
        assert_eq!(parse_active_scheme(&fixture("powercfg-active-de.txt")).unwrap().guid, "8c5e7fda-e8bf-4a96-9a85-cd73a8a2b7a0");
        assert_eq!(parse_active_scheme("garbage"), None);
    }

    #[test]
    fn powercfg_settings_parse_by_guid_or_alias_in_any_locale() {
        assert_eq!(parse_powercfg_setting(&fixture("powercfg-usb-en.txt"), USB_SELECTIVE_SUSPEND), AcDc { ac: Some(1), dc: Some(1) });
        assert_eq!(parse_powercfg_setting(&fixture("powercfg-usb-de.txt"), USB_SELECTIVE_SUSPEND), AcDc { ac: Some(0), dc: Some(1) });
        let p = fixture("powercfg-processor-en.txt");
        assert_eq!(parse_powercfg_setting(&p, "PROCTHROTTLEMIN"), AcDc { ac: Some(5), dc: Some(5) }, "not PROCTHROTTLEMIN1");
        assert_eq!(parse_powercfg_setting(&p, "CPMINCORES"), AcDc { ac: Some(100), dc: Some(10) });
        assert_eq!(parse_powercfg_setting(&fixture("powercfg-processor-de.txt"), "PROCTHROTTLEMIN"), AcDc { ac: Some(100), dc: Some(5) });
        assert_eq!(parse_powercfg_setting(&fixture("powercfg-processor-de.txt"), "CPMINCORES"), AcDc::default(), "hidden setting = unknown");
    }

    #[test]
    fn powershell_facts_parse_with_dot_and_comma_decimals() {
        let en = parse_ps_facts(&fixture("ps-scan-en.txt"));
        assert_eq!(en.wifi, vec![NamedStatus { name: "WLAN".into(), status: "Up".into() }, NamedStatus { name: "Wi-Fi 2".into(), status: "Disconnected".into() }]);
        assert_eq!(en.bluetooth.len(), 1);
        assert_eq!(en.on_battery, Some(true));
        assert_eq!(en.dpc, DpcProxy { dpc_pct: Some(1.0), interrupt_pct: Some(1.0), samples: 2 });
        let de = parse_ps_facts(&fixture("ps-scan-de.txt"));
        assert_eq!(de.on_battery, Some(false));
        assert_eq!(de.dpc, DpcProxy { dpc_pct: Some(3.0), interrupt_pct: Some(1.0), samples: 2 });
        assert_eq!(parse_ps_facts(""), PsFacts::default());
        let many: String = (0..30).map(|i| format!("BT\tdev {i}\tOK\n")).collect();
        assert_eq!(parse_ps_facts(&many).bluetooth.len(), MAX_NAMED);
    }

    #[test]
    fn battery_status_codes_map_to_on_battery() {
        for (s, v) in [("1", Some(true)), ("4", Some(true)), ("5", Some(true)), ("2", Some(false)), ("6", Some(false)), ("none", Some(false)), ("10", None), ("", None)] {
            assert_eq!(battery_on_battery(s), v, "{s}");
        }
    }

    #[test]
    fn jitter_stats_report_p99_and_ignore_non_finite() {
        assert_eq!(jitter_stats(&[]), None);
        let v: Vec<f64> = (0..100).map(|i| i as f64 / 10.0).chain([f64::NAN, -1.0]).collect();
        let s = jitter_stats(&v).unwrap();
        assert_eq!(s.samples, 101);
        assert_eq!(s.max_ms, 9.9);
        assert!((s.p99_ms - 9.8).abs() < 1e-9);
        assert!(measure_timer_jitter(5).is_some_and(|j| j.samples == 5));
    }

    #[cfg(not(windows))]
    #[test]
    fn scan_is_unsupported_off_windows() {
        let s = scan_blocking(1);
        assert!(!s.supported && s.active_plan.is_none());
    }

    #[cfg(windows)]
    #[test]
    fn windows_scan_reports_the_active_plan() {
        let s = scan_blocking(1);
        assert!(s.supported);
        assert!(s.active_plan.is_some(), "errors: {:?}", s.errors);
    }

    // ------------------------------------------- decision tree, end to end

    #[test]
    fn a_honoured_request_runs_exactly_and_releases_everything() {
        let f = Fake::new(Policy::Honour, Policy::Honour);
        let t = tuner(&f);
        let lease = CaptureLease::default();
        let r = t.stress(&lease, &stress_req(Some(256), 0.4, 50), &no_progress).unwrap();
        assert_eq!(r.ended, RunEnd::Completed);
        assert_eq!((r.input.mode, r.output.mode, r.buffer_mode, r.duplex), (BufferMode::Honoured, BufferMode::Honoured, BufferMode::Honoured, Duplex::Full));
        assert_eq!((r.requested, r.actual), (Some(256), Some(256)));
        assert_eq!(r.input.buffer_request, "fixed");
        assert!(r.input.stats.callbacks > 5 && r.output.stats.callbacks > 5);
        assert!(r.load_stop_ms < 1000.0);
        assert!(!lease.is_held(), "lease released");
        assert_eq!(r.host_api, "WASAPI");
    }

    #[test]
    fn b_floor_clamps_small_requests_and_honours_large_ones() {
        let f = Fake::new(Policy::Floor(480), Policy::Floor(480));
        let t = tuner(&f);
        let lease = CaptureLease::default();
        let small = t.stress(&lease, &stress_req(Some(128), 0.3, 0), &no_progress).unwrap();
        assert_eq!((small.input.mode, small.input.mode_reason, small.actual), (BufferMode::Adjusted, ModeReason::Differs, Some(480)));
        let large = t.stress(&lease, &stress_req(Some(512), 0.3, 0), &no_progress).unwrap();
        assert_eq!((large.buffer_mode, large.actual), (BufferMode::Honoured, Some(512)));
    }

    #[test]
    fn b_granularity_rounds_to_what_actually_ran() {
        let f = Fake::new(Policy::Granular(96), Policy::Honour);
        let r = tuner(&f).stress(&CaptureLease::default(), &stress_req(Some(100), 0.3, 0), &no_progress).unwrap();
        assert_eq!((r.input.mode, r.input.stats.actual_frames), (BufferMode::Adjusted, Some(192)));
        assert_eq!(r.output.mode, BufferMode::Honoured);
        assert_eq!(r.buffer_mode, BufferMode::Adjusted);
    }

    #[test]
    fn c_ignored_request_reports_the_host_period() {
        let f = Fake::new(Policy::Ignore(480), Policy::Ignore(480));
        let r = tuner(&f).stress(&CaptureLease::default(), &stress_req(Some(64), 0.3, 0), &no_progress).unwrap();
        assert_eq!((r.buffer_mode, r.actual), (BufferMode::Adjusted, Some(480)));
        assert!((r.input.stats.actual_period_ms.unwrap() - 10.0).abs() < 1e-9);
    }

    #[test]
    fn c_rejected_fixed_falls_back_to_the_host_period() {
        let f = Fake::new(Policy::RejectFixed(480), Policy::RejectFixed(441));
        let r = tuner(&f).stress(&CaptureLease::default(), &stress_req(Some(128), 0.3, 0), &no_progress).unwrap();
        assert_eq!(r.ended, RunEnd::Completed);
        for d in [&r.input, &r.output] {
            assert_eq!((d.mode, d.mode_reason, d.buffer_request.as_str()), (BufferMode::HostChosen, ModeReason::FixedRejected, "default"));
            assert!(d.fixed_error.as_deref().unwrap().contains("not supported"));
            assert!(d.opened && d.open_error.is_none());
        }
        assert_eq!((r.input.stats.actual_frames, r.output.stats.actual_frames), (Some(480), Some(441)));
    }

    #[test]
    fn c_default_request_is_one_host_chosen_row() {
        let f = Fake::new(Policy::Ignore(480), Policy::Ignore(480));
        let r = tuner(&f).stress(&CaptureLease::default(), &stress_req(None, 0.3, 0), &no_progress).unwrap();
        assert_eq!((r.requested, r.buffer_mode, r.input.mode_reason), (None, BufferMode::HostChosen, ModeReason::DefaultRequested));
    }

    #[test]
    fn d_input_unavailable_still_stresses_the_output_and_says_so() {
        let f = Fake::new(Policy::Fail, Policy::Honour);
        let lease = CaptureLease::default();
        let r = tuner(&f).stress(&lease, &stress_req(Some(256), 0.3, 0), &no_progress).unwrap();
        assert_eq!((r.duplex, r.input.mode, r.input.mode_reason), (Duplex::OutputOnly, BufferMode::Unavailable, ModeReason::OpenFailed));
        assert!(r.input.open_error.is_some());
        assert_eq!(r.ended, RunEnd::Completed);
        assert_eq!(r.buffer_mode, BufferMode::Honoured);
        assert!(!lease.is_held());
    }

    #[test]
    fn d_output_unavailable_or_silent_input() {
        let f = Fake::new(Policy::Honour, Policy::Fail);
        let r = tuner(&f).stress(&CaptureLease::default(), &stress_req(Some(256), 0.3, 0), &no_progress).unwrap();
        assert_eq!((r.duplex, r.output.mode), (Duplex::InputOnly, BufferMode::Unavailable));
        let g = Fake::new(Policy::Silent, Policy::Honour);
        let s = tuner(&g).stress(&CaptureLease::default(), &stress_req(Some(256), 0.3, 0), &no_progress).unwrap();
        assert_eq!((s.input.mode, s.input.mode_reason), (BufferMode::Unavailable, ModeReason::NoCallbacks));
        assert_eq!(s.duplex, Duplex::OutputOnly);
    }

    #[test]
    fn d_nothing_opens_ends_at_once_without_load() {
        let f = Fake::new(Policy::Fail, Policy::Fail);
        let lease = CaptureLease::default();
        let t = Instant::now();
        let r = tuner(&f).stress(&lease, &stress_req(Some(256), 5.0, 80), &no_progress).unwrap();
        assert!(t.elapsed() < Duration::from_secs(1));
        assert_eq!((r.ended, r.duplex, r.load_threads, r.buffer_mode), (RunEnd::NoStreams, Duplex::Neither, 0, BufferMode::Unavailable));
        assert!(!lease.is_held());
    }

    #[test]
    fn a_stall_counts_as_a_gap_xrun_unless_below_the_idle_floor() {
        let f = Fake::with(Policy::Honour, Policy::Honour, 0, 1.0, 1.0);
        f.stall_at(9_600, Duration::from_millis(60));
        let r = tuner(&f).stress(&CaptureLease::default(), &stress_req(Some(480), 0.6, 0), &no_progress).unwrap();
        assert!(r.xruns >= 1, "{r:?}");
        assert!(r.max_gap_ms.unwrap() >= 60.0);
        let g = Fake::with(Policy::Honour, Policy::Honour, 0, 1.0, 1.0);
        g.stall_at(9_600, Duration::from_millis(30));
        let mut req = stress_req(Some(480), 0.6, 0);
        req.gap_floor_ms = Some(500.0);
        let q = tuner(&g).stress(&CaptureLease::default(), &req, &no_progress).unwrap();
        assert_eq!(q.xruns, 0);
        assert_eq!(q.input.stats.xrun_threshold_ms, Some(500.0));
    }

    // ------------------------------------------------------------ round trip

    #[test]
    fn round_trip_equals_both_periods_plus_the_analog_loop() {
        let f = Fake::new(Policy::Honour, Policy::Honour);
        let r = tuner(&f).round_trip(&CaptureLease::default(), &rt_req(impulse_stimulus(4_800, 9_600, 1.0), Some(256), Some(-20.0)), &no_progress).unwrap();
        assert_eq!(r.ended, RunEnd::Completed, "{:?}", r.input);
        assert_eq!(r.scope, "WASAPI round trip");
        assert_eq!(r.reported_buffer_frames, ReportedFrames { input: Some(256), out: Some(256) });
        let cap = r.captured.as_ref().unwrap();
        let (idx, peak) = peak_index(&cap.left);
        assert!((peak - 0.1).abs() < 1e-3, "-20 dBFS impulse, got {peak}");
        let a = r.alignment.as_ref().unwrap();
        assert_eq!(a.min_frames, a.max_frames, "duplex clock keeps the offset constant");
        let rtl = idx as f64 - (4_800.0 + a.frames);
        assert_eq!(rtl, (256 + 256 + 37) as f64);
        assert_eq!(r.quality.frames_captured as usize, cap.left.len());
    }

    #[test]
    fn round_trip_with_rejected_fixed_measures_at_the_host_period() {
        let f = Fake::new(Policy::RejectFixed(480), Policy::RejectFixed(480));
        let r = tuner(&f).round_trip(&CaptureLease::default(), &rt_req(impulse_stimulus(4_800, 9_600, 1.0), Some(128), None), &no_progress).unwrap();
        assert_eq!((r.ended, r.buffer_mode), (RunEnd::Completed, BufferMode::HostChosen));
        assert_eq!(r.reported_buffer_frames, ReportedFrames { input: Some(480), out: Some(480) });
        let (idx, _) = peak_index(&r.captured.as_ref().unwrap().left);
        assert_eq!(idx as f64 - (4_800.0 + r.alignment.as_ref().unwrap().frames), (480 + 480 + 37) as f64);
    }

    #[test]
    fn round_trip_with_unequal_periods_is_within_one_period() {
        let f = Fake::new(Policy::Floor(480), Policy::Honour);
        let r = tuner(&f).round_trip(&CaptureLease::default(), &rt_req(impulse_stimulus(4_800, 9_600, 1.0), Some(256), None), &no_progress).unwrap();
        assert_eq!(r.reported_buffer_frames, ReportedFrames { input: Some(480), out: Some(256) });
        let (idx, _) = peak_index(&r.captured.as_ref().unwrap().left);
        let rtl = idx as f64 - (4_800.0 + r.alignment.as_ref().unwrap().frames);
        assert!((rtl - (480.0 + 256.0 + 37.0)).abs() <= 480.0, "rtl {rtl}");
    }

    #[test]
    fn round_trip_never_plays_above_the_absolute_cap() {
        let f = Fake::new(Policy::Honour, Policy::Honour);
        let stim = BufferInput { sample_rate: RATE, left: vec![1.0; 4_800], right: vec![] };
        let r = tuner(&f).round_trip(&CaptureLease::default(), &rt_req(stim, Some(256), Some(0.0)), &no_progress).unwrap();
        assert_eq!(r.output_level_dbfs, Some(audio_out::ABS_MAX_DBFS));
        let cap = r.captured.unwrap();
        assert!(cap.left.iter().all(|x| x.abs() <= audio_out::ABS_MAX_AMP + 1e-6));
        assert!(peak_index(&cap.left).1 > 0.25, "reaches the cap");
    }

    #[test]
    fn clipping_in_the_loop_stops_the_output_and_discards_the_capture() {
        let f = Fake::with(Policy::Honour, Policy::Honour, 37, 10.0, 0.25);
        let stim = BufferInput { sample_rate: RATE, left: vec![1.0; 48_000], right: vec![] };
        let t = Instant::now();
        let r = tuner(&f).round_trip(&CaptureLease::default(), &rt_req(stim, Some(256), Some(-12.0)), &no_progress).unwrap();
        assert_eq!(r.ended, RunEnd::Clipped);
        assert!(r.captured.is_none());
        assert!(t.elapsed() < Duration::from_secs(1), "stopped well before the 1 s stimulus ended at 0.25 speed");
    }

    #[test]
    fn round_trip_without_duplex_reports_which_side_is_missing() {
        let f = Fake::new(Policy::Fail, Policy::Honour);
        let lease = CaptureLease::default();
        let r = tuner(&f).round_trip(&lease, &rt_req(impulse_stimulus(10, 100, 1.0), Some(256), None), &no_progress).unwrap();
        assert_eq!((r.ended, r.duplex, r.captured.is_none()), (RunEnd::NoStreams, Duplex::Neither, true));
        assert!(r.output.open_error.as_deref().unwrap().contains("not attempted"));
        let g = Fake::new(Policy::Honour, Policy::Fail);
        let s = tuner(&g).round_trip(&lease, &rt_req(impulse_stimulus(10, 100, 1.0), Some(256), None), &no_progress).unwrap();
        assert_eq!((s.ended, s.duplex), (RunEnd::NoStreams, Duplex::InputOnly));
        assert_eq!((s.input.mode, s.input.stats.actual_frames), (BufferMode::Honoured, Some(256)), "the open side's period is still learned");
        assert!(!lease.is_held());
    }

    #[test]
    fn invalid_requests_are_refused_before_touching_devices() {
        let f = Fake::new(Policy::Honour, Policy::Honour);
        let t = tuner(&f);
        let lease = CaptureLease::default();
        let msg = |e: CaptureError| match e {
            CaptureError::Message(m) => m,
            other => panic!("{other:?}"),
        };
        for frames in [8, MAX_BUFFER_FRAMES + 1] {
            assert!(msg(t.stress(&lease, &stress_req(Some(frames), 0.3, 0), &no_progress).unwrap_err()).starts_with("LATENCY_INVALID"));
        }
        let cases = [
            BufferInput { sample_rate: 4_000, left: vec![0.0; 10], right: vec![] },
            BufferInput { sample_rate: RATE, left: vec![], right: vec![] },
            BufferInput { sample_rate: RATE, left: vec![0.0; 10], right: vec![0.0; 9] },
            BufferInput { sample_rate: 8_000, left: vec![0.0; 8_000 * 31], right: vec![] },
        ];
        for stim in cases {
            assert!(msg(t.round_trip(&lease, &rt_req(stim, None, None), &no_progress).unwrap_err()).starts_with("LATENCY_INVALID"));
        }
        assert!(msg(t.round_trip(&lease, &rt_req(impulse_stimulus(1, 10, 1.0), None, Some(f32::NAN)), &no_progress).unwrap_err()).starts_with("LATENCY_INVALID"));
        assert!(!lease.is_held());
    }

    // ------------------------------------------------- abort, lease, busy

    #[test]
    fn esc_aborts_within_a_second_and_stops_the_load() {
        let f = Fake::new(Policy::Honour, Policy::Honour);
        let t = Arc::new(tuner(&f));
        let lease = CaptureLease::default();
        let (t2, l2) = (t.clone(), lease.clone());
        let run = thread::spawn(move || t2.stress(&l2, &stress_req(Some(256), 10.0, 50), &no_progress));
        thread::sleep(Duration::from_millis(200));
        let pressed = Instant::now();
        t.abort();
        let r = run.join().unwrap().unwrap();
        assert!(pressed.elapsed() < Duration::from_secs(1));
        assert_eq!(r.ended, RunEnd::Aborted);
        assert!(r.load_stop_ms < 1000.0);
        assert!(!lease.is_held());
        // an abort before a run does not cancel the next run
        let next = t.stress(&lease, &stress_req(Some(256), 0.2, 0), &no_progress).unwrap();
        assert_eq!(next.ended, RunEnd::Completed);
    }

    #[test]
    fn a_held_lease_gives_capture_busy_and_preemption_ends_the_run() {
        let f = Fake::new(Policy::Honour, Policy::Honour);
        let t = Arc::new(tuner(&f));
        let lease = CaptureLease::default();
        let other = lease.acquire("live-monitor", None, LeaseKind::External).unwrap();
        match t.stress(&lease, &stress_req(Some(256), 0.3, 0), &no_progress) {
            Err(CaptureError::Busy(b)) => assert_eq!(b.holder, "live-monitor"),
            other => panic!("{other:?}"),
        }
        lease.release(other.lease_id);
        let (t2, l2) = (t.clone(), lease.clone());
        let run = thread::spawn(move || t2.stress(&l2, &stress_req(Some(256), 10.0, 0), &no_progress));
        thread::sleep(Duration::from_millis(150));
        let mine = lease.current().unwrap();
        assert_eq!(mine.holder, HOLDER);
        lease.release(mine.lease_id); // what capture_preempt does for an External lease
        let r = run.join().unwrap().unwrap();
        assert_eq!(r.ended, RunEnd::Preempted);
    }

    #[test]
    fn only_one_run_at_a_time() {
        let f = Fake::new(Policy::Honour, Policy::Honour);
        let t = Arc::new(tuner(&f));
        let lease = CaptureLease::default();
        let (t2, l2) = (t.clone(), lease.clone());
        let run = thread::spawn(move || t2.stress(&l2, &stress_req(Some(256), 0.5, 0), &no_progress));
        thread::sleep(Duration::from_millis(100));
        match t.round_trip(&CaptureLease::default(), &rt_req(impulse_stimulus(1, 10, 1.0), None, None), &no_progress) {
            Err(CaptureError::Message(m)) => assert!(m.starts_with("LATENCY_BUSY")),
            other => panic!("{other:?}"),
        }
        assert_eq!(run.join().unwrap().unwrap().ended, RunEnd::Completed);
    }

    #[test]
    fn progress_is_reported_during_a_stress_step() {
        let f = Fake::new(Policy::Honour, Policy::Honour);
        let seen = Mutex::new(Vec::new());
        let mut req = stress_req(Some(256), 0.6, 0);
        req.step = Some(3);
        tuner(&f).stress(&CaptureLease::default(), &req, &|p: &Progress| lock(&seen).push(p.clone())).unwrap();
        let seen = seen.into_inner().unwrap();
        assert!(seen.len() >= 2);
        assert!(seen.iter().all(|p| p.phase == "stress" && p.step == Some(3) && p.frames == Some(256)));
        assert_eq!(serde_json::to_value(&seen[0]).unwrap()["elapsedSec"], json!(seen[0].elapsed_sec));
    }

    // ------------------------------------------------------------- database

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::apply_migrations(&c).unwrap();
        c.execute_batch(
            "INSERT INTO setup (id, name, created_at) VALUES ('setup-1','Booth A','2026-01-01T00:00:00Z');
             INSERT INTO session (id, session_type, setup_id, started_at, app_version, schema_version, status)
               VALUES ('sess-1','venue','setup-1','2026-01-01T00:00:00Z','0.0.6',7,'open');",
        )
        .unwrap();
        c
    }

    fn rt_run() -> LatencyRunInput {
        LatencyRunInput {
            device_name: "Audio 8 DJ".into(),
            host_api: Some("WASAPI".into()),
            sample_rate_hz: 48_000,
            kind: "roundtrip".into(),
            buffer_frames: Some(256),
            measured_ms: Some(14.2),
            std_ms: Some(0.04),
            expanded_u_ms: Some(0.1),
            reported_ms: Some(10.67),
            detail: Some(json!({ "bufferMode": "honoured" })),
            ..Default::default()
        }
    }

    fn contract() -> Value {
        let raw = std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/latency.json")).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    #[test]
    fn migration_creates_tables_and_is_rerunnable() {
        let c = mem();
        let sql = crate::db::MIGRATIONS.iter().find(|(v, _)| *v == 7).expect("0007 registered").1;
        c.execute_batch(sql).unwrap();
        let cols = |t: &str| -> Vec<String> {
            c.prepare(&format!("SELECT name FROM pragma_table_info('{t}')")).unwrap().query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap()
        };
        assert_eq!(
            cols("latency_run"),
            [
                "id", "session_id", "setup_id", "device_name", "host_api", "sample_rate_hz", "kind", "buffer_frames", "cpu_load_pct", "measured_ms", "std_ms",
                "expanded_u_ms", "reported_ms", "xruns", "max_gap_ms", "verdict", "detail_json", "created_at"
            ]
        );
        assert_eq!(cols("buffer_recommendation"), ["id", "device_name", "software", "frames", "ms", "based_on_run_id", "created_at"]);
        assert!(c.execute("INSERT INTO latency_run (id, device_name, sample_rate_hz, kind, created_at) VALUES ('x','d',48000,'asio','t')", []).is_err());
    }

    #[test]
    fn runs_round_trip_list_filter_and_delete() {
        let c = mem();
        let mut a = rt_run();
        a.session_id = Some("sess-1".into());
        a.setup_id = Some("setup-1".into());
        let saved = save_run(&c, &a).unwrap();
        assert_eq!(saved.detail, json!({ "bufferMode": "honoured" }));
        assert_eq!(get_run(&c, &saved.id).unwrap().unwrap(), saved);
        let stress = LatencyRunInput { kind: "stress".into(), cpu_load_pct: Some(50), xruns: Some(0), max_gap_ms: Some(11.0), verdict: Some("pass".into()), detail: None, ..rt_run() };
        let s = save_run(&c, &stress).unwrap();
        assert_eq!(s.detail, json!({}));
        c.execute("UPDATE latency_run SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = ?1", [&saved.id]).unwrap();
        let all = list_runs(&c, &LatencyRunFilter { device_name: Some("Audio 8 DJ".into()), ..Default::default() }).unwrap();
        assert_eq!(all.iter().map(|r| r.id.clone()).collect::<Vec<_>>(), [s.id.clone(), saved.id.clone()]);
        assert_eq!(list_runs(&c, &LatencyRunFilter { kind: Some("stress".into()), ..Default::default() }).unwrap().len(), 1);
        assert_eq!(list_runs(&c, &LatencyRunFilter { session_id: Some("sess-1".into()), ..Default::default() }).unwrap().len(), 1);
        assert_eq!(list_runs(&c, &LatencyRunFilter { limit: Some(0), ..Default::default() }).unwrap().len(), 1);
        assert!(list_runs(&c, &LatencyRunFilter { kind: Some("asio".into()), ..Default::default() }).is_err());
        assert!(delete_run(&c, &s.id).unwrap());
        assert!(!delete_run(&c, &s.id).unwrap());
        c.execute("DELETE FROM session WHERE id = 'sess-1'", []).unwrap();
        assert_eq!(get_run(&c, &saved.id).unwrap().unwrap().session_id, None, "ON DELETE SET NULL");
    }

    #[test]
    fn run_validation_rejects_bad_input_and_writes_nothing() {
        let c = mem();
        let cases: Vec<(&str, Box<dyn Fn(&mut LatencyRunInput)>)> = vec![
            ("kind", Box::new(|i| i.kind = "asio".into())),
            ("device", Box::new(|i| i.device_name = "  ".into())),
            ("device long", Box::new(|i| i.device_name = "x".repeat(MAX_NAME_CHARS + 1))),
            ("rate", Box::new(|i| i.sample_rate_hz = 7_999)),
            ("frames", Box::new(|i| i.buffer_frames = Some(0))),
            ("load", Box::new(|i| i.cpu_load_pct = Some(101))),
            ("measured nan", Box::new(|i| i.measured_ms = Some(f64::NAN))),
            ("std negative", Box::new(|i| i.std_ms = Some(-0.1))),
            ("xruns negative", Box::new(|i| i.xruns = Some(-1))),
            ("detail array", Box::new(|i| i.detail = Some(json!([1])))),
            ("detail big", Box::new(|i| i.detail = Some(json!({ "x": "y".repeat(MAX_DETAIL_BYTES) })))),
            ("verdict long", Box::new(|i| i.verdict = Some("v".repeat(MAX_VERDICT_CHARS + 1)))),
        ];
        for (name, mutate) in cases {
            let mut i = rt_run();
            mutate(&mut i);
            assert!(save_run(&c, &i).unwrap_err().starts_with("LATENCY_INVALID: "), "{name}");
        }
        let unknown = LatencyRunInput { session_id: Some("nope".into()), ..rt_run() };
        assert!(save_run(&c, &unknown).unwrap_err().starts_with("LATENCY_NOT_FOUND: "));
        let n: i64 = c.query_row("SELECT COUNT(*) FROM latency_run", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn recommendations_keep_the_latest_per_software() {
        let c = mem();
        let run = save_run(&c, &rt_run()).unwrap();
        let rec = |sw: &str, frames: i64| RecommendationInput { device_name: "Audio 8 DJ".into(), software: sw.into(), frames, ms: frames as f64 / 48.0, based_on_run_id: Some(run.id.clone()) };
        let old = save_recommendation(&c, &rec("serato", 512)).unwrap();
        c.execute("UPDATE buffer_recommendation SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = ?1", [&old.id]).unwrap();
        save_recommendation(&c, &rec("serato", 256)).unwrap();
        save_recommendation(&c, &rec("traktor", 512)).unwrap();
        let latest = latest_recommendations(&c, "Audio 8 DJ").unwrap();
        assert_eq!(latest.iter().map(|r| (r.software.as_str(), r.frames)).collect::<Vec<_>>(), [("serato", 256), ("traktor", 512)]);
        assert!(save_recommendation(&c, &rec("asio", 128)).unwrap_err().starts_with("LATENCY_INVALID"));
        assert!(save_recommendation(&c, &RecommendationInput { based_on_run_id: Some("nope".into()), ..rec("serato", 128) }).unwrap_err().starts_with("LATENCY_NOT_FOUND"));
        delete_run(&c, &run.id).unwrap();
        assert!(latest_recommendations(&c, "Audio 8 DJ").unwrap().iter().all(|r| r.based_on_run_id.is_none()), "ON DELETE SET NULL");
    }

    #[test]
    fn contract_examples_round_trip_through_the_real_types() {
        let c = mem();
        let k = contract();
        let strip = |mut v: Value| {
            v["id"] = json!("<id>");
            v["createdAt"] = json!("<t>");
            v
        };
        let input: LatencyRunInput = serde_json::from_value(k["commands"]["latency_run_save"]["request"]["input"].clone()).unwrap();
        let saved = save_run(&c, &input).unwrap();
        assert_eq!(strip(serde_json::to_value(&saved).unwrap()), strip(k["commands"]["latency_run_save"]["response"].clone()));
        let rec: RecommendationInput = serde_json::from_value(k["commands"]["buffer_recommendation_save"]["request"]["input"].clone()).unwrap();
        let rec = RecommendationInput { based_on_run_id: Some(saved.id.clone()), ..rec };
        let got = strip(serde_json::to_value(save_recommendation(&c, &rec).unwrap()).unwrap());
        let mut expect = strip(k["commands"]["buffer_recommendation_save"]["response"].clone());
        expect["basedOnRunId"] = json!(saved.id);
        assert_eq!(got, expect);
        // run results: the documented example deserialises into what the JS expects
        let f = Fake::new(Policy::RejectFixed(480), Policy::RejectFixed(480));
        let r = tuner(&f).stress(&CaptureLease::default(), &stress_req(Some(128), 0.3, 0), &no_progress).unwrap();
        let v = serde_json::to_value(&r).unwrap();
        let example = &k["commands"]["stress_run"]["response"];
        for key in example.as_object().unwrap().keys() {
            assert!(v.get(key).is_some(), "stress_run response lacks {key}");
        }
        for key in example["input"].as_object().unwrap().keys() {
            assert!(v["input"].get(key).is_some(), "direction report lacks {key}");
        }
        let req: StressRequest = serde_json::from_value(k["commands"]["stress_run"]["request"].clone()).unwrap();
        assert_eq!(req.buffer_frames, Some(128));
        let rt: RoundTripRequest = serde_json::from_value(k["commands"]["latency_play_and_capture"]["request"].clone()).unwrap();
        assert_eq!(rt.stimulus.sample_rate, 48_000);
        let rv = serde_json::to_value(
            tuner(&Fake::new(Policy::Honour, Policy::Honour))
                .round_trip(&CaptureLease::default(), &rt_req(impulse_stimulus(10, 4_800, 1.0), Some(256), None), &no_progress)
                .unwrap(),
        )
        .unwrap();
        for key in k["commands"]["latency_play_and_capture"]["response"].as_object().unwrap().keys() {
            assert!(rv.get(key).is_some(), "round trip response lacks {key}");
        }
        assert_eq!(rv["reportedBufferFrames"], json!({ "in": 256, "out": 256 }));
    }
}
