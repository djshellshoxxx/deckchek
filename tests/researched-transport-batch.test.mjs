import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { certificatePlan } from '../app/certificate.js';
import { validateProfile } from '../app/devices/library.js';
import { auditProfile, capabilitiesOf, completePlan, midiPrerequisites } from '../app/devices/test-plan.js';

// Baselines captured before production edits at 5978c7c2e857785db60848a403ae5e89064120cc.
// Full original-object fingerprints catch changes outside the documented transport additions.
// The later Push 3 host-channel addendum is reversed explicitly below and independently
// qualified by researched-push3-audio.test.mjs; every original fingerprint remains intact.
// The later S4/DJM-900NXS2 USB-MIDI provenance additions are also reversed explicitly
// for their original byte baselines; their focused tests qualify the new facts.
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = value => digest(JSON.stringify(value));
const readProfile = id => JSON.parse(readFileSync(new URL(`../app/devices/profiles/${id}.json`, import.meta.url), 'utf8'));

const cases = [
  {
    "id": "ableton-push-3",
    "manufacturer": "Ableton",
    "model": "Push 3",
    "sources": [
      {
        "id": "S01",
        "url": "https://help.ableton.com/hc/en-us/articles/9109387410716-Push-3-USB-power-FAQ",
        "sha256": "53469e258fef542c795c0125591d6a3e4087980b1996dc06ed4aeeed94a07f90",
        "title": "Ableton Push 3 USB power FAQ",
        "edition": "article 9109387410716",
        "locations": [
          "article 9109387410716"
        ]
      }
    ],
    "facts": [
      {
        "field": "usbMidi",
        "key": "verified_usb_midi_transport",
        "sourceId": "S01",
        "source": "https://help.ableton.com/hc/en-us/articles/9109387410716-Push-3-USB-power-FAQ",
        "tokens": [
          "USB-C",
          "computer/device"
        ],
        "notes": "Push 3 USB power FAQ, article 9109387410716: USB-C carries MIDI on the computer/device connection. The USB-A host role is separate; no DIN connector conclusion is drawn from TRS sockets."
      }
    ],
    "scope": "Push 3 computer/device USB-C connection; USB-A host operation and TRS MIDI sockets are separate.",
    "originalCounts": {
      "tests": 10,
      "specs": 8,
      "documents": 8
    },
    "originalIdentityNotes": "Candidate hardware and software capabilities only; verify manual, revision, HID/MIDI transport, audio I/O, OS support and firmware on a physical unit. No claimed factory tolerances or MIDI identifiers.",
    "baseline": {
      "tests": "86128b35d11b134c07ef0ac7f7f9d9cc3e11fef407d023ba10e3f295f1e6bdfb",
      "specs": "1511a52592ba42fa773b6199646f28c41a33cbb87b0cd49f4d3d63cbf4d7e3eb",
      "documents": "eb785208cb288e401a4e808e22315cbb96ad0127572145ac668dfc4c3f465640",
      "software": "3e111d49f053e3b825dca39837f06153768d0902e40570da166a60cec4a9d89a",
      "profile": "c9caa5bb5f862606e6f9083d5f4dac49397ec90959ca77729094afb857bb7780",
      "file": "3e6676a59cb56427be53f0c982649f3bd266a1038f21142d07dd3ab7d49bd57c"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "Push 3"
      ]
    },
    "existingNote": null,
    "addedDocumentCount": 1
  },
  {
    "id": "alphatheta-djm-v10",
    "manufacturer": "AlphaTheta",
    "model": "DJM-V10",
    "sources": [
      {
        "id": "S02",
        "url": "https://downloads.support.alphatheta.com/manuals/dj-mixers/DJM-V10/DJM-V10_DRI1643C_manual.pdf",
        "sha256": "0bc9d24e446e72a42006131fc269722ddcf745a8ec0ef267ffb27b1e04ba3f88",
        "title": "Pioneer DJ DJM-V10 Instruction Manual",
        "edition": "DRI1643C",
        "locations": [
          "DRI1643C",
          "p. 66",
          "p. 67"
        ]
      },
      {
        "id": "S03",
        "url": "https://www.pioneerdj.com/en/product/features/mixer/djm-v10-6-channels/",
        "sha256": "20653a6ae335df08e6b03921d6c6a10af072356cc499ea0cefe39dbe7c1fe9aa",
        "title": "Pioneer DJ DJM-V10 features",
        "edition": "exact DJM-V10 product feature page",
        "locations": [
          "DIN MIDI out"
        ]
      }
    ],
    "facts": [
      {
        "field": "usbMidi",
        "key": "verified_usb_midi_transport",
        "sourceId": "S02",
        "source": "https://downloads.support.alphatheta.com/manuals/dj-mixers/DJM-V10/DJM-V10_DRI1643C_manual.pdf",
        "tokens": [
          "USB A/B",
          "MIDI ON",
          "clock",
          "start/stop"
        ],
        "notes": "DRI1643C, p. 66 and p. 67: USB A/B connects the computer; MIDI ON enables control messages. MIDI clock and start/stop have separate behavior and may transmit with MIDI ON off."
      },
      {
        "field": "din",
        "key": "verified_din_midi_transport",
        "sourceId": "S03",
        "source": "https://www.pioneerdj.com/en/product/features/mixer/djm-v10-6-channels/",
        "tokens": [
          "output only",
          "DIN MIDI out",
          "input"
        ],
        "notes": "DJM-V10 feature page, DIN MIDI out: physical DIN output only is established. No DIN input is established; the transport flag does not encode direction."
      }
    ],
    "scope": "DJM-V10, retaining the existing AlphaTheta manufacturer and ID. DIN output only; no DIN input claim.",
    "originalCounts": {
      "tests": 6,
      "specs": 6,
      "documents": 6
    },
    "originalIdentityNotes": "Candidate hardware and software capabilities only; verify manual, revision, HID/MIDI transport, audio I/O, OS support and firmware on a physical unit. No claimed factory tolerances or MIDI identifiers.",
    "baseline": {
      "tests": "0eb9b27eb58fb9d22c1335a4cfeee3fc3cc449f1934b5dbe758bdab51f14d7d0",
      "specs": "26c15e3f9cfb11615c8db20ab37aa00c52183c14008df97d6c0f6d54f287a189",
      "documents": "618c1c42f3028fcf11c61b3dcebe335dd46fd9ad1d13283abce61980fb1f929c",
      "software": "cccb9b0c62920513d84d289ec3c5de07f36c97740d104eb7c3604ce0a167c1ba",
      "profile": "46f92d37fd4b8162449db448f636f09b676852ebaf4ba90342dac0f8427b8b1b",
      "file": "85d7ae89cdbfa6b7d604f2c4f591fd165ac1a2c5fd131b5461e7687ed12be73d"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "DJM-V10"
      ]
    },
    "existingNote": null,
    "addedDocumentCount": 1
  },
  {
    "id": "denon-dj-prime-4",
    "manufacturer": "Denon DJ",
    "model": "PRIME 4+",
    "sources": [
      {
        "id": "S04",
        "url": "https://cdn.inmusicbrands.com/Software/ENDJ5/PRIME%204%2C%20PRIME%204%2B%2C%20PRIME%202%2C%20PRIME%20GO%2C%20PRIME%20GO%2B%2C%20SC%20LIVE%204%2C%20SC%20LIVE%202%20-%20User%20Guide%20-%20v5.0.0.pdf",
        "sha256": "aab8d29d22cd4e286a85009ee47d93fc67485793f35226bc19288592553bd74f",
        "title": "Denon DJ combined Engine OS User Guide",
        "edition": "v5.0.0",
        "locations": [
          "v5.0.0",
          "p. 6",
          "p. 11",
          "p. 61"
        ]
      }
    ],
    "facts": [
      {
        "field": "usbMidi",
        "key": "verified_usb_midi_transport",
        "sourceId": "S04",
        "source": "https://cdn.inmusicbrands.com/Software/ENDJ5/PRIME%204%2C%20PRIME%204%2B%2C%20PRIME%202%2C%20PRIME%20GO%2C%20PRIME%20GO%2B%2C%20SC%20LIVE%204%2C%20SC%20LIVE%202%20-%20User%20Guide%20-%20v5.0.0.pdf",
        "tokens": [
          "PRIME 4+",
          "computer mode",
          "USB-B"
        ],
        "notes": "Engine OS User Guide v5.0.0, p. 6, p. 11 and p. 61: PRIME 4+ uses USB-B in computer mode for MIDI. The base-model descriptions expressly include this plus variant."
      }
    ],
    "scope": "The existing denon-dj-prime-4 ID denotes PRIME 4+. Computer mode is required; v5.0.0 is the reviewed edition, not a latest-version claim.",
    "originalCounts": {
      "tests": 11,
      "specs": 8,
      "documents": 6
    },
    "originalIdentityNotes": "Research seed with conservative, capability-dependent tests. Exact MIDI IDs, USB IDs, revision, OS support, audio channel maps and tolerance limits are NOT verified; learn or confirm on real hardware before giving pass/fail based on fixed specifications.",
    "baseline": {
      "tests": "f977df72f87861760bdceae6ce465bd8e6aa0ddc1f9744cb169bfc292f14ab77",
      "specs": "2b005ddeecc6e18670209350c311bf0f6b1617e6eec177a8bd918af66b10caa5",
      "documents": "1e4628b2be870f7ed8867d55b2ac98fd9829ef4e305125d0c0136f081bde0c6a",
      "software": "c2c613181e5e0c825b72aec31da66cb1556e09f4040bde6bd4509b471c355bde",
      "profile": "1a822637f3dda58fb68689e53b117283ac0f749117812e2a2d4b491dca44311a",
      "file": "e760c749b3866ade01fac0f887fb54c59cc8bd2a7f02b5ac08b8b48fbaf3851c"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "PRIME 4+"
      ]
    },
    "existingNote": null,
    "addedDocumentCount": 1
  },
  {
    "id": "denon-dj-prime-go",
    "manufacturer": "Denon DJ",
    "model": "PRIME GO+",
    "sources": [
      {
        "id": "S04",
        "url": "https://cdn.inmusicbrands.com/Software/ENDJ5/PRIME%204%2C%20PRIME%204%2B%2C%20PRIME%202%2C%20PRIME%20GO%2C%20PRIME%20GO%2B%2C%20SC%20LIVE%204%2C%20SC%20LIVE%202%20-%20User%20Guide%20-%20v5.0.0.pdf",
        "sha256": "aab8d29d22cd4e286a85009ee47d93fc67485793f35226bc19288592553bd74f",
        "title": "Denon DJ combined Engine OS User Guide",
        "edition": "v5.0.0",
        "locations": [
          "v5.0.0",
          "p. 18",
          "p. 22",
          "p. 63"
        ]
      },
      {
        "id": "S16",
        "url": "https://support.enginedj.com/support/solutions/articles/69000823507-denon-dj-prime-go-and-prime-go-setup-with-virtual-dj",
        "sha256": "81246cc78a05c8cb8db6db35a43d7e261ffbc25ba821f68e33e07d074ff9616e",
        "title": "Engine DJ PRIME GO and PRIME GO+ Setup with Virtual DJ",
        "edition": "article 69000823507",
        "locations": [
          "article 69000823507",
          "4.1.0"
        ]
      }
    ],
    "facts": [
      {
        "field": "usbMidi",
        "key": "verified_usb_midi_transport",
        "sourceId": "S04",
        "source": "https://cdn.inmusicbrands.com/Software/ENDJ5/PRIME%204%2C%20PRIME%204%2B%2C%20PRIME%202%2C%20PRIME%20GO%2C%20PRIME%20GO%2B%2C%20SC%20LIVE%204%2C%20SC%20LIVE%202%20-%20User%20Guide%20-%20v5.0.0.pdf",
        "tokens": [
          "PRIME GO+",
          "computer mode",
          "USB-B",
          "4.1.0"
        ],
        "notes": "Engine OS User Guide v5.0.0, p. 18, p. 22 and p. 63: PRIME GO+ uses USB-B in computer mode. The separate VirtualDJ setup article 69000823507 specifies Engine DJ 4.1.0 or later for GO+; existing software minimum-version fields are unchanged."
      }
    ],
    "scope": "The existing denon-dj-prime-go ID denotes PRIME GO+. Computer mode is required. The VirtualDJ setup condition is Engine DJ 4.1.0 or later; it does not qualify current platforms.",
    "originalCounts": {
      "tests": 11,
      "specs": 9,
      "documents": 7
    },
    "originalIdentityNotes": "Research seed with conservative, capability-dependent tests. Exact MIDI IDs, USB IDs, revision, OS support, audio channel maps and tolerance limits are NOT verified; learn or confirm on real hardware before giving pass/fail based on fixed specifications. This entry is PRIME GO+, not original PRIME GO; these units differ in Ethernet, streaming support, processor and battery life.",
    "baseline": {
      "tests": "1f345b0431a2caf8f641ae840bfd70ec64ff758a8848fbc7a7477e3aefeec645",
      "specs": "f22331369173fe8a5334bbe48fe87c1c6a427d091fc134398b59c0a6834f77e7",
      "documents": "8dd0454a2f4d4efc672804e19ec362b36009cb3553f17280aa7a19f678c055ec",
      "software": "c2c613181e5e0c825b72aec31da66cb1556e09f4040bde6bd4509b471c355bde",
      "profile": "5b39e89f917893cd6c871e9d69ac1c59e97985d4442bc69bb060a02ccb124fa7",
      "file": "908ef1b11db17cc19bf15b52098030331823e7fa2cedf8af20972f651043a12c"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "PRIME GO+"
      ]
    },
    "existingNote": null,
    "addedDocumentCount": 2
  },
  {
    "id": "denon-dj-sc-live-4",
    "manufacturer": "Denon DJ",
    "model": "SC LIVE 4",
    "sources": [
      {
        "id": "S04",
        "url": "https://cdn.inmusicbrands.com/Software/ENDJ5/PRIME%204%2C%20PRIME%204%2B%2C%20PRIME%202%2C%20PRIME%20GO%2C%20PRIME%20GO%2B%2C%20SC%20LIVE%204%2C%20SC%20LIVE%202%20-%20User%20Guide%20-%20v5.0.0.pdf",
        "sha256": "aab8d29d22cd4e286a85009ee47d93fc67485793f35226bc19288592553bd74f",
        "title": "Denon DJ combined Engine OS User Guide",
        "edition": "v5.0.0",
        "locations": [
          "v5.0.0",
          "p. 27",
          "p. 64"
        ]
      }
    ],
    "facts": [
      {
        "field": "usbMidi",
        "key": "verified_usb_midi_transport",
        "sourceId": "S04",
        "source": "https://cdn.inmusicbrands.com/Software/ENDJ5/PRIME%204%2C%20PRIME%204%2B%2C%20PRIME%202%2C%20PRIME%20GO%2C%20PRIME%20GO%2B%2C%20SC%20LIVE%204%2C%20SC%20LIVE%202%20-%20User%20Guide%20-%20v5.0.0.pdf",
        "tokens": [
          "SC LIVE 4",
          "computer mode",
          "USB-B"
        ],
        "notes": "Engine OS User Guide v5.0.0, p. 27 and p. 64: SC LIVE 4 has a USB-B computer connection and computer-mode MIDI. Select computer mode before host MIDI use."
      }
    ],
    "scope": "Exact SC LIVE 4 computer mode; the reviewed guide is v5.0.0.",
    "originalCounts": {
      "tests": 10,
      "specs": 5,
      "documents": 6
    },
    "originalIdentityNotes": "Research seed with conservative, capability-dependent tests. Exact MIDI IDs, USB IDs, revision, OS support, audio channel maps and tolerance limits are NOT verified; learn or confirm on real hardware before giving pass/fail based on fixed specifications.",
    "baseline": {
      "tests": "973eb603076176e6c4f2615713ab11ecd71d96ae9e131c26d74eec7c29db31d6",
      "specs": "4cadbdcafe11f8903126563fb8f943a6b5a63e709ab8004ddcdecdcb5e8258ea",
      "documents": "e455fd77bb5551742d9b124da0664cdb90ac457042be4ee5418399585c4b9c47",
      "software": "c2c613181e5e0c825b72aec31da66cb1556e09f4040bde6bd4509b471c355bde",
      "profile": "55ff6966652cd089d59c526ca680e822d9733dae995efebda47059860641e6a8",
      "file": "f880f187e1f798d5e3dc3d043857c200390400eef3f2e80b595014f8d7a10e54"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "SC LIVE 4"
      ]
    },
    "existingNote": null,
    "addedDocumentCount": 1
  },
  {
    "id": "native-instruments-maschine-mk3",
    "manufacturer": "Native Instruments",
    "model": "MASCHINE MK3",
    "sources": [
      {
        "id": "S05",
        "url": "https://docs.native-instruments.com/pdf-guides/maschine_277/MASCHINE_MK3_Getting_Started_English_2_7_7.pdf",
        "sha256": "8f5e90ee4bcaeb8d554eef708438aae9c1f2ea9fd70153f344bb2d5d500f9f48",
        "title": "Native Instruments MASCHINE MK3 Getting Started",
        "edition": "2.7.7",
        "locations": [
          "2.7.7",
          "p. 30",
          "p. 31"
        ]
      }
    ],
    "facts": [
      {
        "field": "din",
        "key": "verified_din_midi_transport",
        "sourceId": "S05",
        "source": "https://docs.native-instruments.com/pdf-guides/maschine_277/MASCHINE_MK3_Getting_Started_English_2_7_7.pdf",
        "tokens": [
          "5-pin DIN",
          "IN",
          "OUT",
          "Preferences",
          "plug-in"
        ],
        "notes": "MASCHINE MK3 Getting Started 2.7.7, section 2.3.5, p. 30 and p. 31: separate 5-pin DIN IN and OUT connect external MIDI equipment. Activate the ports in MIDI Preferences for standalone software, or configure the host for plug-in use. USB MIDI remains unresolved."
      }
    ],
    "scope": "Exact MASCHINE MK3 DIN IN and OUT. The 2.7.7 document/software edition is not a firmware qualification. USB MIDI remains unresolved.",
    "originalCounts": {
      "tests": 8,
      "specs": 9,
      "documents": 6
    },
    "originalIdentityNotes": "Research seed; MASCHINE MK3 has manufacturer-documented USB audio routing with two input channels, main outputs 1/2 and headphone outputs 3/4, plus 24-bit conversion. The Getting Started guide's 2.7.7 (07/2018) version refers to software, not qualified firmware. Individual sample rates, hardware revision, OS support, firmware, USB IDs, class compliance, MIDI/HID maps and physical performance remain unverified. No factory tolerances or physical qualification are claimed.",
    "baseline": {
      "tests": "abadcd4ee37e0bea954ae7b20a65061ebfa42f9643f09411d50c5c176dbd726d",
      "specs": "e2c7aca4139c2cad8026a87bd986356482db0e237f0689951c2b1691b4e259d7",
      "documents": "a9eff77a7b68653acb96baa2ccbf1ac8dd4e5beec7cb7a82484e782f095ac507",
      "software": "afce26b6f6f2312097e3986adce5464515472919d6588c49232c5c5b4178a49a",
      "profile": "c99e8e859c8b29b996c08fed1ebdfd05e1da486588f21329a25f4161a7740a49",
      "file": "6c51fb197e537fe4debc9f938ffc80187df2791d2d14a543155fca891ce4c21d"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "MASCHINE MK3"
      ]
    },
    "existingNote": {
      "bytes": 2606,
      "sha256": "391aafe0698e8ba6b173f3daa224e4a1f9dcccad4df473218ee27bb09469e74c"
    },
    "addedDocumentCount": 1
  },
  {
    "id": "novation-launch-control-xl",
    "manufacturer": "Novation",
    "model": "Launch Control XL",
    "sources": [
      {
        "id": "S08",
        "url": "https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/novation/downloads/9926/launchcontrolxlgsg.pdf",
        "sha256": "e4a83e478e791d14dd49486fb7e9399f6d37fe1d8f27c5559a5ac2b38e9bcf99",
        "title": "Novation Launch Control XL Getting Started",
        "edition": "original Launch Control XL; revision not printed on inspected page",
        "locations": [
          "Getting Started",
          "p. 4"
        ]
      }
    ],
    "facts": [
      {
        "field": "usbMidi",
        "key": "verified_usb_midi_transport",
        "sourceId": "S08",
        "source": "https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/novation/downloads/9926/launchcontrolxlgsg.pdf",
        "tokens": [
          "original Launch Control XL",
          "USB MIDI",
          "XL3"
        ],
        "notes": "Launch Control XL Getting Started, p. 4 (revision not printed on the inspected page): the original Launch Control XL is a USB MIDI device. This evidence is not for XL3; the USB-wide classCompliant field is outside this transport-only change."
      }
    ],
    "scope": "Original Launch Control XL, not XL3. The inspected page has no printed document revision; classCompliant remains unchanged.",
    "originalCounts": {
      "tests": 6,
      "specs": 4,
      "documents": 6
    },
    "originalIdentityNotes": "Candidate hardware and software capabilities only; verify manual, revision, HID/MIDI transport, audio I/O, OS support and firmware on a physical unit. No claimed factory tolerances or MIDI identifiers.",
    "baseline": {
      "tests": "f4ac746a6c0a9a522e8fbc3ad5b0b15407ec0fd3589384ad8a21eb2f9a9bd4bb",
      "specs": "873bc44ebddab0a7be01fb69143a1d4dc2e8f1b00fcaf35f3a612f7c4f064471",
      "documents": "e0845b2b8c5c2784b67580ea226ae13f7f757a693671560b1eaa964424985ed2",
      "software": "90bc591302ce19221c4cefd4dbb6d392efbd3fef786e4cc129ab77160dcbd096",
      "profile": "3b0998c9958b564e21a18bad707dbe1751334c2dd88acedd91508924a458f042",
      "file": "1961627513971f64d804020f955dbf402b33d905935160f5b4cf577a9cacbdac"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "Launch Control XL"
      ]
    },
    "existingNote": null,
    "addedDocumentCount": 1
  },
  {
    "id": "numark-mixstream-pro",
    "manufacturer": "Numark",
    "model": "Mixstream Pro",
    "sources": [
      {
        "id": "S09",
        "url": "https://cdn.inmusicbrands.com/engine/Mixstream%20Pro%20-%20User%20Guide%20-%20v2.3.0.pdf",
        "sha256": "0f28c2c396c4b932ae5c9aeca47cccc500980406a34ab1b0267cb6c655404669",
        "title": "Numark Mixstream Pro User Guide",
        "edition": "v2.3.0",
        "locations": [
          "v2.3.0",
          "p. 9",
          "p. 25"
        ]
      }
    ],
    "facts": [
      {
        "field": "usbMidi",
        "key": "verified_usb_midi_transport",
        "sourceId": "S09",
        "source": "https://cdn.inmusicbrands.com/engine/Mixstream%20Pro%20-%20User%20Guide%20-%20v2.3.0.pdf",
        "tokens": [
          "original Mixstream Pro",
          "USB-B",
          "computer icon",
          "computer mode"
        ],
        "notes": "Mixstream Pro User Guide v2.3.0, p. 9 and p. 25: original Mixstream Pro uses its PC USB-B connection for MIDI after the computer icon selects computer mode. This is not a Pro+ or Go variant claim."
      }
    ],
    "scope": "Original Mixstream Pro, excluding Pro+ and Go; enter computer mode with the computer icon.",
    "originalCounts": {
      "tests": 10,
      "specs": 7,
      "documents": 6
    },
    "originalIdentityNotes": "Research seed with conservative, capability-dependent tests. Exact MIDI IDs, USB IDs, revision, OS support, audio channel maps and tolerance limits are NOT verified; learn or confirm on real hardware before giving pass/fail based on fixed specifications.",
    "baseline": {
      "tests": "cf0357906c1047a4b2e705d767d5ec587097479f868a3701592e7c69b3920adc",
      "specs": "6907bed3835756610d9e2a1271f37235703f4de1928f512ecf6cdf6a42ac614a",
      "documents": "705577751132f9b0445e46c4e5705b05068c06560ce8c785ce9a2d8d49b1dad1",
      "software": "c2c613181e5e0c825b72aec31da66cb1556e09f4040bde6bd4509b471c355bde",
      "profile": "6b68b18f191215340019a3678306b453e89569e5c87e7caacba539b81a98c7fe",
      "file": "f77f9a1d211e1d3dfdefa632e7cf95ccdf1ee74b9176172319a21d5425c06857"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "Mixstream Pro"
      ]
    },
    "existingNote": null,
    "addedDocumentCount": 1
  },
  {
    "id": "pioneer-dj-ddj-1000",
    "manufacturer": "Pioneer DJ",
    "model": "DDJ-1000",
    "sources": [
      {
        "id": "S10",
        "url": "https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-1000/DDJ-1000_DRI1516A_manual.pdf",
        "sha256": "a392777fb3aa18dc1b8e169d02289d6a64601bc2d49c3dc02b2494779a540ce5",
        "title": "Pioneer DJ DDJ-1000 Operating Instructions",
        "edition": "DRI1516A",
        "locations": [
          "DRI1516A",
          "p. 31"
        ]
      }
    ],
    "facts": [
      {
        "field": "usbMidi",
        "key": "verified_usb_midi_transport",
        "sourceId": "S10",
        "source": "https://downloads.support.alphatheta.com/manuals/dj-controllers/DDJ-1000/DDJ-1000_DRI1516A_manual.pdf",
        "tokens": [
          "USB",
          "utility",
          "rekordbox",
          "MIDI"
        ],
        "notes": "DDJ-1000 Operating Instructions DRI1516A, p. 31: USB carries control data to MIDI-compatible computer software. Set the utility for software other than rekordbox and configure the software MIDI settings. No message map or current platform qualification is imported."
      }
    ],
    "scope": "DDJ-1000, excluding DDJ-1000SRT. Observe the utility and software MIDI settings; the previously documented Mac audio configuration keeps its original scope.",
    "originalCounts": {
      "tests": 8,
      "specs": 7,
      "documents": 6
    },
    "originalIdentityNotes": "Research seed; the manufacturer's DDJ-1000 Troubleshooting (Mac) article dated 2022-08-06 documents 12 input and 6 output USB audio channels in its Mac driver configuration, with MASTER/PHONES routing in rekordbox Performance mode. This source establishes audio capability; current OS/driver compatibility, hardware revision, firmware, USB IDs, class compliance, MIDI maps, sample rates, bit depth, full numbered channel maps and physical performance remain unverified. No factory tolerances or physical qualification are claimed.",
    "baseline": {
      "tests": "489b6380bd5f89f7690e8b5b054afc906e8b26174685d6d862f39215fa23be53",
      "specs": "9051fd63e8ad5e07ac96078393b28b4c013023e500327e63f526262c6ebddce1",
      "documents": "95303a2b489e089f62aaa01894f15a30d569c95dda3a998c26faac7280467a8d",
      "software": "fe20d0e5a4041e636dc7051f31170fa52ec3221d381edf7045df650f86684f07",
      "profile": "925ba57a852eb992beff7a732e1fc2dd04ee9ea77a734e33e5f0007d46ce7e8b",
      "file": "36b29f9348e295de35729bf9b69be5deeb58a96df252b9b31c352e2519595bfd"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "DDJ-1000"
      ]
    },
    "existingNote": {
      "bytes": 2241,
      "sha256": "361c0b2d5370b83c680030ca80c6fe640aa51d41dd4dae4dabdd83f2b9080696"
    },
    "addedDocumentCount": 1
  },
  {
    "id": "pioneer-dj-djm-s11",
    "manufacturer": "Pioneer DJ",
    "model": "DJM-S11",
    "sources": [
      {
        "id": "S11",
        "url": "https://www.pioneerdj.com/en/product/dj-mixers/djm-s11/",
        "sha256": "3f6303a9e69e7542263cf8cf3b29ed4807f4a9f1b3331731dad83d7df64479a0",
        "title": "Pioneer DJ DJM-S11 product page",
        "edition": "exact model product page",
        "locations": [
          "USB MIDI"
        ]
      }
    ],
    "facts": [
      {
        "field": "usbMidi",
        "key": "verified_usb_midi_transport",
        "sourceId": "S11",
        "source": "https://www.pioneerdj.com/en/product/dj-mixers/djm-s11/",
        "tokens": [
          "USB MIDI",
          "controller"
        ],
        "notes": "The exact DJM-S11 product page establishes USB MIDI assignability and controller operation. This fact supplies transport evidence only; no full message map, receiving behavior or platform qualification is added."
      }
    ],
    "scope": "Exact DJM-S11 USB MIDI controller statement from the unversioned manufacturer product page.",
    "originalCounts": {
      "tests": 8,
      "specs": 6,
      "documents": 6
    },
    "originalIdentityNotes": "Candidate hardware and software capabilities only; verify manual, revision, HID/MIDI transport, audio I/O, OS support and firmware on a physical unit. No claimed factory tolerances or MIDI identifiers.",
    "baseline": {
      "tests": "fe84ea9652f585ef8b51f862e5c59a47ed702956b35c81f22ef35221aa54b3a6",
      "specs": "dc73c18f5a4acffc44c62d61b77c7699d0c1b2423f7f061cb0ed109db1971b8a",
      "documents": "2a072d833ef0d2e532fa8468a264e28e025384d6e89a07c1864abc8dc3c0716a",
      "software": "ccf5e7e2a86a6fa0a4badde5612d69416e54234254b25cd7ae0dc36d3bd498be",
      "profile": "692de080b871fff3ca9d72a3b81c2569eb2104995cc930cebb7662672b684a18",
      "file": "63ce4bb3aca0daa89920fbb4a5ca48cf82cc5f6a818130fbe9107d72ee870823"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "DJM-S11"
      ]
    },
    "existingNote": null,
    "addedDocumentCount": 0
  },
  {
    "id": "pioneer-dj-xdj-xz",
    "manufacturer": "Pioneer DJ",
    "model": "XDJ-XZ",
    "sources": [
      {
        "id": "S12",
        "url": "https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-XZ/XDJ-XZ_DRI1625B_manual.pdf",
        "sha256": "c36e71e6f907d7c49ce9e38764030535fff17038186523adab223410ca2109c5",
        "title": "Pioneer DJ XDJ-XZ Operating Instructions",
        "edition": "DRI1625B",
        "locations": [
          "DRI1625B",
          "p. 128"
        ]
      }
    ],
    "facts": [
      {
        "field": "usbMidi",
        "key": "verified_usb_midi_transport",
        "sourceId": "S12",
        "source": "https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-XZ/XDJ-XZ_DRI1625B_manual.pdf",
        "tokens": [
          "USB",
          "BROWSE",
          "LINK",
          "control mode"
        ],
        "notes": "XDJ-XZ Operating Instructions DRI1625B, p. 128: connect the computer USB port and select BROWSE (SEARCH), then LINK/control mode, for MIDI-compatible software control."
      }
    ],
    "scope": "Exact XDJ-XZ computer connection and BROWSE (SEARCH), then LINK/control mode sequence; standalone deck facts are unchanged.",
    "originalCounts": {
      "tests": 10,
      "specs": 8,
      "documents": 6
    },
    "originalIdentityNotes": "Research seed with conservative, capability-dependent tests. Exact MIDI IDs, USB IDs, revision, OS support, audio channel maps and tolerance limits are NOT verified; learn or confirm on real hardware before giving pass/fail based on fixed specifications.",
    "baseline": {
      "tests": "68051fb453a34fc18dce8903f60ee1473b9fe4a8822f60951270b7d9d268e1b3",
      "specs": "9f29dfc86b8c115ebf3f6f30a377c0465160907b0b5d7fbe3f450461c75fe4aa",
      "documents": "e21c0aed727ad1fa4d5200f12a40af21eb8e22897d6b4eac60e3f9c53473aed4",
      "software": "db01f2ede241639fae98045e9e40a707ee9d65d463963c7be5d8158ce12f2e93",
      "profile": "c3afc6342329d456206c167046d3e6fcdd001ecc384685825e44530b18c51c3f",
      "file": "ee51aff48bfaa1800430f80ec3fcb92c804594979a9b70550a682fc5ff055602"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "XDJ-XZ"
      ]
    },
    "existingNote": null,
    "addedDocumentCount": 1
  },
  {
    "id": "rane-one",
    "manufacturer": "RANE",
    "model": "ONE",
    "sources": [
      {
        "id": "S13",
        "url": "https://cdn.inmusicbrands.com/rane/one/RANE-ONE-User-Guide-v1_5.pdf",
        "sha256": "3211b156eb826c07da8e89380de9296fc734ea76c5e43db577d2a9964c45a622",
        "title": "RANE ONE User Guide",
        "edition": "v1.5",
        "locations": [
          "v1.5",
          "p. 5",
          "p. 9"
        ]
      }
    ],
    "facts": [
      {
        "field": "usbMidi",
        "key": "verified_usb_midi_transport",
        "sourceId": "S13",
        "source": "https://cdn.inmusicbrands.com/rane/one/RANE-ONE-User-Guide-v1_5.pdf",
        "tokens": [
          "original ONE",
          "USB-B",
          "USB A/B",
          "deck"
        ],
        "notes": "RANE ONE User Guide v1.5, p. 5 and p. 9: original ONE rear USB-B ports carry MIDI. Deck controls send MIDI only with the deck source at USB A/B. ONE MKII behavior is not imported."
      }
    ],
    "scope": "Original ONE, excluding ONE MKII. The deck source must be USB A/B for deck-control MIDI.",
    "originalCounts": {
      "tests": 9,
      "specs": 5,
      "documents": 6
    },
    "originalIdentityNotes": "Research seed with conservative, capability-dependent tests. Exact MIDI IDs, USB IDs, revision, OS support, audio channel maps and tolerance limits are NOT verified; learn or confirm on real hardware before giving pass/fail based on fixed specifications.",
    "baseline": {
      "tests": "1d43043325d5cb07dbe88de127269b6de42d6fd6d54ab048f6eab2e38efafdec",
      "specs": "0d921b959d3ed21416e853762c98f93114d336e3e801dd1a7e8c0e6b75129a69",
      "documents": "a13ec9e65ca4767b0af410280451a4bf74664c7fbb85f0ccbe8577f8156c3a13",
      "software": "50bbf50b1c09de4be0277f8c1a13960ba524924c3a896930e58ff7b618ab6b9a",
      "profile": "67734b4bf48fb7f638bca0ded56a02cb635c10a155fa5c34ee153a786db00985",
      "file": "f2887a9219ad939ae7744debfdd51fd8544b7d2fec287494449084880448cddb"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "ONE"
      ]
    },
    "existingNote": null,
    "addedDocumentCount": 1
  },
  {
    "id": "rane-performer",
    "manufacturer": "RANE",
    "model": "PERFORMER",
    "sources": [
      {
        "id": "S14",
        "url": "https://cdn.inmusicbrands.com/rane/performer/PERFORMER%20-%20User%20Guide%20-%20v1.4.pdf",
        "sha256": "da79a7f40470a1d09fe6e5acb6baea8d1f7e21cb3ac79d9db85c358da63675e2",
        "title": "RANE PERFORMER User Guide",
        "edition": "v1.4",
        "locations": [
          "v1.4",
          "p. 19"
        ]
      }
    ],
    "facts": [
      {
        "field": "usbMidi",
        "key": "verified_usb_midi_transport",
        "sourceId": "S14",
        "source": "https://cdn.inmusicbrands.com/rane/performer/PERFORMER%20-%20User%20Guide%20-%20v1.4.pdf",
        "tokens": [
          "USB A/B",
          "LINE",
          "deck"
        ],
        "notes": "RANE PERFORMER User Guide v1.4, p. 19: USB source mode routes MIDI to the connected computer. Deck controls send MIDI only with USB A/B selected; LINE mode does not establish those deck messages. Version 1.4 is the reviewed edition, not 1.5."
      }
    ],
    "scope": "PERFORMER with USB A/B deck-source selection; preserve the LINE exception. Reviewed v1.4 only, not v1.5.",
    "originalCounts": {
      "tests": 9,
      "specs": 5,
      "documents": 6
    },
    "originalIdentityNotes": "Research seed with conservative, capability-dependent tests. Exact MIDI IDs, USB IDs, revision, OS support, audio channel maps and tolerance limits are NOT verified; learn or confirm on real hardware before giving pass/fail based on fixed specifications.",
    "baseline": {
      "tests": "cf9d024d5ba604b63775ee55e7c654a4ed38158c1772c8fb6a6a87e47eb53f69",
      "specs": "b40effbd2ffd1b3156eafc6dbd0158e2ef444d4d87069958c2883d95b86f26cf",
      "documents": "5c37ef839cabd49b3b8a089d48e62863e93d774d70cc548ea53912dcd607f877",
      "software": "50bbf50b1c09de4be0277f8c1a13960ba524924c3a896930e58ff7b618ab6b9a",
      "profile": "009f1da8e31e170d6122edf650bf58cebd3b7e83eae4c3424257a84174b1bfd8",
      "file": "83fc0051f5f1fe260543191791338aa808acd64051c1bd510c869c15c21159b2"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "PERFORMER"
      ]
    },
    "existingNote": null,
    "addedDocumentCount": 1
  },
  {
    "id": "rane-seventy-two-mkii",
    "manufacturer": "RANE",
    "model": "SEVENTY-TWO MKII",
    "sources": [
      {
        "id": "S15",
        "url": "https://cdn.inmusicbrands.com/rane/seventy-twoMKII/Seventy-Two_MKII-UserGuide-v1.4.pdf",
        "sha256": "83f6edbb759424e7d742abe5db0bf51b17674b40044d1097768b40e21c8ef4d4",
        "title": "RANE SEVENTY-TWO MKII User Guide",
        "edition": "v1.4",
        "locations": [
          "v1.4",
          "p. 8"
        ]
      }
    ],
    "facts": [
      {
        "field": "usbMidi",
        "key": "verified_usb_midi_transport",
        "sourceId": "S15",
        "source": "https://cdn.inmusicbrands.com/rane/seventy-twoMKII/Seventy-Two_MKII-UserGuide-v1.4.pdf",
        "tokens": [
          "USB Type-B",
          "computer",
          "USB-A"
        ],
        "notes": "RANE SEVENTY-TWO MKII User Guide v1.4, p. 8: rear USB Type-B computer ports carry MIDI control. The USB-A controller-host ports have a separate role."
      }
    ],
    "scope": "Exact SEVENTY-TWO MKII. Use rear USB Type-B computer ports; USB-A controller-host ports are separate.",
    "originalCounts": {
      "tests": 8,
      "specs": 5,
      "documents": 6
    },
    "originalIdentityNotes": "Candidate hardware and software capabilities only; verify manual, revision, HID/MIDI transport, audio I/O, OS support and firmware on a physical unit. No claimed factory tolerances or MIDI identifiers.",
    "baseline": {
      "tests": "5db8a6b8054b1744cc302f11c8fe42b13aeb6b6fd568e2b5da8d9bb43cb73592",
      "specs": "66cbfbde95f50d41de4c2a099296ccbbde144b67790d4eaf7ee86c923a568330",
      "documents": "281fe7f3d340e41a41f06024db56fcd77df1cec7fa5f889901beffc0e874f9e5",
      "software": "260247af0ea2991a37d23401b29705f3d3c7ec46ece26ecabc408387f7419a4c",
      "profile": "8c0b13e30e7f98240466f35abf4d51b3cb9d79ddca1e88e516978055c2541bf6",
      "file": "49f64ad15693d81a22caa49df506a332247df8a584518b90b711d6efbcd471db"
    },
    "originalMidi": {
      "usbMidi": null,
      "din": null,
      "portNamePatterns": [
        "SEVENTY-TWO MKII"
      ]
    },
    "existingNote": null,
    "addedDocumentCount": 1
  }
];

const originalSeedIds = [
  "ableton-push-3",
  "akai-professional-apc40-mkii",
  "allen-and-heath-xone-92",
  "allen-and-heath-xone-96",
  "alphatheta-ddj-flx10",
  "alphatheta-ddj-grv6",
  "alphatheta-djm-v10",
  "alphatheta-xdj-az",
  "denon-dj-prime-4",
  "denon-dj-prime-go",
  "denon-dj-sc-live-4",
  "ecler-warm2",
  "hercules-djcontrol-inpulse-500",
  "hercules-djcontrol-inpulse-t7",
  "korg-nanokontrol2",
  "native-instruments-maschine-mk3",
  "native-instruments-traktor-kontrol-f1",
  "native-instruments-traktor-kontrol-s4-mk3",
  "novation-launch-control-xl",
  "novation-launchpad-pro-mk3",
  "numark-mixstream-pro",
  "numark-mixtrack-platinum-fx",
  "pioneer-dj-ddj-1000",
  "pioneer-dj-ddj-flx4",
  "pioneer-dj-ddj-rev1",
  "pioneer-dj-ddj-rev5",
  "pioneer-dj-ddj-rev7",
  "pioneer-dj-djm-450",
  "pioneer-dj-djm-900nxs2",
  "pioneer-dj-djm-s11",
  "pioneer-dj-xdj-rx3",
  "pioneer-dj-xdj-xz",
  "rane-four",
  "rane-one",
  "rane-performer",
  "rane-seventy-two-mkii",
  "roland-dj-808"
];

const unownedProfileHashes = {
  "akai-professional-apc40-mkii": "df87966dcb8b68f470a3eb144583d481907c2de029576f6385f8ae28c2b51f18",
  "allen-and-heath-xone-92": "6adac380acbd5f1dac8053b883713116219e6b7c09f4cab8ce16e978a284d985",
  "allen-and-heath-xone-96": "6d10fa69ae1edb18dc8b7021c649c2cd36cc48cf4e3c155b3854d18b484699ad",
  "allen-heath-xone-23": "ce9d716e09e6e00178941bbe80ce4262af5b60ea23cbd1c6cd07806662db0dc1",
  "alphatheta-ddj-flx10": "5573cb3241bb393e3dbb21ee1a1ef4488ae5610401c8820a0280bde1f79436f2",
  "alphatheta-ddj-grv6": "daff8328e11de8ebf3bed586787b59ffe074c4fa652348e14260bcfece401269",
  "alphatheta-xdj-az": "c850a23bb3e611c685119166fc1830f29fdd69db18d076f002841ddb6221c3e6",
  "ecler-warm2": "079531dce0a65c3f4360ea78875fd795b225711fb5456913a2169e509587e4fa",
  "hercules-djcontrol-inpulse-500": "e0af7e22cfcfcca3500760c3ed310f0c15902250bb2cdd4b434d82371a914bca",
  "hercules-djcontrol-inpulse-t7": "76e4bc5502232c2c5c6d7e5bc442d04e6f0e94d17809bfd192a503614d6f6a14",
  "korg-nanokontrol2": "c532bf206db4ed81cf87a11cf88fc47750924009329fbc6a0520509a5070df7d",
  "native-instruments-traktor-kontrol-f1": "10abe0999b160ec86a6403b5d5a93f50dbea5579eed9a5f55c16cdfe1a869c62",
  "native-instruments-traktor-kontrol-s4-mk3": "3285dec869fe71fa3c0d72d23ab7dd02b5bb867c6c5c64e4c9dcc7acc4157f7b",
  "novation-launchpad-pro-mk3": "175ecbd94cdccada83f7e9a6201ba3ac23129e401c7dbe3a21e1b8a48371b4b0",
  "numark-mixtrack-platinum-fx": "b6002ac134c95c585c26b29001c5b263d9cf5f60b11b0dbe80139e8a2d6d3b41",
  "pioneer-dj-ddj-flx4": "c1761c8917882af88abd48b4aa8bc8780f4e1d2b628e685d6fc5f5947a9f0db3",
  "pioneer-dj-ddj-rev1": "1cdd777619e48626616694ffb5858e0ad0c52232550e4d6ed10fda6da03f60a6",
  "pioneer-dj-ddj-rev5": "d7b66351b0a3b9556b76cd54b01b52c282b9d9e2be032f39f8cd1b6f54c68d6c",
  "pioneer-dj-ddj-rev7": "426d8538156716e6c9fd5507c74c85c69a67053268147733f10347e8b8ff68b1",
  "pioneer-dj-djm-450": "d396d5ebf8b3d47c6dda3d4c2bfdd4e12da2f0ad0bfaaa2f5531a2d0ec50f993",
  "pioneer-dj-djm-900nxs2": "1073c8369b571ac91cdf1ee84a0a3164b4543dd176a1cc79223798bc8cb7d2ba",
  "pioneer-dj-xdj-rx3": "3140c80fc57d1536dad937cb4a4048177b4be247de426007980830754562b4c7",
  "pioneer-djm-a9": "146c9c260c07b83dd91a1b8e7951ae45884dd3eba37eccf3e381950d9410c7ba",
  "pioneer-plx-crss12": "53eb82b079bcf43d2e3dbf5e964b8e5221d160c54e223c1705ad957009bd89a3",
  "rane-four": "7004e547895f58f79f22ab99868d52a8c587207aa4b5ea4d37ec59708297acc0",
  "rane-twelve-mk2": "e7708644587cf464f1c1318961f60f8b2a1ccd8cbd5478020d17444b767d2504",
  "roland-dj-808": "9eb7880f55decc8b857b2b98f242ec95bf331621fa3d0bf4bea2799245959a29",
  "serato-control-vinyl-cv025": "907ce7e1f961c5f3b3cba6abf3e945fb2bfd067d5369f94a88631fc6a92ed11e",
  "technics-sl-1200mk4": "ddb0842cd9df521e79cae6e7627cea6cd52bf0d0c17755adff49d9485f542672",
  "traktor-audio-8-dj": "afda8bce3cb8a70eb3be78e45b76c259b3bf26bdb8fe798a0cc028a229922f9a",
  "traktor-scratch-timecode": "5a99bfc5467e10288e26c5f8a129023ec403e8fce7e669743279414316dd67b3"
};

const originalIndexFingerprint = "1334aed78434963390a59d87232368c3d7bc6efe58302f1372f7cf5bf85464b5";

function originalProfile(profile, c) {
  const original = structuredClone(profile);
  original.identityNotes = c.originalIdentityNotes;
  original.specs = original.specs.slice(0, c.originalCounts.specs);
  original.documents = original.documents.slice(0, c.originalCounts.documents);
  original.connectivity.midi = structuredClone(c.originalMidi);
  if (c.id === 'ableton-push-3') {
    original.connectivity.audio.usbChannelsIn = null;
    original.connectivity.audio.usbChannelsOut = null;
  }
  return original;
}

const midiMethods = ['midi:conformance', 'midi:coverage', 'midi:latency'];

for (const c of cases) {
  const push3AudioFollowup = c.id === 'ableton-push-3';
  test(`${c.id}: manufacturer evidence establishes only the scoped transport facts`, () => {
    const profile = readProfile(c.id);
    assert.equal(validateProfile(profile).ok, true);
    for (const fact of c.facts) {
      assert.equal(profile.connectivity.midi[fact.field], true, fact.field);
      const matches = profile.specs.filter(s => s.key === fact.key);
      assert.equal(matches.length, 1, `${fact.key}: one sourced fact`);
      const spec = matches[0];
      assert.equal(spec.value, true);
      assert.equal(spec.unit, 'bool');
      assert.equal(spec.confidence, 'confirmed');
      assert.equal(spec.source, fact.source);
      for (const token of fact.tokens) assert.ok(spec.notes.includes(token), `${fact.key}: ${token}`);
      const source = c.sources.find(s => s.id === fact.sourceId);
      for (const location of source.locations) assert.ok(spec.notes.includes(location), `${fact.key}: ${location}`);
    }
    assert.equal(profile.specs.length, c.originalCounts.specs + c.facts.length + (push3AudioFollowup ? 2 : 0));
    assert.equal(profile.documents.length, c.originalCounts.documents + c.addedDocumentCount + (push3AudioFollowup ? 1 : 0));
    for (const source of c.sources) {
      const docs = profile.documents.filter(d => d.url === source.url);
      assert.equal(docs.length, 1, `one exact source URL: ${source.url}`);
      assert.equal(docs[0].language, 'en');
    }
    for (const field of ['usbMidi', 'din']) {
      if (!c.facts.some(f => f.field === field)) {
        assert.equal(profile.connectivity.midi[field], c.originalMidi[field], `${field}: no inference`);
      }
    }
    assert.ok(profile.identityNotes.startsWith(c.originalIdentityNotes), 'every prior identity/provenance statement remains');
    assert.ok(profile.identityNotes.length > c.originalIdentityNotes.length, 'scoped transport addendum');
  });

  test(`${c.id}: original tests, specifications, documents, software and all other fields are preserved`, () => {
    const profile = readProfile(c.id);
    for (const key of ['specs', 'documents']) {
      assert.equal(fingerprint(profile[key].slice(0, c.originalCounts[key])), c.baseline[key], key);
    }
    assert.equal(profile.tests.length, c.originalCounts.tests);
    assert.equal(fingerprint(profile.tests), c.baseline.tests, 'all handwritten test objects');
    assert.equal(fingerprint(profile.software), c.baseline.software, 'all software names, roles and minimum versions');
    assert.deepEqual(profile.midi, { mapSource: 'learn', complete: false, controls: [] });
    if (push3AudioFollowup) {
      assert.equal(profile.connectivity.audio.usbChannelsIn, 16);
      assert.equal(profile.connectivity.audio.usbChannelsOut, 16);
    }
    assert.equal(fingerprint(originalProfile(profile, c)), c.baseline.profile,
      'reversing only the scoped additions recovers the complete original profile');
  });

  test(`${c.id}: confirmed MIDI planning retains receive-direction and optional Identity prerequisites`, () => {
    const profile = readProfile(c.id), before = structuredClone(profile), plan = completePlan(profile);
    const transport = c.facts.some(f => f.field === 'usbMidi') ? 'usb' : 'din';
    assert.equal(capabilitiesOf(profile).midi, true);
    assert.equal(midiPrerequisites(profile).transport, transport);
    for (const method of midiMethods) {
      const checks = plan.tests.filter(t => t.method === method);
      assert.equal(checks.length, 1, method);
      const handwritten = before.tests.find(t => t.method === method);
      if (handwritten) {
        assert.deepEqual(checks[0], handwritten, `${method}: preserve the handwritten check`);
      } else {
        assert.equal(checks[0].auto, true, method);
        assert.equal(Object.hasOwn(checks[0].params, 'condition'), false, method);
      }
    }
    const conformance = plan.tests.find(t => t.method === 'midi:conformance');
    if (transport === 'din') {
      assert.equal(conformance.params.outputSelection, 'explicit');
      assert.match(conformance.steps[0], /If .* has a documented DIN OUT/);
    } else {
      assert.equal(Object.hasOwn(conformance.params, 'outputSelection'), false);
      assert.match(conformance.steps[0], /directly to a USB port on the computer/);
    }
    assert.ok(conformance.steps.some(s => /output only when.*documented receiving connection/i.test(s)));
    assert.ok(conformance.steps.some(s => /reply is not required/i.test(s)));
    const coverage = plan.tests.find(t => t.method === 'midi:coverage');
    if (coverage.auto) assert.ok(coverage.steps.some(s => /documented or configured MIDI control/i.test(s)));
    assert.equal(plan.tests.some(t => t.method === 'midi:gm'), false);
    assert.deepEqual(profile, before, 'planning does not mutate input');
  });

  test(`${c.id}: plan counts, handwritten order, audio safeguards and certificate identity stay unchanged`, () => {
    const profile = readProfile(c.id), baseline = originalProfile(profile, c);
    // Compare the transport-only reversal at the same documented audio capability.
    // The separate audio regression checks the conditional-to-confirmed transition.
    if (push3AudioFollowup) baseline.connectivity.audio = structuredClone(profile.connectivity.audio);
    const plan = completePlan(profile), oldPlan = completePlan(baseline);
    assert.equal(plan.tests.length, oldPlan.tests.length);
    assert.equal(plan.autoTests, oldPlan.autoTests);
    assert.deepEqual(plan.tests.map(t => t.id), oldPlan.tests.map(t => t.id));
    assert.deepEqual(plan.tests.slice(0, c.originalCounts.tests), baseline.tests);
    assert.deepEqual(plan.tests.filter(t => !midiMethods.includes(t.method)),
      oldPlan.tests.filter(t => !midiMethods.includes(t.method)), 'all non-MIDI plan objects, including audio, are unchanged');
    for (const check of plan.tests.filter(t => t.method === 'audio:quality')) assert.equal(check.params.levelDbfs, -12);
    assert.deepEqual(certificatePlan(plan), certificatePlan(oldPlan));
    assert.equal(new Set(plan.tests.map(t => t.id)).size, plan.tests.length);
    assert.deepEqual(auditProfile(plan).gaps, []);
    assert.deepEqual(completePlan(plan).tests, plan.tests, 'planning remains idempotent');
  });

  test(`${c.id}: readable provenance pins exact sources, pages, modes and unresolved qualification`, () => {
    const raw = readFileSync(new URL(`../docs/devices/${c.id}.md`, import.meta.url));
    const note = raw.toString('utf8');
    assert.ok(note.includes(c.model));
    assert.ok(note.includes(c.id));
    for (const source of c.sources) {
      for (const token of [source.url, source.sha256, ...source.locations]) {
        assert.ok(note.includes(token), `source provenance: ${token}`);
      }
    }
    for (const fact of c.facts) {
      for (const token of fact.tokens) assert.ok(note.includes(token), `mode/direction scope: ${token}`);
    }
    for (const token of ['classCompliant', 'USB audio', 'Identity', 'firmware', 'OS', 'physical']) {
      assert.ok(note.includes(token), `unresolved qualification: ${token}`);
    }
    if (c.existingNote) {
      assert.equal(digest(raw.subarray(0, c.existingNote.bytes)), c.existingNote.sha256,
        'entire pre-existing audio provenance note remains byte-for-byte as the prefix');
    }
  });
}

test('transport batch preserves the exact 37 research-seed IDs and 45-profile index', () => {
  const index = JSON.parse(readFileSync(new URL('../app/devices/index.json', import.meta.url), 'utf8'));
  assert.equal(fingerprint(index), originalIndexFingerprint);
  assert.equal(index.profiles.length, 45);
  const seedIds = index.profiles.map(readProfile)
    .filter(p => p.identityNotes?.includes('Research seed') || p.identityNotes?.includes('Candidate hardware'))
    .map(p => p.id).sort();
  assert.deepEqual(seedIds, originalSeedIds);
  assert.equal(cases.reduce((n, c) => n + c.facts.filter(f => f.field === 'usbMidi').length, 0), 13);
  assert.equal(cases.reduce((n, c) => n + c.facts.filter(f => f.field === 'din').length, 0), 2);
});

test('transport batch preserves all 31 other profile baselines after scoped USB MIDI addenda', () => {
  for (const [id, expected] of Object.entries(unownedProfileHashes)) {
    let raw = readFileSync(new URL(`../app/devices/profiles/${id}.json`, import.meta.url));
    if (id === 'native-instruments-traktor-kontrol-s4-mk3' || id === 'pioneer-dj-djm-900nxs2') {
      const profile = JSON.parse(raw);
      if (id === 'native-instruments-traktor-kontrol-s4-mk3') {
        assert.equal(profile.connectivity.midi.usbMidi, false);
        const marker = ' MIDI-mode addendum (2026-11-20):';
        const split = profile.identityNotes.indexOf(marker);
        assert.ok(split > 0);
        profile.identityNotes = profile.identityNotes.slice(0, split)
          .replace('DIN MIDI and exact control maps, USB IDs', 'MIDI transport/maps, USB IDs');
        assert.equal(profile.documents.length, 7);
        assert.equal(profile.specs.length, 9);
        profile.documents.pop();
      } else {
        assert.equal(profile.connectivity.midi.usbMidi, true);
        profile.identityNotes = profile.identityNotes.replace(
          'Transport addendum (2026-11-20): exact-model manufacturer FAQs document the USB-MIDI interface and sending MIDI to computer DJ software. USB MIDI is confirmed; DIN remains unknown.',
          'Direct USB MIDI transport evidence was not retrieved; USB MIDI and DIN remain unknown.',
        );
        assert.equal(profile.documents.length, 9);
        assert.equal(profile.specs.length, 12);
        profile.documents.splice(-2);
      }
      profile.specs.pop();
      profile.connectivity.midi.usbMidi = null;
      raw = `${JSON.stringify(profile, null, 2)}\n`;
    }
    assert.equal(digest(raw), expected, id);
  }
});
