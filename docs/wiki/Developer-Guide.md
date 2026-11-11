# Developer Guide

```sh
npm test    # node --test tests/*.test.mjs: 823 tests, 820 pass, 3 fail on this snapshot
```

The three failures are in `tests/device-library.test.mjs`. They are not yet diagnosed.

Build and packaging: `BUILDING.md` (including backup and restore). CI: `.github/workflows/test.yml`, `windows-build.yml`, `cross-platform-release-validation.yml`, and `pages-mobile.yml`.
The Tauri desktop build uses SQLite persistence.
