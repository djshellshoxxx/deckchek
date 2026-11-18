# Stored learned MIDI maps and profile identity

A unit keeps its asset ID when its Product changes in Equipment. Its saved learned MIDI map can therefore belong to an earlier device profile. Automatic loading checks that saved profile ID before using the map in the Devices reference, MIDI tests, or Mapper's **Load MIDI map** action.

When the saved map and current profile both have nonempty string IDs and those IDs differ, automatic loading ignores the saved map. Published controls from the current profile remain available. If the current profile has no published controls, the existing learning or empty-map workflow remains available. Profile IDs are compared exactly, including case and whitespace; the string `0` is a known ID.

This check does not edit, delete, or relabel the stored record. A map with the same profile ID stays usable. Maps whose profile ID is null or missing retain their existing behavior, as does loading without a known current profile ID. A null ID can be intentional historical data: native profile retirement preserves the learned map while clearing its profile reference. Unknown identity does not establish that a map belongs to the current physical device.

## Deliberate actions

**Save learned map** continues to replace the unit's stored learned map when the operator chooses that action. A new map for the current profile does not carry controls from a conflicting profile's rejected map. Later saves in the same runner use the accepted saved row.

Mapper's **Open file** remains a deliberate import. It can open a chosen learned-map file from another profile. The general map-merging and file-conversion functions keep their existing behavior; the identity check applies at automatic stored-row consumers.

## Regression coverage

- [Devices display](../tests/devices-map-profile-identity.test.mjs) opens the actual profile card and checks the rendered controls and source label.
- [MIDI runner](../tests/midi-runner-profile-identity.test.mjs) checks conflicting and current button bindings, coverage learning, the subsequent save, literal IDs, and legacy identity compatibility through the real runner callbacks.
- [Mapper](../tests/mapper-profile-identity.test.mjs) checks automatic loading and model saving, legacy identities, and intentional file import through the actual screen callbacks.

The tests use a real isolated browser catalog to change the unit's Product while preserving its saved map. Automatic consumption must preserve the complete catalog string and original map record. The fixtures exercise application behavior with simulated DOM and MIDI events; they do not establish physical-device or native-platform qualification.
