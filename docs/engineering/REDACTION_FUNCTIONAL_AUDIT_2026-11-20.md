# Diagnostics path redaction functional audit — 20 November 2026

Author/executor: `/root/redaction_functional`. This initial functional lane
follows the completed six-worker device-outcome round. Dates use
America/Los_Angeles; execution records retain UTC.

## Result

**Bounded wrapper-aware hardening is implemented; focused JavaScript verification
passed 60/60.** JavaScript and Rust contain the matching source change and share
the same regression vectors. Native compilation, Rustfmt, native execution and
broader hosted qualification remain pending.

Issue #69 remains partly open. An immediately adjacent matching quote or bracket
now permits an ASCII-space-bearing profile component to be replaced as one
unit. This is a conservative syntactic rule. Bare paths, generic raw structured
values, arbitrary punctuation and ambiguous quoted prose are not fully covered.
No actual external disclosure or complete privacy guarantee is established.

| Source role | Commit | Tree |
| --- | --- | --- |
| Assigned durable base | `6cd827b0204bc450b8fc6236a179c7383dd52911` | `629a834548412d6eb369466325342c3778839e49` |
| Initial implementation freeze, not executed | `7a5d13717d9c978141bea5e87d9c3108df06e9be` | `8e8f8c71dbc20dd4c32401f14a4522e90566394f` |
| Final executed source/test freeze | `7743813078381bbff713bf4609d5bb403188f269` | `0f695d9f92adca65edf9a7652770051b63dbd0af` |

The final freeze changes only two comment lines from the first implementation
freeze, qualifying wrapper recognition as a heuristic. No test had executed
when those comments changed. All execution recorded here belongs to the final
freeze; there was no source edit during the run.

Exactly four paths change from the assigned base:

- [`app/diagnostics-bundle.js`](../../app/diagnostics-bundle.js): wrapper-aware fallback component recognition.
- [`src-tauri/src/diagnostics.rs`](../../src-tauri/src/diagnostics.rs): mirrored recognition and a raw structured-value test.
- [`tests/fixtures/redaction-vectors.json`](../../tests/fixtures/redaction-vectors.json): 28 synthetic additions; all 19 original vector values preserved.
- [`tests/diagnostics-bundle.test.mjs`](../../tests/diagnostics-bundle.test.mjs): the corresponding raw structured-value boundary test.

Prior device-outcome/trend code stays byte-identical. No exporter, store,
schema, dependency, workflow, permission, feature flag, log/bundle cap or
performance threshold changes.

## Recognition contract

Code and defensive peers reviewed the boundary before the source freeze. The
implementation retains the old token endpoint, then considers widening only
when a component actually spans ASCII space.

| Condition | Behavior |
| --- | --- |
| Immediately preceding opener | Only single/double quotes and `()`, `[]`, `{}` pairs provide wrapper context. |
| Multiword component | ASCII spaces can occur between previously allowed name characters. Leading/trailing component spaces do not authorize widening. |
| Component end | A path separator or matching closer must terminate the candidate. Other hard punctuation retains the original token rule. |
| Complete wrapper | The matching close must exist even after a child separator. Controls, non-ASCII whitespace and competing hard delimiters stop lookahead. Nested/unmatched/mismatched forms remain conservative. |
| Intermediate placeholders | Only existing known placeholder atoms are recognized, handling earlier passes that produce a component such as `<user> Moss`. Arbitrary angle-bracket text is not an atom. |
| No actual ASCII-space widening | Existing markers retain their kind; a no-space `<host>` or `<email>` component does not become `<user>`. |
| Bare input, including raw JSON values | Existing tokenization is unchanged. A later slash alone cannot distinguish a multiword folder from following prose. |

The new-only boundary combines existing segment terminators, controls and
explicit U+FEFF in both languages. This accounts for the relevant whitespace
distinction without changing the old bare rule. Shared vectors cover NBSP,
NEL, BOM and line/control boundaries after an ASCII-space component. This is
bounded source/vector parity evidence, not proof over every Unicode input or
runtime version.

The redaction order remains emails, exact literals, emails again, profile
paths, then serial labels. Placeholder protection, case rules, short-literal
boundaries and serial-key handling remain intact. Competing delimiters stop
lookahead: a later wrapped candidate cannot cause an earlier unmatched wrapper
to repeatedly scan the same complete suffix. No new unbounded regular expression
is introduced.

## Observable behavior and residual scope

New vectors cover Windows and Unix prefixes, quoted profiles with and without
children, all five wrapper forms, JSON text with escaped separators, Unicode
letters, repeated spaces, literal/email-first placeholders and retained marker
kinds. Controls preserve trailing prose and conservative fallback for malformed
or nested wrappers, hard punctuation, trailing spaces and control/whitespace
boundaries. Non-profile program paths remain unchanged. Each vector checks
second-pass idempotence.

A wrapper is only a syntactic cue. A quoted message beginning with a profile
prefix can contain prose that looks like a component; the patch cannot prove
its semantic type. Quotes around a larger message do not give a path embedded
later in it an adjacent wrapper. Arbitrary profile-name punctuation, non-ASCII
name whitespace and nested wrappers remain outside the new widening rule.

Both actual exporters preserve the structured-value limit. Browser
[`buildBrowserBundleParts`](../../app/browser-bundle.js) calls `redactValue`
before `JSON.stringify`; native `json_part` calls `redact_value` before pretty
serialization. Raw string values have no serialization-added quote context at
redaction time. The paired JS/Rust test records the conservative result and
confirms that an exact profile literal can supply its own context. The patch
does not infer path types from generic settings keys or change serialization.

Desktop raw log capture/retention, optional export redaction and user-chosen
bundle writing remain existing behavior. Raw logs are not promised to contain
no personal information, and arbitrary bare strings are not promised to be
fully masked. These residuals keep issue #69 open for further bounded work.

## Execution and integrity

One serial invocation ran the actual final JavaScript modules on Node
**v24.22.3**:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-concurrency=1 --test-reporter=tap tests/browser-bundle.test.mjs tests/diagnostics-bundle.test.mjs
```

| Observation | Result |
| --- | --- |
| Tests | 60 total / 60 passed / 0 failed / 0 skipped / 0 cancelled / 0 TODO |
| Composition | 47 shared vectors, nine diagnostics checks and four browser-bundle checks. Assertions within a test are not separate counts. |
| Process outcome | Exit 0; no timeout; 0.314508661 seconds process elapsed. |
| TAP duration | 255.040369 ms. |
| Execution window | `2026-11-21T05:44:03.815392+00:00` to `2026-11-21T05:44:04.129996+00:00`. |
| Frozen inputs | All 1,817 tracked SHA-256 entries identical before/after; source head/tree unchanged; clean checkout at both boundaries. |
| Complete TAP | 11,311 bytes; SHA-256 `0e65dd9c3872a08549404bb005d5d44633d0905792fc0b760008e57168d13d96`. |

The [evidence directory](evidence/redaction-functional-2026-11-20/README.md)
contains the exact driver, runtime/command metadata, complete log, source
freeze, four changed-path hashes and both input maps. Outputs stayed outside
the checkout during execution/integrity checks, then were copied byte-for-byte
into this separate report/evidence change.

No baseline privacy reproduction, exploit/adversarial probe, native build/test,
Rustfmt, external transmission, hardware test or hosted diagnostic retrigger
was performed. `rustc`, `cargo` and `rustfmt` were absent from the PATH lookup.
The Rust shared-vector test and new structured-value test are authored but not
executed by this lane. JavaScript success does not establish native compilation
or parity execution.

## Handoff

Both initial static peers received the exact final freeze and execution record
before completing their source-bound reports. Root should combine those reports
with this evidence, then hand the combined source to fresh workers. The prior
broad JavaScript result on `ce66a40` does not qualify the new redaction bytes.

Keep issue #69's material residual scope open. Obtain applicable exact-source
native/hosted qualification before an implementing merge. Preserve fixed input
and diagnostic heads, failed Fleet results, original branches and thresholds.
No release or scientific/hardware completion is asserted.
