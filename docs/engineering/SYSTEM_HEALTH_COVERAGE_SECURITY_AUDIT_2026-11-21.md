# System Health coverage defensive security audit — 2026-11-21

> **Disposition: ACCEPT within the stated scope.** Frozen source, exact controls, original single-FIRST evidence, and retained copies are accepted. The selected run is 208/208. This report grants no further execution, release, or native/full-source qualification.

## 1. Decision and scope

The frozen System Health coverage implementation has no blocking security regression identified by this static review. It separates collection coverage from finding severity, keeps absent or unsuccessful collection from becoming an overall all-clear, escapes the new report metadata, retains diagnostics consent, and binds asynchronous report feedback and Retry to the captured result revision. Setup persists an optional completion flag for its explicitly declared driver-only scope. This conclusion applies to the exact freeze below and the source boundaries examined; it does not certify every possible native omission, arbitrary hostile nested JavaScript objects, native rendering, physical audio, or the entire application.

The security worker used Git object/metadata commands and Python standard-library byte, JSON, and text inspection only. It did not execute project code, Node identity/import/syntax/test/build commands, browser/native code, a scanner, a probe, a vulnerability reproduction, an extracted implementation, or an external target. It did not change source, tests, native code, permissions, defaults, dependencies, thresholds, or remote resources. No additional worker was spawned. All shell inspection used `login:false`.

The review used the code-review skill's standards/spec structure within the explicit static-only assignment. There were no tracked AGENTS, contribution, or standards files found by the targeted repository inventory. The supplied implementation, scope, contract, and current handoff define the requirements; no issue-tracker setup was needed to replace those supplied requirements.

## 2. Independent source custody

| Property | Independently verified value |
| --- | --- |
| Freeze | `2a807525c70712332e84cecbaf29dd876b5e03cd` |
| Root tree | `00c536bad160a5f81fbbc8cea1b7fe62594e2c7a` |
| Sole parent | `b7f3031a185e14a502c7e7e86c6495ea3601d73a` |
| Source correction | `148d1cfe7fbb5accbbfd7c265c8d63223b358f23` |
| Source correction parent | `2ac0cf4dc25cb17471149ba64c83b3855c319d45` |
| Integration parent ordering | Source correction, then completed round seventeen root `674e3a5b68aef0e0c2a19a05a117bdef8a11c579` |
| Tracked paths | 2,586 |
| Distinct blobs | 2,317 |
| Sum of blob bytes by tracked path | 91,604,989 |
| Top-level test files | 209 |
| Canonical source manifest SHA-256 | `11f639792299bf8b5aaf9035e94459138fd2d9ab02ce51f2c2c5f584e51765fa` |
| Original working bytes/modes | Every path matched its immutable Git blob and mode |
| Index | Every ordered path, mode, blob ID, and stage matched the freeze |
| Physical inventory | Tracked inventory exact; zero untracked files including ignored files |
| Initial and post-review status | Clean |

The auditor independently enumerated the immutable tree, obtained all 2,317 distinct blob objects, recomputed each Git object ID from its object header and complete bytes, and recomputed the freeze commit and root tree IDs. Every working file was read as bytes and its filesystem mode was compared with its immutable object. The canonical ordered array uses compact JSON and sorted keys for `{path,mode,oid,bytes,sha256}`. The root-provided identity file was consulted only afterward: its records matched the independently reconstructed array exactly.

This verifies source custody, not semantic review of every tracked file. Semantic review covered the complete changed source modules and selected tests plus the actual supporting consumers/contracts/fixtures described below.

### Complete changed-source byte pins

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `app/system-check.js` | 46738 | `2614a8fd41843be3c0cc10f19d4a61496edf6bdde19fc6be841cc7673e3e039e` |
| `app/ui/screens/system.js` | 24577 | `eeb36a4b8c9bd99393b9a5ea20f5ae4e7b4526b56633b65c56e725bee4366ecb` |
| `app/report-pdf.js` | 28172 | `c97ea4969acb7dee13079ec2b9a81344481209d873fd6a6846bf5ea042cb5549` |
| `app/ui/persistence.js` | 12945 | `86daabd083e52273ce75e759eb96499291279279d7e62612a00b983eb97f81f5` |
| `app/ui/screens/support-dialog.js` | 15919 | `8315b843f7a13e9c253f6c52648fe6ea27f57afc311b36104ab0496cb13bf280` |
| `app/ui/workflows/setup-wizard.js` | 49388 | `00bfb17baf11f42cde68b1a5950fd3bfede94dd88213e5a6c26b2cc8a938dfdb` |
| `app/setup-wizard-model.js` | 14988 | `a837b8de4367bb5df89fb6d6ebfd50a24ccf59702b66ef3bdfc3ae64e6fbeba6` |

## 3. Material reviewed

The complete `docs/engineering/SYSTEM_HEALTH_COVERAGE_IMPLEMENTATION_2026-11-21.md`, `docs/engineering/SYSTEM_HEALTH_COVERAGE_REVIEW_SCOPE_2026-11-21.md`, `docs/SYSTEM-CHECK-CONTRACT.md`, and current `docs/DECKCHEK-CONTINUATION-HANDOFF.md` were read. All seven changed modules above and all nine selected test files were read in full. The new 15 coverage cases, 19 screen cases, and one setup-model case were reviewed as actual assertions against production modules, not as test-name claims.

Supporting reads included the full service DOM fixture, signal fixture, PDF fixture, print stylesheet, pre-gig contract JSON, PDF native contract JSON, built-in preset JSON, DOM utility, live-region/toast utility, and pre-gig report module. Actual pre-gig, service-job, shell, and report consumers were traced where the changed interfaces reach them. The production portion of native `system_check.rs` was read through all three exported scan commands. Diagnostics context/redaction/serialization and wizard state persistence were traced in native source. These native sources are unchanged by this work and were not executed.

The existing driver/event/log heuristic section of `app/system-check.js` is byte-for-byte identical to the source correction parent. The native collectors, diagnostics implementation, wizard persistence, pre-gig engine, stable DOM fixture, and the unchanged selected regression test files were independently compared with that parent. No native collector, permission, threshold, or external output channel was introduced by this correction.

## 4. Static security analysis

### 4.1 Coverage is explicit and independent of fault severity

`app/system-check.js:20-61` represents each requested area as complete, partial, failed, unsupported, pending, or unscanned. A response must have literal supported status, the required top-level collection arrays, and an errors array without reported errors to become complete. A missing result remains unscanned; a rejected screen command is represented as failed; an unsupported platform is not a successful check. The explicit area subset is important: setup can honestly finish its driver check without claiming event or DJ-log collection.

`app/system-check.js:451-505` preserves real warning/error findings while suppressing clean findings when collection is partial. Summary priority still allows a real fault to determine severity. Overall all-clear requires every declared area to be complete. An informational or empty finding list without coverage evidence cannot by itself establish that required collection happened. Explicit all-unsupported coverage remains informational with a platform explanation.

These are top-level shape and reported-error checks. They do not recursively validate arbitrary hostile nested object graphs and do not certify that every native source was available. That narrower trust boundary is documented and consistent with native typed results.

### 4.2 Native omissions remain a stated limit

`src-tauri/src/system_check.rs:15-27` defines existing time, row, message, tail, file, age, and directory-depth/entry caps. The three typed response structures expose support, required arrays, and collection errors. Reported run/parse/read errors remain available to JavaScript and are represented as partial coverage or rejected attempts.

However, native source includes intentionally silent or skipped collection paths: driver PowerShell uses silent error handling for some queries; event collection uses `Get-WinEvent` with silent error handling; directory iteration and metadata lookups can discard individual unavailable entries. Empty returned data with no reported error therefore means the requested native command returned its defined result without reported errors. It is not proof that every possible driver, event source, or log file was observed. The report wording and contract preserve this boundary. This audit does not promote the unchanged native code into a universal completeness or resource-safety certification.

### 4.3 New rendered metadata follows escaping paths

`app/system-check.js:508-527` escapes coverage labels, states, details, summary, finding fields, and driver inventory values before adding them to standalone report HTML. `app/report-pdf.js:341-353` recomputes the canonical System Health summary from the findings and supplied coverage, adds the coverage summary to the printable metadata, and delegates the report body to the same escaped HTML builder. A stale caller-supplied headline does not replace current computed coverage. The surrounding report composer uses its established HTML escaping and CSS-string escaping paths.

`app/ui/screens/system.js` uses text DOM APIs or the shared `esc` helper for the new status, collection error, finding, driver, event, and log metadata. Existing test strings exercise metacharacter escaping, but this worker supplied no exploit demonstration or payload. This result is a source-level assessment of the changed data paths, not an assertion that the report builder is a general sanitizer for arbitrary HTML supplied by an untrusted caller.

### 4.4 Attempt ownership and disposal prevent stale scan state

`app/ui/screens/system.js:58-86` creates a distinct attempt object, replaces prior area data at request start, increments the result revision, and rejects duplicate pending scans. Both resolution and rejection check that the attempt still belongs to the current live screen. `:89-100` and `:160-187` disable or guard exports, period changes, and repeated controls while a relevant request is pending. Rejected or invalid native responses leave a failed area with an actionable Retry instead of converting absence to success.

Disposal at `:334-342` retires the revision and timer/listener ownership. The new pending/disposal assertions exercise stale command completion and callback suppression using a synthetic DOM. They do not establish real browser layout, native event-loop timing, or the separate inherited delayed live-announcement behavior recorded below.

### 4.5 Report capture and Retry retain result provenance

`app/ui/screens/system.js:295-318` captures findings, summary, explicit coverage, timestamp, and the current driver's result for one export. Scan replacement assigns new area objects; it does not mutate those captured results. The owner callback checks disposal, the captured result revision, and pending activity. Busy state is retained independently of rerendered button elements, and the callback restores the current controls after an export finishes.

`app/ui/persistence.js:112-149` propagates the same data, fallback, owner callback, and busy-state callback through PDF Retry. It checks the owner after lazy import and before adapter handoff, and again before feedback and fallback. Existing consumers receive a no-op default busy callback. A Retry cannot silently resample a later scan and label it as the original result.

The guarantee is intentionally bounded at adapter handoff. `app/report-pdf.js:449-480` performs its own asynchronous composition, save dialog, and native rendering after that handoff; the owner callback does not cancel an already submitted native export. Tests with fake PDF acknowledgements establish the production JavaScript control path and captured HTML, not Windows rendering, real file dialog behavior, or a physical printed document.

### 4.6 Diagnostics remains explicit, optional context

`app/ui/screens/support-dialog.js:39-49` uses the three existing commands with settled-result accounting, computes explicit coverage, and includes coverage both directly and in the canonical summary. Its reduced finding records include scan state and severity. It does not add a new native collector or an automatic remote upload.

The health option defaults off (`:66`), and native collection occurs only when that user-selected context is requested (`:100-105`, `:181-183`). Existing preview request sequencing remains in place. Native diagnostics serializes the System Health context as JSON through the existing optional part and redaction path (`src-tauri/src/diagnostics.rs:449-492,896-984,1250-1256`). The new coverage fields are structured metadata, not new HTML interpolation or an extra secret-bearing raw-data collector. This audit does not qualify a real archive or native privacy workflow from fake native acknowledgements.

### 4.7 Setup persists only the completion it actually attempted

`app/ui/workflows/setup-wizard.js:601-638` clears the previous health answer when a new quick scan starts and calls only the driver command. It passes `areas: ['drivers']` when computing coverage and stores the resulting counts plus an optional completion boolean. Rejection, unsupported execution, or replacement cannot leave an earlier successful answer presented as the new request's success.

`app/setup-wizard-model.js:72-80` accepts finite nonnegative counts and preserves completion only when it is a literal boolean. The migration/serialization path retains the same whitelist. `:253-270` distinguishes explicitly incomplete new answers while leaving legacy answers with an absent field readable. Native wizard answers are stored as a JSON object and are unchanged; the source trace confirms the additional boolean survives that existing shape. The added model case verifies false/true round trips, explicit clearing, invalid boolean omission, and incomplete summary copy; it is not native persistence execution or an end-to-end setup-window qualification.

### 4.8 Existing consumers retain their scope

Pre-gig's existing gear-filtered fault policy still consumes the unchanged fault severities and is not converted into the new full System Health coverage certification. Its synthetic analysis, preset/report, model, and storage/screen regressions remain selected. Existing service-panel consumers retain their asynchronous owner callbacks and receive the shared helper's no-op busy callback by default. No unrelated policy, audio threshold, SDK path, preset deletion implementation, Fleet default, or release gate was changed to obtain this source disposition.

### 4.9 Two inherited nonblocking follow-ups

| Priority | Source evidence | Consequence | Bounded follow-up |
| --- | --- | --- | --- |
| LOW (P3) | `app/ui/screens/system.js:84`; `app/ui/live.js:23-36`; original parent screen line 76 | Completion announcement is queued with the default always-current callback. Its 40 ms delivery can outlive explicit disposal or a newly started scan. Normal shell navigation cancels pending announcements separately. | Capture the post-run revision and pass a live/not-busy revision owner callback to `announce`. A targeted delayed-delivery assertion would be needed; current screen tests replace `setTimeout` with a no-op. |
| LOW (P3) | `app/ui/screens/system.js:241,281`; original parent lines 224,264 | Existing empty ASIO/log copy can imply broad absence during partial collection even though overall verdict and coverage clearly remain incomplete. | Phrase the empty inventory as no items returned in the available scan, or vary the wording with coverage state. |

Both behaviors were independently confirmed in the source correction parent. They are recorded to avoid overclaiming delayed-announcement ownership or collection-wide absence. They do not introduce a new overall all-clear or a blocking security regression in this change.

## 5. Selected cases and fixture limits

| Selected file, lexical order | Authored cases | Added by this change |
| --- | ---: | ---: |
| `tests/pre-gig.test.mjs` | 59 | 0 |
| `tests/pregig-storage-screen.test.mjs` | 19 | 0 |
| `tests/report-pdf.test.mjs` | 28 | 0 |
| `tests/service-panel-lifecycle.test.mjs` | 28 | 0 |
| `tests/setup-wizard-model.test.mjs` | 15 | 1 |
| `tests/support-dialog.test.mjs` | 3 | 0 |
| `tests/system-check.test.mjs` | 22 | 0 |
| `tests/system-health-coverage.test.mjs` | 15 | 15 |
| `tests/system-health-screen.test.mjs` | 19 | 19 |
| **Total** | **208** | **35** |

The auditor independently derived every test registration name and its execution order from the original source, including the per-area and nested scenario loops. There are 208 unique names: 173 existing registrations and 35 added registrations. The canonical ordered array of `{file,line,name,ordinal}` with compact sorted-key JSON has SHA-256 `19da1355909acf22efd6e6e741bf284e6c6a06f4b82d3abc2e29e8485fe9ce79`. A later exact match from peers was corroboration, not the derivation source.

The coverage cases exercise rejected/invalid responses, complete and partial results, preservation of real fault severity, mixed and all-unsupported states, absent and pending results, declared driver-only scope, serialized scan metadata, and canonical HTML/PDF parity. The screen cases use the real screen and production report adapters with a stable minimal DOM, deferred native acknowledgements, and fake save/render responses. They exercise per-area Retry, pending button/period/export guards, failure snapshots, stale/disposed scans, PDF ownership across replacement, actual diagnostics context collection, and Retry busy-state restoration.

The complete service DOM fixture is intentionally small: it implements the selectors, attributes, event dispatch, and element behavior needed by these consumers. It is not a browser layout engine. Its stable hosts prevent cached live-region references from being silently rebound between cases, but the screen tests' no-op timers exclude real delayed announcement delivery. Existing signal fixtures generate deterministic synthetic samples from seeded functions; they do not capture physical devices or replace the inherited full-source audio HOLD. The complete saved PDF fixture is static HTML/CSS with deterministic chart and table data; native acknowledgements are simulated.

The selected `tests/report-pdf.test.mjs:420` writes its tracked fixture if `UPDATE_FIXTURES` is present. Any acceptable execution controls therefore must reject the presence of this variable, including an empty value, before project execution. They must also reject `NODE_OPTIONS`, audio diagnostics overrides, and external corpus inputs. The source inventory remained an authored-only count until the original authorized execution was independently checked; the current scoped result is recorded in section 6.

### Historical evidence used only for budgeting

Both retained originals were read in full by the independent TAP parser. All original outcome numbers were contiguous, their plans matched their row counts, and the complete diagnostic/summary records were retained. Exact names, original case numbers, outcomes, and decimal durations were then bound to the selected source inventory. This does not reuse an old pass as a current-round pass.

| Retained original | Bytes | SHA-256 | Selected older rows |
| --- | ---: | --- | ---: |
| `docs/engineering/evidence/link-consent-functional-2026-11-21/full/run.tap` | 555,767 | `e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953` | 154 |
| `docs/engineering/evidence/pregig-recovery-functional-2026-11-21/focused/run.tap` | 31,900 | `655d53c1ef68f1d62eefdb06834b840bb0b7bd8c60da22019ac82cd8b4e25cdc` | 19 |

All 173 selected historical rows passed without skip or TODO. Their exact Decimal duration sum is **14,913.288587 ms**. The only unmatched source registrations are exactly the 35 added cases. The complete older full-source TAP still has case 53 failing with the explicit relative-gain diagnostic, case 964 optionally skipped for the local Mixxx corpus, and totals of 2,420 tests / 2,418 passes / one failure / one skip. None of the selected historical rows is that skipped corpus case. The earlier focused original has 132 passing rows. These facts support a bounded budget assessment and preserve the broader HOLD; they do not authorize a rerun or a current execution.

## 6. Execution controls and original evidence

### Exact control acceptance

Security separately accepted the following exact, unexecuted controls after reading every line of the recorder, configuration, launcher, command, and proposal manifest. It independently read and compared the complete source and case JSON records. This disposition does not authorize execution; only root may issue the distinct FIRST authorization after all three control acceptances.

| External control | Bytes | Lines | Mode | SHA-256 |
| --- | ---: | ---: | --- | --- |
| `deckchek-system-health-round18-focused-recorder.py` | 27,466 | 479 | `0600` | `e1f06e547e65c992b09f2354777a9d816e52b02a925d9ad012d7e0941cd9718b` |
| `deckchek-system-health-round18-focused-selection.json` | 28,712 | 480 | `0600` | `ef68e00e9c9749d5cb294cbdc90b93326616ba62dc1e8fe8098da35f9bc0522a` |
| `deckchek-system-health-round18-authorized-launcher.py` | 4,995 | 95 | `0600` | `aceb51fb67f805280a8f5090cbd7fbc1b4895596463f02c44eddc52126985f58` |
| `deckchek-system-health-round18-authorized-command.txt` | 163 | 1 | `0600` | `0649a232312480d98de0a73d601adcf5f98e67ace93c9e7f4113d943b532ec3c` |
| `system-health-functional-round18-source-identity.json` | 570,148 | 1 | `0644` | `94581a9ecc12e1d0eede372336b42368b9876693431283b196894ded92ffb3b2` |
| `system-health-functional-round18-case-inventory.json` | 95,393 | 2,794 | `0644` | `c1baf00572ad94123b03a0d03a944dfa7da232ccdf05e5154e5e4958ce3268a1` |
| `deckchek-system-health-round18-control-review-manifest.json` | 9,841 | 257 | `0600` | `f3f9d913a3a0fcd90260ed7ae7f81ad04bf08cbe8a6b3e88bc453624a2af2188` |

The approved launch command uses the pinned isolated Python interpreter with `-I` and the exact launcher path, from `/workspace/scratch/6f2247f2f463/deckchek-system-health-functional`, with `login:false`. The security worker did not run it. The launcher compares all pinned control/data/runtime files before replacing itself with the exact recorder. The recorder retains the exact launcher, command, configuration, itself, source map, and case inventory in its original output. A pre-execution launcher failure leaves the raw output directory absent and permits no automatic retry.

The auditor independently verified every original functional-worktree byte, exact filesystem mode, Git blob ID, stage-zero index entry, all-H index flags, physical/tracked/untracked/ignored inventory, and the 209-test inventory. The functional branch, head, tree, and sole parent match the approved freeze. Read-only Git calls disabled optional locks and fsmonitor. The complete raw index stayed unchanged at **325,991 bytes**, SHA-256 `ad1a0910ae3fe8cfa1aaccf7af7ed66819b3c1cebdb13d9f425fa741f1b4f724`. Every source-map record equals the independent source map; every case record and all 173 historical bindings equal the independent derivation. At control acceptance, the raw output directory did not exist and all forbidden environment keys were absent.

| Pinned executable | Bytes | Mode | SHA-256 |
| --- | ---: | --- | --- |
| `/usr/bin/git` | 4,082,768 | `0755` | `356db14e102d68a1a37d8a1ac577dfd678d45d46e92f468bef8b7154e7bfdc60` |
| `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` | 126,951,512 | `0755` | `acbe4b8d9153b841ed0697cbfc4f93e767386620edb745ab9358306c0a6f31aa` |
| `/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3` | 30,894,944 | `0755` | `fa67443527ed9647f760d807e2a38f26340757123e643c4639cf273ed15d5ea7` |

The Python path resolves to the pinned `python3.12` file; its expected symlink status was checked. The Git and Node paths are regular, non-symlink files at the pinned resolved locations. Executable files were hashed as data. No Node identity or other Node call was made by this security worker.

The recorder rejects any present `UPDATE_FIXTURES`, `NODE_OPTIONS`, or `MIXXX_CONTROLLERS_DIR`, and every variable beginning `DECKCHEK_AUDIO_`, including an empty value, before its first Node invocation (recorder lines 353–355). The selected fixture-writing branch is therefore excluded by an explicit presence guard. The inherited environment is otherwise used with only the pinned Node directory prefixed to PATH.

The only reachable Node invocations are `--version`, the specified `-p` process identity expression, and one `--test --test-concurrency=1 --test-reporter=tap` invocation of the nine original selected files in lexical order. Identity calls each have a 10-second deadline and immediate process-group KILL on timeout. The project gets process-group TERM at 55 seconds and KILL at 60 seconds measured from its launch attempt, followed only by a bounded five-second reap. A timeout, failure, or preflight denial has no automatic retry. The 14,913.288587 ms historical total is rounded to 15 seconds for planning, with 20 seconds for new/changed cases and 20 seconds for startup and host variance; the five-second reap grants no extra project work.

The recorder exclusively creates each output file and refuses an existing raw output directory. The successful path retains exactly 39 original files: the complete before/after source maps, source state/tree, working/index/flag/physical/test inventories and raw index bytes; original Node identity stdout/stderr; original project TAP/stderr; exact control/data copies; ordered names and outcomes; selected-source identities; and running/final result records. Error paths preserve their tracebacks separately. Success requires source, controls, runtime files and raw index to remain identical, exactly two successful identities, a successful untimed-out project invocation, 208 exact ordered names/ordinals with no skipped or TODO outcomes, and the exact footer and plan.

### Original FIRST evidence

After all three source and exact-control acceptances, root separately authorized the current functional worker's single exact FIRST through the accepted launcher. Functional ran that command once and retained the originals. The security worker then read all 1,258 original TAP lines, the full final and running records, original command tool chunks, both runtime stdout records, all three stderr streams, every source/index/inventory record, and all retained control/data files as bytes or JSON. It executed no control or project code.

Independent parsing required each of the 208 source names and ordinals to match its exact subtest header and outcome, followed by one finite nonnegative duration and the expected test diagnostic block. Every outcome is `ok`, with no skip or TODO directive. The complete plan and footer are exact: **208 tests, 208 passes, zero failures, zero cancellations, zero skips, zero TODOs, zero suites**. TAP elapsed time is **15,821.975168 ms**; recorded project wall time is **15.929411565994087 seconds**. The project, both identity calls, and launcher completed with exit code 0, without timeout, signal, or reap timeout. All three stderr streams are empty.

The retained identities report **Node v24.22.3, Linux x64**, using the exact approved executable and argument lists, and the pinned Python file reports version 3.12.14. The version identity took 0.008570441001211293 seconds and the process identity took 0.06395462300133659 seconds. The project began at `2026-11-21T15:27:03.822566+00:00` and ended at `2026-11-21T15:27:19.752528+00:00`, consistent with the recorded monotonic elapsed time. These are observations from the authorized functional evidence, not runtime commands performed by this auditor.

All source-map records, source tree/state, physical/tracked/untracked/ignored inventories, 209-test inventories, stage-zero index entries, flags, and raw index bytes match the independent frozen expectations before and after the run. The auditor also reread every original functional working file after the run and checked its exact mode, byte count, SHA-256, and Git blob ID. At that immediate post-run inspection, the working raw index still matched both retained originals and its approved pin. Every captured control file equals its accepted external bytes, and all three runtime files still match their approved bytes, modes, resolved locations, and symlink status. Environment rejection records are empty and fixture updating remains excluded.

The original output directory contains exactly **39 files totaling 5,041,458 bytes**, with no unexpected file. The canonical compact sorted-key ordered `{path,bytes,sha256}` manifest has SHA-256 `7c11fc5eb34f3205e2f2b4142cc2f1157c8aed5711d4c9457a01cc113caa1288`. The separate original command record is 1,540 bytes, SHA-256 `1e506adcda63593eefaa069d4d31759ed0dbbd663692f194af4a436e8b5242c6`; it contains the exact approved command, correct working directory and `login:false`, three original tool chunks for one session, final exit 0, and a combined output matching the recorder result. No retry occurred.

| Original retained file | Bytes | SHA-256 |
| --- | ---: | --- |
| `authorized-command.txt` | 163 | `0649a232312480d98de0a73d601adcf5f98e67ace93c9e7f4113d943b532ec3c` |
| `authorized-launcher.py` | 4,995 | `aceb51fb67f805280a8f5090cbd7fbc1b4895596463f02c44eddc52126985f58` |
| `authorized-selection.json` | 28,712 | `ef68e00e9c9749d5cb294cbdc90b93326616ba62dc1e8fe8098da35f9bc0522a` |
| `expected-case-names.json` | 17,005 | `7e86a40b3089c8e5e2da3198b36bb75e950ae5477a2ca4ce632e135555dffa7f` |
| `full-source-after.json` | 570,148 | `94581a9ecc12e1d0eede372336b42368b9876693431283b196894ded92ffb3b2` |
| `full-source-before.json` | 570,148 | `94581a9ecc12e1d0eede372336b42368b9876693431283b196894ded92ffb3b2` |
| `ignored-files-after.json` | 3 | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| `ignored-files-before.json` | 3 | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| `independent-case-inventory.json` | 95,393 | `c1baf00572ad94123b03a0d03a944dfa7da232ccdf05e5154e5e4958ce3268a1` |
| `independent-source-identity.json` | 570,148 | `94581a9ecc12e1d0eede372336b42368b9876693431283b196894ded92ffb3b2` |
| `index-after.json` | 365,237 | `9786ce6d68c119ac9dcf1d53999940197812bc43b3594ea3d90f7f9d46f78c96` |
| `index-before.json` | 365,237 | `9786ce6d68c119ac9dcf1d53999940197812bc43b3594ea3d90f7f9d46f78c96` |
| `index-flags-after.json` | 160,944 | `b2548d56571cde2ba003c81b8aa6a5175a4c4ab879c85c17240c7d93bf2c3742` |
| `index-flags-before.json` | 160,944 | `b2548d56571cde2ba003c81b8aa6a5175a4c4ab879c85c17240c7d93bf2c3742` |
| `node-runtime.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `node-runtime.stdout` | 782 | `292ce6437aa16270ee5bdc058956ada71eb309cd3bdad80675b1277cee648604` |
| `node-version.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `node-version.stdout` | 9 | `4409d3bfa08b82f385bd424eeda65fc63b756129f0e89e82df77f1fecafccc14` |
| `ordered-outcomes.json` | 40,193 | `b997ea0e14fb313108777b40f02c6ac953ea6942f51ccea17cd8ea94e603780a` |
| `physical-files-after.json` | 155,772 | `48eb24bbe794e3a059c41201a20c11127a932e843e88c538c568c4db9a1a3f37` |
| `physical-files-before.json` | 155,772 | `48eb24bbe794e3a059c41201a20c11127a932e843e88c538c568c4db9a1a3f37` |
| `raw-index-after.bin` | 325,991 | `ad1a0910ae3fe8cfa1aaccf7af7ed66819b3c1cebdb13d9f425fa741f1b4f724` |
| `raw-index-before.bin` | 325,991 | `ad1a0910ae3fe8cfa1aaccf7af7ed66819b3c1cebdb13d9f425fa741f1b4f724` |
| `result.json` | 16,273 | `f6dc907791d3ea2c1c95a7df08e6c5f6ebc2ae69f1910b193427189906c9372a` |
| `run-focused-node.py` | 27,466 | `e1f06e547e65c992b09f2354777a9d816e52b02a925d9ad012d7e0941cd9718b` |
| `run.tap` | 46,741 | `86183d4b10829868a892bb738171f711b560fa3eaeb79a87cdc10d200b02d1dc` |
| `running.json` | 10,548 | `5faca9f8e6b64700c232c0af7a7c91ee77dc413a45a751b9fa50584197268602` |
| `selected-source-identities.json` | 2,002 | `835c87214d17ef68ee00bcd4ba794b2790be610a4429621a242db595ffdfbdcd` |
| `source-state-after.json` | 269 | `971455e3591e0326dbbcfd0a4d0d3b3faa21e59f22e9594d7dd01925d642069d` |
| `source-state-before.json` | 269 | `971455e3591e0326dbbcfd0a4d0d3b3faa21e59f22e9594d7dd01925d642069d` |
| `source-tree-after.json` | 339,377 | `d9a91b35b80517e279cc146dcb439053bc2d4f9bf7b4374bf87da165e61f72aa` |
| `source-tree-before.json` | 339,377 | `d9a91b35b80517e279cc146dcb439053bc2d4f9bf7b4374bf87da165e61f72aa` |
| `stderr.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `top-level-tests-after.json` | 16,998 | `f5431ba070f578148e493c77d43412281ec3839cc7a392a8a04477570182d3af` |
| `top-level-tests-before.json` | 16,998 | `f5431ba070f578148e493c77d43412281ec3839cc7a392a8a04477570182d3af` |
| `tracked-files-after.json` | 155,772 | `48eb24bbe794e3a059c41201a20c11127a932e843e88c538c568c4db9a1a3f37` |
| `tracked-files-before.json` | 155,772 | `48eb24bbe794e3a059c41201a20c11127a932e843e88c538c568c4db9a1a3f37` |
| `untracked-files-after.json` | 3 | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| `untracked-files-before.json` | 3 | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |

The evidence supports the selected production JavaScript behavior and source custody only. Fake native collection/save/render acknowledgements and the minimal DOM remain the same seams reviewed before execution. There is no real Windows collector, WebView2 rendering, native archive, live browser layout, real wizard persistence, physical equipment, or full-source qualification from this run. The inherited full-source audio failure and native queues are unchanged.

### Retained report-copy verification

Root opened a bounded packaging window only after all three original-evidence ACCEPT dispositions. The security auditor independently accepted the retained package under `docs/engineering/evidence/system-health-coverage-functional-2026-11-21/` after reading every file as bytes or JSON. Every `focused/` file equals its already inspected raw original directly. The 39 focused copies retain the exact byte counts and SHA-256 values in the original-file table above.

The complete package contains **49 files / 5,234,454 bytes**, all regular non-symlink files with Git mode `100644` and filesystem mode `0644`. Its full canonical compact sorted-key ordered `{path,bytes,sha256,mode,lines}` manifest has SHA-256 **`926240ff713ee9fbbcbb5af922a3b9d2a55fda58e89630d0e74700ac6fecbc93`**. Binary index files use `lines: null`; text line counts include the final newline. All 47 source-to-copy pairs in the custody record were compared with their actual external source bytes and original modes. The other two files are the custody record itself and the evidence manifest.

The evidence manifest accurately covers 48 entries and explicitly excludes its own bytes. Its 48-entry canonical digest is `b945fb52ec34ef0fd4098e56e98c16401c1461b11d9c93846c6300f4e2b8c966`; that differs from the full 49-entry digest by design. The functional raw manifest's `{name,bytes,sha256,mode}` schema hashes to `4589e210609449652e0727b361adeb3866cd59b674ea1768ba0d705e4544fe72`; the auditor's original `{path,bytes,sha256}` schema and root's mode-inclusive variant were independently reconciled to the same 39 files. These schema differences do not represent different run outputs.

| Supplemental retained record | Bytes | SHA-256 |
| --- | ---: | --- |
| `control-review-manifest.json` | 9,841 | `f3f9d913a3a0fcd90260ed7ae7f81ad04bf08cbe8a6b3e88bc453624a2af2188` |
| `current-case-results.json` | 119,163 | `e77f15d386c6e9b82c951f704414b613d52b286d51b9cb3eacd76e98d27fbdd7` |
| `evidence-manifest.json` | 10,526 | `85a701cd151123eeb3fba64eacd217f8634bd3e88ac1624aced7672439c98eab` |
| `first-authorization.txt` | 2,211 | `03e30647fde8d3ba263932578f2cc1bfb81ff8dfb31048e36f7d0ea173b4fb8e` |
| `independent-evidence-verification.json` | 2,685 | `dcf82092ab04ce2b0e0b130ed6e0c8e36ed95631e5592de78f518038f8440c13` |
| `original-command-result.json` | 1,540 | `1e506adcda63593eefaa069d4d31759ed0dbbd663692f194af4a436e8b5242c6` |
| `raw-evidence-manifest.json` | 7,266 | `d52379471e642bcdd13f194489bc293d54a02900e06db7a12cbe91f1355aba76` |
| `retention-custody.json` | 21,667 | `e32ffafc6af563235cc8c28d6b238f22e95e64060a85b381a63173031f9efb01` |
| `root-first-proof.json` | 10,832 | `d73f6894e7cc04001e3e2f4b9c458c75fab95893658bc8ca346b9b70f5216836` |
| `root-preflight-proof.json` | 7,265 | `3d16c0f8d6ee1d2a8bdc1cf1280673ef456e96ff677c811fc57b26d1f6bfe6fd` |

Every current-case record was re-derived from the independent source inventory, historical bindings, and original TAP outcome/duration lines. The exact sum of per-case work is **15,044.333251 ms**, distinct from the TAP's complete elapsed duration. Per-file case counts and decimal duration sums match the supplemental proof. The consumed FIRST authorization, original tool chunks, accepted controls, root preflight and original-evidence records are retained verbatim and remain records of the completed single run; they authorize no future run.

Packaging preserved all **2,586 original working paths, exact bytes, modes, Git blob IDs, and stage-zero index entries**. Independent physical and untracked inventories contained only the 49 authorized evidence additions, with no ignored extra files. The original runtime and TAP streams were untouched. The security worktree stayed at the clean freeze while this retained-copy review ran. Later staging of authorized report/evidence additions may change a staging index; the execution-time raw-index pin remains the invariant for the recorded FIRST snapshots, while every original source entry remains invariant through sealing.



## 7. Preserved release and historical limits

The inherited complete-source result remains **HOLD: 2,420 tests, 2,418 passes, one failure, and one optional skip**. The failure is the relative-gain result of -101 dB at a played level of -30 dBFS. No synthetic scoped success here changes that result, weakens thresholds, or infers that exhausted credits are the cause.

The qualified main remains `e36ddc41806b0f6639474f207e3b339e063a6e25`; fixed Backup/Service baseline remains `34afefa58ac5e8346006087587b113c2a82d5a39`; fixed Fleet default-off baseline remains `69fc06eb471dfb00de544bbe233c0f5dc95402e8`. Native issue #85 SDK/owner/cache/startup/exit work is unfinished. The pre-existing active/retained-unsaved native preset deletion association (#87) and Population #88 remain queued. No native workaround, additional permission, full-suite rerun, release, deployment, remote write, or billed job is authorized by this audit.

## 8. Complete ordered case inventory and original outcomes

The source line is the registration line; loop-generated cases intentionally share a line. Every source registration was independently bound to the original FIRST TAP outcome and exact duration. All 208 cases passed without a skip or TODO directive. Durations below are original per-case milliseconds, not a substitute for the complete run duration. HTML metacharacters in names are escaped only for faithful Markdown display.

| Ordinal | Source | Exact case name | Outcome | Duration (ms) |
| ---: | --- | --- | --- | ---: |
| 1 | `tests/pre-gig.test.mjs:26` | timecode: clean deck passes with no fix needed | PASS | 1.865173 |
| 2 | `tests/pre-gig.test.mjs:32` | timecode SNR: 25 passes, 24.9 amber, 20 amber, 19.9 red (AC-3 action and DVS link) | PASS | 1.082047 |
| 3 | `tests/pre-gig.test.mjs:43` | timecode balance: 1.5 passes, 1.6 amber, 3 amber, 3.1 red, sign does not matter | PASS | 0.488774 |
| 4 | `tests/pre-gig.test.mjs:51` | timecode phase error: 10 passes, 10.1 amber, 20 amber, 20.1 red | PASS | 0.376246 |
| 5 | `tests/pre-gig.test.mjs:59` | timecode dropouts: 0 passes, 1 amber, 2 red | PASS | 0.31315 |
| 6 | `tests/pre-gig.test.mjs:67` | timecode speed: 1% passes, 1.1% amber (pitch), 5% amber, 5.1% red means wrong format | PASS | 0.390898 |
| 7 | `tests/pre-gig.test.mjs:77` | timecode: worst metric wins, every issue gets one fix, unverified format warns | PASS | 0.374543 |
| 8 | `tests/pre-gig.test.mjs:88` | timecode: no signal is red with needle, switch and cable advice; missing evidence is skipped, errors are amber-level error | PASS | 0.355174 |
| 9 | `tests/pre-gig.test.mjs:101` | timecode: capture problems become actions, not crashes | PASS | 0.489015 |
| 10 | `tests/pre-gig.test.mjs:121` | signal level: -50 dBFS passes, -50.1 on either channel is red and names the channel | PASS | 0.565119 |
| 11 | `tests/pre-gig.test.mjs:132` | hum: 40 dB below the carrier is amber, 25 dB is red, above 40 passes; hum below the floor margin is ignored | PASS | 0.427472 |
| 12 | `tests/pre-gig.test.mjs:142` | hum that could not be measured is amber with a retry, never a silent pass | PASS | 0.177327 |
| 13 | `tests/pre-gig.test.mjs:151` | audio: missing interface is red with connection and Sound-settings actions; sample-rate mismatch is amber | PASS | 0.492751 |
| 14 | `tests/pre-gig.test.mjs:166` | midi: present passes, optional missing is amber, required missing is red, no backend is unsupported | PASS | 0.382295 |
| 15 | `tests/pre-gig.test.mjs:180` | headphones: yes passes, no is red with cue advice, skip or none is skipped | PASS | 0.282886 |
| 16 | `tests/pre-gig.test.mjs:196` | software: crash within 1 h red, within 24 h amber, older passes; boundaries inclusive | PASS | 2.313517 |
| 17 | `tests/pre-gig.test.mjs:212` | software: not installed and not running are amber with actions; no backend is unsupported | PASS | 0.28568 |
| 18 | `tests/pre-gig.test.mjs:222` | system: driver and event findings filtered to the preset gear, warnings amber, errors red, unsupported excluded | PASS | 3.634472 |
| 19 | `tests/pre-gig.test.mjs:242` | evidence errors become "Check could not run" with a retry for every kind | PASS | 0.565851 |
| 20 | `tests/pre-gig.test.mjs:253` | every red or amber result carries a fix with a label and plain-English text | PASS | 0.460733 |
| 21 | `tests/pre-gig.test.mjs:272` | rollUp matrix (AC-2): fail is red, warn or error is amber, skipped required is incomplete, else green | PASS | 0.730919 |
| 22 | `tests/pre-gig.test.mjs:291` | rollUp: unsupported steps are excluded from the verdict and mark the check partial (AC-5) | PASS | 0.177147 |
| 23 | `tests/pre-gig.test.mjs:301` | rollUp: top problems sorted red, amber, then skipped required; copy matches the spec wording | PASS | 0.287031 |
| 24 | `tests/pre-gig.test.mjs:312` | buildPlan orders parallel steps first, then per-deck steps, then the headphone cue | PASS | 0.373441 |
| 25 | `tests/pre-gig.test.mjs:323` | buildPlan honours skip and only, drops MIDI and software when the preset has none, and stays inside the 120 s budget | PASS | 0.363416 |
| 26 | `tests/pre-gig.test.mjs:338` | built-in presets validate and reference the owner's real gear profile ids and known formats | PASS | 0.698149 |
| 27 | `tests/pre-gig.test.mjs:353` | built-in presets load through loadBuiltinPresets and bad ones are reported | PASS | 0.746833 |
| 28 | `tests/pre-gig.test.mjs:366` | validatePreset: bad deck ids, duplicates, inputs, formats, rates, MIDI and gear references | PASS | 0.769587 |
| 29 | `tests/pre-gig.test.mjs:391` | presets: newer versions are read-only, import rejects &gt;256 kB and junk, export/duplicate round-trip (AC-8) | PASS | 2.928952 |
| 30 | `tests/pre-gig.test.mjs:419` | presetFromEquipment builds a valid preset from real profiles; deck B defaults to inputs 3-4 and the format comes from the media library | PASS | 0.680593 |
| 31 | `tests/pre-gig.test.mjs:436` | formatForMedia resolves timecode media only, from the library, in any container shape | PASS | 0.269845 |
| 32 | `tests/pre-gig.test.mjs:444` | the built-in rigs on a multi-pair interface put deck A on 1-2 and deck B on 3-4 (Traktor Audio 8 DJ) | PASS | 0.329475 |
| 33 | `tests/pre-gig.test.mjs:450` | namesMatch is forgiving but refuses tiny fragments | PASS | 0.13272 |
| 34 | `tests/pre-gig.test.mjs:459` | diffRuns lists which steps changed and whether they improved (AC-6) | PASS | 0.526541 |
| 35 | `tests/pre-gig.test.mjs:480` | synthetic Traktor MK2 timecode from the generator passes both deck steps | PASS | 696.048647 |
| 36 | `tests/pre-gig.test.mjs:487` | synthetic: noisy carrier is amber then red as the SNR falls (real analyzeTimecode) | PASS | 1255.829363 |
| 37 | `tests/pre-gig.test.mjs:495` | synthetic: one muted channel is red, naming the channel; silence is a no-signal red | PASS | 515.502997 |
| 38 | `tests/pre-gig.test.mjs:508` | synthetic: dropouts and a wrong-format record are caught | PASS | 1122.21455 |
| 39 | `tests/pre-gig.test.mjs:517` | synthetic hum: 50 Hz and 60 Hz families are detected and graded against the carrier | PASS | 3081.279402 |
| 40 | `tests/pre-gig.test.mjs:535` | synthetic needle-up hum is measured on the lifted segment | PASS | 373.916324 |
| 41 | `tests/pre-gig.test.mjs:542` | summarizeTimecode exposes plain numbers and handles failures | PASS | 378.948117 |
| 42 | `tests/pre-gig.test.mjs:568` | runPregig: an all-ready rig produces a green verdict with every automatic step passing (AC-1) | PASS | 590.825865 |
| 43 | `tests/pre-gig.test.mjs:583` | runPregig: deck B captures input pair 3-4 and deck A pair 1-2, so a two-deck rig can be green | PASS | 1182.483992 |
| 44 | `tests/pre-gig.test.mjs:593` | runPregig: a pair the interface does not offer is reported as no such input, not a failure | PASS | 1196.168447 |
| 45 | `tests/pre-gig.test.mjs:609` | deckPairFirst maps zero-based deck inputs to the 1-based first channel of a stereo pair | PASS | 0.191467 |
| 46 | `tests/pre-gig.test.mjs:618` | runPregig: audio interface missing is red, signal steps are skipped (blocked) and nothing is captured (AC-4) | PASS | 0.470427 |
| 47 | `tests/pre-gig.test.mjs:632` | runPregig: a thrown step is an error row, the verdict is amber and the other steps still run | PASS | 588.245116 |
| 48 | `tests/pre-gig.test.mjs:642` | runPregig: Esc cancels, finished steps are kept and the rest are skipped (cancelled) (AC-7) | PASS | 618.554198 |
| 49 | `tests/pre-gig.test.mjs:658` | runPregig: manual time is reported separately and excluded from the duration | PASS | 575.529406 |
| 50 | `tests/pre-gig.test.mjs:668` | runPregig: orchestration overhead with instant mocked captures stays far below 5 s | PASS | 24.286399 |
| 51 | `tests/pre-gig.test.mjs:675` | runPregig: CAPTURE_BUSY offers to stop the other capture, retries once and records the choice | PASS | 590.005422 |
| 52 | `tests/pre-gig.test.mjs:690` | runPregig: one capture feeds both deck steps; only/skip re-run just the chosen steps | PASS | 570.175049 |
| 53 | `tests/pre-gig.test.mjs:701` | runPregig: needle-up hum asks the user, captures the lifted segment and grades it | PASS | 423.968871 |
| 54 | `tests/pre-gig.test.mjs:715` | runPregig: no desktop backend leaves required steps skipped and the verdict incomplete (AC-5) | PASS | 0.294622 |
| 55 | `tests/pre-gig.test.mjs:724` | createNativeDeps drives the Tauri commands with the pre-gig capture holder and captures the deck input pair | PASS | 0.504348 |
| 56 | `tests/pre-gig.test.mjs:745` | toRunInput maps a run to the pregig_save_run contract, redacting Windows user paths | PASS | 590.653956 |
| 57 | `tests/pre-gig.test.mjs:762` | createPregigApi (native) sends exactly the contract argument names | PASS | 0.438248 |
| 58 | `tests/pre-gig.test.mjs:780` | createPregigApi (browser) stores runs and presets locally with the same shapes | PASS | 2.603322 |
| 59 | `tests/pre-gig.test.mjs:807` | contract examples are real step results shapes (states the database accepts) | PASS | 0.158649 |
| 60 | `tests/pregig-storage-screen.test.mjs:77` | Pre-gig screen keeps unavailable preset storage visible across tabs and retries without silently choosing a rig | PASS | 37.819949 |
| 61 | `tests/pregig-storage-screen.test.mjs:92` | Pre-gig screen distinguishes unavailable History from confirmed empty History and recovers on Retry | PASS | 2.850915 |
| 62 | `tests/pregig-storage-screen.test.mjs:106` | Pre-gig screen retains previously loaded History with a persistent unavailable message after a failed refresh | PASS | 3.690927 |
| 63 | `tests/pregig-storage-screen.test.mjs:118` | Pre-gig preset Save keeps the same draft and inline error after denied persistence, then confirms one successful retry | PASS | 5.465454 |
| 64 | `tests/pregig-storage-screen.test.mjs:136` | Pre-gig preset Save coalesces repeated clicks and keeps the dialog open while persistence is pending | PASS | 3.562835 |
| 65 | `tests/pregig-storage-screen.test.mjs:148` | Pre-gig a failed pending preset save restores draft editing and preserves every entered value for retry | PASS | 3.831609 |
| 66 | `tests/pregig-storage-screen.test.mjs:168` | Pre-gig keeps an acknowledged preset and truthful success when the subsequent list refresh is unavailable | PASS | 2.768771 |
| 67 | `tests/pregig-storage-screen.test.mjs:180` | Pre-gig an acknowledged preset save finishes while an optional refresh is still pending | PASS | 3.099038 |
| 68 | `tests/pregig-storage-screen.test.mjs:191` | Pre-gig actual Retry and shell Save retain the completed result and never claim persistence before it succeeds | PASS | 12.496642 |
| 69 | `tests/pregig-storage-screen.test.mjs:211` | Pre-gig saving a different preset keeps an unsaved check attached to the rig it actually tested | PASS | 6.266358 |
| 70 | `tests/pregig-storage-screen.test.mjs:225` | Pre-gig Done preserves an unsaved result until the user confirms discarding it | PASS | 9.643593 |
| 71 | `tests/pregig-storage-screen.test.mjs:225` | Pre-gig choosing another preset preserves an unsaved result until the user confirms discarding it | PASS | 14.872231 |
| 72 | `tests/pregig-storage-screen.test.mjs:225` | Pre-gig running everything again preserves an unsaved result until the user confirms discarding it | PASS | 11.576838 |
| 73 | `tests/pregig-storage-screen.test.mjs:235` | Pre-gig a late failed History request cannot replace a newer successful read | PASS | 1.353064 |
| 74 | `tests/pregig-storage-screen.test.mjs:245` | Pre-gig disposal retires a pending History presentation and the Save callback | PASS | 0.853332 |
| 75 | `tests/pregig-storage-screen.test.mjs:254` | Pre-gig import retains the parsed draft after a failed save and retries without picking the file again | PASS | 3.511427 |
| 76 | `tests/pregig-storage-screen.test.mjs:271` | Pre-gig displays future-version presets read-only without running or rewriting their contents | PASS | 2.244863 |
| 77 | `tests/pregig-storage-screen.test.mjs:303` | Pre-gig PDF keeps the tested interface after the same saved preset is edited | PASS | 9.878896 |
| 78 | `tests/pregig-storage-screen.test.mjs:319` | Pre-gig PDF preparation cannot export or announce a result retired before its handoff | PASS | 4.734386 |
| 79 | `tests/report-pdf.test.mjs:33` | suggestPdfName: pattern, kinds, local timestamp | PASS | 1.614587 |
| 80 | `tests/report-pdf.test.mjs:41` | deviceSlug: unicode, invalid Windows chars, reserved names, 40-char cap | PASS | 0.300141 |
| 81 | `tests/report-pdf.test.mjs:54` | cssString: quotes, backslashes and markup cannot break out of the &lt;style&gt; block | PASS | 0.403967 |
| 82 | `tests/report-pdf.test.mjs:63` | formatStamp is local YYYY-MM-DD HH:mm | PASS | 0.205539 |
| 83 | `tests/report-pdf.test.mjs:70` | defaultPaper: Letter for US-style regions, A4 elsewhere | PASS | 2.701089 |
| 84 | `tests/report-pdf.test.mjs:75` | normalizePdfOptions / readPdfSettings | PASS | 1.060013 |
| 85 | `tests/report-pdf.test.mjs:90` | niceTicks: covers the range with 1/2/2.5/5 x 10^n steps | PASS | 0.750228 |
| 86 | `tests/report-pdf.test.mjs:108` | finite but unrepresentable chart axes fail closed with a visible PDF warning | PASS | 5.559986 |
| 87 | `tests/report-pdf.test.mjs:132` | decimate keeps endpoints and caps the count | PASS | 0.790057 |
| 88 | `tests/report-pdf.test.mjs:141` | renderChartSvg: vector SVG, selectable text, escaped labels, strokes &gt;= 0.75 pt on A4 | PASS | 0.703067 |
| 89 | `tests/report-pdf.test.mjs:157` | severity icons differ by shape and keep the text label (AC-5) | PASS | 0.310467 |
| 90 | `tests/report-pdf.test.mjs:167` | extractReportParts: styles from head, body only, scripts dropped | PASS | 0.469696 |
| 91 | `tests/report-pdf.test.mjs:174` | buildPrintableReport(run): @page header/footer, counter, no script, escaped user strings, SVG charts | PASS | 1.209167 |
| 92 | `tests/report-pdf.test.mjs:191` | print CSS: theme-independent light palette, rows unsplit, thead repeats (AC-2, AC-4) | PASS | 1.62969 |
| 93 | `tests/report-pdf.test.mjs:205` | partial: a failing chart becomes a placeholder and a warning | PASS | 1.299152 |
| 94 | `tests/report-pdf.test.mjs:212` | run: raw measurement table only when asked; row caps | PASS | 3.364076 |
| 95 | `tests/report-pdf.test.mjs:223` | device: serial redaction option, title and file name | PASS | 2.693918 |
| 96 | `tests/report-pdf.test.mjs:235` | systemHealth: every finding has icon + severity text + evidence (AC-5) | PASS | 2.045324 |
| 97 | `tests/report-pdf.test.mjs:258` | registerPrintableKind: later features add kinds without editing report-pdf.js | PASS | 0.839282 |
| 98 | `tests/report-pdf.test.mjs:303` | exportPdf: WebView2 path when pdf_render succeeds (AC-1), exact contract arguments | PASS | 1.303539 |
| 99 | `tests/report-pdf.test.mjs:319` | exportPdf: browser mode / non-Windows go straight to the print fallback (AC-6) | PASS | 1.047615 |
| 100 | `tests/report-pdf.test.mjs:335` | exportPdf: pdf_render "unsupported" falls back and is remembered for the session | PASS | 1.525082 |
| 101 | `tests/report-pdf.test.mjs:348` | exportPdf: backend errors fall back to the print dialog and report the error | PASS | 1.255236 |
| 102 | `tests/report-pdf.test.mjs:361` | exportPdf: timeout rejects with a retryable error (AC-7) | PASS | 41.695364 |
| 103 | `tests/report-pdf.test.mjs:381` | exportPdf: path errors are not retried or printed; cancel is quiet; one export at a time | PASS | 3.403715 |
| 104 | `tests/report-pdf.test.mjs:400` | normalizePdfError handles strings and objects | PASS | 0.242023 |
| 105 | `tests/report-pdf.test.mjs:406` | loadPrintCss fetches once and tolerates failure | PASS | 0.355945 |
| 106 | `tests/report-pdf.test.mjs:418` | report fixture for the Windows PrintToPdf test is up to date | PASS | 0.523687 |
| 107 | `tests/service-panel-lifecycle.test.mjs:67` | late customer resolve leaves the replacement panel and feedback alone | PASS | 8.704452 |
| 108 | `tests/service-panel-lifecycle.test.mjs:67` | late customer reject leaves the replacement panel and feedback alone | PASS | 1.396799 |
| 109 | `tests/service-panel-lifecycle.test.mjs:81` | current customer submission reports failure and can be retried | PASS | 3.345428 |
| 110 | `tests/service-panel-lifecycle.test.mjs:67` | late job details resolve leaves the replacement panel and feedback alone | PASS | 1.229457 |
| 111 | `tests/service-panel-lifecycle.test.mjs:67` | late job details reject leaves the replacement panel and feedback alone | PASS | 1.273003 |
| 112 | `tests/service-panel-lifecycle.test.mjs:81` | current job details submission reports failure and can be retried | PASS | 1.340375 |
| 113 | `tests/service-panel-lifecycle.test.mjs:92` | a cancelled customer editor cannot reload or toast over the replacement editor | PASS | 2.56833 |
| 114 | `tests/service-panel-lifecycle.test.mjs:110` | late saved-run link resolve preserves the current panel and feedback | PASS | 1.640896 |
| 115 | `tests/service-panel-lifecycle.test.mjs:110` | late saved-run link reject preserves the current panel and feedback | PASS | 0.690778 |
| 116 | `tests/service-panel-lifecycle.test.mjs:123` | current saved-run linking still refreshes and reports the linked phase | PASS | 0.868455 |
| 117 | `tests/service-panel-lifecycle.test.mjs:131` | late photo unlink resolve does not reload or announce in another panel | PASS | 1.174325 |
| 118 | `tests/service-panel-lifecycle.test.mjs:131` | late photo unlink reject does not reload or announce in another panel | PASS | 0.680342 |
| 119 | `tests/service-panel-lifecycle.test.mjs:154` | late photo attach resolve preserves the submitted write and suppresses obsolete feedback | PASS | 7.822727 |
| 120 | `tests/service-panel-lifecycle.test.mjs:154` | late photo attach reject preserves the submitted write and suppresses obsolete feedback | PASS | 2.911445 |
| 121 | `tests/service-panel-lifecycle.test.mjs:171` | photo success is not announced when a refresh is superseded by navigation | PASS | 3.481883 |
| 122 | `tests/service-panel-lifecycle.test.mjs:186` | a submitted photo batch finishes all its attachments after leaving the panel | PASS | 4.658271 |
| 123 | `tests/service-panel-lifecycle.test.mjs:200` | current photo attachment success retains its visible feedback and releases the button | PASS | 3.384557 |
| 124 | `tests/service-panel-lifecycle.test.mjs:200` | current photo attachment failure retains its visible feedback and releases the button | PASS | 2.376222 |
| 125 | `tests/service-panel-lifecycle.test.mjs:211` | HTML export captures the clicked sheet options before asynchronous preparation | PASS | 5.137742 |
| 126 | `tests/service-panel-lifecycle.test.mjs:225` | late HTML export resolve completes the submitted save without feedback in another panel | PASS | 3.078296 |
| 127 | `tests/service-panel-lifecycle.test.mjs:225` | late HTML export reject completes the submitted save without feedback in another panel | PASS | 2.290773 |
| 128 | `tests/service-panel-lifecycle.test.mjs:238` | HTML export preparation abandons a retired panel before opening a save dialog | PASS | 1.055076 |
| 129 | `tests/service-panel-lifecycle.test.mjs:247` | current HTML export failure retains a working retry and cancellation stays quiet | PASS | 5.993808 |
| 130 | `tests/service-panel-lifecycle.test.mjs:274` | PDF export captures the clicked sheet options and still reports current success | PASS | 4.885052 |
| 131 | `tests/service-panel-lifecycle.test.mjs:286` | late PDF export resolve preserves the backend result and current-screen feedback | PASS | 3.76627 |
| 132 | `tests/service-panel-lifecycle.test.mjs:286` | late PDF export reject preserves the backend result and current-screen feedback | PASS | 2.379956 |
| 133 | `tests/service-panel-lifecycle.test.mjs:299` | a PDF retry offered on a previous panel cannot start another export after navigation | PASS | 3.826871 |
| 134 | `tests/service-panel-lifecycle.test.mjs:309` | current PDF failure can retry and callers without ownership callbacks retain feedback | PASS | 3.235553 |
| 135 | `tests/setup-wizard-model.test.mjs:14` | step list: seven steps on Windows, health dropped elsewhere (AC-7) | PASS | 1.560926 |
| 136 | `tests/setup-wizard-model.test.mjs:22` | start, next, back and the bounds | PASS | 1.11813 |
| 137 | `tests/setup-wizard-model.test.mjs:42` | skip semantics: skipping a step records it and advances; the summary cannot be skipped | PASS | 0.307082 |
| 138 | `tests/setup-wizard-model.test.mjs:61` | answers are merged, sanitized and bounded | PASS | 0.751088 |
| 139 | `tests/setup-wizard-model.test.mjs:80` | setup summary retains incomplete driver coverage through persistence and clears it for a new attempt | PASS | 1.454776 |
| 140 | `tests/setup-wizard-model.test.mjs:93` | resume after step N restores step and answers (AC-2) | PASS | 0.287712 |
| 141 | `tests/setup-wizard-model.test.mjs:108` | re-run keeps prefilled answers, restarts at step 1 and clears the skip marks (AC-8) | PASS | 0.569576 |
| 142 | `tests/setup-wizard-model.test.mjs:121` | finish completes only an active wizard | PASS | 0.283426 |
| 143 | `tests/setup-wizard-model.test.mjs:130` | migrateWizardState never throws and resets what it cannot trust | PASS | 0.606521 |
| 144 | `tests/setup-wizard-model.test.mjs:152` | summarize copes with missing answers and per-env rows | PASS | 0.471048 |
| 145 | `tests/setup-wizard-model.test.mjs:172` | resume window is 30 days (AC-2) | PASS | 0.247812 |
| 146 | `tests/setup-wizard-model.test.mjs:184` | startup decision: fresh, upgrade install, resumable, finished, flag off (AC-1, AC-2, AC-10) | PASS | 0.723928 |
| 147 | `tests/setup-wizard-model.test.mjs:207` | level verdict table (spec §6) | PASS | 0.526151 |
| 148 | `tests/setup-wizard-model.test.mjs:229` | test tone is capped at -12 dBFS and defaults to -20 (AC-4) | PASS | 0.161052 |
| 149 | `tests/setup-wizard-model.test.mjs:240` | calibration default (AC-5) and announcements | PASS | 0.190797 |
| 150 | `tests/support-dialog.test.mjs:5` | bundleFileName is deckchek-diagnostics-YYYYMMDD-HHmm.zip in local time | PASS | 1.025091 |
| 151 | `tests/support-dialog.test.mjs:9` | buildClientContext picks WebView2 version, locale and settings; omits systemHealth when absent | PASS | 0.999192 |
| 152 | `tests/support-dialog.test.mjs:17` | sizeText | PASS | 0.202635 |
| 153 | `tests/system-check.test.mjs:16` | bridge: no backend gives supported:false payloads | PASS | 1.854007 |
| 154 | `tests/system-check.test.mjs:23` | bridge: wraps the three commands | PASS | 0.339671 |
| 155 | `tests/system-check.test.mjs:31` | unsupported scans yield a single info finding | PASS | 0.542956 |
| 156 | `tests/system-check.test.mjs:41` | every required problem code has a meaning and action | PASS | 0.367513 |
| 157 | `tests/system-check.test.mjs:52` | driver problem code 43 is an error with USB advice; 45 is info | PASS | 1.188155 |
| 158 | `tests/system-check.test.mjs:61` | every known code produces a finding | PASS | 2.30239 |
| 159 | `tests/system-check.test.mjs:70` | unsigned driver is a warning | PASS | 0.370867 |
| 160 | `tests/system-check.test.mjs:77` | ASIO: missing DLL, bad signature, generic and multiple | PASS | 0.546391 |
| 161 | `tests/system-check.test.mjs:91` | generic Microsoft USB audio driver for vendor hardware is info | PASS | 0.779551 |
| 162 | `tests/system-check.test.mjs:98` | very old drivers (&gt;3 years) are info | PASS | 0.61888 |
| 163 | `tests/system-check.test.mjs:106` | healthy drivers produce an ok finding | PASS | 0.298378 |
| 164 | `tests/system-check.test.mjs:111` | Application Error 1000: exception meanings and module heuristics | PASS | 2.723002 |
| 165 | `tests/system-check.test.mjs:128` | repeated events are grouped with count and first/last time | PASS | 0.59878 |
| 166 | `tests/system-check.test.mjs:138` | hang 1002 and WER 1001 | PASS | 0.655065 |
| 167 | `tests/system-check.test.mjs:151` | audio service failures (SCM 7000..7034) | PASS | 0.830498 |
| 168 | `tests/system-check.test.mjs:160` | Kernel-PnP, USB hub/xHCI and portcls/usbaudio events | PASS | 0.778851 |
| 169 | `tests/system-check.test.mjs:171` | no events gives ok with period | PASS | 0.186801 |
| 170 | `tests/system-check.test.mjs:182` | DJ crash dump/report: "X crashed on &lt;date&gt;" with module and exception | PASS | 0.956087 |
| 171 | `tests/system-check.test.mjs:192` | DJ log lines: errors, crashes and dropouts | PASS | 1.481416 |
| 172 | `tests/system-check.test.mjs:213` | installed app with no issues is ok; uninstalled apps omitted | PASS | 0.256536 |
| 173 | `tests/system-check.test.mjs:224` | findings sorted error &gt; warning &gt; info &gt; ok and summarized | PASS | 0.526501 |
| 174 | `tests/system-check.test.mjs:239` | scan errors surface as an info finding; report HTML escapes content | PASS | 0.490718 |
| 175 | `tests/system-health-coverage.test.mjs:15` | System Health native responses must be objects instead of silently becoming unsupported scans | PASS | 2.247648 |
| 176 | `tests/system-health-coverage.test.mjs:24` | System Health all-clear requires three completed scan areas and preserves benign information | PASS | 1.897171 |
| 177 | `tests/system-health-coverage.test.mjs:35` | System Health incomplete drivers collection cannot produce an area or system all-clear | PASS | 0.591429 |
| 178 | `tests/system-health-coverage.test.mjs:35` | System Health incomplete events collection cannot produce an area or system all-clear | PASS | 0.254502 |
| 179 | `tests/system-health-coverage.test.mjs:35` | System Health incomplete djLogs collection cannot produce an area or system all-clear | PASS | 0.203586 |
| 180 | `tests/system-health-coverage.test.mjs:46` | System Health retains a real fault and its severity when another area is incomplete | PASS | 0.757338 |
| 181 | `tests/system-health-coverage.test.mjs:57` | System Health mixed supported and unavailable areas remains incomplete | PASS | 0.234262 |
| 182 | `tests/system-health-coverage.test.mjs:65` | System Health all unsupported scans remain informational with no checked areas | PASS | 0.300692 |
| 183 | `tests/system-health-coverage.test.mjs:75` | System Health a rejected command stays failed even when the other two scans are clean | PASS | 0.284006 |
| 184 | `tests/system-health-coverage.test.mjs:84` | System Health three rejected commands cannot become an empty successful scan | PASS | 0.338689 |
| 185 | `tests/system-health-coverage.test.mjs:91` | System Health distinguishes missing coverage from a pending replacement scan | PASS | 0.271839 |
| 186 | `tests/system-health-coverage.test.mjs:100` | System Health incomplete response shape cannot certify collection completion | PASS | 0.241043 |
| 187 | `tests/system-health-coverage.test.mjs:113` | System Health driver-only setup explicitly declares its narrower scan coverage | PASS | 0.246661 |
| 188 | `tests/system-health-coverage.test.mjs:123` | System Health serialized findings preserve coverage instead of relying on ok and info counts | PASS | 0.320702 |
| 189 | `tests/system-health-coverage.test.mjs:132` | System Health HTML and real PDF composition retain the same missing area and recompute stale summaries | PASS | 1.838172 |
| 190 | `tests/system-health-screen.test.mjs:54` | System Health screen calls all three scans and shows HEALTHY only after complete clean coverage | PASS | 53.371401 |
| 191 | `tests/system-health-screen.test.mjs:63` | System Health screen retains failed drivers coverage and repairs it through the actual Retry control | PASS | 55.061972 |
| 192 | `tests/system-health-screen.test.mjs:63` | System Health screen retains failed events coverage and repairs it through the actual Retry control | PASS | 15.544 |
| 193 | `tests/system-health-screen.test.mjs:63` | System Health screen retains failed djLogs coverage and repairs it through the actual Retry control | PASS | 7.983288 |
| 194 | `tests/system-health-screen.test.mjs:78` | System Health screen keeps partial drivers collection visible without an all-clear finding | PASS | 10.023745 |
| 195 | `tests/system-health-screen.test.mjs:78` | System Health screen keeps partial events collection visible without an all-clear finding | PASS | 7.593752 |
| 196 | `tests/system-health-screen.test.mjs:78` | System Health screen keeps partial djLogs collection visible without an all-clear finding | PASS | 6.711746 |
| 197 | `tests/system-health-screen.test.mjs:90` | System Health screen shows mixed unsupported coverage while retaining successful areas | PASS | 12.32982 |
| 198 | `tests/system-health-screen.test.mjs:99` | System Health screen reports all unsupported scans as unavailable instead of healthy | PASS | 25.642929 |
| 199 | `tests/system-health-screen.test.mjs:107` | System Health browser preview performs no scan and remains informational | PASS | 2.236341 |
| 200 | `tests/system-health-screen.test.mjs:113` | System Health screen keeps a real driver problem above incomplete collection coverage | PASS | 17.737608 |
| 201 | `tests/system-health-screen.test.mjs:123` | System Health pending Retry coalesces clicks and blocks exports and event-period replacement | PASS | 11.408395 |
| 202 | `tests/system-health-screen.test.mjs:136` | System Health three failed scans retain an exportable incomplete result | PASS | 5.996882 |
| 203 | `tests/system-health-screen.test.mjs:148` | System Health actual HTML and PDF actions retain the same failed-area coverage | PASS | 12.021527 |
| 204 | `tests/system-health-screen.test.mjs:162` | System Health disposal retires a pending scan and export callbacks | PASS | 4.853013 |
| 205 | `tests/system-health-screen.test.mjs:174` | System Health a replacement scan retires pending PDF preparation and keeps exports disabled | PASS | 11.525792 |
| 206 | `tests/system-health-screen.test.mjs:186` | System Health an invalid native response remains a failed area with an actual Retry action | PASS | 8.135056 |
| 207 | `tests/system-health-screen.test.mjs:196` | diagnostics actual health collection retains failed coverage in the native context | PASS | 12.624333 |
| 208 | `tests/system-health-screen.test.mjs:216` | System Health toast PDF Retry retains busy ownership and restores controls for an intervening scan | PASS | 14.669056 |

## 9. Report-only seal

After all three retained-copy ACCEPT dispositions and root's independent package acceptance, root authorized one ordinary report-only commit in the security worktree. The sole owned tracked addition is `docs/engineering/SYSTEM_HEALTH_COVERAGE_SECURITY_AUDIT_2026-11-21.md`; its commit must use `2a807525c70712332e84cecbaf29dd876b5e03cd` as its sole parent. No source, test, native, permission, configuration, or evidence file is changed in this security commit.

Immediately before writing this report, the auditor again recomputed every original blob ID, compared all 2,586 original working bytes and modes, verified the complete physical/tracked/index/flag/test inventories, recomputed the freeze commit and tree identities, and confirmed the worktree was clean. The final seal gate repeats the complete original-file comparison after the ordinary commit, independently recomputes the new commit/tree/report-blob identities, requires exactly this one report addition, and requires a clean worktree with no untracked or ignored files.

The formal FINAL delivery record supplies the actual report byte count, line count, SHA-256, Git blob, final commit, tree and sole parent, together with the post-seal result. Keeping those identities in that delivery record avoids a recursive self-hash in the report. Source, exact-control, original-evidence, and retained-copy ACCEPTs are complete; no additional project execution, rerun, probe, scanner, deployment or release is authorized. All three workers must reach FINAL before a fresh rotation.
