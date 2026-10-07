import { clippingCount, dbfs, peak, rms } from './core.js';
import { generateSine } from './advanced.js';

const DB_PER_NEPER=20/Math.LN10; // 8.686 dB per unit relative amplitude
const LEAD_SEC=.05,MARKER_SEC=.01,GAP_SEC=.15,TAIL_SEC=.1,STEP_SEC=.3,FADE_SEC=.005,TRIM_SEC=.05;
export const DEFAULT_COMPONENTS={gainDb:.5,mismatchDb:.3,clockPpm:100,thdChainPercent:.1,calibratedClockFloorPpm:10,assumedSnrDb:40};

// ---------- stimulus ----------
function fade(out,start,end,sr,fadeSec=FADE_SEC){const n=Math.min(Math.floor(fadeSec*sr),Math.floor((end-start)/2));for(let i=0;i<n;i++){const g=.5-.5*Math.cos(Math.PI*i/n);out[start+i]*=g;out[end-1-i]*=g;}}
/** Marker burst: Hann-windowed 2-8 kHz chirp used for latency detection. */
export function markerSignal(sampleRate,amplitude=.5){const n=Math.max(8,Math.floor(MARKER_SEC*sampleRate)),out=new Float32Array(n),f0=2000,f1=Math.min(8000,sampleRate*.4);for(let i=0;i<n;i++){const t=i/sampleRate,T=n/sampleRate,ph=2*Math.PI*(f0*t+(f1-f0)*t*t/(2*T));out[i]=amplitude*(.5-.5*Math.cos(2*Math.PI*i/(n-1)))*Math.sin(ph);}return out;}
/** Stereo loopback stimulus: lead silence, marker, silent gap, 1 kHz tone, stepped-frequency response segments, tail silence. */
export function loopbackStimulus({sampleRate=48000,durationSec=2,levelDbfs=-20,freqHz=1000,steps=[100,10000]}={}){
  const amp=Math.pow(10,levelDbfs/20),markerStart=Math.floor(LEAD_SEC*sampleRate),marker=markerSignal(sampleRate,amp);
  const markerEnd=markerStart+marker.length,toneStart=markerEnd+Math.floor(GAP_SEC*sampleRate);
  const segs=[{hz:freqHz,dur:durationSec,name:'tone'},...steps.filter(f=>f>0&&f<sampleRate*.45).map(hz=>({hz,dur:STEP_SEC,name:'step'}))];
  let pos=toneStart;const layout=segs.map(s=>{const start=pos,end=start+Math.floor(s.dur*sampleRate);pos=end;return {name:s.name,hz:s.hz,start,end};});
  const total=pos+Math.floor(TAIL_SEC*sampleRate),left=new Float32Array(total);left.set(marker,markerStart);
  for(const s of layout){const sine=generateSine({frequencyHz:s.hz,sampleRate,durationSec:(s.end-s.start)/sampleRate,amplitude:amp});left.set(sine.subarray(0,s.end-s.start),s.start);fade(left,s.start,s.end,sampleRate);}
  const meta={sampleRate,levelDbfs,freqHz,amplitude:amp,markerStart,markerEnd,gapStart:markerEnd,gapEnd:toneStart,tone:layout[0],steps:layout.slice(1),totalSamples:total};
  return {left,right:Float32Array.from(left),meta};
}

// ---------- low-level estimators ----------
function solve3(m,b){const a=m.map((r,i)=>[...r,b[i]]);for(let c=0;c<3;c++){let p=c;for(let r=c+1;r<3;r++)if(Math.abs(a[r][c])>Math.abs(a[p][c]))p=r;[a[c],a[p]]=[a[p],a[c]];if(Math.abs(a[c][c])<1e-18)return null;for(let r=0;r<3;r++)if(r!==c){const f=a[r][c]/a[c][c];for(let k=c;k<4;k++)a[r][k]-=f*a[c][k];}}return a.map((r,i)=>r[3]/r[i]);}
/** Least-squares sine fit (sin, cos, DC) at a known frequency; returns amplitude, phase, dc and residual RMS. */
export function fitTone(samples,sampleRate,frequencyHz){
  const n=samples.length,w=2*Math.PI*frequencyHz/sampleRate;let ss=0,sc=0,s1=0,cc=0,c1=0,xs=0,xc=0,x1=0;
  for(let i=0;i<n;i++){const s=Math.sin(w*i),c=Math.cos(w*i),x=samples[i];ss+=s*s;sc+=s*c;s1+=s;cc+=c*c;c1+=c;xs+=x*s;xc+=x*c;x1+=x;}
  const sol=solve3([[ss,sc,s1],[sc,cc,c1],[s1,c1,n]],[xs,xc,x1]);if(!sol)return {amplitude:0,phase:0,dc:0,residualRms:rms(samples)};
  const [a,b,dc]=sol;let res=0;for(let i=0;i<n;i++){const e=samples[i]-(a*Math.sin(w*i)+b*Math.cos(w*i)+dc);res+=e*e;}
  return {amplitude:Math.hypot(a,b),phase:Math.atan2(b,a),dc,residualRms:Math.sqrt(res/Math.max(1,n))};
}
/** Sub-bin tone frequency by regressing lock-in phase over consecutive segments; returns {frequencyHz, ppm}. */
export function refineToneFrequency(samples,sampleRate,nominalHz,{segments=10}={}){
  const n=samples.length,seg=Math.floor(n/segments),w=2*Math.PI*nominalHz/sampleRate;if(seg<8)return {frequencyHz:nominalHz,ppm:0};
  const pts=[];let prev=null,off=0;
  for(let k=0;k<segments;k++){let ic=0,is=0;for(let i=k*seg;i<(k+1)*seg;i++){ic+=samples[i]*Math.cos(w*i);is+=samples[i]*Math.sin(w*i);}
    let ph=Math.atan2(ic,is);if(prev!==null){while(ph+off-prev>Math.PI)off-=2*Math.PI;while(ph+off-prev<-Math.PI)off+=2*Math.PI;}ph+=off;prev=ph;pts.push([k*seg+seg/2,ph]);}
  const m=pts.length,mx=pts.reduce((a,p)=>a+p[0],0)/m,my=pts.reduce((a,p)=>a+p[1],0)/m;let num=0,den=0;for(const [x,y] of pts){num+=(x-mx)*(y-my);den+=(x-mx)*(x-mx);}
  const slope=den>0?num/den:0,ppm=slope/w*1e6;return {frequencyHz:nominalHz*(1+ppm*1e-6),ppm};
}
/** Delay of marker in capture (samples, parabolic sub-sample) and normalized correlation strength. */
export function detectMarkerLag(captured,marker,sampleRate,{maxLagSec=.5,startSample=0}={}){
  const tl=marker.length,maxLag=Math.min(Math.floor(maxLagSec*sampleRate),captured.length-startSample-tl);if(maxLag<1)return {lag:null,strength:0};
  let te=0;for(const v of marker)te+=v*v;const pre=new Float64Array(captured.length+1);for(let i=0;i<captured.length;i++)pre[i+1]=pre[i]+captured[i]*captured[i];
  const nc=new Float64Array(maxLag+1);let best=0;
  for(let lag=0;lag<=maxLag;lag++){let d=0;const o=startSample+lag;for(let i=0;i<tl;i++)d+=marker[i]*captured[o+i];const e=pre[o+tl]-pre[o];nc[lag]=e>1e-18?d/Math.sqrt(te*e):0;if(nc[lag]>nc[best])best=lag;}
  let lag=best;if(best>0&&best<maxLag){const a=nc[best-1],b=nc[best],c=nc[best+1],den=a-2*b+c;if(Math.abs(den)>1e-12)lag=best+.5*(a-c)/den;}
  return {lag,strength:nc[best]};
}

// ---------- uncertainty (GUM-style) ----------
/** Root-sum-square of standard uncertainties; items are numbers or {u,c} (c = sensitivity). Non-finite input gives NaN. */
export function combineStandardUncertainties(items=[]){let s=0;for(const it of items){const u=typeof it==='number'?it:(it?.u??NaN)*(it?.c??1);if(!Number.isFinite(u))return NaN;s+=u*u;}return Math.sqrt(s);}
/** Expanded uncertainty U = k*u (default k=2, ~95%). */
export function expandedUncertainty(u,k=2){return u*k;}
/** CRB-based std (Hz) of a single-tone frequency estimate from window length and SNR (tone RMS to noise RMS, dB). */
export function frequencyEstimatorStdHz({sampleRate=48000,windowSec=1,snrDb=40}={}){const N=Math.max(2,windowSec*sampleRate),snr=Math.pow(10,snrDb/10);return sampleRate/(2*Math.PI)*Math.sqrt(12/(2*snr*N*N*N));}
function result(components,unit,k=2){const standard=combineStandardUncertainties(Object.values(components));return {standard,expanded:expandedUncertainty(standard,k),k,unit,components};}
function clockU(cal){return cal?.clockPpm!=null?combineStandardUncertainties([cal.clockPpm,DEFAULT_COMPONENTS.calibratedClockFloorPpm]):DEFAULT_COMPONENTS.clockPpm;}
/** Speed/pitch uncertainty in percent: clock calibration, estimator CRB, estimator grid quantization. */
export function speedPitchUncertainty({referenceHz=1000,windowSec=1,snrDb=DEFAULT_COMPONENTS.assumedSnrDb,sampleRate=48000,clockPpmU=DEFAULT_COMPONENTS.clockPpm,gridHz=.1,k=2}={}){
  const crbHz=frequencyEstimatorStdHz({sampleRate,windowSec,snrDb});
  return result({clock:clockPpmU*1e-4,estimator:crbHz/referenceHz*100,grid:gridHz/Math.sqrt(12)/referenceHz*100},'%',k);
}
/** RPM uncertainty from the pitch uncertainty (sensitivity = nominalRpm/100). */
export function rpmUncertainty({nominalRpm=33.333333,pitchPercent=0,k=2,...rest}={}){
  const p=speedPitchUncertainty({...rest,k}),c=nominalRpm*(1+pitchPercent/100)/100,components={};for(const [n,v] of Object.entries(p.components))components[n]=v*c;return result(components,'rpm',k);
}
/** Level (dB) uncertainty: gain calibration, noise-limited tone estimate, noise power bias. */
export function levelUncertaintyDb({gainDb=DEFAULT_COMPONENTS.gainDb,snrDb=DEFAULT_COMPONENTS.assumedSnrDb,windowSamples=4800,k=2}={}){
  const noise=DB_PER_NEPER*Math.pow(10,-snrDb/20)/Math.sqrt(Math.max(1,windowSamples)),bias=10*Math.log10(1+Math.pow(10,-snrDb/10))/Math.sqrt(3);return result({gain:gainDb,noise,noiseBias:bias},'dB',k);
}
/** Channel balance (L-R, dB) uncertainty from calibrated mismatch and per-channel noise terms. */
export function channelBalanceUncertaintyDb({mismatchDb=DEFAULT_COMPONENTS.mismatchDb,snrDb=DEFAULT_COMPONENTS.assumedSnrDb,windowSamples=4800,k=2}={}){
  const n=DB_PER_NEPER*Math.pow(10,-snrDb/20)/Math.sqrt(Math.max(1,windowSamples));return result({mismatch:mismatchDb,noise:Math.SQRT2*n},'dB',k);
}
/** THD (%) uncertainty: noise-floor limited harmonic estimate plus chain THD+N bound (rectangular 0..bound). */
export function thdUncertaintyPercent({snrDb=DEFAULT_COMPONENTS.assumedSnrDb,windowSamples=48000,harmonics=5,chainThdnPercent=DEFAULT_COMPONENTS.thdChainPercent,k=2}={}){
  const floor=100*Math.sqrt(Math.max(1,harmonics-1))*Math.pow(10,-snrDb/20)/Math.sqrt(Math.max(1,windowSamples));return result({noiseFloor:floor,chain:chainThdnPercent/Math.sqrt(3)},'%',k);
}
/** Channel separation (dB) uncertainty: gain calibration plus leak-vs-noise-floor term (leakSnrDb = leak above noise). */
export function separationUncertaintyDb({gainDb=DEFAULT_COMPONENTS.gainDb,leakSnrDb=20,k=2}={}){
  const leak=Math.min(10,DB_PER_NEPER*Math.pow(10,-leakSnrDb/20));return result({gain:Math.SQRT2*gainDb,leakNoise:leak},'dB',k);
}

// ---------- analysis ----------
const issue=(code,message,severity='error')=>({code,message,severity});
function sliceSafe(x,a,b){return x.subarray(Math.max(0,a),Math.max(0,Math.min(x.length,b)));}
function analyzeChannel(x,meta,shift,sr){
  const t=meta.tone,trim=Math.floor(TRIM_SEC*sr),seg=sliceSafe(x,t.start+shift+trim,t.end+shift-trim);
  if(seg.length<sr*.2)return null;
  const clock=refineToneFrequency(seg,sr,t.hz),fit=fitTone(seg,sr,clock.frequencyHz);
  const g0=sliceSafe(x,meta.gapStart+shift+Math.floor(.005*sr),meta.gapEnd+shift-Math.floor(.01*sr));
  const gap=g0.length>=16?g0:new Float32Array(0);let dc=0;for(const v of gap)dc+=v;dc/=Math.max(1,gap.length);const centered=gap.map(v=>v-dc);
  const sigRms=fit.amplitude/Math.SQRT2,noiseRms=rms(centered);
  return {fit,clock,seg,sigRms,noiseRms,gap:gap.length,gainDb:dbfs(fit.amplitude)-dbfs(meta.amplitude),thdn:100*fit.residualRms/Math.max(sigRms,1e-12),noiseDbfs:gap.length?dbfs(noiseRms):null};
}
function responseDeltas(L,R,meta,shift,sr,ppm,gainRef){
  const out=[{hz:meta.tone.hz,deltaDb:0}],trim=Math.floor(.03*sr);
  for(const s of meta.steps){const f=s.hz*(1+ppm*1e-6),g=[L,R].map(x=>{const seg=sliceSafe(x,s.start+shift+trim,s.end+shift-trim);return seg.length>sr*.05?dbfs(fitTone(seg,sr,f).amplitude)-dbfs(meta.amplitude):NaN;}).filter(Number.isFinite);
    if(g.length)out.push({hz:s.hz,deltaDb:g.reduce((a,b)=>a+b,0)/g.length-gainRef});}
  return out.sort((a,b)=>a.hz-b.hz);
}
function emptyProfile(sr,deviceName,createdAt){return {version:1,deviceName,sampleRate:sr,createdAt,gainDb:{left:null,right:null},mismatchDb:null,noiseFloorDbfs:null,thdnPercent:null,latencyMs:null,clockPpm:null,response:[],uncertainty:{gainDb:null,mismatchDb:null,noiseFloorDb:null,clockPpm:null,latencyMs:null,thdnPercent:null,k:2},valid:false,issues:[],notes:[]};}
/** Analyze a loopback capture against its stimulus meta and return an interface calibration profile. */
export function analyzeLoopback(captured,meta,{deviceName='',createdAt=new Date().toISOString(),maxMismatchDb=1,minSnrDb=40}={}){
  const sr=captured.sampleRate||meta.sampleRate,p=emptyProfile(sr,deviceName,createdAt),L=captured.left,R=captured.right;
  p.notes.push('Loopback shares the interface clock domain; clockPpm reflects playback/capture path error, not absolute timebase accuracy.');
  if(sr!==meta.sampleRate)p.issues.push(issue('SAMPLE_RATE_MISMATCH',`Capture ${sr} Hz differs from stimulus ${meta.sampleRate} Hz.`));
  const clip=clippingCount(L)+clippingCount(R);if(clip>0)p.issues.push(issue('CLIPPING',`${clip} samples reached full scale; gain results are unreliable.`));
  const mono=new Float32Array(Math.min(L.length,R.length));for(let i=0;i<mono.length;i++)mono[i]=L[i]+R[i];
  const marker=markerSignal(sr,meta.amplitude),det=detectMarkerLag(mono,marker,sr,{startSample:meta.markerStart});
  if(dbfs(Math.max(peak(L),peak(R)))<-70){p.issues.push(issue('NO_SIGNAL','No usable signal captured; check routing and input gain.'));return finish(p);}
  if(det.strength<.3){p.issues.push(issue('NO_MARKER','Latency marker not found in capture.'));return finish(p);}
  const shift=Math.round(det.lag),lagSamples=det.lag;p.latencyMs=lagSamples/sr*1000;
  const cl=analyzeChannel(L,meta,shift,sr),cr=analyzeChannel(R,meta,shift,sr);
  if(!cl||!cr){p.issues.push(issue('CAPTURE_TOO_SHORT','Capture does not contain enough of the tone segment.'));return finish(p);}
  p.gainDb={left:cl.gainDb,right:cr.gainDb};p.mismatchDb=cl.gainDb-cr.gainDb;p.clockPpm=(cl.clock.ppm+cr.clock.ppm)/2;p.thdnPercent=Math.max(cl.thdn,cr.thdn);
  if(cl.noiseDbfs!=null&&cr.noiseDbfs!=null)p.noiseFloorDbfs=Math.max(cl.noiseDbfs,cr.noiseDbfs);else p.issues.push(issue('NO_NOISE_SECTION','Silent section too short to estimate noise floor.','warning'));
  const gRef=(cl.gainDb+cr.gainDb)/2;p.response=responseDeltas(L,R,meta,shift,sr,p.clockPpm,gRef);
  const sigDbfs=dbfs(Math.min(cl.sigRms,cr.sigRms)),snrDb=p.noiseFloorDbfs!=null?sigDbfs-p.noiseFloorDbfs:null;
  const weak=Math.min(cl.gainDb,cr.gainDb);if(weak<-40)p.issues.push(issue('NO_SIGNAL',`A channel is ${(-weak).toFixed(1)} dB below nominal.`));
  if(snrDb!=null&&snrDb<minSnrDb)p.issues.push(issue('TOO_NOISY',`Tone-to-noise ratio ${snrDb.toFixed(1)} dB is below ${minSnrDb} dB.`));
  if(Math.abs(p.mismatchDb)>maxMismatchDb)p.issues.push(issue('CHANNEL_MISMATCH',`L/R mismatch ${p.mismatchDb.toFixed(2)} dB exceeds ${maxMismatchDb} dB.`));
  const N=cl.seg.length,nz=Math.max(cl.noiseRms,cr.noiseRms,1e-12),amp=Math.min(cl.fit.amplitude,cr.fit.amplitude),ug=DB_PER_NEPER*Math.sqrt(2/N)*(nz/Math.max(amp,1e-12));
  const gain=combineStandardUncertainties([ug,.01]),fHz=meta.tone.hz,sigma=Math.max(cl.fit.residualRms,cr.fit.residualRms);
  const crbPpm=frequencyEstimatorStdHz({sampleRate:sr,windowSec:N/sr,snrDb:20*Math.log10(Math.max(amp/Math.SQRT2,1e-12)/Math.max(sigma,1e-12))})/fHz*1e6;
  p.uncertainty={gainDb:gain,mismatchDb:Math.SQRT2*gain,noiseFloorDb:DB_PER_NEPER/Math.sqrt(2*Math.max(1,cl.gap)),clockPpm:crbPpm,latencyMs:1000/(sr*Math.sqrt(12)),thdnPercent:.1*p.thdnPercent+.001,k:2};
  return finish(p);
}
function finish(p){p.valid=!p.issues.some(i=>i.severity==='error');return p;}

// ---------- profile helpers ----------
/** Serialize a profile to JSON text. */
export function serializeProfile(profile){return JSON.stringify(profile);}
/** Check profile structure; returns {ok, errors}. */
export function validateProfile(p){
  const e=[];if(!p||typeof p!=='object')return {ok:false,errors:['not an object']};
  if(p.version!==1)e.push('unsupported version');if(!(p.sampleRate>0))e.push('invalid sampleRate');
  if(typeof p.valid!=='boolean')e.push('missing valid flag');if(!Array.isArray(p.issues))e.push('issues must be an array');
  if(!p.gainDb||typeof p.gainDb!=='object')e.push('missing gainDb');if(!p.uncertainty||typeof p.uncertainty!=='object')e.push('missing uncertainty');
  if(p.valid&&!e.length){for(const [n,v] of [['gainDb.left',p.gainDb.left],['gainDb.right',p.gainDb.right],['mismatchDb',p.mismatchDb],['clockPpm',p.clockPpm],['latencyMs',p.latencyMs]])if(!Number.isFinite(v))e.push(`${n} must be finite for a valid profile`);}
  return {ok:!e.length,errors:e};
}
/** Parse and validate profile JSON; throws on malformed or invalid structure. */
export function deserializeProfile(text){const p=typeof text==='string'?JSON.parse(text):text,v=validateProfile(p);if(!v.ok)throw new Error(`Invalid calibration profile: ${v.errors.join('; ')}`);return p;}
/** Reasons a profile cannot be applied to a given device/sample rate (empty means applicable). */
export function profileInapplicableReasons(profile,{deviceName,sampleRate,maxAgeDays=null,now=Date.now()}={}){
  const r=[];if(!validateProfile(profile).ok)return ['profile structure invalid'];if(!profile.valid)r.push('profile verdict is invalid');
  if(sampleRate!=null&&profile.sampleRate!==sampleRate)r.push('sample rate differs');
  if(deviceName!=null&&profile.deviceName&&profile.deviceName.trim().toLowerCase()!==String(deviceName).trim().toLowerCase())r.push('device differs');
  if(maxAgeDays!=null){const t=Date.parse(profile.createdAt);if(!Number.isFinite(t)||(now-t)/864e5>maxAgeDays)r.push('profile too old');}
  return r;
}
/** True when the profile is valid and matches the device name and sample rate. */
export function isProfileApplicable(profile,opts={}){return profileInapplicableReasons(profile,opts).length===0;}

// ---------- applying calibration ----------
// metricId -> rule kind. Level rules correct by channel gain; speed rules by clock ppm.
export const METRIC_RULES={
  left_level_dbfs:'levelL',left_hum_dbfs:'levelL',right_level_dbfs:'levelR',right_hum_dbfs:'levelR',
  vinyl_rumble_dbfs:'levelM',low_frequency_energy_dbfs:'levelM',vinyl_subsonic_peak_dbfs:'levelM',
  channel_balance_db:'balance',
  measured_frequency_hz:'freq',
  measured_pitch_percent:'pitch',pitch_percent:'pitch',quartz_speed_error_percent:'pitch',warmup_speed_error_percent:'pitch',
  rpm:'rpm',quartz_rpm:'rpm',warmup_rpm:'rpm',
  wow_flutter_rms_percent:'modulation',peak_speed_deviation_percent:'modulation',speed_drift_percent:'modulation',
  speed_modulation_1x_percent:'modulation',speed_modulation_2x_percent:'modulation',speed_modulation_3x_percent:'modulation',
  left_thd_percent:'thd',right_thd_percent:'thd',
  channel_separation_db:'separation'
};
const ratioFix=(ratio,ppm)=>ratio/(1+ppm*1e-6);
function correct(kind,v,p,ctx){
  const c=p.clockPpm;
  switch(kind){
    case 'levelL':return v-p.gainDb.left;case 'levelR':return v-p.gainDb.right;case 'levelM':return v-(p.gainDb.left+p.gainDb.right)/2;
    case 'balance':return v-p.mismatchDb;case 'freq':return ratioFix(v,c);
    case 'pitch':return (ratioFix(1+v/100,c)-1)*100;case 'rpm':return ratioFix(v,c);
    default:return v;
  }
}
function uncertaintyFor(kind,m,cal,ctx){
  const cu=cal?.uncertainty,snrDb=ctx.snrDb??DEFAULT_COMPONENTS.assumedSnrDb,windowSamples=ctx.windowSamples??Math.floor((ctx.windowSec??1)*(ctx.sampleRate??48000)),k=ctx.k??2;
  const g=cu?.gainDb!=null?cu.gainDb:DEFAULT_COMPONENTS.gainDb;
  const speed={referenceHz:ctx.referenceHz??1000,windowSec:ctx.windowSec??1,snrDb,sampleRate:ctx.sampleRate??48000,clockPpmU:clockU(cu),gridHz:ctx.gridHz??.1,k};
  switch(kind){
    case 'levelL':case 'levelR':case 'levelM':return levelUncertaintyDb({gainDb:g,snrDb,windowSamples,k});
    case 'balance':return channelBalanceUncertaintyDb({mismatchDb:cu?.mismatchDb??DEFAULT_COMPONENTS.mismatchDb,snrDb,windowSamples,k});
    case 'freq':{const p=speedPitchUncertainty(speed),f=Math.abs(m.value)||speed.referenceHz,c=f/100,comps={};for(const [n,v] of Object.entries(p.components))comps[n]=v*c;return result(comps,'Hz',k);}
    case 'pitch':return speedPitchUncertainty(speed);
    case 'rpm':return rpmUncertainty({...speed,nominalRpm:ctx.nominalRpm??33.333333,pitchPercent:ctx.pitchPercent??0});
    case 'modulation':{const crb=frequencyEstimatorStdHz(speed)/speed.referenceHz*100;return result({estimator:crb,grid:speed.gridHz/Math.sqrt(12)/speed.referenceHz*100},'%',k);}
    case 'thd':return thdUncertaintyPercent({snrDb,windowSamples,chainThdnPercent:cal?.thdnPercent??DEFAULT_COMPONENTS.thdChainPercent,k});
    case 'separation':return separationUncertaintyDb({gainDb:g,leakSnrDb:ctx.leakSnrDb??20,k});
    default:return null;
  }
}
/** Return a new measurement with calibration corrections and uncertainty; metrics are matched by metricId via METRIC_RULES. */
export function applyCalibration(measurement,profile=null,ctx={}){
  const kind=METRIC_RULES[measurement?.metricId],flags=[...(measurement?.qualityFlags||[])];
  const reasons=profile?profileInapplicableReasons(profile,{deviceName:ctx.deviceName,sampleRate:ctx.sampleRate}):['no calibration profile'];
  const calibrated=reasons.length===0&&!!kind;
  if(profile&&reasons.length)flags.push('calibration_not_applied');
  if(!kind){flags.push('uncertainty_unknown');return {...measurement,calibrated:false,qualityFlags:flags,uncertainty:null,uncertaintyReason:'no propagation model for this metricId'};}
  const u=uncertaintyFor(kind,measurement,calibrated?profile:null,ctx);
  const value=calibrated&&Number.isFinite(measurement.value)?correct(kind,measurement.value,profile,ctx):measurement.value;
  flags.push(calibrated?'calibrated':'uncalibrated');if(!calibrated)flags.push('default_uncertainty_components');
  const out={...measurement,value,calibrated,qualityFlags:flags,uncertainty:u};
  if(calibrated)out.rawValue=measurement.value;
  return out;
}
