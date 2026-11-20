# DeckChek consolidation: ZIP integrity and Devices navigation

**19 November 2026 — America/Los_Angeles.** This continuation combines the latest
reviewed integration work with the complete ZIP follow-up and a separately
reviewed Devices navigation correction. Source qualification remains specific to
the commit and tree identified below.

## Source and branch disposition

The starting `main` is `8c43cf17e3d5f5067ece5667f1aec1540f4b4091`.
The fresh read-only branch audit found the same 29 historical non-main tips as the
[preceding branch audit](CODE_AUDIT_2026-11-19.md): 21 are ancestors of that main,
and the eight divergent histories have implementation already represented,
repaired or deliberately superseded. No additional missing implementation was
identified. All original branches remain preserved.

The combined candidate retains both active source histories:

| Source | Exact commit | Contribution |
| --- | --- | --- |
| [PR #34](https://github.com/djshellshoxxx/deckchek/pull/34) | `c9cf52974aad41a00f052bae596b7096b855a5df` | Existing-unit profile assignment, file boundaries, MIDI evidence, Service lifecycle, and the final Data, PDF, picker, phone and announcement repairs |
| [PR #37](https://github.com/djshellshoxxx/deckchek/pull/37), including #35 and #36 | `8f8972e720277f1b9ec9981f33553d28a8a6f7a1` | ZIP filename, payload, timestamp and total-size validation |
| Local history-preserving merge | `04ef279a7637cdfbc4b7b5ce41662a3c09447cf5` | Both histories, with no conflict and no replacement of the newer PR #34 files |
| Independently accepted Devices correction | `da9099b648bebdf4ee0f65a34de75cef5f20114f` | Retired-show and shared-cache ownership; ten persistent regressions |

The ZIP stack branched from the older PR #34 source `3cff35894f0e1edd1277f9dc4e480232b9c2de90`.
Replacing the latest integration tree with that ZIP branch would discard later
repairs. The merge instead adds only `app/zip-writer.js` and
`tests/zip-writer.test.mjs` to `c9cf529`; the other latest source and test files
remain intact. Its tree is `4e1d95643ec090f91d1c06fa6a38126c7fcacac5`.

The Devices correction changes only `app/ui/screens/devices.js`,
`app/ui/devices/library-state.js` and `tests/devices-screen-lifecycle.test.mjs`.
The final application/test candidate tree is
`1de031ce74b121cdace67fa091d488b256c5da2e` at `da9099b`.

The same immutable executable source now exists remotely as
[`46845c761d0cf7d69451ed9343ee89aa649c2706`](https://github.com/djshellshoxxx/deckchek/commit/46845c761d0cf7d69451ed9343ee89aa649c2706),
with the exact local `da9099b` tree. Its parent is the remote merge
`55713b0cbd542b1a7f2c3a158bc4e602176c8ea7`, whose tree is identical to local
`04ef279` and whose parents are `c9cf529` and `8f8972e`. Creating these Git objects
did not publish a branch, open a PR, or establish a new CI result. The planned
documentation child will descend from `46845c` after combined qualification.

## Resulting behavior

### Browser diagnostic ZIPs

The writer rejects malformed UTF-16 names instead of silently replacing lone
surrogates. It rejects unsupported payload types instead of accepting implicit
zero-filled data, and invalid dates instead of encoding impossible DOS fields.
The existing 20 MiB ceiling now includes local records, UTF-8 filenames, payloads,
central-directory records and the end record. Each entry is checked against the
aggregate limit before its CRC is computed; final-output allocation occurs only
after all entries pass. Exact-cap archives remain accepted.

Existing stored-entry format, CRC behavior, fixed diagnostic filenames, ZIP32
guards, dependencies and the numerical 20 MiB ceiling remain unchanged. This
writer creates an archive; it does not extract files or select native paths.

### Devices navigation and cached library data

A Devices `onShow` previously consumed its pending handoff before loading. If the
user navigated away during a read, it could later apply that captured handoff,
replace the active screen's inspector, change the selected unit, or overwrite a
newer asset/result cache after the user returned.

Each show now owns a generation. Hiding the screen or starting a newer show
retires the older generation. Checks after both asynchronous boundaries require
the same generation and a connected, visible section. Library refresh stages the
asset and result reads, then publishes them together only while that request is
current. Late successful and rejected reads cannot replace the newer show-owned
cache or redraw its current assignment form.

The handoff is consumed after the current reads complete and ownership is checked.
An interrupted show leaves it available for a later visit; a newer handoff takes
precedence. Callers that omit the new optional refresh guard retain successful
refresh and empty-array failure behavior.

## Verification and independent review

| Scope and source | Evidence |
| --- | --- |
| Combined ZIP/browser-bundle/diagnostics at `04ef279` | **40 passed / 0 failed**, Node 24.22.3 |
| Final ten Devices regressions against unchanged `04ef279` production | **2 passed / 8 failed**, Node 22.23.4 |
| Identical regression file after the correction | **10 passed / 0 failed**, Node 22.23.4 |
| Devices lifecycle, assignment core/form/screen and map compatibility at `da9099b` | **29 passed / 0 failed / 0 skipped**, Node 22.23.4 |
| Independent Devices source review | **ACCEPT_FOR_INTEGRATION**, bound to `da9099b` and tree `1de031ce`; reviewer performed no tests or builds |
| Combined full serial JavaScript suite at `da9099b`, identical tree to remote `46845c` | **2,171 passed / 0 failed / 1 optional Mixxx-corpus skip / 0 cancelled; 2,172 total**, all 179 top-level test files on Node 22.23.4 |
| Static consistency gates at the same source | Device index current; timecode facts consistent; **25 migrations** valid; mobile vendor copies and precache current |
| JavaScript syntax | **428 non-vendor modules passed** across app, mobile, tools and tests |
| Existing performance budgets | Both passed without changes: controller **2,400 hops**, **1.015 ms mean / 34.60 ms worst / 0.07 MB retained heap growth**; monitor **2,400 hops**, **0.787 ms mean / 46.30 ms worst / 0.06 MB retained heap growth**. Existing gates require **mean < 5 ms** and **retained heap growth < 10 MB**. |

The full run started at **22:13:33** and completed at **22:25:42 America/Los_Angeles**
on 19 November. Reported TAP duration was **728,428.333353 ms**; the wrapper elapsed
time was **728.888 seconds**. All **1,527 tracked file hashes**, commit, tree and
clean-checkout status matched before and after execution. The source-inventory
SHA256 is `1d2ab45bdb79e5727bafa2ad7176b75efc43c96bf4a70faaca1afb3d264a6588`;
the retained full-log SHA256 is
`b0241727d287105310bfe2e1088d11fa45ab33d48a8c3dd61e7bd2fb6ecb1feb`.
This documentation overlay does not change the tested application or test files.
Every tracked hash also remained unchanged through the final static, syntax and
performance checks. The sole full-suite skip is the optional local Mixxx corpus
because `MIXXX_CONTROLLERS_DIR` was not set.

Focused counts overlap; they are not additive unique test totals. The ten-case
red/green evidence covers normal display, retirement during library loading,
pending asset/result reads, hide-return overlap, current assignment-form
preservation, retained and replaced handoffs, rejected stale reads, and default
refresh compatibility. The earlier exploratory red run remains separate evidence.
`git diff --check` passed, and the author's committed worktree was clean.

A separate defensive source review at `04ef279` (tree `4e1d956`) accepted the
combined ZIP, file-read, profile assignment, native catalog-transfer and
report-redaction boundaries within its inspected scope. It identified no new
material security blocker. This was a
read-only source review, not an updated dependency scan, runtime penetration
test, or whole-application security certification.

## Hosted qualification snapshot

The following describes the preceding published candidates. The initial check
was **19 November at 22:08:38 America/Los_Angeles**; the ASan and packaged-smoke
updates below supersede their earlier queue states. These results do not qualify
`da9099b` or any later combined source.

| Published source | Observed status |
| --- | --- |
| PR #34, `c9cf529` | [Standard JavaScript, Rust and browser smoke](https://github.com/djshellshoxxx/deckchek/actions/runs/44666361718) passed. All six [desktop builds](https://github.com/djshellshoxxx/deckchek/actions/runs/44666361696) passed. Packaged smoke passed for Linux x64 at **22:14:27**, Windows x64 at **22:15:15**, and macOS ARM64 at **22:19:25 America/Los_Angeles**; Windows x86 and macOS Intel remained queued. |
| PR #34 nightly | All five jobs passed: cargo-fuzz, JavaScript fuzz/stress, Windows Rust, Rust persistence stress and the [ASan retry](https://github.com/djshellshoxxx/deckchek/actions/runs/44666361732/job/136105028302). The retry completed at **22:13:43 America/Los_Angeles**. |
| PR #36, `e699ccb4ab3b837e739b62df560928dc51049b70` | [Standard JavaScript, Rust and browser smoke](https://github.com/djshellshoxxx/deckchek/actions/runs/44671758516) passed. |
| PR #37, `8f8972e` | [Standard JavaScript, Rust and browser smoke](https://github.com/djshellshoxxx/deckchek/actions/runs/44678208209) passed. |

The original PR #34 ASan attempt had **766 passed / 1 failed / 8 ignored**. Its
Fleet reminder test took **224.106189 ms**, exceeding the unchanged **200 ms**
budget. That recorded failure is a performance assertion, not a reported
AddressSanitizer diagnostic. The subsequent successful retry recorded **767 passed
/ 0 failed / 8 ignored**, with **251.33 seconds** reported test duration; that same
Fleet reminder test passed. The original failure remains historical evidence,
not a current failed gate. No threshold or security gate was relaxed.
`ASAN_OPTIONS` still uses `detect_leaks=0`; the successful run does not establish
leak detection. The initially queued packaged smokes had completed dependencies
but no runner; available job data did not establish the provider's scheduling cause.

PRs #36 and #37 target `review/**` branches. Their green standard workflows do not
establish platform/nightly qualification: those workflows also trigger for PRs
targeting `main` or `integration/**`. The final combined candidate must obtain its
own applicable hosted results before integration. Keep published candidates
stable while their checks run; continue other changes in separate owned work.

## Boundaries and next useful action

The Devices fix guards `onShow` requests. Existing unguarded catalog-event and
other default refresh callers can still overlap one another or a current show;
that pre-existing behavior is outside this correction. Session-owned library
initialization and submitted database operations are not cancelled by navigation.

One low-impact ordinary ZIP edge remains: clamping only the year of a valid
future leap-day date to 2107 can encode February 29 in a non-leap year. The
production caller uses the current clock. This was recorded by source review,
was not reproduced or fixed here, and does not block the scoped consolidation.

Root owns final publication and integration. The planned route is a new
`integration/deckchek-consolidation-20261120` candidate targeting `main`, which
applies the standard, nightly and platform workflow filters. Preserve the
published PR #34–#37 heads while their current qualification completes. If PR #34
fully qualifies first, it can be integrated at its exact head; the successor
still retains the ZIP and Devices additions. No new PR number, publication or
merge is asserted by this report's prepublication snapshot. Refresh live refs
before any write and merge only after applicable checks pass for that source.

Fleet remains disabled by default. Hardware H-00..H-33, owner databases, known
references, actual MIDI/VirtualDJ/WASAPI interoperability, measurement validation,
installer signing and release qualification remain separate gates. This
continuation authorizes no release, deployment, tag, force push, history rewrite
or branch deletion. No physical result is inferred from deterministic tests.
