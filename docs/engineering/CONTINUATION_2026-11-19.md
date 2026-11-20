# DeckChek engineering continuation — 19 November 2026

## Starting state and consolidation decision

The live starting `main` was `8c43cf17e3d5f5067ece5667f1aec1540f4b4091`, containing
the merged previous consolidation PR #27. Its [test workflow](https://github.com/djshellshoxxx/deckchek/actions/runs/44425299903),
[nightly workflow](https://github.com/djshellshoxxx/deckchek/actions/runs/44425299915)
and [desktop platform workflow](https://github.com/djshellshoxxx/deckchek/actions/runs/44425300012)
succeeded. There were no open pull requests at discovery.

The [branch audit](CODE_AUDIT_2026-11-19.md) independently checked every one of the
29 other branch tips: 21 are ancestors and eight diverge in history. Their useful
implementation is represented or superseded. Old GLib advisory acceptance advice
is superseded by the existing maintained backport. All original branches remain
preserved. Reapplying them is not necessary to complete features.

## Implemented in this continuation

### Existing equipment can use a researched device profile

**Devices > Use existing unit** provides an explicit operator choice for equipment
entered or imported previously. The user selects the saved unit and confirms its
model/revision. A guarded native transaction or strict browser write changes its
product association while preserving its ID, serial, notes, setup references,
catalog parents, saved results and learned-map provenance. Stale source/target
bindings fail; a same-target retry makes no write. Catalog transfer itself does
not guess or import bindings. The [feature contract](../device-profile-assignment.md)
records behavior and limits, including legacy unknown map identities and the
non-atomic nature of cross-tab localStorage writes.

### Audit corrections

- MIDI conformance recognizes captured channel-mode releases and no longer
  reports the built-in All Notes Off sequence as six stuck notes. It does not
  infer physical sound or switch failure from message counts.
- MIDI timing rejects malformed, reversed and zero-span evidence. Receipt-clock
  fallback cannot become saved transport-timing numbers. Valid tied arrivals and
  very large finite intervals remain supported. See [round 2](CODE_AUDIT_ROUND2_2026-11-19.md).
- Service status, creation, work-log, comparison, customer-search, unit-refresh,
  deletion, customer/field edits, photo batches and result linking retain their
  view/request ownership. HTML/PDF options are captured at click time; stale
  callbacks and retries stay quiet, while completed writes remain saved. See
  [round 2](BUG_HUNT_ROUND2_2026-11-19.md) and [round 3](BUG_HUNT_ROUND3_2026-11-19.md).
- Browser workspace import now commits a staged snapshot before replacing live
  state or reporting success. Failed/missing storage preserves the prior state;
  successful counts reflect the existing 250-run retention cap. The existing
  reduced-evidence retry and native behavior remain. See [code round 5](CODE_AUDIT_ROUND5_2026-11-19.md).
- Workspace import checks declared and actual byte size, rejects malformed UTF-8
  and applies one validated snapshot. Oversized files are refused before reading.
  See the [security audit](SECURITY_AUDIT_2026-11-19.md).
- Pre-gig and media imports share a single bounded byte reader and catch read
  failures. Phone and certificate file selections now use it with their existing
  exact limits; late phone reads cannot replace cleared or newly entered text.
  See [reader round 2](SECURITY_AUDIT_ROUND2_2026-11-19.md) and the
  [phone/certificate follow-up](FILE_IMPORT_FOLLOWUP_2026-11-19.md).

### Subsequent reviewed completion

- Browser Data imports use an owned chooser and shared busy lease. Navigation
  retires feedback without rolling back an already submitted durable import;
  releasing the lease preserves the current controls. See [code round 7](CODE_AUDIT_ROUND7_2026-11-19.md)
  and [independent round 8](CODE_AUDIT_ROUND8_2026-11-19.md).
- File-picker cancellation removes temporary controls. Verify chooser ownership
  starts before the native dialog, and phone save completions belong to their
  original result. See [bug round 4](BUG_HUNT_ROUND4_2026-11-19.md).
- Delayed announcements keep separate polite/assertive ownership and are retired
  on actual navigation. Phone/Verify callers also guard delivery; phone asset
  refreshes preserve newer selections. See [bug round 5](BUG_HUNT_ROUND5_2026-11-19.md).
- Job-sheet PDFs honor the existing option for structured serial fields without
  editing saved data. Nicknames, free text and filenames are not scanned; this
  is not complete anonymization. See [privacy round 7](SECURITY_AUDIT_ROUND7_2026-11-19.md)
  and [independent round 8](SECURITY_AUDIT_ROUND8_2026-11-19.md).

The [boundary review](SECURITY_AUDIT_ROUND9_2026-11-19.md) verifies unchanged
manifests/locks, maintained GLib backport, capability grants, CI gates, migrations,
signing engines and default flags. The feature deliberately adds the registered
`device_profile_assign` command. Workspace's numeric 64 MiB ceiling is retained,
with stricter enforcement against UTF-8 bytes instead of string length alone.
This review is not a fresh all-dependency vulnerability clearance.

## Worker generations and source ownership

Round 1 used independent code/branch, bug-hunt and security workers. Fresh round-2
workers reviewed those corrections before continuing the next reproduced issues.
Fresh round-3/4 workers reviewed the combined source and actual profile-assignment
screen. Later generations corrected workspace durability, Data/picker/save
ownership, PDF serial-field redaction and delayed announcements. Fresh successor
reviews check those changes before final combined qualification. The round-3 security worker stopped at a tool restriction before changing
production; its draft tests were not used. Round 4 used a narrower read-only
inspection, followed by separately tested ordinary file-handling repairs.
Root owns integration and publication; each author uses an isolated worktree.

| Original worker commit | Scope | Focused evidence |
| --- | --- | --- |
| `580704a23f5cb0ed221170ed985a7669df872dd8` | Branch uniqueness and note-release correction | 83/83 Node tests; preceding new cases 1 pass/3 failures |
| `879942dde6a1b0ab7d775c0d0d4d6ec15b34968d` | Service completion/comparison ownership | 50/50 Node tests; five reproduced failures corrected |
| `4d3a53a08a43ab704a297be57ac63f5ce5f3b61a` | Workspace file boundary | 115/115 Node tests; initial nine-case reproduction 1 pass/8 failures |
| `836f462727b44e278d3c7bd73fe731b94724fea8` | MIDI timing validity | 89/89 Node tests; new cases 1 pass/5 failures |
| `a1fabb2ebd181161417401ebd7ff9495bdf3afaa` | Service intake/delete follow-up | 72/72 Node tests; initial 21 pass/9 failure reproduction plus hidden-view case |
| `b7f3367bc817ef7fd472d1266c60a6a57fca853b` | Shared bounded text reader, pre-gig/media imports | 106/106 Node tests; seven initial failures corrected |
| `73af6bbef844239131dc67b7cbe7308e0d5e6348` | Actual Devices integration and independent MIDI review | 19/19 assignment/map, 2/2 runner cases and four arithmetic sequences; scopes separate |
| `4bc5ebc3bd7846d7397f1aa20df6f6aec12b16ec` | Correct unchecked Stylus fixture expectation | 60/60 focused; initial full failure retained |
| `be43613614e704d8b4bf4d20df39c6ea2ac70251` | Static phone/certificate import review | Read-only inspection; no application execution |
| `8d93c61` | Root phone/certificate file-handling follow-up | 39/39 Node tests; static review remains independently scoped |
| `8145e01c2704073072d3bddc13499fb9cc32816b` | Service panel/export follow-up | 146/146 focused; initial expanded scope 31 passes/25 failures |
| `13a2ec69b60a0c84d7bcbd2afaf34915badd1fd0` | Independent strict-import/native-assignment review | Read-only source acceptance; no new execution |
| `9af6acd9d0a8e63922daee846cb6fdd2ada60ec5` | Browser workspace durability and retained counts | 40/40 focused; corrected reproduction 2 passes/3 failures |

Additional completed handoffs:

| Review | Evidence |
| --- | --- |
| Code round 6 | 9/9 durability/ordering cases; independent acceptance |
| Bug round 4 | 124/124 related picker/phone/Verify cases; initial 14 passes/17 failures |
| Security round 6 | Static Service privacy/ownership acceptance |
| Code round 7 | 71/71 Data/native lease/durability cases; initial 2 passes/7 failures |
| Code round 8 | 2/2 strengthened existing native-feedback cases; independent acceptance |
| Bug round 5 | 142/142 announcement compatibility; subsequent affected scope 41/41 after two asset-list failures were corrected |
| Security round 7 | 60/60 report/Service/privacy cases; initial 2 passes/2 failures |
| Security round 8 | Static acceptance of the bounded PDF correction |
| Security round 9 | Git-object/configuration comparison; no scanner or runtime execution |
| Bug round 6 | 4/4 asset-load ordering/hide-return cases; independent announcement/phone acceptance |

Focused scope totals overlap and must not be added together as a unique test count.
All listed Node runs used 22.23.4. No regression assertion, measurement threshold,
feature gate or existing security check was weakened.

## Qualification checkpoint

Initial [PR #34](https://github.com/djshellshoxxx/deckchek/pull/34) head
`625a0a18fea0717c4055a32c89e8946d69e65a5f` has tree
`68929d5b48b2a8348d5b57cfb2e67051401a269a`, identical to local integrated source
`14c42c4e6528a36e5185c0bb4b68798f015eb2d8`. The connected GitHub API published this
tree after normal CLI push lacked credentials; no force push or history rewrite
was used. Follow-up source changes need their own qualification.

- New profile assignment and related catalog/map scope: **33/33 Node tests**.
- Actual production assignment core: **6/6 SQLite tests**, plus Clippy
  `--all-targets -- -D warnings`. The bounded harness pins the application's
  direct serde/serde_json/rusqlite versions and compiles the production module;
  it does not qualify full Tauri dispatch, the complete platform graph or actual
  hardware. An initial harness-only unused dev dependency warning was corrected
  before strict Clippy. Full application Rust validation remains a hosted gate.
- Device index, timecode facts, 25 migrations and mobile vendor/precache checks
  passed. Both existing audio/monitor performance budgets passed unchanged.
- The initial frozen-tree serial Node run finished: **2,014 passed, one failed,
  one optional Mixxx-corpus skip (2,016 total; 686,707 ms)**. Its sole failure
  expected an unchecked checkbox to be `undefined`, while the improved shared
  DOM correctly reports `false`. The strict assertion was corrected in the
  [round-4 code audit](CODE_AUDIT_ROUND4_2026-11-19.md); its focused scope passed
  **60/60**. This does not retrospectively make the initial full run green.
- Actual Devices-screen assignment/store/map integration passed **19/19**,
  including three new screen cases; see [round 3](CODE_AUDIT_ROUND3_2026-11-19.md).
- Phone/certificate file-handling follow-up passed **39/39**, including thirteen
  new actual phone-handler cases; see [the scoped report](FILE_IMPORT_FOLLOWUP_2026-11-19.md).
- Local Chromium launch fails at the process-singleton Unix socket with
  `Operation not permitted`; no browser pass is claimed. Hosted UI checks include
  the new assignment smoke and existing Service/import suites.
- Initial hosted workflows were superseded/cancelled when PR #34 advanced.
  Published checkpoint `3cff35894f0e1edd1277f9dc4e480232b9c2de90` has tree
  `0f80876bf1231f4199c809ea8ae43a77c18b04a7`, matching local
  `ad696d837d1793af2681baea90a160e6118e9b0d`. Replacement workflows were
  queued at the observed checkpoint. No new-source CI pass or merge is claimed.
- Frozen combined source `5c8d4ff4c96dc0d0418e6a3c7f0a27f504772f42`, tree
  `fd2a8c9c2254d1e5ad88df9ef3f97f05d7b6ae09`, passed the serial Node suite:
  **2,128 passed, zero failed, one optional Mixxx-corpus skip (2,129 total;
  521,205.003702 ms)**. All 38 changed JavaScript files passed syntax checks;
  its tracked checkout was clean after execution. This includes phone-save/picker
  repairs; later Data, redaction and announcement changes need separate qualification.
- Final combined application/test source `7b317e991e2c2ed49e8b70d81e6418b9aef2f3cd`,
  tree `d15b335258bacb9667995acd10a53476b8adcf19`, passed the serial Node suite:
  **2,157 passed, zero failed, one optional Mixxx-corpus skip (2,158 total;
  450,237.119403 ms)**. This run includes the Data, PDF redaction, announcement
  and phone asset-list corrections and successor regression cases. All **45**
  changed JavaScript files passed syntax checks, and the frozen tracked checkout
  remained clean after execution. Native production inputs, manifest and lockfile
  are identical to the bounded six-test/strict-Clippy checkpoint above; no new
  full Tauri or browser execution is implied. Recording this result changes only
  this report; the published application and test files retain the tested bytes.
- No hardware qualification, release or deployment is asserted.

This section is a checkpoint, not evidence that later bytes passed these gates.

## Continuation scheduling

The requested fresh-worker workflow has an enabled hourly continuation, starting
19 November 2026 at 19:46:30 America/Los_Angeles. Each run resumes live Git refs
and the newest handoff, avoids overlapping owned work, and records useful changes
and source-specific qualification. Remaining account credits are not exposed;
this schedule does not establish a credit-exhaustion stopping point.

## Remaining completion work

All current worker reviews have completed. Confirmed changes are integrated and
independently accepted within their stated scopes. The final combined source has
passed local JavaScript qualification. Hold the published PR #34 candidate steady
while its exact-source hosted tests, native/browser/platform and nightly gates
run. Merge only after applicable checks pass; further implementation belongs on
separate work until a confirmed correction or failing gate requires an update.
Keep final source IDs, successes, failures and unavailable execution scopes explicit.

Physical H-00..H-33 runs, known-reference accuracy, shared WASAPI beside real DJ
software, real MIDI identity/hot-plug/Identity Reply/GM behavior, actual VirtualDJ
format, remaining manufacturer profile research, broader incident measurement
windows/isolation outcomes, mature vinyl/DVS workflows, installer signing and
release validation remain separate open work. Fleet stays default off until its
owner database and hardware qualification. No hardware result can be inferred
from mocked browser or deterministic core tests.
