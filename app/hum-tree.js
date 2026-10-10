// Booth hum hunter: guided isolation steps, step deltas and the cause decision tree (FS-15 AC-1..AC-3, AC-7).
// Pure logic plus a small persistence bridge; measuring is app/hum.js humMeasure (FS-00 §4.6), never re-implemented here.
//
// Levels: totalDbfs is the power sum of the mains harmonics in peak-dBFS (hum.js convention). A step's delta is
// its totalDbfs minus the previous REFERENCE step's totalDbfs (probe steps such as "gain down" are compared but
// never become the reference, and skipped steps are passed over). All thresholds are heuristic and tunable
// (FS-15 §11: no authoritative source), so each is exported and boundary-tested.
import {humMeasure,detectMains} from './hum.js';

export const HUM_STEPS_VERSION='v1';
export const STEP_MEASURE_SEC=5;      // AC-2: each step records a 5 s measurement
export const DROP_DB=6;               // AC-2: drop >= 6 dB after a step
export const RISE_DB=6;               // FS-15 §6: rise >= 6 dB = "this connection introduces hum"
export const NO_CHANGE_DB=1;          // FS-15 §6: deltas below 1 dB are "no change"
export const HUM_PRESENT_DB=10;       // hum counts as present when total hum is this far above the floor
export const HIGH_ORDER_SHARE=.3;     // power share of harmonics n >= 5 that suggests rectifier/dimmer buzz
export const LOW_ORDER_SHARE=.7;      // power share of harmonics n <= 2 typical of a ground loop
export const MAINS_CONFIDENCE_MIN=.2; // below this detectMains confidence the mains family is "indeterminate" (show both)
export const CLIP_PEAK=.999;
export const NO_SIGNAL_PEAK=1e-6;     // digital silence: no input at all
export const SKIPPED_FACTOR=.85;      // confidence factor for evidence that spans a skipped step

export const DROP_MESSAGE='Hum source is downstream of this connection';
export const RISE_MESSAGE='This connection introduces hum';

const step=(id,code,label,instruction,extra={})=>Object.freeze({id,code,label,instruction,optional:false,probe:false,...extra});
/** Guided isolation steps (FS-15 §3 A-G), versioned HUM_STEPS_VERSION. Ground lift is never the mains safety earth. */
export const HUM_STEPS=Object.freeze([
  step('mixer_alone','A','Mixer alone','Unplug everything from the mixer channel under test. Channel fader up, gain at your normal setting.'),
  step('gain_zero','A2','Mixer alone, gain down','Turn the channel gain fully down and leave the fader up. Turn the gain back to normal before the next step.',{optional:true,probe:true}),
  step('deck_cables','B','Deck cables, no ground wire','Connect the turntable signal cables to the phono input. Leave the turntable ground wire disconnected.'),
  step('tt_ground','C','Turntable ground wire connected','Connect the turntable ground wire to the mixer GND terminal and tighten it.'),
  step('laptop_usb','D','Laptop USB, on battery','Unplug the laptop charger first, then connect the laptop USB cable to the mixer or interface.'),
  step('laptop_charger','E','Laptop charger','Plug the laptop charger back in.'),
  step('other_gear','F','Other gear','Connect the remaining gear (second deck, effects, booth cables) one item at a time.',{optional:true}),
  step('ground_lift','G','Audio ground-lift switch or DI','Only if the mixer or a DI box has an audio ground-lift switch: set it as its manual describes. Never lift, cut or tape over the mains safety earth.',{optional:true})
]);
const STEP_BY_ID=new Map(HUM_STEPS.map(s=>[s.id,s]));
export const stepById=id=>STEP_BY_ID.get(id)??null;

/** Cause catalogue (AC-3). Order breaks confidence ties. */
export const CAUSES=Object.freeze({
  tt_ground_missing:{label:'Turntable ground wire missing or open',nextAction:'Keep the turntable ground wire on the mixer GND terminal. Check it is tight and the fork or spade touches bare metal.'},
  tt_ground_contact:{label:'Turntable ground wire not making contact',nextAction:'Check the GND terminal is tight, the wire is not broken and it is attached at the turntable end. On decks with the ground in the signal cable, check the cable\'s ground pin.'},
  ground_loop_tt_mixer:{label:'Ground loop between turntable and mixer',nextAction:'Connect the turntable ground at one point only. If the mixer has an audio ground-lift switch, try it as its manual describes (never the mains earth).'},
  ground_loop:{label:'Ground loop (the audio ground lift removed it)',nextAction:'Keep the audio ground-lift switch or DI engaged as its manual describes. Never lift the mains safety earth.'},
  usb_laptop_ground:{label:'USB / laptop ground loop',nextAction:'Power the laptop and the mixer from the same power strip, or use a USB isolator.'},
  charger_ground:{label:'Laptop charger ground or switch-mode noise',nextAction:'Run the laptop on battery, or plug the charger into the same power strip as the mixer. Use the charger\'s earthed lead if it has one.'},
  other_gear:{label:'Other connected gear',nextAction:'Reconnect the other gear one item at a time to find which one adds hum, and power it from the same strip as the mixer.'},
  unbalanced_cable_pickup:{label:'Unbalanced cable pickup',nextAction:'Move the signal cables away from power supplies, wall-warts and mains cables, and try a shorter or different cable.'},
  dimmer_interference:{label:'Lighting dimmer or switch-mode supply interference',nextAction:'Switch off stage lighting, dimmers and LED supplies near the booth one at a time, or move the DJ gear to a different mains circuit.'},
  mixer_internal:{label:'Mixer or interface (internal or power supply)',nextAction:'Try another mixer channel, check the mixer power supply, and check the cable from the mixer to the interface or recorder.'},
  unexplained:{label:'Source not isolated yet',nextAction:'Repeat with the laptop on battery and all other gear unplugged, then check the venue mains and lighting.'}
});
const CAUSE_ORDER=Object.keys(CAUSES);

const finite=v=>typeof v==='number'&&Number.isFinite(v);
const clamp01=v=>Math.max(0,Math.min(1,v));
const round=(v,d=1)=>finite(v)?Math.round(v*10**d)/10**d:null;

function peakAndRms(samples){let p=0,s=0;for(let i=0;i<samples.length;i++){const v=Math.abs(samples[i]);if(!(v<=p))p=Number.isNaN(v)?Infinity:v;s+=v*v;}return {peak:p,rms:Math.sqrt(s/Math.max(1,samples.length))};}

/**
 * Live hum reading for the meter (AC-1): mains fundamental (auto 50/60), harmonics 2-6, total hum vs the floor.
 * When the mains family is indeterminate (detectMains confidence < MAINS_CONFIDENCE_MIN) both families are
 * returned (FS-15 §7 "show both"). Throws RangeError for windows shorter than two mains cycles.
 */
export function liveHumReading(samples,sampleRate,{mains='auto',windowSec}={}){
  let indeterminate=false,confidence=1;
  if(mains==='auto'){const d=detectMains(samples,sampleRate);confidence=d.confidence;indeterminate=d.confidence<MAINS_CONFIDENCE_MIN;mains=d.mainsHz;}
  const m=humMeasure(samples,sampleRate,{mains,harmonics:8,windowSec});
  const out={...m,mainsConfidence:confidence,mainsIndeterminate:indeterminate,displayHarmonics:m.harmonics.filter(h=>h.n>=2&&h.n<=6)};
  if(indeterminate){const alt=humMeasure(samples,sampleRate,{mains:mains===50?60:50,harmonics:8,windowSec});out.alternate={mainsHz:alt.mainsHz,fundamentalDbfs:alt.fundamentalDbfs,totalDbfs:alt.totalDbfs,humToFloorDb:alt.humToFloorDb,displayHarmonics:alt.harmonics.filter(h=>h.n>=2&&h.n<=6)};}
  return out;
}

/**
 * One isolation step's measurement (AC-2): the trailing STEP_MEASURE_SEC seconds through humMeasure.
 * quality.status: 'ok' | 'short' (less than 5 s captured) | 'clipping' (peak >= 0.999) | 'noSignal' (digital silence; no measurement).
 * @returns {{measurement:object|null, quality:{status:string, peak:number, seconds:number}}}
 */
export function measureStep(samples,sampleRate,{mains='auto',windowSec=STEP_MEASURE_SEC}={}){
  if(!samples||!samples.length)return {measurement:null,quality:{status:'noSignal',peak:0,seconds:0}};
  const seconds=samples.length/sampleRate,{peak}=peakAndRms(samples);
  if(!(peak>NO_SIGNAL_PEAK))return {measurement:null,quality:{status:'noSignal',peak:finite(peak)?peak:0,seconds}};
  const measurement=humMeasure(samples,sampleRate,{mains,harmonics:8,windowSec});
  const status=peak>=CLIP_PEAK?'clipping':seconds<windowSec*.98?'short':'ok';
  return {measurement,quality:{status,peak,seconds}};
}

/** Flattened per-step record used by the tree and by hum_run_save. `m` is a humMeasure result (or null when skipped). */
export function stepResult(stepId,m,{skipped=false,note=null}={}){
  const def=stepById(stepId);if(!def)throw new RangeError(`unknown hum step '${stepId}'`);
  if(skipped||!m)return {stepId,label:def.label,skipped:true,note};
  return {stepId,label:def.label,skipped:false,note,mainsHz:m.mainsHz,fundamentalDbfs:m.fundamentalDbfs,
    harmonics:(m.harmonics||[]).map(h=>({n:h.n,hz:h.hz,dbfs:h.dbfs})),totalDbfs:m.totalDbfs,floorDbfs:m.floorDbfs,
    humToFloorDb:finite(m.humToFloorDb)?m.humToFloorDb:m.totalDbfs-m.floorDbfs,oddEvenRatio:m.oddEvenRatio,uncertaintyDb:finite(m.uncertaintyDb)?m.uncertaintyDb:0};
}

const measured=r=>r&&!r.skipped&&finite(r.totalDbfs);
const humPresent=r=>measured(r)&&finite(r.humToFloorDb)&&r.humToFloorDb>=HUM_PRESENT_DB;

/** delta = total(cur) - total(prev) in dB; null when either step is skipped or unmeasured. */
export function deltaDb(prev,cur){return measured(prev)&&measured(cur)?cur.totalDbfs-prev.totalDbfs:null;}

/**
 * 'drop' (<= -DROP_DB) | 'rise' (>= RISE_DB) | 'noChange' (|d| < max(NO_CHANGE_DB, combined uncertainty)) | 'minor' | 'unknown'.
 * With `prev`/`cur` given, two steps that both sit at the floor (no hum either way) are 'noChange'.
 */
export function classifyDelta(d,{prev,cur,uncertaintyDb=0}={}){
  if(!finite(d))return 'unknown';
  if(prev&&cur&&!humPresent(prev)&&!humPresent(cur))return 'noChange';
  if(d<=-DROP_DB)return 'drop';
  if(d>=RISE_DB)return 'rise';
  if(Math.abs(d)<Math.max(NO_CHANGE_DB,finite(uncertaintyDb)?uncertaintyDb:0))return 'noChange';
  return 'minor';
}
const DELTA_MESSAGES={drop:DROP_MESSAGE,rise:RISE_MESSAGE,noChange:'No change',minor:'Small change',unknown:''};

/**
 * Deltas for a step sequence (AC-2). Each entry: {...result, idx, refStepId, deltaDb, deltaClass, message, spansSkipped}.
 * The reference is the last measured non-probe step before it; spansSkipped is true when a skipped step lies between.
 */
export function analyzeSteps(results){
  const out=[];let ref=null,refIdx=-1;
  (results||[]).forEach((r,idx)=>{
    const def=stepById(r.stepId),d=ref?deltaDb(ref,r):null;
    const u=ref&&measured(r)?Math.hypot(ref.uncertaintyDb||0,r.uncertaintyDb||0):0;
    const deltaClass=classifyDelta(d,{prev:ref,cur:r,uncertaintyDb:u});
    const spansSkipped=ref?results.slice(refIdx+1,idx).some(x=>x.skipped):false;
    out.push({...r,idx,refStepId:ref&&measured(r)?ref.stepId:null,deltaDb:d,deltaClass,message:DELTA_MESSAGES[deltaClass],spansSkipped});
    if(measured(r)&&!def?.probe){ref=r;refIdx=idx;}
  });
  return out;
}

function harmonicShares(r){
  let total=0,low=0,high=0;
  for(const h of r?.harmonics||[]){const p=10**(h.dbfs/10);total+=p;if(h.n<=2)low+=p;if(h.n>=5)high+=p;}
  return total>0?{low:low/total,high:high/total}:{low:0,high:0};
}

/**
 * Ranked likely causes from the isolation steps (AC-3). Heuristic decision tree (FS-15 §6), confidence 0..1.
 * @param {Array} results stepResult records in the order they were run (skipped ones included)
 * @returns {Array<{id:string,label:string,confidence:number,evidence:string,nextAction:string}>} sorted by confidence; [] when no hum was measured.
 */
export function rankCauses(results){
  const steps=analyzeSteps(results),by=new Map(steps.map(s=>[s.stepId,s]));
  if(!steps.some(humPresent))return [];
  const found=new Map();
  const add=(id,conf,evidence,s)=>{
    const c=clamp01(conf*(s?.spansSkipped?SKIPPED_FACTOR:1)),prev=found.get(id);
    if(!prev)found.set(id,{id,label:CAUSES[id].label,confidence:c,evidence:[evidence],nextAction:CAUSES[id].nextAction});
    else{prev.confidence=Math.max(prev.confidence,c);prev.evidence.push(evidence);}
  };
  const mag=s=>Math.abs(s.deltaDb),strength=s=>clamp01((mag(s)-6)/30);
  const fmt=s=>`${mag(s).toFixed(1)} dB`;
  const A=by.get('mixer_alone'),A2=by.get('gain_zero'),B=by.get('deck_cables'),C=by.get('tt_ground'),D=by.get('laptop_usb'),E=by.get('laptop_charger'),F=by.get('other_gear'),G=by.get('ground_lift');
  const cMeasured=measured(C);

  if(C?.deltaClass==='drop')add('tt_ground_missing',.7+.25*strength(C),`Hum dropped ${fmt(C)} when the turntable ground wire was connected (step C).`,C);
  if(C?.deltaClass==='rise'){
    const lowBoost=harmonicShares(C).low>=LOW_ORDER_SHARE?.1:0;
    add('ground_loop_tt_mixer',.65+lowBoost+.2*strength(C),`Hum rose ${fmt(C)} when the turntable ground wire was connected (step C): a second ground path.`,C);
  }
  if(B?.deltaClass==='rise'){
    if(cMeasured&&(C.deltaClass==='noChange'||C.deltaClass==='minor')){
      add('tt_ground_contact',.6,`Hum rose ${fmt(B)} with the deck cables (step B) and the ground wire did not lower it (step C).`,C);
      add('unbalanced_cable_pickup',.4,`Hum came in with the deck cables (step B) and grounding did not remove it.`,B);
      if(harmonicShares(B).low>=LOW_ORDER_SHARE)add('ground_loop_tt_mixer',.45,`Hum added by the deck cables is mostly 1st/2nd harmonic, typical of a ground loop.`,B);
    }else if(!cMeasured){
      add('tt_ground_missing',.5,`Hum rose ${fmt(B)} with the deck cables (step B); step C was not measured to confirm the ground wire.`,B);
      add('unbalanced_cable_pickup',.35,`Hum came in with the deck cables (step B).`,B);
    }
  }
  if(D?.deltaClass==='rise')add('usb_laptop_ground',.7+.25*strength(D),`Hum rose ${fmt(D)} when the laptop USB was connected on battery (step D).`,D);
  if(E?.deltaClass==='rise'){
    const hi=harmonicShares(E).high>=HIGH_ORDER_SHARE?.05:0;
    add('charger_ground',.75+hi+.2*strength(E),`Hum rose ${fmt(E)} when the laptop charger was plugged in (step E).`,E);
  }
  if(F?.deltaClass==='rise')add('other_gear',.6+.3*strength(F),`Hum rose ${fmt(F)} when the other gear was connected (step F).`,F);
  if(G?.deltaClass==='drop')add('ground_loop',.8+.15*strength(G),`Hum dropped ${fmt(G)} with the audio ground lift engaged (step G).`,G);

  if(humPresent(A)){
    let conf=.55,ev=`Hum is ${A.humToFloorDb.toFixed(1)} dB above the floor with nothing connected (step A).`;
    if(A2&&measured(A2)){
      if(A2.deltaClass==='noChange'){conf=.7;ev+=' It did not change with the gain down, so it enters after the gain stage.';}
      else if(A2.deltaClass==='drop'){conf=.5;ev+=' It fell with the gain down, so it enters at this channel\'s input stage.';}
    }
    add('mixer_internal',conf,ev,A);
  }
  const loudest=steps.filter(humPresent).reduce((a,b)=>(!a||b.totalDbfs>a.totalDbfs?b:a),null);
  if(loudest){
    const sh=harmonicShares(loudest);
    if(sh.high>=HIGH_ORDER_SHARE||(finite(loudest.oddEvenRatio)&&loudest.oddEvenRatio>=3&&sh.high>=HIGH_ORDER_SHARE/2))
      add('dimmer_interference',.4+.3*clamp01((sh.high-HIGH_ORDER_SHARE)/.4),`${Math.round(sh.high*100)} % of the hum power is in the 5th harmonic and above at step ${stepById(loudest.stepId)?.code} (buzz rather than hum).`,loudest);
  }
  if(!found.size)add('unexplained',.3,'Hum is present but no single step changed it by 6 dB or more.',null);
  return [...found.values()]
    .map(c=>({...c,confidence:Math.round(c.confidence*100)/100,evidence:c.evidence.join(' ')}))
    .sort((a,b)=>b.confidence-a.confidence||CAUSE_ORDER.indexOf(a.id)-CAUSE_ORDER.indexOf(b.id));
}

/** One-line result copy (FS-15 §3), e.g. "Hum dropped 18 dB when the turntable ground was connected. The turntable ground wire was open." */
export function verdict(results,causes=rankCauses(results)){
  const steps=analyzeSteps(results);
  if(!steps.some(measured))return 'No steps were measured.';
  if(!causes.length)return 'No significant mains hum was measured.';
  const top=causes[0],by=new Map(steps.map(s=>[s.stepId,s])),db=s=>Math.round(Math.abs(s.deltaDb));
  if(top.id==='tt_ground_missing'&&by.get('tt_ground')?.deltaClass==='drop')return `Hum dropped ${db(by.get('tt_ground'))} dB when the turntable ground was connected. The turntable ground wire was open.`;
  if(top.id==='charger_ground')return `Hum rose ${db(by.get('laptop_charger'))} dB when the laptop charger was plugged in. Run the laptop on battery or share the mixer's power strip.`;
  if(top.id==='usb_laptop_ground')return `Hum rose ${db(by.get('laptop_usb'))} dB when the laptop USB was connected. This is a USB ground loop.`;
  if(top.id==='ground_loop')return `Hum dropped ${db(by.get('ground_lift'))} dB with the audio ground lift engaged. This is a ground loop.`;
  return `Most likely cause: ${top.label} (${Math.round(top.confidence*100)} % confidence).`;
}

/** hum_run_save input for a hum run (tests/contracts/humrun.json). */
export function humRunInput(results,{venueId=null,sessionId=null,setupId=null,mainsHz=null}={}){
  const steps=analyzeSteps(results),causes=rankCauses(results);
  const mains=mainsHz??steps.find(measured)?.mainsHz??null;
  return {sessionId,venueId,setupId,kind:'hum',mainsHz:mains===50||mains===60?mains:null,verdict:verdict(results,causes),
    causes:causes.map(c=>({id:c.id,label:c.label,confidence:c.confidence,evidence:c.evidence,nextAction:c.nextAction})),
    steps:steps.map(s=>s.skipped?{stepId:s.stepId,label:s.label,skipped:true,note:s.note??null}:
      {stepId:s.stepId,label:s.label,fundamentalDbfs:round(s.fundamentalDbfs,2),harmonics:s.harmonics.map(h=>({n:h.n,hz:round(h.hz,2),dbfs:round(h.dbfs,2)})),
        totalDbfs:round(s.totalDbfs,2),floorDbfs:round(s.floorDbfs,2),deltaDb:round(s.deltaDb,2),skipped:false,note:s.note??null})};
}

// ---- persistence bridge (Rust humrun.rs; localStorage fallback in browser mode) ----

export const STORAGE_KEY='deckchek.humrun.v1';
const nativeInvoke=()=>globalThis.window?.__TAURI__?.core?.invoke??globalThis.__TAURI__?.core?.invoke??null;

export class HumRunError extends Error{constructor(code,message){super(message);this.name='HumRunError';this.code=code;}}
export function toHumRunError(err){
  if(err instanceof HumRunError)return err;
  const text=typeof err==='string'?err:String(err?.message??err);
  const m=/^(HUMRUN_[A-Z_]+):\s*(.*)$/s.exec(text);
  return m?new HumRunError(m[1],m[2]):new HumRunError('HUMRUN_ERROR',text);
}

const STEP_NUMS=['fundamentalDbfs','totalDbfs','floorDbfs','deltaDb','levelDbfs','peakHz','growthDbPerS'];
function localRun(input,id,createdAt){
  if(!['hum','feedback'].includes(input?.kind))throw new HumRunError('HUMRUN_INVALID','kind must be one of hum, feedback');
  if(!Array.isArray(input.steps)||!input.steps.length)throw new HumRunError('HUMRUN_INVALID','a run needs at least one step');
  const txt=v=>typeof v==='string'&&v.trim()?v.trim():null;
  return {id,sessionId:txt(input.sessionId),venueId:txt(input.venueId),setupId:txt(input.setupId),kind:input.kind,
    mainsHz:input.mainsHz===50||input.mainsHz===60?input.mainsHz:null,verdict:txt(input.verdict),causes:Array.isArray(input.causes)?input.causes:[],createdAt,
    steps:input.steps.map((s,idx)=>{
      const sk=Boolean(s.skipped),num=k=>!sk&&finite(s[k])?s[k]:null;
      // same field order and null-filling as the Rust HumStep (skipped steps carry no measurement)
      return {idx,stepId:s.stepId,label:String(s.label??'').trim(),fundamentalDbfs:num('fundamentalDbfs'),
        harmonics:!sk&&Array.isArray(s.harmonics)?s.harmonics:[],...Object.fromEntries(STEP_NUMS.slice(1).map(k=>[k,num(k)])),
        onset:!sk&&Boolean(s.onset),skipped:sk,note:txt(s.note)};
    })};
}

/**
 * Store for hum/feedback runs. `invoke` defaults to the Tauri bridge (looked up per call); `invoke: null` forces
 * browser mode (localStorage `deckchek.humrun.v1`, same shapes). Methods: save(input), list(filter), get(id), delete(id).
 */
export function createHumRunStore({invoke,storage,now=()=>new Date().toISOString(),newId=()=>globalThis.crypto?.randomUUID?.()??`local-${Date.now()}-${Math.random().toString(16).slice(2)}`}={}){
  const bridge=()=>(invoke===undefined?nativeInvoke():invoke);
  const store=()=>{if(storage!==undefined)return storage;try{return globalThis.localStorage??null;}catch{return null;}};
  const readAll=()=>{try{const v=JSON.parse(store()?.getItem(STORAGE_KEY)||'[]');return Array.isArray(v)?v:[];}catch{return [];}};
  const writeAll=runs=>{const s=store();if(!s)throw new HumRunError('HUMRUN_DB','no storage available in browser mode');s.setItem(STORAGE_KEY,JSON.stringify(runs));};
  const call=async(cmd,args)=>{try{return await bridge()(cmd,args);}catch(e){throw toHumRunError(e);}};
  return {
    get native(){return Boolean(bridge());},
    async save(input){
      if(bridge())return call('hum_run_save',{input});
      const run=localRun(input,newId(),now());writeAll([...readAll(),run]);return run;
    },
    async list({venueId=null,sessionId=null,kind=null,limit=50}={}){
      const filter={venueId,sessionId,kind,limit};
      if(bridge())return (await call('hum_run_list',{filter}))??[];
      const lim=Math.max(1,Math.min(500,Number(limit)||50));
      return readAll().filter(r=>(!venueId||r.venueId===venueId)&&(!sessionId||r.sessionId===sessionId)&&(!kind||r.kind===kind))
        .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0,lim).map(({steps,causes,...r})=>({...r,stepCount:steps.length,onset:steps.some(s=>s.onset)}));
    },
    async get(id){
      if(bridge())return (await call('hum_run_get',{id}))??null;
      return readAll().find(r=>r.id===id)??null;
    },
    async delete(id){
      if(bridge())return Boolean(await call('hum_run_delete',{id}));
      const all=readAll(),keep=all.filter(r=>r.id!==id);if(keep.length===all.length)return false;writeAll(keep);return true;
    }
  };
}
