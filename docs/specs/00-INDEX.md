# Feature spec index

Reconciled 2026-10-10. `FS-NN` = `docs/specs/NN-*.md`; `SPEC-NN` = architecture docs `docs/SPEC-NN-*.md`. Delivery plan, jobs and gates: [`docs/DEVELOPMENT-PLAN.md`](../DEVELOPMENT-PLAN.md). Sizes are agent effort: S <= 10 h, M 10–25 h, L 25–45 h, XL > 45 h (split into jobs in the plan).

Status legend: **Ready** = implementable as written; **Ready\*** = implementable, one owner decision noted (defaults given); **Spike** = a short feasibility job must pass first; **Blocked** = needs an owner decision before any code.

| Spec | Title | Status | Size | Depends on | Milestone | Migration | Flag |
|---|---|---|---|---|---|---|---|
| [FS-00](00-shared-foundations.md) | Shared foundations | Ready | XL | — | M5–M7 (wave 0 of each) | 0003, 0006, 0013 | — |
| [FS-01](01-first-run-wizard.md) | First-run setup wizard | Ready | L | FS-00, System Health, device library | M5 | — (uses 0003) | `setupWizard` |
| [FS-02](02-diagnostics-bundle.md) | Crash capture & diagnostics bundle | Ready\* (issue repo name) | L | FS-00, FS-07 | M5 | — | `diagnosticsBundle` |
| [FS-03](03-pdf-reports.md) | PDF reports (WebView2 PrintToPdf) | Spike (PrintToPdf via `with_webview`) | L | FS-00, FS-07 | M5 | — | `pdfExport` |
| [FS-06](06-test-media-library.md) | Test-media library | Ready | L | FS-00, `M5-tc-facts` | M5 | 0004 | `testMedia` |
| [FS-07](07-open-external-links.md) | Open external links / reveal files | Ready\* (allowlist domains) | S | FS-00 (F0-platform) | M5 | — | — |
| [FS-08](08-backup-restore.md) | Backup & restore | Ready | L | FS-00 (gate, fixture), FS-02 (log) | M5 | 0005 | `backup` |
| [FS-10](10-pre-gig-check.md) | Pre-gig check | Ready | L | FS-00 (hum.js, lease, processes), FS-06; FS-11 optional | M6 | 0008 | `pregig` |
| [FS-11](11-dvs-latency-buffer-tuner.md) | DVS latency & buffer tuner | Spike (cpal WASAPI fixed buffers) | L | FS-00 (audio_out, lease, processes) | M6 | 0007 | `latencyTuner` |
| [FS-12](12-stylus-wear-tracker.md) | Stylus wear tracker | Ready | M | FS-00 (asset_usage), FS-06 | M6 | 0009 (+0006) | `stylusWear` |
| [FS-13](13-control-vinyl-wear-map.md) | Control-vinyl wear map | Ready | L | FS-00 (stream capture), FS-06 (side lengths), FS-12 optional | M6 | 0010 | `wearMap` |
| [FS-14](14-scratch-stress-test.md) | Scratch stress test | Ready | L | FS-00 (lease, signals), `M5-tc-facts` (phaseSign) | M6 | 0011 | `scratchTest` |
| [FS-15](15-booth-feedback-hum-hunter.md) | Booth feedback & hum hunter | Ready | L | FS-00 (hum.js, audio_out) | M6 | 0012 | `humHunter`, `feedbackStep` |
| [FS-20](20-used-gear-certificate.md) | Used-gear test certificate | Ready | L | FS-00 (photo, canonical, QR), FS-03 | M7 | 0014 (+0013) | `certificates` |
| [FS-21](21-unit-population-comparison.md) | Unit vs population (phases 1–2) | Ready | M | FS-00 (metric-compat) | M7 | 0015 | `population`, `packs` |
| [FS-22](22-service-worksheets.md) | Service worksheets | Ready | L | FS-00 (photo, metric-compat), FS-03 | M7 | 0016 | `service` |
| [FS-23](23-venue-fleet-dashboard.md) | Venue fleet dashboard | Ready | L | FS-00 (asset_usage), FS-03 | M7 | 0017 | `fleet` |
| [FS-30](30-mobile-companion.md) | Mobile PWA companion | Blocked (hosting vs proprietary licence); desktop import Ready | M | FS-00 (canonical, sha256, QR) | M8 | 0018 | `phoneImport` |
| [FS-31](31-timecode-doctor-live-monitor.md) | Timecode doctor live monitor | Spike (shared-mode capture beside DJ software on owner's interfaces) | L | FS-00 (stream capture, lease) | M8 | 0019 | `liveMonitor` |
| [FS-32](32-midi-mapper-studio.md) | MIDI mapper studio (Mixxx, VDJ; Serato/Traktor report) | Ready\* (owner's DDJ model) | L | FS-00 (userfiles) | M8 | 0020 | `mapperStudio` |
| [FS-33](33-gear-ledger.md) | Gear ledger static export | Ready | L | FS-00 (photo, canonical, userfiles), FS-20 | M8 | 0021 | `gearLedger` |

Numbering gaps (04, 05, 09, 16–19, 24–29) are intentional; they leave room for future specs in the same groups (essentials 0x, DJ 1x, pro 2x, companion 3x).

## Cross-cutting decisions made during reconciliation
- One generic `app_state` table (0003) replaces per-spec settings tables; UI prefs stay in `deckchek.ui.v1`.
- One `asset_usage` hours ledger (0006) shared by stylus wear (FS-12) and fleet reminders (FS-23); `asset.hours_offset` and `stylus_hours` dropped.
- One content-addressed photo store (0013) for assets, service jobs and certificates; `asset_photo`, `service_job_photo`, `ledger_certificate` dropped; FS-33 reuses FS-20 `certificate` rows.
- Canonical JSON forbids non-integer numbers (values as decimal strings) so JS and Rust hashes cannot drift.
- PDFs cannot carry attachments (WebView2 `PrintToPdf`), so certificates ship a sidecar JSON.
- Timecode facts (carrier, phase convention, side lengths) come from xwax `timecoder.c`; `app/timecode.js` is the single source and gets a correction job.
- Mixxx `.midi.xml` format verified from real files; GPL mapping files are never committed (self-authored fixtures; optional local corpus test).
- Parallel-merge safety: build-script migration discovery, anchor blocks in hotspot files, dependencies only added by wave-0 foundation jobs.
