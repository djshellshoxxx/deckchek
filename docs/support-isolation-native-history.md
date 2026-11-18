# Native support-history working memory

The native support-isolation API validates retained observations and comparisons
before reads, exact retries or new saves. The implementation streams that
validation and retains only the requested page. A single-record lookup or save
does not keep the entire parsed history in memory.

This changes application-owned working memory, while preserving the existing
history contract in [FS-15 section 14](specs/15-booth-feedback-hum-hunter.md#14-passive-support-ab-observations--spec-05-16--spec-19-method-v1-2026-11-18).
It adds no migration, record cap, deletion, format, threshold or new API field.

## Validation and transaction boundaries

Every operation preserves the original validation order:

1. Validate every observation's original JSON and stored columns in descending
   capture-time/Unicode-scalar ID order.
2. Validate every comparison record and its columns in descending
   creation-time/Unicode-scalar ID order.
3. Reject an ID shared by an observation and comparison. Each table's primary
   key already enforces uniqueness within that table; the cross-table check uses
   the existing indexes.
4. Revalidate every comparison against both original observations, including
   comparisons outside the requested venue or page.

The page filter limits returned rows, not validation. Corrupt unrelated history
still refuses an empty filtered list, missing-ID lookup, exact retry or new save.
Errors do not repair or discard stored data. Complete original source records
remain attached to returned comparisons even when those originals are outside
the requested observation page.

All indexed lookups stay inside the same existing transaction as validation.
Reads retain deferred transactions; saves retain immediate transactions. The
private lookup helper relies on the JSON/column validation already completed in
that transaction. Exact retries still precede live catalog reads and return the
original saved record; changed submissions retain the existing conflict error.

## Memory scope and tradeoff

For fixed record sizes, the Rust working set depends on the requested page size
and the current records being validated, rather than the total retained history.
Public list limits remain 1–100 records of each kind, with complete totals.
Comparison validation needs its current comparison and two original records;
returned comparisons also retain their complete originals.

The 64 KiB evidence rule bounds validated JSON. It is not a raw SQLite payload
limit: harmless whitespace can make a stored `payload_json` representation
larger. That acceptance is preserved. Memory therefore also depends on the
largest current raw/parsed records. SQLite's own allocations, caches and sorting
storage are separate from the measured Rust global-allocator working set.

Global validation still visits the whole history. The extra comparison scan and
indexed original-record lookups trade additional parsing/query work for lower
peak retained memory. This is not a sublinear-read or latency improvement claim.

## Verification boundary

The 19 original native test bodies remain unchanged. Three additional tests
protect a small page over retained history, complete comparison originals and
exact retries; global corruption/error precedence across every operation; and
raw whitespace padding larger than the validated-evidence limit.

A separate exact-source harness includes the production core, native tests,
migration helpers, SQLite clock and all 24 migrations. Its allocator experiment
constructs valid databases before measurement, checks complete returned values,
and measures five operations twice at 16, 128 and 512 retained pairs. It records
peak/retained Rust bytes, allocation calls, requested bytes and elapsed time.
Tauri adapters, desktop/platform packaging, SQLite/C allocation and physical
hardware qualification remain outside that experiment. Exact execution results
and original failure evidence belong to the integration qualification record.
