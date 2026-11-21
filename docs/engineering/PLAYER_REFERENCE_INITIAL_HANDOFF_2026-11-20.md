# Reference-file identity and PDF axes — initial handoff

Review date: 20 November 2026, America/Los_Angeles.

All three initial workers completed. The [implementation contract](PLAYER_REFERENCE_IMPLEMENTATION_2026-11-20.md)
describes explicit bounded local-file hashing, transient ownership, metadata
export and unchanged unverified/report-ineligible status. No reference/audio
bytes are retained or uploaded. The separately prepared PDF #73 correction is
included with one further source-review fix. Runtime is byte-identical to
corrected `447019568d6a0cc0ce0fe16412e9ac99c204f604`, tree
`81807e58e03c6dd51740ef469e2c2450b20d5784`; maintained tests/tools match
`dd11f41dc41e102ddd8bf7f34e87153afa994f59`, tree
`d6272a78da9791fc40cb0cdeff238cb68d979c5f`.

| Lane | Report | Final handoff |
| --- | --- | --- |
| Code/spec | [Audit](PLAYER_REFERENCE_CODE_AUDIT_2026-11-20.md) | `0eca7f6e49ef4a9dbd9d0b87d46d2f3ca2f93692` |
| Functional/bug hunt | [Audit](PLAYER_REFERENCE_FUNCTIONAL_AUDIT_2026-11-20.md) | `904e12e0d29dd8e330b1c1b5d7dd4b57a63976ea` |
| Defensive source | [Audit](PLAYER_REFERENCE_SECURITY_AUDIT_2026-11-20.md) | `08f2f91ca0fe617db77428f936c6143ba9358717` |

## Findings corrected

The original PDF candidate checked endpoints separately but missed overflow of
their rounded difference. Source commit `795d437` requires a finite positive
rounded span before projection. The existing escaped, visible Chart unavailable
fallback remains. Pre-existing high-offset tick coalescence is distinct and not
claimed repaired or characterized by this correction.

The initial reference handler could refuse a late hidden/disposed/busy picker
event before clearing its DOM FileList. Commit `4470195` snapshots the File and
clears the input before the guard. No processing/export of that refused file
was established; this was a bounded retention/lifecycle defect. Static reviewers
accepted both corrections and the functional worker covered their behavior.

## Actual initial execution

Node v24.22.3, with complete logs/maps in the [evidence folder](evidence/player-reference-functional-2026-11-20/README.md):

| Execution | Result | Integrity |
| --- | --- | --- |
| Exact original PDF candidate `5cc916e` | 28/28, exit 0 | 1,655 tracked hashes unchanged |
| Corrected combined source, eight related files | 132/132, exit 0 | 1,908 tracked hashes unchanged |
| Updated player and PDF smokes | Each `node --check` exit 0 | Syntax only; no browser/page/print execution |

The selections overlap and are not additive. The first combined focused run
took 1.613388634 seconds; complete TAP is 29,628 bytes, SHA-256
`95abf54baa565c395efb52d761339810e1f69f02eecd180a516190844d7325cc`.
The original PDF TAP is 5,758 bytes, SHA-256
`3d3fd808003cc8c31e28adf0049538e176a013f89ae06f7eacc6f14213b3b3c5`.
Coverage includes ten helper cases, thirty screen cases, both rounded-axis
overflow cases and representable charts. Maintained browser assertions include
actual File selection, metadata download and visible print fallback alongside
normal SVG; they await hosted execution. No screenshot or PDF was generated.

## Fresh handoff

Fresh code, functional and defensive workers must independently accept the
combined freeze. The fresh functional lane alone owns one complete serial JS
suite, recording first outcome and unchanged source maps. No local Chromium
retry, native-toolchain claim, permission workaround or extra benchmark is due.
Static workers need not repeat unrelated historical inventories merely to add
activity; inspect current contracts, meaningful evidence and actual limits.

The separately completed player/usage slice is fixed draft #74, head
`78403038c530a981b732d5ac0210539edf37fc77`. Its [publication proof](evidence/player-reference-integration-2026-11-20/pr74-publication.json)
retains whole-tree/parents/ancestry and tested-merge checks. #71 is superseded,
closed unmerged, with its original head/branch retained. Earlier #74 or full
`f081881` results do not qualify this reference/PDF successor. The original #73
candidate branch remains intact; close the issue only after qualified integration.

Issues #69/#72, AC-6, original Spec 10 requirements and original failed Fleet/
audio evidence remain unchanged. Fleet stays off. Stored raw/reference evidence,
pitch analysis, persistence/report integration and scientific/physical gates
remain unfinished. No release, deployment, threshold or permission change.
