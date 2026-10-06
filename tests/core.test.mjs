import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rms, dbfs, peak, clippingCount, correlation, channelBalanceDb, signalSanityMetrics, toneAmplitude,
  estimateToneFrequency, speedFromReferenceTone, humMetrics, scopeMetrics,
  detectTransients, recurrenceMetrics, conditionScore, quickDiagnostic,
  buildHtmlReport, normalizeMeasurement, compareRuns
} from '../app/core.js';

const sr = 48000;
function sine(freq, seconds=1, amp=0.5, phase=0) {
  const n=Math.floor(sr*seconds); const out=new Float32Array(n);
  for(let i=0;i<n;i++) out[i]=amp*Math.sin((2*Math.PI*freq*i/sr)+phase);
  return out;
}
function impulseTrain(periodSec, seconds=3, amp=0.9){
  const n=Math.floor(sr*seconds); const out=new Float32Array(n); const p=Math.floor(periodSec*sr);
  for(let i=p;i<n;i+=p) out[i]=amp;
  return out;
}

test('RMS and dBFS are correct for a sine',()=>{
  const x=sine(1000,1,0.5);
  assert.ok(Math.abs(rms(x) - 0.35355) < 0.002);
  assert.ok(Math.abs(dbfs(rms(x)) + 9.03) < 0.1);
});
test('peak and clipping count detect overload',()=>{
  const x=Float32Array.from([0,.2,1,-1,.99]);
  assert.equal(peak(x),1); assert.equal(clippingCount(x,0.999),2);
});
test('correlation distinguishes polarity',()=>{
  const a=sine(440,.25,.5); const b=Float32Array.from(a, v=>-v);
  assert.ok(correlation(a,a) > .999); assert.ok(correlation(a,b) < -.999);
});
test('channel balance reports right channel lower by about 6 dB',()=>{
  const l=sine(1000,.5,.5), r=sine(1000,.5,.25);
  assert.ok(Math.abs(channelBalanceDb(l,r)-6.0206)<.08);
});
test('tone estimator resolves reference tone',()=>{
  const f=estimateToneFrequency(sine(1000,1,.8),sr,{minHz:900,maxHz:1100});
  assert.ok(Math.abs(f-1000)<1);
});
test('speed mapping converts tone error to RPM and pitch percent',()=>{
  const s=speedFromReferenceTone(sine(1010,1,.8),sr,{referenceHz:1000,nominalRpm:33.333333});
  assert.ok(Math.abs(s.pitchPercent-1)<.08); assert.ok(Math.abs(s.rpm-33.6667)<.05);
});
test('hum metrics identify 60 Hz dominated input',()=>{
  const h=humMetrics(sine(60,1,.7),sr); assert.equal(h.mainsHz,60); assert.ok(h.mainsDb > h.alternateDb + 15);
});
test('scope metrics show balanced quadrature as healthy ellipse',()=>{
  const m=scopeMetrics(sine(1000,.25,.5,0),sine(1000,.25,.5,Math.PI/2));
  assert.ok(Math.abs(m.balanceDb)<.05); assert.ok(Math.abs(m.correlation)<.05); assert.ok(m.circularity>0.9);
});
test('transient detector finds spaced impulses',()=>{
  const events=detectTransients(impulseTrain(.5,3),sr,{thresholdDb:18,refractoryMs:20});
  assert.ok(events.length>=4 && events.length<=6);
});
test('recurrence metrics detect half-second repeating scratch pattern',()=>{
  const events=[.5,1,1.5,2,2.5].map(t=>({sample:Math.round(t*sr),timeSec:t,severity:1,confidence:.9}));
  const rec=recurrenceMetrics(events,{sampleRate:sr}); assert.ok(Math.abs(rec.periodSec-.5)<.02); assert.ok(rec.confidence>.9);
});
test('condition score penalizes severe recurring events',()=>{
  const clean=conditionScore({transientDensityPerMin:0,humDb:-80,rumbleDb:-70,repeatingSeverity:0,clipping:0});
  const bad=conditionScore({transientDensityPerMin:30,humDb:-35,rumbleDb:-30,repeatingSeverity:1,clipping:100});
  assert.ok(clean>=95); assert.ok(bad<60);
});
test('quick diagnostic emits evidence and hypotheses without overclaiming',()=>{
  const q=quickDiagnostic({left:sine(1000,1,.5),right:sine(1000,1,.25),sampleRate:sr});
  assert.equal(q.measurements.find(m=>m.metricId==='channel_balance_db').origin,'measured');
  assert.ok(q.findings.some(f=>f.code==='CHANNEL_IMBALANCE'));
  assert.ok(q.findings.find(f=>f.code==='CHANNEL_IMBALANCE').possibleCauses.length>1);
});
test('normalizeMeasurement preserves evidence metadata',()=>{
  const m=normalizeMeasurement({metricId:'rpm',label:'RPM',value:33.34,unit:'rpm',confidence:.92,uncertainty:.02});
  assert.equal(m.origin,'measured'); assert.equal(m.confidence,.92); assert.equal(m.uncertainty,.02);
});
test('run comparison only compares common metrics and returns deltas',()=>{
  const a={measurements:[{metricId:'rpm',value:33.30,unit:'rpm'},{metricId:'wow',value:.1,unit:'%'}]};
  const b={measurements:[{metricId:'rpm',value:33.40,unit:'rpm'},{metricId:'balance',value:.2,unit:'dB'}]};
  const c=compareRuns(a,b); assert.equal(c.length,1); assert.equal(c[0].metricId,'rpm'); assert.ok(Math.abs(c[0].delta-.1)<1e-9);
});
test('HTML report escapes user content',()=>{
  const html=buildHtmlReport({title:'<bad>',device:'Deck & Cart',measurements:[],findings:[]});
  assert.ok(html.includes('&lt;bad&gt;')); assert.ok(html.includes('Deck &amp; Cart')); assert.ok(!html.includes('<bad>'));
});


import { frequencyTrace, speedStabilityMetrics, dropoutMetrics, generateSine, encodeWav16 } from '../app/advanced.js';

test('frequency trace tracks a slowly changing reference tone',()=>{
  const n=sr*2; const x=new Float32Array(n); let phase=0;
  for(let i=0;i<n;i++){const f=995+10*(i/(n-1));phase+=2*Math.PI*f/sr;x[i]=.7*Math.sin(phase);}
  const trace=frequencyTrace(x,sr,{referenceHz:1000,windowSec:.25,hopSec:.25,spanHz:30});
  assert.ok(trace.length>=7); assert.ok(trace[0].frequencyHz < trace.at(-1).frequencyHz);
});
test('speed stability reports drift and modulation',()=>{
  const trace=[{timeSec:0,frequencyHz:999},{timeSec:1,frequencyHz:1000},{timeSec:2,frequencyHz:1001},{timeSec:3,frequencyHz:1002}];
  const m=speedStabilityMetrics(trace,{referenceHz:1000,nominalRpm:33.333333});
  assert.ok(m.driftPercent>0.2 && m.driftPercent<0.4); assert.ok(m.wowFlutterRmsPercent>0); assert.ok(m.meanRpm>33.3);
});
test('dropout metrics identify silent sections',()=>{
  const x=sine(1000,1,.5); for(let i=12000;i<18000;i++)x[i]=0;
  const d=dropoutMetrics(x,sr,{windowMs:20,dropDb:24});
  assert.ok(d.dropoutCount>=1); assert.ok(d.dropoutDurationSec>.05);
});
test('synthetic sine generator has requested duration and amplitude',()=>{
  const x=generateSine({frequencyHz:440,sampleRate:48000,durationSec:.5,amplitude:.25});
  assert.equal(x.length,24000); assert.ok(peak(x)>.249 && peak(x)<=.251);
});
test('16-bit WAV encoder writes RIFF/WAVE header',()=>{
  const wav=encodeWav16({left:generateSine({frequencyHz:440,sampleRate:8000,durationSec:.1,amplitude:.2}),sampleRate:8000});
  const view=new DataView(wav.buffer,wav.byteOffset,wav.byteLength);
  const str=(o,n)=>Array.from({length:n},(_,i)=>String.fromCharCode(view.getUint8(o+i))).join('');
  assert.equal(str(0,4),'RIFF'); assert.equal(str(8,4),'WAVE'); assert.equal(str(12,4),'fmt '); assert.equal(str(36,4),'data');
});


import {
  pitchMapMetrics, transitionMetrics, normalizedLevelTrace, repeatabilityMetrics, trendMetrics, channelSeparationDb, thdPercent, traceModulationPercent, ellipseMetrics, dvsIntegrityScore, subsonicPeak, compareEventMaps,
  dvsIntegrityTimeline, normalizedEventMap, reasonFromEvidence
} from '../app/diagnostics.js';

test('pitch map reports slope, nonlinearity and hysteresis',()=>{
  const points=[
    {position:-8,measuredPercent:-7.9,direction:'up'},{position:-4,measuredPercent:-4.1,direction:'up'},
    {position:0,measuredPercent:.05,direction:'up'},{position:4,measuredPercent:4.2,direction:'up'},
    {position:8,measuredPercent:8.1,direction:'up'},{position:8,measuredPercent:8.0,direction:'down'},
    {position:4,measuredPercent:4.0,direction:'down'},{position:0,measuredPercent:-.05,direction:'down'},
    {position:-4,measuredPercent:-4.0,direction:'down'},{position:-8,measuredPercent:-8.0,direction:'down'}
  ];
  const m=pitchMapMetrics(points); assert.ok(m.slope>.98 && m.slope<1.05); assert.ok(m.maxNonlinearityPercent<.35); assert.ok(m.hysteresisPercent<.3);
});
test('transition metrics identify startup and brake threshold crossings',()=>{
  const trace=[0,.1,.35,.7,.95,1,.98,.7,.3,.05,0].map((level,i)=>({timeSec:i*.1,level}));
  const m=transitionMetrics(trace,{startIndex:0,stopIndex:6,readyThreshold:.9,stoppedThreshold:.1});
  assert.ok(Math.abs(m.startupSec-.4)<.001); assert.ok(Math.abs(m.brakeSec-.3)<.001);
});
test('channel separation converts signal/leak ratio to dB',()=>{assert.ok(Math.abs(channelSeparationDb(.5,.005)-40)<.01);});
test('THD estimate remains low for clean sine and rises with harmonic',()=>{
  const clean=sine(1000,1,.5); const dirty=Float32Array.from(clean,(v,i)=>v+.1*Math.sin(2*Math.PI*2000*i/sr));
  assert.ok(thdPercent(clean,sr,1000)<1); assert.ok(thdPercent(dirty,sr,1000)>10);
});
test('DVS integrity timeline flags a muted interval',()=>{
  const l=sine(1000,1,.5),r=sine(1000,1,.5,Math.PI/2);for(let i=20000;i<28000;i++){l[i]=0;r[i]=0;}
  const timeline=dvsIntegrityTimeline(l,r,sr,{windowSec:.05}); assert.ok(timeline.some(x=>x.signalPresent===false)); assert.ok(timeline.some(x=>x.signalPresent===true));
});
test('normalized event map keeps positions within side bounds',()=>{
  const m=normalizedEventMap([{timeSec:0},{timeSec:30},{timeSec:60}],60); assert.deepEqual(m.map(x=>x.normalizedPosition),[0,.5,1]);
});
test('reasoning engine preserves alternatives and isolation tests',()=>{
  const r=reasonFromEvidence({channelBalanceDb:3.2,humDb:-34,correlation:.1}); assert.ok(r.some(x=>x.code==='CHANNEL_PATH_IMBALANCE')); assert.ok(r.some(x=>x.code==='HUM_PATH')); assert.ok(r.every(x=>x.alternatives.length>0&&x.isolationTests.length>0));
});


test('normalized level trace follows a start and stop envelope',()=>{
  const x=new Float32Array(sr);for(let i=0;i<x.length;i++){const t=i/sr;const env=t<.2?t/.2:t<.7?1:Math.max(0,1-(t-.7)/.2);x[i]=env*.5*Math.sin(2*Math.PI*1000*i/sr);}
  const trace=normalizedLevelTrace(x,sr,{windowMs:20});assert.ok(trace.length>30);assert.ok(trace[0].level<.2);assert.ok(Math.max(...trace.map(x=>x.level))>.95);assert.ok(trace.at(-1).level<.2);
});


import { measurementsToCsv, parseWorkspaceJson, serializeWorkspaceJson } from '../app/export.js';

test('CSV export quotes commas quotes and line breaks',()=>{
  const csv=measurementsToCsv([{metricId:'x',label:'A, "quoted"\nlabel',value:1.2,unit:'dB',origin:'measured',confidence:.9}]);
  assert.ok(csv.includes('"A, ""quoted""\nlabel"')); assert.ok(csv.includes('1.2'));
});
test('workspace JSON round trip keeps version and arrays',()=>{
  const text=serializeWorkspaceJson({equipment:[{id:'1'}],runs:[{id:'r'}]});const data=parseWorkspaceJson(text);
  assert.equal(data.version,1);assert.equal(data.equipment[0].id,'1');assert.equal(data.runs[0].id,'r');
});
test('workspace import rejects invalid shape',()=>{assert.throws(()=>parseWorkspaceJson('{"version":1,"equipment":{}}'));});


test('signal sanity metrics detect DC offset crest factor and missing channel',()=>{
  const l=sine(1000,.25,.5);for(let i=0;i<l.length;i++)l[i]+=.1;const r=new Float32Array(l.length);
  const m=signalSanityMetrics(l,r,sr);assert.ok(Math.abs(m.leftDcOffset-.1)<.01);assert.ok(m.leftCrestFactor>1.2);assert.equal(m.rightPresent,false);assert.equal(m.stereoPresent,false);
});
test('signal sanity flags highly correlated dual mono',()=>{
  const l=sine(440,.25,.5);const m=signalSanityMetrics(l,new Float32Array(l),sr);assert.equal(m.dualMonoSuspected,true);assert.ok(m.spectralCentroidHz>300&&m.spectralCentroidHz<700);
});


test('quick diagnostic blocks healthy interpretation when a stereo channel is missing',()=>{
  const q=quickDiagnostic({left:sine(1000,.25,.5),right:new Float32Array(Math.floor(sr*.25)),sampleRate:sr});
  assert.ok(q.findings.some(f=>f.code==='MISSING_CHANNEL'));assert.equal(q.summary.stereoPresent,false);
});


test('repeatability metrics calculate mean spread and sample count',()=>{
  const m=repeatabilityMetrics([.1,-.1,.05,-.05]);assert.equal(m.count,4);assert.ok(Math.abs(m.mean)<1e-9);assert.ok(m.stdDev>0);assert.equal(m.range,.2);
});
test('trend metrics calculate linear drift per minute',()=>{
  const m=trendMetrics([{timeMin:0,value:0},{timeMin:5,value:.1},{timeMin:10,value:.2}]);assert.ok(Math.abs(m.slopePerMin-.02)<1e-9);assert.ok(m.rSquared>.999);
});


test('tone amplitude isolates requested frequency',()=>{
  const x=sine(1000,.5,.5);assert.ok(toneAmplitude(x,sr,1000)>.45);assert.ok(toneAmplitude(x,sr,2000)<.01);
});
test('expanded pitch map metrics report mapping error and monotonicity',()=>{
  const m=pitchMapMetrics([{position:-8,measuredPercent:-7.5},{position:-4,measuredPercent:-4},{position:0,measuredPercent:.2},{position:4,measuredPercent:3.8},{position:8,measuredPercent:8.2}]);
  assert.ok(m.maxMappingErrorPercent>=.49);assert.ok(m.rmsMappingErrorPercent>0);assert.equal(m.monotonicityFailures,0);assert.ok(Math.abs(m.zeroOffsetPercent-.2)<1e-9);
});
test('trace modulation finds known revolution synchronous component',()=>{
  const trace=Array.from({length:100},(_,i)=>({timeSec:i*.1,frequencyHz:1000*(1+.001*Math.sin(2*Math.PI*.5*i*.1))}));
  const m=traceModulationPercent(trace,{referenceHz:1000,frequencyHz:.5});assert.ok(m>.08&&m<.12);
});
test('ellipse metrics recover axis imbalance for quadrature signal',()=>{
  const l=sine(1000,.25,.8,0),r=sine(1000,.25,.4,Math.PI/2);const e=ellipseMetrics(l,r);assert.ok(e.axisRatio>.45&&e.axisRatio<.55);assert.ok(e.eccentricity>.8&&e.eccentricity<.9);
});
test('DVS integrity score penalizes missing windows and clipping',()=>{
  const good=dvsIntegrityScore({leftPresent:true,rightPresent:true,balanceDb:0,circularity:.95,clippedSamples:0,missingWindowRatio:0,humDb:-70});
  const bad=dvsIntegrityScore({leftPresent:true,rightPresent:false,balanceDb:10,circularity:.05,clippedSamples:100,missingWindowRatio:.5,humDb:-25});assert.ok(good.score>90);assert.ok(bad.score<50);assert.ok(Object.keys(good.components).length>=5);
});
test('subsonic peak locates a warp-rate sine',()=>{
  const sampleRate=1000,n=sampleRate*10,x=new Float32Array(n);for(let i=0;i<n;i++)x[i]=.5*Math.sin(2*Math.PI*.6*i/sampleRate);const p=subsonicPeak(x,sampleRate,{minHz:.2,maxHz:2,stepHz:.1});assert.ok(Math.abs(p.frequencyHz-.6)<.11);
});
test('event map comparison separates persistent and new candidates',()=>{
  const c=compareEventMaps([{normalizedPosition:.1},{normalizedPosition:.5}],[{normalizedPosition:.105},{normalizedPosition:.8}],{tolerance:.02});assert.equal(c.persistent.length,1);assert.equal(c.resolved.length,1);assert.equal(c.newEvents.length,1);
});
