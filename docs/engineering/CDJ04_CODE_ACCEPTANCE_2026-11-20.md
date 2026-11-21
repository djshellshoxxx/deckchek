# Fresh CDJ-04 code acceptance — 20 November 2026

Reviewer: `/root/cdj04_code_acceptance_fresh`. Dates use America/Vancouver.

## Disposition and fixed source

**ACCEPT_FOR_INTEGRATION within this code and calculation-contract review.**
CDJ-C1 and CDJ-C2 from the [initial code audit](CDJ04_CODE_AUDIT_2026-11-20.md)
are resolved. No new actionable Standards or Spec finding was identified.
This is independent inspection of the correction, not an independent test run
or acceptance of the complete player workflow.

| Role | Exact source |
| --- | --- |
| Original prototype | `d2ccfdaa4bd1a8f6da9a7cc632e4967cb8463092` |
| Author correction | `61e5a750928d391d0c3ba41f4a8274053a1b55be` |
| Reviewed combined source | `abafd5565e00a2154b6b833e20ccd3a42a713ae7` |
| Reviewed tree | `1126a31bfc95aabc71ca5532bc8bed57b49ef7fc` |
| Unchanged Ledger candidate beneath this scope | `eba46183fecd9d698515411865e710021dcba632` |

The fixed comparison is `git diff d2ccfdaa...abafd556 -- app/player/pitch-display.js tests/cdj-pitch-display.test.mjs`,
with both full refs above verified and the original prototype an ancestor.
The corrected application/test bytes independently match the author's `61e5a75`.
Relative to Ledger #58, only these two newly added files change application/test
source; other application, native, database, tool, workflow and mobile bytes
remain unchanged. Ledger behavior was not re-audited.

## Standards

[DEVELOPMENT-PLAN §1.1, §5.3 and §5.8](../DEVELOPMENT-PLAN.md) require numerical
correctness, relevant edge coverage, independent review and accurate scope docs.
The correction keeps the small pure function and existing input/output names,
adds no abstraction or dependency, and explains why validation must precede
arithmetic. No actionable code-smell heuristic requires a refactor here.

The [prototype report](CDJ04_DISPLAY_PROTOTYPE_2026-11-20.md) still accurately
limits the implementation to a calculation helper. An independent source search
found no production consumer in `app`, `mobile` or `src-tauri`. Capture, UI,
persistence, native commands and feature defaults are not introduced. Root owns
the remaining qualification and publication gates.

## Spec

### CDJ-C1 — derived-number qualification: closed

The correction separately retains the frequency ratio and requires it to remain
positive and finite. A division that underflows to zero cannot produce an
eligible `-100` speed result. The computed speed must also be finite. The final
measured-minus-displayed subtraction is then checked before returning a
measurement; a nonfinite result returns `invalid_display_error` with
`eligibleForReport: false` and `measurement: null`.

These guards preserve [SPEC-10's formula and units](../SPEC-10-CDJ-media-player-diagnostics.md#v10-implementation-contract):
`100 × (measured/reference − 1)`, followed by measured minus displayed percentage,
in percentage points. Valid signed values and the existing method identifier
remain unchanged. The supplied range still constrains the entered display;
there is no measured-speed clamp, physical range guess, RPM conversion or score.

### CDJ-C2 — rejected values reaching arithmetic: closed

Accumulated input, range, quality and uncertainty exclusions now return before
division or subtraction. Existing strict finite-number validation rejects
unsupported numeric types without coercion. The early result retains the
existing exclusion-and-null shape. Invalid input reasons take precedence over
derived-ratio reasons; no production consumer depends on the former extra
derived reason because this prototype remains unwired.

All six quality flags still require literal `true`. Expanded uncertainty must
be finite and positive, with a nonblank method string. The range is copied into
the result and the caller's input is not modified. These are caller-supplied
assertions, not proof of reference identity, capture quality or calibration.

## Regression and integrity evidence

The three new cases test observable exclusion behavior for ratio underflow,
nonfinite final difference, and arithmetic on rejected numeric types. They also
check a rejected result's JSON round trip. Existing cases retain ordinary
positive/negative/zero results, quality gates, range, uncertainty and input
non-mutation. The checks exercise the function, not implementation text.

The [author report](CDJ04_FUNCTIONAL_AUDIT_2026-11-20.md) records an **8-pass /
3-failure** baseline and corrected **11/11** under Node 22.23.4. Those are
author executions, not tests rerun by this reviewer. Counts overlap and are not
additive. Fresh functional execution remains separate evidence.

| Independently captured file | SHA-256 |
| --- | --- |
| `app/player/pitch-display.js` | `040a0703f8d68cecedae43616b977378f11baf5f6ac8e18be487e1bd85262988` |
| `tests/cdj-pitch-display.test.mjs` | `acdea851530a2471f3e9823a9aebd587b3f24225a93674778409cf05a2a2141f` |
| Prototype report | `d3328f3d88e64f26dc179c6acd7db381d12173e873270e6b6650e9b780b41f60` |
| SPEC-10 | `282ec2b87c54c556b2c4e9a486a8ba2678383628eb240dfde7ca50bd02f8975f` |
| SPEC-19 | `ed2926388ab9c418d303dddaab42e1d80e54e7f7a382057813da085cc81a5c5b` |

Git ref/tree checks, author-byte comparison and scoped whitespace checks passed.
The checkout began clean. Only this report was authored; no application test,
native build, browser, capture, hardware or remote action occurred here.

## Handoff and limits

Root may combine this report with fresh functional and defensive acceptance.
The helper's eligibility flag qualifies its bounded calculation only. Full
provenance, uncertainty budget/coverage factor, reference and clock validation,
saved-record/report round trips and physical-player qualification remain as
specified in SPEC-10 and [SPEC-19](../SPEC-19-scientific-measurement-and-validation.md).
No complete CDJ feature, hardware calibration or release acceptance is claimed.

Preserve original findings and red/green evidence, the unchanged published
candidates, existing gates, Fleet default-off and physical qualification.
Standards: **0 new findings**. Spec: **CDJ-C1/C2 closed; 0 remaining scoped
code blockers**. A later implementation change requires review of its own delta.

Reviewed-by-agent: /root/cdj04_code_acceptance_fresh
