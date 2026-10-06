# Scientific literature and reference books for DeckChek

Reviewed 2026-10-06 UTC / 2026-10-05 Vancouver. This is a focused engineering evidence review, not an exhaustive systematic review. No papers, books, figures, datasets or third-party code are redistributed here.

## Review method

Questions: Which methods can measure speed and electrical quality accurately? Which detectors distinguish vinyl impulses from music? What supports repeat-play alignment? What evidence can attribute a fault to media, stylus, chain or venue?

Included original journal papers, conference proceedings, author/institution-hosted manuscripts, authoritative standards and technical books with directly relevant methods. Excluded forum anecdotes as scientific evidence, unverifiable download mirrors, synthesis effects presented as measurement, and source availability presented as redistribution permission.

Access labels below distinguish full text reviewed, publisher abstract/contents reviewed and bibliographic leads. A paper's results are not DeckChek's results. Books behind subscriptions remain reading leads until the required chapters are obtained. No uninspected numeric tolerances are asserted.

## 1. Detection, audibility and musical false positives

### S01 — Oudre (2015), journal paper, full text

Laurent Oudre. "Automatic Detection and Removal of Impulsive Noise in Audio Signals." Image Processing On Line 5, 267–281.
DOI: [10.5201/ipol.2015.64](https://doi.org/10.5201/ipol.2015.64).
[Publisher](https://www.ipol.im/pub/art/2015/64/), [full text](https://www.ipol.im/pub/art/2015/64/article.pdf).

Locally autoregressive modeling underpins impulse localization and interpolation. Detection and reconstruction are separate stages. The paper supplies algorithmic detail and a reproducible implementation; the publisher identifies the code as GPL-3.0-or-later.

DeckChek use: independently implement and benchmark the detector mathematics, preserving untouched evidence. Evaluation of reconstruction quality does not establish whether the originating fault is a scratch, cable or artistic transient. Do not copy the reference implementation into the proprietary core.

### S02 — Özdoğru, Rund and Fliegel (2025), journal paper, full text

"Performance evaluation of perceptible impulsive noise detection methods based on auditory models." EURASIP Journal on Audio, Speech, and Music Processing 2025, article 2. Published 16 January 2025.
[DOI/full text: 10.1186/s13636-024-00389-9](https://doi.org/10.1186/s13636-024-00389-9).

Compares eight methods on ninety 800 ms real-vinyl excerpts classified by 17 listeners, with randomized training/test splits and threshold optimization. ERBlet-based detection performed best under the study's discriminability evaluation. The small dataset and listening-level calibration limit generalization to DJ genres and different monitoring conditions.

DeckChek inference: retain objective impulse candidates separately from perceptual prominence. Evaluate a simpler baseline against a perceptual candidate before adding complexity. Do not adopt reported accuracy as a release target. The article is CC BY-NC-ND 4.0; linked MATLAB code and datasets need separate license checks.

### S03 — Rund, Vencovský and Bouše (2016), conference paper, full text

"Detection of Clicks in Analog Records Using Peripheral-Ear Model." DAFx-2016.
[Archive](https://www.dafx.de/paper-archive/details/aiUHDdWH-G2hflFJX23noA).
[Five-page paper](https://www.dafx.de/paper-archive/2016/dafxpapers/28-DAFx-16_paper_31-PN.pdf).

Uses listening judgments on 89 short vinyl excerpts, with 30 training and 59 test samples. The conference abstract reports 78.1% correct detection and 3.9% false alarms. Material includes voice and rock'n'roll; the study is not a DnB/hard-trance validation corpus.

DeckChek inference: human labels and explicit false-alarm measurements are essential. Keep recording-level train/test separation and uncertain labels. These are clip-classification results, not event-level precision/recall or guaranteed damage detection.

### S04 — Vaseghi and Rayner (1990), foundational citation, indirect verification

"Detection and suppression of impulsive noise in speech communication systems." IEE Proceedings I (Communications, Speech and Vision), 137(1), 38–46.
Verified as the method reference in [Essentia's official tutorial](https://essentia.upf.edu/tutorial_audioproblems_clickdetector.html). Original paper not independently accessed in this review.

Useful historical origin for LPC residual methods. Do not transfer speech-domain performance to vinyl music or cite an unverified DOI. The tutorial supports robust residual thresholds and reset semantics, not physical scratch attribution.

## 2. Physical vinyl mechanisms

### S05 — Jovanovic (2023), journal review with simulations, publisher record/abstract

Vladan Jovanovic. "Tracing Distortion on Vinyl LPs." Journal of the Audio Engineering Society 71(10), 616–637.
[DOI: 10.17743/jaes.2022.0101](https://doi.org/10.17743/jaes.2022.0101).
[AES record](https://aes.org/publications/elibrary/elibrary-page/?id=22236).

Explains tracing errors from differing cutter and playback-stylus geometries, reviews earlier harmonic-distortion results and compares approximations through simulation. AES lists the article as open access, but the full-PDF endpoint failed during review; only the publisher record/abstract was assessed.

DeckChek inference: high-frequency distortion and inner-side degradation require stylus geometry, alignment, program and chain alternatives. They cannot directly prove groove wear. Obtain the complete article before adopting its simulation equations or numeric predictions.

## 3. Repeat-scan alignment

### S06 — Six and Leman (2014), conference paper, full text

"Panako: a scalable acoustic fingerprinting system handling time-scale and pitch modification." ISMIR 2014.
[Institutional record](https://biblio.ugent.be/publication/5754913).
[Full paper](https://biblio.ugent.be/publication/5754913/file/5754915.pdf).

Uses combinations of key points in a Constant-Q representation to handle time/pitch changes and retrieve timing and scaling information. Evaluation uses fingerprints from over 30,000 songs and reports handling modifications up to ten percent. That is content identification under the authors' tests, not sample-accurate vinyl-defect correspondence.

DeckChek inference: if a simple landmark implementation fails speed-mismatch tests, evaluate scale-aware descriptors as a second candidate. Refine coarse matches locally and preserve skip boundaries. The repository record says the paper remains in copyright; separately audit any Panako implementation before copying.

### S07 — Ellis, author-hosted alignment example

[Fingerprint-based alignment of labels to Beatles audio](https://www.ee.columbia.edu/~dpwe/LabROSA/matlab/beatles_fprint/).
Author technical example, not a journal paper. Page reviewed.

Shows timing-offset trends used to estimate offset and scale. Relevant as an engineering illustration of drift-aware alignment. Dataset/music redistribution rights are separate. Do not label the example peer-reviewed or reuse song audio as our fixtures.

## 4. Metrology, speed and signal analysis

### S08 — AES6-2008 (stabilized 2013), standard, official abstract

[Official AES standards record](https://aes.org/publications/standards-store/?id=15).
Scope: measurement of weighted peak flutter of analogue recording/reproducing equipment.

The official abstract specifies a 3150 Hz tone, frequency demodulation, frequency and time weighting, and a two-sigma statistical readout over at least five seconds. It states that the statistical voltmeter replaces the older quasi-peak meter, which is deprecated.

DeckChek implication: do not equate a generic quasi-peak implementation with current AES6 compliance. Record exact edition, detector and reporting statistic. Full requirements/tolerance tables were not acquired; standardized mode stays experimental until they are implemented and validated. The existing research's bare IEC 1972 reference is insufficient to establish the amended method.

### S09 — JCGM 100:2008, metrology guide, relevant full-text sections

"Evaluation of measurement data — Guide to the expression of uncertainty in measurement."
[DOI/official record](https://doi.org/10.59161/JCGM100-2008E).
[Official full PDF](https://www.bipm.org/documents/20126/2071204/JCGM_100_2008_E.pdf).

Sections 4–6 distinguish uncertainty evaluation, combination and expanded uncertainty; correlated inputs require covariance handling. Free access does not grant republishing the guide.

DeckChek inference: timebase, tone/record reference, gain/channel calibration and repeatability contribute different uncertainty terms. Repeated measurements do not remove a common clock bias. A shared interface can correlate paired measurements. A confidence score for a diagnosis is a separate quantity from measurement uncertainty.

### S10 — Harris (1978), journal bibliographic lead

Fredric J. Harris. "On the use of windows for harmonic analysis with the discrete Fourier transform."
Proceedings of the IEEE 66(1), 51–83.
[DOI: 10.1109/PROC.1978.10837](https://doi.org/10.1109/PROC.1978.10837).
Publisher access blocked automated reading; window behavior is supported here by Julius O. Smith's available text below. This entry is a reading lead, not a full-paper review.

### S11 — Welch (1967), journal bibliographic lead

Peter D. Welch. "The use of fast Fourier transform for the estimation of power spectra: A method based on time averaging over short, modified periodograms."
IEEE Transactions on Audio and Electroacoustics 15(2), 70–73.
[DOI: 10.1109/TAU.1967.1161901](https://doi.org/10.1109/TAU.1967.1161901).
Publisher access blocked automated reading; practical methodology is supported by the accessible author-written textbook section below.

## 5. Venue and perception

### S12 — Farina (2000), AES convention preprint, author manuscript

Angelo Farina. "Simultaneous Measurement of Impulse Response and Distortion with a Swept-Sine Technique." AES Convention 108, paper 5093.
[Institutional record](https://air.unipr.it/handle/11381/1453666).
[Author-hosted manuscript](https://www.angelofarina.it/Public/papers/134-AES00.PDF).

Swept-sine deconvolution separates linear response and nonlinear contributions under the described method. The manuscript is explicitly an AES convention preprint, not a reviewed journal article.

DeckChek inference: a future calibrated loopback/venue transfer test can use generated sweeps, synchronized references, latency compensation and noise-floor checks. It is not a passive diagnosis of a groove, nor an absolute acoustic measurement without calibrated transducers. Verify stationarity, nonlinear behavior and response recovery before interpreting peaks as faults.

### S13 — ITU-R BS.1116-3 (2015), recommendation, full-text method sections

[Official page and free downloads](https://www.itu.int/rec/R-REC-BS.1116-3-201502-I/en).
Methods for subjective assessment of small impairments in audio systems. Includes controlled listening procedures and conditions, references and participant handling.

DeckChek inference: randomize presentation, blind labels and document level/monitoring conditions for detector-listening studies. A practical beta study may adapt these principles, but cannot claim BS.1116 conformity unless all required conditions are met.

### S14 — ITU-R BS.1770-5 (2023), recommendation, official version record

[Official record](https://www.itu.int/rec/R-REC-BS.1770/en).
Defines programme-loudness and true-peak algorithms. Version 5 is listed in force; version 4 is superseded.

DeckChek implication: a chosen loudness library's method/version must be checked. LUFS and dBTP are supporting audio metrics, not stylus wear, surface grade or calibrated venue SPL. Do not infer latest-standard conformity from the library name.

## 6. Reference books and engineering guides

| Reference | Access actually verified | Relevant reading | DeckChek use |
| --- | --- | --- | --- |
| Simon J. Godsill and Peter J. W. Rayner, Digital Audio Restoration (Springer, 1998), DOI [10.1007/978-1-4471-1561-8](https://link.springer.com/book/10.1007/978-1-4471-1561-8) | Publisher contents/preview; complete chapters subscription/institutional access | Click removal pp. 99–134; low-frequency pulses pp. 153–170; pitch defects pp. 171–190; model selection pp. 69–95 | Reading plan for modeling and nuisance separation; no full-book review claimed |
| Julius O. Smith III, [Spectral Audio Signal Processing](https://www.dsprelated.com/freebooks/sasp/) | Free author-written online text; window, correlation and Welch sections inspected | [Windows](https://www.dsprelated.com/freebooks/sasp/Spectrum_Analysis_Windows.html), [Welch](https://www.dsprelated.com/freebooks/sasp/Welch_s_Method.html), [autocorrelation](https://www.dsprelated.com/freebooks/sasp/Autocorrelation.html) | Explicit window definitions, calibrated spectra and noise averaging |
| Steven W. Smith, [The Scientist and Engineer's Guide to Digital Signal Processing](https://www.dspguide.com/) | Free online book; spectral-analysis section and copyright terms inspected | Statistics/noise; ADC; DFT; filters; audio processing | DSP implementation and review reference; [permitted use](https://www.dspguide.com/copyrite.htm) does not authorize wholesale repo redistribution |
| Brüel & Kjær, [Measuring Vibration, BR0094](https://www.bksv.com/media/doc/br0094.pdf), revision September 1982 | Manufacturer engineering booklet, PDF inspected | Units pp. 5–7; mounting pp. 14–16; calibration p. 22; frequency analysis pp. 28–31 | Sensor axis/mount/calibration metadata; audio rumble remains a proxy without a sensor |

Books and guides explain transferable methods. Their example code, figures and recordings each need license checks before reuse. The manufacturer booklet is an engineering reference, not independent peer-reviewed evidence for DeckChek's venue score.

## Decisions and unresolved evidence

Adopt now in specs: uncertainty budgets; exact statistic/standard labels; calibrated spectral units; discontinuity masks; listening and event-level evaluations; explicit source-access status; separation of impulse, audibility and cause.

Evaluate experimentally: LPC vs simple residual detection; wavelet/perceptual enhancement; scale-aware alignment; swept-sine transfer tests. Keep the simpler method unless the held-out measurements justify the added complexity.

Still unproven: automatic exact groove-wear grading; stylus life from arbitrary music; causal damage identification from one scan; generic DVS absolute decoding; universal cartridge/venue ranking. Require controlled intervention evidence and abstain when it is unavailable.

No study reviewed supplies a validated DeckChek-wide health score. No copied scientific code is approved by the accessibility of its paper. The beta must record its own corpus, protocols, benchmarks and limitations.

See [SPEC-19](SPEC-19-scientific-measurement-and-validation.md) for the resulting implementation requirements and [SPEC-18](SPEC-18-open-source-reuse-and-validation.md) for integration boundaries.
