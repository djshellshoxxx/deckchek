# Defensive security review, round 5 — 19 November 2026

## Source, scope and disposition

Reviewed commit: `8d93c6126dd48c40caf95585be6429568b8d08bf`.

Reviewed tree: `63bed07bee8642c0c232240977214f621530779b`.

This fresh review independently inspected root's phone/certificate file-read
follow-up and the existing-unit profile-assignment request, native command,
database transaction and associated configuration. It follows the
[round-4 static review](SECURITY_AUDIT_ROUND4_2026-11-19.md). The interrupted
round-3 worker's drafted tests were not used or executed.

**Accepted within the documented scope. No additional production correction was
identified in these two changes.** This worker changed only this report. The
assessment is based on source inspection; it is not a new runtime, browser,
Tauri, cryptographic, hardware or whole-application security qualification.

## Phone and certificate file reads

| Boundary | Inspected behavior | Assessment |
| --- | --- | --- |
| Phone file size | `MAX_BYTES` remains exactly **1,000,000 bytes**. The existing large-file message remains, and `readTextFile` receives that same limit. | No decimal/binary limit change. |
| Phone read errors | Picker/read work is inside `try/catch`; only the current request updates the status panel. Existing text and parsed preview are replaced only after a successful current read. | The ordinary file-access failure has a visible, owned error path. |
| Phone request ownership | A token is allocated before opening the picker and checked after picking and byte reading. Input, explicit Read, Clear, hiding and a newer selection invalidate the earlier token. | A retired read cannot replace current text/preview or publish a late read error. |
| Certificate file size | Browser JSON/HTML reads use existing `LIMITS.maxJsonBytes` (**20 MiB**) and `LIMITS.maxHtmlBytes` (**48 MiB**). PDF classification returns guidance without reading. | Existing bounds and PDF behavior preserved. |
| Certificate ownership | `handleFile` retains its result token, catches read errors through that token, and checks ownership before HTML extraction or verification. | New helper integration does not transfer an earlier file's result to a later selection. |
| Shared reader | Declared size is checked before reading. One `arrayBuffer` snapshot is checked against its declared length and cap, then decoded with fatal UTF-8 handling and intentional BOM stripping. | Call sites consistently use the existing reader contract. This is not a measured process-memory ceiling. |

The relevant source is `app/text-file.js`,
`app/ui/workflows/import-phone.js`, `app/phone-run.js`,
`app/ui/screens/verify.js` and `app/certificate.js`.

The new phone tests exercise real screen handlers with ordinary valid exports,
interrupted reads and delayed lifecycle completions. Existing Verify tests now
supply byte-reading file doubles, retaining their original listener,
supersession and hidden-result assertions. These files were read as text here;
no tests were launched by this worker. Root's separately reported **39/39**
focused result remains attributed to the
[file-import follow-up](FILE_IMPORT_FOLLOWUP_2026-11-19.md).

### Certificate integrity and hidden results

`contentHash` still hashes the canonical parsed payload. Verification still
checks that digest, the embedded public key/fingerprint, Ed25519 signature and
payload schema before returning a valid result. Browser strict text decoding is
an input-format rule, not a change to what the signature authenticates. No
signature-forgery or cryptographic bypass was established by this review.

Native extraction remains unchanged: `read_capped` checks metadata, bounds its
read with `cap + 1`, checks the resulting length and uses `String::from_utf8`.
This source inspection does not execute a native path or establish total
browser/native encoding parity beyond the inspected rules.

The established Verify contract explicitly permits a selected verification to
finish into its cached hidden screen. Root's change preserves that behavior.
The previously reported native picker ownership and hidden global-announcement
concerns remain separate lifecycle work.

## Existing-unit profile assignment

Reviewed `app/device-profile-assignment.js`, catalog-store dispatch/persistence,
the assignment form and Devices integration, and
`src-tauri/src/device_profile_assignment.rs`, `devices.rs`, `db.rs`, `lib.rs`.
The [feature contract](../device-profile-assignment.md) matches the following
inspected behavior.

### Request and transaction

The browser request validator requires the four exact identity fields and
copies them before dispatch. Rust uses `deny_unknown_fields`, typed string IDs
and an explicitly required nullable `expectedProductId`; omission does not
silently become a reviewed null source. The nonempty identity bound is
**4,096 UTF-8 bytes** in both implementations.

The native operation opens an immediate transaction and uses bound SQL values.
It checks the profile's current product association against the reviewed target
and requires the target product row to exist. It separately requires a
nondeleted asset. A changed association requires the saved source product to
match the reviewed previous product. When the asset already has the requested
target, the operation is an intentional no-write retry, including when the old
expected source is retained after a lost acknowledgement.

The sole update changes `asset.product_id` and `asset.updated_at`, followed by
commit. The operation does not update product metadata, setup membership,
serials, saved results, service records, certificates or learned-map rows.
Errors leave the transaction uncommitted. The existing tests define actual
SQLite preservation, stale-input, null-source, idempotence and constraint-error
cases; those test definitions were inspected, not executed here.

### Command boundary and configuration

`device_profile_assign` is present in `tauri::generate_handler!` and receives a
typed request rather than a caller-selected database path. It follows
`db::off_main` to `devices::with_db`, which opens the application's database
through `open_database`. That connection retains the existing database read
guard for its lifetime; restore uses the corresponding write guard. Existing
foreign-key and trusted-schema settings remain in that path.

`src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json` and
`src-tauri/build.rs` are unchanged from starting main
`8c43cf17e3d5f5067ece5667f1aec1540f4b4091`. The capability still names the main
window and its existing core/dialog permissions. No added filesystem, shell or
network permission appears in this delta. Source registration and unchanged
configuration do not, by themselves, constitute an executed end-to-end IPC or
platform authorization check; that remains a hosted/native qualification gate.

### Browser storage, UI and provenance

The browser assignment path uses strict saved-state loading and the existing
snapshot commit helper. It preserves unknown legacy data, rejects corrupt or
unavailable storage, rechecks the saved snapshot and propagates write failures.
Same-target retries avoid writing. The synchronous comparison and write still
lack a cross-tab atomicity guarantee, as already documented.

The form copies candidate assets, requires a blank-to-explicit unit choice and
model/revision confirmation, clears that confirmation on a different choice,
and admits one in-flight assignment. Devices render/hide retires the form;
returning reloads the catalog. Already dispatched persistence may finish, while
a retired callback cannot claim the current UI.

Saved maps retain their original profile association. Existing Devices/runner
selection rejects an automatically reused map with a known different profile;
unknown legacy identity keeps the documented compatibility behavior. Neither
an assignment nor an unknown map identity proves a physical device match.

## Separate successor handoff

1. Preserve the accepted read and assignment behavior while qualifying the final
   integrated source in the coordinator's applicable full/hosted gates. This
   review does not transfer results from one source tree to another.
2. The known native Verify chooser-token, shared picker `cancel` cleanup and
   hidden global-feedback follow-ups remain distinct from this accepted delta.
3. A source-only phone-save ownership observation is useful for a fresh bug
   worker: `addToHistory` awaits `persistRun`, then unconditionally writes the
   shared `st.imported` and emits feedback. Read/Clear remain available during
   that await. A subsequent result can therefore share the earlier save's UI
   completion state. This is outside file-read-token ownership and was not
   reproduced at runtime here; confirm the actual user-flow behavior before
   proposing a separate correction.

No application tests, payload construction, exploit simulation, external
probing, browser automation, native builds, deployment or release actions were
performed. Only this report was written; Git status/diff checks establish that
file scope, not application correctness.
