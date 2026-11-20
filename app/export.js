/** Shared CSV cell encoder. Neutralises spreadsheet formula injection (a text cell starting with
 *  = + - @ TAB CR or LF, optionally after whitespace, gets a leading apostrophe), then quotes cells holding
 *  a comma, quote or line break. Finite numbers stay numeric so negative values are not altered. */
export function csvCell(value){if(typeof value==='number'&&Number.isFinite(value))return String(value);let s=String(value??'');if(/^\s*[=+\-@\t\r\n]/.test(s))s=`'${s}`;return /[",\r\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}
export function measurementsToCsv(measurements=[]){const header=['metric_id','label','value','unit','origin','confidence'];const rows=measurements.map(m=>[m.metricId,m.label,m.value,m.unit,m.origin,m.confidence].map(csvCell).join(','));return [header.join(','),...rows].join('\r\n')+'\r\n';}
export function serializeWorkspaceJson({equipment=[],runs=[]}={}){return JSON.stringify({version:1,exportedAt:new Date().toISOString(),equipment,runs},null,2);}
export const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;
// Retain the public name used by older callers; the limit now also applies to UTF-8 bytes.
export const MAX_WORKSPACE_CHARS = MAX_WORKSPACE_BYTES;
export function parseWorkspaceJson(text) {
  if (typeof text !== 'string' || text.length > MAX_WORKSPACE_BYTES
      || new TextEncoder().encode(text).byteLength > MAX_WORKSPACE_BYTES) {
    throw new Error('The workspace file is missing or larger than 64 MB.');
  }
  const data = JSON.parse(text);
  if (data?.version !== 1 || !Array.isArray(data.equipment) || !Array.isArray(data.runs)) throw new Error('Unsupported or invalid DeckChek workspace file.');
  return { version: 1, equipment: data.equipment, runs: data.runs };
}

/** Bound the selected File before allocating its contents, then parse one strict UTF-8 snapshot. */
export async function readWorkspaceFile(file) {
  const size = file?.size;
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_WORKSPACE_BYTES) {
    throw new Error('The workspace file is missing, has an invalid size or is larger than 64 MB.');
  }
  if (typeof file.arrayBuffer !== 'function') throw new Error('The workspace file cannot be read as bytes.');
  const bytes = await file.arrayBuffer();
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength > MAX_WORKSPACE_BYTES || bytes.byteLength !== size) {
    throw new Error('The workspace file size changed or could not be read completely. Nothing was imported.');
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('The workspace file is not valid UTF-8. Nothing was imported.'); }
  return parseWorkspaceJson(text);
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const strList = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);

/** Keep recorded numeric uncertainty only; never infer a missing magnitude or coverage factor. */
export function sanitizeUncertainty(value) {
  const magnitude = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (typeof value === 'number') return magnitude(value) ? value : null;
  if (!isObj(value)) return null;
  const out = {};
  for (const key of ['standard', 'expanded']) if (magnitude(value[key])) out[key] = value[key];
  if (!Object.keys(out).length) return null;
  if (typeof value.k === 'number' && Number.isFinite(value.k) && value.k > 0) out.k = value.k;
  if (typeof value.unit === 'string') out.unit = value.unit;
  if (isObj(value.components)) out.components = Object.fromEntries(Object.entries(value.components).filter(([, v]) => magnitude(v)));
  return out;
}

/**
 * Imported workspace files are untrusted: keep only the shapes `toPersistRun` reads (arrays of
 * objects, string lists, string fields) so a damaged or hostile file is skipped field by field
 * instead of throwing an engine TypeError (regression: fuzz workspace, non-array measurements).
 */
export function sanitizeImportedRun(run) {
  const str = v => (typeof v === 'string' ? v : undefined);
  const findings = (Array.isArray(run.findings) ? run.findings : []).filter(isObj).map(f => ({
    ...f, code: str(f.code), title: str(f.title), detail: str(f.detail), severity: str(f.severity),
    possibleCauses: strList(f.possibleCauses), isolationTests: strList(f.isolationTests),
    alternatives: Array.isArray(f.alternatives) ? strList(f.alternatives) : undefined,
    supportedBy: strList(f.supportedBy), contradictedBy: strList(f.contradictedBy),
  }));
  const measurements = (Array.isArray(run.measurements) ? run.measurements : []).filter(isObj).map(m => ({
    ...m, metricId: str(m.metricId), label: str(m.label), unit: str(m.unit), origin: str(m.origin), qualityFlags: strList(m.qualityFlags),
    uncertainty: sanitizeUncertainty(m.uncertainty),
  }));
  return { ...run, id: run.id, test: str(run.test), createdAt: str(run.createdAt), workflow: str(run.workflow), sessionType: str(run.sessionType), measurements, findings };
}
