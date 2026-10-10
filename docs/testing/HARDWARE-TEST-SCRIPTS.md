# Hardware test scripts

Status: draft for owner review (M5). Scope: the manual hardware steps from the feature specs' §8 that belong to milestone M5, plus the baseline rig check they all depend on. Plan reference: [`docs/DEVELOPMENT-PLAN.md`](../DEVELOPMENT-PLAN.md) §1.1 and §2 ("Manual hardware scripts"). Results are recorded per release in [`docs/testing/results/`](results/README.md).

## 1. How to use this document

- Run **H-00 (baseline)** once per rig and once per release. Then run each script for the features the release ships.
- Each script is a numbered list of steps. Each step has four parts: **Action** (what you do), **Expected** (what you must see), **Record** (where the observed value goes), and a result of PASS, FAIL, or SKIP (with a reason).
- A FAIL is not a silent failure. Write it into the release results file, open an issue, and (plan §2, regression rule 3) make a synthetic fixture for it if the failure can be reproduced in software.
- A script is complete when every step is PASS, or FAIL/SKIP with a written reason that the owner has accepted. Release gate: H-00 and every script for a shipped feature must be complete. Waivers are written in the results file, signed by the owner.
- Do not record serial numbers, Windows usernames, or full profile paths in any results file. Those are committed to the repository and may be public (see [`results/README.md`](results/README.md) §4).

Where a spec gives a number, the script uses it. Where a spec gives no number, the step says "record the observed value" and the owner sets the tolerance in H-00 step 9. Those open numbers are listed in section 9.

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
| H-15 | FS-15 booth feedback and hum hunter | Hum isolation steps on three mixers, feedback step test, abort timing, stop on navigation and close | SL-1200MK4, Twelve MK2, DJM-A9, Xone:23C, Audio 8 DJ, Pioneer monitors, laptop charger, a loop recording cable |

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
| Results repository visibility | Assume public; no serials, usernames or paths in results | The owner test repository may be published (spec 33 uses GitHub Pages). |

## 10. Later milestones (not normalised here)

These specs also have manual hardware steps in their §8. They keep their spec-number IDs and will be written into this file in the milestone that ships the feature. Each step there still needs the Action / Expected / Record form.

| ID | Spec | Milestone |
|---|---|---|
| H-10 | Pre-gig check (120 s budget, rig verdicts) | M6 |
| H-12 | Stylus wear tracker | M6 |
| H-13 | Control-vinyl wear map | M6 |
| H-14 | Scratch stress test | M6 |
| H-20 to H-23 | Used-gear certificate, unit comparison, service worksheets, fleet dashboard | M7 |
| H-30 | Mobile companion | M8 (blocked) |
| H-31 | Timecode doctor live monitor (2 h CPU budget) | M8 |
| H-32 | MIDI mapper studio (DDJ, Xone:23C) | M8 |
| H-33 | Gear ledger static export | M8 |
