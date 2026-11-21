# History, Ledger and Mobile: completed review, held full gate

All three fresh round-six workers finished before round seven began. Root merged
their original commits and complete first evidence. The scoped code and defensive
reviews found no remaining blocker; **complete-source qualification is held**.

| Item | Identity |
| --- | --- |
| Tested source | `09c9afc7cfb2857f354feccb65e46a54ca8cfe62` |
| Tested tree | `b650eeac53af1395d6d0792f3639f02cf317490f` |
| Code report | `b86a7f63636b1b4529106fdea785087d34428237` |
| Functional report/evidence | `0d4220c9d40b8e24bf557e010542a6ec735bf234` |
| Security report | `6cc17201ebfd0fd34c7385db0d25b523c3bc6d7f` |
| Reports and separate PR #79 hosted evidence | `051aa09f6d760c5ddd9e8e0e4f8f890347bdb3b0` |

History now attributes missing/malformed lists, retains valid neighbours and
explicit incomplete counts/Retry, respects feature flags and rejects stale loads.
Ledger propagates required enumeration failures, invalidates stale previews and
blocks builds/exports while loading or failed; unknown photo inventory cannot
reach a folder write that would prune files. Both screens retain explicit failure
state when an error message is empty. Mobile shares an own-key five-route parser
with its tests; its official build generated stamp `eca0f2a661c9` and 33 precache
entries, with the seven vendored engines and worker lifecycle unchanged.

One first complete serial Node 24.22.3 gate selected all 198 actual tracked test
files: **2,391 total / 2,388 pass / 2 fail / 1 optional Mixxx skip**, exit 1,
368.925 seconds, no timeout/stderr. All 2,177 tracked hashes, inventory, HEAD/tree
and clean state stayed unchanged. All 130 predecessor focused cases and seven new
route/empty-error regressions passed within this overall failing run.

Case 37 failed the retry analysis verdict. Case 53 failed only the final gain-
relative-to-played-level assertion; both preceding playback-level assertions
passed. This does not show a cap-enforcement failure. Its actual numeric gain
was not retained and is not inferred from the separate retry context. Cubic
passed; unchanged audio code/tests establish neither a cause nor a repair.
[Issue #72](https://github.com/djshellshoxxx/deckchek/issues/72) remains open.

The original Python recorder rejected two dotted filenames before any Node or
project execution in that attempt. Original recorder/config/traceback remain;
the sole authorized guard correction kept exact 198-file equality. This is the
first actual gate, not a rerun. The separate one-time PWA syntax check passed;
it is not browser evidence. No audio patch or assertion weakening occurred.

Complete TAP: 556,814 bytes, SHA-256
`bf5b091c0a20826a64cac1842d0d5b057a5dc91a46c5a68ebcca1b9e60f50eaa`.
The [manifest](evidence/inventory-mobile-functional-2026-11-21/manifest.json)
binds 35 entries, SHA-256
`15e24ffa794a4da0d49d46358ce78f6f0b41945a3ddd0ee0da5afcfc311c9d9d`.
Both static peers and root verified all 31 original copies. Root independently
checked every source blob/map, sole build delta, selection and ordered outcome;
its [proof](evidence/inventory-mobile-integration-2026-11-21/root-source-proof.json)
is retained. Read the [code](INVENTORY_MOBILE_CODE_AUDIT_2026-11-21.md),
[functional](INVENTORY_MOBILE_FUNCTIONAL_AUDIT_2026-11-21.md) and
[security](INVENTORY_MOBILE_SECURITY_AUDIT_2026-11-21.md) reports for limits.

The fixed earlier PR #79 has separate passing local/hosted evidence; it does not
clear this later hold. Fresh round-seven workers now review separate #80 Mobile
export details, including readable old storage after denied writes. Root owns
#81 Quick Check main-pane layout. Neither later source inherits acceptance here.
Only the functional lane executes bounded first tests. All three finish before
another fresh trio. Security remains static and defensive; no release, deployment,
permission expansion, Fleet enablement or threshold change occurred.
