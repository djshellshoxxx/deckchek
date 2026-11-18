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
    pub port_id: String,
    pub timestamp_us: u64,
    pub bytes: Vec<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInfo {
    pub index: usize,
    pub name: String,
    pub id: String,
    pub name_available: bool,
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
    pub open_input_ids: Vec<String>,
    pub open_output_ids: Vec<String>,
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
    input_generations: Mutex<InputGenerations>,
    dropped: Arc<AtomicU64>,
    emitted: Arc<AtomicU64>,
}

/// Short-lived request bookkeeping is separate from the lock held while drivers open.
/// A close invalidates work already dispatched to the blocking pool, even if that
/// work has not acquired the connection lock yet.
#[derive(Default)]
struct InputGenerations {
    all: u64,
    ports: HashMap<String, u64>,
    serial: u64,
    names: HashMap<String, String>,
    aliases: HashMap<String, String>,
    legacy_closes: HashMap<String, u64>,
}

impl InputGenerations {
    fn for_port(&self, name: &str) -> (u64, u64) {
        (self.all, self.ports.get(name).copied().unwrap_or(0))
    }

    fn started(&self) -> (u64, u64) {
        (self.all, self.serial)
    }

    fn current(&self, started: (u64, u64), name: Option<&str>, id: Option<&str>) -> bool {
        self.all == started.0
            && name.is_none_or(|name| self.for_port(&format!("name:{name}")).1 <= started.1)
            && id.is_none_or(|id| self.for_port(&format!("id:{id}")).1 <= started.1)
    }

    fn current_request(&self, started: (u64, u64), name: Option<&str>, id: Option<&str>) -> bool {
        self.current(started, name, id)
            && name
                .is_none_or(|name| self.legacy_closes.get(name).copied().unwrap_or(0) <= started.1)
    }

    fn close_input(&mut self, key: &str) {
        self.serial = self.serial.wrapping_add(1);
        self.ports.insert(key.to_owned(), self.serial);
    }

    fn close_selector(
        &mut self,
        name: Option<&str>,
        id: Option<&str>,
    ) -> Result<Option<String>, String> {
        let captured = if let Some(id) = id {
            Some(id.to_owned())
        } else if let Some(name) = name {
            if let Some(id) = self.aliases.get(name) {
                Some(id.clone())
            } else {
                let matches: Vec<_> = self
                    .names
                    .iter()
                    .filter(|(_, label)| label.as_str() == name)
                    .collect();
                if matches.len() > 1 {
                    return Err(format!("MIDI input name is ambiguous: {name}"));
                }
                matches.first().map(|(id, _)| (*id).clone())
            }
        } else {
            None
        };
        if let Some(id) = &captured {
            self.close_input(&format!("id:{id}"));
        } else if let Some(name) = name {
            // An unresolved legacy request checks this mark after it discovers its ID.
            self.close_input(&format!("name:{name}"));
        }
        if let Some(name) = name {
            // Original name requests stay canceled after the captured alias is forgotten.
            // Explicit ID requests do not consult this separate intent mark.
            self.legacy_closes.insert(name.to_owned(), self.serial);
        }
        Ok(captured)
    }

    fn forget(&mut self, id: &str) {
        self.names.remove(id);
        self.aliases.retain(|_, captured| captured != id);
    }

    fn close_all(&mut self) {
        self.all = self.all.wrapping_add(1);
        self.serial = self.serial.wrapping_add(1);
        self.ports.clear();
        self.names.clear();
        self.aliases.clear();
        self.legacy_closes.clear();
    }
}

struct InputBinding {
    connection: MidiInputConnection<()>,
    name: String,
    started: (u64, u64),
}

struct Inner {
    inputs: HashMap<String, InputBinding>,
    // None retains a failed/disappeared binding until an explicit reset. Old
    // Note Off cleanup must never reconnect to a new device with the same name.
    outputs: HashMap<String, Option<MidiOutputConnection>>,
    output_names: HashMap<String, String>,
    output_aliases: HashMap<String, String>,
    tx: Option<SyncSender<MidiMessage>>,
}

impl Default for MidiState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Inner {
                inputs: HashMap::new(),
                outputs: HashMap::new(),
                output_names: HashMap::new(),
                output_aliases: HashMap::new(),
                tx: None,
            }),
            input_generations: Mutex::new(InputGenerations::default()),
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

fn input_generations(
    state: &MidiState,
) -> Result<std::sync::MutexGuard<'_, InputGenerations>, String> {
    state
        .input_generations
        .lock()
        .map_err(|_| "MIDI request state poisoned".to_string())
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

struct SelectedPort<P> {
    port: P,
    id: String,
    name: String,
    unique_name: bool,
}

fn validate_selector(name: Option<&str>, id: Option<&str>) -> Result<(), String> {
    if id.is_some_and(str::is_empty) {
        return Err("MIDI logical ID must be a non-empty string".to_owned());
    }
    if name.is_none() && id.is_none() {
        return Err("MIDI selection requires a name or logical ID".to_owned());
    }
    Ok(())
}

/// Both forms share one ID-keyed connection. If a legacy name also supplies an expected
/// ID, recheck both; enumeration changing between frontend and driver cannot retarget it.
fn selected_port<P>(
    ports: impl IntoIterator<Item = P>,
    name: Option<&str>,
    id: Option<&str>,
    direction: &str,
    mut port_name: impl FnMut(&P) -> Option<String>,
    mut port_id: impl FnMut(&P) -> String,
) -> Result<SelectedPort<P>, String> {
    validate_selector(name, id)?;
    let mut entries: Vec<_> = ports
        .into_iter()
        .map(|port| {
            let id = port_id(&port);
            let name = port_name(&port);
            (port, id, name)
        })
        .collect();
    let index = if let Some(name) = name {
        unique_named_port(0..entries.len(), name, direction, |i| entries[*i].2.clone())?
    } else {
        let id = id.expect("validated ID selector");
        let matches: Vec<_> = entries
            .iter()
            .enumerate()
            .filter(|(_, p)| p.1 == id)
            .map(|(i, _)| i)
            .collect();
        if matches.is_empty() {
            return Err(format!("MIDI {direction} ID not found: {id}"));
        }
        if matches.len() != 1 {
            return Err(format!("MIDI {direction} ID is ambiguous: {id}"));
        }
        matches[0]
    };
    let selected_id = &entries[index].1;
    if selected_id.is_empty() || entries.iter().filter(|p| p.1 == *selected_id).count() != 1 {
        return Err(format!(
            "MIDI {direction} ID is unavailable or ambiguous: {selected_id}"
        ));
    }
    if id.is_some_and(|expected| expected != selected_id) {
        return Err(format!("MIDI {direction} changed after enumeration"));
    }
    let selected_name = entries[index]
        .2
        .as_ref()
        .ok_or_else(|| format!("MIDI {direction} name is unavailable: {selected_id}"))?;
    let unique_name = entries
        .iter()
        .filter(|p| p.2.as_ref() == Some(selected_name))
        .count()
        == 1;
    let (port, id, name) = entries.swap_remove(index);
    Ok(SelectedPort {
        port,
        id,
        name: name.expect("readable selected name"),
        unique_name,
    })
}

fn present_ids<P>(
    ports: impl IntoIterator<Item = P>,
    mut id: impl FnMut(&P) -> String,
    mut readable: impl FnMut(&P) -> bool,
) -> Vec<String> {
    let entries: Vec<_> = ports.into_iter().map(|p| (id(&p), readable(&p))).collect();
    entries
        .iter()
        .filter(|(id, readable)| {
            *readable && !id.is_empty() && entries.iter().filter(|p| p.0 == *id).count() == 1
        })
        .map(|p| p.0.clone())
        .collect()
}

/// Close vanished inputs and retire vanished outputs without forgetting captured aliases.
fn prune_stale(inner: &mut Inner, inputs_present: &[String], outputs_present: &[String]) {
    for id in stale_names(inner.inputs.keys(), inputs_present) {
        if let Some(c) = inner.inputs.remove(&id) {
            c.connection.close();
        }
    }
    for id in stale_names(inner.outputs.keys(), outputs_present) {
        if let Some(c) = inner.outputs.get_mut(&id).and_then(Option::take) {
            c.close();
        }
    }
}

fn prune_with_os(inner: &mut Inner) {
    if let (Ok(mi), Ok(mo)) = (
        MidiInput::new("deckchek-prune-in"),
        MidiOutput::new("deckchek-prune-out"),
    ) {
        prune_stale(
            inner,
            &present_ids(mi.ports(), |p| p.id(), |p| mi.port_name(p).is_ok()),
            &present_ids(mo.ports(), |p| p.id(), |p| mo.port_name(p).is_ok()),
        );
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
        .map(|(index, p)| {
            let name = inp.port_name(p).ok();
            PortInfo {
                index,
                id: p.id(),
                name_available: name.is_some(),
                name: name.unwrap_or_default(),
            }
        })
        .collect();
    let outputs = out
        .ports()
        .iter()
        .enumerate()
        .map(|(index, p)| {
            let name = out.port_name(p).ok();
            PortInfo {
                index,
                id: p.id(),
                name_available: name.is_some(),
                name: name.unwrap_or_default(),
            }
        })
        .collect();
    if let Ok(mut inner) = lock(state) {
        prune_stale(
            &mut inner,
            &present_ids(inp.ports(), |p| p.id(), |p| inp.port_name(p).is_ok()),
            &present_ids(out.ports(), |p| p.id(), |p| out.port_name(p).is_ok()),
        );
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
pub async fn midi_open_input(
    app: AppHandle,
    name: Option<String>,
    id: Option<String>,
) -> Result<(), String> {
    validate_selector(name.as_deref(), id.as_deref())?;
    let generation = input_generations(&app.state::<MidiState>())?.started();
    tauri::async_runtime::spawn_blocking(move || {
        open_input_blocking(&app, &app.state::<MidiState>(), name, id, generation)
    })
    .await
    .map_err(background_failed)?
}

fn open_input_blocking(
    app: &AppHandle,
    state: &MidiState,
    name: Option<String>,
    id: Option<String>,
    generation: (u64, u64),
) -> Result<(), String> {
    let mut inner = lock(state)?;
    if !input_generations(state)?.current_request(generation, name.as_deref(), id.as_deref()) {
        return Err("MIDI input open was cancelled because its connection was closed".to_owned());
    }
    let mut mi = MidiInput::new("deckchek-in").map_err(|e| e.to_string())?;
    mi.ignore(midir::Ignore::None);
    let selected = selected_port(
        mi.ports(),
        name.as_deref(),
        id.as_deref(),
        "input",
        |p| mi.port_name(p).ok(),
        |p| p.id(),
    )?;
    {
        let mut generations = input_generations(state)?;
        // An unresolved name close cannot identify one of several explicitly selected IDs.
        let cancellation_name = selected.unique_name.then_some(selected.name.as_str());
        if !generations.current(generation, cancellation_name, Some(&selected.id))
            || !generations.current_request(generation, name.as_deref(), Some(&selected.id))
        {
            return Err(
                "MIDI input open was cancelled because its connection was closed".to_owned(),
            );
        }
        if name.is_some()
            && generations
                .aliases
                .get(&selected.name)
                .is_some_and(|old| old != &selected.id)
        {
            return Err(format!(
                "MIDI input changed: {}. Close it before opening the replacement.",
                selected.name
            ));
        }
        generations
            .names
            .insert(selected.id.clone(), selected.name.clone());
        if selected.unique_name {
            generations
                .aliases
                .entry(selected.name.clone())
                .or_insert_with(|| selected.id.clone());
        }
    }
    if let Some(binding) = inner.inputs.get_mut(&selected.id) {
        // Reusing a captured connection transfers its ownership to the newest successful request.
        // A still-valid older request arriving later must not restore an earlier generation.
        binding.started = binding.started.max(generation);
        return Ok(());
    }
    let tx = ensure_pump(
        &mut inner,
        app.clone(),
        state.emitted.clone(),
        state.dropped.clone(),
    );
    let dropped = state.dropped.clone();
    let port_name = selected.name.clone();
    let port_id = selected.id.clone();
    let conn = mi
        .connect(
            &selected.port,
            "deckchek-input",
            move |ts, bytes, _| {
                push_bounded(
                    &tx,
                    &dropped,
                    MidiMessage {
                        port: port_name.clone(),
                        port_id: port_id.clone(),
                        timestamp_us: ts,
                        bytes: bytes.to_vec(),
                    },
                );
            },
            (),
        )
        .map_err(|e| e.to_string());
    match conn {
        Ok(connection) => {
            inner.inputs.insert(
                selected.id,
                InputBinding {
                    connection,
                    name: selected.name,
                    started: generation,
                },
            );
            Ok(())
        }
        Err(error) => {
            input_generations(state)?.forget(&selected.id);
            Err(error)
        }
    }
}

/// Input-only close. Equal raw IDs in the output direction are unrelated owners.
#[tauri::command]
pub fn midi_close_input(
    state: State<'_, MidiState>,
    name: Option<String>,
    id: Option<String>,
) -> Result<(), String> {
    validate_selector(name.as_deref(), id.as_deref())?;
    let (captured, closed_at) = {
        let mut generations = input_generations(&state)?;
        let captured = generations.close_selector(name.as_deref(), id.as_deref())?;
        (captured, generations.started())
    };
    let mut inner = lock(&state)?;
    if let Some(id) = captured {
        // A newer direct native request may win the connection lock after this close was dispatched.
        // Close only the captured generation; the frontend also waits on the canonical close barrier.
        let old = inner
            .inputs
            .get(&id)
            .is_none_or(|binding| binding.started < closed_at);
        if old {
            if let Some(binding) = inner.inputs.remove(&id) {
                binding.connection.close();
            }
            input_generations(&state)?.forget(&id);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn midi_send(
    state: State<'_, MidiState>,
    name: Option<String>,
    id: Option<String>,
    bytes: Vec<u8>,
) -> Result<(), String> {
    validate_selector(name.as_deref(), id.as_deref())?;
    let mut inner = lock(&state)?;
    let captured = id.clone().or_else(|| {
        name.as_ref()
            .and_then(|name| inner.output_aliases.get(name).cloned())
    });
    if let Some(key) = captured.filter(|key| inner.outputs.contains_key(key)) {
        return send_on_captured_output(
            &mut inner.outputs,
            &key,
            || unreachable!("captured output already exists"),
            |connection| connection.send(&bytes).map_err(|error| error.to_string()),
            |connection| {
                connection.close();
            },
        );
    }
    let mo = MidiOutput::new("deckchek-out").map_err(|e| e.to_string())?;
    let selected = selected_port(
        mo.ports(),
        name.as_deref(),
        id.as_deref(),
        "output",
        |p| mo.port_name(p).ok(),
        |p| p.id(),
    )?;
    let key = selected.id.clone();
    let result = send_on_captured_output(
        &mut inner.outputs,
        &key,
        || {
            mo.connect(&selected.port, "deckchek-output")
                .map_err(|e| e.to_string())
        },
        |connection| connection.send(&bytes).map_err(|error| error.to_string()),
        |connection| {
            connection.close();
        },
    );
    if inner.outputs.contains_key(&key) {
        inner
            .output_names
            .insert(key.clone(), selected.name.clone());
        if selected.unique_name {
            inner.output_aliases.entry(selected.name).or_insert(key);
        }
    }
    result
}

/// Bind only on a first send. Known loss requires an explicit reset, never a
/// retry by display name; subsequent cleanup still belongs to the old device.
fn send_on_captured_output<C>(
    outputs: &mut HashMap<String, Option<C>>,
    name: &str,
    connect: impl FnOnce() -> Result<C, String>,
    send: impl FnOnce(&mut C) -> Result<(), String>,
    close: impl FnOnce(C),
) -> Result<(), String> {
    let output = match outputs.entry(name.to_owned()) {
        std::collections::hash_map::Entry::Occupied(entry) => entry.into_mut(),
        std::collections::hash_map::Entry::Vacant(entry) => entry.insert(Some(connect()?)),
    };
    let connection = output.as_mut().ok_or_else(|| {
        format!("MIDI output {name} is unavailable. Restart DeckChek to reset MIDI connections before using a reconnected or replacement output.")
    })?;
    if let Err(error) = send(connection) {
        if let Some(connection) = output.take() {
            close(connection);
        }
        return Err(format!("MIDI send to {name} failed: {error}. Restart DeckChek to reset MIDI connections before using a reconnected or replacement output."));
    }
    Ok(())
}

#[tauri::command]
pub fn midi_close_all(state: State<'_, MidiState>) -> Result<(), String> {
    input_generations(&state)?.close_all();
    let mut inner = lock(&state)?;
    for (_, c) in inner.inputs.drain() {
        c.connection.close();
    }
    inner.output_names.clear();
    inner.output_aliases.clear();
    for (_, c) in inner.outputs.drain() {
        if let Some(c) = c {
            c.close();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn midi_status(state: State<'_, MidiState>) -> Result<MidiStatus, String> {
    let mut inner = lock(&state)?;
    prune_with_os(&mut inner);
    let mut open_inputs: Vec<String> = inner.inputs.values().map(|p| p.name.clone()).collect();
    let mut open_input_ids: Vec<String> = inner.inputs.keys().cloned().collect();
    let mut open_output_ids: Vec<String> = inner
        .outputs
        .iter()
        .filter(|(_, c)| c.is_some())
        .map(|(id, _)| id.clone())
        .collect();
    let mut open_outputs: Vec<String> = open_output_ids
        .iter()
        .filter_map(|id| inner.output_names.get(id).cloned())
        .collect();
    open_inputs.sort();
    open_outputs.sort();
    open_input_ids.sort();
    open_output_ids.sort();
    Ok(MidiStatus {
        open_inputs,
        open_outputs,
        open_input_ids,
        open_output_ids,
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

    #[test]
    fn input_close_invalidates_pending_requests_only_for_its_port() {
        let mut generations = InputGenerations::default();
        let first_a = generations.for_port("A");
        let second_a = generations.for_port("A");
        let other_b = generations.for_port("B");
        generations.close_input("A");
        assert_ne!(generations.for_port("A"), first_a);
        assert_ne!(generations.for_port("A"), second_a);
        assert_eq!(generations.for_port("B"), other_b);
        let replacement_a = generations.for_port("A");
        generations.close_input("B");
        assert_eq!(generations.for_port("A"), replacement_a);
        assert_ne!(generations.for_port("B"), other_b);
    }

    #[test]
    fn close_all_invalidates_pending_requests_and_permits_new_generations() {
        let mut generations = InputGenerations::default();
        generations.close_input("A");
        let old_a = generations.for_port("A");
        let old_b = generations.for_port("B");
        generations.close_all();
        let new_a = generations.for_port("A");
        let new_b = generations.for_port("B");
        assert_ne!(new_a, old_a);
        assert_ne!(new_b, old_b);
        generations.close_input("A");
        assert_ne!(generations.for_port("A"), old_a);
        assert_ne!(generations.for_port("A"), new_a);
        assert_eq!(generations.for_port("B"), new_b);
    }

    #[test]
    fn failed_output_retains_ownership_until_reset() {
        let mut outputs = HashMap::new();
        let mut sent = Vec::new();
        send_on_captured_output(
            &mut outputs,
            "A",
            || Ok(11_u8),
            |connection| {
                sent.push(*connection);
                Ok(())
            },
            |_| panic!("successful output must stay open"),
        )
        .unwrap();
        let mut closed = Vec::new();
        let failure = send_on_captured_output(
            &mut outputs,
            "A",
            || panic!("cached output must keep its connection"),
            |connection| {
                assert_eq!(*connection, 11);
                Err("disconnected".into())
            },
            |connection| closed.push(connection),
        )
        .unwrap_err();
        assert!(failure.contains("Restart DeckChek"));
        assert_eq!(closed, vec![11]);
        assert_eq!(outputs.get("A"), Some(&None));
        for _ in 0..3 {
            assert!(send_on_captured_output(
                &mut outputs,
                "A",
                || panic!("cleanup must not reconnect to a replacement"),
                |_| panic!("no captured output remains"),
                |_| panic!("the old output was already closed"),
            )
            .is_err());
        }
        outputs.clear();
        send_on_captured_output(
            &mut outputs,
            "A",
            || Ok(22),
            |connection| {
                sent.push(*connection);
                Ok(())
            },
            |_| panic!("fresh output must stay open"),
        )
        .unwrap();
        assert_eq!(sent, vec![11, 22]);
    }

    #[test]
    fn unavailable_output_does_not_block_another_port_or_retry_before_binding() {
        let mut outputs = HashMap::from([("A".to_owned(), None)]);
        assert!(send_on_captured_output(
            &mut outputs,
            "B",
            || Err("not connected yet".into()),
            |_: &mut u8| panic!("no connection exists"),
            |_| panic!("no connection exists"),
        )
        .is_err());
        assert!(!outputs.contains_key("B"));
        for _ in 0..2 {
            send_on_captured_output(
                &mut outputs,
                "B",
                || Ok(33),
                |connection| {
                    assert_eq!(*connection, 33);
                    Ok(())
                },
                |_| panic!("successful output must stay open"),
            )
            .unwrap();
        }
        assert_eq!(outputs.get("A"), Some(&None));
        assert_eq!(outputs.get("B"), Some(&Some(33)));
    }

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

    fn logical_test_port(
        ports: &[(u8, &str, Option<&str>)],
        name: Option<&str>,
        id: Option<&str>,
    ) -> Result<u8, String> {
        selected_port(
            ports,
            name,
            id,
            "input",
            |p| p.2.map(str::to_owned),
            |p| p.1.to_owned(),
        )
        .map(|p| p.port.0)
    }

    #[test]
    fn logical_id_selects_duplicate_names_independently_of_enumeration_order() {
        for ports in [
            [
                (11, "first", Some("USB MIDI")),
                (22, "second", Some("USB MIDI")),
            ],
            [
                (22, "second", Some("USB MIDI")),
                (11, "first", Some("USB MIDI")),
            ],
        ] {
            assert_eq!(logical_test_port(&ports, None, Some("second")), Ok(22));
            assert!(logical_test_port(&ports, Some("USB MIDI"), None)
                .unwrap_err()
                .contains("name is ambiguous"));
            assert!(logical_test_port(&ports, Some("USB MIDI"), Some("second"))
                .unwrap_err()
                .contains("name is ambiguous"));
        }
    }

    #[test]
    fn logical_id_never_falls_back_to_a_replacement_name_or_an_enumeration_index() {
        let ports = [(22, "replacement", Some("USB MIDI"))];
        assert!(logical_test_port(&ports, None, Some("original"))
            .unwrap_err()
            .contains("ID not found"));
        assert!(
            logical_test_port(&ports, Some("USB MIDI"), Some("original"))
                .unwrap_err()
                .contains("changed")
        );
        assert!(logical_test_port(&ports, None, Some("0")).is_err());
        assert_eq!(
            logical_test_port(&[(22, "0", Some("USB MIDI"))], None, Some("0")),
            Ok(22)
        );
    }

    #[test]
    fn logical_ids_reject_empty_colliding_and_unreadable_metadata() {
        assert!(logical_test_port(&[(11, "", Some("A"))], None, Some("")).is_err());
        for ports in [
            [(11, "same", Some("A")), (22, "same", Some("B"))],
            [(11, "same", Some("A")), (22, "same", None)],
        ] {
            assert!(logical_test_port(&ports, None, Some("same"))
                .unwrap_err()
                .contains("ambiguous"));
            assert!(logical_test_port(&ports, Some("A"), None)
                .unwrap_err()
                .contains("ambiguous"));
        }
        assert!(logical_test_port(&[(11, "one", None)], None, Some("one"))
            .unwrap_err()
            .contains("name is unavailable"));
        assert_eq!(
            logical_test_port(&[(11, "one", Some(""))], None, Some("one")),
            Ok(11)
        );
    }

    #[test]
    fn captured_name_alias_and_id_share_cancellation_without_closing_a_namesake() {
        let mut generations = InputGenerations::default();
        generations.names.insert("first".into(), "A".into());
        generations.names.insert("second".into(), "A".into());
        generations.aliases.insert("A".into(), "first".into());
        let before = generations.started();
        assert_eq!(
            generations.close_selector(Some("A"), None).unwrap(),
            Some("first".into())
        );
        assert!(!generations.current(before, Some("A"), Some("first")));
        assert!(generations.current(before, Some("A"), Some("second")));
        let after = generations.started();
        assert!(generations.current(after, Some("A"), Some("first")));
    }

    #[test]
    fn unresolved_legacy_close_is_checked_again_after_id_resolution() {
        let mut generations = InputGenerations::default();
        let before = generations.started();
        assert_eq!(generations.close_selector(Some("A"), None).unwrap(), None);
        assert!(!generations.current(before, Some("A"), Some("one")));
        assert!(generations.current(before, Some("B"), Some("two")));
        assert!(generations.current(generations.started(), Some("A"), Some("one")));
    }

    #[test]
    fn uncaptured_duplicate_name_close_cannot_choose_an_arbitrary_id() {
        let mut generations = InputGenerations::default();
        generations.names.insert("one".into(), "A".into());
        generations.names.insert("two".into(), "A".into());
        let before = generations.started();
        assert!(generations
            .close_selector(Some("A"), None)
            .unwrap_err()
            .contains("ambiguous"));
        assert_eq!(generations.started(), before);
    }

    #[test]
    fn captured_legacy_intent_survives_alias_forget_and_spares_explicit_ids() {
        let mut generations = InputGenerations::default();
        generations.names.insert("first".into(), "A".into());
        generations.aliases.insert("A".into(), "first".into());
        let before = generations.started();
        assert_eq!(
            generations.close_selector(Some("A"), None).unwrap(),
            Some("first".into())
        );
        generations.forget("first");
        assert!(generations.aliases.is_empty());
        assert!(generations.current(before, Some("A"), Some("replacement")));
        assert!(!generations.current_request(before, Some("A"), None));
        assert!(!generations.current_request(before, Some("A"), Some("replacement")));
        assert!(generations.current_request(before, None, Some("replacement")));
        assert!(!generations.current_request(before, None, Some("first")));
        assert!(generations.current_request(before, Some("B"), Some("replacement")));

        let after = generations.started();
        assert!(generations.current_request(after, Some("A"), Some("replacement")));
        generations.close_all();
        assert!(!generations.current_request(after, None, Some("replacement")));
        assert!(generations.current_request(generations.started(), Some("A"), Some("replacement")));
    }

    fn msg(i: u64) -> MidiMessage {
        MidiMessage {
            port: "p".into(),
            port_id: "p-id".into(),
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
        assert_midi_device_commands_off_main_thread(include_str!("midi.rs"));
    }

    fn assert_midi_device_commands_off_main_thread(src: &str) {
        // include_str! retains CRLF from Windows checkouts.
        let src = src.replace("\r\n", "\n");
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

    #[test]
    fn regression_aud_03_midi_source_guard_accepts_crlf_and_rejects_unsafe_commands() {
        let fixture = concat!(
            "pub async fn midi_list_ports() {\n    spawn_blocking(|| midi_list_ports());\n}\n",
            "pub async fn midi_open_input() {\n    spawn_blocking(|| midi_open_input());\n}\n",
        );
        for src in [fixture.to_owned(), fixture.replace('\n', "\r\n")] {
            assert_midi_device_commands_off_main_thread(&src);
            for name in ["midi_list_ports", "midi_open_input"] {
                for unsafe_src in [
                    src.replace(&format!("pub async fn {name}("), &format!("pub fn {name}(")),
                    src.replace(
                        &format!("pub async fn {name}("),
                        "pub async fn other_command(",
                    ),
                    src.replace(
                        &format!("spawn_blocking(|| {name}())"),
                        &format!("{name}()"),
                    ),
                ] {
                    assert!(
                        std::panic::catch_unwind(|| {
                            assert_midi_device_commands_off_main_thread(&unsafe_src)
                        })
                        .is_err(),
                        "unsafe {name} must still be rejected"
                    );
                }
            }
        }
    }
}
