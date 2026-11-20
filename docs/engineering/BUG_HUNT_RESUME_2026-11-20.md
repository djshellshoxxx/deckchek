# Independent ZIP bug hunt and spec review — 20 November 2026

## Verdict and exact scope

**Accept PR #45 within this reviewed scope. No confirmed production correction
or merge blocker was found.** The separate PR #46 diagnostic change also has no
identified functional blocker in source review; root must verify its own hosted
gates before merging it.

- Base: `715f5ca7bd3c4f461adc8bdca944fbef3d599bac`.
- PR #45: `7e362e64ee00af6110f04511382af0c77296eb7e`, tree
  `328b31fa3770355a6acb4ab754d0d9f36da72fbc`.
- Reviewed three-dot diff: `app/zip-writer.js` and
  `tests/zip-writer.test.mjs` (185 additions, 11 deletions before this review).
- Separate PR #46: `800511850c8f311e2e8bd50c5cd2dffbd5ddb246`, tree
  `ada0c02e0ccd4c70f29d64a086f593ea3524915f`. Its diff from PR #45 changes only
  `tools/smoke/ledger.mjs` (8 additions, 1 deletion).

The candidate's seven commits since base are `705dfd3`, `b520d02`, `410283b`,
`f096d7b`, `c979056`, `a33d8bc`, and `7e362e6`. Root retains publication ownership;
this review changes only this report and one independent regression test.

## Standards

No repository `AGENTS.md`, `CONTRIBUTING.md`, coding-standards file or
`docs/agents/issue-tracker.md` was found by the scoped filename inventory.
No hard documented-standard violation was identified. The writer retains its
documented pure, DOM-free, dependency-free stored-ZIP interface. This is the
bug/spec worker's limited standards observation; the separate code worker owns
the full Standards-axis review.

## Spec

**Zero confirmed missing, incorrect or unrequested requirements in the changed
scope.** This verdict does not close every acceptance criterion of either feature.

| Requirement / contract | Assessment |
| --- | --- |
| [FS-02 §6](../specs/02-diagnostics-bundle.md): “bundle <= 20 MiB” | Preflight reserves both record types, both UTF-8 filename copies and the end record, then counts text bytes against the remaining budget before encoding. Existing archive-wide checks remain. |
| [FS-02 §3 and §5](../specs/02-diagnostics-bundle.md): browser ZIP, settings/workspace summary, manifest first | The only production caller, `buildBrowserBundleZip`, retains its file list/order, byte payloads and manifest behavior; the focused caller suite passes. |
| `createZip` public contract: ordered entries and deterministic output for a fixed date | One name snapshot drives validation, duplicate detection and serialization. Byte payload copies keep CRC and stored content consistent. End-directory counts use actual emitted records. |
| Existing DOS-date encoding | The upper-year clamp now maps an out-of-range February 29 to February 28 in 2107. In-range leap days and the valid leap-year lower bound remain unchanged. |
| [FS-33 AC-3](../specs/33-gear-ledger.md): offline page “renders fully (no external requests, inline CSS/JS)” | PR #46 preserves the exact existing acceptance predicate: zero outside requests, one image and zero incomplete/broken images. Its extra values only explain failures. |

The UTF-8 counter agrees with the encoder's ASCII, two-byte, three-byte,
supplementary-pair and unpaired-surrogate cases on inspection. The new independent
case fills the remaining archive budget with text containing accented and
supplementary characters after an earlier entry, reads the result through the
existing central-directory reader, checks both CRCs and confirms that one
additional byte is rejected. It covers a near-limit acceptance case absent from
the existing large-text rejection tests.

## Executed verification

Runtime: **Node v24.22.3**. Command:

```sh
node --test --test-concurrency=1 tests/zip-writer.test.mjs tests/browser-bundle.test.mjs
```

**19 passed, 0 failed, 0 skipped, 0 cancelled; 1,575.993886 ms.** This comprises
15 ZIP cases, including the one new test, and four browser-bundle cases. The
existing external Python `zipfile` compatibility case executed and passed.
`git diff --check` passed. No production source was modified.

Root supplied the PR #45 hosted successes and the first-attempt ledger failure
followed by a passing rerun. I did not independently retrieve those runs or
rerun the full application suite. No browser, native, device, driver, physical
screen-reader or hardware execution was performed here.

## Remaining uncertainty and successor handoff

The original offline ledger failure's cause remains unconfirmed. PR #46 samples
per-image readiness after `pageAudit`; those later observations may differ from
the earlier broken/incomplete count. They provide diagnostic context, not proof
that a particular cause occurred or that a failed assertion should pass.

Root can integrate this report/test after accepting the frozen candidate, without
changing PR #45's already qualified application bytes. A fresh successor should
use live PR refs and hosted results, investigate any repeated ledger failure from
its recorded evidence, and preserve the current acceptance predicate. Do not
repeat unchanged broad tests or infer physical qualification from this review.

No cap, feature flag, threshold, dependency, security gate, release behavior or
historical branch changed. Fleet remains default off.
