# Feature successor: retained hosted rendering evidence

The standard workflow for [draft PR #79](https://github.com/djshellshoxxx/deckchek/pull/79)
passed its Rust, JavaScript and UI jobs. The fixed source completed **1,411/1,411 UI
checks** and **2,359 JavaScript cases: 2,358 pass, zero failures, one optional Mixxx
skip**. This record preserves complete decoded job logs and selected original
artifacts. Nightly and platform gates were still running when it was written;
this record alone does not authorize merge.

| Item | Exact identity |
| --- | --- |
| Fixed PR head | `f76908766d53992e20382b9cbe73a668a28a6d1a` |
| Complete tree | `32ca272be2daeee6c4c1f47ccd5bd0ed0ac9909e` |
| Base used by this run | `77c26f44710c6dfb1c986fb79266c233e2ae688c` |
| Tested merge | `7c5bf0632cd7f32e63b6f9fd275fd5fc4e46febc` |
| Standard workflow | `44887748227` |
| UI / JavaScript jobs | `136796633767` / `136796633689` |
| Hosted Node | `22.23.5` |

Root fetched the tested merge and verified its complete tree and ordered parents.
Any eventual merge still requires fresh current-base/tree proof, every applicable
exact-source gate and an expected-head guard. Published heads remain fixed.

## Scope and visual review

The **25 Player checks** cover default-off opt-in, optional local file identity,
owned bounded capture, metadata-only download, cleanup and the contextual guide.
Root inspected original desktop preview/result and phone preview PNGs. They show
the selected hash separately from unverified playback and unmeasured pitch. Byte
identity does not establish audio content, actual playback or physical accuracy.

The **16 toolbar checks** cover geometry and accessible input/rate names in browser
and modeled-native states at 320, 420, 800 and 1440 pixels. Root inspected the
420-pixel browser and 1440-pixel modeled-native PNGs; the header controls fit
without the former overlap. This establishes toolbar scope only.

The **three new PDF checks** retain readable placeholders for rounded X/Y-axis
overflow, keep the neighbouring ordinary chart finite and produce an actual
39,637-byte Chromium PDF. Root inspected the original PNG: both unavailable
messages appear below the ordinary reference chart. This is browser rendering,
not a native printer or physical-device result.

The 420-pixel Quick Check screenshot also exposes horizontal overflow inside
the main pane: description text, source cards and the drop area extend beyond
its visible right edge. A passing document-overflow check does not establish
fit inside that scroll container. [Issue #81](https://github.com/djshellshoxxx/deckchek/issues/81)
records this separate usability gap for a successor; its exact cause and corrected
behavior remain unqualified. The successful toolbar result is not extended to it.

## Complete evidence and boundaries

The [evidence directory](evidence/feature-successor-hosted-2026-11-21/) retains
complete decoded UI/JavaScript logs, original JUnit XML, ten selected original
PNG/PDF files, archive provenance and a file-hash manifest. Both ZIP hashes matched
hosted artifact metadata. All 27 saved log chunks were read back and compared
exactly with their tool-returned strings before concatenation; no lines were
edited or substituted by summaries. The full screenshot ZIP remains separately
hashed; selected original images are committed here.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Screenshot ZIP, ID 14700846690 | 34466860 | `290405d800eb8064ad461a21f5db3844936826407d428af840f3b164744d8d3c` |
| JUnit ZIP, ID 14700557551 | 77563 | `0254f089c8da089f52be78e700f702791af9bbbcdc739a3f3961daa61e759414` |
| Complete decoded UI log | 728689 | `96681c5189acbe14b70b9509d85110c448ac21203ab9b6a8dfbb899cc13e5096` |
| Complete decoded JavaScript log | 320074 | `002839f0c8afc19c6a6dc8f242cc6cb94b59996b2ccf67e3a7d62707a1088103` |

All rendered evidence is actual Chromium with a modeled native adapter where
stated, not physical capture or a native app launch. Later History/Ledger list
handling, Mobile routing and #80 export details are outside PR #79. The first
complete local gate on later source `09c9afc` failed two existing audio assertions
and remains held. Neither this hosted pass nor a scoped successor result establishes
a numerical repair for [issue #72](https://github.com/djshellshoxxx/deckchek/issues/72).
