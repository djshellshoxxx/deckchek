// Booth feedback step test (FS-15 AC-4..AC-6): level plan, spectrum frames, howl detector, limiter and the run
// controller. All output goes through app/audio-out.js -> src-tauri/src/audio_out.rs, which enforces the absolute
// -12 dBFS cap, the per-call cap, ramps and fail-silent stops in Rust; this module clamps the same way first and
// never asks for more (defence in depth, so the UI shows what will play).
//
// Safety rules (FS-15 §7): start at -60 dBFS, rise in 3 dB steps ONLY on user confirmation and never above the cap
// (default -30 dBFS); a minimum dwell between steps; abort (ramp to silence, Rust fades in 20 ms) on howl onset,
// STOP/Esc, input clipping, no input for > 1 s, 60 s without user action, any output error, or disposal. Every
// abort path ends in audio.stop(handle), falling back to audio.stopAll(), and never throws.
import {ABS_MAX_DBFS,effectiveCapDbfs,clampLevelDbfs} from './audio-out.js';

export const START_DBFS=-60;
export const STEP_DB=3;
export const DEFAULT_CAP_DBFS=-30;
export const MIN_START_DBFS=-90;
export const MIN_STEP_DB=1;
export const MAX_STEP_DB=6;
export const WINDOW_SEC=1;            // AC-5: consecutive 1 s windows
export const NFFT=8192;               // FS-15 §6: Welch, 8192 points (5.9 Hz bins at 48 kHz)
export const PEAK_TO_MEDIAN_DB=15;    // narrowband peak must stand this far above the band median
export const NARROW_MAX_BINS=3;       // narrowband: -3 dB width below this many bins
export const GROWTH_DB=6;             // AC-5: growth > 6 dB across two consecutive windows at constant output
export const STEP_JUMP_EXTRA_DB=6;    // FS-15 §6: total level rises by more than step + 6 dB
export const STEP_JUMP_MIN_SNR_DB=6;  // ... judged only when the previous step was clearly above the noise
export const MIN_STEP_DWELL_MS=4000;  // FS-15 §6: slow steps, every 4 s at most
export const NO_INPUT_MS=1000;        // FS-15 §7: no input data > 1 s => mute
export const INACTIVITY_MS=60000;     // FS-15 §7: 60 s without user action => mute
export const WATCHDOG_MS=250;
export const CLIP_PEAK=.999;
export const LOW_FREQ_HZ=120;         // guidance split (FS-15 §6)
export const BAND_HZ=[20,20000];
export const TONE_RAMP_MS=50;
export const HISTORY_FRAMES=16;

const finite=v=>typeof v==='number'&&Number.isFinite(v);
const r2=v=>Math.round(v*100)/100;

/**
 * Output level plan (AC-4). Levels start at startDbfs and rise by stepDb while <= cap; cap = min(capDbfs, -12).
 * @returns {{startDbfs:number, stepDb:number, capDbfs:number, levels:number[]}} (frozen)
 * @throws {RangeError} non-finite values or stepDb outside [1, 6] dB.
 */
export function stepPlan({startDbfs=START_DBFS,stepDb=STEP_DB,capDbfs=DEFAULT_CAP_DBFS}={}){
  if(!finite(startDbfs))throw new RangeError('startDbfs must be a finite number');
  if(!finite(stepDb)||stepDb<MIN_STEP_DB||stepDb>MAX_STEP_DB)throw new RangeError(`stepDb must be between ${MIN_STEP_DB} and ${MAX_STEP_DB} dB`);
  if(!finite(capDbfs))throw new RangeError('capDbfs must be a finite number');
  const cap=effectiveCapDbfs(capDbfs),start=Math.min(cap,Math.max(MIN_START_DBFS,startDbfs)),levels=[];
  // levels are rounded DOWN to 0.01 dB so rounding can never lift one above the cap
  for(let i=0;;i++){const l=Math.floor((start+i*stepDb)*100+1e-7)/100;if(l>cap)break;levels.push(l);}
  return Object.freeze({startDbfs:levels[0],stepDb,capDbfs:cap,levels:Object.freeze(levels)});
}

/** Software limiter (FS-15 §4): copy with every sample clamped to +/-10^(min(cap,-12)/20); NaN/Infinity -> 0. */
export function limiter(buffer,capDbfs=DEFAULT_CAP_DBFS){
  const lim=10**(effectiveCapDbfs(capDbfs)/20),out=new Float32Array(buffer?.length||0);
  // Float32 rounding of the limit itself must not round up past the cap.
  let l32=Math.fround(lim);if(l32>lim)l32=Math.fround(lim*(1-1e-7));
  for(let i=0;i<out.length;i++){const x=buffer[i];out[i]=Number.isFinite(x)?Math.max(-l32,Math.min(l32,x)):0;}
  return out;
}

/**
 * Stops output on every path and never throws: audio.stop(handle) (Rust fades 20 ms, well inside AC-5's 100 ms),
 * then audio.stopAll() if that failed or no handle is known.
 * @returns {Promise<{ok:boolean, method:'stop'|'stopAll'|'none', error?:string}>}
 */
export async function rampToSilence(audio,handle){
  let firstError=null;
  if(handle!==undefined&&handle!==null){
    try{await audio.stop(handle);return {ok:true,method:'stop'};}catch(e){firstError=e;}
  }
  try{await audio.stopAll();return {ok:true,method:'stopAll'};}
  catch(e){return {ok:false,method:'none',error:String((firstError??e)?.message??firstError??e)};}
}

// ---- spectrum ----

const hannCache=new Map();
function hann(n){let w=hannCache.get(n);if(!w){w=new Float64Array(n);for(let i=0;i<n;i++)w[i]=.5-.5*Math.cos(2*Math.PI*i/n);hannCache.set(n,w);}return w;}
/** In-place iterative radix-2 FFT. */
function fft(re,im){
  const n=re.length;
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}
  for(let len=2;len<=n;len<<=1){
    const ang=-2*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang),half=len>>1;
    for(let i=0;i<n;i+=len){let cr=1,ci=0;
      for(let k=0;k<half;k++){const a=i+k,b=a+half,xr=re[b]*cr-im[b]*ci,xi=re[b]*ci+im[b]*cr;re[b]=re[a]-xr;im[b]=im[a]-xi;re[a]+=xr;im[a]+=xi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;}}
  }
}

/**
 * Welch spectrum (Hann, 50 % overlap, per-segment mean removed). db[k] is scaled so a sine of peak amplitude A
 * centred on bin k reads 20 log10(A) (same peak-dBFS convention as hum.js). nfft shrinks to the largest power of
 * two that fits short inputs (min 256).
 * @returns {{binHz:number, nfft:number, segments:number, db:Float64Array}}
 */
export function welchSpectrum(samples,sampleRate,{nfft=NFFT,overlap=.5}={}){
  if(!(finite(sampleRate)&&sampleRate>0))throw new RangeError('sampleRate must be a positive number');
  const n=samples?.length||0;
  let N=1<<Math.floor(Math.log2(Math.max(1,Math.min(nfft,n))));
  if(N<256)throw new RangeError('need at least 256 samples for a spectrum');
  const w=hann(N),hop=Math.max(1,Math.round(N*(1-overlap))),pow=new Float64Array(N/2+1),re=new Float64Array(N),im=new Float64Array(N);
  let wsum=0;for(let i=0;i<N;i++)wsum+=w[i];
  let segs=0;
  for(let s=0;s+N<=n;s+=hop){
    let mean=0;for(let i=0;i<N;i++){const v=samples[s+i];mean+=Number.isFinite(v)?v:0;}mean/=N;
    for(let i=0;i<N;i++){const v=samples[s+i];re[i]=((Number.isFinite(v)?v:0)-mean)*w[i];im[i]=0;}
    fft(re,im);for(let k=0;k<=N/2;k++)pow[k]+=re[k]*re[k]+im[k]*im[k];segs++;
  }
  const scale=(2/wsum)**2/segs,db=new Float64Array(N/2+1);
  for(let k=0;k<=N/2;k++)db[k]=10*Math.log10(Math.max(pow[k]*scale,1e-30));
  return {binHz:sampleRate/N,nfft:N,segments:segs,db};
}

function median(arr){const s=Float64Array.from(arr).sort();const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;}

/**
 * Frame features over [BAND_HZ]: peak (parabolic-interpolated frequency), band median, peak-to-median,
 * -3 dB width in bins, narrowband flag, totalDb (power sum / Hann ENBW, so a lone sine reads its peak dBFS) and
 * snrDb (total over a flat spectrum at the median level).
 */
export function analyzeSpectrum({binHz,db},{band=BAND_HZ}={}){
  const lo=Math.max(1,Math.ceil(band[0]/binHz)),hi=Math.min(db.length-2,Math.floor(band[1]/binHz));
  if(hi<=lo)throw new RangeError('spectrum does not cover the analysis band');
  let pk=lo,p=0;
  for(let k=lo;k<=hi;k++){if(db[k]>db[pk])pk=k;p+=10**(db[k]/10);}
  const a=db[pk-1],b=db[pk],c=db[pk+1],den=a-2*b+c,off=den<0?Math.max(-.5,Math.min(.5,.5*(a-c)/den)):0;
  let l=pk,r=pk;while(l>lo&&db[l-1]>=b-3)l--;while(r<hi&&db[r+1]>=b-3)r++;
  const med=median(db.subarray(lo,hi+1)),widthBins=r-l+1,totalDb=10*Math.log10(Math.max(p/1.5,1e-30));
  const noiseTotal=10*Math.log10(Math.max(10**(med/10)*(hi-lo+1)/1.5,1e-30));
  return {peakBin:pk,peakHz:(pk+off)*binHz,peakDb:b,medianDb:med,peakToMedianDb:b-med,widthBins,narrow:widthBins<NARROW_MAX_BINS,totalDb,snrDb:totalDb-noiseTotal};
}

/** One analysis frame (a WINDOW_SEC window of input) tagged with the output level that was playing. */
export function spectrumFrame(samples,sampleRate,{tSec=0,levelDbfs=null,levelStable=true,stepIndex=null}={}){
  const sp=welchSpectrum(samples,sampleRate);
  return {tSec,levelDbfs,levelStable,stepIndex,binHz:sp.binHz,db:sp.db,...analyzeSpectrum(sp)};
}

const levelAt=(frame,bin)=>Math.max(frame.db[bin-1]??-Infinity,frame.db[bin],frame.db[bin+1]??-Infinity);
/** Input level at bin k relative to the output level that was playing (the loop transfer; output steps cancel). */
const transferAt=(frame,bin)=>levelAt(frame,bin)-(finite(frame.levelDbfs)?frame.levelDbfs:0);

/**
 * Howl detector (AC-5, FS-15 §6) over consecutive WINDOW_SEC frames from spectrumFrame. Levels are compared as
 * input minus the output level that was playing, so growth caused by the user's own 3 dB steps cancels and
 * "growth while output constant" holds across steps; windows in which the output changed are left out.
 * A) 'narrowbandGrowth' / 'sustainedGrowth': the latest window has a narrowband peak > 15 dB above the median
 *    that was already the strongest peak (+/-1 bin) of the previous stable window (a howl is sustained; music
 *    changes notes), and that bin grew in each of the last n >= 2 stable windows by more than GROWTH_DB in
 *    total (n = 2 is AC-5's "two consecutive 1 s windows"; longer runs catch slower, still runaway, growth);
 * B) 'stepJump': after a level step, total input level rose by more than (step + 6 dB), judged only when the
 *    previous step's input was STEP_JUMP_MIN_SNR_DB above the noise (so the test signal emerging from the
 *    noise floor is not a howl).
 * @returns {{onset:boolean, freqHz:number|null, growthDbPerS:number|null, reason:string|null, levelDbfs:number|null}}
 */
export function detectHowl(spectraHistory,{growthDb=GROWTH_DB,peakToMedianDb=PEAK_TO_MEDIAN_DB,stepJumpExtraDb=STEP_JUMP_EXTRA_DB}={}){
  const none={onset:false,freqHz:null,growthDbPerS:null,reason:null,levelDbfs:null};
  const h=spectraHistory||[];if(!h.length)return none;
  const cur=h[h.length-1];
  const stable=h.filter(f=>f.levelStable!==false);
  if(cur.levelStable!==false&&stable.length>=3&&cur.narrow&&cur.peakToMedianDb>peakToMedianDb){
    const k=cur.peakBin,prev=stable[stable.length-2];
    if(Math.abs(prev.peakBin-k)<=1){
      let i=stable.length-1;
      // walk back while each stable window grew; a gap of more than one skipped window breaks the run
      while(i>0&&stable[i].tSec-stable[i-1].tSec<=2.5*WINDOW_SEC&&transferAt(stable[i],k)>transferAt(stable[i-1],k))i--;
      const n=stable.length-1-i,first=stable[i],total=transferAt(cur,k)-transferAt(first,k);
      if(n>=2&&total>growthDb){
        const dt=cur.tSec-first.tSec>0?cur.tSec-first.tSec:n*WINDOW_SEC;
        return {onset:true,freqHz:cur.peakHz,growthDbPerS:total/dt,reason:n===2?'narrowbandGrowth':'sustainedGrowth',levelDbfs:cur.levelDbfs};
      }
    }
  }
  if(finite(cur.levelDbfs)){
    let prev=null;
    for(let i=h.length-2;i>=0;i--){const f=h[i];if(finite(f.levelDbfs)&&f.levelDbfs<cur.levelDbfs-.01){if(f.levelStable!==false){prev=f;}break;}}
    if(prev&&prev.snrDb>=STEP_JUMP_MIN_SNR_DB){
      const stepUp=cur.levelDbfs-prev.levelDbfs,rise=cur.totalDb-prev.totalDb;
      if(rise>stepUp+stepJumpExtraDb){
        const dt=cur.tSec-prev.tSec>0?cur.tSec-prev.tSec:WINDOW_SEC;
        return {onset:true,freqHz:cur.peakHz,growthDbPerS:(rise-stepUp)/dt,reason:'stepJump',levelDbfs:cur.levelDbfs};
      }
    }
  }
  return none;
}

/** Booth/monitor guidance from the onset frequency (FS-15 §6). Advice, not measurements. */
export function feedbackGuidance(freqHz){
  if(!finite(freqHz)||freqHz<=0)return [];
  if(freqHz<LOW_FREQ_HZ)return [
    'Decouple the turntables: isolation feet or a heavier, stiffer base.',
    'Move the booth monitor off the surface the decks stand on.',
    'Lower the bass on the booth monitor.',
    'High-pass the booth monitor at about 80-100 Hz.'];
  return [
    'Aim the booth monitors away from the cartridges and microphones.',
    'Increase the distance between the monitors and the decks.',
    'Use cardioid placement: put the monitor behind the null of the pickup.'];
}

// ---- run controller ----

const TONE_TYPES=['sine','pinkband'];
const ABORT_STATES=new Set(['stopping','stopped','done','error']);

/**
 * Feedback step test controller. The UI feeds captured input with pushInput(), calls nextStep() on the user's
 * confirmation, stop() on STOP/Esc (AC-6) and finish() to end normally. The watchdog (injectable timers) mutes on
 * missing input and inactivity.
 * @param {object} o
 * @param {object} o.audio createAudioOut() bridge (playTone/setLevel/stop/stopAll)
 * @param {object} [o.plan] stepPlan() result (default plan if omitted)
 * @param {{type:'sine'|'pinkband', freqHz:number}} [o.tone]
 * @param {string|null} [o.device]
 * @param {function():number} [o.now] ms clock
 * @param {function} [o.setInterval] / [o.clearInterval]
 * @param {function(object):void} [o.onChange] called with snapshot() after every state change
 */
export function createFeedbackTest({audio,plan=stepPlan(),tone={type:'sine',freqHz:63},device=null,now=()=>Date.now(),
  setInterval:setI=globalThis.setInterval,clearInterval:clearI=globalThis.clearInterval,onChange=()=>{},
  minStepDwellMs=MIN_STEP_DWELL_MS,noInputMs=NO_INPUT_MS,inactivityMs=INACTIVITY_MS,rampMs=TONE_RAMP_MS}={}){
  if(!audio)throw new TypeError('audio bridge required');
  if(!plan?.levels?.length)throw new RangeError('plan has no levels');
  if(!TONE_TYPES.includes(tone?.type))throw new RangeError(`tone type must be one of ${TONE_TYPES.join(', ')}`);
  if(!(finite(tone.freqHz)&&tone.freqHz>0))throw new RangeError('tone.freqHz must be a positive number');
  // the plan may come from anywhere: never trust its cap or levels beyond the audio_out caps
  const cap=effectiveCapDbfs(plan.capDbfs);
  const levels=plan.levels.map(l=>clampLevelDbfs(l,cap));

  let state='idle',handle=null,stepIndex=-1,error=null,reason=null,onset=null,stopResult=null,stopPromise=null,timer=null;
  let lastInputAt=0,lastActionAt=0,stepStartedAt=0,sampleRate=null,pending=[],pendingLen=0,consumed=0,levelChangedAt=0;
  const history=[],steps=[];
  const emit=()=>{try{onChange(snapshot());}catch{/* UI callback errors never affect safety */}};
  const currentLevel=()=>stepIndex>=0?levels[stepIndex]:null;

  function snapshot(){
    return {state,stepIndex,levelDbfs:currentLevel(),capDbfs:cap,levels:[...levels],atCap:stepIndex===levels.length-1,reason,onset,error,
      lastFrame:history.length?summary(history[history.length-1]):null};
  }
  const summary=f=>({tSec:f.tSec,levelDbfs:f.levelDbfs,peakHz:f.peakHz,peakDb:f.peakDb,peakToMedianDb:f.peakToMedianDb,totalDb:f.totalDb,narrow:f.narrow});

  function startWatchdog(){if(typeof setI==='function'&&timer===null)timer=setI(()=>tick(),WATCHDOG_MS);}
  function stopWatchdog(){if(timer!==null){try{clearI?.(timer);}catch{}timer=null;}}

  /** Every abort path: state changes synchronously, then output is stopped (never throws). */
  function abort(why,detail={}){
    if(ABORT_STATES.has(state))return stopPromise??Promise.resolve(stopResult);
    const wasStarting=state==='starting';
    reason=why;if(detail.onset)onset=detail.onset;if(detail.error)error=detail.error;
    state='stopping';stopWatchdog();emit();
    if(wasStarting&&handle===null){
      // playTone still pending: start() stops the handle as soon as it arrives; stopAll now as well.
      stopPromise=rampToSilence(audio,null).then(r=>{stopResult=r;return r;});
      return stopPromise;
    }
    stopPromise=rampToSilence(audio,handle).then(r=>{
      stopResult=r;state=why==='finished'?'done':why==='outputError'||why==='startError'?'error':'stopped';emit();return r;
    });
    return stopPromise;
  }

  async function start(){
    if(state!=='idle')throw new Error(`feedback test already ${state}`);
    state='starting';stepIndex=0;lastActionAt=lastInputAt=stepStartedAt=now();emit();
    let info;
    try{
      info=await audio.playTone({type:tone.type,freqHz:tone.freqHz,levelDbfs:levels[0],capDbfs:cap,rampMs},{device});
    }catch(e){
      error={code:e?.code??'AUDIO_OUT_ERROR',message:String(e?.message??e)};
      if(state==='starting'){reason='startError';state='stopping';emit();}
      stopResult=await rampToSilence(audio,null);state='error';emit();
      return snapshot();
    }
    handle=info?.handle??null;
    if(state!=='starting'){
      // aborted while starting: silence the voice that just started
      stopResult=await rampToSilence(audio,handle);
      state=reason==='finished'?'done':'stopped';emit();return snapshot();
    }
    state='running';lastActionAt=lastInputAt=stepStartedAt=now();
    steps.push({index:0,levelDbfs:levels[0],frames:[]});
    startWatchdog();emit();
    return snapshot();
  }

  /** Raise one step on the user's confirmation (AC-4). Never beyond the last planned level. */
  function nextStep(){
    if(state!=='running')return {ok:false,reason:'notRunning'};
    lastActionAt=now();
    if(stepIndex>=levels.length-1)return {ok:false,reason:'atCap',levelDbfs:currentLevel()};
    const waited=now()-stepStartedAt;
    if(waited<minStepDwellMs)return {ok:false,reason:'dwell',waitMs:minStepDwellMs-waited};
    const level=clampLevelDbfs(levels[stepIndex+1],cap);
    if(!(level<=cap))return {ok:false,reason:'atCap'};
    stepIndex++;stepStartedAt=now();levelChangedAt=consumed+pendingLen;
    steps.push({index:stepIndex,levelDbfs:level,frames:[]});
    const fail=e=>abort('outputError',{error:{code:e?.code??'AUDIO_OUT_ERROR',message:String(e?.message??e)}});
    try{Promise.resolve(audio.setLevel(handle,level,{capDbfs:cap})).catch(fail);}catch(e){fail(e);}
    if(state!=='running')return {ok:false,reason:'outputError'};
    emit();
    return {ok:true,levelDbfs:level,stepIndex};
  }

  /** User activity that is not a step (keeps the 60 s inactivity timer from muting). */
  function touch(){if(state==='running')lastActionAt=now();}

  /**
   * Captured input (mono samples of the booth mic / record out). Returns the howl detection for the newest
   * frame, or null when no full window was completed. Clipping input aborts at once.
   */
  function pushInput({samples,sampleRate:fs}={}){
    if(state!=='running'||!samples?.length)return null;
    if(!(finite(fs)&&fs>0))return null;
    lastInputAt=now();
    if(sampleRate!==null&&fs!==sampleRate){pending=[];pendingLen=0;history.length=0;}
    sampleRate=fs;
    for(let i=0;i<samples.length;i++){const v=samples[i];if(!(Math.abs(v)<CLIP_PEAK)){abort('inputClipping');return null;}}
    pending.push(Float32Array.from(samples));pendingLen+=samples.length;
    const win=Math.round(WINDOW_SEC*fs);let det=null;
    while(pendingLen>=win&&state==='running'){
      const buf=new Float32Array(win);let off=0;
      while(off<win){const head=pending[0],take=Math.min(head.length,win-off);buf.set(head.subarray(0,take),off);off+=take;
        if(take===head.length)pending.shift();else pending[0]=head.subarray(take);}
      pendingLen-=win;const start=consumed;consumed+=win;
      const frame=spectrumFrame(buf,fs,{tSec:consumed/fs,levelDbfs:currentLevel(),stepIndex,levelStable:levelChangedAt<=start});
      history.push(frame);if(history.length>HISTORY_FRAMES)history.shift();
      steps[steps.length-1]?.frames.push(summary(frame));
      det=detectHowl(history);
      if(det.onset){
        const o={stepIndex,levelDbfs:currentLevel(),freqHz:det.freqHz,growthDbPerS:det.growthDbPerS,reason:det.reason,tSec:frame.tSec};
        abort('howl',{onset:o});break;
      }
      emit();
    }
    return det;
  }

  /** Watchdog: mute on missing input (> noInputMs) or inactivity (> inactivityMs). */
  function tick(){
    if(state!=='running')return;
    const t=now();
    if(t-lastInputAt>noInputMs){abort('noInput');return;}
    if(t-lastActionAt>inactivityMs)abort('inactivity');
  }

  function result(){
    const reached=steps.map(s=>{const f=s.frames.filter(x=>x.levelDbfs===s.levelDbfs);const last=f[f.length-1]??null;
      return {index:s.index,levelDbfs:s.levelDbfs,totalDb:last?.totalDb??null,peakHz:last?.peakHz??null};});
    const stable=onset?reached.filter(s=>s.index<onset.stepIndex):reached;
    const lastStable=stable.length?stable[stable.length-1].levelDbfs:null;
    return {state,reason,capDbfs:cap,levels:[...levels],steps:reached,onset,
      lastStableLevelDbfs:lastStable,loopGainMarginDb:onset&&lastStable!==null?r2(onset.levelDbfs-lastStable):null,
      guidance:onset?feedbackGuidance(onset.freqHz):[],error};
  }

  return {
    start,nextStep,pushInput,tick,touch,result,snapshot,
    stop:()=>abort('user'),
    finish:()=>abort('finished'),
    dispose:()=>abort('disposed'),
    get state(){return state;},
    get handle(){return handle;}
  };
}

/** hum_run_save input for a finished feedback test (tests/contracts/humrun.json). */
export function feedbackRunInput(res,{venueId=null,sessionId=null,setupId=null}={}){
  const o=res.onset;
  const steps=res.steps.map(s=>{
    const isOnset=Boolean(o&&s.index===o.stepIndex);
    return {stepId:`level_${s.index+1}`,label:`Step ${s.index+1} (${s.levelDbfs} dBFS)`,levelDbfs:Math.min(s.levelDbfs,ABS_MAX_DBFS),
      totalDbfs:finite(s.totalDb)?r2(s.totalDb):null,peakHz:isOnset&&finite(o.freqHz)?r2(o.freqHz):finite(s.peakHz)?r2(s.peakHz):null,
      growthDbPerS:isOnset&&finite(o.growthDbPerS)?r2(o.growthDbPerS):null,onset:isOnset,skipped:false};
  });
  const verdict=o?`Feedback onset at ${o.freqHz.toFixed(1)} Hz on step ${o.stepIndex+1} (${o.levelDbfs} dBFS).`
    :res.reason==='finished'?`No feedback up to ${res.steps.length?res.steps[res.steps.length-1].levelDbfs:res.levels[0]} dBFS.`
    :`Stopped before feedback onset (${res.reason??'not run'}).`;
  return {sessionId,venueId,setupId,kind:'feedback',mainsHz:null,verdict,causes:[],steps};
}
