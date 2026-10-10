import test from 'node:test';
import assert from 'node:assert/strict';
import {TIMECODE_FORMATS,mergeFormats,analyzeTimecode} from '../app/timecode.js';

const sr=48000;
function synth({hz=1000,sec=2,phaseDeg=90,imbalanceDb=0,noise=0,dropouts=[],reverse=false,amp=.5}={}){
  const n=sr*sec,l=new Float32Array(n),r=new Float32Array(n);let seed=7;
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296-.5;};
  const ph=(reverse?-1:1)*phaseDeg*Math.PI/180,gR=Math.pow(10,-imbalanceDb/20);
  for(let i=0;i<n;i++){const w=2*Math.PI*hz*i/sr;l[i]=amp*Math.sin(w)+noise*rnd()*2;r[i]=amp*gR*Math.sin(w+ph)+noise*rnd()*2;}
  for(const [a,b] of dropouts)for(let i=Math.floor(a*sr);i<Math.floor(b*sr);i++){l[i]=0;r[i]=0;}
  return {left:l,right:r,sampleRate:sr};
}
const get=(res,id)=>res.measurements.find(m=>m.metricId===id).value;

test('format table has confirmed carriers and merge works',()=>{
  const by=n=>TIMECODE_FORMATS.find(f=>f.name===n);
  assert.equal(by('Serato CV02.5').carrierHz,1000);
  assert.equal(by('Traktor Scratch MK1').carrierHz,2000);
  assert.equal(by('Traktor Scratch MK2').carrierHz,2500);
  assert.equal(by('Traktor Scratch MK2').confidence,'confirmed');
  assert.equal(by('rekordbox RB-VS1').confidence,'confirmed');
  assert.equal(by('Final Scratch').confidence,'unverified');
  assert.match(by('Final Scratch').notes,/not in xwax timecoder\.c/);
  assert.equal(by('Traktor Scratch MK2 CD').carrierHz,3000);
  assert.equal(by('Serato CD').carrierHz,1000);
  assert.equal(by('MixVibes 7"').carrierHz,1300);
  assert.equal(by('Algoriddim djay').carrierHz,1000);
  const m=mergeFormats([{name:'Custom',carrierHz:1500},{name:'serato cv02.5',carrierHz:1001}]);
  assert.equal(m.find(f=>f.name==='Custom').carrierHz,1500);
  assert.equal(m.filter(f=>/serato cv02\.5/i.test(f.name)).length,1);
  assert.equal(m.find(f=>/serato cv02\.5/i.test(f.name)).carrierHz,1001);
});

test('clean 1 kHz Serato at nominal speed',()=>{
  const r=analyzeTimecode(synth({hz:1000,noise:.002}),{format:'Serato CV02.5'});
  assert.ok(Math.abs(get(r,'tc_carrier_hz')-1000)<.2);
  assert.ok(Math.abs(get(r,'tc_speed_error_percent'))<.03);
  assert.ok(Math.abs(get(r,'tc_phase_deg')-90)<1);
  assert.ok(get(r,'tc_phase_error_deg')<1);
  assert.ok(Math.abs(get(r,'tc_balance_db'))<.3);
  assert.ok(get(r,'tc_snr_db')>30);
  assert.equal(get(r,'tc_dropouts'),0);
  assert.equal(r.direction,'forward');
  assert.equal(r.findings.length,0);
  assert.ok(r.trace.length>=15);
});

test('+2% speed, 70 deg phase, 3 dB imbalance on Traktor MK2 2.5 kHz',()=>{
  const r=analyzeTimecode(synth({hz:2550,phaseDeg:70,imbalanceDb:3,noise:.002}),{format:'Traktor Scratch MK2'});
  assert.ok(Math.abs(get(r,'tc_speed_error_percent')-2)<.05);
  assert.ok(Math.abs(get(r,'tc_phase_deg')-70)<1);
  assert.ok(Math.abs(get(r,'tc_phase_error_deg')-20)<1);
  assert.ok(Math.abs(get(r,'tc_balance_db')-3)<.2);
  const ids=r.findings.map(f=>f.id);
  assert.ok(ids.includes('tc-phase')&&ids.includes('tc-speed'));
});

test('pitch/nominal rpm scaling: 45 rpm expects 1350 Hz',()=>{
  const r=analyzeTimecode(synth({hz:1350}),{format:'Serato CV02.5',nominalRpm:45});
  assert.ok(Math.abs(get(r,'tc_speed_error_percent'))<.05);
});

test('noise lowers SNR and raises finding',()=>{
  const r=analyzeTimecode(synth({noise:.5}),{format:'Serato CV02.5'});
  const snr=get(r,'tc_snr_db');
  assert.ok(snr<20&&snr>-5,String(snr));
  assert.ok(r.findings.some(f=>f.id==='tc-snr'));
});

test('dropouts counted and not corrupting frequency',()=>{
  const r=analyzeTimecode(synth({dropouts:[[.5,.56]],noise:.002}),{format:'Serato CV02.5'});
  // second dropout
  const r2=analyzeTimecode(synth({dropouts:[[.5,.56],[1.2,1.26]],noise:.002}),{format:'Serato CV02.5'});
  assert.equal(get(r,'tc_dropouts'),1);
  assert.equal(get(r2,'tc_dropouts'),2);
  assert.ok(Math.abs(get(r2,'tc_carrier_hz')-1000)<.3);
  assert.ok(r2.findings.some(f=>f.id==='tc-dropouts'));
});

test('reverse direction detected',()=>{
  const r=analyzeTimecode(synth({reverse:true}),{format:'Serato CV02.5'});
  assert.equal(r.direction,'reverse');
  assert.ok(Math.abs(get(r,'tc_phase_deg')+90)<1);
  assert.ok(get(r,'tc_phase_error_deg')<1);
});

test('unknown format and short input',()=>{
  assert.ok(analyzeTimecode(synth({sec:1}),{format:'Nope'}).error);
  assert.ok(analyzeTimecode({left:new Float32Array(10),right:new Float32Array(10),sampleRate:sr},{format:'Serato CV02.5'}).error);
});

test('xwax-derived fields: phaseSign, primary, xwaxId, sides',()=>{
  const by=n=>TIMECODE_FORMATS.find(f=>f.name===n);
  for(const f of TIMECODE_FORMATS){
    assert.ok(f.phaseSign===1||f.phaseSign===-1,f.name);
    assert.ok(f.primary==='left'||f.primary==='right',f.name);
    assert.ok(Array.isArray(f.sides),f.name);
    for(const s of f.sides){
      assert.ok(s.label&&s.lengthCycles>0&&s.durationSec>0,f.name);
      assert.ok(Math.abs(s.durationSec-s.lengthCycles/f.carrierHz)<1e-9,f.name);
    }
  }
  const neg=TIMECODE_FORMATS.filter(f=>f.phaseSign===-1).map(f=>f.name).sort();
  assert.deepEqual(neg,['MixVibes 7"','MixVibes DVS V2','Traktor Scratch MK1']);
  assert.deepEqual(TIMECODE_FORMATS.filter(f=>f.primary==='left').map(f=>f.name),['Traktor Scratch MK1']);
  assert.deepEqual(by('Traktor Scratch MK2').sides.map(s=>[s.label,s.lengthCycles]),[['A',1845000],['B',2590000]]);
  assert.ok(Math.abs(by('Traktor Scratch MK2').sides[0].durationSec/60-12.3)<.05);
  assert.ok(Math.abs(by('Traktor Scratch MK2').sides[1].durationSec/60-17.27)<.05);
  assert.equal(by('Traktor Scratch MK1').sides[0].durationSec,750);
  assert.equal(by('rekordbox RB-VS1').sides[1].lengthCycles,918500);
  assert.equal(by('Final Scratch').xwaxId,null);
  assert.deepEqual(by('Final Scratch').sides,[]);
  assert.equal(by('Traktor Scratch MK2 CD').sides[0].lengthCycles,4500000);
  assert.equal(by('Serato CV02.5').xwaxId,'serato_2a/serato_2b');
});

test('direction applies phaseSign and the primary channel (Traktor MK1: left primary + 270 deg)',()=>{
  // Traktor MK1 has SWITCH_PRIMARY and SWITCH_PHASE: they cancel, so forward shows as +90 deg R-L phase
  const fwd=analyzeTimecode(synth({hz:2000,phaseDeg:90}),{format:'Traktor Scratch MK1'});
  assert.equal(fwd.direction,'forward');
  assert.ok(Math.abs(get(fwd,'tc_phase_deg')-90)<1);
  assert.ok(get(fwd,'tc_phase_error_deg')<1);
  const rev=analyzeTimecode(synth({hz:2000,phaseDeg:90,reverse:true}),{format:'Traktor Scratch MK1'});
  assert.equal(rev.direction,'reverse');
  // MixVibes (SWITCH_PHASE only, right primary): forward shows as -90 deg R-L phase
  const mv=analyzeTimecode(synth({hz:1300,phaseDeg:90,reverse:true}),{format:'MixVibes DVS V2'});
  assert.equal(mv.direction,'forward');
  // custom format without phaseSign defaults to +1
  const c=analyzeTimecode(synth({hz:1000}),{format:{name:'x',carrierHz:1000,atRpm:33.333333}});
  assert.equal(c.direction,'forward');
});

test('mergeFormats keeps xwax facts when a profile entry omits them',()=>{
  const m=mergeFormats([{name:'traktor scratch mk1',carrierHz:2000}]);
  const f=m.find(x=>/traktor scratch mk1/i.test(x.name));
  assert.equal(f.phaseSign,-1);
  assert.equal(f.primary,'left');
  assert.equal(f.sides.length,2);
  assert.equal(m.filter(x=>/traktor scratch mk1/i.test(x.name)).length,1);
});

test('check-timecode-facts: shipped profiles agree, contradictions are caught',async()=>{
  const {checkProfile,checkAll}=await import('../tools/check-timecode-facts.mjs');
  assert.deepEqual(checkAll(),[]);
  const bad=checkProfile({id:'x',timecode:{formats:[{name:'traktor scratch mk2',carrierHz:2000},{name:'Traktor Scratch MK1 CD',carrierHz:null},{name:'Other',carrierHz:5}]}});
  assert.equal(bad.length,1);
  assert.match(bad[0],/2000 contradicts TIMECODE_FORMATS 2500/);
});

// ---- direction and primary channel per format family (xwax SWITCH_PRIMARY / SWITCH_PHASE facts) ----
import {directionSign,directionFromPhase,detectTimecodeFormat,findFormat} from '../app/timecode.js';

/** Stereo carrier where the right channel leads the left by `rightLeadDeg`. */
function pair(hz,rightLeadDeg,{sec=1,noiseR=0}={}){
  const n=sr*sec,l=new Float32Array(n),r=new Float32Array(n),ph=rightLeadDeg*Math.PI/180;let seed=3;
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296-.5;};
  for(let i=0;i<n;i++){const w=2*Math.PI*hz*i/sr;l[i]=.5*Math.sin(w);r[i]=.5*Math.sin(w+ph)+noiseR*rnd()*2;}
  return {left:l,right:r,sampleRate:sr};
}
/**
 * Independent model of the xwax rule: the vector (primary, secondary) turning the positive way means forward,
 * inverted by SWITCH_PHASE. Accumulates arg(z[n] * conj(z[n-1])) with z = primary + i*secondary.
 */
function xwaxForward(audio,fmt){
  const p=fmt.primary==='left'?audio.left:audio.right,s=fmt.primary==='left'?audio.right:audio.left;
  let rot=0;for(let i=1;i<p.length;i++){const re=p[i]*p[i-1]+s[i]*s[i-1],im=s[i]*p[i-1]-p[i]*s[i-1];rot+=Math.atan2(im,re);}
  const fwd=rot>0;return fmt.phaseSign===-1?!fwd:fwd;
}
const FAMILIES=[
  ['Serato CV02.5','right',1],['Serato CD','right',1],['rekordbox RB-VS1','right',1],['Algoriddim djay','right',1],
  ['Traktor Scratch MK2','right',1],['Traktor Scratch MK2 CD','right',1],
  ['Traktor Scratch MK1','left',-1],['MixVibes DVS V2','right',-1],['MixVibes 7"','right',-1],
];

test('format table encodes xwax SWITCH_PRIMARY and SWITCH_PHASE per family',()=>{
  for(const [name,primary,phaseSign] of FAMILIES){
    const f=findFormat(name);
    assert.equal(f.primary,primary,name);assert.equal(f.phaseSign,phaseSign,name);
  }
  assert.equal(directionSign(findFormat('Serato CV02.5')),1);
  assert.equal(directionSign(findFormat('Traktor Scratch MK1')),1,'left primary and 270 deg cancel');
  assert.equal(directionSign(findFormat('MixVibes DVS V2')),-1);
  assert.equal(directionSign({primary:'left',phaseSign:1}),-1);
  assert.equal(directionFromPhase(NaN,findFormat('Serato CV02.5')),'unknown');
});

for(const [name] of FAMILIES){
  test(`direction matches the xwax rule both ways: ${name}`,()=>{
    const fmt=findFormat(name);
    for(const lead of [90,-90]){
      const a=pair(fmt.carrierHz,lead);
      const want=xwaxForward(a,fmt)?'forward':'reverse';
      const r=analyzeTimecode(a,{format:fmt});
      assert.equal(r.direction,want,`${name} right-lead ${lead}`);
      assert.equal(r.primary,fmt.primary);
      assert.ok(Math.abs(r.primaryLeadDeg-(fmt.primary==='left'?-lead:lead))<1.5,String(r.primaryLeadDeg));
      assert.ok(get(r,'tc_phase_error_deg')<1.5);
    }
  });
}

test('Traktor MK1 plays forward with the right channel leading (was reported reversed before)',()=>{
  assert.equal(analyzeTimecode(pair(2000,90),{format:'Traktor Scratch MK1'}).direction,'forward');
  assert.equal(analyzeTimecode(pair(2000,-90),{format:'Traktor Scratch MK1'}).direction,'reverse');
  assert.equal(analyzeTimecode(pair(1300,-90),{format:'MixVibes DVS V2'}).direction,'forward');
});

test('a profile format with a left primary and no phase switch reads forward when the left leads',()=>{
  const fmts=mergeFormats([{name:'Lab left-primary',carrierHz:1500,primary:'left'},{name:'Lab junk',carrierHz:1100,primary:'centre',phaseSign:7}]);
  const lab=fmts.find(f=>f.name==='Lab left-primary');
  assert.equal(analyzeTimecode(pair(1500,-90),{format:lab}).direction,'forward');
  assert.equal(analyzeTimecode(pair(1500,90),{format:lab}).direction,'reverse');
  const junk=fmts.find(f=>f.name==='Lab junk');
  assert.deepEqual([junk.primary,junk.phaseSign],['right',1]);
});

test('carrier is tracked on the primary channel (noisy secondary does not bias it)',()=>{
  const r=analyzeTimecode(pair(2040,90,{noiseR:.3}),{format:'Traktor Scratch MK1'});
  assert.ok(Math.abs(get(r,'tc_carrier_hz')-2040)<.5,String(get(r,'tc_carrier_hz')));
});

test('detectTimecodeFormat picks the carrier family and reports ambiguity',()=>{
  const d1=detectTimecodeFormat(pair(1005,90));
  assert.equal(d1.format.carrierHz,1000);assert.equal(d1.format.confidence,'confirmed');
  assert.ok(d1.ambiguous.includes('rekordbox RB-VS1'));
  assert.equal(detectTimecodeFormat(pair(2500,90)).format.name,'Traktor Scratch MK2');
  assert.equal(detectTimecodeFormat(pair(2000,90)).format.name,'Traktor Scratch MK1');
  assert.equal(detectTimecodeFormat(pair(1300,-90)).format.carrierHz,1300);
  assert.equal(detectTimecodeFormat(pair(3000,90)).format.name,'Traktor Scratch MK2 CD');
  assert.equal(detectTimecodeFormat(pair(1350,90),{nominalRpm:45}).format.carrierHz,1000,'45 rpm scales the expected carriers');
  let seed=1;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296-.5;};
  const noise={left:Float32Array.from({length:sr},rnd),right:Float32Array.from({length:sr},rnd),sampleRate:sr};
  assert.equal(detectTimecodeFormat(noise),null);
  assert.equal(detectTimecodeFormat(pair(5000,90)),null,'no known carrier');
  assert.equal(detectTimecodeFormat({left:new Float32Array(10),right:new Float32Array(10),sampleRate:sr}),null);
});
