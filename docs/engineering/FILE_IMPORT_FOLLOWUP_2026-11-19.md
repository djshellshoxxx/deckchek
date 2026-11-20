# File import follow-up — 19 November 2026

Root implemented the ordinary file-read and UI-lifecycle corrections identified
by the [static security review](SECURITY_AUDIT_ROUND4_2026-11-19.md).

Phone file selection uses `readTextFile` with the unchanged **1,000,000-byte**
limit. Read/picker errors appear in the status panel while preserving text and
preview. Pending reads cannot replace a newer selection, manually entered text,
an explicitly read result, a cleared form or a screen that has been hidden.
Valid Unicode exports retain their hash/preview behavior. Choosing a file does
not save an import automatically.

Certificate browser reads use the helper with the existing **20 MiB JSON /
48 MiB HTML** bounds. Native extraction is unchanged. PDFs remain unread and
show sidecar guidance. Selected verification may finish in a cached hidden
screen, preserving the established lifecycle contract. Stale reads return
before HTML extraction/verification. Strict decoding is an input-format rule;
canonical payload/signature verification is unchanged, and no signature-forgery
issue is claimed.

## Qualification

Node 22.23.4 ran actual phone file handlers, existing phone UI/model cases and
Verify lifecycle cases: **39 passed, zero failed, zero skipped**, 1,278.491242 ms.
Thirteen new phone cases cover a normal Unicode export, a read interruption,
empty-selection cancellation, the existing byte cap, eight delayed success/error
combinations and newer-file ownership. Verify file doubles now expose byte reads
while preserving all original assertions.

This is focused JavaScript evidence; final combined and hosted results remain
separate in the [current continuation](CONTINUATION_2026-11-19.md). The interrupted
round-3 worker's drafted tests were not used or executed. Physical phones, native
chooser dialogs, browser cancellation and signing are not qualified here.

The static review's native chooser ownership, shared picker `cancel` cleanup and
hidden-result global feedback observations remain separate follow-ups.
