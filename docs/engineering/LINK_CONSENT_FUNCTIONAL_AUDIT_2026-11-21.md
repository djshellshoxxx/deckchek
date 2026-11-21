# External-link consent — fresh functional audit

Reviewer: `/root/link_consent_functional_round10`. Date: 21 November 2026,
UTC. This fresh lane began after all three round-nine Mapper final handoffs
were completed and consolidated. It was the sole authorized project executor
for round ten; root owned product fixes, publication and merge decisions.

## Disposition

**All fourteen new link-consent cases passed, but complete-source qualification
remains HELD.** The first complete serial Node gate selected all 202 actual and
tracked top-level test files and retained **2,420 tests: 2,418 passed, one failed
and one optional Mixxx corpus test was skipped**. Exit was 1 without a timeout
after 370.04819690099976 seconds. All 2,345 tracked source hashes, the full
inventory, HEAD/tree and clean checkout status remained unchanged.

The sole failure was audio-session case 53's final relative-gain assertion:
**measured −101 dB at −30 dBFS**. The preceding assertions in that test checked
the −12 dBFS output cap and the selected lower playback level and passed before
the final assertion was reached. This is not an observed output-cap failure.
No numerical cause or repair is established. Cases 22 and 37 passed in this
observation; that does not replace their earlier source-specific failures.

The separately authorized first syntax check of `tools/smoke/links.mjs` passed,
exit 0, with empty stdout/stderr and the same 2,345-file source unchanged. It
took 0.11427837100200122 seconds. The smoke was parsed only, not evaluated or
run in a browser. No command was repeated.

The [complete first TAP](evidence/link-consent-functional-2026-11-21/full/run.tap),
[first full result](evidence/link-consent-functional-2026-11-21/full/result.json),
[syntax result](evidence/link-consent-functional-2026-11-21/syntax/result.json)
and [ordered outcomes](evidence/link-consent-functional-2026-11-21/observed-summary.json)
retain the exact observations. They do not qualify a merge or release.

## Source, ownership and authorization

| Item | Identity |
| --- | --- |
| Completed Mapper integration | `5cc4dcfa5f7a3a11455ab3ebd239bb9535288c51` |
| Link policy/dialog/unit-test author | `937fda20c6f76b00387b86592c253d7b7d30854c` |
| Authored smoke addition | `c78f0518a9e9647ade9861b9f38041f264e10f49` |
| Reviewed and tested preparation | `f1e0ca1fdcaf6c8276f5a92e883b84fc001bf425` |
| Complete preparation tree | `6e74b72253d94f10b03504ef8e0946d458da8e8f` |
| Tracked source / top-level test files | 2,345 / 202 |
| Branch | `review/deckchek-link-consent-functional-20261121` |
| Worktree | `/workspace/scratch/6f2247f2f463/deckchek-link-consent-functional` |

The four-file difference from the completed Mapper integration is the external
link policy/dialog module, new consent regression file, authored link smoke and
implementation note. All four match the author source at `c78f051`; this lane
made no production, fixture, test or smoke change. The six Mapper application/
fixture/test paths are unchanged from the prior focused freeze `6b8a2b2`.
The native link implementation, bundled allowlist, default capability file and
CSP configuration are unchanged from qualified main `e36ddc4`.

All three current reviewers accepted the frozen source before execution. Root
fully read both external recorders and their complete configurations, then
independently checked their sizes/hashes, source identity, exact inventory and
absent output paths. Root authorized these exact invocations once, sequentially:

```bash
python3 -u /workspace/scratch/6f2247f2f463/deckchek-link-consent-round10-syntax.py /workspace/scratch/6f2247f2f463/deckchek-link-consent-round10-syntax-config.json
python3 -u /workspace/scratch/6f2247f2f463/deckchek-link-consent-round10-full.py /workspace/scratch/6f2247f2f463/deckchek-link-consent-round10-full-config.json
```

The complete gate was conditional on the first syntax result exiting 0 with
unchanged source. That condition was observed before the full invocation.
Both used Bash, `login:false`, and the worktree above. Recorders, configuration
and original outputs stayed outside the checkout. No report or evidence file
was written inside the checkout until both commands had finished their final
source snapshots. Each recorder refuses an existing output directory. Static
Python AST parsing and JSON/inventory inspection preceded authorization; those
preparation checks did not load or execute project code.

This was the first complete gate for the changed Mapper/link integration,
including inherited Mobile/Quick changes. It was not a repeat on the previous
`e5614ff` source, and its failure is not eligible for a replacement run.

## Functional source review

[Issue #84](https://github.com/djshellshoxxx/deckchek/issues/84) is a static
confirmation-scope finding. The existing classifier already treats credentials
or a nondefault port as requiring confirmation, but the former session lookup
used the hostname alone. This review examines the correction and its defensive
post-correction regressions. No baseline execution, external navigation,
exploitation or actual exposure is claimed.

In [`app/external-links.js`](../../app/external-links.js), remembered host consent
is eligible only when the parsed URL has neither userinfo nor a nondefault port.
Both the initial native `confirmed` argument and browser-mode decision use that
same eligibility result. Storing a new host decision also requires eligibility.
An injected `always` response for an ineligible URL therefore approves only its
current attempt; it neither seeds new host consent nor suppresses later prompts.

Ordinary HTTPS host consent remains session-only. Existing normalization of
case, a trailing dot and an explicit default 443 port remains. Different hosts
and subdomains require their own decisions. Reset clears remembered hosts.
The URL classifier, scheme/length/control/whitespace rules, allowlist matching,
punycode display, debounce and native command contract are unchanged. The
native implementation continues to enforce its own URL policy and trusted
frontend confirmation argument; a modeled invocation test is not execution of
that Rust implementation.

The actual confirmation dialog now creates the session checkbox only for an
eligible URL and labels it as applying to standard HTTPS links. Other URLs
state that each opening requires confirmation. Host/full URL, port and userinfo
cues remain plain text. Cancel keeps default focus, Copy/Open keep their
decisions, and completion removes the dialog and restores an attached trigger's
focus. Optional checkbox access handles dialogs that intentionally omit it.

The new unit cases import the real policy and real dialog builder. Opening and
clipboard boundaries are in-memory recorders, and the existing service DOM
fixture supplies elements, synchronous close events and global restoration.
The native model opens only when it receives `confirmed: true`, while assertions
also inspect the initial false and subsequent explicit true calls. The fixture
does not reimplement the policy. It establishes callback decisions, text and
focus bookkeeping in that fixture, not real layout or an accessibility tree.

The authored smoke retains a recorder for browser opening and a separate
modeled native invoke. After ordinary host approval, its added cases require
the actual port/userinfo dialog, absence of a session checkbox, and a fresh
decision. Browser Cancel keeps the open count fixed; Open adds exactly one
recorded URL with `noopener,noreferrer`. Native calls begin unconfirmed and
change to confirmed only after the explicit decision. Both pages remain at the
application location. Only syntax evidence is available for these new smoke
cases in this round; their runtime behavior remains unobserved here.

## First complete gate and observed coverage

The full recorder pinned absolute Node
`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`, used
`--test --test-concurrency=1 --test-reporter=tap`, and supplied the explicit
sorted 202-file array. That array matched both the actual and tracked complete
top-level test inventories. No shell wildcard or optional external corpus
expanded the selection. Complete first TAP and stderr were retained as bytes.

| Measure | First complete outcome |
| --- | --- |
| Runtime | Node v24.22.3, Linux x64; Python v3.12.14 |
| Started, UTC | `2026-11-21T10:55:15.003415+00:00` |
| Completed record, UTC | `2026-11-21T11:01:25.245812+00:00` |
| Project process elapsed | 370.04819690099976 seconds |
| Budget | 600 seconds; TERM at 595, KILL by 600 if needed |
| Exit / timeout | 1 / false |
| Total / pass / fail / skip | 2,420 / 2,418 / 1 / 1 |
| Cancelled / TODO | 0 / 0 |
| Complete TAP / project stderr | 555,767 bytes / empty |
| Source integrity | All 2,345 paths unchanged; same HEAD/tree; clean |

All fourteen new consent cases, **543–556**, passed:

| Behavior | Passing cases |
| --- | --- |
| Ordinary consent, normalization, separate host/subdomain decisions and session reset in both modes | 543, 548 |
| Fresh port, userinfo and combined-authority decisions; Cancel/Copy do not open; Open is per-attempt | 544–546, 549–551 |
| Injected `always` on a special authority cannot create host consent | 547, 552 |
| Actual ordinary dialog checkbox, default Cancel focus and restored trigger focus | 553 |
| Actual port/userinfo/combined dialog omits the checkbox and preserves Cancel/Copy/Open | 554–556 |

The complete Mapper sequence is cases **936–1031**. Its 96 ordered names and
statuses exactly match the prior focused Mapper observation: 95 pass and one
optional skip. The eleven new Mapper cases are included. Case **964** is the
full suite's sole skip because `MIXXX_CONTROLLERS_DIR` was absent. Existing
allowlist, interceptor, opener fallback, debounce, native-contract and permission
guards also remain part of the complete selection.

Case **53** retained the only failure block, including original message,
location and stack. Its assertion is `tests/audio-session.test.mjs:95`; prior
cap and lower-level assertions are earlier in the same sequential test.
Case **22** (cubic distortion) and **37** (retry after capture cannot start)
passed in this observation. No isolated retry, instrumentation, altered engine
option, threshold change or speculative numerical patch followed the failure.

The full Node selection includes the existing build-helper contract tests. This
lane did not separately run an official Mobile build or launch a browser/native
application. `NODE_OPTIONS`, the audio-context variable, all audio-fit diagnostic
variables and the optional corpus variable were absent. Each recorder's only
environment change prepended the pinned Node directory to `PATH`.

## Separate first syntax result

The syntax invocation checked only the 12,642-byte `tools/smoke/links.mjs`, whose
SHA-256 is `9ac861ab4500d7a0c4602022fa2c18026306a47e9b32b2072c117a342d86cc5a`.
It used `node --check`, not module import or execution. The original checked
source copy, recorder/config, runtime streams, stdout/stderr, result and complete
before/after source maps/inventories are retained.

| Measure | First syntax outcome |
| --- | --- |
| Started / completed record, UTC | `2026-11-21T10:55:11.187733+00:00` / `2026-11-21T10:55:11.392505+00:00` |
| Process elapsed | 0.11427837100200122 seconds |
| Budget | 30 seconds; TERM at 25, KILL by 30 if needed |
| Exit / timeout | 0 / false |
| Stdout / stderr | Empty / empty |
| Source | Same HEAD/tree; all 2,345 hashes and inventory unchanged; clean |

Both recorders retained original Node version/runtime stdout and stderr. Their
independent metadata agrees on Node v24.22.3 and its exact executable. Syntax
success establishes parsing only; it provides no new browser, native, platform
or physical qualification.

## Evidence integrity and handoff

The frozen [manifest](evidence/link-consent-functional-2026-11-21/manifest.json)
contains **35 entries**, excluding itself: **32 original copies** and three
derived JSON files. Its **37 original-path bindings** cover every raw file from
both output directories, all four original recorder/config files and the exact
checked smoke source. No original stream was filtered or replaced. All entries
have recorded byte lengths and SHA-256 digests.

The [complete object map](evidence/link-consent-functional-2026-11-21/source-git-object-map.json)
was derived by reading all frozen Git blobs with `git cat-file --batch`, verifying
each blob identity and independently hashing its bytes. It contains all 2,345
paths, 2,155 distinct blobs and 72,510,660 source bytes. **All four** full/syntax
before/after maps equal those immutable digests, all four inventories equal the
complete path set, and the original source paths still contained those bytes
before packaging. These checks did not execute any project or packaged verifier.

The [source proof](evidence/link-consent-functional-2026-11-21/source-proof.json)
also retains the exact four-file author comparison, unchanged six-file Mapper
implementation and unchanged native policy/permission sources. Relative to the
prior `e5614ff` complete gate, the non-documentation difference is exactly nine
Mapper/link application, fixture, test and smoke paths. Audio source was not
changed by this integration.

The [observed summary](evidence/link-consent-functional-2026-11-21/observed-summary.json)
preserves every one of the 2,420 consecutive ordered outcome lines, titles,
statuses, original line positions and skip reason, plus the complete original
failure block. Its counts agree with both TAP footer and recorded result. It
also records the fourteen link cases, complete Mapper sequence and separate
syntax result without treating a partial pass as complete qualification.

| Artifact | SHA-256 |
| --- | --- |
| Manifest | `b3b15e1783419b1ffb10c3dd66692366acf0f172583d6630b3506ec5837a4b1c` |
| First full result | `9073e3008c0840fd1534a21599d6ea6fc485242a49ab88a69326b633c40a82be` |
| Complete first TAP | `e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953` |
| First syntax result | `d0373562debde98d05740dfd764d6ec20d9f85b53eca56ff419be711d5211f36` |
| Each complete source map | `70df41f55c344fb03328eeb155e6d6eb6d4a350ea8abe009f6ce05b0cef53bd7` |
| Complete Git object map | `b9cafd029150b8aabd9842f22659acfa2d9d87532b1c755e7acc8f9601372385` |
| Source proof | `57c250f13b4d4d6e819913050e0f0ebbd091c9893d85e95af37919acdbaa197b` |
| Ordered observed summary | `bc586b779195a47d2552ebe45a3ffc0c2f09b7f677237191d4cf3149dd125347` |

The complete manifest, raw copies, derived data and this report are held stable
for independent code/security review. The final handoff changes only this
report and its assigned evidence directory. It must complete before root starts
another fresh worker trio.

## Preserved qualification boundary

The preceding first full result at `e5614ff` remains an original observation:
2,395 total / 2,393 pass / one failure / one optional skip, with final relative
gain −101 dB at −30 dBFS. The current first result independently records the same
assertion value on its own changed source, without identifying the cause. Neither
the new consent-case passes nor the syntax result clears either failed gate.

Qualified PR #79 merge `e36ddc41806b0f6639474f207e3b339e063a6e25` belongs to
its separate complete tree. Later Mapper, Mobile, Quick Check and link-consent
changes need their own applicable qualification. No actual browser/native
launch, network probe, scanner, installer, numerical diagnostic collector,
baseline reproduction, rerun, permission change, feature enablement, release
or deployment occurred in this lane. Broader CI/publication remains root-owned;
physical audio/MIDI and privacy/Fleet limitations remain unchanged.
