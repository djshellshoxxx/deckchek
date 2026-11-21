# Player reference-file identity — implementation contract, 20 November 2026

This successor adds optional, explicit local file selection to the default-off
Player capture preview. It is an implementation awaiting its own independent
code, functional and defensive review, not a qualified diagnostic.

## Bounded behavior

- Read one nonempty file, at most 32 MiB, and compute SHA-256 over its exact bytes
  with the existing application hash helper. The bound limits this preview's
  memory use; it is not a statement about supported audio formats or duration.
- Require a finite safe byte length and a nonblank, bounded filename without
  control characters. Check actual read length against the selected File size.
  The file chooser's audio filter is convenience, not content validation.
- Return an immutable metadata descriptor with filename, byte length, algorithm,
  digest, selected-file basis, unverified playback identity and no retained bytes.
  Do not decode, play, upload, store or infer a tone frequency from the file.
- Permit one file read at a time. While it is pending, capture and another file
  selection are refused by handlers as well as disabled controls. Clearing,
  Escape, hiding or disposal invalidates the selection. Busy ownership remains
  until the original promise settles; late success cannot repopulate the screen.
  ArrayBuffer reads and already running hashes are not physically aborted or
  securely erased. No cancellation or memory-erasure guarantee is invented.
- Clear the file input after taking its local snapshot. Keep only the completed
  descriptor in screen state. Selecting or clearing a file also discards earlier
  capture details, so their previous reference cannot be exported as the new one.
- Snapshot the descriptor before acquisition. Pass its digest into the existing
  provisional record's reference-hash field; use the operator's reference label,
  or the filename when the label is blank. Include the same descriptor as
  `selectedReference` in metadata JSON, or explicit null when no file was chosen.
- Keep `qualification.status = unverified`, `eligibleForReport = false`, and
  `measurement = null`. The SHA-256 identifies selected bytes only. It cannot
  establish playback identity, audio content, reference validity or calibration.
- Display filename/hash with text rendering. Disclose that exported metadata
  contains selected-file identity alongside device names and driver messages.
  No native command, capability, permission, dependency, database or workflow
  change is required. Existing Fleet defaults and scientific gates remain.

## Acceptance to perform

The functional worker owns actual project execution and maintains regressions
for known digests, differing byte content, exact length/bounds, cancellation,
read errors, no concurrent read, native capture blocking while selection is busy,
reference snapshots, null/no-file behavior, metadata-only export, clear/hide/
feature-off/disposal, late results, and continued unverified eligibility.
These are ordinary synthetic contract checks, not security probes.

Update the existing browser smoke for the additive `selectedReference` field
and actual browser File selection. The known local Chromium socket restriction
must not be retried or bypassed; source parsing and modeled DOM tests are not
rendered proof. The final successor requires its own hosted UI and platform
gates. Keep original production capture source and earlier evidence source-bound.

The separately prepared PDF axis candidate for issue #73 is reviewed in the
same next worker round as an independent two-file correction. It must have real
Node execution and exact source acceptance; its extracted-V8 author harness
does not establish those outcomes.

Retained raw/reference evidence bytes, source format inspection, pitch analysis,
History/report persistence, scientific characterization and physical validation
remain unfinished. The original Spec 10 requirements stay unchanged.
