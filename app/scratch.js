// FS-14 Scratch stress test: platter velocity from the timecode quadrature phase, event detectors
// (reversals, lock loss, direction errors, needle skips), scoring, the versioned protocol with its
// metronome schedule, a WebAudio metronome with a fast mute, and the run-store bridge. Pure apart from
// the injected AudioContext / invoke / storage; no DOM. Thresholds are tunable defaults (FS-14 §6);
// skip thresholds in particular still need calibration on a sacrificial record.
import {dbfs} from './core.js';
import {TIMECODE_FORMATS,findFormat,analyzeTimecode,directionSign} from './timecode.js';
import {repeatabilityMetrics} from './diagnostics.js';

const TAU=2*Math.PI;
const wrap=x=>x-TAU*Math.round(x/TAU);
const finite=Number.isFinite;
const median=a=>{const v=a.filter(finite).sort((x,y)=>x-y);if(!v.length)return NaN;const m=v.length>>1;return v.length%2?v[m]:(v[m-1]+v[m])/2;};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));

/** Tunable defaults (FS-14 §6). Velocities are in units of nominal platter speed. */
export const SCRATCH_DEFAULTS=Object.freeze({
  winMs:5,hopMs:2.5,
  v0:.1,movePeak:.3,                 // reversal: through |v| < v0 between stretches with |v| > movePeak
  errorSpeed:.5,errorHops:2,         // direction error: sign flip with |v| > errorSpeed on both sides within errorHops hops
  lostSnrDb:10,dropDb:12,minLossMs:10,// lock lost: SNR < lostSnrDb or level < baseline - dropDb for >= minLossMs
  recoverSnrDb:20,stableMs:20,maxStep:.3,// recovered: SNR >= recoverSnrDb and |dv| <= maxStep per hop for stableMs
  slowSpeed:.5,                      // a dropout bracketed by |v| <= slowSpeed on both sides is a near-stop, not lost lock
  skipJumpDeg:90,skipDropDb:20,skipMinDropMs:2,skipMaxDropMs:50,skipMinSnrDb:15,skipFitMs:2,skipBridgeFitMs:5,
  baselineMinSnrDb:25,skipStopCount:3,
  metronomeDbfs:-24,metronomeMaxDbfs:-6,metronomeMinDbfs:-60
});

/** Protocol v1 (FS-14 §5). Scores are comparable only within one protocol version. */
export const PROTOCOL_V1=Object.freeze({v:1,bpm:90,countInBeats:4,performSec:20,restSec:5,beatsPerBar:4,
  patterns:Object.freeze([
    Object.freeze({id:'baby',label:'Baby scratch',beats:'1 fwd + 1 back per quarter'}),
    Object.freeze({id:'transform',label:'Transform',beats:'8th-note gate'}),
    Object.freeze({id:'chirp',label:'Chirp',beats:'half-note'})])});
export const EVENT_KINDS=Object.freeze(['reversal','lock_loss','direction_error','skip','recovery']);

function resolveFormat(format,formats){const f=typeof format==='string'?findFormat(format,formats):format;if(!f||!finite(f.carrierHz)||f.carrierHz<=0)throw new Error(`Unknown timecode format: ${typeof format==='string'?format:f?.name}`);return f;}

/**
 * Instantaneous velocity from the quadrature phase (FS-14 §6). Both channels are DC-removed and
 * orthonormalised over the whole capture (removes L/R gain mismatch and small phase errors), the
 * carrier phase phi = atan2(L, phaseSign * R'), phaseSign = directionSign(format) (primary channel x phase switch), is unwrapped per sample, and each window's velocity is the
 * least-squares phase slope / (2 pi f_c): +1 normal forward, -1 normal reverse. The slope at the window
 * centre is unbiased for constant acceleration (the quadratic term is orthogonal on a symmetric grid).
 * SNR per window is per-channel tone RMS over noise RMS, from the radial scatter of the normalised
 * phasor about a linear amplitude trend (independent of motion). level = min channel RMS (dBFS).
 * @returns {{t:Float64Array,v:Float64Array,snr:Float64Array,level:Float64Array,phase:Float64Array,blockLevel:Float32Array,
 *   blockSamples:number,sampleRate:number,winSamples:number,hopSamples:number,winMs:number,hopMs:number,carrierHz:number,
 *   phaseSign:number,format:string,quadratureCorrelation:number,levelBaselineDb:number,warnings:string[]}}
 *   t = window centres (s). phase = unwrapped carrier phase per sample (rad, direction-corrected).
 */
export function instantVelocity({left,right,sampleRate},{format,formats=TIMECODE_FORMATS,nominalRpm,winMs=SCRATCH_DEFAULTS.winMs,hopMs=SCRATCH_DEFAULTS.hopMs}={}){
  const fmt=resolveFormat(format,formats),sr=sampleRate;
  if(!finite(sr)||sr<=0)throw new Error('sampleRate must be positive');
  const n=Math.min(left?.length||0,right?.length||0),atRpm=fmt.atRpm||33.333333;
  const fc=fmt.carrierHz*(finite(nominalRpm)?nominalRpm:atRpm)/atRpm,sgn=directionSign(fmt),warnings=[]; // primary channel and phase switch together decide which channel leads on forward play
  const W=Math.max(8,Math.round(winMs*sr/1000)),H=Math.max(1,Math.round(hopMs*sr/1000)),count=n>=W?Math.floor((n-W)/H)+1:0;
  // Moments for DC removal and orthonormalisation come only from stretches where the carrier turns at
  // least one full cycle (found with a raw first-pass phase): a held or stopped record contributes a
  // fixed phasor that would bias the mean and the L/R scale.
  let mL=0,mR=0,sLL=0,sRR=0,sLR=0,used=0;
  {const seg=W;let p0=Math.atan2(left[0]||0,sgn*(right[0]||0)),acc=0,start=0;
    const take=(a,b)=>{let ml=0,mr=0;for(let i=a;i<b;i++){ml+=left[i];mr+=right[i];}mL+=ml;mR+=mr;for(let i=a;i<b;i++){sLL+=left[i]*left[i];sRR+=right[i]*right[i];sLR+=left[i]*right[i];}used+=b-a;};
    for(let i=1;i<=n;i++){if(i<n){const p=Math.atan2(left[i],sgn*right[i]);acc+=wrap(p-p0);p0=p;}
      if(i-start===seg||i===n){if(Math.abs(acc)>=TAU)take(start,i);start=i;acc=0;}}
    if(used<W){used=0;mL=mR=sLL=sRR=sLR=0;take(0,n);}
    mL/=used||1;mR/=used||1;sLL=sLL/(used||1)-mL*mL;sRR=sRR/(used||1)-mR*mR;sLR=sLR/(used||1)-mL*mR;}
  const gL=sLL>1e-24?1/Math.sqrt(sLL):0,gR=sRR>1e-24?1/Math.sqrt(sRR):0;let rho=gL&&gR?sLR*gL*gR:0;
  if(Math.abs(rho)>.95){warnings.push('channels-not-in-quadrature');rho=Math.sign(rho)*.95;}
  const k=1/Math.sqrt(1-rho*rho),phase=new Float64Array(n),radius=new Float32Array(n);
  let acc=0,prev=0;
  for(let i=0;i<n;i++){
    const I=(left[i]-mL)*gL,Q=((right[i]-mR)*gR-rho*I)*k,p=Math.atan2(I,sgn*Q);
    if(i)acc+=wrap(p-prev);prev=p;phase[i]=acc;radius[i]=Math.sqrt(I*I+Q*Q);
  }
  const c=(W-1)/2,Stt=W*(W*W-1)/12,toV=sr/(TAU*fc);
  const t=new Float64Array(count),v=new Float64Array(count),snr=new Float64Array(count),level=new Float64Array(count);
  for(let w=0;w<count;w++){
    const s0=w*H,ref=phase[s0+Math.floor(c)];let sp=0,sr0=0,sr1=0,sr2=0,eL=0,eR=0;
    for(let i=0;i<W;i++){const x=i-c,j=s0+i,r=radius[j],a=left[j]-mL,b=right[j]-mR;sp+=x*(phase[j]-ref);sr0+=r;sr1+=x*r;sr2+=r*r;eL+=a*a;eR+=b*b;}
    t[w]=(s0+c)/sr;v[w]=sp/Stt*toV;
    const mean=sr0/W,slope=sr1/Stt,vr=sr2/W-mean*mean-slope*slope*Stt/W;
    snr[w]=mean<1e-9?-Infinity:vr<=1e-12*mean*mean?120:Math.min(120,10*Math.log10(mean*mean/(2*vr)));
    level[w]=dbfs(Math.sqrt(Math.min(eL,eR)/W));
  }
  const B=Math.max(1,Math.round(sr/1000)),nb=Math.floor(n/B),blockLevel=new Float32Array(nb);
  for(let b=0;b<nb;b++){let eL=0,eR=0;for(let j=b*B;j<(b+1)*B;j++){const a=left[j]-mL,r=right[j]-mR;eL+=a*a;eR+=r*r;}blockLevel[b]=dbfs(Math.sqrt(Math.min(eL,eR)/B));}
  const lv=Array.from(level).filter(finite).sort((a,b)=>a-b),levelBaselineDb=lv.length?lv[Math.floor(lv.length*.75)]:-240;
  return {t,v,snr,level,phase,blockLevel,blockSamples:B,sampleRate:sr,winSamples:W,hopSamples:H,winMs:W*1000/sr,hopMs:H*1000/sr,
    carrierHz:fc,phaseSign:sgn,format:fmt.name,quadratureCorrelation:rho,levelBaselineDb,warnings};
}

const opt=o=>({...SCRATCH_DEFAULTS,...o});
const baseLevel=(trace,o)=>finite(o.baselineLevelDb)?o.baselineLevelDb:trace.levelBaselineDb;
/** Window index range [a, b) whose centres fall in [fromSec, toSec). */
function range(trace,o){const t=trace.t,from=finite(o.fromSec)?o.fromSec:-Infinity,to=finite(o.toSec)?o.toSec:Infinity;let a=0;while(a<t.length&&t[a]<from)a++;let b=a;while(b<t.length&&t[b]<to)b++;return [a,b];}
const goodWindow=(trace,k,o,lvl)=>trace.snr[k]>=o.lostSnrDb&&trace.level[k]>=lvl-o.dropDb;
const lerpT=(t0,v0,t1,v1,x)=>v1===v0?(t0+t1)/2:t0+(x-v0)/(v1-v0)*(t1-t0);

/**
 * Reversals and direction errors in one pass over valid windows (FS-14 §6). A sign change between
 * moving windows (|v| > movePeak) is a direction error when the last |v| > errorSpeed window before it and
 * the first after it are at most errorHops hops apart (the platter cannot reverse that fast, so the
 * estimate flipped); a flip that flips back within 2 windows (winMs each) is one glitch. Otherwise it is
 * a reversal, timed at the midpoint of the |v| < v0 stretch (or the interpolated zero crossing).
 */
export function analyzeMotion(trace,options={}){
  const o=opt(options),lvl=baseLevel(trace,o),{t,v}=trace,[a,b]=range(trace,o),hop=trace.hopMs/1000,win=trace.winMs/1000;
  const valid=[];for(let k=a;k<b;k++)if(goodWindow(trace,k,o,lvl))valid.push(k);
  const runs=[];let cur=null;
  for(let i=0;i<valid.length;i++){const k=valid[i],x=v[k];if(Math.abs(x)<=o.movePeak)continue;const s=Math.sign(x);
    if(cur&&cur.sign===s){cur.last=i;if(Math.abs(x)>Math.abs(cur.peak))cur.peak=x;}else{cur={sign:s,first:i,last:i,peak:x};runs.push(cur);}}
  const fast=(r,fromEnd)=>{if(fromEnd){for(let i=r.last;i>=r.first;i--)if(Math.abs(v[valid[i]])>o.errorSpeed)return valid[i];}else{for(let i=r.first;i<=r.last;i++)if(Math.abs(v[valid[i]])>o.errorSpeed)return valid[i];}return -1;};
  const impossible=(r1,r2)=>{const e1=fast(r1,true),e2=fast(r2,false);return e1>=0&&e2>=0&&t[e2]-t[e1]<=o.errorHops*hop+1e-9;};
  const reversals=[],errors=[];
  for(let j=1;j<runs.length;j++){
    const A=runs[j-1],B=runs[j];
    if(impossible(A,B)){
      const C=runs[j+1],glitch=C&&t[valid[C.first]]-t[valid[B.first]]<=2*win+1e-9&&impossible(B,C);
      errors.push({tSec:t[valid[B.first]],durationMs:glitch?(t[valid[C.first]]-t[valid[B.first]])*1000:null,value:B.peak,sustained:!glitch});
      if(glitch){C.peak=Math.abs(C.peak)>=Math.abs(A.peak)?C.peak:A.peak;j++;}
      continue;
    }
    const iA=A.last,iB=B.first;
    let enter=null,exit=null;
    for(let i=iA+1;i<iB;i++){const k=valid[i];if(Math.abs(v[k])<o.v0){const p=valid[i-1],q=valid[i];if(enter===null)enter=Math.abs(v[p])>=o.v0?lerpT(t[p],Math.abs(v[p]),t[q],Math.abs(v[q]),o.v0):t[q];const r=valid[i+1];exit=r!==undefined&&Math.abs(v[r])>=o.v0?lerpT(t[q],Math.abs(v[q]),t[r],Math.abs(v[r]),o.v0):t[q];}}
    let tSec;
    if(enter!==null)tSec=(enter+exit)/2;
    else{tSec=(t[valid[iA]]+t[valid[iB]])/2;for(let i=iA;i<iB;i++){const p=valid[i],q=valid[i+1];if(Math.sign(v[p])!==Math.sign(v[q])&&v[q]!==0){tSec=lerpT(t[p],v[p],t[q],v[q],0);break;}}}
    const p0=valid[iA],p1=valid[iA+1],q1=valid[iB],q0=valid[iB-1];
    const out=lerpT(t[p0],Math.abs(v[p0]),t[p1],Math.abs(v[p1]),o.movePeak),inn=lerpT(t[q0],Math.abs(v[q0]),t[q1],Math.abs(v[q1]),o.movePeak);
    reversals.push({tSec,durationMs:Math.max(0,inn-out)*1000,fromSign:A.sign,peakBefore:A.peak,peakAfter:B.peak,peak:Math.max(Math.abs(A.peak),Math.abs(B.peak))});
  }
  let peakVelocity=0;for(const r of runs)if(Math.abs(r.peak)>Math.abs(peakVelocity))peakVelocity=r.peak;
  return {reversals,directionErrors:errors,peakVelocity,validWindows:valid.length,windows:b-a};
}
/** Direction reversals: [{tSec, durationMs, fromSign, peakBefore, peakAfter, peak}]. */
export function detectReversals(trace,options={}){return analyzeMotion(trace,options).reversals;}
/** Direction errors (FS-14 AC-4): [{tSec, durationMs|null, value, sustained}]. */
export function detectDirectionErrors(trace,options={}){return analyzeMotion(trace,options).directionErrors;}

/**
 * Lost-lock periods (FS-14 AC-3): runs of windows with SNR < lostSnrDb or level < baseline - dropDb,
 * lasting >= minLossMs after edge refinement on 1 ms blocks (level-caused edges). Runs closer than
 * minLossMs merge. Runs bracketed (on every side the trace has) by |v| <= slowSpeed are a near-stop (a real cartridge's
 * output falls with speed), not lost lock. recoveryMs = loss end to the start of the first stableMs stretch
 * with SNR >= recoverSnrDb, level ok and |dv| <= maxStep per hop; null when it never recovers.
 * @returns {Array<{startSec,endSec,durationMs,recoveryMs:number|null,recoveredSec:number|null,cause:'level'|'snr',vBefore:number|null,vAfter:number|null}>}
 */
export function detectLockLoss(trace,options={}){
  const o=opt(options),lvl=baseLevel(trace,o),thr=lvl-o.dropDb,{t,v,snr,level}=trace,[a,b]=range(trace,o),hop=trace.hopMs/1000,win=trace.winMs/1000;
  const bad=k=>snr[k]<o.lostSnrDb||level[k]<thr;
  const raw=[];for(let k=a;k<b;k++){if(!bad(k))continue;const last=raw[raw.length-1];if(last&&last.j===k-1)last.j=k;else raw.push({i:k,j:k});}
  const B=trace.blockSamples,sr=trace.sampleRate,bl=trace.blockLevel;
  const spans=raw.map(r=>{
    let start=t[r.i]-hop/2,end=t[r.j]+hop/2,cause='snr';
    for(let k=r.i;k<=r.j;k++)if(level[k]<thr){cause='level';break;}
    if(cause==='level'&&bl.length){
      const b0=Math.max(0,Math.floor((t[r.i]-win)*sr/B)),b1=Math.min(bl.length-1,Math.ceil((t[r.j]+win)*sr/B));let f=-1,l=-1;
      for(let q=b0;q<=b1;q++)if(bl[q]<thr){if(f<0)f=q;l=q;}
      if(f>=0){start=f*B/sr;end=(l+1)*B/sr;}
    }
    return {i:r.i,j:r.j,start,end,cause};
  });
  const merged=[];for(const s of spans){const last=merged[merged.length-1];if(last&&(s.start-last.end)*1000<o.minLossMs){last.j=s.j;last.end=Math.max(last.end,s.end);if(s.cause==='level')last.cause='level';}else merged.push({...s});}
  const S=Math.max(1,Math.ceil(o.stableMs/trace.hopMs)),good=k=>snr[k]>=o.recoverSnrDb&&level[k]>=thr;
  const out=[];
  for(let m=0;m<merged.length;m++){
    const s=merged[m];if((s.end-s.start)*1000<o.minLossMs-1e-9)continue;
    let kb=s.i-1;while(kb>=a&&bad(kb))kb--;let ka=s.j+1;while(ka<b&&bad(ka))ka++;
    const vBefore=kb>=a?v[kb]:null,vAfter=ka<b?v[ka]:null;
    const bracket=[vBefore,vAfter].filter(x=>x!==null);
    if(bracket.length&&bracket.every(x=>Math.abs(x)<=o.slowSpeed))continue;
    const limit=m+1<merged.length?merged[m+1].i:b;let rec=null;
    for(let k=s.j+1;k+S<=limit&&rec===null;k++){let ok=true;for(let q=k;q<k+S&&ok;q++)ok=good(q)&&(q===k||Math.abs(v[q]-v[q-1])<=o.maxStep);if(ok)rec=k;}
    const recoveredSec=rec===null?null:Math.max(s.end,t[rec]-win/2);
    out.push({startSec:s.start,endSec:s.end,durationMs:(s.end-s.start)*1000,recoveryMs:recoveredSec===null?null:(recoveredSec-s.end)*1000,recoveredSec,cause:s.cause,vBefore,vAfter});
  }
  return out;
}

function lineAt(phase,from,to,at){// least-squares line through phase[from..to) evaluated at sample position `at`
  const m=to-from,c=from+(m-1)/2,ref=phase[Math.floor(c)];let sxy=0,sy=0;for(let i=from;i<to;i++){const y=phase[i]-ref;sy+=y;sxy+=(i-c)*y;}
  return {value:ref+sy/m+sxy/(m*(m*m-1)/12)*(at-c),slope:sxy/(m*(m*m-1)/12)};
}
/**
 * Phase step across a gap: one cubic phase trajectory (velocity with curvature) plus a step at `mid`,
 * least-squares on the samples of `spans` (every `stride`-th). Returns the step (rad, unwrapped
 * difference; callers wrap it) and its standard error, or null when the fit is singular.
 */
function phaseStep(phase,spans,mid,sr,stride=2){
  const A=Array.from({length:5},()=>new Float64Array(5)),y=new Float64Array(5),ref=phase[spans[0][1]-1],rows=[];
  for(const [a,b] of spans)for(let i=a;i<b;i+=stride){const tau=(i-mid)*1000/sr,x=[1,tau,tau*tau,tau*tau*tau,i>=mid?1:0],z=phase[i]-ref;rows.push([x,z]);
    for(let r=0;r<5;r++){y[r]+=x[r]*z;for(let q=0;q<5;q++)A[r][q]+=x[r]*x[q];}}
  const inv=Array.from({length:5},(_,r)=>{const e=new Float64Array(5);e[r]=1;return e;});
  for(let col=0;col<5;col++){let p=col;for(let r=col+1;r<5;r++)if(Math.abs(A[r][col])>Math.abs(A[p][col]))p=r;
    if(Math.abs(A[p][col])<1e-12)return null;[A[col],A[p]]=[A[p],A[col]];[inv[col],inv[p]]=[inv[p],inv[col]];
    const d=A[col][col];for(let q=0;q<5;q++){A[col][q]/=d;inv[col][q]/=d;}
    for(let r=0;r<5;r++)if(r!==col){const f=A[r][col];if(f)for(let q=0;q<5;q++){A[r][q]-=f*A[col][q];inv[r][q]-=f*inv[col][q];}}}
  const beta=inv.map(row=>row.reduce((s,v,q)=>s+v*y[q],0));let ss=0;
  for(const [x,z] of rows){let f=0;for(let q=0;q<5;q++)f+=beta[q]*x[q];ss+=(z-f)**2;}
  const s2=ss/Math.max(1,rows.length-5);
  return {step:beta[4],stdErr:Math.sqrt(Math.max(0,s2*inv[4][4]*stride))};
}
function lfLevelDb(x,sr,from,to){let best=0;const n=to-from;if(n<sr*.1)return -240;let m=0;for(let i=from;i<to;i++)m+=x[i];m/=n;
  for(let f=8;f<=20;f+=2){let re=0,im=0;const w=TAU*f/sr;for(let i=from;i<to;i++){const y=x[i]-m;re+=y*Math.cos(w*(i-from));im-=y*Math.sin(w*(i-from));}best=Math.max(best,2*Math.hypot(re,im)/n);}
  return dbfs(best);}

/**
 * Needle skips (FS-14 AC-5, §6): a carrier phase discontinuity not explained by smooth motion
 * (|jump| > skipJumpDeg, measured between line fits on skipFitMs of phase either side), either within
 * continuous signal or across a short level drop (skipMinDropMs..skipMaxDropMs below baseline -
 * skipDropDb) when one smooth cubic phase trajectory (velocity with curvature) fitted on skipBridgeFitMs
 * either side predicts the gap well enough (step standard error < skipJumpDeg / 6). Evidence of a level drop and of an
 * 8-20 Hz ringing burst afterwards (needs `capture`; read from the audio, so a nearby reversal, whose
 * carrier itself passes through low frequencies, can mask or mimic it) raises confidence. Thresholds are uncalibrated
 * defaults. Jumps that are near whole carrier cycles are invisible to any phase method.
 * @returns {Array<{tSec,phaseJumpDeg,levelDrop:boolean,dropMs:number|null,ringing:boolean|null,confidence:number}>}
 */
export function detectSkips(trace,options={},capture=null){
  const o=opt(options),lvl=baseLevel(trace,o),thr=lvl-o.skipDropDb,lossThr=lvl-o.dropDb,{phase,blockLevel:bl,blockSamples:B,sampleRate:sr,t,v,snr}=trace;
  const n=phase.length,M=Math.max(8,Math.round(o.skipFitMs*sr/1000)),jump=o.skipJumpDeg*Math.PI/180,w=TAU*trace.carrierHz/sr;
  const from=finite(o.fromSec)?Math.max(0,Math.round(o.fromSec*sr)):0,to=finite(o.toSec)?Math.min(n,Math.round(o.toSec*sr)):n;
  const H=trace.hopSamples,c=(trace.winSamples-1)/2,winAt=i=>clamp(Math.round((i-c)/H),0,t.length-1);
  const blockOk=(i0,i1,th)=>{for(let q=Math.max(0,Math.floor(i0/B));q<=Math.min(bl.length-1,Math.floor((i1-1)/B));q++)if(!(bl[q]>=th))return false;return true;};
  const found=[];
  // (1) level drops bridged by phase extrapolation
  for(let q=Math.max(0,Math.floor(from/B));q<Math.min(bl.length,Math.ceil(to/B));q++){
    if(!(bl[q]<thr))continue;let e=q;while(e+1<bl.length&&bl[e+1]<thr)e++;
    const g0=q*B,g1=(e+1)*B,dropMs=(g1-g0)*1000/sr;q=e;
    if(dropMs<o.skipMinDropMs||dropMs>o.skipMaxDropMs)continue;
    const F=Math.round(o.skipBridgeFitMs*sr/1000),l0=g0-B-F,l1=g0-B,r0=g1+B,r1=g1+B+F;if(l0<0||r1>n||!blockOk(l0,l1,lossThr)||!blockOk(r0,r1,lossThr))continue;
    const mid=(g0+g1)/2,fit=phaseStep(phase,[[l0,l1],[r0,r1]],mid,sr);if(!fit)continue;
    const d=wrap(fit.step);
    // bridge only when the motion is smooth enough to predict across the gap (standard error < jump / 6)
    if(fit.stdErr<jump/6&&Math.abs(d)>jump)found.push({i:Math.round(mid),phaseJumpDeg:d*180/Math.PI,levelDrop:true,dropMs});
  }
  // (2) discontinuities inside continuous signal
  for(let i=Math.max(from,M+1);i<Math.min(to,n-M);i++){
    const k=winAt(i),exp=w*v[k],d=phase[i]-phase[i-1]-exp;
    if(Math.abs(d)<jump/2)continue;
    if(snr[k]<o.skipMinSnrDb||!blockOk(i-M,i+M,lossThr))continue;
    const L=lineAt(phase,i-M,i,i-.5),R=lineAt(phase,i,i+M,i-.5),j=wrap(R.value-L.value);
    if(Math.abs(j)>jump){
      let low=false;for(let q=Math.max(0,Math.floor((i-5*sr/1000)/B));q<=Math.min(bl.length-1,Math.floor((i+5*sr/1000)/B));q++)if(bl[q]<thr)low=true;
      found.push({i,phaseJumpDeg:j*180/Math.PI,levelDrop:low,dropMs:null});i+=M;
    }
  }
  found.sort((x,y)=>x.i-y.i);
  const out=[];
  for(const f of found){
    const last=out[out.length-1];if(last&&Math.abs(f.i-last.i)<10*sr/1000){if(f.levelDrop&&!last.levelDrop){last.levelDrop=true;last.dropMs=f.dropMs;}continue;}
    out.push({...f});
  }
  return out.map(f=>{
    let ringing=null;
    if(capture?.left&&capture?.right){// 8-20 Hz burst in the 250 ms after the event vs the 250 ms before (10 ms guard)
      const N=Math.round(.25*sr),G=Math.round(.01*sr),L=capture.left,Rr=capture.right,mono=(a,b)=>{const out=new Float32Array(Math.max(0,b-a));for(let i=a;i<b;i++)out[i-a]=(L[i]+Rr[i])/2;return out;};
      const pre=mono(Math.max(0,f.i-G-N),Math.max(0,f.i-G)),post=mono(Math.min(n,f.i+G),Math.min(n,f.i+G+N));
      const before=lfLevelDb(pre,sr,0,pre.length),after=lfLevelDb(post,sr,0,post.length);
      ringing=after>-60&&after>before+6;}
    return {tSec:f.i/sr,phaseJumpDeg:f.phaseJumpDeg,levelDrop:f.levelDrop,dropMs:f.dropMs,ringing,confidence:Math.min(1,.5+(f.levelDrop?.3:0)+(ringing?.2:0))};
  });
}

/**
 * Score 0-100 with components (FS-14 §6, tunable; mirrors SPEC-02 s13.4): continuity 30 (1 - lost time /
 * active time), recovery 20 (median <= 20 ms full, >= 200 ms zero; unrecovered counts as >= 200 ms),
 * direction accuracy 25 (errors per reversal, 0.25 or more = zero), signal stability 15 (median SNR 25 dB
 * full, 15 dB zero), skips 10 (any skip = 0 and caps the total at 60). Metronome adherence is not scored.
 * @param {{activeSec:number,lossSec:number,recoveryMs:Array<number|null>,reversals:number,directionErrors:number,medianSnrDb:number,skips:number}} e
 */
export function scoreScratch(e={},protocol=PROTOCOL_V1){
  const active=Math.max(0,+e.activeSec||0),loss=Math.max(0,+e.lossSec||0),rec=(e.recoveryMs||[]).map(x=>x==null||!finite(x)?Infinity:Math.max(0,x));
  const revs=Math.max(0,+e.reversals||0),errs=Math.max(0,+e.directionErrors||0),skips=Math.max(0,+e.skips||0);
  const continuityRatio=active>0?clamp(1-loss/active,0,1):0;
  const medRec=rec.length?median(rec.map(x=>x===Infinity?1e9:x)):0;
  const recoveryRatio=clamp((200-medRec)/180,0,1);
  const errRate=errs===0?0:revs>0?errs/revs:Infinity,directionRatio=clamp(1-errRate/.25,0,1);
  const snrRatio=finite(e.medianSnrDb)?clamp((e.medianSnrDb-15)/10,0,1):0;
  const comp=(max,ratio,value,unit)=>({points:max*ratio,max,value,unit});
  const components={continuity:comp(30,continuityRatio,continuityRatio*100,'%'),recovery:comp(20,recoveryRatio,rec.length?medRec:null,'ms'),
    direction:comp(25,directionRatio,finite(errRate)?errRate:null,'errors/reversal'),stability:comp(15,snrRatio,finite(e.medianSnrDb)?e.medianSnrDb:null,'dB'),
    skips:comp(10,skips?0:1,skips,'count')};
  let total=0;for(const c of Object.values(components))total+=c.points;
  const capped=skips>0&&total>60;if(skips>0)total=Math.min(60,total);
  return {score:Math.round(total*10)/10,components,capped,protocolVersion:protocol?.v??1};
}

/** Pattern timeline in capture time: count-in, perform window, rest, per pattern. */
export function protocolTimeline(bpm=PROTOCOL_V1.bpm,{protocol=PROTOCOL_V1,startSec=0}={}){
  if(!finite(bpm)||bpm<30||bpm>300)throw new Error('BPM must be between 30 and 300');
  const beat=60/bpm;let at=startSec;const patterns=[];
  for(const p of protocol.patterns){const countInStart=at,performStart=at+protocol.countInBeats*beat,performEnd=performStart+protocol.performSec,restEnd=performEnd+protocol.restSec;
    patterns.push({id:p.id,label:p.label,countInStart,performStart,performEnd,restEnd});at=restEnd;}
  return {bpm,beatSec:beat,patterns,totalSec:at-startSec};
}

/**
 * Metronome clicks (FS-14 AC-1): count-in clicks then one click per beat for the perform window, no
 * clicks in rests. Times are computed as start + i * 60 / bpm (no accumulation drift).
 * @param {number} bpm
 * @param {string|null} [pattern] one pattern id, or null for the whole protocol.
 * @returns {Array<{tSec:number,pattern:string,beat:number,countIn:boolean,accent:boolean}>} beat < 0 for count-in.
 */
export function metronomeSchedule(bpm=PROTOCOL_V1.bpm,pattern=null,{protocol=PROTOCOL_V1,startSec=0}={}){
  const tl=protocolTimeline(bpm,{protocol,startSec}),beat=60/bpm,out=[];
  if(pattern&&!tl.patterns.some(p=>p.id===pattern))throw new Error(`Unknown pattern: ${pattern}`);
  for(const p of tl.patterns){
    if(pattern&&p.id!==pattern)continue;
    for(let i=0;i<protocol.countInBeats;i++)out.push({tSec:p.countInStart+i*beat,pattern:p.id,beat:i-protocol.countInBeats,countIn:true,accent:i===0});
    for(let i=0;;i++){const tSec=p.performStart+i*beat;if(tSec>=p.performEnd-1e-9)break;out.push({tSec,pattern:p.id,beat:i,countIn:false,accent:i%protocol.beatsPerBar===0});}
  }
  if(pattern&&out.length){const t0=out[0].tSec-startSec;for(const c of out)c.tSec-=t0;}
  return out;
}

/** Metronome level guard: default -24 dBFS, never above -6 dBFS (FS-14 §7). */
export function clampMetronomeDbfs(db){return finite(db)?clamp(db,SCRATCH_DEFAULTS.metronomeMinDbfs,SCRATCH_DEFAULTS.metronomeMaxDbfs):SCRATCH_DEFAULTS.metronomeDbfs;}

/**
 * WebAudio metronome with look-ahead scheduling. stop() ramps the master gain to 0 over 10 ms, stops
 * every scheduled click within 12 ms and cancels the scheduler, so Esc is silent well inside 100 ms
 * (FS-14 AC-7). setMuted(true) (the M key) silences without stopping the schedule.
 * @param {{audioContext:AudioContext, levelDbfs?:number, lookaheadSec?:number, tickMs?:number, timers?:{setInterval:Function,clearInterval:Function}, destination?:AudioNode}} o
 */
export function createMetronome({audioContext:ctx,levelDbfs=SCRATCH_DEFAULTS.metronomeDbfs,lookaheadSec=.1,tickMs=25,timers=globalThis,destination}={}){
  if(!ctx)throw new Error('createMetronome needs an AudioContext');
  const level=10**(clampMetronomeDbfs(levelDbfs)/20),master=ctx.createGain();master.gain.value=level;master.connect(destination||ctx.destination);
  let clicks=[],next=0,t0=0,timer=null,muted=false,running=false;const live=new Set();
  const schedule=()=>{const horizon=ctx.currentTime+lookaheadSec;
    while(next<clicks.length&&t0+clicks[next].tSec<=horizon){const c=clicks[next++],at=Math.max(ctx.currentTime,t0+c.tSec);
      const osc=ctx.createOscillator(),env=ctx.createGain();osc.frequency.value=c.accent?1500:1000;env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(1,at+.002);env.gain.exponentialRampToValueAtTime(.001,at+.03);
      osc.connect(env);env.connect(master);osc.start(at);osc.stop(at+.035);live.add(osc);osc.onended=()=>{live.delete(osc);try{env.disconnect();}catch{}};}
    if(next>=clicks.length&&!live.size)stopTimer();};
  const stopTimer=()=>{if(timer!==null){timers.clearInterval(timer);timer=null;}};
  return {
    start(list,{leadSec=.05}={}){this.stop();clicks=[...list].sort((a,b)=>a.tSec-b.tSec);next=0;t0=ctx.currentTime+leadSec;running=true;
      master.gain.cancelScheduledValues(ctx.currentTime);master.gain.setValueAtTime(muted?0:level,ctx.currentTime);schedule();timer=timers.setInterval(schedule,tickMs);return t0;},
    stop(){const now=ctx.currentTime;stopTimer();clicks=[];next=0;running=false;
      master.gain.cancelScheduledValues(now);master.gain.setValueAtTime(master.gain.value,now);master.gain.linearRampToValueAtTime(0,now+.01);
      for(const osc of live){try{osc.stop(now+.012);}catch{}}live.clear();},
    setMuted(m){muted=!!m;const now=ctx.currentTime;master.gain.cancelScheduledValues(now);master.gain.setValueAtTime(master.gain.value,now);master.gain.linearRampToValueAtTime(muted||!running?0:level,now+.01);},
    get muted(){return muted;},get running(){return running;},get startTime(){return t0;}
  };
}

/**
 * Baseline gate (FS-14 AC-8): 3 s needle-down, platter running. Refuses below baselineMinSnrDb (25 dB),
 * with no usable carrier, or when the platter is not playing forward near nominal speed.
 * @returns {{ok:boolean,snrDb:number,levelDb:number,speedErrorPercent:number,direction:string,reasons:Array<{id,title,action}>}}
 */
export function baselineCheck(capture,{format,formats=TIMECODE_FORMATS,minSnrDb=SCRATCH_DEFAULTS.baselineMinSnrDb,nominalRpm}={}){
  const fmt=resolveFormat(format,formats),a=analyzeTimecode(capture,{format:fmt,formats,...(finite(nominalRpm)?{nominalRpm}:{})});
  const get=id=>a.measurements?.find(m=>m.metricId===id)?.value,snrDb=get('tc_snr_db'),speed=get('tc_speed_error_percent');
  const n=Math.min(capture.left?.length||0,capture.right?.length||0);let eL=0,eR=0;for(let i=0;i<n;i++){eL+=capture.left[i]**2;eR+=capture.right[i]**2;}
  const levelDb=dbfs(Math.sqrt(Math.min(eL,eR)/Math.max(1,n))),reasons=[];
  if(a.error||!finite(snrDb))reasons.push({id:'no-signal',title:'No timecode signal',action:'Put the needle on the control vinyl, start the platter at 33 1/3 rpm, and check the phono/line switch and input selection.'});
  else{
    if(snrDb<minSnrDb)reasons.push({id:'low-snr',title:`Carrier SNR ${snrDb.toFixed(1)} dB is below ${minSnrDb} dB`,action:'Clean the stylus and the record, check the ground wire and cable routing, and try a less worn section or another control vinyl.'});
    if(a.direction!=='forward'||!finite(speed)||Math.abs(speed)>10)reasons.push({id:'not-playing',title:'Platter is not playing forward at normal speed',action:'Start the platter at 33 1/3 rpm with pitch at 0 and let it play forward during the baseline.'});
  }
  return {ok:!reasons.length,snrDb,levelDb,speedErrorPercent:speed,direction:a.direction,reasons};
}

/**
 * Full analysis of a protocol capture. `startSec` is where the first count-in click falls in the
 * capture. Only patterns whose perform window is fully captured are scored (an aborted run is partial).
 */
export function analyzeScratch(capture,{format,formats=TIMECODE_FORMATS,bpm=PROTOCOL_V1.bpm,protocol=PROTOCOL_V1,startSec=0,baseline=null,nominalRpm,thresholds={}}={}){
  const trace=instantVelocity(capture,{format,formats,nominalRpm,winMs:thresholds.winMs,hopMs:thresholds.hopMs});
  const durationSec=Math.min(capture.left.length,capture.right.length)/capture.sampleRate,tl=protocolTimeline(bpm,{protocol,startSec});
  const base={...thresholds,...(finite(baseline?.levelDb)?{baselineLevelDb:baseline.levelDb}:{})};
  const patterns=[],events=[];
  for(const p of tl.patterns){
    if(p.performEnd>durationSec+1e-6)continue;
    const r={...base,fromSec:p.performStart,toSec:p.performEnd},motion=analyzeMotion(trace,r),losses=detectLockLoss(trace,r),skips=detectSkips(trace,r,capture);
    const [a,b]=range(trace,r),snrs=[];for(let k=a;k<b;k++)if(finite(trace.snr[k]))snrs.push(trace.snr[k]);
    const m={activeSec:p.performEnd-p.performStart,lossSec:losses.reduce((s,l)=>s+l.durationMs/1000,0),recoveryMs:losses.map(l=>l.recoveryMs),
      reversals:motion.reversals.length,directionErrors:motion.directionErrors.length,medianSnrDb:median(snrs),skips:skips.length};
    patterns.push({id:p.id,label:p.label,startSec:p.performStart,endSec:p.performEnd,reversals:motion.reversals,directionErrors:motion.directionErrors,lockLosses:losses,skips,
      peakVelocity:motion.peakVelocity,metrics:m,...scoreScratch(m,protocol)});
    const ms=s=>Math.round(s*1e4)/10;
    for(const x of motion.reversals)events.push({pattern:p.id,kind:'reversal',tMs:ms(x.tSec),durationMs:x.durationMs,value:x.peak,detail:{fromSign:x.fromSign,peakBefore:x.peakBefore,peakAfter:x.peakAfter}});
    for(const x of losses){events.push({pattern:p.id,kind:'lock_loss',tMs:ms(x.startSec),durationMs:x.durationMs,value:null,detail:{cause:x.cause}});
      if(x.recoveredSec!==null)events.push({pattern:p.id,kind:'recovery',tMs:ms(x.recoveredSec),durationMs:x.recoveryMs,value:null,detail:{}});}
    for(const x of motion.directionErrors)events.push({pattern:p.id,kind:'direction_error',tMs:ms(x.tSec),durationMs:x.durationMs,value:x.value,detail:{sustained:x.sustained}});
    for(const x of skips)events.push({pattern:p.id,kind:'skip',tMs:ms(x.tSec),durationMs:x.dropMs,value:x.phaseJumpDeg,detail:{levelDrop:x.levelDrop,ringing:x.ringing,confidence:x.confidence}});
  }
  const all=k=>patterns.flatMap(p=>p[k]),losses=all('lockLosses'),skips=all('skips');
  const metrics={activeSec:patterns.reduce((s,p)=>s+p.metrics.activeSec,0),lossSec:patterns.reduce((s,p)=>s+p.metrics.lossSec,0),recoveryMs:losses.map(l=>l.recoveryMs),
    reversals:all('reversals').length,directionErrors:all('directionErrors').length,medianSnrDb:median(patterns.map(p=>p.metrics.medianSnrDb)),skips:skips.length};
  const scored=patterns.length?scoreScratch(metrics,protocol):{score:null,components:{},capped:false,protocolVersion:protocol.v};
  let peak=0;for(const p of patterns)if(Math.abs(p.peakVelocity)>Math.abs(peak))peak=p.peakVelocity;
  const recs=losses.map(l=>l.recoveryMs).filter(finite);
  const result={format:trace.format,bpm,protocolVersion:protocol.v,completed:patterns.length===protocol.patterns.length,patterns,events,metrics,...scored,
    lockLosses:losses.length,longestLossMs:losses.length?Math.max(...losses.map(l=>l.durationMs)):0,medianRecoveryMs:recs.length?median(recs):null,
    directionErrors:metrics.directionErrors,skips:skips.length,reversals:metrics.reversals,peakVelocity:peak,safety:skipSafety(skips.length),warnings:trace.warnings};
  result.summary=summarizeScratch(result);
  return result;
}

/** Safety recommendation from the skip count (FS-14 §7: stop after 3 skips). */
export function skipSafety(skips,{stopCount=SCRATCH_DEFAULTS.skipStopCount}={}){
  if(skips>=stopCount)return {stop:true,level:'stop',message:'Stop - check tracking force and cartridge alignment.'};
  if(skips>0)return {stop:false,level:'warn',message:'Needle skipped - check tracking force and cartridge alignment before continuing.'};
  return {stop:false,level:'ok',message:''};
}

const clock=s=>{const t=Math.max(0,Math.round(s));return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;};
const times=n=>n===1?'once':n===2?'twice':`${n} times`;
/** One-paragraph result copy (FS-14 §3). */
export function summarizeScratch(r){
  const parts=[];
  if(!r.lockLosses)parts.push('Lock held throughout.');
  else{parts.push(`Lock lost ${times(r.lockLosses)} (longest ${Math.round(r.longestLossMs)} ms).`);parts.push(r.medianRecoveryMs==null?'Lock did not recover.':`Recovery ${Math.round(r.medianRecoveryMs)} ms median.`);}
  if(r.directionErrors)parts.push(`${r.directionErrors} direction error${r.directionErrors>1?'s':''}.`);
  if(r.skips){const first=r.patterns.flatMap(p=>p.skips)[0];parts.push(`Needle skipped ${times(r.skips)}${first?` at ${clock(first.tSec)}`:''} - check tracking force.`);}
  if(!r.completed)parts.push('Run aborted: scored from completed patterns only.');
  return parts.join(' ');
}

/**
 * Compare scores of two entities (e.g. cartridges) over repeat runs: "difference is within run-to-run
 * noise" when |delta| < 2 * the larger standard deviation (FS-14 §6 repeatability).
 */
export function compareScores(a=[],b=[]){
  const A=repeatabilityMetrics(a.map(Number)),Bm=repeatabilityMetrics(b.map(Number)),delta=Bm.mean-A.mean,noise=Math.max(A.stdDev||0,Bm.stdDev||0);
  const enough=A.count>=2&&Bm.count>=2;
  return {a:A,b:Bm,delta,withinNoise:enough?Math.abs(delta)<2*noise:null,note:!enough?'Run at least two repeats of each for a fair comparison (three recommended).':Math.abs(delta)<2*noise?'Difference is within run-to-run noise.':'Difference is larger than run-to-run noise.'};
}

/** Row for `scratch_save` from an analyzeScratch result plus the entities it was run against. */
export function toRunRecord(result,{sessionId=null,setupId=null,cartridgeAssetId=null,recordSideId=null,trackingForceG=null,tonearmNote=null}={}){
  const r6=x=>finite(x)?Math.round(x*1e6)/1e6:null;
  const components={};for(const [k,c] of Object.entries(result.components||{}))components[k]={points:r6(c.points),max:c.max,value:r6(c.value),unit:c.unit};
  return {sessionId,setupId,cartridgeAssetId,recordSideId,format:result.format,bpm:result.bpm,protocolVersion:result.protocolVersion,completed:!!result.completed,
    score:r6(result.score),components,lockLosses:result.lockLosses,longestLossMs:r6(result.longestLossMs),medianRecoveryMs:r6(result.medianRecoveryMs),
    directionErrors:result.directionErrors,skips:result.skips,reversals:result.reversals,peakVelocity:r6(result.peakVelocity),trackingForceG:r6(trackingForceG),tonearmNote,
    events:(result.events||[]).map(e=>({pattern:e.pattern,kind:e.kind,tMs:r6(e.tMs),durationMs:r6(e.durationMs),value:r6(e.value),detail:e.detail||{}}))};
}

const LS_KEY='deckchek.scratch.v1',LS_MAX_RUNS=50;
const nativeInvoke=()=>globalThis.window?.__TAURI__?.core?.invoke??globalThis.__TAURI__?.core?.invoke??null;
function validateRecord(run){
  if(!run||typeof run!=='object')throw new Error('scratch run must be an object');
  if(typeof run.format!=='string'||!run.format.trim())throw new Error('scratch run needs a timecode format');
  if(!finite(run.bpm)||run.bpm<30||run.bpm>300)throw new Error('scratch run BPM must be between 30 and 300');
  if(run.score!=null&&(!finite(run.score)||run.score<0||run.score>100))throw new Error('scratch score must be between 0 and 100');
  for(const e of run.events||[])if(!EVENT_KINDS.includes(e.kind))throw new Error(`unknown scratch event kind: ${e.kind}`);
  return run;
}
/**
 * Bridge to `scratch_save` / `scratch_list` / `scratch_get` / `scratch_delete`. Browser mode keeps the
 * last 50 runs in localStorage (`deckchek.scratch.v1`) with the same shapes.
 */
export function createScratchApi({invoke=nativeInvoke(),storage=globalThis.localStorage??null,now=()=>new Date().toISOString(),newId=()=>globalThis.crypto?.randomUUID?.()??`run-${Date.now()}-${Math.random().toString(16).slice(2)}`}={}){
  if(invoke)return {native:true,
    save:async run=>invoke('scratch_save',{run:validateRecord(run)}),
    list:async(filter={})=>invoke('scratch_list',{filter}),
    get:async id=>invoke('scratch_get',{id}),
    delete:async id=>invoke('scratch_delete',{id})};
  const read=()=>{try{const v=JSON.parse(storage?.getItem(LS_KEY)||'[]');return Array.isArray(v)?v:[];}catch{return [];}};
  const write=list=>{try{storage?.setItem(LS_KEY,JSON.stringify(list.slice(0,LS_MAX_RUNS)));}catch{}};
  const summary=({events,...r})=>({...r,eventCount:events.length});
  return {native:false,
    async save(run){validateRecord(run);const {events=[],...rest}=run,id=newId(),createdAt=now();
      const stored={id,createdAt,sessionId:null,setupId:null,cartridgeAssetId:null,recordSideId:null,trackingForceG:null,tonearmNote:null,...rest,
        events:events.map((e,i)=>({id:`${id}-${i}`,runId:id,durationMs:null,value:null,detail:{},...e}))};
      write([stored,...read()]);return summary(stored);},
    async list(filter={}){return read().filter(r=>['cartridgeAssetId','recordSideId','setupId','format'].every(k=>filter[k]==null||r[k]===filter[k])&&(filter.protocolVersion==null||r.protocolVersion===filter.protocolVersion))
      .slice(0,filter.limit||LS_MAX_RUNS).map(summary);},
    async get(id){const r=read().find(x=>x.id===id);return r?{run:summary(r),events:r.events}:null;},
    async delete(id){const l=read(),k=l.filter(x=>x.id!==id);write(k);return k.length!==l.length;}};
}
