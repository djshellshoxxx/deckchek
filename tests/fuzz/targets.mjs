// JavaScript fuzz targets: every pure function that reads text or JSON from a file, paste,
// QR frames or localStorage. Seeds come from real artefacts so mutations start from valid shapes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePhoneRun, buildExport, toQrFrames } from '../../app/phone-run.js';
import { parseWorkspaceJson, serializeWorkspaceJson } from '../../app/export.js';
import { workspaceToImportPayload, validateManifestShape } from '../../app/backup.js';
import { prepareImport, loadMediaState } from '../../app/media-library.js';
import { loadState } from '../../app/catalog-store.js';
import { canonicalJson, isCanonical, CanonicalJsonError } from '../../app/canonical-json.js';
import { validatePack } from '../../app/pack.js';
import { parseMessage } from '../../app/midi-tests.js';
import { validateProfile } from '../../app/devices/library.js';
import { parseStrictJson, validatePayload, extractJsonFromHtml, CertificateError } from '../../app/certificate.js';
import { parseXml } from '../../app/mapper/xml.js';
import { importMixxx } from '../../app/mapper/mixxx.js';
import { importVdj } from '../../app/mapper/vdj.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const firstJson = dir => { const d = path.join(ROOT, dir); return fs.readdirSync(d).filter(f => f.endsWith('.json') && f !== 'index.json').sort().slice(0, 2).map(f => fs.readFileSync(path.join(d, f), 'utf8')); };
const storage = text => ({ getItem: () => text, setItem() {} });

function phoneSeed() {
  const e = buildExport({ createdAt: '2026-01-01T00:00:00.000Z', device: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', sampleRate: 48000 }, measurements: [{ metricId: 'rpm', label: 'RPM', value: 33.3, unit: 'rpm' }] });
  return e;
}

export function buildTargets() {
  let phone = [];
  try {
    const e = phoneSeed();
    const json = JSON.stringify(e);
    phone = [json, toQrFrames(json).join('\n')];
  } catch { phone = ['{"format":"deckchek-mobile","version":1}']; }
  const workspace = serializeWorkspaceJson({ equipment: [{ id: 'e1', type: 'turntable', make: 'Technics', model: 'SL-1200' }], runs: [{ id: 'r1', test: 'Quick Check', createdAt: '2026-01-01T00:00:00Z', measurements: [{ metricId: 'balance', value: 0.4, unit: 'dB' }], findings: [{ title: 'ok', severity: 'info' }] }] });
  const manifest = JSON.stringify({ format: 'deckchek-backup', formatVersion: 1, createdAt: '2026-01-01T00:00:00Z', kind: 'manual', appVersion: '0.0.8', schemaVersion: 18, counts: {}, files: [{ name: 'db/deckchek.sqlite3', bytes: 10, sha256: 'a'.repeat(64) }] });
  const canonical = read('tests/fixtures/canonical-vectors.json');
  const pack = read('src-tauri/fuzz/corpus/pack/good.json'); // same seed as the Rust pack fuzz target
  return [
    { name: 'phone-run', seeds: phone, run: t => { const r = parsePhoneRun(t); if (!r.ok && !r.errors.length) throw new TypeError('rejected without an error'); } },
    { name: 'workspace', throws: true, seeds: [workspace], run: t => workspaceToImportPayload(parseWorkspaceJson(t)) },
    { name: 'backup-manifest', seeds: [manifest], run: t => { let m; try { m = JSON.parse(t); } catch { return; } validateManifestShape(m); } },
    { name: 'media-import', seeds: firstJson('app/media/profiles'), run: t => { const r = prepareImport(t, { builtinIds: ['x'] }); if (!r.ok && !r.errors?.length) throw new TypeError('rejected without an error'); } },
    { name: 'media-state', seeds: ['{"custom":[],"owned":[]}'], run: t => loadMediaState(storage(t)) },
    { name: 'catalog-state', seeds: ['{"catalog":{"manufacturer":[]},"runs":[]}'], run: t => loadState(storage(t)) },
    { name: 'canonical', throws: true, allowedErrors: [CanonicalJsonError], seeds: [canonical], run: t => { let v; try { v = JSON.parse(t); } catch { return; } isCanonical(t); const c = canonicalJson(v); if (canonicalJson(JSON.parse(c)) !== c || !isCanonical(c)) throw new TypeError('canonical form not idempotent'); } },
    { name: 'pack', seeds: [pack], run: t => validatePack(t) },
    { name: 'midi-message', seeds: ['[144,60,127]', '[240,126,127,6,1,247]', '[176,7,0]'], run: t => { let a; try { a = JSON.parse(t); } catch { return; } if (!Array.isArray(a)) return; parseMessage(Uint8Array.from(a.slice(0, 4096).map(x => Number(x) & 255))); } },
    { name: 'certificate', throws: true, allowedErrors: [CertificateError], seeds: [read('tests/fixtures/certificate/valid-v1.deckchek-cert.json')], run: t => { extractJsonFromHtml(t); let v; try { v = parseStrictJson(t); } catch { return; } if (v && typeof v === 'object' && v.payload) validatePayload(v.payload); } },
    { name: 'mapper-xml', seeds: [read('tests/fixtures/mapper/third-party.midi.xml'), read('tests/fixtures/mapper/golden.midi.xml')], run: t => { const r = parseXml(t); if (r && r.ok === false && !r.error) throw new TypeError('rejected without an error'); importMixxx(t, []); } },
    { name: 'mapper-vdj', seeds: [read('tests/fixtures/mapper/vdj-definition.xml')], run: t => { importVdj(t, read('tests/fixtures/mapper/vdj-mapper.xml')); importVdj(read('tests/fixtures/mapper/vdj-definition.xml'), t); } },
    { name: 'device-profile', seeds: firstJson('app/devices/profiles'), run: t => { let p; try { p = JSON.parse(t); } catch { return; } validateProfile(p); } },
  ];
}
