# Native setup catalog and REV1/REV5 provenance follow-up

This source adds selected native setup-catalog transfer and two manufacturer-backed MIDI profile updates. The catalog correction and profile scope were independently reviewed before integration. The complete combined qualification is tied to source `20a8c342`, tree `a8a518134db352711bd67861d2838a7f3870b90f`; publication and later hosted checks remain distinct events.

## Outcome and source identity

| Item | Exact scope |
| --- | --- |
| Source commit | [`20a8c342`](https://github.com/djshellshoxxx/deckchek/commit/20a8c34261d2aa801335a812fbc3c5987cf28587) |
| Source tree | `a8a518134db352711bd67861d2838a7f3870b90f` |
| Parent | Published PR32 head `cc15026a3594d65ab8fbc4d3e9d18f7113b73b10`, tree `faff35abe2f3fe7efe21c80ad69ef6f53f422c79` |
| Change scope | 19 paths: 13 catalog paths, five profile/provenance/test paths and the generated coverage matrix |
| Preservation | 1,447 frozen files; all 1,428 unaffected parent Git blobs retained |
| Documentation | This report and ten current status files form a separate documentation overlay, awaiting independent review in this snapshot; they do not qualify changed executable source by themselves |

The catalog author worked from `61e265f`; the profile author worked from `04bbc714`. Root verified that every existing owned destination file remained identical to the respective baseline and every new path was absent before copying the accepted bytes onto `cc15026a`. The integration adds no migration or dependency, changes no numerical threshold or output cap, and keeps Fleet OFF by default.

## Native selected-setup transfer

The desktop Data screen now offers an explicit setup selection, export, destination preview and **Add missing catalog records** action. The separate `deckchek-native-setup-catalog` version-1 file is described in the [format and preservation contract](native-catalog-archive.md). It does not replace workspace JSON, either browser archive or the complete database backup.

Every selected setup includes its entire component set and all referenced parents from ten fixed tables: manufacturer, product, asset, venue, booth, deck position, support configuration, asset settings snapshot, setup and setup component. This includes a settings snapshot's actual owner, hidden asset fields and saved placement, location descriptions, literal embedded JSON and every SQL column. The incoming graph must be complete independently of destination rows; missing parents, duplicate IDs, unknown tables and unreachable injected records are refused. Additional destination components also make an existing setup conflict.

Rust owns archive parsing and serialization. JavaScript carries copied raw text through IPC, so signed SQLite integers above JavaScript's exact-number range and original timestamp/JSON strings are preserved. Duplicate, unknown and missing JSON keys, incompatible SQL values, invalid UTF-8/BLOB text and non-finite numbers are errors. The limits are 32 MiB of UTF-8, 10,000 included rows and depth 24, with bounded diagnostics and no successful truncation. The panel checks declared and actual file sizes and decodes UTF-8 fatally; a legitimate replacement character is accepted as text.

| Destination state | Import behavior |
| --- | --- |
| Missing ID | Insert all recorded values. |
| Existing identical ID and values | Count an exact match without writing. |
| Same manufacturer/product ID, all non-time fields identical, only creation/update timestamps differ | Retain the complete local dependency row and disclose source/local timestamps separately. |
| Any other difference, uniqueness collision or incompatible complete component aggregate | Refuse the entire import. |

The timestamp exception is limited to matching manufacturer/product IDs and is not a seed exemption or name-based rebinding rule. The implementation uses SQLite's actual NOCASE comparison. It performs no upsert, ID remap, undelete, Fleet move, timestamp refresh or repair of existing rows. New snapshot/component and position-bound support relationships follow existing ownership guards. Exact unchanged legacy aggregates may remain no-write matches; contradictory nullable location context is preserved and disclosed.

Export and preview use consistent read transactions. Import takes one immediate transaction, reparses the same text and rechecks the current destination, schema, graph, conflicts and foreign keys before ordered inserts and one commit. It reuses the actual backup schema fingerprint and production `db::off_main`/`DbConn` boundary. Schema drift and pre-existing foreign-key damage are refused; a late constraint or commit failure cannot leave partial archive inserts. The copied text remains owned through lost acknowledgement and explicit retry, which becomes a zero-insert operation for unchanged records.

Device-profile bindings, learned maps, product specifications, measurements, incident/support history, maintenance, usage, reminders, photos, calibration, app state and signing material are outside this selected graph. Those authorities remain untouched. Binding is product-level: in an accepted import, an asset on product `S` can remain outside an existing destination Devices profile bound to product `D`. [Unit selection](../app/ui/devices/library-state.js) filters by that bound product, and [profile synchronization](../src-tauri/src/devices.rs) retains an existing valid binding, including after restart or forced sync. The existing [Equipment Product editor](../app/ui/screens/equipment.js) permits deliberate current reassignment; it does not restore the source binding, profile JSON, local version counter or synchronization state. Full native database backup remains the complete-database preservation path. This source-derived limitation adds no blocker to the declared archive v1 contract; the focused binding review did not execute a native reproduction, and no new automatic association, action or archive version is delivered here.

### Data ownership and the corrected chooser regression

Archive reads, previews, exports and imports have lifecycle owners. Data coordinates catalog operations with existing backup, restore and workspace actions. Repeated show is a no-op; retired reads/previews cannot replace newer state; an already dispatched import keeps its copied input and busy ownership until settlement.

Independent review found **NATIVE-CATALOG-UI-01**, a medium-severity regression: the new shared busy owner was acquired before the existing workspace file picker, whose promise did not settle on cancellation. Canceling the chooser left Data controls disabled, including after hide/show. The actual-handler probe passed 2/2 on the baseline and failed 0/2 on frozen v1. Both candidate failures reached the disabled backup control; the wider disabled-control effect was also established by source inspection.

The v2 correction owns a native Data-local chooser. Selection, cancellation, hide or disposal settles it once, removes its exact listeners and DOM node, and reaches the handler's matching-owner `finally`. Selected reads retain their operation owner and visibility checks. Dispatched imports remain busy through success or failure; stale chooser events cannot release a later operation. The shared browser picker and native core are unchanged. The [Data source](../app/ui/screens/data.js) and [persistent regressions](../tests/native-catalog-archive-ui.test.mjs) retain this boundary.

## Catalog findings and retained qualification

| Stage | Actual result and interpretation |
| --- | --- |
| Before production implementation | 2 passed / 1 failed: the native setup card was absent; existing browser/native controls passed. |
| First JavaScript candidate | 30 passed / 4 failed: the local DOM fixture lacked the real false default for `disabled`; the fixture was corrected with assertions preserved. |
| Initial native lock comparison | Five offline-selected transitive versions differed; original lock/comparison and each precise alignment are retained. Final closure matches all 29 application dependency identities. |
| First native compilation | Test-only E0502 while constructing a duplicate-row fixture; corrected by cloning before push. This was a compilation failure, not a native behavioral baseline. |
| Added read/preview/export regressions | 34 passed / 3 failed, then 37/37 after lifecycle correction. |
| Frozen v1 qualification | 140/140 related Node cases, including 37 archive cases; 18/18 exact native harness tests, strict locked offline Clippy and owned Rustfmt passed. |
| Independent chooser reproduction | Unchanged baseline 2/2; frozen v1 0/2. The finding blocked integration. |
| Persistent amendment before repair | 32 passed / 4 failed. Cancellation, cancellation with hide/show, hide retirement and disposal failed. |
| Same persistent cases after repair | 36/36. Already-dispatched import success/failure cases passed both before and after. |
| Unchanged independent probe on v2 | 2/2. Original probe and all four recorded inputs remain unchanged. |
| Frozen v2 related suite | 146/146 across nine files, including 43 native archive cases. |

These scopes overlap and are not added together. The original three baseline test bodies remain intact, and the full previous UI test file is a byte-identical prefix of the amendment. The recorded first-candidate source copies are a **later reconstruction matching the original execution hashes**, not an original pre-run snapshot. Original failures, raw logs and review-v1/v2 remain immutable.

The bounded native harness compiles the actual archive core and inline tests, all 24 real migrations, real seed SQL, the actual backup schema fingerprint and migration/time helpers. It omits Tauri command macros and the AppHandle boundary; a harness-only dead-code allowance covers consumers deliberately omitted there. All 29 nonroot dependencies match application name, version, source and checksum. Tests compare every fixture SQL column, independently seeded destinations, complete graphs/component sets, timestamp-only reuse, substantive conflicts, exact legacy matches, stale previews, strict types/keys and bounds, schema/foreign-key damage, large integers, raw text, retry and rollback after an actual late foreign-key failure.

The v2 amendment changes only Data JavaScript and appended UI tests. All 1,438 other source files, 30 native inputs and 31 generated harness files match v1. The 18/18 native, strict Clippy and Rustfmt results carry forward through those exact hashes; unchanged native gates were not rerun. Reviewers verified all 1,577 v2 frozen files and all 1,554 original frozen files, retained logs and complete before/after source maps. Review-v3 accepts the exact v2 source with zero remaining blocking findings.

This proves the described core and handler behavior within the fixtures. It does not establish actual Tauri dispatch, real restore-gate concurrency, desktop picker/download behavior, full application/platform builds, hosted Chromium, packaging or hardware behavior. The authored [native-stub browser smoke](../tools/smoke/native-catalog-archive.mjs) remains distinct from an observed browser pass.

## REV1 and REV5 manufacturer provenance

The exact [DDJ-REV1](devices/pioneer-dj-ddj-rev1.md) and [DDJ-REV5](devices/pioneer-dj-ddj-rev5.md) notes retain the manufacturer PDFs, their hashes, article responses and page-level decisions. Root, author and independent reviewer each visually inspected the six decisive pages.

| Profile | USB MIDI evidence | Scoped audio facts | Retained connector fact |
| --- | --- | --- | --- |
| DDJ-REV1 | DRI1744B p. 57: MIDI software control through USB | p. 55: nominal Audio Section 48 kHz; 24-bit A/D and D/A converters | p. 56: one USB Type-B port |
| DDJ-REV5 | DRI1872B p. 132: USB MIDI software control | p. 133: nominal Audio Section 48 kHz; 24-bit A/D and D/A conversion | p. 134: two USB Type-C terminals |

Each profile changes only the identity note, `usbMidi` from unknown to true, one appended exact manual reference and three scoped facts. All 16 handwritten tests, seven original specifications, twelve original document objects, software entries/minimum versions, MIDI maps, identifiers and unrelated fields remain intact. The same 37 IDs remain in the research-seed group. The REV5 note retains the documented playhead-position display meaning and resolves the product page's Type-B caption inconsistency using the manual's Type-C terminal specification; it adds no screen technology or control protocol.

Nominal sampling and converter resolution do not enumerate USB audio stream formats or counts. Both USB audio objects remain unknown. DIN, USB IDs, class compliance, receiving/Identity support, exact maps, revision/firmware applicability and current driver/OS support remain unresolved. No General MIDI sound test, numerical tolerance or new output stimulus is added; the -12 dBFS cap is preserved.

| Profile execution | Actual result |
| --- | --- |
| New regression and global research checks before production changes | 9 passed / 8 expected failures; all five global checks passed. |
| Identical command after changes | 17/17, with the same test names and regression bytes. |
| Related profile/library/planner command | 49 passed / 1 failed: an ineffective negative-lookahead filter allowed the stale committed-matrix comparison to run. |
| Planner-only supported exclusion | 13/13, repeating already-passing cases; completed before root's instruction to stop unnecessary repetition. |
| Selected MIDI prerequisite regressions | 9/9. |

The original failed command and inaccurate intended-exclusion metadata are retained beside an explicit correction. Root then regenerated the matrix once. Only the REV1/REV5 MIDI conformance, coverage and timing marks changed from conditional to confirmed; no audio mark or test count changed. Current coverage is **45 profiles, 506 handwritten checks, 187 generated checks, zero gaps, 23 conditional audio profiles and 17 conditional MIDI profiles / 51 requirements**. Reviewed provenance covers 25 existing profiles; this is documentation coverage, not physical qualification.

## Combined source40 qualification

| Check on the combined source | Observed result |
| --- | --- |
| Complete Node 22.23.5 suite | **1,835 passed / 0 failed / 1 optional skip**, 1,836 total across **151 test files**. TAP **253,593.508232 ms**; wall **253.676284533 seconds**. |
| Complete source preservation | All **1,447 frozen files** and index tree unchanged after the full run and local gates. |
| Local static checks | Device index, timecode facts, **24 migrations**, mobile copies, third-party notices, generated coverage, GLib provenance metadata, application/GLib formatting and **411 JS/MJS syntax checks** passed. |
| Separate monitor proxy | **1/1**, 1,019.015583 ms TAP; **2,400 hops**, **0.351 ms** mean, **1.96 ms** worst, **0.06 MB** heap growth, under unchanged budgets. |
| Coverage regeneration | One successful generator run; only the two reviewed MIDI rows changed, with every other tracked file unchanged by generation. |

The full suite ran from **2026-11-18 18:57:58.545535 to 19:02:12.222087 UTC**. Local static/proxy qualification completed at **19:03:22.559813 UTC**. The manifest and raw logs below record exact argv, versions, timing and source identity. The [npm package](../package.json) declares no dependencies and has no `package-lock.json`; Cargo lockfiles remain unchanged. The actual Node test entrypoint was run serially with every matching top-level test file. No `npm ci`, full local native test/check/Clippy, local Chromium or physical qualification is claimed by these results.

The source freeze preceded the full run. Every executed/static gate is tied to the same tree and complete source hashes. No unchanged full Tauri or Chromium environment-blocker attempt was repeated. The focused/native scopes above complement the combined run; they do not replace the remaining hosted/application/platform gates or add to its test count.

## Published source39 and integration state

At the **2026-11-18 19:01:45 UTC** hosted snapshot, [PR32](https://github.com/djshellshoxxx/deckchek/pull/32) remains the published preceding revision `cc15026a`. The observed checkout is synthetic merge `be909659ed18eca4aaf103c73eb50a64daccf74c`, with parents integration `0acb612` and `cc15026a`; its tree exactly matches published tree `faff35abe2f3fe7efe21c80ad69ef6f53f422c79`.

| Published source39 job | Observed result |
| --- | --- |
| [Primary browser 135042125581](https://github.com/djshellshoxxx/deckchek/actions/runs/44372316507/job/135042125581) | **1,338/1,338** checks; zero recorded console errors in completed modules. Screenshots were not visually inspected for this evidence record. |
| [Cross-workflow JavaScript 135042125989](https://github.com/djshellshoxxx/deckchek/actions/runs/44372316509/job/135042125989) | **1,780 passed / 0 failed / 1 skipped**, 1,781 total, Node 22.23.4; 134,711.912979 ms TAP. Separate monitor 1/1: 2,400 hops, 0.432 ms mean, 0.77 ms worst, 0.06 MB heap growth. |
| [AddressSanitizer 135042282426](https://github.com/djshellshoxxx/deckchek/actions/runs/44372316494/job/135042282426) | **730 passed / 0 failed / 8 ignored**, 182.02 seconds test time. Existing `-Zsanitizer=address` with `ASAN_OPTIONS=detect_leaks=0`; leak detection and ignored tests are outside this result. |

The primary browser result verifies source39's repaired smoke assertions. Its deterministic native mocks do not establish real Tauri, hardware or packaged-app behavior, and none of these preceding-source results qualifies the new catalog/profile bytes. At that snapshot, cargo-fuzz was running and seven other non-tag jobs were queued, including the second browser job and normal native/Windows scopes. Tag-only release-checks was correctly skipped. Build, packaged self-test, extended and current source40 gates remain separate obligations. Queue causes are not established.

The retrieved Snyk status says **no manifest changes detected in five projects**; it is not a broad fresh dependency/source audit or Sonar result. Main remains `ee5aa511`, integration remains `0acb612`, PR30 remains `72dd38c`, and PR27 metadata is preserved. The source40 commit exists and is fetched, but no branch moved for it. Root intends a distinct draft follow-up after independent documentation acceptance, preserving PR32's current gates. A fresh remote inventory and the existing branch/merge policy apply; no future branch/PR number or successful merge is assumed.

The preceding [logical MIDI report](DECKCHEK-LOGICAL-MIDI-FOLLOWUP.md) remains byte-identical, as do the [native-history](DECKCHEK-NATIVE-HISTORY-FOLLOWUP.md), [MIDI/profile](DECKCHEK-MIDI-PROFILE-FOLLOWUP.md), [checkpoint 35](DECKCHEK-CONTINUATION-35.md) and [earlier continuation](DECKCHEK-CONTINUATION-2026-11-18.md) reports. Their dated failures and source-scoped successes are preserved. Neither Snyk's no-manifest-change status nor a focused source review establishes broad Sonar/security clearance. No release, tag, deployment, branch deletion or superseded-PR closure is implied.

## Evidence inventory and continuation

Evidence is retained under the session's sibling `verification/` directory. The documentation evidence inventory records **112 direct artifacts**, their exact sizes and SHA-256 values; its SHA-256 is `f6983a969aada7d22000cb3dd6c209585d2771b54fdbed6276111c05dd675731`. The frozen documentation proof includes copies of those artifacts. The native/profile freeze manifests additionally pin their complete source/proof sets; the root acceptance binds 48 key artifacts. Its preserved prior metadata record clarifies only the npm-specific lockfile wording and changes no source or result.

| Evidence file relative to `verification/` | SHA-256 |
| --- | --- |
| `continuation-40-final-integration-acceptance.json` | `8f0b78ebdb34c18e3f728f91c2222f1a7ba8b29bd79ad420efde77a32d97dd74` |
| `continuation-40-source-commit.json` | `46ab0fdc76f4b415c9548aada749e3726ac8a8e5ab183677a3077b1b807b7215` |
| `continuation-40-source-commit-verification.json` | `c8ab0c1a49d804675a0a986ec7e385318c7a33a811e4ec1140a7a2f4f253bd64` |
| `continuation-40-source-freeze.json` | `dcc67624fb0697788ffe1717358422456951498e3360912260299641e8c3a35f` |
| `continuation-40-report-facts.json` | `c1e59f1a85a336f7482643faa3b065ad85ebfb411fc4dafe94174d0fa6bc6ab6` |
| `continuation-40-full-js.log` | `7e6639efc2c44ac28671ae2d4e34185568e54cda3894b9c41acd9e42a35b0f4e` |
| `continuation-40-post-suite-source-check.json` | `10136c10087c2f615616221062370a894111d11944559577eb798da8b69270fe` |
| `continuation-40-static/results.json` | `5030ce3bb335faa265da0312947fda0e7fe5832eb0a53ef9ab8c5d1455a1f678` |
| `continuation-40-matrix-regeneration.json` | `8e3385b79e32b5ac4c17589ca68a9bffa1539ec832ae0b992344f6bc50a90e04` |
| `native-catalog-portability-freeze/manifest.json` | `74b925fe28ad93b8460c15ca48b376527b79377ac7733a647efafab0ff13d8e9` |
| `native-catalog-portability-freeze-v2/manifest.json` | `6ac75c8754fcf20bd1916edceca17b1a45e32c838dd760d6812c520a5512aef1` |
| `native-catalog-portability-independent-review/review-v2.json` | `4072d300fa1772b670019497452bf2c8cee04fb97fb9b05c80f4c3990505933c` |
| `native-catalog-portability-independent-review/review-v3.json` | `caa46da55dd501ed76d7bef9e8fc1a7b8ad094e0339d3e6a152d2d84a636706b` |
| `profile-rev1-rev5-proof/freeze-v1/MANIFEST.json` | `66a41df709d4634e7496f11ce49d4baa1f18dcd74352297595fb5e4ed36ae5ed` |
| `profile-rev1-rev5-independent-review/review.json` | `c203ec793db1c0f389847429ad21c0c4a0a65be9b26c0fa321128a772300f1c6` |
| `native-profile-binding-scope/FINDINGS.md` | `432c0649c6c3210b7d1df7cc5cdecf533336fd4801fcd20c39ff543d521f60bb` |
| `native-profile-binding-scope/result.json` | `685bb57e32720deda81552321b98fea31dee463fba690808c5127d062866b2f9` |
| `native-profile-binding-scope/source-evidence.json` | `7b56311597f7d20848e7f614b106f839bcd9b6e8d32716a7177697f3dd266a87` |
| `continuation-39-current-hosted-snapshot-2.json` | `9cd1a20c2a9941150c807a06f8d2a18760f0240bbea4740053cd47c11369da38` |
| `continuation-39-hosted-asan-evidence.json` | `f812df588bc6d366b8a1c47879d99b9c6e6f15b27a23756d2519a9a590b98668` |
| `continuation-39-hosted-ui-js-evidence.json` | `1f52bc62d6af59009ca9250a093bf2c18ca2abc44a62ff89a5d11e3482e2e904` |


Root retains integration, publication and project execution coordination. At the final source acceptance, the separately owned, unintegrated incident snapshot author holds the sole project execution slot; verify live ownership before execution. Refresh remote heads and current checks before a branch update or merge, preserve PR27 metadata and concurrent work, and close superseded PRs only after their replacement reaches main. Required current-source hosted/native/browser/platform gates remain prerequisites to merge. Device-profile association, the actual MIDItest consumer contract, physical identity/continuity, remaining conditional capabilities, broader SPEC-05 outcomes, owner/reference measurements and distribution decisions retain their existing boundaries. Fleet remains OFF.
