//! Native input listing, input channel pairs and the bounded capture command.
//!
//! Channel pairs (FS-00 §4.7): a multichannel interface exposes its inputs as
//! named stereo pairs `1-2`, `3-4`, ... (1-based channel numbers). A device
//! with an odd channel count ends with a mono pair named after its last
//! channel (`5` on a 5-channel input); a mono pair is analysed as left = right.
//! Callers select pairs by first channel (`3`), by label (`"3-4"`) or with a
//! pair object from the device list (`{first: 3}`). No selection means the
//! first pair, which is exactly the pre-pairs behaviour (channels 1-2, or the
//! mono channel duplicated).

use crate::capture::{with_bounded_lease, CaptureError, LiveCaptureState};
use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    SampleFormat, Stream,
};
use serde::{Deserialize, Serialize};
use std::{
    sync::{atomic::AtomicBool, atomic::Ordering::Relaxed, mpsc, Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::State;

/// Most pairs one capture may carry (32 pairs = 64 channels).
pub const MAX_PAIRS: usize = 32;

// ------------------------------------------------------------- channel pairs

/// One named input pair. `first`/`second` are 1-based channel numbers;
/// a mono pair has `second == first`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelPair {
    pub label: String,
    pub first: u16,
    pub second: u16,
    pub mono: bool,
}

impl ChannelPair {
    fn stereo(first: u16) -> Self {
        Self { label: format!("{}-{}", first, first + 1), first, second: first + 1, mono: false }
    }

    fn mono(first: u16) -> Self {
        Self { label: first.to_string(), first, second: first, mono: true }
    }

    /// 0-based interleaved offsets of the left and right samples.
    pub fn offsets(&self) -> (usize, usize) {
        (self.first as usize - 1, self.second as usize - 1)
    }
}

/// Every pair a device with `channels` inputs offers, in order.
pub fn input_pairs(channels: u16) -> Vec<ChannelPair> {
    let mut out = Vec::with_capacity(channels as usize / 2 + 1);
    let mut first = 1u16;
    while first < channels {
        out.push(ChannelPair::stereo(first));
        first += 2;
    }
    if first == channels {
        out.push(ChannelPair::mono(first));
    }
    out
}

/// A requested pair as it arrives from JS: `3`, `"3-4"`/`"3"`, or `{first: 3}`.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum PairSel {
    Number(u16),
    Label(String),
    Object { first: u16 },
}

fn pair_first(sel: &PairSel) -> Result<u16, String> {
    let first = match sel {
        PairSel::Number(n) | PairSel::Object { first: n } => *n,
        PairSel::Label(text) => {
            let t = text.trim();
            let bad = || format!("Input pair \"{t}\" is not a pair name like 1-2 or 3-4.");
            match t.split_once('-') {
                Some((a, b)) => {
                    let a: u16 = a.trim().parse().map_err(|_| bad())?;
                    let b: u16 = b.trim().parse().map_err(|_| bad())?;
                    if a == 0 || b != a.saturating_add(1) {
                        return Err(bad());
                    }
                    a
                }
                None => t.parse().map_err(|_| bad())?,
            }
        }
    };
    if first == 0 || first % 2 == 0 || first == u16::MAX {
        return Err(format!(
            "Input pairs start on an odd channel (1-2, 3-4, ...); channel {first} does not start a pair."
        ));
    }
    Ok(first)
}

/// Checks a selection's syntax (before any device is opened) and returns the
/// first channel of each pair. `None` or an empty list selects nothing.
pub fn parse_pair_selection(sel: Option<&[PairSel]>) -> Result<Option<Vec<u16>>, String> {
    let Some(sel) = sel.filter(|s| !s.is_empty()) else { return Ok(None) };
    if sel.len() > MAX_PAIRS {
        return Err(format!("At most {MAX_PAIRS} input pairs can be captured at once."));
    }
    let mut out: Vec<u16> = Vec::with_capacity(sel.len());
    for s in sel {
        let first = pair_first(s)?;
        if out.contains(&first) {
            return Err(format!("Input pair {}-{} is selected twice.", first, first + 1));
        }
        out.push(first);
    }
    Ok(Some(out))
}

/// Channels a device must open for the selection, preferring full stereo
/// pairs (`stereo`) and accepting a final mono pair (`minimum`).
pub fn required_channels(firsts: Option<&[u16]>) -> (u16, u16) {
    match firsts.and_then(|f| f.iter().max().copied()) {
        Some(max) => (max + 1, max),
        None => (1, 1),
    }
}

/// Resolves a selection against the channel count actually opened. Out-of-range
/// pairs get an error that names the device and the pairs it does offer.
pub fn resolve_pairs(firsts: Option<&[u16]>, channels: u16, device_name: &str) -> Result<Vec<ChannelPair>, String> {
    let available = input_pairs(channels);
    let Some(firsts) = firsts else {
        return available
            .into_iter()
            .next()
            .map(|p| vec![p])
            .ok_or_else(|| "Input device reported zero channels.".to_string());
    };
    firsts
        .iter()
        .map(|&first| {
            available.iter().find(|p| p.first == first).cloned().ok_or_else(|| {
                let names: Vec<&str> = available.iter().map(|p| p.label.as_str()).collect();
                let plural = if channels == 1 { "" } else { "s" };
                format!(
                    "Input pair {}-{} is not available on {device_name}: it has {channels} input channel{plural} (pairs {}).",
                    first,
                    first + 1,
                    if names.is_empty() { "none".to_string() } else { names.join(", ") }
                )
            })
        })
        .collect()
}

/// Splits interleaved samples into one (left, right) per pair. Trailing
/// partial frames are ignored; offsets past the last channel clamp to it.
pub fn deinterleave_pairs(data: &[f32], channels: usize, pairs: &[ChannelPair]) -> Vec<(Vec<f32>, Vec<f32>)> {
    if channels == 0 {
        return pairs.iter().map(|_| (Vec::new(), Vec::new())).collect();
    }
    let frames = data.len() / channels;
    let mut out: Vec<(Vec<f32>, Vec<f32>)> =
        pairs.iter().map(|_| (Vec::with_capacity(frames), Vec::with_capacity(frames))).collect();
    let offs: Vec<(usize, usize)> = pairs
        .iter()
        .map(|p| {
            let (l, r) = p.offsets();
            (l.min(channels - 1), r.min(channels - 1))
        })
        .collect();
    for frame in data.chunks_exact(channels) {
        for (track, &(l, r)) in out.iter_mut().zip(&offs) {
            track.0.push(frame[l]);
            track.1.push(frame[r]);
        }
    }
    out
}

// ------------------------------------------------------------------- devices

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInputInfo {
    pub name: String,
    pub is_default: bool,
    /// Most input channels any supported config offers (0 when unknown).
    pub max_channels: u16,
    /// Channel count of the device's default config (0 when unknown).
    pub default_channels: u16,
    /// Named pairs over `max_channels`.
    pub pairs: Vec<ChannelPair>,
}

/// Samples of one additional pair (the first pair stays in `left`/`right`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairSamples {
    #[serde(flatten)]
    pub pair: ChannelPair,
    pub left: Vec<f32>,
    pub right: Vec<f32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCapturePayload {
    pub device_name: String,
    pub sample_rate: u32,
    /// Channels the device was opened with.
    pub channels: u16,
    /// Samples of the first selected pair.
    pub left: Vec<f32>,
    pub right: Vec<f32>,
    pub stream_errors: Vec<String>,
    /// Every selected pair, in order; `pairs[0]` is `left`/`right`.
    pub pairs: Vec<ChannelPair>,
    /// Samples of `pairs[1..]` (omitted for a single-pair capture).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub extra_pairs: Vec<PairSamples>,
}

impl AudioCapturePayload {
    /// Builds a payload from per-pair tracks (at least one).
    pub fn from_tracks(
        device_name: String,
        sample_rate: u32,
        channels: u16,
        tracks: Vec<(ChannelPair, Vec<f32>, Vec<f32>)>,
        stream_errors: Vec<String>,
    ) -> Self {
        let pairs = tracks.iter().map(|t| t.0.clone()).collect();
        let mut it = tracks.into_iter();
        let (left, right) = it.next().map(|(_, l, r)| (l, r)).unwrap_or_default();
        let extra_pairs = it.map(|(pair, left, right)| PairSamples { pair, left, right }).collect();
        Self { device_name, sample_rate, channels, left, right, stream_errors, pairs, extra_pairs }
    }
}

pub(crate) fn sample_i16(value: i16) -> f32 {
    value as f32 / 32768.0
}

pub(crate) fn sample_u16(value: u16) -> f32 {
    (value as f32 - 32768.0) / 32768.0
}

fn usable_format(f: SampleFormat) -> bool {
    matches!(f, SampleFormat::F32 | SampleFormat::I16 | SampleFormat::U16)
}

/// Most input channels the device offers in any supported config.
pub(crate) fn device_max_channels(device: &cpal::Device) -> u16 {
    let ranged = device
        .supported_input_configs()
        .map(|it| it.map(|r| r.channels()).max().unwrap_or(0))
        .unwrap_or(0);
    let default = device.default_input_config().map(|c| c.channels()).unwrap_or(0);
    ranged.max(default)
}

#[tauri::command]
pub fn list_native_audio_inputs() -> Result<Vec<AudioInputInfo>, String> {
    let host = cpal::default_host();
    let default_name = host.default_input_device().and_then(|d| d.name().ok());

    let devices = host.input_devices().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for device in devices {
        let name = device.name().unwrap_or_else(|_| "Unnamed audio input".to_string());
        let max_channels = device_max_channels(&device);
        out.push(AudioInputInfo {
            is_default: default_name.as_deref() == Some(name.as_str()),
            name,
            max_channels,
            default_channels: device.default_input_config().map(|c| c.channels()).unwrap_or(0),
            pairs: input_pairs(max_channels),
        });
    }
    Ok(out)
}

pub(crate) fn choose_input(device_name: Option<&str>) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    if let Some(target) = device_name {
        let devices = host.input_devices().map_err(|e| e.to_string())?;
        for device in devices {
            if device.name().ok().as_deref() == Some(target) {
                return Ok(device);
            }
        }
        return Err(format!("Audio input not found: {target}"));
    }
    host.default_input_device()
        .ok_or_else(|| "No default audio input is available.".to_string())
}

/// The input config for an optional sample rate with at least `min_channels`
/// channels. The default config wins whenever it qualifies, so a plain 1-2
/// capture opens the device exactly as before.
pub(crate) fn pick_input_config(
    device: &cpal::Device,
    sample_rate: Option<u32>,
    min_channels: u16,
) -> Result<cpal::SupportedStreamConfig, String> {
    let default = device.default_input_config().map_err(|e| e.to_string())?;
    let rate = sample_rate.unwrap_or(default.sample_rate().0);
    if default.sample_rate().0 == rate && default.channels() >= min_channels {
        return Ok(default);
    }
    type Score = (bool, bool, std::cmp::Reverse<u16>);
    let mut best: Option<(Score, cpal::SupportedStreamConfigRange)> = None;
    let mut rate_ok = false;
    for range in device.supported_input_configs().map_err(|e| e.to_string())? {
        if range.min_sample_rate().0 > rate || range.max_sample_rate().0 < rate || !usable_format(range.sample_format()) || range.channels() == 0 {
            continue;
        }
        rate_ok = true;
        if range.channels() < min_channels {
            continue;
        }
        // Prefer the default channel count, then the default format, then the fewest channels.
        let score = (
            range.channels() == default.channels(),
            range.sample_format() == default.sample_format(),
            std::cmp::Reverse(range.channels()),
        );
        if best.as_ref().is_none_or(|(s, _)| score > *s) {
            best = Some((score, range));
        }
    }
    match best {
        Some((_, r)) => Ok(r.with_sample_rate(cpal::SampleRate(rate))),
        None if !rate_ok && sample_rate.is_some() => Err(format!("Sample rate {rate} Hz is not supported by this input.")),
        None => Err(format!("This input cannot open {min_channels} channels at {rate} Hz.")),
    }
}

/// Picks a config for a pair selection: full stereo pairs if possible, a
/// final mono pair otherwise. Out-of-range pairs fail with the pair error.
pub(crate) fn pick_config_for_pairs(
    device: &cpal::Device,
    device_name: &str,
    sample_rate: Option<u32>,
    firsts: Option<&[u16]>,
) -> Result<cpal::SupportedStreamConfig, String> {
    if firsts.is_some() {
        resolve_pairs(firsts, device_max_channels(device), device_name)?;
    }
    let (stereo, minimum) = required_channels(firsts);
    pick_input_config(device, sample_rate, stereo).or_else(|e| {
        if minimum < stereo {
            pick_input_config(device, sample_rate, minimum)
        } else {
            Err(e)
        }
    })
}

fn build_capture_stream(
    device: &cpal::Device,
    sample_format: SampleFormat,
    config: &cpal::StreamConfig,
    target_samples: usize,
    collected: Arc<Mutex<Vec<f32>>>,
    done_tx: mpsc::Sender<()>,
    errors: Arc<Mutex<Vec<String>>>,
    lost: Arc<AtomicBool>,
) -> Result<Stream, String> {
    macro_rules! build {
        ($sample_ty:ty, $convert:expr) => {{
            let data = Arc::clone(&collected);
            let errors_for_callback = Arc::clone(&errors);
            let lost = Arc::clone(&lost);
            let tx = done_tx.clone();
            device
                .build_input_stream(
                    config,
                    move |input: &[$sample_ty], _| {
                        if let Ok(mut buffer) = data.lock() {
                            if buffer.len() >= target_samples {
                                return;
                            }
                            let remaining = target_samples - buffer.len();
                            buffer.extend(input.iter().take(remaining).map($convert));
                            if buffer.len() >= target_samples {
                                let _ = tx.send(());
                            }
                        }
                    },
                    move |error| {
                        if matches!(error, cpal::StreamError::DeviceNotAvailable) {
                            lost.store(true, Relaxed);
                        }
                        if let Ok(mut list) = errors_for_callback.lock() {
                            if list.len() < crate::capture::MAX_ERROR_MESSAGES {
                                list.push(error.to_string());
                            }
                        }
                    },
                    None,
                )
                .map_err(|e| e.to_string())
        }};
    }

    match sample_format {
        SampleFormat::F32 => build!(f32, |v: &f32| *v),
        SampleFormat::I16 => build!(i16, |v: &i16| sample_i16(*v)),
        SampleFormat::U16 => build!(u16, |v: &u16| sample_u16(*v)),
        other => Err(format!(
            "Default input sample format {other:?} is not yet supported by the bounded capture adapter."
        )),
    }
}

pub const CAPTURE_CANCELLED: &str =
    "The capture was stopped because another DeckChek feature needed the audio input.";

/// Device loss during a bounded capture. Classified as "no device" by the UI.
pub const CAPTURE_DEVICE_LOST: &str =
    "The audio input was disconnected during the capture (no device): reconnect it and retry.";

/// Waits for the capture to complete, polling `cancel` (set by a preempt) and
/// `lost` (set by the stream's error callback when the device disappears).
pub(crate) fn wait_for_capture(done_rx: &mpsc::Receiver<()>, timeout: Duration, cancel: &AtomicBool, lost: &AtomicBool) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    loop {
        if cancel.load(Relaxed) {
            return Err(CAPTURE_CANCELLED.to_string());
        }
        if lost.load(Relaxed) {
            return Err(CAPTURE_DEVICE_LOST.to_string());
        }
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return Err("Timed out before the requested audio capture completed.".to_string());
        }
        match done_rx.recv_timeout(left.min(Duration::from_millis(50))) {
            Ok(()) => return Ok(()),
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err("The audio stream ended before the capture completed.".to_string())
            }
        }
    }
}

/// Appends the stream errors the device reported to a failed capture's message.
pub(crate) fn with_stream_errors(message: String, errors: &[String]) -> String {
    if errors.is_empty() {
        message
    } else {
        format!("{message} Stream errors: {}", errors.join("; "))
    }
}

pub(crate) fn validate_duration(duration_sec: f32) -> Result<(), String> {
    if !duration_sec.is_finite() || duration_sec <= 0.0 || duration_sec > 30.0 {
        return Err("Capture duration must be greater than 0 and no more than 30 seconds.".to_string());
    }
    Ok(())
}

fn capture_blocking(
    device_name: Option<String>,
    duration_sec: f32,
    firsts: Option<Vec<u16>>,
    cancel: &AtomicBool,
) -> Result<AudioCapturePayload, String> {
    validate_duration(duration_sec)?;
    // A preempt may arrive while the device is being set up: check between steps.
    let cancelled = || if cancel.load(Relaxed) { Err(CAPTURE_CANCELLED.to_string()) } else { Ok(()) };

    let device = choose_input(device_name.as_deref())?;
    cancelled()?;
    let resolved_name = device.name().unwrap_or_else(|_| "Unnamed audio input".to_string());
    let supported = pick_config_for_pairs(&device, &resolved_name, None, firsts.as_deref())?;
    cancelled()?;
    let sample_format = supported.sample_format();
    let config: cpal::StreamConfig = supported.clone().into();
    let channels = config.channels as usize;
    if channels == 0 {
        return Err("Input device reported zero channels.".to_string());
    }
    let pairs = resolve_pairs(firsts.as_deref(), config.channels, &resolved_name)?;

    let target_frames = (config.sample_rate.0 as f64 * duration_sec as f64).ceil() as usize;
    let target_samples = target_frames.saturating_mul(channels);
    let collected = Arc::new(Mutex::new(Vec::<f32>::with_capacity(target_samples)));
    let errors = Arc::new(Mutex::new(Vec::<String>::new()));
    let (done_tx, done_rx) = mpsc::channel();
    let lost = Arc::new(AtomicBool::new(false));

    let stream = build_capture_stream(
        &device,
        sample_format,
        &config,
        target_samples,
        Arc::clone(&collected),
        done_tx,
        Arc::clone(&errors),
        Arc::clone(&lost),
    )?;
    if let Err(e) = cancelled() {
        drop(stream);
        return Err(e);
    }
    stream.play().map_err(|e| e.to_string())?;

    let waited = wait_for_capture(&done_rx, Duration::from_secs_f32(duration_sec + 2.0), cancel, &lost);
    drop(stream);
    if let Err(e) = waited {
        let reported = errors.lock().map(|l| l.clone()).unwrap_or_default();
        return Err(with_stream_errors(e, &reported));
    }

    let data = collected
        .lock()
        .map_err(|_| "Audio capture buffer lock was poisoned.".to_string())?
        .clone();
    let stream_errors = errors
        .lock()
        .map_err(|_| "Audio error buffer lock was poisoned.".to_string())?
        .clone();
    let tracks = deinterleave_pairs(&data, channels, &pairs)
        .into_iter()
        .zip(pairs)
        .map(|((l, r), p)| (p, l, r))
        .collect();

    Ok(AudioCapturePayload::from_tracks(resolved_name, config.sample_rate.0, config.channels, tracks, stream_errors))
}

/// Bounded capture (<= 30 s). Holds the capture lease (kind `bounded`) for its
/// whole duration, so it gets / causes `CAPTURE_BUSY` like every other path,
/// and a preempt ends it early with `CAPTURE_CANCELLED`.
#[tauri::command]
pub async fn capture_native_audio(
    state: State<'_, LiveCaptureState>,
    device_name: Option<String>,
    duration_sec: f32,
    pairs: Option<Vec<PairSel>>,
    holder: Option<String>,
) -> Result<AudioCapturePayload, CaptureError> {
    validate_duration(duration_sec)?;
    let firsts = parse_pair_selection(pairs.as_deref())?;
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let lease_device = device_name.clone();
        with_bounded_lease(&state, holder.as_deref(), lease_device, |cancel| {
            capture_blocking(device_name, duration_sec, firsts, cancel)
        })
    })
    .await
    .map_err(|e| CaptureError::Message(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 8-channel interleaved test signal: channel c (0-based), frame f = c * 10 + f / 100.
    fn interleaved(channels: usize, frames: usize) -> Vec<f32> {
        (0..frames).flat_map(|f| (0..channels).map(move |c| c as f32 * 10.0 + f as f32 / 100.0)).collect()
    }

    fn firsts(sel: &[PairSel]) -> Vec<u16> {
        parse_pair_selection(Some(sel)).unwrap().unwrap()
    }

    #[test]
    fn signed_and_unsigned_pcm_are_normalized() {
        assert!((sample_i16(i16::MAX) - 0.9999695).abs() < 0.00001);
        assert_eq!(sample_i16(i16::MIN), -1.0);
        assert_eq!(sample_u16(32768), 0.0);
        assert!(sample_u16(u16::MAX) < 1.0);
    }

    #[test]
    fn mono_capture_is_duplicated_to_stereo_analysis_channels() {
        let pairs = resolve_pairs(None, 1, "Mic").unwrap();
        let t = deinterleave_pairs(&[0.1, 0.2, 0.3], 1, &pairs);
        assert_eq!(t[0].0, vec![0.1, 0.2, 0.3]);
        assert_eq!(t[0].1, t[0].0);
    }

    #[test]
    fn stereo_capture_deinterleaves_first_two_channels() {
        let pairs = resolve_pairs(None, 2, "In").unwrap();
        let t = deinterleave_pairs(&[0.1, -0.1, 0.2, -0.2], 2, &pairs);
        assert_eq!((t[0].0.clone(), t[0].1.clone()), (vec![0.1, 0.2], vec![-0.1, -0.2]));
    }

    #[test]
    fn device_pairs_are_named_for_even_odd_and_empty_channel_counts() {
        let labels = |n| input_pairs(n).into_iter().map(|p| p.label).collect::<Vec<_>>();
        assert_eq!(labels(8), ["1-2", "3-4", "5-6", "7-8"]);
        assert_eq!(labels(5), ["1-2", "3-4", "5"]);
        assert_eq!(labels(1), ["1"]);
        assert!(labels(0).is_empty());
        let p = &input_pairs(5)[2];
        assert_eq!((p.first, p.second, p.mono, p.offsets()), (5, 5, true, (4, 4)));
        let p = &input_pairs(8)[1];
        assert_eq!((p.first, p.second, p.mono, p.offsets()), (3, 4, false, (2, 3)));
        let v = serde_json::to_value(p).unwrap();
        assert_eq!(v, serde_json::json!({"label": "3-4", "first": 3, "second": 4, "mono": false}));
    }

    #[test]
    fn selections_accept_numbers_labels_and_pair_objects() {
        let sel: Vec<PairSel> = serde_json::from_value(serde_json::json!([3, "5-6", " 7 ", {"first": 1, "label": "1-2"}])).unwrap();
        assert_eq!(firsts(&sel), vec![3, 5, 7, 1]);
        assert_eq!(parse_pair_selection(None).unwrap(), None);
        assert_eq!(parse_pair_selection(Some(&[])).unwrap(), None, "empty list = default pair");
    }

    #[test]
    fn malformed_selections_are_rejected_with_clear_errors() {
        for (bad, needle) in [
            (serde_json::json!([2]), "odd channel"),
            (serde_json::json!([0]), "odd channel"),
            (serde_json::json!(["4-5"]), "odd channel"),
            (serde_json::json!(["3-5"]), "not a pair name"),
            (serde_json::json!(["left"]), "not a pair name"),
            (serde_json::json!([3, "3-4"]), "selected twice"),
        ] {
            let sel: Vec<PairSel> = serde_json::from_value(bad.clone()).unwrap();
            let e = parse_pair_selection(Some(&sel)).unwrap_err();
            assert!(e.contains(needle), "{bad}: {e}");
        }
        let many: Vec<PairSel> = (0..=MAX_PAIRS as u16).map(|i| PairSel::Number(i * 2 + 1)).collect();
        assert!(parse_pair_selection(Some(&many)).unwrap_err().contains("At most"));
    }

    #[test]
    fn required_channels_prefer_full_pairs() {
        assert_eq!(required_channels(None), (1, 1));
        assert_eq!(required_channels(Some(&[1])), (2, 1));
        assert_eq!(required_channels(Some(&[5, 1, 3])), (6, 5));
    }

    #[test]
    fn out_of_range_pairs_name_the_device_and_its_pairs() {
        let e = resolve_pairs(Some(&[9]), 8, "Traktor Audio 8 DJ").unwrap_err();
        assert_eq!(e, "Input pair 9-10 is not available on Traktor Audio 8 DJ: it has 8 input channels (pairs 1-2, 3-4, 5-6, 7-8).");
        let e = resolve_pairs(Some(&[3]), 2, "Xone:23C").unwrap_err();
        assert!(e.contains("it has 2 input channels (pairs 1-2)"), "{e}");
        let e = resolve_pairs(Some(&[1]), 0, "Ghost").unwrap_err();
        assert!(e.contains("(pairs none)"), "{e}");
        assert!(resolve_pairs(Some(&[3]), 1, "Mic").unwrap_err().contains("1 input channel (pairs 1)"));
        assert!(resolve_pairs(None, 0, "Ghost").is_err());
        // Odd channel count: 5 resolves to the mono pair, 3 to a full pair.
        let p = resolve_pairs(Some(&[5, 3]), 5, "Odd").unwrap();
        assert_eq!(p.iter().map(|p| p.label.as_str()).collect::<Vec<_>>(), ["5", "3-4"]);
    }

    #[test]
    fn eight_channel_capture_splits_any_pairs_in_request_order() {
        let data = interleaved(8, 4);
        let pairs = resolve_pairs(Some(&[7, 3]), 8, "Audio 8").unwrap();
        let t = deinterleave_pairs(&data, 8, &pairs);
        assert_eq!(t.len(), 2);
        assert_eq!(t[0].0, vec![60.0, 60.01, 60.02, 60.03]);
        assert_eq!(t[0].1, vec![70.0, 70.01, 70.02, 70.03]);
        assert_eq!(t[1].0, vec![20.0, 20.01, 20.02, 20.03]);
        assert_eq!(t[1].1, vec![30.0, 30.01, 30.02, 30.03]);
    }

    #[test]
    fn odd_channel_capture_duplicates_the_last_mono_channel_and_drops_partial_frames() {
        let mut data = interleaved(5, 3);
        data.extend([1.0, 2.0]); // partial trailing frame
        let pairs = resolve_pairs(Some(&[5, 1]), 5, "Odd").unwrap();
        let t = deinterleave_pairs(&data, 5, &pairs);
        assert_eq!(t[0].0, vec![40.0, 40.01, 40.02]);
        assert_eq!(t[0].1, t[0].0);
        assert_eq!((t[1].0.len(), t[1].1[2]), (3, 10.02));
        assert!(deinterleave_pairs(&[1.0], 0, &pairs).iter().all(|(l, r)| l.is_empty() && r.is_empty()));
    }

    #[test]
    fn payload_keeps_the_first_pair_in_left_right_and_lists_all_pairs() {
        let pairs = resolve_pairs(Some(&[1, 3]), 4, "In").unwrap();
        let tracks = vec![(pairs[0].clone(), vec![0.1], vec![0.2]), (pairs[1].clone(), vec![0.3], vec![0.4])];
        let v = serde_json::to_value(AudioCapturePayload::from_tracks("In".into(), 48000, 4, tracks, vec![])).unwrap();
        assert_eq!(v["left"], serde_json::json!([0.10000000149011612]));
        assert_eq!(v["pairs"][1]["label"], "3-4");
        assert_eq!(v["extraPairs"][0]["label"], "3-4");
        assert_eq!(v["extraPairs"][0]["first"], 3);
        assert_eq!(v["extraPairs"][0]["right"].as_array().unwrap().len(), 1);
        let single = AudioCapturePayload::from_tracks("In".into(), 48000, 2, vec![(pairs[0].clone(), vec![], vec![])], vec![]);
        let v = serde_json::to_value(single).unwrap();
        assert!(v.get("extraPairs").is_none(), "single-pair payload has no extraPairs");
        assert_eq!(v["pairs"][0]["label"], "1-2");
    }

    #[test]
    fn capture_wait_completes_cancels_and_times_out() {
        let (cancel, lost) = (AtomicBool::new(false), AtomicBool::new(false));
        let (tx, rx) = mpsc::channel();
        tx.send(()).unwrap();
        assert!(wait_for_capture(&rx, Duration::from_secs(1), &cancel, &lost).is_ok());
        assert!(wait_for_capture(&rx, Duration::from_millis(30), &cancel, &lost).unwrap_err().contains("Timed out"));
        cancel.store(true, Relaxed);
        assert_eq!(wait_for_capture(&rx, Duration::from_secs(1), &cancel, &lost).unwrap_err(), CAPTURE_CANCELLED);
        drop(tx);
        cancel.store(false, Relaxed);
        assert!(wait_for_capture(&rx, Duration::from_secs(1), &cancel, &lost).unwrap_err().contains("ended"));
    }

    /// BUG-14: device loss ends the wait at once as a device error (not a
    /// timeout after duration + 2 s), and the collected stream errors are kept.
    #[test]
    fn device_loss_is_reported_promptly_with_the_stream_errors() {
        let cancel = AtomicBool::new(false);
        let lost = Arc::new(AtomicBool::new(false));
        let (_tx, rx) = mpsc::channel::<()>();
        let setter = {
            let lost = lost.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(60));
                lost.store(true, Relaxed); // what the error callback does on DeviceNotAvailable
            })
        };
        let started = Instant::now();
        let e = wait_for_capture(&rx, Duration::from_secs(10), &cancel, &lost).unwrap_err();
        setter.join().unwrap();
        assert_eq!(e, CAPTURE_DEVICE_LOST);
        assert!(started.elapsed() < Duration::from_secs(2), "not a timeout");
        let full = with_stream_errors(e, &["The requested device is no longer available.".into()]);
        assert!(full.starts_with(CAPTURE_DEVICE_LOST) && full.contains("no longer available"), "{full}");
        assert_eq!(with_stream_errors("x".into(), &[]), "x", "no errors, message unchanged");
        assert!(with_stream_errors("Timed out".into(), &["glitch".into()]).ends_with("Stream errors: glitch"));
    }

    #[test]
    fn duration_is_validated_before_any_device_work() {
        assert!(validate_duration(0.0).is_err());
        assert!(validate_duration(30.5).is_err());
        assert!(validate_duration(f32::NAN).is_err());
        assert!(validate_duration(30.0).is_ok());
    }
}
