# Link-consent consolidation — 21 November 2026 UTC

## Completed review and preserved first result

All three fresh round-ten workers completed before the next rotation. The
four-file issue #84 correction has no material scoped source, test-oracle or
static security blocker in their final reviews. Complete-source qualification
remains **HELD**. Frozen `f1e0ca1fdcaf6c8276f5a92e883b84fc001bf425`, tree
`6e74b72253d94f10b03504ef8e0946d458da8e8f`, produced its first complete serial
Node v24.22.3 gate over all 202 top-level test files: **2,420 total / 2,418 pass /
one fail / one optional Mixxx skip**, exit 1 without timeout in
370.04819690099976 seconds. All 2,345 tracked source hashes, inventory, HEAD/tree
and clean status were unchanged.

All 14 new link cases, indices 543–556, passed. The complete Mapper sequence at
936–1031 matched its prior focused names and outcomes: 95 pass / one optional
skip. The sole full failure is case 53's final relative-gain assertion, retaining
**-101 dB at -30 dBFS** at `tests/audio-session.test.mjs:95`. Earlier cap and
lower-playback-level assertions passed. The original failure block is intact;
no numerical cause, repair or replacement run is inferred.

| Final lane | Commit | Report |
| --- | --- | --- |
| Code | `5b010a6a95232a5f99ed383290bc592268b2e792` | [Code audit](LINK_CONSENT_CODE_AUDIT_2026-11-21.md) |
| Functional | `d7c5b4a5e210838aea76ce019488d7d800c50a08` | [Functional audit](LINK_CONSENT_FUNCTIONAL_AUDIT_2026-11-21.md) |
| Static security | `849fa8ff8d45b2191a196d2be8132e6173efc0ce` | [Security audit](LINK_CONSENT_SECURITY_AUDIT_2026-11-21.md) |

Every final handoff has the tested preparation as its sole parent. Root verified
each clean worktree, owned path set, committed report/evidence bytes and exact
tree/parent, then preserved all three histories through local merges. The
verified durable Mapper checkpoint and its publication proof are also retained.

## Behavior and evidence

Remembered consent applies only to ordinary HTTPS URLs without userinfo or a
nondefault port. Browser and native-invoke paths require a fresh decision for
those exceptional URLs; even an injected `always` response cannot seed session
consent. The actual dialog omits the inapplicable checkbox and retains plain-text
destination cues, Cancel/Copy/Open decisions and focus handling. Native policy,
permissions, allowlist, validation, debounce and session reset remain unchanged.
This corrects the static issue #84 finding; no actual unsafe navigation,
baseline exploitation or exposure is established.

The separate first `tools/smoke/links.mjs` syntax check passed, exit 0 without
timeout in 0.11427837100200122 seconds, with empty streams and unchanged source.
It parsed the authored smoke without executing it. New browser/native-platform
rendering and behavior therefore remain unqualified.

Both peers and root independently checked all 35 manifest entries, 32 original
copies and 37 original-path bindings; all four complete source maps/inventories
against 2,155 immutable Git blobs; and every ordered outcome, original line and
failure block. The [manifest](evidence/link-consent-functional-2026-11-21/manifest.json)
SHA-256 is `b3b15e1783419b1ffb10c3dd66692366acf0f172583d6630b3506ec5837a4b1c`.
The original 555,767-byte [TAP](evidence/link-consent-functional-2026-11-21/full/run.tap)
has SHA-256 `e08afec065f474c3981872e198abf85991c515fe127cdcb0a12a35e69926a953`.
The [root proof](evidence/link-consent-integration-2026-11-21/root-source-proof.json)
records independent data checks and all final handoff identities.

## Qualification and next work

The earlier `e5614ff` first full failure, `6b8a2b2` Mapper focused pass and
qualified PR #79 main `e36ddc4` remain separate source-specific evidence. None
is overwritten or transferred to this later source. Issue #84 remains open
pending qualified integration. Root/code/security executed no project code;
the functional lane ran exactly its two authorized first commands. No rerun,
browser/native/scanner/probe launch, numerical diagnostic, permission expansion,
release or deployment followed the failure. Fleet remains default-off with its
fixed diagnostic head unchanged.

The next isolated authored candidate is Player captured-audio export
`fb2a34a74a9e7b0ff4ba205269c8ee517f059cef`. It adds explicit opt-in, a bounded
local normalized-PCM archive and capture/reference metadata without qualifying
pitch or report eligibility. It remains unexecuted until a fresh trio accepts
its frozen combined source and root authorizes the sole functional worker's
bounded first commands. Root retains all integration, publication and CI work.
