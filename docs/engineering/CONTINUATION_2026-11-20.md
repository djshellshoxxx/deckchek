# DeckChek continuation — 20 November 2026

Dates use America/Vancouver. This report supersedes older publication/queue
instructions; historical results retain their original sources and scope.

## Completed consolidation

PR #34 merged as `a62459da712236184f037ab31a19b82586ffb0b3`; PR #38 merged as
`715f5ca7bd3c4f461adc8bdca944fbef3d599bac` before this resumed session.
This session reviewed unchanged PR #45 source
`7e362e64ee00af6110f04511382af0c77296eb7e` and merged it as
`f46abbea458ba2bb8c2f6d438eba4f5b0a58c948`. Merge tree
`328b31fa3770355a6acb4ab754d0d9f36da72fbc` matches the reviewed candidate.

| Applicable candidate workflow | Result before merge |
| --- | --- |
| [Standard](https://github.com/djshellshoxxx/deckchek/actions/runs/44748882136) | JavaScript, Rust and UI smoke passed |
| [Nightly](https://github.com/djshellshoxxx/deckchek/actions/runs/44748882036) | All five jobs passed |
| [Desktop](https://github.com/djshellshoxxx/deckchek/actions/runs/44748881942) | Six builds and five packaged smokes passed; tag-only release jobs skipped |

The desktop workflow's first attempt failed the offline Ledger image smoke.
Attempt 2 passed unchanged; the cause remains unconfirmed. Fresh
[code](CODE_REVIEW_RESUME_2026-11-20.md),
[functional/Spec](BUG_HUNT_RESUME_2026-11-20.md) and
[defensive security](SECURITY_REVIEW_RESUME_2026-11-20.md) reviews accepted the
source within their documented scopes. A new multibyte exact-budget regression
passed in the 19/19 ZIP/browser-bundle scope on Node 24.22.3 and is retained here;
it did not change the frozen PR #45 candidate.

PRs #35, #36, #37, #39, #40, #41, #42, #43 and #44 are closed as superseded.
All branches remain. Heads of #35–#37 and #41–#44 are ancestors of main. The
divergent #39/#40 production correction functions and complete regression
additions are retained verbatim in `705dfd3`, also on main. These closures do
not assert separate individual-PR merges.

## Separate Ledger diagnostics

PR #46 retains `800511850c8f311e2e8bd50c5cd2dffbd5ddb246` and now targets main.
The reviews accepted this isolated change. Its original offline predicate stays
unchanged; added image readiness/counts include no image bytes or image URLs.
The readiness query follows the audit, so the observations are not atomic.

Standard checks, six builds and five packaged smokes passed. The
[nightly ASan job](https://github.com/djshellshoxxx/deckchek/actions/runs/44759032908/job/136366325979)
failed the Fleet timing assertion: **237.092791 ms** against **200 ms**;
**766 passed, 1 failed, 8 ignored**, 259.07 s. The inspected log had no ASan
memory diagnostic. An initial targeted retry was rejected because cargo-fuzz
remained running. Cargo-fuzz subsequently passed, completing the workflow with
four successful jobs and the recorded ASan failure. GitHub then accepted one
targeted retry of that failed ASan job on unchanged source. The retry result is
pending at this checkpoint; retain the original failure and unchanged limit.
The scheduling cause is unknown. PR #46 remains unmerged pending its gates.
The independent [Fleet investigation](FLEET_ASAN_TIMING_REVIEW_2026-11-20.md)
confirmed the timing failure and existing bulk-query structure. Its SQL-only
diagnostic did not establish a Rust optimization; no production or gate change
was made. A recurring failure needs actual native phase/allocation measurements.

## Successor implementation

Devices source `6612dbaed32edf9638f65a020d400fe12944a24a` orders complete read
snapshots and preserves the active visit, view and assignment form across
catalog completions. The baseline had **16 passes / 9 failures**; the corrected
compatibility scope passed **94/94** on Node 24.22.3. Independent security and
functional reviews accepted it. A new hidden-catalog/focus case passed in a
**22/22** lifecycle scope. See [author](DEVICES_REFRESH_SUCCESSOR_2026-11-20.md),
[security](DEVICES_REFRESH_SECURITY_REVIEW_2026-11-20.md) and
[functional](DEVICES_REFRESH_ACCEPTANCE_2026-11-20.md) reports.
The separate direct-save correction is source
`f598418da60bf727b58509fd584cf10fd8a967d9`. Successful result/unit saves and an
acknowledged assignment advance cache publication ownership before their
existing notifications, so an older read cannot remove or revert the new cached
row. Failed writes leave valid reads eligible; later fresh reads still publish.
Submitted writes, IPC and expected-binding transactions are unchanged. Its
baseline reproduced **7 passes / 4 failures**; the corrected ten-file scope
passed **102/102** on Node 24.22.3. See
[the source-bound handoff](DEVICES_CACHE_WRITE_SUCCESSOR_2026-11-20.md).
Fresh [code/functional acceptance](DEVICES_CACHE_WRITE_ACCEPTANCE_2026-11-20.md)
passed **38/38** selected tests on Node 22.23.4, and an independent
[defensive review](DEVICES_CACHE_WRITE_SECURITY_REVIEW_2026-11-20.md) accepted
the exact source. Neither identified a remaining blocker within this scope.

Profile source `c05ad30caa15f6dc425e44327dcc5270227ad40e` records DJM-900NXS2
USB MIDI and S4 MK3's lack of supported USB MIDI controller mode. DIN stays
unknown; S4 remains conditional with explicit output selection. No global
planner, threshold, handwritten check, identity or map changed. Conditional
MIDI falls from **3 profiles / 9 requirements** to **2 / 6**. Totals remain
**45 profiles, 506 handwritten, 187 generated, zero gaps and 22 conditional
audio profiles**. The [author](PROFILE_PREREQUISITES_SUCCESSOR_2026-11-20.md)
passed **108/108** checks on Node 24.22.3. The
[independent reviewer](PROFILE_PREREQUISITES_ACCEPTANCE_2026-11-20.md)
re-fetched primary evidence, clarified remaining S4 uncertainty wording in
`89b5015`, and passed **100/100** overlapping checks on Node 22.23.4.
The earlier **107-pass/1-fail** generated-file mistake remains recorded.

## Final combined qualification

Frozen source `33d01d24e81d71450cde80f74d1c5b94bf144ece`, tree
`cfd21a14be36b9029c4766ba39a356e4a1fe89f4`, passed the complete serial
Node 22.23.4 suite across **181 top-level test files: 2,200 passed, zero failed,
one optional skip** (2,201 total). The skipped local Mixxx corpus check requires
`MIXXX_CONTROLLERS_DIR`, which was not set. Test duration was 757.042 seconds;
the enclosing qualification took 757.420 seconds and exited successfully.
All **1,541 tracked file hashes stayed unchanged**, and the frozen checkout
remained clean. The [machine-readable proof](CONTINUATION_2026-11-20_EVIDENCE.json)
records the runtime, source, counts, elapsed time and full log SHA-256.

The [durable executable-source commit](https://github.com/djshellshoxxx/deckchek/commit/880234ff9bbc1dfb0660d2cdf00a1a9a81e4d533)
is `880234ff9bbc1dfb0660d2cdf00a1a9a81e4d533`; its tree exactly equals the
tested local tree. Final independent acceptance reports, this completed report
and its evidence file are documentation-only overlays. No application, test,
generated coverage, dependency, migration or workflow file changed after the
combined run began.

At this frozen source, all **10 changed JavaScript files** passed syntax checks.
Device index, generated coverage, timecode facts, all 25 migrations and mobile
vendor/precache checks passed. No new local native/browser/hardware execution
is claimed; the resulting published source requires its own applicable hosted
checks. Focused test counts overlap and are not additive.

The successor candidate uses branch
`integration/deckchek-continuation-20261120-resume`, based on merged main
`f46abbea458ba2bb8c2f6d438eba4f5b0a58c948`. Inspect its live associated PR and
current hosted results before integration. Leave its source stable while those
checks run; further work belongs on a separate owned branch.

## Resume boundaries

Keep archive output capped at 20 MiB, Fleet off, and permissions, dependencies,
thresholds, persistence contracts and hardware/release gates intact. Physical
H-00..H-33, owner databases, reference accuracy, real MIDI/VirtualDJ/WASAPI,
broader incident windows/isolation, mature vinyl/DVS, signing and release work
remain separate. Software tests do not establish physical results.

The existing hourly continuation stays enabled. Resume live refs and this report.
Hold published candidates stable while checks run; use separate branches for
other work. Merge only after applicable checks pass. Credit balance is unavailable;
unrelated tool errors do not establish exhaustion. No release, deployment, tag,
branch deletion or history rewrite is included.
