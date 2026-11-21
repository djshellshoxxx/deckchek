# Diagnostics path-redaction code audit — 20 November 2026

Reviewer: `/root/redaction_code`. Dates use America/Los_Angeles. This lane is
static code/spec review; the functional peer owns application edits/execution.

## Review state

**Accepted for the assigned static code/spec scope. No blocking finding remains
in final candidate `7743813078381bbff713bf4609d5bb403188f269`, tree
`0f695d9f92adca65edf9a7652770051b63dbd0af`.** This accepts a bounded hardening
slice, not complete issue #69 coverage, native execution or a deployed fix.

Assigned base: `6cd827b0204bc450b8fc6236a179c7383dd52911`, tree
`629a834548412d6eb369466325342c3778839e49`. The preceding
[device outcome/trend handoff](DEVICE_OUTCOME_CONTINUATION_2026-11-20.md)
records all six completed workers and exact-tree preservation.

The candidate descends from that assigned base through implementation freeze
`7a5d13717d9c978141bea5e87d9c3108df06e9be`, tree
`8e8f8c71dbc20dd4c32401f14a4522e90566394f`. The final successor changes only one
comment line in each implementation to make the heuristic boundary explicit;
this exact two-line diff was inspected before rebinding. The full candidate
still changes exactly four paths from the assigned base. All source was read
from immutable Git objects, not inferred from a moving author worktree.

| Candidate path | SHA-256 |
| --- | --- |
| `app/diagnostics-bundle.js` | `9235d3b7d2d3fcc8cf3a5900ebb5652bfb1bf864f3f9d2180754aaf600bb23cc` |
| `src-tauri/src/diagnostics.rs` | `9bde6b142ff634398243d933456349d323962d52d89c4c7c756afe13aa60aace` |
| `tests/diagnostics-bundle.test.mjs` | `ca84709cdbb0d86e9433e91285a18beb007d5695ffdbaaf9b71d58c84384cbe1` |
| `tests/fixtures/redaction-vectors.json` | `b69226de078aa89daff6b30e4d89bcddce4ad4fd087ee85ef2d490f8e2a8b121` |

## Finding and bounded contract

At the assigned base, `endsSegment` in
[`app/diagnostics-bundle.js`](../../app/diagnostics-bundle.js) and `ends_segment`
in [`src-tauri/src/diagnostics.rs`](../../src-tauri/src/diagnostics.rs) both stop
fallback profile-directory recognition on whitespace. Without matching exact
context, only the first token of a multiword name is recognized. This is a
source-level privacy limitation, with no reproduced external exposure or
established inventory of affected real data.

The accepted correction widens only **interior ASCII spaces inside immediately
adjacent, matched quote/bracket wrappers**. The component ends at a path separator or
matching closer. A matching close is required even when a child separator
appears first. Controls/newlines, incompatible delimiters and malformed/unclosed
wrappers must not cause following prose to be consumed. Bare text retains the
original first-token rule: a later slash alone does not distinguish a longer
name from unrelated following words.

| Input context | Intended behavior |
| --- | --- |
| Immediately wrapped profile path with a matching close | Recognize the ASCII-space-bearing component, preserving wrapper, child path and outside prose. |
| Wrapped profile with no child component | The matching closer bounds the name. |
| Bare path followed by words | Keep the conservative token rule and document its residual limitation. |
| Missing/mismatched close, controls or line boundary | Do not expand across following prose. |
| Exact user/profile literal | Keep the existing earlier literal pass and its known-context behavior. |
| Existing placeholder inside a widened component | Recognize only established placeholder atoms; preserve ordinary no-space/global placeholders and idempotence. |

The policy was shared with the author and defensive peer before source changes.
The defensive peer identified the literal-first `<user> Surname` intermediate
form. This lane requested that only a genuinely space-widened wrapped component
use that atom handling, so a no-space `<email>` or `<host>` component is not
unnecessarily rewritten. Arbitrary angle-bracket syntax is not a placeholder.

### Review of the actual candidate

The original `endsSegment`/`ends_segment` functions and prefix recognizers remain
unchanged. After computing the original token end, the new helper may return a
longer component end. Its early gate requires an ASCII space or recognized
placeholder at that old boundary. Five immediately adjacent wrapper pairs are
supported: double quotes, single quotes, parentheses, square brackets and braces.

The component scan requires at least one actual ASCII space, rejects leading or
trailing space, and recognizes only the existing fixed placeholder atoms. It
must reach the matching closer or a path separator. A second scan then verifies
the matching close even when child-path content intervenes, stopping at controls,
other whitespace and incompatible punctuation/delimiters. Failure returns the
unchanged original token end. Thus the change does not widen the bare rule or
rewrite ordinary no-space marker kinds.

The JavaScript and Rust branches are paired directly: equivalent wrapper maps,
space and placeholder gates, leading/trailing-space checks, component terminators,
close verification and failure fallback. Rust uses checked access for the
preceding character and explicitly rejects the end-of-input boundary before
indexing it. The JavaScript end-of-input comparison likewise falls back rather
than treating absence as a matching closer. Only the widened path uses the
combined whitespace/control/BOM boundary; the old bare rule stays intact.

A wrapper is a **syntactic heuristic**, not a typed filesystem-path declaration.
The final helper comments say that the widening rule treats such wrappers as a
path boundary. A quoted natural-language message that begins with a profile
prefix can still be ambiguous internally. The accepted claim is preservation of text
outside the recognized wrapper and conservative behavior for unsupported forms,
not universal preservation of every possible inside-wrapper sentence. Quoting,
escape syntax and nested constructs are not parsed as a general language.

## Actual exporter and display boundaries

| Boundary | Inspected behavior and implication |
| --- | --- |
| Desktop local log and crash marker | Writes sanitize/cap text but do not globally redact PII at write time. The correction does not rewrite stored logs. |
| Native log bundle parts | `log_parts` reads within the existing 2 MiB aggregate input budget, then applies `redact_text` when `opts.redact` is true. |
| Native JSON parts | `json_part` calls `redact_value` before pretty serialization. The 256 KiB part-output cap is checked afterward. |
| Browser JSON parts | [`buildBrowserBundleParts`](../../app/browser-bundle.js) calls `redactValue` before `JSON.stringify`; browser mode has no desktop logs and normally no exact user/profile context. |
| Preview and display | [`support-dialog.js`](../../app/ui/screens/support-dialog.js) defaults redaction on, retains its best-effort text and renders summary/part values through text nodes. |
| Export/sharing | Native creation writes a user-selected validated ZIP destination; browser creation downloads locally. Report on GitHub is a user-triggered summary URL; the ZIP is not automatically attached/uploaded. |

These are inspected current paths, not a certification of every application
export or every operating-system log producer. The native 20 MiB bundle cap,
16 Ki-character log-line cap and client error caps remain distinct from the
unbounded public pure redaction helper.

### Raw JSON values are not serialized JSON text

Both recursive value redactors process individual raw strings before JSON
serialization. A raw string containing a bare multiword profile path therefore
does not acquire wrapper context merely because the output later becomes JSON.
It still uses the conservative fallback unless exact context masks it. Log text
that already contains actual quotes is a different supported form. Root and the
author were asked to retain this qualification and keep residual issue #69
scope open.

`buildClientContext` shallow-copies generic UI settings; native
`ClientContext.settings` and `system_health` are generic `serde_json::Value`.
Run summaries also contain free text. Inspection of
[`app/ui/state.js`](../../app/ui/state.js) defaults and current `setSetting`
callers did not establish a dedicated typed user-profile-path field at this
boundary. No field-name heuristic was requested. Native `RedactCtx::from_env`
already supplies exact local user/profile context. The residual raw-value
shape is not described as a demonstrated shipped-settings incident.

## Cost and language constraints

`redactText` accepts arbitrary text; surrounding export caps do not justify
repeated whole-suffix scans. Close recognition must stop at incompatible
delimiters or have an explicit bound. ASCII-space widening does not establish
support for all Unicode whitespace or all filesystem-legal names.

Both implementations consume the same
[shared vectors](../../tests/fixtures/redaction-vectors.json). The JavaScript
test and Rust `shared_redaction_vectors_match_the_js_implementation` both assert
expected output and second-pass idempotence. Shared assertions provide parity
coverage but their presence is not native execution. The local environment has
no available Rust compiler/desktop SDK; source-specific hosted native checks
remain required.

### Reviewed assertions and preservation

Static JSON comparison confirms that all **19 original vector objects** remain
unchanged and in their original order; **28 new vectors** bring the shared set
to **47**. The additions cover all five wrapper forms, child/no-child paths,
Unicode name characters with ASCII spaces, repeated interior spaces, serialized
JSON with escaped separators, exact-context and intermediate literal/email
placeholders, no-space marker preservation, bare/raw limitations, unrelated
outside prose, missing/mismatched/nested wrappers, hard punctuation, and line/
control/Unicode-whitespace boundaries. The original negative and ordinary
email/serial/context cases remain present.

Both languages also gain matching structured-value assertions. They explicitly
retain conservative bare behavior before serialization, check idempotence, and
show that an exact profile literal supplies different context. This records a
residual boundary rather than disguising it as complete redaction coverage.
The existing seeded-property, bundle and privacy tests are retained. This lane
read those assertions without executing them.

No export schema, manifest flag, user toggle/default, URL destination, permission,
dependency, logging policy, threshold, native command or collection scope changes.
The [FS-02 best-effort boundary](../specs/02-diagnostics-bundle.md) and manual
sharing flow remain applicable. The previous device-outcome full-suite result
is bound to its earlier source and does not qualify this new native change.

## Final candidate and handoff

The author owns focused functional evidence at the immutable candidate; root
owns combined-source fresh acceptance and applicable hosted/native/platform
qualification. This report does not borrow execution results from the earlier
device-outcome source. Residual issue #69 scope must remain open for bare/raw
values, unsupported component syntax and semantic ambiguity inside wrappers.

At handoff, the author reported one focused execution at final `7743813` on
Node v24.22.3: **60/60 pass** (47 shared vectors, nine other diagnostics checks
and four browser-bundle checks), zero failures/skips/cancelled/TODO, with all
1,817 tracked hashes and the source/tree unchanged. The reported TAP digest is
`0e65dd9c3872a08549404bb005d5d44633d0905792fc0b760008e57168d13d96`.
These are the author's results, not execution by this reviewer. Native compile,
Rustfmt and native runtime execution remain unperformed locally.

This lane executed no application code, tests, generators, native builds,
benchmarks, scanners, probes or vulnerability reproduction, and made no remote
writes. It used source/Git inspection and static Python only to parse JSON and
compute identities. Only this report changed. Rebind the disposition if either
production helper or the reviewed contract changes before consolidation.
