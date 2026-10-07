import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loopbackStimulus, analyzeLoopback, serializeProfile, deserializeProfile, validateProfile, isProfileApplicable,
  combineStandardUncertainties, expandedUncertainty, speedPitchUncertainty, rpmUncertainty, levelUncertaintyDb,
  channelBalanceUncertaintyDb, thdUncertaintyPercent, separationUncertaintyDb, applyCalibration, frequencyEstimatorStdHz
} from '../app/calibration.js';

const SR=48000;
function rng(seed=1){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function gauss(r){return Math.sqrt(-2*Math.log(Math.max(r(),1e-12)))*Math.cos(2*Math.PI*r());}
/** Simulate capture: gain, integer delay, noise, optional clipping and clock scale (cubic interpolation). */
function simulate(stim,{gainL=0,gainR=0,delay=0,noise=0,scale=1,clip=false,seed=3}={}){
  const r=rng(seed),n=stim.left.length+delay+4000;
  const chan=(src,g)=>{const out=new Float32Array(n),k=Math.pow(10,g/20);
    for(let i=0;i<n;i++){const t=(i-delay)*scale,i1=Math.floor(t),f=t-i1;let v=0;
      if(i1>=1&&i1<src.length-2){const a=src[i1-1],b=src[i1],c=src[i1+1],d=src[i1+2];v=b+.5*f*(c-a+f*(2*a-5*b+4*c-d+f*(3*(b-c)+d-a)));}
      v=v*k+(noise?noise*gauss(r):0);out[i]=clip?Math.max(-1,Math.min(1,v)):v;}return out;};
  return {left:chan(stim.left,gainL),right:chan(stim.right,gainR),sampleRate:SR};
}
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,`${msg||''} ${a} vs ${b} (tol ${tol})`);

test('stimulus layout has silent lead, marker and tone', ()=>{
  const s=loopbackStimulus({sampleRate:SR,durationSec:1});
  assert.equal(s.left.length,s.right.length);
  assert.ok(s.left.subarray(0,s.meta.markerStart).every(v=>v===0));
  assert.ok(Math.max(...s.left.subarray(s.meta.markerStart,s.meta.markerEnd).map(Math.abs))>.01);
  assert.equal(s.meta.steps.length,2);
  assert.deepEqual(loopbackStimulus({sampleRate:SR,durationSec:1}).left,s.left);
});

test('recovers gain offsets, mismatch, latency and noise floor', ()=>{
  const s=loopbackStimulus({sampleRate:SR,durationSec:1.5});
  const cap=simulate(s,{gainL:-3.25,gainR:-3.9,delay:1800,noise:3e-4});
  const p=analyzeLoopback(cap,s.meta,{deviceName:'Test IF',createdAt:'2026-01-01T00:00:00Z'});
  assert.equal(p.valid,true,JSON.stringify(p.issues));
  near(p.gainDb.left,-3.25,.05);near(p.gainDb.right,-3.9,.05);near(p.mismatchDb,.65,.05);
  near(p.latencyMs,37.5,1);
  near(p.noiseFloorDbfs,20*Math.log10(3e-4),1.5);
  assert.ok(p.thdnPercent<2,String(p.thdnPercent));
  assert.ok(p.uncertainty.gainDb>0&&p.uncertainty.gainDb<.1);
  assert.ok(p.uncertainty.clockPpm>0);
  assert.equal(p.version,1);
});

test('recovers +200 ppm clock error', ()=>{
  const s=loopbackStimulus({sampleRate:SR,durationSec:2,steps:[]});
  const cap=simulate(s,{delay:960,noise:1e-4,scale:1+200e-6});
  const p=analyzeLoopback(cap,s.meta);
  assert.equal(p.valid,true,JSON.stringify(p.issues));
  near(p.clockPpm,200,20);
});

test('coarse frequency response is flat for a flat chain', ()=>{
  const s=loopbackStimulus({sampleRate:SR,durationSec:1});
  const p=analyzeLoopback(simulate(s,{gainL:-1,gainR:-1,delay:480,noise:1e-4}),s.meta);
  const hzs=p.response.map(r=>r.hz);assert.deepEqual(hzs,[100,1000,10000]);
  for(const r of p.response)assert.ok(Math.abs(r.deltaDb)<.6,JSON.stringify(p.response));
});

test('clipping and no-signal produce invalid profiles with reasons', ()=>{
  const s=loopbackStimulus({sampleRate:SR,durationSec:1});
  const clipped=analyzeLoopback(simulate(s,{gainL:25,gainR:25,delay:480,clip:true}),s.meta);
  assert.equal(clipped.valid,false);assert.ok(clipped.issues.some(i=>i.code==='CLIPPING'));
  const none=analyzeLoopback(simulate(s,{gainL:-200,gainR:-200,delay:480,noise:1e-6}),s.meta);
  assert.equal(none.valid,false);assert.ok(none.issues.some(i=>i.code==='NO_SIGNAL'));
});

test('noisy chain and large mismatch are flagged', ()=>{
  const s=loopbackStimulus({sampleRate:SR,durationSec:1});
  const noisy=analyzeLoopback(simulate(s,{delay:480,noise:.05}),s.meta);
  assert.ok(noisy.issues.some(i=>i.code==='TOO_NOISY'));assert.equal(noisy.valid,false);
  const mm=analyzeLoopback(simulate(s,{gainL:0,gainR:-2,delay:480,noise:1e-4}),s.meta);
  assert.ok(mm.issues.some(i=>i.code==='CHANNEL_MISMATCH'));assert.equal(mm.valid,false);
});

test('profile serialization, validation and applicability', ()=>{
  const s=loopbackStimulus({sampleRate:SR,durationSec:1});
  const p=analyzeLoopback(simulate(s,{delay:480,noise:1e-4}),s.meta,{deviceName:'Scarlett 2i2',createdAt:'2026-01-01T00:00:00Z'});
  const back=deserializeProfile(serializeProfile(p));
  assert.deepEqual(back,JSON.parse(JSON.stringify(p)));
  assert.equal(validateProfile(back).ok,true);
  assert.equal(isProfileApplicable(p,{deviceName:' scarlett 2i2',sampleRate:SR}),true);
  assert.equal(isProfileApplicable(p,{deviceName:'Other',sampleRate:SR}),false);
  assert.equal(isProfileApplicable(p,{deviceName:'Scarlett 2i2',sampleRate:44100}),false);
  assert.equal(isProfileApplicable({...p,valid:false},{sampleRate:SR}),false);
  assert.throws(()=>deserializeProfile('{"version":2}'));
});

test('RSS and expanded uncertainty math', ()=>{
  assert.equal(combineStandardUncertainties([3,4]),5);
  assert.equal(combineStandardUncertainties([{u:2,c:3},8]),10);
  assert.ok(Number.isNaN(combineStandardUncertainties([1,NaN])));
  assert.equal(combineStandardUncertainties([]),0);
  assert.equal(expandedUncertainty(.5),1);assert.equal(expandedUncertainty(.5,3),1.5);
  const a=frequencyEstimatorStdHz({sampleRate:SR,windowSec:1,snrDb:40}),b=frequencyEstimatorStdHz({sampleRate:SR,windowSec:2,snrDb:40});
  assert.ok(b<a/2);
  const hi=speedPitchUncertainty({snrDb:20,windowSec:.2}),lo=speedPitchUncertainty({snrDb:60,windowSec:2});assert.ok(hi.standard>lo.standard);
  near(speedPitchUncertainty({clockPpmU:100,snrDb:120,windowSec:10,gridHz:0}).standard,.01,.0005);
  const rpm=rpmUncertainty({pitchPercent:0});near(rpm.standard,speedPitchUncertainty({}).standard*33.333333/100,1e-9);
  assert.ok(levelUncertaintyDb({snrDb:20}).standard>levelUncertaintyDb({snrDb:60}).standard);
  assert.ok(channelBalanceUncertaintyDb({}).standard>=.3);
  assert.ok(thdUncertaintyPercent({snrDb:30}).standard>thdUncertaintyPercent({snrDb:80}).standard);
  assert.ok(separationUncertaintyDb({leakSnrDb:6}).standard>separationUncertaintyDb({leakSnrDb:40}).standard);
  const u=levelUncertaintyDb({});near(u.expanded,2*u.standard,1e-12);assert.equal(u.k,2);assert.equal(u.unit,'dB');
});

function goodProfile(over={}){
  return {version:1,deviceName:'IF',sampleRate:SR,createdAt:'2026-01-01T00:00:00Z',gainDb:{left:-1,right:-1.5},mismatchDb:.5,noiseFloorDbfs:-90,thdnPercent:.05,latencyMs:10,clockPpm:200,response:[],uncertainty:{gainDb:.02,mismatchDb:.03,clockPpm:5,k:2},valid:true,issues:[],...over};
}
test('applyCalibration corrects levels, balance and clock-affected metrics', ()=>{
  const p=goodProfile(),ctx={deviceName:'IF',sampleRate:SR,snrDb:60};
  const l=applyCalibration({metricId:'left_level_dbfs',label:'L',value:-20,unit:'dBFS',qualityFlags:[]},p,ctx);
  assert.equal(l.calibrated,true);near(l.value,-19,1e-9);assert.equal(l.rawValue,-20);assert.ok(l.qualityFlags.includes('calibrated'));
  near(applyCalibration({metricId:'right_level_dbfs',value:-20,unit:'dBFS'},p,ctx).value,-18.5,1e-9);
  near(applyCalibration({metricId:'channel_balance_db',value:.5,unit:'dB'},p,ctx).value,0,1e-9);
  near(applyCalibration({metricId:'measured_frequency_hz',value:1000.2,unit:'Hz'},p,ctx).value,1000.2/(1+200e-6),1e-9);
  near(applyCalibration({metricId:'rpm',value:33.34,unit:'RPM'},p,ctx).value,33.34/(1+200e-6),1e-9);
  const pitch=applyCalibration({metricId:'pitch_percent',value:.02,unit:'%'},p,ctx);near(pitch.value,0,1e-4);
  assert.equal(pitch.uncertainty.unit,'%');near(pitch.uncertainty.expanded,2*pitch.uncertainty.standard,1e-12);assert.equal(pitch.uncertainty.k,2);
  assert.ok('clock' in pitch.uncertainty.components);
  assert.equal(applyCalibration({metricId:'wow_flutter_rms_percent',value:.1,unit:'%'},p,ctx).value,.1);
});

test('uncalibrated measurements get larger default uncertainty and flags', ()=>{
  const m={metricId:'left_level_dbfs',value:-20,unit:'dBFS',qualityFlags:['x']};
  const ctx={deviceName:'IF',sampleRate:SR,snrDb:60};
  const cal=applyCalibration(m,goodProfile(),ctx),unc=applyCalibration(m,null,ctx);
  assert.equal(unc.calibrated,false);assert.equal(unc.value,-20);assert.ok(unc.qualityFlags.includes('uncalibrated')&&unc.qualityFlags.includes('x'));
  assert.ok(unc.uncertainty.standard>cal.uncertainty.standard*5);
  const wrong=applyCalibration(m,goodProfile(),{...ctx,sampleRate:44100});
  assert.equal(wrong.calibrated,false);assert.ok(wrong.qualityFlags.includes('calibration_not_applied'));
  const invalid=applyCalibration(m,goodProfile({valid:false}),ctx);assert.equal(invalid.calibrated,false);
  assert.equal(m.value,-20);assert.deepEqual(m.qualityFlags,['x']);
});

test('unknown metrics keep null uncertainty, thd and separation get estimates', ()=>{
  const p=goodProfile(),ctx={deviceName:'IF',sampleRate:SR};
  const u=applyCalibration({metricId:'dropout_count',value:3,unit:'count'},p,ctx);
  assert.equal(u.uncertainty,null);assert.equal(u.calibrated,false);assert.ok(u.qualityFlags.includes('uncertainty_unknown'));
  const thd=applyCalibration({metricId:'left_thd_percent',value:.3,unit:'%'},p,ctx);assert.ok(thd.uncertainty.standard>0);assert.equal(thd.value,.3);
  const sep=applyCalibration({metricId:'channel_separation_db',value:35,unit:'dB'},p,ctx);assert.ok(sep.uncertainty.standard>0);assert.equal(sep.uncertainty.unit,'dB');
});
