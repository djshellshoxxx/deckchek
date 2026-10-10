import test from 'node:test';
import assert from 'node:assert/strict';
import {rng,gaussian,whiteNoise,addNoise,quadratureTimecode,humMix,chirpLoop,howlGrowth} from './fixtures/signals.mjs';
import {analyzeTimecode} from '../app/timecode.js';
import {fitTone,detectMarkerLag} from '../app/calibration.js';
import {rms,dbfs} from '../app/core.js';

const near=(a,b,tol,msg='')=>assert.ok(Math.abs(a-b)<=tol,`${msg} ${a} vs ${b} (tol ${tol})`);
const get=(res,id)=>res.measurements.find(m=>m.metricId===id).value;

test('signals: PRNG and noise are deterministic and seed-dependent',()=>{
  const a=rng(42),b=rng(42),c=rng(43);const xa=[a(),a(),a()],xb=[b(),b(),b()];
  assert.deepEqual(xa,xb);assert.notDeepEqual(xa,[c(),c(),c()]);
  for(const v of xa)assert.ok(v>=0&&v<1);
  assert.deepEqual(whiteNoise(100,1,5),whiteNoise(100,1,5));
  const g=gaussian(9);let s=0,s2=0;const N=50000;for(let i=0;i<N;i++){const v=g();s+=v;s2+=v*v;}
  near(s/N,0,.02,'mean');near(Math.sqrt(s2/N),1,.02,'std');
  near(rms(whiteNoise(48000,.01,3)),.01,.0003,'white rms');
});

test('signals: addNoise hits the requested SNR',()=>{
  const n=48000,buf=new Float32Array(n);for(let i=0;i<n;i++)buf[i]=.5*Math.sin(2*Math.PI*1000*i/n);
  const clean=Float32Array.from(buf),nr=addNoise(buf,{snrDb:30,seed:2});
  const noise=buf.map((v,i)=>v-clean[i]);near(dbfs(rms(clean))-dbfs(rms(noise)),30,.1);
  near(nr,rms(noise),nr*.02);
  assert.equal(addNoise(buf,{snrDb:Infinity}),0);
});

test('signals: quadratureTimecode matches analyzeTimecode for each carrier and phaseSign',()=>{
  const cases=[['Serato CV02.5',1000,1],['Traktor Scratch MK1',2000,-1],['Traktor Scratch MK2',2500,1],['MixVibes DVS V2',1300,-1],['Traktor Scratch MK2 CD',3000,1]];
  for(const [format,carrierHz,phaseSign] of cases){
    const s=quadratureTimecode({carrierHz,phaseSign,seconds:1,snrDb:40,seed:carrierHz});
    const r=analyzeTimecode(s,{format});
    near(get(r,'tc_carrier_hz'),carrierHz,.3,format);
    near(Math.abs(get(r,'tc_phase_deg')),90,1.5,format);
    assert.equal(Math.sign(get(r,'tc_phase_deg')),phaseSign,format);
    assert.equal(r.direction,'forward',format);
    near(get(r,'tc_snr_db'),40,3,format);
    const rev=analyzeTimecode(quadratureTimecode({carrierHz,phaseSign,seconds:1,velocityProfile:-1}),{format});
    assert.equal(rev.direction,'reverse',format);
  }
});

test('signals: velocity profile, imbalance, dropouts and truth positions',()=>{
  const s=quadratureTimecode({carrierHz:1000,seconds:2,velocityProfile:1.02,imbalanceDb:3,snrDb:50,dropouts:[[.5,.56],[1.2,1.26]]});
  const r=analyzeTimecode(s,{format:'Serato CV02.5'});
  near(get(r,'tc_speed_error_percent'),2,.05);near(get(r,'tc_balance_db'),3,.2);assert.equal(get(r,'tc_dropouts'),2);
  assert.ok(s.left.subarray(Math.round(.5*48000),Math.round(.56*48000)).every(v=>v===0));
  // position truth: 1.02 * 1000 cycles per second
  near(s.truth.positionCycles[100],1020,1e-6,'1 s');
  const baby=quadratureTimecode({carrierHz:1000,seconds:1,velocityProfile:t=>2*Math.sin(2*Math.PI*2*t)});
  // integral of 2 sin(4 pi t) over a full period is 0
  near(baby.truth.positionCycles[50],0,1e-6,'baby scratch returns');
  near(Math.max(...baby.truth.positionCycles),2*1000/(2*Math.PI*2)*2,.5,'peak excursion');
});

test('signals: phase jump shows as a phase step without moving truth position',()=>{
  const sr=48000,s=quadratureTimecode({carrierHz:1000,seconds:.4,phaseJumps:[{atSec:.2,deg:90}]});
  const a=fitTone(s.left.subarray(0,4800),sr,1000),b=fitTone(s.left.subarray(9600+4800,9600+9600),sr,1000);
  // 0.2 s = 200 full cycles, so the only phase change is the jump (the second slice starts 0.1 s later = 100 cycles)
  let d=(b.phase-a.phase)*180/Math.PI;while(d>180)d-=360;while(d<=-180)d+=360;near(d,90,.5);
  near(s.truth.positionCycles[30],300,1e-6);
});

test('signals: humMix levels round-trip through fitTone and noise level is right',()=>{
  const sr=48000,m=humMix({mainsHz:50,harmonics:[{n:1,dbfs:-50},{n:2,dbfs:-62},{n:3,dbfs:-58}],seconds:1,noiseDbfs:-100,seed:4});
  for(const h of m.truth.harmonics)near(dbfs(fitTone(m.samples,sr,h.hz).amplitude),h.dbfs,.05,`n=${h.n}`);
  near(m.truth.totalDbfs,10*Math.log10(10**-5+10**-6.2+10**-5.8),1e-9);
  near(m.truth.noiseRms,1e-5,1e-12);
  assert.deepEqual(humMix({seed:8}).samples,humMix({seed:8}).samples);
  const t=humMix({harmonics:[],tone:{hz:1000,dbfs:-10},seconds:.5});near(dbfs(fitTone(t.samples,sr,1000).amplitude),-10,.05);
});

test('signals: chirpLoop fractional delay is recovered by detectMarkerLag within 1 sample',()=>{
  for(const delayMs of [.5,3.17,12.4]){
    const c=chirpLoop({delayMs,snrDb:30,seed:11});
    const {lag,strength}=detectMarkerLag(c.captured,c.chirp,c.sampleRate,{maxLagSec:.05,startSample:c.truth.chirpStart});
    assert.ok(strength>.9,String(strength));near(lag,c.truth.delaySamples,1,`delay ${delayMs} ms`);
    near(lag,c.truth.delaySamples,.25,`sub-sample ${delayMs} ms`);
  }
  const z=chirpLoop({delayMs:0});assert.deepEqual(Array.from(z.captured),Array.from(z.played));
});

test('signals: howlGrowth grows at the stated rate and caps',()=>{
  const sr=48000,h=howlGrowth({hz:2000,startDbfs:-60,growthDbPerSec:30,capDbfs:-6,seconds:2.5});
  const lvl=t=>dbfs(fitTone(h.samples.subarray(Math.round(t*sr),Math.round(t*sr)+480),sr,2000).amplitude);
  near(lvl(1)-lvl(.5),15,.3);near(h.truth.capSec,1.8,1e-9);near(lvl(2.2),-6,.05);
});
