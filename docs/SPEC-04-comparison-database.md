# SPEC-04: Hardware, Timecode, Setup, and Comparison Database

## 1. Purpose

DeckChek includes a local-first comparison database so measurements are not isolated test results.

The database must support comparison among:
- turntables;
- cartridges;
- styli;
- headshells;
- mixers;
- phono preamps;
- audio interfaces/sound cards;
- DVS interfaces;
- DVS/timecode media;
- test records;
- isolation products;
- support surfaces/furniture;
- complete setups;
- venues/locations/booths;
- user-owned hardware instances;
- measurement sessions.

The database is both:
1. a product/specification catalog;
2. a measurement history.

These two data classes must never be conflated.

## 2. Provenance classes

Every field that can originate externally carries provenance.

Values:
- MANUFACTURER_PUBLISHED;
- OFFICIAL_MANUAL;
- DECKCHEK_MEASURED;
- USER_ENTERED;
- COMMUNITY_AGGREGATE;
- IMPORTED_THIRD_PARTY.

Required provenance metadata:
- source URL or document identifier;
- source title;
- retrieval date;
- source notes;
- measurement method where applicable.

## 3. Product vs asset

### Product
A general model such as:
- Technics SL-1200GR2;
- Pioneer PLX-1000;
- Audio-Technica AT-XP3;
- Focusrite Scarlett 4i4 4th Gen.

### Asset
A specific physical unit owned/used by the user:
- "Left SL-1200 #1";
- serial number if user enters it;
- purchase date;
- service history;
- baseline measurements.

All diagnostics should reference Asset when possible.

## 4. Product categories

Enum:
- TURNTABLE;
- CARTRIDGE;
- STYLUS;
- HEADSHELL;
- MIXER;
- PHONO_PREAMP;
- AUDIO_INTERFACE;
- DVS_INTERFACE;
- MOTOR_CONTROLLER;
- ISOLATION_PLATFORM;
- SUPPORT_SURFACE;
- TEST_RECORD;
- DVS_MEDIA;
- OTHER.

## 5. Turntable product fields

Identity:
- manufacturer;
- model;
- variant;
- production era;
- drive type;
- intended market: DJ/audiophile/general/archive.

Mechanical:
- supported speeds;
- platter diameter;
- platter mass;
- total unit mass;
- drive method;
- brake type;
- published starting torque;
- published startup time;
- published wow/flutter;
- published S/N;
- pitch ranges;
- quartz lock;
- reverse support;
- motor torque modes.

Tonearm:
- arm type;
- effective length;
- overhang;
- offset angle;
- tracking-force range;
- arm-height range;
- supported cartridge mass;
- removable headshell;
- anti-skate range.

Connectivity:
- fixed/removable RCA;
- ground lead;
- built-in phono preamp;
- USB audio.

## 6. Cartridge product fields

Identity:
- manufacturer;
- model;
- family;
- technology: MM/MC/MI/etc.;
- DJ vs hi-fi vs archival.

Electrical:
- output voltage;
- channel balance;
- channel separation at stated frequency;
- frequency response;
- coil impedance;
- recommended load impedance;
- capacitance.

Mechanical:
- recommended tracking force;
- allowed tracking-force range;
- cartridge mass;
- compliance;
- vertical tracking angle.

Stylus:
- shape;
- dimensions;
- bonded/nude;
- replaceable stylus model;
- DJ/backcue suitability;
- manufacturer notes on timecode use.

## 7. Stylus asset fields

A replaceable stylus needs its own maintenance record:
- installed date;
- estimated hours;
- cleanings;
- known incidents;
- visual inspection notes;
- baseline DVS score;
- baseline crosstalk;
- baseline distortion;
- retirement date.

## 8. Mixer fields

- manufacturer/model;
- channels;
- phono inputs;
- line inputs;
- selectable phono/line;
- signal-ground terminal;
- analog/digital architecture;
- published frequency response;
- published S/N for PHONO;
- THD;
- USB audio;
- USB sample rates;
- DVS software compatibility;
- internal sound card;
- input trim range;
- phono input impedance where documented;
- firmware version at test.

Measured fields can include:
- input-channel gain mismatch;
- phono noise floor;
- hum susceptibility;
- channel crosstalk;
- clipping threshold;
- latency.

## 9. Audio-interface fields

- manufacturer/model/generation;
- driver/backend;
- USB/Thunderbolt/etc.;
- max sample rate;
- supported sample rates;
- bit depth;
- line inputs;
- phono input availability;
- input impedance;
- maximum input level;
- dynamic range;
- THD+N;
- gain range;
- loopback;
- OS support.

Measurement-specific:
- actual channel mismatch;
- noise floor;
- latency;
- clock stability;
- dropped-buffer rate.

## 10. DVS media fields

- vendor;
- family;
- product;
- version/pressing;
- color/edition optional;
- medium: vinyl/CD/file/hardware-generated;
- side;
- nominal RPM;
- duration;
- absolute mode supported;
- relative mode supported;
- analyzer module;
- public identifying code;
- reference capture;
- manufacturer documentation;
- known compatibility.

User-owned copy:
- purchase date;
- usage hours/cycles optional;
- side condition scans;
- cue-region wear;
- current quality score;
- retired status.

## 11. Test-record fields

- manufacturer/title;
- edition;
- catalog number;
- speed;
- side;
- track index;
- track title;
- signal type;
- nominal frequency;
- channel assignment;
- level if documented;
- duration;
- intended test.

This allows the UI to say:
"Play Side A, Track 3: 1 kHz Left Channel"
rather than relying on memory.

## 12. Surface/support fields

Support record:
- type: table/booth/shelf/rack/case/platform/custom;
- material;
- approximate mass;
- dimensions;
- compliance/rigidity notes;
- isolation feet/pads;
- mounting method;
- coupled/decoupled;
- temporary/permanent.

Measured:
- vibration RMS;
- dominant frequencies;
- shock count;
- feedback onset;
- DVS dropout under SPL;
- needle-skip incidents.

## 13. Venue/location fields

Venue:
- user-visible name;
- type: club/bar/home/studio/outdoor/festival/community hall/shop/other;
- city/region optional;
- notes.

No precise address required.

Booth/location:
- venue_id;
- booth name;
- floor type;
- platform type;
- stage riser;
- turntable support;
- speaker/sub placement notes;
- approximate deck-to-sub distance;
- isolation hardware;
- typical SPL if measured;
- foot traffic level;
- floor bounce rating;
- electrical notes;
- ground/hum notes.

## 14. Complete setup configuration

A Setup record references:
- Turntable A asset;
- Turntable B asset;
- Cartridge A/B;
- Stylus A/B;
- headshell;
- mixer;
- interface;
- DVS media;
- support;
- venue;
- wiring notes.

Hash the component IDs + relevant settings so repeated use of identical configuration can be compared.

## 15. Comparison dimensions

### Turntables
- speed accuracy;
- wow/flutter;
- startup;
- brake;
- recovery;
- pitch linearity;
- rumble;
- venue vibration stability.

### Cartridges
- channel balance;
- separation;
- output;
- DVS integrity;
- scratch tracking;
- surface-noise behavior;
- wear trend.

### Mixers
- phono noise;
- hum;
- headroom;
- channel match;
- DVS quality;
- USB capture stability.

### Audio interfaces
- capture noise;
- channel match;
- latency;
- clock stability;
- max clean input;
- dropouts.

### Timecodes
- integrity;
- cue wear;
- scratch score;
- dropout tolerance;
- cartridge dependency;
- noise susceptibility.

### Venues/surfaces
- feedback onset;
- vibration;
- skip/dropout rate;
- footfall sensitivity;
- hum;
- successful vinyl-only session history.

## 16. Fair-comparison rules

DeckChek must reject or clearly mark unfair comparisons.

Examples:
- wow measured with different methods;
- cartridge balance measured on different test records;
- DVS quality compared using different media versions;
- venue feedback compared at unknown SPL;
- one result had clipping.

Each chart can filter to:
"Comparable measurements only."

## 17. Aggregation

For repeated compatible measurements:
- count;
- mean;
- median;
- standard deviation;
- min/max;
- p10/p90;
- last result;
- trend.

Community aggregation, if later added, must show sample count and method compatibility.

## 18. Ranking

Do not create a universal "best cartridge" ranking by default.

Use goal profiles:
- vinyl-only club;
- scratch/DVS;
- home listening;
- archival;
- portable DJ;
- high-vibration venue.

Users can choose weighted metrics.

## 19. Vinyl-only venue suitability

Special comparison profile:
- feedback onset;
- low-frequency vibration;
- footfall shocks;
- skip events/hour;
- rumble;
- grounding/hum;
- booth rigidity;
- isolation effectiveness.

Output:
- Excellent;
- Good;
- Conditional;
- Difficult;
- Unsuitable without changes.

Always show why.

## 20. Search/filter UI

Examples:
- cartridges with recommended tracking force <= 3 g;
- turntables with measured wow < threshold;
- venues where Deck A had no skips;
- surfaces tested above 95 dB SPL;
- DVS media with best cue-region durability;
- mixer/interface combinations with lowest measured hum.

## 21. Data portability

Export:
- full database JSON;
- tables CSV;
- one product;
- one asset;
- one venue;
- one setup;
- one session.

Import must validate schema version and provenance.

## 22. Starter database

Repository includes a small, source-backed seed dataset for development.

Seed purpose:
- exercise UI;
- test schema;
- demonstrate comparison.

It is not an exhaustive market database.

Initial verified examples should include at least:
- Technics SL-1200GR2;
- Pioneer PLX-1000;
- Audio-Technica AT-XP3;
- Ortofon DigiTrack;
- Pioneer DJ DJM-S11;
- Focusrite Scarlett 4i4 4th Gen;
- Serato control-vinyl family;
- Traktor timecode family;
- rekordbox control-vinyl family.

## 23. Database update policy

Manufacturer values can change by model revision or region.

Each field therefore supports:
- valid_from;
- valid_to;
- region;
- model revision;
- source.

Do not overwrite old facts when a new revision appears.

## 24. Asset maintenance events

Event types:
- stylus installed;
- cartridge installed;
- cartridge aligned;
- tracking force changed;
- anti-skate changed;
- RCA replaced;
- pitch serviced;
- motor serviced;
- bearing serviced;
- deck transported;
- impact incident;
- mixer input serviced;
- firmware changed.

These events appear on measurement trend charts.

## 25. User notes

Notes can attach to:
- product;
- asset;
- venue;
- setup;
- session;
- scan event.

Examples:
- "Right deck buzzes if booth light dimmer is on."
- "Best with isolation feet."
- "Control vinyl side B retired."

## 26. Acceptance criteria

Database feature is implemented when:
- products and physical assets are distinct;
- a complete setup can reference all components;
- external values preserve provenance;
- measurement method compatibility can be queried;
- two products can be compared by manufacturer and DeckChek measurements separately;
- venue/surface measurements are supported;
- DVS media copies can accumulate wear history;
- user can export all data;
- starter seed data loads without network access.
