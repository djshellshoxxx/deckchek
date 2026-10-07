use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    SampleFormat, Stream,
};
use serde::Serialize;
use std::{
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInputInfo {
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCapturePayload {
    pub device_name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub left: Vec<f32>,
    pub right: Vec<f32>,
    pub stream_errors: Vec<String>,
}

pub(crate) fn sample_i16(value: i16) -> f32 {
    value as f32 / 32768.0
}

pub(crate) fn sample_u16(value: u16) -> f32 {
    (value as f32 - 32768.0) / 32768.0
}

fn deinterleave(data: &[f32], channels: usize) -> (Vec<f32>, Vec<f32>) {
    if channels == 0 {
        return (Vec::new(), Vec::new());
    }
    let frames = data.len() / channels;
    let mut left = Vec::with_capacity(frames);
    let mut right = Vec::with_capacity(frames);
    for frame in data.chunks_exact(channels) {
        left.push(frame[0]);
        right.push(if channels > 1 { frame[1] } else { frame[0] });
    }
    (left, right)
}

#[tauri::command]
pub fn list_native_audio_inputs() -> Result<Vec<AudioInputInfo>, String> {
    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|d| d.name().ok());

    let devices = host.input_devices().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for device in devices {
        let name = device.name().unwrap_or_else(|_| "Unnamed audio input".to_string());
        out.push(AudioInputInfo {
            is_default: default_name.as_deref() == Some(name.as_str()),
            name,
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

fn build_capture_stream(
    device: &cpal::Device,
    sample_format: SampleFormat,
    config: &cpal::StreamConfig,
    target_samples: usize,
    collected: Arc<Mutex<Vec<f32>>>,
    done_tx: mpsc::Sender<()>,
    errors: Arc<Mutex<Vec<String>>>,
) -> Result<Stream, String> {
    macro_rules! build {
        ($sample_ty:ty, $convert:expr) => {{
            let data = Arc::clone(&collected);
            let errors_for_callback = Arc::clone(&errors);
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
                        if let Ok(mut list) = errors_for_callback.lock() {
                            list.push(error.to_string());
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

fn capture_blocking(device_name: Option<String>, duration_sec: f32) -> Result<AudioCapturePayload, String> {
    if !duration_sec.is_finite() || duration_sec <= 0.0 || duration_sec > 30.0 {
        return Err("Capture duration must be greater than 0 and no more than 30 seconds.".to_string());
    }

    let device = choose_input(device_name.as_deref())?;
    let resolved_name = device.name().unwrap_or_else(|_| "Unnamed audio input".to_string());
    let supported = device.default_input_config().map_err(|e| e.to_string())?;
    let sample_format = supported.sample_format();
    let config: cpal::StreamConfig = supported.clone().into();
    let channels = config.channels as usize;
    if channels == 0 {
        return Err("Input device reported zero channels.".to_string());
    }

    let target_frames = (config.sample_rate.0 as f64 * duration_sec as f64).ceil() as usize;
    let target_samples = target_frames.saturating_mul(channels);
    let collected = Arc::new(Mutex::new(Vec::<f32>::with_capacity(target_samples)));
    let errors = Arc::new(Mutex::new(Vec::<String>::new()));
    let (done_tx, done_rx) = mpsc::channel();

    let stream = build_capture_stream(
        &device,
        sample_format,
        &config,
        target_samples,
        Arc::clone(&collected),
        done_tx,
        Arc::clone(&errors),
    )?;
    stream.play().map_err(|e| e.to_string())?;

    let wait = Duration::from_secs_f32(duration_sec + 2.0);
    done_rx
        .recv_timeout(wait)
        .map_err(|_| "Timed out before the requested audio capture completed.".to_string())?;
    drop(stream);

    let data = collected
        .lock()
        .map_err(|_| "Audio capture buffer lock was poisoned.".to_string())?
        .clone();
    let stream_errors = errors
        .lock()
        .map_err(|_| "Audio error buffer lock was poisoned.".to_string())?
        .clone();
    let (left, right) = deinterleave(&data, channels);

    Ok(AudioCapturePayload {
        device_name: resolved_name,
        sample_rate: config.sample_rate.0,
        channels: config.channels,
        left,
        right,
        stream_errors,
    })
}

#[tauri::command]
pub async fn capture_native_audio(
    device_name: Option<String>,
    duration_sec: f32,
) -> Result<AudioCapturePayload, String> {
    tauri::async_runtime::spawn_blocking(move || capture_blocking(device_name, duration_sec))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signed_and_unsigned_pcm_are_normalized() {
        assert!((sample_i16(i16::MAX) - 0.9999695).abs() < 0.00001);
        assert_eq!(sample_i16(i16::MIN), -1.0);
        assert_eq!(sample_u16(32768), 0.0);
        assert!(sample_u16(u16::MAX) < 1.0);
    }

    #[test]
    fn mono_capture_is_duplicated_to_stereo_analysis_channels() {
        let (left, right) = deinterleave(&[0.1, 0.2, 0.3], 1);
        assert_eq!(left, vec![0.1, 0.2, 0.3]);
        assert_eq!(right, left);
    }

    #[test]
    fn stereo_capture_deinterleaves_first_two_channels() {
        let (left, right) = deinterleave(&[0.1, -0.1, 0.2, -0.2], 2);
        assert_eq!(left, vec![0.1, 0.2]);
        assert_eq!(right, vec![-0.1, -0.2]);
    }
}
