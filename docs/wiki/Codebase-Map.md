# Codebase Map

| I want to... | Look in |
|---|---|
| Browser application and shared measurement modules | [app/](../../app/) (`app.js`, `core.js`, `calibration.js`, `capture.js`, `catalog-store.js`, `backup.js`) |
| Device profiles and dispatch | [app/devices/](../../app/devices/) (`index.json`, `profiles/`, `library.js`, `dispatch.js`) |
| Native capture, persistence and commands | [src-tauri/src/](../../src-tauri/src/) |
| Schema and migrations | [database/migrations/](../../database/migrations/) |
| JavaScript regression tests | [tests/](../../tests/) (`*.test.mjs`); counts are revision-specific |
| Browser regression suites | [tools/smoke/](../../tools/smoke/), discovered by [ui-smoke.mjs](../../tools/ui-smoke.mjs) |
| Build and packaging | [BUILDING](../../BUILDING.md), [app/README](../../app/README.md) |
| CI | [.github/workflows/](../../.github/workflows/) and [Developer Guide](Developer-Guide.md) |
| Specs, status and continuation | [docs/](../), [SPEC_STATUS](../../SPEC_STATUS.md), [Implementation Status](../IMPLEMENTATION-STATUS.md), [CHECKPOINT](../../CHECKPOINT.md), [TODO](../../TODO.md) |
