import {
  analyzeVinylSide, buildHtmlReport, lowBandEnergyDb, normalizeMeasurement,
  quickDiagnostic, scopeMetrics, speedFromReferenceTone
} from './core.js';

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
    measurements.push(normalizeMeasurement({metricId:'measured_frequency_hz',label:'Measured reference frequency',value:s.measuredHz,unit:'Hz',confidence:.9}),normalizeMeasurement({metricId:'rpm',label:'Estimated platter speed',value:s.rpm,unit:'RPM',confidence:.85}),normalizeMeasurement({metricId:'pitch_percent',label:'Speed/pitch error',value:s.pitchPercent,unit:'%',confidence:.85}));
    if(Math.abs(s.pitchPercent)>.3)findings.push({code:'SPEED_ERROR',title:'Speed differs from reference',detail:`Estimated speed error ${s.pitchPercent.toFixed(3)}%.`,severity:Math.abs(s.pitchPercent)>1?'warning':'review',confidence:.85,possibleCauses:['pitch calibration','reference-tone mismatch','platter speed error'],isolationTests:['confirm test-record reference frequency','repeat after warm-up','compare quartz-lock position']});
    score=scoreFromFindings(findings);
  }else if(test==='DVS signal'){
    const s=scopeMetrics(audio.left,audio.right);measurements.push(normalizeMeasurement({metricId:'dvs_scope_circularity',label:'Generic scope circularity',value:s.circularity,unit:'ratio',confidence:.9}),normalizeMeasurement({metricId:'dvs_scope_correlation',label:'Generic scope correlation',value:s.correlation,unit:'ratio',confidence:.9}));
    if(s.circularity<.45)findings.push({code:'DVS_SCOPE_DEFORMED',title:'Generic DVS scope is strongly asymmetric',detail:`Circularity metric ${s.circularity.toFixed(3)}.`,severity:'review',confidence:.75,possibleCauses:['channel imbalance','phase relationship','tracking or wear','unsupported control signal'],isolationTests:['verify both channels','repeat with known-good control media','use vendor decoder when implemented']});score=scoreFromFindings(findings);
  }else if(test==='Vibration check'){
    const low=lowBandEnergyDb(audio.left,audio.sampleRate,80);measurements.push(normalizeMeasurement({metricId:'low_frequency_energy_dbfs',label:'Low-frequency energy proxy',value:low,unit:'dBFS',confidence:.7}));if(low>-35)findings.push({code:'LOW_FREQUENCY_ENERGY',title:'Elevated low-frequency energy',detail:`Low-band proxy measured ${low.toFixed(1)} dBFS.`,severity:'review',confidence:.65,possibleCauses:['booth vibration','acoustic feedback','record warp','handling/footfall'],isolationTests:['capture quiet baseline','repeat with monitors muted','compare isolation treatment']});score=scoreFromFindings(findings);
  }else if(test==='Vinyl side scan'){
    const v=analyzeVinylSide(audio);measurements.push(normalizeMeasurement({metricId:'vinyl_transients_per_min',label:'Transient events per minute',value:v.transientDensityPerMin,unit:'events/min',confidence:.72}),normalizeMeasurement({metricId:'vinyl_rumble_dbfs',label:'Subsonic/rumble proxy',value:v.rumbleDb,unit:'dBFS',confidence:.65}),normalizeMeasurement({metricId:'vinyl_condition_score',label:'Condition score',value:v.conditionScore,unit:'/100',confidence:.6}));if(v.events.length)findings.push({code:'VINYL_TRANSIENTS',title:`${v.events.length} transient candidates detected`,detail:'Transient candidates are evidence only; clicks, dust, scratches, cueing and musical attacks require confirmation.',severity:v.conditionScore<65?'warning':'review',confidence:.65,possibleCauses:['surface contamination','scratch or groove damage','musical transient','static discharge'],isolationTests:['repeat scan','clean record and compare','check recurrence at platter period']});if(v.recurrence.confidence>.7)findings.push({code:'REPEATING_EVENT',title:'Repeating event pattern detected',detail:`Candidate recurrence period ${v.recurrence.periodSec?.toFixed(3)} s.`,severity:'review',confidence:v.recurrence.confidence,possibleCauses:['repeating scratch','locked/repeating groove','periodic mechanical event'],isolationTests:['repeat scan from same side','compare event position by revolution']});score=v.conditionScore;
  }
  return {measurements,findings,score};
}

function openTest(name){currentTest=name;document.getElementById('modal-title').textContent=name;document.getElementById('modal-copy').textContent='Choose equipment and an audio file. DeckChek will analyze the file locally and save the evidence record on this device.';const select=document.getElementById('modal-deck');select.innerHTML=equipment.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');document.getElementById('analysis-file').value='';document.getElementById('speed-fields')?.classList.toggle('hidden',name!=='Speed & pitch');document.getElementById('modal-backdrop').classList.remove('hidden');}
async function runSelectedTest(){
  const file=document.getElementById('analysis-file').files?.[0];if(!file){showToast('Select an audio file first.');return;}
  const button=document.getElementById('modal-run');button.disabled=true;button.textContent='Analyzing…';
  try{
    const audio=await decodeAudio(file);const result=analyzeForTest(currentTest,audio);const device=equipment.find(x=>x.id===document.getElementById('modal-deck').value)||equipment[0];
    const run={id:uid('run'),deviceId:device?.id||null,device:device?.name||'Unassigned',test:currentTest,createdAt:new Date().toISOString(),sourceFile:file.name,durationSec:audio.durationSec,sampleRate:audio.sampleRate,channels:audio.channels,measurements:result.measurements,findings:result.findings,score:result.score};runs.unshift(run);selectedRunId=run.id;if(device){device.tested=new Date().toLocaleDateString();device.status=result.score>=85?'Good':'Review';}saveWorkspace();renderEquipment(document.getElementById('equipment-search').value);renderResults();document.getElementById('modal-backdrop').classList.add('hidden');go('results');showToast(`${currentTest} complete · ${result.measurements.length} measurements · ${result.findings.length} findings`);
  }catch(error){showToast(`Analysis failed: ${error.message}`);}finally{button.disabled=false;button.innerHTML='Analyze file <span>→</span>';}
}
function exportRun(){const run=runs.find(x=>x.id===selectedRunId)||runs[0];if(!run){showToast('Run a diagnostic before exporting.');return;}const html=buildHtmlReport({title:`DeckChek — ${run.test}`,device:run.device,createdAt:run.createdAt,measurements:run.measurements,findings:run.findings,notes:`Source: ${run.sourceFile}; ${run.sampleRate} Hz; ${run.channels} channel(s).`});const blob=new Blob([html],{type:'text/html'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`deckchek-${run.test.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${run.id}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function addEquipment(){const name=prompt('Equipment name/model');if(!name?.trim())return;const kind=prompt('Category (Turntable, Media player, Controller, Mixer, Audio interface)','Turntable')||'Other';const chain=prompt('Signal chain / notes','')||'';equipment.push({id:uid('eq'),name:name.trim(),kind:kind.trim(),chain:chain.trim(),tested:'Not tested',status:'Unverified'});saveWorkspace();renderEquipment();showToast('Equipment added locally.');}
async function enumerateAudio(){const select=document.getElementById('input-device');try{const devices=await navigator.mediaDevices?.enumerateDevices?.();const inputs=(devices||[]).filter(d=>d.kind==='audioinput');select.innerHTML='<option value="">No live capture selected</option>'+inputs.map((d,i)=>`<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label||`Audio input ${i+1}`)}</option>`).join('');showToast(`${inputs.length} audio input(s) detected. Live capture remains a later native adapter.`);}catch(error){showToast(`Device enumeration unavailable: ${error.message}`);}}

loadWorkspace();renderEquipment();renderResults();
document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>go(button.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(button=>button.addEventListener('click',()=>go(button.dataset.goto)));
document.getElementById('equipment-search')?.addEventListener('input',event=>renderEquipment(event.target.value));
document.querySelectorAll('[data-test]').forEach(button=>button.addEventListener('click',()=>openTest(button.dataset.test)));
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('selected',item===button));document.querySelectorAll('.test-card').forEach(card=>card.classList.toggle('hidden',button.dataset.filter!=='all'&&card.dataset.kind!==button.dataset.filter));}));
document.querySelectorAll('.notice-close').forEach(button=>button.addEventListener('click',()=>button.closest('.notice').remove()));
const backdrop=document.getElementById('modal-backdrop');document.getElementById('modal-close').addEventListener('click',()=>backdrop.classList.add('hidden'));document.getElementById('modal-cancel').addEventListener('click',()=>backdrop.classList.add('hidden'));backdrop.addEventListener('click',event=>{if(event.target===backdrop)backdrop.classList.add('hidden');});document.getElementById('modal-run').addEventListener('click',runSelectedTest);document.getElementById('add-equipment').addEventListener('click',addEquipment);document.querySelector('.add-equipment')?.addEventListener('click',addEquipment);document.getElementById('calibrate').addEventListener('click',enumerateAudio);document.getElementById('export-results').addEventListener('click',exportRun);document.addEventListener('keydown',event=>{if(event.key==='Escape')backdrop.classList.add('hidden');});
