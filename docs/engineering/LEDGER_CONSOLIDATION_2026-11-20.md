# Ledger consolidation and continuation — 20 November 2026

Dates use America/Vancouver. This report supersedes live queue instructions in
[the earlier continuation](CONTINUATION_2026-11-20.md). Historical results and
failures retain their original sources and scope.

## Completed implementation and review

The combined source retains the Devices/cache/profile continuation and the
complementary Unicode ZIP regression, consolidates the Ledger publishing and
browser-persistence stack, and corrects three data-integrity faults found by the
independent workers.

| Behavior | Corrected result |
| --- | --- |
| Repeated notes submitted while earlier saves are pending | Writes are ordered per asset; only the latest operation can retire its matching draft. An older A acknowledgement cannot erase the newest A in A → B → A edits. |
| Reopening or reloading Ledger during a submitted save | Reload waits before replacing gear rows. Failed notes keep their editable draft and recovery error. |
| Saved IDs that coincide with object-member names | Notes use own-entry reads and explicit data-property writes, preserving ID and JSON format. |
| Browser storage missing, blocked, malformed or empty-but-present | Note/history writes reject instead of reporting persistence. Strict mutation reads preserve unreadable stored bytes; recovery instructions retain edits or exported files. |
| Manual GitHub Pages publishing | The guide places folder contents or `index.html` at the publishing root, distinguishes site/repository visibility, and explains stale assets and retained Git history. |

The first three are new corrections from this foreground review. Storage and
publishing changes retain and complete the published stack. The browser key
remains `deckchek.ledger.v1`. Native command arguments, database schema, revision
rules, export privacy implementation and feature defaults are unchanged by the
new note corrections.

### Completed worker handoffs

The initial code auditor, functional bug hunter and defensive auditor completed
their work. Root integrated the corrections, then assigned a fresh set of three
workers to the frozen source. All three successors completed and accepted their
assigned scopes.

| Stage | Evidence and disposition |
| --- | --- |
| Initial code audit | [Report](LEDGER_CODE_AUDIT_2026-11-20.md): outdated publishing documentation and missing recovery steps; draft ownership handed to the functional worker. |
| Functional author | [Report](LEDGER_BUG_HUNT_2026-11-20.md): edit/reload failing baselines, screen and note-key corrections, **80/80** focused verification. |
| Initial defensive audit | [Report](LEDGER_SECURITY_AUDIT_2026-11-20.md): LSA-01 draft ownership and LSA-02 note dictionary semantics, without pre-accepting later fixes. |
| Fresh code acceptance | [Report](LEDGER_CODE_ACCEPTANCE_2026-11-20.md): S1/S2 closed, corrected ownership/reload/key paths accepted; source review only. |
| Fresh functional acceptance | [Report](LEDGER_FUNCTIONAL_ACCEPTANCE_2026-11-20.md): independent **28/28** selected checks on Node 22.23.4, all **1,550** tracked hashes unchanged. |
| Fresh defensive acceptance | [Report](LEDGER_SECURITY_ACCEPTANCE_2026-11-20.md): LSA-01/02 resolved within note-persistence scope; strict mutation reads and acknowledgement boundaries retained. |

The author's clean screen baseline was **five passes / two failures**, followed
by **8/8** corrected cases. The ordinary saved-ID baseline was **seven passes /
one failure**, followed by **8/8**. An earlier fixture-cleanup timing issue is
disclosed separately and is not attributed to production. These scopes overlap
the author's 80 cases, independent 28 and full suite; counts are not additive.

## Consolidation and exact source

Verified main is `e49ea1bbafb5005fdf1dfcf60d885b82d0191471`, tree
`ada0c02e0ccd4c70f29d64a086f593ea3524915f`, after #46 merged. The earlier report's
open-#46 statement is historical.

| Retained input | Exact published head | Contribution |
| --- | --- | --- |
| #54, including #48 and merged #46 | `3d1ee5bddb56db1290af0166874612ada3c0a566` | Current-main qualification of Devices/cache/profile continuation and Ledger smoke diagnostics. |
| #47 | `b31bad64f09569ad2b378d1df2adc90e1ecb38cc` | Complementary Unicode filename at the exact ZIP byte limit. |
| #51, including #49/#50 | `90811d894aab226b1d00398333710e509ee43a68` | Publishing-root, visibility, stale-file and history guidance. |
| #52 | `d4e5bc5104209c3680d0a41fb781156b924d1a05` | Per-asset note write serialization. |
| #56, including #53/#55 | `0639359fd5326789b68df9b5ebc532170e388f4e` | Browser storage failure handling and protection of unreadable/empty data. |

These inputs merged without conflicts at local `9c90091be33fa58085bff80b34121d8cf4053a3a`,
tree `4efa2e323bd9cef9f95d548a31e892ae174551c4`. Root reconciled documentation in
`bb3483f`, retained initial audit reports, and integrated author corrections
`31b2af8` and `a767462` as `272ec2c` and `e04d633`.

**Frozen reviewed and tested source:** `e04d6332185063b62c75f0e2cabdc1654a719079`,
tree `88b3f2c43967ae3695d9974a8b69b7be5b6bd6c2`. The author's application/test
bytes match this source; its distinct tree includes reconciled documentation and
initial audits. Later acceptance reports and this handoff add documentation only.

## Combined qualification

The complete serial Node 22.23.4 suite passed **2,222 tests / zero failures /
one optional Mixxx-corpus skip**, 2,223 total across **184 top-level test files**.
The optional corpus requires `MIXXX_CONTROLLERS_DIR`, which was unset. Test
duration was **512.135134954 seconds**; enclosing execution took
**512.257987652 seconds**. All **1,550 tracked file hashes** stayed unchanged,
the source tree matched and the frozen checkout remained clean.

Device index, generated coverage, timecode facts, all **25 migrations**, mobile
vendor/precache checks and **434 module syntax checks** passed. Both unchanged
performance proxy tests passed **2/2**: controller metadata, 2,400 hops,
0.643 ms mean / 23.56 ms worst / 0.07 MB heap growth; monitor, 2,400 hops,
0.541 ms mean / 3.21 ms worst / 0.06 MB. Worst-hop observations are retained;
the assertions bound mean time and retained heap. All source hashes and clean
status remained unchanged through these gates.

The [machine-readable evidence](LEDGER_CONSOLIDATION_2026-11-20_EVIDENCE.json)
records commands, counts, hashes and integrity checks. Full-suite log SHA-256:
`b5bfcd3e8e41cecdadd8daf046f386325ca752e1d33dfa5a4f627be7e2012846`.

The [durable equivalent source](https://github.com/djshellshoxxx/deckchek/commit/68d49cc0cb26ab8444d54cdaab50fabdf81bd46a)
is `68d49cc0cb26ab8444d54cdaab50fabdf81bd46a`. Its complete tree exactly matches
the frozen reviewed/tested tree. Independent Git fetch/readback confirmed every
original published head #47–#56 is an ancestor. The final candidate adds only
author/acceptance reports, evidence and current handoff headers; application,
test, generated, dependency, migration and workflow bytes remain unchanged.
The candidate branch is `integration/deckchek-ledger-consolidation-20261120`,
targeting main. Inspect its live PR and hosted results before integration.

The independent 28-case execution used production screen handlers and browser
API through a small DOM fixture, memory storage and deferred writes. It covered
pending saves through Escape/reopen, failure/retry, independent assets, corrupt
storage, revision behavior and native JavaScript dispatch contracts. It did not
launch a browser or execute native persistence.

## Hosted timing evidence and gates

PR #47's second nightly ASan attempt failed at **200.055967 ms** against the
unchanged **200 ms** Fleet assertion: **766 passed, one failed, eight ignored**,
245.61 seconds. Failed job:
[136543911776](https://github.com/djshellshoxxx/deckchek/actions/runs/44773669498/job/136543911776).
The inspected log contained no ASan memory diagnostic. Cause is unestablished;
no additional blind retry or threshold change was made here.

A separately owned Linux diagnostic copied the exact reminder functions,
original regression and 25 migrations. Its budget and complete 2,000-row equality
tests passed **2/2** under nightly ASan. One separate unchanged-function call
measured **110.555698 ms**. This isolated observation with allocator overhead is
neither a production optimization nor a replacement for the failed hosted gate.
Full application feature-unification equivalence remains unverified. Three
fresh diagnostic workers completed code, functional-generation and defensive
reviews. A migration-copy correction makes generated inputs independent of later
repository edits. The independent ASan compile was killed in `cc1` before tests;
its cause is unconfirmed, and no independent runtime pass is claimed. The
[separate diagnostic checkpoint](https://github.com/djshellshoxxx/deckchek/blob/2c93d658f4703c863405064121c975f8679592eb/docs/engineering/FLEET_NATIVE_PHASE_MEASUREMENT_2026-11-20.md)
retains both observations, original logs and completed reviews. None of its
tooling is included in this Ledger source freeze.

PR #54's standard checks and ASan/Windows/stress jobs passed at the latest read;
cargo fuzzing and several desktop builds remained active. They qualify that
earlier candidate only. This combined Ledger source requires its own applicable
standard, nightly and desktop workflows. Read live refs/checks before a guarded
merge.

## Remaining work and successor handoff

Owner H-33 publishing/privacy inspection remains open despite guide verification
against official documentation. The corrections do not establish cross-tab
compare-and-set, crash/tab-close durability of unsaved edits, automatic recovery
of corrupt bytes, or an atomic transaction across a saved file and its history
row. A file can already exist when history fails; the UI reports the failure and
allows explicit retry without claiming a recorded revision. A never-settling
backend write can still hold reload open.

Physical H-00..H-33, real owner databases, reference accuracy, real
MIDI/VirtualDJ/WASAPI, mature vinyl/DVS, signing and release qualification remain
separate. Profile coverage remains software plan coverage. Preserve Fleet off,
the 20 MiB ZIP cap, permissions, thresholds, security gates and original branches.
No release, deployment, tag, deletion or history rewrite is included.

Keep the published candidate stable while checks run. Further useful work belongs
on separate owned branches with completed handoffs to fresh workers. The existing
continuation remains enabled. Credit balance is unavailable; unrelated tool,
disk, transport or CI errors do not establish credit exhaustion.
