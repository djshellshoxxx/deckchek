// Timecode (DVS control vinyl/CD) format table and quadrature-carrier analysis. Pure DSP, no DOM.
import {rms,dbfs,toneAmplitude,normalizeMeasurement} from './core.js';
import {fitTone,refineToneFrequency} from './calibration.js';

const XWAX='xwax timecoder.c timecode definitions as vendored in Mixxx (lib/xwax/timecoder.c)';
const MIXXX='https://mixxx.org/news/2021-12-22-dvs-internals-pt2/';
const MIXXX3='https://mixxx.org/news/2025-08-27-dvs-internals-pt3/';
// Side builder: durationSec = lengthCycles / resolution (cycles per second at 33 1/3 rpm), as in xwax.
const sides=(hz,...a)=>a.map(([label,lengthCycles])=>({label,lengthCycles,durationSec:lengthCycles/hz}));
// phaseSign: -1 for xwax SWITCH_PHASE (270 deg instead of 90); primary: 'left' for SWITCH_PRIMARY. Polarity (SWITCH_POLARITY) is bit decoding only and not modelled here.
const F=(o)=>({atRpm:33.333333,quadrature:true,phaseSign:1,primary:'right',source:XWAX,confidence:'confirmed',...o});
/** Built-in formats; facts from xwax lib/xwax/timecoder.c. confidence: 'confirmed' = present in xwax timecoder.c; 'unverified' = not independently confirmed. */
export const TIMECODE_FORMATS=[
  F({name:'Serato CV02.5',vendor:'Serato',carrierHz:1000,xwaxId:'serato_2a/serato_2b',sides:sides(1000,['A',712000],['B',922000]),notes:'Serato control vinyl, 1 kHz carrier at 33 1/3 rpm (xwax serato_2a/2b). Whether the CV02.5 NoiseMap uses exactly this code is not stated in timecoder.c; the carrier is.',source:XWAX+'; '+MIXXX}),
  F({name:'Serato CD',vendor:'Serato',carrierHz:1000,xwaxId:'serato_cd',sides:sides(1000,['CD',950000]),notes:'xwax serato_cd, 1 kHz carrier.'}),
  F({name:'Traktor Scratch MK1',vendor:'Native Instruments',carrierHz:2000,phaseSign:-1,primary:'left',xwaxId:'traktor_a/traktor_b',sides:sides(2000,['A',1500000],['B',2110000]),notes:'2 kHz carrier (xwax traktor_a/b: SWITCH_PRIMARY, SWITCH_POLARITY, SWITCH_PHASE).'}),
  F({name:'Traktor Scratch MK2',vendor:'Native Instruments',carrierHz:2500,xwaxId:'traktor_mk2_a/traktor_mk2_b',sides:sides(2500,['A',1845000],['B',2590000]),notes:'2.5 kHz carrier (xwax traktor_mk2_a/b, 110-bit code with offset modulation).',source:XWAX+'; '+MIXXX3+'; https://github.com/mixxxdj/mixxx/pull/14569'}),
  F({name:'Traktor Scratch MK2 CD',vendor:'Native Instruments',carrierHz:3000,xwaxId:'traktor_mk2_cd',sides:sides(3000,['CD',4500000]),notes:'3 kHz carrier (xwax traktor_mk2_cd, 110-bit code).'}),
  F({name:'rekordbox RB-VS1',vendor:'AlphaTheta (Pioneer DJ)',carrierHz:1000,xwaxId:'pioneer_a/pioneer_b',sides:sides(1000,['A',635000],['B',918500]),notes:'xwax pioneer_a/b: 1 kHz carrier, SWITCH_POLARITY.'}),
  F({name:'MixVibes DVS V2',vendor:'MixVibes',carrierHz:1300,phaseSign:-1,xwaxId:'mixvibes_v2',sides:sides(1300,['12"',950000]),notes:'xwax mixvibes_v2 resolution 1300, SWITCH_PHASE.'}),
  F({name:'MixVibes 7"',vendor:'MixVibes',carrierHz:1300,phaseSign:-1,xwaxId:'mixvibes_7inch',sides:sides(1300,['7"',312000]),notes:'xwax mixvibes_7inch resolution 1300, SWITCH_PHASE.'}),
  F({name:'Algoriddim djay',vendor:'Algoriddim',carrierHz:1000,xwaxId:'algoriddim_a/algoriddim_b',sides:sides(1000,['A',600000],['B',900000]),notes:'xwax algoriddim_a/b (djay PRO AI 12"), 1 kHz carrier.'}),
  F({name:'Serato CV02 (xwax serato_2a)',vendor:'Serato',carrierHz:1000,xwaxId:'serato_2a/serato_2b',sides:sides(1000,['A',712000],['B',922000]),notes:'Mixxx/xwax-compatible Serato timecode.'}),
  F({name:'Final Scratch',vendor:'Stanton / N2IT',carrierHz:1200,xwaxId:null,sides:[],notes:'1.2 kHz carrier (Mixxx documentation); not in xwax timecoder.c.',source:MIXXX,confidence:'unverified'})
];

/** Merge profile-supplied formats over the built-ins (matched by case-insensitive name; profile wins). */
export function mergeFormats(profileFormats=[]){
  const out=TIMECODE_FORMATS.map(f=>({...f}));
  for(const pf of profileFormats||[]){
    if(!pf?.name||!Number.isFinite(pf.carrierHz))continue;
    const f={atRpm:33.333333,quadrature:true,vendor:null,notes:null,source:null,confidence:'unverified',...pf};
    const i=out.findIndex(x=>x.name.toLowerCase()===f.name.toLowerCase());
    if(i>=0){const b=out[i];out[i]={phaseSign:b.phaseSign,primary:b.primary,xwaxId:b.xwaxId,sides:b.sides,...f};}else out.push({phaseSign:1,primary:'right',xwaxId:null,sides:[],...f});
  }
  return out;
}
export function findFormat(name,formats=TIMECODE_FORMATS){const n=String(name||'').toLowerCase();return formats.find(f=>f.name.toLowerCase()===n)||formats.find(f=>f.name.toLowerCase().includes(n)&&n)||null;}

const wrapDeg=d=>{while(d>180)d-=360;while(d<=-180)d+=360;return d;};
const median=a=>{const v=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!v.length)return NaN;const m=v.length>>1;return v.length%2?v[m]:(v[m-1]+v[m])/2;};

function carrierOf(win,sampleRate,center,spanFrac){
  const lo=center*(1-spanFrac),hi=center*(1+spanFrac),step=Math.max(1,sampleRate/win.length/4);
  let best=center,bm=-1;
  for(let f=lo;f<=hi;f+=step){const m=toneAmplitude(win,sampleRate,f);if(m>bm){bm=m;best=f;}}
  return refineToneFrequency(win,sampleRate,best,{segments:6}).frequencyHz;
}

export function analyzeTimecode({left,right,sampleRate},{format,nominalRpm=33.333333,windowSec=.1,formats=TIMECODE_FORMATS,dropoutDb=12}={}){
  const fmt=typeof format==='string'?findFormat(format,formats):format;
  if(!fmt)return {error:`Unknown timecode format: ${format}`,measurements:[],findings:[],trace:[]};
  const n=Math.min(left?.length||0,right?.length||0),win=Math.max(64,Math.floor(sampleRate*windowSec));
  if(n<win)return {error:'Recording too short for timecode analysis.',format:fmt,measurements:[],findings:[],trace:[]};
  const expectedHz=fmt.carrierHz*nominalRpm/(fmt.atRpm||33.333333);
  // 20 ms level windows for dropout detection
  const lw=Math.max(16,Math.floor(sampleRate*.02)),levels=[];
  for(let i=0;i+lw<=n;i+=lw)levels.push(dbfs(Math.min(rms(left.subarray(i,i+lw)),rms(right.subarray(i,i+lw)))));
  const sorted=levels.filter(Number.isFinite).sort((a,b)=>a-b),baseline=sorted.length?sorted[Math.floor(sorted.length*.75)]:-240,thr=baseline-dropoutDb;
  let dropouts=0,run=0;for(const l of levels){if(l<thr)run++;else{if(run)dropouts++;run=0;}}if(run)dropouts++;
  const bad=i=>{const a=Math.floor(i/lw),b=Math.floor((i+win)/lw);for(let k=a;k<b&&k<levels.length;k++)if(levels[k]<thr)return true;return false;};
  const trace=[];let center=expectedHz,span=.3;
  for(let s=0;s+win<=n;s+=win){
    if(bad(s)){trace.push({tSec:s/sampleRate,dropout:true});continue;}
    const l=left.subarray(s,s+win),r=right.subarray(s,s+win);
    const f=carrierOf(l.length>=r.length?l:r,sampleRate,center,span);
    center=f;span=.08;
    const fl=fitTone(l,sampleRate,f),fr=fitTone(r,sampleRate,f);
    const phaseDeg=wrapDeg((fr.phase-fl.phase)*180/Math.PI);
    const res=Math.sqrt((fl.residualRms**2+fr.residualRms**2)/2),sig=Math.sqrt((fl.amplitude**2+fr.amplitude**2)/4);
    trace.push({tSec:s/sampleRate,carrierHz:f,phaseDeg,balanceDb:20*Math.log10(Math.max(fl.amplitude,1e-12)/Math.max(fr.amplitude,1e-12)),snrDb:20*Math.log10(sig/Math.max(res,1e-12)),dropout:false});
  }
  const ok=trace.filter(t=>!t.dropout);
  const carrierHz=median(ok.map(t=>t.carrierHz)),phaseDeg=median(ok.map(t=>t.phaseDeg)),balanceDb=median(ok.map(t=>t.balanceDb)),snrDb=median(ok.map(t=>t.snrDb));
  const speedErr=(carrierHz/expectedHz-1)*100,phaseErr=Math.abs(Math.abs(phaseDeg)-90);
  const direction=!Number.isFinite(phaseDeg)?'unknown':phaseDeg*(fmt.phaseSign===-1?-1:1)>0?'forward':'reverse';
  const m=(metricId,label,value,unit,extra={})=>normalizeMeasurement({metricId,label,value,unit,...extra});
  const measurements=[
    m('tc_carrier_hz','Carrier frequency',carrierHz,'Hz'),
    m('tc_speed_error_percent','Speed error',speedErr,'%'),
    m('tc_phase_deg','L/R phase difference',phaseDeg,'deg',{referenceLow:-90,referenceHigh:90}),
    m('tc_phase_error_deg','Phase error from 90 deg',phaseErr,'deg',{referenceLow:0,referenceHigh:10}),
    m('tc_balance_db','L/R balance',balanceDb,'dB',{referenceLow:-1.5,referenceHigh:1.5}),
    m('tc_snr_db','Carrier SNR',snrDb,'dB',{referenceLow:25}),
    m('tc_dropouts','Dropouts',dropouts,'count',{referenceHigh:0})
  ];
  const findings=[];
  if(!ok.length)findings.push({id:'tc-no-signal',severity:'error',title:'No usable timecode signal',meaning:'Every analysis window was too weak or interrupted to measure.',action:'Check the needle is on the control vinyl, the phono/line switch matches the input, and cables are seated.'});
  else{
    if(phaseErr>15)findings.push({id:'tc-phase',severity:phaseErr>30?'error':'warning',title:`Channel phase is ${Math.abs(phaseDeg).toFixed(0)} deg instead of 90 deg`,meaning:'The two timecode channels should be a quarter cycle apart; otherwise the software cannot tell direction reliably. Typical causes are cartridge azimuth or wiring faults, one channel much weaker than the other, or heavy noise.',action:'Check cartridge alignment and leads/headshell wires, swap cables or inputs to see if the fault follows the channel.'});
    if(snrDb<25)findings.push({id:'tc-snr',severity:snrDb<15?'error':'warning',title:`Low carrier SNR (${snrDb.toFixed(1)} dB)`,meaning:'The timecode tone is buried in noise, which causes tracking glitches. Common causes are worn vinyl, a dirty or worn stylus, or ground hum/interference.',action:'Clean the record and stylus, try another disc, and check the ground wire and cable routing.'});
    if(Math.abs(speedErr)>1)findings.push({id:'tc-speed',severity:Math.abs(speedErr)>3?'error':'warning',title:`Carrier is ${speedErr.toFixed(2)}% off the expected ${expectedHz.toFixed(0)} Hz`,meaning:'The platter speed or pitch differs from nominal, so the software will read a pitch offset.',action:'Set pitch to 0%, confirm 33 1/3 rpm, then check the motor/strobe and belt or quartz lock.'});
    if(Math.abs(balanceDb)>3)findings.push({id:'tc-balance',severity:Math.abs(balanceDb)>6?'error':'warning',title:`Left/right levels differ by ${Math.abs(balanceDb).toFixed(1)} dB`,meaning:`The ${balanceDb>0?'left':'right'} channel is stronger. This points to a cartridge or channel fault, bad connection or input gain mismatch.`,action:'Swap the channels at the mixer; if the weak side follows the cartridge, inspect the stylus, cartridge and headshell leads.'});
  }
  if(dropouts>0)findings.push({id:'tc-dropouts',severity:dropouts>3?'error':'warning',title:`${dropouts} signal dropout${dropouts>1?'s':''} detected`,meaning:'The carrier briefly disappeared, which suggests skips, vinyl damage, dust on the stylus or an intermittent connection.',action:'Clean the record and stylus, inspect for scratches, and wiggle-test cables while watching the scope.'});
  return {format:fmt,expectedCarrierHz:expectedHz,nominalRpm,direction,measurements,findings,trace};
}
