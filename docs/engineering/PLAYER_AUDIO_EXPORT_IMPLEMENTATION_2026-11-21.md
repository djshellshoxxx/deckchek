# Player captured-audio export preparation

Status: authored, unexecuted preparation for a fresh code, functional/bug-hunt
and static defensive security review. This extends the existing opt-in Player
capture preview. It does not change the qualified main, grant measurement
eligibility or clear the preceding full-source audio assertion hold.

## User flow and ownership

`Keep captured audio for local export` is unchecked by default. The screen
snapshots that choice with the input, pair, operator assertions and optional
reference descriptor before capture begins. The default path does not read
`captured.audio`; its JSON export and Ctrl+E retain the three existing metadata
fields. The feature itself remains default-off.

When retention is selected, the existing acquisition owner closes its native
input before local archive preparation starts. A successful archive enables
`Export capture audio`. No download happens until that action is selected.
Each download receives independent bytes; the screen reports a download request,
not confirmed filesystem persistence. A preparation failure keeps capture details
available and explains why audio export is unavailable.

The screen holds only the optional bounded archive after preparation, not the
mutable capture arrays. Clear, a new capture, reference changes, navigation,
feature disable and disposal invalidate the retained result. Cancellation and
the existing request identity guard suppress a late archive. This is logical
ownership/cancellation; asynchronous hashing is not physically aborted and no
immediate memory zeroization or garbage-collection guarantee is made. Nothing is
uploaded, added to History, written to application storage or put in a diagnostic
report by this flow.

## Archive contract

The generated ZIP has four fixed entries, independent of operator filenames:

| Entry | Contents |
| --- | --- |
| `manifest.json` | `deckchek.player-audio-export.v1`, capture/run identity, format, frame count, nominal rate, pair and SHA-256/length of the other three entries |
| `capture.json` | Snapshotted acquisition and normalized provisional record, plus the optional selected reference descriptor |
| `audio/primary.f32le` | Headerless interleaved left/right IEEE-754 float32, little-endian, exactly eight bytes per returned frame |
| `README.txt` | Format interpretation and qualification limits |

The PCM contains the normalized values returned by the capture adapter. It is
not the original ADC/device byte stream. Export performs no resampling, scaling
or clipping; negative zero is preserved. A reported mono source still retains
both returned channels and is explicitly labeled mono in the manifest. There is
no claim that this is a self-playing WAV file; format metadata is part of the
archive contract.

The helper requires matching run/capture identities, observed frame counts,
finite Float32 channels, nominal rate, primary pair descriptor, capture time and
evidence record. Missing native observations cannot be supplied by compatibility
defaults. Other quality faults remain exportable and stay visible: an incomplete
capture does not become complete by being saved. Metadata is copied before the
first await, so later mutation of caller-owned samples or records does not change
the archive being hashed.

`rawEvidenceRefs` name the archived PCM only in the archive's copied metadata;
the original in-memory acquisition remains `ephemeral_audio_only` with empty
references. Normalizing the copied record rebuilds its unverified qualification
and cannot accept caller-supplied report eligibility. Hashes check content
identity, not hardware authenticity, clock accuracy, reference playback,
continuity or pitch. The selected reference must match the record's SHA-256;
reference-file bytes are never included.

## Bounds and trust boundary

PCM is capped at 18 MiB before the interleaved allocation. The shared ZIP writer's
existing 20 MiB total limit is unchanged. Higher rates or longer captures can
exceed the PCM limit; the screen offers a shorter capture and still exports
metadata. All strings/arrays/object traversal are bounded before JSON encoding,
and the resulting capture metadata is capped at 128 KiB. Oversized metadata
refuses audio packaging without discarding the existing metadata-only result.
Only own data fields in plain JSON metadata are copied; accessors, shared sample
buffers and non-finite values are rejected. There is no new archive import,
extraction, native command, filesystem path permission or network boundary.

Device names, driver messages and operator assertions are intentionally present
in this explicit local export, as described by the screen. This feature does not
claim to close the separate diagnostic-export privacy requirement in issue #69.

## Authored verification and remaining work

The new unit source exercises the real acquisition/adapter pipeline and reads
ZIP central/local records independently. It checks a fixed expected PCM byte
sequence, Node crypto hashes, source snapshots, mono labeling, reference
metadata, retained faults, compatibility refusals, exact/over-size limits and
cancellation. Screen regressions cover the default no-audio path, actual optional
archive preparation, metadata-only Ctrl+E, independent download bytes, failed
preparation, captured consent and late results after cancellation/hide/disposal.

The authored hosted browser smoke retains the existing default capture and
ownership cases, then downloads an opted-in audio archive through the real
screen. Its independent ZIP reader and SHA-256 checks examine the delivered
bytes and modeled native samples. The added checkbox has a 24px target using the
existing theme. At the author preparation these sources were unexecuted. The subsequent frozen
`445a66e` first seven-file gate passed 111/111, including all 19 new cases; the
first smoke syntax check also passed. All three independent reports and complete
original evidence are consolidated in the [completed handoff](PLAYER_AUDIO_EXPORT_CONTINUATION_2026-11-21.md).
The smoke remains unexecuted in a browser. Its syntax pass does not establish
browser layout, native-platform behavior or hardware capture. The preceding
complete-source audio failure remains held.

Raw-reference retention, scientifically qualified pitch analysis, report/History
integration and physical capture/reference validation remain incomplete. This
step supplies a bounded local transport for provisional captured samples only.
