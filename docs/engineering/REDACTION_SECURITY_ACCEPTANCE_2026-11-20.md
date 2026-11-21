# Diagnostics redaction independent defensive acceptance — 20 November 2026

Reviewer: `/root/redaction_security_fresh`. Dates use America/Los_Angeles;
retained execution records use UTC. This is a fresh static source acceptance
after all three initial redaction lanes completed.

## Disposition

**Accepted for the bounded defensive source scope. No new blocking finding was
identified in the frozen combined source.** The acceptance binds to commit
`6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6`, tree
`7dfe29d1e9378bbdfd98bbeff49aceed366c1c3a`. It does not close issue #69,
establish full Spec 02 AC-6 coverage, qualify native compilation/runtime parity,
or demonstrate a deployed fix or external disclosure.

I independently read the actual redactors, their callers, export and local-log
boundaries, shared assertions and retained evidence. I also read the completed
[code audit](REDACTION_CODE_AUDIT_2026-11-20.md),
[functional audit](REDACTION_FUNCTIONAL_AUDIT_2026-11-20.md) and
[defensive audit](REDACTION_SECURITY_AUDIT_2026-11-20.md). Their dispositions
were inputs to this review, not substitutes for source inspection.

## Immutable source and evidence checks

| Source role | Commit | Tree |
| --- | --- | --- |
| Initial assigned base | `6cd827b0204bc450b8fc6236a179c7383dd52911` | `629a834548412d6eb369466325342c3778839e49` |
| Preliminary implementation, unexecuted | `7a5d13717d9c978141bea5e87d9c3108df06e9be` | `8e8f8c71dbc20dd4c32401f14a4522e90566394f` |
| Final author's executed source | `7743813078381bbff713bf4609d5bb403188f269` | `0f695d9f92adca65edf9a7652770051b63dbd0af` |
| Combined source reviewed here | `6f414a4b45aeea1dd31ca82f5c02d06b78b04ca6` | `7dfe29d1e9378bbdfd98bbeff49aceed366c1c3a` |

The worktree was clean at the review boundary. Git tree comparison establishes
that every entry outside `docs/` in the combined source equals the author's
final source, including modes and blob identities. The 18 differing paths are
documentation/evidence only; the combined tree has 1,831 tracked entries and
the author tree has 1,817. Earlier device-outcome/trend code is unchanged by
this slice. The preliminary-to-final author diff contains only one helper
comment qualification in each language. No execution is attributed to the
preliminary checkpoint.

The final author diff from the assigned base changes exactly four paths. I
read the complete production diff and checked these current byte hashes against
the frozen author record:

| Path | SHA-256 |
| --- | --- |
| `app/diagnostics-bundle.js` | `9235d3b7d2d3fcc8cf3a5900ebb5652bfb1bf864f3f9d2180754aaf600bb23cc` |
| `src-tauri/src/diagnostics.rs` | `9bde6b142ff634398243d933456349d323962d52d89c4c7c756afe13aa60aace` |
| `tests/diagnostics-bundle.test.mjs` | `ca84709cdbb0d86e9433e91285a18beb007d5695ffdbaaf9b71d58c84384cbe1` |
| `tests/fixtures/redaction-vectors.json` | `b69226de078aa89daff6b30e4d89bcddce4ad4fd087ee85ef2d490f8e2a8b121` |

I verified all seven entries in the author's
[evidence digest ledger](evidence/redaction-functional-2026-11-20/SHA256SUMS).
The two tracked-file maps are equal, contain exactly 1,817 entries and have the
same path inventory as the frozen author tree. Independently hashing every
corresponding immutable Git blob reproduces every map entry. This verifies the
retained identities; it does not turn the author's execution into this
reviewer's execution. The driver was read as text, never imported or run.

## Parser and privacy reasoning

The production addition consists of paired boundary/wrapper helpers and one
call from each existing profile-path scan. The original token endpoint remains
the fallback. The redaction order remains emails, exact literals, emails again,
profile paths, then serial labels. Existing literal sorting, placeholder
protection, short-literal boundaries and serial-field handling are unchanged.

| Reviewed condition | Source conclusion |
| --- | --- |
| Wrapper adjacency | Only an immediately preceding double quote, single quote, opening parenthesis, square bracket or brace can authorize widening. Quotes around a larger message do not supply adjacency to a later embedded path. |
| Space-bearing component | Widening requires an actual interior ASCII space. Leading/trailing component spaces are refused, and a matching closer or path separator must terminate the component. |
| Complete wrapper | A close is required even after a child-path separator. Another incompatible delimiter, control, hard punctuation or nonaccepted whitespace stops that lookahead. Missing, mismatched and nested forms retain the original token rule. |
| Literal/email-first suffix | Only the five existing placeholder spellings are recognized as atoms. This handles an intermediate marker followed by a surname, and a marker inside a larger component, without admitting arbitrary angle-bracket syntax. |
| Existing marker identity | Without actual ASCII-space widening, a no-space host/email/profile marker is retained. After successful widening, the ordinary empty-component/placeholder path handling preserves the replacement on the next pass. |
| Bare path and prose | Without wrapper adjacency, a later slash does not authorize consuming intervening words. The original token behavior and its residual multiword-name limitation remain. |
| Index safety | Rust uses checked preceding-character access, bounded loops and an explicit end-of-input guard before indexing the terminating character. JavaScript's missing terminating character fails the closer/separator check and returns the original endpoint. |

The new-only terminator combines the existing segment rule with controls and
explicit U+FEFF. Consequently, the widening logic stops at the inspected tab,
newline, NBSP, NEL, BOM and Unicode line-separator boundaries in both sources.
This does not change the old bare-token boundary or establish complete Unicode
equivalence between language/runtime versions.

The scans advance monotonically. A second wrapped candidate brings a delimiter
that stops an earlier incomplete lookahead; a successful replacement advances
the outer scan to the component endpoint. I found no new recursive parsing,
unbounded retry or whole-suffix retry pattern in this addition. This is static
control-flow reasoning, not a performance measurement or a universal input-size
bound for the public helper.

**Wrapper recognition remains a syntactic heuristic, not a typed filesystem
path declaration.** Natural-language text that starts inside a wrapper with a
profile prefix can remain ambiguous. The rule does not parse general quoting,
escape or nesting grammars, and does not cover every legal folder character.
Accepted outside-wrapper prose preservation must not become a claim that all
inside-wrapper prose is semantically distinguished from path components.

## Actual collection, storage and sharing boundaries

| Boundary inspected | Existing behavior and implication |
| --- | --- |
| Desktop exact context | `RedactCtx::from_env` supplies known username, profile and host literals; `run_parts` also loads asset serials. Whole-profile literal matching can cover spaces independently of fallback recognition. Other-user paths may lack that exact context. |
| Browser context | `buildBrowserBundleParts` defaults to an empty context. The production support-dialog caller does not supply profile/user literals. Its bundle contains selected settings and run summaries, with no desktop log collection. |
| Raw structured strings | Browser `redactValue` runs before `JSON.stringify`; native `redact_value` runs before pretty serialization in `json_part`. Later JSON quoting therefore supplies no wrapper evidence. Raw bare multiword values remain partly masked unless existing exact context covers them. |
| Typed data boundary | `buildClientContext` shallow-copies generic settings, and native `ClientContext` carries generic JSON values. Inspected setting defaults/callers and run summaries do not provide a dedicated typed profile-path field at this boundary. No new path field-key heuristic is introduced. |
| Local raw logs and marker | `DiagState::log`, client-error formatting and the panic hook sanitize/cap text; `log_try` writes the marker. They do not globally redact personal information at write time. This patch does not rewrite or eliminate personal data in local storage. |
| Selected export redaction | `text_part`, `json_part` and `log_parts` apply redaction when the option is on. `diagnostics_status` separately redacts returned previous-panic text with environment context. Deliberate redaction-off export remains possible. |
| Local bundle output | Desktop creation validates the selected `.zip` save path, writes fixed entry names and records the written destination. Browser creation uses a Blob download. The redactor adds no file access or upload. |
| Manual external sharing | The distinct Report button builds a fixed-host GitHub new-issue URL and passes the summary through the existing external-link handler. The repository form and body/URL limits remain in place. The user opens the page and attaches the ZIP separately; bundle creation does not automatically submit or attach it. |
| Preview and display | Summary, part names/notes and destination text use `textContent` or text-node children through `h`. No redacted/log string is newly interpreted as HTML by this change. |

These conclusions come from the actual
[browser exporter](../../app/browser-bundle.js),
[support dialog](../../app/ui/screens/support-dialog.js),
[DOM helper](../../app/ui/dom.js),
[external-link handler](../../app/external-links.js) and both production
redactor files listed above. The support dialog and native options keep
redaction on by default. The dialog retains its existing best-effort preview
explanation and user-controlled toggle.

Existing limits remain separate contracts: five rotating files configured at
1 MiB each, a 2 MiB aggregate log-input budget, a 20 MiB bundle budget and
256 KiB JSON-part output checks. JSON size is checked after redaction and
serialization. Local message limits count characters and may append a
truncation marker; they are not equivalent byte limits for Unicode text.
Native preview/create remain on `db::off_main`. No permission, capability,
network destination, dependency, command handler, authentication, migration,
collected field, log-retention rule or threshold changes in this slice.

## Assertions, attributed execution and residual acceptance

Static fixture comparison confirms **47 unique named vectors**: all **19
original objects are unchanged and in order**, followed by **28 additions**.
I read the new literal/email-placeholder, idempotence, wrapper, raw/bare/prose,
malformed-boundary and control/non-ASCII-space assertions. Both languages
consume the shared fixture and assert expected output plus second-pass
idempotence. The added structured-value tests explicitly preserve the raw
string limitation and separately show existing exact-profile-context handling.
They do not establish that a generic key named like a path is typed data.

The author's retained record attributes **60/60 passing checks** to Node
**v24.22.3** on final source `7743813`, with zero failures, skips, cancellations
or TODOs, exit 0 and no timeout. It comprises 47 vectors, nine other diagnostics
tests and four browser-bundle tests. The record reports unchanged head/tree,
clean before/after status and the 1,817 equal tracked hashes. I independently
parsed the retained TAP totals and verified its **11,311 bytes** and SHA-256
`0e65dd9c3872a08549404bb005d5d44633d0905792fc0b760008e57168d13d96` against
the metadata. Those are attributed author results; fresh functional execution
belongs to the separate functional acceptance lane.

I compared the original [Spec 02](../specs/02-diagnostics-bundle.md) AC-6 line
against the assigned base: it is byte-for-byte unchanged. The dated status note
accurately preserves issue #69's raw/bare/ambiguous-prose residuals and states
that shared vectors do not qualify all AC-6 cases. **AC-6 remains the acceptance
requirement, not a satisfied requirement or a best-effort replacement.** There
is no demonstrated affected user dataset or external exposure in this review.
Native compilation, Rustfmt and Rust runtime parity still require applicable
evidence on the exact successor source before an implementing merge.

## Consolidation context and handoff

I checked the [qualified PR #67 merge report](ACQUISITION_QUALIFIED_MERGE_2026-11-20.md)
against its retained pre/post records and local Git objects. Tested merge
`cc8e18c8b28f1aaef40e9b8b1e1e51853730216f` and actual main merge
`099c99c055322ef668be23e6ae50a2968614cc6d` have identical tree
`f7e32678dd89880a7dce642424100e77c5e22374` and ordered parents `cfb1137d` /
`157b0dbe`. Main is an ancestor of this review source. The ancestry-carry merge
`97ce02e4fce0b503f4fa6cfe7dac960aa08b6731` retains the assigned-base tree.

The retained #67 records show successful attempt-1 standard/nightly/desktop
runs at their fixed head, with 3 standard jobs, 5 nightly jobs, and 3 embedded
tests, 6 builds and 5 packaged smokes in desktop. Release-only stages are
skipped, and Linux x86 is build-only. These earlier successes do not qualify
the new redaction Rust source. The original #65 timing failure and the single
fixed-head Fleet diagnostic failure remain recorded; no cause, passing rerun,
release or threshold adjustment is inferred. This lane made no remote read or
write and did not repeat the diagnostic.

Methods were source/Git inspection, static JSON/TAP parsing and byte/hash
comparison only. I executed no application code, tests, generators, native
builds, scanners, probes or vulnerability reproduction. Only this report is
changed by this lane. Root owns integration, exact-source hosted qualification
and any publication. Rebind this acceptance if production bytes or the bounded
contract change; keep issue #69 open for the material residual privacy scope.
