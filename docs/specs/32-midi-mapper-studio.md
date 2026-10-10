# SPEC-32 MIDI Mapper Studio

> **Reconciled (2026-10-10).** Shared pieces live in [FS-00 shared foundations](00-shared-foundations.md); index: [00-INDEX](00-INDEX.md). Migration: `0020_mapper_models.sql`. Milestone: M8. Size: L. Notation: `SPEC-NN` = architecture doc `docs/SPEC-NN-*.md`; `FS-NN` (or "spec NN") = feature spec `docs/specs/NN-*.md`. Feature flags use the FS-00 registry (`features.<name>`).

Status: draft. Packaging: **inside DeckChek** (new "Mapper" screen; pure JS converters in `app/mapper/`, file I/O via existing Tauri dialog/fs commands).

## 1. Summary, Goals / Non-goals
Turns a controller's learned MIDI map (`asset_midi_map`, `midi-tests.js` coverage sessions) or an official device profile into mappings importable by DJ software, via a neutral DeckChek mapping model. Phase 1 targets Mixxx and VirtualDJ (documented formats); Serato is experimental; Traktor is a human-readable mapping report, with .tsi writing explicitly out of scope until proven.

Goals: neutral model, editor, validation, deterministic export, import of Mixxx/VDJ files back into the model (round-trip). Non-goals: authoring complex scripted behaviour (jog scratch, LED feedback state machines) beyond templates; bundling third-party mappings (licence); modifying DJ software installs automatically (user copies file, we show the path).

## 2. Users & stories
- AC-1 Given a controller with a learned map, When I choose Export > Mixxx, Then I receive a `.midi.xml` that Mixxx loads and whose play/cue/sync/pitch/hotcue/loop controls fire the intended `[ChannelN]` controls.
- AC-2 Given the same map, When I export VirtualDJ, Then I get a definition/mapper pair (section 5) with VDJscript actions.
- AC-3 Given an existing Mixxx or VDJ file, When I import it, Then controls are recognised into the neutral model or listed as "unmapped/custom (preserved)".
- AC-4 Given conflicting bindings (same status+data1 twice), Then validation blocks export and highlights both.
- AC-5 Given export then re-import, Then the neutral model is equal after normalisation (round-trip test).
- AC-6 Given Traktor or Serato selected, Then I see an "Experimental/Report" label and a markdown/HTML mapping report for manual entry in the DJ software's own mapper.
- AC-7 Given the owner's DDJ model unknown, Then the editor works from a learned map without an official profile.

## 3. UX
Entry: Devices > a controller > "Mapping..." and nav "Mapper". Three panes: left Control list (from profile/learned map, with MIDI type/channel/number and a "Learn" button using `midi.js` `onMessage`); centre Function assignment (searchable vocabulary, deck selector 1-4, modifier shift layer); right Export (target dropdown, validation list, preview of generated file, Save...).
States: empty ("No MIDI map for this device. Learn controls or pick an official profile"), loading, success ("Saved. Copy to: Documents/..."), partial (unmapped controls count), error (parse failure with line/column), offline (n/a), unsupported (no MIDI API: reuse `midi.js` backend message). Targets with status chips: Mixxx (Supported), VirtualDJ (Supported), Serato (Experimental), Traktor (Report only). Keyboard: arrow keys move in list, `Enter` assign, `L` learn, `Ctrl+S` export, `Ctrl+Z` undo. Accessibility: table semantics, validation errors in `aria-live`, not colour-only.

## 4. Architecture
Files: `app/mapper/model.js`, `vocabulary.js`, `validate.js`, `from-learned.js`, `mixxx.js` (`exportMixxx`, `importMixxx`), `vdj.js` (`exportVdj`, `importVdj`), `serato.js` (experimental), `traktor-report.js`, `app/ui/screens/mapper.js`, `tests/mapper-*.test.mjs`, fixtures `tests/fixtures/mapper/`. XML via a small hand-written writer/parser or browser `DOMParser`/`XMLSerializer` (zero deps). Rust: none new — saving uses the FS-00 dialog plugin + `userfiles_write_text(path, content, allowedExt)` (checked 2026-10-10: no save command exists in `src-tauri/src/` today).
APIs:
- `learnedToModel(midiMap, profile) -> MapperModel`
- `validateModel(model) -> {errors:[{code,controlIds,message}], warnings:[...]}`
- `exportMixxx(model, {name, author, description}) -> {files:[{name,content}], warnings}`
- `importMixxx(xmlText, jsFiles?) -> {model, preservedRaw:[...]}`; `exportVdj`/`importVdj` analogous.
- `traktorReport(model) -> string(markdown)`.
No new plugins.

## 5. Data model
Neutral model (JSON, `version:1`):
```json
{"version":1,"name":"Pioneer DDJ-?","manufacturer":"Pioneer DJ","decks":2,
 "controls":[{"id":"c1","label":"Deck1 Play","midi":{"type":"note","channel":1,"number":11,"status":144},
   "kind":"button","mode":"toggle","layer":"base",
   "function":{"id":"play","deck":1,"args":{}},
   "feedback":{"led":{"type":"note","channel":1,"number":11,"on":127,"off":0}}}],
 "provenance":{"source":"learned|profile|import-mixxx|import-vdj","sourceId":"..."}}
```
Function vocabulary (v1): `play`, `cue`, `sync`, `pitch` (relative/14-bit absolute), `jog` (touch, rotate, shift-rotate), `hotcue` (n=1..8, set/trigger/delete), `loop` (in, out, toggle, size halve/double, autoloop n), `fx` (unit 1-4, enable, dry/wet, param 1-3), `load`, `gain`, `eq` (hi/mid/lo), `filter`, `crossfader`, `volume`, `browse` (rotate/press), `headphone-cue (pfl)`, `keylock`, `shift` (modifier). Each entry has: value kind (button/absolute/relative), target mappings table `FUNCTION_TARGETS = {mixxx:{...}, vdj:{...}}` in `vocabulary.js`.
Storage: models in a new table (`0020_mapper_models.sql`):
```sql
CREATE TABLE IF NOT EXISTS mapper_model (
  id TEXT PRIMARY KEY, asset_id TEXT REFERENCES asset(id), profile_id TEXT REFERENCES device_profile(id),
  name TEXT NOT NULL, model_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_mapper_model_asset ON mapper_model(asset_id);
```
Migration of `model_json` by `version`; unknown version is read-only with warning.
Mixxx output — VERIFIED 2026-10-10 against real files in the Mixxx repo (`res/controllers/Pioneer-DDJ-400.midi.xml`, `Pioneer-DDJ-FLX4.midi.xml`, `Pioneer-DDJ-SB3.midi.xml`, `Pioneer DDJ-SX.midi.xml`, plus a scan of all 143 `.midi.xml` files):
- Root: `<MixxxControllerPreset schemaVersion="1" mixxxVersion="2.6">` (FLX4; 62 files) or legacy `<MixxxMIDIPreset schemaVersion="1" mixxxVersion="2.2">` (DDJ-400; 81 files). `schemaVersion` is `"1"` everywhere. Export the `MixxxControllerPreset` root with `mixxxVersion="2.4+"`; import accepts both.
- `<info>`: `name`, `author`, `description`, optional `manual`, `forums`, `wiki`.
- `<controller id="DDJ-FLX4">` containing `<scriptfiles><file functionprefix="PioneerDDJFLX4" filename="Pioneer-DDJ-FLX4-script.js"/></scriptfiles>` (a `<file filename="lodash.mixxx.js"/>` without prefix also occurs), `<controls>` and `<outputs>`.
- `<control>`: `description?`, `group` (e.g. `[Channel1]`, `[Library]`), `key` (e.g. `play`, `MoveVertical`, or a script function `PioneerDDJ400.xxx`), `status` (hex, e.g. `0x90`, `0xB6`), `midino` (hex), `<options>` with one child. Observed option tags (case varies: `<normal/>`/`<Normal/>`, `<selectknob/>`/`<SelectKnob/>` — parse case-insensitively, emit lowercase): `script-binding` (7316 uses), `normal` (2937), `soft-takeover`, `button`, `fourteen-bit-msb`, `fourteen-bit-lsb`, `invert`, `diff`, `selectknob`, `switch`, `hercjogfast`.
- `<output>`: `group`, `key` (e.g. `play_indicator`), `status`, `midino`, `on` (e.g. `0x7F`), optional `off`, `minimum`, `maximum`.
- 14-bit absolute controls do NOT need a script: pair MSB/LSB controls with `<fourteen-bit-msb/>` / `<fourteen-bit-lsb/>`.
Licence: Mixxx mappings are GPL-2.0-or-later and DeckChek is proprietary, so no Mixxx mapping or script may be committed, bundled or adapted. Committed fixtures are self-authored in this format; an optional, non-blocking test (`MIXXX_CONTROLLERS_DIR` env var pointing at a local sparse clone) imports every real `.midi.xml` to check parser robustness without redistributing them. Scripted functions use `<options><script-binding/></options>` with `<key>` = `<functionprefix>.<fn>` plus a generated `.js` file declared in `<scriptfiles>` (self-authored template per function; jog uses `engine.scratchEnable`). Mixxx control keys: `play`, `cue_default`, `sync_enabled`, `rate`, `hotcue_N_activate`, `loop_in`, `loop_out`, `beatloop_N_toggle`, `[EffectRack1_EffectUnitN]` groups (verify each against Mixxx controls manual).
VirtualDJ: two XML files per controller per the VDJ wiki (snippet only): a *definition* (`<device name type="MIDI" decks version>` with named `<button>`/`<slider>` entries carrying note/CC) in `Documents/VirtualDJ/Devices`, and a *mapping* associating names with VDJscript actions in `Documents/VirtualDJ/Mappers`. Custom definition of a natively-supported controller must be named `force-<name>.xml`. Exact mapping schema (element names, `deck` attribute, shift handling): UNKNOWN - needs verification; a forum sample showed `<note note="22" action="loop" chan="1" value="4"/>` (old format, may be deprecated). Common VDJscript: `play_pause`, `cue`, `sync`, `pitch`, `jog`, `hotcue 1`, `loop`, `effect_active`.
Serato (experimental): XML in `Music/_Serato_/MIDI/Xml` (folder created after making a blank mapping in Setup > MIDI), loaded per device in Setup > MIDI with "Allow Serato Hardware Remapping"; no official schema (community only). Strategy: generate a mapping through Serato UI once, diff, and template from that sample. Not shipped until three real samples are captured.
Traktor: `.tsi` is XML with mapping data in a Base64 attribute whose decoded content is ID3v2-like/TLV frames (community specs: ivanz Kaitai template, `py-ni-traktor-tsi`; snippet only). Feasibility: medium-high effort, high break risk across Traktor versions; MVP exports a report only; spike (S) to test reading an owner-exported TSI later.

## 6. Algorithms
- Learned-to-model: from `asset_midi_map` entries, map control ids (profile vocabulary, `app/devices/`) to function ids by lookup table; unrecognised go to `unassigned`.
- Relative encoders: reuse `decodeJogDelta` encodings (`relative-two-complement`, etc.) to pick Mixxx `<options>` (`<selectknob/>`, `<diff/>`, `<invert/>`) or a script binding; 14-bit pairs (MSB/LSB) map to `<fourteen-bit-msb/>`/`<fourteen-bit-lsb/>` (no script).
- Validation rules: unique (status, data1, layer); channel 1-16; number 0-127; function supported by target (else warning "no equivalent"); deck within 1..decks; hotcue 1..8; require shift modifier defined if layer shift used; max file size 512 KB.
- Normalisation for round-trip: sort controls by (layer, status, number), stable ids from midi triple.

## 7. Errors, privacy, security
Parse with a non-validating XML parser, reject DOCTYPE/entities (XXE), size cap 5 MB. Imported JS files are treated as opaque text, never executed; shown read-only; shipped through unchanged (preservedRaw). File names sanitised (`[A-Za-z0-9 ._-]`), saved only via user-chosen dialog path. No network. Third-party mappings imported keep author/licence fields.

## 8. Test plan
Unit: model validation cases (dupes, ranges, missing shift); each function serialises for Mixxx and VDJ; round-trip import(export(model)) == model; import tolerates comments, unknown elements, CRLF, UTF-8 BOM; XXE rejected; golden file diffs. Fixtures: self-authored only (GPL Mixxx files are not committed; optional local corpus test via `MIXXX_CONTROLLERS_DIR`). Rust: save-file path sanitisation if added. UI smoke: load learned map fixture, assign Play, export, assert preview contains `<key>play</key>`. Windows CI: save to temp dir. Manual: learn the Pioneer DDJ (model TBC) and Xone:23C; load exported file in Mixxx (verify play/cue/hotcue1-8/loop/fx) and VirtualDJ; Serato/Traktor report compared by hand. Check Pioneer PLX-CRSS12 MIDI class (it has USB/MIDI-like controls: UNKNOWN - needs verification) and DJM-A9 (USB MIDI out).

## 9. Definition of done
Mixxx and VDJ export+import pass fixtures and a manual load test; Serato/Traktor visibly labelled; no network/dependency additions; docs: README, DEVICE-PROFILE-SCHEMA cross-link. Feature flag `features.mapperStudio`.

## 10. Dependencies, risks, questions, effort
Depends on `midi.js`, `midi-tests.js`, device profiles, `asset_midi_map` (0002). Risks: undocumented/changing formats (VDJ mapping schema, Serato), licence of sample mappings, scripted jog behaviour. Questions: owner's DDJ model (repo has a `pioneer-ddj-s8` profile; Mixxx ships DDJ-200/400/FLX4/SB/SB2/SB3/SX mappings but no S8 one). Resolved: Mixxx baseline 2.4+ with `schemaVersion="1"`. Do we ship official profiles' maps as bundled mappings (licence check)? Effort: model+Mixxx M (~24h), VDJ M (~16h), UI M (~20h), Serato spike S, Traktor report S, TSI writer XL/optional.

## 11. Research notes
- https://github.com/mixxxdj/mixxx/wiki/Midi-Controller-Mapping-File-Format : Mixxx XML mapping format (snippet only).
- VERIFIED from source: Mixxx repo sparse clone (commit b02e84aa4cbae2569b5bb850f2b12bd81062c791, 2026-10-08) `res/controllers/Pioneer-DDJ-400.midi.xml`, `Pioneer-DDJ-FLX4.midi.xml`, `Pioneer-DDJ-SB3.midi.xml`, `Pioneer DDJ-SX.midi.xml` and corpus counts over `res/controllers/*.midi.xml`; `LICENSE` (GPL-2.0-or-later). Read locally, not redistributed. https://mixxx.org/wiki/doku.php/midi-scripting : scripts need an accompanying XML; QJSEngine ES7 since 2.4 (snippet only).
- https://virtualdj.com/wiki/controllerdefinitionmidi.html and https://virtualdj.com/wiki/ControllerDefinitionMIDIv8.html : definition/mapping file split, `<device>` root, folders (snippet only). https://virtualdj.com/forums/105538/VirtualDJ_Plugins/Mapper.html : old XML mapper sample.
- https://github.com/marscanbueno/serato-dj-pro-midi-maps, https://djtechtools.com/2018/04/11/hacking-serato-djs-midi-mapping-jogwheels-touchstrips-and-modifiers, https://serato.com/forum/discussion/1398201 : Serato install folder and no official schema (snippet only).
- https://ohotnik.duckdns.org/ivanz/TraktorMappingFileFormat/wiki/File-Format-Specification and https://pypi.org/project/py-ni-traktor-tsi/ : TSI Base64 TLV structure (snippet only).
