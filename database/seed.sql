-- DeckChek starter catalog
-- Source-backed development data only. It is intentionally small and not exhaustive.
-- Run after database/migrations/0001_initial.sql.

INSERT OR IGNORE INTO manufacturer(id,name,website,notes,created_at,updated_at) VALUES
('00000000-0000-4000-8000-000000000001','Technics','https://www.technics.com',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000002','Pioneer DJ','https://www.pioneerdj.com',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000003','Audio-Technica','https://www.audio-technica.com',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000004','Ortofon','https://ortofon.com',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000005','Focusrite','https://focusrite.com',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000006','Serato','https://serato.com',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000007','Native Instruments','https://www.native-instruments.com',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('00000000-0000-4000-8000-000000000008','AlphaTheta / rekordbox','https://rekordbox.com',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO product(id,manufacturer_id,category,model,variant,description,source_url,created_at,updated_at) VALUES
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','TURNTABLE','SL-1200GR2',NULL,'Direct-drive turntable','https://us.technics.com/products/direct-drive-turntable-system-ii-sl-1200gr2',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','TURNTABLE','PLX-1000',NULL,'High-torque direct-drive professional turntable','https://www.pioneerdj.com/en/news/2014/plx-1000/',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','CARTRIDGE','AT-XP3',NULL,'DJ moving-magnet cartridge','https://sea.audio-technica.com/Dual-Moving-Magnet-Stereo-DJ-Cartridge-AT-XP3',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004','CARTRIDGE','DigiTrack',NULL,'DJ cartridge designed for coded vinyl','https://ortofon.com/pages/digitrack',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002','MIXER','DJM-S11',NULL,'Professional scratch-style 2-channel DJ mixer','https://www.pioneerdj.com/en/product/dj-mixers/djm-s11/',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('10000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000005','AUDIO_INTERFACE','Scarlett 4i4','4th Generation','USB audio interface','https://focusrite.com/products/scarlett-4i4',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('10000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000006','DVS_MEDIA','Serato Control Vinyl','family','Serato NoiseMap control-vinyl family','https://support.serato.com/hc/en-us/articles/202996934-How-to-calibrate-Serato-DJ',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('10000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000007','DVS_MEDIA','Traktor Timecode Vinyl','family','Traktor timecode-control media family','https://support.native-instruments.com/support/solutions/articles/69000879426-traktor-pro-3-timecode-setup-guide',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('10000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000008','DVS_MEDIA','rekordbox Control Vinyl','family','rekordbox-exclusive DVS control-vinyl family','https://rekordbox.com/en/support/faq/dvs-6/',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

-- Technics SL-1200GR2
INSERT OR IGNORE INTO product_spec(id,product_id,key,numeric_value,text_value,unit,method,provenance_type,source_title,source_url,retrieved_at,notes) VALUES
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','turntable.wow_flutter',0.025,NULL,'percent','WRMS','MANUFACTURER_PUBLISHED','Technics SL-1200GR2 official specifications','https://us.technics.com/products/direct-drive-turntable-system-ii-sl-1200gr2','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','turntable.starting_torque',2.2,NULL,'kg-cm',NULL,'MANUFACTURER_PUBLISHED','Technics SL-1200GR2 official specifications','https://us.technics.com/products/direct-drive-turntable-system-ii-sl-1200gr2','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','turntable.startup_time',0.7,NULL,'s','standstill to 33-1/3 r/min','MANUFACTURER_PUBLISHED','Technics SL-1200GR2 official specifications','https://us.technics.com/products/direct-drive-turntable-system-ii-sl-1200gr2','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','turntable.pitch_ranges',NULL,'±8%, ±16%',NULL,NULL,'MANUFACTURER_PUBLISHED','Technics SL-1200GR2 official specifications','https://us.technics.com/products/direct-drive-turntable-system-ii-sl-1200gr2','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','turntable.speeds',NULL,'33-1/3, 45, 78', 'rpm',NULL,'MANUFACTURER_PUBLISHED','Technics SL-1200GR2 official specifications','https://us.technics.com/products/direct-drive-turntable-system-ii-sl-1200gr2','2026-10-05',NULL);

-- Pioneer PLX-1000
INSERT OR IGNORE INTO product_spec(id,product_id,key,numeric_value,text_value,unit,method,provenance_type,source_title,source_url,retrieved_at,notes) VALUES
('20000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000002','turntable.wow_flutter',0.1,NULL,'percent','WRMS JIS WTD; published as <=','MANUFACTURER_PUBLISHED','Pioneer DJ PLX-1000 announcement/specifications','https://www.pioneerdj.com/en/news/2014/plx-1000/','2026-10-05','Upper bound'),
('20000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000002','turntable.starting_torque',4.5,NULL,'kg-cm','published as >=','MANUFACTURER_PUBLISHED','Pioneer DJ PLX-1000 announcement/specifications','https://www.pioneerdj.com/en/news/2014/plx-1000/','2026-10-05','Lower bound'),
('20000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000002','turntable.startup_time',0.3,NULL,'s','at 33-1/3 rpm','MANUFACTURER_PUBLISHED','Pioneer DJ PLX-1000 announcement/specifications','https://www.pioneerdj.com/en/news/2014/plx-1000/','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000002','turntable.pitch_ranges',NULL,'±8%, ±16%, ±50%',NULL,NULL,'MANUFACTURER_PUBLISHED','Pioneer DJ PLX-1000 announcement/specifications','https://www.pioneerdj.com/en/news/2014/plx-1000/','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000002','turntable.snr',70,NULL,'dB','DIN-B','MANUFACTURER_PUBLISHED','Pioneer DJ PLX-1000 announcement/specifications','https://www.pioneerdj.com/en/news/2014/plx-1000/','2026-10-05',NULL);

-- Audio-Technica AT-XP3
INSERT OR IGNORE INTO product_spec(id,product_id,key,numeric_value,text_value,unit,frequency_hz,method,provenance_type,source_title,source_url,retrieved_at,notes) VALUES
('20000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000003','cartridge.channel_separation',20,NULL,'dB',1000,NULL,'MANUFACTURER_PUBLISHED','Audio-Technica AT-XP3 specifications','https://sea.audio-technica.com/Dual-Moving-Magnet-Stereo-DJ-Cartridge-AT-XP3','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000003','cartridge.channel_balance',2.0,NULL,'dB',1000,NULL,'MANUFACTURER_PUBLISHED','Audio-Technica AT-XP3 specifications','https://sea.audio-technica.com/Dual-Moving-Magnet-Stereo-DJ-Cartridge-AT-XP3','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000023','10000000-0000-4000-8000-000000000003','cartridge.output_voltage',5.5,NULL,'mV',1000,'5 cm/sec','MANUFACTURER_PUBLISHED','Audio-Technica AT-XP3 specifications','https://sea.audio-technica.com/Dual-Moving-Magnet-Stereo-DJ-Cartridge-AT-XP3','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000024','10000000-0000-4000-8000-000000000003','cartridge.tracking_force_range',NULL,'2.0-4.0 g; standard 3.0 g','g',NULL,NULL,'MANUFACTURER_PUBLISHED','Audio-Technica AT-XP3 specifications','https://sea.audio-technica.com/Dual-Moving-Magnet-Stereo-DJ-Cartridge-AT-XP3','2026-10-05',NULL);

-- Ortofon DigiTrack
INSERT OR IGNORE INTO product_spec(id,product_id,key,numeric_value,text_value,unit,frequency_hz,method,provenance_type,source_title,source_url,retrieved_at,notes) VALUES
('20000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000004','cartridge.channel_separation',22,NULL,'dB',1000,NULL,'MANUFACTURER_PUBLISHED','Ortofon DigiTrack','https://ortofon.com/pages/digitrack','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000004','cartridge.channel_balance',1.5,NULL,'dB',1000,NULL,'MANUFACTURER_PUBLISHED','Ortofon DigiTrack','https://ortofon.com/pages/digitrack','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000033','10000000-0000-4000-8000-000000000004','cartridge.output_voltage',8.0,NULL,'mV',1000,'5 cm/sec','MANUFACTURER_PUBLISHED','Ortofon DigiTrack','https://ortofon.com/pages/digitrack','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000034','10000000-0000-4000-8000-000000000004','cartridge.tracking_force_range',NULL,'2.0-4.0 g; recommended 3.0 g','g',NULL,NULL,'MANUFACTURER_PUBLISHED','Ortofon DigiTrack','https://ortofon.com/pages/digitrack','2026-10-05',NULL);

-- Pioneer DJ DJM-S11
INSERT OR IGNORE INTO product_spec(id,product_id,key,numeric_value,text_value,boolean_value,unit,method,provenance_type,source_title,source_url,retrieved_at,notes) VALUES
('20000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-000000000005','mixer.phono_inputs',2,NULL,NULL,'count',NULL,'MANUFACTURER_PUBLISHED','Pioneer DJ DJM-S11 specifications','https://www.pioneerdj.com/en/news/2020/djm-s11-scratch-style-2-channel-dj-mixer/','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000042','10000000-0000-4000-8000-000000000005','mixer.phono_snr',90,NULL,NULL,'dB',NULL,'MANUFACTURER_PUBLISHED','Pioneer DJ DJM-S11 specifications','https://www.pioneerdj.com/en/news/2020/djm-s11-scratch-style-2-channel-dj-mixer/','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000043','10000000-0000-4000-8000-000000000005','mixer.internal_usb_soundcard',NULL,NULL,1,NULL,NULL,'MANUFACTURER_PUBLISHED','Pioneer DJ DJM-S11','https://www.pioneerdj.com/en/support/software-information/mixer/djm-s11/','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000044','10000000-0000-4000-8000-000000000005','mixer.dvs_compatibility',NULL,'Serato DJ Pro; rekordbox',NULL,NULL,NULL,'MANUFACTURER_PUBLISHED','Pioneer DJ DJM-S11','https://www.pioneerdj.com/en/product/dj-mixers/djm-s11/','2026-10-05',NULL);

-- Focusrite Scarlett 4i4 4th Gen
INSERT OR IGNORE INTO product_spec(id,product_id,key,numeric_value,text_value,boolean_value,unit,method,provenance_type,source_title,source_url,retrieved_at,notes) VALUES
('20000000-0000-4000-8000-000000000051','10000000-0000-4000-8000-000000000006','interface.max_sample_rate',192000,NULL,NULL,'Hz',NULL,'MANUFACTURER_PUBLISHED','Focusrite Scarlett 4i4 4th Generation','https://focusrite.com/products/scarlett-4i4','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000052','10000000-0000-4000-8000-000000000006','interface.ad_resolution',24,NULL,NULL,'bit',NULL,'MANUFACTURER_PUBLISHED','Focusrite Scarlett 4i4 4th Generation','https://focusrite.com/products/scarlett-4i4','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000053','10000000-0000-4000-8000-000000000006','interface.line_input_dynamic_range',115.5,NULL,NULL,'dB(A)',NULL,'MANUFACTURER_PUBLISHED','Focusrite Scarlett 4i4 4th Generation','https://focusrite.com/products/scarlett-4i4','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000054','10000000-0000-4000-8000-000000000006','interface.max_line_input_level',22,NULL,NULL,'dBu',NULL,'MANUFACTURER_PUBLISHED','Focusrite Scarlett 4i4 4th Generation','https://focusrite.com/products/scarlett-4i4','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000055','10000000-0000-4000-8000-000000000006','interface.has_phono_input',NULL,NULL,0,NULL,NULL,'MANUFACTURER_PUBLISHED','Focusrite Scarlett 4i4 4th Generation','https://focusrite.com/products/scarlett-4i4','2026-10-05','Use appropriate phono stage/mixer before line input.');

-- DVS media profiles
INSERT OR IGNORE INTO dvs_media_profile(product_id,family,version,medium_type,analyzer_key,documentation_url,notes) VALUES
('10000000-0000-4000-8000-000000000007','Serato NoiseMap',NULL,'VINYL','serato','https://support.serato.com/hc/en-us/articles/202996934-How-to-calibrate-Serato-DJ','Official docs describe 1 kHz directional tone plus NoiseMap position component.'),
('10000000-0000-4000-8000-000000000008','Traktor Timecode',NULL,'VINYL','traktor','https://support.native-instruments.com/support/solutions/articles/69000879426-traktor-pro-3-timecode-setup-guide','Official docs describe calibration scope and Relative/Absolute operation.'),
('10000000-0000-4000-8000-000000000009','rekordbox DVS',NULL,'VINYL','rekordbox','https://rekordbox.com/en/support/faq/dvs-6/','rekordbox documents use of its exclusive control signal.');

INSERT OR IGNORE INTO product_spec(id,product_id,key,numeric_value,text_value,boolean_value,unit,frequency_hz,method,provenance_type,source_title,source_url,retrieved_at,notes) VALUES
('20000000-0000-4000-8000-000000000061','10000000-0000-4000-8000-000000000007','dvs.directional_tone_frequency',1000,NULL,NULL,'Hz',1000,'public documentation','OFFICIAL_MANUAL','Serato calibration support','https://support.serato.com/hc/en-us/articles/202996934-How-to-calibrate-Serato-DJ','2026-10-05','Directional tone provides current speed and direction.'),
('20000000-0000-4000-8000-000000000062','10000000-0000-4000-8000-000000000007','dvs.has_absolute_position_component',NULL,NULL,1,NULL,NULL,'public documentation','OFFICIAL_MANUAL','Serato calibration support','https://support.serato.com/hc/en-us/articles/202996934-How-to-calibrate-Serato-DJ','2026-10-05','NoiseMap is documented as providing precise position.'),
('20000000-0000-4000-8000-000000000063','10000000-0000-4000-8000-000000000008','dvs.has_calibration_scope',NULL,NULL,1,NULL,NULL,'public documentation','OFFICIAL_MANUAL','TRAKTOR PRO 3 Timecode Setup Guide','https://support.native-instruments.com/support/solutions/articles/69000879426-traktor-pro-3-timecode-setup-guide','2026-10-05',NULL),
('20000000-0000-4000-8000-000000000064','10000000-0000-4000-8000-000000000009','dvs.requires_vendor_control_signal',NULL,NULL,1,NULL,NULL,'public documentation','OFFICIAL_MANUAL','rekordbox DVS FAQ','https://rekordbox.com/en/support/faq/dvs-6/','2026-10-05','Official FAQ says other manufacturers control media are not supported.');
