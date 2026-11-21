# Diagnostics redaction consolidation — 20 November 2026

## Current disposition

The conservative multiword-profile redaction change is ready for a consolidated
draft with the accepted device-outcome #66 and fractional-timestamp #68 fixes.
**Integrated qualification is held:** the fresh full JavaScript run failed one
existing audio-quality assertion. Its sole authorized unchanged-source narrow
rerun passed; the original failure remains unexplained and is not replaced by
that later result. Applicable exact-source hosted/native gates remain pending.

Issue #69 stays open. This implementation improves a bounded wrapper heuristic;
it does not establish complete privacy acceptance or an external disclosure.
Spec 02 AC-6 is unchanged. No release, deployment or feature default is changed.

## Source and handoffs

The combined reviewed source is local `6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6`,
tree `7dfe29d1e9378bbdfd98bbeff49aceed366c1c3a`. Its exact-tree durable equivalent
is `36dc5dd58bbb4bfc2f93d76dab2b7b9c4729b371`, published on
`checkpoint/deckchek-redaction-source-20261120`. The [publication proof](evidence/redaction-integration-2026-11-20/source-publication.json)
records the fetch, whole-tree comparison, parent/ancestry checks and ref readback.
The local and durable commit IDs differ; their complete trees are identical.

Final author source `7743813078381bbff713bf4609d5bb403188f269` changes four paths
against accepted handoff `6cd827b0204bc450b8fc6236a179c7383dd52911`: the JS/Rust
redactors, their shared fixture and the diagnostics JS test. Every non-doc path
in the combined source matches that author source. Later integration work only
adds reports/evidence and updates status documents.

| Lane | Initial handoff | Independent fresh handoff |
| --- | --- | --- |
| Code/spec | [Code audit](REDACTION_CODE_AUDIT_2026-11-20.md) | [Code acceptance](REDACTION_CODE_ACCEPTANCE_2026-11-20.md) |
| Functional | [Functional audit](REDACTION_FUNCTIONAL_AUDIT_2026-11-20.md) | [Functional acceptance](REDACTION_FUNCTIONAL_ACCEPTANCE_2026-11-20.md) |
| Defensive source review | [Security audit](REDACTION_SECURITY_AUDIT_2026-11-20.md) | [Security acceptance](REDACTION_SECURITY_ACCEPTANCE_2026-11-20.md) |

The fresh set started after all three initial workers completed. Code and
security lanes inspected source and evidence statically. The functional lane
alone executed project tests. These are independent roles, not three copies of
the same test run. Each report states its exact source and execution limits.

## Behavior and residual scope

Immediately adjacent matching quotes, parentheses, square brackets or braces
can bound a profile component containing interior ASCII spaces. A matching
closer is required, including after child paths. Missing or competing delimiters,
controls, other whitespace and unsupported punctuation preserve the original
token fallback. Existing exact literals and email/serial pass ordering remain.
Existing placeholder atoms can participate in a widened component without
changing a no-space placeholder's kind.

All 19 original shared vectors remain unchanged and ordered; 28 additions give
47 uniquely named vectors. They cover ordinary wrapped Windows/Unix profiles,
earlier literal/email substitutions, idempotence, controls and residual cases.
They do not prove every legal path syntax or every Unicode/runtime combination.

Both actual exporters redact raw structured strings before JSON serialization.
Later serialization quotes cannot provide wrapper context. Bare multiword paths,
raw generic values without exact context, nested/malformed syntax and semantic
ambiguity within quoted prose remain open. No typed path field is inferred from
a generic key. Local raw logs remain sanitized/capped rather than globally
redacted at write time. Export redaction defaults on; sharing remains a separate
user action. See the unchanged requirement and dated note in [Spec 02](../specs/02-diagnostics-bundle.md).

## Actual JavaScript evidence

All runs used Node v24.22.3 and serial Node test-runner execution.

| Run | Frozen source | Actual outcome |
| --- | --- | --- |
| Author focused, two files | `7743813` / `0f695d9` | 60 total, 60 pass, no failure/skip/cancellation/TODO; exit 0; 1,817 tracked hashes unchanged. |
| Fresh full, 190 files | `6f414a4` / `7dfe29d` | 2,314 total, 2,312 pass, 1 failure, 1 optional Mixxx skip, no cancellation/TODO; exit 1; 1,831 tracked hashes unchanged. |
| One authorized audio-quality rerun | Same `6f414a4` / `7dfe29d` | 15 total, 15 pass, no failure/skip/cancellation/TODO; exit 0; 1,831 tracked hashes unchanged. |

The full run's only failure was the cubic-nonlinearity THD assertion in
`tests/audio-quality.test.mjs`: approximately `1.6972224339301138e16` versus
expected `4.347826086956522` percent. Its source and `app/audio-quality.js` match
the prior passing handoff, but that fact does not identify the cause. All 60
author-focused names, including all 47 shared vectors, passed within this full
run. The complete failure TAP is 530,581 bytes, SHA-256
`39036600b38a1a4301801afd2dfba573a485c8bc955c8db5551cdde1ccbcc197`.
The narrow passing TAP has SHA-256
`c8ee666590df3f24c0bb0eff784e71e0305b1247b4d1dac90d233c213847b06e`.
No speculative code patch or threshold/assertion change was made for this event.

Local Rust, Cargo, Rustfmt and required desktop SDKs are unavailable. New Rust
source still needs exact-source formatting, compilation and shared-vector
execution. Earlier green acquisition/native checks do not transfer to it.

## Consolidation and next useful work

Main `099c99c055322ef668be23e6ae50a2968614cc6d` contains the [qualified QR/acquisition
merge](ACQUISITION_QUALIFIED_MERGE_2026-11-20.md). This successor preserves that
main ancestry and original #68 ancestry. Publish the corrected consolidated
draft before superseding #68; retain its original branch. Issue #66 closes only
after an applicable qualified implementing merge. Keep #69 open.

The original #65 Fleet timing failure and the separate [failed hosted diagnostic](FLEET_GATE_HOSTED_RESULT_2026-11-20.md)
remain recorded. Keep diagnostic head `69fc06eb471dfb00de544bbe233c0f5dc95402e8`
fixed, with no rerun or threshold change. Fleet stays default off.

The next nonoverlapping work is a controlled investigation of the audio failure,
independent qualification of the separately prepared usage-ledger #70 candidate,
and bounded production UI wiring for the existing CDJ acquisition controller.
Player persistence/reports, retained raw/reference evidence and scientific/
physical qualification remain separate unfinished work.
