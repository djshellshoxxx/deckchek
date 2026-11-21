# Player captured-audio export — completed handoff

All three round-eleven reviewers completed with scoped ACCEPT and no material
blocker. Root independently verified their immutable commits and complete first
evidence, then integrated the reports and the completed link-consent publication
history at `3dfbea81e98d9cbc89b145e9d6805e500e8f0408` (tree
`25b61d4696b8bbd3a2ce0533384427dba9ff96f7`). No project source changed during
that consolidation. The complete-source audio HOLD remains open.

## Exact source and final workers

Reviewed and executed preparation: `445a66ef402cb88aa5a089adc3b717046728ba48`,
complete tree `280f18dc58d5786882792ddff8906dc4230d25bd`. Its ordered parents are
Player author `fb2a34a74a9e7b0ff4ba205269c8ee517f059cef`, then completed link
integration `33e077f3bf45dad96ba1c6de341a0d9fe8efa594`. It contains 2,392 tracked
paths, 2,182 distinct blobs, 76,818,229 summed source bytes and 203 top-level tests.

| Lane | Final commit | Report |
| --- | --- | --- |
| Code | `ee01e2c3657e8affe2146d1ff6b742e30dcccb13` | [Code audit](PLAYER_AUDIO_EXPORT_CODE_AUDIT_2026-11-21.md) |
| Functional / bug hunt | `c95f235630c45ac824005ba6096fcf272ec54065` | [Functional audit](PLAYER_AUDIO_EXPORT_FUNCTIONAL_AUDIT_2026-11-21.md) |
| Static defensive | `3c7fe90edcd8a5a8d700fdef231523d09c2ef28c` | [Security audit](PLAYER_AUDIO_EXPORT_SECURITY_AUDIT_2026-11-21.md) |

Each final is a clean child of the preparation. Code and security add their one
owned report each. Functional adds 47 owned report/evidence paths. Root checked
every committed owned file, exact parent/tree, clean status and unchanged product,
test, tool, native, Mobile and CI paths. All three FINALs arrived before a fresh
successor team began.

## Implemented behavior

Retention starts unchecked and is snapshotted before capture. On the default
path, audio is neither inspected nor packaged; ordinary details export and
Ctrl+E still contain only acquisition, record and selected-reference metadata.
An opted-in capture closes its owned input before preparing a local ZIP. The
operator then explicitly requests its download. Each request receives independent
bytes. Clear, replacement capture, reference changes, hide and disposal discard
prior results, while cancellation prevents late publication. Failed optional
packaging preserves valid metadata export.

The archive contains exactly `manifest.json`, `capture.json`,
`audio/primary.f32le` and `README.txt`. Samples are normalized capture-adapter
values, written as headerless left/right IEEE754 Float32 little-endian frames.
The 18 MiB PCM limit fits under the unchanged 20 MiB total ZIP cap. Metadata is
bounded and snapshotted before hashing; manifest lengths and SHA-256 identify
payload content. Acquisition identity, observed counts/rate/pair and record
identity must agree. Mono is explicit. Reference-file bytes are excluded, while
the selected descriptor/hash remains bound to the record.

Original metadata is not mutated. Faults and unknowns remain visible, and
qualification stays unverified, pitch-unmeasured and report-ineligible. The
screen describes a requested download without claiming filesystem persistence.
The archive does not authenticate a device or reference playback, and clearing
memory does not delete an already downloaded file. Cancellation does not promise
physical digest abortion or immediate sample erasure.

## First outcomes and original evidence

| First authorized command | Result | Elapsed |
| --- | --- | ---: |
| Changed smoke syntax only | Exit 0, no timeout, empty streams | 0.06412778599769808 s |
| Seven-file serial Node focused selection | 111 tests / 111 pass / no failures, skips, cancellations or todo; exit 0 | 3.273620218002179 s |

All nine new audio-helper and ten new screen cases passed. The selection also
covers acquisition, evidence normalization, reference identity, SHA-256 and ZIP
regressions. The unchanged ZIP compatibility test's bounded Python subprocess
was explicitly included in authorization. The first TAP is 25,096 bytes, SHA-256
`9cbf80ee04a33ee38f1a2a454ba0831436b6d31c316e1e9b871e0b574cdb03fe`.
No project invocation was repeated.

The [functional manifest](evidence/player-audio-export-functional-2026-11-21/manifest.json)
is 15,993 bytes, SHA-256
`d96a61e1d6c96a71b8e6e007884e205e1ab44370554e8e537c4ddefe35eef7b7`.
It binds 45 entries, 40 complete original copies and 45 original paths. The
46-file package totals 3,495,929 bytes including its manifest. Both peers and
root independently checked every original, all complete maps/inventories and
immutable Git blobs, runtime/control identities, seven selected source groups
and every one of the 111 outcome names and byte/line/block ranges. The
[root proof](evidence/player-audio-export-integration-2026-11-21/root-source-proof.json)
records the independent checks and all three final commit/report identities.

The package preserves a failed data-only Git provenance lookup of nonexistent
`app/audio-session.js`, its traceback and the corrected tracked path
`app/devices/audio-session.js`. It occurred before package writes and did not
change source, original streams or either first execution outcome.

## Hold and next work

Round ten's first full gate at `f1e0ca1` remains 2,420 total / 2,418 pass / one
failure / one optional skip. Its case 53 retains -101 dB at -30 dBFS in the final
relative-gain assertion; earlier playback-cap/lower-level checks passed. The
exact prior failure is retained in the new ordered summary. No numerical cause
or repair has been established. A focused pass does not clear that full-source
hold, and no full rerun was authorized here.

The fresh successor team addresses [backup settings completeness #85](https://github.com/djshellshoxxx/deckchek/issues/85)
under [this static review scope](BACKUP_SETTINGS_REVIEW_SCOPE_2026-11-21.md).
Root retains implementation/publication/CI and the separate audio/privacy
investigations. All three successor FINALs are required before another rotation.
No successor project execution is authorized by this handoff.

Actual browser/WebView downloads, native platform behavior, retained reference
bytes, qualified pitch, report/History integration and physical capture/reference
validation remain open. Qualified main stays separate. Fleet stays off with its
fixed diagnostic source intact. Existing thresholds, permissions, archive limits,
original failures and branches remain unchanged. No release or deployment.
