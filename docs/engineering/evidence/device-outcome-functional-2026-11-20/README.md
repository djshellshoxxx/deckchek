# Device outcome functional evidence

The associated [functional audit](../../DEVICE_OUTCOME_FUNCTIONAL_AUDIT_2026-11-20.md) explains the scope and retained failures. Executions occurred on 2026-11-21 UTC under Node v24.22.3.

## Principal evidence

- [Schema-valid baseline TAP](schema-baseline.tap) and [metadata](schema-baseline.json): identical final tests on `74f19b85e462b3602b12814a44226b6b9002b6d3`, whose application code is unchanged from the assigned base. Five expected semantic failures; the screen failure explicitly reads the persisted PASS row.
- [Final candidate TAP](schema-final-regressions.tap) and [metadata](schema-final-regressions.json): 16/16 on `9de3f95cf0e79851dc01a27066c515c6691ef811`.
- [Related existing tests TAP](final-related.tap) and [metadata](final-related.json): 142/142 on `8fbaa3e2ea95ec3ed4a47bdf30dfd04b0bb09aab`, with unchanged relevant application and test bytes in the final candidate.
- [Source comparison](source-comparison.json): Git object identities, identical regression test blobs, unchanged baseline application, and the two-file application correction.
- [Proof assembly](proof-assembly.json): frozen proof commit construction and detached worktree identity.
- [Run index](run-index.json): all retained source/exit-code/TAP-hash associations.

Each run prefix has `.tap`, `.json`, `-tracked-before.json`, and `-tracked-after.json` files. All seven before/after maps match exactly and contain 1,749 tracked file SHA-256 entries. Raw TAP hashes were checked against metadata before the evidence was committed. Test process failures are recorded in metadata even though the surrounding evidence-capture script completed successfully.

The raw failing TAP output includes indented blank lines emitted by Node, so an unrestricted `git diff --cached --check` reports trailing whitespace in those `.tap` files. The bytes are intentionally retained to preserve the recorded hashes. Source, test, Markdown, and JSON whitespace checks are assessed separately; no repository whitespace rule or gate was changed.

## Earlier runs retained

`initial-fixture` includes a screen bootstrap error, `baseline` uses the earlier incomplete profile metadata, and `candidate-regressions` includes the mistaken UNKNOWN display-label assertion. `final-regressions` was the first passing run before the fixture was explicitly validated. These are preserved rather than replaced by the later schema-valid proof and are not additional distinct test coverage.

The first `initial-fixture.json` field named `started_at_utc` was captured after execution; treat it as a completion observation. Its raw metadata is retained unchanged. Later records contain proper separate start/completion observations.

The proof branch is local evidence only. Integrate the functional branch's corrections and tests, not the baseline proof branch. Reports and these evidence files were written after the final frozen tests; their addition does not imply another application test run.
