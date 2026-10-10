// Synthetic-signal fixtures (FS-00 §8). Deterministic: every random draw comes from a seeded PRNG, so a
// given argument object always yields the same samples. No binary blobs are committed; tests generate
// what they need. Shared by FS-10/11/13/14/15/31 tests.
//
// Level conventions match app/core.js humMetrics and app/calibration.js fitTone: a tone's "dBFS" is its
// PEAK amplitude in dB (a full-scale sine is 0 dBFS). Noise levels are RMS dBFS. SNR is tone RMS over
// noise RMS, per channel.

const TAU=2*Math.PI;
const amp=db=>Math.pow(10,db/20);

/** mulberry32 PRNG: returns () => uniform [0,1). Seed is any 32-bit integer. */
export function rng(seed=1){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

/** Standard-normal generator (Box-Muller) on top of rng(seed). */
export function gaussian(seed=1){const r=rng(seed);let spare=null;return()=>{if(spare!==null){const s=spare;spare=null;return s;}let u=0;while(u<=1e-12)u=r();const v=r(),m=Math.sqrt(-2*Math.log(u));spare=m*Math.sin(TAU*v);return m*Math.cos(TAU*v);};}

/** Seeded white Gaussian noise with the given RMS (linear). */
export function whiteNoise(n,rmsAmp=1,seed=1){const g=gaussian(seed),out=new Float32Array(n);for(let i=0;i<n;i++)out[i]=rmsAmp*g();return out;}

/** Adds seeded white noise in place so that RMS(signal reference) / RMS(noise) = snrDb. Returns the noise RMS used. */
export function addNoise(buf,{snrDb=Infinity,refRms,seed=1}={}){
  if(!Number.isFinite(snrDb))return 0;
  let r=refRms;if(r==null){let s=0;for(const v of buf)s+=v*v;r=Math.sqrt(s/Math.max(1,buf.length));}
  const nr=r/amp(snrDb),g=gaussian(seed);for(let i=0;i<buf.length;i++)buf[i]+=nr*g();return nr;
}

const velocityFn=v=>typeof v==='function'?v:()=>(Number.isFinite(v)?v:1);

/**
 * Quadrature DVS timecode (carrier only, no bit modulation).
 * Left = A sin(phi), right = A gR sin(phi + phaseSign*pi/2), with dphi/dt = 2 pi carrierHz v(t):
 * playing forward, the right channel leads by 90 deg (lags when phaseSign = -1, xwax SWITCH_PHASE),
 * which is the convention of app/timecode.js analyzeTimecode. Negative velocity reverses the relation.
 * @param {object} o
 * @param {number} [o.carrierHz=1000] carrier at v = 1 (33 1/3 rpm).
 * @param {1|-1} [o.phaseSign=1]
 * @param {number} [o.seconds=2]
 * @param {number} [o.sampleRate=48000]
 * @param {number|function(number):number} [o.velocityProfile=1] speed ratio, constant or t(sec) => v.
 * @param {number} [o.snrDb=Infinity] per-channel tone RMS over noise RMS.
 * @param {Array<[number,number]>} [o.dropouts=[]] [startSec, endSec) spans forced to silence (noise included).
 * @param {Array<{atSec:number,deg:number}>} [o.phaseJumps=[]] instantaneous carrier phase steps (needle skips).
 * @param {number} [o.amplitudeDbfs=-6] peak level of the left channel.
 * @param {number} [o.imbalanceDb=0] left minus right level.
 * @param {number} [o.seed=1]
 * @returns {{left:Float32Array,right:Float32Array,sampleRate:number,truth:{carrierHz:number,phaseSign:number,velocity:function(number):number,positionCycles:Float64Array,dropouts:Array,phaseJumps:Array,noiseRms:number}}}
 *   truth.positionCycles has one entry per 10 ms (carrier cycles travelled since t = 0, skips excluded).
 */
export function quadratureTimecode({carrierHz=1000,phaseSign=1,seconds=2,sampleRate=48000,velocityProfile=1,snrDb=Infinity,dropouts=[],phaseJumps=[],amplitudeDbfs=-6,imbalanceDb=0,seed=1}={}){
  const n=Math.round(seconds*sampleRate),left=new Float32Array(n),right=new Float32Array(n),v=velocityFn(velocityProfile);
  const A=amp(amplitudeDbfs),AR=A*amp(-imbalanceDb),q=(phaseSign===-1?-1:1)*Math.PI/2;
  const jumps=[...phaseJumps].map(j=>({i:Math.round(j.atSec*sampleRate),rad:j.deg*Math.PI/180})).sort((a,b)=>a.i-b.i);
  const step=Math.max(1,Math.round(sampleRate*.01)),pos=new Float64Array(Math.floor((n-1)/step)+1);
  let phi=0,travelled=0,jumpOffset=0,j=0;
  for(let i=0;i<n;i++){
    while(j<jumps.length&&jumps[j].i<=i){jumpOffset+=jumps[j].rad;j++;}
    if(i%step===0)pos[i/step]=travelled/TAU;
    const p=phi+jumpOffset;left[i]=A*Math.sin(p);right[i]=AR*Math.sin(p+q);
    // midpoint rule keeps the phase accurate for smooth velocity profiles
    const d=TAU*carrierHz*v((i+.5)/sampleRate)/sampleRate;phi+=d;travelled+=d;
  }
  const noiseRms=Number.isFinite(snrDb)?A/Math.SQRT2/amp(snrDb):0;
  if(noiseRms>0){addNoise(left,{snrDb,refRms:A/Math.SQRT2,seed});addNoise(right,{snrDb,refRms:A/Math.SQRT2,seed:(seed^0x9e3779b9)>>>0});}
  for(const [a,b] of dropouts){const s=Math.max(0,Math.round(a*sampleRate)),e=Math.min(n,Math.round(b*sampleRate));left.fill(0,s,e);right.fill(0,s,e);}
  return {left,right,sampleRate,truth:{carrierHz,phaseSign:phaseSign===-1?-1:1,velocity:v,positionCycles:pos,dropouts:dropouts.map(d=>[...d]),phaseJumps:phaseJumps.map(p=>({...p})),noiseRms}};
}

/**
 * Mains hum mix: sum of harmonics n * mainsHz at given peak dBFS levels, plus optional white noise and an
 * optional extra tone (e.g. a timecode carrier the hum sits under).
 * @param {object} o
 * @param {number} [o.mainsHz=50] may be off-nominal (e.g. 49.95).
 * @param {Array<{n:number,dbfs:number,phaseDeg?:number}>} [o.harmonics=[{n:1,dbfs:-60}]] phases default to seeded random.
 * @param {number} [o.seconds=2]
 * @param {number} [o.sampleRate=48000]
 * @param {number} [o.noiseDbfs=-Infinity] RMS level of added white noise.
 * @param {{hz:number,dbfs:number,wobblePercent?:number,wobbleHz?:number}} [o.tone] extra (carrier) tone with optional sinusoidal speed wobble.
 * @param {number} [o.dc=0]
 * @param {number} [o.seed=1]
 * @returns {{samples:Float32Array,sampleRate:number,truth:{mainsHz:number,harmonics:Array<{n:number,hz:number,dbfs:number}>,totalDbfs:number,noiseRms:number}}}
 */
export function humMix({mainsHz=50,harmonics=[{n:1,dbfs:-60}],seconds=2,sampleRate=48000,noiseDbfs=-Infinity,tone=null,dc=0,seed=1}={}){
  const n=Math.round(seconds*sampleRate),out=new Float64Array(n),r=rng(seed);
  const hs=harmonics.map(h=>({n:h.n,hz:h.n*mainsHz,dbfs:h.dbfs,ph:h.phaseDeg!=null?h.phaseDeg*Math.PI/180:TAU*r()}));
  for(const h of hs){const a=amp(h.dbfs),w=TAU*h.hz/sampleRate;for(let i=0;i<n;i++)out[i]+=a*Math.sin(w*i+h.ph);}
  if(tone){const a=amp(tone.dbfs),wp=(tone.wobblePercent||0)/100,wf=tone.wobbleHz||.55;let phi=TAU*r();
    for(let i=0;i<n;i++){out[i]+=a*Math.sin(phi);phi+=TAU*tone.hz*(1+wp*Math.sin(TAU*wf*(i+.5)/sampleRate))/sampleRate;}}
  const samples=new Float32Array(n);for(let i=0;i<n;i++)samples[i]=out[i]+dc;
  const noiseRms=Number.isFinite(noiseDbfs)?amp(noiseDbfs):0;
  if(noiseRms>0){const g=gaussian((seed*31+7)>>>0);for(let i=0;i<n;i++)samples[i]+=noiseRms*g();}
  let p=0;for(const h of hs)p+=amp(h.dbfs)**2;
  return {samples,sampleRate,truth:{mainsHz,harmonics:hs.map(({n,hz,dbfs})=>({n,hz,dbfs})),totalDbfs:10*Math.log10(Math.max(p,1e-300)),noiseRms}};
}

/** Hann-windowed linear chirp evaluated at continuous time t (sec) from its start; 0 outside [0, durSec]. */
function chirpAt(t,{f0,f1,durSec,a}){if(t<0||t>durSec)return 0;return a*(.5-.5*Math.cos(TAU*t/durSec))*Math.sin(TAU*(f0*t+(f1-f0)*t*t/(2*durSec)));}

/**
 * Loopback chirp: `played` holds a Hann-windowed linear chirp starting at `leadSec`; `captured` is the same
 * chirp evaluated analytically at t - delay (exact fractional delay, no interpolation error), scaled by
 * gainDb, plus seeded noise. truth.delaySamples = delayMs * sampleRate / 1000.
 * @returns {{played:Float32Array,captured:Float32Array,chirp:Float32Array,sampleRate:number,truth:{delayMs:number,delaySamples:number,chirpStart:number,noiseRms:number}}}
 */
export function chirpLoop({delayMs=3,sampleRate=48000,seconds=.25,leadSec=.02,chirpSec=.01,f0=2000,f1=8000,amplitudeDbfs=-12,gainDb=0,snrDb=Infinity,seed=1}={}){
  const n=Math.round(seconds*sampleRate),cs=Math.round(leadSec*sampleRate),cn=Math.max(8,Math.round(chirpSec*sampleRate));
  const spec={f0,f1:Math.min(f1,sampleRate*.45),durSec:(cn-1)/sampleRate,a:amp(amplitudeDbfs)};
  const chirp=new Float32Array(cn);for(let i=0;i<cn;i++)chirp[i]=chirpAt(i/sampleRate,spec);
  const played=new Float32Array(n);played.set(chirp.subarray(0,Math.max(0,Math.min(cn,n-cs))),cs);
  const captured=new Float32Array(n),g=amp(gainDb),d=delayMs/1000;
  for(let i=0;i<n;i++)captured[i]=g*chirpAt(i/sampleRate-leadSec-d,spec);
  // reference RMS = chirp RMS over its own span, so SNR describes the burst, not the silent padding
  let s=0;for(const v of chirp)s+=v*v;const refRms=g*Math.sqrt(s/cn);
  const noiseRms=addNoise(captured,{snrDb,refRms,seed});
  return {played,captured,chirp,sampleRate,truth:{delayMs,delaySamples:delayMs*sampleRate/1000,chirpStart:cs,noiseRms}};
}

/**
 * Acoustic-feedback howl: a tone whose level grows exponentially (growthDbPerSec) from startDbfs until it
 * reaches capDbfs, optionally over a steady bed tone. truth.capSec = when the cap is reached.
 */
export function howlGrowth({hz=2000,startDbfs=-60,growthDbPerSec=30,capDbfs=-3,seconds=2,sampleRate=48000,onsetSec=0,noiseDbfs=-Infinity,seed=1}={}){
  const n=Math.round(seconds*sampleRate),samples=new Float32Array(n),w=TAU*hz/sampleRate;
  for(let i=Math.max(0,Math.round(onsetSec*sampleRate));i<n;i++){const t=i/sampleRate-onsetSec;samples[i]=amp(Math.min(capDbfs,startDbfs+growthDbPerSec*t))*Math.sin(w*i);}
  const noiseRms=Number.isFinite(noiseDbfs)?amp(noiseDbfs):0;if(noiseRms>0){const g=gaussian(seed);for(let i=0;i<n;i++)samples[i]+=noiseRms*g();}
  return {samples,sampleRate,truth:{hz,growthDbPerSec,capSec:onsetSec+(capDbfs-startDbfs)/growthDbPerSec,noiseRms}};
}
