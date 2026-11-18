# Pioneer DJ DDJ-FLX10 — USB MIDI and audio specification provenance

Checked **2026-11-18** for the exact DDJ-FLX10 model. The existing profile ID
`alphatheta-ddj-flx10` and all handwritten checks are retained.

## Sources

The manufacturer's [Instruction Manual DRI1822D](https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-FLX10/DDJ-FLX10_DRI1822D_manual.pdf)
has 183 pages. Its [support listing](https://pioneer-support.zendesk.com/hc/en-us/articles/16716272919193-How-to-use-your-DDJ-FLX10-controller-Instruction-Manual)
dates the English manual to **23 October 2024**. The retrieved PDF SHA-256 is
`2afd951bdd8d2ce932f35cf52f6f3c8eccefe470f1a3551ac3fd90f1f780df65`.

## Recorded decisions

| Evidence | Profile decision |
| --- | --- |
| p. 179: control data reaches MIDI applications through USB | `connectivity.midi.usbMidi: true`; exact control mappings remain unverified. |
| p. 175: audio section sampling rate is 44.1 kHz | Record a sourced nominal audio-section specification. Keep the USB supported-rate list unknown. |
| p. 175: A/D and D/A converters are 24-bit | Record converter resolution separately. Do not infer USB PCM word length. |

The signal-flow diagram on p. 174 labels USB stream groups, not individually
numbered mono channels. Neither the four mixer strips nor the number of output
sockets establishes USB channel counts. Both counts remain `null`; the existing
minor, conditional output-quality test remains conditional.

USB IDs, class compliance, firmware/revision applicability, current driver/OS
compatibility and physical performance remain unqualified. The sample-rate and
converter facts add no measurement tolerance. MIDI Learn, certificate plans,
the −12 dBFS output cap and original tests are unchanged.
