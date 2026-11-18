# Allen & Heath Xone:96 — researched USB capabilities

Research checked **2026-11-18 UTC** for the existing exact-model profile. Manufacturer documentation establishes capabilities; physical hardware, firmware and host qualification remain pending.

## Sources and scope

| Source | Supported evidence |
| --- | --- |
| [PC Software Release Notes, X96_PCSRN_v4670_2](https://www.allen-heath.com/content/uploads/2023/06/X96_SRN_4670_2.pdf), printed December 2021, pp. 4–5 | 12 USB inputs and 12 outputs per host; 44.1/48/88.2/96 kHz; 16/32-bit USB formats; USB MIDI. Header uses v4.6.70 while installer/body uses v4.67.0. |
| [Online User Guide](https://support.allen-heath.com/hc/en-gb/articles/43053562464017-Xone-96-User-Guide), page updated 26 February 2026 | Each independent USB connection has six stereo inputs and outputs. Local USB MIDI is enabled by its MIDI 1/2 switch. |
| [Exact-model product page](https://www.allen-heath.com/hardware/xone-series/xone96/) | Corroborates six stereo inputs and outputs for each independent host connection. |

## Profile decisions

Channel counts are **12 in / 12 out per host**, without adding the two interfaces together. The documented sample-rate list is explicit. USB MIDI is confirmed.

The scalar `bitDepth` remains `null`: the documented USB formats are 16 and 32 bits. The existing 32-bit interface specification remains intact; an additive specification records both USB formats. The macOS-scoped class-compliance statement does not change the generic class-compliance field. Driver document labels and webpage update dates do not establish firmware applicability. Full ASIO routing does not establish identical exposure through every host API.

Existing handwritten checks, MIDI mapping/IDs, DIN field, software version fields and qualification limits are preserved. The actual plan retains its major audio-quality case and existing stimulus limit. The researched input count makes the input capability explicit; it does not constitute a passed physical test.
