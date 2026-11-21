# Quick Check main-pane follow-up

[Issue #81](https://github.com/djshellshoxxx/deckchek/issues/81) records the original
hosted PR #79 screenshot: at 420 pixels the header fits, but Quick Check content
extends beyond the main scroll container. The fixed PR head and original image
remain unchanged. Source review finds intrinsic grid minima, side-grid minimum
widths and a horizontal three-step control that can exceed the available pane.

The successor gives Quick Check a shrinkable single main track and, below 600
pixels, one-column inner grids, stacked step numbers/labels, wrapping text/buttons
and a full-width primary action. The disabled browser source keeps space above
its content for its badge. The correction is scoped to Quick Check; it does not
claim a responsive audit of every screen or change capture/analysis behavior.

The authored hosted smoke checks the actual main/screen scroll widths, source
cards, text, grids and action rectangles at 320/420/800/1440 pixels in browser and
native-model states. It checks the primary action after vertical scrolling and
retains top/action screenshots at both narrow widths. A native-model keyboard
source change must keep focus and fit its newly displayed file controls. Existing
toolbar checks remain. These are authored checks, not a claimed browser result.

Before the first gate, both source reviewers identified a coverage gap: the smoke
counted source/step/action nodes even if hidden. The successor counts measurable
visible controls, requires the expected selected source, and requires either its
visible duration selector or its file input and visible associated drop label.
The keyboard switch must produce the File controls. No product behavior changes
in this follow-up, and the original preparation was not executed.

The same successor improves the existing audio-session assertion's failure text
to retain the actual measured gain and selected playback level. The preceding
held run retained only true/false for that assertion. Analysis, fixture, threshold
and assertion condition are unchanged; there is no additional collector, engine
flag, numerical patch or diagnosis. Only the next authorized first gate may execute
it. Older outputs remain intact and #72 remains unresolved.

Fresh code, functional and static-defensive workers must finish their source and
first-evidence reviews. Full-suite and actual hosted rendering qualification remain
separate from the predecessor Mobile export focused pass and PR #79 gates.
