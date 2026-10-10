// Mains hum measurement shared by FS-10 (pre-gig check), FS-15 (booth hum hunter) and optionally FS-31.
// FS-00 §4.6. Pure DSP, no DOM. Levels follow app/core.js humMetrics: a tone's dBFS is its PEAK amplitude
// in dB (a full-scale sine reads 0 dBFS). humMetrics itself is untouched and keeps its output.
import {dbfs} from './core.js';
import {fitTone,refineToneFrequency,levelUncertaintyDb} from './calibration.js';

const TAU=2*Math.PI;
const NYQUIST_FRACTION=.45;      // harmonics at or above 0.45 * fs are omitted (never aliased)
const TRACK_SPAN_HZ=.5;          // mains frequency search span around 50/60 Hz (grids hold +/-0.2 Hz in practice)
const FLOOR_OFFSETS_HZ=[-25,-20,20,25]; // floor probes, this far from every harmonic (FS-15 §6)
const MIN_CYCLES=2;              // shortest usable window, in mains cycles

function toF64(samples,name='samples'){
  if(!samples||typeof samples.length!=='number'||samples.length===0)throw new RangeError(`${name} must be a non-empty array`);
  return samples instanceof Float64Array?samples:Float64Array.from(samples);
}
function checkRate(sampleRate){if(!(Number.isFinite(sampleRate)&&sampleRate>0))throw new RangeError('sampleRate must be a positive number');}
function goertzelPower(x,rate,f){const w=TAU*f/rate,c=2*Math.cos(w);let s1=0,s2=0;for(let i=0;i<x.length;i++){const s0=x[i]+c*s1-s2;s2=s1;s1=s0;}return Math.max(0,s1*s1+s2*s2-c*s1*s2);}

/** Boxcar-average decimation, used only to make the mains-frequency search cheap (never for levels). */
function decimate(x,sampleRate,topHz){
  const m=Math.max(1,Math.floor(sampleRate/(2.5*(topHz+10)))),n=Math.floor(x.length/m),out=new Float64Array(n);
  for(let i=0,k=0;i<n;i++){let s=0;for(let j=0;j<m;j++)s+=x[k++];out[i]=s/m;}
  return {x:out,rate:sampleRate/m};
}
/**
 * Fundamental in [nominal - span, nominal + span]: a Goertzel grid (sum_k |G(k f)|^2, step finer than the
 * narrowest harmonic's main lobe) brackets the peak, then golden-section search on the joint-fit energy.
 * Returns {f, score (Goertzel sum at f), atEdge}.
 */
function searchFundamental(dec,nominal,ks,span=TRACK_SPAN_HZ){
  const T=dec.x.length/dec.rate,kmax=Math.max(...ks);
  const score=f=>{let s=0;for(const k of ks)s+=goertzelPower(dec.x,dec.rate,k*f);return s;};
  const step=Math.min(.05,Math.max(.002,.3/(Math.max(T,1e-3)*kmax)));
  let best=nominal,bs=score(nominal);
  for(let f=nominal-span;f<=nominal+span+1e-9;f+=step){const s=score(f);if(s>bs){bs=s;best=f;}}
  // Goertzel peaks are biased by the other harmonics' leakage, so the fine search maximises the energy of a
  // JOINT least-squares fit of all harmonics + DC (variable projection), which is exact at the true f0.
  const proj=f=>jointProjection(dec,f,ks);
  const g=goldenMax(proj,Math.max(nominal-span,best-2*step),Math.min(nominal+span,best+2*step),1e-6);
  const out={f:g.x,score:score(g.x)};
  // a maximum on the edge of the span is a neighbouring component pulling the fit, not the mains frequency
  out.atEdge=Math.abs(out.f-nominal)>span-step;return out;
}
/** Energy of the least-squares projection of x onto {DC, sin/cos(2 pi k f t) for k in ks}: b' M^-1 b. */
function jointProjection(dec,f,ks){
  const x=dec.x,n=x.length,P=2*ks.length+1,M=new Float64Array(P*P),b=new Float64Array(P),v=new Float64Array(P);
  const H=ks.length,cw=new Float64Array(H),sw=new Float64Array(H),S=new Float64Array(H),C=new Float64Array(H).fill(1);
  for(let j=0;j<H;j++){const w=TAU*ks[j]*f/dec.rate;cw[j]=Math.cos(w);sw[j]=Math.sin(w);}
  for(let i=0;i<n;i++){
    for(let j=0;j<H;j++){const s=S[j],c=C[j];v[2*j]=s;v[2*j+1]=c;S[j]=s*cw[j]+c*sw[j];C[j]=c*cw[j]-s*sw[j];}
    v[P-1]=1;const xi=x[i];
    for(let r=0;r<P;r++){const vr=v[r];b[r]+=vr*xi;for(let q=r;q<P;q++)M[r*P+q]+=vr*v[q];}
  }
  for(let r=0;r<P;r++)for(let q=0;q<r;q++)M[r*P+q]=M[q*P+r];
  const sol=solveSym(M,b,P);if(!sol)return 0;let e=0;for(let r=0;r<P;r++)e+=sol[r]*b[r];return e;
}
/** Gaussian elimination with partial pivoting on a copy; null when singular. */
function solveSym(M,b,P){
  const a=Float64Array.from(M),y=Float64Array.from(b);
  for(let c=0;c<P;c++){let p=c;for(let r=c+1;r<P;r++)if(Math.abs(a[r*P+c])>Math.abs(a[p*P+c]))p=r;
    if(Math.abs(a[p*P+c])<1e-12)return null;
    if(p!==c){for(let k=0;k<P;k++){const t=a[c*P+k];a[c*P+k]=a[p*P+k];a[p*P+k]=t;}const t=y[c];y[c]=y[p];y[p]=t;}
    for(let r=c+1;r<P;r++){const m=a[r*P+c]/a[c*P+c];if(!m)continue;for(let k=c;k<P;k++)a[r*P+k]-=m*a[c*P+k];y[r]-=m*y[c];}}
  const out=new Float64Array(P);for(let r=P-1;r>=0;r--){let s=y[r];for(let k=r+1;k<P;k++)s-=a[r*P+k]*out[k];out[r]=s/a[r*P+r];}
  return out;
}
/** Golden-section search for the maximum of a unimodal fn on [a, b]. */
function goldenMax(fn,a,b,tol){
  const g=(Math.sqrt(5)-1)/2;let c=b-g*(b-a),d=a+g*(b-a),fc=fn(c),fd=fn(d);
  for(let it=0;it<80&&b-a>tol;it++){if(fc>fd){b=d;d=c;fd=fc;c=b-g*(b-a);fc=fn(c);}else{a=c;c=d;fc=fd;d=a+g*(b-a);fd=fn(d);}}
  const x=(a+b)/2;return {x,y:fn(x)};
}
function median(v){const s=v.filter(Number.isFinite).sort((a,b)=>a-b);if(!s.length)return 0;const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;}

/**
 * Which mains family dominates: 50 + 100 Hz versus 60 + 120 Hz (each searched +/-0.5 Hz).
 * @param {ArrayLike<number>} samples mono samples
 * @param {number} sampleRate
 * @returns {{mainsHz:50|60, confidence:number}} confidence 0..1 (0 = no evidence either way; ties go to 60 like humMetrics).
 */
export function detectMains(samples,sampleRate){
  checkRate(sampleRate);const x=toF64(samples);
  let mean=0;for(const v of x)mean+=v;mean/=x.length;const y=new Float64Array(x.length);for(let i=0;i<x.length;i++)y[i]=x[i]-mean;
  const dec=decimate(y,sampleRate,Math.min(120,sampleRate*NYQUIST_FRACTION));
  const ks=f=>[1,2].filter(k=>k*f<dec.rate*NYQUIST_FRACTION);
  const s50=ks(50).length?searchFundamental(dec,50,ks(50)).score:0,s60=ks(60).length?searchFundamental(dec,60,ks(60)).score:0;
  const noise=median([25,30,35,40,75,80,85,90].filter(f=>f<dec.rate*NYQUIST_FRACTION).map(f=>goertzelPower(dec.x,dec.rate,f)));
  const hi=Math.max(s50,s60),lo=Math.min(s50,s60),den=hi+lo+4*noise;
  return {mainsHz:s60>=s50?60:50,confidence:den>0?Math.max(0,Math.min(1,(hi-lo)/den)):0};
}

/**
 * Same least-squares fit as calibration.js fitTone (sin, cos, DC at a known frequency; same fields), but the
 * sin/cos sequence comes from a rotation recurrence instead of Math.sin/Math.cos per sample (about 5x faster
 * on 5 s windows; rounding drift stays below 1e-10 relative over 10^6 samples).
 */
export function fitToneFast(samples,sampleRate,frequencyHz){
  const n=samples.length,w=TAU*frequencyHz/sampleRate,cw=Math.cos(w),sw=Math.sin(w);
  let s=0,c=1,ss=0,sc=0,s1=0,cc=0,c1=0,xs=0,xc=0,x1=0;
  for(let i=0;i<n;i++){const x=samples[i];ss+=s*s;sc+=s*c;s1+=s;cc+=c*c;c1+=c;xs+=x*s;xc+=x*c;x1+=x;
    const ns=s*cw+c*sw;c=c*cw-s*sw;s=ns;if((i&4095)===4095){const k=1/Math.hypot(s,c);s*=k;c*=k;}}
  const sol=solve3([[ss,sc,s1],[sc,cc,c1],[s1,c1,n]],[xs,xc,x1]);if(!sol)return fitTone(samples,sampleRate,frequencyHz);
  const [a,b,dc]=sol;let res=0;s=0;c=1;
  for(let i=0;i<n;i++){const e=samples[i]-(a*s+b*c+dc);res+=e*e;const ns=s*cw+c*sw;c=c*cw-s*sw;s=ns;if((i&4095)===4095){const k=1/Math.hypot(s,c);s*=k;c*=k;}}
  return {amplitude:Math.hypot(a,b),phase:Math.atan2(b,a),dc,residualRms:Math.sqrt(res/Math.max(1,n))};
}
function solve3(m,b){const a=m.map((r,i)=>[...r,b[i]]);for(let c=0;c<3;c++){let p=c;for(let r=c+1;r<3;r++)if(Math.abs(a[r][c])>Math.abs(a[p][c]))p=r;[a[c],a[p]]=[a[p],a[c]];if(Math.abs(a[c][c])<1e-18)return null;for(let r=0;r<3;r++)if(r!==c){const f=a[r][c]/a[c][c];for(let k=c;k<4;k++)a[r][k]-=f*a[c][k];}}return a.map((r,i)=>r[3]/r[i]);}
/** Subtracts amplitude * sin(w i + phase) in place (recurrence, as fitToneFast). */
function subtractTone(r,sampleRate,hz,amplitude,phase){
  const w=TAU*hz/sampleRate,cw=Math.cos(w),sw=Math.sin(w);let s=Math.sin(phase),c=Math.cos(phase);
  for(let i=0;i<r.length;i++){r[i]-=amplitude*s;const ns=s*cw+c*sw;c=c*cw-s*sw;s=ns;if((i&4095)===4095){const k=1/Math.hypot(s,c);s*=k;c*=k;}}
}

/** Trailing window of whole cycles at f (so every harmonic is orthogonal to the others and to DC). */
function cycleWindow(x,sampleRate,f){
  const cycles=Math.floor(x.length*f/sampleRate);if(cycles<MIN_CYCLES)return null;
  const len=Math.min(x.length,Math.round(cycles*sampleRate/f)),w=x.subarray(x.length-len);
  let mean=0;for(const v of w)mean+=v;mean/=len;const out=new Float64Array(len);for(let i=0;i<len;i++)out[i]=w[i]-mean;return out;
}
function fitHarmonics(win,sampleRate,f,count){
  const fits=[];for(let n=1;n<=count;n++){const hz=n*f;if(hz>=sampleRate*NYQUIST_FRACTION)break;fits.push({n,hz,...fitToneFast(win,sampleRate,hz)});}
  let power=0;for(const h of fits)power+=h.amplitude*h.amplitude;return {fits,power};
}
/** Median tone-estimator reading (core.js toneAmplitude scale) between harmonics, on the residual after the fitted hum is removed. */
function floorAmplitude(win,sampleRate,f,fits){
  const r=Float64Array.from(win);
  for(const h of fits)subtractTone(r,sampleRate,h.hz,h.amplitude,h.phase);
  const probes=[];for(const h of fits)for(const o of FLOOR_OFFSETS_HZ){const p=h.hz+o;if(p>5&&p<sampleRate*NYQUIST_FRACTION)probes.push(Math.sqrt(goertzelPower(r,sampleRate,p))/(r.length/2));}
  return median(probes);
}

/**
 * Mains hum: least-squares fits (fitTone, via fitToneFast) at k * f for k = 1..harmonics over a whole-cycle window.
 * The fundamental is tracked within +/-0.5 Hz of 50/60 Hz unless trackMains is false.
 * @param {ArrayLike<number>} samples mono samples (DC is ignored)
 * @param {number} sampleRate
 * @param {object} [o]
 * @param {'auto'|50|60} [o.mains='auto'] 'auto' uses detectMains.
 * @param {number} [o.harmonics=8]
 * @param {number} [o.windowSec] analyse only the trailing windowSec seconds (default: everything).
 * @param {boolean} [o.trackMains=true]
 * @returns {{mainsHz:50|60, fundamentalHz:number, fundamentalDbfs:number, harmonics:Array<{n:number,hz:number,dbfs:number}>,
 *   totalDbfs:number, floorDbfs:number, humToFloorDb:number, oddEvenRatio:number, uncertaintyDb:number, windowSec:number}}
 *   totalDbfs = power sum of the harmonics; floorDbfs = median estimator reading 20-25 Hz either side of each
 *   harmonic after removing the hum (same scale as a harmonic's dbfs, so humToFloorDb = totalDbfs - floorDbfs);
 *   oddEvenRatio = RMS of odd harmonics n >= 3 over RMS of even harmonics (amplitude ratio);
 *   uncertaintyDb = expanded (k = 2) noise-limited uncertainty of totalDbfs (levelUncertaintyDb at the
 *   estimator SNR; no gain-calibration term, the level is digital dBFS).
 * @throws {RangeError} empty input, bad sampleRate, mains not 'auto'|50|60, or fewer than two mains cycles.
 */
export function humMeasure(samples,sampleRate,{mains='auto',harmonics=8,windowSec,trackMains=true}={}){
  checkRate(sampleRate);let x=toF64(samples);
  if(mains!=='auto'&&mains!==50&&mains!==60)throw new RangeError("mains must be 'auto', 50 or 60");
  const count=Math.max(1,Math.floor(Number.isFinite(harmonics)?harmonics:8));
  if(Number.isFinite(windowSec)&&windowSec>0){const len=Math.min(x.length,Math.round(windowSec*sampleRate));x=x.subarray(x.length-len);}
  if(x.length*(mains==='auto'?50:mains)/sampleRate<MIN_CYCLES)throw new RangeError('window is shorter than two mains cycles');
  const mainsHz=mains==='auto'?detectMains(x,sampleRate).mainsHz:mains;

  let f=mainsHz,win=cycleWindow(x,sampleRate,f);if(!win)throw new RangeError('window is shorter than two mains cycles');
  let {fits,power}=fitHarmonics(win,sampleRate,f,count);
  if(trackMains!==false){
    const top=fits[fits.length-1].n*(mainsHz+TRACK_SPAN_HZ),dec=decimate(win,sampleRate,top);
    const ks=fits.map(h=>h.n).filter(k=>k*(mainsHz+TRACK_SPAN_HZ)<dec.rate*NYQUIST_FRACTION);
    const {f:found,atEdge}=searchFundamental(dec,mainsHz,ks.length?ks:[1]);
    const w2=atEdge?null:cycleWindow(x,sampleRate,found);
    if(w2){const r2=fitHarmonics(w2,sampleRate,found,count);if(r2.power>power&&r2.fits.length===fits.length){f=found;win=w2;fits=r2.fits;power=r2.power;}}
  }
  const floor=floorAmplitude(win,sampleRate,f,fits);
  let odd=0,even=0;for(const h of fits){if(h.n%2===0)even+=h.amplitude**2;else if(h.n>=3)odd+=h.amplitude**2;}
  const totalDbfs=10*Math.log10(Math.max(power,1e-24)),floorDbfs=dbfs(floor),humToFloorDb=totalDbfs-floorDbfs;
  return {
    mainsHz,fundamentalHz:f,fundamentalDbfs:dbfs(fits[0].amplitude),
    harmonics:fits.map(h=>({n:h.n,hz:h.hz,dbfs:dbfs(h.amplitude)})),
    totalDbfs,floorDbfs,humToFloorDb,oddEvenRatio:Math.sqrt((odd+1e-24)/(even+1e-24)),
    uncertaintyDb:levelUncertaintyDb({gainDb:0,snrDb:humToFloorDb,windowSamples:1}).expanded,
    windowSec:win.length/sampleRate
  };
}

function trackedFrequency(block,sampleRate,center,spanHz){
  const step=Math.max(.05,sampleRate/block.length/4);let best=center,bm=-1;
  for(let f=center-spanHz;f<=center+spanHz+1e-9;f+=step){if(f<=0||f>=sampleRate/2)continue;const m=goertzelPower(block,sampleRate,f);if(m>bm){bm=m;best=f;}}
  const cycles=block.length*best/sampleRate,segments=Math.max(4,Math.min(16,Math.floor(cycles/4)));
  const r=refineToneFrequency(block,sampleRate,best,{segments}).frequencyHz;
  return Math.abs(r-best)<=step*2?r:best;
}

/**
 * Removes one (carrier) tone and returns the residual, e.g. to measure hum under a timecode carrier (FS-10).
 * Default: Hann-weighted overlapping blocks (blockSec, 50 % overlap), each with its own tracked frequency
 * (search +/-10 % of hz on the first block, then around the previous block) and its own fitTone; the
 * block models are cross-faded, so turntable speed drift and wow leave no clicks. The signal's DC is kept.
 * @param {ArrayLike<number>} samples
 * @param {number} sampleRate
 * @param {number} hz nominal tone frequency
 * @param {{blockSec?:number, track?:boolean}} [o] blockSec <= 0 fits the whole buffer at once; track false fits exactly hz.
 * @returns {Float32Array}
 */
export function removeTone(samples,sampleRate,hz,{blockSec=.1,track=true}={}){
  checkRate(sampleRate);const x=toF64(samples);
  if(!(Number.isFinite(hz)&&hz>0&&hz<sampleRate/2))throw new RangeError('hz must be between 0 and sampleRate/2');
  const n=x.length;let L=blockSec>0?Math.round(blockSec*sampleRate):n;
  if(L>=n||L*hz/sampleRate<8)L=n;
  const model=new Float64Array(n),weight=new Float64Array(n),hop=Math.max(1,L>>1);
  let center=hz,first=true;
  for(let s=0;;s+=hop){
    const e=Math.min(n,s+L),block=x.subarray(s,e),len=e-s;
    const f=track?trackedFrequency(block,sampleRate,center,first?hz*.1:Math.max(2*sampleRate/len,hz*.002)):hz;
    if(track){center=f;first=false;}
    const fit=fitTone(block,sampleRate,f),w=TAU*f/sampleRate;
    for(let i=0;i<len;i++){const g=L===n?1:.5-.5*Math.cos(TAU*(i+.5)/len);model[s+i]+=g*fit.amplitude*Math.sin(w*i+fit.phase);weight[s+i]+=g;}
    if(e>=n)break;
  }
  const out=new Float32Array(n);for(let i=0;i<n;i++)out[i]=x[i]-(weight[i]>0?model[i]/weight[i]:0);
  return out;
}
