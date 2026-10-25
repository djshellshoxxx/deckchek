# Local continuation: MIDI packet boundaries, 2026-10-25

## Scope and ownership

Saved environment `/workspace/deckchek`; no missing earlier checkpoints were recovered.
Initial checkout was clean `work` at `9f74fc2ee7952378bf17698bb6d648a8a2fbbb86`.
No AGENTS.md, local ownership handoff, or other active writer process was found.
Read-only GitHub PR details/comments and fetched refs showed no current ownership
claim for `app/midi-tests.js` or its tests. This is limited evidence, not a claim
that every external writer is idle. One implementation worker owned those two
files; the integration agent reviewed the diff and transport callers.

## Baseline and preserved work

| Ref / PR | Observed SHA | Relationship / disposition |
| --- | --- | --- |
| main | `9f74fc2ee7952378bf17698bb6d648a8a2fbbb86` | Contains squash merge of PR11 audio signals/release matrix |
| PR12, task/deckchek-spec-completion | `2a8e528f0d6e669ba57ab892a9aae0b0eeee6f24` | Descends from main; chosen local baseline |
| PR13, task/deckchek-fleet | `f0feebeb657e76bc758f8e5328573abe36f11670` | Common ancestor with PR12 is `8ec624306da9412f29de0c6a2340969318bee12a`; does not contain its two later commits by ancestry |
| PR9, claude/amazing-fermat-csql4g | `a4d844b22df478a141c06a6561c941d6461a8aea` | Diverges at `81c871bb3069d641cac8bea594cb393daa04a297`; FS-34/35/36 remain separate |
| PR10, docs/readme-and-wiki | `4cfa38cf127881f07a7ab9e408f2fb701c4ff984` | Separate documentation; preserved |

Initial local branch: `local/deckchek-midi-boundaries-20261025`. No existing branch was
reset, overwritten, deleted, or merged. No source push, PR write, CI dispatch,
release, deployment, dependency installation, or credentials change occurred
during the initial local implementation batch. Later checkpoint publication is
covered separately below.
Fleet remains default-off and unwired on the chosen baseline.

## Completed requirement and evidence

Implementation commit: `9f97546c203329a1b53550fce295529fd845a4f9`.

`parseMessage` previously padded truncated channel messages with zeros. A short
CC could seed a 14-bit pair, and a short note could falsely register a control.
The parser now accepts only complete channel packets with integer bytes and
7-bit data, framed SysEx, and single-byte clocks. Malformed packets return the
existing neutral shape, so they cannot affect matching, coverage, or learn mode.
Typed arrays retain numeric element semantics. No verdict thresholds or existing
assertions were removed or weakened.

Traceability: `docs/SPEC-11-product-editions-and-categories.md` section 4 requires
observed MIDI behavior rather than unsupported conclusions;
`docs/DEVICE-PROFILE-SCHEMA.md` defines coverage and fader metrics. Regression
fixtures in `tests/midi-tests.test.mjs` cover truncated/overlong packets, invalid
numeric values, typed arrays, malformed SysEx, and downstream coverage/learn
isolation. An isolated archive of the old parser with the new tests failed both
new regression tests. The integration review caught and corrected an initial
typed-array backing-buffer reinterpretation before committing.

## Validation

- Baseline `npm test`: 844 passed, 0 failed.
- `node --test tests/midi-tests.test.mjs`: 13 passed, 0 failed.
- `node --check app/midi-tests.js`: passed.
- `node tools/check-migrations.mjs --contiguous`: 18 migrations OK.
- `node tools/check-timecode-facts.mjs`: profiles consistent with TIMECODE_FORMATS.
- `node tools/build-device-index.mjs --check`: index up to date.
- `git diff --check`: passed.
- Final `npm test`: 846 passed, 0 failed (51.47 s).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tools/ui-smoke.mjs core`:
  186/186 passed, no console errors, exit 0. Includes browser and mocked desktop
  device/MIDI flows, not physical MIDI execution. Screenshots: `/tmp/deckchek-shots`.

Initial `node tools/ui-smoke.mjs core` could not launch because Playwright's
bundled headless shell was absent. The documented override uses the already
installed `/usr/bin/chromium`; no download was attempted. Logs are in
`/tmp/deckchek-baseline-tests.log`, `/tmp/deckchek-final-tests.log`,
`/tmp/deckchek-ui-smoke.log`, and `/tmp/deckchek-ui-smoke-system.log`.

## Remaining requirements and next slice

- Native test/build execution is blocked: `cargo --version` returned command not
  found (exit 127). No native test/build ran; this is missing tooling, not an
  approval denial or an uncertain mutation.
- Physical MIDI/audio/loopback, driver diagnostics, platform packaging and
  Windows/macOS/Linux/32-bit acceptance remain unexecuted. Browser mocks and
  software fixtures are not hardware qualification.
- Malformed packets are excluded from control evidence; this change does not
  introduce a malformed-packet counter or implement PR9's conformance analyzer.
- Next bounded slice: reconcile PR9's FS-34/35/36 against the main/PR12 baseline,
  preserve both audio-signal and audio-quality assertions, and run its synthetic
  fixture/coverage audit before any integration. Recheck ownership and current
  refs first. Keep PR10 docs and PR13 fleet work distinct; fleet expansion is not
  a prerequisite for core diagnostics. Hardware threshold qualification and
  vendor-specific DVS decoding remain outstanding.

## GitHub checkpoint preparation

The owner subsequently authorized source checkpoint publication and handoff
readiness. Preserve `a8442aa6b554c5f053fb0eb5ae495e790e3943a4` unchanged; add only
handoff documentation on `checkpoint/deckchek-midi-boundaries-20261025`.
The source and tests remain exactly those validated by 846 JS / 186 browser
checks. No additional implementation worker is needed for this documentation
and publication batch.

Fresh fetch confirmed the table's main/PR9/PR12/PR13 refs unchanged. The intended
new checkpoint remote branch was absent. Source/staged diffs were reviewed;
outgoing content is only the MIDI fix, tests, and generic/detailed handoffs, with
no private research packs or runtime logs. A local heuristic secret/private-file
scan of all four outgoing files found zero matches for private-key blocks,
common token formats, literal credential assignments, credential-bearing URLs,
or sensitive filenames. This is not a comprehensive secret-audit claim.
`git diff --cached --check` passed; comparing staged app/tests/workflows with
`a8442aa` found no changes, so prior test evidence remains applicable.

All four repository workflows were inspected: tests and desktop matrix pushes
are limited to main or version tags; Windows build pushes only main; mobile Pages
is dispatch-only with an explicit deploy input. Pushing this new non-main branch
without a tag or PR does not select any checked-in workflow. No workflow change,
PR creation, manual dispatch, deployment, or release is part of this checkpoint.

Merge decision: **leave unmerged; no merge attempt**. Candidate source before
documentation is `a8442aa6b554c5f053fb0eb5ae495e790e3943a4`; possible main target is
`9f74fc2ee7952378bf17698bb6d648a8a2fbbb86`, and stack baseline is
`2a8e528f0d6e669ba57ab892a9aae0b0eeee6f24`. Missing native/hardware acceptance and
unreconciled PR9/12/13 integration prevent a readiness claim. No existing owner
branch or original thresholds are changed. A future merger must record fresh
source/target SHAs and intended action before proceeding.

Recovery instructions and concise status are in `CHECKPOINT.md`. Verify the
published commit through `git ls-remote origin
refs/heads/checkpoint/deckchek-midi-boundaries-20261025` before claiming a remote
checkpoint. This preparation note does not assert publication success.
