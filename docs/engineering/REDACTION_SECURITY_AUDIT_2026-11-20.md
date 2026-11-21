# Diagnostics redaction defensive audit — 20 November 2026

Reviewer: `/root/redaction_security`. This lane performs static defensive source
review. Dates use America/Los_Angeles; execution records elsewhere retain UTC.

## Disposition and immutable source

Assigned base: `6cd827b0204bc450b8fc6236a179c7383dd52911`, tree
`629a834548412d6eb369466325342c3778839e49`. It contains the completed six-worker
[device outcome and trend handoff](DEVICE_OUTCOME_CONTINUATION_2026-11-20.md).
**Accepted for the bounded defensive source scope** at final candidate
`7743813078381bbff713bf4609d5bb403188f269`, tree
`0f695d9f92adca65edf9a7652770051b63dbd0af`. No blocking finding remains in this
slice. This is not complete issue #69 closure, native execution, deployment or
comprehensive privacy certification.

Earlier checkpoint `7a5d13717d9c978141bea5e87d9c3108df06e9be`, tree
`8e8f8c71dbc20dd4c32401f14a4522e90566394f`, was not executed. The final candidate
differs only in two helper-comment qualifications made before the author's
first focused run. Runtime logic and test/vector bytes are identical between
those checkpoints.

Issue #69 concerns fallback path redaction in
[`app/diagnostics-bundle.js`](../../app/diagnostics-bundle.js) and
[`src-tauri/src/diagnostics.rs`](../../src-tauri/src/diagnostics.rs). Both
implementations stop a profile-folder segment at whitespace. Without a matching
whole-name/profile literal, a multiword directory can therefore be only partly
masked. This is a source-level privacy limitation. No actual external exposure,
affected captured user data, exploit or deployed-fix claim is made.

## Agreed bounded policy

The code, functional and defensive lanes agreed to extend recognition only
for ASCII spaces inside an immediately adjacent, matched quote or bracket
wrapper. A matching close must exist even when the profile folder is followed
by a child-path separator. Line breaks, control characters, incompatible hard
punctuation and malformed wrappers must not authorize scanning through unrelated
text. Bare path/prose tokenization remains unchanged.

An explicit closing boundary supports a local parsing decision. A slash found
later in unquoted prose is not enough to establish that intervening words are a
directory name. The policy must preserve such text and retain the residual
ambiguity rather than claiming all whitespace-bearing names are covered. The
new widening rule uses ASCII space consistently in both languages; it does not
require treating all Unicode whitespace as an admissible folder character.

Exact-context literals, email processing, serial-label handling and their
existing order remain separate contracts. Recognized placeholders must stay
idempotent. This review identified a literal-first interaction: when a known
user's name is the first word of a different multiword folder, the literal pass
can insert `<user>` before the fallback sees the remaining words. The author
agreed to recognize only existing placeholder atoms within a verified wrapper,
so that a remaining multiword segment can be masked without treating arbitrary
angle-bracket text as a placeholder or altering bare-path behavior. The frozen
implementation does this only when an actual ASCII space is included. A
no-space `<host>`, `<email>` or other recognized marker retains its existing
identity under the original rule.

## Frozen implementation inspection

Exactly four paths differ from the assigned base. The two production files add
paired helpers and one call from the existing path scan; Rust also adds a
structured-value boundary test. The JavaScript test module and shared vector
fixture are the other paths. Pipeline order, exact literals, email/serial
handling, native command handlers, export code, capabilities, dependencies,
workflows, migrations and earlier device/trend corrections are unchanged.

| Final candidate file | SHA-256 |
| --- | --- |
| `app/diagnostics-bundle.js` | `9235d3b7d2d3fcc8cf3a5900ebb5652bfb1bf864f3f9d2180754aaf600bb23cc` |
| `src-tauri/src/diagnostics.rs` | `9bde6b142ff634398243d933456349d323962d52d89c4c7c756afe13aa60aace` |
| `tests/diagnostics-bundle.test.mjs` | `ca84709cdbb0d86e9433e91285a18beb007d5695ffdbaaf9b71d58c84384cbe1` |
| `tests/fixtures/redaction-vectors.json` | `b69226de078aa89daff6b30e4d89bcddce4ad4fd087ee85ef2d490f8e2a8b121` |

I read these files from immutable Git objects. Both helpers recognize the same
five wrapper pairs: double quote, single quote, parentheses, square brackets
and braces. Both preserve the original token boundary unless it ends at ASCII
space or a known placeholder. A wrapper must immediately precede the recognized
profile prefix. Leading/trailing spaces in the profile segment are refused;
the extended segment must end at its matching close or a separator. The close
is checked even after a child-path separator. Competing delimiters, controls
and other whitespace stop that check. The new boundary combines the old
terminator with controls and an explicit BOM check in each language.

Rust's index reads are guarded by length/get/checked-sub checks and
short-circuit conditions; JavaScript reaches the same fallback at end of input.
Only existing fixed placeholder spellings are skipped as atoms. No-space
markers, unmatched/nested wrappers and arbitrary angle-bracket text cannot
authorize the new widening. After an accepted replacement the `<user>` marker
returns through the existing idempotent path handling.

Wrapper recognition is a syntactic heuristic. It treats a delimited region as
a path boundary; it does not prove that every word inside a quoted natural-
language message is a filesystem component. Outside-wrapper prose remains
outside the replacement. No universal prose-preservation or arbitrary-text
privacy guarantee follows from this local parsing rule. The final two comment
edits state this interpretation without expanding the parser.

The fixture has **47 unique named vectors**: all **19 existing objects remain
identical**, followed by **28 new synthetic examples**. Source assertions cover
normal Windows/Unix and serialized-text forms, every wrapper pair, outside
prose, Unicode names, literal/email-first placeholders, exact-profile context,
unchanged marker kind, bare/prose residuals, malformed and nested boundaries,
line/control/space boundaries and unrelated program paths. Both languages also
add the raw-structured-value example, its existing bare-path limitation,
idempotence and exact-profile-context control. This is source coverage, not an
execution claim by this reviewer or exhaustive Unicode equivalence.

## Actual privacy and export boundaries

| Boundary inspected | Existing behavior and scope of this correction |
| --- | --- |
| Support dialog | [`openDiagnosticsDialog`](../../app/ui/screens/support-dialog.js) starts with redaction on, displays a best-effort explanation and offers a summary preview. The toggle remains user-controlled. |
| Desktop context | `run_parts` obtains literal context from the current environment and stored asset serials. `RedactCtx::from_env` uses username/profile/host values; a whole-profile literal can mask spaces without the fallback. Other-user paths may not match this context. |
| Browser context | [`buildBrowserBundleParts`](../../app/browser-bundle.js) defaults to an empty redaction context unless supplied. The production browser dialog call supplies no username/profile literals. Browser bundles contain settings and selected run summaries, with no desktop logs. |
| Structured values | JavaScript `redactValue` and native `redact_value` process raw string values and keys before JSON serialization. Serialization quotes therefore do not provide wrapper evidence. A bare multiword profile path stored as a JSON string remains outside the new wrapper-only recognition. |
| Desktop text and log exports | `text_part`, `json_part` and `log_parts` apply the selected redaction option before archive output. `diagnostics_status` also redacts returned previous-panic text using environment context. |
| Local raw logging | `DiagState::log`, client-error handling and the crash marker sanitize/cap local text but do not globally redact it at write time. This patch does not remove all personal data from local log or marker storage. |
| Bundle creation | The desktop handler validates a chosen `.zip` destination, writes fixed archive entry names and records the resulting path. Browser mode creates a local Blob download. No upload operation is added. |
| External sharing | The separate Report button calls `buildIssueUrl` and `openExternal` with a text summary. The URL uses a validated GitHub repository form and existing body/URL limits. The user attaches the archive separately; this is not automatic submission or attachment. |
| Presentation | Summary, path and part-note content use the DOM helper's `text` field/text nodes. The helper maps `text` to `textContent`; the parser change introduces no HTML interpretation route. |

These controls implement the bounded opt-in support behavior described in
[Spec 02](../specs/02-diagnostics-bundle.md) and the local-first support boundary
in [SPEC-17](../SPEC-17-operational-quality.md). **Spec 02 AC-6 remains the
acceptance requirement**: with redaction on, the specified personal information
must not appear in bundle files, verified against seeded values. This wrapper
change does not establish complete seeded-PII absence for raw/bare multiword
profile values. The requirement is preserved, not weakened by the best-effort
UI wording or this bounded source acceptance. Issue #69 and broader diagnostics
privacy qualification therefore remain open.

## Existing limits and integrity controls

The native implementation retains five log files with a 1 MiB limit per file,
reads at most 2 MiB of log bytes into a bundle, and defines a 20 MiB bundle cap.
JSON parts are checked against a 256 KiB limit after redaction/serialization.
That latter check is not a claim that all raw redactor inputs are prebounded by
256 KiB. Raw text sanitization uses character limits; these must not be
misstated as equal byte limits for Unicode content.

Native preview and bundle construction run through `db::off_main`. Archive
entries are fixed names or recognized app log names; file output retains the
existing save-path validation. Client error collection keeps its existing rate
and field-length limits. This slice must not add file reads, network calls,
authentication changes, permissions, dependencies, migrations, telemetry or
new collected fields.

The new wrapper lookahead stops at the matching close or a competing hard
boundary. Another wrapper cannot authorize nested scanning through it. An
unmatched wrapper can inspect its remaining plain suffix once; a further
candidate's adjacent delimiter terminates the earlier lookahead. This static
inspection found no new unbounded retry or recursive parsing behavior. It is
not a measured performance result. Existing caps and caller contracts remain
separate from the helper's parsing work.

## Remaining limits and acceptance boundary

The wrapper rule does not resolve ambiguous unquoted paths followed by
natural-language words. It also does not acquire wrapper context from ordinary
JSON string encoding, cover every possible platform folder character, or change
intentional redaction-off export behavior. These limitations keep issue #69
broader than this bounded improvement; no complete issue-closure claim follows
from successful shared vectors.

The shared [redaction vectors](../../tests/fixtures/redaction-vectors.json) are
consumed by both languages and have idempotence assertions in their existing
tests. They define synthetic examples, not measured user-data incidents. The
functional lane owns execution and exact runtime/source records. Static parity
inspection and passing JavaScript tests cannot establish Rust compilation,
native execution or complete platform qualification.

The author separately reported the first and only focused execution on final
candidate `7743813`: **60/60 JavaScript/browser-bundle tests passed**, with zero
failures, skips, cancellations or TODOs, on Node v24.22.3. All **1,817 tracked
hashes**, head and tree were reported unchanged, with a clean checkout at both
boundaries. The reported TAP SHA-256 is
`0e65dd9c3872a08549404bb005d5d44633d0905792fc0b760008e57168d13d96`.
Those execution claims belong to the author's retained functional evidence,
not this source-review lane. No baseline privacy reproduction or native
execution was reported. Fresh independent acceptance and applicable hosted
native/platform gates remain necessary.

This reviewer has not executed application code, tests, generators, native
commands, benchmarks, scanners, probes or vulnerability reproduction. Git,
JSON parsing, source reads and byte/hash comparison are the review methods.
Only this report is owned by the defensive lane; root owns integration,
publication, fresh acceptance and applicable hosted gates.
