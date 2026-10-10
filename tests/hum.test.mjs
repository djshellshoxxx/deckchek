import test from 'node:test';
import assert from 'node:assert/strict';
import {humMeasure,detectMains,removeTone,fitToneFast} from '../app/hum.js';
import {fitTone} from '../app/calibration.js';
import {humMetrics} from '../app/core.js';
import {humMix,rng} from './fixtures/signals.mjs';

const near=(a,b,tol,msg='')=>assert.ok(Math.abs(a-b)<=tol,`${msg} ${a} vs ${b} (tol ${tol})`);
const SR=48000;
const harm=(r,n)=>r.harmonics.find(h=>h.n===n);

test('hum: 50 Hz + 3 harmonics at known levels within 0.3 dB',()=>{
  const m=humMix({mainsHz:50,harmonics:[{n:1,dbfs:-50},{n:2,dbfs:-66},{n:3,dbfs:-58},{n:4,dbfs:-72}],seconds:2,noiseDbfs:-100,seed:1});
  const r=humMeasure(m.samples,SR);
  assert.equal(r.mainsHz,50);
  near(r.fundamentalDbfs,-50,.3,'fundamental');
  for(const h of m.truth.harmonics){near(harm(r,h.n).dbfs,h.dbfs,.3,`n=${h.n}`);near(harm(r,h.n).hz,h.hz,.05);}
  near(r.totalDbfs,m.truth.totalDbfs,.3,'total');
  assert.equal(r.harmonics.length,8);
  assert.deepEqual(r.harmonics.map(h=>h.n),[1,2,3,4,5,6,7,8]);
  assert.ok(harm(r,6).dbfs<-110,'absent harmonic reads at the floor');
  near(r.humToFloorDb,r.totalDbfs-r.floorDbfs,1e-9);
  assert.ok(r.humToFloorDb>40);
  assert.ok(r.uncertaintyDb>0&&r.uncertaintyDb<.3,String(r.uncertaintyDb));
});

test('hum: 60 Hz auto-detect; forced mains is respected',()=>{
  const m=humMix({mainsHz:60,harmonics:[{n:1,dbfs:-55},{n:2,dbfs:-60}],seconds:1,noiseDbfs:-95,seed:2});
  const d=detectMains(m.samples,SR);assert.equal(d.mainsHz,60);assert.ok(d.confidence>.9,String(d.confidence));
  const r=humMeasure(m.samples,SR,{mains:'auto'});assert.equal(r.mainsHz,60);near(r.fundamentalDbfs,-55,.3);near(harm(r,2).dbfs,-60,.3);
  const f=humMeasure(m.samples,SR,{mains:50});assert.equal(f.mainsHz,50);assert.ok(f.fundamentalDbfs<r.fundamentalDbfs-25,String(f.fundamentalDbfs));
  // 100 Hz alone (full-wave rectified buzz) still says 50 Hz
  const b=humMix({mainsHz:50,harmonics:[{n:2,dbfs:-50}],seconds:1,noiseDbfs:-95,seed:3});
  assert.equal(detectMains(b.samples,SR).mainsHz,50);
  // noise only: low confidence
  const z=humMix({harmonics:[],seconds:1,noiseDbfs:-60,seed:4});
  assert.ok(detectMains(z.samples,SR).confidence<.5);
  assert.ok([50,60].includes(detectMains(z.samples,SR).mainsHz));
});

test('hum: leakage immunity with non-integer windows and other sample rates',()=>{
  for(const [sr,sec,hz] of [[48000,1.0137,50],[44100,.8173,60],[22050,2.31,60],[96000,.5555,50]]){
    const m=humMix({mainsHz:hz,harmonics:[{n:1,dbfs:-40},{n:3,dbfs:-70},{n:5,dbfs:-75}],seconds:sec,sampleRate:sr,noiseDbfs:-110,seed:sr});
    const r=humMeasure(m.samples,sr);assert.equal(r.mainsHz,hz,`${sr}`);
    for(const h of m.truth.harmonics)near(harm(r,h.n).dbfs,h.dbfs,.3,`${sr}/${sec} n=${h.n}`);
    assert.ok(harm(r,2).dbfs<-95,`${sr} leakage into n=2: ${harm(r,2).dbfs}`);
  }
  // windowSec selects the trailing window and is still exact
  const m=humMix({mainsHz:50,harmonics:[{n:1,dbfs:-45}],seconds:3,noiseDbfs:-100,seed:7});
  const r=humMeasure(m.samples,SR,{windowSec:1.37});near(r.fundamentalDbfs,-45,.3);near(r.windowSec,1.37,.02);assert.ok(r.windowSec<=1.37);
});

test('hum: off-nominal mains frequency is tracked over a 5 s window',()=>{
  for(const hz of [49.85,50.12,59.8,60.2]){
    const m=humMix({mainsHz:hz,harmonics:[{n:1,dbfs:-50},{n:2,dbfs:-60},{n:5,dbfs:-62},{n:8,dbfs:-70}],seconds:5,noiseDbfs:-100,seed:Math.round(hz*100)});
    const r=humMeasure(m.samples,SR);assert.equal(r.mainsHz,Math.round(hz/10)*10>55?60:50);near(r.fundamentalHz,hz,.005,`f0 ${hz}`);
    for(const h of m.truth.harmonics)near(harm(r,h.n).dbfs,h.dbfs,.3,`${hz} n=${h.n}`);
  }
  // tracking off: nominal frequency is used
  const m=humMix({mainsHz:50,harmonics:[{n:1,dbfs:-50}],seconds:1,seed:1});
  assert.equal(humMeasure(m.samples,SR,{trackMains:false}).fundamentalHz,50);
});

test('hum: floor follows the noise level; DC is ignored',()=>{
  const a=humMeasure(humMix({harmonics:[{n:1,dbfs:-50}],seconds:2,noiseDbfs:-100,seed:5}).samples,SR);
  const b=humMeasure(humMix({harmonics:[{n:1,dbfs:-50}],seconds:2,noiseDbfs:-80,seed:5}).samples,SR);
  near(b.floorDbfs-a.floorDbfs,20,1.5,'floor tracks noise');near(a.humToFloorDb-b.humToFloorDb,20,1.5);
  assert.ok(b.uncertaintyDb>a.uncertaintyDb);
  const c=humMeasure(humMix({harmonics:[{n:1,dbfs:-50}],seconds:2,noiseDbfs:-100,dc:.2,seed:5}).samples,SR);
  near(c.fundamentalDbfs,a.fundamentalDbfs,.01);near(c.floorDbfs,a.floorDbfs,.5);
  // floor ignores the hum itself (probes sit between harmonics)
  const d=humMeasure(humMix({harmonics:[1,2,3,4,5,6,7,8].map(n=>({n,dbfs:-40})),seconds:2,noiseDbfs:-100,seed:5}).samples,SR);
  near(d.floorDbfs,a.floorDbfs,2);
});

test('hum: oddEvenRatio separates odd-rich buzz from even-rich hum',()=>{
  const odd=humMeasure(humMix({harmonics:[{n:1,dbfs:-50},{n:3,dbfs:-55},{n:5,dbfs:-58},{n:4,dbfs:-75}],seconds:1,noiseDbfs:-110}).samples,SR);
  const even=humMeasure(humMix({harmonics:[{n:1,dbfs:-50},{n:2,dbfs:-52},{n:4,dbfs:-60},{n:3,dbfs:-75}],seconds:1,noiseDbfs:-110}).samples,SR);
  // odd: sqrt(10^-5.5 + 10^-5.8) / 10^-3.75
  near(odd.oddEvenRatio,Math.sqrt(10**-5.5+10**-5.8)/10**-3.75,odd.oddEvenRatio*.05);
  assert.ok(odd.oddEvenRatio>10&&even.oddEvenRatio<.1,`${odd.oddEvenRatio} ${even.oddEvenRatio}`);
  assert.ok(Number.isFinite(humMeasure(humMix({harmonics:[{n:1,dbfs:-50}],seconds:1}).samples,SR).oddEvenRatio));
});

test('hum: removeTone exposes hum under a strong timecode carrier',()=>{
  const truth=[{n:1,dbfs:-70},{n:2,dbfs:-80},{n:3,dbfs:-76}];
  const steady=humMix({mainsHz:50,harmonics:truth,seconds:4,noiseDbfs:-105,tone:{hz:1000,dbfs:-8},seed:9});
  const res=removeTone(steady.samples,SR,1000);assert.ok(res instanceof Float32Array);assert.equal(res.length,steady.samples.length);
  const r=humMeasure(res,SR);assert.equal(r.mainsHz,50);for(const h of truth)near(harm(r,h.n).dbfs,h.dbfs,.3,`steady n=${h.n}`);
  // turntable speed wobble +/-0.2 % at 0.55 Hz, carrier off nominal by 0.5 %: tracked per block
  const wob=humMix({mainsHz:60,harmonics:truth,seconds:4,noiseDbfs:-105,tone:{hz:2512.5,dbfs:-8,wobblePercent:.2},seed:10});
  const rw=humMeasure(removeTone(wob.samples,SR,2500),SR);assert.equal(rw.mainsHz,60);
  for(const h of truth)near(harm(rw,h.n).dbfs,h.dbfs,.5,`wobble n=${h.n}`);
  assert.ok(rw.floorDbfs<-115,`residual floor ${rw.floorDbfs}`);
  // whole-buffer mode (blockSec 0) is the plain fitTone residual
  const plain=removeTone(steady.samples,SR,1000,{blockSec:0,track:false});near(humMeasure(plain,SR).fundamentalDbfs,-70,.3);
});

test('hum: property — 200 seeded random harmonic mixes within 0.3 dB',()=>{
  const r=rng(20261010);let worst=0;
  for(let c=0;c<200;c++){
    const mainsHz=r()<.5?50:60,sr=[44100,48000,96000][Math.floor(r()*3)],noiseDbfs=-110+20*r();
    const fund=-35-40*r(),hs=[{n:1,dbfs:fund}];
    // harmonics between fund - 3 dB and 6 dB above the broadband noise RMS (>= ~45 dB estimator SNR at >= 0.6 s)
    for(let n=2;n<=8;n++)if(r()<.6){const lo=noiseDbfs+6,hi=fund-3;hs.push({n,dbfs:lo+(hi-lo)*r()});}
    const m=humMix({mainsHz:mainsHz+(r()-.5)*.2,harmonics:hs,seconds:.6+.6*r(),sampleRate:sr,noiseDbfs,seed:1000+c});
    const out=humMeasure(m.samples,sr);
    assert.equal(out.mainsHz,mainsHz,`case ${c}`);
    for(const h of hs){const e=Math.abs(harm(out,h.n).dbfs-h.dbfs);worst=Math.max(worst,e);assert.ok(e<=.3,`case ${c} n=${h.n}: ${harm(out,h.n).dbfs} vs ${h.dbfs}`);}
    assert.ok(Math.abs(out.totalDbfs-m.truth.totalDbfs)<=.3,`case ${c} total`);
  }
  assert.ok(worst<.3);if(process.env.HUM_DEBUG)console.log('worst error dB',worst);
});

test('hum: consistent with core.js humMetrics, whose output is unchanged',()=>{
  // fixed signal built inline (independent of the fixtures module)
  const n=48000,x=new Float32Array(n);let s=12345;const u=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296-.5;};
  for(let i=0;i<n;i++)x[i]=.01*Math.sin(2*Math.PI*50*i/SR)+.002*Math.sin(2*Math.PI*150*i/SR+.5)+1e-4*u();
  const g=humMetrics(x,SR);
  assert.deepEqual(Object.keys(g),Object.keys(GOLDEN_HUM_METRICS));assert.equal(g.mainsHz,GOLDEN_HUM_METRICS.mainsHz);
  for(const k of ['mainsDb','alternateDb','harmonicFamilyDb'])near(g[k],GOLDEN_HUM_METRICS[k],1e-6,k);
  const r=humMeasure(x,SR);assert.equal(r.mainsHz,g.mainsHz);near(r.fundamentalDbfs,g.mainsDb,.3);near(r.fundamentalDbfs,-40,.05);near(harm(r,3).dbfs,20*Math.log10(.002),.05);
});

test('hum: fitToneFast matches calibration.js fitTone',()=>{
  const m=humMix({mainsHz:50.3,harmonics:[{n:1,dbfs:-20},{n:7,dbfs:-30}],seconds:6,noiseDbfs:-60,dc:.01,seed:12});
  for(const hz of [50.3,352.1,1000,17.7]){const a=fitTone(m.samples,SR,hz),b=fitToneFast(m.samples,SR,hz);
    near(b.amplitude,a.amplitude,1e-9+a.amplitude*1e-8,`amp ${hz}`);near(b.dc,a.dc,1e-9,`dc ${hz}`);near(b.residualRms,a.residualRms,1e-9,`res ${hz}`);
    if(a.amplitude>1e-3)near(b.phase,a.phase,1e-7,`phase ${hz}`);}
});

test('hum: input validation and short or band-limited inputs',()=>{
  assert.throws(()=>humMeasure(new Float32Array(0),SR),RangeError);
  assert.throws(()=>humMeasure(new Float32Array(1000),0),RangeError);
  assert.throws(()=>humMeasure(new Float32Array(100),SR),RangeError,'shorter than two mains cycles');
  assert.throws(()=>humMeasure(new Float32Array(48000),SR,{mains:55}),RangeError);
  assert.throws(()=>removeTone(new Float32Array(10),SR,-5),RangeError);
  // low sample rate: harmonics at or above 0.45 * fs (360 Hz here) are omitted, never aliased
  const m=humMix({mainsHz:60,harmonics:[{n:1,dbfs:-40}],seconds:2,sampleRate:800,seed:3});
  const r=humMeasure(m.samples,800,{mains:60});assert.deepEqual(r.harmonics.map(h=>h.n),[1,2,3,4,5]);near(r.fundamentalDbfs,-40,.3);
  const z=humMeasure(new Float32Array(48000),SR,{mains:50});assert.ok(Number.isFinite(z.fundamentalDbfs)&&z.fundamentalDbfs<-200);
  assert.ok(Number.isFinite(z.humToFloorDb)&&Number.isFinite(z.oddEvenRatio)&&Number.isFinite(z.uncertaintyDb));
  // plain arrays are accepted
  near(humMeasure(Array.from(m.samples),800,{mains:60}).fundamentalDbfs,-40,.3);
});

// Recorded from app/core.js at v0.0.5 (before app/hum.js existed); a change here means humMetrics changed.
const GOLDEN_HUM_METRICS={mainsHz:50,mainsDb:-40.000206802459786,alternateDb:-127.0020229582102,harmonicFamilyDb:-66.01988311990559};
