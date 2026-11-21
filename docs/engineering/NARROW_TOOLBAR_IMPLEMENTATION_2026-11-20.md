# Narrow toolbar and player guide successor

Review date: 20 November 2026, America/Los_Angeles.

## Observed defects

The actual hosted #74 screenshots at 420 by 900 pixels show shared toolbar
controls overlapping the calibration chip. The player form/result content
wraps, and the existing no-document-overflow assertion passes, so that assertion
does not cover internal control overlap. The desktop player screenshot also
shows the preceding Quick Check guide, including shortcuts for that workflow.

Original screenshots and complete source-bound hosted evidence are retained in
[the UI observation](evidence/audio-numerical-integration-2026-11-20/pr74-ui-observation.json).
They belong to fixed #74, not to this correction. Its head is unchanged.

## Change

The shared header can wrap within a content-sized grid row below 940 pixels.
Device controls keep their button widths; at 600 pixels and below, the input
and refresh action share a row while rate/calibration can wrap. The content row
starts below the entire header. The input and rate selects receive explicit
accessible names independent of their visually hidden short labels.

Player capture replaces the inspector content when shown, using the existing
inspector API without opening a closed panel. Its guide explains provisional
capture, local reference identity, metadata export and the implemented Escape,
Ctrl+E and I shortcuts. It does not advertise the previous workflow's Space
capture shortcut or report export.

## Verification authored, not executed here

The new auto-discovered `tools/smoke/shell-layout.mjs` checks all eight header
controls in real browser and modeled-native contexts at 320, 420, 800 and 1440
pixels. It checks presence, target size, bounds, pairwise overlap, center-point
coverage, calibration-chip containment, content position and document overflow.
It verifies accessible select names, includes a long native input label, and
retains 420/1440 screenshots. The player smoke also verifies the contextual guide.

Root performed static diff/whitespace review only. The audio functional worker
remains the sole project executor during its current round; no UI test or
browser run is claimed for this successor. The earlier local Chromium socket
denial is unchanged and will not be retried or bypassed. Fresh UI code,
functional and defensive review and actual hosted rendering remain necessary.

This branch includes the held reference/PDF source as its base. None of these
presentation changes explains or repairs the original audio failures. Source
qualification, original #72 evidence, #69/AC-6, default-off experimental flags,
capture ownership, metadata-only retention, thresholds, native permissions and
scientific/physical gates remain unchanged.
