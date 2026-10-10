// CI check: device-profile timecode.formats[] must not contradict app/timecode.js TIMECODE_FORMATS.
// Run: node tools/check-timecode-facts.mjs   (exit 1 on any contradiction)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIMECODE_FORMATS } from '../app/timecode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILES = path.join(ROOT, 'app', 'devices', 'profiles');

/** Returns an array of error strings for one parsed profile. A format whose name matches a built-in (case-insensitive) must not contradict its carrierHz; a null carrier means "unknown" and is allowed. */
export function checkProfile(profile, label = profile?.id, formats = TIMECODE_FORMATS) {
  const errors = [];
  for (const pf of profile?.timecode?.formats ?? []) {
    const ref = formats.find(f => f.name.toLowerCase() === String(pf?.name ?? '').toLowerCase());
    if (!ref || pf.carrierHz == null) continue;
    if (pf.carrierHz !== ref.carrierHz) errors.push(`${label}: format "${pf.name}" carrierHz ${pf.carrierHz} contradicts TIMECODE_FORMATS ${ref.carrierHz}`);
  }
  return errors;
}

export function checkAll(dir = PROFILES) {
  const errors = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    errors.push(...checkProfile(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')), file));
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkAll();
  if (errors.length) { for (const e of errors) console.error(e); process.exit(1); }
  console.log('Timecode facts: device profiles are consistent with TIMECODE_FORMATS.');
}
