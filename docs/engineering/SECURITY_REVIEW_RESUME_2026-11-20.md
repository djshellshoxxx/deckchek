# Independent defensive source review — 20 November 2026

## Disposition

**Accepted within the reviewed source scope. No merge-blocking security defect
was identified in the PR #45 ZIP delta or the separate PR #46 smoke diagnostic
delta.** This is a static defensive review, not a dependency vulnerability
clearance or evidence of runtime, native, browser or hardware qualification.

## Fixed sources and comparison

| Source | Commit | Tree |
| --- | --- | --- |
| Starting main | `715f5ca7bd3c4f461adc8bdca944fbef3d599bac` | `6b2ce737afaecb8b0dca05ef5a5a50a0ab547f53` |
| PR #45 candidate | `7e362e64ee00af6110f04511382af0c77296eb7e` | `328b31fa3770355a6acb4ab754d0d9f36da72fbc` |
| PR #46 diagnostic candidate | `800511850c8f311e2e8bd50c5cd2dffbd5ddb246` | `ada0c02e0ccd4c70f29d64a086f593ea3524915f` |

The main/candidate merge base is `6bc355c4287ad102fc17e2a9af6d132de52c0fc9`.
Both the three-dot review diff and the direct main-to-candidate comparison name
only `app/zip-writer.js` and `tests/zip-writer.test.mjs`. The separate PR #46 diff
names only `tools/smoke/ledger.mjs` (+8/-1). Commit histories, complete writer,
changed test source, the browser bundle caller and relevant smoke setup/audit
code were inspected independently.

Requirements were read from [FS-02](../specs/02-diagnostics-bundle.md), especially
its 20 MiB bundle ceiling and fixed bundle entry names, and
[FS-33](../specs/33-gear-ledger.md), especially AC-3 offline rendering and its
privacy requirements. No tracked AGENTS.md, CONTRIBUTING or CODING_STANDARDS
file was found by the targeted instruction/standards lookup.

## ZIP validation, bounds and ownership

| Reviewed contract | Source assessment |
| --- | --- |
| Validated filename is the serialized filename | `app/zip-writer.js:107–111` captures the name once, validates that string, checks duplicates and encodes the same value. The existing name restrictions and Unicode rejection remain intact. |
| Remaining byte budget precedes payload allocation | Lines 113–115 reserve the local record, central record and both encoded filename copies before converting the payload. `toBytes` checks ordinary byte arrays before copying and counts string UTF-8 bytes before encoding. Its handling of surrogate pairs and replacement characters matches the intended encoder behavior. |
| Archive cap covers all emitted records | The 20 MiB constant is unchanged. The accounting begins with the 22-byte end record and includes each payload and record before CRC computation; the final concatenation consists of those accounted pieces. |
| CRC and serialized bytes use the same owned data | The byte-array copy at line 63 is held privately for CRC and serialization. Later caller mutation cannot change that previously captured array. Existing browser bundle construction supplies ordinary local byte arrays and fixed string names. |
| Directory count follows emitted records | Lines 102–105 count the actual loop iterations and enforce the ZIP32 count limit before accepting another entry. Lines 155–156 write that count into both end-directory count fields. |
| Date correction preserves a valid packed date | The upper-bound February 29 correction produces February 28 in the clamped non-leap year. Lower-bound 1980 leap days and ordinary in-range dates retain their previous behavior. |

The inspected tests retain ordinary archive round trips and CRC checks, and add
coverage for the changed snapshot/count/preflight/date behavior. They were read,
not executed by this reviewer.

Two scope limits matter when describing this result. The 20 MiB limit is an
**archive-size** bound, not a 20 MiB total process-memory budget: caller input,
the owned payload copies and the final output can coexist. The browser bundle
builder already materializes its encoded parts before calling the writer, so
the writer's string preflight is not an end-to-end allocator proof for that
builder. These are qualifications to the result, not newly introduced merge
blockers. The writer is a local serializer, not an archive extraction or remote
execution boundary; no stronger isolation against arbitrary in-process JavaScript
is asserted.

## Ledger diagnostic privacy and acceptance

At PR #46, `tools/smoke/ledger.mjs:255–264` adds `complete` and `naturalWidth` for
images, plus image and broken/incomplete counts, to the existing failure detail.
It does not collect image bytes, image URLs, captions, serials, certificate data
or the exported page contents. Unexpected request URLs were already collected
and included in the prior failure detail; this change retains that field.
The reviewed smoke constructs its own synthetic fixture.

The acceptance predicate remains `outside.length === 0 && a.imgs === 1 &&
a.imgsBroken === 0`. The browser context remains offline and the existing
request observer remains active. No retry, wait-for-success condition or relaxed
image/offline criterion was introduced.

`pageAudit` and the additional readiness read are separate observations. A later
readiness value can therefore differ from the earlier audit snapshot. The new
detail helps distinguish conditions; it does not itself establish the cause of
the previously intermittent failure. Preserve that distinction in the handoff.

## Preserved boundaries and evidence limits

The changed-path comparisons establish that these deltas do not modify package
or Cargo dependencies/locks, Tauri capabilities/configuration, CI workflow
definitions, application privacy settings, signing code, migrations, measurement
thresholds or default feature flags. Fleet's default is not changed.

This reviewer performed Git/file/source inspection and report whitespace
validation only. **No application test, browser launch, native build, scanner,
fuzzing, payload reproduction, external probe or remote mutation was performed.**
Only this report was authored in the isolated review branch.

The integration owner reports successful PR #45 standard, nightly and desktop
workflows, with an initial offline-image smoke failure followed by a successful
targeted rerun. Those are separately owned hosted observations; this review does
not relabel the initial failure or establish its cause. PR #46 requires its own
applicable workflow results.

## Fresh-worker handoff

Use the exact live source and workflow results before any merge. For unchanged
PR #45, combine this scoped acceptance with the independent code and functional
reviews and its applicable checks. Keep PR #46's diagnostic scope separate and
qualify its own candidate. If the offline-image failure recurs, inspect the
recorded audit and readiness observations before proposing a functional repair.
Retain existing privacy and offline assertions, the archive ceiling and all
hardware/release gates. No confirmed security correction remains open from this
review.
