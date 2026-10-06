# SPEC-12: Missing-Spec Capability Map

## Purpose

This map closes the cross-cutting specification gaps found after SPEC-00 through SPEC-11. It gives builders stable module names, clear document ownership, and an order that avoids building UI or workflows before their measurement and routing contracts are understood.

These documents complement the existing DSP, database, diagnostic, edition, and roadmap specifications. They do not replace them. If a requirement conflicts, SPEC-00 remains authoritative for system architecture and evidence contracts; the narrower spec owns details within its named boundary. Record the conflict as an open decision before implementation.

## Capability map

| Module ID | Responsibility | Primary specification | Depends on |
|---|---|---|---|
| gui-ux | Navigation, screens, interaction patterns, accessibility, and UI states | [SPEC-13](SPEC-13-gui-ux.md) | workflows, io-contracts |
| audio-routing | Physical signal wiring, software device routing, calibration, and safe capture | [SPEC-14](SPEC-14-audio-routing-and-wiring.md) | io-contracts |
| io-contracts | Supported incoming data, capture descriptors, persistence, exports, and user data lifecycle | [SPEC-15](SPEC-15-input-output-and-data-flow.md) | — |
| workflows | End-to-end functional behavior and session state transitions | [SPEC-16](SPEC-16-workflows-and-functional-behavior.md) | io-contracts, audio-routing |
| operational-quality | Errors, privacy, security, recovery, performance, packaging, and supportability | [SPEC-17](SPEC-17-operational-quality.md) | io-contracts, workflows |

## Recommended design/build order

1. **io-contracts** — define what enters, what is saved, and what leaves the app.
2. **audio-routing** — define how real audio reaches capture safely and how routing quality is established.
3. **workflows** — define observable end-to-end behavior using those contracts.
4. **gui-ux** — design screens around the settled workflow and states.
5. **operational-quality** — apply cross-cutting quality gates before a feature or release ships.

The map is not a release roadmap. Release sequencing remains in SPEC-09; feature scope and edition entitlements remain in SPEC-11.

## Shared requirement conventions

- **MUST** is required for a release claiming the feature.
- **SHOULD** is expected unless a documented, reviewed reason prevents it.
- **MAY** is optional and must not be implied to be present.
- “Unavailable” means the required capability is absent; it is not a failed test.
- “Not tested” means the user did not run the test; it is not a pass.
- Every measured value must retain the method, units, provenance, and quality context defined in SPEC-00 and SPEC-07.
- Every proposed feature remains subject to the phase and edition scope in SPEC-09 and SPEC-11.

## Definition of done for these specifications

- Every module has one clear owner document and explicit dependencies.
- All flows distinguish measured facts, derived findings, and user-entered data.
- The UI cannot silently change the hardware chain or reinterpret an unsupported path as valid.
- Each capability has testable acceptance criteria and visible unavailable/invalid states.
- Implementation must update this map and SPEC-09/FEATURE-MATRIX when the boundaries or build order change.

## Open decisions

The specs intentionally preserve these decisions for validation before implementation: minimum supported OS versions beyond the current Windows-first target; exact native audio backends per OS; GUI framework and component library; supported project/report import formats; signed installer/update channel; and whether a future release adds controlled audio output or remote sync. No unresolved item may be guessed in a way that could alter, publish, or route user audio.
