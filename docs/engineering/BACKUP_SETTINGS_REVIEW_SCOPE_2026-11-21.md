# Scheduled-backup settings completeness — review scope

## Concrete problem

[Issue #85](https://github.com/djshellshoxxx/deckchek/issues/85) records a static
finding on qualified main `e36ddc41806b0f6639474f207e3b339e063a6e25`. Root has
independently traced the same path in the consolidated Player successor.
`Data.saveSchedule` calls `backupApi.setSettings({mode, keep})`; neither that
bridge nor native `backup_settings_set` snapshots the webview's UI/calibration
settings. Only manual `backup_create` seeds the native cache. Scheduled and
on-exit jobs read that cache, turning missing/invalid/unreadable data into an
empty default. The archive can remain valid while optional settings are absent
or stale. This establishes a source-derived completeness gap, not observed data
loss or a runtime reproduction.

## Current worker cycle

A fresh code, functional/bug-hunt and static defensive trio begins only after
all three Player FINALs. Each owns one separate report and no implementation
files. All three work from the exact consolidated source assigned by root.
**This cycle is static source/data review only, including the functional lane.**
No test, syntax, build, import, browser, native program, scanner, probe, numerical
diagnostic, extracted implementation or packaged verifier is authorized.
Independent Python byte/JSON/Git data checks are permitted. Root alone owns the
isolated correction candidate and will hand it to fresh acceptance workers after
all three current final reports are complete.

The code lane should review the native cache, command signatures, operation/DB
locks, startup/exit scheduling, archive compatibility, atomic replacement and
freshness contract. The functional lane should trace actual settings/calibration
writers, feature flags, restore/import, Data lifecycle and failure presentation;
identify a bounded meaningful acceptance selection and remaining native gates.
The defensive lane should review fixed-path file ownership, schema/version/size
bounds, stale ordering, error privacy and unchanged permissions/retention limits.
All lanes must identify concrete source references and distinguish established
findings from proposed remedies and unexecuted cases.

## Required correction contract

The proposed correction must snapshot current UI/calibration state when enabling
or changing a schedule and keep native automatic-backup state informed as those
settings change. It must distinguish deliberately absent optional settings from
failed or stale capture, preserve the last complete cache until a new one is
committed, and propagate failure when freshness is required. No native job may
pretend it can directly read webview localStorage. No successful archive should
be presented as comprehensive after an unavailable expected settings snapshot.

Review ordering and lifetime explicitly: settings changes during a pending sync,
restore before reload, app startup before the webview is ready, failed local
storage reads/writes, schedule disable/re-enable, app shutdown with pending work,
and a failed native cache replacement. Keep real database-only archive support,
existing archive names/schema/checksums/limits, the five-second on-exit cap,
retention rules and native permissions. Avoid raw settings or absolute paths in
error logs. Do not introduce an arbitrary timer/retry loop, new access policy,
unbounded payload, guessed freshness interval or unsupported physical claim.

A design decision does not qualify native implementation. Local Rust/native SDK
and browser limits remain; no workaround or rerun is authorized. The independent
full-source audio failure remains open. Original source/results and fixed
published heads must stay unchanged. Root will consolidate all three reports,
author the bounded correction and require a fresh acceptance handoff before
any separately reviewed first execution command.
