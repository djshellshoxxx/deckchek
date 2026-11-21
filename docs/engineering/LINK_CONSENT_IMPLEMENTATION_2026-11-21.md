# External-link session consent scope

[Issue #84](https://github.com/djshellshoxxx/deckchek/issues/84) is a static
confirmation-policy finding at qualified main `e36ddc4`. The classifier already
requires confirmation for credentials or a nondefault port, but the frontend's
hostname-only session approval could mark a later changed-authority URL as
confirmed. No actual navigation, exposure or baseline execution is claimed.

The correction defines remembered host consent as ordinary HTTPS links without
userinfo or a nondefault port. Both browser-mode opening and the initial native
invoke use that same eligibility check. Other URLs require a fresh decision;
even an injected `always` response permits only the current attempt and cannot
create a remembered host entry. The Rust command continues to enforce its URL
policy and confirmation bit; its interface and implementation are unchanged.

The actual dialog offers the session checkbox only when that decision can be
remembered. Its label describes standard HTTPS links. Other URLs show that each
opening requires confirmation, retaining the host, URL, port and credential
cues, default Cancel focus, Copy/Open decisions and focus restoration.

The narrow trust boundary is the transition from parsed URL characteristics to
the operator's session decision and, in desktop mode, to the trusted frontend
confirmation argument. The correction narrows that decision; it adds no opener
permission, URL allowlist entry, storage, telemetry or network request. HTTPS,
size/whitespace/control checks, host boundaries, punycode display, default-port
normalisation, debounce and session reset retain their existing policy.

Authored tests use the real policy and dialog callbacks with in-memory opening
recorders and the existing bounded DOM fixture. They cover both modes, normal
host/session reuse, normalisation, different hosts, port/userinfo combinations,
cancel/copy/open, repeated confirmation and an injected `always` choice. No URL
is opened or fetched. These are defensive post-correction regressions, not a
baseline reproduction or browser/native-platform result. All 14 cases passed in
the first complete gate at frozen `f1e0ca1`: 2,420 total / 2,418 pass / one failure /
one optional skip. All three fresh reviewers completed and root independently
verified the originals and immutable source. The full gate remains held by the
final relative-gain assertion, retaining -101 dB at -30 dBFS. No numerical cause,
repair or merge qualification is claimed. See the
[completed handoff](LINK_CONSENT_CONTINUATION_2026-11-21.md).

The authored hosted link smoke also checks the actual dialog after ordinary
host approval, in browser mode and the modeled native-invoke mode. It verifies
port/userinfo prompts, unavailable session checkboxes, Cancel/Open behavior,
initial unconfirmed native calls and unchanged application location. Both opening
boundaries are recorders; no external URL is opened. The separate first syntax
check passed, but the smoke's browser behavior remains unexecuted here. Parsing
does not establish rendering or native execution; those need their own
source-specific hosted/platform outcomes.
