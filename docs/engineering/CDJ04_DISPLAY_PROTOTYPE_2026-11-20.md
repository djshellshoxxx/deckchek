# CDJ-04: isolated pitch-display comparison prototype (2026-11-20)

This opt-in, pure calculation helper implements the **math contract only** from
docs/SPEC-10-CDJ-media-player-diagnostics.md. It is not wired to a production
screen, report, native capture or device profile, and is not a released feature.

The helper compares 100 * (measured_frequency / reference_frequency - 1)
against an operator-entered percentage, returning signed **percentage-point**
difference. It does not express CDJ speed as platter RPM, guess hardware pitch
ranges, infer tone identity or make a diagnosis. To avoid confident output on
unqualified evidence, it suppresses all measurements unless the caller supplies
positive reference/measurement frequencies, a valid known supported pitch range,
explicit true values for each quality gate, and a positive expanded uncertainty
with a named method. Unknown, missing and failed flags are exclusions.

The helper **does not establish the truth of supplied flags**. Future integration
must measure clipping, duration, stability, reference identity, capture-path
uncertainty and processing-off state instead of blindly setting quality flags.
The tests' uncertainty value is a synthetic fixture, not a DeckChek tolerance.
Before UI/report integration, add full provenance fields, compatible baseline
comparison, meaningful uncertainty budgets, negative fixtures for wrong
reference and unstable tones, data round-trip tests, external/physical
acceptance and independent review. Keep current gates and Fleet default OFF.

This is an intentionally separate source candidate. No spec, diagnostic score,
performance threshold, hardware profile, release setting or existing branch is
changed. Do not merge until exact-head CI and fresh code, functional and
security reviews are complete.
