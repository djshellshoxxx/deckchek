# Ledger preset validation successor — issue #75

Review date: 20 November 2026, America/Los_Angeles.

The scheduled static audit filed [#75](https://github.com/djshellshoxxx/DeckChek/issues/75)
after tracing saved privacy-rule restoration into the ledger UI. Plain-object
lookup admitted inherited property names as presets; those entries do not have
the expected serial-mode/field definition. This is a source-derived validation
and UI correctness finding. No disclosure, exploitation or production incident
is established, and the original behavior was not dynamically reproduced here.

The correction uses one private predicate requiring a primitive string and an
own property of the declared preset table. `makeRules`, `normalizeRules` and
`matchesPreset` share that predicate. Preset comparison also returns false for
a missing or non-object field map instead of dereferencing it.

Public, Insurance and Private retain their existing definitions. Unknown names
start from complete Public defaults. Explicit valid serial/field/item overrides
still apply during normalization; this is not a forced reset of all saved
choices. `custom` remains a supported rules label, while `makeRules('custom')`
continues to choose Public defaults because Custom has no preset definition.

Two focused contract cases cover declared presets, invalid names/types,
complete fallback rules, safe subsequent editing, per-item masking and Custom
round-trip behavior. Existing ledger export snapshots remain the broader
regression gate. These tests are authored for the corrected implementation;
root has not executed them while the audio functional lane owns runtime.

Static diff and whitespace review are complete. Independent code, functional
and defensive review and applicable exact-source CI are pending. Issue #75
stays open until a qualified implementing merge. No feature flag, permission,
export whitelist, redaction scope, audio threshold or earlier failure evidence
changes in this correction.
