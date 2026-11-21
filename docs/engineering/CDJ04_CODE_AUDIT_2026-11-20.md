# CDJ-04 initial code audit — 20 November 2026

Reviewer: `/root/cdj04_code_audit_fresh`. Dates use America/Vancouver.

## Disposition and fixed source

**Original source requires corrections.** The formula, sign and units match the
calculation prototype, but numerical exclusions are incomplete. This reviewer
did not author the module or execute application tests. Later authored corrections
require fresh independent acceptance.

Base: `e49ea1bbafb5005fdf1dfcf60d885b82d0191471`.
Reviewed PR #57 head: `d2ccfdaa4bd1a8f6da9a7cc632e4967cb8463092`.
Tree: `30ee0e04b49fdc4a7e81fe5cb17effb76fffdd73`.
Fixed comparison: `git diff e49ea1bbafb5005fdf1dfcf60d885b82d0191471...d2ccfdaa4bd1a8f6da9a7cc632e4967cb8463092`.
The base resolves and is an ancestor. One incoming commit adds three files only:
the calculation module, its eight-test file and the prototype report.

The source contract is [SPEC-10](../SPEC-10-CDJ-media-player-diagnostics.md),
especially CDJ-04 and its v1.0 calculation rules, narrowed by the
[prototype report](CDJ04_DISPLAY_PROTOTYPE_2026-11-20.md). FS-10 is the unrelated
pre-gig feature. This contribution claims only an unwired calculation helper.

## Standards

Reviewed against [DEVELOPMENT-PLAN](../DEVELOPMENT-PLAN.md) §1.1, §5.3 and §5.8:
numeric correctness/units, owned changes, independent review and accurate docs.
No separate naming, modularity or abstraction violation was identified. The pure
ES export uses camelCase, a method version and explicit percentage-point names.
Its small quality-reason table is appropriate; no actionable Fowler smell calls
for refactoring. The output copies the range rather than returning its input
object. No production consumer, native command, capture, DOM, storage, dependency,
migration or feature-default change is introduced.

The report accurately defers the full workflow; existing broader CDJ status rows
remain unimplemented. Numeric findings are recorded below without double-counting
them as independent Standards issues. Hosted merge gates remain with root.

## Spec

### CDJ-C1 — medium: derived-number qualification is incomplete

The original code checks `speedPercent` for finiteness, then directly returns
`speedPercent - displayedPercent` as an eligible metric. Finite operands can
overflow that subtraction, even when the supplied finite range admits the
entered display. The result is marked eligible with a nonfinite error, which
JSON cannot preserve as a numeric observation. Qualify the final difference.

The intermediate division also needs a positive representable result: positive
operands can underflow to zero, yielding a finite `-100` speed percentage that
the current finite check accepts. These are numerical boundaries, not grounds
to invent physical pitch limits or clamp measured speed to the display range.
An observed mismatch beyond the setting may itself be useful evidence.

### CDJ-C2 — low: rejected frequency types still reach arithmetic

`Number.isFinite` records invalid frequency inputs without coercion, but division
still runs before exclusions return. A rejected non-number such as a direct
caller's BigInt can therefore throw instead of returning a suppressed measurement.
Return input/quality exclusions before derivation, or guard arithmetic on validated
numbers. Preserve reasons and avoid guessed numeric conversions. This does not
require an arbitrary-object or adversarial-input interface.

### Accepted scope and deferred work

The ratio formula, measured-minus-displayed sign and percentage-point units match
SPEC-10. No RPM, score, guessed model range or diagnosis is produced. Six quality
flags must be exactly true; positive finite uncertainty and a named method are
required. Truth of those assertions remains the caller's responsibility.

Full provenance, capture-quality measurement, compatible comparisons, database/HTML
round trips and two-model hardware validation are explicitly deferred. They are
not newly discovered defects in this math-only scope. [SPEC-19 §2/4/5](../SPEC-19-scientific-measurement-and-validation.md)
still governs future clock/reference/estimator uncertainty, coverage factor and
evidence retention. A positive scalar and method label do not establish those
facts. The helper's `eligibleForReport` is not approval of a complete hardware run.

## Evidence and limits

This reviewer inspected the full fixed diff, specs, existing calibration
uncertainty structures, tests and report. Ref/tree checks, SHA-256 capture and
fixed-source whitespace validation passed. The checkout began clean. No
application/native/browser test, scanner, fuzzing, external probe or hardware run
was performed here.

The original tests cover ordinary signed offsets, quality gates, several invalid
inputs, range, uncertainty and immutability; they omit these derived/type edges.
The functional worker reports a baseline of **eight passes / three failures**
and a corrected **11/11** at `61e5a750928d391d0c3ba41f4a8274053a1b55be`, tree
`c992ed617d7161d94ca695543fc0eef1140806a7`. Those are author-reported executions,
not independent tests or acceptance by this reviewer. The correction was reported
to return accumulated exclusions before arithmetic and then qualify ratio, speed
and difference. Its exact diff still needs the fresh successor review assigned
by root; this original-source report does not pre-accept it.

| Reviewed original file | SHA-256 |
| --- | --- |
| `app/player/pitch-display.js` | `6fbd3f1e8fc5c3810ba4b53fbddfbc13011d2bb6133353b41684e89c64b26cb5` |
| `tests/cdj-pitch-display.test.mjs` | `fd5f83e47c6d7fdd21a97688a81961224c7b87c1450864d886b28a1143dce905` |
| `docs/engineering/CDJ04_DISPLAY_PROTOTYPE_2026-11-20.md` | `d3328f3d88e64f26dc179c6acd7db381d12173e873270e6b6650e9b780b41f60` |
| `docs/SPEC-10-CDJ-media-player-diagnostics.md` | `282ec2b87c54c556b2c4e9a486a8ba2678383628eb240dfde7ca50bd02f8975f` |
| `docs/SPEC-19-scientific-measurement-and-validation.md` | `ed2926388ab9c418d303dddaab42e1d80e54e7f7a382057813da085cc81a5c5b` |

## Successor handoff

Root and the functional worker received both findings before this report.
Preserve original #57 and Ledger candidate #58, and keep the correction on its
owned branch. Fresh successors should inspect the exact corrected source and
meaningful red/green evidence, then qualify the applicable combined/hosted gates.
Keep real capture, provenance, UI/report and hardware acceptance separate.

Only this report was authored; no production/test edit or remote action occurred.
Preserve branches, feature defaults, thresholds, security gates and Fleet off.

Standards: **zero separate actionable findings**. Spec: **two source findings**,
with derived-number qualification the higher-severity issue. Original-source
acceptance is withheld pending their disposition.

Reviewed-by-agent: /root/cdj04_code_audit_fresh
