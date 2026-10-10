// FS-13 control-vinyl wear map: streaming per-bin timecode quality (median SNR, max phase error,
// dropouts, level), bin classes, scan verdict, scan-to-scan alignment and diff, and the spiral/arc
// geometry the groove map draws. Pure: no DOM, no Tauri; the stream bridge and invoke are injected.
//
// Memory: the scanner keeps one bin of audio (binSec x sampleRate x 2 floats) plus per-bin features and a
// 1 Hz level envelope, never the whole side (20 min x 48 kHz x 2 x 4 B = 460 MB).
import {dbfs} from './core.js';
import {TIMECODE_FORMATS,findFormat,analyzeTimecode,directionSign} from './timecode.js';

/** Scanner defaults (FS-13 §6). Tunable; flagged for calibration against real lock loss. */
export const WEAR_DEFAULTS=Object.freeze({
  binSec:2,minBinSec:1,maxBinSec:5,
  windowSec:.1,dropoutDb:12,           // analyzeTimecode settings per bin (spec §4)
  levelWinSec:.02,                     // level windows for silence / envelope
  silenceDbfs:-60,                     // a window below this (or liftDropDb under the scan's level) is silence
  liftDropDb:30,
  liftMinSec:.5,                       // silence this long inside a bin = paused or needle lifted -> interrupted
  edgeSilenceSec:.06,                  // silence touching a needle-drop / needle-lift edge marks that bin interrupted
  minAnalysisSec:.5,                   // less real audio than this in a bin -> no metrics, interrupted
  speedShiftPct:1.5,                   // carrier vs the scan's running carrier, or spread inside one bin
  wrongSpeedPct:8,                     // carrier vs the format's nominal carrier
  motionSnrDb:15,                      // windows below this SNR are not trusted for speed / direction checks
  lockSnrDb:6,                         // bin median SNR below this = no format lock
  lockLostErrorPct:20,                 // spec §3 error state: lock lost for > 20 % of the side
  clipLevel:.999,
  refBins:31,                          // running medians (level, carrier) over this many recent valid bins
  minCoverage:.05,                     // less of the side than this -> verdict 'incomplete'
  skipMinDeg:30,                       // needle skip: carrier phase step at least this large (deg) ...
  skipSigma:7,                         // ... and this many robust standard deviations above the step noise
  skipWinSec:.002                      // averaging window either side of a candidate step
});

/** Bin flags as stored in wear_bin.flags. */
export const FLAGS=Object.freeze({interrupted:1,speedShift:2,clip:4});

/** Bin classes (FS-13 §6): good (SNR >= 25, phaseErr <= 10, 0 dropouts); bad (SNR < 15 or phaseErr > 25 or >= 2 dropouts); else degraded. */
export const CLASS_THRESHOLDS=Object.freeze({goodSnrDb:25,badSnrDb:15,goodPhaseErrDeg:10,badPhaseErrDeg:25,badDropouts:2});

/** Verdict rules (FS-13 §6), percentages of valid (non-interrupted) bins. */
export const VERDICT_THRESHOLDS=Object.freeze({
  keepBadPct:1,keepDegradedPct:5,
  watchBadPct:3,watchDegradedPct:15,
  otherSideBadPct:3,otherSideCleanBadPct:1,
  replaceBadPct:10,
  trendPointsPerScan:3,trendScans:3,
  lowSnrDb:20                          // "SNR below 20 dB over 9 % of the side" in the message
});

export const VERDICTS=Object.freeze(['keep','watch','other_side','replace','incomplete']);
export const VERDICT_LABELS=Object.freeze({keep:'Keep',watch:'Watch',other_side:'Use other side',replace:'Replace',incomplete:'Incomplete'});
export const METRICS=Object.freeze(['snr','phase','dropouts']);
/** Default drawing geometry for a 12 in record (FS-13 §5/§6: UNKNOWN per product, used for drawing only, never scoring). */
export const DEFAULT_GEOMETRY=Object.freeze({v:1,outerMm:146,innerMm:58,grooveModel:'linear-radius'});
/** Visual spiral turns: the real groove has ~660 turns per 20 min side, far too dense to show bins as arcs. */
export const DEFAULT_TURNS=12;
/** SNR changes below this are "within noise" (FS-13 §6). */
export const NOISE_DB=3;
export const MAX_BINS=5000;
/** Skips kept in a saved scan's summary (the summary is capped at 64 KiB in Rust). */
export const MAX_SUMMARY_SKIPS=200;

/**
 * Sequential colour ramp (cividis: perceptually uniform and readable with deuteranopia/protanopia),
 * q = 0 worst ... 1 best. Bad bins are also hatched (`arc.hatch`), so colour is never the only signal.
 */
export const QUALITY_COLOR_RAMP=Object.freeze([
  Object.freeze({q:0,color:'#00224e'}),Object.freeze({q:.25,color:'#35456c'}),Object.freeze({q:.5,color:'#666970'}),
  Object.freeze({q:.75,color:'#a59c74'}),Object.freeze({q:1,color:'#fee838'})
]);

const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const fin=Number.isFinite;
function median(a){const v=a.filter(fin).sort((x,y)=>x-y);if(!v.length)return null;const m=v.length>>1;return v.length%2?v[m]:(v[m-1]+v[m])/2;}
const round=(x,d=6)=>fin(x)?Math.round(x*10**d)/10**d:null;
const pct=(n,d)=>d>0?100*n/d:0;

/** "m:ss" (or "h:mm:ss") for a time in seconds. */
export function formatTime(sec){
  if(!fin(sec))return '--:--';
  const s=Math.max(0,Math.floor(sec+1e-9)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=String(s%60).padStart(2,'0');
  return h?`${h}:${String(m).padStart(2,'0')}:${r}`:`${m}:${r}`;
}

function resolveFormat(format,formats=TIMECODE_FORMATS){
  const f=typeof format==='string'?findFormat(format,formats):format;
  if(!f||!fin(f.carrierHz))throw new Error(`Unknown timecode format: ${typeof format==='string'?format:format?.name}`);
  return f;
}

/** Side length in seconds from the format's xwax side table (FS-06 / FS-00 §4.15); null when unknown (e.g. Final Scratch). */
export function sideDurationSec(format,sideLabel,{formats=TIMECODE_FORMATS,nominalRpm=33.333333}={}){
  const f=typeof format==='string'?findFormat(format,formats):format;
  const sides=f?.sides||[];if(!sides.length)return null;
  const want=String(sideLabel??'').trim().toLowerCase();
  const s=sides.find(x=>String(x.label).toLowerCase()===want)||(sides.length===1?sides[0]:null);
  if(!s||!fin(s.durationSec))return null;
  return s.durationSec*(f.atRpm||33.333333)/nominalRpm;
}

/** Bin class from its metrics. With `baseline` (referenceBaseline) the SNR is corrected for the reference scan's radius slope first. */
export function classifyBin(bin,{thresholds=CLASS_THRESHOLDS,baseline=null}={}){
  if(!bin||(bin.flags&FLAGS.interrupted))return 'interrupted';
  const t={...CLASS_THRESHOLDS,...thresholds};
  let snr=bin.snrDb;
  if(fin(snr)&&baseline&&fin(baseline.slopeDbPerSec)&&fin(bin.tSec))snr-=Math.min(0,baseline.slopeDbPerSec)*bin.tSec;
  const pe=bin.phaseErrDeg,d=bin.dropouts||0;
  if(!fin(snr)||snr<t.badSnrDb||(fin(pe)&&pe>t.badPhaseErrDeg)||d>=t.badDropouts)return 'bad';
  if(snr>=t.goodSnrDb&&(!fin(pe)||pe<=t.goodPhaseErrDeg)&&d===0)return 'good';
  return 'degraded';
}
const CLASS_RANK={good:0,degraded:1,bad:2,interrupted:-1};

/**
 * Per-radius SNR baseline from a reference (fresh) scan (FS-13 §6): snr0 = median SNR of the first 5 % of
 * valid bins, slope fitted over the whole reference (dB per second of side; inner grooves are slower and
 * noisier). Only a falling slope is compensated, so a baseline can never make a bin look worse.
 */
export function referenceBaseline(refBins,{firstPct=5}={}){
  const v=(refBins||[]).filter(b=>!(b.flags&FLAGS.interrupted)&&fin(b.snrDb)&&fin(b.tSec));
  if(v.length<3)return null;
  const head=v.slice(0,Math.max(1,Math.ceil(v.length*firstPct/100)));
  const n=v.length,mx=v.reduce((a,b)=>a+b.tSec,0)/n,my=v.reduce((a,b)=>a+b.snrDb,0)/n;
  let sxy=0,sxx=0;for(const b of v){sxy+=(b.tSec-mx)*(b.snrDb-my);sxx+=(b.tSec-mx)**2;}
  return {snr0:median(head.map(b=>b.snrDb)),slopeDbPerSec:sxx>0?sxy/sxx:0,n};
}

// ------------------------------------------------------------------------------------------ needle skips

const wrapPi=x=>x-2*Math.PI*Math.round(x/(2*Math.PI));

/**
 * Needle skips (FS-13 §7) in one stretch of quadrature timecode. A skip moves the stylus to another groove, so
 * the carrier phase, common to both channels, steps by the fractional part of the cycles jumped; the L/R
 * quadrature relation, which analyzeTimecode scores, is unchanged. The instantaneous carrier phase is
 * atan2(L, phaseSign * R) (phaseSign = directionSign(format): primary channel x phase switch) after per-channel level normalisation; its residual against the expected carrier
 * advance is integrated, and the step statistic D(i) = S(i) - (S(i-m) + S(i+m)) / 2, where S(i) is the mean
 * residual phase over the m samples after i minus the m samples before, is zero for any constant speed error
 * and any speed change (kink), and equals the step size at a skip. Peaks above max(minDeg, sigma x robust
 * noise) are skips. Windows touching samples with no carrier (dropouts, silence) are not tested. Steps close to
 * a whole number of cycles (|step| < minDeg) and steps within 2m samples of the stretch edges are not seen.
 * @returns {Array<{sample:number,sec:number,deg:number}>}
 */
export function detectSkips(left,right,sampleRate,{carrierHz,phaseSign=1,minDeg=WEAR_DEFAULTS.skipMinDeg,sigma=WEAR_DEFAULTS.skipSigma,winSec=WEAR_DEFAULTS.skipWinSec}={}){
  const n=Math.min(left?.length||0,right?.length||0),m=Math.max(8,Math.round(winSec*sampleRate));
  if(!fin(carrierHz)||carrierHz<=0||n<5*m)return [];
  let pl=0,pr=0;for(let i=0;i<n;i++){pl+=left[i]*left[i];pr+=right[i]*right[i];}
  const aL=Math.sqrt(2*pl/n),aR=Math.sqrt(2*pr/n);
  if(!(aL>1e-6&&aR>1e-6))return [];
  const s=phaseSign===-1?-1:1,w=2*Math.PI*carrierHz/sampleRate;
  // cumulative residual phase and a prefix count of samples without carrier
  const P=new Float64Array(n+1),bad=new Int32Array(n+1);
  let prev=null,phi=0;
  for(let i=0;i<n;i++){
    const x=left[i]/aL,y=s*right[i]/aR,mag=x*x+y*y,ok=mag>.09&&mag<9;
    bad[i+1]=bad[i]+(ok?0:1);
    if(ok){const a=Math.atan2(x,y);if(prev!=null)phi+=wrapPi(wrapPi(a-prev)-w);prev=a;}
    else prev=null; // re-anchor after a gap: the gap itself never reads as a step
    P[i+1]=P[i]+phi;
  }
  const mean=(a,b)=>(P[b]-P[a])/(b-a),S=i=>mean(i,i+m)-mean(i-m,i);
  const lo=2*m,hi=n-2*m,D=new Float64Array(Math.max(0,hi-lo));
  for(let i=lo;i<hi;i++)D[i-lo]=bad[i+2*m]-bad[i-2*m]?0:S(i)-(S(i-m)+S(i+m))/2;
  if(!D.length)return [];
  // robust noise of D from a decimated sample (skips are rare, so the median absolute value is noise)
  const sample=[];for(let k=0;k<D.length;k+=7)sample.push(Math.abs(D[k]));
  sample.sort((a,b)=>a-b);
  const noise=1.4826*sample[sample.length>>1];
  const thr=Math.max(minDeg*Math.PI/180,sigma*noise);
  const out=[];
  for(let k=0;k<D.length;k++){
    if(Math.abs(D[k])<thr)continue;
    // the step's own peak lies within m after a side lobe (-step/2 at -m); take the largest in 3m
    let best=k;for(let j=k+1;j<Math.min(D.length,k+3*m);j++)if(Math.abs(D[j])>Math.abs(D[best]))best=j;
    const i=best+lo;
    out.push({sample:i,sec:round(i/sampleRate,6),deg:round(wrapPi(D[best])*180/Math.PI,3)});
    k=best+2*m; // skip the trailing side lobe
  }
  return out;
}

// ------------------------------------------------------------------------------------------ scope snippets

/** Bins newer than this keep their scope snippet in memory (a ring buffer; older ones are dropped). */
export const SCOPE_KEEP_BINS=1500;
export const SCOPE_COLS=120;
/**
 * Compact peak envelope of one bin for the inspector (FS-13 AC-7): per column the min and max sample of each
 * channel, scaled to -127..127 (8 bit is plenty for a picture). Raw audio is never retained.
 * @returns {{cols:number,l:number[],r:number[]}}
 */
export function scopeEnvelope(left,right,n,cols=SCOPE_COLS){
  const count=Math.max(0,Math.min(n|0,left?.length||0,right?.length||0));
  if(count<cols)return null;
  const out={cols,l:[],r:[]};
  for(let c=0;c<cols;c++){
    const a=Math.floor(c*count/cols),b=Math.floor((c+1)*count/cols);
    let lmin=Infinity,lmax=-Infinity,rmin=Infinity,rmax=-Infinity;
    for(let i=a;i<b;i++){const x=left[i],y=right[i];if(x<lmin)lmin=x;if(x>lmax)lmax=x;if(y<rmin)rmin=y;if(y>rmax)rmax=y;}
    const q=v=>Math.max(-127,Math.min(127,Math.round(v*127)));
    out.l.push(q(lmin),q(lmax));out.r.push(q(rmin),q(rmax));
  }
  return out;
}

// ------------------------------------------------------------------------------------------ scanner

/**
 * Streaming scanner. push(left, right) any chunk size; pushBlock(block) takes FS-00 stream blocks and turns
 * sequence gaps / overruns / discontinuities into interrupted time; finish() closes the last partial bin.
 * onBin(bin, {updated}) fires per closed bin (and again with updated=true when a needle lift is found later).
 */
export function createScanner({format,sampleRate,binSec=WEAR_DEFAULTS.binSec,nominalRpm=33.333333,formats=TIMECODE_FORMATS,onBin=null,options={}}={}){
  const fmt=resolveFormat(format,formats),o={...WEAR_DEFAULTS,...options};
  if(!fin(sampleRate)||sampleRate<8000||sampleRate>384000)throw new Error('sampleRate must be between 8000 and 384000 Hz.');
  if(!fin(binSec)||binSec<o.minBinSec||binSec>o.maxBinSec)throw new Error(`binSec must be between ${o.minBinSec} and ${o.maxBinSec} s.`);
  const expectedHz=fmt.carrierHz*nominalRpm/(fmt.atRpm||33.333333);
  const binN=Math.round(binSec*sampleRate),lw=Math.max(16,Math.round(sampleRate*o.levelWinSec));
  const bufL=new Float32Array(binN),bufR=new Float32Array(binN);
  let fill=0,missing=0,discont=false,idx=0,startSample=0,finished=false;
  const bins=[],refLevels=[],refCarriers=[];
  // 1 Hz envelope (mean power per second of capture, missing time = null)
  const env=[];let envPow=0,envN=0,envMissing=0,envFill=0;const envLen=Math.round(sampleRate);
  let lastSeq=null,lastOverrun=null,needleDropSec=null,prevTrailingSilence=0;

  const pushRef=(arr,v)=>{if(!fin(v))return;arr.push(v);if(arr.length>o.refBins)arr.shift();};
  function envAdd(l,r,from,to){
    for(let i=from;i<to;i++){envPow+=(l[i]*l[i]+r[i]*r[i])/2;envN++;if(++envFill>=envLen)envFlush();}
  }
  function envGap(n){while(n>0){const k=Math.min(n,envLen-envFill);envMissing+=k;envFill+=k;n-=k;if(envFill>=envLen)envFlush();}}
  function envFlush(){env.push(envN>envLen/2?round(10*Math.log10(Math.max(envPow/envN,1e-24)),3):null);envPow=0;envN=0;envMissing=0;envFill=0;}

  function closeBin(){
    const n=fill,durSec=(fill+missing)/sampleRate,tSec=startSample/sampleRate;
    const bin={idx,tSec:round(tSec),durSec:round(durSec),snrDb:null,phaseErrDeg:null,balanceDb:null,levelDbfs:null,dropouts:0,flags:0,carrierHz:null,speedErrPct:null,reasons:[],cls:null};
    if(missing>0||discont){bin.flags|=FLAGS.interrupted;bin.reasons.push('stream-gap');}
    if(n>=lw){
      const l=bufL.subarray(0,n),r=bufR.subarray(0,n);
      // level windows: silence runs (needle lift / pause) against the scan's running level
      const refLevel=median(refLevels),silentBelow=Math.max(o.silenceDbfs,fin(refLevel)?refLevel-o.liftDropDb:-Infinity);
      let pow=0,peak=0,run=0,longest=0,lead=-1,firstSound=-1;const nw=Math.floor(n/lw);
      for(let w=0;w<nw;w++){
        let pl=0,pr=0;for(let i=w*lw,e=i+lw;i<e;i++){const a=l[i],b=r[i];pl+=a*a;pr+=b*b;const m=Math.max(Math.abs(a),Math.abs(b));if(m>peak)peak=m;}
        pow+=pl+pr;
        const lev=dbfs(Math.sqrt(Math.min(pl,pr)/lw));
        if(lev<silentBelow){run++;if(run>longest)longest=run;}else{if(lead<0)lead=run;if(firstSound<0)firstSound=w;run=0;}
      }
      for(let i=nw*lw;i<n;i++){pow+=l[i]*l[i]+r[i]*r[i];peak=Math.max(peak,Math.abs(l[i]),Math.abs(r[i]));}
      if(lead<0)lead=run;
      const trailing=run,winSec=lw/sampleRate;
      bin.levelDbfs=round(dbfs(Math.sqrt(pow/(2*n))),3);
      if(peak>=o.clipLevel){bin.flags|=FLAGS.clip;bin.reasons.push('clip');}
      const silentAll=firstSound<0;
      const prev=bins[bins.length-1],afterGap=!prev||(prev.flags&FLAGS.interrupted);
      if(silentAll||longest*winSec>=o.liftMinSec){bin.flags|=FLAGS.interrupted;bin.reasons.push('silence');}
      else if(afterGap&&lead*winSec>=o.edgeSilenceSec){bin.flags|=FLAGS.interrupted;bin.reasons.push('needle-drop');}
      if(!silentAll&&needleDropSec==null)needleDropSec=round(tSec+firstSound*winSec,3);
      // a bin that opens silent after a bin that ended silent: that earlier bin held the needle lift
      if(silentAll||lead*winSec>=o.edgeSilenceSec){
        if(prev&&!(prev.flags&FLAGS.interrupted)&&prevTrailingSilence>=o.edgeSilenceSec&&(silentAll||longest*winSec>=o.liftMinSec)){
          prev.flags|=FLAGS.interrupted;prev.reasons.push('needle-lift');prev.cls='interrupted';
          try{onBin?.(prev,{updated:true});}catch{/* owner callback */}
        }
      }
      prevTrailingSilence=trailing*winSec;
      if(!silentAll&&n>=o.minAnalysisSec*sampleRate){
        const a=analyzeTimecode({left:l,right:r,sampleRate},{format:fmt,nominalRpm,windowSec:o.windowSec,dropoutDb:o.dropoutDb});
        const tr=(a.trace||[]).filter(x=>!x.dropout&&fin(x.snrDb));
        if(tr.length){
          const pe=tr.map(x=>Math.abs(Math.abs(x.phaseDeg)-90));
          bin.snrDb=round(median(tr.map(x=>x.snrDb)),3);
          bin.phaseErrDeg=round(Math.max(...pe),3);
          bin.balanceDb=round(median(tr.map(x=>x.balanceDb)),3);
          bin.carrierHz=round(median(tr.map(x=>x.carrierHz)),4);
          bin.speedErrPct=round((bin.carrierHz/expectedHz-1)*100,4);
          const dm=a.measurements?.find(m=>m.metricId==='tc_dropouts');
          bin.dropouts=fin(dm?.value)?dm.value:0;
          // motion checks only on windows clean enough to trust
          const sure=tr.filter(x=>x.snrDb>=o.motionSnrDb);
          const ref=median(refCarriers);
          if(sure.length){
            const c=sure.map(x=>x.carrierHz),spread=(Math.max(...c)-Math.min(...c))/median(c)*100;
            const reverse=sure.some(x=>x.phaseDeg*directionSign(fmt)<0);
            if(reverse){bin.flags|=FLAGS.interrupted;bin.reasons.push('reverse');}
            const wrong=Math.abs(bin.speedErrPct)>o.wrongSpeedPct;
            if(wrong||spread>o.speedShiftPct||(fin(ref)&&Math.abs(bin.carrierHz/ref-1)*100>o.speedShiftPct)){
              bin.flags|=FLAGS.interrupted|FLAGS.speedShift;bin.reasons.push(wrong?'wrong-speed':'speed-shift');
            }
          }
          if(bin.snrDb<o.lockSnrDb)bin.reasons.push('no-lock');
          else if(sure.length){
            const hits=detectSkips(l,r,sampleRate,{carrierHz:bin.carrierHz,phaseSign:directionSign(fmt),minDeg:o.skipMinDeg,sigma:o.skipSigma,winSec:o.skipWinSec});
            if(hits.length){
              bin.skips=hits.map(x=>({tSec:round(tSec+x.sec,4),deg:round(x.deg,1)}));
              bin.flags|=FLAGS.interrupted;bin.reasons.push('skip');
            }
          }
        }else bin.reasons.push('no-lock');
      }else if(!silentAll){bin.flags|=FLAGS.interrupted;bin.reasons.push('short');}
    }else{bin.flags|=FLAGS.interrupted;if(!bin.reasons.length)bin.reasons.push('short');prevTrailingSilence=0;}
    if(!(bin.flags&FLAGS.interrupted)){pushRef(refLevels,bin.levelDbfs);if(!(bin.flags&FLAGS.speedShift))pushRef(refCarriers,bin.carrierHz);}
    bin.cls=classifyBin(bin);
    if(n>=lw)bin.scope=scopeEnvelope(bufL,bufR,n);
    bins.push(bin);idx++;
    const old=bins[bins.length-1-SCOPE_KEEP_BINS];if(old&&old.scope)delete old.scope;startSample+=fill+missing;fill=0;missing=0;discont=false;
    try{onBin?.(bin,{updated:false});}catch{/* owner callback */}
    return bin;
  }

  function push(left,right){
    if(finished)throw new Error('Scanner already finished.');
    const n=Math.min(left?.length||0,right?.length||0);let i=0;
    while(i<n){
      const k=Math.min(n-i,binN-fill-missing);
      bufL.set(left.subarray?left.subarray(i,i+k):Float32Array.from(left.slice(i,i+k)),fill);
      bufR.set(right.subarray?right.subarray(i,i+k):Float32Array.from(right.slice(i,i+k)),fill);
      envAdd(bufL,bufR,fill,fill+k);
      fill+=k;i+=k;
      if(fill+missing>=binN)closeBin();
    }
  }
  /** Mark `frames` of lost audio (dropped blocks, overruns): time advances, those bins become interrupted. */
  function gap(frames){
    if(finished)throw new Error('Scanner already finished.');
    let g=Math.max(0,Math.round(frames||0));if(!g)return;
    envGap(g);
    while(g>0){const k=Math.min(g,binN-fill-missing);missing+=k;g-=k;if(fill+missing>=binN)closeBin();}
  }
  function pushBlock(block){
    if(!block||!block.frames)return;
    if(block.sampleRate&&block.sampleRate!==sampleRate)throw new Error(`Stream sample rate changed from ${sampleRate} to ${block.sampleRate} Hz.`);
    const q=block.quality||{};
    let lost=0;
    if(lastSeq!=null&&fin(block.seq)&&block.seq>lastSeq+1)lost+=(block.seq-lastSeq-1)*block.frames;
    if(fin(q.overrunSamples)){if(lastOverrun!=null&&q.overrunSamples>lastOverrun)lost+=q.overrunSamples-lastOverrun;lastOverrun=q.overrunSamples;}
    if(fin(block.seq))lastSeq=block.seq;
    if(lost)gap(lost);
    if(q.discontinuity)discont=true;
    push(block.left,block.right);
  }
  const elapsedSec=()=>(startSample+fill+missing)/sampleRate;
  function result(final){
    const flushEnv=final&&envFill>0?[...env,envN>Math.max(1,envFill/2)?round(10*Math.log10(Math.max(envPow/envN,1e-24)),3):null]:env.slice();
    return {format:fmt.name,formatInfo:{name:fmt.name,carrierHz:fmt.carrierHz,phaseSign:fmt.phaseSign??1,primary:fmt.primary??'right',directionSign:directionSign(fmt)},sampleRate,binSec,nominalRpm,
      bins:bins.map(b=>({...b,reasons:[...b.reasons],...(b.skips?{skips:b.skips.map(x=>({...x}))}:{})})),elapsedSec:round(elapsedSec(),3),
      skips:bins.flatMap(b=>b.skips||[]).map(x=>({...x})),
      envelope:{hz:1,db:flushEnv},needleDropSec,fromNeedleDrop:needleDropSec!=null&&needleDropSec>=o.edgeSilenceSec,finished:final};
  }
  return {
    push,pushBlock,gap,
    get bins(){return bins;},
    get elapsedSec(){return elapsedSec();},
    /** Samples currently held (bounded by one bin). */
    bufferedSamples:()=>fill,
    capacitySamples:()=>binN*2,
    snapshot:()=>result(false),
    finish(){
      if(finished)return result(true);
      // keep a trailing partial bin when it holds enough audio to analyse; else count its time as interrupted
      if(fill+missing>0){
        if(fill>=o.minAnalysisSec*sampleRate||missing>0)closeBin();
        else{startSample+=fill;fill=0;}
      }
      // a final bin that ends in silence held the needle lift
      const last=bins[bins.length-1];
      if(last&&!(last.flags&FLAGS.interrupted)&&prevTrailingSilence>=o.edgeSilenceSec){last.flags|=FLAGS.interrupted;last.reasons.push('needle-lift');last.cls='interrupted';try{onBin?.(last,{updated:true});}catch{/* owner callback */}}
      finished=true;
      return result(true);
    }
  };
}

/** Whole-side scan over an iterable of chunks ({left,right} or [left,right]); same result as the streaming scanner. */
export function scanSide(chunks,{format,sampleRate,binSec=WEAR_DEFAULTS.binSec,nominalRpm,formats,options}={}){
  const s=createScanner({format,sampleRate,binSec,nominalRpm,formats,options});
  for(const c of chunks||[]){const [l,r]=Array.isArray(c)?c:[c.left,c.right];s.push(l,r);}
  return s.finish();
}

/**
 * Drive a scanner from the FS-00 streaming capture (startStreamSession from app/ui/audio-io.js, injected so
 * this module stays pure). Autosaves every `autosaveSec` of capture through onAutosave(snapshot).
 * Returns {session, stop() -> result, snapshot(), elapsedSec()}.
 */
export async function startWearScan({startStreamSession,holder='wear-map',deviceName=null,sampleRate=null,blockMs=1000,format,binSec=WEAR_DEFAULTS.binSec,nominalRpm,formats,options,autosaveSec=30,onBin=null,onProgress=null,onAutosave=null,onEnd=null}={}){
  if(typeof startStreamSession!=='function')throw new Error('startWearScan needs startStreamSession (app/ui/audio-io.js).');
  resolveFormat(format,formats);
  let scanner=null,lastSave=0,blockError=null;
  const ensure=sr=>scanner||(scanner=createScanner({format,sampleRate:sr,binSec,nominalRpm,formats,onBin,options}));
  const session=await startStreamSession({holder,deviceName,sampleRate,blockMs,
    onBlock:block=>{
      try{
        ensure(block.sampleRate).pushBlock(block);
        const el=scanner.elapsedSec;
        try{onProgress?.({elapsedSec:el,bins:scanner.bins.length});}catch{/* owner callback */}
        if(onAutosave&&autosaveSec>0&&el-lastSave>=autosaveSec){lastSave=el;try{onAutosave(scanner.snapshot());}catch{/* owner callback */}}
      }catch(e){blockError=e;}
    },
    onEnd:ev=>{try{onEnd?.(ev);}catch{/* owner callback */}}});
  return {
    session,
    get error(){return blockError;},
    elapsedSec:()=>scanner?.elapsedSec??0,
    snapshot:()=>scanner?.snapshot()??null,
    async stop(){await session.stop();return scanner?scanner.finish():null;}
  };
}

// ------------------------------------------------------------------------------------------ verdict

function binStats(bins,{classThresholds,baseline=null,lowSnrDb=VERDICT_THRESHOLDS.lowSnrDb}={}){
  let good=0,degraded=0,bad=0,interrupted=0,noLock=0,dropouts=0,low=0,validSec=0;
  for(const b of bins){
    const reasons=b.reasons||[];
    // no lock = carrier missing / far off the format's carrier (wrong format or speed), not a pause or lift
    if(reasons.includes('no-lock')||reasons.includes('wrong-speed'))noLock++;
    const c=classifyBin(b,{thresholds:classThresholds,baseline});
    if(c==='interrupted'){interrupted++;continue;}
    validSec+=fin(b.durSec)?b.durSec:0;
    if(c==='good')good++;else if(c==='degraded')degraded++;else bad++;
    dropouts+=b.dropouts||0;if(fin(b.snrDb)&&b.snrDb<lowSnrDb)low++;
  }
  const valid=good+degraded+bad;
  return {validBins:valid,interruptedBins:interrupted,totalBins:bins.length,goodPct:pct(good,valid),degradedPct:pct(degraded,valid),badPct:pct(bad,valid),
    lockLostPct:pct(noLock,bins.length),dropouts,lowSnrPct:pct(low,valid),validSec,score:valid?100*(good+.5*degraded)/valid:null};
}

const badPctOf=s=>fin(s)?s:fin(s?.badPct)?s.badPct:fin(s?.summary?.badPct)?s.summary.badPct:Array.isArray(s?.bins)?binStats(s.bins).badPct:null;

/** Least-squares slope of y over 0..n-1. */
function slope(ys){const n=ys.length;if(n<2)return 0;const mx=(n-1)/2,my=ys.reduce((a,b)=>a+b,0)/n;let sxy=0,sxx=0;ys.forEach((y,x)=>{sxy+=(x-mx)*(y-my);sxx+=(x-mx)**2;});return sxy/sxx;}

/** The three worst valid bins: bad before degraded, then lowest SNR, most dropouts, largest phase error. */
export function worstBins(bins,{count=3,thresholds,baseline}={}){
  return bins.map(b=>({b,c:classifyBin(b,{thresholds,baseline})})).filter(x=>x.c!=='interrupted')
    .sort((x,y)=>CLASS_RANK[y.c]-CLASS_RANK[x.c]||(x.b.snrDb??-Infinity)-(y.b.snrDb??-Infinity)||(y.b.dropouts||0)-(x.b.dropouts||0)||(y.b.phaseErrDeg??0)-(x.b.phaseErrDeg??0)||x.b.idx-y.b.idx)
    .slice(0,count).map(({b,c})=>({idx:b.idx,tSec:b.tSec,time:formatTime(b.tSec),class:c,snrDb:b.snrDb,phaseErrDeg:b.phaseErrDeg,dropouts:b.dropouts||0}));
}

const fmtPct=p=>p>=1||p===0?String(Math.round(p)):p.toFixed(1);

/**
 * Scan verdict (FS-13 §6): keep / watch / other_side / replace / incomplete with the reasons, the three worst
 * bins and the user-facing message. Interrupted bins never count.
 * @param {Array} bins
 * @param {object} [ctx]
 * @param {Array<number|{badPct:number}>} [ctx.history] earlier scans of this side, oldest first.
 * @param {number|{badPct:number}|null} [ctx.otherSide] latest scan of the other side of the same copy.
 * @param {boolean} [ctx.stylusRed] latest stylus benchmark (FS-12) is red: annotate, and Replace -> Watch.
 * @param {number|null} [ctx.coverage] 0..1 of the side (null = side length unknown).
 */
export function verdict(bins,{history=[],otherSide=null,stylusRed=false,coverage=null,sideLabel=null,thresholds={},classThresholds,baseline=null}={}){
  const t={...VERDICT_THRESHOLDS,...thresholds},list=bins||[],s=binStats(list,{classThresholds,baseline,lowSnrDb:t.lowSnrDb});
  const reasons=[];let v;
  const other=otherSide==null?null:badPctOf(otherSide);
  const hist=(history||[]).map(badPctOf).filter(fin);
  const trendPts=[...hist,s.badPct].slice(-t.trendScans),trend=trendPts.length>=t.trendScans?slope(trendPts):null;
  const lockError=s.lockLostPct>WEAR_DEFAULTS.lockLostErrorPct;
  if(!s.validBins||lockError||(fin(coverage)&&coverage<WEAR_DEFAULTS.minCoverage)){
    v='incomplete';reasons.push(lockError?'lock-lost':!s.validBins?'no-valid-bins':'low-coverage');
  }else if(s.badPct>=t.replaceBadPct||(fin(trend)&&trend>t.trendPointsPerScan)||(s.badPct>=t.otherSideBadPct&&fin(other)&&other>=t.otherSideBadPct)){
    v='replace';
    if(s.badPct>=t.replaceBadPct)reasons.push('bad-share');
    if(fin(trend)&&trend>t.trendPointsPerScan)reasons.push('trend');
    if(s.badPct>=t.otherSideBadPct&&fin(other)&&other>=t.otherSideBadPct)reasons.push('both-sides');
  }else if(s.badPct>=t.otherSideBadPct&&fin(other)&&other<t.otherSideCleanBadPct){v='other_side';reasons.push('other-side-clean');}
  else if(s.badPct<t.keepBadPct&&s.degradedPct<t.keepDegradedPct)v='keep';
  else if(s.badPct<t.watchBadPct||s.degradedPct<t.watchDegradedPct){v='watch';reasons.push(s.badPct>=t.keepBadPct?'some-bad':'some-degraded');}
  else{v='replace';reasons.push('widespread');}
  let stylusNote=null;
  if(stylusRed){stylusNote='Stylus may be the cause: the latest stylus benchmark is red.';if(v==='replace'){v='watch';reasons.push('stylus-downgrade');}}
  const partial=fin(coverage)&&coverage<.98;
  const valid=list.filter(b=>classifyBin(b,{thresholds:classThresholds,baseline})!=='interrupted');
  const withDrop=valid.filter(b=>(b.dropouts||0)>0);
  const side=sideLabel?`Side ${sideLabel}`:'This side';
  const headline={keep:'Keep using this side.',watch:'Watch this side.',other_side:'Use the other side.',replace:'Replace this record.',incomplete:'Scan incomplete.'}[v];
  const parts=[];
  if(v==='incomplete'&&lockError)parts.push('Timecode lock was lost for more than 20 % of the scan. Check format selection and phono/line.');
  else if(v==='incomplete'&&!s.validBins)parts.push('No usable timecode was captured.');
  else{
    const d=[];
    if(s.dropouts>0){const a=withDrop[0],b=withDrop[withDrop.length-1],end=b.tSec+(b.durSec||0);
      d.push(`${s.dropouts} dropout${s.dropouts===1?'':'s'} ${withDrop.length>1||a.durSec?`between ${formatTime(a.tSec)} and ${formatTime(end)}`:`at ${formatTime(a.tSec)}`}`);}
    if(s.lowSnrPct>0)d.push(`SNR below ${t.lowSnrDb} dB over ${fmtPct(s.lowSnrPct)} % of the side`);
    parts.push(d.length?`${side} has ${d.join(' and ')}.`:`${side} shows no dropouts and SNR stays at or above ${t.lowSnrDb} dB.`);
  }
  if(partial)parts.push(`Scanned ${Math.round(coverage*100)} % of the side.`);
  if(stylusNote)parts.push(stylusNote);
  return {verdict:v,label:VERDICT_LABELS[v],headline,message:[headline,...parts].join(' '),reasons,
    stats:{...s,goodPct:round(s.goodPct),degradedPct:round(s.degradedPct),badPct:round(s.badPct),lowSnrPct:round(s.lowSnrPct),lockLostPct:round(s.lockLostPct),score:round(s.score,3),trendPointsPerScan:round(trend,3)},
    worst:worstBins(list,{thresholds:classThresholds,baseline}),score:round(s.score,3),coverage,partial,stylusNote,lockError};
}

/**
 * Coverage of the side by valid bins, 0..1. When the side length is unknown the basis is the elapsed capture.
 * @returns {{coverage:number,basis:'side'|'elapsed',validSec:number}}
 */
export function scanCoverage(result,{sideDurationSec:sd=null}={}){
  const validSec=(result?.bins||[]).filter(b=>!(b.flags&FLAGS.interrupted)).reduce((a,b)=>a+(b.durSec||0),0);
  if(fin(sd)&&sd>0)return {coverage:round(clamp(validSec/sd,0,1)),basis:'side',validSec:round(validSec,3)};
  const el=result?.elapsedSec||0;
  return {coverage:el>0?round(clamp(validSec/el,0,1)):0,basis:'elapsed',validSec:round(validSec,3)};
}

// ------------------------------------------------------------------------------------------ alignment and diff

function parts(s){
  const sum=s?.summary||{};
  return {bins:s?.bins||[],binSec:s?.binSec??sum.binSec??WEAR_DEFAULTS.binSec,env:(s?.envelope||sum.envelope)?.db||[],
    fromNeedleDrop:Boolean(s?.fromNeedleDrop??sum.fromNeedleDrop),needleDropSec:s?.needleDropSec??sum.needleDropSec??null};
}

/**
 * Offset between two scans of the same side: tA = tB + offsetSec. Both captured from the needle drop ->
 * needle-drop times; otherwise normalised cross-correlation of the 1 Hz level envelopes (accepted at
 * confidence >= 0.6, refined to sub-second by a parabola). Returns offsetSec null when not aligned.
 */
export function alignScans(a,b,{minConfidence=.6,maxLagSec=null,minOverlapSec=10}={}){
  const A=parts(a),B=parts(b);
  if(A.fromNeedleDrop&&B.fromNeedleDrop&&fin(A.needleDropSec)&&fin(B.needleDropSec))
    return {offsetSec:round(A.needleDropSec-B.needleDropSec,3),confidence:1,method:'needle-drop',aligned:true};
  const prep=e=>{const v=e.filter(fin),ref=median(v);return e.map(x=>fin(x)&&fin(ref)?clamp(x,ref-40,ref+10):null);};
  const ea=prep(A.env),eb=prep(B.env),na=ea.length,nb=eb.length;
  // short overlaps correlate by chance: demand at least half of the shorter envelope (and minOverlapSec)
  const minOv=Math.min(Math.min(na,nb),Math.max(3,minOverlapSec,Math.ceil(Math.min(na,nb)*.5)));
  const maxLag=Math.floor(maxLagSec??Math.max(na,nb));
  const corr=lag=>{ // pairs (ea[i+lag], eb[i])
    let n=0,sa=0,sb=0;const xs=[],ys=[];
    for(let i=Math.max(0,-lag);i<nb&&i+lag<na;i++){const x=ea[i+lag],y=eb[i];if(x==null||y==null)continue;xs.push(x);ys.push(y);sa+=x;sb+=y;n++;}
    if(n<minOv)return null;
    const ma=sa/n,mb=sb/n;let sxy=0,sxx=0,syy=0;
    for(let k=0;k<n;k++){const dx=xs[k]-ma,dy=ys[k]-mb;sxy+=dx*dy;sxx+=dx*dx;syy+=dy*dy;}
    return sxx>0&&syy>0?sxy/Math.sqrt(sxx*syy):null;
  };
  let best=null,bestLag=0;const cache=new Map();
  for(let lag=-Math.min(maxLag,nb);lag<=Math.min(maxLag,na);lag++){const r=corr(lag);cache.set(lag,r);if(r!=null&&(best==null||r>best)){best=r;bestLag=lag;}}
  if(best==null)return {offsetSec:null,confidence:0,method:'region',aligned:false};
  let frac=0;const rm=cache.get(bestLag-1),rp=cache.get(bestLag+1);
  if(rm!=null&&rp!=null){const den=rm-2*best+rp;if(den<0)frac=clamp(.5*(rm-rp)/den,-.5,.5);}
  // envelope sample k covers [k, k+1) s, so lag in samples is lag in seconds at 1 Hz
  const offsetSec=round(bestLag+frac,3);
  return best>=minConfidence?{offsetSec,confidence:round(best,4),method:'envelope',aligned:true}:{offsetSec:null,confidence:round(best,4),method:'region',aligned:false,bestOffsetSec:offsetSec};
}

/**
 * Per-bin change from scan `a` (earlier) to scan `b` (newer) with tA = tB + offsetSec. Bins interrupted in
 * either scan, or with no partner, are marked excluded. newBad = good -> bad; withinNoise = |SNR change| < 3 dB.
 */
export function diffScans(a,b,{offsetSec=0,noiseDb=NOISE_DB,thresholds}={}){
  const A=parts(a),B=parts(b),bsA=A.binSec||WEAR_DEFAULTS.binSec,byKey=new Map();
  for(const x of A.bins)byKey.set(Math.round(x.tSec/bsA),x);
  return B.bins.map(y=>{
    const x=byKey.get(Math.round((y.tSec+(offsetSec||0))/bsA))||null;
    const before=x?classifyBin(x,{thresholds}):null,after=classifyBin(y,{thresholds});
    const excluded=!x||before==='interrupted'||after==='interrupted';
    const snrDelta=!excluded&&fin(x.snrDb)&&fin(y.snrDb)?round(y.snrDb-x.snrDb,3):null;
    const dropoutDelta=excluded?null:(y.dropouts||0)-(x.dropouts||0);
    return {idx:y.idx,tSec:y.tSec,prevIdx:x?.idx??null,prevTSec:x?.tSec??null,before,after,excluded,snrDelta,dropoutDelta,
      newDropouts:excluded?0:Math.max(0,dropoutDelta),newBad:!excluded&&before==='good'&&after==='bad',
      worse:!excluded&&CLASS_RANK[after]>CLASS_RANK[before],withinNoise:snrDelta==null?null:Math.abs(snrDelta)<noiseDb};
  });
}

/** Region summary for scans that could not be aligned: `regions` equal slices of each scan's own length. */
export function regionSummary(s,{regions=10,thresholds}={}){
  const {bins}=parts(s);if(!bins.length)return [];
  const end=Math.max(...bins.map(b=>b.tSec+(b.durSec||0))),out=[];
  for(let k=0;k<regions;k++){
    const lo=end*k/regions,hi=end*(k+1)/regions,inR=bins.filter(b=>b.tSec>=lo&&b.tSec<hi);
    const st=binStats(inR,{classThresholds:thresholds});
    out.push({region:k,fromSec:round(lo,3),toSec:round(hi,3),validBins:st.validBins,badPct:round(st.badPct),medianSnrDb:median(inR.filter(b=>classifyBin(b,{thresholds})!=='interrupted').map(b=>b.snrDb)),dropouts:st.dropouts});
  }
  return out;
}

/** Compare a newer scan with an earlier one of the same side: bin deltas when aligned, else region deltas. */
export function compareScans(prev,cur,{alignment=null,noiseDb=NOISE_DB,regions=10,thresholds}={}){
  const al=alignment||alignScans(prev,cur);
  if(!al.aligned){
    const ra=regionSummary(prev,{regions,thresholds}),rb=regionSummary(cur,{regions,thresholds});
    const regionsOut=rb.map((r,k)=>{const p=ra[k];const d=p&&fin(p.medianSnrDb)&&fin(r.medianSnrDb)?round(r.medianSnrDb-p.medianSnrDb,3):null;
      return {...r,prevBadPct:p?.badPct??null,badPctDelta:p?round(r.badPct-p.badPct):null,snrDelta:d,withinNoise:d==null?null:Math.abs(d)<noiseDb};});
    return {mode:'region',alignment:al,regions:regionsOut,summary:{newBad:null,newDropouts:null,medianSnrDelta:median(regionsOut.map(r=>r.snrDelta)),compared:regionsOut.length}};
  }
  const deltas=diffScans(prev,cur,{offsetSec:al.offsetSec,noiseDb,thresholds}),used=deltas.filter(d=>!d.excluded);
  const med=median(used.map(d=>d.snrDelta));
  return {mode:'bin',alignment:al,deltas,summary:{newBad:used.filter(d=>d.newBad).length,newDropouts:used.reduce((a,d)=>a+d.newDropouts,0),
    medianSnrDelta:med,withinNoise:med==null?null:Math.abs(med)<noiseDb,compared:used.length}};
}

// ------------------------------------------------------------------------------------------ geometry

/** Groove radius (mm) for a time into the side: r(t) = r_out - (r_out - r_in) t / T (constant pitch model). */
export function positionToRadius(tSec,geom={}){
  const g={...DEFAULT_GEOMETRY,...geom},T=g.durationSec;
  if(!fin(T)||T<=0)throw new Error('positionToRadius needs geom.durationSec > 0.');
  return g.outerMm-(g.outerMm-g.innerMm)*clamp(tSec/T,0,1);
}

/** Metric value and quality q (0 worst .. 1 best) of one bin. */
export function metricQuality(bin,metric='snr',{thresholds=CLASS_THRESHOLDS}={}){
  const t={...CLASS_THRESHOLDS,...thresholds};
  if(metric==='phase'){const v=bin.phaseErrDeg;return {value:v,q:fin(v)?1-clamp(v/(t.badPhaseErrDeg+15),0,1):null};}
  if(metric==='dropouts'){const v=bin.dropouts||0;return {value:v,q:1-clamp(v/(t.badDropouts+1),0,1)};}
  if(metric!=='snr')throw new Error(`Unknown metric: ${metric}`);
  const v=bin.snrDb,lo=t.badSnrDb-5,hi=t.goodSnrDb+5;
  return {value:v,q:fin(v)?clamp((v-lo)/(hi-lo),0,1):null};
}

/** Colour for a quality q (0..1) on QUALITY_COLOR_RAMP; null for null q. */
export function qualityColor(q){
  if(!fin(q))return null;
  const x=clamp(q,0,1),R=QUALITY_COLOR_RAMP;let i=0;while(i<R.length-2&&x>R[i+1].q)i++;
  const a=R[i],b=R[i+1],f=(x-a.q)/(b.q-a.q),h=s=>[1,3,5].map(k=>parseInt(s.slice(k,k+2),16));
  const ca=h(a.color),cb=h(b.color);
  return '#'+ca.map((c,k)=>Math.round(c+(cb[k]-c)*f).toString(16).padStart(2,'0')).join('');
}

/**
 * Bins as arcs along a spiral from the outer edge (t = 0) to the run-out. Angles in radians, 0 at 12 o'clock,
 * increasing clockwise (the platter's direction seen from above); radii in mm at the arc's start and end;
 * `width` = radial band of one visual turn. Interrupted bins have color null (draw neutral) and interrupted
 * true; bad bins have hatch true.
 * @param {object} [geom] DEFAULT_GEOMETRY plus durationSec (default: end of the last bin) and turns.
 */
export function binsToArcs(bins,geom={},metric='snr',{thresholds}={}){
  const list=bins||[];if(!list.length)return [];
  const end=Math.max(...list.map(b=>b.tSec+(b.durSec||0)));
  const g={...DEFAULT_GEOMETRY,turns:DEFAULT_TURNS,...geom};g.durationSec=fin(geom.durationSec)&&geom.durationSec>0?geom.durationSec:end;
  const turns=Math.max(1,g.turns),width=(g.outerMm-g.innerMm)/turns,ang=t=>2*Math.PI*turns*clamp(t/g.durationSec,0,1);
  return list.map(b=>{
    const t0=b.tSec,t1=b.tSec+(b.durSec||0),cls=classifyBin(b,{thresholds}),{value,q}=metricQuality(b,metric,{thresholds});
    const interrupted=cls==='interrupted';
    return {idx:b.idx,tSec:t0,endSec:t1,a0:ang(t0),a1:ang(t1),r0:positionToRadius(t0,g),r1:positionToRadius(t1,g),width,
      metric,value:value??null,q:interrupted?null:q,color:interrupted?null:qualityColor(q),cls,hatch:cls==='bad',interrupted};
  });
}

const METRIC_TEXT={snr:b=>fin(b.snrDb)?`SNR ${Math.round(b.snrDb)} dB`:'no SNR',phase:b=>fin(b.phaseErrDeg)?`phase error ${Math.round(b.phaseErrDeg)} deg`:'no phase',dropouts:b=>`${b.dropouts||0} dropout${b.dropouts===1?'':'s'}`};
/** Screen-reader text for keyboard focus on a bin: "Bin 412, 14:20, SNR 27 dB". */
export function binLabel(bin,metric='snr'){
  const base=`Bin ${bin.idx}, ${formatTime(bin.tSec)}`;
  if(bin.flags&FLAGS.interrupted)return `${base}, interrupted`;
  return `${base}, ${(METRIC_TEXT[metric]||METRIC_TEXT.snr)(bin)}`;
}

// ------------------------------------------------------------------------------------------ records and store

const DB_BIN_KEYS=['idx','tSec','snrDb','phaseErrDeg','balanceDb','levelDbfs','dropouts','flags'];
const RANGES={tSec:[0,7200],snrDb:[-100,200],phaseErrDeg:[0,180],balanceDb:[-120,120],levelDbfs:[-400,40]};

/** Validate a scan record (same rules as src-tauri/src/wearmap.rs; also used for imported scans). Returns the record. */
export function validateScanRecord(rec){
  if(!rec||typeof rec!=='object')throw new Error('Wear scan must be an object.');
  const f=String(rec.format??'').trim();
  if(!f||[...f].length>80)throw new Error('Wear scan format must be 1 to 80 characters.');
  if(!String(rec.recordSideId??'').trim())throw new Error('Wear scan needs a record side.');
  if(!fin(rec.binSec)||rec.binSec<1||rec.binSec>5)throw new Error('Wear scan binSec must be between 1 and 5.');
  if(!fin(rec.coverage)||rec.coverage<0||rec.coverage>1)throw new Error('Wear scan coverage must be between 0 and 1.');
  if(!VERDICTS.includes(rec.verdict))throw new Error(`Wear scan verdict must be one of ${VERDICTS.join(', ')}.`);
  if(rec.score!=null&&(!fin(rec.score)||rec.score<0||rec.score>100))throw new Error('Wear scan score must be between 0 and 100.');
  for(const k of ['summary','geometry'])if(rec[k]!=null&&(typeof rec[k]!=='object'||Array.isArray(rec[k])))throw new Error(`Wear scan ${k} must be an object.`);
  const bins=rec.bins||[];
  if(!Array.isArray(bins)||bins.length>MAX_BINS)throw new Error(`A wear scan holds at most ${MAX_BINS} bins.`);
  const seen=new Set();
  for(const b of bins){
    if(!Number.isInteger(b?.idx)||b.idx<0||b.idx>=MAX_BINS*10)throw new Error('Wear bin idx is out of range.');
    if(seen.has(b.idx))throw new Error(`Wear bin idx ${b.idx} appears twice.`);seen.add(b.idx);
    for(const [k,[lo,hi]] of Object.entries(RANGES)){const v=b[k];if(k==='tSec'?!fin(v)||v<lo||v>hi:v!=null&&(!fin(v)||v<lo||v>hi))throw new Error(`Wear bin ${b.idx}: ${k} must be between ${lo} and ${hi}.`);}
    if(!Number.isInteger(b.dropouts??0)||(b.dropouts??0)<0)throw new Error(`Wear bin ${b.idx}: dropouts must be a count.`);
    if(!Number.isInteger(b.flags??0)||(b.flags??0)<0||(b.flags??0)>7)throw new Error(`Wear bin ${b.idx}: flags must be between 0 and 7.`);
  }
  return rec;
}

/**
 * Build the wearmap_save record from a scanner result and its verdict. Summary carries what comparisons need
 * later (envelope, needle drop, class shares, worst bins); bins carry only the stored columns.
 */
export function toScanRecord(result,v,{recordSideId,sideLabel=null,sideDurationSec:sd=null,coverage=null,coverageBasis=null,sessionId=null,stylusAssetId=null,fullSideScanId=null,geometry=DEFAULT_GEOMETRY}={}){
  const cov=coverage!=null?{coverage,basis:coverageBasis||'side'}:scanCoverage(result,{sideDurationSec:sd});
  const st=v.stats||{};
  const summary={v:1,sideLabel,sideDurationSec:sd,coverageBasis:cov.basis,elapsedSec:result.elapsedSec,validBins:st.validBins,interruptedBins:st.interruptedBins,
    goodPct:st.goodPct,degradedPct:st.degradedPct,badPct:st.badPct,lockLostPct:st.lockLostPct,lowSnrPct:st.lowSnrPct,dropouts:st.dropouts,
    fromNeedleDrop:result.fromNeedleDrop,needleDropSec:result.needleDropSec,worst:v.worst,envelope:result.envelope,reasons:v.reasons,stylusNote:v.stylusNote,
    message:v.message,nominalRpm:result.nominalRpm,sampleRate:result.sampleRate,skips:(result.skips||[]).slice(0,MAX_SUMMARY_SKIPS).map(x=>({tSec:x.tSec,deg:x.deg}))};
  return validateScanRecord({fullSideScanId,recordSideId,sessionId,stylusAssetId,format:result.format,binSec:result.binSec,coverage:cov.coverage,
    verdict:v.verdict,score:v.score,summary,geometry:{...geometry},bins:result.bins.map(b=>Object.fromEntries(DB_BIN_KEYS.map(k=>[k,b[k]??(k==='dropouts'||k==='flags'?0:null)])))});
}

const LS_KEY='deckchek.wearmap.v1',LS_MAX_SCANS=12;
const nativeInvoke=()=>globalThis.window?.__TAURI__?.core?.invoke??globalThis.__TAURI__?.core?.invoke??null;

/** Store bridge: Tauri commands wearmap_save/list/get/delete, or a small localStorage store in browser mode. */
export function createWearMapApi({invoke=nativeInvoke(),storage=globalThis.localStorage??null,now=()=>new Date().toISOString(),newId=()=>globalThis.crypto?.randomUUID?.()??`scan-${Date.now()}-${Math.random().toString(16).slice(2)}`}={}){
  if(invoke)return {native:true,
    save:async scan=>invoke('wearmap_save',{scan:validateScanRecord(scan)}),
    list:async({recordSideId=null,limit=null}={})=>invoke('wearmap_list',{recordSideId,limit}),
    get:async id=>invoke('wearmap_get',{id}),
    delete:async id=>invoke('wearmap_delete',{id})};
  const read=()=>{try{const v=JSON.parse(storage?.getItem(LS_KEY)||'[]');return Array.isArray(v)?v:[];}catch{return [];}};
  const write=list=>{try{storage?.setItem(LS_KEY,JSON.stringify(list.slice(0,LS_MAX_SCANS)));}catch{/* quota or blocked storage */}};
  const summary=({bins,...s})=>({...s,binCount:bins.length});
  return {native:false,
    async save(scan){validateScanRecord(scan);const stored={fullSideScanId:null,sessionId:null,stylusAssetId:null,score:null,...scan,summary:scan.summary||{},geometry:scan.geometry||{},format:scan.format.trim(),id:newId(),createdAt:now(),bins:[...(scan.bins||[])].sort((a,b)=>a.idx-b.idx)};
      write([stored,...read()]);return summary(stored);},
    async list({recordSideId=null,limit=null}={}){return read().filter(s=>recordSideId==null||s.recordSideId===recordSideId).slice(0,limit||LS_MAX_SCANS).map(summary);},
    async get(id){const s=read().find(x=>x.id===id);return s?{...summary(s),bins:s.bins}:null;},
    async delete(id){const l=read(),k=l.filter(x=>x.id!==id);write(k);return k.length!==l.length;}};
}
