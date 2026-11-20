# Security review, round 4: static file-import contract review

Date: 19 November 2026 (America/Los_Angeles).

Reviewed source: `885eb654e1299a42e85eba854032255519c6847d`, tree
`6ad6fcea0a074d80dd2aa8a7577d0a9dfb9230a4`.

## Scope and decision

This is an independent, read-only inspection of the shared text-file reader and
the phone/certificate file-selection paths. The reviewer made **no production
changes** and executed **no application tests, payloads, browser automation,
native builds, network probes or exploit simulations**. The report is the only
file added by this worker. Source inspection supports the recommendations below;
it does not establish a runtime reproduction or a passing qualification result.

The preceding round-3 security worker stopped under a tool restriction before
making production edits. Its drafted test file was neither used nor executed in
this review. No round-3 test result or completed repair is inferred from its
partial work.

The round-2 shared reader is consistent with its documented bounded UTF-8
contract in the inspected source. The phone and browser certificate call sites
do not yet use it at this baseline. Reuse with the existing limits is an
appropriate defensive correction; no new size policy or certificate signature
claim is required.

## Accepted shared-reader behavior

[`app/text-file.js`](../../app/text-file.js), `readTextFile`, checks that its
configured limit is a positive safe integer and the file's declared size is a
nonnegative safe integer. It rejects a declared size above the configured cap
before calling `arrayBuffer()`. It then reads once, requires an `ArrayBuffer`,
compares its actual byte length with the declared size and limit, and decodes
with `TextDecoder('utf-8', { fatal: true })`. Its existing BOM behavior is
intentional. Parsing and storage remain the callers' responsibility.

The existing Pre-gig and Media call sites use their established limits and
surface read errors through their existing UI error paths. Those observations
are source review, not a repeat of the round-2 worker's separately recorded
106-test run. Browser `File` metadata is not assumed to be mutable; defensive
file-like boundary checks are not evidence of an attack on a real browser file.

## Source-level findings

### 1. Phone file reads need error and request ownership

In [`app/ui/workflows/import-phone.js`](../../app/ui/workflows/import-phone.js),
`chooseFile()` awaits the chooser and `file.text()` without a surrounding error
handler. A failed read has no path to the screen's existing status panel.
The function also has no generation check between awaiting the read and
assigning `text.value` followed by `read()`. The inspected code therefore does
not invalidate a pending file read when a user clears the form, supplies newer
text, chooses another file, or leaves the screen.

Recommended correction:

- Catch chooser/read failures and show a current-request error through the
  existing status UI, retaining the preceding text and preview.
- Read through the shared helper using the exported `MAX_BYTES` constant.
- Give each file-selection request an identity before its first await. Retire
  that identity on later selection, manual input/read, Clear, or screen hide,
  and check ownership before applying either success or failure feedback.

The phone cap is **exactly 1,000,000 bytes**, as defined in
[`app/phone-run.js`](../../app/phone-run.js). It is not 1 MiB. The round-2 handoff's
"1 MiB" wording is an imprecise description of the existing constant, not an
instruction to change it. The parser already checks both string length and
encoded UTF-8 length before JSON/QR parsing. That parser check does not provide
the missing file-read exception handling or request ownership.

### 2. Browser certificate reads differ from native decoding

In [`app/ui/screens/verify.js`](../../app/ui/screens/verify.js), `handleFile()`
classifies the extension and checks the declared size before calling
`file.text()`. It already catches read rejection and uses a token to prevent an
older file read or verification result from replacing a newer selected result.
The browser read still uses replacement decoding and does not use the shared
single-byte-snapshot reader.

Recommended correction: choose `LIMITS.maxJsonBytes` for JSON and
`LIMITS.maxHtmlBytes` for HTML, then call the shared helper inside the existing
error path. Preserve the limits of **20 × 1024 × 1024 bytes** and
**48 × 1024 × 1024 bytes** respectively. Preserve the early PDF explanation:
PDF files are not parsed by this path. Check the existing result token after
reading, before HTML extraction or verification.

Native [`certificate.rs`](../../src-tauri/src/certificate.rs), `read_capped()`,
already checks metadata before reading, reads at most `cap + 1`, checks the
resulting length, and uses `String::from_utf8`. Reusing the strict browser helper
addresses a decoding-contract difference. This review did not execute native
extraction and does not claim full browser/native behavioral equivalence.

### 3. Certificate chooser ownership starts after the chooser resolves

The native `pick()` path awaits `dialog.open()` and only then calls
`handlePath()`, where the result token is incremented. Its outer click-handler
error catch calls `showMessage()` without an originating token, allowing that
function to allocate a new one. By source inspection, an earlier chooser's late
selection or failure can thus become the latest result even after a newer
selection was handled elsewhere.

This is a separate lifecycle follow-up, not a signature issue and not a
runtime-reproduced finding in this report. A corrective design would carry the
chooser's request identity from before `dialog.open()` through its selection,
cancellation and failure paths, while preserving normal current-selection
behavior.

### 4. Shared file-picker cancellation has no explicit cleanup path

[`app/ui/dom.js`](../../app/ui/dom.js), `pickFile()`, resolves its promise and
removes its temporary input only from the `change` listener. There is no
explicit cancellation listener. If a browser delivers cancellation without a
`change` event, this code leaves that promise pending and the hidden input in the
document. This is a conditional control-flow observation; no browser behavior
was executed or qualified here.

Any shared-helper repair should account for supported browser cancellation
semantics, settle once, and remove its temporary input without treating cancel
as an error or altering callers' current selections. This broader helper change
is separate from the phone/certificate byte-reader correction.

## Preserve the certificate integrity and cached-screen contracts

[`app/certificate.js`](../../app/certificate.js), `verifyCertificateText()`,
parses and validates the envelope, computes the canonical payload hash, checks
that hash against the declaration, checks the key fingerprint, and verifies the
signature over the digest before returning `valid`. A strict UTF-8 input
boundary is **not a demonstrated signature forgery or cryptographic bypass**.
No cryptographic exploitation, disclosure or code execution was established by
this review.

[`tests/verify-screen-lifecycle.test.mjs`](../../tests/verify-screen-lifecycle.test.mjs)
explicitly preserves completion of an already selected verification into the
cached Verify screen while it is hidden. A file-reader repair should retain that
contract and the selected result on return. The renderer currently also calls
the global announcer on that completion; a future UI feedback correction should
distinguish cached-result updates from visible-screen announcements instead of
discarding a valid completed result. This feedback observation is not a reason
to change certificate verdicts or parsing rules.

## Coordinator repair and successor handoff

The coordinator has separately announced implementation of the phone error and
generation handling plus reuse of `readTextFile` for phone and certificate
browser reads. The coordinator plans ordinary valid-file, read-failure and
lifecycle checks, including migration of existing Verify file doubles to
`arrayBuffer()`. Those proposed changes are **not part of this report's fixed
baseline** and have not been accepted or tested by this reviewer.

A fresh reviewer should inspect the coordinator's exact integrated commit and
its reported execution evidence. Check that the phone's decimal cap, the
certificate's binary caps, BOM compatibility, existing parse/signature checks,
latest-selection ownership and cached hidden-result behavior remain intact.
Track chooser-generation, shared picker cancellation and hidden-screen feedback
as distinct remaining findings unless the coordinator explicitly includes and
qualifies them. The earlier partial security worker's drafted tests are not
required to complete that review.

No exhaustive security audit, dependency advisory scan, native/platform
qualification, hardware validation or release acceptance is asserted. Feature
flags, measurement thresholds, storage formats and security gates are unchanged
by this documentation-only commit.
