# Developer Guide

Start with [CHECKPOINT](../../CHECKPOINT.md), [SPEC_STATUS](../../SPEC_STATUS.md) and [Implementation Status](../IMPLEMENTATION-STATUS.md). Dated test counts describe a specific source revision, not an automatic release qualification.

## Run the existing checks

```sh
npm test
cargo test --locked --manifest-path src-tauri/Cargo.toml -j 4
node tools/ui-smoke.mjs
```

The browser smoke runner needs Playwright and Chromium; see [BUILDING](../../BUILDING.md) for setup. It also accepts a suite name, such as `core`. The saved cloud environment used `NODE_PATH=/opt/codex/cua_node/lib/node_modules` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`; verify those paths in the actual executor before reuse.

## Recorded validation

At checkpoint `6fb85e21a19fca06467969b9af4bc3ffd1120998`, [run 41033986019](https://github.com/djshellshoxxx/deckchek/actions/runs/41033986019) passed the JavaScript, Linux Rust and browser jobs. The [merge review](../MERGE-REVIEW-2026-10-30.md) records 1,204 JavaScript passes with one optional skip, 654 Rust passes with eight ignored, and 1,266 browser checks. No hardware or all-platform qualification follows from those software results.

The old PR10 snapshot `4cfa38cf127881f07a7ab9e408f2fb701c4ff984` recorded 820 of 823 JavaScript tests passing and three device-library failures. That is historical evidence, not the status of this continuation. The same software suites passed at exact head `722c7fd` in [run 41036582627](https://github.com/djshellshoxxx/deckchek/actions/runs/41036582627), with job logs checked during this review. Sonar also reports a reliability-gate failure on PR16; PR14's broader security/reliability gate remains open. Consult the [current review](../RECONCILIATION-2026-10-30.md) and exact-head checks before merging.

## Current workflows

| Workflow | Responsibility |
|---|---|
| [test.yml](../../.github/workflows/test.yml) | Per-PR/source-push Linux JavaScript, Rust and browser checks, including consistency checks and compiler warnings |
| [nightly.yml](../../.github/workflows/nightly.yml) | Windows Rust, sanitizer, extended fuzzing and stress checks |
| [cross-platform-release-validation.yml](../../.github/workflows/cross-platform-release-validation.yml) | Platform bundles and packaged-app smoke; publication is tag-gated |
| [pages-mobile.yml](../../.github/workflows/pages-mobile.yml) | Separately controlled mobile Pages workflow |

`windows-build.yml` is retired. A workflow's existence does not mean a particular platform was tested successfully. Documentation-only changes can be excluded by workflow path filters; a missing run is not a passing run. No release, tag, deployment or manual dispatch is part of this documentation reconciliation.

The desktop build persists data in SQLite. Preserve forward-only migrations, restore guarantees, the default-off fleet flag, and measured versus simulated/manual evidence.
