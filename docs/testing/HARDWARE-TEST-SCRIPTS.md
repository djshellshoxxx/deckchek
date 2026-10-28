# Hardware test scripts

Status: draft for owner review (M5 scripts; M6 scripts H-10, H-12, H-13 and H-14 added). Scope: the manual hardware steps from the feature specs' §8 that belong to milestones M5 and M6, plus the baseline rig check they all depend on. Plan reference: [`docs/DEVELOPMENT-PLAN.md`](../DEVELOPMENT-PLAN.md) §1.1 and §2 ("Manual hardware scripts"). Results are recorded per release in [`docs/testing/results/`](results/README.md).

## 1. How to use this document

- Run **H-00 (baseline)** once per rig and once per release. Then run each script for the features the release ships.
- Each script is a numbered list of steps. Each step has four parts: **Action** (what you do), **Expected** (what you must see), **Record** (where the observed value goes), and a result of PASS, FAIL, or SKIP (with a reason).
- A FAIL is not a silent failure. Write it into the release results file, open an issue, and (plan §2, regression rule 3) make a synthetic fixture for it if the failure can be reproduced in software.
- A script is complete when every step is PASS, or FAIL/SKIP with a written reason that the owner has accepted. Release gate: H-00 and every script for a shipped feature must be complete. Waivers are written in the results file, signed by the owner.
- Do not record serial numbers, Windows usernames, or full profile paths in any results file. Those are committed to the repository and may be public (see [`results/README.md`](results/README.md) §4).

Where a spec gives a number, the script uses it. Where a spec gives no number, the step says "record the observed value" and the owner sets the tolerance in H-00 step 9. Those open numbers are listed in section 9.

- Steps labelled **Cn** (for example `H-14/C1`) are calibration steps. They exist because the spec leaves a threshold UNKNOWN or a tunable default. They record measurements only. The owner sets the final value in a separate job and writes it in H-00 step 9. Record them in the same results file, under the script ID.

## 2. Gear

| Role | Gear | Notes for the script |
|---|---|---|
| Turntable | Technics SL-1200MK4 | Cartridge model recorded in H-00. |
| USB turntable | Pioneer PLX-CRSS12 | Its USB audio and any MIDI behaviour are not verified yet (spec 32 lists it as UNKNOWN). Record what the OS and DeckChek see. |
| Audio interface | Traktor Audio 8 DJ | Primary capture and output device for the M5 scripts. Driver version recorded in H-00. |
| Mixers | Rane Twelve MK2; Allen & Heath Xone:23C; Pioneer DJM-A9 | DJM-A9 USB audio class behaviour is UNKNOWN (spec 31). Record the mixer's switch positions (phono/line, ground) in each script. |
| Controller | Pioneer DDJ (model TBC) | Model to be confirmed by the owner in H-00 step 4. Scripts that mention "DDJ" are blocked until then. |
| Control vinyl | Traktor Scratch MK2 (carrier 2.5 kHz); Serato CV02.5 (carrier 1 kHz) | Use a spare copy for stress tests. Do not use your best record. |
| Monitors | Pioneer monitors (or your normal speakers) | Keep master low for every feedback or tone step. |

Safety, applies to every script:
- Turn the monitor volume down before any tone, loopback, or feedback step. A loopback chirp is loud.
- Use a spare control vinyl for any test that involves skipping, scratching or stress.
- Stop immediately if the stylus skips into a groove. Lift the arm, do not keep running the test.
- Never run a test on the owner's main Windows profile when a step says "fresh profile". Use a second Windows user account for first-run tests.

## 3. Script index

| ID | Feature spec | Covers | Needs |
|---|---|---|---|
| H-00 | Baseline (FS-00 and rig) | Rig inventory, known-good run, tolerances | All gear above |
| H-01 | FS-01 first-run wizard | First-run, test tone, calibration, ownership, failure and resume | Audio 8 DJ, mixer line input, SL-1200MK4, PLX-CRSS12, DJM-A9 |
| H-02 | FS-02 diagnostics bundle | Crash capture, bundle, redaction check | Any rig session; a test issue repository |
| H-03 | FS-03 PDF reports | PDF export in Edge and Acrobat | One completed speed test, one DVS run, one System Health scan |
| H-06 | FS-06 test-media library | Prefilled values vs sleeve; observed carriers | SL-1200MK4, PLX-CRSS12, test record, CV02.5, MK2 vinyl, Audio 8 DJ |
| H-07 | FS-07 external links | Link allowlist, confirm dialog, copy fallback | Machine with a default browser; a VM with no default browser |
| H-08 | FS-08 backup and restore | Round trip, tamper rejection, second machine | Owner's profile with PLX-CRSS12 and SL-1200MK4 assets, Audio 8 DJ calibration, DDJ map |
| H-11 | FS-11 DVS latency and buffer tuner | WASAPI round trip with a patch cable, buffer-behaviour branch (A to D), stress sweep, recommendation per DJ program, Windows checklist, Esc abort | Audio 8 DJ, DJM-A9 (USB), one patch cable (RCA or 6.35 mm), Serato DJ Pro, Traktor Pro, rekordbox, a Windows laptop |
| H-10 | FS-10 pre-gig check | 120 s budget, rig presets, GREEN/AMBER/RED verdicts, fault injection, hum calibration | Audio 8 DJ, SL-1200MK4, Traktor MK2 and CV02.5 vinyl, Rane Twelve MK2, DJM-A9, PLX-CRSS12, Xone:23C |
| H-12 | FS-12 stylus wear tracker | Hours ledger, DVS proposal, three benchmarks, repeatability, alerts, degradation calibration | SL-1200MK4 and owner's cartridge, Audio 8 DJ, SPEC-01 1 kHz and L/R test tracks, CV02.5 and Traktor MK2 sides |
| H-13 | FS-13 control-vinyl wear map | Full-side scans, repeatability, interruption, verdict, SNR class calibration | SL-1200MK4, Audio 8 DJ, CV02.5 and Traktor Scratch MK2 copies, screen recorder |
| H-14 | FS-14 scratch stress test | Baseline gate, velocity check, 90 s protocol, abort timing, skip safety, skip and lock-loss calibration | SL-1200MK4, Audio 8 DJ, spare Traktor MK2 and CV02.5 vinyl, Rane Twelve MK2, monitors |
| H-15 | FS-15 booth feedback and hum hunter | Hum isolation steps on three mixers, feedback step test, abort timing, stop on navigation and close | SL-1200MK4, Twelve MK2, DJM-A9, Xone:23C, Audio 8 DJ, Pioneer monitors, laptop charger, a loop recording cable |
| H-20 | FS-20 used-gear certificate | Readiness gate, signing, PDF/JSON/HTML export, verify on a second machine, tamper and expiry, QR scan, DPAPI key | Owner's units with full test plans; a second machine; a phone |
| H-21 | FS-21 unit vs population | Spec, sibling and history comparison; anonymous pack export, import, idempotence, removal; non-ASCII paths | Two machines with DeckChek; owner's units with saved runs |
| H-22 | FS-22 service worksheets | Intake, before/after tests in job mode, work log, job sheet print, customer privacy, long paths | Owner's SL-1200MK4, Rane Twelve MK2 and DJM-A9; a printer |
| H-23 | FS-23 venue fleet dashboard | Venue/booth/position set-up, placement, reminders, start-up banner and snooze, CSV in Excel, booth sheet print, delete safety | Owner's real database with PLX-CRSS12, SL-1200MK4, DJM-A9, Twelve MK2, Xone:23C, DDJ; Excel; a printer |
| H-31 | FS-31 timecode doctor live monitor | WASAPI-shared spike beside DJ software, alarms on real wear and dropouts, cueing/backspin false-alarm check, tray, 2 h CPU budget, session logs | Owner's Audio 8 DJ and DJM-A9 with Traktor/Serato; split cable; control vinyl |
| H-32 | FS-32 MIDI mapper studio | Learn, assign, conflicts, Mixxx and VirtualDJ export and re-import, Serato/Traktor reports | Owner's DDJ controller and Xone:23C; Mixxx 2.4+; VirtualDJ |
| H-33 | FS-33 gear ledger | Privacy presets, offline page, EXIF stripping, certificate verify and tamper, leak search, GitHub Pages publish, single file, revisions | Owner's seven units with serials and phone photos, two signed certificates (H-20), a phone, a test GitHub repository |

IDs follow the feature spec number (`H-NN` = spec `NN`), as the plan and the spec §8 cross-references do. There is no H-04 or H-05, because the M5 index has no FS-04 or FS-05 (see section 9).

---

## H-00 Baseline rig check

Run once per rig and once per release, before any other script. Record in the release results file under `H-00`.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Note the Windows version and build (Settings > System > About). | Version shown. | `H-00/1` Windows edition, build |
| 2 | Note the DeckChek version and commit: run the installed app, open About, and on the build machine run `git rev-parse --short HEAD`. | Version matches the release tag. | `H-00/2` version, short commit |
| 3 | Note driver and software versions: Traktor Audio 8 DJ driver, Traktor Pro, Serato DJ Pro, rekordbox or VirtualDJ if used, and the PLX-CRSS12, DJM-A9, Rane Twelve MK2 and Xone:23C firmware if they can be read. | Each version written down. Unknown items marked "unknown", not guessed. | `H-00/3` one line per item |
| 4 | Confirm the Pioneer DDJ model. | Model name written. If the owner does not have a DDJ, write "none" and mark the DDJ steps SKIP. | `H-00/4` model |
| 5 | List the cartridge fitted to the SL-1200MK4 and the cartridge's hours if known. | Cartridge model written. | `H-00/5` cartridge model |
| 6 | Draw or photograph the wiring from each deck to the interface and mixer, and note the ground-wire state, phono/line switch positions and the USB charger (plugged or not). Keep the photo private. | Wiring written as a short list, e.g. "Deck B: SL-1200MK4 to Rane Twelve phono in, ground wire on". | `H-00/6` wiring list (no photo in repo) |
| 7 | Known-good run: play Traktor MK2 vinyl on the SL-1200MK4 through the Audio 8 DJ in Traktor Pro, both decks. Set the buffer you normally use. | Traktor shows timecode present on both decks, with no dropouts, for 60 s. | `H-00/7` PASS/FAIL, buffer size, sample rate |
| 8 | Read the latency Traktor displays for that buffer and sample rate (Preferences > Audio Setup). | A number in ms is shown. Used later in H-01 and the latency script. | `H-00/8` displayed latency ms |
| 9 | Record the tolerances you will use, using the defaults in section 9 unless you decide otherwise. | Tolerances written, dated and initialled. | `H-00/9` tolerances |
| 10 | Copy `results/README.md` template to a new `results/v0.0.N.md` for this release, fill in the header and H-00 rows. | File created. | `results/v0.0.N.md` header |

---

## H-01 First-run setup wizard (FS-01)

Use a second Windows user account for steps 1 to 4 so the owner's profile is untouched. Steps 6 onward may run on the owner's profile.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Sign in as the test account, start DeckChek (the release build). | The setup wizard opens before the Quick screen. Esc or "Skip setup" closes it. | `H-01/1` PASS/FAIL |
| 2 | Press Start on the Welcome step. Read the privacy line. | Text reads "Everything stays on this computer." | `H-01/2` PASS/FAIL |
| 3 | On Interface & I/O, choose Traktor Audio 8 DJ as input and output, sample rate 48 kHz, press Next. | Device appears in the list under its driver name. Next saves the device. | `H-01/3` device name as shown, rate |
| 4 | Lower the monitors. Press "Play test tone" (-20 dBFS, 1 kHz) and watch the stereo meter. | Tone is audible at low level. Meter responds. Verdict is OK when the input peak is between -40 dBFS and -1 dBFS. If the peak is above -1 dBFS the verdict is Clipping (error); below -40 dBFS it is Low (warning). | `H-01/4` peak dBFS, verdict text |
| 5 | Wire a loopback cable from Audio 8 DJ output A to input A. Run calibration from the wizard. | Calibration finishes. Status shows the device and sample rate. | `H-01/5` PASS/FAIL |
| 6 | Route the test tone through the mixer's line input path as wired in H-00 step 6 (Rane Twelve MK2 or Xone:23C). | Meter shows the tone on the input channel. Verdict OK. If the meter does not respond, record the wiring that was used and mark FAIL. | `H-01/6` mixer used, verdict |
| 7 | Tick the owned products: PLX-CRSS12, SL-1200MK4 and DJM-A9 (plus any others you own). Press Finish. | Quick screen shows "My PLX-CRSS12", "My SL-1200MK4", "My DJM-A9". No duplicates. | `H-01/7` asset names listed |
| 8 | Open Options > "Run setup again". Confirm the values are prefilled. Do not change anything. Close. | Input and output and sample rate match step 3. Asset count unchanged after closing. | `H-01/8` asset count before and after |
| 9 | Run the wizard again from Options, go through to the end, ticking the same products again. | No duplicate assets are created. | `H-01/9` asset count |
| 10 | Start the wizard again (Options > Run setup again), go to step 3 and unplug the Audio 8 DJ USB cable. | A recoverable error panel appears with "Refresh" and "Continue without audio". The app does not crash. | `H-01/10` panel text |
| 11 | Replug the Audio 8 DJ, press Refresh. | Device returns to the list and the wizard can continue. | `H-01/11` PASS/FAIL |
| 12 | Start the wizard on a fresh step, reach step 3, then close the app with the window close button. Reopen. | Banner reads "Resume setup (step 3 of 7)" with Resume and Dismiss. Resume restores step and answers. | `H-01/12` banner text |
| 13 | Start DeckChek on a browser-only build (if you have one) and open the wizard. | Step 1 of 3 shows the browser note, no device list. System Health step is marked skipped. | `H-01/13` PASS/FAIL or SKIP |

---

## H-02 Crash capture and diagnostics bundle (FS-02)

Run this on the test account or the owner's account. Use a **test issue** in a private repository, not a public issue tracker.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Open Options > Support > "Create diagnostics bundle". Leave "Redact personal info" ON. Read the preview. | Summary preview is visible. It lists the parts and their sizes. No username or serial appears in the preview. | `H-02/1` PASS/FAIL |
| 2 | Close the dialog. Start DeckChek with the hidden flag `--debug-crash` (test build only) with the DJM-A9 rig session open. Let it crash. | The app exits. A crash marker is written in the app log folder. | `H-02/2` PASS/FAIL |
| 3 | Start DeckChek normally. | A prompt asks whether to create a diagnostics bundle. Dismissing it does not create one. | `H-02/3` prompt text |
| 4 | Accept, and save the bundle to a folder you choose (not the repository). | A `.zip` file is created. Its path and size are recorded. The app shows the path. | `H-02/4` file name, size in bytes |
| 5 | Extract the zip to a **new empty folder** with Windows Explorer, then in PowerShell run `findstr /s /i /m /c:"<your Windows username>" "<extracted folder>\*"`. | No file names are printed (findstr exits with code 1). Do not test with the zip file itself: the contents are compressed, so a search on the zip proves nothing. | `H-02/5` number of matches (must be 0) |
| 6 | Repeat step 5 for your computer name and your serial numbers (search for one serial at a time). | 0 matches. | `H-02/6` matches per term |
| 7 | Attach the zip to a **test issue** in the private test repository. | Attachment accepted. | `H-02/7` repository used (name only), PASS/FAIL |
| 8 | Delete the extracted folder after the check. | Folder removed. | `H-02/8` PASS/FAIL |

---

## H-03 PDF reports (FS-03)

Use Microsoft Edge and Adobe Acrobat Reader (or another PDF reader). Export each report once with paper set to A4, once with Letter.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Run a speed test on the SL-1200MK4 with the test record. Press "Export PDF" on the report. | Save dialog opens with a name like `DeckChek_Run_<device>_<YYYYMMDD-HHmm>.pdf`. The file is written. | `H-03/1` file name, size |
| 2 | Open the file in Edge, then in Acrobat. | Both open. Pages have a header (report title and device) and a footer "Page X of Y", app version, generated time. | `H-03/2` Edge PASS/FAIL, Acrobat PASS/FAIL |
| 3 | Check pagination: a multi-page report must not split a table row across pages. Check that table headers repeat on new pages. | No row is split. Headers repeat. | `H-03/3` PASS/FAIL |
| 4 | Select a heading and a table cell and copy them. | Text is selectable and copies correctly. | `H-03/4` PASS/FAIL |
| 5 | Check the charts (if the report has them) by zooming to 400 %. | Charts stay sharp (vector), and any chart text is selectable. | `H-03/5` PASS/FAIL |
| 6 | Set the paper to Letter and export the same run again. | Page size reads Letter (8.5 x 11 in) in Acrobat's document properties. | `H-03/6` page size |
| 7 | Export a Serato CV02.5 DVS run report from the Timecode screen. | PDF opens, and the deck name and format are in the header or body. | `H-03/7` PASS/FAIL |
| 8 | Export a System Health scan report. | PDF opens and lists each finding with a severity word and icon, not colour alone. | `H-03/8` PASS/FAIL |
| 9 | Export a report with 30 or more findings (run several scans or use the fixture report). | Every finding is present. Page count is recorded. "Page X of Y" is correct on the last page. | `H-03/9` finding count, page count |
| 10 | In the report notes, enter `<img src=x onerror=alert(1)>` and export. | The text appears literally in the PDF. No image or alert. | `H-03/10` PASS/FAIL |
| 11 | Switch the app to dark theme and export a report. | The PDF is still light. | `H-03/11` PASS/FAIL |

---

## H-06 Test-media library (FS-06)

Use the owner's sleeves and test records. Record the observed values in the results row, not in the repository.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Open the Test media tab. Select the 1/3.15 kHz test record. | Prefilled fields show the carrier, sides, durations and speed listed on the sleeve. | `H-06/1` each field: matches sleeve Y/N |
| 2 | Play the 1/3.15 kHz test record at 33 1/3 rpm on the SL-1200MK4, into the computer by the audio path recorded in H-00 step 6. Run the speed test. Then play the same record on the PLX-CRSS12 and run it again, using its USB audio into the computer. | Measured speed is recorded. It agrees with the sleeve's stated frequency within the tolerance set in H-00 step 9. | `H-06/2` measured Hz or %, tolerance used |
| 3 | Play the same record at 45 rpm. | Reading agrees with the 45 rpm value on the sleeve, within the same tolerance. | `H-06/3` measured value |
| 4 | Play side A of a Serato CV02.5 record on the SL-1200MK4 through the Audio 8 DJ. Run the carrier detection in Test media. | Observed carrier is recorded. Compare with the catalogue value (1 kHz for CV02.5). | `H-06/4` observed Hz |
| 5 | Play a Traktor Scratch MK2 record the same way. | Observed carrier is recorded. Compare with the catalogue value (2.5 kHz). | `H-06/5` observed Hz |
| 6 | Add a custom medium (e.g. a second control vinyl you own) from the Test media tab, and select it in the Speed test. | Chip shows the custom medium name. Saved medium appears on the next visit. | `H-06/6` PASS/FAIL |
| 7 | For each "unverified" format you observed in steps 4 and 5, write the observed carrier and the number of runs. Do not change the catalogue. | Notes written. The decision to promote a format from "unverified" is taken by the owner in a separate job. | `H-06/7` format, runs, observed Hz |

---

## H-07 External links and reveal (FS-07)

Use a machine where Edge is the default browser, and a Windows VM with no default browser set for the fallback steps.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Click an allowlisted link in the app (e.g. a link to the GitHub release page). | Opens in the default browser. No dialog. | `H-07/1` PASS/FAIL |
| 2 | Click a link that is not on the allowlist. | A confirm dialog appears and shows the full host. Cancel does nothing and opens nothing. | `H-07/2` dialog text |
| 3 | Click a link with a username and password in the URL (`https://user:pw@...`), if the app shows one. If the app has no such link, mark SKIP with that reason. | Confirm dialog appears. The dialog shows the real host. | `H-07/3` PASS/FAIL |
| 4 | Click a link that uses a lookalike host (punycode, `xn--`). | Confirm dialog shows the punycode host. | `H-07/4` PASS/FAIL |
| 5 | On a Windows VM with no default browser set, click an allowlisted link. | A toast reads "Couldn't open your browser — link copied". The URL is on the clipboard. | `H-07/5` toast text |
| 6 | Paste the clipboard into Notepad. | Pasted text equals the link exactly. | `H-07/6` match Y/N |
| 7 | From a saved report, use "Reveal in Explorer" (or equivalent). | Explorer opens with the file selected. | `H-07/7` PASS/FAIL |

---

## H-08 Backup and restore (FS-08)

This script moves your profile data. Do the first two steps in order and do not skip the safety copy.

**Before you start:** copy the whole folder `%APPDATA%\com.circuitdriftlabs.deckchek` to a safe place outside the app folder. This is your recovery copy. Do not delete it during this test.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Note the counts in the app: number of runs, assets, calibration profiles, MIDI maps (if any). Note the Audio 8 DJ calibration status and whether the PLX-CRSS12 and SL-1200MK4 assets exist. | Counts and statuses written down. | `H-08/1` counts |
| 2 | Data panel > export backup. Save the zip outside the repository. Compute its SHA-256 with `certutil -hashfile "<zip path>" SHA256`. | Zip written. The app shows its path. Hash computed. | `H-08/2` file name, size, first 12 hex chars of hash |
| 3 | Rename (do not delete) the folder `%APPDATA%\com.circuitdriftlabs.deckchek` to `com.circuitdriftlabs.deckchek.H08-moved`. Start DeckChek. | App starts with an empty or first-run state. No crash. | `H-08/3` PASS/FAIL, what appeared |
| 4 | Data panel > import backup. Select the zip from step 2. Read the preview. | Preview counts match step 1. Hash shown matches step 2. | `H-08/4` preview counts |
| 5 | Confirm the import. Wait for it to finish. | Import finishes without error. Counts after import match step 1. | `H-08/5` counts after |
| 6 | Open one stored run, one asset (PLX-CRSS12 and SL-1200MK4), and the Audio 8 DJ calibration. | Each opens and shows the same values as before. | `H-08/6` PASS/FAIL per item |
| 7 | If you saved a MIDI map for the DDJ (model in H-00 step 4), open it. | Map is present and has the same bindings. If no DDJ map exists, mark SKIP. | `H-08/7` PASS/FAIL or SKIP |
| 8 | Edit one byte of a **copy** of the zip (use a hex editor, not the original) and import the copy. | Import is rejected with an error about the file (tampered or bad). The live data is unchanged. | `H-08/8` error text, live counts unchanged Y/N |
| 9 | Copy the zip to a second Windows machine (or second user account). Import it there. | Counts match step 1. | `H-08/9` counts on second machine |
| 10 | When steps 1 to 9 all pass, delete `com.circuitdriftlabs.deckchek.H08-moved` **after** you have checked the restored data a second time. | Folder removed only after the second check. | `H-08/10` PASS/FAIL |

---

## H-11 DVS latency and buffer tuner (FS-11)

Enable `latencyTuner` under Options > Advanced > Experimental features first. Every number DeckChek shows here is a **WASAPI (Windows audio)** figure, not ASIO. Part of this script is to check that the screen says so and that the numbers are a sensible guide for your DJ software, which uses ASIO. **Turn the monitor volume down before steps 3 to 6**: the chirp is loud (default -20 dBFS, never above -12 dBFS). Close Serato, Traktor and rekordbox before every step except 11 and 12.

Use the Traktor Audio 8 DJ for steps 1 to 12, then repeat steps 2 to 7 on the DJM-A9 (USB) if you can route its output back to its input. Record the interface name next to each result.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Open Latency & buffer. Read the blue banner and open "Why not ASIO?". | The banner says the measurements are WASAPI (Windows audio), not ASIO, and that the figures are a guide to confirm in the DJ software. Opening the disclosure explains why ASIO is not measured. | `H-11/1` PASS/FAIL |
| 2 | Read "Connect a patch cable". Connect a patch cable from an Audio 8 DJ line output (for example Out A) to a line input (for example In B), left to left and right to right. Set the input to LINE. | The guide shows output, cable and input, warns against PHONO inputs and tells you to turn the monitors down. Measure stays disabled until you tick "I turned the monitors and headphones down". | `H-11/2` cables used, PASS/FAIL |
| 3 | Pick the Audio 8 DJ as input and its matching output (the output should preselect). Tick the volume box and press Measure latency (or Enter). | A progress bar runs for about 7 seconds. The result card shows a big round-trip number in ms, the plus-or-minus uncertainty marked k=2, "5 of 5 chirps", and the badge "WASAPI round trip". | `H-11/3` latency ms, uncertainty ms, chirps used |
| 4 | Repeat step 3 five times without changing anything. | The five means agree within 0.1 ms (spec 11 section 9: repeatability std below 0.1 ms on the Audio 8). | `H-11/4` the five means, std ms |
| 5 | Read "Reported by Windows vs measured". | It shows the buffers Windows ran (in plus out frames as ms), the measured round trip, and the difference labelled driver / USB overhead. A difference above 2 ms is flagged "High" in words. | `H-11/5` reported ms, measured ms, overhead ms, flag |
| 6 | Pull the patch cable out and measure again. | "No chirp came back" with a list of fixes and a button "Skip the cable: stress test only". Pressing it opens the Buffer test tab. | `H-11/6` PASS/FAIL |
| 7 | Plug the cable back in and measure once more. Compare the measured ms with the latency your DJ software shows for the same interface at a similar buffer (Traktor Preferences > Audio Setup > Latency (ms), Serato Setup > Audio > USB Buffer Size). | The WASAPI number is higher than, or close to, the ASIO figure. Record how far apart they are; this is the expected gap that the banner warns about. | `H-11/7` DJ software and its ms, DeckChek ms |
| 8 | Buffer test tab: leave CPU load at 50 % and time per step at 30 s. Press Start buffer test. | A progress bar and a table filling from 1024 frames down. From the second step on (and at the end) a "Detected on this computer" card names the branch. **Record which one**: A Honoured, B Partly honoured, C Ignored, D Streams failed to open. The Audio 8 DJ and DJM-A9 can differ. | `H-11/8` branch letter and title per device, requested vs ran columns, idle and load verdicts, any glitch counts |
| 9 | Read the card and the table for the branch you got. | A: every row says "N frames" and Pass or Fail. B: changed rows say "host-chosen period (not compared)" and the card states the smallest size Windows will run. C: one "Host default" row and the card asks you to type your ASIO buffer. D: the card says streams failed to open and tells you to close the DJ software or use the ASIO panel. Every Pass or Fail is shown as a word as well as a colour. | `H-11/9` PASS/FAIL, any wording that did not match |
| 10 | Press Esc during a step. | The run stops within about 1 s and the status line says it stopped. Task Manager shows the CPU load back to normal within 1 s. | `H-11/10` stop time s, PASS/FAIL |
| 11 | Recommendation tab. Read the card for each of Serato DJ Pro, Traktor Pro and rekordbox. Then type the ASIO buffer you really use (for example 256) into "Your ASIO buffer". | Each card names the program's own setting (Serato: USB Buffer Size, Setup > Audio; Traktor: Latency, Preferences > Audio Setup; rekordbox: Buffer Size, marked "Setting name not verified"). In A or B you get "Lowest safe setting" with one step of headroom. In C or D you are asked to type a buffer, and the typed value is labelled "ASIO buffer (typed, not measured)". | `H-11/11` the three cards, whether each setting name matches the real menu (Y/N, and the real wording if not) |
| 12 | Apply the recommended value in Serato, then Traktor, then rekordbox (DeckChek never changes it for you). Play two tracks with effects and a scratch loop for 10 minutes each. | No crackle or dropout at the recommended value. If there is, move one step larger and note it. | `H-11/12` per program: buffer set, 10 min clean Y/N |
| 13 | Windows tuning tab: press Scan this PC. | About 12 seconds later a list appears with Pass, Review or Unknown in words, review items first and a summary line. Nothing on the PC changed. | `H-11/13` counts, items marked Review |
| 14 | Open "How to check and fix" on the Power plan item, copy the check command and paste it into a Windows terminal. Then use the Win+R shortcut. | The command prints the same plan DeckChek showed. The shortcut opens Power Options. DeckChek changes nothing. | `H-11/14` PASS/FAIL |
| 15 | Change the power plan to High performance, disable USB selective suspend, scan again, then repeat step 8 once at 128 frames. | Those two items move to Pass. Record whether the sweep result changed. | `H-11/15` items fixed, sweep before and after |
| 16 | Run steps 3 and 13 on a laptop with and without the charger. | The Power source item flips between Pass and Review, and the measured latency is recorded for both. | `H-11/16` ms on battery and on mains |
| 17 | Toggle the theme to light and walk through the four tabs. | Text, chips and the branch card stay readable; no status relies on colour alone. | `H-11/17` PASS/FAIL |
## H-10 Pre-gig check (FS-10)
Run after H-00 is complete for the rig. The automatic steps have a 120 s budget (FS-10 AC-1). The headphone prompt is manual, is shown separately, and is not in the budget. Keys: Ctrl+G starts, Esc cancels, Y or N answers the cue prompt, Ctrl+R reruns failed steps. Turn the monitors down before steps 6 to 9, because pulling a line-level cable can click loudly.
Rigs used in this script. Create each as a preset from the Equipment selection (Setup > Edit preset) if it does not exist:
- **Rig 1:** SL-1200MK4 on Traktor Audio 8 DJ inputs 1-2 (deck A), Traktor Scratch MK2 (2.5 kHz), Traktor Pro, mixer Rane Twelve MK2 or Xone:23C (as wired in H-00 step 6). MIDI name "Allen & Heath Xone:23C" if that port appears in the MIDI list.
- **Rig 2:** SL-1200MK4 on Traktor Audio 8 DJ inputs 1-2, Serato CV02.5 (1 kHz), Serato DJ Pro, mixer Rane Twelve MK2.
- **Rig 3:** PLX-CRSS12 USB audio into the computer, mixer Pioneer DJM-A9 (phono input), format set to the control vinyl you actually play on the PLX. Its USB audio device name and its format are UNKNOWN until observed (spec 32; see section 2).
Do not add a rekordbox preset. No rekordbox is in the owner's gear list, and the built-in rekordbox format is unverified.
| 1 | Open Pre-gig check > Setup. Confirm the Rig 1, Rig 2 and Rig 3 presets exist. Create any that are missing, with the decks, input pairs, format, mixer, software and MIDI names listed above. | The preset dropdown lists each rig. The summary chips show decks, mixer, software and input device for the selected preset. | `H-10/1` preset names present or created, Y/N |
| 2 | Export Rig 1 as JSON to a folder outside the repository. Import the file under a new name. Compare the two presets field by field. | Export and import both succeed. The copy matches the original in every field. The file is under 256 kB. | `H-10/2` PASS/FAIL, file size in bytes |
| 3 | Set up Rig 1 as wired in H-00 step 6, with Traktor Pro open on the Audio 8 DJ. Turn the monitors down. Select Rig 1 and press Ctrl+G. Start a stopwatch at the press. | The run starts. Each step row moves pending, running, then pass, warn or fail, in plan order. A timer is shown. | `H-10/3` PASS/FAIL, software state |
| 4 | When the cue card appears, cue deck A in the headphones. Press Y if you hear it clearly in both ears, N if not. Stop the stopwatch when the verdict banner appears. Subtract the time the cue card was open to get the automatic time. | The card reads "Cue deck A in your headphones. Do you hear it clearly in both ears?" with Yes, No and Skip. Y is accepted from the keyboard. The verdict banner appears. | `H-10/4` automatic seconds (must be 120 or less), manual card seconds, verdict word |
| 5 | Read the verdict banner and each step card. Open the evidence of the deck A timecode step and read its values. | Rig 1 is GREEN with Traktor Pro running. The banner reads "Ready to play. N of N checks passed." If it is not GREEN, record which card is not green and the value that caused it. | `H-10/5` verdict, deck A SNR dB, balance dB, phase error deg, dropouts, speed error % |
| 6 | Unplug the Audio 8 DJ USB cable. Select Rig 1 and press Ctrl+G. Start a stopwatch at the press and stop it at the verdict. Replug the cable after the run. | The audio step is RED because the interface is missing. Remaining signal steps show "skipped (blocked)". The run finishes in under 15 s. | `H-10/6` seconds to finish, verdict, text on the audio card |
| 7 | Replug the Audio 8 DJ. Start Rig 1 again. Unplug the Audio 8 DJ USB cable while the deck A timecode row is running. Let the run finish. Replug and check the device list. | The app does not crash. The audio or deck row turns RED with a recoverable message. Remaining rows are skipped or unsupported. The run is saved to history with a verdict. | `H-10/7` PASS/FAIL, verdict, row states |
| 8 | Monitors down. Pull the RCA cable from deck B at the mixer end. Run Rig 1. Reconnect the cable before the next step. | Verdict RED. The mixer or deck B card names deck B and gives a one-sentence action. Deck B has no timecode. | `H-10/8` verdict, card text, cable reconnected Y/N |
| 9 | Set the mixer phono or line switch for deck A to the wrong position for the cartridge (line for a phono cartridge). Run Rig 1. Restore the switch. | Verdict RED. The deck A timecode card shows the action "Clean stylus and control vinyl, check phono/line switch" and a link to the DVS workflow. | `H-10/9` verdict, card text, switch restored Y/N |
| 10 | Start Rig 1. Press Esc during the deck A timecode step. | The run stops. Completed steps are kept and the run is saved as cancelled in History. | `H-10/10` PASS/FAIL, history state |
| 11 | Run Rig 2 with Serato DJ Pro open. Record every step's value. | Verdict GREEN, AMBER or RED, with evidence on each card. A speed error above 5 % points to a wrong format selection. | `H-10/11` verdict, deck A SNR dB, speed error % |
| 12 | Run Rig 3. Record the USB audio device name shown by the OS and by DeckChek for the PLX-CRSS12. Record the DJM-A9 phono switch position. | The verdict is recorded as observed. If the format is unverified, the timecode card says so. | `H-10/12` device name as shown, verdict, DJM-A9 switch position |
| 13 | Rig 1: unplug the Xone:23C USB cable or remove its MIDI port from the setup. Run Rig 1. Restore the cable. | The MIDI card shows the missing port. The verdict is AMBER or RED with a fix action on the MIDI card. | `H-10/13` verdict, MIDI card text |
| 14 | Run Rig 1 once more with everything connected. Open History, then the Compare view for Rig 1. Then press Ctrl+R on a run with a failed step, if there is one. | Compare lists the steps that changed against the last run of the same preset. Ctrl+R reruns only the failed steps. | `H-10/14` number of changed steps, PASS/FAIL for Ctrl+R |
| 15 | Browser preview build only, if you have one. Open Pre-gig check. | System Health, DJ software and driver steps show "unsupported", and the banner reads "Partial check". | `H-10/15` PASS/FAIL, or SKIP with reason "no browser build" |
### H-10 calibration (hum thresholds)
FS-10 section 6 gives hum thresholds as tunable defaults with the status UNKNOWN: warn when the mains family is within 40 dB of the carrier, fail within 25 dB. These steps measure the owner's rig so the thresholds can be set. They record values only. Do not change any threshold from this script; the owner sets the values in a separate job and records them in H-00 step 9.
Definition used here: separation S = carrier level (dBFS, from the same capture) minus the mains-family level (the larger of the 50 or 60 Hz fundamental and its harmonics 2 and 3, dBFS). A smaller S is worse. FS-10 calls the reference "the carrier level", so this matches the default wording. The step also records the floor-relative value (humToFloorDb) so the owner can choose which metric to use.
Mains earth is never touched in these steps. "Ground wire off" means the turntable's signal ground wire at the mixer GND terminal, which is the H-15 step 3 fault.
| C1 | For each mixer you use (Rane Twelve MK2, DJM-A9 phono, Xone:23C), set the same channel gain. Play Traktor MK2 vinyl at 33 1/3 on the SL-1200MK4. Run the pre-gig check three times in each configuration: G (ground wire on, charger unplugged); B1 (ground wire off); B2 (ground wire on, laptop charger plugged in). Open the hum step evidence each time. | Each run gives a carrier level and a mains-family level, so S can be computed. | `H-10/C1` per mixer: S for each of the nine runs, and the mains Hz detected |
| C2 | Per mixer, compute g = lowest S of the three G runs, and b = highest S of the six B runs. Then failDb = (g + b) / 2 and warnDb = g - 6. If failDb is less than warnDb, record both values. If not, record "no clean separation" and keep the defaults of 40 and 25. | Values written for each mixer. | `H-10/C2` per mixer: g, b, failDb, warnDb, or "no clean separation" |
| C3 | Repeat C1 with the needle lifted (tonearm rested, platter running, no record) so that the needle-up path in FS-10 step 4 is used. Record humToFloorDb for each configuration. | humToFloorDb per configuration and per mixer, so the owner can choose the floor-relative metric. | `H-10/C3` humToFloorDb for G, B1, B2 |
| C4 | After the owner sets the thresholds (separate job), run Rig 1 and Rig 2 again in the G and B1 configurations. | G runs show the hum step as PASS. B1 shows AMBER or RED. | `H-10/C4` hum step result per configuration |
---
## H-12 Stylus wear tracker (FS-12)
Use the cartridge fitted to the SL-1200MK4 (recorded in H-00 step 5). Log only hours you actually played on the owner's cartridge. For the logging-logic tests (steps 2 and 3), use a test stylus asset that you create and delete at the end, so the owner's ledger keeps real entries only.
Benchmark source: the SPEC-01 1 kHz test track, with its L-only and R-only tracks, from your test record. If your record does not have these tracks, mark steps 5 to 8 that need them as SKIP with that reason.
| 1 | Open the owner's cartridge asset (Equipment > cartridge > Wear). Read the rated-life line. | If there is no catalogue entry for the model, the text reads "Rated life unknown - using generic 500 h DJ estimate". The gauge uses the same value as the text. | `H-12/1` rated hours shown, fallback text Y/N |
| 2 | On the test stylus asset, note the total. Add 2.5 h manually (Add hours, Enter) with the note "test". | A ledger entry with source "manual" is added. The total rises by 2.5 h. | `H-12/2` total before, total after, source shown |
| 3 | On the test stylus asset, try to add -1 h, then 25 h. | Both are refused with a message. The total does not change. | `H-12/3` message text, total unchanged Y/N |
| 4 | Put the owner's cartridge in the DVS setup. Run a DVS session of L minutes. Stop and open the proposal. (L = 40 gives the spec example.) | The proposal is source "deckchek" with value L / 60 h to two decimals (40 min gives 0.67 h). Nothing counts until you confirm or edit it. Confirm it. | `H-12/4` L (minutes), proposed h, confirmed h |
| 5 | Benchmark 1 (day 0). Use the SL-1200MK4, the 1 kHz track, the separation tracks and the timecode segment. Record the calibration profile used. | The result is saved. valid=1 if the calibration profile matches the one for this cartridge. Metrics show. | `H-12/5` THD %, separation dB, timecode SNR dB, phase error deg, dropouts, valid Y/N |
| 6 | Benchmarks 2 and 3, about one week apart. Keep the record, side, tracking force, VTA, interface and calibration profile the same. | Each adds a row. Until the third valid benchmark the trend reads "Need 3 benchmarks for a trend". | `H-12/6` each benchmark's metrics, valid flags |
| 7 | After three valid benchmarks, compute the standard deviation across the three runs for separation, THD, SNR and phase. | Trend chart shows the regression line, slope per 100 h and R-squared. Target from spec section 8: separation standard deviation under 0.5 dB. | `H-12/7` std separation dB, std THD pp, std SNR dB, std phase deg, slope per 100 h, R-squared |
| 8 | Deliberate offset: raise the tracking force by 0.5 g above the rated value. Run one benchmark. Reset the tracking force and run a benchmark to confirm. | The benchmark is valid=0 if its profile no longer matches, or it shows numbers that are plausible. No alert appears from one run (two consecutive runs are needed). Nothing absurd is shown. | `H-12/8` valid flag, alert shown Y/N, separation change dB |
| 9 | Timecode segments: play 60 s of a Serato CV02.5 side and 60 s of a Traktor MK2 side on the SL-1200MK4 through the Audio 8 DJ, and read the SNR for each. | Each format's SNR is recorded with its format name. If the cartridge is healthy, both are above 25 dB. | `H-12/9` SNR dB per format, format names |
| 10 | On the owner's cartridge only, set rated life to a test value so that hours reach 80 % and then 100 %. Check the alert on the rail. Snooze an alert for 30 days. Restore the original rated life afterwards. | Amber at 80 %, red at 100 %. The snooze date is recorded. The restored rated life equals the original value. | `H-12/10` amber Y/N, red Y/N, snooze date, restored Y/N |
| 11 | On the test stylus asset, log a maintenance event "stylus replaced". Check the totals. Then delete the test stylus asset. | The hours total restarts from 0 for the new stylus, and the earlier history is still listed. The test asset is deleted. | `H-12/11` PASS/FAIL, delete confirmed Y/N |
### H-12 calibration (degradation thresholds)
FS-12 section 6 gives the degradation thresholds as tunable defaults with no authoritative source: THD up 1 percentage point, separation down 3 dB, SNR down 6 dB, phase error up 8 deg. These steps measure the owner's run-to-run noise. The owner sets the final thresholds.
| C1 | From step 7, take the standard deviation of each metric across the three valid benchmarks (s_THD, s_sep, s_SNR, s_phase). | Four values. | `H-12/C1` s_THD, s_sep, s_SNR, s_phase |
| C2 | For each metric, the proposed threshold is 3 x its standard deviation if that is more sensitive than the default. Otherwise keep the default. | Proposed threshold per metric, marked "default kept" or "proposed". | `H-12/C2` proposed thresholds |
| C3 | Record the rated-life figure for the cartridge model from the manufacturer's own documentation, or "UNKNOWN" if none can be read. Do not estimate it. | A source and a value, or UNKNOWN. | `H-12/C3` value, source, UNKNOWN Y/N |
---
## H-13 Control-vinyl wear map (FS-13)
Each full-side scan plays one side at normal speed, so a 12 min side takes about 12 min, and the three repeat scans take about 40 min. Use the same cartridge and setup for every scan of one copy. Do not scratch during a scan. Use a spare copy for repeat scans where possible.
Side lengths from FS-06 (spec 13 section 4): CV02.5 side A about 11.9 min, side B about 15.4 min. Traktor Scratch MK2 side A about 12.3 min, side B about 17.3 min. Record the measured duration of each scan.
| 1 | Open the Control vinyl tab. Create "CV02.5 copy 1" (Serato, side A, 33 1/3 rpm) and "Traktor MK2 copy 1" (Traktor, side A). Read the side duration shown for each. Override only if the sleeve differs. | Both copies are saved. Durations match the side lengths above, or the override is recorded. | `H-13/1` copy names, durations shown |
| 2 | Clean the record and stylus. Choose the Rig 2 setup for CV02.5. Play the side from its start and read the live meter. | The meter responds. The format lock shows as locked. The checklist reads "Clean the record and stylus first". | `H-13/2` locked Y/N, meter peak dBFS |
| 3 | Full scan of CV02.5 side A. Press Space at the needle drop, let the side play to the run-out, press Space to stop. Measure the elapsed time. | Scan saved. Bin count = scan seconds / 2 (about 357 for 11.9 min). Coverage 100 %. | `H-13/3` elapsed min, bin count, coverage % |
| 4 | Partial scan: scan Traktor MK2 copy 1 side A, stop at about half of the side with Space. Read the verdict. | The verdict text reads "Scanned about 50 % of the side". The partial result is saved. | `H-13/4` coverage text |
| 5 | Repeat step 3 twice more on CV02.5 side A (three scans in total, same cartridge and setup). | Three saved scans for the copy. The Compare toggle is enabled. | `H-13/5` number of scans |
| 6 | Compare the three scans. For each bin, compute the standard deviation of SNR across the three scans. Record the median across bins and the 95th percentile. Count bins whose SNR changes by more than 3 dB. | Target from spec section 8: median per-bin SNR standard deviation under 2 dB. Changes under 3 dB are labelled "within noise". | `H-13/6` median std dB, p95 dB, bins over 3 dB |
| 7 | Interruption: on Traktor MK2 copy 1 side A, start a scan at the needle drop. At about 4 min, lift the arm, wait 5 s, and lower it back onto the same groove at the same point. Let the scan finish. | Bins during the interruption are flagged "interrupted" and excluded from the verdict. Coverage excludes them. If the stylus skips, lift the arm and stop the scan. | `H-13/7` flagged bin count, coverage text |
| 8 | Read the verdict (keep, watch, other side, replace or incomplete), the top three worst bins with timestamps and the score. Then play the same side in Serato or Traktor and note the times of any audible dropout or lock loss. | The verdict is recorded. Proposed (owner decides): at least one of the three worst bins is within 10 s of an audible or software dropout. | `H-13/8` verdict, three worst timestamps, software dropout times, match Y/N |
| 9 | Open the Compare toggle on scan 3 against scan 1. | Per-bin change is shown. A bin that goes from good to bad is labelled "new bad bin". | `H-13/9` count of "new bad bin" |
| 10 | If the cartridge's most recent stylus benchmark (H-12) is red at this time, read the verdict. If it is not red, mark this step SKIP with the reason "stylus benchmark not red". | When red: the verdict includes "Stylus may be the cause", and "Replace" is shown as "Watch". | `H-13/10` PASS/FAIL or SKIP with reason |
| 11 | Click the worst bin and open the inspector. Read the raw values. Use the arrow keys to move bin by bin, and read the announcement. | The inspector shows SNR, phase error, balance, level, dropouts and flags. The announcement reads "Bin N, time, SNR dB". | `H-13/11` PASS/FAIL, announcement text |
| 12 | Traktor MK2 copy 1 side B: repeat steps 3 and 8. | Bin count matches a 17.3 min side (about 519 bins). | `H-13/12` bin count, verdict |
### H-13 calibration (SNR classes)
FS-13 section 6 gives the bin classes as tunable defaults: good when SNR is 25 dB or more with phase error up to 10 deg and no dropouts; bad when SNR is under 15 dB, phase error is over 25 deg, or there are 2 or more dropouts. The classes are unvalidated against software lock loss. These steps check them against lock loss that the software really shows.
| C1 | Pick at least three sides that cover a range of condition: a new copy, a worn copy and a scratched spare. For each side, first play it in Serato or Traktor with a screen recording that shows the timecode or lock indicator. Then scan the same side with DeckChek from the same needle drop. Do not run both at once. Record the needle-drop time in each recording. | Two aligned recordings per side. | `H-13/C1` side names, needle-drop times |
| C2 | From the software recording, list each lock loss or stutter with start time and length (nearest 0.5 s). From the DeckChek scan, list the class of each 2 s bin. | Two lists per side. | `H-13/C2` lock-loss count per side |
| C3 | For each class, lock-loss rate = seconds of software lock loss inside those bins / total seconds of those bins. Use a class only if it has at least 30 bins. Otherwise keep the defaults for that class. | A table with class, bin count, lost seconds and rate. | `H-13/C3` table |
| C4 | Choose the SNR cut so that bins below it have a lock-loss rate of 50 % or more, and bins above it have a rate of 5 % or less. Record the cut. Keep 25 dB and 15 dB if the rule cannot be met, and record why. Apply the same method to the phase and dropout cuts. | Proposed SNR cuts (good/degraded, degraded/bad), phase cut and dropout cut. | `H-13/C4` proposed cuts, or "defaults kept" with reason |
| C5 | If the owner needs values per format, repeat C1 to C4 for CV02.5 and Traktor MK2 separately. | A table per format. | `H-13/C5` per format results |
---
## H-14 Scratch stress test (FS-14)
Use a spare control vinyl for every run in this script. A stylus that skips can damage the groove. The metronome is the only test sound. Keep the monitor master low. The metronome default is -24 dBFS and must not go above -6 dBFS. The metronome output must not feed a deck input, because it would corrupt the timecode; check the route in step 2.
The skip calibration (C1 to C3) uses natural skips on the spare record only. Do not induce skips to collect data. Stop the record at the third skip in a session, as the safety rule requires.
| 1 | Read the safety screen. Check the copy "Use a spare control vinyl, not your best one". Check the metronome level. | The copy is shown. The metronome default is -24 dBFS. | `H-14/1` PASS/FAIL, metronome level |
| 2 | Choose the setup: SL-1200MK4 cartridge, Traktor Scratch MK2 spare on Audio 8 DJ inputs 1-2 (deck A), Traktor Pro, Rane Twelve MK2, format Traktor Scratch MK2 (2.5 kHz). BPM 90, protocol v1. Choose the monitors as the metronome output. | Setup accepted. Setup chips show the names. The metronome output is not one of the Audio 8 DJ inputs. | `H-14/2` setup names, metronome output device |
| 3 | Baseline gate, pass case: needle down, platter at 33 1/3, play 3 s steady. Start the test. | The baseline SNR is shown. At 25 dB or more, the test starts. | `H-14/3` baseline SNR dB, PASS/FAIL |
| 4 | Baseline gate, refuse case: needle down, platter stopped. Start the test. Then start the platter and repeat. | Refused with fix actions (for example "Start the platter" and "Clean the stylus and control vinyl"). After the fix, the test starts. | `H-14/4` fix action text, PASS/FAIL |
| 5 | Velocity check, during the baseline step with no scratching: platter at 33 1/3, read the median velocity. Then switch to 45 rpm and read the median velocity again. | At 33 1/3 the median is 0.99 to 1.01. At 45 rpm it is 1.34 to 1.36 (45 / 33 1/3 = 1.35). Tolerances are proposed; the owner decides. | `H-14/5` median velocity at 33 1/3, median at 45 rpm |
| 6 | Full protocol v1: start. Four clicks count in, then baby scratch 20 s, rest 5 s, transform 20 s, rest 5 s, chirp 20 s, rest 5 s. Perform on the beat. Stop the run at any skip. | The three patterns run in order, each 20 s with 5 s rest. The score screen appears after the last pattern. | `H-14/6` completed Y/N, total time, patterns completed |
| 7 | Baby pattern: count your own direction changes against the metronome. Compare with the reversal list. | The reversal list matches your count within 1 per 10 reversals. The tolerance is proposed; the owner decides. | `H-14/7` your count, DeckChek count |
| 8 | During the run, note each stutter or audible dropout on the software deck. Compare with DeckChek lock-loss events: count, longest duration (ms), median recovery (ms). | Each audible dropout or stutter has a lock-loss event within 50 ms (proposed). | `H-14/8` software stutters, lock losses, longest ms, median recovery ms |
| 9 | New run. Press Esc during the transform pattern. Measure from the Esc key to metronome silence, using a screen recording (frame count / frame rate) or a sound-level meter. | The metronome is muted within 100 ms of Esc. The run is labelled aborted and scored from the completed patterns. | `H-14/9` ms from Esc to silence, label shown |
| 10 | Natural skip only: if the spare record skips during a run, lift the arm at once and stop the run. Record the time from the DeckChek event list. Do not restart until the skip is recorded. | The skip is reported as a skip event, separate from lock loss, and the safety stop message appears. At the third skip in one run, the test stops with the message. If no natural skip occurs, mark SKIP with the reason. | `H-14/10` skip count and time, stop message Y/N or SKIP reason |
| 11 | Open the result card for run step 6. Record the score and each component (continuity, recovery, direction, stability, skips). Confirm the run is saved against the cartridge, vinyl copy and setup. | Score 0 to 100 with components. A skip caps the total at 60 (spec section 6). The run is listed against all three. | `H-14/11` score, components, cap applied Y/N |
| 12 | Repeatability: run protocol v1 three times on each cartridge you own (the SL-1200MK4 cartridge and a second cartridge, if you own one). Use the same spare record and setup. Compare the means. | Each cartridge has three runs. The difference between means is within run-to-run noise if the absolute difference is under 2 standard deviations (spec section 6). | `H-14/12` mean and std per cartridge, difference, within noise Y/N, or SKIP with reason |
| 13 | Format check: with a spare Serato CV02.5 on the Rane Twelve MK2 deck (Serato DJ Pro, a new setup), run protocol v1 once. | The score is saved under the CV02.5 setup. The result card names the format. Note any difference in lock behaviour from step 6. | `H-14/13` score, format name, lock behaviour note |
### H-14 calibration (skip thresholds and lock loss)
FS-14 section 6 gives the skip detector as UNKNOWN: an amplitude drop below -20 dB for 2 to 50 ms, a phase jump beyond the expected value of more than pi/2, and an 8 to 20 Hz ringing burst. These steps build a labelled set of real skips and control runs and check the detector against them.
| C1 | Collect labelled events: natural skips on the spare record from step 10 across sessions. Also run protocol v1 at least three times on a good record as controls (no skips expected). Label every event skip or no-skip by ear and by video. | At least 5 labelled skips and at least 3 control runs. If fewer natural skips occur, record that and keep the defaults. | `H-14/C1` skip count, control run count |
| C2 | For each labelled event, read the detector values in the inspector or the saved skip detail: amplitude drop (dB), its duration (ms), phase jump beyond expected (rad), ringing peak in 8 to 20 Hz (dB). | One row per event. | `H-14/C2` table of values per event |
| C3 | Set the amplitude, duration, phase and ringing thresholds so that every labelled skip is detected and no control-run event is detected. If both cannot be met, record recall and false positives for each candidate set and keep the defaults. | Proposed values with recall % and false-positive count. | `H-14/C3` proposed values, recall %, false positives |
| C4 | Lock loss (from step 8): compare the default lock-loss rule (SNR below 10 dB for 10 ms or more, or level 12 dB below baseline) with the software stutters. Propose a change only if recall of audible dropouts is 90 % or more and there is less than one false lock loss per minute of control run. | Precision and recall of the default. Proposed values only if the rule above is met. | `H-14/C4` recall %, precision %, false losses per minute, proposed value or "default kept" |

---

## H-15 Booth feedback and hum hunter (FS-15)

Enable `humHunter` and `feedbackStep` under Options > Advanced > Experimental features first. The hum part only listens. The feedback part makes sound: do steps 8 to 14 with the **monitor and booth volume all the way down** and your hand on the master. DeckChek never plays above its cap (default -30 dBFS, absolute -12 dBFS), but the mixer gain and the PA can still make it loud. Never lift, cut or tape over a mains safety earth in any step; "ground lift" means only an audio ground-lift switch or DI box.

Run steps 1 to 7 once per mixer: Rane Twelve MK2, Pioneer DJM-A9 (phono input), Allen & Heath Xone:23C. Record the mixer name next to each result. Use the SL-1200MK4 as the turntable, the Audio 8 DJ as the capture interface, and take the mixer's record or master output into an Audio 8 DJ input.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Open Hum and feedback > Hum hunter. Pick the Audio 8 DJ input and channel. Leave mains on Auto. Press Start. With nothing plugged into the mixer channel, watch the live meter for 5 s. | The live hum meter shows the mains fundamental (50 Hz or 60 Hz, matching the venue mains), harmonics 2 to 6 in dBFS, and "dB above the noise floor". Mains frequency matches your region. | `H-15/1` mixer, detected mains Hz, hum above floor dB |
| 2 | Step A "Mixer alone": press Space (or Measure 5 s). Do not touch anything. | A 5 s progress bar runs, then the step shows a total hum level. | `H-15/2` step A total dBFS |
| 3 | Step B: connect the deck RCA cables to the phono input, ground wire **disconnected**. Measure. | Result shows delta vs step A. If hum rose 6 dB or more, the message reads "This connection introduces hum". | `H-15/3` step B total dBFS, delta dB, message |
| 4 | Step C: connect the turntable ground wire to the mixer GND terminal. Measure. | If hum drops 6 dB or more, the message reads "Hum source is downstream of this connection". Note the delta. | `H-15/4` step C total dBFS, delta dB, message |
| 5 | Step C check: lift the ground wire again, measure by pressing Previous step and Measure again, then reconnect. | Hum rises again by about the same amount (about 10 dB or more if the ground was working). If it does not change, the app should rank "ground wire not making contact" higher. | `H-15/5` delta dB, top cause shown |
| 6 | Steps D and E: connect the laptop USB on battery and measure, then plug in the charger and measure. Skip F and G with S unless the mixer has an audio ground-lift switch. | Each step shows its delta. A rise at E ranks "Laptop charger" above other causes. Skipped steps are marked and the result says conclusions across them are less certain. | `H-15/6` D and E deltas, top cause |
| 7 | At the result: read the verdict, the ranked causes (confidence and "Try"), and open Runs. | A one-line verdict that matches what you observed. Cause list has confidence percentages and a next action each, with no instruction to alter mains wiring. The run is listed on the Runs tab with its step table. Remove the USB charger and rerun once; the cause list changes accordingly. | `H-15/7` verdict text, top 2 causes, matches reality Y/N |
| 8 | Feedback test setup (volume down): choose the interface output into a spare mixer channel with its fader down, the booth mic or record-out as input, 63 Hz sine, cap -30, step 3 dB. Read the screen before ticking anything. | The safety banner states -12 dBFS absolute limit. Start stays disabled until all three boxes are ticked. The plan line reads "Starts at -60 dBFS ... never goes above -30 dBFS". | `H-15/8` PASS/FAIL |
| 9 | Tick the boxes and press Start. Before touching anything else, press Tab once. | Output starts at -60 dBFS (display and, with the mixer meter, near silence). Focus is on the large STOP button, which is the first tab stop. The current level, cap and "Output playing" are on screen. | `H-15/9` PASS/FAIL |
| 10 | Wait 4 s, then press Raise (or R) once. Raise the mixer channel fader slightly until the tone is just audible in the booth. | The level rises by exactly 3 dB per press, only when you press. Raise is disabled for about 4 s after each step. It never rises on its own. | `H-15/10` levels observed |
| 11 | Press Esc. Then start again and press Space. | Both stop the tone at once. The banner says output is silent and shows the stop time. The partial run is saved. | `H-15/11` PASS/FAIL, stop time shown |
| 12 | Abort timing: feed the mixer's record output back to the input so the room can howl (a loop cable or the booth mic near the monitor), keep the volume low, and step up until onset. Compare with a screen or phone video of the monitor level meter. | The app stops the output by itself when the howl is detected. Banner: "Feedback detected: output stopped automatically" with frequency and step. The tone is silent within 100 ms of the detection. | `H-15/12` onset Hz, step, level dBFS, abort delay ms (from video), loop gain margin dB |
| 13 | Compare the deck on a flexible table with the deck on isolation feet or a heavier base. Repeat step 12 for each. | Onset step is later (or absent up to the cap) on the isolated deck. Guidance for onset below 120 Hz mentions decoupling and high-passing the booth monitor. | `H-15/13` onset step each, difference in steps |
| 14 | Safety exits. While the tone is playing: (a) click another screen in the rail; (b) start again and switch to the Runs tab; (c) start again and close the DeckChek window; (d) start again and unplug the input cable; (e) start again, raise nothing and wait 60 s without touching anything. | In (a), (b) and (c) the tone stops immediately. In (d) the tone stops within about 1 s and the banner says input lost. In (e) it stops at 60 s with the inactivity message. Clipping the input hard (raise mixer gain) also stops it with a clipping message. | `H-15/14` PASS/FAIL for a to e, plus clipping |
| 15 | Run the whole hum procedure once on an interface with no output device selected (or with the output unplugged) and open the Feedback tab. | Feedback test is disabled with an explanation. Hum hunter still works with the input only. | `H-15/15` PASS/FAIL |


## H-20 Used-gear certificate (FS-20)

Enable `certificates` under Options > Advanced > Experimental features first. Run steps 1 to 4 once per unit: PLX-CRSS12, SL-1200MK4, Rane Twelve MK2, DJM-A9, Xone:23C. Use a certificate folder whose path contains a space (for example `Documents\DeckChek certificates`). Do not put real customer names in the tester or notes fields of results you publish.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Devices > the unit > run every test in its plan (record skipped/unknown honestly). Open Certificates and pick the unit. | The readiness card reads "Y of Y required tests done"; Sign and export is enabled. Before the last test, it lists the missing tests and Sign and export is disabled (Export draft shown). | `H-20/1` unit, Y, blocked-before-last Y/N |
| 2 | Enter serial (as printed on the unit), tester, notes; add 2 photos (one PNG, one JPEG phone photo with GPS). Validity 90 days. Preview. | Preview shows model, serial, every test with its status, measured values with ± U, calibration state beside each audio value, both photos. | `H-20/2` PASS/FAIL |
| 3 | Sign and export into the folder with a space in its path. Time it from the click to the toast. | Within 5 s: `<model>-<serial>-<date>.pdf` and `.deckchek-cert.json` exist; the toast offers Show in folder; History lists the certificate. Verdict matches the results (no "Certified pass" if the calibration profile is missing or older than 12 months). | `H-20/3` seconds, verdict, file names |
| 4 | Open the PDF. Check page breaks, the full content hash, the fingerprint in large type, the QR code, photo alt text (PDF reader accessibility panel) and the disclaimer. | All present and legible on A4; nothing cut at page edges. | `H-20/4` pages, PASS/FAIL |
| 5 | Scan the PDF's QR code with a phone camera app (screen and a paper print). | The phone shows exactly `deckchek:cert:v1:` followed by 64 hex characters equal to the printed content hash. No name, serial or model. | `H-20/5` screen PASS/FAIL, paper PASS/FAIL |
| 6 | Copy the `.deckchek-cert.json` to a second PC with DeckChek. Verify certificate > choose the file (also try drag and drop onto the window). | VALID, fingerprint equal to the one on the PDF, "issued by this install" NOT shown on the second PC. | `H-20/6` PASS/FAIL, drop works Y/N |
| 7 | On the second PC, open the JSON in Notepad, change one digit of one measured value, save, verify again. | MODIFIED with "content hash mismatch". On the first PC the same file also lists the changed field under "Changed since this install signed it". | `H-20/7` PASS/FAIL, diff field shown |
| 8 | Verify the PDF itself. | The screen explains the PDF carries only the printed hash and QR and asks for the JSON. | `H-20/8` PASS/FAIL |
| 9 | Change the PC clock to after the validity date (or use a 30-day certificate and wait), verify the untouched JSON. Restore the clock. | VALID plus a separate EXPIRED badge. | `H-20/9` PASS/FAIL |
| 10 | Windows only: in `%APPDATA%\com.circuitdriftlabs.deckchek\` open `signing-key.bin` in a hex viewer. Copy it to another Windows user account's app data and try to sign there. | The byte at offset 0x05 is 0x01 (DPAPI; 0x02 means the unprotected fallback). The other user gets "the signing key cannot be read" with "Create new identity"; creating one shows a new fingerprint, and step 6's JSON still verifies VALID. | `H-20/10` byte at 0x05, other-user result, old cert still VALID Y/N |
| 11 | Simulate a PDF failure (run on a PC with the WebView2 runtime repaired/removed, or note any natural failure) and sign again. | An `.html` certificate is written instead of the PDF; verifying it shows the same content hash as its `.json`. | `H-20/11` PASS/FAIL or SKIP with reason |

---

## H-21 Unit vs population comparison (FS-21)

Enable `population` and `packs` under Options > Advanced > Experimental features first. Nothing here touches the network; every step is local. Use the owner's units: Pioneer DJM-A9, Allen & Heath Xone:23C, Rane Twelve MK2, SL-1200MK4 or PLX-CRSS12. Run the tests that produce the metrics in step 1 on at least one unit before starting. Steps 7 to 10 need a second machine with DeckChek installed.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | On the first machine, run the speed test (wow and flutter), the channel separation test and a hum check on one unit, twice on different days if you can. Open Compare, pick the unit and the metric. | Only measured results with no quality warning appear. The Spec tab names the published limit and the margin in words ("Inside the limit with ... to spare" or "Outside the limit by ...") next to the bar, and shows an INSIDE SPEC or OUTSIDE SPEC chip as well as colour. | `H-21/1` unit, metric, value, spec limit shown, margin text |
| 2 | Pick a metric the profile has no spec for (for example Left hum). | The Spec tab says "No published spec for this metric." and shows no bar. | `H-21/2` PASS/FAIL |
| 3 | If you own two units of one model, run the same test on both. Open My units. | The units are listed best first with the open unit marked "(this unit)". The sentence gives its rank ("ranks 1st of 2 of your units"). With one unit it says it is your only unit of that model. | `H-21/3` ranks shown vs values |
| 4 | With two or more runs on the open unit, read "This unit over time". | The sentence compares the latest run with the median of the earlier runs and says better, worse or the same, with the sparkline described in text. | `H-21/4` delta text, matches the runs by eye Y/N |
| 5 | Open Data sharing > "Share results anonymously". Do not tick anything yet. | First-time export has nothing ticked and Save is disabled. The file contents preview is "Nothing selected." | `H-21/5` PASS/FAIL |
| 6 | Tick one result. Read the JSON preview line by line. Save the pack and open the saved `.deckchek-pack` in a text editor. | The preview and the file contain only: format, version, packId, createdMonth (year and month only), appVersion, contributor (a random token) and rows with product, metric, method key and version, value (three significant figures) and unit. No serial number, nickname, date, venue, path, host name or session id anywhere. Search the file for your serial number, your name and your venue: no hits. | `H-21/6` PASS/FAIL, any field you did not expect |
| 7 | On the second machine, Import a pack > choose the file from step 6. | The preview lists the model and metric with a row count and says nothing is added until you confirm. Confirm. The pack appears in the list with its row count. | `H-21/7` PASS/FAIL |
| 8 | Import the same file again. | The preview says it is already imported and confirming changes nothing (still one pack, same row count). | `H-21/8` PASS/FAIL |
| 9 | Open Compare > Population for a unit of the same model on the second machine. | With fewer than 20 contributors the text reads "Not enough data (N of 20)" and no percentile is shown; with fewer than 8 only individual dots are drawn. The self-selection caveat is shown. | `H-21/9` N shown, no percentile Y/N |
| 10 | Remove the imported pack. | The pack and its rows disappear, the Population tab returns to "Import a pack to see how your unit compares", and the status line says percentiles were recomputed. | `H-21/10` PASS/FAIL |
| 11 | Import a file that is not a pack (rename any .json to .deckchek-pack) and a pack you edited by hand to add a field `"serial": "x"`, then one with a value of 9999 for wow and flutter. | Each import is refused with a plain message ("This is not a DeckChek pack", missing or unknown fields, "value is outside the plausible range" with the row number). Nothing is added. | `H-21/11` message per file |
| 12 | In Options > Experimental features turn `packs` off, then `population` off. | With `packs` off the Population tab and Data sharing disappear and Compare keeps Spec and My units. With `population` off the Compare entry disappears from the rail. | `H-21/12` PASS/FAIL |
| 13 | Keyboard and screen reader: reach every control in Compare with Tab and the arrow keys on the tabs; open the import dialog and press Esc. | Focus is always visible, Esc closes the dialog and focus returns to the button that opened it, and the screen reader reads the percentile sentence from the strip plot. | `H-21/13` PASS/FAIL |
| 14 | Windows only: save and import a pack to a folder whose path contains non-ASCII characters (for example `C:\Users\Zoë\Müsik`). | Both work; the status line shows only the byte count and a short checksum, never the full path. | `H-21/14` PASS/FAIL |

---

## H-22 Service worksheets (FS-22)

Enable `service` under Options > Advanced > Experimental features first. Use a made-up customer ("Test Customer", phone 01234 567890, test@example.com) so no real personal data enters the database or the results; delete the jobs at the end. Use the Audio 8 DJ as the capture interface for every measurement.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Press Ctrl+J. Enter the test customer, pick the SL-1200MK4 unit, fault "Pitch drifts at 0 %", tick Dust cover, add a phone photo taken with location on, caption "Arrival". Save. | Job J-<year>-0001 opens in Intake. The photo shows with its caption. | `H-22/1` job number, photo shown Y/N |
| 2 | Copy the stored photo out of `<app data>/photos/<sha256>.jpg` and inspect it with an EXIF viewer. | No GPS or other EXIF fields; the file name is its SHA-256. | `H-22/2` EXIF present Y/N, GPS present Y/N |
| 3 | Move the job to Diagnosing. Before step: select the SL-1200MK4 speed tests (33 and 45 rpm) and run them on the test record. | Results are saved to the unit and listed as before results of the job; the run banner shows "Service job ... Before tests". | `H-22/3` speed error % at 33 and 45 rpm |
| 4 | Work step: adjust the pitch trimmer (owner's normal procedure). Add labour "Pitch trimmer adjust", 20 min, and a note with Ctrl+Enter. Amend the note once. | Totals read "Labour 0.33 h". The original note is kept and marked amended. | `H-22/4` totals text, amended shown Y/N |
| 5 | Move to Repairing, then Testing. After step: run the same speed tests again. | The comparison shows the speed error before, after, the change with ± and a word result; improved if the error fell by more than the combined uncertainty. | `H-22/5` before %, after %, result word |
| 6 | Repeat steps 1, 3 and 5 for the Rane Twelve MK2 (platter speed before and after a pitch calibration). | Same as above for the second job. | `H-22/6` job number, before %, after %, result |
| 7 | DJM-A9: open a job, run channel balance (L/R) on channels 1 to 4 as before tests, clean the channel faders, run them again as after tests. Skip one channel's after test on purpose. | The comparison lists each channel; the banner reads "Compare is incomplete, 1 of N metrics have no after value". | `H-22/7` balance dB before and after per channel, partial banner text |
| 8 | Mark the SL-1200MK4 job Ready. Sheet step: export PDF with neither box ticked, then with "Include costs" and "Include customer details". Print both on paper. | Without the boxes: no prices, no customer. With them: prices and the test customer appear. Both show the fault, the before/after table, the work log, the signature lines and "Measurements are indicative bench results, not a warranty." | `H-22/8` PDF pages, paper review OK Y/N |
| 9 | Windows: export the sheet as HTML into a folder whose full path is longer than 200 characters, then into a folder named `CON` (expect refusal). | The long path works; the reserved name is refused with a message. | `H-22/9` long path OK Y/N, CON refused Y/N |
| 10 | Create a diagnostics bundle (Help > Support). Search every file in the zip for "Test Customer", "567890" and "test@example.com". | No match. | `H-22/10` matches found (expect 0) |
| 11 | Cancel the Rane job: it becomes read-only. Delete it by typing its job number. Then delete the other two jobs; on the last one keep "Also delete the customer's details" ticked. | Cancel keeps the data and hides the work forms. Delete needs the exact job number (Esc keeps the job). The delete dialog offers the customer erase only on the customer's last job; afterwards the test customer is no longer offered under Existing customer. | `H-22/11` read-only Y/N, delete OK Y/N, customer erased Y/N |

---

## H-23 Venue fleet dashboard (FS-23)

The fleet screen and the start-up banner are on by default (flag `fleet`). Model the owner's gear as two booths: **Home** (PLX-CRSS12, SL-1200MK4, DJM-A9) and **Second booth** (Rane Twelve MK2, Xone:23C, DDJ). Use the real DeckChek database copy, not a fixture. Restarting means closing and reopening the app.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Open Fleet > Venues & positions. Add the venue "Home", then the booth "Home booth", then positions "Left deck", "Mixer", "Right deck". Repeat for "Second booth" with its three positions. | Each save appears in the tree at once. With no venues the page first showed the three-step "Add your first venue" guide. | `H-23/1` PASS/FAIL |
| 2 | Place PLX-CRSS12, SL-1200MK4 and DJM-A9 in the Home positions: one by drag and drop, one with the asset's "Move to…" menu, one from Equipment > asset > "Place in venue" (then the Overview side panel). Place the second-booth gear the same way. | Every asset shows Venue / Booth / Position on Overview. Moving an asset adds a "Moved from A to B" event (names, not ids) to Events log. | `H-23/2` PASS/FAIL, how many methods worked |
| 3 | On Overview, check the four tiles and the grid. Run a device test on one asset that you know fails (or unplug its cable), then Refresh. | Never-tested assets read "Never tested", not "Healthy". The failing asset reads "Attention" with the real test name as a chip. A unit tested more than 90 days ago (change the "Review results after" setting to 1 day to check) reads "Review". | `H-23/3` tile counts, PASS/FAIL |
| 4 | In an asset's side panel add the reminder "Check fader" every 7 days (warn 3). Log a maintenance event "clean" for it dated 10 days ago (Events log, date field, "Completes reminder" = Check fader). Then add the reminder "Stylus check" every 300 tracked hours. | The 7-day reminder is "Overdue". The log entry appears in Events log. The hours reminder shows tracked hours remaining and says the figure is an estimate. | `H-23/4` PASS/FAIL |
| 5 | Close and reopen DeckChek. | Within a few seconds a banner appears at the top of the window without taking focus: "N maintenance items need attention: X overdue, Y due soon." with Review and "Dismiss for 1 day". The Fleet rail entry shows a count. A screen reader announces it politely. | `H-23/5` banner text, PASS/FAIL |
| 6 | Press "Dismiss for 1 day", then restart. Open Reminders. | The banner and badge stay away after the restart. The reminders are still listed (with "snoozed") and nothing was deleted. | `H-23/6` PASS/FAIL |
| 7 | Create seven overdue reminders (a 1-day interval on seven assets works). Restart. | The banner lists five and says "and 2 more". | `H-23/7` PASS/FAIL |
| 8 | Overview: filter to one booth, press Export CSV, open the file in Excel on Windows. | Excel opens it with correct accents (UTF-8 BOM), one row per filtered asset, no other rows. Set an asset nickname to `=1+1`; the cell shows `'=1+1` as text and does not calculate. | `H-23/8` PASS/FAIL |
| 9 | Venues & positions > "Print Home booth sheet". Preview, print to PDF, and also print on paper. | One page: each position with its asset, serial, last tested date, health and next due item, empty positions marked "Empty", and a blank notes box. No city or address. Readable in black and white. | `H-23/9` pages, PASS/FAIL |
| 10 | Try to delete a position that holds an asset, first with no destination, then with "Move assets to Unplaced". Type the wrong name once. | Blocked until you choose a destination and type the exact name; the counts are shown first. The asset is kept and shows "Unplaced". | `H-23/10` PASS/FAIL |
| 11 | Keyboard only: `/` filters, arrow keys move between grid rows, Enter opens the side panel, `E` exports, `N` jumps to the new-event form, arrow keys switch tabs. | Every step works without a mouse and focus is always visible. | `H-23/11` PASS/FAIL |

---

## H-31 Timecode doctor live monitor (FS-31)

Enable `liveMonitor` under Options > Advanced > Experimental features first. The live monitor only listens: it never plays sound and never opens an input in exclusive mode. Steps 1 to 6 are the **M8-monitor-spike**: whether DeckChek can capture through WASAPI shared mode while Serato or Traktor holds the same interface is UNKNOWN. The app does not claim it works: the screen says "not verified ... hardware test H-31". Record what really happens; the owner decides the supported setups from these results. If DJ software audio glitches at any point, stop the monitor at once (Ctrl+Shift+M) and record it.

Rig: SL-1200MK4 on Audio 8 DJ inputs 1-2 (deck A), PLX-CRSS12 on inputs 3-4 (deck B), Traktor Scratch MK2 and Serato CV02.5 vinyl, Traktor Pro, Serato DJ Pro, DJM-A9 (USB), Xone:23C or the laptop line-in, a passive RCA Y-splitter, Windows Task Manager.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Spike A, DJ software first: start Traktor Pro on the Audio 8 DJ (ASIO) and play Traktor MK2 vinyl on deck A for 30 s. In DeckChek pick the Audio 8 DJ in the top bar (note every Audio 8 DJ entry the input list shows), pair 1-2, format Traktor Scratch MK2, and press Start monitoring. Listen to Traktor for 2 min. | UNKNOWN (this is the question). Either the monitor runs (deck A chip OK) with no audible glitch and no Traktor audio-dropout warning, or the start fails. If it fails, the screen shows "Another program is using this audio device exclusively" with the three workarounds, not a generic error (AC-5). | `H-31/1` input names listed, opened Y/N, error text, Traktor glitch Y/N, deck A SNR dB |
| 2 | Spike B, DeckChek first: stop Traktor. Start the monitor on the same input, then start Traktor Pro. | UNKNOWN. Record whether Traktor still gets the Audio 8 DJ (its audio setup shows the device) and whether the monitor keeps running. If Traktor cannot open the device, stop the monitor and record it: the monitor must never block the DJ software. | `H-31/2` Traktor opened device Y/N, monitor still running Y/N, message shown |
| 3 | Repeat steps 1 and 2 with Serato DJ Pro and CV02.5 vinyl (format Serato CV02.5). | As steps 1 and 2. | `H-31/3` results as in steps 1 and 2 |
| 4 | DJM-A9 USB path: route deck A through the DJM-A9 USB sends with Serato or rekordbox running, and try to monitor the DJM-A9 input. | UNKNOWN (spec 31 section 8: DJM-A9 USB audio class behaviour). Record the outcome as in step 1. | `H-31/4` opened Y/N, error text, glitch Y/N |
| 5 | Y-split path: split deck A's RCA with the passive Y-splitter, one leg to the Audio 8 DJ (Traktor, normal use), the other to the Xone:23C or the laptop line-in. Monitor that second input with Traktor running. Play 2 min, scratch for 30 s. | The monitor runs with deck A chip OK. Traktor keeps lock and plays normally (watch for a level drop or lock loss caused by the splitter loading the cartridge). | `H-31/5` monitor SNR dB, Traktor lock issues Y/N, level change in Traktor dB |
| 6 | Summarise the spike: which of the four workarounds (shared/WDM endpoint, thru/aux output, split cable, multi-client driver) work on this rig. | One line per path: works, does not work, or not tried. This decides the FS-31 MVP scope and the wording of the not-verified note. | `H-31/6` table of paths |
| 7 | AC-1: on a working path from steps 1 to 5, monitor both decks (Also monitor deck B) with healthy vinyl for 2 min. | Both chips read OK (text and icon). Each card shows SNR, level, "Locked, forward", drift and hum. The tray icon is a green disc with the tooltip "DeckChek live monitor: OK". | `H-31/7` SNR A and B dB, tray shown Y/N |
| 8 | False-alarm check: for 5 min cue, back-cue, hand-stop, backspin, scratch and ride the pitch fader (+-8 %) on deck A. | No warning or critical toast. The lock line says "cueing or scratching: alarms paused" while you move the record. | `H-31/8` warnings, criticals, any false alarm text |
| 9 | AC-2 and AC-3 provocation: (a) put a small dust ball on the stylus for 10 s; (b) lift and drop the needle three times within 10 s on the same groove area; (c) wiggle or briefly pull deck A's RCA three times within 10 s. | (a) If the SNR falls 6 dB or more under its baseline for 5 s: one amber toast "Deck A: timecode SNR dropped N dB", chip Watch, tray amber triangle; no repeat within 60 s. Under 12 dB for 2 s: red. (b) and (c): a critical toast about dropouts (role alert), chip Fault, tray red octagon. | `H-31/9` toast texts and times, chip states, tray shapes |
| 10 | AC-4: disconnect the PLX-CRSS12 ground wire for 20 s while deck B plays. Reconnect it. | If hum rises 10 dB or more: a warning naming 50 or 60 Hz with "Likely cause: ground loop/cable". Nothing is said to alter mains wiring. | `H-31/10` hum rise dB, toast text, time to toast |
| 11 | Lift deck B's needle and leave it up for 15 s. | After 10 s an info line "No signal on Deck B: vinyl stopped or lifted?" appears. Chip reads No signal. No alarm. | `H-31/11` info shown Y/N, alarm Y/N |
| 12 | AC-8: while monitoring, close the main window. Use the tray menu: Mute toasts for 30 min, then Open DeckChek, then close the window again. Provoke step 9(c) while the window is hidden. | The window hides; the tray icon stays and changes shape and colour with the state. Open brings the window back with the events from the hidden time in the event list. On Linux or when no tray exists, the window closes normally and the badge says the tray is not available. | `H-31/12` tray stayed Y/N, events while hidden Y/N, mute honoured Y/N |
| 13 | Device lost: unplug the Audio 8 DJ USB cable for 15 s while monitoring, then plug it back in. | A critical "Audio device lost. Retrying every 5 s." event, tray red. Within about 5 s of replugging: "Audio device is back. Monitoring again." | `H-31/13` both messages Y/N, seconds to recover |
| 14 | AC-6 CPU and memory: monitor both decks for 2 h with vinyl playing (a set or a loop). Record DeckChek's CPU with Task Manager (Details, CPU column) or `Get-Counter '\Process(deckchek*)\% Processor Time' -SampleInterval 10 -MaxSamples 720` (divide by the number of logical processors for "% of one core" as Task Manager shows it, or keep the raw value as % of one core). Note private memory at 5 min and at 2 h. | Average under 2 % of one core (tunable budget). Memory flat: under 10 MB growth between 5 min and 2 h. Also record the "mean ms per hop" of `node --test tests/perf/*.test.mjs` with `DECKCHEK_PERF_STRICT=1` on the same laptop. | `H-31/14` average CPU % of one core, peak %, memory at 5 min and 2 h MB, perf test mean ms |
| 15 | AC-7: stop the monitor (Stop button or Ctrl+Shift+M). Open Session logs > View, then Export JSON. Open History and filter on Live monitor. | The session is listed with its alerts; View lists every event and the per-minute table; the JSON has `version`, `session`, `events`, `minutes`. History lists the session. | `H-31/15` events count, minutes count, History row Y/N |
| 16 | Quit from the tray while monitoring. Start DeckChek again and open Session logs. | DeckChek exits within about 2 s. The last session is closed (not "not closed") with its events. | `H-31/16` exit time s, session closed Y/N |
| 17 | Retention: set "Keep session logs for" to 1 day and save. | Logs older than one day are removed; the current day's logs stay. Restore 90 days afterwards. | `H-31/17` logs removed count, restored Y/N |

---

## H-32 MIDI mapper studio (FS-32)

Enable `mapperStudio` under Options > Advanced > Experimental features first. You need the Pioneer DDJ controller (model to be confirmed by the owner; any DDJ works, nothing here depends on the model), the Allen & Heath Xone:23C, Mixxx 2.4 or newer and VirtualDJ 2023 or newer on the test laptop. Before step 1, run the DDJ's MIDI coverage test on the Devices screen and press Save learned map, naming at least Play, Cue, Sync, the tempo fader, the jog wheel, jog touch, hot cue pads 1 to 8, loop in/out, an FX on button and Shift for deck 1 and 2. DeckChek never changes a DJ program's files: you copy the exported files yourself.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Open MIDI mapper. Pick the DDJ unit and press Load MIDI map. | The control list shows the learned controls with MIDI type, channel and number. Most get a suggested function (for example "Deck 1 play / pause"); the rest say Unassigned and the count is shown as "N unmapped". | `H-32/1` controls loaded, suggested, unmapped |
| 2 | Press L (or Learn), then press a pad you did not learn. Press Esc during a second Learn. | The pad appears as a new row ("Learned Note … ch …"). Esc stops listening and says so. | `H-32/2` PASS/FAIL |
| 3 | Assign every unassigned control you need (select a row, Enter, type in the search, Enter). Assign Shift + Play to Sync on the Shift layer. Press Ctrl+Z once and redo the last assignment. | The function shows in the row. Ctrl+Z undoes only the last change. The Export pane says "Ready to export" with no errors. | `H-32/3` PASS/FAIL |
| 4 | Make a conflict on purpose: select the Shift + Play row and set its Layer to Base layer, so it shares Play's message on the same layer. Look at Export. | Save is disabled; the problem lists both controls; both rows say "Conflict" in words. Undo restores it. | `H-32/4` PASS/FAIL |
| 5 | Target Mixxx, press Save… (or Ctrl+S) and choose a folder. Copy both files to the Mixxx controllers folder named in the message. In Mixxx open Preferences > Controllers, pick the DDJ and the DeckChek mapping. | Mixxx lists the mapping by its name and loads it without a script error in the log. | `H-32/5` Mixxx version, loads Y/N, log errors |
| 6 | In Mixxx with two tracks loaded: press Play, Cue (hold), Sync, move the tempo fader, use hot cues 1 to 8 (set and trigger), loop in/out, an auto loop, FX on, and Shift + Play. Touch and turn the jog wheel while playing. | Each control fires the intended deck control (AC-1). The tempo fader moves smoothly (14-bit when learned as 14-bit). Jog touch scratches, jog turn nudges. Shift + Play does Sync, not Play. LEDs for Play/Cue/hot cues follow the deck state. | `H-32/6` per control PASS/FAIL, notes |
| 7 | Target VirtualDJ, press Save…, choose Documents/VirtualDJ (desktop app) or copy the two files into Documents/VirtualDJ/Devices and /Mappers. Restart VirtualDJ and choose the mapping in Settings > Controllers. If VirtualDJ supports the DDJ natively, tick "VirtualDJ already supports this controller" before saving. | VirtualDJ shows the definition and the mapping. Play, Cue, Sync, pitch, hot cues, loop, FX on and Shift + Play behave as in step 6. Note every action VirtualDJ rejects or treats differently: the VirtualDJ mapper format is unverified (FS-32 §5). | `H-32/7` VirtualDJ version, per control PASS/FAIL, rejected actions |
| 8 | Back in DeckChek, open the exported Mixxx .midi.xml (with its .js) and then the two VirtualDJ files with Open file…. | Both open with the same controls and functions as before export (round trip); nothing is listed as custom. | `H-32/8` PASS/FAIL |
| 9 | Import an existing third-party Mixxx mapping for a controller you own (from your own Mixxx install, with its .js file). Save it again as Mixxx. Load the re-saved copy in Mixxx. | Recognised controls show functions; the rest are listed as "Custom (preserved, Mixxx)". The re-saved mapping keeps the original author and script and still works in Mixxx. | `H-32/9` mapping name, recognised, custom, works Y/N |
| 10 | Target Traktor, then Serato. Save each report. In Traktor's Controller Manager and Serato's MIDI mode, enter three rows by hand from the report. | The target chips read "Report only" and "Experimental"; the reports list each control's MIDI message, deck and the command to pick; the three entered rows work. | `H-32/10` PASS/FAIL |
| 11 | Repeat steps 1, 5 and 6 with the Xone:23C (learn its MIDI controls; it has no jog wheel). | The mapper works with no official MIDI list (learn only); the exported Mixxx mapping fires the learned controls. | `H-32/11` PASS/FAIL |
| 12 | Check whether the Pioneer PLX-CRSS12 and the DJM-A9 send MIDI over USB (Devices > MIDI coverage). If they do, learn three controls and export to Mixxx. | Record whether each sends MIDI and whether the exported controls fire in Mixxx (FS-32 §8 open question). | `H-32/12` CRSS12 MIDI Y/N, DJM-A9 MIDI Y/N, works Y/N |

## H-33 Gear ledger (FS-33)

Enable `gearLedger` under Options > Advanced > Experimental features first (and `certificates` for step 6). Use the owner's real database with the SL-1200MK4, PLX-CRSS12, Rane Twelve MK2, DJM-A9, Xone:23C, Traktor Audio 8 DJ and the DDJ (model as recorded in H-00 step 4). Before step 1, type each unit's real serial number in Equipment, add one private note per unit with a made-up price (for example "Paid 1234 EUR"), attach two phone photos per unit (straight from the phone, so they carry EXIF and GPS), and sign one speed-test certificate (H-20) for the SL-1200MK4 and the PLX-CRSS12. Write down every serial, the made-up prices, your Windows user name and the phone's GPS position (from the photo's properties) before you start: steps 4, 9 and 11 search for them. Use a new, empty folder for every export.

| # | Action | Expected | Record |
|---|---|---|---|
| 1 | Open Gear ledger (rail, or Equipment > a unit > Gear ledger…). | Step 1 lists every unit with words for its state ("2 photos · 1 certificate · …"). The unit opened from Equipment is already ticked. | `H-33/1` units listed, PASS/FAIL |
| 2 | Tick all seven units, Next. Look at the privacy step with the Public preset. | Serial numbers "Hidden", nickname, purchase month, service descriptions, certificates and private notes unticked. Every checkbox in the matrix can be reached with Tab and toggled with Space. | `H-33/2` PASS/FAIL |
| 3 | Next: preview. Switch Light and Dark. | The preview shows each unit with manufacturer and model only, the photos, service dates; no serial, no price, no note. "What will be public" lists the counts and "Never included: purchase price, location and venue, file paths and user names, photo metadata". | `H-33/3` PASS/FAIL, screenshot |
| 4 | Next: export, Folder, Export…, pick the empty folder. Open `ledger/index.html` by double-click with Wi-Fi off. | "Saved to <folder>\ledger" and "Revision 1 recorded". The page opens fully offline in Edge: all photos, no broken images, "✓ The ledger data on this page matches this hash." | `H-33/4` PASS/FAIL, time to open |
| 5 | Right-click one exported photo in `ledger/assets/…` > Properties > Details (or open it in an EXIF viewer). Check its size. | No camera, date or GPS fields; the long edge is 1600 px or less. | `H-33/5` EXIF present Y/N, size px |
| 6 | Back in DeckChek, Privacy > Insurance, tick "Signed test certificates" for the SL-1200MK4 only (its row in the matrix). Preview, then export to a second empty folder. | Serials show as `****` plus the last 4 characters; the summary warns that included certificates show the full serial and tester name. The export step says "revision 2 (last: 1)". | `H-33/6` PASS/FAIL |
| 7 | Open the second export's `index.html` offline and press Verify certificate under the SL-1200MK4. | "✓ Match: the recomputed SHA-256 equals the certificate's content hash…", then either "The Ed25519 signature checks out" or "Hash checked, signature not checked by this browser". | `H-33/7` wording shown, browser and version |
| 8 | Open the certificate JSON file from `ledger/certificates/` in Notepad, change one digit of a measured value, copy all, paste into "Check a certificate" and press the button. Then do the same with the untouched file. | Edited: "✗ Mismatch …". Untouched: "✓ Match … This certificate is listed in this ledger." The untouched file also verifies VALID in DeckChek's Verify certificate screen. | `H-33/8` PASS/FAIL |
| 9 | In a terminal in each export folder run `findstr /s /i /m "<serial> 1234 <windows user name> GPS Exif" *` (one search per value, every serial from your list). | Export 1: no match for any value. Export 2: only the SL-1200MK4's full serial, and only inside `certificates/` and the certificate block of `index.html`/`ledger.json`. | `H-33/9` matches per value |
| 10 | Open the second export on a phone (copy the folder, or after step 11) and print `index.html` to PDF from Edge. | The phone layout has no sideways scrolling; print hides the buttons and the paste box and keeps each unit together. | `H-33/10` PASS/FAIL, PDF attached |
| 11 | Publish the first export: new test repository, upload the contents of `ledger`, Settings > Pages > Deploy from a branch (main, root). Open the Pages address. Note the exact wording GitHub uses today. | The page looks like step 4; DeckChek never asked for a GitHub login. Re-run the step 9 search on the published page source (View source, Ctrl+F). | `H-33/11` URL, GitHub wording, leaks Y/N |
| 12 | Single file: Privacy > Public, Export > "Single HTML file", save, open it offline. Then add photos until the photos exceed 5 MB and look at the Format choice again. | The single file opens with photos inside. Over 5 MB the single-file choice is disabled with the reason. | `H-33/12` PASS/FAIL, file size |
| 13 | Unplug the export drive (or pick a read-only folder) and export again. | "Export failed: …" in words; no revision is recorded (the next export still says revision 3). | `H-33/13` PASS/FAIL |
| 14 | Esc on the privacy step; Ctrl+E on step 1. | Esc returns to step 1 and says "Ledger export cancelled"; Ctrl+E jumps to the export step. | `H-33/14` PASS/FAIL |

---

## 9. Open items and defaults for the owner

These need an owner decision. Until they are decided, the defaults below apply and are recorded in H-00 step 9.

| Item | Default in these scripts | Why it is open |
|---|---|---|
| Speed tolerance for H-06 steps 2 and 3 | Use the tolerance printed on the test record's sleeve; if none, record the value and mark PASS only when you accept it | Spec 06 gives no number. |
| Carrier tolerance for H-06 steps 4 and 5 | Observed carrier within 1 % of the catalogue value | Spec 06 asks to record observed carriers but gives no tolerance. Proposed, not decided. |
| Pioneer DDJ model | Recorded in H-00 step 4; DDJ steps are SKIP until known | Plan lists "model TBC". |
| Whether H-02 test issues go to a private repo | Yes, private test repo only | Spec 02 says "attach zip to test issue" without naming the repo. |
| Numbers 04 and 05 | Not used | The feature index has no FS-04 or FS-05 (intentional gaps). If the plan intends eight real scripts, the owner or orchestrator should say which features replace H-04 and H-05. |
| Hum thresholds (H-10 pre-gig step 4) | Spec defaults: warn within 40 dB, fail within 25 dB of carrier level | Spec 10 section 6 marks them UNKNOWN. H-10 calibration C1 to C4 measures them. Also confirm whether the spec means carrier-relative or floor-relative (the script records both). |
| PLX-CRSS12 USB audio name and format (H-10 step 12) | Record what the OS and DeckChek show | Spec 32 lists it as UNKNOWN. No rekordbox preset is created: the owner's gear list has no rekordbox. |
| SNR classes for control-vinyl wear (H-13) | 25 dB good, 15 dB bad, with phase and dropout cuts from spec 13 section 6 | Unvalidated against software lock loss. H-13 calibration C1 to C5 sets them. |
| Scratch skip thresholds (H-14) | Spec 14 section 6 values, applied as written | Spec 14 section 9 asks for skip thresholds calibrated on real gear. H-14 calibration uses natural skips on a spare record only. Owner decision: whether deliberate skips on a sacrificial record are allowed. |
| Stylus degradation thresholds (H-12) | Spec 12 section 6 defaults | No authoritative source. H-12 calibration C1 and C2 proposes 3 standard deviations of run-to-run noise. |
| Rated life per stylus model (H-12) | 500 h generic DJ estimate | Spec 12 UNKNOWN. H-12 C3 records the manufacturer's figure or UNKNOWN. |
| Velocity, reversal and lock-loss tolerances (H-14 steps 5, 7, 8) and worst-bin tolerance (H-13 step 8) | Proposed in each step | Specs 13 and 14 give no tolerance. |
| Results repository visibility | Assume public; no serials, usernames or paths in results | The owner test repository may be published (spec 33 uses GitHub Pages). |

## 10. Later milestones (not normalised here)

These specs also have manual hardware steps in their §8. They keep their spec-number IDs and will be written into this file in the milestone that ships the feature. Each step there still needs the Action / Expected / Record form.

| ID | Spec | Milestone |
|---|---|---|
| H-10 | Pre-gig check (120 s budget, rig verdicts) | M6 |
| H-12 | Stylus wear tracker | M6 |
| H-13 | Control-vinyl wear map | M6 |
| H-14 | Scratch stress test | M6 |
| H-11 | DVS latency and buffer tuner | M6 |
| H-20 to H-23 | Used-gear certificate, unit comparison, service worksheets, fleet dashboard | M7 |
| H-30 | Mobile companion | M8 (blocked) |
