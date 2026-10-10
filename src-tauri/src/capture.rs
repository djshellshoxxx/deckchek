//! Continuous native stereo capture, the process-wide capture lease and
//! streaming capture (FS-00 §4.7).
//!
//! Data flow: CPAL callback (no alloc, no locks) -> SPSC ring (`rtrb`) ->
//! consumer thread -> either preallocated bounded stereo buffers + level
//! events (`start_live_capture`), or fixed-size stereo blocks sent over a
//! `tauri::ipc::Channel` (`start_stream_capture`).
//!
//! Lease: one capture at a time per process (FS-00 §6.2). Live and stream
//! sessions acquire it internally; other features may hold it explicitly via
//! `capture_lease_acquire`. A busy request fails with a structured
//! `CAPTURE_BUSY` error `{code, message, holder, since, kind, deviceName, leaseId}`;
//! every other error stays a plain string (backward compatible).
//!
//! Stream wire format (one `Raw` channel message per block, little endian):
//! `0 magic "DCSB" | 4 u16 version=1 | 6 u16 flags (1=final, 2=discontinuity)
//! | 8 u32 seq | 12 u32 sampleRate | 16 u32 frames | 20 u32 droppedBlocks
//! | 24 u32 streamErrors | 28 u32 reserved | 32 f64 overrunSamples
//! | 40 f64 framesCaptured | 48 f32[frames] left | f32[frames] right`.
//! Backpressure: the webview acknowledges each block (`stream_capture_ack`);
//! at most `MAX_LAG_BLOCKS` blocks may be unacknowledged or queued, beyond
//! that the oldest queued block is dropped and counted in `droppedBlocks`.

use crate::audio::{
    choose_input, parse_pair_selection, pick_config_for_pairs, resolve_pairs, sample_i16, sample_u16,
    AudioCapturePayload, ChannelPair, PairSel,
};
use cpal::{
    traits::{DeviceTrait, StreamTrait},
    SampleFormat,
};
use rtrb::{Consumer, Producer, RingBuffer};
use serde::Serialize;
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering::Relaxed},
        mpsc, Arc, Mutex, MutexGuard,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    AppHandle, Emitter, State,
};

pub const CLIP_THRESHOLD: f32 = 0.999;
pub const MAX_ERROR_MESSAGES: usize = 20;
pub const MIN_SECONDS: f32 = 1.0;
pub const MAX_SECONDS: f32 = 1800.0;
const LEVEL_INTERVAL: Duration = Duration::from_millis(50);

// ---------------------------------------------------------------- pure logic

pub fn clamp_max_seconds(value: f32) -> f32 {
    if value.is_finite() {
        value.clamp(MIN_SECONDS, MAX_SECONDS)
    } else {
        MIN_SECONDS
    }
}

pub fn is_clipped(x: f32) -> bool {
    x.abs() >= CLIP_THRESHOLD
}

#[cfg(test)]
/// Number of samples in `data` at or above the clipping threshold.
pub fn count_clipped(data: &[f32]) -> u64 {
    data.iter().filter(|x| is_clipped(**x)).count() as u64
}

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Levels {
    pub peak_l: f32,
    pub peak_r: f32,
    pub rms_l: f32,
    pub rms_r: f32,
    pub clip_l: bool,
    pub clip_r: bool,
}

/// Levels of one selected input pair inside a `capture-levels` event.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairLevels {
    pub label: String,
    pub first: u16,
    #[serde(flatten)]
    pub levels: Levels,
}

/// Accumulates per-channel statistics between level events.
#[derive(Debug, Default)]
pub struct LevelWindow {
    peak: [f32; 2],
    sum_sq: [f64; 2],
    clip: [bool; 2],
    frames: u64,
}

impl LevelWindow {
    pub fn push(&mut self, l: f32, r: f32) {
        for (i, x) in [l, r].into_iter().enumerate() {
            let a = if x.is_finite() { x.abs() } else { 0.0 };
            if a > self.peak[i] {
                self.peak[i] = a;
            }
            self.sum_sq[i] += (a as f64) * (a as f64);
            if is_clipped(x) {
                self.clip[i] = true;
            }
        }
        self.frames += 1;
    }

    /// Returns the window's levels and resets it. An empty window yields zeros.
    pub fn take(&mut self) -> Levels {
        let n = self.frames.max(1) as f64;
        let out = Levels {
            peak_l: self.peak[0].min(1.0),
            peak_r: self.peak[1].min(1.0),
            rms_l: ((self.sum_sq[0] / n).sqrt() as f32).min(1.0),
            rms_r: ((self.sum_sq[1] / n).sqrt() as f32).min(1.0),
            clip_l: self.clip[0],
            clip_r: self.clip[1],
        };
        *self = Self::default();
        out
    }
}

/// Clipped-sample counts of one selected pair.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairClip {
    pub label: String,
    pub first: u16,
    pub clipped_samples_l: u64,
    pub clipped_samples_r: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureQuality {
    pub frames_captured: u64,
    pub overrun_samples: u64,
    /// Clipped samples of the first selected pair.
    pub clipped_samples_l: u64,
    pub clipped_samples_r: u64,
    pub stream_errors: u64,
    pub stream_error_messages: Vec<String>,
    pub truncated: bool,
    pub callback_count: u64,
    pub max_callback_gap_ms: f64,
    /// Clipped samples per selected pair (empty until the first drain).
    pub pairs: Vec<PairClip>,
}

/// Counters shared between the audio callback, consumer and commands.
#[derive(Debug, Default)]
pub struct Shared {
    frames_captured: AtomicU64,
    overrun_samples: AtomicU64,
    clipped_l: AtomicU64,
    clipped_r: AtomicU64,
    stream_errors: AtomicU64,
    truncated: AtomicBool,
    callback_count: AtomicU64,
    max_gap_us: AtomicU64,
    last_callback_us: AtomicU64,
    error_messages: Mutex<Vec<String>>,
    /// Written by the consumer thread only (never the audio callback).
    pair_clips: Mutex<Vec<PairClip>>,
    /// Set when the device disappeared; stream sessions end themselves.
    fatal: AtomicBool,
}

impl Shared {
    /// Called from the audio callback: lock-free, allocation-free.
    pub fn record_callback(&self, now_us: u64) {
        let n = self.callback_count.fetch_add(1, Relaxed);
        if n > 0 {
            let gap = now_us.saturating_sub(self.last_callback_us.load(Relaxed));
            self.max_gap_us.fetch_max(gap, Relaxed);
        }
        self.last_callback_us.store(now_us, Relaxed);
    }

    pub fn record_overrun(&self, samples: usize) {
        if samples > 0 {
            self.overrun_samples.fetch_add(samples as u64, Relaxed);
        }
    }

    pub fn record_error(&self, message: String) {
        self.stream_errors.fetch_add(1, Relaxed);
        if let Ok(mut list) = self.error_messages.lock() {
            if list.len() >= MAX_ERROR_MESSAGES {
                list.remove(0);
            }
            list.push(message);
        }
    }

    pub fn record_fatal(&self, message: String) {
        self.fatal.store(true, Relaxed);
        self.record_error(message);
    }

    pub fn is_fatal(&self) -> bool {
        self.fatal.load(Relaxed)
    }

    pub fn snapshot(&self) -> CaptureQuality {
        CaptureQuality {
            frames_captured: self.frames_captured.load(Relaxed),
            overrun_samples: self.overrun_samples.load(Relaxed),
            clipped_samples_l: self.clipped_l.load(Relaxed),
            clipped_samples_r: self.clipped_r.load(Relaxed),
            stream_errors: self.stream_errors.load(Relaxed),
            stream_error_messages: self
                .error_messages
                .lock()
                .map(|l| l.clone())
                .unwrap_or_default(),
            truncated: self.truncated.load(Relaxed),
            callback_count: self.callback_count.load(Relaxed),
            max_callback_gap_ms: self.max_gap_us.load(Relaxed) as f64 / 1000.0,
            pairs: self.pair_clips.lock().map(|l| l.clone()).unwrap_or_default(),
        }
    }
}

/// Audio-callback side: writes whole frames into the ring, dropping (and
/// counting) whatever does not fit. Returns the number of dropped samples.
pub fn push_frames<T: Copy>(
    producer: &mut Producer<f32>,
    input: &[T],
    channels: usize,
    convert: impl Fn(T) -> f32,
) -> usize {
    if channels == 0 {
        return input.len();
    }
    let frames = input.len() / channels;
    let fit = frames.min(producer.slots() / channels);
    let n = fit * channels;
    if n > 0 {
        if let Ok(chunk) = producer.write_chunk_uninit(n) {
            chunk.fill_from_iter(input[..n].iter().map(|&v| convert(v)));
        }
    }
    input.len() - n
}

/// Reads every whole frame currently in the ring and hands each one (all
/// channels) to `f`. Returns frames read.
pub fn drain_frames(consumer: &mut Consumer<f32>, channels: usize, frame: &mut Vec<f32>, mut f: impl FnMut(&[f32])) -> usize {
    if channels == 0 {
        return 0;
    }
    let avail = consumer.slots();
    let n = avail - avail % channels;
    if n == 0 {
        return 0;
    }
    let Ok(chunk) = consumer.read_chunk(n) else {
        return 0;
    };
    frame.clear();
    frame.resize(channels, 0.0);
    let (a, b) = chunk.as_slices();
    let mut it = a.iter().chain(b.iter());
    let frames = n / channels;
    for _ in 0..frames {
        for slot in frame.iter_mut() {
            *slot = it.next().copied().unwrap_or(0.0);
        }
        f(frame);
    }
    chunk.commit_all();
    frames
}

/// The (left, right) samples of `pair` in one interleaved frame. Offsets past
/// the frame clamp to its last channel (mono duplicates, as before pairs).
#[inline]
pub fn pair_samples(frame: &[f32], offs: (usize, usize)) -> (f32, f32) {
    let last = frame.len().saturating_sub(1);
    (frame[offs.0.min(last)], frame[offs.1.min(last)])
}

/// One selected pair inside the live accumulator.
#[derive(Debug)]
pub struct Track {
    pub pair: ChannelPair,
    offs: (usize, usize),
    pub left: Vec<f32>,
    pub right: Vec<f32>,
    pub clipped_l: u64,
    pub clipped_r: u64,
    pub window: LevelWindow,
}

/// Frames reserved per growth step of the live accumulator (~1.4 s at 48 kHz).
pub const GROW_FRAMES: usize = 1 << 16;
/// Upper bound on the memory one live capture may hold for samples (all pairs,
/// left + right, f32). `start_live_with` shortens `maxSeconds` to fit it.
pub const LIVE_BUFFER_BUDGET_BYTES: u64 = 1 << 30;
/// Recorded in the stream errors when the accumulator could not grow.
pub const OUT_OF_MEMORY: &str = "Ran out of memory for the recording; the capture stopped recording here (truncated).";

/// Longest `max_seconds` (<= the request) whose sample buffers fit
/// [`LIVE_BUFFER_BUDGET_BYTES`] for `pairs` pairs at `sample_rate`.
pub fn budget_max_seconds(max_seconds: f32, sample_rate: u32, pairs: usize) -> f32 {
    let bytes_per_sec = sample_rate.max(1) as f64 * pairs.max(1) as f64 * 2.0 * 4.0;
    let fit = (LIVE_BUFFER_BUDGET_BYTES as f64 / bytes_per_sec).floor() as f32;
    max_seconds.min(fit.max(MIN_SECONDS))
}

/// Consumer side: bounded per-pair stereo accumulation. Buffers grow in
/// [`GROW_FRAMES`] steps with fallible allocation, so a long `max_frames`
/// reserves nothing up front and an allocation failure truncates the
/// recording instead of aborting the process.
#[derive(Debug)]
pub struct Accumulator {
    pub tracks: Vec<Track>,
    max_frames: usize,
    frames: usize,
    /// Frames every track can hold without reallocating.
    reserved: usize,
    grow_frames: usize,
    pub truncated: bool,
    /// Growing the buffers failed; nothing more is recorded.
    pub out_of_memory: bool,
    frame: Vec<f32>,
}

impl Accumulator {
    /// Accumulates channels 1-2 (mono duplicated), the pre-pairs behaviour.
    #[cfg(test)]
    pub fn new(max_frames: usize) -> Self {
        Self::with_pairs(max_frames, &crate::audio::input_pairs(2)[..1])
    }

    pub fn with_pairs(max_frames: usize, pairs: &[ChannelPair]) -> Self {
        let tracks = pairs
            .iter()
            .map(|p| Track {
                pair: p.clone(),
                offs: p.offsets(),
                left: Vec::new(),
                right: Vec::new(),
                clipped_l: 0,
                clipped_r: 0,
                window: LevelWindow::default(),
            })
            .collect();
        Self { tracks, max_frames, frames: 0, reserved: 0, grow_frames: GROW_FRAMES, truncated: false, out_of_memory: false, frame: Vec::new() }
    }

    /// Reserves the next growth step for every track. False when the
    /// allocator refuses (the caller then stops recording).
    fn grow(tracks: &mut [Track], reserved: &mut usize, max_frames: usize, step: usize) -> bool {
        let want = step.max(1).min(max_frames.saturating_sub(*reserved));
        for t in tracks.iter_mut() {
            for buf in [&mut t.left, &mut t.right] {
                if buf.try_reserve_exact((*reserved + want).saturating_sub(buf.len())).is_err() {
                    return false;
                }
            }
        }
        *reserved += want;
        true
    }

    fn push_frame(&mut self, frame: &[f32]) {
        let Self { tracks, max_frames, frames, reserved, grow_frames, truncated, out_of_memory, .. } = self;
        if !*out_of_memory && *frames < *max_frames && *frames >= *reserved && !Self::grow(tracks, reserved, *max_frames, *grow_frames) {
            *out_of_memory = true;
        }
        let full = *frames >= *max_frames || *out_of_memory;
        for t in tracks.iter_mut() {
            let (l, r) = pair_samples(frame, t.offs);
            t.window.push(l, r);
            if !full {
                t.clipped_l += is_clipped(l) as u64;
                t.clipped_r += is_clipped(r) as u64;
                t.left.push(l);
                t.right.push(r);
            }
        }
        if full {
            *truncated = true;
        } else {
            *frames += 1;
        }
    }

    /// Drains all whole frames currently in the ring. Frames beyond the bound
    /// are discarded and `truncated` is set. Returns frames consumed.
    pub fn drain(&mut self, consumer: &mut Consumer<f32>, channels: usize) -> usize {
        let mut frame = std::mem::take(&mut self.frame);
        let n = drain_frames(consumer, channels, &mut frame, |f| self.push_frame(f));
        self.frame = frame;
        n
    }

    /// Levels of every pair since the previous call (and resets the windows).
    pub fn take_levels(&mut self) -> Vec<PairLevels> {
        self.tracks
            .iter_mut()
            .map(|t| PairLevels { label: t.pair.label.clone(), first: t.pair.first, levels: t.window.take() })
            .collect()
    }

    pub fn publish(&self, shared: &Shared) {
        shared.frames_captured.store(self.frames as u64, Relaxed);
        if let Some(t) = self.tracks.first() {
            shared.clipped_l.store(t.clipped_l, Relaxed);
            shared.clipped_r.store(t.clipped_r, Relaxed);
        }
        shared.truncated.store(self.truncated, Relaxed);
        if let Ok(mut clips) = shared.pair_clips.lock() {
            clips.clear();
            clips.extend(self.tracks.iter().map(|t| PairClip {
                label: t.pair.label.clone(),
                first: t.pair.first,
                clipped_samples_l: t.clipped_l,
                clipped_samples_r: t.clipped_r,
            }));
        }
    }

    /// Growth step override, so tests can force an allocation failure.
    #[cfg(test)]
    pub fn with_grow_step(mut self, step: usize) -> Self {
        self.grow_frames = step;
        self
    }

    /// Per-pair samples, consuming the accumulator.
    pub fn into_tracks(self) -> Vec<(ChannelPair, Vec<f32>, Vec<f32>)> {
        self.tracks.into_iter().map(|t| (t.pair, t.left, t.right)).collect()
    }
}

// ------------------------------------------------------------- capture lease

pub const CAPTURE_BUSY: &str = "CAPTURE_BUSY";
/// Holder recorded for `start_live_capture` calls that name none.
pub const DEFAULT_LIVE_HOLDER: &str = "live-capture";
/// Holder recorded for `start_stream_capture` calls that name none.
pub const DEFAULT_STREAM_HOLDER: &str = "stream-capture";
/// Holder recorded for `capture_native_audio` calls that name none.
pub const DEFAULT_BOUNDED_HOLDER: &str = "native-capture";
pub const MAX_HOLDER_LEN: usize = 64;

static NEXT_LEASE_ID: AtomicU64 = AtomicU64::new(1);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Locks a mutex, recovering the data if a previous holder panicked. The
/// guarded values here stay consistent across a panic (plain slots).
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LeaseKind {
    /// Held by `start_live_capture`.
    Live,
    /// Held by `start_stream_capture`.
    Stream,
    /// Held explicitly through `capture_lease_acquire`.
    External,
    /// Held by a bounded `capture_native_audio` call for its duration.
    Bounded,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaseGrant {
    pub lease_id: u64,
    pub holder: String,
    pub device_name: Option<String>,
    /// Unix epoch milliseconds.
    pub since: u64,
    pub kind: LeaseKind,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaseStatus {
    pub held: bool,
    pub lease_id: Option<u64>,
    pub holder: Option<String>,
    pub device_name: Option<String>,
    pub since: Option<u64>,
    pub kind: Option<LeaseKind>,
}

/// Structured `CAPTURE_BUSY` error (FS-00 AC-5).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureBusy {
    pub code: &'static str,
    pub message: String,
    pub holder: String,
    pub since: u64,
    pub kind: LeaseKind,
    pub device_name: Option<String>,
    pub lease_id: u64,
}

impl CaptureBusy {
    fn from_grant(g: &LeaseGrant) -> Self {
        Self {
            code: CAPTURE_BUSY,
            // Keeps "already running" / "busy" so older error mapping still
            // classifies it as a busy input.
            message: format!("The audio input is busy: \"{}\" is already running.", g.holder),
            holder: g.holder.clone(),
            since: g.since,
            kind: g.kind,
            device_name: g.device_name.clone(),
            lease_id: g.lease_id,
        }
    }
}

/// Command error: a busy lease serialises as an object, anything else as the
/// plain string the commands always returned.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum CaptureError {
    Busy(CaptureBusy),
    Message(String),
}

impl From<String> for CaptureError {
    fn from(value: String) -> Self {
        Self::Message(value)
    }
}

impl From<&str> for CaptureError {
    fn from(value: &str) -> Self {
        Self::Message(value.to_string())
    }
}

/// Holder ids are short machine names such as `live-monitor` or `wear-map`.
pub fn validate_holder(holder: &str) -> Result<String, String> {
    let h = holder.trim();
    if h.is_empty() || h.len() > MAX_HOLDER_LEN {
        return Err(format!("Capture holder must be 1-{MAX_HOLDER_LEN} characters."));
    }
    if !h.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':')) {
        return Err("Capture holder may only use letters, digits, '-', '_', '.' and ':'.".to_string());
    }
    Ok(h.to_string())
}

/// The process-wide capture lease (FS-00 §6.2): non-blocking acquire, one
/// holder at a time, regardless of device.
#[derive(Clone, Default)]
pub struct CaptureLease(Arc<Mutex<Option<LeaseGrant>>>);

impl CaptureLease {
    pub fn acquire(
        &self,
        holder: &str,
        device_name: Option<String>,
        kind: LeaseKind,
    ) -> Result<LeaseGrant, CaptureError> {
        let holder = validate_holder(holder)?;
        let mut slot = lock(&self.0);
        if let Some(current) = slot.as_ref() {
            return Err(CaptureError::Busy(CaptureBusy::from_grant(current)));
        }
        let grant = LeaseGrant {
            lease_id: NEXT_LEASE_ID.fetch_add(1, Relaxed),
            holder,
            device_name,
            since: now_ms(),
            kind,
        };
        *slot = Some(grant.clone());
        Ok(grant)
    }

    /// Releases the lease if `lease_id` still holds it. Idempotent.
    pub fn release(&self, lease_id: u64) -> bool {
        let mut slot = lock(&self.0);
        if slot.as_ref().is_some_and(|g| g.lease_id == lease_id) {
            *slot = None;
            true
        } else {
            false
        }
    }

    pub fn current(&self) -> Option<LeaseGrant> {
        lock(&self.0).clone()
    }

    pub fn is_held(&self) -> bool {
        lock(&self.0).is_some()
    }

    pub fn status(&self) -> LeaseStatus {
        match self.current() {
            Some(g) => LeaseStatus {
                held: true,
                lease_id: Some(g.lease_id),
                holder: Some(g.holder),
                device_name: g.device_name,
                since: Some(g.since),
                kind: Some(g.kind),
            },
            None => LeaseStatus { held: false, lease_id: None, holder: None, device_name: None, since: None, kind: None },
        }
    }
}

// ------------------------------------------------------- stream primitives

pub const STREAM_MAGIC: [u8; 4] = *b"DCSB";
pub const STREAM_VERSION: u16 = 1;
/// Multi-pair blocks: header offset 28 holds the pair count (u32) and the
/// payload is `left, right` per pair in selection order.
pub const STREAM_VERSION_PAIRS: u16 = 2;
pub const STREAM_HEADER_BYTES: usize = 48;
pub const FLAG_FINAL: u16 = 1;
pub const FLAG_DISCONTINUITY: u16 = 2;
/// Webview lag (unacknowledged + queued blocks) tolerated before dropping.
pub const MAX_LAG_BLOCKS: usize = 5;
pub const DEFAULT_BLOCK_MS: u32 = 1000;
pub const MIN_BLOCK_MS: u32 = 20;
pub const MAX_BLOCK_MS: u32 = 5000;
const PUMP_IDLE: Duration = Duration::from_millis(5);

pub fn clamp_block_ms(value: Option<u32>) -> u32 {
    value.unwrap_or(DEFAULT_BLOCK_MS).clamp(MIN_BLOCK_MS, MAX_BLOCK_MS)
}

pub fn block_frames(sample_rate: u32, block_ms: u32) -> usize {
    ((sample_rate as u64 * block_ms as u64 + 500) / 1000).max(1) as usize
}

/// Per-block quality, cumulative since the stream started.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockQuality {
    pub dropped_blocks: u32,
    pub stream_errors: u32,
    pub overrun_samples: u64,
    pub frames_captured: u64,
    /// Blocks were dropped between the previous delivered block and this one.
    pub discontinuity: bool,
    /// Last block of the stream (stopped, device lost or preempted).
    #[serde(rename = "final")]
    pub final_block: bool,
}

/// One (left, right) buffer per selected pair.
pub type Stereo = (Vec<f32>, Vec<f32>);

#[derive(Debug, Clone, PartialEq)]
pub struct StreamBlock {
    pub seq: u32,
    pub pairs: Vec<Stereo>,
}

/// Single-pair block (wire version 1).
#[cfg(test)]
pub fn encode_block(seq: u32, sample_rate: u32, q: &BlockQuality, left: &[f32], right: &[f32]) -> Vec<u8> {
    encode_slices(seq, sample_rate, q, &[(left, right)])
}

/// One pair encodes as version 1 (byte-identical to `encode_block`), several
/// as version 2. Frames = the shortest buffer.
pub fn encode_block_pairs(seq: u32, sample_rate: u32, q: &BlockQuality, pairs: &[Stereo]) -> Vec<u8> {
    let slices: Vec<(&[f32], &[f32])> = pairs.iter().map(|(l, r)| (l.as_slice(), r.as_slice())).collect();
    encode_slices(seq, sample_rate, q, &slices)
}

fn encode_slices(seq: u32, sample_rate: u32, q: &BlockQuality, pairs: &[(&[f32], &[f32])]) -> Vec<u8> {
    let frames = pairs.iter().map(|(l, r)| l.len().min(r.len())).min().unwrap_or(0);
    let multi = pairs.len() > 1;
    let mut out = Vec::with_capacity(STREAM_HEADER_BYTES + frames * 8 * pairs.len().max(1));
    let flags = (q.final_block as u16 * FLAG_FINAL) | (q.discontinuity as u16 * FLAG_DISCONTINUITY);
    out.extend_from_slice(&STREAM_MAGIC);
    out.extend_from_slice(&(if multi { STREAM_VERSION_PAIRS } else { STREAM_VERSION }).to_le_bytes());
    out.extend_from_slice(&flags.to_le_bytes());
    out.extend_from_slice(&seq.to_le_bytes());
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&(frames as u32).to_le_bytes());
    out.extend_from_slice(&q.dropped_blocks.to_le_bytes());
    out.extend_from_slice(&q.stream_errors.to_le_bytes());
    out.extend_from_slice(&(if multi { pairs.len() as u32 } else { 0 }).to_le_bytes());
    out.extend_from_slice(&(q.overrun_samples as f64).to_le_bytes());
    out.extend_from_slice(&(q.frames_captured as f64).to_le_bytes());
    for (left, right) in pairs {
        for x in &left[..frames] {
            out.extend_from_slice(&x.to_le_bytes());
        }
        for x in &right[..frames] {
            out.extend_from_slice(&x.to_le_bytes());
        }
    }
    out
}

#[cfg(test)]
#[derive(Debug, Clone, PartialEq)]
pub struct DecodedBlock {
    pub seq: u32,
    pub sample_rate: u32,
    pub quality: BlockQuality,
    pub left: Vec<f32>,
    pub right: Vec<f32>,
    /// Pairs after the first (version 2 blocks).
    pub extra: Vec<Stereo>,
}

/// Inverse of `encode_block` (the JS bridge has the production decoder).
#[cfg(test)]
pub fn decode_block(b: &[u8]) -> Result<DecodedBlock, String> {
    let u16_at = |o: usize| u16::from_le_bytes([b[o], b[o + 1]]);
    let u32_at = |o: usize| u32::from_le_bytes(b[o..o + 4].try_into().unwrap());
    let f64_at = |o: usize| f64::from_le_bytes(b[o..o + 8].try_into().unwrap());
    if b.len() < STREAM_HEADER_BYTES || b[0..4] != STREAM_MAGIC {
        return Err("not a stream block".into());
    }
    let pair_count = match u16_at(4) {
        STREAM_VERSION => 1,
        STREAM_VERSION_PAIRS => u32_at(28) as usize,
        _ => return Err("unsupported version".into()),
    };
    if pair_count == 0 {
        return Err("no pairs".into());
    }
    let flags = u16_at(6);
    let frames = u32_at(16) as usize;
    if b.len() != STREAM_HEADER_BYTES + frames * 8 * pair_count {
        return Err("length mismatch".into());
    }
    let read = |start: usize| -> Vec<f32> {
        (0..frames)
            .map(|i| f32::from_le_bytes(b[start + i * 4..start + i * 4 + 4].try_into().unwrap()))
            .collect()
    };
    Ok(DecodedBlock {
        seq: u32_at(8),
        sample_rate: u32_at(12),
        quality: BlockQuality {
            dropped_blocks: u32_at(20),
            stream_errors: u32_at(24),
            overrun_samples: f64_at(32) as u64,
            frames_captured: f64_at(40) as u64,
            discontinuity: flags & FLAG_DISCONTINUITY != 0,
            final_block: flags & FLAG_FINAL != 0,
        },
        left: read(STREAM_HEADER_BYTES),
        right: read(STREAM_HEADER_BYTES + frames * 4),
        extra: (1..pair_count)
            .map(|p| {
                let base = STREAM_HEADER_BYTES + p * frames * 8;
                (read(base), read(base + frames * 4))
            })
            .collect(),
    })
}

/// Acknowledgement-based backpressure. Blocks are sent while fewer than
/// `max_lag` are unacknowledged; the rest wait in a queue. When
/// unacknowledged + queued exceeds `max_lag`, the oldest queued block is
/// dropped, counted, and the next delivered block is flagged discontinuous.
#[derive(Debug)]
pub struct BlockQueue {
    pending: VecDeque<StreamBlock>,
    in_flight: VecDeque<u32>,
    max_lag: usize,
    dropped: u32,
    gap: bool,
}

impl BlockQueue {
    pub fn new(max_lag: usize) -> Self {
        Self { pending: VecDeque::new(), in_flight: VecDeque::new(), max_lag: max_lag.max(1), dropped: 0, gap: false }
    }

    pub fn push(&mut self, block: StreamBlock) {
        self.pending.push_back(block);
        while self.in_flight.len() + self.pending.len() > self.max_lag && !self.pending.is_empty() {
            self.pending.pop_front();
            self.dropped += 1;
            self.gap = true;
        }
    }

    /// Cumulative acknowledgement: every in-flight block with seq <= `seq`.
    pub fn ack(&mut self, seq: u32) {
        while self.in_flight.front().is_some_and(|&s| s <= seq) {
            self.in_flight.pop_front();
        }
    }

    /// Next block to send (with its discontinuity flag), if the window allows.
    pub fn next(&mut self) -> Option<(StreamBlock, bool)> {
        if self.in_flight.len() >= self.max_lag {
            return None;
        }
        let block = self.pending.pop_front()?;
        self.in_flight.push_back(block.seq);
        Some((block, std::mem::take(&mut self.gap)))
    }

    /// Everything still queued, ignoring the window (used when the stream ends).
    pub fn drain_all(&mut self) -> Vec<(StreamBlock, bool)> {
        let mut out = Vec::with_capacity(self.pending.len());
        while let Some(block) = self.pending.pop_front() {
            self.in_flight.push_back(block.seq);
            out.push((block, std::mem::take(&mut self.gap)));
        }
        out
    }

    pub fn take_gap(&mut self) -> bool {
        std::mem::take(&mut self.gap)
    }

    pub fn dropped(&self) -> u32 {
        self.dropped
    }

    #[cfg(test)]
    pub fn in_flight(&self) -> usize {
        self.in_flight.len()
    }

    #[cfg(test)]
    pub fn queued(&self) -> usize {
        self.pending.len()
    }
}

/// Where encoded blocks go: a webview `Channel` in the app, a closure in tests.
pub trait BlockSink: Send + 'static {
    fn send_block(&self, bytes: Vec<u8>) -> Result<(), String>;
}

impl BlockSink for Channel<InvokeResponseBody> {
    fn send_block(&self, bytes: Vec<u8>) -> Result<(), String> {
        self.send(InvokeResponseBody::Raw(bytes)).map_err(|e| e.to_string())
    }
}

/// Shared between the pump thread and the ack/stop commands.
#[derive(Debug)]
pub struct StreamCtl {
    pub stop: AtomicBool,
    /// Highest acknowledged seq, -1 before the first ack.
    pub acked: AtomicI64,
}

impl Default for StreamCtl {
    fn default() -> Self {
        Self { stop: AtomicBool::new(false), acked: AtomicI64::new(-1) }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StreamEnd {
    Stopped,
    DeviceLost,
    SinkClosed,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamSummary {
    pub stream_id: u64,
    pub ended: StreamEnd,
    pub blocks_sent: u32,
    /// Seq of the final block, which the bridge waits for before resolving.
    pub last_seq: Option<u32>,
    pub dropped_blocks: u32,
    pub frames_captured: u64,
    pub overrun_samples: u64,
    pub stream_errors: u64,
    pub stream_error_messages: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct PumpConfig {
    pub channels: usize,
    /// Interleaved (left, right) offsets of each selected pair.
    pub offsets: Vec<(usize, usize)>,
    pub sample_rate: u32,
    pub block_frames: usize,
    pub max_lag: usize,
    pub idle: Duration,
}

struct PumpOut {
    sent: u32,
    last_seq: Option<u32>,
    dropped: u32,
    frames: u64,
    ended: StreamEnd,
}

/// Consumer side of a stream: ring -> fixed-size blocks -> backpressure queue
/// -> sink. Runs until `ctl.stop`, a fatal device error, or a sink failure;
/// then flushes queued blocks plus the partial block, the last one flagged
/// final (an empty final block when nothing is left).
fn run_pump<S: BlockSink>(
    consumer: &mut Consumer<f32>,
    cfg: PumpConfig,
    sink: &S,
    shared: &Shared,
    ctl: &StreamCtl,
) -> PumpOut {
    let channels = cfg.channels.max(1);
    let bf = cfg.block_frames.max(1);
    let offsets = if cfg.offsets.is_empty() { vec![(0, 1)] } else { cfg.offsets.clone() };
    let fresh = || -> Vec<Stereo> { offsets.iter().map(|_| (Vec::with_capacity(bf), Vec::with_capacity(bf))).collect() };
    let mut queue = BlockQueue::new(cfg.max_lag);
    let mut bufs = fresh();
    let mut frame = Vec::with_capacity(channels);
    let (mut seq, mut frames_total, mut sent, mut last_seq) = (0u32, 0u64, 0u32, None);
    let quality = |queue: &BlockQueue, frames_total: u64, gap: bool, last: bool| BlockQuality {
        dropped_blocks: queue.dropped(),
        stream_errors: shared.stream_errors.load(Relaxed).min(u32::MAX as u64) as u32,
        overrun_samples: shared.overrun_samples.load(Relaxed),
        frames_captured: frames_total,
        discontinuity: gap,
        final_block: last,
    };
    let ended = loop {
        let stopping = ctl.stop.load(Relaxed);
        drain_frames(consumer, channels, &mut frame, |f| {
            for (buf, &offs) in bufs.iter_mut().zip(&offsets) {
                let (l, r) = pair_samples(f, offs);
                buf.0.push(l);
                buf.1.push(r);
            }
            frames_total += 1;
            if bufs[0].0.len() == bf {
                let block = StreamBlock { seq, pairs: std::mem::replace(&mut bufs, fresh()) };
                seq = seq.wrapping_add(1);
                queue.push(block);
            }
        });
        shared.frames_captured.store(frames_total, Relaxed);
        let acked = ctl.acked.load(Relaxed);
        if acked >= 0 {
            queue.ack(acked as u32);
        }
        let mut failed = false;
        while let Some((block, gap)) = queue.next() {
            let bytes = encode_block_pairs(block.seq, cfg.sample_rate, &quality(&queue, frames_total, gap, false), &block.pairs);
            if let Err(e) = sink.send_block(bytes) {
                shared.record_error(format!("Stream delivery failed: {e}"));
                failed = true;
                break;
            }
            sent += 1;
            last_seq = Some(block.seq);
        }
        if failed {
            break StreamEnd::SinkClosed;
        }
        if stopping {
            break StreamEnd::Stopped;
        }
        if shared.is_fatal() {
            break StreamEnd::DeviceLost;
        }
        thread::sleep(cfg.idle);
    };
    if ended != StreamEnd::SinkClosed {
        let mut rest = queue.drain_all();
        if !bufs[0].0.is_empty() || rest.is_empty() {
            let gap = queue.take_gap();
            rest.push((StreamBlock { seq, pairs: std::mem::take(&mut bufs) }, gap));
        }
        let count = rest.len();
        for (i, (block, gap)) in rest.into_iter().enumerate() {
            let q = quality(&queue, frames_total, gap, i + 1 == count);
            if sink.send_block(encode_block_pairs(block.seq, cfg.sample_rate, &q, &block.pairs)).is_err() {
                break;
            }
            sent += 1;
            last_seq = Some(block.seq);
        }
    }
    PumpOut { sent, last_seq, dropped: queue.dropped(), frames: frames_total, ended }
}

// ------------------------------------------------------------- session / IO

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveCaptureInfo {
    pub device_name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub max_seconds: f32,
    /// Lease held by this session (added in M6; older callers ignore it).
    pub lease_id: u64,
    /// Selected input pairs, in order (default: the first pair).
    pub pairs: Vec<ChannelPair>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCaptureResult {
    pub payload: AudioCapturePayload,
    pub quality: CaptureQuality,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCaptureStatus {
    pub running: bool,
    pub elapsed_sec: f32,
    pub quality: CaptureQuality,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LevelEvent {
    /// Levels of the first selected pair (the pre-pairs event shape).
    #[serde(flatten)]
    levels: Levels,
    elapsed_sec: f32,
    overrun_samples: u64,
    /// Levels of every selected pair, in selection order.
    pairs: Vec<PairLevels>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    /// Equals the lease id of the session.
    pub stream_id: u64,
    pub holder: String,
    pub device_name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub block_ms: u32,
    pub block_frames: u32,
    /// Selected input pairs; blocks carry one left/right per pair in this order.
    pub pairs: Vec<ChannelPair>,
}

/// What an opened input reports back to the session.
#[derive(Debug, Clone)]
pub struct SourceInfo {
    pub device_name: String,
    pub sample_rate: u32,
    pub channels: u16,
}

type Ready = Result<(SourceInfo, Consumer<f32>), String>;
type LevelSink = Box<dyn Fn(&LevelEvent) + Send>;

/// Runs on the dedicated stream thread: opens a source, reports `Ready`, keeps
/// the source alive until `stop`. The device opener is used in the app; tests
/// use a synthetic opener.
pub type Opener = Box<dyn FnOnce(Arc<Shared>, Arc<AtomicBool>, mpsc::Sender<Ready>) + Send>;

struct Session {
    info: LiveCaptureInfo,
    started: Instant,
    shared: Arc<Shared>,
    stream_stop: Arc<AtomicBool>,
    consumer_stop: Arc<AtomicBool>,
    stream_thread: JoinHandle<()>,
    consumer_thread: JoinHandle<Accumulator>,
}

struct StreamSession {
    info: StreamInfo,
    shared: Arc<Shared>,
    ctl: Arc<StreamCtl>,
    stream_stop: Arc<AtomicBool>,
    stream_thread: JoinHandle<()>,
    pump_thread: JoinHandle<PumpOut>,
}

/// Managed capture state: the live session slot, the stream session slot and
/// the process-wide `CaptureLease` they both acquire.
///
/// The slot mutexes are only ever held for short bookkeeping, never while a
/// device opens or a thread is joined, so status polls, restore's
/// `is_running` check and preempt never wait on a driver.
#[derive(Clone)]
pub struct LiveCaptureState {
    session: Arc<Mutex<Option<Session>>>,
    stream: Arc<Mutex<Option<StreamSession>>>,
    pub(crate) lease: CaptureLease,
    /// Cancel flag of the running bounded capture, by lease id.
    bounded: Arc<Mutex<Option<BoundedSlot>>>,
    open_timeout: Duration,
}

impl Default for LiveCaptureState {
    fn default() -> Self {
        Self {
            session: Arc::default(),
            stream: Arc::default(),
            lease: CaptureLease::default(),
            bounded: Arc::default(),
            open_timeout: OPEN_TIMEOUT,
        }
    }
}

/// (lease id, cancel flag) of a running bounded capture.
type BoundedSlot = (u64, Arc<AtomicBool>);

/// Whether any capture holds the input (FS-08 refuses restore meanwhile).
pub(crate) fn is_running(state: &LiveCaptureState) -> bool {
    state.lease.is_held() || state.session.lock().map(|slot| slot.is_some()).unwrap_or(true)
}

fn build_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    mut producer: Producer<f32>,
    shared: Arc<Shared>,
    convert: fn(T) -> f32,
) -> Result<cpal::Stream, String>
where
    T: cpal::SizedSample + Send + 'static,
{
    let channels = config.channels as usize;
    let cb_shared = Arc::clone(&shared);
    let origin = Instant::now();
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                cb_shared.record_callback(origin.elapsed().as_micros() as u64);
                let dropped = push_frames(&mut producer, data, channels, convert);
                cb_shared.record_overrun(dropped);
            },
            move |e| match e {
                cpal::StreamError::DeviceNotAvailable => shared.record_fatal(e.to_string()),
                other => shared.record_error(other.to_string()),
            },
            None,
        )
        .map_err(|e| e.to_string())
}

/// Opener for a real cpal input device.
/// `firsts` (the pair selection) decides how many channels are opened; the
/// default config is used whenever it is wide enough.
fn device_source(device_name: Option<String>, sample_rate: Option<u32>, firsts: Option<Vec<u16>>) -> Opener {
    Box::new(move |shared, stop, ready| {
        let setup = || -> Result<(cpal::Stream, SourceInfo, Consumer<f32>), String> {
            let device = choose_input(device_name.as_deref())?;
            let name = device.name().unwrap_or_else(|_| "Unnamed audio input".to_string());
            let supported = pick_config_for_pairs(&device, &name, sample_rate, firsts.as_deref())?;
            let format = supported.sample_format();
            let config: cpal::StreamConfig = supported.into();
            if config.channels == 0 {
                return Err("Input device reported zero channels.".to_string());
            }
            let ring_samples = (config.sample_rate.0 as usize).max(4096) * config.channels as usize;
            let (producer, consumer) = RingBuffer::<f32>::new(ring_samples);
            let stream = match format {
                SampleFormat::F32 => build_stream::<f32>(&device, &config, producer, shared.clone(), |v| v),
                SampleFormat::I16 => build_stream::<i16>(&device, &config, producer, shared.clone(), sample_i16),
                SampleFormat::U16 => build_stream::<u16>(&device, &config, producer, shared.clone(), sample_u16),
                other => Err(format!("Input sample format {other:?} is not supported for live capture.")),
            }?;
            stream.play().map_err(|e| e.to_string())?;
            let info = SourceInfo { device_name: name, sample_rate: config.sample_rate.0, channels: config.channels };
            Ok((stream, info, consumer))
        };
        match setup() {
            Ok((stream, info, consumer)) => {
                let _ = ready.send(Ok((info, consumer)));
                while !stop.load(Relaxed) {
                    thread::sleep(Duration::from_millis(10));
                }
                drop(stream);
            }
            Err(e) => {
                let _ = ready.send(Err(e));
            }
        }
    })
}

/// How long a session waits for the input to open.
pub const OPEN_TIMEOUT: Duration = Duration::from_secs(10);

/// Spawns the source thread and waits (<= `timeout`) for it to open. On a
/// timeout the thread is told to stop and detached, never joined: it may be
/// stuck inside the driver's open, and joining would make the timeout
/// meaningless. It exits by itself once the open returns (its `ready.send`
/// fails and `stop` is already set). Callers hold no capture lock meanwhile.
fn open_source(opener: Opener, shared: Arc<Shared>, stop: Arc<AtomicBool>, timeout: Duration) -> Result<(SourceInfo, Consumer<f32>, JoinHandle<()>), String> {
    let (tx, rx) = mpsc::channel();
    let thread = {
        let stop = stop.clone();
        thread::Builder::new()
            .name("deckchek-capture-stream".into())
            .spawn(move || opener(shared, stop, tx))
            .map_err(|e| e.to_string())?
    };
    match rx.recv_timeout(timeout) {
        Ok(Ok((info, consumer))) => Ok((info, consumer, thread)),
        Ok(Err(e)) => {
            // The opener reported its failure and is returning: joining is quick.
            stop.store(true, Relaxed);
            let _ = thread.join();
            Err(e)
        }
        Err(_) => {
            stop.store(true, Relaxed);
            drop(thread);
            Err("Timed out opening the audio input.".to_string())
        }
    }
}

/// Resolves the pair selection against the opened source; on failure the
/// source is stopped before the error is returned.
fn resolve_for_source(firsts: Option<&[u16]>, source: &SourceInfo, stop: &AtomicBool, thread: JoinHandle<()>) -> Result<(Vec<ChannelPair>, JoinHandle<()>), String> {
    match resolve_pairs(firsts, source.channels, &source.device_name) {
        Ok(p) => Ok((p, thread)),
        Err(e) => {
            stop.store(true, Relaxed);
            let _ = thread.join();
            Err(e)
        }
    }
}

fn consumer_thread_main(
    emit: LevelSink,
    mut consumer: Consumer<f32>,
    info: LiveCaptureInfo,
    shared: Arc<Shared>,
    stop: Arc<AtomicBool>,
    started: Instant,
) -> Accumulator {
    let channels = info.channels as usize;
    let max_frames = (info.sample_rate as f64 * info.max_seconds as f64).ceil() as usize;
    let mut acc = Accumulator::with_pairs(max_frames, &info.pairs);
    let mut last_emit = Instant::now();
    let mut oom_reported = false;
    loop {
        let stopping = stop.load(Relaxed);
        acc.drain(&mut consumer, channels);
        acc.publish(&shared);
        if acc.out_of_memory && !oom_reported {
            oom_reported = true;
            shared.record_error(OUT_OF_MEMORY.to_string());
        }
        if stopping {
            break;
        }
        if last_emit.elapsed() >= LEVEL_INTERVAL {
            last_emit = Instant::now();
            let pairs = acc.take_levels();
            emit(&LevelEvent {
                levels: pairs.first().map(|p| p.levels).unwrap_or_default(),
                elapsed_sec: started.elapsed().as_secs_f32(),
                overrun_samples: shared.overrun_samples.load(Relaxed),
                pairs,
            });
        }
        thread::sleep(Duration::from_millis(5));
    }
    acc
}

fn start_live_with(
    state: &LiveCaptureState,
    holder: Option<&str>,
    device_name: Option<String>,
    max_seconds: f32,
    firsts: Option<Vec<u16>>,
    opener: Opener,
    emit: LevelSink,
) -> Result<LiveCaptureInfo, CaptureError> {
    let grant = state.lease.acquire(holder.unwrap_or(DEFAULT_LIVE_HOLDER), device_name, LeaseKind::Live)?;
    let result = (|| -> Result<LiveCaptureInfo, CaptureError> {
        if lock(&state.session).is_some() {
            // Unreachable while the lease is honoured; kept as a guard.
            return Err("A live capture is already running.".into());
        }
        let shared = Arc::new(Shared::default());
        let stream_stop = Arc::new(AtomicBool::new(false));
        let consumer_stop = Arc::new(AtomicBool::new(false));
        // Opened without holding the session slot: a hung driver open must not
        // block status polls, stop, preempt or restore (BUG-05).
        let (source, consumer, stream_thread) = open_source(opener, shared.clone(), stream_stop.clone(), state.open_timeout)?;
        let (pairs, stream_thread) = resolve_for_source(firsts.as_deref(), &source, &stream_stop, stream_thread)?;
        // The whole recording is kept in memory: bound it (BUG-15).
        let max_seconds = budget_max_seconds(clamp_max_seconds(max_seconds), source.sample_rate, pairs.len());
        let info = LiveCaptureInfo {
            device_name: source.device_name,
            sample_rate: source.sample_rate,
            channels: source.channels,
            max_seconds,
            lease_id: grant.lease_id,
            pairs,
        };
        let started = Instant::now();
        let consumer_thread = {
            let (info, shared, stop) = (info.clone(), shared.clone(), consumer_stop.clone());
            thread::Builder::new()
                .name("deckchek-capture-consumer".into())
                .spawn(move || consumer_thread_main(emit, consumer, info, shared, stop, started))
        };
        let consumer_thread = match consumer_thread {
            Ok(t) => t,
            Err(e) => {
                stream_stop.store(true, Relaxed);
                let _ = stream_thread.join();
                return Err(e.to_string().into());
            }
        };
        let session = Session { info: info.clone(), started, shared, stream_stop, consumer_stop, stream_thread, consumer_thread };
        let mut slot = lock(&state.session);
        if slot.is_some() || !state.lease.current().is_some_and(|g| g.lease_id == grant.lease_id) {
            // Preempted while opening (or the guard above was bypassed): never
            // leave an unowned session running.
            drop(slot);
            let _ = end_session(state, session);
            return Err(crate::audio::CAPTURE_CANCELLED.into());
        }
        *slot = Some(session);
        Ok(info)
    })();
    if result.is_err() {
        state.lease.release(grant.lease_id);
    }
    result
}

/// Takes the session out of its slot if it is the one `lease_id` names
/// (`None`: whatever runs, for preempt). A stop naming a lease that is no
/// longer in the slot was preempted, so it gets `CAPTURE_CANCELLED` and never
/// another feature's session (BUG-02).
fn take_session(state: &LiveCaptureState, lease_id: Option<u64>) -> Result<Session, String> {
    let mut slot = lock(&state.session);
    match (slot.as_ref(), lease_id) {
        (None, None) => Err("No live capture is running.".to_string()),
        (Some(s), Some(id)) if s.info.lease_id != id => Err(crate::audio::CAPTURE_CANCELLED.to_string()),
        (None, Some(_)) => Err(crate::audio::CAPTURE_CANCELLED.to_string()),
        _ => Ok(slot.take().expect("checked above")),
    }
}

fn stop_blocking(state: &LiveCaptureState, lease_id: Option<u64>) -> Result<LiveCaptureResult, String> {
    let session = take_session(state, lease_id)?;
    end_session(state, session)
}

/// Stops a session that is no longer in the slot and releases its lease.
fn end_session(state: &LiveCaptureState, session: Session) -> Result<LiveCaptureResult, String> {
    session.stream_stop.store(true, Relaxed);
    let _ = session.stream_thread.join();
    session.consumer_stop.store(true, Relaxed);
    let joined = session.consumer_thread.join();
    state.lease.release(session.info.lease_id);
    let acc = joined.map_err(|_| "Capture consumer thread panicked.".to_string())?;
    let quality = session.shared.snapshot();
    Ok(LiveCaptureResult {
        payload: AudioCapturePayload::from_tracks(
            session.info.device_name,
            session.info.sample_rate,
            session.info.channels,
            acc.into_tracks(),
            quality.stream_error_messages.clone(),
        ),
        quality,
    })
}

fn start_stream_with<S: BlockSink>(
    state: &LiveCaptureState,
    holder: Option<&str>,
    device_name: Option<String>,
    block_ms: Option<u32>,
    firsts: Option<Vec<u16>>,
    opener: Opener,
    sink: S,
) -> Result<StreamInfo, CaptureError> {
    let grant = state.lease.acquire(holder.unwrap_or(DEFAULT_STREAM_HOLDER), device_name, LeaseKind::Stream)?;
    let result = (|| -> Result<StreamInfo, CaptureError> {
        // A session that ended by itself (device lost, webview gone) has
        // already released the lease; reap it. Taken out under the lock,
        // finished (joined) outside it.
        let old = lock(&state.stream).take();
        if let Some(old) = old {
            finish_stream(state, old);
        }
        let block_ms = clamp_block_ms(block_ms);
        let shared = Arc::new(Shared::default());
        let stream_stop = Arc::new(AtomicBool::new(false));
        let (source, mut consumer, stream_thread) = open_source(opener, shared.clone(), stream_stop.clone(), state.open_timeout)?;
        let (pairs, stream_thread) = resolve_for_source(firsts.as_deref(), &source, &stream_stop, stream_thread)?;
        let bf = block_frames(source.sample_rate, block_ms);
        let info = StreamInfo {
            stream_id: grant.lease_id,
            holder: grant.holder.clone(),
            device_name: source.device_name,
            sample_rate: source.sample_rate,
            channels: source.channels,
            block_ms,
            block_frames: bf as u32,
            pairs,
        };
        let ctl = Arc::new(StreamCtl::default());
        let offsets = info.pairs.iter().map(ChannelPair::offsets).collect();
        let cfg = PumpConfig { channels: source.channels as usize, offsets, sample_rate: source.sample_rate, block_frames: bf, max_lag: MAX_LAG_BLOCKS, idle: PUMP_IDLE };
        let pump_thread = {
            let (shared, ctl, stream_stop, lease, lease_id) = (shared.clone(), ctl.clone(), stream_stop.clone(), state.lease.clone(), grant.lease_id);
            thread::Builder::new().name("deckchek-capture-pump".into()).spawn(move || {
                let out = run_pump(&mut consumer, cfg, &sink, &shared, &ctl);
                // Auto-release when the stream ends or errors (FS-00 §6.2).
                stream_stop.store(true, Relaxed);
                lease.release(lease_id);
                out
            })
        };
        let pump_thread = match pump_thread {
            Ok(t) => t,
            Err(e) => {
                stream_stop.store(true, Relaxed);
                let _ = stream_thread.join();
                return Err(e.to_string().into());
            }
        };
        let session = StreamSession { info: info.clone(), shared, ctl, stream_stop, stream_thread, pump_thread };
        let mut slot = lock(&state.stream);
        if slot.is_some() || !state.lease.current().is_some_and(|g| g.lease_id == grant.lease_id) {
            drop(slot);
            finish_stream(state, session);
            return Err(crate::audio::CAPTURE_CANCELLED.into());
        }
        *slot = Some(session);
        Ok(info)
    })();
    if result.is_err() {
        state.lease.release(grant.lease_id);
    }
    result
}

/// Stops the source first (so every captured frame reaches the ring), then the
/// pump, which flushes and sends the final block.
fn finish_stream(state: &LiveCaptureState, s: StreamSession) -> StreamSummary {
    s.stream_stop.store(true, Relaxed);
    let _ = s.stream_thread.join();
    s.ctl.stop.store(true, Relaxed);
    let out = s.pump_thread.join();
    state.lease.release(s.info.stream_id);
    let q = s.shared.snapshot();
    let (sent, last_seq, dropped, frames, ended) = match out {
        Ok(o) => (o.sent, o.last_seq, o.dropped, o.frames, o.ended),
        Err(_) => (0, None, 0, q.frames_captured, StreamEnd::SinkClosed),
    };
    StreamSummary {
        stream_id: s.info.stream_id,
        ended,
        blocks_sent: sent,
        last_seq,
        dropped_blocks: dropped,
        frames_captured: frames,
        overrun_samples: q.overrun_samples,
        stream_errors: q.stream_errors,
        stream_error_messages: q.stream_error_messages,
    }
}

/// Stops (or reaps) the stream `stream_id` names (`None`: whatever is in the
/// slot, for preempt). A stream that is no longer in the slot was preempted
/// or reaped by a newer stream: `CAPTURE_CANCELLED`, never the newer one (BUG-02).
fn stop_stream_blocking(state: &LiveCaptureState, stream_id: Option<u64>) -> Result<StreamSummary, String> {
    let session = {
        let mut slot = lock(&state.stream);
        match (slot.as_ref(), stream_id) {
            (None, None) => return Err("No stream capture is running.".to_string()),
            (Some(s), Some(id)) if s.info.stream_id != id => return Err(crate::audio::CAPTURE_CANCELLED.to_string()),
            (None, Some(_)) => return Err(crate::audio::CAPTURE_CANCELLED.to_string()),
            _ => slot.take().expect("checked above"),
        }
    };
    Ok(finish_stream(state, session))
}

fn ack_stream(state: &LiveCaptureState, stream_id: u64, seq: u32) {
    if let Some(s) = lock(&state.stream).as_ref() {
        if s.info.stream_id == stream_id {
            s.ctl.acked.fetch_max(seq as i64, Relaxed);
        }
    }
}

/// Error code prefix when the holder did not let go within [`PREEMPT_WAIT`].
pub const CAPTURE_STOPPING: &str = "CAPTURE_STOPPING";

/// Stops whatever holds the lease ("Stop <holder> and continue"). Returns the
/// grant that was stopped, or None when the input was free.
///
/// The lease is only released by its owner (session stop, bounded guard) or,
/// for an external lease, here. A live or stream session that is still
/// opening, or a bounded capture that has not noticed its cancel flag yet,
/// keeps the input; after [`PREEMPT_WAIT`] the preempter gets
/// `CAPTURE_STOPPING` instead of a lease that is free on paper while a stream
/// still runs on the device (BUG-09).
fn preempt_blocking(state: &LiveCaptureState) -> Result<Option<LeaseGrant>, String> {
    preempt_with_wait(state, PREEMPT_WAIT)
}

fn preempt_with_wait(state: &LiveCaptureState, wait: Duration) -> Result<Option<LeaseGrant>, String> {
    let Some(current) = state.lease.current() else { return Ok(None) };
    let id = current.lease_id;
    let still_held = || state.lease.current().is_some_and(|g| g.lease_id == id);
    let deadline = Instant::now() + wait;
    loop {
        match current.kind {
            LeaseKind::Live => {
                if let Ok(s) = take_session(state, Some(id)) {
                    let _ = end_session(state, s);
                }
            }
            LeaseKind::Stream => {
                let _ = stop_stream_blocking(state, Some(id));
            }
            LeaseKind::Bounded => {
                if let Some((bid, cancel)) = lock(&state.bounded).as_ref() {
                    if *bid == id {
                        cancel.store(true, Relaxed);
                    }
                }
            }
            LeaseKind::External => {
                state.lease.release(id);
            }
        }
        if !still_held() {
            return Ok(Some(current));
        }
        if Instant::now() >= deadline {
            return Err(format!(
                "{CAPTURE_STOPPING}: \"{}\" is still stopping and holds the audio input. Try again in a moment.",
                current.holder
            ));
        }
        thread::sleep(Duration::from_millis(5));
    }
}

/// How long a preempt waits for the holder to let go of the input.
const PREEMPT_WAIT: Duration = Duration::from_secs(5);

/// Releases the bounded lease and its cancel slot even if the capture panics.
struct BoundedGuard<'a> {
    state: &'a LiveCaptureState,
    lease_id: u64,
}

impl Drop for BoundedGuard<'_> {
    fn drop(&mut self) {
        let mut slot = lock(&self.state.bounded);
        if slot.as_ref().is_some_and(|(id, _)| *id == self.lease_id) {
            *slot = None;
        }
        drop(slot);
        self.state.lease.release(self.lease_id);
    }
}

/// Runs a bounded capture under the process-wide lease (kind `bounded`).
/// `run` gets a cancel flag that `capture_preempt` sets; the lease is
/// released when `run` returns.
pub(crate) fn with_bounded_lease<T>(
    state: &LiveCaptureState,
    holder: Option<&str>,
    device_name: Option<String>,
    run: impl FnOnce(&AtomicBool) -> Result<T, String>,
) -> Result<T, CaptureError> {
    let grant = state.lease.acquire(holder.unwrap_or(DEFAULT_BOUNDED_HOLDER), device_name, LeaseKind::Bounded)?;
    let cancel = Arc::new(AtomicBool::new(false));
    *lock(&state.bounded) = Some((grant.lease_id, cancel.clone()));
    let _guard = BoundedGuard { state, lease_id: grant.lease_id };
    run(&cancel).map_err(CaptureError::Message)
}

/// Releases an explicitly acquired lease. Live and stream leases end with
/// their session (stop or preempt), never through this call.
fn release_external(state: &LiveCaptureState, lease_id: u64) -> bool {
    match state.lease.current() {
        Some(g) if g.lease_id == lease_id && g.kind == LeaseKind::External => state.lease.release(lease_id),
        _ => false,
    }
}

// ---------------------------------------------------------------- commands

#[tauri::command]
pub async fn start_live_capture(
    app: AppHandle,
    state: State<'_, LiveCaptureState>,
    device_name: Option<String>,
    max_seconds: f32,
    holder: Option<String>,
    pairs: Option<Vec<PairSel>>,
) -> Result<LiveCaptureInfo, CaptureError> {
    let firsts = parse_pair_selection(pairs.as_deref())?;
    let state = state.inner().clone();
    let emit: LevelSink = Box::new(move |e: &LevelEvent| {
        let _ = app.emit("capture-levels", e);
    });
    tauri::async_runtime::spawn_blocking(move || {
        let opener = device_source(device_name.clone(), None, firsts.clone());
        start_live_with(&state, holder.as_deref(), device_name, max_seconds, firsts, opener, emit)
    })
    .await
    .map_err(|e| CaptureError::Message(e.to_string()))?
}

/// Stops the live session `lease_id` (from `start_live_capture`) and returns
/// its audio. A session that was preempted gets `CAPTURE_CANCELLED`; the
/// session of another feature is never stopped or returned (BUG-02).
#[tauri::command]
pub async fn stop_live_capture(state: State<'_, LiveCaptureState>, lease_id: u64) -> Result<LiveCaptureResult, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || stop_blocking(&state, Some(lease_id)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn live_capture_status(state: State<'_, LiveCaptureState>) -> Result<LiveCaptureStatus, String> {
    let slot = state.session.lock().map_err(|_| "Capture state poisoned.".to_string())?;
    Ok(match slot.as_ref() {
        Some(s) => LiveCaptureStatus {
            running: true,
            elapsed_sec: s.started.elapsed().as_secs_f32(),
            quality: s.shared.snapshot(),
        },
        None => LiveCaptureStatus {
            running: false,
            elapsed_sec: 0.0,
            quality: CaptureQuality::default(),
        },
    })
}

#[tauri::command]
pub fn capture_lease_acquire(
    state: State<'_, LiveCaptureState>,
    holder: String,
    device_name: Option<String>,
) -> Result<LeaseGrant, CaptureError> {
    state.lease.acquire(&holder, device_name, LeaseKind::External)
}

#[tauri::command]
pub fn capture_lease_release(state: State<'_, LiveCaptureState>, lease_id: u64) -> bool {
    release_external(state.inner(), lease_id)
}

#[tauri::command]
pub fn capture_lease_status(state: State<'_, LiveCaptureState>) -> LeaseStatus {
    state.lease.status()
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PreemptResult {
    pub stopped: Option<LeaseGrant>,
}

/// Stops the current holder and emits `capture-preempted` with its grant.
#[tauri::command]
pub async fn capture_preempt(app: AppHandle, state: State<'_, LiveCaptureState>) -> Result<PreemptResult, String> {
    let state = state.inner().clone();
    let stopped = tauri::async_runtime::spawn_blocking(move || preempt_blocking(&state))
        .await
        .map_err(|e| e.to_string())??;
    if let Some(g) = &stopped {
        let _ = app.emit("capture-preempted", g);
    }
    Ok(PreemptResult { stopped })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn start_stream_capture(
    state: State<'_, LiveCaptureState>,
    device_name: Option<String>,
    sample_rate: Option<u32>,
    block_ms: Option<u32>,
    holder: Option<String>,
    channel: Channel<InvokeResponseBody>,
    pairs: Option<Vec<PairSel>>,
) -> Result<StreamInfo, CaptureError> {
    let firsts = parse_pair_selection(pairs.as_deref())?;
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let opener = device_source(device_name.clone(), sample_rate, firsts.clone());
        start_stream_with(&state, holder.as_deref(), device_name, block_ms, firsts, opener, channel)
    })
    .await
    .map_err(|e| CaptureError::Message(e.to_string()))?
}

#[tauri::command]
pub fn stream_capture_ack(state: State<'_, LiveCaptureState>, stream_id: u64, seq: u32) {
    ack_stream(state.inner(), stream_id, seq);
}

/// Stops (or reaps) the stream `stream_id` names; see `stop_live_capture`.
#[tauri::command]
pub async fn stop_stream_capture(state: State<'_, LiveCaptureState>, stream_id: u64) -> Result<StreamSummary, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || stop_stream_blocking(&state, Some(stream_id)))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn max_seconds_is_clamped() {
        assert_eq!(clamp_max_seconds(0.0), 1.0);
        assert_eq!(clamp_max_seconds(5000.0), 1800.0);
        assert_eq!(clamp_max_seconds(f32::NAN), 1.0);
        assert_eq!(clamp_max_seconds(30.0), 30.0);
    }

    #[test]
    fn clipping_is_counted_at_threshold_for_both_polarities() {
        assert_eq!(count_clipped(&[0.0, 0.998, 0.999, -1.0, 1.2, f32::NAN]), 3);
    }

    #[test]
    fn level_window_computes_peak_rms_clip_and_resets() {
        let mut w = LevelWindow::default();
        w.push(0.5, -1.0);
        w.push(-0.5, 0.0);
        let l = w.take();
        assert_eq!(l.peak_l, 0.5);
        assert_eq!(l.peak_r, 1.0);
        assert!((l.rms_l - 0.5).abs() < 1e-6);
        assert!((l.rms_r - (0.5f32).sqrt()).abs() < 1e-6);
        assert!(!l.clip_l && l.clip_r);
        assert_eq!(w.take(), Levels::default());
    }

    #[test]
    fn push_frames_drops_whole_frames_and_counts_samples() {
        let (mut p, mut c) = RingBuffer::<f32>::new(4);
        // 3 stereo frames = 6 samples, room for 2 frames
        let dropped = push_frames(&mut p, &[1.0f32, 2.0, 3.0, 4.0, 5.0, 6.0], 2, |v| v);
        assert_eq!(dropped, 2);
        let mut acc = Accumulator::new(10);
        assert_eq!(acc.drain(&mut c, 2), 2);
        assert_eq!(acc.tracks[0].left, vec![1.0, 3.0]);
        assert_eq!(acc.tracks[0].right, vec![2.0, 4.0]);
    }

    #[test]
    fn partial_trailing_frame_is_dropped() {
        let (mut p, _c) = RingBuffer::<f32>::new(16);
        assert_eq!(push_frames(&mut p, &[0.0f32; 5], 2, |v| v), 1);
    }

    #[test]
    fn mono_is_duplicated_and_extra_channels_ignored() {
        let (mut p, mut c) = RingBuffer::<f32>::new(16);
        push_frames(&mut p, &[0.1f32, 0.2], 1, |v| v);
        let mut acc = Accumulator::new(10);
        acc.drain(&mut c, 1);
        assert_eq!(acc.tracks[0].left, acc.tracks[0].right);
        push_frames(&mut p, &[1.0f32, 2.0, 9.0, 3.0, 4.0, 9.0], 3, |v| v);
        let mut acc = Accumulator::new(10);
        acc.drain(&mut c, 3);
        assert_eq!((&acc.tracks[0].left, &acc.tracks[0].right), (&vec![1.0, 3.0], &vec![2.0, 4.0]));
    }

    #[test]
    fn drain_is_bounded_and_sets_truncated() {
        let (mut p, mut c) = RingBuffer::<f32>::new(32);
        push_frames(&mut p, &[0.5f32; 20], 2, |v| v);
        let mut acc = Accumulator::new(4);
        assert_eq!(acc.drain(&mut c, 2), 10);
        assert_eq!(acc.tracks[0].left.len(), 4);
        assert!(acc.truncated);
        assert_eq!(c.slots(), 0);
        assert_eq!(acc.tracks[0].left.capacity(), 4);
    }

    #[test]
    fn exactly_full_is_not_truncated() {
        let (mut p, mut c) = RingBuffer::<f32>::new(8);
        push_frames(&mut p, &[0.5f32; 8], 2, |v| v);
        let mut acc = Accumulator::new(4);
        acc.drain(&mut c, 2);
        assert!(!acc.truncated);
    }

    #[test]
    fn quality_accounting_aggregates_counters() {
        let shared = Shared::default();
        shared.record_callback(1_000);
        shared.record_callback(11_000);
        shared.record_callback(14_000);
        shared.record_overrun(6);
        shared.record_overrun(0);
        shared.record_overrun(2);

        let (mut p, mut c) = RingBuffer::<f32>::new(16);
        push_frames(&mut p, &[1.0f32, 0.0, -1.0, 0.2, 0.1, 0.2], 2, |v| v);
        let mut acc = Accumulator::new(100);
        acc.drain(&mut c, 2);
        acc.publish(&shared);

        let q = shared.snapshot();
        assert_eq!(q.frames_captured, 3);
        assert_eq!(q.clipped_samples_l, 2);
        assert_eq!(q.clipped_samples_r, 0);
        assert_eq!(q.overrun_samples, 8);
        assert_eq!(q.callback_count, 3);
        assert_eq!(q.max_callback_gap_ms, 10.0);
        assert!(!q.truncated);
    }

    #[test]
    fn error_messages_are_capped_but_count_is_total() {
        let shared = Shared::default();
        for i in 0..30 {
            shared.record_error(format!("e{i}"));
        }
        let q = shared.snapshot();
        assert_eq!(q.stream_errors, 30);
        assert_eq!(q.stream_error_messages.len(), MAX_ERROR_MESSAGES);
        assert_eq!(q.stream_error_messages.last().unwrap(), "e29");
    }

    #[test]
    fn quality_serializes_camel_case() {
        let v = serde_json::to_value(CaptureQuality::default()).unwrap();
        for k in ["framesCaptured", "overrunSamples", "clippedSamplesL", "clippedSamplesR", "streamErrors", "truncated", "callbackCount", "maxCallbackGapMs"] {
            assert!(v.get(k).is_some(), "missing {k}");
        }
    }

    // ------------------------------------------------------------ lease

    fn synth_value(n: u64) -> f32 {
        (n % 65536) as f32 / 65536.0
    }

    /// Channel `c` (0-based) of the synthetic source: 1 = -ramp, 2+ = ramp + 10c.
    fn synth_channel(c: usize, v: f32) -> f32 {
        match c {
            0 => v,
            1 => -v,
            _ => v + c as f32 * 10.0,
        }
    }

    fn blk(seq: u32) -> StreamBlock {
        StreamBlock { seq, pairs: vec![(vec![], vec![])] }
    }

    #[derive(Clone, Copy)]
    enum Pace {
        /// One callback per buffer period, like a real device (overruns if the pump lags).
        Realtime,
        /// As fast as the ring accepts, never overrunning (fast deterministic tests).
        Lossless,
    }

    #[derive(Clone, Copy)]
    struct Synth {
        sample_rate: u32,
        channels: u16,
        callback_frames: usize,
        pace: Pace,
        limit_frames: Option<u64>,
        fatal_after: Option<u64>,
    }

    impl Synth {
        fn lossless(sample_rate: u32, limit_frames: u64) -> Self {
            Self { sample_rate, channels: 2, callback_frames: 64, pace: Pace::Lossless, limit_frames: Some(limit_frames), fatal_after: None }
        }
    }

    /// Synthetic input: left = ramp `synth_value(n)`, right = -left, extra
    /// channels per `synth_channel`. Goes through the same ring/`push_frames` path as cpal.
    fn synthetic_source(s: Synth) -> Opener {
        Box::new(move |shared, stop, ready| {
            let ch = s.channels as usize;
            let (mut producer, consumer) = RingBuffer::<f32>::new((s.sample_rate as usize).max(4096) * ch);
            let info = SourceInfo { device_name: "Synthetic 48k".into(), sample_rate: s.sample_rate, channels: s.channels };
            let _ = ready.send(Ok((info, consumer)));
            let mut buf = vec![0f32; s.callback_frames * ch];
            let (origin, mut n, mut k) = (Instant::now(), 0u64, 0u64);
            let period = s.callback_frames as f64 / s.sample_rate as f64;
            while !stop.load(Relaxed) {
                if s.fatal_after.is_some_and(|f| n >= f) && !shared.is_fatal() {
                    shared.record_fatal("The requested device is no longer available.".into());
                }
                let left_to_make = s.limit_frames.map_or(u64::MAX, |l| l.saturating_sub(n));
                if left_to_make == 0 || shared.is_fatal() {
                    thread::sleep(Duration::from_millis(1));
                    continue;
                }
                let frames = (s.callback_frames as u64).min(left_to_make) as usize;
                for i in 0..frames {
                    let v = synth_value(n + i as u64);
                    for c in 0..ch {
                        buf[i * ch + c] = synth_channel(c, v);
                    }
                }
                match s.pace {
                    Pace::Realtime => {
                        let due = origin + Duration::from_secs_f64((k + 1) as f64 * period);
                        if let Some(wait) = due.checked_duration_since(Instant::now()) {
                            thread::sleep(wait);
                        }
                    }
                    Pace::Lossless => {
                        while producer.slots() < frames * ch && !stop.load(Relaxed) {
                            thread::sleep(Duration::from_micros(200));
                        }
                    }
                }
                shared.record_callback(origin.elapsed().as_micros() as u64);
                let dropped = push_frames(&mut producer, &buf[..frames * ch], ch, |v| v);
                shared.record_overrun(dropped);
                n += frames as u64;
                k += 1;
            }
        })
    }

    fn failing_source(message: &'static str) -> Opener {
        Box::new(move |_shared, _stop, ready| {
            let _ = ready.send(Err(message.to_string()));
        })
    }

    fn no_levels() -> LevelSink {
        Box::new(|_| {})
    }

    struct FnSink<F>(F);
    impl<F: Fn(Vec<u8>) -> Result<(), String> + Send + 'static> BlockSink for FnSink<F> {
        fn send_block(&self, bytes: Vec<u8>) -> Result<(), String> {
            (self.0)(bytes)
        }
    }

    /// A sink that records decoded blocks.
    fn collecting_sink() -> (impl BlockSink, Arc<Mutex<Vec<DecodedBlock>>>) {
        let got = Arc::new(Mutex::new(Vec::new()));
        let g = got.clone();
        (FnSink(move |b: Vec<u8>| {
            g.lock().unwrap().push(decode_block(&b).unwrap());
            Ok(())
        }), got)
    }

    fn wait_until(timeout: Duration, mut cond: impl FnMut() -> bool) -> bool {
        let end = Instant::now() + timeout;
        while Instant::now() < end {
            if cond() {
                return true;
            }
            thread::sleep(Duration::from_millis(2));
        }
        cond()
    }

    fn busy(e: CaptureError) -> CaptureBusy {
        match e {
            CaptureError::Busy(b) => b,
            other => panic!("expected CAPTURE_BUSY, got {other:?}"),
        }
    }

    #[test]
    fn lease_is_exclusive_and_reports_holder_and_since() {
        let lease = CaptureLease::default();
        let before = now_ms();
        let g = lease.acquire("wear-map", Some("In 1/2".into()), LeaseKind::External).unwrap();
        assert!(g.since >= before && g.since <= now_ms());
        let b = busy(lease.acquire("live-monitor", None, LeaseKind::Stream).unwrap_err());
        assert_eq!((b.code, b.holder.as_str(), b.since, b.kind, b.lease_id), (CAPTURE_BUSY, "wear-map", g.since, LeaseKind::External, g.lease_id));
        assert_eq!(b.device_name.as_deref(), Some("In 1/2"));
        assert!(b.message.contains("busy") && b.message.contains("already running"), "old busy classification still matches");
        let st = lease.status();
        assert!(st.held && st.holder.as_deref() == Some("wear-map") && st.lease_id == Some(g.lease_id) && st.kind == Some(LeaseKind::External));
        assert!(!lease.release(g.lease_id + 1000), "wrong id does not release");
        assert!(lease.release(g.lease_id));
        assert!(!lease.release(g.lease_id), "release is idempotent");
        assert_eq!(lease.status(), LeaseStatus { held: false, lease_id: None, holder: None, device_name: None, since: None, kind: None });
        let g2 = lease.acquire("live-monitor", None, LeaseKind::Stream).unwrap();
        assert!(g2.lease_id > g.lease_id, "lease ids are never reused");
    }

    #[test]
    fn holder_ids_are_validated() {
        assert_eq!(validate_holder("  live-monitor ").unwrap(), "live-monitor");
        for ok in ["fs13:wear_map", "a", "x.y"] {
            assert!(validate_holder(ok).is_ok(), "{ok}");
        }
        for bad in ["", "   ", "has space", "<script>", "ünï", &"x".repeat(MAX_HOLDER_LEN + 1)] {
            assert!(validate_holder(bad).is_err(), "{bad}");
        }
        let lease = CaptureLease::default();
        assert!(matches!(lease.acquire("bad holder", None, LeaseKind::External), Err(CaptureError::Message(_))));
        assert!(!lease.is_held());
    }

    #[test]
    fn errors_serialize_busy_as_object_and_others_as_plain_strings() {
        let lease = CaptureLease::default();
        lease.acquire("live-monitor", None, LeaseKind::Stream).unwrap();
        let v = serde_json::to_value(lease.acquire("x", None, LeaseKind::Live).unwrap_err()).unwrap();
        let mut keys: Vec<&str> = v.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["code", "deviceName", "holder", "kind", "leaseId", "message", "since"]);
        assert_eq!(v["code"], "CAPTURE_BUSY");
        assert_eq!(v["kind"], "stream");
        assert_eq!(serde_json::to_value(CaptureError::from("Audio input not found: X")).unwrap(), serde_json::json!("Audio input not found: X"));
    }

    #[test]
    fn backup_sees_any_lease_holder_as_running() {
        let state = LiveCaptureState::default();
        assert!(!is_running(&state));
        let g = state.lease.acquire("hum-hunter", None, LeaseKind::External).unwrap();
        assert!(is_running(&state));
        assert!(release_external(&state, g.lease_id));
        assert!(!is_running(&state));
    }

    // ------------------------------------------------------ live sessions

    #[test]
    fn live_capture_holds_the_lease_and_releases_it_on_stop() {
        let state = LiveCaptureState::default();
        let levels = Arc::new(AtomicU64::new(0));
        let lv = levels.clone();
        let emit: LevelSink = Box::new(move |_| {
            lv.fetch_add(1, Relaxed);
        });
        let info = start_live_with(&state, None, None, 5.0, None, synthetic_source(Synth::lossless(48000, 4800)), emit).unwrap();
        assert_eq!((info.sample_rate, info.channels, info.max_seconds), (48000, 2, 5.0));
        let st = state.lease.status();
        assert_eq!((st.holder.as_deref(), st.kind, st.lease_id), (Some(DEFAULT_LIVE_HOLDER), Some(LeaseKind::Live), Some(info.lease_id)));
        assert!(is_running(&state));

        // AC-5: every other capture path gets CAPTURE_BUSY naming the holder.
        let b = busy(start_live_with(&state, Some("pre-gig"), None, 5.0, None, synthetic_source(Synth::lossless(48000, 10)), no_levels()).unwrap_err());
        assert_eq!(b.holder, DEFAULT_LIVE_HOLDER);
        let (sink, _) = collecting_sink();
        let b = busy(start_stream_with(&state, Some("wear-map"), None, None, None, synthetic_source(Synth::lossless(48000, 10)), sink).unwrap_err());
        assert_eq!((b.holder.as_str(), b.kind, b.lease_id), (DEFAULT_LIVE_HOLDER, LeaseKind::Live, info.lease_id));
        assert!(busy(state.lease.acquire("hum-hunter", None, LeaseKind::External).unwrap_err()).since > 0);
        assert!(!release_external(&state, info.lease_id), "a live lease is only released by stopping the session");

        assert!(wait_until(Duration::from_secs(5), || state.session.lock().unwrap().as_ref().unwrap().shared.snapshot().frames_captured == 4800));
        thread::sleep(LEVEL_INTERVAL * 2);
        let r = stop_blocking(&state, None).unwrap();
        assert_eq!(r.payload.left.len(), 4800);
        assert!(r.payload.left.iter().enumerate().all(|(i, &v)| v == synth_value(i as u64)));
        assert!(r.payload.right.iter().zip(&r.payload.left).all(|(&r, &l)| r == -l));
        assert!(levels.load(Relaxed) >= 1, "capture-levels still emitted");
        assert!(!state.lease.is_held() && !is_running(&state));
        assert!(stop_blocking(&state, None).is_err());
        let again = start_live_with(&state, Some("pre-gig"), None, 1.0, None, synthetic_source(Synth::lossless(48000, 10)), no_levels()).unwrap();
        assert_eq!(state.lease.status().holder.as_deref(), Some("pre-gig"));
        stop_blocking(&state, None).unwrap();
        assert!(again.lease_id > info.lease_id);
    }

    #[test]
    fn failed_open_releases_the_lease_and_keeps_plain_error_text() {
        let state = LiveCaptureState::default();
        let e = start_live_with(&state, None, None, 5.0, None, failing_source("Audio input not found: X"), no_levels()).unwrap_err();
        assert_eq!(e, CaptureError::Message("Audio input not found: X".into()));
        assert!(!state.lease.is_held());
        let (sink, got) = collecting_sink();
        let e = start_stream_with(&state, None, None, None, None, failing_source("No default audio input is available."), sink).unwrap_err();
        assert_eq!(e, CaptureError::Message("No default audio input is available.".into()));
        assert!(!state.lease.is_held() && got.lock().unwrap().is_empty());
    }

    #[test]
    fn preempt_stops_a_live_session_and_frees_the_input() {
        let state = LiveCaptureState::default();
        assert!(preempt_blocking(&state).unwrap().is_none(), "nothing to stop");
        let info = start_live_with(&state, None, None, 5.0, None, synthetic_source(Synth::lossless(48000, 480)), no_levels()).unwrap();
        let stopped = preempt_blocking(&state).unwrap().unwrap();
        assert_eq!((stopped.lease_id, stopped.kind), (info.lease_id, LeaseKind::Live));
        assert!(state.session.lock().unwrap().is_none() && !state.lease.is_held());
        let (sink, _) = collecting_sink();
        start_stream_with(&state, Some("live-monitor"), None, None, None, synthetic_source(Synth::lossless(48000, 10)), sink).unwrap();
        stop_stream_blocking(&state, None).unwrap();
    }

    #[test]
    fn preempt_releases_an_external_lease() {
        let state = LiveCaptureState::default();
        let g = state.lease.acquire("latency-tuner", None, LeaseKind::External).unwrap();
        assert_eq!(preempt_blocking(&state).unwrap().unwrap(), g);
        assert!(!state.lease.is_held());
        assert!(!release_external(&state, g.lease_id));
    }

    // ---------------------------------------------------- stream primitives

    #[test]
    fn block_size_is_clamped_and_rounded() {
        assert_eq!(clamp_block_ms(None), 1000);
        assert_eq!(clamp_block_ms(Some(0)), MIN_BLOCK_MS);
        assert_eq!(clamp_block_ms(Some(60_000)), MAX_BLOCK_MS);
        assert_eq!(clamp_block_ms(Some(250)), 250);
        assert_eq!(block_frames(48000, 1000), 48000);
        assert_eq!(block_frames(44100, 20), 882);
        assert_eq!(block_frames(44100, 25), 1103, "1102.5 rounds half up");
        assert_eq!(block_frames(1, 20), 1, "never zero");
    }

    #[test]
    fn block_encoding_round_trips_with_flags() {
        let q = BlockQuality { dropped_blocks: 3, stream_errors: 2, overrun_samples: 1 << 40, frames_captured: 123_456_789, discontinuity: true, final_block: true };
        let (l, r) = (vec![0.25f32, -1.0, f32::MIN_POSITIVE], vec![1.0f32, 0.0, -0.5]);
        let b = encode_block(u32::MAX, 96000, &q, &l, &r);
        assert_eq!(b.len(), STREAM_HEADER_BYTES + 3 * 8);
        let d = decode_block(&b).unwrap();
        assert_eq!(d, DecodedBlock { seq: u32::MAX, sample_rate: 96000, quality: q, left: l, right: r, extra: vec![] });
        let empty = encode_block(0, 48000, &BlockQuality::default(), &[], &[]);
        assert_eq!(empty.len(), STREAM_HEADER_BYTES);
        assert!(decode_block(&empty[..40]).is_err());
        assert!(decode_block(b"XXXX0000000000000000000000000000000000000000000000").is_err());
    }

    #[test]
    fn block_queue_sends_within_the_window() {
        let mut q = BlockQueue::new(MAX_LAG_BLOCKS);
        for seq in 0..5 {
            q.push(blk(seq));
            let (b, gap) = q.next().unwrap();
            assert_eq!((b.seq, gap), (seq, false));
        }
        assert_eq!((q.in_flight(), q.queued()), (5, 0));
        assert!(q.next().is_none());
        q.ack(1);
        assert_eq!(q.in_flight(), 3);
        q.ack(0);
        assert_eq!(q.in_flight(), 3, "stale ack is harmless");
        q.ack(4);
        assert_eq!((q.in_flight(), q.dropped()), (0, 0));
    }

    #[test]
    fn block_queue_drops_oldest_queued_beyond_five_blocks_of_lag() {
        let mut q = BlockQueue::new(MAX_LAG_BLOCKS);
        for seq in 0..3 {
            q.push(blk(seq));
            q.next().unwrap();
        }
        // Webview stalls with 3 in flight: 2 more may queue (lag 5), then the oldest queued goes.
        for seq in 3..9 {
            q.push(blk(seq));
        }
        assert_eq!((q.in_flight(), q.queued(), q.dropped()), (3, 2, 4));
        let (b, gap) = q.next().unwrap();
        assert_eq!((b.seq, gap), (7, true), "seq 3..6 dropped; next delivered block is flagged");
        let (b, gap) = q.next().unwrap();
        assert_eq!((b.seq, gap), (8, false));
        assert!(q.next().is_none(), "5 unacknowledged: window closed");
        for seq in 9..20 {
            q.push(blk(seq));
        }
        assert_eq!((q.queued(), q.dropped()), (0, 15), "nothing can queue while 5 are in flight");
        q.ack(2);
        assert_eq!(q.in_flight(), 2);
        for seq in 20..24 {
            q.push(blk(seq));
        }
        assert_eq!(q.dropped(), 16);
        // drain_all ignores the window and carries the pending gap.
        let rest = q.drain_all();
        assert_eq!(rest.iter().map(|(b, g)| (b.seq, *g)).collect::<Vec<_>>(), vec![(21, true), (22, false), (23, false)]);
        assert!(!q.take_gap());
    }

    // ------------------------------------------------------ stream sessions

    #[test]
    fn stream_delivers_contiguous_blocks_and_flushes_a_final_partial_block() {
        let state = LiveCaptureState::default();
        let (sink, got) = collecting_sink();
        // 1000 Hz synthetic, 20 ms blocks = 20 frames; 50 frames = 2 full + 1 partial.
        let info = start_stream_with(&state, Some("wear-map"), Some("Synth".into()), Some(20), None, synthetic_source(Synth::lossless(1000, 50)), sink).unwrap();
        assert_eq!((info.holder.as_str(), info.sample_rate, info.channels, info.block_ms, info.block_frames), ("wear-map", 1000, 2, 20, 20));
        let st = state.lease.status();
        assert_eq!((st.kind, st.lease_id, st.device_name.as_deref()), (Some(LeaseKind::Stream), Some(info.stream_id), Some("Synth")));
        assert!(wait_until(Duration::from_secs(5), || got.lock().unwrap().len() == 2));
        for seq in 0..2 {
            ack_stream(&state, info.stream_id, seq);
        }
        ack_stream(&state, info.stream_id + 99, 50); // other stream: ignored
        assert!(wait_until(Duration::from_secs(5), || state.stream.lock().unwrap().as_ref().unwrap().shared.frames_captured.load(Relaxed) == 50));
        let sum = stop_stream_blocking(&state, None).unwrap();
        let blocks = got.lock().unwrap().clone();
        assert_eq!(blocks.iter().map(|b| (b.seq, b.left.len(), b.quality.final_block)).collect::<Vec<_>>(), vec![(0, 20, false), (1, 20, false), (2, 10, true)]);
        let left: Vec<f32> = blocks.iter().flat_map(|b| b.left.clone()).collect();
        assert!(left.iter().enumerate().all(|(i, &v)| v == synth_value(i as u64)));
        assert!(blocks.iter().all(|b| b.sample_rate == 1000 && b.right.iter().zip(&b.left).all(|(r, l)| *r == -*l)));
        assert_eq!((sum.ended, sum.blocks_sent, sum.last_seq, sum.dropped_blocks, sum.frames_captured), (StreamEnd::Stopped, 3, Some(2), 0, 50));
        assert_eq!(blocks[2].quality.frames_captured, 50);
        assert!(!state.lease.is_held());
        assert!(stop_stream_blocking(&state, None).is_err());
    }

    #[test]
    fn stalled_webview_drops_blocks_and_counts_them() {
        let state = LiveCaptureState::default();
        let (sink, got) = collecting_sink();
        // 20 blocks of 20 frames, never acknowledged.
        let info = start_stream_with(&state, None, None, Some(20), None, synthetic_source(Synth::lossless(1000, 400)), sink).unwrap();
        assert_eq!(info.holder, DEFAULT_STREAM_HOLDER);
        assert!(wait_until(Duration::from_secs(5), || state.stream.lock().unwrap().as_ref().unwrap().shared.frames_captured.load(Relaxed) == 400));
        thread::sleep(PUMP_IDLE * 4);
        let sum = stop_stream_blocking(&state, None).unwrap();
        let blocks = got.lock().unwrap().clone();
        assert_eq!(sum.dropped_blocks, 15);
        assert_eq!(blocks.len(), 6, "5 blocks fit the lag window, then an empty final block");
        assert!(blocks[..5].iter().all(|b| b.left.len() == 20 && !b.quality.final_block));
        // Whichever blocks survived, each carries its own samples.
        for b in &blocks[..5] {
            assert!(b.left.iter().enumerate().all(|(i, &v)| v == synth_value(b.seq as u64 * 20 + i as u64)), "seq {}", b.seq);
        }
        assert!(blocks.windows(2).all(|w| w[1].seq > w[0].seq));
        let last = blocks.last().unwrap();
        assert!(last.quality.final_block && last.left.is_empty());
        assert_eq!((last.seq, last.quality.dropped_blocks), (20, 15));
        let gaps: u32 = blocks.windows(2).map(|w| w[1].seq - w[0].seq - 1).sum::<u32>() + blocks[0].seq;
        assert_eq!(gaps, 15, "seq gaps equal the dropped count");
        assert!(blocks.iter().any(|b| b.quality.discontinuity));
    }

    #[test]
    fn device_loss_ends_the_stream_and_auto_releases_the_lease() {
        let state = LiveCaptureState::default();
        let (sink, got) = collecting_sink();
        let synth = Synth { fatal_after: Some(30), ..Synth::lossless(1000, 1000) };
        let info = start_stream_with(&state, Some("live-monitor"), None, Some(20), None, synthetic_source(synth), sink).unwrap();
        assert!(wait_until(Duration::from_secs(5), || !state.lease.is_held()), "lease released without a stop call");
        assert!(got.lock().unwrap().last().unwrap().quality.final_block);
        assert!(got.lock().unwrap().last().unwrap().quality.stream_errors >= 1);
        // The next capture can start right away and reaps the ended session.
        let (sink2, _) = collecting_sink();
        let next = start_stream_with(&state, Some("wear-map"), None, Some(20), None, synthetic_source(Synth::lossless(1000, 10)), sink2).unwrap();
        assert!(next.stream_id > info.stream_id);
        let sum = stop_stream_blocking(&state, None).unwrap();
        assert_eq!(sum.stream_id, next.stream_id);
    }

    #[test]
    fn device_loss_summary_is_returned_by_stop() {
        let state = LiveCaptureState::default();
        let (sink, _) = collecting_sink();
        let synth = Synth { fatal_after: Some(25), ..Synth::lossless(1000, 1000) };
        start_stream_with(&state, None, None, Some(20), None, synthetic_source(synth), sink).unwrap();
        assert!(wait_until(Duration::from_secs(5), || !state.lease.is_held()));
        let sum = stop_stream_blocking(&state, None).unwrap();
        assert_eq!(sum.ended, StreamEnd::DeviceLost);
        assert!(sum.stream_errors >= 1 && sum.stream_error_messages[0].contains("no longer available"));
    }

    #[test]
    fn closed_webview_ends_the_stream_and_releases_the_lease() {
        let state = LiveCaptureState::default();
        let sent = Arc::new(AtomicU64::new(0));
        let s = sent.clone();
        let sink = FnSink(move |_b: Vec<u8>| if s.fetch_add(1, Relaxed) < 2 { Ok(()) } else { Err("webview closed".to_string()) });
        start_stream_with(&state, None, None, Some(20), None, synthetic_source(Synth::lossless(1000, 1000)), sink).unwrap();
        for seq in 0..10 {
            ack_stream(&state, state.lease.current().map_or(0, |g| g.lease_id), seq);
        }
        assert!(wait_until(Duration::from_secs(5), || !state.lease.is_held()));
        let sum = stop_stream_blocking(&state, None).unwrap();
        assert_eq!((sum.ended, sum.blocks_sent), (StreamEnd::SinkClosed, 2));
    }

    #[test]
    fn preempt_stops_a_stream_with_a_final_block() {
        let state = LiveCaptureState::default();
        let (sink, got) = collecting_sink();
        let info = start_stream_with(&state, Some("live-monitor"), None, Some(20), None, synthetic_source(Synth::lossless(1000, 30)), sink).unwrap();
        let stopped = preempt_blocking(&state).unwrap().unwrap();
        assert_eq!((stopped.holder.as_str(), stopped.kind, stopped.lease_id), ("live-monitor", LeaseKind::Stream, info.stream_id));
        assert!(got.lock().unwrap().last().unwrap().quality.final_block);
        assert!(!state.lease.is_held() && state.stream.lock().unwrap().is_none());
        start_live_with(&state, None, None, 1.0, None, synthetic_source(Synth::lossless(48000, 10)), no_levels()).unwrap();
        stop_blocking(&state, None).unwrap();
    }

    #[test]
    fn stream_goes_through_a_tauri_channel_as_raw_bytes() {
        let state = LiveCaptureState::default();
        let got = Arc::new(Mutex::new(Vec::new()));
        let g = got.clone();
        let channel: Channel<InvokeResponseBody> = Channel::new(move |body| {
            match body {
                InvokeResponseBody::Raw(bytes) => g.lock().unwrap().push(decode_block(&bytes).unwrap()),
                InvokeResponseBody::Json(j) => panic!("expected raw bytes, got JSON {j}"),
            }
            Ok(())
        });
        start_stream_with(&state, None, None, Some(20), None, synthetic_source(Synth::lossless(1000, 40)), channel).unwrap();
        assert!(wait_until(Duration::from_secs(5), || got.lock().unwrap().len() == 2));
        stop_stream_blocking(&state, None).unwrap();
        assert_eq!(got.lock().unwrap().iter().map(|b| b.seq).collect::<Vec<_>>(), vec![0, 1, 2]);
    }

    // ------------------------------------------------------ input pairs

    use crate::audio::input_pairs;

    fn labels(pairs: &[ChannelPair]) -> Vec<&str> {
        pairs.iter().map(|p| p.label.as_str()).collect()
    }

    fn synth_ch(channels: u16, sample_rate: u32, frames: u64) -> Synth {
        Synth { channels, ..Synth::lossless(sample_rate, frames) }
    }

    #[test]
    fn accumulator_splits_eight_interleaved_channels_into_selected_pairs() {
        let (mut p, mut c) = RingBuffer::<f32>::new(64);
        // 3 frames x 8 channels: value = channel * 10 + frame.
        let data: Vec<f32> = (0..3).flat_map(|f| (0..8).map(move |ch| (ch * 10 + f) as f32)).collect();
        push_frames(&mut p, &data, 8, |v| v);
        let pairs = resolve_pairs(Some(&[5, 1]), 8, "Audio 8").unwrap();
        let mut acc = Accumulator::with_pairs(2, &pairs);
        assert_eq!(acc.drain(&mut c, 8), 3);
        assert!(acc.truncated, "bound applies to all pairs together");
        assert_eq!((&acc.tracks[0].left, &acc.tracks[0].right), (&vec![40.0, 41.0], &vec![50.0, 51.0]));
        assert_eq!((&acc.tracks[1].left, &acc.tracks[1].right), (&vec![0.0, 1.0], &vec![10.0, 11.0]));
        let lv = acc.take_levels();
        assert_eq!(lv.iter().map(|l| (l.label.as_str(), l.first)).collect::<Vec<_>>(), [("5-6", 5), ("1-2", 1)]);
        assert!(lv[0].levels.clip_l && lv[0].levels.peak_l == 1.0, "levels see every frame, even past the bound");
        let shared = Shared::default();
        acc.publish(&shared);
        let q = shared.snapshot();
        assert_eq!(q.frames_captured, 2);
        assert_eq!((q.clipped_samples_l, q.pairs.len(), q.pairs[1].label.as_str(), q.pairs[1].clipped_samples_r), (2, 2, "1-2", 2));
    }

    #[test]
    fn live_capture_records_several_pairs_from_an_eight_channel_input() {
        let state = LiveCaptureState::default();
        let events = Arc::new(Mutex::new(Vec::new()));
        let ev = events.clone();
        let emit: LevelSink = Box::new(move |e: &LevelEvent| ev.lock().unwrap().push(serde_json::to_value(e).unwrap()));
        let info = start_live_with(&state, Some("pre-gig"), None, 5.0, Some(vec![3, 7]), synthetic_source(synth_ch(8, 48000, 960)), emit).unwrap();
        assert_eq!((info.channels, labels(&info.pairs)), (8, vec!["3-4", "7-8"]));
        assert!(wait_until(Duration::from_secs(5), || state.session.lock().unwrap().as_ref().unwrap().shared.snapshot().frames_captured == 960));
        thread::sleep(LEVEL_INTERVAL * 2);
        let r = stop_blocking(&state, None).unwrap();
        let p = &r.payload;
        assert_eq!((p.left.len(), labels(&p.pairs)), (960, vec!["3-4", "7-8"]));
        assert!(p.left.iter().enumerate().all(|(i, &v)| v == synth_value(i as u64) + 20.0), "left = channel 3");
        assert!(p.right.iter().enumerate().all(|(i, &v)| v == synth_value(i as u64) + 30.0), "right = channel 4");
        assert_eq!(p.extra_pairs.len(), 1);
        let x = &p.extra_pairs[0];
        assert_eq!((x.pair.label.as_str(), x.left.len()), ("7-8", 960));
        assert!(x.left.iter().zip(&x.right).enumerate().all(|(i, (&l, &rr))| l == synth_value(i as u64) + 60.0 && rr == synth_value(i as u64) + 70.0));
        assert_eq!(r.quality.pairs.iter().map(|c| c.label.as_str()).collect::<Vec<_>>(), ["3-4", "7-8"]);
        // Level events: top level = first pair (old shape), plus every pair.
        let events = events.lock().unwrap();
        let e = events.iter().find(|e| e["pairs"][0]["peakL"].as_f64().unwrap_or(0.0) > 0.0).expect("a level event with signal");
        assert_eq!(e["pairs"].as_array().unwrap().len(), 2);
        assert_eq!((e["pairs"][0]["label"].as_str(), e["pairs"][1]["label"].as_str(), e["pairs"][1]["first"].as_u64()), (Some("3-4"), Some("7-8"), Some(7)));
        assert_eq!(e["peakL"], e["pairs"][0]["peakL"]);
        assert!(e["pairs"][1]["peakL"].as_f64().unwrap() == 1.0, "channel 7 is 60 + ramp: clamped peak");
        assert!(e.get("elapsedSec").is_some() && e.get("overrunSamples").is_some() && e.get("clipR").is_some());
    }

    #[test]
    fn default_selection_on_a_multichannel_input_keeps_channels_one_and_two() {
        let state = LiveCaptureState::default();
        let info = start_live_with(&state, None, None, 5.0, None, synthetic_source(synth_ch(8, 48000, 480)), no_levels()).unwrap();
        assert_eq!(labels(&info.pairs), ["1-2"]);
        assert!(wait_until(Duration::from_secs(5), || state.session.lock().unwrap().as_ref().unwrap().shared.snapshot().frames_captured == 480));
        let r = stop_blocking(&state, None).unwrap();
        assert!(r.payload.left.iter().enumerate().all(|(i, &v)| v == synth_value(i as u64)));
        assert!(r.payload.right.iter().zip(&r.payload.left).all(|(&r, &l)| r == -l));
        assert!(r.payload.extra_pairs.is_empty());
        let v = serde_json::to_value(&r.payload).unwrap();
        assert!(v.get("extraPairs").is_none());
    }

    #[test]
    fn out_of_range_pairs_fail_clearly_and_release_the_lease() {
        let state = LiveCaptureState::default();
        let e = start_live_with(&state, None, None, 5.0, Some(vec![9]), synthetic_source(synth_ch(8, 48000, 10)), no_levels()).unwrap_err();
        assert_eq!(e, CaptureError::Message("Input pair 9-10 is not available on Synthetic 48k: it has 8 input channels (pairs 1-2, 3-4, 5-6, 7-8).".into()));
        assert!(!state.lease.is_held() && state.session.lock().unwrap().is_none());
        let (sink, got) = collecting_sink();
        let e = start_stream_with(&state, None, None, Some(20), Some(vec![1, 3]), synthetic_source(synth_ch(2, 1000, 10)), sink).unwrap_err();
        match e {
            CaptureError::Message(m) => assert!(m.contains("3-4 is not available") && m.contains("2 input channels (pairs 1-2)"), "{m}"),
            other => panic!("{other:?}"),
        }
        assert!(!state.lease.is_held() && got.lock().unwrap().is_empty());
        // The input is free again straight away.
        let ok = start_live_with(&state, None, None, 1.0, Some(vec![7]), synthetic_source(synth_ch(8, 48000, 10)), no_levels()).unwrap();
        assert_eq!(labels(&ok.pairs), ["7-8"]);
        stop_blocking(&state, None).unwrap();
    }

    #[test]
    fn stream_carries_every_selected_pair_per_block_including_an_odd_mono_pair() {
        let state = LiveCaptureState::default();
        let (sink, got) = collecting_sink();
        // 5-channel input: pair "5" is mono. 20 ms blocks at 1 kHz = 20 frames; 50 frames.
        let info = start_stream_with(&state, Some("pre-gig"), None, Some(20), Some(vec![5, 1, 3]), synthetic_source(synth_ch(5, 1000, 50)), sink).unwrap();
        assert_eq!((info.channels, labels(&info.pairs)), (5, vec!["5", "1-2", "3-4"]));
        assert!(info.pairs[0].mono);
        assert!(wait_until(Duration::from_secs(5), || state.stream.lock().unwrap().as_ref().unwrap().shared.frames_captured.load(Relaxed) == 50));
        let sum = stop_stream_blocking(&state, None).unwrap();
        let blocks = got.lock().unwrap().clone();
        assert_eq!(blocks.iter().map(|b| (b.seq, b.left.len(), b.extra.len())).collect::<Vec<_>>(), vec![(0, 20, 2), (1, 20, 2), (2, 10, 2)]);
        assert_eq!(sum.frames_captured, 50);
        let mut n = 0u64;
        for b in &blocks {
            for i in 0..b.left.len() {
                let v = synth_value(n + i as u64);
                assert_eq!((b.left[i], b.right[i]), (v + 40.0, v + 40.0), "mono pair 5 duplicated");
                assert_eq!((b.extra[0].0[i], b.extra[0].1[i]), (v, -v), "pair 1-2");
                assert_eq!((b.extra[1].0[i], b.extra[1].1[i]), (v + 20.0, v + 30.0), "pair 3-4");
            }
            n += b.left.len() as u64;
        }
        assert!(blocks.last().unwrap().quality.final_block);
    }

    #[test]
    fn default_stream_blocks_stay_version_one() {
        let state = LiveCaptureState::default();
        let got = Arc::new(Mutex::new(Vec::new()));
        let g = got.clone();
        let sink = FnSink(move |b: Vec<u8>| {
            g.lock().unwrap().push(b);
            Ok(())
        });
        let info = start_stream_with(&state, None, None, Some(20), None, synthetic_source(synth_ch(8, 1000, 20)), sink).unwrap();
        assert_eq!(labels(&info.pairs), ["1-2"]);
        assert!(wait_until(Duration::from_secs(5), || !got.lock().unwrap().is_empty()));
        stop_stream_blocking(&state, None).unwrap();
        for b in got.lock().unwrap().iter() {
            assert_eq!(u16::from_le_bytes([b[4], b[5]]), STREAM_VERSION);
            assert_eq!(&b[28..32], &[0, 0, 0, 0]);
        }
    }

    #[test]
    fn multi_pair_block_encoding_round_trips_and_single_pair_matches_version_one() {
        let q = BlockQuality { dropped_blocks: 1, stream_errors: 0, overrun_samples: 8, frames_captured: 3, discontinuity: false, final_block: true };
        let one = vec![(vec![0.5f32, -0.5], vec![0.25f32, 1.0])];
        assert_eq!(encode_block_pairs(7, 48000, &q, &one), encode_block(7, 48000, &q, &one[0].0, &one[0].1));
        let three = vec![(vec![0.1f32, 0.2, 0.3], vec![-0.1f32, -0.2, -0.3]), (vec![1.0f32, 2.0, 3.0], vec![4.0f32, 5.0, 6.0]), (vec![7.0f32, 8.0, 9.0, 99.0], vec![10.0f32, 11.0, 12.0])];
        let b = encode_block_pairs(9, 44100, &q, &three);
        assert_eq!(b.len(), STREAM_HEADER_BYTES + 3 * 8 * 3, "frames = shortest buffer");
        assert_eq!((u16::from_le_bytes([b[4], b[5]]), u32::from_le_bytes(b[28..32].try_into().unwrap())), (STREAM_VERSION_PAIRS, 3));
        let d = decode_block(&b).unwrap();
        assert_eq!((d.seq, d.sample_rate, d.quality), (9, 44100, q));
        assert_eq!((d.left, d.right), (three[0].0.clone(), three[0].1.clone()));
        assert_eq!(d.extra, vec![three[1].clone(), (vec![7.0, 8.0, 9.0], vec![10.0, 11.0, 12.0])]);
        assert!(decode_block(&b[..b.len() - 4]).is_err(), "length checked against the pair count");
    }

    #[test]
    fn bounded_capture_holds_the_lease_and_is_preemptible() {
        let state = LiveCaptureState::default();
        // Runs to completion and releases.
        let v = with_bounded_lease(&state, None, Some("Audio 8".into()), |_| Ok(42)).unwrap();
        assert_eq!(v, 42);
        assert!(!state.lease.is_held() && state.bounded.lock().unwrap().is_none());
        // Errors stay plain strings and still release.
        let e = with_bounded_lease(&state, Some("latency-tuner"), None, |_| Err::<(), _>("Audio input not found: X".into())).unwrap_err();
        assert_eq!(e, CaptureError::Message("Audio input not found: X".into()));
        assert!(!state.lease.is_held());
        // While running: others get CAPTURE_BUSY; it gets CAPTURE_BUSY from others.
        let (started_tx, started_rx) = mpsc::channel();
        let runner = {
            let state = state.clone();
            thread::spawn(move || {
                with_bounded_lease(&state, None, None, |cancel| {
                    started_tx.send(()).unwrap();
                    let wait = mpsc::channel::<()>();
                    crate::audio::wait_for_capture(&wait.1, Duration::from_secs(10), cancel, &AtomicBool::new(false))
                })
            })
        };
        started_rx.recv().unwrap();
        let st = state.lease.status();
        assert_eq!((st.holder.as_deref(), st.kind), (Some(DEFAULT_BOUNDED_HOLDER), Some(LeaseKind::Bounded)));
        let b = busy(start_live_with(&state, None, None, 1.0, None, synthetic_source(Synth::lossless(48000, 10)), no_levels()).unwrap_err());
        assert_eq!((b.holder.as_str(), b.kind), (DEFAULT_BOUNDED_HOLDER, LeaseKind::Bounded));
        assert_eq!(serde_json::to_value(LeaseKind::Bounded).unwrap(), "bounded");
        assert!(!release_external(&state, st.lease_id.unwrap()), "only the capture itself releases a bounded lease");
        // Stop and continue: cancels the capture, frees the input.
        let started = Instant::now();
        let stopped = preempt_blocking(&state).unwrap().unwrap();
        assert_eq!(stopped.kind, LeaseKind::Bounded);
        assert!(started.elapsed() < Duration::from_secs(2));
        assert_eq!(runner.join().unwrap().unwrap_err(), CaptureError::Message(crate::audio::CAPTURE_CANCELLED.into()));
        assert!(!state.lease.is_held());
        let busy_live = start_live_with(&state, None, None, 1.0, None, synthetic_source(Synth::lossless(48000, 10)), no_levels()).unwrap();
        let b = busy(with_bounded_lease(&state, None, None, |_| Ok(())).unwrap_err());
        assert_eq!(b.lease_id, busy_live.lease_id);
        stop_blocking(&state, None).unwrap();
    }

    // ------------------------------------------------- audit regressions

    /// BUG-02: a stop names the lease it owns. After a preempt, the old owner's
    /// stop gets CAPTURE_CANCELLED and never stops or returns the new holder's capture.
    #[test]
    fn live_stop_only_stops_the_named_lease() {
        let state = LiveCaptureState::default();
        let quick = start_live_with(&state, None, None, 5.0, None, synthetic_source(Synth::lossless(48000, 480)), no_levels()).unwrap();
        assert_eq!(stop_blocking(&state, Some(quick.lease_id + 1000)).unwrap_err(), crate::audio::CAPTURE_CANCELLED);
        assert!(state.session.lock().unwrap().is_some(), "a wrong id stops nothing");
        preempt_blocking(&state).unwrap().unwrap();
        let pregig = start_live_with(&state, Some("pre-gig"), None, 5.0, None, synthetic_source(Synth::lossless(48000, 480)), no_levels()).unwrap();
        // Quick Check's timer fires and stops "its" capture.
        assert_eq!(stop_blocking(&state, Some(quick.lease_id)).unwrap_err(), crate::audio::CAPTURE_CANCELLED);
        assert_eq!(state.lease.status().lease_id, Some(pregig.lease_id), "pre-gig keeps the input");
        assert!(stop_blocking(&state, Some(pregig.lease_id)).is_ok(), "pre-gig gets its own audio");
        assert!(!state.lease.is_held());
        assert_eq!(stop_blocking(&state, None).unwrap_err(), "No live capture is running.");
    }

    #[test]
    fn stream_stop_and_reap_only_touch_the_named_stream() {
        let state = LiveCaptureState::default();
        let mut synth = Synth::lossless(1000, 1000);
        synth.fatal_after = Some(20);
        let (sink, _) = collecting_sink();
        let lost = start_stream_with(&state, None, None, Some(20), None, synthetic_source(synth), sink).unwrap();
        assert!(wait_until(Duration::from_secs(5), || !state.lease.is_held()), "device loss releases the lease");
        // A newer stream starts (reaping the lost one) before the old owner reaps it.
        let (sink, _) = collecting_sink();
        let next = start_stream_with(&state, Some("wear-map"), None, Some(20), None, synthetic_source(Synth::lossless(1000, 1000)), sink).unwrap();
        assert_eq!(stop_stream_blocking(&state, Some(lost.stream_id)).unwrap_err(), crate::audio::CAPTURE_CANCELLED);
        assert_eq!(state.lease.status().lease_id, Some(next.stream_id), "the newer stream keeps running");
        assert_eq!(stop_stream_blocking(&state, Some(next.stream_id)).unwrap().stream_id, next.stream_id);
        assert!(!state.lease.is_held());
    }

    /// An opener stuck inside the driver until `release` is sent.
    fn hanging_source(release: mpsc::Receiver<()>) -> Opener {
        Box::new(move |_shared, _stop, ready| {
            let _ = release.recv();
            let (_p, consumer) = RingBuffer::<f32>::new(16);
            let info = SourceInfo { device_name: "Late".into(), sample_rate: 48000, channels: 2 };
            let _ = ready.send(Ok((info, consumer)));
        })
    }

    /// BUG-05: the open timeout really bounds the start, and no capture lock is
    /// held while the driver hangs.
    #[test]
    fn a_hung_open_times_out_without_holding_the_capture_locks() {
        let mut state = LiveCaptureState::default();
        state.open_timeout = Duration::from_millis(300);
        let (release, rx) = mpsc::channel();
        let starter = {
            let state = state.clone();
            thread::spawn(move || {
                let t = Instant::now();
                (start_live_with(&state, None, None, 5.0, None, hanging_source(rx), no_levels()), t.elapsed())
            })
        };
        assert!(wait_until(Duration::from_secs(2), || state.lease.is_held()));
        // Status polls, restore's check and stop never wait on the driver.
        assert!(state.session.try_lock().is_ok() && state.stream.try_lock().is_ok());
        assert!(is_running(&state));
        let (result, took) = starter.join().unwrap();
        assert_eq!(result.unwrap_err(), CaptureError::Message("Timed out opening the audio input.".into()));
        assert!(took < Duration::from_secs(2), "returned after the timeout, not after the driver: {took:?}");
        assert!(!state.lease.is_held(), "the lease is released on timeout");
        release.send(()).unwrap(); // the detached opener finishes and exits by itself

        let (release, rx) = mpsc::channel::<()>();
        let (sink, _) = collecting_sink();
        let t = Instant::now();
        let e = start_stream_with(&state, None, None, None, None, hanging_source(rx), sink).unwrap_err();
        assert_eq!(e, CaptureError::Message("Timed out opening the audio input.".into()));
        assert!(t.elapsed() < Duration::from_secs(2));
        drop(release);
    }

    /// BUG-09: a bounded capture that has not noticed the cancel keeps its
    /// lease; the preempter gets CAPTURE_STOPPING instead of a free input.
    #[test]
    fn preempt_never_frees_the_input_while_a_bounded_capture_still_runs() {
        let state = LiveCaptureState::default();
        let (started_tx, started_rx) = mpsc::channel();
        let (finish_tx, finish_rx) = mpsc::channel::<()>();
        let runner = {
            let state = state.clone();
            thread::spawn(move || {
                with_bounded_lease(&state, Some("hum-hunter"), None, |_cancel| {
                    started_tx.send(()).unwrap();
                    let _ = finish_rx.recv(); // stuck in device setup, not polling cancel
                    Ok(())
                })
            })
        };
        started_rx.recv().unwrap();
        let held = state.lease.current().unwrap();
        let e = preempt_with_wait(&state, Duration::from_millis(100)).unwrap_err();
        assert!(e.starts_with(CAPTURE_STOPPING) && e.contains("hum-hunter"), "{e}");
        assert_eq!(state.lease.current(), Some(held.clone()), "the running capture keeps the input");
        assert!(busy(start_live_with(&state, None, None, 1.0, None, synthetic_source(Synth::lossless(48000, 10)), no_levels()).unwrap_err()).lease_id == held.lease_id);
        finish_tx.send(()).unwrap();
        runner.join().unwrap().unwrap();
        assert!(!state.lease.is_held(), "released when the capture actually ends");
        assert!(preempt_with_wait(&state, Duration::from_millis(100)).unwrap().is_none());
    }

    #[test]
    fn preempt_waits_for_a_live_session_that_is_still_opening() {
        let state = LiveCaptureState::default();
        let (release, rx) = mpsc::channel();
        let starter = {
            let state = state.clone();
            thread::spawn(move || start_live_with(&state, None, None, 5.0, None, hanging_source(rx), no_levels()))
        };
        assert!(wait_until(Duration::from_secs(2), || state.lease.is_held()));
        let e = preempt_with_wait(&state, Duration::from_millis(50)).unwrap_err();
        assert!(e.starts_with(CAPTURE_STOPPING), "{e}");
        assert!(state.lease.is_held(), "not released behind the opening session's back");
        release.send(()).unwrap();
        let info = starter.join().unwrap().unwrap();
        let stopped = preempt_with_wait(&state, Duration::from_secs(2)).unwrap().unwrap();
        assert_eq!(stopped.lease_id, info.lease_id);
        assert!(!state.lease.is_held() && state.session.lock().unwrap().is_none());
    }

    /// BUG-15: nothing is reserved up front for a long maximum, growth is in
    /// steps, an allocation failure truncates instead of aborting, and the
    /// requested maximum is bounded by a memory budget.
    #[test]
    fn live_accumulator_grows_on_demand_and_survives_allocation_failure() {
        let pairs = crate::audio::input_pairs(8);
        let acc = Accumulator::with_pairs(usize::MAX / 2, &pairs);
        assert!(acc.tracks.iter().all(|t| t.left.capacity() == 0 && t.right.capacity() == 0), "no up-front reservation");

        let (mut p, mut c) = RingBuffer::<f32>::new(64);
        push_frames(&mut p, &[0.5f32; 20], 2, |v| v);
        let mut acc = Accumulator::new(1_000_000).with_grow_step(4);
        assert_eq!(acc.drain(&mut c, 2), 10);
        assert_eq!(acc.tracks[0].left.len(), 10);
        assert!(acc.tracks[0].left.capacity() < 1000, "grew in steps, not to max_frames");
        assert!(!acc.truncated && !acc.out_of_memory);

        // A step the allocator refuses (capacity overflow here) stops recording.
        push_frames(&mut p, &[0.25f32; 8], 2, |v| v);
        let mut acc = Accumulator::new(usize::MAX).with_grow_step(usize::MAX / 2);
        assert_eq!(acc.drain(&mut c, 2), 4, "the ring is still drained");
        assert!(acc.out_of_memory && acc.truncated);
        assert!(acc.tracks[0].left.is_empty());
        let shared = Shared::default();
        acc.publish(&shared);
        assert!(shared.snapshot().truncated);

        // One pair at 48 kHz for the full 1800 s fits (691 MB); 32 pairs at 192 kHz do not.
        assert_eq!(budget_max_seconds(MAX_SECONDS, 48_000, 1), MAX_SECONDS);
        let s = budget_max_seconds(MAX_SECONDS, 192_000, 32);
        assert!(s < 30.0 && s >= MIN_SECONDS, "{s}");
        assert!((192_000.0 * 32.0 * 8.0 * s as f64) <= LIVE_BUFFER_BUDGET_BYTES as f64);
    }

    #[test]
    fn live_info_reports_the_budgeted_maximum() {
        let state = LiveCaptureState::default();
        let info = start_live_with(&state, None, None, MAX_SECONDS, Some(vec![1, 3, 5, 7]), synthetic_source(synth_ch(8, 192_000, 10)), no_levels()).unwrap();
        assert_eq!(info.max_seconds, budget_max_seconds(MAX_SECONDS, 192_000, 4));
        assert!(info.max_seconds < MAX_SECONDS);
        stop_blocking(&state, Some(info.lease_id)).unwrap();
    }

    // -------------------------------------------------------- contracts

    fn contract() -> serde_json::Value {
        let raw = std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/contracts/capture.json")).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    fn keys(v: &serde_json::Value) -> Vec<String> {
        let mut k: Vec<String> = v.as_object().unwrap().keys().cloned().collect();
        k.sort_unstable();
        k
    }

    #[test]
    fn contract_capture_shapes_match_rust_types() {
        let c = contract();
        let cmd = &c["commands"];
        let grant = LeaseGrant { lease_id: 3, holder: "wear-map".into(), device_name: Some("Traktor Audio 8 DJ (In 1/2)".into()), since: 1791633600000, kind: LeaseKind::External };
        assert_eq!(serde_json::to_value(&grant).unwrap(), cmd["capture_lease_acquire"]["response"]);
        assert_eq!(keys(&cmd["capture_lease_acquire"]["request"]), ["deviceName", "holder"]);
        assert_eq!(keys(&cmd["capture_lease_release"]["request"]), ["leaseId"]);
        let held = LeaseStatus { held: true, lease_id: Some(4), holder: Some("live-monitor".into()), device_name: None, since: Some(1791633600000), kind: Some(LeaseKind::Stream) };
        assert_eq!(serde_json::to_value(&held).unwrap(), cmd["capture_lease_status"]["response"]);
        assert_eq!(serde_json::to_value(CaptureLease::default().status()).unwrap(), cmd["capture_lease_status"]["responseIdle"]);
        let stopped = LeaseGrant { lease_id: 4, holder: "live-monitor".into(), device_name: None, since: 1791633600000, kind: LeaseKind::Stream };
        assert_eq!(serde_json::to_value(PreemptResult { stopped: Some(stopped.clone()) }).unwrap(), cmd["capture_preempt"]["response"]);
        let live = LiveCaptureInfo { device_name: "Focusrite USB (In 1/2)".into(), sample_rate: 48000, channels: 2, max_seconds: 60.0, lease_id: 5, pairs: input_pairs(2) };
        assert_eq!(serde_json::to_value(&live).unwrap(), cmd["start_live_capture"]["response"]);
        assert_eq!(keys(&cmd["start_stream_capture"]["request"]), ["blockMs", "channel", "deviceName", "holder", "sampleRate"]);
        let si = StreamInfo { stream_id: 4, holder: "live-monitor".into(), device_name: "Focusrite USB (In 1/2)".into(), sample_rate: 48000, channels: 2, block_ms: 1000, block_frames: 48000, pairs: input_pairs(2) };
        assert_eq!(serde_json::to_value(&si).unwrap(), cmd["start_stream_capture"]["response"]);
        assert_eq!(keys(&cmd["stream_capture_ack"]["request"]), ["seq", "streamId"]);
        let sum = StreamSummary { stream_id: 4, ended: StreamEnd::Stopped, blocks_sent: 9, last_seq: Some(8), dropped_blocks: 0, frames_captured: 410000, overrun_samples: 0, stream_errors: 0, stream_error_messages: vec![] };
        assert_eq!(serde_json::to_value(&sum).unwrap(), cmd["stop_stream_capture"]["response"]);
        assert_eq!(serde_json::to_value(CaptureError::Busy(CaptureBusy::from_grant(&stopped))).unwrap(), c["errors"]["busy"]);
        assert_eq!(serde_json::to_value(CaptureError::from(c["errors"]["plain"].as_str().unwrap())).unwrap(), c["errors"]["plain"]);
    }

    #[test]
    fn contract_block_bytes_match_the_encoder() {
        let c = contract();
        let d = &c["block"]["decoded"];
        let f = |v: &serde_json::Value| v.as_array().unwrap().iter().map(|x| x.as_f64().unwrap() as f32).collect::<Vec<f32>>();
        let q: BlockQuality = BlockQuality {
            dropped_blocks: d["quality"]["droppedBlocks"].as_u64().unwrap() as u32,
            stream_errors: d["quality"]["streamErrors"].as_u64().unwrap() as u32,
            overrun_samples: d["quality"]["overrunSamples"].as_u64().unwrap(),
            frames_captured: d["quality"]["framesCaptured"].as_u64().unwrap(),
            discontinuity: d["quality"]["discontinuity"].as_bool().unwrap(),
            final_block: d["quality"]["final"].as_bool().unwrap(),
        };
        assert_eq!(serde_json::to_value(&q).unwrap(), d["quality"]);
        let bytes = encode_block(d["seq"].as_u64().unwrap() as u32, d["sampleRate"].as_u64().unwrap() as u32, &q, &f(&d["left"]), &f(&d["right"]));
        let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, c["block"]["hex"].as_str().unwrap());
    }

    #[test]
    fn contract_input_pairs_and_multi_pair_block_match_rust() {
        let c = contract();
        let ip = &c["inputPairs"];
        let dev = &ip["listNativeAudioInputs"][0];
        let info = crate::audio::AudioInputInfo { name: "Traktor Audio 8 DJ".into(), is_default: false, max_channels: 8, default_channels: 8, pairs: input_pairs(8) };
        assert_eq!(&serde_json::to_value(&info).unwrap(), dev);
        let odd: Vec<String> = input_pairs(ip["oddChannels"]["channels"].as_u64().unwrap() as u16).into_iter().map(|p| p.label).collect();
        assert_eq!(serde_json::to_value(odd).unwrap(), ip["oddChannels"]["labels"]);
        let sel: Vec<PairSel> = serde_json::from_value(ip["outOfRange"]["pairs"].clone()).unwrap();
        let firsts = parse_pair_selection(Some(&sel)).unwrap();
        let e = resolve_pairs(firsts.as_deref(), ip["outOfRange"]["channels"].as_u64().unwrap() as u16, ip["outOfRange"]["deviceName"].as_str().unwrap()).unwrap_err();
        assert_eq!(e, ip["outOfRange"]["error"].as_str().unwrap());
        let mut stream_keys = keys(&ip["startStreamRequest"]);
        stream_keys.retain(|k| k != "pairs");
        assert_eq!(stream_keys, keys(&c["commands"]["start_stream_capture"]["request"]), "pairs is the only added argument");
        let req: Vec<PairSel> = serde_json::from_value(ip["captureNativeRequest"]["pairs"].clone()).unwrap();
        assert_eq!(parse_pair_selection(Some(&req)).unwrap(), Some(vec![3]));

        let d = &c["blockPairs"]["decoded"];
        let f = |v: &serde_json::Value| v.as_array().unwrap().iter().map(|x| x.as_f64().unwrap() as f32).collect::<Vec<f32>>();
        let pairs: Vec<Stereo> = d["pairs"].as_array().unwrap().iter().map(|p| (f(&p["left"]), f(&p["right"]))).collect();
        let q = BlockQuality { frames_captured: d["quality"]["framesCaptured"].as_u64().unwrap(), ..BlockQuality::default() };
        assert_eq!(serde_json::to_value(&q).unwrap(), d["quality"]);
        let bytes = encode_block_pairs(d["seq"].as_u64().unwrap() as u32, d["sampleRate"].as_u64().unwrap() as u32, &q, &pairs);
        let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, c["blockPairs"]["hex"].as_str().unwrap());
    }

    // ------------------------------------------- Channel throughput spike

    /// Report of a real-time 48 kHz stereo stream through a tauri `Channel`
    /// into a simulated webview that decodes, verifies and acknowledges.
    struct SpikeReport {
        blocks: u64,
        frames: u64,
        mismatched_samples: u64,
        seq_gaps: u64,
        discontinuities: u64,
        final_seen: bool,
        summary: StreamSummary,
    }

    fn throughput_spike(seconds: u64) -> SpikeReport {
        let state = LiveCaptureState::default();
        let (tx, rx) = mpsc::channel::<Vec<u8>>();
        let tx = Mutex::new(tx);
        let channel: Channel<InvokeResponseBody> = Channel::new(move |body| {
            if let InvokeResponseBody::Raw(bytes) = body {
                let _ = tx.lock().unwrap().send(bytes);
            }
            Ok(())
        });
        let (id_tx, id_rx) = mpsc::channel::<u64>();
        let webview = {
            let state = state.clone();
            thread::spawn(move || {
                let id = id_rx.recv().unwrap();
                let mut r = (0u64, 0u64, 0u64, 0u64, 0u64, false);
                let mut next_seq = 0u32;
                for bytes in rx {
                    let b = decode_block(&bytes).unwrap();
                    if b.seq != next_seq {
                        r.3 += 1;
                    }
                    next_seq = b.seq.wrapping_add(1);
                    r.4 += b.quality.discontinuity as u64;
                    for (i, (&l, &rr)) in b.left.iter().zip(&b.right).enumerate() {
                        let want = synth_value(r.1 + i as u64);
                        if l != want || rr != -want {
                            r.2 += 1;
                        }
                    }
                    r.0 += 1;
                    r.1 += b.left.len() as u64;
                    ack_stream(&state, id, b.seq);
                    if b.quality.final_block {
                        r.5 = true;
                        break;
                    }
                }
                r
            })
        };
        let synth = Synth { sample_rate: 48000, channels: 2, callback_frames: 480, pace: Pace::Realtime, limit_frames: None, fatal_after: None };
        let info = start_stream_with(&state, Some("throughput-spike"), None, Some(DEFAULT_BLOCK_MS), None, synthetic_source(synth), channel).unwrap();
        assert_eq!((info.sample_rate, info.channels, info.block_frames), (48000, 2, 48000));
        id_tx.send(info.stream_id).unwrap();
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(seconds) {
            thread::sleep(Duration::from_millis(100));
            assert!(state.lease.is_held(), "stream ended early");
        }
        let summary = stop_stream_blocking(&state, None).unwrap();
        let (blocks, frames, mismatched_samples, seq_gaps, discontinuities, final_seen) = webview.join().unwrap();
        let report = SpikeReport { blocks, frames, mismatched_samples, seq_gaps, discontinuities, final_seen, summary };
        eprintln!(
            "stream spike {seconds}s: blocks={} frames={} droppedBlocks={} overrunSamples={} streamErrors={} seqGaps={} mismatches={}",
            report.blocks, report.frames, report.summary.dropped_blocks, report.summary.overrun_samples, report.summary.stream_errors, report.seq_gaps, report.mismatched_samples
        );
        report
    }

    fn assert_spike_clean(r: &SpikeReport, seconds: u64) {
        assert_eq!(r.summary.dropped_blocks, 0, "dropped blocks");
        assert_eq!(r.summary.overrun_samples, 0, "ring overruns");
        assert_eq!(r.summary.stream_errors, 0);
        assert_eq!((r.seq_gaps, r.discontinuities, r.mismatched_samples), (0, 0, 0));
        assert!(r.final_seen);
        assert_eq!(r.frames, r.summary.frames_captured, "every captured frame was delivered");
        assert_eq!(r.blocks, r.summary.blocks_sent as u64);
        let expected = seconds * 48000;
        assert!(r.frames + 48000 / 10 >= expected && r.frames <= expected + 48000, "frames {} for {seconds}s", r.frames);
    }

    /// CI variant of the FS-00 §10 spike: 30 s of real-time 48 kHz stereo,
    /// 0 dropped blocks, every sample verified.
    #[test]
    fn stream_throughput_48k_stereo_30s() {
        let r = throughput_spike(30);
        assert_spike_clean(&r, 30);
    }

    /// Full acceptance spike (M6-F1-capture): 20 min of 48 kHz stereo with 0
    /// dropped blocks. Run on the Windows runner (or locally) with:
    /// `cargo test --manifest-path src-tauri/Cargo.toml --lib capture::tests::stream_throughput_48k_stereo_20min -- --ignored --nocapture`
    /// `DECKCHEK_SPIKE_SECS` overrides the duration.
    #[test]
    #[ignore = "20-minute real-time throughput spike; run explicitly with --ignored"]
    fn stream_throughput_48k_stereo_20min() {
        let seconds = std::env::var("DECKCHEK_SPIKE_SECS").ok().and_then(|v| v.parse().ok()).unwrap_or(20 * 60);
        let r = throughput_spike(seconds);
        assert_spike_clean(&r, seconds);
    }
}
