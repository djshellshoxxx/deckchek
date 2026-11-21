# History, Gear Ledger and Mobile — fresh code audit

Reviewer: `/root/inventory_mobile_code_round6`. Date: 21 November 2026,
America/Los_Angeles. This fresh lane began after every round-five worker's final
handoff and reviewed source and retained data only. No project, test, browser,
native component or extracted project code was executed by this reviewer.

**Qualification is held.** The first complete Node run on the frozen source
finished with **2,391 tests: 2,388 passed, two failed and one was skipped**. The
two failures are existing audio assertions, and their cause is not established
by this review. The changed-scope regressions passed. No new source blocker
remains in the reviewed History, Ledger and Mobile changes, but the failed full
gate prevents a complete qualification claim. Root retains publication and merge
decisions. The final exact-copy evidence package has been independently checked.

## Source identities and scope

| Item | Identity |
| --- | --- |
| Qualified main comparison | `77c26f44710c6dfb1c986fb79266c233e2ae688c` |
| Fixed feature PR #79 comparison | `f76908766d53992e20382b9cbe73a668a28a6d1a` |
| Completed round-five consolidation | `24f6259f37fcc960e6e1d923b9ae708bb5b0059b` |
| New preparation | `67fd2d664b8a4847fe2066c47f64682eef796c3b` |
| Preparation complete tree | `5c469cca519d4139dc47196ab6bf015c5247caf6` |
| Frozen full-gate source, including generated Mobile stamp | `09c9afc7cfb2857f354feccb65e46a54ca8cfe62` |
| Frozen complete tree | `b650eeac53af1395d6d0792f3639f02cf317490f` |

I reviewed the four inherited History/Ledger product changes, their existing
consumers and native list contracts, the new preparation's nine-file delta,
and the sole generated service-worker delta. The predecessor's accepted
reference/PDF/toolbar/preset source is the fixed PR #79 comparison; it is not
credited with qualification for these later changes.

## Finding identified and corrected before the new gate

The earlier History implementation represented diagnostic read failure with a
string, but tested that string for truthiness. An empty `Error` message or empty
string rejection could therefore produce the confirmed-empty view. Ledger's
`friendly()` similarly returned an empty thrown string, leaving its error guards
falsy after a failed reload. This was identified through source review; no
vulnerable-baseline execution or reproduction occurred.

Root corrected all three History presence checks to compare against the explicit
`null` success marker and supplied a nonempty Ledger fallback. Four new tests
exercise the actual screen modules for empty-message and empty-string rejection,
including the cached-preview/no-write boundary. The earlier `bdaf685` source and
its original 130-test result remain preserved without retroactive changes.
All four new regression cases passed in the first complete run on `09c9afc`.

## Reviewed behavior

**History.** The [history feed](../../app/history-feed.js) requires per-source
list containers to be arrays. Mapper-declined or
throwing rows receive omission counts while valid neighbours remain visible.
Only enabled native feature lists are requested, with visibility checked again
before publishing a result. The [screen](../../app/ui/screens/history.js) uses
persistent source labels, loaded counts and Retry to
distinguish unavailable history from confirmed empty lists. Generation ownership
prevents an older load from replacing newer state. The empty-error correction
keeps this distinction independent of error-message content.

**Gear Ledger.** The [Ledger API](../../app/ledger/api.js) propagates required
catalog, public-note, service-job, maintenance,
certificate and photo list failures. Confirmed empty arrays remain
valid. Unknown photo inventory in the final build blocks writing, including a
folder write that would otherwise prune old files. Known individual photo,
service and certificate read failures retain the existing visible partial-result
contract; missing/non-string certificate contents are attributed explicitly.
The [screen's](../../app/ui/screens/ledger.js) reload generation guards cover
success and failure publication. Cache invalidation
and loading/error guards protect step changes, queued builds and keyboard export.
Successful reloads prune vanished selected IDs while preserving explicit privacy
choices when an old selection disappears.

**Mobile.** The [shell](../../mobile/app.js) and tests share the actual pure
[registry/parser](../../mobile/lib/routes.js). Own-key membership admits exactly the five declared
screens. I compared all five route names, titles and resolved lazy target files
to the original shell; they match. The shell retains its `parseHash` export,
Speed fallback, supported hash prefixes, first ID segment and undecoded ID
semantics. Tests import the real module without booting or extracting shell code.
The two authored PWA checks navigate from Strobe before requesting unsupported
routes, so the previous Speed view cannot satisfy them by merely remaining visible.

## Independent generated-artifact check

The normal build's commit has the preparation as its exact parent and changes
only `mobile/sw.js`: BUILD becomes `eca0f2a661c9`, and `./lib/routes.js` joins the
precache. I independently recomputed the complete mobile-file digest basis and
checked all **33** precache entries against eligible files. There are no removed
entries, and the worker code outside the generated block is byte-identical.
All seven vendored shared engines remain byte-identical to their app sources.
The generated worker SHA-256 is
`ede63eb2bd8f63332017bf87c70d454a3b4812903d2385de8c242c982545041c`.
I also compared both complete 2,177-file build maps against immutable Git blobs
for the preparation and generated commit. Only the service worker differs, and
both saved worker snapshots match those objects. The sole official build exited
zero in 0.114865589 seconds, with no stderr or timeout. This check read files and
Git objects; it did not run the build command.

## Retained predecessor evidence

I independently verified all **19** entries in the round-five functional
manifest, all **2,147** immutable source blob digests against its three maps,
the exact 16-file selection and argv, source/tree/clean-state metadata, both
recorder implementations, and all **130** sequential TAP successes and footer.
The complete first TAP is 30,894 bytes, SHA-256
`fbbe75bc702bd34678a6590051982b79c1a8a72ca8b4625b1f7d2bbfe104d0fd`.
That focused result and the separate syntax check belong to `bdaf685`; they do
not qualify the later empty-error/Mobile changes. See the
[round-five functional report](INVENTORY_HISTORY_FUNCTIONAL_AUDIT_2026-11-21.md).

## New full-source evidence

The sole functional worker recorded one complete serial Node run on `09c9afc`,
using all **198** tracked top-level `tests/*.test.mjs` files. Its first outcome
is retained without a retry:

| Measure | First complete outcome |
| --- | --- |
| Node runtime | `v24.22.3`, Linux x64 |
| Started / completed, UTC | `2026-11-21T09:17:22.742754+00:00` / `2026-11-21T09:23:31.930004+00:00` |
| Execution elapsed | `368.9246341549988` seconds |
| Exit / timeout | `1` / `false` |
| Tests / pass / fail / skip | `2391` / `2388` / `2` / `1` |
| Raw TAP | `556814` bytes |
| Raw TAP SHA-256 | `bf5b091c0a20826a64cac1842d0d5b057a5dc91a46c5a68ebcca1b9e60f50eaa` |
| Stderr | Empty |
| Tracked files | All `2177` unchanged before, after and after syntax checking |

The two retained failed assertions are:

1. `bug 1: a capture that cannot start plays nothing, saves nothing, and Try again then records and saves once`
   in `tests/audio-runner-lifecycle.test.mjs`: the captured verdict was `fail`
   where the assertion expected `pass`.
2. `session clamps the level to the -12 dBFS cap and honours a lower level`
   in `tests/audio-session.test.mjs`: the gain-relative-to-played-level assertion
   was false. The preceding cap and lower-level selection assertions passed;
   this result does not show a cap-enforcement failure.

These test files are unchanged between fixed PR #79 and the frozen source. That
source relationship does not establish why either assertion failed. The optional
Mixxx corpus test was skipped because `MIXXX_CONTROLLERS_DIR` was not set. No
audio threshold, implementation or test was changed by this audit, and no rerun
was performed. The numerical issue #72 remains open.

The four new History/Ledger empty-error cases and all three tests importing the
actual Mobile parser are explicitly successful in the full TAP. I independently
checked every sequential top-level outcome, the plan and footer, complete TAP
bytes and digest, exact selection and argv, recorder/config identities, runtime
metadata and clean source identity. All three 2,177-entry maps match the frozen
commit's immutable blob digests, not only each other.

The separate authorized `node --check tools/smoke/mobile-pwa.mjs` operation
exited zero in `0.06390793699756614` seconds, with no timeout and empty stdout and
stderr. The 13,796-byte source and its SHA-256
`d128208810f21f31ff508fc70c54bec620736cce6f21a7ccba3390e3ccf6d07c`
match the frozen Git object before and after that operation. I read the complete
syntax recorder and checked its digest and metadata. This establishes syntax
only; no browser launch or rendering result is claimed.

### Preserved recorder setup failure

The first Python preflight rejected the legitimate names
`tests/monitor.property.test.mjs` and `tests/scratch.property.test.mjs` because
its filename guard excluded dots. It stopped before creating the output
directory, querying Node metadata or launching project code. The original
recorder and verbatim tool output are preserved separately. This setup failure
is not a test outcome.

The corrected recorder changes exactly that single guard to allow any non-slash
basename ending in `.test.mjs`; equality to the complete tracked 198-file
inventory remains mandatory. I compared both complete recorder sources and
their hashes. The authorized corrected recorder then produced the one full
Node outcome above. Its SHA-256 is
`1589eddd88d1c99c209edf96d92855293880326b6ca15c0eae810768c9409775`;
the original is
`054d3588475db9a68b4e5030ff5c8db232373e0c4763e51527bfac1a446126fd`.
No prior failure or source identity has been replaced by the corrected recorder.

### Final package verification

I independently checked all **35** files bound by the final
[manifest](evidence/inventory-mobile-functional-2026-11-21/manifest.json), whose
SHA-256 is
`15e24ffa794a4da0d49d46358ce78f6f0b41945a3ddd0ee0da5afcfc311c9d9d`.
All **31** retained raw files and recorder copies are byte-identical to their
originals. The package's complete ordered 2,391-case summary matches the raw
TAP. Its 130 predecessor case names match the earlier focused TAP and are all
successful here, alongside the seven new route/empty-error cases.

The 15 code/test/smoke paths in the package's comparison match the scoped source
delta from fixed PR #79, and all listed hashes match Git
objects. All seven listed audio implementation/test paths have identical bytes
at `f769087`, `bdaf685` and `09c9afc`; this is source parity evidence, not a causal
explanation of their runtime outcomes. The retained generated patch exactly
matches the immutable preparation-to-build diff. The
[complete first TAP](evidence/inventory-mobile-functional-2026-11-21/run.tap)
retains both failures alongside every passing and skipped case.

## Boundaries and adjacent work

Array-container checks are not comprehensive validation of every native record
schema. Browser Ledger read fallbacks, exact older-command compatibility and
known-item partial exports retain their stated scope. Authored browser checks
are not rendering evidence. Hosted/platform and physical qualification remain
separate; the local browser failure is not retried by this lane.

The pre-existing Mobile result-detail/export refresh concern and its existing
nickname smoke assertion containing `|| true` are separate subsequent work, as
assigned by root under #80. This bounded route correction does not claim to repair them.
No new command, permission, upload, deployment or measurement behavior is added.
Earlier numerical failures in issue #72 remain unresolved; no cause or audio
repair is established. Fleet remains default-off and its diagnostic stays fixed.
