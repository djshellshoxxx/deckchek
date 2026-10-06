import {
  analyzeVinylSide, buildHtmlReport, compareRuns, lowBandEnergyDb, normalizeMeasurement,
  quickDiagnostic, rms, scopeMetrics, speedFromReferenceTone
} from './core.js';
import { dropoutMetrics, encodeWav16, frequencyTrace, generateSine, speedStabilityMetrics } from './advanced.js';
import { dvsIntegrityTimeline, normalizedEventMap, channelSeparationDb, normalizedLevelTrace, pitchMapMetrics, reasonFromEvidence, repeatabilityMetrics, thdPercent, transitionMetrics, trendMetrics } from './diagnostics.js';
import { measurementsToCsv, parseWorkspaceJson, serializeWorkspaceJson } from './export.js';

const DEMO_EQUIPMENT=[
  {id:'eq-technics',name:'Technics SL-1200MK2',kind:'Turntable',chain:'Ortofon Concorde MKII · Rane Seventy-Two',tested:'Not tested',status:'Unverified'},
  {id:'eq-plx',name:'Pioneer PLX-1000',kind:'Turntable',chain:'Shure M44-7 · Allen & Heath Xone:96',tested:'Not tested',status:'Unverified'},
  {id:'eq-cdj',name:'Pioneer CDJ-3000',kind:'Media player',chain:'Digital out · mixer',tested:'Not tested',status:'Unverified'},
  {id:'eq-twelve',name:'Rane Twelve MKII',kind:'Controller',chain:'USB · mixer',tested:'Not tested',status:'Unverified'},
  {id:'eq-interface',name:'Measurement audio interface',kind:'Audio interface',chain:'Stereo measurement input',tested:'Not tested',status:'Unverified'}
];
const STORAGE_KEY='deckchek.workspace.v1';
const pages=['overview','tests','equipment','results','setup'];
let selectedRunId=null;
let currentTest='Stereo balance';
let equipment=[];
let runs=[];

function loadWorkspace(){
  try{
    const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(value?.version===1){equipment=Array.isArray(value.equipment)?value.equipment:[];runs=Array.isArray(value.runs)?value.runs:[];}
  }catch{}
  if(!equipment.length) equipment=DEMO_EQUIPMENT.map(x=>({...x}));
}
function saveWorkspace(){localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,equipment,runs:runs.slice(0,250)}));}
async function invokeNative(command,args={}){const invoke=window.__TAURI__?.core?.invoke;if(!invoke)return null;return invoke(command,args);}
async function initializeNativePersistence(){try{const path=await invokeNative('initialize_database');if(path)showToast('Desktop persistence connected.');}catch(error){showToast(`SQLite initialization failed: ${error}`);}}
async function persistNative(run){try{await invokeNative('save_diagnostic_run',{run});}catch(error){showToast(`Run saved to browser storage; SQLite write failed: ${error}`);}}
function uid(prefix){return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const toast=document.getElementById('toast');
function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),3200);}
function go(page){pages.forEach(name=>document.getElementById('page-'+name)?.classList.toggle('active',name===page));document.querySelectorAll('.nav-item').forEach(button=>button.classList.toggle('active',button.dataset.page===page));const crumb=document.getElementById('crumb-current');if(crumb)crumb.textContent=({overview:'Overview',tests:'Test center',equipment:'Equipment',results:'Results',setup:'Audio setup'})[page]||'Overview';window.scrollTo({top:0,behavior:'smooth'});}

function renderEquipment(query=''){
  const body=document.getElementById('equipment-table');
  const filtered=equipment.filter(item=>(item.name+' '+item.kind+' '+item.chain).toLowerCase().includes(query.toLowerCase()));
  body.innerHTML=filtered.map(item=>`<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.kind)}</td><td>${escapeHtml(item.chain)}</td><td>${escapeHtml(item.tested||'Not tested')}</td><td><span class="status-pill ${item.status==='Good'?'good':'review'}">${escapeHtml(item.status||'Unverified')}</span></td><td><button class="row-action" data-equipment-id="${escapeHtml(item.id)}">Open →</button></td></tr>`).join('');
  document.getElementById('equipment-empty')?.classList.toggle('hidden',filtered.length!==0);
  const count=document.querySelector('.toolbar-count');if(count)count.textContent=`${filtered.length} ITEMS`;
  body.querySelectorAll('[data-equipment-id]').forEach(button=>button.addEventListener('click',()=>showToast(`${equipment.find(x=>x.id===button.dataset.equipmentId)?.name||'Equipment'} · local record`)));
}

function renderResults(){
  const body=document.getElementById('results-body'); if(!body)return;
  if(!runs.length){body.innerHTML='<tr><td colspan="6">No measured sessions yet. Analyze an audio file from Test Center.</td></tr>';return;}
  body.innerHTML=runs.map(run=>{const first=run.findings?.[0];const score=run.score??'—';const scoreClass=typeof score==='number'&&score>=85?'good':'review';return `<tr><td><strong>${escapeHtml(run.device)}</strong></td><td>${escapeHtml(run.test)}</td><td>${escapeHtml(new Date(run.createdAt).toLocaleString())}</td><td><span class="result-score ${scoreClass}">${escapeHtml(score)}</span></td><td>${escapeHtml(first?.title||'No notable findings')}</td><td><button class="row-action" data-run="${run.id}">View →</button></td></tr>`;}).join('');
  body.querySelectorAll('[data-run]').forEach(button=>button.addEventListener('click',()=>showRun(button.dataset.run)));
}
function showRun(id){const run=runs.find(x=>x.id===id);if(!run)return;selectedRunId=id;const details=[...run.measurements.slice(0,5).map(m=>`${m.label}: ${formatValue(m.value)} ${m.unit}`),...(run.findings||[]).slice(0,2).map(f=>f.title)];showToast(`${run.test} · ${details.join(' · ')}`);}
function formatValue(v){return typeof v==='number'?(Math.abs(v)>=100?v.toFixed(1):v.toFixed(3)):String(v);}

async function decodeAudio(file){
  const bytes=await file.arrayBuffer();
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)throw new Error('Web Audio is unavailable in this runtime.');
  const ctx=new Context();
  try{
    const audio=await ctx.decodeAudioData(bytes.slice(0));
    const left=new Float32Array(audio.getChannelData(0));
    const right=audio.numberOfChannels>1?new Float32Array(audio.getChannelData(1)):new Float32Array(left);
    return {left,right,sampleRate:audio.sampleRate,durationSec:audio.duration,channels:audio.numberOfChannels};
  }finally{await ctx.close();}
}

function scoreFromFindings(findings=[]){let score=100;for(const f of findings)score-=f.severity==='critical'?35:f.severity==='warning'?18:f.severity==='review'?8:2;return Math.max(0,Math.round(score));}
function analyzeForTest(test,audio){
  const q=quickDiagnostic(audio);let measurements=[...q.measurements],findings=[...q.findings],score=scoreFromFindings(q.findings);
  if(test==='Speed & pitch'){
    const referenceHz=Number(document.getElementById('reference-hz')?.value||1000);const nominalRpm=Number(document.getElementById('nominal-rpm')?.value||33.333333);
    const s=speedFromReferenceTone(audio.left,audio.sampleRate,{referenceHz,nominalRpm});
    const trace=frequencyTrace(audio.left,audio.sampleRate,{referenceHz,windowSec:.5,hopSec:.25,spanHz:Math.max(25,referenceHz*.08)});
    const stability=speedStabilityMetrics(trace,{referenceHz,nominalRpm});
    measurements.push(
      normalizeMeasurement({metricId:'measured_frequency_hz',label:'Measured reference frequency',value:s.measuredHz,unit:'Hz',confidence:.9}),
      normalizeMeasurement({metricId:'rpm',label:'Estimated platter speed',value:stability.meanRpm,unit:'RPM',confidence:.85}),
      normalizeMeasurement({metricId:'pitch_percent',label:'Mean speed/pitch error',value:stability.meanPitchPercent,unit:'%',confidence:.85}),
      normalizeMeasurement({metricId:'wow_flutter_rms_percent',label:'Short-term speed variation proxy',value:stability.wowFlutterRmsPercent,unit:'%',confidence:.7}),
      normalizeMeasurement({metricId:'speed_drift_percent',label:'Start-to-end speed drift',value:stability.driftPercent,unit:'%',confidence:.75}),
      normalizeMeasurement({metricId:'peak_speed_deviation_percent',label:'Peak short-term deviation',value:stability.peakDeviationPercent,unit:'%',confidence:.7})
    );
    if(Math.abs(stability.meanPitchPercent)>.3)findings.push({code:'SPEED_ERROR',title:'Speed differs from reference',detail:`Estimated mean speed error ${stability.meanPitchPercent.toFixed(3)}%.`,severity:Math.abs(stability.meanPitchPercent)>1?'warning':'review',confidence:.85,possibleCauses:['pitch calibration','reference-tone mismatch','platter speed error'],isolationTests:['confirm test-record reference frequency','repeat after warm-up','compare quartz-lock position']});
    if(stability.wowFlutterRmsPercent>.25)findings.push({code:'SPEED_INSTABILITY',title:'Short-term speed variation is elevated',detail:`Measured proxy ${stability.wowFlutterRmsPercent.toFixed(3)}% RMS across analysis windows.`,severity:stability.wowFlutterRmsPercent>.6?'warning':'review',confidence:.7,possibleCauses:['platter/belt/drive instability','record eccentricity','reference source instability'],isolationTests:['repeat with verified test record','compare 33⅓ and 45 RPM','inspect mechanical drive and platter']});
    score=scoreFromFindings(findings);
  }else if(test==='Quartz lock'){
    const referenceHz=Number(document.getElementById('reference-hz')?.value||1000);const nominalRpm=Number(document.getElementById('nominal-rpm')?.value||33.333333);const mode=document.getElementById('quartz-mode')?.value||'locked';const s=speedFromReferenceTone(audio.left,audio.sampleRate,{referenceHz,nominalRpm});
    measurements.push(normalizeMeasurement({metricId:'quartz_speed_error_percent',label:`${mode==='locked'?'Quartz/reset':'Free center'} speed error`,value:s.pitchPercent,unit:'%',confidence:.85}),normalizeMeasurement({metricId:'quartz_mode_code',label:'Quartz test state',value:mode==='locked'?1:0,unit:'code',origin:'user_entered',confidence:1}),normalizeMeasurement({metricId:'quartz_rpm',label:'Measured platter speed',value:s.rpm,unit:'RPM',confidence:.85}));
    score=scoreFromFindings(findings);
  }else if(test==='Warm-up speed'){
    const referenceHz=Number(document.getElementById('reference-hz')?.value||1000);const nominalRpm=Number(document.getElementById('nominal-rpm')?.value||33.333333);const elapsed=Number(document.getElementById('warmup-elapsed-min')?.value||0);const s=speedFromReferenceTone(audio.left,audio.sampleRate,{referenceHz,nominalRpm});
    measurements.push(normalizeMeasurement({metricId:'warmup_elapsed_min',label:'Elapsed warm-up time',value:elapsed,unit:'min',origin:'user_entered',confidence:1}),normalizeMeasurement({metricId:'warmup_speed_error_percent',label:'Warm-up speed error',value:s.pitchPercent,unit:'%',confidence:.85}),normalizeMeasurement({metricId:'warmup_rpm',label:'Warm-up measured RPM',value:s.rpm,unit:'RPM',confidence:.85}));
    score=scoreFromFindings(findings);
  }else if(test==='Pitch map'){
    const referenceHz=Number(document.getElementById('reference-hz')?.value||1000);
    const nominalRpm=Number(document.getElementById('nominal-rpm')?.value||33.333333);
    const s=speedFromReferenceTone(audio.left,audio.sampleRate,{referenceHz,nominalRpm});
    const position=Number(document.getElementById('pitch-position')?.value||0);
    const direction=document.getElementById('pitch-direction')?.value||'unknown';
    measurements.push(
      normalizeMeasurement({metricId:'pitch_position',label:'Pitch control position',value:position,unit:'%',origin:'user_entered',confidence:1}),
      normalizeMeasurement({metricId:'measured_pitch_percent',label:'Measured pitch/speed change',value:s.pitchPercent,unit:'%',confidence:.85}),
      normalizeMeasurement({metricId:'pitch_direction_code',label:'Pitch-map pass direction',value:direction==='up'?1:direction==='down'?-1:0,unit:'code',origin:'user_entered',confidence:1})
    );
    if(Math.abs(s.pitchPercent-position)>.5)findings.push({code:'PITCH_TRACKING_ERROR',title:'Pitch control differs from measured speed',detail:`Control position ${position.toFixed(2)}%; measured speed change ${s.pitchPercent.toFixed(3)}%.`,severity:Math.abs(s.pitchPercent-position)>1.5?'warning':'review',confidence:.8,possibleCauses:['pitch calibration','fader nonlinearity','dead zone','reference-tone mismatch'],isolationTests:['repeat at the same position','map both travel directions','verify zero/quartz position']});
    score=scoreFromFindings(findings);
  }else if(test==='DVS signal'){
    const s=scopeMetrics(audio.left,audio.right);
    const timeline=dvsIntegrityTimeline(audio.left,audio.right,audio.sampleRate,{windowSec:.1});
    const missing=timeline.filter(x=>!x.signalPresent).length;
    measurements.push(
      normalizeMeasurement({metricId:'dvs_scope_circularity',label:'Generic scope circularity',value:s.circularity,unit:'ratio',confidence:.9}),
      normalizeMeasurement({metricId:'dvs_scope_correlation',label:'Generic scope correlation',value:s.correlation,unit:'ratio',confidence:.9}),
      normalizeMeasurement({metricId:'dvs_missing_windows',label:'DVS missing-signal windows',value:missing,unit:'windows',confidence:.85})
    );
    if(s.circularity<.45)findings.push({code:'DVS_SCOPE_DEFORMED',title:'Generic DVS scope is strongly asymmetric',detail:`Circularity metric ${s.circularity.toFixed(3)}.`,severity:'review',confidence:.75,possibleCauses:['channel imbalance','phase relationship','tracking or wear','unsupported control signal'],isolationTests:['verify both channels','repeat with known-good control media','use vendor decoder when implemented']});
    if(missing>0)findings.push({code:'DVS_SIGNAL_GAP',title:'DVS signal gaps detected',detail:`${missing} analysis window(s) fell below the generic presence threshold.`,severity:'review',confidence:.8,possibleCauses:['control-media wear','tracking loss','signal-path dropout','intentional silence or unsupported format'],isolationTests:['repeat same region','compare known-good control media','inspect cartridge and signal path']});
    score=scoreFromFindings(findings);
  }else if(test==='Startup & brake'){
    const trace=normalizedLevelTrace(audio.left,audio.sampleRate,{windowMs:20});
    const stopSec=Number(document.getElementById('transition-stop-sec')?.value||Math.max(0,audio.durationSec/2));
    let stopIndex=0,best=Infinity;for(let i=0;i<trace.length;i++){const diff=Math.abs(trace[i].timeSec-stopSec);if(diff<best){best=diff;stopIndex=i;}}
    const tm=transitionMetrics(trace,{startIndex:0,stopIndex,readyThreshold:.9,stoppedThreshold:.1});
    measurements.push(
      normalizeMeasurement({metricId:'startup_envelope_90_sec',label:'Signal-envelope rise to 90%',value:tm.startupSec??-1,unit:'s',confidence:.55}),
      normalizeMeasurement({metricId:'brake_envelope_10_sec',label:'Signal-envelope fall to 10%',value:tm.brakeSec??-1,unit:'s',confidence:.55}),
      normalizeMeasurement({metricId:'transition_stop_marker_sec',label:'User stop/brake marker',value:stopSec,unit:'s',origin:'user_entered',confidence:1})
    );
    if(tm.startupSec==null||tm.brakeSec==null)findings.push({code:'TRANSITION_INCOMPLETE',title:'Transition threshold not reached',detail:'The selected recording did not cross one or more envelope thresholds.',severity:'review',confidence:.8,possibleCauses:['incorrect stop marker','recording does not contain full transition','signal level too low'],isolationTests:['repeat from stationary start','capture through complete stop','adjust stop marker']});
    score=scoreFromFindings(findings);
  }else if(test==='Channel separation'){
    const active=document.getElementById('separation-active')?.value||'left';const activeLevel=active==='left'?rms(audio.left):rms(audio.right);const leakLevel=active==='left'?rms(audio.right):rms(audio.left);const separation=channelSeparationDb(activeLevel,leakLevel);
    measurements.push(normalizeMeasurement({metricId:'channel_separation_db',label:`${active==='left'?'Left':'Right'}-track channel separation`,value:separation,unit:'dB',confidence:.8}),normalizeMeasurement({metricId:'separation_reference_channel',label:'Isolated reference channel',value:active==='left'?0:1,unit:'code',origin:'user_entered',confidence:1}));
    findings.push({code:'SEPARATION_CONTEXT',title:'Channel-separation result requires reference context',detail:`Measured broadband separation is ${separation.toFixed(2)} dB for the declared isolated-${active} track. Compare against the documented test record and calibrated interface baseline before attributing loss to the cartridge.`,severity:'informational',confidence:.9,possibleCauses:['cartridge crosstalk','azimuth/alignment','test-record leakage','interface or mixer crosstalk'],isolationTests:['measure interface loopback isolation','repeat opposite-channel track','compare known-good cartridge']});
    score=scoreFromFindings(findings);
  }else if(test==='Channel & cartridge'){
    const referenceHz=Number(document.getElementById('reference-hz')?.value||1000);
    const leftThd=thdPercent(audio.left,audio.sampleRate,referenceHz);
    const rightThd=thdPercent(audio.right,audio.sampleRate,referenceHz);
    measurements.push(
      normalizeMeasurement({metricId:'left_thd_percent',label:'Left THD estimate',value:leftThd,unit:'%',confidence:.65}),
      normalizeMeasurement({metricId:'right_thd_percent',label:'Right THD estimate',value:rightThd,unit:'%',confidence:.65})
    );
    if(Math.max(leftThd,rightThd)>5)findings.push({code:'ELEVATED_DISTORTION',title:'Elevated harmonic distortion estimate',detail:`Estimated THD L ${leftThd.toFixed(2)}%, R ${rightThd.toFixed(2)}% at the selected reference frequency.`,severity:'review',confidence:.65,possibleCauses:['mistracking','test-record distortion','input overload','stylus/cartridge condition'],isolationTests:['verify clean reference track','reduce gain and repeat','compare cartridge/channel swap']});
    score=scoreFromFindings(findings);
  }else if(test==='Vibration check'){
    const low=lowBandEnergyDb(audio.left,audio.sampleRate,80);measurements.push(normalizeMeasurement({metricId:'low_frequency_energy_dbfs',label:'Low-frequency energy proxy',value:low,unit:'dBFS',confidence:.7}));if(low>-35)findings.push({code:'LOW_FREQUENCY_ENERGY',title:'Elevated low-frequency energy',detail:`Low-band proxy measured ${low.toFixed(1)} dBFS.`,severity:'review',confidence:.65,possibleCauses:['booth vibration','acoustic feedback','record warp','handling/footfall'],isolationTests:['capture quiet baseline','repeat with monitors muted','compare isolation treatment']});score=scoreFromFindings(findings);
  }else if(test==='Vinyl side scan'){
    const v=analyzeVinylSide(audio);const mapped=normalizedEventMap(v.events,v.durationSec);measurements.push(normalizeMeasurement({metricId:'vinyl_transients_per_min',label:'Transient events per minute',value:v.transientDensityPerMin,unit:'events/min',confidence:.72}),normalizeMeasurement({metricId:'vinyl_rumble_dbfs',label:'Subsonic/rumble proxy',value:v.rumbleDb,unit:'dBFS',confidence:.65}),normalizeMeasurement({metricId:'vinyl_condition_score',label:'Condition score',value:v.conditionScore,unit:'/100',confidence:.6}),normalizeMeasurement({metricId:'vinyl_event_count',label:'Mapped transient candidates',value:mapped.length,unit:'events',confidence:.7}));if(v.events.length)findings.push({code:'VINYL_TRANSIENTS',title:`${v.events.length} transient candidates detected`,detail:'Transient candidates are evidence only; clicks, dust, scratches, cueing and musical attacks require confirmation.',severity:v.conditionScore<65?'warning':'review',confidence:.65,possibleCauses:['surface contamination','scratch or groove damage','musical transient','static discharge'],isolationTests:['repeat scan','clean record and compare','check recurrence at platter period']});if(v.recurrence.confidence>.7)findings.push({code:'REPEATING_EVENT',title:'Repeating event pattern detected',detail:`Candidate recurrence period ${v.recurrence.periodSec?.toFixed(3)} s.`,severity:'review',confidence:v.recurrence.confidence,possibleCauses:['repeating scratch','locked/repeating groove','periodic mechanical event'],isolationTests:['repeat scan from same side','compare event position by revolution']});score=v.conditionScore;
  }
  const drop=dropoutMetrics(audio.left,audio.sampleRate,{windowMs:20,dropDb:30});
  measurements.push(normalizeMeasurement({metricId:'dropout_count',label:'Capture/signal dropout regions',value:drop.dropoutCount,unit:'regions',confidence:.8}));
  if(drop.dropoutCount>0)findings.push({code:'SIGNAL_DROPOUT',title:'Signal dropout regions detected',detail:`${drop.dropoutCount} low-level region(s), totaling ${drop.dropoutDurationSec.toFixed(3)} s, fell well below the surrounding signal.`,severity:'review',confidence:.75,possibleCauses:['source dropout','intermittent contact','capture discontinuity','intentional silence'],isolationTests:['repeat capture','inspect contacts/cables','compare source waveform']});
  const balance=measurements.find(m=>m.metricId==='channel_balance_db')?.value??0;
  const hum=Math.max(measurements.find(m=>m.metricId==='left_hum_dbfs')?.value??-120,measurements.find(m=>m.metricId==='right_hum_dbfs')?.value??-120);
  const corr=measurements.find(m=>m.metricId==='correlation')?.value??0;
  for(const hypothesis of reasonFromEvidence({channelBalanceDb:balance,humDb:hum,correlation:corr,dropoutCount:drop.dropoutCount})){
    if(findings.some(f=>f.code===hypothesis.code))continue;
    findings.push({code:hypothesis.code,title:'Diagnostic hypothesis',detail:hypothesis.summary,severity:'review',confidence:hypothesis.confidence,possibleCauses:hypothesis.alternatives,isolationTests:hypothesis.isolationTests});
  }
  return {measurements,findings,score:Math.min(score,scoreFromFindings(findings))};
}

function openTest(name){currentTest=name;document.getElementById('modal-title').textContent=name;document.getElementById('modal-copy').textContent='Choose equipment and an audio file. DeckChek will analyze the file locally and save the evidence record on this device.';const select=document.getElementById('modal-deck');select.innerHTML=equipment.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');document.getElementById('analysis-file').value='';document.getElementById('speed-fields')?.classList.toggle('hidden',!['Speed & pitch','Pitch map','Channel & cartridge','Quartz lock','Warm-up speed'].includes(name));
  document.getElementById('pitch-fields')?.classList.toggle('hidden',name!=='Pitch map');
  document.getElementById('transition-fields')?.classList.toggle('hidden',name!=='Startup & brake');
  document.getElementById('separation-fields')?.classList.toggle('hidden',name!=='Channel separation');
  document.getElementById('quartz-fields')?.classList.toggle('hidden',name!=='Quartz lock');
  document.getElementById('warmup-fields')?.classList.toggle('hidden',name!=='Warm-up speed');document.getElementById('modal-backdrop').classList.remove('hidden');}
async function finalizeAnalysis(audio,sourceName,qualityFindings=[]){
  const result=analyzeForTest(currentTest,audio);result.findings.push(...qualityFindings);result.score=Math.min(result.score,scoreFromFindings(result.findings));
  const device=equipment.find(x=>x.id===document.getElementById('modal-deck').value)||equipment[0];
  const run={id:uid('run'),deviceId:device?.id||null,device:device?.name||'Unassigned',test:currentTest,createdAt:new Date().toISOString(),sourceFile:sourceName,durationSec:audio.durationSec,sampleRate:audio.sampleRate,channels:audio.channels,measurements:result.measurements,findings:result.findings,score:result.score};
  if(currentTest==='Quartz lock'){
    const row=r=>({mode:(r.measurements.find(m=>m.metricId==='quartz_mode_code')?.value??1)===1?'locked':'free',error:r.measurements.find(m=>m.metricId==='quartz_speed_error_percent')?.value});
    const current=row(run);const prior=runs.filter(r=>r.test==='Quartz lock'&&r.deviceId===run.deviceId).map(row);const all=[...prior,current];const locked=repeatabilityMetrics(all.filter(x=>x.mode==='locked').map(x=>x.error));const free=repeatabilityMetrics(all.filter(x=>x.mode==='free').map(x=>x.error));
    if(locked.count)run.measurements.push(normalizeMeasurement({metricId:'quartz_lock_mean_error_percent',label:'Quartz/reset mean error',value:locked.mean,unit:'%',confidence:Math.min(1,locked.count/10)}),normalizeMeasurement({metricId:'quartz_lock_repeat_std_percent',label:'Quartz/reset repeatability σ',value:locked.stdDev,unit:'%',confidence:Math.min(1,locked.count/10)}));
    if(locked.count&&free.count)run.measurements.push(normalizeMeasurement({metricId:'center_to_lock_delta_percent',label:'Free-center to quartz/reset delta',value:locked.mean-free.mean,unit:'%',confidence:Math.min(1,Math.min(locked.count,free.count)/3)}));
  }
  if(currentTest==='Warm-up speed'){
    const point=r=>({timeMin:r.measurements.find(m=>m.metricId==='warmup_elapsed_min')?.value,value:r.measurements.find(m=>m.metricId==='warmup_speed_error_percent')?.value});const points=runs.filter(r=>r.test==='Warm-up speed'&&r.deviceId===run.deviceId).map(point);points.push(point(run));const trend=trendMetrics(points);
    if(Number.isFinite(trend.slopePerMin))run.measurements.push(normalizeMeasurement({metricId:'warmup_drift_percent_per_min',label:'Warm-up drift trend',value:trend.slopePerMin,unit:'%/min',confidence:Math.min(1,trend.count/5)}),normalizeMeasurement({metricId:'warmup_trend_r2',label:'Warm-up trend fit R²',value:trend.rSquared,unit:'ratio',confidence:Math.min(1,trend.count/5)}));
  }
  if(currentTest==='Pitch map'){
    const pointFromRun=r=>{const pos=r.measurements.find(m=>m.metricId==='pitch_position')?.value;const measured=r.measurements.find(m=>m.metricId==='measured_pitch_percent')?.value;const directionCode=r.measurements.find(m=>m.metricId==='pitch_direction_code')?.value;return Number.isFinite(pos)&&Number.isFinite(measured)?{position:pos,measuredPercent:measured,direction:directionCode===1?'up':directionCode===-1?'down':'unknown'}:null;};
    const points=runs.filter(r=>r.test==='Pitch map'&&r.deviceId===run.deviceId).map(pointFromRun).filter(Boolean);const current=pointFromRun(run);if(current)points.push(current);
    const map=pitchMapMetrics(points);
    if(Number.isFinite(map.slope))run.measurements.push(normalizeMeasurement({metricId:'pitch_map_slope',label:'Pitch map slope',value:map.slope,unit:'measured/input',confidence:Math.min(1,points.length/6)}));
    run.measurements.push(normalizeMeasurement({metricId:'pitch_map_nonlinearity',label:'Pitch-map maximum nonlinearity',value:map.maxNonlinearityPercent,unit:'%',confidence:Math.min(1,points.length/6)}),normalizeMeasurement({metricId:'pitch_map_hysteresis',label:'Pitch-map hysteresis',value:map.hysteresisPercent,unit:'%',confidence:Math.min(1,points.length/8)}),normalizeMeasurement({metricId:'pitch_map_dead_spots',label:'Pitch-map dead-spot candidates',value:map.deadSpotCount,unit:'segments',confidence:Math.min(1,points.length/8)}));
  }
  runs.unshift(run);selectedRunId=run.id;if(device){device.tested=new Date().toLocaleDateString();device.status=result.score>=85?'Good':'Review';}
  saveWorkspace();await persistNative(run);renderEquipment(document.getElementById('equipment-search').value);renderResults();document.getElementById('modal-backdrop').classList.add('hidden');go('results');showToast(`${currentTest} complete · ${result.measurements.length} measurements · ${result.findings.length} findings`);
}
async function runSelectedTest(){
  const file=document.getElementById('analysis-file').files?.[0];if(!file){showToast('Select an audio file first.');return;}
  const button=document.getElementById('modal-run');button.disabled=true;button.textContent='Analyzing…';
  try{await finalizeAnalysis(await decodeAudio(file),file.name);}
  catch(error){showToast(`Analysis failed: ${error.message}`);}
  finally{button.disabled=false;button.innerHTML='Analyze file <span>→</span>';}
}
async function runLiveCapture(){
  const button=document.getElementById('modal-capture');const durationSec=Number(document.getElementById('capture-duration')?.value||5);
  if(!window.__TAURI__?.core?.invoke){showToast('Native capture is available in the Tauri desktop build.');return;}
  button.disabled=true;button.textContent='Capturing…';
  try{
    const select=document.getElementById('input-device');const deviceName=select?.dataset.backend==='native'&&select.value?select.value:null;
    const payload=await invokeNative('capture_native_audio',{deviceName,durationSec});
    const audio={left:Float32Array.from(payload.left||[]),right:Float32Array.from(payload.right||[]),sampleRate:payload.sampleRate,channels:payload.channels,durationSec:(payload.left?.length||0)/Math.max(1,payload.sampleRate)};
    if(!audio.left.length)throw new Error('Native capture returned no samples.');
    const quality=(payload.streamErrors||[]).length?[{code:'CAPTURE_STREAM_ERROR',title:'Audio stream reported errors',detail:(payload.streamErrors||[]).join('; '),severity:'review',confidence:1,possibleCauses:['device/driver interruption','buffer scheduling issue'],isolationTests:['repeat capture','check device connection and driver']}]:[];
    await finalizeAnalysis(audio,`Native capture · ${payload.deviceName||'audio input'}`,quality);
  }catch(error){showToast(`Capture failed: ${error}`);}
  finally{button.disabled=false;button.innerHTML='Capture & analyze';}
}
function downloadText(filename,text,type='text/plain'){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportWorkspace(){downloadText('deckchek-workspace.json',serializeWorkspaceJson({equipment,runs}),'application/json');showToast('Workspace exported.');}
async function importWorkspaceFile(file){try{const data=parseWorkspaceJson(await file.text());equipment=data.equipment;runs=data.runs;selectedRunId=runs[0]?.id??null;saveWorkspace();renderEquipment();renderResults();showToast(`Imported ${equipment.length} equipment record(s) and ${runs.length} run(s).`);}catch(error){showToast(`Import failed: ${error.message}`);}}
function exportCsv(){const run=runs.find(x=>x.id===selectedRunId)||runs[0];if(!run){showToast('Run a diagnostic before exporting CSV.');return;}downloadText(`deckchek-${run.id}.csv`,measurementsToCsv(run.measurements),'text/csv');showToast('Measurement CSV exported.');}
function compareLatest(){const a=runs[0];if(!a){showToast('At least two compatible runs are required.');return;}const b=runs.slice(1).find(x=>x.test===a.test);if(!b){showToast(`No earlier ${a.test} run is available for comparison.`);return;}const deltas=compareRuns(b,a);if(!deltas.length){showToast('The two runs have no directly comparable numeric measurements.');return;}const measurements=deltas.map(d=>normalizeMeasurement({metricId:`delta_${d.metricId}`,label:`Δ ${d.label||d.metricId}`,value:d.delta,unit:d.unit,origin:'inferred',confidence:1}));const html=buildHtmlReport({title:`DeckChek Comparison — ${a.test}`,device:`${b.device} → ${a.device}`,measurements,findings:[],notes:`Earlier: ${b.createdAt}. Later: ${a.createdAt}. Only identical metric IDs and units are compared.`});downloadText(`deckchek-comparison-${a.test.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.html`,html,'text/html');showToast(`Compared ${deltas.length} compatible metric(s).`);}
function exportRun(){const run=runs.find(x=>x.id===selectedRunId)||runs[0];if(!run){showToast('Run a diagnostic before exporting.');return;}const html=buildHtmlReport({title:`DeckChek — ${run.test}`,device:run.device,createdAt:run.createdAt,measurements:run.measurements,findings:run.findings,notes:`Source: ${run.sourceFile}; ${run.sampleRate} Hz; ${run.channels} channel(s).`});const blob=new Blob([html],{type:'text/html'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`deckchek-${run.test.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${run.id}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function addEquipment(){const name=prompt('Equipment name/model');if(!name?.trim())return;const kind=prompt('Category (Turntable, Media player, Controller, Mixer, Audio interface)','Turntable')||'Other';const chain=prompt('Signal chain / notes','')||'';equipment.push({id:uid('eq'),name:name.trim(),kind:kind.trim(),chain:chain.trim(),tested:'Not tested',status:'Unverified'});saveWorkspace();renderEquipment();showToast('Equipment added locally.');}
function generateReferenceTone(){const hz=1000,sampleRate=48000;const tone=generateSine({frequencyHz:hz,sampleRate,durationSec:10,amplitude:.35});const wav=encodeWav16({left:tone,right:tone,sampleRate});const blob=new Blob([wav],{type:'audio/wav'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='deckchek-1000hz-reference-10s.wav';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Generated 10 s stereo 1 kHz reference WAV.');}
async function enumerateAudio(){const select=document.getElementById('input-device');
  try{
    const native=await invokeNative('list_native_audio_inputs');
    if(Array.isArray(native)){
      select.dataset.backend='native';select.innerHTML='<option value="">Default native input</option>'+native.map(d=>`<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}${d.isDefault?' · default':''}</option>`).join('');
      showToast(`${native.length} native audio input(s) detected.`);return;
    }
  }catch(error){showToast(`Native enumeration failed: ${error}`);}
  try{const devices=await navigator.mediaDevices?.enumerateDevices?.();const inputs=(devices||[]).filter(d=>d.kind==='audioinput');select.dataset.backend='web';select.innerHTML='<option value="">No live capture selected</option>'+inputs.map((d,i)=>`<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label||`Audio input ${i+1}`)}</option>`).join('');showToast(`${inputs.length} browser audio input(s) detected. Desktop native capture requires Tauri.`);}catch(error){showToast(`Device enumeration unavailable: ${error.message}`);}
}

loadWorkspace();renderEquipment();renderResults();initializeNativePersistence();
document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>go(button.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(button=>button.addEventListener('click',()=>go(button.dataset.goto)));
document.getElementById('equipment-search')?.addEventListener('input',event=>renderEquipment(event.target.value));
document.querySelectorAll('[data-test]').forEach(button=>button.addEventListener('click',()=>openTest(button.dataset.test)));
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('selected',item===button));document.querySelectorAll('.test-card').forEach(card=>card.classList.toggle('hidden',button.dataset.filter!=='all'&&card.dataset.kind!==button.dataset.filter));}));
document.querySelectorAll('.notice-close').forEach(button=>button.addEventListener('click',()=>button.closest('.notice').remove()));
const backdrop=document.getElementById('modal-backdrop');document.getElementById('modal-close').addEventListener('click',()=>backdrop.classList.add('hidden'));document.getElementById('modal-cancel').addEventListener('click',()=>backdrop.classList.add('hidden'));backdrop.addEventListener('click',event=>{if(event.target===backdrop)backdrop.classList.add('hidden');});document.getElementById('modal-run').addEventListener('click',runSelectedTest);document.getElementById('modal-capture')?.addEventListener('click',runLiveCapture);document.getElementById('add-equipment').addEventListener('click',addEquipment);document.querySelector('.add-equipment')?.addEventListener('click',addEquipment);document.getElementById('calibrate').addEventListener('click',enumerateAudio);document.getElementById('generate-tone')?.addEventListener('click',generateReferenceTone);document.getElementById('export-results').addEventListener('click',exportRun);
document.getElementById('export-csv')?.addEventListener('click',exportCsv);
document.getElementById('compare-results')?.addEventListener('click',compareLatest);
document.getElementById('export-workspace')?.addEventListener('click',exportWorkspace);
document.getElementById('import-workspace')?.addEventListener('click',()=>document.getElementById('workspace-import')?.click());
document.getElementById('workspace-import')?.addEventListener('change',event=>{const file=event.target.files?.[0];if(file)importWorkspaceFile(file);event.target.value='';});document.addEventListener('keydown',event=>{if(event.key==='Escape')backdrop.classList.add('hidden');});
