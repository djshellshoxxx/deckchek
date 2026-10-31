# Live monitor negative-SNR milestone — 2026-10-31

## Scope and evidence

R2-02/FS31 AC3 could miss a critical floor alarm after a healthy steady carrier
fell below the noise. Band-limited zero crossings followed noise, so a real
carrier was classified as cueing. The bounded repair checks coherent
continuation at the last healthy forward frequency over the full analysis
window. Both channels must satisfy the new 0.9 coherence discriminator; this
is carrier evidence, not a changed alarm threshold. It reports the coherent
SNR when that evidence supplies floor eligibility and does not promote the
frame to locked/play.

The 12 dB floor, two-second raise, twice-as-long clear and 60-second cooldown
remain unchanged. Fixed-size coefficient rings bound memory. Idle/reverse,
sustained coherence loss, reset, resume and sample-rate changes prevent reuse
of stale evidence. Cold-start ambiguity, changing pitch under heavy noise and
arbitrary real-device recordings remain outside the proven coverage. R2-02
therefore stays partly fixed rather than claiming universal negative-SNR support.

## Validation

- Baseline new fixture suite: seven of eight tests failed as expected.
- Final full JavaScript suite: **1,233 passed, one optional skip, zero failures**.
- Final focused monitor suite: 43/43 passed. Four format families, -3/-6/-12 dB,
  two seeds and pitched carriers; sample powers independently verify requested
  SNR and peaks remain below clipping. Tests retain scratch, reverse, channel
  swap, hand-stop, noise, hysteresis/cooldown and stale-reference counterexamples.
- Rendered monitor browser suite: 42/42 passed, no console errors. Synthetic
  nominal MK2 samples traverse mocked capture, controller, critical event,
  fault chip/tray and saved session. This is not a physical capture test.
- Performance: 2,400 hops, mean 0.729 ms/hop under unchanged 5 ms budget;
  heap growth 0.04 MB under unchanged 10 MB budget. Physical two-hour CPU/
  shared-capture acceptance remains unexecuted.
- Syntax and whitespace checks passed; independent read-only review found no
  must-fix issue. An earlier full run against the initial implementation had
  seven new-regression failures; the completed final full run passes all of those regressions.

Commands:

```sh
npm test
node --test tests/monitor-negative-snr.test.mjs tests/monitor.test.mjs tests/monitor-regressions.test.mjs tests/monitor.property.test.mjs
node --expose-gc --test tests/perf/*.test.mjs
NODE_PATH=/opt/codex/cua_node/lib/node_modules PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tools/ui-smoke.mjs monitor
git diff --check
```

## Branches, ownership and recovery

This isolated work starts at integration head
`f24beb8e2643d38474b475394a7bd25eb0447bd5` on
`codex/monitor-snr-20261031`. Source/target refs were unchanged at publication
preflight: PR14 `9f4928a00a44b62529429d1f14ad104b65db28c6`, main
`ee5aa511fb49fc56e299d5b5c262e815ab420d0d`. No merge was attempted. No branch
was overwritten/deleted. Source writer owned monitor engine/tests; integrator
owned browser/docs; separate review was read-only. External Claude's stylus
lane was untouched. Fleet remains OFF.

Baseline f24beb software tests and platform build/smoke checks passed, but
Sonar check 124033692273 still fails reliability C. Child validation does not
waive the PR14/16 merge holds. Detailed annotation access remains unavailable
through supported tools; no rejected API or package operation was retried.
Local native development dependencies remain missing after denied package
writes; existing PR CI is the native route. No deployment/release/tag or
credential/security-policy action was performed.

Recover by fetching the unique monitor branch, verifying its live SHA and
checking out a new worktree. Do not push the stale local continuation checkout
at 722c7fd over remote f24beb. Preserve older worktrees and dated handoffs.
Follow `CONTINUATION-PROMPT-2026-10-31.md` for the next coordinator: refresh
checks/ownership, obtain supported Sonar detail, and selectively integrate
remaining PR9 FS34/35/FS36 UI work with ownership/cancellation regressions.

## Publication outcome

Tested source commit: `8a654fb2ed6de407ace85390ad052236da764310`.
Checkpoint `7d1198bcc75c4cf5cd6a4d680605ec411ce944e7` adds documentation only;
the unique branch was pushed successfully. Draft PR lookup found none.
The subsequent create request was rejected by automatic approval review:
creating a public draft was considered prohibited by retained continuation
instructions, and general continuation approval was not considered sufficient.
No retry, indirect workaround, merge or workflow dispatch followed.

Exact blocked action: create a draft PR from `codex/monitor-snr-20261031` into
`continuation-deckchek-core-20261028` in `djshellshoxxx/deckchek`. Outcome denied.
It requires explicit approval for this new public draft; no merge/deployment is
included. Existing per-PR test CI therefore has not run on this new source.
The final follow-up commit only records this publication result. Local logs:
`/tmp/deckchek-monitor-js-final.log`, `...-browser-final.log`,
`...-perf-final.log`, and `...-negative-green2.log`; these are ephemeral executor
artifacts, so rerun the recorded commands after recovery.
