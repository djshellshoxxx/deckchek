# Diagnostics redaction fresh code acceptance — 20 November 2026

Reviewer: `/root/redaction_code_fresh`. This independent static code/spec lane
started after all three initial redaction workers completed. Dates use
America/Los_Angeles. Execution timestamps in the retained evidence use UTC.

## Disposition and source binding

**Accepted for the bounded code/spec scope at consolidated commit
`6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6`, tree
`7dfe29d1e9378bbdfd98bbeff49aceed366c1c3a`. No new blocking finding.**
This accepts the reviewed wrapper heuristic and its documented limits. It
does not establish complete issue #69 resolution, complete AC-6 coverage,
native compilation/runtime parity, deployment or release readiness.

I read the completed [code audit](REDACTION_CODE_AUDIT_2026-11-20.md),
[functional audit](REDACTION_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive audit](REDACTION_SECURITY_AUDIT_2026-11-20.md), then independently
inspected the implementations, real callers, fixture objects, test assertions,
Git objects and retained evidence. No application or test code was executed
by this lane.

| Source role | Commit | Tree |
| --- | --- | --- |
| Assigned consolidated source | `6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6` | `7dfe29d1e9378bbdfd98bbeff49aceed366c1c3a` |
| Final author source, used for focused execution | `7743813078381bbff713bf4609d5bb403188f269` | `0f695d9f92adca65edf9a7652770051b63dbd0af` |
| Initial implementation checkpoint, not executed | `7a5d13717d9c978141bea5e87d9c3108df06e9be` | `8e8f8c71dbc20dd4c32401f14a4522e90566394f` |
| Pre-redaction durable handoff | `6cd827b0204bc450b8fc6236a179c7383dd52911` | `629a834548412d6eb369466325342c3778839e49` |

The full diff from the final author source to the assigned consolidation
contains only documentation/evidence paths. Static Git object comparison
confirmed all **1,365 paths outside `docs/`** have identical mode, object type
and object ID, with no additional non-documentation path. This includes all
runtime/test files, dependencies, permissions and workflows. The earlier
device-outcome #66 and trend #68 implementation bytes therefore remain intact;
their completed feature audits were not repeated.

The preliminary-to-final author diff contains precisely one comment-line
replacement in each production implementation. Both now describe wrappers as
a boundary used for widening rather than proof of a path value. The test and
fixture bytes are unchanged between those checkpoints. Execution belongs to
the final checkpoint, not the preliminary one.

I independently calculated these SHA-256 values from the consolidated files
and matched them to the final author Git objects:

| Reviewed path | SHA-256 |
| --- | --- |
| [`app/diagnostics-bundle.js`](../../app/diagnostics-bundle.js) | `9235d3b7d2d3fcc8cf3a5900ebb5652bfb1bf864f3f9d2180754aaf600bb23cc` |
| [`src-tauri/src/diagnostics.rs`](../../src-tauri/src/diagnostics.rs) | `9bde6b142ff634398243d933456349d323962d52d89c4c7c756afe13aa60aace` |
| [`tests/diagnostics-bundle.test.mjs`](../../tests/diagnostics-bundle.test.mjs) | `ca84709cdbb0d86e9433e91285a18beb007d5695ffdbaaf9b71d58c84384cbe1` |
| [`tests/fixtures/redaction-vectors.json`](../../tests/fixtures/redaction-vectors.json) | `b69226de078aa89daff6b30e4d89bcddce4ad4fd087ee85ef2d490f8e2a8b121` |

## Independent implementation findings

The original Windows/Unix prefix recognition and original token terminator
remain unchanged. Each path scanner computes the original endpoint first and
passes it to the new helper. The helper can widen that component only under
the following corresponding JS/Rust conditions:

| Condition | Inspected result |
| --- | --- |
| Original boundary | Must be ASCII space or an existing recognized placeholder; otherwise the helper returns immediately. |
| Adjacent opener | A single/double quote, `(`, `[` or `{` must immediately precede the profile prefix. |
| Component scan | Allows ASCII spaces and the existing five exact placeholder atoms; requires at least one actual space and refuses leading/trailing component spaces. |
| Component endpoint | Must reach a path separator or the matching closer. |
| Closing check | A matching closer is required even after a child-path separator. A competing delimiter, control or other whitespace ends the attempt. |
| Unsupported form | Returns the original token endpoint, preserving the pre-existing fallback. |

Rust uses `checked_sub`/`get` for the preceding character, bounded loops and
short-circuit guards before component indexing. Its explicit end-of-input
check prevents reading `text[k]` when the scan reaches the end. JavaScript's
missing end character cannot equal a valid closer or separator, so it reaches
the same fallback. Both scanners make forward progress after either outcome.

The new terminator combines the existing whitespace/punctuation rule with
control characters and explicit U+FEFF. ASCII space is the only whitespace
admitted inside the widened name. This supplies the reviewed boundary behavior
for NEL, BOM and the shared whitespace/control examples without changing the
old bare rule. It does not prove all pre-existing Unicode behavior equivalent
between every JS and Rust runtime version.

The pass order remains **emails, exact literals, emails again, profile paths,
serial labels**. Exact literals are still longest-first and placeholders are
protected. Recognized atoms allow the path helper to handle intermediate
literal/email results inside a multiword component. A whole-profile literal
can replace the prefix before the fallback sees it, retaining `<profile>`.
Without an actual component space, the new helper does not relabel an ordinary
`<host>` or other marker to `<user>`. Accepted replacements leave a single
`<user>` component, which follows the original placeholder-preserving path
behavior on another pass. Both languages retain explicit second-pass
idempotence assertions; this static review does not claim a universal runtime
proof over arbitrary contexts.

The added scans have no recursion, retry loop, new regex, I/O or global state.
A matching or competing wrapper ends lookahead, so the opener needed by a
later widening candidate also stops an earlier candidate's lookahead. A
malformed wrapper can inspect a remaining delimiter-free suffix once; another
eligible wrapped candidate cannot make that same scan continue through its
opener. This inspection found no new repeated whole-suffix scan pattern.
Fixed placeholder matching has constant size. This is a source-level cost
argument for the added helper, not a benchmark or a blanket complexity claim
for all earlier literal/email processing.

## Fixtures and actual value/export boundaries

Static JSON comparison against the pre-redaction handoff confirmed all
**19 original vector objects remain identical and in their original order**.
There are **28 additions**, **47 total vectors** and **47 unique names**. I read
their inputs, contexts and expected outputs. Coverage includes all five
wrapper forms, Windows/Unix prefixes, child/no-child paths, Unicode letters
with ASCII spaces, repeated spaces, serialized JSON text, earlier-pass
placeholders, exact profile context and preserved marker kind. The negative
and residual examples cover bare paths/prose, a non-adjacent quoted prefix,
unclosed/mismatched/nested delimiters, trailing spaces, hard punctuation,
newline/tab/NBSP/NEL/BOM/U+2028 and non-profile program paths.

The JS loop and native `shared_redaction_vectors_match_the_js_implementation`
consume this same fixture and assert both expected output and idempotence.
The new JS/Rust structured-value assertions also agree: a bare multiword raw
string retains the limited fallback, while supplied exact profile context
can replace the complete profile. The existing seeded privacy/property
assertions remain present. Native test source is not evidence of native test
execution.

| Real boundary inspected | Consequence for this change |
| --- | --- |
| [`buildBrowserBundleParts`](../../app/browser-bundle.js) | `redactValue` processes raw values before `JSON.stringify`; browser production calls provide no exact profile context. |
| Native `json_part` | Calls `redact_value` before pretty serialization. Its 256 KiB check is an output cap applied afterward. |
| Generic client context | [`buildClientContext`](../../app/ui/screens/support-dialog.js) copies UI settings; native settings/system-health fields are generic JSON values. These are not typed user-profile-path declarations. |
| Native `run_parts` | Existing environment user/profile/host values and stored asset serials supply exact context. This is stronger context when it matches the text. |
| Native text/log exports | `text_part` and `log_parts` redact when the selected option is on. The log reader retains its 2 MiB aggregate input budget. |
| Local raw capture | Logger/crash marker sanitization and caps are separate from redaction. This patch does not globally redact stored logs at write time. |
| User flow | Redaction defaults on. Native output uses the selected validated ZIP destination; browser output uses a local download. Report on GitHub remains a separate user-triggered summary action. |

Serialization-added quotes cannot authorize wrapper recognition retroactively.
A log string already containing quote characters has a different shape from
a generic raw JSON string. No path type is inferred from the name of a generic
field. The 20 MiB native bundle cap, log limits and JSON output cap remain
separate from the public pure helper's input contract.

The wrapper is a **syntactic heuristic**. Prose beginning directly with a
profile prefix inside a quote can be internally ambiguous. Preserving text
outside a recognized wrapper does not establish preservation of all natural
language inside it. Bare multiword names, raw values without exact context,
unsupported punctuation and nested/ambiguous constructs remain residual
scope. **Issue #69 remains open.**

The dated [Spec 02 implementation note](../specs/02-diagnostics-bundle.md)
accurately states these boundaries. **AC-6 remains unchanged as the acceptance
requirement** that specified personal information be absent from bundle files
with redaction on, checked against seeded values. This bounded improvement
and the best-effort UI wording do not weaken that requirement or establish
its complete fulfillment. No actual external exposure is established here.

## Author evidence integrity and attribution

I parsed the retained [focused metadata](evidence/redaction-functional-2026-11-20/focused.json),
[source freeze](evidence/redaction-functional-2026-11-20/source-freeze.json),
[complete TAP](evidence/redaction-functional-2026-11-20/focused.tap),
[before map](evidence/redaction-functional-2026-11-20/tracked-before.json) and
[after map](evidence/redaction-functional-2026-11-20/tracked-after.json).
Static verification established:

- All seven files listed in the retained
  [SHA-256 ledger](evidence/redaction-functional-2026-11-20/SHA256SUMS) match it.
- Both 1,817-entry input maps are identical, cover exactly the author's tracked
  paths, and every entry matches the corresponding final author Git blob.
- The four changed-path hashes agree with the source freeze and this checkout.
- The TAP is 11,311 bytes with SHA-256
  `0e65dd9c3872a08549404bb005d5d44633d0905792fc0b760008e57168d13d96`.
  Its summary matches the metadata: 60 total, 60 pass, zero failures,
  cancellations, skips or TODOs.

The **author** ran those focused tests on Node **v24.22.3** at final `7743813`;
the recorded command is serial and covers two test files. The evidence records
exit zero, no timeout, unchanged head/tree and clean before/after checkout.
My hash/log inspection validates retained-record consistency; it is **not an
independent execution of those 60 tests**. The fresh functional lane owns the
separate full JavaScript run. No result from that ongoing lane is borrowed in
this static acceptance.

Rust/compiler/desktop SDK execution is unavailable locally as recorded by the
author. This lane ran no native commands. Rust compilation, formatting and
runtime parity still require applicable exact-source evidence; earlier
acquisition/device gates cannot qualify these new redaction bytes.

## Consolidation record consistency

I checked the [qualified acquisition merge record](ACQUISITION_QUALIFIED_MERGE_2026-11-20.md)
against its retained [qualification JSON](evidence/redaction-integration-2026-11-20/pr67-qualification-before-merge.json),
[guarded merge JSON](evidence/redaction-integration-2026-11-20/pr67-qualified-merge.json)
and local immutable Git objects. PR #67 head `157b0dbe`, tested merge `cc8e18c8`
and main merge `099c99c` share tree `f7e32678dd89880a7dce642424100e77c5e22374`.
Both merge commits have the recorded ordered parents `cfb1137d` and `157b0dbe`.
Ancestry integration `97ce02e4` preserves the earlier handoff tree exactly.

The retained job records agree with the report: standard three, nightly five,
and desktop three test jobs/six builds/five packaged smokes succeeded at the
fixed source, attempt one. Two release-only jobs are skipped; Linux x86 is
build-only. These are root's retained qualification records, not fresh remote
observations by this reviewer.

The report preserves the original PR #65 timing failure and separate failed
Fleet diagnostic, retains the original branches and fixed diagnostic head,
and makes no cause-clearing or release claim. Nothing in the redaction source
changes the Fleet default or 200 ms gate. No further feature audit or
diagnostic trigger was performed in this lane.

## Handoff

Only this report was added. Review methods were source reads, Git inspection,
static JSON parsing and byte/hash comparison. No application/test/generator
execution, native build, benchmark, scanner, probe, vulnerability reproduction,
remote mutation or unrelated UI work was performed. Root owns publication,
source-specific hosted gates and any implementing merge. Rebind acceptance if
runtime/test bytes or the stated wrapper contract change; keep issue #69 and
the native/full-privacy qualification gates open.
