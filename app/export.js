/** Shared CSV cell encoder. Neutralises spreadsheet formula injection (a text cell starting with
 *  = + - @ TAB CR or LF, optionally after whitespace, gets a leading apostrophe), then quotes cells holding
 *  a comma, quote or line break. Finite numbers stay numeric so negative values are not altered. */
export function csvCell(value){if(typeof value==='number'&&Number.isFinite(value))return String(value);let s=String(value??'');if(/^\s*[=+\-@\t\r\n]/.test(s))s=`'${s}`;return /[",\r\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}
export function measurementsToCsv(measurements=[]){const header=['metric_id','label','value','unit','origin','confidence'];const rows=measurements.map(m=>[m.metricId,m.label,m.value,m.unit,m.origin,m.confidence].map(csvCell).join(','));return [header.join(','),...rows].join('\r\n')+'\r\n';}
export function serializeWorkspaceJson({equipment=[],runs=[]}={}){return JSON.stringify({version:1,exportedAt:new Date().toISOString(),equipment,runs},null,2);}
export function parseWorkspaceJson(text){const data=JSON.parse(text);if(data?.version!==1||!Array.isArray(data.equipment)||!Array.isArray(data.runs))throw new Error('Unsupported or invalid DeckChek workspace file.');return {version:1,equipment:data.equipment,runs:data.runs};}
