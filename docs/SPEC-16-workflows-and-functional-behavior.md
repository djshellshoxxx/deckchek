# SPEC-16: End-to-End Workflows and Functional Behavior

## 1. Purpose

Define user-visible end-to-end behavior and session lifecycle shared by DeckChek diagnostic categories. Feature-specific measurements remain in SPEC-01 through SPEC-06, editions in SPEC-11, and UI layout in SPEC-13.

## 2. Shared concepts

- **Product:** catalog description of a model.
- **Asset:** a particular physical unit owned or serviced by the user.
- **Setup:** named chain of assets, settings, routes, and optional location.
- **Test plan:** ordered steps selected for a category and available capability.
- **Session:** one execution of a test plan with a frozen setup snapshot.
- **Capture:** audio/control/sensor input with its source and technical metadata.
- **Evidence:** raw detector observation.
- **Measurement:** versioned value with units and quality context.
- **Finding:** interpretation/hypothesis linked to evidence; never a substitute for measurements.

## 3. Session state machine

| State | Meaning | Allowed next states |
|---|---|---|
| DRAFT | User is configuring a proposed test | READY, CANCELLED |
| READY | Required equipment/source checks are satisfied or explicitly acknowledged | RUNNING, CANCELLED |
| RUNNING | Capture and/or measurements are in progress | PAUSED, FINALIZING, FAILED |
| PAUSED | Capture is intentionally suspended and gap is recorded | RUNNING, FINALIZING, FAILED |
| FINALIZING | Streams stopped; files and results are being committed | COMPLETE, INCOMPLETE, RECOVERY_REQUIRED |
| COMPLETE | Required steps ended and result integrity checks passed | — |
| INCOMPLETE | User stopped, skipped required steps, or capture ended early; valid partial results retained | — |
| FAILED | A fatal condition prevented trustworthy completion | RECOVERY_REQUIRED, INCOMPLETE |
| RECOVERY_REQUIRED | Recoverable data exist but require integrity/review action | COMPLETE, INCOMPLETE, FAILED |
| CANCELLED | User exited before measurement began; preserve draft only if the user requested it | — |

Transitions are persisted. A crash or force-close must not convert RUNNING into COMPLETE. The recovery UI reports last confirmed sample/event, completed steps, lost intervals, and remaining files.

## 4. Start-session workflow

1. Select category and test plan.
2. Select or create a setup; choose actual assets where known.
3. Inspect declared route and physical wiring instructions.
4. Select source device/media and channel map.
5. Check permission, supported format, sample rate, signal level, clipping, storage, and required calibration.
6. Show which tests will be run, skipped, or unavailable and why.
7. User confirms start; create session/configuration snapshots.
8. Capture/analysis begins only after confirmation.

If a required check fails, block the affected test and explain a safe fix. Permit unrelated tests only if the test plan can isolate them without false claims.

## 5. During-session behavior

- Use a monotonic sample/event timebase for ordering and an absolute timestamp for provenance.
- Record every pause, device change, channel change, sample-rate change, dropped buffer, and user intervention.
- Do not stitch across missing data; represent the gap explicitly.
- Do not silently fall back to another device or route.
- A detector failure marks its result unavailable/failed while allowing independent detectors to continue where safe.
- If the user stops, request no extra confirmation when there is an immediate safety concern; otherwise explain what will be retained and finalize as incomplete.
- For guided physical actions, wait for explicit confirmation where the app cannot observe completion.

## 6. Finalization and result behavior

Finalization must:
1. stop streams safely;
2. flush detector tails and pending writes;
3. hash retained raw captures where supported;
4. persist quality flags, calibration and method versions, route/setup snapshots, and step status;
5. validate referential integrity;
6. create report-ready results;
7. set COMPLETE only if all required steps and integrity checks passed; otherwise INCOMPLETE or RECOVERY_REQUIRED.

A summary must state test coverage and validity before showing a score or headline. If a score is not supported by validated thresholds, show metrics and findings without inventing a score.

## 7. Functional requirements by workflow

### FR-01: Setup management
Create, clone, edit, archive, and select a setup. Preserve versioned snapshots per session. Show missing or unknown equipment without fabricating defaults.

### FR-02: Capability planning
Derive available test steps from edition entitlement, hardware capability, selected media, and calibration. Explain exclusions. Never classify unavailable as failed.

### FR-03: Guided tests
Provide preflight instructions, progress, live quality checks, prompts, pause/stop, and a deterministic completion state. Each step references its detailed diagnostic spec and method version.

### FR-04: Quick Check
Offer a short, category-appropriate subset only. Display its limited coverage and do not generalize “no detected fault” into a complete certification.

### FR-05: Full-side capture
Use streaming capture and the SPEC-03 position/timeline contract. If the user pauses, loses signal, or storage becomes unavailable, mark a discontinuity and do not fabricate continuous coverage.

### FR-06: Comparison
Compare only compatible metrics by default. Show compatibility rules, route differences, calibration differences, and method versions. Keep historical source sessions intact.

### FR-07: Diagnosis
Show evidence, supporting/contradictory conditions, confidence, severity, alternatives, and next isolation tests as defined in SPEC-06. Never state a suspected cause as confirmed hardware failure.

### FR-08: Reports
Generate a local report from persisted session data, not transient UI state. Exports include session coverage, quality flags, route and calibration context, method versions, units, evidence links, and interpretation limits.

### FR-09: MIDI Tester integration boundary
If a MIDI Tester JSON baseline is imported, preserve its source/version and map only fields with known semantics. Do not imply that MIDI tests establish audio-path health. MIDI event output requires explicit user action and an all-notes-off/panic path.

### FR-10: Entitlements
Gate feature execution, not reading/exporting a user's past results. If license state cannot be checked offline, do not delete, lock, or corrupt local data; follow the separately approved licensing design.

## 8. Acceptance scenarios

1. **Normal Quick Check:** valid stereo route and setup produce a complete session with all required metadata.
2. **No input signal:** capture shows no/low signal, affected measurements are invalid or inconclusive, and no healthy/pass result is generated.
3. **Device unplugged:** capture stops or pauses, exact gap is saved, and the user must explicitly select/reconfirm a device.
4. **User stops early:** completed steps remain available; unfinished coverage is clearly incomplete.
5. **Unknown calibration:** exploratory results may be retained, but calibrated claims and compatible-score comparisons are withheld.
6. **Compare changed route:** side-by-side observations remain visible and the direct comparison is marked incompatible with a reason.
7. **Crash recovery:** restart offers a recoverable incomplete session, verifies files, and never marks it complete without validation.
8. **Edition locked:** user can view/export prior results; new locked test gives an explanation and does not modify data.
9. **Unsupported input:** user receives a precise format/capability message and the source is left unchanged.
10. **Report after restart:** regenerated report matches persisted measurements and context without relying on the previous UI process.
