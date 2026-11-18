# Native Instruments TRAKTOR KONTROL F1 — USB MIDI research

Checked **2026-11-18** for the exact F1. This remains a research seed with no
physical qualification.

## Source and applicability

The [official manual](https://www.native-instruments.com/fileadmin/ni_media/downloads/manuals/traktor/traktor_kontrol_f1_manual_english.pdf)
identifies itself as **version 2.11 (10/2016)**. This is document provenance,
not a firmware version or current platform qualification. Printed p. 20,
§2.2.2 describes the USB connection; §4.12, pp. 118–121 and §5.1.4, p. 128
describe the MIDI mode and its preference.

## Profile decision

`connectivity.midi.usbMidi` is `true` for the documented ordinary MIDI mode.
With the documented TRAKTOR setup, select **MIDI Mode** in the F1 Preferences,
then press **SHIFT + BROWSE**. Selecting **User Map** invokes NHL instead;
the shortcut alone does not establish that ordinary MIDI is active.

The manual does not establish an explicit no-audio claim for this update. The
complete audio object remains unresolved, and the actual planner retains
conditional minor audio testing plus MIDI checks. All original checks,
specs/documents, IDs, class compliance, DIN status, maps, software minimums and
qualification unknowns remain unchanged.
