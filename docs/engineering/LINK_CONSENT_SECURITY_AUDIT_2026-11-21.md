# External-link session consent — static defensive security audit

Date: 21 November 2026 UTC. Reviewer: `/root/link_consent_security_round10`.

## Source decision and scope

No material static security or retained-evidence blocker was found in the scoped
four-file change. All fourteen new link cases passed, while the first complete
gate remains **HELD** by the retained audio-session final relative-gain failure:
2,420 total / 2,418 pass / one fail / one optional skip. The complete package has
been independently checked against its originals and immutable source blobs.
The implementation narrows remembered host consent to HTTPS URLs without
userinfo or a nondefault port, consistently in the browser and native-invoke
paths. The dialog offers only a decision that the policy can honor. This is a
source review of the defensive correction for issue #84, not an executed
baseline reproduction, observed disclosure or broad release qualification.

The clean reviewed preparation is
`f1e0ca1fdcaf6c8276f5a92e883b84fc001bf425`, complete tree
`6e74b72253d94f10b03504ef8e0946d458da8e8f`. It contains 2,345 tracked files and
202 top-level test files; the actual and tracked test inventories agree. Its
ordered parents are author `c78f0518a9e9647ade9861b9f38041f264e10f49` and the
completed Mapper integration `5cc4dcfa5f7a3a11455ab3ebd239bb9535288c51`.
All three Mapper final handoffs completed before this fresh review started.

The complete delta from the Mapper integration consists of exactly the four
paths below, and all four are byte-identical to author `c78f051`. No native,
capability, dependency, feature-default, CI or allowlist resource file changed.

| Changed path | Bytes | SHA-256 |
| --- | ---: | --- |
| `app/external-links.js` | 13,733 | `af930072057de00880fcbf308f4a19807107c34d0c7bf1dd161ef42c082d5311` |
| `tests/external-links-consent.test.mjs` | 7,259 | `fe2dd48a1a14553916aa6b376dfb34af0905c56d7cc71592621af126647d4982` |
| `tools/smoke/links.mjs` | 12,642 | `9ac861ab4500d7a0c4602022fa2c18026306a47e9b32b2072c117a342d86cc5a` |
| `docs/engineering/LINK_CONSENT_IMPLEMENTATION_2026-11-21.md` | 2,929 | `e340de8dc2194d872260572419c4035a17069f61ba8aef615b017cefb4ae8983` |

The Security and Hardening skill informed the trust-boundary, input/output,
least-privilege and privacy review. This lane performs static source and retained
data inspection only. It executes no project code, tests, syntax checks,
browser/native application, scanner, probe, extracted implementation, packaged
verifier or vulnerability reproduction. Git reads and independent Python
byte/hash/data checks are not project execution. Root owns fixes, execution
authorization, publication and merges.

## Confirmation boundary

[`openExternal`](../../app/external-links.js) classifies the original input before
examining remembered consent. Invalid inputs and disallowed schemes still exit
through the existing blocked-link branch. For a valid HTTPS URL, remembered
consent now requires both the existing normalized-host set entry and absence of
userinfo/nondefault port. Both opening modes use the same computed eligibility
and remembered decision.

In native mode, the first `open_external_url` call therefore carries
`confirmed: false` for a URL with either special authority characteristic, even
when its normalized host was previously approved. The frontend asks only after
the unchanged native policy returns `needs_confirm`. Cancel returns without a
second native call; Copy uses the existing clipboard path and does not invoke
the opener again. Open or an injected `always` response can confirm the current
attempt, but `always` can add a host entry only for an eligible ordinary URL.

Browser mode applies the same remembered decision alongside the existing
classifier allowlist result. Userinfo/nondefault ports already make the
classifier return non-allowlisted, so an earlier host approval cannot suppress
their new prompt. The only opening call remains the existing
`open(url, '_blank', 'noopener,noreferrer')`, after an allowed decision. The
ineligible `always` path permits only the current attempt and never creates
future ordinary-host consent. Repeated special-authority attempts continue to
ask, including after a successful explicit Open.

The normalized-host set remains memory-only and session-scoped. Normal HTTPS
paths on the same host can reuse an explicit approval. Explicit default port
443 retains the existing URL-parser normalization; different hosts and
subdomains do not inherit a set entry. The change does not add wildcard session
approval, durable storage or approval inferred from a failed classification.

## Native policy and unchanged controls

[`src-tauri/src/links.rs`](../../src-tauri/src/links.rs) remains unchanged.
`open_external_with` classifies the URL itself, refuses invalid/scheme-blocked
inputs, and requires the trusted frontend confirmation bit for non-allowlisted
URLs. It passes a normalized URL as one opener argument, not a shell command.
The command defaults an absent confirmation to false and logs host/outcome
only, rather than the full URL or query. This fix corrects how the trusted
frontend derives that bit; it does not claim a new native authorization boundary
against compromised frontend code.

The existing HTTPS-only, nonempty-host, length, control/whitespace, host-label
boundary, allowlist-version, punycode and default-port rules are unchanged in
both implementations. The 500 ms debounce, native error/copy fallback, local
file helpers and intercepted click/middle-click/context-menu paths are also
unchanged. No permission, capability, CSP, platform settings URI, URL allowlist
entry, telemetry, automatic upload or feature default expands in this delta.

## Dialog and data exposure

The actual confirmation dialog now omits the session checkbox for userinfo or
a nondefault port and says that the link requires confirmation each time.
Ordinary links retain the checkbox with an explicit standard-HTTPS label.
The optional checkbox read cannot turn a special-authority Open into `always`.

Host, punycode host, full URL and port remain rendered through `h` text values
or string children. [`app/ui/dom.js`](../../app/ui/dom.js) implements those as
`textContent` and text nodes; no untrusted HTML sink is introduced. The existing
userinfo and IDN cues remain visible. URL display and explicit Copy retain
their existing local disclosure behavior; this change adds no credential
collection, logging or network transfer.

Cancel retains default focus. The dialog continues to distinguish Open, Copy
and cancellation, removes itself when closed and restores focus to a connected
trigger. The implementation note accurately distinguishes these callback
properties from real-browser rendering and native-platform qualification.

## Regression and smoke review

The new regression file imports the real policy and dialog builders. Its
browser opening callback, native invoke callback and clipboard callback are
in-memory recorders; it cannot open or fetch the example URLs. Native callbacks
return `needs_confirm` until the actual frontend supplies a true confirmation,
and assertions inspect the exact recorded boolean sequence. The fixtures do
not replace the policy under test.

Both mode tables cover normal host/session reuse and normalization; different
hosts and subdomains; blocked HTTP; reset; nondefault port, userinfo and their
combination; Cancel/Copy/Open; repeated fresh decisions; and an injected
`always` result that must not seed host consent. Dialog cases call the actual
builder and close callbacks using the existing bounded DOM fixture, including
default Cancel focus, checkbox eligibility, displayed cues, decision values
and connected-trigger focus restoration. The fixture restores substituted
globals and models text nodes and event callbacks. It does not prove layout,
accessibility-tree behavior or browser/OS integration.

The authored smoke extends the existing actual-page link flow after a host has
been approved. Browser mode installs a recording `window.open` before the app
captures it. Modeled native mode wraps the existing fake Tauri bridge and
records `open_external_url` without reaching a native opener. It verifies
fresh port/userinfo dialogs, unavailable session checkboxes, Cancel/Open paths,
initial native `confirmed: false` followed by explicit true, normal host reuse
and unchanged application location. These are source observations about the
authored smoke. A syntax pass would not execute it or establish rendering,
native application behavior or actual external navigation.

## Retained first-gate evidence

The designated functional worker owns the first complete 202-file serial Node
gate and the separate changed-smoke syntax check. I read both entire external
recorders without executing them. Their guards pin the clean preparation,
branch, full source inventory, actual/tracked test inventory and Node v24.22.3;
reject Node/audio diagnostic overrides and the optional external Mixxx corpus;
refuse existing output paths; and preserve complete first streams and source
maps. The full gate uses a 600-second ceiling (TERM at 595); the syntax gate
uses a 30-second ceiling (TERM at 25) and selects only `tools/smoke/links.mjs`.
Runtime identity probes are separate from project evaluation. Neither recorder
launches the authored browser smoke or a native application.

| External recorder read as source | Bytes | SHA-256 |
| --- | ---: | --- |
| `deckchek-link-consent-round10-full.py` | 7,674 | `e03b068762ea42039c25e48f65fea12669193032fb55ebadf19f7bd57ba1233a` |
| `deckchek-link-consent-round10-syntax.py` | 7,345 | `32e3ad1e27526af95fd10248688ec65b7eb722df7dfe9bf7506814f828a2407b` |

The retained first complete result is **HELD**: 2,420 total / 2,418 pass / one
failure / one optional Mixxx corpus skip, exit 1 without timeout. The project
process elapsed 370.04819690099976 seconds, starting at
2026-11-21T10:55:15.003415+00:00; its completed record is dated
2026-11-21T11:01:25.245812+00:00. Project stderr is empty. The full TAP is
555,767 bytes, SHA-256
`e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`.

All 14 new consent/dialog cases, indices 543–556, passed in this complete run.
The sole optional skip is case 964 (`MIXXX_CONTROLLERS_DIR` absent). The sole
failure is case 53's final relative-gain assertion at
`tests/audio-session.test.mjs:95`, retaining **−101 dB at −30 dBFS**. The earlier
playback-level assertions in that case were reached and passed. This observation
does not establish an audio cause or repair, and it does not replace any earlier
first outcome. The non-documentation delta from the preceding `e5614ff` complete
source is exactly nine Mapper/link production, fixture, test and smoke paths;
audio implementations, numerical tests and thresholds are unchanged.

The separate first syntax check passed with exit 0, no timeout and empty
stdout/stderr in 0.11427837100200122 seconds. Its checked source bytes match the
frozen `tools/smoke/links.mjs` and the table above. Original result SHA-256 is
`d0373562debde98d05740dfd764d6ec20d9f85b53eca56ff419be711d5211f36`.
The result records unchanged HEAD/tree, all 2,345 source hashes and inventory,
and clean before/after state. This is syntax evidence only.

### Independent final-package verification

The stable [manifest](evidence/link-consent-functional-2026-11-21/manifest.json)
contains exactly 35 entries, excluding itself: 32 byte-exact original copies
and three derived JSON files. All 37 original-path bindings were independently
checked. They cover all sixteen files in each original output directory, the
four external recorder/configuration originals and the exact checked smoke
source. No extra package file is omitted from the manifest, and no original
stream or metadata file is absent. Every byte count and SHA-256 matched.

Independent Python data checks read `git ls-tree -r -z` for the immutable
preparation, then all 2,155 distinct blobs with `git cat-file --batch`. Each
Git blob identity, raw size and SHA-256 was independently verified. The complete
[object map](evidence/link-consent-functional-2026-11-21/source-git-object-map.json)
matches all 2,345 paths, modes, blob identities, sizes and digests, representing
72,510,660 source bytes. All four original full/syntax before/after maps equal
those immutable digests, all four inventories equal the complete sorted path
set, and the frozen source paths in both functional and security worktrees
still match. New owned reports/evidence are outside that tested path set.

Both running/result records, original Node version/runtime streams, exact
executable, argv, source/branch/cwd identities, budgets, environment declarations
and recorder/configuration digests agree. The full selection equals all 202
actual and tracked top-level test files, without omitted files or shell wildcard
expansion. The checked smoke copy equals its frozen source and both recorded
before/after source digests. Both runs retained clean before/after source state;
project and runtime-probe error streams are empty. These are data inspections,
not execution of either recorder or a project verifier.

The [ordered summary](evidence/link-consent-functional-2026-11-21/observed-summary.json)
matches every one of the 2,420 original TAP outcome lines, names, indices,
statuses, skip reasons and exact line positions. Every top-level subtest header,
the complete plan and all footer counts agree. The sole failure's complete
original block, including its message, location and stack, is preserved exactly.
The fourteen new link cases match their recorded indices and passes. The full
Mapper sequence, cases 936–1031, matches all 96 prior focused names and statuses:
95 pass and the one optional skip, now at full-suite index 964.

The [source proof](evidence/link-consent-functional-2026-11-21/source-proof.json)
correctly identifies the four unchanged author paths, the six Mapper code/test
paths unchanged since `6b8a2b2`, and native link/allowlist/capability/CSP files
unchanged since qualified `e36ddc4`. Its complete 75-path comparison from
`e5614ff` and nine-path non-documentation subset match Git. The ordered summary
also accurately keeps the first full failure, first syntax pass, zero-rerun
record and complete-source qualification hold separate.

| Independently verified artifact | SHA-256 |
| --- | --- |
| Manifest | `b3b15e1783419b1ffb10c3dd66692366acf0f172583d6630b3506ec5837a4b1c` |
| First complete result | `9073e3008c0840fd1534a21599d6ea6fc485242a49ab88a69326b633c40a82be` |
| First syntax result | `d0373562debde98d05740dfd764d6ec20d9f85b53eca56ff419be711d5211f36` |
| Each of four complete source maps | `70df41f55c344fb03328eeb155e6d6eb6d4a350ea8abe009f6ce05b0cef53bd7` |
| Complete Git object map | `b9cafd029150b8aabd9842f22659acfa2d9d87532b1c755e7acc8f9601372385` |
| Source proof | `57c250f13b4d4d6e819913050e0f0ebbd091c9893d85e95af37919acdbaa197b` |
| Complete ordered summary | `bc586b779195a47d2552ebe45a3ffc0c2f09b7f677237191d4cf3149dd125347` |

The complete functional report was read and its fixed 15,799 bytes independently
matched SHA-256
`00f5727026ec2d2c09543876039bb4ba1ccd51791f49b45f361d9037bce93dc9`.
Its qualification limits agree with the originals. This package contains the
retained recorders and derived JSON proof, without a separate packaged verifier.
No project or verifier code was executed by this audit lane.

## Preserved earlier evidence

Qualified PR #79 merged separately at
`e36ddc41806b0f6639474f207e3b339e063a6e25`. Its qualification belongs to its
exact tree. The previous first full observation at `e5614ff` remains preserved:
2,395 total / 2,393 pass / one failure / one optional skip. Its final relative
gain was −101 dB at −30 dBFS after earlier playback-level assertions passed.
The completed Mapper gate at `6b8a2b2` separately retained 96 total / 95 pass /
zero fail / one optional Mixxx skip. No numerical cause, repair or replacement
of either original observation is inferred from this review.

Root retains all wider qualification and publication decisions. Fleet stays
default-off and its diagnostic head fixed. No release, deployment, threshold
weakening, default change or permission expansion is authorized by this audit.
All three round-ten FINALs must finish before another fresh worker rotation.
