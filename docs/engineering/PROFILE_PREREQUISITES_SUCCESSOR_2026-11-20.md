# Device prerequisite completion: DJM-900NXS2 and S4 MK3

**20 November 2026 — America/Vancouver.** Worker:
`/root/code_profile_successor`. Frozen starting source:
`7e362e64ee00af6110f04511382af0c77296eb7e`.

This bounded successor implements two newly supported USB MIDI facts. It changes
two existing profiles, their provenance, the generated coverage matrix and
focused regression tests. Root owns independent acceptance, combined
qualification and publication. No runtime planner, migration, native command,
dependency, feature flag or threshold is changed.

## Resulting behavior

| Profile | Recorded fact | Planning result |
| --- | --- | --- |
| Pioneer DJ DJM-900NXS2 | `connectivity.midi.usbMidi: true`; direct manufacturer FAQs establish USB MIDI transmission to computer DJ software | The three generated MIDI checks use the existing confirmed-USB prerequisites instead of an unknown-transport condition. The existing instruction to select an output only for documented receiving support remains. |
| Native Instruments TRAKTOR KONTROL S4 MK3 | `connectivity.midi.usbMidi: false`; NI excludes MK3 from supported controller MIDI mode | `din` stays unknown, so conformance, coverage and timing remain conditional with unknown-transport guidance and explicit output selection. |

The matrix remains **45 profiles, 506 handwritten checks, 187 generated checks
and zero gaps**. Conditional MIDI falls from three profiles/nine requirements to
**two profiles/six requirements**: Ecler WARM2 and S4 MK3. Conditional audio remains
**22 profiles**. These are planning counts, not completed device tests.

All prior handwritten tests, certificate identities, profile IDs, original
specifications and source objects are preserved. Learned maps remain incomplete.
Neither update establishes DIN, receiving support, Identity replies, USB IDs,
class compliance, USB audio formats/counts, firmware or real host/device behavior.

## DJM-900NXS2 primary evidence

The manufacturer's normal article pages could not be read by the web-fetch
tool. Its public Help Center JSON responses were retrieved directly on
2026-11-20. Both answers have generic titles, so the product hierarchy was
independently read before applying them to the profile.

| Article | Retrieved title evidence | Body evidence applied | Response update |
| --- | --- | --- | --- |
| [4405820145049](https://pioneer-support.zendesk.com/hc/en-us/articles/4405820145049) / [public response](https://pioneer-support.zendesk.com/api/v2/help_center/en-us/articles/4405820145049.json) | “I would like to use my DJ software…” | Explicitly distinguishes USB MIDI from the audio-card function and refers to the operating instructions for MIDI operation. | 2022-08-26 09:17:23 UTC |
| [4405820176409](https://pioneer-support.zendesk.com/hc/en-us/articles/4405820176409) / [public response](https://pioneer-support.zendesk.com/api/v2/help_center/en-us/articles/4405820176409.json) | “What can I do by connecting this unit and a computer by USB?” | Its final item describes transmitting MIDI to control computer DJ software. Only this direction is applied; the mixed-direction introductory sentence does not qualify reception. | 2022-08-26 09:16:31 UTC |

Verified parent chain:

1. Both articles report `section_id: 4405820139161`, **PC/Mac & DJ Software**.
2. Its parent `4405820136217` is **Connecting Devices & DJ Software**.
3. Its parent `4416497253657` is **Support**.
4. Its parent [`4416490599449`](https://pioneer-support.zendesk.com/api/v2/help_center/en-us/sections/4416490599449.json)
   is explicitly named **DJM-900NXS2**.

The named DJM-900NXS2 recognition article `4405873813145` belongs to the same
PC/Mac section, providing a corroborating scope check. Article metadata dates
are source revisions, not qualified driver or firmware dates.

For reproducibility, SHA-256 values of the retrieved raw public JSON responses:

| Response ID | SHA-256 |
| --- | --- |
| `4405820145049` | `92b0d6973662bd6b8b5a2044812f2d62438bd74dec783e9bf16d468c5cb6b3c0` |
| `4405820176409` | `f6dbea4b981d72f9545d02347d72f112933d7229aff5def113a905854edf1fbb` |
| `4405820136217` | `5a89af6f9fc31a657ae1d66479c868aaf30298d5d52150ea4a1b667b3da8c717` |
| `4416497253657` | `38049b22b4009d4777aa45c93bdad4c920258af44b935f2786c39a8c52695fea` |
| `4416490599449` | `a1651f7dd215cd92b90259f613c1785034e14032196a62e79d965490d11e61fa` |

These hashes identify observed responses; changing service metadata can change
them. The source-derived capability uses the article content and exact-model
parent chain, not an assumption that a future response will have the same hash.

## S4 MK3 primary evidence and inference

The current [NI MIDI-mode support article](https://support.native-instruments.com/support/solutions/articles/69000880031-native-instruments-switching-your-controller-to-midi-mode)
states that controllers not in its table cannot enter MIDI mode. The table
distinguishes S4 MK1 and MK2; MK3 is absent. The exact MK3
[manual](https://docs.native-instruments.com/pdf-guides/traktor/TRAKTOR_KONTROL_S4_MK3_Manual_English_0719.pdf),
section 4.1, documents its USB computer connection. Applying NI's explicit
exclusion to that connection yields the narrowly scoped absence of supported
USB MIDI controller mode. This is an inference from the manufacturer's stated
rule and model-specific connection, not an inference from an ordinary incomplete
product list. No revision date was exposed for the support article.

The old product URL redirects to a generic collection; its cached search excerpt
was not used as current evidence. The S4's DIN field remains `null`. A lack of
controller MIDI mode does not establish absence of every software conversion,
native-control feature or possible future firmware behavior.

## Unresolved research

The old DJM DRI1300A viewer and proposed direct operating-manual path remain
unavailable in this run; no full-manual retrieval is claimed. The newly retrieved
manufacturer FAQs provide the required direct transport evidence independently.
The Serato connection guide was a discovery lead, not the basis for the new fact.

Ecler WARM2 remains unchanged. Its recorded manual connector inventory does not
supply the explicit transport absence required by the existing research contract.
No DIN or USB field was set false to reduce the conditional count. Brief fallback
audio-source searches did not produce a sufficiently scoped new fact and caused
no additional profile edit.

## Verification

| Scope | Result |
| --- | --- |
| New S4 tests before the profile edit | 1 passed, 2 failed; missing exclusion and provenance correctly detected |
| Updated DJM provenance/plan scope before the profile edit | 8 passed, 3 failed; missing transport, fact and planning transition detected |
| Final six-file profile/planner/preservation scope | **108 passed, zero failed, zero skipped or cancelled**, Node **v24.22.3**, 509.716777 ms |
| Device index | `node tools/build-device-index.mjs --check` passed; index unchanged |
| Generated coverage | Regenerated with the tool's own `--markdown` write; `--check` passed |
| Changed-test syntax and whitespace | Four JavaScript files passed `node --check`; `git diff --check` passed |

The final focused run includes the new S4 cases, existing S4 and DJM provenance
cases, the entire earlier transport-batch preservation suite, actual device-plan
tests and research-profile checks. Original profile fingerprints remain intact:
the two documented additions are explicitly reversed before comparison with
their previous raw-byte hashes. Assertions for the two new source-derived fields
are strengthened separately; no original handwritten object or unrelated value
is dropped from preservation coverage.

The first post-edit run had **107 passes and one failure** because this worker
incorrectly redirected a generator that already writes its target, corrupting
the generated matrix header with console text. Running the documented generator
without redirection corrected that artifact; the final run above is separate
evidence. A subsequent ad-hoc count script initially imported `coverageMatrix`
from the CLI instead of its exporting module; that invocation failed before
running and the corrected module import produced the counts recorded above.
Neither issue required a production-code change or a relaxed assertion.

No full application suite, browser/native build, hardware execution or remote
write was performed by this worker. Root must bind combined qualification to the
integrated tree rather than transfer earlier hosted results to these new bytes.

## Fresh reviewer handoff

Independently retrieve the public DJM article responses and full parent chain;
check NI's explicit exclusion rule and exact MK3 connection. Review the actual
planner transition: DJM follows the existing USB policy, whereas S4 remains
conditional and retains deliberate output selection. Keep receiving/Identity and
hardware qualification separate from transport availability. If accepted, root
can integrate this branch and update current status counts; root-owned TODO and
continuation files were intentionally not edited here.
