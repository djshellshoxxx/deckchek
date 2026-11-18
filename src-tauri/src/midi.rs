//! MIDI test engine: port listing, multi-input capture with batched events, and output for LED tests.
use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

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
pub fn collect_batch(
    rx: &Receiver<MidiMessage>,
    idle: Duration,
    window: Duration,
    max: usize,
) -> Option<Vec<MidiMessage>> {
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
            inner: Mutex::new(Inner {
                inputs: HashMap::new(),
                outputs: HashMap::new(),
                tx: None,
            }),
            dropped: Arc::new(AtomicU64::new(0)),
            emitted: Arc::new(AtomicU64::new(0)),
        }
    }
}

fn lock(state: &MidiState) -> Result<std::sync::MutexGuard<'_, Inner>, String> {
    state
        .inner
        .lock()
        .map_err(|_| "MIDI state poisoned".to_string())
}

/// Names in `open` that no longer appear among the ports the OS reports (device unplugged).
pub fn stale_names<'a>(open: impl Iterator<Item = &'a String>, present: &[String]) -> Vec<String> {
    let mut v: Vec<String> = open
        .filter(|n| !present.iter().any(|p| p == *n))
        .cloned()
        .collect();
    v.sort();
    v
}

/// A display name must identify exactly one port before a new connection can own it.
/// Failed name lookups remain unselectable; existing connections keep their captured ports.
fn unique_named_port<P>(
    ports: impl IntoIterator<Item = P>,
    name: &str,
    direction: &str,
    mut port_name: impl FnMut(&P) -> Option<String>,
) -> Result<P, String> {
    let mut matches = ports
        .into_iter()
        .filter(|p| port_name(p).map(|n| n == name).unwrap_or(false));
    let port = matches
        .next()
        .ok_or_else(|| format!("MIDI {direction} not found: {name}"))?;
    if matches.next().is_some() {
        return Err(format!("MIDI {direction} name is ambiguous: {name}"));
    }
    Ok(port)
}

fn input_names(mi: &MidiInput) -> Vec<String> {
    mi.ports()
        .iter()
        .filter_map(|p| mi.port_name(p).ok())
        .collect()
}

fn output_names(mo: &MidiOutput) -> Vec<String> {
    mo.ports()
        .iter()
        .filter_map(|p| mo.port_name(p).ok())
        .collect()
}

/// Drop (and close) every cached connection whose port has disappeared, so a replug reopens fresh.
fn prune_stale(inner: &mut Inner, inputs_present: &[String], outputs_present: &[String]) {
    for n in stale_names(inner.inputs.keys(), inputs_present) {
        if let Some(c) = inner.inputs.remove(&n) {
            c.close();
        }
    }
    for n in stale_names(inner.outputs.keys(), outputs_present) {
        if let Some(c) = inner.outputs.remove(&n) {
            c.close();
        }
    }
}

fn prune_with_os(inner: &mut Inner) {
    if let (Ok(mi), Ok(mo)) = (
        MidiInput::new("deckchek-prune-in"),
        MidiOutput::new("deckchek-prune-out"),
    ) {
        prune_stale(inner, &input_names(&mi), &output_names(&mo));
    }
}

fn background_failed(e: tauri::Error) -> String {
    format!("background task failed: {e}")
}

/// AUD-03: the OS MIDI stack can block for seconds while it enumerates drivers or opens a busy
/// port, so device commands run on tokio's blocking pool, never on the main (UI) thread.
/// `State<'_>` is not `'static`, so the blocking closure fetches the state from the `AppHandle`.
#[tauri::command]
pub async fn midi_list_ports(app: AppHandle) -> Result<PortList, String> {
    tauri::async_runtime::spawn_blocking(move || list_ports_blocking(&app.state::<MidiState>()))
        .await
        .map_err(background_failed)?
}

fn list_ports_blocking(state: &MidiState) -> Result<PortList, String> {
    let inp = MidiInput::new("deckchek-list-in").map_err(|e| e.to_string())?;
    let out = MidiOutput::new("deckchek-list-out").map_err(|e| e.to_string())?;
    let inputs = inp
        .ports()
        .iter()
        .enumerate()
        .map(|(index, p)| PortInfo {
            index,
            name: inp.port_name(p).unwrap_or_default(),
        })
        .collect();
    let outputs = out
        .ports()
        .iter()
        .enumerate()
        .map(|(index, p)| PortInfo {
            index,
            name: out.port_name(p).unwrap_or_default(),
        })
        .collect();
    if let Ok(mut inner) = lock(state) {
        let (i, o): (Vec<String>, Vec<String>) = (
            inp.ports()
                .iter()
                .filter_map(|p| inp.port_name(p).ok())
                .collect(),
            out.ports()
                .iter()
                .filter_map(|p| out.port_name(p).ok())
                .collect(),
        );
        prune_stale(&mut inner, &i, &o);
    }
    Ok(PortList { inputs, outputs })
}

/// Count only batches accepted by Tauri as emitted. A known event-delivery failure is
/// transport loss, just like a full host queue; the capture verdict reads `dropped`.
/// Acceptance by Tauri is not an acknowledgement that a renderer consumed the event.
fn emit_batch<E>(
    batch: Vec<MidiMessage>,
    emitted: &AtomicU64,
    dropped: &AtomicU64,
    emit: impl FnOnce(Vec<MidiMessage>) -> Result<(), E>,
) {
    let count = batch.len() as u64;
    match emit(batch) {
        Ok(()) => emitted.fetch_add(count, Ordering::Relaxed),
        Err(_) => dropped.fetch_add(count, Ordering::Relaxed),
    };
}

fn ensure_pump(
    inner: &mut Inner,
    app: AppHandle,
    emitted: Arc<AtomicU64>,
    dropped: Arc<AtomicU64>,
) -> SyncSender<MidiMessage> {
    if let Some(tx) = &inner.tx {
        return tx.clone();
    }
    let (tx, rx) = sync_channel::<MidiMessage>(QUEUE_CAPACITY);
    std::thread::spawn(move || {
        while let Some(batch) =
            collect_batch(&rx, Duration::from_millis(250), BATCH_WINDOW, BATCH_MAX)
        {
            if batch.is_empty() {
                continue;
            }
            emit_batch(batch, &emitted, &dropped, |messages| {
                app.emit("midi-message", messages)
            });
        }
    });
    inner.tx = Some(tx.clone());
    tx
}

#[tauri::command]
pub async fn midi_open_input(app: AppHandle, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        open_input_blocking(&app, &app.state::<MidiState>(), name)
    })
    .await
    .map_err(background_failed)?
}

fn open_input_blocking(app: &AppHandle, state: &MidiState, name: String) -> Result<(), String> {
    let mut inner = lock(state)?;
    let mut mi = MidiInput::new("deckchek-in").map_err(|e| e.to_string())?;
    mi.ignore(midir::Ignore::None);
    // A cached connection whose port vanished is dead: close it and reconnect (or report not found).
    let present = input_names(&mi);
    if inner.inputs.contains_key(&name) {
        let matches = present.iter().filter(|p| *p == &name).count();
        if matches > 1 {
            // Reject a new open request without closing another caller's captured connection.
            return Err(format!("MIDI input name is ambiguous: {name}"));
        }
        if matches == 1 {
            return Ok(());
        }
        if let Some(c) = inner.inputs.remove(&name) {
            c.close();
        }
    }
    let port = unique_named_port(mi.ports(), &name, "input", |p| mi.port_name(p).ok())?;
    let tx = ensure_pump(
        &mut inner,
        app.clone(),
        state.emitted.clone(),
        state.dropped.clone(),
    );
    let dropped = state.dropped.clone();
    let port_name = name.clone();
    let conn = mi
        .connect(
            &port,
            "deckchek-input",
            move |ts, bytes, _| {
                push_bounded(
                    &tx,
                    &dropped,
                    MidiMessage {
                        port: port_name.clone(),
                        timestamp_us: ts,
                        bytes: bytes.to_vec(),
                    },
                );
            },
            (),
        )
        .map_err(|e| e.to_string())?;
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
    for attempt in 0..2 {
        if !inner.outputs.contains_key(&name) {
            let conn = connect_output(&name)?;
            inner.outputs.insert(name.clone(), conn);
        }
        match inner.outputs.get_mut(&name).unwrap().send(&bytes) {
            Ok(()) => return Ok(()),
            Err(e) => {
                // The cached connection is stale (device unplugged/replugged): drop it and retry once.
                if let Some(c) = inner.outputs.remove(&name) {
                    c.close();
                }
                if attempt == 1 {
                    return Err(format!("MIDI send to {name} failed: {e}"));
                }
            }
        }
    }
    Err(format!("MIDI send to {name} failed"))
}

fn connect_output(name: &str) -> Result<MidiOutputConnection, String> {
    let mo = MidiOutput::new("deckchek-out").map_err(|e| e.to_string())?;
    let port = unique_named_port(mo.ports(), name, "output", |p| mo.port_name(p).ok())?;
    mo.connect(&port, "deckchek-output")
        .map_err(|e| e.to_string())
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
    let mut inner = lock(&state)?;
    prune_with_os(&mut inner);
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
    use super::stale_names;

    #[test]
    fn stale_names_lists_connections_whose_port_vanished() {
        let open = vec!["DDJ".to_string(), "Gone".to_string()];
        let present = vec!["DDJ".to_string(), "Other".to_string()];
        assert_eq!(stale_names(open.iter(), &present), vec!["Gone".to_string()]);
        assert!(stale_names(open.iter(), &open).is_empty());
    }

    use super::*;

    fn select_test_port(
        ports: &[(u8, Option<&str>)],
        name: &str,
        direction: &str,
    ) -> Result<u8, String> {
        unique_named_port(ports, name, direction, |p| p.1.map(str::to_owned)).map(|p| p.0)
    }

    #[test]
    fn duplicate_port_names_are_rejected_in_either_order() {
        for direction in ["input", "output"] {
            for ports in [
                [(11, Some("DDJ")), (33, Some("Other")), (22, Some("DDJ"))],
                [(22, Some("DDJ")), (33, Some("Other")), (11, Some("DDJ"))],
            ] {
                assert_eq!(
                    select_test_port(&ports, "DDJ", direction),
                    Err(format!("MIDI {direction} name is ambiguous: DDJ"))
                );
            }
        }
    }

    #[test]
    fn unique_port_name_selects_the_requested_port_among_unrelated_duplicates() {
        let ports = [(11, Some("Other")), (22, Some("DDJ")), (33, Some("Other"))];
        for direction in ["input", "output"] {
            assert_eq!(select_test_port(&ports, "DDJ", direction), Ok(22));
        }
    }

    #[test]
    fn missing_port_preserves_exact_name_matching_and_not_found_errors() {
        let ports = [(11, Some("ddj")), (22, Some("DDJ Pro")), (33, None)];
        for direction in ["input", "output"] {
            assert_eq!(
                select_test_port(&ports, "DDJ", direction),
                Err(format!("MIDI {direction} not found: DDJ"))
            );
            assert_eq!(
                select_test_port(&[], "DDJ", direction),
                Err(format!("MIDI {direction} not found: DDJ"))
            );
        }
    }

    #[test]
    fn failed_name_reads_remain_unselectable() {
        let ports = [(11, None), (22, Some("DDJ")), (33, None)];
        for direction in ["input", "output"] {
            assert_eq!(select_test_port(&ports, "DDJ", direction), Ok(22));
            assert_eq!(
                select_test_port(&ports, "", direction),
                Err(format!("MIDI {direction} not found: "))
            );
        }
    }

    #[test]
    fn successful_empty_names_require_the_same_uniqueness_as_other_names() {
        for direction in ["input", "output"] {
            assert_eq!(
                select_test_port(&[(11, None), (22, Some(""))], "", direction),
                Ok(22)
            );
            assert_eq!(
                select_test_port(&[(11, Some("")), (22, Some(""))], "", direction),
                Err(format!("MIDI {direction} name is ambiguous: "))
            );
        }
    }

    fn msg(i: u64) -> MidiMessage {
        MidiMessage {
            port: "p".into(),
            timestamp_us: i,
            bytes: vec![0x90, 1, 127],
        }
    }

    #[test]
    fn failed_event_delivery_counts_every_message_as_dropped() {
        let emitted = AtomicU64::new(7);
        let dropped = AtomicU64::new(11);
        emit_batch(vec![msg(1), msg(2)], &emitted, &dropped, |batch| {
            assert_eq!(batch, vec![msg(1), msg(2)]);
            Err("event delivery failed")
        });
        assert_eq!(emitted.load(Ordering::Relaxed), 7);
        assert_eq!(dropped.load(Ordering::Relaxed), 13);
    }

    #[test]
    fn accepted_event_delivery_preserves_existing_drop_count() {
        let emitted = AtomicU64::new(7);
        let dropped = AtomicU64::new(11);
        emit_batch(vec![msg(1), msg(2)], &emitted, &dropped, |batch| {
            assert_eq!(batch, vec![msg(1), msg(2)]);
            Ok::<(), &str>(())
        });
        assert_eq!(emitted.load(Ordering::Relaxed), 9);
        assert_eq!(dropped.load(Ordering::Relaxed), 11);
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
        let b =
            collect_batch(&rx, Duration::from_millis(50), Duration::from_millis(10), 4).unwrap();
        assert_eq!(b.len(), 4);
        assert_eq!(b[0].timestamp_us, 0);
        let b = collect_batch(
            &rx,
            Duration::from_millis(50),
            Duration::from_millis(10),
            100,
        )
        .unwrap();
        assert_eq!(b.len(), 6);
    }

    #[test]
    fn batch_idle_and_disconnect() {
        let (tx, rx) = sync_channel::<MidiMessage>(4);
        assert_eq!(
            collect_batch(&rx, Duration::from_millis(5), BATCH_WINDOW, 10)
                .unwrap()
                .len(),
            0
        );
        drop(tx);
        assert!(collect_batch(&rx, Duration::from_millis(5), BATCH_WINDOW, 10).is_none());
    }

    /// AUD-03: port listing and input open touch the OS MIDI stack, which can block for seconds
    /// (driver enumeration, a busy port). They must be `async` and do the work on the blocking
    /// pool, never on the main (UI) thread. Scans this file's own source.
    #[test]
    fn regression_aud_03_midi_device_commands_run_off_the_main_thread() {
        let src = include_str!("midi.rs");
        for name in ["midi_list_ports", "midi_open_input"] {
            assert!(
                !src.contains(&format!("pub fn {name}(")),
                "{name} is still a sync command on the main thread"
            );
            let head = format!("pub async fn {name}(");
            let at = src
                .find(&head)
                .unwrap_or_else(|| panic!("{name} must be `pub async fn`"));
            let body = &src[at..at + src[at..].find("\n}\n").expect("command body")];
            assert!(
                body.contains("spawn_blocking"),
                "{name} must run its body via spawn_blocking"
            );
        }
    }
}
