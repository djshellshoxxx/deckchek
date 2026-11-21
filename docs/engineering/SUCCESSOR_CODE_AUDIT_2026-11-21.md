# Consolidated successor — fresh code audit

Reviewer: `/root/successor_code_round4`. Review date: 21 November 2026,
America/Los_Angeles. This independent round began after all three fit/UI
round-three workers completed. This lane owns only this report.

## Disposition

**Accepted for the bounded code and integration scope: no new material source
blocker was identified in optional reference-file identity, the PDF span
guard, responsive toolbar/Player guide or ledger preset correction.** I also
independently inspected the fresh functional worker's first complete Node24
gate: **2,359 total / 2,358 pass / 0 fail / 1 existing optional skip**, exit 0.
The current observation establishes neither a cause nor a repair of earlier
numerical failures. Actual successor browser/native qualification remains a
separate evidence boundary.

The reviewed source is commit `fb81960b417ad16c155b7793814cbb4a7545d41e`, tree
`724274fae453a867e4adf5009deef7b0cf4b190c`, on
`review/deckchek-successor-code-20261121`. The comparison baseline is qualified
main `77c26f44710c6dfb1c986fb79266c233e2ae688c`, tree
`5986c675b123203ecaf46f352d99a25b539c9f9f`. Earlier hosted qualification belongs
to that baseline and its tested source; it is not a rendering result for this
successor.

I read the [current concise handoff](../DECKCHEK-CONTINUATION-HANDOFF.md), the
[completed fit/UI continuation](FIT_AND_UI_CONTINUATION_2026-11-21.md), preceding
scoped code/functional reports, the actual changed source, its relevant
consumers, maintained tests and smoke discovery. Methods were static source
and Git inspection, text/JSON/TAP reading, and byte/hash comparison. No project
runtime, syntax check, browser, native build, scanner, probe or numerical
reproduction ran in this lane. No product, test or other report was edited.

## Source and integration boundary

The baseline-to-freeze delta under app, tests, diagnostic tools and smoke tools
contains exactly seven production files, five test files, five diagnostic
files and three browser smoke files. There is no change under `src-tauri`,
`database` or `.github`.

| Changed production path | Reviewed responsibility |
| --- | --- |
| [reference-file.js](../../app/player/reference-file.js) | Bounded local file identity and primitive metadata |
| [player-capture.js](../../app/ui/screens/player-capture.js) | Async reference ownership, capture/export linkage and static guide |
| [player-capture.css](../../app/styles/player-capture.css) | Reference controls/status presentation |
| [report-pdf.js](../../app/report-pdf.js) | Reject nonrepresentable axis spans before SVG projection |
| [index.html](../../app/index.html) | Device-control accessible names |
| [styles.css](../../app/styles.css) | Responsive header, device fields and action controls |
| [privacy.js](../../app/ledger/privacy.js) | Own-key preset recognition with explicit-choice preservation |

The following relevant production modules are byte-identical to qualified
main. Their independently computed SHA-256 values bind the unchanged
boundaries; they are not new qualification of their behavior.

| Module | SHA-256 |
| --- | --- |
| `app/audio-quality.js` | `4f4ed3df91d6b923f4fe7edaede0fbe2b4b3c300c0fc97d07dbfe7d510225db6` |
| `app/calibration.js` | `ebab986c71064ee6aadcecc2659a97f0b403310daf027749c41702ce03df5d72` |
| `app/features.js` | `7a6ca2b7f7e9830e3ed61c349eed481d5140cabee1cd247916b74e2e12002d34` |
| `app/player/acquisition.js` | `49e67475808248d9f920c9a69ea090786669c1faf54b6f4cf0ccea36a5961fe8` |
| `app/player/evidence-record.js` | `52e7e28403610375ba3db26f2b7e94db3a334fb0b916205489442b754e9a4207` |
| `app/sha256.js` | `149be96b973ffa7a0d4e1ae38f211f3b7db9f904ed2596701c6c90ea95883855` |

### Optional reference identity and lifecycle

The helper snapshots filename and declared size before awaiting the read. It
requires a positive safe-integer length no greater than 32 MiB, a nonblank
filename of at most 240 UTF-16 code units without C0/DEL controls, an
`arrayBuffer` reader, and a returned ArrayBuffer whose length exactly matches
the snapshot. The unchanged SHA helper hashes those selected bytes. The frozen
descriptor contains primitive identity fields only, including the digest,
filename, byte length, hash basis, unverified playback identity and
`bytesRetained: false`. It contains no File or buffer.

The real screen's picker handler snapshots the first File and clears the input
value before deciding whether a hidden, disposed or busy screen may accept it.
This ordering covers a picker that delivers after navigation or another busy
transition. One task and AbortController own an accepted read. Cancellation
suppresses publication, while task ownership remains busy until the operation
settles; another read or capture cannot overlap that pending task. Publication
also requires matching task identity, visibility and an undisposed owner.
Hide/show cannot reactivate a cancelled request.

Selecting or clearing a reference discards the previous capture result. A
failed new selection leaves no previous reference available for accidental
reuse. Capture snapshots the completed immutable descriptor before awaiting;
the handler and disabled controls reject reference changes during capture.
The operator's explicit reference label takes precedence over the filename
fallback, and the selected digest enters the existing record field. Export
explicitly selects acquisition, record and selectedReference, with null for an
absent selection. Captured audio, File objects and raw buffers are excluded.

The screen's hide, Escape, feature-disable and disposal paths invalidate
pending publication. The existing shell supplies real navigation/disable
lifecycle calls. Status/filename rendering uses text content. The acquisition
and evidence constructors still require the existing native capture boundary
and retain provisional, unverified, report-ineligible, measurement-null output.
Player capture and Fleet remain default-off; native commands, leases, channel
pair and duration restrictions are unchanged.

This operation establishes selected-file identity only. It neither decodes
nor validates the audio, identifies what was physically played, persists raw
reference bytes, nor creates a measured report/History record. Logical
cancellation does not abort or erase an already-running read/digest. The
unchanged synchronous SHA fallback and 32 MiB acceptance cap do not establish
a universal latency or whole-process memory bound. These limits remain
consistent with the screen and guide.

### PDF span correction

Both axes pass through `niceTicks`. The new guards reject a nonfinite or
nonpositive raw step, chosen step, or final rounded span before tick generation
and projection. The final span check covers the retained defect where finite
endpoints near -8e307 and +8e307 round outward to finite bounds near -1e308 and
+1e308 whose difference overflows. Existing chart exception handling converts
that rejection into an escaped, visible Chart unavailable warning and
placeholder. Normal stored data, thresholds and ordinary tick selection are
unchanged.

This is a representability correction. Existing twelve-significant-digit
tick cleanup can still coalesce nearby ticks at a large common offset; the
change does not establish universal extreme-axis accuracy or readability.
No unsupported numerical fix is proposed here.

### Toolbar, accessible names and Player guide

The device and sample-rate controls now have explicit accessible names.
Buttons cannot flex-shrink away, the header can grow at the medium breakpoint,
and narrow layouts let the device group and fields wrap. The main grid follows
the growing header, and select width/minimum-width constraints bound long
device names. The source preserves existing shell navigation and control
behavior. Actual geometry, hit targets, accessible roles and print rendering
require the maintained browser checks below.

The Player guide is static text populated through the existing inspector API
without forcing the drawer open. It describes provisional capture, optional
selected-file identity, unverified playback, metadata-only export and the
existing Escape, Ctrl+E and I actions. It makes no new measurement, History or
physical-qualification claim. The shell import does not introduce a screen
dependency cycle.

### Preset boundary and compatibility

One private predicate now requires a primitive string and an own key of the
frozen preset definitions. `makeRules`, `normalizeRules` and `matchesPreset`
share that recognition; matching also refuses a missing, nonobject or array
field map. Unknown names obtain the complete Public defaults instead of
inherited-object values. The three declared presets and export whitelist are
unchanged.

Normalization still preserves valid explicit serial mode, fields, item
choices, owner and custom label, so restoring a customized saved rules object
does not silently replace its privacy decisions. The ledger screen and build
consumers continue to normalize before use. This is a bounded preset-name
correction, not a claim to validate every arbitrary object/proxy or item shape.

## Maintained coverage and its limits

| Coverage inspected | Meaningful protection and remaining boundary |
| --- | --- |
| [Reference helper tests](../../tests/player-reference-file.test.mjs) | Actual Node File, known digest, byte-vs-name identity, exact size cap, invalid metadata before reads, returned-length/type checks, read failure, cancellation around awaits, immutable descriptor and pre-await snapshots. These do not prove browser picker behavior. |
| [Player screen tests](../../tests/player-capture-screen.test.mjs) | Retained existing capture tests plus selected/null export, label fallback, busy ownership, capture snapshot, old-result removal, clear/Escape/hide-show, real shell navigation/disable calls, disposed delivery and picker-value clearing. DOM/native behavior is modeled. |
| [PDF tests](../../tests/report-pdf.test.mjs) | Both raw and rounded X/Y overflow/underflow, visible fallback and representative ordinary/tiny/large finite output. They do not establish all-axis precision. |
| [Preset tests](../../tests/ledger-preset-boundary.test.mjs) | Declared/inherited/nonstring names, malformed field maps and preservation of explicit custom/per-item choices. They exercise the intended shared boundary. |
| [Shell layout smoke](../../tools/smoke/shell-layout.mjs) | Browser and modeled-native modes, long device name, 320/420/800/1440 widths, all eight controls, minimum target size, overlap, center hit, main/header separation, document overflow and accessible combobox names; screenshots at 420/1440. |
| [Player smoke](../../tools/smoke/player-capture.mjs) | Actual browser File selection and input cleanup, known identity-only bytes, guide text, disable clearing, modeled-native capture, real downloaded metadata and no audio/measurement/History claim. |
| [PDF smoke](../../tools/smoke/pdf.mjs) | Print-media visible placeholders beside an ordinary SVG, bounded geometry/font checks, no invalid coordinate strings, and PNG/real Chromium PDF artifacts. |

The existing [smoke runner](../../tools/ui-smoke.mjs) discovers every smoke
module and propagates a failed check or exception to failure. The new shell
module is therefore integrated without a registry edit. No assertion was
weakened to accept an unsafe axis, retained reference, preset inheritance or
overlapping toolbar. This lane inspected the checks without running them.
No new browser screenshot, FileList, print artifact or native result is
claimed from these source assertions.

## Diagnostic artifacts and preserved earlier observations

The maintained fit preparer, recorder and driver match their approved prior
copies byte-for-byte. I checked their integration boundaries and independently
verified all 68 entries in the preceding [functional evidence manifest](evidence/fit-and-ui-functional-2026-11-20/manifest.json).
Diagnostic files are under tools, not the configured `app` frontend directory;
no product module imports them. The context serializer is dynamically imported
by the test's final hook only when `DECKCHEK_AUDIO_CONTEXT_PATH` is set. The
standalone numerical diagnostic is not imported by the app or test selection.

The runner lifecycle test retains all 18 case names and 118 assertion calls
in the same order as qualified main. Its optional collector retains completed
contexts only when enabled. Its expanded retry-failure message serializes
already-returned results/counters; that still changes allocation context, so
the test file is not described as byte-identical. Neither the expected verdict
nor production arithmetic/thresholds changed. Diagnostic observation cannot
be treated as numerically inert merely because original assertions remain.

The prior focused selection recorded 82/82 passing at `eafaa53`, with 2,036
stable tracked hashes. Its original file named run.tap contains SPEC output;
that original format is preserved. The disposable trace recorded 33/33 at
tool-only `f3a8a5d`, with 2,039 stable source/copy hashes. Its 527 events include
580 stable fit-field/identity snapshots, 348 stable slice observations and
matching entry/return full-buffer identities for 29 completed analyses. No
original failing raw fit was captured. These overlapping diagnostic and
focused observations are not additive test totals, a numerical repair, or
full-source qualification.

The earlier complete reference/PDF gate at `ded34d2` remains 2,357 total /
2,354 pass / 2 fail / 1 optional skip. Its retained TAP SHA-256 is
`29ef19e0e0916e94e4c1ce0b27be3805f173375686cd522cf9aa8db11a77dec4`.
The cubic THD assertion and the runner retry verdict failure remain separate
observed failures without an established common cause. The intervening
33-case aggregate observation also retains its two failures. Unchanged
production bytes and later passing traces cannot identify an engine, solver,
alias, mutation or ownership cause.

## Fresh complete gate

The fresh functional worker alone executed the one authorized complete serial
Node24/TAP gate on this freeze. I independently read its first retained result,
runtime/argv metadata, complete TAP and source comparison. I hashed the raw
streams, compared both complete tracked maps with each other and all 2,125
immutable Git blobs, and compared the test selection with every regular
top-level `tests/*.test.mjs` path in the frozen tree.

| Independently inspected observation | Result |
| --- | --- |
| Runtime | Node v24.22.3, Linux x64; recorded executable under the primary runtime |
| Exact selection | 193 files, sorted; `--test --test-concurrency=1 --test-reporter=tap` |
| Complete result | 2,359 total / 2,358 pass / 0 fail / 1 optional skip |
| Cancellation / TODO | 0 / 0 |
| Exit / timeout | 0 / false |
| Elapsed seconds | 363.495217706 |
| Start / end UTC | `2026-11-21T08:33:54.779435+00:00` / `2026-11-21T08:39:58.547685+00:00` |
| Tracked source | All 2,125 before/after entries equal the reviewed immutable blobs; HEAD/tree unchanged and checkout clean |
| Complete TAP | 540,148 bytes; SHA-256 `102009e4ba4133f6d90dee363e928458595de332183fe7cf32b43cd8a221c962` |
| stderr | Empty; SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Instrumentation environment | No recorded diagnostic variables; `NODE_OPTIONS` absent; only recorded environment change is the runtime PATH prefix |

The sole skip is the existing optional Mixxx controller corpus because
`MIXXX_CONTROLLERS_DIR` is unset. There are no failed TAP entries. The cubic
nonlinearity and failed-attempt/immediate-retry cases both pass in this current
observation with the original assertions retained. It is one complete passing
observation on this changed successor, not proof of a numerical repair,
universal stability, browser behavior or physical measurement validity.

The [complete retained metadata](evidence/successor-functional-2026-11-21/result.json),
[TAP](evidence/successor-functional-2026-11-21/run.tap) and
[manifest](evidence/successor-functional-2026-11-21/manifest.json) are owned by
the functional lane. I verified all 12 manifest entries, byte equality of the
eight original raw artifacts and the driver's recorded digest. Manifest
SHA-256 is `cf20f0b6ef503a90f38a4a6e9187a3b50bb2bd59fa80dd5a3127a2af316cf47c`;
result metadata SHA-256 is
`7ad509925d87148b994a0d43581e999bd37d5ad783b9cd0621ed1f89807ae310`.
Static inspection of the retained driver confirms one full-suite invocation,
exclusive first-output-directory creation and no retry loop. No rerun, further
numerical diagnostic, engine switch or speculative fix was requested here.

## Handoff boundary

Root owns any corrections, publication and applicable hosted qualification.
The local Chromium restriction was not retried; actual successor rendering,
native/platform behavior, scientific validity and physical capture remain
separate gates. Issue #72's cause remains unestablished. Reference/raw
retention, pitch integration, History/report persistence and the broader
diagnostics requirement remain outside this accepted code scope.

The separately assigned inventory/history work for #76/#77 is outside this
freeze and was neither reviewed nor modified here. No Fleet action, remote
mutation, threshold relaxation, release, deployment or credit-exhaustion
claim follows from this report. Rebind this review if relevant production,
tests or smoke source changes. All three current lanes must finish before
another fresh rotation begins.
