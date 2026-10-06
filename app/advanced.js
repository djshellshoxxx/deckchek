import { dbfs, estimateToneFrequency, rms } from './core.js';

export function frequencyTrace(samples,sampleRate,{referenceHz=1000,windowSec=.5,hopSec=.25,spanHz=100}={}){
  const win=Math.max(64,Math.floor(windowSec*sampleRate));
  const hop=Math.max(1,Math.floor(hopSec*sampleRate));
  const out=[];
  for(let start=0;start+win<=samples.length;start+=hop){
    const chunk=samples.subarray(start,start+win);
    const frequencyHz=estimateToneFrequency(chunk,sampleRate,{minHz:Math.max(1,referenceHz-spanHz),maxHz:referenceHz+spanHz,coarseStepHz:.5});
    out.push({timeSec:(start+win/2)/sampleRate,frequencyHz});
  }
  return out;
}

export function speedStabilityMetrics(trace,{referenceHz=1000,nominalRpm=33.333333}={}){
  const ratios=(trace||[]).map(x=>x.frequencyHz/referenceHz).filter(Number.isFinite);
  if(!ratios.length)return {meanPitchPercent:NaN,meanRpm:NaN,wowFlutterRmsPercent:NaN,peakDeviationPercent:NaN,driftPercent:NaN};
  const mean=ratios.reduce((a,b)=>a+b,0)/ratios.length;
  const centered=ratios.map(r=>(r-mean)*100);
  const wowFlutterRmsPercent=Math.sqrt(centered.reduce((a,b)=>a+b*b,0)/centered.length);
  const peakDeviationPercent=Math.max(...centered.map(Math.abs));
  const driftPercent=(ratios.at(-1)-ratios[0])*100;
  return {meanPitchPercent:(mean-1)*100,meanRpm:nominalRpm*mean,wowFlutterRmsPercent,peakDeviationPercent,driftPercent};
}

export function dropoutMetrics(samples,sampleRate,{windowMs=20,dropDb=24,minWindows=2}={}){
  const win=Math.max(8,Math.floor(sampleRate*windowMs/1000));
  const levels=[];
  for(let i=0;i+win<=samples.length;i+=win) levels.push(dbfs(rms(samples.subarray(i,i+win))));
  const finite=levels.filter(Number.isFinite).sort((a,b)=>a-b);
  const baseline=finite.length?finite[Math.floor(finite.length*.75)]:-240;
  const threshold=baseline-dropDb;
  let count=0,totalWindows=0,run=0,maxRun=0;
  for(const level of levels){
    if(level<threshold){run++;totalWindows++;}
    else {if(run>=minWindows)count++;maxRun=Math.max(maxRun,run);run=0;}
  }
  if(run>=minWindows)count++; maxRun=Math.max(maxRun,run);
  return {baselineDb:baseline,thresholdDb:threshold,dropoutCount:count,dropoutDurationSec:totalWindows*win/sampleRate,longestDropoutSec:maxRun*win/sampleRate};
}

export function generateSine({frequencyHz=1000,sampleRate=48000,durationSec=5,amplitude=.5,phase=0}={}){
  const n=Math.max(1,Math.floor(sampleRate*durationSec));const out=new Float32Array(n);
  for(let i=0;i<n;i++)out[i]=amplitude*Math.sin(phase+2*Math.PI*frequencyHz*i/sampleRate);
  return out;
}

export function encodeWav16({left,right=null,sampleRate=48000}){
  const channels=right?2:1;const n=right?Math.min(left.length,right.length):left.length;const blockAlign=channels*2;const dataSize=n*blockAlign;const bytes=new Uint8Array(44+dataSize);const v=new DataView(bytes.buffer);
  const write=(offset,s)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));};
  write(0,'RIFF');v.setUint32(4,36+dataSize,true);write(8,'WAVE');write(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*blockAlign,true);v.setUint16(32,blockAlign,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,dataSize,true);
  let o=44;for(let i=0;i<n;i++){const vals=right?[left[i],right[i]]:[left[i]];for(const x of vals){const q=Math.max(-1,Math.min(1,x));v.setInt16(o,q<0?q*32768:q*32767,true);o+=2;}}
  return bytes;
}
