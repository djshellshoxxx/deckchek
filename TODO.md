# DeckChek build queue

## Completed in the first build slice

- [x] Tauri 2 desktop shell configuration
- [x] Responsive GUI prototype: Overview, Test Center, Equipment, Results, Audio Setup
- [x] Demo-only labels on example measurements and records
- [x] Rust domain models for devices, runs, measurements and findings
- [x] Runtime-status IPC command reports preview mode and disconnected hardware services

## Next

- [ ] Install Tauri prerequisites on the target Windows development machine and confirm a native build
- [ ] Select and pin the frontend build tooling; migrate static UI into typed components
- [ ] Add frontend-to-Rust invocation and explicit preview-data boundaries
- [ ] Implement database repository against database/migrations/0001_initial.sql
- [ ] Add audio device enumeration and reject unsupported or unsafe input routing
- [ ] Implement calibrated stereo balance measurement with reference fixtures
- [ ] Add test and accessibility checks for navigation, empty states, device errors and modal behavior

## Not yet implemented

The interface does not capture audio, enumerate devices, persist records, diagnose equipment, or export reports. Scores and results in the UI are sample content only.
