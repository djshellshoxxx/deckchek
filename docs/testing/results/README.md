# Hardware test results

This folder holds one results file per release, filled in after the hardware scripts in [`../HARDWARE-TEST-SCRIPTS.md`](../HARDWARE-TEST-SCRIPTS.md) have been run on the owner's gear. The scripts are the release gate for anything that needs real hardware (plan §2, §1.1).

## 1. File naming

- One file per release: `docs/testing/results/v<version>.md`, for example `v0.0.5.md`, or `v0.1.0-rc.1.md` for a release candidate.
- A release that is run more than once (a re-test after a fix) keeps the same file. Add a new dated section at the bottom titled `## Re-run YYYY-MM-DD`. Do not overwrite earlier results.
- Create the file at the start of the test run (H-00 step 10), not after.

## 2. What to record

For each script, one row per step. Use the step IDs from the scripts, for example `H-01/4`.

- **Result**: `PASS`, `FAIL`, or `SKIP`. A SKIP always has a reason in the Notes column, e.g. "no DDJ owned".
- **Observed**: the value you measured or read, with units. Write "n/a" if the step only has a yes/no outcome.
- **Notes**: anything that differs from Expected, the wiring or switch positions used, and the link to any issue.
- **Issue**: link to the issue for every FAIL. Use the issue number, not a screenshot.

Write what you observed, not what you expected. If a value is out of tolerance, say so and do not round it into PASS.

## 3. Release gate

A release is ready for the hardware gate when:

1. H-00 is complete for this release.
2. Every script for a feature in this release is complete: every step is PASS, or FAIL/SKIP with a reason the owner has accepted.
3. No FAIL is open without an issue. Any FAIL that can be reproduced in software has a fixture or test added (plan §2 rule 3).
4. The waivers, if any, are listed at the top of the results file with the owner's initials and date.

## 4. Privacy rules for committed files

These files are committed to the repository and may be public. Do not write:

- serial numbers of any device, cartridge or interface,
- Windows usernames, computer names, or any full path that contains them (`C:\Users\...`),
- email addresses, account names, or photos of the rig,
- prices or purchase details.

Refer to items by model and short label (for example "SL-1200MK4, deck B"). Where a check needs a serial (H-02 step 6), record only the count of matches.

## 5. Template

Copy this block into a new file `docs/testing/results/v<version>.md` and fill it in.

````markdown
# Hardware test results: v<version>

- **Release:** v<version>
- **Build:** <short commit>, installed from <installer file name>
- **Run dates:** YYYY-MM-DD to YYYY-MM-DD
- **Tester:** <name or handle>
- **Rig:** see H-00 rows below (no serial numbers)
- **Overall:** COMPLETE / INCOMPLETE (<reason>)

## Waivers

| Script | Step | Reason | Owner initials | Date |
|---|---|---|---|---|
| | | | | |

## H-00 Baseline

| Step | Result | Observed | Notes | Issue |
|---|---|---|---|---|
| 1 | | Windows edition and build | | |
| 2 | | DeckChek version and commit | | |
| 3 | | Driver and software versions | | |
| 4 | | DDJ model | | |
| 5 | | Cartridge model | | |
| 6 | | Wiring and switch positions | | |
| 7 | | Known-good run: buffer, rate, result | | |
| 8 | | Traktor displayed latency (ms) | | |
| 9 | | Tolerances used | | |

## H-01 First-run wizard

| Step | Result | Observed | Notes | Issue |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | Device name, sample rate | | |
| 4 | | Peak dBFS, verdict | | |
| 5 | | | | |
| 6 | | Mixer used, verdict | | |
| 7 | | Asset names | | |
| 8 | | Asset count before/after | | |
| 9 | | Asset count | | |
| 10 | | Error panel text | | |
| 11 | | | | |
| 12 | | Banner text | | |
| 13 | | | | |

(Add a section for each other script run in this release, using the same columns. Keep the step order from the script.)

## Failures and follow-up

| Step | Summary | Issue | Fixture or test added |
|---|---|---|---|
| | | | |

## Sign-off

- Result: COMPLETE / INCOMPLETE
- Owner: <initials>, <YYYY-MM-DD>
````
