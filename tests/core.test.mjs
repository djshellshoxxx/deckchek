import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rms, dbfs, peak, clippingCount, correlation, channelBalanceDb,
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
