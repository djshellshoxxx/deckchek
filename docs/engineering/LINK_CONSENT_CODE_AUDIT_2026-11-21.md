# External-link session consent — fresh code audit

Reviewer: `/root/link_consent_code_round10`. Date: 21 November 2026 UTC.
All three round-nine Mapper final handoffs completed before this fresh lane
began. This lane reviews source and retained data only; it executes no project,
test, syntax, browser, native, scanner, probe, extracted implementation or
packaged-verifier code. Root owns product changes, execution authorization and
publication. This report is the lane's sole owned path.

## Source review decision

**No material source or test-oracle blocker found in the four-file change.**
The session decision is consistently restricted to parsed HTTPS links without
userinfo or a nondefault port. The dialog describes and enforces that same
scope. The first complete gate passed all 14 new consent cases, but the complete
source remains **HELD** by its one audio relative-gain failure. A separate first
syntax check passed. The actual browser smoke is authored and unexecuted here;
neither callback tests nor a syntax result establish browser/native-platform
behavior. Final retained-package verification is recorded below.

| Source identity | Value |
| --- | --- |
| Fixed comparison: completed Mapper integration | `5cc4dcfa5f7a3a11455ab3ebd239bb9535288c51` |
| Policy/dialog/unit-test author commit | `937fda20c6f76b00387b86592c253d7b7d30854c` |
| Authored smoke addition | `c78f0518a9e9647ade9861b9f38041f264e10f49` |
| Reviewed preparation | `f1e0ca1fdcaf6c8276f5a92e883b84fc001bf425` |
| Complete preparation tree | `6e74b72253d94f10b03504ef8e0946d458da8e8f` |
| Tracked files / actual and tracked top-level tests | 2,345 / 202 |

The fixed comparison is an ancestor of the preparation; two-dot and three-dot
diffs identify the same four paths, with 276 insertions and 9 deletions. Initial
HEAD/tree and clean status matched the assigned freeze. I read the complete
diff, production module, native classifier/opening boundary, dialog builder,
bounded DOM fixture, existing link tests, authored smoke and implementation note.
The originating contract is [issue #84](https://github.com/djshellshoxxx/deckchek/issues/84),
read with [FS-07](../specs/07-open-external-links.md), particularly AC-2, AC-5,
AC-7 and the confirmation cases in its test plan. No actual unsafe navigation,
exposure, user incident or executed baseline reproduction is claimed.

| Reviewed file | Bytes | SHA-256 |
| --- | ---: | --- |
| `app/external-links.js` | 13,733 | `af930072057de00880fcbf308f4a19807107c34d0c7bf1dd161ef42c082d5311` |
| `tests/external-links-consent.test.mjs` | 7,259 | `fe2dd48a1a14553916aa6b376dfb34af0905c56d7cc71592621af126647d4982` |
| `tools/smoke/links.mjs` | 12,642 | `9ac861ab4500d7a0c4602022fa2c18026306a47e9b32b2072c117a342d86cc5a` |
| `docs/engineering/LINK_CONSENT_IMPLEMENTATION_2026-11-21.md` | 2,929 | `e340de8dc2194d872260572419c4035a17069f61ba8aef615b017cefb4ae8983` |

## Spec review

**One eligibility decision governs both opening modes.** After the existing
classifier accepts a URL, `canRememberHost` requires absent userinfo and absent
nondefault parsed port. `remembered` combines that eligibility with the existing
normalized hostname set. Browser mode checks it before deciding whether to ask;
native mode uses it for the first `confirmed` argument. A prior ordinary-host
approval therefore cannot preconfirm the newly exceptional authority.

**A fresh decision remains necessary for each exceptional URL attempt.** Both
branches add a hostname only when the choice is `always` and the URL is eligible.
An injected `always` response for credentials or a nondefault port can authorize
the current attempt but cannot create future host consent. Existing ordinary
host consent is retained and remains usable for later ordinary links. `open`
does not add consent; `cancel`/`copy` return without opening.

**Existing normalization and boundaries retain their roles.** The unchanged
classifier supplies lowercased/trailing-dot-normalized hostname, userinfo and
parsed port. Existing default-port normalization means explicit HTTPS 443 is
ordinary. The change does not broaden subdomain consent, rewrite allowlist
matching, persist the set, bypass blocked schemes or alter session reset and
debounce. Tests explicitly distinguish another host and a subdomain.

**The actual dialog matches the decision's scope.** Its ordinary-link checkbox
names standard HTTPS links and the current session lifetime. Exceptional links
omit the checkbox and show that every opening requires confirmation. Host, full
URL, nondefault-port and credential cues remain. The close callback safely
handles an absent checkbox; Cancel, Copy, Open and connected-trigger focus
restoration retain their existing flow. Changed display strings use `h` text
or string children, which the real builder turns into text nodes.

**Native authority remains unchanged.** `src-tauri/src/links.rs` still classifies
the URL and refuses a non-allowlisted URL unless the frontend explicitly sends
`confirmed`. This correction narrows how the frontend derives that bit. It does
not claim a new independent native authorization mechanism or change Rust's
opener, capabilities, navigation guard or command interface. The unchanged
classifier's non-allowlisted confirmation behavior for userinfo/ports follows
the originating issue and FS-07's explicit confirmation test cases; this diff
does not redesign that policy.

Spec axis: zero material missing, incorrect or extraneous requirements found
for the bounded issue #84 correction.

## Standards and test-design review

The Code Review skill's specification and standards axes were considered
separately within this assigned lane. The parent-assigned three-worker ownership
does not permit additional reviewer spawns. No separate repo coding-standard
or contributor file was found in the tracked file search; the existing module
structure, injected side effects and DOM builder are retained. No new dependency,
permission, configuration schema, persistence format or feature flag is added.
The two short eligibility predicates sit at their respective policy and dialog
boundaries and agree; no blocking duplication or speculative abstraction was
introduced.

The new Node file imports the real policy and dialog. Its opening mocks record
native arguments or browser parameters without opening or fetching a URL.
Native tests refuse the initial unconfirmed call and inspect the later argument
sequence. All synthetic hosts are in the reserved example test namespace.
The clock advances beyond the existing debounce; each test resets session state,
and the special-authority loop resets again before starting a new mocked session.

The authored 14 cases cover both modes, ordinary host reuse, normalized default
port/case/trailing dot, distinct hosts/subdomains, blocked HTTP, session reset,
port/userinfo combinations, Cancel/Copy/Open, subsequent fresh confirmation and
injected `always`. Dialog cases call the actual builder and close listeners,
check checkbox presence/absence and Cancel focus, and verify focus restoration
for the ordinary path. The existing fixture restores substituted global
descriptors; it models callbacks, attributes and attachment, not browser layout
or accessibility-tree behavior. Existing link tests retain allowlist mirror,
classifier, blocked scheme, copy fallback, debounce and interceptor guards.

The authored smoke establishes ordinary `example.org` session approval before
testing port/userinfo prompts. Browser opening is captured by the initialization
recorder; modeled native opening is intercepted before the real stub. Native
failure mode is reset to `ok` before these new cases. The checks assert an actual
open dialog, the full URL, no session checkbox, unchanged application location,
and the initial native `confirmed:false` followed by `true` only after Open.
Browser Cancel additionally checks that the recorded opening count is unchanged.
These additions preserve the earlier checks' fixed counts by running afterward.
They are authored browser coverage until source-specific hosted execution
actually occurs; a syntax result cannot substitute for it.

Standards axis: zero material documented-standard violations or blocking
maintainability findings in this scoped change.

## Retained execution evidence

I read the complete proposed external full-run and syntax recorders and their
configuration files as source. The full selection exactly equals all 202
actual/tracked top-level test files at the frozen commit. Both recorders bind
the clean branch/HEAD/tree, all 2,345 paths, absolute Node v24.22.3, complete
runtime streams and source maps/inventories. They reject existing output paths,
`NODE_OPTIONS`, audio diagnostic variables and an external Mixxx corpus. Their
only environment change prepends the pinned Node directory to `PATH`.

| Original recorder/configuration | Bytes | SHA-256 |
| --- | ---: | --- |
| Full recorder | 7,674 | `e03b068762ea42039c25e48f65fea12669193032fb55ebadf19f7bd57ba1233a` |
| Full selection | 8,641 | `a4d7eaf2ebfa34b2f549e7d3add0959f793af79082880c119071f0eae95133df` |
| Syntax recorder | 7,345 | `32e3ad1e27526af95fd10248688ec65b7eb722df7dfe9bf7506814f828a2407b` |
| Syntax selection | 583 | `39672b562518107bc81fbdc0f3f18d3304c4f266b53d794b5eed440c09666217` |

The complete-source command uses serial TAP with a 600-second ceiling, TERM at
595 and KILL by 600 if necessary. It is the first complete gate of the changed
Mapper/link integration, not an unchanged-source retry of the earlier hold.
The separate syntax command is only `--check tools/smoke/links.mjs`, bounded to
30 seconds with TERM at 25. No module evaluation or browser launch is part of
that syntax command.

The original first syntax record reports exit 0, no timeout, empty stdout/stderr,
0.11427837100200122 seconds, unchanged source/HEAD/tree and clean status. Its
checked source digest is the exact smoke digest above.

The first complete run recorded **2,420 tests: 2,418 pass, one failure and one
optional Mixxx corpus skip**, exit 1 without timeout in 370.04819690099976 seconds.
The original TAP has 555,767 bytes and SHA-256
`e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`.
The completed record retains unchanged source/HEAD/tree, all 2,345 before/after
hashes and inventory, clean status and empty project stderr. These are first
outcomes; no replacement run is part of the evidence.

Independent parsing of the raw stream identified all 2,420 consecutive outcome
indices. **All 14 new link cases 543–556 passed.** Matching every prior focused
Mapper test title against this full stream found all 96 exactly once with the
same outcome: 95 pass and the optional corpus skip, now case 964.

The sole failure is case 53, `session clamps the level to the -12 dBFS cap and
honours a lower level`. The stack identifies the final assertion at
`tests/audio-session.test.mjs:95`, whose message retains **−101 dB at −30 dBFS**.
The preceding assertions that requested −3 is capped to −12 and requested −30
is honored occur before that failing assertion and passed. This is a relative gain
assertion failure, not an observed failure of the output cap.

Source comparison to the earlier complete gate `e5614ff` finds nine changed
non-documentation paths: the six Mapper code/test/fixture paths, the external
link production module, its new consent test and the link smoke. Audio-quality,
audio-session implementation and their relevant tests remain byte-identical.
That identity does not establish the numerical cause or a repair.

### Independent complete-package verification

The independent retained-data verification completed successfully at
`2026-11-21T11:10:18.454101+00:00`. It used Git object reads and Python byte/data
checks authored within this review. It did not execute the project, a recorded
driver, a packaged verifier or a replacement test command.

The stable evidence directory is
`docs/engineering/evidence/link-consent-functional-2026-11-21/`. Its manifest has
35 entries excluding itself: 32 original copies and three derived JSON records.
I matched every recorded path, size and SHA-256 against the actual bytes, checked
that the directory contained exactly the declared entries and manifest, and
verified all 37 original-path bindings against the retained external originals.
The originals are the full and syntax recorder/configuration files plus their
two `deckchek-link-consent-round10-*-raw` directories under
`/workspace/scratch/6f2247f2f463/`; the checked smoke additionally binds to its
unchanged frozen source. No missing, changed or additional package entry was
found.

I read every distinct Git blob of preparation `f1e0ca1`, independently checked
its Git object digest and content SHA-256, and matched all 2,345 path records,
modes, blob identities and byte counts against `source-git-object-map.json`.
There are 2,155 distinct blobs and 72,510,660 bytes summed across source paths.
All four full/syntax before/after source maps and all four inventories match
that complete immutable source, as do the tracked source bytes in both code and
functional worktrees. This covers the entire frozen source rather than only
the edited files or a sample of hashes.

The actual 202-file selection, its order, original authorized configuration,
absolute Node runtime, runtime/version streams, complete argument arrays,
recorder digests, budgets, environment checks, first-running metadata and final
records agree. The syntax completion precedes the full-run start. Its retained
checked source equals the exact 12,642-byte smoke blob. Both executions retain
unchanged HEAD/tree and source snapshots, empty project stderr, and no timeout.
The full result retains exit 1; the syntax result retains exit 0.

I compared all 2,420 ordered outcome records with the raw TAP, including index,
status, name, skip reason, source line and the original outcome line. Every
top-level header, consecutive index, plan and footer count agrees. The complete
sole failure block is retained exactly, including its diagnostic values and
stack. All 14 new link outcomes match their raw cases 543–556. Every one of the
96 Mapper cases at 936–1031 matches the prior focused result's ordered names,
statuses and skip reasons; the sole skip is 964. The derived summary records
one full command, one separate syntax command, zero reruns and the complete
qualification hold. No passing subset replaces the failure in that record.

I also independently recomputed the source-comparison claims. The four changed
paths equal the author source at `c78f0518`; the six Mapper production/test/fixture
paths equal the earlier tested Mapper freeze at `6b8a2b29`; and the four native
policy/permission paths equal qualified main `e36ddc4`. All 75 changed paths since
the previous complete gate and the nine non-documentation paths agree with the
immutable Git comparison. These comparisons establish provenance and scope;
they do not transfer qualification from an earlier tree.

| Retained artifact | SHA-256 |
| --- | --- |
| Package manifest | `b3b15e1783419b1ffb10c3dd66692366acf0f172583d6630b3506ec5837a4b1c` |
| Full result | `9073e3008c0840fd1534a21599d6ea6fc485242a49ab88a69326b633c40a82be` |
| Original full TAP | `e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953` |
| Syntax result | `d0373562debde98d05740dfd764d6ec20d9f85b53eca56ff419be711d5211f36` |
| Each of the four complete source maps | `70df41f55c344fb03328eeb155e6d6eb6d4a350ea8abe009f6ce05b0cef53bd7` |
| Immutable source object map | `b9cafd029150b8aabd9842f22659acfa2d9d87532b1c755e7acc8f9601372385` |
| Source proof | `57c250f13b4d4d6e819913050e0f0ebbd091c9893d85e95af37919acdbaa197b` |
| Complete ordered summary | `bc586b779195a47d2552ebe45a3ffc0c2f09b7f677237191d4cf3149dd125347` |
| Functional audit report, 15,799 bytes | `00f5727026ec2d2c09543876039bb4ba1ccd51791f49b45f361d9037bce93dc9` |

The source proof and ordered summary were independently checked against their
immutable sources and raw observations; their self-reported booleans were not
used as substitutes for those checks. The functional report agrees with the
retained source, first results and limited execution scope. The independent
review found no evidence-integrity discrepancy. The complete-source result
remains **HELD**.

### Immutable functional handoff

After package acceptance, I independently checked functional commit
`d7c5b4a5e210838aea76ce019488d7d800c50a08`, tree
`26c94b05343b1a4c6852a641819a5cbb55e9fa53`, with sole parent
`f1e0ca1fdcaf6c8276f5a92e883b84fc001bf425`. Its clean branch is
`review/deckchek-link-consent-functional-20261121`. Its only 37 changes are added
files: the functional report and the 36-file evidence directory. Every committed
blob equals the already reviewed bytes, including the unchanged report and
manifest digests above. All original 2,345 preparation tree entries retain
their exact mode and blob identity; the handoff contains 2,382 tracked files.
No source mutation or new execution was introduced by that handoff.

## Preserved qualification boundary

The preceding first complete gate at `e5614ff` retained 2,395 total / 2,393 pass /
one failure / one optional skip. Its final relative-gain assertion recorded
−101 dB at −30 dBFS after the earlier playback-level assertions passed. The
round-nine Mapper-only first gate passed 95 with one optional skip; it did not
resolve that complete-source hold. The qualified PR #79 main merge `e36ddc4`
belongs to a separate source/tree and does not qualify this later preparation.
All original failures, fixed published heads and scoped evidence remain intact.

No numerical cause, speculative repair, threshold change, physical qualification,
Fleet enablement, release or deployment is part of this review. Root owns later
applicable gates, complete-tree/current-base/ordered-parent proof and any guarded
merge. All three round-ten FINAL handoffs are required before another rotation.
