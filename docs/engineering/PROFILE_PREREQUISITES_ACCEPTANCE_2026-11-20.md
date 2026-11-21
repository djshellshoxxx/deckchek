# Independent profile-prerequisite acceptance — 20 November 2026

Reviewer: `/root/profile_fresh_acceptance`. User-facing date uses
America/Vancouver. This worker did not author the capability changes.

## Sources and disposition

| Scope | Commit / tree |
| --- | --- |
| Starting source | `7e362e64ee00af6110f04511382af0c77296eb7e` |
| Author's two-profile update | `c05ad30caa15f6dc425e44327dcc5270227ad40e` / `38568d343b308b206d43517b2e1cffc4554d6f4a` |
| Independently checked source after wording clarification | `89b501534e2349964515264e3b885f5f5ba24eac` / `2223c23842e18416a02ec9f3a1683ae1f7094f41` |

**ACCEPT_FOR_INTEGRATION within the documented profile/planning scope.** No
behavioral or evidence blocker was identified. One minor clarity finding was
corrected in the separately committed wording change above. This report itself
does not change the executed application or test bytes.

## Standards

Reviewed the fixed diff, relevant development-plan sections 1.1, 1.2 and 1.4,
profile conventions and original-object preservation tests. No hard source
standard violation or actionable structural smell was identified. The update
remains data/provenance work; it adds no runtime abstraction, dependency,
permission, migration, threshold or feature-flag change.

The original S4 paragraph still described all MIDI transport as unverified just
before the new supported-USB-mode conclusion. The clarification names **DIN MIDI
and exact control maps** as the remaining uncertainties. Capability values and
planning behavior are unchanged. Both preservation tests reverse precisely that
wording change before checking the complete original profile fingerprint, so the
correction does not drop an original-object assertion.

## Spec and evidence

The applicable contract is [FS-34 sections 3–5](../specs/34-device-test-completeness.md):
transport facts remain distinct from generic applicability; unknown DIN is not
converted to false; automatic tests preserve handwritten/certificate requirements;
and generated checks without confirmed USB retain deliberate output selection.

### DJM-900NXS2

Independently retrieved both public manufacturer article responses and every
parent in the exact-model chain on 20 November 2026:

| Evidence | Independent assessment |
| --- | --- |
| [Article 4405820145049](https://pioneer-support.zendesk.com/api/v2/help_center/en-us/articles/4405820145049.json) | Explicitly documents a USB MIDI interface separately from the audio-card function. |
| [Article 4405820176409](https://pioneer-support.zendesk.com/api/v2/help_center/en-us/articles/4405820176409.json) | Its final item describes MIDI transmission for controlling DJ software on the computer. No receiving or Identity capability is inferred from its mixed-direction introduction. |
| [PC/Mac section 4405820139161](https://pioneer-support.zendesk.com/api/v2/help_center/en-us/sections/4405820139161.json) | Both articles name this section; its parent is `4405820136217`. |
| [Connection section 4405820136217](https://pioneer-support.zendesk.com/api/v2/help_center/en-us/sections/4405820136217.json) | Parent is `4416497253657`. |
| [Support section 4416497253657](https://pioneer-support.zendesk.com/api/v2/help_center/en-us/sections/4416497253657.json) | Parent is `4416490599449`. |
| [Product section 4416490599449](https://pioneer-support.zendesk.com/api/v2/help_center/en-us/sections/4416490599449.json) | Explicit product name is DJM-900NXS2. |

The two independently fetched article SHA-256 values are
`92b0d6973662bd6b8b5a2044812f2d62438bd74dec783e9bf16d468c5cb6b3c0`
and `f6dbea4b981d72f9545d02347d72f112933d7229aff5def113a905854edf1fbb`,
matching the author's recorded responses. Both article updates are dated
26 August 2022; that is source metadata, not current driver/firmware qualification.

This supports `usbMidi: true`. The three generated tests correctly lose only
their unknown-transport condition and use the existing confirmed-USB policy.
The shared instruction still requires a documented receiving connection before
selecting an output. That existing pairing policy does not establish receiving
support or a physical-device identity.

### TRAKTOR KONTROL S4 MK3

Independently reopened the current [NI MIDI-mode support article](https://support.native-instruments.com/support/solutions/articles/69000880031-native-instruments-switching-your-controller-to-midi-mode).
It explicitly excludes unlisted controllers from MIDI mode; its table
distinguishes S4 MK1 and MK2 but omits MK3. The exact [MK3 manual](https://docs.native-instruments.com/pdf-guides/traktor/TRAKTOR_KONTROL_S4_MK3_Manual_English_0719.pdf)
identifies the hardware revision and describes its USB computer connection in
section 4.1, printed page 12 (PDF page 15).

The absence of **supported USB controller MIDI mode** is a bounded inference
from that explicit manufacturer rule and connection. It is not inferred from an
ordinary incomplete list or the redirecting product page. The profile/provenance
keeps this scope visible; software translation and future firmware are not
qualified. DIN stays `null`, so all three generated MIDI requirements remain
conditional and conformance retains explicit output selection. No generic
all-MIDI-absent conclusion is introduced.

### Preserved behavior and counts

Actual planner and certificate/preservation checks retain the original IDs,
handwritten test objects, incomplete learned maps, audio unknowns, USB identity
unknowns and unrelated profile fields. Ecler WARM2 remains unchanged.

An independent planner count produced **45 profiles, 506 handwritten checks,
187 generated checks, zero gaps and 22 conditional-audio profiles**. The two
remaining conditional-MIDI profiles are WARM2 and S4 MK3, with **six** requirements.
These are plan-coverage counts, not executed hardware-test results.

## Verification

Executed after the wording correction using task Node **22.23.4**:

| Check | Result |
| --- | --- |
| Four-file planner/provenance/preservation scope | **100 passed, 0 failed, 0 skipped, 0 cancelled**; 712.378215 ms |
| Device index | Current; `--check` passed |
| Generated coverage | Current; `--check` passed |
| Two changed-test syntax checks | Passed |
| Whitespace | Passed |

The four files were `researched-djm450-900-provenance.test.mjs`,
`researched-s4-midi-mode.test.mjs`, `researched-transport-batch.test.mjs` and
`device-test-plan.test.mjs`. This overlaps the author's 108-case Node 24 scope;
the counts must not be added together. No new test case was necessary for a
wording-only correction. The retained log SHA-256 is
`f216ff138baa65ca747521fd0d1fa6aa7c162c43489392dccc39443253e82e16`.

No full application suite, browser/native build, firmware test, physical MIDI
probe, scanner or remote mutation was performed. Root owns combined-source
qualification and publication. The small note correction was authored by this
reviewer; independent acceptance applies to the original capability change,
while its follow-up wording and preservation-test adjustment remain explicit.

## Handoff

Integrate the clarification commit and this report after the author's update.
Record `/root/profile_fresh_acceptance` as the independent source reviewer for
the capability change. Refresh final combined tests and applicable hosted gates;
no preceding ZIP or Devices result qualifies the new profile bytes. Preserve
unknown DIN/receiving/Identity/hardware facts and the separate physical gates.

**Standards:** zero hard violations; one minor wording finding corrected.
**Spec:** zero unresolved findings in the bounded two-profile update.
