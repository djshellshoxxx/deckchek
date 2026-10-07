//! MIDI test engine: port listing, multi-input capture with batched events, and output for LED tests.
use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const QUEUE_CAPACITY: usize = 4096;
const BATCH_WINDOW: Duration = Duration::from_millis(10);
const BATCH_MAX: usize = 512;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MidiMessage {
    pub port: String,
    pub timestamp_us: u64,
    pub bytes: Vec<u8>,
}

#[derive(Serialize)]
pub struct PortInfo {
    pub index: usize,
    pub name: String,
}

#[derive(Serialize)]
pub struct PortList {
    pub inputs: Vec<PortInfo>,
    pub outputs: Vec<PortInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiStatus {
    pub open_inputs: Vec<String>,
    pub open_outputs: Vec<String>,
    pub dropped: u64,
    pub emitted: u64,
}

/// Non-blocking push into a bounded channel; counts drops when full.
pub fn push_bounded(tx: &SyncSender<MidiMessage>, dropped: &AtomicU64, msg: MidiMessage) -> bool {
    match tx.try_send(msg) {
        Ok(()) => true,
        Err(TrySendError::Full(_)) | Err(TrySendError::Disconnected(_)) => {
            dropped.fetch_add(1, Ordering::Relaxed);
            false
        }
    }
}

/// Block for the first message (up to `idle`), then gather more until `window` elapses or `max` reached.
/// Returns None on disconnect, Some(empty) on idle timeout.
pub fn collect_batch(rx: &Receiver<MidiMessage>, idle: Duration, window: Duration, max: usize) -> Option<Vec<MidiMessage>> {
    let first = match rx.recv_timeout(idle) {
        Ok(m) => m,
        Err(RecvTimeoutError::Timeout) => return Some(Vec::new()),
        Err(RecvTimeoutError::Disconnected) => return None,
    };
    let mut out = vec![first];
    let start = Instant::now();
    while out.len() < max {
        let left = window.saturating_sub(start.elapsed());
        if left.is_zero() {
            break;
        }
        match rx.recv_timeout(left) {
            Ok(m) => out.push(m),
            Err(_) => break,
        }
    }
    Some(out)
}

pub struct MidiState {
    inner: Mutex<Inner>,
    dropped: Arc<AtomicU64>,
    emitted: Arc<AtomicU64>,
}

struct Inner {
    inputs: HashMap<String, MidiInputConnection<()>>,
    outputs: HashMap<String, MidiOutputConnection>,
    tx: Option<SyncSender<MidiMessage>>,
}

impl Default for MidiState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Inner { inputs: HashMap::new(), outputs: HashMap::new(), tx: None }),
            dropped: Arc::new(AtomicU64::new(0)),
            emitted: Arc::new(AtomicU64::new(0)),
        }
    }
}

fn lock(state: &MidiState) -> Result<std::sync::MutexGuard<'_, Inner>, String> {
    state.inner.lock().map_err(|_| "MIDI state poisoned".to_string())
}

#[tauri::command]
pub fn midi_list_ports() -> Result<PortList, String> {
    let inp = MidiInput::new("deckchek-list-in").map_err(|e| e.to_string())?;
    let out = MidiOutput::new("deckchek-list-out").map_err(|e| e.to_string())?;
    let inputs = inp.ports().iter().enumerate()
        .map(|(index, p)| PortInfo { index, name: inp.port_name(p).unwrap_or_default() }).collect();
    let outputs = out.ports().iter().enumerate()
        .map(|(index, p)| PortInfo { index, name: out.port_name(p).unwrap_or_default() }).collect();
    Ok(PortList { inputs, outputs })
}

fn ensure_pump(inner: &mut Inner, app: AppHandle, emitted: Arc<AtomicU64>) -> SyncSender<MidiMessage> {
    if let Some(tx) = &inner.tx {
        return tx.clone();
    }
    let (tx, rx) = sync_channel::<MidiMessage>(QUEUE_CAPACITY);
    std::thread::spawn(move || {
        while let Some(batch) = collect_batch(&rx, Duration::from_millis(250), BATCH_WINDOW, BATCH_MAX) {
            if batch.is_empty() {
                continue;
            }
            emitted.fetch_add(batch.len() as u64, Ordering::Relaxed);
            let _ = app.emit("midi-message", batch);
        }
    });
    inner.tx = Some(tx.clone());
    tx
}

#[tauri::command]
pub fn midi_open_input(app: AppHandle, state: State<'_, MidiState>, name: String) -> Result<(), String> {
    let mut inner = lock(&state)?;
    if inner.inputs.contains_key(&name) {
        return Ok(());
    }
    let mut mi = MidiInput::new("deckchek-in").map_err(|e| e.to_string())?;
    mi.ignore(midir::Ignore::None);
    let port = mi.ports().into_iter()
        .find(|p| mi.port_name(p).map(|n| n == name).unwrap_or(false))
        .ok_or_else(|| format!("MIDI input not found: {name}"))?;
    let tx = ensure_pump(&mut inner, app, state.emitted.clone());
    let dropped = state.dropped.clone();
    let port_name = name.clone();
    let conn = mi.connect(&port, "deckchek-input", move |ts, bytes, _| {
        push_bounded(&tx, &dropped, MidiMessage { port: port_name.clone(), timestamp_us: ts, bytes: bytes.to_vec() });
    }, ()).map_err(|e| e.to_string())?;
    inner.inputs.insert(name, conn);
    Ok(())
}

#[tauri::command]
pub fn midi_close_input(state: State<'_, MidiState>, name: String) -> Result<(), String> {
    let mut inner = lock(&state)?;
    if let Some(c) = inner.inputs.remove(&name) {
        c.close();
    }
    Ok(())
}

#[tauri::command]
pub fn midi_send(state: State<'_, MidiState>, name: String, bytes: Vec<u8>) -> Result<(), String> {
    let mut inner = lock(&state)?;
    if !inner.outputs.contains_key(&name) {
        let mo = MidiOutput::new("deckchek-out").map_err(|e| e.to_string())?;
        let port = mo.ports().into_iter()
            .find(|p| mo.port_name(p).map(|n| n == name).unwrap_or(false))
            .ok_or_else(|| format!("MIDI output not found: {name}"))?;
        let conn = mo.connect(&port, "deckchek-output").map_err(|e| e.to_string())?;
        inner.outputs.insert(name.clone(), conn);
    }
    inner.outputs.get_mut(&name).unwrap().send(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn midi_close_all(state: State<'_, MidiState>) -> Result<(), String> {
    let mut inner = lock(&state)?;
    for (_, c) in inner.inputs.drain() {
        c.close();
    }
    for (_, c) in inner.outputs.drain() {
        c.close();
    }
    Ok(())
}

#[tauri::command]
pub fn midi_status(state: State<'_, MidiState>) -> Result<MidiStatus, String> {
    let inner = lock(&state)?;
    let mut open_inputs: Vec<String> = inner.inputs.keys().cloned().collect();
    let mut open_outputs: Vec<String> = inner.outputs.keys().cloned().collect();
    open_inputs.sort();
    open_outputs.sort();
    Ok(MidiStatus {
        open_inputs,
        open_outputs,
        dropped: state.dropped.load(Ordering::Relaxed),
        emitted: state.emitted.load(Ordering::Relaxed),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(i: u64) -> MidiMessage {
        MidiMessage { port: "p".into(), timestamp_us: i, bytes: vec![0x90, 1, 127] }
    }

    #[test]
    fn bounded_push_drops_and_counts() {
        let (tx, rx) = sync_channel(3);
        let dropped = AtomicU64::new(0);
        for i in 0..5 {
            push_bounded(&tx, &dropped, msg(i));
        }
        assert_eq!(dropped.load(Ordering::Relaxed), 2);
        assert_eq!(rx.try_iter().count(), 3);
    }

    #[test]
    fn batch_collects_burst_and_respects_max() {
        let (tx, rx) = sync_channel(100);
        for i in 0..10 {
            tx.send(msg(i)).unwrap();
        }
        let b = collect_batch(&rx, Duration::from_millis(50), Duration::from_millis(10), 4).unwrap();
        assert_eq!(b.len(), 4);
        assert_eq!(b[0].timestamp_us, 0);
        let b = collect_batch(&rx, Duration::from_millis(50), Duration::from_millis(10), 100).unwrap();
        assert_eq!(b.len(), 6);
    }

    #[test]
    fn batch_idle_and_disconnect() {
        let (tx, rx) = sync_channel::<MidiMessage>(4);
        assert_eq!(collect_batch(&rx, Duration::from_millis(5), BATCH_WINDOW, 10).unwrap().len(), 0);
        drop(tx);
        assert!(collect_batch(&rx, Duration::from_millis(5), BATCH_WINDOW, 10).is_none());
    }
}
