# Fleet diagnostic defensive review — 20 November 2026

Reviewer: `/root/fleet_diagnostic_security_fresh`. Dates use America/Vancouver.
This review concerns the local diagnostic tooling and the provenance of its
retained observation. It does not qualify the Fleet application or clear its
hosted timing gate.

## Source and disposition

Initial reviewed source: `82016a79e363d687703c4e897d4ef2247fcb1028`, tree
`90a667533bbea1d77705d15274428011db3373b3`, compared with application base
`e49ea1bbafb5005fdf1dfcf60d885b82d0191471`.

Corrected source independently inspected with fixed Git refs:
`69ea261aa8a89c3cb3d6d83e17427b442261cc92`, tree
`e52b5c4671c9a43388c838aed8e3d0cc2188efb2`.

The initial eight-file change consists only of the generator, report and retained
evidence. Independent Git comparison confirms that application modules, tests,
Rust application source, dependencies, migrations, workflows and mobile files
match that base. No threshold, default or application security boundary changes.

**ACCEPT_FOR_INTEGRATION within this defensive source-review scope at corrected
source `69ea261`.** The migration-input provenance issue below is resolved by the
inspected correction. The retained observation remains source-bound author
evidence within its documented limits; the changed generator did not produce
that earlier observation. No separate blocking allocator, FFI, command-execution
or output-handling issue was identified. This is source acceptance, not an
independent successful runtime check of the corrected generator.

## Diagnostic provenance finding

### FD-S1 — Live migration input survives generation

The initial generator embeds absolute `include_str!` paths pointing to migration
files in the working repository. Its proof hashes those files at generation,
while Rust reads the SQL through those paths later during compilation. An
ordinary migration edit between those two operations can therefore change the
compiled input without changing the stored proof or generated Rust text.

This is a diagnostic provenance issue, also identified by the independent code
reviewer. It does not show that the preserved observation used different bytes:
the current 25 migration hashes and original generated harness match its record.
The reusable tool should instead freeze the SQL in the generated crate and hash
the same byte buffers it writes there. Relative includes can then consume those
frozen copies without a continuing dependency on the source checkout.

**Resolved at `69ea261`.** The corrected loop reads each migration once into a
byte buffer, writes that buffer into the standalone crate's `migrations/`
directory, and hashes the same buffer. Generated `src/lib.rs` now includes only
`../migrations/<file>` paths. No live source-checkout migration path survives in
the generated include expression. Ordinary later edits to repository migrations
therefore cannot alter the generated crate's SQL inputs.

The copied paths use the existing migration filenames discovered in the trusted
repository. They remain inside the already validated diagnostic output. A
partial generation failure leaves evidence in place; it introduces no deletion
or automatic overwrite/retry. This correction freezes the input relationship;
it does not prevent a later explicit edit of the generated crate itself.

The corrected report also explains that phase sampling ends before return-time
local destruction, whereas the separate full-call measurement includes return
cleanup. Inspection confirms that `record_phase(3, ...)` precedes `Ok(rows)`.
All original evidence files, application source, tests, dependencies, migrations,
workflows and defaults are byte-identical across the correction.

## Defensive source assessment

### Output and process handling

The generator resolves the repository from its own file and resolves the supplied
output path before comparing their relationship. It rejects the repository root
and descendants. It also rejects a nonempty existing output directory rather
than overwriting a prior diagnostic. Its writes create the standalone source,
manifest, lock and proof; it contains no deletion or cleanup operation.

The sole subprocess in the generator is a fixed argument-vector invocation of
`git rev-parse HEAD` in the source repository. The output path is not interpolated
into a shell command. The generator does not execute Cargo, install dependencies,
change process environment variables, access credentials, or perform networking.
Those later Cargo operations are separate explicit developer commands.

The output check and later creation are not an atomic directory reservation.
This scoped acceptance assumes the documented single-owner local diagnostic
directory, not concurrent writers to the same destination. Resolving and checking
the path is not an operating-system sandbox. No destructive operation or hostile
filesystem experiment was performed in this review.

### Rust allocator and clock instrumentation

Every `GlobalAlloc` method delegates its incoming pointer, layout and new size
unchanged to the corresponding `System` method. The wrapper counts requests
before allocation and forwards deallocation without dereferencing, offsetting or
retaining user pointers. Atomic counters do not invoke formatting or collection
allocation inside allocator methods. No recursive allocation path is introduced
by the inspected wrapper.

The clock call receives a live, initialized `libc::timespec` value and checks the
return code before using it. The instrumentation is explicitly Linux-only. These
source observations identify no additional unsafe-pointer handling defect; they
are not a formal memory-safety proof or independently executed sanitizer result.

Global allocation counts are process-wide request counts, not SQLite C
allocations, successful allocations, retained memory or peak memory. A reallocation
counts its newly requested size. The serial-test requirement, instrumentation
overhead and separate thread-CPU/wall observations remain material. The phase
recorder creates its JSON after taking a phase sample and before starting the
next phase. Phase rows and the separate unchanged-function sample are different
invocations and must not be added or compared as a controlled optimization trial.

### Dependency and source provenance boundaries

Independent inspection of the retained standalone lock found **31 packages**:
the diagnostic root plus **30 registry packages**. Each registry package has an
explicit checksum and matches the application lock by name, version, registry
source and checksum. The normalization log records zero version updates. The
application lock is unchanged.

The helper's `--verify-lock` implementation has a narrower role: it compares
registry name/version/checksum values and skips nonregistry entries. It does not
establish complete Cargo source identity, feature unification, build-script
environment, target configuration or compiler identity. Its reported
`registryDependencyDrift` field is accepted only with that limited meaning.
This review independently checked the stronger source tuple for the actual
retained lock; it does not certify every future input to that helper.

The proof records the Git commit and individual input hashes. A commit field
alone does not prove that a future working checkout was clean; the input hashes
and a frozen generation/build source remain necessary to interpret that record.
The original observation's hashes were checked here and match.

## Independent evidence checks

This reviewer performed source inspection, exact Git-ref comparisons, direct
SHA-256 checks, TOML/JSON parsing and retained-log comparison. Neither the
generator nor application tests were executed. No scanner, fuzzing, external
probe or security test payload was used.

Independently verified:

- All six extraction-snippet hashes match the source slices and the proof.
- All 25 migration hashes match the retained observation.
- The original generated Rust file still present in scratch matches its recorded
  harness hash `d18621004ba3b3deff68b7a9456edd0c9ef6b5eead1e23480f24a928c07bcb63`.
- The measurement object parsed from the successful log equals the retained
  measurement JSON. The log states two passed, zero failed and zero ignored in
  1.47 test seconds. Those results remain the author's execution.
- The initial locked-Cargo failure and the full-metadata `ENOSPC` failure remain
  recorded; neither is represented as a successful build or credit exhaustion.

| Checked artifact | SHA-256 |
| --- | --- |
| Initial generator | `25078d29cf3b0fc7a9ee8baa5e04b8bf5a1ae6b341f7c66d129aa101a588a409` |
| Corrected generator at `69ea261` | `2df2d1a9d72073d25863d80fef92b4d4ac56a9b42a0f36f2025de8a64dcdeeb1` |
| Corrected author report at `69ea261` | `fe133392fa7ae1796fbe608e2656982367ed25abb570f6034753bc70dca0e205` |
| Fleet source | `3555c7d515aa64c383098ded7954e2f65c4899ae4589018ffaf0d03f54cef186` |
| Database source | `68ce838bc71de162beb7df1d987c5e533d4d845a249d37ba4c7e87d32930c0f1` |
| Application lock | `2e959fe81ccb6492f89b3cd10647a81d094506b0f72806c097ef523259d55a74` |
| Retained diagnostic lock | `473091f0dbf09896ca608a43b7a2fd82516497746a1ca05d7db3a8995feb9d76` |
| Retained measurement JSON | `b03687983f7b5d1c5e117032004c32d3d0dd94638b1bedb685c5e5fba8384003` |
| Retained successful log | `1f9fe7a1613916682bfc04e81f409094db1f3dfddb0dda24e684e0fbb1f7eb13` |

The [author report](FLEET_NATIVE_PHASE_MEASUREMENT_2026-11-20.md) distinguishes
the isolated 2/2 result from PR #47's failed hosted 200 ms assertion and PR #54's
separate ASan pass. It also retains the unverified full-application feature graph,
missing native SDKs, disabled leak detection and one-observation limitation.
This review does not promote any of those claims to new executed qualification.
Root separately reported that the functional successor's compilation attempt
had `cc1` killed before tests. This reviewer did not inspect that worker's final
log or independently rerun it, and makes no successful-runtime claim for that
attempt or corrected source.

## Handoff

Only this report is authored by this worker. Root owns the tooling correction,
integration and publication. Preserve the original hashes/logs when recording
the corrected generator; changed tooling must not be presented as having produced
the earlier measurement. Independent functional reproduction and code acceptance
remain separate evidence. Full native application/hosted qualification, physical
testing and any performance optimization remain outside this review. Fleet stays
default-off and the 200 ms assertion remains unchanged.
