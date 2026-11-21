# Mobile export details — fresh functional audit

Reviewer: `/root/mobile_export_functional_round7`. Date: 21 November 2026,
UTC. Root confirmed all three round-six final handoffs before this fresh trio
began. This lane was the sole local project executor for round seven.

## Disposition

**The focused Mobile export gate passed: 45 tests, 45 passed, no failures,
skips, cancellations or TODOs.** The first run selected exactly six actual
test files, ran serially, exited 0 without a timeout, and preserved all 2,235
tracked source hashes, the inventory, HEAD, complete tree and clean status.
All four new tests of the actual Results screen passed. The one ordinary Mobile
build and the separately authorized smoke-module syntax check also passed once.

**Complete-source qualification remains HELD.** This focused result does not
replace the predecessor's complete gate: 2,391 cases, 2,388 passed, two failed
and one optional skip at `09c9afc`. Issue #72 remains unresolved. No full-suite
rerun, numerical repair, browser qualification or native qualification occurred.
The first focused output is retained in
[focused/run.tap](evidence/mobile-export-functional-2026-11-21/focused/run.tap),
with the exact invocation and source identity in
[focused/result.json](evidence/mobile-export-functional-2026-11-21/focused/result.json).

## Sources, ownership and freeze

| Item | Identity |
| --- | --- |
| Initial export-details implementation | `70ba2821c74965f3ac215e4680e0e259456af7c5` |
| Initial clean preparation, not executed | `b43be56fced26cfb20703414e7ea1076b20b6712` |
| Corrected clean preparation | `58485ad53793733869af490c7e0da58a4090a1a1` |
| Corrected preparation complete tree | `766f08daed2b37635b9912352c71d1e48a4acfdf` |
| Generated-only commit and final tested source | `d3aa9ca25bd8fec352cbb628ddfcca90beabcdd4` |
| Final tested complete tree | `c20d7b3f6bc36e8adf906d0eb2707902b66e3fc5` |
| Predecessor complete-gate source | `09c9afc7cfb2857f354feccb65e46a54ca8cfe62` |
| Fixed PR #79 comparison head | `f76908766d53992e20382b9cbe73a668a28a6d1a` |
| Branch | `review/deckchek-mobile-export-functional-20261121` |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-mobile-export-functional` |

This lane changed only the authorized generated `mobile/sw.js`, then added
this report and its evidence directory. Root owned the product implementation,
regressions and smoke assertions. The generated commit has the corrected
preparation as its sole parent and changes only the service-worker stamp.
Root and both static peers verified that delta before the final source freeze.
The [generated identity record](evidence/mobile-export-functional-2026-11-21/build/generated-commit.json)
and [source comparison](evidence/mobile-export-functional-2026-11-21/source-comparison.json)
bind these identities to the retained bytes.

Relative to the predecessor complete-gate source, the code changes are exactly
`mobile/screens/results.js`, `mobile/sw.js`,
`tests/mobile-results-details.test.mjs` and `tools/smoke/mobile-pwa.mjs`.
The shared storage module, export format and measurement engines were unchanged.

## Correction and pre-execution finding

Issue #80 concerned export values captured when the panel first opened. Editing
a nickname or serial could leave text and action payloads stale; clearing a
field could revive a saved result's old hint through a truthy fallback. The
initial correction made explicit blanks authoritative and refreshed the panel
on changed input/change events, including its text, file, share and clipboard
closures and visible QR. A redundant change after input returns early so it
does not replace an action button during a tap.

Fresh static review then found an additional path before any round-seven
project execution. When a preference write fails while the old stored record
remains readable, the existing store can return that old value ahead of its
memory fallback. Re-reading settings during export could contradict the visible
editor. The corrected source keeps the current screen's export settings locally,
accumulating nickname, serial and redaction changes without replacing them with
another storage read. It still attempts persistence and leaves the shared store
unchanged.

The fourth actual-screen regression rejects preference writes while keeping
the old record readable. It also asserts that a storage read still returns the
old nickname, proving that the adverse condition is exercised. This establishes
current-editor behavior; it does not establish successful persistence or
retention of denied changes after remounting. See the
[implementation note](MOBILE_EXPORT_DETAILS_IMPLEMENTATION_2026-11-21.md).

## One ordinary Mobile build

Root read and authorized the complete recorder and source-bound configuration
before this single project invocation:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node tools/build-mobile.mjs
```

The build ran on corrected preparation `58485ad`, starting at
`2026-11-21T09:43:40.682434+00:00`. It exited 0 in
`0.11477186000047368` seconds without a timeout. Its entire stdout was
`updated: sw.js` followed by a newline; stderr was empty. The budget was
30 seconds, with TERM at 25 and KILL by 30 if needed.

All 2,235 tracked paths were hashed before and after. Only `mobile/sw.js`
changed; inventory, HEAD and tree stayed fixed during the build, with no staged
or untracked additions. The generated-only commit changes `eca0f2a661c9` to
`8f12f05a2c38`, with one insertion and one deletion. Its 33-entry precache is
unchanged. The resulting service worker has SHA-256
`07b2a1c77959bcc55f825f4d6db6ada92762ea494959a0938d749569978d77cd`.

The complete result, before/after service-worker bytes and original patch are
retained under [build/result.json](evidence/mobile-export-functional-2026-11-21/build/result.json)
and [build/generated.patch](evidence/mobile-export-functional-2026-11-21/build/generated.patch).

## First focused gate

After the generated source was frozen, root read the complete focused recorder
and configuration and authorized exactly this six-file invocation:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-concurrency=1 --test-reporter=tap tests/mobile-build.test.mjs tests/mobile-export.test.mjs tests/mobile-results-details.test.mjs tests/mobile-router.test.mjs tests/phone-run.test.mjs tests/qr.test.mjs
```

| Execution item | Recorded result |
| --- | --- |
| Runtime | Node v24.22.3, Linux x64; Python recorder v3.12.14 |
| Started, UTC | `2026-11-21T09:47:44.338602+00:00` |
| Completed record, UTC | `2026-11-21T09:47:53.829405+00:00` |
| Child execution elapsed | `9.39870166000037` seconds |
| Budget | 120 seconds; TERM at 115 and KILL by 120 if required |
| Exit / timeout | 0 / false |
| TAP counts | 45 tests; 45 pass; 0 fail, cancelled, skipped or TODO |
| Stderr | Empty |
| Source after execution | All 2,235 tracked hashes and inventory unchanged; same HEAD/tree; clean |

The [authorized selection](evidence/mobile-export-functional-2026-11-21/focused/authorized-selection.json)
and [test-file inventory](evidence/mobile-export-functional-2026-11-21/focused/test-files.json)
are explicit and sorted. The recorder enforces equality with those six actual,
tracked paths; no wildcard selects additional files. Individual test-file
hashes and complete argv are recorded in the result.

| Selected file | Cases | Passing scope |
| --- | ---: | --- |
| `tests/mobile-build.test.mjs` | 8 | Vendor/cache parity, temporary-copy drift/repair, precache, assets, page/import contracts and manual-only deployment workflow |
| `tests/mobile-export.test.mjs` | 7 | Computed fixture measurement round-trip, matching hashes, redaction, QR images, file naming and invalid export rejection |
| `tests/mobile-results-details.test.mjs` | 4 | Actual Results screen editing, blanks, current action payloads, focus/element identity, QR invalidation and denied writes |
| `tests/mobile-router.test.mjs` | 3 | Declared routes, inherited-name rejection, result IDs and existing segment behavior |
| `tests/phone-run.test.mjs` | 17 | Format/hash validation, framing, Unicode/whitespace preservation, bounds, reassembly and history conversion |
| `tests/qr.test.mjs` | 6 | QR structure, independent decoding, capacity, SVG output and corruption detection |

The four new actual-screen cases appear as TAP cases 16–19:

| Case | Observed contract |
| --- | --- |
| 16 | Trimmed nickname and edited serial reach text, file, share and clipboard with the current valid checksum; the original editor stays connected and selected by the live screen, redundant change preserves the save button, and the saved result stays unchanged. |
| 17 | Clearing serial and nickname yields omitted hints represented as null, retires visible old QR, preserves redaction, regenerates QR from current text, and leaves the saved result unchanged. |
| 18 | Initially blank visible settings override saved hints, and a change-only edit refreshes the open panel. |
| 19 | With readable old storage and rejected writes, current editor values and redaction reach every export action, old QR is retired, redundant change preserves the pending action target, and the saved record is unchanged. |

These tests import the actual Results screen and store through a small DOM
fixture. Download, Web Share and clipboard boundaries are in-memory doubles.
QR expectations use production framing/encoding; the separate QR test file also
uses an independent decoder and a corruption negative control. These outcomes
establish contracts in the recorded Node environment. They do not establish
real browser event ordering, keyboard behavior, download dialogs or share
sheets, installed PWA behavior, native storage or physical measurement
performance. All outcomes are retained in
[observed-summary.json](evidence/mobile-export-functional-2026-11-21/observed-summary.json).

## Separate smoke syntax check

The smoke change replaces the former always-true nickname assertion and adds
serial editing, clearing, stale-QR retirement and downloaded/displayed parity
checks. This lane ran only the separately authorized syntax command:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --check tools/smoke/mobile-pwa.mjs
```

It started at `2026-11-21T09:50:10.792128+00:00`, exited 0 in
`0.11432855300154188` seconds and did not time out. The budget was 30 seconds,
with TERM at 25 and KILL by 30 if required. Both streams were empty. The
14,849-byte module retained SHA-256
`ead9aadcad653e51c2ce908dabc4e6a45234cbf40f7ea9ff6efea97ee357de44`.
All 2,235 tracked hashes, inventory, HEAD/tree and clean status stayed unchanged.

The [syntax result](evidence/mobile-export-functional-2026-11-21/syntax/result.json)
and [exact checked source](evidence/mobile-export-functional-2026-11-21/syntax/checked-mobile-pwa.mjs)
are retained. Syntax parsing did not evaluate the module or exercise any smoke
scenario. The earlier browser startup `EPERM` limitation was not retried or
worked around; no browser, native application, installer or download was
launched by this lane.

## Evidence integrity and independent review

All three recorders and first-outcome directories were outside the checkout.
Each recorder refuses to reuse its output path. Clean-source checks, explicit
identities and before maps preceded the authorized command; complete
stdout/stderr went directly to new files. Results and after maps were captured
before this report or evidence package was added. There was no test rerun or
post-freeze product/test repair.

`NODE_OPTIONS`, `DECKCHEK_AUDIO_CONTEXT_PATH` and every
`DECKCHEK_AUDIO_FIT_*` variable were absent. Build and focused recorders
prefixed PATH with the absolute Node directory; syntax used the same absolute
executable. Node version/component queries in the first two recorders were
metadata-only. No numerical collector or added engine switch was enabled.
Recorded parent argv does not characterize unobserved child argument expansion.

| Recorder or configuration | SHA-256 |
| --- | --- |
| Build recorder | `4b17d0b1c951c7f694948611736a94e83181647de3256c5c163b6ad3a73ab153` |
| Build configuration | `8ddcbc4bbe32c3c69563155f651c3bb8067b5850663ece699542ffb36a0db84a` |
| Focused recorder | `5e28829a3d57a5b14da7a249fbf74e82509a1e036b7cb34ed4c01ce54a1cb34e` |
| Focused configuration | `244a3e5e4718829ea57ccd1b3fb59ef8b6df51937efdf097266fee2c70a79bf1` |
| Syntax recorder | `17dce012b3804fe19f25b893ad1d8c71fca285fe7660f1815010271c8e4f6056` |

The complete first TAP is 10,439 bytes, SHA-256
`7f29e94be18c528ad18b620b875a9f74986bd6819cc39c452077f58cbff3e4db`.
The [manifest](evidence/mobile-export-functional-2026-11-21/manifest.json)
binds 33 evidence files, excluding itself, and has SHA-256
`eab397836489860b16f8fac58fd58d5b3c0f5259bb54a30f5511cc49f09c9f8e`.
The [retention proof](evidence/mobile-export-functional-2026-11-21/retention-proof.json)
records 29 byte-identical retained originals and 34 original-source bindings,
including the outside recorder/configuration files.

The [data-only verifier](evidence/mobile-export-functional-2026-11-21/verify-evidence.py)
passed with `--require-originals`. It verified every manifest entry and all
original bindings; all six snapshot maps against immutable Git bytes; the
exact build parent, patch and sole generated delta; the seven shared/vendor
pairs, VERSION, independently derived stamp and 33 precache entries; recorder,
configuration, source, runtime and argv identities; the complete TAP, plan,
footer and 45 ordered passing outcomes; the checked smoke source; and the
source comparison and predecessor held result. It reads data and Git objects
only and executes no project modules. Derived observations do not replace
original first outputs.

Both fresh static reviewers independently verified the stable raw records and
final retained package. Each confirmed all 33 manifest entries, 29 unique
original copies and 34 bindings, all six 2,235-entry maps against immutable
preparation/frozen Git bytes, every TAP/summary outcome, exact selection and
recorder identities, syntax source/streams and source comparisons. Both
reported no scoped evidence blocker while preserving the predecessor hold.
Their separate code and security dispositions remain their own.

The original generated patch contains a whitespace-only context line at
`build/generated.patch:7`. Its bytes remain intact for exact original-copy
verification; retained evidence was not normalized.

## Remaining qualification and lane completion

The predecessor [complete functional audit](INVENTORY_MOBILE_FUNCTIONAL_AUDIT_2026-11-21.md)
remains authoritative for its held gate. Its case 37 failed the retry analysis
verdict with balance, response and polarity failures. Its case 53 failed the
relative-gain assertion after both playback-level assertions passed: the hot
request was capped at -12 dBFS and the -30 dBFS request was honored. That failure
does not establish broken cap enforcement. Case 53 retained no numeric gain;
the separate retry case's numeric output must not be attributed to it.

The source comparison confirms byte identity for the seven specified audio
implementation/test files across fixed PR #79, the predecessor complete gate
and this frozen source. This is source-identity evidence only. It neither
diagnoses the runtime failures nor establishes a fix for issue #72.

Fixed PR #79 at `f769087` has its own earlier standard hosted evidence:
2,359 JavaScript cases with 2,358 passes, zero failures and one optional skip,
plus 1,411/1,411 UI checks. Those outcomes are documented in
[FEATURE_SUCCESSOR_HOSTED_EVIDENCE_2026-11-21.md](FEATURE_SUCCESSOR_HOSTED_EVIDENCE_2026-11-21.md)
and belong to that distinct source. They do not qualify this successor's
unexecuted browser assertions. Applicable hosted browser, native/platform,
performance and physical qualification remain separate.

This lane's project commands were limited to the one ordinary build, one
six-file focused gate and one syntax check described above. No further project
execution, full-suite run, numerical diagnostic, remote mutation or
qualification bypass occurred. Root owns consolidation, hosted work,
publication and any later authorization, and must receive all three fresh
final handoffs before the next rotation.
