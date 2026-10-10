//! Continuous native stereo capture.
//!
//! Data flow: CPAL callback (no alloc, no locks) -> SPSC ring (`rtrb`) ->
//! consumer thread -> preallocated bounded stereo buffers + level events.

use crate::audio::{choose_input, sample_i16, sample_u16, AudioCapturePayload};
use cpal::{
    traits::{DeviceTrait, StreamTrait},
    SampleFormat,
};
use rtrb::{Consumer, Producer, RingBuffer};
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering::Relaxed},
        mpsc, Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, State};

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

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureQuality {
    pub frames_captured: u64,
    pub overrun_samples: u64,
    pub clipped_samples_l: u64,
    pub clipped_samples_r: u64,
    pub stream_errors: u64,
    pub stream_error_messages: Vec<String>,
    pub truncated: bool,
    pub callback_count: u64,
    pub max_callback_gap_ms: f64,
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

/// Consumer side: bounded stereo accumulation.
#[derive(Debug)]
pub struct Accumulator {
    pub left: Vec<f32>,
    pub right: Vec<f32>,
    max_frames: usize,
    pub truncated: bool,
    pub clipped_l: u64,
    pub clipped_r: u64,
    pub window: LevelWindow,
}

impl Accumulator {
    pub fn new(max_frames: usize) -> Self {
        Self {
            left: Vec::with_capacity(max_frames),
            right: Vec::with_capacity(max_frames),
            max_frames,
            truncated: false,
            clipped_l: 0,
            clipped_r: 0,
            window: LevelWindow::default(),
        }
    }

    fn push_frame(&mut self, l: f32, r: f32) {
        self.window.push(l, r);
        if self.left.len() >= self.max_frames {
            self.truncated = true;
            return;
        }
        self.clipped_l += is_clipped(l) as u64;
        self.clipped_r += is_clipped(r) as u64;
        self.left.push(l);
        self.right.push(r);
    }

    /// Drains all whole frames currently in the ring. Frames beyond the bound
    /// are discarded and `truncated` is set. Returns frames consumed.
    pub fn drain(&mut self, consumer: &mut Consumer<f32>, channels: usize) -> usize {
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
        let mut it = chunk.into_iter();
        let mut frames = 0;
        while let Some(l) = it.next() {
            let r = if channels > 1 { it.next().unwrap_or(l) } else { l };
            for _ in 2..channels {
                it.next();
            }
            self.push_frame(l, r);
            frames += 1;
        }
        frames
    }

    pub fn publish(&self, shared: &Shared) {
        shared.frames_captured.store(self.left.len() as u64, Relaxed);
        shared.clipped_l.store(self.clipped_l, Relaxed);
        shared.clipped_r.store(self.clipped_r, Relaxed);
        shared.truncated.store(self.truncated, Relaxed);
    }
}

// ------------------------------------------------------------- session / IO

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveCaptureInfo {
    pub device_name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub max_seconds: f32,
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
struct LevelEvent {
    #[serde(flatten)]
    levels: Levels,
    elapsed_sec: f32,
    overrun_samples: u64,
}

struct Session {
    info: LiveCaptureInfo,
    started: Instant,
    shared: Arc<Shared>,
    stream_stop: Arc<AtomicBool>,
    consumer_stop: Arc<AtomicBool>,
    stream_thread: JoinHandle<()>,
    consumer_thread: JoinHandle<Accumulator>,
}

#[derive(Clone, Default)]
pub struct LiveCaptureState(Arc<Mutex<Option<Session>>>);

/// Whether a live capture session is open (FS-08 refuses restore meanwhile).
pub(crate) fn is_running(state: &LiveCaptureState) -> bool {
    state.0.lock().map(|slot| slot.is_some()).unwrap_or(true)
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
            move |e| shared.record_error(e.to_string()),
            None,
        )
        .map_err(|e| e.to_string())
}

type Ready = Result<(LiveCaptureInfo, Consumer<f32>), String>;

fn stream_thread_main(
    device_name: Option<String>,
    max_seconds: f32,
    shared: Arc<Shared>,
    stop: Arc<AtomicBool>,
    ready: mpsc::Sender<Ready>,
) {
    let setup = || -> Result<(cpal::Stream, LiveCaptureInfo, Consumer<f32>), String> {
        let device = choose_input(device_name.as_deref())?;
        let name = device.name().unwrap_or_else(|_| "Unnamed audio input".to_string());
        let supported = device.default_input_config().map_err(|e| e.to_string())?;
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
        let info = LiveCaptureInfo {
            device_name: name,
            sample_rate: config.sample_rate.0,
            channels: config.channels,
            max_seconds,
        };
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
}

fn consumer_thread_main(
    app: AppHandle,
    mut consumer: Consumer<f32>,
    info: LiveCaptureInfo,
    shared: Arc<Shared>,
    stop: Arc<AtomicBool>,
    started: Instant,
) -> Accumulator {
    let channels = info.channels as usize;
    let max_frames = (info.sample_rate as f64 * info.max_seconds as f64).ceil() as usize;
    let mut acc = Accumulator::new(max_frames);
    let mut last_emit = Instant::now();
    loop {
        let stopping = stop.load(Relaxed);
        acc.drain(&mut consumer, channels);
        acc.publish(&shared);
        if stopping {
            break;
        }
        if last_emit.elapsed() >= LEVEL_INTERVAL {
            last_emit = Instant::now();
            let _ = app.emit(
                "capture-levels",
                LevelEvent {
                    levels: acc.window.take(),
                    elapsed_sec: started.elapsed().as_secs_f32(),
                    overrun_samples: shared.overrun_samples.load(Relaxed),
                },
            );
        }
        thread::sleep(Duration::from_millis(5));
    }
    acc
}

fn start_blocking(
    app: AppHandle,
    state: LiveCaptureState,
    device_name: Option<String>,
    max_seconds: f32,
) -> Result<LiveCaptureInfo, String> {
    let mut slot = state.0.lock().map_err(|_| "Capture state poisoned.".to_string())?;
    if slot.is_some() {
        return Err("A live capture is already running.".to_string());
    }
    let max_seconds = clamp_max_seconds(max_seconds);
    let shared = Arc::new(Shared::default());
    let stream_stop = Arc::new(AtomicBool::new(false));
    let consumer_stop = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::channel();

    let stream_thread = {
        let (shared, stop) = (shared.clone(), stream_stop.clone());
        thread::Builder::new()
            .name("deckchek-capture-stream".into())
            .spawn(move || stream_thread_main(device_name, max_seconds, shared, stop, tx))
            .map_err(|e| e.to_string())?
    };
    let ready = rx
        .recv_timeout(Duration::from_secs(10))
        .map_err(|_| "Timed out opening the audio input.".to_string())
        .and_then(|r| r);
    let (info, consumer) = match ready {
        Ok(v) => v,
        Err(e) => {
            stream_stop.store(true, Relaxed);
            let _ = stream_thread.join();
            return Err(e);
        }
    };

    let started = Instant::now();
    let consumer_thread = {
        let (info, shared, stop) = (info.clone(), shared.clone(), consumer_stop.clone());
        thread::Builder::new()
            .name("deckchek-capture-consumer".into())
            .spawn(move || consumer_thread_main(app, consumer, info, shared, stop, started))
            .map_err(|e| e.to_string())?
    };
    *slot = Some(Session {
        info: info.clone(),
        started,
        shared,
        stream_stop,
        consumer_stop,
        stream_thread,
        consumer_thread,
    });
    Ok(info)
}

fn stop_blocking(state: LiveCaptureState) -> Result<LiveCaptureResult, String> {
    let session = state
        .0
        .lock()
        .map_err(|_| "Capture state poisoned.".to_string())?
        .take()
        .ok_or_else(|| "No live capture is running.".to_string())?;
    session.stream_stop.store(true, Relaxed);
    let _ = session.stream_thread.join();
    session.consumer_stop.store(true, Relaxed);
    let acc = session
        .consumer_thread
        .join()
        .map_err(|_| "Capture consumer thread panicked.".to_string())?;
    let quality = session.shared.snapshot();
    Ok(LiveCaptureResult {
        payload: AudioCapturePayload {
            device_name: session.info.device_name,
            sample_rate: session.info.sample_rate,
            channels: session.info.channels,
            left: acc.left,
            right: acc.right,
            stream_errors: quality.stream_error_messages.clone(),
        },
        quality,
    })
}

#[tauri::command]
pub async fn start_live_capture(
    app: AppHandle,
    state: State<'_, LiveCaptureState>,
    device_name: Option<String>,
    max_seconds: f32,
) -> Result<LiveCaptureInfo, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || start_blocking(app, state, device_name, max_seconds))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn stop_live_capture(state: State<'_, LiveCaptureState>) -> Result<LiveCaptureResult, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || stop_blocking(state))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn live_capture_status(state: State<'_, LiveCaptureState>) -> Result<LiveCaptureStatus, String> {
    let slot = state.0.lock().map_err(|_| "Capture state poisoned.".to_string())?;
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
        assert_eq!(acc.left, vec![1.0, 3.0]);
        assert_eq!(acc.right, vec![2.0, 4.0]);
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
        assert_eq!(acc.left, acc.right);
        push_frames(&mut p, &[1.0f32, 2.0, 9.0, 3.0, 4.0, 9.0], 3, |v| v);
        let mut acc = Accumulator::new(10);
        acc.drain(&mut c, 3);
        assert_eq!((acc.left, acc.right), (vec![1.0, 3.0], vec![2.0, 4.0]));
    }

    #[test]
    fn drain_is_bounded_and_sets_truncated() {
        let (mut p, mut c) = RingBuffer::<f32>::new(32);
        push_frames(&mut p, &[0.5f32; 20], 2, |v| v);
        let mut acc = Accumulator::new(4);
        assert_eq!(acc.drain(&mut c, 2), 10);
        assert_eq!(acc.left.len(), 4);
        assert!(acc.truncated);
        assert_eq!(c.slots(), 0);
        assert_eq!(acc.left.capacity(), 4);
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
}
