# DeckChek GUI Design Research and Spec

Context: Tauri 2, Windows, system fonts only, CSP forbids remote assets. Users are DJs and technicians in dim booths, wearing headphones, records spinning, often one hand free. Design target: glanceable verdicts at arm's length, calm dark UI, zero reliance on colour alone, fully keyboard operable.

## 1. Key principles

- **Verdict before data.** Lead with a one-line pass/review/fail summary, then metrics, then raw evidence (progressive disclosure). Source: dashboard/diagnostic UX practice; NN/g progressive disclosure.
- **Colour is never the only signal.** Pair every status with icon + word + (where sensible) shape. Source: WCAG 2.2 SC 1.4.1; Okabe-Ito colour-universal-design guidance.
- **Meters use dBFS with fast-attack, slow-release ballistics.** Peak: ~0-10 ms attack, ~1.5 s release (ITU-R BS.1770 true-peak style); PPM Type II: 10 ms attack / 2.8 s release; VU: 300 ms integration. Source: IEC 60268-10/-18, BS.1770-4.
- **Clip indicators latch.** A transient over would otherwise be missed; clear manually. Source: standard DAW/console practice (Ableton, FabFilter Pro-L, Serato).
- **Large, tabular, unit-bearing readouts.** Test instruments show one dominant number with unit and tolerance band beside it. Source: Fluke handheld DMM and Audio Precision APx layouts.
- **Pre-flight, capture, result as separate stages.** Instrument UIs separate setup from measurement so the measurement view stays uncluttered. Source: REW (measure/analyse split), Smaart (input/measurement setup then live view).
- **Dense, panelled workspace with an inspector.** Selection drives a context panel instead of modal dialogs. Source: Ableton Live detail view, Bitwig inspector, iZotope RX.
- **Targets: 24x24 CSS px is the WCAG floor; we use 32 min and 44 for primary.** Larger targets are faster (Fitts's law) and forgiving with a gloved or turntable-adjacent hand. Source: WCAG 2.2 SC 2.5.8; Fitts 1954.
- **Focus indicator at least 2 px with 3:1 contrast.** Source: WCAG 2.2 SC 2.4.11/1.4.11 (focus appearance guidance).
- **Keyboard-first with visible shortcuts.** Frequent actions get one-key shortcuts shown in tooltips and menus. Source: Ableton/Bitwig/rekordbox workflows; Fitts-law and expert-mode UX.
- **Low-light dark theme: off-black, off-white, desaturated accents.** Pure #000/#FFF causes glare and halation; avoid large bright areas. Source: Material dark-theme guidance, Apple HIG dark mode; booth use.
- **Motion is informative only and honours reduced motion.** Source: WCAG 2.3.3, `prefers-reduced-motion`.
- **Raw evidence is always reachable.** Show the plot/data behind every verdict so technicians can overrule it. Source: REW, Smaart, RX Insight transparency conventions.

## 2. Information architecture

**App shell** (min window 1100x700, designed at 1440x900):

```
+------+--------------------------------------------+-----------+
| Rail | Header: workflow title - device - status   | Inspector |
| 72px |--------------------------------------------| 320px     |
|      | Stepper (Setup > Capture > Results)        | (collapse |
| icons|--------------------------------------------|  to 0)    |
| +    | Main canvas                                |           |
| labels|                                            |           |
|      |--------------------------------------------|           |
|      | Footer: meters strip - input device - Rec  |           |
+------+--------------------------------------------+-----------+
```

- **Left nav rail** (72 px, icon above 12 px label, always labelled): Quick Check, Speed & Pitch, Cartridge, DVS, Vinyl Scan, Calibration, Equipment, History/Reports. Settings and Help pinned at bottom. Alt+1..8 jumps to each.
- **Persistent footer meter strip**: stereo input meter, selected input device, sample rate, and a capture button, so signal presence is visible on every screen.
- **Guided flow** per workflow: 1 Setup (select input, gain-stage with live meter, checklist: stylus clean, correct test record/side, speed set), 2 Capture (big timer, live meter, progress, Space start/stop, Esc cancel), 3 Results.
- Setup cannot advance until signal level is within window (-18 to -3 dBFS peak) or the user overrides with explicit "Continue anyway" (logged).
- **Results layout**, top to bottom: (a) verdict banner: status chip + one sentence + recommended action; (b) metric cards grid (big numbers with tolerance and per-metric chip); (c) evidence section (plots: wow/flutter trace, FFT, channel balance, timecode Lissajous) collapsed by default except the single most relevant; (d) actions: Export, Re-run, Save to History, Compare.
- **Right inspector** (320 px, toggle I): shows details of the selected metric or plot point: definition, measured value, tolerance, why it matters, suggested fixes, raw numbers. Below 1280 px width it becomes an overlay drawer.
- **History/Reports**: table (date, workflow, equipment, verdict, key metric), side-by-side compare, export PDF/CSV/JSON.
- **Equipment**: turntable, cartridge, mixer profiles; each result is tied to a profile for trend tracking.

## 3. Design system

### Colour tokens (hex values contrast-checked, WCAG relative luminance)

```css
:root {                         /* DARK default */
  color-scheme: dark;
  --bg:        #0E1013;
  --surface:   #171A1F;
  --raised:    #1F2329;
  --divider:   #2A3039;         /* decorative only */
  --border:    #6B7482;         /* controls: >=3.4:1 on all surfaces */
  --text:      #E8EAED;         /* 15.8 / 14.5 / 13.1 */
  --text-muted:#A4ABB6;         /* 8.2 / 7.5 / 6.8 */
  --text-faint:#8A92A0;         /* disabled/hint, >=4.5 on bg+surface; never for essential text */
  --accent:    #5AA9FF;         /* 7.8 / 7.1 / 6.4 */
  --on-accent: #0E1013;
  --focus:     #FFD166;         /* 2px ring + 2px offset; >10:1 on surfaces */

  --pass:      #38C793;  --pass-bg:   #12302A;
  --review:    #B79CFF;  --review-bg: #251F3F;
  --warn:      #F5B731;  --warn-bg:   #3A2E0E;
  --fail:      #FF6F61;  --fail-bg:   #3F1B19;
  --info:      #6CB6FF;  --info-bg:   #14293D;

  --meter-low: #38C793; --meter-mid: #F5B731; --meter-hi: #FF6F61;
  --clip:      #FF3B30;
  --scrim:     rgb(0 0 0 / .6);
}
:root[data-theme="light"] {
  color-scheme: light;
  --bg:#F5F6F8; --surface:#FFFFFF; --raised:#EEF0F3; --divider:#D9DDE3;
  --border:#7A8392;             /* 3.4-3.8:1 */
  --text:#14171C;               /* 16.6 / 18.0 / 15.7 */
  --text-muted:#4B5361;         /* 7.2 / 7.8 / 6.8 */
  --text-faint:#5F6775;
  --accent:#0B5FCC; --on-accent:#FFFFFF;   /* 5.5-6.0 */
  --focus:#7A3E00;
  --pass:#0B7A55;  --pass-bg:#DDF3EA;      /* 4.7-5.3 */
  --review:#6B3FD0;--review-bg:#EBE4FB;    /* 5.7-6.5 */
  --warn:#8A5A00;  --warn-bg:#FBEFD0;      /* 5.2-5.9 */
  --fail:#B3261E;  --fail-bg:#FBE0DD;      /* 5.7-6.5 */
  --info:#0B5FCC;  --info-bg:#DCEBFC;
  --meter-low:#0B7A55; --meter-mid:#B07600; --meter-hi:#B3261E; --clip:#D4170C;
  --scrim: rgb(20 23 28 / .45);
}
@media (prefers-color-scheme: light) { :root:not([data-theme]) { /* mirror light block */ } }
```

Rule: dark is default when no user preference is stored; follow OS only if the user picks "Auto". Offer a "Booth" mode (dark with all accents dimmed 15% and brightness-capped) as an option.

**Colour-blind safety.** Hues are chosen along blue / bluish-green / amber / vermillion axes (Okabe-Ito family), and "review" is purple/blue so it never sits on the red-green confusion axis. Each status has a unique icon silhouette and word: Pass = circle-check, Review = eye/circle-question, Warn = triangle-exclamation, Fail = octagon-X, Info = circle-i. Text labels always: "PASS", "REVIEW", "WARNING", "FAIL", "INFO". Simulate deuteranopia/protanopia/tritanopia in CI screenshots.

Severity meaning: **Pass** within spec. **Review** within a marginal band or low-confidence reading; human judgement needed. **Warn** out of ideal but usable. **Fail** out of spec or hardware fault. **Info** neutral.

### Typography (system stack only)

```css
--font-ui:   "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;
--font-mono: "Cascadia Mono",Consolas,"Courier New",monospace;
--num: font-variant-numeric: tabular-nums slashed-zero;
```

Scale (px / line-height): caption 12/16, body-sm 13/18, body 14/20, label 13/16 (600, +0.02em), h3 16/22 (600), h2 20/26 (600), h1 26/32 (600), readout-m 32/36, readout-l 56/60, readout-xl 80/84 (Segoe UI Variable Display, 600, tabular-nums). Minimum body size 13 px; no text below 12 px. Units set in `--text-muted` at 50% of numeral size, baseline aligned.

### Spacing, radii, elevation

- Spacing (4 px base): 2, 4, 8, 12, 16, 24, 32, 48. Card padding 16; section gap 24; gutter 16.
- Radii: 4 (inputs, chips), 8 (cards, buttons), 12 (modals, drawers), 999 (pills).
- Elevation: in dark, elevation is expressed by surface lightness (bg < surface < raised) plus 1 px `--divider` border; shadows only on overlays: `0 8px 24px rgb(0 0 0 / .5)`. Light: `0 1px 2px rgb(0 0 0 / .08)` cards, `0 8px 24px rgb(0 0 0 / .16)` overlays.
- Motion: 120 ms ease-out for hover/focus, 200 ms for drawers/modals; none under `prefers-reduced-motion` (replace with instant or opacity-only).

## 4. Component specs

**Stereo level meter**
- Vertical (footer strip horizontal variant). Scale in dBFS: ticks and numeric labels at 0, -3, -6, -12, -18, -24, -36, -48, -60; range -60 to 0; labels 12 px tabular.
- Segmented bar (2 px gap, 3 dB per segment) in three zones: below -18 `--meter-low`, -18 to -6 `--meter-mid` gradient transition, above -6 `--meter-hi`. Inactive segments at 12% opacity. Zones are also distinguished by tick labels and position, not only colour.
- Ballistics: peak with instant attack, 1.5 s release (≈20 dB/s fall). Peak-hold line at 1.5 s, then falls with release. Optional RMS bar (300 ms window) drawn narrower inside the peak bar.
- Numeric peak readout above each channel ("-4.2"), updated at ≤10 Hz to stay readable. Shows "-inf" under -90.
- Clip indicator: square above each channel; lights at >= -0.1 dBFS or 3 consecutive full-scale samples; latches until click or Ctrl+Shift+C; also shows icon + "CLIP" text and fires a polite live-region message once.
- Channel labels L/R, ARIA `role="meter"` with `aria-valuenow`, min/max, and text value; throttle announcements.
- Render on canvas at 60 fps; DOM only for labels.

**Big numeric readout**: label (caption, muted) above; value (readout-l, tabular) centre; unit beside; status chip and tolerance ("target 33.33 +/- 0.5 %") below. Min card 200x120. Value colour stays `--text`; status conveyed by chip and a 4 px left border in status colour, not by recolouring digits alone.

**Status chip**: 24 px high (non-interactive), 13 px/600 uppercase, icon 16 px + label, `--*-bg` fill, `--*` text and 1 px border. Interactive chips are 32 px.

**Step wizard**: horizontal stepper at top (numbered circles 28 px, connector lines). States: done (check icon), current (accent ring + bold), upcoming (muted), error (X icon). Footer holds Back (secondary) and Next/Start (primary, 44 px, right). Clicking completed steps navigates back; future steps are disabled with `aria-disabled`. Announce "Step 2 of 3: Capture" on change.

**Cards**: `--surface`, 8 px radius, 1 px `--divider`, 16 px padding; header row (title + optional chip + overflow menu). Collapsible evidence cards use a button header with `aria-expanded`, 44 px high.

**Empty state**: icon (48 px, muted), headline, one-sentence explanation, one primary action ("Run Quick Check"). Never a blank panel.

**Error / device failure**: inline banner at top of main canvas, `role="alert"`, status Fail style, naming the failure plainly ("No signal on Input 1/2 for 5 s. Check the cable from the mixer REC OUT, and that the correct input is selected in Windows."), with actions: Retry, Choose input, Copy diagnostics. Device unplugged mid-capture: stop capture, keep partial data, state what was saved. Never lose a result silently.

**Toasts**: bottom-right, 5 s for success/info (pause on hover/focus), persistent for errors with Dismiss; max 3 stacked; `role="status"` (errors `role="alert"`); never the only record of something important (also logged in History).

**Tooltips**: appear on hover after 400 ms and on keyboard focus immediately; Esc dismisses; include shortcut hint right-aligned ("Start capture  Space"); no essential information only in tooltips; max width 280 px.

**Modal / drawer focus rules**: native `<dialog>` where possible; move focus to the first meaningful control (or title for destructive confirmations: focus the safe action); trap Tab; Esc closes (unless capture-critical, then confirm); restore focus to trigger on close; background `inert`; scrim click closes non-destructive dialogs only. Drawer (inspector overlay) follows the same rules; docked inspector is a normal landmark (`aside`) without trap. Modals only for destructive confirmation, export options, and first-run; everything else is inline.

## 5. Interaction and accessibility rules

**Shortcuts** (shown in tooltips; remappable later; ignored while typing in inputs):

| Key | Action |
|---|---|
| Space | Start/stop capture (when on Capture step) |
| Esc | Cancel capture / close overlay / deselect |
| Enter | Next step / confirm primary |
| Backspace or Alt+Left | Previous step |
| Ctrl+E | Export report |
| Ctrl+S | Save result to History |
| Ctrl+R / F5 | Re-run last test |
| Ctrl+1..8 or Alt+1..8 | Switch workflow |
| I | Toggle inspector |
| M | Mute monitor output (if enabled) |
| Ctrl+Shift+C | Clear clip latches |
| Ctrl+, | Settings |
| ? or F1 | Shortcut cheat sheet |
| Ctrl+Shift+T | Toggle theme |

**Rules**
- Focus-visible: 2 px `--focus` ring with 2 px offset on every interactive element, never `outline: none` without replacement. Logical tab order follows reading order; rail, stepper, canvas, inspector are landmarks (`nav`, `main`, `aside`) with skip links.
- Target size: all pointer targets >= 32x32 CSS px (WCAG minimum is 24); primary actions (Start, Next, Export) >= 44 px high and at least 120 px wide; 8 px minimum gap between adjacent targets. Place Start/Stop at a fixed, large location (bottom right) and repeat it in the footer strip.
- Contrast: text >= 4.5:1, large text and UI boundaries/icons >= 3:1 in both themes, including meter segments and plot lines (plot lines also use distinct dash patterns and direct labels).
- Live regions: results verdict and error banners in `aria-live="polite"` (`assertive` only for device failure); announce once when state changes, not per frame. Meter values excluded from live regions.
- Reduced motion: disable meter smoothing animations of decoration only (meter data stays live), stop pulsing indicators, instant transitions.
- Text scaling to 200% without clipping; layout reflows at 1100 px window width; no information in hover only.
- Optional audible cues (tick on capture start/end, distinct fail tone), off by default since users wear headphones and tones could play into monitoring.
- Autosave captured data before showing results; confirm before discarding unsaved results.
- Error text states cause, consequence, and next step.

## 6. Do / Don't

**Do**
1. Show the verdict and recommended action first, evidence last.
2. Pair every status colour with icon and text label.
3. Keep a persistent input meter visible on all screens.
4. Make primary actions 44 px, keyboard-reachable, and bound to Space/Enter.
5. Use tabular numerals and fixed-width readout slots so digits do not jitter.
6. Latch clip indicators and require explicit reset.
7. Offer a plain-language explanation and fix suggestion in the inspector for every metric.
8. Provide dark default with off-black background and a full light theme.
9. Preserve partial data and say exactly what was saved on any failure.
10. Test with simulated colour-blindness, 200% text, and keyboard only.

**Don't**
1. Don't use red/green alone to distinguish pass from fail.
2. Don't use pure #000 backgrounds or #FFF text in dark mode.
3. Don't load web fonts, CDNs, or remote icons (CSP); inline SVG icons only.
4. Don't animate meters in ways that hide real peaks (no slow attack).
5. Don't hide essential info in tooltips or hover states.
6. Don't use modals for routine steps or results.
7. Don't recolour the number itself as the only severity cue; use chips and borders.
8. Don't auto-dismiss errors or the only record of a result.
9. Don't bury raw data; every verdict links to its underlying plot/values.
10. Don't use targets under 32 px or place destructive actions adjacent to primary ones without spacing and confirmation.

## Sources consulted

- WCAG 2.2 / What's New: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ ; WebAIM WCAG 2.2: https://webaim.org/standards/wcag/wcag22
- Meter standards (IEC 60268-10/-18, BS.1770-4 ballistics): Tape Op meters, Lawo bargraph settings docs (docs.lawo.com), Sound on Sound.
- Okabe-Ito palette (#E69F00, #56B4E9, #009E73, #0072B2, #D55E00, #CC79A7) and status-indicator guidance (icon + label + colour).
- Product conventions (REW, Smaart, iZotope RX/Insight, FabFilter, Ableton, Bitwig, Serato/rekordbox, Fluke, Audio Precision) are from the author's working knowledge of those UIs, not fetched this session; verify against current versions before citing externally.
