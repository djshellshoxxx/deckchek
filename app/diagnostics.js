import { correlation, dbfs, rms, scopeMetrics } from './core.js';

function linearRegression(points){
  const n=points.length;if(!n)return {slope:NaN,intercept:NaN};
  let sx=0,sy=0,sxx=0,sxy=0;for(const p of points){sx+=p.x;sy+=p.y;sxx+=p.x*p.x;sxy+=p.x*p.y;}
  const den=n*sxx-sx*sx;if(Math.abs(den)<1e-12)return {slope:NaN,intercept:NaN};
  const slope=(n*sxy-sx*sy)/den;return {slope,intercept:(sy-slope*sx)/n};
}

export function pitchMapMetrics(points=[]){
  const valid=points.filter(p=>Number.isFinite(p.position)&&Number.isFinite(p.measuredPercent));
  const fit=linearRegression(valid.map(p=>({x:p.position,y:p.measuredPercent})));
  let maxNonlinearityPercent=0,maxMappingErrorPercent=0,errorSq=0,monotonicityFailures=0;
  for(const p of valid){const predicted=fit.intercept+fit.slope*p.position;maxNonlinearityPercent=Math.max(maxNonlinearityPercent,Math.abs(p.measuredPercent-predicted));const err=p.measuredPercent-p.position;maxMappingErrorPercent=Math.max(maxMappingErrorPercent,Math.abs(err));errorSq+=err*err;}
  const grouped=new Map();for(const p of valid){const key=Number(p.position).toFixed(6);if(!grouped.has(key))grouped.set(key,{});grouped.get(key)[p.direction||'unknown']=p.measuredPercent;}
  let hysteresisPercent=0;for(const g of grouped.values())if(Number.isFinite(g.up)&&Number.isFinite(g.down))hysteresisPercent=Math.max(hysteresisPercent,Math.abs(g.up-g.down));
  const sorted=[...valid].sort((a,b)=>a.position-b.position);let deadSpotCount=0;for(let i=1;i<sorted.length;i++){const input=Math.abs(sorted[i].position-sorted[i-1].position);const output=sorted[i].measuredPercent-sorted[i-1].measuredPercent;if(input>=1&&Math.abs(output)<input*.2)deadSpotCount++;if(output<-.05)monotonicityFailures++;}
  const zero=valid.filter(p=>Math.abs(p.position)<1e-9);const zeroOffsetPercent=zero.length?zero.reduce((a,p)=>a+p.measuredPercent,0)/zero.length:NaN;
  const pos=valid.filter(p=>p.position>0),neg=valid.filter(p=>p.position<0);const positiveGain=pos.length?linearRegression(pos.map(p=>({x:p.position,y:p.measuredPercent}))).slope:NaN;const negativeGain=neg.length?linearRegression(neg.map(p=>({x:p.position,y:p.measuredPercent}))).slope:NaN;
  return {...fit,maxNonlinearityPercent,hysteresisPercent,deadSpotCount,pointCount:valid.length,maxMappingErrorPercent,rmsMappingErrorPercent:valid.length?Math.sqrt(errorSq/valid.length):NaN,monotonicityFailures,zeroOffsetPercent,positiveGain,negativeGain};
}
export function transitionMetrics(trace,{startIndex=0,stopIndex=null,readyThreshold=.9,stoppedThreshold=.1}={}){
  if(!trace?.length)return {startupSec:null,brakeSec:null};
  const stop=stopIndex??Math.floor(trace.length/2);
  const startTime=trace[startIndex]?.timeSec??0;
  const ready=trace.slice(startIndex,stop+1).find(x=>x.level>=readyThreshold);
  const stopTime=trace[stop]?.timeSec??0;
  const halted=trace.slice(stop).find(x=>x.level<=stoppedThreshold);
  return {startupSec:ready?ready.timeSec-startTime:null,brakeSec:halted?halted.timeSec-stopTime:null};
}

export function channelSeparationDb(signalAmplitude,leakAmplitude){return 20*Math.log10(Math.max(Math.abs(signalAmplitude),1e-12)/Math.max(Math.abs(leakAmplitude),1e-12));}
function toneAmp(samples,sampleRate,freq){const w=2*Math.PI*freq/sampleRate,coeff=2*Math.cos(w);let s0=0,s1=0,s2=0;for(const x of samples){s0=x+coeff*s1-s2;s2=s1;s1=s0;}return Math.sqrt(Math.max(0,s1*s1+s2*s2-coeff*s1*s2))/Math.max(1,samples.length/2);}
export function thdPercent(samples,sampleRate,fundamentalHz,{harmonics=5}={}){const fundamental=toneAmp(samples,sampleRate,fundamentalHz);let sumSq=0;for(let h=2;h<=harmonics;h++){const f=fundamentalHz*h;if(f>=sampleRate/2)break;const a=toneAmp(samples,sampleRate,f);sumSq+=a*a;}return 100*Math.sqrt(sumSq)/Math.max(fundamental,1e-12);}

export function dvsIntegrityTimeline(left,right,sampleRate,{windowSec=.1,presenceThresholdDb=-55}={}){
  const n=Math.min(left.length,right.length),win=Math.max(64,Math.floor(sampleRate*windowSec));const out=[];
  for(let start=0;start+win<=n;start+=win){const l=left.subarray(start,start+win),r=right.subarray(start,start+win);const sm=scopeMetrics(l,r);const level=Math.max(sm.leftDb,sm.rightDb);out.push({startSec:start/sampleRate,endSec:(start+win)/sampleRate,signalPresent:level>=presenceThresholdDb,leftDb:sm.leftDb,rightDb:sm.rightDb,balanceDb:sm.balanceDb,correlation:sm.correlation,circularity:sm.circularity});}
  return out;
}

export function normalizedEventMap(events=[],durationSec){const d=Math.max(Number(durationSec)||0,1e-12);return events.map(e=>({...e,normalizedPosition:Math.max(0,Math.min(1,(e.timeSec??0)/d))}));}

export function reasonFromEvidence({channelBalanceDb=0,humDb=-120,correlation=0,dropoutCount=0}={}){
  const out=[];
  if(Math.abs(channelBalanceDb)>=1)out.push({code:'CHANNEL_PATH_IMBALANCE',confidence:Math.min(.98,.55+Math.abs(channelBalanceDb)/10),summary:'Measured channel imbalance requires signal-path isolation.',alternatives:['cartridge output mismatch','headshell/contact resistance','cable attenuation','mixer/interface gain mismatch'],isolationTests:['swap left/right downstream path','repeat with known mono reference','inspect cartridge and headshell contacts']});
  if(humDb>-50)out.push({code:'HUM_PATH',confidence:Math.min(.95,.55+(humDb+50)/30),summary:'Mains-family energy is elevated.',alternatives:['ground loop','missing turntable ground','shield/cable problem','nearby AC coupling'],isolationTests:['disconnect source and recapture noise floor','verify ground lead','move signal cable away from power wiring']});
  if(correlation<-.75)out.push({code:'POLARITY_PATH',confidence:.95,summary:'Strong negative stereo correlation is consistent with a polarity reversal.',alternatives:['reversed cartridge lead','inverted cable/adapter','intentional source polarity'],isolationTests:['repeat with mono reference','inspect cartridge lead order']});
  if(dropoutCount>0)out.push({code:'INTERMITTENT_PATH',confidence:.7,summary:'One or more signal dropout regions were observed.',alternatives:['intermittent connector','media dropout','capture discontinuity','intentional silence'],isolationTests:['repeat capture','flex-test cable/connector','compare alternate source']});
  return out;
}

export function normalizedLevelTrace(samples,sampleRate,{windowMs=20}={}){
  const win=Math.max(8,Math.floor(sampleRate*windowMs/1000));const raw=[];let max=0;
  for(let start=0;start+win<=samples.length;start+=win){let sum=0;for(let i=start;i<start+win;i++)sum+=samples[i]*samples[i];const value=Math.sqrt(sum/win);max=Math.max(max,value);raw.push({timeSec:(start+win/2)/sampleRate,value});}
  const denom=Math.max(max,1e-12);return raw.map(x=>({timeSec:x.timeSec,level:x.value/denom}));
}

export function repeatabilityMetrics(values=[]){const v=values.filter(Number.isFinite);if(!v.length)return {count:0,mean:NaN,stdDev:NaN,min:NaN,max:NaN,range:NaN};const mean=v.reduce((a,b)=>a+b,0)/v.length;const stdDev=Math.sqrt(v.reduce((a,b)=>a+(b-mean)*(b-mean),0)/v.length);const min=Math.min(...v),max=Math.max(...v);return {count:v.length,mean,stdDev,min,max,range:max-min};}
export function trendMetrics(points=[]){const v=points.filter(p=>Number.isFinite(p.timeMin)&&Number.isFinite(p.value));if(v.length<2)return {count:v.length,slopePerMin:NaN,intercept:NaN,rSquared:NaN};const fit=linearRegression(v.map(p=>({x:p.timeMin,y:p.value})));const mean=v.reduce((a,p)=>a+p.value,0)/v.length;let ssTot=0,ssRes=0;for(const p of v){const pred=fit.intercept+fit.slope*p.timeMin;ssTot+=(p.value-mean)**2;ssRes+=(p.value-pred)**2;}return {count:v.length,slopePerMin:fit.slope,intercept:fit.intercept,rSquared:ssTot>1e-12?1-ssRes/ssTot:1};}

export function traceModulationPercent(trace,{referenceHz=1000,frequencyHz=.5555556}={}){const v=(trace||[]).filter(x=>Number.isFinite(x.timeSec)&&Number.isFinite(x.frequencyHz));if(v.length<3)return NaN;let s=0,c=0;for(const p of v){const d=(p.frequencyHz/referenceHz-1)*100;const a=2*Math.PI*frequencyHz*p.timeSec;s+=d*Math.sin(a);c+=d*Math.cos(a);}return 2*Math.sqrt(s*s+c*c)/v.length;}
export function ellipseMetrics(left,right){const n=Math.min(left?.length||0,right?.length||0);if(!n)return {majorAxis:0,minorAxis:0,axisRatio:0,eccentricity:1,rotationRad:0,centerX:0,centerY:0};let mx=0,my=0;for(let i=0;i<n;i++){mx+=left[i];my+=right[i];}mx/=n;my/=n;let xx=0,yy=0,xy=0;for(let i=0;i<n;i++){const x=left[i]-mx,y=right[i]-my;xx+=x*x;yy+=y*y;xy+=x*y;}xx/=n;yy/=n;xy/=n;const tr=xx+yy,disc=Math.sqrt(Math.max(0,(xx-yy)*(xx-yy)+4*xy*xy));const l1=Math.max(0,(tr+disc)/2),l2=Math.max(0,(tr-disc)/2);const majorAxis=Math.sqrt(l1),minorAxis=Math.sqrt(l2),axisRatio=majorAxis>1e-12?minorAxis/majorAxis:0;return {majorAxis,minorAxis,axisRatio,eccentricity:Math.sqrt(Math.max(0,1-axisRatio*axisRatio)),rotationRad:.5*Math.atan2(2*xy,xx-yy),centerX:mx,centerY:my};}
export function dvsIntegrityScore({leftPresent=true,rightPresent=true,balanceDb=0,circularity=0,clippedSamples=0,missingWindowRatio=0,humDb=-100}={}){const components={channelPresence:(leftPresent?12.5:0)+(rightPresent?12.5:0),balance:Math.max(0,15-Math.abs(balanceDb)*3),geometry:Math.max(0,Math.min(20,circularity*20)),clipping:clippedSamples===0?10:Math.max(0,10-Math.log10(clippedSamples+1)*5),continuity:Math.max(0,20*(1-Math.max(0,Math.min(1,missingWindowRatio)))),noise:Math.max(0,Math.min(10,(-humDb-30)/4))};const score=Object.values(components).reduce((a,b)=>a+b,0);return {score:Math.round(Math.max(0,Math.min(100,score))),components};}
export function subsonicPeak(samples,sampleRate,{minHz=.2,maxHz=5,stepHz=.1}={}){let frequencyHz=minHz,amplitude=-1;for(let f=minHz;f<=maxHz+stepHz/2;f+=stepHz){const a=toneAmp(samples,sampleRate,f);if(a>amplitude){amplitude=a;frequencyHz=f;}}return {frequencyHz,amplitude,levelDb:dbfs(amplitude)};}
export function compareEventMaps(before=[],after=[],{tolerance=.01}={}){const used=new Set(),persistent=[],resolved=[],newEvents=[];for(const a of before){let best=-1,bestD=Infinity;for(let i=0;i<after.length;i++){if(used.has(i))continue;const d=Math.abs((a.normalizedPosition??0)-(after[i].normalizedPosition??0));if(d<bestD){bestD=d;best=i;}}if(best>=0&&bestD<=tolerance){used.add(best);persistent.push({before:a,after:after[best],delta:bestD});}else resolved.push(a);}for(let i=0;i<after.length;i++)if(!used.has(i))newEvents.push(after[i]);return {persistent,resolved,newEvents};}
