// SPEC-05 §16 / SPEC-19: uncalibrated, passive digital LF observations.
// Original numerical evidence is immutable; this module never archives PCM.
import { createCatalogStore } from './catalog-store.js';
import { profileInapplicableReasons } from './calibration.js';

export const SUPPORT_METHOD = 'support-lf-welch-ms-v1';
export const SUPPORT_STORAGE_PREFIX = 'deckchek.support-isolation.v1.';
export const SUPPORT_EVIDENCE_BYTES = 64 * 1024;
export const SUPPORT_HISTORY_LIMIT = 50;
export const SUPPORT_CAPTURE_SECONDS = 30;
export const SUPPORT_CAPTURE_MAX_SECONDS = 35;
export const SUPPORT_UNCERTAINTY = Object.freeze({ status: 'unknown', standard: null, expanded: null, coverageFactor: null,
  reason: 'No validated uncertainty model for this digital LF observation.' });
const OBS_KEYS = ['schemaVersion','id','pairId','stage','venueId','setupId','capturedAt','finishedAt','context','capture','calibration','analysis','analysisError','rawAudioRetained'];
const CMP_KEYS = ['schemaVersion','id','observationAId','observationBId','createdAt','sameConditions'];
const CONDITIONS = ['route','gainSettings','procedure','source','placement','paState','paLevel','stationaryConfirmed'];
const nativeInvoke = () => globalThis.window?.__TAURI__?.core?.invoke ?? globalThis.__TAURI__?.core?.invoke ?? null;
const clone = value => JSON.parse(JSON.stringify(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
const same = (a,b) => canonical(a) === canonical(b);
const close = (a,b) => finite(a) && finite(b) && Math.abs(a-b) <= 1e-14 + 1e-9*Math.abs(b);
// Saved algebra is stricter than an independently generated numerical fixture:
// an exact zero density/segment total cannot acquire positive reported power.
const closePower = (a,b) => finite(a)&&finite(b)&&a>=0&&b>=0&&((a===0||b===0)?a===b:Math.abs(a-b)<=Math.max(4*Number.MIN_VALUE,1e-9*Math.max(a,b)));
function descendingText(a,b) {
  const left=Array.from(String(a),c=>c.codePointAt(0)),right=Array.from(String(b),c=>c.codePointAt(0));
  for(let i=0;i<Math.min(left.length,right.length);i++)if(left[i]!==right[i])return right[i]-left[i];return right.length-left.length;
}
const level = power => power > 0 ? 10*Math.log10(power) : null;
export class SupportIsolationError extends Error {
  constructor(code,message) { super(message); this.name='SupportIsolationError'; this.code=code; }
}
const invalid = message => { throw new SupportIsolationError('SUPPORT_INVALID',message); };
function object(value,keys,name) {
  if (!value || typeof value!=='object' || Array.isArray(value)) invalid(`${name} must be an object`);
  if (keys && Object.keys(value).some(key=>!keys.includes(key))) invalid(`${name} has unsupported fields`);
}
function identifier(value,name) {
  if (typeof value!=='string' || !value.trim() || value!==value.trim() || [...value].length>128 || /[\u0000-\u001f\u007f]/.test(value)
    || Array.from(value,c=>c.codePointAt(0)).some(c=>c>=0xd800&&c<=0xdfff)) invalid(`${name} must be a valid identifier`);
  return value;
}
function timestamp(value,name) {
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString()!==value) invalid(`${name} must be a UTC timestamp with milliseconds`);
  return value;
}
function jsonEvidence(value) {
  const ancestors=new Set();
  function visit(item,depth=0) {
    if (depth>20) invalid('Evidence is too deeply nested');
    if (item===null || typeof item==='string' || typeof item==='boolean') return;
    if (typeof item==='number') { if (!finite(item)) invalid('Evidence contains a non-finite number'); return; }
    if (!item || typeof item!=='object' || (!Array.isArray(item)&&Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null) || ancestors.has(item)) invalid('Evidence must be finite, acyclic JSON');
    ancestors.add(item); for (const child of Object.values(item)) visit(child,depth+1); ancestors.delete(item);
  }
  visit(value);
  if (new TextEncoder().encode(JSON.stringify(value)).length>SUPPORT_EVIDENCE_BYTES) invalid(`Complete evidence exceeds ${SUPPORT_EVIDENCE_BYTES} bytes; nothing was trimmed`);
}

export function methodGeometry(sampleRate,capturedFrames) {
  if (!Number.isSafeInteger(sampleRate) || sampleRate<=400) invalid('Unsupported sample rate for the 20–200 Hz method');
  const fftSize=2**Math.ceil(Math.log2(sampleRate));
  if (fftSize>2**18) invalid('Unsupported FFT size for this bounded method');
  const candidateFrames=30*sampleRate;
  if (!integer(capturedFrames)||capturedFrames<candidateFrames) invalid('Incomplete capture: at least 30 seconds of samples are required');
  if (capturedFrames>35*sampleRate) invalid('Capture exceeds the bounded 35 second recording window');
  const hop=fftSize/2, segments=1+Math.floor((candidateFrames-fftSize)/hop), analyzedFrames=fftSize+(segments-1)*hop;
  return { sampleRate,fftSize,hop,segments,capturedFrames,candidateFrames,analyzedFrames,omittedFrames:capturedFrames-analyzedFrames,binHz:sampleRate/fftSize };
}
// In-place radix-2 transform, the same basic algorithm used by existing audio
// workflows. Scaling here is independent of the feedback amplitude spectrum.
function fft(re,im) {
  const n=re.length;
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
  for(let len=2;len<=n;len<<=1){const angle=-2*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle),half=len>>1;
    for(let start=0;start<n;start+=len){let cr=1,ci=0;for(let k=0;k<half;k++){const a=start+k,b=a+half,xr=re[b]*cr-im[b]*ci,xi=re[b]*ci+im[b]*cr;
      re[b]=re[a]-xr;im[b]=im[a]-xi;re[a]+=xr;im[a]+=xi;const next=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=next;}}}
}
function bandBins(g) {
  const binIndices=[],overlapHz=[];
  for(let k=0;k<=g.fftSize/2;k++){const f=k*g.binHz,overlap=Math.max(0,Math.min(f+g.binHz/2,200)-Math.max(f-g.binHz/2,20));if(overlap>0){binIndices.push(k);overlapHz.push(overlap);}}
  return {binIndices,overlapHz};
}
function channelPower(samples,g,w,bins) {
  const re=new Float64Array(g.fftSize),im=new Float64Array(g.fftSize),psd=new Array(bins.binIndices.length).fill(0),segmentPowers=[];
  const normalization=g.sampleRate*g.windowSumSquares;
  for(let segment=0;segment<g.segments;segment++){
    const start=segment*g.hop;let mean=0;for(let n=0;n<g.fftSize;n++)mean+=samples[start+n];mean/=g.fftSize;
    for(let n=0;n<g.fftSize;n++){re[n]=(samples[start+n]-mean)*w[n];im[n]=0;}fft(re,im);let power=0;
    for(let i=0;i<psd.length;i++){const k=bins.binIndices[i],fold=k===0||k===g.fftSize/2?1:2,density=fold*(re[k]*re[k]+im[k]*im[k])/normalization;
      psd[i]+=density;power+=density*bins.overlapHz[i];}
    segmentPowers.push(power);
  }
  for(let i=0;i<psd.length;i++)psd[i]/=g.segments;
  return {psd,segmentPowers,power:psd.reduce((sum,value,i)=>sum+value*bins.overlapHz[i],0)};
}
/** Full returned buffers are validated, including samples outside the analyzed interval. */
export function analyzeSupportAudio({left,right,sampleRate}) {
  if (!left || !right || left.length!==right.length || !left.length || !ArrayBuffer.isView(left)||!ArrayBuffer.isView(right)) invalid('A complete stereo capture is required');
  for(const samples of [left,right]) for(const value of samples) if(!finite(value)) invalid('Captured samples contain non-finite values');
  const geometry=methodGeometry(sampleRate,left.length),w=new Float64Array(geometry.fftSize);let windowSumSquares=0,windowSum=0;
  for(let i=0;i<w.length;i++){w[i]=.5-.5*Math.cos(2*Math.PI*i/w.length);windowSumSquares+=w[i]*w[i];windowSum+=w[i];}
  const g={...geometry,windowSumSquares,coherentGain:windowSum/w.length},bins=bandBins(g),l=channelPower(left,g,w,bins),r=channelPower(right,g,w,bins),pairPower=(l.power+r.power)/2;
  return {method:SUPPORT_METHOD,bandHz:[20,200],window:'hann-periodic',detrend:'segment-mean',statistic:'mean-channel-power',...g,...bins,
    psdL:l.psd,psdR:r.psd,segmentPowersL:l.segmentPowers,segmentPowersR:r.segmentPowers,powerL:l.power,powerR:r.power,pairPower,
    levelDbfsL:level(l.power),levelDbfsR:level(r.power),levelDbfsPair:level(pairPower),uncertainty:clone(SUPPORT_UNCERTAINTY)};
}
function validateAnalysis(a) {
  object(a,['method','bandHz','window','detrend','statistic','sampleRate','fftSize','hop','segments','capturedFrames','candidateFrames','analyzedFrames','omittedFrames','binHz','windowSumSquares','coherentGain','binIndices','overlapHz','psdL','psdR','segmentPowersL','segmentPowersR','powerL','powerR','pairPower','levelDbfsL','levelDbfsR','levelDbfsPair','uncertainty'],'Analysis');
  if(a.method!==SUPPORT_METHOD||!same(a.bandHz,[20,200])||a.window!=='hann-periodic'||a.detrend!=='segment-mean'||a.statistic!=='mean-channel-power'||!same(a.uncertainty,SUPPORT_UNCERTAINTY)) invalid('Unsupported analysis method, statistic or uncertainty');
  const g=methodGeometry(a.sampleRate,a.capturedFrames),bins=bandBins(g);
  for(const key of Object.keys(g)) if(a[key]!==g[key]) invalid(`Analysis ${key} is inconsistent`);
  if(!close(a.windowSumSquares,3*g.fftSize/8)||!close(a.coherentGain,.5)||!same(a.binIndices,bins.binIndices)||!same(a.overlapHz,bins.overlapHz)) invalid('Analysis window or frequency geometry is inconsistent');
  for(const channel of ['L','R']){
    const psd=a[`psd${channel}`],powers=a[`segmentPowers${channel}`];
    if(!Array.isArray(psd)||psd.length!==bins.binIndices.length||!Array.isArray(powers)||powers.length!==g.segments||[...psd,...powers].some(value=>!finite(value)||value<0)) invalid('Analysis density or segment powers are invalid');
    const integrated=psd.reduce((sum,value,i)=>sum+value*bins.overlapHz[i],0),averaged=powers.reduce((sum,value)=>sum+value,0)/powers.length;
    if(!closePower(a[`power${channel}`],integrated)||!closePower(integrated,averaged)) invalid('Analysis power disagrees with original density or segment powers');
  }
  if(!closePower(a.pairPower,(a.powerL+a.powerR)/2)) invalid('Analysis mean channel power is inconsistent');
  for(const suffix of ['L','R','Pair']){const expected=level(suffix==='Pair'?a.pairPower:a[`power${suffix}`]);if(expected===null?a[`levelDbfs${suffix}`]!==null:!close(a[`levelDbfs${suffix}`],expected)) invalid('Analysis logarithmic level is inconsistent');}
}
export function normalizeObservation(input) {
  object(input,OBS_KEYS,'Observation');jsonEvidence(input);
  if(input.schemaVersion!==1||input.rawAudioRetained!==false||!['A','B'].includes(input.stage)) invalid('Unsupported observation version, stage or audio retention');
  for(const key of ['id','pairId','venueId','setupId']) identifier(input[key],key);
  timestamp(input.capturedAt,'Capture start');timestamp(input.finishedAt,'Capture end');
  if(input.finishedAt<input.capturedAt) invalid('Capture timestamps are reversed');
  object(input.context,['venue','setup','support','conditions'],'Context');
  for(const key of ['venue','setup','support']) {object(input.context[key],null,key);identifier(input.context[key].id,`${key} ID`);if(typeof input.context[key].name!=='string'||!input.context[key].name.trim())invalid(`${key} name is required`);}
  if(input.context.venue.id!==input.venueId||input.context.setup.id!==input.setupId||input.context.setup.venueId!==input.venueId) invalid('Selected context does not match venue/setup');
  object(input.context.conditions,CONDITIONS,'Conditions');
  for(const key of CONDITIONS.filter(k=>k!=='stationaryConfirmed')) if(typeof input.context.conditions[key]!=='string'||!input.context.conditions[key].trim()||input.context.conditions[key].length>2000) invalid(`Record ${key} within 2000 characters`);
  if(!['off','fixed'].includes(input.context.conditions.paState)||typeof input.context.conditions.stationaryConfirmed!=='boolean')invalid('Record the stationary procedure and fixed/off PA state');
  object(input.capture,null,'Capture');object(input.calibration,['state','sourceKey','profile','reasons','applied'],'Calibration');
  if(!['none','available','unavailable','rejected'].includes(input.calibration.state)||input.calibration.applied!==false||!Array.isArray(input.calibration.reasons)||input.calibration.reasons.some(x=>typeof x!=='string'))invalid('Invalid calibration observation');
  if(input.analysis===null){if(typeof input.analysisError!=='string'||!input.analysisError)invalid('Unavailable analysis requires a reason');}
  else {validateAnalysis(input.analysis);if(input.analysisError!==null)invalid('A completed analysis cannot contain an analysis error');}
  return clone(input);
}
const stereoPair = p=>p?.mono===false&&Number.isInteger(p.first)&&p.first>0&&p.first%2===1&&p.second===p.first+1;
/** Qualifies original evidence, never current catalog state or compatibility defaults. */
export function observationIssues(row) {
  const reasons=[],add=reason=>{if(!reasons.includes(reason))reasons.push(reason);},c=row.capture||{},q=c.quality,info=c.info,native=c.nativeFields,pair=c.pair,integrity=c.sampleIntegrity;
  if(!row.analysis)add('analysis_unavailable');
  if(c.preempted)add('capture_preempted');
  if(!integer(c.framesL)||c.framesL!==c.framesR||c.framesL<30*c.sampleRate||c.framesL>35*c.sampleRate)add('capture_incomplete');
  if(!integer(c.channels)||c.channels<2||c.channels>65535||!integer(c.sampleRate)||c.sampleRate<=400||!stereoPair(pair)||pair.second>c.channels||!info
    ||!integer(info.channels)||info.channels<2||info.channels>65535||!integer(info.sampleRate)||info.sampleRate<=400
    ||!stereoPair(info.pairs?.[0])||info.pairs?.length!==1||!integer(info.leaseId)||info.leaseId===0||!finite(info.maxSeconds)||info.maxSeconds<30||info.maxSeconds>35)add('native_observation_missing');
  if(typeof c.deviceName!=='string'||!c.deviceName.trim()||['input','Unnamed audio input'].includes(c.deviceName))add('native_observation_missing');
  if(info&&(info.deviceName!==c.deviceName||info.sampleRate!==c.sampleRate||info.channels!==c.channels||!same(info.pairs?.[0],pair)))add('actual_input_changed');
  const fields=['left','right','sampleRate','channels','deviceName','pairs','streamErrors'];
  if(!native||fields.some(key=>native[key]?.present!==true||native[key]?.valid!==true))add('native_observation_missing');
  else if(native.left.samples!==c.framesL||native.right.samples!==c.framesR||native.sampleRate.value!==c.sampleRate||native.channels.value!==c.channels||native.deviceName.value!==c.deviceName||native.pairs.value?.length!==1||!same(native.pairs.value[0],pair)||!same(native.streamErrors.value,c.streamErrors))add('native_observation_mismatch');
  const counters=['framesCaptured','overrunSamples','clippedSamplesL','clippedSamplesR','streamErrors','callbackCount'];
  if(!q||counters.some(key=>!integer(q[key]))||!finite(q.maxCallbackGapMs)||q.maxCallbackGapMs<0||typeof q.truncated!=='boolean')add('capture_integrity_missing');
  else {
    if(q.framesCaptured!==c.framesL||q.callbackCount===0||q.overrunSamples>0||q.streamErrors>0||q.truncated)add('capture_integrity_failed');
    if(q.clippedSamplesL>0||q.clippedSamplesR>0)add('clipped_input');
    if(q.pairs?.length!==1||q.pairs[0]?.first!==pair?.first||q.pairs[0]?.clippedSamplesL!==q.clippedSamplesL||q.pairs[0]?.clippedSamplesR!==q.clippedSamplesR)add('capture_integrity_missing');
  }
  if(!Array.isArray(c.streamErrors)||c.streamErrors.length||!Array.isArray(q?.streamErrorMessages)||q.streamErrorMessages.length)add('capture_integrity_failed');
  if(!integrity||['nonFiniteL','nonFiniteR','clippedL','clippedR'].some(key=>!integer(integrity[key])))add('capture_integrity_missing');
  else {if(integrity.nonFiniteL||integrity.nonFiniteR)add('non_finite_samples');if(integrity.clippedL||integrity.clippedR)add('clipped_input');}
  if(row.analysis&&(row.analysis.sampleRate!==c.sampleRate||row.analysis.capturedFrames!==c.framesL))add('native_observation_mismatch');
  if(!row.context?.conditions?.stationaryConfirmed)add('procedure_not_confirmed');
  const support=row.context?.support,setup=row.context?.setup;
  if(support?.deckPositionId&&support.deckPositionId!==setup?.deckPositionId)add('support_position_incompatible');
  if(!Array.isArray(setup?.components)||setup.components.some(c=>!c||typeof c!=='object'||typeof c.id!=='string'||typeof c.assetId!=='string'||typeof c.role!=='string'))add('setup_context_unavailable');
  const cal=row.calibration;
  if(!cal||['unavailable','rejected'].includes(cal.state)||cal.applied!==false)add('calibration_context_unavailable');
  else if(cal.state==='available'&&(typeof cal.profile?.deviceName!=='string'||!cal.profile.deviceName.trim()||profileInapplicableReasons(cal.profile,{deviceName:c.deviceName,sampleRate:c.sampleRate}).length))add('calibration_context_unavailable');
  else if(cal.state==='none'&&cal.profile!==null)add('calibration_context_unavailable');
  for(const issue of row.contextIssues||[])add(issue);
  return reasons;
}
export function createObservation({id,pairId,stage,venueId,setupId,capturedAt,finishedAt,context,result,captureInfo,calibration}) {
  const a=result?.audio||{},scan=samples=>{let nonFinite=0,clipped=0;for(const value of samples||[]){if(!finite(value))nonFinite++;else if(Math.abs(value)>=.999)clipped++;}return {nonFinite,clipped};},l=scan(a.left),r=scan(a.right);
  let analysis=null,analysisError=null;
  try { analysis=analyzeSupportAudio(a); } catch(error){analysisError=error.message;}
  const capture={info:captureInfo??null,nativeFields:a.nativeFields??null,quality:result?.quality??null,streamErrors:result?.streamErrors??null,deviceName:result?.deviceName??null,
    sampleRate:a.sampleRate??null,channels:a.channels??null,framesL:a.left?.length??0,framesR:a.right?.length??0,pair:a.pairs?.[0]?.pair??null,preempted:result?.preempted===true,
    sampleIntegrity:{nonFiniteL:l.nonFinite,nonFiniteR:r.nonFinite,clippedL:l.clipped,clippedR:r.clipped}};
  return normalizeObservation({schemaVersion:1,id,pairId,stage,venueId,setupId,capturedAt,finishedAt,context,capture,calibration,analysis,analysisError,rawAudioRetained:false});
}
export function normalizeComparison(input) {
  object(input,CMP_KEYS,'Comparison');jsonEvidence(input);
  if(input.schemaVersion!==1||typeof input.sameConditions!=='boolean')invalid('Invalid comparison version or conditions confirmation');
  for(const key of ['id','observationAId','observationBId'])identifier(input[key],key);timestamp(input.createdAt,'Comparison time');
  if(input.observationAId===input.observationBId)invalid('Comparison references must identify distinct observations');
  return clone(input);
}
function setupBasis(context) {
  const s=context.setup;return {venueId:s.venueId,boothId:s.boothId??null,deckPositionId:s.deckPositionId??null,
    components:(Array.isArray(s.components)?s.components:[]).map(c=>({id:c?.id??null,role:c?.role??null,assetId:c?.assetId??null,position:c?.position??null,settingsSnapshotId:c?.settingsSnapshotId??null})).sort((a,b)=>-descendingText(a.id,b.id))};
}
function supportBasis(s) {return {deckPositionId:s.deckPositionId??null,description:s.description??null,structureJson:s.structureJson??'[]',approximateMassKg:s.approximateMassKg??null,coupledState:s.coupledState??null,notes:s.notes??null};}
export function compareObservations(a,b,input) {
  const draft=normalizeComparison(input);
  if(a?.id!==draft.observationAId||b?.id!==draft.observationBId)invalid('Comparison source observation is missing');
  if(a.stage!=='A'||b.stage!=='B'||a.pairId!==b.pairId||a.venueId!==b.venueId||a.setupId!==b.setupId)invalid('Comparison references do not belong to the same ordered A/B pair');
  const reasons=[...new Set([...observationIssues(a),...observationIssues(b)])],add=reason=>{if(!reasons.includes(reason))reasons.push(reason);};
  if(!draft.sameConditions)add('pa_comparability_unconfirmed');
  if(a.context.support.id===b.context.support.id)add('support_change_not_recorded');
  if(!same(setupBasis(a.context),setupBasis(b.context)))add('setup_context_changed');
  const conditions=a.context.conditions,other=b.context.conditions;
  for(const [keys,reason] of [[['route'],'physical_route_changed'],[['gainSettings'],'gain_or_filter_changed'],[['procedure','source','stationaryConfirmed'],'procedure_changed'],[['placement'],'placement_changed'],[['paState','paLevel'],'pa_conditions_changed']])if(keys.some(key=>conditions[key]!==other[key]))add(reason);
  if(a.capture.deviceName!==b.capture.deviceName||a.capture.channels!==b.capture.channels)add('actual_input_changed');
  if(!same(a.capture.pair,b.capture.pair))add('input_pair_changed');
  if(a.capture.sampleRate!==b.capture.sampleRate)add('sample_rate_changed');
  if(!same(a.calibration,b.calibration))add('calibration_context_changed');
  if(a.analysis&&b.analysis){
    for(const key of ['method','sampleRate','fftSize','hop','segments','candidateFrames','analyzedFrames','window','detrend','statistic'])if(a.analysis[key]!==b.analysis[key])add('method_mismatch');
    if([a.analysis.powerL,a.analysis.powerR,b.analysis.powerL,b.analysis.powerR].some(value=>!(value>0)))add('zero_band_power');
  }
  const deltaDb={left:null,right:null,pair:null};
  if(!reasons.length) for(const [key,metric] of [['left','powerL'],['right','powerR'],['pair','pairPower']])deltaDb[key]=10*Math.log10(b.analysis[metric])-10*Math.log10(a.analysis[metric]);
  return {method:SUPPORT_METHOD,direction:'B-minus-A',status:reasons.length?'not_comparable':'operator_reported_comparable',reasons,deltaDb,uncertainty:clone(SUPPORT_UNCERTAINTY)};
}

const sourceInput = row=>Object.fromEntries(OBS_KEYS.map(key=>[key,row[key]]));
const comparisonInput = row=>Object.fromEntries(CMP_KEYS.map(key=>[key,row[key]]));
function observationRecord(value) {
  object(value,[...OBS_KEYS,'recordedAt','contextIssues'],'Saved observation');
  const input=normalizeObservation(sourceInput(value));timestamp(value.recordedAt,'Persistence time');
  if(!Array.isArray(value.contextIssues)||value.contextIssues.some(reason=>reason!=='catalog_context_changed'))invalid('Invalid saved context validation');
  return {...input,recordedAt:value.recordedAt,contextIssues:clone(value.contextIssues)};
}
function comparisonRecord(value) {
  object(value,[...CMP_KEYS,'pairId','venueId','setupId','result','recordedAt'],'Saved comparison');
  const input=normalizeComparison(comparisonInput(value));for(const key of ['pairId','venueId','setupId'])identifier(value[key],key);timestamp(value.recordedAt,'Persistence time');
  object(value.result,['method','direction','status','reasons','deltaDb','uncertainty'],'Comparison result');
  if(value.result.method!==SUPPORT_METHOD||value.result.direction!=='B-minus-A'||!['not_comparable','operator_reported_comparable'].includes(value.result.status)||!Array.isArray(value.result.reasons)||!same(value.result.uncertainty,SUPPORT_UNCERTAINTY))invalid('Invalid saved comparison result');
  object(value.result.deltaDb,['left','right','pair'],'Delta');for(const key of ['left','right','pair'])if(value.result.deltaDb[key]!==null&&!finite(value.result.deltaDb[key]))invalid('Invalid saved delta');
  return clone({...input,pairId:value.pairId,venueId:value.venueId,setupId:value.setupId,result:value.result,recordedAt:value.recordedAt});
}
/** Complete saved forms for archive transfer; no new timestamp or catalog read. */
function sameSavedForm(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && a.length !== b.length) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameSavedForm(a[key], b[key]));
}
export function validateSavedSupportObservation(value) {
  const record = observationRecord(value);
  if (!sameSavedForm(record, value)) invalid('Observation is not in its complete saved form');
  return record;
}
function savedComparisonForm(value) {
  const record = comparisonRecord(value);
  if (!sameSavedForm(record, value)) invalid('Comparison is not in its complete saved form');
  return record;
}
export function validateSavedSupportComparison(value, observationA, observationB) {
  const record = savedComparisonForm(value);
  verifiedComparison(record, observationA, observationB);
  return record;
}
function verifiedComparison(record,a,b) {
  const expected=compareObservations(a,b,comparisonInput(record));
  if(record.pairId!==a.pairId||record.venueId!==a.venueId||record.setupId!==a.setupId||record.result.status!==expected.status||!same(record.result.reasons,expected.reasons))invalid('Saved comparison disagrees with original evidence');
  for(const key of ['left','right','pair'])if(expected.deltaDb[key]===null?record.result.deltaDb[key]!==null:!close(record.result.deltaDb[key],expected.deltaDb[key]))invalid('Saved delta disagrees with original evidence');
  return {...record,observationA:clone(a),observationB:clone(b)};
}
function filterInput(input={}) {
  object(input,['venueId','limit'],'History filter');if(input.venueId!=null)identifier(input.venueId,'Venue ID');const limit=input.limit??SUPPORT_HISTORY_LIMIT;
  if(!Number.isInteger(limit)||limit<1||limit>100)invalid('History limit must be 1–100');return {venueId:input.venueId??null,limit};
}
function conflict(existing,input,extract) {
  if(!same(extract(existing),input))throw new SupportIsolationError('SUPPORT_CONFLICT','Conflicting submission for an existing immutable ID');return clone(existing);
}
/** Independent record keys; writes are atomic within one browser event loop, not across tabs. */
export function createSupportIsolationStore({invoke,storage,catalog=createCatalogStore(),now=()=>new Date().toISOString()}={}) {
  const bridge=()=>invoke===undefined?nativeInvoke():invoke;
  const target=()=>{let result=storage;if(result===undefined){try{result=globalThis.localStorage;}catch(error){throw new Error(`Storage unavailable: ${error.message}`);}}if(!result||typeof result.getItem!=='function'||typeof result.setItem!=='function'||typeof result.key!=='function')throw new Error('Storage is unavailable');return result;};
  const storageFailure=error=>new SupportIsolationError('SUPPORT_STORAGE',`Support history storage failed: ${error.message||error}`);
  function readAll(archive=false,{maxRecords=Infinity,maxBytes=Infinity}={}){try{
    const s=target(),observations=[],comparisons=[],length=s.length;
    if(!integer(length))throw new Error('Storage key enumeration is unavailable');
    if(archive&&[maxRecords,maxBytes].some(value=>value!==Infinity&&(!integer(value))))throw new Error('Invalid archive read bound');
    const seen=new Set();let recordsRead=0,bytes=0;
    for(let i=0;i<length;i++){const key=s.key(i);if(typeof key!=='string'||archive&&seen.has(key))throw new Error('Storage key enumeration changed or is unavailable');seen.add(key);if(!key.startsWith(SUPPORT_STORAGE_PREFIX))continue;
      if(archive&&++recordsRead>maxRecords)throw new Error('Support history exceeds the archive record bound; nothing was truncated');
      const text=s.getItem(key);
      if(archive){if(typeof text!=='string')throw new Error('A support record could not be read');bytes+=new TextEncoder().encode(text).length;if(bytes>maxBytes)throw new Error('Support history exceeds the archive byte bound; nothing was truncated');}
      const kind=key.slice(SUPPORT_STORAGE_PREFIX.length).split('.')[0],raw=JSON.parse(text);let row;
      if(kind==='observation'){row=archive?validateSavedSupportObservation(raw):observationRecord(raw);observations.push(row);}else if(kind==='comparison'){row=archive?savedComparisonForm(raw):comparisonRecord(raw);comparisons.push(row);}else invalid('Unknown stored record kind');
      if(key!==`${SUPPORT_STORAGE_PREFIX}${kind}.${row.id}`)invalid('Stored record key and ID disagree');
    }
    if(archive&&s.length!==length)throw new Error('Storage key enumeration changed');
    const ids=new Set();for(const row of [...observations,...comparisons]){if(ids.has(row.id))invalid('Duplicate immutable record ID');ids.add(row.id);}
    const byId=new Map(observations.map(row=>[row.id,row]));for(const row of comparisons)verifiedComparison(row,byId.get(row.observationAId),byId.get(row.observationBId));
    return {observations,comparisons};
  }catch(error){throw storageFailure(error);}}
  function write(kind,row){try{target().setItem(`${SUPPORT_STORAGE_PREFIX}${kind}.${row.id}`,JSON.stringify(row));}catch(error){throw storageFailure(error);}return clone(row);}
  async function call(command,args){try{return await bridge()(command,args);}catch(error){throw new SupportIsolationError('SUPPORT_STORAGE',typeof error==='string'?error:error?.message||String(error));}}
  const api={
    get native(){return Boolean(bridge());},
    readArchive(limits) {
      if (bridge()) invalid('Venue-history archives read browser storage only');
      return readAll(true, limits);
    },
    prepareArchiveRestore({ observations, comparisons }, limits) {
      if (bridge()) invalid('Venue-history archives restore browser storage only');
      if (!Array.isArray(observations) || !Array.isArray(comparisons)) invalid('Saved support records must be arrays');
      const originals = observations.map(validateSavedSupportObservation), byId = new Map(originals.map(row => [row.id, row]));
      const derived = comparisons.map(row => validateSavedSupportComparison(row, byId.get(row.observationAId), byId.get(row.observationBId)));
      const ids = [...originals, ...derived].map(row => row.id);
      if (new Set(ids).size !== ids.length) invalid('Duplicate support record ID in archive');
      const current = readAll(true, limits), existing = new Map([
        ...current.observations.map(row => [row.id, { kind: 'observation', row }]),
        ...current.comparisons.map(row => [row.id, { kind: 'comparison', row }]),
      ]);
      const readOriginal = (storage, expected) => {
        if (storage.getItem(`${SUPPORT_STORAGE_PREFIX}comparison.${expected.id}`) !== null) throw new SupportIsolationError('SUPPORT_CONFLICT', 'Support ID belongs to a different record kind');
        const raw = storage.getItem(`${SUPPORT_STORAGE_PREFIX}observation.${expected.id}`);
        if (raw === null) invalid('Comparison source observation is missing during restore');
        const found = validateSavedSupportObservation(JSON.parse(raw));
        if (!same(found, expected)) throw new SupportIsolationError('SUPPORT_CONFLICT', 'Comparison source has different saved evidence or persistence metadata');
      };
      return [['observation', originals], ['comparison', derived]].flatMap(([kind, records]) => records.map(record => ({
        kind: kind === 'observation' ? 'supportObservation' : 'supportComparison', id: record.id,
        present: existing.has(record.id),
        conflict: existing.has(record.id) && (existing.get(record.id).kind !== kind || !same(existing.get(record.id).row, record)),
        restore() {
          try {
            const storage = target(), key = `${SUPPORT_STORAGE_PREFIX}${kind}.${record.id}`;
            const other = kind === 'observation' ? 'comparison' : 'observation';
            if (storage.getItem(`${SUPPORT_STORAGE_PREFIX}${other}.${record.id}`) !== null) throw new SupportIsolationError('SUPPORT_CONFLICT', 'Support ID belongs to a different record kind');
            if (kind === 'comparison') {
              readOriginal(storage, byId.get(record.observationAId));
              readOriginal(storage, byId.get(record.observationBId));
            }
            const raw = storage.getItem(key);
            if (raw !== null) {
              const found = kind === 'observation' ? validateSavedSupportObservation(JSON.parse(raw)) : savedComparisonForm(JSON.parse(raw));
              if (!same(found, record)) throw new SupportIsolationError('SUPPORT_CONFLICT', 'Support ID has different saved evidence or persistence metadata');
              return 'present';
            }
            storage.setItem(key, JSON.stringify(record));
            return 'added';
          } catch (error) {
            if (error instanceof SupportIsolationError) throw error;
            throw storageFailure(error);
          }
        },
      })));
    },
    async saveObservation(value){
      const input=normalizeObservation(value);
      if(bridge()){const saved=observationRecord(await call('support_isolation_observation_save',{input}));return conflict(saved,input,sourceInput);}
      let all=readAll(),previous=all.observations.find(row=>row.id===input.id);
      if(previous)return conflict(previous,input,sourceInput);if(all.comparisons.some(row=>row.id===input.id))throw new SupportIsolationError('SUPPORT_CONFLICT','Conflicting record ID');
      let venues,setups,supports;try{[venues,setups,supports]=await Promise.all([catalog.list('venue'),catalog.list('setup'),catalog.list('supportConfiguration')]);}catch(error){throw storageFailure(error);}
      if(!Array.isArray(venues)||!Array.isArray(setups)||!Array.isArray(supports))throw storageFailure(new Error('Catalog returned invalid records'));
      const setup=setups.find(row=>row.id===input.setupId),support=supports.find(row=>row.id===input.context.support.id);
      const matches=venues.some(row=>row.id===input.venueId)&&setup?.venueId===input.venueId&&support&&(!support.deckPositionId||support.deckPositionId===setup.deckPositionId)
        &&same(setupBasis({setup}),setupBasis(input.context))&&(setup.supportConfigurationId??null)===(input.context.setup.supportConfigurationId??null)&&same(supportBasis(support),supportBasis(input.context.support));
      const contextIssues=matches?[]:['catalog_context_changed'];
      all=readAll();previous=all.observations.find(row=>row.id===input.id);if(previous)return conflict(previous,input,sourceInput);
      if(all.comparisons.some(row=>row.id===input.id))throw new SupportIsolationError('SUPPORT_CONFLICT','Conflicting record ID');
      return write('observation',observationRecord({...input,recordedAt:now(),contextIssues}));
    },
    async getObservation(id){identifier(id,'Observation ID');if(bridge()){const value=await call('support_isolation_observation_get',{id});if(value===null)return null;const row=observationRecord(value);if(row.id!==id)throw storageFailure(new Error('Observation ID mismatch'));return row;}return readAll().observations.find(row=>row.id===id)??null;},
    async saveComparison(value){
      const input=normalizeComparison(value);
      if(bridge()){
        const [a,b]=await Promise.all([api.getObservation(input.observationAId),api.getObservation(input.observationBId)]);
        compareObservations(a,b,input);
        const row=comparisonRecord(await call('support_isolation_comparison_save',{input}));conflict(row,input,comparisonInput);
        verifiedComparison(row,a,b);return row;
      }
      const all=readAll(),previous=all.comparisons.find(row=>row.id===input.id);if(previous)return conflict(previous,input,comparisonInput);
      if(all.observations.some(row=>row.id===input.id))throw new SupportIsolationError('SUPPORT_CONFLICT','Conflicting record ID');
      const a=all.observations.find(row=>row.id===input.observationAId),b=all.observations.find(row=>row.id===input.observationBId),result=compareObservations(a,b,input);
      return write('comparison',comparisonRecord({...input,pairId:a.pairId,venueId:a.venueId,setupId:a.setupId,result,recordedAt:now()}));
    },
    async list(value={}){
      const filter=filterInput(value);
      if(bridge()){
        const raw=await call('support_isolation_list',{filter});object(raw,['observations','comparisons','observationTotal','comparisonTotal','limit'],'History');
        if(raw.limit!==filter.limit||!Array.isArray(raw.observations)||!Array.isArray(raw.comparisons)||!integer(raw.observationTotal)||!integer(raw.comparisonTotal)||raw.observations.length!==Math.min(filter.limit,raw.observationTotal)||raw.comparisons.length!==Math.min(filter.limit,raw.comparisonTotal))throw storageFailure(new Error('History counts or limits are invalid'));
        const observations=raw.observations.map(observationRecord),comparisons=raw.comparisons.map(row=>{const {observationA,observationB,...record}=row;return verifiedComparison(comparisonRecord(record),observationRecord(observationA),observationRecord(observationB));});
        const ids=[...observations,...comparisons].map(row=>row.id);if(new Set(ids).size!==ids.length)throw storageFailure(new Error('Duplicate history record IDs'));
        const originals=new Map(observations.map(row=>[row.id,row])),comparisonIds=new Set(comparisons.map(row=>row.id));
        for(const comparison of comparisons)for(const original of [comparison.observationA,comparison.observationB]){
          if(comparisonIds.has(original.id)||originals.has(original.id)&&!same(originals.get(original.id),original))throw storageFailure(new Error('Repeated original observation snapshots disagree'));
          originals.set(original.id,original);
        }
        if([...observations,...comparisons].some(row=>filter.venueId&&row.venueId!==filter.venueId))throw storageFailure(new Error('History venue mismatch'));
        return {...raw,observations,comparisons};
      }
      const all=readAll(),matching=rows=>rows.filter(row=>!filter.venueId||row.venueId===filter.venueId).sort((a,b)=>descendingText(a.capturedAt??a.createdAt,b.capturedAt??b.createdAt)||descendingText(a.id,b.id));
      const observations=matching(all.observations),comparisons=matching(all.comparisons),byId=new Map(all.observations.map(row=>[row.id,row]));
      return {observations:observations.slice(0,filter.limit),comparisons:comparisons.slice(0,filter.limit).map(row=>verifiedComparison(row,byId.get(row.observationAId),byId.get(row.observationBId))),observationTotal:observations.length,comparisonTotal:comparisons.length,limit:filter.limit};
    },
  };return api;
}
