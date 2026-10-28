// Serato (experimental, FS-32 §5, AC-6): report only. Serato has no published MIDI mapping schema; DeckChek will not
// write Serato XML until three real mappings made in Serato's own editor have been captured and compared. Until
// then this produces a Markdown table to enter by hand in Serato's MIDI mapping mode.

import { mappingReport } from './traktor-report.js';

export const SERATO_STATUS = 'Experimental';

/** seratoReport(model) -> Markdown string. */
export function seratoReport(model) {
  return mappingReport(model, {
    target: 'serato', title: 'Serato mapping report (experimental)', status: 'Experimental: report only, no Serato file is written',
    steps: [
      'In Serato open Setup > MIDI, tick "Allow Serato Hardware Remapping" if your controller is officially supported, and select the device.',
      'Click MIDI in the top bar to enter mapping mode.',
      'For each row: click the on-screen control named in the table, then move the hardware control shown.',
      'Save the preset in Setup > MIDI. Serato keeps it in Music/_Serato_/MIDI/Xml.',
    ],
  });
}
